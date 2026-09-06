import { UUID_PATTERN } from "./identifiers.js";
import {
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  normalizeCourseDesignPreference,
  normalizeCourseDesignParameterAssignment,
  normalizeCourseDesignChange
} from "./courseDesignParameters.js";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SCOPES = new Set(["course", "module", "lesson", "didactic_microsequence", "study_unit"]);
const CATALOG_ORDER = new Map(COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id }, index) => [id, index]));

export class AuthoringProfilesError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthoringProfilesError";
    this.code = "invalid_authoring_profile";
  }
}

function fail(message) { throw new AuthoringProfilesError(message); }
function exact(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(value, field))) fail("O perfil não segue o contrato esperado.");
  return value;
}
function uuid(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail("A identidade do perfil ou curso é inválida.");
  return value;
}
function revision(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) fail("A revisão do perfil ou curso é inválida.");
  return value;
}
function requestId(value) {
  if (typeof value !== "string" || !REQUEST_ID.test(value)) fail("A identidade do pedido é inválida.");
  return value;
}
function text(value, maximum, { layout = false } = {}) {
  const invalidControl = typeof value === "string" && [...value].some((character) => {
    const point = character.codePointAt(0);
    return point >= 127 && point <= 159 || point < 32 && (!layout || ![9, 10, 13].includes(point));
  });
  if (typeof value !== "string" || !value.trim() || value !== value.trim() ||
      [...value].length > maximum || invalidControl) fail("O nome ou a referência do perfil é inválido.");
  return value;
}
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) fail("A data do perfil é inválida.");
  return new Date(value).toISOString();
}
function boolean(value) {
  if (typeof value !== "boolean") fail("A confirmação do perfil é inválida.");
  return value;
}
function scope(value) {
  exact(value, ["kind", "ref"]);
  if (!SCOPES.has(value.kind)) fail("O escopo da preferência é inválido.");
  return { kind: value.kind, ref: value.kind === "course" ? uuid(value.ref) : text(value.ref, 240) };
}
function sizeBound(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) {
    fail("O perfil ou sua prévia excede o limite de leitura.");
  }
  return value;
}

export function normalizeAuthoringProfilePreferences(value) {
  if (!Array.isArray(value) || !value.length || value.length > CATALOG_ORDER.size) {
    fail("Selecione preferências do catálogo para o perfil.");
  }
  const preferences = value.map((entry) => normalizeCourseDesignPreference(entry));
  if (new Set(preferences.map(({ parameterId }) => parameterId)).size !== preferences.length) {
    fail("O perfil repete uma preferência.");
  }
  return preferences.sort((left, right) => CATALOG_ORDER.get(left.parameterId) - CATALOG_ORDER.get(right.parameterId));
}

export function normalizeAuthoringProfile(value) {
  exact(value, ["profileId", "revision", "name", "preferences", "createdAt", "updatedAt"]);
  return sizeBound({ profileId: uuid(value.profileId), revision: revision(value.revision),
    name: text(value.name, 100), preferences: normalizeAuthoringProfilePreferences(value.preferences),
    createdAt: instant(value.createdAt), updatedAt: instant(value.updatedAt) });
}

export function normalizeAuthoringProfileList(value) {
  exact(value, ["contract", "profiles"]);
  if (value.contract !== "aralearn.authoring-profiles.v1" || !Array.isArray(value.profiles) || value.profiles.length > 32) {
    fail("A lista de perfis é inválida.");
  }
  const profiles = value.profiles.map(normalizeAuthoringProfile);
  if (new Set(profiles.map(({ profileId }) => profileId)).size !== profiles.length) fail("A lista repete um perfil.");
  return sizeBound({ contract: value.contract, profiles });
}

export function normalizeAuthoringProfileSave(value) {
  exact(value, ["profileId", "expectedRevision", "name", "preferences", "requestId"]);
  return { profileId: uuid(value.profileId), expectedRevision: revision(value.expectedRevision, 0),
    name: text(value.name, 100), preferences: normalizeAuthoringProfilePreferences(value.preferences), requestId: requestId(value.requestId) };
}

