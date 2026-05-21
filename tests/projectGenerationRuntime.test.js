import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import {
  generateMicrosequenceProjectDocument,
  generateStructureProjectDocument
} from "../src/generation/runtime/projectGenerationRuntime.js";

function createProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        goal: "Formar base em arquitetura básica.",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            include: [
              { id: "scope-pipeline", label: "pipeline de cinco estágios" },
              { id: "scope-ir", label: "registrador de instruções" }
            ],
            exclude: [{ id: "scope-spec", label: "desvio especulativo" }],
            assessmentStyle: "mixed",
            lessons: [
              {
                key: "lesson-a",
                title: "Lição A",
                goal: "Explicar o caminho básico da instrução.",
                description: "Base da lição.",
                sourceGuideStructured: {
                  lessonGoal: "Explicar o conceito atual sem pressupor notação anterior não explicitada.",
                  notationRules: "Explique siglas antes do uso autônomo.",
                  commonErrors: "Não antecipar mecanismos fora do ciclo básico."
                },
                microsequences: [
                  {
                    key: "micro-prev",
                    title: "Base anterior",
                    goal: "Retomar o registrador de instruções.",
                    description: "Pré-requisito já explicitado.",
                    status: "ready",
                    included: true,
                    tags: ["Base", "Pré-requisito"],
                    scopeRefs: ["scope-ir"],
                    cards: []
                  },
                  {
                    key: "micro-a",
                    title: "Microssequência A",
                    goal: "Relacionar PC e IR ao ciclo básico.",
                    description: "Versão atual.",
                    tags: ["PC", "IR"],
                    dependsOn: ["micro-prev"],
                    scopeRefs: ["scope-pipeline", "scope-ir"],
                    status: "draft",
                    included: false,
                    cards: []
                  },
                  {
                    key: "micro-next",
                    title: "Microssequência Seguinte",
                    goal: "Preparar a próxima etapa do ciclo.",
                    description: "Próxima etapa planejada.",
                    tags: ["CPU"],
                    scopeRefs: ["scope-pipeline"],
                    status: "draft",
                    included: false,
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

test("generateStructureProjectDocument preserva keys existentes no alvo fixo", async () => {
  const provider = createFakeProvider({
    script: {
      "infer-scope-contract": {
        course: { title: "Curso A", evidencePriority: ["none"] },
        modules: [
          {
            title: "Módulo A",
            include: ["Lição A", "Estrutura básica"],
            exclude: [],
            notes: 'Planeje apenas a lição "Lição A".',
            assessmentStyle: "mixed"
          }
        ]
      },
      "plan-scope": {
        course: {
          title: "Curso A",
          modules: [
            {
              title: "Módulo A",
              lessons: [
                {
                  title: "Lição A",
                  goal: "Objetivo da lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Fixar o objetivo operacional da lição.",
                    notationRules: "Lição A, Estrutura básica",
                    commonErrors: "Não confundir o conceito atual com etapas futuras."
                  },
                  microsequences: [
                    {
                      title: "Microssequência A",
                      goal: "Reaproveitar a etapa existente.",
                      dependsOnTitles: [],
                      scopeLabels: ["Lição A"]
                    },
                    {
                      title: "Microssequência B",
                      goal: "Nova etapa planejada.",
                      dependsOnTitles: ["Microssequência A"],
                      scopeLabels: ["Estrutura básica"]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  });

  const result = await generateStructureProjectDocument({
    draft: {
      courseFixed: true,
      courseInput: "Curso A",
      courseKey: "course-a",
      moduleFixed: true,
      moduleInput: "Módulo A",
      moduleKey: "module-a",
      lessonFixed: true,
      lessonInput: "Lição A",
      lessonKey: "lesson-a",
      includeTopics: ["Lição A", "Estrutura básica"],
      promptText: "Planeje a lição."
    },
    scopeState: {
      course: { key: "course-a", title: "Curso A" },
      moduleValue: { key: "module-a", title: "Módulo A" },
      lesson: { key: "lesson-a", title: "Lição A" }
    },
    projectDocument: createProjectDocument(),
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    ingestAttachments: async () => ({ attachments: [], warnings: [], extractedCount: 0 }),
    provider
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(result.patch.target.courseKey, "course-a");
  assert.equal(result.patch.target.moduleKey, "module-a");
  assert.equal(result.patch.target.lessonKey, "lesson-a");
  assert.equal(lesson.key, "lesson-a");
  assert.equal(lesson.goal, "Objetivo da lição.");
  assert.deepEqual(lesson.sourceGuideStructured, {
    lessonGoal: "Fixar o objetivo operacional da lição.",
    notationRules: "Lição A, Estrutura básica",
    commonErrors: "Não confundir o conceito atual com etapas futuras."
  });
  assert.equal(lesson.microsequences[0].key, "micro-prev");
  assert.equal(lesson.microsequences[1].key, "micro-a");
  assert.equal(lesson.microsequences[1].goal, "Reaproveitar a etapa existente.");
  assert.deepEqual(lesson.microsequences[2].dependsOn, ["micro-a"]);
  assert.equal(lesson.microsequences[2].title, "Microssequência B");
  assert.equal(lesson.microsequences[2].goal, "Nova etapa planejada.");
});

test("generateStructureProjectDocument preserva microssequências prontas fora do recorte replanejado", async () => {
  const provider = createFakeProvider({
    script: {
      "infer-scope-contract": {
        course: { title: "Curso A", evidencePriority: ["none"] },
        modules: [
          {
            title: "Módulo A",
            include: ["PC", "IR", "Memória"],
            exclude: [],
            notes: 'Planeje apenas o restante da lição "Lição A".',
            assessmentStyle: "mixed"
          }
        ]
      },
      "plan-scope": {
        course: {
          title: "Curso A",
          modules: [
            {
              title: "Módulo A",
              lessons: [
                {
                  title: "Lição A",
                  goal: "Objetivo atualizado da lição.",
                  sourceGuideStructured: {
                    lessonGoal: "Conectar PC, IR e memória em ordem didática.",
                    notationRules: "PC, IR, Memória",
                    commonErrors: "Não inverter o papel de PC e IR.",
                    outOfScopeRules: "desvio especulativo"
                  },
                  microsequences: [
                    {
                      title: "Microssequência A",
                      goal: "Relacionar PC e IR.",
                      dependsOnTitles: [],
                      scopeLabels: ["PC", "IR"]
                    },
                    {
                      title: "Microssequência B",
                      goal: "Explicar busca na memória.",
                      dependsOnTitles: ["Microssequência A"],
                      scopeLabels: ["Memória"]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  });

  const projectDocument = createProjectDocument();
  projectDocument.courses[0].modules[0].lessons[0].microsequences[0].cards = [
    { key: "seed-prev", title: "Base", say: "Conteúdo já estudado." }
  ];
  projectDocument.courses[0].modules[0].lessons[0].microsequences[0].status = "ready";
  projectDocument.courses[0].modules[0].lessons[0].microsequences[0].included = true;

  const result = await generateStructureProjectDocument({
    draft: {
      courseFixed: true,
      courseInput: "Curso A",
      courseKey: "course-a",
      moduleFixed: true,
      moduleInput: "Módulo A",
      moduleKey: "module-a",
      lessonFixed: true,
      lessonInput: "Lição A",
      lessonKey: "lesson-a",
      includeTopics: ["PC", "IR", "Memória"],
      promptText: "Planeje a continuação da lição sem apagar a base pronta."
    },
    scopeState: {
      course: { key: "course-a", title: "Curso A" },
      moduleValue: { key: "module-a", title: "Módulo A" },
      lesson: { key: "lesson-a", title: "Lição A" }
    },
    projectDocument,
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    ingestAttachments: async () => ({ attachments: [], warnings: [], extractedCount: 0 }),
    provider
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(lesson.microsequences[0].key, "micro-prev");
  assert.equal(lesson.microsequences[0].status, "ready");
  assert.equal(lesson.microsequences[0].included, true);
  assert.equal(lesson.microsequences[0].cards.length, 1);
  assert.equal(lesson.microsequences[1].title, "Microssequência A");
  assert.equal(lesson.microsequences[2].title, "Microssequência B");
  assert.deepEqual(lesson.microsequences[2].dependsOn, [lesson.microsequences[1].key]);
});

test("generateMicrosequenceProjectDocument atualiza cards diretamente no contrato da UI antiga", async () => {
  const provider = createFakeProvider({
    script: {
      "answer-local-doubt": (request) => {
        assert.match(request.prompt, /selectedLessonTopicRefs/);
        assert.match(request.prompt, /studyTrackPolicy/);
        assert.match(request.prompt, /Não entendi PC e IR/);
        assert.match(request.prompt, /Formar base em arquitetura básica/);
        assert.match(request.prompt, /Explicar o caminho básico da instrução/);
        assert.match(request.prompt, /Relacionar PC e IR ao ciclo básico/);
        assert.match(request.prompt, /pipeline de cinco estágios/);
        assert.match(request.prompt, /registrador de instruções/);
        assert.match(request.prompt, /desvio especulativo/);
        assert.match(request.prompt, /micro-prev/);
        assert.match(request.prompt, /Pré-requisito/);
        assert.match(request.prompt, /Tabela/);
        assert.match(request.prompt, /anexo relevante sobre PC e IR/);
        return {
          summary: "Primeira versão.",
          cards: [
            { key: "card-1", position: 1, resourceType: "say", content: "PC e IR localizados no ciclo atual." },
            { key: "card-2", position: 2, resourceType: "code", content: { intro: "Exemplo mínimo.", code: "echo ok", language: "bash" } },
            { key: "card-3", position: 3, resourceType: "say", content: "A prática usa apenas o contexto já aberto." },
            { key: "card-4", position: 4, resourceType: "block_gap_fill", content: "Complete: o teste local usa [[echo ok::echo ok|echo no]]." }
          ]
        };
      }
    }
  });

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Não entendi PC e IR. Gere os primeiros cards.",
      operationMode: "reinforce",
      interventionTargetMode: "current",
      attachments: [{ name: "apoio.md" }]
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: createProjectDocument(),
    provider,
    dependencyTitles: ["Pré-requisito"],
    selectedDidacticTypeId: "explain",
    preferredContainerLabel: "Tabela",
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({ ...item, contentText: "anexo relevante sobre PC e IR" })),
      extractedCount: 1,
      warnings: []
    })
  });

  const microsequence = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1];
  assert.equal(microsequence.key, "micro-a");
  assert.equal(microsequence.status, "ready");
  assert.equal(microsequence.included, true);
  assert.equal(microsequence.cards.length, 4);
  assert.deepEqual(microsequence.dependsOn, ["micro-prev"]);
  assert.equal(result.interventionFeedback.status, "completed");
});

test("generateMicrosequenceProjectDocument entrega artefato avaliável na geração normal", async () => {
  const provider = createFakeProvider({
    script: {
      "normal_generation-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Explicar o ponto local.",
            inCardContext: ["PC e IR no ciclo básico"],
            usesDependency: [],
            expectedEvidence: ["distinguir PC e IR"]
          },
          {
            role: "guided_example",
            resourceType: "say",
            purpose: "Dar exemplo curto.",
            inCardContext: ["busca de instrução"],
            usesDependency: [],
            expectedEvidence: ["relacionar PC à próxima instrução"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Checar reconhecimento.",
            inCardContext: ["frase com lacuna"],
            usesDependency: [],
            expectedEvidence: ["completar PC"]
          },
          {
            role: "bridge_or_consolidation",
            resourceType: "say",
            purpose: "Fechar e voltar à trilha.",
            inCardContext: ["retorno ao objetivo"],
            usesDependency: [],
            expectedEvidence: ["retomar a trilha"]
          }
        ],
        coverageNotes: ["Geração normal com teoria, exemplo, prática e fechamento separados."],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "generate-microsequence": {
        summary: "Versão inicial separada em cards avaliáveis.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "PC aponta a próxima instrução; IR guarda a instrução atual." },
          { key: "card-2", position: 2, resourceType: "say", content: "Exemplo: durante a busca, o endereço indicado pelo PC orienta a leitura na memória." },
          { key: "card-3", position: 3, resourceType: "block_gap_fill", content: "Complete: o registrador que aponta a próxima instrução é o [[PC::PC|IR]]." },
          { key: "card-4", position: 4, resourceType: "say", content: "Com isso, retome a trilha principal da microssequência." }
        ]
      }
    }
  });

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Gere a versão inicial da microssequência.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: createProjectDocument(),
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const microsequence = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1];
  assert.equal(result.interventionFeedback.status, "completed");
  assert.equal(microsequence.status, "ready");
  assert.equal(microsequence.included, true);
  assert.equal(microsequence.cards.length, 4);
  assert.match(microsequence.cards[2].say, /registrador que aponta/i);
});

test("generateMicrosequenceProjectDocument cria suporte adjacente sem quebrar a trilha planejada", async () => {
  const provider = createFakeProvider({
    script: {
      "create-support": {
        title: "Microssequência de apoio",
        goal: "Explicar a base local antes da continuação.",
        supportReason: "Lacuna prévia local",
        summary: "Ponte curta.",
        cards: [
          { key: "card-1", resourceType: "say", content: "Primeiro apoio." },
          { key: "card-2", resourceType: "say", content: "Segundo apoio." },
          { key: "card-3", resourceType: "say", content: "Terceiro apoio." },
          { key: "card-4", resourceType: "say", content: "Retorne à trilha principal." }
        ]
      }
    }
  });

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Crie uma ponte curta antes de seguir.",
      operationMode: "reinforce",
      interventionTargetMode: "new_after_current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: createProjectDocument(),
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const microsequences = result.projectDocument.courses[0].modules[0].lessons[0].microsequences;
  assert.equal(microsequences[2].title, "Microssequência de apoio");
  assert.equal(microsequences[2].type, "support");
  assert.equal(microsequences[2].parentMicrosequenceKey, "micro-a");
  assert.equal(microsequences[2].returnToMicrosequenceKey, "micro-a");
  assert.equal(microsequences[2].supportReason, "Lacuna prévia local");
  assert.equal(microsequences[2].branchPolicy, "must_return_to_planned_track");
  assert.equal(microsequences[2].didacticPurpose, "Explicar a base local antes da continuação.");
  assert.equal(microsequences[2].didacticKind, "concept");
  assert.equal(microsequences[2].practiceMode, "explanation");
  assert.equal(microsequences[2].representationNeed, "text");
  assert.equal(microsequences[2].dependencyPolicy, "uses_previous");
  assert.equal(microsequences[2].coverageRole, "repair_gap");
  assert.deepEqual(microsequences[2].expectedEvidence, ["explicar como o apoio permite retomar Microssequência A"]);
  assert.deepEqual(microsequences[2].dependsOn, ["micro-prev"]);
  assert.deepEqual(microsequences[2].tags, ["PC", "IR"]);
  assert.equal(microsequences[3].key, "micro-next");
  assert.equal(result.route.canonicalRoute, "create_support_branch");
  assert.equal(result.interventionFeedback.status, "completed");
  assert.equal(result.interventionFeedback.recommendedActionIntent, "continue_current");
  assert.equal(result.interventionFeedback.continuationMode, "same_microsequence");
  assert.match(result.interventionFeedback.nextPromptDraft, /Retome a trilha principal/i);
  assert.match(result.interventionFeedback.nextPromptDraft, /Microssequência A/i);
});

test("generateMicrosequenceProjectDocument rejeita suporte com termo excluído e corrige com retry", async () => {
  const provider = createFakeProvider({
    script: {
      "create-support": [
        {
          title: "Apoio com deriva",
          goal: "Explicar a base local.",
          supportReason: "Lacuna local",
          summary: "Apoio inicial.",
          cards: [
            { key: "card-1", resourceType: "say", content: "Primeiro apoio." },
            { key: "card-2", resourceType: "say", content: "Não precisamos falar de desvio especulativo aqui." },
            { key: "card-3", resourceType: "say", content: "Terceiro apoio." },
            { key: "card-4", resourceType: "say", content: "Retorne à trilha principal." }
          ]
        },
        (request) => {
          assert.match(request.prompt, /desvio especulativo/);
          assert.match(request.prompt, /Remova totalmente estes termos excluídos/);
          return {
            title: "Apoio sem deriva",
            goal: "Explicar a base local.",
            supportReason: "Lacuna local",
            summary: "Apoio corrigido.",
            cards: [
              { key: "card-1", resourceType: "say", content: "Primeiro apoio dentro do escopo." },
              { key: "card-2", resourceType: "say", content: "Separe apenas a base necessária para a etapa atual." },
              { key: "card-3", resourceType: "block_gap_fill", content: "Complete: este apoio prepara a [[trilha principal::trilha principal|deriva]]." },
              { key: "card-4", resourceType: "say", content: "Volte agora para a trilha principal da microssequência." }
            ]
          };
        }
      ]
    }
  });

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Crie uma ponte curta antes de seguir.",
      operationMode: "reinforce",
      interventionTargetMode: "new_after_current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: createProjectDocument(),
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const supported = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[2];
  assert.equal(supported.title, "Apoio sem deriva");
  assert.doesNotMatch(JSON.stringify(supported), /desvio especulativo/i);
  assert.deepEqual(supported.dependsOn, ["micro-prev"]);
});

test("generateMicrosequenceProjectDocument usa fallback determinístico quando o suporte vem incompleto", async () => {
  const provider = createFakeProvider({
    script: {
      "create-support": {
        title: "",
        goal: "",
        supportReason: "",
        summary: "",
        cards: []
      }
    }
  });

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Explique o pré-requisito local e depois volte.",
      operationMode: "reinforce",
      interventionTargetMode: "new_after_current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: createProjectDocument(),
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const supported = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[2];
  assert.match(supported.title, /Apoio local para/);
  assert.equal(supported.type, "support");
  assert.equal(supported.cards.length, 5);
  assert.match(supported.cards[4].say, /volte agora para/i);
});

test("generateMicrosequenceProjectDocument materializa intro textual para graph e table", async () => {
  const provider = createFakeProvider({
    script: {
      "generate-microsequence": {
        summary: "Versão inicial com estrutura visual.",
        cards: [
          {
            key: "card-1",
            position: 1,
            resourceType: "graph",
            content: {
              vertices: [
                { id: "CPU", label: "CPU" },
                { id: "MEM", label: "Memória" }
              ],
              edges: [
                { from: "MEM", to: "CPU", label: "Busca de instrução\n e leitura de dados" }
              ]
            }
          },
          {
            key: "card-2",
            position: 2,
            resourceType: "table",
            content: {
              columns: ["Componente", "Função"],
              rows: [["CPU", "Processa"], ["Memória", "Armazena temporariamente"]]
            }
          },
          {
            key: "card-3",
            position: 3,
            resourceType: "block_gap_fill",
            content: "Complete: [[CPU::CPU|RAM]]."
          },
          {
            key: "card-4",
            position: 4,
            resourceType: "say",
            content: "Fechamento da etapa."
          }
        ]
      }
    }
  });

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Gere uma versão inicial muito didática com prática básica.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: createProjectDocument(),
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards;
  assert.match(cards[0].say, /Relações:/);
  assert.match(cards[1].say, /Colunas:/);
  assert.equal(cards[0].graph.edges[0].label, "Busca de instrução e leitura de dados");
});

test("generateMicrosequenceProjectDocument devolve orientação de continuação quando o draft pede nova iteração", async () => {
  const provider = createFakeProvider({
    script: {
      "add_practice-draft": (request) => {
        assert.match(request.prompt, /"density": "deep"/);
        assert.match(request.prompt, /pipeline de cinco estágios/);
        return {
          steps: [
            {
              role: "microtheory",
              resourceType: "say",
              purpose: "Retomar o núcleo local.",
              inCardContext: ["critério local"],
              usesDependency: [],
              expectedEvidence: ["explicar o critério"]
            },
            {
              role: "active_practice",
              resourceType: "block_gap_fill",
              purpose: "Cobrar uso imediato.",
              inCardContext: ["dados do exercício"],
              usesDependency: [],
              expectedEvidence: ["aplicar o procedimento"]
            }
          ],
          coverageNotes: ["Abrir continuação para variação adicional."],
          continuationNeeded: true,
          continuationReason: "Ainda falta prática variada para consolidar a aplicação.",
          continuationMode: "same_microsequence",
          continuationPrompt: "Continue a mesma microssequência com novas variações autossuficientes de prática."
        };
      },
      "add-practice": {
        summary: "Prática distribuída com variação.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "Retomada local." },
          { key: "card-2", position: 2, resourceType: "block_gap_fill", content: "Complete: [[echo ok::echo ok|echo no]]." },
          { key: "card-3", position: 3, resourceType: "block_gap_fill", content: "Agora varie: [[echo yes::echo yes|echo no]]." },
          { key: "card-4", position: 4, resourceType: "say", content: "Feche a variação e siga a trilha." }
        ]
      }
    }
  });

  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[1].status = "ready";
  project.courses[0].modules[0].lessons[0].microsequences[1].included = true;
  project.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    { key: "seed-card", title: "Base", say: "Base local." }
  ];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Continue com prática variada.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    density: "deep",
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  assert.equal(result.interventionFeedback.status, "needs_continue_here");
  assert.equal(result.interventionFeedback.recommendedActionIntent, "continue_current");
  assert.match(result.interventionFeedback.nextPromptDraft, /novas variações autossuficientes/);
  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards;
  assert.equal(cards.length, 5);
  assert.equal(cards[0].key, "seed-card");
  assert.match(cards[0].say, /Base local/);
  assert.match(cards[1].say, /Retomada local/);
});

test("generateMicrosequenceProjectDocument usa fallback determinístico quando a compilação bottom-up segue inválida", async () => {
  let compileCalls = 0;
  const provider = createFakeProvider({
    script: {
      "normal_generation-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Explicar o ponto local.",
            inCardContext: ["PC e IR no ciclo básico"],
            usesDependency: [],
            expectedEvidence: ["distinguir PC e IR"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Checar reconhecimento.",
            inCardContext: ["frase com lacuna"],
            usesDependency: [],
            expectedEvidence: ["completar PC"]
          },
          {
            role: "bridge_or_consolidation",
            resourceType: "say",
            purpose: "Fechar e voltar à trilha.",
            inCardContext: ["retorno ao objetivo"],
            usesDependency: [],
            expectedEvidence: ["retomar a trilha"]
          }
        ],
        coverageNotes: ["Plano separado por função didática."],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "generate-microsequence": Array.from({ length: 5 }, () => () => {
        compileCalls += 1;
        throw new Error("compilação indisponível");
      })
    }
  });

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Gere a versão inicial da microssequência.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: createProjectDocument(),
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards;
  assert.equal(compileCalls, 5);
  assert.equal(result.interventionFeedback.status, "completed");
  assert.equal(cards.length, 3);
  assert.match(cards[0].say, /contador de programa|PC/i);
  assert.match(cards[1].say, /Complete:/i);
  assert.doesNotMatch(cards[1].say, /\[\[/);
  assert.doesNotMatch(cards.map((card) => card.say || "").join("\n"), /outro elemento|um detalhe lateral|Compare os elementos mínimos/i);
  assert.match(cards[2].say, /trilha principal/i);
});

test("generateMicrosequenceProjectDocument prioriza resposta local e remove fallback fraco ao responder dúvida", async () => {
  const provider = createFakeProvider({
    script: {
      "answer-local-doubt-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Responder a dúvida local.",
            inCardContext: ["diferença entre PC e IR"],
            usesDependency: [],
            expectedEvidence: ["explicar a diferença"]
          },
          {
            role: "bridge_or_consolidation",
            resourceType: "say",
            purpose: "Voltar à trilha.",
            inCardContext: ["retorno à trilha"],
            usesDependency: [],
            expectedEvidence: ["retomar a trilha"]
          }
        ],
        coverageNotes: ["Resposta local curta com retorno à trilha."],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "answer-local-doubt": {
        summary: "Esclarecimento local sem apagar a trilha.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "PC indica o próximo endereço; IR guarda a instrução atual." },
          { key: "card-2", position: 2, resourceType: "say", content: "Com a dúvida local fechada, retome agora a trilha principal da microssequência." }
        ]
      }
    }
  });

  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[1].status = "ready";
  project.courses[0].modules[0].lessons[0].microsequences[1].included = true;
  project.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    { key: "fallback-card-1", title: "Base fraca", say: "Complete: nesta etapa, [[Papel do contador de programa (PC)::Papel do contador de programa (PC)|outro elemento]]." },
    { key: "seed-card", title: "Base", say: "Base local já aberta." }
  ];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Não entendi a diferença local entre PC e IR.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards;
  assert.equal(result.route.canonicalRoute, "extend_current");
  assert.equal(cards.length, 3);
  assert.match(cards[0].say, /PC indica o próximo endereço/);
  assert.match(cards[1].say, /retome agora a trilha principal/i);
  assert.match(cards[2].say, /Base local já aberta/);
  assert.doesNotMatch(cards.map((card) => card.say || "").join("\n"), /outro elemento|fallback/i);
});

test("generateMicrosequenceProjectDocument saneia duplicação de chaves e contagem em add_practice", async () => {
  const provider = createFakeProvider({
    script: {
      "add_practice-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Retomar o núcleo local.",
            inCardContext: ["PC e IR"],
            usesDependency: [],
            expectedEvidence: ["explicar a diferença"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Checar reconhecimento.",
            inCardContext: ["frase com lacuna"],
            usesDependency: [],
            expectedEvidence: ["identificar PC"]
          }
        ],
        coverageNotes: [],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "add-practice": {
        summary: "Prática extra.",
        cards: [
          { key: "fallback-card-1", position: 1, resourceType: "say", content: "Base local já aberta." },
          { key: "fallback-card-1", position: 2, resourceType: "block_gap_fill", content: "Complete: [[PC::PC|IR]]." },
          { key: "fallback-card-2", position: 3, resourceType: "block_gap_fill", content: "Complete: [[IR::IR|PC]]." }
        ]
      }
    }
  });

  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[1].status = "ready";
  project.courses[0].modules[0].lessons[0].microsequences[1].included = true;
  project.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    { key: "fallback-card-1", title: "Base", say: "Base local já aberta." }
  ];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Acrescente mais prática variada.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards;
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map((card) => card.key)).size, cards.length);
  assert.match(result.interventionFeedback.message, /ficou com 3 cards no total/);
});

test("generateMicrosequenceProjectDocument usa continuação conservadora quando o draft intermediário falha em add_practice", async () => {
  const provider = createFakeProvider({
    script: {
      "add_practice-draft": () => {
        throw new Error("draft indisponível");
      },
      "add-practice": {
        summary: "Nova prática incremental.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "Retomada local curta." },
          { key: "card-2", position: 2, resourceType: "block_gap_fill", content: "Complete: [[IR::IR|PC]]." },
          { key: "card-3", position: 3, resourceType: "block_gap_fill", content: "Varie: [[PC::PC|IR]]." }
        ]
      }
    }
  });

  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[1].status = "ready";
  project.courses[0].modules[0].lessons[0].microsequences[1].included = true;
  project.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    { key: "seed-card", title: "Base", say: "Base local já aberta." }
  ];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Acrescente mais prática básica.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  assert.equal(result.interventionFeedback.status, "needs_continue_here");
  assert.match(result.interventionFeedback.nextPromptDraft, /nova prática autossuficiente/i);
  const practiceCards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards.filter((card) =>
    /Complete|Varie/i.test(card.say || "")
  );
  assert.equal(practiceCards.length, 2);
});

test("generateMicrosequenceProjectDocument preenche a próxima microssequência planejada quando a ação é next_planned", async () => {
  const provider = createFakeProvider({
    script: {
      "normal_generation-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Abrir a próxima etapa.",
            inCardContext: ["próxima etapa do ciclo"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["explicar a próxima etapa"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Checar compreensão.",
            inCardContext: ["lacuna guiada"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["identificar a próxima etapa"]
          },
          {
            role: "bridge_or_consolidation",
            resourceType: "say",
            purpose: "Fechar a etapa.",
            inCardContext: ["continuidade da trilha"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["seguir a trilha"]
          }
        ],
        coverageNotes: ["Preenchimento da próxima etapa planejada."],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "generate-microsequence": {
        summary: "Próxima microssequência preenchida.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "A próxima etapa retoma a base anterior antes de avançar." },
          { key: "card-2", position: 2, resourceType: "block_gap_fill", content: "Complete: esta etapa continua a [[Microssequência Seguinte::Microssequência Seguinte|Base anterior]]." },
          { key: "card-3", position: 3, resourceType: "say", content: "Com isso, a trilha principal segue para a etapa planejada." }
        ]
      }
    }
  });

  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[1].status = "ready";
  project.courses[0].modules[0].lessons[0].microsequences[1].included = true;
  project.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    { key: "seed-card", title: "Base", say: "Base local já consolidada." }
  ];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "",
      actionIntent: "next_planned",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(result.route.canonicalRoute, "generate_planned_next");
  assert.equal(result.target.microsequenceKey, "micro-next");
  assert.equal(lesson.microsequences[1].cards.length, 1);
  assert.equal(lesson.microsequences[2].status, "ready");
  assert.equal(lesson.microsequences[2].cards.length, 3);
  assert.match(lesson.microsequences[2].cards[0].say, /próxima etapa/i);
});

test("generateMicrosequenceProjectDocument sinaliza bloqueio explícito quando a próxima depende da atual", async () => {
  const provider = createFakeProvider({ script: {} });
  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[2].dependsOn = ["micro-a"];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "",
      actionIntent: "next_planned",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  assert.equal(result.route.canonicalRoute, "generate_planned_next");
  assert.equal(result.blockedBy, "micro-a");
  assert.equal(result.interventionFeedback.status, "blocked");
  assert.match(result.interventionFeedback.feedbackText, /Antes de avançar/i);
  assert.deepEqual(result.projectDocument, project);
});

test("generateMicrosequenceProjectDocument avança para próxima planejada quando a atual tem cards úteis", async () => {
  const provider = createFakeProvider({
    script: {
      "normal_generation-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Abrir a etapa seguinte.",
            inCardContext: ["continuidade planejada"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["explicar a etapa seguinte"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Checar avanço.",
            inCardContext: ["lacuna"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["identificar a etapa seguinte"]
          }
        ],
        coverageNotes: [],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "generate-microsequence": {
        summary: "Etapa seguinte preenchida.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "A próxima etapa usa a base já praticada." },
          { key: "card-2", position: 2, resourceType: "block_gap_fill", content: "Complete: agora a trilha preenche a [[Microssequência Seguinte::Microssequência Seguinte|Microssequência A]]." }
        ]
      }
    }
  });
  const project = createProjectDocument();
  const current = project.courses[0].modules[0].lessons[0].microsequences[1];
  current.status = "draft";
  current.included = true;
  current.cards = [{ key: "card-1", say: "Conteúdo útil já gerado na etapa atual." }];
  project.courses[0].modules[0].lessons[0].microsequences[2].dependsOn = ["micro-a"];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "",
      actionIntent: "next_planned",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(result.route.canonicalRoute, "generate_planned_next");
  assert.equal(result.target.microsequenceKey, "micro-next");
  assert.equal(lesson.microsequences[1].cards.length, 1);
  assert.equal(lesson.microsequences[2].status, "ready");
  assert.equal(lesson.microsequences[2].cards.length, 2);
});

test("generateMicrosequenceProjectDocument força duas práticas no fallback de generate_planned_next", async () => {
  const provider = createFakeProvider({
    script: {
      "normal_generation-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Abrir a etapa seguinte.",
            inCardContext: ["continuidade planejada"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["explicar a etapa seguinte"]
          },
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Detalhar a etapa seguinte.",
            inCardContext: ["continuidade planejada"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["detalhar a etapa seguinte"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Checar avanço.",
            inCardContext: ["lacuna"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["identificar a etapa seguinte"]
          }
        ],
        coverageNotes: [],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "generate-microsequence": () => {
        throw new Error("compile indisponível");
      }
    }
  });
  const project = createProjectDocument();
  const current = project.courses[0].modules[0].lessons[0].microsequences[1];
  current.status = "ready";
  current.included = true;
  current.cards = [{ key: "card-1", say: "Conteúdo útil já gerado na etapa atual." }];
  project.courses[0].modules[0].lessons[0].microsequences[2].dependsOn = ["micro-a"];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "",
      actionIntent: "next_planned",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[2].cards;
  const practiceCards = cards.filter((card) =>
    Boolean(card.table || card.code)
    || /Complete|Classifique|Retomada final/i.test(card.say || "")
  );
  assert.equal(result.route.canonicalRoute, "generate_planned_next");
  assert.equal(result.target.microsequenceKey, "micro-next");
  assert.ok(cards.length >= 4);
  assert.ok(practiceCards.length >= 2);
});

test("generateMicrosequenceProjectDocument não repete compile após timeout em generate_planned_next", async () => {
  let compileCalls = 0;
  const provider = createFakeProvider({
    script: {
      "normal_generation-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Abrir a etapa seguinte.",
            inCardContext: ["continuidade planejada"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["explicar a etapa seguinte"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Checar avanço.",
            inCardContext: ["lacuna"],
            usesDependency: ["micro-a"],
            expectedEvidence: ["identificar a etapa seguinte"]
          }
        ],
        coverageNotes: [],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "generate-microsequence": () => {
        compileCalls += 1;
        const error = new Error("Gemini request timed out after 45000ms.");
        error.name = "AbortError";
        throw error;
      }
    }
  });
  const project = createProjectDocument();
  const current = project.courses[0].modules[0].lessons[0].microsequences[1];
  current.status = "ready";
  current.included = true;
  current.cards = [{ key: "card-1", say: "Conteúdo útil já gerado na etapa atual." }];
  project.courses[0].modules[0].lessons[0].microsequences[2].dependsOn = ["micro-a"];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "",
      actionIntent: "next_planned",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  assert.equal(compileCalls, 1);
  assert.equal(result.route.canonicalRoute, "generate_planned_next");
  assert.equal(result.target.microsequenceKey, "micro-next");
  assert.equal(result.projectDocument.courses[0].modules[0].lessons[0].microsequences[2].status, "ready");
});

test("generateMicrosequenceProjectDocument repara a microssequência atual sem alterar a trilha", async () => {
  const provider = createFakeProvider({
    script: {
      "repair-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Reescrever a explicação local.",
            inCardContext: ["ajuste local"],
            usesDependency: [],
            expectedEvidence: ["explicar melhor o ponto"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Manter prática guiada.",
            inCardContext: ["checagem curta"],
            usesDependency: [],
            expectedEvidence: ["aplicar o ponto"]
          },
          {
            role: "bridge_or_consolidation",
            resourceType: "say",
            purpose: "Fechar a mesma etapa.",
            inCardContext: ["mesma trilha"],
            usesDependency: [],
            expectedEvidence: ["seguir na mesma etapa"]
          }
        ],
        coverageNotes: ["Repair local sem mudar a trilha."],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "improve-microsequence": {
        summary: "Versão reparada da mesma microssequência.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "Nova explicação local mais simples." },
          { key: "card-2", position: 2, resourceType: "block_gap_fill", content: "Complete: a correção continua na [[Microssequência A::Microssequência A|Microssequência Seguinte]]." },
          { key: "card-3", position: 3, resourceType: "say", content: "A trilha segue na mesma microssequência antes de qualquer avanço." }
        ]
      }
    }
  });

  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[1].status = "ready";
  project.courses[0].modules[0].lessons[0].microsequences[1].included = true;
  project.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    { key: "seed-card", title: "Base", say: "Explicação ruim para corrigir." }
  ];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Corrija a explicação ruim sem mudar de assunto.",
      operationMode: "repair",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const lesson = result.projectDocument.courses[0].modules[0].lessons[0];
  assert.equal(result.route.canonicalRoute, "repair_current");
  assert.equal(result.target.microsequenceKey, "micro-a");
  assert.deepEqual(lesson.microsequences.map((item) => item.key), ["micro-prev", "micro-a", "micro-next"]);
  assert.equal(lesson.microsequences[1].cards.length, 3);
  assert.equal(lesson.microsequences[2].cards.length, 0);
});

test("generateMicrosequenceProjectDocument rejeita repair que devolve fallback antigo sem reescrita", async () => {
  const provider = createFakeProvider({
    script: {
      "repair-draft": {
        steps: [
          {
            role: "microtheory",
            resourceType: "say",
            purpose: "Simplificar a teoria.",
            inCardContext: ["PC"],
            usesDependency: [],
            expectedEvidence: ["explicar PC"]
          },
          {
            role: "active_practice",
            resourceType: "block_gap_fill",
            purpose: "Guiar exercício.",
            inCardContext: ["próxima instrução"],
            usesDependency: [],
            expectedEvidence: ["identificar PC"]
          }
        ],
        coverageNotes: [],
        continuationNeeded: false,
        continuationReason: "",
        continuationMode: "none",
        continuationPrompt: ""
      },
      "improve-microsequence": {
        summary: "Reparo fraco.",
        cards: [
          { key: "fallback-card-1", position: 1, resourceType: "say", content: "Explicar que o PC mantém o endereço da próxima instrução." },
          { key: "fallback-card-2", position: 2, resourceType: "say", content: "Caso guiado: quando aparecer \"Função do contador de programa\", localize Função do contador de programa." }
        ]
      }
    }
  });
  const project = createProjectDocument();
  const microsequence = project.courses[0].modules[0].lessons[0].microsequences[1];
  microsequence.title = "Função do contador de programa";
  microsequence.goal = "Explicar que o PC mantém o endereço da próxima instrução na memória.";
  microsequence.scopeLabels = ["PC e próxima instrução"];
  microsequence.status = "ready";
  microsequence.included = true;
  microsequence.cards = [
    { key: "fallback-card-1", title: "Ideia central", say: "Explicar que o PC mantém o endereço da próxima instrução." },
    { key: "fallback-card-2", title: "Exemplo guiado", say: "Caso guiado: quando aparecer \"Função do contador de programa\", localize Função do contador de programa." }
  ];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Reescreva a microssequência com teoria mais simples e exercícios mais guiados.",
      operationMode: "repair",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards;
  const combined = cards.map((card) => `${card.key}\n${card.say || ""}`).join("\n");
  assert.doesNotMatch(combined, /fallback-card/);
  assert.match(combined, /endereço da próxima instrução/i);
  assert.match(combined, /CPU/i);
});

test("fallback determinístico de repair gera cards finais sem rubrica interna", async () => {
  const provider = createFakeProvider({ script: {} });
  const project = createProjectDocument();
  const microsequence = project.courses[0].modules[0].lessons[0].microsequences[1];
  microsequence.title = "Fluxo mínimo de informação para uma instrução";
  microsequence.goal = "Explicar que uma instrução fica na memória, chega à CPU e fica temporariamente em registradores enquanto é tratada.";
  microsequence.scopeRefs = [];
  microsequence.scopeLabels = ["relação mínima entre CPU, memória e registradores"];
  microsequence.expectedEvidence = [
    "Descreve o deslocamento da instrução entre componentes",
    "Usa registradores como armazenamento temporário interno"
  ];
  microsequence.status = "ready";
  microsequence.included = true;
  microsequence.cards = [{ key: "old-card", say: "Texto ruim." }];

  const result = await generateMicrosequenceProjectDocument({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Reescreva a microssequência porque a teoria precisa ficar simples e os exercícios mais guiados.",
      operationMode: "repair",
      interventionTargetMode: "current"
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });

  const cards = result.projectDocument.courses[0].modules[0].lessons[0].microsequences[1].cards;
  const combined = cards.map((card) => `${card.title || ""}\n${card.say || ""}`).join("\n");
  assert.doesNotMatch(combined, /Explicar a ideia|Pedir uma ação observável|\[\[/i);
  assert.match(combined, /memória/i);
  assert.match(combined, /CPU/i);
  assert.match(combined, /registradores/i);
});

test("fluxo de produto não importa runner estrutural externo nem fallback paralelo", () => {
  const lessonEditorSource = fs.readFileSync("./src/ui/lessonEditorApp.js", "utf8");
  const directRuntimeSource = fs.readFileSync("./src/generation/runtime/projectGenerationRuntime.js", "utf8");

  assert.doesNotMatch(lessonEditorSource, /generationRunner/);
  assert.doesNotMatch(lessonEditorSource, /runGeneration/);
  assert.doesNotMatch(directRuntimeSource, /runGeneration/);
  assert.doesNotMatch(directRuntimeSource, /generationPhases/);
});
