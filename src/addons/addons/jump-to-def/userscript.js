import Utils from "../find-bar/blockly/Utils.js";
export default async function ({ addon, msg, console }) {
  const utils = new Utils(addon);

  const Blockly = await addon.tab.traps.getBlockly();

  Object.defineProperty(Blockly.Gesture.prototype, "jumpToDef", {
    get() {
      return !addon.self.disabled;
    },
  });

  const _doBlockClick_ = Blockly.Gesture.prototype.doBlockClick_;
  Blockly.Gesture.prototype.doBlockClick_ = function () {
    if (!addon.self.disabled && (this.mostRecentEvent_.button === 1 || this.mostRecentEvent_.shiftKey)) {
      jumpTo.call(this);
      return;
    }

    _doBlockClick_.call(this);
  }

  // The palette's flyout is drawn on top of the left part of the workspace, so a definition
  // scrolled to the usual left margin would end up hidden behind it. The flyout is left open --
  // closing it here would also leave the toolbox thinking that category is still selected, so
  // clicking it again would deselect it instead of reopening the palette -- and the definition
  // is simply scrolled clear of it instead.
  const getFlyoutOffset = () => {
    try {
      const flyout = Blockly.getMainWorkspace().getFlyout();
      if (flyout && flyout.isVisible()) {
        return flyout.getWidth();
      }
    } catch (e) {
      // ignore
    }
    return 0;
  };

  function jumpTo(block) {
    // Wheel button...
    // Intercept clicks to allow jump to...?
    try {
      block = block || this.startBlock_;
      for (; block; block = block.getSurroundParent()) {
        if (block.type === "procedures_call") {
          let findProcCode = block.getProcCode();

          let topBlocks = utils.getWorkspace().getTopBlocks();
          for (const root of topBlocks) {
            if (root.type === "procedures_definition") {
              let label = root.getChildren()[0];
              let procCode = label.getProcCode();
              if (procCode && procCode === findProcCode) {
                // Found... navigate to it!
                utils.scrollBlockIntoView(root, utils.offsetX + getFlyoutOffset());
                return;
              }
            }
          }
        }
      }
    } catch (e) {
      // ingore
    }
    // Nothing to jump to, so let the normal click handling happen. `this` is undefined when
    // jumpTo was called from a context menu item -- there is no gesture then.
    if (this && typeof _doBlockClick_ === "function") {
      _doBlockClick_.call(this);
    }
  }

  addon.tab.createBlockContextMenu(
    (items, block) => {
      if (addon.self.disabled) return items;
      // The flyout branch of the context menu also fires for a right-click on the flyout
      // background, where there is no block at all.
      if (!block || block.type !== "procedures_call") return items;

      const makeSpaceItemIndex = items.findIndex((obj) => obj._isDevtoolsFirstItem);
      const insertBeforeIndex =
        makeSpaceItemIndex !== -1
          ? // If "make space" button exists, add own items before it
          makeSpaceItemIndex
          : // If there's no such button, insert at end
          items.length;

      items.splice(
        insertBeforeIndex,
        0,
        {
          enabled: true,
          text: msg("jump_to_definition"),
          callback: () => {
            jumpTo(block)
          },
          separator: false,
        }
      );

      return items;
    },
    // `flyout` makes the item show up for the custom blocks in the palette's "My Blocks"
    // category too, not just for the ones in the workspace.
    { blocks: true, flyout: true }
  );
}
