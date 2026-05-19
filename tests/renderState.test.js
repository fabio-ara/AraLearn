import test from "node:test";
import assert from "node:assert/strict";

import { captureRenderState, restoreRenderState } from "../src/ui/renderState.js";

class FakeNode {
  constructor(tagName = "DIV", { classes = [], scrollTop = 0, scrollLeft = 0 } = {}) {
    this.tagName = String(tagName || "DIV").toUpperCase();
    this.classList = {
      values: new Set(classes),
      contains: (className) => this.classList.values.has(className)
    };
    this.children = [];
    this.parentElement = null;
    this.scrollTop = scrollTop;
    this.scrollLeft = scrollLeft;
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  matches(selector) {
    const normalized = String(selector || "").trim();
    if (!normalized) {
      return false;
    }
    if (normalized.startsWith(".")) {
      return this.classList.contains(normalized.slice(1));
    }
    return normalized
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .some((item) => item === this.tagName || item.startsWith("[TABINDEX]") || item.startsWith("[CONTENTEDITABLE"));
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) {
          results.push(child);
        }
        visit(child);
      });
    };
    visit(this);
    return results;
  }

  focus() {
    if (globalThis.document) {
      globalThis.document.activeElement = this;
    }
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

function createTree() {
  const root = new FakeNode("div");
  const overlayShell = root.appendChild(new FakeNode("div", { classes: ["overlay-shell"], scrollTop: 140 }));
  const overlayPanel = overlayShell.appendChild(new FakeNode("section", { classes: ["overlay-panel"], scrollTop: 88 }));
  const textarea = overlayPanel.appendChild(new FakeNode("textarea", { scrollTop: 260, scrollLeft: 11 }));
  textarea.selectionStart = 42;
  textarea.selectionEnd = 42;
  return { root, overlayShell, overlayPanel, textarea };
}

test("renderState preserva scroll de overlays, página e textarea focado", () => {
  const pageScroller = { scrollTop: 320, scrollLeft: 19 };
  const firstTree = createTree();
  globalThis.document = {
    activeElement: firstTree.textarea,
    scrollingElement: pageScroller,
    documentElement: pageScroller,
    body: pageScroller
  };
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };

  const snapshot = captureRenderState(firstTree.root);

  const restoredPageScroller = { scrollTop: 0, scrollLeft: 0 };
  const secondTree = createTree();
  secondTree.overlayShell.scrollTop = 0;
  secondTree.overlayPanel.scrollTop = 0;
  secondTree.textarea.scrollTop = 0;
  secondTree.textarea.scrollLeft = 0;
  secondTree.textarea.selectionStart = 0;
  secondTree.textarea.selectionEnd = 0;
  globalThis.document = {
    activeElement: null,
    scrollingElement: restoredPageScroller,
    documentElement: restoredPageScroller,
    body: restoredPageScroller
  };

  restoreRenderState(secondTree.root, snapshot);

  assert.equal(restoredPageScroller.scrollTop, 320);
  assert.equal(restoredPageScroller.scrollLeft, 19);
  assert.equal(secondTree.overlayShell.scrollTop, 140);
  assert.equal(secondTree.overlayPanel.scrollTop, 88);
  assert.equal(secondTree.textarea.scrollTop, 260);
  assert.equal(secondTree.textarea.scrollLeft, 11);
  assert.equal(secondTree.textarea.selectionStart, 42);
  assert.equal(secondTree.textarea.selectionEnd, 42);
  assert.equal(globalThis.document.activeElement, secondTree.textarea);
});
