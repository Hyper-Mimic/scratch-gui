import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {FormattedMessage, defineMessages, injectIntl, intlShape} from 'react-intl';
import DragConstants from '../../lib/drag-constants';
import {ComingSoonTooltip} from '../coming-soon/coming-soon.jsx';
import SpriteSelectorItem from '../../containers/sprite-selector-item.jsx';
import {ContextMenu, ContextMenuTrigger, MenuItem} from '../context-menu/context-menu.jsx';
import styles from './backpack.css';

// TODO make sprite selector item not require onClick
const noop = () => {};

// The item tiles are <img> elements; a mouse-down-plus-move on one makes the
// browser start a native image drag that hauls the picture out of the editor.
// Killing `dragstart` on the whole container covers every child at once.
const preventNativeDrag = e => e.preventDefault();

const dragTypeMap = { // Keys correspond with the backpack-server item types
    costume: DragConstants.BACKPACK_COSTUME,
    sound: DragConstants.BACKPACK_SOUND,
    script: DragConstants.BACKPACK_CODE,
    sprite: DragConstants.BACKPACK_SPRITE
};

const labelMap = defineMessages({
    costume: {
        id: 'gui.backpack.costumeLabel',
        defaultMessage: 'costume',
        description: 'Label for costume backpack item'
    },
    sound: {
        id: 'gui.backpack.soundLabel',
        defaultMessage: 'sound',
        description: 'Label for sound backpack item'
    },
    script: {
        id: 'gui.backpack.scriptLabel',
        defaultMessage: 'script',
        description: 'Label for script backpack item'
    },
    sprite: {
        id: 'gui.backpack.spriteLabel',
        defaultMessage: 'sprite',
        description: 'Label for sprite backpack item'
    }
});

const messages = defineMessages({
    rename: {
        defaultMessage: 'New name:',
        description: 'Renaming a backpack item',
        id: 'tw.backpack.rename'
    }
});

const BACKPACK_MENU_ID = 'backpack-list-menu';

