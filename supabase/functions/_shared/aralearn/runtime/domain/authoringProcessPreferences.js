import { UUID_PATTERN } from "./identifiers.js";
import {
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  normalizeCourseDesignPreference,
  normalizeCourseDesignRead,
  normalizeCourseDesignParameterAssignment
} from "./courseDesignParameters.js";

export const AUTHORING_PROCESS_PREFERENCES_CONTRACT = "aralearn.authoring-process-preferences.v1";
export const AUTHORING_PROCESS_CHANGE_CONTRACT = "aralearn.authoring-process-preferences-change.v1";
export const AUTHORING_PROCESS_RESOLUTION_CONTRACT = "aralearn.authoring-process-resolution.v1";
export const AUTHORING_PROCESS_MANDATE_CONTRACT = "aralearn.authoring-process-mandate.v1";

// Cadência organiza o recorte do fluxo. Pausa e tamanhos conservam as próprias
// definições do catálogo: escolher um recorte não muda seus valores.
export const AUTHORING_PROCESS_FOCUS = Object.freeze(["content", "full_cycle"]);
export const AUTHORING_PROCESS_CADENCE = Object.freeze(["microsequence", "part", "batch"]);
export const AUTHORING_PROCESS_REVIEW_POINTS = Object.freeze(["curricular_map", "explanation", "study_unit"]);
export const AUTHORING_PROCESS_PARAMETER_DEFINITIONS = Object.freeze(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.filter(({ group }) => ["cadence", "conversation"].includes(group))
);
const PARAMETER_IDS = new Set(AUTHORING_PROCESS_PARAMETER_DEFINITIONS.map(({ id }) => id));
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

export class AuthoringProcessPreferencesError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthoringProcessPreferencesError";
    this.code = "invalid_authoring_process_preferences";
  }
}

function fail(message) { throw new AuthoringProcessPreferencesError(message); }
function exact(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    fail("A preferência não segue o contrato de processo de autoria.");
  }
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("A revisão das preferências é inválida.");
  return value;
}
function courseId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail("A identidade do curso é inválida.");
  return value;
}
function requestId(value) {
  if (typeof value !== "string" || !REQUEST_ID.test(value)) fail("A identidade da gravação é inválida.");
  return value;
}
function choice(value, options) {
  if (!options.includes(value)) fail("A preferência contém uma opção desconhecida.");
  return value;
}
function timestamp(value, currentRevision) {
  if (value === null && currentRevision === 0) return null;
  if (currentRevision === 0 || typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) fail("A data das preferências é inválida.");
  return new Date(value).toISOString();
}
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export function defaultAuthoringProcessPreferences() {
  return {
    focus: "full_cycle",
    cadence: "part",
    reviewPoints: [...AUTHORING_PROCESS_REVIEW_POINTS],
    parameters: AUTHORING_PROCESS_PARAMETER_DEFINITIONS.map(({ id }) => ({
      parameterId: id, mode: "automatic", value: null
    }))
  };
}

export function normalizeAuthoringProcessPreferences(value) {
  exact(value, ["focus", "cadence", "reviewPoints", "parameters"]);
  if (!Array.isArray(value.reviewPoints) || value.reviewPoints.length > AUTHORING_PROCESS_REVIEW_POINTS.length ||
      new Set(value.reviewPoints).size !== value.reviewPoints.length ||
      value.reviewPoints.some(point => !AUTHORING_PROCESS_REVIEW_POINTS.includes(point))) {
    fail("Os pontos de revisão são inválidos.");
  }
  if (!Array.isArray(value.parameters) || value.parameters.length !== PARAMETER_IDS.size) {
    fail("Informe as preferências de produção e conversa do catálogo.");
  }
  const parameters = value.parameters.map(normalizeCourseDesignPreference);
  if (new Set(parameters.map(({ parameterId }) => parameterId)).size !== PARAMETER_IDS.size ||
      parameters.some(({ parameterId }) => !PARAMETER_IDS.has(parameterId))) {
    fail("As preferências de processo repetem ou incluem parâmetro de conteúdo.");
  }
  return {
    focus: choice(value.focus, AUTHORING_PROCESS_FOCUS),
    cadence: choice(value.cadence, AUTHORING_PROCESS_CADENCE),
    reviewPoints: AUTHORING_PROCESS_REVIEW_POINTS.filter(point => value.reviewPoints.includes(point)),
    parameters: AUTHORING_PROCESS_PARAMETER_DEFINITIONS.map(({ id }) => parameters.find(({ parameterId }) => parameterId === id))
  };
}

