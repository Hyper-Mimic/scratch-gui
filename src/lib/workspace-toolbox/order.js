/**
 * The order the workspace toolbox (./index.js) shows its buttons in.
 *
 * Without this the column is in *registration* order -- and since every addon registers its button
 * from its own dynamic import, that order is decided by chunk-loading timing and can come out
 * different from one session to the next. Here the user arranges the tools once, in the advanced
 * settings modal (./settings-panel.js), and the arrangement is stored as a list of keys; the
 * toolbox renders by it from then on, no matter which addon gets there first.
 *
 * A key is `tool.id || tool.label`, the same identity registry.js dedupes by. Every addon that
 * contributes a button passes an explicit `id` ('bookmark', 'todo', 'project-analysis'), and that
 * is what keeps a stored arrangement stable across a language switch: a label is translated, an
 * id is not.
 *
 * The ordering is *partial* by design:
 *   - a key that is not in the stored list -- a tool contributed after the user arranged things --
 *     sorts after every key that is, keeping its registration order relative to other such tools.
 *     So a newly added tool lands at the bottom of the column instead of reshuffling the rest;
 *   - a stored key that matches no registered tool is *not* dropped. It costs nothing and it is
 *     what sends a tool back to its place when its addon is switched on again.
 */

import {
    getSetting,
    setSetting,
    SETTING_WORKSPACE_TOOLBOX_ORDER
} from '../hypermimic-settings.js';

/**
 * The identity of a toolbox button. `id` is preferred because a label is translated (see the
 * module comment); a button registered without either has no identity and cannot be ordered.
 *
 * @param {{id: (string|undefined), label: (string|undefined)}} tool
 * @returns {string|undefined}
 */
const getToolKey = tool => tool.id || tool.label;

/**
 * @returns {string[]} the stored arrangement, or an empty list if none was ever made
 */
const getOrder = () => {
    const stored = getSetting(SETTING_WORKSPACE_TOOLBOX_ORDER);
    return Array.isArray(stored) ? stored : [];
};

/**
 * Stores an arrangement.
 *
 * @param {string[]} keys
 */
const setOrder = keys => {
    // Copied: the caller keeps editing its own array (the settings panel moves one key at a time),
    // and the settings store hands the value out again on every read -- storing the caller's array
    // would let a later edit silently mutate the live setting.
    setSetting(SETTING_WORKSPACE_TOOLBOX_ORDER, keys.slice());
};

/**
 * Sorts `items` by the stored arrangement.
 *
 * @param {Array} items anything identifiable by `keyOf`
 * @param {function} keyOf returns the key of an item
 * @param {string[]} [order] arrangement to apply; defaults to the stored one
 * @returns {Array} a new array; `items` is left alone
 */
const sortByOrder = (items, keyOf, order = getOrder()) => {
    if (!order.length) return items.slice();

    // Rank by *position in the arrangement* rather than by the raw key, and collapse duplicates
    // so that a hand-edited list naming one tool twice cannot push the placed tools past the
    // unplaced ones.
    const rank = new Map();
    for (const key of order) {
        if (!rank.has(key)) rank.set(key, rank.size);
    }

    // Unplaced tools rank after every placed one: `order.length` is greater than any rank the map
    // can hold, and adding the original index keeps them in registration order rather than in
    // whatever order the sort happens to visit them.
    const rankOf = wrapper => {
        const key = keyOf(wrapper.item);
        return rank.has(key) ? rank.get(key) : order.length + wrapper.index;
    };

    return items
        .map((item, index) => ({item, index}))
        .sort((a, b) => rankOf(a) - rankOf(b))
        .map(entry => entry.item);
};

/**
 * The list to store after the user arranged the tools that are registered *right now*.
 *
 * A stored key that is not among them -- a tool whose addon is switched off at this moment -- is
 * kept, after the arranged ones. Without this, disabling an addon, reordering the rest and then
 * enabling it again would send that tool to the bottom of the column, which is exactly the kind
 * of silent reshuffle the arrangement exists to prevent.
 *
 * @param {string[]} visibleKeys the tools as they are now arranged
 * @param {string[]} [order] arrangement before the edit; defaults to the stored one
 * @returns {string[]}
 */
const mergeVisibleIntoOrder = (visibleKeys, order = getOrder()) => {
    const seen = new Set(visibleKeys);
    return visibleKeys.concat(order.filter(key => !seen.has(key)));
};

export {
    getOrder,
    getToolKey,
    mergeVisibleIntoOrder,
    setOrder,
    sortByOrder
};
