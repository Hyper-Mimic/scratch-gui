import alertsData, {AlertTypes, AlertLevels} from '../lib/alerts/index.jsx';
import extensionData from '../lib/libraries/extensions/index.jsx';

const SHOW_ALERT = 'scratch-gui/alerts/SHOW_ALERT';
const SHOW_CONFIRM_ALERT = 'scratch-gui/alerts/SHOW_CONFIRM_ALERT';
const SHOW_EXTENSION_ALERT = 'scratch-gui/alerts/SHOW_EXTENSION_ALERT';
const CLOSE_ALERT = 'scratch-gui/alerts/CLOSE_ALERT';
const CLOSE_ALERTS_WITH_ID = 'scratch-gui/alerts/CLOSE_ALERTS_WITH_ID';
const CLOSE_ALERT_WITH_ID = 'scratch-gui/alerts/CLOSE_ALERT_WITH_ID';

/**
 * Initial state of alerts reducer
 *
 * {bool} visible - whether the alerts are visible
 * {array} alertsList - list of alerts, each with properties:
 *  * alertType (required): one of AlertTypes
 *  * closeButton (optional): bool indicating that we should show close button
 *  * content (optional): react element (a <FormattedMessage />)
 *  * extentionId (optional): id string that identifies the extension
 *  * iconURL (optional): string
 *  * level (required): string, one of AlertLevels
 *  * message (optional): string
 *  * showReconnect (optional): bool
 */
const initialState = {
    visible: true,
    alertsList: []
};

const filterPopupAlerts = alertsList => (
    alertsList.filter(curAlert => (
        curAlert.alertType === AlertTypes.STANDARD ||
        curAlert.alertType === AlertTypes.EXTENSION
    ))
);

const filterInlineAlerts = alertsList => (
    alertsList.filter(curAlert => (
        curAlert.alertType === AlertTypes.INLINE
    ))
);

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SHOW_ALERT: { // intended to show standard and inline alerts, but not extensions
        const alertId = action.alertId;
        if (alertId) {
            const newAlert = {
                alertId: alertId,
                level: AlertLevels.WARN // default level
            };
            const alertData = alertsData.find(thisAlertData => thisAlertData.alertId === alertId);
            if (alertData) {
                const newList = state.alertsList.filter(curAlert => (
                    !alertData.clearList || alertData.clearList.indexOf(curAlert.alertId) === -1
                ));
                if (action.data && action.data.message) {
                    newAlert.message = action.data.message;
                }

                newAlert.alertType = alertData.alertType || AlertTypes.STANDARD;
                newAlert.closeButton = alertData.closeButton;
                newAlert.content = alertData.content;
                newAlert.iconURL = alertData.iconURL;
                newAlert.iconSpinner = alertData.iconSpinner;
                newAlert.level = alertData.level;
                newAlert.showDownload = alertData.showDownload;
                newAlert.showSaveNow = alertData.showSaveNow;

                newList.push(newAlert);
                return Object.assign({}, state, {
                    alertsList: newList
                });
            }
        }
        return state; // if alert not found, show nothing
    }
    case SHOW_EXTENSION_ALERT: {
        const extensionId = action.data.extensionId;
        if (extensionId) {
            const extension = extensionData.find(ext => ext.extensionId === extensionId);
            if (extension) {
                const newList = state.alertsList.slice();
                const newAlert = {
                    alertType: AlertTypes.EXTENSION,
                    closeButton: true,
                    extensionId: extensionId,
                    extensionName: extension.name,
                    iconURL: extension.connectionSmallIconURL,
                    level: AlertLevels.WARN,
                    showReconnect: true
                };
                newList.push(newAlert);

                return Object.assign({}, state, {
                    alertsList: newList
                });
            }
        }
        return state; // if alert not found, show nothing
    }
    // A question that blocks until the user answers: the card renders confirm/cancel
    // buttons and stays up (no auto-dismiss path exists for it) until one is
    // pressed, which closes it through the normal close actions. `onConfirm` and
    // `onCancel` ride in the action payload. Optional extras used by the
    // lib/alert-dialogs helpers:
    //   confirmLabel / cancelLabel -- pre-translated button captions
    //   hideCancel                 -- plain notification (single OK button)
    //   inputValue                 -- when present, the card shows a text input and
    //                                 onConfirm receives the entered string
    case SHOW_CONFIRM_ALERT: {
        const newList = state.alertsList.slice();
        newList.push({
            alertType: AlertTypes.STANDARD,
            level: action.data.level || AlertLevels.WARN,
            content: action.data.content,
            closeButton: false,
            showConfirm: true,
            confirmLabel: action.data.confirmLabel,
            cancelLabel: action.data.cancelLabel,
            hideCancel: action.data.hideCancel,
            inputValue: action.data.inputValue,
            onConfirm: action.data.onConfirm,
            onCancel: action.data.onCancel
        });
        return Object.assign({}, state, {
            alertsList: newList
        });
    }
    case CLOSE_ALERT_WITH_ID:
    case CLOSE_ALERT: {
        if (action.alertId) {
            action.index = state.alertsList.findIndex(a => a.alertId === action.alertId);
            if (action.index === -1) return state;
        }
        const newList = state.alertsList.slice();
        newList.splice(action.index, 1);
        return Object.assign({}, state, {
            alertsList: newList
        });
    }
    case CLOSE_ALERTS_WITH_ID: {
        return Object.assign({}, state, {
            alertsList: state.alertsList.filter(curAlert => (
                curAlert.alertId !== action.alertId
            ))
        });
    }
    default:
        return state;
    }
};

