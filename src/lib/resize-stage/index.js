/**
 * "Allow changing the width of the stage and target selector" (HyperMimic setting
 * `stageColumnResize`).
 *
 * The GUI's flex row is [workspace pane][stage + target selector column]. The column is sized by
 * its content -- the stage -- so out of the box it can never be anything but the stage's width.
 * This puts a drag strip on the divider between the two and drives the column's `flex-basis` from
 * it, so the room comes out of (or goes to) the workspace.
 *
 * The stage scales with the column: the stage's own wrapper is zoomed by
 * `columnWidth / stageWidth`, so it keeps filling the column at any width -- the same way the GUI's
 * `constrained` stage size scales it, only continuous and user driven. The zoom goes on the stage
 * wrapper rather than on the canvas area around it for two reasons: the area's offset padding then
 * stays out of the zoom, so the stage's top edge does not drift; and the `editor-compact` addon
 * zooms that same element in small stage mode, so writing there replaces its zoom instead of
 * stacking a second one on top of it.
 *
 * Which side the column sits on is read from the live layout rather than assumed: the
 * `editor-stage-left` addon flips the whole row (`flex-direction: row-reverse`), and RTL mirrors it
 * as well. Everything that has a direction -- where the strip goes, which way a drag grows the
 * column, which edge the stage is pinned to -- follows that one measurement.
 *
 * Full screen is left alone entirely: there the stage is sized by the window and painted over
 * everything, so a column width has no meaning and the zoom would only shrink it.
 *
 * The width itself is not persisted: it survives the GUI remounting (the value is kept in this
 * module) but a reload goes back to the natural width, the same as the block palette resize.
 */

import {
    getSetting,
    onSettingsChange,
    SETTING_STAGE_COLUMN_RESIZE
} from '../hypermimic-settings.js';
import LazyScratchBlocks from '../tw-lazy-scratch-blocks.js';
import {layoutWorkspaceBackgroundNow, refreshWorkspaceBackgroundLayout} from '../workspace-background/index.js';
// Dragging past a stage's own size changes the stage size setting, so that the stage is mostly
// shown at (or near) 1:1 instead of being resampled by the zoom.
import AddonHooks from '../../addons/hooks.js';
import {setStageSize} from '../../reducers/stage-size';
import {STAGE_DISPLAY_SCALE_METADATA, STAGE_DISPLAY_SIZES, STAGE_SIZE_MODES} from '../layout-constants';

const RESIZE_HANDLE_WIDTH = 6;
// How long the strip takes to fade in and out (and with it the workspace scrollbar it hides).
const FADE_MS = 400;
// The stage's own border. It is scaled with the stage (see the injected CSS) so that the border and
// the rounded corner grow together instead of one of them staying behind.
const STAGE_BORDER = 1;
// The stage's corner radius (components/stage/stage.css: `border-radius: $space`).
const STAGE_CORNER = '0.5rem';
// The narrowest stage the GUI itself can show (its "small stage" size). The column may be dragged
// down to this whatever stage size is selected, so the divider has one floor in both modes.
const MIN_STAGE_WIDTH = 240;
// The two fixed stage sizes the editor offers for the column, each plus the 2px border the stage
// draws around itself (stage-header.jsx adds the same 2 to the floor it gives its own row). A
// stage drawn at one of these numbers is at exactly 1:1; the column is what scales it in between,
// and the size setting follows the drag so that the stage is only ever "shrunk" or "stretched" by
// the fraction between two of them (see stageBracket).
const STAGE_SMALL_WIDTH = 242; // 240 + 2
const STAGE_LARGE_WIDTH = 482; // 480 + 2
// A mode switch would otherwise happen on the exact pixel the drag crosses, and a pointer resting
// there would flip the two layouts back and forth; a few px of travel are required instead.
const STAGE_SWITCH_SLACK = 4;
// Roughly what the target selector needs left underneath the stage to stay usable.
const MIN_TARGET_HEIGHT = 150;
// What has to stay usable for the workspace pane: the toolbox is ~310px, so anything below roughly
// this leaves nothing to drop a block on.
const MIN_EDITOR_WIDTH = 420;
const STYLE_ID = 'hm-resize-stage';
// On <html> only while the feature is enabled *and* in charge, so none of the layout overrides
// below leak into the stock GUI or fight another feature that owns the stage.
const ROOT_CLASS = 'hm-resize-stage';
// Set while the setting itself is on, and *not* dropped by suspend: one rule needs to reach the
// full-screen header, which is the one state where this module hands the stage back.
const ENABLED_CLASS = 'hm-resize-stage-enabled';
// Set together with the root class when the stage column is the *first* pane of the row, which is
// what the editor-stage-left addon and RTL both produce.
const COLUMN_LEFT_CLASS = 'hm-resize-stage-column-left';
const HANDLE_CLASS = 'hm-stage-column-handle';
const DRAGGING_CLASS = 'hm-stage-column-handle--dragging';
// Set while the pointer is over the strip. The workspace's own scrollbar sits right next to it, and
// on a light theme its track is a light strip that reads as a stray white line beside the highlight
// -- most visible with the compact editor, which thins everything around it. It has no business
// being there while the divider is being used.
const HOVER_CLASS = 'hm-stage-resize-hover';
// CSS Modules hashes the class, but the file-local name is kept as a substring of it
// (stage-and-target-wrapper_2TUbW), which is sturdier than a hashed name nobody can predict.
const COLUMN_SELECTOR = '[class*="stage-and-target-wrapper"]';
const WORKSPACE_SELECTOR = '[class*="editor-wrapper"]';
// Blockly's container: its size is what the workspace has to be re-measured against.
const INJECTION_SELECTOR = '[class*="injectionDiv"]';
const STAGE_AREA_SELECTOR = '[class*="stage-canvas-wrapper"]';
// The stage wrapper and the bordered stage surface inside it (`stage_stage_HASH`, not the
// overlays).
const STAGE_WRAPPER_SELECTOR = '[class*="stage_stage-wrapper_"]';
const STAGE_BOX_SELECTOR = '[class*="stage_stage_"]';
// The pane that owns the column and carries the full-screen marker (`stage-wrapper_full-screen_`).
const STAGE_OUTER_SELECTOR = '[class*="stage-wrapper_stage-wrapper_"]';
const FULLSCREEN_SELECTOR = '[class*="stage-wrapper_full-screen"]';
const HEADER_SELECTOR = '[class*="stage-header_stage-header-wrapper_"]';
// The pane under the stage: it is what makes the column refuse to get narrower than its content
// unless it is allowed to shrink (min-width: auto on a flex item is a hard floor).
const TARGET_PANE_SELECTOR = '[class*="target-pane_target-pane"]';
const SPRITE_LIST_SELECTOR = '[class*="sprite-selector_sprite-selector"]';
const MAX_WAIT_FRAMES = 600; // ~10s; give up retrying if the GUI never renders

let handle = null;
// The requested column width, kept across remounts of the GUI. `null` means "natural".
let customWidth = null;
let dragState = null;
let active = false;
// Cleared while another feature owns the stage column (see `suspend`).
let inCharge = false;
let waitFrames = 0;
let onWindowResize = null;
// The stage width the current column width was chosen against. A different measurement means the
// stage size setting changed and the column goes back to natural.
let lastStageWidth = null;


