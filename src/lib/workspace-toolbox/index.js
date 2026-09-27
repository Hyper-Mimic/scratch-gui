/**
 * "Workspace Toolbox".
 *
 * Driven by the HyperMimic "workspace toolbox" setting (src/lib/hypermimic-settings.js,
 * key `workspaceToolbox`, boolean) rather than an addon: the advanced settings modal is its
 * UI, so it has to work without anything being installed.
 *
 * When enabled, a small toolbox button is injected into the top-right corner of the block
 * workspace (the `.injectionDiv` created by scratch-blocks, which is `position: relative`).
 * Clicking it unfolds a column of tool buttons below it and clicking it again folds them away.
 *
 * In that default (manual) mode the toggle button is the *only* thing that changes the column's
 * state: running a tool, clicking elsewhere on the page, or a settings write all leave it exactly
 * as the user left it, and the state is remembered across reloads.
 *
 * The `workspaceToolboxAutoHide` setting hands that over to the pointer instead: with it on, the
 * column unfolds while the pointer is over the toolbox and folds away again when the pointer
 * leaves, and the toggle button itself never hides -- only the column does. The remembered state is
 * left untouched in that mode, so switching auto-hide back off restores what the user last clicked.
 *
 * The buttons borrow their look from the stage-size toggle group in the stage header
 * (components/stage-header/stage-header.css + components/toggle-buttons/toggle-buttons.css) —
 * white rounded squares with a hairline border — stacked vertically instead of horizontally,
 * so the open toolbox reads as one merged column with only its two outer ends rounded.
 *
 * Icons are images, not inline markup: `tools.svg` here and the ones the addons contribute are
 * all imported through url-loader, which inlines them as base64 data URIs (see the import
 * below), and the buttons render them as `<img>`.
 *
 * The buttons in the column are exactly the ones the addons contribute — this module contributes
 * none of its own (the toggle is not part of the menu).
 *
 * Their order is the one the user arranged in the advanced settings modal (./order.js, whose panel
 * is ./settings-panel.js), and not the order the addons happened to register in: every addon
 * registers from its own dynamic import, so registration order is really chunk-loading order and
 * can differ between sessions.
 *
 * Everything is vanilla DOM + a raw <style> (not CSS Modules) because the overlay lives inside
 * Blockly's DOM and targets its literal structure.
 */

import {defineMessages} from 'react-intl';
import {hmMessage} from '../hm-message.js';
import {
    getSetting,
    onSettingsChange,
    SETTING_WORKSPACE_TOOLBOX,
    SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE,
    SETTING_WORKSPACE_TOOLBOX_ORDER
} from '../hypermimic-settings.js';
import {
    getWorkspaceToolboxButtons,
    onWorkspaceToolboxButton
} from './registry.js';
import {
    getToolKey,
    sortByOrder
} from './order.js';

// `!url-loader?...!` rather than a bare `./tools.svg`: url-loader's own default is to inline
// everything as base64, whereas this project's configured rule (webpack.config.js) switches to
// an emitted file above 2 KB — and this icon is 9.9 KB, so it would stop being a data URI. The
// addons contribute their icons the same way. `esModule: false` matches the configured rule, so
// the default import is the data URI string itself.
import toolsIcon from '!url-loader?{"esModule":false}!./tools.svg';

const CONTAINER_ID = 'hm-workspace-toolbox';
const STYLE_ID = 'hm-workspace-toolbox-style';

// Whether the column is open. Persisted separately from the other HyperMimic-only settings
// because it is *state*, not a preference -- it is written by opening/closing, not by a settings
// toggle, so it must survive a reload the way a window box does (see window-modal's 'hm:windowBoxes').
//
// Absent means "never opened or closed by the user yet", which is what makes the toolbox open
// itself on first use: the tools are invisible behind a single unlabelled icon, so a user who has
// never seen the column has no reason to guess it is there. After the first explicit open/close
// the user's own choice is remembered and never overridden.
const EXPANDED_STORAGE_KEY = 'hm:workspaceToolboxExpanded';

const readStoredExpanded = () => {
    try {
        const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
        if (raw === null) return null;
        return raw === 'true';
    } catch (e) {
        // Storage unavailable: fall back to "no choice recorded", i.e. default open.
        return null;
    }
};

