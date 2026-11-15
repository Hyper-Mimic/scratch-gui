import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import DragConstants from '../../lib/drag-constants';
import styles from './drag-layer.css';

/* Only a code item needs a ghost sized from its own picture. Sprites, costumes and sounds are
   ordinary tiles: they keep the fixed 50-80px box from drag-layer.css (.image), as they did before
   8eab4dd, so dragging a 4x4 costume and a 480x360 one feels identical. A whole code frame is a
   wide, flat strip that the fixed box would either crush or stretch, hence the exception. */
const AUTO_SIZED_DRAG_TYPES = [DragConstants.CODE, DragConstants.BACKPACK_CODE];

/* How big the ghost should be (code items only).

   A code item's picture is a whole group of code stacks, frequently a wide, flat strip. Sizing that
   with one `max-width`/`max-height` pair (the fixed box ordinary tiles use) measures it
   by its LONG side, so a strip comes out a few pixels tall -- the ghost looks like nothing was
   picked up. A floor on the short side instead would have to distort it, which is the stretched
   square this used to show. So the scale is picked from the picture's own dimensions:

     - a squarish picture is fitted into BOX (10rem) on its long side;
     - its short side is then raised to SHORT (3.5rem) if that left it smaller: that is what makes a
       flat item grow rather than shrink, and only the scale changes, never the aspect ratio;
     - the long side is finally capped at LONG (22rem) so an extreme strip cannot run across the
       screen. Where the floor and the cap disagree (very flat pictures), the cap wins.

   All of these are multiples of the root font size, like the rest of the GUI. */
const BOX_REM = 10;
const SHORT_REM = 3.5;
const LONG_REM = 22;
// A thumbnail is a PNG (lib/backpack/thumbnail) with a fixed resolution, so it can only be blown up
// so far before it turns to mush. Vector art has no such limit and is scaled freely; code item
// thumbnails are rasterised large enough (lib/backpack/code-payload) that they stay under this.
const RASTER_MAX_SCALE = 1.5;

const rootFontSize = () => parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;

/**
 * Size the ghost from the image it is showing.
 * Runs on load, once the intrinsic size is known: the pictures are generated per item (a code
 * item's thumbnail is an SVG whose width/height are the group's bounding box), so nothing else in
 * the app knows how big it "should" be.
 * @param {SyntheticEvent} e load event of the <img>
 * @returns {void}
 */
const sizeGhost = e => {
    const image = e.currentTarget;
    const {naturalWidth, naturalHeight} = image;
    if (!naturalWidth || !naturalHeight) {
        // No intrinsic size to measure: the CSS caps stand in, which is only right if it is shown.
        image.style.visibility = 'visible';
        return;
    }
    const em = rootFontSize();
    const long = Math.max(naturalWidth, naturalHeight);
    const short = Math.min(naturalWidth, naturalHeight);
    const isVector = /^data:image\/svg\+xml/.test(image.currentSrc || image.src || '');
    let scale = (BOX_REM * em) / long;
    scale = Math.max(scale, (SHORT_REM * em) / short);
    scale = Math.min(scale, (LONG_REM * em) / long);
    if (!isVector) {
        scale = Math.min(scale, RASTER_MAX_SCALE);
    }
    image.style.width = `${Math.round(naturalWidth * scale)}px`;
    image.style.height = `${Math.round(naturalHeight * scale)}px`;
    // The picture only becomes visible now that it already has the size it will keep -- see the
    // `visibility` note in drag-layer.css.
    image.style.visibility = 'visible';
};

/**
 * A picture that cannot be measured still has to be carryable: show it at its own size rather than
 * leave an invisible ghost behind the pointer.
 * @param {SyntheticEvent} e error event of the <img>
 * @returns {void}
 */
const showUnmeasured = e => {
    e.currentTarget.style.visibility = 'visible';
};

/**
 * Cover for a picture the browser had already decoded before the element was mounted: `complete` is
 * true then, and the load event can land so promptly that the ghost would stay hidden (a data-url
 * thumbnail is in memory already, so this is the common case, not the corner case).
 * @param {?HTMLImageElement} image the mounted element, or null on unmount
 * @returns {void}
 */
const sizeIfAlreadyLoaded = image => {
    if (image && image.complete) sizeGhost({currentTarget: image});
};

const DragLayer = ({dragging, img, currentOffset, dragType}) => {
    if (!dragging) return null;
    const autoSize = AUTO_SIZED_DRAG_TYPES.indexOf(dragType) !== -1;
    return (
        <div className={styles.dragLayer}>
            <div
                className={styles.imageWrapper}
                style={{
                    transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`
                }}
            >
                <img
                    className={classNames(styles.image, {[styles.autoSized]: autoSize})}
                    // Stable hook for lib/sortable-hoc: the sorting hit test measures this node's
                    // real size. CSS Modules hashes the class, so a data attribute is the reliable
                    // way to find the ghost from the other side of the component tree.
                    data-hm-drag-ghost=""
                    src={img}
                    draggable={false}
                    // A fresh element per picture: the auto size is written straight onto the node,
                    // so reusing one across two drags would show the second picture at the first
                    // one's size until its own load event landed.
                    key={img}
                    onError={autoSize ? showUnmeasured : null}
                    onLoad={autoSize ? sizeGhost : null}
                    ref={autoSize ? sizeIfAlreadyLoaded : null}
                />
            </div>
        </div>
    );
};

DragLayer.propTypes = {
    currentOffset: PropTypes.shape({
        x: PropTypes.number.isRequired,
        y: PropTypes.number.isRequired
    }),
    dragging: PropTypes.bool.isRequired,
    dragType: PropTypes.string,
    img: PropTypes.string
};

export default DragLayer;
