/**
 * @fileoverview
 * Utility functions for drag interactions, e.g. sorting items in a grid/list.
 */

// Tiles on the same flex row share a `top`, but a theme/addon margin or subpixel rounding can
// shift one of them by a few pixels. A few px of tolerance keeps a single shifted tile from
// becoming its own "row" and scrambling the reading order. Row pitch is a whole tile height
// (~5rem), so this is far below anything that could merge two real rows.
const ROW_TOLERANCE = 4;

/**
 * Put a snapshot of item rects into visual (reading) order while keeping the row boundaries.
 * A plain vertical list simply ends up with one row per item; a wrapped grid needs both the
 * flat order and the rows to resolve a pointer position.
 * @param {Array.<DOMRect>} boxes rects in DOM order, possibly with empty slots
 * @param {boolean} isRtl reverse the left-to-right order inside each row
 * @returns {Array.<Array.<DOMRect>>} rows, top-to-bottom, each in reading order
 */
// `SortableHOC` takes one rect snapshot per drag and re-runs the hit test on every pointer
// move; keep that snapshot's grouping so the sort does not happen once per frame.
let cachedBoxes = null;
let cachedIsRtl = null;
let cachedRows = null;
const groupBoxesIntoRows = (boxes, isRtl) => {
    if (boxes === cachedBoxes && isRtl === cachedIsRtl) return cachedRows;
    const sorted = boxes.filter(Boolean).slice().sort((a, b) =>
        (a.top - b.top) || ((a.left - b.left) * (isRtl ? -1 : 1)));
    const rows = [];
    for (const box of sorted) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last[0].top - box.top) <= ROW_TOLERANCE) last.push(box);
        else rows.push([box]);
    }
    // A tolerance-merged tile can have arrived out of left-to-right order (it sorted later
    // because of its shifted top), so make the reading order explicit for every row.
    for (const row of rows) row.sort((a, b) => (a.left - b.left) * (isRtl ? -1 : 1));
    cachedBoxes = boxes;
    cachedIsRtl = isRtl;
    cachedRows = rows;
    return rows;
};

/**
 * The original single-column hit test. Boxes are "extended" out to infinity along the outer
 * edges, which only holds while every row is flush against the same left and right edges --
 * i.e. a single column (or a single row). Kept verbatim so the stock layout and the sprite
 * list keep exactly the behaviour they had before the widened asset list existed.
 * @param {{x: number, y: number}} position The xy coordinates to hit test.
 * @param {Array.<DOMRect>} boxes rects in visual order.
 * @param {boolean} isRtl are the boxes in RTL order.
 * @return {?number} visual index of the hit box, or null if there is none.
 */
const indexForPositionOnColumn = ({x, y}, boxes, isRtl) => {
    if (boxes.length === 0) return null;
    let index = null;
    const leftEdge = Math.min.apply(null, boxes.map(b => b.left));
    const rightEdge = Math.max.apply(null, boxes.map(b => b.right));
    const topEdge = Math.min.apply(null, boxes.map(b => b.top));
    const bottomEdge = Math.max.apply(null, boxes.map(b => b.bottom));
    for (let n = 0; n < boxes.length; n++) {
        const box = boxes[n];
        let minX = box.left === leftEdge ? -Infinity : box.left;
        let maxX = box.right === rightEdge ? Infinity : box.right;
        const minY = box.top === topEdge ? -Infinity : box.top;
        const maxY = box.bottom === bottomEdge ? Infinity : box.bottom;
        if (n === boxes.length - 1) {
            if (isRtl) minX = -Infinity;
            else maxX = Infinity;
        }
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            index = n;
            break;
        }
    }
    return index;
};

/**
 * Area of the intersection of two rectangles. Zero when they only touch an edge.
 * @param {{left: number, right: number, top: number, bottom: number}} a
 * @param {{left: number, right: number, top: number, bottom: number}} b
 * @returns {number} overlap area in px^2
 */
