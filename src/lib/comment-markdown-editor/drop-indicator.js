/**
 * "Where would the block land?"
 *
 * While a workspace block is dragged over a comment, the comment has to say where releasing it would
 * write. A comment shows one of two very different layouts, so the position is measured twice:
 *
 * 1. Edit mode — a `<textarea>`. A form control's value is not a text node, so its inner text cannot
 *    be measured directly. The geometry is read from a hidden *mirror* div that reproduces the
 *    textarea's content box — same font, same wrapping width, same place in the comment, same scroll
 *    offset — and holds the same string as real text. Caret rectangles then come from collapsed
 *    `Range`s over the mirror, and a binary search turns the pointer's y into a character offset.
 *
 * 2. Preview mode — rendered DOM. Every top-level rendered block carries `data-hm-src`, the character
 *    offset it was rendered from, so "which block is under the pointer" converts straight into an
 *    offset. The attributes are written by the preview renderer in index.js.
 *
 * Both paths answer with a *line boundary* rather than the caret's exact character, because fences
 * are line-sized constructs and the indicator is a rule drawn between two lines. Edit mode resolves
 * the pointer to a line first (the lower half of a line means "after it", the upper half "before
 * it"); preview mode has no lines, so the *destination* is picked from the edges of the rendered
 * blocks, where an anchor's top edge is "before it" and its bottom edge "after it". The answer is
 * finally pushed through `findFenceExit`, so a boundary that falls inside an existing fenced block
 * moves below that block: the rule must never promise a spot the insertion would refuse to use — a
 * rule that does is precisely what makes a drop land "one block off".
 *
 * The rule is measured at the destination, never at the edge it was picked from. The two edges of one
 * gap — the bottom of the block above, the top of the block below — resolve to the *same* offset, so
 * measuring from the edges offers the very same insertion twice, a little apart and on either side of
 * the block, which reads as two choices that lead to the same place. One destination, one line: edit
 * mode gets this for free (`lineTop(offset)`), preview mode asks `destinationTop()`.
 *
 * Coordinates: a comment's HTML sits inside the workspace SVG, and `svgBubbleCanvas` carries the
 * workspace zoom (`WorkspaceSvg.translate` writes `translate(...) scale(scale)` onto it). A
 * foreignObject is therefore *scaled on screen*, while the CSS pixels its text is laid out in are
 * not. Screen measurements and layout measurements differ by that factor, and mixing them puts every
 * line further off the lower it is in the comment. Everything below is converted into the comment's
 * own (layout) units — the same units `style.top` of the rule is written in — via `scaleOf()`.
 */

import {findFenceExit} from './fences.js';

const TEXTAREA_SELECTOR = '.scratchCommentTextarea';
const PREVIEW_SELECTOR = '.hm-md-preview';

// The rule drawn at the landing spot; the stylesheet lives in index.js.
const LINE_CLASS = 'hm-md-drop-line';

// Written by the preview renderer onto every top-level rendered block: the character offset in the
// comment source that block came from. Read-only contract with index.js.
const SRC_ATTR = 'data-hm-src';

// Properties copied from the textarea onto its mirror. Everything that can move a glyph has to come
// along, otherwise the mirror wraps at a different column and every rect after the first difference
// is wrong. `whiteSpace` and `boxSizing` are set explicitly rather than copied: a textarea's own
// wrapping behaviour is not what its computed style reports.
const MIRROR_PROPS = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'fontKerning', 'fontSizeAdjust', 'fontFeatureSettings', 'fontVariantLigatures',
    'fontOpticalSizing', 'webkitTextSizeAdjust',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textAlign', 'textIndent', 'textTransform',
    'direction', 'tabSize', 'wordBreak', 'overflowWrap', 'hyphens'
];

let mirror = null;
let mirrorText = null;
let mirrorKey = null;
// The mirror's own top, in the comment's units. Kept from the layout pass so the measuring code can
// turn a Range rectangle into a distance below the top of the comment without re-reading the DOM.
let mirrorLocalTop = 0;

let rule = null;
let ruleHost = null;

const isHidden = el =>
    el.getAttribute('display') === 'none' || el.style.display === 'none';

/* ------------------------------------------------------------------ units ------------------------ */

// How many screen pixels one of the comment's own pixels covers, i.e. the workspace zoom.
//
// The screen CTM of the foreignObject is authoritative: it is the matrix that maps the comment's
// coordinates onto the screen, and it also accounts for any transform above the workspace. The
// ratio between the textarea's on-screen height and its layout height is the fallback, and 1 (no
// scaling) the last resort — a wrong answer there only means the indicator lands where it did before
// this conversion existed, never somewhere worse than the un-scaled case.
const scaleOf = (area, textarea) => {
    if (area && typeof area.getScreenCTM === 'function') {
        const matrix = area.getScreenCTM();
        if (matrix && Number.isFinite(matrix.d) && matrix.d > 0) return matrix.d;
    }
    if (textarea) {
        const ratio = textarea.getBoundingClientRect().height / textarea.offsetHeight;
        if (Number.isFinite(ratio) && ratio > 0) return ratio;
    }
    return 1;
};

