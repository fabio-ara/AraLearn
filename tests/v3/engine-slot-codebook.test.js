import test from "node:test";
import assert from "node:assert/strict";

import {
  assertCodeFamily,
  decodeCode,
  getFamilyForCode,
  isCodeKnown,
  listCodesByFamily
} from "../../src/generation/engine/slotCodebook.js";

test("código de família errada falha", () => {
  assert.equal(isCodeKnown(101), true);
  assert.equal(decodeCode(101)?.id, "paragraph");
  assert.equal(getFamilyForCode(101), "resource");
  assert.throws(() => assertCodeFamily(101, "operation"), /família resource/);
});

test("listCodesByFamily devolve famílias esperadas", () => {
  const resources = listCodesByFamily("resource");
  assert.equal(resources.some((item) => item.id === "graph"), true);
  assert.equal(resources.some((item) => item.id === "choice"), true);
});
