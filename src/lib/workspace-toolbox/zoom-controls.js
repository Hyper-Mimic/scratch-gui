/**
 * Editor setting: draw the workspace zoom controls like the workspace toolbox's buttons.
 *
 * Blockly paints each control as one 36x36 SVG <image> whose round white background is part of
 * the artwork, so no amount of CSS can reshape it into a square button. This hides that group
 * (`.blocklyZoom`) and overlays three HTML buttons in the same corner; they use the toolbox's
 * button look (36x36 white rounded square, hairline border, hover/pressed fills) and call the
 * same workspace methods the SVG handlers do.
 */

import {defineMessages} from 'react-intl';
import cssModule from '!css-loader?{"esModule":false}!./zoom-controls.css';
import {getSetting, onSettingsChange, SETTING_WORKSPACE_ZOOM_TOOLBOX_STYLE} from '../hypermimic-settings.js';
import {hmMessage} from '../hm-message.js';

const HTML_CLASS = 'hm-zoom-toolbox-style';
const STYLE_ID = 'hm-zoom-controls-styles';

const MSG = defineMessages({
    zoomIn: {
        defaultMessage: 'Zoom in',
        description: 'Tooltip of the zoom-in button that replaces Blockly\'s zoom control',
        id: 'hm.zoomControls.zoomIn'
    },
    zoomOut: {
        defaultMessage: 'Zoom out',
        description: 'Tooltip of the zoom-out button that replaces Blockly\'s zoom control',
        id: 'hm.zoomControls.zoomOut'
    },
    reset: {
        defaultMessage: 'Reset zoom',
        description: 'Tooltip of the zoom-reset button that replaces Blockly\'s zoom control',
        id: 'hm.zoomControls.reset'
    }
});

// Glyphs taken from Blockly's own zoom artwork (media/zoom-in.svg, zoom-out.svg, zoom-reset.svg):
// the icon is kept, the round button background painted into that artwork is dropped (the HTML
// button is the background now) and the colours become currentColor so the glyph follows the
// theme -- including custom-editor-theme -- with no image filter. The viewBox is tightened to the
// glyph so it fills the button; the reset bars are the same artwork at the same scale.
const ICON_SIZE = 20;
const ICON_VIEWBOX = '232 172 17 17';
const ICONS = {
    in: `<svg viewBox="${ICON_VIEWBOX}" width="${ICON_SIZE}" height="${ICON_SIZE}" fill="none" ` +
        'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
        'opacity="0.75" aria-hidden="true" focusable="false">' +
        '<circle cx="240" cy="180" r="7"/><path d="M245 185l3 3"/>' +
        '<path d="M238 180h4"/><path d="M240 178v4"/></svg>',
    out: `<svg viewBox="${ICON_VIEWBOX}" width="${ICON_SIZE}" height="${ICON_SIZE}" fill="none" ` +
        'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
        'opacity="0.75" aria-hidden="true" focusable="false">' +
        '<circle cx="240" cy="180" r="7"/><path d="M245 185l3 3"/>' +
        '<path d="M238 180h4"/></svg>',
    reset: `<svg viewBox="${ICON_VIEWBOX}" width="${ICON_SIZE}" height="${ICON_SIZE}" ` +
        'fill="currentColor" stroke="none" opacity="0.75" aria-hidden="true" focusable="false">' +
        '<path d="M236,178c-0.55228,0 -1,-0.44772 -1,-1v0c0,-0.55228 0.44772,-1 1,-1h8' +
        'c0.55228,0 1,0.44772 1,1v0c0,0.55228 -0.44772,1 -1,1z"/>' +
        '<path d="M236,184c-0.55228,0 -1,-0.44772 -1,-1v0c0,-0.55228 0.44772,-1 1,-1h8' +
        'c0.55228,0 1,0.44772 1,1v0c0,0.55228 -0.44772,1 -1,1z"/></svg>'
};

const getWorkspace = () => {
    // The editor's workspace, not "the last one injected": with the "make a new block" dialog open,
    // Blockly.getMainWorkspace() returns the dialog's workspace, and everything below would attach
    // to it (the dialog has its own injection div / zoom group / drag surface).
    if (typeof window !== 'undefined' && window.AddonHooks && window.AddonHooks.blocklyWorkspace) {
        return window.AddonHooks.blocklyWorkspace;
    }
    return (typeof window !== 'undefined' && window.Blockly) ? Blockly.getMainWorkspace() : null;
};

