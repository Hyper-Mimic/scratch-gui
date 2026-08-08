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

    async analyzeProject(datadisplayway = 'onlydata') {
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
                        name: basicExtensions[extName],
                        color: '#0FBD8C'
                    };
                }
            } catch (err) {
                console.error(`[hm-Analysis] Failed to load extension :"${extName}" , `, err.message);
                if (!basicExtensions.hasOwnProperty(extName)) {
                    this.extensionsInfo[extName] = {
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
            trueBlocks: this.stats.TrueBlocksNum,
            totalPiles: this.stats.PilesNum,
            truePiles: this.stats.TruePilesNum,
            extensions: Object.keys(this.extensionsInfo).length,
            functions: this.stats.FuncDefinitionsNum,
            blockTypes: this.stats.BlocksNumInType,
            extBlockTypes: this.stats.ExtBlocksNumInTypes,
            errorCount: this.stats.ErrorList ? this.stats.ErrorList.length : 0,
            errors: this.stats.ErrorList || []
        };
    }

    getExtensionDisplayInfo() {
        if (!this.extensionsInfo || Object.keys(this.extensionsInfo).length === 0) {
            return 'Null';
        }
        return Object.values(this.extensionsInfo)
            .map(info => info.name || 'Unknown')
            .join(',');
    }
}

export function createProjectAnalyzer(vm) {
    return new ProjectAnalyzer(vm);
}