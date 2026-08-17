import assert from "node:assert/strict";
import test from "node:test";

import {
  CourseAuthoringPlanError,
  applyCourseAuthoringPlanCommand,
  deriveAuthoringPartProgress,
  normalizeCourseAuthoringPlan
} from "../../src/domain/courseAuthoringPlan.js";
import {
  deriveAuthoringPartProgress as deriveEdgeProgress,
  applyCourseAuthoringPlanCommand as applyEdgeCommand,
  normalizeCourseAuthoringPlanCommand,
  normalizeCourseAuthoringPlan as normalizeEdgePlan
} from "../../supabase/functions/_shared/aralearn/runtime/domain/courseAuthoringPlan.js";

const IDS = {
  plan: "10000000-0000-4000-8000-000000000001",
  outcome: "10000000-0000-4000-8000-000000000002",
  analysis: "10000000-0000-4000-8000-000000000003",
  evidence: "10000000-0000-4000-8000-000000000004",
  part: "10000000-0000-4000-8000-000000000005",
  materialization: "10000000-0000-4000-8000-000000000006"
};

function planFixture() {
  return {
    id: IDS.plan,
    title: "Relações conceituais",
    objective: "Analisar relações entre conceitos.",
    audience: "Estudantes de graduação.",
    scope: "Conceitos introdutórios e suas relações.",
    preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
    intendedLearningOutcomes: [{ id: IDS.outcome, position: 0, statement: "Comparar os conceitos." }],
    instructionalAnalysisUnits: [{ id: IDS.analysis, position: 0, statement: "Resposta a cada Unidade de estudo." }],
    evidenceRequirements: [{ id: IDS.evidence, position: 0, statement: "Registrar revisão após resposta." }],
    parts: [{
      id: IDS.part,
      position: 0,
      title: "Relações fundamentais",
      intent: "Produzir uma progressão coerente entre definição e contraste.",
      microsequenceIds: ["micro-a", "micro-b"]
    }]
  };
}

test("normaliza o plano consultável com faixa 7–12 e itens de pesquisa estáveis", () => {
  const normalized = normalizeCourseAuthoringPlan(planFixture());
  assert.deepEqual(normalized.preferredPartCount, {
    minimum: 7,
    maximum: 12,
    origin: "automatic"
  });
  assert.equal(normalized.intendedLearningOutcomes[0].id, IDS.outcome);
  assert.equal(normalized.instructionalAnalysisUnits[0].id, IDS.analysis);
  assert.equal(normalized.evidenceRequirements[0].id, IDS.evidence);
  assert.deepEqual(normalizeEdgePlan(planFixture()), normalized);
});

test("plano não aceita mais orientação monolítica nem alias legado", () => {
  assert.throws(
    () => normalizeCourseAuthoringPlan({
      ...planFixture(),
      authoringGuidance: "Usar exemplos contrastivos curtos."
    }),
    (error) => error instanceof CourseAuthoringPlanError &&
      error.code === "unknown_course_authoring_plan_field"
  );
});

test("domínio e Edge rejeitam controles Unicode C0 e C1 nos textos do plano", () => {
  for (const control of ["\u0001", "\u007f", "\u0085", "\u009f"]) {
    const candidate = planFixture();
    candidate.audience = `Público${control}inválido`;
    assert.throws(
      () => normalizeCourseAuthoringPlan(candidate),
      (error) => error instanceof CourseAuthoringPlanError &&
        error.code === "invalid_course_authoring_audience"
    );
    assert.throws(
      () => normalizeEdgePlan(candidate),
      (error) => error.code === "invalid_course_authoring_audience"
    );
  }
});

test("aplica os mesmos comandos fechados no navegador e no Edge com replay determinístico", () => {
  const commands = [
    {
      type: "add_part",
      id: "10000000-0000-4000-8000-000000000008",
      position: 1,
      title: "Aplicações",
      intent: "Transferir as relações para um caso novo."
    },
    {
      type: "assign_microsequence",
      partId: "10000000-0000-4000-8000-000000000008",
      microsequenceId: "micro-c",
      position: 0
    },
    {
      type: "add_plan_item",
      kind: "evidence_requirement",
      id: "10000000-0000-4000-8000-000000000009",
      position: 1,
      statement: "Conservar a resposta antes da revisão."
    }
  ];
  let browser = planFixture();
  let edge = planFixture();
  for (const command of commands) {
    browser = applyCourseAuthoringPlanCommand(browser, command);
    edge = applyEdgeCommand(edge, command);
  }
  assert.deepEqual(edge, browser);
  assert.deepEqual(
    applyCourseAuthoringPlanCommand(browser, commands[0]),
    browser
  );
  assert.equal(browser.parts[1].microsequenceIds[0], "micro-c");
  assert.equal(browser.evidenceRequirements.length, 2);
});

test("normaliza comando sem depender do estado corrente", () => {
  assert.deepEqual(normalizeCourseAuthoringPlanCommand({
    type: "split_part",
    partId: IDS.part,
    newPartId: "10000000-0000-4000-8000-000000000010",
    newPartPosition: 1,
    title: "Contrastes",
    intent: "Separar o contraste da definição.",
    microsequenceIds: ["micro-b"]
  }), {
    type: "split_part",
    partId: IDS.part,
    newPartId: "10000000-0000-4000-8000-000000000010",
    newPartPosition: 1,
    title: "Contrastes",
    intent: "Separar o contraste da definição.",
    microsequenceIds: ["micro-b"]
  });
});

