import PropTypes from 'prop-types';
import React from 'react';

import MenuComponent from '../components/menu/menu.jsx';
import styles from '../components/menu/menu.css';
import prefersReducedMotion from '../lib/prefers-reduced-motion.js';

// Keep in sync with the open/close animations in components/menu/menu.css.
// Mirrors the modal close animation: the menu stays mounted for the exit
// animation, and only unmounts once it has finished playing.
const CLOSE_ANIMATION_DURATION = 170;

const Menu = ({open, children, ...props}) => {
    const [mounted, setMounted] = React.useState(open);
    const [closing, setClosing] = React.useState(false);
    const closeTimer = React.useRef(null);

    // Clear the pending close timer if this menu is ever unmounted for real.
    React.useEffect(() => () => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    React.useEffect(() => {
        if (open) {
            if (closeTimer.current) {
                clearTimeout(closeTimer.current);
                closeTimer.current = null;
            }
            setMounted(true);
            setClosing(false);
        } else if (mounted && !closing) {
            // Closing: play the exit animation, then unmount after it finishes.
            if (prefersReducedMotion()) {
                setMounted(false);
                setClosing(false);
                return;
            }
            setClosing(true);
            closeTimer.current = setTimeout(() => {
                setMounted(false);
                setClosing(false);
                closeTimer.current = null;
            }, CLOSE_ANIMATION_DURATION);
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!mounted) {
        return null;
    }
    return (
        <MenuComponent
            {...props}
            className={closing ? styles.menuClosing : styles.menuOpening}
        >
            {children}
        </MenuComponent>
    );
};

Menu.propTypes = {
    children: PropTypes.node,
    open: PropTypes.bool.isRequired
};

export default Menu;