export function normalizeAuthoringProfileDelete(value) {
  exact(value, ["profileId", "expectedRevision", "requestId"]);
  return { profileId: uuid(value.profileId), expectedRevision: revision(value.expectedRevision), requestId: requestId(value.requestId) };
}

export function normalizeAuthoringProfileChange(value, expected = null) {
  exact(value, ["contract", "profileId", "revision", "requestId", "idempotent", "changed", "deleted", "profile"]);
  if (value.contract !== "aralearn.authoring-profile-change.v1") fail("A confirmação do perfil usa contrato incompatível.");
  const result = { contract: value.contract, profileId: uuid(value.profileId), revision: revision(value.revision),
    requestId: requestId(value.requestId), idempotent: boolean(value.idempotent), changed: boolean(value.changed),
    deleted: boolean(value.deleted), profile: value.profile == null ? null : normalizeAuthoringProfile(value.profile) };
  if (result.deleted !== (result.profile === null) || result.profile &&
      (result.profile.profileId !== result.profileId || result.profile.revision !== result.revision)) {
    fail("A confirmação não corresponde ao perfil devolvido.");
  }
  if (expected && (result.profileId !== expected.profileId || result.requestId !== expected.requestId ||
      result.revision !== expected.expectedRevision + (result.changed ? 1 : 0) ||
      Object.hasOwn(expected, "deleted") && result.deleted !== expected.deleted ||
      expected.name != null && result.profile?.name !== expected.name ||
      expected.preferences && JSON.stringify(result.profile?.preferences) !== JSON.stringify(expected.preferences))) {
    fail("A confirmação não corresponde ao pedido do perfil.");
  }
  return result;
}

export function normalizeAuthoringProfileExceptionPolicy(value) {
  exact(value, ["mode", "exceptions"]);
  if (!new Set(["preserve", "remove_selected"]).has(value.mode) || !Array.isArray(value.exceptions) ||
      value.mode === "preserve" && value.exceptions.length || value.mode === "remove_selected" && !value.exceptions.length) {
    fail("Escolha explicitamente quais exceções devem ser preservadas ou removidas.");
  }
  const exceptions = value.exceptions.map((entry) => {
    exact(entry, ["parameterId", "scope"]);
    if (!CATALOG_ORDER.has(entry.parameterId)) fail("A exceção não pertence ao catálogo.");
    const normalizedScope = scope(entry.scope);
    if (normalizedScope.kind === "course") fail("A remoção de exceções recebe somente escopos descendentes.");
    return { parameterId: entry.parameterId, scope: normalizedScope };
  });
  const keys = exceptions.map((entry) => `${entry.parameterId}\u0000${entry.scope.kind}\u0000${entry.scope.ref}`);
  if (new Set(keys).size !== keys.length) fail("A seleção repete uma exceção.");
  exceptions.sort((left, right) => CATALOG_ORDER.get(left.parameterId) - CATALOG_ORDER.get(right.parameterId) ||
    left.scope.kind.localeCompare(right.scope.kind) || left.scope.ref.localeCompare(right.scope.ref));
  return sizeBound({ mode: value.mode, exceptions });
}

export function normalizeCourseAuthoringProfileRequest(value, { apply = false } = {}) {
  exact(value, ["courseId", "expectedCourseRevision", "profileId", "profileRevision",
    ...(apply ? ["exceptionPolicy", "requestId"] : [])]);
  return { courseId: uuid(value.courseId), expectedCourseRevision: revision(value.expectedCourseRevision),
    profileId: uuid(value.profileId), profileRevision: revision(value.profileRevision),
    ...(apply ? { exceptionPolicy: normalizeAuthoringProfileExceptionPolicy(value.exceptionPolicy), requestId: requestId(value.requestId) } : {}) };
}

