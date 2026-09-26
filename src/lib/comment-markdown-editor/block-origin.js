/**
 * Records where a block in the workspace came from, for the round trip through a comment.
 *
 * Dragging a block picture out of a comment's preview copies its XML into the workspace — that is
 * the whole point of the gesture, and the copy is welcome to stay. Dragging one of those blocks back
 * into a comment, though, is that same fence coming home: the fence is written into the text, and the
 * copy must not be left behind as well, or the user ends up with blocks they never wrote sitting in
 * the program right under the comment they just edited.
 *
 * The two halves of that round trip live in different modules — `block-drag.js` makes the copy,
 * `block-to-code.js` takes it back — and neither is in charge of the other, so the *blocks* carry the
 * record: every block of a copy is tagged with one shared `origin` object, and a drag only counts as
 * a round trip while the entire dragged stack still wears that tag.
 *
 * Two properties of the tag are load-bearing:
 *
 * - It is a plain property on the block object, so `blockToDom` never writes it and it cannot travel
 *   through a fence. XML written back into a comment therefore re-imports as untagged blocks, which is
 *   what keeps a chain of drag-out / drag-in / drag-out from reading as one long round trip.
 * - It is checked against the *whole* stack. Attaching blocks of one's own to the copy makes the stack
 *   more than the copy, and dragging it into a comment then falls back to the ordinary behaviour — the
 *   fence is written and the blocks stay where they are.
 */

// The block objects are scratch-blocks' own, so this is just an expando; nothing serialises it.
const ORIGIN = 'hmCommentOrigin';

/**
 * Tags every block of a freshly copied stack.
 * @param {Array<!Blockly.Block>} blocks the stack's top-level blocks
 * @return {!Object} the origin the blocks were tagged with
 */
const markFromComment = blocks => {
    const origin = {};
    for (const block of blocks) {
        if (!block || typeof block.getDescendants !== 'function') continue;
        // `getDescendants` includes the block itself, and covers following statements as well as
        // nested inputs — in other words, exactly the stack a drag of this block would carry.
        for (const member of block.getDescendants()) {
            member[ORIGIN] = origin;
        }
    }
    return origin;
};

/**
 * The origin of a stack in flight, if the stack is still exactly a copy that came out of a comment.
 * @param {Blockly.Block} block the block a drag is carrying (the root of the dragged stack)
 * @return {Object} the origin, or null when nothing here came out of a comment — or when it did but
 *     the stack has since grown beyond it
 */
const cameFromComment = block => {
    if (!block || typeof block.getDescendants !== 'function') return null;
    const origin = block[ORIGIN];
    if (!origin) return null;
    for (const member of block.getDescendants()) {
        if (member[ORIGIN] !== origin) return null;
    }
    return origin;
};

export {
    markFromComment,
    cameFromComment
};
