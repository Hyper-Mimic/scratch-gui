// hm-project-analysis addon
// Integrates the project analysis tool as a self-contained addon.
//
// - Menu entry + redux state access are delegated to the shared, vanilla-DOM wheel in
//   src/addons/addon-helpers.js (same pattern as the background addon).
// - The panel itself is plain DOM (panel.js + views/): it is mounted into an addon modal's
//   `content` node, which scratch-gui never reconciles, so there is no React tree to keep in
//   sync -- and this fork's addon environment does not reliably deliver React synthetic events.
// - All panel text goes through the addon API's `msg()` (see messages.js), so the
//   `hm-project-analysis/*` entries in src/addons/addons-l10n/*.json keep working unchanged.

import toolboxIcon from '!url-loader?{"esModule":false}!./analysis.svg';
import {getReduxState} from '../../addon-helpers.js';
// 跨插件单弹窗守卫：打开本插件弹窗时关闭其它插件的弹窗
import {registerAddonModal, unregisterAddonModal} from '../../../lib/addon-modal-guard.js';
import {AnalysisRunner, readSettings} from './analysis-runner.js';
import {AnalysisPanel} from './panel.js';
import {createTranslator} from './messages.js';
import {createBlockColorResolver} from './theme-colors.js';

// Built once at startup: returns the live, theme-aware block colour for a category, so the
// category bars track custom-editor-theme / editor-theme3.
let blockColorResolver = null;
// Tracks the open panel so re-clicking the toolbox button closes the previous one instead of
// stacking a second panel.
let analysisRemove = null;

const ADDON_ID = 'hm-project-analysis';

/**
 * @param {object} addon
 * @returns {string}
 */
const getProjectTitle = addon => {
    const state = getReduxState(addon);
    return (state && state.scratchGui && state.scratchGui.projectTitle) || '';
};

/**
 * @param {object} addon
 * @param {function(string, ?object): string} msg
 */
function openAnalysis (addon, msg) {
    // Self-guard: a second open closes the previous one instead of stacking.
    if (analysisRemove) {
        const previous = analysisRemove;
        analysisRemove = null;
        unregisterAddonModal(ADDON_ID, previous);
        previous();
    }

    const t = createTranslator(msg);
    const {container, content, closeButton, backdrop, remove} = addon.tab.createModal(
        msg('menuLabel') || 'Project Analysis',
        {isOpen: true}
    );
    analysisRemove = remove;
    registerAddonModal(ADDON_ID, remove);

    // Constrain the modal size: the base .modal-content class has no width, so without this the
    // modal fills the entire screen. Layout is a fixed-height flex column where only the tab
    // body scrolls (single scrollbar) -- the outer `content` must NOT scroll, otherwise it
    // stacks a second scrollbar with the inner .tabContent.
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

    // One settings snapshot per open, shared by the panel (what to show) and the runner (how to
    // group variables & lists), so the two can never disagree.
    const settings = readSettings(addon);

    const panel = new AnalysisPanel({
        t,
        messages: addon.messages,
        settings,
        getBlockColor: blockColorResolver,
        getProjectTitle: () => getProjectTitle(addon)
    });
    panel.mount(content);

    const state = getReduxState(addon);
    const vm = state && state.scratchGui && state.scratchGui.vm;

    const runner = new AnalysisRunner({
        vm,
        getSettings: () => settings,
        onLoading: () => panel.setLoading(),
        onResult: result => panel.setResult(result),
        onError: textMessage => panel.setError(textMessage)
    });

    const close = () => {
        unregisterAddonModal(ADDON_ID, remove);
        analysisRemove = null;
        addon.self.removeEventListener('reenabled', close);
        runner.destroy();
        panel.destroy();
        remove();
    };

    // Close handlers BEFORE the first analysis so the modal is always closable.
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    // Force-close the modal on a locale switch. `msg()` memoises its formatted messages per
    // addon, and the panel is already-built DOM, so the strings on screen would go stale.
    // Closing is the simplest correct behaviour -- same convention as the todo addon.
    addon.self.addEventListener('reenabled', close);

    runner.bind();

    // A tick before analysing: `vm.toJSON()` is synchronous and can be heavy on a large project,
    // so let the modal paint (and the "Analyzing..." state appear) first.
    setTimeout(() => runner.run(), 10);
}

export default async function ({addon, msg}) {
    try {
        const Blockly = await addon.tab.traps.getBlockly();
        const workspace = addon.tab.traps.getWorkspace();
        blockColorResolver = createBlockColorResolver(Blockly, workspace);
    } catch (e) {
        blockColorResolver = null;
    }

    // Surface the analysis tool as a button in the workspace toolbox (top-right corner). The
    // icon is inlined by url-loader as a base64 data URI and rendered in an <img> by the
    // toolbox, which flips it for the dark theme.
    // 抽成函数：切语言时框架派发 `reenabled`，需重新注册以刷新 label（registry 按 id 去重，
    // 重注册会触发 toolbox 浮层 _refresh 刷新 title/aria-label，设置面板顺序也随之刷新）。
    function registerToolboxButton() {
        addon.tab.addWorkspaceToolboxButton({
            id: 'project-analysis',
            label: msg('menuLabel') || 'Project Analysis',
            icon: toolboxIcon,
            action: () => openAnalysis(addon, msg)
        });
    }
    registerToolboxButton();

    // 切语言后刷新工具箱按钮文案：registry 按 id 去重，重注册即触发 toolbox 浮层
    // _refresh 更新 title/aria-label，高级设置的「排列顺序」面板也随 notify 重绘。
    // 必须注册在顶层作用域——工具箱按钮在 init 就存在，不依赖分析弹窗是否打开，
    // 若放进 openAnalysis 则仅在点开过弹窗后才注册，切语言时不会刷新。
    addon.self.addEventListener('reenabled', registerToolboxButton);
}
