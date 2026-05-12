import test from "node:test";
import assert from "node:assert/strict";

import { normalizeComposeResult, normalizeEditResult, resumeGenerationFromValidatedPlan, runGeminiAssist, validateOrRepairMicrosequencePlan } from "../src/assist/geminiAssist.js";
import { buildAssistDraftPrompt, buildDeterministicAssistPlan, normalizeAssistDraftResult } from "../src/assist/assistMicrosequenceEngine.js";
import { buildCardRuntime } from "../src/core/cardRuntime.js";
import { buildMicrosequencePlanningContract } from "../src/generation/planning/buildMicrosequencePlanningContract.js";

function makeMicrosequencePlanPayload() {
  return {
    typeId: "code_or_command",
    sizeId: "medium",
    microsequenceGoal: "Explicar git add e git push.",
    selectedExtraResourceTypes: ["code_editor"],
    cardPlan: [
      { position: 1, role: "situar os comandos", resourceType: "paragraph", sourceRefs: [] },
      { position: 2, role: "apresentar git add", resourceType: "code_editor", sourceRefs: [] },
      { position: 3, role: "apresentar git push", resourceType: "code_editor", sourceRefs: [] },
      { position: 4, role: "retomar o uso correto", resourceType: "paragraph", sourceRefs: [] },
      { position: 5, role: "checar entendimento", resourceType: "multiple_choice", sourceRefs: [] }
    ],
    sourceUsePlan: [],
    reason: "Pedido pede comandos específicos."
  };
}

function makeGeneratedCardsPayload() {
  return {
    cards: [
      {
        position: 1,
        resourceType: "paragraph",
        title: "Antes dos comandos",
        text: "Git registra mudanças em etapas. Cada comando faz uma parte do caminho."
      },
      {
        position: 2,
        resourceType: "code_editor",
        title: "git add",
        prompt: "Use git add para preparar arquivos.",
        language: "bash",
        code: "git add arquivo.txt"
      },
      {
        position: 3,
        resourceType: "code_editor",
        title: "git push",
        prompt: "Use git push para enviar commits quando já existe remoto.",
        language: "bash",
        code: "git push -u origin main"
      },
      {
        position: 4,
        resourceType: "paragraph",
        title: "Recuperação ativa",
        text: "Para enviar commits, use [[git push]]."
      },
      {
        position: 5,
        resourceType: "multiple_choice",
        title: "Verificação",
        question: "Qual comando envia commits?",
        options: [
          { optionId: "a", label: "git push" },
          { optionId: "b", label: "git add" },
          { optionId: "c", label: "git init" }
        ],
        correctOptionId: "a",
        feedback: "git push envia commits ao remoto."
      }
    ]
  };
}

function makeGuidedPracticeCardsPayload() {
  return {
    cards: [
      {
        position: 1,
        resourceType: "paragraph",
        title: "Preparar a prática",
        text: "Antes de escolher um comando, identifique qual etapa do fluxo você quer completar."
      },
      {
        position: 2,
        resourceType: "block_gap_fill",
        title: "Complete o fluxo",
        prompt: "Escolha o bloco que prepara arquivos para o commit.",
        segments: [
          { kind: "text", value: "Para preparar arquivos, use " },
          { kind: "blank", blankId: "b1", acceptedBlockIds: ["git-add"] },
          { kind: "text", value: "." }
        ],
        blocks: [
          { blockId: "git-add", label: "git add arquivo.txt" },
          { blockId: "git-push", label: "git push" }
        ],
        feedbackAfter: "git add prepara arquivos antes do commit."
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Consolidar",
        question: "Qual comando prepara arquivos para o commit?",
        options: [
          { optionId: "a", label: "git add" },
          { optionId: "b", label: "git push" },
          { optionId: "c", label: "git clone" }
        ],
        correctOptionId: "a",
        feedback: "git add coloca mudanças na área de preparação."
      }
    ]
  };
}

