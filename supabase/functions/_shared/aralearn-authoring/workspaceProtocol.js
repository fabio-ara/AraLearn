import { AuthoringApiError } from "./errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const ENTITY_TYPES = new Set(["course", "module", "lesson", "microsequence", "card"]);
const MUTATIONS = new Set([
  "insert_entity",
  "replace_entity",
  "rename_entity",
  "move_entity",
  "delete_entity",
  "merge_microsequences",
  "split_microsequence",
  "promote_module",
  "demote_course",
  "restore_revision"
]);

function fail(code, message, details = undefined) {
  throw new AuthoringApiError(422, code, message, details);
}

function object(value, label = "payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_workspace_payload", `${label} deve ser um objeto.`);
  }
  return value;
}

function only(value, fields, label = "payload") {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail("unknown_workspace_field", `${label}.${unknown} não é aceito.`, { field: unknown });
}

function requiredText(value, field, max = 300) {
  const result = typeof value?.[field] === "string" ? value[field].trim() : "";
  if (!result || result.length > max) fail("invalid_workspace_field", `${field} é inválido.`, { field });
  return result;
}

function optionalUuid(value, field) {
  if (value?.[field] == null) return null;
  return workspaceUuid(value[field], field);
}

function positiveRevision(value, field = "expectedRevision") {
  const result = value?.[field];
  if (!Number.isInteger(result) || result < 1) {
    fail("invalid_workspace_revision", `${field} deve ser um inteiro positivo.`, { field });
  }
  return result;
}

export function workspaceUuid(value, field = "id") {
  const result = String(value || "").trim();
  if (!UUID_PATTERN.test(result)) fail("invalid_workspace_id", `${field} deve ser UUID.`, { field });
  return result;
}

export function workspaceRequestId(value) {
  const result = String(value || "").trim();
  if (!REQUEST_ID_PATTERN.test(result)) {
    fail("invalid_request_id", "requestId deve ter de 8 a 128 caracteres seguros.");
  }
  return result;
}

export function workspaceEntityType(value) {
  const result = String(value || "").trim();
  if (!ENTITY_TYPES.has(result)) fail("invalid_entity_type", "entityType é inválido.");
  return result;
}

export function validateCreateWorkspacePayload(payload) {
  object(payload);
  only(payload, ["requestId", "title", "sourceCourseId"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    title: requiredText(payload, "title"),
    sourceCourseId: optionalUuid(payload, "sourceCourseId")
  };
}

export function validateWorkspaceMutationPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "operation", "arguments"]);
  const operation = String(payload.operation || "").trim();
  if (!MUTATIONS.has(operation)) fail("invalid_workspace_operation", "operation é inválida.");
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    operation,
    arguments: object(payload.arguments, "arguments")
  };
}

export function validateWorkspaceImportPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "courseId", "position"]);
  const position = payload.position == null ? null : payload.position;
  if (position != null && (!Number.isInteger(position) || position < 0)) {
    fail("invalid_workspace_position", "position deve ser inteiro não negativo.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    courseId: workspaceUuid(payload.courseId, "courseId"),
    position
  };
}

export function validateWorkspacePublishPayload(payload) {
  object(payload);
  only(payload, [
    "requestId", "expectedRevision", "courseId", "target", "completion",
    "publicationMode", "existingCourseId", "expectedContentHash", "collectionId"
  ]);
  const target = String(payload.target || "private");
  const completion = String(payload.completion || "partial");
  const publicationMode = String(payload.publicationMode || "create");
  if (!["private", "catalog"].includes(target)) fail("invalid_publication_target", "target é inválido.");
  if (!["partial", "complete"].includes(completion)) fail("invalid_completion", "completion é inválido.");
  if (!["create", "update"].includes(publicationMode)) {
    fail("invalid_publication_mode", "publicationMode é inválido.");
  }
  const existingCourseId = optionalUuid(payload, "existingCourseId");
  const expectedContentHash = payload.expectedContentHash == null
    ? null
    : String(payload.expectedContentHash);
  if (publicationMode === "update" && (
    !existingCourseId || !/^[a-f0-9]{64}$/u.test(expectedContentHash || "")
  )) {
    fail(
      "invalid_publication_base",
      "A atualização exige existingCourseId e expectedContentHash."
    );
  }
  if (publicationMode === "create" && (existingCourseId || expectedContentHash)) {
    fail("invalid_publication_base", "A criação não recebe uma revisão base.");
  }
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    courseId: requiredText(payload, "courseId", 240),
    target,
    completion,
    publicationMode,
    existingCourseId,
    expectedContentHash,
    collectionId: optionalUuid(payload, "collectionId")
  };
}

export function validateDeleteWorkspacePayload(payload) {
  object(payload);
  only(payload, ["requestId"]);
  return { requestId: workspaceRequestId(payload.requestId) };
}

export function workspaceRoute(method, path) {
  if (path === "/v1/workspaces") {
    if (method === "GET") return { name: "listWorkspaces" };
    if (method === "POST") return { name: "createWorkspace" };
  }
  let match = path.match(/^\/v1\/workspaces\/([^/]+)$/u);
  if (match && method === "GET") {
    return { name: "getWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  if (match && method === "DELETE") {
    return { name: "deleteWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/history$/u);
  if (match && method === "GET") {
    return { name: "getWorkspaceHistory", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/mutations$/u);
  if (match && method === "POST") {
    return { name: "mutateWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/imports$/u);
  if (match && method === "POST") {
    return { name: "importCourseIntoWorkspace", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/workspaces\/([^/]+)\/publications$/u);
  if (match && method === "POST") {
    return { name: "publishWorkspaceCourse", workspaceId: workspaceUuid(match[1], "workspaceId") };
  }
  match = path.match(/^\/v1\/courses\/([^/]+)\/content$/u);
  if (match && method === "GET") {
    return { name: "readCourseContent", courseId: workspaceUuid(match[1], "courseId") };
  }
  return null;
}

