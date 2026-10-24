import React from 'react';
import PropTypes from 'prop-types';

import Box from '../box/box.jsx';
import Alert from '../../containers/alert.jsx';

import styles from './alerts.css';

// How long the exit animation (see alert.css .closing / @keyframes alertOut) runs before the
// alert is actually removed from the DOM. A small buffer over the 240ms CSS duration guarantees
// the last frame is not cut off by an early unmount.
const LEAVE_MS = 260;

// Alerts are not guaranteed to carry a stable id (most standard alerts do via `alertId`, extension
// alerts via `extensionId`, but some callers push bare objects). Keying by index would shift keys
// whenever an alert is removed and break our "which alert just left?" detection below, so we mint a
// stable per-object id the first time we see each alert object and reuse it on later renders.
const idMap = new WeakMap();
let idCounter = 0;
const stableIdOf = alert => {
    let id = idMap.get(alert);
    if (id === undefined) {
        id = `a${idCounter++}`;
        idMap.set(alert, id);
    }
    return id;
};

const AlertsComponent = ({
    alertsList,
    className,
    onCloseAlert
}) => {
    // Alerts whose redux entry was just removed: we keep rendering a snapshot of them (with the
    // `.closing` class) for LEAVE_MS so the exit animation can play, then drop them.
    const [leaving, setLeaving] = React.useState({});
    const prevListRef = React.useRef(alertsList);

    // Ensure every alert in the current batch has a stable id (also used for removal detection).
    alertsList.forEach(stableIdOf);

    React.useEffect(() => {
        const prev = prevListRef.current;
        const curSet = new Set(alertsList);
        const removed = prev.filter(a => !curSet.has(a));
        if (removed.length > 0) {
            setLeaving(prevLeaving => {
                const next = {...prevLeaving};
                removed.forEach(a => {
                    const k = stableIdOf(a);
                    next[k] = {data: a, index: prev.indexOf(a)};
                });
                return next;
            });
            removed.forEach(a => {
                const k = stableIdOf(a);
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

    return (
        <Box
            bounds="parent"
            className={className}
        >
            <Box className={styles.alertsInnerContainer} >
                {alertsList.map((a, index) => (
                    <Alert
                        closeButton={a.closeButton}
                        content={a.content}
                        extensionId={a.extensionId}
                        extensionName={a.extensionName}
                        iconSpinner={a.iconSpinner}
                        iconURL={a.iconURL}
                        index={index}
                        key={stableIdOf(a)}
                        level={a.level}
                        message={a.message}
                        showDownload={a.showDownload}
                        showReconnect={a.showReconnect}
                        showSaveNow={a.showSaveNow}
                        onCloseAlert={onCloseAlert}
                    />
                ))}
                {Object.entries(leaving).map(([k, {data, index}]) => (
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
