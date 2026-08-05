import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeepSeekTextPayload,
  isDeepSeekModelId,
  resolveDeepSeekPhasePolicy
} from "../../src/generation/providers/deepSeekPolicy.js";

test("DeepSeek possui políticas somente para as três fases atômicas de card", () => {
  assert.deepEqual(
    resolveDeepSeekPhasePolicy({ phase: "card_assistance_representation" }),
    {
      modelId: "deepseek-v4-flash",
      thinking: { type: "disabled" },
      temperature: 0,
      maxTokens: 4000
    }
  );
  assert.equal(
    resolveDeepSeekPhasePolicy({ phase: "card_assistance_build" })?.maxTokens,
    16000
  );
  assert.equal(
    resolveDeepSeekPhasePolicy({ phase: "card_assistance_resource_repair" })?.temperature,
    0.1
  );
});

test("DeepSeek expõe somente os identificadores V4 vigentes", () => {
  assert.equal(isDeepSeekModelId("deepseek-v4-flash"), true);
  assert.equal(isDeepSeekModelId("deepseek-v4-pro"), true);
  assert.equal(isDeepSeekModelId("deepseek-chat"), false);
  assert.deepEqual(
    buildDeepSeekTextPayload({ modelId: "deepseek-v4-pro", prompt: "Teste" }).thinking,
    { type: "disabled" }
  );
});
