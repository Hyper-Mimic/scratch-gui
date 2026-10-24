import {
    getSetting,
    onSettingsChange,
    SETTING_BLOCK_PALETTE_RESIZE,
    BLOCK_PALETTE_RESIZE_ON
} from '../hypermimic-settings.js';
import LazyScratchBlocks from '../tw-lazy-scratch-blocks.js';

// "Allow changing block palette width" (HyperMimic setting `blockPaletteResize === 'resize'`),
// one of the two settings the old single `blockPaletteStyle` select split into.
//
// Ported from AstraEditor/scratch-blocks' flyout resize handle, but applied at runtime
// (monkey-patching Blockly.Flyout) instead of compiled into scratch-blocks, so it stays in
// the scratch-gui tree like the sibling `unclip-palette` feature and needs no rebuild.
//
// When active, a transparent draggable strip is placed along the flyout's inner edge. Dragging
// it writes a new width through Blockly's own position()/reflow()/targetWorkspace.resize() path,
// so the main workspace shrinks to match (workspace_svg.js subtracts flyout_.width_ in getMetrics).
//
// The ceiling on that width is NOT a constant. The workspace's left boundary and its visible width
// are both derived from the toolbox width (getTopLevelWorkspaceMetrics_: absoluteLeft =
// toolboxDimensions.width, viewWidth = svgSize.width - toolboxDimensions.width), so a flat ceiling
// can be wider than the whole block area on a smaller window -- dragging that far then left the
// workspace with nothing to scroll or drop a block into. getMaxWidth() derives the ceiling from the
// live block area instead, and is consulted on every read so it also follows the window, the stage
// size and the `columns` setting with nobody having to notify it.
//
// PERF: the layout chain runs once per animation frame for the whole drag, and out of the box it
// re-derives the main workspace's and the flyout's content bounding boxes 4-6 times per pass.
// getBlocksBoundingBox() is O(#top blocks) for the workspace and O(#palette blocks) for the
// flyout, so on a large project the drag stutters badly. Nothing inside either workspace moves
// while the divider is dragged, so those bounds are constant for the duration:
// beginMeasurementFreeze() computes them once and every later call is served from `bboxCache`;
// the intersection check and the delete-area caching are skipped as well and run once, for real,
// at drag end.

const RESIZE_HANDLE_WIDTH = 6;
const MIN_WIDTH = 30;
// Absolute ceiling, so a very wide window cannot end up with a palette the size of the screen.
// It is no longer the *only* limit -- see MIN_WORKSPACE_WIDTH and getMaxWidth().
const MAX_WIDTH = 800;
// How much of the block area has to stay usable as workspace, whatever the window looks like.
// Bump this to keep more canvas at hand at the cost of how wide the palette can go.
const MIN_WORKSPACE_WIDTH = 200;
const STYLE_ID = 'hm-resize-palette';
const MAX_WAIT_FRAMES = 600; // ~10s; give up retrying if Blockly never loads

// The flyout's scrollbar is laid out flush against the palette's right edge, which is exactly
// where the resize handle's drag strip sits. The strip is drawn on top of the scrollbar and has
// pointer-events: all, so it swallows the scrollbar's rightmost few pixels and makes the
// scrollbar hard to grab. Nudging the scrollbar left by the width of the strip clears the two.
// (Measured: scrollbar [right-14.5, right-3.5], strip [right-7, right-1] -- 3.5px of overlap.)
const SCROLLBAR_SHIFT = RESIZE_HANDLE_WIDTH;
// The class the injected CSS keys off. It is only on <html> while the feature is enabled, so the
// shift does not touch the stock palette.
const ROOT_CLASS = 'hm-resize-palette';

let patched = false;
let resizeActive = false;
let savedWidth = null; // restored onto a recreated flyout
let waitFrames = 0;
// The flyout width the blocks were last laid out for (see anchorFlyoutContent).
let contentAnchorWidth = null;

// Drag-time measurement freeze. `measuringFrozen` is the cheap global check, while
// `frozenWorkspaces` narrows the effect to the two workspaces that take part in the drag (the
// main workspace and the flyout's own workspace) so mutators and other workspaces keep
// measuring normally. Both are reassigned per drag so no stale entries survive.
let measuringFrozen = false;
let frozenWorkspaces = new WeakSet();
let bboxCache = new WeakMap();

