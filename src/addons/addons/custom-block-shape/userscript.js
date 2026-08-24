import { updateAllBlocks } from "./update-all-blocks.js";
import applyChanges, { applyChangesFromSettings } from "./apply-changes.js";

export default async function ({ addon, console }) {
  var BlocklyInstance = await addon.tab.traps.getBlockly();

  var vm = addon.tab.traps.vm;

  function applyAndUpdate(...args) {
    if (args.length < 3) {
      applyChangesFromSettings(BlocklyInstance, {
        paddingSize: addon.settings.get("paddingSize"),
        cornerSize: addon.settings.get("cornerSize"),
        notchSize: addon.settings.get("notchSize")
      });
    } else {
      applyChanges(BlocklyInstance, args[0], args[1], args[2]);
    }
    updateAllBlocks(vm, addon.tab.traps.getWorkspace(), BlocklyInstance);
  }

  addon.settings.addEventListener("change", () => applyAndUpdate());

  addon.self.addEventListener("disabled", () => {
    // Scratch 3.0 blocks
    applyAndUpdate(100, 100, 100);
  });

  addon.self.addEventListener("reenabled", () => applyAndUpdate());

  applyAndUpdate();
}