export function normalizeAuthoringProcessPreferencesRead(value) {
  exact(value, ["contract", "revision", "preferences", "updatedAt"]);
  if (value.contract !== AUTHORING_PROCESS_PREFERENCES_CONTRACT) fail("O contrato de preferências é desconhecido.");
  const currentRevision = revision(value.revision);
  return { contract: value.contract, revision: currentRevision,
    preferences: normalizeAuthoringProcessPreferences(value.preferences), updatedAt: timestamp(value.updatedAt, currentRevision) };
}

export function normalizeAuthoringProcessPreferencesSave(value) {
  exact(value, ["expectedRevision", "preferences", "requestId"]);
  return { expectedRevision: revision(value.expectedRevision),
    preferences: normalizeAuthoringProcessPreferences(value.preferences), requestId: requestId(value.requestId) };
}

export function normalizeAuthoringProcessPreferencesChange(value, expected = null) {
  exact(value, ["contract", "revision", "requestId", "changed", "idempotent", "preferences", "updatedAt"]);
  if (value.contract !== AUTHORING_PROCESS_CHANGE_CONTRACT || typeof value.changed !== "boolean" ||
      typeof value.idempotent !== "boolean") fail("A confirmação das preferências é inválida.");
  const read = normalizeAuthoringProcessPreferencesRead({ contract: AUTHORING_PROCESS_PREFERENCES_CONTRACT,
    revision: value.revision, preferences: value.preferences, updatedAt: value.updatedAt });
  const result = { ...read, contract: value.contract, requestId: requestId(value.requestId),
    changed: value.changed, idempotent: value.idempotent };
  if (expected) {
    const command = normalizeAuthoringProcessPreferencesSave(expected);
    if (result.requestId !== command.requestId || result.revision !== command.expectedRevision + Number(result.changed) ||
        !equal(result.preferences, command.preferences)) fail("A confirmação não corresponde à preferência enviada.");
  }
  return result;
}

function normalizeConditions(value) {
  if (!Array.isArray(value) || value.length > PARAMETER_IDS.size) fail("As condições do processo são inválidas.");
  const rows = value.map(entry => {
    exact(entry, ["parameterId", "assignment", "sourceScope"]);
    if (!PARAMETER_IDS.has(entry.parameterId)) fail("A condição não pertence ao processo de autoria.");
    exact(entry.sourceScope, ["kind", "ref"]);
    const definition = AUTHORING_PROCESS_PARAMETER_DEFINITIONS.find(({ id }) => id === entry.parameterId);
    if (!definition.supportedScopes.includes(entry.sourceScope.kind) ||
        typeof entry.sourceScope.ref !== "string" || !entry.sourceScope.ref || entry.sourceScope.ref.length > 240) {
      fail("O escopo da condição de autoria é inválido.");
    }
    return { parameterId: entry.parameterId,
      assignment: normalizeCourseDesignParameterAssignment(entry.assignment, entry.parameterId),
      sourceScope: { ...entry.sourceScope } };
  });
  if (new Set(rows.map(({ parameterId }) => parameterId)).size !== rows.length) fail("O processo repete uma condição.");
  return AUTHORING_PROCESS_PARAMETER_DEFINITIONS.flatMap(({ id }) => rows.filter(({ parameterId }) => parameterId === id));
}

export function normalizeAuthoringProcessMandate(value) {
  exact(value, ["contract", "courseId", "accountRevision", "preferences", "courseConditions"]);
  if (value.contract !== AUTHORING_PROCESS_MANDATE_CONTRACT) fail("O mandato de processo é desconhecido.");
  return { contract: value.contract, courseId: courseId(value.courseId), accountRevision: revision(value.accountRevision),
    preferences: normalizeAuthoringProcessPreferences(value.preferences), courseConditions: normalizeConditions(value.courseConditions) };
}