// scratch-blocks is lazy-loaded; the canonical namespace accessor in this fork is
// LazyScratchBlocks.get() (see src/lib/backpack/block-to-image.js). The closure-compiled
// global `window.Blockly` only carries a handful of exported symbols and may be absent
// here entirely, so always prefer the full module namespace it returns.
const getBlockly = () => {
    if (LazyScratchBlocks.isLoaded()) {
        try {
            return LazyScratchBlocks.get();
        } catch (e) {
            // not ready yet; fall through
        }
    }
    if (typeof window !== 'undefined' && window.Blockly) {
        return window.Blockly;
    }
    return null;
};

// Snapshot the (constant) content bounds of the workspaces involved in the drag so the layout
// chain can reuse them instead of walking every block again and again.
function beginMeasurementFreeze(flyout) {
    if (measuringFrozen) return;
    measuringFrozen = true;
    frozenWorkspaces = new WeakSet();
    bboxCache = new WeakMap();
    if (flyout.workspace_) frozenWorkspaces.add(flyout.workspace_); // flyout content bounds
    if (flyout.targetWorkspace_) frozenWorkspaces.add(flyout.targetWorkspace_); // workspace bounds
}

// Drop the freeze. Must run *before* the drag is committed, so the commit performs a full,
// genuine layout (bounding boxes, intersection check, cached delete areas) exactly once.
function endMeasurementFreeze() {
    if (!measuringFrozen) return;
    measuringFrozen = false;
    frozenWorkspaces = new WeakSet();
    bboxCache = new WeakMap();
}

// Drag-state broadcast for the GUI layer. Every frame of the drag runs
// WorkspaceSvg.resize(), whose two scrollbars each end up in
// setTopLevelWorkspaceMetrics_ -> translate(). blocks.jsx hangs a listener on `translate` that
// dispatches `updateMetrics`, and both TargetPane and every StageSelector subscribe to
// state.scratchGui.workspaceMetrics -- so an unguarded drag re-renders the whole sprite list
// twice per frame. Subscribers use this to stay quiet during the drag and flush once at the end.
const resizeStateListeners = new Set();
let resizeNotifyActive = false;

const onPaletteResizeChange = cb => {
    resizeStateListeners.add(cb);
    return () => resizeStateListeners.delete(cb); // returns the unsubscribe function
};

function notifyPaletteResize(active) {
    if (resizeNotifyActive === active) return; // idempotent
    resizeNotifyActive = active;
    resizeStateListeners.forEach(cb => cb(active));
}

function injectStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // Hidden at rest (opacity 0); fades in on hover or while dragging (opacity 1) over
    // 0.4s. The accent colour is constant via `fill`; the reveal is an opacity fade.
    // `var(--...)` only resolves in a CSS context, not as an SVG presentation attribute,
    // so the colour is set here via the class rather than on the rect element itself.
    // The dragging class keeps it visible even when the cursor leaves the narrow strip
    // mid-drag (`:hover` would drop), since the drag can move the pointer.
    style.textContent =
        '.blocklyFlyoutResizeHandle{transition:opacity 0.4s ease,background-color 0.4s ease;' +
        'fill:var(--looks-secondary);opacity:0;}' +
        '.blocklyFlyoutResizeHandle:hover{opacity:1;}' +
        '.blocklyFlyoutResizeHandle.hm-resize-dragging{opacity:1;}' +
        // Nudge the flyout's scrollbar clear of the drag strip (see SCROLLBAR_SHIFT). The CSS
        // `translate` property is applied *before* `transform`, so it composes with the
        // transform Blockly writes on the element instead of replacing it -- the scrollbar keeps
        // following the palette's width while sitting a little further to the left.
        // :not(.blocklyScrollbarHorizontal) keeps the horizontal flyout's bottom scrollbar put.
        'html.' + ROOT_CLASS +
        ' .blocklyFlyoutScrollbar:not(.blocklyScrollbarHorizontal){translate:' +
        (-SCROLLBAR_SHIFT) + 'px 0px;}' +
        // In RTL the flyout's scrollbar sits on the palette's LEFT edge -- Blockly puts it at
        // the view's absoluteLeft there -- and that is where the drag strip is too, so the
        // scrollbar has to move to the right instead of to the left.
        'html.' + ROOT_CLASS +
        ' [dir="rtl"] .blocklyFlyoutScrollbar:not(.blocklyScrollbarHorizontal){translate:' +
        SCROLLBAR_SHIFT + 'px 0px;}';
    document.head.appendChild(style);
}

