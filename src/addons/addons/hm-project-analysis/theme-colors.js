// Theme-aware block colours.
//
// The panel paints each block-category progress bar with the *real* colour of the active
// Blockly theme (so it follows custom-editor-theme / editor-theme3), using the same two
// sources recolor-custom-blocks reads: new Blockly exposes
// `workspace.getTheme().blockStyles[key].colourPrimary`, the old one `Blockly.Colours[key].primary`.
// There is deliberately no hardcoded colour table.

// hm-project-analysis category names -> Blockly theme blockStyle keys.
// The names come from the analyzer, which reads them off the project's block opcodes.
export const CATEGORY_THEME_KEY = {
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

/**
 * Build the resolver once, at addon startup (the editor is always loaded by the time the user
 * can press the toolbox button).
 *
 * @param {object} Blockly
 * @param {object} workspace the main Blockly workspace
 * @returns {function(string): ?string} category -> colour, or null when the theme has no
 *   style for that key
 */
export const createBlockColorResolver = (Blockly, workspace) => category => {
    const themeKey = CATEGORY_THEME_KEY[category] || category;
    if (Blockly.registry) {
        const style = workspace.getTheme().blockStyles[themeKey];
        if (style && style.colourPrimary) return style.colourPrimary;
    } else {
        const colours = Blockly.Colours[themeKey];
        if (colours && colours.primary) return colours.primary;
    }
    return null;
};

/**
 * The colour to paint `category` with.
 *
 * Unknown categories (e.g. an extension id the theme has no style for) fall back to the live
 * "other" (more) category colour, which is still a real theme colour -- never a self-defined
 * constant. Returns null only when the editor/Blockly was not available to build the resolver,
 * in which case the caller leaves the fill's background unset.
 *
 * @param {?function(string): ?string} getBlockColor
 * @param {string} category
 * @returns {?string}
 */
export const getCategoryColor = (getBlockColor, category) => {
    if (typeof getBlockColor !== 'function') return null;
    const real = getBlockColor(category);
    if (real) return real;
    return getBlockColor('others');
};
