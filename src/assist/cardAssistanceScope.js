import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { validateCard } from "../domain/cards.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";
import { getCompositeBlockLabel, getResourceLabel } from "../domain/resources.js";
import { getCardResourceDefinition } from "../resources/registry/index.js";

export const CARD_REPAIR_SCOPES = Object.freeze(["card", "resources"]);

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
const TEXTUAL_LEAF_FIELD_NAMES = new Set([
  "accessibleText",
  "after",
  "code",
  "coefficient",
  "condition",
  "connector",
  "detail",
  "expression",
  "feedback",
  "form",
  "formula",
  "gloss",
  "init",
  "ipa",
  "label",
  "match",
  "name",
  "note",
  "prompt",
  "question",
  "reading",
  "result",
  "simplified",
  "text",
  "title",
  "traditional",
  "translation",
  "unit",
  "update",
  "value"
]);
const TEXTUAL_PRIMITIVE_ARRAY_FIELDS = new Set([
  "columns",
  "conditions",
  "pairList",
  "rows",
  "values"
]);
const PROTECTED_TEXTUAL_FIELD_NAMES = new Set([
  "answer",
  "answerIds",
  "chartType",
  "directed",
  "distractors",
  "entryType",
  "exercise",
  "from",
  "gap",
  "gaps",
  "groupId",
  "id",
  "kind",
  "language",
  "languageTag",
  "layout",
  "misconceptionId",
  "notation",
  "open",
  "parentId",
  "practice",
  "reactionType",
  "resource",
  "response",
  "role",
  "selectionCriterion",
  "selectionMode",
  "shape",
  "sources",
  "state",
  "targetIds",
  "textDirection",
  "to",
  "topics",
  "type",
  "variant",
  "writingMode",
  "alignment",
  "acceptedAnswers"
]);
const FLOW_BINARY_BRANCH_KINDS = new Set([
  "if_then",
  "if_then_else",
  "while",
  "do_while",
  "for"
]);
const MASKED_TEXT_VALUE = "__aralearn_authorized_text_leaf__";
const TEXT_REBASE_CONFLICT_POLICIES = new Set(["reject", "local"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function appendPath(base, key) {
  if (typeof key === "number") return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

function parsePath(path) {
  const segments = [];
  String(path || "").replace(/([^.[]+)|\[(\d+)\]/gu, (_match, key, index) => {
    segments.push(index === undefined ? key : Number(index));
    return "";
  });
  return segments;
}

function readPath(target, path) {
  return parsePath(path).reduce((value, segment) => value?.[segment], target);
}

function writePath(target, path, value, { createMissing = false } = {}) {
  const segments = parsePath(path);
  const last = segments.pop();
  if (last === undefined) return false;
  let parent = target;
  for (const segment of segments) {
    if (!parent || typeof parent !== "object") return false;
    if (parent[segment] === undefined && createMissing) parent[segment] = {};
    parent = parent[segment];
  }
  if (!parent || typeof parent !== "object") return false;
  if (!Object.hasOwn(parent, last) && !createMissing) return false;
  parent[last] = value;
  return true;
}

function deletePath(target, path) {
  const segments = parsePath(path);
  const last = segments.pop();
  if (last === undefined) return;
  const parent = segments.reduce((value, segment) => value?.[segment], target);
  if (!parent || typeof parent !== "object") return;
  delete parent[last];
}

function sourceGapTokens(value) {
  return typeof value === "string"
    ? value.match(/\{gap:[^}]+\}|\[\[[\s\S]*?\]\]/gu) || []
    : [];
}

function gapTextSegments(value) {
  if (typeof value !== "string") return [];
  return value
    .split(/(\{gap:[^}]+\}|\[\[[\s\S]*?\]\])/gu)
    .filter((_part, index) => index % 2 === 0);
}

function preservesGapTokenStructure(left, right) {
  const leftTokens = sourceGapTokens(left);
  const rightTokens = sourceGapTokens(right);
  if (
    leftTokens.length !== rightTokens.length ||
    !leftTokens.every((token, index) => token === rightTokens[index])
  ) return false;
  if (!leftTokens.length) return true;

  const leftSegments = gapTextSegments(left);
  const rightSegments = gapTextSegments(right);
  return leftSegments.length === rightSegments.length &&
    leftSegments.every((segment, index) => !segment.trim() || rightSegments[index]?.trim());
}

function pathTerminalField(path) {
  return String(path || "")
    .split(".")
    .at(-1)
    ?.replace(/\[\d+\]$/u, "") || "";
}

function primitiveArrayIsTextual(path) {
  const fieldName = pathTerminalField(path);
  if (!TEXTUAL_PRIMITIVE_ARRAY_FIELDS.has(fieldName)) return false;
  return !/^series\[\d+\]\.values(?:\[|$)/u.test(path);
}

function listTextualLeaves(
  value,
  {
    basePath = "",
    editableTopFields = null,
    optional = false,
    leaves = new Map()
  } = {}
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const path = appendPath(basePath, index);
      if (typeof item === "string" && primitiveArrayIsTextual(basePath)) {
        leaves.set(path, { path, optional });
        return;
      }
      if (item && typeof item === "object") {
        listTextualLeaves(item, { basePath: path, leaves });
      }
    });
    return leaves;
  }
  if (!value || typeof value !== "object") return leaves;

  Object.entries(value).forEach(([fieldName, child]) => {
    if (!basePath && editableTopFields && !editableTopFields.has(fieldName)) return;
    if (PROTECTED_TEXTUAL_FIELD_NAMES.has(fieldName) || /Ids?$/u.test(fieldName)) return;
    const path = appendPath(basePath, fieldName);
    if (typeof child === "string" && TEXTUAL_LEAF_FIELD_NAMES.has(fieldName)) {
      leaves.set(path, { path, optional });
      return;
    }
    if (Array.isArray(child) || (child && typeof child === "object")) {
      listTextualLeaves(child, { basePath: path, leaves });
    }
  });

  if (Array.isArray(value.options) && (!editableTopFields || editableTopFields.has("options"))) {
    value.options.forEach((option, index) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return;
      const path = appendPath(appendPath(basePath, "options"), index) + ".feedback";
      leaves.set(path, { path, optional: true });
    });
  }
  return leaves;
}

