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

const RESIZE_HANDLE_WIDTH = 6;
const MIN_WIDTH = 30;
const MAX_WIDTH = 800;
const STYLE_ID = 'hm-resize-palette';
const MAX_WAIT_FRAMES = 600; // ~10s; give up retrying if Blockly never loads

let patched = false;
let resizeActive = false;
let savedWidth = null; // restored onto a recreated flyout
let waitFrames = 0;

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
        // Capture + bubble so the drag starts regardless of other handlers on the edge.
        flyout.resizeHandle_.addEventListener('mousedown', handler, true);
        flyout.resizeHandle_.addEventListener('mousedown', handler, false);
        // Double-click resets the palette back to its default width.
        const dblHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            flyout.setWidth(flyout.DEFAULT_WIDTH || 250);
        };
        flyout.resizeHandle_.addEventListener('dblclick', dblHandler, true);
        flyout.resizeHandle_.addEventListener('dblclick', dblHandler, false);
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
        if (this.isVisible()) {
            this.position();
            this.reflow();
            if (this.targetWorkspace_) {
                this.targetWorkspace_.resize();
            }
        }
    };

    Flyout.prototype.onResizeHandleMouseDown_ = function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDraggingWidth_ = true;
        if (this.resizeHandle_) this.resizeHandle_.classList.add('hm-resize-dragging');
        this.dragStartX_ = e.clientX;
        this.dragStartWidth_ = this.getWidth();
        const self = this;
        this.resizeMouseMoveWrapper_ = (ev) => self.onResizeHandleMouseMove_(ev);
        this.resizeMouseUpWrapper_ = (ev) => self.onResizeHandleMouseUp_(ev);
        document.addEventListener('mousemove', this.resizeMouseMoveWrapper_, false);
        document.addEventListener('mouseup', this.resizeMouseUpWrapper_, false);
        document.body.style.cursor = 'ew-resize';
    };

    Flyout.prototype.onResizeHandleMouseMove_ = function(e) {
        if (!this.isDraggingWidth_) return;
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
        document.body.style.cursor = '';
        if (this.resizeAnimationFrame_) {
            cancelAnimationFrame(this.resizeAnimationFrame_);
            this.resizeAnimationFrame_ = null;
        }
        if (typeof this._latestWidth === 'number') {
            this.setWidth(this._latestWidth);
            this._latestWidth = null;
        }
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

export {initResizePalette};
