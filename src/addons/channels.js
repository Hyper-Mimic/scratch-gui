let changeChannel;
let reloadChannel;
// 通知其它窗口（插件设置窗口）编辑器语言已变。该窗口的翻译在页面加载时就固定下来了，
// 而它常常只是缩在后台（单例窗口，隐藏而不销毁），所以语言变了必须由这边主动通知。
let localeChannel;

if (typeof BroadcastChannel !== 'undefined') {
    changeChannel = new BroadcastChannel('addons-change');
    reloadChannel = new BroadcastChannel('addons-reload');
    localeChannel = new BroadcastChannel('addons-locale');
}

export default {
    changeChannel,
    reloadChannel,
    localeChannel
};
