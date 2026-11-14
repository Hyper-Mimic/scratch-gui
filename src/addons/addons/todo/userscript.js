import dropdown from './dropdown-arrow.svg';
import done from './done.svg';
import undone from './undone.svg';
import edit from './edit.svg';
import remove from './remove.svg';
// 工具箱按钮的图标：显式走 url-loader，保证无论体积都被内联成 base64 data URI
import toolboxIcon from '!url-loader?{"esModule":false}!./check-correct.svg';
// 跨插件单弹窗守卫：打开本插件弹窗时关闭其它插件的弹窗
import {registerAddonModal, unregisterAddonModal} from '../../../lib/addon-modal-guard.js';
import {
    TODO_POINT,
    EMPTY_TODO,
    DEFAULT_DURATION,
    LEVELS,
    GROUP_COLORS,
    generateId,
    levelOf,
    taskColor,
    groupColorIndex,
    parseTodoList,
    formatTodoComment,
    normalizeTask,
    normalizeGroup,
    toDatetimeLocal,
    fromDatetimeLocal,
    getFormattedDateRange,
    getContrastColor
} from './model.js';

/* ============================================================
 * 内联依赖（原 src/addons/tools/AEsettings + src/addons/ui/side-bar）
 * 这些模块已随 tools/ ui/ 目录移除，此处内联等价实现
 * ============================================================ */

// 原 tools/AEsettings/index.js
const getSetting = id => {
    try {
        const settings = JSON.parse(localStorage.getItem('AESettings')) || {};
        if (!settings[id]) return false;
        return settings[id];
    } catch (e) {
        console.error('Failed to get setting:', e);
        return false;
    }
};

// 原 ui/side-bar/side-bar.js（精简版：仅保留 setContent/clearContent 核心能力）
const getSideBar = () => document.querySelectorAll('[class*=gui_tab-panel]')[0];

let sidebarInstance = null;

