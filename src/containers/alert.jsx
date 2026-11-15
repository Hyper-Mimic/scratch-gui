import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import SB3Downloader from './sb3-downloader.jsx';
import AlertComponent from '../components/alerts/alert.jsx';
import {openConnectionModal} from '../reducers/modals';
import {setConnectionModalExtensionId} from '../reducers/connection-modal';
import {manualUpdateProject} from '../reducers/project-state';

class Alert extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleOnCloseAlert',
            'handleOnReconnect'
        ]);
    }
    handleOnCloseAlert () {
        // The alert is already animating out (its redux entry was removed) -- ignore a stray
        // click on the close button of the leaving clone.
        if (this.props.leaving) return;
        this.props.onCloseAlert(this.props.index);
    }
    handleOnReconnect () {
        this.props.onOpenConnectionModal(this.props.extensionId);
        this.handleOnCloseAlert();
    }
    render () {
        const {
            closeButton,
            confirmLabel,
            cancelLabel,
            content,
            extensionName,
            hideCancel,
            index, // eslint-disable-line no-unused-vars
            leaving,
            level,
            iconSpinner,
            iconURL,
            inputValue,
            message,
            onConfirm,
            onCancel,
            onSaveNow,
            showConfirm,
            showDownload,
            showReconnect,
            showSaveNow
        } = this.props;
        return (
            <SB3Downloader>{(_, downloadProject) => (
                <AlertComponent
                    closeButton={closeButton}
                    confirmLabel={confirmLabel}
                    cancelLabel={cancelLabel}
                    content={content}
                    extensionName={extensionName}
                    hideCancel={hideCancel}
                    iconSpinner={iconSpinner}
                    iconURL={iconURL}
                    leaving={leaving}
                    level={level}
                    message={message}
                    inputValue={inputValue}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    showConfirm={showConfirm}
                    showDownload={showDownload}
                    showReconnect={showReconnect}
                    showSaveNow={showSaveNow}
                    onCloseAlert={this.handleOnCloseAlert}
                    onDownload={downloadProject}
                    onReconnect={this.handleOnReconnect}
                    onSaveNow={onSaveNow}
                />
            )}</SB3Downloader>
        );
    }
}

const mapStateToProps = () => ({});

const mapDispatchToProps = dispatch => ({
    onOpenConnectionModal: id => {
        dispatch(setConnectionModalExtensionId(id));
        dispatch(openConnectionModal());
    },
    onSaveNow: () => {
        dispatch(manualUpdateProject());
    }
});

Alert.propTypes = {
    closeButton: PropTypes.bool,
    confirmLabel: PropTypes.string,
    cancelLabel: PropTypes.string,
    content: PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
    extensionId: PropTypes.string,
    extensionName: PropTypes.string,
    hideCancel: PropTypes.bool,
    iconSpinner: PropTypes.bool,
    iconURL: PropTypes.string,
    index: PropTypes.number,
    inputValue: PropTypes.string,
    leaving: PropTypes.bool,
    level: PropTypes.string.isRequired,
    message: PropTypes.string,
    onCloseAlert: PropTypes.func.isRequired,
    onConfirm: PropTypes.func,
    onCancel: PropTypes.func,
    onOpenConnectionModal: PropTypes.func,
    onSaveNow: PropTypes.func,
    showConfirm: PropTypes.bool,
    showDownload: PropTypes.bool,
    showReconnect: PropTypes.bool,
    showSaveNow: PropTypes.bool
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Alert);