const overlapArea = (a, b) => {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return width > 0 && height > 0 ? width * height : 0;
};

/**
 * Collision test between the *drag preview* (the ghost following the pointer) and the tiles of a
 * wrapped grid. A point hit test is too eager here: as soon as the pointer passes the middle of a
 * tile, the item is inserted after it -- even when the preview is still mostly covering the tile's
 * left half, or mostly covering a different tile. Use the tile the ghost actually covers most,
 * then look at which half of that tile is covered to decide before vs. after.
 * @param {{left: number, right: number, top: number, bottom: number}} ghostRect drag preview rect.
 * @param {Array.<Array.<DOMRect>>} rows rects grouped into rows, top-to-bottom, each in reading order.
 * @param {boolean} isRtl are the boxes in RTL order.
 * @return {?number} flat visual insertion index, or null when the ghost covers no tile at all.
 */
const indexForGhostOnGrid = (ghostRect, rows, isRtl) => {
    if (!rows.length || !rows[0].length) return null;
    const total = rows.reduce((n, row) => n + row.length, 0);

    let bestIndex = -1;
    let bestBox = null;
    let bestArea = 0;
    let flatIndex = 0;
    for (const row of rows) {
        for (const box of row) {
            const area = overlapArea(ghostRect, box);
            // Strict `>` keeps the first (reading-order) tile on a tie instead of flickering
            // between two neighbours while the pointer is exactly between them.
            if (area > bestArea) {
                bestArea = area;
                bestIndex = flatIndex;
                bestBox = box;
            }
            flatIndex++;
        }
    }
    if (!bestBox) return null;

    const center = (bestBox.left + bestBox.right) / 2;
    const leftHalf = {
        left: bestBox.left, right: center, top: bestBox.top, bottom: bestBox.bottom
    };
    const rightHalf = {
        left: center, right: bestBox.right, top: bestBox.top, bottom: bestBox.bottom
    };
    // In RTL the right half is the leading one in reading order. `>=` biases a tie (or a ghost
    // sitting almost entirely on the leading half) towards inserting *before* the tile, which is
    // the forgiving side: a slight brush on the trailing edge must not jump the item past it.
    const leadingArea = overlapArea(ghostRect, isRtl ? rightHalf : leftHalf);
    const trailingArea = overlapArea(ghostRect, isRtl ? leftHalf : rightHalf);
    const before = leadingArea >= trailingArea;
    return before ? bestIndex : Math.min(bestIndex + 1, total - 1);
};

/**
 * Point hit test for a *wrapped grid* of tiles (the widened costume / sound list). This is the
 * fallback for the empty space around the grid; whenever the drag preview covers a tile,
 * `indexForGhostOnGrid` wins instead. Unlike the
 * single-column version this does a real rectangle collision: each tile's hit box grows by
 * half of the measured gap, so the gaps between tiles belong to a tile instead of being dead
 * zones. The horizontal half of the hit tile decides whether the dragged item goes before or
 * after it (RTL reverses that). Only the empty space outside the grid -- a row's left/right
 * margin, the `:after` scroll spacer -- falls back to a row + horizontal-midpoint resolution.
 * @param {{x: number, y: number}} position The xy coordinates to hit test.
 * @param {Array.<Array.<DOMRect>>} rows rects grouped into rows, top-to-bottom, each in reading order.
 * @param {boolean} isRtl are the boxes in RTL order.
 * @return {?number} flat visual insertion index, or null when there are no boxes.
 */