/**
 * Turn the scrollbar shift on or off with the feature.
 * @param {boolean} active whether the palette can be resized
 */
function setScrollbarShift(active) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(ROOT_CLASS, active);
}

function placeResizeHandle(flyout) {
    const Blockly = getBlockly();
    if (!Blockly) return;

    if (!resizeActive) {
        if (flyout.resizeHandle_) {
            flyout.resizeHandle_.remove();
            flyout.resizeHandle_ = null;
        }
        return;
    }
    if (!flyout.svgGroup_) return;

    if (!flyout.resizeHandle_) {
        flyout.resizeHandle_ = Blockly.utils.createSvgElement('rect', {
            'class': 'blocklyFlyoutResizeHandle',
            'width': RESIZE_HANDLE_WIDTH,
            'height': '0',
            'style': 'cursor:ew-resize;pointer-events:all;'
        }, flyout.svgGroup_);
        const handler = (e) => flyout.onResizeHandleMouseDown_(e);
        // Capture phase only. Registering the same handler for capture *and* bubble made
        // mousedown run twice, which overwrote the stored wrappers so the first set of document
        // listeners could never be removed -- every drag leaked a mousemove/mouseup pair. The
        // handler itself already calls stopPropagation(), so one capture-phase listener suffices.
        flyout.resizeHandle_.addEventListener('mousedown', handler, true);
        // Double-click resets the palette back to its default width.
        const dblHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            flyout.setWidth(flyout.DEFAULT_WIDTH || 250);
        };
        flyout.resizeHandle_.addEventListener('dblclick', dblHandler, true);
    }

    flyout.resizeHandle_.setAttribute('height', flyout.height_);
    const atRight = flyout.toolboxPosition_ === Blockly.TOOLBOX_AT_RIGHT;
    const handleX = atRight ? 0 : (flyout.width_ - RESIZE_HANDLE_WIDTH);
    flyout.resizeHandle_.setAttribute('x', handleX);
    flyout.resizeHandle_.setAttribute('y', 0);
}

// The compiled VerticalFlyout.position computes the flyout's left offset as
//   b = parentToolbox_.getWidth() - this.width_
// When the flyout is resized (this.width_ changes), b shifts, so the whole flyout
// slides left over the category column while its right edge stays pinned to the
// toolbox boundary -- the resize handle no longer follows the cursor.
//
// AstraEditor's fix is to keep the left edge anchored. The cleanest way that also
// keeps the main workspace in sync is to make the toolbox report its natural width
// PLUS the resize delta. Then position()'s own math yields a constant left edge
// (baseWidth = originalToolboxWidth - DEFAULT_WIDTH), and the workspace's left
// boundary (which is derived from the same toolbox width) shifts right by the same
// delta, so the flyout's right edge stays exactly flush with the workspace. No
// overlap, no displacement, and the handle tracks the cursor.
function ensureToolboxWidthOverride(flyout) {
    const tb = flyout.parentToolbox_;
    if (!tb || tb._hmWidthWrapped) return;
    tb._hmWidthWrapped = true;
    // Capture the toolbox's natural width (category column + flyout) the
    // first time we see it, before any resize delta is applied.
    tb._hmOriginalToolboxWidth = tb.getWidth();
    // ...and the part of it that is *not* the flyout. The delta has to be measured from the
    // flyout's own natural width rather than from Flyout.DEFAULT_WIDTH: an addon may stretch the
    // flyout across the whole toolbox (`columns` does, which leaves no separate category column at
    // all -- its userstyle publishes that as --sa-category-width: 0), and then the palette has to
    // grow by exactly as much as the flyout does. Measuring from the 250 default instead would add
    // a phantom 60px to the width on the first drag, because the drag baseline
    // (Flyout.onResizeHandleMouseDown_ reads the flyout's own getWidth) is the stretched 310.
    //
    // The split cannot be captured once and kept: whichever of the two features initializes second
    // invalidates it. While nothing is resized the flyout still reports its natural width, so it is
    // re-derived on any such read instead -- including the one that happens after the addon
    // finishes patching, which is what makes the result independent of load order.
    tb._hmCategoryWidth = null;
    tb.getWidth = function() {
        if (flyout.currentWidth_ == null) {
            tb._hmCategoryWidth = tb._hmOriginalToolboxWidth - flyout.getWidth();
            return tb._hmOriginalToolboxWidth;
        }
        if (tb._hmCategoryWidth == null) {
            tb._hmCategoryWidth = tb._hmOriginalToolboxWidth - (flyout.DEFAULT_WIDTH || 250);
        }
        // Must be the *same* number the flyout is laid out at (getWidth()): this sum is the
        // workspace's left boundary (metrics.absoluteLeft) and what its viewWidth is subtracted
        // from, so a toolbox reporting an unclamped width would push the boundary past the palette
        // and leave the workspace with less room than the two of them agreed on.
        if (!resizeActive) return tb._hmOriginalToolboxWidth;
        // getLayoutWidth cannot be null here: the branch at the top of this function has already
        // returned for the `currentWidth_ == null` case.
        return tb._hmCategoryWidth + getLayoutWidth(flyout);
    };
}

