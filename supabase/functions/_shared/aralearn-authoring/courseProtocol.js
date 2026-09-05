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
  if (path === "/v1/maintenance") {
    if (verb === "GET") return { name: "getCurrentMaintenance" };
  }
  if (path === "/v1/maintenance/actions") {
    if (verb === "POST") return { name: "executeCurrentMaintenance" };
  }
  if (path === "/v2/profile") {
    if (verb === "GET") return { name: "getPersonProfile" };
    if (verb === "PATCH") return { name: "updatePersonProfile" };
  }
  if (path === "/v1/courses") {
    if (verb === "GET") return { name: "listCourses" };
    if (verb === "POST") return { name: "createCourse" };
  }
  if (path === "/v1/authoring-profiles") {
    if (verb === "GET") return { name: "listAuthoringProfiles" };
    if (verb === "POST") return { name: "createAuthoringProfile" };
  }
  const authoringProfile = path.match(/^\/v1\/authoring-profiles\/([^/]+)$/u);
  if (authoringProfile && new Set(["PATCH", "DELETE"]).has(verb)) {
    return { name: verb === "PATCH" ? "updateAuthoringProfile" : "deleteAuthoringProfile",
      profileId: courseUuid(authoringProfile[1], "profileId") };
  }
  const courseProfile = path.match(/^\/v1\/courses\/([^/]+)\/authoring-profile\/(preview|applications)$/u);
  if (courseProfile && verb === "POST") {
    return { name: courseProfile[2] === "preview" ? "previewCourseAuthoringProfile" : "applyCourseAuthoringProfile",
      courseId: courseUuid(courseProfile[1]) };
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
  const courseSourceChange = path.match(
    /^\/v1\/courses\/([^/]+)\/sources\/changes$/u
  );
  const media = path.match(/^\/v1\/courses\/([^/]+)\/media(?:\/(changes)|\/([a-f0-9]{64})\/download)?$/u);
  if (media && ((!media[2] && verb === "GET") || (media[2] && verb === "POST"))) {
    return { name: media[2] ? "executeCourseMediaCommand" : media[3] ? "getCourseMediaDownload" : "getCourseMedia",
      courseId: courseUuid(media[1]), ...(media[3] ? { contentHash: media[3] } : {}) };
  }
  if (courseSourceChange && verb === "POST") {
    return {
      name: "executeCourseSourceCommand",
      courseId: courseUuid(courseSourceChange[1])
    };
  }
  const courseSourcePdfDownload = path.match(
    /^\/v1\/courses\/([^/]+)\/source-pdf\/download$/u
  );
  if (courseSourcePdfDownload && verb === "GET") {
    return {
      name: "getCourseSourcePdfDownload",
      courseId: courseUuid(courseSourcePdfDownload[1])
    };
  }
  const courseSources = path.match(/^\/v1\/courses\/([^/]+)\/sources$/u);
  if (courseSources && verb === "GET") {
    return {
      name: "getCourseSources",
      courseId: courseUuid(courseSources[1])
    };
  }
  const anchoredAnnotationChange = path.match(
    /^\/v1\/courses\/([^/]+)\/anchored-annotations\/changes$/u
  );
  if (anchoredAnnotationChange && verb === "POST") {
    return {
      name: "executeCourseAnchoredAnnotationCommand",
      courseId: courseUuid(anchoredAnnotationChange[1])
    };
  }
  const anchoredAnnotations = path.match(
    /^\/v1\/courses\/([^/]+)\/anchored-annotations$/u
  );
  if (anchoredAnnotations && verb === "GET") {
    return {
      name: "getCourseAnchoredAnnotations",
      courseId: courseUuid(anchoredAnnotations[1])
    };
  }
  const research = path.match(/^\/v1\/courses\/([^/]+)\/research$/u);
  if (research && verb === "GET") {
    return {
      name: "getCourseAuthoringAnalytics",
      courseId: courseUuid(research[1])
    };
  }
  const recovery = path.match(/^\/v1\/courses\/([^/]+)\/copy-recovery$/u);
  if (recovery && verb === "POST") {
    return { name: "recoverOwnedCourseCopy", sourceCourseId: courseUuid(recovery[1]) };
  }
  const visibility = path.match(/^\/v1\/courses\/([^/]+)\/visibility$/u);
  if (visibility && verb === "PATCH") {
    return { name: "setCourseVisibility", courseId: courseUuid(visibility[1]) };
  }
  const fileAccess = path.match(/^\/v1\/courses\/([^/]+)\/sources\/file-access$/u);
  if (fileAccess && verb === "PATCH") {
    return { name: "setCourseSourceFileAccess", courseId: courseUuid(fileAccess[1]) };
  }
  const people = path.match(/^\/v1\/courses\/([^/]+)\/access\/people$/u);
  if (people && verb === "GET") {
    return { name: "searchCourseAccessPeople", courseId: courseUuid(people[1]) };
  }
  const composition = path.match(/^\/v1\/courses\/([^/]+)\/composition$/u);
  if (composition && verb === "POST") {
    return { name: "commitCourseComposition", courseId: courseUuid(composition[1]) };
  }
  const continuousStudyUnits = path.match(/^\/v2\/courses\/([^/]+)\/study-units$/u);
  if (continuousStudyUnits && verb === "GET") {
    return {
      name: "listCourseStudyUnits",
      courseId: courseUuid(continuousStudyUnits[1])
    };
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
  if (course) {
    if (verb === "GET") return { name: "getCourse", courseId: courseUuid(course[1]) };
    if (verb === "DELETE") {
      return { name: "maintainCourse", courseId: courseUuid(course[1]) };
    }
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
