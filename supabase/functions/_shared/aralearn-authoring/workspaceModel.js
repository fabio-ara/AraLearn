import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import { AuthoringApiError } from "./errors.js";

const CHILDREN = Object.freeze({
  project: "courses",
  course: "modules",
  module: "lessons",
  lesson: "microsequences",
  microsequence: "cards"
});

const PARENT_TYPE = Object.freeze({
  course: "project",
  module: "course",
  lesson: "module",
  microsequence: "lesson",
  card: "microsequence"
});

const TYPE_LABEL = Object.freeze({
  course: "curso",
  module: "módulo",
  lesson: "lição",
  microsequence: "microssequência",
  card: "card"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function workspaceError(code, message, details = undefined, status = 422) {
  throw new AuthoringApiError(status, code, message, details);
}

function entityChildren(entityType, entity) {
  const field = CHILDREN[entityType];
  return field && Array.isArray(entity?.[field]) ? entity[field] : [];
}

function walk(document, visitor) {
  const visit = (entityType, entity, parentType, parent, collection, index, path) => {
    visitor({ entityType, entity, parentType, parent, collection, index, path });
    const childType = ({
      project: "course",
      course: "module",
      module: "lesson",
      lesson: "microsequence",
      microsequence: "card"
    })[entityType];
    if (!childType) return;
    entityChildren(entityType, entity).forEach((child, childIndex) => {
      visit(
        childType,
        child,
        entityType,
        entity,
        entityChildren(entityType, entity),
        childIndex,
        `${path}/${CHILDREN[entityType]}/${childIndex}`
      );
    });
  };
  visit("project", document, null, null, null, -1, "");
}

function locate(document, entityType, entityId) {
  const matches = [];
  walk(document, (entry) => {
    if (entry.entityType === entityType && text(entry.entity?.id) === text(entityId)) {
      matches.push(entry);
    }
  });
  if (matches.length === 0) {
    workspaceError(
      "workspace_entity_not_found",
      `${TYPE_LABEL[entityType] || "Entidade"} não encontrado.`,
      { entityType, entityId },
      404
    );
  }
  if (matches.length > 1) {
    workspaceError(
      "workspace_entity_ambiguous",
      "O identificador aparece mais de uma vez no workspace; informe um identificador inequívoco.",
      { entityType, entityId, paths: matches.map((entry) => entry.path) },
      409
    );
  }
  return matches[0];
}

function assertValidWorkspace(document) {
  const validation = validateProjectDocument(document);
  if (!validation.ok) {
    workspaceError(
      "invalid_workspace_document",
      "O workspace viola o contrato AraLearn v4.",
      { errors: validation.errors }
    );
  }
  return validation.value || document;
}

function normalizeCardPositions(microsequence) {
  (microsequence?.cards || []).forEach((card, index) => {
    card.position = index + 1;
  });
}

function normalizeDocument(document) {
  walk(document, ({ entityType, entity }) => {
    if (entityType === "microsequence") normalizeCardPositions(entity);
  });
  return document;
}

function destinationCollection(document, entityType, parentId) {
  const parentType = PARENT_TYPE[entityType];
  if (parentType === "project") return document.courses;
  const parent = locate(document, parentType, parentId);
  return entityChildren(parentType, parent.entity);
}

function assertEntityShape(entityType, entity) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    workspaceError("invalid_workspace_entity", "A entidade deve ser um objeto.", { entityType });
  }
  if (!text(entity.id)) {
    workspaceError("invalid_workspace_entity", "A entidade precisa de id estável.", { entityType });
  }
}

function insertAt(collection, value, position) {
  const index = position == null
    ? collection.length
    : Math.max(0, Math.min(collection.length, Number(position)));
  if (!Number.isInteger(index)) {
    workspaceError("invalid_workspace_position", "position deve ser um inteiro.");
  }
  collection.splice(index, 0, value);
}

function remapMicrosequenceReferences(document, removedIds, replacementId = null) {
  const removed = new Set(removedIds);
  walk(document, ({ entityType, entity }) => {
    if (entityType !== "microsequence") return;
    const next = [];
    for (const dependency of entity.dependsOn || []) {
      if (removed.has(dependency)) {
        if (replacementId && replacementId !== entity.id && !next.includes(replacementId)) {
          next.push(replacementId);
        }
      } else if (!next.includes(dependency)) {
        next.push(dependency);
      }
    }
    entity.dependsOn = next;
    if (removed.has(entity.branchOf)) {
      if (replacementId && replacementId !== entity.id) entity.branchOf = replacementId;
      else delete entity.branchOf;
    }
  });
}

function mergeStringLists(left, right) {
  return [...new Set([...(left || []), ...(right || [])].map(text).filter(Boolean))];
}

function theoryCardProjection(card) {
  const projected = clone(card);
  delete projected.after;
  delete projected.afterBlocks;
  delete projected.sources;
  return projected;
}

export function createEmptyAuthoringWorkspace() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: []
  };
}

