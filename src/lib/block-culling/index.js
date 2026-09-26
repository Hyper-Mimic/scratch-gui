/**
 * "Cull off-screen blocks" (experimental performance setting).
 *
 * Driven by the HyperMimic setting `blockCulling` (src/lib/hypermimic-settings.js), whose UI
 * is the toggle in the advanced settings modal. It is applied through the scratch-blocks
 * patch #8 (.workbuddy/patch_compressed.py), which turns two things on together:
 *
 *   1. `BlockSvg.prototype.setIntersects` detaches a block's <g> from the DOM instead of
 *      hiding it with `display:none`. Detached nodes leave the browser's style / layout /
 *      hit-test trees, so with tens of thousands of blocks the per-frame work no longer
 *      scales with the total block count.
 *   2. `IntersectionObserver.prototype.queueIntersectionCheck` coalesces onto an animation
 *      frame instead of a microtask, and `BlockDragger.dragBlock` queues a check every
 *      drag frame.
 *
 * The switch only ever *flips a flag* the patched Blockly reads (`window.__hmBlockCulling`,
 * plus `window.__hmBlockCullingFast` for the patch #9 hot-path layer) and asks the workspace
 * to recompute culling. When it is off, Blockly runs its original code path unchanged, which
 * is why the setting defaults to off.
 *
 * The workspace is looked up through the same `Blockly.getMainWorkspace()` that the rest of
 * this fork uses. It is not guaranteed to exist yet when init runs (the editor mounts it
 * separately), so a short retry is used instead of wiring into the React tree.
 */

import {
    getSetting,
    onSettingsChange,
    SETTING_BLOCK_CULLING
} from '../hypermimic-settings.js';

const RETRY_INTERVAL_MS = 500;
const MAX_RETRIES = 40;

let retryTimer = null;
let retries = 0;

const getWorkspace = () => {
    if (typeof window === 'undefined' || !window.Blockly || !window.Blockly.getMainWorkspace) {
        return null;
    }
    return window.Blockly.getMainWorkspace();
};

/**
 * Push the current value down into Blockly, if the (patched) workspace is ready.
 *
 * The second argument turns on the patch #9 hot-path optimisations (geometry
 * memos + per-frame slice sweep). They are a separate opt-in inside the patch,
 * and here they simply follow the master switch: the toggle is the single
 * experimental entry point, so one switch exercises the whole feature. Flip
 * ENABLE_FAST_PATH to false to run patch #8 alone (raw DOM detaching) for
 * A/B comparison.
 *
 * @returns {boolean} true when the value was applied.
 */
const ENABLE_FAST_PATH = false;

const apply = value => {
    const workspace = getWorkspace();
    if (!workspace || typeof workspace.hmApplyBlockCulling !== 'function') {
        return false;
    }
    workspace.hmApplyBlockCulling(value, ENABLE_FAST_PATH && value);
    if (value && typeof workspace.hmCullStatReset === 'function') {
        // Start a fresh stats window each time the switch turns on.
        workspace.hmCullStatReset();
    }
    return true;
};

const stopRetrying = () => {
    if (retryTimer !== null) {
        clearInterval(retryTimer);
        retryTimer = null;
    }
};

/**
 * Wait for the block workspace to exist, then apply, then keep it in sync with the setting.
 * Safe to call once, when the editor interface comes up.
 */
const initBlockCulling = () => {
    if (typeof window === 'undefined') return;

    const current = () => getSetting(SETTING_BLOCK_CULLING);

    if (apply(current())) {
        retries = MAX_RETRIES;
    } else {
        // The workspace is created after the GUI mounts. Poll briefly rather than hooking
        // into the React lifecycle, so this stays a plain lib module.
        retryTimer = setInterval(() => {
            retries += 1;
            if (apply(current()) || retries >= MAX_RETRIES) {
                stopRetrying();
            }
        }, RETRY_INTERVAL_MS);
    }

    onSettingsChange((key, value) => {
        if (key !== SETTING_BLOCK_CULLING) return;
        if (apply(value)) return;
        // The workspace went away (project closed) or was not up yet: retry briefly.
        retries = 0;
        stopRetrying();
        retryTimer = setInterval(() => {
            retries += 1;
            if (apply(value) || retries >= MAX_RETRIES) {
                stopRetrying();
            }
        }, RETRY_INTERVAL_MS);
    });
};

export {
    initBlockCulling
};
