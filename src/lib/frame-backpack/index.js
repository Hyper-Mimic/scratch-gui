/**
 * Frames (the titled boxes that group scripts) in the backpack.
 *
 * A frame is not a block: scratch-blocks draws it and the VM has no model for it (see the `frames`
 * key the VM carries per target). So a backpack item has to hold both halves -- the member blocks,
 * in the usual standalone-block format the backpack already speaks, and the frame itself, as the
 * XML scratch-blocks wrote -- and the receiving side has to put both back.
 *
 * The blocks stay in the shape the backpack's own drop pipeline expects (`codePayload` reads
 * `blockObjects`, `insertBackpackBlocks` reads `payload.blocks`); the frame XML rides alongside as
 * a separate field and is folded into the stored body by `codePayload`.
 */

import {updateBlockDrag} from '../../reducers/block-drag';

const BACKPACK_EVENT = 'hm-backpack-add-blocks';
// Kept in sync with containers/backpack.jsx.
const BACKPACK_SELECTOR = '[class*="backpack_backpack-container"]';

const MENU_LABELS = {
    'en': 'Add Frame to Backpack',
    'zh-cn': '将代码框放入书包',
    'zh-tw': '將程式框放入書包',
    'ja': 'フレームをバックパックに追加',
    'ko': '프레임을 가방에 추가',
    'de': 'Rahmen in den Rucksack legen',
    'fr': 'Ajouter le cadre au sac à dos',
    'es': 'Añadir el marco a la mochila',
    'it': 'Aggiungi la cornice allo zaino',
    'pt-br': 'Adicionar moldura à mochila',
    'ru': 'Добавить рамку в рюкзак',
    'nl': 'Kader naar de rugzak'
};

/**
 * Attach frame XML to a block payload in the shape every reader understands.
 *
 * A bare block array is what the backpack and `shareBlocksToTarget` handle most often, but it has
 * nowhere to put the frame. The object shape does -- and it must carry `extensionURLs` (even an
 * empty one), because `deserializeStandaloneBlocks` uses that key to tell the two shapes apart and
 * would otherwise read the wrapper itself as a block list.
 * @param {(Array|object)} blockObjects what `exportStandaloneBlocks` returned
 * @param {?string} frames the `<frame>` XML, if there is any
 * @returns {(Array|object)} a payload carrying both
 */
const withFrames = (blockObjects, frames) => {
    if (!frames) return blockObjects;
    if (Array.isArray(blockObjects)) {
        return {blocks: blockObjects, extensionURLs: {}, frames};
    }
    return Object.assign({}, blockObjects, {extensionURLs: blockObjects.extensionURLs || {}, frames});
};

/**
 * The GUI locale, read from the store rather than passed in: this menu is installed once, but the
 * user can switch language from the menu bar at any time.
 * @returns {string} locale such as "zh-cn"
 */
const currentLocale = () => {
    try {
        const store = window.AddonHooks && window.AddonHooks.appStateStore;
        const state = store && store.getState();
        return (state && state.locales && state.locales.locale) || 'en';
    } catch (e) {
        return 'en';
    }
};

/**
 * Move the `<frame>` elements of a payload by the same delta the blocks were moved by.
 * @param {string} xml `<frame>` elements
 * @param {number} dx offset in workspace units
 * @param {number} dy offset in workspace units
 * @returns {string} the shifted XML
 */
const shiftFramesXml = (xml, dx, dy) => {
    if (!xml || (!dx && !dy) || typeof DOMParser === 'undefined') return xml;
    let doc;
    try {
        doc = new DOMParser().parseFromString(`<xml>${xml}</xml>`, 'text/xml');
    } catch (e) {
        return xml;
    }
    const frames = doc.getElementsByTagName('frame');
    let out = '';
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const x = Number(frame.getAttribute('x'));
        const y = Number(frame.getAttribute('y'));
        if (!isNaN(x)) frame.setAttribute('x', Math.round(x + dx));
        if (!isNaN(y)) frame.setAttribute('y', Math.round(y + dy));
        out += new XMLSerializer().serializeToString(frame);
    }
    return out;
};

/**
 * Serialise a live frame for storage.
 *
 * An expanded frame needs no help: its members are found by geometry, so the frame's own rect is
 * the whole story. A collapsed one records the *ids* of its members and shrinks to its title bar --
 * and ids are regenerated when the item is dropped, so restoring that XML verbatim would produce a
 * collapsed box pointing at blocks that no longer exist. The members keep their workspace
 * coordinates while collapsed, so those are used to write the frame back out expanded around them.
 * @param {object} ScratchBlocks the loaded scratch-blocks namespace
 * @param {object} frame a `Blockly.Frame`
 * @param {Array} members its member blocks
 * @returns {string} the `<frame>` element as text
 */
