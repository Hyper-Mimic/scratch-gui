import EventTarget from "../../event-target.js"; /* inserted by pull.js */

import { eventTarget as tooltipUpdateEventTarget } from "./force-tooltip-update.js";

export default async function ({ addon, global, console }) {
  // The workspace needs to be manually resized via a window resize event
  // whenever the addon modifies or stops modifying UI elements
  resizeWorkspace();

  let resizeObserver = new ResizeObserver(resizeWorkspace);
  (async () => {
    while (true) {
      let menuBar = await addon.tab.waitForElement('[class*="menu-bar_menu-bar"]', {
        markAsSeen: true,
        reduxEvents: [
          "scratch-gui/mode/SET_PLAYER",
          "fontsLoaded/SET_FONTS_LOADED",
          "scratch-gui/locales/SELECT_LOCALE",
        ],
        reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
      });
      resizeObserver.observe(menuBar);
    }
  })();

  // In small stage mode the right column (stage + sprite list) is only ~258px wide,
  // while in large/full mode it is ~498px. Toggle a class on the column wrapper so
  // the userstyle can grow the stage canvas to fill the column. The class only
  // depends on the stage size, not on full screen, so toggling full screen does not
  // change it and does not trigger any workspace re-layout.
  (async () => {
    while (true) {
      const stageAndTargetWrapper = await addon.tab.waitForElement(
        '[class*="gui_stage-and-target-wrapper"]',
        {
          markAsSeen: true,
          reduxEvents: [
            "scratch-gui/mode/SET_PLAYER",
            "fontsLoaded/SET_FONTS_LOADED",
            "scratch-gui/locales/SELECT_LOCALE",
          ],
          reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
        }
      );
      const updateNarrowClass = () => {
        const width = stageAndTargetWrapper.getBoundingClientRect().width;
        // Small stage mode: the right column is only ~258px wide. Toggle a class so
        // the userstyle grows the stage canvas to fill the column.
        stageAndTargetWrapper.classList.toggle("sa-compact-small-stage", width > 0 && width < 300);
        // Constrained mode (window < ~1095px): the column is ~300-460px wide. Compress
        // the sprite list / stage selector pane so it lines up with the narrower stage.
        stageAndTargetWrapper.classList.toggle("sa-compact-constrained", width >= 300 && width < 460);
      };
      updateNarrowClass();
      new ResizeObserver(updateNarrowClass).observe(stageAndTargetWrapper);
    }
  })();

  // Toggling the stage size changes the width of the code area without resizing the
  // window, so Blockly never re-measures its workspace SVG (it can end up ~22px
  // narrower than its container, shifting the horizontal scrollbar left). Dispatch a
  // window resize after the layout settles. Listening to the redux action instead of
  // a ResizeObserver avoids re-laying out the workspace when full screen toggles
  // (which changes the column width but not the stage size), preventing a visible
  // flicker of the workspace background.
  addon.tab.redux.addEventListener("statechanged", (e) => {
    if (e.detail.action.type === "scratch-gui/StageSize/SET_STAGE_SIZE") {
      requestAnimationFrame(() => requestAnimationFrame(() => resizeWorkspace()));
    }
  });

  async function resizeWorkspace() {
    window.dispatchEvent(new Event("resize"));
  }

  // Icons in the sound editor don't have tooltips. Add them if labels are hidden.
  const updateTooltips = () => {
    for (const button of document.querySelectorAll(
      "[class*='sound-editor_tool-button_'], [class*='sound-editor_effect-button_']"
    )) {
      const icon = button.querySelector("img");
      if (!addon.self.disabled && addon.settings.get("hideLabels")) icon.title = button.textContent;
      else icon.removeAttribute("title");
    }
  };
  updateTooltips();
  addon.settings.addEventListener("change", updateTooltips);
  addon.self.addEventListener("disabled", updateTooltips);
  addon.self.addEventListener("reenabled", updateTooltips);
  tooltipUpdateEventTarget.addEventListener("update", updateTooltips);

  while (true) {
    await addon.tab.waitForElement("[class*='sound-editor_editor-container_']", {
      markAsSeen: true,
      reduxEvents: [
        "scratch-gui/navigation/ACTIVATE_TAB",
        "scratch-gui/mode/SET_PLAYER",
        "fontsLoaded/SET_FONTS_LOADED",
        "scratch-gui/locales/SELECT_LOCALE",
        "scratch-gui/targets/UPDATE_TARGET_LIST",
      ],
      reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly && state.scratchGui.editorTab.activeTabIndex === 2,
    });
    updateTooltips();
  }
}
