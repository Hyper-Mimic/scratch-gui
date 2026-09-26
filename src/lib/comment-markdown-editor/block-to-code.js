/**
 * "Drop a block into the comment's code."
 *
 * The mirror image of block-drag.js: a block dragged out of the workspace and released over a
 * comment's edit area becomes a ```blocks fenced code block inserted at the caret, so a comment can
 * be written out of real blocks instead of hand-typed XML.
 *
 * Two scratch-blocks details shape the implementation:
 *
 * 1. Where the drop landed cannot be hit-tested. While a block is being dragged it rides on
 *    `.blocklyBlockDragSurface`, an overlay spanning the workspace, which would answer
 *    `elementFromPoint` in place of the comment underneath. The comment is therefore found by
 *    measuring `.scratchCommentForeignObject` boxes.
 *
 * 2. The drag can only be intercepted in the *capture* phase. scratch-blocks ends it from the
 *    `mouseup` that `Gesture.doStart` bound on `document`, and that handler is what places the
 *    block under the pointer. Running first lets the drag be ended by hand instead — with a zero
 *    delta, so the block returns to exactly the spot it was picked up from and the comment gets a
 *    copy. The gesture is retired before Blockly's own handler runs; the flag it checks is
 *    `isEnding_`, which keeps a second `mouseup` from ending the drag twice.
 *
 * 3. Fences do not nest, so the caret is not obeyed blindly: a block dropped while the caret sits
 *    inside an existing fenced block is written on the line *after* that block instead (see
 *    fences.js) — writing at the caret there would close the outer fence early and leave the XML
 *    showing as plain text.
 *
 * 4. A block dragged out of the flyout counts as much as one dragged out of the workspace. The
 *    flyout clones the block onto the workspace when the drag starts, so by the time it is over the
 *    comment a real block is in flight and its XML can be read like any other. Only the ending
 *    differs: the copy is not part of the program yet and must not be left behind — see
 *    `endDragInPlace`.
 *
 * 5. A block that was itself dragged *out* of a comment is a copy of a fence, and dragging it back
 *    into a comment is that fence coming home (block-origin.js says how it is recognised). The fence
 *    is written like any other, and then the copy is removed from the workspace: the user took those
 *    blocks out and put them back, and a leftover stack sitting under the comment is not part of the
 *    program they wrote. A copy that has been built into the program — blocks of the user's own
 *    attached to it — no longer counts, and stays where it is.
 *
 * The landing spot is not the caret at all when the drop can be aimed: while the drag is in flight
 * `drop-indicator.js` measures where the pointer is inside the comment, draws a rule there and hands
 * back the character offset to write to. The caret is the fallback for drops that never hovered a
 * measurable position.
 */

import LazyScratchBlocks from '../tw-lazy-scratch-blocks';
import {findFenceExit} from './fences.js';
import {cameFromComment} from './block-origin.js';
import {
    resolveDropTarget,
    showDropIndicator,
    hideDropIndicator,
    disposeDropIndicator
} from './drop-indicator.js';

// The comment's edit area: the `position: relative` box that exactly wraps the textarea.
const AREA_SELECTOR = '.scratchCommentForeignObject';
const TEXTAREA_SELECTOR = '.scratchCommentTextarea';

// Put on the edit area while a dragged block hovers it; the stylesheet lives in index.js.
const DROP_TARGET_CLASS = 'hm-md-code-drop';

const FENCE_OPEN = '```blocks';
const FENCE_CLOSE = '```';

let listening = false;
let hovered = null;

const isHidden = el =>
    el.getAttribute('display') === 'none' || el.style.display === 'none';

// The comment whose edit area contains a screen point. Measured rather than hit-tested: see the
// note at the top. A minimized comment is skipped — its edit area is hidden or has collapsed.
const findCommentAreaAt = (x, y) => {
    const areas = document.querySelectorAll(AREA_SELECTOR);
    for (const area of areas) {
        if (isHidden(area)) continue;
        const rect = area.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return area;
        }
    }
    return null;
};

