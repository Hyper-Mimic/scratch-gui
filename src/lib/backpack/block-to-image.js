import computedStyleToInlineStyle from 'computed-style-to-inline-style';
import LazyScratchBlocks from '../tw-lazy-scratch-blocks';

/**
 * The frames in a payload, as boxes in workspace coordinates.
 *
 * `<frame>` carries everything a picture needs: where the box is, how big it is, its colour and its
 * title. Parsed here rather than passed as objects so the caller can hand over the same XML string
 * it stores in the item -- no second copy of the geometry to keep in step.
 * @param {?string} framesXml `<frame>` elements
 * @returns {Array<object>} boxes, in document order
 */
const frameBoxes = framesXml => {
    if (!framesXml || typeof DOMParser === 'undefined') return [];
    let doc = null;
    try {
        doc = new DOMParser().parseFromString(`<xml>${framesXml}</xml>`, 'text/xml');
    } catch (e) {
        return [];
    }
    const elements = doc.getElementsByTagName('frame');
    const boxes = [];
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        boxes.push({
            x: Number(element.getAttribute('x')) || 0,
            y: Number(element.getAttribute('y')) || 0,
            width: Number(element.getAttribute('w')) || 0,
            height: Number(element.getAttribute('h')) || 0,
            colour: element.getAttribute('colour') || '#fef49c',
            title: (element.textContent || '').trim()
        });
    }
    return boxes;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// Matches Blockly.ScratchBubble.TOP_BAR_HEIGHT; the comment's own body text starts below it.
const COMMENT_TOP_BAR_HEIGHT = 32;

/**
 * The comment bubbles attached to a captured block, directly or through its
 * descendants (a comment may sit on any block of the stack, not just the top
 * one). Each entry carries the live SVG group to clone plus the bubble's
 * geometry in workspace coordinates -- the same space the block bounds use.
 * @param {object} block a BlockSvg
 * @returns {Array<{comment: object, group: SVGElement, x: number, y: number, width: number, height: number}>}
 */
const commentBubblesOf = block => {
    const out = [];
    const seen = new Set();
    const candidates = [block];
    if (typeof block.getDescendants === 'function') {
        candidates.push(...block.getDescendants(false));
    }
    for (const b of candidates) {
        const comment = b.comment;
        if (!comment || seen.has(comment)) continue;
        seen.add(comment);
        const group = comment.bubble_ && comment.bubble_.bubbleGroup_;
        if (!group) continue; // never rendered / disposed
        // ScratchBlockComment exposes `getXY` (not `getRelativeToSurfaceXY`, which only
        // exists on the plain Bubble class) and `getHeightWidth` for the full-size box.
        let pos = null;
        try {
            pos = comment.getXY();
        } catch (e) {
            pos = null;
        }
        if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) continue;
        const size = comment.getHeightWidth ? comment.getHeightWidth() : {width: 0, height: 0};
        out.push({
            comment,
            group,
            x: pos.x,
            y: pos.y,
            width: size.width || 0,
            height: size.height || 0
        });
    }
    return out;
};

/**
 * Run `fn` with the workspace's box-selection highlighting taken off.
 *
 * The highlight is painted onto the block's own DOM — a darkened fill, a brighter outline, a border
 * around every field, plus two classes on the group — so a clone of a selected block carries all of
 * it, and an item added from a box selection showed the highlight instead of the blocks' real
 * colours. Clearing it around the clone (and repainting it afterwards through `setBoxSelection`, so
 * the nested-child border colours are recomputed exactly as the editor had them) is the only way to
 * get an unstyled copy without copying scratch-blocks' paint/restore logic over here. The clear, the
 * clone and the repaint all happen within one task, so no frame is painted in the in-between state:
 * the selection never visibly blinks.
 * @param {object} workspace the Blockly workspace the blocks live in
 * @param {function} fn runs while the blocks look unselected
 * @returns {*} whatever `fn` returns
 */
const withoutBoxSelectStyle = (workspace, fn) => {
    if (!workspace ||
        typeof workspace.getBoxSelection !== 'function' ||
        typeof workspace.clearBoxSelection !== 'function' ||
        typeof workspace.setBoxSelection !== 'function') {
        return fn();
    }
    const selection = Array.from(workspace.getBoxSelection() || []);
    if (!selection.length) return fn();
    workspace.clearBoxSelection();
    try {
        return fn();
    } finally {
        workspace.setBoxSelection(selection);
    }
};

/**
 * Where a block sits on the canvas, in workspace units.
 *
 * `getBoundingRectangle` is the accurate one, but it goes through the rendered geometry and can
 * come back empty for a stack the viewport culling has unloaded -- those keep their cached size,
 * which is all a picture of them needs.
 * @param {object} block a BlockSvg
 * @returns {{left: number, top: number, width: number, height: number}} bounding box
 */
const boundsOf = block => {
    let rect = null;
    try {
        rect = block.getBoundingRectangle();
    } catch (e) {
        rect = null;
    }
    if (rect && isFinite(rect.left) && isFinite(rect.top)) {
        return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
    }
    const pos = block.getRelativeToSurfaceXY();
    const size = block.getHeightWidth ? block.getHeightWidth() : {width: 0, height: 0};
    return {left: pos.x, top: pos.y, width: size.width || 0, height: size.height || 0};
};