class SideBarInternal {
    constructor () {
        this.DEFAULT_WIDTH = 350;
        this.currentWidth = this.DEFAULT_WIDTH;

        this.element = document.createElement('div');
        this.element.className = 'addons-side-bar';
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

        this.contentContainer = document.createElement('div');
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

    setContent (content) {
        this.clearContent();
        this.contentContainer.appendChild(content);
    }

    clearContent () {
        this.contentContainer.innerHTML = '';
    }

    isOpen () {
        return this.element.style.display !== 'none';
    }

    open () {
        if (!document.contains(this.element)) {
            const sidebar = getSideBar();
            if (sidebar) sidebar.prepend(this.element);
        }
        this.element.style.display = 'flex';
        window.dispatchEvent(new Event('resize'));
    }

    close () {
        this.element.style.display = 'none';
        window.dispatchEvent(new Event('resize'));
    }
}

const SideBar = {
    setContent (content) {
        if (!sidebarInstance) sidebarInstance = new SideBarInternal();
        sidebarInstance.setContent(content);
    },
    clearContent () {
        if (sidebarInstance) sidebarInstance.clearContent();
    },
    open () {
        if (!sidebarInstance) sidebarInstance = new SideBarInternal();
        sidebarInstance.open();
    },
    close () {
        if (sidebarInstance) sidebarInstance.close();
    },
    isOpen () {
        return sidebarInstance ? sidebarInstance.isOpen() : false;
    }
};

/* ============================================================
 * 内联依赖结束
 * ============================================================ */

export default async function ({addon, msg}) {
    const POINT = TODO_POINT;
    const alpha = 'a0';
    let COMMENT_ID = 'todo';
    let PROJECT_NAME = '';
    let selectedGroup = null;
    let currentRemove = null;

    addon.tab.traps.vm.runtime.on('PROJECT_LOADED', () => {
        try {
            Object.values(addon.tab.traps.vm.runtime.getTargetForStage().comments).forEach(obj => {
                if (obj.id === COMMENT_ID) return;
                if (obj.text.indexOf(POINT) !== -1) {
                    COMMENT_ID = obj.id;
                }
            });
        } catch (e) {
            console.warn(e);
        }
    });

    await ReduxStore.subscribe(() => {
        PROJECT_NAME = ReduxStore.getState().scratchGui.projectTitle;
    });

    const getTextWidth = (() => {
        const el = document.createElement('span');
        el.style.cssText = 'position:fixed;visibility:hidden;white-space:nowrap;height:auto;width:auto';
        document.body.appendChild(el);
        return (text = 'hello world', fontSize = '16px', plus = 0,
            fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif') => {
            el.style.font = `${String(fontSize).endsWith('px') ? fontSize : fontSize + 'px'} ${fontFamily}`;
            el.textContent = text;
            return el.offsetWidth + plus + 'px';
        };
    })();

    const createDividerHeader = (title, isDashed = true) => {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'sa-todo-section-header';
        const titleElement = document.createElement('span');
        titleElement.className = 'sa-todo-section-title';
        titleElement.textContent = title;
        const divider = document.createElement('div');
        divider.className = isDashed ? 'sa-todo-divider-dashed' : 'sa-todo-divider';
        headerDiv.append(titleElement, divider);
        return headerDiv;
    };

    const createLabeledInput = (label, type, value, onInput) => {
        const wrap = document.createElement('div');
        wrap.className = 'sa-todo-modal-input';
        const text = document.createElement('span');
        text.textContent = label;
        const input = document.createElement('input');
        input.className = 'sa-todo-modal-input-input';
        if (type !== 'text') input.type = type;
        input.value = value === null || value === undefined ? '' : value;
        input.oninput = e => onInput(e.target.value);
        wrap.append(text, input);
        return {wrap, input};
    };

    /* ========================================================
     * 存取层：所有写操作都经过这里，旧字段 / 未知字段不丢
     * ======================================================== */
    const getTodoList = () => {
        try {
            const comments = addon.tab.traps.vm.runtime.getTargetForStage().comments;
            return comments[COMMENT_ID] || {text: formatTodoComment(EMPTY_TODO, POINT)};
        } catch (e) {
            return {text: formatTodoComment(EMPTY_TODO, POINT)};
        }
    };

    const getTodoListContent = () => parseTodoList(getTodoList().text, POINT);

    const refreshTodoView = () => {
        if (getSetting('EnableVSCodeLayout')) {
            SideBar.setContent(createSideBarElements());
            return;
        }
        const content = document.querySelector("[class*='sa-todo-modal-content']");
        if (content) {
            content.innerHTML = '';
            content.appendChild(createSideBarElements());
        }
    };

    const createCommentToStage = (content, needRefresh = true) => {
        try {
            const stage = addon.tab.traps.vm.runtime.getTargetForStage();
            delete stage.comments[COMMENT_ID];
            stage.createComment(COMMENT_ID, null, content, 50, 50, 350, 150, false);
        } catch (e) {
            console.warn("Can't write todo comment", e);
        }
        if (needRefresh) refreshTodoView();
    };

    const saveTodoList = (list, needRefresh = true) => {
        createCommentToStage(formatTodoComment(list, POINT), needRefresh);
    };

    const updateTaskById = (id, mutator, needRefresh = false) => {
        const list = getTodoListContent();
        const task = list.tasks.find(item => item.id === id);
        if (!task) return;
        mutator(task);
        saveTodoList(list, needRefresh);
    };

    // groupId 是现行字段，tags 是旧版本字段：两个都写，旧版本打开也不会丢分组。
    const setTaskInGroup = (task, groupId, checked) => {
        const ids = new Set(Array.isArray(task.groupId) ? task.groupId : []);
        if (checked) ids.add(groupId);
        else ids.delete(groupId);
        const next = Array.from(ids);
        task.groupId = next;
        task.tags = next.slice();
    };

    const findTask = id => getTodoListContent().tasks.find(task => task.id === id);

    /* ========================================================
     * 新建 / 编辑弹窗：类型由入口决定，弹窗内不切换任务 / 组
     * ======================================================== */
    const openEditorModal = (options = {}) => {
        const isNew = !options.item;
        const source = options.item || null;
        const hasSource = !!source;
        const listAtOpen = getTodoListContent();
        // 新建类型完全由入口按钮决定；弹窗内不再提供「任务 / 组」切换。
        const mode = options.mode === 'group' ? 'group' : 'task';

        const makeConfig = () => {
            if (mode === 'group') {
                return {
                    id: hasSource ? source.id : generateId(),
                    name: hasSource ? source.name : msg('new-group'),
                    colorIndex: hasSource ? groupColorIndex(source.color) : 0,
                    taskIds: hasSource
                        ? listAtOpen.tasks.filter(task => (task.groupId || []).includes(source.id)).map(task => task.id)
                        : []
                };
            }
            return {
                id: hasSource ? source.id : generateId(),
                name: hasSource ? source.name : msg('new-todo'),
                priority: hasSource ? source.priority : LEVELS[1].id,
                showTime: hasSource ? source.showTime : false,
                startTime: hasSource ? source.startTime : Date.now(),
                endTime: hasSource ? source.endTime : Date.now() + DEFAULT_DURATION,
                done: hasSource ? source.done : false,
                groupIds: hasSource ? (source.groupId || []).slice() : [],
                steps: hasSource ? source.steps.map(step => ({...step})) : []
            };
        };

        const config = makeConfig();
        const modalTitle = mode === 'task'
            ? (isNew ? msg('create-title') : msg('edit-title'))
            : (isNew ? msg('create-group-title') : msg('edit-group-title'));

        const {backdrop, container, content: contentMain, closeButton, remove: removeModal} =
            addon.tab.createModal(modalTitle, {isOpen: true, useEditorClasses: true});
        container.classList.add('sa-todo-popup');
        contentMain.classList.add('sa-todo-content');

        // 关闭链路必须先注册：后面任何一步构建 UI 抛错，弹窗都还能关掉。
        const closeModal = () => {
            unregisterAddonModal('todo-edit', closeModal);
            removeModal();
        };
        backdrop.addEventListener('click', closeModal);
        closeButton.addEventListener('click', closeModal);
        registerAddonModal('todo-edit', closeModal);

        const modalInner = document.createElement('div');
        modalInner.className = 'sa-todo-modal-inner';
        const tabContent = document.createElement('div');
        tabContent.className = 'sa-todo-tab-content';
        const fields = document.createElement('div');
        fields.className = 'sa-todo-editor-fields';
        tabContent.appendChild(fields);

        modalInner.appendChild(tabContent);

        const footer = document.createElement('div');
        footer.className = 'sa-todo-modal-button-container sa-todo-editor-footer';
        if (!isNew) {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'sa-todo-modal-delete-button';
            deleteButton.textContent = mode === 'group' ? msg('delete-group') : msg('delete');
            deleteButton.onclick = () => {
                const list = getTodoListContent();
                if (mode === 'task') {
                    list.tasks = list.tasks.filter(task => task.id !== config.id);
                } else {
                    list.groups = list.groups.filter(group => group.id !== config.id);
                    list.tasks.forEach(task => setTaskInGroup(task, config.id, false));
                    if (selectedGroup === config.id) selectedGroup = null;
                }
                saveTodoList(list);
                closeModal();
            };
            footer.appendChild(deleteButton);
        }
        const saveButton = document.createElement('button');
        saveButton.className = 'sa-todo-modal-create-button';
        saveButton.textContent = msg('save');
        footer.appendChild(saveButton);
        modalInner.appendChild(footer);
        contentMain.appendChild(modalInner);

        let refreshPreview = () => {};
        let updatePreviewHeader = () => {};

        const renderTaskFields = full => {
            full.appendChild(createDividerHeader(msg('edit'), true));

            // 名称
            const nameField = createLabeledInput(msg('name'), 'text', config.name, value => {
                config.name = value;
                updatePreviewHeader();
            });
            full.appendChild(nameField.wrap);

            // 重要等级：颜色由等级决定，不再提供自由取色
            const levelRow = document.createElement('div');
            levelRow.className = 'sa-todo-modal-input sa-todo-level-row';
            const levelLabel = document.createElement('span');
            levelLabel.textContent = msg('priority');
            const levelPicker = document.createElement('div');
            levelPicker.className = 'sa-todo-level-picker';
            LEVELS.forEach(level => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `sa-todo-level-btn${config.priority === level.id ? ' active' : ''}`;
                const dot = document.createElement('span');
                dot.className = 'sa-todo-level-dot';
                dot.style.backgroundColor = level.color;
                button.append(dot, document.createTextNode(msg(`level-${level.id}`)));
                button.onclick = () => {
                    config.priority = level.id;
                    Array.from(levelPicker.children).forEach((child, index) => {
                        child.classList.toggle('active', LEVELS[index].id === level.id);
                    });
                    refreshPreview();
                };
                levelPicker.appendChild(button);
            });
            levelRow.append(levelLabel, levelPicker);
            full.appendChild(levelRow);

            // 时间范围：可不开，也可在之后的修改里随时开关
            const switchRow = document.createElement('label');
            switchRow.className = 'sa-todo-switch-row';
            const switchInput = document.createElement('input');
            switchInput.type = 'checkbox';
            switchInput.className = 'sa-todo-checkbox';
            switchInput.checked = !!config.showTime;
            switchRow.append(switchInput, document.createTextNode(msg('show-time')));
            full.appendChild(switchRow);

            const timeFields = document.createElement('div');
            timeFields.className = 'sa-todo-time-fields';
            timeFields.style.display = config.showTime ? '' : 'none';
            const startField = createLabeledInput(msg('start-time'), 'datetime-local',
                toDatetimeLocal(config.startTime), value => {
                    config.startTime = fromDatetimeLocal(value);
                    updatePreviewHeader();
                });
            const endField = createLabeledInput(msg('end-time'), 'datetime-local',
                toDatetimeLocal(config.endTime), value => {
                    config.endTime = fromDatetimeLocal(value);
                    updatePreviewHeader();
                });
            const timeHint = document.createElement('p');
            timeHint.className = 'sa-todo-hint';
            timeHint.textContent = msg('time-hint');
            timeFields.append(startField.wrap, endField.wrap, timeHint);
            full.appendChild(timeFields);
            switchInput.onchange = e => {
                config.showTime = e.target.checked;
                timeFields.style.display = config.showTime ? '' : 'none';
                updatePreviewHeader();
            };

            // 所属组
            full.appendChild(createDividerHeader(msg('groups'), true));
            const groupSelector = document.createElement('div');
            groupSelector.className = 'sa-todo-group-selector';
            if (listAtOpen.groups.length === 0) {
                const empty = document.createElement('span');
                empty.className = 'sa-todo-hint';
                empty.textContent = msg('no-group');
                groupSelector.appendChild(empty);
            } else {
                listAtOpen.groups.forEach(group => {
                    const tag = document.createElement('button');
                    tag.type = 'button';
                    tag.textContent = group.name;
                    const active = config.groupIds.includes(group.id);
                    tag.className = `sa-todo-group-tag${active ? ' active' : ''}`;
                    tag.style.backgroundColor = group.color + (active ? '' : '60');
                    tag.onclick = () => {
                        const index = config.groupIds.indexOf(group.id);
                        if (index === -1) config.groupIds.push(group.id);
                        else config.groupIds.splice(index, 1);
                        tag.classList.toggle('active');
                        tag.style.backgroundColor = group.color + (config.groupIds.includes(group.id) ? '' : '60');
                    };
                    groupSelector.appendChild(tag);
                });
            }
            full.appendChild(groupSelector);

            // 预览 + 步骤
            full.appendChild(createDividerHeader(msg('preview'), true));
            const preview = document.createElement('div');
            preview.className = 'sa-todo-modal-preview';
            const previewTitle = document.createElement('span');
            previewTitle.className = 'sa-todo-modal-preview-title sa-todo-modal-preview-title-static';
            const previewDate = document.createElement('span');
            previewDate.className = 'sa-todo-modal-preview-date';
            const stepsList = document.createElement('ul');
            stepsList.className = 'sa-todo-modal-preview-steps';
            preview.append(previewTitle, previewDate, stepsList);
            full.appendChild(preview);

            const addStepButton = document.createElement('button');
            addStepButton.className = 'sa-todo-modal-create-button';
            addStepButton.textContent = msg('new-step');
            full.appendChild(addStepButton);

            const renderSteps = () => {
                stepsList.innerHTML = '';
                const color = levelOf(config.priority).color;
                const contrast = getContrastColor(color);
                config.steps.forEach((step, index) => {
                    const item = document.createElement('li');
                    item.className = 'sa-todo-modal-preview-steps-step';
                    const stepRemove = document.createElement('button');
                    stepRemove.type = 'button';
                    stepRemove.textContent = '×';
                    stepRemove.className = 'sa-todo-modal-preview-steps-step-remove';
                    stepRemove.style.backgroundColor = color;
                    stepRemove.style.color = contrast;
                    stepRemove.onclick = () => {
                        config.steps.splice(index, 1);
                        renderSteps();
                    };
                    const stepInput = document.createElement('input');
                    stepInput.className = 'sa-todo-modal-preview-steps-step-input';
                    stepInput.style.outlineColor = color;
                    stepInput.style.color = contrast;
                    stepInput.value = step.text;
                    stepInput.onchange = e => {
                        config.steps[index].text = e.target.value;
                    };
                    item.append(stepRemove, stepInput);
                    stepsList.appendChild(item);
                });
                const lastStep = config.steps[config.steps.length - 1];
                if (lastStep && lastStep.latest) {
                    const inputs = stepsList.querySelectorAll('.sa-todo-modal-preview-steps-step-input');
                    if (inputs.length) {
                        setTimeout(() => {
                            inputs[inputs.length - 1].focus();
                            inputs[inputs.length - 1].select();
                        }, 0);
                    }
                    lastStep.latest = false;
                }
            };

            updatePreviewHeader = () => {
                const color = levelOf(config.priority).color;
                const contrast = getContrastColor(color);
                previewTitle.textContent = config.name;
                previewTitle.style.color = contrast;
                preview.style.backgroundColor = color + alpha;
                previewDate.style.color = contrast;
                previewDate.textContent = config.showTime
                    ? getFormattedDateRange(config.startTime, config.endTime)
                    : '';
                previewDate.style.display = previewDate.textContent ? '' : 'none';
            };
            refreshPreview = () => {
                updatePreviewHeader();
                renderSteps();
            };

            addStepButton.onclick = () => {
                config.steps.push({id: generateId(), text: msg('new-step'), latest: true, done: false});
                renderSteps();
            };
            refreshPreview();
        };

        const renderGroupFields = full => {
            full.appendChild(createDividerHeader(msg('edit'), true));
            const nameField = createLabeledInput(msg('name'), 'text', config.name, value => {
                config.name = value;
            });
            full.appendChild(nameField.wrap);

            // 组颜色：预设色板，不允许任意取色
            const colorRow = document.createElement('div');
            colorRow.className = 'sa-todo-modal-input';
            const colorLabel = document.createElement('span');
            colorLabel.textContent = msg('group-color');
            const swatches = document.createElement('div');
            swatches.className = 'sa-todo-swatches';
            GROUP_COLORS.forEach((color, index) => {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = `sa-todo-swatch${index === config.colorIndex ? ' active' : ''}`;
                swatch.style.backgroundColor = color;
                swatch.title = color;
                swatch.onclick = () => {
                    config.colorIndex = index;
                    Array.from(swatches.children).forEach((child, childIndex) => {
                        child.classList.toggle('active', childIndex === index);
                    });
                };
                swatches.appendChild(swatch);
            });
            colorRow.append(colorLabel, swatches);
            full.appendChild(colorRow);

            // 组内项目：勾选加入、取消勾选移出，任务本身不会被删
            full.appendChild(createDividerHeader(msg('group-tasks'), true));
            const hint = document.createElement('p');
            hint.className = 'sa-todo-hint';
            hint.textContent = msg('group-tasks-tip');
            full.appendChild(hint);
            const taskListEl = document.createElement('div');
            taskListEl.className = 'sa-todo-group-task-list';
            if (listAtOpen.tasks.length === 0) {
                const empty = document.createElement('span');
                empty.className = 'sa-todo-hint';
                empty.textContent = msg('no-task');
                taskListEl.appendChild(empty);
            } else {
                listAtOpen.tasks.forEach(task => {
                    const label = document.createElement('label');
                    label.className = 'sa-todo-group-task-item';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'sa-todo-checkbox';
                    checkbox.checked = config.taskIds.includes(task.id);
                    checkbox.onchange = e => {
                        if (e.target.checked) {
                            if (!config.taskIds.includes(task.id)) config.taskIds.push(task.id);
                        } else {
                            config.taskIds = config.taskIds.filter(id => id !== task.id);
                        }
                    };
                    const dot = document.createElement('span');
                    dot.className = 'sa-todo-group-task-dot';
                    dot.style.backgroundColor = taskColor(task);
                    const text = document.createElement('span');
                    text.textContent = task.name;
                    label.append(checkbox, dot, text);
                    taskListEl.appendChild(label);
                });
            }
            full.appendChild(taskListEl);

            if (!isNew) {
                const deleteHint = document.createElement('p');
                deleteHint.className = 'sa-todo-hint';
                deleteHint.textContent = msg('delete-group-tip');
                full.appendChild(deleteHint);
            }
        };

        const renderFields = () => {
            fields.innerHTML = '';
            const row = document.createElement('div');
            row.className = 'sa-todo-control-row sa-todo-control-row-full';
            const full = document.createElement('div');
            full.className = 'sa-todo-control-full';
            row.appendChild(full);
            fields.appendChild(row);
            if (mode === 'task') renderTaskFields(full);
            else renderGroupFields(full);
        };
        renderFields();

        saveButton.onclick = () => {
            const list = getTodoListContent();
            const name = (String(config.name || '').trim()) ||
                (mode === 'task' ? msg('new-todo') : msg('new-group'));
            if (mode === 'task') {
                const level = levelOf(config.priority);
                const previous = isNew ? null : list.tasks.find(task => task.id === config.id);
                const now = Date.now();
                const record = normalizeTask({
                    ...(previous || {}),
                    id: config.id,
                    name,
                    priority: level.id,
                    color: level.color,
                    showTime: !!config.showTime,
                    // 时间戳始终保留：旧版本仍能读出时间，showTime 只控制新 UI 是否显示。
                    startTime: config.startTime === null || config.startTime === undefined ? now : config.startTime,
                    endTime: config.endTime === null || config.endTime === undefined
                        ? now + DEFAULT_DURATION
                        : config.endTime,
                    done: !!config.done,
                    groupId: config.groupIds.slice(),
                    tags: config.groupIds.slice(),
                    steps: config.steps.map(({latest, ...step}) => ({
                        ...step,
                        id: step.id || generateId(),
                        text: step.text || '',
                        done: !!step.done
                    }))
                });
                if (previous) list.tasks[list.tasks.indexOf(previous)] = record;
                else list.tasks.push(record);
            } else {
                const previous = isNew ? null : list.groups.find(group => group.id === config.id);
                const record = normalizeGroup({
                    ...(previous || {}),
                    id: config.id,
                    name,
                    color: GROUP_COLORS[config.colorIndex] || GROUP_COLORS[0]
                });
                if (previous) list.groups[list.groups.indexOf(previous)] = record;
                else list.groups.push(record);
                const chosen = new Set(config.taskIds);
                list.tasks.forEach(task => setTaskInGroup(task, record.id, chosen.has(task.id)));
            }
            saveTodoList(list);
            closeModal();
        };
    };

