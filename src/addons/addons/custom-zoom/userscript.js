export default async function ({ addon, console }) {
  await addon.tab.traps.getBlockly();

  // The EDITOR's workspace. `Blockly.getMainWorkspace()` follows the last injection, which is the
  // "make a new block" dialog's workspace while that dialog is open -- the zoom options, the native
  // zoom group and the hover area all belong to the editor's workspace, not the dialog's.
  const getMainWorkspace = () =>
    (addon.tab.traps.getWorkspace && addon.tab.traps.getWorkspace()) || Blockly.getMainWorkspace();

  let controlsRect;
  let previousIsHovered = false;
  const speeds = {
    none: "0s",
    short: "0.2s",
    default: "0.3s",
    long: "0.5s",
  };

  const customZoomAreaElement = document.createElement("div");
  customZoomAreaElement.className = "sa-custom-zoom-area";

  // Puts the hover area into whichever .injectionDiv is on screen right now, and makes the native
  // group carry the hidden class for the current autohide setting. Idempotent: called on every
  // update, and again for a few frames after one, because a block theme switch rebuilds the whole
  // Blocks component -- that rebuild is what throws the old injection div (and the hover area
  // inside it) away, and the redux event that triggers update() fires before React commits it.
  let attachedGroup = null;

  function attachHoverArea() {
    if (addon.settings.get("autohide") !== true) return false;
    // The main workspace's own injection div: the "make a new block" dialog hosts a second
    // workspace, and a bare querySelector can land on that one (it comes first in the document),
    // which leaves the hover area sitting in the dialog instead of the editor corner.
    const workspace = getMainWorkspace();
    const injectionDiv = (workspace && workspace.getInjectionDiv && workspace.getInjectionDiv()) ||
      document.querySelector(".injectionDiv");
    if (!injectionDiv) return false;
    if (customZoomAreaElement.parentNode !== injectionDiv) {
      injectionDiv.appendChild(customZoomAreaElement);
    }
    // A rebuilt workspace comes with a fresh .blocklyZoom that never got the class. Only the new
    // element is touched, and it starts in the state the pointer is actually in -- re-applying it
    // every frame would fight an onMouseMove that has already revealed the controls.
    const group = getZoomControls();
    if (group && group !== attachedGroup) {
      attachedGroup = group;
      group.classList.toggle("sa-custom-zoom-hidden", !previousIsHovered);
    }
    updateRect();
    observeWorkspace(injectionDiv);
    document.addEventListener("mousemove", onMouseMove);
    return true;
  }

  function update() {
    document.removeEventListener("mousemove", onMouseMove);

    if (addon.tab.editorMode !== "editor") return;

    // During a rebuild (block theme switch, sprite switch) the workspace can be gone for a moment.
    // Dereferencing it here used to throw out of the update's caller, and because that caller is
    // the body of the `while (true)` wait loop, the loop ended for good -- the addon then never
    // reacted to anything again. Bail out instead; the next wait round picks it up.
    const workspace = getMainWorkspace();
    if (!workspace || !workspace.options || !workspace.options.zoomOptions) return;
    workspace.options.zoomOptions.maxScale = addon.settings.get("maxZoom") / 100;
    workspace.options.zoomOptions.minScale = addon.settings.get("minZoom") / 100;
    workspace.options.zoomOptions.startScale = addon.settings.get("startZoom") / 100;
    workspace.options.zoomOptions.scaleSpeed = 1 + 0.2 * (addon.settings.get("zoomSpeed") / 100);

    const svgGroup = getZoomControls();
    const autohide = addon.settings.get("autohide");
    if (svgGroup) svgGroup.classList.toggle("sa-custom-zoom-hidden", autohide);
    if (autohide) {
      attachHoverArea();
      // A theme switch reaches here before the rebuilt workspace is in the DOM; the next frames
      // put the hover area into the new injection div instead of the discarded one.
      for (let frame = 0; frame < 3; frame++) {
        requestAnimationFrame(attachHoverArea);
      }
    } else if (workspaceObserver) {
      // Nothing to follow while the controls are always visible.
      workspaceObserver.disconnect();
      workspaceObserver = null;
    }
  }

  // The hover area is pinned to the bottom-right of the workspace, and the workspace can now be
  // resized without the window changing at all (the stage column divider), so the cached rectangle
  // has to follow the container itself. rAF-throttled: a resize observer fires on every frame of a
  // drag, and the rect is only read by the mousemove handler.
  let workspaceObserver = null;
  let rectFrame = 0;

  function observeWorkspace(element) {
    if (workspaceObserver) workspaceObserver.disconnect();
    workspaceObserver = new ResizeObserver(() => {
      if (rectFrame) return;
      rectFrame = requestAnimationFrame(() => {
        rectFrame = 0;
        updateRect();
      });
    });
    workspaceObserver.observe(element);
  }

  function getZoomControls() {
    const wrap = getMainWorkspace();
    const zoomControls = wrap && wrap.zoomControls_;
    if (zoomControls) return zoomControls.svgGroup_;
    return null;
  }

  function onMouseMove(e) {
    // No rect yet (the hover area was just re-attached, or the workspace is mid-rebuild): nothing
    // meaningful to compare against, so leave the current state alone.
    if (!controlsRect) return;
    const isHovered =
      e.x > controlsRect.left && e.x < controlsRect.right && e.y > controlsRect.top && e.y < controlsRect.bottom;
    if (isHovered !== previousIsHovered) {
      previousIsHovered = isHovered;
      const svgGroup = getZoomControls();
      if (svgGroup) {
        svgGroup.style.setProperty("--sa-custom-zoom-speed", speeds[addon.settings.get("speed")]);
        svgGroup.classList.toggle("sa-custom-zoom-hidden", !isHovered);
      }
    }
  }

  function updateRect() {
    controlsRect = customZoomAreaElement.getBoundingClientRect();
  }

  function onResize() {
    if (addon.tab.editorMode === "editor" && addon.settings.get("autohide")) {
      updateRect();
    }
  }

  if (document.querySelector('[class^="backpack_backpack-container"]')) {
    window.dispatchEvent(new Event("resize"));
  }
  addon.settings.addEventListener("change", update);
  window.addEventListener("resize", onResize);
  while (true) {
    await addon.tab.waitForElement(".blocklyZoom", {
      markAsSeen: true,
      reduxEvents: [
        "scratch-gui/mode/SET_PLAYER",
        "scratch-gui/locales/SELECT_LOCALE",
        "scratch-gui/theme/SET_THEME",
        "fontsLoaded/SET_FONTS_LOADED",
      ],
      reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
    });
    // One bad round must not end the loop: an exception thrown here would reject this async
    // function and the addon would stay dead for the rest of the session (that is exactly what a
    // block theme switch used to cause).
    try {
      update();
    } catch (e) {
      console.warn("[custom-zoom] update failed", e);
    }
  }
}
