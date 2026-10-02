import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import {closeFontsModal} from '../reducers/modals';
import FontsModalComponent from '../components/tw-fonts-modal/fonts-modal.jsx';

class TWFontsModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClose',
            'handleRequestBack',
            'handleCustomFontsChanged',
            'handleCancelAddFont',
            'handleOpenSystemFonts',
            'handleOpenLibaryFonts',
            'handleOpenCustomFonts'
        ]);
        this.state = {
            fonts: this.props.vm.runtime.fontManager.getFonts(),
            screen: ''
        };
    }

    componentDidMount () {
        this.props.vm.runtime.fontManager.on('change', this.handleCustomFontsChanged);
    }

    componentWillUnmount () {
        this.props.vm.runtime.fontManager.off('change', this.handleCustomFontsChanged);
    }

    // Also the sub-screens' own entry point: their "Add" button finishes and returns to the
    // font list, which is the same thing as closing one step.
    handleClose () {
        if (this.state.screen) {
            this.setState({
                screen: ''
            });
        } else {
            this.props.onClose();
        }
    }

    // The close button of the modal wrapper (and Escape, and the backdrop) goes through here
    // first. While a sub-screen is open the request only means "back to the font list", so it
    // is claimed and the modal stays open; see onRequestBack in containers/modal.jsx. Without
    // this the wrapper would animate out (and latch in the closing state, which left the modal
    // invisible and unclickable until the page was reloaded).
    handleRequestBack () {
        if (!this.state.screen) {
            return false;
        }
        this.setState({
            screen: ''
        });
        return true;
    }

    handleCustomFontsChanged () {
        this.setState({
            fonts: this.props.vm.runtime.fontManager.getFonts()
        });
    }

    handleCancelAddFont () {
        this.setState({
            screen: ''
        });
    }

    handleOpenSystemFonts () {
        this.setState({
            screen: 'system'
        });
    }

    handleOpenLibaryFonts () {
        this.setState({
            screen: 'library'
        });
    }

    handleOpenCustomFonts () {
        this.setState({
            screen: 'custom'
        });
    }

    render () {
        return (
            <FontsModalComponent
                onClose={this.handleClose}
                onRequestBack={this.handleRequestBack}
                screen={this.state.screen}
                fonts={this.state.fonts}
                fontManager={this.props.vm.runtime.fontManager}
                onCancelAddFont={this.handleCancelAddFont}
                onOpenSystemFonts={this.handleOpenSystemFonts}
                onOpenLibraryFonts={this.handleOpenLibaryFonts}
                onOpenCustomFonts={this.handleOpenCustomFonts}
            />
        );
    }
}

TWFontsModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.shape({
        runtime: PropTypes.shape({
            fontManager: PropTypes.shape({
                getFonts: PropTypes.func,
                addSystemFont: PropTypes.func,
                on: PropTypes.func,
                off: PropTypes.func
            })
        })
    })
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeFontsModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(TWFontsModal);
