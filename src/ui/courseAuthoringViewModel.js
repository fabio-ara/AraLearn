import {
  COURSE_AUTHORING_SECTIONS,
  isCanonicalCourseId
} from "./courseAuthoringRoute.js";

const OWNERSHIP_VALUES = new Set(["owned"]);
const ENTITY_DEFINITIONS = Object.freeze({
  module: Object.freeze({ label: "Módulo", icon: "module", parentType: null }),
  lesson: Object.freeze({ label: "Lição", icon: "lesson", parentType: "module" }),
  topic: Object.freeze({ label: "Tópico", icon: "tags", parentType: "lesson" }),
  microsequence: Object.freeze({
    label: "Microssequência",
    icon: "microsequence",
    parentType: "lesson"
  }),
  card: Object.freeze({ label: "Unidade", icon: "card", parentType: "microsequence" })
});

export class CourseAuthoringProjectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CourseAuthoringProjectionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CourseAuthoringProjectionError(code, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function naturalNumber(value, { minimum = 0 } = {}) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

function revision(value) {
  const parsed = naturalNumber(value, { minimum: 1 });
  if (parsed === null) fail("invalid_course_projection", "A versão do Curso é inválida.");
  return parsed;
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail("invalid_course_projection", `${label} precisa conter somente dados JSON.`);
  }
}

function freezeJson(value) {
  if (Array.isArray(value)) {
    value.forEach(freezeJson);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach(freezeJson);
    return Object.freeze(value);
  }
  return value;
}

function authoringState(value, normalizedOwnership) {
  if (value == null) return null;
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "O planejamento do Curso é inválido.");
  }
  if (normalizedOwnership === "shared") {
    fail("invalid_course_projection", "Um Curso compartilhado expôs dados privados de planejamento.");
  }
  const cloned = cloneJson(value, "O planejamento do Curso");
  if (!isPlainObject(cloned)) {
    fail("invalid_course_projection", "O planejamento do Curso é inválido.");
  }
  return freezeJson(cloned);
}

function cursorValue(value, { required = false } = {}) {
  if (value == null) {
    if (required) fail("invalid_course_cursor", "A página seguinte não informou cursor.");
    return null;
  }
  if ((!isPlainObject(value) && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())) {
    fail("invalid_course_cursor", "O cursor da página é inválido.");
  }
  const cloned = cloneJson(value, "O cursor");
  return isPlainObject(cloned) ? Object.freeze(cloned) : cloned;
}

function pageState(value) {
  const hasMore = value?.hasMore === true;
  return Object.freeze({
    hasMore,
    nextCursor: hasMore ? cursorValue(value?.nextCursor, { required: true }) : null
  });
}

function ownership(value) {
  const normalized = text(value);
  if (!normalized) return null;
  if (normalized === "shared") {
    fail("course_not_owned", "Somente Cursos próprios pertencem à Autoria.");
  }
  if (!OWNERSHIP_VALUES.has(normalized)) {
    fail("invalid_course_projection", "O tipo de acesso ao Curso é inválido.");
  }
  return normalized;
}

function editCapability(value, normalizedOwnership) {
  if (!normalizedOwnership) return null;
  const expected = normalizedOwnership === "owned";
  if (typeof value === "boolean" && value !== expected) {
    fail("invalid_course_projection", "A propriedade e a edição do Curso são inconsistentes.");
  }
  return expected;
}

function courseCounts(value) {
  if (!isPlainObject(value)) return null;
  const fields = [
    "moduleCount",
    "lessonCount",
    "topicCount",
    "microsequenceCount",
    "studyUnitCount"
  ];
  if (!fields.some((field) => Object.hasOwn(value, field))) return null;
  const entries = fields.map((field) => [field, naturalNumber(value[field])]);
  if (entries.some(([, count]) => count === null)) {
    fail("invalid_course_projection", "As contagens do Curso são inválidas.");
  }
  return Object.freeze(Object.fromEntries(entries));
}

