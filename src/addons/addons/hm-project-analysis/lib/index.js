// index.js
import Stats from './Stats.js';
import GetExtensionsInfo from './GetExtensionsInfo.js';
import LoadExtensionsSource from './LoadExtensionsSource.js';

// 内置积木分类名 / 扩展名：直接读插件自身的 l10n（addons-l10n/{en,zh-cn,...}.json），
// 与插件其它所有文案走同一套 react-intl 机制（intl.formatMessage）。
// 翻译数据维护在 src/addons/addons-l10n/zh-cn.json（及 en.json），键为：
//   hm-project-analysis/blockType-<category>   内置分类（motion/looks/...）
//   hm-project-analysis/extension-<id>          扩展（pen/music/...）
// 注意：不要用 react-intl 的 intl.locale 判断语言——本 fork 的 react-intl 2.9.0
// 不认 'zh-cn' 会静默改成 'en'；但这里只用 intl.messages（已按当前 locale 合并），
// 与 intl.locale 无关，所以 formatMessage(id) 始终返回当前语言的译文。

// fork 的 redux 可能把 locale 存成 "zh_CN"（下划线），归一化到 "zh-cn" / "zh-tw"
export const normalizeLocale = (locale) => {
    if (!locale) return 'en';
    const lower = String(locale).toLowerCase().replace('_', '-');
    if (lower === 'zh-cn' || lower === 'zhcn') return 'zh-cn';
    if (lower === 'zh-tw' || lower === 'zhtw') return 'zh-tw';
    return lower;
};

// ===== 获取内置积木分类名称（读插件 l10n：addons-l10n/*.json） =====
export const getBlockTypeTranslation = (category, locale, intl) => {
    const key = `hm-project-analysis/blockType-${category}`;
    if (intl && typeof intl.formatMessage === 'function') {
        try {
            const msg = intl.formatMessage({ id: key });
            if (msg && msg !== key) return msg;
        } catch (e) { /* ignore */ }
    }
    // 安全网：l10n 缺失时回退到首字母大写的分类 id
    return category.charAt(0).toUpperCase() + category.slice(1);
};

// ===== 获取扩展名称（读插件 l10n；URL 加载的扩展不在表里，回退到 fallbackName 真实名） =====
// fallbackName：调用方传入的扩展真实名称（通常来自 extensionDataInfo[extName].name，
//   即分析器从扩展源码 Scratch.translate.setup 按当前 locale 解析出的名字）。
//   优先级：插件 l10n 译文（标准扩展中文） > fallbackName（URL/自定义扩展真实名） > 原始扩展 id。
export const getExtensionTranslation = (extensionId, locale, intl, fallbackName) => {
    const key = `hm-project-analysis/extension-${extensionId}`;
    if (intl && typeof intl.formatMessage === 'function') {
        try {
            const msg = intl.formatMessage({ id: key });
            if (msg && msg !== key) return msg;
        } catch (e) { /* ignore */ }
    }
    // l10n 未收录时（典型：用户通过 URL 加载的自定义扩展）：
    // 优先用扩展自身的真实名称，再回退原始扩展 id。
    if (fallbackName) return fallbackName;
    return extensionId;
};

// ===== 批量获取多个扩展的翻译 =====
export const getExtensionsTranslations = (extensionIds, locale, intl, fallbackMap) => {
    const result = {};
    extensionIds.forEach(id => {
        result[id] = getExtensionTranslation(id, locale, intl, fallbackMap && fallbackMap[id]);
    });
    return result;
};

// ===== 已知扩展白名单（仅用于分析时识别，显示名改由插件翻译表提供） =====
export const basicExtensions = {
    pen: 'pen',
    videoSensing: 'videoSensing',
    text2speech: 'text2speech',
    translate: 'translate',
    music: 'music',
    microbit: 'microbit',
    ev3: 'ev3',
    wedo2: 'wedo2',
    makeymakey: 'makeymakey'
};

export const defaultToplevelBlockOPs = ["event_whengreaterthan", "event_whenflagclicked", "event_whenkeypressed", "event_whenthisspriteclicked", "event_whenstageclicked", "event_whenbackdropswitchesto", "event_whenbroadcastreceived", "control_start_as_clone", "procedures_definition", "videoSensing_whenMotionGreaterThan", "faceSensing_whenTilted", "faceSensing_whenSpriteTouchesPart", "makeymakey_whenMakeyKeyPressed", "makeymakey_whenCodePressed", "microbit_whenButtonPressed", "microbit_whenGesture", "microbit_whenTilted", "microbit_whenPinConnected", "gdxfor_whenGesture", "gdxfor_whenForcePushedOrPulled", "gdxfor_whenTilted", "ev3_whenDistanceLessThan", "ev3_whenBrightnessLessThan", "boost_whenColor", "boost_whenTilted", "wedo2_whenDistance", "wedo2_whenTilted"];
export const defaultMenuOPs = ["motion_goto_menu", "motion_glideto_menu", "motion_pointtowards_menu", "looks_costume", "looks_backdrops", "sound_sounds_menu", "event_broadcast_menu", "control_create_clone_of_menu", "sensing_touchingobjectmenu", "sensing_distancetomenu", "sensing_keyoptions", "sensing_of_object_menu", "music_menu_DRUM", "music_menu_INSTRUMENT", "pen_menu_colorParam", "videoSensing_menu_ATTRIBUTE", "videoSensing_menu_SUBJECT", "videoSensing_menu_VIDEO_STATE", "text2speech_menu_voices", "text2speech_menu_languages", "translate_menu_languages", "makeymakey_menu_KEY", "makeymakey_menu_SEQUENCE", "microbit_menu_buttons", "microbit_menu_gestures", "microbit_menu_tiltDirectionAny", "microbit_menu_tiltDirection", "microbit_menu_touchPins", "gdxfor_menu_gestureOptions", "gdxfor_menu_pushPullOptions", "gdxfor_menu_tiltAnyOptions", "gdxfor_menu_tiltOptions", "gdxfor_menu_axisOptions", "ev3_menu_motorPorts", "ev3_menu_sensorPorts", "boost_menu_MOTOR_ID", "boost_menu_MOTOR_DIRECTION", "boost_menu_MOTOR_REPORTER_ID", "boost_menu_COLOR", "boost_menu_TILT_DIRECTION_ANY", "boost_menu_TILT_DIRECTION", "wedo2_menu_MOTOR_ID", "wedo2_menu_MOTOR_DIRECTION", "wedo2_menu_OP", "wedo2_menu_TILT_DIRECTION_ANY", "wedo2_menu_TILT_DIRECTION"];

// ===== 导出（仅列出未单独 export 的绑定） =====
export {
    Stats,
    GetExtensionsInfo,
    LoadExtensionsSource
};

export default {
    Stats,
    GetExtensionsInfo,
    LoadExtensionsSource,
    getBlockTypeTranslation,
    getExtensionTranslation,
    getExtensionsTranslations,
    normalizeLocale,
    basicExtensions,
    defaultToplevelBlockOPs,
    defaultMenuOPs
};
