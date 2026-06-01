import test from "node:test";
import assert from "node:assert/strict";

import { buildRetryPrompt, collectPendingSlots, mergeAcceptedSlots } from "../../src/generation/engine/slotRetry.js";

test("retry pede só slot pendente e reaproveita slot aceito", () => {
  const pending = collectPendingSlots({
    cardResult: {
      accepted: { 1: { raw: "ok", value: "ok" }, 3: { raw: "ok", value: "ok" } },
      missing: [{ index: 2, reason: "faltante" }],
      invalid: [],
      duplicate: [],
      extra: []
    }
  });
  assert.deepEqual(pending, [{ slotIndex: 2, reason: "faltante" }]);
  const prompt = buildRetryPrompt({
    phase: "bottom_up_card_build",
    cardIndex: 2,
    pendingSlots: pending,
    slotSchema: [{ index: 2, label: "question" }]
  });
  assert.match(prompt, /- 2: question/);
  assert.doesNotMatch(prompt, /1:/);
  assert.doesNotMatch(prompt, /3:/);
  const merged = mergeAcceptedSlots(
    { 1: { raw: "ok", value: "ok" } },
    { accepted: { 2: { raw: "novo", value: "novo" } } }
  );
  assert.equal(merged["1"].value, "ok");
  assert.equal(merged["2"].value, "novo");
});
