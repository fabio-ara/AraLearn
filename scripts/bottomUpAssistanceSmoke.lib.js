import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  executeBottomUpAssistance
} from "../src/assist/bottomUpAssistanceRuntime.js";
import {
  BOTTOM_UP_ASSISTANCE_OPERATIONS,
  buildBottomUpAssistanceScope
} from "../src/assist/bottomUpAssistanceScope.js";

const BASE_SELECTION = {
  courseKey: "course-smoke",
  moduleKey: "module-smoke",
  lessonKey: "lesson-smoke"
};

function card(id, position, content) {
  return {
    id,
    position,
    title: `Card ${position}`,
    role: "theory",
    content: [{
      id: `${id}-text`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: content }
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

function microsequence(id, title, cards) {
  return {
    id,
    title,
    goal: `Compreender ${title}.`,
    role: "explain",
    branchOf: null,
    dependsOn: [],
    covers: [],
    checks: [],
    errors: [],
    cards
  };
}

function projectFixture({ emptyLesson = false } = {}) {
  return {
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [{
      id: BASE_SELECTION.courseKey,
      title: "Curso de smoke",
      goal: "Validar operações contextuais com recortes pequenos.",
      modules: [{
        id: BASE_SELECTION.moduleKey,
        title: "Módulo",
        guide: {
          goal: "Explicar com precisão e sem pressupor conhecimento prévio.",
          include: ["conceito fundamental"],
          exclude: ["token-proibido-smoke-x91"],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: BASE_SELECTION.lessonKey,
          title: "Lição",
          guide: {
            goal: "Consolidar o conceito fundamental.",
            include: ["conceito fundamental"],
            exclude: ["token-proibido-smoke-x91"],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: emptyLesson ? [] : [
            microsequence("micro-a", "Fundamento", [
              card("card-a", 1, "Um conceito fundamental possui uma definição precisa."),
              card("card-b", 2, "Um exemplo curto consolida a definição.")
            ]),
            microsequence("micro-b", "Exemplo", [
              card("card-c", 1, "O exemplo aplica o conceito fundamental.")
            ]),
            microsequence("micro-c", "Síntese", [
              card("card-d", 1, "A síntese retoma o conceito fundamental.")
            ])
          ]
        }]
      }]
    }]
  };
}

const SCENARIOS = [
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_RESOURCES,
    level: "card",
    kind: "items",
    selection: { ...BASE_SELECTION, microsequenceKey: "micro-a", cardKey: "card-a" },
    targetIds: ["content:card-a-text"],
    prompt: "Reescreva somente o parágrafo selecionado para deixá-lo mais claro e autocontido."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_CARD,
    level: "card",
    kind: "container",
    selection: { ...BASE_SELECTION, microsequenceKey: "micro-a", cardKey: "card-a" },
    prompt: "Reconstrua este card para explicar melhor o conceito fundamental, preservando sua identidade."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_CARDS,
    level: "microsequence",
    kind: "items",
    selection: { ...BASE_SELECTION, microsequenceKey: "micro-a" },
    targetIds: ["card-a"],
    prompt: "Atualize o card selecionado para torná-lo mais claro; não mova nem exclua o card."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.REMOVE_CARDS,
    level: "microsequence",
    kind: "items",
    selection: { ...BASE_SELECTION, microsequenceKey: "micro-a" },
    targetIds: ["card-a"],
    prompt: "Exclua somente o card selecionado."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_CARDS,
    level: "microsequence",
    kind: "items",
    selection: { ...BASE_SELECTION, microsequenceKey: "micro-a" },
    targetIds: ["card-a", "card-b"],
    prompt: "Mova card-a para depois de card-b, usando o índice 1; não altere conteúdo."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS,
    level: "microsequence",
    kind: "container",
    selection: { ...BASE_SELECTION, microsequenceKey: "micro-a" },
    prompt: "Crie exatamente um card teórico curto no fim desta microssequência."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_MICROSEQUENCES,
    level: "lesson",
    kind: "items",
    selection: BASE_SELECTION,
    targetIds: ["micro-a"],
    prompt: "Atualize somente o título e o objetivo da microssequência selecionada; não a mova nem exclua."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.REMOVE_MICROSEQUENCES,
    level: "lesson",
    kind: "items",
    selection: BASE_SELECTION,
    targetIds: ["micro-a"],
    prompt: "Exclua somente a microssequência selecionada."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_MICROSEQUENCES,
    level: "lesson",
    kind: "items",
    selection: BASE_SELECTION,
    targetIds: ["micro-a", "micro-b"],
    prompt: "Mova micro-a para depois de micro-b, usando o índice 1; não altere conteúdo."
  },
  {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE,
    level: "lesson",
    kind: "container",
    selection: BASE_SELECTION,
    emptyLesson: true,
    prompt: "Crie exatamente uma microssequência introdutória nesta lição vazia."
  }
];

function accumulateUsage(total, value = {}) {
  total.successful_calls += 1;
  for (const fieldName of [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "prompt_cache_hit_tokens",
    "prompt_cache_miss_tokens"
  ]) {
    total[fieldName] += Number(value[fieldName]) || 0;
  }
}

export async function runBottomUpAssistanceSmoke({
  provider,
  providerId,
  modelId,
  reportFileName = "codex-bottom-up-assistance.json"
}) {
  const usage = {
    calls: 0,
    successful_calls: 0,
    failed_calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0
  };
  const operations = [];

  for (const scenario of SCENARIOS) {
    const projectDocument = projectFixture({ emptyLesson: scenario.emptyLesson });
    const before = JSON.stringify(projectDocument);
    const progress = [];
    const measuredProvider = {
      ...provider,
      async generateStructured(request) {
        usage.calls += 1;
        let response;
        try {
          response = await provider.generateStructured(request);
        } catch (error) {
          usage.failed_calls += 1;
          throw error;
        }
        accumulateUsage(usage, response?.usage);
        return response;
      }
    };
    const scope = await buildBottomUpAssistanceScope({
      projectDocument,
      selection: scenario.selection,
      level: scenario.level,
      kind: scenario.kind,
      targetIds: scenario.targetIds
    });
    let result;
    try {
      result = await executeBottomUpAssistance({
        scope,
        projectDocument,
        prompt: scenario.prompt,
        provider: measuredProvider,
        modelId,
        onProgress: (event) => progress.push(event)
      });
    } catch (error) {
      throw new Error(
        `Falha no cenário real ${scenario.operation}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }

    assert.equal(result.operation, scenario.operation);
    assert.equal(result.contract, "aralearn.bottom-up-assistance-result.v1");
    assert.equal(JSON.stringify(projectDocument), before, "o input foi mutado");
    assert.notEqual(JSON.stringify(result.projectDocument), before, "a operação não alterou o recorte");
    operations.push({
      operation: scenario.operation,
      level: scenario.level,
      targetCount: result.change.targetIds.length,
      createdCount: result.change.createdIds.length,
      phases: progress
        .filter((event) => event.status === "completed")
        .map((event) => event.phase)
    });
  }

  assert.deepEqual(
    operations.map((item) => item.operation).sort(),
    Object.values(BOTTOM_UP_ASSISTANCE_OPERATIONS).sort()
  );
  const report = {
    contract: "aralearn.bottom-up-assistance-smoke.v1",
    createdAt: new Date().toISOString(),
    provider: providerId,
    modelId,
    operationCount: operations.length,
    usage,
    operations
  };
  const reportDir = path.join(process.cwd(), "tests", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, reportFileName);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, reportPath, ...report }, null, 2));
  return report;
}
