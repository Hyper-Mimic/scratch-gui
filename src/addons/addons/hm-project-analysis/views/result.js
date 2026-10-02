// The result tab: project title, the stat counters, block categories, extensions, and the
// error banner. Composed of one node per section so each section can be skipped independently.

import {styles} from '../styles.js';
import {div, append} from '../dom.js';
import {message} from './common.js';
import {hasVisibleStats, renderStats} from './stats.js';
import {renderBlockTypes} from './block-types.js';
import {renderExtensions} from './extensions.js';
import {renderErrorBanner} from './errors.js';

/**
 * @param {object} ctx panel context
 * @returns {HTMLElement|DocumentFragment}
 */
export const renderResultTab = ctx => {
    const {t, settings, summary, projectTitle} = ctx;

    if (ctx.loading) return message(styles.loadingMessage, t('loading'));
    if (ctx.error) return message(styles.errorMessage, ctx.error);
    // An earlier analysis may still be on screen while a newer one fails: the error wins, so
    // `error` is checked before `summary` -- same order the React component used.
    if (!summary) return message(styles.emptyMessage, t('empty'));

    const fragment = document.createDocumentFragment();

    if (settings.showFileName) {
        fragment.appendChild(div(styles.projectTitle, {text: projectTitle || t('untitled')}));
    }

    // `append` (not `appendChild`) for every optional section: these return null when there is
    // nothing to show, and `appendChild(null)` throws at runtime.
    const stats = hasVisibleStats(settings) ?
        renderStats(ctx) :
        message(styles.emptyStatsMessage, t('noStats'));
    append(fragment, stats, renderBlockTypes(ctx), renderExtensions(ctx));

    const errorCount = summary.errors ? summary.errors.length : 0;
    if (errorCount > 0) append(fragment, renderErrorBanner(ctx, errorCount));

    return fragment;
};