export function validateAuthoringWorkspace(document) {
  return assertValidWorkspace(clone(document));
}

export function buildWorkspaceOutline(document) {
  assertValidWorkspace(document);
  const cards = (microsequence) => (microsequence.cards || []).map((card) => ({
    id: card.id,
    title: text(card.title) || `${card.resource} ${card.position}`,
    resource: card.resource,
    kind: card.kind,
    position: card.position
  }));
  return {
    courses: document.courses.map((course) => ({
      id: course.id,
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
            status: microsequence.status,
            cardCount: microsequence.cards.length,
            cards: cards(microsequence)
          }))
        }))
      }))
    }))
  };
}

export function readWorkspaceEntity(document, entityType, entityId, {
  includeDescendants = true
} = {}) {
  assertValidWorkspace(document);
  const located = locate(document, entityType, entityId);
  if (includeDescendants) return clone(located.entity);
  const result = clone(located.entity);
  const childField = CHILDREN[entityType];
  if (childField) {
    result[`${childField.slice(0, -1)}Count`] = result[childField].length;
    delete result[childField];
  }
  return result;
}

export function buildMicrotheoryReview(document, courseId = null) {
  assertValidWorkspace(document);
  const courses = courseId
    ? [locate(document, "course", courseId).entity]
    : document.courses;
  return {
    courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      modules: course.modules.map((moduleValue) => ({
        id: moduleValue.id,
        title: moduleValue.title,
        lessons: moduleValue.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          microtheories: lesson.microsequences.map((microsequence) => ({
            id: microsequence.id,
            title: microsequence.title,
            goal: microsequence.goal,
            status: microsequence.status,
            theoryCards: microsequence.cards
              .filter((card) => card.kind === "theory")
              .map(theoryCardProjection),
            practiceCardCount: microsequence.cards
              .filter((card) => card.kind === "exercise").length
          }))
        }))
      }))
    }))
  };
}

export function insertWorkspaceEntity(document, {
  entityType,
  parentId = null,
  entity,
  position = null
}) {
  assertEntityShape(entityType, entity);
  const next = clone(document);
  const collection = destinationCollection(next, entityType, parentId);
  if (collection.some((item) => item?.id === entity.id)) {
    workspaceError("workspace_entity_conflict", "Já existe uma entidade com esse id no destino.");
  }
  insertAt(collection, clone(entity), position);
  return assertValidWorkspace(normalizeDocument(next));
}

export function replaceWorkspaceEntity(document, {
  entityType,
  entityId,
  entity
}) {
  assertEntityShape(entityType, entity);
  if (text(entity.id) !== text(entityId)) {
    workspaceError(
      "workspace_identity_change_forbidden",
      "A substituição deve preservar o id; use uma operação estrutural para mudar a identidade."
    );
  }
  const next = clone(document);
  const located = locate(next, entityType, entityId);
  located.collection[located.index] = clone(entity);
  return assertValidWorkspace(normalizeDocument(next));
}

export function renameWorkspaceEntity(document, { entityType, entityId, title }) {
  const next = clone(document);
  const located = locate(next, entityType, entityId);
  const normalizedTitle = text(title);
  if (!normalizedTitle) workspaceError("invalid_workspace_title", "title não pode ficar vazio.");
  located.entity.title = normalizedTitle;
  return assertValidWorkspace(next);
}

export function moveWorkspaceEntity(document, {
  entityType,
  entityId,
  targetParentId = null,
  position = null
}) {
  if (entityType === "course" && targetParentId != null) {
    workspaceError("invalid_workspace_parent", "Cursos só podem ser movidos na raiz do workspace.");
  }
  const next = clone(document);
  const located = locate(next, entityType, entityId);
  const destination = destinationCollection(next, entityType, targetParentId);
  located.collection.splice(located.index, 1);
  insertAt(destination, located.entity, position);
  return assertValidWorkspace(normalizeDocument(next));
}

export function deleteWorkspaceEntity(document, { entityType, entityId }) {
  const next = clone(document);
  const located = locate(next, entityType, entityId);
  if (!located.collection) {
    workspaceError("workspace_root_delete_forbidden", "A raiz do workspace não pode ser excluída.");
  }
  const removedMicrosequenceIds = [];
  const collectMicrosequences = (currentType, entity) => {
    if (currentType === "microsequence") removedMicrosequenceIds.push(entity.id);
    const childType = ({
      course: "module",
      module: "lesson",
      lesson: "microsequence",
      microsequence: "card"
    })[currentType];
    if (!childType) return;
    entityChildren(currentType, entity).forEach((child) => collectMicrosequences(childType, child));
  };
  collectMicrosequences(entityType, located.entity);
  located.collection.splice(located.index, 1);
  remapMicrosequenceReferences(next, removedMicrosequenceIds);
  return assertValidWorkspace(normalizeDocument(next));
}

