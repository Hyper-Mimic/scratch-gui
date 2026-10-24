import { normalizeHex, getHexRegex } from "../../libraries/common/cs/normalize-color.js";
import RateLimiter from "../../libraries/common/cs/rate-limiter.js";

export default async ({ addon, console, msg }) => {
  // 250-ms rate limit
  const rateLimiter = new RateLimiter(250);
  const setColor = (hex, element) => {
    hex = normalizeHex(hex);
    if (!addon.tab.redux.state || !addon.tab.redux.state.scratchGui) return;
    // The only way to reliably set color is to invoke eye dropper via click()
    // then faking that the eye dropper reported the value.
    const onEyeDropperClosed = ({ detail }) => {
      if (detail.action.type !== "scratch-gui/color-picker/DEACTIVATE_COLOR_PICKER") return;
      addon.tab.redux.removeEventListener("statechanged", onEyeDropperClosed);
      setTimeout(() => {
        document.body.classList.remove("sa-hide-eye-dropper-background");
      }, 50);
    };
    const onEyeDropperOpened = ({ detail }) => {
      if (detail.action.type !== "scratch-gui/color-picker/ACTIVATE_COLOR_PICKER") return;
      addon.tab.redux.removeEventListener("statechanged", onEyeDropperOpened);
      addon.tab.redux.addEventListener("statechanged", onEyeDropperClosed);
      setTimeout(() => {
        addon.tab.redux.dispatch({
          type: "scratch-gui/color-picker/DEACTIVATE_COLOR_PICKER",
          color: hex,
        });
      }, 50);
    };
    addon.tab.redux.addEventListener("statechanged", onEyeDropperOpened);
    document.body.classList.add("sa-hide-eye-dropper-background");
    element.click();
  };
  const addColorPicker = (editor) => {
    const content = ScratchBlocks.DropDownDiv.getContentDiv();
    // The wrapper below can be reached more than once for one open (Blockly re-shows the
    // drop-down when it has to be re-measured), so never build the row twice.
    if (!content || content.querySelector(".sa-color-picker")) return;
    const element = content.querySelector("button.scratchEyedropper");
    rateLimiter.abort(false);
    addon.tab.redux.initialize();
    const defaultColor = editor.getValue();
    const saColorPicker = Object.assign(document.createElement("div"), {
      className: "sa-color-picker sa-color-picker-code",
    });
    addon.tab.displayNoneWhileDisabled(saColorPicker, { display: "flex" });
    const saColorPickerColor = Object.assign(document.createElement("input"), {
      className: "sa-color-picker-color sa-color-picker-code-color",
      type: "color",
      value: defaultColor || "#000000",
    });
    const saColorPickerText = Object.assign(document.createElement("input"), {
      className: addon.tab.scratchClass("input_input-form", {
        others: "sa-color-picker-text sa-color-picker-code-text",
      }),
      type: "text",
      pattern: "^#?([0-9a-fA-F]{3}){1,2}$",
      placeholder: msg("hex"),
      value: defaultColor || "",
    });
    saColorPickerColor.addEventListener("input", () =>
      rateLimiter.limit(() => setColor((saColorPickerText.value = saColorPickerColor.value), element))
    );
    saColorPickerText.addEventListener("change", () => {
      const { value } = saColorPickerText;
      if (!getHexRegex().test(value)) return;
      setColor((saColorPickerColor.value = normalizeHex(value)), element);
    });
    saColorPicker.appendChild(saColorPickerColor);
    saColorPicker.appendChild(saColorPickerText);
    // Before the eyedropper button, i.e. last of the sliders. `content` is complete by now: this
    // runs while the drop-down is still being shown, not after.
    if (element) content.insertBefore(saColorPicker, element);
    else content.appendChild(saColorPicker);
  };
  const ScratchBlocks = await addon.tab.traps.getBlockly();

  // Hook the show, not `showEditor_`: the row has to exist BEFORE Blockly measures the box.
  //
  // Inserting it afterwards used to need `DropDownDiv.repositionForWindowResize()`, and that call
  // is what killed the open animation -- it sets `transition: none`, re-shows (which writes the
  // final transform), reads offsetHeight, then restores the transition. So the box jumped straight
  // to its final position and the slide-in never ran. Building the row up front means the height
  // is right the first time: nothing to reposition, and the animation is the vanilla one.
  const originalShow = ScratchBlocks.DropDownDiv.show;
  ScratchBlocks.DropDownDiv.show = function (owner, ...args) {
    if (owner instanceof ScratchBlocks.FieldColourSlider) addColorPicker(owner);
    return originalShow.call(this, owner, ...args);
  };

  const originalCallbackFactory = ScratchBlocks.FieldColourSlider.prototype.sliderCallbackFactory_;
  ScratchBlocks.FieldColourSlider.prototype.sliderCallbackFactory_ = function (...args) {
    const f = originalCallbackFactory.call(this, ...args);
    return (event) => {
      const r = f(event);
      const div = ScratchBlocks.DropDownDiv.getContentDiv();
      if (div) {
        const saColorPickerColor = div.querySelector(".sa-color-picker-color.sa-color-picker-code-color");
        const saColorPickerText = div.querySelector(".sa-color-picker-text.sa-color-picker-code-text");
        if (!saColorPickerColor || !saColorPickerText) return r;
        const color = this.getValue();
        saColorPickerColor.value = color || "#000000";
        saColorPickerText.value = color || "";
      }
      return r;
    };
  };
};
