import toolboxIcon from '!url-loader?{"esModule":false}!./readme.svg';
import {renderBlocks, renderBlockPreviews} from '../../../lib/comment-markdown-editor/index.js';
import {placeTabIndicator, watchTabIndicator} from '../../../lib/tab-indicator.js';
import {registerAddonModal, unregisterAddonModal} from '../../../lib/addon-modal-guard.js';
import {
    getSetting,
    onSettingsChange,
    SETTING_AUTO_DISPLAY_README,
    SETTING_README_HTML_SUPPORT
} from '../../../lib/hypermimic-settings.js';

export default async ({addon, console}) => {
    const Blockly = await addon.tab.traps.getBlockly();
    const vm = addon.tab.traps.vm;

    // A README is just a Blockly workspace comment whose text starts with "#README". Reusing
    // comments means it is saved with the project, supports undo/redo, and serializes like any
    // other comment. Ported from AstraEditor.
    const README_SENTINEL = '#README';
    const PREFIX_LEN = README_SENTINEL.length; // 7
    const MAX_TAB_TITLE = 39;
    const MENU_LABEL = '添加 README';
    const MODAL_TITLE = 'README';

    // Track the open modal so a locale switch (reenabled) / disable can force-close it,
    // and so a second open closes the previous one instead of stacking two on top of each
    // other (the old bug: a stacked modal's reference got overwritten, so it could no longer
    // be closed -- "只能关闭前一个").
    let currentRemove = null;
    let currentEscapeHandler = null;

    // The right-click event, captured so "Add README" can drop the comment at the cursor.
    let lastContextEvent = null;
    document.addEventListener('contextmenu', (e) => {
        const ws = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
        const injectionDiv = ws && ws.getInjectionDiv();
        if (injectionDiv && injectionDiv.contains(e.target)) {
            lastContextEvent = e;
        }
    }, true);

    /**
     * Split a sprite's comments into README entries ({title, body}). Non-README comments are skipped.
     * "#README #<title>\n<body>" when a title is present, otherwise "#README \n<body>".
     */
    const parseReadmeComments = (comments) => {
        const result = [];
        for (const comment of Object.values(comments || {})) {
            const text = comment && comment.text;
            if (typeof text !== 'string' || text.slice(0, PREFIX_LEN) !== README_SENTINEL) continue;
            if (text.slice(PREFIX_LEN + 1, PREFIX_LEN + 2) === '#') {
                const rest = text.slice(PREFIX_LEN + 2);
                let title = '';
                let i = 0;
                for (; i < rest.length; i++) {
                    const ch = rest[i];
                    if (ch === '\n' || ch === '\r') break;
                    title += ch;
                }
                result.push({
                    title: title || undefined,
                    body: text.slice(PREFIX_LEN + 2 + title.length + 1)
                });
            } else {
                result.push({
                    title: undefined,
                    body: text.slice(PREFIX_LEN + 1)
                });
            }
        }
        return result;
    };

    const getEditingTarget = () => vm.runtime.getEditingTarget();

    /**
     * Create a README comment at the cursor on the main workspace. It is a normal
     * WorkspaceCommentSvg, so it lands inside the current sprite and is saved with the project.
     */
    const addReadmeAtCursor = (event) => {
        const ws = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
        if (!ws) return;
        const disabled = Blockly.Events.isEnabled();
        if (disabled) Blockly.Events.disable();
        // 自动给新 README 起标题：第 1 个 `#标题`，之后依次 `#标题2` / `#标题3`……
        // 编号按当前 sprite 已有 README 注释数量递增，保证不重名。
        const target = getEditingTarget();
        const existingCount = target ? parseReadmeComments(target.comments).length : 0;
        const newNumber = existingCount + 1;
        const titleSuffix = newNumber === 1 ? '' : String(newNumber);
        const initialText = `${README_SENTINEL} #标题${titleSuffix}\n\n`;
        const comment = new Blockly.WorkspaceCommentSvg(
            ws,
            initialText,
            Blockly.WorkspaceCommentSvg.DEFAULT_SIZE,
            240,
            false
        );
        try {
            const injectionDiv = ws.getInjectionDiv();
            const rect = injectionDiv.getBoundingClientRect();
            const clientX = (event && event.clientX) ||
                (lastContextEvent && lastContextEvent.clientX) || (rect.left + 120);
            const clientY = (event && event.clientY) ||
                (lastContextEvent && lastContextEvent.clientY) || (rect.top + 120);
            const origin = ws.getOriginOffsetInPixels();
            const px = (clientX - rect.left) - origin.x;
            const py = (clientY - rect.top) - origin.y;
            comment.moveBy(px / ws.scale, py / ws.scale);
            if (ws.rendered) {
                comment.initSvg();
                comment.render(false);
                comment.select();
            }
        } catch (err) {
            // Positioning is best-effort; a failure must not lose the comment.
            console.error('HyperMimic README: failed to position comment', err);
        }
        if (disabled) Blockly.Events.enable();
        Blockly.WorkspaceComment.fireCreateEvent(comment);
    };

    // Register the "Add README" context-menu item for empty workspace right-clicks. Gated by the
    // global setting so it tracks the toggle live.
    addon.tab.createBlockContextMenu((items) => {
        items.push({
            text: MENU_LABEL,
            enabled: true,
            callback: () => addReadmeAtCursor(lastContextEvent)
        });
        return items;
    }, {workspace: true});

    const closeReadme = () => {
        if (!currentRemove) return;
        const remove = currentRemove;
        currentRemove = null;
        unregisterAddonModal('readme', remove);
        if (currentEscapeHandler) {
            document.removeEventListener('keydown', currentEscapeHandler);
            currentEscapeHandler = null;
        }
        remove();
    };

    addon.self.addEventListener('reenabled', closeReadme);

    const truncateTitle = (title) =>
        (title && title.length > MAX_TAB_TITLE) ? `${title.slice(0, MAX_TAB_TITLE)}…` : title;

    const openReadme = () => {
        // Guard against stacking: if a modal is already open, close it first. Without this a
        // second open overwrites `currentRemove`, leaving the previous modal uncloseable.
        closeReadme();

        const target = getEditingTarget();
        const readmes = target ? parseReadmeComments(target.comments) : [];
        // 只有一个 README 时，在弹窗标题后追加“ - 标题”，让标题直接可见。
        const modalTitle = (readmes.length === 1 && readmes[0].title)
            ? `${MODAL_TITLE} - ${readmes[0].title}`
            : MODAL_TITLE;
        const {backdrop, container, content, closeButton, remove} = addon.tab.createModal(modalTitle, {
            isOpen: true
        });
        currentRemove = remove;
        registerAddonModal('readme', remove);
        container.classList.add('sa-readme-modal');
        content.classList.add('sa-readme-modal-content');

        const tabsEl = document.createElement('div');
        tabsEl.className = 'sa-readme-tabs';
        content.appendChild(tabsEl);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'sa-readme-body';
        content.appendChild(bodyEl);

        // Sliding underline (shared with todo / hm-project-analysis). The strip is
        // `position: relative`; the indicator is a single shared bar re-positioned on switch.
        const tabIndicator = document.createElement('div');
        tabIndicator.className = 'sa-readme-tab-indicator';
        tabsEl.appendChild(tabIndicator);

        const getActiveTab = () => tabsEl.querySelector('.sa-readme-tab-btn.enable');
        const syncTabIndicator = (animate) =>
            placeTabIndicator(tabsEl, tabIndicator, getActiveTab(), animate);
        const unwatchTabIndicator = watchTabIndicator(tabsEl, tabIndicator, getActiveTab);

        const showReadme = (index) => {
            const entry = readmes[index];
            // 第二个参数 inner=false；第三个参数把「启用 HTML 支持」开关透传给渲染器，
            // 开启时 README 文本里的原生 HTML 会真正渲染（代码围栏 / blocks XML 仍始终转义）。
            bodyEl.innerHTML = renderBlocks(entry.body || '', false, getSetting(SETTING_README_HTML_SUPPORT));
            // renderBlocks 对 ```blocks 围栏只产出 `<div class="hm-md-blocks" data-hm-blocks="...xml...">`
            // 占位，真正的 scratch-blocks SVG 积木在这里才生成（Blockly 只能在真实 DOM 节点里构造积木 SVG），
            // 所以这一步不能省，否则积木只显示空占位。
            renderBlockPreviews(bodyEl);
            Array.prototype.forEach.call(tabsEl.querySelectorAll('.sa-readme-tab-btn'), (tab, i) => {
                tab.classList.toggle('enable', i === index);
                tab.classList.toggle('unable', i !== index);
            });
            syncTabIndicator(true);
        };

        if (readmes.length === 0) {
            tabsEl.style.display = 'none';
            const empty = document.createElement('div');
            empty.className = 'sa-readme-empty';
            empty.textContent = '还没有 README。右键点击空白工作区，选择“添加 README”即可创建。';
            bodyEl.appendChild(empty);
        } else if (readmes.length > 1) {
            readmes.forEach((entry, index) => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'sa-readme-tab-btn ' + (index === 0 ? 'enable' : 'unable');
                tab.textContent = truncateTitle(entry.title) || String(index + 1);
                tab.addEventListener('click', () => showReadme(index));
                tabsEl.appendChild(tab);
            });
        } else {
            tabsEl.style.display = 'none';
        }

        const escapeHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        currentEscapeHandler = escapeHandler;
        document.addEventListener('keydown', escapeHandler);

        const close = () => {
            unregisterAddonModal('readme', remove);
            if (currentRemove === remove) currentRemove = null;
            if (currentEscapeHandler === escapeHandler) {
                document.removeEventListener('keydown', escapeHandler);
                currentEscapeHandler = null;
            }
            unwatchTabIndicator();
            remove();
        };
        backdrop.addEventListener('click', close);
        closeButton.addEventListener('click', close);

        if (readmes.length) showReadme(0);
    };

    // Toolbox button — always visible, like the other HyperMimic utility addons.
    addon.tab.addWorkspaceToolboxButton({
        id: 'readme',
        label: MODAL_TITLE,
        icon: toolboxIcon,
        action: openReadme
    });

    // Auto-display: 像 AstraEditor 一样，项目加载后若任意 sprite 含有 #README 注释就自动打开弹窗。
    const maybeAutoDisplay = () => {
        if (!getSetting(SETTING_AUTO_DISPLAY_README)) return;
        const hasReadme = (vm.runtime.targets || []).some((t) =>
            t.comments && Object.values(t.comments).some(
                (c) => typeof c.text === 'string' && c.text.slice(0, PREFIX_LEN) === README_SENTINEL
            )
        );
        if (hasReadme) openReadme();
    };
    vm.runtime.on('PROJECT_LOADED', maybeAutoDisplay);

    // Close any open modal when the addon is disabled mid-session.
    addon.self.addEventListener('disabled', closeReadme);
};
