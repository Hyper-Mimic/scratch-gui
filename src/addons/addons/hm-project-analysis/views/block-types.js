// "Block Categories" section: one row per category, with a progress bar in the real theme
// colour of that category.

import {styles} from '../styles.js';
import {div, span} from '../dom.js';
import {sectionHeader} from './common.js';
import {getExtensionTranslation, getBlockTypeTranslation} from '../lib/index.js';
import {getCategoryColor} from '../theme-colors.js';

/**
 * @param {object} ctx panel context
 * @returns {?HTMLElement} null when the project has no countable blocks
 */
export const renderBlockTypes = ctx => {
    const {t, settings, summary, messages, extensionDataInfo, getBlockColor} = ctx;
    if (!summary || !summary.blockTypes) return null;

    let entries = Object.entries(summary.blockTypes).filter(([, count]) => count > 0);

    // With `showSpecificExtensions` on, extensions are listed separately instead of being
    // lumped into the generic "others" bucket (which is dropped once any extension exists).
    let extensionEntries = [];
    if (settings.showSpecificExtensions && summary.extBlocksNumInTypes) {
        extensionEntries = Object.entries(summary.extBlocksNumInTypes)
            .filter(([key, count]) => count > 0 && key !== 'others');
        if (extensionEntries.length > 0) {
            entries = entries.filter(([category]) => category !== 'others');
        }
    }

    const allEntries = [...entries, ...extensionEntries];
    if (allEntries.length === 0) return null;

    if (settings.orderType === 'byCount') {
        allEntries.sort((a, b) => b[1] - a[1]);
    }

    // Bar denominator: the biggest row (betterProgressBar) or the whole project, so the bars
    // read as "share of all blocks" by default.
    const maxCount = settings.betterProgressBar ?
        Math.max(...allEntries.map(([, count]) => count)) :
        summary.totalBlocks;
    const effectiveMax = maxCount > 0 ? maxCount : 1;

    const section = div(styles.section);
    section.appendChild(sectionHeader(t('blockCategories')));

    const list = div(styles.categoryList);
    for (const [category, count] of allEntries) {
        const isExtension = extensionEntries.some(([key]) => key === category);
        const extension = extensionDataInfo && extensionDataInfo[category];

        let displayName;
        let color;
        if (isExtension) {
            // Extension colour comes from the analysis (the extension's own block colour);
            // the name goes through the addon l10n, falling back to the real name the
            // extension source declared for the current locale.
            color = (extension && extension.color) || getCategoryColor(getBlockColor, category);
            displayName = getExtensionTranslation(category, messages, extension && extension.name);
        } else {
            displayName = getBlockTypeTranslation(category, messages);
            color = getCategoryColor(getBlockColor, category);
        }

        const percent = (count / effectiveMax) * 100;
        // `betterProgressBar` lets a small category keep a proportionally wide bar instead of
        // being clipped at 100% when the denominator is the whole project.
        const barWidth = settings.betterProgressBar ? percent : Math.min(percent, 100);
        const share = ((count / summary.totalBlocks) * 100).toFixed(1);

        // Name first: the row reads "name ... count" on its first line (the CSS right-aligns the
        // count), with the bar wrapping onto the line below it.
        const item = div(styles.categoryItem);
        item.appendChild(span(styles.categoryName, {text: displayName}));
        item.appendChild(span(styles.categoryCount, {text: `${count} (${share}%)`}));
        const barWrapper = div(styles.categoryBarWrapper);
        barWrapper.appendChild(div(styles.categoryBarFill, {
            style: {width: `${barWidth}%`, backgroundColor: color}
        }));
        item.appendChild(barWrapper);

        list.appendChild(item);
    }

    section.appendChild(list);
    return section;
};
