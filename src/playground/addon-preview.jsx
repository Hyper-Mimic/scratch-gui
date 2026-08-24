// 插件预览/操作页（独立 playground 页面）
// 左侧操作面板直接读写 SettingsStore 单例（与真实编辑器共用同一份存储），
// 右侧预览复用共享组件 src/addons/preview/preview.jsx（设置页内嵌同一套）。

import React from 'react';
import render from './app-target.js';
import SettingsStore from '../addons/settings-store-singleton.js';
import addons from '../addons/generated/addon-manifests.js';
import AddonPreview from '../addons/preview/preview.jsx';
import {detectTheme} from '../lib/themes/themePersistance.js';
import {applyGuiColors} from '../lib/themes/guiHelpers.js';
import './addon-preview.css';

// 注入主题色 CSS 变量（--looks-secondary 等），让预览高亮跟随 accent 主题色
applyGuiColors(detectTheme());

const ADDON_TABS = [
    {id: 'custom-editor-theme', label: 'Custom editor theme'},
    {id: 'custom-block-text', label: 'Custom block text'},
    {id: 'custom-block-shape', label: 'Custom block shape'}
];

const SETTING_LABELS = {
    // custom-editor-theme
    page: '页面背景',
    accentColor: '主题强调色',
    darkMode: '暗色模式',
    menuBar: '菜单栏背景',
    popup: '弹窗背景',
    activeTab: '活动页签背景',
    tab: '非活动页签背景',
    selector: '角色区背景',
    selector2: '造型/声音列表背景',
    selectorSelection: '选中项背景',
    accent: '强调背景',
    input: '输入框背景',
    workspace: '代码区背景',
    categoryMenu: '积木分类栏背景',
    palette: '积木面板背景',
    fullscreen: '全屏背景',
    stageHeader: '全屏头部背景',
    border: '边框色',
    affectPaper: '修改造型编辑器背景',
    affectStage: '修改舞台变量/气泡颜色',
    // custom-block-text
    size: '字号 (%)',
    bold: '加粗',
    shadow: '阴影',
    // custom-block-shape
    paddingSize: '内边距 (50-200%)',
    cornerSize: '圆角 (0-300%)',
    notchSize: '缺口高度 (0-150%)'
};

const defaultOf = (addonId, id) => {
    const def = addons[addonId].settings.find(s => s.id === id);
    return def ? def.default : '';
};

