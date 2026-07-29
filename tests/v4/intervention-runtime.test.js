import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { executeMicrosequenceGeneration } from "../../src/generation/runtime/interventionRuntime.js";

function guide(goal) {
  return {
    goal,
    include: ["conjunção", "tabela-verdade"],
    exclude: ["predicados"],
    notation: ["Use P e Q."],
    avoid: ["Não abrir outro tópico."]
  };
}

function projectWithSinglePlannedMicrosequence() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Curso A",
      goal: "Cobrir apenas conjunção.",
      modules: [{
        id: "module-a",
        title: "Lógica",
        guide: guide("Explicar apenas conjunção."),
        lessons: [{
          id: "lesson-a",
          title: "Conjunção",
          guide: guide("Explicar apenas conjunção."),
          topics: [],
          microsequences: [
            {
              id: "micro-a",
              title: "Quando P e Q são verdadeiras",
              goal: "Reconhecer a linha verdadeira da conjunção.",
              role: "explain",
              status: "planned",
              dependsOn: [],
              covers: ["conjunção"],
              checks: ["o aluno reconhece a linha verdadeira"],
              cards: []
            },
            {
              id: "micro-next",
              title: "Tabela-verdade da conjunção",
              goal: "Aplicar a regra na tabela-verdade.",
              role: "practice",
              status: "planned",
              dependsOn: ["micro-a"],
              covers: ["tabela-verdade"],
              checks: ["o aluno encontra a linha verdadeira"],
              cards: []
            }
          ]
        }]
      }]
    }]
  };
}

function projectWithGeneratedCurrentAndPlannedNext() {
  const project = projectWithSinglePlannedMicrosequence();
  project.courses[0].modules[0].lessons[0].microsequences[0] = {
    id: "micro-a",
    title: "Base",
    goal: "Estabelecer a regra.",
    role: "explain",
    status: "generated",
    dependsOn: [],
    covers: ["conjunção"],
    checks: ["o aluno reconhece a regra"],
    cards: [{
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Base",
      text: "Explicação objetiva da regra local.",
      after: ""
    }]
  };
  project.courses[0].modules[0].lessons[0].microsequences[1] = {
    id: "micro-b",
    title: "Próxima etapa",
    goal: "Aplicar a regra em tabela.",
    role: "practice",
    status: "planned",
    dependsOn: ["micro-a"],
    covers: ["tabela-verdade"],
    checks: ["o aluno aplica a regra na tabela"],
    cards: []
  };
  return project;
}

function paragraphCard(position) {
  return {
    position,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: position === 1 ? "Regra da conjunção" : "Fechamento",
    text: "A conjunção só é verdadeira quando P e Q são verdadeiras.",
    after: "Use a regra no próximo caso."
  };
}

function choiceCard(position) {
  const cases = [
    ["P=V e Q=V", "P=V e Q=F", "P=F e Q=V"],
    ["P=F e Q=F", "P=V e Q=V", "P=F e Q=V"],
    ["as duas são verdadeiras", "somente P é verdadeira", "somente Q é verdadeira"]
  ];
  const values = cases[(position - 2) % cases.length];
  const answerIndex = position === 3 ? 1 : 0;
  const ids = ["a", "b", "c"];
  return {
    position,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: `Prática ${position - 1}`,
    question: `No caso ${position - 1}, qual situação torna a conjunção verdadeira?`,
    selectionMode: "single",
    selectionCriterion: "correct",
    options: values.map((value, index) => ({
      id: ids[index],
      text: value,
      feedback: index === answerIndex
        ? "Correta: as duas proposições são verdadeiras."
        : "Incorreta: uma das proposições não satisfaz a conjunção."
    })),
    answerIds: [ids[answerIndex]],
    after: "Compare os dois valores antes de responder."
  };
}

