import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";

const PROJECT_ENTITY_ID = "project";
const ENTITY_TYPES = Object.freeze([
  "project",
  "course",
  "module",
  "lesson",
  "topic",
  "microsequence",
  "card"
]);
const ENTITY_TYPE_SET = new Set(ENTITY_TYPES);
const PARENT_TYPE = Object.freeze({
  course: "project",
  module: "course",
  lesson: "module",
  topic: "lesson",
  microsequence: "lesson",
  card: "microsequence"
});
const CHILDREN = Object.freeze({
  project: Object.freeze([
    Object.freeze({ entityType: "course", field: "courses" })
  ]),
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
    Object.freeze({ entityType: "card", field: "cards" })
  ]),
  card: Object.freeze([])
});
const ROW_FIELDS = new Set([
  "entityType",
  "entityId",
  "parentType",
  "parentId",
  "position",
  "content",
  "version"
]);

function fail(code, message, details = undefined, status = 422) {
  throw new AuthoringApiError(status, code, message, details);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonClone(value, label) {
  try {
    return JSON.parse(canonicalJsonStringify(value));
  } catch {
    fail(
      "invalid_workspace_part_json",
      `${label} precisa conter somente dados JSON válidos.`
    );
  }
}

function identityKey(entityType, entityId) {
  return `${entityType}\u0000${entityId}`;
}

function positionFor(entityType, entity, index) {
  if (entityType !== "card") return index;
  const position = Number(entity?.position);
  if (!Number.isInteger(position) || position < 1) {
    fail(
      "invalid_workspace_part_position",
      "A posição do card deve ser um inteiro positivo.",
      { entityType, entityId: text(entity?.id), position: entity?.position }
    );
  }
  return position;
}

function contentWithoutIdentity(entityType, entity) {
  const content = jsonClone(entity, `Conteúdo de ${entityType}`);
  delete content.id;
  delete content.position;
  for (const child of CHILDREN[entityType]) delete content[child.field];
  return content;
}

function validatedDocument(document) {
  const candidate = jsonClone(document, "O documento do workspace");
  const validation = validateProjectDocument(candidate);
  if (!validation.ok) {
    fail(
      "invalid_workspace_parts_document",
      "O documento viola o contrato AraLearn por packages.",
      { errors: validation.errors }
    );
  }
  return validation.value || candidate;
}

function flattenValidatedDocument(document) {
  const rows = [];
  const identities = new Set();

  const visit = (
    entityType,
    entity,
    parentType,
    parentId,
    position
  ) => {
    const entityId = entityType === "project"
      ? PROJECT_ENTITY_ID
      : text(entity?.id);
    if (!entityId) {
      fail(
        "invalid_workspace_part_identity",
        `A entidade ${entityType} não possui identidade válida.`,
        { entityType }
      );
    }
    const key = identityKey(entityType, entityId);
    if (identities.has(key)) {
      fail(
        "duplicate_workspace_part_identity",
        "A identidade da entidade deve ser única em todo o workspace.",
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
      content: contentWithoutIdentity(entityType, entity)
    });

    for (const child of CHILDREN[entityType]) {
      const collection = entity?.[child.field];
      if (!Array.isArray(collection)) {
        fail(
          "invalid_workspace_parts_document",
          `O campo ${child.field} deve ser uma lista.`,
          { entityType, entityId, field: child.field }
        );
      }
      collection.forEach((value, index) => {
        visit(
          child.entityType,
          value,
          entityType,
          entityId,
          positionFor(child.entityType, value, index)
        );
      });
    }
  };

  visit("project", document, null, null, 0);
  return rows;
}

function normalizeRow(rawRow, index) {
  if (!isPlainObject(rawRow)) {
    fail(
      "invalid_workspace_part_row",
      "Cada parte do workspace deve ser um objeto.",
      { index }
    );
  }
  const unknownField = Object.keys(rawRow).find((field) => !ROW_FIELDS.has(field));
  if (unknownField) {
    fail(
      "unknown_workspace_part_field",
      `O campo ${unknownField} não pertence a uma parte do workspace.`,
      { index, field: unknownField }
    );
  }

  const entityType = text(rawRow.entityType);
  const entityId = text(rawRow.entityId);
  if (!ENTITY_TYPE_SET.has(entityType) || !entityId) {
    fail(
      "invalid_workspace_part_identity",
      "A parte possui tipo ou identidade inválida.",
      { index, entityType, entityId }
    );
  }
  const expectedParentType = PARENT_TYPE[entityType] || null;
  const parentType = rawRow.parentType == null ? null : text(rawRow.parentType);
  const parentId = rawRow.parentId == null ? null : text(rawRow.parentId);
  if (parentType !== expectedParentType
      || (entityType === "project" && parentId !== null)
      || (entityType !== "project" && !parentId)) {
    fail(
      "invalid_workspace_part_parent",
      "A parte possui pai incompatível com seu tipo.",
      { index, entityType, entityId, parentType, parentId }
    );
  }
  if (entityType === "project" && entityId !== PROJECT_ENTITY_ID) {
    fail(
      "invalid_workspace_part_identity",
      `A raiz do workspace deve usar entityId "${PROJECT_ENTITY_ID}".`,
      { index, entityId }
    );
  }

  const position = Number(rawRow.position);
  const minimumPosition = entityType === "card" ? 1 : 0;
  if (!Number.isSafeInteger(position) || position < minimumPosition) {
    fail(
      "invalid_workspace_part_position",
      "A parte possui posição inválida.",
      { index, entityType, entityId, position: rawRow.position }
    );
  }
  if (!isPlainObject(rawRow.content)) {
    fail(
      "invalid_workspace_part_content",
      "O conteúdo da parte deve ser um objeto JSON.",
      { index, entityType, entityId }
    );
  }
  const forbiddenField = [
    "id",
    "position",
    ...CHILDREN[entityType].map((child) => child.field)
  ].find((field) => hasOwn(rawRow.content, field));
  if (forbiddenField) {
    fail(
      "duplicated_workspace_part_field",
      `O campo ${forbiddenField} pertence à linha, não ao conteúdo da parte.`,
      { index, entityType, entityId, field: forbiddenField }
    );
  }

  const row = {
    entityType,
    entityId,
    parentType,
    parentId,
    position,
    content: jsonClone(rawRow.content, "O conteúdo da parte")
  };
  if (hasOwn(rawRow, "version")) {
    if (!Number.isSafeInteger(rawRow.version) || rawRow.version < 1) {
      fail(
        "invalid_workspace_part_version",
        "A versão da parte deve ser um inteiro positivo.",
        { index, entityType, entityId, version: rawRow.version }
      );
    }
    row.version = rawRow.version;
  }
  return row;
}

function normalizedRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    fail(
      "invalid_workspace_parts_rows",
      "A composição exige ao menos a linha raiz do workspace."
    );
  }
  const normalized = rows.map(normalizeRow);
  const identities = new Map();
  for (const row of normalized) {
    const key = identityKey(row.entityType, row.entityId);
    if (identities.has(key)) {
      fail(
        "duplicate_workspace_part_identity",
        "A identidade da entidade deve ser única em todo o workspace.",
        { entityType: row.entityType, entityId: row.entityId }
      );
    }
    identities.set(key, row);
  }

  const root = identities.get(identityKey("project", PROJECT_ENTITY_ID));
  if (!root || root.parentType !== null || root.parentId !== null || root.position !== 0) {
    fail(
      "invalid_workspace_parts_root",
      "A composição exige uma única raiz project na posição zero."
    );
  }
  for (const row of normalized) {
    if (row.entityType === "project") continue;
    if (!identities.has(identityKey(row.parentType, row.parentId))) {
      fail(
        "workspace_part_parent_not_found",
        "O pai de uma parte não existe no workspace.",
        {
          entityType: row.entityType,
          entityId: row.entityId,
          parentType: row.parentType,
          parentId: row.parentId
        },
        404
      );
    }
  }

  const siblingGroups = new Map();
  for (const row of normalized) {
    if (row.entityType === "project") continue;
    const groupKey = `${identityKey(row.parentType, row.parentId)}\u0000${row.entityType}`;
    const siblings = siblingGroups.get(groupKey) || [];
    siblings.push(row);
    siblingGroups.set(groupKey, siblings);
  }
  for (const siblings of siblingGroups.values()) {
    siblings.sort((left, right) => left.position - right.position);
    const positions = new Set(siblings.map((row) => row.position));
    if (positions.size !== siblings.length) {
      fail(
        "duplicate_workspace_part_position",
        "Entidades irmãs não podem ocupar a mesma posição.",
        {
          parentType: siblings[0].parentType,
          parentId: siblings[0].parentId,
          entityType: siblings[0].entityType
        }
      );
    }
    if (siblings[0].entityType !== "card"
        && siblings.some((row, index) => row.position !== index)) {
      fail(
        "non_contiguous_workspace_part_positions",
        "As posições das entidades irmãs devem ser contíguas a partir de zero.",
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

function composeNormalizedRows(rows) {
  const entities = new Map();
  for (const row of rows) {
    const entity = jsonClone(row.content, "O conteúdo da parte");
    if (row.entityType !== "project") entity.id = row.entityId;
    for (const child of CHILDREN[row.entityType]) entity[child.field] = [];
    if (row.entityType === "card") entity.position = row.position;
    entities.set(identityKey(row.entityType, row.entityId), entity);
  }

  const ordered = [...rows]
    .filter((row) => row.entityType !== "project")
    .sort((left, right) => {
      if (left.parentType !== right.parentType) {
        return ENTITY_TYPES.indexOf(left.parentType)
          - ENTITY_TYPES.indexOf(right.parentType);
      }
      if (left.parentId !== right.parentId) {
        return left.parentId.localeCompare(right.parentId);
      }
      if (left.entityType !== right.entityType) {
        return ENTITY_TYPES.indexOf(left.entityType)
          - ENTITY_TYPES.indexOf(right.entityType);
      }
      return left.position - right.position;
    });
  for (const row of ordered) {
    const parent = entities.get(identityKey(row.parentType, row.parentId));
    const child = CHILDREN[row.parentType].find(
      (candidate) => candidate.entityType === row.entityType
    );
    parent[child.field].push(entities.get(identityKey(row.entityType, row.entityId)));
  }

  const document = entities.get(identityKey("project", PROJECT_ENTITY_ID));
  const validation = validateProjectDocument(document);
  if (!validation.ok) {
    fail(
      "invalid_workspace_parts_document",
      "As partes não recompõem um contrato AraLearn v4 válido.",
      { errors: validation.errors }
    );
  }
  return validation.value || document;
}

function comparableRow(row) {
  const value = { ...row };
  delete value.version;
  return canonicalJsonStringify(value);
}

function cloneRow(row) {
  return jsonClone(row, "A parte do workspace");
}

export function flattenWorkspaceDocument(document) {
  return flattenValidatedDocument(validatedDocument(document));
}

export function composeWorkspaceDocument(rows) {
  return composeNormalizedRows(normalizedRows(rows));
}

export function buildWorkspaceOutlineFromRows(rows) {
  const normalized = normalizedRows(rows);
  const groups = new Map();
  for (const row of normalized) {
    if (row.entityType === "project") continue;
    const key = `${identityKey(row.parentType, row.parentId)}\u0000${row.entityType}`;
    const values = groups.get(key) || [];
    values.push(row);
    groups.set(key, values);
  }
  for (const values of groups.values()) {
    values.sort((left, right) =>
      left.position - right.position
      || left.entityId.localeCompare(right.entityId)
    );
  }
  const children = (parentType, parentId, entityType) =>
    groups.get(`${identityKey(parentType, parentId)}\u0000${entityType}`) || [];
  const requiredContentText = (row, field) => {
    const value = text(row.content[field]);
    if (!value) {
      fail(
        "invalid_workspace_parts_document",
        `A parte ${row.entityType}:${row.entityId} não possui ${field} válido.`,
        { entityType: row.entityType, entityId: row.entityId, field }
      );
    }
    return value;
  };

  return {
    courses: children("project", PROJECT_ENTITY_ID, "course").map((course) => {
      const coursePath = [course.entityId];
      return {
        id: course.entityId,
        entityPath: coursePath,
        title: requiredContentText(course, "title"),
        goal: requiredContentText(course, "goal"),
        modules: children("course", course.entityId, "module").map((moduleValue) => {
          const modulePath = [...coursePath, moduleValue.entityId];
          return {
            id: moduleValue.entityId,
            entityPath: modulePath,
            title: requiredContentText(moduleValue, "title"),
            lessons: children("module", moduleValue.entityId, "lesson").map((lesson) => {
              const lessonPath = [...modulePath, lesson.entityId];
              return {
                id: lesson.entityId,
                entityPath: lessonPath,
                title: requiredContentText(lesson, "title"),
                microsequences: children(
                  "lesson",
                  lesson.entityId,
                  "microsequence"
                ).map((microsequence) => ({
                  id: microsequence.entityId,
                  entityPath: [...lessonPath, microsequence.entityId],
                  title: requiredContentText(microsequence, "title"),
                  goal: requiredContentText(microsequence, "goal"),
                  role: requiredContentText(microsequence, "role"),
                  cardCount: children(
                    "microsequence",
                    microsequence.entityId,
                    "card"
                  ).length
                }))
              };
            })
          };
        })
      };
    })
  };
}

export function diffWorkspaceDocument(currentRows, nextDocument) {
  const current = normalizedRows(currentRows);
  composeNormalizedRows(current);
  const next = flattenWorkspaceDocument(nextDocument);
  const currentByIdentity = new Map(
    current.map((row) => [identityKey(row.entityType, row.entityId), row])
  );
  const nextIdentities = new Set(
    next.map((row) => identityKey(row.entityType, row.entityId))
  );
  const nextRows = next.map((row) => {
    const previous = currentByIdentity.get(identityKey(row.entityType, row.entityId));
    if (!previous || !hasOwn(previous, "version")) return cloneRow(row);
    return { ...cloneRow(row), version: previous.version };
  });
  const upserts = nextRows.filter((row) => {
    const previous = currentByIdentity.get(identityKey(row.entityType, row.entityId));
    return !previous || comparableRow(previous) !== comparableRow(row);
  }).map(cloneRow);
  const deletes = current
    .filter((row) => !nextIdentities.has(identityKey(row.entityType, row.entityId)))
    .map(cloneRow);
  return { upserts, deletes, nextRows };
}