// Width of the whole block area -- palette (category column + flyout) and workspace together.
// This is the exact number the workspace's metrics are built from: Blockly.svgSize(parentSvg) is
// the injection div's size (see the comment in getTopLevelWorkspaceMetrics_), and the metrics
// subtract the toolbox width from it to get viewWidth. Deriving the ceiling from the same number
// means it cannot disagree with the layout it is protecting.
//
// Reading it is free: svgSize returns the svg's cachedWidth_, which Blockly refreshes in
// svgResize() from the injection div's offsetWidth -- so calling this from getWidth() adds no
// forced layout to the drag loop this file works so hard to keep cheap.
function getBlockAreaWidth(flyout) {
    const Blockly = getBlockly();
    const ws = flyout.targetWorkspace_;
    if (!Blockly || !ws || !ws.getParentSvg) return null;
    try {
        const size = Blockly.svgSize(ws.getParentSvg());
        if (size && size.width) return size.width;
    } catch (e) {
        // Unmeasurable (torn-down workspace, or svgSize missing from this build). The caller
        // falls back to the flat ceiling.
    }
    return null;
}

// The part of the toolbox that is not the flyout, i.e. the category column. The ceiling has to be
// measured against it because the toolbox reports category + flyout, and that sum is what the
// workspace's left boundary is. Read from the override in ensureToolboxWidthOverride() rather than
// derived from DEFAULT_WIDTH here: an addon may stretch the flyout across the whole toolbox
// (`columns` does, which leaves no separate category column at all -- 0px).
//
// When it has not been derived yet, derive it exactly the way that override's own fallback does
// and *store* it, so both readers of this number use one value: the flyout's laid-out width and the
// toolbox sum have to agree, or the workspace boundary stops lining up with the palette for that
// frame. Storing is safe because the override re-derives the field from scratch on every read that
// happens while nothing is resized.
function getCategoryWidth(flyout) {
    const tb = flyout.parentToolbox_;
    if (!tb) return 0;
    // isFinite, not typeof: a NaN here would poison the clamp below into NaN and the palette would
    // lose its width entirely.
    if (Number.isFinite(tb._hmCategoryWidth)) return tb._hmCategoryWidth;
    if (!Number.isFinite(tb._hmOriginalToolboxWidth)) return 0; // override not installed yet
    tb._hmCategoryWidth = Math.max(0, tb._hmOriginalToolboxWidth - (flyout.DEFAULT_WIDTH || 250));
    return tb._hmCategoryWidth;
}

// Widest the flyout is allowed to be right now: the block area's width, minus the rest of the
// toolbox, minus the workspace slice that must stay usable. Below MIN_WIDTH the clamp would fight
// the absolute minimum, so a block area too small to satisfy both keeps the palette at MIN_WIDTH
// and lets the workspace take the loss.
function getMaxWidth(flyout) {
    const area = getBlockAreaWidth(flyout);
    if (area == null) return MAX_WIDTH; // unmeasurable: keep the old flat ceiling
    const room = area - getCategoryWidth(flyout) - MIN_WORKSPACE_WIDTH;
    if (!Number.isFinite(room)) return MAX_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, room));
}

