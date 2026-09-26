// custom-procedures.jsx (容器文件)
import bindAll from 'lodash.bindall';
import defaultsDeep from 'lodash.defaultsdeep';
import PropTypes from 'prop-types';
import React from 'react';
import CustomProceduresComponent from '../components/custom-procedures/custom-procedures.jsx';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import {connect} from 'react-redux';

// Keep in sync with the opening animation of the modal (components/modal/modal.css).
const WIDGET_REALIGN_DURATION = 260;

class CustomProcedures extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleAddLabel',
            'handleAddBoolean',
            'handleAddTextNumber',
            'handleToggleWarp',
            'handleCancel',
            'handleClosing',
            'handleOk',
            'setBlocks',
            'realignEditorWidget'
        ]);
        this.state = {
            rtlOffset: 0,
            warp: false,
        };
        this.editorRealignFrame = null;
        // Set by handleOk, consumed by handleCancel when the exit animation is over.
        this.pendingMutation = null;
        // ResizeObserver watching the workspace container so the Blockly workspace follows the
        // window resizing (the "convert modals to windows" setting turns this modal into a
        // resizable window, which does not fire a real window resize event).
        this.workspaceResizeObserver = null;
    }

    componentWillUnmount() {
        if (this.editorRealignFrame) {
            cancelAnimationFrame(this.editorRealignFrame);
            this.editorRealignFrame = null;
        }
        if (this.onWindowMoved) {
            document.removeEventListener('hm-window-moved', this.onWindowMoved);
            this.onWindowMoved = null;
        }
        if (this.workspaceResizeObserver) {
            this.workspaceResizeObserver.disconnect();
            this.workspaceResizeObserver = null;
        }
        if (this.workspace) {
            this.workspace.dispose();
        }
    }

    /**
     * Blockly renders the inline editors of the procedure declaration into a div that is appended
     * to <body> (Blockly.WidgetDiv) and positions it once, from the bounding box of the field at
     * the moment it gets focused. This modal slides up for ~220ms while it opens, so an editor
     * focused at the start of that animation is measured at the offset it has when it appears and
     * then stays there while the block keeps moving. Re-align it on every frame until the opening
     * animation is over, so it travels together with the block it belongs to.
     */
    realignEditorWidget() {
        if (this.editorRealignFrame) {
            cancelAnimationFrame(this.editorRealignFrame);
            this.editorRealignFrame = null;
        }
        const widgetDiv = LazyScratchBlocks.get().WidgetDiv;
        const startedAt = performance.now();
        const step = () => {
            this.editorRealignFrame = null;
            if (!widgetDiv.owner_) {
                // the editor was closed while the animation was still running
                return;
            }
            widgetDiv.repositionForWindowResize();
            if ((performance.now() - startedAt) < WIDGET_REALIGN_DURATION) {
                this.editorRealignFrame = requestAnimationFrame(step);
            }
        };
        this.editorRealignFrame = requestAnimationFrame(step);
    }

    setBlocks(blocksRef) {
        if (!blocksRef) return;
        this.blocks = blocksRef;
        const workspaceConfig = defaultsDeep({},
            CustomProcedures.defaultOptions,
            this.props.options,
            { rtl: this.props.isRtl }
        );

        const ScratchBlocks = LazyScratchBlocks.get();
        const oldDefaultToolbox = ScratchBlocks.Blocks.defaultToolbox;
        ScratchBlocks.Blocks.defaultToolbox = null;
        this.workspace = ScratchBlocks.inject(this.blocks, workspaceConfig);
        ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;

        this.mutationRoot = this.workspace.newBlock('procedures_declaration');
        this.mutationRoot.setMovable(false);
        this.mutationRoot.setDeletable(false);
        this.mutationRoot.contextMenu = false;

        // Keep the procedure declaration block centered in the viewport. Reused both on every
        // workspace change (so adding/removing inputs keeps it centered) and after the window is
        // resized (so the block re-centers immediately instead of only on the next change, which
        // would make it visibly "jump").
        this.recenterMutationRoot = () => {
            if (!this.mutationRoot) return;
            const metrics = this.workspace.getMetrics();
            const { x, y } = this.mutationRoot.getRelativeToSurfaceXY();
            const dy = (metrics.viewHeight / 2) - (this.mutationRoot.height / 2) - y;
            let dx;
            if (this.props.isRtl) {
                const ltrX = ((metrics.viewWidth / 2) - (this.mutationRoot.width / 2) + 25);
                const mirrorX = x - ((x - this.state.rtlOffset) * 2);
                if (mirrorX === ltrX) {
                    return;
                }
                dx = mirrorX - ltrX;
                const midPoint = metrics.viewWidth / 2;
                if (x === 0) {
                    if (this.mutationRoot.width < midPoint) {
                        dx = ltrX;
                    } else if (this.mutationRoot.width < metrics.viewWidth) {
                        dx = midPoint - ((metrics.viewWidth - this.mutationRoot.width) / 2);
                    } else {
                        dx = midPoint + (this.mutationRoot.width - metrics.viewWidth);
                    }
                    this.mutationRoot.moveBy(dx, dy);
                    this.setState({ rtlOffset: this.mutationRoot.getRelativeToSurfaceXY().x });
                    return;
                }
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = dx + this.mutationRoot.width - metrics.viewWidth;
                }
            } else {
                dx = (metrics.viewWidth / 2) - (this.mutationRoot.width / 2) - x;
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = metrics.viewWidth - this.mutationRoot.width - x;
                }
            }
            this.mutationRoot.moveBy(dx, dy);
        };
        this.workspace.addChangeListener(() => {
            this.mutationRoot.onChangeFn();
            this.recenterMutationRoot();
        });
        this.mutationRoot.domToMutation(this.props.mutator);
        this.mutationRoot.initSvg();
        this.mutationRoot.render();
        this.setState({ warp: this.mutationRoot.getWarp() });

        // Keep the Blockly workspace in sync with the modal's width/height. When the modal is
        // converted into a resizable window, resizing it changes the workspace container's box
        // without firing a window resize event, so Blockly never re-measures. Watch the container
        // and re-run svgResize whenever its size changes.
        if (typeof ResizeObserver !== 'undefined' && this.blocks) {
            if (this.workspaceResizeObserver) {
                this.workspaceResizeObserver.disconnect();
            }
            this.workspaceResizeObserver = new ResizeObserver(() => {
                if (this.workspace) {
                    ScratchBlocks.svgResize(this.workspace);
                    // The resize changed the viewport size, so re-center the procedure block
                    // immediately. Otherwise it would stay offset until the next workspace change
                    // (e.g. focusing an input editor) snaps it back to center, which looks like a
                    // jump.
                    this.recenterMutationRoot();
                }
            });
            this.workspaceResizeObserver.observe(this.blocks);
        }

        // When the modal is converted into a movable window (the "convert modals to windows"
        // setting), dragging/resizing the window moves the container but Blockly's inline editor
        // (WidgetDiv) is appended to <body> and positioned once, so it would stay behind while the
        // window moves. window-modal dispatches 'hm-window-moved' on every move; re-align the
        // editor so it travels together with the field it edits.
        this.onWindowMoved = e => {
            const movedContent = e.detail && e.detail.content;
            if (!movedContent || !this.blocks) return;
            if (!movedContent.contains(this.blocks)) return;
            const widgetDiv = LazyScratchBlocks.get().WidgetDiv;
            if (!widgetDiv.owner_) return;
            widgetDiv.repositionForWindowResize();
        };
        document.addEventListener('hm-window-moved', this.onWindowMoved);

        setTimeout(() => {
            this.mutationRoot.focusLastEditor_();
            this.realignEditorWidget();
        });
    }

    /**
     * Final close callback, invoked by the modal once the exit animation is over (close button,
     * ESC, clicking the background, browser back, and the Cancel/OK buttons below, which close
     * through the modal). A mutation set by handleOk means the procedure was confirmed.
     */
    handleCancel() {
        const mutation = this.pendingMutation || undefined;
        this.pendingMutation = null;
        this.props.onRequestClose(mutation);
    }

    /**
     * Called by containers/modal.jsx as soon as the close animation starts, while this component
     * is still mounted. The inline editor of the procedure declaration is not a child of the modal
     * (Blockly appends it to <body>), so it would otherwise stay floating over the page for the
     * whole exit animation. Hide it right away, exactly like closing the editor normally does.
     */
    handleClosing() {
        if (this.editorRealignFrame) {
            cancelAnimationFrame(this.editorRealignFrame);
            this.editorRealignFrame = null;
        }
        if (!LazyScratchBlocks.isLoaded()) return;
        LazyScratchBlocks.get().WidgetDiv.hide(true);
    }

    handleOk(requestClose) {
        this.pendingMutation = this.mutationRoot ? this.mutationRoot.mutationToDom(true) : null;
        requestClose();
    }

    handleAddLabel() {
        if (this.mutationRoot) {
            this.mutationRoot.addLabelExternal();
        }
    }

    handleAddBoolean() {
        if (this.mutationRoot) {
            this.mutationRoot.addBooleanExternal();
        }
    }

    handleAddTextNumber() {
        if (this.mutationRoot) {
            this.mutationRoot.addStringNumberExternal();
        }
    }

    handleToggleWarp() {
        if (this.mutationRoot) {
            const newWarp = !this.mutationRoot.getWarp();
            this.mutationRoot.setWarp(newWarp);
            this.setState({ warp: newWarp });
        }
    }

    render() {
        return (
            <CustomProceduresComponent
                componentRef={this.setBlocks}
                warp={this.state.warp}
                onAddBoolean={this.handleAddBoolean}
                onAddLabel={this.handleAddLabel}
                onAddTextNumber={this.handleAddTextNumber}
                onCancel={this.handleCancel}
                onClosing={this.handleClosing}
                onOk={this.handleOk}
                onToggleWarp={this.handleToggleWarp}
            />
        );
    }
}

CustomProcedures.propTypes = {
    isRtl: PropTypes.bool,
    mutator: PropTypes.instanceOf(Element),
    onRequestClose: PropTypes.func.isRequired,
    options: PropTypes.shape({
        media: PropTypes.string,
        zoom: PropTypes.shape({
            controls: PropTypes.bool,
            wheel: PropTypes.bool,
            startScale: PropTypes.number
        }),
        comments: PropTypes.bool,
        collapse: PropTypes.bool
    }),
    vm: PropTypes.object
};

CustomProcedures.defaultOptions = {
    zoom: {
        controls: false,
        wheel: true,
        startScale: 0.9
    },
    comments: false,
    collapse: false,
    scrollbars: true
};

CustomProcedures.defaultProps = {
    options: CustomProcedures.defaultOptions
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl,
    mutator: state.scratchGui.customProcedures.mutator
});

export default connect(
    mapStateToProps
)(CustomProcedures);
