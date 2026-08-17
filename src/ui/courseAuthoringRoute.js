export const COURSE_AUTHORING_SECTIONS = Object.freeze([
  "planning", "parameters", "sources", "structure", "inspection", "observations", "people"
]);

const COURSE_AUTHORING_ROUTE_PREFIX = "#/authoring/courses/";
const COURSE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ENTITY_ID_MAX_LENGTH = 240;
const TARGET_DEFINITIONS = Object.freeze([
  Object.freeze({ option: "authoringPartId", query: "authoringPartId", kind: "authoring_part", uuid: true }),
  Object.freeze({ option: "moduleId", query: "moduleId", kind: "module" }),
  Object.freeze({ option: "lessonId", query: "lessonId", kind: "lesson" }),
  Object.freeze({
    option: "didacticMicrosequenceId",
    query: "didacticMicrosequenceId",
    kind: "didactic_microsequence"
  }),
  Object.freeze({ option: "studyUnitId", query: "studyUnitId", kind: "study_unit" }),
  Object.freeze({ option: "annotationId", query: "annotationId", kind: "anchored_annotation", uuid: true })
]);
const BUILD_OPTION_FIELDS = new Set([
  "section", "authoringPartId", "moduleId", "lessonId", "didacticMicrosequenceId",
  "studyUnitId", "annotationId", "unassigned"
]);

export function isCanonicalCourseId(value) {
  return typeof value === "string" && COURSE_ID_PATTERN.test(value);
}

function containsControlCharacters(value) {
  return [...String(value)].some((character) => {
    const code = character.codePointAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function canonicalEntityId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= ENTITY_ID_MAX_LENGTH &&
    value === value.trim() && /\S/u.test(value) && !containsControlCharacters(value);
}

function normalizedTargetOptions(options) {
  const selected = [];
  for (const definition of TARGET_DEFINITIONS) {
    const value = options?.[definition.option];
    if (value == null || value === "") continue;
    if (definition.uuid ? !isCanonicalCourseId(value) : !canonicalEntityId(value)) {
      throw new TypeError("Alvo inválido para a rota de Inspeção.");
    }
    selected.push({ ...definition, id: value });
  }
  if (options?.unassigned === true) {
    selected.push({ option: "unassigned", query: "unassigned", kind: "unassigned", id: null });
  } else if (options?.unassigned != null && options.unassigned !== false) {
    throw new TypeError("Alvo inválido para a rota de Inspeção.");
  }
  if (selected.length > 1) {
    throw new TypeError("A rota de Inspeção aceita somente um alvo.");
  }
  return selected[0] || null;
}

function targetAllowedForSection(target, section) {
  if (!target) return true;
  if (target.kind === "anchored_annotation") return section === "observations";
  if (section === "inspection") return true;
  return section === "parameters" && [
    "module", "lesson", "didactic_microsequence"
  ].includes(target.kind);
}

export function buildCourseAuthoringRoute(courseId, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some((field) => !BUILD_OPTION_FIELDS.has(field))) {
    throw new TypeError("Opções inválidas para a rota de Autoria.");
  }
  const section = options.section || "structure";
  if (!isCanonicalCourseId(courseId)) {
    throw new TypeError("Identidade de Curso inválida para a rota de Autoria.");
  }
  if (!COURSE_AUTHORING_SECTIONS.includes(section)) {
    throw new TypeError("Seção de Curso inválida para a rota de Autoria.");
  }
  const target = normalizedTargetOptions(options);
  if (!targetAllowedForSection(target, section)) {
    throw new TypeError("O alvo não pertence à seção escolhida.");
  }
  const suffix = target
    ? `&${target.query}=${target.kind === "unassigned" ? "true" : encodeURIComponent(target.id)}`
    : "";
  return `${COURSE_AUTHORING_ROUTE_PREFIX}${courseId}?section=${section}${suffix}`;
}

export function parseCourseAuthoringRoute(hashValue) {
  if (typeof hashValue !== "string" || !hashValue.startsWith(COURSE_AUTHORING_ROUTE_PREFIX)) {
    return null;
  }
  const remainder = hashValue.slice(COURSE_AUTHORING_ROUTE_PREFIX.length);
  const separator = remainder.indexOf("?");
  if (separator < 1 || remainder.indexOf("?", separator + 1) >= 0) return null;
  const courseId = remainder.slice(0, separator);
  if (!isCanonicalCourseId(courseId)) return null;
  const rawParameters = remainder.slice(separator + 1).split("&");
  if (rawParameters.length < 1 || rawParameters.length > 2) return null;
  const sectionMatch = /^section=([a-z]+)$/u.exec(rawParameters[0]);
  const section = sectionMatch?.[1] || "";
  if (!COURSE_AUTHORING_SECTIONS.includes(section)) return null;

  let target = null;
  if (rawParameters.length === 2) {
    const separatorIndex = rawParameters[1].indexOf("=");
    if (separatorIndex <= 0 || rawParameters[1].indexOf("=", separatorIndex + 1) >= 0) return null;
    const query = rawParameters[1].slice(0, separatorIndex);
    const encoded = rawParameters[1].slice(separatorIndex + 1);
    if (query === "unassigned") {
      if (encoded !== "true") return null;
      target = Object.freeze({ kind: "unassigned", id: null });
    } else {
      const definition = TARGET_DEFINITIONS.find((candidate) => candidate.query === query);
      if (!definition || !encoded) return null;
      let id;
      try {
        id = decodeURIComponent(encoded);
      } catch {
        return null;
      }
      if (encodeURIComponent(id) !== encoded ||
          (definition.uuid ? !isCanonicalCourseId(id) : !canonicalEntityId(id))) {
        return null;
      }
      target = Object.freeze({ kind: definition.kind, id });
    }
    if (!targetAllowedForSection(target, section)) return null;
  }
  return Object.freeze({ courseId, section, target });
}

export function isCourseAuthoringRouteCandidate(hashValue) {
  return typeof hashValue === "string" && hashValue.startsWith(COURSE_AUTHORING_ROUTE_PREFIX);
}