// The workspace pane's width changes on every frame of a drag, but Blockly only re-derives its
// size from the container when something asks it to -- which is why the GUI dispatches a window
// resize after a stage size change. Calling svgResize() does that job directly, without waking
// every other window resize listener in the editor (stage rect tracking, backpack, ...).
let workspaceResizeFrame = 0;

const resizeWorkspace = () => {
    if (!LazyScratchBlocks.isLoaded()) return;
    try {
        const Blockly = LazyScratchBlocks.get();
        if (!Blockly || !Blockly.svgResize || !Blockly.getMainWorkspace) return;
        const workspace = Blockly.getMainWorkspace();
        if (workspace) Blockly.svgResize(workspace);
    } catch (e) {
        // Blockly is not ready yet; the next frame of the drag will catch up.
    }
};

// At most once per frame: the pointer fires far more often than the screen refreshes, and every
// pass through Blockly's layout is real work.
const scheduleWorkspaceResize = () => {
    if (workspaceResizeFrame) return;
    workspaceResizeFrame = window.requestAnimationFrame(() => {
        workspaceResizeFrame = 0;
        resizeWorkspace();
    });
};

// The wallpaper is laid out against the workspace pane's size and the module that owns it only
// listens for window resizes, so a divider drag has to ask it explicitly. The synchronous entry
// point is used so the image tracks the drag frame by frame; it reports false while there is
// nothing to lay out yet (no wallpaper, or its settings have never been read), and only then does
// the slower asynchronous refresh get scheduled -- once, not per frame.
let backgroundFrame = 0;
let backgroundFallbackTimer = null;

const scheduleBackgroundLayout = () => {
    if (backgroundFrame) return;
    backgroundFrame = window.requestAnimationFrame(() => {
        backgroundFrame = 0;
        if (layoutWorkspaceBackgroundNow()) return;
        if (backgroundFallbackTimer) return;
        backgroundFallbackTimer = window.setTimeout(() => {
            backgroundFallbackTimer = null;
            refreshWorkspaceBackgroundLayout();
        }, 80);
    });
};

// A few parts of the editor only re-measure themselves on a window resize, and the paint editor's
// canvas is one of them (paper.js resizes its view from that event): without this the costume
// canvas keeps its old bitmap size and gets stretched horizontally by the container. The event is
// throttled -- it wakes a handful of listeners, and a drag does not need it on every frame.
let windowResizeTimer = null;

const dispatchWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
};

const scheduleWindowResize = () => {
    if (windowResizeTimer) return;
    windowResizeTimer = window.setTimeout(() => {
        windowResizeTimer = null;
        dispatchWindowResize();
    }, 150);
};

const getColumn = () => document.querySelector(COLUMN_SELECTOR);

const getStageArea = () => {
    const column = getColumn();
    return column ? column.querySelector(STAGE_AREA_SELECTOR) : null;
};

const getStageWrapper = () => {
    const column = getColumn();
    return column ? column.querySelector(STAGE_WRAPPER_SELECTOR) : null;
};

const getStageBox = () => {
    const column = getColumn();
    return column ? column.querySelector(STAGE_BOX_SELECTOR) : null;
};

const getStageOuter = () => {
    const column = getColumn();
    return column ? column.querySelector(STAGE_OUTER_SELECTOR) : null;
};

/** Full screen paints its own stage over everything; the column has no say there. */
const isFullScreen = () => !!document.querySelector(FULLSCREEN_SELECTOR);

/**
 * Whether the editor is showing the project page (the play view) instead of the editor.
 *
 * It is a redux mode on the same page, not a navigation, so every inline style this module writes
 * survives the switch: the column keeps its `flex-basis`/`min-width`, the stage keeps the zoom and
 * the bar keeps the width it was pinned to. The play view lays its controls bar out for the plain
 * stage, so those leftovers push it around -- which is what "the play view's control bar looks
 * wrong after a round trip through the project page" was.
 * @returns {boolean} true while the player is showing
 */
const isPlayerMode = () => {
    const store = AddonHooks.appStateStore;
    if (!store) return false;
    const state = store.getState();
    const mode = state && state.scratchGui && state.scratchGui.mode;
    return !!(mode && mode.isPlayerOnly);
};

/**
 * Whether the stage column is the first pane of the row. Mirrors both RTL and the
 * editor-stage-left addon, which are the same thing as far as this module is concerned.
 */
const isColumnOnLeft = () => {
    const column = getColumn();
    const workspace = document.querySelector(WORKSPACE_SELECTOR);
    if (!column || !workspace) return false;
    return column.getBoundingClientRect().left < workspace.getBoundingClientRect().left;
};

const syncSide = () => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(COLUMN_LEFT_CLASS, isColumnOnLeft());
};

