/**
 * "Viewport Culling" (HyperMimic editor setting).
 *
 * scratch-blocks already hides stacks that are outside the viewport with display:none
 * (src/core/intersection_observer.js). This setting additionally lets it move those stacks out
 * of the document altogether, so the browser does not walk their DOM on every style
 * invalidation, and the nodes no longer show up in the element tree at all. The block objects,
 * their geometry and the workspace's content rect table stay alive, so nothing outside the DOM
 * notices; a stack is put back at its original z position when it scrolls into view.
 *
 * The initial value reaches the workspace through its inject options (see
 * containers/blocks.jsx), because it has to be set before the first project loads. This module
 * only pushes runtime changes to the live workspace.
 */

import {
    getSetting,
    onSettingsChange,
    SETTING_VIEWPORT_CULLING
} from '../hypermimic-settings.js';

const getWorkspace = () => {
    if (window.AddonHooks && window.AddonHooks.blocklyWorkspace) {
        return window.AddonHooks.blocklyWorkspace;
    }
    // The compressed build only exposes a small part of Blockly on window.
    if (window.Blockly && window.Blockly.getMainWorkspace) {
        return window.Blockly.getMainWorkspace();
    }
    return null;
};

const apply = value => {
    const workspace = getWorkspace();
    if (!workspace || typeof workspace.setViewportCullingEnabled !== 'function') {
        return;
    }
    workspace.setViewportCullingEnabled(!!value);
};

const initViewportCulling = () => {
    onSettingsChange((key, value) => {
        if (key === SETTING_VIEWPORT_CULLING) {
            apply(value);
        }
    });
    // A workspace created later already read the setting from its options, so
    // there is nothing to apply here.
    apply(getSetting(SETTING_VIEWPORT_CULLING));
};

export {initViewportCulling};
export default initViewportCulling;
