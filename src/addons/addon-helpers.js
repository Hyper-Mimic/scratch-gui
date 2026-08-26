// HyperMimic addon helpers — a small reusable "wheel" for the two operations
// almost every addon needs: reading redux state and injecting a menu-bar entry.
// Everything here is plain vanilla DOM (no JSX / React), mirroring the
// patterns already used across the bundled addons (most notably `background`).
//
// Usage from an addon's userscript.js:
//   import { getReduxState, injectMenuItem } from '../../addon-helpers.js';
//
// NOTE on redux: `addon.tab.redux` is NOT a real Redux store. It is the thin
// wrapper in src/addons/redux.js (class AddonRedux). It exposes:
//   - `.state`            (getter -> AddonHooks.appStateStore.getState())
//   - `.initialize()`     (no-op, always safe to call)
//   - `.dispatch(action)`
//   - `.addEventListener('statechanged', cb)` / `.removeEventListener(...)`
// It does NOT have `.getState()`. Use getReduxState() below instead.

export const SETTINGS_MENU_ID = 'settings';
export const FILE_MENU_ID = 'file';

// Get the current redux state for an addon.
// Returns addon.tab.redux.state (never throws on the wrapper itself).
export function getReduxState (addon) {
    const redux = addon.tab.redux;
    if (redux && typeof redux.initialize === 'function') {
        redux.initialize();
    }
    return redux.state;
}

// Closes the menu that owns the entry we injected. Returns the redux action
// `menu` name used by reducers/menus.js (e.g. 'file' -> 'fileMenu').
function resolveCloseMenuName (menuId) {
    if (menuId === SETTINGS_MENU_ID) return 'settingsMenu';
    return `${menuId}Menu`;
}

// Build (and insert) a styled <li> into a drop-down menu, following the exact
// approach the `background` addon uses:
//   - copy the last item's className so hover/look matches native menu items,
//   - for the Settings menu, if the last item is the TurboWarp desktop-settings
//     entry (id === 'twdesktopsettings'), insert BEFORE it,
//   - on click: close the owning menu, then run `onClick` after a short delay
//     (so the menu is gone before the modal opens).
//
// options:
//   addon        the addon instance (used for redux dispatch)
//   menuId       id of the <ul> to inject into ('settings' | 'file' | ...)
//   itemClass    unique class used as the "already injected" marker
//   labelClass   class for the text span (used to refresh text on reenabled)
//   label        text content of the menu item
//   iconSrc      optional data: URI / URL for a 24px leading icon (default none)
//   onClick      ({ addon }) => void   called ~150ms after the click
// Returns the <li> element, or null if the target menu is not in the DOM yet.
export function buildMenuItem (options) {
    const {
        addon, menuId = SETTINGS_MENU_ID, itemClass, labelClass, label, iconSrc, onClick
    } = options;

    const menuEl = document.getElementById(menuId);
    if (!menuEl) return null;

    const existingItems = menuEl.querySelectorAll('li');
    let lastItem = null;
    let insertBeforeItem = null;

    if (existingItems.length > 0) {
        lastItem = existingItems[existingItems.length - 1];
        // Keep the TurboWarp desktop-settings entry last in the Settings menu.
        if (menuId === SETTINGS_MENU_ID && lastItem.id === 'twdesktopsettings') {
            insertBeforeItem = lastItem;
            if (existingItems.length > 1) {
                lastItem = existingItems[existingItems.length - 2];
            }
        }
    }

    const menuItem = document.createElement('li');
    menuItem.className = (lastItem ? `${lastItem.className} ` : '') + itemClass;

    // When there are no reference items yet, give it minimal sane styling.
    if (!lastItem) {
        menuItem.style.cssText = [
            'display: flex',
            'align-items: center',
            'padding: 4px 16px',
            'cursor: pointer',
            'font-size: 0.85rem',
            'color: #575e75',
            'min-height: 36px',
            'transition: background 0.1s ease'
        ].join(';');
    }

    const innerDiv = document.createElement('div');
    innerDiv.className = `${labelClass}-wrapper`;
    innerDiv.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; width: 100%;';

    if (iconSrc) {
        const iconImg = document.createElement('img');
        iconImg.src = iconSrc;
        iconImg.draggable = false;
        iconImg.width = 24;
        iconImg.style.cssText = 'width: 24px;';
        innerDiv.appendChild(iconImg);
    }

    const textSpan = document.createElement('span');
    textSpan.className = labelClass;
    textSpan.textContent = label;
    innerDiv.appendChild(textSpan);
    menuItem.appendChild(innerDiv);

    menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
            if (addon && addon.tab && addon.tab.redux) {
                const closeName = resolveCloseMenuName(menuId);
                addon.tab.redux.dispatch({
                    type: 'scratch-gui/menus/CLOSE_MENU',
                    menu: closeName
                });
                if (menuId === SETTINGS_MENU_ID) {
                    // The Settings menu has an extra dedicated close action.
                    addon.tab.redux.dispatch({
                        type: 'scratch-gui/menus/CLOSE_SETTINGS_MENU'
                    });
                }
            }
        } catch (err) {
            console.error('[addon-helpers] redux dispatch error', err);
        }
        setTimeout(() => {
            if (onClick) onClick({ addon });
        }, 150);
    });

    if (insertBeforeItem) {
        menuEl.insertBefore(menuItem, insertBeforeItem);
    } else {
        menuEl.appendChild(menuItem);
    }
    return menuItem;
}

// Continuously ensure a menu-bar entry exists in the given drop-down menu.
//
// Drop-down menus (<ul id="...">) are recreated every time the menu opens and
// removed when it closes, so a one-shot injection disappears on the next open.
// This re-injects whenever the item is missing — the same as the `background`
// addon's `while (true)` loop (here implemented as a polling interval that
// self-skips once the item is present).
//
// options:
//   addon, msg
//   menuId       id of the <ul> to inject into ('settings' | 'file' | ...)
//   itemClass     unique marker class (also passed to buildMenuItem)
//   labelClass    text-span class (also used to refresh text on reenabled)
//   labelKey      msg() key for the label (e.g. 'menuLabel')
//   labelDefault  fallback text if msg(labelKey) is empty
//   iconSrc       optional icon (see buildMenuItem)
//   onClick       ({ addon }) => void
//   intervalMs    poll interval (default 500)
// Returns a cleanup function: () => void  (clears interval + reenabled listener).
export function injectMenuItem (options) {
    const {
        addon, msg, menuId = SETTINGS_MENU_ID, itemClass, labelClass,
        labelKey, labelDefault, iconSrc, onClick, intervalMs = 10
    } = options;

    const resolveLabel = () => (labelKey ? (msg(labelKey) || labelDefault) : labelDefault);

    const addMenuItem = () => {
        const menu = document.getElementById(menuId);
        if (!menu) return;
        // Already present in the currently-rendered menu? Skip.
        if (menu.querySelector(`.${itemClass}`)) return;
        buildMenuItem({
            addon,
            menuId,
            itemClass,
            labelClass,
            label: resolveLabel(),
            iconSrc,
            onClick
        });
    };

    const interval = setInterval(() => {
        try {
            addMenuItem();
        } catch (e) {
            // Keep polling; the menu may not be mounted yet.
        }
    }, intervalMs);

    const onReenabled = () => {
        const el = document.querySelector(`.${labelClass}`);
        if (el) el.textContent = resolveLabel();
    };
    addon.self.addEventListener('reenabled', onReenabled);

    return () => {
        clearInterval(interval);
        addon.self.removeEventListener('reenabled', onReenabled);
    };
}
