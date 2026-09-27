/**
 * Per-addon single-modal guard.
 *
 * HyperMimic toolbox utilities (bookmark, todo, hm-project-analysis, readme, mediarecorder) each
 * open a modal from their toolbox button. Two DIFFERENT addons may have their modals open at the
 * same time. But a SINGLE addon must not stack two of its own modals: opening one again first
 * closes the one it already had open.
 *
 * State lives on `window` rather than in module scope on purpose. Every addon is loaded as its own
 * dynamic-import chunk, so webpack hands each one a *separate copy* of this module — a plain
 * module-level variable would therefore be per-addon and the per-addon rule would silently fail.
 * A `window` slot (a map keyed by addon id) is shared by every copy, so the guard actually works
 * across addons.
 */

const KEY = '__hm_activeAddonModals';

const getMap = () => {
    if (typeof window === 'undefined') return Object.create(null);
    if (!window[KEY]) window[KEY] = Object.create(null);
    return window[KEY];
};

/**
 * Announce a modal for addon `id`. If the SAME addon already has a modal open, it is closed first
 * (self-stacking prevention). Other addons' modals are left untouched, so modals from different
 * addons can coexist.
 *
 * @param {string} id addon id, e.g. 'bookmark'
 * @param {function} close the modal's `remove` (or any function that closes it)
 */
export const registerAddonModal = (id, close) => {
    const map = getMap();
    const existing = map[id];
    if (existing && typeof existing.close === 'function') {
        try {
            existing.close();
        } catch (e) {
            // A failing close must never block the modal the user actually asked for.
        }
    }
    map[id] = { id, close };
};

/**
 * Forget a modal. Only clears when the caller is the exact one registered for `id`, so a stale or
 * already-replaced modal cannot wipe the next one's entry.
 *
 * @param {string} id addon id
 * @param {function} close the same `close` passed to registerAddonModal
 */
export const unregisterAddonModal = (id, close) => {
    const map = getMap();
    const existing = map[id];
    if (existing && existing.close === close) {
        delete map[id];
    }
};