/* ------------------------------------------------------------------ textarea mirror ------------- */

const ensureMirror = (textarea, area, areaRect, scale) => {
    if (!mirror) {
        mirror = document.createElement('div');
        mirror.className = 'hm-md-mirror';
        mirror.setAttribute('aria-hidden', 'true');
        mirrorText = document.createTextNode('');
        mirror.appendChild(mirrorText);
    }
    // Parked inside the foreignObject — the same `position: relative` box the rule is positioned in,
    // so both share one coordinate system. Placing it on `document.body` instead would mean trusting
    // that `position: fixed` resolves against the viewport, and would put the mirror outside whatever
    // transform the workspace is under.
    if (area && mirror.parentNode !== area) area.appendChild(mirror);

    const computed = window.getComputedStyle(textarea);
    const padLeft = parseFloat(computed.paddingLeft) || 0;
    const padRight = parseFloat(computed.paddingRight) || 0;
    const padTop = parseFloat(computed.paddingTop) || 0;
    const box = textarea.getBoundingClientRect();

    const style = mirror.style;
    MIRROR_PROPS.forEach(prop => {
        if (computed[prop]) style[prop] = computed[prop];
    });
    style.position = 'absolute';
    style.margin = '0';
    style.border = '0';
    style.padding = '0';
    style.boxSizing = 'content-box';
    style.whiteSpace = 'pre-wrap';
    style.visibility = 'hidden';
    style.pointerEvents = 'none';
    // Behind everything: the mirror must never be hit or painted, only measured.
    style.zIndex = '-1';
    // Where the textarea's *content* box starts, expressed in the comment's own units: the difference
    // between the two on-screen positions is a screen distance, so it is divided by the scale.
    mirrorLocalTop = ((box.top - areaRect.top) / scale) + textarea.clientTop + padTop;
    style.left = `${((box.left - areaRect.left) / scale) + textarea.clientLeft + padLeft}px`;
    style.top = `${mirrorLocalTop}px`;
    // `clientWidth` excludes the border *and* any scrollbar, which is exactly the box text wraps in,
    // and it is already in the comment's units.
    style.width = `${Math.max(0, textarea.clientWidth - padLeft - padRight)}px`;
    style.height = 'auto';
    mirrorText.nodeValue = textarea.value;
    return mirror;
};

// Rebuilding the mirror costs a style recalculation, and a drag emits a great many mousemoves over
// the same comment. Everything that affects the *layout* (as opposed to the string being measured
// through that same layout) is folded into a key, so an unchanged comment is measured for free.
const syncMirror = (textarea, area, areaRect, scale) => {
    const box = textarea.getBoundingClientRect();
    const key = [
        scale, areaRect.top, box.left, box.top, textarea.clientLeft, textarea.clientTop,
        textarea.clientWidth, textarea.scrollLeft, textarea.scrollTop, textarea.style.display,
        textarea.value
    ].join('\u0000');
    if (mirror && mirrorKey === key && mirror.isConnected) return mirror;
    const built = ensureMirror(textarea, area, areaRect, scale);
    mirrorKey = built ? key : null;
    return built;
};

// The line box at a character offset, in screen coordinates.
//
// A collapsed Range is the natural way to ask "where is the caret at this offset", and engines answer
// with the caret's line box. Some return an empty rectangle for it, so a one character range is the
// fallback: same line box, and only `top`/`bottom` are ever used, never the caret's exact x.
const rectAt = offset => {
    const node = mirrorText;
    const length = node.nodeValue.length;
    const at = Math.max(0, Math.min(length, offset));
    const range = document.createRange();

    const measure = (from, to) => {
        range.setStart(node, from);
        range.setEnd(node, to);
        const box = range.getBoundingClientRect();
        return box.height || box.width ? box : null;
    };

    return measure(at, at) ||
        (at < length ? measure(at, at + 1) : null) ||
        (at > 0 ? measure(at - 1, at) : null) ||
        {top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0};
};

/* ------------------------------------------------------------------ edit mode -------------------- */