const Backpack = ({
    blockDragOver,
    containerRef,
    contents,
    dragOver,
    error,
    expanded,
    intl,
    loading,
    showMore,
    onToggle,
    onDelete,
    onRequestClearAll,
    onRequestDeleteMany,
    onRename,
    onMouseEnter,
    onMouseLeave,
    onMore
}) => {
    const [multiSelect, setMultiSelect] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState([]);
    return (
    /*
        The header is a direct child of the container and must stay outside
        `.backpack-collapse`: that element collapses to zero height when the backpack is
        closed, so anything inside it becomes unreachable -- including the button that
        reopens the backpack.
    */
    <div
        className={styles.backpackContainer}
        onDragStart={preventNativeDrag}
    >
        <div
            className={styles.backpackHeader}
            onClick={onToggle}
        >
            {onToggle ? (
                <FormattedMessage
                    defaultMessage="Backpack"
                    description="Button to open the backpack"
                    id="gui.backpack.header"
                />
            ) : (
                <ComingSoonTooltip
                    place="top"
                    tooltipId="backpack-tooltip"
                >
                    <FormattedMessage
                        defaultMessage="Backpack"
                        description="Button to open the backpack"
                        id="gui.backpack.header"
                    />
                </ComingSoonTooltip>
            )}
        </div>
        {/*
            The animated region: grid row `1fr -> 0fr` (see backpack.css). The list inside
            is always rendered rather than `expanded ? ... : null`, because an element that
            is unmounted has no styles to transition from.
        */}
        <div className={classNames(styles.backpackCollapse, {
            [styles.backpackCollapseHidden]: !expanded
        })}>
            <div className={styles.backpackCollapseInner}>
                {multiSelect && (
                    <div className={styles.hmBackpackMultiBar}>
                        <FormattedMessage
                            defaultMessage="{count} selected"
                            description="Backpack multi-select: how many items are checked"
                            id="tw.backpack.selectedCount"
                            values={{count: selectedIds.length}}
                        />
                        <button
                            className={styles.hmBackpackMultiButton}
                            onClick={() => setSelectedIds(contents.map(item => item.id))}
                        >
                            <FormattedMessage
                                defaultMessage="Select all"
                                description="Backpack multi-select: check every item"
                                id="tw.backpack.selectAll"
                            />
                        </button>
                        <button
                            className={classNames(styles.hmBackpackMultiButton, styles.hmBackpackMultiDanger)}
                            disabled={selectedIds.length === 0}
                            onClick={() => {
                                onRequestDeleteMany(selectedIds);
                                setSelectedIds([]);
                                setMultiSelect(false);
                            }}
                        >
                            <FormattedMessage
                                defaultMessage="Delete selected"
                                description="Backpack multi-select: delete the checked items"
                                id="tw.backpack.deleteSelected"
                            />
                        </button>
                        <button
                            className={styles.hmBackpackMultiButton}
                            onClick={() => {
                                setMultiSelect(false);
                                setSelectedIds([]);
                            }}
                        >
                            <FormattedMessage
                                defaultMessage="Cancel"
                                description="Backpack: cancel a destructive action"
                                id="tw.backpack.cancel"
                            />
                        </button>
                    </div>
                )}
                {/*
                    Carries the drop target and the drag-over highlight; the collapse is driven by
                    the grid row above. A block only has to be over the container (header included)
                    for this to light up -- see updateBlockDragOver in containers/backpack.jsx --
                    but the layer itself stays on the list, which is what is being dropped onto.
                */}
                <ContextMenuTrigger
                    disable={!expanded || contents.length === 0}
                    id={BACKPACK_MENU_ID}
                >
                    <div
                        className={classNames(styles.backpackList, {
                            [styles.dragOver]: dragOver || blockDragOver
                        })}
                        ref={containerRef}
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                    >
                    {/* eslint-disable-next-line no-negated-condition */}
                    {error !== false ? (
                        <div className={styles.statusMessage}>
                            <FormattedMessage
                                defaultMessage="Error loading backpack"
                                description="Error backpack message"
                                id="gui.backpack.errorBackpack"
                            />
                            <div className={styles.errorMessage}>{error}</div>
                        </div>
                    ) : (
                        loading ? (
                            <div className={styles.statusMessage}>
                                <FormattedMessage
                                    defaultMessage="Loading..."
                                    description="Loading backpack message"
                                    id="gui.backpack.loadingBackpack"
                                />
                            </div>
                        ) : (
                            contents.length > 0 ? (
                                <div className={styles.backpackListInner}>
                                    {contents.map(item => (multiSelect ? (
                                        <button
                                            className={classNames(styles.hmBackpackSelectTile, {
                                                [styles.hmBackpackSelected]: selectedIds.indexOf(item.id) !== -1
                                            })}
                                            key={item.id}
                                            onClick={() => setSelectedIds(ids => (
                                                ids.indexOf(item.id) === -1 ?
                                                    ids.concat(item.id) :
                                                    ids.filter(id => id !== item.id)
                                            ))}
                                        >
                                            <img
                                                alt=""
                                                className={styles.hmBackpackSelectThumb}
                                                draggable={false}
                                                src={item.thumbnailUrl}
                                            />
                                            <span className={styles.hmBackpackSelectName}>{item.name}</span>
                                            <span className={styles.hmBackpackCheck}>✓</span>
                                        </button>
                                    ) : (
                                        <SpriteSelectorItem
                                            className={styles.backpackItem}
                                            costumeURL={item.thumbnailUrl}
                                            details={item.name}
                                            dragPayload={item}
                                            dragType={dragTypeMap[item.type]}
                                            id={item.id}
                                            key={item.id}
                                            name={intl.formatMessage(labelMap[item.type])}
                                            selected={false}
                                            onClick={noop}
                                            onDeleteButtonClick={onDelete}
                                            // Currently, renaming sprites is not supported.
                                            onRenameButtonClick={item.type === 'sprite' ? null : onRename}
                                        />
                                    )))}
                                    {showMore && (
                                        <button
                                            className={styles.more}
                                            onClick={onMore}
                                        >
                                            <FormattedMessage
                                                defaultMessage="More"
                                                description="Load more from backpack"
                                                id="gui.backpack.more"
                                            />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.statusMessage}>
                                    <FormattedMessage
                                        defaultMessage="Backpack is empty"
                                        description="Empty backpack message"
                                        id="gui.backpack.emptyBackpack"
                                    />
                                </div>
                            )
                        )
                    )}
                    </div>
                    </ContextMenuTrigger>
                </div>
            </div>
            <ContextMenu id={BACKPACK_MENU_ID}>
                <MenuItem onClick={onRequestClearAll}>
                    <FormattedMessage
                        defaultMessage="Clear all contents"
                        description="Backpack context menu: delete every item"
                        id="tw.backpack.clearAll"
                    />
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        setSelectedIds([]);
                        setMultiSelect(true);
                    }}
                >
                    <FormattedMessage
                        defaultMessage="Select items to delete"
                        description="Backpack context menu: enter multi-select mode"
                        id="tw.backpack.multiSelectDelete"
                    />
                </MenuItem>
            </ContextMenu>
        </div>
    );
};

Backpack.propTypes = {
    blockDragOver: PropTypes.bool,
    containerRef: PropTypes.func,
    contents: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        thumbnailUrl: PropTypes.string,
        type: PropTypes.string,
        name: PropTypes.string
    })),
    dragOver: PropTypes.bool,
    error: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
    expanded: PropTypes.bool,
    intl: intlShape,
    loading: PropTypes.bool,
    onDelete: PropTypes.func,
    onRequestClearAll: PropTypes.func,
    onRequestDeleteMany: PropTypes.func,
    onRename: PropTypes.func,
    onMore: PropTypes.func,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func,
    onToggle: PropTypes.func,
    showMore: PropTypes.bool
};

Backpack.defaultProps = {
    blockDragOver: false,
    contents: [],
    dragOver: false,
    expanded: false,
    loading: false,
    showMore: false,
    onMore: null,
    onToggle: null
};

export default injectIntl(Backpack);
