import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, defineMessages} from 'react-intl';
import {connect} from 'react-redux';

import check from './check.svg';
import dropdownCaret from './dropdown-caret.svg';
import {MenuItem, Submenu} from '../menu/menu.jsx';
import {ACCENT_BLUE, ACCENT_MAP, ACCENT_CUSTOM, ACCENT_PURPLE, ACCENT_ORANGE, ACCENT_RED, ACCENT_RAINBOW, Theme} from '../../lib/themes/index.js';
import {openAccentMenu, accentMenuOpen, closeSettingsMenu} from '../../reducers/menus.js';
import {setTheme} from '../../reducers/theme.js';
import {persistTheme} from '../../lib/themes/themePersistance.js';
import SettingsStore from '../../addons/settings-store-singleton.js';
import rainbowIcon from './tw-accent-rainbow.svg';
import customIcon from './tw-accent-custom.svg';
import openLinkIcon from './tw-open-link.svg';
import styles from './settings-menu.css';

const options = defineMessages({
    [ACCENT_ORANGE]: {
        defaultMessage: 'HyperMimic Orange',
        description: 'Name of the HyperMimic Orange color scheme, used by HyperMimic by default.',
        id: 'hm.accent.hmOrange'
    },
    [ACCENT_RED]: {
        defaultMessage: 'Red',
        description: 'Name of the red color scheme, used by TurboWarp by default.',
        id: 'tw.accent.red'
    },
    [ACCENT_PURPLE]: {
        defaultMessage: 'Purple',
        description: 'Name of the purple color scheme. Matches modern Scratch.',
        id: 'tw.accent.purple'
    },
    [ACCENT_BLUE]: {
        defaultMessage: 'Blue',
        description: 'Name of the blue color scheme. Matches Scratch before the high contrast update.',
        id: 'tw.accent.blue'
    },
    [ACCENT_RAINBOW]: {
        defaultMessage: 'Rainbow',
        description: 'Name of color scheme that uses a rainbow.',
        id: 'tw.accent.rainbow'
    },
    [ACCENT_CUSTOM]: {
        defaultMessage: 'Customize in Addon Settings',
        description: 'Link in accent color list to open addon settings for more customization',
        id: 'hm.accent.custom'
    }
});

const icons = {
    [ACCENT_RAINBOW]: rainbowIcon,
    [ACCENT_CUSTOM]: customIcon
};

const ColorIcon = props => (
    icons[props.id] ? (
        <img
            className={classNames(styles.accentIconOuter, {[styles.accentIconOuterCustom]: props.id === ACCENT_CUSTOM}, {['sa-settings-custom-icon']: props.id === ACCENT_CUSTOM})}
            src={icons[props.id]}
            draggable={false}
            // Image is decorative
            alt=""
        />
    ) : (
        <div
            className={styles.accentIconOuter}
            style={{
                // menu-bar-background is var(...), don't want to evaluate with the current values
                backgroundColor: ACCENT_MAP[props.id].guiColors['looks-secondary'],
                backgroundImage: ACCENT_MAP[props.id].guiColors['menu-bar-background-image']
            }}
        />
    )
);

ColorIcon.propTypes = {
    id: PropTypes.string
};

const AccentMenuItem = props => (
    <MenuItem onClick={props.disabled ? null : props.onClick}>
        <div className={classNames(styles.option, {[styles.disabled]: props.disabled})}>
            <img
                className={classNames(styles.check, {[styles.selected]: props.isSelected})}
                width={15}
                height={12}
                src={check}
                draggable={false}
            />
            <ColorIcon id={props.id} />
            <FormattedMessage {...options[props.id]} />
            {props.id === ACCENT_CUSTOM && (
                <img
                    width={20}
                    height={20}
                    className={`${styles.openLink} sa-settings-open-link`}
                    src={openLinkIcon}
                    draggable={false}
                />
            )}
        </div>
    </MenuItem>
);

AccentMenuItem.propTypes = {
    id: PropTypes.string,
    isSelected: PropTypes.bool,
    onClick: PropTypes.func,
    disabled: PropTypes.bool
};

const AccentThemeMenu = ({
    isOpen,
    isRtl,
    onChangeTheme,
    onOpen,
    onOpenCustomSettings,
    theme
}) => {
    const addonEnabled = SettingsStore.getAddonEnabled('custom-editor-theme');
    // Always show "Customize in Addon Settings" (mirrors the Block Colors menu),
    // regardless of whether the addon is enabled.
    const showCustom = !!onOpenCustomSettings;
    const accentItems = Object.keys(options).filter(item => item !== ACCENT_CUSTOM);
    return (
        <MenuItem expanded={isOpen}>
            <div
                className={styles.option}
                onClick={onOpen}
            >
                <ColorIcon id={addonEnabled ? ACCENT_CUSTOM : theme.accent} />
                <span className={styles.submenuLabel}>
                    <FormattedMessage
                        defaultMessage="Accent"
                        description="Label for menu to choose accent color (eg.HyperMimic's orange, TurboWarp's red, Scratch's purple)"
                        id="tw.menuBar.accent"
                    />
                </span>
                <img
                    className={styles.expandCaret}
                    src={dropdownCaret}
                    draggable={false}
                />
            </div>
            <Submenu place={isRtl ? 'left' : 'right'}>
                {accentItems.map(item => (
                    <AccentMenuItem
                        key={item}
                        id={item}
                        isSelected={!addonEnabled && theme.accent === item}
                        disabled={addonEnabled}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => onChangeTheme(theme.set('accent', item))}
                    />
                ))}
                {showCustom && (
                    <AccentMenuItem
                        key={ACCENT_CUSTOM}
                        id={ACCENT_CUSTOM}
                        isSelected={addonEnabled}
                        onClick={onOpenCustomSettings}
                    />
                )}
            </Submenu>
        </MenuItem>
    );
};

AccentThemeMenu.propTypes = {
    isOpen: PropTypes.bool,
    isRtl: PropTypes.bool,
    onChangeTheme: PropTypes.func,
    onOpen: PropTypes.func,
    onOpenCustomSettings: PropTypes.func,
    theme: PropTypes.instanceOf(Theme)
};

const mapStateToProps = state => ({
    isOpen: accentMenuOpen(state),
    isRtl: state.locales.isRtl,
    theme: state.scratchGui.theme.theme
});

const mapDispatchToProps = dispatch => ({
    onChangeTheme: theme => {
        dispatch(setTheme(theme));
        dispatch(closeSettingsMenu());
        persistTheme(theme);
    },
    onOpen: () => dispatch(openAccentMenu())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(AccentThemeMenu);
