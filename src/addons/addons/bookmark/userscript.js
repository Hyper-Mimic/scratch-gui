import icon from "!../../../lib/tw-recolor/build!./bookmark.svg";

export default async ({ addon, msg, console }) => {
  const Blockly = await addon.tab.traps.getBlockly();
  const vm = addon.tab.traps.vm;

  // 语言切换后更新已渲染的菜单项文本（框架在 SELECT_LOCALE 时触发 reenabled）
  const updateLocalizedText = () => {
    document.querySelectorAll('.sa-bookmark-menu-item .sa-bookmark-menu-item-text').forEach((el) => {
      el.textContent = msg("bookmark");
    });
  };
  addon.self.addEventListener("reenabled", updateLocalizedText);

  const BOOKMARK_MAGIC = " // _bookmark_";
  const BOOKMARK_COMMENT_HEADER = msg("comment-header");

  // Get current editing target
  const getEditingTarget = () => {
    return vm.runtime.getEditingTarget();
  };

  // Find the bookmark comment in the current target
  const findBookmarkComment = () => {
    const target = getEditingTarget();
    if (!target || !target.comments) return null;

    const comments = Object.values(target.comments);
    for (const comment of comments) {
      if (comment.text.includes(BOOKMARK_MAGIC)) {
        return comment;
      }
    }
    return null;
  };

  // Parse bookmark data from comment
  const parseBookmarkComment = () => {
    const comment = findBookmarkComment();
    if (!comment) return [];

    const lineWithMagic = comment.text.split("\n").find((i) => i.endsWith(BOOKMARK_MAGIC));
    if (!lineWithMagic) {
      console.warn("Bookmark comment does not contain valid line");
      return [];
    }

    const jsonText = lineWithMagic.substr(0, lineWithMagic.length - BOOKMARK_MAGIC.length);
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      console.warn("Bookmark comment has invalid JSON", e);
      return [];
    }
  };

  // Save bookmark data to comment
  const saveBookmarkComment = (bookmarks) => {
    const text = `${BOOKMARK_COMMENT_HEADER}\n${JSON.stringify(bookmarks)}${BOOKMARK_MAGIC}`;
    const existingComment = findBookmarkComment();

    if (existingComment) {
      existingComment.text = text;
    } else {
      const target = getEditingTarget();
      if (!target) return;

      target.createComment(
        Math.random() + "",
        null,
        text,
        50,
        50,
        350,
        150,
        false
      );
    }

    // Notify project changed
    vm.runtime.emitProjectChanged();
    if (vm.editingTarget === vm.runtime.getTargetForStage()) {
      vm.emitWorkspaceUpdate();
    }
  };

  // Get the main workspace (similar to Utils.getWorkspace)
  const getWorkspace = () => {
    const currentWorkspace = Blockly.getMainWorkspace();
    if (currentWorkspace.getToolbox()) {
      return currentWorkspace;
    }
    return Blockly.getMainWorkspace();
  };

  // Get current workspace state
  const getWorkspaceState = () => {
    const workspace = getWorkspace();
    const s = workspace.getMetrics();
    return {
      viewLeft: s.viewLeft,
      viewTop: s.viewTop,
      scale: workspace.scale,
      timestamp: Date.now()
    };
  };

  // Restore workspace state (similar to NavigationHistory.goBack)
  const restoreWorkspaceState = (state) => {
    const workspace = getWorkspace();

    // First set the scale
    workspace.setScale(state.scale);

    // Use requestAnimationFrame to ensure the workspace is updated after scale change
    requestAnimationFrame(() => {
      const s = workspace.getMetrics();

      // Then restore the scroll position
      // Calculate scroll position based on current contentLeft/contentTop
      const sx = state.viewLeft - s.contentLeft;
      const sy = state.viewTop - s.contentTop;

      workspace.scrollbar.set(sx, sy);

      // Hide Blockly floating elements
      Blockly.hideChaff();
    });
  };

  // Create bookmark modal
  const createBookmarkModal = () => {
    const { backdrop, container, content, closeButton, remove } = addon.tab.createModal(msg("bookmark-title"), {
      isOpen: true,
      useEditorClasses: true
    });
    container.classList.add("sa-bookmark-modal");
    content.classList.add("sa-bookmark-modal-content");
    
    // Check theme after a small delay to ensure DOM is ready
    setTimeout(() => {
      // The theme is handled by CSS variables, no need for JavaScript detection
      console.log('Bookmark plugin - Modal opened');
    }, 10);

    // Create bookmark list
    const bookmarkList = document.createElement("div");
    bookmarkList.className = "sa-bookmark-list";

    let bookmarks = parseBookmarkComment();

    const renderBookmarks = () => {
      bookmarkList.innerHTML = "";
      bookmarks = parseBookmarkComment();

      if (bookmarks.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "sa-bookmark-empty";
        emptyMessage.textContent = msg("no-bookmarks");
        bookmarkList.appendChild(emptyMessage);
        return;
      }

      bookmarks.forEach((bookmark, index) => {
        const bookmarkItem = document.createElement("div");
        bookmarkItem.className = "sa-bookmark-item";

        const bookmarkInfo = document.createElement("div");
        bookmarkInfo.className = "sa-bookmark-info";

        const bookmarkName = document.createElement("span");
        bookmarkName.className = "sa-bookmark-name";
        bookmarkName.textContent = bookmark.name || msg("bookmark-default-name", { index: index + 1 });
        bookmarkName.title = msg("edit-bookmark-hint");

        // Make bookmark name editable
        bookmarkName.addEventListener("click", () => {
          const input = document.createElement("input");
          input.type = "text";
          input.value = bookmark.name || msg("bookmark-default-name", { index: index + 1 });
          input.className = "sa-bookmark-name-input";
          input.classList.add(addon.tab.scratchClass("input_input-form"));

          const saveEdit = () => {
            const newName = input.value.trim();
            bookmark.name = newName || null;
            saveBookmarkComment(bookmarks);
            bookmarkName.textContent = newName || msg("bookmark-default-name", { index: index + 1 });
          };

          input.addEventListener("blur", saveEdit);
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              saveEdit();
            } else if (e.key === "Escape") {
              bookmarkName.textContent = bookmark.name || msg("bookmark-default-name", { index: index + 1 });
            }
          });

          bookmarkName.innerHTML = "";
          bookmarkName.appendChild(input);
          input.focus();
          input.select();
        });

        const bookmarkTime = document.createElement("span");
        bookmarkTime.className = "sa-bookmark-time";
        bookmarkTime.textContent = new Date(bookmark.timestamp).toLocaleString();

        bookmarkInfo.appendChild(bookmarkName);
        bookmarkInfo.appendChild(bookmarkTime);

        const bookmarkActions = document.createElement("div");
        bookmarkActions.className = "sa-bookmark-actions";

        const jumpButton = document.createElement("button");
        jumpButton.className = "sa-bookmark-action-button";
        jumpButton.textContent = msg("jump");
        jumpButton.addEventListener("click", () => {
          restoreWorkspaceState(bookmark.state);
          remove();
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "sa-bookmark-action-button sa-bookmark-delete";
        deleteButton.textContent = msg("delete");
        deleteButton.addEventListener("click", () => {
          bookmarks.splice(index, 1);
          saveBookmarkComment(bookmarks);
          renderBookmarks();
        });

        bookmarkActions.appendChild(jumpButton);
        bookmarkActions.appendChild(deleteButton);

        bookmarkItem.appendChild(bookmarkInfo);
        bookmarkItem.appendChild(bookmarkActions);
        bookmarkList.appendChild(bookmarkItem);
      });
    };

    renderBookmarks();

    // Add bookmark form
    const addBookmarkForm = document.createElement("div");
    addBookmarkForm.className = "sa-bookmark-add-form";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = msg("bookmark-name");

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = msg("bookmark-name-placeholder");
    nameInput.className = addon.tab.scratchClass("input_input-form");

    const addButton = document.createElement("button");
    addButton.textContent = msg("add-bookmark");
    addButton.className = addon.tab.scratchClass("prompt_ok-button");

    addButton.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const newBookmark = {
        name: name || null,
        state: getWorkspaceState(),
        timestamp: Date.now()
      };
      bookmarks.push(newBookmark);
      saveBookmarkComment(bookmarks);
      nameInput.value = "";
      renderBookmarks();
    });

    addBookmarkForm.appendChild(nameLabel);
    addBookmarkForm.appendChild(nameInput);
    addBookmarkForm.appendChild(addButton);

    content.appendChild(bookmarkList);
    content.appendChild(addBookmarkForm);

    // Close handlers
    backdrop.addEventListener("click", () => remove());
    closeButton.addEventListener("click", () => remove());

    // Close on Escape
    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        remove();
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
  };

  // ===== 在 Edit 菜单中添加 Bookmark 选项 =====
  while (true) {
    try {
      // 通过 id="edit" 查找 Edit 菜单的 ul
      const editMenu = document.getElementById('edit');
      
      if (editMenu) {
        // 检查是否已经添加了书签选项
        if (!editMenu.querySelector('.sa-bookmark-menu-item')) {

          // 获取最后一个 li 作为样式参考
          const existingItems = editMenu.querySelectorAll('li');
          let lastItem = null;
          if (existingItems.length > 0) {
            lastItem = existingItems[existingItems.length - 1];
          }

          // 创建书签菜单项 (li)
          const menuItem = document.createElement('li');
          menuItem.className = 'sa-bookmark-menu-item';
          
          // 复制现有菜单项的样式
          if (lastItem) {
            menuItem.className = lastItem.className + ' sa-bookmark-menu-item';
            const computedStyle = window.getComputedStyle(lastItem);
            menuItem.style.cssText = `
              display: ${computedStyle.display};
              align-items: ${computedStyle.alignItems};
              padding: ${computedStyle.padding};
              cursor: pointer;
              font-size: ${computedStyle.fontSize};
              color: ${computedStyle.color};
              min-height: ${computedStyle.minHeight};
              transition: background 0.1s ease;
            `;
          } else {
            menuItem.style.cssText = `
              display: flex;
              align-items: center;
              padding: 4px 16px;
              cursor: pointer;
              font-size: 0.85rem;
              color: #575e75;
              min-height: 36px;
              transition: background 0.1s ease;
            `;
          }

          // 创建内部 div
          const innerDiv = document.createElement('div');
          innerDiv.style.cssText = `
            display: flex;
            align-items: center;
            gap: 0.5rem;
            width: 100%;
          `;

          // 添加文本
          const textSpan = document.createElement('span');
          textSpan.className = 'sa-bookmark-menu-item-text';
          textSpan.textContent = msg("bookmark");

          // 组装
          innerDiv.appendChild(textSpan);
          menuItem.appendChild(innerDiv);

          // 悬停效果
          menuItem.addEventListener('mouseenter', () => {
            menuItem.style.background = 'var(--ui-black-transparent)';
            menuItem.style.color = 'white';
            const img = menuItem.querySelector('img');
            if (img) {
              img.style.filter = 'invert(1) brightness(2)';
            }
          });
          menuItem.addEventListener('mouseleave', () => {
            menuItem.style.background = '';
            menuItem.style.color = '';
            const img = menuItem.querySelector('img');
            if (img) {
              img.style.filter = 'invert(1)';
            }
          });

          // 点击事件 - 使用 Redux 关闭菜单
          menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('[Bookmark] 点击书签菜单项');
            
            // 通过 Redux 关闭 Edit 菜单
            try {
              if (addon && addon.tab && addon.tab.redux) {
                addon.tab.redux.dispatch({
                  type: 'scratch-gui/menus/CLOSE_MENU',
                  menu: 'editMenu'
                });
                addon.tab.redux.dispatch({
                  type: 'scratch-gui/menus/CLOSE_EDIT_MENU'
                });
              }
            } catch (err) {
              console.error('[Bookmark] Redux error:', err);
            }
            
            // 打开书签弹窗
            setTimeout(() => {
              createBookmarkModal();
            }, 100);
          });

          // 添加到 Edit 菜单的 ul 末尾
          editMenu.appendChild(menuItem);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (e) {
      console.warn('[Bookmark] 添加菜单项失败:', e);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
};