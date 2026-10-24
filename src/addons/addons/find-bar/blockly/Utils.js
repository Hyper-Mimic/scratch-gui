import BlockInstance from "./BlockInstance.js";
import BlockFlasher from "./BlockFlasher.js";

// A scroll animation is at least this long, however short the distance, so that even a small
// nudge reads as a movement instead of a flicker.
const SCROLL_ANIMATION_MIN_MS = 180;
// ...and at most this long, so that a jump across the whole workspace is not a slideshow.
const SCROLL_ANIMATION_MAX_MS = 600;
// How many milliseconds a scroll of one pixel is worth. The duration grows with the distance,
// but sub-linearly (the minimum/maximum clamp above does the rest).
const SCROLL_ANIMATION_MS_PER_PIXEL = 0.6;
const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

// Make these global so that every addon uses the same arrays.
let views = [];
let forward = [];
export default class Utils {
  constructor(addon) {
    this.addon = addon;
    this.addon.tab.traps.getBlockly().then((blockly) => {
      this.blockly = blockly;
    });
    /**
     * Scratch Virtual Machine
     * @type {null|*}
     */
    this.vm = this.addon.tab.traps.vm;
    // this._myFlash = { block: null, timerID: null, colour: null };
    this.offsetX = 32;
    this.offsetY = 32;
    this.navigationHistory = new NavigationHistory();
    /**
     * The workspace
     */
    this._workspace = null;
    /**
     * The requestAnimationFrame handle of the running scroll animation, if any.
     * @type {?number}
     */
    this._scrollFrame = null;
  }

  /**
   * Get the Scratch Editing Target
   * @returns {?Target} the scratch editing target
   */
  getEditingTarget() {
    return this.vm.runtime.getEditingTarget();
  }

  /**
   * Set the current workspace (switches sprites)
   * @param targetID {string}
   */
  setEditingTarget(targetID) {
    if (this.getEditingTarget().id !== targetID) {
      this.vm.setEditingTarget(targetID);
    }
  }

  /**
   * Returns the main workspace
   * @returns !Blockly.Workspace
   */
  getWorkspace() {
    const currentWorkspace = Blockly.getMainWorkspace();
    if (currentWorkspace.getToolbox()) {
      // Sadly get get workspace does not always return the 'real' workspace... Not sure how to get that at the moment,
      //  but we can work out whether it's the right one by whether it has a toolbox.
      this._workspace = currentWorkspace;
    }
    return this._workspace;
  }

  /**
   * Based on wksp.centerOnBlock(li.data.labelID);
   * @param blockOrId {Blockly.Block|{id}|BlockInstance} A Blockly Block, a block id, or a BlockInstance
   * @param optOffsetX {number} left margin to scroll the block to, in CSS pixels. Defaults to
   *   this.offsetX; a caller that has something covering the left of the workspace (the
   *   palette's flyout) can pass a larger value to scroll the block clear of it.
   */
  scrollBlockIntoView(blockOrId, optOffsetX) {
    let workspace = this.getWorkspace();
    /** @type {Blockly.Block} */
    let block; // or is it really a Blockly.BlockSvg?

    const offsetX = typeof optOffsetX === "number" ? optOffsetX : this.offsetX;

    if (blockOrId instanceof BlockInstance) {
      // Switch to sprite
      this.setEditingTarget(blockOrId.targetId);
      // Highlight the block!
      block = workspace.getBlockById(blockOrId.id);
    } else {
      block = blockOrId && blockOrId.id ? blockOrId : workspace.getBlockById(blockOrId);
    }

    if (!block) {
      return;
    }

    /**
     * !Blockly.Block
     */
    let root = block.getRootBlock();
    let base = this.getTopOfStackFor(block);
    let ePos = base.getRelativeToSurfaceXY(), // Align with the top of the block
      rPos = root.getRelativeToSurfaceXY(), // Align with the left of the block 'stack'
      scale = workspace.scale,
      x = rPos.x * scale,
      y = ePos.y * scale,
      xx = x + block.width * scale, // block.width/height 是未缩放工作区单位，需乘 scale 与 x/y 量纲一致
      yy = y + block.height * scale,
      s = workspace.getMetrics();

    // Hide the chaff before the move: it would otherwise fly across the screen while the
    // workspace scrolls.
    this.blockly?.hideChaff();

    if (
      x < s.viewLeft + offsetX - 4 ||
      xx > s.viewLeft + s.viewWidth ||
      y < s.viewTop + this.offsetY - 4 ||
      yy > s.viewTop + s.viewHeight
    ) {
      // sx = s.contentLeft + s.viewWidth / 2 - x,
      let sx = x - s.contentLeft - offsetX,
        // sy = s.contentTop - y + Math.max(Math.min(32, 32 * scale), (s.viewHeight - yh) / 2);
        sy = y - s.contentTop - this.offsetY;

      this.navigationHistory.storeView(this.navigationHistory.peek(), 64);

      this.animateScrollTo(workspace, sx, sy, () => {
        // The same history check the instant scroll used to do, now that the view has settled.
        this.navigationHistory.storeView({ left: sx, top: sy }, 64);
      });
    }
    BlockFlasher.flash(block);
  }

