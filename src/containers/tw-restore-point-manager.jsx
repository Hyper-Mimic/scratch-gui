import React from 'react';
import {guiConfirm, guiAlert, guiPrompt} from '../lib/alert-dialogs';
import {connect} from 'react-redux';
import {intlShape, injectIntl, defineMessages} from 'react-intl';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {showAlertWithTimeout, showStandardAlert} from '../reducers/alerts';
import {closeLoadingProject, closeRestorePointModal, openLoadingProject} from '../reducers/modals';
import {LoadingStates, getIsShowingProject, onLoadedProject, requestProjectUpload} from '../reducers/project-state';
import {setFileHandle} from '../reducers/tw';
import TWRestorePointModal from '../components/tw-restore-point-modal/restore-point-modal.jsx';
import RestorePointAPI from '../lib/tw-restore-point-api';
import log from '../lib/log';
import downloadBlob from '../lib/download-blob.js';

/* eslint-disable no-alert */

const SAVE_DELAY = 250;
const MINIMUM_SAVE_TIME = 1000;
// See src/reducers/project-state.js; '0' is the id of the untouched default project.
const DEFAULT_PROJECT_ID = '0';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Identity of the project currently open in the editor.
 *
 * The renderer is deliberately not given real disk paths (desktop's filesystem-api.js hides
 * them), so a project's stable "path" is its source id when it was loaded from a URL / cloud
 * project. Local and file-based projects have no such id; those are identified by the file
 * name derived from the project title. Both values are written into every restore point.
 *
 * @param {Object} props the manager's props
 * @returns {{projectPath: string, projectName: string}} current identity
 */
const getProjectIdentity = props => {
    const title = (props.projectTitle || '').trim();
    const projectName = `${title || 'Untitled'}.sb3`;
    const projectId = props.projectId;
    const projectPath = (projectId != null && String(projectId) !== DEFAULT_PROJECT_ID) ?
        `project:${projectId}` : '';
    return {projectPath, projectName};
};

const normalizeFileName = name => (name || '').trim().toLowerCase();

/**
 * Path wins: the same source id means the same project even after a rename. Only when the path
 * differs (saved somewhere else, moved, or unavailable) do we fall back to the file name.
 * Restore points saved before these fields existed have no projectName, so their old `title`
 * is used as the file name -- otherwise upgrading would hide every existing restore point.
 *
 * @param {Object} restorePoint metadata from the API
 * @param {Object} identity current project identity
 * @returns {boolean} whether this restore point belongs to the current file
 */
const isCurrentProjectRestorePoint = (restorePoint, identity) => {
    if (identity.projectPath && restorePoint.projectPath === identity.projectPath) {
        return true;
    }
    const storedName = restorePoint.projectName || `${restorePoint.title || ''}.sb3`;
    return normalizeFileName(storedName) === normalizeFileName(identity.projectName);
};

const messages = defineMessages({
    confirmLoad: {
        defaultMessage: 'You have unsaved changes. Replace existing project?',
        description: 'Confirmation that appears when loading a restore point to confirm overwriting unsaved changes.',
        id: 'tw.restorePoints.confirmLoad'
    },
    confirmDelete: {
        defaultMessage: 'Are you sure you want to delete "{projectTitle}"? This cannot be undone.',
        description: 'Confirmation that appears when deleting a restore poinnt',
        id: 'tw.restorePoints.confirmDelete'
    },
    confirmDeleteAll: {
        defaultMessage: 'Are you sure you want to delete ALL restore points? This cannot be undone.',
        description: 'Confirmation that appears when deleting ALL restore points.',
        id: 'tw.restorePoints.confirmDeleteAll'
    },
    loadError: {
        defaultMessage: 'Error loading restore point: {error}',
        description: 'Error message when a restore point could not be loaded',
        id: 'tw.restorePoints.error'
    },
    exportError: {
        defaultMessage: 'Error exporting restore point: {error}',
        description: 'Error message when a restore point could not be exported',
        id: 'tw.restorePoints.exportError'
    }
});

