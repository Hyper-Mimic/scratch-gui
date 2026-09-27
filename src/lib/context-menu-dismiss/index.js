/**
 * "One right-click menu at a time."
 *
 * The editor has two context menus that know nothing about each other:
 *
 *   - the block menu, scratch-blocks' own `Blockly.ContextMenu` (shown through `Blockly.WidgetDiv`),
 *     used by the workspace and by the Markdown preview's "delete this code block" item;
 *   - the GUI menu, `react-contextmenu`'s `ContextMenu` (src/components/context-menu/context-menu.jsx),
 *     used by sprites, costumes, sounds, monitors, etc.
 *
 * Each one only closes when *its own* half of the page is clicked:
 *
 *   - react-contextmenu registers document-level `mousedown`/`touchstart` handlers while a menu is
 *     visible (`handleOutsideClick` in its dist bundle) and hides the menu when the press lands
 *     outside it. That is exactly the behaviour we want, except the press never arrives: the first
 *     thing `Blockly.Gesture.bindMouseEvents` does once a gesture starts in the workspace is
 *     `e.stopPropagation()` (scratch-blocks/core/gesture.js:534), so a press on a block or on the
 *     workspace background stops at the workspace and the document listeners never fire.
 *   - the block menu is closed by `Blockly.hideChaff()`, which runs from the gesture a press starts
 *     in the workspace (gesture.js:501). A press anywhere in the GUI starts no workspace gesture,
 *     so nothing closes it there.
 *
 * Both directions are the same problem — "a press that begins outside a menu should dismiss it" —
 * and both are solved the same way: listen for the press ourselves, on `document`, in the *capture*
 * phase. Capture runs from the root down before any handler can stop propagation, so this fires no
 * matter whose subtree the press started in, and it does not depend on the two menus' internals
 * beyond the two public calls below.
 *
 * The listener does not swallow the event: capture listeners cannot be "undone" by the target's
 * `stopPropagation()`, but they also do not stop the press from being handled normally afterwards,
 * so the workspace gesture, react-contextmenu's own handler and everything else still run.
 *
 * A press *inside* either menu must not dismiss it, or the menu could never be used. Both menus
 * render into `document.body` (WidgetDiv for Blockly, a `nav.react-contextmenu` for the GUI), so
 * the check is "did the press land inside a menu?" rather than "did it land inside the blocks area?".
 */

import LazyScratchBlocks from '../tw-lazy-scratch-blocks';
import {hideMenu} from 'react-contextmenu';

// Blockly's WidgetDiv, which the context menu is rendered into (see scratch-blocks/core/widgetdiv.js).
const BLOCKLY_MENU_SELECTOR = '.blocklyWidgetDiv';

// The class react-contextmenu puts on the `<nav role="menu">` it renders for each menu.
const GUI_MENU_SELECTOR = '.react-contextmenu';

/**
 * Whether the press landed inside a menu that is currently open, in which case it is the menu's own
 * click and must be left alone.
 * @param {!Event} e the press
 * @return {boolean} whether the press is inside one of the menus
 */
const isInsideMenu = e => {
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return false;
    return !!(target.closest(BLOCKLY_MENU_SELECTOR) || target.closest(GUI_MENU_SELECTOR));
};

/** Closes the block menu, if scratch-blocks has been loaded and one is open. */
const hideBlockMenu = () => {
    if (!LazyScratchBlocks.isLoaded()) return;
    const ScratchBlocks = LazyScratchBlocks.get();
    const ContextMenu = ScratchBlocks && ScratchBlocks.ContextMenu;
    if (ContextMenu && typeof ContextMenu.hide === 'function') ContextMenu.hide();
};

/**
 * Closes whichever menu is open. Safe to call when none is: both calls are no-ops then.
 * @param {!Event} e the press that may dismiss a menu
 */
const dismissMenus = e => {
    // A press that starts a workspace gesture is stopped before reaching document (see the note
    // above), so this listener has to be on the capture phase -- and by the time it runs the
    // gesture has not started yet, which is why `isInsideMenu` is evaluated here rather than from
    // any post-event state.
    if (isInsideMenu(e)) return;
    hideBlockMenu();
    hideMenu();
};

const PRESS_EVENTS = ['mousedown', 'touchstart'];

let installed = false;

/**
 * Starts dismissing one context menu when the other half of the page is clicked. Safe to call more
 * than once; only the first call installs anything.
 */
const initContextMenuDismiss = () => {
    if (typeof document === 'undefined') return;
    if (installed) return;
    installed = true;
    // `capture: true` is the whole point -- see `dismissMenus`.
    for (const type of PRESS_EVENTS) {
        document.addEventListener(type, dismissMenus, true);
    }
};

export {
    initContextMenuDismiss
};
