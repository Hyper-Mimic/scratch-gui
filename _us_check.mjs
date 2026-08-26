// hm-project-analysis addon
// Integrates the project analysis tool as a self-contained addon.
//
// - Menu entry + redux state access are delegated to the shared, vanilla-DOM
//   wheel in src/addons/addon-helpers.js (same pattern as the background addon).
// - The analysis panel itself is a React component rendered into the modal
//   content node. JSX in this .js file compiles fine (babel preset-react covers
//   *.js under src/); React is only used here for the heavy data-display UI.

import React from 'react';
import ReactDOM from 'react-dom';
import { IntlProvider } from 'react-intl';
import ProjectAnalysis from './ProjectAnalysis.js';
import { getReduxState, injectMenuItem } from '../../addon-helpers.js';

const MENU_ITEM_CLASS = 'hm-pa-menu-item';
const MENU_LABEL_CLASS = 'settings-menu_submenu-label_addons-hm-pa';

// The analysis panel is a React component rendered into the modal's `content`
// node (a plain, vanilla-DOM node we fully own — scratch-gui does not reconcile
// it). FormattedMessage / injectIntl read `intl` from React legacy context, so
// we wrap the panel in react-intl's real <IntlProvider> to get a complete `intl`
// instance (including formatHTMLMessage, which is required by intlShape). The
// panel only uses defaultMessage fallbacks, so an empty `messages` map is fine.

function openAnalysis(addon, msg) {
    const { container, content, closeButton, backdrop, remove } = addon.tab.createModal(
        msg('menuLabel') || 'Project Analysis',
        { isOpen: true }
    );

    // Correct redux access for this fork: addon.tab.redux.state (NOT .getState()).
    const state = getReduxState(addon);
    const vm = state.scratchGui.vm;
    const projectTitle = state.scratchGui.projectTitle;
    const locale = (state.scratchGui.locales && state.scratchGui.locales.locale) || 'en';

    // Read addon settings (declared in _manifest_entry.js) and pass them to the
    // analysis panel. The plugin's settings are managed from its addon-settings
    // page, not from inside this modal.
    const settings = {
        showFileName: addon.settings.get('showFileName'),
        showSpriteCount: addon.settings.get('showSpriteCount'),
        showCostumeCount: addon.settings.get('showCostumeCount'),
        showSoundCount: addon.settings.get('showSoundCount'),
        showBlocksNum: addon.settings.get('showBlocksNum'),
        showEffectiveBlocksNum: addon.settings.get('showEffectiveBlocksNum'),
        showScriptsNum: addon.settings.get('showScriptsNum'),
        showEffectiveScriptsNum: addon.settings.get('showEffectiveScriptsNum'),
        showExtensionsInfo: addon.settings.get('showExtensionsInfo'),
        showSpecificExtensions: addon.settings.get('showSpecificExtensions'),
        showVarDefinitionsNum: addon.settings.get('showVarDefinitionsNum'),
        showListDefinitionsNum: addon.settings.get('showListDefinitionsNum'),
        showFuncDefinitionsNum: addon.settings.get('showFuncDefinitionsNum'),
        betterProgressBar: addon.settings.get('betterProgressBar'),
        orderType: addon.settings.get('orderType'),
        datadisplayway: addon.settings.get('datadisplayway')
    };

    // Constrain the modal size: the base .modal-content class has no width, so
    // without this the modal fills the entire screen.
    container.style.maxWidth = '760px';
    container.style.width = '90vw';
    container.style.maxHeight = '85vh';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    content.style.flex = '1 1 auto';
    content.style.overflowY = 'auto';

    const close = () => {
        try {
            ReactDOM.unmountComponentAtNode(content);
        } catch (e) {
            // ignore
        }
        remove();
    };

    // Attach close handlers BEFORE rendering so the modal is always closable,
    // even if rendering happens to throw.
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    try {
        ReactDOM.render(
            <IntlProvider locale={locale} messages={{}}>
                <ProjectAnalysis
                    isOpen={true}
                    onRequestClose={close}
                    vm={vm}
                    projectTitle={projectTitle}
                    settings={settings}
                />
            </IntlProvider>,
            content
        );
    } catch (e) {
        console.error('[hm-project-analysis] failed to render panel:', e);
        content.textContent = 'Failed to load Project Analysis panel.';
    }
}

export default async function ({ addon, msg }) {
    // Inject the entry into the "File" drop-down menu (id="file") and keep it
    // alive across menu re-opens (the menu is recreated every time it opens).
    injectMenuItem({
        addon,
        msg,
        menuId: 'file',
        itemClass: MENU_ITEM_CLASS,
        labelClass: MENU_LABEL_CLASS,
        labelKey: 'menuLabel',
        labelDefault: 'Project Analysis',
        onClick: () => openAnalysis(addon, msg)
    });
}