function listFlowBranchLabelLeaves(structure, basePath, leaves) {
  const add = (path) => leaves.set(path, { path, optional: true });
  const visitList = (items, path) => {
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      visitNode(item, appendPath(path, index));
    });
  };
  const addBinary = (path) => {
    add(`${path}.branchLabels.yes`);
    add(`${path}.branchLabels.no`);
  };
  const visitNode = (node, path) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (FLOW_BINARY_BRANCH_KINDS.has(text(node.kind))) addBinary(path);
    if (text(node.kind) === "switch_case") {
      add(`${path}.branchLabels.default`);
      (Array.isArray(node.cases) ? node.cases : []).forEach((item, index) => {
        visitList(item?.body, `${path}.cases[${index}].body`);
      });
    }
    if (text(node.kind) === "if_chain") {
      (Array.isArray(node.cases) ? node.cases : []).forEach((item, index) => {
        const casePath = `${path}.cases[${index}]`;
        addBinary(casePath);
        visitList(item?.thenBranch, `${casePath}.thenBranch`);
      });
    }
    ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach((fieldName) => {
      visitList(node[fieldName], `${path}.${fieldName}`);
    });
  };
  visitNode(structure, basePath);
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
  return { hierarchy, target };
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) {
    fail("Web Crypto não está disponível para proteger a alteração.", "CRYPTO_UNAVAILABLE");
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
  if (text(request.operation) !== "repair") {
    fail("A assistência no card aceita somente reparo.");
  }
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
  const target = {
    operation: "repair",
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
      "A alteração não possui um escopo verificável.",
      "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
  const request = {
    operation: "repair",
    repairScope: snapshot.target.repairScope,
    resourceTargetIds: (snapshot.target.resources || []).map((target) => target.targetId)
  };
  let current;
  try {
    current = await buildCardAssistanceScopeSnapshot(projectDocument, selection, request);
  } catch (error) {
    if (!(error instanceof CardAssistanceScopeError)) throw error;
    fail(
      "O alvo mudou desde o pedido. Envie a alteração novamente.",
      "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
  if (!same(snapshot.selection, current.selection) ||
      !same(snapshot.target, current.target) ||
      snapshot.baseFingerprint !== current.baseFingerprint) {
    fail(
      "O alvo mudou desde o pedido. Envie a alteração novamente.",
      "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
  return current;
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

function addFlowBranchLeaves(value, basePath, leaves) {
  const resourceType = text(value?.resource || value?.kind);
  if (resourceType !== "flow" || !value?.structure) return;
  listFlowBranchLabelLeaves(value.structure, appendPath(basePath, "structure"), leaves);
}

function addTargetTextualLeaves(card, target, leaves) {
  if (target.location === "main") {
    const editableTopFields = new Set(listCardMainResourceFieldNames(card));
    listTextualLeaves(card, { editableTopFields, leaves });
    if (editableTopFields.has("structure")) addFlowBranchLeaves(card, "", leaves);
    return;
  }
  if (target.location === "response") {
    listTextualLeaves(card, {
      editableTopFields: new Set(listCardResponseFieldNames(card)),
      leaves
    });
    return;
  }
  if (target.location === "after_text") {
    leaves.set("after", { path: "after", optional: false });
    return;
  }
  const fieldName = target.location === "body" ? "blocks" : "afterBlocks";
  const blocks = Array.isArray(card[fieldName]) ? card[fieldName] : [];
  const blockIndex = blocks.findIndex((block) => text(block?.id) === target.blockId);
  if (blockIndex < 0) return;
  const basePath = `${fieldName}[${blockIndex}]`;
  listTextualLeaves(blocks[blockIndex], { basePath, leaves });
  addFlowBranchLeaves(blocks[blockIndex], basePath, leaves);
}

function authorizedTextualLeaves(card, repairScope, targets) {
  const leaves = new Map();
  const selectedTargets = repairScope === "card"
    ? listCardResourceTargets(card)
    : targets;
  selectedTargets.forEach((target) => addTargetTextualLeaves(card, target, leaves));
  if (repairScope === "card") {
    leaves.set("title", { path: "title", optional: false });
  }
  return [...leaves.values()];
}

export function listCardAssistanceTextPaths(
  card,
  { repairScope = "card", targets = [] } = {}
) {
  return authorizedTextualLeaves(card, repairScope, targets)
    .map(({ path }) => path);
}

export function assertCardAssistanceTextBoundary(
  beforeCard,
  afterCard,
  { repairScope = "card", targets = [] } = {}
) {
  const beforeComparable = clone(beforeCard);
  const afterComparable = clone(afterCard);
  const leaves = authorizedTextualLeaves(beforeCard, repairScope, targets);

  leaves.forEach(({ path, optional }) => {
    const beforeValue = readPath(beforeCard, path);
    const afterValue = readPath(afterCard, path);
    if (
      (!optional && (typeof beforeValue !== "string" || typeof afterValue !== "string")) ||
      (optional && beforeValue !== undefined && typeof beforeValue !== "string") ||
      (optional && afterValue !== undefined && typeof afterValue !== "string")
    ) {
      fail(
        `O reparo tentou alterar a forma estrutural do campo textual ${path}.`,
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
    if (!preservesGapTokenStructure(beforeValue, afterValue)) {
      fail(
        `O reparo tentou alterar uma lacuna ou sua resposta em ${path}.`,
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
    const createMissing = optional === true;
    if (
      !writePath(beforeComparable, path, MASKED_TEXT_VALUE, { createMissing }) ||
      !writePath(afterComparable, path, MASKED_TEXT_VALUE, { createMissing })
    ) {
      fail(
        `O reparo tentou remover o campo textual autorizado ${path}.`,
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
  });

  if (!same(beforeComparable, afterComparable)) {
    fail(
      repairScope === "resources"
        ? "A resposta tentou alterar estrutura, resposta ou conteúdo fora dos recursos selecionados."
        : "A resposta tentou alterar a estrutura ou as respostas do card.",
      "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
    );
  }
  return afterCard;
}

export function projectCardAssistanceTextChange(
  beforeCard,
  proposedCard,
  { repairScope = "card", targets = [] } = {}
) {
  const beforeValidation = validateCard(beforeCard, "$.assistance.beforeCard");
  const proposedValidation = validateCard(proposedCard, "$.assistance.proposedCard");
  if (!proposedValidation.ok) {
    fail("O reparo textual contém um card inválido.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  const normalizedBefore = beforeValidation.ok ? beforeValidation.value : beforeCard;
  const normalizedProposal = beforeValidation.ok
    ? proposedValidation.value
    : proposedCard;
  assertCardAssistanceTextBoundary(normalizedBefore, normalizedProposal, {
    repairScope,
    targets
  });

  const projected = clone(beforeCard);
  authorizedTextualLeaves(normalizedBefore, repairScope, targets)
    .forEach(({ path, optional }) => {
      const value = readPath(normalizedProposal, path);
      if (optional && value === undefined) {
        deletePath(projected, path);
        return;
      }
      if (!writePath(projected, path, value, { createMissing: optional })) {
        fail(
          `Não foi possível aplicar a folha textual autorizada ${path}.`,
          "INVALID_CARD_ASSISTANCE_RESULT"
        );
      }
    });
  const projectedValidation = validateCard(projected, "$.assistance.projectedCard");
  if (!projectedValidation.ok) {
    fail("O reparo textual projetado deixou o card inválido.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  return projected;
}

function throwTextRebaseConflict(paths, message) {
  const error = new CardAssistanceScopeError(
    message || "O mesmo texto foi alterado local e remotamente.",
    "CARD_ASSISTANCE_TEXT_CONFLICT"
  );
  error.paths = [...new Set(paths)].sort();
  throw error;
}

export function rebaseCardAssistanceTextChange({
  baseCard,
  localCard,
  remoteCard,
  repairScope = "card",
  targets = [],
  conflictPolicy = "reject"
} = {}) {
  if (!TEXT_REBASE_CONFLICT_POLICIES.has(conflictPolicy)) {
    fail(
      "A política de conflito textual deve ser reject ou local.",
      "INVALID_CARD_ASSISTANCE_REQUEST"
    );
  }
  const safeLocal = projectCardAssistanceTextChange(baseCard, localCard, {
    repairScope,
    targets
  });
  let safeRemote;
  try {
    safeRemote = projectCardAssistanceTextChange(baseCard, remoteCard, {
      repairScope: "card"
    });
  } catch (error) {
    if (!(error instanceof CardAssistanceScopeError)) throw error;
    throwTextRebaseConflict(
      ["$structure"],
      "A estrutura ou as respostas do card mudaram no remoto; o texto local foi preservado como conflito."
    );
  }

  const rebased = clone(safeRemote);
  const appliedPaths = [];
  const convergedPaths = [];
  const conflictPaths = [];
  authorizedTextualLeaves(baseCard, repairScope, targets)
    .forEach(({ path, optional }) => {
      const baseValue = readPath(baseCard, path);
      const localValue = readPath(safeLocal, path);
      if (Object.is(baseValue, localValue)) return;
      const remoteValue = readPath(safeRemote, path);
      if (!Object.is(remoteValue, baseValue) && !Object.is(remoteValue, localValue)) {
        if (conflictPolicy === "reject") {
          conflictPaths.push(path);
          return;
        }
      }
      if (Object.is(remoteValue, localValue)) {
        convergedPaths.push(path);
        return;
      }
      if (optional && localValue === undefined) {
        deletePath(rebased, path);
      } else if (!writePath(rebased, path, localValue, { createMissing: optional })) {
        conflictPaths.push(path);
        return;
      }
      appliedPaths.push(path);
    });
  if (conflictPaths.length) throwTextRebaseConflict(conflictPaths);

  const validation = validateCard(rebased, "$.assistance.rebasedCard");
  if (!validation.ok) {
    throwTextRebaseConflict(
      ["$validation"],
      "A combinação dos textos local e remoto deixaria o card inválido."
    );
  }
  return {
    card: rebased,
    appliedPaths,
    convergedPaths
  };
}

function validateProposedCard(card, path) {
  const validation = validateCard(card, path);
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    fail(
      `A alteração contém um card inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
}

export async function applyCardAssistanceChangeSet({
  projectDocument,
  selection,
  snapshot,
  changeSet
} = {}) {
  await assertCardAssistanceScopeCurrent({ snapshot, projectDocument, selection });
  if (changeSet?.contract !== "aralearn.card-assistance-change.v1" ||
      changeSet?.operation !== "repair") {
    fail("A alteração não corresponde ao reparo autorizado.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  const context = resolveCardAssistanceContext(projectDocument, selection);
  const nextProject = clone(projectDocument);
  const nextContext = resolveCardAssistanceContext(nextProject, selection);
  const proposedCard = clone(changeSet.card);
  validateProposedCard(proposedCard, "$.assistance.card");

  if (proposedCard.id !== context.card.id || proposedCard.position !== context.card.position) {
    fail(
      "O reparo tentou trocar a identidade ou a posição do card.",
      "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
    );
  }
  assertCardAssistanceTextBoundary(context.card, proposedCard, {
    repairScope: snapshot.target.repairScope,
    targets: snapshot.target.resources || []
  });
  nextContext.microsequence.cards[nextContext.cardIndex] = proposedCard;

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
    targetMicrosequenceKey: nextContext.microsequence.id,
    cardKey: proposedCard.id
  };
}

export async function applyCardAssistanceBatchChangeSet({
  projectDocument,
  entries = []
} = {}) {
  if (!Array.isArray(entries) || !entries.length) {
    fail("A alteração conjunta não contém reparos.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  if (entries.length === 1) {
    const item = entries[0] || {};
    const applied = await applyCardAssistanceChangeSet({
      projectDocument,
      selection: item.selection,
      snapshot: item.snapshot,
      changeSet: item.changeSet
    });
    return {
      ...applied,
      cardKeys: [applied.cardKey]
    };
  }

  const firstSelection = normalizedSelection(entries[0]?.selection);
  const seenCardKeys = new Set();
  for (const item of entries) {
    const selection = normalizedSelection(item?.selection);
    if (
      ["courseKey", "moduleKey", "lessonKey", "microsequenceKey"].some(
        (fieldName) => selection[fieldName] !== firstSelection[fieldName]
      )
    ) {
      fail(
        "Um reparo conjunto deve permanecer na mesma microssequência.",
        "INVALID_CARD_ASSISTANCE_SELECTION"
      );
    }
    if (!selection.cardKey || seenCardKeys.has(selection.cardKey)) {
      fail(
        "A alteração conjunta contém card ausente ou repetido.",
        "INVALID_CARD_ASSISTANCE_SELECTION"
      );
    }
    seenCardKeys.add(selection.cardKey);
    if (
      item?.snapshot?.target?.operation !== "repair" ||
      item?.changeSet?.operation !== "repair"
    ) {
      fail(
        "A seleção de vários cards aceita somente reparos.",
        "INVALID_CARD_ASSISTANCE_SCOPE"
      );
    }
    await assertCardAssistanceScopeCurrent({
      snapshot: item.snapshot,
      projectDocument,
      selection
    });
  }

  const nextProject = clone(projectDocument);
  for (const item of entries) {
    const selection = normalizedSelection(item.selection);
    const beforeContext = resolveCardAssistanceContext(projectDocument, selection);
    const afterContext = resolveCardAssistanceContext(nextProject, selection);
    const proposedCard = clone(item.changeSet.card);
    validateProposedCard(proposedCard, `$.assistance.cards.${selection.cardKey}`);
    if (
      item.changeSet?.contract !== "aralearn.card-assistance-change.v1" ||
      proposedCard.id !== beforeContext.card.id ||
      proposedCard.position !== beforeContext.card.position
    ) {
      fail(
        "Um reparo conjunto tentou trocar identidade ou posição de card.",
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
    assertCardAssistanceTextBoundary(beforeContext.card, proposedCard, {
      repairScope: item.snapshot.target.repairScope,
      targets: item.snapshot.target.resources || []
    });
    afterContext.microsequence.cards[afterContext.cardIndex] = proposedCard;
  }

  const validation = validateProjectDocument(nextProject);
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    fail(
      `A aplicação conjunta deixaria o documento inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
  return {
    projectDocument: nextProject,
    targetMicrosequenceKey: firstSelection.microsequenceKey,
    cardKey: firstSelection.cardKey,
    cardKeys: [...seenCardKeys]
  };
}

export class CardAssistanceScopeError extends Error {
  constructor(message, code = "INVALID_CARD_ASSISTANCE_SCOPE") {
    super(message);
    this.name = "CardAssistanceScopeError";
    this.code = code;
  }
}