  /**
   * Scroll the workspace to the given scroll values, animated.
   *
   * `workspace.scrollbar.set(x, y)` jumps straight to the target. The value maps linearly onto
   * the scroll position -- Blockly turns it into a ratio and back again
   * (Blockly.WorkspaceSvg.setTopLevelWorkspaceMetrics_:
   * `scrollX = -contentWidth * ratio - contentLeft`, and the ratio is derived from that same
   * value) -- so interpolating the value over a few frames scrolls smoothly.
   *
   * The value that corresponds to the current scroll position is `viewLeft - contentLeft`:
   * `viewLeft` is `-scrollX`, and the scroll value is `-scrollX - contentLeft`.
   *
   * @param {Blockly.Workspace} workspace the workspace to scroll
   * @param {number} sx target horizontal scroll value
   * @param {number} sy target vertical scroll value
   * @param {function(): void} [onComplete] called once the view has settled on the target
   */
  animateScrollTo(workspace, sx, sy, onComplete) {
    this.cancelScrollAnimation();

    const metrics = workspace.getMetrics();
    if (!metrics) {
      workspace.scrollbar.set(sx, sy);
      if (onComplete) {
        onComplete();
      }
      return;
    }

    const fromX = metrics.viewLeft - metrics.contentLeft;
    const fromY = metrics.viewTop - metrics.contentTop;

    const distance = Math.sqrt(
      Math.pow(sx - fromX, 2) + Math.pow(sy - fromY, 2)
    );
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;

    if (reducedMotion || distance < 1) {
      // Nothing to animate (or the user asked for no motion): jump straight there.
      workspace.scrollbar.set(sx, sy);
      if (onComplete) {
        onComplete();
      }
      return;
    }

    const duration = Math.min(
      SCROLL_ANIMATION_MAX_MS,
      Math.max(SCROLL_ANIMATION_MIN_MS, distance * SCROLL_ANIMATION_MS_PER_PIXEL)
    );
    const start = performance.now();
    // The position after our own last scroll, so that a scroll the user made themselves can be
    // told apart from ours.
    let lastX = null;
    let lastY = null;

    const step = now => {
      // Somebody moved the workspace themselves (the user scrolled or dragged): stop animating
      // instead of fighting them.
      if (
        lastX !== null &&
        (Math.abs(workspace.scrollX - lastX) > 0.5 ||
          Math.abs(workspace.scrollY - lastY) > 0.5)
      ) {
        this._scrollFrame = null;
        return;
      }

      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic: quick off the mark, then settling onto the target.
      const eased = 1 - Math.pow(1 - t, 3);
      workspace.scrollbar.set(
        fromX + (sx - fromX) * eased,
        fromY + (sy - fromY) * eased
      );
      lastX = workspace.scrollX;
      lastY = workspace.scrollY;

      if (t < 1) {
        this._scrollFrame = requestAnimationFrame(step);
      } else {
        this._scrollFrame = null;
        if (onComplete) {
          onComplete();
        }
      }
    };

    this._scrollFrame = requestAnimationFrame(step);
  }

  /**
   * Stop a running scroll animation. A new animation replaces the old one, so a second search
   * does not fight the first.
   */
  cancelScrollAnimation() {
    if (this._scrollFrame !== null) {
      cancelAnimationFrame(this._scrollFrame);
      this._scrollFrame = null;
    }
  }

  /**
   * Find the top stack block of a  stack
   * @param block a block in a stack
   * @returns {*} a block that is the top of the stack of blocks
   */
  getTopOfStackFor(block) {
    let base = block;
    while (base.getOutputShape() && base.getSurroundParent()) {
      base = base.getSurroundParent();
    }
    return base;
  }
}

class NavigationHistory {
  /**
   * Keep a record of the scroll and zoom position
   */
  storeView(next, dist) {
    forward = [];
    let workspace = Blockly.getMainWorkspace(),
      s = workspace.getMetrics();

    let pos = { left: s.viewLeft, top: s.viewTop };
    if (!next || distance(pos, next) > dist) {
      views.push(pos);
    }
  }

  peek() {
    return views.length > 0 ? views[views.length - 1] : null;
  }

  goBack() {
    const workspace = Blockly.getMainWorkspace(),
      s = workspace.getMetrics();

    let pos = { left: s.viewLeft, top: s.viewTop };
    let view = this.peek();
    if (!view) {
      return;
    }
    if (distance(pos, view) < 64) {
      // Go back to current if we are already far away from it
      if (views.length > 1) {
        views.pop();
        forward.push(view);
      }
    }

    view = this.peek();
    if (!view) {
      return;
    }

    let sx = view.left - s.contentLeft,
      sy = view.top - s.contentTop;

    // transform.setTranslate(-600,0);

    workspace.scrollbar.set(sx, sy);

    /*
              let blocklySvg = document.getElementsByClassName('blocklySvg')[0];
              let blocklyBlockCanvas = blocklySvg.getElementsByClassName('blocklyBlockCanvas')[0];
              let transform = blocklyBlockCanvas.transform.baseVal.getItem(0);
              let scale = blocklyBlockCanvas.transform.baseVal.getItem(1);

              let transformMatrix = transform.matrix;
              let scaleMatrix = scale.matrix;

              console.log('Transform - getMetrics', s);
              console.log('sx, sy: ', sx, sy);
              console.log('left, top: ', view.left, view.top);
              console.log('contentLeft, right:', s.contentLeft, s.contentTop);
              console.log('transform, scale matrix: ', transformMatrix, scaleMatrix);
  */
  }

  goForward() {
    let view = forward.pop();
    if (!view) {
      return;
    }
    views.push(view);

    let workspace = Blockly.getMainWorkspace(),
      s = workspace.getMetrics();

    let sx = view.left - s.contentLeft,
      sy = view.top - s.contentTop;

    workspace.scrollbar.set(sx, sy);
  }
}

function distance(pos, next) {
  return Math.sqrt(Math.pow(pos.left - next.left, 2) + Math.pow(pos.top - next.top, 2));
}