export function mergeWorkspaceMicrosequences(document, {
  targetId,
  sourceIds,
  title = null,
  goal = null
}) {
  const normalizedSources = [...new Set((sourceIds || []).map(text).filter(Boolean))]
    .filter((id) => id !== targetId);
  if (normalizedSources.length === 0) {
    workspaceError("invalid_workspace_merge", "Informe ao menos uma microssequência de origem.");
  }
  const next = clone(document);
  const target = locate(next, "microsequence", targetId);
  const sources = normalizedSources.map((id) => locate(next, "microsequence", id));
  const lesson = target.parent;
  if (sources.some((entry) => entry.parent !== lesson)) {
    workspaceError(
      "workspace_cross_lesson_merge",
      "Mova primeiro as microssequências para a mesma lição antes de juntá-las."
    );
  }
  for (const source of sources.sort((a, b) => a.index - b.index)) {
    target.entity.cards.push(...source.entity.cards);
    for (const field of ["covers", "checks", "errors", "dependsOn"]) {
      target.entity[field] = mergeStringLists(target.entity[field], source.entity[field])
        .filter((id) => id !== targetId && !normalizedSources.includes(id));
    }
  }
  if (text(title)) target.entity.title = text(title);
  if (text(goal)) target.entity.goal = text(goal);
  for (const source of [...sources].sort((a, b) => b.index - a.index)) {
    source.collection.splice(source.index, 1);
  }
  remapMicrosequenceReferences(next, normalizedSources, targetId);
  normalizeCardPositions(target.entity);
  return assertValidWorkspace(next);
}

export function splitWorkspaceMicrosequence(document, {
  sourceId,
  newMicrosequence,
  cardIds,
  position = null
}) {
  assertEntityShape("microsequence", newMicrosequence);
  const selectedIds = new Set((cardIds || []).map(text).filter(Boolean));
  if (selectedIds.size === 0) {
    workspaceError("invalid_workspace_split", "Selecione ao menos um card para a nova microssequência.");
  }
  const next = clone(document);
  const source = locate(next, "microsequence", sourceId);
  const selectedCards = source.entity.cards.filter((card) => selectedIds.has(card.id));
  if (selectedCards.length !== selectedIds.size) {
    workspaceError("workspace_card_not_found", "A divisão contém card inexistente na origem.");
  }
  const entity = clone(newMicrosequence);
  entity.cards = selectedCards;
  source.entity.cards = source.entity.cards.filter((card) => !selectedIds.has(card.id));
  if (source.entity.cards.length === 0 && source.entity.status !== "planned") {
    source.entity.status = "planned";
  }
  normalizeCardPositions(source.entity);
  normalizeCardPositions(entity);
  insertAt(source.collection, entity, position == null ? source.index + 1 : position);
  return assertValidWorkspace(next);
}

export function promoteModuleToCourse(document, {
  moduleId,
  courseId,
  title = null,
  goal,
  mode = "move"
}) {
  const next = clone(document);
  const moduleEntry = locate(next, "module", moduleId);
  const moduleValue = clone(moduleEntry.entity);
  if (mode === "move") moduleEntry.collection.splice(moduleEntry.index, 1);
  else if (mode !== "copy") workspaceError("invalid_workspace_mode", "mode deve ser move ou copy.");
  const course = {
    id: text(courseId),
    title: text(title) || moduleValue.title,
    goal: text(goal) || text(moduleValue.guide?.goal) || moduleValue.title,
    modules: [moduleValue]
  };
  assertEntityShape("course", course);
  next.courses.push(course);
  return assertValidWorkspace(next);
}

export function demoteCourseToModule(document, {
  courseId,
  targetCourseId,
  moduleId,
  title = null,
  mode = "move"
}) {
  const next = clone(document);
  const source = locate(next, "course", courseId);
  const target = locate(next, "course", targetCourseId);
  if (source.entity === target.entity) {
    workspaceError("invalid_workspace_conversion", "O curso de origem e o curso de destino devem ser diferentes.");
  }
  const lessons = source.entity.modules.flatMap((moduleValue) => clone(moduleValue.lessons));
  const moduleValue = {
    id: text(moduleId),
    title: text(title) || source.entity.title,
    guide: {
      goal: source.entity.goal,
      include: mergeStringLists([], source.entity.modules.flatMap((item) => item.guide?.include || [])),
      exclude: mergeStringLists([], source.entity.modules.flatMap((item) => item.guide?.exclude || [])),
      notation: mergeStringLists([], source.entity.modules.flatMap((item) => item.guide?.notation || [])),
      avoid: mergeStringLists([], source.entity.modules.flatMap((item) => item.guide?.avoid || []))
    },
    lessons
  };
  target.entity.modules.push(moduleValue);
  if (mode === "move") source.collection.splice(source.index, 1);
  else if (mode !== "copy") workspaceError("invalid_workspace_mode", "mode deve ser move ou copy.");
  return assertValidWorkspace(next);
}

export function selectCourseDocument(document, courseId) {
  const course = locate(document, "course", courseId).entity;
  return assertValidWorkspace({
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [clone(course)]
  });
}
