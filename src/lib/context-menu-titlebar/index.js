/**
 * Keeps the merged desktop title bar clickable while a context menu is open.
 *
 * With menu bar / title bar fusion on (the desktop renderer adds `hm-titlebar-merged` to <html>,
 * see src/components/menu-bar/menu-bar.css) the whole menu bar is an Electron drag region. The
 * draggable region is hit-tested by Electron without regard to stacking order, so every click that
 * lands on anything drawn OVER the bar -- for a context menu that reaches up past the workspace
 * edge, its top items -- is swallowed as a window-drag gesture and can never be pressed.
 *
 * While a context menu is open this therefore drops the drag region entirely: it toggles
 * `hm-context-menu-open` on the menu bar element itself (NOT on <html> -- a root class flip
 * invalidates every element's style, a 1+ second hit in large projects on each menu open
 * and close; on the menu bar it only invalidates that small subtree). The rules that consume
 * it (and why the nested .main-menu / .file-group / .divider drag regions need overriding
 * too) live in menu-bar.css. On the web the class is toggled just the same but no rule
 * matches it.
 *
 * The menus are the same two systems context-menu-dismiss already knows about:
 *
 *   - the block menu, scratch-blocks' own Blockly.ContextMenu, rendered into `.blocklyWidgetDiv`
 *     (scratch-blocks/core/widgetdiv.js);
 *   - the GUI menu, react-contextmenu's ContextMenu (src/components/context-menu/context-menu.jsx),
 *     which marks its visible menu with `.react-contextmenu--visible`.
 *
 * Only the GUI menu announces itself (window events `REACT_CONTEXTMENU_SHOW`/`_HIDE`); the block
 * menu exposes nothing, so the open state is re-read from the DOM whenever something that can
 * change it happens: a right-click (both menus open inside their contextmenu handler, which runs
 * after this capture listener), any press, scroll or resize (the routes through which each menu
 * closes), and react-contextmenu's own global events. The read is deferred to a timeout so it
 * observes the DOM *after* whatever the event started has settled.
 */

const CLASS_NAME = 'hm-context-menu-open';

// The class is toggled on the MENU BAR element, not on <html>: a class flip on the root
// invalidates the entire document's styles, which in a large project means a 1+ second
// recalc on every menu open AND close (measured: 91k elements, ~1.2s each). On the menu
// bar itself the same flip only invalidates that small subtree. The CSS side lives in
// menu-bar.css and keys on html.hm-titlebar-merged, so the flip is inert on the web.
const findMenuBar = () => document.querySelector('[class*="menu-bar_menu-bar_"]');

// The block menu: WidgetDiv is created at inject time and lives forever (display:none when
// hidden), so "a menu is open" is "it is displayed AND has content". Field editors share the
// WidgetDiv but not the menu class, so they are deliberately excluded -- this only guards menus.
const blocklyMenuOpen = () => {
    const widgetDiv = document.querySelector('.blocklyWidgetDiv');
    return !!widgetDiv &&
        widgetDiv.style.display !== 'none' &&
        !!widgetDiv.querySelector('.blocklyContextMenu');
};

const guiMenuOpen = () => !!document.querySelector('.react-contextmenu--visible');

const update = () => {
    pending = false;
    const menuBar = findMenuBar();
    if (menuBar) menuBar.classList.toggle(CLASS_NAME, blocklyMenuOpen() || guiMenuOpen());
};

let pending = false;

const scheduleUpdate = () => {
    if (pending) return;
    pending = true;
    setTimeout(update, 0);
};

// Both menus open from a right-click, both close on the next press somewhere else (for the
// workspace half via context-menu-dismiss's capture listeners, for the GUI half via
// react-contextmenu's own document listeners), and both close on scroll/resize through
// Blockly.hideChaff. Capture phase, so nothing can stop the events before this runs; `scroll`
// does not bubble but capture listeners still see it.
const DOCUMENT_EVENTS = ['contextmenu', 'mousedown', 'touchstart', 'wheel', 'scroll'];

// react-contextmenu dispatches these on window for every menu it shows or hides, including the
// long-press path that has no contextmenu event.
const WINDOW_EVENTS = ['resize', 'REACT_CONTEXTMENU_SHOW', 'REACT_CONTEXTMENU_HIDE'];

let installed = false;

/**
 * Starts dropping the title bar's drag region while a context menu is open. Safe to call more than
 * once; only the first call installs anything.
 */
const initContextMenuTitlebar = () => {
    if (typeof document === 'undefined') return;
    if (installed) return;
    installed = true;
    for (const type of DOCUMENT_EVENTS) {
        document.addEventListener(type, scheduleUpdate, true);
    }
    for (const type of WINDOW_EVENTS) {
        window.addEventListener(type, scheduleUpdate);
    }
};

export {
    initContextMenuTitlebar
};
