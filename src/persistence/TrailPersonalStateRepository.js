import { normalizePedagogicalCommentDraft } from "../domain/pedagogicalComment.js";
import {
  createEmptyProgressDocument,
  removeLessonProgressEntries,
  validateProgressDocument
} from "../storage/progressStore.js";
import { defaultUuidFactory, UUID_PATTERN } from "./relationalSchema.js";

export const TRAIL_PERSONAL_STATE_VERSION = 1;
export const TRAIL_PERSONAL_STATE_CACHE_CONTRACT =
  "aralearn.trail-personal-state-cache.v3";
export const TRAIL_PERSONAL_STATE_MAX_BYTES = 262_144;
export const TRAIL_PERSONAL_STATE_MAX_LESSON_PATHS = 10_000;
export const TRAIL_PERSONAL_STATE_MAX_CARD_PATHS = 100_000;
export const TRAIL_PERSONAL_STATE_MAX_OBSERVATION_PATHS = 10_000;
export const TRAIL_PERSONAL_STATE_MAX_ENTITY_ID_LENGTH = 240;

const STATE_FIELDS = new Set(["version", "progress", "reviewMarks", "observations"]);
const PROGRESS_FIELDS = new Set(["version", "lessons"]);
const LESSON_PROGRESS_FIELDS = new Set(["cursorCardId", "completedCardIds"]);
const OBSERVATION_FIELDS = new Set([
  "category", "body", "updatedAt", "commentId", "status", "response",
  "resolutionNote", "respondedAt", "resolvedAt", "correction"
]);
const OBSERVATION_WRITE_FIELDS = new Set(["category", "body", "updatedAt"]);
const OBSERVATION_CORRECTION_FIELDS = new Set(["requestId", "entityPath", "linkedAt"]);
const OBSERVATION_STATUSES = new Set(["open", "considered", "resolved", "incorporated"]);
const CACHE_FIELDS = new Set([
  "contract", "trailItemId", "userId", "revision", "state", "pending",
  "queuedOperations", "updatedAt"
]);
const PENDING_FIELDS = new Set([
  "mutationId", "baseRevision", "operations", "attempts", "createdAt", "lastAttemptAt"
]);
const OPERATION_FIELDS = new Set(["kind", "collection", "path", "value"]);
const OPERATION_COLLECTIONS = new Set([
  "progress.lessons", "reviewMarks", "observations"
]);
const MUTATION_MAX_OPERATIONS = 512;
const MUTATION_MAX_BYTES = 65_536;
const ISO_INSTANT_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u;
const RETRYABLE_ERROR_CODES = new Set([
  "request_timeout", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH",
  "EAI_AGAIN", "FETCH_FAILED"
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stateError(message, code = "trail_personal_state_invalid") {
  const error = new Error(message);
  error.name = "TrailPersonalStateError";
  error.code = code;
  return error;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw stateError(`${label} deve ser um objeto.`);
}

function assertKnownFields(value, allowed, label) {
  assertPlainObject(value, label);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) throw stateError(`${label}.${unknown} não pertence ao contrato.`);
}

function requiredUuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw stateError(`${label} inválido.`);
  return normalized;
}

function nonNegativeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw stateError(`${label} deve ser um inteiro não negativo.`);
  }
  return normalized;
}

