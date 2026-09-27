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
import { getReduxState } from '../../addon-helpers.js';
import toolboxIcon from '!url-loader?{"esModule":false}!./analysis.svg';
// 跨插件单弹窗守卫：打开本插件弹窗时关闭其它插件的弹窗
import { registerAddonModal, unregisterAddonModal } from '../../../lib/addon-modal-guard.js';

// Normalize a locale code so react-intl (2.9.0) and our translation maps agree.
// This fork stores Chinese as "zh_CN" (underscore); react-intl rejects that and
// silently falls back to "en", which breaks the JS-map block-category names.
// Map any "zh_CN"/"zh-CN" variant to the canonical "zh-cn" used by our maps.
const normalizeLocale = (loc) => {
    if (!loc) return 'en';
    const lower = String(loc).toLowerCase().replace('_', '-');
    if (lower === 'zh-cn' || lower === 'zhcn') return 'zh-cn';
    if (lower === 'zh-tw' || lower === 'zhtw') return 'zh-tw';
    return String(loc).replace('_', '-');
};

// The analysis panel is a React component rendered into the modal's `content`
// node (a plain, vanilla-DOM node we fully own — scratch-gui does not reconcile
// it). FormattedMessage / injectIntl read `intl` from React legacy context, so
// we wrap the panel in react-intl's real <IntlProvider> to get a complete `intl`
// instance (including formatHTMLMessage, which is required by intlShape). The
// panel reads real translations from the addon's merged locale map
// (api.js exposes it as `addon.messages`), keyed by `hm-project-analysis/<key>`.

// hm-project-analysis category names -> Blockly theme blockStyle keys.
// Used to fetch the *real* (currently themed) block color instead of a
// hardcoded table, mirroring recolor-custom-blocks' getBlocklyColors().
const CATEGORY_THEME_KEY = {
    motion: 'motion',
    looks: 'looks',
    sound: 'sounds',
    event: 'event',
    control: 'control',
    sensing: 'sensing',
    operator: 'operators',
    data: 'data',
    variable: 'data',
    list: 'data_lists',
    procedures: 'procedures',
    others: 'more',
    pen: 'pen'
};

// Resolver that returns the live, theme-aware block colour for a given
// category. Built once (the editor is always loaded by the time the user opens
// the panel). `null` means "no theme colour for this key" so the panel can fall
// back to its static table. Mirrors recolor-custom-blocks' dual Blockly path.
let blockColorResolver = null;
// Tracks the open panel so re-clicking the toolbox button closes the previous one
// instead of stacking a second panel.
let analysisRemove = null;

function openAnalysis(addon, msg) {
    // Self-guard: a second open closes the previous one instead of stacking.
    if (analysisRemove) {
        const previous = analysisRemove;
        analysisRemove = null;
        unregisterAddonModal('hm-project-analysis', previous);
        previous();
    }
    const { container, content, closeButton, backdrop, remove } = addon.tab.createModal(
        msg('menuLabel') || 'Project Analysis',
        { isOpen: true }
    );
    analysisRemove = remove;
    registerAddonModal('hm-project-analysis', remove);

    // Constrain the modal size: the base .modal-content class has no width, so
    // without this the modal fills the entire screen. Layout is a fixed-height
    // flex column where only the tab body scrolls (single scrollbar) — the outer
    // `content` must NOT scroll, otherwise it stacks a second scrollbar with the
    // inner `.tabContent`.
    container.style.maxWidth = '760px';
    container.style.width = '90vw';
    container.style.maxHeight = '85vh';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    content.style.flex = '1 1 auto';
    content.style.minHeight = '0';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.overflow = 'hidden';

    const close = () => {
        unregisterAddonModal('hm-project-analysis', remove);
        analysisRemove = null;
        addon.self.removeEventListener('reenabled', close);
        try {
            ReactDOM.unmountComponentAtNode(content);
        } catch (e) {
            // ignore
        }
        remove();
    };

    // Render (or re-render) the panel. Redux state, addon settings and locale are
    // read fresh on every call so the panel immediately reflects language /
    // setting changes. The framework dispatches `reenabled` on SELECT_LOCALE, so
    // listening here makes translations sync without reopening the modal.
    const renderPanel = () => {
        // Correct redux access for this fork: addon.tab.redux.state (NOT .getState()).
        const state = getReduxState(addon);
        const vm = state.scratchGui.vm;
        const projectTitle = state.scratchGui.projectTitle;
        const locale = normalizeLocale(
            (state.scratchGui.locales && state.scratchGui.locales.locale) || 'en'
        );

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

        try {
            ReactDOM.render(
                <IntlProvider locale={locale} messages={addon.messages}>
                    <ProjectAnalysis
                        isOpen={true}
                        onRequestClose={close}
                        vm={vm}
                        projectTitle={projectTitle}
                        settings={settings}
                        locale={locale}
                        getBlockColor={blockColorResolver}
                    />
                </IntlProvider>,
                content
            );
        } catch (e) {
            console.error('[hm-project-analysis] failed to render panel:', e);
            content.textContent = 'Failed to load Project Analysis panel.';
        }
    };

    // Close handlers BEFORE rendering so the modal is always closable.
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    // Force-close the modal on a locale switch. The framework dispatches
    // `reenabled` on SELECT_LOCALE; the panel is a React tree whose translations
    // come from `addon.messages`, which is mutated in place (same object ref), so
    // react-intl keeps stale strings. Closing is the simplest correct behaviour.
    addon.self.addEventListener('reenabled', close);

    renderPanel();
}

export default async function ({ addon, msg }) {
    // Build a resolver that returns the live, theme-aware block colour for a
    // given category. Mirrors recolor-custom-blocks' getBlocklyColors(): new
    // Blockly reads workspace.getTheme().blockStyles[key].colourPrimary (so it
    // tracks custom-editor-theme / editor-theme3), old Blockly uses
    // Blockly.Colours[key].primary. Returns null when no theme colour exists.
    try {
        const Blockly = await addon.tab.traps.getBlockly();
        const workspace = addon.tab.traps.getWorkspace();
        blockColorResolver = (category) => {
            const themeKey = CATEGORY_THEME_KEY[category] || category;
            if (Blockly.registry) {
                const style = workspace.getTheme().blockStyles[themeKey];
                if (style && style.colourPrimary) return style.colourPrimary;
            } else {
                const colors = Blockly.Colours[themeKey];
                if (colors && colors.primary) return colors.primary;
            }
            return null;
        };
    } catch (e) {
        blockColorResolver = null;
    }

    // Surface the analysis tool as a button in the workspace toolbox (top-right
    // corner). The icon is inlined by url-loader as a base64 data URI and rendered
    // in an <img> by the toolbox, which flips it for the dark theme.
    addon.tab.addWorkspaceToolboxButton({
        id: 'project-analysis',
        label: msg('menuLabel') || 'Project Analysis',
        icon: toolboxIcon,
        action: () => openAnalysis(addon, msg)
    });
}
