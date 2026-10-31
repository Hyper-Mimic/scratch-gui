/**
 * "Allow changing the width of the costume and sound list" (HyperMimic setting
 * `selectorResize`).
 *
 * The costume and sound tabs are laid out as [list of assets][asset editor]: the list is a
 * flex item with a fixed `width: 150px` (components/asset-panel/selector.css) and the editor takes
 * the rest. This puts a drag strip on the divider between the two and drives that width from it,
 * so the editor gives up (or takes back) the room.
 *
 * Everything is DOM work: unlike the block palette there is no Blockly layout behind this list,
 * the row is plain flexbox, so writing `width` on the list is all it takes and the thumbnails
 * reflow on their own.
 *
 * The strip is the same one the stage column and the block palette use -- same width, same accent
 * colour, same fade -- so the three dividers read as one control.
 */

import {getSetting, onSettingsChange, SETTING_SELECTOR_RESIZE} from '../hypermimic-settings.js';

// The strip. Matches lib/resize-stage's handle so the two borders feel the same.
const RESIZE_HANDLE_WIDTH = 6;
// Used only when the GUI's own width cannot be measured yet (the tab has never been shown).
const FALLBACK_LIST_WIDTH = 150;
// What has to stay usable for the asset editor next to the list.
const MIN_EDITOR_WIDTH = 220;
// Ceiling as a share of the window: a list wider than this stops being a list and becomes the
// editor's replacement, however wide the window happens to be.
const MAX_VIEWPORT_RATIO = 0.45;
const STYLE_ID = 'hm-resize-selector';
// Only while the setting is on, so none of this reaches the stock GUI.
const ROOT_CLASS = 'hm-resize-selector';
const HANDLE_CLASS = 'hm-selector-column-handle';
const DRAGGING_CLASS = 'hm-selector-column-handle--dragging';
// CSS Modules keeps the file-local name as a substring of the hashed class
// (selector_wrapper_1a2b3), which is sturdier than a hash nobody can predict.
const SELECTOR_SELECTOR = '[class*="selector_wrapper_"]';
// The pane that holds the list and the editor; it is what the ceiling is measured against.
const PANEL_SELECTOR = '[class*="asset-panel_wrapper_"]';
// The editor's own tab panels (gui.css `.tab-panel`). They are rendered up front -- the Tabs
// element is `forceRenderTabPanel` -- but their *contents* are not: gui.jsx only mounts CostumeTab
// while the costume tab is selected (same for SoundTab). So these three nodes are exactly where a
// list appears and disappears.
const TAB_PANEL_SELECTOR = '[class*="gui_tab-panel"]';
const MAX_WAIT_FRAMES = 600; // ~10s of frames before switching to the timer below
const RETRY_INTERVAL_MS = 500;

let active = false;
let dragState = null;
// The width the user last dragged to, kept in memory for the session -- the same idea as the block
// palette's saved width. The costume and sound tabs are two separate lists and both are rebuilt
// when a project loads, so a value living only in one element's `style` would be lost; a reload
// starts from the GUI's own width again, since nothing here is persisted.
let savedWidth = 0;
let waitFrames = 0;
let refreshFrame = 0;
let tabObserver = null;
let retryTimer = 0;

const injectStyle = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
        // The strip is positioned against the list, which is `position: relative` already in
        // selector.css, but say it here too so the module does not depend on that staying true.
        `html.${ROOT_CLASS} ${SELECTOR_SELECTOR}{position:relative;}` +
        // A flex item is floored by its contents unless told otherwise, which would stop the
        // editor from shrinking as the list grows -- it would overflow instead.
        `html.${ROOT_CLASS} [class*="asset-panel_detail-area_"]{min-width:0;}` +
        `.${HANDLE_CLASS}{position:absolute;top:0;bottom:0;width:${RESIZE_HANDLE_WIDTH}px;` +
        'z-index:60;cursor:ew-resize;background-color:var(--looks-secondary);' +
        'opacity:0;transition:opacity 400ms ease;' +
        // Touch: keep the gesture for the strip instead of letting the browser scroll the asset
        // list (which also cancels the drag), and keep a long press from selecting a thumbnail.
        'touch-action:none;user-select:none;-webkit-user-select:none;' +
        '-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;' +
        // Straddle the divider: half the strip on the list, half on the editor's border. Logical
        // property, so the right side of the list in LTR and the left one in RTL.
        'inset-inline-end:-3px;}' +
        `.${HANDLE_CLASS}:hover,.${HANDLE_CLASS}.${DRAGGING_CLASS}{opacity:1;}` +
        // A finger needs a bigger target than a pointer, and widening the element itself would
        // widen the visible line: this invisible child only grows the hit area (11px each side).
        // The faint resting opacity is for touchscreens, which have no hover to reveal the strip.
        `@media (any-pointer: coarse){.${HANDLE_CLASS}{opacity:0.3;}` +
        `.${HANDLE_CLASS}::before{content:'';position:absolute;` +
        'top:0;bottom:0;left:-11px;right:-11px;}}';
    document.head.appendChild(style);
};

