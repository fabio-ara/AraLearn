export const COURSE_AUTHORING_SECTIONS = Object.freeze([
  "planning", "structure", "content", "people"
]);

const COURSE_AUTHORING_ROUTE_PREFIX = "#/authoring/courses/";
const COURSE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const COURSE_AUTHORING_ROUTE_PATTERN = new RegExp(
  `^${COURSE_AUTHORING_ROUTE_PREFIX.replaceAll("/", "\\/")}` +
  "([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})" +
  "\\?section=(planning|structure|content|people)$",
  "u"
);

export function isCanonicalCourseId(value) {
  return typeof value === "string" && COURSE_ID_PATTERN.test(value);
}

export function parseCourseAuthoringRoute(hashValue) {
  if (typeof hashValue !== "string") return null;
  const match = COURSE_AUTHORING_ROUTE_PATTERN.exec(hashValue);
  if (!match) return null;
  return Object.freeze({
    courseId: match[1],
    section: match[2]
  });
}

export function buildCourseAuthoringRoute(courseId, { section = "structure" } = {}) {
  if (!isCanonicalCourseId(courseId)) {
    throw new TypeError("Identidade de Curso inválida para a rota de Autoria.");
  }
  if (!COURSE_AUTHORING_SECTIONS.includes(section)) {
    throw new TypeError("Seção de Curso inválida para a rota de Autoria.");
  }
  return `${COURSE_AUTHORING_ROUTE_PREFIX}${courseId}?section=${section}`;
}

export function isCourseAuthoringRouteCandidate(hashValue) {
  return typeof hashValue === "string" && hashValue.startsWith(COURSE_AUTHORING_ROUTE_PREFIX);
}