/**
 * The MAIN workspace's injection div. `document.querySelector('.injectionDiv')` picks whichever
 * comes first in the document, and the "make a new block" dialog hosts a second Blockly workspace
 * with an injection div of its own -- so with that dialog open the overlay could attach to the
 * dialog's workspace instead of the editor's. Asking the main workspace is unambiguous.
 */
const getMainInjectionDiv = () => {
    // A workspace's injection div can also live inside a dialog (the "make a new block" editor).
    // The overlay belongs to the editor pane, so anything that is not inside the blocks wrapper is
    // rejected -- during a rebuild this returns null and the next mount attempt takes over.
    const inEditor = div => Boolean(div && div.isConnected && div.closest &&
        div.closest('[class*="gui_blocks-wrapper"]'));
    const ws = getWorkspace();
    if (ws && typeof ws.getInjectionDiv === 'function') {
        const div = ws.getInjectionDiv();
        if (inEditor(div)) return div;
    }
    const first = document.querySelector('.injectionDiv');
    return inEditor(first) ? first : null;
};

// The clip box needs no script: `.injectionDiv` is `position: absolute; inset: 0` inside `.blocks`
// (components/blocks/blocks.css), so an absolutely positioned child pinned to its four edges is
// the workspace box exactly, and the browser carries it along on scroll and resize. Tracking the
// rect from script (which is what a `position: fixed` overlay needs) always trails the compositor
// by a frame, which is what made the buttons lag while a page scrollbar was being dragged.

// The main workspace's two scrollbars get z-index 46 so they paint above the overlay (40) while
// staying below the block drag surface (50) -- lifting them to 51+ would make them paint over a
// block being dragged, which Blockly's own layout does not do. Done here,
// by DOM position, rather than in CSS: the flyout's scrollbars carry the same class, and lifting
// those would paint them over the blocks being dragged out of the flyout. Each scrollbar svg is
// inserted right after its own workspace svg (scrollbar.js), so the main pair follows
// `.blocklySvg` while the flyout's follows `.blocklyFlyout`.
const liftedScrollbars = new Set();

const liftMainScrollbars = () => {
    const main = new Set();
    const bars = document.querySelectorAll('.blocklyScrollbarVertical, .blocklyScrollbarHorizontal');
    bars.forEach(bar => {
        const prev = bar.previousElementSibling;
        const prevIsBar = Boolean(prev) && (
            prev.classList.contains('blocklyScrollbarVertical') ||
            prev.classList.contains('blocklyScrollbarHorizontal'));
        const followsMainSvg = Boolean(prev) && (
            prev.classList.contains('blocklySvg') ||
            (prevIsBar && prev.previousElementSibling &&
                prev.previousElementSibling.classList.contains('blocklySvg')));
        if (followsMainSvg) main.add(bar);
    });
    main.forEach(bar => {
        if (bar.style.zIndex !== '46') bar.style.zIndex = '46';
        liftedScrollbars.add(bar);
    });
    // Drop the lift from any bar that is no longer one of the main pair (workspace rebuilt, or the
    // element got reused elsewhere).
    liftedScrollbars.forEach(bar => {
        if (!main.has(bar)) {
            bar.style.zIndex = '';
            liftedScrollbars.delete(bar);
        }
    });
};

const releaseMainScrollbars = () => {
    liftedScrollbars.forEach(bar => {
        bar.style.zIndex = '';
    });
    liftedScrollbars.clear();
};

const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = cssModule;
    document.head.appendChild(style);
};

const buildButton = (icon, labelKey, action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hm-zoom-controls__button';
    btn.innerHTML = ICONS[icon];
    // Read on every hover: the overlay is built once, outside React, so a language switch made
    // from the menu (which swaps the message table) would otherwise leave a stale tooltip.
    const refresh = () => {
        const label = hmMessage(MSG[labelKey]);
        btn.title = label;
        btn.setAttribute('aria-label', label);
    };
    refresh();
    btn.addEventListener('mouseover', refresh);
    // The workspace treats a press on its own surfaces as the start of a scroll/drag; the button
    // must not hand that press on. Click still fires, and it is the only thing acted on.
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
        e.stopPropagation();
        const ws = getWorkspace();
        if (!ws) return;
        // Same side effect the SVG handlers have: the click counts as focusing the workspace.
        if (ws.markFocused) ws.markFocused();
        action(ws);
    });
    return btn;
};