/**
 * Every asset list that is part of an asset panel, i.e. one per costume / sound tab.
 * @returns {Element[]}
 */
const getLists = () => {
    const lists = [];
    for (const list of document.querySelectorAll(SELECTOR_SELECTOR)) {
        if (list.closest(PANEL_SELECTOR)) lists.push(list);
    }
    return lists;
};

const getPanelWidth = list => {
    const panel = list.closest(PANEL_SELECTOR);
    return panel ? panel.getBoundingClientRect().width : 0;
};

/**
 * The width the GUI itself gives the list, which is the floor for the drag: narrowing it below
 * that is never what the divider is for. Cached on the element the first time it is seen
 * unmodified -- after the first drag the inline width is this module's own, so it can no longer be
 * read back from the layout.
 * @param {Element} list
 * @returns {number}
 */
const getDefaultWidth = list => {
    const stored = parseFloat(list.dataset.hmDefaultWidth);
    if (Number.isFinite(stored) && stored > 0) return stored;
    if (!list.style.width) {
        const measured = list.getBoundingClientRect().width;
        if (measured > 0) {
            list.dataset.hmDefaultWidth = String(measured);
            return measured;
        }
    }
    return FALLBACK_LIST_WIDTH;
};

const getMaxWidth = list => {
    const panelWidth = getPanelWidth(list);
    // 0 means "cannot be measured right now" -- the tab panel is hidden, or the GUI is not laid
    // out yet. Callers must leave the stored width alone in that case rather than clamp it to the
    // floor, which is what made a widened list snap back after switching tabs.
    if (!panelWidth) return 0;
    const min = getDefaultWidth(list);
    // Two ceilings, smaller wins: the editor has to keep a usable width, and the list should not
    // grow past a share of the window just because the window is large.
    const byEditor = panelWidth - MIN_EDITOR_WIDTH;
    const byViewport = Math.round(window.innerWidth * MAX_VIEWPORT_RATIO);
    return Math.max(min, Math.min(byEditor, byViewport));
};

/**
 * Keep a previously chosen width inside the current window: a width picked on a wide window would
 * otherwise leave the editor with nothing when the window shrinks.
 */
const clampStoredWidth = list => {
    if (!list.style.width) return;
    const width = parseFloat(list.style.width);
    if (!Number.isFinite(width)) return;
    const max = getMaxWidth(list);
    if (!max) return;
    const clamped = Math.max(getDefaultWidth(list), Math.min(max, width));
    if (clamped !== width) list.style.width = `${clamped}px`;
};

// The asset editor -- the paint editor above all -- sizes its canvas from the container and only
// re-measures on a window resize, so while the divider moves it has to be told, or the drawing
// area keeps its old width and reads as squashed. Throttled: that re-measure costs far more than
// writing the list's width does.
let windowResizeTimer = 0;
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
    const list = handle && handle.parentElement;
    if (!list) return;
    // Mouse only: preventing the default on a touch pointer would also drop the compatibility
    // events the double-tap reset listens for, and `touch-action: none` already keeps the page
    // from scrolling under the drag.
    if (e.pointerType !== 'touch') e.preventDefault();
    e.stopPropagation();
    // Both numbers are needed once per gesture only; the drag itself just adds the pointer delta.
    dragState = {
        list,
        handle,
        startX: e.clientX,
        startWidth: list.getBoundingClientRect().width,
        min: getDefaultWidth(list),
        max: getMaxWidth(list),
        // The list sits on the inner side of the divider, so dragging *away* from it widens it --
        // to the right in LTR, to the left in RTL.
        rtl: getComputedStyle(list).direction === 'rtl'
    };
    handle.classList.add(DRAGGING_CLASS);
    document.body.style.cursor = 'ew-resize';
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
    const {list, startX, startWidth, min, max, rtl} = dragState;
    if (!list.isConnected) {
        onHandleMouseUp();
        return;
    }
    const delta = e.clientX - startX;
    const wanted = startWidth + (rtl ? -delta : delta);
    const width = Math.round(Math.max(min, Math.min(max, wanted)));
    savedWidth = width;
    list.style.width = `${width}px`;
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
    // One last pass so the editor is right for the width the drag ended on, even if it was too
    // short for the throttle above to fire.
    if (state) dispatchWindowResize();
};

