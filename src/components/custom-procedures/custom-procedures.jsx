// custom-procedures.jsx
import PropTypes from 'prop-types';
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import { defineMessages, injectIntl, intlShape, FormattedMessage } from 'react-intl';

import booleanInputIcon from './icon--boolean-input.svg';
import textInputIcon from './icon--text-input.svg';
import labelIcon from './icon--label.svg';

import styles from './custom-procedures.css';

const messages = defineMessages({
    myblockModalTitle: {
        defaultMessage: 'Make a Block',
        description: 'Title for the modal where you create a custom block.',
        id: 'gui.customProcedures.myblockModalTitle'
    },
    viewAllBlocks: {
        defaultMessage: 'View all sprites\' custom blocks',
        description: 'Label for button to view all custom blocks from all sprites',
        id: 'gui.customProcedures.viewAllBlocks'
    },
    noBlocksFound: {
        defaultMessage: 'No custom blocks found',
        description: 'Message when no custom blocks are found',
        id: 'gui.customProcedures.noBlocksFound'
    },
    noBlocksInCurrentSprite: {
        defaultMessage: 'No custom blocks in current sprite',
        description: 'Message when current sprite has no custom blocks',
        id: 'gui.customProcedures.noBlocksInCurrentSprite'
    }, 
    backToCurrentSprite: {
        defaultMessage: 'Back to current sprite',
        description: 'Label for button to go back to current sprite\'s custom blocks',
        id: 'gui.customProcedures.backToCurrentSprite'
    }
});