/**
 * Replace every `<image>` reference in a subtree with a data URI of the file it points at.
 *
 * Runs against the copy that is only on the page for the length of this measurement, so writing
 * into it is harmless. Failures are swallowed: a missing icon should cost the icon, not the
 * thumbnail.
 * @param {SVGSVGElement} svg the picture being assembled
 * @returns {Promise} resolves once every image has been visited
 */
const inlineImages = svg => {
    const images = Array.from(svg.getElementsByTagName('image'));
    const jobs = images.map(image => {
        const href = image.getAttribute('xlink:href') || image.getAttribute('href');
        if (!href || href.indexOf('data:') === 0) return Promise.resolve();
        return fetch(href)
            .then(response => (response.ok ? response.blob() : null))
            .then(blob => {
                if (!blob) return null;
                return new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
            })
            .then(dataUrl => {
                if (!dataUrl) return;
                image.setAttribute('href', dataUrl);
                image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl);
            })
            .catch(() => {});
    });
    return Promise.all(jobs);
};

/**
 * Given a block id -- or a list of them -- return a data-uri image of those blocks.
 *
 * Several ids are drawn as one picture, at the positions they occupy on the canvas: a backpack
 * item made from a box selection or from a frame holds several stacks, and a thumbnail of just the
 * first one misrepresents it.
 * @param {(string|Array<string>)} blockIds id, or ids, of the top-level blocks to draw
 * @param {?string} framesXml the item's `<frame>` elements, drawn under the blocks
 * @return {Promise} resolves to a data-url of a picture of the blocks
 */
