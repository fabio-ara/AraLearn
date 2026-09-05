import {
  createEmptyProgressDocument,
  validateProgressDocument
} from "../storage/progressStore.js";
import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";

export const COURSE_PERSONAL_STATE_VERSION = 2;
export const COURSE_PERSONAL_STATE_CACHE_CONTRACT =
  "aralearn.course-personal-state-cache.v2";

const MAX_STATE_BYTES = 524_288;
const MAX_OPERATIONS = 512;
const MAX_OPERATION_BYTES = 65_536;
const COLLECTIONS = new Set(["progress.lessons", "reviewMarks"]);
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failure(message, code = "course_personal_state_invalid") {
  const error = new Error(message);
  error.name = "CoursePersonalStateError";
  error.code = code;
  return error;
}

function requiredUuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw failure(`${label} inválido.`);
  return normalized;
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
}

function entityId(value, label) {
  if (typeof value !== "string" || !value || value !== value.trim() ||
      [...value].length > 240 || new TextEncoder().encode(value).byteLength > 960 ||
      hasControlCharacters(value)) {
    throw failure(`${label} inválido.`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw failure(`${label} inválido.`);
  }
  return normalized;
}

function instant(value, label) {
  const match = typeof value === "string" ? RFC3339_INSTANT.exec(value) : null;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const daysInMonth = month >= 1 && month <= 12
    ? [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    : 0;
  if (!match || year < 1 || day < 1 || day > daysInMonth ||
      Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59 ||
      !Number.isFinite(Date.parse(value))) {
    throw failure(`${label} inválido.`);
  }
  return new Date(value).toISOString();
}

function nowIso(clock) {
  const value = clock();
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw failure("Relógio local inválido.");
  return parsed.toISOString();
}

function emptyState() {
  return {
    version: COURSE_PERSONAL_STATE_VERSION,
    progress: { version: 3, lessons: {} },
    reviewMarks: {}
  };
}

function normalizeLessonState(value, label) {
  if (!plainObject(value) || !Array.isArray(value.completedStudyUnitIds)) {
    throw failure(`${label} inválido.`);
  }
  const unknown = Object.keys(value).find(
    (field) => field !== "cursorStudyUnitId" && field !== "completedStudyUnitIds"
  );
  if (unknown) throw failure(`${label}.${unknown} não pertence ao contrato.`);
  const completedStudyUnitIds = value.completedStudyUnitIds.map((id, index) =>
    entityId(id, `${label}.completedStudyUnitIds[${index}]`));
  if (completedStudyUnitIds.length > 10_000 ||
      new Set(completedStudyUnitIds).size !== completedStudyUnitIds.length) {
    throw failure(`${label}.completedStudyUnitIds inválido.`);
  }
  if (!completedStudyUnitIds.length) {
    throw failure(`${label}.completedStudyUnitIds não pode ficar vazia.`);
  }
  const cursorStudyUnitId = value.cursorStudyUnitId == null
    ? null
    : entityId(value.cursorStudyUnitId, `${label}.cursorStudyUnitId`);
  if (!cursorStudyUnitId || !completedStudyUnitIds.includes(cursorStudyUnitId)) {
    throw failure(`${label}.cursorStudyUnitId não está concluído.`);
  }
  return {
    ...(cursorStudyUnitId ? { cursorStudyUnitId } : {}),
    completedStudyUnitIds
  };
}

function normalizeMap(value, label, maximum, normalizeValue) {
  if (!plainObject(value)) throw failure(`${label} inválido.`);
  const entries = Object.entries(value);
  if (entries.length > maximum) throw failure(`${label} excede o limite.`);
  return Object.fromEntries(entries.map(([key, entry]) => [
    entityId(key, `${label}.<id>`),
    normalizeValue(entry, `${label}[${JSON.stringify(key)}]`)
  ]).sort(([left], [right]) => left.localeCompare(right)));
}

export function validateCoursePersonalState(value) {
  if (!plainObject(value)) throw failure("Estado pessoal inválido.");
  const allowed = new Set(["version", "progress", "reviewMarks"]);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown || value.version !== COURSE_PERSONAL_STATE_VERSION ||
      !plainObject(value.progress) || value.progress.version !== 3 ||
      !plainObject(value.progress.lessons)) {
    throw failure("Estado pessoal não segue o contrato atual.");
  }
  const unknownProgress = Object.keys(value.progress).find(
    (field) => field !== "version" && field !== "lessons"
  );
  if (unknownProgress) throw failure(`Estado pessoal.progress.${unknownProgress} é desconhecido.`);
  const lessons = normalizeMap(
    value.progress.lessons,
    "Estado pessoal.progress.lessons",
    10_000,
    normalizeLessonState
  );
  const studyUnitOwners = new Map();
  for (const [lessonId, entry] of Object.entries(lessons)) {
    for (const studyUnitId of entry.completedStudyUnitIds) {
      if (studyUnitOwners.has(studyUnitId) && studyUnitOwners.get(studyUnitId) !== lessonId) {
        throw failure("Uma Unidade de estudo aparece concluída em duas Lições.");
      }
      studyUnitOwners.set(studyUnitId, lessonId);
    }
  }
  const normalized = {
    version: COURSE_PERSONAL_STATE_VERSION,
    progress: { version: 3, lessons },
    reviewMarks: normalizeMap(value.reviewMarks, "Estado pessoal.reviewMarks", 100_000, instant)
  };
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > MAX_STATE_BYTES) {
    throw failure("Estado pessoal excede 512 KiB.", "course_personal_state_too_large");
  }
  return normalized;
}

