import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import ModalComponent from '../components/modal/modal.jsx';
import prefersReducedMotion from '../lib/prefers-reduced-motion.js';

// Keep in sync with the closing animations in components/modal/modal.css.
const CLOSE_ANIMATION_DURATION = 170;

class Modal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'addEventListeners',
            'removeEventListeners',
            'handlePopState',
            'pushHistory',
            'handleRequestClose',
            'finishClose'
        ]);
        this.addEventListeners();
        this.state = {
            isClosing: false
        };
        this.closeTimer = null;
        this.afterClose = null;
    }
    componentDidMount () {
        // Add a history event only if it's not currently for our modal. This
        // avoids polluting the history with many entries. We only need one.
        this.pushHistory(this.id, (history.state === null || history.state !== this.id));
    }
    componentWillUnmount () {
        this.removeEventListeners();
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
    }
    addEventListeners () {
        window.addEventListener('popstate', this.handlePopState);
    }
    removeEventListeners () {
        window.removeEventListener('popstate', this.handlePopState);
    }
    handlePopState () {
        // Whenever someone navigates, we want to be closed
        this.handleRequestClose();
    }
    handleRequestClose (afterClose) {
        // Closing is always routed through here so the modal stays mounted while the exit
        // animation plays; the parent only unmounts it once the animation has finished.
        if (this.state.isClosing) {
            return;
        }
        // Buttons can pass along a function that does the actual closing work (submitting a
        // prompt, saving a recording, allowing a permission, ...) and it will be deferred until
        // the exit animation has finished. This is what lets those buttons animate out instead
        // of having the modal disappear the instant they dispatch a close action.
        // Note that React passes the click event when this is used directly as a click handler,
        // which is why we check the type.
        if (typeof afterClose === 'function') {
            this.afterClose = afterClose;
        }
        // A multi-step modal (font management, whose "add a font" screens are steps inside the
        // same modal) may want this request to mean "go back one step" rather than "tear
        // everything down". It opts in with onRequestBack, returning true once it has handled
        // the request itself. The modal then does not animate out at all — which matters,
        // because otherwise it would be left stuck in the closing state (faded out and
        // pointer-events: none) with its parent still mounting it, so it could never be shown
        // again without a refresh. Requests carrying a deferred action always mean a real close.
        if (!this.afterClose && this.props.onRequestBack && this.props.onRequestBack() === true) {
            return;
        }
        // Anything that has to disappear together with the modal (a Blockly field editor, for
        // example, which lives outside of the modal in document.body) gets notified here, since
        // the modal is still mounted for the whole animation.
        if (this.props.onClosing) {
            this.props.onClosing();
        }
        if (prefersReducedMotion()) {
            this.finishClose();
            return;
        }
        this.setState({
            isClosing: true
        });
        this.closeTimer = setTimeout(this.finishClose, CLOSE_ANIMATION_DURATION);
    }
    finishClose () {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
        const afterClose = this.afterClose;
        this.afterClose = null;
        if (afterClose) {
            // A deferred action was provided, so it is responsible for closing the modal. We must
            // not also call onRequestClose here: for something like the security manager's "Allow"
            // button that would end up running the "Deny" path as well.
            afterClose();
            return;
        }
        if (this.props.onRequestClose) {
            this.props.onRequestClose();
        }
    }
    get id () {
        return `modal-${this.props.id}`;
    }
    pushHistory (state, push) {
        if (push) return history.pushState(state, this.id, null);
        history.replaceState(state, this.id, null);
    }
    render () {
        return (
            <ModalComponent
                {...this.props}
                isClosing={this.state.isClosing}
                onRequestClose={this.handleRequestClose}
            />
        );
    }
}

Modal.propTypes = {
    id: PropTypes.string.isRequired,
    isRtl: PropTypes.bool,
    onClosing: PropTypes.func,
    // Optional. Called before the close animation for requests without a deferred action
    // (the close button, the backdrop, Escape, a history navigation). Return true when the
    // request has been handled in place — a multi-step modal going back one screen — so the
    // modal stays open instead of closing.
    onRequestBack: PropTypes.func,
    onRequestClose: PropTypes.func,
    onRequestOpen: PropTypes.func
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl
});

export default connect(
    mapStateToProps
)(Modal);