function normalizeListItem(value) {
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "A lista contém um Curso inválido.");
  }
  const courseId = text(value.courseId);
  const title = text(value.title);
  if (!isCanonicalCourseId(courseId) || !title) {
    fail("invalid_course_projection", "A lista contém um Curso sem identidade ou título válido.");
  }
  const itemRevision = value.revision == null ? null : revision(value.revision);
  const normalizedOwnership = ownership(value.ownership);
  return Object.freeze({
    courseId,
    title,
    goal: text(value.goal) || null,
    revision: itemRevision,
    ownership: normalizedOwnership,
    canEdit: editCapability(value.canEdit, normalizedOwnership),
    counts: courseCounts(isPlainObject(value.counts) ? value.counts : value),
    updatedAt: text(value.updatedAt) || null,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true
  });
}

export function normalizeCourseListPage(value) {
  if (!isPlainObject(value) || !Array.isArray(value.items)) {
    fail("invalid_course_projection", "A página de Cursos é inválida.");
  }
  const items = value.items.map(normalizeListItem);
  const identities = new Set(items.map((item) => item.courseId));
  if (identities.size !== items.length) {
    fail("invalid_course_projection", "A página repete a identidade de um Curso.");
  }
  const pagination = pageState(value);
  if (items.length === 0 && pagination.hasMore) {
    fail("invalid_course_cursor", "A página vazia não pode indicar continuação.");
  }
  return Object.freeze({
    items: Object.freeze(items),
    ...pagination,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true ||
      items.some((item) => item.offlineKnown)
  });
}

export function courseListCardinality(value) {
  const count = Array.isArray(value?.items) ? value.items.length : 0;
  if (count === 0 && value?.hasMore !== true) return "zero";
  if (count === 1 && value?.hasMore !== true) return "one";
  return "many";
}

export function mergeCourseListPages(currentValue, incomingValue) {
  const current = currentValue ? normalizeCourseListPage(currentValue) : null;
  const incoming = normalizeCourseListPage(incomingValue);
  const itemsById = new Map((current?.items || []).map((item) => [item.courseId, item]));
  incoming.items.forEach((item) => itemsById.set(item.courseId, item));
  return Object.freeze({
    items: Object.freeze([...itemsById.values()]),
    hasMore: incoming.hasMore,
    nextCursor: incoming.nextCursor,
    offlineKnown: current?.offlineKnown === true || incoming.offlineKnown
  });
}

export function normalizeCourseDetail(value, { expectedCourseId = "" } = {}) {
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "O Curso devolvido é inválido.");
  }
  const courseId = text(value.courseId);
  const title = text(value.title);
  if (!isCanonicalCourseId(courseId) || !title ||
      (expectedCourseId && courseId !== expectedCourseId)) {
    fail("invalid_course_projection", "O Curso devolvido não corresponde ao solicitado.");
  }
  const normalizedOwnership = ownership(value.ownership);
  return Object.freeze({
    courseId,
    title,
    goal: text(value.goal) || null,
    brief: text(value.brief) || null,
    revision: revision(value.revision),
    ownership: normalizedOwnership,
    canEdit: editCapability(value.canEdit, normalizedOwnership),
    authoringState: authoringState(value.authoringState, normalizedOwnership),
    counts: courseCounts(value.counts),
    updatedAt: text(value.updatedAt) || null,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true
  });
}

export function projectCoursePlanning(course) {
  if (!isPlainObject(course)) {
    fail("invalid_course_projection", "O planejamento do Curso é inválido.");
  }
  if (course.authoringState == null) return null;
  if (!isPlainObject(course.authoringState) ||
      !Array.isArray(course.authoringState.parts) ||
      !Array.isArray(course.authoringState.decisions)) {
    fail("invalid_course_projection", "O planejamento do Curso é inconsistente.");
  }
  return Object.freeze({
    objective: text(course.goal) || null,
    orientations: text(course.brief) || null,
    partCount: course.authoringState.parts.length,
    decisionCount: course.authoringState.decisions.length
  });
}

function normalizeEntity(value, { courseId }) {
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "A página contém uma entidade inválida.");
  }
  const entityType = text(value.entityType);
  const entityId = text(value.entityId);
  const definition = ENTITY_DEFINITIONS[entityType];
  const parentType = value.parentType == null ? null : text(value.parentType);
  const parentId = value.parentId == null ? null : text(value.parentId);
  const position = naturalNumber(value.position, { minimum: entityType === "card" ? 1 : 0 });
  if (!definition || !entityId || parentType !== definition.parentType ||
      (parentType === null) !== (parentId === null) || position === null ||
      !isPlainObject(value.content)) {
    fail("invalid_course_projection", "A página contém uma entidade inconsistente.");
  }
  if (value.courseId != null && text(value.courseId) !== courseId) {
    fail("invalid_course_projection", "A entidade pertence a outro Curso.");
  }
  const version = value.version == null ? null : naturalNumber(value.version, { minimum: 1 });
  if (value.version != null && version === null) {
    fail("invalid_course_projection", "A versão da entidade é inválida.");
  }
  return Object.freeze({
    entityType,
    entityId,
    parentType,
    parentId,
    position,
    version,
    content: Object.freeze(cloneJson(value.content, "O conteúdo da entidade"))
  });
}

