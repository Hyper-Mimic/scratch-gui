const UPDATE_METRICS = 'scratch-gui/workspace-metrics/UPDATE_METRICS';

const initialState = {
    targets: {}
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;

    switch (action.type) {
    case UPDATE_METRICS: {
        const previous = state.targets[action.targetID];
        // The workspace fires a translate on every scroll/metrics recalculation and each one
        // dispatches. Rebuilding the state object re-renders every component connected to
        // workspaceMetrics (TargetPane and each StageSelector), so bail out when nothing moved.
        if (previous &&
            previous.scrollX === action.scrollX &&
            previous.scrollY === action.scrollY &&
            previous.scale === action.scale) {
            return state;
        }
        return Object.assign({}, state, {
            targets: Object.assign({}, state.targets, {
                [action.targetID]: {
                    scrollX: action.scrollX,
                    scrollY: action.scrollY,
                    scale: action.scale
                }
            })
        });
    }
    default:
        return state;
    }
};

const updateMetrics = function (metrics) {
    return {
        type: UPDATE_METRICS,
        ...metrics
    };
};

export {
    reducer as default,
    initialState as workspaceMetricsInitialState,
    updateMetrics
};