const frameXmlForBackpack = (ScratchBlocks, frame, members) => {
    const element = frame.toXmlWithXY();
    const Frame = ScratchBlocks.Frame;
    if (!Frame || !frame.isCollapsed || !frame.isCollapsed()) {
        return ScratchBlocks.Xml.domToText(element);
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const member of members) {
        const pos = member.getRelativeToSurfaceXY();
        const size = member.getHeightWidth ? member.getHeightWidth() : {width: 0, height: 0};
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + (size.width || 0));
        maxY = Math.max(maxY, pos.y + (size.height || 0));
    }
    if (!isFinite(minX)) return ScratchBlocks.Xml.domToText(element);
    const pad = Frame.PADDING || 16;
    // The title bar sits above the members; its height is a property of the frame, not a guess.
    const top = Frame.TOP_BAR_HEIGHT || 32;
    element.setAttribute('x', Math.round(minX - pad));
    element.setAttribute('y', Math.round(minY - top - pad));
    element.setAttribute('w', Math.round(maxX - minX + (2 * pad)));
    element.setAttribute('h', Math.round(maxY - minY + top + (2 * pad)));
    element.setAttribute('collapsed', 'false');
    element.removeAttribute('blocks');
    return ScratchBlocks.Xml.domToText(element);
};

/**
 * Give the frames in a payload fresh ids.
 *
 * The XML was written from a frame that is still on the canvas, so its id is taken: dropping the
 * item back onto the same sprite would create a second frame claiming the same id. Frame ids are
 * opaque strings, so anything unique will do; Blockly's own generator is used when it is reachable.
 * @param {string} xml `<frame>` elements
 * @returns {string} the same XML with new ids
 */
const prepareFramesXml = xml => {
    if (!xml || typeof DOMParser === 'undefined') return xml;
    let doc;
    try {
        doc = new DOMParser().parseFromString(`<xml>${xml}</xml>`, 'text/xml');
    } catch (e) {
        return xml;
    }
    const genUid = (window.ScratchBlocks && window.ScratchBlocks.utils &&
        window.ScratchBlocks.utils.genUid) ?
        window.ScratchBlocks.utils.genUid :
        () => `hm${Math.random().toString(36).slice(2, 10)}`;
    const frames = doc.getElementsByTagName('frame');
    let out = '';
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        frame.setAttribute('id', genUid());
        out += new XMLSerializer().serializeToString(frame);
    }
    return out;
};

/**
 * Serialise a frame and the scripts inside it into a backpack payload.
 *
 * `blockObjects` keeps whatever `exportStandaloneBlocks` returns -- the plain array in the common
 * case, `{blocks, extensionURLs}` when the scripts use an extension -- because the backpack's drop
 * pipeline checks it for a `length` and hands it straight to `codePayload`, which stores it as the
 * item's body. The frame XML is a sibling field so it does not have to masquerade as a block.
 * @param {VirtualMachine} vm the scratch-vm instance
 * @param {object} frame a `Blockly.Frame`
 * @returns {?{blockObjects: (Array|object), topBlockId: string, frames: string}} null when the
 *     frame holds no blocks (the backpack item is built around a block, and there is nothing to
 *     make a thumbnail of)
 */
const collectFramePayload = (vm, frame) => {
    const ScratchBlocks = window.ScratchBlocks;
    const target = vm && vm.editingTarget;
    const vmBlocks = target && target.blocks && target.blocks._blocks;
    if (!ScratchBlocks || !vmBlocks || !frame || !frame.getMembers) return null;
    const members = frame.getMembers().filter(block => block && block.id);
    if (!members.length) return null;

    const ids = new Set();
    for (const member of members) {
        // Everything nested inside it plus the rest of its stack. getDescendants(true) follows
        // next connections, which is what a stack dragged out of a frame carries.
        for (const descendant of member.getDescendants(true)) ids.add(descendant.id);
    }

    const blockObjects = [];
    for (const id of ids) {
        const obj = vmBlocks[id];
        if (!obj) continue;
        // Deep copy: these belong to the VM and get their topLevel/position rewritten below.
        const copy = JSON.parse(JSON.stringify(obj));
        copy.topLevel = false;
        blockObjects.push(copy);
    }
    // Every member starts its own top-level stack at the position it has inside the frame, so
    // dropping the item reproduces the arrangement the frame had.
    for (const member of members) {
        const obj = blockObjects.find(o => o.id === member.id);
        if (!obj) continue;
        const pos = member.getRelativeToSurfaceXY();
        obj.topLevel = true;
        obj.x = pos.x;
        obj.y = pos.y;
    }

    return {
        blockObjects: vm.exportStandaloneBlocks(blockObjects),
        topBlockId: members[0].id,
        // Every script in the frame, so the thumbnail shows the whole box's contents.
        topBlockIds: members.map(member => member.id),
        frames: frameXmlForBackpack(ScratchBlocks, frame, members)
    };
};

