import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeComposeResult,
  normalizeEditResult,
  resumeGenerationFromValidatedPlan,
  runGeminiAssist,
  validateOrRepairMicrosequencePlan
} from "../src/assist/assistModeDispatcher.js";
import { buildMicrosequencePlanningContract } from "../src/generation/planning/buildMicrosequencePlanningContract.js";
import { buildMicrosequenceGenerationContract } from "../src/generation/contracts/buildMicrosequenceGenerationContract.js";
import { validateMicrosequencePlan } from "../src/generation/planning/validateMicrosequencePlan.js";

function makeComposeContext(overrides = {}) {
  return {
    key: "micro-git",
    courseKey: "course-git",
    courseTitle: "Programação",
    courseDescription: "Fundamentos para iniciantes.",
    moduleKey: "module-git",
    moduleTitle: "Git e colaboração",
    moduleDescription: "Versionamento básico.",
    lessonKey: "lesson-git",
    lessonTitle: "Primeiros comandos",
    lessonDescription: "Criar repositório e registrar mudanças.",
    lessonSourceGuideStructured: {
      lessonGoal: "Distinguir `git add` de `git commit` no fluxo local.",
      notationRules: "Destacar comandos inline com acentos graves.",
      commonErrors: "Confundir preparar arquivos com registrar histórico."
    },
    lessonDomainMap: {
      items: [
        {
          id: "domain-git-flow",
          label: "Fluxo local do Git",
          kind: "concept",
          centrality: "core"
        }
      ],
      practiceVariants: [
        {
          id: "variant-git-flow-check",
          domainItemRef: "domain-git-flow",
          label: "Checagem do fluxo local"
        }
      ]
    },
    lessonResourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "code_editor"],
    lessonContentTypeTags: ["procedure", "tool_use"],
    lessonLearningActionTags: ["practice", "use_tool"],
    lessonSupportLevel: "guided",
    lessonMicrosequences: [
      {
        key: "micro-previa",
        title: "Visão geral do Git",
        description: "Apresenta o fluxo antes dos comandos.",
        tags: ["Git"],
        domainRefs: ["domain-git-flow"],
        practiceVariantRefs: [],
        didacticPurpose: "Abrir o contexto.",
        coverageRole: "explain",
        status: "ready",
        included: true
      }
    ],
    title: "Fluxo Git",
    cards: [],
    ...overrides
  };
}

function makePlanningPayload() {
  return {
    typeId: "code_or_command",
    sizeId: "medium",
    microsequenceGoal: "Distinguir `git add` de `git commit` no fluxo local.",
    selectedExtraResourceTypes: [],
    sourceUsePlan: [],
    reason: "Pedido pede dois comandos do mesmo fluxo."
  };
}

function makeSimplePlanningPayload() {
  return {
    typeId: "simple",
    sizeId: "short",
    microsequenceGoal: "Distinguir `git add` de `git commit` no fluxo local.",
    selectedExtraResourceTypes: [],
    sourceUsePlan: [],
    reason: "Pedido pede uma explicação curta com checagem."
  };
}

function makeGeneratedCardsPayload() {
  return {
    cards: [
      {
        position: 1,
        resourceType: "paragraph",
        title: "Primeiro contexto",
        text: "No Git, você primeiro prepara arquivos e só depois registra o histórico.",
        sourceNote: "Resumo autoral."
      },
      {
        position: 2,
        resourceType: "code_editor",
        title: "Preparar",
        prompt: "Use `git add` para preparar um arquivo.",
        language: "bash",
        code: "git add app.js",
        sourceNote: "Comando básico autoral."
      },
      {
        position: 3,
        resourceType: "code_editor",
        title: "Registrar",
        prompt: "Use `git commit` para registrar o que já foi preparado.",
        language: "bash",
        code: "git commit -m \"Registra avanço\"",
        sourceNote: "Comando básico autoral."
      },
      {
        position: 4,
        resourceType: "multiple_choice",
        title: "Checagem",
        question: "Qual comando registra o histórico local?",
        options: [
          { optionId: "a", label: "git commit" },
          { optionId: "b", label: "git add" },
          { optionId: "c", label: "git status" }
        ],
        correctOptionId: "a",
        feedback: "`git commit` grava o histórico local.",
        sourceNote: "Resumo autoral."
      },
      {
        position: 5,
        resourceType: "paragraph",
        title: "Retomada",
        text: "A ordem mínima é: preparar com `git add` e registrar com `git commit`.",
        sourceNote: "Resumo autoral."
      }
    ]
  };
}

