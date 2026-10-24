import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './fonts-modal.css';
import FontDropdownItem from './font-dropdown-item.jsx';

class FontName extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'setInputRef',
            'handleChange',
            'handleFocus',
            'handleBlur',
            'handleResize',
            'handlePointerMove',
            'updateRect',
            'handleSelectFont',
            'handleKeyDown'
        ]);
        this.state = {
            focused: false,
            rect: null,
            localFonts: []
        };
        // Pending animation frame for the pointer-driven repositioning.
        this.rafId = null;
    }

    componentDidMount () {
        window.addEventListener('resize', this.handleResize);
        // The list is positioned against the viewport, so it has to follow when the modal body (or
        // anything else) scrolls underneath it. Scroll events do not bubble, so this listens in the
        // capture phase to catch every scroller.
        document.addEventListener('scroll', this.handleResize, true);
        // The modal can be dragged around (HyperMimic's window-modal setting), and the list lives
        // in a portal on <body>, so nothing would move it with the modal. Following the pointer
        // while it is focused keeps the two together.
        window.addEventListener('pointermove', this.handlePointerMove);

        // Chrome-only API
        if (typeof queryLocalFonts === 'function') {
            // eslint-disable-next-line no-undef
            queryLocalFonts().then(fonts => {
                const uniqueFamilies = [...new Set(fonts.map(i => i.family))];
                this.setState({
                    localFonts: uniqueFamilies
                });
            });
        }
    }

    componentWillUnmount () {
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('scroll', this.handleResize, true);
        window.removeEventListener('pointermove', this.handlePointerMove);
        if (this.rafId) {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    setInputRef (input) {
        this.input = input;

        // can't use autoFocus because handleFocus relies on the ref existing already
        if (input) {
            input.focus();
        }
    }

    handleChange (e) {
        this.props.onChange(e.target.value);
    }

    handleFocus () {
        this.setState({
            focused: true,
            rect: this.input.getBoundingClientRect()
        });
    }

    handleBlur () {
        const sanitizedName = this.props.isCustom ? (
            this.props.fontManager.getUnusedCustomFont(this.props.name)
        ) : (
            this.props.fontManager.getUnusedSystemFont(this.props.name)
        );
        this.props.onChange(sanitizedName);
        this.setState({
            focused: false
        });
    }

    handleResize () {
        if (this.state.focused) {
            this.setState({
                rect: this.input.getBoundingClientRect()
            });
        }
    }

    /**
     * Re-measure the input on the next frame, at most once per frame: the pointer fires far more
     * often than the screen refreshes, and every update re-renders the list.
     */
    handlePointerMove () {
        if (!this.state.focused || this.rafId) return;
        this.rafId = window.requestAnimationFrame(() => {
            this.rafId = null;
            this.updateRect();
        });
    }

    updateRect () {
        if (!this.input || !this.state.focused) return;
        const rect = this.input.getBoundingClientRect();
        // Nothing moved: skip the re-render.
        if (this.state.rect &&
            this.state.rect.left === rect.left &&
            this.state.rect.top === rect.top &&
            this.state.rect.width === rect.width) {
            return;
        }
        this.setState({rect});
    }

    handleSelectFont (font) {
        this.props.onChange(font);
    }

    handleKeyDown (e) {
        if (e.key === 'Enter') {
            this.handleBlur();
            e.target.blur();
        }
    }

    getFilteredOptions () {
        if (this.props.isCustom || !this.state.focused) {
            return [];
        }
        const name = this.props.name.toLowerCase();
        const candidates = this.state.localFonts
            .filter(family => family.toLowerCase().includes(name));
        if (candidates.length === 1 && candidates[0] === this.props.name) {
            return [];
        }
        return candidates;
    }

    render () {
        const {
            /* eslint-disable no-unused-vars */
            name,
            onChange,
            fontManager,
            isCustom,
            /* eslint-enable no-unused-vars */
            ...props
        } = this.props;

        const filteredOptions = this.getFilteredOptions();
        return (
            <div className={styles.fontInputOuter}>
                <input
                    {...props}
                    type="text"
                    className={styles.fontInput}
                    value={this.props.name}
                    ref={this.setInputRef}
                    onChange={this.handleChange}
                    onFocus={this.handleFocus}
                    onBlur={this.handleBlur}
                    onKeyDown={this.handleKeyDown}
                />

                {/* We need to use a portal to get out of the modal's overflow: hidden, unfortunately */}
                {filteredOptions.length > 0 && ReactDOM.createPortal(
                    <div
                        className={styles.fontDropdownOuter}
                        style={{
                            left: `${this.state.rect.left - 4}px`,
                            top: `${this.state.rect.top + this.state.rect.height + 4}px`,
                            width: `${this.state.rect.width + 8}px`
                        }}
                    >
                        {this.getFilteredOptions().map(family => (
                            <FontDropdownItem
                                key={family}
                                family={family}
                                onSelect={this.handleSelectFont}
                            />
                        ))}
                    </div>,
                    document.body
                )}
            </div>
        );
    }
}

FontName.propTypes = {
    name: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    fontManager: PropTypes.shape({
        getUnusedSystemFont: PropTypes.func.isRequired,
        getUnusedCustomFont: PropTypes.func.isRequired
    }).isRequired,
    isCustom: PropTypes.bool.isRequired
};

export default FontName;
