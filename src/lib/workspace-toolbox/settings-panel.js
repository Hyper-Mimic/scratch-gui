/**
 * The "arrange the toolbox" panel in the advanced settings modal, under 工作区工具箱 / Workspace
 * toolbox. It is what makes the order in ../../lib/workspace-toolbox/order.js user-settable.
 *
 * It lists the tools the toolbox is showing right now -- grip, icon and name, taken straight out of
 * the registry so the two can never disagree -- and a row is rearranged by dragging the grip on its
 * left. Every drop is written immediately: there is no Save button, because the point of the panel
 * is that the column over on the workspace stops reshuffling, so the arrangement has to be in effect
 * the moment it is made. "Reset" clears the stored arrangement, which puts the tools back in
 * registration order.
 *
 * The drag is pointer-based -- mouse, touch and pen go through one path -- and is driven by plain
 * `document` listeners rather than HTML5 drag-and-drop. The HTML5 API would mean `dragstart` /
 * `dataTransfer` plumbing, it paints the browser's own ghost image, and, the part that actually
 * matters here, a `dragstart` inside the editor is exactly the event Blockly's workspace listens
 * for when it starts dragging a block.
 *
 * The dragging row follows the pointer and the rows it passes slide one step out of the way, so the
 * gap it is heading for is visible before the pointer arrives; the drop then animates the row into
 * the slot it is over and only then stores the order, so the rebuilt list agrees with what was on
 * screen. Rows are also focusable and rearranged with the up/down arrow keys, which is what keeps
 * the list usable without a pointer.
 *
 * The panel belongs to the toolbox switch above it in the modal, so it follows that switch: with
 * the toolbox off there is no column to arrange, and the panel goes grey and inert rather than
 * disappearing -- what has been arranged stays readable, it just cannot be edited.
 *
 * Plain DOM plus a raw `<style>`, like the toolbox itself and the workspace background panel. It is
 * mounted into a host element the settings modal hands over, which is outside that modal's CSS
 * module, and it is not a React component for the same reason: it owns a list that changes while
 * the user is dragging in it (an addon can register its button at any moment), and re-rendering
 * from scratch each time is both simpler and more predictable than reconciling it.
 */

import {defineMessages} from 'react-intl';
import cssModule from '!css-loader?{"esModule":false}!./settings-panel.css';
// The checkbox, shared with the workspace background panel: the same control in both, and neither
// panel's stylesheet should be what decides whether the other one is styled.
import tinyCheckboxCss from '!css-loader?{"esModule":false}!../../css/hm-tiny-checkbox.css';
import {
    getWorkspaceToolboxButtons,
    onWorkspaceToolboxButton
} from './registry.js';
import {
    getOrder,
    getToolKey,
    mergeVisibleIntoOrder,
    setOrder,
    sortByOrder
} from './order.js';
import {
    getSetting,
    onSettingsChange,
    setSetting,
    SETTING_WORKSPACE_TOOLBOX,
    SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE,
    SETTING_WORKSPACE_TOOLBOX_ORDER
} from '../hypermimic-settings.js';

// Matches the toolbox's own buttons (22px), a touch smaller because this list is read rather than
// aimed at.
const ICON_SIZE = 20;

// How far a press has to travel before it is a drag rather than a click. Without it every press
// would start rearranging, and a click on a row (which is also how the row is focused for the
// keyboard) would nudge the list.
const DRAG_THRESHOLD = 3;

// How long the dropped row takes to travel into its slot before the order is stored -- matched to
// the `--settling` transition in the stylesheet.
const SETTLE_MS = 140;

const STYLE_ELEMENT_ID = 'hm-toolbox-order-styles';