const buildDom = () => {
    // Two levels: an outer box sized to the workspace that clips, and the column inside it. Blockly
    // slides its own controls out past the workspace edge, where the svg clips them; this overlay
    // lives outside that svg, so without a clipping box of its own the buttons would visibly slide
    // across the panel next to the workspace instead of disappearing at the edge.
    const clip = document.createElement('div');
    clip.className = 'hm-zoom-clip';
    const root = document.createElement('div');
    root.className = 'hm-zoom-controls';
    root.appendChild(buildButton('in', 'zoomIn', ws => ws.zoomCenter(1)));
    root.appendChild(buildButton('out', 'zoomOut', ws => ws.zoomCenter(-1)));
    root.appendChild(buildButton('reset', 'reset', ws => ws.setScale(ws.options.zoomOptions.startScale)));
    clip.appendChild(root);
    return clip;
};

let mounted = null;
// The inner column; `mounted` is its clipping box.
let controlsEl = null;

// ---- custom-zoom compatibility -------------------------------------------------------------
// The custom-zoom addon can auto-hide the zoom controls: it toggles `sa-custom-zoom-hidden` on
// the native `.blocklyZoom` group, which slides that group out of the corner, and its own hover
// area in the corner slides them back. Our overlay replaces that group, so it has to mirror the
// class -- otherwise the native controls would leave while ours stayed put, and nothing would
// bring anything back. Its hover area is position based, so the same gesture reaches us.
let nativeObserver = null;
let observedNative = null;
let dragObserver = null;
let observedDragSurface = null;
// What was last applied to the overlay, so a DOM mutation storm (a large workspace) does not turn
// every observer callback into a computed-style read and an attribute write.
let appliedHidden = null;
let appliedSpeed = null;

// Blockly drags blocks on its own surface: `display: block` while a drag is on, `none` otherwise
// (block_drag_surface.js setBlocksAndShow / clearAndHide). While it is up, nothing must slide the
// controls back in -- with custom-zoom's auto-hide, dragging through the corner would otherwise
// pop them out in the middle of the gesture.
const isBlockDragging = () => Boolean(observedDragSurface) &&
    observedDragSurface.style.display !== 'none' &&
    observedDragSurface.style.display !== '';

const syncWithCustomZoom = forceSpeed => {
    if (!mounted || !observedNative) return;
    // The class only means "auto-hide is running" while the addon's hover area exists. If the
    // addon was disabled without cleaning up, the class can linger; without its area nothing would
    // ever bring the controls back, so that leftover must not hide ours.
    const autoHideRunning = Boolean(document.querySelector('.sa-custom-zoom-area'));
    const addonHides = autoHideRunning &&
        observedNative.classList.contains('sa-custom-zoom-hidden');
    // Only under auto-hide: without it the controls are meant to be always visible, and hiding
    // them during a drag would be a change of our own, not a match of the addon's behaviour.
    const hidden = addonHides || (autoHideRunning && isBlockDragging());
    if (hidden !== appliedHidden) {
        appliedHidden = hidden;
        if (controlsEl) controlsEl.classList.toggle('hm-zoom-controls--hidden', hidden);
    }
    if (forceSpeed || appliedSpeed === null) {
        // The addon writes its transition speed to the group's own style, which our overlay cannot
        // inherit; copy it over so both slide at the same rate (its "none" ends up as 0s).
        let speed = '';
        try {
            speed = window.getComputedStyle(observedNative)
                .getPropertyValue('--sa-custom-zoom-speed').trim();
        } catch (e) {
            speed = '';
        }
        appliedSpeed = speed;
        if (controlsEl) controlsEl.style.setProperty('--hm-zoom-speed', speed || '0.3s');
    }
};

