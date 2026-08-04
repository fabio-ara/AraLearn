import { validateProjectDocument } from "../aralearn/runtime/domain/aralearnProject.js";
import {
  AuthoringGapError,
  compileAuthoringCardGaps
} from "../aralearn/runtime/core/authoringGaps.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import {
  invalidateReadyDescendants,
  invalidateReadyMicrosequence
} from "./workspaceReviewState.js";

const ENTITY_TYPES = Object.freeze([
  "course",
  "module",
  "lesson",
  "microsequence",
  "card"
]);

const STRUCTURE_TYPES = new Set(ENTITY_TYPES.slice(0, 4));
const STRUCTURE_PART_LIMIT = 40;
const MICROSEQUENCE_ROLES = new Set(["explain", "practice", "review", "support"]);
const MICROSEQUENCE_STATUSES = new Set(["planned", "generated", "needs_review", "ready"]);

const CHILD_FIELD = Object.freeze({
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

const COMMON_PART_FIELDS = Object.freeze([
  "entityType",
  "parentPath",
  "id",
  "title",
  "goal",
  "position"
]);

const GUIDE_PART_FIELDS = Object.freeze([
  "include",
  "exclude",
  "notation",
  "avoid"
]);

const MICROSEQUENCE_PART_FIELDS = Object.freeze([
  "role",
  "status",
  "branchOf",
  "dependsOn",
  "covers",
  "checks",
  "errors"
]);

function semanticMetadata(entityType, entity) {
  if (entityType === "course") {
    return { goal: entity.goal };
  }
  if (entityType === "module") {
    return {
      goal: entity.guide?.goal,
      include: entity.guide?.include,
      exclude: entity.guide?.exclude,
      notation: entity.guide?.notation,
      avoid: entity.guide?.avoid
    };
  }
  if (entityType === "lesson") {
    return {
      goal: entity.guide?.goal,
      include: entity.guide?.include,
      exclude: entity.guide?.exclude,
      notation: entity.guide?.notation,
      avoid: entity.guide?.avoid,
      topics: entity.topics
    };
  }
  return {
    goal: entity.goal,
    role: entity.role,
    branchOf: entity.branchOf,
    dependsOn: entity.dependsOn,
    covers: entity.covers,
    checks: entity.checks,
    errors: entity.errors
  };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = undefined, status = 422) {
  throw new AuthoringApiError(status, code, message, details);
}

function isPlainObject(value) {
  return value != null
    && typeof value === "object"
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function finalizeWorkspace(document) {
  const validation = validateProjectDocument(document);
  if (!validation.ok) {
    fail(
      "invalid_workspace_document",
      "O workspace viola o contrato AraLearn v4.",
      { errors: validation.errors }
    );
  }
  return validation.value;
}

function compileWorkspaceCard(card, basePath) {
  if (!isPlainObject(card)) {
    fail(
      "invalid_workspace_card",
      "Cada card deve ser um objeto completo.",
      { path: basePath }
    );
  }
  try {
    return compileAuthoringCardGaps(card, basePath);
  } catch (error) {
    if (!(error instanceof AuthoringGapError)) throw error;
    fail(
      "invalid_authoring_gap",
      error.message,
      {
        ...error.details,
        path: error.path,
        reason: error.reason
      }
    );
  }
}

function normalizedEntityPath(entityType, entityPath) {
  const expectedLength = ENTITY_TYPES.indexOf(entityType) + 1;
  if (expectedLength < 1
      || !Array.isArray(entityPath)
      || entityPath.length !== expectedLength
      || entityPath.some((id) => !text(id))) {
    fail(
      "invalid_workspace_entity_path",
      `entityPath de ${TYPE_LABEL[entityType] || "entidade"} deve conter ${expectedLength} id(s).`,
      { entityType, entityPath }
    );
  }
  return entityPath.map(text);
}

function childCollection(entityType, entity) {
  const fieldName = CHILD_FIELD[entityType];
  return fieldName && Array.isArray(entity?.[fieldName]) ? entity[fieldName] : [];
}

function locate(document, entityType, entityPath) {
  const identities = normalizedEntityPath(entityType, entityPath);
  let parentType = "project";
  let parent = document;
  let collection = Array.isArray(document?.courses) ? document.courses : [];
  let entity = null;
  let index = -1;

  for (let depth = 0; depth < identities.length; depth += 1) {
    index = collection.findIndex((candidate) => text(candidate?.id) === identities[depth]);
    if (index < 0) {
      fail(
        "workspace_entity_not_found",
        `${TYPE_LABEL[entityType] || "Entidade"} não encontrado no caminho informado.`,
        { entityType, entityPath: identities, missingDepth: depth },
        404
      );
    }
    entity = collection[index];
    if (depth < identities.length - 1) {
      parentType = ENTITY_TYPES[depth];
      parent = entity;
      collection = childCollection(parentType, entity);
    }
  }

  return {
    entity,
    parent,
    parentType,
    collection,
    index,
    entityPath: identities
  };
}

function destination(document, entityType, parentPath) {
  const parentType = PARENT_TYPE[entityType];
  if (!parentType) {
    fail(
      "invalid_workspace_entity_type",
      `Tipo de entidade não suportado: "${entityType}".`
    );
  }
  if (parentType === "project") {
    if (parentPath != null) {
      fail("invalid_workspace_parent", "Cursos só podem existir na raiz do workspace.");
    }
    if (!Array.isArray(document?.courses)) {
      fail("invalid_workspace_document", "O workspace precisa declarar courses como array.");
    }
    return { parentType, parent: document, collection: document.courses };
  }

  const locatedParent = locate(document, parentType, parentPath);
  return {
    parentType,
    parent: locatedParent.entity,
    collection: childCollection(parentType, locatedParent.entity)
  };
}

function insertAt(collection, entity, position) {
  if (position == null) {
    collection.push(entity);
    return;
  }
  if (!Number.isInteger(position) || position < 0) {
    fail("invalid_workspace_position", "position deve ser um inteiro maior ou igual a zero.");
  }
  collection.splice(Math.min(position, collection.length), 0, entity);
}

function requiredText(value, fieldName, details = undefined) {
  const normalized = text(value);
  if (!normalized) {
    fail(
      "invalid_workspace_structure_part",
      `${fieldName} deve ser texto não vazio.`,
      details
    );
  }
  return normalized;
}

function optionalStringList(value, fieldName, details = undefined) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    fail(
      "invalid_workspace_structure_part",
      `${fieldName} deve ser um array de textos.`,
      details
    );
  }
  return clone(value);
}

function optionalArray(value, fieldName, details = undefined) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    fail(
      "invalid_workspace_structure_part",
      `${fieldName} deve ser um array.`,
      details
    );
  }
  return clone(value);
}

