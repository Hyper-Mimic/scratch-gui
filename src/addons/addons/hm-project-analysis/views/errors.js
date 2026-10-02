// Errors: the banner inside the result tab, and the errors tab itself.

import {styles} from '../styles.js';
import {el, div, span} from '../dom.js';
import {sectionHeader, message} from './common.js';

/**
 * The red banner shown in the result tab when the analysis found errors.
 *
 * The "View Errors" button carries `data-tab="errors"` and is handled by the panel's click
 * delegation, exactly like the tab buttons themselves -- no per-button listener to leak.
 *
 * @param {object} ctx panel context
 * @param {number} errorCount
 * @returns {HTMLElement}
 */
export const renderErrorBanner = (ctx, errorCount) => {
    const section = div(styles.section);
    section.appendChild(sectionHeader(ctx.t('errorInfo')));

    const banner = div(styles.errorBanner);
    banner.appendChild(span(styles.errorBannerText, {
        text: ctx.t('errors', {count: errorCount})
    }));
    banner.appendChild(el('button', styles.viewErrorsBtn, {
        text: ctx.t('viewErrors'),
        attrs: {type: 'button'},
        dataset: {tab: 'errors'}
    }));
    section.appendChild(banner);

    return section;
};

/**
 * @param {object} ctx panel context
 * @returns {HTMLElement}
 */
export const renderErrorsTab = ctx => {
    const {t, summary} = ctx;
    const errors = (summary && summary.errors) || [];

    if (errors.length === 0) return message(styles.noErrorsMessage, t('noErrors'));

    const container = div(styles.errorsContainer);
    container.appendChild(div(styles.errorsDescription, {text: t('errorsDescription')}));
    container.appendChild(div(styles.errorsListTitle, {text: t('errorsListTitle')}));

    const list = div(styles.errorsList);
    errors.forEach((error, index) => {
        const item = div(styles.errorItem);
        item.appendChild(span(styles.errorIndex, {text: `#${index + 1}`}));
        item.appendChild(span(styles.errorText, {text: error}));
        list.appendChild(item);
    });
    container.appendChild(list);

    return container;
};
