import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeCourseVariantCommand,
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantComparison,
  normalizeCourseVariantComparisonList,
  normalizeCourseVariantChange
} from "../../src/domain/courseVariants.js";

const id = "11111111-1111-4111-8111-111111111111";
const checkpointId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const base = () => ({
  type: "create_comparison_variants", comparisonSetId: id, expectedCourseRevision: 3,
  variants: [
    { label: "Z", title: "Curso Z", goal: "Objetivo Z", parameterDifferences: [], componentPolicyDifference: null },
    { label: "A", title: "Curso A", goal: "Objetivo A", parameterDifferences: [{ scopeKind: "course", scopeId: "course", parameterId: "new_analysis_unit_ceiling_per_expository_study_unit", value: 1, rationale: "Menor densidade conceitual." }], componentPolicyDifference: null }
  ]
});

test("variantes exigem contraste intencional e rótulos distintos", () => {
  const command = normalizeCourseVariantCommand(base());
  assert.equal(command.variants.length, 2);
  assert.deepEqual(command.variants.map(({ label }) => label), ["Z", "A"]);
  const noContrast = base(); noContrast.variants[1].parameterDifferences = [];
  assert.throws(() => normalizeCourseVariantCommand(noContrast), /diferença intencional/u);
  const duplicate = base(); duplicate.variants[1].label = "Z";
  assert.throws(() => normalizeCourseVariantCommand(duplicate), /rótulos/u);
  const repeatedParameter = base();
  repeatedParameter.variants[1].parameterDifferences.push(
    structuredClone(repeatedParameter.variants[1].parameterDifferences[0])
  );
  assert.throws(() => normalizeCourseVariantCommand(repeatedParameter), /mesmo parâmetro/u);
  const policyArray = base(); policyArray.variants[1].componentPolicyDifference = [];
  assert.throws(() => normalizeCourseVariantCommand(policyArray), /objeto/u);
});

test("desvincular preserva o Curso e só aceita as identidades explícitas", () => {
  assert.deepEqual(normalizeCourseVariantDetachCommand({
    type: "detach_comparison_variant", comparisonSetId: id,
    courseId: "22222222-2222-4222-8222-222222222222"
  }), {
    type: "detach_comparison_variant", comparisonSetId: id,
    courseId: "22222222-2222-4222-8222-222222222222"
  });
  assert.throws(() => normalizeCourseVariantDetachCommand({
    type: "detach_comparison_variant", comparisonSetId: id
  }), /forma esperada/u);
});

function comparisonFixture() {
  return {
    contract: "aralearn.course-variant-comparison.v1", comparisonSetId: id,
    planning: {
      checkpointId, checkpointHash: "a".repeat(64), courseRevision: 3, planVersion: 2,
      snapshot: { contract: "aralearn.course-variant-plan-checkpoint.v1", plan: { objective: "Objetivo comum" } }
    },
    source: {
      courseId: id, title: "Origem", goal: "Objetivo", currentCourseRevision: 4,
      checkpointCourseRevision: 3, changedSinceCheckpoint: true,
      checkpointId, checkpointHash: "a".repeat(64)
    },
    members: [{
      courseId: memberId, position: 0, label: "A", title: "Curso A", goal: "Objetivo A",
      attachedCourseRevision: 1, currentCourseRevision: 2, changedSinceAttached: true,
      parameterDifferences: [], componentPolicyDifference: null,
      effectiveParameters: [{
        scopeKind: "course", scopeId: "course",
        parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
        value: 2, origin: "system_default", sourceScope: null
      }, {
        scopeKind: "lesson", scopeId: "lesson-a",
        parameterId: "explanatory_elaboration_intensity",
        value: 3, origin: "author", sourceScope: { kind: "lesson", ref: "lesson-a" }
      }],
      effectiveComponentPolicies: [{
        scopeKind: "course", scopeId: "course",
        policy: { catalogVersion: "1", availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] },
        origin: "system_default", sourceScope: null
      }, {
        scopeKind: "didactic_microsequence", scopeId: "micro-a",
        policy: { catalogVersion: "1", availability: "allow_only", allowedRefs: ["text"], excludedRefs: [], preferredRefs: ["text"] },
        origin: "author", sourceScope: { kind: "didactic_microsequence", ref: "micro-a" }
      }],
      componentsUsed: [],
      references: { sourceCount: 2, anchorCount: 3, pdfCount: 1, sharedPdfCount: 1, fingerprint: "d".repeat(64) },
      materialization: {
        plannedPartCount: 1, notStartedPartCount: 1, runningPartCount: 0,
        completedPartCount: 0, failedPartCount: 0, studyUnitCount: 0,
        latestUpdatedAt: null, partFingerprint: "b".repeat(64),
        studyUnitFingerprint: "c".repeat(64),
        parts: [{
          partId: "55555555-5555-4555-8555-555555555555", position: 0,
          title: "Parte 1", intent: "Materializar depois.", version: 1,
          status: "not_started", materializationId: null,
          materializationVersion: null, updatedAt: null, studyUnitCount: 0
        }],
        studyUnits: [], truncated: { parts: false, studyUnits: false }
      }
    }],
    differences: {
      referenceCourseId: memberId, declared: [], observedExpected: [],
      accidentalDeviations: [{
        courseId: memberId, referenceCourseId: null, kind: "course_revision",
        scopeKind: null, scopeId: null, key: "courseRevision",
        expectedValue: 1, actualValue: 2,
        explanation: "O Curso mudou depois de ser vinculado à comparação."
      }],
      factual: [], missingData: [{
        courseId: memberId, referenceCourseId: null, kind: "materialization",
        scopeKind: null, scopeId: null, key: "materialization",
        expectedValue: null, actualValue: null,
        explanation: "A materialização independente ainda não foi iniciada."
      }]
    }
  };
}

