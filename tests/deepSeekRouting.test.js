import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { generateMicrosequenceProjectDocument } from "../src/generation/runtime/projectGenerationRuntime.js";

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
                goal: "Meta da lição.",
                sourceGuideStructured: {
                  lessonGoal: "Explicar a etapa atual.",
                  notationRules: "PC, IR",
                  commonErrors: "Não confundir PC e IR."
                },
                microsequences: [
                  {
                    key: "micro-prev",
                    title: "Base anterior",
                    goal: "Pré-requisito.",
                    status: "ready",
                    included: true,
                    cards: [{ key: "seed-prev", say: "Base pronta." }]
                  },
                  {
                    key: "micro-a",
                    title: "Microssequência A",
                    goal: "Etapa atual.",
                    status: "ready",
                    included: true,
                    dependsOn: ["micro-prev"],
                    cards: [{ key: "seed-a", say: "Conteúdo atual." }],
                    expectedEvidence: ["explicar a etapa atual"],
                    scopeLabels: ["PC", "IR"]
                  },
                  {
                    key: "micro-next",
                    title: "Microssequência Seguinte",
                    goal: "Próxima etapa.",
                    status: "draft",
                    included: false,
                    dependsOn: ["micro-a"],
                    expectedEvidence: ["explicar a próxima etapa"],
                    scopeLabels: ["pipeline"]
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

function validDraft() {
  return {
    steps: [
      {
        role: "microtheory",
        resourceType: "say",
        purpose: "Abrir a etapa.",
        inCardContext: ["contexto local"],
        usesDependency: [],
        expectedEvidence: ["explicar a etapa"]
      },
      {
        role: "active_practice",
        resourceType: "block_gap_fill",
        purpose: "Praticar.",
        inCardContext: ["lacuna"],
        usesDependency: [],
        expectedEvidence: ["aplicar a etapa"]
      },
      {
        role: "bridge_or_consolidation",
        resourceType: "say",
        purpose: "Fechar a etapa.",
        inCardContext: ["fechamento"],
        usesDependency: [],
        expectedEvidence: ["retomar a trilha"]
      }
    ],
    coverageNotes: [],
    continuationNeeded: false,
    continuationReason: "",
    continuationMode: "none",
    continuationPrompt: ""
  };
}

function validCards() {
  return {
    summary: "JSON válido.",
    cards: [
      { key: "card-1", position: 1, resourceType: "say", content: "Explicação." },
      { key: "card-2", position: 2, resourceType: "block_gap_fill", content: "Complete: [[PC::PC|IR]]." },
      {
        key: "card-3",
        position: 3,
        resourceType: "table",
        content: {
          intro: "Classifique cada papel.",
          columns: ["Descrição", "Componente"],
          rows: [["Guarda a instrução atual", "IR"]]
        }
      },
      { key: "card-4", position: 4, resourceType: "say", content: "Fechamento." }
    ]
  };
}

function validSupport() {
  return {
    title: "Microssequência de apoio",
    goal: "Explicar a lacuna local.",
    supportReason: "Pré-requisito local",
    didacticKind: "concept",
    practiceMode: "explanation",
    representationNeed: "text",
    dependencyPolicy: "uses_previous",
    expectedEvidence: ["retomar a trilha principal"],
    summary: "Apoio validado.",
    cards: [
      { key: "card-1", position: 1, resourceType: "say", content: "Abertura." },
      { key: "card-2", position: 2, resourceType: "say", content: "Explicação." },
      { key: "card-3", position: 3, resourceType: "block_gap_fill", content: "Complete: [[apoio::apoio|trilha]]." },
      { key: "card-4", position: 4, resourceType: "say", content: "Volte à trilha principal." }
    ]
  };
}

function createSelection() {
  return {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a"
  };
}

async function runRoute({ draft, script, projectDocument = createProjectDocument() }) {
  const provider = createFakeProvider({ script });
  return generateMicrosequenceProjectDocument({
    selection: createSelection(),
    draft,
    assistConfig: {
      model: "deepseek-quality",
      apiKey: "segredo",
      baseUrl: "https://api.deepseek.com"
    },
    projectDocument,
    provider,
    ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
  });
}

test("DeepSeek Quality usa draft e compile nas rotas extend_current e repair_current", async () => {
  const extendCalls = [];
  await runRoute({
    draft: {
      promptText: "Continue a etapa atual.",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    script: {
      "add_practice-draft": (request) => {
        extendCalls.push({ mode: request.mode, phase: request.phase });
        return validDraft();
      },
      "add-practice": (request) => {
        extendCalls.push({ mode: request.mode, phase: request.phase });
        return validCards();
      }
    }
  });

  assert.deepEqual(extendCalls, [
    { mode: "add_practice-draft", phase: "bottom-up-draft" },
    { mode: "add-practice", phase: "bottom-up-compile" }
  ]);

  const repairCalls = [];
  await runRoute({
    draft: {
      promptText: "Corrija a etapa atual.",
      operationMode: "repair",
      interventionTargetMode: "current"
    },
    script: {
      "repair-draft": (request) => {
        repairCalls.push({ mode: request.mode, phase: request.phase });
        return validDraft();
      },
      "improve-microsequence": (request) => {
        repairCalls.push({ mode: request.mode, phase: request.phase });
        return validCards();
      }
    }
  });

  assert.deepEqual(repairCalls, [
    { mode: "repair-draft", phase: "bottom-up-draft" },
    { mode: "improve-microsequence", phase: "bottom-up-compile" }
  ]);
});

test("DeepSeek Quality usa draft e compile nas rotas create_support_branch e generate_planned_next", async () => {
  const supportCalls = [];
  await runRoute({
    draft: {
      promptText: "Abra um apoio curto antes de seguir.",
      operationMode: "reinforce",
      interventionTargetMode: "new_after_current"
    },
    script: {
      "create_support-draft": (request) => {
        supportCalls.push({ mode: request.mode, phase: request.phase });
        return validDraft();
      },
      "create-support": (request) => {
        supportCalls.push({ mode: request.mode, phase: request.phase });
        return validSupport();
      }
    }
  });

  assert.deepEqual(supportCalls, [
    { mode: "create_support-draft", phase: "bottom-up-draft" },
    { mode: "create-support", phase: "bottom-up-compile" }
  ]);

  const nextCalls = [];
  const project = createProjectDocument();
  project.courses[0].modules[0].lessons[0].microsequences[2].dependsOn = ["micro-a"];
  await runRoute({
    draft: {
      promptText: "",
      actionIntent: "next_planned",
      operationMode: "reinforce",
      interventionTargetMode: "current"
    },
    projectDocument: project,
    script: {
      "normal_generation-draft": (request) => {
        nextCalls.push({ mode: request.mode, phase: request.phase });
        return validDraft();
      },
      "generate-microsequence": (request) => {
        nextCalls.push({ mode: request.mode, phase: request.phase });
        return validCards();
      }
    }
  });

  assert.deepEqual(nextCalls, [
    { mode: "normal_generation-draft", phase: "bottom-up-draft" },
    { mode: "generate-microsequence", phase: "bottom-up-compile" }
  ]);
});

test("DeepSeek Quality usa phase de repair quando o compile bottom-up precisa de retry", async () => {
  const calls = [];
  let compileAttempt = 0;
  await runRoute({
    draft: {
      promptText: "Corrija a etapa atual.",
      operationMode: "repair",
      interventionTargetMode: "current"
    },
    script: {
      "repair-draft": (request) => {
        calls.push({ mode: request.mode, phase: request.phase });
        return validDraft();
      },
      "improve-microsequence": [
        (request) => {
          calls.push({ mode: request.mode, phase: request.phase });
          compileAttempt += 1;
          throw new Error("JSON inválido");
        },
        (request) => {
          calls.push({ mode: request.mode, phase: request.phase });
          compileAttempt += 1;
          return validCards();
        }
      ]
    }
  });

  assert.deepEqual(calls, [
    { mode: "repair-draft", phase: "bottom-up-draft" },
    { mode: "improve-microsequence", phase: "bottom-up-compile" },
    { mode: "improve-microsequence", phase: "bottom-up-repair" }
  ]);
});
