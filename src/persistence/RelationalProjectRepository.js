import {
  createEmptyProjectDocument,
  validateProjectDocument
} from "../domain/aralearnProject.js";
import { normalizePedagogicalCommentDraft } from "../domain/pedagogicalComment.js";
import {
  buildLessonProgressKey,
  createEmptyProgressDocument,
  removeLessonProgressEntries,
  validateProgressDocument
} from "../storage/progressStore.js";
import { DomainMutationService } from "./DomainMutationService.js";
import {
  IndexedDbRelationalStore,
  LocalCourseDraftChangedError,
  PROJECT_ROW_STORE_NAMES,
  localCourseAuthoringStateId
} from "./IndexedDbRelationalStore.js";
import { ProjectDocumentAssembler } from "./ProjectDocumentAssembler.js";
import { ProjectDocumentDiffer } from "./ProjectDocumentDiffer.js";
import { deterministicUuid, relationalNaturalKey } from "./deterministicUuid.js";
import { defaultUuidFactory } from "./relationalSchema.js";

const VOLATILE_ROW_FIELDS = new Set(["updatedAt", "deletedAt"]);
const PERSONAL_REPLICA_STORE_NAMES = [
  "courseSelections",
  "lessonProgress",
  "cardProgress",
  "comments",
  "studyPaths",
  "studyPathCourses"
];
const CARD_ASSISTANCE_LOCAL_STATE_CONTRACT =
  "aralearn.card-assistance-local-state.v4";
const CARD_ASSISTANCE_SYNC_MAX_PATHS = 64;

function cardAssistanceLocalStateId(courseId) {
  return `authoring.cardAssistance:${courseId}`;
}

function cardAssistanceStateError(message) {
  const error = new Error(message);
  error.code = "card_assistance_state_invalid";
  return error;
}

function assertCardAssistanceCoursePath(value, courseKey, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw cardAssistanceStateError(`${label} não possui um caminho válido.`);
  }
  if (String(value.courseKey || "").trim() !== courseKey) {
    throw cardAssistanceStateError(`${label} pertence a outro curso.`);
  }
}

