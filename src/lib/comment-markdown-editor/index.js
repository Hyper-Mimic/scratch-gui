/**
 * "Comment Markdown Editor".
 *
 * Driven by the HyperMimic "comment markdown editor" setting (src/lib/hypermimic-settings.js,
 * key `commentMarkdownEditor`, boolean) rather than an addon: the advanced settings modal is
 * its UI, so it has to work without anything being installed.
 *
 * When enabled, every comment bubble gets a small toggle in its top bar that switches the
 * comment between plain-text editing and a rendered Markdown preview. Ported from AstraEditor's
 * `tw-comment-markdown-editor` addon, but re-targeted at the literal Blockly comment DOM:
 *   <g> ... bubble group
 *     <foreignObject class="scratchCommentForeignObject">
 *       <body class="scratchCommentBody">
 *         <textarea class="scratchCommentTextarea">
 *
 * A ```blocks fence renders as a picture of the blocks rather than as source, which makes the preview
 * the other half of the workspace: a picture can be dragged out into the workspace (block-drag.js),
 * deleted from the comment with a right-click (block-delete.js), and a fence can be written by
 * dropping a block from the workspace or the palette onto the comment (block-to-code.js, whose
 * drop indicator lives in drop-indicator.js).
 *
 * The top bar itself is an SVG <rect class="scratchCommentTopBar">, so an HTML button cannot be
 * appended to it; instead the toggle is anchored to the top-right of the foreignObject (which is
 * `position: relative` in Blockly's css), over the comment's text area.
 *
 * The style is injected as a raw <style> element (not through webpack's CSS Modules), because
 * the selectors target Blockly's literal class names which CSS Modules would otherwise rewrite.
 */

import {defineMessages} from 'react-intl';
import {hmMessage} from '../hm-message.js';
import {
    getSetting,
    onSettingsChange,
    SETTING_COMMENT_MARKDOWN_EDITOR
} from '../hypermimic-settings.js';
import {
    renderBlockXmlToSvg,
    disposeBlockRenderer
} from './block-renderer.js';
import {
    startBlockDragFromXml,
    BLOCK_XML_ATTR,
    BLOCKS_HOLDER_SELECTOR
} from './block-drag.js';
import {
    startBlockToCode,
    stopBlockToCode,
    DROP_TARGET_CLASS
} from './block-to-code.js';
import {showBlockMenu, hideBlockMenu, SRC_END_ATTR} from './block-delete.js';
import {SRC_ATTR, LINE_CLASS} from './drop-indicator.js';

const STYLE_ID = 'hm-comment-markdown-editor';

const COMMENT_SELECTOR = '.blocklyBubbleCanvas > g';
const PROCESSED_ATTR = 'data-hm-markdown';

// A ```<lang> fenced code block whose info string is one of these is treated as Scratch block XML
// and rendered as a picture of blocks instead of as source code.
const BLOCKS_FENCE_LANGS = ['blocks', 'scratchblocks', 'scratch'];

const isBlocksFence = lang => BLOCKS_FENCE_LANGS.includes(String(lang || '').trim().toLowerCase());

// Icons for the SVG toggle button that lives in the comment top bar.
// code.svg = source/edit mode, markdown.svg = rendered preview mode.
const ICON_EDIT = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTUuOTkyMzA5NTcwMzEyNSIgaGVpZ2h0PSIxMS4xODkxNDc5NDkyMTg3NSIgdmlld0JveD0iMCAwIDE1Ljk5MjMwOTU3MDMxMjUgMTEuMTg5MTQ3OTQ5MjE4NzUiIGZpbGw9Im5vbmUiPjxnICBjbGlwLXBhdGg9InVybCgjY2xpcC1wYXRoLWo1ZVBDb29PMFE3VW90QmEwYVdlQSkiPjxwYXRoIGQ9Ik00LjU3IDkuMzlDNC4zODEzOSA5LjM5IDQuMTkxODUgOS4zMjUwNiA0LjA0IDkuMTlMMCA1LjU5TDQuMjcgMS44QzQuNTk5MjkgMS41MDgyOSA1LjEwNjY5IDEuNTM5OTIgNS40IDEuODdDNS42OTMzMiAyLjIwMDA4IDUuNjYwMDcgMi42OTY2OSA1LjMzIDIuOTlMMi40MSA1LjU5TDUuMTEgNy45OUM1LjQ0MDA3IDguMjgzMzIgNS40NjMzMiA4Ljc4OTkyIDUuMTcgOS4xMkM1LjAxMjU2IDkuMjk4MjIgNC43ODk3OSA5LjM5IDQuNTcgOS4zOVpNMTEuNzIgOS4zOUwxNS45OSA1LjU5TDExLjk1IDJDMTEuNjE5OSAxLjcwNjY5IDExLjExMjUgMS43Mzk5MiAxMC44MiAyLjA3QzEwLjUyNjcgMi40MDAwOCAxMC41NTk5IDIuODk2NjkgMTAuODkgMy4xOUwxMy41OSA1LjU5TDEwLjY2IDguMTlDMTAuMzI5OSA4LjQ4MzMyIDEwLjMwNjcgOC45ODk5MiAxMC42IDkuMzJDMTAuNzU3NCA5LjQ5ODIyIDEwLjk3MDIgOS41OSAxMS4xOSA5LjU5QzExLjM3ODYgOS41OSAxMS41NjgxIDkuNTI1MDYgMTEuNzIgOS4zOVpNNy45OCAxMC41Mkw5LjU4IDAuOTNDOS42NTI3MyAwLjQ5NDQyNSA5LjM2NTU3IDAuMDgyNzI1NyA4LjkzIDAuMDFDOC40OTI4MiAtMC4wNjM1Mzc1IDguMDgxMTMgMC4yMzQ0MjUgOC4wMSAwLjY3TDYuNDEgMTAuMjZDNi4zMzcyNyAxMC42OTU2IDYuNjM0NDMgMTEuMTA3MyA3LjA3IDExLjE4QzcuMTE0NzUgMTEuMTggNy4xNTYwNCAxMS4xOSA3LjIgMTEuMTlDNy41ODM2MyAxMS4xOSA3LjkxNTI3IDEwLjkxIDcuOTggMTAuNTJaIiAgIGZpbGw9IiM1NzVFNzUiID48L3BhdGg+PC9nPjxkZWZzPjxjbGlwUGF0aCBpZD0iY2xpcC1wYXRoLWo1ZVBDb29PMFE3VW90QmEwYVdlQSI+PHBhdGggZD0iTTAgMTEuMTg5MUwxNS45OTIzIDExLjE4OTFMMTUuOTkyMyAwTDAgMEwwIDExLjE4OTFaIiBmaWxsPSJ3aGl0ZSIvPjwvY2xpcFBhdGg+PC9kZWZzPjwvc3ZnPg==';
const ICON_PREVIEW = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTYiIGhlaWdodD0iOS44NDQ5NzA3MDMxMjUiIHZpZXdCb3g9IjAgMCAxNiA5Ljg0NDk3MDcwMzEyNSIgZmlsbD0ibm9uZSI+PGcgIGNsaXAtcGF0aD0idXJsKCNjbGlwLXBhdGgtcTFCM3k0U294OVppOUVRVjdNbEJQKSI+PHBhdGggZD0iTTE0Ljg1IDBMMS4xNiAwQzAuNTIyNSAwIDAgMC41MTUgMCAxLjE1TDAgOC42OUMwIDkuMzI3NSAwLjUyMjUgOS44NSAxLjE2IDkuODVMMTQuODUgOS44NUMxNS40ODc1IDkuODUgMTYgOS4zMjUgMTYgOC42OUwxNiAxLjE1QzE2IDAuNTE1IDE1LjQ4NzUgMCAxNC44NSAwWk04LjQ2IDcuNTRMNi45MyA3LjU0TDYuOTMgNC41NEw1LjM5IDYuNDZMMy44NSA0LjU0TDMuODUgNy41NEwyLjMxIDcuNTRMMi4zMSAyLjMxTDMuODUgMi4zMUw1LjM4IDQuMjNMNi45MiAyLjMxTDguNDYgMi4zMUw4LjQ2IDcuNTRaTTExLjg1IDcuNjJMOS41NCA0LjkyTDExLjA4IDQuOTJMMTEuMDggMi4zMUwxMi42MSAyLjMxTDEyLjYxIDQuOTJMMTQuMTUgNC45MkwxMS44NSA3LjYyWiIgICBmaWxsPSIjNTc1RTc1IiA+PC9wYXRoPjwvZz48ZGVmcz48Y2xpcFBhdGggaWQ9ImNsaXAtcGF0aC1xMUIzeTRTb3g5Wmk5RVFWN01sQlAiPjxwYXRoIGQ9Ik0wIDkuODQ0OTdMMTYgOS44NDQ5N0wxNiAwTDAgMEwwIDkuODQ0OTdaIiBmaWxsPSJ3aGl0ZSIvPjwvY2xpcFBhdGg+PC9kZWZzPjwvc3ZnPg==';

