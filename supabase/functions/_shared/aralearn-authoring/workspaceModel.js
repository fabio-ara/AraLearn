import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import {
  cloneWorkspaceEntityWithFreshIds
} from "./workspaceIncremental.js";
import {
  invalidateReadyDescendants,
  invalidateReadyMicrosequence
} from "./workspaceReviewState.js";

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

const ENTITY_PATH_TYPES = Object.freeze([
  "course",
  "module",
  "lesson",
  "microsequence",
  "card"
]);
const THEORY_PROJECTION_OMITTED_FIELDS = new Set([
  "id", "position", "role", "response", "feedback", "sources", "topics"
]);

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

function normalizeEntityPath(entityType, entityPath) {
  const expectedLength = ENTITY_PATH_TYPES.indexOf(entityType) + 1;
  if (expectedLength < 1
      || !Array.isArray(entityPath)
      || entityPath.length !== expectedLength
      || entityPath.some((id) => !text(id))) {
    workspaceError(
      "invalid_workspace_entity_path",
      `entityPath de ${TYPE_LABEL[entityType] || "entidade"} deve conter ${expectedLength} id(s).`,
      { entityType, entityPath }
    );
  }
  return entityPath.map(text);
}

function locate(document, entityType, entityPath) {
  const identities = normalizeEntityPath(entityType, entityPath);
  let parentType = "project";
  let parent = document;
  let collection = document.courses;
  let entity = null;
  let index = -1;
  let path = "";
  for (let depth = 0; depth < identities.length; depth += 1) {
    index = collection.findIndex((candidate) => text(candidate?.id) === identities[depth]);
    if (index < 0) {
      workspaceError(
        "workspace_entity_not_found",
        `${TYPE_LABEL[entityType] || "Entidade"} não encontrado no caminho informado.`,
        { entityType, entityPath: identities, missingDepth: depth },
        404
      );
    }
    entity = collection[index];
    path += `/${CHILDREN[parentType]}/${index}`;
    if (depth < identities.length - 1) {
      parentType = ENTITY_PATH_TYPES[depth];
      parent = entity;
      collection = entityChildren(parentType, entity);
    }
  }
  return { entityType, entity, parentType, parent, collection, index, path, entityPath: identities };
}

