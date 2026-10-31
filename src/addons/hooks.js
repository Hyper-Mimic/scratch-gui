const AddonHooks = {
    appStateReducer: () => {},
    appStateStore: null,
    blockly: null,
    blocklyWorkspace: null,
    blocklyCallbacks: [],
    recolorCallbacks: []
};

// Resolves once some AppStateWrapper has created the redux store and published it above.
//
// `src/addons/api.js` arrives through a dynamic `import()`, so its module body can be evaluated
// either side of the first React render: with the chunk already cached (a reload, a warm HTTP
// cache, a fast local server) it can land *before* any component has mounted. Everything in that
// file that reads redux state at module scope -- the language, the body classes -- would then
// throw, and because a failed module evaluation is cached, the addon runtime stays dead for the
// rest of the page's life. Nothing in the UI would say so; the page just looks like "addons are
// off". Waiting on this promise instead makes the startup order irrelevant.
AddonHooks.storeReady = new Promise(resolve => {
    AddonHooks._resolveStoreReady = resolve;
});

export default AddonHooks;