const injectStyle = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
        // The handle is absolutely positioned inside the column.
        // `flex-shrink: 0` is what makes the width this module writes the width the column actually
        // gets: gui.css leaves the column a shrinkable flex item (only `flex-basis: 0`), so when the
        // row cannot fit both it takes a share off each pane in proportion to their basis -- the
        // column rendered narrower than its `flex-basis` (628.5 vs 695) while the zoom had been
        // computed from the width that was *asked* for, and the stage painted wider than the column
        // (693 vs 628.5), spilling out of it towards the divider. Pinning the column to its basis
        // makes the workspace give up the room instead, which is what the drag is for.
        `html.${ROOT_CLASS} ${COLUMN_SELECTOR}{position:relative;flex-shrink:0;}` +
        // The workspace pane ships with flex-shrink: 0, so without this a wider stage column would
        // simply overflow the row (which is overflow: hidden) and clip the workspace instead.
        `html.${ROOT_CLASS} ${WORKSPACE_SELECTOR}{flex-shrink:1;min-width:0;}` +
        // The pane under the stage would otherwise floor the column at its own content width
        // (`min-width: auto` on a flex item), so a narrower column would keep it at the old width
        // and push the whole selector pane out past the column's edge.
        `html.${ROOT_CLASS} ${TARGET_PANE_SELECTOR},` +
        `html.${ROOT_CLASS} ${SPRITE_LIST_SELECTOR}{min-width:0;}` +
        // The stage grows away from its outer top corner: its edge stays glued to the column's
        // outer edge while the inner edge follows the divider, which is what makes the drag read as
        // resizing from that side. The class says which side that is (see syncSide).
        `html.${ROOT_CLASS}:not(.${COLUMN_LEFT_CLASS}) ${STAGE_AREA_SELECTOR}{justify-content:flex-end;}` +
        `html.${ROOT_CLASS}.${COLUMN_LEFT_CLASS} ${STAGE_AREA_SELECTOR}{justify-content:flex-start;}` +
        // The stage's wrapper carries the zoom, so it must not be laid out by the flex container
        // around it: a flex item is stretched across the cross axis and shrunk when it does not fit,
        // and `zoom` then multiplies that layout size a second time -- the stage ended up wider and
        // taller than the pane and spilled out of it towards the left and the bottom, more the
        // larger the scale. Sizing it by its content and leaving the cross axis alone keeps the
        // rendered size exactly what the zoom was computed for. (The compact addon is what makes
        // the pane a flex container in the first place, which is why it showed up there first.)
        `html.${ROOT_CLASS} ${STAGE_AREA_SELECTOR}{align-items:flex-start;}` +
        // The wrapper carries an inline `min-width` equal to the *unzoomed* stage width (React writes
        // it). `zoom` multiplies it too, so at 1.5x the floor became 723px while the stage itself
        // rendered 722px -- the wrapper ended up a hair wider than the stage, which then sat in its
        // top-left corner leaving a sliver of page background along the right and bottom edges.
        // The width is what this module computes, so the floor is released.
        `html.${ROOT_CLASS} ${STAGE_WRAPPER_SELECTOR}{flex:0 0 auto;min-width:0 !important;}` +
        // `zoom` scales everything inside the wrapper, border and corner radius included, so at 1.5x
        // the frame turns 1.5px thick and the corners 1.5x round. Both are divided by the zoom to
        // keep them the size they are at 1:1. Dividing (rather than multiplying by the zoom) also
        // keeps the box from growing: the border is part of the layout, so a thicker one would push
        // the stage's own width past the column and skew it towards the bottom-right of the wrapper
        // by `2 * (border - 1)` -- more the wider the stage gets.
        `html.${ROOT_CLASS} ${STAGE_BOX_SELECTOR}{` +
        `border-width:calc(${STAGE_BORDER}px / var(--hm-zoom, 1));` +
        `border-radius:calc(${STAGE_CORNER} / var(--hm-zoom, 1));}` +
        // The ask prompt is the one thing on the stage that should not grow with it: it gets wider
        // as the stage does, but keeping its height is what stops it reading as a banner. Counter-
        // zooming the card cancels the stage's zoom for its contents -- text, padding and height
        // stay the size they are at 1:1 -- while `width: 100%` still fills the stage, because a
        // percentage resolves against the box a zoomed element is *drawn* in.
        // The `> *` reset is belt and braces for engines where `zoom` still inherits, which would
        // otherwise cancel a second time inside the card.
        `html.${ROOT_CLASS} [class*="question-wrapper"]{zoom:var(--hm-zoom-inverse, 1);` +
        'width:100% !important;}' +
        `html.${ROOT_CLASS} [class*="question-wrapper"] > *{zoom:1;}` +
        // The stage menu is an absolutely positioned overlay pinned to one edge (right in the
        // default layout, left when the column is the first pane) and its inline min-width is the
        // stage's own size, so it used to stay at the old width while the stage grew away
        // underneath it. Its min-width is released here and its width is written from the stage box
        // every frame (see syncHeaderWidth), which keeps the controls on the stage's edges exactly.
        `html.${ROOT_CLASS}:not(.${COLUMN_LEFT_CLASS}) ${HEADER_SELECTOR}{left:auto;right:0;}` +
        `html.${ROOT_CLASS}.${COLUMN_LEFT_CLASS} ${HEADER_SELECTOR}{left:0;right:auto;}` +
        `html.${ROOT_CLASS} ${HEADER_SELECTOR}{min-width:0 !important;}` +
        // Full screen builds its own header overlay, and that overlay is a fixed box whose
        // containing block is the stage's own box rather than the window -- so it only painted
        // across the stage, leaving the letterboxed margins bare. Widening the *overlay* (not the
        // row inside it) puts the background across the window while the controls stay lined up
        // with the stage's edges, which is what the row's width already does.
        //
        // Viewport units plus the difference: `100%` here is that stage-sized containing block,
        // while 100vw is the window whatever the box is, and the negative offset recentres the
        // result on the window. If the containing block already is the window both terms cancel.
        `html.${ENABLED_CLASS} ${FULLSCREEN_SELECTOR} ` +
        '[class*="stage-header_stage-header-wrapper-overlay_"]{' +
        'left:calc((100vw - 100%) / -2) !important;right:auto !important;width:100vw !important;}' +
        // The icon buttons in the bar (the debugger addon's, and the full-screen one) are built
        // differently from the stage-size toggles: they are an outlined button wrapping a content
        // box wrapping the img, and that chain centres by padding rather than by layout. Once the
        // bar's width is driven from here the padding/box arithmetic stops lining up -- most
        // visibly in the compact editor, where the padding is a computed value -- so centre the
        // icon by layout instead, which holds whatever the padding turns out to be.
        `html.${ROOT_CLASS} [class*="stage-header_stage-button_"]:not([class*="stage-button-icon_"]){` +
        'display:flex;align-items:center;justify-content:center;}' +
        `html.${ROOT_CLASS} [class*="stage-header_stage-button_"]:not([class*="stage-button-icon_"])` +
        '{line-height:0;}' +
        `html.${ROOT_CLASS} [class*="stage-header_stage-button_"] ` +
        `[class*="button_content_"]{display:flex;align-items:center;justify-content:center;` +
        'width:100%;height:100%;}' +
        // The hide-stage addon's button is a toggle button whose icon it pins to `height: auto` (to
        // keep the glyph's aspect ratio), which leaves the image a different height from the button's
        // content box, so it no longer sits centred. Contain it in the box instead: the glyph keeps
        // its ratio and is centred on both axes.
        `html.${ROOT_CLASS} [class*="sa-hide-stage-button"]{` +
        'display:flex;align-items:center;justify-content:center;line-height:0;}' +
        `html.${ROOT_CLASS} [class*="sa-hide-stage-button"] [class*="stage-button-icon"]{` +
        'flex:0 0 auto;width:100%;height:100%;object-fit:contain;display:block;}' +
        // The strip is painted with the accent colour the whole time and faded in and out, instead
        // of having its colour animated: `opacity` is the one property the compositor can carry by
        // itself, and it fades both ways from a single declaration. (A colour that only exists in
        // the :hover rule animates out but snaps back in, because when the rule stops matching the
        // transition goes with it.)
        `.${HANDLE_CLASS}{position:absolute;top:0;bottom:0;width:${RESIZE_HANDLE_WIDTH}px;` +
        'z-index:60;cursor:ew-resize;background-color:var(--looks-secondary);opacity:0;' +
        // Touch: the gesture has to belong to the strip, or the browser treats the drag as a
        // scroll/zoom and fires pointercancel halfway through. `user-select` keeps a long press
        // from starting a text selection, which would otherwise cancel the drag on mobile.
        'touch-action:none;user-select:none;-webkit-user-select:none;' +
        '-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;' +
        `transition:opacity ${FADE_MS}ms ease;}` +
        `.${HANDLE_CLASS}:hover,.${HANDLE_CLASS}.${DRAGGING_CLASS}{opacity:1;}` +
        // A finger needs a bigger target than a pointer does, but widening the element itself
        // would widen the visible accent line. This invisible child only extends the hit area, so
        // the strip still reads as a 6px divider while staying grabbable on a touchscreen. The
        // faint resting opacity is for the same devices: there is no hover to reveal the strip, so
        // without it the divider would be invisible until it is being dragged.
        `@media (any-pointer: coarse){.${HANDLE_CLASS}{opacity:0.3;}` +
        `.${HANDLE_CLASS}::before{content:'';position:absolute;` +
        'top:0;bottom:0;left:-11px;right:-11px;}}' +
        // The workspace's own scrollbar is the thing that showed up as a light sliver next to the
        // strip; fade it out while the divider is in use (it cannot be reached anyway, the pointer
        // is busy). Both rules have to leave the flyout's scrollbar alone: it carries the same
        // `blocklyScrollbar*` class, and a `transition` shorthand here replaced the addon's
        // `transition-property: margin` -- the slide that keeps it in step with the palette, which
        // then happened in a single frame. Only `opacity` is declared, so nothing else of theirs is
        // reset either.
        `html.${ROOT_CLASS} ${WORKSPACE_SELECTOR} [class*="blocklyScrollbar"]:not(` +
        '[class*="blocklyFlyoutScrollbar"]){' +
        `transition-property:opacity;transition-duration:${FADE_MS}ms;` +
        'transition-timing-function:ease;}' +
        `html.${HOVER_CLASS} ${WORKSPACE_SELECTOR} ` +
        `[class*="blocklyScrollbar"]:not([class*="blocklyFlyoutScrollbar"]){opacity:0;}` +
        // The strip sits just inside the divider: the column's inner edge, which is the left edge in
        // the default layout and the right edge when the column is the first pane (stage-left, RTL).
        // One pixel in, so the divider's own edge is left visible under the highlight.
        `html.${ROOT_CLASS}:not(.${COLUMN_LEFT_CLASS}) .${HANDLE_CLASS}{left:1px;right:auto;}` +
        `html.${ROOT_CLASS}.${COLUMN_LEFT_CLASS} .${HANDLE_CLASS}{left:auto;right:1px;}` +
        // With the "cancel editor margins" setting on (src/lib/cancel-editor-margins, which puts
        // its class on <body>) the column's padding and the panel borders are gone, so there is no
        // edge left to keep clear -- the strip overhangs the divider by 3px instead of sitting
        // inside it.
        `html.${ROOT_CLASS}:not(.${COLUMN_LEFT_CLASS}) body.hm-cancel-editor-margins ` +
        `.${HANDLE_CLASS}{left:-3px;right:auto;}` +
        `html.${ROOT_CLASS}.${COLUMN_LEFT_CLASS} body.hm-cancel-editor-margins ` +
        `.${HANDLE_CLASS}{left:auto;right:-3px;}`;
    document.head.appendChild(style);
};