function normalizeOperation(value, index = 0) {
  if (!plainObject(value) || (value.kind !== "set" && value.kind !== "delete") ||
      !COLLECTIONS.has(value.collection)) {
    throw failure(`Operação ${index + 1} inválida.`);
  }
  const unknown = Object.keys(value).find(
    (field) => !new Set(["kind", "collection", "path", "value"]).has(field)
  );
  if (unknown || (value.kind === "delete" && Object.hasOwn(value, "value")) ||
      (value.kind === "set" && !Object.hasOwn(value, "value"))) {
    throw failure(`Operação ${index + 1} não segue o contrato.`);
  }
  const operation = {
    kind: value.kind,
    collection: value.collection,
    path: entityId(value.path, `Operação ${index + 1}.path`)
  };
  if (operation.kind === "set") {
    operation.value = operation.collection === "progress.lessons"
      ? normalizeLessonState(value.value, `Operação ${index + 1}.value`)
      : instant(value.value, `Operação ${index + 1}.value`);
  }
  return operation;
}

function normalizeOperations(values) {
  if (!Array.isArray(values)) throw failure("Operações inválidas.");
  const operations = values.map(normalizeOperation);
  if (operations.length > MAX_OPERATIONS ||
      new TextEncoder().encode(JSON.stringify(operations)).byteLength > MAX_OPERATION_BYTES) {
    throw failure("Lote de estado pessoal excede o limite.");
  }
  return operations;
}

function collection(state, name) {
  return name === "progress.lessons" ? state.progress.lessons : state[name];
}

function applyOperations(state, operations) {
  const next = validateCoursePersonalState(state);
  for (const operation of normalizeOperations(operations)) {
    const target = collection(next, operation.collection);
    if (operation.kind === "delete") delete target[operation.path];
    else target[operation.path] = clone(operation.value);
  }
  return validateCoursePersonalState(next);
}

function operationKey(operation) {
  return `${operation.collection}\u0000${operation.path}`;
}

function mergeOperations(current, additions) {
  const merged = new Map(current.map((operation) => [operationKey(operation), operation]));
  for (const operation of normalizeOperations(additions)) {
    merged.delete(operationKey(operation));
    merged.set(operationKey(operation), operation);
  }
  return [...merged.values()];
}

function mapDiff(name, previous, next) {
  const paths = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...paths].flatMap((path) => {
    if (!Object.hasOwn(next, path)) return [{ kind: "delete", collection: name, path }];
    if (JSON.stringify(previous[path]) === JSON.stringify(next[path])) return [];
    return [{ kind: "set", collection: name, path, value: clone(next[path]) }];
  });
}

function stateDiff(previous, next) {
  return normalizeOperations([
    ...mapDiff("progress.lessons", previous.progress.lessons, next.progress.lessons),
    ...mapDiff("reviewMarks", previous.reviewMarks, next.reviewMarks)
  ]);
}

function stateCounts(state) {
  return {
    completedCount: Object.values(state.progress.lessons).reduce((total, entry) =>
      total + entry.completedStudyUnitIds.length, 0),
    reviewCount: Object.keys(state.reviewMarks).length
  };
}

// Rebase semantic changes, not entire lesson snapshots. Independent completions
// in the same lesson must survive a revision conflict.
function rebaseState(base, local, remote, resolution = null) {
  const next = clone(remote);
  const paths = [];
  for (const operation of stateDiff(base, local)) {
    const name = operation.collection;
    const path = operation.path;
    const before = collection(base, name)[path];
    const wanted = collection(local, name)[path];
    const current = collection(remote, name)[path];
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    if (same(current, before) || same(current, wanted)) {
      if (wanted == null) delete collection(next, name)[path];
      else collection(next, name)[path] = clone(wanted);
      continue;
    }
    if (name === "progress.lessons") {
      const originalIds = new Set(before?.completedStudyUnitIds || []);
      const localIds = new Set(wanted?.completedStudyUnitIds || []);
      const ids = new Set(current?.completedStudyUnitIds || []);
      for (const id of originalIds) if (!localIds.has(id)) ids.delete(id);
      for (const id of localIds) if (!originalIds.has(id)) ids.add(id);
      if (!ids.size) delete next.progress.lessons[path];
      else next.progress.lessons[path] = {
        cursorStudyUnitId: ids.has(current?.cursorStudyUnitId)
          ? current.cursorStudyUnitId : ids.has(wanted?.cursorStudyUnitId)
            ? wanted.cursorStudyUnitId : [...ids].at(-1),
        completedStudyUnitIds: [...ids]
      };
      continue;
    }
    // Two marks agree on membership; preserve the newest timestamp. Removing
    // a mark that another device renewed needs an explicit decision.
    if (wanted != null && current != null) {
      next.reviewMarks[path] = wanted > current ? wanted : current;
      continue;
    }
    paths.push({ collection: name, path });
    if (resolution === "local") {
      if (wanted == null) delete collection(next, name)[path];
      else collection(next, name)[path] = clone(wanted);
    }
  }
  return { state: validateCoursePersonalState(next), paths };
}