function makeShallowSimpleCardsPayload() {
  return {
    cards: [
      {
        position: 1,
        resourceType: "paragraph",
        title: "Preparar e registrar",
        text: "`git add` prepara arquivos. `git commit` registra o que já foi preparado.",
        sourceNote: "Resumo autoral."
      },
      {
        position: 2,
        resourceType: "paragraph",
        title: "Ordem mínima",
        text: "Primeiro você escolhe o que entra, depois grava no histórico local.",
        sourceNote: "Resumo autoral."
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Checagem",
        question: "Qual comando registra o histórico local: `git commit` ou `git add`?",
        options: [
          { optionId: "a", label: "git commit" },
          { optionId: "b", label: "git add" },
          { optionId: "c", label: "git status" }
        ],
        correctOptionId: "a",
        feedback: "`git commit` registra o histórico local.",
        sourceNote: "Resumo autoral."
      }
    ]
  };
}

function makeRepairedSimpleCardsPayload() {
  return {
    cards: [
      {
        position: 1,
        resourceType: "paragraph",
        title: "Preparar antes de registrar",
        text: "`git add` prepara os arquivos escolhidos. `git commit` registra no histórico o que já foi preparado.",
        sourceNote: "Explicação autoral."
      },
      {
        position: 2,
        resourceType: "paragraph",
        title: "Ponto crítico",
        text: "Os dois comandos não fazem a mesma coisa: um seleciona a mudança, o outro grava a mudança selecionada.",
        sourceNote: "Explicação autoral."
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Checagem",
        question: "Qual comando registra o histórico local depois da preparação?",
        options: [
          { optionId: "a", label: "git commit" },
          { optionId: "b", label: "git add" },
          { optionId: "c", label: "git status" }
        ],
        correctOptionId: "a",
        feedback: "`git commit` registra no histórico o que já foi preparado com `git add`.",
        sourceNote: "Exemplo autoral."
      }
    ]
  };
}

function makeGeminiTextResponse(payloadText) {
  return {
    ok: true,
    async json() {
      return {
        candidates: [
          {
            content: {
              parts: [{ text: payloadText }]
            }
          }
        ]
      };
    }
  };
}

function makeGeminiErrorResponse(status, message) {
  return {
    ok: false,
    status,
    async json() {
      return {
        error: {
          message
        }
      };
    }
  };
}

test("normalizeComposeResult e normalizeEditResult preservam contrato público", () => {
  const compose = normalizeComposeResult({
    microsequenceTitle: "Fluxo Git",
    cards: [{ title: "Ideia", say: "Texto." }]
  });
  const edited = normalizeEditResult({ title: "Trecho", say: "Conteúdo revisado." });

  assert.equal(compose.microsequenceTitle, "Fluxo Git");
  assert.equal(compose.cards[0].say, "Texto.");
  assert.equal(edited.say, "Conteúdo revisado.");
});