/**
 * The numbers the column is clamped against, all read from the live layout so they follow the
 * stage size setting, the window and a previous zoom.
 * @returns {{padding: number, stageWidth: number, stageHeight: number, outerWidth: number}|null}
 */
const getMetrics = () => {
    const column = getColumn();
    const stage = getStageBox();
    if (!column || !stage) return null;
    const styles = window.getComputedStyle(column);
    const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    // Straight from the inline style the Stage component writes: the rect would already include
    // this module's zoom (and any zoom an addon puts on the same element).
    let width = parseFloat(stage.style.width);
    let height = parseFloat(stage.style.height);
    if (!width || !height) {
        const wrapper = getStageWrapper();
        const zoom = (wrapper && parseFloat(window.getComputedStyle(wrapper).zoom)) || 1;
        const rect = stage.getBoundingClientRect();
        width = rect.width / zoom;
        height = rect.height / zoom;
    }
    if (!width) return null;
    // The border is written as `1px / zoom` (see the injected CSS), so how much room it takes in
    // layout depends on the zoom that is currently applied. Using the constant here would make the
    // computed zoom drift by a pixel at large scales.
    const wrapper = getStageWrapper();
    const appliedZoom = (wrapper && parseFloat(window.getComputedStyle(wrapper).zoom)) || 1;
    return {
        padding,
        stageWidth: width,
        stageHeight: height,
        outerWidth: width + (STAGE_BORDER / appliedZoom) * 2
    };
};

const getMinWidth = metrics => {
    if (!metrics) return 0;
    // Two floors, whichever is wider: the smallest stage the GUI offers, and whatever the stage
    // menu needs so its controls stay on the stage instead of hanging off it.
    const byStage = MIN_STAGE_WIDTH + STAGE_BORDER * 2;
    return Math.max(byStage, headerContentWidth) + metrics.padding;
};

/**
 * The widest the column may get. Two ceilings apply and the smaller one wins: the workspace has to
 * keep a usable width, and the stage has to stop growing before it pushes the target selector off
 * the bottom of the window.
 */
const getMaxWidth = metrics => {
    const column = getColumn();
    if (!column || !column.parentElement || !metrics) return 0;
    const byWidth = column.parentElement.getBoundingClientRect().width - MIN_EDITOR_WIDTH;
    const header = column.querySelector(HEADER_SELECTOR);
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const available = column.getBoundingClientRect().height - headerHeight - MIN_TARGET_HEIGHT;
    const maxZoom = metrics.stageHeight > 0 ? available / metrics.stageHeight : 1;
    const byHeight = metrics.outerWidth * maxZoom + metrics.padding;
    if (!Number.isFinite(byHeight)) return Math.max(0, byWidth);
    return Math.max(0, Math.min(byWidth, byHeight));
};

const clampWidth = requested => {
    const metrics = getMetrics();
    const min = getMinWidth(metrics);
    const max = getMaxWidth(metrics);
    if (max <= min) return min;
    return Math.max(min, Math.min(max, requested));
};

/**
 * Pin the stage menu to the stage's rendered width. The menu is an overlay outside the zoomed
 * element, so nothing makes it follow the stage by itself; writing its width here keeps the
 * controls on the stage's edges instead of on the column's (they differ by the column padding and
 * by whatever rounding the zoom introduces).
 * @param {number} [renderedWidth] the width the stage paints at, when it is already known
 */
const syncHeaderWidth = renderedWidth => {
    if (!inCharge) return;
    const column = getColumn();
    if (!column) return;
    const header = column.querySelector(HEADER_SELECTOR);
    if (!header) return;
    let width = renderedWidth;
    if (width == null) {
        const box = getStageBox();
        if (!box) return;
        width = box.getBoundingClientRect().width;
    }
    // Rounded: a fractional bar width puts every button inside it on a half pixel, and the browser
    // then rounds each icon's edges independently -- which shows up as an icon 1px off centre.
    width = Math.round(width);
    if (width) header.style.width = `${width}px`;
};

const clearHeaderWidth = () => {
    const column = getColumn();
    const header = column && column.querySelector(HEADER_SELECTOR);
    if (header) header.style.width = '';
};

/**
 * @param {number} zoom 1 is the stage's own size
 */
/**
 * Hand the stage wrapper back to whoever else zooms it (the editor-compact addon zooms it in small
 * stage mode, to fill the column from the stage's own size). Used whenever this module is not the
 * one choosing the width.
 */
