import React from 'react';
import {FormattedMessage, injectIntl, intlShape, defineMessages} from 'react-intl';
import {connect} from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './loader.css';
import {getIsLoadingWithId} from '../../reducers/project-state';
// 勾线 + 填充 logo 动画（<style> + <svg> 的内联片段），与启动 splash 页共用同一份
import splashLogo from '../../playground/splash-logo.js';
// 高级设置里的「加载时播放 logo 动画」开关
import {
    getSetting,
    onSettingsChange,
    SETTING_LOADING_ANIMATION
} from '../../lib/hypermimic-settings.js';

const mainMessages = {
    'gui.loader.headline': (
        <FormattedMessage
            defaultMessage="Loading Project"
            description="Main loading message"
            id="gui.loader.headline"
        />
    ),
    'gui.loader.creating': (
        <FormattedMessage
            defaultMessage="Creating Project"
            description="Main creating message"
            id="gui.loader.creating"
        />
    )
};

const messages = defineMessages({
    projectData: {
        defaultMessage: 'Loading project …',
        description: 'Appears when loading project data, but not assets yet',
        id: 'tw.loader.projectData'
    },
    downloadingAssets: {
        defaultMessage: 'Downloading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project on a remote website',
        id: 'tw.loader.downloadingAssets'
    },
    loadingAssets: {
        defaultMessage: 'Loading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project file on the user\'s computer',
        id: 'tw.loader.loadingAssets'
    }
});

// Because progress events are fired so often during the very performance-critical loading
// process and React updates are very slow, we bypass React for updating the progress bar.

class LoaderComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAssetProgress',
            'handleProjectLoaded',
            'handleSettingsChange',
            'barInnerRef',
            'messageRef'
        ]);
        this.barInnerEl = null;
        this.messageEl = null;
        this.ignoreProgress = false;
        this.unsubscribeSettings = null;
        this.state = {
            // 关掉后只留标题与进度条（见 lib/hypermimic-settings.js 的 loadingAnimation）
            playLogo: getSetting(SETTING_LOADING_ANIMATION)
        };
    }
    componentDidMount () {
        this.handleAssetProgress(
            this.props.vm.runtime.finishedAssetRequests,
            this.props.vm.runtime.totalAssetRequests
        );
        this.props.vm.on('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.on('PROJECT_LOADED', this.handleProjectLoaded);
        this.unsubscribeSettings = onSettingsChange(this.handleSettingsChange);
    }
    componentWillUnmount () {
        this.props.vm.off('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.off('PROJECT_LOADED', this.handleProjectLoaded);
        if (this.unsubscribeSettings) {
            this.unsubscribeSettings();
            this.unsubscribeSettings = null;
        }
    }
    handleSettingsChange (key, value) {
        if (key === SETTING_LOADING_ANIMATION && value !== this.state.playLogo) {
            this.setState({playLogo: value});
        }
    }
    handleAssetProgress (finished, total) {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) {
            return;
        }

        if (total === 0) {
            // Started loading a new project.
            this.barInnerEl.style.width = '0';
            this.messageEl.textContent = this.props.intl.formatMessage(messages.projectData);
        } else {
            this.barInnerEl.style.width = `${finished / total * 100}%`;
            const message = this.props.isRemote ? messages.downloadingAssets : messages.loadingAssets;
            this.messageEl.textContent = this.props.intl.formatMessage(message, {
                complete: finished,
                total
            });
        }
    }
    handleProjectLoaded () {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) {
            return;
        }

        this.ignoreProgress = true;
        this.props.vm.runtime.resetProgress();
    }
    barInnerRef (barInner) {
        this.barInnerEl = barInner;
    }
    messageRef (message) {
        this.messageEl = message;
    }
    render () {
        return (
            <div
                className={classNames(styles.background, {
                    [styles.fullscreen]: this.props.isFullScreen
                }, {
                    [styles.fadeOut]: this.props.isExiting
                }, this.props.className)}
            >
                <div className={styles.container}>
                    {/* splashLogo 自带一个 <style> 与 <svg>，全局类名 .splash-logo 未被 CSS Modules 哈希，
                        所以这里直接内联注入；尺寸/时长的覆写见 loader.css 的 .block-animation。
                        关掉开关时整块不渲染（连同它的 <style> 一起从 DOM 移除）。 */}
                    {this.state.playLogo ? (
                        <div
                            className={styles.blockAnimation}
                            dangerouslySetInnerHTML={{__html: splashLogo}}
                        />
                    ) : null}

                    <div className={styles.title}>
                        {mainMessages[this.props.messageId]}
                    </div>

                    <div
                        className={styles.message}
                        ref={this.messageRef}
                    />

                    <div className={styles.barOuter}>
                        <div
                            className={styles.barInner}
                            ref={this.barInnerRef}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

LoaderComponent.propTypes = {
    intl: intlShape,
    isFullScreen: PropTypes.bool,
    isRemote: PropTypes.bool,
    messageId: PropTypes.string,
    vm: PropTypes.shape({
        on: PropTypes.func,
        off: PropTypes.func,
        runtime: PropTypes.shape({
            totalAssetRequests: PropTypes.number,
            finishedAssetRequests: PropTypes.number,
            resetProgress: PropTypes.func,
            on: PropTypes.func,
            off: PropTypes.func
        })
    })
};
LoaderComponent.defaultProps = {
    isFullScreen: false,
    messageId: 'gui.loader.headline'
};

const mapStateToProps = state => ({
    isRemote: getIsLoadingWithId(state.scratchGui.projectState.loadingState),
    vm: state.scratchGui.vm
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(injectIntl(LoaderComponent));
