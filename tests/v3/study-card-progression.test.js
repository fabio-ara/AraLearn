import test from "node:test";
import assert from "node:assert/strict";

import {
  continuePopupMatches,
  createContinuePopupState,
  resolveIndexedTarget
} from "../../src/ui/studyCardProgression.js";

test("a seleção de card é calculada antes de alterar o estado visível", () => {
  const cards = [{ id: "c01" }, { id: "c02" }];
  assert.deepEqual(resolveIndexedTarget(cards, 1), { index: 1, item: cards[1] });
  assert.deepEqual(resolveIndexedTarget(cards, 99), { index: 1, item: cards[1] });
  assert.deepEqual(resolveIndexedTarget([], 1), { index: 0, item: null });
});

test("o popup de continuação pertence a uma única identidade de card", () => {
  const popup = createContinuePopupState("curso/modulo/licao/micro/c01", "popup::0");
  assert.equal(continuePopupMatches(popup, "curso/modulo/licao/micro/c01", "popup::0"), true);
  assert.equal(continuePopupMatches(popup, "curso/modulo/licao/micro/c02", "popup::0"), false);
  assert.throws(() => createContinuePopupState("", "popup::0"), /Identidade inválida/);
});
