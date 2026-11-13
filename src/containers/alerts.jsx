import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {
    closeAlert,
    filterPopupAlerts
} from '../reducers/alerts';

import AlertsComponent from '../components/alerts/alerts.jsx';

const Alerts = ({
    alertsList,
    className,
    onCloseAlert
}) => {
    const popupAlerts = filterPopupAlerts(alertsList);
    return (
        <AlertsComponent
            // only display standard and extension alerts here
            alertsList={popupAlerts}
            className={className}
            onCloseAlert={filteredIndex => {
                // The component only knows its index in the FILTERED list, but the
                // reducer splices the UNFILTERED one -- with an inline alert in the
                // state every popup index would be off by one and closing a card
                // dismissed a different one. Resolve through the object identity.
                const alert = popupAlerts[filteredIndex];
                if (alert) onCloseAlert(alertsList.indexOf(alert));
            }}
        />
    );
};

Alerts.propTypes = {
    alertsList: PropTypes.arrayOf(PropTypes.object),
    className: PropTypes.string,
    onCloseAlert: PropTypes.func
};

const mapStateToProps = state => ({
    alertsList: state.scratchGui.alerts.alertsList
});

const mapDispatchToProps = dispatch => ({
    onCloseAlert: index => dispatch(closeAlert(index))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Alerts);
