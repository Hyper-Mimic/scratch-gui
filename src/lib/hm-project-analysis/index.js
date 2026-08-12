// index.js
import Stats from './Stats.js';
import GetExtensionsInfo from './GetExtensionsInfo.js';
import LoadExtensionSource from './LoadExtensionsSource.js';

// ===== 扩展名称的多语言映射（穷举法） =====
export const extensionTranslations = {
    pen: {
        'zh-cn': '画笔',
        'zh-tw': '畫筆',
        'en': 'Pen',
        'ja': 'ペン',
        'ko': '펜',
        'fr': 'Stylo',
        'de': 'Stift',
        'es': 'Lápiz',
        'pt': 'Caneta',
        'ru': 'Перо',
        'it': 'Penna',
        'nl': 'Pen',
        'sv': 'Penna',
        'pl': 'Pióro',
        'tr': 'Kalem',
        'ar': 'قلم',
        'he': 'עט'
    },
    videoSensing: {
        'zh-cn': '视频侦测',
        'zh-tw': '視訊偵測',
        'en': 'Video Sensing',
        'ja': 'ビデオモーションセンサー',
        'ko': '비디오 감지',
        'fr': 'Détection vidéo',
        'de': 'Videoerkennung',
        'es': 'Sensor de video',
        'pt': 'Sensoriamento de vídeo',
        'ru': 'Видео-сенсоры',
        'it': 'Rilevamento video',
        'nl': 'Videodetectie',
        'sv': 'Videosensor',
        'pl': 'Czujnik wideo',
        'tr': 'Video Algılama',
        'ar': 'استشعار الفيديو',
        'he': 'חיישן וידאו'
    },
    text2speech: {
        'zh-cn': '文字转语音',
        'zh-tw': '文字轉語音',
        'en': 'Text to Speech',
        'ja': 'テキスト読み上げ',
        'ko': '텍스트 음성 변환',
        'fr': 'Synthèse vocale',
        'de': 'Text-to-Speech',
        'es': 'Texto a voz',
        'pt': 'Texto para voz',
        'ru': 'Текст в речь',
        'it': 'Sintesi vocale',
        'nl': 'Tekst naar spraak',
        'sv': 'Text till tal',
        'pl': 'Zamiana tekstu na mowę',
        'tr': 'Metin okuma',
        'ar': 'نص إلى كلام',
        'he': 'טקסט לדיבור'
    },
    translate: {
        'zh-cn': '翻译',
        'zh-tw': '翻譯',
        'en': 'Translate',
        'ja': '翻訳',
        'ko': '번역',
        'fr': 'Traduction',
        'de': 'Übersetzen',
        'es': 'Traductor',
        'pt': 'Tradução',
        'ru': 'Перевод',
        'it': 'Traduzione',
        'nl': 'Vertalen',
        'sv': 'Översättning',
        'pl': 'Tłumaczenie',
        'tr': 'Çeviri',
        'ar': 'ترجمة',
        'he': 'תרגום'
    },
    music: {
        'zh-cn': '音乐',
        'zh-tw': '音樂',
        'en': 'Music',
        'ja': '音楽',
        'ko': '음악',
        'fr': 'Musique',
        'de': 'Musik',
        'es': 'Música',
        'pt': 'Música',
        'ru': 'Музыка',
        'it': 'Musica',
        'nl': 'Muziek',
        'sv': 'Musik',
        'pl': 'Muzyka',
        'tr': 'Müzik',
        'ar': 'موسيقى',
        'he': 'מוזיקה'
    },
    microbit: {
        'zh-cn': 'Micro:bit',
        'zh-tw': 'Micro:bit',
        'en': 'Micro:bit',
        'ja': 'Micro:bit',
        'ko': 'Micro:bit',
        'fr': 'Micro:bit',
        'de': 'Micro:bit',
        'es': 'Micro:bit',
        'pt': 'Micro:bit',
        'ru': 'Micro:bit',
        'it': 'Micro:bit',
        'nl': 'Micro:bit',
        'sv': 'Micro:bit',
        'pl': 'Micro:bit',
        'tr': 'Micro:bit',
        'ar': 'Micro:bit',
        'he': 'Micro:bit'
    },
    ev3: {
        'zh-cn': '乐高 EV3',
        'zh-tw': '樂高 EV3',
        'en': 'LEGO EV3',
        'ja': 'レゴ EV3',
        'ko': '레고 EV3',
        'fr': 'LEGO EV3',
        'de': 'LEGO EV3',
        'es': 'LEGO EV3',
        'pt': 'LEGO EV3',
        'ru': 'LEGO EV3',
        'it': 'LEGO EV3',
        'nl': 'LEGO EV3',
        'sv': 'LEGO EV3',
        'pl': 'LEGO EV3',
        'tr': 'LEGO EV3',
        'ar': 'ليغو EV3',
        'he': 'LEGO EV3'
    },
    wedo2: {
        'zh-cn': '乐高 WeDo 2.0',
        'zh-tw': '樂高 WeDo 2.0',
        'en': 'LEGO WeDo 2.0',
        'ja': 'レゴ WeDo 2.0',
        'ko': '레고 WeDo 2.0',
        'fr': 'LEGO WeDo 2.0',
        'de': 'LEGO WeDo 2.0',
        'es': 'LEGO WeDo 2.0',
        'pt': 'LEGO WeDo 2.0',
        'ru': 'LEGO WeDo 2.0',
        'it': 'LEGO WeDo 2.0',
        'nl': 'LEGO WeDo 2.0',
        'sv': 'LEGO WeDo 2.0',
        'pl': 'LEGO WeDo 2.0',
        'tr': 'LEGO WeDo 2.0',
        'ar': 'ليغو WeDo 2.0',
        'he': 'LEGO WeDo 2.0'
    },
    makeymakey: {
        'zh-cn': 'Makey Makey',
        'zh-tw': 'Makey Makey',
        'en': 'Makey Makey',
        'ja': 'Makey Makey',
        'ko': 'Makey Makey',
        'fr': 'Makey Makey',
        'de': 'Makey Makey',
        'es': 'Makey Makey',
        'pt': 'Makey Makey',
        'ru': 'Makey Makey',
        'it': 'Makey Makey',
        'nl': 'Makey Makey',
        'sv': 'Makey Makey',
        'pl': 'Makey Makey',
        'tr': 'Makey Makey',
        'ar': 'Makey Makey',
        'he': 'Makey Makey'
    }
};