function assertAllowedPartFields(part, allowedFields, partIndex) {
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(part).filter((fieldName) => !allowed.has(fieldName));
  if (unknownFields.length) {
    fail(
      "invalid_workspace_structure_part",
      "A parte estrutural contém campos fora do contrato incremental.",
      { partIndex, unknownFields }
    );
  }
}

function buildGuide(part, partIndex) {
  return {
    goal: requiredText(part.goal, "goal", { partIndex }),
    include: optionalStringList(part.include, "include", { partIndex }),
    exclude: optionalStringList(part.exclude, "exclude", { partIndex }),
    notation: optionalStringList(part.notation, "notation", { partIndex }),
    avoid: optionalStringList(part.avoid, "avoid", { partIndex })
  };
}

function buildStructureEntity(part, partIndex) {
  if (!isPlainObject(part)) {
    fail(
      "invalid_workspace_structure_part",
      "Cada item de parts deve ser um objeto.",
      { partIndex }
    );
  }

  const entityType = text(part.entityType);
  if (!STRUCTURE_TYPES.has(entityType)) {
    fail(
      "invalid_workspace_entity_type",
      "parts aceita somente course, module, lesson ou microsequence.",
      { partIndex, entityType: part.entityType }
    );
  }

  const common = {
    id: requiredText(part.id, "id", { partIndex, entityType }),
    title: requiredText(part.title, "title", { partIndex, entityType })
  };

  if (entityType === "course") {
    assertAllowedPartFields(part, COMMON_PART_FIELDS, partIndex);
    return {
      entityType,
      entity: {
        ...common,
        goal: requiredText(part.goal, "goal", { partIndex, entityType }),
        modules: []
      }
    };
  }

  if (entityType === "module") {
    assertAllowedPartFields(
      part,
      [...COMMON_PART_FIELDS, ...GUIDE_PART_FIELDS],
      partIndex
    );
    return {
      entityType,
      entity: {
        ...common,
        guide: buildGuide(part, partIndex),
        lessons: []
      }
    };
  }

  if (entityType === "lesson") {
    assertAllowedPartFields(
      part,
      [...COMMON_PART_FIELDS, ...GUIDE_PART_FIELDS, "topics"],
      partIndex
    );
    return {
      entityType,
      entity: {
        ...common,
        guide: buildGuide(part, partIndex),
        topics: optionalArray(part.topics, "topics", { partIndex, entityType }),
        microsequences: []
      }
    };
  }

  assertAllowedPartFields(
    part,
    [...COMMON_PART_FIELDS, ...MICROSEQUENCE_PART_FIELDS],
    partIndex
  );
  const role = part.role == null ? "explain" : text(part.role);
  const status = part.status == null ? "planned" : text(part.status);
  if (!MICROSEQUENCE_ROLES.has(role)) {
    fail(
      "invalid_workspace_structure_part",
      `role de microssequência inválido: "${part.role}".`,
      { partIndex, entityType }
    );
  }
  if (!MICROSEQUENCE_STATUSES.has(status)) {
    fail(
      "invalid_workspace_structure_part",
      `status de microssequência inválido: "${part.status}".`,
      { partIndex, entityType }
    );
  }

  return {
    entityType,
    entity: {
      ...common,
      goal: requiredText(part.goal, "goal", { partIndex, entityType }),
      role,
      status,
      branchOf: part.branchOf == null ? null : clone(part.branchOf),
      dependsOn: optionalStringList(part.dependsOn, "dependsOn", { partIndex }),
      covers: optionalStringList(part.covers, "covers", { partIndex }),
      checks: optionalStringList(part.checks, "checks", { partIndex }),
      errors: optionalStringList(part.errors, "errors", { partIndex }),
      cards: []
    }
  };
}

