/**
 * Renders Scratch "block XML" into a static SVG picture.
 *
 * Used by the comment markdown editor for ```blocks fenced code blocks: the fence's contents are
 * the very XML format the editor workspace speaks
 *   <block type="event_whenflagclicked"><next><block type="motion_turnleft">...</block></next></block>
 * so it is parsed with scratch-blocks itself rather than a third-party renderer. The picture then
 * matches the editor exactly (custom blocks and extension blocks included) and no extra dependency
 * is needed, because scratch-blocks is already loaded in the editor (tw-lazy-scratch-blocks).
 *
 * Blockly can only build block SVG inside a *rendered* WorkspaceSvg, so a single off-screen
 * workspace is created lazily and reused for every preview:
 *   - the host is parked outside the viewport but kept laid out (never `display:none`, which would
 *     break the measurements Blockly relies on),
 *   - `readOnly: true` yields a bare workspace (no toolbox, flyout, scrollbars or trashcan),
 *   - `Blockly.inject` assigns `Blockly.mainWorkspace`, so that is saved and restored around the
 *     call to leave the editor's own workspace untouched.
 *
 * The clone keeps the `blocklySvg` class so Blockly's global CSS (font, text fill, ...) still
 * applies, while an inline style neutralises that class's absolute positioning and workspace
 * background so the picture flows inside the comment preview.
 */

import LazyScratchBlocks from '../tw-lazy-scratch-blocks';

const HOST_ID = 'hm-md-blocks-host';

// A little headroom around the measured bounds: connection nubs and the stack-glow filter reach
// slightly beyond the bare geometry, and `getBBox()` excludes stroke width / filter effects.
const PADDING = 3;

// Editor chrome that must not end up in the picture.
const CHROME_SELECTOR = [
    '.blocklyMainBackground',
    '.blocklyBubbleCanvas',
    '[class*="blocklyScrollbar"]',
    '.blocklyTrashcan',
    '.blocklyZoom',
    '[class*="blocklyFlyout"]',
    '[class*="blocklyToolbox"]'
].join(',');

// The lazily created off-screen workspace and its host element.
let host = null;
let workspace = null;

// Dispose the previously rendered blocks without touching `Workspace.prototype.clear()`, which
// calls the *global* Blockly.WidgetDiv.hide()/DropDownDiv.hideWithoutAnimation() and would close an
// inline field editor the user happens to have open in the real workspace.
const clearLoadedBlocks = ws => {
    if (!ws) return;
    ws.getTopBlocks(false).forEach(block => {
        try {
            block.dispose(false, false);
        } catch (e) {
            // A block that is already gone is not a problem.
        }
    });
};

const ensureWorkspace = ScratchBlocks => {
    if (workspace && host && host.isConnected) return workspace;
    // No workspace yet, or the host was dropped from the document: start from a clean slate.
    disposeBlockRenderer();

    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = [
        'position: fixed',
        'left: -100000px',
        'top: 0',
        'width: 1200px',
        'height: 1200px',
        'visibility: hidden',
        'pointer-events: none',
        'z-index: -1'
    ].join(';');
    document.body.appendChild(host);

    // Inherit the editor's own media path / direction so the picture is identical to the workspace.
    const main = typeof ScratchBlocks.getMainWorkspace === 'function' ?
        ScratchBlocks.getMainWorkspace() : null;
    const mainOptions = (main && main.options) || {};
    const media = mainOptions.pathToMedia || 'static/blocks-media/default/';
    const rtl = !!mainOptions.RTL;

    // `Blockly.inject` reassigns Blockly.mainWorkspace; keep a handle on the real one.
    const previousMainWorkspace = ScratchBlocks.mainWorkspace;
    try {
        workspace = ScratchBlocks.inject(host, {
            readOnly: true,
            media,
            rtl,
            // Pin the scale so the viewBox below is expressed in the same units as the blocks.
            zoom: {controls: false, wheel: false, startScale: 1, maxScale: 1, minScale: 1}
        });
    } finally {
        ScratchBlocks.mainWorkspace = previousMainWorkspace;
    }

    return workspace;
};