export function normalizeCourseEntityPage(value, {
  expectedCourseId = "",
  expectedRevision = null
} = {}) {
  if (!isPlainObject(value) || !Array.isArray(value.items)) {
    fail("invalid_course_projection", "A página de entidades do Curso é inválida.");
  }
  const courseId = text(value.courseId);
  const currentRevision = revision(value.revision);
  if (!isCanonicalCourseId(courseId) || (expectedCourseId && courseId !== expectedCourseId)) {
    fail("invalid_course_projection", "A página de entidades pertence a outro Curso.");
  }
  if (expectedRevision !== null && currentRevision !== expectedRevision) {
    fail("course_revision_changed", "O Curso mudou durante a leitura.");
  }
  const items = value.items.map((item) => normalizeEntity(item, { courseId }));
  const identities = new Set(items.map((item) => `${item.entityType}\u0000${item.entityId}`));
  if (identities.size !== items.length) {
    fail("invalid_course_projection", "A página repete uma entidade do Curso.");
  }
  const pagination = pageState(value);
  if (items.length === 0 && pagination.hasMore) {
    fail("invalid_course_cursor", "A página vazia não pode indicar continuação.");
  }
  return Object.freeze({
    courseId,
    revision: currentRevision,
    items: Object.freeze(items),
    ...pagination,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true
  });
}

export function mergeCourseEntityPages(currentValue, incomingValue) {
  const incoming = normalizeCourseEntityPage(incomingValue);
  if (!currentValue) return incoming;
  const current = normalizeCourseEntityPage(currentValue);
  if (current.courseId !== incoming.courseId || current.revision !== incoming.revision) {
    fail("course_revision_changed", "O Curso mudou durante a paginação.");
  }
  const itemsById = new Map(current.items.map((item) => [
    `${item.entityType}\u0000${item.entityId}`,
    item
  ]));
  incoming.items.forEach((item) => itemsById.set(`${item.entityType}\u0000${item.entityId}`, item));
  return Object.freeze({
    courseId: current.courseId,
    revision: current.revision,
    items: Object.freeze([...itemsById.values()]),
    hasMore: incoming.hasMore,
    nextCursor: incoming.nextCursor,
    offlineKnown: current.offlineKnown || incoming.offlineKnown
  });
}

function entityTitle(entity) {
  return text(entity.content.title) || text(entity.content.label) ||
    `${ENTITY_DEFINITIONS[entity.entityType].label} ${entity.position + (entity.entityType === "card" ? 0 : 1)}`;
}

function packagePreview(value) {
  if (!Array.isArray(value)) return "";
  for (const instance of value) {
    const candidate = text(instance?.data?.text) || text(instance?.data?.title) ||
      text(instance?.data?.caption);
    if (candidate) return candidate;
  }
  return "";
}

function entitySummary(entity) {
  return text(entity.content.summary) || text(entity.content.goal) ||
    text(entity.content.role) || packagePreview(entity.content.content) || null;
}

function entityKey(entity) {
  return `${entity.entityType}\u0000${entity.entityId}`;
}

const DIDACTIC_CHILD_TYPES = Object.freeze({
  course: Object.freeze(["module"]),
  module: Object.freeze(["lesson"]),
  lesson: Object.freeze(["topic", "microsequence"]),
  topic: Object.freeze([]),
  microsequence: Object.freeze(["card"]),
  card: Object.freeze([])
});