// The text this feature owns: the toggle's tooltips, the tooltip of a rendered block picture, and
// the one item of its right-click menu.
//
// The translations are not kept here. The ids live in
// src/lib/tw-translations/generated-translations.json, which is the fork's own table and is mixed
// into every locale of the app's message table by src/lib/tw-translations/index.js — so adding a
// translation there is all it takes for it to reach every comment, and a language the table does
// not cover falls back to the `defaultMessage` below, exactly as react-intl would.
const MSG = defineMessages({
    edit: {
        defaultMessage: 'Edit',
        description: 'Tooltip of the comment Markdown toggle while the preview is showing (click to edit)',
        id: 'hm.commentMarkdownEditor.edit'
    },
    preview: {
        defaultMessage: 'Preview',
        description: 'Tooltip of the comment Markdown toggle while the source is showing (click to render)',
        id: 'hm.commentMarkdownEditor.preview'
    },
    dragHint: {
        defaultMessage: 'Drag into the workspace to add these blocks; right-click to delete',
        description: 'Tooltip of a picture of blocks in a comment Markdown preview',
        id: 'hm.commentMarkdownEditor.dragHint'
    },
    deleteBlocks: {
        defaultMessage: 'Delete these blocks',
        description: 'Item of the right-click menu of a picture of blocks in a comment Markdown preview',
        id: 'hm.commentMarkdownEditor.deleteBlocks'
    }
});

// Reading those messages is `hmMessage`, shared with the other non-React parts of the fork (see
// src/lib/hm-message.js for why they read the store instead of being handed an `intl`).

