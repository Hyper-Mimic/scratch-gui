/**
 * Promise-based dialogs rendered through the alert stack (components/alerts),
 * with the browser-native dialogs as the fallback when no store is registered
 * yet (or the caller runs outside the editor GUI).
 *
 * `setAlertDialogDispatch` is called once per mounted GUI store (see
 * lib/app-state-hoc.jsx). Every helper resolves when the user answers:
 *
 *   guiConfirm({content, ...})  -> true  (confirm)  / false (cancel)
 *   guiPrompt({content, inputValue}) -> string (confirm) / null (cancel)
 *   guiAlert({content, ...})    -> undefined (OK)
 *
 * `content` is a plain string (most callers) or a React element.
 */

import {AlertLevels} from './alerts/index.jsx';
import {showConfirmAlert} from '../reducers/alerts';

let dispatchRef = null;

export const setAlertDialogDispatch = dispatch => {
    dispatchRef = dispatch;
};

const textOf = content => (
    typeof content === 'string' ? content :
        (content && content.props && content.props.defaultMessage) || ''
);

export const guiConfirm = ({
    content,
    confirmLabel,
    cancelLabel,
    level = AlertLevels.WARN
}) => {
    if (!dispatchRef) {
        // Fallback: the browser's own dialog.
        return Promise.resolve(window.confirm(textOf(content)));
    }
    return new Promise(resolve => {
        dispatchRef(showConfirmAlert({
            content,
            confirmLabel,
            cancelLabel,
            level,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
        }));
    });
};

export const guiPrompt = ({
    content,
    inputValue = '',
    confirmLabel,
    cancelLabel,
    level = AlertLevels.WARN
}) => {
    if (!dispatchRef) {
        // Fallback: the browser's own dialog. `prompt` already resolves null
        // on cancel, so the contract matches without extra work.
        return Promise.resolve(window.prompt(textOf(content), inputValue));
    }
    return new Promise(resolve => {
        dispatchRef(showConfirmAlert({
            content,
            confirmLabel,
            cancelLabel,
            level,
            inputValue,
            onConfirm: value => resolve(value),
            onCancel: () => resolve(null)
        }));
    });
};

export const guiAlert = ({
    content,
    okLabel,
    level = AlertLevels.WARN
}) => {
    if (!dispatchRef) {
        // Fallback: the browser's own dialog.
        window.alert(textOf(content));
        return Promise.resolve();
    }
    return new Promise(resolve => {
        dispatchRef(showConfirmAlert({
            content,
            confirmLabel: okLabel,
            hideCancel: true,
            level,
            onConfirm: () => resolve()
        }));
    });
};
