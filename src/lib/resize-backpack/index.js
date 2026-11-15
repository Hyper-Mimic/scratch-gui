/**
 * "Allow changing the height of the backpack" (HyperMimic setting `backpackResize`).
 *
 * The editor's left column is a flex column: [tabs][backpack]. The tabs grow to fill whatever is
 * left, while the backpack is only as tall as its own list (backpack.css gives the list a
 * `min-height: 5.5rem`). This puts a drag strip along the backpack's top edge and drives the
 * list's `height` from it, so making the backpack taller takes the room from the tabs above.
 *
 * The strip is the first child of `.backpack-container`, i.e. above `.backpack-header`: the
 * divider belongs between the tabs and the whole backpack, not between the header and the item
 * list. It is absolutely positioned at `top: 1px` inside the container, so it takes no layout
 * space and reads as an accent line across the header's top edge. A collapsed backpack has no
 * list to resize, so `:has()` hides the strip while collapsed.
 *
 * Two layout rules are injected while the setting is on:
 *   - the backpack container stops shrinking. Both it and the tabs have `flex-shrink: 1`, so
 *     without this the column would hand part of every pixel the drag adds straight back;
 *   - the tabs get `min-height: 0`, so they can actually be compressed below their content.
 * Both are marked with plain classes from JS, so nothing depends on a CSS Modules hash.
 *
 * The strip is the same one the stage column, the block palette and the asset list use -- same
 * accent colour, same fade -- so the dividers read as one control. Only its axis is different.
 *
 * The height is not persisted: it survives a GUI remount (the value is kept in this module) but
 * a reload goes back to the GUI's own height. Removing every inline height on teardown also
 * hands the backpack back to addons such as `expanded-backpack`, which size the same list by CSS.
 */

import {getSetting, onSettingsChange, SETTING_BACKPACK_RESIZE} from '../hypermimic-settings.js';

const RESIZE_HANDLE_HEIGHT = 6;
// 5.5rem at a 16px root: the GUI's own backpack height (backpack.css `.backpack-list`).
const FALLBACK_LIST_HEIGHT = 88;
// What has to stay usable above the backpack: the tab strip plus a workable editor/canvas.
const MIN_TABS_HEIGHT = 160;
// A second ceiling, as a share of the column: on a short window the fixed floor above would
// otherwise let the backpack take almost all of the editor.
const MAX_COLUMN_RATIO = 0.5;
const STYLE_ID = 'hm-resize-backpack';
// Only while the setting is on, so none of the layout overrides reach the stock GUI.
const ROOT_CLASS = 'hm-resize-backpack';
const CONTAINER_MARKER = 'hm-resize-backpack-container';
const TABS_MARKER = 'hm-resize-backpack-tabs';
const HANDLE_CLASS = 'hm-backpack-height-handle';
const DRAGGING_CLASS = 'hm-backpack-height-handle--dragging';
// CSS Modules keeps the file-local name as a substring of the hashed class
// (backpack_backpack-container_1a2b3), which is sturdier than a hash nobody can predict.
const BACKPACK_SELECTOR = '[class*="backpack_backpack-container_"]';
const COLLAPSE_SELECTOR = '[class*="backpack_backpack-collapse_"]';
const COLLAPSE_HIDDEN_SELECTOR = '[class*="backpack_backpack-collapse-hidden_"]';
const LIST_SELECTOR = '[class*="backpack_backpack-list_"]';
// The flex column that holds both the tabs and the backpack (gui.css `.editor-wrapper`).
const COLUMN_SELECTOR = '[class*="editor-wrapper"]';
const MAX_WAIT_FRAMES = 600; // ~10s of frames before switching to the timer below
const RETRY_INTERVAL_MS = 500;

let active = false;
let dragState = null;
// The height the user last dragged to, kept for the session so a remounted backpack comes back
// at the same size. 0 means "the GUI's own height".
let savedHeight = 0;
let waitFrames = 0;
let refreshFrame = 0;
let columnObserver = null;
let retryTimer = 0;
let windowResizeTimer = 0;