export function normalizeCourseAuthoringProfilePreview(value, expected = null) {
  exact(value, ["contract", "courseId", "courseRevision", "profile", "assignments", "exceptions", "conflicts"]);
  if (value.contract !== "aralearn.course-authoring-profile-preview.v1" ||
      !Array.isArray(value.assignments) || !Array.isArray(value.exceptions) || !Array.isArray(value.conflicts)) {
    fail("A prévia de aplicação do perfil é inválida.");
  }
  const profile = normalizeAuthoringProfile(value.profile);
  const assignments = value.assignments.map((entry) => {
    exact(entry, ["parameterId", "mode", "value", "origin", "reason"]);
    const preference = normalizeCourseDesignPreference({ parameterId: entry.parameterId, mode: entry.mode, value: entry.value });
    if (entry.origin !== "author" || entry.reason !== "Preferências copiadas do perfil.") fail("O perfil não pode fixar uma condição de pesquisa.");
    return { ...preference, origin: entry.origin, reason: entry.reason };
  });
  if (JSON.stringify(normalizeAuthoringProfilePreferences(assignments.map(({ parameterId, mode, value }) => ({ parameterId, mode, value })))) !==
      JSON.stringify(profile.preferences)) fail("A prévia não corresponde às preferências do perfil.");
  const exceptions = value.exceptions.map((entry) => {
    exact(entry, ["parameterId", "scope", "scopeLabel", "assignment"]);
    if (!profile.preferences.some(({ parameterId }) => parameterId === entry.parameterId)) {
      fail("A exceção não pertence às preferências deste perfil.");
    }
    const normalizedScope = scope(entry.scope);
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === entry.parameterId);
    if (normalizedScope.kind === "course" || !definition.supportedScopes.includes(normalizedScope.kind)) {
      fail("O escopo da exceção é inválido para a preferência.");
    }
    return { parameterId: entry.parameterId, scope: normalizedScope, scopeLabel: text(entry.scopeLabel, 1000),
      assignment: normalizeCourseDesignParameterAssignment(entry.assignment, entry.parameterId) };
  });
  if (new Set(exceptions.map((entry) => `${entry.parameterId}:${entry.scope.kind}:${entry.scope.ref}`)).size !== exceptions.length) {
    fail("A prévia repete uma exceção.");
  }
  const conflicts = value.conflicts.map((entry) => {
    exact(entry, ["parameterId", "fixedScope", "fixedValue", "exceptionScope", "exceptionValue"]);
    const fixed = normalizeCourseDesignPreference({ parameterId: entry.parameterId, mode: "fixed", value: entry.fixedValue });
    const exception = normalizeCourseDesignPreference({ parameterId: entry.parameterId,
      mode: entry.exceptionValue == null ? "automatic" : "fixed", value: entry.exceptionValue });
    return { parameterId: entry.parameterId, fixedScope: scope(entry.fixedScope), fixedValue: fixed.value,
      exceptionScope: scope(entry.exceptionScope), exceptionValue: exception.value };
  });
  const result = sizeBound({ contract: value.contract, courseId: uuid(value.courseId), courseRevision: revision(value.courseRevision),
    profile, assignments, exceptions, conflicts });
  if (expected && (result.courseId !== expected.courseId || result.courseRevision !== expected.expectedCourseRevision ||
      profile.profileId !== expected.profileId || profile.revision !== expected.profileRevision)) fail("A prévia não corresponde ao curso e perfil solicitados.");
  return result;
}

export function normalizeCourseAuthoringProfileChange(value, expected) {
  const result = normalizeCourseDesignChange(value);
  if (result.courseId !== expected.courseId || result.requestId !== expected.requestId ||
      result.courseRevision !== expected.expectedCourseRevision + (result.changed ? 1 : 0) ||
      result.change != null && (result.change.type !== "apply_profile" ||
        result.change.scope?.kind !== "course" || result.change.scope?.ref !== expected.courseId)) {
    fail("A confirmação não corresponde à aplicação do perfil.");
  }
  return result;
}