function normalizeCardPositions(microsequence) {
  microsequence.cards.forEach((card, index) => {
    card.position = index + 1;
  });
}

function collectIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectIds(item, ids));
    return ids;
  }
  if (!isPlainObject(value)) return ids;
  if (text(value.id)) ids.add(text(value.id));
  Object.values(value).forEach((item) => collectIds(item, ids));
  return ids;
}

function createDescendantIdFactory(newRootId, usedIds) {
  return (entityType, path) => {
    const base = `${newRootId}--${entityType}-${path.join("-")}`;
    let candidate = base;
    let collision = 1;
    while (usedIds.has(candidate)) {
      collision += 1;
      candidate = `${base}-${collision}`;
    }
    usedIds.add(candidate);
    return candidate;
  };
}

function remapCard(card, path, nextId, topicIds = new Map()) {
  card.id = nextId("card", path);
  if (Array.isArray(card.topics) && topicIds.size) {
    card.topics = card.topics.map((topicId) => topicIds.get(topicId) || topicId);
  }
}

function remapMicrosequenceContents(
  microsequence,
  path,
  nextId,
  microsequenceIds,
  topicIds,
  allowedExternalDependencies
) {
  microsequence.cards.forEach((card, cardIndex) => {
    remapCard(card, [...path, cardIndex + 1], nextId, topicIds);
  });
  normalizeCardPositions(microsequence);

  const remapDependency = (dependency) => {
    if (microsequenceIds.has(dependency)) return microsequenceIds.get(dependency);
    if (allowedExternalDependencies.has(dependency)) return dependency;
    return null;
  };
  microsequence.dependsOn = [...new Set(
    microsequence.dependsOn
      .map(remapDependency)
      .filter((dependency) => dependency && dependency !== microsequence.id)
  )];

  const nextBranch = microsequence.branchOf == null
    ? null
    : remapDependency(microsequence.branchOf);
  microsequence.branchOf = nextBranch && nextBranch !== microsequence.id
    ? nextBranch
    : null;
}

