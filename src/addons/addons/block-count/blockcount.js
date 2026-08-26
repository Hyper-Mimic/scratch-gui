export default async function ({ addon, console, msg }) {
  const vm = addon.tab.traps.vm;

  // 当前已渲染的计数元素引用；语言切换时通过 reenabled 事件刷新其文案
  let currentDisplay = null;

  const updateText = () => {
    if (currentDisplay) {
      currentDisplay.innerText = msg("blocks", { num: getBlockCount().blockCount });
    }
  };

  // 语言切换后更新已渲染的计数文本。waitForElement 用了 markAsSeen:true，
  // 菜单栏元素被“见过”后不会因 SELECT_LOCALE 再次 resolve，循环体不会重跑，
  // 因此必须单独监听框架在切语言时派发的 reenabled 事件来刷新文案。
  addon.self.addEventListener("reenabled", updateText);

  const getBlockCount = () => {
    let blockCount = 0;
    let scriptCount = 0;
    let sprites = new Set(vm.runtime.targets.map((i) => i.sprite.blocks._blocks));
    sprites.forEach((sprite, i) => {
      scriptCount += Object.values(sprite).filter((o) => !o.parent).length; // Filter blocks that don't have a parent (meaning it's the top of a stack)
      blockCount += Object.values(sprite).filter((o) => !o.shadow).length; // shadow blocks should be filtered out
    });
    return {
      blockCount,
      scriptCount,
      spriteCount: sprites.size - 1, // Backdrop counts as a target so we can subtract it
    };
  };

  const addLiveBlockCount = async () => {
    if (vm.editingTarget) {
      let handler = null;
      while (true) {
        const topBar = await addon.tab.waitForElement("[class^='menu-bar_main-menu']", {
          markAsSeen: true,
          reduxEvents: [
            "scratch-gui/mode/SET_PLAYER",
            "fontsLoaded/SET_FONTS_LOADED",
            "scratch-gui/locales/SELECT_LOCALE",
          ],
          reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
        });
        let display = topBar.appendChild(document.createElement("span"));
        currentDisplay = display;
        addon.tab.displayNoneWhileDisabled(display);
        display.style.order = 1;
        display.innerText = msg("blocks", { num: getBlockCount().blockCount });
        let debounce; // debouncing values because of the way 'PROJECT_CHANGED' works
        if (handler) {
          vm.off("PROJECT_CHANGED", handler);
          vm.runtime.off("PROJECT_LOADED", handler);
        }
        handler = async () => {
          clearTimeout(debounce);
          debounce = setTimeout(async () => {
            display.innerText = msg("blocks", { num: getBlockCount().blockCount });
          }, 1000);
        };
        vm.on("PROJECT_CHANGED", handler);
        vm.runtime.on("PROJECT_LOADED", handler);
      }
    } else {
      let timeout = setTimeout(function () {
        addLiveBlockCount();
        clearTimeout(timeout);
      }, 1000);
    }
  };

  addLiveBlockCount();
}