export function mergeVisitorPersonalState(account, visitor) {
  const next = validateCoursePersonalState(account);
  const source = validateCoursePersonalState(visitor);
  const existing = new Set(Object.values(next.progress.lessons)
    .flatMap((entry) => entry.completedStudyUnitIds));
  for (const [lessonId, entry] of Object.entries(source.progress.lessons)) {
    const additions = entry.completedStudyUnitIds.filter((id) => !existing.has(id));
    if (!additions.length) continue;
    const current = next.progress.lessons[lessonId];
    next.progress.lessons[lessonId] = {
      cursorStudyUnitId: current?.cursorStudyUnitId ||
        (additions.includes(entry.cursorStudyUnitId) ? entry.cursorStudyUnitId : additions.at(-1)),
      completedStudyUnitIds: [...(current?.completedStudyUnitIds || []), ...additions]
    };
    for (const id of additions) existing.add(id);
  }
  for (const [id, markedAt] of Object.entries(source.reviewMarks)) {
    next.reviewMarks[id] ||= markedAt;
  }
  return validateCoursePersonalState(next);
}

function referenceSegments(reference, label) {
  const source = Array.isArray(reference)
    ? reference
    : Array.isArray(reference?.entityPath)
      ? reference.entityPath
      : [reference?.courseId, reference?.moduleId, reference?.lessonId,
          reference?.microsequenceId, reference?.studyUnitId];
  if (!Array.isArray(source) || source.length !== 5) {
    throw failure(`${label} incompleto.`);
  }
  return source.map((segment, index) => entityId(String(segment || ""), `${label}[${index}]`));
}

function courseIndex(course, courseId) {
  if (!plainObject(course) || entityId(course.id, "Curso.id") !== courseId) {
    throw failure("O documento carregado não corresponde ao Curso.");
  }
  const lessons = [];
  const lessonIds = new Set();
  const studyUnitIds = new Set();
  for (const moduleValue of course.modules || []) {
    const moduleId = entityId(moduleValue?.id, "Módulo.id");
    for (const lesson of moduleValue.lessons || []) {
      const lessonId = entityId(lesson?.id, "Lição.id");
      if (lessonIds.has(lessonId)) throw failure("O Curso repete uma Lição.");
      lessonIds.add(lessonId);
      const studyUnits = [];
      for (const microsequence of lesson.microsequences || []) {
        const microsequenceId = entityId(microsequence?.id, "Microssequência.id");
        for (const unit of microsequence.studyUnits || []) {
          const studyUnitId = entityId(unit?.id, "Unidade de estudo.id");
          if (studyUnitIds.has(studyUnitId)) throw failure("O Curso repete uma Unidade de estudo.");
          studyUnitIds.add(studyUnitId);
          studyUnits.push({ unit, studyUnitId, microsequenceId });
        }
      }
      lessons.push({
        course,
        moduleValue,
        lesson,
        courseId,
        moduleId,
        lessonId,
        studyUnits
      });
    }
  }
  return lessons;
}

function studyProgress(canonicalValue, indexedLessons) {
  const result = createEmptyProgressDocument();
  for (const indexed of indexedLessons) {
    const entry = canonicalValue.lessons[indexed.lessonId];
    if (!entry) continue;
    const allowed = new Set(indexed.studyUnits.map((unit) => unit.studyUnitId));
    const completedStudyUnitIds = entry.completedStudyUnitIds
      .filter((id) => allowed.has(id));
    if (!completedStudyUnitIds.length) continue;
    const cursorStudyUnitId = completedStudyUnitIds.includes(entry.cursorStudyUnitId)
      ? entry.cursorStudyUnitId
      : [...indexed.studyUnits].reverse()
        .find((unit) => completedStudyUnitIds.includes(unit.studyUnitId))?.studyUnitId;
    result.lessons[`${indexed.courseId}::${indexed.moduleId}::${indexed.lessonId}`] = {
      cursorStudyUnitId,
      completedStudyUnitIds
    };
  }
  return validateProgressDocument(result);
}

function studyUnitLocation(reference, indexedLessons) {
  const [courseId, moduleId, lessonId, microsequenceId, studyUnitId] =
    referenceSegments(reference, "Caminho da Unidade de estudo");
  const indexed = indexedLessons.find((entry) => entry.courseId === courseId &&
    entry.moduleId === moduleId && entry.lessonId === lessonId);
  const unit = indexed?.studyUnits.find((entry) =>
    entry.microsequenceId === microsequenceId && entry.studyUnitId === studyUnitId);
  if (!indexed || !unit) throw failure("Caminho da Unidade de estudo não existe no Curso.");
  return { courseId, moduleId, lessonId, microsequenceId, studyUnitId, indexed, unit };
}

function remainingLessonProgress(entry, removedIds, indexed) {
  const completedStudyUnitIds = entry.completedStudyUnitIds
    .filter((id) => !removedIds.has(id));
  if (!completedStudyUnitIds.length) return null;
  const cursorStudyUnitId = completedStudyUnitIds.includes(entry.cursorStudyUnitId)
    ? entry.cursorStudyUnitId
    : [...indexed.studyUnits].reverse()
      .find((unit) => completedStudyUnitIds.includes(unit.studyUnitId))?.studyUnitId ||
      completedStudyUnitIds.at(-1);
  return { cursorStudyUnitId, completedStudyUnitIds };
}

