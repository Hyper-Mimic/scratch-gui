// "Basic Information" section: the counters, grouped.
//
// One table drives everything: which `summary` field to read, which l10n key labels it, which
// group it belongs to and which setting hides it. Adding a counter is a one-line change here.

import {styles} from '../styles.js';
import {div, span} from '../dom.js';
import {sectionHeader, message} from './common.js';

/**
 * @type {Array<{key: string, field: string, label: string, group: string, setting: string}>}
 *   `field` is the `summary` property, `label` a MESSAGES key, `setting` the manifest boolean.
 */
export const STAT_ITEMS = [
    // === 资源 (Assets) ===
    {key: 'sprites', field: 'totalSprites', label: 'sprites', group: 'assets', setting: 'showSpriteCount'},
    {key: 'costumes', field: 'totalCostumes', label: 'costumes', group: 'assets', setting: 'showCostumeCount'},
    {key: 'sounds', field: 'totalSounds', label: 'sounds', group: 'assets', setting: 'showSoundCount'},
    // === 积木数量 (Block Count) ===
    {key: 'totalBlocks', field: 'totalBlocks', label: 'totalBlocks', group: 'blockCount', setting: 'showBlocksNum'},
    {
        key: 'effectiveBlocks',
        field: 'effectiveBlocks',
        label: 'effectiveBlocks',
        group: 'blockCount',
        setting: 'showEffectiveBlocksNum'
    },
    // === 积木段数 (Script Count) ===
    {key: 'totalScripts', field: 'totalScripts', label: 'totalScripts', group: 'scriptCount', setting: 'showScriptsNum'},
    {
        key: 'effectiveScripts',
        field: 'effectiveScripts',
        label: 'effectiveScripts',
        group: 'scriptCount',
        setting: 'showEffectiveScriptsNum'
    },
    // === 定义 (Definitions) ===
    {
        key: 'variables',
        field: 'totalVariables',
        label: 'variables',
        group: 'definitions',
        setting: 'showVarDefinitionsNum'
    },
    {key: 'lists', field: 'totalLists', label: 'lists', group: 'definitions', setting: 'showListDefinitionsNum'},
    {key: 'functions', field: 'functions', label: 'functions', group: 'definitions', setting: 'showFuncDefinitionsNum'}
];

/** Group id -> its heading's MESSAGES key. */
export const GROUPS = {
    assets: 'groupAssets',
    blockCount: 'groupBlockCount',
    scriptCount: 'groupScriptCount',
    definitions: 'groupDefinitions'
};

/** The order the groups are stacked in. */
export const GROUP_ORDER = ['assets', 'blockCount', 'scriptCount', 'definitions'];

// A setting that is absent counts as on (the React component behaved the same way).
const isOn = (settings, key) => (settings[key] !== undefined ? !!settings[key] : true);

/**
 * Whether at least one counter is visible. The result tab uses this to decide between the
 * stats and the "no statistics selected" note.
 * @param {object} settings
 * @returns {boolean}
 */
export const hasVisibleStats = settings => STAT_ITEMS.some(item => isOn(settings, item.setting));

/**
 * @param {object} ctx panel context
 * @returns {?DocumentFragment} null when there is nothing to show yet
 */
export const renderStats = ctx => {
    const {t, settings, summary} = ctx;
    if (!summary) return null;

    if (!hasVisibleStats(settings)) return message(styles.emptyStatsMessage, t('noStats'));

    const fragment = document.createDocumentFragment();
    fragment.appendChild(sectionHeader(t('basicInformation')));

    const body = div(styles.statsBody);
    for (const groupKey of GROUP_ORDER) {
        const items = STAT_ITEMS.filter(item => item.group === groupKey && isOn(settings, item.setting));
        if (items.length === 0) continue;

        const group = div(styles.statsGroup);
        group.appendChild(div(styles.statsGroupTitle, {text: t(GROUPS[groupKey])}));

        const grid = div(styles.statsGrid);
        for (const item of items) {
            // Label first, then the number: the row puts them on one line (label left, number
            // right), and this is also the order they should be read in.
            const stat = div(styles.statItem);
            stat.appendChild(span(styles.statLabel, {text: t(item.label)}));
            stat.appendChild(span(styles.statValue, {text: String(summary[item.field])}));
            grid.appendChild(stat);
        }

        group.appendChild(grid);
        body.appendChild(group);
    }

    fragment.appendChild(body);

    return fragment;
};
