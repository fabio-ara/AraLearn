import { AuthoringApiError } from "./errors.js";

export const COURSE_BODY_LIMIT = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function courseUuid(value, field = "courseId") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(normalized)) {
    throw new AuthoringApiError(400, "invalid_identifier", `${field} não contém UUID válido.`);
  }
  return normalized;
}

export function normalizeCoursePath(pathname) {
  return String(pathname || "").replace(/\/+$/u, "") || "/";
}

export function routeCourseRequest(method, pathname) {
  const verb = String(method || "").toUpperCase();
  const path = normalizeCoursePath(pathname);
  if (path === "/v1/profile") {
    if (verb === "GET") return { name: "getPersonProfile" };
    if (verb === "PATCH") return { name: "updatePersonProfile" };
  }
  if (path === "/v1/courses") {
    if (verb === "GET") return { name: "listCourses" };
    if (verb === "POST") return { name: "createCourse" };
  }
  const change = path.match(/^\/v1\/courses\/([^/]+)\/changes$/u);
  if (change && verb === "POST") {
    return { name: "commitCourseChanges", courseId: courseUuid(change[1]) };
  }
  const entities = path.match(/^\/v1\/courses\/([^/]+)\/entities$/u);
  if (entities && verb === "GET") {
    return { name: "listCourseEntities", courseId: courseUuid(entities[1]) };
  }
  const personAccess = path.match(/^\/v1\/courses\/([^/]+)\/access\/([^/]+)$/u);
  if (personAccess && verb === "DELETE") {
    return {
      name: "revokeCourseAccess",
      courseId: courseUuid(personAccess[1]),
      userId: courseUuid(personAccess[2], "userId")
    };
  }
  const access = path.match(/^\/v1\/courses\/([^/]+)\/access$/u);
  if (access) {
    if (verb === "GET") {
      return { name: "listCourseAccess", courseId: courseUuid(access[1]) };
    }
    if (verb === "POST") {
      return { name: "grantCourseAccess", courseId: courseUuid(access[1]) };
    }
  }
  const course = path.match(/^\/v1\/courses\/([^/]+)$/u);
  if (course && verb === "GET") {
    return { name: "getCourse", courseId: courseUuid(course[1]) };
  }
  throw new AuthoringApiError(404, "not_found", "Endpoint de Curso inexistente.");
}

export async function readCourseJsonBody(request, limit = COURSE_BODY_LIMIT) {
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
    const value = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém objeto JSON válido.");
  }
}
