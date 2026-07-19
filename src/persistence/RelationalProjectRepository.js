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
import { DomainMutationService } from "./DomainMutationService.js";
import {
  IndexedDbRelationalStore,
  PROJECT_ROW_STORE_NAMES
} from "./IndexedDbRelationalStore.js";
import { ProjectDocumentAssembler } from "./ProjectDocumentAssembler.js";
import { ProjectDocumentDiffer } from "./ProjectDocumentDiffer.js";
import { deterministicUuid, relationalNaturalKey } from "./deterministicUuid.js";
import { defaultUuidFactory } from "./relationalSchema.js";

const INTERNAL_ROW_FIELDS = new Set(["revision", "updatedAt", "deletedAt"]);
const MICROSEQUENCE_CARD_STORE_NAMES = Object.freeze([
  "cards",
  "cardSources",
  "cardTopics",
  "blocks",
  "options",
  "nodes",
  "edges",
  "cells",
  "matrixItems",
  "points",
  "lines",
  "highlights",
  "flowNodes",
  "flowCases",
  "flowPractices",
  "flowPracticeEntries",
  "flowPracticeOptions",
  "flowPracticeVariants",
  "flowShapeOptions"
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizedValue(value) {
  if (Array.isArray(value)) return value.map(normalizedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalizedValue(value[key])])
    );
  }
  return value;
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
  // O validador também oferece uma visão normalizada para edição, mas a
  // fronteira de persistência precisa conservar o documento válido original.
  // O conversor relacional estrito rejeita campos desconhecidos e impede que
  // uma normalização permissiva descarte dados aninhados silenciosamente.
  return clone(document);
}

function isActive(row) {
  return row && row.deletedAt == null;
}

