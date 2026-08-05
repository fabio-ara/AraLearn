import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { listCardResourceTargets } from "./cardAssistanceScope.js";

export const BOTTOM_UP_ASSISTANCE_LEVELS = Object.freeze([
  "card",
  "microsequence",
  "lesson"
]);

export const BOTTOM_UP_ASSISTANCE_TARGET_KINDS = Object.freeze([
  "items",
  "container"
]);

export const BOTTOM_UP_ASSISTANCE_OPERATIONS = Object.freeze({
  REPLACE_RESOURCES: "replace_resources",
  REPLACE_CARD: "replace_card",
  UPDATE_CARDS: "update_cards",
  REMOVE_CARDS: "remove_cards",
  MOVE_CARDS: "move_cards",
  CREATE_CARDS: "create_cards",
  UPDATE_MICROSEQUENCES: "update_microsequences",
  REMOVE_MICROSEQUENCES: "remove_microsequences",
  MOVE_MICROSEQUENCES: "move_microsequences",
  CREATE_MICROSEQUENCE: "create_microsequence"
});

const SCOPE_CONTRACT = "aralearn.bottom-up-assistance-scope.v1";
const COMMAND_CONTRACT = "aralearn.bottom-up-assistance-command.v1";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function fail(message, code = "INVALID_BOTTOM_UP_ASSISTANCE_SCOPE") {
  throw new BottomUpAssistanceScopeError(message, code);
}

function identifier(value, label) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    fail(
      `${label} deve ser uma identidade textual exata.`,
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  return value;
}

function optionalIdentifier(value, label) {
  if (value === undefined || value === null || value === "") return "";
  return identifier(value, label);
}

