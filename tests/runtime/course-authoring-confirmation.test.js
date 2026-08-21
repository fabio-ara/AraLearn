import assert from "node:assert/strict";
import test from "node:test";

import { trapAuthoringConfirmationTab } from
  "../../src/ui/courseAuthoringConfirmation.js";

function control(name, moves) {
  return {
    focus(options) {
      moves.push({ name, options });
    }
  };
}

test("confirmação modal contém Tab, Shift+Tab e foco que chega de fora", () => {
  const moves = [];
  const first = control("first", moves);
  const middle = control("middle", moves);
  const last = control("last", moves);
  let queriedSelector = "";
  const root = {
    querySelectorAll(selector) {
      queriedSelector = selector;
      return [first, middle, last];
    }
  };
  const documentValue = { activeElement: last };
  let prevented = 0;

  assert.equal(trapAuthoringConfirmationTab({
    event: { key: "Tab", preventDefault() { prevented += 1; } },
    root,
    confirmationSelector: "[data-confirmation]",
    documentValue
  }), true);
  assert.match(queriedSelector, /^\[data-confirmation\] :is\(/u);
  assert.deepEqual(moves.pop(), { name: "first", options: { preventScroll: true } });

  documentValue.activeElement = first;
  assert.equal(trapAuthoringConfirmationTab({
    event: { key: "Tab", shiftKey: true, preventDefault() { prevented += 1; } },
    root,
    confirmationSelector: "[data-confirmation]",
    documentValue
  }), true);
  assert.deepEqual(moves.pop(), { name: "last", options: { preventScroll: true } });

  documentValue.activeElement = {};
  assert.equal(trapAuthoringConfirmationTab({
    event: { key: "Tab", preventDefault() { prevented += 1; } },
    root,
    confirmationSelector: "[data-confirmation]",
    documentValue
  }), true);
  assert.deepEqual(moves.pop(), { name: "first", options: { preventScroll: true } });

  documentValue.activeElement = middle;
  assert.equal(trapAuthoringConfirmationTab({
    event: { key: "Tab", preventDefault() { prevented += 1; } },
    root,
    confirmationSelector: "[data-confirmation]",
    documentValue
  }), false);
  assert.equal(prevented, 3);
});
