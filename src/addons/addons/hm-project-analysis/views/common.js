// Small pieces shared by more than one view.

import {styles} from '../styles.js';
import {div, span} from '../dom.js';

/**
 * Section header: the label on the left, a dotted rule filling the rest of the row.
 * @param {string} label already-translated text
 * @returns {HTMLElement}
 */
export const sectionHeader = label => {
    const header = div(styles.sectionHeader);
    header.appendChild(span(styles.sectionHeaderTitle, {text: label}));
    header.appendChild(div(styles.sectionHeaderDivider));
    return header;
};

/**
 * A centred stand-in message (loading / empty / no-errors ...).
 * @param {string} className one of the message classes from the stylesheet
 * @param {string} text
 * @returns {HTMLElement}
 */
export const message = (className, text) => div(className, {text});