/**
 * Action creator to close an alert with the given index.
 *
 * @param {object} index - the index of the alert to close.
 * @return {object} - an object to be passed to the reducer.
 */
const closeAlert = function (index) {
    return {
        type: CLOSE_ALERT,
        index
    };
};

/**
 * Action creator to close all alerts with a given ID.
 *
 * @param {string} alertId - id string of the alert to close
 * @return {object} - an object to be passed to the reducer.
 */
const closeAlertsWithId = function (alertId) {
    return {
        type: CLOSE_ALERTS_WITH_ID,
        alertId
    };
};

/**
 * Action creator to close a single alert with a given ID.
 *
 * @param {string} alertId - id string of the alert to close
 * @return {object} - an object to be passed to the reducer.
 */
const closeAlertWithId = function (alertId) {
    return {
        type: CLOSE_ALERT_WITH_ID,
        alertId
    };
};

/**
 * Action creator to show an alert with the given alertId.
 *
 * @param {string} alertId - id string of the alert to show
 * @return {object} - an object to be passed to the reducer.
 */
const showStandardAlert = function (alertId) {
    return {
        type: SHOW_ALERT,
        alertId
    };
};

/**
 * Action creator for a confirmation alert: a card with Delete/Cancel buttons
 * that stays up until answered. `data.content` is the question (a string or a
 * React element) and `data.onConfirm` runs when the confirm button is pressed;
 * both buttons then close the card.
 *
 * @param {object} data - {content, onConfirm, level?}
 * @return {object} - an object to be passed to the reducer.
 */
const showConfirmAlert = function (data) {
    return {
        type: SHOW_CONFIRM_ALERT,
        data
    };
};

/**
 * Action creator to show an alert with the given input data.
 *
 * @param {object} data - data for the alert
 * @param {string} data.message - message for the alert
 * @param {string} data.extensionId - extension ID for the alert
 * @return {object} - an object to be passed to the reducer.
 */
const showExtensionAlert = function (data) {
    return {
        type: SHOW_EXTENSION_ALERT,
        data
    };
};

/**
 * Function to dispatch showing an alert, with optional
 * timeout to make it close/go away.
 *
 * @param {object} dispatch - dispatch function
 * @param {string} alertId - the ID of the alert
 */
const showAlertWithTimeout = function (dispatch, alertId) {
    const alertData = alertsData.find(thisAlertData => thisAlertData.alertId === alertId);
    if (alertData) {
        dispatch(showStandardAlert(alertId));
        if (alertData.maxDisplaySecs) {
            setTimeout(() => {
                dispatch(closeAlertsWithId(alertId));
            }, alertData.maxDisplaySecs * 1000);
        }
    }
};

export {
    reducer as default,
    initialState as alertsInitialState,
    closeAlert,
    closeAlertWithId,
    filterInlineAlerts,
    filterPopupAlerts,
    showAlertWithTimeout,
    showConfirmAlert,
    showExtensionAlert,
    showStandardAlert
};