function remapLessonContents(lesson, path, nextId) {
  const topicIds = new Map();
  lesson.topics.forEach((topic, topicIndex) => {
    const previousId = topic.id;
    const remappedId = nextId("topic", [...path, topicIndex + 1]);
    topic.id = remappedId;
    topicIds.set(previousId, remappedId);
  });

  const microsequenceIds = new Map();
  lesson.microsequences.forEach((microsequence, microsequenceIndex) => {
    const previousId = microsequence.id;
    const remappedId = nextId("microsequence", [...path, microsequenceIndex + 1]);
    microsequence.id = remappedId;
    microsequenceIds.set(previousId, remappedId);
  });
  lesson.microsequences.forEach((microsequence, microsequenceIndex) => {
    remapMicrosequenceContents(
      microsequence,
      [...path, microsequenceIndex + 1],
      nextId,
      microsequenceIds,
      topicIds,
      new Set()
    );
  });
}

function remapModuleContents(moduleValue, path, nextId) {
  moduleValue.lessons.forEach((lesson, lessonIndex) => {
    lesson.id = nextId("lesson", [...path, lessonIndex + 1]);
    remapLessonContents(lesson, [...path, lessonIndex + 1], nextId);
  });
}

function remapCourseContents(course, path, nextId) {
  course.modules.forEach((moduleValue, moduleIndex) => {
    moduleValue.id = nextId("module", [...path, moduleIndex + 1]);
    remapModuleContents(moduleValue, [...path, moduleIndex + 1], nextId);
  });
}

function remapCopiedEntity(entityType, entity, newRootId, usedIds, targetParent) {
  const previousRootId = entity.id;
  entity.id = newRootId;
  usedIds.add(newRootId);
  const nextId = createDescendantIdFactory(newRootId, usedIds);

  if (entityType === "course") {
    remapCourseContents(entity, [], nextId);
  } else if (entityType === "module") {
    remapModuleContents(entity, [], nextId);
  } else if (entityType === "lesson") {
    remapLessonContents(entity, [], nextId);
  } else if (entityType === "microsequence") {
    const allowedExternalDependencies = new Set(
      targetParent.microsequences.map((microsequence) => microsequence.id)
    );
    remapMicrosequenceContents(
      entity,
      [],
      nextId,
      new Map([[previousRootId, newRootId]]),
      new Map(),
      allowedExternalDependencies
    );
  }

  return entity;
}

export function cloneWorkspaceEntityWithFreshIds(document, {
  entityType,
  entity,
  newRootId,
  targetParent = null
} = {}) {
  if (!ENTITY_TYPES.includes(entityType)) {
    fail(
      "invalid_workspace_entity_type",
      "entityType deve ser course, module, lesson, microsequence ou card."
    );
  }

  const normalizedRootId = text(newRootId);
  if (!normalizedRootId) {
    fail("invalid_workspace_copy", "newRootId deve ser texto não vazio.");
  }

  const usedIds = collectIds(document);
  if (usedIds.has(normalizedRootId)) {
    fail(
      "workspace_entity_conflict",
      "newRootId precisa ser inédito no workspace.",
      { entityType, newRootId: normalizedRootId }
    );
  }
  if (entityType === "microsequence"
      && !Array.isArray(targetParent?.microsequences)) {
    fail(
      "invalid_workspace_parent",
      "A cópia de microssequência exige uma lição de destino."
    );
  }

  return remapCopiedEntity(
    entityType,
    clone(entity),
    normalizedRootId,
    usedIds,
    targetParent
  );
}