function didacticEntityOrder(source) {
  const byParent = new Map();
  for (const entity of source) {
    const parentKey = entity.parentType === null
      ? "course"
      : `${entity.parentType}\u0000${entity.parentId}`;
    const key = `${parentKey}\u0000${entity.entityType}`;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(entity);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.position - right.position ||
      left.entityId.localeCompare(right.entityId));
  }
  const ordered = [];
  const visited = new Set();
  const visitChildren = (parentType, parentId = null) => {
    const parentKey = parentType === "course"
      ? "course"
      : `${parentType}\u0000${parentId}`;
    for (const childType of DIDACTIC_CHILD_TYPES[parentType] || []) {
      for (const child of byParent.get(`${parentKey}\u0000${childType}`) || []) {
        const key = entityKey(child);
        if (visited.has(key)) continue;
        visited.add(key);
        ordered.push(child);
        visitChildren(child.entityType, child.entityId);
      }
    }
  };
  visitChildren("course");
  if (ordered.length !== source.length) {
    const typeOrder = new Map(Object.keys(ENTITY_DEFINITIONS)
      .map((entityType, index) => [entityType, index]));
    const remainder = source.filter((entity) => !visited.has(entityKey(entity)))
      .sort((left, right) =>
        (typeOrder.get(left.entityType) ?? 99) - (typeOrder.get(right.entityType) ?? 99) ||
        left.position - right.position || left.entityId.localeCompare(right.entityId));
    ordered.push(...remainder);
  }
  return ordered;
}

function contextForEntity(entity, byIdentity) {
  const context = [];
  let current = entity;
  for (let level = 0; level < 4 && current.parentType && current.parentId; level += 1) {
    const parent = byIdentity.get(`${current.parentType}\u0000${current.parentId}`);
    if (!parent) break;
    context.unshift(entityTitle(parent));
    current = parent;
  }
  return context.join(" · ") || null;
}

export function projectCourseEntities(items, { section = "structure" } = {}) {
  if (!COURSE_AUTHORING_SECTIONS.includes(section)) {
    throw new TypeError("Seção de Curso inválida.");
  }
  const source = Array.isArray(items) ? items : [];
  const byIdentity = new Map(source.map((item) => [entityKey(item), item]));
  const ordered = didacticEntityOrder(source);
  const visible = section === "content"
    ? ordered.filter((item) => item.entityType === "card")
    : section === "structure"
      ? ordered.filter((item) => item.entityType !== "card")
      : [];
  return Object.freeze(visible.map((item) => Object.freeze({
    entityType: item.entityType,
    entityId: item.entityId,
    label: ENTITY_DEFINITIONS[item.entityType].label,
    icon: ENTITY_DEFINITIONS[item.entityType].icon,
    title: entityTitle(item),
    summary: entitySummary(item),
    context: contextForEntity(item, byIdentity),
    position: item.position
  })));
}

export function countCourseEntities(items) {
  const source = Array.isArray(items) ? items : [];
  return Object.freeze({
    microsequences: source.filter((item) => item.entityType === "microsequence").length,
    units: source.filter((item) => item.entityType === "card").length
  });
}

export function classifyCourseAuthoringError(error, { knownCourse = null } = {}) {
  const code = text(error?.code).toLowerCase();
  const technicalMessage = text(error?.message).toLowerCase();
  const status = Number(error?.status || error?.response?.status || 0);
  const offline = error?.offline === true || [
    "offline",
    "network_error",
    "network_unavailable",
    "request_timeout",
    "service_unavailable",
    "failed_to_fetch"
  ].includes(code) ||
    /(?:failed to fetch|fetch failed|network|offline|load failed|connection|socket)/u
      .test(technicalMessage);
  if (offline && knownCourse) {
    return Object.freeze({
      kind: "offline-known",
      message: "Este Curso é conhecido neste dispositivo, mas o conteúdo não está disponível agora."
    });
  }
  if ([
    "access_revoked",
    "course_access_revoked",
    "course_not_found",
    "forbidden",
    "pt404",
    "course_not_owned"
  ].includes(code) || status === 403 || status === 404) {
    return Object.freeze({
      kind: "access-revoked",
      message: "O acesso a este Curso não está mais disponível."
    });
  }
  if (["40001", "course_revision_changed"].includes(code)) {
    return Object.freeze({
      kind: "revision-changed",
      message: "O Curso mudou durante a leitura. Recarregue para ver a versão atual."
    });
  }
  return Object.freeze({
    kind: "error",
    message: offline
      ? "Não foi possível acessar os Cursos sem conexão."
      : "Não foi possível carregar esta área agora."
  });
}
