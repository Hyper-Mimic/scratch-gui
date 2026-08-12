// src/components/hm-project-analysis/hm-project-analysis.jsx

import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import { createProjectAnalyzer } from '../../lib/hm-project-analysis/ProjectAnalyzer.js';

import { getExtensionTranslation, extensionTranslations } from '../../lib/hm-project-analysis/index.js';

import styles from './hm-project-analysis.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Project Analysis',
        description: 'Title for project analysis modal',
        id: 'hm.projectAnalysis.title'
    },
    tabResult: {
        defaultMessage: 'Result',
        description: 'Tab label for result tab',
        id: 'hm.projectAnalysis.tabResult'
    },
    tabSettings: {
        defaultMessage: 'Settings',
        description: 'Tab label for settings tab',
        id: 'hm.projectAnalysis.tabSettings'
    },
    tabErrors: {
        defaultMessage: 'Errors',
        description: 'Tab label for errors tab',
        id: 'hm.projectAnalysis.tabErrors'
    },
    // ===== 统计项标签 =====
    sprites: {
        defaultMessage: 'Sprites',
        description: 'Sprite count label',
        id: 'hm.projectAnalysis.sprites'
    },
    totalBlocks: {
        defaultMessage: 'Total Blocks',
        description: 'Total block count label',
        id: 'hm.projectAnalysis.totalBlocks'
    },
    effectiveBlocks: {
        defaultMessage: 'Effective Blocks',
        description: 'Effective block count label',
        id: 'hm.projectAnalysis.effectiveBlocks'
    },
    totalScripts: {
        defaultMessage: 'Total Scripts',
        description: 'Total script count label',
        id: 'hm.projectAnalysis.totalScripts'
    },
    effectiveScripts: {
        defaultMessage: 'Effective Scripts',
        description: 'Effective script count label',
        id: 'hm.projectAnalysis.effectiveScripts'
    },
    costumes: {
        defaultMessage: 'Costumes',
        description: 'Costume count label',
        id: 'hm.projectAnalysis.costumes'
    },
    sounds: {
        defaultMessage: 'Sounds',
        description: 'Sound count label',
        id: 'hm.projectAnalysis.sounds'
    },
    variables: {
        defaultMessage: 'Variables',
        description: 'Variable count label',
        id: 'hm.projectAnalysis.variables'
    },
    lists: {
        defaultMessage: 'Lists',
        description: 'List count label',
        id: 'hm.projectAnalysis.lists'
    },
    functions: {
        defaultMessage: 'Functions',
        description: 'Function count label',
        id: 'hm.projectAnalysis.functions'
    },
    // ===== 统计分组标题 =====
    groupAssets: {
        defaultMessage: 'Assets',
        description: 'Statistics group title for assets',
        id: 'hm.statsGroup.assets'
    },
    groupBlockCount: {
        defaultMessage: 'Block Count',
        description: 'Statistics group title for block count',
        id: 'hm.statsGroup.blockCount'
    },
    groupScriptCount: {
        defaultMessage: 'Script Count',
        description: 'Statistics group title for script count',
        id: 'hm.statsGroup.scriptCount'
    },
    groupDefinitions: {
        defaultMessage: 'Definitions',
        description: 'Statistics group title for definitions',
        id: 'hm.statsGroup.definitions'
    },
    // ===== 其他消息 =====
    basicInformation: {
        defaultMessage: 'Basic Information',
        description: 'Basic information title',
        id: 'hm.projectAnalysis.basicInformation'
    },
    blockCategories: {
        defaultMessage: 'Block Categories',
        description: 'Block categories title',
        id: 'hm.projectAnalysis.blockCategories'
    },
    extensionDisplayInfo: {
        defaultMessage: 'Extension Information',
        description: 'Extension information title',
        id: 'hm.projectAnalysis.extensionDisplayInfo'
    },
    errorInfo: {
        defaultMessage: 'Error Information',
        description: 'Error information title',
        id: 'hm.projectAnalysis.errorInfo'
    },
    errors: {
        defaultMessage: 'Found {count} hidden error(s) in this file',
        description: 'Error count message',
        id: 'hm.projectAnalysis.errors'
    },
    viewErrors: {
        defaultMessage: 'View Errors',
        description: 'Button to view errors',
        id: 'hm.projectAnalysis.viewErrors'
    },
    loading: {
        defaultMessage: 'Analyzing...',
        description: 'Loading message',
        id: 'hm.projectAnalysis.loading'
    },
    empty: {
        defaultMessage: 'No data available. Please analyze a project.',
        description: 'Empty state message',
        id: 'hm.projectAnalysis.empty'
    },
    untitled: {
        defaultMessage: '(Untitled)',
        description: 'Default project title when no title is set',
        id: 'hm.projectAnalysis.untitled'
    },
    noStats: {
        defaultMessage: 'No statistics selected to display. Please check your settings.',
        description: 'Message when all stats are hidden',
        id: 'hm.projectAnalysis.noStats'
    },
    noErrors: {
        defaultMessage: 'No errors found in this project.',
        description: 'Message when no errors are found',
        id: 'hm.projectAnalysis.noErrors'
    },
    errorsDescription: {
        defaultMessage: 'We apologize that you have seen these. These are likely not your fault, but rather issues with how your editor has handled the project logic, adding erroneous data to your file. If a certain part of your project shows an error screen when opened in the editor, or the project does not run properly, we cannot guarantee that all statistics and block category counts are completely accurate (though they might be). If your project runs normally and shows no errors, these errors are harmless.',
        description: 'Errors description',
        id: 'hm.projectAnalysis.errorsDescription'
    },
    errorsListTitle: {
        defaultMessage: 'Errors found during analysis:',
        description: 'Errors list title',
        id: 'hm.projectAnalysis.errorsListTitle'
    }
});