// Recebe resolução autoritativa do curso; não refaz a precedência dos seus
// escopos. O snapshot acordado é dado do fluxo existente, não uma sessão nova.
export function resolveAuthoringProcessPreferences({ account, courseDesign, mandate = null }) {
  const personal = normalizeAuthoringProcessPreferencesRead(account);
  const design = normalizeCourseDesignRead(courseDesign);
  const conditions = normalizeConditions(design.parameters.flatMap(({ parameterId, effectiveAssignment: assignment }) => {
    if (!PARAMETER_IDS.has(parameterId) || !assignment.sourceScope) return [];
    const { mode, value, origin, reason, sourceScope } = assignment;
    return [{ parameterId, assignment: { mode, value, origin, reason }, sourceScope }];
  }));
  const currentPreferences = normalizeAuthoringProcessPreferences({ ...personal.preferences,
    parameters: personal.preferences.parameters.map(parameter => {
      const condition = conditions.find(({ parameterId }) => parameterId === parameter.parameterId);
      if (!condition) return parameter;
      const { mode, value } = condition.assignment;
      // Valor automático já escolhido pertence ao curso/materialização, não
      // vira um novo valor pessoal fixo. A condição integral aparece na origem.
      return { parameterId: parameter.parameterId, mode, value: mode === "automatic" ? null : value };
    }) });
  const agreed = mandate === null ? null : normalizeAuthoringProcessMandate(mandate);
  if (agreed && agreed.courseId !== design.courseId) fail("O mandato pertence a outro curso.");
  const preferences = agreed ? agreed.preferences : currentPreferences;
  const personalPreferencesChanged = Boolean(agreed && agreed.accountRevision !== personal.revision);
  const courseConditionsChanged = Boolean(agreed && !equal(agreed.courseConditions, conditions));
  const conflicts = design.parameters.filter(({ parameterId }) => PARAMETER_IDS.has(parameterId))
    .flatMap(({ parameterId, conflicts: values }) => values.map(value => ({ parameterId, ...structuredClone(value) })));
  const researchConflicts = conditions.filter(condition => condition.assignment.origin === "research_condition" &&
    !equal(preferences.parameters.find(({ parameterId }) => parameterId === condition.parameterId), {
      parameterId: condition.parameterId, mode: condition.assignment.mode, value: condition.assignment.value
    })).map(({ parameterId }) => parameterId);
  return {
    contract: AUTHORING_PROCESS_RESOLUTION_CONTRACT,
    courseId: design.courseId, courseRevision: design.courseRevision, accountRevision: personal.revision,
    preferences: structuredClone(preferences), currentPreferences,
    source: agreed ? "mandate" : personal.revision ? "account" : "product_default",
    courseConditions: conditions,
    personalPreferencesChanged, courseConditionsChanged, conflicts, researchConflicts,
    requiresReconciliation: courseConditionsChanged || conflicts.length > 0 || researchConflicts.length > 0
  };
}

export function createAuthoringProcessMandate(resolution, preferences = resolution?.currentPreferences) {
  if (resolution?.contract !== AUTHORING_PROCESS_RESOLUTION_CONTRACT) fail("Leia o processo corrente antes de combinar o mandato.");
  const result = normalizeAuthoringProcessMandate({ contract: AUTHORING_PROCESS_MANDATE_CONTRACT,
    courseId: resolution.courseId, accountRevision: resolution.accountRevision,
    preferences, courseConditions: resolution.courseConditions });
  if (resolution.conflicts?.length || result.courseConditions.some(condition => condition.assignment.origin === "research_condition" &&
    !equal(result.preferences.parameters.find(({ parameterId }) => parameterId === condition.parameterId), {
      parameterId: condition.parameterId, mode: condition.assignment.mode, value: condition.assignment.value
    }))) fail("O mandato precisa preservar as condições de pesquisa do curso.");
  return result;
}
