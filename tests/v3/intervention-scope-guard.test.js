import test from "node:test";
import assert from "node:assert/strict";

import {
  assertInterventionResultScope,
  assertInterventionResumeScope,
  buildInterventionScopeSnapshot,
  InterventionScopeError
} from "../../src/assist/interventionScopeGuard.js";
import { buildContextPacket } from "../../src/generation/bottomUp/buildContextPacket.js";
import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { executeMicrosequenceGeneration } from "../../src/generation/runtime/interventionRuntime.js";

function paragraphCard(id, text) {
  return {
    id,
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: id,
    text,
    after: ""
  };
}

function microsequence(id, status = "planned", cards = []) {
  return {
    id,
    title: id,
    goal: `Objetivo ${id}`,
    role: "explain",
    status,
    dependsOn: id === "micro-b" ? ["micro-a"] : [],
    covers: [id],
    checks: [`Verificar ${id}`],
    cards
  };
}

function projectFixture() {
  const guide = {
    goal: "Ensinar o conteúdo delimitado.",
    include: ["micro-a", "micro-b"],
    exclude: [],
    notation: [],
    avoid: []
  };
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-a",
        title: "Curso A",
        goal: "Objetivo A",
        modules: [
          {
            id: "module-a",
            title: "Módulo A",
            guide,
            lessons: [
              {
                id: "lesson-a",
                title: "Lição A",
                guide,
                topics: [],
                microsequences: [
                  microsequence("micro-a", "generated", [paragraphCard("card-a", "Base A")]),
                  microsequence("micro-b")
                ]
              }
            ]
          }
        ]
      },
      {
        id: "course-b",
        title: "Curso B",
        goal: "Objetivo B",
        modules: []
      }
    ]
  };
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a"
};

test("guarda aceita somente cards e status da microssequência autorizada", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].status = "generated";
  next.courses[0].modules[0].lessons[0].microsequences[0].cards = [
    paragraphCard("card-a", "Base A corrigida")
  ];

  assert.deepEqual(assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-a",
    targetMode: "current",
    actionIntent: "generate_current"
  }), {
    mode: "existing",
    targetMicrosequenceKey: "micro-a"
  });
});

test("guarda rejeita alteração lateral produzida junto com a resposta", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text = "Base corrigida";
  next.courses[1].title = "Curso B alterado";

  assert.throws(() => assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-a",
    targetMode: "current",
    actionIntent: "generate_current"
  }), (error) => error instanceof InterventionScopeError && error.code === "OUT_OF_SCOPE_CHANGE");
});

test("próxima etapa pode alterar somente a microssequência planejada indicada no resultado", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[1].status = "generated";
  next.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    paragraphCard("card-b", "Base B")
  ];

  assert.equal(assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-b",
    targetMode: "current",
    actionIntent: "next_planned"
  }).targetMicrosequenceKey, "micro-b");
});

test("próxima etapa não pode saltar uma microssequência da trilha", () => {
  const previous = projectFixture();
  previous.courses[0].modules[0].lessons[0].microsequences.push(microsequence("micro-c"));
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[2].status = "generated";
  next.courses[0].modules[0].lessons[0].microsequences[2].cards = [
    paragraphCard("card-c", "Base C")
  ];

  assert.throws(() => assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-c",
    targetMode: "current",
    actionIntent: "next_planned"
  }), (error) => error instanceof InterventionScopeError && error.code === "INVALID_TARGET");
});

test("ramificação aceita uma única etapa adjacente sem reescrever o restante", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences.splice(1, 0, {
    ...microsequence("micro-support", "generated", [paragraphCard("card-support", "Apoio")]),
    branchOf: "micro-a",
    dependsOn: ["micro-a"]
  });

  assert.equal(assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-support",
    targetMode: "new_after_current",
    actionIntent: "branch_after_current"
  }).mode, "branch");
});

test("retomada é bloqueada quando o contexto didático mudou", () => {
  const previous = projectFixture();
  const snapshot = buildInterventionScopeSnapshot(previous, selection);
  const changed = structuredClone(previous);
  changed.courses[0].modules[0].lessons[0].guide.goal = "Outro objetivo";

  assert.throws(() => assertInterventionResumeScope({
    savedSnapshot: snapshot,
    projectDocument: changed,
    selection
  }), (error) => error instanceof InterventionScopeError && error.code === "STALE_INTERVENTION_SCOPE");
});

test("runtime não reaproveita artefatos nem chama o provider após mudança de contexto", async () => {
  let providerCalls = 0;
  const provider = createFakeProvider({
    script: {
      bottom_up_micro_plan: () => {
        providerCalls += 1;
        throw new Error("Falha transitória simulada.");
      }
    }
  });
  const draft = {
    actionIntent: "generate_current",
    interventionTargetMode: "current",
    operationMode: "reinforce",
    promptText: "Explique novamente a base."
  };
  const common = {
    selection,
    draft,
    assistConfig: { model: "fake:model" },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "micro-a",
      microsequenceKeys: ["micro-a", "micro-b"],
      reusableMicrosequenceCount: 2
    },
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  };
  const first = await executeMicrosequenceGeneration({
    ...common,
    projectDocument: projectFixture()
  });
  assert.equal(first.status, "error");
  assert.equal(providerCalls, 1);

  const changed = projectFixture();
  changed.courses[0].modules[0].lessons[0].guide.goal = "Contexto atualizado";
  const resumed = await executeMicrosequenceGeneration({
    ...common,
    projectDocument: changed,
    resumeSession: first.interventionFeedback
  });

  assert.equal(resumed.status, "stale");
  assert.equal(resumed.interventionFeedback.status, "stale");
  assert.equal(resumed.interventionFeedback.continuationNeeded, false);
  assert.equal(providerCalls, 1);
});

test("contexto rejeita referência silenciosamente inexistente ou autorreferência", () => {
  const project = projectFixture();
  assert.throws(() => buildContextPacket(project, selection, {
    selectedRefIds: ["micro-fantasma"]
  }), /referências inválidas/u);
  assert.throws(() => buildContextPacket(project, selection, {
    selectedRefIds: ["micro-a"]
  }), /referências inválidas/u);
});
