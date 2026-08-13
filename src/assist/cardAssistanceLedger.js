import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { normalizeCardAssistanceOperation } from "./cardAssistanceOperations.js";

export const CARD_ASSISTANCE_LEDGER_CONTRACT = "aralearn.card-assistance-ledger.v2";
export const CARD_ASSISTANCE_LEDGER_MAX_TURNS = 8;

export function cardAssistanceLedgerKey(selection = {}) {
  return [
    selection.courseKey,
    selection.moduleKey,
    selection.lessonKey,
    selection.microsequenceKey,
    selection.cardKey
  ].map((value) => typeof value === "string" ? value.trim() : "").join("::");
}

function text(value, maxLength = 3000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clone(value) {
  return structuredClone(value);
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function assertCard(card, message = "O histórico exige um card válido.") {
  if (!card || typeof card !== "object" || Array.isArray(card) || !text(card.id, 300)) {
    const error = new Error(message);
    error.code = "INVALID_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
}

// FNV-1a duplo: não é assinatura de segurança; é uma chave curta e determinística de sincronização.
export function cardAssistanceCardFingerprint(card) {
  const source = canonicalStringify(card);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b) >>> 0;
  }
  return `card-v1-${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function version(id, parentId, card, sequence) {
  return {
    id,
    parentId,
    sequence,
    fingerprint: cardAssistanceCardFingerprint(card),
    card: clone(card)
  };
}

export function createCardAssistanceLedger({ selection = {}, card, maxTurns } = {}) {
  assertCard(card);
  const referenceKey = cardAssistanceLedgerKey(selection);
  if (referenceKey.split("::").some((part) => !part) ||
      String(selection.cardKey || "").trim() !== String(card.id).trim()) {
    const error = new Error("O histórico exige a identidade completa do card selecionado.");
    error.code = "INVALID_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
  const limit = Math.max(1, Math.min(
    CARD_ASSISTANCE_LEDGER_MAX_TURNS,
    Number(maxTurns) || CARD_ASSISTANCE_LEDGER_MAX_TURNS
  ));
  const base = version("v0", null, card, 0);
  return {
    contract: CARD_ASSISTANCE_LEDGER_CONTRACT,
    referenceKey,
    maxTurns: limit,
    nextSequence: 1,
    nextTurnSequence: 1,
    cursorVersionId: base.id,
    activePath: [base.id],
    versions: [base],
    turns: []
  };
}

function normalizedLedger(value) {
  if (value?.contract !== CARD_ASSISTANCE_LEDGER_CONTRACT) {
    const error = new Error("O histórico de assistência é incompatível.");
    error.code = "INVALID_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
  const ledger = clone(value);
  const versions = Array.isArray(ledger.versions) ? ledger.versions : [];
  const ids = new Set(versions.map(({ id }) => text(id, 200)));
  if (ids.size !== versions.length) {
    const error = new Error("O histórico contém identidades de versão repetidas ou ausentes.");
    error.code = "INVALID_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
  const baseIdentity = versions[0]
    ? { id: versions[0].card?.id, position: versions[0].card?.position }
    : null;
  const invalidVersion = versions.find((item) => {
    try {
      assertCard(item.card);
    } catch {
      return true;
    }
    return item.fingerprint !== cardAssistanceCardFingerprint(item.card) ||
      item.card.id !== baseIdentity?.id || item.card.position !== baseIdentity?.position ||
      (item.parentId !== null && !ids.has(item.parentId));
  });
  const activePath = Array.isArray(ledger.activePath) ? ledger.activePath : [];
  const brokenActivePath = activePath.some((id, index) => {
    if (!ids.has(id)) return true;
    if (index === 0) return versionById(ledger, id)?.parentId !== null;
    return versionById(ledger, id)?.parentId !== activePath[index - 1];
  });
  if (!ids.size || !ids.has(ledger.cursorVersionId) ||
      invalidVersion || brokenActivePath ||
      !activePath.includes(ledger.cursorVersionId)) {
    const error = new Error("O cursor do histórico de assistência é inválido.");
    error.code = "INVALID_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
  ledger.maxTurns = Math.max(1, Math.min(
    CARD_ASSISTANCE_LEDGER_MAX_TURNS,
    Number(ledger.maxTurns) || CARD_ASSISTANCE_LEDGER_MAX_TURNS
  ));
  ledger.turns = Array.isArray(ledger.turns) ? ledger.turns : [];
  ledger.nextTurnSequence = Math.max(
    1,
    Number(ledger.nextTurnSequence) ||
      (ledger.turns.reduce((maximum, turn) => (
        Math.max(maximum, Number(turn?.sequence) || 0)
      ), 0) + 1)
  );
  return ledger;
}

function versionById(ledger, id) {
  return ledger.versions.find((item) => item.id === id) || null;
}

export function cardAssistanceLedgerCurrentVersion(value) {
  const ledger = normalizedLedger(value);
  return clone(versionById(ledger, ledger.cursorVersionId));
}

export function readCardAssistanceLedgerVersion(value, versionId) {
  const ledger = normalizedLedger(value);
  const target = versionById(ledger, text(versionId, 200));
  if (!target) {
    const error = new Error("A versão solicitada não está mais disponível no histórico volátil.");
    error.code = "CARD_ASSISTANCE_VERSION_NOT_FOUND";
    throw error;
  }
  return clone(target);
}

export function assertCardAssistanceLedgerCurrent(value, card, selection = null) {
  assertCard(card);
  const ledger = normalizedLedger(value);
  const current = versionById(ledger, ledger.cursorVersionId);
  if ((selection && ledger.referenceKey !== cardAssistanceLedgerKey(selection)) ||
      !current || current.fingerprint !== cardAssistanceCardFingerprint(card) ||
      !same(current.card, card)) {
    const error = new Error("O card mudou fora desta conversa; reinicie o histórico antes de continuar.");
    error.code = "STALE_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
  return ledger;
}

function compactTextPatch(patch) {
  if (!Array.isArray(patch)) return [];
  return patch.slice(0, 64).map((entry) => ({
    path: text(entry?.path, 500),
    value: typeof entry?.value === "string" ? entry.value.slice(0, 24000) : ""
  })).filter(({ path }) => path);
}

function pruneLedger(ledger) {
  const maximumVersions = ledger.maxTurns + 1;
  const activeSet = new Set(ledger.activePath);
  let versions = ledger.versions;
  if (versions.length > maximumVersions) {
    const removable = versions
      .filter(({ id }) => !activeSet.has(id))
      .sort((left, right) => left.sequence - right.sequence);
    const removeIds = new Set(
      removable.slice(0, Math.max(0, versions.length - maximumVersions)).map(({ id }) => id)
    );
    versions = versions.filter(({ id }) => !removeIds.has(id));
  }
  if (ledger.activePath.length > maximumVersions) {
    const retainedPath = ledger.activePath.slice(-maximumVersions);
    const retained = new Set(retainedPath);
    versions = versions.filter(({ id }) => retained.has(id));
    const first = versions.find(({ id }) => id === retainedPath[0]);
    if (first) first.parentId = null;
    ledger.activePath = retainedPath;
  }
  if (versions.length > maximumVersions) {
    const keep = new Set([
      ...ledger.activePath,
      ...versions
        .filter(({ id }) => !activeSet.has(id))
        .sort((left, right) => right.sequence - left.sequence)
        .slice(0, maximumVersions - ledger.activePath.length)
        .map(({ id }) => id)
    ]);
    versions = versions.filter(({ id }) => keep.has(id));
  }
  const retainedIds = new Set(versions.map(({ id }) => id));
  versions.forEach((item) => {
    if (item.parentId !== null && !retainedIds.has(item.parentId)) item.parentId = null;
  });
  ledger.versions = versions;
  const retainedTurns = ledger.turns.filter((turn) => {
    const anchorVersionId = turn.anchorVersionId || turn.toVersionId;
    if (!retainedIds.has(anchorVersionId)) return false;
    return turn.outcome !== "applied" || (
      retainedIds.has(turn.fromVersionId) && retainedIds.has(turn.toVersionId)
    );
  });
  ledger.turns = retainedTurns.slice(-ledger.maxTurns);
  return ledger;
}

function appendConversationOnlyTurn(ledger, turn, operation) {
  const request = text(turn.request);
  const assistantResponse = text(turn.assistantResponse);
  if (!request || !assistantResponse) {
    return { ledger, applied: false, recorded: false, reason: "no-op" };
  }
  const sequence = Number(ledger.nextTurnSequence) || 1;
  ledger.nextTurnSequence = sequence + 1;
  ledger.turns.push({
    id: `t${sequence}`,
    sequence,
    fromVersionId: ledger.cursorVersionId,
    toVersionId: ledger.cursorVersionId,
    anchorVersionId: ledger.cursorVersionId,
    outcome: "no-op",
    operation,
    request,
    assistantResponse,
    scope: turn.scope === "resources" ? "resources" : "card",
    targetIds: Array.isArray(turn.targetIds)
      ? turn.targetIds.map((item) => text(item, 500)).filter(Boolean).slice(0, 24)
      : [],
    modelId: text(turn.modelId, 200)
  });
  return {
    ledger: pruneLedger(ledger),
    applied: false,
    recorded: true,
    reason: "no-op",
    turnId: `t${sequence}`
  };
}

export function appendCardAssistanceLedgerTurn(value, turn = {}) {
  const beforeCard = turn.beforeCard;
  assertCard(beforeCard);
  const ledger = assertCardAssistanceLedgerCurrent(value, beforeCard);
  if (turn.outcome && !["applied", "no-op"].includes(turn.outcome)) {
    return { ledger, applied: false, reason: text(turn.outcome, 80) || "not-applied" };
  }
  const afterCard = turn.afterCard;
  assertCard(afterCard);
  if (beforeCard.id !== afterCard.id || beforeCard.position !== afterCard.position) {
    const error = new Error("Uma versão não pode trocar a identidade ou a posição do card.");
    error.code = "INVALID_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
  const operation = normalizeCardAssistanceOperation(turn.operation);
  if (!operation) {
    const error = new Error("O turno aplicado exige uma operação de assistência válida.");
    error.code = "INVALID_CARD_ASSISTANCE_LEDGER";
    throw error;
  }
  if (turn.outcome === "no-op" || same(beforeCard, afterCard)) {
    return appendConversationOnlyTurn(ledger, turn, operation);
  }
  const cursorIndex = ledger.activePath.indexOf(ledger.cursorVersionId);
  const supersededVersionIds = ledger.activePath.slice(cursorIndex + 1);
  ledger.activePath = ledger.activePath.slice(0, cursorIndex + 1);
  const sequence = Number(ledger.nextSequence) || 1;
  const versionId = `v${sequence}`;
  ledger.nextSequence = sequence + 1;
  ledger.versions.push(version(versionId, ledger.cursorVersionId, afterCard, sequence));
  const turnSequence = Number(ledger.nextTurnSequence) || 1;
  ledger.nextTurnSequence = turnSequence + 1;
  ledger.turns.push({
    id: `t${turnSequence}`,
    sequence: turnSequence,
    fromVersionId: ledger.cursorVersionId,
    toVersionId: versionId,
    anchorVersionId: versionId,
    outcome: "applied",
    operation,
    request: text(turn.request),
    assistantResponse: text(turn.assistantResponse),
    scope: turn.scope === "resources" ? "resources" : "card",
    targetIds: Array.isArray(turn.targetIds)
      ? turn.targetIds.map((item) => text(item, 500)).filter(Boolean).slice(0, 24)
      : [],
    modelId: text(turn.modelId, 200),
    patch: operation === "edit_text"
      ? { kind: "text", edits: compactTextPatch(turn.textPatch) }
      : {
          kind: "replace_card",
          fromFingerprint: cardAssistanceCardFingerprint(beforeCard),
          toFingerprint: cardAssistanceCardFingerprint(afterCard)
        }
  });
  ledger.cursorVersionId = versionId;
  ledger.activePath.push(versionId);
  return {
    ledger: pruneLedger(ledger),
    applied: true,
    versionId,
    supersededVersionIds
  };
}

function moveCursor(value, direction) {
  const ledger = normalizedLedger(value);
  const index = ledger.activePath.indexOf(ledger.cursorVersionId);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= ledger.activePath.length) {
    return { ledger, changed: false, card: clone(versionById(ledger, ledger.cursorVersionId).card) };
  }
  ledger.cursorVersionId = ledger.activePath[nextIndex];
  return {
    ledger,
    changed: true,
    card: clone(versionById(ledger, ledger.cursorVersionId).card),
    versionId: ledger.cursorVersionId
  };
}

export function undoCardAssistanceLedger(value) {
  return moveCursor(value, -1);
}

export function redoCardAssistanceLedger(value) {
  return moveCursor(value, 1);
}

function ancestry(ledger, versionId) {
  const result = [];
  const visited = new Set();
  let current = versionById(ledger, versionId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current.id);
    current = current.parentId ? versionById(ledger, current.parentId) : null;
  }
  return result;
}

export function restoreCardAssistanceLedgerVersion(value, versionId) {
  const ledger = normalizedLedger(value);
  const target = versionById(ledger, text(versionId, 200));
  if (!target) {
    const error = new Error("A versão solicitada não está mais disponível no histórico volátil.");
    error.code = "CARD_ASSISTANCE_VERSION_NOT_FOUND";
    throw error;
  }
  if (!ledger.activePath.includes(target.id)) {
    ledger.activePath = ancestry(ledger, target.id);
  }
  const changed = ledger.cursorVersionId !== target.id;
  ledger.cursorVersionId = target.id;
  return { ledger, changed, card: clone(target.card), versionId: target.id };
}

export function cardAssistanceLedgerContext(value) {
  const ledger = normalizedLedger(value);
  const cursorIndex = ledger.activePath.indexOf(ledger.cursorVersionId);
  const activeIds = new Set(ledger.activePath.slice(0, cursorIndex + 1));
  return ledger.turns
    .filter((turn) => activeIds.has(turn.anchorVersionId || turn.toVersionId))
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-ledger.maxTurns)
    .map((turn, index) => ({
      turn: index + 1,
      operation: turn.operation,
      userRequest: turn.request,
      assistantResponse: turn.assistantResponse,
      appliedTo: turn.scope === "card" ? ["card"] : clone(turn.targetIds),
      versionId: turn.anchorVersionId || turn.toVersionId,
      outcome: turn.outcome === "applied" ? "applied" : "no-op"
    }));
}

export function listCardAssistanceLedgerVersions(value) {
  const ledger = normalizedLedger(value);
  const active = new Set(ledger.activePath);
  return ledger.versions
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ id, parentId, sequence, fingerprint }) => ({
      id,
      parentId,
      sequence,
      fingerprint,
      active: active.has(id),
      current: id === ledger.cursorVersionId
    }));
}
