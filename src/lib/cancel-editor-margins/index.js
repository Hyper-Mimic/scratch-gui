/**
 * Cancels the editor's margins and borders.
 *
 * A HyperMimic-only setting (src/lib/hypermimic-settings.js) rather than an addon: the
 * advanced settings modal is its UI, so it has to work without anything being installed.
 *
 * All this module does is toggle a class on <body>; the rules live in
 * ./cancel-editor-margins.css. It also nudges Blockly to re-measure, because removing the
 * stage column's padding hands about a rem back to the code area.
 */

import './cancel-editor-margins.css';
import {getSetting, onSettingsChange, SETTING_CANCEL_EDITOR_MARGINS} from '../hypermimic-settings.js';

const CLASS_NAME = 'hm-cancel-editor-margins';

const apply = enabled => {
    document.body.classList.toggle(CLASS_NAME, Boolean(enabled));
};

// Dropping the padding changes the width of the code area, and Blockly only re-measures its
// workspace SVG on a window resize. Wait two frames so the new layout is settled first.
const resize = () => {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    });
};

/**
 * Applies the saved value and keeps <body> in sync from then on.
 * Safe to call once, when the editor interface comes up.
 */
const initCancelEditorMargins = () => {
    if (typeof document === 'undefined') return;
    apply(getSetting(SETTING_CANCEL_EDITOR_MARGINS));
    resize();
    onSettingsChange((key, value) => {
        if (key === SETTING_CANCEL_EDITOR_MARGINS) {
            apply(value);
            resize();
        }
    });
};

export {
    initCancelEditorMargins
};
