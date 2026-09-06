// Project Analysis panel — bundled as a self-contained addon

import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import { createProjectAnalyzer } from './lib/ProjectAnalyzer.js';

import { getExtensionTranslation, getBlockTypeTranslation } from './lib/index.js';

import styles from './hm-project-analysis.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Project Analysis',
        description: 'Title for project analysis modal',
        id: 'hm-project-analysis/title'
    },
    tabResult: {
        defaultMessage: 'Result',
        description: 'Tab label for result tab',
        id: 'hm-project-analysis/tabResult'
    },
    tabSettings: {
        defaultMessage: 'Settings',
        description: 'Tab label for settings tab',
        id: 'hm-project-analysis/tabSettings'
    },
    tabErrors: {
        defaultMessage: 'Errors',
        description: 'Tab label for errors tab',
        id: 'hm-project-analysis/tabErrors'
    },
    // ===== 统计项标签 =====
    sprites: {
        defaultMessage: 'Sprites',
        description: 'Sprite count label',
        id: 'hm-project-analysis/sprites'
    },
    totalBlocks: {
        defaultMessage: 'Total Blocks',
        description: 'Total block count label',
        id: 'hm-project-analysis/totalBlocks'
    },
    effectiveBlocks: {
        defaultMessage: 'Effective Blocks',
        description: 'Effective block count label',
        id: 'hm-project-analysis/effectiveBlocks'
    },
    totalScripts: {
        defaultMessage: 'Total Scripts',
        description: 'Total script count label',
        id: 'hm-project-analysis/totalScripts'
    },
    effectiveScripts: {
        defaultMessage: 'Effective Scripts',
        description: 'Effective script count label',
        id: 'hm-project-analysis/effectiveScripts'
    },
    costumes: {
        defaultMessage: 'Costumes',
        description: 'Costume count label',
        id: 'hm-project-analysis/costumes'
    },
    sounds: {
        defaultMessage: 'Sounds',
        description: 'Sound count label',
        id: 'hm-project-analysis/sounds'
    },
    variables: {
        defaultMessage: 'Variables',
        description: 'Variable count label',
        id: 'hm-project-analysis/variables'
    },
    lists: {
        defaultMessage: 'Lists',
        description: 'List count label',
        id: 'hm-project-analysis/lists'
    },
    functions: {
        defaultMessage: 'Functions',
        description: 'Function count label',
        id: 'hm-project-analysis/functions'
    },
    // ===== 统计分组标题 =====
    groupAssets: {
        defaultMessage: 'Assets',
        description: 'Statistics group title for assets',
        id: 'hm-project-analysis/groupAssets'
    },
    groupBlockCount: {
        defaultMessage: 'Block Count',
        description: 'Statistics group title for block count',
        id: 'hm-project-analysis/groupBlockCount'
    },
    groupScriptCount: {
        defaultMessage: 'Script Count',
        description: 'Statistics group title for script count',
        id: 'hm-project-analysis/groupScriptCount'
    },
    groupDefinitions: {
        defaultMessage: 'Definitions',
        description: 'Statistics group title for definitions',
        id: 'hm-project-analysis/groupDefinitions'
    },
    // ===== 其他消息 =====
    basicInformation: {
        defaultMessage: 'Basic Information',
        description: 'Basic information title',
        id: 'hm-project-analysis/basicInformation'
    },
    blockCategories: {
        defaultMessage: 'Block Categories',
        description: 'Block categories title',
        id: 'hm-project-analysis/blockCategories'
    },
    extensionDisplayInfo: {
        defaultMessage: 'Extension Information',
        description: 'Extension information title',
        id: 'hm-project-analysis/extensionDisplayInfo'
    },
    errorInfo: {
        defaultMessage: 'Error Information',
        description: 'Error information title',
        id: 'hm-project-analysis/errorInfo'
    },
    errors: {
        defaultMessage: 'Found {count} hidden error(s) in this file',
        description: 'Error count message',
        id: 'hm-project-analysis/errors'
    },
    viewErrors: {
        defaultMessage: 'View Errors',
        description: 'Button to view errors',
        id: 'hm-project-analysis/viewErrors'
    },
    loading: {
        defaultMessage: 'Analyzing...',
        description: 'Loading message',
        id: 'hm-project-analysis/loading'
    },
    empty: {
        defaultMessage: 'No data available. Please analyze a project.',
        description: 'Empty state message',
        id: 'hm-project-analysis/empty'
    },
    untitled: {
        defaultMessage: '(Untitled)',
        description: 'Default project title when no title is set',
        id: 'hm-project-analysis/untitled'
    },
    noStats: {
        defaultMessage: 'No statistics selected to display. Please check your settings.',
        description: 'Message when all stats are hidden',
        id: 'hm-project-analysis/noStats'
    },
    noErrors: {
        defaultMessage: 'No errors found in this project.',
        description: 'Message when no errors are found',
        id: 'hm-project-analysis/noErrors'
    },
    errorsDescription: {
        defaultMessage: 'We apologize that you have seen these. These are likely not your fault, but rather issues with how your editor has handled the project logic, adding erroneous data to your file. If a certain part of your project shows an error screen when opened in the editor, or the project does not run properly, we cannot guarantee that all statistics and block category counts are completely accurate (though they might be). If your project runs normally and shows no errors, these errors are harmless.',
        description: 'Errors description',
        id: 'hm-project-analysis/errorsDescription'
    },
    errorsListTitle: {
        defaultMessage: 'Errors found during analysis:',
        description: 'Errors list title',
        id: 'hm-project-analysis/errorsListTitle'
    }
});