export function createWorkspaceStructure(document, { parts } = {}) {
  if (!Array.isArray(parts)
      || parts.length === 0
      || parts.length > STRUCTURE_PART_LIMIT) {
    fail(
      "invalid_workspace_structure_parts",
      `parts deve conter de 1 a ${STRUCTURE_PART_LIMIT} partes estruturais.`
    );
  }

  const next = clone(document);
  const orderedParts = parts
    .map((part, partIndex) => ({ part, partIndex }))
    .sort((left, right) => {
      const leftDepth = ENTITY_TYPES.indexOf(left.part?.entityType);
      const rightDepth = ENTITY_TYPES.indexOf(right.part?.entityType);
      return leftDepth - rightDepth || left.partIndex - right.partIndex;
    });
  orderedParts.forEach(({ part, partIndex }) => {
    const { entityType, entity } = buildStructureEntity(part, partIndex);
    const target = destination(next, entityType, part.parentPath ?? null);
    if (target.collection.some((candidate) => text(candidate?.id) === entity.id)) {
      fail(
        "workspace_entity_conflict",
        `Já existe ${TYPE_LABEL[entityType]} com esse id no destino.`,
        { partIndex, entityType, id: entity.id }
      );
    }
    insertAt(target.collection, entity, part.position ?? null);
  });

  return finalizeWorkspace(next);
}

export function saveWorkspaceMicrosequenceCards(document, {
  microsequencePath,
  mode,
  cards,
  status
} = {}) {
  if (mode !== "append" && mode !== "replace") {
    fail("invalid_workspace_mode", "mode deve ser append ou replace.");
  }
  if (!Array.isArray(cards)) {
    fail("invalid_workspace_cards", "cards deve ser um array.");
  }
  if (mode === "append" && cards.length === 0) {
    fail("invalid_workspace_cards", "append exige ao menos um card.");
  }
  if (!MICROSEQUENCE_STATUSES.has(status)) {
    fail(
      "invalid_workspace_status",
      "status deve ser planned, generated, needs_review ou ready."
    );
  }

  const compiledCards = cards.map((card, cardIndex) =>
    compileWorkspaceCard(card, `cards[${cardIndex}]`)
  );
  const next = clone(document);
  const located = locate(next, "microsequence", microsequencePath);
  located.entity.cards = mode === "append"
    ? [...located.entity.cards, ...compiledCards]
    : compiledCards;
  located.entity.status = status;
  normalizeCardPositions(located.entity);
  return finalizeWorkspace(next);
}

export function updateWorkspaceEntityMetadata(document, {
  entityType,
  entityPath,
  ...changes
}) {
  if (!new Set(["course", "module", "lesson", "microsequence"]).has(entityType)) {
    fail(
      "invalid_workspace_metadata_type",
      "Metadados podem ser atualizados em curso, módulo, lição ou microssequência."
    );
  }
  const next = clone(document);
  const located = locate(next, entityType, entityPath);
  const entity = located.entity;
  const semanticBefore = JSON.stringify(semanticMetadata(entityType, entity));
  const allowed = entityType === "course"
    ? new Set(["title", "goal"])
    : entityType === "module"
      ? new Set(["title", "goal", "include", "exclude", "notation", "avoid"])
      : entityType === "lesson"
        ? new Set([
          "title", "goal", "include", "exclude", "notation", "avoid", "topics"
        ])
      : new Set([
        "title", "goal", "role", "status", "branchOf",
        "dependsOn", "covers", "checks", "errors"
      ]);
  const fields = Object.keys(changes);
  const preserveExplicitReady = entityType === "microsequence"
    && changes.status === "ready";
  const unknown = fields.find((field) => !allowed.has(field));
  if (unknown) {
    fail(
      "invalid_workspace_metadata_field",
      `O campo ${unknown} não pertence aos metadados de ${TYPE_LABEL[entityType]}.`,
      { entityType, field: unknown }
    );
  }
  if (fields.length === 0) {
    fail(
      "workspace_change_empty",
      "Informe ao menos um metadado para atualizar."
    );
  }
  for (const field of fields) {
    const value = changes[field];
    if (field === "title" || field === "goal") {
      const normalized = requiredText(value, field, { entityType });
      if (field === "goal" && new Set(["module", "lesson"]).has(entityType)) {
        entity.guide.goal = normalized;
      } else {
        entity[field] = normalized;
      }
      continue;
    }
    if (field === "role") {
      if (!MICROSEQUENCE_ROLES.has(value)) {
        fail("invalid_workspace_metadata_field", "role de microssequência inválido.");
      }
      entity.role = value;
      continue;
    }
    if (field === "status") {
      if (!MICROSEQUENCE_STATUSES.has(value)) {
        fail("invalid_workspace_metadata_field", "status de microssequência inválido.");
      }
      entity.status = value;
      continue;
    }
    if (field === "branchOf") {
      entity.branchOf = value == null ? null : requiredText(value, field);
      continue;
    }
    if (field === "topics") {
      entity.topics = optionalArray(value, field, { entityType });
      continue;
    }
    const list = optionalStringList(value, field, { entityType });
    if (new Set(["module", "lesson"]).has(entityType)) {
      entity.guide[field] = list;
    } else {
      entity[field] = list;
    }
  }
  const semanticAfter = JSON.stringify(semanticMetadata(entityType, entity));
  if (semanticBefore !== semanticAfter && !preserveExplicitReady) {
    invalidateReadyDescendants(entityType, entity);
  }
  return finalizeWorkspace(next);
}