// ===== 获取扩展名称的翻译 =====
export const getExtensionTranslation = (extensionId, locale) => {
    // 1. 检查扩展是否有翻译映射
    const translations = extensionTranslations[extensionId];
    if (!translations) {
        // 没有翻译映射，返回扩展ID（首字母大写）
        return extensionId.charAt(0).toUpperCase() + extensionId.slice(1);
    }
    
    // 2. 尝试获取对应语言的翻译
    if (translations[locale]) {
        return translations[locale];
    }
    
    // 3. 尝试获取语言的基础部分（如 'zh-cn' → 'zh'）
    const baseLang = locale ? locale.split('-')[0] : 'en';
    if (translations[baseLang]) {
        return translations[baseLang];
    }
    
    // 4. 回退到英语
    if (translations.en) {
        return translations.en;
    }
    
    // 5. 最终回退：返回扩展ID
    return extensionId.charAt(0).toUpperCase() + extensionId.slice(1);
};

// ===== 批量获取多个扩展的翻译 =====
export const getExtensionsTranslations = (extensionIds, locale) => {
    const result = {};
    extensionIds.forEach(id => {
        result[id] = getExtensionTranslation(id, locale);
    });
    return result;
};

// ===== 兼容旧的 basicExtensions（硬编码中文） =====
export const basicExtensions = {
    pen: '画笔',
    videoSensing: '视频侦测',
    text2speech: '文字转语音',
    translate: '翻译',
    music: '音乐',
    microbit: 'Micro:bit',
    ev3: '乐高 EV3',
    wedo2: '乐高 WeDo 2.0',
    makeymakey: 'Makey Makey'
};

export const defaultToplevelBlockOPs = ["event_whengreaterthan", "event_whenflagclicked", "event_whenkeypressed", "event_whenthisspriteclicked", "event_whenstageclicked", "event_whenbackdropswitchesto", "event_whenbroadcastreceived", "control_start_as_clone", "procedures_definition", "videoSensing_whenMotionGreaterThan", "faceSensing_whenTilted", "faceSensing_whenSpriteTouchesPart", "makeymakey_whenMakeyKeyPressed", "makeymakey_whenCodePressed", "microbit_whenButtonPressed", "microbit_whenGesture", "microbit_whenTilted", "microbit_whenPinConnected", "gdxfor_whenGesture", "gdxfor_whenForcePushedOrPulled", "gdxfor_whenTilted", "ev3_whenDistanceLessThan", "ev3_whenBrightnessLessThan", "boost_whenColor", "boost_whenTilted", "wedo2_whenDistance", "wedo2_whenTilted"];
export const defaultMenuOPs = ["motion_goto_menu", "motion_glideto_menu", "motion_pointtowards_menu", "looks_costume", "looks_backdrops", "sound_sounds_menu", "event_broadcast_menu", "control_create_clone_of_menu", "sensing_touchingobjectmenu", "sensing_distancetomenu", "sensing_keyoptions", "sensing_of_object_menu", "music_menu_DRUM", "music_menu_INSTRUMENT", "pen_menu_colorParam", "videoSensing_menu_ATTRIBUTE", "videoSensing_menu_SUBJECT", "videoSensing_menu_VIDEO_STATE", "text2speech_menu_voices", "text2speech_menu_languages", "translate_menu_languages", "makeymakey_menu_KEY", "makeymakey_menu_SEQUENCE", "microbit_menu_buttons", "microbit_menu_gestures", "microbit_menu_tiltDirectionAny", "microbit_menu_tiltDirection", "microbit_menu_touchPins", "gdxfor_menu_gestureOptions", "gdxfor_menu_pushPullOptions", "gdxfor_menu_tiltAnyOptions", "gdxfor_menu_tiltOptions", "gdxfor_menu_axisOptions", "ev3_menu_motorPorts", "ev3_menu_sensorPorts", "boost_menu_MOTOR_ID", "boost_menu_MOTOR_DIRECTION", "boost_menu_MOTOR_REPORTER_ID", "boost_menu_COLOR", "boost_menu_TILT_DIRECTION_ANY", "boost_menu_TILT_DIRECTION", "wedo2_menu_MOTOR_ID", "wedo2_menu_MOTOR_DIRECTION", "wedo2_menu_OP", "wedo2_menu_TILT_DIRECTION_ANY", "wedo2_menu_TILT_DIRECTION"];

// ===== 导出 =====
export {
    Stats,
    GetExtensionsInfo,
    LoadExtensionSource
};

export default {
    Stats,
    GetExtensionsInfo,
    LoadExtensionSource,
    extensionTranslations,
    getExtensionTranslation,
    getExtensionsTranslations,
    basicExtensions,
    defaultToplevelBlockOPs,
    defaultMenuOPs
};