function makeComposeMicrosequenceContext(overrides = {}) {
  return {
    courseTitle: "Programação",
    courseDescription: "Fundamentos para iniciantes.",
    courseSourceGuideStructured: {
      audience: "Iniciantes absolutos.",
      globalScope: "Fluxo básico de Git para começar a versionar.",
      sharedNotation: "Destacar comandos inline com acentos graves."
    },
    moduleTitle: "Git e colaboração",
    moduleDescription: "Versionamento básico.",
    moduleSourceGuideStructured: {
      moduleScope: "Comandos essenciais para registrar e publicar mudanças.",
      lessonProgression: "Ir de preparação local para envio ao remoto."
    },
    lessonTitle: "Primeiros comandos",
    lessonDescription: "Criar repositório e registrar mudanças.",
    lessonSourceGuideStructured: {
      lessonGoal: "Distinguir `git add` de `git push` no fluxo de trabalho.",
      notationRules: "Destacar `git add` e `git push` inline.",
      masteryGoal: "Escolher o comando correto para preparar ou enviar mudanças."
    },
    lessonResourceTags: ["paragraph", "multiple_choice", "code_editor"],
    lessonContentTypeTags: ["concept", "procedure", "tool_use"],
    lessonLearningActionTags: ["understand", "practice", "use_tool"],
    lessonSupportLevel: "guided",
    title: "Git",
    tags: [],
    cards: [],
    ...overrides
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

test("normaliza composição com intenções semânticas", () => {
  const result = normalizeComposeResult({
    microsequenceTitle: "Modelo cascata",
    tags: ["Processos de software"],
    cards: [
      { title: "Ideia central", say: "Fluxo sequencial." },
      {
        title: "Leitura",
        ask: "Qual estrutura agrupa cards?",
        answer: "Microssequência",
        wrong: ["Curso", "Módulo"]
      }
    ]
  });

  assert.equal(result.microsequenceTitle, "Modelo cascata");
  assert.equal(result.cards[0].say, "Fluxo sequencial.");
  assert.equal(result.cards[1].ask, "Qual estrutura agrupa cards?");
});

test("normaliza revisão no contrato sem type", () => {
  const result = normalizeEditResult(
    {
      title: "Trecho",
      language: "json",
      code: "{ \"ok\": true }"
    }
  );

  assert.equal(result.code, '{ "ok": true }');
});

test("gera escada de microssequências com schema simples", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Estudo sobre soma de matrizes",
                      steps: [
                        { title: "Quando duas matrizes podem ser somadas?" },
                        { title: "Como somar matrizes entrada por entrada?" },
                        { title: "Como somar matrizes entrada por entrada?" },
                        { title: "Erros comuns na soma de matrizes" }
                      ],
                      cards: [{ title: "Não deve entrar" }]
                    })
                  }
                ]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "plan-microsequence-ladder",
      microsequence: {
        courseTitle: "Álgebra Linear",
        moduleTitle: "Matrizes",
        lessonTitle: "Operações com matrizes"
      },
      promptText: "Como se faz soma de matrizes?"
    });

    assert.equal(calls[0].generationConfig.responseMimeType, "application/json");
    assert.ok(calls[0].generationConfig.responseJsonSchema);
    assert.deepEqual(result.steps.map((item) => item.title), [
      "Quando duas matrizes podem ser somadas?",
      "Como somar matrizes entrada por entrada?",
      "Erros comuns na soma de matrizes"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gera estrutura top-down com description breve e sourceGuide detalhada", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      course: {
                        title: "Lógica Proposicional",
                        description: "Curso introdutório de lógica proposicional.",
                        modules: [
                          {
                            title: "Fundamentos",
                            description: "Base conceitual inicial.",
                            lessons: [
                              {
                                title: "Proposições e conectivos",
                                description: "Introdução às proposições.",
                                sourceGuide: "Mostrar exemplos do cotidiano e formalização simbólica.",
                                sourceGuideStructured: {
                                  lessonGoal: "Reconhecer proposições e usar conectivos básicos.",
                                  commonErrors: "Tratar ordem dos conectivos como irrelevante.",
                                  notationRules: "Destacar `e`, `ou`, `não`, `se...então` e símbolos."
                                }
                              }
                            ]
                          }
                        ]
                      }
                    })
                  }
                ]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "generate-top-down-structure",
      microsequence: {
        actionLabel: "criar curso completo",
        courseFixed: false,
        moduleFixed: false,
        lessonFixed: false
      },
      promptText: "Monte um curso inicial de lógica proposicional."
    });

    const prompt = calls[0].contents[0].parts[0].text;
    assert.ok(calls[0].generationConfig.responseJsonSchema);
    assert.match(prompt, /sourceGuideStructured/);
    assert.match(prompt, /Curso e módulo não têm fonte-guia própria neste contrato/);
    assert.match(prompt, /Em lição, use apenas: lessonGoal, notationRules, commonErrors/);
    assert.equal(result.course.description, "Curso introdutório de lógica proposicional.");
    assert.equal(result.course.sourceGuide, undefined);
    assert.equal(result.course.sourceGuideStructured, undefined);
    assert.equal(result.course.modules[0].sourceGuide, undefined);
    assert.equal(result.course.modules[0].sourceGuideStructured, undefined);
    assert.match(result.course.modules[0].lessons[0].sourceGuide, /Meta da lição:/);
    assert.match(result.course.modules[0].lessons[0].sourceGuide, /Confusões prováveis:/);
    assert.equal(result.course.modules[0].lessons[0].sourceGuideStructured.commonErrors, "Tratar ordem dos conectivos como irrelevante.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gera microssequências draft de lição sem cards no modo contextual", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return makeGeminiTextResponse(
      JSON.stringify({
        microsequences: [
          {
            title: "Condições para somar matrizes",
            description: "Verificar compatibilidade de dimensões.",
            tags: ["matrizes", "pré-requisito"],
            cards: [{ title: "Ignorar" }]
          },
          {
            title: "Soma elemento a elemento",
            tags: ["operação"]
          },
          {
            title: "Erros comuns na soma",
            description: "Dimensões diferentes e distrações algébricas."
          }
        ]
      })
    );
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "generate-lesson-microsequences",
      microsequence: {
        actionLabel: "criar microssequências draft nesta lição",
        courseTitle: "Álgebra Linear",
        courseDescription: "Curso breve.",
        moduleTitle: "Matrizes",
        moduleDescription: "Operações básicas.",
        lessonTitle: "Soma de matrizes",
        lessonDescription: "Descrição breve da lição.",
        existingMicrosequences: [
          { title: "O que é uma matriz?", tags: ["base"], status: "ready", included: true }
        ]
      },
      promptText: "Monte rascunhos de microssequências para ensinar soma de matrizes."
    });

    const prompt = calls[0].contents[0].parts[0].text;
    assert.ok(calls[0].generationConfig.responseJsonSchema);
    assert.match(prompt, /Microssequências atuais:/);
    assert.match(prompt, /1\. O que é uma matriz\?; status: ready; included: sim; tags: base/);
    assert.match(prompt, /- Não gere cards\./);
    assert.equal(result.microsequences.length, 3);
    assert.deepEqual(result.microsequences[0], {
      title: "Condições para somar matrizes",
      description: "Verificar compatibilidade de dimensões.",
      tags: ["matrizes", "pré-requisito"]
    });
    assert.equal("cards" in result.microsequences[0], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gera e reposiciona microssequências de lição no modo combinado", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return makeGeminiTextResponse(
      JSON.stringify({
        generatedMicrosequences: [
          {
            draftId: "draft_1",
            title: "Leitura guiada do condicional",
            description: "Separar antecedente e consequente.",
            tags: ["condicional", "leitura"]
          }
        ],
        finalOrder: [
          { entryType: "existing", microsequenceKey: "micro-base" },
          { entryType: "generated", draftId: "draft_1" },
          { entryType: "existing", microsequenceKey: "micro-exercicio" }
        ]
      })
    );
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "generate-and-reposition-lesson-microsequences",
      microsequence: {
        actionLabel: "gerar e reposicionar microssequências nesta lição",
        courseTitle: "Lógica",
        courseDescription: "Curso breve.",
        courseSourceGuideStructured: {
          audience: "Iniciante",
          globalScope: "Base proposicional"
        },
        moduleTitle: "Fundamentos",
        moduleDescription: "Operações básicas.",
        moduleSourceGuideStructured: {
          moduleScope: "Leitura e escrita lógica"
        },
        lessonTitle: "Condicional",
        lessonDescription: "Descrição breve da lição.",
        lessonSourceGuideStructured: {
          lessonGoal: "Ler e usar o condicional",
          commonErrors: "Confundir ordem"
        },
        existingMicrosequences: [
          { key: "micro-base", position: 0, title: "O que é proposição?", tags: ["base"], status: "ready", included: true },
          { key: "micro-exercicio", position: 1, title: "Exercícios iniciais", tags: ["prática"], status: "draft", included: false }
        ]
      },
      promptText: "Adicione uma micro intermediária e reorganize a progressão."
    });

    const prompt = calls[0].contents[0].parts[0].text;
    assert.ok(calls[0].generationConfig.responseJsonSchema);
    assert.match(prompt, /Microssequências atuais:/);
    assert.match(prompt, /key: micro-base; posição: 1/);
    assert.match(prompt, /Fonte-guia estruturada da lição: lessonGoal=Ler e usar o condicional; commonErrors=Confundir ordem/);
    assert.match(prompt, /finalOrder deve listar a ordem final completa da lição/);
    assert.equal(result.generatedMicrosequences.length, 1);
    assert.deepEqual(result.generatedMicrosequences[0], {
      draftId: "draft_1",
      title: "Leitura guiada do condicional",
      description: "Separar antecedente e consequente.",
      tags: ["condicional", "leitura"]
    });
    assert.deepEqual(result.finalOrder, [
      { entryType: "existing", microsequenceKey: "micro-base", draftId: "" },
      { entryType: "generated", microsequenceKey: "", draftId: "draft_1" },
      { entryType: "existing", microsequenceKey: "micro-exercicio", draftId: "" }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("não promove description a sourceGuide no prompt estrutural quando a fonte-guia não existe", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return makeGeminiTextResponse(
      JSON.stringify({
        course: {
          title: "Lógica",
          description: "Curso breve.",
          modules: [
            {
              title: "Fundamentos",
              description: "Base breve.",
              lessons: [
                {
                  title: "Proposições",
                  description: "Descrição breve da lição.",
                  sourceGuide: "Guia detalhado da lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Escopo da lição.",
                    commonErrors: "Erros básicos.",
                    notationRules: "Notação simples."
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
    await runGeminiAssist({
      apiKey: "chave",
      mode: "generate-top-down-structure",
      microsequence: {
        actionLabel: "criar/atualizar esta lição",
        courseFixed: true,
        moduleFixed: true,
        lessonFixed: true,
        courseTitle: "Lógica",
        courseDescription: "Resumo breve do curso.",
        moduleTitle: "Fundamentos",
        moduleDescription: "Resumo breve do módulo.",
        lessonTitle: "Proposições",
        lessonDescription: "Resumo breve da lição."
      },
      promptText: "Refine a lição atual."
    });

    const prompt = calls[0].contents[0].parts[0].text;
    assert.match(prompt, /Descrição breve do curso: Resumo breve do curso\./);
    assert.match(prompt, /Descrição breve do módulo: Resumo breve do módulo\./);
    assert.match(prompt, /Descrição breve da lição: Resumo breve da lição\./);
    assert.match(prompt, /Módulos atuais do curso: nenhum\./);
    assert.match(prompt, /Lições atuais do módulo: nenhum\./);
    assert.doesNotMatch(prompt, /Fonte-guia do curso:/);
    assert.doesNotMatch(prompt, /Fonte-guia do módulo:/);
    assert.doesNotMatch(prompt, /Fonte-guia da lição:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("não promove description a sourceGuide no prompt de microssequências da lição", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return makeGeminiTextResponse(
      JSON.stringify({
        microsequences: [
          { title: "Dependências da soma" },
          { title: "Execução da soma" }
        ]
      })
    );
  };

  try {
    await runGeminiAssist({
      apiKey: "chave",
      mode: "generate-lesson-microsequences",
      microsequence: {
        actionLabel: "criar microssequências draft nesta lição",
        courseTitle: "Lógica",
        courseDescription: "Resumo breve do curso.",
        moduleTitle: "Fundamentos",
        moduleDescription: "Resumo breve do módulo.",
        lessonTitle: "Proposições",
        lessonDescription: "Resumo breve da lição."
      },
      promptText: "Estruture rascunhos para esta lição."
    });

    const prompt = calls[0].contents[0].parts[0].text;
    assert.match(prompt, /Descrição breve do curso: Resumo breve do curso\./);
    assert.match(prompt, /Descrição breve do módulo: Resumo breve do módulo\./);
    assert.match(prompt, /Descrição breve da lição: Resumo breve da lição\./);
    assert.doesNotMatch(prompt, /Fonte-guia do curso:/);
    assert.doesNotMatch(prompt, /Fonte-guia do módulo:/);
    assert.doesNotMatch(prompt, /Fonte-guia da lição:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("converte rascunho assistido para contrato semântico", () => {
  const result = normalizeAssistDraftResult({
    title: "Comandos básicos de Git",
    tags: ["Git"],
    cards: [
      {
        role: "concept",
        container: "say",
        title: "Fluxo básico",
        text: "Git registra alterações em etapas."
      },
      {
        role: "code_example",
        container: "code",
        title: "Preparação",
        text: "O comando abaixo prepara um arquivo.",
        language: "bash",
        code: "git [[add]] arquivo.txt",
        wrong: ["push", "init"]
      },
      {
        role: "choice_check",
        container: "ask",
        title: "Verificação",
        question: "Qual comando envia commits ao remoto?",
        answer: "git push",
        wrong: ["git add", "git init"]
      }
    ]
  });

  assert.equal(result.microsequenceTitle, "Comandos básicos de Git");
  assert.equal(result.cards[0].say, "Git registra alterações em etapas.");
  assert.equal(result.cards[1].code, "git [[add]] arquivo.txt");
  assert.equal(result.cards[2].ask, "Qual comando envia commits ao remoto?");
});

test("reduz densidade de textos gerados para estudo", () => {
  const result = normalizeAssistDraftResult({
    title: "Git básico",
    tags: ["Git"],
    cards: [
      {
        role: "concept",
        container: "say",
        title: "Ideia central",
        text:
          "Git organiza mudanças em etapas. Primeiro você prepara arquivos com [[git add]]. Depois registra com [[git commit]]. Por fim envia com [[git push]]."
      },
      {
        role: "code_example",
        container: "code",
        title: "git push",
        text: "Use git push para enviar commits quando já existe remoto. Não comece por ele.",
        language: "bash",
        code: "git remote add origin https://example.com/repo.git\ngit push -u origin main"
      },
      {
        role: "choice_check",
        container: "ask",
        title: "Verificação",
        question: "Qual comando registra mudanças preparadas?",
        answer: "git commit",
        wrong: ["git add", "git push"]
      }
    ]
  });

  assert.equal(result.cards[0].say, "Git organiza mudanças em etapas.\n\nPrimeiro você prepara arquivos com git add.");
  assert.doesNotMatch(result.cards[0].say, /\[\[/);
  assert.equal(result.cards[1].code, "git push -u origin main");
});

test("garante prática por lacuna com opções selecionáveis", () => {
  const plan = buildDeterministicAssistPlan({
    promptText: "diferencie missão, visão e valores, no contexto de administração de empresas"
  });
  const result = normalizeAssistDraftResult(
    {
      title: "Missão, visão e valores",
      tags: ["Administração"],
      cards: [
        { title: "Ponto de partida", text: "Missão, visão e valores orientam decisões da organização." },
        {
          title: "Comparação guiada",
          columns: ["Elemento", "Pergunta"],
          rows: ["Missão|Por que a organização existe?", "Visão|Onde ela quer chegar?", "Valores|Como ela age?"]
        },
        { title: "Exemplo aplicado", text: "Uma empresa pode ter missão de atender bem e visão de crescer com qualidade." },
        {
          title: "Verificação",
          question: "Qual elemento descreve onde a organização quer chegar?",
          answer: "Visão",
          wrong: ["Missão", "Valores"]
        },
        { title: "Síntese ativa", text: "A visão aponta um destino desejado." }
      ]
    },
    { plan, promptText: "diferencie missão, visão e valores, no contexto de administração de empresas" }
  );

  const reviewCard = result.cards.at(-1);
  const runtime = buildCardRuntime(reviewCard);
  const paragraph = runtime.blocks.find((block) => block.kind === "paragraph" && block.value.includes("[["));

  assert.match(reviewCard.say, /\[\[/);
  assert.ok(Array.isArray(reviewCard.wrong));
  assert.ok(reviewCard.wrong.length >= 2);
  assert.match(paragraph.value, /::/);
});

test("planeja microssequências localmente para assuntos distintos", () => {
  const gitPlan = buildDeterministicAssistPlan({
    promptText: "explique os comandos git init, git add, git commit e git push"
  });
  const adminPlan = buildDeterministicAssistPlan({
    promptText: "diferencie missão, visão e valores, no contexto de administração de empresas"
  });
  const flowPlan = buildDeterministicAssistPlan({
    promptText: "monte um fluxograma para decidir se um número é par"
  });
  const treePlan = buildDeterministicAssistPlan({
    promptText: "mostre uma estrutura de diretórios para um projeto simples em C"
  });

  assert.equal(gitPlan.subject, "git_github");
  assert.equal(gitPlan.recipe, "explain_commands");
  assert.deepEqual(
    gitPlan.cardPlans.map((card) => card.title),
    ["Fluxo mínimo", "Papel de cada comando", "Sequência mínima", "Recuperação ativa", "Verificação"]
  );
  assert.deepEqual(
    gitPlan.cardPlans.map((card) => card.container),
    ["say", "table", "code", "say", "ask"]
  );
  assert.equal(adminPlan.subject, "administracao");
  assert.equal(adminPlan.recipe, "compare_concepts");
  assert.ok(adminPlan.cardPlans.some((card) => card.container === "table"));
  assert.equal(flowPlan.subject, "algoritmos_fluxograma");
  assert.ok(!flowPlan.cardPlans.some((card) => card.container === "flow"));
  assert.ok(flowPlan.cardPlans.some((card) => card.container === "table"));
  assert.equal(treePlan.recipe, "directory_context");
  assert.ok(treePlan.cardPlans.some((card) => card.container === "tree"));
});

test("aplica contêiner preferido ao plano e ao prompt assistido", () => {
  const preferredPlan = buildDeterministicAssistPlan({
    promptText: "troque os cards atuais por um fluxograma simples",
    preferredContainer: "flow"
  });
  const prompt = buildAssistDraftPrompt({
    promptText: "troque os cards atuais por um fluxograma simples",
    plan: preferredPlan,
    microsequence: {
      courseTitle: "Lógica",
      moduleTitle: "Decisão",
      lessonTitle: "Fluxos",
      title: "Número par"
    }
  });

  assert.ok(preferredPlan.cardPlans.every((card) => card.container === "flow"));
  assert.match(prompt, /"container":"flow"/);
  assert.match(prompt, /Não coloque prática antes da microteoria/);
  assert.match(prompt, /Quando a regra for abstrata ou pouco intuitiva/);
  assert.match(prompt, /Quando o card estiver definindo um conceito/);
  assert.match(prompt, /Quando aparecer notação pouco familiar/);
  assert.match(prompt, /Não use linguagem de bastidor nem referência externa ou volátil/);
  assert.match(prompt, /destaque inline com acentos graves/);
  assert.match(prompt, /Não repita o title do card/);
  assert.doesNotMatch(prompt, /Nesta etapa, não gere fluxograma/);
});

test("gera microssequência com plano local e chamada estruturada ao Gemini", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return makeGeminiTextResponse(
      JSON.stringify(calls.length === 1 ? makeMicrosequencePlanPayload() : makeGeneratedCardsPayload())
    );
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeMicrosequenceContext(),
      dependencyTitles: ["Git"],
      selectedLessonTopicRefs: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
      promptText: "explique git add e git push"
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /gemini-2\.5-flash:generateContent/);
    assert.ok(!calls[0].body.generationConfig.responseJsonSchema);
    assert.ok(!calls[1].body.generationConfig.responseJsonSchema);
    assert.match(calls[0].body.contents[0].parts[0].text, /Planeje uma microssequência/i);
    assert.match(calls[1].body.contents[0].parts[0].text, /Gere cards para a microssequência/i);
    assert.match(calls[0].body.contents[0].parts[0].text, /"course":\{"title":"Programação"/);
    assert.match(calls[0].body.contents[0].parts[0].text, /"module":\{"title":"Git e colaboração"/);
    assert.match(calls[0].body.contents[0].parts[0].text, /"lesson":\{"title":"Primeiros comandos"/);
    assert.match(calls[0].body.contents[0].parts[0].text, /"requestGovernance":\{"precedence":\["context\.lesson\.sourceGuideStructured"/);
    assert.match(calls[0].body.contents[0].parts[0].text, /"selectedLessonTopicRefs":\[\{"refKey":"micro-git","label":"Git","source":"microsequence"\}\]/);
    assert.doesNotMatch(calls[0].body.contents[0].parts[0].text, /Análise e Desenvolvimento de Sistemas/);
    assert.match(calls[1].body.contents[0].parts[0].text, /code_editor/);
    assert.equal(result.cards.length, 5);
    assert.equal(result.cards[1].title, "git add");
    assert.equal(result.cards[1].code, "git add arquivo.txt");
    assert.equal(result.cards[2].title, "git push");
    assert.equal(result.cards[2].code, "git push -u origin main");
    assert.equal(result.cards[4].answer, "git push");
    assert.deepEqual(result.tags, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("envia tipo didático fixado pela UI para o planejamento da microssequência", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return makeGeminiTextResponse(
      JSON.stringify(
        calls.length === 1
          ? {
              typeId: "guided_practice",
              sizeId: "short",
              microsequenceGoal: "Praticar git add com uma lacuna guiada.",
              selectedExtraResourceTypes: [],
              sourceUsePlan: [],
              reason: "O usuário fixou prática guiada."
            }
          : makeGuidedPracticeCardsPayload()
      )
    );
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeMicrosequenceContext({
        lessonResourceTags: ["paragraph", "block_gap_fill", "multiple_choice"]
      }),
      promptText: "crie uma prática guiada sobre git add",
      userFixedTypeId: "guided_practice"
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0].body.contents[0].parts[0].text, /"userFixedTypeId":"guided_practice"/);
    assert.match(calls[0].body.contents[0].parts[0].text, /typeId exatamente igual a "guided_practice"/);
    assert.equal(result.generationRunState.validatedPlan.plan.typeId, "guided_practice");
    assert.deepEqual(
      result.generationRunState.validatedPlan.plan.cardPlan.map((card) => card.resourceType),
      ["paragraph", "block_gap_fill", "multiple_choice"]
    );
    assert.equal(result.cards.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("repara planejamento quando typeId viola userFixedTypeId", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return makeGeminiTextResponse(
      JSON.stringify({
        typeId: "simple",
        sizeId: "short",
        microsequenceGoal: "Explicar git.",
        selectedExtraResourceTypes: [],
        cardPlan: [
          { position: 1, role: "explicar", resourceType: "paragraph", sourceRefs: [] },
          { position: 2, role: "explicar", resourceType: "paragraph", sourceRefs: [] },
          { position: 3, role: "explicar", resourceType: "paragraph", sourceRefs: [] }
        ],
        sourceUsePlan: [],
        reason: "reparado"
      })
    );
  };

  try {
    const planningContract = buildMicrosequencePlanningContract({
      selectedCourse: { key: "course", title: "Curso" },
      selectedModule: { key: "module", title: "Módulo" },
      selectedLesson: { key: "lesson", title: "Lição" },
      targetMicrosequence: { key: "micro", title: "Micro" },
      userPrompt: "Explique git.",
      userFixedTypeId: "simple",
      selectedModel: "gemini-2.5-flash"
    });
    const result = await validateOrRepairMicrosequencePlan({
      apiKey: "chave",
      model: "gemini-2.5-flash",
      planningContract,
      planningResult: {
        typeId: "procedure",
        sizeId: "short",
        microsequenceGoal: "Explicar git.",
        selectedExtraResourceTypes: [],
        cardPlan: [
          { position: 1, role: "explicar", resourceType: "paragraph", sourceRefs: [] },
          { position: 2, role: "explicar", resourceType: "paragraph", sourceRefs: [] },
          { position: 3, role: "explicar", resourceType: "paragraph", sourceRefs: [] }
        ],
        sourceUsePlan: [],
        reason: "inválido"
      },
      modelCapabilities: { profile: "compact-json" }
    });

    assert.equal(result.ok, true);
    assert.equal(result.plan.typeId, "simple");
    assert.equal(calls.length, 1);
    assert.match(calls[0].contents[0].parts[0].text, /typeId não preserva o Tipo fixado/);
    assert.match(calls[0].contents[0].parts[0].text, /request.userFixedTypeId/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fluxo Gemini repara geração final inválida antes da adaptação pública", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const invalidGeneratedCards = makeGeneratedCardsPayload();
  invalidGeneratedCards.cards[1] = {
    position: 2,
    resourceType: "image",
    title: "Imagem sem contrato"
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const generateCallCount = calls.filter((call) => String(call.url).includes(":generateContent")).length;
    const payload =
      generateCallCount === 1
        ? makeMicrosequencePlanPayload()
        : generateCallCount === 2
          ? invalidGeneratedCards
          : makeGeneratedCardsPayload();
    return makeGeminiTextResponse(JSON.stringify(payload));
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeMicrosequenceContext(),
      promptText: "explique git add e git push"
    });

    assert.equal(calls.length, 3);
    assert.match(calls[2].body.contents[0].parts[0].text, /Corrija apenas o JSON abaixo/);
    assert.match(calls[2].body.contents[0].parts[0].text, /Recurso fora do permitido: image/);
    assert.equal(result.cards.length, 5);
    assert.equal(result.cards[1].code, "git add arquivo.txt");
    assert.equal(result.cards[4].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fluxo Gemini devolve erro claro quando reparo de geração falha", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const invalidGeneratedCards = { cards: [{ position: 1, resourceType: "image", title: "Imagem" }] };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const generateCallCount = calls.filter((call) => String(call.url).includes(":generateContent")).length;
    const payload = generateCallCount === 1 ? makeMicrosequencePlanPayload() : invalidGeneratedCards;
    return makeGeminiTextResponse(JSON.stringify(payload));
  };

  try {
    await assert.rejects(
      () =>
        runGeminiAssist({
          apiKey: "chave",
          mode: "compose-microsequence",
          microsequence: makeComposeMicrosequenceContext(),
          promptText: "explique git add e git push"
        }),
      (error) => {
        assert.equal(error.phase, "generation");
        assert.equal(error.category, "validation_failed");
        assert.equal(error.canResume, false);
        assert.match(error.generationRunState.lastError.message, /Quantidade incorreta de cards/);
        return true;
      }
    );

    assert.equal(calls.length, 3);
    assert.match(calls[2].body.contents[0].parts[0].text, /Corrija apenas o JSON abaixo/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generationRunState é criado após plano validado no fluxo completo", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const isPlanning = /Planeje uma microssequência/i.test(body.contents[0].parts.at(-1).text);
    return makeGeminiTextResponse(JSON.stringify(isPlanning ? makeMicrosequencePlanPayload() : makeGeneratedCardsPayload()));
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeMicrosequenceContext({ key: "micro" }),
      promptText: "explique git add e git push"
    });

    assert.equal(result.generationRunState.status, "generation_validated");
    assert.equal(result.generationRunState.planningContract.request.userPrompt, "explique git add e git push");
    assert.equal(result.generationRunState.validatedPlan.plan.typeId, "code_or_command");
    assert.equal(result.generationRunState.generationContract.output.expectedCardCount, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falha retryable na geração preserva plano validado e permite retomada sem planejamento", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const delays = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return makeGeminiTextResponse(JSON.stringify(makeMicrosequencePlanPayload()));
    }
    return makeGeminiErrorResponse(503, "This model is currently experiencing high demand.");
  };

  try {
    let capturedError = null;
    try {
        await runGeminiAssist({
          apiKey: "chave",
          mode: "compose-microsequence",
          microsequence: makeComposeMicrosequenceContext({ key: "micro" }),
        promptText: "explique git add e git push",
        retryOptions: { maxAttempts: 2, baseDelayMs: 10, jitterRatio: 0, delay: async (ms) => delays.push(ms) }
      });
    } catch (error) {
      capturedError = error;
    }

    assert.ok(capturedError);
    assert.equal(capturedError.phase, "generation");
    assert.equal(capturedError.category, "service_unavailable");
    assert.equal(capturedError.canResume, true);
    assert.equal(capturedError.generationRunState.status, "generation_failed_retryable");
    assert.equal(capturedError.generationRunState.validatedPlan.plan.typeId, "code_or_command");

    const failedRunState = capturedError.generationRunState;
    const resumeCalls = [];
    globalThis.fetch = async (url, options) => {
      resumeCalls.push({ url, body: JSON.parse(options.body) });
      return makeGeminiTextResponse(JSON.stringify(makeGeneratedCardsPayload()));
    };
    const saved = [];
    const resumed = await resumeGenerationFromValidatedPlan({
      apiKey: "chave",
      model: "gemini-2.5-flash",
      runState: failedRunState,
      retryOptions: { maxAttempts: 1, delay: async () => null },
      saveGeneratedCards: async ({ cards, runState }) => saved.push({ cards, runState })
    });

    assert.equal(resumeCalls.length, 1);
    assert.match(resumeCalls[0].body.contents[0].parts[0].text, /Gere cards para a microssequência/i);
    assert.doesNotMatch(resumeCalls[0].body.contents[0].parts[0].text, /Planeje uma microssequência/i);
    assert.equal(resumed.cards.length, 5);
    assert.equal(resumed.generationRunState.status, "saved");
    assert.equal(saved[0].cards.length, 5);
    assert.equal(saved[0].runState.target.microsequenceKey, "micro");

    assert.equal(calls.length, 3);
    assert.deepEqual(delays, [10]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fallback não ocorre por padrão quando geração recebe 503", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return makeGeminiTextResponse(JSON.stringify(makeMicrosequencePlanPayload()));
    }
    return makeGeminiErrorResponse(503, "High demand.");
  };

  try {
    await assert.rejects(
      () =>
        runGeminiAssist({
          apiKey: "chave",
          mode: "compose-microsequence",
          microsequence: makeComposeMicrosequenceContext(),
          promptText: "explique git add e git push",
          fallbackModelId: "gemini-2.5-flash-lite",
          retryOptions: { maxAttempts: 1, delay: async () => null }
        }),
      (error) => {
        assert.equal(error.canResume, true);
        assert.equal(error.fallbackUsed, false);
        return true;
      }
    );

    assert.ok(calls.every((call) => String(call.url).includes("gemini-2.5-flash:generateContent")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fallback ocorre apenas quando configurado para erro transitório de geração", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return makeGeminiTextResponse(JSON.stringify(makeMicrosequencePlanPayload()));
    }
    if (String(url).includes("gemini-2.5-flash:generateContent")) {
      return makeGeminiErrorResponse(503, "High demand.");
    }
    return makeGeminiTextResponse(JSON.stringify(makeGeneratedCardsPayload()));
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeMicrosequenceContext(),
      promptText: "explique git add e git push",
      fallbackEnabled: true,
      fallbackModelId: "gemini-2.5-flash-lite",
      retryOptions: { maxAttempts: 1, delay: async () => null }
    });

    assert.equal(result.fallbackUsed, true);
    assert.equal(result.modelId, "gemini-2.5-flash-lite");
    assert.ok(calls.some((call) => String(call.url).includes("gemini-2.5-flash-lite:generateContent")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fallback não ocorre em auth_error", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return makeGeminiTextResponse(JSON.stringify(makeMicrosequencePlanPayload()));
    }
    return makeGeminiErrorResponse(403, "Forbidden.");
  };

  try {
    await assert.rejects(
      () =>
        runGeminiAssist({
          apiKey: "chave",
          mode: "compose-microsequence",
          microsequence: makeComposeMicrosequenceContext(),
          promptText: "explique git add e git push",
          fallbackEnabled: true,
          fallbackModelId: "gemini-2.5-flash-lite",
          retryOptions: { maxAttempts: 1, delay: async () => null }
        }),
      (error) => {
        assert.equal(error.category, "auth_error");
        assert.equal(error.canResume, false);
        return true;
      }
    );

    assert.ok(calls.every((call) => String(call.url).includes("gemini-2.5-flash:generateContent")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("erro de planejamento retorna canResume false", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => makeGeminiErrorResponse(400, "Bad request.");

  try {
    await assert.rejects(
      () =>
        runGeminiAssist({
          apiKey: "chave",
          mode: "compose-microsequence",
          microsequence: makeComposeMicrosequenceContext(),
          promptText: "explique git add e git push",
          retryOptions: { maxAttempts: 2, delay: async () => null }
        }),
      (error) => {
        assert.equal(error.phase, "planning");
        assert.equal(error.category, "invalid_request");
        assert.equal(error.canResume, false);
        assert.equal(error.generationRunState, undefined);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("anexa documentos ao Gemini Files API antes de gerar cards", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const attachment = {
    name: "referencia.pdf",
    type: "application/pdf",
    size: 12,
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3, 4]).buffer;
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
      const generateCallCount = calls.filter((call) => String(call.url).includes(":generateContent")).length;
      return makeGeminiTextResponse(
        JSON.stringify(generateCallCount === 1 ? makeMicrosequencePlanPayload() : makeGeneratedCardsPayload())
      );
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
      microsequence: makeComposeMicrosequenceContext(),
      promptText: "explique git add e git push",
      attachments: [attachment]
    });

    assert.equal(result.cards.length, 5);
    assert.equal(calls.length, 5);
    assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/upload/v1beta/files");
    assert.equal(calls[0].options.headers["X-Goog-Upload-Protocol"], "resumable");
    assert.equal(calls[1].url, "https://upload.example/files/abc");
    assert.ok(calls[1].options.body instanceof ArrayBuffer);
    const generateCalls = calls.filter((call) => String(call.url).includes(":generateContent"));
    assert.equal(generateCalls.length, 2);
    const planningBody = JSON.parse(generateCalls[0].options.body);
    assert.deepEqual(planningBody.contents[0].parts[0], {
      file_data: {
        mime_type: "application/pdf",
        file_uri: "https://generativelanguage.googleapis.com/v1beta/files/abc"
      }
    });
    assert.match(planningBody.contents[0].parts[1].text, /Planeje uma microssequência/i);
    const generationBody = JSON.parse(generateCalls[1].options.body);
    assert.deepEqual(generationBody.contents[0].parts[0], planningBody.contents[0].parts[0]);
    assert.match(generationBody.contents[0].parts[1].text, /Gere cards para a microssequência/i);
    const deleteCall = calls.find((call) => call.url === "https://generativelanguage.googleapis.com/v1beta/files/abc");
    assert.equal(deleteCall.options.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("revisa card com contexto explícito de curso, módulo, lição e microssequência", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ title: "Card revisto", say: "Conteúdo revisado." }) }]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "edit-card",
      microsequence: {
        courseTitle: "Programação",
        courseDescription: "Fundamentos.",
        moduleTitle: "Git",
        moduleDescription: "Fluxo básico.",
        lessonTitle: "Commits",
        lessonDescription: "Registrar mudanças.",
        title: "Sequência de commits",
        tags: ["git"]
      },
      card: { key: "card-1", title: "Card atual", say: "Texto antigo" },
      dependencyTitles: ["git", "commit"],
      promptText: "Deixe o texto mais direto."
    });

    const prompt = calls[0].contents[0].parts[0].text;
    assert.match(prompt, /Curso: Programação/);
    assert.match(prompt, /Objetivo do módulo: Fluxo básico\./);
    assert.match(prompt, /Lição: Commits/);
    assert.match(prompt, /Microssequência: Sequência de commits/);
    assert.equal(result.say, "Conteúdo revisado.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aceita JSON do Gemini envolto em bloco markdown", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const payload = calls.length === 1 ? makeMicrosequencePlanPayload() : makeGeneratedCardsPayload();
    return makeGeminiTextResponse("```json\n" + JSON.stringify(payload) + "\n```");
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeMicrosequenceContext(),
      promptText: "explique git add e git push"
    });

    assert.equal(calls.length, 2);
    assert.equal(result.cards.length, 5);
    assert.equal(result.cards[4].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejeita planejamento quando o Gemini devolve JSON ilegível", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return makeGeminiTextResponse("```json\n{\"typeId\":\"simple\",\"cardPlan\":[\n```");
  };

  try {
    await assert.rejects(
      () =>
        runGeminiAssist({
          apiKey: "chave",
          mode: "compose-microsequence",
          microsequence: makeComposeMicrosequenceContext(),
          promptText: "explique git add e git push"
        }),
      (error) => {
        assert.equal(error.phase, "planning");
        assert.equal(error.category, "unknown");
        assert.equal(error.canResume, false);
        assert.match(error.message, /planejamento/);
        return true;
      }
    );

    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("planejamento compacto não envia schema nativo ao Gemini", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return makeGeminiTextResponse(
      JSON.stringify(calls.length === 1 ? makeMicrosequencePlanPayload() : makeGeneratedCardsPayload())
    );
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: makeComposeMicrosequenceContext(),
      promptText: "explique git add e git push"
    });

    assert.equal(calls.length, 2);
    assert.ok(!calls[0].body.generationConfig.responseJsonSchema);
    assert.ok(!calls[1].body.generationConfig.responseJsonSchema);
    assert.equal(calls[1].body.generationConfig.responseMimeType, "application/json");
    assert.equal(result.cards.length, 5);
    assert.equal(result.cards[4].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
