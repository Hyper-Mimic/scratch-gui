/**
 * "Context menu style".
 *
 * Driven by the HyperMimic "context menu style" setting (src/lib/hypermimic-settings.js,
 * key `contextMenuStyle`, value `default` or `loose`) rather than an addon: the advanced
 * settings modal is its UI, so it has to work without anything being installed.
 *
 * The two options mirror the divergence between scratch-blocks/core/css.js (the "loose"
 * style that currently ships inside the blockly bundle) and css_old.js (the "default" /
 * original style). We do not load css_old.js at runtime; instead the `default` option
 * injects an override that reverts exactly the handful of declarations that differ.
 *
 * The CSS is injected as a raw <style> element (not through webpack's CSS Modules), because
 * the selectors target Blockly's literal class names (.blocklyContextMenu, .goog-menu,
 * .goog-menuitem) which CSS Modules would otherwise rewrite.
 */

import {
    getSetting,
    onSettingsChange,
    SETTING_CONTEXT_MENU_STYLE,
    CONTEXT_MENU_STYLE_DEFAULT
} from '../hypermimic-settings.js';

const ELEMENT_ID = 'hm-context-menu-style';

/*
 * Only the "default" (original) style needs overrides; "loose" is what css.js already ships,
 * so it needs nothing injected. Each rule reverts one css.js value back to css_old.js:
 *   - .blocklyContextMenu        border-radius 10px -> 4px
 *   - .blocklyWidgetDiv .goog-menu
 *       box-shadow  0 0 5px 1px rgba(0,0,0,0.2) -> none
 *       padding     7px 0 -> 4px 0
 *   - .blocklyWidgetDiv .goog-menuitem      padding 7px 7em 7px 28px -> 4px 7em 4px 28px
 *   - .blocklyDropDownDiv .goog-menuitem    padding 7px 7em 7px 28px -> 4px 7em 4px 28px
 *   - .blocklyWidgetDiv .goog-menuitem-highlight / .goog-menuitem-hover
 *       padding-top/bottom 6px -> 3px
 *
 * The GUI's own menu (react-contextmenu, styled by src/components/context-menu/context-menu.css)
 * is built from the same declarations, so it gets the same set of overrides and the two menus keep
 * matching whichever option is selected. Its elements are addressed by substring because its class
 * names carry a CSS Modules hash (`context-menu_menu-item_<hash>`); the double attribute selector
 * also outranks the module's own class, so the overrides win regardless of stylesheet order. The
 * addon-injected items (src/addons/contextmenu.js renders them with the same hashed classes) are
 * covered by the same selectors.
 */
const CSS = `
.blocklyContextMenu {
    border-radius: 4px;
}

.blocklyWidgetDiv .goog-menu {
    box-shadow: none;
    padding: 4px 0;
}

.blocklyWidgetDiv .goog-menuitem,
.blocklyDropDownDiv .goog-menuitem {
    padding: 4px 7em 4px 28px;
}

.blocklyWidgetDiv .goog-menuitem-highlight,
.blocklyWidgetDiv .goog-menuitem-hover {
    padding-top: 3px;
    padding-bottom: 3px;
}

[class*="react-contextmenu"][class*="context-menu_context-menu_"] {
    border-radius: 4px;
    box-shadow: none;
    padding: 4px 0;
}

[class*="react-contextmenu-item"][class*="context-menu_menu-item_"] {
    padding: 4px 7em 4px 28px;
}

[class*="react-contextmenu-item"][class*="context-menu_menu-item_"]:hover {
    padding-top: 3px;
    padding-bottom: 3px;
}

`;

const apply = value => {
    if (typeof document === 'undefined') return;
    const enabled = value === CONTEXT_MENU_STYLE_DEFAULT;
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
 */
const initContextMenuStyle = () => {
    if (typeof document === 'undefined') return;
    apply(getSetting(SETTING_CONTEXT_MENU_STYLE));
    onSettingsChange((key, value) => {
        if (key === SETTING_CONTEXT_MENU_STYLE) {
            apply(value);
        }
    });
};

export {
    initContextMenuStyle
};
