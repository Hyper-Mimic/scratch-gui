import toolboxIcon from '!url-loader?{"esModule":false}!./bookmark.svg';
import { registerAddonModal, unregisterAddonModal } from '../../../lib/addon-modal-guard.js';
// Only the flash helper is shared with find-bar; the scroll animation here is
// local (it must animate the zoom too, which find-bar's Utils does not).
import BlockFlasher from '../find-bar/blockly/BlockFlasher.js';

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
  // Margin between the pinned block and the top-left of the viewport.
  const BLOCK_MARGIN = 32;
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

  // Zoom and scroll are driven by ONE progress value over ONE duration: they
  // start on the same frame, interpolate with the same easing and land together.
  // setScale() must run on every frame (not just at the end): it refreshes the
  // scrollbar ratio, the canvas transform, the grid and the flyout.
  const animateToState = (workspace, target, onComplete) => {
    cancelScroll();
    Blockly.hideChaff();

    const from = workspace.getMetrics();
    const fromLeft = from.viewLeft;
    const fromTop = from.viewTop;
    const fromScale = workspace.scale;
    // Clamp up front: an out-of-range target would be clamped by setScale()
    // partway through the animation, making the zoom finish before the scroll.
    const zoomOptions = (workspace.options && workspace.options.zoomOptions) || {};
    const minScale = zoomOptions.minScale || 0;
    const maxScale = zoomOptions.maxScale || Infinity;
    const rawScale = Number.isFinite(target.scale) && target.scale > 0 ? target.scale : fromScale;
    const targetScale = Math.min(maxScale, Math.max(minScale, rawScale));
    const scaleRatio = targetScale / fromScale;
    const zoomDistance = Math.abs(Math.log2(scaleRatio)) * ZOOM_PX_PER_OCTAVE;
    // Zoom only contributes to the SHARED duration; it never gets its own timeline.
    const distance = Math.hypot(
      target.viewLeft - fromLeft,
      target.viewTop - fromTop,
      zoomDistance
    );
    const duration = Math.min(
      SCROLL_MAX_MS,
      Math.max(SCROLL_MIN_MS, distance * SCROLL_MS_PER_PX)
    );
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // No zoom change -> never touch setScale(). It forces a scrollbar resize
    // (and a full metrics pass) every frame, which would only slow the move down.
    const zooming = Math.abs(targetScale - fromScale) > 0.0001;

    // The only place either value is advanced. Both use the same linear form
    // `from + (target - from) * progress` on the same progress, so neither can
    // perceptibly finish earlier than the other.
    const apply = (progress) => {
      if (zooming) {
        workspace.setScale(fromScale + (targetScale - fromScale) * progress);
      }
      setViewport(
        workspace,
        fromLeft + (target.viewLeft - fromLeft) * progress,
        fromTop + (target.viewTop - fromTop) * progress
      );
    };

    if (reducedMotion || distance < 1) {
      apply(1);
      if (onComplete) onComplete();
      return;
    }

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
      if (t < 1) {
        scrollFrame = requestAnimationFrame(step);
      } else {
        scrollFrame = null;
        if (onComplete) onComplete();
      }
    };

    scrollFrame = requestAnimationFrame(step);
  };

  // A bookmark pinned to a block resolves its destination from the block's CURRENT
  // position, not from the saved viewport. Everything else stays compatible with
  // old data: no blockId -> saved viewLeft/viewTop; deleted block -> same fallback.
  const resolveBookmarkTarget = (bookmark) => {
    const workspace = getWorkspace();
    const state = bookmark.state || {};
    const metrics = workspace.getMetrics();
    const targetScale =
      Number.isFinite(state.scale) && state.scale > 0 ? state.scale : workspace.scale;
    const target = {
      viewLeft: Number.isFinite(state.viewLeft) ? state.viewLeft : metrics.viewLeft,
      viewTop: Number.isFinite(state.viewTop) ? state.viewTop : metrics.viewTop,
      scale: targetScale,
      block: null
    };
    if (!bookmark.blockId) return target;

    const block = workspace.getBlockById(bookmark.blockId);
    if (!block) return target;

    const root = typeof block.getRootBlock === "function" ? block.getRootBlock() : block;
    // Keep the block clear of the palette flyout when it is open.
    let flyoutWidth = 0;
    try {
      const flyout = workspace.getFlyout && workspace.getFlyout();
      if (flyout && typeof flyout.isVisible === "function" && flyout.isVisible()) {
        flyoutWidth = flyout.getWidth() || 0;
      }
    } catch (e) {
      // Some Blockly forks have no flyout; the margin alone is still fine.
    }
    target.viewLeft =
      root.getRelativeToSurfaceXY().x * targetScale - BLOCK_MARGIN - flyoutWidth;
    target.viewTop = block.getRelativeToSurfaceXY().y * targetScale - BLOCK_MARGIN;
    target.block = block;
    return target;
  };

  // Restore workspace state. The zoom + scroll only start once the modal has
  // finished closing: its 170ms fade-out overlaps the first (fastest) part of
  // easeOutCubic, which otherwise happens behind the overlay and makes the motion
  // look like it begins near the destination rather than at the current view.
  const restoreWorkspaceState = (bookmark, startWhenReady) => {
    const workspace = getWorkspace();
    const target = resolveBookmarkTarget(bookmark);
    startWhenReady(() =>
      animateToState(workspace, target, () => {
        if (!target.block) return;
        // Off-screen blocks are re-attached by the intersection observer a frame
        // or two after the view settles; flash only once it can actually be seen.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try {
            BlockFlasher.flash(target.block);
          } catch (e) {
            // A disposed block must never break the jump.
          }
        }));
      })
    );
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

        const emptyText = document.createElement("span");
        emptyText.textContent = msg("no-bookmarks");
        emptyMessage.appendChild(emptyText);

        // The "right-click a block" hint belongs to the empty state: once there
        // is at least one bookmark it is no longer needed at the bottom of the form.
        // A plain span: the empty state styles this second line by position, so
        // the hint needs no class of its own.
        const blockHint = document.createElement("span");
        blockHint.textContent = msg("block-bookmark-hint");
        emptyMessage.appendChild(blockHint);

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

        // Make bookmark name editable. The editing class swaps the span's padding
        // for the input's so both states keep the exact same box height (see
        // userstyle.css); it also marks "currently editing" so a click inside
        // the input, which bubbles up to this span, does not rebuild the field.
        bookmarkName.addEventListener("click", () => {
          if (bookmarkName.classList.contains("sa-bookmark-name-editing")) return;
          // Long names wrap to several lines; a single-line input cannot match
          // that height on its own, so freeze the height we measured at rest.
          const restingHeight = bookmarkName.getBoundingClientRect().height;
          bookmarkName.classList.add("sa-bookmark-name-editing");
          bookmarkName.style.height = `${restingHeight}px`;

          const input = document.createElement("input");
          input.type = "text";
          input.value = bookmark.name || msg("bookmark-default-name", { index: index + 1 });
          input.className = "sa-bookmark-name-input";
          input.classList.add(addon.tab.scratchClass("input_input-form"));

          const leaveEdit = () => {
            bookmarkName.classList.remove("sa-bookmark-name-editing");
            bookmarkName.style.height = "";
          };

          const saveEdit = () => {
            // Escape already left edit mode; a blur fired while the input is
            // being removed must not write the discarded value back.
            if (!bookmarkName.classList.contains("sa-bookmark-name-editing")) return;
            const newName = input.value.trim();
            bookmark.name = newName || null;
            saveBookmarkComment(bookmarks);
            // Leave first: removing the input can fire a synchronous blur, and
            // the guard above must already be in effect when that happens.
            leaveEdit();
            bookmarkName.textContent = newName || msg("bookmark-default-name", { index: index + 1 });
          };

          input.addEventListener("blur", saveEdit);
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              saveEdit();
            } else if (e.key === "Escape") {
              leaveEdit();
              bookmarkName.textContent = bookmark.name || msg("bookmark-default-name", { index: index + 1 });
            }
          });

          bookmarkName.innerHTML = "";
          bookmarkName.appendChild(input);
          input.focus();
          input.select();
        });

        const metaRow = document.createElement("div");
        metaRow.className = "sa-bookmark-meta";
        const bookmarkTime = document.createElement("span");
        bookmarkTime.className = "sa-bookmark-time";
        bookmarkTime.textContent = new Date(bookmark.timestamp).toLocaleString();
        metaRow.appendChild(bookmarkTime);

        if (bookmark.blockId) {
          const missing = !getWorkspace().getBlockById(bookmark.blockId);
          const blockTag = document.createElement("span");
          blockTag.className = `sa-bookmark-block-tag${missing ? " missing" : ""}`;
          blockTag.textContent = missing ? msg("block-missing") : msg("follow-block");
          metaRow.appendChild(blockTag);
        }

        bookmarkInfo.appendChild(bookmarkName);
        bookmarkInfo.appendChild(metaRow);

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
          restoreWorkspaceState(bookmark, afterModalClosed);
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

  // Pin a bookmark to a specific block. It stores the block id; where the block
  // actually is gets resolved at jump time (see resolveBookmarkTarget), so moving
  // or re-nesting the block never invalidates the bookmark.
  const addBlockBookmark = (block) => {
    const bookmarks = parseBookmarkComment();
    bookmarks.push({
      name: null,
      state: getWorkspaceState(),
      blockId: block.id,
      timestamp: Date.now()
    });
    saveBookmarkComment(bookmarks);
    // Show the new entry immediately so it can be renamed.
    createBookmarkModal();
  };

  addon.tab.createBlockContextMenu(
    (items, block) => {
      if (addon.self.disabled || !block || !block.id) return items;
      // Flyout blocks live in their own workspace and have no lasting id here.
      if (block.workspace !== getWorkspace()) return items;
      items.push({
        enabled: true,
        text: msg("add-block-bookmark"),
        callback: () => addBlockBookmark(block),
        separator: true
      });
      return items;
    },
    { blocks: true }
  );
};