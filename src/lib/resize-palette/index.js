import {
    getSetting,
    onSettingsChange,
    SETTING_BLOCK_PALETTE_STYLE,
    BLOCK_PALETTE_STYLE_RESIZE
} from '../hypermimic-settings.js';
import LazyScratchBlocks from '../tw-lazy-scratch-blocks.js';

// "Allow changing block palette width" (HyperMimic setting `blockPaletteStyle === 'resize'`).
//
// Ported from AstraEditor/scratch-blocks' flyout resize handle, but applied at runtime
// (monkey-patching Blockly.Flyout) instead of compiled into scratch-blocks, so it stays in
// the scratch-gui tree like the sibling `unclip-palette` feature and needs no rebuild.
//
// When active, a transparent draggable strip is placed along the flyout's inner edge. Dragging
// it writes a new width through Blockly's own position()/reflow()/targetWorkspace.resize() path,
// so the main workspace shrinks to match (workspace_svg.js subtracts flyout_.width_ in getMetrics).
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
const MAX_WIDTH = 800;
const STYLE_ID = 'hm-resize-palette';
const MAX_WAIT_FRAMES = 600; // ~10s; give up retrying if Blockly never loads

let patched = false;
let resizeActive = false;
let savedWidth = null; // restored onto a recreated flyout
let waitFrames = 0;

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
        '.blocklyFlyoutResizeHandle.hm-resize-dragging{opacity:1;}';
    document.head.appendChild(style);
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
    // Capture the toolbox's natural width (category column + default flyout) the
    // first time we see it, before any resize delta is applied.
    tb._hmOriginalToolboxWidth = tb.getWidth();
    tb.getWidth = function() {
        let w = tb._hmOriginalToolboxWidth;
        if (resizeActive && flyout.currentWidth_ != null) {
            const def = flyout.DEFAULT_WIDTH || 250;
            w += (flyout.currentWidth_ - def);
        }
        return w;
    };
}

function patchFlyoutPrototype() {
    const Blockly = getBlockly();
    if (!Blockly || !Blockly.Flyout || patched) return;
    patched = true;

    const Flyout = Blockly.Flyout;
    const VerticalFlyout = Blockly.VerticalFlyout;

    Flyout.prototype.getWidth = function() {
        return this.currentWidth_ != null ? this.currentWidth_ : this.DEFAULT_WIDTH;
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
        const dx = this.RTL ? -(e.clientX - this.dragStartX_) : (e.clientX - this.dragStartX_);
        this._latestWidth = this.dragStartWidth_ + dx;
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
        return origShow.apply(this, arguments);
    };

    // Keep the handle glued to the (possibly new) edge whenever the flyout repositions.
    const origPosition = VerticalFlyout.prototype.position;
    VerticalFlyout.prototype.position = function() {
        ensureToolboxWidthOverride(this);
        origPosition.call(this);
        placeResizeHandle(this);
    };
}

function getMainFlyout() {
    const Blockly = getBlockly();
    if (!Blockly || !Blockly.getMainWorkspace) return null;
    const ws = Blockly.getMainWorkspace();
    return ws && ws.getFlyout ? ws.getFlyout() : null;
}

function applySetting(active) {
    waitFrames = 0;
    resizeActive = active;
    patchFlyoutPrototype();
    injectStyle();
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
    const initial = getSetting(SETTING_BLOCK_PALETTE_STYLE) === BLOCK_PALETTE_STYLE_RESIZE;
    onSettingsChange((key, value) => {
        if (key === SETTING_BLOCK_PALETTE_STYLE) {
            ensureApplied(value === BLOCK_PALETTE_STYLE_RESIZE);
        }
    });
    if (initial) {
        ensureApplied(true);
    }
};

export {initResizePalette, onPaletteResizeChange};