class TWRestorePointManager extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleProjectChanged',
            'handleClickCreate',
            'handleClickDelete',
            'handleClickDeleteAll',
            'handleChangeInterval',
            'handleChangeNote',
            'handleChangeScope',
            'handleClickExport',
            'handleClickLoad',
            'isExportingRestorePoint'
        ]);
        this.state = {
            loading: true,
            totalSize: 0,
            restorePoints: [],
            error: null,
            interval: RestorePointAPI.readInterval(),
            exportingRestorePoints: [],
            note: '',
            scope: RestorePointAPI.readScope()
        };
        this.timeout = null;
    }

    componentDidMount () {
        // This helps reduce problems when people constantly enter and leave the editor which
        // causes this component to re-mount. Still not perfect though, ideally we would
        // compensate for time already passed.
        if (this.props.projectChanged && this.props.hasEverEnteredEditor) {
            this.queueRestorePoint();
        }

        RestorePointAPI.deleteLegacyRestorePoint();
        this.props.vm.on('PROJECT_CHANGED', this.handleProjectChanged);
    }

    componentWillReceiveProps (nextProps) {
        if (nextProps.isModalVisible && !this.props.isModalVisible) {
            this.refreshState();
        } else if (!nextProps.isModalVisible && this.props.isModalVisible) {
            this.setState({
                restorePoints: []
            });
        }
    }

    componentWillUnmount () {
        this.cancelQueuedRestorePoint();
        this.props.vm.off('PROJECT_CHANGED', this.handleProjectChanged);
    }

    handleProjectChanged () {
        if (this.props.hasEverEnteredEditor && !this.timeout) {
            this.queueRestorePoint();
        }
    }

    handleClickCreate (note) {
        this.createRestorePoint(RestorePointAPI.TYPE_MANUAL, note || '')
            .catch(error => {
                this.handleModalError(error);
            });
    }

    handleChangeNote (e) {
        this.setState({
            note: e.target.value
        });
    }

    handleChangeScope (scope) {
        RestorePointAPI.setScope(scope);
        this.setState({
            scope
        });
    }

    async handleClickDelete (id) {
        const projectTitle = this.state.restorePoints.find(i => i.id === id).title;
        if (!(await guiConfirm({content: this.props.intl.formatMessage(messages.confirmDelete, {projectTitle})}))) {
            return;
        }

        this.setState({
            loading: true
        });
        RestorePointAPI.deleteRestorePoint(id)
            .then(() => {
                this.refreshState();
            })
            .catch(error => {
                this.handleModalError(error);
            });
    }

    async handleClickDeleteAll () {
        if (!(await guiConfirm({content: this.props.intl.formatMessage(messages.confirmDeleteAll)}))) {
            return;
        }

        this.setState({
            loading: true
        });
        RestorePointAPI.deleteAllRestorePoints()
            .then(() => {
                this.refreshState();
            })
            .catch(error => {
                this.handleModalError(error);
            });
    }

    async canLoadProject () {
        if (!this.props.isShowingProject) {
            // Loading a project now will break the state machine
            return false;
        }
        if (this.props.projectChanged && !(await guiConfirm({content: this.props.intl.formatMessage(messages.confirmLoad)}))) {
            return false;
        }
        return true;
    }

    handleClickExport (id) {
        if (this.isExportingRestorePoint(id)) {
            return;
        }

        this.setState(oldState => ({
            exportingRestorePoints: [...oldState.exportingRestorePoints, id]
        }));

        const removeFromExportingList = () => {
            this.setState(oldState => ({
                exportingRestorePoints: oldState.exportingRestorePoints.filter(i => i !== id)
            }));
        };

        RestorePointAPI.exportRestorePoint(id)
            .then(result => {
                downloadBlob(`${result.title}.sb3`, result.blob);
                removeFromExportingList();
            })
            .catch(error => {
                log.error(error);
                guiAlert({content: this.props.intl.formatMessage(messages.exportError, {
                    error
                })});
                removeFromExportingList();
            });
    }

    isExportingRestorePoint (id) {
        return this.state.exportingRestorePoints.includes(id);
    }

    async handleClickLoad (id) {
        if (!(await this.canLoadProject())) {
            return;
        }

        this.props.onCloseModal();
        this.props.onStartLoadingRestorePoint(this.props.loadingState);

        RestorePointAPI.loadRestorePoint(this.props.vm, id)
            .then(() => {
                this.props.onFinishLoadingRestorePoint(true, this.props.loadingState);
                setTimeout(() => {
                    this.props.vm.renderer.draw();
                });
            })
            .catch(error => {
                log.error(error);
                guiAlert({content: this.props.intl.formatMessage(messages.loadError, {
                    error
                })});
                this.props.onFinishLoadingRestorePoint(false, this.props.loadingState);
            });
    }

    handleChangeInterval (e) {
        const interval = +e.target.value;
        RestorePointAPI.setInterval(interval);
        this.setState({
            interval
        }, () => {
            if (this.timeout) {
                this.cancelQueuedRestorePoint();
                this.queueRestorePoint();
            }
        });
    }

    queueRestorePoint () {
        if (this.timeout || this.state.interval < 0) {
            return;
        }
        this.timeout = setTimeout(() => {
            this.createRestorePoint(RestorePointAPI.TYPE_AUTOMATIC).then(() => {
                this.timeout = null;
            });
        }, this.state.interval);
    }

    cancelQueuedRestorePoint () {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }

    createRestorePoint (type, note = '') {
        if (this.props.isModalVisible) {
            this.setState({
                loading: true
            });
        }

        this.props.onStartCreatingRestorePoint();
        return Promise.all([
            // Wait a little bit before saving so UI can update before saving, which can cause stutter
            sleep(SAVE_DELAY)
                .then(() => RestorePointAPI.createRestorePoint(this.props.vm, this.props.projectTitle, type, {
                    // Read the identity at write time: the project can be replaced during the delay.
                    ...getProjectIdentity(this.props),
                    note
                }))
                .then(() => RestorePointAPI.removeExtraneousRestorePoints()),

            // Force saves to not be instant so people can see that we're making a restore point
            // It also makes refreshes less likely to cause accidental clicks in the modal
            sleep(MINIMUM_SAVE_TIME)
        ])
            .then(() => {
                this.props.onFinishCreatingRestorePoint();
                if (type === RestorePointAPI.TYPE_MANUAL) {
                    // Only drop the draft once the manual restore point actually exists.
                    this.setState({note: ''});
                }
                if (this.props.isModalVisible) {
                    this.refreshState();
                }
            })
            .catch(error => {
                log.error(error);
                this.props.onErrorCreatingRestorePoint();
                if (this.props.isModalVisible) {
                    this.refreshState();
                }
            });
    }

    refreshState () {
        this.setState({
            loading: true,
            error: null,
            restorePoints: []
        });
        RestorePointAPI.getAllRestorePoints()
            .then(data => {
                this.setState({
                    loading: false,
                    totalSize: data.totalSize,
                    restorePoints: data.restorePoints
                });
            })
            .catch(error => {
                this.handleModalError(error);
            });
    }

    handleModalError (error) {
        log.error('Restore point error', error);
        this.setState({
            error: `${error}`,
            loading: false
        });
    }

    render () {
        if (this.props.isModalVisible) {
            const showCurrentOnly = this.state.scope === RestorePointAPI.SCOPE_CURRENT;
            const identity = getProjectIdentity(this.props);
            const visibleRestorePoints = showCurrentOnly ?
                this.state.restorePoints.filter(point => isCurrentProjectRestorePoint(point, identity)) :
                this.state.restorePoints;
            return (
                <TWRestorePointModal
                    onClose={this.props.onCloseModal}
                    onClickCreate={this.handleClickCreate}
                    onClickDelete={this.handleClickDelete}
                    onClickDeleteAll={this.handleClickDeleteAll}
                    onClickExport={this.handleClickExport}
                    onClickLoad={this.handleClickLoad}
                    interval={this.state.interval}
                    onChangeInterval={this.handleChangeInterval}
                    note={this.state.note}
                    onChangeNote={this.handleChangeNote}
                    scope={this.state.scope}
                    onChangeScope={this.handleChangeScope}
                    hasAnyRestorePoints={this.state.restorePoints.length > 0}
                    showSource={!showCurrentOnly}
                    isExporting={this.isExportingRestorePoint}
                    isLoading={this.state.loading}
                    totalSize={this.state.totalSize}
                    restorePoints={visibleRestorePoints}
                    error={this.state.error}
                />
            );
        }
        return null;
    }
}