function uniqueEntity(items, entityId, label) {
  const matches = (Array.isArray(items) ? items : []).filter(
    (item) => item?.id === entityId
  );
  if (matches.length !== 1) {
    fail(
      `${label} não pertence uma única vez ao contexto selecionado.`,
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  return matches[0];
}

function normalizedSelection(selection = {}, level = "") {
  const value = {
    courseKey: identifier(selection.courseKey, "courseKey"),
    moduleKey: identifier(selection.moduleKey, "moduleKey"),
    lessonKey: identifier(selection.lessonKey, "lessonKey"),
    microsequenceKey: optionalIdentifier(selection.microsequenceKey, "microsequenceKey"),
    cardKey: optionalIdentifier(selection.cardKey, "cardKey")
  };
  if (["card", "microsequence"].includes(level) && !value.microsequenceKey) {
    fail(
      "O nível selecionado exige uma microssequência exata.",
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  if (level === "card" && !value.cardKey) {
    fail(
      "O nível card exige um card exato.",
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  return value;
}

function resolveHierarchy(projectDocument = {}, selection = {}, level = "") {
  const normalized = normalizedSelection(selection, level);
  const course = uniqueEntity(projectDocument.courses, normalized.courseKey, "O curso");
  const moduleValue = uniqueEntity(course.modules, normalized.moduleKey, "O módulo");
  const lesson = uniqueEntity(moduleValue.lessons, normalized.lessonKey, "A lição");
  const microsequence = normalized.microsequenceKey
    ? uniqueEntity(
        lesson.microsequences,
        normalized.microsequenceKey,
        "A microssequência"
      )
    : null;
  const card = normalized.cardKey
    ? uniqueEntity(microsequence?.cards, normalized.cardKey, "O card")
    : null;
  return {
    projectDocument,
    selection: normalized,
    course,
    moduleValue,
    lesson,
    microsequence,
    card
  };
}

function withoutChildren(entity, childField) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return null;
  return Object.fromEntries(
    Object.entries(entity)
      .filter(([fieldName]) => fieldName !== childField)
      .map(([fieldName, value]) => [fieldName, clone(value)])
  );
}

function itemSummary(item, index, type) {
  const summary = {
    index,
    id: item.id,
    position: Number(item.position ?? index)
  };
  ["title", "goal", "role", "kind", "resource", "exercise"].forEach((fieldName) => {
    if (item[fieldName] !== undefined) summary[fieldName] = clone(item[fieldName]);
  });
  if (type === "microsequence") {
    summary.dependsOn = clone(item.dependsOn || []);
    summary.covers = clone(item.covers || []);
    summary.checks = clone(item.checks || []);
    summary.errors = clone(item.errors || []);
    summary.cardCount = Array.isArray(item.cards) ? item.cards.length : 0;
  }
  return summary;
}

function resourceSummary(target, index) {
  return {
    index,
    id: target.targetId,
    location: target.location,
    resourceType: target.resourceType,
    label: target.label
  };
}

function normalizeTargetIds(targetIds = []) {
  if (!Array.isArray(targetIds)) {
    fail(
      "Os alvos devem ser uma lista de identidades exatas.",
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  const values = targetIds.map((value) => identifier(value, "targetId"));
  if (new Set(values).size !== values.length) {
    fail(
      "A seleção contém uma identidade repetida.",
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  return values;
}

function sameIdSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function contextItems(context, level) {
  if (level === "card") {
    return listCardResourceTargets(context.card).map(resourceSummary);
  }
  if (level === "microsequence") {
    return (context.microsequence.cards || []).map((card, index) =>
      itemSummary(card, index, "card")
    );
  }
  return (context.lesson.microsequences || []).map((microsequence, index) =>
    itemSummary(microsequence, index, "microsequence")
  );
}

function containerId(context, level) {
  if (level === "card") return context.card.id;
  if (level === "microsequence") return context.microsequence.id;
  return context.lesson.id;
}

function normalizeAuthoritySelection(context, level, kind, targetIds) {
  if (!BOTTOM_UP_ASSISTANCE_TARGET_KINDS.includes(kind)) {
    fail(
      "A seleção deve apontar itens ou o contêiner.",
      "INVALID_BOTTOM_UP_ASSISTANCE_SCOPE"
    );
  }
  const requestedIds = normalizeTargetIds(targetIds);
  const items = contextItems(context, level);
  const availableIds = items.map((item) => item.id);
  const selectedContainerId = containerId(context, level);

  if (kind === "container") {
    if (
      requestedIds.length > 0 &&
      !(requestedIds.length === 1 && requestedIds[0] === selectedContainerId)
    ) {
      fail(
        "A seleção do contêiner não aceita identidades de outro alvo.",
        "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
      );
    }
    return {
      requestedKind: kind,
      effectiveKind: kind,
      selectionSource: "explicit",
      selectedIds: level === "card" ? [selectedContainerId] : availableIds,
      availableIds,
      emptyContainerSelected: level !== "card" && availableIds.length === 0
    };
  }

  if (!requestedIds.length) {
    fail(
      "Selecione ao menos um item ou escolha explicitamente o contêiner vazio.",
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  const availableSet = new Set(availableIds);
  if (requestedIds.some((targetId) => !availableSet.has(targetId))) {
    fail(
      "A seleção contém uma identidade que não pertence ao contêiner.",
      "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
    );
  }
  const selectedIds = availableIds.filter((targetId) => requestedIds.includes(targetId));
  const promotesContainer = level !== "card" && sameIdSet(selectedIds, availableIds);
  return {
    requestedKind: kind,
    effectiveKind: promotesContainer ? "container" : "items",
    selectionSource: promotesContainer ? "promoted" : "explicit",
    selectedIds,
    availableIds,
    emptyContainerSelected: false
  };
}

function allowedOperations(level, authority) {
  const operations = [];
  if (level === "card") {
    return authority.effectiveKind === "container"
      ? [BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_CARD]
      : [BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_RESOURCES];
  }
  if (level === "microsequence") {
    if (authority.selectedIds.length) {
      operations.push(
        BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_CARDS,
        BOTTOM_UP_ASSISTANCE_OPERATIONS.REMOVE_CARDS,
        BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_CARDS
      );
    }
    if (authority.effectiveKind === "container") {
      operations.push(BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS);
    }
    return operations;
  }
  if (authority.selectedIds.length) {
    operations.push(
      BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_MICROSEQUENCES,
      BOTTOM_UP_ASSISTANCE_OPERATIONS.REMOVE_MICROSEQUENCES,
      BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_MICROSEQUENCES
    );
  }
  if (authority.selectedIds.length === 1) {
    operations.push(BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS);
  }
  if (authority.effectiveKind === "container") {
    operations.push(BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE);
  }
  return operations;
}

function neighboringItems(items, selectedIds) {
  const selected = new Set(selectedIds);
  return items.flatMap((item, index) => {
    if (!selected.has(item.id)) return [];
    return [{
      targetId: item.id,
      before: index > 0 ? clone(items[index - 1]) : null,
      after: index + 1 < items.length ? clone(items[index + 1]) : null
    }];
  });
}

function hierarchyContext(context, level) {
  return {
    course: withoutChildren(context.course, "modules"),
    module: withoutChildren(context.moduleValue, "lessons"),
    lesson: withoutChildren(context.lesson, "microsequences"),
    ...(level === "lesson"
      ? {}
      : { microsequence: withoutChildren(context.microsequence, "cards") })
  };
}

function adjacentContainers(context, level) {
  if (level !== "microsequence") return { before: null, after: null };
  const microsequences = context.lesson.microsequences || [];
  const index = microsequences.indexOf(context.microsequence);
  return {
    before: index > 0 ? itemSummary(microsequences[index - 1], index - 1, "microsequence") : null,
    after: index >= 0 && index + 1 < microsequences.length
      ? itemSummary(microsequences[index + 1], index + 1, "microsequence")
      : null
  };
}

function readOnlyContext(context, level, authority) {
  const items = contextItems(context, level);
  const selectedIds = new Set(authority.selectedIds);
  const siblingCards = level === "card"
    ? (context.microsequence.cards || []).map((card, index) =>
        itemSummary(card, index, "card")
      )
    : [];
  const currentCardIndex = level === "card"
    ? (context.microsequence.cards || []).indexOf(context.card)
    : -1;
  return {
    hierarchy: hierarchyContext(context, level),
    container: level === "card"
      ? itemSummary(context.card, currentCardIndex, "card")
      : level === "microsequence"
        ? withoutChildren(context.microsequence, "cards")
        : withoutChildren(context.lesson, "microsequences"),
    itemOrder: clone(items),
    unselectedItems: items.filter((item) => !selectedIds.has(item.id)).map(clone),
    neighbors: level === "card"
      ? [{
          targetId: context.card.id,
          before: currentCardIndex > 0 ? clone(siblingCards[currentCardIndex - 1]) : null,
          after: currentCardIndex + 1 < siblingCards.length
            ? clone(siblingCards[currentCardIndex + 1])
            : null
        }]
      : neighboringItems(items, authority.selectedIds),
    siblingOrder: siblingCards,
    adjacentContainers: adjacentContainers(context, level)
  };
}

function protectedFingerprintContent(context, level) {
  const hierarchy = hierarchyContext(context, level);
  if (level === "card") {
    return { hierarchy, microsequence: clone(context.microsequence) };
  }
  if (level === "microsequence") {
    return {
      hierarchy,
      microsequence: clone(context.microsequence),
      lessonOrder: (context.lesson.microsequences || []).map((item, index) =>
        itemSummary(item, index, "microsequence")
      )
    };
  }
  return { hierarchy, lesson: clone(context.lesson) };
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) {
    fail(
      "Web Crypto não está disponível para proteger o escopo.",
      "CRYPTO_UNAVAILABLE"
    );
  }
  const bytes = new TextEncoder().encode(canonicalStringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildBottomUpAssistanceScope({
  projectDocument = {},
  selection = {},
  level = "",
  kind = "items",
  targetIds = []
} = {}) {
  if (!BOTTOM_UP_ASSISTANCE_LEVELS.includes(level)) {
    fail(
      "A assistência bottom-up existe somente nos níveis card, microssequência e lição.",
      "INVALID_BOTTOM_UP_ASSISTANCE_LEVEL"
    );
  }
  const context = resolveHierarchy(projectDocument, selection, level);
  const authority = normalizeAuthoritySelection(context, level, kind, targetIds);
  const writeScope = {
    level,
    kind: authority.effectiveKind,
    requestedKind: authority.requestedKind,
    selectionSource: authority.selectionSource,
    containerType: level,
    containerId: containerId(context, level),
    itemType: level === "card" ? "resource" : level === "microsequence" ? "card" : "microsequence",
    selectedIds: clone(authority.selectedIds),
    emptyContainerSelected: authority.emptyContainerSelected,
    allowedOperations: allowedOperations(level, authority)
  };
  const contextValue = readOnlyContext(context, level, authority);
  const request = {
    level,
    kind,
    targetIds: clone(targetIds)
  };
  const baseFingerprint = await sha256({
    contract: SCOPE_CONTRACT,
    selection: context.selection,
    request,
    writeScope,
    readOnlyContext: contextValue,
    protectedContent: protectedFingerprintContent(context, level)
  });
  return {
    contract: SCOPE_CONTRACT,
    selection: context.selection,
    level,
    kind: authority.effectiveKind,
    request,
    writeScope,
    readOnlyContext: contextValue,
    baseFingerprint
  };
}

export async function assertBottomUpAssistanceScopeCurrent({
  scope,
  projectDocument = {}
} = {}) {
  if (scope?.contract !== SCOPE_CONTRACT || !scope?.baseFingerprint || !scope?.request) {
    fail(
      "O escopo bottom-up não pode ser verificado.",
      "STALE_BOTTOM_UP_ASSISTANCE_SCOPE"
    );
  }
  let current;
  try {
    current = await buildBottomUpAssistanceScope({
      projectDocument,
      selection: scope.selection,
      level: scope.request.level,
      kind: scope.request.kind,
      targetIds: scope.request.targetIds
    });
  } catch (error) {
    if (!(error instanceof BottomUpAssistanceScopeError)) throw error;
    fail(
      "O alvo ou seu contexto mudou durante a assistência.",
      "STALE_BOTTOM_UP_ASSISTANCE_SCOPE"
    );
  }
  if (
    current.baseFingerprint !== scope.baseFingerprint ||
    !same(current.selection, scope.selection) ||
    !same(current.writeScope, scope.writeScope)
  ) {
    fail(
      "O alvo ou seu contexto mudou durante a assistência.",
      "STALE_BOTTOM_UP_ASSISTANCE_SCOPE"
    );
  }
  return current;
}

function requestedOperationTargetIds(request, selectedIds) {
  if (request.targetIds === undefined) return clone(selectedIds);
  const requested = normalizeTargetIds(request.targetIds);
  if (!requested.length) {
    fail(
      "A operação exige ao menos um alvo gravável.",
      "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
    );
  }
  const allowed = new Set(selectedIds);
  if (requested.some((targetId) => !allowed.has(targetId))) {
    fail(
      "A operação tentou ampliar a seleção autorizada.",
      "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
    );
  }
  return selectedIds.filter((targetId) => requested.includes(targetId));
}

function creationDestination(scope, operation, requestedDestination) {
  const requested = optionalIdentifier(requestedDestination, "destinationId");
  if (operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE) {
    const destinationId = scope.writeScope.containerId;
    if (requested && requested !== destinationId) {
      fail(
        "A nova microssequência só pode pertencer à lição selecionada.",
        "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
      );
    }
    return destinationId;
  }
  if (scope.level === "microsequence") {
    const destinationId = scope.writeScope.containerId;
    if (requested && requested !== destinationId) {
      fail(
        "Os novos cards só podem pertencer à microssequência selecionada.",
        "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
      );
    }
    return destinationId;
  }
  if (scope.level === "lesson" && scope.writeScope.selectedIds.length === 1) {
    const destinationId = scope.writeScope.selectedIds[0];
    if (requested && requested !== destinationId) {
      fail(
        "Os novos cards só podem pertencer à única microssequência selecionada.",
        "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
      );
    }
    return destinationId;
  }
  fail(
    "A seleção não determina um destino único para os novos cards.",
    "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
  );
}

export function assertBottomUpAssistanceOperationAuthorized(scope = {}, request = {}) {
  if (scope?.contract !== SCOPE_CONTRACT || !scope?.baseFingerprint) {
    fail("O comando não possui um escopo bottom-up válido.");
  }
  const operation = typeof request.operation === "string" ? request.operation : "";
  if (!scope.writeScope.allowedOperations.includes(operation)) {
    fail(
      "A operação não foi concedida pela seleção.",
      "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
    );
  }
  const creates = [
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS,
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE
  ].includes(operation);
  if (creates && request.targetIds !== undefined && normalizeTargetIds(request.targetIds).length) {
    fail(
      "Identidades de conteúdo novo são determinadas pelo AraLearn.",
      "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
    );
  }
  const targetIds = creates
    ? []
    : requestedOperationTargetIds(request, scope.writeScope.selectedIds);
  const destinationId = creates
    ? creationDestination(scope, operation, request.destinationId)
    : optionalIdentifier(request.destinationId, "destinationId");

  if (!creates && destinationId) {
    const allowedDestinations = operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_CARDS
      ? [scope.writeScope.containerId]
      : operation === BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_MICROSEQUENCES
        ? [scope.writeScope.containerId]
        : [];
    if (!allowedDestinations.includes(destinationId)) {
      fail(
        "O destino da operação está fora do contêiner autorizado.",
        "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
      );
    }
  }
  return {
    contract: COMMAND_CONTRACT,
    authorityFingerprint: scope.baseFingerprint,
    level: scope.level,
    operation,
    targetIds,
    destinationId
  };
}

export class BottomUpAssistanceScopeError extends Error {
  constructor(message, code = "INVALID_BOTTOM_UP_ASSISTANCE_SCOPE") {
    super(message);
    this.name = "BottomUpAssistanceScopeError";
    this.code = code;
  }
}