test("planejamento estrutural top-down do Gemini continua usando responseJsonSchema nativo", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return makeGeminiTextResponse(
      JSON.stringify({
        course: {
          title: "Programação",
          description: "Curso introdutório.",
          modules: [
            {
              title: "Git",
              description: "Módulo inicial.",
              lessons: [
                {
                  title: "Primeiros comandos",
                  description: "Aprender comandos básicos.",
                  sourceGuideStructured: {
                    lessonGoal: "Executar os comandos básicos."
                  }
                },
                {
                  title: "Fluxo básico",
                  description: "Entender o fluxo principal.",
                  sourceGuideStructured: {
                    lessonGoal: "Aplicar o fluxo básico."
                  }
                }
              ]
            }
          ]
        }
      })
    );
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "generate-top-down-structure",
      microsequence: {
        actionLabel: "criar/atualizar esta lição e suas microssequências",
        courseTitle: "Programação",
        moduleTitle: "Git",
        lessonTitle: "Primeiros comandos"
      },
      promptText: "Monte a estrutura inicial da lição."
    });

    assert.ok(calls[0].generationConfig.responseJsonSchema);
    assert.equal(calls[0].generationConfig.responseMimeType, "application/json");
    assert.equal(result.course.modules[0].lessons.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("compose-microsequence usa weak model mode e aplica cards validados diretamente", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const generateCount = calls.filter((item) => String(item.url).includes(":generateContent")).length;
    const payload = generateCount === 1 ? makePlanningPayload() : makeGeneratedCardsPayload();
    return makeGeminiTextResponse(JSON.stringify(payload));
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeContext(),
      promptText: "Explique `git add` e `git commit`."
    });

    assert.equal(calls.length, 2);
    assert.ok(!calls[0].body.generationConfig.responseJsonSchema);
    assert.ok(!calls[1].body.generationConfig.responseJsonSchema);
    assert.equal(result.cards.length, 5);
    assert.equal(result.cards[1].code, "git add app.js");
    assert.equal(result.generationRunState.status, "generation_validated");
    assert.equal(result.generationRunState.generationContract.weakModelMode.modeId, "weakModelMode");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("compose-microsequence envia domainMap e linha de microssequências da lição para o planejamento", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const generateCount = calls.filter((item) => String(item.url).includes(":generateContent")).length;
    const payload = generateCount === 1 ? makePlanningPayload() : makeGeneratedCardsPayload();
    return makeGeminiTextResponse(JSON.stringify(payload));
  };

  try {
    await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeContext(),
      promptText: "Explique `git add` e `git commit`."
    });

    const planningPrompt = calls[0].body.contents[0].parts[0].text;
    assert.match(planningPrompt, /"domainMap"/);
    assert.match(planningPrompt, /"microsequenceLine"/);
    assert.match(planningPrompt, /micro-previa/);
    assert.match(planningPrompt, /domain-git-flow/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validateOrRepairMicrosequencePlan repara typeId inválido preservando tipo fixado", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return makeGeminiTextResponse(
      JSON.stringify({
        typeId: "simple",
        sizeId: "short",
        microsequenceGoal: "Explicar o fluxo local.",
        selectedExtraResourceTypes: [],
        sourceUsePlan: [],
        reason: "tipo corrigido"
      })
    );
  };

  try {
    const planningContract = buildMicrosequencePlanningContract({
      selectedCourse: { key: "course", title: "Curso" },
      selectedModule: { key: "module", title: "Módulo" },
      selectedLesson: {
        key: "lesson",
        title: "Lição",
        sourceGuideStructured: { lessonGoal: "Escopo.", notationRules: "Notação.", commonErrors: "Erro." },
        resourceTags: ["paragraph", "multiple_choice"],
        contentTypeTags: ["concept"],
        learningActionTags: ["understand"],
        supportLevel: "guided"
      },
      targetMicrosequence: { key: "micro", title: "Micro" },
      userPrompt: "Explique o fluxo local.",
      userFixedTypeId: "simple",
      selectedModel: "gemini-2.5-flash"
    });

    const repaired = await validateOrRepairMicrosequencePlan({
      apiKey: "chave",
      model: "gemini-2.5-flash",
      planningContract,
      planningResult: {
        typeId: "guided_practice",
        sizeId: "short",
        microsequenceGoal: "Inválido",
        selectedExtraResourceTypes: [],
        sourceUsePlan: [],
        reason: "inválido"
      },
      modelCapabilities: { preferShortSchemas: true }
    });

    assert.equal(repaired.ok, true);
    assert.equal(repaired.plan.typeId, "simple");
    assert.match(calls[0].contents[0].parts[0].text, /request.userFixedTypeId/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resumeGenerationFromValidatedPlan retoma apenas a etapa de geração", async () => {
  const planningContract = buildMicrosequencePlanningContract({
    selectedCourse: { key: "course", title: "Curso" },
    selectedModule: { key: "module", title: "Módulo" },
    selectedLesson: {
      key: "lesson",
      title: "Lição",
      sourceGuideStructured: {
        lessonGoal: "Distinguir `git add` de `git commit`.",
        notationRules: "Usar acentos graves.",
        commonErrors: "Confundir preparar com registrar."
      },
      resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "code_editor"],
      contentTypeTags: ["procedure", "tool_use"],
      learningActionTags: ["practice", "use_tool"],
      supportLevel: "guided"
    },
    targetMicrosequence: { key: "micro", title: "Fluxo Git", status: "draft", included: false },
    userPrompt: "Explique `git add` e `git commit`.",
    selectedModel: "gemini-2.5-flash"
  });
  const validatedPlan = validateMicrosequencePlan(makePlanningPayload(), planningContract);
  assert.equal(validatedPlan.ok, true);
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan,
    selectedModel: "gemini-2.5-flash"
  });
  const runState = {
    runId: "run-1",
    status: "generation_failed_retryable",
    target: { courseKey: "", moduleKey: "", lessonKey: "", microsequenceKey: "micro" },
    modelId: "gemini-2.5-flash",
    actualModelId: "gemini-2.5-flash",
    fallbackUsed: false,
    planningContract,
    validatedPlan,
    generationContract,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastError: null
  };

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return makeGeminiTextResponse(JSON.stringify(makeGeneratedCardsPayload()));
  };

  try {
    const result = await resumeGenerationFromValidatedPlan({
      apiKey: "chave",
      model: "gemini-2.5-flash",
      runState
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].body.contents[0].parts[0].text, /Gere cards para o plano/);
    assert.doesNotMatch(calls[0].body.contents[0].parts[0].text, /Planeje a microssequência/);
    assert.equal(result.cards.length, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("erro transitório na geração mantém canResume true e fallback só quando habilitado", async () => {
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (url) => {
    count += 1;
    if (count === 1) {
      return makeGeminiTextResponse(JSON.stringify(makePlanningPayload()));
    }
    if (String(url).includes("gemini-2.5-flash-lite:generateContent")) {
      return makeGeminiTextResponse(JSON.stringify(makeGeneratedCardsPayload()));
    }
    return makeGeminiErrorResponse(503, "High demand.");
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeContext(),
      promptText: "Explique `git add` e `git commit`.",
      fallbackEnabled: true,
      fallbackModelId: "gemini-2.5-flash-lite",
      retryOptions: { maxAttempts: 1, delay: async () => null }
    });

    assert.equal(result.fallbackUsed, true);
    assert.equal(result.modelId, "gemini-2.5-flash-lite");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("anexos PDF usam Files API e o pedido de geração continua sem schema nativo", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const attachment = {
    name: "referencia.pdf",
    type: "application/pdf",
    size: 12,
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3]).buffer;
    }
  };

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "https://generativelanguage.googleapis.com/upload/v1beta/files") {
      return {
        ok: true,
        headers: {
          get(name) {
            return String(name || "").toLowerCase() === "x-goog-upload-url" ? "https://upload.example/files/abc" : null;
          }
        },
        async json() {
          return {};
        }
      };
    }
    if (url === "https://upload.example/files/abc") {
      return {
        ok: true,
        async json() {
          return {
            file: {
              name: "files/abc",
              uri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
              mimeType: "application/pdf"
            }
          };
        }
      };
    }
    if (String(url).includes(":generateContent")) {
      const generateCount = calls.filter((entry) => String(entry.url).includes(":generateContent")).length;
      return makeGeminiTextResponse(JSON.stringify(generateCount === 1 ? makePlanningPayload() : makeGeneratedCardsPayload()));
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/files/abc") {
      return {
        ok: true,
        async json() {
          return {};
        }
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeContext(),
      promptText: "Explique `git add` e `git commit`.",
      attachments: [attachment]
    });

    const generateCalls = calls.filter((entry) => String(entry.url).includes(":generateContent"));
    assert.equal(result.cards.length, 5);
    assert.equal(generateCalls.length, 2);
    assert.ok(!JSON.parse(generateCalls[0].options.body).generationConfig.responseJsonSchema);
    assert.ok(!JSON.parse(generateCalls[1].options.body).generationConfig.responseJsonSchema);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checagem determinística dispara iteração automática só para defeito realmente acionável", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const generateCount = calls.filter((item) => String(item.url).includes(":generateContent")).length;
    if (generateCount === 1) {
      return makeGeminiTextResponse(JSON.stringify(makeSimplePlanningPayload()));
    }
    if (generateCount === 2) {
      return makeGeminiTextResponse(JSON.stringify(makeShallowSimpleCardsPayload()));
    }
    return makeGeminiTextResponse(JSON.stringify(makeRepairedSimpleCardsPayload()));
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: {
        ...makeComposeContext(),
        lessonResourceTags: ["paragraph", "multiple_choice"],
        lessonContentTypeTags: ["concept", "procedure"],
        lessonLearningActionTags: ["understand", "practice"]
      },
      promptText: "Explique `git add` e `git commit`."
    });

    const generateCalls = calls.filter((entry) => String(entry.url).includes(":generateContent"));
    assert.equal(generateCalls.length, 3);
    assert.equal(result.cards.length, 3);
    assert.equal(result.generationRunState.autoDidacticIterations, 1);
    assert.equal(result.generationRunState.generationContract.output.expectedCardCount, 3);
    assert.match(generateCalls[2].body.contents[0].parts[0].text, /Ações determinadas pelo AraLearn/);
    assert.match(generateCalls[2].body.contents[0].parts[0].text, /Reescrever os cards nas posições 3/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
