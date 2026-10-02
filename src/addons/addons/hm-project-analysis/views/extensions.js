// "Extension Information" section: the extensions used by the project, by name.

import {styles} from '../styles.js';
import {div, span} from '../dom.js';
import {sectionHeader} from './common.js';
import {getExtensionTranslation} from '../lib/index.js';

// One extension rendered as a pill with a colour dot taken from the extension's own block
// colour (falls back to the theme accent when the colour is unknown). Reads as a tag list
// rather than the old comma-joined plain string.
const makeExtensionChip = (label, color) => {
    const chip = div(styles.extensionChip);
    const dot = div(styles.extensionChipDot);
    dot.style.backgroundColor = color;
    chip.appendChild(dot);
    chip.appendChild(span(undefined, {text: label}));
    return chip;
};

// `getExtensionDisplayInfo()` returns a JSON array of extension ids, or the string 'Null' when
// there are none. Older/other shapes (a plain string, an array, a map) are still accepted so a
// change on the analyzer side degrades to "show something" instead of throwing.
const parseExtensionDisplayInfo = value => {
    let ids = [];
    let text = '';
    try {
        if (typeof value === 'string') {
            if (value.startsWith('[') && value.endsWith(']')) {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) ids = parsed;
            } else {
                text = value;
            }
        } else if (Array.isArray(value)) {
            ids = value;
        } else if (value && typeof value === 'object') {
            ids = Object.keys(value);
        }
    } catch (e) {
        text = typeof value === 'string' ? value : String(value);
    }
    return {ids, text};
};

/**
 * @param {object} ctx panel context
 * @returns {?HTMLElement} null unless the extension section is enabled and has something to say
 */
export const renderExtensions = ctx => {
    const {t, settings, extensionDisplayInfo, extensionDataInfo, messages} = ctx;

    if (!extensionDisplayInfo || extensionDisplayInfo === 'Null' || extensionDisplayInfo === '') return null;

    // Parsed before the visibility check so a malformed value can never break rendering.
    const {ids, text} = parseExtensionDisplayInfo(extensionDisplayInfo);

    if (!settings.showExtensionsInfo) return null;

    const section = div(styles.section);
    section.appendChild(sectionHeader(t('extensionDisplayInfo')));

    const chips = div(styles.extensionChips);
    if (ids.length > 0) {
        if (settings.showSpecificExtensions) {
            for (const id of ids) {
                const extension = extensionDataInfo && extensionDataInfo[id];
                const label = getExtensionTranslation(id, messages, extension && extension.name);
                chips.appendChild(makeExtensionChip(label, (extension && extension.color) || 'var(--looks-secondary)'));
            }
        } else {
            // Specific extensions collapsed: show the count as a single accent-dotted pill.
            chips.appendChild(makeExtensionChip(`${ids.length} extensions`, 'var(--looks-secondary)'));
        }
    } else if (text) {
        chips.appendChild(makeExtensionChip(text, 'var(--looks-secondary)'));
    }

    section.appendChild(chips);
    return section;
};