const injectStyle = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
        '.hm-md-toggle-icon { pointer-events: all; -webkit-user-drag: none; user-drag: none; }',
        '.hm-md-preview {',
        '  position: absolute;',
        '  top: 0;',
        '  left: 0;',
        '  width: 100%;',
        '  height: 100%;',
        '  overflow-y: auto;',
        '  overflow-x: hidden;',
        '  padding: 4px 6px;',
        '  box-sizing: border-box;',
        '  margin: 12px;',
        '  width: calc(100% - 24px);',
        '  height: calc(100% - 24px);',
        '  word-break: break-word;',
        '  font-family: "Helvetica Neue", Helvetica, sans-serif;',
        '  font-size: 12pt;',
        '  line-height: 1.5;',
        '  color: #000;',
        '  background: #fef49c;',
        '  cursor: auto;',
        '  -webkit-user-select: text;',
        '  user-select: text;',
        '}',
        '.hm-md-preview h1, .hm-md-preview h2, .hm-md-preview h3,',
        '.hm-md-preview h4, .hm-md-preview h5, .hm-md-preview h6 {',
        '  margin: 0.5em 0 0.25em;',
        '  font-weight: 600;',
        '  line-height: 1.25;',
        '}',
        '.hm-md-preview h1 { font-size: 1.5em; }',
        '.hm-md-preview h2 { font-size: 1.3em; }',
        '.hm-md-preview h3 { font-size: 1.15em; }',
        '.hm-md-preview h4 { font-size: 1.05em; }',
        '.hm-md-preview h5 { font-size: 0.95em; }',
        '.hm-md-preview h6 { font-size: 0.85em; }',
        '.hm-md-preview p { margin: 0.35em 0; }',
        '.hm-md-preview strong { font-weight: 600; }',
        '.hm-md-preview em { font-style: italic; }',
        '.hm-md-preview del { text-decoration: line-through; opacity: 0.7; }',
        '.hm-md-preview code {',
        '  background: rgba(0,0,0,0.08);',
        '  padding: 0 3px;',
        '  border-radius: 3px;',
        '  font-family: Consolas, Menlo, monospace;',
        '  font-size: 0.9em;',
        '}',
        '.hm-md-preview pre {',
        '  background: rgba(0,0,0,0.05);',
        '  border-radius: 4px;',
        '  padding: 6px 8px;',
        '  overflow-x: auto;',
        '  margin: 0.4em 0;',
        '}',
        '.hm-md-preview pre code { background: transparent; padding: 0; }',
        // ```blocks fences: a picture of the blocks rendered by scratch-blocks itself.
        '.hm-md-preview .hm-md-blocks { margin: 0.5em 0; }',
        '.hm-md-preview .hm-md-blocks-svg {',
        '  position: static;',
        '  display: block;',
        '  background: transparent;',
        '  max-width: 100%;',
        '  height: auto;',
        '  /* Block text keeps its own fill; the preview colour must not leak into the picture. */',
        '  color: inherit;',
        '}',
        // Unrenderable XML falls back to its source, unchanged from a normal code fence.
        '.hm-md-preview .hm-md-blocks-error { margin: 0; }',
        // A rendered picture is draggable into the workspace; the xml attribute is only present on
        // pictures that rendered, so failed fences keep the normal text cursor.
        `.hm-md-preview ${BLOCKS_HOLDER_SELECTOR}[${BLOCK_XML_ATTR}] {`,
        // Hug the picture so the grab cursor (and the drop target) never covers the blank space
        // beside it, while still shrinking pictures that are wider than the comment.
        '  width: fit-content;',
        '  max-width: 100%;',
        '  cursor: grab;',
        '  border-radius: 4px;',
        // The same frame the drop target wears, in reverse: this is the picture saying it can be
        // picked up. Faded in rather than switched, so the picture does not blink as the pointer
        // crosses it on the way to somewhere else — and, like the drop target's, the resting shadow
        // is declared at zero width so there is something for the ring to grow out of. It is drawn
        // inside the picture's box on purpose: the holder is only as wide as the picture, and an
        // outer ring would be clipped by the preview's `overflow-x` whenever a picture fills it.
        '  box-shadow: inset 0 0 0 0 rgba(0, 0, 0, 0);',
        '  transition: background-color 120ms ease-out, box-shadow 120ms ease-out;',
        '}',
        `.hm-md-preview ${BLOCKS_HOLDER_SELECTOR}[${BLOCK_XML_ATTR}]:hover {`,
        '  background: rgba(0,0,0,0.05);',
        '  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.08);',
        '}',
        `.hm-md-preview ${BLOCKS_HOLDER_SELECTOR}[${BLOCK_XML_ATTR}]:active { cursor: grabbing; }`,
        // The opposite gesture: a block dragged out of the workspace and held over a comment's
        // code area. The class goes on the edit area (a foreignObject), so both the textarea and
        // the preview overlay can be marked, whichever of the two is on screen.
        //
        // The frame is a single `box-shadow` list, and both halves of it matter. The first entry is
        // the 2px ring; the second floods the box with the accent washed out. A tint drawn this way
        // layers over whatever the theme put behind the text, whereas a `background-color` here would
        // have *replaced* it — with a translucent colour that showed the bubble's SVG through, on the
        // dark themes most of all. It also paints under the content, so the text is never washed out.
        //
        // Both colours come from the accent system rather than being fixed: `--looks-secondary` is
        // the accent itself and `--looks-light-transparent` its 15% wash — the same pair the
        // workspace toolbox hovers with. The accent is whatever the GUI theme says it is (a whole
        // table of them lives in src/lib/themes/gui + src/lib/themes/accent, and the "主题强调色"
        // setting rewrites it at the root — src/lib/themes/accentOverrides.js), so a block dropped
        // onto a comment is framed in the same colour the rest of the editor is.
        //
        // The fallbacks repeat the GUI light theme's own accent (light.js), so a variable that went
        // missing would still leave an accent-coloured frame rather than none at all.
        //
        // The resting state is the same two shadows at zero width. That is what lets the frame grow
        // out of nothing when the class arrives: `box-shadow: none` has nothing to interpolate from,
        // and a shadow list of a different length could not be paired up entry by entry. The two
        // rest differently on purpose — the ring keeps the target colour (at zero spread it is
        // invisible anyway, and holding the colour still means the ring grows without also shifting
        // hue), while the wash rests transparent, because its spread is what covers the box and a
        // wash that arrived at full strength would flash instead of fading in.
        '.scratchCommentForeignObject .scratchCommentTextarea,',
        '.scratchCommentForeignObject .hm-md-preview {',
        '  box-shadow:',
        '    inset 0 0 0 0 var(--looks-secondary, hsla(260, 60%, 60%, 1)),',
        '    inset 0 0 0 0 transparent;',
        '  border-radius: 3px;',
        '  transition: box-shadow 160ms ease-out;',
        '}',
        `.scratchCommentForeignObject.${DROP_TARGET_CLASS} .scratchCommentTextarea,`,
        `.scratchCommentForeignObject.${DROP_TARGET_CLASS} .hm-md-preview {`,
        '  box-shadow:',
        '    inset 0 0 0 2px var(--looks-secondary, hsla(260, 60%, 60%, 1)),',
        '    inset 0 0 0 9999px var(--looks-light-transparent, hsla(260, 60%, 60%, 0.15));',
        '}',
        // The pictures must not be selectable, or a drag would highlight the block text instead.
        `.hm-md-preview ${BLOCKS_HOLDER_SELECTOR}[${BLOCK_XML_ATTR}] .hm-md-blocks-svg {`,
        '  -webkit-user-select: none;',
        '  user-select: none;',
        '}',
        '.hm-md-preview blockquote {',
        '  border-left: 3px solid #c9c9c9;',
        '  margin: 0.4em 0;',
        '  padding-left: 8px;',
        '  color: #555;',
        '}',
        '.hm-md-preview a { color: #0366d6; }',
        '.hm-md-preview ul, .hm-md-preview ol {',
        '  margin: 0.3em 0;',
        '  padding-left: 1.6em;',
        '}',
        '.hm-md-preview ul.hm-md-tasklist { list-style: none; padding-left: 0.4em; }',
        '.hm-md-preview ul.hm-md-tasklist li input[type="checkbox"] { margin-right: 4px; }',
        '.hm-md-preview hr {',
        '  border: none;',
        '  border-top: 1px solid rgba(0,0,0,0.2);',
        '  margin: 0.6em 0;',
        '}',
        '.hm-md-preview table {',
        '  border-collapse: collapse;',
        '  margin: 0.4em 0;',
        '  display: block;',
        '  overflow-x: auto;',
        '  max-width: 100%;',
        '}',
        '.hm-md-preview th, .hm-md-preview td {',
        '  border: 1px solid rgba(0,0,0,0.25);',
        '  padding: 2px 6px;',
        '}',
        '.hm-md-preview th { background: rgba(0,0,0,0.08); font-weight: 600; }',
        '.hm-md-preview img { max-width: 100%; height: auto; }',
        '.hm-md-preview .hm-md-math {',
        '  font-family: "STIX Two Math", "Cambria Math", "Times New Roman", serif;',
        '  font-style: italic;',
        '  background: rgba(0,0,0,0.04);',
        '  padding: 0 2px;',
        '  border-radius: 3px;',
        '}',
        '.hm-md-preview .hm-md-math-block {',
        '  display: block;',
        '  text-align: center;',
        '  margin: 0.5em 0;',
        '  padding: 6px 8px;',
        '  overflow-x: auto;',
        '}',
        '.hm-md-preview .hm-md-footnote-ref a { color: #0366d6; text-decoration: none; }',
        '.hm-md-preview .hm-md-footnote-ref a:hover { text-decoration: underline; }',
        '.hm-md-preview .hm-md-footnotes {',
        '  margin-top: 0.8em;',
        '  padding-top: 0.5em;',
        '  border-top: 1px solid rgba(0,0,0,0.2);',
        '  font-size: 0.85em;',
        '  color: #444;',
        '}',
        '.hm-md-preview .hm-md-footnote { margin: 0.15em 0; }',
        // The drop caret: a rule between two lines of the comment showing where a dragged block would
        // be written. It lives inside the foreignObject (`position: relative`), which is also the
        // rectangle its coordinates are measured in (see drop-indicator.js), and must never be hit or
        // take part in layout.
        //
        // Its geometry belongs to the script — a full-width bar placed by `top` alone — so only the
        // decoration is styled here, and two of these declarations are doing real work:
        //
        // - `top` is transitioned rather than set. The rule is one element reused for the whole drag,
        //   moved from gap to gap as the pointer travels, and without this it snapped between them.
        // - The entrance rides on `display`, which the script toggles between `none` and `block`: a
        //   box that comes back into the document runs its animations again, so the rule grows into
        //   place every time it appears instead of being there already.
        //
        // The gradient fades both ends out; a bar stopping dead at the comment's edge reads as a
        // border of the comment rather than as a line between two of its lines.
        //
        // The bar is the theme accent (`--looks-secondary`) and its halo the accent's two washes, so
        // the rule belongs to the same accent as the frame around the box it points into — change
        // the accent and both move together. The ends fade to `transparent` rather than to a
        // same-hue zero-alpha colour: gradients interpolate in premultiplied space, so the two are
        // equivalent and the keyword needs no theme variable.
        `.${LINE_CLASS} {`,
        '  position: absolute;',
        '  left: 0;',
        '  right: 0;',
        '  height: 2px;',
        '  border-radius: 2px;',
        '  background: linear-gradient(90deg,',
        '    transparent 0%, var(--looks-secondary, hsla(260, 60%, 60%, 1)) 7%,',
        '    var(--looks-secondary, hsla(260, 60%, 60%, 1)) 93%, transparent 100%);',
        '  box-shadow: 0 0 6px var(--looks-transparent, hsla(260, 60%, 60%, 0.35));',
        '  pointer-events: none;',
        '  display: none;',
        '  z-index: 4;',
        '  transition: top 90ms ease-out;',
        '  animation: hm-md-drop-line-in 170ms cubic-bezier(0.2, 0.8, 0.2, 1) both,',
        '    hm-md-drop-line-glow 1.6s ease-in-out 170ms infinite;',
        '}',
        // Out of the middle of the gap, not out of the left margin: the line is a place, and a place
        // that unrolls sideways would point at the text beside it.
        '@keyframes hm-md-drop-line-in {',
        '  from { opacity: 0; transform: scaleX(0.55); }',
        '  to { opacity: 1; transform: scaleX(1); }',
        '}',
        // A breath of light, not a blinking cursor: the bar itself never moves, only its glow. The
        // two stops are the accent's own washes, faint and full, so the pulse keeps the accent's hue
        // at both ends instead of brightening towards white. What changes between them is therefore
        // mostly reach (6px -> 11px) rather than colour, which is the quieter of the two.
        '@keyframes hm-md-drop-line-glow {',
        '  0%, 100% { box-shadow: 0 0 6px',
        '    var(--looks-light-transparent, hsla(260, 60%, 60%, 0.15)); }',
        '  50% { box-shadow: 0 0 11px',
        '    var(--looks-transparent, hsla(260, 60%, 60%, 0.35)); }',
        '}',
        // The invisible twin of the edit-mode textarea, measured through its Ranges. Its own styling
        // is written inline by drop-indicator.js from the textarea's computed style, so nothing but
        // "never seen, never hit" belongs here.
        '.hm-md-mirror {',
        '  visibility: hidden;',
        '  pointer-events: none;',
        '}',
        // Motion laid on top of a drag the user is steering by hand: worth switching off when the
        // system asks for that. None of it is load-bearing — the frame is simply there on arrival,
        // the rule lands where it belongs instead of gliding there, and the picture's ring appears
        // without fading. (The JS-side counterpart is src/lib/prefers-reduced-motion.js.)
        '@media (prefers-reduced-motion: reduce) {',
        '  .scratchCommentForeignObject .scratchCommentTextarea,',
        '  .scratchCommentForeignObject .hm-md-preview,',
        `  .hm-md-preview ${BLOCKS_HOLDER_SELECTOR}[${BLOCK_XML_ATTR}],`,
        `  .${LINE_CLASS} {`,
        '    transition: none;',
        '    animation: none;',
        '  }',
        '}'
    ].join('\n');
    document.head.appendChild(style);
};