// The translations are not kept here: these ids live in ../../tw-translations/generated-translations.json,
// the fork's own table, which is mixed into every locale of the app's message table. A locale the
// table does not cover falls back to the `defaultMessage` below, exactly as react-intl would.
const messages = defineMessages({
    'title': {
        defaultMessage: 'Order',
        description: 'Label of the toolbox order setting in the advanced settings modal',
        id: 'hm.workspaceToolbox.orderTitle'
    },
    'drag': {
        defaultMessage: 'Drag to reorder',
        description: 'Tooltip of the drag handle on a row of the toolbox order setting',
        id: 'hm.workspaceToolbox.orderDrag'
    },
    'reset': {
        defaultMessage: 'Reset order',
        description: 'Button that clears the custom toolbox order',
        id: 'hm.workspaceToolbox.orderReset'
    },
    'empty': {
        defaultMessage:
            'There is nothing to order yet. The toolbox shows the tools that the enabled addons ' +
            'contribute, so this list fills in once one of them is on.',
        description: 'Shown in the toolbox order setting when no tool is registered',
        id: 'hm.workspaceToolbox.orderEmpty'
    },
    'autoHide': {
        defaultMessage: 'Auto-hide (unfolds on hover)',
        description: 'Checkbox that makes the workspace toolbox open only while the pointer is over it',
        id: 'hm.workspaceToolbox.autoHide'
    },
    'autoHideTitle': {
        defaultMessage:
            'The toolbox unfolds while the pointer is over its button and folds away again once it ' +
            'leaves. Left off it stays manual: the button opens and closes the column, and the ' +
            'state you leave it in is remembered. The button itself always stays visible.',
        description: 'Tooltip of the auto-hide checkbox of the workspace toolbox',
        id: 'hm.workspaceToolbox.autoHideTitle'
    }
});

// The grip, drawn inline rather than as an <img> like the tool icons: it is a `currentColor` fill,
// so it follows the theme without needing the icon filter an image would. Two columns of three
// dots, which is the shape every reorderable list uses for this.
const GRIP = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<g fill="currentColor">' +
    [4, 8, 12].map(y => [5.5, 10.5].map(x => `<circle cx="${x}" cy="${y}" r="1.4"/>`).join('')).join('') +
    '</g></svg>';

const prefersReducedMotion = () => {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        // No matchMedia (or it throws): animate. The transition is a nicety, not a requirement.
        return false;
    }
};

// Whether the toolbox unfolds on hover rather than staying however it was last clicked. Read from
// the settings (lib/workspace-toolbox/index.js is what acts on it), never held here: the checkbox
// below is one writer out of however many the setting grows.
const isAutoHideOn = () => getSetting(SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE) === true;

let styleInjected = false;
const injectStyles = () => {
    if (styleInjected || typeof document === 'undefined') return;
    styleInjected = true;
    // css-loader hands back its classic [id, css, ...] list here, not a module object, because the
    // imports above opt out of ES modules. The shared checkbox sheet is appended to this panel's
    // own so that a panel opened on its own is styled without the background panel having to be.
    const toText = mod => (Array.isArray(mod) ? mod.map(entry => entry[1]).join('\n') : String(mod));
    const cssText = toText(cssModule) + '\n' + toText(tinyCheckboxCss);
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = cssText;
    document.head.appendChild(style);
};

/**
 * Builds the panel.
 *
 * @param {object} options
 * @param {object} options.intl intl instance used to translate the labels
 * @returns {{element: HTMLElement, dispose: function}}
 */
