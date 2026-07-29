import { AuthoringApiError } from "./errors.js";
import { workspaceRoute } from "./workspaceProtocol.js";

export const STANDARD_BODY_LIMIT = Number.POSITIVE_INFINITY;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo deve ser um objeto JSON.");
  }
  return value;
}

function fields(value, allowed) {
  object(value);
  const unknown = Object.keys(value).find((field) => !allowed.includes(field));
  if (unknown) {
    throw new AuthoringApiError(422, "invalid_payload", `Campo desconhecido: ${unknown}.`);
  }
}

function text(value, field, maximum) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      `${field} deve ter entre 1 e ${maximum} caracteres.`
    );
  }
  return normalized;
}

export function validateRequestId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!REQUEST_ID.test(normalized)) {
    throw new AuthoringApiError(
      422,
      "invalid_request_id",
      "requestId deve ter entre 8 e 128 caracteres seguros."
    );
  }
  return normalized;
}

export function validateRunId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(normalized)) {
    throw new AuthoringApiError(400, "invalid_identifier", "Identificador UUID inválido.");
  }
  return normalized;
}

function revision(value, field = "baseRevision") {
  if (!Number.isInteger(value) || value < 0) {
    throw new AuthoringApiError(422, "invalid_payload", `${field} deve ser inteiro não negativo.`);
  }
  return value;
}

function lifetime(value) {
  const days = value == null ? 90 : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new AuthoringApiError(
      422,
      "invalid_payload",
      "expiresInDays deve ficar entre 1 e 365."
    );
  }
  return days;
}

export function validateCreatePrivateIntegrationPayload(value) {
  fields(value, ["requestId", "name", "expiresInDays"]);
  return {
    requestId: validateRequestId(value.requestId),
    name: text(value.name, "name", 80),
    expiresInDays: lifetime(value.expiresInDays)
  };
}

export function validateRotatePrivateIntegrationPayload(value) {
  fields(value, ["requestId", "expiresInDays"]);
  return {
    requestId: validateRequestId(value.requestId),
    expiresInDays: lifetime(value.expiresInDays)
  };
}

function description(value) {
  if (value == null) return null;
  if (typeof value !== "string" || value.trim().length > 500) {
    throw new AuthoringApiError(422, "invalid_payload", "description é inválida.");
  }
  return value.trim() || null;
}

function order(value, idField) {
  if (!Array.isArray(value.order) || value.order.length > 500) {
    throw new AuthoringApiError(422, "invalid_payload", "order deve ser uma lista válida.");
  }
  const seen = new Set();
  return value.order.map((item, index) => {
    fields(item, [idField, "baseRevision"]);
    const id = validateRunId(item[idField]);
    if (seen.has(id)) {
      throw new AuthoringApiError(422, "invalid_payload", `order repete ${idField}.`);
    }
    seen.add(id);
    return {
      [idField]: id,
      baseRevision: revision(item.baseRevision, `order[${index}].baseRevision`)
    };
  });
}

export function validateCreateCatalogCollectionPayload(value) {
  fields(value, ["requestId", "contractKey", "title", "description"]);
  const contractKey = text(value.contractKey, "contractKey", 120);
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/u.test(contractKey)) {
    throw new AuthoringApiError(422, "invalid_payload", "contractKey é inválido.");
  }
  return {
    requestId: validateRequestId(value.requestId),
    contractKey,
    title: text(value.title, "title", 160),
    description: description(value.description)
  };
}

export function validateRenameCatalogCollectionPayload(value) {
  fields(value, ["requestId", "baseRevision", "title", "description"]);
  return {
    requestId: validateRequestId(value.requestId),
    baseRevision: revision(value.baseRevision),
    title: text(value.title, "title", 160),
    description: Object.hasOwn(value, "description") ? description(value.description) : null
  };
}

export function validateRetireCatalogCollectionPayload(value) {
  fields(value, ["requestId", "baseRevision", "replacementCollectionId"]);
  return {
    requestId: validateRequestId(value.requestId),
    baseRevision: revision(value.baseRevision),
    replacementCollectionId: validateRunId(value.replacementCollectionId)
  };
}

export function validateReorderCatalogCollectionsPayload(value) {
  fields(value, ["requestId", "order"]);
  const normalized = order(value, "collectionId");
  if (!normalized.length) {
    throw new AuthoringApiError(422, "invalid_payload", "order deve conter uma coleção.");
  }
  return { requestId: validateRequestId(value.requestId), order: normalized };
}

export function validateMoveCatalogCoursePayload(value) {
  fields(value, ["requestId", "baseRevision", "targetCollectionId"]);
  return {
    requestId: validateRequestId(value.requestId),
    baseRevision: revision(value.baseRevision),
    targetCollectionId: validateRunId(value.targetCollectionId)
  };
}

export function validateReorderCatalogCoursesPayload(value) {
  fields(value, ["requestId", "order"]);
  return {
    requestId: validateRequestId(value.requestId),
    order: order(value, "courseId")
  };
}