function structuredProvider({ count = 3, failFirstBuild = false, branch = false } = {}) {
  const representations = Array.from({ length: count }, (_, index) => ({
    value: {
      representation: index === 0 || (branch && index === 1) ||
        (count > 3 && index === count - 1)
        ? "paragraph:none"
        : "choice:choice"
    }
  }));
  const cards = Array.from({ length: count }, (_, index) => ({
    value: {
      card: index === 0 || (count > 3 && index === count - 1)
        || (branch && index === 1)
        ? paragraphCard(index + 1)
        : choiceCard(index + 1)
    }
  }));
  return createFakeProvider({
    script: {
      bottom_up_representation: representations,
      bottom_up_card_build: [
        ...(failFirstBuild ? [new Error("Timeout no provider.")] : []),
        ...cards
      ],
      ...(branch ? {
        branch_microsequence_structure: {
          text: JSON.stringify({
            title: "Revisão curta da regra",
            goal: "Retomar a regra central antes da prática seguinte.",
            role: "support",
            covers: ["conjunção"],
            checks: ["o aluno retoma a regra central"]
          })
        }
      } : {})
    }
  });
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a"
};

function common(projectDocument, provider, draft) {
  return {
    selection,
    draft,
    assistConfig: { model: "fake:model" },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "Quando P e Q são verdadeiras",
      microsequenceKeys: ["micro-a", "micro-next"],
      reusableMicrosequenceCount: 2
    },
    projectDocument,
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  };
}

test("generate_current materializa a microssequência pelo bottom-up estruturado", async () => {
  const feedbackUpdates = [];
  const result = await executeMicrosequenceGeneration({
    ...common(projectWithSinglePlannedMicrosequence(), structuredProvider(), {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "reinforce",
      promptText: "Reforce a linha verdadeira.",
      attachments: []
    }),
    onFeedback: (feedback) => feedbackUpdates.push(feedback)
  });
  assert.equal(result.status, "success");
  assert.equal(feedbackUpdates.some((item) => item.status === "running"), true);
  assert.equal(
    result.generationResult.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].status,
    "generated"
  );
});

test("next_planned materializa a próxima microssequência satisfeita", async () => {
  const result = await executeMicrosequenceGeneration(common(
    projectWithGeneratedCurrentAndPlannedNext(),
    structuredProvider({ count: 5 }),
    {
      actionIntent: "next_planned",
      interventionTargetMode: "current",
      operationMode: "reinforce",
      promptText: ""
    }
  ));
  assert.equal(result.status, "success");
  assert.equal(result.generationResult.patch.target.microsequenceKey, "micro-b");
});

test("repair_current substitui somente os cards da microssequência", async () => {
  const result = await executeMicrosequenceGeneration(common(
    projectWithGeneratedCurrentAndPlannedNext(),
    structuredProvider(),
    {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "repair",
      promptText: "Ajuste a prática final."
    }
  ));
  assert.equal(result.status, "success");
  assert.equal(
    result.generationResult.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].cards.length,
    3
  );
});

test("branch_after_current cria suporte local e o materializa", async () => {
  const result = await executeMicrosequenceGeneration(common(
    projectWithSinglePlannedMicrosequence(),
    structuredProvider({ count: 5, branch: true }),
    {
      actionIntent: "branch_after_current",
      interventionTargetMode: "new_after_current",
      operationMode: "reinforce",
      promptText: "Abra uma revisão curta."
    }
  ));
  assert.equal(result.status, "success");
  const microsequences = result.generationResult.projectDocument.courses[0].modules[0]
    .lessons[0].microsequences;
  assert.equal(microsequences[1].branchOf, "micro-a");
});

test("retomada de compile conserva o plano e repete somente a materialização", async () => {
  const provider = structuredProvider({ failFirstBuild: true });
  const args = common(projectWithSinglePlannedMicrosequence(), provider, {
    actionIntent: "generate_current",
    interventionTargetMode: "current",
    operationMode: "reinforce",
    promptText: "Reforce a linha verdadeira."
  });
  const first = await executeMicrosequenceGeneration(args);
  assert.equal(first.status, "error");
  assert.equal(first.interventionFeedback.run.resumeFrom, "compile");

  const resumedProvider = structuredProvider();
  const second = await executeMicrosequenceGeneration({
    ...args,
    provider: resumedProvider,
    resumeSession: first.interventionFeedback
  });
  assert.equal(second.status, "success");
  assert.match(second.generationResult.interventionFeedback.feedbackText, /Retomando da etapa compile/u);
});