const injectStyle = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
        // The tabs are the flexible half of the column; the backpack keeps every pixel the
        // drag gives it. `min-height: 0` lets the tabs compress below their content instead
        // of pushing the column past the window.
        `html.${ROOT_CLASS} .${CONTAINER_MARKER}{flex-shrink:0;}` +
        `html.${ROOT_CLASS} .${TABS_MARKER}{min-height:0;}` +
        // Sits just inside the container's top edge: zero layout cost, reads as an accent
        // line on the header. A collapsed backpack has no list to resize: hide strip + hit area.
        `html.${ROOT_CLASS} ${BACKPACK_SELECTOR}:has(${COLLAPSE_HIDDEN_SELECTOR}) ` +
        `.${HANDLE_CLASS}{display:none;}` +
        `.${HANDLE_CLASS}{position:absolute;top:1px;left:0;right:0;` +
        `height:${RESIZE_HANDLE_HEIGHT}px;z-index:60;cursor:ns-resize;` +
        'background-color:var(--looks-secondary);opacity:0;' +
        'transition:opacity 400ms ease;' +
        // Touch: keep the gesture for the strip instead of letting the browser scroll the
        // backpack list (which also cancels the drag), and keep a long press from selecting
        // a thumbnail's label.
        'touch-action:none;user-select:none;-webkit-user-select:none;' +
        '-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;}' +
        `.${HANDLE_CLASS}:hover,.${HANDLE_CLASS}.${DRAGGING_CLASS}{opacity:1;}` +
        // A finger needs a bigger target than a pointer, and growing the element itself would
        // thicken the visible line: this invisible child only extends the hit area. The faint
        // resting opacity is for touchscreens, which have no hover to reveal the strip.
        `@media (any-pointer: coarse){.${HANDLE_CLASS}{opacity:0.3;}` +
        // Grow the touch target upwards only: a downward overhang would swallow taps on the
        // header (which folds the backpack). Once a gesture starts, pointermove is on
        // `document` anyway.
        `.${HANDLE_CLASS}::before{content:'';position:absolute;` +
        'top:-5px;bottom:0;left:0;right:0;}}';
    document.head.appendChild(style);
};

const getColumn = () => document.querySelector(COLUMN_SELECTOR);
const getContainer = () => document.querySelector(BACKPACK_SELECTOR);

/**
 * The height the GUI (or an addon) gives the list, which is the floor for the drag: making the
 * backpack shorter than that would only clip its items. Cached the first time it is measured
 * unmodified -- after the first drag the inline height is this module's own, so it cannot be
 * read back from the layout. While the backpack is collapsed the box measures 0, so the CSS
 * `min-height` is used instead (it resolves rem to px even for a hidden box).
 * @param {Element} list the backpack list
 * @returns {number} height in px
 */
const getDefaultHeight = list => {
    const stored = parseFloat(list.dataset.hmDefaultHeight);
    if (Number.isFinite(stored) && stored > 0) return stored;
    if (!list.style.height) {
        const measured = list.getBoundingClientRect().height;
        if (measured > 0) {
            list.dataset.hmDefaultHeight = String(measured);
            return measured;
        }
        const minHeight = parseFloat(window.getComputedStyle(list).minHeight);
        if (Number.isFinite(minHeight) && minHeight > 0) return minHeight;
    }
    return FALLBACK_LIST_HEIGHT;
};

/**
 * The tallest the list may get. The column's own height is the hard ceiling: the backpack can
 * only grow by as much as the tabs above it can give up, and those have to keep a usable size
 * (both an absolute floor and a share of the column). The smaller ceiling wins.
 * 0 means "cannot be measured right now" (the GUI is behind the loader, or the backpack has
 * never been laid out). Callers must leave the stored height alone in that case rather than
 * clamp it to the floor.
 * @param {Element} list the backpack list
 * @returns {number} height in px
 */
const getMaxHeight = list => {
    const container = getContainer();
    const column = getColumn() || (container && container.parentElement);
    if (!column || !container) return 0;
    const columnHeight = column.getBoundingClientRect().height;
    if (!columnHeight) return 0;
    // Everything in the backpack that is not the list: the header, its margin and the
    // optional multi-select bar. The resize strip is absolutely positioned, so it is not
    // part of this. Subtracting the rest turns a column height into a list height.
    const chrome = Math.max(0, container.getBoundingClientRect().height - list.getBoundingClientRect().height);
    const byTabs = columnHeight - chrome - MIN_TABS_HEIGHT;
    const byRatio = columnHeight * MAX_COLUMN_RATIO - chrome;
    return Math.max(getDefaultHeight(list), Math.min(byTabs, byRatio));
};

