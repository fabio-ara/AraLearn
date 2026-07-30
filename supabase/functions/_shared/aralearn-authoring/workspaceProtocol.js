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

function workspaceId(value, field = "id", max = 240) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) {
    fail("invalid_workspace_field", `${field} é inválido.`, { field });
  }
  return result;
}

function workspacePosition(value, field = "position") {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    fail("invalid_workspace_position", `${field} deve ser inteiro não negativo.`, { field });
  }
  return value;
}

function workspaceEntityPath(value, field, expectedLength) {
  if (!Array.isArray(value)
      || value.length !== expectedLength) {
    fail(
      "invalid_workspace_entity_path",
      `${field} deve conter ${expectedLength} id(s).`,
      { field, expectedLength }
    );
  }
  return value.map((entry, index) => workspaceId(entry, `${field}[${index}]`));
}

function entityDepth(entityType) {
  return ["course", "module", "lesson", "microsequence", "card"].indexOf(entityType) + 1;
}

function workspaceParentPath(value, field, entityType) {
  const depth = entityDepth(entityType);
  if (depth === 1) {
    if (value != null) {
      fail("invalid_workspace_parent", `${field} deve ser null para cursos.`, { field });
    }
    return null;
  }
  if (value == null) {
    fail("invalid_workspace_parent", `${field} é obrigatório para ${entityType}.`, { field });
  }
  return workspaceEntityPath(value, field, depth - 1);
}

