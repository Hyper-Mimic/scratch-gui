/**
 * Add a stack of blocks coming from the backpack (or a cross-sprite block drag) to a target.
 *
 * The stock code path is `vm.shareBlocksToTarget(...)` followed by `vm.refreshWorkspace()`. The
 * latter re-serialises every stack of the editing target and hands the whole XML back to the
 * workspace, which clears it and rebuilds every BlockSvg in it. On a large project that is a
 * multi-second freeze for the handful of blocks that were actually added -- and when the drop
 * lands on a target other than the one being edited, it rebuilds the editing target's workspace
 * for no visible change at all.
 *
 * This helper instead diffs the target's top-level stacks before and after the insert and emits
 * an `incremental` workspace update containing only the new ones, which the blocks container
 * appends with a single `Xml.domToWorkspace` call.
 */

/**
 * @param {object} vm the scratch-vm instance
 * @param {object} target target that received the blocks
 * @param {Array<string>} beforeIds top-level block ids captured before the insert
 * @returns {?string} XML for the stacks that were added, or null when nothing is new
 */
const addedStacksXml = (vm, target, beforeIds) => {
    const blocks = target.blocks;
    if (!blocks || !Array.isArray(blocks._scripts)) return null;

    const addedIds = blocks._scripts.filter(id => beforeIds.indexOf(id) === -1);
    if (addedIds.length === 0) return null;

    const stacksXml = addedIds
        .map(id => blocks.blockToXML(id, target.comments))
        .filter(Boolean)
        .join('');
    if (!stacksXml) return null;

    // The full-workspace XML carries every variable of the target, and Blockly's createVariable
    // is a no-op for ids it already knows, so repeating them here is safe and keeps pasted blocks
    // that reference brand new variables from being created against a missing one.
    const stage = vm.runtime.getTargetForStage();
    const globalVariables = stage ?
        Object.keys(stage.variables).map(key => stage.variables[key]) :
        [];
    const localVariables = target.isStage ?
        [] :
        Object.keys(target.variables).map(key => target.variables[key]);
    const variablesXml = `${globalVariables.map(variable => variable.toXML()).join('')}${
        localVariables.map(variable => variable.toXML(true)).join('')}`;

    return `<xml xmlns="http://www.w3.org/1999/xhtml"><variables>${variablesXml}</variables>${stacksXml}</xml>`;
};

/**
 * @param {object} vm the scratch-vm instance
 * @param {object} payload backpack payload: a list of standalone block objects, or
 *     `{blocks, extensionURLs}`
 * @param {?string} targetId id of the target to add the blocks to; defaults to the editing target
 * @returns {Promise} resolves once the blocks are in the VM and the workspace update was emitted
 */
const insertBackpackBlocks = (vm, payload, targetId) => {
    const target = targetId ? vm.runtime.getTargetById(targetId) : vm.editingTarget;
    if (!target) return Promise.resolve();

    // Only the editing target has a live workspace. For any other target nothing on screen
    // changes, so there is nothing to rebuild -- the target list update is enough.
    const isEditingTarget = target === vm.editingTarget;
    const canDiff = isEditingTarget && Array.isArray(target.blocks._scripts);
    const beforeIds = canDiff ? target.blocks._scripts.slice() : null;

    return vm.shareBlocksToTarget(payload, target.id).then(() => {
        if (!isEditingTarget) {
            vm.emitTargetsUpdate(false /* Don't emit project change */);
            return;
        }
        const xml = beforeIds ? addedStacksXml(vm, target, beforeIds) : null;
        if (xml) {
            vm.emit('workspaceUpdate', {xml, incremental: true});
            vm.emitTargetsUpdate(false /* Don't emit project change */);
            return;
        }
        if (!beforeIds) {
            // `_scripts` is not the shape this helper expects (a future scratch-vm), so fall back
            // to the full reload rather than leaving the new blocks invisible.
            vm.refreshWorkspace();
            return;
        }
        // Nothing actually landed on the workspace (no new top-level stack); just refresh the
        // target list so the sprite thumbnails stay in sync.
        vm.emitTargetsUpdate(false /* Don't emit project change */);
    });
};

export {
    insertBackpackBlocks
};
