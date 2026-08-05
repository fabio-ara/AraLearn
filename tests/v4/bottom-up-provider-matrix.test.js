import assert from "node:assert/strict";
import test from "node:test";

import {
  executeBottomUpAssistance
} from "../../src/assist/bottomUpAssistanceRuntime.js";
import {
  BOTTOM_UP_ASSISTANCE_OPERATIONS,
  buildBottomUpAssistanceScope
} from "../../src/assist/bottomUpAssistanceScope.js";
import { createGeminiProvider } from "../../src/generation/providers/geminiProvider.js";
import {
  createOpenAiCompatibleProvider
} from "../../src/generation/providers/openAiCompatibleProvider.js";

const BASE_SELECTION = {
  courseKey: "course-provider",
  moduleKey: "module-provider",
  lessonKey: "lesson-provider"
};

function card(id, position, content) {
  return {
    id,
    position,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: `Card ${position}`,
    text: content,
    after: ""
  };
}

function microsequence(id, title, cards) {
  return {
    id,
    title,
    goal: `Compreender ${title}.`,
    role: "explain",
    status: cards.length ? "generated" : "planned",
    dependsOn: [],
    covers: [],
    checks: [],
    errors: [],
    cards
  };
}

function projectFixture({ emptyLesson = false } = {}) {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: BASE_SELECTION.courseKey,
      title: "Curso de integração",
      goal: "Validar o reparo contextual.",
      modules: [{
        id: BASE_SELECTION.moduleKey,
        title: "Módulo",
        guide: {
          goal: "Explicar com precisão.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: BASE_SELECTION.lessonKey,
          title: "Lição",
          guide: {
            goal: "Consolidar conceitos.",
            include: [],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: emptyLesson ? [] : [
            microsequence("micro-a", "Primeira", [
              card("card-a", 1, "Texto A."),
              card("card-b", 2, "Texto B.")
            ]),
            microsequence("micro-b", "Segunda", [
              card("card-c", 1, "Texto C.")
            ]),
            microsequence("micro-c", "Terceira", [
              card("card-d", 1, "Texto D.")
            ])
          ]
        }]
      }]
    }]
  };
}

function scenarioFor(operation) {
  if (operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_RESOURCES) {
    return {
      operation,
      level: "card",
      kind: "items",
      selection: { ...BASE_SELECTION, microsequenceKey: "micro-a", cardKey: "card-a" },
      targetIds: ["main"]
    };
  }
  if (operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_CARD) {
    return {
      operation,
      level: "card",
      kind: "container",
      selection: { ...BASE_SELECTION, microsequenceKey: "micro-a", cardKey: "card-a" }
    };
  }
  if ([
    BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_CARDS,
    BOTTOM_UP_ASSISTANCE_OPERATIONS.REMOVE_CARDS,
    BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_CARDS
  ].includes(operation)) {
    return {
      operation,
      level: "microsequence",
      kind: "items",
      selection: { ...BASE_SELECTION, microsequenceKey: "micro-a" },
      targetIds: operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_CARDS
        ? ["card-a", "card-b"]
        : ["card-a"]
    };
  }
  if (operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS) {
    return {
      operation,
      level: "microsequence",
      kind: "container",
      selection: { ...BASE_SELECTION, microsequenceKey: "micro-a" }
    };
  }
  if ([
    BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_MICROSEQUENCES,
    BOTTOM_UP_ASSISTANCE_OPERATIONS.REMOVE_MICROSEQUENCES,
    BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_MICROSEQUENCES
  ].includes(operation)) {
    return {
      operation,
      level: "lesson",
      kind: "items",
      selection: BASE_SELECTION,
      targetIds: operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_MICROSEQUENCES
        ? ["micro-a", "micro-b"]
        : ["micro-a"]
    };
  }
  return {
    operation,
    level: "lesson",
    kind: "container",
    selection: BASE_SELECTION,
    emptyLesson: true
  };
}

function paragraphFromWritableTarget(request, content) {
  const target = request.engineContext.writableTarget;
  return {
    card: {
      id: target.id,
      position: target.position,
      resource: target.resource,
      kind: target.kind,
      exercise: target.exercise,
      title: target.title || "Card corrigido",
      text: content,
      after: ""
    }
  };
}

