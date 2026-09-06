
export function Stats(ProjectData, ToplevelBlockOPs, MenuOPs, datadisplayway) {
    let BlocksNum = 0,
        ScriptsNum = 0,
        EffectiveBlocksNum = 0,
        EffectiveScriptsNum = 0,
        FuncDefinitionsNum = 0;
    let ErrorList = [];

    // 根据 datadisplayway 初始化 BlocksNumInType
    let BlocksNumInType;
    if (datadisplayway === 'onlydata') {
        BlocksNumInType = { motion: 0, looks: 0, sound: 0, event: 0, control: 0, sensing: 0, operator: 0, data: 0, procedures: 0, others: 0 };
    } else {
        BlocksNumInType = { motion: 0, looks: 0, sound: 0, event: 0, control: 0, sensing: 0, operator: 0, variable: 0, list: 0, procedures: 0, others: 0 };
    }
    const ExtBlocksNumInTypes = {};

    // 判断是否是变量/列表块（数组形式，表现为单独的报告块）
    const isDataBlockArray = function (blockData) {
        if (!Array.isArray(blockData) || blockData.length === 0) return false;
        return blockData[0] === 12 || blockData[0] === 13;
    };

    // 判断是变量(12)还是列表(13)
    const getDataBlockType = function (blockData) {
        if (!Array.isArray(blockData) || blockData.length === 0) return null;
        if (blockData[0] === 12) return 'variable';
        if (blockData[0] === 13) return 'list';
        return null;
    };

    // 分类积木到对应的类型
    const classifyBlock = function (blockData, targetName, count = 1) {
        if (!blockData) return;

        // 处理数组形式的变量/列表
        if (isDataBlockArray(blockData)) {
            if (datadisplayway === 'onlydata') {
                BlocksNumInType.data = (BlocksNumInType.data || 0) + count;
            } else {
                const type = getDataBlockType(blockData);
                if (type && BlocksNumInType[type] !== undefined) {
                    BlocksNumInType[type] = (BlocksNumInType[type] || 0) + count;
                } else {
                    ErrorList.push("[hm-Analysis] Failed to classify block: " + blockData + " in `" + targetName + "`.");
                }
            }
            return;
        }

        // 如果 blockData 不是对象，报错并返回
        if (typeof blockData !== 'object') {
            ErrorList.push("[hm-Analysis] Failed to classify block: " + blockData + " in `" + targetName + "`.");
            return;
        };

        const opcode = blockData.opcode || 'unknown';

        // 排除不需要统计的块
        if (opcode === "procedures_definition" || opcode === "procedures_prototype" || MenuOPs.includes(opcode) ||
            ((opcode === "argument_reporter_string_number" || opcode === "argument_reporter_boolean") && blockData.shadow)) {
            return;
        }

        // 处理 argument_reporter
        if (opcode === "argument_reporter_string_number" || opcode === "argument_reporter_boolean") {
            BlocksNumInType.procedures = (BlocksNumInType.procedures || 0) + count;
            return;
        }

        // 处理内置分类
        const opcode_prefix = opcode.split('_')[0];
        const builtInTypes = ["motion", "looks", "sound", "event", "control", "sensing", "operator", "procedures"];

        if (builtInTypes.includes(opcode_prefix)) {
            BlocksNumInType[opcode_prefix] = (BlocksNumInType[opcode_prefix] || 0) + count;
            return;
        }

        // 处理 data 分类（内置的变量/列表操作块）
        if (opcode_prefix === 'data') {
            if (datadisplayway === 'onlydata') {
                BlocksNumInType.data = (BlocksNumInType.data || 0) + count;
            } else {
                // 区分变量操作和列表操作
                const variableOps = ['data_setvariableto', 'data_changevariableby', 'data_showvariable', 'data_hidevariable'];

                if (variableOps.includes(opcode)) {
                    BlocksNumInType.variable = (BlocksNumInType.variable || 0) + count;
                } else {
                    BlocksNumInType.list = (BlocksNumInType.list || 0) + count;
                }
            }
            return;
        }

        // 其他（扩展）
        BlocksNumInType.others = (BlocksNumInType.others || 0) + count;
        const extKey = opcode_prefix || 'unknown';
        ExtBlocksNumInTypes[extKey] = (ExtBlocksNumInTypes[extKey] || 0) + count;
    };

    const shouldExcludeBlock = function (blockData) {
        if (!blockData || typeof blockData !== 'object') return false;
        const opcode = blockData.opcode || 'unknown';
        const shadow = !!blockData.shadow;
        if (shadow) return true;
        if (opcode === "procedures_prototype" || MenuOPs.includes(opcode)) {
            return true;
        }
        return false;
    };

    const TopLevelBlockIsHat = function (blockId, blockData, blocksById, hatCache) {
        if (hatCache.has(blockId)) return String(hatCache.get(blockId));
        const visited = new Set([blockId]);
        const parentChain = [];
        let currentBlockId = blockId, currentParentId = blockData?.parent, currentNextId = blockData?.next, maxIterations = 5000, iterations = 0;
        while (currentParentId && iterations < maxIterations) {
            iterations++;

            if (visited.has(currentParentId) && blockData.next === currentNextId && blockData.parent === currentParentId) {
                parentChain.push(currentParentId);
                hatCache.set(blockId, false);
                return "false";
            }
            visited.add(currentParentId);
            parentChain.push(currentParentId);

            const parentBlock = blocksById.get(currentParentId);

            let CanMatchWithCblock = false;
            if (parentBlock && parentBlock.inputs && Object.values(parentBlock.inputs).some(v => (v[0] === 2 || v[0] === 3))) {
                Object.values(parentBlock.inputs).forEach(inputData => {
                    if (Array.isArray(inputData)) {
                        if (Array.isArray(inputData) && (inputData[0] === 2 || inputData[0] === 3) && inputData[1] === currentBlockId) {
                            CanMatchWithCblock = true;
                        }
                    }
                });
            } else {
                CanMatchWithCblock = false;
            }

            if ((currentBlockId !== parentBlock?.next) && (CanMatchWithCblock === false)) {
                if ((blocksById.get(currentBlockId)?.topLevel === false)) {
                    hatCache.set(blockId, "undefined");
                    return "undefined";
                } else {
                    hatCache.set(blockId, "false");
                    return "false";
                }
            } else if ((currentBlockId !== parentBlock?.next) && (CanMatchWithCblock === true)) {
                if (blocksById.get(currentBlockId)?.topLevel === true) {
                    hatCache.set(blockId, "false");
                    return "false";
                }
            }
            if (!parentBlock) {
                hatCache.set(blockId, "undefined");
                return "undefined";
            }
            if (ToplevelBlockOPs.includes(parentBlock.opcode)) {
                hatCache.set(blockId, true);
                return "true";
            }
            currentBlockId = currentParentId;
            currentParentId = parentBlock.parent;
            currentNextId = parentBlock.next;
        }
        hatCache.set(blockId, "false");
        return "false";
    };

    // ===== 主要统计逻辑 =====
    ProjectData.targets?.forEach(target => {

        const blocksById = new Map();
        const hatCache = new Map();

        Object.entries(target.blocks || {}).forEach(([blockId, blockData]) => {
            if (blockData && typeof blockData === 'object') {
                blocksById.set(blockId, blockData);
            }
        });

        Object.entries(target.blocks || {}).forEach(([blockId, blockData]) => {
            // 处理 procedures_definition
            const nextOne = blocksById.get(blockData?.next);
            if (blockData && blockData.opcode === "procedures_definition") {
                if (nextOne?.parent === blockId || blockData?.next == null) {
                    BlocksNum += 1;
                    ScriptsNum += 1;
                    EffectiveScriptsNum += 1;
                    EffectiveBlocksNum += 1;
                    BlocksNumInType.procedures = (BlocksNumInType.procedures || 0) + 1;
                    FuncDefinitionsNum += 1;
                    return;
                } else {
                    ErrorList.push("[hm-Analysis] Failed to get the next block in `" + target.name + "` \"" + blockId + "\": " + JSON.stringify(blockData));
                }

            } else if (blockData && blockData.opcode === "procedures_call" && (["​​breakpoint​​", "​​log​​ %s", "​​warn​​ %s", "​​error​​ %s", "​​clear​​", "​​delete_last​​", "​​terminal_log​​ %s", "​​terminal_log_colored​​ %s %s", "​​terminal_write​​ %s %s", "​​terminal_log_bbcode​​ %s", "​​add_user_command​​ %s %s", "​​export_logs​​", "terminal_bbcode_example", "terminal_get_input", "terminal_get_input_timestamp", "terminal_get_last_output"].includes(blockData.mutation.proccode))) {
                BlocksNum += 1;
                BlocksNumInType.addons = (BlocksNumInType.addons || 0) + 1;
                if (blockData && blockData.topLevel) {
                    ScriptsNum += 1;
                }
                if (blockData && blockData.topLevel && !(blockData.mutation.return === "1") && !(blockData.mutation.return === "2") && !(blockData.mutation.return === undefined)) {
                    EffectiveScriptsNum += 1;
                    EffectiveBlocksNum += 1;
                } else if (blockData && TopLevelBlockIsHat(blockId, blockData, blocksById, hatCache) === "true") {
                    EffectiveBlocksNum += 1;
                }
                return;
            }

            if (shouldExcludeBlock(blockData)) return;

            // 处理变量/列表块（数组形式，表现为单独的报告块）
            if (isDataBlockArray(blockData) && blockData.length === 5) {
                BlocksNum += 1;
                ScriptsNum += 1;
                classifyBlock(blockData, target.name);
                return;
            } else if (isDataBlockArray(blockData) && blockData.length !== 5) {
                ErrorList.push("[hm-Analysis] Failed to classify block in `" + target.name + "`: [" + blockData + "]");
                return;
            }

            // 处理普通块
            if (blockData && blockData.topLevel) {
                if (nextOne?.parent === blockId || blockData?.next == null) {
                    BlocksNum += 1;
                    ScriptsNum += 1;
                    classifyBlock(blockData, target.name);
                    if (ToplevelBlockOPs.includes(blockData.opcode)) {
                        EffectiveScriptsNum += 1;
                        EffectiveBlocksNum += 1;
                    }
                    if (blockData && blockData.inputs) {
                        Object.values(blockData.inputs).forEach(inputData => {
                            if (Array.isArray(inputData)) {
                                inputData.forEach(item => {
                                    if (isDataBlockArray(item)) {
                                        classifyBlock(item, target.name);
                                        BlocksNum += 1;
                                        if (ToplevelBlockOPs.includes(blockData.opcode)) {
                                            EffectiveBlocksNum += 1;
                                        }
                                    }
                                });
                            }
                        });
                    }
                } else {
                    ErrorList.push("[hm-Analysis] Failed to get the next block in `" + target.name + "` \"" + blockId + "\": " + JSON.stringify(blockData));
                }

            } else if (blockData && TopLevelBlockIsHat(blockId, blockData, blocksById, hatCache) === "true") {
                classifyBlock(blockData, target.name);
                BlocksNum += 1;
                EffectiveBlocksNum += 1;
                if (blockData && blockData.inputs) {
                    Object.values(blockData.inputs).forEach(inputData => {
                        if (Array.isArray(inputData)) {
                            inputData.forEach(item => {
                                if (isDataBlockArray(item)) {
                                    classifyBlock(item, target.name);
                                    BlocksNum += 1;
                                    EffectiveBlocksNum += 1;
                                }
                            });
                        }
                    });
                }
            } else if (blockData && TopLevelBlockIsHat(blockId, blockData, blocksById, hatCache) === "false") {
                classifyBlock(blockData, target.blocks);
                BlocksNum += 1;
                if (blockData && blockData.inputs) {
                    Object.values(blockData.inputs).forEach(inputData => {
                        if (Array.isArray(inputData)) {
                            inputData.forEach(item => {
                                if (isDataBlockArray(item)) {
                                    classifyBlock(item, target.name);
                                    BlocksNum += 1;
                                }
                            });
                        }
                    });
                }
            } else if (blockData && TopLevelBlockIsHat(blockId, blockData, blocksById, hatCache) === "undefined") {
                ErrorList.push("[hm-Analysis] Failed to get the top block in `" + target.name + "` \"" + blockId + "\": " + JSON.stringify(blockData));
            }
        });
    });

    return { BlocksNum, ScriptsNum, EffectiveBlocksNum, EffectiveScriptsNum, BlocksNumInType, ExtBlocksNumInTypes, FuncDefinitionsNum, ErrorList };
}

export default Stats;