const writeStoredExpanded = value => {
    try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, String(value));
    } catch (e) {
        // Storage full or unavailable: the toolbox still works, it just will not be remembered.
    }
};

// The one piece of text this module owns. The tool buttons' labels come from the addons that
// contribute them, which translate their own.
//
// The translations are not kept here: the id lives in
// src/lib/tw-translations/generated-translations.json, the fork's own table, which is mixed into
// every locale of the app's message table by src/lib/tw-translations/index.js. A locale the table
// does not cover falls back to the `defaultMessage` below, exactly as react-intl would.
const MSG = defineMessages({
    toggle: {
        defaultMessage: 'Tools',
        description: 'Tooltip of the workspace toolbox button in the top-right corner of the block workspace',
        id: 'hm.workspaceToolbox.toggle'
    }
});

const getWorkspace = () =>
    (typeof window !== 'undefined' && window.Blockly) ? Blockly.getMainWorkspace() : null;

// The size the icons are rendered at. The button is 36px with 1px of border and 4px of padding,
// so the stage is 26px; the artwork is drawn smaller than that (22px) so the glyphs read at the
// same optical weight as the stage-header ones instead of filling the button edge to edge.
const ICON_SIZE = 22;

// Builds a single tool button. `getTool` returns the registry entry {label, icon, action} — a
// getter rather than the entry itself, because an addon may re-register its button later (the
// registry refreshes the entry in place when it does) and the button has to pick up the newer
// text and bindings rather than keep the ones it was built with. `icon` is an image URL (for the
// addons, a base64 data URI).
const buildToolButton = getTool => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hm-workspace-toolbox__tool';
    const refresh = () => {
        const tool = getTool();
        btn.title = tool.label;
        btn.setAttribute('aria-label', tool.label);
        // The icon is a constant of the contributing addon, so it is only re-rendered when it
        // actually differs from what is on screen.
        if (btn.dataset.hmIcon === tool.icon) return;
        btn.dataset.hmIcon = tool.icon;
        // `alt=""` because the button's own label is the accessible name; `draggable="false"`
        // because an `<img>` is draggable by default, and dragging one out of the toolbox would
        // hand the browser a stray image drag instead of Blockly's.
        btn.innerHTML =
            `<img src="${tool.icon}" width="${ICON_SIZE}" height="${ICON_SIZE}" ` +
            'alt="" draggable="false">';
    };
    refresh();
    // Running a tool does not fold the column. It deliberately cannot: the only thing that closes
    // it is the toggle button (or, under auto-hide, the pointer leaving), so a user who is working
    // through several tools in a row -- or who opened a tool window that now covers the workspace
    // -- finds the column exactly where they left it.
    btn.addEventListener('click', e => {
        e.stopPropagation();
        const ws = getWorkspace();
        if (ws) getTool().action(ws);
    });
    // Same reason as the toggle's: the tooltip is read on hover and the entry may have been
    // refreshed (an addon following a language switch) since the button was built.
    btn.addEventListener('mouseover', refresh);
    // Also reachable from outside, so a re-registration can re-render the button straight away
    // rather than leaving it showing the previous label until the pointer happens to pass over it
    // -- see `upsertToolButton`. Attached to the element in the same spirit as the toolbox root's
    // own `_dispose`.
    btn._refresh = refresh;
    return btn;
};

