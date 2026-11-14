import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import styles from './select.css';

// How long the exit animation runs before the list is unmounted (matches the
// hm-dropdown-out duration in the consumers' stylesheets).
const EXIT_MS = 140;

/**
 * Keeps a list mounted for the exit animation after `open` goes false.
 * Returns [mounted, closing]; `closing` is true during the fade-out so the
 * caller can add the closing class.
 * @param {boolean} open whether the dropdown is open
 * @returns {[boolean, boolean]}
 */
export const useMountTransition = open => {
    const [mounted, setMounted] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    React.useEffect(() => {
        if (open) {
            setClosing(false);
            setMounted(true);
            return undefined;
        }
        if (!mounted) return undefined;
        setClosing(true);
        const timer = setTimeout(() => {
            setMounted(false);
            setClosing(false);
        }, EXIT_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    return [mounted, closing];
};

/**
 * Measures the anchor element while the dropdown is open, following scroll,
 * resize and pointer movement (the editor zoom scales the panel mid-drag).
 * @param {boolean} open whether the dropdown is open
 * @param {React.Ref} wrapRef ref of the anchor element
 * @returns {DOMRect|null}
 */
export const useDropdownRect = (open, wrapRef) => {
    const [rect, setRect] = React.useState(null);
    React.useEffect(() => {
        if (!open) return undefined;
        let raf = null;
        const measure = () => {
            const node = wrapRef.current;
            if (node) setRect(node.getBoundingClientRect());
        };
        const handlePointerMove = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = null;
                measure();
            });
        };
        measure();
        window.addEventListener('resize', measure);
        document.addEventListener('scroll', measure, true);
        window.addEventListener('pointermove', handlePointerMove);
        return () => {
            window.removeEventListener('resize', measure);
            document.removeEventListener('scroll', measure, true);
            window.removeEventListener('pointermove', handlePointerMove);
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [open, wrapRef]);
    return rect;
};

/**
 * The HyperMimic custom dropdown: a button that looks like the styled .select
 * plus a portaled list. A native <select>'s popup is drawn by the OS and can
 * carry neither the theme nor the shadow, so every dropdown in the modals goes
 * through this component.
 *
 * @param {object} props
 * @param {string} [props.className] extra class(es) for the closed button
 * @param {string} props.value the selected value
 * @param {Array<{value: string, label: React.Node}>} props.options
 * @param {function(string)} props.onChange called with the picked value
 * @param {string} [props.ariaLabel]
 * @returns {React.Element}
 */
const HmSelect = ({className, value, options, onChange, ariaLabel}) => {
    const [open, setOpen] = React.useState(false);
    const [listMounted, listClosing] = useMountTransition(open);
    const wrapRef = React.useRef(null);
    const listRef = React.useRef(null);
    const rect = useDropdownRect(open, wrapRef);

    React.useEffect(() => {
        if (!open) return undefined;
        const close = e => {
            if (wrapRef.current && wrapRef.current.contains(e.target)) return;
            if (listRef.current && listRef.current.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = e => {
            if (e.key === 'Escape') setOpen(false);
        };
        // Scrolling anywhere outside the list collapses the dropdown; wheeling
        // INSIDE the list is scrolling its own content and must not close it.
        const onWheel = e => {
            if (listRef.current && listRef.current.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', close, true);
        document.addEventListener('keydown', onKey);
        document.addEventListener('wheel', onWheel, {passive: true});
        return () => {
            document.removeEventListener('mousedown', close, true);
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('wheel', onWheel);
        };
    }, [open]);

    // A list sized by its longest option can be wider than the button. Shift it
    // left when it would cross the viewport's right edge, like a native select
    // popup does, instead of letting the extra width be clipped.
    React.useLayoutEffect(() => {
        if (!listMounted || !rect || !listRef.current) return;
        const el = listRef.current;
        // React only rewrites left when rect.left changes, so start from that
        // baseline on every measurement (window resize / scroll / pointermove).
        el.style.left = `${rect.left}px`;
        const margin = 8;
        const overflow = el.getBoundingClientRect().right - (window.innerWidth - margin);
        if (overflow > 0) {
            el.style.left = `${Math.max(margin, rect.left - overflow)}px`;
        }
    }, [listMounted, rect]);

    const current = options.find(option => option.value === value);

    return (
        <div
            className={styles.wrap}
            ref={wrapRef}
        >
            <button
                type="button"
                aria-label={ariaLabel}
                className={classNames(styles.select, styles.button, className, {
                    [styles.open]: open
                })}
                onClick={() => setOpen(prevState => !prevState)}
            >
                {current ? current.label : value}
            </button>
            {listMounted && rect && ReactDOM.createPortal(
                <div
                    className={classNames(styles.list, {
                        [styles.closing]: listClosing
                    })}
                    style={{
                        left: `${rect.left}px`,
                        top: `${rect.bottom + 4}px`,
                        // The list grows to fit its longest label; the button is
                        // only the minimum width (see .list width: max-content).
                        minWidth: `${rect.width}px`
                    }}
                    ref={listRef}
                >
                    {options.map(option => (
                        <button
                            type="button"
                            key={option.value}
                            className={classNames(styles.item, {
                                [styles.itemActive]: option.value === value
                            })}
                            // Keep the press from closing the dropdown first.
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

HmSelect.propTypes = {
    className: PropTypes.string,
    value: PropTypes.string.isRequired,
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string.isRequired,
        label: PropTypes.node.isRequired
    })).isRequired,
    onChange: PropTypes.func.isRequired,
    ariaLabel: PropTypes.string
};

export default HmSelect;