/** Keep a previously chosen height inside the current window after it shrinks. */
const clampStoredHeight = list => {
    if (!list.style.height) return;
    const height = parseFloat(list.style.height);
    if (!Number.isFinite(height)) return;
    const max = getMaxHeight(list);
    if (!max) return;
    const clamped = Math.round(Math.max(getDefaultHeight(list), Math.min(max, height)));
    if (clamped !== height) {
        list.style.height = `${clamped}px`;
        savedHeight = clamped;
    }
};

// The tabs above the backpack hold the paint editor, whose paper.js canvas only re-measures on
// a window resize. While the divider moves it has to be told, or its bitmap stays at the old
// height. Throttled: that re-measure costs far more than writing the list's height does.
const dispatchWindowResize = () => window.dispatchEvent(new Event('resize'));
const scheduleWindowResize = () => {
    if (windowResizeTimer) return;
    windowResizeTimer = window.setTimeout(() => {
        windowResizeTimer = 0;
        dispatchWindowResize();
    }, 150);
};

const onHandleMouseDown = e => {
    if (e.button !== 0 || !active) return;
    const handle = e.currentTarget;
    const container = handle && handle.parentElement;
    const list = container && container.querySelector(LIST_SELECTOR);
    if (!list) return;
    // Mouse only: preventing the default on a touch pointer would also drop the compatibility
    // events the double-tap reset listens for, and `touch-action: none` already keeps the page
    // from scrolling under the drag.
    if (e.pointerType !== 'touch') e.preventDefault();
    e.stopPropagation();
    // Both numbers are needed once per gesture only; the drag itself just subtracts the
    // pointer's vertical delta. The strip is the backpack's *top* edge, so dragging it up
    // makes the backpack taller.
    dragState = {
        list,
        handle,
        startY: e.clientY,
        startHeight: list.getBoundingClientRect().height,
        min: getDefaultHeight(list),
        max: getMaxHeight(list)
    };
    handle.classList.add(DRAGGING_CLASS);
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('pointermove', onHandleMouseMove, false);
    document.addEventListener('pointerup', onHandleMouseUp, false);
    document.addEventListener('pointercancel', onHandleMouseUp, false);
    window.addEventListener('blur', onHandleMouseUp, false);
};

const onHandleMouseMove = e => {
    if (!dragState) return;
    // A mouseup outside the window never reaches us; the button mask on the next move is a
    // dependable "the drag is over" signal.
    if (typeof e.buttons === 'number' && (e.buttons & 1) === 0) {
        onHandleMouseUp();
        return;
    }
    const {list, startY, startHeight, min, max} = dragState;
    if (!list.isConnected) {
        onHandleMouseUp();
        return;
    }
    const wanted = startHeight - (e.clientY - startY);
    const height = Math.round(Math.max(min, Math.min(max, wanted)));
    savedHeight = height;
    list.style.height = `${height}px`;
    scheduleWindowResize();
};

const onHandleMouseUp = () => {
    const state = dragState;
    dragState = null;
    if (state) state.handle.classList.remove(DRAGGING_CLASS);
    if (document.body) document.body.style.cursor = '';
    document.removeEventListener('pointermove', onHandleMouseMove, false);
    document.removeEventListener('pointerup', onHandleMouseUp, false);
    document.removeEventListener('pointercancel', onHandleMouseUp, false);
    window.removeEventListener('blur', onHandleMouseUp, false);
    if (windowResizeTimer) {
        clearTimeout(windowResizeTimer);
        windowResizeTimer = 0;
    }
    // One last pass so the editors above are right for the height the drag ended on, even if
    // it was too short for the throttle above to fire.
    if (state) dispatchWindowResize();
};

const onHandleDoubleClick = e => {
    e.preventDefault();
    e.stopPropagation();
    const container = e.currentTarget && e.currentTarget.parentElement;
    const list = container && container.querySelector(LIST_SELECTOR);
    if (!list) return;
    // Back to the GUI's own height rather than a hard-coded number, so a theme or addon that
    // changes the default still wins. The remembered height goes too.
    savedHeight = 0;
    list.style.height = '';
    dispatchWindowResize();
};

/** The handle is inserted ahead of `.backpack-header`, which is the container's first child. */
const mountHandle = container => {
    if (container.querySelector(`:scope > .${HANDLE_CLASS}`)) return false;
    const handle = document.createElement('div');
    handle.className = HANDLE_CLASS;
    handle.addEventListener('pointerdown', onHandleMouseDown);
    handle.addEventListener('dblclick', onHandleDoubleClick);
    container.insertBefore(handle, container.firstChild);
    return true;
};