/**
 * Put the current frame and its scripts into the backpack, through the same event bridge a
 * dragged stack uses (containers/backpack.jsx).
 * @param {VirtualMachine} vm the scratch-vm instance
 * @param {object} frame the frame to store
 * @returns {?object} the payload that was dispatched, or null when there was nothing to store
 */
const addFrameToBackpack = (vm, frame) => {
    const payload = collectFramePayload(vm, frame);
    if (!payload) return null;
    window.dispatchEvent(new CustomEvent(BACKPACK_EVENT, {detail: payload}));
    return payload;
};

/**
 * Which frame is opening its menu right now.
 *
 * `Blockly.ContextMenu.show` takes the menu's owner as its fourth argument, but the build in
 * node_modules does not pass it for frames -- the call is `show(e, options, this.workspace.RTL)`
 * with no owner. So the frame is recorded around its own `showContextMenu_` instead, which is a
 * fact about the code rather than about one build's argument list.
 */
let pendingFrame = null;

/**
 * Add the frame entry to scratch-blocks' own context menu.
 *
 * Wrapped rather than patched into the menu builder: the frame menu is assembled inside
 * `Blockly.Frame.prototype.showContextMenu_`, and the only shared exit is `Blockly.ContextMenu.show`.
 * @param {object} ScratchBlocks the loaded scratch-blocks namespace
 * @param {VirtualMachine} vm the scratch-vm instance
 */
const installFrameMenuOption = (ScratchBlocks, vm) => {
    const contextMenu = ScratchBlocks && ScratchBlocks.ContextMenu;
    if (!contextMenu || typeof contextMenu.show !== 'function' || contextMenu.hmFrameOption) return;

    const Frame = ScratchBlocks.Frame;
    if (Frame && Frame.prototype && !Frame.prototype.hmMenuHook) {
        const originalMenu = Frame.prototype.showContextMenu_;
        if (typeof originalMenu === 'function') {
            Frame.prototype.showContextMenu_ = function (e) {
                pendingFrame = this;
                try {
                    return originalMenu.call(this, e);
                } finally {
                    pendingFrame = null;
                }
            };
            Frame.prototype.hmMenuHook = true;
        }
    }

    const show = contextMenu.show;
    contextMenu.show = function (e, options, rtl, owner) {
        const frame = (owner && typeof owner.getMembers === 'function') ? owner : pendingFrame;
        // `getMembers` is the frame's own API; comments and block menus do not have it.
        if (Array.isArray(options) && frame && typeof frame.getMembers === 'function') {
            options.unshift({
                text: MENU_LABELS[currentLocale()] || MENU_LABELS.en,
                enabled: frame.getMembers().length > 0,
                callback: () => {
                    // Never let a throw here escape into the menu's own click handling: the menu
                    // closes and nothing else happens, which reads as "the feature does nothing".
                    try {
                        if (!addFrameToBackpack(vm, frame)) {
                            console.warn('[hm] frame → backpack: nothing to collect');
                        }
                    } catch (error) {
                        console.error('[hm] frame → backpack failed', error);
                    }
                }
            });
        }
        return show.apply(this, arguments);
    };
    contextMenu.hmFrameOption = true;
};

// ---- dragging a frame onto the backpack / a sprite -------------------------------------
// A frame drag never goes through Blockly's block dragger: `Frame#setDragging` lifts the member
// blocks onto its own surface (core/frame.js startDragSurface_), so the VM never emits
// BLOCK_DRAG_UPDATE and the GUI's own feedback -- the glow on the backpack panel, the highlight on
// the sprite and stage tiles -- never lights up. The pointer is followed here and the same state
// the GUI uses for a dragged stack is driven from it, so a frame drag looks like a block drag.

// Same event the GUI's block-drag pipeline would have produced. Listeners: containers/backpack.jsx.
const OUTSIDE_EVENT = 'hm-block-drag-outside';

