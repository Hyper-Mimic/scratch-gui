/**
 * Whether the desktop app's menu bar should render the "See Project Page" button.
 *
 * This used to be the `desktop-project-page-button` addon: the menu bar read its enabled flag out
 * of the addon settings store, and the toggle was a card on the addon settings page. It is now a
 * real Desktop Settings option instead, stored by the app's main process in tw_config.json.
 *
 * The editor preload exposes the value synchronously (sendSync) so the menu bar can read it during
 * render, and pushes changes while Desktop Settings is open. That value is cached here: the menu
 * bar re-renders often, and a synchronous IPC round trip on every render is not worth it. One
 * module-level subscription keeps the cache fresh even while no menu bar is mounted.
 *
 * On the website there is no preload, so this degrades to "off" and no-op subscriptions -- the
 * website's own community UI decides whether the button is needed there.
 */

const getEditorPreload = () => (
    typeof window === 'undefined' ? null : window.EditorPreload
);

let cachedValue = null;
let installed = false;
const listeners = new Set();

const ensureInstalled = () => {
    if (installed) return;
    installed = true;
    const preload = getEditorPreload();
    if (preload && typeof preload.onShowProjectPageButtonChanged === 'function') {
        preload.onShowProjectPageButtonChanged((showProjectPageButton) => {
            cachedValue = !!showProjectPageButton;
            for (const listener of listeners) listener(cachedValue);
        });
    }
};

const getShowProjectPageButton = () => {
    ensureInstalled();
    if (cachedValue !== null) return cachedValue;
    const preload = getEditorPreload();
    cachedValue = !!(preload && typeof preload.getShowProjectPageButton === 'function' &&
        preload.getShowProjectPageButton());
    return cachedValue;
};

/**
 * @param {Function} callback called with the new boolean when Desktop Settings changes the option.
 * @returns {Function} unsubscribe; always a function, even on the website.
 */
const onShowProjectPageButtonChanged = (callback) => {
    ensureInstalled();
    listeners.add(callback);
    return () => listeners.delete(callback);
};

export {
    getShowProjectPageButton,
    onShowProjectPageButtonChanged
};
