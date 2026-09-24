import { normalizePedagogicalAudit } from "./coursePedagogicalAudit.js";

const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const TARGETS = new Set(["study_unit", "microsequence_explanation"]);
const OUTCOMES = new Set(["consistent", "needs_attention", "human_preference_retained"]);
const plain = value => value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function fail() { throw Object.assign(new TypeError("O parecer de inspeção por IA é inválido."), { code: "invalid_course_ai_inspection" }); }
function exact(value, required, optional = []) {
  if (!plain(value) || required.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail();
}
const boundedText = (value, limit) => typeof value === "string" && Boolean(value.trim()) &&
  [...value].length <= limit && ![...value].some(character => {
    const code = character.codePointAt(0);
    return code < 32 && ![9, 10, 13].includes(code) || code === 127;
  });

// The report is the producer's semantic judgment, never a server certification.
export function normalizeCourseContentInspectionReport(value) {
  exact(value, ["summary", "outcome", "findings"], ["checks"]);
  if (!boundedText(value.summary, 2000) || !OUTCOMES.has(value.outcome) ||
      !Array.isArray(value.findings) || value.findings.length > 20 ||
      value.findings.some(item => !boundedText(item, 1000)) ||
      value.outcome === "needs_attention" && !value.findings.length ||
      value.outcome === "consistent" && value.findings.length) fail();
  const checks = value.checks === undefined ? null : normalizePedagogicalAudit(value.checks);
  if (checks?.some(check => check.result === "insufficient") && value.outcome !== "needs_attention") fail();
  return { summary: value.summary, outcome: value.outcome, findings: [...value.findings], ...(checks ? { checks } : {}) };
}

export function isCourseContentInspectionSatisfied(inspection) {
  return inspection?.state === "current" && inspection.report?.outcome === "consistent" &&
    Array.isArray(inspection.report.checks) && inspection.report.checks.length === 5 &&
    inspection.report.checks.every(check => check.result !== "insufficient");
}

export function normalizeCourseContentInspectionState(value) {
  exact(value, ["state", "basisHash"], ["inspectedAt", "report"]);
  if (!["unregistered", "pending", "current"].includes(value.state) || !HASH.test(value.basisHash)) fail();
  if (value.state === "current") {
    if (typeof value.inspectedAt !== "string" || !Number.isFinite(Date.parse(value.inspectedAt))) fail();
    return { ...value, report: normalizeCourseContentInspectionReport(value.report) };
  }
  if (Object.hasOwn(value, "inspectedAt") || Object.hasOwn(value, "report")) fail();
  return { ...value };
}

export function normalizeCourseContentInspection(value, request = {}) {
  const change = value?.contract === "aralearn.course-ai-inspection-change.v1";
  exact(value, ["contract", "courseId", "courseRevision", "targetKind", "targetId", "basisHash", "inspection",
    ...(change ? ["changed", "idempotent"] : [])], ["pedagogicalBasis"]);
  if (!change && value.contract !== "aralearn.course-ai-inspection.v1" || !UUID.test(value.courseId) ||
      !Number.isSafeInteger(value.courseRevision) || value.courseRevision < 1 || !TARGETS.has(value.targetKind) ||
      !boundedText(value.targetId, 300) || !HASH.test(value.basisHash) ||
      ["courseId", "targetKind", "targetId"].some(key => request[key] !== undefined && request[key] !== value[key])) fail();
  const inspection = normalizeCourseContentInspectionState(value.inspection);
  if (value.pedagogicalBasis !== undefined && (!plain(value.pedagogicalBasis) ||
      value.pedagogicalBasis.targetKind !== value.targetKind || value.pedagogicalBasis.targetId !== value.targetId ||
      !plain(value.pedagogicalBasis.microsequence) || !Array.isArray(value.pedagogicalBasis.studyUnits) ||
      !Array.isArray(value.pedagogicalBasis.planItems) || !Array.isArray(value.pedagogicalBasis.dependencies))) fail();
  if (inspection.basisHash !== value.basisHash || change && (typeof value.changed !== "boolean" ||
      typeof value.idempotent !== "boolean" || inspection.state !== "current" ||
      request.expectedBasisHash !== undefined && value.basisHash !== request.expectedBasisHash)) fail();
  return { ...value, inspection };
}
