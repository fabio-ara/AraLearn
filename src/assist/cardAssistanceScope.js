import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { validateCard } from "../domain/cards.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";
import { getCompositeBlockLabel, getResourceLabel } from "../domain/resources.js";
import { getCardResourceDefinition } from "../resources/registry/index.js";
import { buildScopedKey } from "../core/ids.js";

export const CARD_ASSISTANCE_OPERATIONS = Object.freeze(["repair", "create"]);
export const CARD_REPAIR_SCOPES = Object.freeze(["card", "resources"]);
export const CARD_CREATION_PLACEMENTS = Object.freeze([
  "before_current",
  "after_current",
  "end_current",
  "new_microsequence"
]);

const PRESERVED_CARD_FIELDS = Object.freeze([
  "id",
  "position",
  "resource",
  "kind",
  "exercise",
  "title",
  "after",
  "sources",
  "topics"
]);
const CONTEXTUAL_CHOICE_FIELDS = new Set([
  "question",
  "selectionMode",
  "selectionCriterion",
  "options",
  "answerIds"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function fail(message, code = "INVALID_CARD_ASSISTANCE_SCOPE") {
  throw new CardAssistanceScopeError(message, code);
}

function normalizedSelection(selection = {}) {
  return {
    courseKey: text(selection.courseKey),
    moduleKey: text(selection.moduleKey),
    lessonKey: text(selection.lessonKey),
    microsequenceKey: text(selection.microsequenceKey),
    cardKey: text(selection.cardKey)
  };
}

function uniqueEntity(items, id, label) {
  const matches = (Array.isArray(items) ? items : []).filter((item) => text(item?.id) === id);
  if (matches.length !== 1) {
    fail(
      `${label} não pertence uma única vez ao contexto selecionado.`,
      "INVALID_CARD_ASSISTANCE_SELECTION"
    );
  }
  return matches[0];
}

export function resolveCardAssistanceContext(projectDocument = {}, selection = {}) {
  const normalized = normalizedSelection(selection);
  const required = ["courseKey", "moduleKey", "lessonKey", "microsequenceKey"];
  if (required.some((fieldName) => !normalized[fieldName])) {
    fail(
      "Selecione uma microssequência válida antes de usar a assistência.",
      "INVALID_CARD_ASSISTANCE_SELECTION"
    );
  }
  const course = uniqueEntity(projectDocument.courses, normalized.courseKey, "O curso");
  const moduleValue = uniqueEntity(course.modules, normalized.moduleKey, "O módulo");
  const lesson = uniqueEntity(moduleValue.lessons, normalized.lessonKey, "A lição");
  const microsequence = uniqueEntity(
    lesson.microsequences,
    normalized.microsequenceKey,
    "A microssequência"
  );
  const cards = Array.isArray(microsequence.cards) ? microsequence.cards : [];
  const cardIndex = normalized.cardKey
    ? cards.findIndex((card) => text(card?.id) === normalized.cardKey)
    : -1;
  if (normalized.cardKey && (
    cardIndex < 0 ||
    cards.filter((card) => text(card?.id) === normalized.cardKey).length !== 1
  )) {
    fail(
      "O card selecionado não pertence uma única vez à microssequência.",
      "INVALID_CARD_ASSISTANCE_SELECTION"
    );
  }
  return {
    projectDocument,
    selection: normalized,
    course,
    moduleValue,
    lesson,
    microsequence,
    microsequenceIndex: lesson.microsequences.indexOf(microsequence),
    cards,
    card: cardIndex >= 0 ? cards[cardIndex] : null,
    cardIndex,
    previousCard: cardIndex > 0 ? cards[cardIndex - 1] : null,
    nextCard: cardIndex >= 0 ? cards[cardIndex + 1] || null : null
  };
}

function resourceTargetId(location, id = "") {
  if (location === "main") return "main";
  if (location === "response") return "response";
  if (location === "after_text") return "after:text";
  return `${location}:${text(id)}`;
}

function resourceTargetLabel(location, resourceType, index) {
  const base = getCompositeBlockLabel(
    resourceType,
    getResourceLabel(resourceType, resourceType === "heading" ? "Título" : "Recurso")
  );
  if (location === "main") return base;
  if (location === "response") return "Prática de escolha";
  if (location === "after_text") return "Texto posterior";
  return `${base} ${index + 1}`;
}

export function listCardResourceTargets(card = {}) {
  if (!card || typeof card !== "object" || Array.isArray(card) || !text(card.id)) return [];
  const targets = [];
  if (text(card.resource) === "composite") {
    (Array.isArray(card.blocks) ? card.blocks : []).forEach((block, index) => {
      const blockId = text(block?.id);
      if (!blockId) return;
      targets.push({
        targetId: resourceTargetId("body", blockId),
        location: "body",
        blockId,
        resourceType: text(block.kind),
        label: resourceTargetLabel("body", text(block.kind), index)
      });
    });
  } else {
    targets.push({
      targetId: resourceTargetId("main"),
      location: "main",
      blockId: "",
      resourceType: text(card.resource),
      label: resourceTargetLabel("main", text(card.resource), 0)
    });
  }
  if (listCardResponseFieldNames(card).length) {
    targets.push({
      targetId: resourceTargetId("response"),
      location: "response",
      blockId: "",
      resourceType: "choice",
      label: resourceTargetLabel("response", "choice", 0)
    });
  }
  targets.push({
    targetId: resourceTargetId("after_text"),
    location: "after_text",
    blockId: "",
    resourceType: "paragraph",
    label: resourceTargetLabel("after_text", "paragraph", 0)
  });
  (Array.isArray(card.afterBlocks) ? card.afterBlocks : []).forEach((block, index) => {
    const blockId = text(block?.id);
    if (!blockId) return;
    targets.push({
      targetId: resourceTargetId("after", blockId),
      location: "after",
      blockId,
      resourceType: text(block.kind),
      label: `${resourceTargetLabel("after", text(block.kind), index)} · apoio`
    });
  });
  if (new Set(targets.map((target) => target.targetId)).size !== targets.length) {
    fail(
      "O card contém identidades de recurso ambíguas.",
      "INVALID_CARD_ASSISTANCE_SELECTION"
    );
  }
  return targets;
}

function normalizeRequestedResourceTargets(card, targetIds = []) {
  if (!Array.isArray(targetIds) || targetIds.length === 0) {
    fail("Selecione ao menos um recurso do card.", "INVALID_CARD_ASSISTANCE_SELECTION");
  }
  const available = new Map(
    listCardResourceTargets(card).map((target) => [target.targetId, target])
  );
  const normalizedIds = targetIds.map(text);
  if (normalizedIds.some((targetId) => !available.has(targetId)) ||
      new Set(normalizedIds).size !== normalizedIds.length) {
    fail(
      "A seleção contém recurso inexistente ou repetido.",
      "INVALID_CARD_ASSISTANCE_SELECTION"
    );
  }
  return [...available.values()].filter((target) => normalizedIds.includes(target.targetId));
}

function creationInsertIndex(context, placement) {
  if (placement === "end_current") return context.cards.length;
  if (placement === "before_current") return context.cardIndex;
  if (placement === "after_current") return context.cardIndex + 1;
  return context.cards.length;
}

function snapshotFingerprintInput(context, target) {
  const hierarchy = {
    contract: context.course?.contract,
    course: {
      id: context.course.id,
      title: context.course.title,
      goal: context.course.goal || ""
    },
    module: {
      id: context.moduleValue.id,
      title: context.moduleValue.title,
      goal: context.moduleValue.goal || "",
      guide: clone(context.moduleValue.guide || null)
    },
    lesson: {
      id: context.lesson.id,
      title: context.lesson.title,
      description: context.lesson.description || "",
      guide: clone(context.lesson.guide || null),
      topics: clone(context.lesson.topics || [])
    },
    microsequence: clone(context.microsequence)
  };
  if (target.operation === "create" && target.placement === "new_microsequence") {
    hierarchy.lessonMicrosequences = context.lesson.microsequences.map((microsequence) => ({
      id: microsequence.id,
      title: microsequence.title,
      status: microsequence.status,
      dependsOn: clone(microsequence.dependsOn || [])
    }));
  }
  return { hierarchy, target };
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) {
    fail("Web Crypto não está disponível para proteger a prévia.", "CRYPTO_UNAVAILABLE");
  }
  const bytes = new TextEncoder().encode(canonicalStringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildCardAssistanceScopeSnapshot(
  projectDocument = {},
  selection = {},
  request = {}
) {
  const context = resolveCardAssistanceContext(projectDocument, selection);
  const operation = CARD_ASSISTANCE_OPERATIONS.includes(text(request.operation))
    ? text(request.operation)
    : "";
  if (!operation) {
    fail("A assistência exige uma operação explícita de reparo ou criação.");
  }
  let target;
  if (operation === "repair") {
    if (!context.card) {
      fail("Não há card selecionado para reparar.", "INVALID_CARD_ASSISTANCE_SELECTION");
    }
    const scope = text(request.repairScope);
    if (!CARD_REPAIR_SCOPES.includes(scope)) {
      fail(
        "O reparo exige um escopo explícito e válido.",
        "INVALID_CARD_ASSISTANCE_SCOPE"
      );
    }
    target = {
      operation,
      repairScope: scope,
      cardKey: context.card.id,
      cardIndex: context.cardIndex,
      ...(scope === "resources"
        ? {
            resources: normalizeRequestedResourceTargets(
              context.card,
              request.resourceTargetIds
            )
          }
        : {})
    };
  } else {
    const placement = text(request.placement);
    if (!CARD_CREATION_PLACEMENTS.includes(placement)) {
      fail(
        "A criação exige uma posição explícita e válida.",
        "INVALID_CARD_ASSISTANCE_SCOPE"
      );
    }
    if (!context.card && ["before_current", "after_current"].includes(placement)) {
      fail(
        "Selecione um card âncora para criar antes ou depois dele.",
        "INVALID_CARD_ASSISTANCE_SELECTION"
      );
    }
    target = {
      operation,
      placement,
      anchorCardKey: context.card?.id || "",
      anchorCardIndex: context.cardIndex,
      insertIndex: creationInsertIndex(context, placement),
      anchorMicrosequenceKey: context.microsequence.id,
      anchorMicrosequenceIndex: context.microsequenceIndex
    };
  }
  return {
    contract: "aralearn.card-assistance-scope.v1",
    selection: context.selection,
    target,
    baseFingerprint: await sha256(snapshotFingerprintInput(context, target))
  };
}

export async function assertCardAssistanceScopeCurrent({
  snapshot,
  projectDocument,
  selection
} = {}) {
  if (snapshot?.contract !== "aralearn.card-assistance-scope.v1" ||
      !snapshot?.baseFingerprint || !snapshot?.target) {
    fail(
      "A prévia não possui um escopo verificável.",
      "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
  const request = snapshot.target.operation === "repair"
    ? {
        operation: "repair",
        repairScope: snapshot.target.repairScope,
        resourceTargetIds: (snapshot.target.resources || []).map((target) => target.targetId)
      }
    : {
        operation: "create",
        placement: snapshot.target.placement
      };
  let current;
  try {
    current = await buildCardAssistanceScopeSnapshot(projectDocument, selection, request);
  } catch (error) {
    if (!(error instanceof CardAssistanceScopeError)) throw error;
    fail(
      "O alvo mudou desde o pedido. Descarte a prévia e gere outra.",
      "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
  if (!same(snapshot.selection, current.selection) ||
      !same(snapshot.target, current.target) ||
      snapshot.baseFingerprint !== current.baseFingerprint) {
    fail(
      "O alvo mudou desde o pedido. Descarte a prévia e gere outra.",
      "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
  return current;
}

function blockCollection(card, location) {
  if (location === "body") return Array.isArray(card.blocks) ? card.blocks : [];
  if (location === "after") return Array.isArray(card.afterBlocks) ? card.afterBlocks : [];
  return [];
}

export function listCardMainResourceFieldNames(card = {}) {
  const definition = getCardResourceDefinition(text(card.resource));
  const protectedFields = new Set([...PRESERVED_CARD_FIELDS, "afterBlocks"]);
  return Object.keys(definition?.cardSchema?.properties || {})
    .filter((fieldName) =>
      !protectedFields.has(fieldName) &&
      (
        text(card.resource) === "choice" ||
        !CONTEXTUAL_CHOICE_FIELDS.has(fieldName)
      )
    );
}

export function listCardResponseFieldNames(card = {}) {
  if (text(card.resource) === "choice" || text(card.exercise) !== "choice") {
    return [];
  }
  const properties = getCardResourceDefinition(text(card.resource))
    ?.cardSchema?.properties || {};
  return [...CONTEXTUAL_CHOICE_FIELDS].filter((fieldName) =>
    Object.hasOwn(properties, fieldName)
  );
}

function replaceSelectedWithIdentity(card, target) {
  if (target.location === "main") {
    listCardMainResourceFieldNames(card).forEach((fieldName) => {
      delete card[fieldName];
    });
    return;
  }
  if (target.location === "response") {
    listCardResponseFieldNames(card).forEach((fieldName) => {
      delete card[fieldName];
    });
    return;
  }
  if (target.location === "after_text") {
    card.after = "__selectedResource";
    return;
  }
  const fieldName = target.location === "body" ? "blocks" : "afterBlocks";
  if (!Array.isArray(card[fieldName])) return;
  card[fieldName] = card[fieldName].map((block) =>
    text(block?.id) === target.blockId
      ? { id: block.id, kind: block.kind, __selectedResource: true }
      : block
  );
}

function assertResourceRepairBoundary(beforeCard, afterCard, targets) {
  const beforeComparable = clone(beforeCard);
  const afterComparable = clone(afterCard);
  targets.forEach((target) => {
    replaceSelectedWithIdentity(beforeComparable, target);
    replaceSelectedWithIdentity(afterComparable, target);
  });
  if (!same(beforeComparable, afterComparable)) {
    fail(
      "A resposta tentou alterar conteúdo fora dos recursos selecionados.",
      "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
    );
  }
  targets.filter((target) =>
    ["body", "after"].includes(target.location)
  ).forEach((target) => {
    const beforeBlock = blockCollection(beforeCard, target.location)
      .find((block) => text(block?.id) === target.blockId);
    const afterBlock = blockCollection(afterCard, target.location)
      .find((block) => text(block?.id) === target.blockId);
    if (!beforeBlock || !afterBlock ||
        beforeBlock.id !== afterBlock.id ||
        beforeBlock.kind !== afterBlock.kind) {
      fail(
        "A resposta tentou trocar a identidade ou o tipo de um recurso selecionado.",
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
  });
}

function validateProposedCard(card, path) {
  const validation = validateCard(card, path);
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    fail(
      `A prévia contém um card inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
}

function uniqueKey(scope, label, existingIds) {
  const base = buildScopedKey(scope, label || scope);
  if (!existingIds.has(base)) return base;
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}

function collectNestedIds(projectDocument, collectionName) {
  const ids = new Set();
  (projectDocument?.courses || []).forEach((course) => {
    (course.modules || []).forEach((moduleValue) => {
      (moduleValue.lessons || []).forEach((lesson) => {
        (lesson.microsequences || []).forEach((microsequence) => {
          if (collectionName === "microsequences" && text(microsequence?.id)) {
            ids.add(text(microsequence.id));
          }
          if (collectionName === "cards") {
            (microsequence.cards || []).forEach((card) => {
              if (text(card?.id)) ids.add(text(card.id));
            });
          }
        });
      });
    });
  });
  return ids;
}

export function allocateAssistedCardId(context, label = "novo-card") {
  const ids = collectNestedIds(context.projectDocument, "cards");
  return uniqueKey("card", label, ids);
}

export function allocateAssistedMicrosequenceId(context, label = "nova-microssequencia") {
  const ids = collectNestedIds(context.projectDocument, "microsequences");
  return uniqueKey("microsequence", label, ids);
}

function renumberCards(cards) {
  return cards.map((card, index) => ({ ...card, position: index + 1 }));
}

export async function applyCardAssistanceChangeSet({
  projectDocument,
  selection,
  snapshot,
  changeSet
} = {}) {
  await assertCardAssistanceScopeCurrent({ snapshot, projectDocument, selection });
  if (changeSet?.contract !== "aralearn.card-assistance-change.v1" ||
      changeSet?.operation !== snapshot.target.operation) {
    fail("A prévia não corresponde à operação autorizada.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  const context = resolveCardAssistanceContext(projectDocument, selection);
  const nextProject = clone(projectDocument);
  const nextContext = resolveCardAssistanceContext(nextProject, selection);
  const proposedCard = clone(changeSet.card);
  validateProposedCard(proposedCard, "$.assistance.card");

  let targetMicrosequenceKey = nextContext.microsequence.id;
  let cardKey = proposedCard.id;
  if (snapshot.target.operation === "repair") {
    if (proposedCard.id !== context.card.id || proposedCard.position !== context.card.position) {
      fail(
        "O reparo tentou trocar a identidade ou a posição do card.",
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
    if (snapshot.target.repairScope === "resources") {
      assertResourceRepairBoundary(context.card, proposedCard, snapshot.target.resources || []);
    }
    nextContext.microsequence.cards[nextContext.cardIndex] = proposedCard;
  } else if (snapshot.target.placement === "new_microsequence") {
    const proposedMicrosequence = clone(changeSet.microsequence);
    if (!proposedMicrosequence?.id ||
        context.lesson.microsequences.some((item) => item.id === proposedMicrosequence.id) ||
        !Array.isArray(proposedMicrosequence.cards) ||
        proposedMicrosequence.cards.length !== 1 ||
        !same(proposedMicrosequence.cards[0], proposedCard)) {
      fail(
        "A criação fora da microssequência não contém exatamente o novo card autorizado.",
        "INVALID_CARD_ASSISTANCE_RESULT"
      );
    }
    const insertionIndex = snapshot.target.anchorMicrosequenceIndex + 1;
    nextContext.lesson.microsequences.splice(insertionIndex, 0, proposedMicrosequence);
    targetMicrosequenceKey = proposedMicrosequence.id;
  } else {
    if (context.cards.some((card) => card.id === proposedCard.id)) {
      fail("O novo card reutiliza uma identidade existente.", "INVALID_CARD_ASSISTANCE_RESULT");
    }
    const cards = nextContext.microsequence.cards.slice();
    cards.splice(snapshot.target.insertIndex, 0, proposedCard);
    nextContext.microsequence.cards = renumberCards(cards);
    nextContext.microsequence.status = "generated";
    cardKey = proposedCard.id;
  }

  const validation = validateProjectDocument(nextProject);
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    fail(
      `A aplicação deixaria o documento inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
  return {
    projectDocument: nextProject,
    targetMicrosequenceKey,
    cardKey
  };
}

export class CardAssistanceScopeError extends Error {
  constructor(message, code = "INVALID_CARD_ASSISTANCE_SCOPE") {
    super(message);
    this.name = "CardAssistanceScopeError";
    this.code = code;
  }
}
