import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLIED_EXPLANATION_BASIS_CONTRACT,
  normalizeAppliedExplanationBasis,
  exportAppliedExplanationBasis,
  collectAppliedExplanationBases
} from "../../src/domain/appliedExplanationBasis.js";

const COURSE = "20000000-0000-4000-8000-000000000001";
const COPY = "20000000-0000-4000-8000-000000000002";
const basis = { contract: APPLIED_EXPLANATION_BASIS_CONTRACT, microsequenceId: "micro-1", basisHash: "a".repeat(64), entityVersion: 2 };

test("base aplicada é proveniência estrita, com ausência histórica explícita", () => {
  assert.equal(normalizeAppliedExplanationBasis(null), null);
  assert.deepEqual(normalizeAppliedExplanationBasis(basis), basis);
  assert.notEqual(normalizeAppliedExplanationBasis(basis), basis);
  for (const value of [undefined, {}, [], { ...basis, reviewed: true }, { ...basis, entityVersion: 0 },
    { ...basis, entityVersion: 1.5 }, { ...basis, entityVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...basis, microsequenceId: " micro-1" }, { ...basis, basisHash: "A".repeat(64) },
    { ...basis, sourceCourseId: null }, { ...basis, contract: "aralearn.content-review.v1" }]) {
    assert.throws(() => normalizeAppliedExplanationBasis(value), { code: "invalid_applied_explanation_basis" });
  }
});

test("exportação e cópias sucessivas conservam a origem sem fabricar aplicação no destino", () => {
  const origin = exportAppliedExplanationBasis(basis, COURSE);
  assert.deepEqual(origin, { ...basis, sourceCourseId: COURSE });
  assert.deepEqual(exportAppliedExplanationBasis(origin, COPY), origin);
  assert.equal(exportAppliedExplanationBasis(null, COURSE), null);
  const rows = [
    { entityType: "microsequence", entityId: "micro-1" },
    { entityType: "study_unit", entityId: "legacy" },
    { entityType: "study_unit", entityId: "unit-1", appliedExplanationBasis: basis },
    { entityType: "study_unit", entityId: "unit-2", appliedExplanationBasis: origin }
  ];
  assert.deepEqual(collectAppliedExplanationBases(rows, COURSE), [
    { studyUnitId: "unit-1", basis: origin }, { studyUnitId: "unit-2", basis: origin }
  ]);
  assert.throws(() => collectAppliedExplanationBases([...rows, rows[2]], COURSE), { code: "invalid_applied_explanation_basis" });
  assert.deepEqual(basis, normalizeAppliedExplanationBasis(basis));
});