test("replanejamento distingue atribuir, mover, dividir, unir e remover", () => {
  const secondPartId = "10000000-0000-4000-8000-000000000011";
  let plan = applyCourseAuthoringPlanCommand(planFixture(), {
    type: "split_part",
    partId: IDS.part,
    newPartId: secondPartId,
    newPartPosition: 1,
    title: "Contrastes",
    intent: "Separar o contraste.",
    microsequenceIds: ["micro-b"]
  });
  assert.deepEqual(plan.parts.map(({ microsequenceIds }) => microsequenceIds), [
    ["micro-a"], ["micro-b"]
  ]);
  assert.throws(
    () => applyCourseAuthoringPlanCommand(plan, {
      type: "assign_microsequence",
      partId: secondPartId,
      microsequenceId: "micro-a",
      position: 1
    }),
    (error) => error.code === "course_authoring_microsequence_already_assigned"
  );
  plan = applyCourseAuthoringPlanCommand(plan, {
    type: "move_microsequence",
    partId: secondPartId,
    microsequenceId: "micro-a",
    position: 1
  });
  plan = applyCourseAuthoringPlanCommand(plan, {
    type: "remove_microsequence",
    microsequenceId: "micro-b"
  });
  plan = applyCourseAuthoringPlanCommand(plan, {
    type: "join_parts",
    sourcePartId: secondPartId,
    targetPartId: IDS.part
  });
  assert.deepEqual(plan.parts, [{
    id: IDS.part,
    position: 0,
    title: "Relações fundamentais",
    intent: "Produzir uma progressão coerente entre definição e contraste.",
    microsequenceIds: ["micro-a"]
  }]);
});

test("rejeita faixa fora de 1–64 e microssequência atribuída a duas Partes", () => {
  const invalidRange = planFixture();
  invalidRange.preferredPartCount.maximum = 65;
  assert.throws(
    () => normalizeCourseAuthoringPlan(invalidRange),
    (error) => error instanceof CourseAuthoringPlanError &&
      error.code === "invalid_course_authoring_part_count"
  );

  const duplicated = planFixture();
  duplicated.parts.push({
    id: "10000000-0000-4000-8000-000000000007",
    position: 1,
    title: "Outra Parte",
    intent: "",
    microsequenceIds: ["micro-b"]
  });
  assert.throws(
    () => normalizeCourseAuthoringPlan(duplicated),
    (error) => error instanceof CourseAuthoringPlanError &&
      error.code === "course_authoring_microsequence_assigned_twice"
  );
});

test("limita a 192 os vínculos enriquecidos do plano no navegador e no Edge", () => {
  const bounded = planFixture();
  bounded.parts = Array.from({ length: 4 }, (_, partIndex) => ({
    id: `10000000-0000-4000-8000-${String(partIndex + 20).padStart(12, "0")}`,
    position: partIndex,
    title: `Parte ${partIndex + 1}`,
    intent: "",
    microsequenceIds: Array.from(
      { length: 48 },
      (_, microIndex) => `micro-${partIndex}-${microIndex}`
    )
  }));
  assert.equal(normalizeCourseAuthoringPlan(bounded).parts.length, 4);
  assert.deepEqual(normalizeEdgePlan(bounded), normalizeCourseAuthoringPlan(bounded));

  bounded.parts[0].microsequenceIds.push("micro-overflow");
  assert.throws(
    () => normalizeCourseAuthoringPlan(bounded),
    (error) => error instanceof CourseAuthoringPlanError &&
      error.code === "too_many_course_authoring_part_microsequences"
  );
  assert.throws(
    () => normalizeEdgePlan(bounded),
    (error) => error.code === "too_many_course_authoring_part_microsequences"
  );
});

test("deriva progresso somente de materializações e entidades reais", () => {
  const input = {
    partId: IDS.part,
    microsequenceIds: ["micro-a", "micro-b"],
    entities: [
      { entityType: "card", parentId: "micro-a" },
      { entityType: "card", parentId: "micro-b" }
    ],
    materializations: [{
      id: IDS.materialization,
      partId: IDS.part,
      status: "completed",
      version: 3,
      startedAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:05:00.000Z",
      completedAt: "2026-08-17T10:05:00.000Z"
    }],
    steps: [
      { materializationId: IDS.materialization, status: "completed" },
      { materializationId: IDS.materialization, status: "completed" }
    ]
  };
  assert.deepEqual(deriveAuthoringPartProgress(input), {
    state: "materialized",
    microsequenceCount: 2,
    studyUnitCount: 2,
    lastMaterialization: {
      id: IDS.materialization,
      status: "completed",
      version: 3,
      completedStepCount: 2,
      failedStepCount: 0,
      totalStepCount: 2,
      startedAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:05:00.000Z",
      completedAt: "2026-08-17T10:05:00.000Z"
    }
  });
  assert.deepEqual(deriveEdgeProgress(input), deriveAuthoringPartProgress(input));
});

test("falha prevalece sobre conteúdo parcial e execução em curso permanece explícita", () => {
  const base = {
    partId: IDS.part,
    microsequenceIds: ["micro-a"],
    entities: [],
    steps: []
  };
  assert.equal(deriveAuthoringPartProgress({
    ...base,
    materializations: [{
      id: IDS.materialization,
      partId: IDS.part,
      status: "failed",
      version: 1,
      updatedAt: "2026-08-17T10:00:00.000Z"
    }]
  }).state, "attention_required");
  assert.equal(deriveAuthoringPartProgress({
    ...base,
    materializations: [{
      id: IDS.materialization,
      partId: IDS.part,
      status: "running",
      version: 1,
      updatedAt: "2026-08-17T10:00:00.000Z"
    }]
  }).state, "materializing");
});