    /* ========================================================
     * 主列表
     * ======================================================== */
    const createSideBarElements = () => {
        const isVSCL = getSetting('EnableVSCodeLayout');
        const content = document.createElement('div');
        content.className = 'sa-todo';
        const title = document.createElement('h1');
        title.textContent = msg('title', {project: PROJECT_NAME.toString()});

        const list = getTodoListContent();
        let groupBar = null;

        if (list.groups.length > 0) {
            groupBar = document.createElement('div');
            groupBar.className = 'sa-todo-group-bar';

            const allBtn = document.createElement('button');
            allBtn.className = `sa-todo-group-btn${selectedGroup === null ? ' active' : ''}`;
            allBtn.textContent = msg('all');
            allBtn.onclick = () => {
                selectedGroup = null;
                refreshTodoView();
            };
            groupBar.appendChild(allBtn);

            list.groups.forEach(group => {
                const chip = document.createElement('div');
                chip.className = 'sa-todo-group-chip';
                const active = selectedGroup === group.id;
                chip.style.backgroundColor = group.color + (active ? '' : '60');
                const contrast = getContrastColor(group.color);

                const btn = document.createElement('button');
                btn.className = `sa-todo-group-btn${active ? ' active' : ''}`;
                btn.textContent = group.name;
                btn.onclick = () => {
                    selectedGroup = group.id;
                    refreshTodoView();
                };

                const editBtn = document.createElement('img');
                editBtn.src = edit;
                editBtn.className = 'sa-todo-group-action';
                editBtn.title = msg('edit-group-title');
                editBtn.style.filter = `brightness(${contrast === '#000000' ? 0 : 1})`;
                editBtn.onclick = e => {
                    e.stopPropagation();
                    openEditorModal({mode: 'group', item: group});
                };

                const removeBtn = document.createElement('img');
                removeBtn.src = remove;
                removeBtn.className = 'sa-todo-group-action';
                removeBtn.title = msg('delete-group');
                removeBtn.style.filter = `brightness(${contrast === '#000000' ? 0 : 1})`;
                removeBtn.onclick = e => {
                    e.stopPropagation();
                    const current = getTodoListContent();
                    current.groups = current.groups.filter(item => item.id !== group.id);
                    current.tasks.forEach(task => setTaskInGroup(task, group.id, false));
                    if (selectedGroup === group.id) selectedGroup = null;
                    saveTodoList(current);
                };

                chip.append(btn, editBtn, removeBtn);
                groupBar.appendChild(chip);
            });
        }

        const todoList = document.createElement('ul');
        todoList.className = 'sa-todo-list';
        const visibleTasks = selectedGroup === null
            ? list.tasks
            : list.tasks.filter(task => (task.groupId || []).includes(selectedGroup));

        if (visibleTasks.length === 0) {
            const tip = document.createElement('span');
            tip.textContent = msg('no-todo');
            tip.className = 'sa-todo-list-empty-tip';
            todoList.appendChild(tip);
        } else {
            visibleTasks.forEach(task => {
                const color = taskColor(task);
                const textColor = getContrastColor(color);
                let isHide = true;

                const todoEle = document.createElement('li');
                todoEle.className = 'sa-todo-list-ele';
                todoEle.style.backgroundColor = color + alpha;

                const groupColors = (task.groupId || [])
                    .map(id => list.groups.find(group => group.id === id))
                    .filter(Boolean);
                if (groupColors.length > 0) {
                    const groupTip = document.createElement('div');
                    groupTip.className = 'sa-todo-list-ele-group_tip';
                    groupColors.forEach(group => {
                        const block = document.createElement('div');
                        block.className = 'sa-todo-list-ele-group_tip-block';
                        block.style.backgroundColor = group.color;
                        groupTip.appendChild(block);
                    });
                    todoEle.appendChild(groupTip);
                }

                const card = document.createElement('div');
                card.className = 'sa-todo-list-ele-titleDiv';

                const name = document.createElement('span');
                name.className = 'sa-todo-list-ele-title';
                name.style.color = textColor;
                name.textContent = task.name;

                const strike = document.createElement('div');
                strike.textContent = task.name;
                strike.style.setProperty('--width', getTextWidth(task.name, '18px', 15));
                strike.style.marginLeft = task.steps.length !== 0 ? '75px' : '40px';
                strike.className = 'sa-todo-list-ele-title sa-todo-list-ele-title-rmLine';
                strike.style.textDecorationColor = textColor;

                const doneBtn = document.createElement('img');
                doneBtn.src = task.done ? undone : done;
                doneBtn.className = 'sa-todo-list-ele-done';
                doneBtn.style.backgroundColor = color;

                const editBtn = document.createElement('img');
                editBtn.src = edit;
                editBtn.className = 'sa-todo-list-ele-done';
                editBtn.style.backgroundColor = color;
                editBtn.title = msg('edit');
                editBtn.onclick = () => openEditorModal({mode: 'task', item: task});

                const removeBtn = document.createElement('img');
                removeBtn.src = remove;
                removeBtn.className = 'sa-todo-list-ele-done';
                removeBtn.style.backgroundColor = color;
                removeBtn.title = msg('delete');
                removeBtn.onclick = () => {
                    const current = getTodoListContent();
                    current.tasks = current.tasks.filter(item => item.id !== task.id);
                    saveTodoList(current);
                };

                const date = document.createElement('span');
                date.className = 'sa-todo-list-ele-date';
                date.style.color = textColor;
                if (task.showTime) {
                    date.textContent = getFormattedDateRange(task.startTime, task.endTime);
                }

                const stepsContent = document.createElement('ul');
                const spawnSteps = initial => {
                    const fresh = initial || findTask(task.id) || task;
                    stepsContent.innerHTML = '';
                    stepsContent.className = 'sa-todo-list-ele-steps';
                    stepsContent.id = fresh.id;
                    const main = document.createElement('li');
                    main.className = 'sa-todo-list-ele-steps-main';
                    [false, true].forEach(needDone => {
                        if (needDone && fresh.steps.some(step => step.done)) {
                            const lineDiv = document.createElement('li');
                            lineDiv.className = 'sa-todo-list-ele-line';
                            const before = document.createElement('hr');
                            before.className = 'sa-todo-list-ele-line-line';
                            const label = document.createElement('span');
                            label.className = 'sa-todo-list-ele-line-text';
                            label.style.color = textColor;
                            label.textContent = msg('done');
                            const after = document.createElement('hr');
                            after.className = 'sa-todo-list-ele-line-line';
                            lineDiv.append(before, label, after);
                            main.appendChild(lineDiv);
                        }
                        fresh.steps.forEach(step => {
                            if (!!step.done !== needDone) return;
                            const stepItem = document.createElement('li');
                            stepItem.className = 'sa-todo-list-ele-steps-li';
                            const stepDone = document.createElement('img');
                            stepDone.src = needDone ? undone : done;
                            stepDone.className = 'sa-todo-list-ele-done';
                            stepDone.style.backgroundColor = color;
                            stepDone.onclick = () => {
                                updateTaskById(task.id, record => {
                                    const target = record.steps.find(item => item.id === step.id);
                                    if (target) target.done = !target.done;
                                });
                                spawnSteps();
                            };
                            const stepText = document.createElement('span');
                            stepText.textContent = `${fresh.steps.indexOf(step) + 1}.${step.text}`;
                            if (needDone) stepText.style.opacity = 0.5;
                            stepText.style.color = textColor;
                            stepItem.append(stepDone, stepText);
                            main.appendChild(stepItem);
                        });
                    });
                    stepsContent.appendChild(main);
                };
                spawnSteps(task);

                const refreshTodoStyle = isDone => {
                    todoEle.classList.toggle('done', isDone);
                    strike.style.width = isDone ? '' : '0px';
                    name.style.opacity = isDone ? 0.5 : 1;
                };

                const dropdownBtn = document.createElement('img');
                dropdownBtn.src = dropdown;
                dropdownBtn.className = 'sa-todo-list-ele-titleDiv-dropdown';
                const refreshDropdown = () => {
                    dropdownBtn.style.transform = isHide ? 'rotate(180deg)' : 'rotate(0deg)';
                    stepsContent.style.gridTemplateRows = isHide ? '0fr' : '1fr';
                };
                dropdownBtn.onclick = () => {
                    isHide = !isHide;
                    refreshDropdown();
                };

                doneBtn.onclick = () => {
                    updateTaskById(task.id, record => {
                        record.done = !record.done;
                    });
                    const fresh = findTask(task.id);
                    doneBtn.src = fresh && fresh.done ? undone : done;
                    refreshTodoStyle(fresh ? fresh.done : false);
                };

                if (task.steps.length !== 0) card.appendChild(dropdownBtn);
                card.append(doneBtn, name, strike, removeBtn, editBtn);
                todoEle.append(card);
                if (task.showTime && date.textContent) todoEle.appendChild(date);
                todoEle.appendChild(stepsContent);
                refreshDropdown();
                refreshTodoStyle(task.done);
                todoList.appendChild(todoEle);
            });
        }

        const actions = document.createElement('div');
        actions.className = 'sa-todo-actions';
        const addButton = document.createElement('button');
        addButton.className = `sa-todo-add-todo ${addon.tab.scratchClass('prompt_ok-button')}`;
        addButton.textContent = msg('add');
        addButton.onclick = () => openEditorModal({mode: 'task'});
        const addGroupButton = document.createElement('button');
        addGroupButton.className = 'sa-todo-add-group';
        addGroupButton.textContent = msg('add-group');
        addGroupButton.onclick = () => openEditorModal({mode: 'group'});
        actions.append(addButton, addGroupButton);

        // Only this part scrolls; the action row stays pinned as a footer.
        const scrollArea = document.createElement('div');
        scrollArea.className = 'sa-todo-scroll';
        if (isVSCL) scrollArea.appendChild(title);
        if (groupBar) scrollArea.appendChild(groupBar);
        scrollArea.appendChild(todoList);
        content.append(scrollArea, actions);
        return content;
    };

