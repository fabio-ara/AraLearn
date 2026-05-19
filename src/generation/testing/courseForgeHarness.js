import { runCourseForge } from "../courseForge/courseForgeRunner.js";
import { ingestCourseForgeAttachments } from "../ingestion/courseForgeAttachmentIngestion.js";
import { createFakeProvider } from "../providers/fakeProvider.js";
import { createProviderRegistry } from "../providers/providerRegistry.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArtifact(artifacts = [], artifactName = "") {
  const match = (Array.isArray(artifacts) ? artifacts : []).find((item) => text(item?.name) === text(artifactName));
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(text(match?.content) || "null");
  } catch {
    return null;
  }
}

function buildLargeStudyCorpus(label = "", repeat = 80) {
  return Array.from({ length: repeat }, (_, index) =>
    `${label} bloco ${index + 1}. Este material explica conceitos centrais, notação, exemplos e erros comuns com frases curtas, mantendo aderência terminológica e foco em estudo progressivo local.`
  ).join("\n\n");
}

function buildLargePropositionCorpus(label = "", repeat = 80) {
  return Array.from({ length: repeat }, (_, index) =>
    `${label} bloco ${index + 1}. Definição: uma proposição é um enunciado que pode ser verdadeiro ou falso. Exemplo: 2 + 2 = 4 é proposição. Contraexemplo: "Feche a porta" e "Que horas são?" não são proposições. Critério: o enunciado precisa admitir valor de verdade para entrar como proposição.`
  ).join("\n\n");
}

function createTextFile(name, content, type = "text/markdown") {
  return {
    name,
    type,
    size: Buffer.byteLength(content, "utf8"),
    async text() {
      return content;
    }
  };
}

async function ingestHarnessAttachments(definition = {}) {
  const files = Array.isArray(definition?.files) ? definition.files : [];
  if (!files.length) {
    return [];
  }
  const result = await ingestCourseForgeAttachments(files);
  return result.attachments;
}

function createTraceableProvider(script = {}) {
  const calls = [];
  const provider = createFakeProvider({ script });
  const callJson = provider.callJson.bind(provider);
  provider.callJson = async (input = {}) => {
    calls.push({
      phaseId: text(input?.phaseId),
      modelId: text(input?.modelId),
      promptLength: String(input?.prompt || "").length,
      promptPreview: String(input?.prompt || "").slice(0, 280)
    });
    return callJson(input);
  };

  return {
    provider,
    calls
  };
}

function createStructureProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: []
  };
}

function createLessonScopedProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-grafos",
        title: "Grafos",
        modules: [
          {
            key: "module-fundamentos",
            title: "Fundamentos",
            lessons: [
              {
                key: "lesson-grafos",
                title: "O que é um grafo",
                description: "Introduz vértices, arestas e leitura básica.",
                sourceGuideStructured: {
                  lessonGoal: "Reconhecer vértices, arestas e leitura básica de grafos.",
                  commonErrors: "Confundir grafo com tabela ou lista solta.",
                  notationRules: "Usar notação curta com V e E."
                },
                domainMap: {
                  items: [
                    { id: "concept-vertice", label: "Vértice", priority: "core" },
                    { id: "concept-aresta", label: "Aresta", priority: "core" }
                  ],
                  practiceVariants: []
                },
                resourceTags: ["graph", "paragraph"],
                contentTypeTags: ["theory"],
                learningActionTags: ["identificar"],
                supportLevel: "guided",
                microsequences: []
              }
            ]
          }
        ]
      }
    ]
  };
}

function createCardsProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-logica",
        title: "Lógica",
        modules: [
          {
            key: "module-base",
            title: "Base",
            lessons: [
              {
                key: "lesson-proposicoes",
                title: "Proposições",
                description: "Lição local para cards.",
                sourceGuideStructured: {
                  lessonGoal: "Reconhecer proposições.",
                  notationRules: "Usar p e q quando necessário.",
                  commonErrors: "Confundir pergunta com proposição."
                },
                resourceTags: ["paragraph", "multiple_choice"],
                contentTypeTags: ["theory"],
                learningActionTags: ["read"],
                supportLevel: "guided",
                microsequences: [
                  {
                    key: "microsequence-revisao",
                    title: "Revisão",
                    description: "Resumo inicial.",
                    didacticPurpose: "Revisar conceito.",
                    coverageRole: "explain",
                    status: "draft",
                    included: false,
                    tags: ["intro"],
                    cards: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function buildStructureArchitecture() {
  return {
    architectureDraft: {
      course: {
        key: "course-grafos",
        title: "Grafos",
        description: "Curso introdutório sobre grafos.",
        sourceGuideStructured: {
          audience: "estudante em revisão curta",
          globalScope: "Ler grafos simples e contar propriedades básicas.",
          globalOutOfScope: "Teoria avançada de grafos.",
          sharedNotation: "Usar V para vértices e E para arestas."
        },
        modules: [
          {
            key: "module-fundamentos",
            title: "Fundamentos",
            description: "Conceitos básicos.",
            sourceGuideStructured: {
              moduleScope: "Conceitos introdutórios e contagem inicial.",
              modulePrerequisites: "Leitura básica de conjuntos e pares.",
              moduleOutOfScope: "Algoritmos avançados.",
              lessonProgression: "Conceito, leitura, contagem."
            },
            lessons: [
              {
                key: "lesson-o-que-e-um-grafo",
                title: "O que é um grafo",
                description: "Introdução a vértices e arestas.",
                sourceGuideStructured: {
                  lessonGoal: "Reconhecer vértices e arestas em exemplos simples.",
                  lessonPrerequisites: "Nenhum além de leitura básica.",
                  notationRules: "Nomear vértices com letras maiúsculas.",
                  commonErrors: "Confundir grafo com lista solta de itens.",
                  masteryGoal: "Ler exemplos simples de grafo."
                }
              },
              {
                key: "lesson-graus-e-contagem",
                title: "Graus e contagem",
                description: "Contagem básica em grafos.",
                sourceGuideStructured: {
                  lessonGoal: "Calcular graus e contar incidências.",
                  lessonPrerequisites: "Reconhecer vértices e arestas.",
                  notationRules: "Usar grau(v) quando necessário.",
                  commonErrors: "Somar arestas sem considerar incidência.",
                  masteryGoal: "Contar graus em exemplos simples."
                }
              }
            ]
          }
        ]
      }
    }
  };
}

function createStructureProviderScript() {
  return {
    plan_architecture: [() => buildStructureArchitecture()],
    audit_architecture: [() => ({ approved: true, blockingIssues: [], warnings: [] })],
    plan_lessons: [
      (input) => {
        const architecture = parseArtifact(input.artifacts, "architecture-final") || parseArtifact(input.artifacts, "architecture-draft");
        const lessons = architecture?.course?.modules?.[0]?.lessons || [];
        return {
          lessons: [
            {
              title: lessons[0]?.title?.replace("é", "e"),
              lessonDescription: lessons[0]?.description,
              learningActionTags: ["identificar"]
            },
            {
              lessonTitle: lessons[1]?.title,
              sourceGuideStructured: {
                lessonGoal: "Calcular graus e contar incidências."
              }
            },
            {
              lessonTitle: lessons[1]?.title,
              learningActionTags: ["repetido"]
            }
          ]
        };
      }
    ],
    audit_course_graph: [() => ({ approved: true, blockingIssues: [], warnings: [] })],
    plan_microsequences: [
      () => ({
        microsequencePlans: [
          {
            lessonTitle: "O que e um grafo",
            microsequences: [
              {
                objective: "Reconhecer vértices e arestas em exemplos simples."
              },
              {
                title: "Reconhecer vértices e arestas em exemplos simples.",
                description: "Duplicata proposital para testar deduplicação."
              }
            ]
          }
        ]
      })
    ],
    audit_microsequences: [() => ({ approved: true, issues: [], warnings: [] })]
  };
}

function createLessonScopedProviderScript() {
  return {
    audit_course_graph: [() => ({ approved: true, blockingIssues: [], warnings: [] })],
    plan_microsequences: [
      () => ({
        microsequences: [
          {
            description: "Leitura orientada do que constitui um grafo.",
            coverageRole: "explain",
            domainRefs: ["concept-vertice", "concept-aresta"]
          },
          {
            title: "Prática de leitura de grafos",
            objective: "Ler grafos pequenos e nomear vértices e arestas.",
            coverageRole: "practice",
            domainRefs: ["concept-vertice", "concept-aresta"]
          }
        ]
      })
    ],
    audit_microsequences: [() => ({ approved: true, issues: [], warnings: [] })]
  };
}

function createTutorProviderScript() {
  return {
    answer_locally: [
      () => ({
        responseText: "Em um grafo, vértice representa um ponto e aresta representa uma ligação.",
        studyTrackConnection: "Isso prepara a leitura de exemplos e a contagem de graus.",
        recommendedAction: "answer_only",
        rationale: "A dúvida cabe em resposta local sem mudar a trilha."
      })
    ]
  };
}

function buildPropositionCards(sourceRefs = ["attachment_1"]) {
  return [
    {
      position: 1,
      resourceType: "paragraph",
      title: "Revisão curta",
      text: "Uma proposição admite valor de verdade.",
      sourceRefs: structuredClone(sourceRefs)
    },
    {
      position: 2,
      resourceType: "paragraph",
      title: "Exemplo curto",
      text: "2 + 2 = 4 é proposição porque pode ser verdadeira ou falsa.",
      sourceRefs: structuredClone(sourceRefs)
    },
    {
      position: 3,
      resourceType: "multiple_choice",
      title: "Checagem",
      question: "Qual frase é proposição?",
      options: [
        { optionId: "a", label: "Feche a porta." },
        { optionId: "b", label: "2 + 2 = 4." },
        { optionId: "c", label: "Que horas são?" }
      ],
      correctOptionId: "b",
      feedback: "2 + 2 = 4 admite valor de verdade.",
      sourceRefs: structuredClone(sourceRefs)
    }
  ];
}

function createCardsProviderScript() {
  return {
    build_cards: [() => ({ cards: buildPropositionCards(["attachment_1"]) })]
  };
}

function createCardsAdherenceRepairProviderScript() {
  return {
    build_cards: [() => ({ cards: buildPropositionCards([{ sourceId: "attachment_1", transformationState: "unsupported" }]) })],
    repair_card_adherence: [() => ({ cards: buildPropositionCards(["attachment_1"]) })]
  };
}

function defaultScenarios() {
  const largePrompt = buildLargeStudyCorpus("Prompt gigante", 120);
  const largeFiles = [
    createTextFile("base-1.md", buildLargeStudyCorpus("Anexo A", 90)),
    createTextFile("base-2.md", buildLargeStudyCorpus("Anexo B", 90)),
    createTextFile("base-3.md", buildLargeStudyCorpus("Anexo C", 90))
  ];

  return [
    {
      id: "structure_project_large_context",
      description: "Top-down completo com prompt e anexos grandes, normalizando lessonPlans e microsequencePlans imperfeitos.",
      projectDocument: createStructureProjectDocument(),
      files: largeFiles,
      intent: {
        scope: { level: "project" },
        promptText: largePrompt,
        selectedTopDownProfileId: "codex_all"
      },
      providerScript: createStructureProviderScript(),
      validate(result, trace) {
        const course = result?.projectDocument?.courses?.[0];
        const lessons = course?.modules?.[0]?.lessons || [];
        const microsequenceCounts = lessons.map((lesson) => Array.isArray(lesson?.microsequences) ? lesson.microsequences.length : 0);
        const maxPromptLength = Math.max(...trace.calls.map((call) => call.promptLength), 0);
        const issues = [];
        if (!course) {
          issues.push("curso não foi criado");
        }
        if (lessons.length !== 2) {
          issues.push(`lições esperadas: 2; recebidas: ${lessons.length}`);
        }
        if (microsequenceCounts.some((count) => count < 1)) {
          issues.push("alguma lição ficou sem microssequência após fallback determinístico");
        }
        if (maxPromptLength > 18000) {
          issues.push(`prompt provider acima do budget esperado: ${maxPromptLength}`);
        }
        return issues;
      }
    },
    {
      id: "structure_lesson_flat_microsequence_shape",
      description: "Escopo de lição aceita payload direto de microsequences sem lessonKey.",
      projectDocument: createLessonScopedProjectDocument(),
      files: [createTextFile("lesson.md", buildLargeStudyCorpus("Lição", 70))],
      intent: {
        scope: {
          level: "lesson",
          courseKey: "course-grafos",
          moduleKey: "module-fundamentos",
          lessonKey: "lesson-grafos"
        },
        promptText: buildLargeStudyCorpus("Pedido de lição", 80),
        selectedTopDownProfileId: "codex_all"
      },
      providerScript: createLessonScopedProviderScript(),
      validate(result, trace) {
        const lesson = result?.projectDocument?.courses?.[0]?.modules?.[0]?.lessons?.[0];
        const microsequences = lesson?.microsequences || [];
        const maxPromptLength = Math.max(...trace.calls.map((call) => call.promptLength), 0);
        const issues = [];
        if (microsequences.length !== 2) {
          issues.push(`microssequências esperadas: 2; recebidas: ${microsequences.length}`);
        }
        if (!text(microsequences[0]?.title)) {
          issues.push("primeira microssequência ficou sem título de fallback");
        }
        if (maxPromptLength > 18000) {
          issues.push(`prompt provider acima do budget esperado: ${maxPromptLength}`);
        }
        return issues;
      }
    },
    {
      id: "tutor_only_large_context",
      description: "Fluxo tutor_only suporta contexto grande sem inflar o prompt do provider.",
      projectDocument: createLessonScopedProjectDocument(),
      files: [createTextFile("duvida.md", buildLargeStudyCorpus("Dúvida", 85))],
      intent: {
        scope: {
          level: "lesson",
          courseKey: "course-grafos",
          moduleKey: "module-fundamentos",
          lessonKey: "lesson-grafos"
        },
        generationDepth: "tutor_only",
        promptText: buildLargeStudyCorpus("Pergunta do aluno", 100),
        selectedTopDownProfileId: "codex_all"
      },
      providerScript: createTutorProviderScript(),
      validate(result, trace) {
        const maxPromptLength = Math.max(...trace.calls.map((call) => call.promptLength), 0);
        const issues = [];
        if (text(result?.interventionResponse?.recommendedAction) !== "answer_only") {
          issues.push("resposta local não retornou recommendedAction esperado");
        }
        if (text(result?.interventionRequest?.status) !== "not_needed") {
          issues.push(`interventionRequest inesperado: ${text(result?.interventionRequest?.status)}`);
        }
        if (maxPromptLength > 16000) {
          issues.push(`prompt tutor acima do budget esperado: ${maxPromptLength}`);
        }
        return issues;
      }
    },
    {
      id: "microsequence_cards_large_context",
      description: "Fluxo local em escopo de microssequência gera cards, grounding e patch sob contexto grande.",
      projectDocument: createCardsProjectDocument(),
      files: [createTextFile("proposicoes.md", buildLargePropositionCorpus("Proposições", 95))],
      intent: {
        operation: "repair",
        scope: {
          level: "microsequence",
          courseKey: "course-logica",
          moduleKey: "module-base",
          lessonKey: "lesson-proposicoes",
          microsequenceKey: "microsequence-revisao"
        },
        promptText: buildLargeStudyCorpus("Pedido de cards", 90),
        selectedTopDownProfileId: "codex_all"
      },
      providerScript: createCardsProviderScript(),
      validate(result, trace) {
        const lesson = result?.projectDocument?.courses?.[0]?.modules?.[0]?.lessons?.[0];
        const microsequence = (lesson?.microsequences || []).find((item) => text(item?.key) === "microsequence-revisao") || null;
        const cards = microsequence?.cards || [];
        const maxPromptLength = Math.max(...trace.calls.map((call) => call.promptLength), 0);
        const issues = [];
        if (cards.length !== 3) {
          issues.push(`cards esperados: 3; recebidos: ${cards.length}`);
        }
        if (trace.calls.some((call) => call.phaseId === "repair_card_adherence")) {
          issues.push("o cenário de cards já grounded não deveria precisar de repair_card_adherence");
        }
        if (maxPromptLength > 16000) {
          issues.push(`prompt de cards acima do budget esperado: ${maxPromptLength}`);
        }
        return issues;
      }
    },
    {
      id: "microsequence_cards_adherence_repair_large_context",
      description: "Fluxo local em escopo de microssequência aciona repair_card_adherence sob contexto grande e conclui com grounding completo.",
      projectDocument: createCardsProjectDocument(),
      files: [createTextFile("proposicoes-exercicios.md", buildLargePropositionCorpus("Lista de proposições", 100))],
      intent: {
        operation: "repair",
        scope: {
          level: "microsequence",
          courseKey: "course-logica",
          moduleKey: "module-base",
          lessonKey: "lesson-proposicoes",
          microsequenceKey: "microsequence-revisao"
        },
        promptText: buildLargeStudyCorpus("Pedido de reparo de grounding", 90),
        selectedTopDownProfileId: "codex_all"
      },
      providerScript: createCardsAdherenceRepairProviderScript(),
      validate(result, trace) {
        const lesson = result?.projectDocument?.courses?.[0]?.modules?.[0]?.lessons?.[0];
        const microsequence = (lesson?.microsequences || []).find((item) => text(item?.key) === "microsequence-revisao") || null;
        const cards = microsequence?.cards || [];
        const maxPromptLength = Math.max(...trace.calls.map((call) => call.promptLength), 0);
        const issues = [];
        if (cards.length !== 3) {
          issues.push(`cards esperados após repair_card_adherence: 3; recebidos: ${cards.length}`);
        }
        if (!trace.calls.some((call) => call.phaseId === "repair_card_adherence")) {
          issues.push("o cenário de repair_card_adherence não acionou a fase esperada");
        }
        if (cards.some((card) => !Array.isArray(card?.sourceRefs) || !card.sourceRefs.length)) {
          issues.push("algum card permaneceu sem sourceRefs após repair_card_adherence");
        }
        if (maxPromptLength > 16000) {
          issues.push(`prompt de reparo de grounding acima do budget esperado: ${maxPromptLength}`);
        }
        return issues;
      }
    }
  ];
}

export async function runCourseForgeHarnessScenario(definition = {}) {
  const attachments = await ingestHarnessAttachments(definition);
  const { provider, calls } = createTraceableProvider(definition.providerScript || {});
  const registry = createProviderRegistry({ providers: [provider] });

  try {
    const result = await runCourseForge({
      intent: {
        ...(definition.intent || {}),
        attachments
      },
      projectDocument: structuredClone(definition.projectDocument || {}),
      providerRegistry: registry,
      providerId: "fake"
    });
    const issues = typeof definition.validate === "function" ? definition.validate(result, { calls }) : [];
    return {
      id: text(definition.id),
      description: text(definition.description),
      ok: issues.length === 0,
      issues,
      trace: {
        calls,
        maxPromptLength: Math.max(...calls.map((call) => call.promptLength), 0)
      },
      result
    };
  } catch (error) {
    return {
      id: text(definition.id),
      description: text(definition.description),
      ok: false,
      issues: [text(error?.message) || "Falha no harness."],
      trace: {
        calls,
        maxPromptLength: Math.max(...calls.map((call) => call.promptLength), 0)
      },
      error
    };
  }
}

export async function runDefaultCourseForgeHarness() {
  const scenarios = defaultScenarios();
  const results = [];
  for (const scenario of scenarios) {
    results.push(await runCourseForgeHarnessScenario(scenario));
  }
  return {
    scenarioCount: scenarios.length,
    results,
    failed: results.filter((result) => !result.ok)
  };
}