/** Mark the two flex items whose shrink behaviour has to change. Safe to call every pass. */
const markLayout = container => {
    container.classList.add(CONTAINER_MARKER);
    const column = getColumn() || container.parentElement;
    if (!column) return;
    for (const child of column.children) {
        if (child !== container) child.classList.add(TABS_MARKER);
    }
};

const clearMarkers = () => {
    for (const el of document.querySelectorAll(`.${CONTAINER_MARKER}`)) {
        el.classList.remove(CONTAINER_MARKER);
    }
    for (const el of document.querySelectorAll(`.${TABS_MARKER}`)) {
        el.classList.remove(TABS_MARKER);
    }
};

const disconnectColumnObserver = () => {
    if (!columnObserver) return;
    columnObserver.disconnect();
    columnObserver = null;
};

const unmount = () => {
    if (dragState) onHandleMouseUp();
    disconnectColumnObserver();
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = 0;
    }
    if (refreshFrame) {
        cancelAnimationFrame(refreshFrame);
        refreshFrame = 0;
    }
    for (const handle of document.querySelectorAll(`.${HANDLE_CLASS}`)) handle.remove();
    for (const list of document.querySelectorAll(LIST_SELECTOR)) {
        if (list.style.height) list.style.height = '';
    }
    clearMarkers();
    // Turning the setting off forgets the height as well, so turning it back on starts from
    // the GUI's own layout rather than from a size nothing on screen explains.
    savedHeight = 0;
};

/**
 * Watch the editor column for the backpack being mounted or replaced (a backpack host change
 * unmounts the whole component). The two panes are direct children, so watching childList on
 * that one node is enough -- no subtree and no interest in the workspace.
 */
const ensureColumnObserver = () => {
    if (columnObserver) return;
    const column = getColumn();
    if (!column) return;
    columnObserver = new MutationObserver(scheduleRefresh);
    columnObserver.observe(column, {childList: true});
};

/** The GUI is not in the document yet -- still behind the loader, or a project is loading. */
const scheduleRetry = () => {
    if (retryTimer) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        refresh();
    }, RETRY_INTERVAL_MS);
};

/**
 * Bring the backpack in line with the setting: one strip, layout markers, and a stored height
 * that still fits the window. Runs when the setting is turned on, on a window resize, and
 * whenever the editor column's children change.
 */
const refresh = () => {
    if (!active) return;
    const container = getContainer();
    const collapse = container && container.querySelector(COLLAPSE_SELECTOR);
    const list = container && container.querySelector(LIST_SELECTOR);
    if (!container || !collapse || !list) {
        // With the column under observation the next mount is what brings a backpack, so
        // polling is only for the stretch before the GUI has rendered anything at all.
        ensureColumnObserver();
        if (columnObserver) return;
        if (++waitFrames > MAX_WAIT_FRAMES) {
            scheduleRetry();
            return;
        }
        window.requestAnimationFrame(refresh);
        return;
    }
    waitFrames = 0;
    ensureColumnObserver();
    markLayout(container);
    mountHandle(container);
    // Records the GUI's own height the first time the list is seen on screen.
    getDefaultHeight(list);
    // A list that has just been created (project load, backpack host change) comes back at the
    // height the user left it at, rather than at the GUI's default.
    if (!list.style.height && savedHeight) list.style.height = `${savedHeight}px`;
    clampStoredHeight(list);
};

const scheduleRefresh = () => {
    if (refreshFrame) return;
    refreshFrame = window.requestAnimationFrame(() => {
        refreshFrame = 0;
        refresh();
    });
};

const applySetting = isActive => {
    if (typeof document === 'undefined') return;
    active = isActive;
    injectStyle();
    document.documentElement.classList.toggle(ROOT_CLASS, !!isActive);
    if (isActive) {
        waitFrames = 0;
        refresh();
        window.addEventListener('resize', scheduleRefresh);
    } else {
        window.removeEventListener('resize', scheduleRefresh);
        unmount();
    }
};

/**
 * Applies the saved value and keeps it in sync from then on.
 * Safe to call once, when the editor interface comes up.
 */
const initResizeBackpack = () => {
    if (typeof window === 'undefined') return;
    applySetting(!!getSetting(SETTING_BACKPACK_RESIZE));
    onSettingsChange((key, value) => {
        if (key === SETTING_BACKPACK_RESIZE) applySetting(!!value);
    });
};

export {initResizeBackpack};