const releaseZoom = () => {
    const wrapper = getStageWrapper();
    if (!wrapper) return;
    wrapper.style.zoom = '';
    wrapper.style.removeProperty('--hm-zoom');
    wrapper.style.removeProperty('--hm-zoom-inverse');
};

/**
 * Write the zoom, and the bar width that goes with it, from numbers that are already known.
 * @param {number} zoom 1 is the stage's own size
 * @param {number} [renderedWidth] the width the stage will paint at; measured back when omitted
 */
const stampZoom = (zoom, renderedWidth) => {
    const wrapper = getStageWrapper();
    if (!wrapper) return;
    // Not in charge (feature off, stage hidden, full screen) -> leave the wrapper exactly as
    // found, which also hands the stage back to any addon that zooms it.
    if (!inCharge || isFullScreen()) {
        releaseZoom();
        return;
    }
    // While in charge the zoom is written even when it is 1: the editor-compact addon zooms this
    // same element by ~1.0455 in small stage mode to *approximate* filling the column from the
    // stage's own size, and that approximation overshoots the column by a few pixels once the
    // width here is exact. Writing 1 replaces it with the measured value instead of letting the
    // two fight whenever a drag crosses the addon's small-stage threshold.
    const value = zoom || 1;
    wrapper.style.zoom = String(value);
    wrapper.style.setProperty('--hm-zoom', String(value));
    // The complement, for the one overlay that is meant to stay its own size: the ask prompt is
    // counter-zoomed so that widening the stage widens it without making it taller (see the
    // injected CSS).
    wrapper.style.setProperty('--hm-zoom-inverse', String(1 / value));
    // At 1:1 this still matters: the bar's own width comes from `width: auto` plus an inline
    // min-width, and releasing that min-width (see the injected CSS) would let it shrink to the
    // width of its contents -- a strip in the middle of the stage, with the controls bunched into
    // it. Writing the stage's width keeps the bar on the stage in every state.
    syncHeaderWidth(renderedWidth);
};

// The zoom is derived from the width the column actually rendered at, never from the one asked
// for: a flex item is floored by its contents (`min-width: auto`), and a window that is too narrow
// hands out less than the drag requested. Reading it back keeps the stage in step with the column
// instead of shrinking on its own while everything around it stands still.
let zoomFrame = 0;

const scheduleZoomSync = () => {
    if (zoomFrame) return;
    zoomFrame = window.requestAnimationFrame(() => {
        zoomFrame = 0;
        if (!inCharge) return;
        const column = getColumn();
        const metrics = getMetrics();
        if (!column || !metrics || !metrics.outerWidth) return;
        const content = column.getBoundingClientRect().width - metrics.padding;
        stampZoom(content / metrics.outerWidth);
    });
};

// The stage menu is an absolutely positioned overlay whose contents (green flag, stop, debugger,
// stage-size buttons...) have fixed sizes, so the column cannot usefully go below what they need --
// otherwise the controls are simply pushed out past the stage's edge. Asking the bar's row for its
// max-content width answers that directly: one style write, one read, put back before paint. It is
// measured once per gesture/pass rather than per frame, because it forces a layout.
const HEADER_ROW_SELECTOR = '[class*="stage-header_stage-menu-wrapper_"]';
let headerContentWidth = 0;

const measureHeaderContent = () => {
    const column = getColumn();
    const header = column && column.querySelector(HEADER_SELECTOR);
    const row = header && header.querySelector(HEADER_ROW_SELECTOR);
    if (!row) return;
    const previous = row.style.width;
    row.style.width = 'max-content';
    const width = Math.ceil(row.getBoundingClientRect().width);
    row.style.width = previous;
    if (width) headerContentWidth = width;
};

/**
 * The stage size mode the editor is in, read from the store the addons read it from.
 * @returns {string|null} "small", "large" or "full"; null before the store exists
 */
const getStageMode = () => {
    const store = AddonHooks.appStateStore;
    if (!store) return null;
    const state = store.getState();
    const stageSize = state && state.scratchGui && state.scratchGui.stageSize;
    return stageSize ? stageSize.stageSize : null;
};

// Set while a stage-size mode change (small <-> large) was triggered by this module itself, because
// the drag crossed a size boundary. The next refresh then knows the column width being dragged is
// intentional and must be kept, instead of being dropped as a width chosen against the old size.
// A boolean rather than a timestamp window: the window we had before silently reverted the stage on
// release whenever the gesture outlasted it (a slow drag across the small/large boundary), which is
// exactly the "drag wider than the default, release, and it snaps back" report.
let selfSwitchedMode = false;

/**
 * The project's own stage width, which is what the "full" size renders at 1:1. It is only a size
 * of its own when the project's stage is wider than the fixed "large" one (480); otherwise the
 * editor offers "small" and "full" with nothing in between.
 * @returns {number} width in px
 */
const getCustomStageWidth = () => {
    const store = AddonHooks.appStateStore;
    const state = store && store.getState();
    const size = state && state.scratchGui && state.scratchGui.customStageSize;
    return (size && size.width) || STAGE_LARGE_WIDTH - (STAGE_BORDER * 2);
};

/** @returns {boolean} whether the editor offers the fixed 480px "large" size at all */
const hasFixedLargeSize = () =>
    getCustomStageWidth() * STAGE_DISPLAY_SCALE_METADATA[STAGE_DISPLAY_SIZES.constrained].scale >
    STAGE_LARGE_WIDTH - (STAGE_BORDER * 2);

/**
 * The width a stage size is drawn at when the column does not scale it at all (1:1, border out).
 * @param {string} mode stage size mode
 * @returns {number} width in px
 */
const getNaturalWidth = mode => {
    if (mode === STAGE_SIZE_MODES.small) return STAGE_SMALL_WIDTH;
    if (mode === STAGE_SIZE_MODES.full) return getCustomStageWidth() + (STAGE_BORDER * 2);
    return STAGE_LARGE_WIDTH;
};

/**
 * Which stage size a given stage width belongs to.
 *
 * The stage fills the column at any width, so the size setting decides two things: the resolution
 * the stage is drawn at and how its own menu is laid out. What the drag changes is the column, and
 * the zoom that keeps the stage filling it is `width / naturalWidth`. That zoom is what the label
 * has to follow: as soon as the current size would be shrunk below 1:1 (zoom < 1) the smaller size
 * is the honest one, and the bigger size takes over again the moment it fits at 1:1 or above.
 * The boundary used to sit at the far end of the range instead, so a stage shrunk to half size
 * still called itself "large" until the column hit its floor.
 * @param {number} stageWidth the stage's own width in the column, border excluded
 * @param {?string} current the size in effect, for the dead band around the boundary
 * @returns {string} the stage size that width belongs to
 */
const stageBracket = (stageWidth, current) => {
    const large = STAGE_LARGE_WIDTH - (STAGE_BORDER * 2);
    let plain;
    if (stageWidth < large) plain = STAGE_SIZE_MODES.small;
    else if (!hasFixedLargeSize()) plain = STAGE_SIZE_MODES.full;
    else plain = stageWidth >= getCustomStageWidth() ? STAGE_SIZE_MODES.full : STAGE_SIZE_MODES.large;
    if (!current || current === plain) return plain;
    // Only take the switch once the pointer is clearly past this size's 1:1 width, so a pointer
    // resting on it does not flip the two layouts back and forth.
    const boundary = getNaturalWidth(current) - (STAGE_BORDER * 2);
    if (Math.abs(stageWidth - boundary) <= STAGE_SWITCH_SLACK) return current;
    return plain;
};

