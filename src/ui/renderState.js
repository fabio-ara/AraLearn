const TRACKED_SCROLL_SELECTORS = [
  ".screen-content",
  ".editor-sheet",
  ".overlay-shell",
  ".overlay-panel",
  ".editor-overlay",
  ".assist-config-overlay",
  ".editor-step-strip",
  ".workbench-editor-panel",
  ".assist-prompt",
  ".card-sheet-content",
  ".dependency-strip",
  ".dependency-chip-row"
];

function getPageScroller() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.scrollingElement || document.documentElement || document.body || null;
}

function getElementPath(root, node) {
  if (!root || !node || node === root) {
    return [];
  }

  const path = [];
  let current = node;

  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) {
      return null;
    }

    path.push(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }

  if (current !== root) {
    return null;
  }

  return path.reverse();
}

function getElementByPath(root, path) {
  if (!root || !Array.isArray(path)) {
    return null;
  }

  let current = root;
  for (const childIndex of path) {
    if (!current.children || childIndex < 0 || childIndex >= current.children.length) {
      return null;
    }
    current = current.children[childIndex];
  }

  return current;
}

function contentSelectionOffset(root, node, offset) {
  if (!root?.contains(node) && root !== node) return null;
  try {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function captureContentSelection(active) {
  if (!active.matches("[contenteditable]:not([contenteditable='false'])")) return null;
  const selection = active.ownerDocument.getSelection?.();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if ((!active.contains(range.startContainer) && active !== range.startContainer) ||
      (!active.contains(range.endContainer) && active !== range.endContainer)) return null;
  return {
    start: contentSelectionOffset(active, range.startContainer, range.startOffset),
    end: contentSelectionOffset(active, range.endContainer, range.endOffset)
  };
}

function contentSelectionBoundary(root, requestedOffset) {
  const offset = Math.max(0, Number(requestedOffset) || 0);
  const walker = root.ownerDocument.createTreeWalker(
    root,
    globalThis.NodeFilter?.SHOW_TEXT ?? 4
  );
  let remaining = offset;
  let lastText = null;
  let node = walker.nextNode();
  while (node) {
    lastText = node;
    const size = String(node.data || "").length;
    if (remaining <= size) return { node, offset: remaining };
    remaining -= size;
    node = walker.nextNode();
  }
  return lastText
    ? { node: lastText, offset: String(lastText.data || "").length }
    : { node: root, offset: 0 };
}

function restoreContentSelection(target, snapshot) {
  if (!snapshot || snapshot.start === null || snapshot.end === null) return;
  try {
    const start = contentSelectionBoundary(target, snapshot.start);
    const end = contentSelectionBoundary(target, snapshot.end);
    const range = target.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = target.ownerDocument.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    // Focus restoration is still useful when the edited markup changed shape.
  }
}

function captureFocusedElement(root) {
  if (typeof document === "undefined" || !root) {
    return null;
  }

  const active = document.activeElement;
  if (!active || !root.contains(active)) {
    return null;
  }

  if (!active.matches(
    "input, textarea, select, button, [tabindex], [contenteditable]:not([contenteditable='false'])"
  )) {
    return null;
  }

  return {
    path: getElementPath(root, active),
    selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
    contentSelection: captureContentSelection(active),
    scrollTop: typeof active.scrollTop === "number" ? active.scrollTop : 0,
    scrollLeft: typeof active.scrollLeft === "number" ? active.scrollLeft : 0
  };
}

function restoreFocusedElement(root, snapshot) {
  if (!root || !snapshot) {
    return;
  }

  const target = getElementByPath(root, snapshot.path);
  if (!target || typeof target.focus !== "function") {
    return;
  }

  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }

  if (
    typeof snapshot.selectionStart === "number" &&
    typeof snapshot.selectionEnd === "number" &&
    typeof target.setSelectionRange === "function"
  ) {
    target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  } else {
    restoreContentSelection(target, snapshot.contentSelection);
  }

  if (typeof snapshot.scrollTop === "number") {
    target.scrollTop = snapshot.scrollTop;
  }
  if (typeof snapshot.scrollLeft === "number") {
    target.scrollLeft = snapshot.scrollLeft;
  }
}

export function captureRenderState(
  root,
  { trackedScrollSelectors = TRACKED_SCROLL_SELECTORS, includePageScroll = true, includeFocus = true } = {}
) {
  if (!root) {
    return { scrollables: [], pageScroll: null, focused: null };
  }

  const scrollables = [];
  (Array.isArray(trackedScrollSelectors) ? trackedScrollSelectors : TRACKED_SCROLL_SELECTORS).forEach((selector) => {
    root.querySelectorAll(selector).forEach((node, index) => {
      scrollables.push({
        selector,
        index,
        top: node.scrollTop,
        left: node.scrollLeft
      });
    });
  });

  const pageScroller = getPageScroller();
  return {
    scrollables,
    pageScroll: includePageScroll && pageScroller
      ? {
          top: pageScroller.scrollTop,
          left: pageScroller.scrollLeft
        }
      : null,
    focused: includeFocus ? captureFocusedElement(root) : null
  };
}

export function restoreRenderState(root, snapshot, { restorePageScroll = true, restoreFocus = true } = {}) {
  if (!root || !snapshot) {
    return;
  }

  for (const item of snapshot.scrollables || []) {
    const target = root.querySelectorAll(item.selector)[item.index];
    if (!target) {
      continue;
    }

    target.scrollTop = item.top;
    target.scrollLeft = item.left;
  }

  if (restorePageScroll && snapshot.pageScroll) {
    const pageScroller = getPageScroller();
    if (pageScroller) {
      pageScroller.scrollTop = snapshot.pageScroll.top;
      pageScroller.scrollLeft = snapshot.pageScroll.left;
    }
  }

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (restorePageScroll && snapshot.pageScroll) {
        const pageScroller = getPageScroller();
        if (pageScroller) {
          pageScroller.scrollTop = snapshot.pageScroll.top;
          pageScroller.scrollLeft = snapshot.pageScroll.left;
        }
      }

      if (restoreFocus) {
        restoreFocusedElement(root, snapshot.focused);
      }
    });
  } else if (restoreFocus) {
    restoreFocusedElement(root, snapshot.focused);
  }
}
