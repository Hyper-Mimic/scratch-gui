/**
 * Lets the block pictures in a comment's Markdown preview be dragged into the workspace.
 *
 * A `mousedown` on a picture copies its XML into the workspace that owns the comment bubble and then
 * hands the freshly built blocks over to scratch-blocks' own drag machinery, so the real blocks
 * follow the cursor and snap/connect exactly like blocks dragged out of the flyout.
 *
 * scratch-blocks has no "start dragging this block" entry point, but `WorkspaceSvg
 * .startDragWithFakeEvent` does the job given a synthetic mousedown: it drives a fresh
 * `Blockly.Gesture` through `forceStartBlockDrag` → `handleWsStart` → `doStart`, which is where the
 * document-level `mousemove`/`mouseup` listeners are bound (and where `mouseDownXY_` is taken from
 * the event's `clientX`/`clientY`). The drag is then carried on by the real events that follow.
 * This mirrors the hand-off used by `src/addons/addons/middle-click-popup/userscript.js`.
 *
 * The copy is tagged as "came out of a comment" (block-origin.js). Nothing here acts on the tag; it
 * is what lets `block-to-code.js` tell a block dragged back into a comment — the fence coming home,
 * whose copy has no business being left in the program — from a block the user wrote themselves.
 */

import LazyScratchBlocks from '../tw-lazy-scratch-blocks';
import {toXmlDom} from './block-renderer.js';
import {markFromComment} from './block-origin.js';

// Set by the renderer once a picture is on screen. Its presence is also what turns on the grab
// cursor, so a block that failed to render stays a plain code block.
const BLOCK_XML_ATTR = 'data-hm-block-xml';
const BLOCKS_HOLDER_SELECTOR = '.hm-md-blocks';

// The comment bubble lives in the main workspace's bubble canvas, but modal workspaces ("make a new
// block") own bubbles too. Every workspace registers itself in `WorkspaceDB_`, and the preview's
// nearest ancestor <svg> is its workspace's own root (the picture's <svg> is a descendant), so the
// two can be matched up. Falls back to the main workspace if the registry is not available.
const findOwningWorkspace = (ScratchBlocks, node) => {
    const svg = node.closest && node.closest('svg');
    const registry = ScratchBlocks.Workspace && ScratchBlocks.Workspace.WorkspaceDB_;
    if (svg && registry) {
        for (const id of Object.keys(registry)) {
            const candidate = registry[id];
            if (candidate && typeof candidate.getParentSvg === 'function' &&
                candidate.getParentSvg() === svg) {
                return candidate;
            }
        }
    }
    return typeof ScratchBlocks.getMainWorkspace === 'function' ?
        ScratchBlocks.getMainWorkspace() : null;
};

/**
 * Copies block XML into the workspace and starts dragging the copy from the given screen point.
 * @param {string} xml contents of a ```blocks fenced code block
 * @param {number} clientX pointer position, in viewport coordinates
 * @param {number} clientY pointer position, in viewport coordinates
 * @param {Element} holder the picture's `.hm-md-blocks` container, used to find the workspace
 * @return {boolean} whether a drag was started
 */
const startBlockDragFromXml = (xml, clientX, clientY, holder) => {
    if (!xml || !holder) return false;
    if (typeof document === 'undefined') return false;
    if (!LazyScratchBlocks.isLoaded()) return false;

    const ScratchBlocks = LazyScratchBlocks.get();
    const workspace = findOwningWorkspace(ScratchBlocks, holder);
    if (!workspace || typeof workspace.startDragWithFakeEvent !== 'function') return false;

    let dom;
    try {
        dom = toXmlDom(ScratchBlocks, xml);
    } catch (e) {
        return false;
    }

    // Build the copy with events off: the blocks would otherwise be recorded at domToWorkspace's
    // default position and then again at every step of the move below. A single "create" event is
    // fired at the end instead, so one undo removes the whole copy.
    let roots = [];
    ScratchBlocks.Events.disable();
    try {
        roots = (ScratchBlocks.Xml.domToWorkspace(dom, workspace) || [])
            .map(id => workspace.getBlockById(id))
            .filter(Boolean);
        if (roots.length) {
            const svgRoot = roots[0].getSvgRoot();
            if (svgRoot && typeof svgRoot.getBoundingClientRect === 'function') {
                // Screen measurements on both sides, so scroll and zoom cancel out of the delta and
                // only the scale is left to convert screen pixels into workspace units.
                const rect = svgRoot.getBoundingClientRect();
                const scale = workspace.scale || 1;
                roots[0].moveBy(
                    (clientX - ((rect.left + rect.right) / 2)) / scale,
                    (clientY - ((rect.top + rect.bottom) / 2)) / scale
                );
            }
        }
    } catch (e) {
        roots = roots.filter(Boolean);
    } finally {
        ScratchBlocks.Events.enable();
    }

    if (!roots.length) return false;

    // Tagged before the drag starts, so the copy is recognisable however this gesture ends: dropped
    // in the workspace and left there (the tag is simply never consulted), or dragged back into a
    // comment, where it says the copy has to go.
    markFromComment(roots);

    if (ScratchBlocks.Events.isEnabled()) {
        roots.forEach(block => ScratchBlocks.Events.fire(new ScratchBlocks.Events.BlockCreate(block)));
    }

    const fakeEvent = {
        clientX,
        clientY,
        type: 'mousedown',
        button: 0,
        // `doStart` looks the target up through `Blockly.utils.isTargetInput`, which dereferences
        // it, so this must be a real element.
        target: roots[0].getSvgRoot() || holder,
        preventDefault() {},
        stopPropagation() {}
    };

    // A gesture left over from earlier makes the first call cancel it and return null, so ask again
    // for a fresh one; `startDragWithFakeEvent` would throw on a null gesture.
    let ready = !!workspace.getGesture(fakeEvent);
    if (!ready) ready = !!workspace.getGesture(fakeEvent);
    if (ready) {
        workspace.startDragWithFakeEvent(fakeEvent, roots[0]);
    }

    return true;
};

export {
    startBlockDragFromXml,
    BLOCK_XML_ATTR,
    BLOCKS_HOLDER_SELECTOR
};
