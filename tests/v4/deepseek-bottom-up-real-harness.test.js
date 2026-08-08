import assert from "node:assert/strict";
import test from "node:test";

import {
  createTransportCallLimiter,
  DEEPSEEK_REAL_SMOKE_MAX_TRANSPORT_CALLS,
  runDeepSeekBottomUpRealHarness
} from "../../scripts/deepSeekBottomUpRealHarness.lib.js";

function paragraphFromWritableTarget(request, text) {
  const target = request.engineContext.writableTarget;
  return {
    card: {
      id: target.id,
      position: target.position,
      resource: target.resource,
      kind: target.kind,
      exercise: target.exercise,
      title: target.title || "Fundamento revisado",
      text,
      after: ""
    }
  };
}

function scriptedValue(request) {
  switch (request.phase) {
    case "bottom_up_operation":
      if (request.engineContext.writeScope.allowedOperations.includes("replace_resources")) {
        return { operation: "replace_resources" };
      }
      if (request.engineContext.writeScope.allowedOperations.includes("replace_card")) {
        return { operation: "replace_card" };
      }
      if (request.engineContext.writeScope.allowedOperations.includes("create_microsequence")) {
        return { operation: "create_microsequence" };
      }
      return {
        operation: request.engineContext.writeScope.allowedOperations.includes("create_cards")
          ? "create_cards"
          : "update_cards"
      };
    case "bottom_up_targets":
      return { targetIds: request.engineContext.writeScope.selectedIds };
    case "card_assistance_resource_repair":
      return {
        replacements: request.engineContext.writableTargets.map((target, index) => ({
          targetId: target.targetId,
          value: {
            ...target.value,
            value: index === 0
              ? "A magnitude expressa o tamanho do vetor."
              : "A direção identifica sua reta de suporte."
          },
          gaps: []
        }))
      };
    case "card_assistance_representation":
      return { representation: "paragraph:theory:none" };
    case "card_assistance_build":
      return paragraphFromWritableTarget(
        request,
        "O fundamento vetorial relaciona magnitude, direção e sentido."
      );
    case "bottom_up_plan_cards":
      return {
        cards: [{
          title: "Síntese vetorial",
          representation: "paragraph:theory:none",
          insertIndex: request.schema.properties.cards.items.properties.insertIndex.maximum
        }]
      };
    case "bottom_up_build_card":
      return paragraphFromWritableTarget(
        request,
        "Um vetor reúne magnitude, direção e sentido em uma representação autocontida."
      );
    case "bottom_up_create_microsequence":
      return {
        microsequence: {
          title: "Introdução aos vetores",
          goal: "Compreender o fundamento vetorial.",
          role: "explain",
          dependsOn: [],
          covers: ["fundamento vetorial"],
          checks: ["reconhecer magnitude, direção e sentido"],
          insertIndex: 0,
          cards: [{
            title: "Primeiro vetor",
            representation: "paragraph:theory:none"
          }]
        }
      };
    default:
      throw new Error(`Fase não roteada no harness: ${request.phase}`);
  }
}

test("bateria DeepSeek cobre seis recortes e registra somente métricas", async () => {
  let transportCalls = 0;
  const provider = {
    async generateStructured(request) {
      transportCalls += 1;
      return {
        value: scriptedValue(request),
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_cache_hit_tokens: 10,
          prompt_cache_miss_tokens: 90
        }
      };
    }
  };

  const report = await runDeepSeekBottomUpRealHarness({
    provider,
    modelId: "deepseek-v4-flash",
    readTransportCallCount: () => transportCalls
  });

  assert.equal(report.scenarioCount, 6);
  assert.equal(report.logicalCalls, 19);
  assert.equal(report.transportCalls, 19);
  assert.equal(report.transportCallLimit, DEEPSEEK_REAL_SMOKE_MAX_TRANSPORT_CALLS);
  assert.equal(report.usage.total_tokens, 2280);
  assert.deepEqual(
    report.scenarios.map((scenario) => scenario.id),
    [
      "single_resource_readonly_boundary",
      "multiple_resources_readonly_boundary",
      "whole_card_identity_boundary",
      "multiple_cards_atomic_readonly_boundary",
      "create_one_card_in_microsequence",
      "create_one_microsequence_in_empty_lesson"
    ]
  );
  report.scenarios.forEach((scenario) => {
    assert.ok(scenario.diffCount > 0);
    assert.ok(scenario.logicalCalls > 0);
  });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /READONLY_|userRequest|writableTargets|readOnlyContext/u);
  assert.doesNotMatch(serialized, /api.?key|secret|promptText/u);
});

test("limitador global interrompe antes da chamada excedente", async () => {
  let delegated = 0;
  const limiter = createTransportCallLimiter({
    maxCalls: 2,
    async fetchImpl() {
      delegated += 1;
      return new Response("{}", { status: 200 });
    }
  });

  await limiter.fetch("https://api.deepseek.com/chat/completions");
  await limiter.fetch("https://api.deepseek.com/chat/completions");
  await assert.rejects(
    () => limiter.fetch("https://api.deepseek.com/chat/completions"),
    /antes de exceder 2 chamadas/u
  );
  assert.equal(limiter.readCallCount(), 2);
  assert.equal(delegated, 2);
});

test("bateria pode reiterar somente um cenário pago", async () => {
  let transportCalls = 0;
  const provider = {
    async generateStructured(request) {
      transportCalls += 1;
      return { value: scriptedValue(request), usage: {} };
    }
  };

  const report = await runDeepSeekBottomUpRealHarness({
    provider,
    modelId: "deepseek-v4-flash",
    scenarioId: "create_one_card_in_microsequence",
    readTransportCallCount: () => transportCalls
  });

  assert.equal(report.scenarioCount, 1);
  assert.equal(report.logicalCalls, 3);
  assert.equal(report.transportCalls, 3);
  assert.equal(report.scenarios[0].id, "create_one_card_in_microsequence");
});

test("bateria recusa cenário isolado desconhecido antes do provider", async () => {
  let calls = 0;
  await assert.rejects(
    () => runDeepSeekBottomUpRealHarness({
      provider: {
        async generateStructured() {
          calls += 1;
          return { value: {} };
        }
      },
      modelId: "deepseek-v4-flash",
      scenarioId: "cenario-inexistente",
      readTransportCallCount: () => calls
    }),
    /Cenário desconhecido/u
  );
  assert.equal(calls, 0);
});

test("limitador não permite elevar o teto econômico do smoke", () => {
  assert.throws(
    () => createTransportCallLimiter({
      fetchImpl: async () => new Response("{}"),
      maxCalls: DEEPSEEK_REAL_SMOKE_MAX_TRANSPORT_CALLS + 1
    }),
    /teto deve estar/u
  );
});