const createWorkspaceToolboxOrderPanel = ({intl}) => {
    injectStyles();

    const msg = key => intl.formatMessage(messages[key]);

    const root = document.createElement('div');
    root.className = 'hm-toolbox-order';

    const head = document.createElement('div');
    head.className = 'hm-toolbox-order-head';

    const title = document.createElement('span');
    title.className = 'hm-toolbox-order-title';
    title.textContent = msg('title');

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'hm-toolbox-order-reset';
    reset.textContent = msg('reset');
    reset.addEventListener('click', () => {
        // An empty arrangement is the absence of one: the toolbox renders in registration order.
        if (enabled) setOrder([]);
    });

    head.appendChild(title);
    head.appendChild(reset);

    const list = document.createElement('div');
    list.className = 'hm-toolbox-order-list';

    // The one thing this panel sets besides the arrangement itself. It is an option of the toolbox
    // being arranged rather than of the arrangement, which is why it sits below the list instead of
    // among the rows: the rows are things to move, this is not.
    const autoHideLabel = document.createElement('label');
    autoHideLabel.className = 'hm-toolbox-order-option';
    autoHideLabel.title = msg('autoHideTitle');

    const autoHideInput = document.createElement('input');
    autoHideInput.type = 'checkbox';
    // The same control the workspace background panel uses, from src/css/hm-tiny-checkbox.css.
    autoHideInput.className = 'hm-tiny-checkbox';
    autoHideInput.checked = isAutoHideOn();

    const autoHideText = document.createElement('span');
    autoHideText.textContent = msg('autoHide');

    autoHideLabel.appendChild(autoHideInput);
    autoHideLabel.appendChild(autoHideText);
    autoHideInput.addEventListener('change', () => {
        // The panel is inert while the toolbox is off, so this is belt and braces -- but the
        // checkbox is exactly the kind of control a stray `change` can reach through a label click.
        if (enabled) {
            setSetting(SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE, autoHideInput.checked);
        } else {
            // The browser has already flipped the box by the time `change` arrives, so a click that
            // was discarded would still be sitting there ticked. Put it back to what the store says,
            // which is the same rule the rest of the panel follows: the store is the truth, the DOM
            // only reflects it.
            autoHideInput.checked = isAutoHideOn();
        }
    });

    root.appendChild(head);
    root.appendChild(list);
    root.appendChild(autoHideLabel);

    // The rows are rebuilt on every change, so the row the user is working with stops existing
    // mid-interaction. Remembering which one to put the focus back on is what makes a second
    // arrow-key press possible without reaching for the mouse again.
    let pendingFocus = null;

    // Whether the toolbox itself is on, i.e. whether there is a column for this panel to arrange.
    // Read from the settings by `applyEnabled` below and checked by every way in: a greyed-out
    // panel is not enough on its own, because the guards are also what stops a gesture that was
    // already under way when the switch was thrown.
    let enabled = true;

    /**
     * The tools to list, in the order they are shown in: the saved arrangement with anything
     * unplaced after it. Tools with no identity to key on cannot be arranged, so they are left out
     * rather than listed as rows that could not be told apart.
     */
    const visibleTools = () => sortByOrder(
        getWorkspaceToolboxButtons().filter(tool => getToolKey(tool) != null),
        getToolKey
    );

    /**
     * The rows currently in the list, in the order they are shown -- which is the order being
     * edited.
     */
    const rowElements = () => Array.prototype.slice.call(
        list.querySelectorAll('.hm-toolbox-order-row')
    );

    const buildGrip = () => {
        const grip = document.createElement('span');
        grip.className = 'hm-toolbox-order-grip';
        // Decorative: the row itself carries the name, and the tooltip below is the only place the
        // gesture is spelled out -- there is no help text in the panel to repeat it. `title` is for
        // the pointer, which is who the grip is for.
        grip.setAttribute('aria-hidden', 'true');
        grip.title = msg('drag');
        grip.innerHTML = GRIP;
        return grip;
    };

    const buildRow = tool => {
        const row = document.createElement('div');
        row.className = 'hm-toolbox-order-row';
        row.dataset.key = getToolKey(tool);
        // Focusable so the same list can be rearranged from the keyboard; see the `keydown`
        // listener below.
        row.tabIndex = 0;
        row.setAttribute('role', 'listitem');
        row.setAttribute('aria-label', tool.label);

        const icon = document.createElement('img');
        icon.className = 'hm-toolbox-order-icon';
        icon.src = tool.icon;
        icon.width = ICON_SIZE;
        icon.height = ICON_SIZE;
        // The name beside it is the accessible text; `draggable=false` because an <img> is
        // draggable by default, which would start a stray browser drag inside the modal.
        icon.alt = '';
        icon.draggable = false;

        const name = document.createElement('span');
        name.className = 'hm-toolbox-order-name';
        // The label may come from an addon and be a sentence long -- it is clipped by the stylesheet,
        // so the full text is offered as a tooltip.
        name.title = tool.label;
        name.textContent = tool.label;

        row.addEventListener('keydown', e => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            move(getToolKey(tool), e.key === 'ArrowUp' ? -1 : 1);
        });
        row.addEventListener('pointerdown', onRowPointerDown);

        row.appendChild(buildGrip());
        row.appendChild(icon);
        row.appendChild(name);
        return row;
    };

    const render = () => {
        // A rebuild pulls the rows out from under a pointer that is still holding one of them.
        if (drag) cancelDrag();

        const tools = visibleTools();
        list.textContent = '';
        if (tools.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'hm-toolbox-order-empty';
            empty.textContent = msg('empty');
            list.appendChild(empty);
        } else {
            tools.forEach(tool => list.appendChild(buildRow(tool)));
        }
        // There is nothing to reset while the tools are in registration order, i.e. while the
        // stored arrangement is empty. Any stored key counts, including one whose addon is off at
        // the moment: it is still what puts that tool back in place when the addon returns.
        reset.disabled = getOrder().length === 0;

        if (pendingFocus) {
            const row = rowElements().find(el => el.dataset.key === pendingFocus);
            // A row that is no longer listed has nothing to focus, which is fine.
            if (row) row.focus();
            pendingFocus = null;
        }
    };

    /**
     * Moves one tool `delta` places and stores the result. The keyboard path; dragging goes through
     * the pointer handlers below and stores the same thing.
     *
     * The stored list is the tools on screen plus whatever was stored for tools that are not on
     * screen right now -- see `mergeVisibleIntoOrder`; dropping those would send a switched-off
     * addon's tool to the bottom of the column the moment it came back.
     */
    const move = (key, delta) => {
        if (!enabled) return;
        const keys = visibleTools().map(getToolKey);
        const from = keys.indexOf(key);
        const to = from + delta;
        if (from === -1 || to < 0 || to >= keys.length) return;
        keys.splice(to, 0, keys.splice(from, 1)[0]);
        pendingFocus = key;
        setOrder(mergeVisibleIntoOrder(keys));
    };

    /* ------------------------------------------------------------------ dragging */

    // The press in progress, or null. Also the flag `render` reads to know that a rebuild would
    // take the rows away from the pointer.
    let drag = null;

    // A drop that is still animating into place: what to store once the row has landed. Held rather
    // than applied at once so the row appears to travel to its slot instead of jumping the last few
    // pixels -- and applying it is idempotent, so a panel torn down mid-animation does not lose the
    // rearrangement.
    let pendingDrop = null;
    let pendingDropTimer = null;

    const applyPendingDrop = () => {
        if (pendingDropTimer) {
            clearTimeout(pendingDropTimer);
            pendingDropTimer = null;
        }
        const drop = pendingDrop;
        pendingDrop = null;
        if (drop) drop();
    };

    /** Drops the drag classes and the offsets the drag put on the rows. */
    const clearRowOffsets = rowEls => {
        rowEls.forEach(row => {
            row.style.transform = '';
            row.classList.remove('hm-toolbox-order-row--dragging');
            row.classList.remove('hm-toolbox-order-row--settling');
        });
        list.classList.remove('hm-toolbox-order-list--dragging');
        root.classList.remove('hm-toolbox-order--dragging');
    };

    /**
     * Animates a row the last few pixels into place, then runs `finish`.
     *
     * The transition is what makes the drop land rather than jump; `finish` is deferred to the same
     * length so that nothing (storing the order, clearing the offsets) unmounts the row while it is
     * still travelling.
     */
    const settleRow = (row, offset, finish) => {
        row.classList.add('hm-toolbox-order-row--settling');
        row.style.transform = offset ? `translateY(${offset}px)` : '';
        pendingDrop = finish;
        pendingDropTimer = setTimeout(applyPendingDrop, prefersReducedMotion() ? 0 : SETTLE_MS);
    };

    const stopTracking = () => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
    };

    const cancelDrag = () => {
        if (!drag) return;
        const {rowEls} = drag;
        drag = null;
        stopTracking();
        clearRowOffsets(rowEls);
    };

    const onRowPointerDown = e => {
        if (drag || !enabled) return;
        // Only the primary button drags. Touch and pen report button 0 too (or -1 for "no button"),
        // so this is the mouse check as much as anything.
        if (e.button !== 0 && e.button !== -1) return;
        // A touch starting anywhere but the grip is a scroll of the settings list, which is why the
        // grip is the one element in the row with `touch-action: none`.
        if (e.pointerType === 'touch' && !e.target.closest('.hm-toolbox-order-grip')) return;

        const rowEls = rowElements();
        const row = e.currentTarget;
        const from = rowEls.indexOf(row);
        if (from === -1) return;

        drag = {
            row,
            rowEls,
            from,
            over: from,
            startY: e.clientY,
            // The rows are uniform, so the step the displacement is measured in is just the height
            // of the one being dragged.
            step: row.getBoundingClientRect().height || 1,
            moved: false
        };

        // Tracking on `document` rather than on the row: the pointer leaves the row almost at once
        // (that is the entire point), and over the modal the events would otherwise be lost.
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);

        // Capture as well, so that a pointer released outside the window still ends the drag rather
        // than leaving the row stuck to a pointer that is no longer down.
        try {
            row.setPointerCapture(e.pointerId);
        } catch (err) {
            // Not supported (or the pointer is already gone): the document listeners carry it.
        }
    };

    const onPointerMove = e => {
        if (!drag) return;
        const dy = e.clientY - drag.startY;
        if (!drag.moved) {
            // A press that has not travelled far enough yet is still a click -- which is also how a
            // row is focused for the keyboard -- so it does not rearrange anything.
            if (Math.abs(dy) < DRAG_THRESHOLD) return;
            drag.moved = true;
            drag.row.classList.add('hm-toolbox-order-row--dragging');
            // The dragged row is allowed out of the list's rounded box so that it can cast a shadow
            // and sit above its neighbours while it is held.
            list.classList.add('hm-toolbox-order-list--dragging');
            root.classList.add('hm-toolbox-order--dragging');
        }

        const last = drag.rowEls.length - 1;
        // The row follows the pointer, but no further than the list itself: past either end there is
        // no slot to drop it into, and letting it travel would only detach it from the rows it is
        // being compared against.
        const offset = Math.max(
            -drag.from * drag.step,
            Math.min(dy, (last - drag.from) * drag.step)
        );
        drag.row.style.transform = `translateY(${offset}px)`;

        // How many whole steps it has travelled is the slot it is over.
        const over = Math.max(0, Math.min(last, drag.from + Math.round(offset / drag.step)));
        if (over === drag.over) return;
        drag.over = over;

        // The rows in between slide one step against the direction of travel, which is what opens
        // the gap the dragged row is heading for before the pointer gets there.
        drag.rowEls.forEach((row, index) => {
            if (index === drag.from) return;
            const displaced = drag.from < over ?
                (index > drag.from && index <= over) :
                (index >= over && index < drag.from);
            row.style.transform = displaced ?
                `translateY(${(drag.from < over ? -1 : 1) * drag.step}px)` :
                '';
        });
    };

    const onPointerUp = () => {
        if (!drag) return;
        const {row, rowEls, from, over, step, moved} = drag;
        const key = row.dataset.key;
        drag = null;
        stopTracking();

        if (!moved) {
            // The press never became a drag, so nothing was arranged.
            clearRowOffsets(rowEls);
            return;
        }
        if (over === from) {
            // Put back where it started: animated like a drop so the row returns to its slot rather
            // than snapping. There is nothing to store and nothing to focus -- the row has not
            // moved -- so the wait is only there to let it finish travelling.
            settleRow(row, 0, () => clearRowOffsets(rowEls));
            return;
        }

        // Land the row in the slot it is over before the list is rebuilt in the new order: the
        // rebuilt list renders it in that slot, so animating it there first is what makes the drop
        // look like the row settling rather than jumping the last few pixels. The rows it passed
        // are already sitting in their new places, so nothing else has to move.
        const keys = visibleTools().map(getToolKey);
        keys.splice(over, 0, keys.splice(from, 1)[0]);
        pendingFocus = key;
        settleRow(row, (over - from) * step, () => setOrder(mergeVisibleIntoOrder(keys)));
    };

    /* ------------------------------------------------------------------ wiring */

    /**
     * Follows the toolbox switch: greyed out and inert while the toolbox is off.
     *
     * The arrangement is kept rather than cleared -- an off switch is not a reset -- so the list
     * still shows what the order is, it just cannot be edited. `inert` is what takes the rows and
     * the reset button out of the tab order and out of hit-testing in one go; where it is not
     * supported the stylesheet's `pointer-events: none` and the guards above cover both.
     */
    const applyEnabled = () => {
        enabled = getSetting(SETTING_WORKSPACE_TOOLBOX) !== false;
        // A drag that was already under way when the switch was thrown has nothing left to arrange.
        if (!enabled) cancelDrag();
        root.classList.toggle('hm-toolbox-order--disabled', !enabled);
        root.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        if ('inert' in root) root.inert = !enabled;
    };

    // The arrangement is stored in the settings, so it can change from under this panel -- the
    // reset button writes through the same store, and so would anything else that grew one. The
    // toolbox switch lives in the same store, which is why it arrives here too, and so does the
    // auto-hide checkbox (this panel is its only writer today, but the checkbox has to agree with
    // the store rather than with its own last click).
    const unsubscribeOrder = onSettingsChange(key => {
        if (key === SETTING_WORKSPACE_TOOLBOX_ORDER) render();
        else if (key === SETTING_WORKSPACE_TOOLBOX) applyEnabled();
        else if (key === SETTING_WORKSPACE_TOOLBOX_AUTO_HIDE) autoHideInput.checked = isAutoHideOn();
    });

    // The list is not fixed at the moment the modal opens: the addons register from their own
    // dynamic imports, so a button can still arrive -- and a language switch makes every addon
    // re-register its own, which is what refreshes the names and the tooltips.
    const unsubscribeButtons = onWorkspaceToolboxButton(render);

    applyEnabled();
    render();

    return {
        element: root,
        dispose: () => {
            unsubscribeOrder();
            unsubscribeButtons();
            cancelDrag();
            // Store a drop that was still animating: the panel is going away, but the arrangement
            // it was on its way to store is the one the user made.
            applyPendingDrop();
        }
    };
};

export {
    createWorkspaceToolboxOrderPanel
};