class ProjectAnalysis extends React.Component {
    constructor(props) {
        super(props);
        // Settings are supplied by the addon (its addon-settings page) via the
        // `settings` prop. Fall back to built-in defaults if the prop is absent.
        const s = props.settings || {};
        this.state = {
            summary: null,
            extensionDataInfo: null,
            extensionDisplayInfo: 'Null',
            isLoading: false,
            error: null,
            activeTab: 'result',
            showFileName: s.showFileName !== undefined ? s.showFileName : true,
            showSpriteCount: s.showSpriteCount !== undefined ? s.showSpriteCount : true,
            showCostumeCount: s.showCostumeCount !== undefined ? s.showCostumeCount : true,
            showSoundCount: s.showSoundCount !== undefined ? s.showSoundCount : true,
            showBlocksNum: s.showBlocksNum !== undefined ? s.showBlocksNum : true,
            showEffectiveBlocksNum: s.showEffectiveBlocksNum !== undefined ? s.showEffectiveBlocksNum : true,
            showScriptsNum: s.showScriptsNum !== undefined ? s.showScriptsNum : true,
            showEffectiveScriptsNum: s.showEffectiveScriptsNum !== undefined ? s.showEffectiveScriptsNum : true,
            showExtensionsInfo: s.showExtensionsInfo !== undefined ? s.showExtensionsInfo : false,
            showSpecificExtensions: s.showSpecificExtensions !== undefined ? s.showSpecificExtensions : true,
            showVarDefinitionsNum: s.showVarDefinitionsNum !== undefined ? s.showVarDefinitionsNum : false,
            showListDefinitionsNum: s.showListDefinitionsNum !== undefined ? s.showListDefinitionsNum : false,
            showFuncDefinitionsNum: s.showFuncDefinitionsNum !== undefined ? s.showFuncDefinitionsNum : false,
            betterProgressBar: s.betterProgressBar !== undefined ? s.betterProgressBar : false,
            orderType: s.orderType || 'original',
            datadisplayway: s.datadisplayway || 'onlydata'
        };
        this.analyzer = null;
        // Ref to the root element so we can bind a *native* click delegation for
        // tab switching. This fork's addon environment does NOT reliably fire
        // React synthetic onClick handlers (close button works because it uses a
        // raw addEventListener), so we must not rely on React's event system for
        // interactivity. The data-tab attribute on each tab button drives this.
        this.rootEl = null;
        this.onRootClick = (e) => {
            const tabButton = e.target.closest('[data-tab]');
            if (tabButton) {
                this.switchTab(tabButton.getAttribute('data-tab'));
            }
        };
    }

    componentDidMount() {
        if (this.rootEl) {
            this.rootEl.addEventListener('click', this.onRootClick);
        }
        if (this.props.isOpen && this.props.vm) {
            setTimeout(() => {
                this.performAnalysis();
            }, 10);
        }
    }

