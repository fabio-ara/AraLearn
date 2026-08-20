import { validateProjectDocument } from "./aralearnProject.js";

export { validateCourseEntityContent } from "./aralearnProject.js";

const COURSE_ENTITY_TYPES = Object.freeze([
  "module",
  "lesson",
  "topic",
  "microsequence",
  "study_unit"
]);

const COURSE_ENTITY_TYPE_SET = new Set(COURSE_ENTITY_TYPES);

const PARENT_TYPE = Object.freeze({
  module: null,
  lesson: "module",
  topic: "lesson",
  microsequence: "lesson",
  study_unit: "microsequence"
});

const CHILDREN = Object.freeze({
  course: Object.freeze([
    Object.freeze({ entityType: "module", field: "modules" })
  ]),
  module: Object.freeze([
    Object.freeze({ entityType: "lesson", field: "lessons" })
  ]),
  lesson: Object.freeze([
    Object.freeze({ entityType: "topic", field: "topics" }),
    Object.freeze({ entityType: "microsequence", field: "microsequences" })
  ]),
  topic: Object.freeze([]),
  microsequence: Object.freeze([
    Object.freeze({ entityType: "study_unit", field: "studyUnits" })
  ]),
  study_unit: Object.freeze([])
});

const ROW_FIELDS = new Set([
  "courseId",
  "entityType",
  "entityId",
  "parentType",
  "parentId",
  "position",
  "content",
  "version",
  "createdAt",
  "updatedAt"
]);