function providerValue(request, scenario) {
  const selectedIds = request.engineContext?.writeScope?.selectedIds || [];
  switch (request.phase) {
    case "bottom_up_operation":
      return { operation: scenario.operation };
    case "bottom_up_targets":
      return { targetIds: [scenario.targetIds?.[0] || selectedIds[0]] };
    case "card_assistance_resource_repair":
      return {
        replacements: [{
          targetId: "main",
          value: { text: "Texto reparado pelo adaptador." },
          gaps: []
        }]
      };
    case "card_assistance_representation":
      return { representation: "paragraph:theory:none" };
    case "card_assistance_build":
      return paragraphFromWritableTarget(request, "Card reconstruído pelo adaptador.");
    case "bottom_up_move":
      return {
        moves: [{
          targetId: scenario.targetIds?.[0] || selectedIds[0],
          toIndex: 1
        }]
      };
    case "bottom_up_update_microsequences":
      return {
        updates: [{
          targetId: scenario.targetIds?.[0] || selectedIds[0],
          title: "Microssequência revisada"
        }]
      };
    case "bottom_up_plan_cards":
      return {
        cards: [{
          title: "Novo card",
          representation: "paragraph:theory:none",
          insertIndex: 2
        }]
      };
    case "bottom_up_build_card":
      return paragraphFromWritableTarget(request, "Conteúdo novo e autocontido.");
    case "bottom_up_create_microsequence":
      return {
        microsequence: {
          title: "Nova microssequência",
          goal: "Introduzir um conceito novo.",
          role: "explain",
          dependsOn: [],
          covers: [],
          checks: [],
          insertIndex: 0,
          cards: []
        }
      };
    default:
      throw new Error(`Fase não roteada no teste: ${request.phase}`);
  }
}

function successfulResponse(providerKind, value) {
  const payload = providerKind === "gemini"
    ? {
        candidates: [{
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(value) }] }
        }],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 10,
          totalTokenCount: 30
        }
      }
    : {
        choices: [{
          finish_reason: "stop",
          message: { content: JSON.stringify(value) }
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
      };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function createAdapterHarness(providerKind) {
  const rawProvider = providerKind === "gemini"
    ? createGeminiProvider({ apiKey: "test-key" })
    : createOpenAiCompatibleProvider({
        baseUrl: "https://api.deepseek.com",
        apiKey: "test-key",
        useDeepSeekPolicy: true
      });
  const bodies = [];
  let activeRequest = null;
  let activeScenario = null;
  return {
    bodies,
    selectScenario(scenario) {
      activeScenario = scenario;
    },
    provider: {
      ...rawProvider,
      async generateStructured(request) {
        activeRequest = request;
        try {
          return await rawProvider.generateStructured(request);
        } finally {
          activeRequest = null;
        }
      }
    },
    async fetch(_url, init = {}) {
      assert.ok(activeRequest, "o adaptador deve manter a requisição ativa");
      const body = JSON.parse(init.body);
      bodies.push({ phase: activeRequest.phase, body });
      return successfulResponse(
        providerKind,
        providerValue(activeRequest, activeScenario)
      );
    }
  };
}

const OPERATIONS = Object.values(BOTTOM_UP_ASSISTANCE_OPERATIONS);

for (const providerKind of ["deepseek", "gemini"]) {
  test(`${providerKind} percorre todos os fluxos bottom-up pelo adaptador real`, async () => {
    const originalFetch = globalThis.fetch;
    const harness = createAdapterHarness(providerKind);
    globalThis.fetch = harness.fetch;
    try {
      for (const operation of OPERATIONS) {
        const scenario = scenarioFor(operation);
        harness.selectScenario(scenario);
        const projectDocument = projectFixture({ emptyLesson: scenario.emptyLesson });
        const scope = await buildBottomUpAssistanceScope({
          projectDocument,
          selection: scenario.selection,
          level: scenario.level,
          kind: scenario.kind,
          targetIds: scenario.targetIds
        });
        const result = await executeBottomUpAssistance({
          scope,
          projectDocument,
          prompt: `Execute ${operation} somente no recorte selecionado.`,
          provider: harness.provider,
          modelId: providerKind === "gemini"
            ? "gemini-3.6-flash"
            : "deepseek-v4-flash"
        });
        assert.equal(result.operation, operation);
        assert.equal(result.contract, "aralearn.bottom-up-assistance-result.v1");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.ok(harness.bodies.length >= OPERATIONS.length);
    if (providerKind === "deepseek") {
      harness.bodies.forEach(({ body }) => {
        assert.equal(body.model, "deepseek-v4-flash");
        assert.equal(body.response_format.type, "json_object");
        assert.equal(body.thinking.type, "disabled");
      });
    } else {
      harness.bodies.forEach(({ body }) => {
        assert.equal(body.generationConfig.responseFormat.text.mimeType, "application/json");
        assert.equal(Object.hasOwn(body.generationConfig, "responseMimeType"), false);
      });
    }
  });
}
