//@ts-check
// Build from existing blocks — addon version of the "Build from existing blocks"
// button that used to live inside the custom-procedures container/component.
// Instead of relying on React component internals (this.mutationRoot), this
// addon finds the editor's procedures_declaration block at runtime and applies
// the chosen custom block's mutation to it.

export default async function ({ addon, msg, console }) {
  const Blockly = await addon.tab.traps.getBlockly();
  const vm = addon.tab.traps.vm;
  if (!Blockly || !vm) return;

  // The button row at the bottom of the "Make a block" modal. The class is a
  // CSS-module hash but the prefix (file + property name) is stable.
  const BUTTON_ROW_SELECTOR = '[class*="custom-procedures_button-row"]';
  let dropdown = null;
  let anchorBtnRef = null;

  // Find the procedures_declaration block being edited in the custom block
  // editor workspace. When the "Make a block" modal is open, scratch-gui makes
  // the editor workspace the MAIN workspace (see how recolor-custom-blocks
  // reaches it via Blockly.getMainWorkspace().getTopBlocks()[0]), so we try
  // that first and only fall back to scanning every workspace.
  function getDeclarationBlock() {
    const candidates = [];

    if (typeof Blockly.getMainWorkspace === "function") {
      const main = Blockly.getMainWorkspace();
      if (main) candidates.push(main);
    }
    if (Blockly.Workspace && typeof Blockly.Workspace.getAllWorkspaces === "function") {
      for (const ws of Blockly.Workspace.getAllWorkspaces()) {
        if (ws) candidates.push(ws);
      }
    }

    for (const ws of candidates) {
      if (!ws) continue;
      if (typeof ws.getTopBlocks === "function") {
        for (const b of ws.getTopBlocks(false)) {
          if (b.type === "procedures_declaration") return b;
        }
      }
      if (typeof ws.getAllBlocks === "function") {
        for (const b of ws.getAllBlocks()) {
          if (b.type === "procedures_declaration") return b;
        }
      }
    }
    return null;
  }

  // Collect existing custom blocks (procedures_prototype) from the project.
  function collectProccodes(allSprites) {
    const out = [];
    let idx = 0;
    try {
      const data = typeof vm.toJSON === "function" ? JSON.parse(vm.toJSON()) : null;
      if (!data) return out;
      const targets = data.targets || [];
      const current = vm.editingTarget ? vm.editingTarget.sprite.name : null;
      for (const t of targets) {
        if (!allSprites && t.name !== current) continue;
        const blocks = t.blocks || {};
        for (const id in blocks) {
          const blk = blocks[id];
          if (blk && blk.opcode === "procedures_prototype" && blk.mutation) {
            const m = blk.mutation;
            if (!m.proccode) continue;
            out.push({
              proccode: m.proccode,
              targetName: t.name,
              idx: idx++,
              mutation: {
                proccode: m.proccode,
                argumentids: m.argumentids || "[]",
                argumentnames: m.argumentnames || "[]",
                argumentdefaults: m.argumentdefaults || "[]",
                warp: m.warp || "false"
              }
            });
          }
        }
      }
    } catch (e) {
      console.error("[build-from-blocks] collect failed", e);
    }
    // Sort like find-bar: same category for all custom blocks, so order by
    // lowercased name, then lowercased sprite name, then original traversal order.
    out.sort((a, b) => {
      const na = a.proccode.toLowerCase();
      const nb = b.proccode.toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      const ta = a.targetName.toLowerCase();
      const tb = b.targetName.toLowerCase();
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return a.idx - b.idx;
    });
    return out;
  }

  function applyMutation(data) {
    const decl = getDeclarationBlock();
    if (!decl) {
      console.warn("[build-from-blocks] declaration block not found");
      return;
    }
    const m = data.mutation;
    const xml = document.createElement("mutation");
    xml.setAttribute("proccode", m.proccode);
    xml.setAttribute("argumentids", m.argumentids);
    xml.setAttribute("argumentnames", m.argumentnames);
    xml.setAttribute("argumentdefaults", m.argumentdefaults);
    xml.setAttribute("warp", m.warp);
    try {
      decl.domToMutation(xml);
      decl.initSvg();
      decl.render();
    } catch (e) {
      console.error("[build-from-blocks] apply failed", e);
    }
  }

  function onDocMouseDown(e) {
    if (dropdown && !dropdown.contains(e.target) &&
        !(e.target.classList && e.target.classList.contains("sa-bfe-button"))) {
      closeDropdown();
    }
  }

  function positionDropdown() {
    if (!dropdown || !anchorBtnRef) return;
    const rect = anchorBtnRef.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 6) + "px";
    dropdown.style.left = rect.left + "px";
  }

  function removeDropdownNow() {
    window.removeEventListener("resize", positionDropdown);
    window.removeEventListener("scroll", positionDropdown, true);
    document.removeEventListener("mousedown", onDocMouseDown, true);
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
    anchorBtnRef = null;
  }

  function closeDropdown() {
    window.removeEventListener("resize", positionDropdown);
    window.removeEventListener("scroll", positionDropdown, true);
    document.removeEventListener("mousedown", onDocMouseDown, true);
    if (dropdown) {
      const d = dropdown;
      dropdown = null; // stop tracking so a reopen won't overlap
      anchorBtnRef = null;
      d.classList.remove("sa-bfe-dropdown--visible");
      setTimeout(() => { if (d.parentNode) d.remove(); }, 140);
    }
  }

  function openDropdown(anchorBtn) {
    removeDropdownNow();

    dropdown = document.createElement("div");
    dropdown.className = "sa-bfe-dropdown";
    anchorBtnRef = anchorBtn;

    dropdown.style.position = "fixed";
    dropdown.style.zIndex = "10000";

    function renderList(all) {
      const oldToggle = dropdown.querySelector(".sa-bfe-toggle");
      if (oldToggle) oldToggle.remove();
      const oldList = dropdown.querySelector(".sa-bfe-list");
      if (oldList) oldList.remove();
      const oldDivider = dropdown.querySelector(".sa-bfe-divider");
      if (oldDivider) oldDivider.remove();

      const toggle = document.createElement("button");
      toggle.className = "sa-bfe-item sa-bfe-toggle";
      const items = all ? collectProccodes(true) : collectProccodes(false);
      const toggleLabel = document.createElement("span");
      toggleLabel.className = "sa-bfe-item-label";
      toggleLabel.textContent = all ? msg("back") : msg("viewAll");
      toggle.appendChild(toggleLabel);
      toggle.addEventListener("click", () => renderList(!all));

      const listEl = document.createElement("div");
      listEl.className = "sa-bfe-list";
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sa-bfe-empty";
        empty.textContent = all ? msg("noBlocks") : msg("noBlocksCurrent");
        listEl.appendChild(empty);
      } else {
        for (const item of items) {
          const row = document.createElement("button");
          row.className = "sa-bfe-item";
          const label = document.createElement("span");
          label.className = "sa-bfe-item-label";
          label.textContent = item.proccode;
          row.appendChild(label);
          if (all) {
            const sub = document.createElement("span");
            sub.className = "sa-bfe-item-sub";
            sub.textContent = item.targetName;
            row.appendChild(sub);
          }
          row.addEventListener("click", () => {
            applyMutation(item);
            closeDropdown();
          });
          listEl.appendChild(row);
        }
      }
      dropdown.appendChild(listEl);
      // Straight divider line between the block names and the toggle button,
      // rendered as its own element (not a border) so it stays flat even
      // though the toggle button itself is rounded.
      if (items.length > 0) {
        const divider = document.createElement("div");
        divider.className = "sa-bfe-divider";
        dropdown.appendChild(divider);
      }
      dropdown.appendChild(toggle);
    }

    renderList(false);
    document.body.appendChild(dropdown);

    // Keep the dropdown glued under the button as the window resizes or any
    // container scrolls (the modal itself can move when its height changes).
    positionDropdown();
    window.addEventListener("resize", positionDropdown);
    window.addEventListener("scroll", positionDropdown, true);

    // Fade/slide in on the next frame.
    requestAnimationFrame(() => {
      if (dropdown) dropdown.classList.add("sa-bfe-dropdown--visible");
    });

    // Defer so the same click that opened the dropdown doesn't immediately close it.
    setTimeout(() => document.addEventListener("mousedown", onDocMouseDown, true), 0);
  }

  function onButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (dropdown) {
      closeDropdown();
    } else {
      openDropdown(e.currentTarget);
    }
  }

  function injectButton(buttonRow) {
    if (buttonRow.querySelector(".sa-bfe-button")) return;
    const btn = document.createElement("button");
    btn.className = "sa-bfe-button";
    btn.textContent = msg("title");
    btn.style.float = "left";
    buttonRow.insertBefore(btn, buttonRow.firstChild);
    btn.addEventListener("click", onButtonClick);
  }

  const observer = new MutationObserver(() => {
    const row = document.querySelector(BUTTON_ROW_SELECTOR);
    if (row) {
      injectButton(row);
    } else if (dropdown) {
      closeDropdown();
    }
  });
  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    const existing = document.querySelector(BUTTON_ROW_SELECTOR);
    if (existing) injectButton(existing);
  }

  function cleanup() {
    observer.disconnect();
    removeDropdownNow();
    const injected = document.querySelector(".sa-bfe-button");
    if (injected) injected.remove();
  }

  // The framework unloads the userstyle on disable but does NOT remove DOM we
  // injected, so the button would linger (unstyled). Clean it up here and
  // re-inject on re-enable.
  addon.self.addEventListener("disabled", cleanup);
  addon.self.addEventListener("reenabled", start);

  start();
}
