export function updateAllBlocks(vm, workspace, blockly) {
  const eventsOriginallyEnabled = blockly.Events.isEnabled();
  blockly.Events.disable(); // Clears workspace right-click→undo (see SA/SA#6691)

  if (workspace) {
    if (vm.editingTarget) {
      vm.emitWorkspaceUpdate();
    }
    const flyout = workspace.getFlyout();
    if (flyout) {
      const flyoutWorkspace = flyout.getWorkspace();
      window.Blockly.Xml.clearWorkspaceAndLoadFromXml(
        window.Blockly.Xml.workspaceToDom(flyoutWorkspace),
        flyoutWorkspace
      );
      workspace.getToolbox().refreshSelection();
      workspace.toolboxRefreshEnabled_ = true;
    }
  }

  // There's no particular reason for checking whether events were originally enabled.
  // Unconditionally enabling events at this point could, in theory, cause bugs in the future.
  if (eventsOriginallyEnabled) blockly.Events.enable(); // Re-enable events
}

// 无 VM 环境的积木重渲染（设置页预览用）：
// 真实插件走 vm.emitWorkspaceUpdate() + flyout 重建；预览没有 VM，改为事件禁用下：
//   1) 重建调色板（flyout）内容 —— 与真实插件 updateAllBlocks 一致，
//      让调色板积木按当前几何重绘（否则调色板积木永远保持进入预览时的旧几何）。
//   2) 逐个 render() 工作区上的所有积木（getDescendants 覆盖输入子块与 next 堆叠后代）。
// 单个积木渲染异常不中断其余积木（防局部报错导致整次更新失败）。
export function rerenderWorkspaceBlocks(workspace, blockly) {
  if (!workspace) return;
  const eventsOriginallyEnabled = blockly.Events.isEnabled();
  blockly.Events.disable();
  try {
    const flyout = workspace.getFlyout();
    if (flyout) {
      try {
        const flyoutWorkspace = flyout.getWorkspace();
        blockly.Xml.clearWorkspaceAndLoadFromXml(
          blockly.Xml.workspaceToDom(flyoutWorkspace),
          flyoutWorkspace
        );
        const toolbox = workspace.getToolbox();
        if (toolbox && typeof toolbox.refreshSelection === "function") {
          toolbox.refreshSelection();
        }
        workspace.toolboxRefreshEnabled_ = true;
      } catch (e) {
        // 调色板重建失败不影响工作区积木的重渲染
      }
    }
    const allBlocks = [];
    workspace.getTopBlocks(false).forEach(top => {
      allBlocks.push.apply(allBlocks, top.getDescendants(true));
    });
    allBlocks
      .filter(b => !b.isDisposed())
      .forEach(b => {
        try {
          b.render();
        } catch (e) {
          // 单个积木渲染失败不影响其余积木
        }
      });
  } finally {
    if (eventsOriginallyEnabled) blockly.Events.enable();
  }
}