// ===== 积木分类名称的多语言映射 =====
const blockTypeTranslations = {
    motion: { 'zh-cn': '运动', 'zh-tw': '動作', 'en': 'Motion', 'ja': '動き', 'ko': '동작', 'fr': 'Mouvement', 'de': 'Bewegung', 'es': 'Movimiento', 'pt': 'Movimento', 'ru': 'Движение', 'it': 'Movimento', 'nl': 'Beweging', 'sv': 'Rörelse', 'pl': 'Ruch', 'tr': 'Hareket', 'ar': 'حركة', 'he': 'תנועה' },
    looks: { 'zh-cn': '外观', 'zh-tw': '外觀', 'en': 'Looks', 'ja': '見た目', 'ko': '형태', 'fr': 'Apparence', 'de': 'Aussehen', 'es': 'Apariencia', 'pt': 'Aparência', 'ru': 'Внешность', 'it': 'Aspetto', 'nl': 'Uiterlijk', 'sv': 'Utseende', 'pl': 'Wygląd', 'tr': 'Görünüm', 'ar': 'مظهر', 'he': 'מראה' },
    sound: { 'zh-cn': '声音', 'zh-tw': '音效', 'en': 'Sound', 'ja': '音', 'ko': '소리', 'fr': 'Son', 'de': 'Klang', 'es': 'Sonido', 'pt': 'Som', 'ru': 'Звук', 'it': 'Suono', 'nl': 'Geluid', 'sv': 'Ljud', 'pl': 'Dźwięk', 'tr': 'Ses', 'ar': 'صوت', 'he': 'קול' },
    event: { 'zh-cn': '事件', 'zh-tw': '事件', 'en': 'Events', 'ja': 'イベント', 'ko': '이벤트', 'fr': 'Événements', 'de': 'Ereignisse', 'es': 'Eventos', 'pt': 'Eventos', 'ru': 'События', 'it': 'Eventi', 'nl': 'Gebeurtenissen', 'sv': 'Händelser', 'pl': 'Zdarzenia', 'tr': 'Olaylar', 'ar': 'أحداث', 'he': 'אירועים' },
    control: { 'zh-cn': '控制', 'zh-tw': '控制', 'en': 'Control', 'ja': '制御', 'ko': '제어', 'fr': 'Contrôle', 'de': 'Steuerung', 'es': 'Control', 'pt': 'Controle', 'ru': 'Управление', 'it': 'Controllo', 'nl': 'Besturen', 'sv': 'Kontroll', 'pl': 'Kontrola', 'tr': 'Kontrol', 'ar': 'تحكم', 'he': 'בקרה' },
    sensing: { 'zh-cn': '侦测', 'zh-tw': '偵測', 'en': 'Sensing', 'ja': 'センサー', 'ko': '감지', 'fr': 'Capteurs', 'de': 'Fühlen', 'es': 'Sensores', 'pt': 'Sensores', 'ru': 'Сенсоры', 'it': 'Sensori', 'nl': 'Waarnemen', 'sv': 'Känna av', 'pl': 'Czujniki', 'tr': 'Algılama', 'ar': 'استشعار', 'he': 'חיישנים' },
    operator: { 'zh-cn': '运算', 'zh-tw': '運算', 'en': 'Operators', 'ja': '演算', 'ko': '연산', 'fr': 'Opérateurs', 'de': 'Operatoren', 'es': 'Operadores', 'pt': 'Operadores', 'ru': 'Операторы', 'it': 'Operatori', 'nl': 'Operatoren', 'sv': 'Operatorer', 'pl': 'Operatory', 'tr': 'Operatörler', 'ar': 'عمليات', 'he': 'פעולות' },
    data: { 'zh-cn': '变量', 'zh-tw': '變數', 'en': 'Data', 'ja': 'データ', 'ko': '데이터', 'fr': 'Données', 'de': 'Daten', 'es': 'Datos', 'pt': 'Dados', 'ru': 'Данные', 'it': 'Dati', 'nl': 'Gegevens', 'sv': 'Data', 'pl': 'Dane', 'tr': 'Veri', 'ar': 'بيانات', 'he': 'נתונים' },
    variable: { 'zh-cn': '变量', 'zh-tw': '變數', 'en': 'Variables', 'ja': '変数', 'ko': '변수', 'fr': 'Variables', 'de': 'Variablen', 'es': 'Variables', 'pt': 'Variáveis', 'ru': 'Переменные', 'it': 'Variabili', 'nl': 'Variabelen', 'sv': 'Variabler', 'pl': 'Zmienne', 'tr': 'Değişkenler', 'ar': 'متغيرات', 'he': 'משתנים' },
    list: { 'zh-cn': '列表', 'zh-tw': '清單', 'en': 'Lists', 'ja': 'リスト', 'ko': '리스트', 'fr': 'Listes', 'de': 'Listen', 'es': 'Listas', 'pt': 'Listas', 'ru': 'Списки', 'it': 'Liste', 'nl': 'Lijsten', 'sv': 'Listor', 'pl': 'Listy', 'tr': 'Listeler', 'ar': 'قوائم', 'he': 'רשימות' },
    procedures: { 'zh-cn': '自制积木', 'zh-tw': '函式積木', 'en': 'Procedures', 'ja': 'ブロック定義', 'ko': '나만의 블록', 'fr': 'Mes blocs', 'de': 'Meine Blöcke', 'es': 'Mis bloques', 'pt': 'Meus blocos', 'ru': 'Мои блоки', 'it': 'I miei blocchi', 'nl': 'Mijn blokken', 'sv': 'Mina block', 'pl': 'Moje bloki', 'tr': 'Bloklarım', 'ar': 'كتلتي', 'he': 'הבלוקים שלי' },
    addons: { 'zh-cn': '插件', 'zh-tw': '擴充功能', 'en': 'Addons', 'ja': 'アドオン', 'ko': '애드온', 'fr': 'Extensions', 'de': 'Erweiterungen', 'es': 'Complementos', 'pt': 'Complementos', 'ru': 'Дополнения', 'it': 'Componenti aggiuntivi', 'nl': 'Add-ons', 'sv': 'Tillägg', 'pl': 'Dodatki', 'tr': 'Eklentiler', 'ar': 'إضافات', 'he': 'תוספים' },
    others: { 'zh-cn': '其他', 'zh-tw': '其他', 'en': 'Others', 'ja': 'その他', 'ko': '기타', 'fr': 'Autres', 'de': 'Andere', 'es': 'Otros', 'pt': 'Outros', 'ru': 'Другие', 'it': 'Altri', 'nl': 'Overige', 'sv': 'Övriga', 'pl': 'Inne', 'tr': 'Diğer', 'ar': 'أخرى', 'he': 'אחרים' }
};