// The width the flyout is actually laid out at. Kept here so that every reader of the flyout's
// width -- getWidth() below and the toolbox override above, which must agree or the workspace's
// left boundary stops lining up with the palette -- applies the same ceiling, and so that a window
// that shrinks *after* a resize is honoured without anything having to tell this module about it.
function getLayoutWidth(flyout) {
    if (flyout.currentWidth_ == null) return null;
    return Math.min(flyout.currentWidth_, getMaxWidth(flyout));
}

function patchFlyoutPrototype() {
    const Blockly = getBlockly();
    if (!Blockly || !Blockly.Flyout || patched) return;
    patched = true;

    const Flyout = Blockly.Flyout;
    const VerticalFlyout = Blockly.VerticalFlyout;

    // Lay the flyout out at the requested width, held inside the ceiling getMaxWidth() reports.
    // Clamping on read (and not only in setWidth) is what makes a window that shrinks *after* the
    // drag self-correct: the next layout pass -- Blockly runs one on every resize -- picks the
    // smaller ceiling up here, and the toolbox override below reports the matching sum.
    Flyout.prototype.getWidth = function() {
        const width = getLayoutWidth(this);
        return width != null ? width : this.DEFAULT_WIDTH;
    };

    Flyout.prototype.setWidth = function(width) {
        width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
        this.currentWidth_ = width;
        savedWidth = width;
        if (!this.isVisible()) return;
        if (this.targetWorkspace_) {
            // WorkspaceSvg.resize() repositions the toolbox, and Toolbox.position() ends with
            // flyout_.position() -- so positioning here as well ran the whole flyout layout
            // (metrics, background path, scrollbar) twice per frame. Let resize() do it once.
            this.targetWorkspace_.resize();
        } else {
            this.position();
            this.reflow();
        }
    };

    Flyout.prototype.onResizeHandleMouseDown_ = function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDraggingWidth_ = true;
        if (this.resizeHandle_) this.resizeHandle_.classList.add('hm-resize-dragging');
        this.dragStartX_ = e.clientX;
        this.dragStartWidth_ = this.getWidth();
        beginMeasurementFreeze(this);
        // Announce the drag *before* any layout runs, so the first frame's translate events
        // are already suppressed by subscribers.
        notifyPaletteResize(true);
        const self = this;
        this.resizeMouseMoveWrapper_ = (ev) => self.onResizeHandleMouseMove_(ev);
        this.resizeMouseUpWrapper_ = (ev) => self.onResizeHandleMouseUp_(ev);
        // Safety net: a drag can end without a mouseup (window blur, handle removed mid-drag).
        // Without it the freeze would stay on and later measurements would get a stale box.
        this.resizeBlurWrapper_ = () => self.onResizeHandleMouseUp_();
        document.addEventListener('mousemove', this.resizeMouseMoveWrapper_, false);
        document.addEventListener('mouseup', this.resizeMouseUpWrapper_, false);
        window.addEventListener('blur', this.resizeBlurWrapper_, false);
        document.body.style.cursor = 'ew-resize';
    };

    Flyout.prototype.onResizeHandleMouseMove_ = function(e) {
        if (!this.isDraggingWidth_) return;
        // A mouseup released outside the window never reaches us; the button mask on the next
        // move is a dependable "the drag is over" signal, so end it here.
        if (typeof e.buttons === 'number' && (e.buttons & 1) === 0) {
            this.onResizeHandleMouseUp_();
            return;
        }
        e.preventDefault();
        // The gesture stays anchored where the button went down: the width is always
        // `dragStartWidth_ + (pointer - dragStartX_)` and only the *result* is clamped -- the anchor
        // itself is never rewritten when the clamp bites.
        //
        // The visible consequence is that past an end the divider parks there and does not budge
        // again until the pointer has travelled all the way back to it, so the palette can never
        // start shrinking out from under a pointer that is no longer on the edge. Re-anchoring on
        // the clamped width (which this used to do, to avoid having to re-cover the overshoot)
        // instead made the divider follow a pointer it was no longer under: overshoot the ceiling,
        // then move back 1px, and the palette shrank immediately even though the pointer was still
        // far inside the workspace and nowhere near the divider. `dragStartX_` and `dragStartWidth_`
        // are therefore written once per gesture, in onResizeHandleMouseDown_.
        const dx = this.RTL ? -(e.clientX - this.dragStartX_) : (e.clientX - this.dragStartX_);
        const wanted = this.dragStartWidth_ + dx;
        const clamped = Math.max(MIN_WIDTH, Math.min(getMaxWidth(this), wanted));
        this._latestWidth = clamped;
        if (!this.resizeAnimationFrame_) {
            const self = this;
            this.resizeAnimationFrame_ = requestAnimationFrame(function() {
                self.resizeAnimationFrame_ = null;
                self.setWidth(self._latestWidth);
            });
        }
    };

    Flyout.prototype.onResizeHandleMouseUp_ = function() {
        if (!this.isDraggingWidth_) return;
        this.isDraggingWidth_ = false;
        if (this.resizeHandle_) this.resizeHandle_.classList.remove('hm-resize-dragging');
        document.removeEventListener('mousemove', this.resizeMouseMoveWrapper_, false);
        document.removeEventListener('mouseup', this.resizeMouseUpWrapper_, false);
        window.removeEventListener('blur', this.resizeBlurWrapper_, false);
        document.body.style.cursor = '';
        if (this.resizeAnimationFrame_) {
            cancelAnimationFrame(this.resizeAnimationFrame_);
            this.resizeAnimationFrame_ = null;
        }
        // Unfreeze first, so the commit below runs the full layout exactly once.
        endMeasurementFreeze();
        if (typeof this._latestWidth === 'number') {
            this.setWidth(this._latestWidth);
            this._latestWidth = null;
        }
        // Last: the commit itself fires translate twice, and those are still suppressed. This
        // notification is what makes subscribers flush the final metrics exactly once.
        notifyPaletteResize(false);
    };

    const WorkspaceSvg = Blockly.WorkspaceSvg;

    if (WorkspaceSvg && WorkspaceSvg.prototype) {
        // Serve the frozen bounds instead of re-walking every block. Callers only read
        // x/y/width/height (verified across core/), but a copy is handed out so a caller that
        // writes into the object cannot poison the cache.
        const origGetBlocksBoundingBox = WorkspaceSvg.prototype.getBlocksBoundingBox;
        WorkspaceSvg.prototype.getBlocksBoundingBox = function() {
            if (!measuringFrozen || !frozenWorkspaces.has(this)) {
                return origGetBlocksBoundingBox.call(this);
            }
            let cached = bboxCache.get(this);
            if (!cached) {
                cached = origGetBlocksBoundingBox.call(this);
                bboxCache.set(this, cached);
            }
            return {
                x: cached.x,
                y: cached.y,
                width: cached.width,
                height: cached.height
            };
        };

        // The intersection check walks every observed block. Nothing moved while the divider is
        // dragged, so the result cannot change; skip it and let the drag-end commit run it once.
        const origQueueIntersectionCheck = WorkspaceSvg.prototype.queueIntersectionCheck;
        WorkspaceSvg.prototype.queueIntersectionCheck = function() {
            if (measuringFrozen && frozenWorkspaces.has(this)) return;
            return origQueueIntersectionCheck.call(this);
        };

        // recordCachedAreas() reads three getBoundingClientRect() values, forcing a synchronous
        // layout right after the drag wrote SVG attributes. The delete areas (trashcan / toolbox
        // hit tests) are only consulted while dragging a *block*, never while dragging the
        // divider, so defer them to the commit at drag end.
        const origRecordCachedAreas = WorkspaceSvg.prototype.recordCachedAreas;
        WorkspaceSvg.prototype.recordCachedAreas = function() {
            if (measuringFrozen && frozenWorkspaces.has(this)) return;
            return origRecordCachedAreas.call(this);
        };
    }

    // Flyout.show() repopulates the flyout, so a cached flyout bounding box would go stale if a
    // category switch ever happened mid-drag. Clearing the cache is cheap; normally it never
    // fires during a width drag because the flyout's scroll position does not change.
    const origShow = Flyout.prototype.show;
    Flyout.prototype.show = function() {
        if (measuringFrozen) bboxCache = new WeakMap();
        // The blocks are about to be laid out again, right-aligned against the palette's
        // current width, so the anchor has to be forgotten first -- otherwise the re-anchoring
        // would shift them by the width change that happened since the last category.
        contentAnchorWidth = null;
        return origShow.apply(this, arguments);
    };

    // Keep the handle glued to the (possibly new) edge whenever the flyout repositions.
    const origPosition = VerticalFlyout.prototype.position;
    VerticalFlyout.prototype.position = function() {
        ensureToolboxWidthOverride(this);
        origPosition.call(this);
        // After the flyout has been placed: in RTL the blocks have to be re-anchored, because
        // the resize moved the flyout's edge but not the blocks inside it.
        anchorFlyoutContent(this);
        placeResizeHandle(this);
    };
}

