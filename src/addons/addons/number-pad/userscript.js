export default async function ({ addon, msg, console }) {
  const ScratchBlocks = await addon.tab.traps.getBlockly();

  // https://github.com/scratchfoundation/scratch-blocks/blob/develop/core/field_number.js#L165
  const originalMouseDown = ScratchBlocks.FieldNumber.prototype.showEditor_;
  ScratchBlocks.FieldNumber.prototype.showEditor_ = function (...args) {
    if (!addon.self.disabled) {
      this.useTouchInteraction_ = true;
    }
    return originalMouseDown.apply(this, args);
  };

  // Coordinate-space fix for the num-pad.
  //
  // `FieldNumber.prototype.position_` hands `DropDownDiv.show()` the result of `getAbsoluteXY_()`,
  // i.e. `goog.style.getPageOffset()`, which is in DOCUMENT coordinates. Everything on the receiving
  // side is in VIEWPORT coordinates: `.blocklyDropDownDiv` is `position: fixed`, and
  // `DropDownDiv.getPositionMetrics()` fits the box against `getBoundingClientRect()`.
  //
  // With no page scroll the two spaces coincide, which is why this only shows up in a small viewport
  // with a scrollbar: scroll down and the pad lands a whole scroll-length too low, and the fit test
  // (page-space primaryY vs viewport-space bounds) decides it cannot fit below the block and flips
  // it above instead.
  //
  // Shifting the four origin points by the scroll offset converts page -> viewport at the single
  // point where the two spaces meet, and leaves Blockly's own geometry (including the arrow) alone.
  const getScrollOffset = () => {
    const root = document.documentElement;
    return {
      x: typeof window.scrollX === 'number' ? window.scrollX : root.scrollLeft,
      y: typeof window.scrollY === 'number' ? window.scrollY : root.scrollTop
    };
  };

  const originalShow = ScratchBlocks.DropDownDiv.show;
  ScratchBlocks.DropDownDiv.show = function (owner, primaryX, primaryY, secondaryX, secondaryY, ...rest) {
    if (!addon.self.disabled && owner instanceof ScratchBlocks.FieldNumber) {
      const {x, y} = getScrollOffset();
      primaryX -= x;
      primaryY -= y;
      secondaryX -= x;
      secondaryY -= y;
    }
    return originalShow.call(this, owner, primaryX, primaryY, secondaryX, secondaryY, ...rest);
  };
}