const escapeHtml = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// 启用 HTML 支持时（如 README 开了 readmeHtmlSupport），文本节点原样输出，让原始 HTML 生效；
// 代码围栏、```blocks 的 XML 属性、脚注 id 始终 escape，绝不因开启 HTML 而逃逸出容器。
let allowHtmlEnabled = false;
const maybeEscape = s => (allowHtmlEnabled ? String(s) : escapeHtml(s));

// Render inline markdown on already-escaped text. Order matters: code spans first (so their
// contents are not re-processed), then links/images, then emphasis.
const renderInline = escaped => {
    // Placeholder-protect inline code spans and fenced code so emphasis/link rules skip them.
    const placeholders = [];
    const stash = (html, src) => {
        placeholders.push(html);
        return `\u0000${placeholders.length - 1}\u0000`;
    };
    // Backslash escapes: protect escaped punctuation (\* \_ \` \$ \[ \] \# etc.) so the
    // markdown rules below don't treat them as real syntax.
    let input = escaped.replace(/\\([\\`*_{}\[\]()#+\-.!|>~$])/g,
        (m, ch) => stash(ch, ch));
    // HTML 透传开启时，标签同样先藏起来：markdown 规则不能改写到标签里面去（属性值里的 `_`、
    // URL 里的 `*`、`http://` 里的 `//` 都不是语法）。
    if (allowHtmlEnabled) {
        input = input.replace(/<[^>\n]+>/g, m => stash(m, m));
    }
    let out = input
        // Math (block first, then inline). Stashed before emphasis so `*` inside is left alone.
        .replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => stash(`<span class="hm-md-math hm-md-math-block">${tex}</span>`, tex))
        .replace(/\$([^$\n]+?)\$/g, (m, tex) => stash(`<span class="hm-md-math">${tex}</span>`, tex))
        // Footnotes: [^1] references (rendered as superscript links to the definitions below).
        .replace(/\[\^([^\]]+)\]/g, (m, id) => stash(`<sup class="hm-md-footnote-ref"><a href="#hm-fn-${id}">${id}</a></sup>`, id))
        .replace(/`([^`\n]+)`/g, (m, code) => stash(`<code>${code}</code>`, code))
        .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
            (m, alt, src) => stash(`<img alt="${alt}" src="${src}">`, alt))
        .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
            (m, label, href) => stash(`<a href="${href}" rel="noopener noreferrer">${label}</a>`, label))
        .replace(/\*\*\*(.+?)\*\*\*/g, (m, t) => `<strong><em>${t}</em></strong>`)
        .replace(/___(.+?)___/g, (m, t) => `<strong><em>${t}</em></strong>`)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

    // Restore stashed code/images/links.
    out = out.replace(/\u0000(\d+)\u0000/g, (m, i) => placeholders[Number(i)]);
    return out;
};

// Split markdown source into (type, content) blocks, preserving the original order.
const tokenizeBlocks = src => {
    const tokens = [];
    const lines = src.split('\n');
    let i = 0;
    const isFence = l => /^\s*(```|~~~)/.test(l);
    // Each token remembers the source line it started on. The renderer turns that into a character
    // offset (`renderBlocks`), and the offset is what the drop indicator matches a rendered block
    // against, so no token may be pushed without it.
    let tokenLine = 0;
    const push = token => {
        token.line = tokenLine;
        tokens.push(token);
    };
    while (i < lines.length) {
        const line = lines[i];
        // Skip blank lines so they never get folded into a paragraph.
        if (line.trim() === '') {
            i++;
            continue;
        }
        tokenLine = i;
        // Fenced code block
        if (isFence(line)) {
            const fenceChar = /(```|~~~)/.exec(line)[1];
            const lang = line.replace(/^\s*`{3,}|^\s*~{3,}/, '').trim();
            const buf = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith(fenceChar)) {
                buf.push(lines[i]);
                i++;
            }
            i++; // skip closing fence
            // The line the fence ended on: the renderer turns it into an offset as well, so a rendered
            // picture knows the whole source range it came from (used to delete it again).
            push({type: 'code', lang, content: buf.join('\n'), endLine: i});
            continue;
        }
        // Heading (ATX)
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            push({type: 'heading', level: heading[1].length, content: heading[2]});
            i++;
            continue;
        }
        // Horizontal rule
        if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
            push({type: 'hr'});
            i++;
            continue;
        }
        // Table: header row followed by a delimiter row (--- | ---)
        if (/\|/.test(line) && i + 1 < lines.length &&
            /^\s*\|?[\s:-]+\|[\s|:-]+\|?\s*$/.test(lines[i + 1])) {
            const header = line;
            const delim = lines[i + 1];
            const body = [];
            i += 2;
            while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
                body.push(lines[i]);
                i++;
            }
            push({type: 'table', header, delim, body});
            continue;
        }
        // Blockquote
        if (/^\s*>\s?/.test(line)) {
            const buf = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                buf.push(lines[i].replace(/^\s*>\s?/, ''));
                i++;
            }
            push({type: 'blockquote', content: buf.join('\n')});
            continue;
        }
        // Footnote definition: [^id]: text
        if (/^\[\^[^\]]+\]:\s+/.test(line)) {
            const m = /^\[\^([^\]]+)\]:\s+(.*)$/.exec(line);
            push({type: 'footnote-def', id: m[1], content: m[2]});
            i++;
            continue;
        }
        // Task list item (must be checked before generic list)
        if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
            const buf = [];
            while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) {
                const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i]);
                buf.push({checked: /[xX]/.test(m[1]), text: m[2]});
                i++;
            }
            push({type: 'tasklist', items: buf});
            continue;
        }
        // Ordered list
        if (/^\s*\d+[.)]\s+/.test(line)) {
            const buf = [];
            while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
                buf.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
                i++;
            }
            push({type: 'ol', items: buf});
            continue;
        }
        // Unordered list
        if (/^\s*[-*+]\s+/.test(line)) {
            const buf = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                buf.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
                i++;
            }
            push({type: 'ul', items: buf});
            continue;
        }
        // Paragraph: gather until a blank line or a block-starting line. Soft line breaks
        // (single newlines) are preserved and later rendered as <br>, matching the comment
        // preview behaviour users expect for multi-line text like blockquote callouts.
        const buf = [line];
        i++;
        while (i < lines.length &&
            lines[i].trim() !== '' &&
            !/^(#{1,6})\s+/.test(lines[i]) &&
            !/^\s*>/.test(lines[i]) &&
            !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
            !isFence(lines[i]) &&
            !/^\s*([-*_])\s*(\1\s*){2,}$/.test(lines[i]) &&
            !(/\|/.test(lines[i]) && /\|/.test(lines[i + 1] || ''))) {
            buf.push(lines[i]);
            i++;
        }
        push({type: 'paragraph', content: buf.join('\n')});
        continue;
    }
    return tokens;
};

