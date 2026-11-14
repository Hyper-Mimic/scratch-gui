import twTranslations from './generated-translations.json';

const addAdditionalTranslations = editorMessages => {
    for (const locale of Object.keys(editorMessages)) {
        const toMixIn = twTranslations[locale.toLowerCase()];
        if (toMixIn) {
            Object.assign(editorMessages[locale], toMixIn);
        }
    }

    // We reuse our `es` translations for `es-419` instead of maintaining separate translations.
    Object.assign(editorMessages['es-419'], twTranslations.es);
};

/**
 * `vm.setLocale` hands the messages map to format-message, whose translate() rewrites every
 * entry it uses in place from a string to `{message, format}` (format-message/index.js:124).
 * That same object is the Redux locale state shared with IntlProvider, Blocks, addon 取词 etc.,
 * all of which expect plain strings. Give the VM a shallow copy instead, unwrapping entries
 * that have already been cached, so the shared state never gets mutated by a third party.
 * @param {object} messages locale messages map (id -> string)
 * @returns {object} a copy containing strings only
 */
const createVmMessages = messages => {
    const copy = {};
    for (const id of Object.keys(messages || {})) {
        const value = messages[id];
        copy[id] = (value && typeof value === 'object' && typeof value.message === 'string') ?
            value.message : value;
    }
    return copy;
};

export default addAdditionalTranslations;
export {createVmMessages};
