const OPEN_PROJECT_ANALYSIS = 'scratch-gui/project-analysis/OPEN';
const CLOSE_PROJECT_ANALYSIS = 'scratch-gui/project-analysis/CLOSE';

const initialState = {
    isOpen: false
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN_PROJECT_ANALYSIS:
        return Object.assign({}, state, {
            isOpen: true
        });
    case CLOSE_PROJECT_ANALYSIS:
        return Object.assign({}, state, {
            isOpen: false
        });
    default:
        return state;
    }
};

const openProjectAnalysisModal = function () {
    return {
        type: OPEN_PROJECT_ANALYSIS
    };
};

const closeProjectAnalysisModal = function () {
    return {
        type: CLOSE_PROJECT_ANALYSIS
    };
};

// 导出 selector 函数而不是直接导出 isOpen
const isProjectAnalysisOpen = function (state) {
    return state.isOpen;
};

export {
    reducer as default,
    initialState as projectAnalysisInitialState,
    openProjectAnalysisModal,
    closeProjectAnalysisModal,
    isProjectAnalysisOpen
};