const resolveFromTextarea = (area, textarea, y, scale) => {
    const areaRect = area.getBoundingClientRect();
    if (!syncMirror(textarea, area, areaRect, scale)) return null;

    const mirrorRect = mirror.getBoundingClientRect();
    const value = textarea.value;
    const length = value.length;
    const scroll = textarea.scrollTop;

    // Distance from the top of the comment to the line box at an offset, in the comment's units.
    // `mirrorLocalTop` is where the mirror's content box begins; the Range rectangle is a screen
    // position, hence the division; the textarea's own scroll moves the text up inside that box and
    // is already a layout distance.
    const lineTop = offset =>
        mirrorLocalTop + ((rectAt(offset).top - mirrorRect.top) / scale) - scroll;
    const lineBottom = offset =>
        mirrorLocalTop + ((rectAt(offset).bottom - mirrorRect.top) / scale) - scroll;

    // The pointer, converted into the same space as the answers below.
    const target = (y - areaRect.top) / scale;

    if (!length) return {offset: 0, top: lineTop(0)};

    // The visual line under the pointer: the last offset whose line top is at or above `target`.
    // Line tops only ever grow as the offset advances, which is what makes the search valid.
    let low = 0;
    let high = length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (lineTop(mid) <= target) low = mid;
        else high = mid - 1;
    }

    // Grow that visual line into the logical line it belongs to. A wrapped paragraph is one unit as
    // far as the drop is concerned: clicking into the second of its four displayed rows should not
    // split it half way through a sentence.
    let lineStart = low;
    while (lineStart > 0 && value.charAt(lineStart - 1) !== '\n') lineStart--;
    let lineEnd = lineStart;
    while (lineEnd < length && value.charAt(lineEnd) !== '\n') lineEnd++;
    const nextLine = lineEnd < length ? lineEnd + 1 : length;

    // Upper half of the line -> before it, lower half -> after it.
    const top = lineTop(lineStart);
    const bottom = nextLine < length ? lineTop(nextLine) : lineBottom(length);
    const boundary = target < (top + bottom) / 2 ? lineStart : nextLine;

    // A boundary inside an existing fence is moved below it.
    const offset = findFenceExit(value, boundary);

    // A brand new line past the end of the text: the rule belongs one line lower than the last
    // measurable position. This covers a comment whose text ends in a newline too — the trailing
    // empty line owns no caret of its own, so the only measurable position at the very end is the
    // bottom of the preceding line, which is exactly the top of the empty trailing line where the
    // rule for the new last line must sit. (The non-newline case resolves the same way: the caret at
    // the end is on the last line, and its bottom is one line lower.)
    if (offset >= length) {
        return {offset, top: lineBottom(offset)};
    }

    return {offset, top: lineTop(offset)};
};

/* ------------------------------------------------------------------ preview mode ----------------- */

// Where the rule goes for a destination offset: immediately in front of the anchor the block will be
// written before, or immediately under the anchor above it when the offset is not the start of any
// anchor — which is the end of the text for an appended block, and the spot an offset pushed out of a
// fence lands on. Anchors arrive in source order, so the first one past the destination ends the
// search. A destination that precedes every anchor still lands in front of the first one.
//
// This is not a convention, it is the answer itself: the fence is written at that offset, so the new
// block pushes the anchor below it down and its own top edge ends up exactly on that line.
const destinationTop = (anchors, offset, fallback) => {
    let above = null;
    let below = null;
    for (const anchor of anchors) {
        if (anchor.offset <= offset) above = anchor;
        else {
            below = anchor;
            break;
        }
    }
    if (!above) return below ? below.rect.top : fallback;
    return above.offset === offset ? above.rect.top : above.rect.bottom;
};