export function saveWorkspaceCard(document, { cardPath, card }) {
  const normalizedPath = normalizedEntityPath("card", cardPath);
  if (!isPlainObject(card)) {
    fail("invalid_workspace_card", "card deve ser um objeto completo.");
  }
  const next = clone(document);
  const microsequence = locate(
    next,
    "microsequence",
    normalizedPath.slice(0, 4)
  ).entity;
  const cardId = normalizedPath[4];
  const index = microsequence.cards.findIndex((item) => text(item?.id) === cardId);
  if (index < 0) {
    fail(
      "workspace_entity_not_found",
      "Card não encontrado no caminho informado.",
      { entityType: "card", entityPath: normalizedPath },
      404
    );
  }
  if (text(card.id) !== cardId) {
    fail(
      "workspace_identity_change_forbidden",
      "A correção do card deve preservar seu id."
    );
  }
  const replacement = compileWorkspaceCard(card, "card");
  const currentPosition = microsequence.cards[index].position;
  if (Object.hasOwn(card, "position") && card.position !== currentPosition) {
    fail(
      "workspace_position_change_forbidden",
      "A correção do card deve preservar sua posição.",
      {
        path: "card.position",
        expectedPosition: currentPosition,
        receivedPosition: card.position
      }
    );
  }
  replacement.position = currentPosition;
  const changed = canonicalJsonStringify(microsequence.cards[index])
    !== canonicalJsonStringify(replacement);
  microsequence.cards[index] = replacement;
  normalizeCardPositions(microsequence);
  if (changed) microsequence.status = "ready";
  return finalizeWorkspace(next);
}

export function copyWorkspaceEntity(document, {
  entityType,
  entityPath,
  targetParentPath = null,
  newRootId,
  position = null
} = {}) {
  if (!ENTITY_TYPES.includes(entityType)) {
    fail(
      "invalid_workspace_entity_type",
      "entityType deve ser course, module, lesson, microsequence ou card."
    );
  }

  const normalizedRootId = text(newRootId);
  if (!normalizedRootId) {
    fail("invalid_workspace_copy", "newRootId deve ser texto não vazio.");
  }

  const next = clone(document);
  const source = locate(next, entityType, entityPath);
  const target = destination(next, entityType, targetParentPath);
  const copied = cloneWorkspaceEntityWithFreshIds(
    next,
    {
      entityType,
      entity: source.entity,
      newRootId: normalizedRootId,
      targetParent: target.parent
    }
  );
  insertAt(target.collection, copied, position);

  if (entityType === "card") {
    normalizeCardPositions(target.parent);
    invalidateReadyMicrosequence(target.parent);
  } else {
    invalidateReadyDescendants(entityType, copied);
  }

  return finalizeWorkspace(next);
}