function normalizeCardAssistanceStateForCourse(value, courseKey) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.contract !== CARD_ASSISTANCE_LOCAL_STATE_CONTRACT
  ) {
    throw cardAssistanceStateError("O estado local da assistência não segue o contrato atual.");
  }
  const normalizedCourseKey = String(courseKey || "").trim();
  if (!normalizedCourseKey) {
    throw cardAssistanceStateError("O curso da assistência não possui identidade canônica.");
  }
  const normalized = clone(value);
  const pendingPaths = normalized.sync?.pendingPaths;
  if (!Array.isArray(pendingPaths)) {
    throw cardAssistanceStateError("A fila de sincronização contextual é inválida.");
  }
  if (
    normalized.sync.expectedRevision !== null &&
    normalized.sync.expectedRevision !== undefined &&
    (typeof normalized.sync.expectedRevision !== "string" ||
      !normalized.sync.expectedRevision.trim())
  ) {
    throw cardAssistanceStateError("A revisão da sincronização contextual é inválida.");
  }
  if (pendingPaths.length > CARD_ASSISTANCE_SYNC_MAX_PATHS) {
    const error = cardAssistanceStateError(
      `A sincronização contextual excede ${CARD_ASSISTANCE_SYNC_MAX_PATHS} caminhos.`
    );
    error.code = "card_assistance_sync_scope_too_large";
    throw error;
  }
  pendingPaths.forEach((pathValue) => assertCardAssistanceCoursePath(
    pathValue,
    normalizedCourseKey,
    "A alteração pendente"
  ));
  if (normalized.undo !== null && normalized.undo !== undefined) {
    if (normalized.undo.contract !== "aralearn.contextual-authoring-undo.v1") {
      throw cardAssistanceStateError("A reversão contextual não segue o contrato atual.");
    }
    assertCardAssistanceCoursePath(
      normalized.undo,
      normalizedCourseKey,
      "A reversão contextual"
    );
  }
  return normalized;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function timestamp(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

function isActive(row) {
  return Boolean(row) && row.deletedAt == null;
}

function requireCourseOrigin(selection) {
  const origin = String(selection?.courseOrigin || "").trim();
  if (origin === "catalog" || origin === "private") return origin;
  throw new Error("A seleção do curso precisa declarar origem catalog ou private.");
}

function deniedCoursePermissions() {
  return {
    role: "learner",
    canAuthorContent: false,
    writeTarget: null,
    canOrganizeSelection: false,
    canRemoveSelection: false,
    canDeleteCourse: false,
    canEdit: false,
    canDelete: false,
    requiresFork: false
  };
}

function courseAuthoringDenied(courseId) {
  const error = new Error(`O curso ${courseId} não pode ser alterado nesta conta.`);
  error.code = "course_authoring_forbidden";
  return error;
}

function activeRows(rows, userId = undefined) {
  return [...rows.values()].filter((row) => isActive(row) && (
    userId === undefined || row.userId === userId || row.ownerId === userId
  ));
}

function comparePositionAndIdentity(left, right) {
  return Number(left.position || 0) - Number(right.position || 0)
    || String(left.id).localeCompare(String(right.id));
}

function activeRowsSnapshot(rows, userId) {
  return JSON.stringify(
    activeRows(rows, userId).sort((left, right) =>
      String(left.id).localeCompare(String(right.id))
    )
  );
}

function requireCurrentUser(requestedUserId, currentUserId) {
  if (!currentUserId) throw new Error("A operação exige um usuário autenticado.");
  if (requestedUserId != null && String(requestedUserId) !== String(currentUserId)) {
    throw new Error("O estado pessoal deve pertencer ao usuário autenticado.");
  }
  return currentUserId;
}

function validationError(result) {
  const details = (result.errors || [])
    .map((entry) => `${entry.path}: ${entry.message}`)
    .join("; ");
  const error = new Error(`Documento AraLearn v4 inválido${details ? `: ${details}` : "."}`);
  error.details = result.errors || [];
  return error;
}

function normalizeProject(document) {
  const result = validateProjectDocument(document);
  if (!result.ok) throw validationError(result);
  return clone(document);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function domainRow(row) {
  return Object.fromEntries(
    Object.entries(row || {})
      .filter(([fieldName]) => !VOLATILE_ROW_FIELDS.has(fieldName))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function rowsEqual(left, right) {
  return JSON.stringify(stableValue(domainRow(left))) ===
    JSON.stringify(stableValue(domainRow(right)));
}

function changedFields(previousRow, nextRow) {
  return [...new Set([
    ...Object.keys(previousRow || {}),
    ...Object.keys(nextRow || {})
  ])]
    .filter((fieldName) => !VOLATILE_ROW_FIELDS.has(fieldName))
    .filter((fieldName) =>
      JSON.stringify(stableValue(previousRow?.[fieldName])) !==
      JSON.stringify(stableValue(nextRow?.[fieldName]))
    )
    .sort();
}

function makeMutation(storeName, previousRow, nextRow) {
  const row = nextRow || previousRow;
  return {
    storeName,
    entityType: storeName,
    entityId: row.id,
    courseId: row.courseId ?? null,
    operation: nextRow ? "upsert" : "delete",
    previousRow: clone(previousRow),
    nextRow: clone(nextRow),
    changedFields: nextRow ? changedFields(previousRow, nextRow) : []
  };
}

function normalizedPositionMutations(storeName, orderedRows, currentRows) {
  return orderedRows.flatMap((row, position) => {
    const stored = currentRows.get(String(row.id));
    const previous = isActive(stored) ? stored : null;
    const next = Number(row.position) === position ? row : { ...row, position };
    if (previous && rowsEqual(previous, next)) return [];
    return [makeMutation(storeName, previous, next)];
  });
}

function diffRowMaps(storeName, previousMap, nextRows) {
  const nextMap = new Map(nextRows.map((row) => [row.id, row]));
  const mutations = [];
  const ids = new Set([...previousMap.keys(), ...nextMap.keys()]);
  ids.forEach((id) => {
    const previousRow = isActive(previousMap.get(id)) ? previousMap.get(id) : null;
    const nextRow = nextMap.get(id) || null;
    if (previousRow && nextRow && rowsEqual(previousRow, nextRow)) return;
    if (!previousRow && !nextRow) return;
    mutations.push(makeMutation(storeName, previousRow, nextRow));
  });
  return mutations;
}

function mergeAppliedRows(map, appliedRows, storeName) {
  appliedRows
    .filter((entry) => entry.storeName === storeName)
    .forEach((entry) => {
      const id = entry.entityId || entry.row?.id;
      if (!id) return;
      if (!entry.row || entry.operation === "delete" || entry.row.deletedAt != null) {
        map.delete(id);
      } else {
        map.set(id, clone(entry.row));
      }
    });
}

function selectedProjectRows(projectRows, selectionRows, userId) {
  const selectedCourseIds = new Set(
    selectionRows
      .filter((row) => isActive(row) && row.userId === userId)
      .map((row) => String(row.courseId))
  );
  return Object.fromEntries(Object.entries(projectRows).map(([storeName, rows]) => [
    storeName,
    storeName === "projectMeta"
      ? rows
      : rows.filter((row) => selectedCourseIds.has(String(storeName === "courses" ? row.id : row.courseId)))
  ]));
}

function projectIndexes(projectRows) {
  const courses = new Map((projectRows.courses || []).map((row) => [row.id, row]));
  const modules = new Map((projectRows.modules || []).map((row) => [row.id, row]));
  const lessons = new Map((projectRows.lessons || []).map((row) => [row.id, row]));
  const cards = new Map((projectRows.cards || []).map((row) => [row.id, row]));
  const microsequences = new Map(
    (projectRows.microsequences || []).map((row) => [row.id, row])
  );
  const cardOrder = new Map();
  const cardLessonIds = new Map();
  const cardsByLesson = new Map();
  (projectRows.cards || []).forEach((card) => {
    const microsequence = microsequences.get(card.microsequenceId);
    const lessonId = card.lessonId || microsequence?.lessonId;
    if (lessonId) {
      cardLessonIds.set(card.id, lessonId);
      if (!cardsByLesson.has(lessonId)) cardsByLesson.set(lessonId, []);
      cardsByLesson.get(lessonId).push(card);
    }
    cardOrder.set(card.id, [
      Number(microsequence?.position || 0),
      Number(card.position || 0),
      String(card.id)
    ]);
  });
  cardsByLesson.forEach((lessonCards) => lessonCards.sort((left, right) => {
    const leftOrder = cardOrder.get(left.id);
    const rightOrder = cardOrder.get(right.id);
    return leftOrder[0] - rightOrder[0] ||
      leftOrder[1] - rightOrder[1] ||
      leftOrder[2].localeCompare(rightOrder[2]);
  }));
  const lessonPaths = new Map();
  lessons.forEach((lesson) => {
    const moduleValue = modules.get(lesson.moduleId);
    const course = moduleValue ? courses.get(moduleValue.courseId) : null;
    if (!course || !moduleValue) return;
    lessonPaths.set(lesson.id, {
      courseKey: course.contractKey,
      moduleKey: moduleValue.contractKey,
      lessonKey: lesson.contractKey,
      pathKey: `${course.contractKey}::${moduleValue.contractKey}::${lesson.contractKey}`
    });
  });
  return { courses, modules, lessons, cards, cardOrder, cardLessonIds, cardsByLesson, lessonPaths };
}

function canonicalProgressTimestamp(value) {
  const source = String(value || "").trim();
  const parsed = new Date(source);
  if (!source || !Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function progressDocumentFromRows(lessonRows, cardRows, userId, projectRows) {
  const indexes = projectIndexes(projectRows);
  const completedByLesson = new Map();
  activeRows(cardRows, userId)
    .filter((row) => row.completedAt)
    .forEach((row) => {
      const lessonId = row.lessonId || indexes.cardLessonIds.get(row.cardId);
      if (!lessonId) return;
      if (!completedByLesson.has(lessonId)) completedByLesson.set(lessonId, new Map());
      completedByLesson.get(lessonId).set(row.cardId, row);
    });
  const lessonProgressByLesson = new Map(activeRows(lessonRows, userId)
    .filter((row) => row.lessonId)
    .map((row) => [row.lessonId, row]));
  const lessons = {};
  const lessonIds = new Set([...lessonProgressByLesson.keys(), ...completedByLesson.keys()]);
  lessonIds.forEach((lessonId) => {
    const row = lessonProgressByLesson.get(lessonId) || {};
    const completedRows = completedByLesson.get(lessonId) || new Map();
    const completed = [];
    for (const card of indexes.cardsByLesson.get(lessonId) || []) {
      const cardProgress = completedRows.get(card.id);
      if (!cardProgress) break;
      completed.push(cardProgress);
    }
    if (!completed.length) return;
    const metadata = indexes.lessonPaths.get(lessonId);
    const pathKey = row.pathKey || metadata?.pathKey;
    if (!pathKey) return;
    const stateTimes = [
      row.updatedAt,
      ...completed.map((card) => card.updatedAt)
    ].map(canonicalProgressTimestamp).filter(Boolean).sort();
    const updatedAt = stateTimes.at(-1) || null;
    lessons[pathKey] = {
      cursor: completed.length - 1,
      completedCardKeys: completed.map((cardProgress) =>
        cardProgress.cardKey || indexes.cards.get(cardProgress.cardId)?.contractKey
      ).filter(Boolean),
      ...(updatedAt ? { updatedAt } : {})
    };
  });
  return { version: 1, lessons };
}

export class RelationalProjectRepository {
  #initialized = false;
  #projectRows = {};
  #project = createEmptyProjectDocument();
  #committedProject = createEmptyProjectDocument();
  #selectionRows = new Map();
  #lessonProgressRows = new Map();
  #cardProgressRows = new Map();
  #commentRows = new Map();
  #studyPathRows = new Map();
  #studyPathCourseRows = new Map();
  #localDraftRevisions = new Map();
  #catalogManagementAllowed = false;
  #progress = createEmptyProgressDocument();
  #tail = Promise.resolve();
  #pendingWrites = 0;
  #durabilityError = null;
  #failedDurabilityTasks = [];
  #latestDurabilityTaskVersions = new Map();
  #durabilityListeners = new Set();
  #durabilityChangedAt = null;
  #latestProjectSave = 0;
  #latestProgressSave = 0;

  constructor({
    store,
    assembler = new ProjectDocumentAssembler({ validate: true }),
    differ,
    mutationService,
    identityMap = new Map(),
    userId = null,
    uuidFactory = defaultUuidFactory,
    naturalKeyIdFactory = deterministicUuid,
    clock = () => new Date(),
    onLocalCommit = null
  } = {}) {
    if (!store || typeof store.readStores !== "function") {
      throw new TypeError("RelationalProjectRepository exige IndexedDbRelationalStore.");
    }
    this.store = store;
    this.assembler = assembler;
    this.identityMap = identityMap;
    this.userId = userId;
    this.uuidFactory = uuidFactory;
    this.naturalKeyIdFactory = naturalKeyIdFactory;
    this.clock = clock;
    this.differ = differ || new ProjectDocumentDiffer({ identityMap, uuidFactory });
    this.mutations = mutationService || new DomainMutationService({
      store,
      uuidFactory,
      clock,
      onLocalCommit
    });
  }

  static async open({ indexedDb = globalThis.indexedDB, store = null, ...options } = {}) {
    const relationalStore = store || await IndexedDbRelationalStore.open(indexedDb, {
      userId: options.userId || null
    });
    const repository = new RelationalProjectRepository({ ...options, store: relationalStore });
    await repository.initialize();
    return repository;
  }

  async initialize() {
    if (this.#initialized) return this;
    await this.#reloadFromStore();
    this.#initialized = true;
    return this;
  }

  async #reloadFromStore() {
    const [allProjectRows, personalRows] = await Promise.all([
      this.store.readStores(PROJECT_ROW_STORE_NAMES),
      this.store.readStores(PERSONAL_REPLICA_STORE_NAMES)
    ]);
    this.#selectionRows = new Map(personalRows.courseSelections.map((row) => [row.id, row]));
    this.#projectRows = selectedProjectRows(
      allProjectRows,
      [...this.#selectionRows.values()],
      this.userId
    );
    this.identityMap.clear?.();
    Object.values(this.#projectRows).flat().filter(isActive).forEach((row) => {
      if (!row?.identityKey || !row?.id) return;
      const existingId = this.identityMap.get(row.identityKey);
      if (existingId && existingId !== row.id) {
        throw new Error(`Identidade relacional ativa duplicada: "${row.identityKey}".`);
      }
      this.identityMap.set(row.identityKey, row.id);
    });
    this.#lessonProgressRows = new Map(personalRows.lessonProgress.map((row) => [row.id, row]));
    this.#cardProgressRows = new Map(personalRows.cardProgress.map((row) => [row.id, row]));
    this.#commentRows = new Map(personalRows.comments.map((row) => [row.id, row]));
    this.#studyPathRows = new Map(personalRows.studyPaths.map((row) => [row.id, row]));
    this.#studyPathCourseRows = new Map(personalRows.studyPathCourses.map((row) => [row.id, row]));
    const selectedCourseIds = [...new Set(
      activeRows(this.#selectionRows, this.userId).map((row) => String(row.courseId))
    )];
    const localDrafts = await this.store.getLocalCourseDrafts(selectedCourseIds);
    this.#localDraftRevisions = new Map(selectedCourseIds.map((courseId, index) => [
      courseId,
      localDrafts[index]?.revision || null
    ]));
    this.#committedProject = normalizeProject(this.assembler.assemble(this.#projectRows));
    this.#project = clone(this.#committedProject);
    this.#progress = progressDocumentFromRows(
      this.#lessonProgressRows,
      this.#cardProgressRows,
      this.userId,
      this.#projectRows
    );
  }

  async refreshFromReplica() {
    this.#assertInitialized();
    await this.flush();
    const previousProject = JSON.stringify(this.#project);
    const previousProgress = JSON.stringify(this.#progress);
    const previousStudyPaths = JSON.stringify(this.loadStudyPaths());
    await this.#reloadFromStore();
    return {
      project: this.loadProject(),
      progress: this.loadProgress(),
      documentChanged: previousProject !== JSON.stringify(this.#project),
      progressChanged: previousProgress !== JSON.stringify(this.#progress),
      studyPathsChanged: previousStudyPaths !== JSON.stringify(this.loadStudyPaths())
    };
  }

  async refreshPersonalStateFromReplica() {
    this.#assertInitialized();
    await this.flush();
    const previousSelectionRows = activeRowsSnapshot(this.#selectionRows, this.userId);
    const previousProgress = JSON.stringify(this.#progress);
    const previousStudyPaths = JSON.stringify(this.loadStudyPaths());
    const previousComments = activeRowsSnapshot(this.#commentRows, this.userId);
    const personalRows = await this.store.readStores(PERSONAL_REPLICA_STORE_NAMES);
    const nextSelectionRows = new Map(personalRows.courseSelections.map((row) => [row.id, row]));
    const selectionRowsChanged = previousSelectionRows !==
      activeRowsSnapshot(nextSelectionRows, this.userId);

    if (selectionRowsChanged) {
      await this.#reloadFromStore();
      return {
        project: this.loadProject(),
        documentChanged: true,
        progressChanged: previousProgress !== JSON.stringify(this.#progress),
        studyPathsChanged: previousStudyPaths !== JSON.stringify(this.loadStudyPaths()),
        commentsChanged: previousComments !== activeRowsSnapshot(this.#commentRows, this.userId)
      };
    }

    this.#selectionRows = nextSelectionRows;
    this.#lessonProgressRows = new Map(personalRows.lessonProgress.map((row) => [row.id, row]));
    this.#cardProgressRows = new Map(personalRows.cardProgress.map((row) => [row.id, row]));
    this.#commentRows = new Map(personalRows.comments.map((row) => [row.id, row]));
    this.#studyPathRows = new Map(personalRows.studyPaths.map((row) => [row.id, row]));
    this.#studyPathCourseRows = new Map(personalRows.studyPathCourses.map((row) => [row.id, row]));
    this.#progress = progressDocumentFromRows(
      this.#lessonProgressRows,
      this.#cardProgressRows,
      this.userId,
      this.#projectRows
    );

    return {
      documentChanged: false,
      progressChanged: previousProgress !== JSON.stringify(this.#progress),
      studyPathsChanged: previousStudyPaths !== JSON.stringify(this.loadStudyPaths()),
      commentsChanged: previousComments !== activeRowsSnapshot(this.#commentRows, this.userId)
    };
  }

  #assertInitialized() {
    if (!this.#initialized) throw new Error("O repositório relacional ainda não foi inicializado.");
  }

  #committedProgress() {
    return progressDocumentFromRows(
      this.#lessonProgressRows,
      this.#cardProgressRows,
      this.userId,
      this.#projectRows
    );
  }

  #hasUncommittedMemory() {
    return JSON.stringify(this.#progress) !== JSON.stringify(this.#committedProgress());
  }

  #notifyDurability() {
    this.#durabilityChangedAt = timestamp(this.clock);
    const state = this.getDurabilityState();
    this.#durabilityListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error("Listener de durabilidade falhou.", error);
      }
    });
  }

  getDurabilityState() {
    this.#assertInitialized();
    const hasUncommittedMemory = this.#hasUncommittedMemory();
    return Object.freeze({
      status: this.#durabilityError
        ? "error"
        : this.#pendingWrites > 0 || hasUncommittedMemory ? "pending" : "saved",
      pendingWrites: this.#pendingWrites,
      hasUncommittedMemory,
      error: this.#durabilityError ? Object.freeze({
        name: this.#durabilityError.name || "Error",
        message: this.#durabilityError.message || String(this.#durabilityError)
      }) : null,
      changedAt: this.#durabilityChangedAt
    });
  }

  onDurabilityChange(listener) {
    this.#assertInitialized();
    if (typeof listener !== "function") throw new TypeError("Listener de durabilidade inválido.");
    this.#durabilityListeners.add(listener);
    listener(this.getDurabilityState());
    return () => this.#durabilityListeners.delete(listener);
  }

  #enqueue(task, {
    retryable = true,
    durabilityKey = null,
    durabilityVersion = null
  } = {}) {
    const normalizedDurabilityKey = durabilityKey === null ? null : String(durabilityKey);
    const normalizedDurabilityVersion = Number(durabilityVersion);
    const hasDurabilityVersion = normalizedDurabilityKey !== null &&
      Number.isSafeInteger(normalizedDurabilityVersion) && normalizedDurabilityVersion > 0;
    const failedTask = Object.freeze({
      task,
      durabilityKey: hasDurabilityVersion ? normalizedDurabilityKey : null,
      durabilityVersion: hasDurabilityVersion ? normalizedDurabilityVersion : null
    });
    if (hasDurabilityVersion) {
      this.#latestDurabilityTaskVersions.set(
        normalizedDurabilityKey,
        Math.max(
          Number(this.#latestDurabilityTaskVersions.get(normalizedDurabilityKey) || 0),
          normalizedDurabilityVersion
        )
      );
    }
    this.#pendingWrites += 1;
    this.#notifyDurability();
    const operation = this.#tail.then(task);
    void operation.catch(() => undefined);
    this.#tail = operation.then(
      () => {
        this.#pendingWrites -= 1;
        this.#failedDurabilityTasks = this.#failedDurabilityTasks.filter((entry) => {
          if (entry.task === task) return false;
          return !hasDurabilityVersion || entry.durabilityKey !== normalizedDurabilityKey ||
            Number(entry.durabilityVersion) > normalizedDurabilityVersion;
        });
        if (!this.#failedDurabilityTasks.length && !this.#hasUncommittedMemory()) {
          this.#durabilityError = null;
        }
        this.#notifyDurability();
      },
      (error) => {
        this.#pendingWrites -= 1;
        if (
          error?.code === "local_course_draft_changed" ||
          error?.code === "course_authoring_forbidden"
        ) {
          if (!this.#failedDurabilityTasks.length && !this.#hasUncommittedMemory()) {
            this.#durabilityError = null;
          }
        } else {
          this.#durabilityError = error instanceof Error ? error : new Error(String(error));
          if (retryable && !this.#failedDurabilityTasks.some((entry) => entry.task === task)) {
            this.#failedDurabilityTasks.push(failedTask);
          }
        }
        this.#notifyDurability();
      }
    );
    return operation;
  }

  #mergeAuxiliaryRows(appliedRows) {
    mergeAppliedRows(this.#selectionRows, appliedRows, "courseSelections");
    mergeAppliedRows(this.#lessonProgressRows, appliedRows, "lessonProgress");
    mergeAppliedRows(this.#cardProgressRows, appliedRows, "cardProgress");
    mergeAppliedRows(this.#commentRows, appliedRows, "comments");
    mergeAppliedRows(this.#studyPathRows, appliedRows, "studyPaths");
    mergeAppliedRows(this.#studyPathCourseRows, appliedRows, "studyPathCourses");
    if (appliedRows.some((entry) => ["lessonProgress", "cardProgress"].includes(entry.storeName))) {
      this.#progress = this.#committedProgress();
    }
  }

  #assembleStudyPaths(pathRows = this.#studyPathRows, itemRows = this.#studyPathCourseRows) {
    const contractKeys = new Map((this.#projectRows.courses || []).map((course) => [
      course.id,
      course.contractKey || course.id
    ]));
    const items = activeRows(itemRows, this.userId).sort(comparePositionAndIdentity);
    return activeRows(pathRows, this.userId)
      .sort(comparePositionAndIdentity)
      .map((path) => ({
        ...clone(path),
        courses: items.filter((item) => item.pathId === path.id).map((item) => ({
          ...clone(item),
          persistentCourseId: item.courseId,
          courseId: contractKeys.get(item.courseId) || item.courseId
        }))
      }));
  }

  loadStudyPaths() {
    this.#assertInitialized();
    return this.#assembleStudyPaths();
  }

  createStudyPath(title) {
    this.#assertInitialized();
    const normalizedTitle = String(title || "").trim();
    if (!this.userId) throw new Error("Entre na sua conta para criar uma trilha.");
    if (!normalizedTitle) throw new Error("Informe um nome para a trilha.");
    return this.#enqueue(async () => {
      const siblings = activeRows(this.#studyPathRows, this.userId)
        .sort(comparePositionAndIdentity);
      const next = {
        id: this.uuidFactory(),
        ownerId: this.userId,
        title: normalizedTitle,
        position: siblings.length,
        updatedAt: timestamp(this.clock)
      };
      const result = await this.mutations.applyMutations(
        normalizedPositionMutations("studyPaths", [...siblings, next], this.#studyPathRows)
      );
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(next);
    });
  }

  renameStudyPath(pathId, title) {
    this.#assertInitialized();
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) throw new Error("Informe um nome para a trilha.");
    return this.#enqueue(async () => {
      const previous = this.#studyPathRows.get(String(pathId));
      if (!isActive(previous) || previous.ownerId !== this.userId) throw new Error("Trilha não encontrada.");
      const next = { ...previous, title: normalizedTitle, updatedAt: timestamp(this.clock) };
      const result = await this.mutations.applyRowChange("studyPaths", previous, next);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(next);
    });
  }

  deleteStudyPath(pathId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const previous = this.#studyPathRows.get(String(pathId));
      if (!isActive(previous) || previous.ownerId !== this.userId) return null;
      const mutations = activeRows(this.#studyPathCourseRows, this.userId)
        .filter((row) => row.pathId === previous.id)
        .map((row) => makeMutation("studyPathCourses", row, null));
      mutations.push(makeMutation("studyPaths", previous, null));
      const remaining = activeRows(this.#studyPathRows, this.userId)
        .filter((row) => row.id !== previous.id)
        .sort(comparePositionAndIdentity);
      mutations.push(...normalizedPositionMutations("studyPaths", remaining, this.#studyPathRows));
      const result = await this.mutations.applyMutations(mutations);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(previous);
    });
  }

  moveStudyPath(pathId, direction) {
    this.#assertInitialized();
    const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    if (!delta) throw new Error("Direção de ordenação inválida.");
    return this.#enqueue(async () => {
      const current = this.#studyPathRows.get(String(pathId));
      if (!isActive(current) || current.ownerId !== this.userId) {
        throw new Error("Trilha não encontrada.");
      }
      const siblings = activeRows(this.#studyPathRows, this.userId)
        .sort(comparePositionAndIdentity);
      const index = siblings.findIndex((row) => row.id === current.id);
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= siblings.length) return null;
      siblings.splice(index, 1);
      siblings.splice(targetIndex, 0, current);
      const result = await this.mutations.applyMutations(
        normalizedPositionMutations("studyPaths", siblings, this.#studyPathRows)
      );
      this.#mergeAuxiliaryRows(result.appliedRows);
      return this.loadStudyPaths();
    });
  }

  addCourseToStudyPath(pathId, courseId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const path = this.#studyPathRows.get(String(pathId));
      if (!isActive(path) || path.ownerId !== this.userId) throw new Error("Trilha não encontrada.");
      const normalizedCourseId = String(courseId || "");
      const selection = activeRows(this.#selectionRows, this.userId)
        .find((row) => String(row.courseId) === normalizedCourseId);
      if (!selection) throw new Error("Curso não selecionado nesta conta.");
      const previous = activeRows(this.#studyPathCourseRows, this.userId)
        .find((row) => String(row.courseId) === normalizedCourseId) || null;
      if (previous?.pathId === path.id) return null;
      const siblings = activeRows(this.#studyPathCourseRows, this.userId)
        .filter((row) => row.pathId === path.id && row.id !== previous?.id)
        .sort(comparePositionAndIdentity);
      const next = {
        ...(previous || {}),
        id: previous?.id || await this.#naturalEntityId("studyPathCourses", normalizedCourseId),
        ownerId: this.userId,
        pathId: path.id,
        selectionId: selection.id,
        courseId: normalizedCourseId,
        position: siblings.length,
        updatedAt: timestamp(this.clock)
      };
      const sourceSiblings = previous
        ? activeRows(this.#studyPathCourseRows, this.userId)
          .filter((row) => row.pathId === previous.pathId && row.id !== previous.id)
          .sort(comparePositionAndIdentity)
        : [];
      const result = await this.mutations.applyMutations([
        ...normalizedPositionMutations(
          "studyPathCourses",
          sourceSiblings,
          this.#studyPathCourseRows
        ),
        ...normalizedPositionMutations(
          "studyPathCourses",
          [...siblings, next],
          this.#studyPathCourseRows
        )
      ]);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(next);
    });
  }

  removeCourseFromStudyPath(itemId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const previous = this.#studyPathCourseRows.get(String(itemId));
      if (!isActive(previous) || previous.ownerId !== this.userId) return null;
      const remaining = activeRows(this.#studyPathCourseRows, this.userId)
        .filter((row) => row.pathId === previous.pathId && row.id !== previous.id)
        .sort(comparePositionAndIdentity);
      const result = await this.mutations.applyMutations([
        makeMutation("studyPathCourses", previous, null),
        ...normalizedPositionMutations(
          "studyPathCourses",
          remaining,
          this.#studyPathCourseRows
        )
      ]);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(previous);
    });
  }

  moveCourseInStudyPath(itemId, direction) {
    this.#assertInitialized();
    const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    if (!delta) throw new Error("Direção de ordenação inválida.");
    return this.#enqueue(async () => {
      const current = this.#studyPathCourseRows.get(String(itemId));
      if (!isActive(current) || current.ownerId !== this.userId) throw new Error("Curso da trilha não encontrado.");
      const siblings = activeRows(this.#studyPathCourseRows, this.userId)
        .filter((row) => row.pathId === current.pathId)
        .sort(comparePositionAndIdentity);
      const index = siblings.findIndex((row) => row.id === current.id);
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= siblings.length) return null;
      siblings.splice(index, 1);
      siblings.splice(targetIndex, 0, current);
      const result = await this.mutations.applyMutations(
        normalizedPositionMutations("studyPathCourses", siblings, this.#studyPathCourseRows)
      );
      this.#mergeAuxiliaryRows(result.appliedRows);
      return this.loadStudyPaths();
    });
  }

  #courseRow(courseIdentity) {
    const requested = String(courseIdentity || "");
    return (this.#projectRows.courses || []).find((row) =>
      isActive(row) && (String(row.id) === requested || String(row.contractKey) === requested)
    ) || null;
  }

  #courseSelectionRow(courseId) {
    return activeRows(this.#selectionRows, this.userId).find((row) =>
      String(row.courseId) === String(courseId)
    ) || null;
  }

  coursePermissions(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) return deniedCoursePermissions();
    const selection = this.#courseSelectionRow(course.id);
    if (!selection) return deniedCoursePermissions();
    const courseOrigin = requireCourseOrigin(selection);
    const canAuthorContent = courseOrigin === "private" || this.#catalogManagementAllowed;
    const writeTarget = canAuthorContent ? courseOrigin : null;
    const canDeleteCourse = canAuthorContent;
    return {
      role: courseOrigin === "private"
        ? "owner"
        : this.#catalogManagementAllowed
          ? "editor"
          : "learner",
      canAuthorContent,
      writeTarget,
      canOrganizeSelection: true,
      canRemoveSelection: true,
      canDeleteCourse,
      canEdit: canAuthorContent,
      canDelete: canDeleteCourse,
      requiresFork: false
    };
  }

  setCatalogManagementAllowed(value) {
    this.#catalogManagementAllowed = value === true;
  }

  canEditCourse(courseIdentity) {
    return this.coursePermissions(courseIdentity).canEdit;
  }

  resolveCourseContractKey(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    return course ? String(course.contractKey || course.id) : "";
  }

  loadProject() {
    this.#assertInitialized();
    return clone(this.#project);
  }

  loadCourseSummaries() {
    this.#assertInitialized();
    const courseById = new Map((this.#projectRows.courses || []).map((course) => [
      String(course.id),
      course
    ]));
    return activeRows(this.#selectionRows, this.userId)
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
      .map((selection) => {
        const course = courseById.get(String(selection.courseId)) || {};
        return {
          courseId: selection.courseId,
          courseKey: course.contractKey || course.id || selection.courseId,
          selectionId: selection.id,
          title: course.title || selection.title || "Curso",
          goal: course.goal || selection.goal || "",
          publicationSeq: selection.publicationSeq || course.publicationSeq || 0,
          contentHash: selection.contentHash || course.contentHash || "",
          courseOrigin: selection.courseOrigin,
          isSelected: true
        };
      });
  }

  async getLocalCourseDraft(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) return null;
    const selection = this.#courseSelectionRow(course.id);
    if (!selection) {
      throw new Error("O curso local não possui uma seleção ativa nesta conta.");
    }
    const courseOrigin = requireCourseOrigin(selection);
    const draft = await this.store.getLocalCourseDraft(course.id);
    return draft
      ? {
          ...draft,
          courseKey: course.contractKey || course.id,
          courseOrigin
        }
      : null;
  }

  createLocalCourseDraftGuard(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const selection = this.#courseSelectionRow(course.id);
    if (!selection) {
      throw new Error("O curso local não possui uma seleção ativa nesta conta.");
    }
    requireCourseOrigin(selection);
    const permissions = this.coursePermissions(course.id);
    if (!permissions.canAuthorContent || permissions.writeTarget === null) {
      throw courseAuthoringDenied(course.id);
    }
    return Object.freeze({
      contract: "aralearn.local-course-draft-guard.v1",
      courseId: String(course.id),
      courseKey: String(course.contractKey || course.id),
      expectedRevision: this.#localDraftRevisions.get(String(course.id)) || null
    });
  }

  async loadCardAssistanceLocalState(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) return null;
    return this.store.getSyncState(cardAssistanceLocalStateId(course.id));
  }

  async saveCardAssistanceLocalState(courseIdentity, value) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const courseKey = String(course.contractKey || course.id);
    const normalized = normalizeCardAssistanceStateForCourse(value, courseKey);
    return this.store.putSyncState(cardAssistanceLocalStateId(course.id), normalized);
  }

  async finalizeCardAssistanceSync(courseIdentity, {
    expectedLocalDraftRevision
  } = {}) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const consumedRevision = String(expectedLocalDraftRevision || "").trim();
    if (!consumedRevision) {
      throw new TypeError("A finalização exige a revisão local materializada.");
    }
    const courseId = String(course.id);
    const stateId = cardAssistanceLocalStateId(courseId);
    const draftId = localCourseAuthoringStateId(courseId);
    const result = await this.#enqueue(async () => {
      const finalized = await this.store.transaction(
        ["syncState"],
        "readwrite",
        async (transaction) => {
          const currentDraftRow = await transaction.get("syncState", draftId);
          const actualRevision = currentDraftRow?.value?.status === "dirty"
            ? String(currentDraftRow.value.revision || "").trim() || null
            : null;
          if (actualRevision !== null) {
            throw new LocalCourseDraftChangedError(courseId, null, actualRevision);
          }
          const currentStateRow = await transaction.get("syncState", stateId);
          if (!currentStateRow) return null;
          if (currentStateRow.value?.contract !== CARD_ASSISTANCE_LOCAL_STATE_CONTRACT) {
            await transaction.delete("syncState", stateId);
            return null;
          }
          const nextState = normalizeCardAssistanceStateForCourse(
            currentStateRow.value,
            String(course.contractKey || course.id)
          );
          const syncRevision = String(nextState.sync.expectedRevision || "").trim() || null;
          if (nextState.sync.pendingPaths.length && syncRevision !== consumedRevision) {
            throw new LocalCourseDraftChangedError(
              courseId,
              consumedRevision,
              syncRevision
            );
          }
          nextState.sync.pendingPaths = [];
          nextState.sync.expectedRevision = null;
          if (nextState.undo?.expectedRevision === consumedRevision) {
            nextState.undo.expectedRevision = null;
          }
          const updatedAt = timestamp(this.clock);
          await transaction.put("syncState", {
            ...currentStateRow,
            id: stateId,
            key: stateId,
            courseId,
            value: nextState,
            updatedAt
          });
          return nextState;
        }
      );
      await this.#reloadFromStore();
      return clone(finalized);
    }, { retryable: false });
    return result;
  }

  async discardLocalCourseDraft(courseIdentity, restoredGraph, options = {}) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const selection = this.#courseSelectionRow(course.id);
    if (!selection) {
      throw new Error("O curso local não possui uma seleção ativa nesta conta.");
    }
    const courseOrigin = requireCourseOrigin(selection);
    await this.flush();
    const result = await this.store.discardLocalCourseDraft(
      course.id,
      restoredGraph,
      {
        expectedRevision: options.expectedRevision,
        expectedSelectionId: selection.id,
        expectedPublicationSeq: selection.publicationSeq,
        expectedContentHash: selection.contentHash,
        expectedCourseOrigin: courseOrigin,
        receivedAt: options.receivedAt,
        validate: options.validate
      }
    );
    await this.#reloadFromStore();
    return {
      ...result,
      courseKey: course.contractKey || course.id,
      courseOrigin
    };
  }

  #assertSelectedCourseContentMutations(mutations) {
    const selectedCourseIds = new Set(
      activeRows(this.#selectionRows, this.userId).map((row) => String(row.courseId))
    );
    for (const mutation of mutations) {
      if (mutation.storeName === "projectMeta") continue;
      const courseId = String(
        mutation.courseId ||
        mutation.nextRow?.courseId ||
        mutation.previousRow?.courseId ||
        (mutation.storeName === "courses" ? mutation.entityId : "")
      );
      const course = (this.#projectRows.courses || []).find((row) => String(row.id) === courseId);
      if (!course || !selectedCourseIds.has(courseId)) {
        throw new Error("A autoria local só pode alterar um curso selecionado nesta conta.");
      }
      const permissions = this.coursePermissions(courseId);
      if (!permissions.canAuthorContent || permissions.writeTarget === null) {
        throw courseAuthoringDenied(courseId);
      }
      mutation.courseId = courseId;
    }
  }

  async #localAuthoringStateRows(
    courseIds,
    { expectedLocalDraftRevision = undefined } = {}
  ) {
    const now = timestamp(this.clock);
    return Promise.all([...courseIds].map(async (courseId) => {
      const [replicaState, currentDraft] = await Promise.all([
        this.store.getOfficialCourseReplicaState?.(courseId),
        this.store.getLocalCourseDraft?.(courseId)
      ]);
      const trackedRevision = this.#localDraftRevisions.get(String(courseId)) || null;
      const expectedRevision = expectedLocalDraftRevision === undefined
        ? trackedRevision
        : expectedLocalDraftRevision;
      const actualRevision = currentDraft?.revision || null;
      if (actualRevision !== expectedRevision) {
        throw new LocalCourseDraftChangedError(
          String(courseId),
          expectedRevision,
          actualRevision
        );
      }
      const currentValue = currentDraft && typeof currentDraft === "object"
        ? currentDraft
        : {};
      const id = localCourseAuthoringStateId(courseId);
      return {
        storeName: "syncState",
        row: {
          id,
          key: id,
          courseId,
          value: {
            status: "dirty",
            revision: defaultUuidFactory(),
            basePublicationSeq: Number(
              currentValue.basePublicationSeq ?? replicaState?.publicationSeq ?? 0
            ),
            baseContentHash: String(
              currentValue.baseContentHash ?? replicaState?.contentHash ?? ""
            ),
            createdAt: currentValue.createdAt || now,
            updatedAt: now
          },
          updatedAt: now
        },
        expectedLocalDraftRevision: expectedRevision
      };
    }));
  }

  saveProject(projectDocument, {
    scope = null,
    expectedLocalDraftRevision = undefined,
    cardAssistanceLocalState = undefined,
    cardAssistanceCourseIdentity = null
  } = {}) {
    this.#assertInitialized();
    const normalized = normalizeProject(projectDocument);
    this.differ.normalize(normalized);
    const snapshot = clone(normalized);
    let assistanceCourse = null;
    let assistanceState = null;
    try {
      if (cardAssistanceLocalState !== undefined) {
        assistanceCourse = this.#courseRow(cardAssistanceCourseIdentity);
        if (!assistanceCourse) {
          throw new Error("O curso do estado contextual não foi encontrado.");
        }
        const permissions = this.coursePermissions(assistanceCourse.id);
        if (!permissions.canAuthorContent || permissions.writeTarget === null) {
          throw courseAuthoringDenied(assistanceCourse.id);
        }
        assistanceState = normalizeCardAssistanceStateForCourse(
          cardAssistanceLocalState,
          String(assistanceCourse.contractKey || assistanceCourse.id)
        );
      }
      const preflight = this.differ.diff(this.#committedProject, snapshot, {
        previousRows: this.#projectRows,
        ...(scope ? { scope } : {})
      });
      const preflightMutations = preflight.mutations.filter(
        (mutation) => mutation.storeName !== "projectMeta"
      );
      this.#assertSelectedCourseContentMutations(preflightMutations);
      if (assistanceCourse) {
        const preflightCourseIds = new Set(
          preflightMutations.map((mutation) => String(mutation.courseId))
        );
        if (
          preflightCourseIds.size > 1 ||
          (preflightCourseIds.size === 1 && !preflightCourseIds.has(String(assistanceCourse.id)))
        ) {
          throw cardAssistanceStateError(
            "O conteúdo e o estado contextual precisam pertencer ao mesmo curso."
          );
        }
      }
    } catch (error) {
      return Promise.reject(error);
    }
    const saveNumber = ++this.#latestProjectSave;
    this.#project = clone(snapshot);

    return this.#enqueue(async () => {
      try {
        const diff = this.differ.diff(this.#committedProject, snapshot, {
          previousRows: this.#projectRows,
          ...(scope ? { scope } : {})
        });
        const mutations = diff.mutations.filter((mutation) => mutation.storeName !== "projectMeta");
        this.#assertSelectedCourseContentMutations(mutations);
        const changedCourseIds = new Set(mutations.map((mutation) => String(mutation.courseId)));
        if (
          assistanceCourse &&
          (changedCourseIds.size > 1 ||
            (changedCourseIds.size === 1 &&
              !changedCourseIds.has(String(assistanceCourse.id))))
        ) {
          throw cardAssistanceStateError(
            "O conteúdo e o estado contextual precisam pertencer ao mesmo curso."
          );
        }
        const localRows = [];
        if (mutations.length) {
          if (expectedLocalDraftRevision !== undefined && changedCourseIds.size !== 1) {
            throw new Error("O guard de rascunho exige a alteração de um único curso.");
          }
          localRows.push(...await this.#localAuthoringStateRows(changedCourseIds, {
            expectedLocalDraftRevision
          }));
        }
        if (assistanceCourse) {
          const nextAssistanceState = clone(assistanceState);
          let committedRevision = null;
          if (mutations.length) {
            const localDraftRow = localRows.find((entry) =>
              entry.row?.id === localCourseAuthoringStateId(assistanceCourse.id)
            );
            committedRevision = String(localDraftRow?.row?.value?.revision || "").trim();
            if (!committedRevision) {
              throw new Error("A alteração contextual não produziu uma revisão local válida.");
            }
          }
          if (committedRevision && nextAssistanceState.undo) {
            nextAssistanceState.undo.expectedRevision = committedRevision;
          }
          if (committedRevision && nextAssistanceState.sync.pendingPaths.length) {
            nextAssistanceState.sync.expectedRevision = committedRevision;
          }
          const stateId = cardAssistanceLocalStateId(assistanceCourse.id);
          localRows.push({
            storeName: "syncState",
            row: {
              id: stateId,
              key: stateId,
              courseId: String(assistanceCourse.id),
              value: nextAssistanceState,
              updatedAt: timestamp(this.clock)
            }
          });
        }
        if (mutations.length || localRows.length) {
          await this.mutations.applyMutations(mutations, { localRows });
        }
        await this.#reloadFromStore();
        if (saveNumber === this.#latestProjectSave) this.#project = clone(snapshot);
        return clone(snapshot);
      } catch (error) {
        if (
          error?.code === "local_course_draft_changed" ||
          error?.code === "course_authoring_forbidden"
        ) {
          await this.#reloadFromStore();
        }
        throw error;
      }
    }, {
      durabilityKey: "project",
      durabilityVersion: saveNumber
    });
  }

  async saveProjectWithCardAssistanceState(projectDocument, {
    courseIdentity,
    localState,
    scope = null,
    expectedLocalDraftRevision = undefined
  } = {}) {
    if (localState === undefined) {
      throw new TypeError("Informe o estado local da alteração contextual.");
    }
    const savedProject = await this.saveProject(projectDocument, {
      scope,
      expectedLocalDraftRevision,
      cardAssistanceLocalState: localState,
      cardAssistanceCourseIdentity: courseIdentity
    });
    return {
      projectDocument: savedProject,
      localState: await this.loadCardAssistanceLocalState(courseIdentity)
    };
  }

  replaceMicrosequenceCards(projectDocument, microsequenceId) {
    this.#assertInitialized();
    const normalized = normalizeProject(projectDocument);
    this.differ.replaceMicrosequenceCards(
      this.#committedProject,
      normalized,
      microsequenceId,
      { previousRows: this.#projectRows }
    );
    return this.saveProject(normalized, {
      scope: { type: "microsequence", id: microsequenceId, cardsOnly: true }
    });
  }

  saveMicrosequenceGeneration(
    projectDocument,
    microsequenceId,
    {
      expectedLocalDraftRevision = undefined,
      cardAssistanceLocalState = undefined,
      cardAssistanceCourseIdentity = null
    } = {}
  ) {
    this.#assertInitialized();
    const normalized = normalizeProject(projectDocument);
    this.differ.replaceMicrosequence(
      this.#committedProject,
      normalized,
      microsequenceId,
      { previousRows: this.#projectRows }
    );
    return this.saveProject(normalized, {
      expectedLocalDraftRevision,
      cardAssistanceLocalState,
      cardAssistanceCourseIdentity,
      scope: {
        type: "microsequence",
        id: microsequenceId,
        cardsOnly: false,
        rejectOutOfScope: true
      }
    });
  }

  #findProjectReference(pathKey) {
    const [courseKey, moduleKey, lessonKey] = String(pathKey).split("::");
    const course = (this.#projectRows.courses || []).find((row) =>
      isActive(row) && row.contractKey === courseKey
    );
    const moduleValue = (this.#projectRows.modules || []).find((row) =>
      isActive(row) && row.courseId === course?.id && row.contractKey === moduleKey
    );
    const lesson = (this.#projectRows.lessons || []).find((row) =>
      isActive(row) && row.moduleId === moduleValue?.id && row.contractKey === lessonKey
    );
    const microsequencePositions = new Map(
      (this.#projectRows.microsequences || [])
        .filter((row) => isActive(row) && row.lessonId === lesson?.id)
        .map((row) => [row.id, Number(row.position || 0)])
    );
    const cards = (this.#projectRows.cards || [])
      .filter((row) => isActive(row) && row.lessonId === lesson?.id)
      .sort((left, right) =>
        (microsequencePositions.get(left.microsequenceId) || 0) -
          (microsequencePositions.get(right.microsequenceId) || 0) ||
        Number(left.position || 0) - Number(right.position || 0)
      );
    return { courseKey, moduleKey, lessonKey, course, moduleValue, lesson, cards };
  }

  resolveCardReference({
    courseKey,
    moduleKey,
    lessonKey,
    microsequenceKey,
    cardKey
  } = {}) {
    this.#assertInitialized();
    const reference = this.#findProjectReference(`${courseKey || ""}::${moduleKey || ""}::${lessonKey || ""}`);
    const microsequence = (this.#projectRows.microsequences || []).find((row) =>
      isActive(row) && row.lessonId === reference.lesson?.id && row.contractKey === microsequenceKey
    );
    const card = (this.#projectRows.cards || []).find((row) =>
      isActive(row) && row.microsequenceId === microsequence?.id && row.contractKey === cardKey
    );
    if (!reference.course || !reference.moduleValue || !reference.lesson || !microsequence || !card) return null;
    return clone({
      courseId: reference.course.id,
      moduleId: reference.moduleValue.id,
      lessonId: reference.lesson.id,
      microsequenceId: microsequence.id,
      cardId: card.id,
      cardTitle: card.title || card.contractKey || cardKey,
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      cardKey
    });
  }

  async #naturalEntityId(entityType, entityId) {
    return this.naturalKeyIdFactory(relationalNaturalKey(entityType, this.userId, entityId));
  }

  #rowPathKey(row) {
    return row.pathKey || projectIndexes(this.#projectRows).lessonPaths.get(row.lessonId)?.pathKey || "";
  }

  async #progressRowsFromDocument(progressDocument, removedPathKeys = new Set()) {
    const now = timestamp(this.clock);
    const activeLessons = activeRows(this.#lessonProgressRows, this.userId);
    const activeCards = activeRows(this.#cardProgressRows, this.userId);
    const desiredLessons = new Map(activeLessons
      .filter((row) => !removedPathKeys.has(this.#rowPathKey(row)))
      .map((row) => [row.id, row]));
    const desiredCards = new Map(activeCards
      .filter((row) => !removedPathKeys.has(this.#rowPathKey(row)))
      .map((row) => [row.id, row]));

    for (const [pathKey, entry] of Object.entries(progressDocument.lessons)) {
      const reference = this.#findProjectReference(pathKey);
      if (!reference.course || !reference.moduleValue || !reference.lesson) {
        throw new Error(`Não foi possível resolver a lição do progresso: "${pathKey}".`);
      }
      const previousLesson = activeLessons.find((row) => row.lessonId === reference.lesson.id) || null;
      const lessonProgressId = previousLesson?.id || await this.#naturalEntityId(
        "lessonProgress",
        reference.lesson.id
      );
      const changedAt = canonicalProgressTimestamp(entry.updatedAt) || now;
      const lessonRow = {
        ...(previousLesson || {}),
        id: lessonProgressId,
        userId: this.userId,
        courseId: reference.course.id,
        moduleId: reference.moduleValue.id,
        lessonId: reference.lesson.id,
        pathKey,
        cursor: Number(entry.cursor ?? -1),
        completedAt: entry.completedCardKeys.length >= reference.cards.length && reference.cards.length
          ? previousLesson?.completedAt || changedAt
          : null,
        updatedAt: changedAt
      };
      desiredLessons.set(lessonRow.id, lessonRow);

      for (const [position, cardKey] of entry.completedCardKeys.entries()) {
        const card = reference.cards.find((row) => row.contractKey === cardKey);
        if (!card) throw new Error(`Não foi possível resolver o card de progresso: "${cardKey}".`);
        const previousCard = activeCards.find((row) => row.cardId === card.id) || null;
        const cardProgressId = previousCard?.id || await this.#naturalEntityId("cardProgress", card.id);
        desiredCards.set(cardProgressId, {
          ...(previousCard || {}),
          id: cardProgressId,
          userId: this.userId,
          courseId: reference.course.id,
          moduleId: reference.moduleValue.id,
          lessonId: reference.lesson.id,
          lessonProgressId: lessonRow.id,
          cardId: card.id,
          pathKey,
          cardKey,
          position,
          completedAt: previousCard?.completedAt || changedAt,
          reviewMarkedAt: previousCard?.reviewMarkedAt || null,
          updatedAt: changedAt
        });
      }
    }
    return {
      lessonProgress: [...desiredLessons.values()],
      cardProgress: [...desiredCards.values()]
    };
  }

  loadProgress() {
    this.#assertInitialized();
    return clone(this.#progress);
  }

  saveProgress(progressDocument) {
    this.#assertInitialized();
    const normalized = validateProgressDocument(progressDocument);
    const removed = new Set(Object.keys(this.#progress.lessons)
      .filter((pathKey) => !(pathKey in normalized.lessons)));
    return this.#saveProgressSnapshot(normalized, removed);
  }

  #saveProgressSnapshot(progressDocument, removedPathKeys = new Set()) {
    const normalized = validateProgressDocument(progressDocument);
    const snapshot = clone(normalized);
    const saveNumber = ++this.#latestProgressSave;
    this.#progress = clone(snapshot);
    return this.#enqueue(async () => {
      const desired = await this.#progressRowsFromDocument(snapshot, removedPathKeys);
      const result = await this.mutations.applyMutations([
        ...diffRowMaps("lessonProgress", new Map(activeRows(this.#lessonProgressRows, this.userId).map((row) => [row.id, row])), desired.lessonProgress),
        ...diffRowMaps("cardProgress", new Map(activeRows(this.#cardProgressRows, this.userId).map((row) => [row.id, row])), desired.cardProgress)
      ]);
      this.#mergeAuxiliaryRows(result.appliedRows);
      if (saveNumber === this.#latestProgressSave) this.#progress = this.#committedProgress();
      return clone(snapshot);
    }, {
      durabilityKey: "progress",
      durabilityVersion: saveNumber
    });
  }

  removeProgressEntries(lessonReferences) {
    const snapshot = removeLessonProgressEntries(this.#progress, lessonReferences);
    return this.#saveProgressSnapshot(snapshot, new Set(lessonReferences.map(buildLessonProgressKey)));
  }

  clearProgress() {
    const paths = new Set(activeRows(this.#lessonProgressRows, this.userId).map((row) => this.#rowPathKey(row)));
    return this.#saveProgressSnapshot(createEmptyProgressDocument(), paths);
  }

  loadLessonProgress(lessonId, userId = this.userId) {
    const currentUserId = requireCurrentUser(userId, this.userId);
    return clone(activeRows(this.#lessonProgressRows, currentUserId)
      .find((row) => row.lessonId === lessonId) || null);
  }

  loadCardProgress(cardId, userId = this.userId) {
    const currentUserId = requireCurrentUser(userId, this.userId);
    return clone(activeRows(this.#cardProgressRows, currentUserId)
      .find((row) => row.cardId === cardId) || null);
  }

  saveLessonProgress(row) {
    this.#assertInitialized();
    const input = clone(row);
    const currentUserId = requireCurrentUser(input.userId, this.userId);
    return this.#enqueue(async () => {
      const previous = activeRows(this.#lessonProgressRows, currentUserId)
        .find((entry) => entry.lessonId === input.lessonId) || null;
      const next = {
        ...input,
        id: previous?.id || input.id || await this.#naturalEntityId("lessonProgress", input.lessonId),
        userId: currentUserId,
        updatedAt: input.updatedAt || timestamp(this.clock)
      };
      const result = await this.mutations.applyRowChange("lessonProgress", previous, next);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(next);
    });
  }

  saveCardProgress(row) {
    this.#assertInitialized();
    const input = clone(row);
    const currentUserId = requireCurrentUser(input.userId, this.userId);
    return this.#enqueue(async () => {
      const previous = activeRows(this.#cardProgressRows, currentUserId)
        .find((entry) => entry.cardId === input.cardId) || null;
      const next = {
        ...input,
        id: previous?.id || input.id || await this.#naturalEntityId("cardProgress", input.cardId),
        userId: currentUserId,
        updatedAt: input.updatedAt || timestamp(this.clock)
      };
      const result = await this.mutations.applyRowChange("cardProgress", previous, next);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(next);
    });
  }

  isCardMarkedForReview(reference) {
    this.#assertInitialized();
    const resolved = this.resolveCardReference(reference);
    if (!resolved) return false;
    return Boolean(activeRows(this.#cardProgressRows, this.userId)
      .find((row) => row.cardId === resolved.cardId)?.reviewMarkedAt);
  }

  setCardReviewMark(reference, marked) {
    this.#assertInitialized();
    const resolved = this.resolveCardReference(reference);
    if (!this.userId) throw new Error("A marca de revisão exige um usuário autenticado.");
    if (!resolved) throw new Error("Não foi possível resolver o card marcado para revisão.");
    const shouldMark = marked === true;
    return this.#enqueue(async () => {
      const previous = activeRows(this.#cardProgressRows, this.userId)
        .find((row) => row.cardId === resolved.cardId) || null;
      if (!shouldMark && !previous) return null;
      const now = timestamp(this.clock);
      const next = !shouldMark && !previous?.completedAt
        ? null
        : {
            ...(previous || {}),
            id: previous?.id || await this.#naturalEntityId("cardProgress", resolved.cardId),
            userId: this.userId,
            courseId: resolved.courseId,
            moduleId: resolved.moduleId,
            lessonId: resolved.lessonId,
            cardId: resolved.cardId,
            pathKey: `${resolved.courseKey}::${resolved.moduleKey}::${resolved.lessonKey}`,
            cardKey: resolved.cardKey,
            completedAt: previous?.completedAt || null,
            reviewMarkedAt: shouldMark ? now : null,
            updatedAt: now
          };
      const result = await this.mutations.applyMutations([
        makeMutation("cardProgress", previous, next)
      ]);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(next);
    });
  }

  loadReviewItems() {
    this.#assertInitialized();
    const markedByCardId = new Map(activeRows(this.#cardProgressRows, this.userId)
      .filter((row) => row.reviewMarkedAt)
      .map((row) => [String(row.cardId), row]));
    const items = [];
    for (const course of this.#project.courses || []) {
      for (const moduleValue of course.modules || []) {
        for (const lesson of moduleValue.lessons || []) {
          for (const microsequence of lesson.microsequences || []) {
            for (const card of microsequence.cards || []) {
              const resolved = this.resolveCardReference({
                courseKey: course.id,
                moduleKey: moduleValue.id,
                lessonKey: lesson.id,
                microsequenceKey: microsequence.id,
                cardKey: card.id
              });
              const row = resolved ? markedByCardId.get(String(resolved.cardId)) : null;
              if (!row) continue;
              items.push({
                cardId: resolved.cardId,
                title: card.title || card.id,
                context: `${course.title} · ${lesson.title}`,
                reviewMarkedAt: row.reviewMarkedAt,
                entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id, card.id]
              });
            }
          }
        }
      }
    }
    return items.sort((left, right) =>
      String(right.reviewMarkedAt).localeCompare(String(left.reviewMarkedAt)) ||
      String(left.title).localeCompare(String(right.title), "pt-BR")
    );
  }

  loadPersonalObservationItems() {
    this.#assertInitialized();
    const commentsByCardId = new Map(activeRows(this.#commentRows, this.userId)
      .map((row) => [String(row.cardId), row]));
    const items = [];
    for (const course of this.#project.courses || []) {
      for (const moduleValue of course.modules || []) {
        for (const lesson of moduleValue.lessons || []) {
          for (const microsequence of lesson.microsequences || []) {
            for (const card of microsequence.cards || []) {
              const resolved = this.resolveCardReference({
                courseKey: course.id,
                moduleKey: moduleValue.id,
                lessonKey: lesson.id,
                microsequenceKey: microsequence.id,
                cardKey: card.id
              });
              const row = resolved ? commentsByCardId.get(String(resolved.cardId)) : null;
              if (!row) continue;
              items.push({
                commentId: row.id,
                cardId: resolved.cardId,
                title: card.title || card.id,
                context: `${course.title} · ${lesson.title}`,
                category: row.category,
                body: row.body,
                updatedAt: row.updatedAt,
                entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id, card.id]
              });
            }
          }
        }
      }
    }
    return items.sort((left, right) =>
      String(right.updatedAt).localeCompare(String(left.updatedAt)) ||
      String(left.title).localeCompare(String(right.title), "pt-BR")
    );
  }

  loadComments({ courseId, cardId, userId, includeDeleted = false } = {}) {
    const currentUserId = requireCurrentUser(userId, this.userId);
    return [...this.#commentRows.values()]
      .filter((row) => includeDeleted || isActive(row))
      .filter((row) => courseId === undefined || row.courseId === courseId)
      .filter((row) => cardId === undefined || row.cardId === cardId)
      .filter((row) => row.userId === currentUserId)
      .map(clone);
  }

  loadCommentForPath(reference, userId = this.userId) {
    const currentUserId = requireCurrentUser(userId, this.userId);
    const resolved = this.resolveCardReference(reference);
    if (!resolved) return null;
    return clone(activeRows(this.#commentRows, currentUserId)
      .find((row) => row.cardId === resolved.cardId) || null);
  }

  async saveCommentForPath(reference, draft, userId = this.userId) {
    const currentUserId = requireCurrentUser(userId, this.userId);
    const resolved = this.resolveCardReference(reference);
    if (!resolved) throw new Error("Card não encontrado para persistir comentário.");
    const previous = activeRows(this.#commentRows, currentUserId)
      .find((row) => row.cardId === resolved.cardId);
    const normalizedDraft = normalizePedagogicalCommentDraft(draft);
    return this.saveComment({
      ...resolved,
      id: previous?.id,
      userId: currentUserId,
      ...normalizedDraft,
      status: previous?.status || "open",
      createdAt: previous?.createdAt || timestamp(this.clock)
    });
  }

  async deleteCommentForPath(reference, userId = this.userId) {
    const currentUserId = requireCurrentUser(userId, this.userId);
    const resolved = this.resolveCardReference(reference);
    if (!resolved) throw new Error("Card não encontrado para retirar a observação.");
    const previous = activeRows(this.#commentRows, currentUserId)
      .find((row) => row.cardId === resolved.cardId);
    return previous ? this.deleteComment(previous.id) : null;
  }

  saveComment(comment) {
    this.#assertInitialized();
    if (!comment?.cardId) throw new Error("Comentário relacional exige cardId.");
    const input = clone(comment);
    const normalizedDraft = normalizePedagogicalCommentDraft(input);
    const currentUserId = requireCurrentUser(input.userId, this.userId);
    return this.#enqueue(async () => {
      const previous = activeRows(this.#commentRows, currentUserId)
        .find((row) => row.cardId === input.cardId) || null;
      const next = {
        ...input,
        id: previous?.id || input.id || await this.#naturalEntityId("comments", input.cardId),
        userId: currentUserId,
        category: normalizedDraft.category,
        body: normalizedDraft.body,
        status: previous?.status || "open",
        updatedAt: timestamp(this.clock)
      };
      const mutationResult = await this.mutations.applyRowChange("comments", previous, next);
      this.#mergeAuxiliaryRows(mutationResult.appliedRows);
      return clone(next);
    });
  }

  deleteComment(commentId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const previous = this.#commentRows.get(String(commentId));
      if (!isActive(previous)) return null;
      const result = await this.mutations.applyRowChange("comments", previous, null);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(previous);
    });
  }

  exportJson() {
    this.#assertInitialized();
    return JSON.stringify(this.#project, null, 2);
  }

  async importJson(rawJson) {
    this.#assertInitialized();
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (error) {
      throw new Error(`JSON AraLearn inválido para importação: ${error.message}`, { cause: error });
    }
    normalizeProject(parsed);
    throw new Error("A importação autoral não faz parte do aplicativo estudantil.");
  }

  async flush() {
    this.#assertInitialized();
    await this.#tail;
    try {
      await this.store.flush();
    } catch (error) {
      this.#durabilityError = error instanceof Error ? error : new Error(String(error));
      this.#notifyDurability();
    }
    if (this.#durabilityError) throw this.#durabilityError;
  }

  async retryDurability() {
    this.#assertInitialized();
    const failedTasks = this.#failedDurabilityTasks.splice(0);
    this.#durabilityError = null;
    const operations = failedTasks
      .filter((entry) => entry.durabilityKey === null ||
        Number(this.#latestDurabilityTaskVersions.get(entry.durabilityKey) || 0) <=
          Number(entry.durabilityVersion || 0))
      .map((entry) => this.#enqueue(entry.task, {
        durabilityKey: entry.durabilityKey,
        durabilityVersion: entry.durabilityVersion
      }));
    if (JSON.stringify(this.#progress) !== JSON.stringify(this.#committedProgress())) {
      operations.push(this.saveProgress(this.#progress));
    }
    if (operations.length) await Promise.all(operations);
    await this.flush();
    this.#notifyDurability();
    return this.getDurabilityState();
  }

  async close() {
    await this.flush();
    this.store.close();
  }
}

export async function createRelationalProjectRepository(options = {}) {
  return RelationalProjectRepository.open(options);
}
