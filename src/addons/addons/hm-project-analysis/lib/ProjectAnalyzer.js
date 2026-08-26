import Stats from './Stats.js';
import GetExtensionsInfo from './GetExtensionsInfo.js';
import LoadExtensionSource from './LoadExtensionsSource.js';
import { basicExtensions, defaultToplevelBlockOPs, defaultMenuOPs } from './index.js';

export class ProjectAnalyzer {
    constructor(vm) {
        this.vm = vm;
        this.projectData = null;
        this.extensionsInfo = {};
        this.stats = null;
        this.ToplevelBlockOPs = [...defaultToplevelBlockOPs];
        this.MenuOPs = [...defaultMenuOPs];
    }

    async analyzeProject(datadisplayway) {
        if (!this.vm) {
            throw new Error('[hm-Analysis] Failed to analyze project: VM is not initialized.');
        }

        try {
            this.projectData = await JSON.parse(this.vm.toJSON());
            await this.loadExtensions();
            this.stats = Stats(
                this.projectData,
                this.ToplevelBlockOPs,
                this.MenuOPs,
                datadisplayway
            );

            return {
                projectData: this.projectData,
                extensionsInfo: this.extensionsInfo,
                stats: this.stats
            };
        } catch (error) {
            console.error('[hm-Analysis] Failed to analyze project:', error);
            throw error;
        }
    }

    async loadExtensions() {
        const extensions = this.projectData.extensions || [];
        const extensionURLs = this.projectData.extensionURLs || {};
        this.extensionsInfo = {};

        for (const extName of extensions) {
            if (basicExtensions.hasOwnProperty(extName)) {
                this.extensionsInfo[extName] = {
                    defaultName: extName,
                    name: basicExtensions[extName],
                    color: '#0fbd8c'
                };
            }
        }

        const loadPromises = Object.entries(extensionURLs).map(async ([extName, extUrl]) => {
            try {
                const sourceCode = await LoadExtensionSource(extUrl);
                const info = GetExtensionsInfo(sourceCode);
                if (info && info.name) {
                    this.extensionsInfo[extName] = {
                        defaultName: info.defaultName,
                        name: info.name,
                        color: info.color || '#0FBD8C'
                    };
                    if (info.ToplevelBlockOPs) {
                        this.ToplevelBlockOPs.push(...info.ToplevelBlockOPs);
                    }
                    if (info.MenuOPs) {
                        this.MenuOPs.push(...info.MenuOPs);
                    }
                } else if (basicExtensions.hasOwnProperty(extName)) {
                    this.extensionsInfo[extName] = {
                        defaultName: info.defaultName,
                        name: basicExtensions[extName],
                        color: '#0FBD8C'
                    };
                }
            } catch (err) {
                console.error(`[hm-Analysis] Failed to load extension :"${extName}" , `, err.message);
                if (!basicExtensions.hasOwnProperty(extName)) {
                    this.extensionsInfo[extName] = {
                        defaultName: extName,
                        name: extName,
                        color: '#0FBD8C'
                    };
                }
            }
        });

        await Promise.all(loadPromises);
    }

    getSummary() {
        if (!this.stats || !this.projectData) {
            return null;
        }

        const targets = this.projectData.targets || [];
        let totalSprites = 0;
        let totalCostumes = 0;
        let totalSounds = 0;
        let totalVariables = 0;
        let totalLists = 0;

        targets.forEach(target => {
            if (!target.isStage) {
                totalSprites++;
            }
            totalCostumes += (target.costumes || []).length;
            totalSounds += (target.sounds || []).length;
            totalVariables += Object.keys(target.variables || {}).length;
            totalLists += Object.keys(target.lists || {}).length;
        });

        return {
            totalSprites,
            totalCostumes,
            totalSounds,
            totalVariables,
            totalLists,
            totalBlocks: this.stats.BlocksNum,
            effectiveBlocks: this.stats.EffectiveBlocksNum,
            totalScripts: this.stats.ScriptsNum,
            effectiveScripts: this.stats.EffectiveScriptsNum,
            extensions: Object.keys(this.extensionsInfo).length,
            functions: this.stats.FuncDefinitionsNum,
            blockTypes: this.stats.BlocksNumInType,
            extBlocksNumInTypes: this.stats.ExtBlocksNumInTypes,
            errorCount: this.stats.ErrorList ? this.stats.ErrorList.length : 0,
            errors: this.stats.ErrorList || []
        };
    }

    getExtensionDisplayInfo() {
        if (!this.extensionsInfo || Object.keys(this.extensionsInfo).length === 0) {
            return 'Null';
        }
        // 返回扩展 id（extName）列表的 JSON 数组，而非 name 拼接字符串。
        // 这样 ProjectAnalysis.renderExtensions 能按 id 走 getExtensionTranslation：
        //   - 标准扩展（pen/music/...）命中插件 l10n → 中文（如 画笔）
        //   - URL 加载的扩展未收录于 l10n → 回退 extensionDataInfo[id].name（扩展源码按 locale 解析的真实名）
        // 之前返回 name 拼接会让标准扩展直接显示英文原名（basicExtensions[extName]）。
        return JSON.stringify(Object.keys(this.extensionsInfo));
    }
}

export function createProjectAnalyzer(vm) {
    return new ProjectAnalyzer(vm);
}