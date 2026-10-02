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

export default async ({addon, msg, console}) => {
    const Blockly = await addon.tab.traps.getBlockly();
    const vm = addon.tab.traps.vm;

    // A README is just a Blockly workspace comment whose text starts with "#README". Reusing
    // comments means it is saved with the project, supports undo/redo, and serializes like any
    // other comment. Ported from AstraEditor.
    const README_SENTINEL = '#README';
    const PREFIX_LEN = README_SENTINEL.length; // 7
    const MAX_TAB_TITLE = 39;
    const MODAL_TITLE = 'README';

    // Track the open modal so a locale switch (reenabled) / disable can force-close it,
    // and so a second open closes the previous one instead of stacking two on top of each
    // other (the old bug: a stacked modal's reference got overwritten, so it could no longer
    // be closed -- "只能关闭前一个").
    let currentRemove = null;
    let currentEscapeHandler = null;
    // Releases whatever the open modal subscribed to (the workspace's change listener and the
    // runtime's target updates). It lives out here rather than inside `openReadme` because the
    // modal has more than one way out -- its own close button / backdrop, Escape, and the
    // `reenabled` / `disabled` handlers below -- and every one of them has to unhook it.
    let currentTeardown = null;

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
     * Split a sprite's comments into README entries ({id, title, body}). Non-README comments are
     * skipped. "#README #<title>\n<body>" when a title is present, otherwise "#README \n<body>".
     *
     * `id` is the comment's own id: the open modal keeps track of which README it is showing by id
     * rather than by position, because a live refresh can insert or drop one in the middle.
     */
    // `resolveText` decides where each comment's source text comes from. The default reads
    // `comment.text` (scratch-vm's stored text, which is only committed on blur — see
    // workspace_comment_render_svg.js, which copies the textarea into the comment on a `change`
    // event). When a README comment's own editor is open we pass a resolver that reads the
    // textarea's live `.value` instead, so the modal tracks keystrokes in real time instead of
    // lagging until the comment loses focus.
    const parseReadmeComments = (comments, resolveText = (comment) => comment && comment.text) => {
        const result = [];
        for (const comment of Object.values(comments || {})) {
            const text = resolveText(comment);
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
                    id: comment.id,
                    title: title || undefined,
                    body: text.slice(PREFIX_LEN + 2 + title.length + 1)
                });
            } else {
                result.push({
                    id: comment.id,
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
        // 自动给新 README 起标题：第 1 个 `#<标题>`，之后依次 `#<标题>2` / `#<标题>3`……
        // 编号按当前 sprite 已有 README 注释数量递增，保证不重名。标题词随语言走。
        const target = getEditingTarget();
        const existingCount = target ? parseReadmeComments(target.comments).length : 0;
        const newNumber = existingCount + 1;
        const titleSuffix = newNumber === 1 ? '' : String(newNumber);
        const initialText = `${README_SENTINEL} #${msg('defaultTitle')}${titleSuffix}\n\n`;
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
    //
    // The label is resolved inside the callback, not captured once at load: this callback runs
    // every time the menu opens, so `msg()` picks up a language switch without any extra event
    // plumbing. A constant here would freeze whatever locale was active at startup.
    addon.tab.createBlockContextMenu((items) => {
        items.push({
            text: msg('menuLabel'),
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
        if (currentTeardown) {
            const teardown = currentTeardown;
            currentTeardown = null;
            teardown();
        }
        remove();
    };

    addon.self.addEventListener('reenabled', () => {
        closeReadme();
        // 切语言后刷新工具箱按钮文案：registry 按 id 去重，重注册即触发 toolbox 浮层
        // _refresh 更新 title/aria-label，高级设置的「排列顺序」面板也随 notify 重绘。
        registerToolboxButton();
    });

    const truncateTitle = (title) =>
        (title && title.length > MAX_TAB_TITLE) ? `${title.slice(0, MAX_TAB_TITLE)}…` : title;

    const openReadme = () => {
        // Guard against stacking: if a modal is already open, close it first. Without this a
        // second open overwrites `currentRemove`, leaving the previous modal uncloseable.
        closeReadme();

        const initial = getEditingTarget();
        const initialReadmes = initial ? parseReadmeComments(initial.comments) : [];
        // 只有一个 README 时，在弹窗标题后追加“ - 标题”，让标题直接可见。`refresh` 每次内容变化都会
        // 重算同一件事，这里先算一遍只是因为窗口管理器是用创建时的标题去算 DOM id 的。
        const initialTitle = (initialReadmes.length === 1 && initialReadmes[0].title)
            ? `${MODAL_TITLE} - ${initialReadmes[0].title}`
            : MODAL_TITLE;
        const {backdrop, container, content, closeButton, remove} = addon.tab.createModal(initialTitle, {
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

        // The header title carries a hashed CSS-module class (`modal_header-item-title_<hash>`),
        // hence the substring match. Absent only if the modal ever stops being built by
        // createModal; a missing title then just means the title is not kept up to date.
        const titleEl = container.querySelector('[class*="modal_header-item-title"]');

        // What the modal is showing, held by comment id rather than by index: a refresh can insert
        // or drop a README in the middle, and an index from before would point at a different one.
        let entries = [];
        let activeId = null;
        // Serialised state of the last render, so a refresh caused by an event that changed nothing
        // this modal displays costs one string compare and no DOM work. `shownTabs` is separate from
        // `shownEntries` because a change to one README's body must not rebuild the tab strip.
        let shownEntries = null;
        let shownTabs = null;

        const tabLabel = (entry, index) => truncateTitle(entry.title) || String(index + 1);

        const readEntries = () => {
            const editing = getEditingTarget();
            if (!editing) return [];
            // The textarea being edited lives on the scratch-blocks comment on the main workspace,
            // not on the scratch-vm comment object we are iterating; fetch it by id so we can read
            // its live `.value` while it is being typed into. `getCommentById` returns the
            // `WorkspaceCommentSvg`, whose `textarea_` is non-null only while its editor is open.
            const ws = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
            const resolveText = (comment) => {
                if (ws && typeof ws.getCommentById === 'function') {
                    const live = ws.getCommentById(comment.id);
                    const textarea = live && live.textarea_;
                    if (textarea) return textarea.value;
                }
                return comment && comment.text;
            };
            return parseReadmeComments(editing.comments, resolveText);
        };

        const updateTitle = () => {
            if (!titleEl) return;
            titleEl.textContent = (entries.length === 1 && entries[0].title)
                ? `${MODAL_TITLE} - ${entries[0].title}`
                : MODAL_TITLE;
        };

        const renderTabs = () => {
            const signature = JSON.stringify(entries.map((entry, index) => [entry.id, tabLabel(entry, index)]));
            if (signature === shownTabs) return;
            shownTabs = signature;

            // Only the buttons are rebuilt; the shared indicator is a child of the strip and stays.
            Array.prototype.forEach.call(
                tabsEl.querySelectorAll('.sa-readme-tab-btn'),
                tab => tab.remove()
            );
            // A single README needs no tabs at all, and neither does an empty modal. The strip is
            // hidden rather than left empty so its rule and its underline go with it.
            if (entries.length < 2) {
                tabsEl.style.display = 'none';
                return;
            }
            tabsEl.style.display = '';
            entries.forEach((entry, index) => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'sa-readme-tab-btn';
                tab.dataset.readmeId = entry.id;
                tab.textContent = tabLabel(entry, index);
                tab.addEventListener('click', () => showEntry(entry.id));
                tabsEl.appendChild(tab);
            });
        };

        const renderBody = () => {
            if (!entries.length) {
                bodyEl.innerHTML = '';
                const empty = document.createElement('div');
                empty.className = 'sa-readme-empty';
                empty.textContent = msg('emptyState');
                bodyEl.appendChild(empty);
                return;
            }
            const entry = entries.find(candidate => candidate.id === activeId) || entries[0];
            activeId = entry.id;
            // A refresh can be set off by something happening elsewhere in the workspace, so the
            // body is rebuilt under the reader's feet: keep them where they were in the text.
            const scrollTop = bodyEl.scrollTop;
            // 第二个参数 inner=false；第三个参数把「启用 HTML 支持」开关透传给渲染器，
            // 开启时 README 文本里的原生 HTML 会真正渲染（代码围栏 / blocks XML 仍始终转义）。
            bodyEl.innerHTML = renderBlocks(entry.body || '', false, getSetting(SETTING_README_HTML_SUPPORT));
            // renderBlocks 对 ```blocks 围栏只产出 `<div class="hm-md-blocks" data-hm-blocks="...xml...">`
            // 占位，真正的 scratch-blocks SVG 积木在这里才生成（Blockly 只能在真实 DOM 节点里构造积木 SVG），
            // 所以这一步不能省，否则积木只显示空占位。
            renderBlockPreviews(bodyEl);
            bodyEl.scrollTop = scrollTop;
            Array.prototype.forEach.call(tabsEl.querySelectorAll('.sa-readme-tab-btn'), (tab) => {
                const active = tab.dataset.readmeId === activeId;
                tab.classList.toggle('enable', active);
                tab.classList.toggle('unable', !active);
            });
            syncTabIndicator(true);
        };

        const showEntry = (id) => {
            activeId = id;
            renderBody();
        };

        // Brings the modal in line with the workspace. Called once to build it, and again on every
        // event that could have changed it; everything it does is skipped when nothing changed.
        const refresh = () => {
            const next = readEntries();
            const signature = JSON.stringify(next);
            if (signature === shownEntries) return;
            shownEntries = signature;
            entries = next;
            updateTitle();
            renderTabs();
            // The README on screen may have just been deleted, and switching sprite brings a set
            // whose ids are all new; fall back to the first rather than showing nothing.
            if (!entries.some(entry => entry.id === activeId)) {
                activeId = entries.length ? entries[0].id : null;
            }
            renderBody();
        };

        refresh();

        const escapeHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        currentEscapeHandler = escapeHandler;
        document.addEventListener('keydown', escapeHandler);

        // Every way out of the modal goes through `closeReadme`, which is also where the
        // subscriptions below are released -- there is no second copy of that bookkeeping to drift
        // out of sync (the close button and the backdrop used to unwind this by hand).
        const close = () => closeReadme();
        backdrop.addEventListener('click', close);
        closeButton.addEventListener('click', close);

        // Live sync with the workspace. A README *is* a workspace comment, so what can change this
        // modal is either a comment event -- `comment_change` when its text is edited or a fence is
        // dragged back into it, `comment_create` / `comment_delete` when a README appears or goes --
        // or the editing target moving to a sprite with READMEs of its own.
        const workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
        const onWorkspaceChange = (event) => {
            // Comment events only. Block and UI events fire constantly -- on every drag, every move,
            // every field edit -- and none of them can change what is on screen here.
            if (!event || typeof event.type !== 'string') return;
            if (event.type.indexOf('comment_') !== 0) return;
            refresh();
        };
        if (workspace && typeof workspace.addChangeListener === 'function') {
            workspace.addChangeListener(onWorkspaceChange);
        }
        // Whether swapping sprites also produces comment events depends on how the gui rebuilds the
        // workspace, so the target list is watched as a second, independent trigger. `refresh` is a
        // no-op unless the READMEs really differ, so the extra calls cost a compare at most.
        const onTargetsUpdate = () => refresh();
        vm.runtime.on('targetsUpdate', onTargetsUpdate);

        // Live typing: scratch-blocks does not emit `comment_*` events while a comment's textarea is
        // being typed into (it commits on blur — see workspace_comment_render_svg.js), so to follow
        // keystrokes we listen for the textarea's own `input` event. `refresh` is a no-op unless the
        // parsed entries actually changed, so input from comments that are not README costs nothing.
        const onCommentInput = (e) => {
            const target = e.target;
            if (target && target.classList && target.classList.contains('scratchCommentTextarea')) {
                refresh();
            }
        };
        document.addEventListener('input', onCommentInput, true);

        currentTeardown = () => {
            if (workspace && typeof workspace.removeChangeListener === 'function') {
                workspace.removeChangeListener(onWorkspaceChange);
            }
            vm.runtime.off('targetsUpdate', onTargetsUpdate);
            document.removeEventListener('input', onCommentInput, true);
            unwatchTabIndicator();
        };
    };

    // Toolbox button — always visible, like the other HyperMimic utility addons.
    // 抽成函数：切语言时框架派发 `reenabled`，需重新注册以刷新 label（registry 按 id 去重，
    // 重注册会触发 toolbox 浮层 _refresh 刷新 title/aria-label，设置面板顺序也随之刷新）。
    // label 用本地化的 menuLabel（"添加 README" 等），不再用硬编码的 MODAL_TITLE。
    function registerToolboxButton() {
        addon.tab.addWorkspaceToolboxButton({
            id: 'readme',
            label: msg('menuLabel'),
            icon: toolboxIcon,
            action: openReadme
        });
    }
    registerToolboxButton();

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
