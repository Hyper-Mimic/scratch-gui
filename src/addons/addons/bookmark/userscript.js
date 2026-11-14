import toolboxIcon from '!url-loader?{"esModule":false}!./bookmark.svg';
import { registerAddonModal, unregisterAddonModal } from '../../../lib/addon-modal-guard.js';

export default async ({ addon, msg, console }) => {
  const Blockly = await addon.tab.traps.getBlockly();
  const vm = addon.tab.traps.vm;

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

  // Same easing/duration as find-bar's smooth scroll. A one-octave zoom counts as
  // 400px of scroll distance so a pure zoom still gets a sensible duration.
  const SCROLL_MIN_MS = 180;
  const SCROLL_MAX_MS = 600;
  const SCROLL_MS_PER_PX = 0.6;
  const ZOOM_PX_PER_OCTAVE = 400;
  let scrollFrame = null;

  const cancelScroll = () => {
    if (scrollFrame !== null) {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
    }
  };

  // Interpolate the ABSOLUTE viewport position (viewLeft/viewTop) and derive the
  // scrollbar value from live metrics on every frame.
  // `scrollbar.set(x, y)` expects x = viewLeft - contentLeft, and contentLeft/Top
  // plus the scrollbar ratio all change while the zoom is animating; a scroll value
  // cached once at the start would map to a different viewport on later frames.
  const setViewport = (workspace, left, top) => {
    if (!workspace.scrollbar) return;
    const s = workspace.getMetrics();
    workspace.scrollbar.set(left - s.contentLeft, top - s.contentTop);
  };

  // Zoom and scroll share one eased progress value, so the view lands on both at
  // the same time. setScale() must run on every frame (not just at the end): it
  // refreshes the scrollbar ratio, the canvas transform, the grid and the flyout.
  const animateToState = (workspace, target) => {
    cancelScroll();
    Blockly.hideChaff();

    const from = workspace.getMetrics();
    const fromLeft = from.viewLeft;
    const fromTop = from.viewTop;
    const fromScale = workspace.scale;
    const targetScale = Number.isFinite(target.scale) && target.scale > 0 ? target.scale : fromScale;
    // Zoom is perceived multiplicatively, so interpolate geometrically.
    const scaleRatio = targetScale / fromScale;
    const zoomDistance = Math.abs(Math.log2(scaleRatio)) * ZOOM_PX_PER_OCTAVE;
    const distance = Math.hypot(
      target.viewLeft - fromLeft,
      target.viewTop - fromTop,
      zoomDistance
    );
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const apply = (eased) => {
      const scale = fromScale * Math.pow(scaleRatio, eased);
      workspace.setScale(scale);
      setViewport(
        workspace,
        fromLeft + (target.viewLeft - fromLeft) * eased,
        fromTop + (target.viewTop - fromTop) * eased
      );
    };

    if (reducedMotion || distance < 1) {
      apply(1);
      return;
    }

    const duration = Math.min(
      SCROLL_MAX_MS,
      Math.max(SCROLL_MIN_MS, distance * SCROLL_MS_PER_PX)
    );
    const start = performance.now();
    let lastX = null;
    let lastY = null;
    let lastScale = null;

    const step = (now) => {
      // The user scrolled/zoomed while we were animating: stop instead of fighting them.
      if (
        lastX !== null &&
        (Math.abs(workspace.scrollX - lastX) > 0.5 ||
          Math.abs(workspace.scrollY - lastY) > 0.5 ||
          Math.abs(workspace.scale - lastScale) > 0.001)
      ) {
        scrollFrame = null;
        return;
      }

      // Clamp both ends: rAF timestamps can predate performance.now() when the
      // animation is scheduled from inside another frame, giving a negative t
      // (=> a backwards lurch on the first frame).
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      apply(1 - Math.pow(1 - t, 3));
      lastX = workspace.scrollX;
      lastY = workspace.scrollY;
      lastScale = workspace.scale;
      scrollFrame = t < 1 ? requestAnimationFrame(step) : null;
    };

    scrollFrame = requestAnimationFrame(step);
  };

  // Restore workspace state. The zoom + scroll only start once the modal has
  // finished closing: its 170ms fade-out overlaps the first (fastest) part of
  // easeOutCubic, which otherwise happens behind the overlay and makes the motion
  // look like it begins near the destination rather than at the current view.
  const restoreWorkspaceState = (state, startWhenReady) => {
    const workspace = getWorkspace();
    startWhenReady(() => animateToState(workspace, state));
  };

  // Create bookmark modal
  // Track the currently-open modal so a locale switch (which fires `reenabled`) can
  // force-close it. The modal is native DOM (built with `msg()`), so switching locale
  // would leave stale strings; closing is the simplest correct behaviour.
  let currentRemove = null;
  addon.self.addEventListener("reenabled", () => {
    if (currentRemove) {
      const remove = currentRemove;
      currentRemove = null;
      unregisterAddonModal("bookmark", remove);
      remove();
    }
    // 切语言后刷新工具箱按钮文案：registry 按 id 去重，重注册即触发 toolbox 浮层
    // _refresh 更新 title/aria-label，高级设置的「排列顺序」面板也随 notify 重绘。
    registerToolboxButton();
  });

  const createBookmarkModal = () => {
    // Self-guard: a second open closes the previous one instead of stacking.
    if (currentRemove) {
      const remove = currentRemove;
      currentRemove = null;
      unregisterAddonModal("bookmark", remove);
      remove();
    }
    const { backdrop, container, content, closeButton, remove } = addon.tab.createModal(msg("bookmark-title"), {
      isOpen: true,
      useEditorClasses: true
    });
    currentRemove = remove;
    registerAddonModal("bookmark", remove);
    container.classList.add("sa-bookmark-modal");
    content.classList.add("sa-bookmark-modal-content");

    // createModal().remove() plays a 170ms fade-out before detaching the overlay.
    // Wait for it (with a deadline, in case a window manager keeps the node), then
    // start the scroll from a timer so its start timestamp precedes the next frame.
    const afterModalClosed = (fn) => {
      const deadline = performance.now() + 400;
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        setTimeout(fn, 0);
      };
      const check = () => {
        if (
          !backdrop.isConnected ||
          backdrop.style.display === "none" ||
          performance.now() > deadline
        ) {
          start();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    };
    
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
          // Close first, then wait for the overlay to clear before animating.
          if (currentRemove === remove) {
            unregisterAddonModal("bookmark", remove);
            currentRemove = null;
          }
          remove();
          restoreWorkspaceState(bookmark.state, afterModalClosed);
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

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = msg("bookmark-name-placeholder");
    nameInput.className = addon.tab.scratchClass("input_input-form");

    const addButton = document.createElement("button");
    addButton.textContent = msg("add-bookmark");
    addButton.className = addon.tab.scratchClass("prompt_ok-button");

    const addBookmark = () => {
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
      nameInput.focus(); // keep focus in the input for rapid consecutive adds
    };

    addButton.addEventListener("click", addBookmark);

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); // no <form>, but defend against default anyway
        addBookmark();
      }
    });

    addBookmarkForm.appendChild(nameInput);
    addBookmarkForm.appendChild(addButton);

    content.appendChild(bookmarkList);
    content.appendChild(addBookmarkForm);

    // Close handlers
    const close = () => {
      unregisterAddonModal("bookmark", remove);
      currentRemove = null;
      remove();
    };
    backdrop.addEventListener("click", close);
    closeButton.addEventListener("click", close);

    // Close on Escape
    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
  };

  // ===== 在工具箱中注册书签按钮 =====
  // 图标是 url-loader 内联出来的 base64 data URI（画的是近黑色，工具箱会按主题反色）。
  // 抽成函数：切语言时框架派发 `reenabled`，需重新注册以刷新 label（registry 按 id 去重，
  // 重注册会触发 toolbox 浮层 _refresh 刷新 title/aria-label，设置面板顺序也随之刷新）。
  function registerToolboxButton() {
    addon.tab.addWorkspaceToolboxButton({
      id: 'bookmark',
      label: msg("bookmark"),
      icon: toolboxIcon,
      action: () => createBookmarkModal()
    });
  }
  registerToolboxButton();
};