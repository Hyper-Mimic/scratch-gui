import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import {applyGuiColors} from '../lib/themes/guiHelpers';
import {BLOCKS_CUSTOM, GUI_DARK, GUI_LIGHT, Theme} from '../lib/themes';
import SettingsStore from '../addons/settings-store-singleton';
import {detectTheme, onSystemPreferenceChange} from '../lib/themes/themePersistance';
import {setTheme} from '../reducers/theme';

const TWThemeManagerHOC = function (WrappedComponent) {
    class TWThemeManagerComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleSystemThemeChange',
                'setGuiMode'
            ]);

            let initialTheme = props.reduxTheme;
            // 若 custom-editor-theme 启用，用其 darkMode 设置决定首屏 gui。
            // 否则首屏会先用系统/存储偏好（detectTheme）渲染，等该 addon 异步
            // 加载完成后才切到正确主题，造成"先用旧状态再跳变"的闪烁。
            if (SettingsStore.getAddonEnabled('custom-editor-theme')) {
                const dark = !!SettingsStore.getAddonSetting('custom-editor-theme', 'darkMode');
                const gui = dark ? GUI_DARK : GUI_LIGHT;
                if (initialTheme.gui !== gui) {
                    initialTheme = initialTheme.set('gui', gui);
                }
                // 同步根 color-scheme，避免原生控件（radio/checkbox 等）
                // 在 addon 加载前短暂沿用旧方案而闪烁。
                const scheme = dark ? 'dark' : 'light';
                const root = document.documentElement;
                root.style.setProperty('--color-scheme', scheme);
                root.style.setProperty('color-scheme', scheme);
            }

            applyGuiColors(initialTheme);
            // Bridge for the custom-editor-theme addon: lets it control the GUI
            // dark/light mode while the GUI theme toggle is disabled.
            window.twSetGuiTheme = this.setGuiMode;
        }
        componentDidMount () {
            this.removeListeners = onSystemPreferenceChange(this.handleSystemThemeChange);
        }
        componentDidUpdate (prevProps) {
            if (prevProps.reduxTheme !== this.props.reduxTheme) {
                applyGuiColors(this.props.reduxTheme);
            }
        }
        componentWillUnmount () {
            this.removeListeners();
        }
        setGuiMode (mode) {
            const gui = mode === 'dark' ? GUI_DARK : GUI_LIGHT;
            if (this.props.reduxTheme.gui === gui) return;
            this.props.onChangeTheme(this.props.reduxTheme.set('gui', gui));
        }
        handleSystemThemeChange () {
            // When the custom-editor-theme addon is enabled it fully controls the
            // dark/light mode, so the GUI must not react to OS theme changes.
            if (SettingsStore.getAddonEnabled('custom-editor-theme')) return;
            let newTheme = detectTheme();
            if (this.props.reduxTheme.blocks === BLOCKS_CUSTOM) {
                newTheme = newTheme.set('blocks', BLOCKS_CUSTOM);
            }
            this.props.onChangeTheme(newTheme);
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                reduxTheme,
                onChangeTheme,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }

    TWThemeManagerComponent.propTypes = {
        reduxTheme: PropTypes.instanceOf(Theme),
        onChangeTheme: PropTypes.func
    };

    const mapStateToProps = (state, ownProps) => ({
        // Allow embed page to override theme
        reduxTheme: ownProps.theme || state.scratchGui.theme.theme
    });

    const mapDispatchToProps = dispatch => ({
        onChangeTheme: theme => dispatch(setTheme(theme))
    });

    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(TWThemeManagerComponent);
};

export default TWThemeManagerHOC;
