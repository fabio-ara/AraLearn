import { UUID_PATTERN } from "./identifiers.js";
import { validateCourseEntityContent } from "./aralearnProject.js";
import { normalizeCourseSourceLinks } from "./courseSources.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const APPLICATION_ORIGINS = new Set(["manual", "provider_assistance"]);

function fail(message) {
  throw new TypeError(message);
}

function exactObject(value, fields, message) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== fields.size ||
      Object.keys(value).some((field) => !fields.has(field))) {
    fail(message);
  }
  return value;
}

function uuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) fail(`${label} inválido.`);
  return normalized;
}

function opaqueId(value, label) {
  if (typeof value !== "string" || value !== value.trim() || !value ||
      value.length > 480 || [...value].length > 240 ||
      new TextEncoder().encode(value).byteLength > 960 ||
      [...value].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint < 32 || codePoint >= 127 && codePoint <= 159;
      })) {
    fail(`${label} inválida.`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} inválida.`);
  return value;
}

function requestId(value) {
  if (typeof value !== "string" || value !== value.trim() ||
      !REQUEST_ID_PATTERN.test(value)) {
    fail("Identidade da alteração inválida.");
  }
  return value;
}

function applicationOrigin(value) {
  if (!APPLICATION_ORIGINS.has(value)) fail("Origem da edição inválida.");
  return value;
}

function normalizeStudyUnit(value) {
  const candidate = structuredClone(value);
  const validation = validateCourseEntityContent("study_unit", candidate);
  if (!validation.valid) fail("Unidade de estudo inválida.");
  return validation.normalized;
}

export function normalizeCourseMetadata(value) {
  const source = exactObject(value, new Set(["title", "objective"]), "Identidade do Curso inválida.");
  const normalized = {};
  for (const [field, maximum] of [["title", 300], ["objective", 2_000]]) {
    const text = typeof source[field] === "string" ? source[field].trim() : "";
    if (!text || text.length > maximum || [...text].some((character) => {
      const point = character.codePointAt(0);
      return point < 32 && ![9, 10, 13].includes(point) || point >= 127 && point <= 159;
    })) fail("Identidade do Curso inválida.");
    normalized[field] = text;
  }
  return normalized;
}

export function normalizeFocalStudyUnitCompositionIntent(value) {
  const source = exactObject(value, new Set([
    "requestId", "courseId", "expectedCourseRevision", "expectedStudyUnitVersion",
    "didacticMicrosequenceId", "studyUnit", "origin"
  ]), "Edição contextual inválida.");
  return {
    requestId: requestId(source.requestId),
    courseId: uuid(source.courseId, "Curso"),
    expectedCourseRevision: positiveInteger(
      source.expectedCourseRevision,
      "Revisão do Curso"
    ),
    expectedStudyUnitVersion: positiveInteger(
      source.expectedStudyUnitVersion,
      "Versão da Unidade de estudo"
    ),
    didacticMicrosequenceId: opaqueId(
      source.didacticMicrosequenceId,
      "Identidade da microssequência"
    ),
    studyUnit: normalizeStudyUnit(source.studyUnit),
    origin: applicationOrigin(source.origin)
  };
}

export function normalizeFocalStudyUnitCompositionCommand(value) {
  const source = exactObject(value, new Set([
    "requestId", "courseId", "expectedCourseRevision", "expectedStudyUnitVersion",
    "didacticMicrosequenceId", "studyUnit", "sourceLinks", "origin"
  ]), "Composição contextual inválida.");
  const intent = normalizeFocalStudyUnitCompositionIntent({
    requestId: source.requestId,
    courseId: source.courseId,
    expectedCourseRevision: source.expectedCourseRevision,
    expectedStudyUnitVersion: source.expectedStudyUnitVersion,
    didacticMicrosequenceId: source.didacticMicrosequenceId,
    studyUnit: source.studyUnit,
    origin: source.origin
  });
  return {
    ...intent,
    sourceLinks: normalizeCourseSourceLinks(source.sourceLinks)
  };
}

export function normalizeFocalStudyUnitCompositionReceipt(value, command) {
  const receipt = exactObject(value, new Set([
    "courseId", "revision", "operation", "createdCount", "updatedCount",
    "upsertedCount", "deletedCount", "idempotent", "updatedAt", "channel",
    "applicationOrigin", "expectedStudyUnitVersion", "deepLink"
  ]), "Confirmação da edição contextual inválida.");
  const revision = positiveInteger(receipt.revision, "Revisão confirmada do Curso");
  const counts = [
    receipt.createdCount,
    receipt.updatedCount,
    receipt.upsertedCount,
    receipt.deletedCount
  ];
  const expectedRevision = command.expectedCourseRevision + (receipt.updatedCount === 1 ? 1 : 0);
  if (uuid(receipt.courseId, "Curso confirmado") !== command.courseId ||
      receipt.operation !== "commit_course_composition" ||
      counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
      receipt.createdCount !== 0 || receipt.updatedCount > 1 ||
      receipt.upsertedCount !== receipt.updatedCount || receipt.deletedCount !== 0 ||
      revision !== expectedRevision || typeof receipt.idempotent !== "boolean" ||
      receipt.channel !== "application" ||
      receipt.applicationOrigin !== command.origin ||
      receipt.expectedStudyUnitVersion !== command.expectedStudyUnitVersion ||
      typeof receipt.updatedAt !== "string" || Number.isNaN(Date.parse(receipt.updatedAt)) ||
      typeof receipt.deepLink !== "string" || !receipt.deepLink.trim()) {
    fail("A confirmação não corresponde à edição contextual.");
  }
  return {
    courseId: command.courseId,
    courseRevision: revision,
    studyUnitId: command.studyUnit.id,
    studyUnitVersion: command.expectedStudyUnitVersion + receipt.updatedCount,
    changed: receipt.updatedCount === 1,
    idempotent: receipt.idempotent,
    channel: "application",
    origin: command.origin,
    updatedAt: receipt.updatedAt
  };
}

export function normalizeOwnedCourseCopyRecoveryCommand(value) {
  const source = exactObject(value, new Set([
    "requestId", "sourceCourseId", "expectedSourceCourseRevision",
    "expectedStudyUnitVersion", "didacticMicrosequenceId", "studyUnit", "origin"
  ]), "Consulta de recuperação inválida.");
  return {
    requestId: requestId(source.requestId),
    sourceCourseId: uuid(source.sourceCourseId, "Curso de origem"),
    expectedSourceCourseRevision: positiveInteger(
      source.expectedSourceCourseRevision,
      "Revisão do Curso de origem"
    ),
    expectedStudyUnitVersion: positiveInteger(
      source.expectedStudyUnitVersion,
      "Versão da Unidade de estudo"
    ),
    didacticMicrosequenceId: opaqueId(
      source.didacticMicrosequenceId,
      "Identidade da microssequência"
    ),
    studyUnit: normalizeStudyUnit(source.studyUnit),
    origin: applicationOrigin(source.origin)
  };
}

export function normalizeOwnedCourseCopyRecoveryReceipt(value, commandValue) {
  const command = normalizeOwnedCourseCopyRecoveryCommand(commandValue);
  const receipt = exactObject(value, new Set([
    "contract", "status", "sourceCourseId", "targetCourseId", "currentCourseRevision",
    "studyUnitId", "currentStudyUnitVersion", "initialCourseRevision",
    "initialStudyUnitVersion", "applicationOrigin", "confirmedAt"
  ]), "Resposta da recuperação inválida.");
  if (receipt.contract !== "aralearn.owned-course-copy-recovery.v1" ||
      !new Set(["confirmed", "unchanged", "unresolved"]).has(receipt.status) ||
      receipt.sourceCourseId !== command.sourceCourseId ||
      receipt.studyUnitId !== command.studyUnit.id ||
      receipt.applicationOrigin !== command.origin) fail("A recuperação não corresponde ao rascunho.");
  if (receipt.status === "confirmed") {
    if (uuid(receipt.targetCourseId, "Curso recuperado") === command.sourceCourseId ||
        positiveInteger(receipt.currentCourseRevision, "Revisão atual") <
          positiveInteger(receipt.initialCourseRevision, "Revisão inicial") ||
        !Number.isSafeInteger(receipt.initialStudyUnitVersion) || receipt.initialStudyUnitVersion < 1 ||
        receipt.currentStudyUnitVersion !== null &&
          (!Number.isSafeInteger(receipt.currentStudyUnitVersion) || receipt.currentStudyUnitVersion < 1) ||
        typeof receipt.confirmedAt !== "string" || Number.isNaN(Date.parse(receipt.confirmedAt))) {
      fail("A recuperação não comprova um Curso próprio.");
    }
  } else if (["targetCourseId", "currentCourseRevision", "currentStudyUnitVersion",
    "initialCourseRevision", "initialStudyUnitVersion", "confirmedAt"].some((key) => receipt[key] !== null)) {
    fail("A recuperação inconclusiva não pode indicar um Curso confirmado.");
  }
  return structuredClone(receipt);
}

export const COURSE_COMPOSITION_APPLICATION_ORIGINS = Object.freeze([
  "manual", "provider_assistance"
]);