/**
 * Follow the drag with the stage size setting.
 *
 * The size picked is the one the stage's current width is drawn at, so the stage is never more
 * than a fraction off 1:1 -- including "full", which is the project's own stage width and therefore
 * the size a wide project reaches when the column is dragged past 480px. The caller only calls
 * this when the pointer crosses a boundary (see onHandleMouseMove), and compares the width the drag
 * is *asking* for rather than the one the column ended up at: the column has a floor of its own
 * (the stage menu's controls), and dragging below that floor is still the intent to go smaller.
 * @param {string} mode the stage size to switch to
 */
const switchStageMode = mode => {
    const store = AddonHooks.appStateStore;
    if (!store || getStageMode() === mode) return;
    selfSwitchedMode = true;
    store.dispatch(setStageSize(mode));
};

/**
 * Take the drag's numbers again from the live layout.
 *
 * Measuring them once at mousedown is what made a drag overshoot its bound and then snap back on
 * release: the gesture changes exactly the numbers the ceilings are made of. The height ceiling is
 * `column height - header height - room for the target selector`, and the header is pinned to the
 * stage's rendered width -- so narrowing the stage makes its controls wrap onto a second row, the
 * header gets taller, and the ceiling the drag started with is now too generous. A stage size
 * switch does the same thing by changing the stage's own width. Only the release pass re-measured,
 * which is why the column came back on mouseup but could be pushed past the real limit while the
 * button was down.
 */
const resyncDragBounds = () => {
    if (!dragState) return;
    measureHeaderContent();
    const metrics = getMetrics();
    if (!metrics) return;
    dragState.min = getMinWidth(metrics);
    dragState.max = getMaxWidth(metrics);
    // Also used as the column's own `min-width`, so the CSS floor and the clamp agree.
    dragState.minWidth = dragState.min;
    dragState.padding = metrics.padding;
    dragState.outerWidth = metrics.outerWidth;
};

const clampDragWidth = wanted => {
    if (!dragState) return wanted;
    return Math.max(dragState.min, Math.min(dragState.max, wanted));
};

// How often a drag that is pressed against a limit may re-measure. Measuring forces a layout, and
// the pointer can sit on the limit for hundreds of moves.
const RESYNC_INTERVAL_MS = 120;
let dragResyncFrame = 0;

/**
 * Re-measure once the browser has laid out whatever the drag just changed (a stage size switch
 * lands in the next frame), then put the column back on the corrected bounds.
 */
const scheduleDragResync = () => {
    if (dragResyncFrame) return;
    dragResyncFrame = window.requestAnimationFrame(() => {
        dragResyncFrame = 0;
        if (!dragState) return;
        resyncDragBounds();
        const width = clampDragWidth(customWidth == null ? dragState.startWidth : customWidth);
        customWidth = width;
        applyLayout(width);
    });
};

/**
 * Give the column the width the drag asked for.
 * @param {number} width column width in pixels
 */const applyLayout = width => {
    const column = getColumn();
    if (!column) return;
    // Read before writing: measuring after the flex-basis lands forces a reflow of the whole row.
    const metrics = dragState ? null : getMetrics();
    column.style.flexBasis = `${width}px`;
    // Keep the browser from flooring the column at something smaller than its contents need: the
    // stage menu is an absolutely positioned overlay, so nothing else stops it spilling out.
    if (dragState) {
        // Mid-gesture every number is already known (see onHandleMouseDown): the stage fills the
        // column exactly, so it paints at the column width minus the padding, and the zoom that
        // gets it there is that over the stage's own width. Writing both straight out keeps the
        // pointer path free of layout reads, which is what made long drags feel heavy.
        column.style.minWidth = `${dragState.minWidth}px`;
        const rendered = width - dragState.padding;
        stampZoom(rendered / dragState.outerWidth, rendered);
    } else if (metrics) {
        column.style.minWidth = `${getMinWidth(metrics)}px`;
        scheduleZoomSync();
    }
    scheduleWorkspaceResize();
    scheduleBackgroundLayout();
};

const clearLayout = () => {
    const column = getColumn();
    if (column) {
        column.style.flexBasis = '';
        column.style.minWidth = '';
    }
    // At the natural width nothing here is choosing the stage's size -- it is the column's own
    // content -- so the zoom is handed back rather than pinned at 1. In the compact editor's small
    // stage mode that is what lets its own zoom fill the few extra pixels the stage selector adds
    // to the column; pinning 1 there left the stage 11px short of the column.
    releaseZoom();
    syncHeaderWidth();
    scheduleWorkspaceResize();
    scheduleBackgroundLayout();
};

const applyWidth = requested => {
    customWidth = requested;
    if (requested == null) {
        clearLayout();
        return;
    }
    applyLayout(clampWidth(requested));
};

const onHandleMouseDown = e => {
    if (e.button !== 0 || !inCharge) return;
    const column = getColumn();
    if (!column) return;
    // Mouse only: on touch a preventDefault here would also swallow the compatibility mouse events
    // the double-tap reset is built on, and `touch-action: none` already stops the page from
    // scrolling or zooming under the drag.
    if (e.pointerType !== 'touch') e.preventDefault();
    e.stopPropagation();
    // Neither bound can move while the pointer is down, and both need layout reads, so they are
    // taken once per gesture rather than once per frame. The bar's contents are measured here too:
    // a drag can be the first thing that happens after the editor opened.
    measureHeaderContent();
    const metrics = getMetrics();
    dragState = {
        startX: e.clientX,
        startWidth: column.getBoundingClientRect().width,
        // The strip is on the divider, so dragging towards the outside of the editor grows the
        // column. Which way that is depends on the side the column sits on.
        onLeft: isColumnOnLeft(),
        min: getMinWidth(metrics),
        max: getMaxWidth(metrics),
        // Everything the drag needs to write the layout without reading it back per frame.
        padding: metrics ? metrics.padding : 0,
        outerWidth: metrics ? metrics.outerWidth : 0,
        minWidth: getMinWidth(metrics),
        // Which stage size bracket the pointer was in, so the store is only asked about it when the
        // pointer crosses a boundary instead of on every move.
        bracket: null,
        // When the bounds above were last re-taken (see RESYNC_INTERVAL_MS).
        resyncedAt: performance.now(),
        // `touch` while the gesture is a finger, so the release can drop the hover state: touch
        // screens keep `:hover` latched on the element they were tapped on, which would leave the
        // workspace scrollbar faded out until something else is tapped.
        pointerType: e.pointerType
    };
    if (handle) handle.classList.add(DRAGGING_CLASS);
    document.body.style.cursor = 'ew-resize';
    // Pointer events rather than mouse ones: the same handlers then serve a finger, a pen and a
    // mouse, and a touch drag keeps sending moves after the finger leaves the strip (the browser
    // implicitly captures the touch pointer to the element it started on).
    document.addEventListener('pointermove', onHandleMouseMove, false);
    document.addEventListener('pointerup', onHandleMouseUp, false);
    // The browser taking the gesture away (a scroll won the race, the finger was cancelled).
    document.addEventListener('pointercancel', onHandleMouseUp, false);
    // Safety net: a drag can end without a pointerup (window blur, handle removed mid-drag).
    window.addEventListener('blur', onHandleMouseUp, false);
};

