import React from 'react';
import {ContextMenu, MenuItem, ContextMenuTrigger as RawContextMenuTrigger} from 'react-contextmenu';
import classNames from 'classnames';

import {getSetting, SETTING_DISABLE_GUI_CONTEXT_MENU} from '../../lib/hypermimic-settings.js';
import styles from './context-menu.css';

const StyledContextMenu = props => (
    <ContextMenu
        {...props}
        className={styles.contextMenu}
    />
);

// Wraps react-contextmenu's trigger so the "hold to display" (long-press) behavior can be
// disabled through a HyperMimic setting. holdToDisplay < 0 disables the timer entirely, while
// the contextmenu (right-click) event still opens the menu as usual.
// Callers such as sprite-selector-item pass a ref and read `.elem` from the trigger instance,
// so the ref has to be forwarded to the underlying class component; a plain function component
// would silently drop it (and React logs "Function components cannot be given refs").
const StyledContextMenuTrigger = React.forwardRef((props, ref) => (
    <RawContextMenuTrigger
        {...props}
        ref={ref}
        holdToDisplay={
            getSetting(SETTING_DISABLE_GUI_CONTEXT_MENU)
                ? -1
                : (typeof props.holdToDisplay === 'number' ? props.holdToDisplay : undefined)
        }
    />
));
StyledContextMenuTrigger.displayName = 'StyledContextMenuTrigger';

const StyledMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{className: styles.menuItem}}
    />
);

const BorderedMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{className: classNames(styles.menuItem, styles.menuItemBordered)}}
    />
);

const DangerousMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{className: classNames(styles.menuItem, styles.menuItemBordered, styles.menuItemDanger)}}
    />
);


export {
    BorderedMenuItem,
    DangerousMenuItem,
    StyledContextMenu as ContextMenu,
    StyledMenuItem as MenuItem,
    StyledContextMenuTrigger as ContextMenuTrigger
};
