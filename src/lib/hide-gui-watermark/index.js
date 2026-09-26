/**
 * "Hide GUI watermark".
 *
 * Driven by the HyperMimic "hide GUI watermark" setting (src/lib/hypermimic-settings.js,
 * key `hideGuiWatermark`, boolean) rather than an addon: the advanced settings modal is its
 * UI, so it has to work without anything being installed.
 *
 * When enabled, it hides the small sprite watermark shown in the top-left corner of the block
 * workspace. The watermark lives in a <Box id="gui_watermark"> in src/components/gui/gui.jsx,
 * which is why the id is hard-coded here.
 */

import {
    getSetting,
    onSettingsChange,
    SETTING_HIDE_GUI_WATERMARK
} from '../hypermimic-settings.js';

const WATERMARK_ID = 'gui_watermark';

const apply = value => {
    if (typeof document === 'undefined') return;
    const watermark = document.getElementById(WATERMARK_ID);
    if (!watermark) return;
    watermark.style.display = value ? 'none' : '';
};

let observer = null;

/**
 * Applies the saved value and keeps it in sync from then on.
 * Safe to call once, when the editor interface comes up.
 */
const initHideGuiWatermark = () => {
    if (typeof document === 'undefined') return;

    const current = () => getSetting(SETTING_HIDE_GUI_WATERMARK);
    apply(current());

    // The watermark <Box> is recreated when React re-renders the GUI (e.g. a locale switch
    // rebuilds the tree), which drops the inline `display` we set. Re-apply whenever the DOM
    // changes so a freshly-mounted watermark is hidden again.
    observer = new MutationObserver(() => apply(current()));
    observer.observe(document.body, {childList: true, subtree: true});

    onSettingsChange((key, value) => {
        if (key === SETTING_HIDE_GUI_WATERMARK) {
            apply(value);
        }
    });
};

export {
    initHideGuiWatermark
};