const onHandleMouseMove = e => {
    if (!dragState) return;
    // A release outside the window never reaches us; the button mask on the next move is a
    // dependable "the drag is over" signal (touch reports 1 while the finger is down, 0 after).
    if (typeof e.buttons === 'number' && (e.buttons & 1) === 0) {
        onHandleMouseUp();
        return;
    }
    const delta = e.clientX - dragState.startX;
    const wanted = dragState.startWidth + (dragState.onLeft ? delta : -delta);
    let clamped = clampDragWidth(wanted);
    // Pressed against a limit: the numbers taken at mousedown may no longer be true (see
    // resyncDragBounds), so take them again before believing that this is as far as it goes.
    if (clamped !== wanted &&
        performance.now() - dragState.resyncedAt > RESYNC_INTERVAL_MS) {
        dragState.resyncedAt = performance.now();
        resyncDragBounds();
        clamped = clampDragWidth(wanted);
    }
    customWidth = clamped;
    applyLayout(clamped);
    // In column-width terms the request is `wanted`, but the stage size setting counts the stage's
    // own width, which is the column minus the padding it holds the stage in. Only a move that
    // crosses a boundary asks the store anything.
    const stageWidth = wanted - dragState.padding;
    const bracket = stageBracket(stageWidth, dragState.bracket || getStageMode());
    if (bracket !== dragState.bracket) {
        dragState.bracket = bracket;
        switchStageMode(bracket);
        // The stage's own width just changed with the mode, and the zoom is derived from it: the
        // drag caches that width at mousedown, so without this the rest of the gesture would scale
        // the *new*, differently sized stage by the *old* stage's factor -- half size, or double,
        // until the release re-measured. The sizes are exactly the ones the boundaries above are
        // made of, so no measuring is needed here either.
        dragState.outerWidth = getNaturalWidth(bracket);
        applyLayout(clamped);
        // And reconcile against the real box next frame: the constants are the sizes at 1:1, while
        // the border the stage draws is divided by the current zoom -- and the switch also moves the
        // ceilings, since it changes both the stage's own width and how tall its menu has to be.
        scheduleDragResync();
    }
    scheduleWindowResize();
};

const onHandleMouseUp = () => {
    const wasDragging = !!dragState;
    const wasTouch = !!dragState && dragState.pointerType === 'touch';
    if (dragState) dragState = null;
    if (dragResyncFrame) {
        cancelAnimationFrame(dragResyncFrame);
        dragResyncFrame = 0;
    }
    if (handle) handle.classList.remove(DRAGGING_CLASS);
    if (document.body) document.body.style.cursor = '';
    document.removeEventListener('pointermove', onHandleMouseMove, false);
    document.removeEventListener('pointerup', onHandleMouseUp, false);
    document.removeEventListener('pointercancel', onHandleMouseUp, false);
    window.removeEventListener('blur', onHandleMouseUp, false);
    // One last pass on release, so everything that waits for the event is right even if the drag
    // was short enough that the throttled one never fired.
    if (wasDragging) dispatchWindowResize();
    if (wasDragging && handle && (wasTouch || !handle.matches(':hover'))) {
        document.documentElement.classList.remove(HOVER_CLASS);
    }
};

const onHandleMouseEnter = () => {
    document.documentElement.classList.add(HOVER_CLASS);
};

const onHandleMouseLeave = () => {
    // Keep it while dragging: the pointer can slip off the 8px strip mid-gesture without the
    // gesture ending.
    if (!dragState) document.documentElement.classList.remove(HOVER_CLASS);
};

const onHandleDoubleClick = e => {
    e.preventDefault();
    e.stopPropagation();
    applyWidth(null);
};

// Two other features own the stage column at times, and both have to win over this one:
//   - the stage size toggle (small / large / custom) changes the stage's own width, so a column
//     width picked for one size means nothing for the next one;
//   - the hide-stage addon takes the stage out of the layout entirely (the canvas becomes
//     position: absolute and the target selector is hidden), so the column is *supposed* to
//     collapse -- a min-width held by this module would keep it open, and the header, stretched by
//     the rule above, would hang off the end of the collapsed column.
//   - full screen paints its own stage sized by the window, so neither the column nor the zoom
//     applies there.
// Suspending drops the root class as well as the inline styles, so none of the injected rules
// apply until the stage comes back.
const isStageHidden = () => {
    const area = getStageArea();
    if (!area) return true;
    const styles = window.getComputedStyle(area);
    return styles.visibility === 'hidden' || styles.display === 'none';
};

const suspend = () => {
    onHandleMouseUp();
    inCharge = false;
    selfSwitchedMode = false;
    document.documentElement.classList.remove(ROOT_CLASS);
    const column = getColumn();
    if (column) {
        column.style.flexBasis = '';
        column.style.minWidth = '';
    }
    clearHeaderWidth();
    releaseZoom();
    if (handle) handle.style.display = 'none';
    scheduleWorkspaceResize();
    scheduleBackgroundLayout();
};

const resume = () => {
    inCharge = true;
    syncSide();
    document.documentElement.classList.add(ROOT_CLASS);
    if (handle) handle.style.display = '';
};

const mount = () => {
    const column = getColumn();
    if (!column) return false;
    if (handle && handle.isConnected) {
        // Still there: React re-rendered the column but did not touch our trailing child.
        return true;
    }
    handle = document.createElement('div');
    handle.className = HANDLE_CLASS;
    handle.addEventListener('pointerdown', onHandleMouseDown);
    handle.addEventListener('dblclick', onHandleDoubleClick);
    handle.addEventListener('mouseenter', onHandleMouseEnter);
    handle.addEventListener('mouseleave', onHandleMouseLeave);
    column.appendChild(handle);
    return true;
};

const unmount = () => {
    onHandleMouseUp();
    inCharge = false;
    document.documentElement.classList.remove(ROOT_CLASS);
    document.documentElement.classList.remove(COLUMN_LEFT_CLASS);
    document.documentElement.classList.remove(HOVER_CLASS);
    document.documentElement.classList.remove(ENABLED_CLASS);
    if (handle) {
        handle.remove();
        handle = null;
    }
    clearLayout();
    customWidth = null;
    lastStageWidth = null;
    selfSwitchedMode = false;
    unobserveStage();
};

// Full screen is a class flip on the stage pane, with no window resize behind it, so the change has
// to be watched directly. Only the pane's own class attribute is observed, and a pass is only taken
// when the full-screen state actually differs from the last one.
let classObserver = null;
let observedStage = null;
let lastFullScreen = false;

const unobserveStage = () => {
    if (classObserver) {
        classObserver.disconnect();
        classObserver = null;
    }
    observedStage = null;
};

