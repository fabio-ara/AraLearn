import { AuthoringApiError } from "./errors.js";
import { workspaceRoute } from "./workspaceProtocol.js";

export const STANDARD_BODY_LIMIT = Number.POSITIVE_INFINITY;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function validateUuid(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(normalized)) {
    throw new AuthoringApiError(400, "invalid_identifier", "Identificador UUID inválido.");
  }
  return normalized;
}

export function normalizeAuthoringPath(pathname) {
  return String(pathname || "").replace(/\/+$/u, "") || "/";
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
  match = path.match(/^\/v1\/library\/courses\/([^/]+)\/remove$/u);
  if (match && verb === "POST") {
    return {
      name: "removePersonalLibraryCourse",
      courseId: validateUuid(match[1])
    };
  }
  if (path === "/v1/catalog/reviews") {
    if (verb === "GET") return { name: "listCatalogReviews" };
    if (verb === "POST") return { name: "submitCatalogReview" };
  }
  if (path === "/v1/catalog/manage/collections" && verb === "POST") {
    return { name: "createCatalogCollection" };
  }
  match = path.match(/^\/v1\/catalog\/manage\/collections\/([^/]+)\/update$/u);
  if (match && verb === "POST") {
    return {
      name: "updateCatalogCollection",
      collectionId: validateUuid(match[1])
    };
  }
  match = path.match(/^\/v1\/catalog\/manage\/collections\/([^/]+)\/retire$/u);
  if (match && verb === "POST") {
    return {
      name: "retireCatalogCollection",
      collectionId: validateUuid(match[1])
    };
  }
  match = path.match(/^\/v1\/catalog\/manage\/courses\/([^/]+)\/move$/u);
  if (match && verb === "POST") {
    return { name: "moveCatalogCourse", courseId: validateUuid(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/manage\/courses\/([^/]+)\/remove$/u);
  if (match && verb === "POST") {
    return { name: "removeCatalogCourse", courseId: validateUuid(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/reviews\/([^/]+)$/u);
  if (match && verb === "GET") {
    return { name: "readCatalogReview", submissionId: validateUuid(match[1]) };
  }
  if (match && verb === "DELETE") {
    return { name: "withdrawCatalogReview", submissionId: validateUuid(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/reviews\/([^/]+)\/claim$/u);
  if (match && verb === "POST") {
    return { name: "claimCatalogReview", submissionId: validateUuid(match[1]) };
  }
  match = path.match(/^\/v1\/catalog\/reviews\/([^/]+)\/workspace$/u);
  if (match && verb === "POST") {
    return {
      name: "createCatalogReviewWorkspace",
      submissionId: validateUuid(match[1])
    };
  }
  match = path.match(/^\/v1\/catalog\/reviews\/([^/]+)\/decision$/u);
  if (match && verb === "POST") {
    return { name: "decideCatalogReview", submissionId: validateUuid(match[1]) };
  }
  if (verb === "GET" && path === "/v1/catalog/courses/search") {
    return { name: "searchCatalogCourses" };
  }
  if (verb === "GET" && path === "/v1/catalog/collections") return { name: "listCatalogCollections" };
  match = path.match(/^\/v1\/catalog\/collections\/([^/]+)\/courses$/u);
  if (match && verb === "GET") {
    return { name: "listCatalogCourses", collectionId: validateUuid(match[1]) };
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
