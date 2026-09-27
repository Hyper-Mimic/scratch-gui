/**
 * "Convert modals to windows".
 *
 * Driven by the HyperMimic "window modal" setting (src/lib/hypermimic-settings.js, key
 * `windowModal`, boolean). When enabled, every modal in the editor (both the built-in
 * react-modal dialogs and the ones created through `addon.tab.createModal`) becomes a movable,
 * resizable window: drag it by its title bar, resize it from its edges and corners.
 *
 * react-modal renders `.modal-overlay` (a `position: fixed` full-screen backdrop) wrapping the
 * `.modal-content` element. Because Scratch always passes a `className` to react-modal, the
 * library's own `position: absolute` default style is skipped and `.modal-content` is instead
 * centered with `margin: 100px auto` (see components/modal/modal.css). To turn it into a window
 * we switch that element to `position: absolute` and drive its position/size with inline
 * `left/top/width/height`.
 *
 * Class names are CSS-module hashes (`modal_modal-content_<hash>`, `modal_header_<hash>`) and
 * there are many of them (each modal component imports its own modal.css), so we match with
 * attribute-contains selectors rather than exact class names.
 *
 * Two things make it behave like a window manager rather than a floating dialog:
 *  - every window remembers its box, keyed by the modal's own `id`, in localStorage, so it comes
 *    back where it was left even after a reload;
 *  - opening a window raises it above the others, whether that is a fresh mount (scan) or an
 *    addon modal being reopened in place (the `hm-modal-opened` announcement).
 *
 * Everything is vanilla DOM + a raw <style> (not CSS Modules), mirroring the other
 * HyperMimic-only runtime modules (context-menu-style, comment-markdown-editor, ...).
 */

import reduxInstance from '../../addons/redux.js';
import {
    getSetting,
    onSettingsChange,
    SETTING_WINDOW_MODAL
} from '../hypermimic-settings.js';

const STYLE_ID = 'hm-window-modal-style';
const CONTENT_SELECTOR = '[class*="modal_modal-content"], [class*="modal-content"]';
const OVERLAY_SELECTOR = '[class*="modal_modal-overlay"], [class*="modal-overlay"]';
const HEADER_SELECTOR = '[class*="modal_header"]';

// Where the remembered window boxes live. Unlike the other HyperMimic-only settings this is
// state, not a preference: it is written by dragging/resizing, so it has its own key, and it is
// deliberately NOT enabled/disabled with the setting -- having turned windows off for a while
// should not forget where you left them.
const BOXES_STORAGE_KEY = 'hm:windowBoxes';

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;

// Per-window minimum size overrides, keyed by the modal content element's `id` (react-modal
// forwards the `id` prop onto the content node). Some windows need a minimum larger than the
// global default so their contents never overflow into a scrollbar when resized down — e.g. the
// "Make a Block" (custom procedures) dialog hosts a Blockly workspace plus an options row that
// both need to stay fully visible.
const PER_WINDOW_MIN = {
    customProceduresModal: {width: 620, height: 620}
};
// A modal whose content is `margin: auto` centered has no reliable natural size; give it a
// sane starting box when it first becomes a window.
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
// Minimum *initial* window size. Restore points and other small modals open too small at their
// natural height, so we lift them to at least this on first show.
const INITIAL_MIN_WIDTH = 560;
const INITIAL_MIN_HEIGHT = 480;
const RESIZE_EDGE = 10; // px of the edges/corner treated as a resize grip

let observer = null;
let contentObserver = null;
let enabled = false;
let stateChangedBound = false;
const attached = new WeakSet();

// Window stacking, like a desktop OS: each window gets a monotonically increasing z-index and
// clicking a window raises it above all others. Starts above $z-index-modal (510) so converted
// windows stack above any non-window UI.
const Z_BASE = 510;
let topZ = Z_BASE;

// The z-index each overlay was last given, so the `style` observer below can tell a real change
// (an addon modal toggling `display`) from the echo of our own raise. Without this the observer
// answers its own write with another raise, forever: `raiseToTop` sets `overlay.style.zIndex`,
// that is a `style` mutation, the observer raises the window again, and so on.
const raisedZ = new WeakMap();

const raiseToTop = overlay => {
    if (!overlay) return;
    const next = ++topZ;
    if (raisedZ.get(overlay) === next) return;
    raisedZ.set(overlay, next);
    overlay.style.zIndex = String(next);
};

// ----- Remembered geometry -----

