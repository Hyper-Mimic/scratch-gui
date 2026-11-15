import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import LanguageMenu from './language-menu.jsx';
import MenuBarMenu from './menu-bar-menu.jsx';
import {MenuItem, MenuSection, Submenu} from '../menu/menu.jsx';
import MenuLabel from './tw-menu-label.jsx';
import TWAccentThemeMenu from './tw-theme-accent.jsx';
import TWGuiThemeMenu from './tw-theme-gui.jsx';
import TWBlocksThemeMenu from './tw-theme-blocks.jsx';
import TWDesktopSettings from './tw-desktop-settings.jsx';

import menuBarStyles from './menu-bar.css';
import styles from './settings-menu.css';

import aboutIcon from './icon--about.svg';
import dropdownCaret from './dropdown-caret.svg';
import settingsIcon from './icon--settings.svg';

const SettingsMenu = ({
    aboutMenu,
    canChangeLanguage,
    canChangeTheme,
    isRtl,
    onClickDesktopSettings,
    onOpenCustomSettings,
    onOpenCustomAccentSettings,
    onRequestClose,
    onRequestOpen,
    settingsMenuOpen
}) => {
    const aboutLabel = (
        <FormattedMessage
            defaultMessage="About"
            description="About submenu in the settings menu"
            id="tw.menuBar.about"
        />
    );
    // The desktop app used to render its About menu as a separate icon button on the far right
    // of the menu bar. It now lives here as one submenu row. `aboutMenu` is either the array of
    // {title, onClick} entries the desktop passes, or a single callback (legacy button mode).
    const aboutItems = Array.isArray(aboutMenu) ? aboutMenu : (
        typeof aboutMenu === 'function' ? [{title: aboutLabel, onClick: aboutMenu}] : []
    );
    const wrapAboutClick = onClick => () => {
        if (typeof onClick === 'function') onClick();
        onRequestClose();
    };
    return (
        <MenuLabel
            open={settingsMenuOpen}
            onOpen={onRequestOpen}
            onClose={onRequestClose}
        >
            <img
                src={settingsIcon}
                draggable={false}
                width={20}
                height={20}
            />
            <span className={styles.dropdownLabel}>
                <FormattedMessage
                    defaultMessage="Settings"
                    description="Settings menu"
                    id="gui.menuBar.settings"
                />
            </span>
            <img
                src={dropdownCaret}
                className="twmenucaret"
                draggable={false}
                width={8}
                height={5}
            />
            <MenuBarMenu
                className={menuBarStyles.menuBarMenu}
                open={settingsMenuOpen}
                place={isRtl ? 'left' : 'right'}
                menuName='settings'
            >
                <MenuSection>
                    {canChangeLanguage && <LanguageMenu onRequestCloseSettings={onRequestClose} />}
                    {canChangeTheme && (
                        <React.Fragment>
                            <TWGuiThemeMenu />
                            <TWBlocksThemeMenu
                                onOpenCustomSettings={onOpenCustomSettings}
                            />
                            <TWAccentThemeMenu
                                onOpenCustomSettings={onOpenCustomAccentSettings}
                            />
                        </React.Fragment>
                    )}
                    {onClickDesktopSettings && <TWDesktopSettings onClick={onClickDesktopSettings} />}
                </MenuSection>
                {aboutItems.length > 0 && (
                    <MenuSection>
                        <MenuItem>
                            <div className={styles.option}>
                                <img
                                    className={`${styles.icon} twabouticon`}
                                    src={aboutIcon}
                                    draggable={false}
                                    width={24}
                                    height={24}
                                    alt=""
                                />
                                <span className={styles.submenuLabel}>{aboutLabel}</span>
                                <img
                                    className={styles.expandCaret}
                                    src={dropdownCaret}
                                    draggable={false}
                                    alt=""
                                />
                            </div>
                            <Submenu place={isRtl ? 'left' : 'right'}>
                                {aboutItems.map(item => (
                                    <MenuItem
                                        key={typeof item.title === 'string' ? item.title : 'about'}
                                        onClick={wrapAboutClick(item.onClick)}
                                    >
                                        {item.title}
                                    </MenuItem>
                                ))}
                            </Submenu>
                        </MenuItem>
                    </MenuSection>
                )}
            </MenuBarMenu>
        </MenuLabel>
    );
};

SettingsMenu.propTypes = {
    aboutMenu: PropTypes.oneOfType([
        PropTypes.func,
        PropTypes.arrayOf(PropTypes.shape({
            title: PropTypes.node,
            onClick: PropTypes.func
        }))
    ]),
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    isRtl: PropTypes.bool,
    onClickDesktopSettings: PropTypes.func,
    onOpenCustomSettings: PropTypes.func,
    onOpenCustomAccentSettings: PropTypes.func,
    onRequestClose: PropTypes.func,
    onRequestOpen: PropTypes.func,
    settingsMenuOpen: PropTypes.bool
};

export default SettingsMenu;
