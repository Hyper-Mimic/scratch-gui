// custom-procedures.jsx (容器文件)
import bindAll from 'lodash.bindall';
import defaultsDeep from 'lodash.defaultsdeep';
import PropTypes from 'prop-types';
import React from 'react';
import CustomProceduresComponent from '../components/custom-procedures/custom-procedures.jsx';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import {connect} from 'react-redux';

class CustomProcedures extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleAddLabel',
            'handleAddBoolean',
            'handleAddTextNumber',
            'handleToggleWarp',
            'handleCancel',
            'handleOk',
            'setBlocks',
            'handleBuiltBlocks',
            'handleSelectBlock',
            'handleViewAllBlocks',
            'handleBackToCurrentSprite',
            'getCurrentTarget',
            'getCurrentSpriteProccodes',
            'getAllProccodes',
            'loadDropdownData',
            'updateDropdownPosition',
            'buildProcedureFromData'
            
        ]);
        this.state = {
            rtlOffset: 0,
            warp: false,
            showDropdown: false,
            blockList: [],
            allBlockList: [],
            selectedBlock: null,
            showAllBlocks: false,
            dropdownPosition: { top: 0, left: 0 }
        };
        this.buttonRef = React.createRef();
    }

    componentWillUnmount() {
        if (this.workspace) {
            this.workspace.dispose();
        }
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

        this.workspace.addChangeListener(() => {
            this.mutationRoot.onChangeFn();
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
        });
        this.mutationRoot.domToMutation(this.props.mutator);
        this.mutationRoot.initSvg();
        this.mutationRoot.render();
        this.setState({ warp: this.mutationRoot.getWarp() });
        setTimeout(() => {
            this.mutationRoot.focusLastEditor_();
        });
    }

    // ==================== Built Blocks 功能 ====================

    // 获取 VM
    getVM() {
        if (this.props.vm) return this.props.vm;
        if (window.vm) return window.vm;
        if (window.Scratch && window.Scratch.vm) return window.Scratch.vm;
        return null;
    }

    // 获取当前选中的角色
    getCurrentTarget(vm) {
        try {
            // 从 vm 的 editingTarget 获取
            if (vm.editingTarget) {
                return vm.editingTarget;
            }

            // 回退到舞台
            const fallback = targets[0];
            return fallback;
        } catch (error) {
            console.error('[Built Blocks] Fail to getCurrentTarget:', error);
            return null;
        }
    }

    // 获取当前角色的 proccode
    getCurrentSpriteProccodes(vm) {
        const proccodes = [];
        try {
            // 获取当前选中的角色
            const currentTarget = this.getCurrentTarget(vm);
            if (!currentTarget) {
                return proccodes;
            }
            
            // 从 JSON 数据中获取 blocks
            const jsonString = vm.toJSON();
            const jsonData = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
            const targets = jsonData?.targets || [];
            
            // 在 targets 中查找匹配的角色
            const targetData = targets.find(t => t.name === currentTarget.sprite.name );
            if (!targetData) {
                console.warn('[Built Blocks] Sprite Not Found:', currentTarget.sprite.name);
                return proccodes;
            }
            
            const blocks = targetData?.blocks;
            if (blocks) {
                Object.keys(blocks).forEach(blockId => {
                    const block = blocks[blockId];
                    if (block?.opcode === 'procedures_prototype') {
                        const proccode = block?.mutation?.proccode;
                        if (proccode) {
                            proccodes.push({
                                proccode: proccode,
                                targetName: targetData.name,
                                blockId: blockId,
                                mutation: block?.mutation,
                                fullBlock: block
                            });
                        }
                    }
                });
            }
            
        } catch (error) {
            console.error('[Built Blocks] Fail to getCurrentSpriteProccodes', error);
        }
        return proccodes;
    }

    // 获取所有角色的 proccode
    getAllProccodes(vm) {
        const proccodes = [];
        try {
            const jsonString = vm.toJSON();
            const jsonData = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
            const targets = jsonData?.targets || [];
            
            targets.forEach(target => {
                const blocks = target?.blocks;
                if (!blocks) return;
                
                Object.keys(blocks).forEach(blockId => {
                    const block = blocks[blockId];
                    if (block?.opcode === 'procedures_prototype') {
                        const proccode = block?.mutation?.proccode;
                        if (proccode) {
                            proccodes.push({
                                proccode: proccode,
                                targetName: target.name || 'Unknow',
                                blockId: blockId,
                                mutation: block?.mutation,
                                fullBlock: block
                            });
                        }
                    }
                });
            });
        } catch (error) {
            console.error('[Built Blocks] Fail to getAllProccodes', error);
        }
        return proccodes;
    }

    // 加载下拉列表
    loadDropdownData() {
        const vm = this.getVM();
        if (!vm) {
            console.error('[Built Blocks] Fail to getVM');
            return;
        }

        try {
            const currentBlocks = this.getCurrentSpriteProccodes(vm);
            const allBlocks = this.getAllProccodes(vm);
            
            this.setState({
                blockList: currentBlocks,
                allBlockList: allBlocks,
                selectedBlock: null,
                showAllBlocks: false
            });
        } catch (error) {
            console.error('[Built Blocks] Fail to get-Blocks(Procedures)-Data:', error);
        }
    }

    // 计算下拉框位置
    updateDropdownPosition() {
        if (this.buttonRef.current) {
            const rect = this.buttonRef.current.getBoundingClientRect();
            this.setState({
                dropdownPosition: {
                    top: rect.bottom + window.scrollY + 10,
                    left: rect.left + window.scrollX
                }
            });
        }
    }

    // 点击 Built Blocks 按钮
    handleBuiltBlocks() {
        if (!this.state.showDropdown) {
            this.loadDropdownData();
            requestAnimationFrame(() => {
                this.updateDropdownPosition();
            });
        }
        this.setState({ showDropdown: !this.state.showDropdown });
    }

    // 选择 proccode 并构建积木
    handleSelectBlock(blockData) {
        this.setState({
            selectedBlock: blockData,
            showDropdown: false
        });
        
        // 构建积木
        this.buildProcedureFromData(blockData);
    }

    handleBackToCurrentSprite() {
        // 重新加载当前角色的积木,不需要关闭下拉框，直接更新列表
        this.loadDropdownData();
    }

    // 构建积木
    buildProcedureFromData(blockData) {
        if (!this.mutationRoot) {
            console.warn('[Built Blocks] MutationRoot Not Initialized');
            return;
        }

        try {
            const mutation = blockData.mutation;
            const proccode = blockData.proccode;

            // 构建 XML
            const xml = document.createElement('mutation');
            xml.setAttribute('proccode', proccode);
            xml.setAttribute('argumentids', mutation.argumentids || '[]');
            xml.setAttribute('argumentnames', mutation.argumentnames || '[]');
            xml.setAttribute('argumentdefaults', mutation.argumentdefaults || '[]');
            xml.setAttribute('warp', mutation.warp || 'false');

            // 应用到 mutationRoot
            this.mutationRoot.domToMutation(xml);
            this.mutationRoot.initSvg();
            this.mutationRoot.render();

            this.setState({ warp: this.mutationRoot.getWarp() });
        } catch (error) {
            console.error('Fail to build the block:', error);
        }
    }

    // 切换显示所有积木
    handleViewAllBlocks() {
        this.setState({
            showAllBlocks: true,
            blockList: this.state.allBlockList,
            selectedBlock: null
        });
    }

    // ==================== 原有方法 ====================

    handleCancel() {
        this.props.onRequestClose();
    }

    handleOk() {
        const newMutation = this.mutationRoot ? this.mutationRoot.mutationToDom(true) : null;
        this.props.onRequestClose(newMutation);
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
                onOk={this.handleOk}
                onToggleWarp={this.handleToggleWarp}
                // Built Blocks 相关 props
                showDropdown={this.state.showDropdown}
                blockList={this.state.blockList}
                selectedBlock={this.state.selectedBlock}
                showAllBlocks={this.state.showAllBlocks}
                dropdownPosition={this.state.dropdownPosition}
                buttonRef={this.buttonRef}
                onBuiltBlocksClick={this.handleBuiltBlocks}
                onSelectBlock={this.handleSelectBlock}
                onViewAllBlocks={this.handleViewAllBlocks}
                onBackToCurrentSprite={this.handleBackToCurrentSprite}
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
        controls: true,
        wheel: true,
        startScale: 0.9
    },
    comments: true,
    collapse: true,
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
