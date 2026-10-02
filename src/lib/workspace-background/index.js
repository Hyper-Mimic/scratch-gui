/**
 * Workspace background.
 *
 * This used to be the "background" addon. It is now a core feature so the advanced settings
 * modal can offer it without going through the addon system (and without the addon needing to
 * be installed or enabled). The overlay it paints behind the block workspace and the panel in
 * the settings modal both live here.
 *
 * The IndexedDB name is deliberately left as `sa-background`: it is what the addon used, so
 * wallpapers saved before this code moved still show up.
 */

import {defineMessages} from 'react-intl';
import cssModule from '!css-loader?{"esModule":false}!./workspace-background.css';
// Shared with the workspace toolbox's order panel: the checkbox is the same control in both, and
// neither panel's stylesheet should be what decides whether the other one is styled.
import tinyCheckboxCss from '!css-loader?{"esModule":false}!../../css/hm-tiny-checkbox.css';

const STYLE_ELEMENT_ID = 'hm-workspace-background-styles';

const messages = defineMessages({
    'add': {
        defaultMessage: 'Add background image',
        description: 'Button that opens the file picker for a workspace background',
        id: 'hm.workspaceBackground.add'
    },
    'replace': {
        defaultMessage: 'Replace background image',
        description: 'Button that opens the file picker while wallpaper rotation is on',
        id: 'hm.workspaceBackground.replace'
    },
    'disable': {
        defaultMessage: 'Disable',
        description: 'Button that turns the workspace background off',
        id: 'hm.workspaceBackground.disable'
    },
    'background-workspace': {
        defaultMessage: 'Workspace background',
        description: 'Alt text for the workspace background preview',
        id: 'hm.workspaceBackground.previewAlt'
    },
    'background-preview-empty': {
        defaultMessage: 'No wallpaper selected',
        description: 'Placeholder shown when no wallpaper is selected',
        id: 'hm.workspaceBackground.previewEmpty'
    },
    'background-layout': {
        defaultMessage: 'Layout',
        description: 'Label of the workspace background layout setting',
        id: 'hm.workspaceBackground.layout'
    },
    'background-layout-stretch': {
        defaultMessage: 'Stretch',
        description: 'Option of the workspace background layout setting',
        id: 'hm.workspaceBackground.layout.stretch'
    },
    'background-layout-height-priority': {
        defaultMessage: 'Height Priority',
        description: 'Option of the workspace background layout setting',
        id: 'hm.workspaceBackground.layout.heightPriority'
    },
    'background-layout-width-priority': {
        defaultMessage: 'Width Priority',
        description: 'Option of the workspace background layout setting',
        id: 'hm.workspaceBackground.layout.widthPriority'
    },
    'background-layout-fit': {
        defaultMessage: 'Fit',
        description: 'Option of the workspace background layout setting',
        id: 'hm.workspaceBackground.layout.fit'
    },
    'background-blur': {
        defaultMessage: 'Blur',
        description: 'Label of the workspace background blur setting',
        id: 'hm.workspaceBackground.blur'
    },
    'background-opacity': {
        defaultMessage: 'Opacity',
        description: 'Label of the workspace background opacity setting',
        id: 'hm.workspaceBackground.opacity'
    },
    'background-offset-x': {
        defaultMessage: 'Horizontal offset',
        description: 'Label of the workspace background horizontal offset setting',
        id: 'hm.workspaceBackground.offsetX'
    },
    'background-offset-y': {
        defaultMessage: 'Vertical offset',
        description: 'Label of the workspace background vertical offset setting',
        id: 'hm.workspaceBackground.offsetY'
    },
    'rotation-enable': {
        defaultMessage: 'Enable wallpaper rotation',
        description: 'Label of the wallpaper rotation toggle',
        id: 'hm.workspaceBackground.rotationEnable'
    },
    'rotation-interval': {
        defaultMessage: 'Interval (minutes): ',
        description: 'Label of the wallpaper rotation interval setting',
        id: 'hm.workspaceBackground.rotationInterval'
    },
    'rotate-now': {
        defaultMessage: 'Rotate now',
        description: 'Button that switches to the next wallpaper immediately',
        id: 'hm.workspaceBackground.rotateNow'
    },
    'animation-duration': {
        defaultMessage: 'Animation Duration (ms)',
        description: 'Label of the wallpaper transition duration setting',
        id: 'hm.workspaceBackground.animationDuration'
    }
});

// Only the workspace-background half of the addon's defaults; the modal-background keys went
// away with the addon.
const DEFAULT_SETTINGS = {
    WorkSpaceBGBlur: 2,
    WorkSpaceBGOpacity: 0.2,
    WorkSpaceBGLayout: 'fit',
    WorkSpaceBGOffsetX: 0,
    WorkSpaceBGOffsetY: 0,
    WorkSpaceBGAnimationDuration: 500,
    EnableWorkSpaceBG: true,
    WallpaperRotationEnabled: false,
    WallpaperRotationIntervalMinutes: 5,
    currentWallpaperId: null,
    WallpaperRotationIndex: 0,
    WallpaperRotationList: null
};