let dragPointer = null;
let draggedFrame = null;
let pointerBound = false;
let lastOutside = null;

const store = () => {
    try {
        return (window.AddonHooks && window.AddonHooks.appStateStore) || null;
    } catch (e) {
        return null;
    }
};

const rectOf = element => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return rect;
};

const insideRect = (rect, point) => Boolean(rect && point &&
    point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.bottom);

/**
 * The editor's workspace box. `AddonHooks.blocklyWorkspace` is the workspace blocks.jsx owns;
 * `Blockly.getMainWorkspace()` would point at the "make a new block" dialog while it is open.
 * @returns {?ClientRect} the visible workspace rect
 */
const workspaceRect = () => {
    const ws = (window.AddonHooks && window.AddonHooks.blocklyWorkspace) ||
        (window.Blockly && window.Blockly.getMainWorkspace());
    const div = ws && typeof ws.getInjectionDiv === 'function' ? ws.getInjectionDiv() : null;
    return rectOf(div);
};

/**
 * Drive the GUI's drag feedback from the pointer.
 *
 * `outside` is exactly what the VM reports for a dragged stack, so it goes down both channels the
 * GUI already uses: `scratchGui.blockDrag` (what raises the sprite and stage tiles -- the blue
 * highlight, not the green "just received blocks" flash) and the custom event the backpack
 * container listens for, which lights up its panel.
 * @param {?{x: number, y: number}} point pointer position in viewport pixels
 */
const syncDragFeedback = point => {
    if (!point) return;
    const outside = !insideRect(workspaceRect(), point);
    if (outside === lastOutside) return;
    lastOutside = outside;
    const appStore = store();
    if (appStore) appStore.dispatch(updateBlockDrag(outside));
    window.dispatchEvent(new CustomEvent(OUTSIDE_EVENT, {detail: {outside}}));
};

/** Put the GUI back to "no drag in progress". */
const clearDragFeedback = () => {
    if (lastOutside) {
        const appStore = store();
        if (appStore) appStore.dispatch(updateBlockDrag(false));
        window.dispatchEvent(new CustomEvent(OUTSIDE_EVENT, {detail: {outside: false}}));
    }
    lastOutside = null;
};

const onDragPointerMove = e => {
    dragPointer = {x: e.clientX, y: e.clientY};
    if (draggedFrame) syncDragFeedback(dragPointer);
};

const bindPointerTracking = () => {
    if (pointerBound) return;
    pointerBound = true;
    document.addEventListener('pointermove', onDragPointerMove, {capture: true, passive: true});
    document.addEventListener('mousemove', onDragPointerMove, {capture: true, passive: true});
};

const unbindPointerTracking = () => {
    if (!pointerBound) return;
    pointerBound = false;
    document.removeEventListener('pointermove', onDragPointerMove, true);
    document.removeEventListener('mousemove', onDragPointerMove, true);
    dragPointer = null;
};

const isOverBackpack = point => insideRect(rectOf(document.querySelector(BACKPACK_SELECTOR)), point);

// `scratch-blocks` styles `.injectionDiv` with `overflow: hidden` ("so blocks in drag surface
// disappear at edges"), and Blockly lifts that while a block drag surface is showing --
// block_drag_surface.js does `injectionDiv.style.overflow = 'visible'` in setBlocksAndShow and puts
// it back in clearAndHide. The frame drag surface is built by core/frame.js startDragSurface_ and
// has no such handling, so a dragged frame was cut off at the workspace edge: it never appeared
// over the backpack or the sprite selector no matter what z-index it was given. Same treatment.
let dragClipDiv = null;

const openWorkspaceClip = frame => {
    const ws = frame && frame.workspace;
    const div = ws && typeof ws.getInjectionDiv === 'function' ? ws.getInjectionDiv() : null;
    if (!div) return;
    dragClipDiv = div;
    div.style.overflow = 'visible';
};

const closeWorkspaceClip = () => {
    if (!dragClipDiv) return;
    dragClipDiv.style.overflow = 'hidden';
    dragClipDiv = null;
};

/**
 * The sprite tile the pointer is over, if any. Sprite and stage tiles publish it while a drag is
 * running (containers/sprite-selector-item.jsx), which is the same signal a dragged stack uses to
 * move to another sprite -- frames get it for free because the pointer events are the same.
 * @returns {?string} target id, or null
 */