const parseTable = (header, delim, body) => {
    const splitRow = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const alignments = splitRow(delim).map(c => {
        if (/^:-+:$/.test(c)) return 'center';
        if (/^-+:$/.test(c)) return 'right';
        return 'left';
    });
    const headers = splitRow(header);
    const renderRow = (cells, tag) => {
        const tds = cells.map((c, idx) => {
            const align = alignments[idx] ? ` style="text-align:${alignments[idx]}"` : '';
            return `<${tag}${align}>${renderInline(maybeEscape(c))}</${tag}>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    };
    const thead = `<thead>${renderRow(headers, 'th')}</thead>`;
    const tbody = `<tbody>${body.map(r => renderRow(splitRow(r), 'td')).join('')}</tbody>`;
    return `<table>${thead}${tbody}</table>`;
};

// Renders one tokenized block to HTML. Footnote definitions collect into the list the caller renders
// as a footer.
const renderToken = (token, footnoteDefs) => {
    switch (token.type) {
    case 'heading':
        return `<h${token.level}>${renderInline(maybeEscape(token.content))}</h${token.level}>`;
    case 'hr':
        return '<hr>';
    case 'code': {
        if (isBlocksFence(token.lang)) {
            // The raw XML rides along in an attribute; an SVG element cannot be expressed as an
            // HTML string here, so the picture is swapped in after the markup is in the DOM.
            return `<div class="hm-md-blocks" data-hm-blocks="${escapeHtml(token.content)}"></div>`;
        }
        const cls = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : '';
        return `<pre><code${cls}>${escapeHtml(token.content)}</code></pre>`;
    }
    case 'blockquote':
        return `<blockquote>${renderBlocks(token.content, true, allowHtmlEnabled)}</blockquote>`;
    case 'ul':
        return `<ul>${token.items.map(it => `<li>${renderInline(maybeEscape(it))}</li>`).join('')}</ul>`;
    case 'ol':
        return `<ol>${token.items.map(it => `<li>${renderInline(maybeEscape(it))}</li>`).join('')}</ol>`;
    case 'tasklist':
        return `<ul class="hm-md-tasklist">${token.items
            .map(it => `<li><input type="checkbox" disabled ${it.checked ? 'checked' : ''}> ${renderInline(maybeEscape(it.text))}</li>`)
            .join('')}</ul>`;
    case 'table':
        return parseTable(token.header, token.delim, token.body);
    case 'footnote-def':
        footnoteDefs.push({id: token.id, content: renderInline(maybeEscape(token.content))});
        return '';
    case 'paragraph':
    default:
        // Soft line breaks become <br> so multi-line text (e.g. blockquote callouts) stays
        // on separate lines instead of collapsing onto one.
        return `<p>${renderInline(maybeEscape(token.content)).replace(/\n/g, '<br>')}</p>`;
    }
};

// Renders tokenized blocks back to an HTML string. Used both for the top-level comment and
// recursively for blockquote content.
//
// Top-level blocks are tagged with the character offset they were rendered from. The markdown view is
// a rearrangement of the source, so a point in it cannot be turned back into a source offset by
// measuring alone; the anchor is what lets the drop indicator in drop-indicator.js say where a block
// released over the preview would be written. Nested content is skipped (`inner`): it renders from a
// different string, so its offsets would not be comparable with the comment source.

// README 开启「启用 HTML 支持」时调用：把整段文本当作 HTML 文档/片段解析并清洗，而不是当成
// markdown 文本逐行透传（否则 DOCTYPE/<html>/<head>/<style>/注释等会被当成普通段落，注释行和
// 换行会生成大量空白 <br>）。这里用 DOMParser 解析后只保留 <body> 内容，并剥离注释、纯空白
// 文本节点，以及会污染全局的 <style>/<script>/<head> 等。
//
// 同时，保留 HTML 结构的前提下，对文本节点再做一次 markdown 处理：块级容器（div/section/td…
// 以及 <body> 本身）内的文本走完整 markdown（标题/列表/段落/换行），行内容器（p/span/h1…/pre）
// 内的文本走行内 markdown + 软换行。这样既保留了用户手写的 HTML 标签，又让其中的 markdown
// 语法和换行正常生效。
// 整篇 HTML 文档——DOMParser 通道存在的唯一理由。只带一两个标签的普通 markdown 绝不能走这条
// 路：DOMParser 分不清「HTML 标签」和「代码围栏里的源码」，会把 ```blocks 围栏按它自己的标签
// 拆碎（围栏内容是 XML），等 markdown 再接手时已经拼不回去了。
const HTML_DOCUMENT_RE = /^\s*(?:<!doctype|<html[\s>]|<head[\s>]|<body[\s>])/i;
const isHtmlDocument = text => HTML_DOCUMENT_RE.test(text);

// 围栏属于 markdown 通道，不属于 HTML 解析，所以在 HTML 通道里先把围栏整段取出来、最后再放回。
// 占位符对两个通道都是惰性的：没有 HTML 标签、没有 markdown 语法（见 renderInline 对标签的处理）。
const FENCE_TOKEN = 'HMFENCETOKEN';
const extractFences = text => {
    const fences = [];
    const kept = [];
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
        if (!/^\s*(```|~~~)/.test(lines[i])) {
            kept.push(lines[i]);
            i++;
            continue;
        }
        const fenceChar = /(```|~~~)/.exec(lines[i])[1];
        const lang = lines[i].replace(/^\s*`{3,}|^\s*~{3,}/, '').trim();
        const buf = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(fenceChar)) {
            buf.push(lines[i]);
            i++;
        }
        i++; // 跳过收尾围栏
        kept.push(`${FENCE_TOKEN}${fences.length}${FENCE_TOKEN}`);
        fences.push({lang, content: buf.join('\n')});
    }
    return {text: kept.join('\n'), fences};
};

// 放回围栏时复用 code token 的渲染：```blocks 仍然产出积木占位（data-hm-blocks），其它围栏仍然
// 是 <pre><code>。footnoteDefs 传空数组——code 分支不会用到它。
const restoreFences = (html, fences) => {
    if (!fences.length) return html;
    return html.replace(new RegExp(`${FENCE_TOKEN}(\\d+)${FENCE_TOKEN}`, 'g'),
        (m, i) => renderToken({type: 'code', ...fences[Number(i)]}, []));
};

const STRIP_TAGS = /^(script|style|link|meta|title|head|base|noscript|template|html|body)$/i;
// 这些标签内的直接文本属于"行内散文"，按行内 markdown 处理（不再包一层 <p>，软换行转 <br>）。
const HTML_INLINE_CONTEXT = /^(a|abbr|b|bdi|bdo|button|caption|cite|code|data|datalist|dd|del|dfn|em|figcaption|i|ins|kbd|label|legend|li|mark|p|pre|q|s|samp|small|span|strong|sub|sup|summary|time|u|var)$/i;
const renderHtmlFragment = (html) => {
    if (typeof DOMParser === 'undefined') return escapeHtml(html);
    // 围栏先摘出来再解析，最后放回：否则围栏内容会被当成 HTML 拆散（见 extractFences）。
    const {text, fences} = extractFences(html);
    const doc = new DOMParser().parseFromString(text, 'text/html');

    // Strip comments, whitespace-only text (outside <pre>/<code>/<textarea>), and global-pollution
    // tags. Whitespace inside <pre>/<code> is significant and must be kept.
    const clean = (node) => {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 8 /* COMMENT */) {
                child.remove();
            } else if (child.nodeType === 1 /* ELEMENT */) {
                if (STRIP_TAGS.test(child.tagName)) {
                    child.remove();
                } else {
                    clean(child);
                }
            } else if (child.nodeType === 3 /* TEXT */) {
                const parentTag = child.parentNode && child.parentNode.tagName;
                const inPreserve = parentTag && /^(pre|code|textarea)$/i.test(parentTag);
                if (!inPreserve && !child.textContent.trim()) {
                    child.remove(); // 移除纯空白文本节点，消除元素间的空行
                }
            }
        }
    };
    clean(doc.body);

    // 把文本节点替换为它的 markdown 渲染结果（在 doc 内构造，避免外层 innerHTML 二次解析丢属性）。
    const renderTextNode = (textNode) => {
        const parent = textNode.parentNode;
        if (!parent) return;
        const tag = parent.tagName.toLowerCase();
        const isInline = HTML_INLINE_CONTEXT.test(tag) || /^h[1-6]$/.test(tag);
        let htmlOut;
        if (isInline) {
            htmlOut = renderInline(escapeHtml(textNode.textContent));
            if (tag !== 'pre' && tag !== 'code') {
                htmlOut = htmlOut.replace(/\n/g, '<br>'); // 软换行
            }
        } else {
            // 块级容器：走完整 markdown（标题/列表/段落/换行都生效），inner=true 不标记源偏移。
            htmlOut = renderBlocks(textNode.textContent, true, false);
        }
        const tmp = doc.createElement('div');
        tmp.innerHTML = htmlOut;
        const frag = doc.createDocumentFragment();
        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
        parent.insertBefore(frag, textNode);
        parent.removeChild(textNode);
    };

    // 递归处理：先快照直接子节点，避免边遍历边插入导致新节点被重复处理。
    const processElement = (el) => {
        const children = Array.from(el.childNodes);
        for (const child of children) {
            if (child.nodeType === 3 && child.textContent.trim()) {
                renderTextNode(child);
            } else if (child.nodeType === 1 && !STRIP_TAGS.test(child.tagName)) {
                processElement(child);
            }
        }
    };
    processElement(doc.body);

    return restoreFences(doc.body.innerHTML, fences);
};

const renderBlocks = (text, inner, allowHtml = false) => {
    // 只有整篇 HTML 文档才走 DOMParser 清洗（DOCTYPE/<head>/注释不会被当成普通段落、换行也不会
    // 变成一堆空 <br>）；其余一律走 markdown 分词——```blocks 围栏、源偏移锚点、块级结构只有分词
    // 这一条路认得出来。allowHtml 在分词这条路上只表示「文本节点里的手写 HTML 原样透传」，由
    // maybeEscape 落实。
    if (allowHtml && isHtmlDocument(text)) {
        return renderHtmlFragment(text);
    }
    // 同步调用无重入风险：用模块级开关告诉文本节点是否原样透传 HTML。
    const prevAllowHtml = allowHtmlEnabled;
    allowHtmlEnabled = !!allowHtml;
    try {
    // Character offset of the start of every source line: a token knows the line it began on, the
    // anchors need an offset, and this is the only place holding both.
    const lineOffsets = [];
    let at = 0;
    for (const line of text.split('\n')) {
        lineOffsets.push(at);
        at += line.length + 1;
    }

    const footnoteDefs = [];
    const bodyHtml = tokenizeBlocks(text).map(token => {
        const html = renderToken(token, footnoteDefs);
        if (!html || inner) return html;
        const src = lineOffsets[token.line] || 0;
        // A fenced code block is tagged with where it ended as well: the pair is the fence's whole
        // source range, which is what lets the picture be deleted again (block-delete.js) without
        // re-parsing the comment. An unterminated fence swallowed everything after it, so that is
        // where it ends — and `lineOffsets` has no entry past the last line, hence the fallback.
        let endAttr = '';
        if (typeof token.endLine === 'number') {
            const end = lineOffsets[token.endLine];
            endAttr = ` ${SRC_END_ATTR}="${end === undefined ? text.length : end}"`;
        }
        // The anchor only ever needs to land on the element itself, so it goes into the opening tag.
        return html.replace(/^<([a-zA-Z][\w-]*)/, `<$1 ${SRC_ATTR}="${src}"${endAttr}`);
    }).join('\n');

    let footnotes = '';
    if (footnoteDefs.length) {
        footnotes = '<div class="hm-md-footnotes">' +
            footnoteDefs.map(def =>
                `<div class="hm-md-footnote" id="hm-fn-${escapeHtml(def.id)}">` +
                `<sup>${escapeHtml(def.id)}</sup> ${def.content}</div>`).join('') +
            '</div>';
    }
    return bodyHtml + footnotes;
    } finally {
        allowHtmlEnabled = prevAllowHtml;
    }
};

// Swap every ```blocks placeholder for its rendered picture. Blockly can only build block SVG
// inside a live DOM node, so this runs after the markup has been inserted. `hint` becomes the
// picture's tooltip, telling the reader the blocks can be dragged out.
const renderBlockPreviews = (container, hint) => {
    const placeholders = container.querySelectorAll(BLOCKS_HOLDER_SELECTOR);
    if (!placeholders.length) return;
    placeholders.forEach(placeholder => {
        const xml = placeholder.getAttribute('data-hm-blocks') || '';
        placeholder.removeAttribute('data-hm-blocks');
        const svg = renderBlockXmlToSvg(xml);
        if (svg) {
            // Keeping the source on the (now rendered) picture is what makes it draggable later.
            placeholder.setAttribute(BLOCK_XML_ATTR, xml);
            if (hint) placeholder.setAttribute('title', hint);
            placeholder.appendChild(svg);
        } else {
            // Invalid XML, no blocks, or scratch-blocks not loaded: show the source instead.
            placeholder.classList.add('hm-md-blocks-error');
            placeholder.innerHTML = `<pre><code class="language-blocks">${escapeHtml(xml)}</code></pre>`;
        }
    });
};

const renderMarkdown = (text, container, hint) => {
    // 注释预览走 markdown 分词 + 文本节点 HTML 透传：手写 HTML 标签会被渲染，标签内（以及标签
    // 之间）的 markdown 语法与换行照常生效，```blocks 围栏也照旧产出积木占位。
    container.innerHTML = renderBlocks(text, false, true);
    // 透传的标签里，这几个会污染整页或自带执行语义，预览里不该留（内联 style 属性不受影响）。
    container.querySelectorAll('script, style, link, meta, base, iframe, object, embed')
        .forEach(node => node.remove());
    renderBlockPreviews(container, hint);
};

const setupComment = commentEl => {
    if (commentEl.hasAttribute(PROCESSED_ATTR)) return;
    const textarea = commentEl.querySelector('.scratchCommentTextarea');
    if (!textarea) return;

    // Anchor: the foreignObject is position:relative and exactly wraps the editable area.
    const foreignObject = commentEl.querySelector('.scratchCommentForeignObject');
    if (!foreignObject) return;
    if (!commentEl.querySelector('.scratchCommentBody')) return;

    commentEl.setAttribute(PROCESSED_ATTR, 'true');

    const preview = document.createElement('div');
    preview.className = 'hm-md-preview';
    preview.style.display = 'none';

    // Create an SVG image toggle button inside the comment's top bar, matching the built-in
    // minimize/delete icons. It is appended to the bubble group (the same parent as the top bar
    // rect and the built-in icons) so it moves/resizes with the bubble without extra DOM hacks.
    const toggleIcon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    toggleIcon.setAttribute('class', 'hm-md-toggle-icon');
    toggleIcon.setAttribute('width', '20');
    toggleIcon.setAttribute('height', '20');
    toggleIcon.setAttribute('cursor', 'pointer');
    toggleIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', ICON_PREVIEW);

    const topBar = commentEl.querySelector('.scratchCommentTopBar');

    const isCommentMinimized = () =>
        foreignObject.getAttribute('display') === 'none' ||
        foreignObject.style.display === 'none';

    const updateToggleVisibility = () => {
        const barWidth = topBar ? Number(topBar.getAttribute('width')) || 0 : 0;
        // Hide when minimized or when the top bar is too narrow to fit the toggle without
        // crowding the built-in icons / comment text.
        const MIN_TOGGLE_WIDTH = 120;
        if (isCommentMinimized() || (barWidth > 0 && barWidth < MIN_TOGGLE_WIDTH)) {
            toggleIcon.setAttribute('display', 'none');
        } else {
            toggleIcon.removeAttribute('display');
        }
    };

    const getIconHref = img =>
        img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
        img.getAttribute('href') || '';

    const findIcon = hrefSubstr => {
        for (const img of commentEl.querySelectorAll('image')) {
            if (getIconHref(img).includes(hrefSubstr)) return img;
        }
        return null;
    };

    const positionToggleIcon = () => {
        const barWidth = topBar ? Number(topBar.getAttribute('width')) || 0 : 0;
        if (!barWidth) return;
        // Hard-coded from scratch-blocks/core/scratch_bubble.js constants.
        const TOP_BAR_HEIGHT = 32;
        const BORDER_WIDTH = 1;
        const MINIMIZE_ICON_SIZE = 32;
        const iconSize = 20;
        const gap = 2;
        const y = TOP_BAR_HEIGHT / 2 + BORDER_WIDTH - iconSize / 2;

        // Detect RTL by comparing the built-in icons: in RTL the minimize arrow sits on the
        // right side of the top bar; in LTR it sits on the left.
        const minimizeArrow = findIcon('comment-arrow');
        const deleteIcon = findIcon('delete-x');
        let rtl = false;
        if (minimizeArrow && deleteIcon) {
            const minX = Number(minimizeArrow.getAttribute('x')) || 0;
            const delX = Number(deleteIcon.getAttribute('x')) || 0;
            rtl = minX > delX;
        }

        // Place the toggle immediately beside the minimize arrow.
        const minX = minimizeArrow ? Number(minimizeArrow.getAttribute('x')) || 0 : 0;
        const x = rtl
            ? (minX || barWidth - MINIMIZE_ICON_SIZE) - iconSize - gap
            : (minX || 0) + MINIMIZE_ICON_SIZE + gap;
        toggleIcon.setAttribute('x', Math.max(gap, x));
        toggleIcon.setAttribute('y', y);
    };

    let mode = 'edit'; // 'edit' | 'preview'

    // The title names the mode the click would switch to, so it is derived from `mode` rather than
    // written per branch — and it is written again whenever the pointer arrives, not once here.
    // A comment bubble outlives a language switch from the language menu, and nothing rebuilds this
    // DOM when that happens (the editor is not React), so a string captured at setup would be stuck
    // in the language that was current then. The browser reads `title` when it shows the tooltip, so
    // writing it on the way in is what makes it follow the language.
    const refreshToggleTitle = () =>
        toggleIcon.setAttribute('title', hmMessage(mode === 'preview' ? MSG.edit : MSG.preview));
    refreshToggleTitle();
    toggleIcon.addEventListener('mouseover', refreshToggleTitle);

    const setMode = next => {
        mode = next;
        if (mode === 'preview') {
            textarea.style.display = 'none';
            preview.style.display = 'block';
            renderMarkdown(textarea.value, preview, hmMessage(MSG.dragHint));
            toggleIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', ICON_EDIT);
            refreshToggleTitle();
        } else {
            preview.style.display = 'none';
            textarea.style.display = '';
            toggleIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', ICON_PREVIEW);
            refreshToggleTitle();
            textarea.focus();
            // Code mode is a "carry on writing" gesture, yet a freshly focused textarea puts the
            // caret at the start. Send it to the end, which is also where a block dropped onto the
            // comment will be written.
            if (typeof textarea.setSelectionRange === 'function') {
                const end = textarea.value.length;
                textarea.setSelectionRange(end, end);
            }
        }
    };

    // Mimic the built-in icon interaction: mousedown starts the intent, mouseout cancels it,
    // mouseup toggles if the intent is still active. This avoids triggering on drag gestures.
    let shouldToggle = false;
    toggleIcon.addEventListener('mousedown', e => {
        shouldToggle = true;
        e.stopPropagation();
        e.preventDefault();
    });
    toggleIcon.addEventListener('mouseout', () => {
        shouldToggle = false;
    });
    toggleIcon.addEventListener('mouseup', e => {
        if (shouldToggle) {
            shouldToggle = false;
            setMode(mode === 'edit' ? 'preview' : 'edit');
        }
        e.stopPropagation();
    });

    // Keep the icon positioned and visible when the bubble is resized (Blockly updates the top
    // bar width).
    if (topBar && typeof MutationObserver !== 'undefined') {
        const sizeObserver = new MutationObserver(() => {
            positionToggleIcon();
            updateToggleVisibility();
        });
        sizeObserver.observe(topBar, {attributes: true, attributeFilter: ['width']});
    }

    // Hide the toggle while the comment is minimized (only the top bar is visible).
    if (typeof MutationObserver !== 'undefined') {
        const visibilityObserver = new MutationObserver(() => {
            updateToggleVisibility();
        });
        visibilityObserver.observe(foreignObject, {attributes: true, attributeFilter: ['display']});
    }

    // The preview overlays the comment bubble, which Blockly treats as a draggable surface.
    // Without swallowing pointer events here, dragging inside the preview would bubble up to
    // Blockly and start a workspace drag.
    const swallowDrag = e => {
        e.stopPropagation();
    };
    ['mousedown', 'touchstart', 'pointerdown', 'dragstart'].forEach(type => {
        preview.addEventListener(type, swallowDrag);
    });

    // Wheel events must also stay local so the preview scrolls on its own — EXCEPT Ctrl/Cmd
    // + wheel, which must keep bubbling up so Blockly can zoom the workspace.
    const swallowWheel = e => {
        if (e.ctrlKey || e.metaKey) return; // let Ctrl+wheel reach Blockly for workspace zoom
        e.stopPropagation();
    };
    preview.addEventListener('wheel', swallowWheel, {passive: true});

    // The picture's tooltip is written when the render happens (renderBlockPreviews) and again here,
    // for the same reason the toggle's is: a language switch does not re-render the comment, and the
    // tooltip is read at the moment the pointer arrives. Delegated, because the pictures are
    // re-created by every render.
    preview.addEventListener('mouseover', e => {
        const holder = e.target && e.target.closest ?
            e.target.closest(BLOCKS_HOLDER_SELECTOR) : null;
        if (!holder || !holder.getAttribute(BLOCK_XML_ATTR)) return;
        holder.setAttribute('title', hmMessage(MSG.dragHint));
    });

    // A picture of blocks can be dragged out into the workspace. It is only a snapshot, so this
    // always adds a copy and leaves the comment's source untouched.
    preview.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const holder = e.target && e.target.closest ?
            e.target.closest(BLOCKS_HOLDER_SELECTOR) : null;
        if (!holder) return;
        const xml = holder.getAttribute(BLOCK_XML_ATTR);
        if (!xml) return;
        e.preventDefault();
        // `swallowDrag` above already keeps the event from Blockly; this ordering also stops the
        // comment bubble from treating it as the start of its own drag.
        e.stopPropagation();
        startBlockDragFromXml(xml, e.clientX, e.clientY, holder);
    });

    // A right-click on a picture offers to delete the very fence it was rendered from, through
    // scratch-blocks' own context menu. Both the stopping and the `preventDefault` are for the same
    // reason as above: Blockly must not read this as a right-click on the workspace, and the
    // browser's own menu is not what is being asked for.
    //
    // A press anywhere in here then dismisses that menu. Normally nobody has to ask for that —
    // Blockly closes a context menu from the gesture a press starts — but the press is swallowed
    // right above, so no gesture is ever started in here.
    ['mousedown', 'touchstart'].forEach(type => {
        preview.addEventListener(type, hideBlockMenu);
    });

    preview.addEventListener('contextmenu', e => {
        const holder = e.target && e.target.closest ?
            e.target.closest(BLOCKS_HOLDER_SELECTOR) : null;
        if (!holder) return;
        e.preventDefault();
        e.stopPropagation();
        showBlockMenu(e, holder, textarea, hmMessage(MSG.deleteBlocks));
    });

    textarea.addEventListener('input', () => {
        if (mode === 'preview') {
            renderMarkdown(textarea.value, preview, hmMessage(MSG.dragHint));
        }
    });

    // The body holds the textarea; the foreignObject is the sized, position:relative box that
    // wraps the editable area, so the preview is anchored to it (the body collapses to 0 height
    // once the textarea is hidden, which would kill a body-anchored absolute preview).
    foreignObject.appendChild(preview);
    if (topBar) {
        commentEl.insertBefore(toggleIcon, topBar.nextSibling);
        positionToggleIcon();
        updateToggleVisibility();
    }
};

const processAll = () => {
    if (typeof document === 'undefined') return;
    if (!getSetting(SETTING_COMMENT_MARKDOWN_EDITOR)) return;
    document.querySelectorAll(COMMENT_SELECTOR).forEach(setupComment);
};

let observer = null;
let interval = null;

const start = () => {
    if (typeof document === 'undefined') return;
    injectStyle();
    // Blocks dragged out of the workspace and dropped on a comment become code in it.
    startBlockToCode();
    processAll();

    observer = new MutationObserver(mutations => {
        let shouldProcess = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.matches && node.matches(COMMENT_SELECTOR)) {
                    shouldProcess = true;
                } else if (node.querySelector && node.querySelector(COMMENT_SELECTOR)) {
                    shouldProcess = true;
                }
            }
        }
        if (shouldProcess) {
            requestAnimationFrame(processAll);
        }
    });
    observer.observe(document.body, {childList: true, subtree: true});

    // Safety net: Blockly re-creates bubbles on resize/minimize, which the observer above can
    // miss when nodes are moved rather than added.
    interval = setInterval(processAll, 2000);
};

