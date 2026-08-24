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
            applyGuiColors(props.reduxTheme);
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