function optionalInstant(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) {
    throw stateError(`${label} deve usar data ISO com fuso horário.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw stateError(`${label} deve usar uma data válida.`);
  }
  return parsed.toISOString();
}

function requiredInstant(value, label) {
  const normalized = optionalInstant(value, label);
  if (!normalized) throw stateError(`${label} é obrigatório.`);
  return normalized;
}

function normalizeEntityId(value, label = "Identidade") {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw stateError(`${label} deve ser uma string não vazia e sem espaços externos.`);
  }
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (value.length > TRAIL_PERSONAL_STATE_MAX_ENTITY_ID_LENGTH || hasControlCharacter) {
    throw stateError(`${label} excede o contrato seguro.`);
  }
  return value;
}

function normalizeMap(value, {
  label,
  limit,
  normalizeValue
}) {
  assertPlainObject(value, label);
  const entries = Object.entries(value);
  if (entries.length > limit) {
    throw stateError(`${label} excede ${limit} caminhos.`);
  }
  return Object.fromEntries(entries
    .map(([path, entry]) => [
      normalizeEntityId(path, `${label}.<id>`),
      normalizeValue(entry, `${label}[${JSON.stringify(path)}]`)
    ])
    .sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeLessonProgress(value, label) {
  assertKnownFields(value, LESSON_PROGRESS_FIELDS, label);
  if (!Array.isArray(value.completedCardIds)) {
    throw stateError(`${label}.completedCardIds deve ser uma lista.`);
  }
  if (value.completedCardIds.length > 10_000) {
    throw stateError(`${label}.completedCardIds excede 10000 cards.`);
  }
  const completedCardIds = value.completedCardIds.map((cardId, index) => {
    const normalized = String(cardId || "").trim();
    if (!normalized || normalized !== cardId || normalized.length > 240) {
      throw stateError(`${label}.completedCardIds[${index}] é inválido.`);
    }
    return normalized;
  });
  if (new Set(completedCardIds).size !== completedCardIds.length) {
    throw stateError(`${label}.completedCardIds não aceita identidades repetidas.`);
  }
  const cursorCardId = value.cursorCardId === null || value.cursorCardId === undefined
    ? ""
    : String(value.cursorCardId).trim();
  if (cursorCardId &&
      (cursorCardId !== value.cursorCardId || cursorCardId.length > 240)) {
    throw stateError(`${label}.cursorCardId é inválido.`);
  }
  if (cursorCardId && !completedCardIds.includes(cursorCardId)) {
    throw stateError(`${label}.cursorCardId deve pertencer a completedCardIds.`);
  }
  return {
    ...(cursorCardId ? { cursorCardId } : {}),
    completedCardIds
  };
}

function assertUniqueCompletedCardsByLesson(lessons) {
  const lessonIdByCardId = new Map();
  for (const [lessonId, progress] of Object.entries(lessons)) {
    for (const cardId of progress.completedCardIds) {
      const firstLessonId = lessonIdByCardId.get(cardId);
      if (firstLessonId && firstLessonId !== lessonId) {
        throw stateError(
          `Estado pessoal.progress.lessons repete o card "${cardId}" nas lições ` +
          `"${firstLessonId}" e "${lessonId}".`
        );
      }
      lessonIdByCardId.set(cardId, lessonId);
    }
  }
}

function optionalText(value, label, limit) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim() || value.length > limit) {
    throw stateError(`${label} deve ser texto não vazio de até ${limit} caracteres.`);
  }
  return value.trim();
}

function normalizeObservationCorrection(value, label) {
  if (value === null || value === undefined) return null;
  assertKnownFields(value, OBSERVATION_CORRECTION_FIELDS, label);
  const requestId = optionalText(value.requestId, `${label}.requestId`, 128);
  if (!requestId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId)) {
    throw stateError(`${label}.requestId é inválido.`);
  }
  if (!Array.isArray(value.entityPath) ||
      value.entityPath.length < 1 || value.entityPath.length > 5) {
    throw stateError(`${label}.entityPath deve conter de uma a cinco identidades.`);
  }
  const entityPath = value.entityPath.map((segment, index) => {
    const normalized = String(segment || "").trim();
    if (!normalized || normalized !== segment || normalized.length > 240) {
      throw stateError(`${label}.entityPath[${index}] é inválido.`);
    }
    return normalized;
  });
  return {
    requestId,
    entityPath,
    linkedAt: requiredInstant(value.linkedAt, `${label}.linkedAt`)
  };
}

function normalizeObservation(value, label, { writable = false } = {}) {
  assertKnownFields(value, writable ? OBSERVATION_WRITE_FIELDS : OBSERVATION_FIELDS, label);
  const draft = normalizePedagogicalCommentDraft(value);
  const normalized = {
    category: draft.category,
    body: draft.body,
    updatedAt: requiredInstant(value.updatedAt, `${label}.updatedAt`)
  };
  if (writable) return normalized;
  if (value.commentId !== null && value.commentId !== undefined) {
    normalized.commentId = requiredUuid(value.commentId, `${label}.commentId`);
  }
  if (value.status !== null && value.status !== undefined) {
    if (!OBSERVATION_STATUSES.has(value.status)) {
      throw stateError(`${label}.status é inválido.`);
    }
    normalized.status = value.status;
  }
  const response = optionalText(value.response, `${label}.response`, 2_000);
  if (response) normalized.response = response;
  const resolutionNote = optionalText(
    value.resolutionNote,
    `${label}.resolutionNote`,
    1_000
  );
  if (resolutionNote) normalized.resolutionNote = resolutionNote;
  const respondedAt = optionalInstant(value.respondedAt, `${label}.respondedAt`);
  if (respondedAt) normalized.respondedAt = respondedAt;
  const resolvedAt = optionalInstant(value.resolvedAt, `${label}.resolvedAt`);
  if (resolvedAt) normalized.resolvedAt = resolvedAt;
  const correction = normalizeObservationCorrection(value.correction, `${label}.correction`);
  if (correction) normalized.correction = correction;
  return normalized;
}

function observationWriteValue(value) {
  return {
    category: value.category,
    body: value.body,
    updatedAt: value.updatedAt
  };
}

function jsonByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function createEmptyTrailPersonalState() {
  return {
    version: TRAIL_PERSONAL_STATE_VERSION,
    progress: { version: 3, lessons: {} },
    reviewMarks: {},
    observations: {}
  };
}

export function validateTrailPersonalState(value) {
  assertKnownFields(value, STATE_FIELDS, "Estado pessoal");
  if (value.version !== TRAIL_PERSONAL_STATE_VERSION) {
    throw stateError(`Estado pessoal.version deve ser ${TRAIL_PERSONAL_STATE_VERSION}.`);
  }
  assertKnownFields(value.progress, PROGRESS_FIELDS, "Estado pessoal.progress");
  if (value.progress.version !== 3) {
    throw stateError("Estado pessoal.progress.version deve ser 3.");
  }
  const lessons = normalizeMap(value.progress.lessons, {
    label: "Estado pessoal.progress.lessons",
    limit: TRAIL_PERSONAL_STATE_MAX_LESSON_PATHS,
    normalizeValue: normalizeLessonProgress
  });
  assertUniqueCompletedCardsByLesson(lessons);
  const normalized = {
    version: TRAIL_PERSONAL_STATE_VERSION,
    progress: {
      version: 3,
      lessons
    },
    reviewMarks: normalizeMap(value.reviewMarks, {
      label: "Estado pessoal.reviewMarks",
      limit: TRAIL_PERSONAL_STATE_MAX_CARD_PATHS,
      normalizeValue: requiredInstant
    }),
    observations: normalizeMap(value.observations, {
      label: "Estado pessoal.observations",
      limit: TRAIL_PERSONAL_STATE_MAX_OBSERVATION_PATHS,
      normalizeValue: normalizeObservation
    })
  };
  const canonicalBudget = {
    ...normalized,
    observations: Object.fromEntries(Object.entries(normalized.observations)
      .map(([path, observation]) => [path, observationWriteValue(observation)]))
  };
  if (jsonByteLength(canonicalBudget) > TRAIL_PERSONAL_STATE_MAX_BYTES) {
    throw stateError("O estado pessoal excede 256 KiB.", "trail_personal_state_too_large");
  }
  return normalized;
}

function referenceSegments(reference, expectedLength, label) {
  const source = Array.isArray(reference)
    ? reference
    : Array.isArray(reference?.entityPath)
      ? reference.entityPath
      : expectedLength === 3
        ? [reference?.courseKey, reference?.moduleKey, reference?.lessonKey]
        : [
            reference?.courseKey,
            reference?.moduleKey,
            reference?.lessonKey,
            reference?.microsequenceKey,
            reference?.cardKey
          ];
  if (source.length !== expectedLength) throw stateError(`${label} está incompleto.`);
  return source.map((segment, index) => {
    return normalizeEntityId(String(segment || ""), `${label}[${index}]`);
  });
}

function cardIdFromReference(reference) {
  return referenceSegments(reference, 5, "Caminho do card")[4];
}

function normalizeOperationValue(collection, value, label) {
  if (collection === "progress.lessons") return normalizeLessonProgress(value, label);
  if (collection === "reviewMarks") return requiredInstant(value, label);
  return normalizeObservation(value, label, { writable: true });
}

function normalizeOperation(value, index = 0) {
  const label = `Pendência.operations[${index}]`;
  assertKnownFields(value, OPERATION_FIELDS, label);
  if (value.kind !== "set" && value.kind !== "delete") {
    throw stateError(`${label}.kind é inválido.`);
  }
  if (!OPERATION_COLLECTIONS.has(value.collection)) {
    throw stateError(`${label}.collection é inválido.`);
  }
  const normalized = {
    kind: value.kind,
    collection: value.collection,
    path: normalizeEntityId(value.path, `${label}.path`)
  };
  if (value.kind === "set") {
    if (!("value" in value)) throw stateError(`${label}.value é obrigatório.`);
    normalized.value = normalizeOperationValue(
      value.collection,
      value.value,
      `${label}.value`
    );
  } else if ("value" in value) {
    throw stateError(`${label}.value não é aceito em uma exclusão.`);
  }
  return normalized;
}

function normalizePending(value) {
  if (value === null) return null;
  assertKnownFields(value, PENDING_FIELDS, "Pendência");
  if (!Array.isArray(value.operations) || !value.operations.length) {
    throw stateError("Pendência.operations deve conter alterações.");
  }
  const operations = value.operations.map(normalizeOperation);
  if (operations.length > MUTATION_MAX_OPERATIONS ||
      operationPayloadBytes(operations) > MUTATION_MAX_BYTES) {
    throw stateError("Pendência.operations excede o lote remoto permitido.");
  }
  return {
    mutationId: requiredUuid(value.mutationId, "Pendência.mutationId"),
    baseRevision: nonNegativeInteger(value.baseRevision, "Pendência.baseRevision"),
    operations,
    attempts: nonNegativeInteger(value.attempts, "Pendência.attempts"),
    createdAt: requiredInstant(value.createdAt, "Pendência.createdAt"),
    ...(value.lastAttemptAt
      ? { lastAttemptAt: requiredInstant(value.lastAttemptAt, "Pendência.lastAttemptAt") }
      : {})
  };
}

function normalizeCacheRecord(value, trailItemId, userId) {
  assertKnownFields(value, CACHE_FIELDS, "Cache pessoal");
  if (value.contract !== TRAIL_PERSONAL_STATE_CACHE_CONTRACT) {
    throw stateError("O cache pessoal não segue o contrato atual.");
  }
  if (requiredUuid(value.trailItemId, "Cache pessoal.trailItemId") !== trailItemId ||
      requiredUuid(value.userId, "Cache pessoal.userId") !== userId) {
    throw stateError("O cache pessoal pertence a outro item ou usuário.");
  }
  const pending = normalizePending(value.pending);
  const queuedOperations = normalizeOperationList(
    value.queuedOperations,
    "Cache pessoal.queuedOperations"
  );
  if (!pending && queuedOperations.length) {
    throw stateError("Cache pessoal possui fila sem mutação ativa.");
  }
  return {
    contract: TRAIL_PERSONAL_STATE_CACHE_CONTRACT,
    trailItemId,
    userId,
    revision: nonNegativeInteger(value.revision, "Cache pessoal.revision"),
    state: validateTrailPersonalState(value.state),
    pending,
    queuedOperations,
    updatedAt: requiredInstant(value.updatedAt, "Cache pessoal.updatedAt")
  };
}

function normalizeRemoteEnvelope(value, trailItemId) {
  if (value === null || value === undefined) {
    return { trailItemId, revision: 0, state: createEmptyTrailPersonalState(), updatedAt: null };
  }
  assertPlainObject(value, "Resposta do estado pessoal");
  const allowed = new Set(["trailItemId", "revision", "state", "updatedAt", "idempotent"]);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) throw stateError(`Resposta do estado pessoal.${unknown} não pertence ao contrato.`);
  if (requiredUuid(value.trailItemId, "Resposta do estado pessoal.trailItemId") !== trailItemId) {
    throw stateError("O servidor devolveu estado de outro item.");
  }
  const revision = nonNegativeInteger(value.revision, "Resposta do estado pessoal.revision");
  if (revision === 0) throw stateError("Uma linha remota precisa ter revisão positiva.");
  if ("idempotent" in value && typeof value.idempotent !== "boolean") {
    throw stateError("Resposta do estado pessoal.idempotent deve ser booleana.");
  }
  return {
    trailItemId,
    revision,
    state: validateTrailPersonalState(value.state),
    updatedAt: requiredInstant(value.updatedAt, "Resposta do estado pessoal.updatedAt"),
    ...(value.idempotent === true ? { idempotent: true } : {})
  };
}

function normalizeRemoteMutationResult(value, trailItemId, expectedRevision) {
  assertPlainObject(value, "Resposta da mutação pessoal");
  const allowed = new Set(["trailItemId", "revision", "updatedAt", "idempotent"]);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) {
    throw stateError(
      `Resposta da mutação pessoal.${unknown} não pertence ao contrato.`
    );
  }
  if (requiredUuid(value.trailItemId, "Resposta da mutação pessoal.trailItemId") !== trailItemId) {
    throw stateError("O servidor confirmou estado de outro item.");
  }
  const revision = nonNegativeInteger(
    value.revision,
    "Resposta da mutação pessoal.revision"
  );
  if (typeof value.idempotent !== "boolean") {
    throw stateError("Resposta da mutação pessoal.idempotent deve ser booleana.");
  }
  if (revision <= expectedRevision ||
      (value.idempotent === false && revision !== expectedRevision + 1)) {
    throw stateError("O servidor confirmou uma revisão pessoal incoerente.");
  }
  return {
    trailItemId,
    revision,
    updatedAt: requiredInstant(
      value.updatedAt,
      "Resposta da mutação pessoal.updatedAt"
    ),
    idempotent: value.idempotent
  };
}

function stateCollection(state, collection) {
  if (collection === "progress.lessons") return state.progress.lessons;
  return state[collection];
}

function applyOperations(state, operations) {
  const next = validateTrailPersonalState(state);
  operations.forEach((operation, index) => {
    const normalized = normalizeOperation(operation, index);
    const target = stateCollection(next, normalized.collection);
    if (normalized.kind === "delete") delete target[normalized.path];
    else target[normalized.path] = clone(normalized.value);
  });
  return validateTrailPersonalState(next);
}

function normalizeOperationList(value, label = "Operações") {
  if (!Array.isArray(value)) throw stateError(`${label} deve ser uma lista.`);
  return value.map((operation, index) => normalizeOperation(operation, index));
}

function operationPayloadBytes(operations) {
  return new TextEncoder().encode(JSON.stringify(operations)).byteLength;
}

function splitMutationOperations(operations) {
  const normalized = normalizeOperationList(operations);
  if (!normalized.length) return { batch: [], remaining: [] };
  const batch = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const candidate = [...batch, normalized[index]];
    if (candidate.length > MUTATION_MAX_OPERATIONS ||
        operationPayloadBytes(candidate) > MUTATION_MAX_BYTES) {
      if (!batch.length) {
        throw stateError(
          "Uma alteração pessoal excede 64 KiB.",
          "trail_personal_operation_too_large"
        );
      }
      return { batch, remaining: normalized.slice(index) };
    }
    batch.push(normalized[index]);
  }
  return { batch, remaining: [] };
}

function operationKey(operation) {
  return `${operation.collection}\u0000${operation.path}`;
}

function mergeOperations(current, additions) {
  const merged = new Map(current.map((operation) => [operationKey(operation), operation]));
  additions.map(normalizeOperation).forEach((operation) => {
    merged.delete(operationKey(operation));
    merged.set(operationKey(operation), operation);
  });
  return [...merged.values()];
}

function mapDiff(collection, previous, next) {
  const paths = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...paths].flatMap((path) => {
    if (!(path in next)) return [{ kind: "delete", collection, path }];
    if (JSON.stringify(previous[path]) === JSON.stringify(next[path])) return [];
    return [{ kind: "set", collection, path, value: clone(next[path]) }];
  });
}

function statesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isConflictError(error) {
  return String(error?.code || "").toUpperCase() === "40001" || Number(error?.status) === 409;
}

function isAuthorityError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return error?.authRequired === true || status === 401 || status === 403 ||
    code === "42501" || code === "AUTH_REQUIRED";
}

function isRetryableError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return error?.retryable === true || status === 0 || status === 408 || status === 429 ||
    status >= 500 || RETRYABLE_ERROR_CODES.has(code) ||
    error?.name === "TypeError" || error?.name === "AbortError";
}

function nowIso(clock) {
  const value = clock();
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw stateError("O relógio local é inválido.");
  return parsed.toISOString();
}

function entityKey(value, label = "Entidade") {
  return normalizeEntityId(String(value?.id || value?.contractKey || ""), `${label}.id`);
}

function courseIndex(course) {
  if (!isPlainObject(course)) {
    throw stateError("O adaptador de progresso exige um curso v4 carregado.");
  }
  const courseKey = entityKey(course, "Curso");
  const indexedLessons = [];
  const lessonIds = new Set();
  const cardIds = new Set();
  for (const moduleValue of course.modules || []) {
    const moduleKey = entityKey(moduleValue, "Módulo");
    for (const lesson of moduleValue.lessons || []) {
      const lessonKey = entityKey(lesson, "Lição");
      if (lessonIds.has(lessonKey)) {
        throw stateError(`O curso repete a identidade de lição "${lessonKey}".`);
      }
      lessonIds.add(lessonKey);
      const cards = [];
      for (const microsequence of lesson.microsequences || []) {
        const microsequenceKey = entityKey(microsequence, "Microssequência");
        for (const card of microsequence.cards || []) {
          const cardKey = entityKey(card, "Card");
          if (cardIds.has(cardKey)) {
            throw stateError(`O curso repete a identidade de card "${cardKey}".`);
          }
          cardIds.add(cardKey);
          cards.push({
            card,
            cardKey,
            microsequence,
            microsequenceKey
          });
        }
      }
      indexedLessons.push({
        course,
        moduleValue,
        lesson,
        courseKey,
        moduleKey,
        lessonKey,
        cards
      });
    }
  }
  return indexedLessons;
}

function canonicalProgressFromEditor(progressDocument, course, indexedLessons = courseIndex(course)) {
  const progress = validateProgressDocument(progressDocument);
  const byEditorPath = new Map(indexedLessons.map((entry) => [
    `${entry.courseKey}::${entry.moduleKey}::${entry.lessonKey}`,
    entry
  ]));
  const canonical = { version: 3, lessons: {} };
  for (const [path, entry] of Object.entries(progress.lessons)) {
    const indexed = byEditorPath.get(path);
    if (!indexed) throw stateError(`Não foi possível resolver a lição do progresso: "${path}".`);
    const cardsByKey = new Map(indexed.cards.map((item) => [item.cardKey, item]));
    entry.completedCardKeys.forEach((cardKey) => {
      if (!cardsByKey.has(cardKey)) {
        throw stateError(`Não foi possível resolver o card do progresso: "${cardKey}".`);
      }
    });
    canonical.lessons[indexed.lessonKey] = {
      ...(entry.completedCardKeys[entry.cursor]
        ? { cursorCardId: entry.completedCardKeys[entry.cursor] }
        : {}),
      completedCardIds: [...entry.completedCardKeys]
    };
  }
  return canonical;
}

function editorProgressFromCanonical(canonicalProgress, course, indexedLessons = courseIndex(course)) {
  const result = createEmptyProgressDocument();
  const completedCardIds = new Set(Object.values(canonicalProgress.lessons)
    .flatMap((entry) => entry.completedCardIds));
  for (const indexed of indexedLessons) {
    let contiguous = 0;
    while (contiguous < indexed.cards.length &&
           completedCardIds.has(indexed.cards[contiguous].cardKey)) {
      contiguous += 1;
    }
    if (contiguous <= 0) continue;
    result.lessons[`${indexed.courseKey}::${indexed.moduleKey}::${indexed.lessonKey}`] = {
      cursor: contiguous - 1,
      completedCardKeys: indexed.cards.slice(0, contiguous).map((card) => card.cardKey)
    };
  }
  return validateProgressDocument(result);
}

function cardProgressLocation(reference) {
  const segments = referenceSegments(reference, 5, "Caminho do card");
  return {
    lessonId: segments[2],
    cardId: segments[4]
  };
}

function courseCardDetails(course, cardId) {
  if (!course) return null;
  for (const lesson of courseIndex(course)) {
    const card = lesson.cards.find((candidate) => candidate.cardKey === cardId);
    if (!card) continue;
    return {
      cardId: card.cardKey,
      title: card.card?.title || card.cardKey,
      context: `${course.title || lesson.courseKey} · ${lesson.lesson.title || lesson.lessonKey}`,
      entityPath: [
        lesson.courseKey,
        lesson.moduleKey,
        lesson.lessonKey,
        card.microsequenceKey,
        card.cardKey
      ]
    };
  }
  return null;
}

export function trailPersonalStateCacheKey(userId, trailItemId) {
  return `trail.personalState:${requiredUuid(userId, "Usuário")}:${requiredUuid(trailItemId, "Item de Trilhas")}`;
}

export class TrailPersonalStateRepository {
  #queue = Promise.resolve();
  #initializing = null;
  #initialized = false;
  #record = null;
  #cacheKey = "";
  #course = null;
  #indexedLessons = [];
  #progressViewCache = null;
  #progressViewCacheSource = null;
  #localGeneration = 0;

  constructor({
    trailItemId,
    store,
    remoteCatalog,
    course = null,
    clock = () => new Date(),
    uuidFactory = defaultUuidFactory
  } = {}) {
    this.trailItemId = requiredUuid(trailItemId, "Item de Trilhas");
    this.remoteCatalog = remoteCatalog;
    this.store = store || remoteCatalog?.authClient?.sessionStore;
    if (!remoteCatalog ||
        typeof remoteCatalog.requireAuthenticatedUserId !== "function" ||
        typeof remoteCatalog.loadTrailPersonalState !== "function" ||
        typeof remoteCatalog.mutateTrailPersonalState !== "function") {
      throw new TypeError("Catálogo remoto de Trilhas obrigatório.");
    }
    if (!this.store || typeof this.store.getSyncState !== "function" ||
        typeof this.store.putSyncState !== "function") {
      throw new TypeError("Cache IndexedDB com syncState obrigatório.");
    }
    if (typeof clock !== "function" || typeof uuidFactory !== "function") {
      throw new TypeError("Relógio e gerador de identidade são obrigatórios.");
    }
    this.clock = clock;
    this.uuidFactory = uuidFactory;
    if (course) this.setCourse(course);
  }

  setCourse(course) {
    this.#indexedLessons = courseIndex(course);
    this.#course = course;
    this.#progressViewCache = null;
    this.#progressViewCacheSource = null;
    return this;
  }

  #assertInitialized() {
    if (!this.#initialized || !this.#record) {
      throw stateError("Inicialize o estado pessoal antes de usá-lo.", "trail_personal_state_not_initialized");
    }
  }

  #newRecord(userId) {
    return {
      contract: TRAIL_PERSONAL_STATE_CACHE_CONTRACT,
      trailItemId: this.trailItemId,
      userId,
      revision: 0,
      state: createEmptyTrailPersonalState(),
      pending: null,
      queuedOperations: [],
      updatedAt: nowIso(this.clock)
    };
  }

  async initialize({ refresh = true } = {}) {
    if (this.#initializing) return this.#initializing;
    if (this.#initialized) {
      if (refresh) await this.refresh();
      return this.snapshot();
    }
    this.#initializing = (async () => {
      const userId = requiredUuid(
        await this.remoteCatalog.requireAuthenticatedUserId(),
        "Usuário autenticado"
      );
      this.#cacheKey = trailPersonalStateCacheKey(userId, this.trailItemId);
      const cached = await this.store.getSyncState(this.#cacheKey);
      if (cached) {
        try {
          this.#record = normalizeCacheRecord(cached, this.trailItemId, userId);
        } catch {
          await this.store.putSyncState(this.#cacheKey, null);
        }
      }
      this.#record ||= this.#newRecord(userId);
      this.#initialized = true;
      if (refresh) await this.#refreshUnlocked();
      return this.snapshot();
    })();
    try {
      return await this.#initializing;
    } finally {
      this.#initializing = null;
    }
  }

  snapshot() {
    this.#assertInitialized();
    return clone({
      trailItemId: this.trailItemId,
      revision: this.#record.revision,
      state: this.#record.state,
      pending: Boolean(
        this.#record.pending || this.#record.queuedOperations.length
      )
    });
  }

  loadCanonicalState() {
    this.#assertInitialized();
    return clone(this.#record.state);
  }

  loadProgress() {
    this.#assertInitialized();
    if (!this.#course) throw stateError("Carregue o curso antes de ler o progresso do editor.");
    if (this.#progressViewCacheSource !== this.#record.state.progress) {
      this.#progressViewCache = editorProgressFromCanonical(
        this.#record.state.progress,
        this.#course,
        this.#indexedLessons
      );
      this.#progressViewCacheSource = this.#record.state.progress;
    }
    return clone(this.#progressViewCache);
  }

  saveProgress(progressDocument) {
    this.#assertInitialized();
    if (!this.#course) throw stateError("Carregue o curso antes de salvar o progresso do editor.");
    const next = canonicalProgressFromEditor(progressDocument, this.#course, this.#indexedLessons);
    return this.#mutate([
      ...mapDiff("progress.lessons", this.#record.state.progress.lessons, next.lessons)
    ]).then(() => this.loadProgress());
  }

  saveProgressLocally(progressDocument) {
    this.#assertInitialized();
    if (!this.#course) throw stateError("Carregue o curso antes de salvar o progresso do editor.");
    const next = canonicalProgressFromEditor(progressDocument, this.#course, this.#indexedLessons);
    return this.#mutate([
      ...mapDiff("progress.lessons", this.#record.state.progress.lessons, next.lessons)
    ], { synchronize: false }).then(() => this.loadProgress());
  }

  removeProgressEntries(lessonReferences) {
    this.#assertInitialized();
    return this.saveProgress(removeLessonProgressEntries(this.loadProgress(), lessonReferences));
  }

  clearProgress() {
    this.#assertInitialized();
    return this.saveProgress(createEmptyProgressDocument());
  }

  isCardCompleted(reference) {
    this.#assertInitialized();
    const { cardId } = cardProgressLocation(reference);
    return Object.values(this.#record.state.progress.lessons).some((entry) =>
      entry.completedCardIds.includes(cardId)
    );
  }

  setCardCompleted(reference, completed = true) {
    this.#assertInitialized();
    const { lessonId, cardId } = cardProgressLocation(reference);
    const currentLessons = this.#record.state.progress.lessons;
    const nextLessons = clone(currentLessons);
    for (const [currentLessonId, entry] of Object.entries(nextLessons)) {
      if (!entry.completedCardIds.includes(cardId)) continue;
      const completedCardIds = entry.completedCardIds.filter((id) => id !== cardId);
      if (!completedCardIds.length) {
        delete nextLessons[currentLessonId];
        continue;
      }
      nextLessons[currentLessonId] = {
        cursorCardId: entry.cursorCardId && completedCardIds.includes(entry.cursorCardId)
          ? entry.cursorCardId
          : completedCardIds.at(-1),
        completedCardIds
      };
    }
    if (completed === true) {
      const target = nextLessons[lessonId] || { completedCardIds: [] };
      nextLessons[lessonId] = {
        cursorCardId: cardId,
        completedCardIds: [...target.completedCardIds, cardId]
      };
    }
    return this.#mutate(mapDiff("progress.lessons", currentLessons, nextLessons));
  }

  isCardMarkedForReview(reference) {
    this.#assertInitialized();
    return Boolean(this.#record.state.reviewMarks[cardIdFromReference(reference)]);
  }

  setCardReviewMark(reference, marked) {
    this.#assertInitialized();
    const path = cardIdFromReference(reference);
    return this.#mutate([marked === true
      ? { kind: "set", collection: "reviewMarks", path, value: nowIso(this.clock) }
      : { kind: "delete", collection: "reviewMarks", path }]);
  }

  loadReviewItems() {
    this.#assertInitialized();
    return Object.entries(this.#record.state.reviewMarks).map(([cardId, reviewMarkedAt]) => {
      const details = courseCardDetails(this.#course, cardId);
      return {
        cardId,
        title: details?.title || cardId,
        context: details?.context || "Trilhas",
        reviewMarkedAt,
        entityPath: details?.entityPath || [cardId]
      };
    }).sort((left, right) =>
      String(right.reviewMarkedAt).localeCompare(String(left.reviewMarkedAt)) ||
      String(left.title).localeCompare(String(right.title), "pt-BR")
    );
  }

  loadCommentForPath(reference) {
    this.#assertInitialized();
    const path = cardIdFromReference(reference);
    const value = this.#record.state.observations[path];
    return value ? clone({
      id: value.commentId || path,
      commentId: value.commentId || path,
      status: value.status || "open",
      ...value
    }) : null;
  }

  saveCommentForPath(reference, draft) {
    this.#assertInitialized();
    const path = cardIdFromReference(reference);
    const normalized = normalizePedagogicalCommentDraft(draft);
    const value = { ...normalized, updatedAt: nowIso(this.clock) };
    return this.#mutate([
      { kind: "set", collection: "observations", path, value }
    ]).then(() => clone({ id: path, commentId: path, status: "open", ...value }));
  }

  deleteCommentForPath(reference) {
    this.#assertInitialized();
    const path = cardIdFromReference(reference);
    const previous = this.#record.state.observations[path];
    if (!previous) return Promise.resolve(null);
    return this.#mutate([
      { kind: "delete", collection: "observations", path }
    ]).then(() => clone({
      id: previous.commentId || path,
      commentId: previous.commentId || path,
      status: previous.status || "open",
      ...previous
    }));
  }

  loadPersonalObservationItems() {
    this.#assertInitialized();
    return Object.entries(this.#record.state.observations).map(([cardId, observation]) => {
      const details = courseCardDetails(this.#course, cardId);
      return {
        commentId: observation.commentId || cardId,
        cardId,
        title: details?.title || cardId,
        context: details?.context || "Trilhas",
        ...clone(observation),
        entityPath: details?.entityPath || [cardId]
      };
    }).sort((left, right) =>
      String(right.updatedAt).localeCompare(String(left.updatedAt)) ||
      String(left.title).localeCompare(String(right.title), "pt-BR")
    );
  }

  refresh() {
    this.#assertInitialized();
    return this.#enqueue(() => this.#refreshUnlocked());
  }

  flush() {
    this.#assertInitialized();
    return this.#enqueue(() => this.#flushUnlocked());
  }

  clearLocal() {
    if (!this.#initialized || !this.#record) return Promise.resolve(false);
    return this.#enqueue(async () => {
      await this.store.putSyncState(this.#cacheKey, null);
      this.#record = null;
      this.#cacheKey = "";
      this.#initialized = false;
      return true;
    });
  }

  #enqueue(operation) {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.catch(() => undefined);
    return result;
  }

  async #persist() {
    this.#record.updatedAt = nowIso(this.clock);
    await this.store.putSyncState(this.#cacheKey, clone(this.#record));
  }

  async #clearForAuthorityFailure() {
    await this.store.putSyncState(this.#cacheKey, null);
    this.#record = null;
    this.#initialized = false;
  }

  async #refreshUnlocked() {
    let remote;
    try {
      remote = normalizeRemoteEnvelope(
        await this.remoteCatalog.loadTrailPersonalState(this.trailItemId),
        this.trailItemId
      );
    } catch (error) {
      if (isAuthorityError(error)) {
        await this.#clearForAuthorityFailure();
        throw error;
      }
      if (isRetryableError(error)) {
        await this.#persist();
        return this.snapshot();
      }
      throw error;
    }
    const pending = this.#record.pending;
    if (!pending) {
      this.#record.revision = remote.revision;
      this.#record.state = remote.state;
      this.#record.queuedOperations = [];
      await this.#persist();
      return this.snapshot();
    }
    const withPending = applyOperations(remote.state, pending.operations);
    if (statesEqual(withPending, remote.state)) {
      this.#record.revision = remote.revision;
      this.#record.state = remote.state;
      this.#record.pending = null;
      this.#promoteQueued(remote.revision, remote.state);
      await this.#persist();
      if (!this.#record.pending) return this.snapshot();
    } else {
      this.#record.revision = remote.revision;
      this.#record.state = applyOperations(
        withPending,
        this.#record.queuedOperations
      );
      await this.#persist();
    }
    await this.#flushUnlocked();
    return this.snapshot();
  }

  #mutate(operations, { synchronize = true } = {}) {
    const normalizedOperations = operations.map(normalizeOperation);
    if (!normalizedOperations.length) return Promise.resolve(this.snapshot());
    const before = clone(this.#record);
    const now = nowIso(this.clock);
    this.#record.state = applyOperations(this.#record.state, normalizedOperations);
    if (this.#record.pending) {
      if (this.#record.pending.attempts === 0 &&
          this.#record.queuedOperations.length === 0) {
        const merged = mergeOperations(
          this.#record.pending.operations,
          normalizedOperations
        );
        const { batch, remaining } = splitMutationOperations(merged);
        this.#record.pending.operations = batch;
        this.#record.queuedOperations = remaining;
      } else {
        this.#record.queuedOperations = mergeOperations(
          this.#record.queuedOperations,
          normalizedOperations
        );
      }
    } else {
      this.#startPending(normalizedOperations, this.#record.revision, now);
    }
    const generation = ++this.#localGeneration;
    return this.#enqueue(async () => {
      await this.#persist();
      if (!synchronize) return this.snapshot();
      try {
        await this.#flushUnlocked();
      } catch (error) {
        if (isAuthorityError(error)) {
          if (this.#record) await this.#clearForAuthorityFailure();
          throw error;
        }
        if (this.#localGeneration === generation) {
          this.#record = before;
          await this.#persist();
        }
        throw error;
      }
      return this.snapshot();
    });
  }

  #startPending(operations, baseRevision, createdAt = nowIso(this.clock)) {
    const { batch, remaining } = splitMutationOperations(operations);
    if (!batch.length) {
      this.#record.pending = null;
      this.#record.queuedOperations = [];
      return;
    }
    this.#record.pending = {
      mutationId: requiredUuid(this.uuidFactory(), "Identidade da alteração"),
      baseRevision,
      operations: batch,
      attempts: 0,
      createdAt
    };
    this.#record.queuedOperations = remaining;
  }

  #promoteQueued(baseRevision, remoteState = null) {
    const queued = this.#record.queuedOperations;
    this.#record.queuedOperations = [];
    if (remoteState) {
      const rebased = applyOperations(remoteState, queued);
      this.#record.state = rebased;
      if (statesEqual(rebased, remoteState)) {
        this.#record.pending = null;
        return;
      }
    }
    if (!queued.length) {
      this.#record.pending = null;
      return;
    }
    this.#startPending(queued, baseRevision);
  }

  async #acknowledgeMutation(result) {
    this.#record.revision = result.revision;
    this.#record.pending = null;
    if (result.idempotent) {
      try {
        const remote = normalizeRemoteEnvelope(
          await this.remoteCatalog.loadTrailPersonalState(this.trailItemId),
          this.trailItemId
        );
        this.#record.revision = remote.revision;
        this.#promoteQueued(remote.revision, remote.state);
        return;
      } catch (error) {
        if (isAuthorityError(error)) {
          await this.#clearForAuthorityFailure();
          throw error;
        }
        if (!isRetryableError(error)) throw error;
      }
    }
    this.#promoteQueued(result.revision);
  }

  async #flushUnlocked() {
    while (this.#record.pending) {
      let batchConfirmed = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const pending = this.#record.pending;
        pending.attempts += 1;
        pending.lastAttemptAt = nowIso(this.clock);
        const expectedRevision = pending.baseRevision;
        const mutationId = pending.mutationId;
        const operations = clone(pending.operations);
        await this.#persist();
        try {
          const result = normalizeRemoteMutationResult(
            await this.remoteCatalog.mutateTrailPersonalState({
              trailItemId: this.trailItemId,
              expectedRevision,
              operations,
              mutationId
            }),
            this.trailItemId,
            expectedRevision
          );
          await this.#acknowledgeMutation(result);
          await this.#persist();
          batchConfirmed = true;
          break;
        } catch (error) {
          if (isAuthorityError(error)) {
            await this.#clearForAuthorityFailure();
            throw error;
          }
          if (isConflictError(error)) {
            let remote;
            try {
              remote = normalizeRemoteEnvelope(
                await this.remoteCatalog.loadTrailPersonalState(this.trailItemId),
                this.trailItemId
              );
            } catch (loadError) {
              if (isAuthorityError(loadError)) {
                await this.#clearForAuthorityFailure();
                throw loadError;
              }
              if (isRetryableError(loadError)) {
                await this.#persist();
                return this.snapshot();
              }
              throw loadError;
            }
            const withPending = applyOperations(remote.state, operations);
            this.#record.revision = remote.revision;
            if (statesEqual(withPending, remote.state)) {
              this.#record.pending = null;
              this.#promoteQueued(remote.revision, remote.state);
              batchConfirmed = true;
              await this.#persist();
              break;
            } else {
              const combined = mergeOperations(
                operations,
                this.#record.queuedOperations
              );
              this.#record.state = applyOperations(remote.state, combined);
              this.#record.pending = null;
              this.#record.queuedOperations = [];
              this.#startPending(combined, remote.revision);
            }
            await this.#persist();
            continue;
          }
          if (isRetryableError(error)) {
            if (attempt === 0) continue;
            await this.#persist();
            return this.snapshot();
          }
          throw error;
        }
      }
      if (!batchConfirmed && this.#record.pending?.attempts >= 2) {
        return this.snapshot();
      }
    }
    return this.snapshot();
  }
}
