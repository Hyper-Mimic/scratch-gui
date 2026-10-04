/**
 * HyperMimic core-feature bootstrap.
 *
 * Every HyperMimic-only editor feature (the ones behind the advanced settings modal, *not*
 * addons) is a side-effectful `init*()` in `src/lib/*`. They used to be called only from the
 * website entry point `src/playground/render-interface.jsx`, which is fine for the web build
 * but not for consumers that use the **library entry** (`src/index.js` -> containers/gui.jsx):
 * scratch-desktop's editor does exactly that, so the settings modal was rendered (it lives in
 * the library) while nothing ever applied the settings.
 *
 * Keeping the list here means there is one place to register a feature, and every entry point
 * that mounts the GUI -- the website, scratch-desktop, any embedder -- can call
 * `initHyperMimic()` once before rendering. It is idempotent-ish by construction: each init
 * guards its own `apply()` by style-element id / body class, so calling it twice is harmless.
 *
 * Not included on purpose:
 * - `runAddons()` -- entry points own their addon list (scratch-desktop uses its own
 *   `src-renderer-webpack/editor/gui/addons.js`).
 * - rendering/loading-animation pieces -- their consumers already live in the library.
 */

import {initWorkspaceBackground} from './workspace-background/index.js';
import {initCancelEditorMargins} from './cancel-editor-margins/index.js';
import {initUnclipPalette} from './unclip-palette/index.js';
import {initResizePalette} from './resize-palette/index.js';
import {initContextMenuStyle} from './context-menu-style/index.js';
import {initContextMenuDismiss} from './context-menu-dismiss/index.js';
import {initCommentMarkdownEditor} from './comment-markdown-editor/index.js';
import {initWorkspaceToolbox} from './workspace-toolbox/index.js';
import {initWindowModal} from './window-modal/index.js';
import {initUnifiedScrollbars} from './unified-scrollbars/index.js';

const initHyperMimic = () => {
    // Used to be the background addon's job; it now ships as a core feature behind the advanced
    // settings modal, so it has to come up regardless of which addons are enabled.
    initWorkspaceBackground();

    // Also a HyperMimic-only editor setting; it toggles a class on <body> and has to be in place
    // before the first paint so the workspace is measured at its final width.
    initCancelEditorMargins();

    // HyperMimic-only editor setting: while the block palette is hovered, wide blocks overflow
    // instead of being clipped. Injects a raw <style> so Blockly's literal class names survive.
    initUnclipPalette();

    // HyperMimic-only editor setting: when the block palette style is "resize", a drag handle on
    // the flyout edge lets the user change the palette width at runtime. Monkey-patches Blockly's
    // VerticalFlyout so the change survives flyout rebuilds.
    initResizePalette();

    // HyperMimic-only editor setting: the "default" (original) context menu style reverts the
    // "loose" styling that ships in scratch-blocks/core/css.js back to css_old.js values. Injects
    // a raw <style> so Blockly's literal class names survive.
    initContextMenuStyle();

    // A press in either half of the editor dismisses the other half's context menu: the workspace's
    // own menu (scratch-blocks) and the GUI's (react-contextmenu) never close each other on their own.
    initContextMenuDismiss();

    // HyperMimic-only editor setting: adds a Markdown preview toggle to each comment bubble.
    initCommentMarkdownEditor();

    // HyperMimic-only editor setting: a toolbox button in the top-left of the workspace that
    // expands into a set of tool buttons.
    initWorkspaceToolbox();

    // HyperMimic-only editor setting: turns modals into movable, resizable windows.
    initWindowModal();

    // HyperMimic-only editor setting: applies one consistent, theme-aware scrollbar
    // style across the editor. Toggles a class on <body>.
    initUnifiedScrollbars();
};

export {initHyperMimic};
export default initHyperMimic;