    componentWillUnmount() {
        if (this.rootEl) {
            this.rootEl.removeEventListener('click', this.onRootClick);
        }
    }

    componentDidUpdate(prevProps, prevState) {
        // 如果弹窗刚打开，执行分析
        if (this.props.isOpen && !prevProps.isOpen && this.props.vm) {
            this.performAnalysis();
        }
        
        // 如果 datadisplayway 或 orderType 发生了变化，且已有数据，重新分析
        if (this.state.summary && 
            (prevState.datadisplayway !== this.state.datadisplayway ||
            prevState.orderType !== this.state.orderType)) {
            this.performAnalysis();
        }
    }





    async performAnalysis() {
        if (!this.props.vm) {
            this.setState({ 
                error: 'Failed to analyze project: VM is not initialized.',
                isLoading: false 
            });
            return;
        }

        this.setState({ isLoading: true, error: null });

        try {
            this.analyzer = createProjectAnalyzer(this.props.vm);
            await this.analyzer.analyzeProject(this.state.datadisplayway);
            const summary = this.analyzer.getSummary();
            const extensionDisplayInfo = this.analyzer.getExtensionDisplayInfo();
            const extensionDataInfo = this.analyzer.extensionsInfo;
            this.setState({
                summary,
                extensionDisplayInfo,
                extensionDataInfo, 
                isLoading: false
            });
        } catch (error) {
            console.error('[hm-Analysis] Failed to analyze project:', error);
            this.setState({
                error: error.message || 'Failed to analyze project: Unknown error.',
                isLoading: false
            });
        }
    }

    switchTab = (tab) => {
        this.setState({ activeTab: tab });
    };

    renderTabs() {
        const { activeTab, summary } = this.state;
        const errorCount = (summary && summary.errors) ? summary.errors.length : 0;
        const hasErrors = errorCount > 0;

        return (
            <div className={styles.tabContainer}>
                <button
                    className={`${styles.tabButton} ${activeTab === 'result' ? styles.tabActive : ''}`}
                    data-tab="result"
                    onClick={() => this.switchTab('result')}
                >
                    <FormattedMessage
                        defaultMessage="Result"
                        description="Tab label for result tab"
                        id="hm-project-analysis/tabResult"
                    />
                </button>
                {hasErrors && (
                    <button
                        className={`${styles.tabButton} ${activeTab === 'errors' ? styles.tabActive : ''} ${styles.tabError}`}
                        data-tab="errors"
                        onClick={() => this.switchTab('errors')}
                    >
                        <FormattedMessage
                            defaultMessage="Errors"
                            description="Tab label for errors tab"
                            id="hm-project-analysis/tabErrors"
                        />
                        <span className={styles.errorBadge}>[{errorCount}]</span>
                    </button>
                )}
            </div>
        );
    }