function getMainFlyout() {
    const Blockly = getBlockly();
    if (!Blockly || !Blockly.getMainWorkspace) return null;
    const ws = Blockly.getMainWorkspace();
    return ws && ws.getFlyout ? ws.getFlyout() : null;
}

/**
 * Keeps the flyout's blocks where they are when the palette is resized in RTL.
 *
 * Blockly lays the flyout's blocks out right-aligned against the palette's width:
 * Blockly.VerticalFlyout.layout_ puts each block's surface x at `flyoutWidth - MARGIN`.
 * That happens once, when a category is opened, and VerticalFlyout.reflowInternal_ is a
 * no-op ("the flyout is a fixed size"), so the positions are never recomputed.
 *
 * In LTR that does not matter: the blocks are laid out from the left, the flyout's left edge
 * is the one that stays put, and the blocks do not move. In RTL the flyout's RIGHT edge is the
 * one that stays put and its left edge moves as the palette is resized -- so the blocks, whose
 * positions still refer to the old width, slide along with the drag.
 *
 * The fix is to shift the content by the same amount the width changed. The flyout's inner
 * workspace is translated by `scrollX + absoluteLeft` (VerticalFlyout.setMetrics_), and the
 * flyout's absoluteLeft is 0, so the content's offset inside the flyout is exactly scrollX.
 * Scrolling it sideways moves every block at once, with no per-block work.
 *
 * @param {Object} flyout the flyout to re-anchor
 */