const hoveredSpriteId = () => {
    try {
        const store = window.AddonHooks && window.AddonHooks.appStateStore;
        const state = store && store.getState();
        const hovered = state && state.scratchGui && state.scratchGui.hoveredTarget;
        return (hovered && hovered.sprite) || null;
    } catch (e) {
        return null;
    }
};

// Set by initFrameBackpack: the backpack's insert helper, passed in rather than imported. That
// helper is the one place that knows how to add a payload to a target and put the frame on screen,
// and importing it here would close a cycle (it imports prepareFramesXml from this module).
let insertBlocks = null;

/**
 * Copy the frame and its scripts to whichever sprite the pointer is over, the way dragging a stack
 * onto a sprite tile does. The source keeps its copy.
 * @param {VirtualMachine} vm the scratch-vm instance
 * @param {object} frame the dragged frame
 */
const shareFrameToHoveredTarget = (vm, frame) => {
    if (!insertBlocks || !vm || !vm.editingTarget) return;
    const spriteId = hoveredSpriteId();
    if (!spriteId || spriteId === vm.editingTarget.id) return;
    const payload = collectFramePayload(vm, frame);
    if (!payload) return;
    insertBlocks(vm, withFrames(payload.blockObjects, payload.frames), spriteId);
};

const installFrameDragHook = (ScratchBlocks, vm) => {
    const Frame = ScratchBlocks && ScratchBlocks.Frame;
    if (!Frame || !Frame.prototype || Frame.prototype.hmBackpackDrag) return;
    const setDragging = Frame.prototype.setDragging;
    Frame.prototype.setDragging = function (adding) {
        const result = setDragging.apply(this, arguments);
        // A locked frame returns before anything is snapshotted, so `dragMembers_` being set is
        // what tells a real drag apart from that early return.
        if (adding) {
            if (Array.isArray(this.dragMembers_)) {
                draggedFrame = this;
                bindPointerTracking();
                // Let the frame paint outside the workspace, like a dragged stack does.
                openWorkspaceClip(this);
            }
        } else {
            // Idempotent, and it runs for every end (including a frame disposed mid-drag), so the
            // workspace can never be left unclipped.
            closeWorkspaceClip();
            if (draggedFrame === this) {
                const frame = draggedFrame;
                draggedFrame = null;
                // Read the pointer before dropping it: unbindPointerTracking clears it.
                const point = dragPointer;
                unbindPointerTracking();
                // The GUI's highlight has to come down before anything else looks at the state.
                clearDragFeedback();
                // A frame dropped on a delete area is disposed right after this (and `dispose`
                // calls setDragging(false) on its way out), so there is nothing left to copy.
                if (frame.workspace) {
                    // Whatever happens below must not break the drag's own cleanup: this runs
                    // inside setDragging(false), and a throw here would leave the frame's blocks on
                    // the drag surface. Failures are reported instead of swallowed, so "nothing
                    // happened" is distinguishable from "it threw".
                    try {
                        // Dropping onto the panel stores a copy; the frame itself stays on the
                        // canvas, the same way the context menu entry behaves. Anywhere else, a
                        // sprite tile under the pointer means "copy these scripts there".
                        if (isOverBackpack(point)) addFrameToBackpack(vm, frame);
                        else shareFrameToHoveredTarget(vm, frame);
                    } catch (error) {
                        console.error('[hm] frame drag → backpack/target failed', error);
                    }
                }
            }
        }
        return result;
    };
    Frame.prototype.hmBackpackDrag = true;
};

/**
 * @param {object} ScratchBlocks the loaded scratch-blocks namespace
 * @param {VirtualMachine} vm the scratch-vm instance
 * @param {Function} [insertInto] `insertBackpackBlocks(vm, payload, targetId)`, used when a frame
 *     is dragged onto a sprite tile
 */
const initFrameBackpack = (ScratchBlocks, vm, insertInto) => {
    if (!ScratchBlocks || !vm) return;
    if (typeof insertInto === 'function') insertBlocks = insertInto;
    installFrameMenuOption(ScratchBlocks, vm);
    installFrameDragHook(ScratchBlocks, vm);
    // Escape hatch, in the same spirit as AddonHooks.blocklyWorkspace: the frame menu is the only
    // entry point, so being able to drive this from the console is what makes a broken menu
    // debuggable at all.
    if (typeof window !== 'undefined' && window.AddonHooks) {
        window.AddonHooks.frameBackpack = {addFrameToBackpack, collectFramePayload};
    }
};

export {
    addFrameToBackpack,
    collectFramePayload,
    initFrameBackpack,
    prepareFramesXml,
    shiftFramesXml,
    withFrames
};