// Windows are identified by the content element's `id` (react-modal forwards the `id` prop onto
// the content node, and addon modals get one too) with the header's `aria-label` as a fallback,
// so the box survives both a re-render and a page reload. A modal with neither has no stable
// identity and simply is not remembered.
let boxes = null;

const loadBoxes = () => {
    if (boxes) return boxes;
    boxes = {};
    try {
        const stored = JSON.parse(localStorage.getItem(BOXES_STORAGE_KEY));
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
            // Only keep entries that look like a box: a hand-edited or half-written entry must
            // never end up as `NaN` in an inline style.
            for (const [key, value] of Object.entries(stored)) {
                if (value && ['left', 'top', 'width', 'height'].every(k => Number.isFinite(value[k]))) {
                    boxes[key] = {
                        left: value.left,
                        top: value.top,
                        width: value.width,
                        height: value.height
                    };
                }
            }
        }
    } catch (e) {
        // Missing, corrupted or unavailable storage: start from an empty table.
    }
    return boxes;
};

const persistBoxes = () => {
    try {
        localStorage.setItem(BOXES_STORAGE_KEY, JSON.stringify(loadBoxes()));
    } catch (e) {
        // Storage full or unavailable: the window still works, it just will not be remembered.
    }
};

// The key for a given content element, or null when it has no stable identity.
const boxKeyFor = content => {
    const id = content.getAttribute('id');
    if (id) return id;
    // Fall back to the aria-label (react-modal sets contentLabel as aria-label).
    const label = content.getAttribute('aria-label');
    if (label) return `label:${label}`;
    return null;
};

const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* A restored window is placed at its remembered coordinates while it is still hidden, so it must
   not animate its way there from wherever the modal would otherwise have opened. Applied inline
   (see hideBeforePlace in attach()), not here, so it can be taken off again in the next frame. */
[class*="modal_modal-content"][data-hm-window],
[class*="modal-content"][data-hm-window] {
    position: absolute;
    margin: 0;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    /* .modal-content has a 4px border but is NOT box-sizing:border-box itself, so an inline
       width/height would render larger than the value we clamp against the viewport and the
       right/bottom edges would spill past the viewport. Force border-box so inline width/height
       match getBoundingClientRect and the clamp stays accurate. */
    box-sizing: border-box;
}
/* The window body (any direct child that is not the title bar) should grow with the
   window height and scroll internally instead of keeping its natural height. */
[class*="modal_modal-content"][data-hm-window] > :not([class*="modal_header"]),
[class*="modal-content"][data-hm-window] > :not([class*="modal_header"]) {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}
[class*="modal_modal-content"][data-hm-window] > [class*="modal_header"],
[class*="modal-content"][data-hm-window] > [class*="modal_header"] {
    flex: 0 0 auto;
}
/* Some modal bodies pin a viewport-relative max-height (e.g. settings-modal ".body" uses
   "max-height: calc(100vh - 250px)"). Lift it inside a window so the body grows with the
   resized window instead of staying locked to its natural viewport height.

   ".body" is NOT a direct child of ".modal-content" — react-modal's children are wrapped in a
   "Box" (direction=column, grow=1) before the header/body, so we match it at any depth. */
[class*="modal_modal-content"][data-hm-window] [class*="body"],
[class*="modal-content"][data-hm-window] [class*="body"] {
    max-height: none;
    flex: 1 1 auto;
    min-height: 0;
}
/* The intermediate Box wrapper (direction=column) must become a proper column so the body
   above can flex against it. */
[class*="modal_modal-content"][data-hm-window] > :not([class*="modal_header"]),
[class*="modal-content"][data-hm-window] > :not([class*="modal_header"]) {
    display: flex;
    flex-direction: column;
}
/* No cursor here on purpose: a title bar carries buttons and a title, and a permanent move
   cursor over all of it looks wrong (and would have to be un-set again over the children). */
