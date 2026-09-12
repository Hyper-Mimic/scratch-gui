import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import ReactModal from 'react-modal';
import Box from '../box/box.jsx';
import {defineMessages, injectIntl, intlShape, FormattedMessage} from 'react-intl';
import prefersReducedMotion from '../../lib/prefers-reduced-motion.js';

import styles from './webgl-modal.css';

const messages = defineMessages({
    label: {
        id: 'gui.webglModal.label',
        defaultMessage: 'Your Browser Does Not Support WebGL',
        description: 'WebGL missing title'
    }
});

// Keep in sync with the closing animations in ./webgl-modal.css.
const CLOSE_ANIMATION_DURATION = 170;

class WebGlModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleBack'
        ]);
        this.state = {
            isClosing: false
        };
        this.closeTimer = null;
    }
    componentWillUnmount () {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
    }
    handleBack () {
        // This modal is used outside of containers/modal.jsx, so the parent unmounts it as soon as
        // it is asked to close. The exit animation has to be played here before handing over.
        if (this.state.isClosing) {
            return;
        }
        if (prefersReducedMotion()) {
            this.props.onBack();
            return;
        }
        this.setState({
            isClosing: true
        });
        this.closeTimer = setTimeout(() => {
            this.closeTimer = null;
            this.props.onBack();
        }, CLOSE_ANIMATION_DURATION);
    }
    render () {
        const {intl, ...props} = this.props;
        const isClosing = this.state.isClosing;
        return (
            <ReactModal
                isOpen
                className={classNames(styles.modalContent, {[styles.modalContentClosing]: isClosing})}
                contentLabel={intl.formatMessage({...messages.label})}
                overlayClassName={classNames(styles.modalOverlay, {[styles.modalOverlayClosing]: isClosing})}
                onRequestClose={this.handleBack}
            >
                <div dir={props.isRtl ? 'rtl' : 'ltr'}>
                    <Box className={styles.illustration} />

                    <Box className={styles.body}>
                        <h2>
                            <FormattedMessage {...messages.label} />
                        </h2>
                        <p>
                            { /* eslint-disable max-len */ }
                            <FormattedMessage
                                defaultMessage="Unfortunately it looks like your browser or computer {webGlLink}. This technology is needed for Scratch 3.0 to run."
                                description="WebGL missing message"
                                id="gui.webglModal.description"
                                values={{
                                    webGlLink: (
                                        <a
                                            className={styles.faqLink}
                                            href="https://get.webgl.org/"
                                        >
                                            <FormattedMessage
                                                defaultMessage="does not support WebGL"
                                                description="link part of your browser does not support WebGL message"
                                                id="gui.webglModal.webgllink"
                                            />
                                        </a>
                                    )
                                }}
                            />
                            { /* eslint-enable max-len */ }
                        </p>

                        <Box className={styles.buttonRow}>
                            <button
                                className={styles.backButton}
                                onClick={this.handleBack}
                            >
                                <FormattedMessage
                                    defaultMessage="Back"
                                    description="Label for button go back when browser is unsupported"
                                    id="gui.webglModal.back"
                                />
                            </button>

                        </Box>
                        <div className={styles.faqLinkText}>
                            <FormattedMessage
                                defaultMessage="To learn more, go to the {previewFaqLink}."
                                description="Scratch 3.0 FAQ description"
                                id="gui.webglModal.previewfaq"
                                values={{
                                    previewFaqLink: (
                                        <a
                                            className={styles.faqLink}
                                            href="//scratch.mit.edu/3faq"
                                        >
                                            <FormattedMessage
                                                defaultMessage="FAQ"
                                                description="link to Scratch 3.0 FAQ page"
                                                id="gui.webglModal.previewfaqlinktext"
                                            />
                                        </a>
                                    )
                                }}
                            />
                        </div>
                    </Box>
                </div>
            </ReactModal>
        );
    }
}

WebGlModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onBack: PropTypes.func.isRequired
};

export default injectIntl(WebGlModal);
