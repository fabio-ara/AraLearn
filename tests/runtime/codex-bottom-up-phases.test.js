import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStandaloneBridgeSource,
  isCodexCardAssistancePhase
} from "../../src/assist/codexBridgeShared.js";
import { createCodexCliProvider } from "../../src/generation/providers/codexCliProvider.js";

const BRIDGE_TOKEN = "aralearn-codex-bridge-token-tests-2026";
const CARD_PHASES = Object.freeze([
  "card_assistance_representation",
  "card_assistance_build",
  "card_assistance_resource_repair"
]);
const BOTTOM_UP_PHASES = Object.freeze([
  "bottom_up_operation",
  "bottom_up_targets",
  "bottom_up_move",
  "bottom_up_update_microsequences",
  "bottom_up_build_card",
  "bottom_up_plan_cards",
  "bottom_up_create_microsequence"
]);

test("allowlist do bridge aceita exatamente as fases de assistência emitidas", () => {
  [...CARD_PHASES, ...BOTTOM_UP_PHASES].forEach((phase) => {
    assert.equal(isCodexCardAssistancePhase(phase), true, phase);
  });

  [
    "bottom_up_*",
    "bottom_up_operation_extra",
    "bottom_up_create_course",
    "bottom_up_create_lesson",
    "top_down_structure",
    "card_assistance_unknown",
    ""
  ].forEach((phase) => {
    assert.equal(isCodexCardAssistancePhase(phase), false, phase);
  });

  const standaloneSource = buildStandaloneBridgeSource();
  BOTTOM_UP_PHASES.forEach((phase) => {
    assert.equal(standaloneSource.includes(JSON.stringify(phase)), true, phase);
  });
});

test("provider Codex encaminha cada fase bottom-up autorizada e rejeita fases arbitrárias", async () => {
  const originalFetch = globalThis.fetch;
  const forwardedModes = [];
  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    forwardedModes.push(payload.mode);
    return new Response(JSON.stringify({
      ok: true,
      result: { ok: true }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const provider = createCodexCliProvider({ token: BRIDGE_TOKEN });
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["ok"],
      properties: { ok: { type: "boolean" } }
    };

    for (const phase of BOTTOM_UP_PHASES) {
      const result = await provider.generateStructured({
        phase,
        schema,
        prompt: "Execute a operação autorizada."
      });
      assert.deepEqual(result.value, { ok: true });
    }

    assert.deepEqual(forwardedModes, BOTTOM_UP_PHASES);
    await assert.rejects(
      () => provider.generateStructured({
        phase: "bottom_up_create_course",
        schema,
        prompt: "Não deve ser encaminhado."
      }),
      (error) => error?.statusCode === 400
    );
    assert.deepEqual(forwardedModes, BOTTOM_UP_PHASES);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