function studyUnitDetails(indexedLessons, studyUnitId) {
  for (const indexed of indexedLessons) {
    const candidate = indexed.studyUnits.find((unit) => unit.studyUnitId === studyUnitId);
    if (!candidate) continue;
    return {
      title: candidate.unit.title || studyUnitId,
      context: `${indexed.course.title || indexed.courseId} · ${indexed.lesson.title || indexed.lessonId}`,
      entityPath: [indexed.courseId, indexed.moduleId, indexed.lessonId,
        candidate.microsequenceId, studyUnitId]
    };
  }
  return null;
}

function retryable(error) {
  const statusValue = error?.status ?? error?.response?.status;
  const status = statusValue == null ? null : Number(statusValue);
  const code = String(error?.code || "").toUpperCase();
  return error?.authRequired !== true && (
    status === 0 || status === 408 || status === 429 || status >= 500 ||
    new Set(["REQUEST_TIMEOUT", "NETWORK_ERROR", "FETCH_FAILED", "ETIMEDOUT",
      "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"]).has(code) ||
    error?.name === "AbortError" ||
    (error?.name === "TypeError" && /fetch|network|load failed/iu.test(String(error.message || "")))
  );
}

function authorityFailure(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return error?.authRequired === true || status === 401 || status === 403 || status === 404 ||
    code === "42501" || code === "PT404" || code === "AUTH_REQUIRED";
}

function conflict(error) {
  return Number(error?.status || 0) === 409 ||
    String(error?.code || "").toUpperCase() === "40001";
}

function remoteEnvelope(value, courseId) {
  if (value == null) return { courseId, revision: 0, state: emptyState(), updatedAt: null };
  if (!plainObject(value) || value.contract !== "aralearn.course-personal-state.v2" ||
      requiredUuid(value.courseId, "Curso remoto") !== courseId) {
    throw failure("Resposta remota do estado pessoal inválida.");
  }
  const revision = nonNegativeInteger(value.revision, "Revisão remota");
  if (revision < 1) throw failure("Revisão remota inválida.");
  return {
    courseId,
    revision,
    state: validateCoursePersonalState(value.state),
    updatedAt: instant(value.updatedAt, "Atualização remota")
  };
}

function mutationResult(value, courseId, expectedRevision) {
  if (!plainObject(value) || requiredUuid(value.courseId, "Curso confirmado") !== courseId ||
      typeof value.idempotent !== "boolean") {
    throw failure("Confirmação remota do estado pessoal inválida.");
  }
  const revision = nonNegativeInteger(value.revision, "Revisão confirmada");
  if (revision <= expectedRevision || (!value.idempotent && revision !== expectedRevision + 1)) {
    throw failure("Confirmação remota possui revisão incoerente.");
  }
  return { revision, idempotent: value.idempotent };
}

function cacheKey(courseId) {
  return `${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${courseId}`;
}

export class CoursePersonalStateRepository {
  #queue = Promise.resolve();
  #localQueue = Promise.resolve();
  #cacheQueue = Promise.resolve();
  #record = null;
  #initialized = false;
  #course = null;
  #indexedLessons = [];
  #synchronizing = false;
  #syncError = null;
  #epoch = null;

  constructor({
    courseId,
    api,
    cache,
    localOnly = false,
    synchronizationMode = "automatic",
    course = null,
    clock = () => new Date(),
    uuidFactory = createUuid
  } = {}) {
    this.courseId = requiredUuid(courseId, "Curso");
    if (!localOnly && (!api || typeof api.loadPersonalState !== "function" ||
        typeof api.mutatePersonalState !== "function")) {
      throw new TypeError("CourseApiClient obrigatório para o estado pessoal.");
    }
    if (!cache || typeof cache.getCache !== "function" ||
        typeof cache.putCache !== "function" || typeof cache.updateCaches !== "function" ||
        typeof cache.deleteCachePrefix !== "function") {
      throw new TypeError("Cache canônico obrigatório para o estado pessoal.");
    }
    if (typeof clock !== "function" || typeof uuidFactory !== "function") {
      throw new TypeError("Relógio e gerador de identidade obrigatórios.");
    }
    this.api = api;
    this.localOnly = localOnly === true;
    this.setSynchronizationMode(synchronizationMode);
    this.cache = cache;
    this.clock = clock;
    this.uuidFactory = uuidFactory;
    if (course) this.setCourse(course);
  }

  setCourse(course) {
    this.#indexedLessons = courseIndex(course, this.courseId);
    this.#course = course;
    return this;
  }

  setSynchronizationMode(mode) {
    if (!new Set(["automatic", "manual"]).has(mode)) throw new TypeError("Modo de sincronização inválido.");
    this.synchronizationMode = mode;
  }