TWRestorePointManager.propTypes = {
    intl: intlShape,
    projectChanged: PropTypes.bool.isRequired,
    projectTitle: PropTypes.string.isRequired,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onStartCreatingRestorePoint: PropTypes.func.isRequired,
    onFinishCreatingRestorePoint: PropTypes.func.isRequired,
    onErrorCreatingRestorePoint: PropTypes.func.isRequired,
    onStartLoadingRestorePoint: PropTypes.func.isRequired,
    onFinishLoadingRestorePoint: PropTypes.func.isRequired,
    onCloseModal: PropTypes.func.isRequired,
    loadingState: PropTypes.oneOf(LoadingStates).isRequired,
    isShowingProject: PropTypes.bool.isRequired,
    isModalVisible: PropTypes.bool.isRequired,
    hasEverEnteredEditor: PropTypes.bool.isRequired,
    vm: PropTypes.shape({
        on: PropTypes.func.isRequired,
        off: PropTypes.func.isRequired,
        loadProject: PropTypes.func.isRequired,
        stop: PropTypes.func.isRequired,
        renderer: PropTypes.shape({
            draw: PropTypes.func.isRequired
        })
    }).isRequired
};

const mapStateToProps = state => ({
    projectChanged: state.scratchGui.projectChanged,
    projectTitle: state.scratchGui.projectTitle,
    projectId: state.scratchGui.projectState.projectId,
    loadingState: state.scratchGui.projectState.loadingState,
    isShowingProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
    isModalVisible: state.scratchGui.modals.restorePointModal,
    hasEverEnteredEditor: state.scratchGui.mode.hasEverEnteredEditor,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onStartCreatingRestorePoint: () => dispatch(showStandardAlert('twCreatingRestorePoint')),
    onFinishCreatingRestorePoint: () => showAlertWithTimeout(dispatch, 'twRestorePointSuccess'),
    onErrorCreatingRestorePoint: () => showAlertWithTimeout(dispatch, 'twRestorePointError'),
    onStartLoadingRestorePoint: loadingState => {
        dispatch(openLoadingProject());
        dispatch(requestProjectUpload(loadingState));
    },
    onFinishLoadingRestorePoint: (success, loadingState) => {
        dispatch(onLoadedProject(loadingState, false, success));
        dispatch(closeLoadingProject());
        dispatch(setFileHandle(null));
    },
    onCloseModal: () => dispatch(closeRestorePointModal())
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(TWRestorePointManager));
