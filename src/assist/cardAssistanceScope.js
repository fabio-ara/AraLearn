import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";
import { normalizeCardEnvelope, validateCardEnvelope } from "../resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import {
  CARD_ASSISTANCE_OPERATIONS,
  normalizeCardAssistanceOperation
} from "./cardAssistanceOperations.js";

export const CARD_ASSISTANCE_SCOPES = Object.freeze(["card", "resources"]);

const MASKED_TEXT_VALUE = "__aralearn_authorized_text_leaf__";
const TEXT_REBASE_CONFLICT_POLICIES = new Set(["reject", "local"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function validatePackageCard(card, path) {
  const result = validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY, path);
  return result.valid
    ? { ok: true, value: normalizeCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY), errors: [] }
    : { ok: false, value: null, errors: result.errors.map((message) => ({ path, message })) };
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
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

function packageLabel(packageId) {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) => id === packageId)?.label
    || packageId;
}

function conciseEditableLabel(value) {
  return String(value || "Texto").replace(/^Editar\s+/iu, "");
}

function instanceEditableTextLabels(instance, slot) {
  return RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, slot)
    .filter(({ path }) => typeof readPath(instance.data, path) === "string")
    .map(({ path, label }) => conciseEditableLabel(label || path));
}

export function listCardResourceTargets(card = {}) {
  if (!card || typeof card !== "object" || Array.isArray(card) || !text(card.id)) return [];
  const targets = [
    ...(card.content || []).map((instance, index) => ({ instance, slot: "content", index })),
    ...(card.response ? [{ instance: card.response, slot: "response", index: 0 }] : []),
    ...(card.feedback || []).map((instance, index) => ({ instance, slot: "feedback", index }))
  ].filter(({ instance }) => text(instance?.id) && text(instance?.package)).map(({ instance, slot, index }) => ({
    targetId: `${slot}:${instance.id}`,
    location: slot,
    blockId: instance.id,
    resourceType: instance.package,
    label: `${packageLabel(instance.package)}${slot === "feedback" ? " · feedback" : ""}${index ? ` ${index + 1}` : ""}`,
    editableTextLabels: instanceEditableTextLabels(instance, slot)
  }));
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
  const operation = normalizeCardAssistanceOperation(request.operation);
  if (!operation) fail("A assistência exige uma operação explícita e válida.");
  if (!context.card) {
    fail("Não há card selecionado para alterar.", "INVALID_CARD_ASSISTANCE_SELECTION");
  }
  const requestedScope = text(request.scope);
  if (operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT &&
      !CARD_ASSISTANCE_SCOPES.includes(requestedScope)) {
    fail(
      "edit_text exige um escopo explícito e válido.",
      "INVALID_CARD_ASSISTANCE_SCOPE"
    );
  }
  const scope = operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT
    ? requestedScope
    : "card";
  if (operation !== CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT &&
      requestedScope && requestedScope !== "card") {
    fail(
      "Somente edit_text pode atuar em resources selecionados; a recomposição e a restauração substituem o card inteiro.",
      "INVALID_CARD_ASSISTANCE_SCOPE"
    );
  }
  const versionId = text(request.versionId);
  if (operation === CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION && !versionId) {
    fail("A restauração exige a identidade exata da versão.", "INVALID_CARD_ASSISTANCE_SCOPE");
  }
  const target = {
    operation,
    scope,
    cardKey: context.card.id,
    cardIndex: context.cardIndex,
    ...(operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT && scope === "resources"
      ? {
          resources: normalizeRequestedResourceTargets(
            context.card,
            request.resourceTargetIds
          )
        }
      : {}),
    ...(operation === CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION ? { versionId } : {})
  };
  return {
    contract: "aralearn.card-assistance-scope.v2",
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
  if (snapshot?.contract !== "aralearn.card-assistance-scope.v2" ||
      !snapshot?.baseFingerprint || !snapshot?.target) {
    fail(
      "A alteração não possui um escopo verificável.",
      "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
  const request = {
    operation: snapshot.target.operation,
    scope: snapshot.target.scope,
    resourceTargetIds: (snapshot.target.resources || []).map((target) => target.targetId),
    versionId: snapshot.target.versionId
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

function addTargetTextualLeaves(card, target, leaves) {
  const instances = target.location === "response"
    ? (card.response ? [card.response] : [])
    : Array.isArray(card[target.location]) ? card[target.location] : [];
  const index = instances.findIndex((instance) => text(instance?.id) === target.blockId);
  if (index < 0) return;
  const basePath = target.location === "response"
    ? "response.data"
    : `${target.location}[${index}].data`;
  RESOURCE_PACKAGE_REGISTRY.editableTargets(instances[index], target.location)
    .forEach(({ path, optional = false }) => {
      if (typeof readPath(instances[index].data, path) !== "string") return;
      const qualifiedPath = `${basePath}.${path}`;
      leaves.set(qualifiedPath, { path: qualifiedPath, optional });
    });
}

function authorizedTextualLeaves(card, scope, targets) {
  const leaves = new Map();
  const selectedTargets = scope === "card"
    ? listCardResourceTargets(card)
    : targets;
  selectedTargets.forEach((target) => addTargetTextualLeaves(card, target, leaves));
  if (scope === "card") {
    leaves.set("title", { path: "title", optional: false });
  }
  return [...leaves.values()];
}

export function listCardAssistanceTextPaths(
  card,
  { scope = "card", targets = [] } = {}
) {
  return authorizedTextualLeaves(card, scope, targets)
    .map(({ path }) => path);
}

export function listCardAssistanceTextEntries(
  card,
  { scope = "card", targets = [] } = {}
) {
  return authorizedTextualLeaves(card, scope, targets).map(({ path }) => ({
    path,
    value: readPath(card, path)
  }));
}

export function applyCardAssistanceTextEdits(
  beforeCard,
  edits,
  { scope = "card", targets = [] } = {}
) {
  const beforeValidation = validatePackageCard(beforeCard, "$.assistance.beforeCard");
  if (!beforeValidation.ok) {
    fail("O card de origem do patch textual é inválido.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  if (!Array.isArray(edits) || edits.length > 64) {
    fail("O patch textual deve ser uma lista compacta de até 64 edições.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  const allowed = new Map(
    authorizedTextualLeaves(beforeValidation.value, scope, targets)
      .map((leaf) => [leaf.path, leaf])
  );
  const seen = new Set();
  const patched = clone(beforeCard);
  edits.forEach((edit) => {
    const path = text(edit?.path);
    const leaf = allowed.get(path);
    if (!leaf || seen.has(path) || typeof edit?.value !== "string" || edit.value.length > 24000) {
      fail(
        "O patch contém caminho ausente ou repetido, ou um valor textual fora do limite.",
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
    seen.add(path);
    if (!writePath(patched, path, edit.value, { createMissing: leaf.optional })) {
      fail(`Não foi possível aplicar a edição textual ${path}.`, "INVALID_CARD_ASSISTANCE_RESULT");
    }
  });
  const validation = validatePackageCard(patched, "$.assistance.patchedCard");
  if (!validation.ok) {
    fail("O patch textual deixou o card inválido.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  assertCardAssistanceTextBoundary(beforeCard, patched, { scope, targets });
  return patched;
}

export function assertCardAssistanceTextBoundary(
  beforeCard,
  afterCard,
  { scope = "card", targets = [] } = {}
) {
  const beforeComparable = clone(beforeCard);
  const afterComparable = clone(afterCard);
  const leaves = authorizedTextualLeaves(beforeCard, scope, targets);

  leaves.forEach(({ path, optional }) => {
    const beforeValue = readPath(beforeCard, path);
    const afterValue = readPath(afterCard, path);
    if (
      (!optional && (typeof beforeValue !== "string" || typeof afterValue !== "string")) ||
      (optional && beforeValue !== undefined && typeof beforeValue !== "string") ||
      (optional && afterValue !== undefined && typeof afterValue !== "string")
    ) {
      fail(
        `A edição tentou alterar a forma estrutural do campo textual ${path}.`,
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
    const createMissing = optional === true;
    if (
      !writePath(beforeComparable, path, MASKED_TEXT_VALUE, { createMissing }) ||
      !writePath(afterComparable, path, MASKED_TEXT_VALUE, { createMissing })
    ) {
      fail(
        `A edição tentou remover o campo textual autorizado ${path}.`,
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
  });

  if (!same(beforeComparable, afterComparable)) {
    fail(
      scope === "resources"
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
  { scope = "card", targets = [] } = {}
) {
  const beforeValidation = validatePackageCard(beforeCard, "$.assistance.beforeCard");
  const proposedValidation = validatePackageCard(proposedCard, "$.assistance.proposedCard");
  if (!proposedValidation.ok) {
    fail("A edição textual contém um card inválido.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  const normalizedBefore = beforeValidation.ok ? beforeValidation.value : beforeCard;
  const normalizedProposal = beforeValidation.ok
    ? proposedValidation.value
    : proposedCard;
  assertCardAssistanceTextBoundary(normalizedBefore, normalizedProposal, {
    scope,
    targets
  });

  const projected = clone(beforeCard);
  authorizedTextualLeaves(normalizedBefore, scope, targets)
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
  const projectedValidation = validatePackageCard(projected, "$.assistance.projectedCard");
  if (!projectedValidation.ok) {
    fail("A edição textual projetada deixou o card inválido.", "INVALID_CARD_ASSISTANCE_RESULT");
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
  scope = "card",
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
    scope,
    targets
  });
  let safeRemote;
  try {
    safeRemote = projectCardAssistanceTextChange(baseCard, remoteCard, {
      scope: "card"
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
  authorizedTextualLeaves(baseCard, scope, targets)
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

  const validation = validatePackageCard(rebased, "$.assistance.rebasedCard");
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
  const validation = validatePackageCard(card, path);
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
  const operation = normalizeCardAssistanceOperation(changeSet?.operation);
  if (changeSet?.contract !== "aralearn.card-assistance-change.v2" ||
      !operation || operation !== snapshot.target.operation) {
    fail("A alteração não corresponde à operação autorizada.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  if (operation === CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION &&
      text(changeSet?.versionId) !== snapshot.target.versionId) {
    fail("A alteração não corresponde à versão autorizada.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  const allowedChangeFields = new Set([
    "contract",
    "operation",
    "card",
    ...(operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT ? ["textPatch"] : []),
    ...(operation === CARD_ASSISTANCE_OPERATIONS.RECOMPOSE_CARD
      ? ["candidateId", "catalogDisclosure"]
      : []),
    ...(operation === CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION ? ["versionId"] : [])
  ]);
  if (Object.keys(changeSet || {}).some((field) => !allowedChangeFields.has(field)) ||
      (operation === CARD_ASSISTANCE_OPERATIONS.RECOMPOSE_CARD && !text(changeSet.candidateId)) ||
      (changeSet.catalogDisclosure !== undefined &&
        (typeof changeSet.catalogDisclosure !== "string" ||
          changeSet.catalogDisclosure.length > 900))) {
    fail("O envelope da alteração não corresponde à operação declarada.", "INVALID_CARD_ASSISTANCE_RESULT");
  }
  const context = resolveCardAssistanceContext(projectDocument, selection);
  const nextProject = clone(projectDocument);
  const nextContext = resolveCardAssistanceContext(nextProject, selection);
  const proposedCard = clone(changeSet.card);
  validateProposedCard(proposedCard, "$.assistance.card");

  if (proposedCard.id !== context.card.id || proposedCard.position !== context.card.position) {
    fail(
      "A alteração tentou trocar a identidade ou a posição do card.",
      "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
    );
  }
  if (operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT) {
    assertCardAssistanceTextBoundary(context.card, proposedCard, {
      scope: snapshot.target.scope,
      targets: snapshot.target.resources || []
    });
    if (changeSet.textPatch !== undefined) {
      const patched = applyCardAssistanceTextEdits(context.card, changeSet.textPatch, {
        scope: snapshot.target.scope,
        targets: snapshot.target.resources || []
      });
      if (!same(patched, proposedCard)) {
        fail(
          "O patch textual não reconstrói exatamente o card proposto.",
          "INVALID_CARD_ASSISTANCE_RESULT"
        );
      }
    }
  }
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
    cardKey: proposedCard.id,
    changed: !same(context.card, proposedCard),
    operation
  };
}

export async function applyCardAssistanceBatchChangeSet({
  projectDocument,
  entries = []
} = {}) {
  if (!Array.isArray(entries) || !entries.length) {
    fail("A alteração conjunta não contém edições.", "INVALID_CARD_ASSISTANCE_RESULT");
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
        "Uma edição conjunta deve permanecer na mesma microssequência.",
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
      normalizeCardAssistanceOperation(item?.snapshot?.target?.operation) !==
        CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT ||
      normalizeCardAssistanceOperation(item?.changeSet?.operation) !==
        CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT
    ) {
      fail(
        "A seleção de vários cards aceita somente edições textuais.",
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
    const allowedFields = new Set(["contract", "operation", "card", "textPatch"]);
    if (
      item.changeSet?.contract !== "aralearn.card-assistance-change.v2" ||
      Object.keys(item.changeSet || {}).some((field) => !allowedFields.has(field)) ||
      proposedCard.id !== beforeContext.card.id ||
      proposedCard.position !== beforeContext.card.position
    ) {
      fail(
        "Uma edição textual conjunta tentou trocar identidade ou posição de card.",
        "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
      );
    }
    assertCardAssistanceTextBoundary(beforeContext.card, proposedCard, {
      scope: item.snapshot.target.scope,
      targets: item.snapshot.target.resources || []
    });
    if (item.changeSet.textPatch !== undefined) {
      const patched = applyCardAssistanceTextEdits(
        beforeContext.card,
        item.changeSet.textPatch,
        {
          scope: item.snapshot.target.scope,
          targets: item.snapshot.target.resources || []
        }
      );
      if (!same(patched, proposedCard)) {
        fail(
          "Um patch textual conjunto não reconstrói exatamente o card proposto.",
          "INVALID_CARD_ASSISTANCE_RESULT"
        );
      }
    }
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
