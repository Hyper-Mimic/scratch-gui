import React from 'react';
import PropTypes from 'prop-types';

import Box from '../box/box.jsx';
import Alert from '../../containers/alert.jsx';

import styles from './alerts.css';

// How long the exit animation (see alert.css .closing / @keyframes alertOut) runs before the
// alert is actually removed from the DOM. Kept in sync with the CSS.
const LEAVE_MS = 240;

// A stable key for an alert: prefer its id, then its extension id, then the list index. Keying by
// id means an alert is not remounted when siblings above it are removed.
const keyOf = a => (a.alertId != null ? a.alertId : (a.extensionId != null ? a.extensionId : null));

const AlertsComponent = ({
    alertsList,
    className,
    onCloseAlert
}) => {
    // Alerts whose redux entry was just removed: we keep rendering a snapshot of them (with the
    // `.closing` class) for LEAVE_MS so the exit animation can play, then drop them.
    const [leaving, setLeaving] = React.useState({});
    const prevListRef = React.useRef(alertsList);

    React.useEffect(() => {
        const prev = prevListRef.current;
        const prevKeys = new Set(prev.map((a, i) => keyOf(a) || `i${i}`));
        const curKeys = new Set(alertsList.map((a, i) => keyOf(a) || `i${i}`));
        const removed = prev.filter((a, i) => !curKeys.has(keyOf(a) || `i${i}`));
        if (removed.length > 0) {
            setLeaving(prevLeaving => {
                const next = {...prevLeaving};
                removed.forEach((a, i) => {
                    const k = keyOf(a) || `i${i}`;
                    next[k] = {data: a, index: prev.indexOf(a)};
                });
                return next;
            });
            removed.forEach((a, i) => {
                const k = keyOf(a) || `i${i}`;
                setTimeout(() => {
                    setLeaving(prevLeaving => {
                        const next = {...prevLeaving};
                        delete next[k];
                        return next;
                    });
                }, LEAVE_MS);
            });
        }
        prevListRef.current = alertsList;
    }, [alertsList]);

    const curKeys = new Set(alertsList.map((a, i) => keyOf(a) || `i${i}`));

    return (
        <Box
            bounds="parent"
            className={className}
        >
            <Box className={styles.alertsInnerContainer} >
                {alertsList.map((a, index) => {
                    const k = keyOf(a) || `i${index}`;
                    return (
                        <Alert
                            closeButton={a.closeButton}
                            content={a.content}
                            extensionId={a.extensionId}
                            extensionName={a.extensionName}
                            iconSpinner={a.iconSpinner}
                            iconURL={a.iconURL}
                            index={index}
                            key={k}
                            level={a.level}
                            message={a.message}
                            showDownload={a.showDownload}
                            showReconnect={a.showReconnect}
                            showSaveNow={a.showSaveNow}
                            onCloseAlert={onCloseAlert}
                        />
                    );
                })}
                {Object.entries(leaving)
                    .filter(([k]) => !curKeys.has(k))
                    .map(([k, {data, index}]) => (
                        <Alert
                            closeButton={false}
                            content={data.content}
                            extensionId={data.extensionId}
                            extensionName={data.extensionName}
                            iconSpinner={data.iconSpinner}
                            iconURL={data.iconURL}
                            index={index}
                            key={`leaving-${k}`}
                            leaving
                            level={data.level}
                            message={data.message}
                            showDownload={data.showDownload}
                            showReconnect={data.showReconnect}
                            showSaveNow={data.showSaveNow}
                            onCloseAlert={() => {}}
                        />
                    ))}
            </Box>
        </Box>
    );
};

AlertsComponent.propTypes = {
    alertsList: PropTypes.arrayOf(PropTypes.object),
    className: PropTypes.string,
    onCloseAlert: PropTypes.func
};

export default AlertsComponent;
