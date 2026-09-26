/**
 * Fenced code blocks in a comment.
 *
 * A fence is the one construct markdown cannot nest: an inner ``` closes the outer block early, so a
 * fence written inside an existing one leaves its content showing as plain text (and the rendered
 * picture behind it fails to build). Two callers have to agree on where a fence may start — the drop
 * itself (block-to-code.js) and the indicator that shows where the drop will land
 * (drop-indicator.js) — so the rule lives here rather than in either of them.
 */

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

// Where a fence may be written, given a character offset.
//
// Returns the offset unchanged when it is not inside a fenced block. When it *is*, the answer is the
// start of the first line after that block, so a second fence is appended below the existing one
// rather than nested inside it. An unterminated fence swallows the rest of the comment, in which
// case the only non-destructive spot left is the very end.
const findFenceExit = (value, caret) => {
    // Markdown fences are line-based, so the offset is resolved against whole lines. Line offsets are
    // recorded while splitting because the answer has to be an offset, not a line index.
    const lines = [];
    let offset = 0;
    for (const text of value.split('\n')) {
        lines.push({start: offset, end: offset + text.length, text});
        offset += text.length + 1;
    }

    let open = null;
    for (let i = 0; i < lines.length; i++) {
        const match = FENCE_RE.exec(lines[i].text);
        if (!match) continue;
        const marker = match[1].charAt(0);
        const length = match[1].length;
        if (!open) {
            open = {marker, length, index: i};
            continue;
        }
        // Only a marker of the same kind, at least as long, and with nothing but whitespace after it
        // actually closes the block — anything else is just content.
        if (marker !== open.marker || length < open.length || !/^[ \t]*$/.test(match[2])) continue;
        // Inside means *past the opening backticks*: that is where a second fence would nest, and the
        // closing line counts too because text added there lands inside the block. The offset sitting
        // exactly at the start of the opening line is not inside — a fence written there ends up in
        // front of this one, which is legal markdown and the only way to drop a block *above* an
        // existing one.
        if (caret > lines[open.index].start && caret <= lines[i].end) {
            return lines[i + 1] ? lines[i + 1].start : value.length;
        }
        open = null;
    }

    if (open && caret > lines[open.index].start) return value.length;

    return caret;
};

export {
    FENCE_RE,
    findFenceExit
};