let bgDB = null;
let isRefreshingBG = false;
let wallpaperTransitionTimeout = null;
let wallpaperRefreshToken = 0;
let styleInjected = false;
let startupPromise = null;

const injectStyles = () => {
    if (styleInjected || typeof document === 'undefined') return;
    styleInjected = true;
    // css-loader hands back its classic [id, css, ...] list here, not a module object, because
    // the imports above opt out of ES modules.
    const toText = mod => (Array.isArray(mod) ? mod.map(entry => entry[1]).join('\n') : String(mod));
    const cssText = toText(cssModule) + '\n' + toText(tinyCheckboxCss);
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = cssText;
    document.head.appendChild(style);
};

// ===== 修改 applySettings，使用默认值 =====
async function applySettings(id, value) {
    const nowSettings = await bgDB.getSetting('settings') || {};
    // 如果值为 undefined 或 null，使用默认值
    if (value === undefined || value === null) {
        value = DEFAULT_SETTINGS[id] ?? null;
    }
    nowSettings[id] = value;
    await bgDB.saveSetting('settings', nowSettings);
}

// ===== 修改 getSetting，返回默认值 =====
async function getSetting(id) {
    try {
        const nowSettings = await bgDB.getSetting('settings') || {};
        const value = nowSettings[id];
        // 如果值为 undefined 或 null，返回默认值
        if (value === undefined || value === null) {
            return DEFAULT_SETTINGS[id] ?? null;
        }
        return value;
    } catch (e) {
        // 出错时也返回默认值
        return DEFAULT_SETTINGS[id] ?? null;
    }
}