const CustomProcedures = props => {
    const {
        // 原有 props
        componentRef,
        intl,
        onAddBoolean,
        onAddLabel,
        onAddTextNumber,
        onCancel,
        onOk,
        onToggleWarp,
        warp,
        // Built Blocks 相关 props
        showDropdown,
        blockList,
        selectedBlock,
        showAllBlocks,
        dropdownPosition,
        buttonRef,
        onBuiltBlocksClick,
        onSelectBlock,
        onViewAllBlocks
    } = props;

    // 动画状态：控制显示/隐藏的过渡
    const [isVisible, setIsVisible] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    // 监听 showDropdown 变化，控制动画
    useEffect(() => {
        if (showDropdown) {
            // 显示：先渲染，然后触发淡入
            setShouldRender(true);
            // 使用 requestAnimationFrame 确保 DOM 已渲染
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsVisible(true);
                });
            });
        } else {
            // 隐藏：先淡出，然后移除 DOM
            setIsVisible(false);
            // 等待动画完成后移除 DOM
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 250); // 与动画时长匹配
            return () => clearTimeout(timer);
        }
    }, [showDropdown]);

    // 渲染下拉框
    const renderDropdown = () => {
        if (!shouldRender) return null;

        const displayList = blockList || [];

        return ReactDOM.createPortal(
            <div
                style={{
                    position: 'absolute',
                    top: dropdownPosition.top,
                    left: dropdownPosition.left,
                    minWidth: '200px',
                    maxWidth: '350px',
                    zIndex: 9999,
                    // 缓入动画
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'translate(0px, 0px)' : 'translate(0px, -10px)',
                    transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: isVisible ? 'auto' : 'none'
                }}
            >
                <div
                    style={{
                        backgroundColor: '#ff6680',
                        border: '2px solid #f35',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        width: '100%',
                        maxHeight: '350px',
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                >
                    
                    {/* 内容区 */}
                    <div
                        style={{
                            maxHeight: '300px',
                            overflowY: 'auto',
                            padding: '6px 0',
                            position: 'relative',
                            zIndex: 2,
                            userSelect: 'none'
                        }}
                    >
                        {displayList.length === 0 ? (
                            <div
                                style={{
                                    padding: '10px 16px',
                                    color: 'rgba(255,255,255,0.8)',
                                    fontSize: '13px',
                                    textAlign: 'center'
                                }}
                            >
                                {showAllBlocks ? (
                                    <FormattedMessage {...messages.noBlocksFound} />
                                ) : (
                                    <FormattedMessage {...messages.noBlocksInCurrentSprite} />
                                )}
                            </div>
                        ) : (
                            <>
                                {displayList.map((item, index) => (
                                    <div
                                        key={index}
                                        onClick={() => onSelectBlock(item)}
                                        style={{
                                            padding: '6px 16px',
                                            paddingLeft: '32px',
                                            color: 'white',
                                            fontSize: '14px',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.15s',
                                            backgroundColor: selectedBlock && selectedBlock.proccode === item.proccode && 
                                                           selectedBlock.targetName === item.targetName 
                                                ? 'rgba(255,255,255,0.25)' 
                                                : 'transparent',
                                            position: 'relative',
                                            fontFamily: 'sans-serif',
                                            lineHeight: '1.4',
                                            minHeight: '20px',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!(selectedBlock && selectedBlock.proccode === item.proccode && 
                                                  selectedBlock.targetName === item.targetName)) {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            } else {
                                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                                            }
                                        }}
                                    >
                                        {selectedBlock && selectedBlock.proccode === item.proccode && 
                                         selectedBlock.targetName === item.targetName && (
                                            <span
                                                style={{
                                                    position: 'absolute',
                                                    left: '12px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    width: '12px',
                                                    height: '12px',
                                                    border: '2px solid white',
                                                    borderRadius: '12px',
                                                    backgroundColor: 'white',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        width: '8px',
                                                        height: '8px',
                                                        backgroundColor: '#ff6680',
                                                        borderRadius: '12px'
                                                    }}
                                                />
                                            </span>
                                        )}
                                        {!(selectedBlock && selectedBlock.proccode === item.proccode && 
                                          selectedBlock.targetName === item.targetName) && (
                                            <span
                                                style={{
                                                    position: 'absolute',
                                                    left: '12px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    width: '12px',
                                                    height: '12px',
                                                    border: '2px solid rgba(255,255,255,0.4)',
                                                    borderRadius: '12px'
                                                }}
                                            />
                                        )}
                                        <span>
                                            {item.proccode}
                                            {showAllBlocks && item.targetName && (
                                                <span style={{ 
                                                    fontSize: '11px', 
                                                    opacity: 0.7, 
                                                    marginLeft: '8px',
                                                    color: 'rgba(255,255,255,0.8)'
                                                }}>
                                                    [{item.targetName}]
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                        
                        {/*查看所有角色积木的选项 - 移到外面，永远显示 */}
                        {!showAllBlocks && (
                            <div
                                onClick={onViewAllBlocks}
                                style={{
                                    padding: '8px 16px',
                                    color: 'white',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    borderTop: '1px solid rgba(255,255,255,0.2)',
                                    marginTop: '4px',
                                    textAlign: 'center',
                                    transition: 'background-color 0.15s',
                                    fontFamily: 'sans-serif'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <FormattedMessage {...messages.viewAllBlocks} />
                            </div>
                        )}
                        
                        {/* ✅ 当 showAllBlocks 为 true 时，显示返回当前角色的选项 */}
                        {showAllBlocks && (
                            <div
                                onClick={() => {
                                    if (onBuiltBlocksClick) {
                                        props.onBackToCurrentSprite();
                                    }
                                }}
                                style={{
                                    padding: '8px 16px',
                                    color: 'white',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    borderTop: '1px solid rgba(255,255,255,0.2)',
                                    marginTop: '4px',
                                    textAlign: 'center',
                                    transition: 'background-color 0.15s',
                                    fontFamily: 'sans-serif'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <FormattedMessage
                                    defaultMessage="Back to current sprite"
                                    description="Label for button to go back to current sprite's custom blocks"
                                    id="gui.customProcedures.backToCurrentSprite"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <>
            <Modal
                className={styles.modalContent}
                contentLabel={intl.formatMessage(messages.myblockModalTitle)}
                onRequestClose={onCancel}
                id="customProceduresModal"
            >
                <Box
                    className={styles.workspace}
                    componentRef={componentRef}
                />
                <Box className={styles.body}>
                    <div className={styles.optionsRow}>
                        <div
                            className={styles.optionCard}
                            role="button"
                            tabIndex="0"
                            onClick={onAddTextNumber}
                        >
                            <img
                                className={styles.optionIcon}
                                src={textInputIcon}
                                draggable={false}
                            />
                            <div className={styles.optionTitle}>
                                <FormattedMessage
                                    defaultMessage="Add an input"
                                    description="Label for button to add a number/text input"
                                    id="gui.customProcedures.addAnInputNumberText"
                                />
                            </div>
                            <div className={styles.optionDescription}>
                                <FormattedMessage
                                    defaultMessage="number or text"
                                    description="Description of the number/text input type"
                                    id="gui.customProcedures.numberTextType"
                                />
                            </div>
                        </div>
                        <div
                            className={styles.optionCard}
                            role="button"
                            tabIndex="0"
                            onClick={onAddBoolean}
                        >
                            <img
                                className={styles.optionIcon}
                                src={booleanInputIcon}
                                draggable={false}
                            />
                            <div className={styles.optionTitle}>
                                <FormattedMessage
                                    defaultMessage="Add an input"
                                    description="Label for button to add a boolean input"
                                    id="gui.customProcedures.addAnInputBoolean"
                                />
                            </div>
                            <div className={styles.optionDescription}>
                                <FormattedMessage
                                    defaultMessage="boolean"
                                    description="Description of the boolean input type"
                                    id="gui.customProcedures.booleanType"
                                />
                            </div>
                        </div>
                        <div
                            className={styles.optionCard}
                            role="button"
                            tabIndex="0"
                            onClick={onAddLabel}
                        >
                            <img
                                className={styles.optionIcon}
                                src={labelIcon}
                                draggable={false}
                            />
                            <div className={styles.optionTitle}>
                                <FormattedMessage
                                    defaultMessage="Add a label"
                                    description="Label for button to add a label"
                                    id="gui.customProcedures.addALabel"
                                />
                            </div>
                        </div>
                    </div>
                    <div className={styles.checkboxRow}>
                        <label>
                            <input
                                checked={warp}
                                type="checkbox"
                                onChange={onToggleWarp}
                            />
                            <FormattedMessage
                                defaultMessage="Run without screen refresh"
                                description="Label for checkbox to run without screen refresh"
                                id="gui.customProcedures.runWithoutScreenRefresh"
                            />
                        </label>
                    </div>

                    <Box className={styles.buttonRow}>
                        <button
                            ref={buttonRef}
                            onClick={onBuiltBlocksClick}
                            style={{ float: 'left' }}
                        >
                            <FormattedMessage
                                defaultMessage="Build from existing building blocks"
                                description="Label for button to build blocks from existing building blocks fastly "
                                id="gui.customProcedures.builtBlocks"
                            />
                        </button>
                        
                        <button
                            className={styles.cancelButton}
                            onClick={onCancel}
                        >
                            <FormattedMessage
                                defaultMessage="Cancel"
                                description="Label for button to cancel custom procedure edits"
                                id="gui.customProcedures.cancel"
                            />
                        </button>
                        <button
                            className={styles.okButton}
                            onClick={onOk}
                        >
                            <FormattedMessage
                                defaultMessage="OK"
                                description="Label for button to save new custom procedure"
                                id="gui.customProcedures.ok"
                            />
                        </button>
                    </Box>
                </Box>
            </Modal>

            {renderDropdown()}
        </>
    );
};

CustomProcedures.propTypes = {
    componentRef: PropTypes.func.isRequired,
    intl: intlShape,
    onAddBoolean: PropTypes.func.isRequired,
    onAddLabel: PropTypes.func.isRequired,
    onAddTextNumber: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    onToggleWarp: PropTypes.func.isRequired,
    warp: PropTypes.bool.isRequired,
    // Built Blocks 相关 props
    showDropdown: PropTypes.bool,
    blockList: PropTypes.array,
    selectedBlock: PropTypes.object,
    showAllBlocks: PropTypes.bool,
    dropdownPosition: PropTypes.object,
    buttonRef: PropTypes.object,
    onBuiltBlocksClick: PropTypes.func,
    onSelectBlock: PropTypes.func,
    onViewAllBlocks: PropTypes.func,
    onBackToCurrentSprite: PropTypes.func
};

CustomProcedures.defaultProps = {
    showDropdown: false,
    blockList: [],
    selectedBlock: null,
    showAllBlocks: false,
    dropdownPosition: { top: 0, left: 0 },
    buttonRef: null,
    onBuiltBlocksClick: () => {},
    onSelectBlock: () => {},
    onViewAllBlocks: () => {},
    onBackToCurrentSprite: () => {}
};

export default injectIntl(CustomProcedures);