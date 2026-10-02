export default async function ({ addon, console, msg }) {
  let placeHolderDiv = null;
  let lockObject = null;
  let lockButton = null;
  let lockIcon = null;
  let flyOut = null;
  let scrollBar = null;
  let resizeObserver = null;
  let flyoutClassObserver = null;
  let lastFlyoutWidth = -1;
  let toggle = false;
  let flyoutLock = false;
  let closeOnMouseUp = false;
  let scrollAnimation = true;

  const SVG_NS = "http://www.w3.org/2000/svg";

  const Blockly = await addon.tab.traps.getBlockly();

  // ===== Workspace metrics: hand the palette strip back to the workspace =====
  // The toolbox reports itself as wide as the category column PLUS the flyout
  // (Blockly.Toolbox.prototype.width = 60 + Flyout.DEFAULT_WIDTH = 310) and
  // WorkspaceSvg.getTopLevelWorkspaceMetrics_ derives everything from that one number: absoluteLeft
  // (the workspace's left boundary, which setTopLevelWorkspaceMetrics_ also adds to the canvas
  // translate) and viewWidth (its viewport). That is the *only* correct boundary while the palette
  // is on screen -- the flyout covers exactly that strip -- but once the flyout has slid away the
  // strip it used to fill is dead space: Scrollbar.resizeViewHorizontal draws the horizontal bar at
  // `absoluteLeft + 0.5` with a length of `viewWidth`, so the bar starts at the flyout's *right*
  // edge (x = 310) instead of at .blocklyToolboxDiv's (x = 60) and nothing can be scrolled into the
  // 250px in between.
  //
  // Hence the reclaim below is conditional on the flyout actually being hidden (`sa-flyoutClose`):
  // while the palette is open the stock boundary is reported untouched, because the reclaim would
  // make the strip scrollable *underneath* the palette instead. Reclaiming it is only right for the
  // state the addon exists for -- the palette being gone.
  //
  // The reclaim itself works the way the "adjust block palette width" feature does it
  // (src/lib/resize-palette makes the toolbox report its natural width PLUS the resize delta): have
  // the toolbox report the category column only while the metrics are computed. Blockly then derives
  // absoluteLeft = 60 on its own and, because getContentDimensions_ is handed the same shrunk
  // svgSize, the scrollable extent covers the reclaimed strip too -- so the area actually becomes
  // scrollable instead of just being reachable by the scrollbar.
  //
  // The override lives only for the duration of the call, so the flyout keeps seeing the real
  // number: VerticalFlyout.position places it at `parentToolbox_.getWidth() - width_`, i.e. still
  // at x = 60, so it slides in over the workspace exactly as before.
  //
  // The width has to come from getFlyout(), not from the `flyoutWidth` the stock metrics report:
  // with categories the flyout is owned by the toolbox (toolbox.js creates it) and never assigned
  // to workspace.flyout_ (inject.js only does that for a category-less workspace), so `flyoutWidth`
  // is always 0 here.
  //
  // Only the left-hand palette is handled: with the toolbox on the right (RTL) VerticalFlyout
  // derives its x from viewWidth, which this reclaim would shift along with the scrollbar.
  //
  // `toolboxWidth - flyoutWidth` is the same number the userstyle already publishes as
  // --sa-category-width (60 by default, 0 with the `columns` addon, which stretches the flyout
  // across the toolbox), so the boundary always matches the strip the palette really covers.
  //
  // Switching between the two boundaries does not move the content: absoluteLeft is added to the
  // canvas translate as well, and Scrollbar.resize keeps the scroll position as a fixed point, so
  // the shifted viewport edge and the shifted canvas cancel out -- only the scrollbar's start and
  // the reachable extent change.
  const originalGetTopLevelMetrics = Blockly.WorkspaceSvg.getTopLevelWorkspaceMetrics_;

  // Whether the palette is currently slid away, i.e. whether the strip it left behind is ours to
  // hand to the workspace. Kept in sync with the `sa-flyoutClose` class (see the MutationObserver in
  // the waitForElement loop) rather than read per call, so the metrics function stays allocation-
  // and DOM-free.
  let flyoutHidden = false;

  // Toggling the addon or sliding the flyout flips which metrics the workspace reports, and nothing
  // recomputes the scrollbars on its own, so push the layout through Blockly whenever that happens.
  function refreshWorkspaceLayout() {
    const workspace = addon.tab.traps.getWorkspace();
    if (workspace) Blockly.svgResize(workspace);
  }

  function setFlyoutHidden(hidden) {
    if (flyoutHidden === hidden) return;
    flyoutHidden = hidden;
    refreshWorkspaceLayout();
  }

  let insideMetrics = false;
  function getTopLevelMetricsWithSwallowedFlyout() {
    const toolbox = this.toolbox_;
    if (
      insideMetrics ||
      addon.self.disabled ||
      !flyoutHidden ||
      !toolbox ||
      this.toolboxPosition !== Blockly.TOOLBOX_AT_LEFT
    ) {
      return originalGetTopLevelMetrics.call(this);
    }
    const flyout = this.getFlyout ? this.getFlyout() : null;
    const swallowed = flyout && typeof flyout.getWidth === "function" ? flyout.getWidth() : 0;
    if (!swallowed) return originalGetTopLevelMetrics.call(this);
    const realGetWidth = toolbox.getWidth;
    const realWidth = realGetWidth.call(toolbox);
    toolbox.getWidth = () => realWidth - swallowed;
    insideMetrics = true;
    try {
      return originalGetTopLevelMetrics.call(this);
    } finally {
      insideMetrics = false;
      toolbox.getWidth = realGetWidth;
    }
  }
  Blockly.WorkspaceSvg.getTopLevelWorkspaceMetrics_ = getTopLevelMetricsWithSwallowedFlyout;

  function getSpeedValue() {
    let data = {
      none: "0",
      short: "0.2",
      default: "0.3",
      long: "0.5",
    };
    return data[addon.settings.get("speed")];
  }

  function getToggleSetting() {
    return addon.settings.get("toggle");
  }

  function setTransition(speed) {
    for (let element of [flyOut, scrollBar]) {
      element.style.transitionDuration = `${speed}s`;
    }
  }

  function removeTransition() {
    for (let element of [flyOut, scrollBar]) {
      element.style.removeProperty("transition-duration");
    }
  }

  function updateLockDisplay() {
    lockObject.classList.toggle("locked", flyoutLock);
    lockButton.title = flyoutLock ? msg("unlock") : msg("lock");
    lockIcon.src = addon.self.getResource(`/${flyoutLock ? "" : "un"}lock.svg`) /* rewritten by pull.js */;
  }

  function autoLock() {
    const option = addon.settings.get("lockLoad");
    if (option) {
      if (getToggleSetting() === "category") {
        toggle = true;
      } else {
        flyoutLock = option;
        updateLockDisplay();
      }
      flyOut.classList.remove("sa-flyoutClose");
      scrollBar.classList.remove("sa-flyoutClose");
    }
  }

  function onmouseenter(e, speed = {}) {
    // If a mouse event was passed, only open flyout if the workspace isn't being dragged
    if (
      !e ||
      e.buttons === 0 ||
      document.querySelector(".blocklyToolboxDiv").className.includes("blocklyToolboxDelete")
    ) {
      speed = typeof speed === "object" ? getSpeedValue() : speed;
      setTransition(speed);
      flyOut.classList.remove("sa-flyoutClose");
      scrollBar.classList.remove("sa-flyoutClose");
      setTimeout(() => {
        addon.tab.traps.getWorkspace()?.recordCachedAreas();
        removeTransition();
      }, speed * 1000);
    }
    closeOnMouseUp = false; // only close if the mouseup event happens outside the flyout
  }

  function onmouseleave(e, speed = getSpeedValue()) {
    if (flyoutLock) return;
    if (e && e.buttons) {
      // dragging a block or scrollbar
      closeOnMouseUp = true;
      return;
    }
    setTransition(speed);
    flyOut.classList.add("sa-flyoutClose");
    scrollBar.classList.add("sa-flyoutClose");
    setTimeout(() => {
      addon.tab.traps.getWorkspace()?.recordCachedAreas();
      removeTransition();
    }, speed * 1000);
  }

  const updateIsFullScreen = () => {
    const isFullScreen = addon.tab.redux.state.scratchGui.mode.isFullScreen;
    document.documentElement.classList.toggle("sa-hide-flyout-not-fullscreen", !isFullScreen);
  };
  updateIsFullScreen();

  let didOneTimeSetup = false;
  function doOneTimeSetup() {
    if (didOneTimeSetup) {
      return;
    }
    didOneTimeSetup = true;

    addon.tab.redux.initialize();
    addon.tab.redux.addEventListener("statechanged", (e) => {
      switch (e.detail.action.type) {
        // Event casted when you switch between tabs
        case "scratch-gui/navigation/ACTIVATE_TAB": {
          // always 0, 1, 2
          const toggleSetting = getToggleSetting();
          if (
            e.detail.action.activeTabIndex === 0 &&
            !addon.self.disabled &&
            (toggleSetting === "hover" || toggleSetting === "cathover")
          ) {
            onmouseleave(null, 0);
            toggle = false;
          }
          break;
        }
        case "scratch-gui/mode/SET_FULL_SCREEN":
          updateIsFullScreen();
          break;
      }
    });

    document.body.addEventListener("mouseup", () => {
      if (closeOnMouseUp) {
        onmouseleave();
        closeOnMouseUp = false;
      }
    });

    if (addon.self.enabledLate && getToggleSetting() === "category" && !addon.settings.get("lockLoad")) {
      Blockly.getMainWorkspace().getToolbox().selectedItem_.setSelected(false);
    }
    addon.self.addEventListener("disabled", () => {
      Blockly.getMainWorkspace().getToolbox().selectedItem_.setSelected(true);
      refreshWorkspaceLayout();
    });
    addon.self.addEventListener("reenabled", () => {
      if (getToggleSetting() === "category" && !addon.settings.get("lockLoad")) {
        Blockly.getMainWorkspace().getToolbox().selectedItem_.setSelected(false);
        onmouseleave(null, 0);
        toggle = false;
      }
      refreshWorkspaceLayout();
    });

    addon.settings.addEventListener("change", () => {
      if (addon.self.disabled) return;
      if (getToggleSetting() === "category") {
        // switching to category click mode
        // close the flyout unless it's locked
        if (flyoutLock) {
          toggle = true;
          flyoutLock = false;
          updateLockDisplay();
        } else {
          Blockly.getMainWorkspace().getToolbox().selectedItem_.setSelected(false);
          onmouseleave(null, 0);
          toggle = false;
        }
      } else {
        // switching from category click to a different mode
        if (addon.settings.get("lockLoad")) {
          flyoutLock = true;
          updateLockDisplay();
        } else {
          onmouseleave();
        }
        Blockly.getMainWorkspace().getToolbox().selectedItem_.setSelected(true);
      }
    });

    // category click mode
    const oldSetSelectedItem = Blockly.Toolbox.prototype.setSelectedItem;
    Blockly.Toolbox.prototype.setSelectedItem = function (item, shouldScroll = true) {
      const previousSelection = this.selectedItem_;
      oldSetSelectedItem.call(this, item, shouldScroll);
      if (addon.self.disabled || getToggleSetting() !== "category") return;
      if (!shouldScroll && !toggle) {
        // ignore initial selection when updating the toolbox
        item.setSelected(false);
      } else if (item === previousSelection) {
        toggle = !toggle;
        if (toggle) onmouseenter();
        else {
          onmouseleave();
          item.setSelected(false);
        }
      } else if (!toggle) {
        scrollAnimation = false;
        toggle = true;
        onmouseenter();
      }
    };

    const oldSelectCategoryById = Blockly.Toolbox.prototype.selectCategoryById;
    Blockly.Toolbox.prototype.selectCategoryById = function (...args) {
      // called after populating the toolbox
      // ignore if the palette is closed
      if (!addon.self.disabled && getToggleSetting() === "category" && !toggle) return;
      return oldSelectCategoryById.call(this, ...args);
    };

    const oldStepScrollAnimation = Blockly.Flyout.prototype.stepScrollAnimation;
    Blockly.Flyout.prototype.stepScrollAnimation = function (...args) {
      // scrolling should not be animated when opening the flyout in category click mode
      if (!scrollAnimation) {
        this.scrollbar_.set(this.scrollTarget);
        this.scrollTarget = null;
        scrollAnimation = true;
        return;
      }
      return oldStepScrollAnimation.apply(this, args);
    };
  }
  // Mirrors the flyout's width into CSS, for the three rules that need it:
  // .sa-flyout-placeHolder (width), .sa-flyoutClose (margin-left) and .sa-lock-object (transform).
  //
  // PERF: this runs from a ResizeObserver, i.e. on every frame of a block palette width drag.
  // Writing the custom property on [class*="gui_tabs_"] -- the react-tabs root that wraps the
  // whole blocks pane, including the workspace SVG with every block in the project -- invalidated
  // the computed style of that entire subtree on each frame, so the next forced layout (Blockly
  // reads bounding boxes while it repositions) had to re-style every block. The cost therefore
  // grew with the size of the project and made resizing the palette stutter badly. Set it on the
  // elements that actually consume it instead: the invalidation then stays inside the palette,
  // whose contents (one category) do not depend on how many blocks the project has.
  function updateFlyoutWidth(force = false) {
    if (!flyOut) return;
    const actualWidth = flyOut.width.baseVal.value;
    // The ResizeObserver may deliver more than once per frame; only touch style when it changed.
    if (!force && actualWidth === lastFlyoutWidth) return;
    lastFlyoutWidth = actualWidth;
    const value = `${actualWidth}px`;
    for (const element of [flyOut, scrollBar, placeHolderDiv]) {
      if (element) element.style.setProperty("--sa-flyout-width", value);
    }
  }
  while (true) {
    flyOut = await addon.tab.waitForElement(".blocklyFlyout", {
      markAsSeen: true,
      reduxEvents: [
        "scratch-gui/mode/SET_PLAYER",
        "scratch-gui/locales/SELECT_LOCALE",
        "scratch-gui/theme/SET_THEME",
        "scratch-gui/mode/SET_FULL_SCREEN",
        "fontsLoaded/SET_FONTS_LOADED",
      ],
      reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
    });
    
    if (typeof ResizeObserver !== 'undefined') {
      // The loop body re-runs whenever the editor is rebuilt; drop the previous observer first so
      // it does not keep observing (and retaining) a detached flyout.
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(() => {
        updateFlyoutWidth();
      });
      resizeObserver.observe(flyOut);
    }
    // The reclaimed strip is only ours while the palette is gone, so the workspace layout has to be
    // pushed through Blockly again each time the flyout opens or closes. Everything that changes
    // that state -- hover, category click, the lock button, a settings change, the redux handlers --
    // ends up toggling the `sa-flyoutClose` class, so a single observer on that attribute covers
    // all of them instead of sprinkling calls over each code path.
    if (flyoutClassObserver) flyoutClassObserver.disconnect();
    flyoutClassObserver = new MutationObserver(() => {
      setFlyoutHidden(flyOut.classList.contains("sa-flyoutClose"));
    });
    flyoutClassObserver.observe(flyOut, { attributes: true, attributeFilter: ["class"] });
    scrollBar = document.querySelector(".blocklyFlyoutScrollbar");
    const blocksWrapper = document.querySelector('[class*="gui_blocks-wrapper_"]');
    const injectionDiv = document.querySelector(".injectionDiv");

    // Code editor left border
    const borderElement1 = document.createElement("div");
    borderElement1.className = "sa-flyout-border-1";
    addon.tab.displayNoneWhileDisabled(borderElement1);
    injectionDiv.appendChild(borderElement1);
    const borderElement2 = document.createElement("div");
    borderElement2.className = "sa-flyout-border-2";
    addon.tab.displayNoneWhileDisabled(borderElement2);
    injectionDiv.appendChild(borderElement2);

    // Placeholder Div
    if (placeHolderDiv) placeHolderDiv.remove();
    placeHolderDiv = document.createElement("div");
    blocksWrapper.appendChild(placeHolderDiv);
    placeHolderDiv.className = "sa-flyout-placeHolder";
    placeHolderDiv.style.display = "none"; // overridden by userstyle if the addon is enabled
    // Both new consumers exist now (scrollBar above, placeHolderDiv just created), so seed the
    // width for them. Forced: the value cache may already hold the unchanged width.
    updateFlyoutWidth(true);

    // Lock image
    if (lockObject) lockObject.remove();
    lockObject = document.createElementNS(SVG_NS, "foreignObject");
    lockObject.setAttribute("class", "sa-lock-object");
    lockObject.style.display = "none"; // overridden by userstyle if the addon is enabled
    lockButton = document.createElement("button");
    lockButton.className = "sa-lock-button";
    lockIcon = document.createElement("img");
    lockIcon.alt = "";
    updateLockDisplay();
    lockButton.onclick = () => {
      flyoutLock = !flyoutLock;
      updateLockDisplay();
    };
    lockButton.appendChild(lockIcon);
    lockObject.appendChild(lockButton);
    flyOut.appendChild(lockObject);

    onmouseleave(null, 0);
    toggle = false;

    const toolbox = document.querySelector(".blocklyToolboxDiv");
    const addExtensionButton = document.querySelector("[class^=gui_extension-button-container_]");

    for (let element of [toolbox, addExtensionButton, flyOut, scrollBar]) {
      element.onmouseenter = (e) => {
        const toggleSetting = getToggleSetting();
        if (!addon.self.disabled && (toggleSetting === "hover" || toggleSetting === "cathover")) onmouseenter(e);
      };
      element.onmouseleave = (e) => {
        const toggleSetting = getToggleSetting();
        if (!addon.self.disabled && (toggleSetting === "hover" || toggleSetting === "cathover")) onmouseleave(e);
      };
    }
    placeHolderDiv.onmouseenter = (e) => {
      if (!addon.self.disabled && getToggleSetting() === "hover") onmouseenter(e);
    };
    placeHolderDiv.onmouseleave = (e) => {
      if (!addon.self.disabled && getToggleSetting() === "hover") onmouseleave(e);
    };

    doOneTimeSetup();
    autoLock();
    // Blockly copies the metrics function onto each workspace when it is constructed, so an editor
    // built before this addon loaded is still holding the original one. Re-point the live workspace;
    // editors built from here on pick the patched function up on their own.
    const mainWorkspace = addon.tab.traps.getWorkspace();
    if (mainWorkspace) mainWorkspace.getMetrics = getTopLevelMetricsWithSwallowedFlyout;
    // Seed the flag from the class the setup above ended up with: the observer only reports changes,
    // so an editor that is already showing a closed palette would otherwise be missed until the
    // flyout moves. The svgResize below covers the relayout, hence the direct assignment.
    flyoutHidden = flyOut.classList.contains("sa-flyoutClose");
    Blockly.svgResize(Blockly.getMainWorkspace());
  }
}
