import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCourseVariantCommand,
  normalizeCourseVariantDetachCommand
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