// ===== 获取积木分类名称的翻译 =====
const getBlockTypeTranslation = (category, locale) => {
    const translations = blockTypeTranslations[category];
    if (!translations) {
        return category;
    }
    
    if (translations[locale]) {
        return translations[locale];
    }
    
    const baseLang = locale ? locale.split('-')[0] : 'en';
    if (translations[baseLang]) {
        return translations[baseLang];
    }
    
    if (translations.en) {
        return translations.en;
    }
    
    return category;
};

class ProjectAnalysis extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            summary: null,
            extensionDataInfo: null,
            extensionDisplayInfo: 'Null',
            isLoading: false,
            error: null,
            activeTab: 'result',
            showFileName: true,
            showSpriteCount: true,
            showCostumeCount: true,
            showSoundCount: true,
            showBlocksNum: true,
            showEffectiveBlocksNum: true,
            showScriptsNum: true,
            showEffectiveScriptsNum: true,
            showExtensionsInfo: false,
            showSpecificExtensions: true,
            showVarDefinitionsNum: false,
            showListDefinitionsNum: false,
            showFuncDefinitionsNum: false,
            betterProgressBar: false,
            orderType: 'original',
            datadisplayway: 'onlydata'
        };
        this.analyzer = null;
    }

    componentDidMount() {
        // 先加载设置
        this.loadSettings();
        // 然后分析
        if (this.props.isOpen && this.props.vm) {
            // 使用 setTimeout 确保 loadSettings 完成并更新 state
            setTimeout(() => {
                this.performAnalysis();
            }, 10);
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

    loadSettings() {
        try {
            const saved = localStorage.getItem('scratchAnalyzerSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.setState(settings);
            }
        } catch (e) {
            // ignore
        }
    }

    saveSettings() {
        const settings = {
            showFileName: this.state.showFileName,
            showSpriteCount: this.state.showSpriteCount,
            showCostumeCount: this.state.showCostumeCount,
            showSoundCount: this.state.showSoundCount,
            showBlocksNum: this.state.showBlocksNum,
            showEffectiveBlocksNum: this.state.showEffectiveBlocksNum,
            showScriptsNum: this.state.showScriptsNum,
            showEffectiveScriptsNum: this.state.showEffectiveScriptsNum,
            showExtensionsInfo: this.state.showExtensionsInfo,
            showSpecificExtensions: this.state.showSpecificExtensions,
            showVarDefinitionsNum: this.state.showVarDefinitionsNum,
            showListDefinitionsNum: this.state.showListDefinitionsNum,
            showFuncDefinitionsNum: this.state.showFuncDefinitionsNum,
            betterProgressBar: this.state.betterProgressBar,
            orderType: this.state.orderType,
            datadisplayway: this.state.datadisplayway
        };
        try {
            localStorage.setItem('scratchAnalyzerSettings', JSON.stringify(settings));
        } catch (e) {
            // ignore
        }
    }

    handleSettingChange = (key, value) => {
        this.setState({ [key]: value }, () => {
            this.saveSettings();
            if (this.state.summary) {
                this.forceUpdate();
            }
        });
    };

    handleRadioChange = (key, value) => {
        this.setState({ [key]: value }, () => {
            this.saveSettings();
            // 如果已有数据，重新分析
            if (this.state.summary) {
                this.performAnalysis();
            }
        });
    };

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
        const hasErrors = summary && summary.errors && summary.errors.length > 0;

        return (
            <div className={styles.tabContainer}>
                <button
                    className={`${styles.tabButton} ${activeTab === 'result' ? styles.tabActive : ''}`}
                    onClick={() => this.switchTab('result')}
                >
                    <FormattedMessage
                        defaultMessage="Result"
                        description="Tab label for result tab"
                        id="hm.projectAnalysis.tabResult"
                    />
                </button>
                <button
                    className={`${styles.tabButton} ${activeTab === 'settings' ? styles.tabActive : ''}`}
                    onClick={() => this.switchTab('settings')}
                >
                    <FormattedMessage
                        defaultMessage="Settings"
                        description="Tab label for settings tab"
                        id="hm.projectAnalysis.tabSettings"
                    />
                </button>
                {hasErrors && (
                    <button
                        className={`${styles.tabButton} ${activeTab === 'errors' ? styles.tabActive : ''} ${styles.tabError}`}
                        onClick={() => this.switchTab('errors')}
                    >
                        <FormattedMessage
                            defaultMessage="Errors"
                            description="Tab label for errors tab"
                            id="hm.projectAnalysis.tabErrors"
                        />
                        <span className={styles.errorBadge}>[{summary.errors.length}]</span>
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
                        id="hm.projectAnalysis.noStats"
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
                        id="hm.projectAnalysis.basicInformation"
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
        const { locale } = this.props.intl;
        
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
                        id="hm.projectAnalysis.blockCategories"
                    />
                </div>
                <div className={styles.categoryList}>
                    {allEntries.map(([category, count]) => {
                        // 判断是否为扩展分类
                        const isExtension = extensionEntries.some(([key]) => key === category);
                        
                        // 获取显示名称
                        let displayName, color;
                        if (isExtension) {
                            if (this.state.extensionDataInfo && this.state.extensionDataInfo[category]?.name) {
                                displayName = this.state.extensionDataInfo[category]?.name ;
                                color = this.state.extensionDataInfo[category]?.color;
                            } else {
                                displayName = getExtensionTranslation(category, locale);
                                color = this.getCategoryColor(category);
                            }
                        } else {
                            // 内置分类：使用 getBlockTypeTranslation
                            displayName = getBlockTypeTranslation(category, locale);
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
        const colorMap = {
            motion: '#4c97ff',
            looks: '#9966ff',
            sound: '#cf63cf',
            event: '#ffbf00',
            control: '#ffab19',
            sensing: '#5cb1d6',
            operator: '#59c059',
            data: '#ff8c1a',
            variable: '#ff8c1a',
            list: '#ff661a',
            procedures: '#ff6680',
            addons: '#29BEB8',
            others: '#9e9e9e'
        };
        
        if (colorMap[category]) {
            return colorMap[category];
        }
        
        // 否则，扩展分类使用默认绿色
        return '#0fbd8c';
    }

    renderExtensions() {
        const { extensionDisplayInfo, summary } = this.state;
        const { locale } = this.props.intl;
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
                    const translatedName = getExtensionTranslation(id, locale);
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
                        id="hm.projectAnalysis.extensionDisplayInfo"
                    />
                </div>
                <div className={styles.extensionInfo}>
                    {displayText}
                </div>
            </div>
        );
    }

    renderSettingsTab() {
        return (
            <div className={styles.settingsContainer}>
                <div className={styles.settingsSection}>
                    <h4 className={styles.settingsTitle}>
                        <FormattedMessage
                            defaultMessage="File Name Display"
                            description="Settings section title"
                            id="hm.settings.fileNameDisplay"
                        />
                    </h4>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showFileName}
                            onChange={(e) => this.handleSettingChange('showFileName', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show file name"
                            description="Setting label"
                            id="hm.settings.showFileName"
                        />
                    </label>
                </div>

                <div className={styles.settingsSection}>
                    <h4 className={styles.settingsTitle}>
                        <FormattedMessage
                            defaultMessage="Basic Info Display"
                            description="Settings section title"
                            id="hm.settings.basicInfoDisplay"
                        />
                    </h4>

                    <h5 className={styles.settingsSubtitle}>
                        <FormattedMessage
                            defaultMessage="Assets"
                            description="Settings subsection"
                            id="hm.settings.assetsTitle"
                        />
                    </h5>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showSpriteCount}
                            onChange={(e) => this.handleSettingChange('showSpriteCount', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show sprite count"
                            description="Setting label"
                            id="hm.settings.showSpriteCount"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showCostumeCount}
                            onChange={(e) => this.handleSettingChange('showCostumeCount', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show costume count"
                            description="Setting label"
                            id="hm.settings.showCostumeCount"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showSoundCount}
                            onChange={(e) => this.handleSettingChange('showSoundCount', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show sound count"
                            description="Setting label"
                            id="hm.settings.showSoundCount"
                        />
                    </label>

                    <h5 className={styles.settingsSubtitle}>
                        <FormattedMessage
                            defaultMessage="Block Count"
                            description="Settings subsection"
                            id="hm.settings.blockCountTitle"
                        />
                    </h5>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showBlocksNum}
                            onChange={(e) => this.handleSettingChange('showBlocksNum', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show total block count"
                            description="Setting label"
                            id="hm.settings.showBlocksNum"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showEffectiveBlocksNum}
                            onChange={(e) => this.handleSettingChange('showEffectiveBlocksNum', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show effective block count"
                            description="Setting label"
                            id="hm.settings.showEffectiveBlocksNum"
                        />
                    </label>

                    <h5 className={styles.settingsSubtitle}>
                        <FormattedMessage
                            defaultMessage="Script Count"
                            description="Settings subsection"
                            id="hm.settings.scriptCountTitle"
                        />
                    </h5>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showScriptsNum}
                            onChange={(e) => this.handleSettingChange('showScriptsNum', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show total script count"
                            description="Setting label"
                            id="hm.settings.showScriptsNum"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showEffectiveScriptsNum}
                            onChange={(e) => this.handleSettingChange('showEffectiveScriptsNum', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show effective script count"
                            description="Setting label"
                            id="hm.settings.showEffectiveScriptsNum"
                        />
                    </label>

                    <h5 className={styles.settingsSubtitle}>
                        <FormattedMessage
                            defaultMessage="Definitions"
                            description="Settings subsection"
                            id="hm.settings.definitionsTitle"
                        />
                    </h5>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showVarDefinitionsNum}
                            onChange={(e) => this.handleSettingChange('showVarDefinitionsNum', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show defined variables count"
                            description="Setting label"
                            id="hm.settings.showVarDefinitionsNum"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showListDefinitionsNum}
                            onChange={(e) => this.handleSettingChange('showListDefinitionsNum', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show defined lists count"
                            description="Setting label"
                            id="hm.settings.showListDefinitionsNum"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showFuncDefinitionsNum}
                            onChange={(e) => this.handleSettingChange('showFuncDefinitionsNum', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show defined functions count"
                            description="Setting label"
                            id="hm.settings.showFuncDefinitionsNum"
                        />
                    </label>
                </div>

                <div className={styles.settingsSection}>
                    <h4 className={styles.settingsTitle}>
                        <FormattedMessage
                            defaultMessage="Block Category Display"
                            description="Settings section title"
                            id="hm.settings.blockCategoryDisplay"
                        />
                    </h4>
                    <h5 className={styles.settingsSubtitle}>
                        <FormattedMessage
                            defaultMessage="Sort Order"
                            description="Settings subsection"
                            id="hm.settings.sortOrder"
                        />
                    </h5>
                    <label className={styles.settingLabel}>
                        <input
                            type="radio"
                            name="orderType"
                            checked={this.state.orderType === 'original'}
                            onChange={() => this.handleRadioChange('orderType', 'original')}
                        />
                        <FormattedMessage
                            defaultMessage="Original order (editor order)"
                            description="Setting label"
                            id="hm.settings.orderOriginal"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="radio"
                            name="orderType"
                            checked={this.state.orderType === 'byCount'}
                            onChange={() => this.handleRadioChange('orderType', 'byCount')}
                        />
                        <FormattedMessage
                            defaultMessage="By count (highest to lowest)"
                            description="Setting label"
                            id="hm.settings.orderByCount"
                        />
                    </label>

                    <h5 className={styles.settingsSubtitle}>
                        <FormattedMessage
                            defaultMessage="Variables & Lists"
                            description="Settings subsection"
                            id="hm.settings.variablesLists"
                        />
                    </h5>
                    <label className={styles.settingLabel}>
                        <input
                            type="radio"
                            name="datadisplayway"
                            checked={this.state.datadisplayway === 'onlydata'}
                            onChange={() => this.handleRadioChange('datadisplayway', 'onlydata')}
                        />
                        <FormattedMessage
                            defaultMessage="Show only 'Variables'"
                            description="Setting label"
                            id="hm.settings.onlydata"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="radio"
                            name="datadisplayway"
                            checked={this.state.datadisplayway === 'separated'}
                            onChange={() => this.handleRadioChange('datadisplayway', 'separated')}
                        />
                        <FormattedMessage
                            defaultMessage="Separate 'Variables' and 'Lists'"
                            description="Setting label"
                            id="hm.settings.separated"
                        />
                    </label>

                    <h5 className={styles.settingsSubtitle}>
                        <FormattedMessage
                            defaultMessage="Other"
                            description="Settings subsection"
                            id="hm.settings.otherOptions"
                        />
                    </h5>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.betterProgressBar}
                            onChange={(e) => this.handleSettingChange('betterProgressBar', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Better progress bar (scale to max category)"
                            description="Setting label"
                            id="hm.settings.betterProgressBar"
                        />
                    </label>
                    <div className={styles.settingHint}>
                        <FormattedMessage
                            defaultMessage="Uses the largest block category as unit '1', providing better display for projects with many blocks"
                            description="Setting hint"
                            id="hm.settings.betterProgressBarHint"
                        />
                    </div>
                </div>

                <div className={styles.settingsSection}>
                    <h4 className={styles.settingsTitle}>
                        <FormattedMessage
                            defaultMessage="Extensions Info Display"
                            description="Settings section title"
                            id="hm.settings.extensionsDisplay"
                        />
                    </h4>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showExtensionsInfo}
                            onChange={(e) => this.handleSettingChange('showExtensionsInfo', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show extension names"
                            description="Setting label"
                            id="hm.settings.showExtensionsInfo"
                        />
                    </label>
                    <label className={styles.settingLabel}>
                        <input
                            type="checkbox"
                            checked={this.state.showSpecificExtensions}
                            onChange={(e) => this.handleSettingChange('showSpecificExtensions', e.target.checked)}
                        />
                        <FormattedMessage
                            defaultMessage="Show specific extensions instead of 'Others' in the block category display"
                            description="Setting label"
                            id="hm.settings.showSpecificExtensions"
                        />
                    </label>
                </div>

                <div className={styles.settingsSection}>
                    <button
                        className={styles.resetButton}
                        onClick={() => {
                            const defaultSettings = {
                                showFileName: true,
                                showSpriteCount: true,
                                showCostumeCount: true,
                                showSoundCount: true,
                                showBlocksNum: true,
                                showEffectiveBlocksNum: true,
                                showScriptsNum: true,
                                showEffectiveScriptsNum: true,
                                showExtensionsInfo: false,
                                showSpecificExtensions: true,
                                showVarDefinitionsNum: false,
                                showListDefinitionsNum: false,
                                showFuncDefinitionsNum: false,
                                betterProgressBar: false,
                                orderType: 'original',
                                datadisplayway: 'onlydata'
                            };
                            this.setState(defaultSettings, () => {
                                this.saveSettings();
                                if (this.state.summary) {
                                    this.forceUpdate();
                                }
                            });
                        }}
                    >
                        <FormattedMessage
                            defaultMessage="Reset to Default Settings"
                            description="Button to reset settings"
                            id="hm.settings.resetToDefault"
                        />
                    </button>
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
                        id="hm.projectAnalysis.loading"
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
                        id="hm.projectAnalysis.empty"
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
                                id="hm.projectAnalysis.untitled"
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
                            id="hm.projectAnalysis.noStats"
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
                                id="hm.projectAnalysis.errorInfo"
                            />
                        </div>
                        <div className={styles.errorBanner}>
                            <span className={styles.errorBannerText}>
                                <FormattedMessage
                                    defaultMessage="Found {count} hidden error(s) in this file"
                                    description="Error count message"
                                    id="hm.projectAnalysis.errors"
                                    values={{count: summary.errors.length}}
                                />
                            </span>
                            <button
                                className={styles.viewErrorsBtn}
                                onClick={() => this.switchTab('errors')}
                            >
                                <FormattedMessage
                                    defaultMessage="View Errors"
                                    description="Button to view errors"
                                    id="hm.projectAnalysis.viewErrors"
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
                        id="hm.projectAnalysis.noErrors"
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
                        id="hm.projectAnalysis.errorsDescription"
                    />
                </div>
                <div className={styles.errorsListTitle}>
                    <FormattedMessage
                        defaultMessage="Errors found during analysis:"
                        description="Errors list title"
                        id="hm.projectAnalysis.errorsListTitle"
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
            <Modal
                className={styles.modalContent}
                onRequestClose={onRequestClose}
                contentLabel={intl.formatMessage(messages.title)}
                id="projectAnalysisModal"
                isOpen={isOpen}
            >
                <Box className={styles.body}>
                    {this.renderTabs()}
                    <div className={styles.tabContent}>
                        {activeTab === 'result' && this.renderResultTab()}
                        {activeTab === 'settings' && this.renderSettingsTab()}
                        {activeTab === 'errors' && this.renderErrorsTab()}
                    </div>
                </Box>
            </Modal>
        );
    }
}

ProjectAnalysis.propTypes = {
    intl: intlShape,
    isOpen: PropTypes.bool.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    vm: PropTypes.object,
    projectTitle: PropTypes.string
};

export default injectIntl(ProjectAnalysis);