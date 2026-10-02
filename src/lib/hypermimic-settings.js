/**
 * Settings that only exist in HyperMimic and therefore are not part of the vanilla settings
 * system. They are stored separately in localStorage under `hm:settings`.
 *
 * The advanced settings modal (components/tw-settings-modal, "HyperMimic" tab) is the UI for
 * these; addons and the editor apply them at runtime through onSettingsChange().
 */

const STORAGE_KEY = 'hm:settings';

const SETTING_BLOCK_PALETTE_STYLE = 'blockPaletteStyle';
const BLOCK_PALETTE_STYLE_DEFAULT = 'default';
const BLOCK_PALETTE_STYLE_UNCLIP = 'unclip';
const BLOCK_PALETTE_STYLE_RESIZE = 'resize';
const BLOCK_PALETTE_STYLE_VALUES = [
    BLOCK_PALETTE_STYLE_DEFAULT,
    BLOCK_PALETTE_STYLE_UNCLIP,
    BLOCK_PALETTE_STYLE_RESIZE
];

const SETTING_CONTEXT_MENU_STYLE = 'contextMenuStyle';
const CONTEXT_MENU_STYLE_DEFAULT = 'default';
const CONTEXT_MENU_STYLE_LOOSE = 'loose';
const CONTEXT_MENU_STYLE_VALUES = [
    CONTEXT_MENU_STYLE_DEFAULT,
    CONTEXT_MENU_STYLE_LOOSE
];

const SETTING_COMMENT_MARKDOWN_EDITOR = 'commentMarkdownEditor';
const SETTING_ADD_FRAME_CONTEXT_MENU = 'addFrameContextMenu';
const SETTING_CANCEL_EDITOR_MARGINS = 'cancelEditorMargins';
const SETTING_DISABLE_GUI_CONTEXT_MENU = 'disableGuiContextMenu';
const SETTING_AUTO_DISPLAY_README = 'autoDisplayReadme';
const SETTING_README_HTML_SUPPORT = 'readmeHtmlSupport';
// Whether the loading screen that covers the editor while a project/file loads plays the logo
// animation (src/playground/splash-logo.js). Off leaves just the title and the progress bar, for
// machines where the extra paint work makes loading feel janky. See components/loader/loader.jsx.
const SETTING_LOADING_ANIMATION = 'loadingAnimation';
const SETTING_WORKSPACE_TOOLBOX = 'workspaceToolbox';
// The order the workspace toolbox's buttons are shown in, as a list of tool keys
// (`tool.id || tool.label`). Empty means "no arrangement has been made", in which case the
// toolbox falls back to registration order. See lib/workspace-toolbox/order.js.
const SETTING_WORKSPACE_TOOLBOX_ORDER = 'workspaceToolboxOrder';
// Whether the toolbox unfolds on hover and folds away again when the pointer leaves, instead of
// staying however the user last clicked it. See lib/workspace-toolbox/index.js.
const SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE = 'workspaceToolboxAutoHide';
const SETTING_WINDOW_MODAL = 'windowModal';
// Apply one consistent, theme-aware scrollbar style across every scrollable element in the
// editor (rather than each panel styling its own). See lib/unified-scrollbars/index.js.
const SETTING_UNIFY_SCROLLBARS = 'unifyScrollbars';

const DEFAULTS = {
    [SETTING_BLOCK_PALETTE_STYLE]: BLOCK_PALETTE_STYLE_DEFAULT,
    [SETTING_CONTEXT_MENU_STYLE]: CONTEXT_MENU_STYLE_DEFAULT,
    [SETTING_COMMENT_MARKDOWN_EDITOR]: true,
    [SETTING_ADD_FRAME_CONTEXT_MENU]: true,
    [SETTING_CANCEL_EDITOR_MARGINS]: false,
    [SETTING_DISABLE_GUI_CONTEXT_MENU]: true,
    [SETTING_AUTO_DISPLAY_README]: true,
    [SETTING_README_HTML_SUPPORT]: false,
    [SETTING_LOADING_ANIMATION]: true,
    [SETTING_WORKSPACE_TOOLBOX]: true,
    [SETTING_WORKSPACE_TOOLBOX_ORDER]: [],
    [SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE]: false,
    [SETTING_WINDOW_MODAL]: false,
    [SETTING_UNIFY_SCROLLBARS]: false
};

// Reject values that are not part of a setting's allowed set, so that a hand-edited
// localStorage entry can never leave a <select> without a matching option, or a boolean
// setting holding a value that no checkbox can represent.
const isValidValue = (key, value) => {
    if (key === SETTING_BLOCK_PALETTE_STYLE) {
        return BLOCK_PALETTE_STYLE_VALUES.indexOf(value) !== -1;
    }
    if (key === SETTING_CONTEXT_MENU_STYLE) {
        return CONTEXT_MENU_STYLE_VALUES.indexOf(value) !== -1;
    }
    if (key === SETTING_WORKSPACE_TOOLBOX_ORDER) {
        // A list of tool keys. Checked element by element rather than just "is an array": this
        // value is read straight back out as DOM text and used as a sort key, so a hand-edited
        // entry holding objects would corrupt the toolbox rather than merely be ignored.
        return Array.isArray(value) && value.every(entry => typeof entry === 'string');
    }
    if (typeof DEFAULTS[key] === 'boolean') {
        return typeof value === 'boolean';
    }
    return true;
};

const listeners = new Set();

let cache = null;

const read = () => {
    let stored = {};
    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
        // Missing, corrupted or unavailable storage: fall back to the defaults.
    }
    const settings = Object.assign({}, DEFAULTS);
    for (const key of Object.keys(DEFAULTS)) {
        if (isValidValue(key, stored[key])) {
            settings[key] = stored[key];
        }
    }
    return settings;
};

/**
 * @returns {object} every HyperMimic setting, with defaults filled in
 */
const getSettings = () => {
    if (!cache) {
        cache = read();
    }
    return cache;
};

/**
 * @param {string} key name of the setting
 * @returns {*} the current value
 */
const getSetting = key => getSettings()[key];

/**
 * @param {string} key name of the setting
 * @param {*} value new value
 */
const setSetting = (key, value) => {
    const settings = Object.assign({}, getSettings(), {
        [key]: value
    });
    cache = settings;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        // ignore
    }
    listeners.forEach(listener => listener(key, value, settings));
};

/**
 * @param {function} listener called with (key, value, settings) after every change
 * @returns {function} call to stop listening
 */
const onSettingsChange = listener => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export {
    getSetting,
    getSettings,
    onSettingsChange,
    setSetting,
    SETTING_BLOCK_PALETTE_STYLE,
    BLOCK_PALETTE_STYLE_DEFAULT,
    BLOCK_PALETTE_STYLE_UNCLIP,
    BLOCK_PALETTE_STYLE_RESIZE,
    SETTING_CONTEXT_MENU_STYLE,
    CONTEXT_MENU_STYLE_DEFAULT,
    CONTEXT_MENU_STYLE_LOOSE,
    SETTING_COMMENT_MARKDOWN_EDITOR,
    SETTING_ADD_FRAME_CONTEXT_MENU,
    SETTING_CANCEL_EDITOR_MARGINS,
    SETTING_DISABLE_GUI_CONTEXT_MENU,
    SETTING_AUTO_DISPLAY_README,
    SETTING_README_HTML_SUPPORT,
    SETTING_LOADING_ANIMATION,
    SETTING_WORKSPACE_TOOLBOX,
    SETTING_WORKSPACE_TOOLBOX_ORDER,
    SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE,
    SETTING_WINDOW_MODAL,
    SETTING_UNIFY_SCROLLBARS
};
