import React from 'react';
import ReactDOM from 'react-dom';
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

// Numeric part of a stable id, for stacking live alerts and leaving clones in
// creation order (the redux list keeps insertion order).
const orderOf = id => parseInt(String(id).slice(1), 10) || 0;

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

    // Split live + leaving entries into the regular stack and the blocking
    // confirmation. The confirmation renders through a portal on document.body:
    // it must sit above everything -- menus, modals, and the "turn modals into
    // windows" layer whose inline z-indexes grow past any static value -- and a
    // portal escapes whatever stacking contexts the editor tree happens to
    // create. The portal replicates the stack's position (fixed, top-centred).
    const regularEntries = [];
    const confirmEntries = [];
    alertsList.forEach(a => {
        const entry = {alert: a, id: stableIdOf(a), isLeaving: false};
        (a.showConfirm ? confirmEntries : regularEntries).push(entry);
    });
    Object.entries(leaving).forEach(([k, {data}]) => {
        const entry = {alert: data, id: k, isLeaving: true};
        (data.showConfirm ? confirmEntries : regularEntries).push(entry);
    });
    regularEntries.sort((x, y) => orderOf(x.id) - orderOf(y.id));
    confirmEntries.sort((x, y) => orderOf(x.id) - orderOf(y.id));

    const renderAlert = ({alert: a, id, isLeaving}) => (
        <Alert
            closeButton={a.closeButton}
            content={a.content}
            extensionId={a.extensionId}
            extensionName={a.extensionName}
            iconSpinner={a.iconSpinner}
            iconURL={a.iconURL}
            index={alertsList.indexOf(a)}
            key={`${isLeaving ? 'leaving-' : ''}${id}`}
            leaving={isLeaving}
            level={a.level}
            message={a.message}
            confirmLabel={a.confirmLabel}
            cancelLabel={a.cancelLabel}
            hideCancel={a.hideCancel}
            inputValue={a.inputValue}
            onConfirm={a.onConfirm}
            showConfirm={a.showConfirm}
            showDownload={a.showDownload}
            showReconnect={a.showReconnect}
            showSaveNow={a.showSaveNow}
            onCloseAlert={isLeaving ? (() => {}) : onCloseAlert}
        />
    );

    const confirmAlert = alertsList.find(a => a.showConfirm);

    return (
        <Box
            bounds="parent"
            className={className}
        >
            <Box className={styles.alertsInnerContainer} >
                {/*
                    Live alerts and leaving clones render INTERLEAVED, ordered by stable id
                    (minted in creation order; the redux list keeps insertion order).
                    Cloning all leaving cards to the end of the list made the exit
                    animation play at the bottom of the stack even when the dismissed
                    card sat in the middle.
                */}
                {regularEntries.map(renderAlert)}
            </Box>
            {confirmEntries.length > 0 && ReactDOM.createPortal(
                <div
                    className={styles.confirmPortal}
                >
                    {confirmAlert && (
                        <div
                            className={styles.confirmBackdrop}
                            onClick={() => {
                                if (confirmAlert.onCancel) confirmAlert.onCancel();
                                onCloseAlert(alertsList.indexOf(confirmAlert));
                            }}
                        />
                    )}
                    <Box className={styles.alertsInnerContainer} >
                        {confirmEntries.map(renderAlert)}
                    </Box>
                </div>,
                document.body
            )}
        </Box>
    );
};

AlertsComponent.propTypes = {
    alertsList: PropTypes.arrayOf(PropTypes.object),
    className: PropTypes.string,
    onCloseAlert: PropTypes.func
};

export default AlertsComponent;
