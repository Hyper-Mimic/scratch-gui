// src/components/hm-project-analysis/hm-project-analysis.jsx

import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import { createProjectAnalyzer } from '../../lib/hm-project-analysis/ProjectAnalyzer.js';

import styles from './hm-project-analysis.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Project Analysis',
        description: 'Title for project analysis modal',
        id: 'hm.projectAnalysis.title'
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
    
    // 精确匹配
    if (translations[locale]) {
        return translations[locale];
    }
    
    // 基础语言（如 'zh-cn' → 'zh'）
    const baseLang = locale ? locale.split('-')[0] : 'en';
    if (translations[baseLang]) {
        return translations[baseLang];
    }
    
    // 回退到英语
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
            fileSize: '0.00',
            extensionInfo: 'Null',
            isLoading: false,
            error: null
        };
        this.analyzer = null;
    }

    componentDidMount() {
        if (this.props.isOpen && this.props.vm) {
            this.performAnalysis();
        }
    }

    componentDidUpdate(prevProps) {
        if (this.props.isOpen && !prevProps.isOpen && this.props.vm) {
            this.performAnalysis();
        }
    }

    async performAnalysis() {
        if (!this.props.vm) {
            this.setState({ 
                error: '[hm-Analysis] Failed to analyze project: VM is not initialized.',
                isLoading: false 
            });
            return;
        }

        this.setState({ isLoading: true, error: null });

        try {
            this.analyzer = createProjectAnalyzer(this.props.vm);
            await this.analyzer.analyzeProject('onlydata');
            
            const summary = this.analyzer.getSummary();
            const extensionInfo = this.analyzer.getExtensionDisplayInfo();
            
            this.setState({
                summary,
                extensionInfo,
                isLoading: false
            });
        } catch (error) {
            console.error('[hm-Analysis] Failed to analyze project:', error);
            this.setState({
                error: error.message || '[hm-Analysis] Failed to analyze project: Unknown error.',
                isLoading: false
            });
        }
    }

    renderStats() {
        const { summary } = this.state;
        if (!summary) return null;

        const statsItems = [
            { 
                key: 'sprites', 
                value: summary.totalSprites, 
                label: (
                    <FormattedMessage
                        defaultMessage="Sprites"
                        description="Sprite count label"
                        id="hm.projectAnalysis.sprites"
                    />
                )
            },
            { 
                key: 'blocks', 
                value: summary.totalBlocks, 
                label: (
                    <FormattedMessage
                        defaultMessage="Blocks"
                        description="Block count label"
                        id="hm.projectAnalysis.blocks"
                    />
                )
            },
            { 
                key: 'costumes', 
                value: summary.totalCostumes, 
                label: (
                    <FormattedMessage
                        defaultMessage="Costumes"
                        description="Costume count label"
                        id="hm.projectAnalysis.costumes"
                    />
                )
            },
            { 
                key: 'sounds', 
                value: summary.totalSounds, 
                label: (
                    <FormattedMessage
                        defaultMessage="Sounds"
                        description="Sound count label"
                        id="hm.projectAnalysis.sounds"
                    />
                )
            },
            { 
                key: 'variables', 
                value: summary.totalVariables, 
                label: (
                    <FormattedMessage
                        defaultMessage="Variables"
                        description="Variable count label"
                        id="hm.projectAnalysis.variables"
                    />
                )
            },
            { 
                key: 'lists', 
                value: summary.totalLists, 
                label: (
                    <FormattedMessage
                        defaultMessage="Lists"
                        description="List count label"
                        id="hm.projectAnalysis.lists"
                    />
                )
            },
            { 
                key: 'extensions', 
                value: summary.extensions, 
                label: (
                    <FormattedMessage
                        defaultMessage="Extensions"
                        description="Extension count label"
                        id="hm.projectAnalysis.extensions"
                    />
                )
            },
            { 
                key: 'functions', 
                value: summary.functions, 
                label: (
                    <FormattedMessage
                        defaultMessage="Functions"
                        description="Function count label"
                        id="hm.projectAnalysis.functions"
                    />
                )
            }
        ];

        return (<>
                <div className={styles.subtitle}>
                    <FormattedMessage
                        defaultMessage="Basic Information"
                        description="Basic information title"
                        id="hm.projectAnalysis.basicInformation"
                    />
                </div>
                <div className={styles.statsGrid}>

                    {statsItems.map(item => (
                        <div key={item.key} className={styles.statItem}>
                            <span className={styles.statValue}>{item.value}</span>
                            <span className={styles.statLabel}>{item.label}</span>
                        </div>
                    ))}
                </div>
            </>
        );
    }

    renderBlockTypes() {
        const { summary } = this.state;
        const { locale } = this.props.intl;
        
        if (!summary || !summary.blockTypes) return null;

        const entries = Object.entries(summary.blockTypes)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) return null;

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
                    {entries.map(([category, count]) => {
                        // 使用多语言翻译
                        const displayName = getBlockTypeTranslation(category, locale);
                        return (
                            <div key={category} className={styles.categoryItem}>
                                <span className={styles.categoryName}>{displayName}</span>
                                <span className={styles.categoryCount}>{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    renderExtensions() {
        const { extensionInfo } = this.state;
        if (!extensionInfo || extensionInfo === 'Null') return null;

        return (
            <div className={styles.section}>
               <div className={styles.subtitle}>
                    <FormattedMessage
                        defaultMessage="Extension Information"
                        description="Extension information title"
                        id="hm.projectAnalysis.extensionInfo"
                    />
                </div>
                <div className={styles.extensionInfo}>
                {extensionInfo}
                </div>
            </div>
        );
    }

    renderErrors() {
        const { summary } = this.state;
        if (!summary || !summary.errors || summary.errors.length === 0) return null;

        return (
            <div className={styles.section}>
                <div className={styles.errorInfo} style={{color: '#ef4444'}}>
                    <FormattedMessage
                        defaultMessage="Found {count} hidden error(s) in this file"
                        description="Error count message"
                        id="hm.projectAnalysis.errors"
                        values={{count: summary.errors.length}}
                    />
                </div>
            </div>
        );
    }

    render() {
        const { isOpen, onRequestClose, projectTitle, intl } = this.props;
        const { isLoading, error } = this.state;

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
                    {isLoading ? (
                        <div style={{textAlign: 'center', padding: '20px'}}>
                            <FormattedMessage
                                defaultMessage="Analyzing..."
                                description="Loading message"
                                id="hm.projectAnalysis.loading"
                            />
                        </div>
                    ) : error ? (
                        <div style={{color: '#ef4444', textAlign: 'center', padding: '20px'}}>
                            {error}
                        </div>
                    ) : (
                        <>
                            <div className={styles.projectTitle}>
                                {projectTitle || (
                                    <FormattedMessage
                                        defaultMessage="(Untitled)"
                                        description="Default project title when no title is set"
                                        id="hm.projectAnalysis.untitled"
                                    />
                                )}
                            </div>

                            {this.renderStats()}
                            {this.renderBlockTypes()}
                            {this.renderExtensions()}
                            {this.renderErrors()}

                            <div className={styles.toolInformation}>
                                {(
                                    <>
                                        <br />
                                        <FormattedMessage
                                            defaultMessage="Tool Information:"
                                            description="text for tool information section"
                                            id="hm.projectAnalysis.toolInformationTitle"
                                        />
                                        <br />
                                        <FormattedMessage
                                            defaultMessage="Made by {ClyainLink}. For more information, please visit {GitHubRepositoryLink}."
                                            description="text for tool information section"
                                            id="hm.projectAnalysis.toolInformationContent1"
                                            values={{
                                                ClyainLink: (
                                                    <a 
                                                        href="https://github.com/Clyain" 
                                                        target="_blank" 
                                                        style={{color: '#4a7db5', textDecoration: 'underline'}}
                                                    >
                                                        Clyain
                                                    </a>
                                                ) ,
                                                GitHubRepositoryLink: (
                                                    <a 
                                                        href="https://github.com/Clyain/Scratch-3-Project-Analyzer_EPSA" 
                                                        target="_blank" 
                                                        style={{color: '#4a7db5', textDecoration: 'underline'}}
                                                    >
                                                        <FormattedMessage
                                                            defaultMessage="this GitHub repository"
                                                            description="my GitHub repository link"
                                                            id="hm.projectAnalysis.thisGitHubRepository"
                                                        />
                                                    </a>
                                                )
                                            }}
                                        />
                                        <br />
                                        <FormattedMessage
                                            defaultMessage="You can also visit {EPSALink} to use more features."
                                            description="text for tool information section"
                                            id="hm.projectAnalysis.toolInformationContent2"
                                            values={{
                                                EPSALink: (
                                                    <a 
                                                        href="https://clyain.netlify.app/epsa" 
                                                        target="_blank" 
                                                        style={{color: '#4a7db5', textDecoration: 'underline'}}
                                                    >
                                                        EPSA
                                                    </a>
                                                )
                                            }}
                                        />
                                    </>
                                )}
                            </div>
                        </>
                    )}
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