[class*="modal_header"][data-hm-window-titlebar] {
    -webkit-user-select: none;
    user-select: none;
    /* Touch: a drag that begins on the title bar must not scroll or zoom the page underneath it. */
    touch-action: none;
}
/* Drop the full-screen backdrop so the window floats over the editor. */
[class*="modal_modal-overlay"][data-hm-window-overlay],
[class*="modal-overlay"][data-hm-window-overlay] {
    background: transparent;
    pointer-events: none;
}
[class*="modal_modal-overlay"][data-hm-window-overlay] [class*="modal_modal-content"],
[class*="modal_modal-overlay"][data-hm-window-overlay] [class*="modal-content"],
[class*="modal-overlay"][data-hm-window-overlay] [class*="modal_modal-content"],
[class*="modal-overlay"][data-hm-window-overlay] [class*="modal-content"] {
    pointer-events: auto;
}
`;
    document.head.appendChild(style);
};

// Controls inside a window that must keep receiving their own clicks and drags rather than being
// claimed by the window's title-bar drag / edge resize gestures.
//
// `[class*="close-button_..."]` is not redundant with `[role="button"]`: the addon API builds its
// close button as a bare `<div class="close-button_close-button_<hash> close-button_large_<hash>">`
// (src/addons/modal.js) with no role attribute, so it matches neither `button` nor `[role="button"]`
// -- yet it is the button users press to dismiss an addon window, and it sits in the header, inside
// the title-bar/resize zone. The same selector is already used to locate the button when closing
// built-in windows (see CLOSE_TARGET_SELECTOR).
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"],' +
    ' [class*="close-button_base"], [class*="close-button_close-button"],' +
    ' [class*="close-button_large"]';

// Convert a modal content element into a window.
const attach = content => {
    if (attached.has(content)) return;
    if (content.dataset.hmWindow) return;
    attached.add(content);
    content.dataset.hmWindow = 'true';

    const overlay = content.parentElement;
    if (overlay) {
        overlay.dataset.hmWindowOverlay = 'true';
        // Give the window its place in the stack (later windows start higher).
        raiseToTop(overlay);
    }

    // Clicking anywhere in the window brings it to the front, like a desktop window manager.
    // Pointer events cover mouse, touch and pen (a touch tap still raises the window).
    content.addEventListener('pointerdown', () => {
        raiseToTop(overlay);
    }, true);

    // Measure the modal as it currently sits, then lock it to an absolute box.
    const rect = content.getBoundingClientRect();
    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;

    const key = boxKeyFor(content);
    const saved = key ? loadBoxes()[key] : null;

    // A window that is being restored to a remembered box, or that is not on screen yet, is hidden
    // for the one frame it takes to place it: the box used to be written to a modal that was
    // already visible at (or animating towards) its natural position, which made a reloaded site
    // show the window at its default spot first and then snap to the remembered one.
    // `visibility: hidden` rather than `display: none` so the element is still laid out (nothing
    // here measures it, but a display flip would force an extra reflow) and so the transition
    // below survives. It is cleared in the next animation frame, before the browser paints.
    const hideBeforePlace = saved || content.offsetParent === null;
    if (hideBeforePlace) {
        content.style.visibility = 'hidden';
        // No entrance animation from the old position; the closing animation is unaffected (its
        // rule lives in the stylesheet and applies once the modal's own class is added).
        content.style.transition = 'none';
    }

    // Resolve this window's minimum size: fall back to the global MIN_WIDTH/MIN_HEIGHT unless this
    // particular modal declares its own (smaller) minimum.
    const modalId = content.getAttribute('id');
    const windowMin = (modalId && PER_WINDOW_MIN[modalId]) || {width: MIN_WIDTH, height: MIN_HEIGHT};
    // A window must never be larger than the viewport it lives in. Cap both the per-window
    // minimum and the global defaults against the viewport so phones (whose viewport can be
    // narrower/taller than these desktop-oriented numbers) still get a window that fits on screen.
    const minWidth = Math.min(windowMin.width, viewportW);
    const minHeight = Math.min(windowMin.height, viewportH);

    // Single source of truth for the window box, stored on the element so drag and resize
    // share the same values instead of diverging closure copies. Restore a previously saved box
    // if this modal was re-created (locale switch etc.).
    //
    // Initial size is computed first, then the window is centered on that size. We must NOT use
    // the modal's current `rect.left/top` (its `margin: 100px auto` centered position) together
    // with an INITIAL_MIN-lifted size: the rect position is based on the modal's *original*
    // (smaller) width, so pairing it with a wider window leaves less clearance on the right/
    // bottom than on the left/top. Centering on the final size keeps all four gaps symmetric.
    const initialWidth = Math.max(
        rect.width > MIN_WIDTH ? rect.width : Math.min(DEFAULT_WIDTH, viewportW),
        Math.min(INITIAL_MIN_WIDTH, viewportW),
        minWidth
    );
    const initialHeight = Math.max(
        rect.height > MIN_HEIGHT ? rect.height : Math.min(DEFAULT_HEIGHT, viewportH),
        Math.min(INITIAL_MIN_HEIGHT, viewportH),
        minHeight
    );
    const box = saved ? Object.assign({}, saved) : {
        left: Math.round((viewportW - initialWidth) / 2),
        top: Math.round((viewportH - initialHeight) / 2),
        width: initialWidth,
        height: initialHeight
    };

    // Keep the whole window on screen, flush against the edges. There is no forced inset:
    // the window may be dragged/resized all the way to any viewport edge, but its right/bottom
    // edges are still clamped to the viewport so it can never spill off-screen.
    const clampToViewport = () => {
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        box.width = Math.min(box.width, vw);
        box.height = Math.min(box.height, vh);
        box.left = Math.max(0, Math.min(box.left, vw - box.width));
        box.top = Math.max(0, Math.min(box.top, vh - box.height));
    };

    // Write the box back to the store whenever it changes so re-created windows restore it.
    //
    // Every write goes to localStorage. The box's width/height come from getBoundingClientRect(),
    // which returns sub-pixel floats (borders, flex layout, fractional scaling) -- so a window's
    // size is almost always fractional, and a plain "skip non-integer values" guard would reject
    // EVERY write and nothing would ever be remembered. Instead we round at write time: the stored
    // geometry is whole-pixel (what a restore should use), and the unchanged check below still
    // collapses repeated writes of the same rounded box, so a drag only writes when the rounded
    // box actually moves rather than ~120 times a second.
    const persist = () => {
        if (!key) return;
        const rounded = {
            left: Math.round(box.left),
            top: Math.round(box.top),
            width: Math.round(box.width),
            height: Math.round(box.height)
        };
        const entry = loadBoxes()[key];
        if (entry &&
            entry.left === rounded.left && entry.top === rounded.top &&
            entry.width === rounded.width && entry.height === rounded.height) return;
        loadBoxes()[key] = rounded;
        persistBoxes();
    };

    const apply = () => {
        clampToViewport();
        content.style.position = 'absolute';
        content.style.margin = '0';
        content.style.left = `${box.left}px`;
        content.style.top = `${box.top}px`;
        content.style.width = `${box.width}px`;
        content.style.height = `${box.height}px`;
        content.style.maxWidth = 'none';
        content.style.maxHeight = 'none';
        persist();
        // Tell any listeners (e.g. the custom-procedures inline block editor) that this window
        // just moved/resized, so body-attached overlays like Blockly.WidgetDiv can re-align to
        // the element they belong to.
        document.dispatchEvent(new CustomEvent('hm-window-moved', {
            detail: {content}
        }));
    };
    apply();

    // Un-hide (and un-freeze the transition) once the window is in its remembered place. The frame
    // also covers the case where the window was hidden at attach time, so it appears only after
    // `apply()` has given it a position.
    if (hideBeforePlace) {
        requestAnimationFrame(() => {
            content.style.visibility = '';
            content.style.transition = '';
        });
    }

    // ----- Drag by title bar -----
    const header = content.querySelector(HEADER_SELECTOR);
    if (header) {
        header.dataset.hmWindowTitlebar = 'true';
        header.addEventListener('pointerdown', e => {
            // Only the primary button / a touch begins a drag; ignore right/middle click.
            if (e.button !== 0) return;
            // Ignore drags that start on an interactive control (close/help/back buttons).
            if (e.target.closest(INTERACTIVE_SELECTOR)) return;
            e.preventDefault();
            // Capture the pointer so the drag keeps tracking even when the finger slides over
            // other elements or off the window entirely (a plain touch would otherwise be lost
            // the moment it leaves the title bar, or get cancelled by the page scrolling).
            try { header.setPointerCapture(e.pointerId); } catch (_) {}
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = box.left;
            const startTop = box.top;

            const onMove = ev => {
                box.left = startLeft + (ev.clientX - startX);
                box.top = startTop + (ev.clientY - startY);
                apply();
            };
            const onUp = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
        });
    }

    // ----- Resize from edges / corners -----
    // Every edge and corner is a resize grip with its own cursor. The direction is detected
    // from where the pointer sits relative to the window rect.
    const getDirection = (clientX, clientY) => {
        const r = content.getBoundingClientRect();
        const n = clientY - r.top < RESIZE_EDGE;
        const s = r.bottom - clientY < RESIZE_EDGE;
        const w = clientX - r.left < RESIZE_EDGE;
        const e = r.right - clientX < RESIZE_EDGE;
        return {n, s, w, e};
    };

    const CURSORS = {
        n: 'n-resize',
        s: 's-resize',
        w: 'w-resize',
        e: 'e-resize',
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize'
    };

    const dirKey = dir => {
        let key = '';
        if (dir.n) key += 'n';
        if (dir.s) key += 's';
        if (dir.w) key += 'w';
        if (dir.e) key += 'e';
        return key;
    };

    // Live cursor switching as the pointer moves over an edge/corner.
    const updateCursor = ev => {
        if (!enabled) return;
        const dir = getDirection(ev.clientX, ev.clientY);
        const key = dirKey(dir);
        // The title bar (top edge) stays a move cursor, not a resize grip, unless a corner.
        if (key === 'n' && header && header.contains(ev.target)) {
            content.style.cursor = '';
            return;
        }
        content.style.cursor = CURSORS[key] || '';
    };

    content.addEventListener('pointermove', updateCursor);
    content.addEventListener('pointerleave', () => {
        content.style.cursor = '';
    });

    const resizeFromEdge = e => {
        // Only the primary button / a touch resizes; ignore right/middle click.
        if (e.button !== 0) return false;
        const dir = getDirection(e.clientX, e.clientY);
        if (!dir.n && !dir.s && !dir.e && !dir.w) return false;
        // Don't hijack drags on the title bar (top edge).
        if (header && header.contains(e.target) && dir.n && !dir.e && !dir.w) return false;
        // Never swallow a press on an interactive control, even one sitting flush against the
        // window edge -- the close button IS the top-right corner, so this is the common case,
        // not the corner case.
        //
        // This handler runs on the capture phase and calls preventDefault()/stopPropagation()
        // plus setPointerCapture() on `content`. Capture retargets the rest of the gesture to
        // `content`, and the follow-up `click` is then dispatched on the nearest common ancestor
        // of the down/up targets -- i.e. on `content`, never on the control that was pressed. Every
        // button in the window (built-in close/help, addon buttons) goes dead.
        if (e.target.closest(INTERACTIVE_SELECTOR)) return false;

        e.preventDefault();
        // Claim this gesture: stops the header's bubble-phase drag handler from also starting
        // (it is registered on the header and would otherwise run for a corner grab), and, with
        // pointer capture, keeps touch scrolling/zooming from cancelling the resize.
        e.stopPropagation();
        try { content.setPointerCapture(e.pointerId); } catch (_) {}
        const startX = e.clientX;
        const startY = e.clientY;
        const startRect = {left: box.left, top: box.top, width: box.width, height: box.height};
        const onMove = ev => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const vw = document.documentElement.clientWidth;
            const vh = document.documentElement.clientHeight;
            let nl = box.left;
            let nt = box.top;
            let nw = box.width;
            let nh = box.height;
            if (dir.e) nw = startRect.width + dx;
            if (dir.s) nh = startRect.height + dy;
            // Resizing from the left/top edge keeps the opposite (right/bottom) edge pinned:
            // clamp the size FIRST, then derive the left/top from the fixed opposite edge, so
            // hitting the minimum size leaves the window in place instead of sliding it right/down.
            if (dir.w) {
                nw = Math.max(minWidth, startRect.width - dx);
                nl = startRect.left + startRect.width - nw;
            }
            if (dir.n) {
                nh = Math.max(minHeight, startRect.height - dy);
                nt = startRect.top + startRect.height - nh;
            }
            // Enforce min size for the right/bottom edges too, then clamp to viewport (in apply()).
            nw = Math.max(minWidth, nw);
            nh = Math.max(minHeight, nh);
            // Clamp the size against the viewport using the OPPOSITE edge as a fixed anchor. Without
            // this, once the dragged edge hits the viewport edge and the mouse keeps moving, the
            // size keeps growing and clampToViewport() would push the opposite edge back — making the
            // window appear to "grow in reverse" on the other side.
            if (dir.e) {
                // right edge dragged: left edge is the anchor
                nw = Math.min(nw, vw - startRect.left);
            } else if (dir.w) {
                // left edge dragged: right edge is the anchor (right edge = left + width)
                nw = Math.min(nw, startRect.left + startRect.width);
                nl = startRect.left + startRect.width - nw;
            }
            if (dir.s) {
                nh = Math.min(nh, vh - startRect.top);
            } else if (dir.n) {
                nh = Math.min(nh, startRect.top + startRect.height);
                nt = startRect.top + startRect.height - nh;
            }
            box.left = nl;
            box.top = nt;
            box.width = nw;
            box.height = nh;
            apply();
        };
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
        return true;
    };

    content.addEventListener('pointerdown', resizeFromEdge, true);
};

const scan = () => {
    if (!enabled) return;
    document.querySelectorAll(OVERLAY_SELECTOR).forEach(overlay => {
        const content = overlay.querySelector(CONTENT_SELECTOR);
        if (content) attach(content);
    });
};

const apply = value => {
    enabled = value;
    if (value) {
        injectStyle();
        scan();
    }
};

// Close every currently-open window. Each window (whether a react-modal built-in dialog or an
// addon modal created through `addon.tab.createModal`) has a close button in its header; clicking
// it routes through that modal's own close logic (exit animation + cleanup), which is safer than
// yanking the DOM out from under React.
const closeAllWindows = () => {
    document.querySelectorAll('[data-hm-window]').forEach(content => {
        const closeButton = content.querySelector('[class*="close-button"]');
        if (closeButton) closeButton.click();
    });
};

let vmBound = false;
let vmPollTimer = null;

/**
 * Bring a window to the front, as if it had just been opened.
 *
 * A react-modal dialog is unmounted on close, so opening it again means a new overlay that `scan`
 * attaches and raises by itself. Addon modals are the opposite: `addon.tab.createModal` hands back
 * one element that stays in the document and is reopened by toggling `display`, which no mutation
 * of the child tree reports and no click precedes. So the open is announced instead -- the addon
 * API dispatches `hm-modal-opened`, and an inline `style.display = ''` is caught by the attribute
 * observer below -- and this raises whatever window the argument names. `target` may be the window
 * content element, its overlay, or any node inside either.
 *
 * @param {Element} target the modal that was just opened
 */
const raiseWindow = target => {
    if (!target || typeof target.closest !== 'function') return;
    const content = target.matches(CONTENT_SELECTOR) ?
        target :
        (target.closest(CONTENT_SELECTOR) || target.querySelector(CONTENT_SELECTOR));
    // Only converted windows take part in this stacking; and a hidden one (an addon modal is
    // created `display: none` and shown later) is not "open", so it must not steal the top.
    if (!content || !content.dataset.hmWindow) return;
    if (!content.getClientRects().length) return;
    raiseToTop(content.parentElement);
};

// The addon API announcing an open it performed itself (see raiseWindow). The event is dispatched
// on `window`, so `e.target` is the window, not the modal -- the element travels in `detail`.
const onModalOpened = e => {
    if (!enabled) return;
    const detail = e && e.detail;
    if (!detail) return;
    raiseWindow(detail.container || detail.content || detail.backdrop || detail);
};

// An addon modal reopening itself: `container.style.display = ''` on an element that is already
// in the document changes only an attribute, so it shows up as an attribute mutation rather than
// as a childList one. Catching these is what makes "open it again" work even for an addon that
// reopens without going through `addon.tab.createModal` a second time.
const onAttributeMutation = mutation => {
    if (!enabled) return;
    const el = mutation.target;
    if (!(el instanceof Element) || el.style.display === 'none') return;
    // Ignore the echo of our own raise: `raiseToTop` sets the overlay's inline z-index, which is a
    // `style` mutation on this very node. Without this the observer would raise, see its own
    // write, and raise again -- an endless chain of microtasks that also drowns out every other
    // style change. Any genuine change (a display toggle) leaves the z-index exactly as we left it.
    if (raisedZ.get(el) !== undefined && el.style.zIndex === String(raisedZ.get(el))) return;
    raiseWindow(el);
};

// A react-modal dialog being opened again while it is already open.
//
// This is the one case neither observer above can see. `OPEN_MODAL` for a modal whose flag is
// already `true` produces an identical state object, so redux-modal never re-renders and the
// dialog is never remounted: there is no new overlay for the childList observer, no inline style
// on the container for the attribute observer, and no event -- the dialog simply stays where it
// is, underneath whatever the user opened after it. Nothing about the DOM changes, so the open
// has to be read off the action itself.
//
// The reducer keys its state by modal name and `containers/modal.jsx` forwards that same name as
// the content element's DOM `id` (e.g. `settingsModal` -> `<div id="settingsModal">`), so an
// OPEN_MODAL action names its window directly. Modals without a matching id (the library dialogs,
// which are full-screen and never become windows) simply resolve to null and are ignored.
const OPEN_MODAL_ACTION = 'scratch-gui/modals/OPEN_MODAL';
const SELECT_LOCALE_ACTION = 'scratch-gui/locales/SELECT_LOCALE';

// The action has to be read from somewhere that sees every dispatch, with the action in hand.
// The three obvious sources all fail:
//   - `AddonHooks.appStateReducer`: `src/addons/api.js` is a dynamic `import()` (from
//     `src/addons/entry.js`), so `src/addons/redux.js` evaluates in a microtask -- strictly after
//     this module's synchronous body. AddonRedux's constructor assigns the slot outright, so
//     anything installed here is silently replaced a tick later.
//   - wrapping `store.dispatch`: `connectAdvanced` reads `this.store.dispatch` once and binds the
//     action creators to that reference (react-redux 5.0.7, connectAdvanced.js:193). Replacing
//     `store.dispatch` later changes the object, not the reference those components already hold,
//     so a menu-bar click dispatches through the *unwrapped* original and the action is never seen
//     here (while a manual `window.ReduxStore.dispatch(...)` does go through the wrapper).
//   - `store.subscribe`: it hands you the state, not the action, and the state is useless here --
//     re-opening an already-open dialog leaves its flag at `true`, so no transition is observable.
//
// `reduxInstance` sidesteps all three: importing it constructs `AddonRedux` (so its constructor
// installs `appStateReducer` immediately, not later in a microtask), and it dispatches a
// `statechanged` CustomEvent carrying the action on every store dispatch. Listening to that event
// is the only reliable way to see OPEN_MODAL -- regardless of whether the dispatch came from
// react-redux, a button click, or the console.

// Close every converted window that belongs to a built-in dialog. A language change re-renders
// these in place -- the dialog stays open and its body is rebuilt from the new messages -- which
// shows up as the window flickering and coming straight back. Addon modals already handle this
// themselves (they listen for the addon API's `reenabled` and close, because their text is native
// DOM built once with `msg()`); the built-in dialogs have no such hook, so this is where they get
// the same treatment. Addon windows are told apart by the `addon-modal-` id prefix that
// `src/addons/modal.js` assigns.
//
// The click must land on the dialog's close button, and only on that -- anything else either is
// not a close (the header's Help button) or belongs to a nested component. Two things about the
// markup make that less obvious than it looks:
//
//   - There is no vendor class to match. `components/modal/modal.jsx` renders its own
//     `CloseButton`, whose root class is `close-button_close-button_<hash>` (css-loader hashes
//     plain `close-button.css`). A `[class*="close-button"]` match therefore also catches the
//     alert/alert styles and the addon API's button, and says nothing about *which element in
//     this dialog* it is; a `[class*="modal_header-item-close"]` match would be an empty string,
//     because that class only exists in `modal.css` (a CSS-module hash inside the same project)
//     and CSS-module names are not reflected onto the element as data attributes.
//   - The button has to be inside THIS dialog's header. `:scope >` is not used because the header
//     nests the button two levels down, not one; `querySelectorAll` is used because the icon
//     inside the button carries its own `close-button_close-icon_<hash>` class and would match a
//     bare attribute-contains selector.
//
// So the target is found structurally instead: the modal header (`data-hm-window-titlebar`, set by
// attach()), then the first element inside it carrying a `close-button_` root class. Elements that
// belong to a nested dialog are excluded by walking up to the nearest window boundary.
const CLOSE_TARGET_SELECTOR = '[class*="close-button_base"], [class*="close-button_close-button"],' +
    ' [class*="close-button_large"]';

// Walk up from `el` to the window content element that contains it, so a close button inside a
// nested dialog is never attributed to the outer window.
const ownerWindow = el => {
    let node = el;
    while (node) {
        if (node.dataset && node.dataset.hmWindow) return node;
        node = node.parentElement;
    }
    return null;
};

// Close the converted windows that belong to built-in dialogs.
//
// Returns the number of windows it closed and leaves the rest in `closePending`, because one pass
// is not always enough: the language menu's own click handler runs after the SELECT_LOCALE
// dispatch that got us here, and it dispatches CLOSE_MENU / OPEN_MODAL -- a fresh tree of DOM work
// that can re-create or re-show a dialog a tick after this pass. A second pass on the next frame
// catches those; the `closePending` set is what stops a dialog that simply refuses to close (a
// modal calling preventDefault on its own request, say) from being clicked over and over.
const closePending = new WeakSet();

const closeBuiltInWindows = only => {
    if (!enabled) return;
    let closed = 0;
    document.querySelectorAll('[data-hm-window]').forEach(content => {
        if (only && !only.has(content)) return;
        const id = content.getAttribute('id');
        // An addon modal owns its own lifecycle (and its own `reenabled` handler); skip it.
        if (id && id.indexOf('addon-modal-') === 0) return;
        if (!content.getClientRects().length) return;
        const header = content.querySelector(HEADER_SELECTOR) ||
            (content.dataset.hmWindowTitlebar ? content : null);
        if (!header) return;
        const candidates = header.querySelectorAll(CLOSE_TARGET_SELECTOR);
        let button = null;
        for (const candidate of candidates) {
            // Reject anything that lives inside a nested dialog rather than this window.
            if (ownerWindow(candidate) !== content) continue;
            button = candidate;
            break;
        }
        if (!button) return;
        if (closePending.has(button)) return;
        closePending.add(button);
        closed++;
        // The modal's own close handler, so the exit animation plays and React unmounts on its own
        // terms -- the same reasoning as closeAllWindows.
        button.click();
    });
    return closed;
};

// Re-run the close on the next frame for whatever a same-tick dispatch re-opened. Only windows
// that survived the first pass are collected, so this costs nothing when the first pass was enough.
const scheduleCloseSweep = () => {
    requestAnimationFrame(() => {
        if (!enabled) return;
        const survivors = new Set();
        document.querySelectorAll('[data-hm-window]').forEach(content => {
            const id = content.getAttribute('id');
            if (id && id.indexOf('addon-modal-') === 0) return;
            if (content.getClientRects().length) survivors.add(content);
        });
        if (survivors.size) closeBuiltInWindows(survivors);
    });
};

const onStateChanged = e => {
    if (!enabled) return;
    const detail = e && e.detail;
    const action = detail && detail.action;
    if (!action) return;

    // SELECT_LOCALE is dispatched only when the user actually picks a language from the language
    // menu (the initial locale is seeded directly into the initial state in app-state-hoc, not via
    // a dispatch), so every occurrence means "the language just changed" and every built-in dialog
    // should close. No last-locale comparison: the first SELECT_LOCALE is a real change too.
    if (action.type === SELECT_LOCALE_ACTION) {
        closeBuiltInWindows();
    }

    // Raise on the OPEN_MODAL action itself, not on a false -> true transition of the flag.
    // Re-opening a dialog that is *already* open -- the reported case, where it sits buried under
    // a window opened later -- leaves the flag at `true`, so a transition check sees nothing to do.
    // The action is the only thing that distinguishes "open this" from "it is still open".
    if (action.type === OPEN_MODAL_ACTION && action.modal) {
        raiseWindow(document.getElementById(action.modal));
    }
};

const bindStateChanged = () => {
    if (stateChangedBound) return;
    reduxInstance.addEventListener('statechanged', onStateChanged);
    stateChangedBound = true;
};


// The VM is assigned to `window.vm` asynchronously (by vm-manager-hoc during mount), and loading
// a project emits `PROJECT_LOADED` on the runtime (not forwarded to the VM instance). Wait for the
// VM to appear, then close every window whenever a new project finishes loading — importing a
// file, loading by id, or starting a new project all replace the project a window was pointing at.
const bindProjectLoaded = () => {
    if (vmBound) return true;
    const vm = window.vm;
    if (!vm || !vm.runtime || typeof vm.runtime.on !== 'function') return false;
    vm.runtime.on('PROJECT_LOADED', closeAllWindows);
    vmBound = true;
    return true;
};

const initWindowModal = () => {
    if (typeof document === 'undefined') return;

    apply(getSetting(SETTING_WINDOW_MODAL));

    // Modals are mounted/unmounted dynamically; watch for new ones.
    observer = new MutationObserver(scan);
    observer.observe(document.body, {childList: true, subtree: true});

    document.addEventListener('hm-modal-opened', onModalOpened);

    // A react-modal dialog reopened while already open (see onStateChanged).
    bindStateChanged();

    // Reopening an addon modal is an attribute change, not a childList one (see onAttributeMutation).
    if (document.body) {
        contentObserver = new MutationObserver(onAttributeMutation);
        contentObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['style'],
            subtree: true
        });
    }

    onSettingsChange((key, value) => {
        if (key === SETTING_WINDOW_MODAL) {
            apply(value);
        }
    });

    // Poll briefly for `window.vm` (assigned after mount), then bind the project-loaded listener.
    // Bounded so it stops cleanly if the VM never shows up (e.g. non-editor context).
    let attempts = 0;
    const tryBind = () => {
        if (bindProjectLoaded()) return;
        if (++attempts > 50) return;
        vmPollTimer = setTimeout(tryBind, 200);
    };
    tryBind();
};

export {
    initWindowModal
};
