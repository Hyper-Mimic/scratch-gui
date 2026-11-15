export default async ({ addon, console, msg }) => {
  if (!addon.tab.redux.state) return console.warn("Redux is not available!");
  const vm = addon.tab.traps.vm;
  if (!vm) return;
  const oldDeleteSprite = vm.deleteSprite;
  const newDeleteSprite = function (...args) {
    if (addon.self.disabled) return oldDeleteSprite.apply(this, args);
    // Capture the restore state before awaiting: a native confirm blocked the
    // VM callback, while the alert card resolves asynchronously.
    const restoreDeletionState = Object.assign({}, addon.tab.redux.state.scratchGui.restoreDeletion);
    return addon.tab.showConfirm({ content: msg("confirm") }).then((canDelete) => {
      if (canDelete) return oldDeleteSprite.apply(this, args);
      setTimeout(
        () =>
          addon.tab.redux.dispatch({
            type: "scratch-gui/restore-deletion/RESTORE_UPDATE",
            state: restoreDeletionState,
          }),
        100
      );
      return Promise.resolve();
    });
  };
  vm.deleteSprite = newDeleteSprite;
};