    renderStats() {
        const { summary } = this.state;
        const { intl } = this.props;
        if (!summary) return null;

        // 定义统计项配置
        const statsConfig = [
            // === 资源 (Assets) ===
            { 
                key: 'sprites', 
                value: summary.totalSprites, 
                msgKey: 'sprites',
                group: 'assets',
                settingKey: 'showSpriteCount'
            },
            { 
                key: 'costumes', 
                value: summary.totalCostumes, 
                msgKey: 'costumes',
                group: 'assets',
                settingKey: 'showCostumeCount'
            },
            { 
                key: 'sounds', 
                value: summary.totalSounds, 
                msgKey: 'sounds',
                group: 'assets',
                settingKey: 'showSoundCount'
            },
            // === 积木数量 (Block Count) ===
            { 
                key: 'totalBlocks', 
                value: summary.totalBlocks, 
                msgKey: 'totalBlocks',
                group: 'blockCount',
                settingKey: 'showBlocksNum'
            },
            { 
                key: 'effectiveBlocks', 
                value: summary.effectiveBlocks, 
                msgKey: 'effectiveBlocks',
                group: 'blockCount',
                settingKey: 'showEffectiveBlocksNum'
            },
            // === 积木段数 (Script Count) ===
            { 
                key: 'totalScripts', 
                value: summary.totalScripts, 
                msgKey: 'totalScripts',
                group: 'scriptCount',
                settingKey: 'showScriptsNum'
            },
            { 
                key: 'effectiveScripts', 
                value: summary.effectiveScripts, 
                msgKey: 'effectiveScripts',
                group: 'scriptCount',
                settingKey: 'showEffectiveScriptsNum'
            },
            // === 定义 (Definitions) ===
            { 
                key: 'variables', 
                value: summary.totalVariables, 
                msgKey: 'variables',
                group: 'definitions',
                settingKey: 'showVarDefinitionsNum'
            },
            { 
                key: 'lists', 
                value: summary.totalLists, 
                msgKey: 'lists',
                group: 'definitions',
                settingKey: 'showListDefinitionsNum'
            },
            { 
                key: 'functions', 
                value: summary.functions, 
                msgKey: 'functions',
                group: 'definitions',
                settingKey: 'showFuncDefinitionsNum'
            }
        ];

        // 分组配置
        const groupConfig = {
            assets: {
                msgKey: 'groupAssets',
                settingKeys: ['showSpriteCount', 'showCostumeCount', 'showSoundCount']
            },
            blockCount: {
                msgKey: 'groupBlockCount',
                settingKeys: ['showBlocksNum', 'showEffectiveBlocksNum']
            },
            scriptCount: {
                msgKey: 'groupScriptCount',
                settingKeys: ['showScriptsNum', 'showEffectiveScriptsNum']
            },
            definitions: {
                msgKey: 'groupDefinitions',
                settingKeys: ['showVarDefinitionsNum', 'showListDefinitionsNum', 'showFuncDefinitionsNum']
            }
        };

        // 过滤可见的统计项
        const visibleStats = statsConfig.filter(item => {
            const settingValue = this.state[item.settingKey];
            return settingValue !== undefined ? settingValue : true;
        });

        // 按组分类
        const groupedStats = {};
        visibleStats.forEach(item => {
            if (!groupedStats[item.group]) {
                groupedStats[item.group] = [];
            }
            groupedStats[item.group].push(item);
        });

        // 检查每个组是否有可见项
        const groupHasVisible = {};
        Object.keys(groupConfig).forEach(groupKey => {
            const config = groupConfig[groupKey];
            const hasVisible = config.settingKeys.some(key => {
                const value = this.state[key];
                return value !== undefined ? value : true;
            });
            groupHasVisible[groupKey] = hasVisible && groupedStats[groupKey] && groupedStats[groupKey].length > 0;
        });

        // 检查是否有任何统计项显示
        const hasAnyVisible = Object.values(groupHasVisible).some(v => v === true);

        if (!hasAnyVisible) {
            return (
                <div className={styles.emptyStatsMessage}>
                    <FormattedMessage
                        defaultMessage="No statistics selected to display. Please check your settings."
                        description="Message when all stats are hidden"
                        id="hm-project-analysis/noStats"
                    />
                </div>
            );
        }

        // 定义分组顺序
        const groupOrder = ['assets', 'blockCount', 'scriptCount', 'definitions'];

        return (
            <>
                <div className={styles.subtitle}>
                    <FormattedMessage
                        defaultMessage="Basic Information"
                        description="Basic information title"
                        id="hm-project-analysis/basicInformation"
                    />
                </div>
                
                {groupOrder.map(groupKey => {
                    if (!groupHasVisible[groupKey]) return null;
                    
                    const items = groupedStats[groupKey] || [];
                    if (items.length === 0) return null;
                    
                    const config = groupConfig[groupKey];
                    
                    return (
                        <div key={groupKey} className={styles.statsGroup}>
                            <div className={styles.statsGroupTitle}>
                                {intl.formatMessage(messages[config.msgKey])}
                            </div>
                            <div className={styles.statsGrid}>
                                {items.map(item => (
                                    <div key={item.key} className={styles.statItem}>
                                        <span className={styles.statValue}>{item.value}</span>
                                        <span className={styles.statLabel}>
                                            {intl.formatMessage(messages[item.msgKey])}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </>
        );
    }

    renderBlockTypes() {
        const { summary } = this.state;
        // 用透传的正确 redux locale（react-intl 的 intl.locale 会被 2.9.0 污染成 'en'）
        const locale = this.props.locale || (this.props.intl && this.props.intl.locale);
        
        if (!summary || !summary.blockTypes) return null;

        // 获取 blockTypes 的条目
        let entries = Object.entries(summary.blockTypes)
            .filter(([, count]) => count > 0);
        
        // 如果 showSpecificExtensions 为 true，从 summary 中获取扩展分类
        const showSpecificExtensions = this.state.showSpecificExtensions;
        let extensionEntries = [];

        if (showSpecificExtensions && summary.extBlocksNumInTypes) {
            // 从 ExtBlocksNumInTypes 获取扩展分类
            const extBlocks = summary.extBlocksNumInTypes || {};

            extensionEntries = Object.entries(extBlocks)
                .filter(([key, count]) => count > 0 && key !== 'others');
            
            // 如果扩展分类存在，从 entries 中移除 "others"（因为扩展会被单独显示）
            if (extensionEntries.length > 0) {
                entries = entries.filter(([category]) => category !== 'others');
            }
        }
        
        // 合并所有条目
        let allEntries = [...entries, ...extensionEntries];
        
        if (allEntries.length === 0) return null;

        // 根据排序设置排序
        if (this.state.orderType === 'byCount') {
            allEntries.sort((a, b) => b[1] - a[1]);
        }

        let maxCount
        // 最大数量用于进度条
        if (this.state.betterProgressBar) {
            maxCount = Math.max(...allEntries.map(([, count]) => count));
        } else {
            maxCount = summary.totalBlocks;
        }
        // 如果 maxCount 为 0，设置默认值 1 避免除以 0
        const effectiveMax = maxCount > 0 ? maxCount : 1;

        return (
            <div className={styles.section}>
                <div className={styles.subtitle}>
                    <FormattedMessage
                        defaultMessage="Block Categories"
                        description="Block categories title"
                        id="hm-project-analysis/blockCategories"
                    />
                </div>
                <div className={styles.categoryList}>
                    {allEntries.map(([category, count]) => {
                        // 判断是否为扩展分类
                        const isExtension = extensionEntries.some(([key]) => key === category);
                        
                        // 获取显示名称
                        let displayName, color;
                        if (isExtension) {
                            // 颜色沿用分析所得的扩展色，名称统一走 scratch-l10n
                            color = (this.state.extensionDataInfo && this.state.extensionDataInfo[category]?.color) || this.getCategoryColor(category);
                            displayName = getExtensionTranslation(category, this.props.locale, this.props.intl, this.state.extensionDataInfo?.[category]?.name);
                        } else {
                            // 内置分类：调用 ScratchMsgs（透传正确 locale）
                            displayName = getBlockTypeTranslation(category, this.props.locale, this.props.intl);
                            color = this.getCategoryColor(category);
                        }
                        
                        const percent = (count / effectiveMax) * 100;
                        // 根据 betterProgressBar 设置决定进度条宽度
                        const barWidth = this.state.betterProgressBar ? percent : Math.min(percent, 100);
                        // 获取占比
                        const block_percent =  ((count / summary.totalBlocks) * 100 ).toFixed(1) ;
                        
                        
                        return (
                            <div key={category} className={styles.categoryItem}>
                                <span className={styles.categoryCount}>{count} ({block_percent}%)</span>
                                <span className={styles.categoryName}>{displayName}</span>
                                <div className={styles.categoryBarWrapper}>
                                    <div 
                                        className={styles.categoryBarFill}
                                        style={{ 
                                            width: `${barWidth}%`,
                                            backgroundColor: color
                                        }}
                                    />
                                </div>
                                
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    getCategoryColor(category) {
        // Real, theme-aware block colour from the active Blockly theme — the
        // exact same source recolor-custom-blocks uses (workspace.getTheme().
        // blockStyles[...].colourPrimary for new Blockly, Blockly.Colours[...]
        // for old). There is deliberately NO hardcoded colour table: unknown
        // categories (e.g. an extension id the theme has no style for) fall back
        // to the live "other" (more) category colour, which is still a real
        // theme colour, never a self-defined constant. `getBlockColor` is null
        // only when the editor/Blockly wasn't available to build the resolver.
        if (typeof this.props.getBlockColor === 'function') {
            const real = this.props.getBlockColor(category);
            if (real) return real;
            // unknown extension id etc. -> live "other" colour (still a real theme colour)
            return this.props.getBlockColor('others');
        }
        return null;
    }

    renderExtensions() {
        const { extensionDisplayInfo, summary } = this.state;
        // 用透传的正确 redux locale（react-intl 的 intl.locale 会被 2.9.0 污染成 'en'）
        const locale = this.props.locale || (this.props.intl && this.props.intl.locale);
        const showExtensionsInfo = this.state.showExtensionsInfo;
        const showSpecificExtensions = this.state.showSpecificExtensions;
        
        // 如果没有扩展信息或为空，不显示
        if (!extensionDisplayInfo || extensionDisplayInfo === 'Null' || extensionDisplayInfo === '') return null;
        
        // 解析扩展信息
        let extensionIds = [];
        let extensionDisplayText = '';
        
        try {
            if (typeof extensionDisplayInfo === 'string') {
                if (extensionDisplayInfo.startsWith('[') && extensionDisplayInfo.endsWith(']')) {
                    const parsed = JSON.parse(extensionDisplayInfo);
                    if (Array.isArray(parsed)) {
                        extensionIds = parsed;
                    }
                } else {
                    extensionDisplayText = extensionDisplayInfo;
                }
            } else if (Array.isArray(extensionDisplayInfo)) {
                extensionIds = extensionDisplayInfo;
            } else if (typeof extensionDisplayInfo === 'object') {
                extensionIds = Object.keys(extensionDisplayInfo);
            }
        } catch (e) {
            extensionDisplayText = typeof extensionDisplayInfo === 'string' ? extensionDisplayInfo : String(extensionDisplayInfo);
        }
        
        if (!showExtensionsInfo) {
            return null;
        }

        let displayNames = [];
        if (extensionIds.length > 0) {
            if (showSpecificExtensions) {
                // 使用从 index.js 导入的 getExtensionTranslation
                extensionIds.forEach(id => {
                    const translatedName = getExtensionTranslation(id, locale, this.props.intl, this.state.extensionDataInfo?.[id]?.name);
                    displayNames.push(translatedName);
                });
            } else {
                displayNames.push(`${extensionIds.length} extensions`);
            }
        } else if (extensionDisplayText) {
            displayNames = [extensionDisplayText];
        }

        if (displayNames.length === 0) {
            return null;
        }

        const uniqueNames = [...new Set(displayNames)];
        const displayText = uniqueNames.join(', ');

        return (
            <div className={styles.section}>
                <div className={styles.subtitle}>
                    <FormattedMessage
                        defaultMessage="Extension Information"
                        description="Extension information title"
                        id="hm-project-analysis/extensionDisplayInfo"
                    />
                </div>
                <div className={styles.extensionInfo}>
                    {displayText}
                </div>
            </div>
        );
    }


    renderResultTab() {
        const { summary, extensionDisplayInfo, isLoading, error } = this.state;
        const { projectTitle } = this.props;

        if (isLoading) {
            return (
                <div className={styles.loadingMessage}>
                    <FormattedMessage
                        defaultMessage="Analyzing..."
                        description="Loading message"
                        id="hm-project-analysis/loading"
                    />
                </div>
            );
        }

        if (error) {
            return (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            );
        }

        if (!summary) {
            return (
                <div className={styles.emptyMessage}>
                    <FormattedMessage
                        defaultMessage="No data available. Please analyze a project."
                        description="Empty state message"
                        id="hm-project-analysis/empty"
                    />
                </div>
            );
        }

        const hasErrors = summary.errors && summary.errors.length > 0;

        // 检查是否有任何统计项显示
        const statsSettingKeys = [
            'showSpriteCount',
            'showBlocksNum',
            'showEffectiveBlocksNum',
            'showScriptsNum',
            'showEffectiveScriptsNum',
            'showCostumeCount',
            'showSoundCount',
            'showVarDefinitionsNum',
            'showListDefinitionsNum',
            'showFuncDefinitionsNum',
        ];
        
        const hasVisibleStats = statsSettingKeys.some(key => {
            const value = this.state[key];
            return value !== undefined ? value : true;
        });

        return (
            <>
                {this.state.showFileName && (
                    <div className={styles.projectTitle}>
                        {projectTitle || (
                            <FormattedMessage
                                defaultMessage="(Untitled)"
                                description="Default project title when no title is set"
                                id="hm-project-analysis/untitled"
                            />
                        )}
                    </div>
                )}

                {hasVisibleStats ? (
                    this.renderStats()
                ) : (
                    <div className={styles.emptyStatsMessage}>
                        <FormattedMessage
                            defaultMessage="No statistics selected to display. Please check your settings."
                            description="Message when all stats are hidden"
                            id="hm-project-analysis/noStats"
                        />
                    </div>
                )}

                {this.renderBlockTypes()}
                
                {/* 扩展信息 - 由 renderExtensions 控制显示 */}
                {this.renderExtensions()}

                {hasErrors && (
                    <div className={styles.section}>
                        <div className={styles.subtitle}>
                            <FormattedMessage
                                defaultMessage="Error Information"
                                description="Error information title"
                                id="hm-project-analysis/errorInfo"
                            />
                        </div>
                        <div className={styles.errorBanner}>
                            <span className={styles.errorBannerText}>
                                <FormattedMessage
                                    defaultMessage="Found {count} hidden error(s) in this file"
                                    description="Error count message"
                                    id="hm-project-analysis/errors"
                                    values={{count: summary.errors.length}}
                                />
                            </span>
                            <button
                                className={styles.viewErrorsBtn}
                                data-tab="errors"
                                onClick={() => this.switchTab('errors')}
                            >
                                <FormattedMessage
                                    defaultMessage="View Errors"
                                    description="Button to view errors"
                                    id="hm-project-analysis/viewErrors"
                                />
                            </button>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // ===== Render: Errors Tab =====
    renderErrorsTab() {
        const { summary } = this.state;

        if (!summary || !summary.errors || summary.errors.length === 0) {
            return (
                <div className={styles.noErrorsMessage}>
                    <FormattedMessage
                        defaultMessage="No errors found in this project."
                        description="Message when no errors are found"
                        id="hm-project-analysis/noErrors"
                    />
                </div>
            );
        }

        return (
            <div className={styles.errorsContainer}>
                <div className={styles.errorsDescription}>
                    <FormattedMessage
                        defaultMessage="We apologize that you have seen these. These are likely not your fault, but rather issues with how your editor has handled the project logic, adding erroneous data to your file. If a certain part of your project shows an error screen when opened in the editor, or the project does not run properly, we cannot guarantee that all statistics and block category counts are completely accurate (though they might be). If your project runs normally and shows no errors, these errors are harmless."
                        description="Errors description"
                        id="hm-project-analysis/errorsDescription"
                    />
                </div>
                <div className={styles.errorsListTitle}>
                    <FormattedMessage
                        defaultMessage="Errors found during analysis:"
                        description="Errors list title"
                        id="hm-project-analysis/errorsListTitle"
                    />
                </div>
                <div className={styles.errorsList}>
                    {summary.errors.map((error, index) => (
                        <div key={index} className={styles.errorItem}>
                            <span className={styles.errorIndex}>#{index + 1}</span>
                            <span className={styles.errorText}>{error}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    render() {
        const { isOpen, onRequestClose, intl } = this.props;
        const { activeTab } = this.state;

        if (!isOpen) {
            return null;
        }

        return (
            <div className={styles.modalContent} ref={el => { this.rootEl = el; }}>
                <div className={styles.body}>
                    {this.renderTabs()}
                    <div className={styles.tabContent}>
                        {activeTab === 'result' && this.renderResultTab()}
                        {activeTab === 'errors' && this.renderErrorsTab()}
                    </div>
                </div>
            </div>
        );
    }
}

ProjectAnalysis.propTypes = {
    intl: intlShape,
    isOpen: PropTypes.bool.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    vm: PropTypes.object,
    projectTitle: PropTypes.string,
    getBlockColor: PropTypes.func
};

export default injectIntl(ProjectAnalysis);