// The block being dragged right now, if there is one. scratch-blocks parks an in-flight drag on the
// workspace as a `Gesture` (`currentGesture_`). Drags out of the flyout are drags like any other: the
// flyout has already cloned the block onto the workspace (`Flyout.createBlock`), and the gesture is
// registered on the workspace that owns the flyout, so the clone is found the same way — and it is
// the clone whose XML is read, which is exactly the block the user sees under the pointer.
const findBlockDrag = () => {
    if (!LazyScratchBlocks.isLoaded()) return null;
    const ScratchBlocks = LazyScratchBlocks.get();
    const registry = ScratchBlocks.Workspace && ScratchBlocks.Workspace.WorkspaceDB_;
    if (!registry) return null;
    for (const id of Object.keys(registry)) {
        const workspace = registry[id];
        const gesture = workspace && workspace.currentGesture_;
        if (!gesture || !gesture.isDraggingBlock_) continue;
        const dragger = gesture.blockDragger_;
        const block = dragger && dragger.draggingBlock_;
        if (block) return {ScratchBlocks, gesture, dragger, block, fromFlyout: !!gesture.flyout_};
    }
    return null;
};

// The dragged stack as XML, in the shape the fences are written in: no ids (they would collide with
// the ones the workspace already knows) and one element per line, which is what a fence should look
// like when somebody opens it in the editor.
const blockToXml = (ScratchBlocks, block) => {
    try {
        const dom = ScratchBlocks.Xml.blockToDom(block, true);
        if (!dom) return '';
        const toText = ScratchBlocks.Xml.domToPrettyText || ScratchBlocks.Xml.domToText;
        return String(toText.call(ScratchBlocks.Xml, dom))
            // Serialising an HTML element attaches the HTML namespace; it means nothing inside a
            // fence and only gets in the way of reading (or re-importing) the XML.
            .replace(/\s+xmlns="[^"]*"/g, '')
            .trim();
    } catch (e) {
        return '';
    }
};

// A point that is inside neither the workspace rectangle nor any delete area. "The pointer left the
// workspace" is the one thing a drag can be ended with that asks scratch-blocks to *remove* what the
// drag created, so it is how a copy dragged out of the flyout is sent back (see below).
const OUTSIDE = -1e5;

// Ends the drag without putting a block into the workspace. `endBlockDrag` places the block at
// `startXY + delta`, so a zero delta leaves it exactly where it was when the drag started — and where
// that is decides how the drag has to end:
//
// - Picked up in the workspace: the block goes back on the spot it came from, and the press position
//   is handed over as the event, because the checks behind it (is this a delete area? did the pointer
//   leave the blocks area?) read nothing but `clientX`/`clientY` and the press was inside the
//   workspace.
//
// - Picked up in the flyout: there is no "where it came from" to go back to, because the flyout never
//   had this block — it cloned it onto the workspace for the drag, and that copy is not part of the
//   program. Ending the drag from a point outside the workspace is exactly the request to undo the
//   copy: scratch-blocks then undoes the whole gesture, and since the copy's creation and every move
//   it made share one undo group, one undo removes the copy and leaves the undo history as if the
//   drag had never happened. (Releasing such a block over the palette gets the same outcome by a
//   different route — there the point is a delete area.)
//
// Events are muted for the call: the block never actually moves, and the `BlockMove` this would
// otherwise record (old position -> the same position) would only sit in the undo history. The copy
// from the flyout is removed by the undo above, which is not an event of this call.
const endDragInPlace = drag => {
    const {ScratchBlocks, gesture, dragger} = drag;
    const start = gesture.mouseDownXY_ || {x: 0, y: 0};
    const at = drag.fromFlyout ? {clientX: OUTSIDE, clientY: OUTSIDE} :
        {clientX: start.x, clientY: start.y};
    ScratchBlocks.Events.disable();
    try {
        dragger.endBlockDrag(at, {x: 0, y: 0});
    } catch (e) {
        // Leave the drag alone and let scratch-blocks finish it the normal way.
        return false;
    } finally {
        ScratchBlocks.Events.enable();
    }
    // The gesture owns the document listeners driving the drag, so it has to be retired before
    // Blockly's own `mouseup` handler runs — which is what `isEnding_` tells that handler.
    gesture.isEnding_ = true;
    if (typeof gesture.dispose === 'function') gesture.dispose();
    return true;
};

// Takes a fence's copy back out of the workspace, now that the fence has been written into a comment
// again. This runs after `endDragInPlace`, so the drag is over and the blocks are ordinary blocks
// again; `dispose(true)` is the plain way to delete a stack, and healing the stack is what the same
// deletion from the context menu would do.
//
// This is deliberately *not* the flyout's route (`workspace.undo()`): the undo there works because
// the flyout's copy and every move it made share one undo group, whereas this copy was created by
// `block-drag.js` and is genuinely part of the workspace until now. Disposing of it leaves Blockly's
// undo stack holding the drag-out's "created" event and this "deleted" one, which undo correctly
// reads as "put the workspace back the way it was before the copy came home".
const discardCopy = block => {
    try {
        block.dispose(true);
    } catch (e) {
        // A copy that will not go away is not worth failing the drop over: the fence has been written
        // already, and leaving the copy in the workspace is the behaviour this feature started from.
    }
};