class PreviewApp extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            activeAddon: 'custom-editor-theme',
            settings: {},
            enabled: false,
            hoveredSettingId: null,
            activeTab: 'code',
            fullScreen: false
        };
        this.onStoreChange = this.onStoreChange.bind(this);
    }

    refresh() {
        const addonId = this.state.activeAddon;
        const settings = {};
        for (const setting of addons[addonId].settings) {
            settings[setting.id] = SettingsStore.getAddonSetting(addonId, setting.id);
        }
        this.setState({
            settings,
            enabled: SettingsStore.getAddonEnabled(addonId)
        });
    }

    onStoreChange(e) {
        if (e.detail && e.detail.addonId && e.detail.addonId !== this.state.activeAddon) return;
        this.refresh();
    }

    componentDidMount() {
        this.refresh();
        SettingsStore.addEventListener('setting-changed', this.onStoreChange);
        SettingsStore.addEventListener('addon-changed', this.onStoreChange);
    }

    componentWillUnmount() {
        SettingsStore.removeEventListener('setting-changed', this.onStoreChange);
        SettingsStore.removeEventListener('addon-changed', this.onStoreChange);
    }

    switchAddon(addonId) {
        this.setState({activeAddon: addonId, hoveredSettingId: null, activeTab: 'code', fullScreen: false}, () => this.refresh());
    }

    setSetting(id, value) {
        SettingsStore.setAddonSetting(this.state.activeAddon, id, value);
        this.refresh();
    }

    handleColorChange(id, e) {
        const picked = e.target.value; // #rrggbb
        // 保留设置的 alpha 通道（如半透明边框），避免改色后透明度丢失
        const current = this.state.settings[id] !== undefined ? this.state.settings[id] : defaultOf(this.state.activeAddon, id);
        const alpha = current && current.length === 9 ? current.slice(7) : '';
        this.setSetting(id, picked + alpha);
    }

    applyPreset(presetId) {
        SettingsStore.applyAddonPreset(this.state.activeAddon, presetId);
        this.refresh();
    }

    toggleEnabled() {
        SettingsStore.setAddonEnabled(this.state.activeAddon, !this.state.enabled);
        this.refresh();
    }

    render() {
        const {activeAddon, settings, enabled, hoveredSettingId, activeTab, fullScreen} = this.state;
        const manifest = addons[activeAddon];

        const renderSetting = setting => {
            const value = settings[setting.id] !== undefined ? settings[setting.id] : defaultOf(activeAddon, setting.id);
            return (
                <div
                    key={setting.id}
                    className="apv-setting-row"
                    onMouseEnter={() => this.setState({hoveredSettingId: setting.id})}
                    onMouseLeave={() => this.setState({hoveredSettingId: null})}
                >
                    <span className="apv-setting-name">
                        {SETTING_LABELS[setting.id] || setting.name}
                    </span>
                    {setting.type === 'color' ? (
                        <input
                            type="color"
                            className="apv-color"
                            value={String(value).slice(0, 7)}
                            onChange={e => this.handleColorChange(setting.id, e)}
                        />
                    ) : setting.type === 'boolean' ? (
                        <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={e => this.setSetting(setting.id, e.target.checked)}
                        />
                    ) : setting.type === 'integer' || setting.type === 'positive_integer' ? (
                        <span className="apv-integer">
                            <input
                                type="range"
                                min={setting.min}
                                max={setting.max}
                                step="1"
                                value={Number(value)}
                                onChange={e => this.setSetting(setting.id, Number(e.target.value))}
                            />
                            <span className="apv-integer-value">{value}</span>
                        </span>
                    ) : null}
                </div>
            );
        };

        return (
            <div className="apv-app">
                <header className="apv-header">
                    <div className="apv-title-wrap">
                        <span className="apv-title">{manifest.name}</span>
                        <span className="apv-subtitle">{activeAddon} · 预览与操作</span>
                    </div>
                    <label className="apv-enable">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={this.toggleEnabled.bind(this)}
                        />
                        <span>启用插件</span>
                    </label>
                </header>
                <nav className="apv-addon-tabs">
                    {ADDON_TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`apv-addon-tab${activeAddon === tab.id ? ' apv-addon-tab-active' : ''}`}
                            onClick={() => this.switchAddon(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
                <div className="apv-body-row">
                    <aside className="apv-panel">
                        <section className="apv-section">
                            <h3 className="apv-section-title">预设</h3>
                            {(manifest.presets || []).map(preset => (
                                <button
                                    key={preset.id}
                                    className="apv-preset-btn"
                                    title={preset.description}
                                    onClick={() => this.applyPreset(preset.id)}
                                >
                                    {preset.name}
                                </button>
                            ))}
                        </section>
                        <section className="apv-section">
                            <h3 className="apv-section-title">设置</h3>
                            {(manifest.settings || []).map(renderSetting)}
                        </section>
                    </aside>
                    <main className="apv-preview-wrap">
                        <AddonPreview
                            addonId={activeAddon}
                            settings={settings}
                            hoveredSettingId={hoveredSettingId}
                            previewProps={{
                                onAreaHover: id => this.setState({hoveredSettingId: id})
                            }}
                        />
                        <p className="apv-hint">
                            提示：鼠标悬停左侧设置项，预览中对应区域会高亮；点预设或改设置立即生效（与真实编辑器共用同一份存储）。
                        </p>
                    </main>
                </div>
            </div>
        );
    }
}

render(<PreviewApp />);
