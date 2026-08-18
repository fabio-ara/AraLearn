import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCourseVariantCommand,
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantComparison,
  normalizeCourseVariantChange
} from "../../src/domain/courseVariants.js";

const id = "11111111-1111-4111-8111-111111111111";
const base = () => ({
  type: "create_comparison_variants", comparisonSetId: id, expectedCourseRevision: 3,
  variants: [
    { label: "A", title: "Curso A", goal: "Objetivo A", parameterDifferences: [], componentPolicyDifference: null },
    { label: "B", title: "Curso B", goal: "Objetivo B", parameterDifferences: [{ scopeKind: "course", scopeId: "course", parameterId: "new_analysis_unit_ceiling_per_expository_study_unit", value: 1, rationale: "Menor densidade conceitual." }], componentPolicyDifference: null }
  ]
});

test("variantes exigem contraste intencional e rótulos distintos", () => {
  const command = normalizeCourseVariantCommand(base());
  assert.equal(command.variants.length, 2);
  const noContrast = base(); noContrast.variants[1].parameterDifferences = [];
  assert.throws(() => normalizeCourseVariantCommand(noContrast), /diferença intencional/u);
  const duplicate = base(); duplicate.variants[1].label = "A";
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

test("leitura comparativa cerca origem, materialização e diferenças declaradas", () => {
  const comparison = normalizeCourseVariantComparison({
    contract: "aralearn.course-variant-comparison.v1", comparisonSetId: id,
    source: {
      courseId: id, title: "Origem", goal: "Objetivo", currentCourseRevision: 4,
      checkpointCourseRevision: 3, changedSinceCheckpoint: true,
      checkpointId: "22222222-2222-4222-8222-222222222222", checkpointHash: "a".repeat(64)
    },
    members: [{
      courseId: "33333333-3333-4333-8333-333333333333", label: "A", title: "Curso A", goal: "Objetivo A",
      attachedCourseRevision: 1, currentCourseRevision: 2, changedSinceAttached: true,
      detachedAt: null, parameterDifferences: [], componentPolicyDifference: null,
      materialization: { partCount: 2, completedCount: 1, runningCount: 0, latestUpdatedAt: "2026-08-18T12:00:00Z" }
    }]
  });
  assert.equal(comparison.members[0].materialization.partCount, 2);
  const invalid = structuredClone(comparison);
  invalid.members[0].materialization.runningCount = -1;
  assert.throws(() => normalizeCourseVariantComparison(invalid), /contagem/u);
});

test("mudanças de criação e desvinculação preservam os dois contratos distintos", () => {
  const creation = normalizeCourseVariantChange({
    contract: "aralearn.course-variant-comparison-change.v1", comparisonSetId: id,
    sourceCourseId: id, sourceCourseRevision: 3,
    checkpointId: "22222222-2222-4222-8222-222222222222", checkpointHash: "b".repeat(64),
    members: [{
      courseId: "33333333-3333-4333-8333-333333333333", label: "A",
      title: "Curso A", goal: "Objetivo A", revision: 1
    }, {
      courseId: "44444444-4444-4444-8444-444444444444", label: "B",
      title: "Curso B", goal: "Objetivo B", revision: 1
    }],
    idempotent: false
  });
  assert.equal(creation.members.length, 2);
  const detached = normalizeCourseVariantChange({
    contract: "aralearn.course-variant-comparison-change.v1", comparisonSetId: id,
    sourceCourseId: id, courseId: "33333333-3333-4333-8333-333333333333",
    detachedAt: "2026-08-18T12:00:00Z", changed: true, idempotent: false
  });
  assert.equal(detached.changed, true);
  assert.throws(() => normalizeCourseVariantChange({ ...detached, members: [] }), /criação/u);
});