// `Blockly.Xml.textToDom` insists on a single <xml> root, and the fence usually holds bare <block>
// elements, so wrap when needed (an XML declaration is dropped first).
const toXmlDom = (ScratchBlocks, xmlText) => {
    const body = xmlText.replace(/^\s*<\?xml[^>]*\?>\s*/, '').trim();
    const source = /^<xml[\s>]/i.test(body) ? body : `<xml>${body}</xml>`;
    return ScratchBlocks.Xml.textToDom(source);
};

// Tight bounds of everything currently drawn in the workspace, in the block canvas' own
// coordinate space. `getBBox()` is geometric, so unlike `getBlocksBoundingBox()` it also covers
// decoration drawn outside a block's own bounding box — notably the hat of hat blocks such as
// `event_whenflagclicked`, which would otherwise be clipped off the top of the picture.
const getDrawnBounds = ws => {
    try {
        const canvas = ws.getCanvas();
        if (canvas && typeof canvas.getBBox === 'function') {
            const bbox = canvas.getBBox();
            if (bbox && bbox.width && bbox.height) return bbox;
        }
    } catch (e) {
        // Not measurable (workspace not laid out): fall back to the computed bounds below.
    }
    return ws.getBlocksBoundingBox();
};

const buildSvg = (ScratchBlocks, xmlText) => {
    const ws = ensureWorkspace(ScratchBlocks);
    clearLoadedBlocks(ws);

    let dom;
    try {
        dom = toXmlDom(ScratchBlocks, xmlText);
    } catch (e) {
        return null;
    }

    try {
        ScratchBlocks.Xml.domToWorkspace(dom, ws);
    } catch (e) {
        clearLoadedBlocks(ws);
        return null;
    }

    const box = getDrawnBounds(ws);
    if (!box || !box.width || !box.height) {
        clearLoadedBlocks(ws);
        return null;
    }

    const x = Math.floor(box.x) - PADDING;
    const y = Math.floor(box.y) - PADDING;
    const width = Math.ceil(box.width) + (PADDING * 2);
    const height = Math.ceil(box.height) + (PADDING * 2);

    // Clone the whole workspace <svg>: that brings the <defs> the blocks reference along, and the
    // `blocklySvg` class keeps Blockly's global stylesheet applying to the picture.
    const svg = ws.getParentSvg().cloneNode(true);
    svg.querySelectorAll(CHROME_SELECTOR).forEach(node => node.remove());

    // Draw in the blocks' own coordinate space so the viewBox lines up with the bounding box.
    const canvas = svg.querySelector('.blocklyBlockCanvas');
    if (canvas) canvas.removeAttribute('transform');

    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('hm-md-blocks-svg');
    // Neutralise the ".blocklySvg" rules: absolute positioning and the workspace background would
    // both break the layout inside the comment preview. `overflow: hidden` (from the class) is kept
    // on purpose so nothing can spill out of the viewBox.
    svg.setAttribute('style',
        'position:static;display:block;background:transparent;max-width:100%;height:auto;');

    clearLoadedBlocks(ws);
    return svg;
};

/**
 * Turns block XML into an SVG element, or returns null when it cannot be rendered (invalid XML,
 * no blocks, or scratch-blocks not loaded yet) so callers can fall back to plain source code.
 * @param {string} xmlText contents of a ```blocks fenced code block
 * @return {SVGElement|null} the rendered picture
 */
const renderBlockXmlToSvg = xmlText => {
    if (typeof document === 'undefined') return null;
    if (!xmlText || !xmlText.trim()) return null;
    if (!LazyScratchBlocks.isLoaded()) return null;

    const ScratchBlocks = LazyScratchBlocks.get();
    try {
        return buildSvg(ScratchBlocks, xmlText);
    } catch (e) {
        return null;
    }
};

/**
 * Tears the off-screen workspace down; called when the markdown editor is switched off.
 */
const disposeBlockRenderer = () => {
    if (workspace) {
        try {
            workspace.dispose();
        } catch (e) {
            // ignore
        }
        workspace = null;
    }
    if (host && host.parentNode) {
        host.parentNode.removeChild(host);
    }
    host = null;
};

export {
    renderBlockXmlToSvg,
    disposeBlockRenderer,
    toXmlDom
};
