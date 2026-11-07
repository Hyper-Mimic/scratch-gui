import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import BackpackComponent from '../components/backpack/backpack.jsx';
import {
    getBackpackContents,
    saveBackpackObject,
    deleteBackpackObject,
    updateBackpackObject,
    soundPayload,
    costumePayload,
    spritePayload,
    codePayload,
    LOCAL_API
} from '../lib/backpack-api';
import DragConstants from '../lib/drag-constants';
import DropAreaHOC from '../lib/drop-area-hoc.jsx';
import {collectBoxSelectionPayload} from '../lib/backpack/add-selection.js';

import {connect} from 'react-redux';
import storage from '../lib/storage';
import VM from 'scratch-vm';

const dragTypes = [DragConstants.COSTUME, DragConstants.SOUND, DragConstants.SPRITE];
const DroppableBackpack = DropAreaHOC(dragTypes)(BackpackComponent);

// The whole backpack panel, header included: a block drag highlights it and dropping anywhere on
// it adds the block. CSS Modules emits `backpack_backpack-container_<hash>` (components/backpack/
// backpack.css), the same name the addons match on.
const BACKPACK_CONTAINER_SELECTOR = '[class*="backpack_backpack-container"]';

const messages = defineMessages({
    rename: {
        defaultMessage: 'New name:',
        description: 'Renaming a backpack item',
        id: 'tw.backpack.rename'
    }
});