function uniqueTextList(value, field, { maximum = 500 } = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    fail("invalid_workspace_field", `${field} deve conter de 1 a ${maximum} itens.`, { field });
  }
  const result = value.map((entry, index) => workspaceId(entry, `${field}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail("invalid_workspace_field", `${field} não aceita itens repetidos.`, { field });
  }
  return result;
}

function uniqueMicrosequencePaths(value, field) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    fail("invalid_workspace_field", `${field} deve conter de 1 a 100 caminhos.`, { field });
  }
  const result = value.map(
    (entry, index) => workspaceEntityPath(entry, `${field}[${index}]`, 4)
  );
  const keys = result.map((entry) => JSON.stringify(entry));
  if (new Set(keys).size !== keys.length) {
    fail("invalid_workspace_field", `${field} não aceita caminhos repetidos.`, { field });
  }
  return result;
}

function optionalText(value, field, max) {
  if (value?.[field] == null) return null;
  return requiredText(value, field, max);
}

function workspaceMode(value) {
  const result = value == null ? "move" : String(value);
  if (!["move", "copy"].includes(result)) {
    fail("invalid_workspace_mode", "mode deve ser move ou copy.", { field: "mode" });
  }
  return result;
}

function validateMutationArguments(operation, rawArguments) {
  const argumentsValue = object(rawArguments, "arguments");
  if (operation === "insert_entity") {
    only(argumentsValue, ["entityType", "parentPath", "position", "entity"], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    const entity = object(argumentsValue.entity, "arguments.entity");
    return {
      entityType,
      parentPath: workspaceParentPath(argumentsValue.parentPath, "parentPath", entityType),
      position: workspacePosition(argumentsValue.position),
      entity
    };
  }
  if (operation === "replace_entity") {
    only(argumentsValue, ["entityType", "entityPath", "entity"], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      ),
      entity: object(argumentsValue.entity, "arguments.entity")
    };
  }
  if (operation === "rename_entity") {
    only(argumentsValue, ["entityType", "entityPath", "title"], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      ),
      title: requiredText(argumentsValue, "title")
    };
  }
  if (operation === "move_entity") {
    only(
      argumentsValue,
      ["entityType", "entityPath", "targetParentPath", "position"],
      "arguments"
    );
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      ),
      targetParentPath: workspaceParentPath(
        argumentsValue.targetParentPath,
        "targetParentPath",
        entityType
      ),
      position: workspacePosition(argumentsValue.position)
    };
  }
  if (operation === "delete_entity") {
    only(argumentsValue, ["entityType", "entityPath"], "arguments");
    const entityType = workspaceEntityType(argumentsValue.entityType);
    return {
      entityType,
      entityPath: workspaceEntityPath(
        argumentsValue.entityPath,
        "entityPath",
        entityDepth(entityType)
      )
    };
  }
  if (operation === "merge_microsequences") {
    only(argumentsValue, ["targetPath", "sourcePaths", "title", "goal"], "arguments");
    return {
      targetPath: workspaceEntityPath(argumentsValue.targetPath, "targetPath", 4),
      sourcePaths: uniqueMicrosequencePaths(argumentsValue.sourcePaths, "sourcePaths"),
      title: optionalText(argumentsValue, "title", 300),
      goal: optionalText(argumentsValue, "goal", 2_000)
    };
  }
  if (operation === "split_microsequence") {
    only(
      argumentsValue,
      ["sourcePath", "newMicrosequence", "cardIds", "position"],
      "arguments"
    );
    const newMicrosequence = object(
      argumentsValue.newMicrosequence,
      "arguments.newMicrosequence"
    );
    if (Array.isArray(newMicrosequence.cards) && newMicrosequence.cards.length > 0) {
      fail(
        "invalid_workspace_split",
        "newMicrosequence.cards deve ficar vazio; cardIds define os cards movidos.",
        { field: "newMicrosequence.cards" }
      );
    }
    return {
      sourcePath: workspaceEntityPath(argumentsValue.sourcePath, "sourcePath", 4),
      newMicrosequence,
      cardIds: uniqueTextList(argumentsValue.cardIds, "cardIds"),
      position: workspacePosition(argumentsValue.position)
    };
  }
  if (operation === "promote_module") {
    only(
      argumentsValue,
      ["modulePath", "courseId", "title", "goal", "mode"],
      "arguments"
    );
    return {
      modulePath: workspaceEntityPath(argumentsValue.modulePath, "modulePath", 2),
      courseId: workspaceId(argumentsValue.courseId, "courseId"),
      title: optionalText(argumentsValue, "title", 300),
      goal: requiredText(argumentsValue, "goal", 2_000),
      mode: workspaceMode(argumentsValue.mode)
    };
  }
  if (operation === "demote_course") {
    only(
      argumentsValue,
      ["coursePath", "targetCoursePath", "moduleId", "title", "mode"],
      "arguments"
    );
    return {
      coursePath: workspaceEntityPath(argumentsValue.coursePath, "coursePath", 1),
      targetCoursePath: workspaceEntityPath(
        argumentsValue.targetCoursePath,
        "targetCoursePath",
        1
      ),
      moduleId: workspaceId(argumentsValue.moduleId, "moduleId"),
      title: optionalText(argumentsValue, "title", 300),
      mode: workspaceMode(argumentsValue.mode)
    };
  }
  if (operation === "restore_revision") {
    only(argumentsValue, ["revision"], "arguments");
    return { revision: positiveRevision(argumentsValue, "revision") };
  }
  fail("invalid_workspace_operation", "operation é inválida.");
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
    arguments: validateMutationArguments(operation, payload.arguments)
  };
}

export function validateWorkspaceImportPayload(payload) {
  object(payload);
  only(payload, ["requestId", "expectedRevision", "courseId", "workspaceCourseId", "position"]);
  return {
    requestId: workspaceRequestId(payload.requestId),
    expectedRevision: positiveRevision(payload),
    courseId: workspaceUuid(payload.courseId, "courseId"),
    workspaceCourseId: requiredText(payload, "workspaceCourseId", 240),
    position: workspacePosition(payload.position)
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
  const collectionId = optionalUuid(payload, "collectionId");
  if (target === "catalog" && !collectionId) {
    fail("catalog_collection_required", "A publicação oficial exige collectionId.");
  }
  if (target === "private" && collectionId) {
    fail("private_collection_forbidden", "A publicação privada não recebe collectionId.");
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
    collectionId
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
