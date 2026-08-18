import PropTypes from 'prop-types';
import React from 'react';
import Menu from '../../containers/menu.jsx';

const MenuBarMenu = ({
    children,
    className,
    open,
    place = 'right',
    menuName
}) => (
    <div className={className}>
        <Menu
            open={open}
            place={place}
            menuName={menuName}
        >
            {children}
        </Menu>
    </div>
);

MenuBarMenu.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    open: PropTypes.bool,
    place: PropTypes.oneOf(['left', 'right']),
    menuName: PropTypes.string
};

export default MenuBarMenu;
