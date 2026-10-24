/**
 * "Editor font": renders the whole editor in a font of the user's choosing.
 *
 * Three ways in, mirroring what the Bilup fork's fonts window offers:
 *   - a font installed on the computer, named by the user -- no data is kept;
 *   - a font file imported from disk -- the bytes are kept base64 encoded in the settings, so
 *     the choice survives a reload;
 *   - a Google Font, picked from a searchable list -- loaded on demand through the css2 API.
 *
 * Why this is its own module rather than an addon: the advanced settings modal is its UI, so
 * it has to work without anything being installed (same reasoning as unclip-palette).
 *
 * The CSS is injected as a raw <style> element, and the class it is keyed on goes on <html>
 * rather than on any element inside it: most dialogs are react-modal portals, and Blockly's
 * menus, dropdowns and tooltips are plain divs -- all of them mount straight under
 * document.body, so a rule scoped to the GUI's own subtree never reached them.
 */

import {
    getSetting,
    onSettingsChange,
    setSetting,
    SETTING_EDITOR_FONT,
    SETTING_EDITOR_FONT_DATA
} from '../hypermimic-settings.js';
import {loadGoogleFont} from './google-fonts.js';

const STYLE_ID = 'hm-editor-font';
// The class toggled on <html> (see apply): everything the rules below are keyed on.
const HTML_CLASS = 'hm-editor-font';
// The GUI's own font, used as the fallback in the injected rule.
const GUI_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
// The font data lives in localStorage, whose budget for the whole origin is a few megabytes.
// Refuse anything that would risk blowing it.
const MAX_FONT_BYTES = 2 * 1024 * 1024;
// Formats a browser can be relied on to render from a data URI.
const FONT_FORMATS = ['ttf', 'otf', 'woff', 'woff2'];
// Where the chosen font comes from, kept in the settings so a reload knows what to load.
const SOURCE_GOOGLE = 'google';
const SOURCE_FILE = 'file';

const MIME_BY_FORMAT = {
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2'
};

const getFileExtension = filename => {
    const idx = filename.lastIndexOf('.');
    return idx === -1 ? '' : filename.substring(idx + 1).toLowerCase();
};

// "My Nice Font.ttf" -> "My Nice Font". Kept close to the fonts modal's formatFontName
// (tw-fonts-modal/add-custom-font.jsx) so the two agree on what a file is called.
const familyFromFileName = filename => {
    const idx = filename.lastIndexOf('.');
    const base = idx === -1 ? filename : filename.substring(0, idx);
    return base.replace(/[^\w -]/g, '').trim() || 'Editor font';
};

const readFontData = () => {
    const stored = getSetting(SETTING_EDITOR_FONT_DATA);
    if (!stored || typeof stored !== 'object') return null;
    if (stored.source !== SOURCE_FILE) return null;
    if (typeof stored.data !== 'string' || typeof stored.format !== 'string') return null;
    if (FONT_FORMATS.indexOf(stored.format) === -1) return null;
    return stored;
};

const quote = family => (family.indexOf(',') === -1 ? `"${family}"` : family);

const buildCss = family => {
    const fontData = readFontData();
    const stack = `${quote(family)}, ${GUI_FONT}`;
    // Only register the file when it is the family being used; a stale import must not put a
    // @font-face in the page.
    let rules = '';
    if (fontData && fontData.family === family) {
        rules += `@font-face{font-family:${quote(fontData.family)};` +
            `src:url("data:${MIME_BY_FORMAT[fontData.format]};base64,${fontData.data}");}\n`;
    }
    rules += `html.${HTML_CLASS}, html.${HTML_CLASS} body {font-family:${stack} !important;}\n`;
    // `!important` because the GUI sets font-family explicitly in ~90 rules of its own CSS, and
    // the whole point is to override all of them. The extra classes the html prefix contributes
    // also keep this ahead of the few GUI rules that are important themselves (the project title
    // input, the action-menu tooltips), whatever order the two style sheets end up in.
    //
    // What keeps its own font, and why. Every exclusion is on the subject itself: a subtree
    // exclusion inside :not() cannot be narrowed, which would make every class change in the
    // document re-evaluate the whole rule set.
    //   - [style*="font-family"]: anything whose font was set inline by code -- the paint
    //     editor's text-editing textarea (scratch-paint lines the caret up with the artwork's
    //     text that way), the per-font previews in the fonts modal, the Google Fonts list above;
    //   - [class*="text-area"]: that same textarea, before any font has been set on it;
    //   - text/tspan: SVG text. Blockly's is covered by the injectionDiv rule below; everything
    //     else that uses SVG text (the paint editor's own text, stage monitors) is project
    //     content rather than UI, so it must keep the font it was drawn with.
    rules += `html.${HTML_CLASS} body *:not([style*="font-family"]):not([class*="text-area"])` +
        `:not(text):not(tspan) {font-family:${stack} !important;}\n`;
    // Blockly draws its blocks and fields as SVG <text>, which does not follow the same
    // inheritance path as HTML. Scoped to Blockly's injection divs so it covers the workspace,
    // the flyout and the workspaces inside dialogs (custom procedures, mutators): each one is
    // injected separately, and the ones in react-modal dialogs live under document.body.
    rules += `html.${HTML_CLASS} [class*="injectionDiv"] text, ` +
        `html.${HTML_CLASS} [class*="injectionDiv"] tspan {font-family:${stack} !important;}`;
    return rules;
};