const indexForPositionOnGrid = ({x, y}, rows, isRtl) => {
    if (!rows.length || !rows[0].length) return null;
    const total = rows.reduce((n, row) => n + row.length, 0);

    // Derive the gaps from the boxes themselves rather than reading CSS: the list may be
    // themed, compacted, or zoomed. Half a gap on each side covers the space between two
    // tiles without making neighbouring hit boxes overlap.
    let gapX = 0;
    let gapY = 0;
    for (const row of rows) {
        for (let n = 1; n < row.length; n++) {
            const gap = isRtl ? row[n - 1].left - row[n].right : row[n].left - row[n - 1].right;
            if (gap > 0) gapX = gapX ? Math.min(gapX, gap) : gap;
        }
    }
    const bottoms = rows.map(row => Math.max.apply(null, row.map(b => b.bottom)));
    const tops = rows.map(row => Math.min.apply(null, row.map(b => b.top)));
    for (let n = 1; n < rows.length; n++) {
        const gap = tops[n] - bottoms[n - 1];
        if (gap > 0) gapY = gapY ? Math.min(gapY, gap) : gap;
    }
    const padX = gapX / 2;
    const padY = gapY / 2;

    // 1. Real collision with a tile.
    let flatIndex = 0;
    for (const row of rows) {
        for (const box of row) {
            if (x >= box.left - padX && x <= box.right + padX &&
                y >= box.top - padY && y <= box.bottom + padY) {
                const center = (box.left + box.right) / 2;
                const before = isRtl ? x > center : x < center;
                return before ? flatIndex : Math.min(flatIndex + 1, total - 1);
            }
            flatIndex++;
        }
    }

    // 2. Empty space around the grid. Split rows at the middle of the gap so no row gap is a
    // dead zone, and clamp above the first row / below the last one to the outermost row.
    let rowIndex = rows.length - 1;
    for (let n = 0; n < rows.length - 1; n++) {
        if (y <= (bottoms[n] + tops[n + 1]) / 2) {
            rowIndex = n;
            break;
        }
    }
    let firstIndex = 0;
    for (let n = 0; n < rowIndex; n++) firstIndex += rows[n].length;
    const row = rows[rowIndex];
    for (let n = 0; n < row.length; n++) {
        const box = row[n];
        const center = (box.left + box.right) / 2;
        if (isRtl ? x > center : x < center) return firstIndex + n;
    }
    // Never leave the boxes' index range. The ordering code treats N-1 as "append at the end".
    return Math.min(firstIndex + row.length, total - 1);
};

/**
 * From an xy position and a list of boxes {top, left, bottom, right}, return the visual index
 * the dragged item should be inserted before. Works for a single column of items, a wrapped
 * multi-column grid, or a single row of items -- the row grouping decides which hit test to
 * use, so callers do not need to know how wide the list is.
 *
 * A wrapped grid prefers the drag preview's overlap with the tiles (see `indexForGhostOnGrid`).
 * The point hit test remains as the fallback for empty space around the grid, and is the only
 * test used for a single column, whose extended-box behaviour must not change.
 * @param {{x: number, y: number}} position The xy coordinates to retreive the corresponding index of.
 * @param {Array.<DOMRect>} boxes The rects of the items, returned from `getBoundingClientRect`
 * @param {bool} isRtl are the boxes in RTL order.
 * @param {?{left: number, right: number, top: number, bottom: number}} ghostRect drag preview rect.
 * @return {?number} insertion index, or null if one could not be found.
 */
const indexForPositionOnList = (position, boxes, isRtl, ghostRect) => {
    const rows = groupBoxesIntoRows(boxes, isRtl);
    if (!rows.length) return null;
    if (rows.some(row => row.length > 1)) {
        if (ghostRect) {
            const areaIndex = indexForGhostOnGrid(ghostRect, rows, isRtl);
            if (areaIndex !== null) return areaIndex;
        }
        // No tile is covered at all (blank margin / scroll spacer): fall back to the point test
        // so the outer edges of the list still have a usable insertion target.
        return indexForPositionOnGrid(position, rows, isRtl);
    }
    return indexForPositionOnColumn(position, rows.map(row => row[0]), isRtl);
};

export {
    indexForPositionOnList
};
