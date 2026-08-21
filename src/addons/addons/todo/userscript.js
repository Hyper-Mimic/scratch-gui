import logo from '!../../../lib/tw-recolor/build!./logo.svg';
import dropdown from './dropdown-arrow.svg';;
import done from './done.svg';
import undone from './undone.svg';
import edit from './edit.svg';
import remove from './remove.svg';

/* ============================================================
 * 内联依赖（原 src/addons/tools/AEsettings + src/addons/ui/side-bar）
 * 这些模块已随 tools/ ui/ 目录移除，此处内联等价实现
 * ============================================================ */

// 原 tools/AEsettings/index.js
const getSetting = (id) => {
    try {
        const settings = JSON.parse(localStorage.getItem('AESettings')) || {};
        if(!settings[id]) return false;
        return settings[id];
    } catch (e) {
        console.error('Failed to get setting:', e);
        return false;
    }
}

// 原 ui/side-bar/side-bar.js（精简版：仅保留 setContent/clearContent 核心能力）
const getSideBar = () => {
    return document.querySelectorAll("[class*=gui_tab-panel]")[0];
}

let sidebarInstance = null;

class SideBarInternal {
    constructor() {
        this.DEFAULT_WIDTH = 350;
        this.currentWidth = this.DEFAULT_WIDTH;

        this.element = document.createElement("div");
        this.element.className = "addons-side-bar";
        this.element.style.cssText = `
            position: relative;
            top: 0;
            left: 0;
            width: ${this.currentWidth}px;
            flex: 0 0 auto;
            background-color: var(--ui-white);
            z-index: 489;
            display: none;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
            height: 100%;
        `;

        this.contentContainer = document.createElement("div");
        this.contentContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            position: relative;
            background: var(--ui-white);
            min-height: 0;
            max-height: 100%;
            display: flex;
        `;
        this.element.appendChild(this.contentContainer);

        if (getSideBar()) getSideBar().prepend(this.element);
    }

    setContent(content) {
        this.clearContent();
        this.contentContainer.appendChild(content);
    }

    clearContent() {
        this.contentContainer.innerHTML = "";
    }

    isOpen() {
        return this.element.style.display !== "none";
    }

    open() {
        if (!document.contains(this.element)) {
            const sidebar = getSideBar();
            if (sidebar) sidebar.prepend(this.element);
        }
        this.element.style.display = "flex";
        window.dispatchEvent(new Event("resize"));
    }

    close() {
        this.element.style.display = "none";
        window.dispatchEvent(new Event("resize"));
    }
}

const SideBar = {
    setContent(content) {
        if (!sidebarInstance) sidebarInstance = new SideBarInternal();
        sidebarInstance.setContent(content);
    },
    clearContent() {
        if (sidebarInstance) sidebarInstance.clearContent();
    },
    open() {
        if (!sidebarInstance) sidebarInstance = new SideBarInternal();
        sidebarInstance.open();
    },
    close() {
        if (sidebarInstance) sidebarInstance.close();
    },
    isOpen() {
        return sidebarInstance ? sidebarInstance.isOpen() : false;
    }
};

/* ============================================================
 * 内联依赖结束
 * ============================================================ */

/*
{
  groups: [
    { id: "g1", name: "工作", color: "#3b82f6"}
  ],
  tasks: [
    {
      id: "t1",
      name: "写周报",
      startTime: "123445",
      endTime: "33333",
      done: false,
      priority: 2,
      tags: ["g1"],
      color: "#0099ff",
      steps: [
        { id: "s1", text: "收集数据", done: true }
      ],
    }
  ]
}
*/


export default async function ({ addon, msg }) {
    // 语言切换后更新已渲染的菜单项文本（框架在 SELECT_LOCALE 时触发 reenabled）
    const updateLocalizedText = () => {
        document.querySelectorAll('.sa-todo-menu-item .sa-todo-menu-item-text').forEach(el => {
            el.textContent = msg('todo');
        });
    };
    addon.self.addEventListener("reenabled", updateLocalizedText);

    function getContrastColor(hexColor) {
        let r, g, b;

        if (hexColor.startsWith('#')) {
            if (hexColor.length === 4) {
                r = parseInt(hexColor[1] + hexColor[1], 16);
                g = parseInt(hexColor[2] + hexColor[2], 16);
                b = parseInt(hexColor[3] + hexColor[3], 16);
            } else {
                r = parseInt(hexColor.slice(1, 3), 16);
                g = parseInt(hexColor.slice(3, 5), 16);
                b = parseInt(hexColor.slice(5, 7), 16);
            }
        } else if (hexColor.startsWith('rgb')) {
            const match = hexColor.match(/\d+/g);
            r = parseInt(match[0]);
            g = parseInt(match[1]);
            b = parseInt(match[2]);
        } else {
            return '#000000';
        }

        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        return brightness > 128 ? '#000000' : '#ffffff';
    }

    function getFormattedDateRange(timestamp1, timestamp2) {
        const date1 = new Date(timestamp1);
        const date2 = new Date(timestamp2);

        const pad = (num) => String(num).padStart(2, '0');

        const year1 = date1.getFullYear();
        const month1 = pad(date1.getMonth() + 1);
        const day1 = pad(date1.getDate());
        const hour1 = pad(date1.getHours());
        const minute1 = pad(date1.getMinutes());
        const second1 = pad(date1.getSeconds());

        const year2 = date2.getFullYear();
        const month2 = pad(date2.getMonth() + 1);
        const day2 = pad(date2.getDate());
        const hour2 = pad(date2.getHours());
        const minute2 = pad(date2.getMinutes());
        const second2 = pad(date2.getSeconds());

        const timeStr1 = `${hour1}:${minute1}:${second1}`;
        const timeStr2 = `${hour2}:${minute2}:${second2}`;

        const isSameDate = year1 === year2 && month1 === month2 && day1 === day2;

        if (isSameDate) {
            const dateStr = `${year1}-${month1}-${day1}`;
            return `${dateStr} ${timeStr1} → ${timeStr2}`;
        } else {
            const fullStr1 = `${year1}-${month1}-${day1} ${timeStr1}`;
            const fullStr2 = `${year2}-${month2}-${day2} ${timeStr2}`;
            return `${fullStr1} → ${fullStr2}`;
        }
    }

    const generateId = () => {
        return `todo-${Math.random().toString(36).substr(2, 9)}`;
    }

    addon.tab.traps.vm.runtime.on("PROJECT_LOADED", () => {
        try {
            Object.values(addon.tab.traps.vm.runtime.getTargetForStage().comments).forEach(obj => {
                if (obj.id == COMMENT_ID) return
                if (obj.text.indexOf(POINT) != -1) { COMMENT_ID = obj.id; return }
            })
        } catch (e) {
            console.warn(e);
        }
    })

    let COMMENT_ID = 'todo'
    let PROJECT_NAME = '';
    const POINT = '_TODO_LIST_'
    const emptyTodo = {
        groups: [],
        tasks: []
    }
    const alpha = 'a0';

    await ReduxStore.subscribe(() => {
        PROJECT_NAME = ReduxStore.getState().scratchGui.projectTitle;
    })

    const getFormatComment = content => `
This comment is for the "todo" addon, this comment will storage your to-do list.\n
So don't edit, remove it. But you can move, resize and hide it, it won't affect work.
${POINT}
${JSON.stringify(content)}
`

    const getTextWidth = (() => {
        const el = document.createElement('span');
        el.style.cssText = 'position:fixed;visibility:hidden;white-space:nowrap;height:auto;width:auto';
        document.body.appendChild(el);
        return (text = 'hello world', fontSize = '16px', plus = 0, fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif') => {
            el.style.font = `${String(fontSize).endsWith('px') ? fontSize : fontSize + 'px'} ${fontFamily}`;
            el.textContent = text;
            return el.offsetWidth + plus + 'px';
        };
    })();

    // ===== 辅助函数 =====
    const createDividerHeader = (title, isDashed = true) => {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'sa-todo-section-header';
        const titleElement = document.createElement('span');
        titleElement.className = 'sa-todo-section-title';
        titleElement.textContent = title;
        const divider = document.createElement('div');
        divider.className = isDashed ? 'sa-todo-divider-dashed' : 'sa-todo-divider';
        headerDiv.appendChild(titleElement);
        headerDiv.appendChild(divider);
        return headerDiv;
    };

    // ===== addModal =====
    const addModal = (editEleConfig = false) => {
        const { backdrop, container, content: contentMain, closeButton, remove } =
            addon.tab.createModal(editEleConfig ? msg('edit-title') : msg('create-title'), {
                isOpen: true,
                useEditorClasses: true
            });

        container.classList.add('sa-todo-popup');
        contentMain.classList.add('sa-todo-content');

        let config;
        const isNew = !editEleConfig;

        if (editEleConfig) {
            config = {
                mode: editEleConfig.mode || 2,
                id: editEleConfig.id || generateId(),
                name: editEleConfig.name || msg('new-todo'),
                color: editEleConfig.color || '#0099ff',
                task: {
                    startTime: editEleConfig.startTime || Date.now(),
                    endTime: editEleConfig.endTime || Date.now() + 10000086,
                    done: editEleConfig.done || false,
                    tags: editEleConfig.groupId || [],
                    priority: 1,
                    steps: editEleConfig.steps || [],
                },
            };
        } else {
            config = {
                mode: 2,
                id: generateId(),
                name: msg('new-todo'),
                name_group: msg('new-group'),
                color: '#0099ff',
                task: {
                    startTime: Date.now(),
                    endTime: Date.now() + 10000086,
                    done: false,
                    tags: [],
                    priority: 1,
                    steps: [],
                }
            };
        }

        // ===== 外层容器 =====
        const modalInner = document.createElement('div');
        modalInner.className = 'sa-todo-modal-inner';

        // ===== Tab 标签 =====
        const modeTab = document.createElement('div');
        modeTab.className = 'sa-todo-mode-tab';

        const taskTabBtn = document.createElement('button');
        taskTabBtn.className = 'sa-todo-mode-tab-btn ' + (config.mode === 2 ? 'enable' : 'unable');
        taskTabBtn.textContent = msg('task');

        const groupTabBtn = document.createElement('button');
        groupTabBtn.className = 'sa-todo-mode-tab-btn ' + (config.mode === 1 ? 'enable' : 'unable');
        groupTabBtn.textContent = msg('group');

        modeTab.appendChild(taskTabBtn);
        modeTab.appendChild(groupTabBtn);

        // ===== Tab 内容（可滚动） =====
        const tabContent = document.createElement('div');
        tabContent.className = 'sa-todo-tab-content';

        // ===== 任务字段 =====
        const taskFields = document.createElement('div');
        taskFields.className = 'sa-todo-task-fields';

        // ===== 分组字段 =====
        const groupFields = document.createElement('div');
        groupFields.className = 'sa-todo-group-fields';

        // ===== 编辑标题（虚线） =====
        const taskHeader = createDividerHeader(msg('edit'), true);
        const groupHeader = createDividerHeader(msg('edit'), true);

        // ===== 预览 =====
        const preview = document.createElement('div');
        preview.className = 'sa-todo-modal-preview';

        // ===== 预览标题（虚线） =====
        const previewLabel = createDividerHeader(msg('preview'), true);

        const preview_title = document.createElement('input');
        preview_title.className = 'sa-todo-modal-preview-title';
        preview_title.style.outlineColor = config.color;
        preview_title.onchange = e => {
            config.name = e.target.value;
            refresh();
        };

        const preview_date = document.createElement('span');
        preview_date.className = 'sa-todo-modal-preview-date';

        // ===== 预览步骤列表 =====
        const preview_steps = document.createElement('ul');
        preview_steps.className = 'sa-todo-modal-preview-steps';

        // ===== 新建步骤按钮 =====
        const preview_steps_create = document.createElement('button');
        preview_steps_create.className = 'sa-todo-modal-create-button';
        preview_steps_create.textContent = msg('new-step');

        // ===== 刷新函数 =====
        const refresh = () => {
            preview_title.value = config.name;
            preview_date.textContent = getFormattedDateRange(config.task.startTime, config.task.endTime);
            preview.style.backgroundColor = config.color + alpha;

            preview_steps.innerHTML = '';

            config.task.steps.forEach((step, index) => {
                const stepItem = document.createElement('li');
                stepItem.className = 'sa-todo-modal-preview-steps-step';

                const stepInput = document.createElement('input');
                stepInput.className = 'sa-todo-modal-preview-steps-step-input';
                stepInput.style.outlineColor = config.color;
                stepInput.value = step.text;
                stepInput.onchange = e => {
                    config.task.steps[index].text = e.target.value;
                };

                const stepRemove = document.createElement('button');
                stepRemove.textContent = '×';
                stepRemove.className = 'sa-todo-modal-preview-steps-step-remove';
                stepRemove.style.backgroundColor = config.color;
                stepRemove.style.color = 'white';
                stepRemove.onclick = (e) => {
                    e.stopPropagation();
                    config.task.steps.splice(index, 1);
                    refresh();
                };

                stepItem.appendChild(stepRemove);
                stepItem.appendChild(stepInput);
                preview_steps.appendChild(stepItem);
            });

            // 聚焦最新的步骤
            if (config.task.steps.length > 0) {
                const lastStep = config.task.steps[config.task.steps.length - 1];
                if (lastStep.latest) {
                    const inputs = preview_steps.querySelectorAll('.sa-todo-modal-preview-steps-step-input');
                    if (inputs.length > 0) {
                        setTimeout(() => {
                            inputs[inputs.length - 1].focus();
                            inputs[inputs.length - 1].select();
                        }, 0);
                    }
                    lastStep.latest = false;
                }
            }
        };

        preview.appendChild(preview_title);
        preview.appendChild(preview_date);
        preview.appendChild(preview_steps);
        refresh();

        // ===== 组选择器 =====
        const groupSelector = document.createElement('div');
        groupSelector.className = 'sa-todo-group-selector';

        const refreshGroupSelector = () => {
            groupSelector.innerHTML = '';
            const groups = getTodoListContent().groups || [];
            if (groups.length === 0) return;
            groups.forEach(group => {
                const tag = document.createElement('button');
                tag.className = 'sa-todo-group-tag';
                tag.textContent = group.name;
                const active = (config.task.tags || []).includes(group.id);
                if (active) {
                    tag.classList.add('active');
                    tag.style.backgroundColor = group.color;
                } else {
                    tag.style.backgroundColor = group.color + '60';
                }
                tag.onclick = () => {
                    const tags = config.task.tags || [];
                    const idx = tags.indexOf(group.id);
                    if (idx === -1) tags.push(group.id);
                    else tags.splice(idx, 1);
                    config.task.tags = tags;
                    refreshGroupSelector();
                };
                groupSelector.appendChild(tag);
            });
        };

        // ===== 输入框辅助 =====
        const input = (inputType, text, inputConfig = {}) => {
            const inputContent = document.createElement('div');
            inputContent.className = 'sa-todo-modal-input';
            const inputText = document.createElement('span');
            inputText.textContent = text;
            const input = document.createElement('input');
            input.className = 'sa-todo-modal-input-input';
            if (inputType !== 'input') input.type = inputType;
            if (inputConfig.key2) input.value = config[inputConfig.key][inputConfig.key2];
            else input.value = config[inputConfig.key];
            input.oninput = e => {
                if (inputConfig.key2) config[inputConfig.key][inputConfig.key2] = e.target.value;
                else config[inputConfig.key] = e.target.value;
                refresh();
            };
            inputContent.appendChild(inputText);
            inputContent.appendChild(input);
            return inputContent;
        };

        // ===== 构建任务字段 =====
        taskFields.appendChild(taskHeader);
        taskFields.appendChild(input('color', msg('color'), { key: 'color' }));
        taskFields.appendChild(input('datetime-local', msg('start-time'), { key: 'task', key2: 'startTime' }));
        taskFields.appendChild(input('datetime-local', msg('end-time'), { key: 'task', key2: 'endTime' }));
        taskFields.appendChild(groupSelector);

        // ===== 构建分组字段 =====
        groupFields.appendChild(groupHeader);
        groupFields.appendChild(input('text', msg('name'), { key: 'name' }));
        groupFields.appendChild(input('color', msg('color'), { key: 'color' }));

        // ===== 初始显示状态 =====
        if (config.mode === 1) {
            taskFields.style.display = 'none';
            preview.style.display = 'none';
            previewLabel.style.display = 'none';
            preview_steps_create.style.display = 'none';
        } else {
            groupFields.style.display = 'none';
        }

        // ===== Tab 切换 =====
        taskTabBtn.onclick = () => {
            config.mode = 2;
            taskTabBtn.className = 'sa-todo-mode-tab-btn enable';
            groupTabBtn.className = 'sa-todo-mode-tab-btn unable';
            taskFields.style.display = '';
            groupFields.style.display = 'none';
            preview.style.display = '';
            previewLabel.style.display = '';
            preview_steps_create.style.display = '';
            refreshGroupSelector();
            refresh();
            tabContent.scrollTop = 0;
        };

        groupTabBtn.onclick = () => {
            config.mode = 1;
            groupTabBtn.className = 'sa-todo-mode-tab-btn enable';
            taskTabBtn.className = 'sa-todo-mode-tab-btn unable';
            taskFields.style.display = 'none';
            groupFields.style.display = '';
            preview.style.display = 'none';
            previewLabel.style.display = 'none';
            preview_steps_create.style.display = 'none';
            tabContent.scrollTop = 0;
        };

        // ===== 预览步骤创建 =====
        preview_steps_create.onclick = () => {
            config.task.steps.push({
                id: generateId(),
                text: msg('new-step'),
                latest: true,
                done: false
            });
            refresh();
        };

        // ===== 完成按钮 =====
        const done = document.createElement('button');
        done.className = 'sa-todo-modal-create-button';
        done.textContent = msg('done');
        done.onclick = () => {
            if (editEleConfig) replaceTodo(config);
            else addNewTodo(config);
            remove();
        };

        // ===== 按钮容器 =====
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'sa-todo-modal-button-container';
        buttonContainer.appendChild(done);

        // ===== 组装 Tab 内容 =====
        const taskFieldsRow = document.createElement('div');
        taskFieldsRow.className = 'sa-todo-control-row sa-todo-control-row-full';
        const taskFieldsFull = document.createElement('div');
        taskFieldsFull.className = 'sa-todo-control-full';
        taskFieldsFull.appendChild(taskFields);
        taskFieldsRow.appendChild(taskFieldsFull);
        tabContent.appendChild(taskFieldsRow);

        const groupFieldsRow = document.createElement('div');
        groupFieldsRow.className = 'sa-todo-control-row sa-todo-control-row-full';
        const groupFieldsFull = document.createElement('div');
        groupFieldsFull.className = 'sa-todo-control-full';
        groupFieldsFull.appendChild(groupFields);
        groupFieldsRow.appendChild(groupFieldsFull);
        tabContent.appendChild(groupFieldsRow);

        const previewRow = document.createElement('div');
        previewRow.className = 'sa-todo-control-row sa-todo-control-row-full';
        const previewFull = document.createElement('div');
        previewFull.className = 'sa-todo-control-full';
        previewFull.appendChild(previewLabel);
        previewFull.appendChild(preview);
        previewFull.appendChild(preview_steps_create);
        previewRow.appendChild(previewFull);
        tabContent.appendChild(previewRow);

        const buttonRow = document.createElement('div');
        buttonRow.className = 'sa-todo-control-row sa-todo-control-row-full';
        const buttonFull = document.createElement('div');
        buttonFull.className = 'sa-todo-control-full';
        buttonFull.appendChild(buttonContainer);
        buttonRow.appendChild(buttonFull);
        tabContent.appendChild(buttonRow);

        // ===== 组装最终结构 =====
        modalInner.appendChild(modeTab);
        modalInner.appendChild(tabContent);
        contentMain.appendChild(modalInner);

        refreshGroupSelector();

        backdrop.addEventListener("click", remove);
        closeButton.addEventListener("click", remove);
    };

    let selectedGroup = null;

    const createSideBarElements = () => {
        const isVSCL = getSetting('EnableVSCodeLayout');

        const content = document.createElement('div');
        content.className = 'sa-todo';

        const title = document.createElement('h1');
        title.textContent = msg('title', { project: PROJECT_NAME.toString() });

        let groupBar = null;

        const refreshTodo = () => {
            if (getSetting('EnableVSCodeLayout')) {
                SideBar.clearContent();
                SideBar.setContent(createSideBarElements())
            } else {
                const content = document.querySelector("[class*='sa-todo-modal-content']");
                content.childNodes.forEach(ele => ele.remove());
                content.appendChild(createSideBarElements())
            }
        }

        try {
            const groups = getTodoListContent().groups || [];
            if (groups.length > 0) {
                groupBar = document.createElement('div');
                groupBar.className = 'sa-todo-group-bar';

                const allBtn = document.createElement('button');
                allBtn.className = 'sa-todo-group-btn';
                allBtn.textContent = msg('all');
                if (selectedGroup === null) allBtn.classList.add('active');
                allBtn.onclick = () => {
                    selectedGroup = null;
                    refreshTodo()
                };
                groupBar.appendChild(allBtn);

                groups.forEach((group, index) => {
                    let needRemove = false;
                    const btn = document.createElement('button');
                    btn.className = 'sa-todo-group-btn';
                    btn.textContent = group.name;
                    const btnRemoveGroup = document.createElement('div');
                    btnRemoveGroup.className = 'sa-todo-group-remove-btn'
                    btnRemoveGroup.style.backgroundColor = group.color;

                    const btnRemoveGroupImg = document.createElement('img');
                    btnRemoveGroupImg.src = remove;
                    btnRemoveGroupImg.className = 'sa-todo-group-remove-btn-img';
                    btnRemoveGroupImg.style.filter = `brightness(${getContrastColor(group.color) === '#000000' ? 0 : 1}`
                    btnRemoveGroup.onclick = () => {
                        if (selectedGroup === group.id) selectedGroup = null;
                        needRemove = true;
                        const currentGroup = getTodoListContent();
                        const nowGroupId = currentGroup.groups[index].id;
                        currentGroup.groups.splice(index, 1);
                        currentGroup.tasks.forEach((task, taskIndex) => {
                            const groupIndex = task.groupId.indexOf(nowGroupId);
                            if (groupIndex !== -1) {
                                currentGroup.tasks[taskIndex].groupId.splice(groupIndex, 1);
                            }
                        })
                        createCommentToStage(getFormatComment(currentGroup));
                    }
                    if (selectedGroup === group.id) {
                        btn.classList.add('active');
                        btn.style.backgroundColor = group.color;
                    } else {
                        btn.style.backgroundColor = group.color + '60';
                    }
                    btn.onclick = () => {
                        if (needRemove) return;
                        selectedGroup = group.id;
                        refreshTodo()
                    };
                    btnRemoveGroup.appendChild(btnRemoveGroupImg);
                    btn.appendChild(btnRemoveGroup);
                    groupBar.appendChild(btn);
                });
            }
        } catch (e) { console.warn(`Can't load group menu because ${e}`) }

        const todoList = document.createElement('ul');
        todoList.className = 'sa-todo-list';

        try {
            const tasks = getTodoListContent().tasks || [];
            if (tasks.length === 0) {
                const tip = document.createElement('span');
                tip.textContent = msg('no-todo');
                tip.className = 'sa-todo-list-empty-tip';
                todoList.appendChild(tip);
            } else {
                tasks.forEach((task, index) => {
                    let currentTask = task;
                    if (selectedGroup !== null && !(currentTask.groupId || []).includes(selectedGroup)) return;
                    let isHide = true;

                    const todoEle = document.createElement('li');
                    todoEle.className = 'sa-todo-list-ele';

                    const todoEle_groupTip = document.createElement('div');
                    todoEle_groupTip.className = 'sa-todo-list-ele-group_tip';
                    if (task.groupId.length > 0) todoEle.style.borderRadius = '0px 0px 5px 5px';
                    task.groupId.forEach(tag => {
                        const groupIndex = getTodoListContent().groups.findIndex(group => group.id === tag);
                        const groupEleBlock = document.createElement('div');
                        groupEleBlock.className = 'sa-todo-list-ele-group_tip-block';
                        groupEleBlock.style.backgroundColor = getTodoListContent().groups[groupIndex].color;
                        todoEle_groupTip.appendChild(groupEleBlock);
                    })

                    const todoEle_card = document.createElement('div')
                    todoEle_card.className = 'sa-todo-list-ele-titleDiv';

                    const todoEleName = document.createElement('span');
                    todoEleName.className = 'sa-todo-list-ele-title';
                    todoEleName.textContent = currentTask.name;

                    const todoEleDelLine = document.createElement('div');
                    todoEleDelLine.textContent = currentTask.name;
                    todoEleDelLine.style.setProperty('--width', getTextWidth(currentTask.name, '30px', 15));
                    if (currentTask.steps.length != 0) {
                        todoEleDelLine.style.marginLeft = '75px';
                    } else {
                        todoEleDelLine.style.marginLeft = '40px';
                    }
                    todoEleDelLine.className = 'sa-todo-list-ele-title sa-todo-list-ele-title-rmLine';

                    const todoEleSetDone = document.createElement('img');
                    todoEleSetDone.src = getTodoListContent().tasks[index].done ? undone : done;
                    todoEleSetDone.className = 'sa-todo-list-ele-done'
                    todoEleSetDone.style.backgroundColor = currentTask.color;

                    const todoEleEditButton = document.createElement('img');
                    todoEleEditButton.src = edit;
                    todoEleEditButton.className = 'sa-todo-list-ele-done'
                    todoEleEditButton.style.backgroundColor = currentTask.color;
                    todoEleEditButton.onclick = () => {
                        addModal(task);
                    }

                    const todoEleRemoveButton = document.createElement('img');
                    todoEleRemoveButton.src = remove;
                    todoEleRemoveButton.className = 'sa-todo-list-ele-done'
                    todoEleRemoveButton.style.backgroundColor = currentTask.color;
                    todoEleRemoveButton.onclick = () => {
                        const originTodo = getTodoListContent();
                        originTodo.tasks.splice(index, 1);
                        createCommentToStage(getFormatComment(originTodo));
                    }

                    const todoEleDate = document.createElement('span');
                    todoEleDate.style.color = 'white';
                    todoEleDate.textContent = getFormattedDateRange(currentTask.startTime, currentTask.endTime);

                    const todoEleStepsContent = document.createElement('ul');

                    const spawnSteps = (needGetLatest = false) => {
                        if (needGetLatest) currentTask = getTodoListContent().tasks[index]
                        const todoEleStepsContentMain = document.createElement('li');
                        todoEleStepsContentMain.className = 'sa-todo-list-ele-steps-main'
                        todoEleStepsContent.className = 'sa-todo-list-ele-steps';
                        todoEleStepsContent.id = currentTask.id;
                        if (currentTask.steps.length != 0) {
                            for (let needDone = 0; needDone <= 1; needDone += 1) {
                                if (needDone && !!currentTask.steps.find(step => step.done)) {
                                    const lineDiv = document.createElement('li');
                                    lineDiv.className = 'sa-todo-list-ele-line';
                                    const text = document.createElement('span');
                                    text.className = 'sa-todo-list-ele-line-text';
                                    text.textContent = msg('done');
                                    const line = document.createElement('hr');
                                    line.className = 'sa-todo-list-ele-line-line';
                                    lineDiv.appendChild(text);
                                    lineDiv.appendChild(line)
                                    todoEleStepsContentMain.appendChild(lineDiv);
                                }
                                currentTask.steps.forEach((step, indexStep) => {
                                    if (step.done == needDone) {
                                        const todoEleStep = document.createElement('li');
                                        todoEleStep.className = 'sa-todo-list-ele-steps-li';

                                        const todoEleSetDoneStep = document.createElement('img');
                                        todoEleSetDoneStep.src = needDone ? undone : done;
                                        todoEleSetDoneStep.className = 'sa-todo-list-ele-done';
                                        todoEleSetDoneStep.style.backgroundColor = currentTask.color;
                                        todoEleSetDoneStep.onclick = () => {
                                            const todos = getTodoListContent();
                                            todos.tasks[index].steps[indexStep].done = !todos.tasks[index].steps[indexStep].done;
                                            createCommentToStage(getFormatComment(todos), false);
                                            todoEleStepsContent.innerHTML = '';
                                            spawnSteps(true);
                                        }

                                        const todoEleStep_Text = document.createElement('span');
                                        todoEleStep_Text.textContent = `${indexStep + 1}.${step.text}`;
                                        if (needDone) todoEleStep_Text.style.opacity = 0.5;
                                        todoEleStep_Text.style.color = 'white';

                                        todoEleStep.appendChild(todoEleSetDoneStep);
                                        todoEleStep.appendChild(todoEleStep_Text);
                                        todoEleStepsContentMain.appendChild(todoEleStep);
                                    }
                                });
                            }
                        }
                        todoEleStepsContent.appendChild(todoEleStepsContentMain);
                    }
                    spawnSteps();

                    todoEle.style.backgroundColor = currentTask.color + alpha;

                    const refreshTodoStyle = () => {
                        const isDone = getTodoListContent().tasks[index].done;
                        if (isDone) {
                            todoEleDelLine.style.width = '';
                            todoEleName.style.opacity = 0.5;
                        } else {
                            todoEleDelLine.style.width = '0px';
                            todoEleName.style.opacity = 1;
                        }
                    }

                    const todoEleDropdown = document.createElement('img');
                    todoEleDropdown.src = dropdown;
                    todoEleDropdown.className = 'sa-todo-list-ele-titleDiv-dropdown';
                    const refreshDropdown_Steps = () => {
                        todoEleDropdown.style.transform = isHide ? 'rotate(180deg)' : 'rotate(0deg)';
                        todoEleStepsContent.style.gridTemplateRows = isHide ? '0fr' : '1fr';
                    }

                    todoEleSetDone.onclick = () => {
                        const todos = getTodoListContent();
                        todos.tasks[index].done = !todos.tasks[index].done;
                        todoEleSetDone.src = todos.tasks[index].done ? undone : done;
                        createCommentToStage(getFormatComment(todos), false);
                        refreshTodoStyle()
                    }

                    todoEleDropdown.onclick = () => {
                        isHide = !isHide;
                        refreshDropdown_Steps()
                    }

                    todoList.appendChild(todoEle_groupTip);
                    if (currentTask.steps.length != 0) todoEle_card.appendChild(todoEleDropdown);
                    todoEle_card.appendChild(todoEleSetDone);
                    todoEle_card.appendChild(todoEleName);
                    todoEle_card.appendChild(todoEleDelLine);
                    todoEle_card.appendChild(todoEleRemoveButton);
                    todoEle_card.appendChild(todoEleEditButton);

                    todoEle.appendChild(todoEle_card);
                    todoEle.appendChild(todoEleDate);
                    todoEle.appendChild(todoEleStepsContent);
                    refreshDropdown_Steps();
                    refreshTodoStyle();
                    todoList.appendChild(todoEle);
                });
            }
        } catch (e) {
            console.warn('Todo List can\'t display: ' + e.stack)
        }

        const addButton = document.createElement('button');
        addButton.className = 'sa-todo-add-todo';
        addButton.textContent = msg('add');
        addButton.onclick = () => {
            addModal();
        }

        if (isVSCL) content.appendChild(title)
        if (groupBar) content.appendChild(groupBar);
        content.appendChild(todoList)
        content.appendChild(addButton)
        return content
    }

    // ===== 其他函数保持不变 =====
    const createCommentToStage = (content, needRefresh = true) => {
        const vm = addon.tab.traps.vm;
        try {
            delete vm.runtime.getTargetForStage().comments[COMMENT_ID]
            vm.runtime.getTargetForStage().createComment(
                COMMENT_ID,
                null,
                content,
                50,
                50,
                350,
                150,
                false
            );
        } catch (e) {
            console.warn("Can't remove comment, may it's doesn't exist?")
        }

        if (needRefresh) {
            if (getSetting('EnableVSCodeLayout')) {
                SideBar.clearContent();
                SideBar.setContent(createSideBarElements())
            } else {
                const content = document.querySelector("[class*='sa-todo-modal-content']");
                if (content) {
                    content.childNodes.forEach(ele => ele.remove());
                    content.appendChild(createSideBarElements())
                }
            }
        }
    }

    const getTodoList = () => {
        const vm = addon.tab.traps.vm;
        return vm.runtime.getTargetForStage().comments[COMMENT_ID] || getFormatComment(emptyTodo)
    }

    const getTodoListContent = () => {
        try {
            return JSON.parse(
                getTodoList()['text']
                    .split(POINT)[1]
            )
        } catch (e) {
            return emptyTodo
        }
    }

    const addNewTodo = config => {
        const editTodo = getTodoListContent();
        config = JSON.parse(JSON.stringify(config).replaceAll(POINT,
            `Why? ${POINT.split('').join(' ')} is key word, how did you found it?`
        ));
        if (config.mode === 1) {
            editTodo.groups = [
                ...editTodo.groups,
                {
                    id: config.id || generateId(),
                    name: config.name || msg("new-group"),
                    color: config.color || '#0099ff'
                }
            ]
        } else if (config.mode === 2) {
            editTodo.tasks = [
                ...editTodo.tasks,
                {
                    id: config.id || generateId(),
                    name: config.name || msg("new-task"),
                    startTime: config.task.startTime || Date.now(),
                    endTime: config.task.endTime || Date.now() + 100000086,
                    done: config.task.done || false,
                    groupId: config.task.tags || [],
                    color: config.color || "#0099ff",
                    steps: config.task.steps || []
                }
            ]
        }
        createCommentToStage(getFormatComment(editTodo))
    };

    const replaceTodo = config => {
        const editTodo = getTodoListContent();
        let editIndex = 0;
        config = JSON.parse(JSON.stringify(config).replaceAll(POINT,
            `Why? ${POINT.split('').join(' ')} is key word, how did you found it?`
        ));
        editIndex = editTodo.tasks.findIndex(task => task.id === config.id);
        editTodo.tasks[editIndex] = {
            id: config.id || generateId(),
            name: config.name || msg("New Group"),
            startTime: config.task.startTime || Date.now(),
            endTime: config.task.endTime || Date.now() + 100000086,
            done: config.task.done || false,
            groupId: config.task.tags || [],
            color: config.color || "#0099ff",
            steps: config.task.steps || []
        }
        createCommentToStage(getFormatComment(editTodo))
    }

    // ===== 在 Edit 菜单中添加 Todo 选项 =====
    while (true) {
        try {
            const editMenu = document.getElementById('edit');
            
            if (editMenu) {
                if (!editMenu.querySelector('.sa-todo-menu-item')) {

                    const existingItems = editMenu.querySelectorAll('li');
                    let lastItem = null;
                    if (existingItems.length > 0) {
                        lastItem = existingItems[existingItems.length - 1];
                    }

                    const menuItem = document.createElement('li');
                    menuItem.className = 'sa-todo-menu-item';
                    
                    if (lastItem) {
                        menuItem.className = lastItem.className + ' sa-todo-menu-item';
                        const computedStyle = window.getComputedStyle(lastItem);
                        menuItem.style.cssText = `
                            display: ${computedStyle.display};
                            align-items: ${computedStyle.alignItems};
                            padding: ${computedStyle.padding};
                            cursor: pointer;
                            font-size: ${computedStyle.fontSize};
                            color: ${computedStyle.color};
                            min-height: ${computedStyle.minHeight};
                            transition: background 0.1s ease;
                        `;
                    } else {
                        menuItem.style.cssText = `
                            display: flex;
                            align-items: center;
                            padding: 4px 16px;
                            cursor: pointer;
                            font-size: 0.85rem;
                            color: #575e75;
                            min-height: 36px;
                            transition: background 0.1s ease;
                        `;
                    }

                    const textSpan = document.createElement('span');
                    textSpan.className = 'sa-todo-menu-item-text';
                    textSpan.textContent = msg('todo');
                    menuItem.appendChild(textSpan);

                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.background = 'var(--ui-black-transparent)';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.background = '';
                    });

                    menuItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        try {
                            if (addon && addon.tab && addon.tab.redux) {
                                addon.tab.redux.dispatch({
                                    type: 'scratch-gui/menus/CLOSE_MENU',
                                    menu: 'editMenu'
                                });
                                addon.tab.redux.dispatch({
                                    type: 'scratch-gui/menus/CLOSE_EDIT_MENU'
                                });
                            }
                        } catch (err) {
                            console.log('[Todo] Redux error:', err);
                        }
                        
                        setTimeout(() => {
                            const { backdrop, container, content, closeButton, remove } = addon.tab.createModal(msg('title', { project: PROJECT_NAME.toString() }), {
                                isOpen: true,
                                useEditorClasses: true
                            });
                            container.classList.add('sa-todo-modal-popup');
                            content.classList.add('sa-todo-modal-content');
                            content.appendChild(createSideBarElements());
                            backdrop.addEventListener('click', remove);
                            closeButton.addEventListener('click', remove);
                        }, 100);
                    });

                    editMenu.appendChild(menuItem);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 0));
        } catch (e) {
            console.warn(e);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}