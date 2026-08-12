import {
  createEmptyProjectDocument,
  validateProjectDocument
} from "../domain/aralearnProject.js";
import { DomainMutationService } from "./DomainMutationService.js";
import {
  IndexedDbRelationalStore,
  LocalCourseDraftChangedError,
  PROJECT_ROW_STORE_NAMES,
  localCourseAuthoringStateId
} from "./IndexedDbRelationalStore.js";
import { ProjectDocumentAssembler } from "./ProjectDocumentAssembler.js";
import { ProjectDocumentDiffer } from "./ProjectDocumentDiffer.js";
import { defaultUuidFactory } from "./relationalSchema.js";

const PERSONAL_REPLICA_STORE_NAMES = ["courseSelections"];
const CARD_ASSISTANCE_LOCAL_STATE_CONTRACT =
  "aralearn.card-assistance-local-state.v4";
const CARD_ASSISTANCE_SYNC_MAX_PATHS = 64;
const CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA = 64;

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
  const pendingMetadata = normalized.sync?.pendingMetadata === undefined
    ? []
    : normalized.sync.pendingMetadata;
  if (!Array.isArray(pendingPaths) || !Array.isArray(pendingMetadata)) {
    throw cardAssistanceStateError("A fila de sincronização contextual é inválida.");
  }
  normalized.sync.pendingMetadata = pendingMetadata;
  if (normalized.sync.status !== undefined) {
    if (!["pending", "conflict"].includes(normalized.sync.status)) {
      throw cardAssistanceStateError("O estado da sincronização contextual é inválido.");
    }
    normalized.sync.errorMessage = String(normalized.sync.errorMessage || "").trim();
    if (normalized.sync.errorMessage.length > 2_000) {
      throw cardAssistanceStateError("A mensagem da sincronização contextual é muito longa.");
    }
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
  if (pendingMetadata.length > CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA) {
    throw cardAssistanceStateError(
      `A sincronização contextual excede ${CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA} metadados.`
    );
  }
  pendingMetadata.forEach((entry) => {
    const expectedLength = {
      course: 1,
      module: 2,
      lesson: 3,
      microsequence: 4
    }[entry?.entityType];
    const pathValue = entry?.entityPath;
    const baseFields = entry?.baseMetadata && typeof entry.baseMetadata === "object"
      ? Object.keys(entry.baseMetadata)
      : [];
    const nextFields = entry?.metadata && typeof entry.metadata === "object"
      ? Object.keys(entry.metadata)
      : [];
    if (!expectedLength || !Array.isArray(pathValue) || pathValue.length !== expectedLength ||
        pathValue.some((id) => typeof id !== "string" || !id.trim()) ||
        pathValue[0] !== normalizedCourseKey ||
        !baseFields.length || baseFields.length !== nextFields.length ||
        baseFields.some((field) =>
          !["title", "goal"].includes(field) || !nextFields.includes(field)
        )) {
      throw cardAssistanceStateError("A edição textual pendente é inválida.");
    }
  });
  if (normalized.undo !== null && normalized.undo !== undefined) {
    if (normalized.undo.contract !== "aralearn.contextual-authoring-undo.v2") {
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

function activeRowsSnapshot(rows, userId) {
  return JSON.stringify(
    activeRows(rows, userId).sort((left, right) =>
      String(left.id).localeCompare(String(right.id))
    )
  );
}

function validationError(result) {
  const details = (result.errors || [])
    .map((entry) => `${entry.path}: ${entry.message}`)
    .join("; ");
  const error = new Error(`Biblioteca AraLearn inválida${details ? `: ${details}` : "."}`);
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

function changedProjectCourseKeys(previousProject, nextProject) {
  const snapshot = (projectDocument) => new Map(
    (projectDocument?.courses || []).map((course) => [
      String(course.id),
      JSON.stringify(stableValue(course))
    ])
  );
  const previous = snapshot(previousProject);
  const next = snapshot(nextProject);
  return new Set([...previous.keys(), ...next.keys()].filter((courseKey) =>
    previous.get(courseKey) !== next.get(courseKey)
  ));
}

function courseIdsByContractKey(projectRows) {
  return new Map((projectRows?.courses || [])
    .filter(isActive)
    .map((course) => [String(course.contractKey || course.id), String(course.id)]));
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

export class RelationalProjectRepository {
  #initialized = false;
  #projectRows = {};
  #project = createEmptyProjectDocument();
  #committedProject = createEmptyProjectDocument();
  #selectionRows = new Map();
  #localDraftRevisions = new Map();
  #catalogManagementAllowed = false;
  #tail = Promise.resolve();
  #pendingWrites = 0;
  #durabilityError = null;
  #failedDurabilityTasks = [];
  #latestDurabilityTaskVersions = new Map();
  #durabilityListeners = new Set();
  #durabilityChangedAt = null;
  #latestProjectSave = 0;

  constructor({
    store,
    assembler = new ProjectDocumentAssembler({ validate: true }),
    differ,
    mutationService,
    identityMap = new Map(),
    userId = null,
    uuidFactory = defaultUuidFactory,
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
  }

  async refreshFromReplica() {
    this.#assertInitialized();
    await this.flush();
    const previousProjectDocument = this.loadProject();
    const previousCourseIds = courseIdsByContractKey(this.#projectRows);
    const previousProject = JSON.stringify(this.#project);
    await this.#reloadFromStore();
    const nextProjectDocument = this.loadProject();
    const documentChanged = previousProject !== JSON.stringify(this.#project);
    if (documentChanged) {
      const nextCourseIds = courseIdsByContractKey(this.#projectRows);
      const changedCourseIds = new Set();
      for (const courseKey of changedProjectCourseKeys(
        previousProjectDocument,
        nextProjectDocument
      )) {
        if (previousCourseIds.has(courseKey)) changedCourseIds.add(previousCourseIds.get(courseKey));
        if (nextCourseIds.has(courseKey)) changedCourseIds.add(nextCourseIds.get(courseKey));
      }
      if (changedCourseIds.size) {
        await this.mutations.applyMutations([], {
          localRows: this.#cardAssistanceUndoInvalidationRows(
            changedCourseIds,
            { rebasePending: false }
          )
        });
      }
    }
    return {
      project: this.loadProject(),
      documentChanged
    };
  }

  async refreshPersonalStateFromReplica() {
    this.#assertInitialized();
    await this.flush();
    const previousProjectDocument = this.loadProject();
    const previousCourseIds = courseIdsByContractKey(this.#projectRows);
    const previousSelectionRows = activeRowsSnapshot(this.#selectionRows, this.userId);
    const personalRows = await this.store.readStores(PERSONAL_REPLICA_STORE_NAMES);
    const nextSelectionRows = new Map(personalRows.courseSelections.map((row) => [row.id, row]));
    const selectionRowsChanged = previousSelectionRows !==
      activeRowsSnapshot(nextSelectionRows, this.userId);

    if (selectionRowsChanged) {
      await this.#reloadFromStore();
      const nextProjectDocument = this.loadProject();
      const nextCourseIds = courseIdsByContractKey(this.#projectRows);
      const changedCourseIds = new Set();
      for (const courseKey of changedProjectCourseKeys(
        previousProjectDocument,
        nextProjectDocument
      )) {
        if (previousCourseIds.has(courseKey)) changedCourseIds.add(previousCourseIds.get(courseKey));
        if (nextCourseIds.has(courseKey)) changedCourseIds.add(nextCourseIds.get(courseKey));
      }
      if (changedCourseIds.size) {
        await this.mutations.applyMutations([], {
          localRows: this.#cardAssistanceUndoInvalidationRows(
            changedCourseIds,
            { rebasePending: false }
          )
        });
      }
      return {
        project: this.loadProject(),
        documentChanged: true
      };
    }

    this.#selectionRows = nextSelectionRows;
    return { documentChanged: false };
  }

  #assertInitialized() {
    if (!this.#initialized) throw new Error("O repositório relacional ainda não foi inicializado.");
  }

  #hasUncommittedMemory() {
    return false;
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

  async getWorkspaceCourseDraftReceipt(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course || typeof this.store.getWorkspaceCourseDraftReceipt !== "function") return null;
    const receipt = await this.store.getWorkspaceCourseDraftReceipt(course.id);
    return receipt
      ? {
          ...receipt,
          courseKey: course.contractKey || course.id
        }
      : null;
  }

  async acknowledgeWorkspaceCourseDraft(courseIdentity, {
    expectedLocalDraftRevision,
    workspaceId,
    workspaceRevision
  } = {}) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const selection = this.#courseSelectionRow(course.id);
    if (!selection) {
      throw new Error("O curso local não possui uma seleção ativa nesta conta.");
    }
    const permissions = this.coursePermissions(course.id);
    if (!permissions.canAuthorContent || permissions.writeTarget === null) {
      throw courseAuthoringDenied(course.id);
    }
    const expectedRevision = String(expectedLocalDraftRevision || "").trim();
    if (!expectedRevision) {
      throw new TypeError("A confirmação exige a revisão local materializada.");
    }
    await this.flush();
    const result = await this.store.acknowledgeWorkspaceCourseDraft(course.id, {
      expectedRevision,
      workspaceId,
      workspaceRevision
    });
    await this.#reloadFromStore();
    return {
      ...result,
      courseKey: String(course.contractKey || course.id),
      courseOrigin: requireCourseOrigin(selection)
    };
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

  async loadContextualAuthoringSnapshot(courseIdentity) {
    this.#assertInitialized();
    await this.flush();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const courseId = String(course.id);
    const courseKey = String(course.contractKey || course.id);
    const stateId = cardAssistanceLocalStateId(courseId);
    const draftId = localCourseAuthoringStateId(courseId);
    const snapshot = await this.store.transaction(
      [...new Set([...PROJECT_ROW_STORE_NAMES, "courseSelections", "syncState"])],
      "readonly",
      async (transaction) => {
        const rows = {};
        for (const storeName of PROJECT_ROW_STORE_NAMES) {
          if (storeName === "projectMeta") {
            rows[storeName] = await transaction.getAll(storeName);
          } else if (storeName === "courses") {
            const row = await transaction.get(storeName, courseId);
            rows[storeName] = row ? [row] : [];
          } else {
            rows[storeName] = await transaction.getAllByIndex(
              storeName,
              "byCourseId",
              courseId
            );
          }
        }
        const selections = await transaction.getAllByIndex(
          "courseSelections",
          "byCourseId",
          courseId
        );
        return {
          rows,
          selection: selections.find((row) => isActive(row) && (
            row.userId === this.userId || row.ownerId === this.userId
          )) || null,
          draftRow: await transaction.get("syncState", draftId),
          assistanceRow: await transaction.get("syncState", stateId)
        };
      }
    );
    const projectDocument = normalizeProject(this.assembler.assemble(snapshot.rows));
    const draftValue = snapshot.draftRow?.value;
    let draft = null;
    if (draftValue?.status === "dirty") {
      const revision = String(draftValue.revision || "").trim();
      if (!revision) {
        throw new Error("O localDraft persistido não possui uma revisão canônica válida.");
      }
      draft = {
        courseId,
        courseKey,
        courseOrigin: requireCourseOrigin(snapshot.selection),
        status: "dirty",
        revision,
        basePublicationSeq: Number(draftValue.basePublicationSeq || 0),
        baseContentHash: String(draftValue.baseContentHash || ""),
        createdAt: String(draftValue.createdAt || ""),
        updatedAt: String(draftValue.updatedAt || "")
      };
    }
    const localState = snapshot.assistanceRow
      ? normalizeCardAssistanceStateForCourse(snapshot.assistanceRow.value, courseKey)
      : null;
    const hasPendingAssistance = Boolean(
      localState?.sync?.pendingPaths?.length || localState?.sync?.pendingMetadata?.length
    );
    if (draft && hasPendingAssistance &&
        String(localState.sync.expectedRevision || "").trim() !== draft.revision) {
      throw cardAssistanceStateError(
        "A fila contextual e o rascunho local pertencem a revisões diferentes."
      );
    }
    return Object.freeze({
      contract: "aralearn.contextual-authoring-snapshot.v1",
      courseId,
      courseKey,
      projectDocument,
      draft,
      localState
    });
  }

  async saveCardAssistanceLocalState(courseIdentity, value) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const courseKey = String(course.contractKey || course.id);
    const normalized = normalizeCardAssistanceStateForCourse(value, courseKey);
    return this.store.putSyncState(cardAssistanceLocalStateId(course.id), normalized);
  }

  async updateCardAssistanceSyncStatus(courseIdentity, {
    status,
    errorMessage = "",
    expectedLocalDraftRevision = null
  } = {}) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    if (!["pending", "conflict"].includes(status)) {
      throw new TypeError("O estado da sincronização contextual é inválido.");
    }
    const courseId = String(course.id);
    const courseKey = String(course.contractKey || course.id);
    const stateId = cardAssistanceLocalStateId(courseId);
    const expectedRevision = String(expectedLocalDraftRevision || "").trim() || null;
    const message = String(errorMessage || "").trim();
    if (message.length > 2_000) {
      throw new TypeError("A mensagem da sincronização contextual é muito longa.");
    }
    return this.#enqueue(async () => {
      const result = await this.store.transaction(
        ["syncState"],
        "readwrite",
        async (transaction) => {
          const row = await transaction.get("syncState", stateId);
          if (!row) return { updated: false, localState: null };
          const localState = normalizeCardAssistanceStateForCourse(row.value, courseKey);
          const actualRevision = String(localState.sync.expectedRevision || "").trim() || null;
          if (expectedRevision !== actualRevision) {
            return { updated: false, localState };
          }
          if (!localState.sync.pendingPaths.length && !localState.sync.pendingMetadata.length) {
            delete localState.sync.status;
            delete localState.sync.errorMessage;
          } else {
            localState.sync.status = status;
            localState.sync.errorMessage = message;
          }
          const updatedAt = timestamp(this.clock);
          await transaction.put("syncState", {
            ...row,
            id: stateId,
            key: stateId,
            courseId,
            value: localState,
            updatedAt
          });
          return { updated: true, localState };
        }
      );
      return clone(result);
    }, { retryable: false });
  }

  async listPendingLocalAuthoring() {
    this.#assertInitialized();
    const rows = typeof this.store.getAll === "function"
      ? await this.store.getAll("syncState")
      : [];
    const byCourseId = new Map();
    for (const row of rows) {
      const key = String(row?.key || row?.id || "");
      let courseId = "";
      let kind;
      if (key.startsWith("authoring.localDraft:")) {
        courseId = key.slice("authoring.localDraft:".length);
        if (row?.value?.status !== "dirty") continue;
        kind = "draft";
      } else if (key.startsWith("authoring.cardAssistance:")) {
        courseId = key.slice("authoring.cardAssistance:".length);
        const course = (this.#projectRows.courses || []).find((entry) => String(entry.id) === courseId);
        const courseKey = String(course?.contractKey || courseId);
        try {
          const localState = normalizeCardAssistanceStateForCourse(row.value, courseKey);
          if (!localState.sync.pendingPaths.length && !localState.sync.pendingMetadata.length) continue;
        } catch {
          // Um estado inválido também precisa ser isolado antes de trocar de conta.
        }
        kind = "assistance";
      } else {
        continue;
      }
      if (!courseId) continue;
      const current = byCourseId.get(courseId) || {
        courseId,
        hasDraft: false,
        hasAssistance: false
      };
      if (kind === "draft") current.hasDraft = true;
      else current.hasAssistance = true;
      byCourseId.set(courseId, current);
    }
    return [...byCourseId.values()].map((entry) => Object.freeze({ ...entry }));
  }

  async discardContextualAuthoringDraft(courseIdentity) {
    this.#assertInitialized();
    const course = this.#courseRow(courseIdentity);
    if (!course) throw new Error("Curso selecionado não encontrado.");
    const selection = this.#courseSelectionRow(course.id);
    if (!selection) {
      throw new Error("O curso local não possui uma seleção ativa nesta conta.");
    }
    const courseId = String(course.id);
    const courseKey = String(course.contractKey || course.id);
    await this.flush();
    await this.store.removeOfficialCourseReplica(courseId, { removeSelection: false });
    await this.#reloadFromStore();
    return Object.freeze({ courseId, courseKey });
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
          const materializedRevision = currentDraftRow?.value?.status === "materialized"
            ? String(currentDraftRow.value.consumedRevision || "").trim() || null
            : null;
          if (materializedRevision !== null && materializedRevision !== consumedRevision) {
            throw new LocalCourseDraftChangedError(
              courseId,
              consumedRevision,
              materializedRevision
            );
          }
          const currentStateRow = await transaction.get("syncState", stateId);
          if (!currentStateRow) {
            if (materializedRevision === consumedRevision) {
              await transaction.delete("syncState", draftId);
            }
            return null;
          }
          if (currentStateRow.value?.contract !== CARD_ASSISTANCE_LOCAL_STATE_CONTRACT) {
            await transaction.delete("syncState", stateId);
            return null;
          }
          const nextState = normalizeCardAssistanceStateForCourse(
            currentStateRow.value,
            String(course.contractKey || course.id)
          );
          const syncRevision = String(nextState.sync.expectedRevision || "").trim() || null;
          if ((nextState.sync.pendingPaths.length || nextState.sync.pendingMetadata.length) &&
              syncRevision !== consumedRevision) {
            throw new LocalCourseDraftChangedError(
              courseId,
              consumedRevision,
              syncRevision
            );
          }
          nextState.sync.pendingPaths = [];
          nextState.sync.pendingMetadata = [];
          nextState.sync.expectedRevision = null;
          delete nextState.sync.status;
          delete nextState.sync.errorMessage;
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
          if (materializedRevision === consumedRevision) {
            await transaction.delete("syncState", draftId);
          }
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

  #cardAssistanceUndoInvalidationRows(
    courseIds,
    { rebasePending = true } = {}
  ) {
    const updatedAt = timestamp(this.clock);
    return [...courseIds].map((courseId) => {
      const normalizedCourseId = String(courseId);
      const stateId = cardAssistanceLocalStateId(normalizedCourseId);
      return {
        storeName: "syncState",
        row: {
          id: stateId,
          key: stateId,
          courseId: normalizedCourseId,
          updatedAt
        },
        transformCurrentRow(currentRow) {
          const currentValue = currentRow?.value;
          if (
            !currentRow ||
            !currentValue ||
            typeof currentValue !== "object" ||
            Array.isArray(currentValue)
          ) {
            return null;
          }
          const pendingPaths = currentValue.sync?.pendingPaths;
          const pendingMetadata = currentValue.sync?.pendingMetadata;
          const hasPendingWork = rebasePending && (
            (Array.isArray(pendingPaths) && pendingPaths.length > 0) ||
            (Array.isArray(pendingMetadata) && pendingMetadata.length > 0)
          );
          const invalidatesUndo = currentValue.undo != null;
          if (hasPendingWork) {
            const error = new Error(
              "Sincronize ou resolva a edição textual pendente antes de fazer outra alteração neste curso."
            );
            error.code = "contextual_authoring_pending";
            throw error;
          }
          if (!invalidatesUndo && !hasPendingWork) return null;
          return {
            ...currentRow,
            id: stateId,
            key: stateId,
            courseId: normalizedCourseId,
            value: {
              ...currentValue,
              ...(invalidatesUndo ? { undo: null } : {})
            },
            updatedAt
          };
        }
      };
    });
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
          const authoringStateRows = await this.#localAuthoringStateRows(changedCourseIds, {
            expectedLocalDraftRevision
          });
          localRows.push(...authoringStateRows);
          if (!assistanceCourse) {
            localRows.push(...this.#cardAssistanceUndoInvalidationRows(
              changedCourseIds
            ));
          }
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
          if (committedRevision && (
            nextAssistanceState.sync.pendingPaths.length ||
            nextAssistanceState.sync.pendingMetadata.length
          )) {
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
          error?.code === "course_authoring_forbidden" ||
          error?.code === "contextual_authoring_pending"
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
