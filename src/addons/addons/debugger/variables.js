export default async function createVariablesTab({ debug, addon, console, msg }) {
  const vm = addon.tab.traps.vm;

  const tab = debug.createHeaderTab({
    text: msg("tab-variables"),
    icon: addon.self.getResource("/icons/variables.svg") /* rewritten by pull.js */,
  });

  // 收藏状态管理
  const STORAGE_KEY = "tw:debugger-favorites";
  const getFavorites = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return [];
      }
    }
    return [];
  };
  const setFavorites = (favorites) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  };
  const isFavorite = (variableId) => getFavorites().includes(variableId);
  const toggleFavorite = (variableId) => {
    const favorites = getFavorites();
    const index = favorites.indexOf(variableId);
    if (index === -1) {
      favorites.push(variableId);
    } else {
      favorites.splice(index, 1);
    }
    setFavorites(favorites);
    return index === -1;
  };

  const content = document.createElement("div");
  content.className = "sa-debugger-variables";

  const searchBox = document.createElement("input");
  searchBox.placeholder = msg("search");
  searchBox.className = "sa-debugger-variables-searchbox";

  searchBox.addEventListener("input", (e) => {
    for (const variable of localVariables) {
      variable.handleSearch(searchBox.value);
    }
    for (const variable of globalVariables) {
      variable.handleSearch(searchBox.value);
    }
    updateHeadingVisibility();
  });

  content.appendChild(searchBox);

  const localVars = document.createElement("div");
  const localHeading = document.createElement("span");
  const localList = document.createElement("table");
  localHeading.className = "sa-debugger-variables-heading";
  localHeading.innerText = msg("for-this-sprite");
  localVars.appendChild(localHeading);
  localVars.appendChild(localList);

  const globalVars = document.createElement("div");
  const globalHeading = document.createElement("span");
  const globalList = document.createElement("table");
  globalHeading.className = "sa-debugger-variables-heading";
  globalHeading.innerText = msg("for-all-sprites");
  globalVars.appendChild(globalHeading);
  globalVars.appendChild(globalList);

  content.appendChild(localVars);
  content.appendChild(globalVars);

  let localVariables = [];
  let globalVariables = [];
  let preventUpdate = false;

  // 列表预览最多渲染的行数：超出则只显示前 N 行 + 注脚，避免 O(n) join 与巨量 DOM/reflow。
  const MAX_LIST_LINES = 1000;

  function updateHeadingVisibility() {
    let filteredLocals = localVariables.filter((v) => v.row.style.display !== "none");
    let filteredGlobals = globalVariables.filter((v) => v.row.style.display !== "none");
    localHeading.style.display = filteredLocals.length === 0 ? "none" : "";
    globalHeading.style.display = filteredGlobals.length === 0 ? "none" : "";
  }

  const rowToVariableMap = new WeakMap();
  const observer = new IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        const variable = rowToVariableMap.get(change.target);
        variable.setVisible(change.isIntersecting);
      }
    },
    {
      rootMargin: "100px",
    }
  );

  class WrappedVariable {
    constructor(scratchVariable, target) {
      this.scratchVariable = scratchVariable;
      this.target = target;
      this.visible = false;
      this.ignoreTooBig = false;
      this.buildDOM();
    }

    updateValue(force) {
      if (!this.visible && !force) return;

      let newValue;
      let maxSafeLength;
      if (this.scratchVariable.type === "list") {
        const arr = this.scratchVariable.value;
        if (this._editing) {
          // 编辑态：始终渲染完整值，避免截断预览写回时丢数据
          newValue = arr.join("\n");
        } else {
          // 非编辑态：只拼接前 MAX_LIST_LINES 行，超出追加注脚，成本封顶 O(MAX)
          const truncated = arr.length > MAX_LIST_LINES;
          newValue = (truncated ? arr.slice(0, MAX_LIST_LINES) : arr).join("\n") +
            (truncated ? "\n… (" + arr.length + " items)" : "");
        }
        maxSafeLength = 5000000;
      } else {
        newValue = this.scratchVariable.value;
        maxSafeLength = 1000000;
      }

      if (!this.ignoreTooBig && newValue.length > maxSafeLength) {
        this.input.value = "";
        this.row.dataset.tooBig = true;
        return;
      }

      this.row.dataset.tooBig = false;
      if (newValue !== this.input.value) {
        this.input.disabled = false;
        this.input.value = newValue;
      }
    }

    handleSearch(search) {
      if (this.scratchVariable.name.toLowerCase().includes(search.toLowerCase()) || !search) {
        this.row.style.display = "";
        this.updateValue(true);
      } else {
        this.row.style.display = "none";
      }
    }

    resizeInputIfList() {
      if (this.scratchVariable.type === "list") {
        this.input.style.height = "auto";
        const height = Math.min(1000, this.input.scrollHeight);
        if (height > 0) {
          this.input.style.height = height + "px";
        }
      }
    }

    setVisible(visible) {
      if (this.visible === visible) return;
      this.visible = visible;
      if (visible) {
        this.updateValue();
      }
    }

    buildDOM() {
      const id = `sa-debugger-variables-${this.scratchVariable.id}`;

      const row = document.createElement("tr");
      this.row = row;
      const labelCell = document.createElement("td");
      labelCell.className = "sa-debugger-variables-name";

      const favoriteButton = document.createElement("button");
      favoriteButton.className = "sa-debugger-variables-favorite";
      favoriteButton.title = msg("favorite");
      favoriteButton.style.cssText = "background: none; border: none; cursor: pointer; padding: 0; margin: 0; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;";
      const favoriteIcon = document.createElement("img");
      favoriteIcon.className = "sa-debugger-variables-favorite-icon";
      favoriteIcon.src = addon.self.getResource("/icons/favorites.svg");
      favoriteIcon.style.cssText = "width: 16px; height: 16px;";
      favoriteButton.appendChild(favoriteIcon);
      labelCell.appendChild(favoriteButton);

      const label = document.createElement("input");
      label.value = this.scratchVariable.name;
      label.htmlFor = id;

      // 变量名修改功能
      const onLabelOut = (e) => {
        e.preventDefault();
        const workspace = Blockly.getMainWorkspace();

        let newName = label.value;
        if (newName === this.scratchVariable.name) {
          return;
        }

        const CLOUD_SYMBOL = "☁";
        const CLOUD_PREFIX = CLOUD_SYMBOL + " ";
        if (this.scratchVariable.isCloud) {
          if (newName.startsWith(CLOUD_SYMBOL)) {
            if (!newName.startsWith(CLOUD_PREFIX)) {
              newName = newName.substring(0, 1) + " " + newName.substring(1);
            }
          } else {
            newName = CLOUD_PREFIX + newName;
          }
        }

        let nameAlreadyUsed = false;
        if (this.target.isStage) {
          const existingNames = vm.runtime.getAllVarNamesOfType(this.scratchVariable.type);
          nameAlreadyUsed = existingNames.includes(newName);
        } else {
          nameAlreadyUsed = !!workspace.getVariable(newName, this.scratchVariable.type);
        }

        const isEmpty = !newName.trim();
        if (isEmpty || nameAlreadyUsed) {
          label.value = this.scratchVariable.name;
        } else {
          workspace.renameVariableById(this.scratchVariable.id, newName);
          if (label.value !== newName) {
            label.value = newName;
          }
        }
      };

      label.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.target.blur();
      });
      label.addEventListener("focusout", onLabelOut);

      label.addEventListener("focus", (e) => {
        preventUpdate = true;
        content.classList.add("freeze");
      });

      label.addEventListener("blur", (e) => {
        preventUpdate = false;
        content.classList.remove("freeze");
      });

      labelCell.appendChild(label);

      rowToVariableMap.set(row, this);
      observer.observe(row);

      const valueCell = document.createElement("td");
      valueCell.className = "sa-debugger-variables-value";

      const tooBigElement = document.createElement("button");
      this.tooBigElement = tooBigElement;
      tooBigElement.textContent = msg("too-big");
      tooBigElement.className = "sa-debugger-variables-too-big";
      tooBigElement.addEventListener("click", () => {
        this.ignoreTooBig = true;
        this.updateValue(true);
      });

      let input;
      if (this.scratchVariable.type === "list") {
        input = document.createElement("textarea");
      } else {
        input = document.createElement("input");
      }
      input.className = "sa-debugger-variables-value-input";
      input.id = id;
      this.input = input;

      this.updateValue(true);
      if (this.scratchVariable.type === "list") {
        this.input.addEventListener("input", () => this.resizeInputIfList(), false);
      }

      const onInputOut = (e) => {
        e.preventDefault();
        if (this.scratchVariable.type === "list") {
          vm.setVariableValue(this.target.id, this.scratchVariable.id, input.value.split("\n"));
        } else {
          vm.setVariableValue(this.target.id, this.scratchVariable.id, input.value);
        }
        input.blur();
      };

      input.addEventListener("keydown", (e) => {
        if (e.target.nodeName === "INPUT" && e.key === "Enter") e.target.blur();
      });
      input.addEventListener("focusout", onInputOut);

      input.addEventListener("focus", (e) => {
        preventUpdate = true;
        content.classList.add("freeze");
        this._editing = true;
        // 编辑态载入完整值（覆盖可能截断的预览），失焦写回时才不会丢数据
        this.input.value = this.scratchVariable.value.join("\n");
      });

      input.addEventListener("blur", (e) => {
        preventUpdate = false;
        content.classList.remove("freeze");
        this._editing = false;
      });

      // 收藏按钮功能
      const updateFavoriteIcon = () => {
        const favorited = isFavorite(this.scratchVariable.id);
        favoriteIcon.src = favorited
          ? addon.self.getResource("/icons/favorited.svg")
          : addon.self.getResource("/icons/favorites.svg");
      };

      favoriteButton.addEventListener("click", () => {
        const favorited = toggleFavorite(this.scratchVariable.id);
        updateFavoriteIcon();

        // 将变量移到最前面
        if (favorited) {
          const parentList = this.row.parentNode;
          if (parentList && parentList.firstChild) {
            parentList.insertBefore(this.row, parentList.firstChild);
          }
        }
      });

      // 初始化收藏状态
      updateFavoriteIcon();

      valueCell.appendChild(input);
      valueCell.appendChild(tooBigElement);
      row.appendChild(labelCell);
      row.appendChild(valueCell);

      this.handleSearch(searchBox.value);
    }
  }

  // 语言切换后更新变量页文本（框架在 SELECT_LOCALE 时触发 reenabled）
  const updateLocalizedText = () => {
    searchBox.placeholder = msg("search");
    localHeading.innerText = msg("for-this-sprite");
    globalHeading.innerText = msg("for-all-sprites");
    for (const variable of [...localVariables, ...globalVariables]) {
      if (variable.tooBigElement) {
        variable.tooBigElement.textContent = msg("too-big");
      }
      const favoriteBtn = variable.row && variable.row.querySelector(".sa-debugger-variables-favorite");
      if (favoriteBtn) {
        favoriteBtn.title = msg("favorite");
      }
    }
    fullReload();
  };

  function fullReload() {
    if (preventUpdate) return;

    const editingTarget = vm.runtime.getEditingTarget();
    const stage = vm.runtime.getTargetForStage();
    localVariables = editingTarget.isStage
      ? []
      : Object.values(editingTarget.variables)
        .filter((i) => i.type === "" || i.type === "list")
        .map((i) => new WrappedVariable(i, editingTarget));
    globalVariables = Object.values(stage.variables)
      .filter((i) => i.type === "" || i.type === "list")
      .map((i) => new WrappedVariable(i, stage));

    // 排序：收藏的变量放在前面
    const sortVariables = (variables) => {
      return variables.sort((a, b) => {
        const aFavorite = isFavorite(a.scratchVariable.id);
        const bFavorite = isFavorite(b.scratchVariable.id);
        if (aFavorite && !bFavorite) return -1;
        if (!aFavorite && bFavorite) return 1;
        return 0;
      });
    };

    sortVariables(localVariables);
    sortVariables(globalVariables);

    updateHeadingVisibility();

    while (localList.firstChild) {
      localList.removeChild(localList.firstChild);
    }
    while (globalList.firstChild) {
      globalList.removeChild(globalList.firstChild);
    }

    for (const variable of localVariables) {
      localList.appendChild(variable.row);
    }
    for (const variable of globalVariables) {
      globalList.appendChild(variable.row);
    }

    // 批量测量列表高度：先全部写 height:auto，再在下一帧统一读 scrollHeight，
    // 把「写-读」交替改成「先全写、后全读」，浏览器合并为单次 layout flush，避免逐行同步 reflow 抖动。
    const listVars = [...localVariables, ...globalVariables].filter(
      (v) => v.scratchVariable.type === "list"
    );
    for (const variable of listVars) {
      variable.input.style.height = "auto";
    }
    requestAnimationFrame(() => {
      for (const variable of listVars) {
        const height = Math.min(1000, variable.input.scrollHeight);
        if (height > 0) {
          variable.input.style.height = height + "px";
        }
      }
    });
  }

  // 性能：每帧刷新对人眼无意义（变量检视器），把每帧的 O(n) 列表 join 降到约 5Hz。
  // 项目完全空闲（绿旗停、无脚本执行）时列表不会变，直接跳过。
  const UPDATE_INTERVAL_MS = 200;
  let lastUpdateTime = 0;
  function quickReload() {
    if (preventUpdate) return;
    if (vm.runtime.threads.length === 0) return;
    const now = performance.now();
    if (now - lastUpdateTime < UPDATE_INTERVAL_MS) return;
    lastUpdateTime = now;

    for (const variable of localVariables) {
      variable.updateValue();
    }
    for (const variable of globalVariables) {
      variable.updateValue();
    }
  }

  function cleanup() {
    localVariables = [];
    globalVariables = [];
  }

  debug.addAfterStepCallback(() => {
    quickReload();
  });

  // 监听项目重载和变量变化事件
  vm.runtime.on("PROJECT_LOADED", () => {
    try {
      fullReload();
    } catch (e) {
      console.error(e);
    }
  });

  vm.runtime.on("TOOLBOX_EXTENSIONS_NEED_UPDATE", () => {
    try {
      fullReload();
    } catch (e) {
      console.error(e);
    }
  });

  const show = () => {
    content.style.display = "";
    fullReload();
  };
  const hide = () => {
    content.style.display = "none";
    cleanup();
  };

  return {
    tab,
    content,
    buttons: [],
    show,
    hide,
    updateLocalizedText,
  };
}