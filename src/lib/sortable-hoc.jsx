import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {indexForPositionOnList} from './drag-utils';

/* The preview following the pointer is the <img> rendered by components/drag-layer. Turning the
   drag offset into its rectangle needs the preview's size and its (constant) offset from the
   pointer: the -50% margins centre a square tile, but a percentage margin is always relative to
   the *width*, so a wide, flat code frame sits higher than the pointer. Measure both once per
   drag instead of touching the DOM on every pointer move. */
const DRAG_GHOST_SELECTOR = '[data-hm-drag-ghost]';
const FALLBACK_GHOST_SIZE = 80; // drag-layer.css .image max-width / max-height
let dragGhostMetrics = null;

const resetDragGhostMetrics = () => {
    dragGhostMetrics = null;
};

/**
 * Rectangle of the drag preview, in the same viewport coordinates as the item rects.
 * @param {{x: number, y: number}} position current drag offset
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
const getDragGhostRect = ({x, y}) => {
    if (!dragGhostMetrics) {
        const ghost = document.querySelector(DRAG_GHOST_SELECTOR);
        const rect = ghost && ghost.getBoundingClientRect();
        if (rect && rect.width && rect.height) {
            dragGhostMetrics = {
                width: rect.width,
                height: rect.height,
                offsetX: ((rect.left + rect.right) / 2) - x,
                offsetY: ((rect.top + rect.bottom) / 2) - y
            };
        }
    }
    const width = dragGhostMetrics ? dragGhostMetrics.width : FALLBACK_GHOST_SIZE;
    const height = dragGhostMetrics ? dragGhostMetrics.height : FALLBACK_GHOST_SIZE;
    const centerX = x + (dragGhostMetrics ? dragGhostMetrics.offsetX : 0);
    const centerY = y + (dragGhostMetrics ? dragGhostMetrics.offsetY : 0);
    return {
        left: centerX - (width / 2),
        right: centerX + (width / 2),
        top: centerY - (height / 2),
        bottom: centerY + (height / 2)
    };
};

const SortableHOC = function (WrappedComponent) {
    class SortableWrapper extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'setRef',
                'handleAddSortable',
                'handleRemoveSortable'
            ]);

            this.sortableRefs = [];
            this.boxes = [];
            this.ref = null;
            this.containerBox = null;
        }

        componentWillReceiveProps (newProps) {
            if (newProps.dragInfo.dragging && !this.props.dragInfo.dragging) {
                resetDragGhostMetrics();
                // Drag just started, snapshot the bounding boxes for sortables. The hit test
                // groups them into rows itself, so a wrapped (multi-column) list and a plain
                // vertical list take the same path from here on.
                this.boxes = this.sortableRefs
                    .map(el => el && el.getBoundingClientRect())
                    .filter(Boolean);
                if (!this.ref) {
                    throw new Error('The containerRef must be assigned to the sortable area');
                }
                this.containerBox = this.ref.getBoundingClientRect();
            } else if (!newProps.dragInfo.dragging && this.props.dragInfo.dragging) {
                const newIndex = this.getMouseOverIndex();
                if (newIndex !== null) {
                    this.props.onDrop(Object.assign({}, this.props.dragInfo, {newIndex}));
                }
            }
        }

        handleAddSortable (node) {
            this.sortableRefs.push(node);
        }

        handleRemoveSortable (node) {
            const index = this.sortableRefs.indexOf(node);
            this.sortableRefs = this.sortableRefs.slice(0, index)
                .concat(this.sortableRefs.slice(index + 1));
        }

        getOrdering (items, draggingIndex, newIndex) {
            // An "Ordering" is an array of indices, where the position array value corresponds
            // to the position of the item in props.items, and the index of the value
            // is the index at which the item should appear.
            // That is, if props.items is ['a', 'b', 'c', 'd'], and we want the GUI to display
            // ['b', 'c', 'a, 'd'], the value of "ordering" would be [1, 2, 0, 3].
            // This mapping is used because it is easy to translate to flexbox ordering,
            // the `order` property for item N is ordering.indexOf(N).
            // If the user-facing order matches props.items, the ordering is just [0, 1, 2, ...]
            let ordering = Array(this.props.items.length).fill(0)
                .map((_, i) => i);
            const isNumber = v => typeof v === 'number' && !isNaN(v);
            if (isNumber(draggingIndex) && isNumber(newIndex)) {
                ordering = ordering.slice(0, draggingIndex).concat(ordering.slice(draggingIndex + 1));
                ordering.splice(newIndex, 0, draggingIndex);
            }
            return ordering;
        }

        getMouseOverIndex () {
            // MouseOverIndex is the index that the current drag wants to place the
            // the dragging object. Obviously only exists if there is a drag (i.e. currentOffset).
            // Return null if outside the container, zero if there are no boxes.
            let mouseOverIndex = null;
            if (this.props.dragInfo.currentOffset) {
                const {x, y} = this.props.dragInfo.currentOffset;
                const {top, left, bottom, right} = this.containerBox;
                if (x >= left && x <= right && y >= top && y <= bottom) {
                    if (this.boxes.length === 0) {
                        mouseOverIndex = 0;
                    } else {
                        mouseOverIndex = indexForPositionOnList(
                            this.props.dragInfo.currentOffset, this.boxes, this.props.isRtl,
                            getDragGhostRect(this.props.dragInfo.currentOffset));
                    }
                }
            }
            return mouseOverIndex;
        }
        setRef (el) {
            this.ref = el;
        }
        render () {
            const {dragInfo: {index: dragIndex, dragType}, items} = this.props;
            const mouseOverIndex = this.getMouseOverIndex();
            const ordering = this.getOrdering(items, dragIndex, mouseOverIndex);
            return (
                <WrappedComponent
                    containerRef={this.setRef}
                    draggingIndex={dragIndex}
                    draggingType={dragType}
                    mouseOverIndex={mouseOverIndex}
                    ordering={ordering}
                    onAddSortable={this.handleAddSortable}
                    onRemoveSortable={this.handleRemoveSortable}
                    {...this.props}
                />
            );
        }
    }

    SortableWrapper.propTypes = {
        dragInfo: PropTypes.shape({
            currentOffset: PropTypes.shape({
                x: PropTypes.number,
                y: PropTypes.number
            }),
            dragType: PropTypes.string,
            dragging: PropTypes.bool,
            index: PropTypes.number
        }),
        items: PropTypes.arrayOf(PropTypes.shape({
            url: PropTypes.string,
            name: PropTypes.string.isRequired
        })),
        onClose: PropTypes.func,
        onDrop: PropTypes.func,
        isRtl: PropTypes.bool
    };

    const mapStateToProps = state => ({
        dragInfo: state.scratchGui.assetDrag,
        isRtl: state.locales.isRtl
    });

    const mapDispatchToProps = () => ({});

    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(SortableWrapper);
};

export default SortableHOC;
