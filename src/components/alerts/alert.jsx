import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';

import Box from '../box/box.jsx';
import CloseButton from '../close-button/close-button.jsx';
import Spinner from '../spinner/spinner.jsx';
import {AlertLevels} from '../../lib/alerts/index.jsx';

import styles from './alert.css';

const AlertComponent = ({
    content,
    closeButton,
    confirmLabel,
    cancelLabel,
    extensionName,
    hideCancel,
    iconSpinner,
    iconURL,
    inputValue,
    level,
    leaving,
    onConfirm,
    onCancel,
    showConfirm,
    showDownload,
    showSaveNow,
    onCloseAlert,
    onDownload,
    onSaveNow,
    onReconnect,
    showReconnect
}) => {
    // The optional text input (lib/alert-dialogs passes `inputValue` as the initial
    // value): its current content is handed to onConfirm when the card is accepted.
    const [text, setText] = React.useState(inputValue || '');
    const accept = () => {
        if (onConfirm) onConfirm(inputValue != null ? text : undefined);
        onCloseAlert();
    };
    const decline = () => {
        if (onCancel) onCancel();
        onCloseAlert();
    };
    return (
    <Box
        className={classNames(styles.alert, styles[level], {
            [styles.closing]: leaving
        })}
    >
        {/* TODO: implement Rtl handling */}
        {(iconSpinner || iconURL) && (
            <div className={styles.iconSection}>
                {iconSpinner && (
                    <Spinner
                        className={styles.alertSpinner}
                        level={level}
                    />
                )}
                {iconURL && (
                    <img
                        className={styles.alertIcon}
                        src={iconURL}
                        draggable={false}
                    />
                )}
            </div>
        )}
        <div className={styles.alertMessage}>
            {extensionName ? (
                <FormattedMessage
                    defaultMessage="Lost connection to {extensionName}."
                    description="Message indicating that an extension peripheral has been disconnected"
                    id="tw.alerts.lostPeripheralConnection"
                    values={{
                        extensionName: (
                            `${extensionName}`
                        )
                    }}
                />
            ) : content}
        </div>
        {showConfirm && inputValue != null && (
            <input
                autoFocus
                className={styles.alertConfirmInput}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') accept();
                }}
            />
        )}
        <div className={styles.alertButtons}>
            {showConfirm && (
                <React.Fragment>
                    {!hideCancel && (
                        <button
                            className={styles.alertConnectionButton}
                            onClick={decline}
                        >
                            {cancelLabel || (
                                <FormattedMessage
                                    defaultMessage="Cancel"
                                    description="Confirmation alert: cancel the action"
                                    id="tw.alerts.confirmCancel"
                                />
                            )}
                        </button>
                    )}
                    <button
                        className={styles.alertConnectionButton}
                        onClick={accept}
                    >
                        {confirmLabel || (
                            <FormattedMessage
                                defaultMessage="Confirm"
                                description="Confirmation alert: go ahead with the action"
                                id="tw.alerts.confirmOk"
                            />
                        )}
                    </button>
                </React.Fragment>
            )}
            {showSaveNow && (
                <button
                    className={styles.alertConnectionButton}
                    onClick={onSaveNow}
                >
                    <FormattedMessage
                        defaultMessage="Try Again"
                        description="Button to try saving again"
                        id="gui.alerts.tryAgain"
                    />
                </button>
            )}
            {showDownload && (
                <button
                    className={styles.alertConnectionButton}
                    onClick={onDownload}
                >
                    <FormattedMessage
                        defaultMessage="Download"
                        description="Button to download project locally"
                        id="gui.alerts.download"
                    />
                </button>
            )}
            {showReconnect && (
                <button
                    className={styles.alertConnectionButton}
                    onClick={onReconnect}
                >
                    <FormattedMessage
                        defaultMessage="Reconnect"
                        description="Button to reconnect the device"
                        id="gui.connection.reconnect"
                    />
                </button>
            )}
            {closeButton && (
                <Box
                    className={styles.alertCloseButtonContainer}
                >
                    <CloseButton
                        className={classNames(styles.alertCloseButton)}
                        color={CloseButton.COLOR_NEUTRAL}
                        size={CloseButton.SIZE_LARGE}
                        onClick={onCloseAlert}
                    />
                </Box>
            )}
        </div>
    </Box>
    );
};

AlertComponent.propTypes = {
    closeButton: PropTypes.bool,
    confirmLabel: PropTypes.string,
    content: PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
    cancelLabel: PropTypes.string,
    extensionName: PropTypes.string,
    hideCancel: PropTypes.bool,
    iconSpinner: PropTypes.bool,
    iconURL: PropTypes.string,
    inputValue: PropTypes.string,
    leaving: PropTypes.bool,
    level: PropTypes.string,
    onCloseAlert: PropTypes.func.isRequired,
    onConfirm: PropTypes.func,
    onCancel: PropTypes.func,
    onDownload: PropTypes.func,
    onReconnect: PropTypes.func,
    onSaveNow: PropTypes.func,
    showConfirm: PropTypes.bool,
    showDownload: PropTypes.bool,
    showReconnect: PropTypes.bool,
    showSaveNow: PropTypes.bool
};

AlertComponent.defaultProps = {
    level: AlertLevels.WARN
};

export default AlertComponent;
