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
    sourceLinks: normalizeCourseSourceLinks(source.sourceLinks, { allowLegacyIds: true })
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

export const COURSE_COMPOSITION_APPLICATION_ORIGINS = Object.freeze([
  "manual", "provider_assistance"
]);