const teardown = () => {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
    stopBlockToCode();
    // The right-click menu is not part of the comment DOM, so removing the previews would leave it
    // hanging in the air.
    hideBlockMenu();
    disposeBlockRenderer();
    if (typeof document !== 'undefined') {
        document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => {
            el.removeAttribute(PROCESSED_ATTR);
            const textarea = el.querySelector('.scratchCommentTextarea');
            if (textarea) textarea.style.display = '';
            const preview = el.querySelector('.hm-md-preview');
            if (preview) preview.remove();
            const toggle = el.querySelector('.hm-md-toggle-icon');
            if (toggle) toggle.remove();
        });
    }
};

/**
 * Applies the saved value and keeps it in sync from then on.
 * Safe to call once, when the editor interface comes up.
 */
const initCommentMarkdownEditor = () => {
    if (typeof document === 'undefined') return;
    const apply = enabled => {
        if (enabled) {
            start();
        } else {
            teardown();
        }
    };
    apply(getSetting(SETTING_COMMENT_MARKDOWN_EDITOR));
    onSettingsChange((key, value) => {
        if (key === SETTING_COMMENT_MARKDOWN_EDITOR) {
            apply(value);
        }
    });
};

export {
    initCommentMarkdownEditor,
    // Reused by the `readme` addon (src/addons/addons/readme) to render README Markdown the same
    // way comment previews do.
    renderBlocks,
    // Swaps each ```blocks placeholder (a bare `data-hm-blocks` div from renderBlocks) for the
    // scratch-blocks SVG picture. renderBlocks alone only emits the placeholder; the picture is
    // built here, because Blockly can only construct block SVG inside a live DOM node.
    renderBlockPreviews
};