test("leitura comparativa cerca planejamento, fatos, revisões e desvios", () => {
  const fixture = comparisonFixture();
  fixture.members[0].label = "Z";
  fixture.members.push({
    ...structuredClone(fixture.members[0]),
    courseId: "44444444-4444-4444-8444-444444444444",
    position: 1,
    label: "A",
    title: "Curso A"
  });
  const comparison = normalizeCourseVariantComparison(fixture);
  assert.deepEqual(comparison.members.map(({ position, label }) => ({ position, label })), [
    { position: 0, label: "Z" }, { position: 1, label: "A" }
  ]);
  assert.equal(comparison.differences.referenceCourseId, memberId);
  assert.equal(comparison.planning.snapshot.plan.objective, "Objetivo comum");
  assert.equal(comparison.members[0].materialization.notStartedPartCount, 1);
  assert.equal(comparison.members[0].materialization.studyUnitCount, 0);
  assert.equal(comparison.members[0].references.sharedPdfCount, 1);
  assert.equal(comparison.members[0].effectiveParameters[1].scopeKind, "lesson");
  assert.equal(comparison.members[0].effectiveComponentPolicies[1].scopeKind, "didactic_microsequence");
  assert.equal(comparison.differences.accidentalDeviations[0].kind, "course_revision");
  const invalid = structuredClone(comparison);
  invalid.members[0].materialization.completedPartCount = 1;
  assert.throws(() => normalizeCourseVariantComparison(invalid), /contagens/u);
  const external = structuredClone(comparison);
  external.differences.missingData[0].courseId = "99999999-9999-4999-8999-999999999999";
  assert.throws(() => normalizeCourseVariantComparison(external), /externo/u);
  const reordered = structuredClone(comparison);
  reordered.members.reverse();
  assert.throws(() => normalizeCourseVariantComparison(reordered), /ordem/u);
  const changedReference = structuredClone(comparison);
  changedReference.differences.referenceCourseId = changedReference.members[1].courseId;
  assert.throws(() => normalizeCourseVariantComparison(changedReference), /primeira variante/u);
  const withoutPair = structuredClone(comparison);
  withoutPair.members.pop();
  assert.throws(() => normalizeCourseVariantComparison(withoutPair), /inválida/u);
  const historicalState = structuredClone(comparison);
  historicalState.members[0].detachedAt = null;
  assert.throws(() => normalizeCourseVariantComparison(historicalState), /forma esperada/u);
});

test("domínio de variantes no navegador e na Edge permanece byte a byte igual", () => {
  assert.equal(
    fs.readFileSync(new URL("../../src/domain/courseVariants.js", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../../supabase/functions/_shared/aralearn/runtime/domain/courseVariants.js", import.meta.url), "utf8")
  );
});

test("mudanças de criação e desvinculação preservam os dois contratos distintos", () => {
  const creation = normalizeCourseVariantChange({
    contract: "aralearn.course-variant-comparison-change.v1", comparisonSetId: id,
    sourceCourseId: id, sourceCourseRevision: 3,
    checkpointId: "22222222-2222-4222-8222-222222222222", checkpointHash: "b".repeat(64),
    members: [{
      courseId: "33333333-3333-4333-8333-333333333333", position: 0, label: "Z",
      title: "Curso Z", goal: "Objetivo Z", revision: 1
    }, {
      courseId: "44444444-4444-4444-8444-444444444444", position: 1, label: "A",
      title: "Curso A", goal: "Objetivo A", revision: 1
    }],
    idempotent: false
  });
  assert.equal(creation.members.length, 2);
  assert.deepEqual(creation.members.map(({ position, label }) => ({ position, label })), [
    { position: 0, label: "Z" }, { position: 1, label: "A" }
  ]);
  const detached = normalizeCourseVariantChange({
    contract: "aralearn.course-variant-comparison-change.v1", comparisonSetId: id,
    sourceCourseId: id, courseId: "33333333-3333-4333-8333-333333333333",
    detachedAt: "2026-08-18T12:00:00Z", changed: true, idempotent: false
  });
  assert.equal(detached.changed, true);
  assert.throws(() => normalizeCourseVariantChange({ ...detached, members: [] }), /criação/u);
});

test("lista comparativa conserva somente resumos coerentes de conjuntos", () => {
  const list = normalizeCourseVariantComparisonList({
    contract: "aralearn.course-variant-comparison-list.v1", sourceCourseId: id,
    sourceCourseRevision: 3,
    items: [{
      comparisonSetId: "22222222-2222-4222-8222-222222222222",
      checkpointId: "33333333-3333-4333-8333-333333333333", checkpointHash: "c".repeat(64),
      checkpointCourseRevision: 3, memberCount: 2, attachedCount: 0, detachedCount: 2,
      createdAt: "2026-08-18T12:00:00Z", updatedAt: "2026-08-18T12:01:00Z"
    }]
  });
  assert.equal(list.items[0].detachedCount, 2);
  const invalid = structuredClone(list); invalid.items[0].attachedCount = 2;
  assert.throws(() => normalizeCourseVariantComparisonList(invalid), /contagem/u);
});