const watchNativeZoom = () => {
    // Both are re-created with the workspace, so this runs again on every remount.
    liftMainScrollbars();
    // The drag surface carries the "is a block being dragged" signal above; watch it alongside the
    // native group. Both are re-created when the workspace is, so the watcher re-binds with them.
    // Taken off the main workspace rather than by class: the "make a new block" dialog has its own
    // workspace, and its drag surface / zoom group come earlier in the document.
    const ws = getWorkspace();
    const dragSurface = (ws && ws.workspaceDragSurface_ && ws.workspaceDragSurface_.SVG_) ||
        document.querySelector('.blocklyBlockDragSurface');
    if (dragSurface !== observedDragSurface) {
        if (dragObserver) {
            dragObserver.disconnect();
            dragObserver = null;
        }
        observedDragSurface = dragSurface;
        if (dragSurface) {
            dragObserver = new MutationObserver(() => syncWithCustomZoom(false));
            dragObserver.observe(dragSurface, {attributes: true, attributeFilter: ['style']});
        }
    }

    const nativeZoom = (ws && ws.zoomControls_ && ws.zoomControls_.svgGroup_) ||
        document.querySelector('.blocklyZoom');
    if (!nativeZoom) {
        if (nativeObserver) {
            nativeObserver.disconnect();
            nativeObserver = null;
            observedNative = null;
        }
        return;
    }
    if (nativeZoom === observedNative) {
        syncWithCustomZoom(false);
        return;
    }
    if (nativeObserver) nativeObserver.disconnect();
    observedNative = nativeZoom;
    nativeObserver = new MutationObserver(mutations => {
        // `style` is watched too: the speed custom property is set on the group's inline style.
        const styleChanged = mutations.some(m => m.attributeName === 'style');
        syncWithCustomZoom(styleChanged);
    });
    nativeObserver.observe(nativeZoom, {attributes: true, attributeFilter: ['class', 'style']});
    syncWithCustomZoom(true);
};

const mount = () => {
    // `.injectionDiv` is thrown away whenever the Blocks component remounts (a time-travel jump, a
    // block theme change); our overlay goes with it, so drop the stale reference and mount again
    // instead of doing nothing.
    if (mounted && !mounted.isConnected) {
        mounted = null;
    }
    if (mounted) {
        // Mounted, but possibly in the wrong place: a dialog's workspace can hand us its injection
        // div during a rebuild. Re-home the overlay instead of leaving it in the dialog.
        const expected = getMainInjectionDiv();
        if (expected && mounted.parentNode !== expected) {
            mounted.remove();
            mounted = null;
            controlsEl = null;
        } else {
            watchNativeZoom();
            return;
        }
    }
    const host = getMainInjectionDiv();
    if (!host) return;
    injectStyle();
    document.documentElement.classList.add(HTML_CLASS);
    const el = buildDom();
    host.appendChild(el);
    mounted = el;
    controlsEl = el.firstChild;
    // A fresh overlay starts with nothing applied to it.
    appliedHidden = null;
    appliedSpeed = null;
    watchNativeZoom();
};

const unmount = () => {
    document.documentElement.classList.remove(HTML_CLASS);
    releaseMainScrollbars();
    if (nativeObserver) {
        nativeObserver.disconnect();
        nativeObserver = null;
        observedNative = null;
    }
    if (dragObserver) {
        dragObserver.disconnect();
        dragObserver = null;
    }
    observedDragSurface = null;
    appliedHidden = null;
    appliedSpeed = null;
    if (mounted) {
        mounted.remove();
        mounted = null;
    }
    controlsEl = null;
};

const apply = enabled => {
    if (typeof document === 'undefined') return;
    if (enabled) {
        mount();
    } else {
        unmount();
    }
};

/**
 * Applies the saved value and keeps it in sync from then on.
 * Safe to call once, when the editor interface comes up. The `.injectionDiv` may not exist yet
 * (Blockly injects it asynchronously), so we watch the document for it.
 */
const initZoomToolboxStyle = () => {
    if (typeof document === 'undefined') return;

    const tryMount = () => {
        if (getSetting(SETTING_WORKSPACE_ZOOM_TOOLBOX_STYLE)) mount();
    };

    tryMount();


    // The injection div is created after the editor mounts, and re-created on remount: watching
    // the document is what lets the overlay come back without the user re-toggling the setting.
    const observer = new MutationObserver(tryMount);
    observer.observe(document.body, {childList: true, subtree: true});

    onSettingsChange((key, value) => {
        if (key === SETTING_WORKSPACE_ZOOM_TOOLBOX_STYLE) apply(value);
    });
};

export {
    initZoomToolboxStyle
};