const onHandleDoubleClick = e => {
    e.preventDefault();
    e.stopPropagation();
    const list = e.currentTarget && e.currentTarget.parentElement;
    if (!list) return;
    // Back to the GUI's own width rather than a hard-coded 150px, so a theme or addon that
    // changes the default still wins. The remembered width goes too, so the other tab and any
    // rebuilt list follow.
    savedWidth = 0;
    list.style.width = '';
};

const mountHandle = list => {
    let handle = list.querySelector(`:scope > .${HANDLE_CLASS}`);
    if (handle) return false;
    handle = document.createElement('div');
    handle.className = HANDLE_CLASS;
    handle.addEventListener('pointerdown', onHandleMouseDown);
    handle.addEventListener('dblclick', onHandleDoubleClick);
    list.appendChild(handle);
    return true;
};

const unmount = () => {
    if (dragState) onHandleMouseUp();
    disconnectTabObserver();
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = 0;
    }
    for (const handle of document.querySelectorAll(`.${HANDLE_CLASS}`)) handle.remove();
    for (const list of document.querySelectorAll(SELECTOR_SELECTOR)) {
        if (list.style.width) list.style.width = '';
    }
    // Turning the setting off forgets the width as well, so turning it back on starts from the
    // GUI's own layout rather than from a size nothing on screen explains.
    savedWidth = 0;
};

/**
 * Watch the tab panels for the costume / sound tab being mounted.
 *
 * A list only exists while its tab is selected (gui.jsx renders `costumesTabVisible ? ... : null`),
 * and leaving the tab throws the whole subtree away -- including the strip appended to it. Polling
 * for that with rAF cannot work: the wait is unbounded (the user may stay on the code tab for an
 * hour) and the first version gave up after ~10s, which is why the strip sometimes never appeared
 * after a reload and only came back once something resized the window.
 *
 * The panels themselves are permanent, so watching their direct children is the cheapest place to
 * hear about it -- three nodes, no subtree, and it does not look at the workspace.
 */
const ensureTabObserver = () => {
    if (tabObserver) return;
    const panels = document.querySelectorAll(TAB_PANEL_SELECTOR);
    if (!panels.length) return;
    tabObserver = new MutationObserver(scheduleRefresh);
    for (const panel of panels) tabObserver.observe(panel, {childList: true});
};

const disconnectTabObserver = () => {
    if (!tabObserver) return;
    tabObserver.disconnect();
    tabObserver = null;
};

/**
 * The GUI is not in the document yet -- still behind the loader, or a project is being fetched.
 * rAF stops being the right clock once that wait drags on (loading a big project over the network
 * is easily longer than the frame budget), so ask again on a timer instead of giving up for good.
 */
const scheduleRetry = () => {
    if (retryTimer) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        refresh();
    }, RETRY_INTERVAL_MS);
};

/**
 * Bring every list in line with the setting: one strip each, and a stored width that still fits
 * the window. Runs when the setting is turned on, on a window resize (which is also what the GUI
 * sends when a project loads), and whenever a tab panel's contents change.
 */
const refresh = () => {
    if (!active) return;
    ensureTabObserver();
    const lists = getLists();
    if (!lists.length) {
        // With the panels under observation the next tab switch is what brings a list, so polling
        // is only for the stretch before the GUI has rendered anything at all.
        if (tabObserver) return;
        if (++waitFrames > MAX_WAIT_FRAMES) {
            scheduleRetry();
            return;
        }
        window.requestAnimationFrame(refresh);
        return;
    }
    waitFrames = 0;
    for (const list of lists) {
        mountHandle(list);
        // Records the GUI's own width the first time the list is seen on screen; hidden tab
        // panels measure 0 and are skipped (see getDefaultWidth).
        getDefaultWidth(list);
        // A list that has just been created (project load, tab switch) comes back at the width the
        // user left the other one at, rather than at the GUI's default.
        if (!list.style.width && savedWidth) list.style.width = `${savedWidth}px`;
        clampStoredWidth(list);
    }
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
const initResizeSelector = () => {
    if (typeof window === 'undefined') return;
    applySetting(!!getSetting(SETTING_SELECTOR_RESIZE));
    onSettingsChange((key, value) => {
        if (key === SETTING_SELECTOR_RESIZE) applySetting(!!value);
    });
};

export {initResizeSelector};