function rowBody(row, allowedFields = null) {
  return Object.fromEntries(
    Object.entries(row || {})
      .filter(([fieldName]) => !INTERNAL_ROW_FIELDS.has(fieldName))
      .filter(([fieldName]) => allowedFields === null || allowedFields.has(fieldName))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function rowsEqual(left, right) {
  const domainFields = new Set(
    Object.keys(right || {}).filter((fieldName) => !INTERNAL_ROW_FIELDS.has(fieldName))
  );
  return JSON.stringify(rowBody(left, domainFields)) === JSON.stringify(rowBody(right, domainFields));
}

function makeMutation(storeName, previousRow, nextRow) {
  const row = nextRow || previousRow;
  const changedFields = [...new Set([
    ...Object.keys(previousRow || {}),
    ...Object.keys(nextRow || {})
  ])]
    .filter((fieldName) => !INTERNAL_ROW_FIELDS.has(fieldName))
    .filter((fieldName) =>
      JSON.stringify(normalizedValue(previousRow?.[fieldName])) !==
      JSON.stringify(normalizedValue(nextRow?.[fieldName]))
    )
    .sort();
  return {
    storeName,
    entityType: storeName,
    entityId: row.id,
    courseId: row.courseId ?? null,
    operation: nextRow ? "upsert" : "delete",
    baseRevision: Number(previousRow?.revision || 0),
    previousRow: clone(previousRow),
    nextRow: clone(nextRow),
    changedFields
  };
}

function isEffectiveMutation(mutation) {
  return mutation.operation !== "upsert" || !mutation.previousRow || mutation.changedFields.length > 0;
}

function diffRowMaps(storeName, previousMap, nextRows) {
  const nextMap = new Map(nextRows.map((row) => [row.id, row]));
  const mutations = [];
  const ids = new Set([
    ...[...previousMap.values()].filter(isActive).map((row) => row.id),
    ...nextMap.keys()
  ]);
  for (const id of ids) {
    const previousRow = isActive(previousMap.get(id)) ? previousMap.get(id) : null;
    const nextRow = nextMap.get(id) || null;
    if (previousRow && nextRow && rowsEqual(previousRow, nextRow)) continue;
    mutations.push(makeMutation(storeName, previousRow, nextRow));
  }
  return mutations;
}

function activeRows(map, userId) {
  return [...map.values()].filter(
    (row) => isActive(row) && (
      userId === undefined || row.userId === userId || row.ownerId === userId
    )
  );
}

function projectRowsVisibleToUser(projectRows, membershipRows, userId) {
  if (!userId) return projectRows;
  const userMemberships = membershipRows.filter((row) => row.userId === userId);
  const activeCourseIds = new Set(
    userMemberships.filter(isActive).map((row) => row.courseId)
  );
  const revokedCourseIds = new Set(
    userMemberships
      .filter((row) => !isActive(row) && !activeCourseIds.has(row.courseId))
      .map((row) => row.courseId)
  );
  for (const course of projectRows.courses || []) {
    if (course.ownerId === userId) revokedCourseIds.delete(course.id);
  }
  if (!revokedCourseIds.size) return projectRows;
  return Object.fromEntries(
    Object.entries(projectRows).map(([storeName, rows]) => [
      storeName,
      rows.filter((row) => !revokedCourseIds.has(row.courseId ?? row.id))
    ])
  );
}

function progressDocumentFromRows(lessonRows, cardRows, userId) {
  const cardsByLessonProgress = new Map();
  activeRows(cardRows, userId)
    .filter((row) => row.completedAt)
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .forEach((row) => {
      if (!cardsByLessonProgress.has(row.lessonProgressId)) {
        cardsByLessonProgress.set(row.lessonProgressId, []);
      }
      cardsByLessonProgress.get(row.lessonProgressId).push(row);
    });

  const lessons = {};
  activeRows(lessonRows, userId).forEach((row) => {
    const completedCards = cardsByLessonProgress.get(row.id) || [];
    if (!completedCards.length) return;
    const completedCardKeys = completedCards.map((card) => card.cardKey);
    lessons[row.pathKey] = {
      cursor: completedCardKeys.length - 1,
      completedCardKeys,
      ...(row.lastActivityAt ? { updatedAt: row.lastActivityAt } : {})
    };
  });
  return { version: 1, lessons };
}

function replaceAppliedRows(map, appliedRows, storeName) {
  appliedRows
    .filter((entry) => entry.storeName === storeName)
    .forEach(({ row }) => map.set(row.id, clone(row)));
}

function timestamp(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

function buildMicrosequenceCardFragment(rows, microsequenceIdentity) {
  const requested = String(microsequenceIdentity || "");
  const microsequence = (rows.microsequences || []).find(
    (row) => isActive(row) && (row.id === requested || row.contractKey === requested)
  );
  if (!microsequence) throw new Error("Microssequência alvo não encontrada nas linhas normalizadas.");
  const scopedIds = new Set(
    (rows.cards || [])
      .filter((row) => isActive(row) && row.microsequenceId === microsequence.id)
      .map((row) => row.id)
  );
  let expanded = true;
  while (expanded) {
    expanded = false;
    MICROSEQUENCE_CARD_STORE_NAMES.forEach((storeName) => {
      (rows[storeName] || []).filter(isActive).forEach((row) => {
        if (scopedIds.has(row.id)) return;
        const child = Object.entries(row).some(([fieldName, value]) =>
          fieldName.endsWith("Id") &&
          !["courseId", "moduleId", "lessonId", "microsequenceId", "sourceEntityId"].includes(fieldName) &&
          scopedIds.has(value)
        );
        if (child) {
          scopedIds.add(row.id);
          expanded = true;
        }
      });
    });
  }
  return {
    microsequence,
    fragment: Object.fromEntries(
      MICROSEQUENCE_CARD_STORE_NAMES.map((storeName) => [
        storeName,
        (rows[storeName] || []).filter((row) => isActive(row) && scopedIds.has(row.id))
      ])
    )
  };
}

export class RelationalProjectRepository {
  #initialized = false;
  #project = createEmptyProjectDocument();
  #committedProject = createEmptyProjectDocument();
  #projectRows = {};
  #lessonProgressRows = new Map();
  #cardProgressRows = new Map();
  #commentRows = new Map();
  #membershipRows = new Map();
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
    onLocalCommit = null
  } = {}) {
    if (!store || typeof store.readStores !== "function") {
      throw new TypeError("RelationalProjectRepository exige IndexedDbRelationalStore.");
    }
    this.store = store;
    this.assembler = assembler;
    this.identityMap = identityMap;
    this.uuidFactory = uuidFactory;
    this.naturalKeyIdFactory = naturalKeyIdFactory;
    this.clock = clock;
    this.userId = userId;
    this.differ = differ || new ProjectDocumentDiffer({ identityMap, uuidFactory });
    this.mutations = mutationService || new DomainMutationService({
      store,
      differ: this.differ,
      uuidFactory,
      clock,
      onLocalCommit
    });
  }

  static async open({ indexedDb = globalThis.indexedDB, store = null, ...options } = {}) {
    const relationalStore = store || await IndexedDbRelationalStore.open(indexedDb);
    const repository = new RelationalProjectRepository({ ...options, store: relationalStore });
    await repository.initialize();
    return repository;
  }

  async initialize() {
    if (this.#initialized) return this;
    const [projectRows, auxiliaryRows] = await Promise.all([
      this.store.readStores(PROJECT_ROW_STORE_NAMES),
      this.store.readStores([
        "memberships", "lessonProgress", "cardProgress", "comments",
        "studyPaths", "studyPathCourses"
      ])
    ]);
    this.#membershipRows = new Map(auxiliaryRows.memberships.map((row) => [row.id, row]));
    this.#projectRows = projectRowsVisibleToUser(
      projectRows,
      [...this.#membershipRows.values()],
      this.userId
    );
    Object.values(this.#projectRows).flat().filter(isActive).forEach((row) => {
      if (!row?.identityKey || !row?.id) return;
      const existingId = this.identityMap.get(row.identityKey);
      if (existingId && existingId !== row.id) {
        throw new Error(`Identidade relacional ativa duplicada: "${row.identityKey}".`);
      }
      this.identityMap.set(row.identityKey, row.id);
    });
    this.#lessonProgressRows = new Map(
      auxiliaryRows.lessonProgress.map((row) => [row.id, row])
    );
    this.#cardProgressRows = new Map(auxiliaryRows.cardProgress.map((row) => [row.id, row]));
    this.#commentRows = new Map(auxiliaryRows.comments.map((row) => [row.id, row]));
    this.#studyPathRows = new Map(auxiliaryRows.studyPaths.map((row) => [row.id, row]));
    this.#studyPathCourseRows = new Map(
      auxiliaryRows.studyPathCourses.map((row) => [row.id, row])
    );

    this.#committedProject = normalizeProject(this.assembler.assemble(this.#projectRows));
    this.#project = clone(this.#committedProject);
    this.#progress = progressDocumentFromRows(
      this.#lessonProgressRows,
      this.#cardProgressRows,
      this.userId
    );
    this.#initialized = true;
    return this;
  }

  async refreshFromReplica() {
    this.#assertInitialized();
    await this.flush();
    const [projectRows, auxiliaryRows] = await Promise.all([
      this.store.readStores(PROJECT_ROW_STORE_NAMES),
      this.store.readStores([
        "memberships", "lessonProgress", "cardProgress", "comments",
        "studyPaths", "studyPathCourses"
      ])
    ]);
    const nextMembershipRows = new Map(auxiliaryRows.memberships.map((row) => [row.id, row]));
    const visibleProjectRows = projectRowsVisibleToUser(
      projectRows,
      [...nextMembershipRows.values()],
      this.userId
    );
    const nextProject = normalizeProject(this.assembler.assemble(visibleProjectRows));
    const nextLessonProgressRows = new Map(
      auxiliaryRows.lessonProgress.map((row) => [row.id, row])
    );
    const nextCardProgressRows = new Map(
      auxiliaryRows.cardProgress.map((row) => [row.id, row])
    );
    const nextProgress = progressDocumentFromRows(
      nextLessonProgressRows,
      nextCardProgressRows,
      this.userId
    );
    const documentChanged = JSON.stringify(nextProject) !== JSON.stringify(this.#project);
    const progressChanged = JSON.stringify(nextProgress) !== JSON.stringify(this.#progress);
    const nextStudyPathRows = new Map(auxiliaryRows.studyPaths.map((row) => [row.id, row]));
    const nextStudyPathCourseRows = new Map(
      auxiliaryRows.studyPathCourses.map((row) => [row.id, row])
    );
    const studyPathsChanged = JSON.stringify(this.loadStudyPaths()) !== JSON.stringify(
      this.#assembleStudyPaths(nextStudyPathRows, nextStudyPathCourseRows)
    );

    this.identityMap.clear();
    Object.values(visibleProjectRows).flat().filter(isActive).forEach((row) => {
      if (!row?.identityKey || !row?.id) return;
      const existingId = this.identityMap.get(row.identityKey);
      if (existingId && existingId !== row.id) {
        throw new Error(`Identidade relacional ativa duplicada: "${row.identityKey}".`);
      }
      this.identityMap.set(row.identityKey, row.id);
    });
    this.#projectRows = visibleProjectRows;
    this.#membershipRows = nextMembershipRows;
    this.#lessonProgressRows = nextLessonProgressRows;
    this.#cardProgressRows = nextCardProgressRows;
    this.#commentRows = new Map(auxiliaryRows.comments.map((row) => [row.id, row]));
    this.#studyPathRows = nextStudyPathRows;
    this.#studyPathCourseRows = nextStudyPathCourseRows;
    this.#committedProject = clone(nextProject);
    this.#project = clone(nextProject);
    this.#progress = nextProgress;
    return {
      project: clone(nextProject),
      progress: clone(nextProgress),
      documentChanged,
      progressChanged,
      studyPathsChanged
    };
  }

  #assertInitialized() {
    if (!this.#initialized) {
      throw new Error("O repositório relacional ainda não foi inicializado.");
    }
  }

  #committedProgressDocument() {
    return progressDocumentFromRows(
      this.#lessonProgressRows,
      this.#cardProgressRows,
      this.userId
    );
  }

  #hasUncommittedMemory() {
    return JSON.stringify(this.#project) !== JSON.stringify(this.#committedProject) ||
      JSON.stringify(this.#progress) !== JSON.stringify(this.#committedProgressDocument());
  }

  #durabilityStatus() {
    if (this.#pendingWrites > 0) return "pending";
    if (this.#durabilityError) return "error";
    if (this.#hasUncommittedMemory()) return "pending";
    return "saved";
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
      status: this.#durabilityStatus(),
      pendingWrites: this.#pendingWrites,
      hasUncommittedMemory: this.#hasUncommittedMemory(),
      error: this.#durabilityError
        ? Object.freeze({
            name: this.#durabilityError.name || "Error",
            message: this.#durabilityError.message || String(this.#durabilityError)
          })
        : null,
      changedAt: this.#durabilityChangedAt
    });
  }

  onDurabilityChange(listener) {
    this.#assertInitialized();
    if (typeof listener !== "function") {
      throw new TypeError("Listener de durabilidade inválido.");
    }
    this.#durabilityListeners.add(listener);
    listener(this.getDurabilityState());
    return () => this.#durabilityListeners.delete(listener);
  }

  #enqueue(task, onFailure = null, { retryable = false } = {}) {
    this.#pendingWrites += 1;
    this.#notifyDurability();
    const operation = this.#tail.then(task);
    // A interface atual dispara algumas gravações sem await para manter a edição
    // síncrona. O estado de durabilidade conserva a falha, enquanto este
    // observador impede uma rejeição global não tratada. Quem aguarda a Promise
    // original continua recebendo a rejeição normalmente.
    void operation.catch(() => undefined);
    this.#tail = operation.then(
      () => {
        this.#pendingWrites -= 1;
        this.#failedDurabilityTasks = this.#failedDurabilityTasks.filter(
          (failedTask) => failedTask !== task
        );
        if (!this.#hasUncommittedMemory() && this.#failedDurabilityTasks.length === 0) {
          this.#durabilityError = null;
        }
        this.#notifyDurability();
      },
      (error) => {
        this.#pendingWrites -= 1;
        this.#durabilityError = error instanceof Error ? error : new Error(String(error));
        if (retryable && !this.#failedDurabilityTasks.includes(task)) {
          this.#failedDurabilityTasks.push(task);
        }
        onFailure?.(error);
        this.#notifyDurability();
      }
    );
    return operation;
  }

  #mergeProjectRows(appliedRows) {
    for (const { storeName, row } of appliedRows) {
      if (!Array.isArray(this.#projectRows[storeName])) continue;
      const index = this.#projectRows[storeName].findIndex((entry) => entry.id === row.id);
      if (index >= 0) this.#projectRows[storeName][index] = clone(row);
      else this.#projectRows[storeName].push(clone(row));
      if (row.deletedAt && row.id) {
        for (const [identityKey, entityId] of this.identityMap.entries()) {
          if (entityId === row.id) this.identityMap.delete(identityKey);
        }
      }
    }
  }

  #mergeAuxiliaryRows(appliedRows) {
    replaceAppliedRows(this.#membershipRows, appliedRows, "memberships");
    replaceAppliedRows(this.#lessonProgressRows, appliedRows, "lessonProgress");
    replaceAppliedRows(this.#cardProgressRows, appliedRows, "cardProgress");
    replaceAppliedRows(this.#commentRows, appliedRows, "comments");
    replaceAppliedRows(this.#studyPathRows, appliedRows, "studyPaths");
    replaceAppliedRows(this.#studyPathCourseRows, appliedRows, "studyPathCourses");
    if (appliedRows.some((entry) => ["lessonProgress", "cardProgress"].includes(entry.storeName))) {
      this.#progress = progressDocumentFromRows(
        this.#lessonProgressRows,
        this.#cardProgressRows,
        this.userId
      );
    }
  }

  #assembleStudyPaths(
    pathRows = this.#studyPathRows,
    pathCourseRows = this.#studyPathCourseRows
  ) {
    const courseContractKeys = new Map(
      (this.#projectRows.courses || [])
        .filter(isActive)
        .map((course) => [course.id, course.contractKey || course.id])
    );
    const items = activeRows(pathCourseRows, this.userId)
      .sort((left, right) =>
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
        courses: items
          .filter((item) => item.pathId === path.id)
          .map((item) => ({
            ...clone(item),
            persistentCourseId: item.courseId,
            courseId: courseContractKeys.get(item.courseId) || item.courseId
          }))
      }));
  }

  loadStudyPaths() {
    this.#assertInitialized();
    return this.#assembleStudyPaths();
  }

  createStudyPath(title) {
    this.#assertInitialized();
    if (!this.userId) throw new Error("Entre na sua conta para criar uma trilha.");
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) throw new Error("Informe um nome para a trilha.");
    return this.#enqueue(async () => {
      const current = this.#assembleStudyPaths();
      const next = {
        id: this.uuidFactory(),
        ownerId: this.userId,
        title: normalizedTitle,
        description: "",
        position: current.length,
        revision: 0,
        updatedAt: null,
        deletedAt: null
      };
      const result = await this.mutations.applyRowChange("studyPaths", null, next);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(result.appliedRows[0]?.row || next);
    }, null, { retryable: true });
  }

  renameStudyPath(pathId, title) {
    this.#assertInitialized();
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) throw new Error("Informe um nome para a trilha.");
    return this.#enqueue(async () => {
      const previous = this.#studyPathRows.get(String(pathId));
      if (!isActive(previous) || previous.ownerId !== this.userId) {
        throw new Error("Trilha não encontrada.");
      }
      const result = await this.mutations.applyRowChange(
        "studyPaths",
        previous,
        { ...previous, title: normalizedTitle }
      );
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(result.appliedRows[0]?.row);
    }, null, { retryable: true });
  }

  deleteStudyPath(pathId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const previous = this.#studyPathRows.get(String(pathId));
      if (!isActive(previous) || previous.ownerId !== this.userId) return null;
      const children = activeRows(this.#studyPathCourseRows, this.userId)
        .filter((row) => row.pathId === previous.id);
      const mutations = [
        ...children.map((row) => makeMutation("studyPathCourses", row, null)),
        makeMutation("studyPaths", previous, null)
      ];
      const result = await this.mutations.applyMutations(mutations);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(result.appliedRows.at(-1)?.row || null);
    }, null, { retryable: true });
  }

  addCourseToStudyPath(pathId, courseId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const path = this.#studyPathRows.get(String(pathId));
      if (!isActive(path) || path.ownerId !== this.userId) throw new Error("Trilha não encontrada.");
      const normalizedCourseId = String(courseId || "");
      if (!(this.#projectRows.courses || []).some((course) => isActive(course) && course.id === normalizedCourseId)) {
        throw new Error("Curso não encontrado neste dispositivo.");
      }
      const siblings = activeRows(this.#studyPathCourseRows, this.userId)
        .filter((row) => row.pathId === path.id);
      if (siblings.some((row) => row.courseId === normalizedCourseId)) return null;
      const next = {
        id: this.uuidFactory(),
        ownerId: this.userId,
        pathId: path.id,
        courseId: normalizedCourseId,
        position: siblings.length,
        revision: 0,
        updatedAt: null,
        deletedAt: null
      };
      const result = await this.mutations.applyRowChange("studyPathCourses", null, next);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(result.appliedRows[0]?.row || next);
    }, null, { retryable: true });
  }

  removeCourseFromStudyPath(pathCourseId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const previous = this.#studyPathCourseRows.get(String(pathCourseId));
      if (!isActive(previous) || previous.ownerId !== this.userId) return null;
      const result = await this.mutations.applyRowChange("studyPathCourses", previous, null);
      this.#mergeAuxiliaryRows(result.appliedRows);
      return clone(result.appliedRows[0]?.row || null);
    }, null, { retryable: true });
  }

  moveCourseInStudyPath(pathCourseId, direction) {
    this.#assertInitialized();
    const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    if (!delta) throw new Error("Direção de ordenação inválida.");
    return this.#enqueue(async () => {
      const current = this.#studyPathCourseRows.get(String(pathCourseId));
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
    }, null, { retryable: true });
  }

  #courseAuxiliaryDeletionMutations(courseIds) {
    const ids = new Set(courseIds.map(String));
    return [
      ["memberships", this.#membershipRows],
      ["lessonProgress", this.#lessonProgressRows],
      ["cardProgress", this.#cardProgressRows],
      ["comments", this.#commentRows],
      ["studyPathCourses", this.#studyPathCourseRows]
    ].flatMap(([storeName, rows]) =>
      [...rows.values()]
        .filter((row) => isActive(row) && ids.has(String(row.courseId || "")))
        .map((row) => makeMutation(storeName, row, null))
    );
  }

  #naturalEntityId(entityType, userId, entityId) {
    return this.naturalKeyIdFactory(relationalNaturalKey(entityType, userId, entityId));
  }

  #projectAuxiliaryReconciliationMutations(
    nextRows,
    projectMutations,
    excludedCourseIds = new Set()
  ) {
    const progressRelevantFields = new Map([
      ["courses", new Set(["contractKey"])],
      ["modules", new Set(["contractKey", "courseId"])],
      ["lessons", new Set(["contractKey", "moduleId"])],
      ["microsequences", new Set(["lessonId", "position"])],
      ["cards", new Set(["contractKey", "lessonId", "microsequenceId", "position"])]
    ]);
    const requiresReconciliation = projectMutations.some((mutation) => {
      const relevant = progressRelevantFields.get(mutation.storeName);
      return relevant && mutation.changedFields.some((fieldName) => relevant.has(fieldName));
    });
    if (!requiresReconciliation) return [];
    const courses = new Map((nextRows.courses || []).filter(isActive).map((row) => [row.id, row]));
    const modules = new Map((nextRows.modules || []).filter(isActive).map((row) => [row.id, row]));
    const lessons = new Map((nextRows.lessons || []).filter(isActive).map((row) => [row.id, row]));
    const microsequences = (nextRows.microsequences || []).filter(isActive);
    const cards = (nextRows.cards || []).filter(isActive);
    const lessonProgressRows = new Map(
      activeRows(this.#lessonProgressRows).map((row) => [row.id, row])
    );
    const desiredLessonProgressRows = new Map(lessonProgressRows);
    const mutations = [];

    for (const previous of lessonProgressRows.values()) {
      if (excludedCourseIds.has(String(previous.courseId || ""))) continue;
      const lesson = lessons.get(previous.lessonId);
      const moduleValue = lesson ? modules.get(lesson.moduleId) : null;
      const course = moduleValue ? courses.get(moduleValue.courseId) : null;
      if (!course || !moduleValue || !lesson) continue;
      const pathKey = `${course.contractKey}::${moduleValue.contractKey}::${lesson.contractKey}`;
      const next = {
        ...previous,
        courseId: course.id,
        moduleId: moduleValue.id,
        lessonId: lesson.id,
        sourceEntityId: lesson.sourceEntityId ?? null,
        courseKey: course.contractKey,
        moduleKey: moduleValue.contractKey,
        lessonKey: lesson.contractKey,
        pathKey
      };
      desiredLessonProgressRows.set(next.id, next);
      if (!rowsEqual(previous, next)) mutations.push(makeMutation("lessonProgress", previous, next));
    }

    const microsequencePositions = new Map(
      microsequences.map((row) => [row.id, Number(row.position || 0)])
    );
    const cardPositions = new Map();
    for (const lesson of lessons.values()) {
      cards
        .filter((row) => row.lessonId === lesson.id)
        .sort((left, right) =>
          (microsequencePositions.get(left.microsequenceId) || 0) -
            (microsequencePositions.get(right.microsequenceId) || 0) ||
          Number(left.position || 0) - Number(right.position || 0)
        )
        .forEach((row, position) => cardPositions.set(row.id, position));
    }

    for (const previous of activeRows(this.#cardProgressRows)) {
      if (excludedCourseIds.has(String(previous.courseId || ""))) continue;
      const card = cards.find((row) => row.id === previous.cardId);
      const lesson = card ? lessons.get(card.lessonId) : null;
      const moduleValue = lesson ? modules.get(lesson.moduleId) : null;
      const course = moduleValue ? courses.get(moduleValue.courseId) : null;
      const lessonProgress = lesson
        ? [...desiredLessonProgressRows.values()].find(
            (row) => row.userId === previous.userId && row.lessonId === lesson.id
          )
        : null;
      if (!course || !moduleValue || !lesson || !card || !lessonProgress) continue;
      const next = {
        ...previous,
        courseId: course.id,
        moduleId: moduleValue.id,
        lessonId: lesson.id,
        lessonProgressId: lessonProgress.id,
        cardId: card.id,
        sourceEntityId: card.sourceEntityId ?? null,
        pathKey: lessonProgress.pathKey,
        cardKey: card.contractKey,
        position: cardPositions.get(card.id) ?? previous.position ?? 0
      };
      if (!rowsEqual(previous, next)) mutations.push(makeMutation("cardProgress", previous, next));
    }
    return mutations;
  }

  coursePermissions(courseIdentity) {
    this.#assertInitialized();
    const requested = String(courseIdentity || "");
    const course = (this.#projectRows.courses || []).find(
      (row) => isActive(row) && (row.id === requested || row.contractKey === requested)
    );
    if (!course) {
      return { role: "owner", canEdit: true, canDelete: true };
    }
    if (!this.userId) {
      return {
        role: course.kind === "official" ? "learner" : "owner",
        canEdit: course.kind !== "official",
        canDelete: course.kind !== "official"
      };
    }
    const membership = activeRows(this.#membershipRows, this.userId).find(
      (row) => row.courseId === course.id
    );
    const owner = course.ownerId === this.userId || membership?.role === "owner";
    const localUnboundCourse = !course.kind && !course.ownerId && !membership;
    const editor = membership?.role === "editor";
    return {
      role: owner ? "owner" : editor ? "editor" : membership?.role || "learner",
      canEdit: course.kind !== "official" && (owner || editor || localUnboundCourse),
      canDelete: course.kind !== "official" && (owner || localUnboundCourse)
    };
  }

  canEditCourse(courseIdentity) {
    return this.coursePermissions(courseIdentity).canEdit;
  }

  canDeleteCourse(courseIdentity) {
    return this.coursePermissions(courseIdentity).canDelete;
  }

  #assertProjectChangesAuthorized(snapshot) {
    const currentCourses = new Map(this.#project.courses.map((course, index) => [
      course.id,
      { course, index }
    ]));
    const nextCourses = new Map(snapshot.courses.map((course, index) => [
      course.id,
      { course, index }
    ]));
    for (const [courseKey, current] of currentCourses) {
      const next = nextCourses.get(courseKey);
      if (!next) {
        if (!this.canDeleteCourse(courseKey)) {
          throw new Error("Somente o proprietário pode excluir este curso pessoal.");
        }
        continue;
      }
      const changed = current.index !== next.index ||
        JSON.stringify(current.course) !== JSON.stringify(next.course);
      if (changed && !this.canEditCourse(courseKey)) {
        throw new Error("Este curso está disponível somente para estudo nesta conta.");
      }
    }
  }

  loadProject() {
    this.#assertInitialized();
    return clone(this.#project);
  }

  saveProject(projectDocument, { scope = null } = {}) {
    this.#assertInitialized();
    const normalized = normalizeProject(projectDocument);
    this.#assertProjectChangesAuthorized(normalized);
    this.differ.normalize(normalized);
    const snapshot = clone(normalized);
    const saveNumber = ++this.#latestProjectSave;
    this.#project = clone(snapshot);

    const operation = this.#enqueue(async () => {
      const diff = this.differ.diff(this.#committedProject, snapshot, {
        previousRows: this.#projectRows,
        ...(scope ? { scope } : {})
      });
      const deletedCourses = diff.mutations.filter(
        (mutation) => mutation.storeName === "courses" && mutation.operation === "delete"
      );
      const deletedCourseIds = new Set(deletedCourses.map((mutation) => String(mutation.entityId)));
      if (deletedCourses.length) {
        diff.mutations.push(
          ...this.#courseAuxiliaryDeletionMutations(
            deletedCourses.map((mutation) => mutation.entityId)
          )
        );
      }
      if (scope?.cardsOnly) {
        const fullDiff = this.differ.diff(this.#committedProject, snapshot, {
          previousRows: this.#projectRows
        });
        const scopedMutationKeys = new Set(
          diff.mutations.map((mutation) => `${mutation.storeName}:${mutation.entityId}`)
        );
        const outsideScope = fullDiff.mutations.filter(
          (mutation) => !scopedMutationKeys.has(`${mutation.storeName}:${mutation.entityId}`)
        );
        if (outsideScope.length) {
          throw new Error("A substituição de cards contém alterações fora da microssequência alvo.");
        }
      }
      const projectMutations = [...diff.mutations];
      diff.mutations.push(...this.#projectAuxiliaryReconciliationMutations(
        diff.nextRows,
        projectMutations,
        deletedCourseIds
      ));
      let mutationOptions = {};
      if (deletedCourses.length) {
        mutationOptions = {
          compositeOutboxes: deletedCourses.map((mutation) => ({
            entityType: "personalCourseDeletion",
            entityId: mutation.entityId,
            courseId: mutation.entityId,
            operation: "delete",
            baseRevision: mutation.baseRevision,
            changedFields: [],
            coversCourse: true,
            supersedesCourseMutations: true,
            payload: {
              courseId: mutation.entityId,
              affectedEntities: diff.mutations
                .filter((entry) => String(entry.courseId || "") === String(mutation.entityId))
                .map((entry) => ({
                  storeName: entry.storeName,
                  entityId: entry.entityId,
                  previousRevision: Number(entry.previousRow?.revision || 0),
                  previousUpdatedAt: entry.previousRow?.updatedAt ?? null,
                  previousDeletedAt: entry.previousRow?.deletedAt ?? null
                }))
            }
          }))
        };
      } else if (scope?.cardsOnly && diff.mutations.length) {
        const desired = buildMicrosequenceCardFragment(diff.nextRows, scope.id);
        const previous = buildMicrosequenceCardFragment(this.#projectRows, desired.microsequence.id);
        const previousMicrosequence = (this.#projectRows.microsequences || []).find(
          (row) => isActive(row) && row.id === desired.microsequence.id
        );
        const coveredMutationKeys = [...new Set([
          ...Object.entries(desired.fragment),
          ...Object.entries(previous.fragment)
        ].flatMap(([storeName, rows]) =>
          rows.map((row) => `${storeName}:${row.id}`)
        ))];
        mutationOptions = {
          compositeOutbox: {
            entityType: "microsequenceCardReplacement",
            entityId: desired.microsequence.id,
            courseId: desired.microsequence.courseId,
            operation: "replace",
            baseRevision: Number(
              previousMicrosequence?.cardsRevision ||
              previousMicrosequence?.revision ||
              desired.microsequence.cardsRevision ||
              desired.microsequence.revision ||
              0
            ),
            changedFields: MICROSEQUENCE_CARD_STORE_NAMES,
            coveredMutationKeys,
            supersedesCoveredMutations: true,
            payload: {
              courseId: desired.microsequence.courseId,
              microsequenceId: desired.microsequence.id,
              fragment: desired.fragment,
              previousFragment: previous.fragment
            }
          }
        };
      }
      const result = await this.mutations.applyMutations(diff.mutations, mutationOptions);
      this.#mergeProjectRows(result.appliedRows);
      this.#mergeAuxiliaryRows(result.appliedRows);
      this.#committedProject = scope
        ? normalizeProject(this.assembler.assemble(this.#projectRows))
        : clone(snapshot);
      if (saveNumber === this.#latestProjectSave) this.#project = clone(this.#committedProject);
      return clone(snapshot);
    });
    return operation;
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
    const course = (this.#projectRows.courses || []).find(
      (row) => isActive(row) && row.contractKey === courseKey
    );
    const moduleValue = (this.#projectRows.modules || []).find(
      (row) => isActive(row) && row.courseId === course?.id && row.contractKey === moduleKey
    );
    const lesson = (this.#projectRows.lessons || []).find(
      (row) => isActive(row) && row.moduleId === moduleValue?.id && row.contractKey === lessonKey
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

  async #progressRowsFromDocument(progressDocument, removedPathKeys = new Set()) {
    const now = timestamp(this.clock);
    const activeUserLessons = activeRows(this.#lessonProgressRows, this.userId);
    const activeUserCards = activeRows(this.#cardProgressRows, this.userId);
    // O documento público registra apenas conclusões. Linhas exclusivas do
    // domínio relacional (primeira visualização e tentativas) são preservadas
    // mesmo quando sua lição não aparece no envelope remontado.
    const desiredLessons = new Map(
      activeUserLessons
        .filter((row) => !removedPathKeys.has(row.pathKey))
        .map((row) => [row.id, row])
    );
    const desiredCards = new Map(
      activeUserCards
        .filter((row) => !removedPathKeys.has(row.pathKey))
        .map((row) => [row.id, row])
    );
    for (const [pathKey, entry] of Object.entries(progressDocument.lessons)) {
      const reference = this.#findProjectReference(pathKey);
      const deterministicLessonId = await this.#naturalEntityId(
        "lessonProgress",
        this.userId,
        reference.lesson?.id || pathKey
      );
      const previousLesson = activeUserLessons.find((row) =>
        row.lessonId === reference.lesson?.id || row.pathKey === pathKey
      ) || this.#lessonProgressRows.get(deterministicLessonId) || null;
      if (!reference.lesson && !previousLesson) {
        throw new Error(`Não foi possível resolver a lição do progresso: "${pathKey}".`);
      }
      const lessonId = reference.lesson?.id || previousLesson.lessonId;
      const courseId = reference.course?.id || previousLesson.courseId;
      const moduleId = reference.moduleValue?.id || previousLesson.moduleId;
      const lessonProgressId = previousLesson?.id || deterministicLessonId;
      const activityAt = entry.updatedAt || now;
      const complete = reference.cards.length > 0 && entry.completedCardKeys.length >= reference.cards.length;
      desiredLessons.set(lessonProgressId, {
        id: lessonProgressId,
        courseId,
        moduleId,
        lessonId,
        sourceEntityId: reference.lesson?.sourceEntityId ?? previousLesson?.sourceEntityId ?? null,
        userId: this.userId,
        courseKey: reference.courseKey,
        moduleKey: reference.moduleKey,
        lessonKey: reference.lessonKey,
        pathKey,
        cursor: entry.cursor,
        firstViewedAt: previousLesson?.firstViewedAt || activityAt,
        completedAt: complete ? previousLesson?.completedAt || activityAt : null,
        lastActivityAt: activityAt,
        revision: Number(previousLesson?.revision || 0),
        updatedAt: previousLesson?.updatedAt ?? null,
        deletedAt: null
      });

      for (const [position, cardKey] of entry.completedCardKeys.entries()) {
        const card = reference.cards.find((row) => row.contractKey === cardKey);
        const deterministicCardId = await this.#naturalEntityId(
          "cardProgress",
          this.userId,
          card?.id || `${pathKey}:${cardKey}`
        );
        const previousCard = activeUserCards.find((row) =>
          row.cardId === card?.id || (row.pathKey === pathKey && row.cardKey === cardKey)
        ) || this.#cardProgressRows.get(deterministicCardId) || null;
        if (!card && !previousCard) {
          throw new Error(`Não foi possível resolver o card de progresso: "${cardKey}".`);
        }
        const cardProgressId = previousCard?.id || deterministicCardId;
        desiredCards.set(cardProgressId, {
          id: cardProgressId,
          courseId,
          moduleId,
          lessonId,
          lessonProgressId,
          cardId: card?.id || previousCard.cardId,
          sourceEntityId: card?.sourceEntityId ?? previousCard?.sourceEntityId ?? null,
          userId: this.userId,
          pathKey,
          cardKey,
          position,
          firstViewedAt: previousCard?.firstViewedAt || activityAt,
          completedAt: previousCard?.completedAt || activityAt,
          attempts: Number(previousCard?.attempts || 0),
          lastActivityAt: activityAt,
          revision: Number(previousCard?.revision || 0),
          updatedAt: previousCard?.updatedAt ?? null,
          deletedAt: null
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
    const removedPathKeys = new Set(
      Object.keys(this.#progress.lessons).filter((pathKey) => !(pathKey in normalized.lessons))
    );
    return this.#saveProgressSnapshot(normalized, removedPathKeys);
  }

  #saveProgressSnapshot(progressDocument, removedPathKeys = new Set()) {
    const normalized = validateProgressDocument(progressDocument);
    const snapshot = clone(normalized);
    const saveNumber = ++this.#latestProgressSave;
    this.#progress = clone(snapshot);

    const operation = this.#enqueue(async () => {
      const desired = await this.#progressRowsFromDocument(snapshot, removedPathKeys);
      const userLessons = new Map(
        activeRows(this.#lessonProgressRows, this.userId).map((row) => [row.id, row])
      );
      const userCards = new Map(
        activeRows(this.#cardProgressRows, this.userId).map((row) => [row.id, row])
      );
      const mutations = [
        ...diffRowMaps("lessonProgress", userLessons, desired.lessonProgress),
        ...diffRowMaps("cardProgress", userCards, desired.cardProgress)
      ];
      const result = await this.mutations.applyMutations(mutations);
      replaceAppliedRows(this.#lessonProgressRows, result.appliedRows, "lessonProgress");
      replaceAppliedRows(this.#cardProgressRows, result.appliedRows, "cardProgress");
      if (saveNumber === this.#latestProgressSave) {
        this.#progress = progressDocumentFromRows(
          this.#lessonProgressRows,
          this.#cardProgressRows,
          this.userId
        );
      }
      return clone(snapshot);
    });
    return operation;
  }

  removeProgressEntries(lessonReferences) {
    this.#assertInitialized();
    const snapshot = removeLessonProgressEntries(this.#progress, lessonReferences);
    const removedPathKeys = new Set(lessonReferences.map(buildLessonProgressKey));
    return this.#saveProgressSnapshot(snapshot, removedPathKeys);
  }

  clearProgress() {
    this.#assertInitialized();
    const removedPathKeys = new Set([
      ...activeRows(this.#lessonProgressRows, this.userId).map((row) => row.pathKey),
      ...activeRows(this.#cardProgressRows, this.userId).map((row) => row.pathKey)
    ]);
    return this.#saveProgressSnapshot(createEmptyProgressDocument(), removedPathKeys);
  }

  loadLessonProgress(lessonId, userId = this.userId) {
    this.#assertInitialized();
    return clone(activeRows(this.#lessonProgressRows, userId).find((row) => row.lessonId === lessonId) || null);
  }

  loadCardProgress(cardId, userId = this.userId) {
    this.#assertInitialized();
    return clone(activeRows(this.#cardProgressRows, userId).find((row) => row.cardId === cardId) || null);
  }

  resolveCardReference({
    courseKey,
    moduleKey,
    lessonKey,
    microsequenceKey,
    cardKey
  } = {}) {
    this.#assertInitialized();
    const lessonReference = this.#findProjectReference(
      `${courseKey || ""}::${moduleKey || ""}::${lessonKey || ""}`
    );
    const microsequence = (this.#projectRows.microsequences || []).find(
      (row) =>
        isActive(row) &&
        row.lessonId === lessonReference.lesson?.id &&
        row.contractKey === microsequenceKey
    );
    const card = (this.#projectRows.cards || []).find(
      (row) =>
        isActive(row) &&
        row.microsequenceId === microsequence?.id &&
        row.contractKey === cardKey
    );
    if (!lessonReference.course || !lessonReference.moduleValue || !lessonReference.lesson || !microsequence || !card) {
      return null;
    }
    return clone({
      courseId: lessonReference.course.id,
      moduleId: lessonReference.moduleValue.id,
      lessonId: lessonReference.lesson.id,
      microsequenceId: microsequence.id,
      cardId: card.id,
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      cardKey,
      sourceEntityId: card.sourceEntityId ?? null
    });
  }

  saveLessonProgress(row) {
    this.#assertInitialized();
    const input = clone(row);
    return this.#enqueue(async () => {
      const progressUserId = input.userId ?? this.userId;
      const rowId = input.id || await this.#naturalEntityId(
        "lessonProgress",
        progressUserId,
        input.lessonId
      );
      const previous = this.#lessonProgressRows.get(rowId) || activeRows(
        this.#lessonProgressRows,
        progressUserId
      ).find((entry) => entry.lessonId === input.lessonId) || null;
      const next = {
        ...input,
        id: previous?.id || rowId,
        userId: progressUserId,
        sourceEntityId: input.sourceEntityId ?? previous?.sourceEntityId ?? null,
        revision: Number(previous?.revision || 0),
        updatedAt: previous?.updatedAt ?? null,
        deletedAt: null
      };
      const result = await this.mutations.applyRowChange("lessonProgress", previous, next);
      replaceAppliedRows(this.#lessonProgressRows, result.appliedRows, "lessonProgress");
      this.#progress = progressDocumentFromRows(
        this.#lessonProgressRows,
        this.#cardProgressRows,
        this.userId
      );
      return clone(result.appliedRows[0]?.row || next);
    }, null, { retryable: true });
  }

  saveCardProgress(row) {
    this.#assertInitialized();
    const input = clone(row);
    return this.#enqueue(async () => {
      const progressUserId = input.userId ?? this.userId;
      const rowId = input.id || await this.#naturalEntityId(
        "cardProgress",
        progressUserId,
        input.cardId
      );
      const previous = this.#cardProgressRows.get(rowId) || activeRows(
        this.#cardProgressRows,
        progressUserId
      ).find((entry) => entry.cardId === input.cardId) || null;
      const next = {
        ...input,
        id: previous?.id || rowId,
        userId: progressUserId,
        sourceEntityId: input.sourceEntityId ?? previous?.sourceEntityId ?? null,
        revision: Number(previous?.revision || 0),
        updatedAt: previous?.updatedAt ?? null,
        deletedAt: null
      };
      const result = await this.mutations.applyRowChange("cardProgress", previous, next);
      replaceAppliedRows(this.#cardProgressRows, result.appliedRows, "cardProgress");
      this.#progress = progressDocumentFromRows(
        this.#lessonProgressRows,
        this.#cardProgressRows,
        this.userId
      );
      return clone(result.appliedRows[0]?.row || next);
    }, null, { retryable: true });
  }

  #recordCardActivity(reference, { attempt = false, completed = false, result = null } = {}) {
    this.#assertInitialized();
    if (!this.userId) throw new Error("A atividade de estudo exige um usuário autenticado.");
    const resolved = this.resolveCardReference(reference);
    if (!resolved) throw new Error("Não foi possível resolver o card da atividade de estudo.");
    const pathKey = `${resolved.courseKey}::${resolved.moduleKey}::${resolved.lessonKey}`;
    const lessonReference = this.#findProjectReference(pathKey);
    const position = Math.max(
      0,
      lessonReference.cards.findIndex((row) => row.id === resolved.cardId)
    );

    return this.#enqueue(async () => {
      const now = timestamp(this.clock);
      const previousLesson = activeRows(this.#lessonProgressRows, this.userId)
        .find((row) => row.lessonId === resolved.lessonId) || null;
      const lessonProgressId = previousLesson?.id || await this.#naturalEntityId(
        "lessonProgress",
        this.userId,
        resolved.lessonId
      );
      const lessonRow = {
        ...(previousLesson || {}),
        id: lessonProgressId,
        courseId: resolved.courseId,
        moduleId: resolved.moduleId,
        lessonId: resolved.lessonId,
        sourceEntityId: lessonReference.lesson?.sourceEntityId ?? previousLesson?.sourceEntityId ?? null,
        userId: this.userId,
        courseKey: resolved.courseKey,
        moduleKey: resolved.moduleKey,
        lessonKey: resolved.lessonKey,
        pathKey,
        cursor: Number(previousLesson?.cursor || 0),
        firstViewedAt: previousLesson?.firstViewedAt || now,
        completedAt: previousLesson?.completedAt || null,
        lastActivityAt: now,
        revision: Number(previousLesson?.revision || 0),
        updatedAt: previousLesson?.updatedAt ?? null,
        deletedAt: null
      };
      const previousCard = activeRows(this.#cardProgressRows, this.userId)
        .find((row) => row.cardId === resolved.cardId) || null;
      const cardProgressId = previousCard?.id || await this.#naturalEntityId(
        "cardProgress",
        this.userId,
        resolved.cardId
      );
      const cardRow = {
        ...(previousCard || {}),
        id: cardProgressId,
        courseId: resolved.courseId,
        moduleId: resolved.moduleId,
        lessonId: resolved.lessonId,
        lessonProgressId: lessonRow.id,
        cardId: resolved.cardId,
        sourceEntityId: resolved.sourceEntityId ?? previousCard?.sourceEntityId ?? null,
        userId: this.userId,
        pathKey,
        cardKey: resolved.cardKey,
        position,
        firstViewedAt: previousCard?.firstViewedAt || now,
        completedAt: previousCard?.completedAt || (completed ? now : null),
        attempts: Number(previousCard?.attempts || 0) + (attempt ? 1 : 0),
        lastResult: result ?? previousCard?.lastResult ?? null,
        lastActivityAt: now,
        revision: Number(previousCard?.revision || 0),
        updatedAt: previousCard?.updatedAt ?? null,
        deletedAt: null
      };
      const completedCardIds = new Set(
        activeRows(this.#cardProgressRows, this.userId)
          .filter((row) => row.lessonId === resolved.lessonId && row.id !== cardRow.id && row.completedAt)
          .map((row) => row.cardId)
      );
      if (cardRow.completedAt) completedCardIds.add(cardRow.cardId);
      const lessonCompleted = lessonReference.cards.length > 0 && lessonReference.cards.every(
        (card) => completedCardIds.has(card.id)
      );
      lessonRow.cursor = Math.max(Number(previousLesson?.cursor ?? -1), position);
      lessonRow.completedAt = previousLesson?.completedAt || (lessonCompleted ? now : null);
      const mutationResult = await this.mutations.applyMutations([
        makeMutation("lessonProgress", previousLesson, lessonRow),
        makeMutation("cardProgress", previousCard, cardRow)
      ].filter(isEffectiveMutation));
      replaceAppliedRows(this.#lessonProgressRows, mutationResult.appliedRows, "lessonProgress");
      replaceAppliedRows(this.#cardProgressRows, mutationResult.appliedRows, "cardProgress");
      this.#progress = progressDocumentFromRows(
        this.#lessonProgressRows,
        this.#cardProgressRows,
        this.userId
      );
      return clone(cardRow);
    }, null, { retryable: true });
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
    this.#assertInitialized();
    return [...this.#commentRows.values()]
      .filter((row) => includeDeleted || isActive(row))
      .filter((row) => courseId === undefined || row.courseId === courseId)
      .filter((row) => cardId === undefined || row.cardId === cardId)
      .filter((row) => userId === undefined || row.userId === userId)
      .map(clone);
  }

  loadCommentForPath(reference, userId = this.userId) {
    const resolved = this.resolveCardReference(reference);
    if (!resolved) return null;
    return clone(
      activeRows(this.#commentRows, userId).find((row) => row.cardId === resolved.cardId) || null
    );
  }

  async saveCommentForPath(reference, body, userId = this.userId) {
    const resolved = this.resolveCardReference(reference);
    if (!resolved) throw new Error("Card não encontrado para persistir comentário.");
    const previous = activeRows(this.#commentRows, userId).find(
      (row) => row.cardId === resolved.cardId
    );
    if (!String(body || "").trim()) {
      return previous ? this.deleteComment(previous.id) : null;
    }
    return this.saveComment({
      ...resolved,
      id: previous?.id,
      userId,
      body: String(body),
      createdAt: previous?.createdAt || timestamp(this.clock)
    });
  }

  saveComment(comment) {
    this.#assertInitialized();
    if (!comment?.cardId) throw new Error("Comentário relacional exige cardId.");
    const input = clone(comment);
    return this.#enqueue(async () => {
      const commentUserId = input.userId ?? this.userId;
      const commentId = input.id || await this.#naturalEntityId(
        "comments",
        commentUserId,
        input.cardId
      );
      const previous = this.#commentRows.get(commentId) || activeRows(
        this.#commentRows,
        commentUserId
      ).find((row) => row.cardId === input.cardId);
      const next = {
        ...input,
        id: previous?.id || commentId,
        userId: commentUserId,
        sourceEntityId: input.sourceEntityId ?? previous?.sourceEntityId ?? null,
        revision: Number(previous?.revision || 0),
        updatedAt: previous?.updatedAt ?? null,
        deletedAt: null
      };
      const result = await this.mutations.applyRowChange("comments", previous, next);
      replaceAppliedRows(this.#commentRows, result.appliedRows, "comments");
      return clone(result.appliedRows[0]?.row || next);
    }, null, { retryable: true });
  }

  deleteComment(commentId) {
    this.#assertInitialized();
    return this.#enqueue(async () => {
      const previous = this.#commentRows.get(commentId);
      if (!previous || !isActive(previous)) return null;
      const result = await this.mutations.applyRowChange("comments", previous, null);
      replaceAppliedRows(this.#commentRows, result.appliedRows, "comments");
      return clone(result.appliedRows[0]?.row || null);
    }, null, { retryable: true });
  }

  exportJson() {
    this.#assertInitialized();
    return JSON.stringify(this.loadProject(), null, 2);
  }

  async importJson(rawJson) {
    this.#assertInitialized();
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (error) {
      throw new Error(`JSON AraLearn inválido para importação: ${error.message}`, { cause: error });
    }
    if (parsed?.format === "aralearn.storage") {
      throw new Error("O pacote documental legado não é aceito; importe um contrato AraLearn v3.");
    }
    const project = await this.saveProject(parsed);
    return { project, progress: this.loadProgress() };
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
    if (this.#durabilityError) {
      throw this.#durabilityError;
    }
  }

  async retryDurability() {
    this.#assertInitialized();
    const failedTasks = this.#failedDurabilityTasks.splice(0);
    this.#durabilityError = null;
    const operations = [];
    failedTasks.forEach((task) => {
      operations.push(this.#enqueue(task, null, { retryable: true }));
    });
    if (JSON.stringify(this.#project) !== JSON.stringify(this.#committedProject)) {
      operations.push(this.saveProject(this.#project));
    }
    if (JSON.stringify(this.#progress) !== JSON.stringify(this.#committedProgressDocument())) {
      operations.push(this.saveProgress(this.#progress));
    }
    if (!operations.length) this.#notifyDurability();
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