const buildDom = () => {
    const root = document.createElement('div');
    root.id = CONTAINER_ID;
    root.className = 'hm-workspace-toolbox';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'hm-workspace-toolbox__toggle';
    // Both the tooltip and the accessible name come from the same string, and are re-read on
    // every hover so they follow a language switch made from the language menu: that re-renders
    // React and swaps the message table, but this overlay is built once and sits outside React,
    // so a string captured at build time would stay in the old language.
    const refreshToggleLabel = () => {
        const label = hmMessage(MSG.toggle);
        toggle.title = label;
        toggle.setAttribute('aria-label', label);
    };
    refreshToggleLabel();
    toggle.addEventListener('mouseover', refreshToggleLabel);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
        `<img src="${toolsIcon}" width="${ICON_SIZE}" height="${ICON_SIZE}" alt="" draggable="false">`;

    const menu = document.createElement('div');
    menu.className = 'hm-workspace-toolbox__menu';

    root.appendChild(toggle);
    root.appendChild(menu);

    // Not `menu.hidden`: `display: none` cannot be transitioned, and the column has an
    // open/close animation. The closed menu is instead laid out but `visibility: hidden` (see
    // the stylesheet), which keeps it out of the tab order and the accessibility tree while
    // letting it fade, and lets the root stay `pointer-events: none` so the clicks that land
    // where the invisible buttons would be go through to the workspace.
    let expanded = false;

    // Whether the column follows the pointer instead of the last click. Kept in a local so the
    // pointer handlers, which are attached once, read the current answer rather than the one from
    // when they were attached; `setAutoHide` below is the only thing that writes it.
    let autoHide = getSetting(SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE) === true;

    // The column only reads as one merged group — hairline seams between the buttons, rounded
    // corners only on its two outer ends — when there is something to merge with. With no tool
    // buttons contributed the toggle is a lone button and keeps all four corners round.
    const refreshGrouping = () => {
        root.classList.toggle(
            'hm-workspace-toolbox--grouped',
            expanded && menu.childElementCount > 0
        );
    };

    const setExpanded = (next, {remember = true} = {}) => {
        expanded = next;
        if (expanded) {
            // Stagger the cascade in on-screen order. Worked out here rather than at build time
            // because buttons can be contributed while the toolbox is mounted.
            Array.prototype.forEach.call(menu.children, (button, index) => {
                button.style.setProperty('--hm-tool-index', String(index));
            });
        }
        toggle.setAttribute('aria-expanded', String(expanded));
        root.classList.toggle('hm-workspace-toolbox--open', expanded);
        refreshGrouping();
        // Only a deliberate open/close is remembered. The initial state below must not write,
        // or "default open on first use" would immediately consume its own one-shot: the very
        // first mount would store `true` and a later first *close* would look like a user choice
        // that was always there.
        if (remember) writeStoredExpanded(expanded);
    };

    // Render every button contributed by addons (via `addon.tab.addWorkspaceToolboxButton`), in
    // the order the user arranged them in (./order.js) -- which falls back to registration order
    // while no arrangement has been made.
    //
    // `toolButtons` is keyed the same way the registry dedupes, so a refreshed entry (an addon that
    // re-registers, which is how a translated label changes language) updates the button that is
    // already on screen instead of adding a second one for it.
    const toolButtons = new Map();
    // Entries with neither an id nor a label have no identity to key on, so there is nothing to
    // arrange them by. They are rendered as-is and parked after the arranged ones.
    const anonymousButtons = [];

    /**
     * Puts the menu's buttons in the arranged order.
     *
     * Runs after every insert as well as when the arrangement changes, because a button can turn
     * up long after the toolbox is on screen -- the addons register from their own dynamic
     * imports -- and it has to land in its stored slot rather than at the end of the column.
     */
    const syncOrder = () => {
        const ordered = sortByOrder(Array.from(toolButtons.values()), entry => entry.key)
            .concat(anonymousButtons);
        ordered.forEach((entry, index) => {
            // Only moved when it is genuinely out of place: this runs on every arrival, and a node
            // that is already in position needs no touch at all.
            if (menu.children[index] !== entry.el) {
                menu.insertBefore(entry.el, menu.children[index] || null);
            }
        });
    };

    const upsertToolButton = tool => {
        const key = getToolKey(tool);
        // A malformed button (neither an id nor a label) has no identity to key on, so it is
        // rendered as-is rather than being merged with an unrelated one.
        if (key == null) {
            const entry = {key: null, tool};
            anonymousButtons.push(entry);
            entry.el = buildToolButton(() => entry.tool);
            menu.appendChild(entry.el);
            refreshGrouping();
            return;
        }
        const existing = toolButtons.get(key);
        if (existing) {
            // A re-registration means something about the button changed -- in practice its label,
            // because every addon re-registers its buttons when the language changes. The entry is
            // refreshed in place, and so is the button on screen: the order panel in the settings
            // modal reads the entry and would otherwise show the new name next to an old one.
            existing.tool = tool;
            existing.el._refresh();
            return;
        }
        const entry = {key, tool};
        toolButtons.set(key, entry);
        // Assigned after the entry exists, because the button's own accessor reads back through
        // it: `buildToolButton` refreshes immediately, and a getter closing over a binding that
        // has not been initialised yet would throw.
        entry.el = buildToolButton(() => entry.tool);
        menu.appendChild(entry.el);
        syncOrder();
        // A first button arriving while the menu is open turns the lone toggle into a group.
        refreshGrouping();
    };

    for (const tool of getWorkspaceToolboxButtons()) upsertToolButton(tool);

    // Initial state, applied after the buttons are in place so the cascade indices are assigned
    // by setExpanded. A user who has opened or closed the column before gets exactly what they
    // left; on first use (no stored value) the column opens itself so the tools are discoverable.
    // Under auto-hide it starts folded instead -- the remembered click state is not what drives it
    // there, so it must not decide the starting position either.
    setExpanded(autoHide ? false : (readStoredExpanded() ?? true), {remember: false});

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        // With auto-hide on the column follows the pointer, so there is nothing for a click to
        // decide -- and on a touch screen it would undo the expansion the very same tap just caused
        // (`pointerenter` fires before the click).
        if (autoHide) return;
        setExpanded(!expanded);
    });

    // Auto-hide: the column appears while the pointer is anywhere over the toolbox (the button or
    // the column, since the root spans both) and goes away when it leaves. These are enter/leave
    // rather than over/out because they are the pair that reports "the pointer is over this element
    // or any of its descendants"; they still reach the root although the root itself is
    // `pointer-events: none` and only the buttons are hit-testable, because the dispatch follows
    // the ancestor chain of whatever was actually hit.
    const onPointerEnter = () => {
        if (autoHide) setExpanded(true, {remember: false});
    };
    const onPointerLeave = e => {
        // A touch pointer leaves as soon as the finger is lifted, which would fold the column away
        // the instant a tap had opened it. On a touch screen the column is therefore opened by the
        // tap and closed by tapping elsewhere, which is what the document listener below is for.
        if (autoHide && e.pointerType !== 'touch') setExpanded(false, {remember: false});
    };
    root.addEventListener('pointerenter', onPointerEnter);
    root.addEventListener('pointerleave', onPointerLeave);

    // Clicking away from the column folds it -- under auto-hide, and only under auto-hide. In
    // manual mode the toggle button is the one thing allowed to change the state, so a click
    // anywhere else has to leave it alone; that is the whole point of the mode. Under auto-hide the
    // pointer leaving is normally what folds it, but a touch pointer does not count as leaving (see
    // above), so on a touch screen the tap elsewhere is the only way back to the folded state.
    //
    // Not remembered either: under auto-hide the remembered state is not what is on screen, and
    // writing to it would destroy the manual arrangement that switching auto-hide off restores.
    const onDocClick = e => {
        if (autoHide && !root.contains(e.target)) setExpanded(false, {remember: false});
    };
    document.addEventListener('mousedown', onDocClick, true);

    // Keep it from being treated as a drag surface by Blockly.
    ['mousedown', 'touchstart', 'pointerdown', 'dragstart'].forEach(type => {
        root.addEventListener(type, e => e.stopPropagation());
    });

    // Buttons contributed by addons after this toolbox is already on screen — which includes a
    // re-registration, i.e. an entry that is already rendered being refreshed in place.
    const unsubscribeButton = onWorkspaceToolboxButton(upsertToolButton);

    // Both of these can change while the toolbox is on screen: the settings modal sits over the
    // workspace and its panel (./settings-panel.js) writes on every move and on every toggle, so
    // the column follows along live rather than only on the next mount.
    const unsubscribeOrder = onSettingsChange((key, value) => {
        if (key === SETTING_WORKSPACE_TOOLBOX_ORDER) {
            syncOrder();
        } else if (key === SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE) {
            autoHide = value === true;
            // Switching it on folds the column: that is what "auto-hide" just said the resting state
            // is. Switching it off hands the column back to the remembered click state, which
            // auto-hide never wrote to -- so a user who had it open still does.
            setExpanded(autoHide ? false : (readStoredExpanded() ?? true), {remember: false});
        }
    });

    root._dispose = () => {
        document.removeEventListener('mousedown', onDocClick, true);
        root.removeEventListener('pointerenter', onPointerEnter);
        root.removeEventListener('pointerleave', onPointerLeave);
        unsubscribeButton();
        unsubscribeOrder();
    };

    return root;
};

