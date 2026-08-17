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
  const materializationChange = path.match(
    /^\/v1\/courses\/([^/]+)\/authoring-parts\/([^/]+)\/materializations\/([^/]+)\/changes$/u
  );
  if (materializationChange && verb === "POST") {
    return {
      name: "advanceCourseAuthoringPartMaterialization",
      courseId: courseUuid(materializationChange[1]),
      authoringPartId: courseUuid(materializationChange[2], "authoringPartId"),
      materializationId: courseUuid(materializationChange[3], "materializationId")
    };
  }
  const materialization = path.match(
    /^\/v1\/courses\/([^/]+)\/authoring-parts\/([^/]+)\/materializations\/([^/]+)$/u
  );
  if (materialization && verb === "GET") {
    return {
      name: "getCourseAuthoringPartMaterialization",
      courseId: courseUuid(materialization[1]),
      authoringPartId: courseUuid(materialization[2], "authoringPartId"),
      materializationId: courseUuid(materialization[3], "materializationId")
    };
  }
  const instructionalPlanChange = path.match(
    /^\/v1\/courses\/([^/]+)\/instructional-plan\/changes$/u
  );
  if (instructionalPlanChange && verb === "POST") {
    return {
      name: "commitCourseInstructionalPlan",
      courseId: courseUuid(instructionalPlanChange[1])
    };
  }
  const instructionalPlan = path.match(/^\/v1\/courses\/([^/]+)\/instructional-plan$/u);
  if (instructionalPlan && verb === "GET") {
    return {
      name: "getCourseInstructionalPlan",
      courseId: courseUuid(instructionalPlan[1])
    };
  }
  const courseDesignChange = path.match(
    /^\/v1\/courses\/([^/]+)\/course-design\/changes$/u
  );
  if (courseDesignChange && verb === "POST") {
    return {
      name: "applyCourseDesignCommand",
      courseId: courseUuid(courseDesignChange[1])
    };
  }
  const courseDesign = path.match(/^\/v1\/courses\/([^/]+)\/course-design$/u);
  if (courseDesign && verb === "GET") {
    return {
      name: "getCourseDesign",
      courseId: courseUuid(courseDesign[1])
    };
  }
  const composition = path.match(/^\/v1\/courses\/([^/]+)\/composition$/u);
  if (composition && verb === "POST") {
    return { name: "commitCourseComposition", courseId: courseUuid(composition[1]) };
  }
  const studyUnits = path.match(/^\/v1\/courses\/([^/]+)\/study-units$/u);
  if (studyUnits && verb === "GET") {
    return { name: "listCourseStudyUnits", courseId: courseUuid(studyUnits[1]) };
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
  const reader = request.body?.getReader?.();
  if (!reader) {
    throw new AuthoringApiError(422, "invalid_payload", "O corpo JSON é obrigatório.");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let source = "";
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => undefined);
        throw new AuthoringApiError(413, "payload_too_large", "O corpo excede o limite.");
      }
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
  } catch (error) {
    if (error instanceof AuthoringApiError) throw error;
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém objeto JSON válido.");
  }
  if (!source) throw new AuthoringApiError(422, "invalid_payload", "O corpo JSON é obrigatório.");
  try {
    const value = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém objeto JSON válido.");
  }
}
