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
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            lessons: [
              {
                key: "lesson-a",
                title: "Lição A",
                description: "Base da lição.",
                sourceGuideStructured: {
                  lessonGoal: "Explicar o conceito atual sem pressupor notação anterior não explicitada.",
                  notationRules: ["Explique siglas antes do uso autônomo."]
                },
                microsequences: [
                  {
                    key: "micro-prev",
                    title: "Base anterior",
                    description: "Pré-requisito já explicitado.",
                    status: "ready",
                    included: true,
                    tags: ["Base", "Pré-requisito"],
                    cards: []
                  },
                  {
                    key: "micro-a",
                    title: "Microssequência A",
                    description: "Versão atual.",
                    tags: ["PC", "IR"],
                    dependsOn: ["micro-prev"],
                    status: "draft",
                    included: false,
                    cards: []
                  },
                  {
                    key: "micro-next",
                    title: "Microssequência Seguinte",
                    description: "Próxima etapa planejada.",
                    tags: ["CPU"],
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
      "generate-microsequence": (request) => {
        assert.match(request.prompt, /selectedLessonTopicRefs/);
        assert.match(request.prompt, /studyTrackPolicy/);
        assert.match(request.prompt, /Não entendi PC e IR/);
        assert.match(request.prompt, /micro-prev/);
        assert.match(request.prompt, /Pré-requisito/);
        assert.match(request.prompt, /Tabela/);
        assert.match(request.prompt, /anexo relevante sobre PC e IR/);
        return {
        summary: "Primeira versão.",
        cards: [
          { key: "card-1", resourceType: "say", content: "Primeiro card." },
          { key: "card-2", resourceType: "code", content: { code: "echo ok", language: "bash" } },
          { key: "card-3", resourceType: "say", content: "Terceiro card." },
          { key: "card-4", resourceType: "block_gap_fill", content: "Use [[echo ok::echo ok|echo no]]." }
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
  assert.deepEqual(microsequences[2].dependsOn, ["micro-a"]);
  assert.deepEqual(microsequences[2].tags, ["PC", "IR"]);
  assert.equal(microsequences[3].key, "micro-next");
});

test("fluxo de produto não importa runner estrutural externo nem fallback paralelo", () => {
  const lessonEditorSource = fs.readFileSync("./src/ui/lessonEditorApp.js", "utf8");
  const directRuntimeSource = fs.readFileSync("./src/generation/runtime/projectGenerationRuntime.js", "utf8");

  assert.doesNotMatch(lessonEditorSource, /generationRunner/);
  assert.doesNotMatch(lessonEditorSource, /runGeneration/);
  assert.doesNotMatch(directRuntimeSource, /runGeneration/);
  assert.doesNotMatch(directRuntimeSource, /generationPhases/);
});
