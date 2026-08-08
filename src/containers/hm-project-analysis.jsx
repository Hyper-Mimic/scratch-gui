
import React from 'react';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {injectIntl} from 'react-intl';

import HmProjectAnalysis from '../components/hm-project-analysis/hm-project-analysis.jsx';
import {
    closeProjectAnalysisModal,
    isProjectAnalysisOpen
} from '../reducers/hm-project-analysis.js';

const HmProjectAnalysisContainer = ({ isOpen, onRequestClose, vm, projectTitle }) => {
    if (!isOpen) {
        return null;
    }
    
    return (
        <HmProjectAnalysis 
            isOpen={isOpen}
            onRequestClose={onRequestClose}
            vm={vm}
            projectTitle={projectTitle}
        />
    );
};

const mapStateToProps = state => {
    const isOpen = isProjectAnalysisOpen(state.scratchGui.projectAnalysis);
    return {
        isOpen: isOpen,
        vm: state.scratchGui.vm,
        projectTitle: state.scratchGui.projectTitle
    };
};

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => {
        dispatch(closeProjectAnalysisModal());
    }
});

export default compose(
    injectIntl,
    connect(mapStateToProps, mapDispatchToProps)
)(HmProjectAnalysisContainer);