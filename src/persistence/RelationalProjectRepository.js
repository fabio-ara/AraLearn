import {
  createEmptyProjectDocument,
  validateProjectDocument
} from "../domain/aralearnProject.js";
import {
  buildLessonProgressKey,
  createEmptyProgressDocument,
  removeLessonProgressEntries,
  validateProgressDocument
} from "../storage/progressStore.js";
import {
  DomainMutationService,
  PRIVATE_COURSE_CREATE_OUTBOX_KIND
} from "./DomainMutationService.js";
import {
  IndexedDbRelationalStore,
  PROJECT_ROW_STORE_NAMES
} from "./IndexedDbRelationalStore.js";
import { ProjectDocumentAssembler } from "./ProjectDocumentAssembler.js";
import { ProjectDocumentDiffer } from "./ProjectDocumentDiffer.js";
import { deterministicUuid, relationalNaturalKey } from "./deterministicUuid.js";
import { defaultUuidFactory } from "./relationalSchema.js";

const VOLATILE_ROW_FIELDS = new Set(["updatedAt", "deletedAt"]);

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

function activeRows(rows, userId = undefined) {
  return [...rows.values()].filter((row) => isActive(row) && (
    userId === undefined || row.userId === userId || row.ownerId === userId
  ));
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
  const error = new Error(`Documento AraLearn v3 inválido${details ? `: ${details}` : "."}`);
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

function privateImportContentMutations(mutations, importId) {
  const inserts = [];
  const deferredFlowCaseLinks = [];
  mutations.forEach((mutation) => {
    if (mutation.storeName === "projectMeta" || mutation.storeName === "courses") return;
    if (mutation.previousRow || mutation.operation !== "upsert" || !mutation.nextRow) {
      throw new Error("A importação privada só pode acrescentar uma árvore nova.");
    }
    const tagged = { ...mutation, importId };
    if (mutation.storeName === "flowNodes" && mutation.nextRow.parentCaseId) {
      const initialRow = { ...clone(mutation.nextRow), parentCaseId: null };
      inserts.push({ ...tagged, nextRow: initialRow });
      deferredFlowCaseLinks.push({
        ...tagged,
        previousRow: initialRow,
        nextRow: clone(mutation.nextRow),
        changedFields: ["parentCaseId"]
      });
      return;
    }
    inserts.push(tagged);
  });
  return [...inserts, ...deferredFlowCaseLinks];
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
    const activityTimes = [
      row.lastActivityAt,
      row.updatedAt,
      ...completed.flatMap((card) => [card.lastActivityAt, card.updatedAt])
    ].map(canonicalProgressTimestamp).filter(Boolean).sort();
    const updatedAt = activityTimes.at(-1) || null;
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
  #progress = createEmptyProgressDocument();
  #tail = Promise.resolve();
  #pendingWrites = 0;
  #durabilityError = null;
  #failedDurabilityTasks = [];
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
    onLocalCommit = null,
    forkCourseForEditing = null,
    createCourseForEditing = null
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
    this.forkCourseForEditing = typeof forkCourseForEditing === "function"
      ? forkCourseForEditing
      : null;
    this.createCourseForEditing = typeof createCourseForEditing === "function"
      ? createCourseForEditing
      : null;
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
      this.store.readStores([
        "courseSelections", "lessonProgress", "cardProgress", "comments",
        "studyPaths", "studyPathCourses"
      ])
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
    return Object.freeze({
      status: this.#pendingWrites > 0 || this.#hasUncommittedMemory()
        ? "pending"
        : this.#durabilityError ? "error" : "saved",
      pendingWrites: this.#pendingWrites,
      hasUncommittedMemory: this.#hasUncommittedMemory(),
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

  #enqueue(task, { retryable = true } = {}) {
    this.#pendingWrites += 1;
    this.#notifyDurability();
    const operation = this.#tail.then(task);
    void operation.catch(() => undefined);
    this.#tail = operation.then(
      () => {
        this.#pendingWrites -= 1;
        this.#failedDurabilityTasks = this.#failedDurabilityTasks.filter((entry) => entry !== task);
        if (!this.#failedDurabilityTasks.length && !this.#hasUncommittedMemory()) {
          this.#durabilityError = null;
        }
        this.#notifyDurability();
      },
      (error) => {
        this.#pendingWrites -= 1;
        this.#durabilityError = error instanceof Error ? error : new Error(String(error));
        if (retryable && !this.#failedDurabilityTasks.includes(task)) this.#failedDurabilityTasks.push(task);
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
    const items = activeRows(itemRows, this.userId).sort((left, right) =>
      Number(left.position || 0) - Number(right.position || 0) ||
      String(left.id).localeCompare(String(right.id))
    );
    return activeRows(pathRows, this.userId)
      .sort((left, right) =>
        Number(left.position || 0) - Number(right.position || 0) ||
        String(left.title || "").localeCompare(String(right.title || ""), "pt-BR")
      )
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
      const next = {
        id: this.uuidFactory(),
        ownerId: this.userId,
        title: normalizedTitle,
        position: this.#assembleStudyPaths().length,
        updatedAt: timestamp(this.clock)
      };
      const result = await this.mutations.applyRowChange("studyPaths", null, next);
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
      const result = await this.mutations.applyMutations(mutations);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(previous);
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
        .filter((row) => row.pathId === path.id && row.id !== previous?.id);
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
      const result = await this.mutations.applyRowChange("studyPathCourses", previous, next);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(next);
    });
  }

  removeCourseFromStudyPath(itemId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const previous = this.#studyPathCourseRows.get(String(itemId));
      if (!isActive(previous) || previous.ownerId !== this.userId) return null;
      const result = await this.mutations.applyRowChange("studyPathCourses", previous, null);
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
        .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
      const index = siblings.findIndex((row) => row.id === current.id);
      const target = siblings[index + delta];
      if (!target) return null;
      const result = await this.mutations.applyMutations([
        makeMutation("studyPathCourses", current, { ...current, position: target.position }),
        makeMutation("studyPathCourses", target, { ...target, position: current.position })
      ]);
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

  coursePermissions(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) {
      return {
        role: "owner",
        canEdit: Boolean(this.createCourseForEditing),
        canDelete: false,
        requiresCreate: true
      };
    }
    const personalOwner = course.ownerId === this.userId;
    if (personalOwner) {
      return { role: "owner", canEdit: true, canDelete: false, requiresFork: false };
    }
    // O catálogo permanece imutável. `canEdit` significa que a interface pode
    // abrir o workbench; a primeira gravação cria, de forma explícita e única,
    // uma árvore pessoal independente antes de aplicar qualquer alteração.
    return {
      role: "learner",
      canEdit: Boolean(this.forkCourseForEditing),
      canDelete: false,
      requiresFork: true
    };
  }

  canEditCourse(courseIdentity) {
    return this.coursePermissions(courseIdentity).canEdit;
  }

  canDeleteCourse() { return false; }

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
          selectionId: selection.id,
          title: course.title || selection.title || "Curso",
          goal: course.goal || selection.goal || "",
          publicationSeq: selection.publicationSeq || course.publicationSeq || 0,
          contentHash: selection.contentHash || course.contentHash || "",
          isSelected: true
        };
      });
  }

  #changedCourseKeys(previousDocument, nextDocument) {
    const previous = new Map((previousDocument.courses || []).map((course) => [course.id, course]));
    const next = new Map((nextDocument.courses || []).map((course) => [course.id, course]));
    return [...new Set([...previous.keys(), ...next.keys()])].filter((courseKey) =>
      JSON.stringify(previous.get(courseKey) || null) !== JSON.stringify(next.get(courseKey) || null)
    );
  }

  async #preparePersonalAuthoringTree(snapshot) {
    const changedCourseKeys = this.#changedCourseKeys(this.#committedProject, snapshot);
    let replicaChanged = false;
    for (const courseKey of changedCourseKeys) {
      const currentDocumentCourse = (this.#committedProject.courses || [])
        .find((course) => course.id === courseKey);
      const nextDocumentCourse = (snapshot.courses || []).find((course) => course.id === courseKey);
      const courseRow = this.#courseRow(courseKey);
      if (!currentDocumentCourse && nextDocumentCourse) {
        if (!this.createCourseForEditing) {
          throw new Error("Não foi possível criar o curso pessoal neste ambiente.");
        }
        await this.createCourseForEditing(clone(nextDocumentCourse));
        replicaChanged = true;
        continue;
      }
      if (!nextDocumentCourse) {
        throw new Error("Remova cursos pela biblioteca para preservar progresso e trilhas.");
      }
      if (courseRow?.ownerId === this.userId) continue;
      if (!courseRow || !this.forkCourseForEditing) {
        throw new Error("Não foi possível preparar uma cópia pessoal para esta edição.");
      }
      await this.forkCourseForEditing(courseRow.id);
      replicaChanged = true;
    }
    if (replicaChanged) await this.#reloadFromStore();
  }

  #assertPersonalContentMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.storeName === "projectMeta") continue;
      const courseId = String(
        mutation.courseId ||
        mutation.nextRow?.courseId ||
        mutation.previousRow?.courseId ||
        (mutation.storeName === "courses" ? mutation.entityId : "")
      );
      const course = (this.#projectRows.courses || []).find((row) => String(row.id) === courseId);
      if (!course || course.ownerId !== this.userId) {
        throw new Error("A árvore oficial do catálogo não pode ser alterada.");
      }
      mutation.courseId = courseId;
    }
  }

  saveProject(projectDocument, { scope = null } = {}) {
    this.#assertInitialized();
    const normalized = normalizeProject(projectDocument);
    this.differ.normalize(normalized);
    const snapshot = clone(normalized);
    const saveNumber = ++this.#latestProjectSave;
    this.#project = clone(snapshot);

    return this.#enqueue(async () => {
      await this.#preparePersonalAuthoringTree(snapshot);
      const diff = this.differ.diff(this.#committedProject, snapshot, {
        previousRows: this.#projectRows,
        ...(scope ? { scope } : {})
      });
      const mutations = diff.mutations.filter((mutation) => mutation.storeName !== "projectMeta");
      this.#assertPersonalContentMutations(mutations);
      if (mutations.length) await this.mutations.applyMutations(mutations);
      await this.#reloadFromStore();
      if (saveNumber === this.#latestProjectSave) this.#project = clone(snapshot);
      return clone(snapshot);
    });
  }

  importPrivateCourse(projectDocument, { courseKey, importId = this.uuidFactory() } = {}) {
    this.#assertInitialized();
    if (!this.userId) throw new Error("Entre na sua conta para importar um curso privado.");
    const normalized = normalizeProject(projectDocument);
    const snapshot = clone(normalized);
    const normalizedCourseKey = String(courseKey || "").trim();
    const normalizedImportId = String(importId || "").trim();
    if (!normalizedCourseKey || !normalizedImportId) {
      throw new Error("A importação privada exige curso e identificador da operação.");
    }
    const changedCourseKeys = this.#changedCourseKeys(this.#committedProject, snapshot);
    const importedCourse = (snapshot.courses || []).find((course) => course.id === normalizedCourseKey);
    if (!importedCourse || changedCourseKeys.length !== 1 || changedCourseKeys[0] !== normalizedCourseKey ||
        (this.#committedProject.courses || []).some((course) => course.id === normalizedCourseKey)) {
      throw new Error("A importação privada exige exatamente um curso novo.");
    }
    const saveNumber = ++this.#latestProjectSave;
    this.#project = clone(snapshot);
    let staged = null;

    return this.#enqueue(async () => {
      if (!staged) {
        const diff = this.differ.diff(this.#committedProject, snapshot, {
          previousRows: this.#projectRows
        });
        const rootMutation = diff.mutations.find((mutation) =>
          mutation.storeName === "courses" &&
          mutation.nextRow?.contractKey === normalizedCourseKey
        );
        if (!rootMutation?.nextRow || rootMutation.previousRow) {
          throw new Error("Não foi possível normalizar a raiz do curso privado.");
        }
        const now = timestamp(this.clock);
        const courseRow = {
          ...clone(rootMutation.nextRow),
          courseId: rootMutation.entityId,
          ownerId: this.userId,
          sourceCourseId: null,
          status: "published",
          publicationSeq: 0,
          contentHash: "",
          updatedAt: now,
          deletedAt: null
        };
        const selectionId = this.uuidFactory();
        const selectionRow = {
          id: selectionId,
          userId: this.userId,
          courseId: courseRow.id,
          position: activeRows(this.#selectionRows, this.userId).length,
          publicationSeq: 0,
          contentHash: "",
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        };
        const rootMutationId = this.uuidFactory();
        staged = {
          courseRow,
          selectionRow,
          rootMutationId,
          contentMutations: privateImportContentMutations(diff.mutations, normalizedImportId),
          leadingOutboxEntry: {
            mutationId: rootMutationId,
            importId: normalizedImportId,
            outboxKind: PRIVATE_COURSE_CREATE_OUTBOX_KIND,
            localSelectionId: selectionId,
            courseId: courseRow.id,
            entityType: "courses",
            entityId: courseRow.id,
            operation: "create",
            changedFields: [],
            previousRow: null,
            payload: {
              contractKey: courseRow.contractKey,
              title: courseRow.title,
              goal: courseRow.goal,
              contractScope: courseRow.contractScope ?? null
            }
          }
        };
      }

      const result = await this.mutations.applyMutations(staged.contentMutations, {
        localRows: [
          { storeName: "courses", row: staged.courseRow },
          { storeName: "courseSelections", row: staged.selectionRow }
        ],
        leadingOutboxEntries: [staged.leadingOutboxEntry]
      });
      await this.#reloadFromStore();
      if (saveNumber === this.#latestProjectSave) this.#project = clone(snapshot);
      return {
        importId: normalizedImportId,
        courseId: staged.courseRow.id,
        selectionId: staged.selectionRow.id,
        mutationIds: result.outboxEntries.map((entry) => entry.mutationId)
      };
    });
  }

  async getPrivateCourseImportState(importId) {
    this.#assertInitialized();
    const normalizedImportId = String(importId || "").trim();
    if (!normalizedImportId) throw new TypeError("Identificador de importação inválido.");
    const entries = (await this.store.getAll("outbox"))
      .filter((entry) => String(entry.importId || "") === normalizedImportId);
    const pending = entries.filter((entry) => ["pending", "inflight"].includes(entry.status)).length;
    const rejected = entries.filter((entry) => ["rejected", "blocked"].includes(entry.status)).length;
    return Object.freeze({
      importId: normalizedImportId,
      pending,
      rejected,
      remoteConfirmed: entries.length === 0,
      mutationCount: entries.length
    });
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
      const activityAt = canonicalProgressTimestamp(entry.updatedAt) || now;
      const lessonRow = {
        ...(previousLesson || {}),
        id: lessonProgressId,
        userId: this.userId,
        courseId: reference.course.id,
        moduleId: reference.moduleValue.id,
        lessonId: reference.lesson.id,
        pathKey,
        cursor: Number(entry.cursor ?? -1),
        firstViewedAt: previousLesson?.firstViewedAt || activityAt,
        completedAt: entry.completedCardKeys.length >= reference.cards.length && reference.cards.length
          ? previousLesson?.completedAt || activityAt
          : null,
        lastActivityAt: activityAt,
        updatedAt: activityAt
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
          firstViewedAt: previousCard?.firstViewedAt || activityAt,
          completedAt: previousCard?.completedAt || activityAt,
          attempts: Number(previousCard?.attempts || 0),
          lastActivityAt: activityAt,
          updatedAt: activityAt
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

  #recordCardActivity(reference, { attempt = false, completed = false, result = null } = {}) {
    this.#assertInitialized();
    const resolved = this.resolveCardReference(reference);
    if (!this.userId) throw new Error("A atividade de estudo exige um usuário autenticado.");
    if (!resolved) throw new Error("Não foi possível resolver o card da atividade de estudo.");
    const pathKey = `${resolved.courseKey}::${resolved.moduleKey}::${resolved.lessonKey}`;
    const lessonReference = this.#findProjectReference(pathKey);
    const position = Math.max(0, lessonReference.cards.findIndex((row) => row.id === resolved.cardId));
    return this.#enqueue(async () => {
      const now = timestamp(this.clock);
      const previousLesson = activeRows(this.#lessonProgressRows, this.userId)
        .find((row) => row.lessonId === resolved.lessonId) || null;
      const lessonRow = {
        ...(previousLesson || {}),
        id: previousLesson?.id || await this.#naturalEntityId("lessonProgress", resolved.lessonId),
        userId: this.userId,
        courseId: resolved.courseId,
        moduleId: resolved.moduleId,
        lessonId: resolved.lessonId,
        pathKey,
        cursor: -1,
        firstViewedAt: previousLesson?.firstViewedAt || now,
        completedAt: previousLesson?.completedAt || null,
        lastActivityAt: now,
        updatedAt: now
      };
      const previousCard = activeRows(this.#cardProgressRows, this.userId)
        .find((row) => row.cardId === resolved.cardId) || null;
      const cardRow = {
        ...(previousCard || {}),
        id: previousCard?.id || await this.#naturalEntityId("cardProgress", resolved.cardId),
        userId: this.userId,
        courseId: resolved.courseId,
        moduleId: resolved.moduleId,
        lessonId: resolved.lessonId,
        lessonProgressId: lessonRow.id,
        cardId: resolved.cardId,
        pathKey,
        cardKey: resolved.cardKey,
        position,
        firstViewedAt: previousCard?.firstViewedAt || now,
        completedAt: previousCard?.completedAt || (completed ? now : null),
        attempts: Number(previousCard?.attempts || 0) + (attempt ? 1 : 0),
        lastResult: result ?? previousCard?.lastResult ?? null,
        lastActivityAt: now,
        updatedAt: now
      };
      const completedCardIds = new Set(activeRows(this.#cardProgressRows, this.userId)
        .filter((row) => row.lessonId === resolved.lessonId && row.id !== cardRow.id && row.completedAt)
        .map((row) => row.cardId));
      if (cardRow.completedAt) completedCardIds.add(cardRow.cardId);
      let completedPrefixLength = 0;
      for (const card of lessonReference.cards) {
        if (!completedCardIds.has(card.id)) break;
        completedPrefixLength += 1;
      }
      lessonRow.cursor = completedPrefixLength - 1;
      lessonRow.completedAt = lessonReference.cards.length > 0 &&
        completedPrefixLength === lessonReference.cards.length
        ? previousLesson?.completedAt || now
        : null;
      const mutationResult = await this.mutations.applyMutations([
        makeMutation("lessonProgress", previousLesson, lessonRow),
        makeMutation("cardProgress", previousCard, cardRow)
      ]);
      this.#mergeAuxiliaryRows(mutationResult.appliedRows);
      return clone(cardRow);
    });
  }

  recordCardView(reference) {
    return this.#recordCardActivity(reference);
  }

  recordCardAttempt(reference, result) {
    return this.#recordCardActivity(reference, {
      attempt: true,
      completed: result === "correct",
      result
    });
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

  async saveCommentForPath(reference, body, userId = this.userId) {
    const currentUserId = requireCurrentUser(userId, this.userId);
    const resolved = this.resolveCardReference(reference);
    if (!resolved) throw new Error("Card não encontrado para persistir comentário.");
    const previous = activeRows(this.#commentRows, currentUserId)
      .find((row) => row.cardId === resolved.cardId);
    if (!String(body || "").trim()) return previous ? this.deleteComment(previous.id) : null;
    return this.saveComment({
      ...resolved,
      id: previous?.id,
      userId: currentUserId,
      body: String(body),
      createdAt: previous?.createdAt || timestamp(this.clock)
    });
  }

  saveComment(comment) {
    this.#assertInitialized();
    if (!comment?.cardId) throw new Error("Comentário relacional exige cardId.");
    const input = clone(comment);
    const currentUserId = requireCurrentUser(input.userId, this.userId);
    return this.#enqueue(async () => {
      const previous = activeRows(this.#commentRows, currentUserId)
        .find((row) => row.cardId === input.cardId) || null;
      const next = {
        ...input,
        id: previous?.id || input.id || await this.#naturalEntityId("comments", input.cardId),
        userId: currentUserId,
        body: String(input.body || "").trim(),
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
    const operations = failedTasks.map((task) => this.#enqueue(task));
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
