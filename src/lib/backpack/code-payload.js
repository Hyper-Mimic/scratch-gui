import blockToImage from './block-to-image';
import createThumbnail from './thumbnail';
import {BLOCKS_DEFAULT_SCALE} from '../layout-constants';
import {shiftFramesXml, withFrames} from '../frame-backpack/index.js';
import {Base64} from 'js-base64';
import log from '../log.js';

// A code item's picture is shown far larger than a sprite tile: the tile is 4rem, and the ghost that
// follows the pointer while the item is dragged out goes up to 22rem on its long side (see
// components/drag-layer). Rasterising at the sprite-sized 96px threw that away -- a flat group
// (several stacks side by side) kept only a few pixels of height, and showing it any bigger turned
// into either a stretched or a blurry ghost. 320 keeps the short side of a flat group above the size
// the drag layer asks for, without handing the backpack a full-resolution picture.
const THUMBNAIL_MAX_DIMENSION = 320;

const codePayload = ({blockObjects, topBlockId, topBlockIds, frames}) => {    const payload = {
        type: 'script', // Needs to match backpack-server type name
        name: 'code', // All code currently gets the same name
        mime: 'application/json',
        // Backpack expects a base64 encoded string to store. Cannot use btoa because
        // the code can contain characters outside the 0-255 code-point range supported by btoa
        // An item that carries a frame (lib/frame-backpack) stores both halves here.
        body: Base64.encode(JSON.stringify(withFrames(blockObjects, frames))) // Base64 encode the json
    };

    // The thumbnail is cosmetic: if the block's SVG cannot be turned into an image (an unloaded
    // stack, an odd glyph), the item still belongs in the backpack. Letting that rejection through
    // used to fail the whole add, which looks exactly like "nothing happened".
    // A box selection or a frame holds more than one stack: draw all of them, in their canvas
    // arrangement, instead of only the stack that happens to be first.
    const ids = Array.isArray(topBlockIds) && topBlockIds.length ? topBlockIds : topBlockId;

    return Promise.resolve()
        .then(() => blockToImage(ids, frames))
        .then(picture => createThumbnail(picture, THUMBNAIL_MAX_DIMENSION))
        .catch(error => {
            log.warn('Backpack item has no thumbnail:', error);
            return '';
        })
        .then(thumbnail => {
            payload.thumbnail = thumbnail;
            return payload;
        });
};

const findTopBlock = payload => {
    const blocks = payload.extensionURLs ? payload.blocks : payload;
    return blocks.find(i => i.topLevel);
};

const placeInViewport = (payload, workspaceMetrics, isRtl) => {
    const topBlock = findTopBlock(payload);
    if (topBlock) {
        const {scrollX, scrollY, scale} = workspaceMetrics || {
            scrollX: 0,
            scrollY: 0,
            scale: BLOCKS_DEFAULT_SCALE
        };

        const posY = -scrollY + 30;
        let posX;
        if (isRtl) {
            posX = scrollX + 30;
        } else {
            posX = -scrollX + 30;
        }

        // A multi-stack payload (a box-selection item) moves as a group:
        // anchor the first stack and shift the other top-level stacks by the
        // same delta so their relative arrangement is preserved.
        const newX = posX / scale;
        const newY = posY / scale;
        const dx = newX - topBlock.x;
        const dy = newY - topBlock.y;
        topBlock.x = newX;
        topBlock.y = newY;
        const allBlocks = payload.extensionURLs ? payload.blocks : payload;
        for (const b of allBlocks) {
            if (b !== topBlock && b.topLevel) {
                b.x += dx;
                b.y += dy;
            }
        }
        // An item that carries a frame (see lib/frame-backpack) has to travel with its scripts,
        // or the box ends up somewhere else on the canvas than the scripts it was drawn around.
        if (payload.frames) payload.frames = shiftFramesXml(payload.frames, dx, dy);
        // Comments need no shifting here: they store an offset from their anchored
        // stack's top-level block (see exportStandaloneBlocks), which
        // shareBlocksToTarget resolves against the already-moved blocks.
    }

    return payload;
};

export {
    codePayload as default,
    findTopBlock,
    placeInViewport
};
