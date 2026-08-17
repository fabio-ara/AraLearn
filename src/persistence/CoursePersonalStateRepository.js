import { normalizePedagogicalCommentDraft } from "../domain/pedagogicalComment.js";
import {
  createEmptyProgressDocument,
  validateProgressDocument
} from "../storage/progressStore.js";
import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";

export const COURSE_PERSONAL_STATE_VERSION = 1;
export const COURSE_PERSONAL_STATE_CACHE_CONTRACT =
  "aralearn.course-personal-state-cache.v1";

const MAX_STATE_BYTES = 524_288;
const MAX_OPERATIONS = 512;
const MAX_OPERATION_BYTES = 65_536;
const COLLECTIONS = new Set(["progress.lessons", "reviewMarks", "observations"]);
const ISO_INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u;

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
      value.length > 240 || hasControlCharacters(value)) {
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
  if (typeof value !== "string" || !ISO_INSTANT.test(value) ||
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
    reviewMarks: {},
    observations: {}
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

function normalizeObservation(value, label) {
  if (!plainObject(value)) throw failure(`${label} inválida.`);
  const allowed = new Set(["category", "body", "updatedAt"]);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) throw failure(`${label}.${unknown} não pertence ao contrato.`);
  const draft = normalizePedagogicalCommentDraft(value);
  return {
    category: draft.category,
    body: draft.body,
    updatedAt: instant(value.updatedAt, `${label}.updatedAt`)
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
  const allowed = new Set(["version", "progress", "reviewMarks", "observations"]);
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
    reviewMarks: normalizeMap(value.reviewMarks, "Estado pessoal.reviewMarks", 100_000, instant),
    observations: normalizeMap(
      value.observations,
      "Estado pessoal.observations",
      10_000,
      normalizeObservation
    )
  };
  const writeBudget = clone(normalized);
  writeBudget.observations = Object.fromEntries(
    Object.entries(normalized.observations).map(([path, observation]) => [path, {
      category: observation.category,
      body: observation.body,
      updatedAt: observation.updatedAt
    }])
  );
  if (new TextEncoder().encode(JSON.stringify(writeBudget)).byteLength > MAX_STATE_BYTES) {
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
      : operation.collection === "reviewMarks"
        ? instant(value.value, `Operação ${index + 1}.value`)
        : normalizeObservation(value.value, `Operação ${index + 1}.value`, { writable: true });
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
        for (const unit of microsequence.cards || []) {
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
  if (!plainObject(value) || value.contract !== "aralearn.course-personal-state.v1" ||
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
  #record = null;
  #initialized = false;
  #course = null;
  #indexedLessons = [];

  constructor({
    courseId,
    api,
    cache,
    course = null,
    clock = () => new Date(),
    uuidFactory = createUuid
  } = {}) {
    this.courseId = requiredUuid(courseId, "Curso");
    if (!api || typeof api.loadPersonalState !== "function" ||
        typeof api.mutatePersonalState !== "function") {
      throw new TypeError("CourseApiClient obrigatório para o estado pessoal.");
    }
    if (!cache || typeof cache.getCache !== "function" ||
        typeof cache.putCache !== "function" ||
        typeof cache.deleteCachePrefix !== "function") {
      throw new TypeError("Cache canônico obrigatório para o estado pessoal.");
    }
    if (typeof clock !== "function" || typeof uuidFactory !== "function") {
      throw new TypeError("Relógio e gerador de identidade obrigatórios.");
    }
    this.api = api;
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
      createdAt: instant(value.pending.createdAt, "Pendência.createdAt")
    };
    return {
      contract: COURSE_PERSONAL_STATE_CACHE_CONTRACT,
      courseId: this.courseId,
      revision: nonNegativeInteger(value.revision, "Revisão em cache"),
      state: validateCoursePersonalState(value.state),
      pending,
      queuedOperations: normalizeOperations(value.queuedOperations || []),
      updatedAt: instant(value.updatedAt, "Atualização em cache")
    };
  }

  async initialize({ refresh = true } = {}) {
    if (this.#initialized) {
      if (refresh) await this.refresh();
      return this.snapshot();
    }
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
      pending: Boolean(this.#record.pending || this.#record.queuedOperations.length)
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
    const current = this.#record.state.progress.lessons;
    const next = clone(current);
    for (const indexed of this.#indexedLessons) {
      const entry = next[indexed.lessonId];
      if (!entry) continue;
      const removedIds = new Set(indexed.studyUnits.map((unit) => unit.studyUnitId));
      const remaining = remainingLessonProgress(entry, removedIds, indexed);
      if (remaining) next[indexed.lessonId] = remaining;
      else delete next[indexed.lessonId];
    }
    return this.#mutate(mapDiff("progress.lessons", current, next));
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
    const current = this.#record.state.progress.lessons;
    const next = clone(current);
    const moduleLessons = this.#indexedLessons.filter((entry) => entry.moduleId === moduleId);
    if (moduleId && !moduleLessons.length) throw failure("O Módulo não existe no Curso.");

    if (!moduleId) {
      return this.clearProgress();
    }
    if (!lessonId) {
      for (const indexed of moduleLessons) {
        const entry = next[indexed.lessonId];
        if (!entry) continue;
        const removedIds = new Set(indexed.studyUnits.map((unit) => unit.studyUnitId));
        const remaining = remainingLessonProgress(entry, removedIds, indexed);
        if (remaining) next[indexed.lessonId] = remaining;
        else delete next[indexed.lessonId];
      }
      return this.#mutate(mapDiff("progress.lessons", current, next));
    }

    const indexed = moduleLessons.find((entry) => entry.lessonId === lessonId);
    if (!indexed) throw failure("A Lição não existe no Módulo indicado.");
    if (!microsequenceId) {
      const entry = next[lessonId];
      if (!entry) return Promise.resolve(this.snapshot());
      const removedIds = new Set(indexed.studyUnits.map((unit) => unit.studyUnitId));
      const remaining = remainingLessonProgress(entry, removedIds, indexed);
      if (remaining) next[lessonId] = remaining;
      else delete next[lessonId];
      return this.#mutate(mapDiff("progress.lessons", current, next));
    }

    const microsequenceUnits = indexed.studyUnits
      .filter((unit) => unit.microsequenceId === microsequenceId);
    if (!microsequenceUnits.length) {
      throw failure("A Microssequência didática não existe na Lição indicada.");
    }
    const currentEntry = next[lessonId];
    if (!currentEntry) return Promise.resolve(this.snapshot());
    let removedIds;
    if (studyUnitId) {
      const start = indexed.studyUnits.findIndex((unit) =>
        unit.microsequenceId === microsequenceId && unit.studyUnitId === studyUnitId);
      if (start < 0) throw failure("A Unidade de estudo não existe no escopo indicado.");
      removedIds = new Set(indexed.studyUnits.slice(start).map((unit) => unit.studyUnitId));
    } else {
      removedIds = new Set(microsequenceUnits.map((unit) => unit.studyUnitId));
    }
    const remaining = remainingLessonProgress(currentEntry, removedIds, indexed);
    if (remaining) next[lessonId] = remaining;
    else delete next[lessonId];
    return this.#mutate(mapDiff("progress.lessons", current, next));
  }

  isStudyUnitCompleted(reference) {
    this.#assertInitialized();
    const { studyUnitId } = studyUnitLocation(reference, this.#indexedLessons);
    return Object.values(this.#record.state.progress.lessons)
      .some((entry) => entry.completedStudyUnitIds.includes(studyUnitId));
  }

  setStudyUnitCompleted(reference, completed = true) {
    this.#assertInitialized();
    const { lessonId, studyUnitId } = studyUnitLocation(reference, this.#indexedLessons);
    const current = this.#record.state.progress.lessons;
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
    return this.#mutate(mapDiff("progress.lessons", current, next));
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

  loadCommentForPath(reference) {
    this.#assertInitialized();
    const path = studyUnitLocation(reference, this.#indexedLessons).studyUnitId;
    const value = this.#record.state.observations[path];
    return value ? clone(value) : null;
  }

  saveCommentForPath(reference, draft) {
    const path = studyUnitLocation(reference, this.#indexedLessons).studyUnitId;
    const normalized = normalizePedagogicalCommentDraft(draft);
    const value = { ...normalized, updatedAt: nowIso(this.clock) };
    return this.#mutate([
      { kind: "set", collection: "observations", path, value }
    ]).then(() => clone(value));
  }

  deleteCommentForPath(reference) {
    const path = studyUnitLocation(reference, this.#indexedLessons).studyUnitId;
    const previous = this.#record.state.observations[path];
    if (!previous) return Promise.resolve(null);
    return this.#mutate([
      { kind: "delete", collection: "observations", path }
    ]).then(() => clone(previous));
  }

  refresh() {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      let remote;
      try {
        remote = remoteEnvelope(await this.api.loadPersonalState(this.courseId), this.courseId);
      } catch (error) {
        if (authorityFailure(error)) await this.#clearAuthority();
        if (authorityFailure(error)) throw error;
        if (retryable(error)) return this.snapshot();
        throw error;
      }
      if (this.#record.pending) {
        await this.#flushUnlocked();
        return this.snapshot();
      }
      this.#record.revision = remote.revision;
      this.#record.state = remote.state;
      await this.#persist();
      return this.snapshot();
    });
  }

  flush() {
    this.#assertInitialized();
    return this.#enqueue(() => this.#flushUnlocked());
  }

  async clearLocal() {
    await this.cache.putCache(cacheKey(this.courseId), null);
    this.#record = null;
    this.#initialized = false;
    return true;
  }

  #enqueue(operation) {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #persist() {
    this.#record.updatedAt = nowIso(this.clock);
    await this.cache.putCache(cacheKey(this.courseId), clone(this.#record));
  }

  async #clearAuthority() {
    await Promise.all([
      this.cache.deleteCachePrefix(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${this.courseId}`),
      this.cache.deleteCachePrefix(`course.v1.header:${this.courseId}`),
      this.cache.deleteCachePrefix(`course.v1.entities:${this.courseId}:`),
      this.cache.deleteCachePrefix("course.v1.list:")
    ]);
    this.#record = null;
    this.#initialized = false;
  }

  #mutate(operations, { synchronize = true } = {}) {
    this.#assertInitialized();
    const normalized = normalizeOperations(operations);
    if (!normalized.length) return Promise.resolve(this.snapshot());
    this.#record.state = applyOperations(this.#record.state, normalized);
    if (this.#record.pending) {
      this.#record.queuedOperations = mergeOperations(
        this.#record.queuedOperations,
        normalized
      );
    } else {
      this.#record.pending = {
        requestId: requiredUuid(this.uuidFactory(), "Identidade da alteração"),
        baseRevision: this.#record.revision,
        operations: normalized,
        createdAt: nowIso(this.clock)
      };
    }
    return this.#enqueue(async () => {
      await this.#persist();
      if (synchronize) await this.#flushUnlocked();
      return this.snapshot();
    });
  }

  async #flushUnlocked() {
    let consecutiveConflicts = 0;
    while (this.#record?.pending) {
      const pending = this.#record.pending;
      try {
        const result = mutationResult(await this.api.mutatePersonalState({
          courseId: this.courseId,
          expectedRevision: pending.baseRevision,
          operations: pending.operations,
          requestId: pending.requestId
        }), this.courseId, pending.baseRevision);
        consecutiveConflicts = 0;
        this.#record.revision = result.revision;
        this.#record.pending = null;
        if (this.#record.queuedOperations.length) {
          const operations = this.#record.queuedOperations;
          this.#record.queuedOperations = [];
          this.#record.pending = {
            requestId: requiredUuid(this.uuidFactory(), "Identidade da alteração"),
            baseRevision: result.revision,
            operations,
            createdAt: nowIso(this.clock)
          };
        }
        await this.#persist();
      } catch (error) {
        if (authorityFailure(error)) {
          await this.#clearAuthority();
          throw error;
        }
        if (conflict(error)) {
          if (consecutiveConflicts >= 2) {
            const current = failure(
              "O estado pessoal continuou mudando em outro dispositivo; tente novamente.",
              "course_personal_state_conflict"
            );
            current.cause = error;
            throw current;
          }
          let remote;
          try {
            remote = remoteEnvelope(
              await this.api.loadPersonalState(this.courseId),
              this.courseId
            );
          } catch (refreshError) {
            if (authorityFailure(refreshError)) {
              await this.#clearAuthority();
              throw refreshError;
            }
            if (retryable(refreshError)) {
              await this.#persist();
              return this.snapshot();
            }
            throw refreshError;
          }
          consecutiveConflicts += 1;
          this.#record.revision = remote.revision;
          this.#record.state = applyOperations(remote.state, [
            ...pending.operations,
            ...this.#record.queuedOperations
          ]);
          this.#record.pending = {
            ...pending,
            requestId: requiredUuid(this.uuidFactory(), "Identidade da alteração rebaseada"),
            baseRevision: remote.revision,
            createdAt: nowIso(this.clock)
          };
          await this.#persist();
          continue;
        }
        if (retryable(error)) {
          await this.#persist();
          return this.snapshot();
        }
        throw error;
      }
    }
    return this.snapshot();
  }
}

export { emptyState as createEmptyCoursePersonalState };