function anchorFlyoutContent(flyout) {
    if (!flyout || !flyout.RTL) return;
    const width = flyout.getWidth();
    if (contentAnchorWidth === null) {
        // Nothing to correct yet: the content was laid out for this very width.
        contentAnchorWidth = width;
        return;
    }
    const delta = width - contentAnchorWidth;
    if (!delta) return;
    contentAnchorWidth = width;
    const workspace = flyout.workspace_;
    if (!workspace) return;
    workspace.scrollX = (workspace.scrollX || 0) + delta;
    // The canvas is translated by scrollX + absoluteLeft / scrollY + absoluteTop; for a flyout
    // absoluteLeft is 0 and absoluteTop is the scrollbar padding.
    workspace.translate(workspace.scrollX, workspace.scrollY + flyout.SCROLLBAR_PADDING);
}

function applySetting(active) {
    waitFrames = 0;
    resizeActive = active;
    patchFlyoutPrototype();
    injectStyle();
    setScrollbarShift(active);
    // The setting is never toggled mid-drag, but if it were, drop the freeze so the layout
    // below runs for real.
    endMeasurementFreeze();
    const flyout = getMainFlyout();
    if (!flyout) return;
    if (active) {
        if (savedWidth != null && flyout.currentWidth_ == null) {
            flyout.currentWidth_ = savedWidth;
        }
    } else if (flyout.currentWidth_ != null) {
        flyout.currentWidth_ = null; // back to DEFAULT_WIDTH
    }
    flyout.position();
    if (!active) {
        flyout.reflow();
        if (flyout.targetWorkspace_) flyout.targetWorkspace_.resize();
    }
}

function ensureApplied(active) {
    if (getBlockly()) {
        applySetting(active);
    } else if (waitFrames++ < MAX_WAIT_FRAMES) {
        requestAnimationFrame(() => ensureApplied(active));
    }
}

const initResizePalette = () => {
    if (typeof window === 'undefined') return;
    const initial = getSetting(SETTING_BLOCK_PALETTE_RESIZE) === BLOCK_PALETTE_RESIZE_ON;
    onSettingsChange((key, value) => {
        if (key === SETTING_BLOCK_PALETTE_RESIZE) {
            ensureApplied(value === BLOCK_PALETTE_RESIZE_ON);
        }
    });
    if (initial) {
        ensureApplied(true);
    }
};

export {initResizePalette, onPaletteResizeChange};