const observeStage = () => {
    const stage = getStageOuter();
    if (!stage || stage === observedStage) return;
    unobserveStage();
    observedStage = stage;
    classObserver = new MutationObserver(() => {
        const now = isFullScreen();
        if (now === lastFullScreen) return;
        lastFullScreen = now;
        refresh();
    });
    classObserver.observe(stage, {attributes: true, attributeFilter: ['class']});
};

// Two sizes matter while this module is in charge, and both can change without a window resize:
//   - the stage box, which the bar's width is derived from -- if the bar only catches up a frame
//     later, the controls are painted once at the old width and then jump, which reads as a flicker
//     every time the stage size is toggled;
//   - the workspace container, whose height the backpack's open/close animation changes on every
//     frame -- Blockly only re-measures when asked, so without this the workspace snaps at the end.
// A resize observer fires after layout and before paint, which is exactly the window needed to
// correct both without a visible intermediate state.
let sizeObserver = null;
let watchedWorkspace = null;
let watchedInjection = null;
let watchedStage = null;

const handleSizeChanges = entries => {
    for (const entry of entries) {
        if (entry.target === watchedStage) {
            // The bar's width is this module's business only while it is the one choosing the
            // stage's size.
            if (active && inCharge) syncHeaderWidth();
        } else {
            // The workspace changed size on its own -- the backpack's open/close animation is the
            // main one. Blockly has to be told, frame by frame, or the workspace jumps once the
            // animation ends. This runs whether or not the stage column feature is on.
            scheduleWorkspaceResize();
            scheduleBackgroundLayout();
        }
    }
};

const observeSizes = () => {
    const workspace = document.querySelector(WORKSPACE_SELECTOR);
    const injection = document.querySelector(INJECTION_SELECTOR);
    const stage = getStageBox();
    if (workspace === watchedWorkspace && injection === watchedInjection && stage === watchedStage) return;
    if (!sizeObserver) sizeObserver = new ResizeObserver(handleSizeChanges);
    sizeObserver.disconnect();
    watchedWorkspace = workspace;
    watchedInjection = injection;
    watchedStage = stage;
    if (workspace) sizeObserver.observe(workspace);
    if (injection) sizeObserver.observe(injection);
    if (stage) sizeObserver.observe(stage);
};

const unobserveSizes = () => {
    if (sizeObserver) sizeObserver.disconnect();
    watchedWorkspace = null;
    watchedInjection = null;
    watchedStage = null;
};

// The GUI is not laid out yet when the settings are first applied, so keep asking for a few frames.
const tryMount = () => {
    if (!active) return;
    // Nothing to mount in the play view -- it renders no column at all, so the retries below would
    // just spin for ten seconds.
    if (isPlayerMode()) {
        suspend();
        return;
    }
    if (mount()) {
        waitFrames = 0;
        refresh();
        return;
    }
    if (++waitFrames > MAX_WAIT_FRAMES) return;
    window.requestAnimationFrame(tryMount);
};

/**
 * Bring everything back in line with the layout as it is right now. Runs on every window resize,
 * which is also the signal both the stage size toggle and the hide-stage addon send.
 */
// Switching editor <-> project page is a redux dispatch on the same document, so no resize event
// and no attribute change announces it: without this the module keeps its styles applied through
// the play view and the next pass only happens when something else happens to ask for one.
let unsubscribeMode = null;

const watchMode = () => {
    if (unsubscribeMode) return;
    const store = AddonHooks.appStateStore;
    if (!store) return;
    let wasPlayer = isPlayerMode();
    unsubscribeMode = store.subscribe(() => {
        const isPlayer = isPlayerMode();
        if (isPlayer === wasPlayer) return;
        wasPlayer = isPlayer;
        refresh();
    });
};

const refresh = () => {
    if (!active) return;
    // The redux store may not exist yet when the setting is first applied; binding here as well
    // means the mode watcher is in place as soon as the editor is.
    watchMode();
    // Checked before the handle: the play view does not render the column at all, so waiting for a
    // handle there would just spin the mount retries while the leftover styles are still applied.
    if (isPlayerMode()) {
        suspend();
        return;
    }
    if (!handle || !handle.isConnected) {
        waitFrames = 0;
        tryMount();
        return;
    }
    observeStage();
    observeSizes();
    if (isFullScreen() || isStageHidden()) {
        suspend();
        return;
    }
    resume();
    // Mid-drag the column is already exactly where the pointer put it, and re-clamping it here
    // would both fight the pointer and force another reflow: the passes this module sends itself
    // during a gesture come through here, so this is the common case, not a corner one.
    if (!dragState) measureHeaderContent();
    const metrics = getMetrics();
    if (metrics) {
        const stageSizeChanged = lastStageWidth != null &&
            Math.abs(metrics.stageWidth - lastStageWidth) > 1;
        if (stageSizeChanged) {
            if (selfSwitchedMode) {
                // This module asked for the new size itself as the drag crossed a size boundary
                // (see switchStageMode): the column width is still the one being dragged, so it
                // stays. The flag is cleared so a later, external size change still drops it.
                selfSwitchedMode = false;
            } else {
                // An external change (the size toggle, or a remount into another size) means a width
                // chosen against the old size no longer fits -- let the column go back to natural.
                customWidth = null;
            }
        }
        lastStageWidth = metrics.stageWidth;
    }
    if (!dragState) applyWidth(customWidth);
};

const applySetting = isActive => {
    if (typeof document === 'undefined') return;
    active = isActive;
    injectStyle();
    document.documentElement.classList.toggle(ENABLED_CLASS, !!isActive);
    if (isActive) {
        // A window that shrinks after a drag has to pull the column back inside its new ceiling,
        // and the same pass repairs the handle if the GUI was remounted underneath it.
        if (!onWindowResize) {
            onWindowResize = refresh;
            window.addEventListener('resize', onWindowResize);
        }
        lastFullScreen = isFullScreen();
        waitFrames = 0;
        watchMode();
        tryMount();
    } else {
        if (onWindowResize) {
            window.removeEventListener('resize', onWindowResize);
            onWindowResize = null;
        }
        if (unsubscribeMode) {
            unsubscribeMode();
            unsubscribeMode = null;
        }
        unobserveStage();
        document.documentElement.classList.remove(COLUMN_LEFT_CLASS);
        unmount();
    }
};

/**
 * Applies the saved value and keeps it in sync from then on.
 * Safe to call once, when the editor interface comes up.
 */
const initResizeStage = () => {
    if (typeof window === 'undefined') return;
    // Bound for the life of the page, not per setting: the workspace must keep following its own
    // size changes (backpack animation, window resize) even with the stage column feature off.
    observeSizes();
    window.addEventListener('resize', () => {
        observeSizes();
        scheduleWorkspaceResize();
    });
    applySetting(!!getSetting(SETTING_STAGE_COLUMN_RESIZE));
    onSettingsChange((key, value) => {
        if (key === SETTING_STAGE_COLUMN_RESIZE) {
            applySetting(!!value);
        }
    });
};

export {initResizeStage};
