const TRACKED_SCROLL_SELECTORS = [
  ".screen-content",
  ".editor-sheet",
  ".editor-step-strip",
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

function captureFocusedElement(root) {
  if (typeof document === "undefined" || !root) {
    return null;
  }

  const active = document.activeElement;
  if (!active || !root.contains(active)) {
    return null;
  }

  if (!active.matches("input, textarea, select, button, [tabindex], [contenteditable='true']")) {
    return null;
  }

  return {
    path: getElementPath(root, active),
    selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null
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
  }
}

export function captureRenderState(root) {
  if (!root) {
    return { scrollables: [], pageScroll: null, focused: null };
  }

  const scrollables = [];
  TRACKED_SCROLL_SELECTORS.forEach((selector) => {
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
    pageScroll: pageScroller
      ? {
          top: pageScroller.scrollTop,
          left: pageScroller.scrollLeft
        }
      : null,
    focused: captureFocusedElement(root)
  };
}

export function restoreRenderState(root, snapshot) {
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

  if (snapshot.pageScroll) {
    const pageScroller = getPageScroller();
    if (pageScroller) {
      pageScroller.scrollTop = snapshot.pageScroll.top;
      pageScroller.scrollLeft = snapshot.pageScroll.left;
    }
  }

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (snapshot.pageScroll) {
        const pageScroller = getPageScroller();
        if (pageScroller) {
          pageScroller.scrollTop = snapshot.pageScroll.top;
          pageScroller.scrollLeft = snapshot.pageScroll.left;
        }
      }

      restoreFocusedElement(root, snapshot.focused);
    });
  } else {
    restoreFocusedElement(root, snapshot.focused);
  }
}
