import { UUID_PATTERN } from "./identifiers.js";

export const APPLIED_EXPLANATION_BASIS_CONTRACT = "aralearn.applied-explanation-basis.v1";
const HASH = /^[a-f0-9]{64}$/u;

function fail() {
  throw Object.assign(new TypeError("O registro da base explicativa aplicada é inválido."), {
    code: "invalid_applied_explanation_basis"
  });
}
function identity(value) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 240 || /[\p{Cc}]/u.test(value)) fail();
  return value;
}
function courseId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail();
  return value.toLowerCase();
}

// Leitura de proveniência; não é entrada de composição nem declaração de revisão.
export function normalizeAppliedExplanationBasis(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some(key => !["contract", "microsequenceId", "basisHash", "entityVersion", "sourceCourseId"].includes(key)) ||
      value.contract !== APPLIED_EXPLANATION_BASIS_CONTRACT || typeof value.basisHash !== "string" ||
      !HASH.test(value.basisHash) || !Number.isSafeInteger(value.entityVersion) || value.entityVersion < 1) fail();
  return { contract: value.contract, microsequenceId: identity(value.microsequenceId),
    basisHash: value.basisHash, entityVersion: value.entityVersion,
    ...(Object.hasOwn(value, "sourceCourseId") ? { sourceCourseId: courseId(value.sourceCourseId) } : {}) };
}

export function exportAppliedExplanationBasis(value, currentCourseId) {
  const basis = normalizeAppliedExplanationBasis(value);
  return basis === null ? null : { ...basis, sourceCourseId: basis.sourceCourseId || courseId(currentCourseId) };
}

export function collectAppliedExplanationBases(rows, currentCourseId) {
  if (!Array.isArray(rows)) fail();
  const seen = new Set();
  return rows.flatMap(row => {
    if (row.entityType !== "study_unit" || row.appliedExplanationBasis == null) return [];
    const studyUnitId = identity(row.entityId);
    if (seen.has(studyUnitId)) fail();
    seen.add(studyUnitId);
    return [{ studyUnitId, basis: exportAppliedExplanationBasis(row.appliedExplanationBasis, currentCourseId) }];
  });
}
