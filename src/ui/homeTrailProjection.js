import { validateProjectDocument } from "../domain/aralearnProject.js";

const TRAIL_LABEL_COLLATOR = new Intl.Collator("pt-BR", {
  usage: "sort",
  sensitivity: "base",
  numeric: true
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function workspacePartPosition(value, entityType, entityId) {
  const minimum = entityType === "card" ? 1 : 0;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      `A composição corrente contém posição inválida em ${entityType}:${entityId}.`
    );
  }
  return value;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function itemIdentity(value = {}) {
  return text(value.trailItemId);
}

export function compareTrailLabels(leftLabel, rightLabel, leftId = "", rightId = "") {
  const byLabel = TRAIL_LABEL_COLLATOR.compare(text(leftLabel), text(rightLabel));
  if (byLabel) return byLabel;
  const byVariant = String(leftLabel || "").localeCompare(String(rightLabel || ""), "pt-BR");
  if (byVariant) return byVariant;
  return String(leftId || "").localeCompare(String(rightId || ""));
}

function normalizeTrailItem(value = {}) {
  const itemId = itemIdentity(value);
  if (!itemId) throw new Error("Trilhas devolveu um item sem trailItemId.");
  const kind = value.kind === "plan" ? "plan" : "course";
  const workspaceId = text(value.workspaceId).toLowerCase() || null;
  const courseKey = text(value.courseKey) || null;
  const courseId = text(value.courseId).toLowerCase() || null;
  return Object.freeze({
    itemId,
    trailItemId: itemId,
    workspaceId,
    courseKey,
    courseId,
    selectionId: text(value.selectionId).toLowerCase() || null,
    contentHash: text(value.contentHash).toLowerCase() || null,
    kind,
    source: value.source === "workspace" ? "workspace" : "selection",
    origin: ["catalog", "private", "workspace"].includes(value.origin)
      ? value.origin
      : workspaceId
        ? "workspace"
        : "private",
    title: text(value.title) || (kind === "plan" ? "Plano" : "Curso"),
    description: text(value.description),
    moduleCount: integer(value.moduleCount),
    lessonCount: integer(value.lessonCount),
    microsequenceCount: integer(value.microsequenceCount),
    cardCount: integer(value.cardCount),
    completedCardCount: Math.min(integer(value.completedCardCount), integer(value.cardCount)),
    canEdit: value.canEdit === true,
    canDelete: value.canDelete === true,
    canRemove: value.canRemove === true,
    pathId: text(value.pathId) || null,
    pathTitle: text(value.pathTitle),
    revision: value.revision === null || value.revision === undefined
      ? null
      : Number.isSafeInteger(Number(value.revision)) && Number(value.revision) >= 1
        ? Number(value.revision)
        : null,
    updatedAt: text(value.updatedAt)
  });
}

function normalizeGroup(value = {}, items = []) {
  const id = text(value.id);
  if (!id) throw new Error("Trilhas devolveu um grupo sem identidade.");
  const members = items
    .filter((item) => item.pathId === id)
    .map((item) => ({
      itemId: item.itemId,
      membershipId: item.itemId,
      title: item.title
    }))
    .sort((left, right) => compareTrailLabels(
      left.title,
      right.title,
      left.itemId,
      right.itemId
    ));
  return Object.freeze({
    id,
    title: text(value.title) || "Grupo",
    revision: integer(value.revision),
    members: Object.freeze(members.map((member) => Object.freeze({
      itemId: member.itemId,
      membershipId: member.membershipId
    })))
  });
}

export function normalizeHomeTrailSnapshot(value) {
  const source = value;
  if (source?.space !== "trails" || !Array.isArray(source.items) || !Array.isArray(source.groups)) {
    throw new Error("Trilhas devolveu uma projeção incompleta.");
  }
  const seenItems = new Set();
  const items = array(source?.items).flatMap((item) => {
    const normalized = normalizeTrailItem(item);
    if (!normalized || seenItems.has(normalized.itemId)) return [];
    seenItems.add(normalized.itemId);
    return [normalized];
  }).sort((left, right) => compareTrailLabels(
    left.title,
    right.title,
    left.itemId,
    right.itemId
  ));
  const explicitGroups = source.groups.map((group) =>
    normalizeGroup(group, items)
  );
  const groups = explicitGroups;
  const existingItems = new Set(items.map((item) => item.itemId));
  const assigned = new Set();
  const normalizedGroups = groups
    .sort((left, right) => compareTrailLabels(left.title, right.title, left.id, right.id))
    .map((group) => Object.freeze({
      ...group,
      members: Object.freeze(group.members.filter((member) => {
        if (!existingItems.has(member.itemId) || assigned.has(member.itemId)) return false;
        assigned.add(member.itemId);
        return true;
      }))
    }));
  return Object.freeze({
    space: "trails",
    items: Object.freeze(items),
    groups: Object.freeze(normalizedGroups),
    capabilities: Object.freeze({
      catalogManage: source?.capabilities?.catalogManage === true,
      catalogReview: source?.capabilities?.catalogReview === true,
      organize: source?.capabilities?.organize !== false
    }),
    stale: value?.stale === true,
    cachedAt: text(value?.cachedAt)
  });
}

export function isStudyableTrailItem(item) {
  return item?.kind === "course" && integer(item.cardCount) > 0;
}

export function trailItemCourseKey(item) {
  return text(item?.courseKey || item?.courseId);
}

export function groupTrailItems(snapshot, { includePlans = false } = {}) {
  const items = array(snapshot?.items).filter((item) => includePlans || isStudyableTrailItem(item));
  const byId = new Map(items.map((item) => [item.itemId, item]));
  const assigned = new Set();
  const groups = array(snapshot?.groups).map((group) => {
    const groupedItems = array(group.members).flatMap((member) => {
      const item = byId.get(member.itemId);
      if (!item || assigned.has(item.itemId)) return [];
      assigned.add(item.itemId);
      return [{ ...item, membershipId: member.membershipId }];
    });
    return { ...group, items: groupedItems };
  });
  const looseItems = items
    .filter((item) => !assigned.has(item.itemId))
    .sort((left, right) => compareTrailLabels(left.title, right.title, left.itemId, right.itemId));
  const explicitOthers = groups.find((group) =>
    TRAIL_LABEL_COLLATOR.compare(group.title, "Outros") === 0
  );
  if (explicitOthers) {
    explicitOthers.items = [...explicitOthers.items, ...looseItems]
      .sort((left, right) => compareTrailLabels(left.title, right.title, left.itemId, right.itemId));
  } else {
    groups.push({ id: "others", title: "Outros", revision: 0, items: looseItems });
  }
  return groups.sort((left, right) => compareTrailLabels(
    left.title,
    right.title,
    left.id,
    right.id
  ));
}

export function trailItemDeleteMode(item) {
  if (item?.canDelete !== true) return null;
  if (item.origin === "catalog" && text(item.courseId)) return "catalog";
  if (item.origin === "private" && text(item.courseId)) {
    return text(item.selectionId) ? "private-published" : null;
  }
  if (text(item.workspaceId)) return "workspace";
  return null;
}

export function shouldOfferTrailRemoval(item) {
  if (item?.canRemove !== true) return false;
  return !(item.origin === "private" && item.canDelete === true);
}

export function preserveSelectedTrailItem(snapshot, requestedItemId = "") {
  const items = array(snapshot?.items).filter((item) =>
    isStudyableTrailItem(item) || (item?.kind === "plan" && Boolean(item?.workspaceId))
  );
  const requested = text(requestedItemId);
  return items.find((item) => item.itemId === requested)?.itemId ||
    items.find(isStudyableTrailItem)?.itemId || items[0]?.itemId || "";
}

export function courseFromWorkspaceParts(result, item) {
  const parts = array(result?.parts);
  const childCollections = {
    course: { module: "modules" },
    module: { lesson: "lessons" },
    lesson: { topic: "topics", microsequence: "microsequences" },
    microsequence: { card: "cards" }
  };
  const ownCollections = {
    course: ["modules"],
    module: ["lessons"],
    lesson: ["topics", "microsequences"],
    microsequence: ["cards"]
  };
  const entities = [];
  const entitiesByType = new Map();
  const entityFor = (type, id) => entitiesByType.get(type)?.get(id) || null;
  for (const part of parts) {
    const type = text(part?.entityType);
    const id = text(part?.id);
    if (!ownCollections[type] && !["topic", "card"].includes(type)) continue;
    if (!id) throw new Error("A composição corrente contém uma parte sem identidade.");
    const content = part?.content && typeof part.content === "object" && !Array.isArray(part.content)
      ? structuredClone(part.content)
      : {};
    if (Object.hasOwn(content, "position")) {
      throw new Error(
        `A composição corrente repete a posição dentro do conteúdo de ${type}:${id}.`
      );
    }
    const position = workspacePartPosition(part?.position, type, id);
    const entity = { ...content, id };
    if (type === "card") entity.position = position;
    for (const collectionName of ownCollections[type] || []) entity[collectionName] = [];
    let typedEntities = entitiesByType.get(type);
    if (!typedEntities) {
      typedEntities = new Map();
      entitiesByType.set(type, typedEntities);
    }
    if (typedEntities.has(id)) {
      throw new Error("A composição corrente repete a identidade de uma parte.");
    }
    const record = {
      type,
      id,
      parentType: text(part?.parentType),
      parentId: text(part?.parentId),
      position,
      entity
    };
    typedEntities.set(id, record);
    entities.push(record);
  }
  for (const record of entities) {
    if (record.type === "course") continue;
    const parent = entityFor(record.parentType, record.parentId);
    const collectionName = childCollections[record.parentType]?.[record.type];
    if (!parent || !collectionName || !Array.isArray(parent.entity[collectionName])) {
      throw new Error("A composição corrente contém uma parte sem ascendente.");
    }
    parent.entity[collectionName].push(record);
  }
  for (const record of entities) {
    for (const collectionName of ownCollections[record.type] || []) {
      record.entity[collectionName] = record.entity[collectionName]
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
        .map((child) => child.entity);
    }
  }
  const courseKey = trailItemCourseKey(item);
  const course = entityFor("course", courseKey)?.entity || null;
  if (!course) throw new Error("A composição corrente do curso não foi encontrada.");
  const validation = validateProjectDocument({
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [course]
  });
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new Error(`A composição corrente viola o contrato v4 em ${first.path}: ${first.message}`);
  }
  return structuredClone(validation.value.courses[0]);
}

export function mergeWorkspaceCourse(project, course, replacedIdentities = []) {
  const source = project && typeof project === "object" ? project : { version: 4, courses: [] };
  const replaced = new Set([course?.id, ...array(replacedIdentities)].map(text).filter(Boolean));
  return {
    ...source,
    courses: [
      ...array(source.courses).filter((candidate) => !replaced.has(text(candidate?.id))),
      structuredClone(course)
    ]
  };
}