// Inserts the fence at the caret, on a section of its own: markdown needs the blank lines, and a
// fence glued to the surrounding text would render as one big code block.
//
// `offset` is the spot the drop indicator pointed at; without one (a drop that never hovered a
// measurable position) the caret is used as before.
const insertXmlFence = (textarea, xml, offset) => {
    const value = textarea.value;
    const aimed = typeof offset === 'number' && offset >= 0;
    const typedStart = aimed ? Math.min(offset, value.length) :
        (typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length);
    const typedEnd = aimed ? typedStart :
        (typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : typedStart);
    // The indicator already places itself outside any fence, but an offset that skipped the
    // indicator (or a caret left inside one) still has to be pushed below it: nesting a fence breaks
    // both blocks. Moving out of a fence also collapses any selection, which referred to the inside
    // of the old block and is not what was dropped.
    const start = findFenceExit(value, typedStart);
    const end = start === typedStart ? typedEnd : start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const lead = !before ? '' : (/\n\n$/.test(before) ? '' : (/\n$/.test(before) ? '\n' : '\n\n'));
    const trail = !after ? '' : (/^\n/.test(after) ? '\n' : '\n\n');
    const snippet = `${lead}${FENCE_OPEN}\n${xml}\n${FENCE_CLOSE}${trail}`;

    textarea.value = before + snippet + after;
    const caret = before.length + snippet.length;
    if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(caret, caret);
    }

    // scratch-blocks stores the comment's own text on `change` (the listener it binds on the
    // textarea), while the editor redraws its preview on `input`. Both are needed: the first keeps
    // the project in sync, the second refreshes the preview when the comment is not in code mode.
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
    textarea.dispatchEvent(new Event('change', {bubbles: true}));
};

const setHover = next => {
    if (hovered === next) return;
    if (hovered) hovered.classList.remove(DROP_TARGET_CLASS);
    hovered = next;
    if (hovered) hovered.classList.add(DROP_TARGET_CLASS);
};

// While a block is in flight over a comment, show where it would land. The rule is what makes the
// drop predictable: the insertion point is the pointer, not an invisible caret left somewhere in the
// text, and a rule sitting inside an existing fenced block never appears because the offset is
// already pushed below it.
const trackDrop = (area, clientY) => {
    if (!area) {
        hideDropIndicator();
        return;
    }
    showDropIndicator(area, resolveDropTarget(area, clientY));
};

const onMouseMove = event => {
    if (!findBlockDrag()) {
        setHover(null);
        hideDropIndicator();
        return;
    }
    const area = findCommentAreaAt(event.clientX, event.clientY);
    setHover(area);
    trackDrop(area, event.clientY);
};

const onMouseUp = event => {
    const drag = findBlockDrag();
    setHover(null);
    hideDropIndicator();
    if (!drag) return;

    const area = findCommentAreaAt(event.clientX, event.clientY);
    if (!area) return;
    const textarea = area.querySelector(TEXTAREA_SELECTOR);
    if (!textarea) return;

    const xml = blockToXml(drag.ScratchBlocks, drag.block);
    if (!xml) return;

    // Asked while the block is still in flight, because what this drag ends with depends on it: a
    // copy of a fence goes home (below), anything else stays where it was.
    const fromComment = !!cameFromComment(drag.block);

    // Resolved before the drag is retired: it measures live geometry, and the drop has to write to
    // the same spot the rule was showing.
    const target = resolveDropTarget(area, event.clientY);
    if (!endDragInPlace(drag)) return;
    insertXmlFence(textarea, xml, target ? target.offset : undefined);
    // Written last, so a fence that never made it into the text never costs the user their blocks.
    if (fromComment) discardCopy(drag.block);
};

/**
 * Starts watching for blocks dropped onto comments. The listeners sit on `document` (capture
 * phase — see the note at the top) and bail out immediately unless a block drag is in flight.
 */
const startBlockToCode = () => {
    if (typeof document === 'undefined' || listening) return;
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    listening = true;
};

const stopBlockToCode = () => {
    if (typeof document === 'undefined' || !listening) return;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    setHover(null);
    // Both the rule and the measuring mirror are parked in comment DOM; leaving them behind would
    // keep a stale twin of the textarea around.
    disposeDropIndicator();
    listening = false;
};

export {
    startBlockToCode,
    stopBlockToCode,
    DROP_TARGET_CLASS
};