export function validateCreatePersonalStudyPathPayload(value) {
  fields(value, ["requestId", "title"]);
  return {
    requestId: validateRequestId(value.requestId),
    title: text(value.title, "title", 120)
  };
}

export const validateRenamePersonalStudyPathPayload =
  validateCreatePersonalStudyPathPayload;

export function validateDeletePersonalStudyPathPayload(value) {
  fields(value, ["requestId"]);
  return { requestId: validateRequestId(value.requestId) };
}

export function validateMovePersonalCourseSelectionPayload(value) {
  fields(value, ["requestId", "targetPathId"]);
  if (!Object.hasOwn(value, "targetPathId")) {
    throw new AuthoringApiError(422, "invalid_payload", "targetPathId é obrigatório.");
  }
  return {
    requestId: validateRequestId(value.requestId),
    targetPathId: value.targetPathId == null ? null : validateRunId(value.targetPathId)
  };
}

export function normalizeAuthoringPath(pathname) {
  let path = String(pathname || "").replace(/\/+$/u, "") || "/";
  for (const prefix of [
    "/functions/v1/aralearn-authoring-api",
    "/aralearn-authoring-api"
  ]) {
    if (path === prefix) return "/";
    if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  }
  return path;
}

export function routeRequest(method, pathname) {
  const verb = String(method || "").toUpperCase();
  const path = normalizeAuthoringPath(pathname);
  const workspace = workspaceRoute(verb, path);
  if (workspace) return workspace;
  if (verb === "GET" && path === "/v1/contracts/resources") {
    return { name: "listAuthoringResources" };
  }
  let match = path.match(/^\/v1\/contracts\/resources\/([a-z_]+)$/u);
  if (match && verb === "GET") return { name: "getAuthoringResource", resource: match[1] };
  if (verb === "GET" && path === "/v1/library/courses") {
    return { name: "listPersonalLibraryCourses" };
  }
  if (verb === "GET" && path === "/v1/library/paths") return { name: "listPersonalStudyPaths" };
  if (verb === "POST" && path === "/v1/library/paths") return { name: "createPersonalStudyPath" };
  match = path.match(/^\/v1\/library\/paths\/([^/]+)$/u);
  if (match && ["PATCH", "DELETE"].includes(verb)) {
    return {
      name: verb === "PATCH" ? "renamePersonalStudyPath" : "deletePersonalStudyPath",
      pathId: validateRunId(match[1])
    };
  }
  match = path.match(/^\/v1\/library\/selections\/([^/]+)\/path$/u);
  if (match && verb === "PUT") {
    return { name: "movePersonalCourseSelection", selectionId: validateRunId(match[1]) };
  }
  if (verb === "GET" && path === "/v1/catalog/collections") return { name: "listCatalogCollections" };
  if (verb === "POST" && path === "/v1/catalog/collections") return { name: "createCatalogCollection" };
  if (verb === "PUT" && path === "/v1/catalog/collections/order") return { name: "reorderCatalogCollections" };
  match = path.match(/^\/v1\/catalog\/collections\/([^/]+)\/courses\/order$/u);
  if (match && verb === "PUT") {
    return { name: "reorderCatalogCourses", collectionId: validateRunId(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/collections\/([^/]+)\/courses$/u);
  if (match && verb === "GET") {
    return { name: "listCatalogCourses", collectionId: validateRunId(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/collections\/([^/]+)\/retire$/u);
  if (match && verb === "POST") {
    return { name: "retireCatalogCollection", collectionId: validateRunId(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/collections\/([^/]+)$/u);
  if (match && verb === "PATCH") {
    return { name: "renameCatalogCollection", collectionId: validateRunId(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/courses\/([^/]+)\/placement$/u);
  if (match && verb === "PUT") {
    return { name: "moveCatalogCourse", courseId: validateRunId(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/courses\/([^/]+)$/u);
  if (match && verb === "GET") {
    return { name: "getCatalogCourse", courseId: validateRunId(match[1]) };
  }
  if (verb === "GET" && path === "/v1/integrations") return { name: "listPrivateIntegrations" };
  if (verb === "POST" && path === "/v1/integrations") return { name: "createPrivateIntegration" };
  match = path.match(/^\/v1\/integrations\/([^/]+)\/rotate$/u);
  if (match && verb === "POST") {
    return { name: "rotatePrivateIntegration", clientId: validateRunId(match[1]) };
  }
  match = path.match(/^\/v1\/integrations\/([^/]+)$/u);
  if (match && verb === "DELETE") {
    return { name: "revokePrivateIntegration", clientId: validateRunId(match[1]) };
  }
  throw new AuthoringApiError(404, "not_found", "Endpoint inexistente.");
}

export async function readJsonBody(request, limit) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > limit) {
    throw new AuthoringApiError(413, "payload_too_large", "O corpo excede o limite.");
  }
  const source = await request.text();
  if (!source) throw new AuthoringApiError(422, "invalid_payload", "O corpo JSON é obrigatório.");
  if (new TextEncoder().encode(source).byteLength > limit) {
    throw new AuthoringApiError(413, "payload_too_large", "O corpo excede o limite.");
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém JSON válido.");
  }
}
