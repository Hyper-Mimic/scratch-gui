/**
 * "Throw this picture away."
 *
 * A picture in a comment's Markdown preview is a snapshot of a ```blocks fenced code block, and a
 * snapshot cannot be edited — so the one useful thing a right-click can offer is to delete the fence
 * it was made from. That is what this module adds: a context menu on a picture with a single item
 * that cuts the fence out of the comment's source.
 *
 * The range to cut is not searched for. The renderer already knows it: every rendered top-level block
 * is tagged with the character offset it was rendered from (`data-hm-src`, written by index.js), and
 * a fenced code block with the offset it ended at as well. The two offsets are the fence's whole
 * source range, so the deletion is a plain cut of `[start, end)` — it cannot disagree with the
 * picture on screen about where the fence starts or ends, which a re-parse of the source could.
 *
 * The menu is scratch-blocks' own (`Blockly.ContextMenu.show`), so it arrives with the editor's
 * styling, its RTL handling and its click-away/Escape dismissal instead of a hand-rolled popup.
 */

import LazyScratchBlocks from '../tw-lazy-scratch-blocks';
import {BLOCK_XML_ATTR} from './block-drag.js';
import {SRC_ATTR} from './drop-indicator.js';

// Written onto a picture next to SRC_ATTR by `renderBlocks` in index.js, which imports this constant
// back: the offset the fenced block ended at. The pair is the fence's source range.
const SRC_END_ATTR = 'data-hm-src-end';

// The start of a fence line, with the tokenizer's own tolerance (`isFence` in index.js allows any
// indentation, looser than the CommonMark rule in fences.js). The range this guards came from a
// picture that this very tokenizer produced, so the guard has to agree with it: a fence that was
// rendered as a picture has to stay deletable.
const FENCE_LINE_RE = /^\s*(`{3,}|~{3,})/;

// The blank lines a fence leaves behind fold back into one. A fence is always written with a blank
// line on either side (see `insertXmlFence` in block-to-code.js), so cutting one out would leave
// three newlines where two belong; at the very start or end of the comment there is nothing left to
// separate and the whole run goes away with it.
const cutRange = (value, start, end) => {
    const before = value.slice(0, start);
    const after = value.slice(end);
    const trailing = /\n*$/.exec(before)[0];
    const leading = /^\n*/.exec(after)[0];
    const gap = (!before || !after) ? '' :
        (trailing.length + leading.length > 2 ? '\n\n' : trailing + leading);
    return before.slice(0, before.length - trailing.length) + gap + after.slice(leading.length);
};

// The offset has to sit on the start of a fence line. It always does — the attributes are written by
// the same render that produced the picture, and the picture is re-rendered whenever the source
// changes — so this only ever rejects a range that came from somewhere unexpected, in which case
// cutting it could eat unrelated text.
const isFenceStart = (value, start) => {
    const lineEnd = value.indexOf('\n', start);
    return FENCE_LINE_RE.test(value.slice(start, lineEnd === -1 ? value.length : lineEnd));
};

// Cuts the fence out and tells scratch-blocks about the new text, exactly the way a dropped block
// writes one in: `change` is what the comment's own listener stores the text on, `input` is what
// redraws the preview (which is on screen, since the menu only exists there).
const removeFence = (textarea, start, end) => {
    const value = textarea.value;
    if (!(start >= 0 && end >= start && end <= value.length)) return false;
    if (!isFenceStart(value, start)) return false;
    const next = cutRange(value, start, end);
    if (next === value) return false;

    textarea.value = next;
    const caret = Math.min(start, next.length);
    if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(caret, caret);
    }
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
    textarea.dispatchEvent(new Event('change', {bubbles: true}));
    return true;
};

// The menu is placed against the viewport, so it should read in the editor's own direction.
const isRtl = ScratchBlocks => {
    const main = typeof ScratchBlocks.getMainWorkspace === 'function' ?
        ScratchBlocks.getMainWorkspace() : null;
    return !!(main && main.RTL);
};

/**
 * Dismisses the menu if one is open. A press anywhere else closes a context menu, and Blockly does
 * that from the gesture a press normally starts — which never starts inside the preview, because the
 * preview swallows its own presses (see index.js). Nobody else is going to close it, so the preview
 * has to ask; `hide` is safe to call when nothing is open.
 */
const hideBlockMenu = () => {
    if (!LazyScratchBlocks.isLoaded()) return;
    const ScratchBlocks = LazyScratchBlocks.get();
    const ContextMenu = ScratchBlocks && ScratchBlocks.ContextMenu;
    if (ContextMenu && typeof ContextMenu.hide === 'function') ContextMenu.hide();
};

/**
 * Shows the picture's context menu. Called by the preview's `contextmenu` listener (index.js), which
 * has already stopped the event from reaching the workspace.
 * @param {!MouseEvent} e the right-click, which the menu is positioned against
 * @param {!Element} holder the picture (`.hm-md-blocks`)
 * @param {!HTMLTextAreaElement} textarea the comment's edit area
 * @param {string} deleteText the item's label, already translated by the caller (index.js, which
 *   owns the messages)
 * @return {boolean} whether a menu was shown
 */
const showBlockMenu = (e, holder, textarea, deleteText) => {
    if (!holder || !textarea) return false;
    // The xml attribute is only on a picture that rendered. A fence that fell back to showing its
    // source is not a block, so it gets no menu (the text itself is still editable by hand).
    if (!holder.getAttribute(BLOCK_XML_ATTR)) return false;
    const startAttr = holder.getAttribute(SRC_ATTR);
    const endAttr = holder.getAttribute(SRC_END_ATTR);
    if (startAttr === null || endAttr === null) return false;
    const start = Number(startAttr);
    const end = Number(endAttr);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;

    if (!LazyScratchBlocks.isLoaded()) return false;
    const ScratchBlocks = LazyScratchBlocks.get();
    const ContextMenu = ScratchBlocks && ScratchBlocks.ContextMenu;
    if (!ContextMenu) return false;

    ContextMenu.show(e, [{
        text: deleteText,
        enabled: true,
        callback: () => removeFence(textarea, start, end)
    }], isRtl(ScratchBlocks));
    return true;
};

export {
    showBlockMenu,
    hideBlockMenu,
    SRC_END_ATTR
};