function assertValidWorkspace(document) {
  const validation = validateProjectDocument(document);
  if (!validation.ok) {
    workspaceError(
      "invalid_workspace_document",
      "O workspace viola o contrato AraLearn por packages.",
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

function destinationCollection(document, entityType, parentPath) {
  const parentType = PARENT_TYPE[entityType];
  if (parentType === "project") {
    if (parentPath != null) {
      workspaceError("invalid_workspace_parent", "Cursos só podem existir na raiz do workspace.");
    }
    return document.courses;
  }
  const parent = locate(document, parentType, parentPath);
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

function remapMicrosequenceReferences(lesson, removedIds, replacementId = null) {
  const removed = new Set(removedIds);
  const changed = [];
  for (const entity of lesson?.microsequences || []) {
    const before = JSON.stringify({
      dependsOn: entity.dependsOn || [],
      branchOf: entity.branchOf ?? null
    });
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
    const after = JSON.stringify({
      dependsOn: entity.dependsOn || [],
      branchOf: entity.branchOf ?? null
    });
    if (before !== after) changed.push(entity);
  }
  return changed;
}

function mergeStringLists(left, right) {
  return [...new Set([...(left || []), ...(right || [])].map(text).filter(Boolean))];
}

function humanTheoryFragments(value, field = null) {
  if (typeof value === "string") {
    const normalized = text(value);
    return normalized ? [normalized] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [field ? `${field}: ${value}` : String(value)];
  }
  if (Array.isArray(value)) {
    if (value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      const row = value.map((item) => text(String(item))).filter(Boolean).join(" | ");
      return row ? [row] : [];
    }
    return value.flatMap((item) => humanTheoryFragments(item));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([nestedField, nestedValue]) =>
    THEORY_PROJECTION_OMITTED_FIELDS.has(nestedField)
      ? []
      : humanTheoryFragments(nestedValue, nestedField)
  );
}

function theoryConceptualExcerpt(card) {
  const title = text(card.title);
  const details = Object.entries(card).flatMap(([field, value]) =>
    field === "title" || THEORY_PROJECTION_OMITTED_FIELDS.has(field)
      ? []
      : humanTheoryFragments(value, field)
  );
  return [...new Set([title, ...details].filter(Boolean))].join("\n");
}

function aggregateTheoryContent(cards) {
  return cards
    .filter((card) => card.role === "theory")
    .map(theoryConceptualExcerpt)
    .filter(Boolean)
    .join("\n\n");
}

function collectCardResources(cards) {
  return [...new Set(cards.flatMap((card) => [
    ...(card.content || []),
    ...(card.response ? [card.response] : []),
    ...(card.feedback || [])
  ]).map((instance) => text(instance?.package)).filter(Boolean))];
}

function collectCardTopicLabels(cards, lessonTopics) {
  const labelById = new Map((lessonTopics || []).map((topic) => [
    text(topic?.id),
    text(topic?.label)
  ]));
  return [...new Set(cards.flatMap((card) => card.topics || []).map((topic) => {
    const topicId = text(typeof topic === "string" ? topic : topic?.id);
    return labelById.get(topicId) || text(topic?.label);
  }).filter(Boolean))];
}

export function createEmptyAuthoringWorkspace() {
  return {
    contract: "aralearn.library.v1",
    courses: []
  };
}

export function validateAuthoringWorkspace(document) {
  return assertValidWorkspace(clone(document));
}

export function buildWorkspaceOutline(document) {
  assertValidWorkspace(document);
  return {
    courses: document.courses.map((course) => {
      const coursePath = [course.id];
      return {
      id: course.id,
      entityPath: coursePath,
      title: course.title,
      goal: course.goal,
      modules: course.modules.map((moduleValue) => {
        const modulePath = [...coursePath, moduleValue.id];
        return {
        id: moduleValue.id,
        entityPath: modulePath,
        title: moduleValue.title,
        lessons: moduleValue.lessons.map((lesson) => {
          const lessonPath = [...modulePath, lesson.id];
          return {
          id: lesson.id,
          entityPath: lessonPath,
          title: lesson.title,
          microsequences: lesson.microsequences.map((microsequence) => {
            const microsequencePath = [...lessonPath, microsequence.id];
            return {
            id: microsequence.id,
            entityPath: microsequencePath,
            title: microsequence.title,
            goal: microsequence.goal,
            role: microsequence.role,
            cardCount: microsequence.cards.length
          };
          })
        };
        })
      };
      })
    };
    })
  };
}

export function readWorkspaceEntity(document, entityType, entityPath, {
  includeDescendants = true
} = {}) {
  assertValidWorkspace(document);
  const located = locate(document, entityType, entityPath);
  if (includeDescendants) return clone(located.entity);
  const result = clone(located.entity);
  const childField = CHILDREN[entityType];
  if (childField) {
    result[`${childField.slice(0, -1)}Count`] = result[childField].length;
    delete result[childField];
  }
  return result;
}

export function buildMicrotheoryReview(document, entityPath = null) {
  assertValidWorkspace(document);
  const selectedPath = entityPath == null ? null : entityPath.map(text);
  if (selectedPath) {
    const entityType = ENTITY_PATH_TYPES[selectedPath.length - 1];
    if (!entityType || entityType === "card") {
      workspaceError(
        "invalid_workspace_entity_path",
        "A revisão conceitual aceita caminhos até microssequência."
      );
    }
    locate(document, entityType, selectedPath);
  }
  const pathMatches = (depth, id) =>
    !selectedPath || selectedPath.length <= depth || selectedPath[depth] === id;
  return {
    courses: document.courses.filter((course) => pathMatches(0, course.id)).map((course) => {
      const coursePath = [course.id];
      return {
      id: course.id,
      entityPath: coursePath,
      title: course.title,
      modules: course.modules.filter((moduleValue) =>
        pathMatches(1, moduleValue.id)).map((moduleValue) => {
        const modulePath = [...coursePath, moduleValue.id];
        return {
        id: moduleValue.id,
        entityPath: modulePath,
        title: moduleValue.title,
        lessons: moduleValue.lessons.filter((lesson) =>
          pathMatches(2, lesson.id)).map((lesson) => {
          const lessonPath = [...modulePath, lesson.id];
          return {
          id: lesson.id,
          entityPath: lessonPath,
          title: lesson.title,
          microtheories: lesson.microsequences.filter((microsequence) =>
            pathMatches(3, microsequence.id)).map((microsequence) => ({
            id: microsequence.id,
            entityPath: [...lessonPath, microsequence.id],
            title: microsequence.title,
            goal: microsequence.goal,
            content: aggregateTheoryContent(microsequence.cards),
            covers: [...(microsequence.covers || [])],
            checks: [...(microsequence.checks || [])],
            errors: [...(microsequence.errors || [])],
            resources: collectCardResources(microsequence.cards),
            topics: collectCardTopicLabels(microsequence.cards, lesson.topics),
            practiceCount: microsequence.cards
              .filter((card) => card.role === "practice").length
          }))
        };
        })
      };
      })
    };
    })
  };
}

export function attachWorkspaceEntity(document, {
  entityType,
  parentPath = null,
  entity,
  position = null
}) {
  assertEntityShape(entityType, entity);
  const next = clone(document);
  const collection = destinationCollection(next, entityType, parentPath);
  if (collection.some((item) => item?.id === entity.id)) {
    workspaceError("workspace_entity_conflict", "Já existe uma entidade com esse id no destino.");
  }
  insertAt(collection, clone(entity), position);
  return assertValidWorkspace(normalizeDocument(next));
}

export function renameWorkspaceEntity(document, { entityType, entityPath, title }) {
  const next = clone(document);
  const located = locate(next, entityType, entityPath);
  const normalizedTitle = text(title);
  if (!normalizedTitle) workspaceError("invalid_workspace_title", "title não pode ficar vazio.");
  located.entity.title = normalizedTitle;
  return assertValidWorkspace(next);
}

export function moveWorkspaceEntity(document, {
  entityType,
  entityPath,
  targetParentPath = null,
  position = null
}) {
  if (entityType === "course" && targetParentPath != null) {
    workspaceError("invalid_workspace_parent", "Cursos só podem ser movidos na raiz do workspace.");
  }
  const before = canonicalJsonStringify(document);
  const next = clone(document);
  const located = locate(next, entityType, entityPath);
  const destination = destinationCollection(next, entityType, targetParentPath);
  const sourceMicrosequence = entityType === "card" ? located.parent : null;
  const targetMicrosequence = entityType === "card"
    ? locate(next, "microsequence", targetParentPath).entity
    : null;
  const sourceLesson = entityType === "microsequence" ? located.parent : null;
  const targetLesson = entityType === "microsequence"
    ? locate(next, "lesson", targetParentPath).entity
    : null;
  located.collection.splice(located.index, 1);
  let sourceReferenceChanges = [];
  if (entityType === "microsequence" && sourceLesson !== targetLesson) {
    sourceReferenceChanges = remapMicrosequenceReferences(
      sourceLesson,
      [located.entity.id]
    );
    const allowedDependencies = new Set(
      (targetLesson.microsequences || []).map((microsequence) => microsequence.id)
    );
    located.entity.dependsOn = (located.entity.dependsOn || [])
      .filter((id) => allowedDependencies.has(id));
    if (!allowedDependencies.has(located.entity.branchOf)) delete located.entity.branchOf;
  }
  insertAt(destination, located.entity, position);
  normalizeDocument(next);
  if (before !== canonicalJsonStringify(next)) {
    if (entityType === "card") {
      invalidateReadyMicrosequence(sourceMicrosequence);
      invalidateReadyMicrosequence(targetMicrosequence);
    } else {
      invalidateReadyDescendants(entityType, located.entity);
      if (entityType === "microsequence" && sourceLesson !== targetLesson) {
        sourceReferenceChanges.forEach(invalidateReadyMicrosequence);
      }
    }
  }
  return assertValidWorkspace(next);
}

export function deleteWorkspaceEntity(document, { entityType, entityPath }) {
  const next = clone(document);
  const located = locate(next, entityType, entityPath);
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
  if (entityType === "card") {
    invalidateReadyMicrosequence(located.parent);
  } else if (entityType === "microsequence") {
    remapMicrosequenceReferences(located.parent, removedMicrosequenceIds)
      .forEach(invalidateReadyMicrosequence);
  }
  return assertValidWorkspace(normalizeDocument(next));
}

export function mergeWorkspaceMicrosequences(document, {
  targetPath,
  sourcePaths,
  title = null,
  goal = null
}) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    workspaceError("invalid_workspace_merge", "Informe ao menos uma microssequência de origem.");
  }
  const normalizedSourcePaths = sourcePaths.map(
    (path) => normalizeEntityPath("microsequence", path)
  );
  const uniquePathKeys = new Set(normalizedSourcePaths.map((path) => JSON.stringify(path)));
  if (uniquePathKeys.size !== normalizedSourcePaths.length) {
    workspaceError(
      "invalid_workspace_merge",
      "Cada microssequência de origem deve aparecer uma única vez."
    );
  }
  const next = clone(document);
  const target = locate(next, "microsequence", targetPath);
  const sources = normalizedSourcePaths.map((path) => locate(next, "microsequence", path))
    .filter((entry) => entry.entity !== target.entity);
  const normalizedSources = [...new Set(sources.map((entry) => entry.entity.id))];
  if (sources.length === 0) {
    workspaceError("invalid_workspace_merge", "A origem deve ser diferente do destino.");
  }
  const targetId = target.entity.id;
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
  const referenceChanges = remapMicrosequenceReferences(
    lesson,
    normalizedSources,
    targetId
  );
  normalizeCardPositions(target.entity);
  invalidateReadyMicrosequence(target.entity);
  referenceChanges.forEach(invalidateReadyMicrosequence);
  return assertValidWorkspace(next);
}

export function splitWorkspaceMicrosequence(document, {
  sourcePath,
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
  const source = locate(next, "microsequence", sourcePath);
  const selectedCards = source.entity.cards.filter((card) => selectedIds.has(card.id));
  if (selectedCards.length !== selectedIds.size) {
    workspaceError("workspace_card_not_found", "A divisão contém card inexistente na origem.");
  }
  const entity = clone(newMicrosequence);
  entity.cards = selectedCards;
  source.entity.cards = source.entity.cards.filter((card) => !selectedIds.has(card.id));
  normalizeCardPositions(source.entity);
  normalizeCardPositions(entity);
  insertAt(source.collection, entity, position == null ? source.index + 1 : position);
  invalidateReadyMicrosequence(source.entity);
  invalidateReadyMicrosequence(entity);
  return assertValidWorkspace(next);
}

export function promoteModuleToCourse(document, {
  modulePath,
  courseId,
  title = null,
  goal,
  mode = "move"
}) {
  if (mode !== "move" && mode !== "copy") {
    workspaceError("invalid_workspace_mode", "mode deve ser move ou copy.");
  }
  const next = clone(document);
  const moduleEntry = locate(next, "module", modulePath);
  const normalizedCourseId = text(courseId);
  if (next.courses.some((course) => course.id === normalizedCourseId)) {
    workspaceError(
      "workspace_entity_conflict",
      "Já existe um curso com esse id no workspace."
    );
  }
  const moduleValue = mode === "move"
    ? moduleEntry.entity
    : clone(moduleEntry.entity);
  if (mode === "move") {
    moduleEntry.collection.splice(moduleEntry.index, 1);
  }
  const candidate = {
    id: normalizedCourseId,
    title: text(title) || moduleValue.title,
    goal: text(goal) || text(moduleValue.guide?.goal) || moduleValue.title,
    modules: [moduleValue]
  };
  assertEntityShape("course", candidate);
  const course = mode === "copy"
    ? cloneWorkspaceEntityWithFreshIds(next, {
      entityType: "course",
      entity: candidate,
      newRootId: normalizedCourseId
    })
    : candidate;
  invalidateReadyDescendants("course", course);
  next.courses.push(course);
  return assertValidWorkspace(next);
}

export function demoteCourseToModule(document, {
  coursePath,
  targetCoursePath,
  moduleId,
  title = null,
  mode = "move"
}) {
  if (mode !== "move" && mode !== "copy") {
    workspaceError("invalid_workspace_mode", "mode deve ser move ou copy.");
  }
  const next = clone(document);
  const source = locate(next, "course", coursePath);
  const target = locate(next, "course", targetCoursePath);
  if (source.entity === target.entity) {
    workspaceError("invalid_workspace_conversion", "O curso de origem e o curso de destino devem ser diferentes.");
  }
  const normalizedModuleId = text(moduleId);
  const moduleIdConflict = next.courses
    .filter((course) => mode === "copy" || course !== source.entity)
    .some((course) => course.modules.some(
      (moduleValue) => moduleValue.id === normalizedModuleId
    ));
  if (moduleIdConflict) {
    workspaceError(
      "workspace_entity_conflict",
      "Já existe um módulo com esse id no workspace."
    );
  }
  const lessons = source.entity.modules.flatMap((moduleValue) =>
    mode === "copy" ? clone(moduleValue.lessons) : moduleValue.lessons);
  const candidate = {
    id: normalizedModuleId,
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
  assertEntityShape("module", candidate);
  const moduleValue = mode === "copy"
    ? cloneWorkspaceEntityWithFreshIds(next, {
      entityType: "module",
      entity: candidate,
      newRootId: normalizedModuleId,
      targetParent: target.entity
    })
    : candidate;
  invalidateReadyDescendants("module", moduleValue);
  target.entity.modules.push(moduleValue);
  if (mode === "move") source.collection.splice(source.index, 1);
  return assertValidWorkspace(next);
}

export function selectCourseDocument(document, courseId) {
  const course = locate(document, "course", [courseId]).entity;
  return assertValidWorkspace({
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [clone(course)]
  });
}
