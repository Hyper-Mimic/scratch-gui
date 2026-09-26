/**
 * Runtime text lookup for the fork's own UI that is *not* React.
 *
 * The advanced settings modal and every React component get their text from the `intl` object
 * React-Intl hands them, and react-intl resolves it against the app's message table. Pieces of
 * this fork that live outside React (a comment bubble's Markdown toggle, the workspace toolbox
 * overlay inside Blockly's DOM) have no such object — but they are still part of the same UI and
 * must translate with everything else, and must keep up with a language switch made from the
 * language menu, which re-renders React without touching those DOM islands.
 *
 * So they read the very table react-intl reads, straight off the store. Nothing is cached: the
 * value is taken at the moment it is about to be shown, which is what makes a language switch
 * take effect everywhere. Callers are expected to re-read on the events that precede a display
 * (a hover, an opening menu, a mode change) rather than capture the string once.
 *
 * A missing id resolves to the message's own `defaultMessage`, as react-intl would. That is the
 * normal case for two groups: English (generated-translations.json has no `en` block — the
 * `defaultMessage` written at the call site *is* the English text) and the many locales this
 * fork does not translate its own strings into. A store that is not up yet degrades the same
 * way, which matters because this module is loaded by the player and embed bundles too, where
 * those DOM islands never exist but the code still has to survive being imported.
 */

/**
 * Reads one of the fork's messages in the language the app is currently in.
 *
 * @param {{id: string, defaultMessage: string}} message a `defineMessages` entry
 * @returns {string} the translation, or the entry's `defaultMessage` when there is none
 */
const hmMessage = message => {
    const store = typeof window === 'undefined' ? null : window.ReduxStore;
    const state = store && typeof store.getState === 'function' ? store.getState() : null;
    const table = state && state.locales ? state.locales.messages : null;
    return (table && table[message.id]) || message.defaultMessage;
};

export {
    hmMessage
};
