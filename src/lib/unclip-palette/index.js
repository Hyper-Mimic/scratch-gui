/**
 * "Unclip Block Palette".
 *
 * Driven by the HyperMimic "block palette style" setting (src/lib/hypermimic-settings.js,
 * key `blockPaletteStyle`, value `unclip`) rather than an addon: the advanced settings modal
 * is its UI, so it has to work without anything being installed.
 *
 * When the `unclip` style is selected, the block palette flyout is allowed to overflow its
 * edge and Blockly's clipping rectangle is widened, so blocks wider than the palette show in
 * full while the palette (or its flyout) is hovered. Other styles (default / resize) keep
 * Blockly's default clipping.
 *
 * The CSS is injected as a raw <style> element (not through webpack's CSS Modules), because
 * the selectors target Blockly's literal class names (.blocklyFlyout, #blocklyBlockMenuClipRect)
 * which CSS Modules would otherwise rewrite.
 */

import {
    getSetting,
    onSettingsChange,
    SETTING_BLOCK_PALETTE_STYLE,
    BLOCK_PALETTE_STYLE_UNCLIP
} from '../hypermimic-settings.js';

const ELEMENT_ID = 'hm-unclip-palette';

// While the block palette toolbox or its flyout is hovered, let the flyout paint past its
// edge and widen Blockly's menu clip rect so wide blocks are not cut off.
const CSS = `
.injectionDiv:has(> .blocklyToolboxDiv:hover, > svg.blocklyFlyout:not(.sa-flyoutClose):hover)
  > svg.blocklyFlyout:not(.sa-flyoutClose) {
    overflow: visible;
}
.injectionDiv:has(> .blocklyToolboxDiv:hover, > svg.blocklyFlyout:not(.sa-flyoutClose):hover)
  #blocklyBlockMenuClipRect {
    width: 100000px;
}
`;

const apply = value => {
    if (typeof document === 'undefined') return;
    const enabled = value === BLOCK_PALETTE_STYLE_UNCLIP;
    const existing = document.getElementById(ELEMENT_ID);
    if (enabled) {
        if (existing) return;
        const style = document.createElement('style');
        style.id = ELEMENT_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    } else if (existing) {
        existing.remove();
    }
};

/**
 * Applies the saved value and keeps the style in sync from then on.
 * Safe to call once, when the editor interface comes up.
 *
 * The unclip is driven by the "block palette style" setting: only the `unclip` value
 * enables it, everything else (default / resize) keeps Blockly's default clipping.
 */
const initUnclipPalette = () => {
    if (typeof document === 'undefined') return;
    apply(getSetting(SETTING_BLOCK_PALETTE_STYLE));
    onSettingsChange((key, value) => {
        if (key === SETTING_BLOCK_PALETTE_STYLE) {
            apply(value);
        }
    });
};

export {
    initUnclipPalette
};