const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.hm-workspace-toolbox {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 60;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    /* The buttons are the only hit targets: the closed column is laid out (so it can animate)
       but invisible, and this box must not swallow clicks meant for the workspace beneath. */
    pointer-events: none;
    /* Nothing here is allowed to be translucent. The column floats over the workspace, so a
       translucent fill shows blocks and grid through the buttons, which reads as a dirty button
       rather than a dimmed one -- while the stage-header group gets away with the theme's
       looks-*-transparent only because it sits on an opaque --ui-white parent.
       The hover/pressed fills are therefore the accent pre-mixed against the button's own
       surface, which is opaque in both themes: --ui-white is white in light and near-black
       (#111) in dark, so one expression covers both. The stage-header's own equivalent is
       extensions-light -- "opaque version of extensions-transparent, on white bg". */
    --hm-toolbox-hover: color-mix(in srgb, var(--looks-secondary, hsla(260, 60%, 60%, 1)) 15%, var(--ui-white, #fff));
    --hm-toolbox-pressed: color-mix(in srgb, var(--looks-secondary, hsla(260, 60%, 60%, 1)) 35%, var(--ui-white, #fff));
}
/* Borrowed from the stage-size toggle group (components/stage-header + components/toggle-
   buttons), stacked vertically: white rounded squares with a hairline border. The colours come
   from the GUI theme's variables, so the column follows light/dark and the accent colour. */
.hm-workspace-toolbox__toggle,
.hm-workspace-toolbox__tool {
    box-sizing: border-box;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    /* The theme's translucent hairline token, the one the stage-header group uses. It never shows
       the workspace through: the button's own opaque fill is painted underneath it (background-clip
       defaults to border-box), so the hairline composes against the button, not against Blockly. */
    border: 1px solid var(--ui-black-transparent, hsla(0, 0%, 0%, 0.15));
    border-radius: 0.25rem;
    background-color: var(--ui-white, #fff);
    cursor: pointer;
    user-select: none;
    -webkit-user-drag: none;
    outline: none;
    pointer-events: auto;
    transition:
        background-color 120ms ease,
        border-radius 160ms ease,
        border-bottom-width 160ms ease;
}
.hm-workspace-toolbox__toggle:hover,
.hm-workspace-toolbox__tool:hover {
    /* The var() fallback below is not decoration: if a browser cannot compute the mix, the custom
       property goes invalid and the fallback is what keeps the button opaque (a plain theme
       surface) instead of leaving it unlit or, worse, translucent. */
    background-color: var(--hm-toolbox-hover, var(--ui-secondary, #e9f1fc));
}
.hm-workspace-toolbox__toggle[aria-expanded="true"],
.hm-workspace-toolbox__toggle:active,
.hm-workspace-toolbox__tool:active {
    background-color: var(--hm-toolbox-pressed, var(--ui-primary, #e5f0ff));
}
.hm-workspace-toolbox__toggle:focus-visible,
.hm-workspace-toolbox__tool:focus-visible {
    outline: 2px solid var(--looks-secondary, #855cd6);
    outline-offset: -2px;
}
/* The icons are near-black artwork (#231F20, or a black stroke), which is what we want on the
   white buttons of the light theme and exactly what would disappear on the near-black buttons of
   the dark theme. --filter-icon-black is the theme's answer to that: none in light, invert(100%)
   in dark. */
.hm-workspace-toolbox__toggle img,
.hm-workspace-toolbox__tool img {
    display: block;
    pointer-events: none;
    filter: var(--filter-icon-black, none);
}
/* The column of tools. Closed it stays laid out but hidden — visibility rather than
   display: none, so the open/close animation has something to run on and the buttons are out
   of the tab order anyway (which is why the module no longer sets a hidden attribute). */
.hm-workspace-toolbox__menu {
    display: flex;
    flex-direction: column;
    visibility: hidden;
    /* Held back until the buttons have finished fading out. */
    transition: visibility 0s linear 200ms;
}
.hm-workspace-toolbox--open .hm-workspace-toolbox__menu {
    visibility: visible;
    transition: visibility 0s linear 0s;
}

/* Appearing and hiding: each tool fades in and lifts into place from just under the toggle, top of
   the column first. This is the one translucent moment in the sheet, and it is deliberate: a button
   on its way in or out may fade, whereas the resting, hovered and pressed fills above are all
   opaque, so nothing ever shows the workspace through a button that is simply sitting there. */
.hm-workspace-toolbox__tool {
    opacity: 0;
    transform: translateY(-6px) scale(0.9);
    transition:
        background-color 120ms ease,
        border-radius 160ms ease,
        border-bottom-width 160ms ease,
        opacity 140ms ease var(--hm-delay, 0ms),
        transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1) var(--hm-delay, 0ms);
}
.hm-workspace-toolbox--open .hm-workspace-toolbox__tool {
    opacity: 1;
    transform: none;
    /* Per-button position, set by the module when the menu opens; collapsing drops it back to
       zero, so the whole column leaves together instead of cascading out. */
    --hm-delay: calc(var(--hm-tool-index, 0) * 28ms);
}

/* Merged column: neighbours share one hairline instead of butting two together, and only the
   two outer ends stay rounded. Both are in the transition list above, so opening and closing
   morphs the toggle's corners instead of snapping them. */
.hm-workspace-toolbox--grouped .hm-workspace-toolbox__toggle {
    border-bottom-width: 0;
    border-radius: 0.25rem 0.25rem 0 0;
}
.hm-workspace-toolbox--grouped .hm-workspace-toolbox__tool {
    border-radius: 0;
}
.hm-workspace-toolbox--grouped .hm-workspace-toolbox__tool:not(:last-child) {
    border-bottom-width: 0;
}
.hm-workspace-toolbox--grouped .hm-workspace-toolbox__tool:last-child {
    border-radius: 0 0 0.25rem 0.25rem;
}

@media (prefers-reduced-motion: reduce) {
    .hm-workspace-toolbox__toggle,
    .hm-workspace-toolbox__tool,
    .hm-workspace-toolbox__menu {
        transition: none;
    }
}
`;
    document.head.appendChild(style);
};

let mounted = null;

const mount = () => {
    // `.injectionDiv` is created by the workspace injection and belongs to the container Blockly
    // was handed, so it is thrown away whenever the Blocks component remounts — a time-travel jump
    // or a block theme change (gui.jsx keys it by `${blocksId}/${theme.id}`). Our root goes with
    // it; dispose the stale instance and drop the reference so we can mount again instead of
    // silently doing nothing.
    if (mounted && !mounted.isConnected) {
        if (mounted._dispose) mounted._dispose();
        mounted = null;
    }
    if (mounted) return;
    const host = document.querySelector('.injectionDiv');
    if (!host) return;
    injectStyle();
    const el = buildDom();
    host.appendChild(el);
    mounted = el;
};

const unmount = () => {
    if (mounted) {
        if (mounted._dispose) mounted._dispose();
        mounted.remove();
        mounted = null;
    }
};

const apply = enabled => {
    if (typeof document === 'undefined') return;
    if (enabled) {
        mount();
    } else {
        unmount();
    }
};

let observer = null;

/**
 * Applies the saved value and keeps it in sync from then on.
 * Safe to call once, when the editor interface comes up. The `.injectionDiv` may not exist at
 * init time (Blockly injects it asynchronously), so we watch the document for it.
 */
const initWorkspaceToolbox = () => {
    if (typeof document === 'undefined') return;

    const tryMount = () => {
        if (getSetting(SETTING_WORKSPACE_TOOLBOX)) mount();
    };

    tryMount();

    // The injection div is created after the editor mounts; watch for it while the feature is
    // on so the toolbox shows up as soon as the workspace exists.
    observer = new MutationObserver(tryMount);
    observer.observe(document.body, {childList: true, subtree: true});

    onSettingsChange((key, value) => {
        if (key === SETTING_WORKSPACE_TOOLBOX) {
            apply(value);
        }
    });
};

export {
    initWorkspaceToolbox
};
