// Panel text.
//
// Ids are the addon's own l10n keys (`hm-project-analysis/<id>` in
// `src/addons/addons-l10n/<locale>.json`), read at runtime through the addon API's `msg()`.
// That is the same string the old React version resolved through react-intl's
// `<IntlProvider messages={addon.messages}>` -- `addon.messages` is the merged en+locale map
// `msg()` reads from, so translations keep working without any l10n file change.
//
// `fallback` is only a safety net for a key missing from `addons-l10n/*.json`: `msg()` then
// returns the namespaced id itself, and we render this instead. It is the equivalent of the
// `defaultMessage` the `<FormattedMessage>`s used to carry, kept so a missing translation
// still shows readable English rather than `hm-project-analysis/loading`.

/**
 * @type {Record<string, {id: string, fallback: string}>}
 */
export const MESSAGES = {
    // ===== Tabs =====
    tabResult: {id: 'tabResult', fallback: 'Result'},
    tabErrors: {id: 'tabErrors', fallback: 'Errors'},
    // NOTE: `title` and `tabSettings` still exist in addons-l10n/*.json but nothing renders
    // them: the modal title comes from `menuLabel` (as it did before) and the settings moved to
    // the addon's own settings page, so there is no settings tab any more.

    // ===== 统计项标签 =====
    sprites: {id: 'sprites', fallback: 'Sprites'},
    totalBlocks: {id: 'totalBlocks', fallback: 'Total Blocks'},
    effectiveBlocks: {id: 'effectiveBlocks', fallback: 'Effective Blocks'},
    totalScripts: {id: 'totalScripts', fallback: 'Total Scripts'},
    effectiveScripts: {id: 'effectiveScripts', fallback: 'Effective Scripts'},
    costumes: {id: 'costumes', fallback: 'Costumes'},
    sounds: {id: 'sounds', fallback: 'Sounds'},
    variables: {id: 'variables', fallback: 'Variables'},
    lists: {id: 'lists', fallback: 'Lists'},
    functions: {id: 'functions', fallback: 'Functions'},

    // ===== 统计分组标题 =====
    groupAssets: {id: 'groupAssets', fallback: 'Assets'},
    groupBlockCount: {id: 'groupBlockCount', fallback: 'Block Count'},
    groupScriptCount: {id: 'groupScriptCount', fallback: 'Script Count'},
    groupDefinitions: {id: 'groupDefinitions', fallback: 'Definitions'},

    // ===== 区块标题与其它 =====
    basicInformation: {id: 'basicInformation', fallback: 'Basic Information'},
    blockCategories: {id: 'blockCategories', fallback: 'Block Categories'},
    extensionDisplayInfo: {id: 'extensionDisplayInfo', fallback: 'Extension Information'},
    errorInfo: {id: 'errorInfo', fallback: 'Error Information'},
    errors: {id: 'errors', fallback: 'Found {count} hidden error(s) in this file'},
    viewErrors: {id: 'viewErrors', fallback: 'View Errors'},
    loading: {id: 'loading', fallback: 'Analyzing...'},
    empty: {id: 'empty', fallback: 'No data available. Please analyze a project.'},
    untitled: {id: 'untitled', fallback: '(Untitled)'},
    noStats: {
        id: 'noStats',
        fallback: 'No statistics selected to display. Please check your settings.'
    },
    noErrors: {id: 'noErrors', fallback: 'No errors found in this project.'},
    errorsDescription: {
        id: 'errorsDescription',
        fallback: 'We apologize that you have seen these. These are likely not your fault, but ' +
            'rather issues with how your editor has handled the project logic, adding erroneous ' +
            'data to your file. If a certain part of your project shows an error screen when ' +
            'opened in the editor, or the project does not run properly, we cannot guarantee ' +
            'that all statistics and block category counts are completely accurate (though they ' +
            'might be). If your project runs normally and shows no errors, these errors are ' +
            'harmless.'
    },
    errorsListTitle: {id: 'errorsListTitle', fallback: 'Errors found during analysis:'}
};

const PREFIX = 'hm-project-analysis';

// `{name}` placeholders, matching the IntlMessageFormat syntax the l10n values use.
const interpolate = (template, values) => template.replace(
    /\{(\w+)\}/g,
    (match, name) => (values && name in values ? String(values[name]) : match)
);

/**
 * Build a translator bound to the addon API's `msg()`.
 *
 * @param {function(string, ?object): string} msg the addon's message resolver
 * @returns {function(string, ?object): string} `t(key, values)`
 */
export const createTranslator = msg => (key, values) => {
    const entry = MESSAGES[key];
    if (!entry) return key;
    const text = msg(entry.id, values);
    // `msg()` returns the namespaced id when the key is missing -- that is the signal to use
    // the built-in English fallback.
    if (text && text !== `${PREFIX}/${entry.id}`) return text;
    return interpolate(entry.fallback, values);
};