class Backpack extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleDrop',
            'handleToggle',
            'handleDelete',
            'handleRename',
            'getBackpackAssetURL',
            'getContents',
            'handleMouseEnter',
            'handleMouseLeave',
            'handleBlockDragEnd',
            'handleBlockDragUpdate',
            'handleHmAddBlocks',
            'startPointerTracking',
            'stopPointerTracking',
            'isPointerOverBackpack',
            'handleMore',
            'resizeWorkspace'
        ]);
        this.state = {
            // While the DroppableHOC manages drop interactions for asset tiles,
            // we still need to micromanage drops coming from the block workspace.
            // TODO this may be refactorable with the share-the-love logic in SpriteSelectorItem
            blockDragOutsideWorkspace: false,
            blockDragOverBackpack: false,
            error: false,
            itemsPerPage: 20,
            moreToLoad: false,
            loading: false,
            expanded: false,
            contents: []
        };

        // If a host is given, add it as a web source to the storage module
        // TODO remove the hacky flag that prevents double adding
        if (props.host && !storage._hasAddedBackpackSource && props.host !== LOCAL_API) {
            storage.addWebSource(
                [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap, storage.AssetType.Sound],
                this.getBackpackAssetURL
            );
            storage._hasAddedBackpackSource = true;
        }
    }
    componentDidMount () {
        this.props.vm.addListener('BLOCK_DRAG_END', this.handleBlockDragEnd);
        this.props.vm.addListener('BLOCK_DRAG_UPDATE', this.handleBlockDragUpdate);
        // editor-devtools: "add box selection to backpack" (hm-backpack-add-blocks).
        // The payload is the same shape a block drag would deliver, so it goes
        // through the identical codePayload + saveBackpackObject pipeline.
        window.addEventListener('hm-backpack-add-blocks', this.handleHmAddBlocks);
    }
    componentWillUnmount () {
        this.props.vm.removeListener('BLOCK_DRAG_END', this.handleBlockDragEnd);
        this.props.vm.removeListener('BLOCK_DRAG_UPDATE', this.handleBlockDragUpdate);
        window.removeEventListener('hm-backpack-add-blocks', this.handleHmAddBlocks);
        this.stopPointerTracking();
        if (this.resizeTimer) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
        }
        if (this.resizeRaf) {
            cancelAnimationFrame(this.resizeRaf);
            this.resizeRaf = null;
        }
    }
    /**
     * Tell Blockly to re-measure. It listens for `resize` on `window` (scratch-blocks
     * core/inject.js), so this is a plain window event, not a DOM resize of any element.
     */
    resizeWorkspace () {
        window.dispatchEvent(new Event('resize'));
    }
    /**
     * Re-measure once the open/close animation has finished.
     *
     * The backpack list animates a grid row from `1fr` to `0fr` (see
     * components/backpack/backpack.css), so for the length of the transition the left
     * column's height is still changing. Firing `resize` only at the start would leave the
     * block workspace sized for the pre-animation height, which shows up as stale space
     * below the blocks after closing. This fires again on the frame after the transition
     * ends (matched to the CSS durations).
     */
    queueResizeAfterAnimation () {
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        // +100ms of slack over the 0.15s close duration -- more than one frame, so the
        // transition has certainly ended and the layout has settled before we measure.
        this.resizeTimer = setTimeout(() => {
            this.resizeTimer = null;
            this.resizeRaf = requestAnimationFrame(() => {
                this.resizeRaf = null;
                this.resizeWorkspace();
            });
        }, 250);
    }
    getBackpackAssetURL (asset) {
        return `${this.props.host}/${asset.assetId}.${asset.dataFormat}`;
    }
    handleToggle () {
        const newState = !this.state.expanded;
        if (!newState) {
            // Close. Contents are deliberately NOT cleared here: the list stays mounted while
            // it fades out (see components/backpack/backpack.jsx), so emptying it would flash
            // "Backpack is empty" for the length of the animation.
            this.setState({expanded: false}, () => {
                // Emit resize on window to get blocks to resize
                this.resizeWorkspace();
            });
            // ...and again once the collapse has finished, so the workspace does not keep the
            // height the backpack held while it was still animating out.
            this.queueResizeAfterAnimation();
            return;
        }
        // Open. Reset to an empty list first so `getContents` fetches from offset 0 (it reads
        // `this.state.contents.length`, and the callback runs after the reset is applied).
        this.setState({expanded: true, contents: []}, () => {
            // Emit resize on window to get blocks to resize
            this.resizeWorkspace();
            this.getContents();
        });
        this.queueResizeAfterAnimation();
    }
    handleError (error) {
        this.setState({
            error: `${error}`,
            loading: false
        });
        // Log error to console and make the Promise reject.
        throw error;
    }
    handleHmAddBlocks (e) {
        if (e && e.detail && e.detail.blockObjects && e.detail.blockObjects.length) {
            this.handleDrop({
                dragType: DragConstants.CODE,
                payload: e.detail
            });
        }
    }
    handleDrop (dragInfo) {
        let payloader = null;
        let presaveAsset = null;
        switch (dragInfo.dragType) {
        case DragConstants.COSTUME:
            payloader = costumePayload;
            presaveAsset = dragInfo.payload.asset;
            break;
        case DragConstants.SOUND:
            payloader = soundPayload;
            presaveAsset = dragInfo.payload.asset;
            break;
        case DragConstants.SPRITE:
            payloader = spritePayload;
            break;
        case DragConstants.CODE:
            payloader = codePayload;
            break;
        }
        if (!payloader) return;

        // Creating the payload is async, so set loading before starting
        this.setState({loading: true}, () => {
            payloader(dragInfo.payload, this.props.vm)
                .then(payload => {
                    // Force the asset to save to the asset server before storing in backpack
                    // Ensures any asset present in the backpack is also on the asset server
                    if (presaveAsset && !presaveAsset.clean && !this.props.host === LOCAL_API) {
                        return storage.store(
                            presaveAsset.assetType,
                            presaveAsset.dataFormat,
                            presaveAsset.data,
                            presaveAsset.assetId
                        ).then(() => payload);
                    }
                    return payload;
                })
                .then(payload => saveBackpackObject({
                    host: this.props.host,
                    token: this.props.token,
                    username: this.props.username,
                    ...payload
                }))
                .then(item => {
                    this.setState({
                        loading: false,
                        contents: [item].concat(this.state.contents)
                    });
                })
                .catch(error => {
                    this.handleError(error);
                });
        });
    }
    handleDelete (id) {
        this.setState({loading: true}, () => {
            deleteBackpackObject({
                host: this.props.host,
                token: this.props.token,
                username: this.props.username,
                id: id
            })
                .then(() => {
                    this.setState({
                        loading: false,
                        contents: this.state.contents.filter(o => o.id !== id)
                    });
                })
                .catch(error => {
                    this.handleError(error);
                });
        });
    }
    findItemById (id) {
        return this.state.contents.find(i => i.id === id);
    }
    async handleRename (id) {
        const item = this.findItemById(id);
        // prompt() returns Promise in desktop app
        // eslint-disable-next-line no-alert
        const newName = await prompt(this.props.intl.formatMessage(messages.rename), item.name);
        if (!newName) {
            return;
        }
        this.setState({loading: true}, () => {
            updateBackpackObject({
                host: this.props.host,
                ...item,
                name: newName
            })
                .then(newItem => {
                    this.setState({
                        loading: false,
                        contents: this.state.contents.map(i => (i === item ? newItem : i))
                    });
                })
                .catch(error => {
                    this.handleError(error);
                });
        });
    }
    getContents () {
        if ((this.props.token && this.props.username) || this.props.host === LOCAL_API) {
            this.setState({loading: true, error: false}, () => {
                getBackpackContents({
                    host: this.props.host,
                    token: this.props.token,
                    username: this.props.username,
                    offset: this.state.contents.length,
                    limit: this.state.itemsPerPage
                })
                    .then(contents => {
                        this.setState({
                            contents: this.state.contents.concat(contents),
                            moreToLoad: contents.length === this.state.itemsPerPage,
                            loading: false
                        });
                    })
                    .catch(error => {
                        this.handleError(error);
                    });
            });
        }
    }
    handleBlockDragUpdate (isOutsideWorkspace) {
        this.setState({
            blockDragOutsideWorkspace: isOutsideWorkspace
        });
        // A finger drag has no hover: `mouseenter` on the list never fires during a touch drag, so
        // the drop was silently ignored and the block went back to the workspace. Follow the
        // pointer for the length of the drag and decide by hit test when it ends.
        if (isOutsideWorkspace) {
            this.startPointerTracking();
        } else {
            // Back inside the workspace (or the drag is ending): the highlight has to go. The hit
            // test at the end of a real drop does not depend on this flag -- it reads the pointer
            // position, which `stopPointerTracking` keeps.
            this.stopPointerTracking();
            if (this.state.blockDragOverBackpack) {
                this.setState({blockDragOverBackpack: false});
            }
        }
    }
    startPointerTracking () {
        if (this.pointerTracker) return;
        this.pointerTracker = e => {
            this.updateBlockDragOver(e.clientX, e.clientY);
        };
        // Capture phase so the position is recorded even when the pointer is over the workspace
        // SVG, which stops propagation of the drag it is handling. `pointerup` as well as
        // `pointermove`: the release itself can be the last position the finger was at.
        document.addEventListener('pointermove', this.pointerTracker, {capture: true, passive: true});
        document.addEventListener('pointerup', this.pointerTracker, {capture: true, passive: true});
    }
    stopPointerTracking () {
        if (!this.pointerTracker) return;
        document.removeEventListener('pointermove', this.pointerTracker, {capture: true});
        document.removeEventListener('pointerup', this.pointerTracker, {capture: true});
        this.pointerTracker = null;
        // `lastPointer` deliberately survives: the VM reports "no longer outside the workspace"
        // before it reports the drop, so clearing here would leave the hit test with nothing.
    }
    /**
     * Light the backpack up while a block being dragged out of the workspace is over it.
     *
     * Geometry rather than hover: the header is part of the container, and a touch drag never fires
     * `mouseenter` at all. Writing the state only when it actually flips keeps this off the render
     * path for every pointer move that changes nothing.
     * @param {number} x viewport x
     * @param {number} y viewport y
     */
    updateBlockDragOver (x, y) {
        this.lastPointer = {x, y};
        if (!this.state.blockDragOutsideWorkspace) return;
        const over = this.isPointerOverBackpack();
        if (over !== this.state.blockDragOverBackpack) {
            this.setState({blockDragOverBackpack: over});
        }
    }
    /**
     * Whether the last known pointer position is over the backpack, i.e. whether the drag that just
     * ended was a drop on it. Independent of hover, so it works for a mouse, a pen and a finger.
     * @returns {boolean}
     */
    isPointerOverBackpack () {
        const point = this.lastPointer;
        if (!point) return false;
        const container = document.querySelector(BACKPACK_CONTAINER_SELECTOR);
        if (!container) return false;
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        return point.x >= rect.left && point.x <= rect.right &&
            point.y >= rect.top && point.y <= rect.bottom;
    }
    handleMouseEnter (e) {
        this.updateBlockDragOver(e.clientX, e.clientY);
    }
    handleMouseLeave (e) {
        // Answered by the same hit test: leaving the list for the header keeps the highlight on,
        // because the header is still inside the drop area.
        this.updateBlockDragOver(e.clientX, e.clientY);
    }
    handleBlockDragEnd (blocks, topBlockId) {
        // `blockDragOverBackpack` is the mouse-only signal (it comes from mouseenter); the hit test
        // covers touch, where there is no hover to report.
        const overBackpack = this.state.blockDragOverBackpack || this.isPointerOverBackpack();
        this.stopPointerTracking();
        this.lastPointer = null;
        if (overBackpack) {
            // A drag of a box selection moves the whole group; collect the
            // full selection instead of just the grabbed stack. The main
            // block rides with its whole sub-stack, so collect it that way.
            // Returns null for a normal single-stack drag.
            const boxPayload = collectBoxSelectionPayload(this.props.vm, topBlockId, true);
            this.handleDrop({
                dragType: DragConstants.CODE,
                payload: boxPayload || {
                    blockObjects: this.props.vm.exportStandaloneBlocks(blocks),
                    topBlockId: topBlockId
                }
            });
        }
        this.setState({
            blockDragOverBackpack: false,
            blockDragOutsideWorkspace: false
        });
    }
    handleMore () {
        this.getContents();
    }
    render () {
        return (
            <DroppableBackpack
                blockDragOver={this.state.blockDragOverBackpack}
                contents={this.state.contents}
                error={this.state.error}
                expanded={this.state.expanded}
                loading={this.state.loading}
                showMore={this.state.moreToLoad}
                onDelete={this.handleDelete}
                onRename={this.handleRename}
                onDrop={this.handleDrop}
                onMore={this.handleMore}
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
                onToggle={this.props.host ? this.handleToggle : null}
            />
        );
    }
}

Backpack.propTypes = {
    intl: intlShape,
    host: PropTypes.string,
    token: PropTypes.string,
    username: PropTypes.string,
    vm: PropTypes.instanceOf(VM)
};

const getTokenAndUsername = state => {
    // Look for the session state provided by scratch-www
    if (state.session && state.session.session && state.session.session.user) {
        return {
            token: state.session.session.user.token,
            username: state.session.session.user.username
        };
    }
    // Otherwise try to pull testing params out of the URL, or return nulls
    // TODO a hack for testing the backpack
    const tokenMatches = window.location.href.match(/[?&]token=([^&]*)&?/);
    const usernameMatches = window.location.href.match(/[?&]username=([^&]*)&?/);
    return {
        token: tokenMatches ? tokenMatches[1] : null,
        username: usernameMatches ? usernameMatches[1] : null
    };
};

const mapStateToProps = state => Object.assign(
    {
        dragInfo: state.scratchGui.assetDrag,
        vm: state.scratchGui.vm,
        blockDrag: state.scratchGui.blockDrag
    },
    getTokenAndUsername(state)
);

const mapDispatchToProps = () => ({});

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(Backpack));
