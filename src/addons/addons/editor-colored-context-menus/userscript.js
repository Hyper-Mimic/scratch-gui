import { removeAlpha } from "../../libraries/common/cs/text-color.esm.js";

export default async function ({ addon, console }) {
  const ScratchBlocks = await addon.tab.traps.getBlockly();

  const applyContextMenuColor = (block) => {
    const widgetDiv = ScratchBlocks.WidgetDiv.DIV;
    if (!widgetDiv) {
      return;
    }
    const background = block.svgPath_;
    if (!background) {
      return;
    }
    const fill = removeAlpha(background.getAttribute("fill"));
    const border = background.getAttribute("stroke") || "#0003";
    const text = ScratchBlocks.Colours.text;
    widgetDiv.classList.add("sa-contextmenu-colored");
    widgetDiv.style.setProperty("--sa-contextmenu-bg", fill);
    widgetDiv.style.setProperty("--sa-contextmenu-border", border);
    widgetDiv.style.setProperty("--sa-contextmenu-text", text);
  };

  const clearContextMenuColor = () => {
    const widgetDiv = ScratchBlocks.WidgetDiv.DIV;
    if (widgetDiv) {
      widgetDiv.classList.remove("sa-contextmenu-colored");
    }
  };

  const originalHandleRightClick = ScratchBlocks.Gesture.prototype.handleRightClick;
  ScratchBlocks.Gesture.prototype.handleRightClick = function (...args) {
    const block = this.targetBlock_;
    const ret = originalHandleRightClick.call(this, ...args);
    if (block) {
      applyContextMenuColor(block);
    }
    return ret;
  };

  // The block context menu now fades out: WidgetDiv.hide() only starts the
  // animation and clears the DOM ANIMATION_TIME seconds later. Dropping the
  // class on that first call recoloured the menu for the whole fade, so keep
  // it while the menu element is still in the container. Repeated plain
  // hide() calls during a pending fade are no-ops, and the timer's final
  // hide(true) passes through this wrapper once the DOM has been cleared.
  const originalHide = ScratchBlocks.WidgetDiv.hide;
  ScratchBlocks.WidgetDiv.hide = function (...args) {
    const ret = originalHide.apply(this, args);
    const widgetDiv = ScratchBlocks.WidgetDiv.DIV;
    if (widgetDiv && !widgetDiv.querySelector(".blocklyContextMenu")) {
      clearContextMenuColor();
    }
    return ret;
  };

  // Older Blockly builds (and any path that clears the container directly)
  // do not go through the wrapper above; keep the class in sync there too.
  const originalHideAndClearDom = ScratchBlocks.WidgetDiv.hideAndClearDom_;
  if (originalHideAndClearDom) {
    ScratchBlocks.WidgetDiv.hideAndClearDom_ = function (...args) {
      clearContextMenuColor();
      return originalHideAndClearDom.apply(this, args);
    };
  }
}