    /* ========================================================
     * 主弹窗 / 工具箱按钮
     * ======================================================== */
    // Track the open modal so a locale switch (fires `reenabled`) can force-close it.
    // The modal is native DOM (built with `msg()`), so switching locale leaves stale
    // strings; closing is the simplest correct behaviour.
    addon.self.addEventListener('reenabled', () => {
        if (currentRemove) {
            const closePrevious = currentRemove;
            currentRemove = null;
            unregisterAddonModal('todo', closePrevious);
            closePrevious();
        }
        // 切语言后刷新工具箱按钮文案：registry 按 id 去重，重注册即触发 toolbox 浮层
        // _refresh 更新 title/aria-label，高级设置的「排列顺序」面板也随 notify 重绘。
        registerToolboxButton();
    });

    const openTodoModal = () => {
        // Self-guard: a second open closes the previous one instead of stacking.
        if (currentRemove) {
            const closePrevious = currentRemove;
            currentRemove = null;
            unregisterAddonModal('todo', closePrevious);
            closePrevious();
        }
        const {backdrop, container, content, closeButton, remove: removeModal} =
            addon.tab.createModal(msg('title', {project: PROJECT_NAME.toString()}), {
                isOpen: true,
                useEditorClasses: true
            });
        currentRemove = removeModal;
        registerAddonModal('todo', removeModal);
        container.classList.add('sa-todo-modal-popup');
        content.classList.add('sa-todo-modal-content');
        const close = () => {
            unregisterAddonModal('todo', removeModal);
            currentRemove = null;
            removeModal();
        };
        backdrop.addEventListener('click', close);
        closeButton.addEventListener('click', close);
        content.appendChild(createSideBarElements());
    };

    // 抽成函数：切语言时框架派发 `reenabled`，需重新注册以刷新 label（registry 按 id 去重，
    // 重注册会触发 toolbox 浮层 _refresh 刷新 title/aria-label，设置面板顺序也随之刷新）。
    function registerToolboxButton () {
        addon.tab.addWorkspaceToolboxButton({
            id: 'todo',
            label: msg('todo'),
            icon: toolboxIcon,
            action: () => openTodoModal()
        });
    }
    registerToolboxButton();
}
