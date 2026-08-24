// 插件预览用的积木工具箱（左侧调色板）：
// 复用主编辑器的 makeToolboxXML（运动/外观/声音/事件/控制/侦测/运算 7 个核心分类原样，
// 含标准颜色与 shadow 积木、%{BKY_*} 自动本地化），仅把依赖 VM 的
// 变量 / 我的积木 两个动态分类替换为静态内容，避免无 VM 环境下按钮/回调失效。
import makeToolboxXML from '../../lib/make-toolbox-xml';

// 变量分类：预览环境没有变量系统，放一条说明文字
const staticVariablesXML = `
<category name="%{BKY_CATEGORY_VARIABLES}" id="variables" colour="#FF8C1A" secondaryColour="#DB6E00">
    <label text="预览环境：无变量"></label>
</category>`;

// 我的积木分类：静态放一个"定义 我的积木"帽块，可直接拖到工作区
const staticMyBlocksXML = `
<category name="%{BKY_CATEGORY_MYBLOCKS}" id="myBlocks" colour="#FF6680" secondaryColour="#D94F6C">
    <block type="procedures_declaration">
        <mutation proccode="我的积木" argumentids="[]" argumentnames="[]" argumentdefaults="[]" warp="false"></mutation>
    </block>
</category>`;

// 精灵模式（isStage=false）生成完整调色板。
// 注意：makeToolboxXML 内部用 LazyScratchBlocks.isLoaded() 决定是否走 ScratchMsgs 翻译，
// 因此要等 scratch-blocks 加载完成后调用（函数式导出，每次注入时构建）。
export default function buildPreviewToolboxXML() {
    return makeToolboxXML(false, false, 'preview-target', [
        {id: 'data', xml: staticVariablesXML},
        {id: 'procedures', xml: staticMyBlocksXML}
    ]);
}
