/**
 * Native support for dropping a whole box selection into the backpack or onto
 * another target, and for the box-selection context menu entry that does the
 * same with a right-click.
 *
 * scratch-blocks drags a box selection as one group (core/gesture.js
 * startBoxDrag_), but the VM's BLOCK_DRAG_END event only carries the grabbed
 * stack: the VM serialises the main block's Blockly move event (the only one
 * that is flagged isOutside), while followers are quietly placed back onto the
 * canvas. So the GUI looks the rest of the selection up itself: while the
 * selection still exists at drag end, collectBoxSelectionPayload turns it into
 * the same payload shape a normal single-stack drag would deliver, and both
 * the backpack container and the target pane feed it through their existing
 * pipelines.
 */

const BACKPACK_EVENT = 'hm-backpack-add-blocks';

const MENU_LABELS = {
    'en': 'Add Selection to Backpack',
    'zh-cn': '将选中积木放入书包',
    'zh-tw': '將選中積木放入書包',
    'ja': '選択範囲をバックパックに追加',
    'ko': '선택 항목을 가방에 추가',
    'de': 'Auswahl in den Rucksack legen',
    'fr': 'Ajouter la sélection au sac à dos',
    'es': 'Añadir la selección a la mochila',
    'it': 'Aggiungi la selezione allo zaino',
    'pt-br': 'Adicionar seleção à mochila',
    'ru': 'Добавить выделение в рюкзак',
    'nl': 'Selectie naar de rugzak'
};

/**
 * Serialise the current box selection into a backpack/share payload.
 * Returns null for a normal single-stack drag (the grabbed block is not
 * box-selected), so callers can fall through to the stock path.
 * @param {VirtualMachine} vm the scratch-vm instance
 * @param {?string} topBlockId id of the dragged (main) block
 * @param {boolean} [wholeMainStack] true for drag-end callers: the main block
 *     travels with its whole connected sub-stack (startBoxDrag_ puts
 *     main.getDescendants(true) on the drag surface, including a trailing
 *     chain the rubber band never claimed), so the payload must match that or
 *     the chain stays behind. The context menu keeps the prune-to-selection
 *     semantics and passes false.
 * @returns {?{blockObjects: object, topBlockId: string}} null when this was
 *     not a box-selection drag
 */
const collectBoxSelectionPayload = (vm, topBlockId, wholeMainStack) => {
    const ScratchBlocks = window.ScratchBlocks;
    if (!ScratchBlocks || !vm) return null;
    const ws = ScratchBlocks.getMainWorkspace && ScratchBlocks.getMainWorkspace();
    if (!ws || !ws.isBlockBoxSelected) return null;
    const main = topBlockId && ws.getBlockById(topBlockId);
    // The selection survives the drag (endBoxDrag_ does not clear it), and
    // every listener runs while it is still in place.
    if (!main || !ws.isBlockBoxSelected(main)) return null;
    const selection = Array.from(ws.getBoxSelection());
    if (!selection.length) return null;
    const target = vm.editingTarget;
    const vmBlocks = target && target.blocks && target.blocks._blocks;
    if (!vmBlocks) return null;

    const selectionSet = new Set(selection);
    // Same fragment rule as the box duplicate (scratchBlocksUtils.
    // duplicateSelectionAndDragCallback): a block whose parent is also
    // selected belongs to that parent's fragment; a block whose parent is
    // not selected starts its own top-level stack in the payload.
    const roots = selection.filter(block => {
        const parent = block.getParent();
        return !parent || !selectionSet.has(parent);
    });
    if (!roots.length) return null;

    const ids = new Set();
    // The main block's whole sub-stack rides the drag (BlockDragger keeps the
    // next chain connected), so a drag-end payload includes it even where the
    // rubber band never selected the trailing blocks. The menu keeps the
    // prune-to-selection semantics and collects through the loop below.
    const mainStack = wholeMainStack ? main.getDescendants(true) : null;
    const mainStackSet = mainStack ? new Set(mainStack) : null;
    if (mainStack) {
        for (const d of mainStack) {
            ids.add(d.id);
        }
    }
    for (const block of selection) {
        if (mainStackSet && mainStackSet.has(block)) continue;
        // The block and everything nested inside it (inputs and shadows);
        // getDescendants does not follow next connections.
        for (const d of block.getDescendants(false)) {
            ids.add(d.id);
        }
        // The selected chain after it: only follow while the next block is
        // still selected, so an unselected block between two selected ones
        // does not leak into the payload (the later block becomes its own
        // root). Matches the follower rule in startBoxDrag_ (collectUnit_ with
        // followNext=false then disconnecting an unselected trailing block).
        let cur = block.getNextBlock();
        while (cur && selectionSet.has(cur)) {
            for (const d of cur.getDescendants(false)) {
                ids.add(d.id);
            }
            cur = cur.getNextBlock();
        }
    }

    const blockObjects = [];
    for (const id of ids) {
        const obj = vmBlocks[id];
        if (!obj) continue;
        // Deep-copy: these objects belong to the VM and get mutated below.
        const copy = JSON.parse(JSON.stringify(obj));
        copy.topLevel = false;
        blockObjects.push(copy);
    }
    // Each fragment root becomes a top-level stack at its current position,
    // so pasting/sharing the payload reproduces the same arrangement of stacks.
    for (const root of roots) {
        const obj = blockObjects.find(o => o.id === root.id);
        if (!obj) continue;
        const pos = root.getRelativeToSurfaceXY();
        obj.topLevel = true;
        obj.x = pos.x;
        obj.y = pos.y;
    }
    const payloadTopId = roots.some(r => r.id === main.id) ? main.id : roots[0].id;
    return {
        blockObjects: vm.exportStandaloneBlocks(blockObjects),
        topBlockId: payloadTopId
    };
};

/**
 * Adds the current box selection to the backpack through the event bridge in
 * containers/backpack.jsx (same pipeline as dragging a stack in).
 * @param {VirtualMachine} vm the scratch-vm instance
 * @param {?string} topBlockId id of a box-selected block
 */
const addBoxSelectionToBackpack = (vm, topBlockId) => {
    const payload = collectBoxSelectionPayload(vm, topBlockId);
    if (!payload) return;
    window.dispatchEvent(new CustomEvent(BACKPACK_EVENT, {detail: payload}));
};

/**
 * Context-menu option for a right-click on a box-selected block. Registered
 * globally by containers/blocks.jsx via ScratchBlocks.boxSelectionExtraOptions.
 * @param {VirtualMachine} vm the scratch-vm instance
 * @param {string} locale the GUI locale
 * @param {Blockly.BlockSvg} block the right-clicked (box-selected) block
 * @returns {object} a Blockly context menu option
 */
const makeBackpackMenuOption = (vm, locale, block) => ({
    text: MENU_LABELS[locale] || MENU_LABELS.en,
    enabled: true,
    callback: () => addBoxSelectionToBackpack(vm, block.id)
});

export {
    addBoxSelectionToBackpack,
    collectBoxSelectionPayload,
    makeBackpackMenuOption
};
