/**
 * Shared registry for the "workspace toolbox" (src/lib/workspace-toolbox/index.js).
 *
 * Addons contribute buttons via `addon.tab.addWorkspaceToolboxButton(...)`, which funnels into
 * here. The toolbox module reads this list and renders every contributed button alongside its
 * built-in tools. A `window`-level store is used (rather than an ES module import) so that the
 * addon API bundle and the GUI-layer toolbox module share one instance regardless of module
 * bundling order.
 */

const GLOBAL_KEY = '__hm_workspaceToolboxRegistry';

const getRegistry = () => {
    if (typeof window === 'undefined') return null;
    if (!window[GLOBAL_KEY]) {
        window[GLOBAL_KEY] = {
            // Buttons are rendered in insertion order. Each entry is a plain object:
            //   {label, icon, action}
            // `icon` is an image URL, which the toolbox renders in an `<img>` at 22px. Addons
            // pass the base64 data URI they get from
            // `import icon from '!url-loader?{"esModule":false}!./icon.svg'`; the artwork should
            // be near-black so the toolbox's `--filter-icon-black` can flip it for the dark
            // theme. `action(workspace)` runs when the button is clicked.
            buttons: [],
            // Listeners notified (with the new button) whenever a button is added, so a
            // mounted toolbox can render it immediately.
            listeners: []
        };
    }
    return window[GLOBAL_KEY];
};

const notify = (registry, button) => {
    for (const listener of registry.listeners) {
        try {
            listener(button);
        } catch (e) {
            // Never let a listener break registration.
        }
    }
};

/**
 * Registers a toolbox button. Returns an unsubscribe function that removes it.
 * @param {{id: (string|undefined), label: string, icon: string, action: function}} button
 * @returns {function} unsubscribe
 */
export const addWorkspaceToolboxButton = button => {
    const registry = getRegistry();
    if (!registry) return () => {};

    // Addons re-register their buttons when their text changes (a locale switch dispatches
    // `reenabled`), so a second registration of the same button must refresh the existing entry
    // rather than stack another one. `button.id` (optional) takes precedence as the identity:
    // without one the only thing to go by is the label, which is exactly what may have changed.
    const dedupeKey = button.id || button.label;

    // Removal goes by that identity rather than by the registration object it was handed, because
    // the entry standing for the button changes on every refresh: an addon that registers on mount
    // and unregisters on teardown holds the handle from the *first* registration, and after a
    // refresh that object is no longer in the list. (`dedupeKey` is null only when the button has
    // neither an id nor a label, in which case there is nothing but the object itself.)
    const remove = () => {
        const i = dedupeKey == null ?
            registry.buttons.indexOf(button) :
            registry.buttons.findIndex(b => (b.id || b.label) === dedupeKey);
        if (i !== -1) registry.buttons.splice(i, 1);
    };

    if (dedupeKey != null) {
        const existing = registry.buttons.find(b => (b.id || b.label) === dedupeKey);
        if (existing) {
            // Refresh the entry in place (the action/label may have been re-bound) and do not
            // add a duplicate.
            registry.buttons[registry.buttons.indexOf(existing)] = button;
            // ...and say so: an entry is refreshed precisely because something about the button
            // changed, and whatever already rendered the old one has no other way to hear it.
            notify(registry, button);
            return remove;
        }
    }

    registry.buttons.push(button);
    notify(registry, button);
    return remove;
};

/**
 * Subscribes to button changes: each newly-added button, and each re-registration of a button
 * already in the list (a refresh — see `addWorkspaceToolboxButton`). Returns an unsubscribe
 * function.
 * @param {function} listener Called with the added or refreshed button.
 */
export const onWorkspaceToolboxButton = listener => {
    const registry = getRegistry();
    if (!registry) return () => {};
    registry.listeners.push(listener);
    return () => {
        const i = registry.listeners.indexOf(listener);
        if (i !== -1) registry.listeners.splice(i, 1);
    };
};

/**
 * Returns the current list of registered buttons (live reference — do not mutate).
 */
export const getWorkspaceToolboxButtons = () => {
    const registry = getRegistry();
    return registry ? registry.buttons : [];
};
