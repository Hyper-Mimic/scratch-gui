/**
 * Unifies every scrollbar in the editor behind one, theme-aware style.
 *
 * A HyperMimic-only setting (src/lib/hypermimic-settings.js, key `unifyScrollbars`)
 * rather than an addon: the advanced settings modal is its UI, so it has to work
 * without anything being installed.
 *
 * All this module does is toggle a class on <body>; the rules live in
 * ./unified-scrollbars.css. They are scoped to that body class and use attribute
 * selectors so the hashed class names of gui.css and friends still match, and so
 * the rule survives CSS Modules' class rewriting.
 */

import './unified-scrollbars.css';
import {getSetting, onSettingsChange, SETTING_UNIFY_SCROLLBARS} from '../hypermimic-settings.js';

const CLASS_NAME = 'hm-unified-scrollbars';

const apply = enabled => {
    document.body.classList.toggle(CLASS_NAME, Boolean(enabled));
};

/**
 * Applies the saved value and keeps <body> in sync from then on.
 * Safe to call once, when the editor interface comes up.
 */
const initUnifiedScrollbars = () => {
    if (typeof document === 'undefined') return;
    apply(getSetting(SETTING_UNIFY_SCROLLBARS));
    onSettingsChange((key, value) => {
        if (key === SETTING_UNIFY_SCROLLBARS) {
            apply(value);
        }
    });
};

export {
    initUnifiedScrollbars
};
