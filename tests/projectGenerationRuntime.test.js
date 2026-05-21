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
  assert.deepEqual(lesson.sourceGuideStructured, {
    lessonGoal: "Fixar o objetivo operacional da lição.",
    notationRules: "Lição A, Estrutura básica",
    commonErrors: "Não confundir o conceito atual com etapas futuras."
  });
  assert.equal(lesson.microsequences[0].key, "micro-a");
  assert.deepEqual(lesson.microsequences[1].dependsOn, ["micro-a"]);
  assert.equal(lesson.microsequences[1].title, "Microssequência B");
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
  assert.equal(microsequences[2].supportReason, "Lacuna prévia local");
  assert.deepEqual(microsequences[2].dependsOn, ["micro-a"]);
  assert.deepEqual(microsequences[2].tags, ["PC", "IR"]);
  assert.equal(microsequences[3].key, "micro-next");
  assert.equal(result.interventionFeedback.status, "completed");
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
        summary: "Prática distribuída.",
        cards: [
          { key: "card-1", position: 1, resourceType: "say", content: "Retomada local." },
          { key: "card-2", position: 2, resourceType: "block_gap_fill", content: "Complete: [[echo ok::echo ok|echo no]]." }
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
});

test("fluxo de produto não importa runner estrutural externo nem fallback paralelo", () => {
  const lessonEditorSource = fs.readFileSync("./src/ui/lessonEditorApp.js", "utf8");
  const directRuntimeSource = fs.readFileSync("./src/generation/runtime/projectGenerationRuntime.js", "utf8");

  assert.doesNotMatch(lessonEditorSource, /generationRunner/);
  assert.doesNotMatch(lessonEditorSource, /runGeneration/);
  assert.doesNotMatch(directRuntimeSource, /runGeneration/);
  assert.doesNotMatch(directRuntimeSource, /generationPhases/);
});