class BackgroundDB {
    constructor(dbName = 'sa-background', version = 2) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.settingsStore = 'settings_store';
        this.wallpapersStore = 'wallpapers_store';
    }

    open() {
        return new Promise((resolve, reject) => {
            const indexedDB = window.indexedDB ||
                window.mozIndexedDB ||
                window.webkitIndexedDB ||
                window.msIndexedDB;

            const request = indexedDB.open(this.dbName, this.version);

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.log('Cannot open indexedDB:', event);
                reject(event);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.settingsStore)) {
                    db.createObjectStore(this.settingsStore, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(this.wallpapersStore)) {
                    db.createObjectStore(this.wallpapersStore, { keyPath: 'id' });
                }

                if (db.objectStoreNames.contains('background_store')) {
                    const transaction = event.target.transaction;
                    const oldStore = transaction.objectStore('background_store');
                    const newStore = transaction.objectStore(this.wallpapersStore);
                    oldStore.openCursor().onsuccess = (cursorEvent) => {
                        const cursor = cursorEvent.target.result;
                        if (!cursor) return;
                        const record = cursor.value;
                        const wallpaper = {
                            id: cursor.key,
                            name: 'Workspace Background',
                            link: typeof record === 'object' && record.link ? record.link : record,
                            enabled: true,
                            addedAt: new Date().toISOString()
                        };
                        newStore.put(wallpaper);
                        cursor.continue();
                    };
                }
            };
        });
    }

    saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.settingsStore], 'readwrite');
            const store = transaction.objectStore(this.settingsStore);
            const request = store.put({ key, value });
            request.onsuccess = () => resolve();
            request.onerror = (e) => {
                console.log('IndexedDB saveSetting failed', e);
                reject(e);
            };
        });
    }

    getSetting(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.settingsStore], 'readonly');
            const store = transaction.objectStore(this.settingsStore);
            const request = store.get(key);
            request.onsuccess = (e) => {
                const record = e.target.result;
                resolve(record ? record.value : null);
            };
            request.onerror = (e) => {
                console.log('IndexedDB getSetting failed', e);
                reject(e);
            };
        });
    }

    saveWallpaper(wallpaper) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.wallpapersStore], 'readwrite');
            const store = transaction.objectStore(this.wallpapersStore);
            const wallpaperRecord = Object.assign({
                id: wallpaper.id || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`),
                name: wallpaper.name || 'Wallpaper',
                link: wallpaper.link || null,
                enabled: typeof wallpaper.enabled === 'boolean' ? wallpaper.enabled : true,
                addedAt: wallpaper.addedAt || new Date().toISOString()
            }, wallpaper);
            const request = store.put(wallpaperRecord);
            request.onsuccess = () => resolve(wallpaperRecord);
            request.onerror = (e) => {
                console.log('IndexedDB saveWallpaper failed', e);
                reject(e);
            };
        });
    }

    getWallpaper(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.wallpapersStore], 'readonly');
            const store = transaction.objectStore(this.wallpapersStore);
            const request = store.get(id);
            request.onsuccess = (e) => {
                resolve(e.target.result || null);
            };
            request.onerror = (e) => {
                console.log('IndexedDB getWallpaper failed', e);
                reject(e);
            };
        });
    }

    listWallpapers({ enabledOnly = false } = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.wallpapersStore], 'readonly');
            const store = transaction.objectStore(this.wallpapersStore);
            const request = store.getAll();
            request.onsuccess = (e) => {
                let records = e.target.result || [];
                if (enabledOnly) {
                    records = records.filter((item) => item.enabled !== false);
                }
                resolve(records);
            };
            request.onerror = (e) => {
                console.log('IndexedDB listWallpapers failed', e);
                reject(e);
            };
        });
    }

    deleteWallpaper(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.wallpapersStore], 'readwrite');
            const store = transaction.objectStore(this.wallpapersStore);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }
}

function applyBackgroundLayout({
    image,
    containerWidth,
    containerHeight,
    mode = 'fit',
    offsetX = 0,
    offsetY = 0
}) {
    if (!image || !containerWidth || !containerHeight) return;

    image.style.objectFit = 'none';
    image.style.width = 'auto';
    image.style.height = 'auto';
    image.style.left = '0';
    image.style.top = '0';
    image.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    switch (mode) {
        case 'stretch':
            image.style.width = `${containerWidth}px`;
            image.style.height = `${containerHeight}px`;
            image.style.objectFit = 'fill';
            break;
        case 'height-priority':
            image.style.height = `${containerHeight}px`;
            break;
        case 'width-priority':
            image.style.width = `${containerWidth}px`;
            break;
        case 'fit':
            image.style.width = `${containerWidth}px`;
            image.style.height = `${containerHeight}px`;
            image.style.objectFit = 'cover';
            break;
    }
}

let wallpaperRotationTimer = null;

function getWallpaperRotationInterval(settings = {}) {
    const intervalMinutes = Number(settings.WallpaperRotationIntervalMinutes);
    return intervalMinutes > 0 ? intervalMinutes * 60 * 1000 : 5 * 60 * 1000;
}

async function getWallpaperRotationList(settings = null) {
    const resolvedSettings = settings || await bgDB.getSetting('settings') || {};
    const savedList = Array.isArray(resolvedSettings.WallpaperRotationList) ? resolvedSettings.WallpaperRotationList : null;
    if (savedList && savedList.length) {
        const validIds = [];
        const seenIds = new Set();
        for (const wallpaperId of savedList) {
            if (seenIds.has(wallpaperId)) continue;
            seenIds.add(wallpaperId);
            const wallpaper = await bgDB.getWallpaper(wallpaperId);
            if (wallpaper && wallpaper.enabled !== false) {
                validIds.push(wallpaperId);
            }
        }
        if (validIds.length > 0) {
            return validIds;
        }
    }
    const wallpapers = await bgDB.listWallpapers({ enabledOnly: true });
    return wallpapers.map((item) => item.id);
}

async function syncWallpaperSelection({ preferredId = null, settings = null } = {}) {
    const resolvedSettings = settings || await bgDB.getSetting('settings') || {};
    const list = await getWallpaperRotationList(resolvedSettings);
    if (!list.length) {
        await applySettings('WallpaperRotationIndex', 0);
        await applySettings('currentWallpaperId', null);
        return null;
    }

    let selectedId = preferredId;
    if (!selectedId || !list.includes(selectedId)) {
        const savedCurrentWallpaperId = resolvedSettings.currentWallpaperId;
        if (savedCurrentWallpaperId && list.includes(savedCurrentWallpaperId)) {
            selectedId = savedCurrentWallpaperId;
        }
    }
    if (!selectedId || !list.includes(selectedId)) {
        const savedIndex = Number(resolvedSettings.WallpaperRotationIndex);
        if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < list.length) {
            selectedId = list[savedIndex];
        }
    }
    if (!selectedId || !list.includes(selectedId)) {
        selectedId = list[0];
    }

    const selectedIndex = list.indexOf(selectedId);
    await applySettings('WallpaperRotationIndex', selectedIndex);
    await applySettings('currentWallpaperId', selectedId);
    return {
        list,
        wallpaperId: selectedId,
        index: selectedIndex
    };
}

async function advanceWallpaperRotationIndex() {
    const settings = await bgDB.getSetting('settings') || {};
    const syncedSelection = await syncWallpaperSelection({ settings });
    if (!syncedSelection) return null;
    const { list, index: currentIndex } = syncedSelection;
    const nextIndex = (currentIndex + 1) % list.length;
    await applySettings('WallpaperRotationIndex', nextIndex);
    await applySettings('currentWallpaperId', list[nextIndex]);
    return list[nextIndex];
}

async function stopWallpaperRotationTimer() {
    if (wallpaperRotationTimer !== null) {
        window.clearTimeout(wallpaperRotationTimer);
        wallpaperRotationTimer = null;
    }
}

async function scheduleWallpaperRotationTimer() {
    await stopWallpaperRotationTimer();
    const settings = await bgDB.getSetting('settings') || {};
    if (!settings.WallpaperRotationEnabled) return;
    const interval = getWallpaperRotationInterval(settings);
    wallpaperRotationTimer = window.setTimeout(async () => {
        try {
            await advanceWallpaperRotationIndex();
            await refreshWorkSpaceBackground();
        } catch (e) {
            console.warn('Wallpaper rotation timer error:', e);
        } finally {
            await scheduleWallpaperRotationTimer();
        }
    }, interval);
}

async function initializeWallpaperRotation() {
    const enabled = await getSetting('WallpaperRotationEnabled');
    if (enabled) {
        await scheduleWallpaperRotationTimer();
    } else {
        await stopWallpaperRotationTimer();
    }
}

function clearWallpaperTransitionTimeout() {
    if (wallpaperTransitionTimeout !== null) {
        window.clearTimeout(wallpaperTransitionTimeout);
        wallpaperTransitionTimeout = null;
    }
}

async function setCurrentWallpaperId(id) {
    await applySettings('currentWallpaperId', id);
    await applySettings('EnableWorkSpaceBG', true);
    await syncWallpaperSelection({ preferredId: id });
    await refreshWorkSpaceBackground();
}

async function updateWallpaperEnabled(id, enabled) {
    const wallpaper = await bgDB.getWallpaper(id);
    if (!wallpaper) return;
    wallpaper.enabled = enabled;
    await bgDB.saveWallpaper(wallpaper);
    await syncWallpaperSelection();
    await refreshWorkSpaceBackground();
}

async function deleteWallpaperAndRefresh(id) {
    await bgDB.deleteWallpaper(id);
    const currentId = await getSetting('currentWallpaperId');
    if (currentId === id) {
        await applySettings('currentWallpaperId', null);
    }
    await syncWallpaperSelection();
    await refreshWorkSpaceBackground();
}

async function getActiveWorkspaceWallpaper() {
    const settings = await bgDB.getSetting('settings') || {};
    if (settings.EnableWorkSpaceBG === false) return null;
    if (settings.WallpaperRotationEnabled) {
        const syncedSelection = await syncWallpaperSelection({ settings });
        if (!syncedSelection) return null;
        return await bgDB.getWallpaper(syncedSelection.wallpaperId);
    }
    if (settings.currentWallpaperId) {
        const wallpaper = await bgDB.getWallpaper(settings.currentWallpaperId);
        if (wallpaper) return wallpaper;
    }
    const syncedSelection = await syncWallpaperSelection({ settings });
    if (!syncedSelection) return null;
    return await bgDB.getWallpaper(syncedSelection.wallpaperId);
}

const createControlLabel = (labelNode) => {
    const label = document.createElement('div');
    label.className = 'hm-bg-control-label';
    if (typeof labelNode === 'string') {
        label.textContent = labelNode;
    } else if (labelNode) {
        label.appendChild(labelNode);
    }
    return label;
};

const createControlInput = (...nodes) => {
    const input = document.createElement('div');
    input.className = 'hm-bg-control-input';
    for (const node of nodes) {
        if (node) input.appendChild(node);
    }
    return input;
};

const createControlRow = (labelNode, ...controlNodes) => {
    const row = document.createElement('div');
    row.className = 'hm-bg-control-row';
    row.appendChild(createControlLabel(labelNode));
    row.appendChild(createControlInput(...controlNodes));
    return row;
};

const createFullRow = (...nodes) => {
    const row = document.createElement('div');
    row.className = 'hm-bg-control-row hm-bg-control-row-full';
    const content = document.createElement('div');
    content.className = 'hm-bg-control-full';
    for (const node of nodes) {
        if (node) content.appendChild(node);
    }
    row.appendChild(content);
    return row;
};


const createRangeControl = (input, formatValue = (value) => String(value)) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'hm-bg-range-control';
    const value = document.createElement('span');
    value.className = 'hm-bg-range-value';
    const sync = () => {
        value.textContent = formatValue(input.value);
    };
    input.addEventListener('input', sync);
    sync();
    wrapper.appendChild(input);
    wrapper.appendChild(value);
    return { element: wrapper, sync };
};

const createPreview = (emptyText) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'hm-bg-preview';
    const image = document.createElement('img');
    image.className = 'hm-bg-preview-image';
    image.alt = '';
    image.draggable = false;
    const empty = document.createElement('span');
    empty.className = 'hm-bg-preview-empty';
    empty.textContent = emptyText;
    wrapper.appendChild(image);
    wrapper.appendChild(empty);
    return { wrapper, image, empty };
};

const setPreviewSource = (preview, source, altText = '') => {
    const hasSource = Boolean(source);
    preview.image.hidden = !hasSource;
    preview.empty.hidden = hasSource;
    preview.image.src = hasSource ? source : '';
    preview.image.alt = altText;
};

const setPreviewAppearance = (preview, { blur = 0, opacity = 0.2 } = {}) => {
    preview.image.style.filter = `blur(${blur}px)`;
    preview.image.style.opacity = `${opacity}`;
};

/**
 * Builds the settings panel shown in the advanced settings modal.
 *
 * @param {object} options
 * @param {object} options.intl intl instance used to translate the control labels
 * @param {string} [options.selectClassName] class for the <select> control, so the host can hand
 *   in its own select styling (the settings modal passes the class of its own .select)
 * @param {string} [options.inputFormClass] class of the editor's form inputs, for the number fields
 * @returns {Promise<{element: HTMLElement}>}
 */
export async function createWorkspaceBackgroundPanel({ intl, selectClassName = '', inputFormClass = '' }) {
    const msg = key => intl.formatMessage(messages[key]);
    const addInputFormClass = input => {
        if (inputFormClass) input.classList.add(inputFormClass);
    };
    // Opens the wallpaper database and applies whatever is saved. Runs at most once; the panel
    // awaits the same promise, so its controls never talk to a database that is not open yet.
    await ensureStarted();
    const selectClass = selectClassName || 'hm-bg-layout';

    // ===== 操作按钮 =====
    const addButton = document.createElement("button");
    addButton.className = "hm-bg-add";
    addButton.textContent = (await getSetting('WallpaperRotationEnabled')) ? msg("add") : msg("replace");
    addButton.addEventListener('click', () => {
        addPicInput.click();
        applySettings('EnableWorkSpaceBG', true);
    });

    const clearButton = document.createElement("button");
    clearButton.className = "hm-bg-add";
    clearButton.innerHTML = msg('disable');
    clearButton.addEventListener('click', async () => {
        await applySettings('EnableWorkSpaceBG', false);
        await refreshWorkSpaceBackground();
        await refreshWallpaperList();
    });

    const addPicInput = document.createElement("input");
    addPicInput.type = "file";
    addPicInput.accept = ".png, .bmp, .jpg, .jpeg";
    addPicInput.multiple = true;
    addPicInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const isRotationEnabled = await getSetting('WallpaperRotationEnabled');
        const currentId = isRotationEnabled ? null : await getSetting('currentWallpaperId');

        const savedIds = await Promise.all(files.map((file, index) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (loadEvent) => {
                try {
                    const wallpaperId = isRotationEnabled ? `WorkSpaceBG-${Date.now()}-${index}` : (currentId || `WorkSpaceBG-${Date.now()}-${index}`);
                    await bgDB.saveWallpaper({
                        id: wallpaperId,
                        name: file.name,
                        link: loadEvent.target.result,
                        enabled: true
                    });
                    resolve(wallpaperId);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
        })));

        await applySettings('EnableWorkSpaceBG', true);
        if (savedIds.length) {
            await applySettings('currentWallpaperId', savedIds[0]);
        }
        await syncWallpaperSelection({ preferredId: savedIds[0] || null });
        await refreshWorkSpaceBackground();
        await refreshWallpaperList();
        addPicInput.value = '';
    });

    // ===== 表单 =====
    const imageLayout = document.createElement('select');
    imageLayout.className = selectClass;
    [
        { name: msg('background-layout-stretch'), value: 'stretch' },
        { name: msg('background-layout-height-priority'), value: 'height-priority' },
        { name: msg('background-layout-width-priority'), value: 'width-priority' },
        { name: msg('background-layout-fit'), value: 'fit' },
    ].forEach(layout => {
        const option = document.createElement('option');
        option.value = layout.value;
        option.textContent = layout.name;
        imageLayout.appendChild(option);
    });
    imageLayout.value = await getSetting('WorkSpaceBGLayout') || 'fit';
    imageLayout.addEventListener('change', async (e) => {
        await applySettings('WorkSpaceBGLayout', e.target.value);
        resizeWorkspaceBackground();
    });

    // Blur
    const blurInput = document.createElement('input');
    blurInput.type = 'range';
    blurInput.min = 0;
    blurInput.max = 20;
    blurInput.value = await getSetting('WorkSpaceBGBlur') || 2;
    blurInput.className = 'hm-bg-blur';
    blurInput.addEventListener('input', async () => {
        applySettings('WorkSpaceBGBlur', blurInput.value);
        await refreshWorkSpaceBackground();
        await refreshPreviews();
    });

    // Opacity
    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = 0;
    opacityInput.max = 100;
    opacityInput.value = await getSetting('WorkSpaceBGOpacity') * 100 || 20;
    opacityInput.className = 'hm-bg-opacity';
    opacityInput.addEventListener('input', async () => {
        applySettings('WorkSpaceBGOpacity', opacityInput.value / 100);
        await refreshWorkSpaceBackground();
        await refreshPreviews();
    });

    const blurControl = createRangeControl(blurInput, (value) => `${value}px`);
    const opacityControl = createRangeControl(opacityInput, (value) => `${value}%`);

    // Offset X
    const offsetX = document.createElement('input');
    offsetX.type = 'number';
    offsetX.min = '-500';
    offsetX.max = '500';
    offsetX.step = '1';
    offsetX.value = await getSetting('WorkSpaceBGOffsetX') || 0;
    offsetX.className = 'hm-bg-offset';
    addInputFormClass(offsetX);
    offsetX.addEventListener('input', async () => {
        applySettings('WorkSpaceBGOffsetX', Number(offsetX.value));
        await refreshWorkSpaceBackground();
    });

    // Offset Y
    const offsetY = document.createElement('input');
    offsetY.type = 'number';
    offsetY.min = '-500';
    offsetY.max = '500';
    offsetY.step = '1';
    offsetY.value = await getSetting('WorkSpaceBGOffsetY') || 0;
    offsetY.className = 'hm-bg-offset';
    addInputFormClass(offsetY);
    offsetY.addEventListener('input', async () => {
        applySettings('WorkSpaceBGOffsetY', Number(offsetY.value));
        await refreshWorkSpaceBackground();
    });

    // Animation Duration
    const animationDuration = document.createElement('input');
    animationDuration.type = 'range';
    animationDuration.min = 0;
    animationDuration.max = 2000;
    animationDuration.step = 100;
    animationDuration.value = await getSetting('WorkSpaceBGAnimationDuration') || 500;
    animationDuration.className = 'hm-bg-animation-duration';
    animationDuration.addEventListener('input', async () => {
        applySettings('WorkSpaceBGAnimationDuration', Number(animationDuration.value));
    });
    const animationDurationControl = createRangeControl(animationDuration, (value) => `${value}ms`);

    // ===== Rotation UI =====
    const rotationToggleLabel = document.createElement('label');
    rotationToggleLabel.className = 'hm-bg-rotation-label';
    const rotationToggle = document.createElement('input');
    rotationToggle.type = 'checkbox';
    rotationToggle.className = 'hm-tiny-checkbox';
    rotationToggle.checked = await getSetting('WallpaperRotationEnabled') || false;
    rotationToggleLabel.appendChild(rotationToggle);
    rotationToggleLabel.appendChild(document.createTextNode(' ' + msg('rotation-enable')));

    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.min = '1';
    intervalInput.value = await getSetting('WallpaperRotationIntervalMinutes') || 5;
    intervalInput.className = 'hm-bg-rotation-interval';
    addInputFormClass(intervalInput);
    intervalInput.addEventListener('change', async () => {
        await applySettings('WallpaperRotationIntervalMinutes', Number(intervalInput.value) || 5);
        await initializeWallpaperRotation();
    });

    const rotateNowButton = document.createElement('button');
    rotateNowButton.className = 'hm-bg-add';
    rotateNowButton.textContent = msg('rotate-now');
    rotateNowButton.addEventListener('click', async () => {
        await advanceWallpaperRotationIndex();
        await refreshWorkSpaceBackground();
        await refreshWallpaperList();
    });

    const wallpaperListContainer = document.createElement('div');
    wallpaperListContainer.className = 'hm-bg-wallpaper-list';

    // Held in a local so the toggle always folds its own block: the old code looked this element up
    // with document.querySelector, which resolves to the wrong one as soon as a second panel exists.
    const rotationAllDiv = document.createElement('div');
    rotationAllDiv.className = 'hm-bg-rotation-all';
    rotationAllDiv.style.display = rotationToggle.checked ? '' : 'none';

    rotationToggle.addEventListener('change', async () => {
        rotationAllDiv.style.display = rotationToggle.checked ? '' : 'none';
        addButton.textContent = rotationToggle.checked ? msg("add") : msg("replace");
        await applySettings('WallpaperRotationEnabled', rotationToggle.checked);
        await syncWallpaperSelection();
        await initializeWallpaperRotation();
        await refreshWorkSpaceBackground();
        await refreshWallpaperList();
    });

    // ===== Preview =====
    const previewEmptyText = msg('background-preview-empty');
    const preview = createPreview(previewEmptyText);

    // ===== Refresh functions =====
    async function refreshPreviews() {
        const activeWallpaper = await getActiveWorkspaceWallpaper();
        setPreviewSource(
            preview,
            activeWallpaper && activeWallpaper.link ? activeWallpaper.link : null,
            activeWallpaper && activeWallpaper.name ? activeWallpaper.name : msg('background-workspace')
        );
        setPreviewAppearance(preview, {
            blur: Number(blurInput.value) || 0,
            opacity: (Number(opacityInput.value) || 0) / 100
        });
    }

    async function refreshWallpaperList() {
        const settings = await bgDB.getSetting('settings') || {};
        const isBackgroundVisible = settings.EnableWorkSpaceBG !== false;
        const activeWallpaper = await getActiveWorkspaceWallpaper();
        const currentWallpaperId = activeWallpaper ? activeWallpaper.id : await getSetting('currentWallpaperId');
        const wallpapers = await bgDB.listWallpapers();
        wallpaperListContainer.innerHTML = '';
        wallpapers.forEach((wallpaper, index) => {
            const isCurrent = wallpaper.id === currentWallpaperId;
            const right = document.createElement('div');
            right.className = 'hm-bg-wallpaper-item';

            const title = document.createElement('span');
            title.textContent = wallpaper.name || wallpaper.id;
            title.className = wallpaper.enabled ? 'hm-bg-wallpaper-title' : 'hm-bg-wallpaper-title disabled';

            const enabledLabel = document.createElement('label');
            enabledLabel.className = 'hm-bg-wallpaper-enabled-label';
            const enabledInput = document.createElement('input');
            enabledInput.type = 'checkbox';
            enabledInput.className = 'hm-tiny-checkbox';
            enabledInput.checked = wallpaper.enabled !== false;
            enabledInput.addEventListener('change', async () => {
                await updateWallpaperEnabled(wallpaper.id, enabledInput.checked);
                await refreshWallpaperList();
            });
            enabledLabel.appendChild(enabledInput);

            const deleteButton = document.createElement('button');
            deleteButton.textContent = '×';
            deleteButton.className = 'hm-bg-delete';
            deleteButton.addEventListener('click', async () => {
                await deleteWallpaperAndRefresh(wallpaper.id);
                await refreshWallpaperList();
            });

            const left = document.createElement('div');
            left.className = 'hm-bg-left';
            if (isCurrent) {
                left.classList.add('hm-bg-wallpaper-current');
            }
            if (!(isCurrent && isBackgroundVisible)) {
                left.classList.add('hm-bg-wallpaper-selectable');
                left.addEventListener('click', async () => {
                    await setCurrentWallpaperId(wallpaper.id);
                    await refreshWallpaperList();
                });
            }

            left.appendChild(enabledLabel);
            left.appendChild(title);
            right.appendChild(deleteButton);

            const content = document.createElement('div');
            content.className = 'hm-bg-list-content';
            if (isCurrent) {
                content.classList.add('hm-bg-list-content-current');
            }
            content.style.animationDelay = `${index * 100}ms`;
            content.style.opacity = 1;
            content.appendChild(left);
            content.appendChild(right);

            wallpaperListContainer.appendChild(content)
        });
        await refreshPreviews();
    }

    // ===== 组装 =====
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'hm-bg-actions';
    actionsWrapper.appendChild(addButton);
    actionsWrapper.appendChild(clearButton);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'hm-bg-control-row hm-bg-control-row-full';
    const actionsFull = document.createElement('div');
    actionsFull.className = 'hm-bg-control-full';
    actionsFull.appendChild(actionsWrapper);
    actionsRow.appendChild(actionsFull);

    const form = document.createElement('div');
    form.className = 'hm-bg-form-grid';
    form.appendChild(createControlRow(msg('background-layout'), imageLayout));
    form.appendChild(createControlRow(msg('background-blur'), blurControl.element));
    form.appendChild(createControlRow(msg('background-opacity'), opacityControl.element));
    form.appendChild(createControlRow(msg('background-offset-x'), offsetX));
    form.appendChild(createControlRow(msg('background-offset-y'), offsetY));

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'hm-bg-preview-wrapper';
    previewWrapper.appendChild(preview.wrapper);

    const rotationForm = document.createElement('div');
    rotationForm.className = 'hm-bg-form-grid';
    rotationForm.appendChild(createFullRow(rotationToggleLabel));
    rotationAllDiv.appendChild(createControlRow(msg('animation-duration'), animationDurationControl.element));
    rotationAllDiv.appendChild(createControlRow(msg('rotation-interval'), intervalInput));
    rotationAllDiv.appendChild(createFullRow(rotateNowButton));
    const rotationListShell = document.createElement('div');
    rotationListShell.className = 'hm-bg-list-shell';
    rotationListShell.appendChild(wallpaperListContainer);
    rotationAllDiv.appendChild(createFullRow(rotationListShell));
    rotationForm.appendChild(rotationAllDiv);

    const panel = document.createElement('div');
    panel.className = 'hm-bg-panel hm-bg-panel-workspace';
    panel.dataset.panel = 'workspace';
    panel.appendChild(previewWrapper);
    panel.appendChild(actionsRow);
    panel.appendChild(form);
    panel.appendChild(rotationForm);

    await refreshWallpaperList();

    return { element: panel };
}

async function resizeWorkspaceBackground() {
    try {
        const mode = await getSetting('WorkSpaceBGLayout') || 'fit';
        const offsetX = await getSetting('WorkSpaceBGOffsetX') || 0;
        const offsetY = await getSetting('WorkSpaceBGOffsetY') || 0;
        const workspace = document.querySelector('[class*=gui_blocks-wrapper]');
        const bgImage = document.querySelector('.hm-bg-image');
        if (bgImage && workspace) {
            applyBackgroundLayout({
                image: bgImage,
                containerWidth: workspace.clientWidth,
                containerHeight: workspace.clientHeight,
                mode,
                offsetX,
                offsetY
            });
        } else {
            await refreshWorkSpaceBackground();
        }
    } catch (e) {
        console.warn('Failed to resize background image:', e);
    }
}

async function refreshWorkSpaceBackground() {
    if (isRefreshingBG) return;
    isRefreshingBG = true;
    const refreshToken = ++wallpaperRefreshToken;
    try {
        const animationDuration = await getSetting('WorkSpaceBGAnimationDuration') || 500;
        const isWorkspaceBackgroundEnabled = await getSetting('EnableWorkSpaceBG');
        clearWallpaperTransitionTimeout();
        const wallpaper = await getActiveWorkspaceWallpaper();
        // Only hand the Blockly background over to the overlay when a wallpaper will actually be
        // painted; with none selected the theme's own workspace colour must stay in charge
        // (the gated rule in workspace-background.css only matches this attribute).
        const showBackground = isWorkspaceBackgroundEnabled !== false && Boolean(wallpaper && wallpaper.link);
        if (showBackground) {
            document.documentElement.setAttribute('data-hm-bg-wallpaper', '');
        } else {
            document.documentElement.removeAttribute('data-hm-bg-wallpaper');
        }
        const existingClips = Array.from(document.querySelectorAll('.hm-bg-clip'));
        const existingBg = existingClips[0] ? existingClips[0].querySelector('.hm-bg-image') : null;
        existingClips.slice(1).forEach((clip) => clip.remove());

        if (!wallpaper || !wallpaper.link) {
            if (existingBg) {
                existingBg.style.transition = `opacity ${animationDuration}ms ease-out`;
                existingBg.style.opacity = '0';
                wallpaperTransitionTimeout = window.setTimeout(() => {
                    if (refreshToken !== wallpaperRefreshToken) return;
                    existingBg.closest('.hm-bg-clip').remove();
                    wallpaperTransitionTimeout = null;
                    isRefreshingBG = false;
                }, animationDuration);
            } else {
                isRefreshingBG = false;
            }
            return;
        }

        const workspace = document.querySelector('[class*=gui_blocks-wrapper]');
        if (!workspace) {
            isRefreshingBG = false;
            return;
        }

        if (existingBg && existingBg.dataset.wallpaperId === wallpaper.id) {
            existingBg.src = wallpaper.link;
            existingBg.style.filter = `blur(${await getSetting('WorkSpaceBGBlur')}px)`;
            existingBg.style.opacity = `${await getSetting('WorkSpaceBGOpacity')}`;
            await resizeWorkspaceBackground();
            isRefreshingBG = false;
            return;
        }

        if (existingBg) {
            existingBg.style.transition = `opacity ${animationDuration}ms ease-out`;
            existingBg.style.opacity = '0';
            wallpaperTransitionTimeout = window.setTimeout(async () => {
                if (refreshToken !== wallpaperRefreshToken) return;
                existingBg.closest('.hm-bg-clip').remove();
                await createNewBackground(wallpaper, workspace, animationDuration);
                wallpaperTransitionTimeout = null;
                isRefreshingBG = false;
            }, animationDuration);
        } else {
            await createNewBackground(wallpaper, workspace, animationDuration);
            isRefreshingBG = false;
        }
    } catch (e) {
        console.log(e);
        isRefreshingBG = false;
    }
}

async function createNewBackground(wallpaper, workspace, animationDuration) {
    clearWallpaperTransitionTimeout();
    workspace.querySelectorAll('.hm-bg-clip').forEach((clip) => clip.remove());
    const clip = document.createElement('div');
    clip.className = 'hm-bg-clip';
    const background = document.createElement('img');
    background.className = 'hm-bg-image';
    background.dataset.wallpaperId = wallpaper.id || '';
    background.src = wallpaper.link;
    // 使用 getSetting 获取值，现在会返回默认值
    const blur = await getSetting('WorkSpaceBGBlur');
    const opacity = await getSetting('WorkSpaceBGOpacity');
    background.style.filter = `blur(${blur}px)`;
    background.style.opacity = '0';
    background.draggable = false;
    background.style.transition = `opacity ${animationDuration}ms ease-in`;

    clip.appendChild(background);
    workspace.prepend(clip);
    await resizeWorkspaceBackground();

    requestAnimationFrame(async () => {
        background.style.opacity = `${opacity}`;
    });
}

// ===== 启动 =====
const watchForWorkspace = () => {
    try {
        const observer = new MutationObserver(async () => {
            if (isRefreshingBG) return;
            const workspace = document.querySelector('[class*=gui_blocks-wrapper]');
            const bg = document.querySelector('.hm-bg-image');
            if (workspace && !bg) {
                await refreshWorkSpaceBackground();
            }
        });
        observer.observe(document, {childList: true, subtree: true});
    } catch (e) {
        console.warn('Warning: Failed to add Observer:', e);
    }
};

/**
 * Opens the wallpaper database, paints the saved wallpaper and starts the rotation timer.
 * Never rejects: a broken IndexedDB just means no custom background.
 */
const ensureStarted = () => {
    if (startupPromise) return startupPromise;
    injectStyles();
    bgDB = new BackgroundDB();
    startupPromise = bgDB.open().then(async () => {
        await refreshWorkSpaceBackground();
        await initializeWallpaperRotation();
        window.addEventListener('resize', resizeWorkspaceBackground);
        watchForWorkspace();
    }).catch(e => {
        console.warn('[HyperMimic] Could not restore the workspace background:', e);
    });
    return startupPromise;
};

/** Called once when the editor interface comes up. Safe to call more than once. */
export function initWorkspaceBackground () {
    if (typeof window === 'undefined') return;
    ensureStarted();
}