const resolveFromPreview = (area, textarea, y, scale) => {
    const preview = area.querySelector(PREVIEW_SELECTOR);
    if (!preview || isHidden(preview)) return null;

    const areaRect = area.getBoundingClientRect();
    // The preview is laid out in the comment's units as well, so both the anchors and the pointer are
    // converted into them before they are compared.
    const localRect = el => {
        const box = el.getBoundingClientRect();
        return {
            top: (box.top - areaRect.top) / scale,
            bottom: (box.bottom - areaRect.top) / scale
        };
    };
    const target = (y - areaRect.top) / scale;

    // Only top-level blocks are anchors. A nested one (blockquote content) renders from a different
    // string, so its offset would not be comparable with the comment source.
    const anchors = [];
    for (const el of preview.children) {
        if (!el.hasAttribute(SRC_ATTR)) continue;
        const offset = Number(el.getAttribute(SRC_ATTR));
        if (!Number.isFinite(offset)) continue;
        anchors.push({offset, rect: localRect(el)});
    }
    const previewRect = localRect(preview);

    if (!anchors.length) {
        // A visible but empty preview (nothing written yet, or only footnote definitions) has no
        // anchors to aim at, so the only place left is the end — drawn at the top of the box it
        // would fill.
        return {offset: textarea.value.length, top: previewRect.top};
    }

    // A block may only be written *between* two rendered blocks, so the candidate spots are the
    // edges of the anchors: an anchor's top edge means "before it", its bottom edge means "after
    // it" — which is the offset of the next anchor, or the end of the text for the last one. Taking
    // the edge nearest the pointer (rather than the half of the anchor the pointer fell into) is
    // what makes a drop land where the rule is: the pointer can address either edge of a gap, and
    // the fat middle of a tall picture no longer swallows the boundary above it.
    //
    // Only the *destination* is read from these edges; the height of the rule is not (see below).
    const value = textarea.value;
    const boundaries = [];
    anchors.forEach((anchor, i) => {
        const next = anchors[i + 1];
        boundaries.push({offset: anchor.offset, top: anchor.rect.top});
        boundaries.push({offset: next ? next.offset : value.length, top: anchor.rect.bottom});
    });

    // Ties go to the later candidate, i.e. the edge below: the rule is then drawn in the gap rather
    // than on the underside of the block above it.
    let chosen = boundaries[0];
    let best = Infinity;
    for (const candidate of boundaries) {
        const distance = Math.abs(candidate.top - target);
        if (distance <= best) {
            best = distance;
            chosen = candidate;
        }
    }

    // Fences do not nest, so an offset that resolves inside one has to move below it — the same rule
    // the insertion itself applies. The rule has to move with it: a rule drawn where the block will
    // *not* be written is exactly what makes a drop look "one block off".
    const offset = findFenceExit(value, chosen.offset);

    // Measured at the destination, not at the edge it was picked from. Both edges of a gap resolve to
    // the same offset, so a rule positioned by the edges would show the same insertion at two
    // heights — one hugging the block above, one hugging the block below — and offer the user a
    // choice that does not exist. The destination has exactly one place: in front of the anchor it is
    // written before, or under the last anchor when nothing follows it.
    const top = destinationTop(anchors, offset, previewRect.top);

    // The preview scrolls, so the destination can sit outside the visible area; the rule is pinned
    // to the edge of the box instead of being drawn over the workspace.
    return {
        offset,
        top: Math.min(Math.max(top, previewRect.top), previewRect.bottom)
    };
};

/* ------------------------------------------------------------------ the rule --------------------- */

const ensureRule = area => {
    if (rule && ruleHost === area && rule.isConnected) return rule;
    if (rule) rule.remove();
    rule = document.createElement('div');
    rule.className = LINE_CLASS;
    rule.setAttribute('aria-hidden', 'true');
    area.appendChild(rule);
    ruleHost = area;
    return rule;
};

/**
 * The character offset a block released at `y` would be written to, plus where to draw the rule
 * (a distance below the top of `area`, in the comment's own pixels). Returns `null` when nothing can
 * be measured — the caller then falls back to the caret.
 *
 * `y` is a screen coordinate (`event.clientY`); the answer is not, because the rule is positioned
 * inside the comment and inherits whatever zoom the workspace is at.
 */
const resolveDropTarget = (area, y) => {
    if (!area) return null;
    const textarea = area.querySelector(TEXTAREA_SELECTOR);
    if (!textarea) return null;
    const scale = scaleOf(area, textarea);
    const fromPreview = resolveFromPreview(area, textarea, y, scale);
    return fromPreview || resolveFromTextarea(area, textarea, y, scale);
};

const showDropIndicator = (area, target) => {
    if (!target) {
        hideDropIndicator();
        return;
    }
    const textarea = area.querySelector(TEXTAREA_SELECTOR);
    const scale = textarea ? scaleOf(area, textarea) : 1;
    const rect = area.getBoundingClientRect();
    // Clamped to the comment's own box, in its own units: a measurement that fell outside it (an
    // unmeasurable offset, a comment scrolled under the pointer) would otherwise draw the rule over
    // the workspace.
    const height = area.clientHeight || (rect.height / scale);
    const top = Math.max(0, Math.min(height, target.top));
    ensureRule(area).style.top = `${Math.round(top)}px`;
    rule.style.display = 'block';
};

const hideDropIndicator = () => {
    if (rule) rule.style.display = 'none';
};

const disposeDropIndicator = () => {
    if (rule) {
        rule.remove();
        rule = null;
    }
    ruleHost = null;
    if (mirror) {
        mirror.remove();
        mirror = null;
        mirrorText = null;
    }
    mirrorKey = null;
    mirrorLocalTop = 0;
};

export {
    resolveDropTarget,
    showDropIndicator,
    hideDropIndicator,
    disposeDropIndicator,
    SRC_ATTR,
    LINE_CLASS
};