export default function (blockIds, framesXml) {
    const ids = Array.isArray(blockIds) ? blockIds : [blockIds];
    // Not sure any better way to access the scratch-blocks workspace than this...
    const ScratchBlocks = LazyScratchBlocks.get();
    // The editor's workspace, not "the last one injected": with the "make a new block" dialog open,
    // `getMainWorkspace()` points at the dialog's workspace and the block is not in it.
    const workspace = (window.AddonHooks && window.AddonHooks.blocklyWorkspace) ||
        ScratchBlocks.getMainWorkspace();

    const blocks = [];
    for (const id of ids) {
        const block = workspace.getBlockById(id);
        if (!block || !block.getSvgRoot()) continue;
        blocks.push(block);
    }

    const clones = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let wantsHatPadding = false;
    withoutBoxSelectStyle(workspace, () => {
        for (const block of blocks) {
            const root = block.getSvgRoot();
            clones.push(root.cloneNode(true /* deep */));
            if (root.getAttribute('data-shapes') === 'hat') {
                wantsHatPadding = true;
            }
            const bounds = boundsOf(block);
            minX = Math.min(minX, bounds.left);
            minY = Math.min(minY, bounds.top);
            maxX = Math.max(maxX, bounds.left + bounds.width);
            maxY = Math.max(maxY, bounds.top + bounds.height);
        }
    });
    // A frame is part of what the item shows: without its box the picture is just loose blocks.
    const boxes = frameBoxes(framesXml);
    for (const box of boxes) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
    }
    // A block's note is part of what the item shows too. Cloned as-is, with two
    // fixes applied to the copy: the bubble group is re-pinned to the measured
    // workspace position (its own transform is in bubble-canvas space and is not
    // guaranteed to match), and the text editor -- a foreignObject -- is thrown
    // away and redrawn as plain <text>, because an SVG loaded as an image (which
    // is exactly what this becomes) does not render foreignObject content.
    // RTL workspaces mirror comment coordinates, which this simple translation
    // would get wrong, so they keep their textless thumbnails rather than wrong
    // ones.
    const bubbles = [];
    if (!workspace.RTL) {
        for (const block of blocks) {
            for (const bubble of commentBubblesOf(block)) {
                bubbles.push(bubble);
                minX = Math.min(minX, bubble.x);
                minY = Math.min(minY, bubble.y);
                maxX = Math.max(maxX, bubble.x + bubble.width);
                maxY = Math.max(maxY, bubble.y + bubble.height);
            }
        }
    }
    if (!clones.length || !isFinite(minX) || !isFinite(minY)) {
        return Promise.resolve('');
    }

    const padding = 10;
    // A hat's notch is drawn above the block's own box, so the picture needs room for it.
    const topPadding = padding + (wantsHatPadding ? 16 : 0);
    const width = (maxX - minX) + (2 * padding);
    const height = (maxY - minY) + padding + topPadding;

    // Once we have the cloned SVG, do the rest in a setTimeout to prevent
    // blocking the drag end from finishing promptly.
    return new Promise(resolve => {
        setTimeout(() => {
            // Create an <svg> element to put the cloned blocks inside, shifted so that the group
            // starts at the padding instead of at its canvas coordinates.
            const svg = document.createElementNS(SVG_NS, 'svg');
            const group = document.createElementNS(SVG_NS, 'g');
            group.setAttribute('transform', `translate(${padding - minX} ${topPadding - minY})`);

            for (const box of boxes) {
                const rect = document.createElementNS(SVG_NS, 'rect');
                rect.setAttribute('x', box.x);
                rect.setAttribute('y', box.y);
                rect.setAttribute('width', box.width);
                rect.setAttribute('height', box.height);
                rect.setAttribute('rx', 4);
                // Opaque, like the real frame: a translucent fill picks up whatever the item sits
                // on, which on the dark UI turned the box into a muddy olive instead of the pastel
                // the editor shows.
                rect.setAttribute('fill', box.colour);
                rect.setAttribute('stroke', box.colour);
                rect.setAttribute('stroke-width', 3);
                group.appendChild(rect);
                // The title bar is what makes the shape read as a frame; an untitled frame still
                // gets the strip, just without any text on it.
                const barHeight = 24;
                const bar = document.createElementNS(SVG_NS, 'rect');
                bar.setAttribute('x', box.x);
                bar.setAttribute('y', box.y);
                bar.setAttribute('width', box.width);
                bar.setAttribute('height', barHeight);
                bar.setAttribute('rx', 4);
                // A shade over the body colour, the way the editor's own title bar reads.
                bar.setAttribute('fill', '#000000');
                bar.setAttribute('fill-opacity', '0.08');
                group.appendChild(bar);
                if (box.title) {
                    const text = document.createElementNS(SVG_NS, 'text');
                    text.setAttribute('x', box.x + 8);
                    text.setAttribute('y', box.y + barHeight - 7);
                    text.setAttribute('font-size', '12');
                    text.setAttribute('fill', '#575e75');
                    text.textContent = box.title;
                    group.appendChild(text);
                }
            }

            for (const clone of clones) {
                // TW: Fixes issues caused by scratch-blocks block hiding
                clone.style.display = '';
                // Strip &nbsp; entities that cannot be inlined
                clone.innerHTML = clone.innerHTML.replace(/&nbsp;/g, ' ');
                group.appendChild(clone);
            }

            // Comment bubbles go on top of the blocks, the way the editor stacks them.
            for (const bubble of bubbles) {
                const clone = bubble.group.cloneNode(true /* deep */);
                clone.setAttribute('transform', `translate(${bubble.x} ${bubble.y})`);
                // The editor (a textarea in a foreignObject) cannot be rendered in this
                // image context; replace it with SVG text lines.
                const editors = clone.getElementsByTagName('foreignObject');
                while (editors.length) editors[0].parentNode.removeChild(editors[0]);
                const text = bubble.comment.getText ? String(bubble.comment.getText() || '') : '';
                // A minimized bubble is only the top bar -- no body text to draw.
                if (text && bubble.height > COMMENT_TOP_BAR_HEIGHT) {
                    const lines = text.split('\n');
                    const fontSize = 12;
                    const lineHeight = 16;
                    for (let i = 0; i < lines.length; i++) {
                        const line = document.createElementNS(SVG_NS, 'text');
                        line.setAttribute('x', 10);
                        line.setAttribute('y', COMMENT_TOP_BAR_HEIGHT + 14 + (i * lineHeight));
                        line.setAttribute('font-size', `${fontSize}`);
                        line.setAttribute('font-family', '"Helvetica Neue", Helvetica, sans-serif');
                        line.setAttribute('font-weight', 'normal');
                        line.setAttribute('fill', '#575e75');
                        line.textContent = lines[i].replace(/\u00a0/g, ' ');
                        clone.appendChild(line);
                    }
                }
                group.appendChild(clone);
            }

            svg.appendChild(group);
            svg.setAttribute('width', width);
            svg.setAttribute('height', height);

            // Needs to be on the DOM to get CSS properties
            document.body.appendChild(svg);

            // A block's icon (the green flag on a hat, the sprite icon in `touching`) is an
            // <image> pointing at a file under static/blocks-media. An SVG rendered as an image --
            // which is exactly what this becomes -- may not load anything external, so those icons
            // came out blank. Reading them in first turns each one into a data URI, which is
            // self-contained.
            inlineImages(svg).then(() => {
                // We need to inline the styles set by CSS rules because
                // not all the styles are set directly on the SVG. This makes the
                // image styled the same way the block actually appears.
                computedStyleToInlineStyle(svg, {
                    recursive: true,
                    // Enumerate the specific properties we need to inline.
                    // Specifically properties that are set from CSS in scratch-blocks.
                    // `fill-opacity` matters for the comment's top bar: it is black at
                    // 10% opacity in the editor, and without this property it serialises
                    // as opaque black.
                    properties: ['fill', 'fill-opacity', 'font-family', 'font-size', 'font-weight']
                });

                const svgString = (new XMLSerializer()).serializeToString(svg);

                // Once we have the svg as a string, remove it from the DOM
                svg.parentNode.removeChild(svg);

                resolve(`data:image/svg+xml;utf-8,${encodeURIComponent(svgString)}`);
            });
        }, 10);
    });
}
