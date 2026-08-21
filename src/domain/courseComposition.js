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

function sourceSelection(value, { sourceCourseId, didacticMicrosequenceId, studyUnitId }) {
  const source = exactObject(value, new Set([
    "courseId", "moduleId", "lessonId", "microsequenceId", "studyUnitId"
  ]), "Posição da edição pessoal inválida.");
  const normalized = {
    courseId: uuid(source.courseId, "Curso da posição"),
    moduleId: opaqueId(source.moduleId, "Módulo da posição"),
    lessonId: opaqueId(source.lessonId, "Lição da posição"),
    microsequenceId: opaqueId(source.microsequenceId, "Microssequência da posição"),
    studyUnitId: opaqueId(source.studyUnitId, "Unidade da posição")
  };
  if (normalized.courseId !== sourceCourseId ||
      normalized.microsequenceId !== didacticMicrosequenceId ||
      normalized.studyUnitId !== studyUnitId) {
    fail("A posição não corresponde à edição pessoal.");
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

export function normalizePersonalCourseCopyEditCommand(value) {
  const source = exactObject(value, new Set([
    "requestId", "sourceCourseId", "expectedSourceCourseRevision",
    "expectedStudyUnitVersion", "didacticMicrosequenceId", "studyUnit", "origin"
  ]), "Edição da cópia pessoal inválida.");
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

export function normalizePersonalCourseCopyEditIntent(value) {
  const source = exactObject(value, new Set([
    "requestId", "sourceCourseId", "expectedSourceCourseRevision",
    "expectedStudyUnitVersion", "didacticMicrosequenceId", "studyUnit", "origin",
    "targetId", "sourceSelection"
  ]), "Edição pessoal contextual inválida.");
  const command = normalizePersonalCourseCopyEditCommand({
    requestId: source.requestId,
    sourceCourseId: source.sourceCourseId,
    expectedSourceCourseRevision: source.expectedSourceCourseRevision,
    expectedStudyUnitVersion: source.expectedStudyUnitVersion,
    didacticMicrosequenceId: source.didacticMicrosequenceId,
    studyUnit: source.studyUnit,
    origin: source.origin
  });
  return {
    ...command,
    targetId: opaqueId(source.targetId, "Alvo da edição"),
    sourceSelection: sourceSelection(source.sourceSelection, {
      sourceCourseId: command.sourceCourseId,
      didacticMicrosequenceId: command.didacticMicrosequenceId,
      studyUnitId: command.studyUnit.id
    })
  };
}

export function normalizePersonalCourseCopyEditReceipt(value, commandValue) {
  const command = normalizePersonalCourseCopyEditCommand(commandValue);
  const receipt = exactObject(value, new Set([
    "contract", "operation", "sourceCourseId", "sourceCourseRevision",
    "targetCourseId", "targetCourseRevision", "studyUnitId", "studyUnitVersion",
    "applicationOrigin", "channel", "createdCopy", "changed", "idempotent",
    "updatedAt"
  ]), "Confirmação da cópia pessoal inválida.");
  const changed = receipt.changed;
  if (receipt.contract !== "aralearn.personal-course-copy-edit.v1" ||
      receipt.operation !== "commit_personal_course_copy_edit" ||
      uuid(receipt.sourceCourseId, "Curso de origem confirmado") !==
        command.sourceCourseId ||
      receipt.sourceCourseRevision !== command.expectedSourceCourseRevision ||
      receipt.studyUnitId !== command.studyUnit.id ||
      receipt.applicationOrigin !== command.origin || receipt.channel !== "application" ||
      typeof receipt.createdCopy !== "boolean" || typeof changed !== "boolean" ||
      typeof receipt.idempotent !== "boolean" ||
      typeof receipt.updatedAt !== "string" || Number.isNaN(Date.parse(receipt.updatedAt))) {
    fail("A confirmação não corresponde à cópia pessoal solicitada.");
  }
  if (!changed) {
    if (receipt.targetCourseId !== null || receipt.targetCourseRevision !== null ||
        receipt.createdCopy || receipt.studyUnitVersion !==
          command.expectedStudyUnitVersion) {
      fail("A confirmação não corresponde à cópia pessoal solicitada.");
    }
    return {
      courseId: null,
      sourceCourseId: command.sourceCourseId,
      sourceCourseRevision: command.expectedSourceCourseRevision,
      courseRevision: null,
      studyUnitId: command.studyUnit.id,
      studyUnitVersion: command.expectedStudyUnitVersion,
      operation: "commit_personal_course_copy_edit",
      createdCopy: false,
      changed: false,
      idempotent: receipt.idempotent,
      channel: "application",
      origin: command.origin,
      updatedAt: receipt.updatedAt
    };
  }
  const targetCourseId = uuid(receipt.targetCourseId, "Cópia pessoal confirmada");
  if (targetCourseId === command.sourceCourseId || receipt.targetCourseRevision !== 2 ||
      receipt.studyUnitVersion !== 2 || !receipt.createdCopy) {
    fail("A confirmação não corresponde à cópia pessoal solicitada.");
  }
  return {
    courseId: targetCourseId,
    sourceCourseId: command.sourceCourseId,
    sourceCourseRevision: command.expectedSourceCourseRevision,
    courseRevision: 2,
    studyUnitId: command.studyUnit.id,
    studyUnitVersion: 2,
    operation: "commit_personal_course_copy_edit",
    createdCopy: true,
    changed: true,
    idempotent: receipt.idempotent,
    channel: "application",
    origin: command.origin,
    updatedAt: receipt.updatedAt
  };
}

export const COURSE_COMPOSITION_APPLICATION_ORIGINS = Object.freeze([
  "manual", "provider_assistance"
]);
