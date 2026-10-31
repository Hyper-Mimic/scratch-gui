// The chunk is imported once and the promise kept: an entry point that wants the addon runtime to
// be in place *before* its first render can simply await the same call.
let addonsPromise = null;

/**
 * Start the addon runtime (idempotent).
 * @returns {Promise} resolves once the runtime has evaluated and started the enabled addons
 */
const runAddons = () => {
    if (!addonsPromise) {
        addonsPromise = import(/* webpackChunkName: "addons" */ './api');
    }
    return addonsPromise;
};

export default runAddons;