export class CourseEntityError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CourseEntityError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CourseEntityError(code, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail("invalid_course_entity_json", `${label} precisa conter somente dados JSON.`);
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function identityKey(entityType, entityId) {
  return `${entityType}\u0000${entityId}`;
}

function contentWithoutStructure(entityType, entity) {
  const content = cloneJson(entity, `Conteúdo de ${entityType}`);
  delete content.id;
  delete content.position;
  for (const child of CHILDREN[entityType]) delete content[child.field];
  return content;
}

function entityPosition(entityType, entity, index) {
  if (entityType !== "study_unit") return index;
  const position = Number(entity?.position);
  if (!Number.isSafeInteger(position) || position < 1) {
    fail(
      "invalid_course_entity_position",
      "A posição da Unidade de estudo precisa ser um inteiro positivo.",
      { entityType, entityId: text(entity?.id), position: entity?.position }
    );
  }
  return position;
}

function normalizeCourse(course) {
  if (!isPlainObject(course)) {
    fail("invalid_course", "O Curso precisa ser um objeto.");
  }
  const id = text(course.id);
  const title = text(course.title);
  const goal = text(course.goal);
  if (!id || !title || !goal) {
    fail("invalid_course", "O Curso exige identidade, título e objetivo.");
  }
  return { id, title, goal };
}

function normalizeRow(rawRow, index) {
  if (!isPlainObject(rawRow)) {
    fail("invalid_course_entity", "Cada entidade do Curso precisa ser um objeto.", { index });
  }
  const unknownField = Object.keys(rawRow).find((field) => !ROW_FIELDS.has(field));
  if (unknownField) {
    fail(
      "unknown_course_entity_field",
      `O campo ${unknownField} não pertence a uma entidade do Curso.`,
      { index, field: unknownField }
    );
  }
  const entityType = text(rawRow.entityType);
  const entityId = text(rawRow.entityId);
  if (!COURSE_ENTITY_TYPE_SET.has(entityType) || !entityId) {
    fail(
      "invalid_course_entity_identity",
      "A entidade possui tipo ou identidade inválida.",
      { index, entityType, entityId }
    );
  }
  const expectedParentType = PARENT_TYPE[entityType];
  const parentType = rawRow.parentType == null ? null : text(rawRow.parentType);
  const parentId = rawRow.parentId == null ? null : text(rawRow.parentId);
  if (parentType !== expectedParentType || (parentType === null) !== (parentId === null)) {
    fail(
      "invalid_course_entity_parent",
      "A entidade possui pai incompatível com seu tipo.",
      { index, entityType, entityId, parentType, parentId }
    );
  }
  const position = Number(rawRow.position);
  const minimumPosition = entityType === "study_unit" ? 1 : 0;
  if (!Number.isSafeInteger(position) || position < minimumPosition) {
    fail(
      "invalid_course_entity_position",
      "A entidade possui posição inválida.",
      { index, entityType, entityId, position: rawRow.position }
    );
  }
  if (!isPlainObject(rawRow.content)) {
    fail(
      "invalid_course_entity_content",
      "O conteúdo da entidade precisa ser um objeto JSON.",
      { index, entityType, entityId }
    );
  }
  const forbiddenField = [
    "id",
    "position",
    ...CHILDREN[entityType].map((child) => child.field)
  ].find((field) => Object.hasOwn(rawRow.content, field));
  if (forbiddenField) {
    fail(
      "duplicated_course_entity_field",
      `O campo ${forbiddenField} pertence à relação, não ao conteúdo da entidade.`,
      { index, entityType, entityId, field: forbiddenField }
    );
  }
  const row = {
    entityType,
    entityId,
    parentType,
    parentId,
    position,
    content: cloneJson(rawRow.content, "Conteúdo da entidade")
  };
  if (Object.hasOwn(rawRow, "courseId")) row.courseId = text(rawRow.courseId);
  if (Object.hasOwn(rawRow, "version")) {
    const version = Number(rawRow.version);
    if (!Number.isSafeInteger(version) || version < 1) {
      fail(
        "invalid_course_entity_version",
        "A versão da entidade precisa ser um inteiro positivo.",
        { index, entityType, entityId, version: rawRow.version }
      );
    }
    row.version = version;
  }
  return row;
}

export function normalizeCourseEntityRows(rows = []) {
  if (!Array.isArray(rows)) {
    fail("invalid_course_entities", "As entidades do Curso precisam formar uma lista.");
  }
  const normalized = rows.map(normalizeRow);
  const identities = new Map();
  for (const row of normalized) {
    const key = identityKey(row.entityType, row.entityId);
    if (identities.has(key)) {
      fail(
        "duplicate_course_entity_identity",
        "A identidade da entidade precisa ser única dentro do Curso.",
        { entityType: row.entityType, entityId: row.entityId }
      );
    }
    identities.set(key, row);
  }
  for (const row of normalized) {
    if (row.parentType === null) continue;
    if (!identities.has(identityKey(row.parentType, row.parentId))) {
      fail(
        "course_entity_parent_not_found",
        "O pai de uma entidade não existe no Curso.",
        {
          entityType: row.entityType,
          entityId: row.entityId,
          parentType: row.parentType,
          parentId: row.parentId
        }
      );
    }
  }
  const siblingGroups = new Map();
  for (const row of normalized) {
    const key = `${identityKey(row.parentType || "course", row.parentId || "root")}\u0000${row.entityType}`;
    const siblings = siblingGroups.get(key) || [];
    siblings.push(row);
    siblingGroups.set(key, siblings);
  }
  for (const siblings of siblingGroups.values()) {
    siblings.sort((left, right) => left.position - right.position ||
      left.entityId.localeCompare(right.entityId));
    if (new Set(siblings.map((row) => row.position)).size !== siblings.length) {
      fail(
        "duplicate_course_entity_position",
        "Entidades irmãs não podem ocupar a mesma posição.",
        {
          parentType: siblings[0].parentType,
          parentId: siblings[0].parentId,
          entityType: siblings[0].entityType
        }
      );
    }
    if (siblings[0].entityType !== "study_unit" &&
        siblings.some((row, index) => row.position !== index)) {
      fail(
        "non_contiguous_course_entity_positions",
        "As posições estruturais precisam ser contíguas a partir de zero.",
        {
          parentType: siblings[0].parentType,
          parentId: siblings[0].parentId,
          entityType: siblings[0].entityType
        }
      );
    }
  }
  return normalized;
}

export function flattenCourseDocument(document) {
  const candidate = cloneJson(document, "Documento do Curso");
  const validation = validateProjectDocument(candidate);
  if (!validation.ok || candidate.courses?.length !== 1) {
    fail(
      "invalid_course_document",
      "O documento precisa conter exatamente um Curso válido.",
      { errors: validation.errors }
    );
  }
  const course = validation.value?.courses?.[0] || candidate.courses[0];
  const rows = [];
  const identities = new Set();
  const visit = (entityType, entity, parentType, parentId, position) => {
    const entityId = text(entity?.id);
    if (!entityId) {
      fail("invalid_course_entity_identity", `A entidade ${entityType} não possui identidade.`);
    }
    const key = identityKey(entityType, entityId);
    if (identities.has(key)) {
      fail(
        "duplicate_course_entity_identity",
        "A identidade da entidade precisa ser única dentro do Curso.",
        { entityType, entityId }
      );
    }
    identities.add(key);
    rows.push({
      entityType,
      entityId,
      parentType,
      parentId,
      position,
      content: contentWithoutStructure(entityType, entity)
    });
    for (const child of CHILDREN[entityType]) {
      const collection = entity?.[child.field];
      if (!Array.isArray(collection)) {
        fail(
          "invalid_course_document",
          `O campo ${child.field} precisa ser uma lista.`,
          { entityType, entityId, field: child.field }
        );
      }
      collection.forEach((value, index) => visit(
        child.entityType,
        value,
        entityType,
        entityId,
        entityPosition(child.entityType, value, index)
      ));
    }
  };
  course.modules.forEach((moduleValue, index) => visit(
    "module",
    moduleValue,
    null,
    null,
    index
  ));
  return { course: normalizeCourse(course), rows: normalizeCourseEntityRows(rows) };
}

export function composeCourseDocument(courseValue, rows = []) {
  const course = normalizeCourse(courseValue);
  const normalized = normalizeCourseEntityRows(rows);
  const entities = new Map();
  for (const row of normalized) {
    const entity = cloneJson(row.content, "Conteúdo da entidade");
    entity.id = row.entityId;
    for (const child of CHILDREN[row.entityType]) entity[child.field] = [];
    if (row.entityType === "study_unit") entity.position = row.position;
    entities.set(identityKey(row.entityType, row.entityId), entity);
  }
  const modules = [];
  const ordered = [...normalized].sort((left, right) => {
    if (left.parentType !== right.parentType) {
      return (COURSE_ENTITY_TYPES.indexOf(left.parentType) + 1) -
        (COURSE_ENTITY_TYPES.indexOf(right.parentType) + 1);
    }
    if (left.parentId !== right.parentId) {
      return String(left.parentId || "").localeCompare(String(right.parentId || ""));
    }
    if (left.entityType !== right.entityType) {
      return COURSE_ENTITY_TYPES.indexOf(left.entityType) -
        COURSE_ENTITY_TYPES.indexOf(right.entityType);
    }
    return left.position - right.position || left.entityId.localeCompare(right.entityId);
  });
  for (const row of ordered) {
    const entity = entities.get(identityKey(row.entityType, row.entityId));
    if (row.parentType === null) {
      modules.push(entity);
      continue;
    }
    const parent = entities.get(identityKey(row.parentType, row.parentId));
    const child = CHILDREN[row.parentType].find(
      (candidate) => candidate.entityType === row.entityType
    );
    parent[child.field].push(entity);
  }
  const document = {
    contract: "aralearn.course.v1",
    courses: [{ ...course, modules }]
  };
  const validation = validateProjectDocument(document);
  if (!validation.ok) {
    fail(
      "invalid_course_document",
      "As entidades não recompõem um Curso válido.",
      { errors: validation.errors }
    );
  }
  return validation.value || document;
}

export function courseEntityOutline(courseValue, rows = []) {
  const document = composeCourseDocument(courseValue, rows);
  const course = document.courses[0];
  return {
    courseId: course.id,
    title: course.title,
    goal: course.goal,
    modules: course.modules.map((moduleValue) => ({
      id: moduleValue.id,
      title: moduleValue.title,
      lessons: moduleValue.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        microsequences: lesson.microsequences.map((microsequence) => ({
          id: microsequence.id,
          title: microsequence.title,
          goal: microsequence.goal,
          role: microsequence.role,
          studyUnitCount: microsequence.studyUnits.length
        }))
      }))
    }))
  };
}

export { COURSE_ENTITY_TYPES };