const apply = () => {
    if (typeof document === 'undefined') return;
    const raw = getSetting(SETTING_EDITOR_FONT);
    const family = typeof raw === 'string' ? raw.trim() : '';
    // The class has to be on <html> for the rules above to reach the body-level dialogs; with no
    // font chosen it must come off again, otherwise the rules would match with a stale family.
    document.documentElement.classList.toggle(HTML_CLASS, !!family);
    let style = document.getElementById(STYLE_ID);
    if (!family) {
        if (style) style.remove();
        return;
    }
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = buildCss(family);
    // A Google Font has to be loaded into the document every time; a failure is not fatal (the
    // family then falls back to the GUI font), so it is deliberately not awaited.
    const fontData = getSetting(SETTING_EDITOR_FONT_DATA);
    if (fontData && fontData.source === SOURCE_GOOGLE && fontData.family === family) {
        loadGoogleFont(family).catch(() => {});
    }
};

/**
 * Applies the saved value and keeps it in sync from then on.
 * Safe to call once, when the editor interface comes up.
 */
const initEditorFont = () => {
    if (typeof document === 'undefined') return;
    apply();
    onSettingsChange(key => {
        if (key === SETTING_EDITOR_FONT || key === SETTING_EDITOR_FONT_DATA) {
            apply();
        }
    });
};

/**
 * Select a Google Font.
 * @param {string} fontFamily the family to load and select
 * @returns {Promise<string>} the family, once it has been loaded
 */
const selectGoogleFont = async fontFamily => {
    const family = (fontFamily || '').trim();
    if (!family) return '';
    await loadGoogleFont(family);
    setSetting(SETTING_EDITOR_FONT_DATA, {source: SOURCE_GOOGLE, family});
    setSetting(SETTING_EDITOR_FONT, family);
    return family;
};

/**
 * Register a font file from disk and select it.
 *
 * Follows the fonts modal's flow (tw-fonts-modal/add-custom-font.jsx): read the file, name the
 * font after it, and keep the bytes so the choice survives a reload.
 *
 * @param {File} file a .ttf/.otf/.woff/.woff2 file
 * @returns {Promise<string>} the family the font was registered under
 */
const importEditorFont = file => new Promise((resolve, reject) => {
    if (!file) {
        reject(new Error('No file'));
        return;
    }
    const format = getFileExtension(file.name);
    if (FONT_FORMATS.indexOf(format) === -1) {
        reject(new Error(`Unsupported font format: .${format}`));
        return;
    }
    if (file.size > MAX_FONT_BYTES) {
        reject(new Error('The font file is too large to be remembered.'));
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const data = String(reader.result).split(',')[1] || '';
        const family = familyFromFileName(file.name);
        setSetting(SETTING_EDITOR_FONT_DATA, {
            source: SOURCE_FILE,
            family,
            format,
            data
        });
        setSetting(SETTING_EDITOR_FONT, family);
        resolve(family);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the font file.'));
    reader.readAsDataURL(file);
});

/**
 * Forget every font choice and go back to the GUI's own font.
 */
const resetEditorFont = () => {
    setSetting(SETTING_EDITOR_FONT, '');
    setSetting(SETTING_EDITOR_FONT_DATA, null);
};

export {
    initEditorFont,
    selectGoogleFont,
    importEditorFont,
    resetEditorFont,
    GUI_FONT
};