  #assertInitialized() {
    if (!this.#initialized || !this.#record) {
      throw failure("Inicialize o estado pessoal antes de usá-lo.", "course_personal_state_not_initialized");
    }
  }

  #normalizeCache(value) {
    if (!plainObject(value) || value.contract !== COURSE_PERSONAL_STATE_CACHE_CONTRACT ||
        requiredUuid(value.courseId, "Curso em cache") !== this.courseId) {
      throw failure("Cache pessoal inválido.");
    }
    const pending = value.pending == null ? null : {
      requestId: requiredUuid(value.pending.requestId, "Pendência.requestId"),
      baseRevision: nonNegativeInteger(value.pending.baseRevision, "Pendência.baseRevision"),
      operations: normalizeOperations(value.pending.operations),
      ...(value.pending.baseState ? { baseState: validateCoursePersonalState(value.pending.baseState) } : {}),
      createdAt: instant(value.pending.createdAt, "Pendência.createdAt")
    };
    return {
      contract: COURSE_PERSONAL_STATE_CACHE_CONTRACT,
      courseId: this.courseId,
      revision: nonNegativeInteger(value.revision, "Revisão em cache"),
      state: validateCoursePersonalState(value.state),
      pending,
      queuedOperations: normalizeOperations(value.queuedOperations || []),
      needsRemoteRebase: value.needsRemoteRebase === true,
      conflict: value.conflict ? {
        id: requiredUuid(value.conflict.id, "Conflito.id"),
        remoteRevision: nonNegativeInteger(value.conflict.remoteRevision, "Conflito.revisão"),
        remoteState: validateCoursePersonalState(value.conflict.remoteState),
        baseState: validateCoursePersonalState(value.conflict.baseState),
        paths: normalizeOperations(value.conflict.paths.map((entry) => ({ ...entry, kind: "delete" })))
          .map(({ collection: name, path }) => ({ collection: name, path }))
      } : null,
      updatedAt: instant(value.updatedAt, "Atualização em cache")
    };
  }

  async initialize({ refresh = true } = {}) {
    if (this.#initialized) {
      if (refresh) await this.refresh();
      return this.snapshot();
    }
    this.#epoch = await this.cache.getCache(`course.v1.personal-epoch:${this.courseId}`);
    const cached = await this.cache.getCache(cacheKey(this.courseId));
    if (cached) {
      try {
        this.#record = this.#normalizeCache(cached);
      } catch {
        await this.cache.putCache(cacheKey(this.courseId), null);
      }
    }
    this.#record ||= {
      contract: COURSE_PERSONAL_STATE_CACHE_CONTRACT,
      courseId: this.courseId,
      revision: 0,
      state: emptyState(),
      pending: null,
      queuedOperations: [],
      needsRemoteRebase: false,
      conflict: null,
      updatedAt: nowIso(this.clock)
    };
    this.#initialized = true;
    if (refresh) await this.refresh();
    return this.snapshot();
  }

  snapshot() {
    this.#assertInitialized();
    return clone({
      courseId: this.courseId,
      revision: this.#record.revision,
      state: this.#record.state,
      pending: Boolean(
        this.#record.pending || this.#record.queuedOperations.length || this.#record.needsRemoteRebase
      ),
      synchronizing: this.#synchronizing,
      syncError: this.#syncError,
      conflict: this.#record.conflict ? {
        id: this.#record.conflict.id,
        courseId: this.courseId,
        paths: this.#record.conflict.paths,
        local: stateCounts(this.#record.state),
        remote: stateCounts(this.#record.conflict.remoteState)
      } : null
    });
  }

  loadCanonicalState() {
    this.#assertInitialized();
    return clone(this.#record.state);
  }

  loadProgress() {
    this.#assertInitialized();
    if (!this.#course) throw failure("Carregue o Curso antes do progresso.");
    return studyProgress(this.#record.state.progress, this.#indexedLessons);
  }

  clearProgress() {
    this.#assertInitialized();
    return this.#mutate((state) => {
      const current = state.progress.lessons;
      const next = clone(current);
      for (const indexed of this.#indexedLessons) {
        const entry = next[indexed.lessonId];
        if (!entry) continue;
        const removedIds = new Set(indexed.studyUnits.map((unit) => unit.studyUnitId));
        const remaining = remainingLessonProgress(entry, removedIds, indexed);
        if (remaining) next[indexed.lessonId] = remaining;
        else delete next[indexed.lessonId];
      }
      return mapDiff("progress.lessons", current, next);
    });
  }

  clearProgressScope({
    courseId,
    moduleId = "",
    lessonId = "",
    microsequenceId = "",
    studyUnitId = ""
  } = {}) {
    this.#assertInitialized();
    if (courseId !== this.courseId) throw failure("O escopo não pertence ao Curso carregado.");
    const moduleLessons = this.#indexedLessons.filter((entry) => entry.moduleId === moduleId);
    if (moduleId && !moduleLessons.length) throw failure("O Módulo não existe no Curso.");

    if (!moduleId) {
      return this.clearProgress();
    }
    if (!lessonId) {
      return this.#mutate((state) => {
        const current = state.progress.lessons;
        const next = clone(current);
        for (const indexed of moduleLessons) {
          const entry = next[indexed.lessonId];
          if (!entry) continue;
          const removedIds = new Set(indexed.studyUnits.map((unit) => unit.studyUnitId));
          const remaining = remainingLessonProgress(entry, removedIds, indexed);
          if (remaining) next[indexed.lessonId] = remaining;
          else delete next[indexed.lessonId];
        }
        return mapDiff("progress.lessons", current, next);
      });
    }

    const indexed = moduleLessons.find((entry) => entry.lessonId === lessonId);
    if (!indexed) throw failure("A Lição não existe no Módulo indicado.");
    if (!microsequenceId) {
      const removedIds = new Set(indexed.studyUnits.map((unit) => unit.studyUnitId));
      return this.#mutate((state) => {
        const current = state.progress.lessons;
        const entry = current[lessonId];
        if (!entry) return [];
        const next = clone(current);
        const remaining = remainingLessonProgress(entry, removedIds, indexed);
        if (remaining) next[lessonId] = remaining;
        else delete next[lessonId];
        return mapDiff("progress.lessons", current, next);
      });
    }

    const microsequenceUnits = indexed.studyUnits
      .filter((unit) => unit.microsequenceId === microsequenceId);
    if (!microsequenceUnits.length) {
      throw failure("A Microssequência didática não existe na Lição indicada.");
    }
    let removedIds;
    if (studyUnitId) {
      const start = indexed.studyUnits.findIndex((unit) =>
        unit.microsequenceId === microsequenceId && unit.studyUnitId === studyUnitId);
      if (start < 0) throw failure("A Unidade de estudo não existe no escopo indicado.");
      removedIds = new Set(indexed.studyUnits.slice(start).map((unit) => unit.studyUnitId));
    } else {
      removedIds = new Set(microsequenceUnits.map((unit) => unit.studyUnitId));
    }
    return this.#mutate((state) => {
      const current = state.progress.lessons;
      const currentEntry = current[lessonId];
      if (!currentEntry) return [];
      const next = clone(current);
      const remaining = remainingLessonProgress(currentEntry, removedIds, indexed);
      if (remaining) next[lessonId] = remaining;
      else delete next[lessonId];
      return mapDiff("progress.lessons", current, next);
    });
  }

  isStudyUnitCompleted(reference) {
    this.#assertInitialized();
    const { studyUnitId } = studyUnitLocation(reference, this.#indexedLessons);
    return Object.values(this.#record.state.progress.lessons)
      .some((entry) => entry.completedStudyUnitIds.includes(studyUnitId));
  }

  setStudyUnitCompleted(reference, completed = true, { synchronize = true } = {}) {
    this.#assertInitialized();
    const { lessonId, studyUnitId } = studyUnitLocation(reference, this.#indexedLessons);
    return this.#mutate((state) => {
      const current = state.progress.lessons;
      const next = clone(current);
      for (const [currentLessonId, entry] of Object.entries(next)) {
        if (!entry.completedStudyUnitIds.includes(studyUnitId)) continue;
        const ids = entry.completedStudyUnitIds.filter((id) => id !== studyUnitId);
        if (!ids.length) delete next[currentLessonId];
        else next[currentLessonId] = {
          cursorStudyUnitId: ids.includes(entry.cursorStudyUnitId)
            ? entry.cursorStudyUnitId
            : ids.at(-1),
          completedStudyUnitIds: ids
        };
      }
      if (completed === true) {
        const target = next[lessonId] || { completedStudyUnitIds: [] };
        next[lessonId] = {
          cursorStudyUnitId: studyUnitId,
          completedStudyUnitIds: [...target.completedStudyUnitIds, studyUnitId]
        };
      }
      return mapDiff("progress.lessons", current, next);
    }, { synchronize });
  }

  isStudyUnitMarkedForReview(reference) {
    this.#assertInitialized();
    return Boolean(this.#record.state.reviewMarks[
      studyUnitLocation(reference, this.#indexedLessons).studyUnitId
    ]);
  }

  setStudyUnitReviewMark(reference, marked) {
    const path = studyUnitLocation(reference, this.#indexedLessons).studyUnitId;
    return this.#mutate([marked === true
      ? { kind: "set", collection: "reviewMarks", path, value: nowIso(this.clock) }
      : { kind: "delete", collection: "reviewMarks", path }]);
  }

  loadReviewItems() {
    this.#assertInitialized();
    return Object.entries(this.#record.state.reviewMarks).flatMap(([studyUnitId, reviewMarkedAt]) => {
      const details = studyUnitDetails(this.#indexedLessons, studyUnitId);
      return details ? [{
        studyUnitId,
        title: details.title,
        context: details.context,
        reviewMarkedAt,
        entityPath: details.entityPath
      }] : [];
    }).sort((left, right) => right.reviewMarkedAt.localeCompare(left.reviewMarkedAt));
  }

  refresh({ explicit = false, cacheOnly = false } = {}) {
    this.#assertInitialized();
    if (cacheOnly || this.localOnly || this.synchronizationMode === "manual" && !explicit) return this.#readLocal();
    return this.#enqueue(async () => {
      await this.#readLocal();
      let remote;
      try {
        remote = remoteEnvelope(await this.api.loadPersonalState(this.courseId), this.courseId);
      } catch (error) {
        if (authorityFailure(error)) await this.#clearAuthority();
        if (authorityFailure(error)) throw error;
        if (retryable(error)) { this.#syncError = "Não foi possível sincronizar. Tente novamente."; return this.snapshot(); }
        throw error;
      }
      await this.#update((record) => {
        if (record.pending || record.queuedOperations.length || record.conflict || record.needsRemoteRebase) return record;
        if (remote.revision >= record.revision) {
          record.revision = remote.revision;
          record.state = remote.state;
        }
        return record;
      });
      await this.#flushUnlocked({ explicit });
      return this.snapshot();
    });
  }

  flush({ explicit = false } = {}) {
    this.#assertInitialized();
    if (this.localOnly || this.synchronizationMode === "manual" && !explicit) {
      return this.#localQueue.then(() => this.#readLocal());
    }
    return this.#localQueue.then(() => this.#enqueue(() => this.#flushUnlocked({ explicit })));
  }

  async #readLocal() {
    return this.#enqueueCache(async () => {
      this.#assertInitialized();
      if (await this.cache.getCache(`course.v1.personal-epoch:${this.courseId}`) !== this.#epoch) {
        this.#record = null;
        this.#initialized = false;
        throw Object.assign(failure("O estado local deste curso foi removido em outra aba.", "course_access_revoked"), { status: 403 });
      }
      const value = await this.cache.getCache(cacheKey(this.courseId));
      if (value) this.#record = this.#normalizeCache(value);
      return this.snapshot();
    });
  }

  #newPending(record, baseState, operations) {
    return operations.length ? {
      requestId: requiredUuid(this.uuidFactory(), "Identidade da alteração"),
      baseRevision: record.revision,
      baseState: clone(baseState),
      operations: normalizeOperations(operations),
      createdAt: nowIso(this.clock)
    } : null;
  }

  #update(updater, { receiptKey = null } = {}) {
    return this.#enqueueCache(async () => {
      this.#assertInitialized();
      const key = cacheKey(this.courseId);
      const epochKey = `course.v1.personal-epoch:${this.courseId}`;
      const keys = receiptKey ? [key, epochKey, receiptKey] : [key, epochKey];
      const updated = await this.cache.updateCaches(keys, (values) => {
        if (values[epochKey] !== this.#epoch) {
          throw Object.assign(failure("O estado local deste curso foi removido em outra aba.", "course_access_revoked"), { status: 403 });
        }
        const current = values[key] ? this.#normalizeCache(values[key]) : clone(this.#record);
        if (!receiptKey || !values[receiptKey]) {
          values[key] = updater(current);
          values[key].updatedAt = nowIso(this.clock);
          if (receiptKey) values[receiptKey] = { adoptedAt: nowIso(this.clock), courseId: this.courseId };
        } else values[key] = current;
        return values;
      });
      this.#record = this.#normalizeCache(updated[key]);
      return this.snapshot();
    });
  }

  adoptVisitorState(state, { receiptKey } = {}) {
    if (this.localOnly || !receiptKey) throw failure("A incorporação exige uma conta e um recibo local.");
    const source = validateCoursePersonalState(state);
    return this.#update((record) => {
      const before = clone(record.state);
      record.state = mergeVisitorPersonalState(before, source);
      const operations = stateDiff(before, record.state);
      if (record.pending || record.needsRemoteRebase || record.conflict) {
        record.queuedOperations = mergeOperations(record.queuedOperations, operations);
      } else record.pending = this.#newPending(record, before, operations);
      return record;
    }, { receiptKey });
  }

  async resolveConflict({ resolution, expectedConflictId } = {}) {
    if (!new Set(["local", "remote"]).has(resolution)) throw failure("Escolha de conflito inválida.");
    await this.#update((record) => {
      const current = record.conflict;
      if (!current || current.id !== expectedConflictId) {
        throw failure("O conflito mudou. Confira o estado atual antes de decidir.", "course_personal_state_conflict_changed");
      }
      let merged;
      if (record.pending && !record.pending.baseState) {
        const uncertain = new Set(record.pending.operations.map(operationKey));
        const operations = mergeOperations(record.pending.operations, record.queuedOperations)
          .filter((operation) => resolution === "local" || !uncertain.has(operationKey(operation)))
          .map((operation) => {
            const value = collection(record.state, operation.collection)[operation.path];
            return value == null
              ? { kind: "delete", collection: operation.collection, path: operation.path }
              : { kind: "set", collection: operation.collection, path: operation.path, value };
          });
        merged = { state: applyOperations(current.remoteState, operations) };
      } else merged = rebaseState(current.baseState, record.state, current.remoteState, resolution);
      record.revision = current.remoteRevision;
      record.state = merged.state;
      record.pending = this.#newPending(record, current.remoteState, stateDiff(current.remoteState, merged.state));
      record.queuedOperations = [];
      record.conflict = null;
      return record;
    });
    return this.flush({ explicit: true });
  }

  async clearLocal() {
    await this.#enqueueCache(async () => {
      await this.#invalidatePersonalCache();
      await Promise.all([
        this.cache.deleteCachePrefix(`aralearn.course-anchored-annotation-cache.v1:${this.courseId}`),
        this.cache.deleteCachePrefix(`aralearn.course-anchored-annotation-outbox.v1:${this.courseId}`)
      ]);
      this.#record = null;
      this.#initialized = false;
    });
    return true;
  }

  #enqueue(operation) {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  #enqueueCache(operation) {
    const next = this.#cacheQueue.then(operation, operation);
    this.#cacheQueue = next.catch(() => undefined);
    return next;
  }

  #enqueueLocal(operation) {
    const next = this.#localQueue.then(operation, operation);
    this.#localQueue = next.catch(() => undefined);
    return next;
  }

  async #clearAuthority() {
    await this.#enqueueCache(async () => {
      await this.#invalidatePersonalCache();
      await Promise.all([
        this.cache.deleteCachePrefix(`aralearn.course-anchored-annotation-cache.v1:${this.courseId}`),
        this.cache.deleteCachePrefix(`aralearn.course-anchored-annotation-outbox.v1:${this.courseId}`),
        this.cache.deleteCachePrefix(`course.v1.header:${this.courseId}`),
        this.cache.deleteCachePrefix(`course.v1.entities:${this.courseId}:`),
        this.cache.deleteCachePrefix("course.v1.list:")
      ]);
      this.#record = null;
      this.#initialized = false;
    });
  }

  #invalidatePersonalCache() {
    const key = cacheKey(this.courseId);
    const epochKey = `course.v1.personal-epoch:${this.courseId}`;
    return this.cache.updateCaches([key, epochKey], () => ({
      [key]: null, [epochKey]: createUuid()
    }));
  }

  #mutate(operations, { synchronize = true } = {}) {
    this.#assertInitialized();
    const operationFactory = typeof operations === "function" ? operations : () => operations;
    const persistence = this.#enqueueLocal(() => this.#update((record) => {
      const before = clone(record.state);
      const normalized = normalizeOperations(operationFactory(clone(before)));
      if (!normalized.length) return record;
      record.state = applyOperations(before, normalized);
      if (this.localOnly) {
        record.pending = null;
        record.queuedOperations = [];
        record.needsRemoteRebase = false;
      } else if (record.pending || record.needsRemoteRebase || record.conflict) {
        record.queuedOperations = mergeOperations(record.queuedOperations, normalized);
        if (record.conflict) record.conflict.id = requiredUuid(this.uuidFactory(), "Identidade do conflito atualizado");
      } else record.pending = this.#newPending(record, before, normalized);
      return record;
    }));
    if (this.localOnly || !synchronize || this.synchronizationMode === "manual") return persistence;
    return persistence.then(() => this.#enqueue(() => this.#flushUnlocked()));
  }

  async #flushUnlocked({ explicit = false } = {}) {
    await this.#readLocal();
    if (this.localOnly || this.#record.conflict || this.synchronizationMode === "manual" && !explicit) return this.snapshot();
    this.#synchronizing = true;
    this.#syncError = null;
    try {
      if (this.#record.needsRemoteRebase) {
        const remote = remoteEnvelope(await this.api.loadPersonalState(this.courseId), this.courseId);
        await this.#update((record) => {
          if (!record.needsRemoteRebase) return record;
          record.revision = remote.revision;
          record.state = applyOperations(remote.state, record.queuedOperations);
          record.pending = this.#newPending(record, remote.state, record.queuedOperations);
          record.queuedOperations = [];
          record.needsRemoteRebase = false;
          return record;
        });
      }
      let consecutiveConflicts = 0;
      while (this.#record?.pending && !this.#record.conflict) {
        if (this.synchronizationMode === "manual" && !explicit) break;
        const pending = clone(this.#record.pending);
        try {
          const result = mutationResult(await this.api.mutatePersonalState({
            courseId: this.courseId,
            expectedRevision: pending.baseRevision,
            operations: pending.operations,
            requestId: pending.requestId
          }), this.courseId, pending.baseRevision);
          consecutiveConflicts = 0;
          await this.#update((record) => {
            // Another tab may already have acknowledged this exact request.
            if (record.pending?.requestId !== pending.requestId) return record;
            const acknowledged = pending.baseState
              ? applyOperations(pending.baseState, pending.operations)
              : applyOperations(emptyState(), pending.operations);
            record.revision = result.revision;
            record.pending = this.#newPending(record, acknowledged, record.queuedOperations);
            record.queuedOperations = [];
            return record;
          });
        } catch (error) {
          if (!conflict(error)) throw error;
          if (consecutiveConflicts++ >= 2) {
            throw failure("O estado continuou mudando em outro dispositivo. Tente novamente.",
              "course_personal_state_conflict");
          }
          const remote = remoteEnvelope(await this.api.loadPersonalState(this.courseId), this.courseId);
          await this.#update((record) => {
            if (record.pending?.requestId !== pending.requestId) return record;
            // Old cache records did not retain a baseline: preserve them for a
            // decision instead of pretending their whole-map operations are safe.
            const base = pending.baseState || emptyState();
            const merged = rebaseState(base, record.state, remote.state);
            const unknownPaths = !pending.baseState ? pending.operations.map(({ collection: name, path }) => ({ collection: name, path })) : [];
            if (merged.paths.length || unknownPaths.length) {
              record.conflict = {
                id: requiredUuid(this.uuidFactory(), "Identidade do conflito"),
                baseState: base,
                remoteState: remote.state,
                remoteRevision: remote.revision,
                paths: merged.paths.length ? merged.paths : unknownPaths
              };
              return record;
            }
            record.revision = remote.revision;
            record.state = merged.state;
            record.pending = this.#newPending(record, remote.state, stateDiff(remote.state, merged.state));
            record.queuedOperations = [];
            return record;
          });
        }
      }
    } catch (error) {
      if (authorityFailure(error)) {
        await this.#clearAuthority();
        throw error;
      }
      this.#syncError = "Não foi possível sincronizar. Tente novamente.";
      if (!retryable(error)) throw error;
    } finally {
      this.#synchronizing = false;
    }
    return this.snapshot();
  }
}
