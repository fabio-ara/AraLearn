import { renderLessonScreen } from "./renderLessonScreen.js";
import { renderCardCommentOverlay } from "./renderCardCommentOverlay.js";
import { renderProviderConfigOverlay } from "./renderProviderConfigOverlay.js";
import {
  activateManualCardEdit,
  applyManualCardEdit,
  readManualCardEditPathValues
} from "./manualCardEdit.js";
import { captureRenderState, restoreRenderState } from "./renderState.js";
import { continuePopupMatches, createContinuePopupState, resolveIndexedTarget } from "./studyCardProgression.js";
import {
  buildCodexCliHealthCommand,
  buildCodexCliSetupScript,
  detectCodexCliSetupPlatform
} from "./codexCliSetup.js";
import {
  getPackageFeedbackEntry,
  getPackageResponseEntry
} from "../render/renderPackageCard.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { getCorrectExerciseOptionIds, getExerciseOptionStableId } from "../core/exerciseOptions.js";
import {
  buildCourseNavigationState,
  buildLessonNavigationState,
  buildModuleNavigationState,
  buildNavigationViewState,
  resolveExactCardSelection,
  resolveFirstSelection,
  resolveSelectionByKeys as resolveSelectionByKeysRuntime
} from "./lessonEditorNavigation.js";
import {
  buildCardPathKey,
  collectLessonCards,
  findLessonCardEntryIndex,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  findSelectedCard
} from "./lessonEditorPaths.js";
import {
  CODEX_LOCAL_MODEL_ID,
  DEFAULT_CODEX_LOCAL_ENDPOINT,
  checkCodexLocalHealth
} from "../generation/providers/codexCliConfig.js";
import {
  DEEPSEEK_BASE_URL,
  isDeepSeekModelId
} from "../generation/providers/deepSeekPolicy.js";
import {
  CUSTOM_PROVIDER_MODEL_ID,
  isCustomProviderSelection,
  isLocalProviderSelection,
  PROVIDER_PROTOCOL
} from "../generation/providers/providerRegistry.js";
import { executeCardAssistance } from "../generation/runtime/cardAssistanceRuntime.js";
import { resolveCardAssistanceLaunchConfig } from "../generation/runtime/cardAssistanceLaunchConfig.js";
import { executeBottomUpAssistance } from "../assist/bottomUpAssistanceRuntime.js";
import { buildBottomUpAssistanceScope } from "../assist/bottomUpAssistanceScope.js";
import {
  appendCardAssistanceConversationTurn,
  cardAssistanceConversationContext,
  cardAssistanceConversationKey,
  normalizeCardAssistanceConversation
} from "../assist/cardAssistanceConversation.js";
import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import {
  CARD_ASSISTANCE_UNDO_CONTRACT,
  applyContextualAuthoringInversePatch,
  clearContextualAuthoringSync,
  createContextualAuthoringInversePatch,
  markContextualAuthoringMetadataPending,
  markContextualAuthoringSyncPending,
  normalizeCardAssistanceLocalState,
  setContextualAuthoringSyncStatus,
  setCardAssistanceUndo
} from "../assist/cardAssistanceLocalState.js";
import {
  finalizeCleanContextualCourseDraftSync,
  finalizeContextualCourseDraftSync,
  materializeContextualCourseDraft
} from "../assist/contextualAuthoringSync.js";
import {
  CourseRemovalCommittedError,
  courseRemovalWasCommitted,
  deleteIntegratedEntity,
  deleteIntegratedCourse,
  moveIntegratedEntity
} from "../assist/integratedCourseSync.js";
import {
  applyCardAssistanceBatchChangeSet,
  assertCardAssistanceScopeCurrent,
  buildCardAssistanceScopeSnapshot,
  listCardResourceTargets
} from "../assist/cardAssistanceScope.js";
import {
  cardAssistanceSelectionIsReady,
  createCardAssistanceUiState,
  reconcileCardAssistanceUiState,
  toggleCardAssistanceWholeCard,
  toggleCardAssistanceResource
} from "./cardAssistanceUiState.js";
import {
  bottomUpAssistanceScopeInput,
  bottomUpAssistanceUiSelectionIsReady,
  createBottomUpAssistanceUiState,
  reconcileBottomUpAssistanceUiState,
  toggleBottomUpAssistanceContainer,
  toggleBottomUpAssistanceItem
} from "./bottomUpAssistanceUiState.js";
import {
  HomeTrailsController,
  isHomeTrailsAuthorityError
} from "./HomeTrailsController.js";
import {
  groupTrailItems,
  isStudyableTrailItem,
  mergeWorkspaceCourse,
  trailItemDeleteMode
} from "./homeTrailProjection.js";
import {
  applyAssistConfigPatch,
  checkCodexCliConnection,
  createCodexCliSetupStatus,
  normalizeAssistConfig,
  resolveCardAssistanceProviderReadiness
} from "../generation/runtime/cardAssistanceConfig.js";
import {
  createEmptyProgressDocument,
  removeLessonProgressEntries,
  truncateLessonProgressFromCardKeys,
  writeLessonProgressEntry
} from "../storage/progressStore.js";
import { resolveMicrosequenceRuntimeIncluded } from "../model/microsequenceStatus.js";
import {
  updateCardInMicrosequence as updateCardDocument,
  updateCourse as updateCourseDocument,
  updateLesson as updateLessonDocument,
  updateMicrosequence as updateMicrosequenceDocument,
  updateModule as updateModuleDocument
} from "../editor/contractEditor.js";

const ASSIST_MODEL_OPTIONS = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
  { value: CODEX_LOCAL_MODEL_ID, label: "Codex local" },
  { value: CUSTOM_PROVIDER_MODEL_ID, label: "Outro modelo" }
];
const COURSES_VIEWS = new Set(["courses", "course", "module", "lesson", "microsequence"]);

export function canSubmitCardAssistanceRequest({
  promptText,
  isSubmitting,
  selectionReady = false
}) {
  return Boolean(String(promptText || "").trim()) && selectionReady && !isSubmitting;
}

export function resolveCourseUiPermissions(storage, courseIdentity) {
  const fallback = {
    role: "learner",
    canAuthorContent: false,
    canComment: false,
    writeTarget: null,
    canOrganizeSelection: false,
    canRemoveSelection: false,
    canDeleteCourse: false,
    canEdit: false,
    canDelete: false
  };
  if (!courseIdentity || typeof storage?.coursePermissions !== "function") return fallback;
  const permissions = storage.coursePermissions(courseIdentity) || {};
  const canAuthorContent = permissions.canAuthorContent === true;
  const writeTarget = ["private", "catalog"].includes(permissions.writeTarget)
    ? permissions.writeTarget
    : null;
  return {
    role: String(permissions.role || "learner"),
    canAuthorContent,
    canComment: permissions.canComment === true,
    writeTarget: canAuthorContent ? writeTarget : null,
    canOrganizeSelection: permissions.canOrganizeSelection === true,
    canRemoveSelection: permissions.canRemoveSelection === true,
    canDeleteCourse: permissions.canDeleteCourse === true,
    canEdit: canAuthorContent,
    canDelete: permissions.canDeleteCourse === true
  };
}

export function courseRemovalConfirmation(storage, courseIdentity, title = "Curso") {
  const requested = String(courseIdentity || "");
  const resolved = storage?.resolveCourseContractKey?.(requested) || requested;
  const summary = (storage?.loadCourseSummaries?.() || []).find((item) => {
    const courseId = String(item?.courseId || "");
    return courseId === requested
      || courseId === resolved
      || storage?.resolveCourseContractKey?.(courseId) === resolved;
  });
  const courseOrigin = String(summary?.courseOrigin || "");
  if (courseOrigin === "catalog") {
    return `Retirar o curso oficial "${title || "Curso"}" de Coleções? Ele deixará de ser distribuído pelo catálogo.`;
  }
  if (courseOrigin === "private") {
    return `Excluir o curso privado "${title || "Curso"}" de Trilhas?`;
  }
  throw new Error("Não foi possível identificar a origem do curso.");
}

export function resolveBottomUpAffectedMicrosequenceIds(
  result,
  beforeLesson,
  afterLesson
) {
  const before = new Map((beforeLesson?.microsequences || []).map((item) => [
    item.id,
    canonicalStringify(item)
  ]));
  const after = new Map((afterLesson?.microsequences || []).map((item) => [
    item.id,
    canonicalStringify(item)
  ]));
  const existingIds = new Set([...before.keys(), ...after.keys()]);
  const contentChanges = [...existingIds]
    .filter((id) => before.get(id) !== after.get(id));
  return [...new Set([
    ...contentChanges,
    ...(result?.change?.targetIds || []),
    ...(result?.change?.createdIds || []),
    result?.change?.destinationId
  ].filter((id) => existingIds.has(id)))];
}

export function courseDocumentChanged(previousProject, nextProject, courseKey) {
  const normalizedCourseKey = text(courseKey);
  if (!normalizedCourseKey) return false;
  return canonicalStringify(findCourse(previousProject, normalizedCourseKey)) !==
    canonicalStringify(findCourse(nextProject, normalizedCourseKey));
}

function fail(message) {
  throw new Error(message);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assistApiKeyFamily(model = "") {
  const modelId = text(model).toLowerCase();
  if (isDeepSeekModelId(modelId)) return "deepseek";
  if (modelId.startsWith("gemini-")) return "gemini";
  return "";
}

export function claimContextualAuthoringSyncAttempt(syncState = {}) {
  if (syncState.running === true) {
    syncState.trailingAttemptRequested = true;
    return false;
  }
  syncState.running = true;
  syncState.trailingAttemptRequested = false;
  return true;
}

export function settleContextualAuthoringSyncAttempt(
  syncState = {},
  scheduleTrailingAttempt = null
) {
  syncState.running = false;
  const shouldScheduleTrailingAttempt = syncState.trailingAttemptRequested === true;
  syncState.trailingAttemptRequested = false;
  if (
    shouldScheduleTrailingAttempt &&
    typeof scheduleTrailingAttempt === "function"
  ) {
    queueMicrotask(scheduleTrailingAttempt);
  }
  return shouldScheduleTrailingAttempt;
}

export function createLessonEditorApp({
  root,
  storage,
  editor,
  initialProject,
  assistProvider = null,
  contextualAuthoring = null,
  homeTrails = null,
  workspaceCourseAdapter = null,
  trailPersonalStateFactory = null
}) {
  if (!root) fail("Raiz inválida.");
  if (!storage || typeof storage.loadProject !== "function") fail("Storage inválido.");
  if (!editor) fail("Editor inválido.");
  if (!initialProject || !Array.isArray(initialProject.courses)) fail("Projeto inicial inválido.");
  if (homeTrails && typeof trailPersonalStateFactory !== "function") {
    fail("Adaptador de estado pessoal de Trilhas inválido.");
  }
  const initialAssistConfig = normalizeAssistConfig({});
  const homeTrailsController = homeTrails
    ? new HomeTrailsController({ adapter: homeTrails })
    : null;
  const state = {
    project: initialProject,
    view: "courses",
    homeTab: "courses",
    homeSelectedCourseKey: "",
    homeSelectedTrailItemId: "",
    homeTrailSnapshot: null,
    homeTrailLoading: false,
    trailPersonalStorageByItemId: new Map(),
    trailPersonalStorageLoadingByItemId: new Map(),
    trailPersonalStorageRefreshScheduled: new WeakSet(),
    homeOrganization: {
      selectedGroupId: "",
      creatingGroup: false,
      editingGroupId: "",
      movingItemId: "",
      busy: false,
      error: ""
    },
    selection: null,
    cardCommentOpen: false,
    entityMutationSaving: false,
    entityMutationError: "",
    inlineStructureEditor: null,
    providerConfigOpen: false,
    assistConfig: initialAssistConfig,
    codexCliSetupStatus: createCodexCliSetupStatus(),
    microsequenceMode: "play",
    entityModes: {
      course: "view",
      module: "view",
      lesson: "view",
      microsequence: "view",
      card: "view"
    },
    cardCommentDraft: { category: "observation", body: "" },
    cardCommentExists: false,
    cardCommentError: "",
    cardCommentSaving: false,
    responseExerciseByBlockKey: {},
    activeTextGapPrompt: null,
    cardExerciseLoadVersion: 0,
    continuePopup: null,
    assistDraft: {
      composerOpen: false,
      promptText: "",
      manualDraft: null,
      assistance: createCardAssistanceUiState(),
      localState: normalizeCardAssistanceLocalState({}),
      localStateCourseKey: "",
      localAuthoringByCourseId: new Map(),
      contextualAuthoringSync: {
        running: false,
        activePromise: null,
        trailingAttemptRequested: false,
        courseKeys: new Set(),
        retryTimers: new Map(),
        retryAttempts: new Map()
      },
      progressResetTimers: new Map(),
      syncError: "",
      isSubmitting: false,
      errorMessage: "",
      manualEditError: "",
      conversationByReferenceKey: new Map()
    },
    bottomUpDraft: {
      level: "",
      composerOpen: false,
      assistance: createBottomUpAssistanceUiState({ level: "lesson" }),
      promptText: "",
      isSubmitting: false,
      errorMessage: ""
    },
    lastCoursesView: "courses",
    pendingExerciseFocus: null,
    pendingAuthoringFocus: ""
  };

  state.selection = resolveFirstSelection(state.project);
  state.homeSelectedCourseKey = state.selection?.courseKey || "";

  function trailCourseRef(
    courseKey = state.selection?.courseKey,
    trailItemId = state.homeSelectedTrailItemId
  ) {
    return homeTrailsController?.courseRefForKey(courseKey, { trailItemId }) || null;
  }

  function workspaceCourseRef(courseKey = state.selection?.courseKey) {
    const reference = trailCourseRef(courseKey);
    return reference?.workspaceId ? reference : null;
  }

  function workspaceCourseHook(name) {
    return typeof workspaceCourseAdapter?.[name] === "function"
      ? workspaceCourseAdapter[name].bind(workspaceCourseAdapter)
      : null;
  }

  function workspaceAuthoringState(courseKey = state.selection?.courseKey) {
    const reference = workspaceCourseRef(courseKey);
    if (!reference) {
      const localState = state.assistDraft.localStateCourseKey === courseKey
        ? normalizeCardAssistanceLocalState(state.assistDraft.localState)
        : state.assistDraft.localAuthoringByCourseId.get(courseKey) || null;
      const pendingCount = localState
        ? localState.sync.pendingPaths.length + localState.sync.pendingMetadata.length
        : 0;
      const status = localState?.sync.status === "conflict"
        ? "conflict"
        : pendingCount ? "pending" : "";
      return Object.freeze({
        source: "local",
        status,
        pendingCount,
        errorMessage: String(localState?.sync.errorMessage || ""),
        canKeepLocal: status === "conflict" &&
          globalThis.navigator?.onLine !== false &&
          contextualAuthoringIsAvailable(),
        canDiscardLocal: status === "conflict" &&
          globalThis.navigator?.onLine !== false &&
          typeof storage.discardContextualAuthoringDraft === "function" &&
          typeof contextualAuthoring?.synchronizeReplica === "function"
      });
    }
    const status = ["pending", "conflict"].includes(reference?.authoringStatus)
      ? reference.authoringStatus
      : "";
    return Object.freeze({
      source: "workspace",
      status,
      pendingCount: Number(reference?.authoringPendingCount) || 0,
      errorMessage: String(reference?.authoringErrorMessage || ""),
      canKeepLocal: status === "conflict" &&
        globalThis.navigator?.onLine !== false &&
        Boolean(workspaceCourseHook("resolveAuthoringConflict")),
      canDiscardLocal: status === "conflict" &&
        Boolean(workspaceCourseHook("resolveAuthoringConflict"))
    });
  }

  function updateWorkspaceAuthoringReference(courseRef, result = {}) {
    if (!courseRef?.trailItemId || !homeTrailsController) return null;
    const pending = result?.pending === true;
    const status = pending
      ? result?.conflict === true || result?.status === "conflict"
        ? "conflict"
        : "pending"
      : "";
    const current = homeTrailsController.courseRefs.get(courseRef.trailItemId) || courseRef;
    const revision = Number(result?.revision);
    return homeTrailsController.updateCourseRef(courseRef.trailItemId, {
      ...(Number.isSafeInteger(revision) && revision > 0 ? { revision } : {}),
      canEditOffline: current.canEditOffline === true || current.canEdit === true,
      authoringStatus: status,
      authoringPendingCount: pending
        ? Number(result?.queue?.operations?.length) || Number(current.authoringPendingCount) || 1
        : 0,
      authoringErrorMessage: pending ? String(result?.errorMessage || "") : ""
    });
  }

  function applyWorkspaceAuthoringResult(projectDocument, courseRef, result = {}) {
    const savedCourse = result?.course && typeof result.course === "object"
      ? structuredClone(result.course)
      : null;
    const nextProject = savedCourse
      ? mergeWorkspaceCourse(
          projectDocument,
          savedCourse,
          [courseRef?.courseKey, courseRef?.courseId]
        )
      : projectDocument;
    const course = savedCourse || findCourse(nextProject, courseRef?.courseKey);
    if (course && courseRef?.trailItemId) {
      homeTrailsController.loadedCourses.set(
        courseRef.trailItemId,
        structuredClone(course)
      );
    }
    return nextProject;
  }

  function resolveCourseAuthoringCapabilities(courseKey = state.selection?.courseKey) {
    const online = globalThis.navigator?.onLine !== false;
    const localAiAvailable = isLocalProviderSelection({
      selectedModel: state.assistConfig.model,
      providerProtocol: state.assistConfig.providerProtocol
    });
    const workspaceRef = workspaceCourseRef(courseKey);
    if (workspaceRef) {
      const hasPendingWorkspaceDraft = ["pending", "conflict"].includes(
        workspaceRef.authoringStatus
      );
      const canEditRemotely = online && workspaceRef.canEdit === true;
      const canDraftOffline = workspaceRef.canEditOffline === true;
      const canEdit = canEditRemotely || canDraftOffline;
      const canDelete = online && workspaceRef.canDelete === true && !hasPendingWorkspaceDraft;
      const canEditCards = canEdit && Boolean(workspaceCourseHook("saveMicrosequenceCards"));
      return Object.freeze({
        source: "workspace",
        workspaceRef,
        canEditMetadata: canEdit && Boolean(workspaceCourseHook("saveMetadata")),
        canEditCards,
        canUseCardAi: canEdit && (online || localAiAvailable) &&
          Boolean(workspaceCourseHook("saveMicrosequenceCards")),
        canUseBottomUpAi: false,
        canMove: canEditRemotely && !hasPendingWorkspaceDraft &&
          Boolean(workspaceCourseHook("moveEntity")),
        canDeleteEntity: canDelete && Boolean(workspaceCourseHook("deleteEntity")),
        canDeleteCourse: canDelete && Boolean(workspaceCourseHook("deleteCourse")),
        canComment: online && workspaceRef.canComment === true
      });
    }

    const permissions = resolveCourseUiPermissions(storage, courseKey);
    const canAuthorLocally = permissions.canAuthorContent === true &&
      ["private", "catalog"].includes(permissions.writeTarget);
    const hasPendingLocalDraft = ["pending", "conflict"].includes(
      workspaceAuthoringState(courseKey).status
    );
    return Object.freeze({
      source: "local",
      workspaceRef: null,
      canEditMetadata: canAuthorLocally,
      canEditCards: canAuthorLocally,
      canUseCardAi: canAuthorLocally && (online || localAiAvailable),
      canUseBottomUpAi: canAuthorLocally && online,
      canMove: canAuthorLocally && online && !hasPendingLocalDraft &&
        contextualAuthoringIsAvailable(),
      canDeleteEntity: permissions.canDelete === true && online && !hasPendingLocalDraft &&
        contextualAuthoringIsAvailable(),
      canDeleteCourse: permissions.canDeleteCourse === true && online && !hasPendingLocalDraft,
      canComment: permissions.canComment === true
    });
  }

  function courseEditorPermissions(courseKey = state.selection?.courseKey) {
    const capabilities = resolveCourseAuthoringCapabilities(courseKey);
    const localPermissions = resolveCourseUiPermissions(storage, courseKey);
    const canAuthorContent = capabilities.canEditMetadata ||
      capabilities.canEditCards ||
      capabilities.canUseBottomUpAi;
    return {
      ...(capabilities.source === "workspace"
        ? {
            role: canAuthorContent ? "author" : "learner",
            writeTarget: null,
            canOrganizeSelection: true,
            canRemoveSelection: false
          }
        : localPermissions),
      canAuthorContent,
      canEdit: capabilities.canEditMetadata,
      canDelete: capabilities.canDeleteCourse,
      canDeleteCourse: capabilities.canDeleteCourse,
      canComment: capabilities.canComment,
      canEditMetadata: capabilities.canEditMetadata,
      canEditCards: capabilities.canEditCards,
      canUseCardAi: capabilities.canUseCardAi,
      canUseBottomUpAi: capabilities.canUseBottomUpAi,
      canMove: capabilities.canMove,
      canDeleteEntity: capabilities.canDeleteEntity
    };
  }

  function assertCourseCapability(
    capability,
    courseKey = state.selection?.courseKey,
    message = "Este curso não pode ser alterado nesta conta."
  ) {
    const capabilities = resolveCourseAuthoringCapabilities(courseKey);
    if (capabilities[capability] !== true) {
      const error = new Error(message);
      error.code = "course_authoring_forbidden";
      throw error;
    }
    return capabilities;
  }

  function activeTrailPersonalStorage(courseKey = state.selection?.courseKey) {
    if (!homeTrailsController) return storage;
    const reference = trailCourseRef(courseKey);
    if (!reference) return null;
    return state.trailPersonalStorageByItemId.get(reference.trailItemId) || null;
  }

  function scheduleTrailPersonalStorageRefresh(trailItemId, personalStorage) {
    if (
      globalThis.navigator?.onLine === false
      || typeof personalStorage?.refresh !== "function"
      || state.trailPersonalStorageRefreshScheduled.has(personalStorage)
    ) {
      return;
    }
    state.trailPersonalStorageRefreshScheduled.add(personalStorage);
    globalThis.setTimeout(() => {
      void Promise.resolve(personalStorage.refresh())
        .then(() => {
          if (state.trailPersonalStorageByItemId.get(trailItemId) === personalStorage) {
            render({ preserveState: true });
          }
        })
        .catch((error) => {
          if (isHomeTrailsAuthorityError(error)) {
            state.trailPersonalStorageByItemId.delete(trailItemId);
            state.trailPersonalStorageLoadingByItemId.delete(trailItemId);
            void refreshHomeTrails();
            return;
          }
          console.warn("A atualização do progresso foi adiada.", error);
        })
        .finally(() => {
          state.trailPersonalStorageRefreshScheduled.delete(personalStorage);
        });
    }, 0);
  }

  async function ensureTrailPersonalStorage(item, course) {
    if (!item || !course || !homeTrailsController) return storage;
    const reference = homeTrailsController.bindCourseKey(item.itemId, course.id);
    if (!reference) throw new Error("O item de Trilhas não corresponde ao curso carregado.");
    const existing = state.trailPersonalStorageByItemId.get(reference.trailItemId);
    if (existing) {
      existing.setCourse?.(course);
      scheduleTrailPersonalStorageRefresh(reference.trailItemId, existing);
      return existing;
    }
    const loading = state.trailPersonalStorageLoadingByItemId.get(reference.trailItemId);
    if (loading) return loading;
    const pending = Promise.resolve(trailPersonalStateFactory({
      trailItemId: reference.trailItemId,
      course,
      item,
      courseRef: reference
    })).then(async (personalStorage) => {
      if (!personalStorage || typeof personalStorage.initialize !== "function") {
        throw new Error("O estado pessoal de Trilhas não pôde ser inicializado.");
      }
      personalStorage.setCourse?.(course);
      await personalStorage.initialize({ refresh: false });
      state.trailPersonalStorageByItemId.set(reference.trailItemId, personalStorage);
      scheduleTrailPersonalStorageRefresh(reference.trailItemId, personalStorage);
      return personalStorage;
    }).finally(() => {
      state.trailPersonalStorageLoadingByItemId.delete(reference.trailItemId);
    });
    state.trailPersonalStorageLoadingByItemId.set(reference.trailItemId, pending);
    return pending;
  }

  function activeProgress(courseKey = state.selection?.courseKey) {
    const personalStorage = activeTrailPersonalStorage(courseKey);
    return personalStorage?.loadProgress?.() || createEmptyProgressDocument();
  }

  function saveActiveProgress(nextProgress, courseKey = state.selection?.courseKey) {
    const personalStorage = activeTrailPersonalStorage(courseKey);
    if (!personalStorage?.saveProgress) return Promise.resolve(true);
    return Promise.resolve(personalStorage.saveProgress(nextProgress))
      .then(() => true)
      .catch((error) => {
        console.warn("Não foi possível salvar o progresso em Trilhas.", error);
        return false;
      });
  }

  function saveActiveProgressLocally(nextProgress, courseKey = state.selection?.courseKey) {
    const personalStorage = activeTrailPersonalStorage(courseKey);
    if (!personalStorage?.saveProgress) return Promise.resolve(true);
    const save = typeof personalStorage.saveProgressLocally === "function"
      ? personalStorage.saveProgressLocally(nextProgress)
      : personalStorage.saveProgress(nextProgress);
    return Promise.resolve(save)
      .then(() => {
        if (
          typeof personalStorage.saveProgressLocally === "function"
          && globalThis.navigator?.onLine !== false
        ) {
          globalThis.setTimeout(() => {
            void Promise.resolve(personalStorage.flush?.()).catch((error) => {
              console.warn("A sincronização do progresso foi adiada.", error);
            });
          }, 0);
        }
        return true;
      })
      .catch((error) => {
        console.warn("Não foi possível salvar o progresso em Trilhas.", error);
        return false;
      });
  }

  function scheduleProgressReset(key, reset, attempt = 1) {
    const timers = state.assistDraft.progressResetTimers;
    const previous = timers.get(key);
    if (previous) globalThis.clearTimeout(previous);
    const timer = globalThis.setTimeout(async () => {
      timers.delete(key);
      const saved = await reset();
      if (!saved && attempt < 5) scheduleProgressReset(key, reset, attempt + 1);
    }, Math.min(30_000, 2_000 * (2 ** (attempt - 1))));
    timers.set(key, timer);
  }

  async function persistProgressReset(key, reset) {
    if (await reset()) return true;
    scheduleProgressReset(key, reset);
    const error = new Error(
      "O texto foi salvo, mas a atualização do progresso ficou pendente e será repetida automaticamente."
    );
    error.code = "progress_reset_pending";
    throw error;
  }

  function invalidateResponseExerciseState() {
    state.responseExerciseByBlockKey = {};
    state.continuePopup = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
  }

  function homeReviewItems() {
    if (!homeTrailsController) return storage.loadReviewItems?.() || [];
    return [...state.trailPersonalStorageByItemId.entries()].flatMap(([trailItemId, personalStorage]) =>
      (personalStorage.loadReviewItems?.() || []).map((item) => ({ ...item, trailItemId }))
    );
  }

  function setProject(nextProject) {
    state.project = nextProject;
    if (homeTrailsController) {
      state.trailPersonalStorageByItemId.forEach((personalStorage, trailItemId) => {
        const reference = homeTrailsController.courseRefs.get(trailItemId);
        const course = (nextProject.courses || []).find((candidate) =>
          candidate.id === reference?.courseKey || candidate.id === reference?.courseId
        );
        if (course) personalStorage.setCourse?.(course);
      });
    }
  }

  function composeLoadedWorkspaceCourses(projectDocument) {
    if (!homeTrailsController) return projectDocument;
    const itemId = state.homeSelectedTrailItemId || homeTrailsController.selectedItemId;
    const item = homeTrailsController.item(itemId);
    const course = homeTrailsController.loadedCourses.get(itemId);
    if (!item || !course) return projectDocument;
    return mergeWorkspaceCourse(projectDocument, course, [item.courseKey, item.courseId]);
  }

  async function clearTrailPersonalStorage(itemIds = null) {
    const selectedIds = itemIds ? new Set(itemIds) : null;
    const entries = [...state.trailPersonalStorageByItemId.entries()]
      .filter(([itemId]) => !selectedIds || selectedIds.has(itemId));
    await Promise.all(entries.map(async ([itemId, personalStorage]) => {
      await Promise.resolve(personalStorage.clearLocal?.()).catch(() => undefined);
      state.trailPersonalStorageByItemId.delete(itemId);
      state.trailPersonalStorageLoadingByItemId.delete(itemId);
    }));
  }

  async function refreshHomeTrails({ preserveSelection = true } = {}) {
    if (!homeTrailsController || state.homeTrailLoading) return state.homeTrailSnapshot;
    const activeItemId = state.homeSelectedTrailItemId || homeTrailsController.selectedItemId;
    const activeWorkspaceCourse = homeTrailsController.loadedCourses.get(activeItemId) || null;
    const shouldKeepActiveWorkspaceCourse = state.view !== "courses" && Boolean(activeWorkspaceCourse);
    state.homeTrailLoading = true;
    render({ preserveState: true });
    try {
      const snapshot = await homeTrailsController.refresh({
        selectedItemId: preserveSelection ? state.homeSelectedTrailItemId : ""
      });
      for (const removedItemId of homeTrailsController.removedItemIds) {
        const personalStorage = state.trailPersonalStorageByItemId.get(removedItemId);
        await personalStorage?.clearLocal?.();
        state.trailPersonalStorageByItemId.delete(removedItemId);
        state.trailPersonalStorageLoadingByItemId.delete(removedItemId);
      }
      state.homeTrailSnapshot = snapshot;
      state.homeSelectedTrailItemId = homeTrailsController.selectedItemId;
      state.homeOrganization.error = "";
      for (const item of snapshot.items) {
        if (item.workspaceId || !item.courseId) continue;
        const localCourseKey = storage.resolveCourseContractKey?.(item.courseId) || "";
        if (localCourseKey) homeTrailsController.bindCourseKey(item.itemId, localCourseKey);
      }
      const selectedItem = homeTrailsController.item(state.homeSelectedTrailItemId);
      const groups = groupTrailItems(snapshot, { includePlans: true });
      if (!groups.some((group) => group.id === state.homeOrganization.selectedGroupId)) {
        state.homeOrganization.selectedGroupId = groups.find((group) =>
          group.items.some((item) => item.itemId === state.homeSelectedTrailItemId)
        )?.id || groups[0]?.id || "";
      }
      state.homeSelectedCourseKey = homeTrailsController.courseRefs
        .get(state.homeSelectedTrailItemId)?.courseKey ||
        selectedItem?.courseKey || selectedItem?.courseId || "";
      if (
        shouldKeepActiveWorkspaceCourse &&
        selectedItem?.itemId === activeItemId &&
        selectedItem.workspaceId &&
        !homeTrailsController.loadedCourses.has(activeItemId)
      ) {
        try {
          await homeTrailsController.loadCourse(activeItemId);
        } catch (error) {
          if (isHomeTrailsAuthorityError(error)) throw error;
          homeTrailsController.loadedCourses.set(activeItemId, activeWorkspaceCourse);
          homeTrailsController.bindCourseKey(activeItemId, activeWorkspaceCourse.id);
          state.homeOrganization.error = error instanceof Error
            ? `O curso continua aberto com a última cópia disponível. ${error.message}`
            : "O curso continua aberto com a última cópia disponível.";
        }
      }
      setProject(composeLoadedWorkspaceCourses(storage.loadProject()));
      return snapshot;
    } catch (error) {
      if (isHomeTrailsAuthorityError(error)) {
        await clearTrailPersonalStorage();
        state.homeTrailSnapshot = null;
        state.homeSelectedTrailItemId = "";
        state.homeSelectedCourseKey = "";
        state.homeOrganization.selectedGroupId = "";
        setProject(storage.loadProject());
        selectFirstPath(state.project);
        state.view = "courses";
      }
      state.homeOrganization.error = error instanceof Error
        ? error.message
        : "Não foi possível atualizar Trilhas.";
      return null;
    } finally {
      state.homeTrailLoading = false;
      render({ preserveState: true });
    }
  }

  async function ensureHomeTrailCourse(itemId) {
    if (!homeTrailsController) return null;
    const item = homeTrailsController.item(itemId);
    if (!item) return null;
    const baseProject = storage.loadProject();
    const reference = homeTrailsController.courseRefs.get(item.itemId);
    let course = (baseProject.courses || []).find((candidate) =>
      candidate.id === reference?.courseKey ||
      candidate.id === item.courseKey ||
      candidate.id === item.courseId
    ) || null;
    if (item.workspaceId) {
      course = await homeTrailsController.loadCourse(item.itemId);
      if (course) setProject(mergeWorkspaceCourse(
        baseProject,
        course,
        [item.courseKey, item.courseId]
      ));
    }
    if (course) {
      const reference = homeTrailsController.bindCourseKey(item.itemId, course.id);
      if (reference?.authoringStatus) {
        state.assistDraft.syncError = reference.authoringErrorMessage || (
          reference.authoringStatus === "conflict"
            ? "Há uma edição salva neste dispositivo que precisa resolver um conflito."
            : "Há uma edição salva neste dispositivo aguardando sincronização."
        );
      }
    }
    return course;
  }

  async function prepareHomeTrailItem(itemId) {
    const item = homeTrailsController?.item(itemId);
    if (!item || (!isStudyableTrailItem(item) && !(item.kind === "plan" && item.workspaceId))) {
      return null;
    }
    const course = await ensureHomeTrailCourse(item.itemId);
    if (!course) throw new Error("O curso ainda não está disponível neste dispositivo.");
    await ensureTrailPersonalStorage(item, course);
    return course;
  }

  async function refreshWorkspaceCourseDocument(courseRef) {
    const course = await homeTrailsController.reloadCourse(
      courseRef.trailItemId,
      workspaceCourseHook("load")
        ? (item, reference) => workspaceCourseHook("load")({ item, courseRef: reference })
        : null
    );
    const nextProject = mergeWorkspaceCourse(
      storage.loadProject(),
      course,
      [courseRef.courseKey, courseRef.courseId]
    );
    setProject(nextProject);
    return nextProject;
  }

  async function resolveWorkspaceAuthoringConflict(resolution) {
    if (state.entityMutationSaving) return false;
    const courseRef = workspaceCourseRef();
    const resolveConflict = workspaceCourseHook("resolveAuthoringConflict");
    const localCourseKey = state.selection?.courseKey || "";
    const authoringState = workspaceAuthoringState(localCourseKey);
    if (!courseRef) {
      if (authoringState.status !== "conflict" ||
          !["keep_local", "discard_local"].includes(resolution)) return false;
      if (globalThis.navigator?.onLine === false) {
        state.entityMutationError = "Reconecte para resolver a edição preservada neste dispositivo.";
        render({ preserveState: true });
        return false;
      }
      if (resolution === "discard_local" &&
          (!authoringState.canDiscardLocal ||
           (typeof globalThis.confirm === "function" &&
            !globalThis.confirm("Descartar as alterações salvas somente neste dispositivo?")))) {
        return false;
      }
      state.entityMutationSaving = true;
      state.entityMutationError = "";
      state.assistDraft.syncError = "";
      render({ preserveState: true });
      try {
        if (resolution === "discard_local") {
          const previousSelection = { ...state.selection };
          const discarded = await storage.discardContextualAuthoringDraft(localCourseKey);
          await contextualAuthoring.synchronizeReplica({
            expectedCourseIds: [discarded.courseId]
          });
          const nextProject = composeLoadedWorkspaceCourses(storage.loadProject());
          setProject(nextProject);
          if (!applySelectionByKeys(nextProject, previousSelection)) selectFirstPath(nextProject);
          await loadCardAssistanceLocalState(state.selection.courseKey);
          return true;
        }
        const result = await synchronizeContextualAuthoringCourse(localCourseKey, {
          conflictPolicy: "local"
        });
        if (result?.pending === true) {
          state.entityMutationError = result.errorMessage ||
            "O conflito ainda não pôde ser resolvido. A alteração local foi preservada.";
          state.assistDraft.syncError = state.entityMutationError;
          return false;
        }
        return true;
      } catch (error) {
        state.entityMutationError = error instanceof Error
          ? error.message
          : "Não foi possível resolver o conflito de edição.";
        state.assistDraft.syncError = state.entityMutationError;
        return false;
      } finally {
        state.entityMutationSaving = false;
        render({ preserveState: true });
      }
    }
    if (courseRef.authoringStatus !== "conflict" || !resolveConflict) return false;
    if (resolution === "keep_local" && globalThis.navigator?.onLine === false) {
      state.entityMutationError = "Reconecte para comparar e manter a sua redação.";
      render({ preserveState: true });
      return false;
    }
    if (resolution === "discard_local" && typeof globalThis.confirm === "function" &&
        !globalThis.confirm("Descartar as alterações salvas somente neste dispositivo?")) {
      return false;
    }
    if (!["keep_local", "discard_local"].includes(resolution)) return false;

    state.entityMutationSaving = true;
    state.entityMutationError = "";
    state.assistDraft.syncError = "";
    render({ preserveState: true });
    try {
      const result = await resolveConflict({ courseRef, resolution });
      const reference = updateWorkspaceAuthoringReference(courseRef, result) || courseRef;
      if (result?.course) {
        const nextProject = mergeWorkspaceCourse(
          state.project,
          result.course,
          [courseRef.courseKey, courseRef.courseId]
        );
        setProject(nextProject);
        homeTrailsController.loadedCourses.set(
          courseRef.trailItemId,
          structuredClone(result.course)
        );
        applySelectionByKeys(nextProject, state.selection);
      } else if (result?.pending !== true) {
        await refreshWorkspaceCourseDocument(reference);
        applySelectionByKeys(state.project, state.selection);
      }
      if (result?.pending === true) {
        const message = result.errorMessage ||
          "O conflito ainda não pôde ser resolvido. Nenhuma alteração local foi perdida.";
        state.entityMutationError = message;
        state.assistDraft.syncError = message;
      }
      await refreshHomeTrails();
      return result?.pending !== true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Não foi possível resolver o conflito de edição.";
      state.entityMutationError = message;
      state.assistDraft.syncError = message;
      return false;
    } finally {
      state.entityMutationSaving = false;
      render({ preserveState: true });
    }
  }

  async function openHomeTrailCourse(itemId, { mode = "view" } = {}) {
    if (!homeTrailsController) return false;
    const item = homeTrailsController.item(itemId);
    if (!item) return false;
    state.homeSelectedTrailItemId = item.itemId;
    homeTrailsController.select(item.itemId);
    state.homeTrailLoading = true;
    render({ preserveState: true });
    try {
      const course = await prepareHomeTrailItem(item.itemId);
      state.homeSelectedCourseKey = course.id;
      return openCourse(course.id, { mode }) === true;
    } catch (error) {
      state.homeOrganization.error = error instanceof Error
        ? error.message
        : "Não foi possível abrir o curso.";
      return false;
    } finally {
      state.homeTrailLoading = false;
      if (state.view === "courses") render({ preserveState: true });
    }
  }

  async function openHomeCourseEditor(itemId) {
    if (!homeTrailsController || state.entityMutationSaving) return false;
    const item = homeTrailsController.item(itemId);
    if (!item || (item.canEdit !== true && item.canEditOffline !== true)) return false;
    state.homeSelectedTrailItemId = item.itemId;
    homeTrailsController.select(item.itemId);
    state.homeTrailLoading = true;
    state.homeOrganization.error = "";
    render({ preserveState: true });
    try {
      const course = await prepareHomeTrailItem(item.itemId);
      state.homeSelectedCourseKey = course.id;
      assertCourseCapability("canEditMetadata", course.id);
      state.inlineStructureEditor = { level: "course", courseKey: course.id };
      state.entityMutationError = "";
      queueAuthoringFocus("inline-structure-title");
      return true;
    } catch (error) {
      state.homeOrganization.error = error instanceof Error
        ? error.message
        : "Não foi possível editar o curso.";
      return false;
    } finally {
      state.homeTrailLoading = false;
      render({ preserveState: true });
    }
  }

  async function mutateHomeTrails(operation, argumentsValue = {}) {
    if (!homeTrailsController || state.homeOrganization.busy) return null;
    state.homeOrganization.busy = true;
    state.homeOrganization.error = "";
    render({ preserveState: true });
    try {
      const snapshot = await homeTrailsController.mutate(operation, argumentsValue);
      state.homeTrailSnapshot = snapshot;
      state.homeSelectedTrailItemId = homeTrailsController.selectedItemId;
      return snapshot;
    } catch (error) {
      state.homeOrganization.error = error instanceof Error
        ? error.message
        : "Não foi possível organizar Trilhas.";
      return null;
    } finally {
      state.homeOrganization.busy = false;
      render({ preserveState: true });
    }
  }

  function selectHomeTrailItem(trailItemId, { closeInlineEditor = true } = {}) {
    if (!trailItemId || !homeTrailsController?.select(trailItemId)) return false;
    state.homeSelectedTrailItemId = trailItemId;
    const item = homeTrailsController.item(trailItemId);
    state.homeSelectedCourseKey = homeTrailsController.courseRefs.get(trailItemId)?.courseKey ||
      item?.courseKey || item?.courseId || "";
    if (closeInlineEditor) {
      state.inlineStructureEditor = null;
      state.entityMutationError = "";
    }
    setProject(composeLoadedWorkspaceCourses(storage.loadProject()));
    if (state.homeSelectedCourseKey) {
      void loadCardAssistanceLocalState(state.homeSelectedCourseKey);
    }
    return true;
  }

  function groupWithTrailItem(trailItemId) {
    return groupTrailItems(state.homeTrailSnapshot, { includePlans: true })
      .find((group) => group.items.some((item) => item.itemId === trailItemId)) || null;
  }

  function isCoursesView(view) {
    return COURSES_VIEWS.has(view);
  }

  function rememberCoursesView(view = state.view) {
    if (!isCoursesView(view)) {
      return;
    }
    state.lastCoursesView = view;
  }

  function readStructurePayload(node, fallbackLevel = "") {
    if (!node) {
      return null;
    }

    const level = node.getAttribute("data-structure-level") || node.getAttribute("data-structure-target") || fallbackLevel;
    if (!level) {
      return null;
    }

    return {
      level,
      courseKey: node.getAttribute("data-course-key") || "",
      moduleKey: node.getAttribute("data-module-key") || "",
      lessonKey: node.getAttribute("data-lesson-key") || "",
      microsequenceKey: node.getAttribute("data-microsequence-key") || "",
      cardKey: node.getAttribute("data-card-key") || ""
    };
  }

  function isSameStructurePayload(left, right) {
    return !!left &&
      !!right &&
      left.level === right.level &&
      left.courseKey === right.courseKey &&
      left.moduleKey === right.moduleKey &&
      left.lessonKey === right.lessonKey &&
      left.microsequenceKey === right.microsequenceKey &&
      left.cardKey === right.cardKey;
  }

  function canDropStructure(drag, target) {
    if (!drag || !target || drag.level !== target.level || isSameStructurePayload(drag, target)) {
      return false;
    }

    if (drag.level === "course") {
      return !!drag.courseKey && !!target.courseKey;
    }
    if (drag.level === "module") {
      return drag.courseKey === target.courseKey && !!drag.moduleKey && !!target.moduleKey;
    }
    if (drag.level === "lesson") {
      return drag.courseKey === target.courseKey && drag.moduleKey === target.moduleKey && !!drag.lessonKey && !!target.lessonKey;
    }
    if (drag.level === "microsequence") {
      return (
        drag.courseKey === target.courseKey &&
        drag.moduleKey === target.moduleKey &&
        drag.lessonKey === target.lessonKey &&
        !!drag.microsequenceKey &&
        !!target.microsequenceKey
      );
    }
    if (drag.level === "card") {
      return (
        drag.courseKey === target.courseKey &&
        drag.moduleKey === target.moduleKey &&
        drag.lessonKey === target.lessonKey &&
        drag.microsequenceKey === target.microsequenceKey &&
        !!drag.cardKey &&
        !!target.cardKey
      );
    }
    return false;
  }

  function resolveStructureDropIndex(items, draggedKey, targetKey, position) {
    const itemKey = (item) => String(item?.key || item?.id || "");
    const fromIndex = (items || []).findIndex((item) => itemKey(item) === draggedKey);
    const targetIndex = (items || []).findIndex((item) => itemKey(item) === targetKey);
    if (fromIndex < 0 || targetIndex < 0) {
      return null;
    }

    let nextIndex = position === "after" ? targetIndex + 1 : targetIndex;
    if (fromIndex < nextIndex) {
      nextIndex -= 1;
    }

    return nextIndex;
  }

  function getStructureCollectionItems(node, level) {
    return Array.from(node?.children || []).filter((child) => child.getAttribute?.("data-structure-target") === level);
  }

  function applySelection(path) {
    if (!path) return;
    state.selection = {
      courseKey: path.courseKey,
      moduleKey: path.moduleKey,
      lessonKey: path.lessonKey,
      microsequenceKey: path.microsequenceKey,
      cardKey: path.cardKey,
      cardIndex: path.cardIndex
    };
  }

  function buildNodeSelection({ courseKey = null, moduleKey = null, lessonKey = null, microsequenceKey = null } = {}) {
    return {
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      cardKey: null,
      cardIndex: 0
    };
  }

  function applySelectionByKeys(nextProject, desiredSelection = state.selection) {
    const nextPath = resolveSelectionByKeysRuntime(nextProject, desiredSelection);
    applySelection(nextPath);
    return nextPath;
  }

  function selectFirstPath(nextProject) {
    const nextPath = resolveFirstSelection(nextProject);
    applySelection(nextPath);
    return nextPath;
  }

  function openCourse(courseKey, { mode = "view" } = {}) {
    const navigationState = buildCourseNavigationState(state.project, courseKey);
    if (!navigationState) return false;
    state.homeSelectedCourseKey = courseKey;
    Object.assign(state, buildNavigationViewState(navigationState));
    state.entityModes.course = "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";

    if (mode === "edit") return setEntityMode("course", "edit", { preserveState: false });
    render({ preserveState: false });
    return true;
  }

  function openModule(moduleKey, { mode = "view" } = {}) {
    const navigationState = buildModuleNavigationState(state.project, {
      courseKey: state.selection.courseKey,
      moduleKey
    });
    if (!navigationState) return false;
    Object.assign(state, buildNavigationViewState(navigationState));
    state.entityModes.module = "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";

    if (mode === "edit") return setEntityMode("module", "edit", { preserveState: false });
    render({ preserveState: false });
    return true;
  }

  function openLesson(moduleKey, lessonKey, { mode = "view" } = {}) {
    const navigationState = buildLessonNavigationState(state.project, activeProgress(state.selection.courseKey), {
      courseKey: state.selection.courseKey,
      moduleKey,
      lessonKey
    });
    if (!navigationState) return false;
    Object.assign(state, buildNavigationViewState(navigationState));
    state.entityModes.lesson = "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";
    state.bottomUpDraft.composerOpen = false;
    state.bottomUpDraft.promptText = "";
    state.bottomUpDraft.errorMessage = "";

    if (mode === "edit") return setEntityMode("lesson", "edit", { preserveState: false });
    render({ preserveState: false });
    return true;
  }

  function getLessonProgressReference(courseKey, moduleKey, lessonKey) {
    if (!courseKey || !moduleKey || !lessonKey) {
      return null;
    }

    return { courseKey, moduleKey, lessonKey };
  }

  function currentCardIsMarkedForReview() {
    const personalStorage = activeTrailPersonalStorage();
    return Boolean(personalStorage?.isCardMarkedForReview?.(state.selection));
  }

  async function toggleCurrentCardReviewMark() {
    if (!state.selection.cardKey) return;
    try {
      const personalStorage = activeTrailPersonalStorage();
      if (!personalStorage?.setCardReviewMark) return;
      await personalStorage.setCardReviewMark(
        state.selection,
        !currentCardIsMarkedForReview()
      );
      render({ preserveState: true });
    } catch (error) {
      console.warn("Não foi possível atualizar a marca de revisão.", error);
    }
  }

  function persistLessonProgress(reference, lessonCards, reachedIndex) {
    if (!reference || !Array.isArray(lessonCards) || !lessonCards.length) {
      return;
    }

    const currentProgress = activeProgress(reference.courseKey);
    const nextProgress = writeLessonProgressEntry(
      currentProgress,
      reference,
      lessonCards.map((entry) => entry.card),
      reachedIndex
    );
    void saveActiveProgressLocally(nextProgress, reference.courseKey);
  }

  function collectProgressReferencesInModule(courseKey, moduleValue) {
    return (moduleValue?.lessons || []).map((lesson) => ({
      courseKey,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id
    }));
  }

  function removeProgressEntries(lessonReferences) {
    const courseKey = lessonReferences[0]?.courseKey || state.selection?.courseKey;
    const personalStorage = activeTrailPersonalStorage(courseKey);
    if (typeof personalStorage?.removeProgressEntries === "function") {
      return Promise.resolve(personalStorage.removeProgressEntries(lessonReferences))
        .then(() => true)
        .catch((error) => {
          console.warn("Não foi possível zerar o progresso em Trilhas.", error);
          return false;
        });
    }
    const currentProgress = activeProgress(courseKey);
    const nextProgress = removeLessonProgressEntries(currentProgress, lessonReferences);
    return saveActiveProgress(nextProgress, courseKey);
  }

  function getCodexSetupEndpoint() {
    return isLocalProviderSelection({
      selectedModel: state.assistConfig.model,
      providerProtocol: state.assistConfig.providerProtocol
    }) && isCustomProviderSelection(state.assistConfig.model)
      ? state.assistConfig.providerEndpoint || DEFAULT_CODEX_LOCAL_ENDPOINT
      : state.assistConfig.codexEndpoint || DEFAULT_CODEX_LOCAL_ENDPOINT;
  }

  function getCodexSetupPlatform() {
    return detectCodexCliSetupPlatform();
  }

  function getCodexSetupScript() {
    try {
      return buildCodexCliSetupScript({
        platform: getCodexSetupPlatform(),
        endpoint: getCodexSetupEndpoint(),
        token: isCustomProviderSelection(state.assistConfig.model)
          ? state.assistConfig.providerSecret
          : state.assistConfig.codexToken
      });
    } catch (error) {
      return `# Endpoint inválido\n# ${error instanceof Error ? error.message : "Revise o endpoint configurado."}`;
    }
  }

  function getCodexSetupHealthCommand() {
    try {
      return buildCodexCliHealthCommand({
        platform: getCodexSetupPlatform(),
        endpoint: getCodexSetupEndpoint(),
        token: isCustomProviderSelection(state.assistConfig.model)
          ? state.assistConfig.providerSecret
          : state.assistConfig.codexToken
      });
    } catch (error) {
      return `# ${error instanceof Error ? error.message : "Revise o endpoint configurado."}`;
    }
  }

  function updateCodexCliSetupStatus(nextStatus = {}) {
    state.codexCliSetupStatus = createCodexCliSetupStatus(nextStatus);
  }

  async function testCodexCliConnection({ preserveState = true } = {}) {
    updateCodexCliSetupStatus({
      checking: true
    });
    render({ preserveState });

    const connection = await checkCodexCliConnection({
      assistConfig: state.assistConfig,
      checkCodexLocalHealth
    });
    updateCodexCliSetupStatus(connection.setupStatus);
    render({ preserveState });
    return connection.status;
  }

  async function handleCodexModelSelection(model) {
    if (!isLocalProviderSelection({
      selectedModel: model,
      providerProtocol: state.assistConfig.providerProtocol
    })) {
      updateCodexCliSetupStatus({});
      render({ preserveState: true });
      return;
    }

    await testCodexCliConnection();
  }

  async function copyTextToClipboard(text) {
    const safeText = String(text || "");
    if (!safeText) {
      return false;
    }

    if (globalThis.navigator?.clipboard?.writeText) {
      try {
        await globalThis.navigator.clipboard.writeText(safeText);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function openProviderConfig() {
    state.providerConfigOpen = true;
    render({ preserveState: true });
  }

  function closeProviderConfig() {
    state.providerConfigOpen = false;
    render({ preserveState: true });
  }

  function setAssistModel(model) {
    const previousModel = state.assistConfig.model;
    const leavingCustomProvider = isCustomProviderSelection(previousModel) && !isCustomProviderSelection(model);
    const changedApiKeyFamily = assistApiKeyFamily(previousModel) !== assistApiKeyFamily(model);
    const shouldDefaultDeepSeekBaseUrl =
      isDeepSeekModelId(model)
      && !String(state.assistConfig.baseUrl || "").trim();
    state.assistConfig = normalizeAssistConfig({
      ...state.assistConfig,
      model,
      ...(shouldDefaultDeepSeekBaseUrl
        ? { baseUrl: DEEPSEEK_BASE_URL }
        : {}),
      ...(changedApiKeyFamily ? { apiKey: "" } : {}),
      ...(leavingCustomProvider ? { providerSecret: "" } : {})
    });
    if (isCustomProviderSelection(model)) {
      state.providerConfigOpen = true;
    }
    void handleCodexModelSelection(state.assistConfig.model);
  }

  function persistAssistConfigValue(patch = {}) {
    const nextAssistConfigState = applyAssistConfigPatch({
      assistConfig: state.assistConfig,
      patch
    });
    state.assistConfig = nextAssistConfigState.assistConfig;
  }

  function syncAssistDraft() {
    const context = getRenderContext();
    const previousReferenceKey = text(state.assistDraft.assistance?.referenceKey);
    const nextAssistance = reconcileCardAssistanceUiState(
      state.assistDraft.assistance,
      {
        selection: state.selection,
        card: context.card,
        cards: context.cards
      }
    );
    state.assistDraft.assistance = nextAssistance;
    if (
      previousReferenceKey
      && previousReferenceKey !== text(nextAssistance.referenceKey)
    ) {
      state.assistDraft.composerOpen = false;
      state.assistDraft.promptText = "";
      state.assistDraft.errorMessage = "";
    }
    if (state.assistDraft.manualDraft && [
      "courseKey",
      "moduleKey",
      "lessonKey",
      "microsequenceKey",
      "cardKey"
    ].some((fieldName) =>
      text(state.assistDraft.manualDraft[fieldName]) !== text(state.selection[fieldName])
    )) {
      state.assistDraft.manualDraft = null;
    }
  }

  function assertCourseAuthoringAllowed(courseKey = state.selection?.courseKey) {
    const permissions = resolveCourseUiPermissions(storage, courseKey);
    if (
      permissions.canAuthorContent !== true ||
      !["private", "catalog"].includes(permissions.writeTarget)
    ) {
      const error = new Error("Este curso não pode ser alterado nesta conta.");
      error.code = "course_authoring_forbidden";
      throw error;
    }
    return permissions;
  }

  function selectMicrosequenceCard(microsequenceKey, targetIndex = 0) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence) return;

    const cards = Array.isArray(microsequence.cards) ? microsequence.cards : [];
    const safeIndex = Math.max(0, Math.min(targetIndex, Math.max(0, cards.length - 1)));
    const card = cards[safeIndex] || null;

    state.selection.microsequenceKey = microsequence.id;
    state.selection.cardIndex = safeIndex;
    state.selection.cardKey = card ? card.id : null;
    return microsequence;
  }

  function openMicrosequenceScreen(microsequenceKey, targetIndex = 0, mode = "play") {
    const microsequence = selectMicrosequenceCard(microsequenceKey, targetIndex);
    if (!microsequence) return false;
    if (mode === "play" && !resolveMicrosequenceRuntimeIncluded(microsequence)) {
      openMicrosequenceOverview(microsequenceKey);
      return true;
    }

    state.view = "microsequence";
    state.microsequenceMode = mode === "play" ? "play" : "assist";
    state.entityModes.card = mode === "edit" ? "edit" : mode === "assist" ? "ai" : "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";
    state.assistDraft.composerOpen = false;
    state.assistDraft.manualDraft = null;
    state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.continuePopup = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
    void loadCardAssistanceLocalState(state.selection.courseKey);
    return true;
  }

  function openCardAssistanceMode(microsequenceKey, targetIndex = 0) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence) return false;
    try {
      assertCourseCapability(
        "canUseCardAi",
        state.selection.courseKey,
        "A assistência por IA não está disponível para este curso."
      );
    } catch (error) {
      state.entityModes.card = "view";
      state.microsequenceMode = "play";
      state.entityMutationError = error instanceof Error
        ? error.message
        : "A assistência por IA não está disponível para este curso.";
      render({ preserveState: true });
      return false;
    }
    state.selection.microsequenceKey = microsequence.id;
    selectMicrosequenceCard(microsequenceKey, targetIndex);

    state.view = "microsequence";
    state.entityModes.card = "ai";
    state.assistDraft.composerOpen = false;
    state.assistDraft.promptText = "";
    state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
    state.assistDraft.errorMessage = "";
    state.entityMutationError = "";
    state.microsequenceMode = "assist";
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.continuePopup = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
    void loadCardAssistanceLocalState(state.selection.courseKey);
    return true;
  }

  function getActiveMicrosequenceCards(reference = state.selection) {
    const microsequence = findMicrosequence(
      state.project,
      reference.courseKey,
      reference.moduleKey,
      reference.lessonKey,
      reference.microsequenceKey
    );
    return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
  }

  function openCardByIndex(targetIndex, { completeCurrent = false } = {}) {
    const lesson = findLesson(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey
    );
    if (!lesson) return;

    if (state.view === "microsequence" && state.microsequenceMode === "play") {
      const lessonCards = collectLessonCards(lesson);
      const currentIndex = Math.max(
        0,
        findLessonCardEntryIndex(lessonCards, state.selection)
      );
      const { item: entry } = resolveIndexedTarget(lessonCards, targetIndex, currentIndex);
      if (!entry) return;
      state.selection = {
        ...state.selection,
        microsequenceKey: entry.microsequenceKey,
        cardKey: entry.cardKey,
        cardIndex: entry.cardIndex
      };
      if (completeCurrent) {
        persistLessonProgress(
          getLessonProgressReference(state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey),
          lessonCards,
          currentIndex
        );
      }
    } else {
      const cards = getActiveMicrosequenceCards(state.selection);
      const { index: safeIndex, item: card } = resolveIndexedTarget(cards, targetIndex);
      state.selection = {
        ...state.selection,
        cardIndex: safeIndex,
        cardKey: card ? card.id : null
      };
    }

    state.continuePopup = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    syncAssistDraft();
    render({ preserveState: true });
  }

  function closeContinuePopup({ rerender = true } = {}) {
    if (!state.continuePopup) {
      return;
    }
    state.continuePopup = null;
    state.activeTextGapPrompt = null;
    if (rerender) {
      render({ preserveState: true });
    }
  }

  function queueExerciseFocus(selector, { caretToEnd = false } = {}) {
    if (!selector) {
      state.pendingExerciseFocus = null;
      return;
    }
    state.pendingExerciseFocus = { selector, caretToEnd };
  }

  function openMicrosequenceOverview(microsequenceKey, { mode = "view" } = {}) {
    const microsequence = selectMicrosequenceCard(microsequenceKey, 0);
    if (!microsequence) return false;
    state.view = "microsequence";
    state.microsequenceMode = "overview";
    state.entityModes.microsequence = "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";
    state.cardCommentOpen = false;
    state.continuePopup = null;
    state.bottomUpDraft.level = "microsequence";
    state.bottomUpDraft.composerOpen = false;
    state.bottomUpDraft.promptText = "";
    state.bottomUpDraft.errorMessage = "";
    state.bottomUpDraft.assistance = createBottomUpAssistanceUiState(
      getBottomUpUiContext("microsequence")
    );
    if (mode === "edit") {
      return setEntityMode("microsequence", "edit", { preserveState: false });
    }
    render({ preserveState: false });
    return true;
  }

  function queueAuthoringFocus(key) {
    state.pendingAuthoringFocus = String(key || "");
  }

  function syncPendingAuthoringFocus() {
    const key = state.pendingAuthoringFocus;
    if (!key) return;
    state.pendingAuthoringFocus = "";
    const focus = () => {
      const target = [...root.querySelectorAll("[data-card-authoring-focus]")]
        .find((node) => node.getAttribute("data-card-authoring-focus") === key);
      if (typeof target?.focus !== "function" || target.disabled) return;
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
    else focus();
  }

  function syncPendingExerciseFocus() {
    const target = state.pendingExerciseFocus;
    if (!target?.selector) {
      return;
    }

    const node = root.querySelector(target.selector);
    if (!node || typeof node.focus !== "function") {
      return;
    }

    state.pendingExerciseFocus = null;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      node.focus();
      if (
        target.caretToEnd &&
        "value" in node &&
        typeof node.setSelectionRange === "function"
      ) {
        const size = String(node.value || "").length;
        node.setSelectionRange(size, size);
      }
    });
  }

  function focusFirstIncompleteChoice(blockKey) {
    queueExerciseFocus(
      "[data-action=\"choice-toggle\"][data-choice-block-key=\"" + blockKey + "\"]"
    );
    return true;
  }

  function focusFirstIncompleteTextGap(blockKey) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return false;
    }

    const exercise = state.responseExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const values = Array.isArray(exercise.values) ? exercise.values : [];
    const blanks = Array.isArray(entry.block?.blanks) ? entry.block.blanks : [];
    const blankIndex = blanks.findIndex((_, index) => !String(values[index] ?? "").trim());
    if (blankIndex < 0) {
      return false;
    }

    const blank = blanks[blankIndex];
    if (blank?.responseMode === "choice" && Array.isArray(blank.distractors) && blank.distractors.length) {
      state.activeTextGapPrompt = {
        blockKey,
        blankIndex
      };
      queueExerciseFocus("[data-text-gap-prompt='true'] .token-option");
      return true;
    }

    state.activeTextGapPrompt = null;
    queueExerciseFocus(
      "[data-text-gap-field='true'][data-complete-block-key=\"" +
        blockKey +
        "\"][data-complete-blank-index=\"" +
        blankIndex +
        "\"]"
    );
    return true;
  }

  function advanceToNextCard(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    stepCard(1);
  }

  function isCurrentContinuePopupOpen(popupEntry = getCurrentPackageFeedbackEntry()) {
    return (
      !!popupEntry &&
      !!state.continuePopup &&
      continuePopupMatches(
        state.continuePopup,
        buildCardPathKey(state.selection),
        popupEntry.blockKey
      )
    );
  }

  function continueFromPopup(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();

    // A ação só é válida enquanto o popup e a seleção apontarem para o mesmo card.
    if (!isCurrentContinuePopupOpen()) {
      return;
    }

    stepCard(1);
  }

  function stepCard(delta) {
    // No modo de estudo, o card só pode avançar quando os exercícios do card atual
    // estiverem completos e validados como corretos.
    if (delta > 0) {
      const choices = getCurrentCardChoiceResponse();
      for (const entry of choices) {
        const exercise = state.responseExerciseByBlockKey[entry.blockKey] || { selected: [], feedback: null };
        if (exercise.feedback !== "correct") {
          // Força feedback para impedir avanço silencioso.
          const status = validateChoice(entry.blockKey, { renderCorrect: false });
          if (status !== "correct") {
            return;
          }
        }
      }

      const completes = getCurrentCardGapResponse();
      for (const entry of completes) {
        const exercise = state.responseExerciseByBlockKey[entry.blockKey] || { values: [], feedback: null };
        if (exercise.feedback !== "correct") {
          const status = validateComplete(entry.blockKey, { renderCorrect: false });
          if (status !== "correct") {
            return;
          }
        }
      }

      const orderings = getCurrentCardOrderingResponse();
      for (const entry of orderings) {
        const exercise = state.responseExerciseByBlockKey[entry.blockKey] || { order: [], feedback: null };
        if (exercise.feedback !== "correct") {
          const status = validateOrdering(entry.blockKey, { renderCorrect: false });
          if (status !== "correct") return;
        }
      }

      const matchings = getCurrentCardMatchingResponse();
      for (const entry of matchings) {
        const exercise = state.responseExerciseByBlockKey[entry.blockKey] || { matches: {}, feedback: null };
        if (exercise.feedback !== "correct") {
          const status = validateMatching(entry.blockKey, { renderCorrect: false });
          if (status !== "correct") return;
        }
      }

      const popupEntry = getCurrentPackageFeedbackEntry();
      const popupIsOpen = isCurrentContinuePopupOpen(popupEntry);

      if (popupEntry && !popupIsOpen) {
        state.continuePopup = createContinuePopupState(
          buildCardPathKey(state.selection),
          popupEntry.blockKey
        );
        state.activeTextGapPrompt = null;
        render({ preserveState: true });
        return;
      }

      if (popupIsOpen) {
        closeContinuePopup({ rerender: false });
      }
    }

    const lesson = findLesson(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey
    );
    if (!lesson) return;

    if (state.view === "microsequence" && state.microsequenceMode === "play") {
      const lessonCards = collectLessonCards(lesson);
      const currentIndex = Math.max(
        0,
        findLessonCardEntryIndex(lessonCards, state.selection)
      );
      if (delta > 0 && currentIndex >= lessonCards.length - 1) {
        persistLessonProgress(
          getLessonProgressReference(
            state.selection.courseKey,
            state.selection.moduleKey,
            state.selection.lessonKey
          ),
          lessonCards,
          currentIndex
        );
        goBack();
        return;
      }
      openCardByIndex(currentIndex + delta, { completeCurrent: delta > 0 });
      return;
    }

    openCardByIndex((Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0) + delta);
  }

  function openCardComment() {
    const personalStorage = activeTrailPersonalStorage();
    const comment = personalStorage?.loadCommentForPath?.(state.selection) || null;
    state.cardCommentDraft = {
      category: comment ? String(comment.category || "") : "observation",
      body: typeof comment?.body === "string" ? comment.body : "",
      status: typeof comment?.status === "string" ? comment.status : "open",
      response: typeof comment?.response === "string" ? comment.response : "",
      resolutionNote: typeof comment?.resolutionNote === "string"
        ? comment.resolutionNote
        : ""
    };
    state.cardCommentExists = Boolean(comment);
    state.cardCommentError = "";
    state.cardCommentSaving = false;
    state.cardCommentOpen = true;
    render({ preserveState: true });
  }

  function closeCardComment() {
    state.cardCommentOpen = false;
    render({ preserveState: true });
  }

  async function saveCardComment() {
    if (state.cardCommentSaving) return;
    state.cardCommentSaving = true;
    state.cardCommentError = "";
    render({ preserveState: true });
    try {
      const personalStorage = activeTrailPersonalStorage();
      if (!personalStorage?.saveCommentForPath) {
        throw new Error("As observações deste curso não estão disponíveis.");
      }
      await personalStorage.saveCommentForPath(state.selection, {
        category: state.cardCommentDraft.category,
        body: state.cardCommentDraft.body
      });
      state.cardCommentExists = true;
      state.cardCommentOpen = false;
    } catch (error) {
      state.cardCommentError = error instanceof Error ? error.message : String(error);
    } finally {
      state.cardCommentSaving = false;
      render({ preserveState: true });
    }
  }

  function notifyIncompleteExercise(message) {
    void message;
  }

  function collectLessonProgressReferencesInCourse(course) {
    return (course.modules || []).flatMap((moduleValue) =>
      (moduleValue.lessons || []).map((lesson) => ({
        courseKey: course.id,
        moduleKey: moduleValue.id,
        lessonKey: lesson.id
      }))
    );
  }

  function resetCourseProgress(courseKey) {
    const course = findCourse(state.project, courseKey);
    const lessonReferences = collectLessonProgressReferencesInCourse(course);
    return removeProgressEntries(lessonReferences);
  }

  function resetModuleProgress(courseKey, moduleKey) {
    const moduleValue = findModule(state.project, courseKey, moduleKey);
    return removeProgressEntries(collectProgressReferencesInModule(courseKey, moduleValue));
  }

  function resetLessonProgress(courseKey, moduleKey, lessonKey) {
    return removeProgressEntries([{ courseKey, moduleKey, lessonKey }]);
  }

  function resetMicrosequenceProgress(courseKey, moduleKey, lessonKey, microsequenceKey) {
    const microsequence = findMicrosequence(
      state.project,
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey
    );
    const cardKeys = (microsequence?.cards || []).map((card) => card.id);
    const nextProgress = truncateLessonProgressFromCardKeys(
      activeProgress(courseKey),
      { courseKey, moduleKey, lessonKey },
      cardKeys
    );
    return saveActiveProgress(nextProgress, courseKey);
  }

  function resetCardProgress(courseKey, moduleKey, lessonKey, cardKey) {
    const nextProgress = truncateLessonProgressFromCardKeys(
      activeProgress(courseKey),
      { courseKey, moduleKey, lessonKey },
      [cardKey]
    );
    return saveActiveProgress(nextProgress, courseKey);
  }

  function buildCurrentCardAssistanceRequest() {
    const context = getRenderContext();
    const assistance = reconcileCardAssistanceUiState(state.assistDraft.assistance, {
      selection: state.selection,
      card: context.card,
      cards: context.cards
    });
    state.assistDraft.assistance = assistance;
    const conversationKey = cardAssistanceConversationKey(state.selection);
    const conversation = normalizeCardAssistanceConversation(
      state.assistDraft.conversationByReferenceKey.get(conversationKey),
      state.selection
    );
    return {
      operation: "repair",
      promptText: state.assistDraft.promptText,
      repairScope: assistance.wholeCardSelected ? "card" : "resources",
      resourceTargetIds: assistance.wholeCardSelected ? [] : assistance.resourceTargetIds,
      conversationTurns: cardAssistanceConversationContext(conversation, state.selection)
    };
  }

  async function deleteCardComment() {
    if (state.cardCommentSaving || !state.cardCommentExists) return;
    state.cardCommentSaving = true;
    state.cardCommentError = "";
    render({ preserveState: true });
    try {
      const personalStorage = activeTrailPersonalStorage();
      if (!personalStorage?.deleteCommentForPath) {
        throw new Error("As observações deste curso não estão disponíveis.");
      }
      await personalStorage.deleteCommentForPath(state.selection);
      state.cardCommentExists = false;
      state.cardCommentOpen = false;
    } catch (error) {
      state.cardCommentError = error instanceof Error ? error.message : String(error);
    } finally {
      state.cardCommentSaving = false;
      render({ preserveState: true });
    }
  }

  async function readCardAssistanceLocalState(courseKey) {
    const stored = await storage.loadCardAssistanceLocalState?.(courseKey);
    return normalizeCardAssistanceLocalState(stored || {});
  }

  async function assertNoContextualAuthoringPending(courseKey) {
    if (typeof storage.loadCardAssistanceLocalState !== "function") return;
    const localState = await readCardAssistanceLocalState(courseKey);
    if (
      localState.sync.pendingPaths.length ||
      localState.sync.pendingMetadata.length
    ) {
      const error = new Error(
        "Sincronize primeiro as edições textuais pendentes antes de mover ou excluir conteúdo."
      );
      error.code = "contextual_authoring_pending";
      throw error;
    }
  }

  async function loadCardAssistanceLocalState(courseKey = state.selection.courseKey) {
    if (!courseKey || typeof storage.loadCardAssistanceLocalState !== "function") return;
    try {
      const stored = await readCardAssistanceLocalState(courseKey);
      if (courseKey !== state.selection.courseKey) return;
      if (state.assistDraft.localStateCourseKey) {
        state.assistDraft.localAuthoringByCourseId.set(
          state.assistDraft.localStateCourseKey,
          normalizeCardAssistanceLocalState(state.assistDraft.localState)
        );
      }
      state.assistDraft.localState = stored;
      state.assistDraft.localStateCourseKey = courseKey;
      state.assistDraft.localAuthoringByCourseId.set(courseKey, stored);
      state.assistDraft.syncError = "";
      render({ preserveState: true });
    } catch {
      // A persistência atômica repetirá a leitura antes de qualquer gravação.
    }
  }

  function contextualAuthoringAttemptOwnsVisibleState(courseKey) {
    return state.selection?.courseKey === courseKey &&
      state.assistDraft.localStateCourseKey === courseKey;
  }

  function applyContextualAuthoringLocalState(courseKey, localState) {
    const normalized = normalizeCardAssistanceLocalState(localState || {});
    state.assistDraft.localAuthoringByCourseId.set(courseKey, normalized);
    if (!contextualAuthoringAttemptOwnsVisibleState(courseKey)) return false;
    state.assistDraft.localState = normalized;
    return true;
  }

  function contextualAuthoringIsAvailable() {
    return typeof contextualAuthoring?.remoteCatalog?.executeApplicationAuthoringAction === "function";
  }

  function contextualAuthoringFailureIsTerminal(error) {
    if (error?.conflict === true || error?.code === "contextual_authoring_conflict") return true;
    if ([
      "course_authoring_forbidden",
      "course_authoring_authority_mismatch",
      "contextual_authoring_draft_missing",
      "card_assistance_state_invalid",
      "card_assistance_sync_scope_too_large"
    ].includes(String(error?.code || ""))) return true;
    const status = Number(error?.status);
    return Number.isSafeInteger(status) && status >= 400 && status < 500 &&
      ![408, 429].includes(status);
  }

  async function synchronizeContextualAuthoringCourse(courseKey, {
    conflictPolicy = "reject"
  } = {}) {
    if (contextualAuthoringAttemptOwnsVisibleState(courseKey)) {
      state.assistDraft.syncError = "";
    }
    let attemptLocalState = null;
    let authoringSnapshot = null;
    try {
      if (typeof storage.loadContextualAuthoringSnapshot === "function") {
        authoringSnapshot = await storage.loadContextualAuthoringSnapshot(courseKey);
        attemptLocalState = normalizeCardAssistanceLocalState(
          authoringSnapshot.localState || {}
        );
        state.assistDraft.localAuthoringByCourseId.set(courseKey, attemptLocalState);
        if (state.selection?.courseKey === courseKey) {
          state.assistDraft.localState = attemptLocalState;
          state.assistDraft.localStateCourseKey = courseKey;
          state.assistDraft.syncError = "";
        }
      } else if (state.assistDraft.localStateCourseKey !== courseKey) {
        attemptLocalState = await readCardAssistanceLocalState(courseKey);
        if (state.selection?.courseKey === courseKey) {
          state.assistDraft.localState = attemptLocalState;
          state.assistDraft.localStateCourseKey = courseKey;
          state.assistDraft.syncError = "";
        }
      } else {
        attemptLocalState = normalizeCardAssistanceLocalState(
          state.assistDraft.localState
        );
      }
      const pendingPaths = attemptLocalState.sync.pendingPaths;
      const pendingMetadata = attemptLocalState.sync.pendingMetadata;
      if (!pendingPaths.length && !pendingMetadata.length) return;
      const result = await materializeContextualCourseDraft({
        remoteCatalog: contextualAuthoring.remoteCatalog,
        storage,
        projectDocument: authoringSnapshot?.projectDocument || state.project,
        courseKey,
        pendingPaths,
        pendingMetadata,
        expectedLocalDraftRevision: attemptLocalState.sync.expectedRevision,
        draftSnapshot: authoringSnapshot === null ? undefined : authoringSnapshot.draft,
        conflictPolicy
      });
      if (result.status === "clean") {
        const finalized = await finalizeCleanContextualCourseDraftSync({
          storage,
          courseKey,
          localState: attemptLocalState
        });
        let nextLocalState;
        if (finalized.attempted) {
          nextLocalState = normalizeCardAssistanceLocalState(
            finalized.localState || {}
          );
        } else {
          nextLocalState = clearContextualAuthoringSync(
            attemptLocalState
          );
          await storage.saveCardAssistanceLocalState?.(courseKey, nextLocalState);
        }
        applyContextualAuthoringLocalState(courseKey, nextLocalState);
        const retryTimer = state.assistDraft.contextualAuthoringSync.retryTimers.get(courseKey);
        if (retryTimer) globalThis.clearTimeout(retryTimer);
        state.assistDraft.contextualAuthoringSync.retryTimers.delete(courseKey);
        state.assistDraft.contextualAuthoringSync.retryAttempts.delete(courseKey);
        return { status: "clean", pending: false };
      }
      const nextLocalState = normalizeCardAssistanceLocalState(
        await finalizeContextualCourseDraftSync({
          storage,
          ...result.localFinalization
        }) || {}
      );
      applyContextualAuthoringLocalState(courseKey, nextLocalState);
      const previousSelection = { ...state.selection };
      const snapshot = await refreshHomeTrails();
      const materializedItem = snapshot?.items?.find((item) =>
        (result.trailItemId && item.itemId === result.trailItemId) ||
        (item.workspaceId === result.workspaceId && item.courseKey === result.courseKey)
      );
      if (materializedItem && state.selection?.courseKey === courseKey) {
        const materializedCourse = await ensureHomeTrailCourse(materializedItem.itemId);
        if (materializedCourse) {
          await ensureTrailPersonalStorage(materializedItem, materializedCourse);
          state.homeSelectedTrailItemId = materializedItem.itemId;
          state.homeSelectedCourseKey = materializedCourse.id;
          applySelectionByKeys(state.project, {
            ...previousSelection,
            courseKey: materializedCourse.id
          });
        }
      }
      const retryTimer = state.assistDraft.contextualAuthoringSync.retryTimers.get(courseKey);
      if (retryTimer) globalThis.clearTimeout(retryTimer);
      state.assistDraft.contextualAuthoringSync.retryTimers.delete(courseKey);
      state.assistDraft.contextualAuthoringSync.retryAttempts.delete(courseKey);
      return { status: "materialized", pending: false, ...result };
    } catch (error) {
      console.warn("Sincronização da autoria contextual adiada.", error);
      const status = contextualAuthoringFailureIsTerminal(error)
        ? "conflict"
        : "pending";
      const errorMessage = error instanceof Error ? error.message : "A sincronização foi adiada.";
      let currentLocalState;
      if (typeof storage.updateCardAssistanceSyncStatus === "function") {
        const updated = await storage.updateCardAssistanceSyncStatus(courseKey, {
          status,
          errorMessage,
          expectedLocalDraftRevision: attemptLocalState?.sync?.expectedRevision || null
        });
        currentLocalState = normalizeCardAssistanceLocalState(
          updated?.localState || await readCardAssistanceLocalState(courseKey)
        );
      } else {
        currentLocalState = setContextualAuthoringSyncStatus(
          await readCardAssistanceLocalState(courseKey),
          { status, errorMessage }
        );
        await storage.saveCardAssistanceLocalState?.(courseKey, currentLocalState);
      }
      applyContextualAuthoringLocalState(courseKey, currentLocalState);
      if (contextualAuthoringAttemptOwnsVisibleState(courseKey)) {
        state.assistDraft.syncError = status === "conflict"
          ? currentLocalState.sync.errorMessage ||
            "O mesmo texto foi alterado em outro dispositivo. Escolha como continuar."
          : "A alteração ficou na fila local e será sincronizada automaticamente.";
      }
      if (status === "pending" && globalThis.navigator?.onLine !== false) {
        const syncState = state.assistDraft.contextualAuthoringSync;
        if (!syncState.retryTimers.has(courseKey)) {
          const attempt = (syncState.retryAttempts.get(courseKey) || 0) + 1;
          syncState.retryAttempts.set(courseKey, attempt);
          const timer = globalThis.setTimeout(() => {
            syncState.retryTimers.delete(courseKey);
            void attemptContextualAuthoringSync(courseKey);
          }, Math.min(60_000, 5_000 * (2 ** (attempt - 1))));
          syncState.retryTimers.set(courseKey, timer);
        }
      } else {
        const syncState = state.assistDraft.contextualAuthoringSync;
        const retryTimer = syncState.retryTimers.get(courseKey);
        if (retryTimer) globalThis.clearTimeout(retryTimer);
        syncState.retryTimers.delete(courseKey);
        syncState.retryAttempts.delete(courseKey);
      }
      return {
        status,
        pending: true,
        conflict: status === "conflict",
        errorMessage: currentLocalState.sync.errorMessage
      };
    }
  }

  async function drainContextualAuthoringSync() {
    const syncState = state.assistDraft.contextualAuthoringSync;
    if (!contextualAuthoringIsAvailable() || globalThis.navigator?.onLine === false) return;
    if (!claimContextualAuthoringSyncAttempt(syncState)) return syncState.activePromise;
    const operation = (async () => {
      while (syncState.courseKeys.size && globalThis.navigator?.onLine !== false) {
        const [courseKey] = syncState.courseKeys;
        syncState.courseKeys.delete(courseKey);
        await synchronizeContextualAuthoringCourse(courseKey);
      }
    })();
    syncState.activePromise = operation;
    try {
      await operation;
    } finally {
      if (syncState.activePromise === operation) syncState.activePromise = null;
      settleContextualAuthoringSyncAttempt(
        syncState,
        () => {
          void drainContextualAuthoringSync();
        }
      );
      render({ preserveState: true });
    }
  }

  function attemptContextualAuthoringSync(courseKey = state.selection?.courseKey) {
    const normalizedCourseKey = text(courseKey);
    if (!normalizedCourseKey) return Promise.resolve();
    state.assistDraft.contextualAuthoringSync.courseKeys.add(normalizedCourseKey);
    return drainContextualAuthoringSync();
  }

  async function attemptAllContextualAuthoringSync() {
    if (!contextualAuthoringIsAvailable() || globalThis.navigator?.onLine === false) return;
    const courses = storage.loadProject()?.courses || [];
    const states = await Promise.all(courses.map(async (course) => {
      try {
        return {
          courseKey: course.id,
          localState: await readCardAssistanceLocalState(course.id)
        };
      } catch {
        return null;
      }
    }));
    for (const entry of states.filter(Boolean)) {
      const { courseKey, localState } = entry;
      state.assistDraft.localAuthoringByCourseId.set(courseKey, localState);
      if (localState.sync.status !== "conflict" &&
          (localState.sync.pendingPaths.length || localState.sync.pendingMetadata.length)) {
        state.assistDraft.contextualAuthoringSync.courseKeys.add(courseKey);
      }
    }
    return drainContextualAuthoringSync();
  }

  function requireCardAssistancePersistenceGuard(value, courseKey) {
    const expectedCourseKey = String(courseKey || "");
    const expectedRevision = value?.expectedRevision;
    if (
      value?.contract !== "aralearn.local-course-draft-guard.v1" ||
      String(value.courseKey || "") !== expectedCourseKey ||
      !Object.prototype.hasOwnProperty.call(value, "expectedRevision") ||
      (
        expectedRevision !== null &&
        (typeof expectedRevision !== "string" || !expectedRevision.trim())
      )
    ) {
      throw new Error("O curso mudou enquanto a alteração era preparada. Tente novamente.");
    }
    return Object.freeze({
      contract: value.contract,
      courseId: String(value.courseId || ""),
      courseKey: expectedCourseKey,
      expectedRevision: expectedRevision === null ? null : expectedRevision.trim()
    });
  }

  function readManualCardEditValues(container) {
    const pathValues = readManualCardEditPathValues(container);
    if (Object.keys(pathValues).length) return { pathValues };
    const values = Object.fromEntries(
      [...container.querySelectorAll("[data-manual-edit-key]")].map((node) => [
        node.getAttribute("data-manual-edit-key"),
        node.value
      ])
    );
    return values;
  }

  function rememberManualCardEditDraft(container) {
    if (!container) return null;
    const targetId = container.getAttribute("data-manual-target-id") || "card";
    const values = readManualCardEditValues(container);
    state.assistDraft.manualDraft = {
      ...state.selection,
      targetId,
      values
    };
    return state.assistDraft.manualDraft;
  }

  function cancelManualCardEdit() {
    if (state.assistDraft.isSubmitting) return;
    const targetId = String(
      state.assistDraft.manualDraft?.targetId ||
      root.querySelector("[data-manual-target-id]")?.getAttribute("data-manual-target-id") ||
      ""
    );
    state.assistDraft.manualDraft = null;
    state.assistDraft.manualEditError = "";
    state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
    queueAuthoringFocus(targetId && targetId !== "card" ? `resource:${targetId}` : "card-title");
    render({ preserveState: true });
  }

  async function commitCardAssistanceEntries({
    requestedProjectDocument,
    requestedSelection,
    entries,
    persistenceGuard
  }) {
    const capabilities = assertCourseCapability(
      "canEditCards",
      requestedSelection.courseKey,
      "A edição de cards não está disponível para este curso."
    );
    const workspaceRef = capabilities.workspaceRef;
    const beforeMicrosequence = findMicrosequence(
      requestedProjectDocument,
      requestedSelection.courseKey,
      requestedSelection.moduleKey,
      requestedSelection.lessonKey,
      requestedSelection.microsequenceKey
    );
    const guard = workspaceRef ? null : requireCardAssistancePersistenceGuard(
      persistenceGuard,
      requestedSelection.courseKey
    );
    const applied = await applyCardAssistanceBatchChangeSet({
      projectDocument: requestedProjectDocument,
      entries
    });
    const targetMicrosequence = findMicrosequence(
      applied.projectDocument,
      requestedSelection.courseKey,
      requestedSelection.moduleKey,
      requestedSelection.lessonKey,
      applied.targetMicrosequenceKey
    );
    const targetIndex = (targetMicrosequence?.cards || [])
      .findIndex((card) => card.id === applied.cardKey);
    if (!targetMicrosequence || targetIndex < 0) {
      throw new Error("A alteração validada não contém o card de destino.");
    }
    if (canonicalStringify(beforeMicrosequence) === canonicalStringify(targetMicrosequence)) {
      state.selection.microsequenceKey = applied.targetMicrosequenceKey;
      state.selection.cardIndex = targetIndex;
      state.selection.cardKey = targetMicrosequence.cards[targetIndex].id;
      state.assistDraft.promptText = "";
      state.assistDraft.composerOpen = false;
      state.assistDraft.manualDraft = null;
      state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
      state.assistDraft.manualEditError = "";
      queueAuthoringFocus("card-title");
      return { ...applied, unchanged: true };
    }
    if (workspaceRef) {
      const draftCourse = structuredClone(
        findCourse(applied.projectDocument, requestedSelection.courseKey)
      );
      const saved = await workspaceCourseHook("saveMicrosequenceCards")({
        courseRef: workspaceRef,
        draftCourse,
        microsequencePath: [
          requestedSelection.courseKey,
          requestedSelection.moduleKey,
          requestedSelection.lessonKey,
          applied.targetMicrosequenceKey
        ],
        baseCards: structuredClone(beforeMicrosequence?.cards || []),
        cards: structuredClone(targetMicrosequence.cards || [])
      });
      updateWorkspaceAuthoringReference(workspaceRef, saved);
      if (saved?.pending === true) {
        state.assistDraft.syncError = saved.errorMessage || (
          saved.conflict === true
            ? "A alteração foi salva neste dispositivo, mas precisa resolver um conflito antes de sincronizar."
            : "A alteração foi salva neste dispositivo e será sincronizada quando a conexão permitir."
        );
      } else {
        state.assistDraft.syncError = "";
      }
      const committedProject = applyWorkspaceAuthoringResult(
        applied.projectDocument,
        workspaceRef,
        saved
      );
      const committedMicrosequence = findMicrosequence(
        committedProject,
        requestedSelection.courseKey,
        requestedSelection.moduleKey,
        requestedSelection.lessonKey,
        applied.targetMicrosequenceKey
      );
      const committedIndex = (committedMicrosequence?.cards || [])
        .findIndex((card) => card.id === applied.cardKey);
      if (!committedMicrosequence || committedIndex < 0) {
        throw new Error("O curso salvo não preservou o card editado.");
      }
      setProject(committedProject);
      state.selection.microsequenceKey = applied.targetMicrosequenceKey;
      state.selection.cardIndex = committedIndex;
      state.selection.cardKey = committedMicrosequence.cards[committedIndex].id;
      state.assistDraft.promptText = "";
      state.assistDraft.composerOpen = false;
      state.assistDraft.manualDraft = null;
      state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
      queueAuthoringFocus("card-title");
      invalidateResponseExerciseState();
      await persistProgressReset(
        `card:${requestedSelection.courseKey}:${committedMicrosequence.cards[committedIndex].id}`,
        () => resetCardProgress(
          requestedSelection.courseKey,
          requestedSelection.moduleKey,
          requestedSelection.lessonKey,
          committedMicrosequence.cards[committedIndex].id
        )
      );
      if (saved?.pending !== true) await refreshHomeTrails();
      return applied;
    }
    if (typeof storage.saveMicrosequenceGeneration !== "function") {
      throw new Error("Não foi possível salvar a alteração neste dispositivo.");
    }
    const currentLocalState = state.assistDraft.localStateCourseKey === requestedSelection.courseKey
      ? state.assistDraft.localState
      : await readCardAssistanceLocalState(requestedSelection.courseKey);
    let nextLocalState = setCardAssistanceUndo(
      currentLocalState,
      {
        contract: CARD_ASSISTANCE_UNDO_CONTRACT,
        kind: "microsequence",
        ...requestedSelection,
        microsequenceKey: beforeMicrosequence.id,
        expectedRevision: guard.expectedRevision,
        affectedMicrosequenceIds: [applied.targetMicrosequenceKey],
        inversePatch: createContextualAuthoringInversePatch(
          beforeMicrosequence,
          targetMicrosequence
        )
      }
    );
    nextLocalState = markContextualAuthoringSyncPending(
      nextLocalState,
      {
        ...requestedSelection,
        microsequenceKey: applied.targetMicrosequenceKey,
        textOnly: true,
        baseCards: structuredClone(beforeMicrosequence?.cards || []),
        baseMetadata: {
          title: beforeMicrosequence?.title || "",
          goal: beforeMicrosequence?.goal || "",
          role: beforeMicrosequence?.role || "",
          branchOf: beforeMicrosequence?.branchOf || null,
          dependsOn: structuredClone(beforeMicrosequence?.dependsOn || []),
          covers: structuredClone(beforeMicrosequence?.covers || []),
          checks: structuredClone(beforeMicrosequence?.checks || []),
          errors: structuredClone(beforeMicrosequence?.errors || [])
        },
        basePosition: Math.max(0, (
          findLesson(
            requestedProjectDocument,
            requestedSelection.courseKey,
            requestedSelection.moduleKey,
            requestedSelection.lessonKey
          )?.microsequences || []
        ).findIndex((item) => item.id === beforeMicrosequence?.id))
      }
    );
    await storage.saveMicrosequenceGeneration(
      applied.projectDocument,
      applied.targetMicrosequenceKey,
      {
        expectedLocalDraftRevision: guard.expectedRevision,
        cardAssistanceLocalState: nextLocalState,
        cardAssistanceCourseIdentity: requestedSelection.courseKey
      }
    );
    state.assistDraft.localState = normalizeCardAssistanceLocalState(
      await storage.loadCardAssistanceLocalState(requestedSelection.courseKey) || {}
    );
    state.assistDraft.localStateCourseKey = requestedSelection.courseKey;
    setProject(applied.projectDocument);
    state.selection.microsequenceKey = applied.targetMicrosequenceKey;
    state.selection.cardIndex = targetIndex;
    state.selection.cardKey = targetMicrosequence.cards[targetIndex].id;
    state.assistDraft.promptText = "";
    state.assistDraft.composerOpen = false;
    state.assistDraft.manualDraft = null;
    state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
    queueAuthoringFocus("card-title");
    void attemptContextualAuthoringSync();
    invalidateResponseExerciseState();
    await persistProgressReset(
      `card:${requestedSelection.courseKey}:${targetMicrosequence.cards[targetIndex].id}`,
      () => resetCardProgress(
        requestedSelection.courseKey,
        requestedSelection.moduleKey,
        requestedSelection.lessonKey,
        targetMicrosequence.cards[targetIndex].id
      )
    );
    return applied;
  }

  async function saveManualCardEdit() {
    if (state.assistDraft.isSubmitting) return;
    const container = root.querySelector("[data-manual-target-id]");
    const context = getRenderContext();
    if (!container || !context.card || !context.microsequence) return;
    const manualDraft = rememberManualCardEditDraft(container);
    const values = manualDraft.values;

    state.assistDraft.isSubmitting = true;
    state.assistDraft.manualEditError = "";
    root.querySelectorAll(
      ".runtime-card-external-dock button, [data-manual-target-id] button"
    ).forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    });
    try {
      const requestedProjectDocument = structuredClone(state.project);
      const requestedSelection = { ...state.selection };
      const capabilities = assertCourseCapability(
        "canEditCards",
        requestedSelection.courseKey,
        "A edição manual de cards não está disponível para este curso."
      );
      const workspaceRef = capabilities.workspaceRef;
      let guard = null;
      if (!workspaceRef) {
        if (
          typeof storage.flush !== "function" ||
          typeof storage.createLocalCourseDraftGuard !== "function"
        ) {
          throw new Error("Não foi possível salvar a alteração neste dispositivo.");
        }
        await storage.flush();
        guard = requireCardAssistancePersistenceGuard(
          await storage.createLocalCourseDraftGuard(requestedSelection.courseKey),
          requestedSelection.courseKey
        );
      }
      const targetId = container.getAttribute("data-manual-target-id") || "card";
      const request = targetId === "card"
        ? { operation: "repair", repairScope: "card", resourceTargetIds: [] }
        : { operation: "repair", repairScope: "resources", resourceTargetIds: [targetId] };
      const snapshot = await buildCardAssistanceScopeSnapshot(
        requestedProjectDocument,
        requestedSelection,
        request
      );
      const editedCard = applyManualCardEdit(
        context.card,
        targetId,
        values
      );
      const entries = [{
        selection: requestedSelection,
        snapshot,
        changeSet: {
          contract: "aralearn.card-assistance-change.v1",
          operation: "repair",
          card: editedCard
        }
      }];
      await commitCardAssistanceEntries({
        requestedProjectDocument,
        requestedSelection,
        entries,
        persistenceGuard: guard
      });
    } catch (error) {
      if (error?.code === "local_course_draft_changed") setProject(storage.loadProject());
      state.assistDraft.manualEditError =
        error instanceof Error ? error.message : "Não foi possível salvar a alteração.";
      queueAuthoringFocus("manual-first-field");
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function undoCardEdit() {
    const undo = state.assistDraft.localState.undo;
    if (!undo || undo.kind !== "microsequence" || state.assistDraft.isSubmitting) return;
    if (workspaceCourseRef(undo.courseKey)) {
      state.assistDraft.manualEditError =
        "O desfazer local não pertence a esta composição de workspace.";
      render({ preserveState: true });
      return;
    }
    state.assistDraft.isSubmitting = true;
    state.assistDraft.manualEditError = "";
    try {
      assertCourseAuthoringAllowed(undo.courseKey);
      const nextProject = structuredClone(state.project);
      const lesson = findLesson(nextProject, undo.courseKey, undo.moduleKey, undo.lessonKey);
      const index = (lesson?.microsequences || []).findIndex(
        (microsequence) => microsequence.id === undo.microsequenceKey
      );
      if (index < 0) throw new Error("A microssequência da última alteração não existe mais.");
      const beforeMicrosequence = structuredClone(lesson.microsequences[index]);
      lesson.microsequences[index] = applyContextualAuthoringInversePatch(
        lesson.microsequences[index],
        undo.inversePatch
      );
      let nextLocalState = setCardAssistanceUndo(state.assistDraft.localState, null);
      nextLocalState = markContextualAuthoringSyncPending(nextLocalState, {
        courseKey: undo.courseKey,
        moduleKey: undo.moduleKey,
        lessonKey: undo.lessonKey,
        microsequenceKey: undo.microsequenceKey,
        textOnly: true,
        baseCards: structuredClone(beforeMicrosequence.cards || []),
        baseMetadata: {
          title: beforeMicrosequence.title || "",
          goal: beforeMicrosequence.goal || "",
          role: beforeMicrosequence.role || "",
          branchOf: beforeMicrosequence.branchOf || null,
          dependsOn: structuredClone(beforeMicrosequence.dependsOn || []),
          covers: structuredClone(beforeMicrosequence.covers || []),
          checks: structuredClone(beforeMicrosequence.checks || []),
          errors: structuredClone(beforeMicrosequence.errors || [])
        },
        basePosition: index
      });
      await storage.saveMicrosequenceGeneration(nextProject, undo.microsequenceKey, {
        expectedLocalDraftRevision: undo.expectedRevision,
        cardAssistanceLocalState: nextLocalState,
        cardAssistanceCourseIdentity: undo.courseKey
      });
      setProject(nextProject);
      state.assistDraft.localState = normalizeCardAssistanceLocalState(
        await storage.loadCardAssistanceLocalState(undo.courseKey) || {}
      );
      state.assistDraft.localStateCourseKey = undo.courseKey;
      void attemptContextualAuthoringSync();
      invalidateResponseExerciseState();
      await persistProgressReset(
        `lesson:${undo.courseKey}:${undo.lessonKey}`,
        () => resetLessonProgress(undo.courseKey, undo.moduleKey, undo.lessonKey)
      );
    } catch (error) {
      if (error?.code === "local_course_draft_changed") setProject(storage.loadProject());
      state.assistDraft.manualEditError =
        error instanceof Error ? error.message : "Não foi possível desfazer a alteração.";
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function submitCardAssistanceRequest() {
    if (state.assistDraft.isSubmitting) return;
    const context = getRenderContext();
    const selectionReady = cardAssistanceSelectionIsReady(
      state.assistDraft.assistance,
      { selection: state.selection, card: context.card, cards: context.cards }
    );
    if (!canSubmitCardAssistanceRequest({
      promptText: state.assistDraft.promptText,
      isSubmitting: state.assistDraft.isSubmitting,
      selectionReady
    })) {
      return;
    }
    const request = buildCurrentCardAssistanceRequest();
    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });
    try {
      const requestedProjectDocument = structuredClone(state.project);
      const requestedSelection = { ...state.selection };
      const requestedAssistConfig = structuredClone(state.assistConfig);
      const capabilities = assertCourseCapability(
        "canUseCardAi",
        requestedSelection.courseKey,
        "A assistência por IA não está disponível para este curso."
      );
      const workspaceRef = capabilities.workspaceRef;
      let persistenceGuard = null;
      if (!workspaceRef) {
        if (
          typeof storage.flush !== "function" ||
          typeof storage.createLocalCourseDraftGuard !== "function"
        ) {
          throw new Error("Não foi possível salvar a alteração neste dispositivo.");
        }
        await storage.flush();
        persistenceGuard = requireCardAssistancePersistenceGuard(
          await storage.createLocalCourseDraftGuard(requestedSelection.courseKey),
          requestedSelection.courseKey
        );
      }
      const submission = await executeCardAssistance({
        projectDocument: requestedProjectDocument,
        selection: requestedSelection,
        request,
        assistConfig: requestedAssistConfig,
        provider: assistProvider,
        checkCodexLocalHealth
      });
      if (submission.status === "provider-unready") {
        state.assistDraft.errorMessage =
          submission.errorMessage || "O serviço de linguagem não está disponível.";
        updateCodexCliSetupStatus({
          ok: false,
          checking: false,
          error: state.assistDraft.errorMessage
        });
        openProviderConfig();
        return;
      }
      if (submission.status === "auth-error") {
        state.assistDraft.errorMessage =
          submission.errorMessage || "Erro de autenticação do provider.";
        openProviderConfig();
        return;
      }
      if (submission.status !== "success" || !submission.change) {
        state.assistDraft.errorMessage =
          submission.errorMessage || "Não foi possível produzir uma alteração válida.";
        return;
      }
      await assertCardAssistanceScopeCurrent({
        snapshot: submission.change.snapshot,
        projectDocument: state.project,
        selection: requestedSelection
      });
      await commitCardAssistanceEntries({
        requestedProjectDocument,
        requestedSelection,
        entries: [{
          selection: requestedSelection,
          snapshot: submission.change.snapshot,
          changeSet: submission.change.changeSet
        }],
        persistenceGuard
      });
      const conversationKey = cardAssistanceConversationKey(requestedSelection);
      const conversation = appendCardAssistanceConversationTurn(
        state.assistDraft.conversationByReferenceKey.get(conversationKey),
        requestedSelection,
        {
          request: request.promptText,
          scope: request.repairScope,
          targetIds: request.resourceTargetIds,
          modelId: submission.modelId
        }
      );
      state.assistDraft.conversationByReferenceKey.set(conversationKey, conversation);
      const currentContext = getRenderContext();
      state.assistDraft.assistance = reconcileCardAssistanceUiState({
        ...createCardAssistanceUiState(state.selection),
        wholeCardSelected: request.repairScope === "card",
        repairScope: request.repairScope,
        resourceTargetIds: request.resourceTargetIds
      }, {
        selection: state.selection,
        card: currentContext.card,
        cards: currentContext.cards
      });
      state.assistDraft.composerOpen = true;
      state.assistDraft.promptText = "";
      queueAuthoringFocus("ai-prompt");
    } catch (error) {
      state.assistDraft.errorMessage =
        error instanceof Error ? error.message : "Não foi possível concluir a alteração.";
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function applyStructureReorder(drag, target, position) {
    if (!canDropStructure(drag, target) || state.entityMutationSaving) {
      return;
    }

    let toIndex = null;
    let entityPath = null;
    if (drag.level === "course") {
      toIndex = resolveStructureDropIndex(
        state.project.courses || [],
        drag.courseKey,
        target.courseKey,
        position
      );
      entityPath = [drag.courseKey];
    } else if (drag.level === "module") {
      const course = findCourse(state.project, drag.courseKey);
      toIndex = resolveStructureDropIndex(
        course?.modules || [],
        drag.moduleKey,
        target.moduleKey,
        position
      );
      entityPath = [drag.courseKey, drag.moduleKey];
    } else if (drag.level === "lesson") {
      const moduleValue = findModule(state.project, drag.courseKey, drag.moduleKey);
      toIndex = resolveStructureDropIndex(
        moduleValue?.lessons || [],
        drag.lessonKey,
        target.lessonKey,
        position
      );
      entityPath = [drag.courseKey, drag.moduleKey, drag.lessonKey];
    } else if (drag.level === "microsequence") {
      const lesson = findLesson(state.project, drag.courseKey, drag.moduleKey, drag.lessonKey);
      toIndex = resolveStructureDropIndex(
        lesson?.microsequences || [],
        drag.microsequenceKey,
        target.microsequenceKey,
        position
      );
      entityPath = [
        drag.courseKey,
        drag.moduleKey,
        drag.lessonKey,
        drag.microsequenceKey
      ];
    } else if (drag.level === "card") {
      const microsequence = findMicrosequence(
        state.project,
        drag.courseKey,
        drag.moduleKey,
        drag.lessonKey,
        drag.microsequenceKey
      );
      toIndex = resolveStructureDropIndex(
        microsequence?.cards || [],
        drag.cardKey,
        target.cardKey,
        position
      );
      entityPath = [
        drag.courseKey,
        drag.moduleKey,
        drag.lessonKey,
        drag.microsequenceKey,
        drag.cardKey
      ];
    }

    if (toIndex === null || !entityPath) return false;
    let capabilities;
    try {
      capabilities = assertCourseCapability(
        "canMove",
        drag.courseKey,
        "A reorganização deste curso não está disponível."
      );
    } catch (error) {
      state.entityMutationError = error instanceof Error
        ? error.message
        : "A reorganização deste curso não está disponível.";
      render({ preserveState: true });
      return false;
    }
    const workspaceRef = capabilities.workspaceRef;
    state.entityMutationSaving = true;
    state.entityMutationError = "";
    render({ preserveState: true });
    try {
      const targetParentPath = entityPath.length === 1 ? null : entityPath.slice(0, -1);
      if (workspaceRef) {
        const moved = await workspaceCourseHook("moveEntity")({
          courseRef: workspaceRef,
          entityType: drag.level,
          entityPath,
          targetParentPath,
          position: toIndex
        });
        if (Number.isSafeInteger(Number(moved?.revision))) {
          homeTrailsController.updateCourseRef(workspaceRef.trailItemId, {
            revision: Number(moved.revision)
          });
        }
      } else {
        await assertNoContextualAuthoringPending(drag.courseKey);
        await moveIntegratedEntity({
          ...contextualAuthoring,
          storage,
          courseKey: drag.courseKey,
          entityType: drag.level,
          entityPath,
          targetParentPath,
          position: toIndex,
          title: findCourse(state.project, drag.courseKey)?.title
        });
      }
      const nextProject = workspaceRef
        ? await refreshWorkspaceCourseDocument(workspaceRef)
        : storage.loadProject();
      setProject(nextProject);
      if (workspaceRef) await refreshHomeTrails();
      applySelectionByKeys(nextProject, state.selection);
      syncAssistDraft();
    } catch (error) {
      state.entityMutationError = error instanceof Error ? error.message : "Não foi possível mover.";
    } finally {
      state.entityMutationSaving = false;
      render({ preserveState: true });
    }
  }

  function goBack() {
    state.cardCommentOpen = false;
    state.providerConfigOpen = false;
    state.inlineStructureEditor = null;
    state.entityMutationError = "";

    if (state.view === "microsequence") {
      state.view = "lesson";
      state.microsequenceMode = "play";
      state.entityModes.card = "view";
    } else if (state.view === "lesson") {
      state.view = "module";
    } else if (state.view === "module") {
      state.view = "course";
    } else if (state.view === "course") {
      state.view = "courses";
    }

    render({ preserveState: false });
  }

  async function deleteCourseDirect(courseKey, { trailItemId = "" } = {}) {
    const descriptor = trailItemId ? homeTrailsController?.item(trailItemId) : null;
    const directReference = trailItemId
      ? homeTrailsController?.courseRefs.get(trailItemId) || null
      : null;
    const resolvedCourseKey = directReference?.courseKey || courseKey;
    const course = findCourse(state.project, resolvedCourseKey);
    if (state.entityMutationSaving) return;
    const deletionMode = descriptor ? trailItemDeleteMode(descriptor) : null;
    const workspaceRef = deletionMode === "workspace"
      ? directReference
      : descriptor
        ? null
        : workspaceCourseRef(resolvedCourseKey);
    if (descriptor && !deletionMode) {
      globalThis.alert?.("Este curso não pode ser excluído.");
      return;
    }
    if (!descriptor && !course && !workspaceRef) return;
    try {
      if (workspaceRef) {
        assertCourseCapability(
          "canDeleteCourse",
          resolvedCourseKey,
          ["pending", "conflict"].includes(workspaceRef.authoringStatus)
            ? "Resolva ou sincronize as edições textuais antes de excluir este workspace."
            : "A exclusão deste workspace não está disponível."
        );
      } else {
        await assertNoContextualAuthoringPending(resolvedCourseKey);
      }
    } catch (error) {
      globalThis.alert?.(error instanceof Error ? error.message : "O curso possui edições pendentes.");
      return;
    }
    const courseTitle = descriptor?.title || course?.title || "Curso";
    let confirmationMessage;
    try {
      if (deletionMode === "catalog") {
        confirmationMessage = `Retirar o curso oficial "${courseTitle}" de Coleções?`;
      } else if (deletionMode === "private-published") {
        confirmationMessage = `Excluir o curso privado "${courseTitle}" de Trilhas?`;
      } else if (workspaceRef) {
        confirmationMessage = `Excluir o curso em construção "${courseTitle}"?`;
      } else {
        confirmationMessage = courseRemovalConfirmation(
          storage,
          resolvedCourseKey,
          courseTitle
        );
      }
    } catch (error) {
      globalThis.alert?.(error instanceof Error ? error.message : "Não foi possível identificar o curso.");
      return;
    }
    if (
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(confirmationMessage)
    ) return;
    state.entityMutationSaving = true;
    let remoteRemovalCommitted = false;
    let reconciliationWarningShown = false;
    let nextSnapshot = null;
    try {
      if (deletionMode === "catalog") {
        nextSnapshot = await homeTrailsController.deleteFromCatalog(trailItemId);
      } else if (deletionMode === "private-published") {
        nextSnapshot = await homeTrailsController.removeFromTrails(trailItemId);
      } else if (workspaceRef) {
        const remove = workspaceCourseHook("deleteCourse");
        if (!remove) throw new Error("A exclusão deste curso não está disponível.");
        await remove({ courseRef: workspaceRef });
      } else {
        if (!contextualAuthoringIsAvailable()) throw new Error("A exclusão precisa de conexão.");
        await deleteIntegratedCourse({
          ...contextualAuthoring,
          storage,
          courseKey: resolvedCourseKey,
          refreshTrails: () => refreshHomeTrails()
        });
      }
      remoteRemovalCommitted = true;
    } catch (error) {
      if (courseRemovalWasCommitted(error)) {
        remoteRemovalCommitted = true;
        reconciliationWarningShown = true;
        globalThis.alert?.(error.message);
      } else {
        globalThis.alert?.(error instanceof Error ? error.message : "Não foi possível excluir o curso.");
      }
    }
    try {
      if (!remoteRemovalCommitted) return;
      if (descriptor) {
        const itemStillVisible = nextSnapshot?.items?.some((item) =>
          item.itemId === descriptor.itemId
        ) === true;
        if (!itemStillVisible) {
          await clearTrailPersonalStorage([descriptor.itemId]);
          homeTrailsController.loadedCourses.delete(descriptor.itemId);
          homeTrailsController.courseRefs.delete(descriptor.itemId);
        }
        if (nextSnapshot) {
          state.homeTrailSnapshot = nextSnapshot;
          state.homeSelectedTrailItemId = homeTrailsController.selectedItemId;
          const selectedItem = homeTrailsController.item();
          state.homeSelectedCourseKey = homeTrailsController.courseRefs
            .get(state.homeSelectedTrailItemId)?.courseKey ||
            selectedItem?.courseKey || selectedItem?.courseId || "";
        } else {
          await refreshHomeTrails();
        }
        setProject(composeLoadedWorkspaceCourses(storage.loadProject()));
      } else if (workspaceRef) {
        homeTrailsController.loadedCourses.delete(workspaceRef.trailItemId);
        homeTrailsController.courseRefs.delete(workspaceRef.trailItemId);
        await refreshHomeTrails();
        setProject(composeLoadedWorkspaceCourses(storage.loadProject()));
      } else {
        setProject(storage.loadProject());
      }
      selectFirstPath(state.project);
      state.view = "courses";
    } catch (error) {
      if (!reconciliationWarningShown) {
        globalThis.alert?.(new CourseRemovalCommittedError(resolvedCourseKey, error).message);
      }
    } finally {
      state.entityMutationSaving = false;
      render({ preserveState: false });
    }
  }

  async function removeHomeTrailItem(trailItemId) {
    const item = homeTrailsController?.item(trailItemId);
    if (!item?.canRemove || state.homeOrganization.busy) return;
    const courseRef = homeTrailsController.courseRefs.get(trailItemId);
    try {
      if (["pending", "conflict"].includes(courseRef?.authoringStatus)) {
        throw new Error(
          "Sincronize ou resolva primeiro as edições textuais pendentes antes de retirar o curso."
        );
      }
      if (!courseRef?.workspaceId) {
        await assertNoContextualAuthoringPending(
          courseRef?.courseKey || item.courseKey || item.courseId
        );
      }
    } catch (error) {
      state.homeOrganization.error = error instanceof Error
        ? error.message
        : "Há edições textuais pendentes neste curso.";
      render({ preserveState: true });
      return;
    }
    if (typeof globalThis.confirm === "function" &&
        !globalThis.confirm(`Retirar "${item.title}" de Trilhas?`)) return;
    state.homeOrganization.busy = true;
    state.homeOrganization.error = "";
    render({ preserveState: true });
    try {
      const snapshot = await homeTrailsController.removeFromTrails(trailItemId);
      if (!snapshot.items.some((candidate) => candidate.itemId === trailItemId)) {
        await clearTrailPersonalStorage([trailItemId]);
      }
      state.homeTrailSnapshot = snapshot;
      state.homeSelectedTrailItemId = homeTrailsController.selectedItemId;
      state.homeSelectedCourseKey = homeTrailsController.courseRefs
        .get(state.homeSelectedTrailItemId)?.courseKey ||
        homeTrailsController.item()?.courseKey || homeTrailsController.item()?.courseId || "";
      setProject(composeLoadedWorkspaceCourses(storage.loadProject()));
    } catch (error) {
      state.homeOrganization.error = error instanceof Error
        ? error.message
        : "Não foi possível retirar o curso de Trilhas.";
    } finally {
      state.homeOrganization.busy = false;
      render({ preserveState: true });
    }
  }

  async function deleteEntityDirect(target) {
    if (!target || state.entityMutationSaving) return;
    const course = findCourse(state.project, target.courseKey);
    const entity = target.level === "module"
      ? findModule(state.project, target.courseKey, target.moduleKey)
      : target.level === "lesson"
        ? findLesson(state.project, target.courseKey, target.moduleKey, target.lessonKey)
        : target.level === "microsequence"
          ? findMicrosequence(
            state.project,
            target.courseKey,
            target.moduleKey,
            target.lessonKey,
            target.microsequenceKey
          )
          : (findMicrosequence(
              state.project,
              target.courseKey,
              target.moduleKey,
              target.lessonKey,
              target.microsequenceKey
            )?.cards || []).find((card) => card.id === target.cardKey);
    if (!course || !entity) return;
    let capabilities;
    try {
      capabilities = assertCourseCapability(
        "canDeleteEntity",
        target.courseKey,
        "A exclusão desta parte não está disponível."
      );
    } catch (error) {
      state.entityMutationError = error instanceof Error
        ? error.message
        : "A exclusão desta parte não está disponível.";
      render({ preserveState: true });
      return;
    }
    if (
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(`Excluir "${entity.title || "Parte"}" e todo o seu conteúdo?`)
    ) return;
    state.entityMutationSaving = true;
    try {
      const workspaceRef = capabilities.workspaceRef;
      const entityPath = [
        target.courseKey,
        target.moduleKey,
        ...(["lesson", "microsequence", "card"].includes(target.level) ? [target.lessonKey] : []),
        ...(["microsequence", "card"].includes(target.level) ? [target.microsequenceKey] : []),
        ...(target.level === "card" ? [target.cardKey] : [])
      ];
      if (workspaceRef) {
        const remove = workspaceCourseHook("deleteEntity");
        if (!remove) throw new Error("A exclusão desta parte não está disponível.");
        const deleted = await remove({
          courseRef: workspaceRef,
          entityType: target.level,
          entityPath
        });
        if (Number.isSafeInteger(Number(deleted?.revision))) {
          homeTrailsController.updateCourseRef(workspaceRef.trailItemId, {
            revision: Number(deleted.revision)
          });
        }
        await refreshWorkspaceCourseDocument(workspaceRef);
        await refreshHomeTrails();
      } else {
        if (!contextualAuthoringIsAvailable()) throw new Error("A exclusão precisa de conexão.");
        await assertNoContextualAuthoringPending(target.courseKey);
        await deleteIntegratedEntity({
          ...contextualAuthoring,
          storage,
          courseKey: target.courseKey,
          entityType: target.level,
          entityPath,
          title: course.title
        });
        setProject(storage.loadProject());
      }
      applySelectionByKeys(state.project, state.selection) || selectFirstPath(state.project);
      state.inlineStructureEditor = null;
    } catch (error) {
      globalThis.alert?.(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      state.entityMutationSaving = false;
      render({ preserveState: false });
    }
  }

  function updateMicrosequenceDraft(payload) {
    const microsequenceKey = state.selection.microsequenceKey;
    if (!microsequenceKey) return;

    try {
      const nextProject = editor.updateMicrosequence({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey,
        title: payload.title
      });

      setProject(nextProject);

    } catch {
      // Evita quebrar a digitação durante estados transitórios inválidos.
    }
  }

  function autosizeTextGapField(node) {
    if (!node || (node.tagName !== "TEXTAREA" && node.tagName !== "INPUT")) {
      return;
    }
    const value = String(node.value || "");
    const longestLine = value.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
    node.style.width = `${Math.max(1, longestLine || 1)}ch`;
    if (node.tagName === "TEXTAREA") {
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    }
  }

  function normalizeTextGapContentEditableValue(node) {
    if (!node) return "";
    const raw = String(node.textContent || "")
      .replace(/[\u00a0\u2007]/g, " ")
      .replace(/[\r\n]+/g, "");
    // A resposta pode conter espacos internos significativos, sobretudo em codigo.
    return raw.trim();
  }

  function getCurrentPackageFeedbackEntry(card = getRenderContext().card) {
    const popupEntry = getPackageFeedbackEntry(card);
    if (!popupEntry) {
      return null;
    }

    return {
      ...popupEntry,
      blockKey: `${buildCardPathKey(state.selection)}::${popupEntry.index}`
    };
  }

  function getCurrentCardChoiceResponse(card = getRenderContext().card) {
    const entry = getPackageResponseEntry(card, buildCardPathKey(state.selection));
    return entry?.instance?.package === "aralearn.response.choice" ? [entry] : [];
  }

  function getCurrentCardGapResponse(card = getRenderContext().card) {
    const entry = getPackageResponseEntry(card, buildCardPathKey(state.selection));
    return entry?.instance?.package === "aralearn.response.gap" ? [entry] : [];
  }

  function getCurrentCardOrderingResponse(card = getRenderContext().card) {
    const entry = getPackageResponseEntry(card, buildCardPathKey(state.selection));
    return entry?.instance?.package === "aralearn.response.ordering" ? [entry] : [];
  }

  function getCurrentCardMatchingResponse(card = getRenderContext().card) {
    const entry = getPackageResponseEntry(card, buildCardPathKey(state.selection));
    return entry?.instance?.package === "aralearn.response.matching" ? [entry] : [];
  }

  function getCurrentChoiceEntry(blockKey) {
    return (
      [
        ...getCurrentCardChoiceResponse()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getCurrentCompleteEntry(blockKey) {
    return (
      [
        ...getCurrentCardGapResponse()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function ensureCurrentChoiceExerciseState() {
    const choices = getCurrentCardChoiceResponse();
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      responseStateByBlockKey: {},
      exerciseShuffleSeed: `${buildCardPathKey(state.selection)}::load::${state.cardExerciseLoadVersion}`
    };

    choices.forEach((entry) => {
      const current = state.responseExerciseByBlockKey[entry.blockKey];
      const selected = Array.isArray(current?.selected)
        ? current.selected.map((item) => {
            if (Number.isInteger(item)) {
              const options = Array.isArray(entry.block?.options) ? entry.block.options : [];
              return item >= 0 && item < options.length ? getExerciseOptionStableId(options[item], item) : null;
            }
            const value = String(item || "").trim();
            return value || null;
          }).filter(Boolean)
        : [];
      state.responseExerciseByBlockKey[entry.blockKey] = {
        selected,
        feedback: current?.feedback || null
      };
      runtimeOptions.responseStateByBlockKey[entry.blockKey] = state.responseExerciseByBlockKey[entry.blockKey];
    });

    return runtimeOptions;
  }

  function ensureCurrentCompleteExerciseState() {
    const completes = getCurrentCardGapResponse();
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      responseStateByBlockKey: {}
    };

    completes.forEach((entry) => {
      const current = state.responseExerciseByBlockKey[entry.blockKey];
      state.responseExerciseByBlockKey[entry.blockKey] = {
        values: Array.isArray(current?.values) ? current.values : [],
        feedback: current?.feedback || null
      };
      runtimeOptions.responseStateByBlockKey[entry.blockKey] = state.responseExerciseByBlockKey[entry.blockKey];
    });

    return runtimeOptions;
  }

  function ensureCurrentOrderingExerciseState() {
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      responseStateByBlockKey: {}
    };
    getCurrentCardOrderingResponse().forEach((entry) => {
      const current = state.responseExerciseByBlockKey[entry.blockKey];
      const itemIds = Array.isArray(entry.block?.items)
        ? entry.block.items.map(({ id }) => String(id))
        : [];
      let order = Array.isArray(current?.order) ? current.order.slice() : [];
      if (order.length !== itemIds.length || order.some((id) => !itemIds.includes(id))) {
        order = itemIds.length > 1 ? [...itemIds.slice(1), itemIds[0]] : itemIds;
      }
      state.responseExerciseByBlockKey[entry.blockKey] = {
        order,
        feedback: current?.feedback || null
      };
      runtimeOptions.responseStateByBlockKey[entry.blockKey] = state.responseExerciseByBlockKey[entry.blockKey];
    });
    return runtimeOptions;
  }

  function ensureCurrentMatchingExerciseState() {
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      responseStateByBlockKey: {}
    };
    getCurrentCardMatchingResponse().forEach((entry) => {
      const current = state.responseExerciseByBlockKey[entry.blockKey];
      const leftIds = new Set((entry.block?.leftItems || []).map(({ id }) => String(id)));
      const matches = Object.fromEntries(Object.entries(current?.matches || {})
        .filter(([leftId]) => leftIds.has(leftId))
        .map(([leftId, rightId]) => [leftId, String(rightId)]));
      state.responseExerciseByBlockKey[entry.blockKey] = {
        matches,
        feedback: current?.feedback || null
      };
      runtimeOptions.responseStateByBlockKey[entry.blockKey] = state.responseExerciseByBlockKey[entry.blockKey];
    });
    return runtimeOptions;
  }

  function setChoiceSelection(blockKey, optionId, checked) {
    const entry = getCurrentChoiceEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
    const selected = new Set(Array.isArray(exercise.selected) ? exercise.selected : []);
    const normalizedOptionId = String(optionId || "").trim();
    if (!normalizedOptionId) {
      return;
    }

    if (checked && entry.block?.selectionMode === "single") {
      selected.clear();
      selected.add(normalizedOptionId);
    } else if (checked) {
      selected.add(normalizedOptionId);
    } else {
      selected.delete(normalizedOptionId);
    }

    state.responseExerciseByBlockKey[blockKey] = {
      selected: Array.from(selected),
      feedback: null
    };

    render({ preserveState: true });
  }

  function tryAgainChoice(blockKey) {
    ensureCurrentChoiceExerciseState();
    if (!state.responseExerciseByBlockKey[blockKey]) {
      return;
    }
    state.responseExerciseByBlockKey[blockKey] = {
      selected: [],
      feedback: null
    };
    render({ preserveState: true });
  }

  function viewAnswerChoice(blockKey) {
    const entry = getCurrentChoiceEntry(blockKey);
    if (!entry) {
      return;
    }

    const correct = getCorrectExerciseOptionIds(entry.block?.options, entry.block?.answerIds);

    ensureCurrentChoiceExerciseState();
    state.responseExerciseByBlockKey[blockKey] = {
      selected: correct,
      feedback: "correct"
    };
    render({ preserveState: true });
  }

  function validateChoice(blockKey, { renderCorrect = true } = {}) {
    const entry = getCurrentChoiceEntry(blockKey);
    if (!entry) {
      return null;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
    const selected = new Set(Array.isArray(exercise.selected) ? exercise.selected : []);
    if (!selected.size) {
      state.responseExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Selecione pelo menos uma resposta.");
      focusFirstIncompleteChoice(blockKey);
      render({ preserveState: true });
      return "incomplete";
    }

    const ok = RESOURCE_PACKAGE_REGISTRY.evaluateResponse(entry.instance, {
      selectedIds: [...selected]
    }).correct;

    state.responseExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    if (!ok || renderCorrect) {
      render({ preserveState: true });
    }
    return ok ? "correct" : "wrong";
  }

  function setCompleteBlank(blockKey, blankIndex, value, { rerender = false } = {}) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentCompleteExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const index = Number.parseInt(String(blankIndex), 10);
    if (!Number.isFinite(index) || index < 0) {
      return;
    }

    const values = Array.isArray(exercise.values) ? exercise.values.slice() : [];
    while (values.length <= index) {
      values.push("");
    }
    values[index] = String(value ?? "");
    const hadFeedback = exercise.feedback !== null;
    state.responseExerciseByBlockKey[blockKey] = { values, feedback: null };
    if (rerender) {
      render({ preserveState: true });
      return;
    }
    if (hadFeedback) {
      root.querySelectorAll("[data-complete-feedback-block-key]").forEach((node) => {
        if (node.getAttribute("data-complete-feedback-block-key") === blockKey) {
          node.remove();
        }
      });
    }
  }

  function openTextGapChoicePrompt(blockKey, blankIndex) {
    ensureCurrentCompleteExerciseState();
    const currentExercise = state.responseExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const currentValues = Array.isArray(currentExercise.values) ? currentExercise.values : [];
    const numericBlankIndex = Number(blankIndex);
    if (String(currentValues[numericBlankIndex] ?? "").trim()) {
      setCompleteBlank(blockKey, numericBlankIndex, "", { rerender: false });
      state.activeTextGapPrompt = null;
      render({ preserveState: true });
      return;
    }
    if (currentExercise.feedback) {
      state.responseExerciseByBlockKey[blockKey] = {
        values: currentValues.slice(),
        feedback: null
      };
    }
    state.activeTextGapPrompt = {
      blockKey,
      blankIndex: numericBlankIndex
    };
    render({ preserveState: true });
  }

  function setTextGapChoice(blockKey, blankIndex, value) {
    setCompleteBlank(blockKey, blankIndex, value, { rerender: false });
    state.activeTextGapPrompt = null;
    render({ preserveState: true });
  }

  function tryAgainComplete(blockKey) {
    ensureCurrentCompleteExerciseState();
    if (!state.responseExerciseByBlockKey[blockKey]) {
      return;
    }
    state.responseExerciseByBlockKey[blockKey] = { values: [], feedback: null };
    if (state.activeTextGapPrompt?.blockKey === blockKey) {
      state.activeTextGapPrompt = null;
    }
    render({ preserveState: true });
  }

  function viewAnswerComplete(blockKey) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return;
    }

    const answers = (entry.block?.blanks || []).map((blank) => String(blank?.answer || ""));

    ensureCurrentCompleteExerciseState();
    state.responseExerciseByBlockKey[blockKey] = { values: answers, feedback: "correct" };
    if (state.activeTextGapPrompt?.blockKey === blockKey) {
      state.activeTextGapPrompt = null;
    }
    render({ preserveState: true });
  }

  function validateComplete(blockKey, { renderCorrect = true } = {}) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return null;
    }

    ensureCurrentCompleteExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const values = Array.isArray(exercise.values) ? exercise.values : [];
    const blanks = Array.isArray(entry.block?.blanks) ? entry.block.blanks : [];
    const answers = blanks.map((blank) => String(blank?.answer || ""));

    if (!answers.length) {
      state.responseExerciseByBlockKey[blockKey] = { ...exercise, feedback: "correct" };
      if (renderCorrect) {
        render({ preserveState: true });
      }
      return "correct";
    }

    const normalizedValues = answers.map((_, idx) => String(values[idx] ?? "").normalize("NFC").trim());
    if (normalizedValues.some((value) => !value)) {
      state.responseExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Preencha todas as lacunas.");
      focusFirstIncompleteTextGap(blockKey);
      render({ preserveState: true });
      return "incomplete";
    }

    const evaluation = RESOURCE_PACKAGE_REGISTRY.evaluateResponse(entry.instance, {
      values: Object.fromEntries(blanks.map((blank, index) => [blank.id, normalizedValues[index]]))
    });
    const ok = evaluation.correct;
    state.responseExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    if (!ok || renderCorrect) {
      render({ preserveState: true });
    }
    return ok ? "correct" : "wrong";
  }

  function getCurrentOrderingEntry(blockKey) {
    return getCurrentCardOrderingResponse().find((entry) => entry.blockKey === blockKey) || null;
  }

  function moveOrderingItem(blockKey, itemId, direction) {
    const entry = getCurrentOrderingEntry(blockKey);
    if (!entry) return;
    ensureCurrentOrderingExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey];
    const order = exercise.order.slice();
    const index = order.indexOf(itemId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    state.responseExerciseByBlockKey[blockKey] = { order, feedback: null };
    render({ preserveState: true });
  }

  function validateOrdering(blockKey, { renderCorrect = true } = {}) {
    const entry = getCurrentOrderingEntry(blockKey);
    if (!entry) return null;
    ensureCurrentOrderingExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey];
    const evaluation = RESOURCE_PACKAGE_REGISTRY.evaluateResponse(entry.instance, {
      order: exercise.order
    });
    state.responseExerciseByBlockKey[blockKey] = {
      ...exercise,
      feedback: evaluation.correct ? "correct" : "wrong"
    };
    if (!evaluation.correct || renderCorrect) render({ preserveState: true });
    return evaluation.correct ? "correct" : "wrong";
  }

  function viewOrderingAnswer(blockKey) {
    const entry = getCurrentOrderingEntry(blockKey);
    if (!entry) return;
    state.responseExerciseByBlockKey[blockKey] = {
      order: entry.block.answerOrder.slice(),
      feedback: "correct"
    };
    render({ preserveState: true });
  }

  function tryOrderingAgain(blockKey) {
    const entry = getCurrentOrderingEntry(blockKey);
    if (!entry) return;
    const itemIds = entry.block.items.map(({ id }) => String(id));
    state.responseExerciseByBlockKey[blockKey] = {
      order: itemIds.length > 1 ? [...itemIds.slice(1), itemIds[0]] : itemIds,
      feedback: null
    };
    render({ preserveState: true });
  }

  function getCurrentMatchingEntry(blockKey) {
    return getCurrentCardMatchingResponse().find((entry) => entry.blockKey === blockKey) || null;
  }

  function setMatchingValue(blockKey, leftId, rightId) {
    const entry = getCurrentMatchingEntry(blockKey);
    if (!entry) return;
    ensureCurrentMatchingExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey];
    state.responseExerciseByBlockKey[blockKey] = {
      matches: { ...exercise.matches, [leftId]: String(rightId || "") },
      feedback: null
    };
    render({ preserveState: true });
  }

  function validateMatching(blockKey, { renderCorrect = true } = {}) {
    const entry = getCurrentMatchingEntry(blockKey);
    if (!entry) return null;
    ensureCurrentMatchingExerciseState();
    const exercise = state.responseExerciseByBlockKey[blockKey];
    const leftIds = (entry.block.leftItems || []).map(({ id }) => String(id));
    if (leftIds.some((id) => !String(exercise.matches[id] || ""))) {
      state.responseExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Complete todos os encaixes.");
      render({ preserveState: true });
      return "incomplete";
    }
    const evaluation = RESOURCE_PACKAGE_REGISTRY.evaluateResponse(entry.instance, {
      matches: exercise.matches
    });
    state.responseExerciseByBlockKey[blockKey] = {
      ...exercise,
      feedback: evaluation.correct ? "correct" : "wrong"
    };
    if (!evaluation.correct || renderCorrect) render({ preserveState: true });
    return evaluation.correct ? "correct" : "wrong";
  }

  function viewMatchingAnswer(blockKey) {
    const entry = getCurrentMatchingEntry(blockKey);
    if (!entry) return;
    state.responseExerciseByBlockKey[blockKey] = {
      matches: Object.fromEntries(entry.block.answerPairs.map(({ leftId, rightId }) => [leftId, rightId])),
      feedback: "correct"
    };
    render({ preserveState: true });
  }

  function tryMatchingAgain(blockKey) {
    if (!getCurrentMatchingEntry(blockKey)) return;
    state.responseExerciseByBlockKey[blockKey] = { matches: {}, feedback: null };
    render({ preserveState: true });
  }

  function ensureCurrentPackageCardOptions() {
    const choiceOptions = ensureCurrentChoiceExerciseState();
    const completeOptions = ensureCurrentCompleteExerciseState();
    const orderingOptions = ensureCurrentOrderingExerciseState();
    const matchingOptions = ensureCurrentMatchingExerciseState();
    return {
      blockKeyPrefix: buildCardPathKey(state.selection),
      responseStateByBlockKey: {
        ...(choiceOptions.responseStateByBlockKey || {}),
        ...(completeOptions.responseStateByBlockKey || {}),
        ...(orderingOptions.responseStateByBlockKey || {}),
        ...(matchingOptions.responseStateByBlockKey || {})
      },
      activeTextGapPrompt: state.activeTextGapPrompt,
      exerciseShuffleSeed: choiceOptions.exerciseShuffleSeed || "package"
    };
  }

  function getRenderContext() {
    const course = findCourse(state.project, state.selection.courseKey);
    const moduleValue = findModule(state.project, state.selection.courseKey, state.selection.moduleKey);
    const lesson = findLesson(state.project, state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey);
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    const cards = microsequence ? getActiveMicrosequenceCards(state.selection) : [];
    const card = microsequence ? findSelectedCard(microsequence, state.selection) || cards[0] || null : null;
    return { course, moduleValue, lesson, microsequence, cards, card };
  }

  function getBottomUpUiContext(level) {
    const context = getRenderContext();
    if (level === "lesson") {
      return {
        level,
        selection: state.selection,
        containerId: context.lesson?.id || "",
        itemIds: (context.lesson?.microsequences || []).map((item) => item.id)
      };
    }
    return {
      level: "microsequence",
      selection: state.selection,
      containerId: context.microsequence?.id || "",
      itemIds: (context.microsequence?.cards || []).map((item) => item.id)
    };
  }

  function openInlineStructureEditor(target) {
    if (!target || !["course", "module", "lesson", "microsequence", "card"].includes(target.level)) return;
    if (state.entityMutationSaving) return;
    if (isSameStructurePayload(state.inlineStructureEditor, target)) {
      closeInlineStructureEditor();
      return;
    }
    try {
      assertCourseCapability(
        "canEditMetadata",
        target.courseKey,
        "A edição de títulos e descrições não está disponível para este curso."
      );
    } catch (error) {
      state.entityMutationError = error instanceof Error ? error.message : "Este conteúdo não pode ser alterado.";
      render({ preserveState: true });
      return;
    }
    state.inlineStructureEditor = { ...target };
    state.entityMutationError = "";
    queueAuthoringFocus("inline-structure-title");
    render({ preserveState: true });
  }

  function closeInlineStructureEditor() {
    if (state.entityMutationSaving) return;
    state.inlineStructureEditor = null;
    state.entityMutationError = "";
    render({ preserveState: true });
  }

  function moveInlineStructureSelection(offset) {
    const target = state.inlineStructureEditor;
    if (!target || state.entityMutationSaving || ![-1, 1].includes(offset)) return;
    const selectedNode = root.querySelector("[data-inline-structure-editor='true']");
    const collectionNode = selectedNode?.parentElement?.closest?.("[data-structure-collection]");
    if (!collectionNode) return;
    const siblings = getStructureCollectionItems(collectionNode, target.level);
    const currentIndex = siblings.indexOf(selectedNode);
    const neighborNode = siblings[currentIndex + offset];
    const neighbor = readStructurePayload(neighborNode);
    if (currentIndex < 0 || !neighbor) return;
    void applyStructureReorder(target, neighbor, offset < 0 ? "before" : "after");
  }

  function syncBottomUpDraft(level) {
    const context = getBottomUpUiContext(level);
    const previousReference = state.bottomUpDraft.assistance?.referenceKey || "";
    const assistance = reconcileBottomUpAssistanceUiState(
      state.bottomUpDraft.assistance,
      context
    );
    if (previousReference && previousReference !== assistance.referenceKey) {
      state.bottomUpDraft.composerOpen = false;
      state.bottomUpDraft.promptText = "";
      state.bottomUpDraft.errorMessage = "";
    }
    state.bottomUpDraft.level = level;
    state.bottomUpDraft.assistance = assistance;
    return { context, assistance };
  }

  function currentStructureEditorTarget(level) {
    const context = getRenderContext();
    const selection = state.selection || {};
    if (level === "course" && context.course) {
      return { level, courseKey: selection.courseKey };
    }
    if (level === "module" && context.moduleValue) {
      return {
        level,
        courseKey: selection.courseKey,
        moduleKey: selection.moduleKey
      };
    }
    if (level === "lesson" && context.lesson) {
      return {
        level,
        courseKey: selection.courseKey,
        moduleKey: selection.moduleKey,
        lessonKey: selection.lessonKey
      };
    }
    if (level === "microsequence" && context.microsequence) {
      return {
        level,
        courseKey: selection.courseKey,
        moduleKey: selection.moduleKey,
        lessonKey: selection.lessonKey,
        microsequenceKey: selection.microsequenceKey
      };
    }
    return null;
  }

  function modeCapability(level, mode) {
    if (mode === "edit") return level === "card" ? "canEditCards" : "canEditMetadata";
    if (mode === "ai") return level === "card" ? "canUseCardAi" : "canUseBottomUpAi";
    return "";
  }

  function modeDeniedMessage(level, mode) {
    if (mode === "ai" && level !== "card" && workspaceCourseRef(state.selection?.courseKey)) {
      return "A assistência por IA neste nível ainda não está disponível para cursos de workspace.";
    }
    if (mode === "ai") return "A assistência por IA não está disponível para este curso.";
    return "Este curso não pode ser alterado nesta conta.";
  }

  function setEntityMode(level, requestedMode, { preserveState = true } = {}) {
    const allowAi = level === "lesson" || level === "microsequence" || level === "card";
    const mode = requestedMode === "edit" || (requestedMode === "ai" && allowAi)
      ? requestedMode
      : "view";
    if (mode !== "view") {
      try {
        assertCourseCapability(
          modeCapability(level, mode),
          state.selection.courseKey,
          modeDeniedMessage(level, mode)
        );
      } catch (error) {
        state.entityModes[level] = "view";
        state.inlineStructureEditor = null;
        state.entityMutationError = error instanceof Error
          ? error.message
          : modeDeniedMessage(level, mode);
        if (level === "card") state.microsequenceMode = "play";
        render({ preserveState });
        return false;
      }
    }
    state.entityModes[level] = mode;
    state.entityMutationError = "";
    if (level !== "card") {
      state.inlineStructureEditor = mode === "edit"
        ? currentStructureEditorTarget(level)
        : null;
      if (state.inlineStructureEditor) queueAuthoringFocus("inline-structure-title");
    }
    if (level === "card") {
      state.microsequenceMode = mode === "view" ? "play" : "assist";
      state.assistDraft.composerOpen = false;
      state.assistDraft.errorMessage = "";
      state.assistDraft.manualEditError = "";
      state.assistDraft.manualDraft = null;
      state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
      if (mode === "edit") {
        const context = getRenderContext();
        if (context.card) {
          state.assistDraft.assistance = toggleCardAssistanceWholeCard(
            state.assistDraft.assistance,
            { selection: state.selection, card: context.card, cards: context.cards }
          );
          queueAuthoringFocus("manual-first-field");
        }
      }
      render({ preserveState });
      return true;
    }
    if (mode === "ai") {
      const context = getBottomUpUiContext(level);
      state.bottomUpDraft = {
        ...state.bottomUpDraft,
        level,
        composerOpen: false,
        assistance: createBottomUpAssistanceUiState(context),
        promptText: "",
        errorMessage: ""
      };
    }
    render({ preserveState });
    return true;
  }

  function markBottomUpSyncPending(
    localState,
    microsequenceIds,
    reference = state.selection,
    baseLesson = null
  ) {
    let nextLocalState = localState;
    for (const microsequenceKey of microsequenceIds) {
      const basePosition = (baseLesson?.microsequences || [])
        .findIndex((item) => item.id === microsequenceKey);
      const baseMicrosequence = basePosition >= 0
        ? baseLesson.microsequences[basePosition]
        : null;
      nextLocalState = markContextualAuthoringSyncPending(
        nextLocalState,
        {
          ...reference,
          microsequenceKey,
          ...(baseMicrosequence
            ? {
                baseCards: structuredClone(baseMicrosequence.cards || []),
                baseMetadata: {
                  title: baseMicrosequence.title || "",
                  goal: baseMicrosequence.goal || "",
                  role: baseMicrosequence.role || "",
                  branchOf: baseMicrosequence.branchOf || null,
                  dependsOn: structuredClone(baseMicrosequence.dependsOn || []),
                  covers: structuredClone(baseMicrosequence.covers || []),
                  checks: structuredClone(baseMicrosequence.checks || []),
                  errors: structuredClone(baseMicrosequence.errors || [])
                },
                basePosition
              }
            : {})
        }
      );
    }
    return nextLocalState;
  }

  function restoreSelectionInsideLesson(reference = state.selection) {
    const lesson = findLesson(
      state.project,
      reference.courseKey,
      reference.moduleKey,
      reference.lessonKey
    );
    if (!lesson) return;
    const selectedMicrosequence = (lesson.microsequences || []).find(
      (item) => item.id === reference.microsequenceKey
    ) || lesson.microsequences?.[0] || null;
    const selectedCard = (selectedMicrosequence?.cards || []).find(
      (item) => item.id === reference.cardKey
    ) || selectedMicrosequence?.cards?.[0] || null;
    state.selection = {
      ...reference,
      microsequenceKey: selectedMicrosequence?.id || null,
      cardKey: selectedCard?.id || null,
      cardIndex: selectedCard
        ? selectedMicrosequence.cards.findIndex((item) => item.id === selectedCard.id)
        : 0
    };
  }

  async function resolveBottomUpProvider() {
    const readiness = await resolveCardAssistanceProviderReadiness({
      selectedModel: state.assistConfig.model,
      providerProtocol: state.assistConfig.providerProtocol,
      customModelId: state.assistConfig.customModelId,
      apiKey: state.assistConfig.apiKey,
      baseUrl: state.assistConfig.baseUrl,
      codexEndpoint: state.assistConfig.codexEndpoint,
      codexToken: state.assistConfig.codexToken,
      providerEndpoint: state.assistConfig.providerEndpoint,
      providerSecret: state.assistConfig.providerSecret,
      provider: assistProvider,
      checkCodexLocalHealth
    });
    if (!readiness.ok) {
      const error = new Error(readiness.error || "Revise a configuração do serviço de linguagem.");
      error.code = "provider_unready";
      throw error;
    }
    return resolveCardAssistanceLaunchConfig({
      selectedModel: state.assistConfig.model,
      apiKey: state.assistConfig.apiKey,
      baseUrl: state.assistConfig.baseUrl,
      didacticProfileId: state.assistConfig.didacticProfileId,
      profileTuning: state.assistConfig.profileTuning,
      codexEndpoint: state.assistConfig.codexEndpoint,
      codexToken: state.assistConfig.codexToken,
      providerProtocol: state.assistConfig.providerProtocol,
      customModelId: state.assistConfig.customModelId,
      providerEndpoint: state.assistConfig.providerEndpoint,
      providerSecret: state.assistConfig.providerSecret,
      provider: assistProvider
    });
  }

  async function submitBottomUpAssistance(level) {
    if (state.bottomUpDraft.isSubmitting) return;
    const { context, assistance } = syncBottomUpDraft(level);
    const scopeInput = bottomUpAssistanceScopeInput(assistance, context);
    const prompt = text(state.bottomUpDraft.promptText);
    if (!scopeInput || !prompt) return;
    state.bottomUpDraft.isSubmitting = true;
    state.bottomUpDraft.errorMessage = "";
    render({ preserveState: true });
    try {
      assertCourseCapability(
        "canUseBottomUpAi",
        state.selection.courseKey,
        modeDeniedMessage(level, "ai")
      );
      if (
        typeof storage.flush !== "function" ||
        typeof storage.createLocalCourseDraftGuard !== "function" ||
        typeof storage.saveProjectWithCardAssistanceState !== "function"
      ) {
        throw new Error("Não foi possível salvar a alteração neste dispositivo.");
      }
      await storage.flush();
      const requestedProjectDocument = structuredClone(state.project);
      const requestedSelection = { ...state.selection };
      const beforeLesson = structuredClone(findLesson(
        requestedProjectDocument,
        requestedSelection.courseKey,
        requestedSelection.moduleKey,
        requestedSelection.lessonKey
      ));
      const guard = requireCardAssistancePersistenceGuard(
        await storage.createLocalCourseDraftGuard(requestedSelection.courseKey),
        requestedSelection.courseKey
      );
      const scope = await buildBottomUpAssistanceScope({
        projectDocument: requestedProjectDocument,
        selection: requestedSelection,
        ...scopeInput
      });
      const launch = await resolveBottomUpProvider();
      const result = await executeBottomUpAssistance({
        scope,
        projectDocument: requestedProjectDocument,
        prompt,
        provider: launch.provider,
        modelId: launch.modelId,
        didacticProfileId: launch.didacticProfileId,
        didacticPolicy: launch.didacticPolicy
      });
      const afterLesson = findLesson(
        result.projectDocument,
        requestedSelection.courseKey,
        requestedSelection.moduleKey,
        requestedSelection.lessonKey
      );
      const lessonWithCanonicalMicrosequenceDefaults = (lesson) => {
        const normalized = structuredClone(lesson);
        normalized.microsequences = (normalized.microsequences || []).map((microsequence) => ({
          ...microsequence,
          branchOf: microsequence.branchOf || null,
          errors: structuredClone(microsequence.errors || [])
        }));
        return normalized;
      };
      if (canonicalStringify(lessonWithCanonicalMicrosequenceDefaults(beforeLesson)) ===
          canonicalStringify(lessonWithCanonicalMicrosequenceDefaults(afterLesson))) {
        state.bottomUpDraft.promptText = "";
        state.bottomUpDraft.composerOpen = false;
        state.bottomUpDraft.assistance = createBottomUpAssistanceUiState(
          getBottomUpUiContext(level)
        );
        return;
      }
      const changedIds = resolveBottomUpAffectedMicrosequenceIds(
        result,
        beforeLesson,
        afterLesson
      );
      const currentLocalState = state.assistDraft.localStateCourseKey === requestedSelection.courseKey
        ? state.assistDraft.localState
        : await readCardAssistanceLocalState(requestedSelection.courseKey);
      let nextLocalState = setCardAssistanceUndo(
        currentLocalState,
        {
          contract: CARD_ASSISTANCE_UNDO_CONTRACT,
          kind: "lesson",
          ...requestedSelection,
          expectedRevision: guard.expectedRevision,
          affectedMicrosequenceIds: changedIds,
          inversePatch: createContextualAuthoringInversePatch(beforeLesson, afterLesson)
        }
      );
      nextLocalState = markBottomUpSyncPending(
        nextLocalState,
        changedIds,
        requestedSelection,
        beforeLesson
      );
      const saved = await storage.saveProjectWithCardAssistanceState(
        result.projectDocument,
        {
          courseIdentity: requestedSelection.courseKey,
          localState: nextLocalState,
          expectedLocalDraftRevision: guard.expectedRevision
        }
      );
      await storage.flush();
      setProject(saved.projectDocument);
      state.assistDraft.localState = normalizeCardAssistanceLocalState(saved.localState || {});
      state.assistDraft.localStateCourseKey = requestedSelection.courseKey;
      restoreSelectionInsideLesson(requestedSelection);
      invalidateResponseExerciseState();
      await persistProgressReset(
        `lesson:${requestedSelection.courseKey}:${requestedSelection.lessonKey}`,
        () => resetLessonProgress(
          requestedSelection.courseKey,
          requestedSelection.moduleKey,
          requestedSelection.lessonKey
        )
      );
      state.bottomUpDraft.promptText = "";
      state.bottomUpDraft.composerOpen = false;
      state.bottomUpDraft.assistance = createBottomUpAssistanceUiState(
        getBottomUpUiContext(level)
      );
      void attemptContextualAuthoringSync();
    } catch (error) {
      if (
        error?.code === "provider_unready" ||
        error?.category === "auth_error"
      ) openProviderConfig();
      if (error?.code === "local_course_draft_changed") setProject(storage.loadProject());
      state.bottomUpDraft.errorMessage = error instanceof Error
        ? error.message
        : "Não foi possível concluir a alteração.";
    } finally {
      state.bottomUpDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function undoBottomUpAssistance() {
    const undo = state.assistDraft.localState.undo;
    if (!undo || undo.kind !== "lesson" || state.bottomUpDraft.isSubmitting) return;
    if (workspaceCourseRef(undo.courseKey)) {
      state.bottomUpDraft.errorMessage =
        "O desfazer local não pertence a esta composição de workspace.";
      render({ preserveState: true });
      return;
    }
    state.bottomUpDraft.isSubmitting = true;
    state.bottomUpDraft.errorMessage = "";
    try {
      assertCourseAuthoringAllowed(undo.courseKey);
      const nextProject = structuredClone(state.project);
      const moduleValue = findModule(nextProject, undo.courseKey, undo.moduleKey);
      const lessonIndex = (moduleValue?.lessons || []).findIndex(
        (lesson) => lesson.id === undo.lessonKey
      );
      if (lessonIndex < 0) throw new Error("A lição da última alteração não existe mais.");
      const beforeUndoLesson = structuredClone(moduleValue.lessons[lessonIndex]);
      moduleValue.lessons[lessonIndex] = applyContextualAuthoringInversePatch(
        moduleValue.lessons[lessonIndex],
        undo.inversePatch
      );
      let nextLocalState = setCardAssistanceUndo(state.assistDraft.localState, null);
      nextLocalState = markBottomUpSyncPending(
        nextLocalState,
        undo.affectedMicrosequenceIds,
        undo,
        beforeUndoLesson
      );
      const saved = await storage.saveProjectWithCardAssistanceState(nextProject, {
        courseIdentity: undo.courseKey,
        localState: nextLocalState,
        expectedLocalDraftRevision: undo.expectedRevision
      });
      await storage.flush?.();
      setProject(saved.projectDocument);
      state.assistDraft.localState = normalizeCardAssistanceLocalState(saved.localState || {});
      state.assistDraft.localStateCourseKey = undo.courseKey;
      restoreSelectionInsideLesson(undo);
      invalidateResponseExerciseState();
      await persistProgressReset(
        `lesson:${undo.courseKey}:${undo.lessonKey}`,
        () => resetLessonProgress(undo.courseKey, undo.moduleKey, undo.lessonKey)
      );
      void attemptContextualAuthoringSync();
    } catch (error) {
      if (error?.code === "local_course_draft_changed") setProject(storage.loadProject());
      state.bottomUpDraft.errorMessage = error instanceof Error
        ? error.message
        : "Não foi possível desfazer.";
    } finally {
      state.bottomUpDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function saveInlineEntity(target = state.inlineStructureEditor) {
    if (state.entityMutationSaving || !target) return;
    const editorNode = root.querySelector("[data-inline-structure-editor='true']");
    const titleNode = editorNode?.querySelector("[data-field='inline-entity-title']");
    const descriptionNode = editorNode?.querySelector("[data-field='inline-entity-description']");
    const editableText = (node) => text(
      typeof node?.value === "string"
        ? node.value
        : typeof node?.innerText === "string"
          ? node.innerText
          : node?.textContent
    );
    const title = editableText(titleNode);
    const description = editableText(descriptionNode);
    if (!title) {
      state.entityMutationError = "Informe um título.";
      render({ preserveState: true });
      return;
    }
    const level = target.level;
    state.entityMutationSaving = true;
    state.entityMutationError = "";
    try {
      const capabilities = assertCourseCapability(
        target.level === "card" ? "canEditCards" : "canEditMetadata",
        target.courseKey,
        target.level === "card"
          ? "A edição deste card não está disponível para este curso."
          : "A edição de títulos e descrições não está disponível para este curso."
      );
      const workspaceRef = capabilities.workspaceRef;
      const guard = workspaceRef ? null : requireCardAssistancePersistenceGuard(
        await storage.createLocalCourseDraftGuard(target.courseKey),
        target.courseKey
      );
      let nextProject;
      let entityPath;
      let metadata;
      let baseMetadata;
      let baseCards = null;
      if (level === "course") {
        const course = findCourse(state.project, target.courseKey);
        baseMetadata = { title: course?.title || "", goal: course?.goal || "" };
        nextProject = updateCourseDocument(state.project, {
          courseKey: target.courseKey,
          title,
          goal: description
        });
        entityPath = [target.courseKey];
        metadata = { title, goal: description };
      } else if (level === "module") {
        const moduleValue = findModule(state.project, target.courseKey, target.moduleKey);
        baseMetadata = { title: moduleValue?.title || "", goal: moduleValue?.goal || "" };
        nextProject = updateModuleDocument(state.project, {
          courseKey: target.courseKey,
          moduleKey: target.moduleKey,
          title,
          goal: description
        });
        entityPath = [target.courseKey, target.moduleKey];
        metadata = { title, goal: description };
      } else if (level === "lesson") {
        const lesson = findLesson(
          state.project,
          target.courseKey,
          target.moduleKey,
          target.lessonKey
        );
        baseMetadata = { title: lesson?.title || "", goal: lesson?.goal || "" };
        nextProject = updateLessonDocument(state.project, {
          courseKey: target.courseKey,
          moduleKey: target.moduleKey,
          lessonKey: target.lessonKey,
          title,
          goal: description
        });
        entityPath = [
          target.courseKey,
          target.moduleKey,
          target.lessonKey
        ];
        metadata = { title, goal: description };
      } else if (level === "microsequence") {
        const microsequence = findMicrosequence(
          state.project,
          target.courseKey,
          target.moduleKey,
          target.lessonKey,
          target.microsequenceKey
        );
        if (!microsequence) throw new Error("A microssequência não existe mais.");
        baseMetadata = {
          title: microsequence.title || "",
          goal: microsequence.goal || ""
        };
        nextProject = updateMicrosequenceDocument(state.project, {
          courseKey: target.courseKey,
          moduleKey: target.moduleKey,
          lessonKey: target.lessonKey,
          microsequenceKey: target.microsequenceKey,
          title,
          goal: description,
          role: microsequence.role,
          dependsOn: microsequence.dependsOn || [],
          covers: microsequence.covers || [],
          checks: microsequence.checks || []
        });
        entityPath = [
          target.courseKey,
          target.moduleKey,
          target.lessonKey,
          target.microsequenceKey
        ];
        metadata = { title, goal: description };
      } else if (level === "card") {
        const microsequence = findMicrosequence(
          state.project,
          target.courseKey,
          target.moduleKey,
          target.lessonKey,
          target.microsequenceKey
        );
        const card = (microsequence?.cards || []).find((item) =>
          String(item?.id || item?.key || "") === target.cardKey
        );
        if (!card) throw new Error("O card não existe mais.");
        baseCards = structuredClone(microsequence.cards || []);
        nextProject = updateCardDocument(state.project, {
          courseKey: target.courseKey,
          moduleKey: target.moduleKey,
          lessonKey: target.lessonKey,
          microsequenceKey: target.microsequenceKey,
          cardKey: target.cardKey,
          card: { ...card, title }
        });
        entityPath = [
          target.courseKey,
          target.moduleKey,
          target.lessonKey,
          target.microsequenceKey,
          target.cardKey
        ];
        metadata = { title };
      } else {
        throw new Error("O nível de edição não é válido.");
      }
      const nextCards = level === "card"
        ? structuredClone(findMicrosequence(
            nextProject,
            target.courseKey,
            target.moduleKey,
            target.lessonKey,
            target.microsequenceKey
          )?.cards || [])
        : null;
      if (level === "card"
        ? canonicalStringify(baseCards) === canonicalStringify(nextCards)
        : canonicalStringify(baseMetadata) === canonicalStringify(metadata)) {
        state.inlineStructureEditor = null;
        return;
      }
      if (workspaceRef) {
        const draftCourse = structuredClone(findCourse(nextProject, target.courseKey));
        const saved = level === "card"
          ? await workspaceCourseHook("saveMicrosequenceCards")({
              courseRef: workspaceRef,
              draftCourse,
              microsequencePath: entityPath.slice(0, 4),
              baseCards,
              cards: nextCards
            })
          : await workspaceCourseHook("saveMetadata")({
              courseRef: workspaceRef,
              draftCourse,
              entityType: level,
              entityPath,
              baseMetadata,
              metadata
            });
        updateWorkspaceAuthoringReference(workspaceRef, saved);
        if (saved?.pending === true) {
          state.entityMutationError = saved.errorMessage || (
            saved.conflict === true
              ? "A edição foi salva neste dispositivo, mas precisa resolver um conflito antes de sincronizar."
              : "A edição foi salva neste dispositivo e será sincronizada quando a conexão permitir."
          );
        }
        const committedProject = applyWorkspaceAuthoringResult(
          nextProject,
          workspaceRef,
          saved
        );
        setProject(committedProject);
        applySelectionByKeys(committedProject, target);
        if (level === "card") {
          await persistProgressReset(
            `card:${target.courseKey}:${target.cardKey}`,
            () => resetCardProgress(
              target.courseKey,
              target.moduleKey,
              target.lessonKey,
              target.cardKey
            )
          );
          invalidateResponseExerciseState();
        }
        if (saved?.pending !== true) await refreshHomeTrails();
      } else {
        if (level === "card") {
          if (typeof storage.saveProjectWithCardAssistanceState !== "function") {
            throw new Error("Não foi possível salvar a alteração neste dispositivo.");
          }
          const currentLocalState = state.assistDraft.localStateCourseKey === target.courseKey
            ? state.assistDraft.localState
            : await readCardAssistanceLocalState(target.courseKey);
          const beforeMicrosequence = findMicrosequence(
            state.project,
            target.courseKey,
            target.moduleKey,
            target.lessonKey,
            target.microsequenceKey
          );
          const lesson = findLesson(
            state.project,
            target.courseKey,
            target.moduleKey,
            target.lessonKey
          );
          const nextLocalState = markContextualAuthoringSyncPending(
            setCardAssistanceUndo(currentLocalState, null), {
            ...target,
            textOnly: true,
            baseCards,
            baseMetadata: {
              title: beforeMicrosequence?.title || "",
              goal: beforeMicrosequence?.goal || "",
              role: beforeMicrosequence?.role || "",
              branchOf: beforeMicrosequence?.branchOf || null,
              dependsOn: structuredClone(beforeMicrosequence?.dependsOn || []),
              covers: structuredClone(beforeMicrosequence?.covers || []),
              checks: structuredClone(beforeMicrosequence?.checks || []),
              errors: structuredClone(beforeMicrosequence?.errors || [])
            },
            basePosition: Math.max(0, (lesson?.microsequences || [])
              .findIndex((item) => item.id === target.microsequenceKey))
            }
          );
          const saved = await storage.saveProjectWithCardAssistanceState(nextProject, {
            courseIdentity: target.courseKey,
            localState: nextLocalState,
            expectedLocalDraftRevision: guard.expectedRevision
          });
          state.assistDraft.localState = normalizeCardAssistanceLocalState(saved.localState || {});
          state.assistDraft.localStateCourseKey = target.courseKey;
          await persistProgressReset(
            `card:${target.courseKey}:${target.cardKey}`,
            () => resetCardProgress(
              target.courseKey,
              target.moduleKey,
              target.lessonKey,
              target.cardKey
            )
          );
          invalidateResponseExerciseState();
        } else {
          if (typeof storage.saveProjectWithCardAssistanceState !== "function") {
            throw new Error("Não foi possível salvar a alteração neste dispositivo.");
          }
          const currentLocalState = state.assistDraft.localStateCourseKey === target.courseKey
            ? state.assistDraft.localState
            : await readCardAssistanceLocalState(target.courseKey);
          const nextLocalState = markContextualAuthoringMetadataPending(
            setCardAssistanceUndo(currentLocalState, null), {
            entityType: level,
            entityPath,
            baseMetadata,
            metadata
            }
          );
          const saved = await storage.saveProjectWithCardAssistanceState(nextProject, {
            courseIdentity: target.courseKey,
            localState: nextLocalState,
            expectedLocalDraftRevision: guard.expectedRevision
          });
          state.assistDraft.localState = normalizeCardAssistanceLocalState(saved.localState || {});
          state.assistDraft.localStateCourseKey = target.courseKey;
        }
        await storage.flush?.();
        setProject(nextProject);
        void attemptContextualAuthoringSync();
      }
      state.inlineStructureEditor = null;
    } catch (error) {
      if (error?.code === "local_course_draft_changed") setProject(storage.loadProject());
      state.entityMutationError = error instanceof Error ? error.message : "Não foi possível salvar.";
    } finally {
      state.entityMutationSaving = false;
      render({ preserveState: true });
    }
  }

  function syncCardStripScroller({ keepActiveCardInView = false } = {}) {
    const strip = root.querySelector("[data-card-strip='true']");
    if (!strip) {
      return;
    }

    const shell = strip.closest("[data-card-strip-shell='true']");
    const prevArrow = root.querySelector("[data-action='scroll-card-strip-prev']");
    const nextArrow = root.querySelector("[data-action='scroll-card-strip-next']");
    const activeCard = strip.querySelector("[data-action='open-card'].active");

    requestAnimationFrame(() => {
      if (keepActiveCardInView && activeCard) {
        const visibleLeft = strip.scrollLeft;
        const visibleRight = visibleLeft + strip.clientWidth;
        const cardLeft = activeCard.offsetLeft;
        const cardRight = cardLeft + activeCard.offsetWidth;
        const inset = 12;

        if (cardLeft < visibleLeft + inset) {
          strip.scrollTo({ left: Math.max(0, cardLeft - inset), behavior: "auto" });
        } else if (cardRight > visibleRight - inset) {
          strip.scrollTo({ left: Math.max(0, cardRight - strip.clientWidth + inset), behavior: "auto" });
        }
      }

      const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const canScroll = maxScrollLeft > 4;
      const canScrollPrev = canScroll && strip.scrollLeft > 4;
      const canScrollNext = canScroll && strip.scrollLeft < maxScrollLeft - 4;

      if (shell) {
        shell.setAttribute("data-card-strip-overflowing", canScroll ? "true" : "false");
      }
      if (prevArrow) {
        prevArrow.hidden = !canScrollPrev;
      }
      if (nextArrow) {
        nextArrow.hidden = !canScrollNext;
      }
    });
  }

  function scrollCardStrip(direction) {
    const strip = root.querySelector("[data-card-strip='true']");
    if (!strip) {
      return;
    }

    const step = Math.max(160, Math.round(strip.clientWidth * 0.82));
    strip.scrollBy({
      left: step * direction,
      behavior: "smooth"
    });
  }

  function bindCompleteResponseControls(scope) {
    scope.querySelectorAll("[data-action='complete-input']").forEach((node) => {
      if (node.dataset.responseControlBound === "true") return;
      node.dataset.responseControlBound = "true";
      if (node.tagName === "TEXTAREA" || node.tagName === "INPUT") {
        autosizeTextGapField(node);
        node.addEventListener("input", () => {
          const blockKey = node.getAttribute("data-complete-block-key");
          const blankIndex = node.getAttribute("data-complete-blank-index");
          if (!blockKey || blankIndex === null) return;
          autosizeTextGapField(node);
          setCompleteBlank(blockKey, blankIndex, node.value, { rerender: false });
        });
        return;
      }

      if (node.getAttribute("contenteditable") !== "true") return;
      const updateEmptyAttribute = () => {
        const content = String(node.textContent || "").replace(/\u2007/g, "");
        node.setAttribute("data-empty", content.length ? "false" : "true");
      };
      updateEmptyAttribute();
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
      node.addEventListener("beforeinput", (event) => {
        if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
          event.preventDefault();
        }
      });
      node.addEventListener("input", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        const blankIndex = node.getAttribute("data-complete-blank-index");
        if (!blockKey || blankIndex === null) return;
        const normalized = normalizeTextGapContentEditableValue(node);
        node.setAttribute("data-empty", normalized ? "false" : "true");
        setCompleteBlank(blockKey, blankIndex, normalized, { rerender: false });
      });
      node.addEventListener("blur", () => {
        if (!normalizeTextGapContentEditableValue(node)) {
          node.textContent = "";
          node.setAttribute("data-empty", "true");
        }
      });
    });

    scope.querySelectorAll("[data-action='text-gap-open-choice']").forEach((node) => {
      if (node.dataset.responseControlBound === "true") return;
      node.dataset.responseControlBound = "true";
      const openPrompt = () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        const blankIndex = node.getAttribute("data-complete-blank-index");
        if (!blockKey || blankIndex === null) return;
        openTextGapChoicePrompt(blockKey, blankIndex);
      };
      node.addEventListener("click", openPrompt);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPrompt();
        }
      });
    });

    scope.querySelectorAll("[data-action='text-gap-set-choice']").forEach((node) => {
      if (node.dataset.responseControlBound === "true") return;
      node.dataset.responseControlBound = "true";
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        const blankIndex = node.getAttribute("data-complete-blank-index");
        const value = node.getAttribute("data-text-gap-value");
        if (!blockKey || blankIndex === null || value === null) return;
        setTextGapChoice(blockKey, blankIndex, value);
      });
    });
  }

  function render({
    preserveState = true,
    preserveScrollSelectors = null,
    preserveFocus = true
  } = {}) {
    rememberCoursesView();
    const renderState = preserveState
      ? captureRenderState(root, {
          trackedScrollSelectors: Array.isArray(preserveScrollSelectors) ? preserveScrollSelectors : undefined,
          includeFocus: preserveFocus
        })
      : null;
    const context = getRenderContext();
    const rendersPackageCard = state.view === "microsequence";
    const currentPackageCardOptions = rendersPackageCard
      ? ensureCurrentPackageCardOptions()
      : {};
    const needsAllCoursePermissions = state.view === "courses";
    const permissionCourses = needsAllCoursePermissions
      ? state.project.courses || []
      : context.course
        ? [context.course]
        : [];
    const coursePermissionsById = Object.fromEntries(
      permissionCourses.map((course) => [
        course.id,
        courseEditorPermissions(course.id)
      ])
    );
    const currentCoursePermissions = context.course
      ? coursePermissionsById[context.course.id] || courseEditorPermissions(context.course.id)
      : {
          role: "learner",
          canAuthorContent: false,
          canComment: false,
          writeTarget: null,
          canOrganizeSelection: false,
          canRemoveSelection: false,
          canDeleteCourse: false,
          canEdit: false,
          canDelete: false,
          canEditMetadata: false,
          canEditCards: false,
          canUseCardAi: false,
          canUseBottomUpAi: false,
          canMove: false,
          canDeleteEntity: false
        };
    const currentWorkspaceAuthoring = context.course
      ? workspaceAuthoringState(context.course.id)
      : Object.freeze({
          status: "",
          pendingCount: 0,
          errorMessage: "",
          canKeepLocal: false,
          canDiscardLocal: false
        });
    if (rendersPackageCard) {
      state.assistDraft.assistance = reconcileCardAssistanceUiState(
        state.assistDraft.assistance,
        { selection: state.selection, card: context.card, cards: context.cards }
      );
    }
    const cardAssistanceContext = {
      selection: state.selection,
      card: context.card,
      cards: context.cards
    };
    const cardAssistanceRequestReady = canSubmitCardAssistanceRequest({
      promptText: state.assistDraft.promptText,
      isSubmitting: state.assistDraft.isSubmitting,
      selectionReady: cardAssistanceSelectionIsReady(
        state.assistDraft.assistance,
        cardAssistanceContext
      )
    });
    const bottomUpLevel = state.view === "lesson"
      ? "lesson"
      : state.view === "microsequence" && state.microsequenceMode === "overview"
        ? "microsequence"
        : "";
    const bottomUpState = bottomUpLevel
      ? syncBottomUpDraft(bottomUpLevel)
      : null;
    const bottomUpReady = Boolean(
      bottomUpState &&
      text(state.bottomUpDraft.promptText) &&
      bottomUpAssistanceUiSelectionIsReady(
        bottomUpState.assistance,
        bottomUpState.context
      ) &&
      !state.bottomUpDraft.isSubmitting
    );
    root.innerHTML =
      '<div class="app-shell">' +
      renderLessonScreen({
        project: state.project,
        view: state.view,
        activeHomeTab: state.homeTab,
        selection: state.selection,
        course: context.course,
        moduleValue: context.moduleValue,
        lesson: context.lesson,
        microsequence: context.microsequence,
        cards: context.cards,
        card: context.card,
        microsequenceMode: state.microsequenceMode,
        editorSupport: {
          coursePermissions: currentCoursePermissions,
          coursePermissionsById,
          selectedHomeCourseKey: state.homeSelectedCourseKey,
          selectedHomeTrailItemId: state.homeSelectedTrailItemId,
          trailSnapshot: state.homeTrailSnapshot,
          trailLoading: state.homeTrailLoading,
          loadedHomeTrailItemIds: homeTrailsController
            ? [...homeTrailsController.loadedCourses.keys()]
            : [],
          courseKeyByHomeTrailItemId: homeTrailsController
            ? Object.fromEntries([...homeTrailsController.courseRefs].map(([itemId, reference]) =>
                [itemId, reference.courseKey]
              ))
            : {},
          localAuthoringByCourseId: Object.fromEntries(
            [...state.assistDraft.localAuthoringByCourseId.keys()].map((courseKey) => [
              courseKey,
              workspaceAuthoringState(courseKey)
            ])
          ),
          homeOrganization: state.homeOrganization,
          reviewItems: state.view === "courses" ? homeReviewItems() : [],
          progress: activeProgress(
            state.view === "courses" ? state.homeSelectedCourseKey : context.course?.id
          ),
          entityModes: state.entityModes,
          entitySaving: state.entityMutationSaving,
          entityMutationError: state.entityMutationError,
          workspaceAuthoring: currentWorkspaceAuthoring,
          inlineStructureEditor: state.inlineStructureEditor,
          bottomUpAssistance: bottomUpLevel
            ? {
                ...state.bottomUpDraft.assistance,
                composerOpen: state.bottomUpDraft.composerOpen,
                promptText: state.bottomUpDraft.promptText,
                isSubmitting: state.bottomUpDraft.isSubmitting,
                errorMessage:
                  state.bottomUpDraft.errorMessage ||
                  state.assistDraft.syncError ||
                  state.entityMutationError,
                ready: bottomUpReady,
                canUndo: Boolean(
                  !workspaceCourseRef(state.selection.courseKey) &&
                  state.assistDraft.localState.undo?.kind === "lesson" &&
                  state.assistDraft.localState.undo.courseKey === state.selection.courseKey &&
                  state.assistDraft.localState.undo.lessonKey === state.selection.lessonKey
                )
              }
            : null,
          cardAssistanceState: state.assistDraft.assistance,
          cardResourceTargets: rendersPackageCard
            ? listCardResourceTargets(context.card).filter((target) =>
                target.location !== "after_text" || text(context.card?.after).trim()
              )
            : [],
          manualCardEditDraft: state.assistDraft.manualDraft,
          cardAssistanceComposerOpen: state.assistDraft.composerOpen,
          cardAssistanceConversation: normalizeCardAssistanceConversation(
            state.assistDraft.conversationByReferenceKey.get(
              cardAssistanceConversationKey(state.selection)
            ),
            state.selection
          ).turns,
          cardAssistanceRequestReady,
          assistPromptLabel: "O que precisa ser reparado?",
          assistSubmitLabel: "Enviar reparo",
          assistPromptPlaceholder: "Descreva com precisão o problema e o resultado esperado.",
          promptText: state.assistDraft.promptText,
          assistErrorMessage: state.assistDraft.errorMessage || state.assistDraft.syncError,
          manualCardEditError: state.assistDraft.manualEditError,
          hasCardComment: Boolean(
            activeTrailPersonalStorage()?.loadCommentForPath?.(state.selection)
          ),
          cardMarkedForReview: currentCardIsMarkedForReview(),
          canUndoCardEdit: Boolean(
            !workspaceCourseRef(state.selection.courseKey) &&
            state.assistDraft.localState.undo?.kind === "microsequence" &&
            state.assistDraft.localState.undo.courseKey === state.selection.courseKey &&
            state.assistDraft.localState.undo.microsequenceKey === state.selection.microsequenceKey
          ),
          isSubmitting: state.assistDraft.isSubmitting,
          hasApiKey: Boolean(state.assistConfig.apiKey || state.assistConfig.providerSecret),
          packageCardOptions: currentPackageCardOptions,
          continuePopup: {
            open:
              !!state.continuePopup &&
              state.continuePopup.cardPathKey === buildCardPathKey(state.selection),
            blockKey: state.continuePopup?.blockKey || null
          }
        }
      }) +
      (state.cardCommentOpen
        ? renderCardCommentOverlay({
            draft: state.cardCommentDraft,
            exists: state.cardCommentExists,
            error: state.cardCommentError,
            saving: state.cardCommentSaving
          })
        : "") +
      (state.providerConfigOpen
        ? renderProviderConfigOverlay({
            selectedModel: state.assistConfig.model,
            modelOptions: ASSIST_MODEL_OPTIONS,
            apiKey: state.assistConfig.apiKey,
            baseUrl: state.assistConfig.baseUrl || "",
            codexEndpoint: state.assistConfig.codexEndpoint || DEFAULT_CODEX_LOCAL_ENDPOINT,
            codexToken: state.assistConfig.codexToken || "",
            providerProtocol: state.assistConfig.providerProtocol || "",
            customModelId: state.assistConfig.customModelId || "",
            providerEndpoint: state.assistConfig.providerEndpoint || "",
            providerSecret: state.assistConfig.providerSecret || "",
            codexStatus: state.codexCliSetupStatus
          })
        : "") +
      "</div>";

    void RESOURCE_PACKAGE_REGISTRY.hydrate(root)
      .then(() => bindCompleteResponseControls(root))
      .catch((error) => {
        root.dispatchEvent(new CustomEvent("aralearn:package-hydration-error", {
          bubbles: true,
          detail: { error }
        }));
      });

    const manualResourceEditor = root.querySelector(
      ".runtime-resource-edit-target[data-manual-target-id]"
    );
    if (manualResourceEditor) {
      activateManualCardEdit(
        manualResourceEditor,
        state.assistDraft.manualDraft?.targetId === manualResourceEditor.dataset.manualTargetId
          ? state.assistDraft.manualDraft.values
          : null
      );
    }

    if (renderState) {
      restoreRenderState(root, renderState, { restoreFocus: preserveFocus });
    }

    syncCardStripScroller({ keepActiveCardInView: true });
    syncPendingExerciseFocus();
    syncPendingAuthoringFocus();

    root.querySelector("[data-action='go-back']")?.addEventListener("click", () => goBack());
    root.querySelectorAll("[data-action='open-central']").forEach((node) => {
      node.addEventListener("click", () => {
        root.dispatchEvent(new CustomEvent("aralearn:open-library", { bubbles: true }));
      });
    });
    root.querySelectorAll("[data-action='open-home-workspace']").forEach((node) => {
      node.addEventListener("click", () => {
        const workspaceId = node.getAttribute("data-workspace-id") || "";
        if (!workspaceId) return;
        root.dispatchEvent(new CustomEvent("aralearn:open-workspace", {
          bubbles: true,
          detail: { workspaceId }
        }));
      });
    });
    root.querySelectorAll("[data-action='open-context-observation']").forEach((node) => {
      node.addEventListener("click", () => {
        const current = getRenderContext();
        const entityType = state.view === "microsequence" ? "microsequence" : state.view;
        const entityPath = [
          state.selection.courseKey,
          ...(entityType === "course" ? [] : [state.selection.moduleKey]),
          ...(["lesson", "microsequence"].includes(entityType) ? [state.selection.lessonKey] : []),
          ...(entityType === "microsequence" ? [state.selection.microsequenceKey] : [])
        ].filter(Boolean);
        const entity = entityType === "course"
          ? current.course
          : entityType === "module"
            ? current.moduleValue
            : entityType === "lesson"
              ? current.lesson
              : current.microsequence;
        const courseSummary = (storage.loadCourseSummaries?.() || []).find((summary) =>
          [summary?.courseKey, summary?.courseId].some(
            (identity) => String(identity || "") === String(state.selection.courseKey || "")
          )
        );
        root.dispatchEvent(new CustomEvent("aralearn:open-observation", {
          bubbles: true,
          detail: {
            courseKey: state.selection.courseKey,
            courseId: courseSummary?.courseId || "",
            entityType,
            entityPath,
            title: entity?.title || "Parte do curso"
          }
        }));
      });
    });
    root.querySelectorAll("[data-action='open-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const trailItemId = node.getAttribute("data-trail-item-id");
        if (trailItemId && homeTrailsController) {
          const mode = node.getAttribute("data-trail-kind") === "plan" &&
            node.getAttribute("data-can-edit") === "true"
            ? "edit"
            : "view";
          void openHomeTrailCourse(trailItemId, { mode });
          return;
        }
        const courseKey = node.getAttribute("data-course-key");
        if (!courseKey) return;
        openCourse(courseKey);
      });
    });
    root.querySelectorAll("[data-action='reset-course-progress-direct']").forEach((node) => {
      node.addEventListener("click", () => {
        void (async () => {
          if (state.homeTrailLoading) return;
          const courseKey = node.getAttribute("data-course-key");
          const trailItemId = node.getAttribute("data-trail-item-id") || "";
          let course = findCourse(state.project, courseKey);
          if (!course && trailItemId && homeTrailsController) {
            state.homeTrailLoading = true;
            state.homeOrganization.error = "";
            render({ preserveState: true });
            try {
              course = await prepareHomeTrailItem(trailItemId);
            } catch (error) {
              state.homeOrganization.error = error instanceof Error
                ? error.message
                : "Não foi possível abrir o curso.";
              return;
            } finally {
              state.homeTrailLoading = false;
              render({ preserveState: true });
            }
          }
          if (!course) {
            state.homeOrganization.error = "O curso ainda não está disponível neste dispositivo.";
            render({ preserveState: true });
            return;
          }
          if (
            typeof globalThis.confirm === "function" &&
            !globalThis.confirm(`Zerar progresso de todo o curso "${course.title || "Curso"}"?`)
          ) return;
          resetCourseProgress(course.id);
          render({ preserveState: false });
        })();
      });
    });
    root.querySelectorAll("[data-action='reset-entity-progress-direct']").forEach((node) => {
      node.addEventListener("click", () => {
        const target = readStructurePayload(node);
        if (!target) return;
        const labels = {
          module: "módulo",
          lesson: "lição",
          microsequence: "microssequência",
          card: "card"
        };
        if (
          typeof globalThis.confirm === "function" &&
          !globalThis.confirm(`Zerar progresso desta ${labels[target.level] || "parte"}?`)
        ) return;
        if (target.level === "module") {
          resetModuleProgress(target.courseKey, target.moduleKey);
        } else if (target.level === "lesson") {
          resetLessonProgress(target.courseKey, target.moduleKey, target.lessonKey);
        } else if (target.level === "microsequence") {
          resetMicrosequenceProgress(
            target.courseKey,
            target.moduleKey,
            target.lessonKey,
            target.microsequenceKey
          );
        } else if (target.level === "card" && target.cardKey) {
          resetCardProgress(
            target.courseKey,
            target.moduleKey,
            target.lessonKey,
            target.cardKey
          );
        }
        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='delete-course-direct']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key");
        if (!courseKey) return;
        void deleteCourseDirect(courseKey, {
          trailItemId: node.getAttribute("data-trail-item-id") || ""
        });
      });
    });
    root.querySelectorAll("[data-action='remove-home-trail-item']").forEach((node) => {
      node.addEventListener("click", () => {
        const trailItemId = node.getAttribute("data-trail-item-id") || "";
        if (trailItemId) void removeHomeTrailItem(trailItemId);
      });
    });
    root.querySelectorAll("[data-action='delete-entity-direct']").forEach((node) => {
      node.addEventListener("click", () => {
        const target = readStructurePayload(node);
        if (!target || !["module", "lesson", "microsequence", "card"].includes(target.level)) return;
        void deleteEntityDirect(target);
      });
    });

    root.querySelectorAll("[data-action='open-lesson']").forEach((node) => {
      node.addEventListener("click", () => {
        const moduleKey = node.getAttribute("data-module-key");
        const lessonKey = node.getAttribute("data-lesson-key");
        if (!moduleKey || !lessonKey) return;
        openLesson(moduleKey, lessonKey);
      });
    });

    root.querySelectorAll("[data-action='open-module']").forEach((node) => {
      node.addEventListener("click", () => {
        const moduleKey = node.getAttribute("data-module-key");
        if (!moduleKey) return;
        openModule(moduleKey);
      });
    });
    root.querySelector("[data-field='home-course-select']")?.addEventListener("change", (event) => {
      const trailItemId = String(event.currentTarget.value || "");
      if (!selectHomeTrailItem(trailItemId)) return;
      state.homeOrganization.selectedGroupId = groupWithTrailItem(trailItemId)?.id || "";
      render({ preserveState: true });
    });
    root.querySelector("[data-field='home-group-select']")?.addEventListener("change", (event) => {
      const groupId = String(event.currentTarget.value || "");
      const group = groupTrailItems(state.homeTrailSnapshot, { includePlans: true })
        .find((candidate) => candidate.id === groupId);
      if (!group) return;
      state.homeOrganization.selectedGroupId = group.id;
      const firstItem = group.items.find((item) =>
        isStudyableTrailItem(item) || (item.kind === "plan" && item.workspaceId)
      );
      if (firstItem) selectHomeTrailItem(firstItem.itemId);
      else {
        state.inlineStructureEditor = null;
        state.entityMutationError = "";
      }
      render({ preserveState: true });
    });
    root.querySelector("[data-action='start-home-group-create']")?.addEventListener("click", () => {
      state.homeOrganization.creatingGroup = true;
      state.homeOrganization.editingGroupId = "";
      queueAuthoringFocus("home-group-title");
      render({ preserveState: true });
    });
    root.querySelectorAll("[data-action='cancel-home-group-form']").forEach((node) => {
      node.addEventListener("click", () => {
        state.homeOrganization.creatingGroup = false;
        state.homeOrganization.editingGroupId = "";
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='edit-home-group']").forEach((node) => {
      node.addEventListener("click", () => {
        state.homeOrganization.editingGroupId = node.getAttribute("data-group-id") || "";
        state.homeOrganization.creatingGroup = false;
        queueAuthoringFocus("home-group-title");
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-home-group-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        form.querySelector("[data-action='save-home-group']")?.click();
      });
    });
    root.querySelectorAll("[data-action='save-home-group']").forEach((node) => {
      node.addEventListener("click", () => {
        const form = node.closest("[data-home-group-form]");
        const title = String(form?.querySelector("[name='title']")?.value || "").trim();
        if (!title) return;
        const groupId = form?.getAttribute("data-group-id") || "";
        const previousGroupIds = new Set((state.homeTrailSnapshot?.groups || []).map((group) => group.id));
        void mutateHomeTrails(groupId ? "renameGroup" : "createGroup", groupId
          ? { groupId, title }
          : { title }).then((snapshot) => {
          if (!snapshot) return;
          if (groupId) state.homeOrganization.selectedGroupId = groupId;
          else {
            state.homeOrganization.selectedGroupId = snapshot.groups.find((group) =>
              !previousGroupIds.has(group.id)
            )?.id || state.homeOrganization.selectedGroupId;
          }
          state.homeOrganization.creatingGroup = false;
          state.homeOrganization.editingGroupId = "";
          render({ preserveState: true });
        });
      });
    });
    root.querySelectorAll("[data-action='delete-home-group']").forEach((node) => {
      node.addEventListener("click", () => {
        const groupId = node.getAttribute("data-group-id") || "";
        if (!groupId) return;
        if (typeof globalThis.confirm === "function" && !globalThis.confirm("Excluir este grupo? Os itens irão para Outros.")) return;
        void mutateHomeTrails("deleteGroup", { groupId }).then((snapshot) => {
          if (!snapshot) return;
          state.homeOrganization.selectedGroupId = groupTrailItems(snapshot, { includePlans: true })
            .find((group) => group.id === "others")?.id || "";
          render({ preserveState: true });
        });
      });
    });
    root.querySelectorAll("[data-action='choose-home-item-group']").forEach((node) => {
      node.addEventListener("click", () => {
        const trailItemId = node.getAttribute("data-trail-item-id") || "";
        if (!trailItemId || state.homeOrganization.busy) return;
        state.homeOrganization.movingItemId = trailItemId;
        queueAuthoringFocus("home-course-group-target");
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='cancel-home-item-move']").forEach((node) => {
      node.addEventListener("click", () => {
        const trailItemId = node.closest("[data-home-item-move-form]")
          ?.getAttribute("data-home-item-move-form") || state.homeOrganization.movingItemId;
        state.homeOrganization.movingItemId = "";
        queueAuthoringFocus(`home-course-actions:${trailItemId}`);
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-home-item-move-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        form.querySelector("[data-action='save-home-item-group']")?.click();
      });
    });
    root.querySelectorAll("[data-action='save-home-item-group']").forEach((node) => {
      node.addEventListener("click", () => {
        const form = node.closest("[data-home-item-move-form]");
        const trailItemId = form?.getAttribute("data-home-item-move-form") || "";
        const groupId = String(form?.querySelector("[name='groupId']")?.value || "");
        if (!trailItemId || !groupId || state.homeOrganization.busy) return;
        const currentGroupId = form?.getAttribute("data-current-group-id") ||
          groupWithTrailItem(trailItemId)?.id || "others";
        const targetGroupId = groupId === "__others__" ? "others" : groupId;
        if (targetGroupId === currentGroupId) {
          state.homeOrganization.movingItemId = "";
          queueAuthoringFocus(`home-course-actions:${trailItemId}`);
          render({ preserveState: true });
          return;
        }
        void mutateHomeTrails(
          groupId === "__others__" ? "removeItemFromGroup" : "placeItem",
          groupId === "__others__" ? { trailItemId } : { trailItemId, groupId }
        ).then((snapshot) => {
          if (!snapshot) {
            queueAuthoringFocus("home-course-group-target");
            render({ preserveState: true });
            return;
          }
          state.homeOrganization.movingItemId = "";
          state.homeOrganization.selectedGroupId = groupWithTrailItem(trailItemId)?.id || "";
          queueAuthoringFocus(`home-course-actions:${trailItemId}`);
          render({ preserveState: true });
        });
      });
    });
    root.querySelectorAll("[data-action='open-review-card']").forEach((node) => {
      node.addEventListener("click", () => {
        void (async () => {
          const trailItemId = node.getAttribute("data-trail-item-id") || "";
          if (trailItemId && homeTrailsController) {
            if (!homeTrailsController.select(trailItemId)) return;
            state.homeSelectedTrailItemId = trailItemId;
            await prepareHomeTrailItem(trailItemId);
          }
          const entityPath = [
            node.getAttribute("data-course-key"),
            node.getAttribute("data-module-key"),
            node.getAttribute("data-lesson-key"),
            node.getAttribute("data-microsequence-key"),
            node.getAttribute("data-card-key")
          ];
          const selection = resolveExactCardSelection(state.project, entityPath);
          if (!selection) return;
          applySelection(selection);
          state.homeSelectedCourseKey = selection.courseKey;
          openMicrosequenceScreen(selection.microsequenceKey, selection.cardIndex, "play");
        })().catch((error) => {
          state.homeOrganization.error = error instanceof Error
            ? error.message
            : "Não foi possível abrir o card.";
          render({ preserveState: true });
        });
      });
    });

    root.querySelectorAll("[data-action='open-microsequence-overview']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        if (!microsequenceKey) return;
        openMicrosequenceOverview(microsequenceKey);
      });
    });

    root.querySelectorAll("[data-action='open-microsequence-card']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        const index = Number.parseInt(node.getAttribute("data-card-index") || "0", 10);
        if (!microsequenceKey || !Number.isFinite(index)) return;
        openMicrosequenceScreen(microsequenceKey, index, "play");
      });
    });

    root.querySelectorAll("[data-action='open-card']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number.parseInt(node.getAttribute("data-card-index") || "0", 10);
        if (!Number.isFinite(index)) return;
        openCardByIndex(index);
      });
    });
    root.querySelectorAll("[data-action='select-entity-mode']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setEntityMode(
          node.getAttribute("data-entity-level"),
          node.getAttribute("data-entity-mode")
        );
      });
    });
    root.querySelectorAll("[data-action='resolve-workspace-authoring-conflict']").forEach((node) => {
      node.addEventListener("click", () => {
        void resolveWorkspaceAuthoringConflict(node.getAttribute("data-resolution"));
      });
    });
    root.querySelectorAll("[data-action='select-inline-structure-entity']").forEach((node) => {
      const selectTarget = (event) => {
        if (node.getAttribute("aria-disabled") === "true") return;
        if (event.target?.closest?.([
          "button",
          "a",
          "input",
          "textarea",
          "select",
          "[contenteditable='true']",
          "[contenteditable='plaintext-only']"
        ].join(","))) return;
        const target = readStructurePayload(node);
        if (!target) return;
        openInlineStructureEditor(target);
      };
      node.addEventListener("click", selectTarget);
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target?.closest?.("[contenteditable='true'], [contenteditable='plaintext-only']")) return;
        event.preventDefault();
        selectTarget(event);
      });
    });
    root.querySelectorAll("[data-field='inline-entity-title'][contenteditable]").forEach((node) => {
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
      node.addEventListener("beforeinput", (event) => {
        if (["insertParagraph", "insertLineBreak"].includes(event.inputType)) {
          event.preventDefault();
        }
      });
    });
    root.querySelectorAll("[data-action='toggle-bottom-up-container']").forEach((node) => {
      node.addEventListener("click", () => {
        const level = node.getAttribute("data-assistance-level");
        const context = getBottomUpUiContext(level);
        state.bottomUpDraft.assistance = toggleBottomUpAssistanceContainer(
          state.bottomUpDraft.assistance,
          context
        );
        state.bottomUpDraft.errorMessage = "";
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='toggle-bottom-up-item']").forEach((node) => {
      const toggleItem = (event = null) => {
        if (node.getAttribute("aria-disabled") === "true") return;
        if (event?.target?.closest?.("button, a, input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']")) return;
        const level = node.getAttribute("data-assistance-level");
        const context = getBottomUpUiContext(level);
        state.bottomUpDraft.assistance = toggleBottomUpAssistanceItem(
          state.bottomUpDraft.assistance,
          context,
          node.getAttribute("data-assistance-item-id")
        );
        state.bottomUpDraft.errorMessage = "";
        render({ preserveState: true });
      };
      node.addEventListener("click", toggleItem);
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleItem(event);
      });
    });
    root.querySelectorAll("[data-action='toggle-bottom-up-composer']").forEach((node) => {
      node.addEventListener("click", () => {
        const level = node.getAttribute("data-assistance-level");
        if (!level || state.entityModes[level] !== "ai") return;
        state.bottomUpDraft.composerOpen = !state.bottomUpDraft.composerOpen;
        if (state.bottomUpDraft.composerOpen) {
          queueAuthoringFocus("bottom-up-ai-prompt");
        }
        render({ preserveState: true });
      });
    });
    const bottomUpPrompt = root.querySelector("[data-field='bottom-up-assist-prompt']");
    const bottomUpSubmit = root.querySelector("[data-action='submit-bottom-up-assistance']");
    if (bottomUpPrompt) {
      bottomUpPrompt.addEventListener("input", () => {
        state.bottomUpDraft.promptText = bottomUpPrompt.value;
        if (!bottomUpSubmit) return;
        const level = bottomUpSubmit.getAttribute("data-assistance-level");
        const context = getBottomUpUiContext(level);
        const ready = Boolean(
          text(bottomUpPrompt.value) &&
          bottomUpAssistanceUiSelectionIsReady(state.bottomUpDraft.assistance, context) &&
          !state.bottomUpDraft.isSubmitting
        );
        bottomUpSubmit.disabled = !ready;
        bottomUpSubmit.setAttribute("aria-disabled", ready ? "false" : "true");
      });
    }
    bottomUpSubmit?.addEventListener("click", () => {
      void submitBottomUpAssistance(
        bottomUpSubmit.getAttribute("data-assistance-level")
      );
    });
    root.querySelector("[data-action='undo-bottom-up-assistance']")?.addEventListener("click", () => {
      void undoBottomUpAssistance();
    });
    root.querySelector("[data-action='save-inline-entity']")?.addEventListener("click", (event) => {
      void saveInlineEntity(readStructurePayload(event.currentTarget));
    });
    root.querySelector("[data-action='close-inline-structure-entity']")?.addEventListener("click", () => {
      closeInlineStructureEditor();
    });
    root.querySelector("[data-action='move-inline-structure-up']")?.addEventListener("click", () => {
      moveInlineStructureSelection(-1);
    });
    root.querySelector("[data-action='move-inline-structure-down']")?.addEventListener("click", () => {
      moveInlineStructureSelection(1);
    });

    root.querySelector("[data-action='scroll-card-strip-prev']")?.addEventListener("click", () => {
      scrollCardStrip(-1);
    });
    root.querySelector("[data-action='scroll-card-strip-next']")?.addEventListener("click", () => {
      scrollCardStrip(1);
    });
    root.querySelector("[data-card-strip='true']")?.addEventListener("scroll", () => {
      syncCardStripScroller();
    });

    root.querySelector("[data-action='prev-card']")?.addEventListener("click", () => stepCard(-1));
    root.querySelector("[data-action='continue-popup-next']")?.addEventListener("click", continueFromPopup);
    root.querySelector("[data-action='next-card']")?.addEventListener("click", advanceToNextCard);
    root.querySelector("[data-action='close-study']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='go-home']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='open-card-comment']")?.addEventListener("click", () => openCardComment());
    root.querySelector("[data-action='toggle-card-review']")?.addEventListener("click", () => {
      void toggleCurrentCardReviewMark();
    });
    root.querySelectorAll("[data-action='open-microsequence-assist']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key") || state.selection.microsequenceKey;
        const targetIndex = Number.parseInt(node.getAttribute("data-card-index") || String(state.selection.cardIndex || 0), 10);
        if (!microsequenceKey) return;
        openCardAssistanceMode(microsequenceKey, Number.isFinite(targetIndex) ? targetIndex : 0);
      });
    });

    root.querySelectorAll("[data-action='choice-toggle']").forEach((node) => {
      node.addEventListener("click", () => {
        if (node.closest("[data-manual-target-id]")) return;
        const blockKey = node.getAttribute("data-choice-block-key");
        const optionId = node.getAttribute("data-choice-option-id");
        if (!blockKey || optionId === null) return;
      const current = state.responseExerciseByBlockKey[blockKey];
        const selected = Array.isArray(current?.selected) ? current.selected : [];
        const isSelected = selected.includes(optionId);
        setChoiceSelection(blockKey, optionId, !isSelected);
      });
      node.addEventListener("keydown", (event) => {
        if (node.closest("[data-manual-target-id]")) return;
        if (node.getAttribute("role") !== "radio" || !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
          return;
        }
        const list = node.closest("[role='radiogroup']");
        const options = Array.from(list?.querySelectorAll("[data-action='choice-toggle'][role='radio']") || []);
        const currentIndex = options.indexOf(node);
        if (currentIndex < 0 || !options.length) return;
        event.preventDefault();
        const direction = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
        const next = options[(currentIndex + direction + options.length) % options.length];
        const blockKey = next.getAttribute("data-choice-block-key");
        const optionId = next.getAttribute("data-choice-option-id");
        if (!blockKey || !optionId) return;
        next.focus();
        setChoiceSelection(blockKey, optionId, true);
      });
    });
    root.querySelectorAll("[data-action='choice-try-again']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        if (!blockKey) return;
        tryAgainChoice(blockKey);
      });
    });
    root.querySelectorAll("[data-action='choice-view-answer']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        if (!blockKey) return;
        viewAnswerChoice(blockKey);
      });
    });
    root.querySelectorAll("[data-action='choice-validate']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        if (!blockKey) return;
        validateChoice(blockKey);
      });
    });

    root.querySelector(".study-reader-screen")?.addEventListener("click", (event) => {
      if (!state.continuePopup) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".study-continue-popup") ||
        target.closest("[data-action='next-card']") ||
        target.closest("[data-action='continue-popup-next']")
      ) {
        return;
      }

      closeContinuePopup();
    });

    bindCompleteResponseControls(root);
    root.querySelectorAll("[data-action='complete-try-again']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        if (!blockKey) return;
        tryAgainComplete(blockKey);
      });
    });
    root.querySelectorAll("[data-action='complete-view-answer']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        if (!blockKey) return;
        viewAnswerComplete(blockKey);
      });
    });
    root.querySelectorAll("[data-action='complete-validate']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        if (!blockKey) return;
        validateComplete(blockKey);
      });
    });
    root.querySelectorAll("[data-action='ordering-move']").forEach((node) => {
      node.addEventListener("click", () => {
        moveOrderingItem(
          node.getAttribute("data-response-block-key"),
          node.getAttribute("data-ordering-item-id"),
          node.getAttribute("data-ordering-direction")
        );
      });
    });
    root.querySelectorAll("[data-action='ordering-view-answer']").forEach((node) => {
      node.addEventListener("click", () => viewOrderingAnswer(
        node.getAttribute("data-response-block-key")
      ));
    });
    root.querySelectorAll("[data-action='ordering-try-again']").forEach((node) => {
      node.addEventListener("click", () => tryOrderingAgain(
        node.getAttribute("data-response-block-key")
      ));
    });
    root.querySelectorAll("[data-action='annotation-toggle']").forEach((node) => {
      node.addEventListener("click", () => {
        const packageRoot = node.closest(".package-instance");
        if (!packageRoot) return;
        const indexes = new Set(String(node.getAttribute("data-annotation-indexes") || "")
          .split(",").map((value) => value.trim()).filter(Boolean));
        const shouldActivate = !node.classList.contains("is-active");
        packageRoot.querySelectorAll("[data-action='annotation-toggle']").forEach((target) => {
          const targetIndexes = String(target.getAttribute("data-annotation-indexes") || "")
            .split(",").map((value) => value.trim()).filter(Boolean);
          const active = shouldActivate && targetIndexes.some((index) => indexes.has(index));
          target.classList.toggle("is-active", active);
          target.setAttribute("aria-pressed", active ? "true" : "false");
        });
        if (shouldActivate && node.classList.contains("runtime-annotated-text-segment")) {
          const note = [...packageRoot.querySelectorAll(".runtime-annotated-text-note")]
            .find((target) => String(target.getAttribute("data-annotation-indexes") || "")
              .split(",").some((index) => indexes.has(index.trim())));
          note?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
      });
    });
    root.querySelectorAll("[data-action='matching-set']").forEach((node) => {
      node.addEventListener("change", () => setMatchingValue(
        node.getAttribute("data-response-block-key"),
        node.getAttribute("data-matching-left-id"),
        node.value
      ));
    });
    root.querySelectorAll("[data-action='matching-view-answer']").forEach((node) => {
      node.addEventListener("click", () => viewMatchingAnswer(
        node.getAttribute("data-response-block-key")
      ));
    });
    root.querySelectorAll("[data-action='matching-try-again']").forEach((node) => {
      node.addEventListener("click", () => tryMatchingAgain(
        node.getAttribute("data-response-block-key")
      ));
    });

    root.querySelectorAll("[data-action='open-card-index']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number.parseInt(node.getAttribute("data-card-index") || "0", 10);
        if (!Number.isFinite(index)) return;
        openCardByIndex(index);
      });
    });

    root.querySelectorAll("[data-action='edit-course']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const trailItemId = node.getAttribute("data-trail-item-id");
        if (trailItemId && homeTrailsController) {
          if (state.view === "courses") void openHomeCourseEditor(trailItemId);
          else void openHomeTrailCourse(trailItemId, { mode: "edit" });
          return;
        }
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        if (!courseKey) return;
        openCourse(courseKey, { mode: "edit" });
      });
    });
    root.querySelectorAll("[data-action='edit-module']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const moduleKey = node.getAttribute("data-module-key");
        if (!moduleKey) return;
        openModule(moduleKey, { mode: "edit" });
      });
    });
    root.querySelectorAll("[data-action='edit-lesson']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const moduleKey = node.getAttribute("data-module-key") || state.selection.moduleKey;
        const lessonKey = node.getAttribute("data-lesson-key") || state.selection.lessonKey;
        if (!moduleKey || !lessonKey) return;
        openLesson(moduleKey, lessonKey, { mode: "edit" });
      });
    });
    root.querySelectorAll(".editor-overlay").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target !== node) {
          return;
        }
        if (state.cardCommentOpen) {
          closeCardComment();
          return;
        }
        if (state.providerConfigOpen) {
          closeProviderConfig();
          return;
        }
      });
    });
    root.querySelector("[data-action='comment-close']")?.addEventListener("click", () => closeCardComment());
    root.querySelector("[data-action='comment-save']")?.addEventListener("click", () => void saveCardComment());
    root.querySelector("[data-action='comment-delete']")?.addEventListener("click", () => void deleteCardComment());
    const cardCommentInput = root.querySelector("[data-field='card-comment']");
    const assistMicrosequenceTitleInput = root.querySelector("[data-field='assist-microsequence-title']");
    if (cardCommentInput) {
      cardCommentInput.value = state.cardCommentDraft.body;
      cardCommentInput.addEventListener("input", () => {
        state.cardCommentDraft = {
          ...state.cardCommentDraft,
          body: cardCommentInput.value
        };
      });
    }
    root.querySelectorAll("[data-field='card-comment-category']").forEach((node) => {
      node.addEventListener("change", () => {
        if (!node.checked) return;
        state.cardCommentDraft = {
          ...state.cardCommentDraft,
          category: node.value
        };
        render({ preserveState: true });
      });
    });
    if (assistMicrosequenceTitleInput) {
      const commitAssistMicrosequenceTitle = () => {
        updateMicrosequenceDraft({
          title: assistMicrosequenceTitleInput.value
        });
      };
      assistMicrosequenceTitleInput.addEventListener("input", () => {
        syncAssistSubmitState();
      });
      assistMicrosequenceTitleInput.addEventListener("change", commitAssistMicrosequenceTitle);
      assistMicrosequenceTitleInput.addEventListener("blur", commitAssistMicrosequenceTitle);
    }
    const assistModelInputs = root.querySelectorAll("[data-field='assist-model']");
    const assistApiKey = root.querySelector("[data-field='assist-api-key']");
    const providerConfigBaseUrl = root.querySelector("[data-field='provider-config-base-url']");
    const providerConfigCodexEndpoint = root.querySelector("[data-field='provider-config-codex-endpoint']");
    const providerConfigCodexToken = root.querySelector("[data-field='provider-config-codex-token']");
    const providerConfigProtocol = root.querySelector("[data-field='provider-config-protocol']");
    const providerConfigModel = root.querySelector("[data-field='provider-config-model']");
    const providerConfigEndpoint = root.querySelector("[data-field='provider-config-endpoint']");
    const providerConfigSecret = root.querySelector("[data-field='provider-config-secret']");
    const assistPrompt = root.querySelector("[data-field='assist-prompt']");
    const assistSubmitButton = root.querySelector("[data-action='submit-card-assistance']");
    const syncAssistSubmitState = () => {
      if (!assistSubmitButton) return;
      const visiblePromptValue =
        assistPrompt instanceof HTMLTextAreaElement
          ? assistPrompt.value
          : state.assistDraft.promptText || "";
      const context = getRenderContext();
      const canSubmitAssist = state.view === "microsequence" && canSubmitCardAssistanceRequest({
        promptText: visiblePromptValue,
        isSubmitting: state.assistDraft.isSubmitting,
        selectionReady: cardAssistanceSelectionIsReady(
          state.assistDraft.assistance,
          { selection: state.selection, card: context.card, cards: context.cards }
        )
      });
      assistSubmitButton.disabled = !canSubmitAssist;
      assistSubmitButton.setAttribute("aria-disabled", canSubmitAssist ? "false" : "true");
    };
    assistModelInputs.forEach((assistModel) => {
      assistModel.addEventListener("change", () => {
        const selectedValue = assistModel instanceof HTMLSelectElement ? assistModel.value : "";
        setAssistModel(selectedValue);
        render({ preserveState: true });
      });
    });
    if (assistApiKey) {
      assistApiKey.addEventListener("input", () => {
        persistAssistConfigValue({ apiKey: assistApiKey.value });
      });
    }
    if (providerConfigBaseUrl) {
      providerConfigBaseUrl.addEventListener("input", () => {
        persistAssistConfigValue({ baseUrl: providerConfigBaseUrl.value });
      });
    }
    if (providerConfigCodexEndpoint) {
      providerConfigCodexEndpoint.addEventListener("input", () => {
        persistAssistConfigValue({ codexEndpoint: providerConfigCodexEndpoint.value });
      });
    }
    if (providerConfigCodexToken) {
      providerConfigCodexToken.addEventListener("input", () => {
        persistAssistConfigValue({ codexToken: providerConfigCodexToken.value });
      });
    }
    if (providerConfigProtocol) {
      providerConfigProtocol.addEventListener("change", () => {
        const nextProtocol = providerConfigProtocol.value;
        persistAssistConfigValue({
          providerProtocol: nextProtocol,
          providerEndpoint: nextProtocol === PROVIDER_PROTOCOL.LOCAL_BRIDGE
            ? DEFAULT_CODEX_LOCAL_ENDPOINT
            : "",
          providerSecret: ""
        });
        updateCodexCliSetupStatus({});
        render({ preserveState: true });
      });
    }
    if (providerConfigModel) {
      providerConfigModel.addEventListener("input", () => {
        persistAssistConfigValue({ customModelId: providerConfigModel.value });
      });
    }
    if (providerConfigEndpoint) {
      providerConfigEndpoint.addEventListener("input", () => {
        persistAssistConfigValue({ providerEndpoint: providerConfigEndpoint.value });
      });
    }
    if (providerConfigSecret) {
      providerConfigSecret.addEventListener("input", () => {
        persistAssistConfigValue({ providerSecret: providerConfigSecret.value });
      });
    }
    const toggleCurrentCardWholeSelection = () => {
      const context = getRenderContext();
      state.assistDraft.assistance = toggleCardAssistanceWholeCard(
        state.assistDraft.assistance,
        { selection: state.selection, card: context.card, cards: context.cards }
      );
      state.assistDraft.manualDraft = null;
      queueAuthoringFocus("card-title");
      render({ preserveState: true });
    };
    root.querySelectorAll("[data-action='toggle-card-assistance-resource']").forEach((node) => {
      node.addEventListener("click", () => {
        const context = getRenderContext();
        const targetId = node.getAttribute("data-resource-target-id");
        const current = state.assistDraft.assistance;
        const base = state.entityModes.card === "edit" && !current.resourceTargetIds?.includes(targetId)
          ? createCardAssistanceUiState(state.selection)
          : current;
        state.assistDraft.assistance = toggleCardAssistanceResource(
          base,
          { selection: state.selection, card: context.card, cards: context.cards },
          targetId
        );
        state.assistDraft.manualDraft = null;
        queueAuthoringFocus(`resource:${targetId}`);
        render({ preserveState: true });
      });
    });
    root.querySelector("[data-action='toggle-card-assistance-composer']")?.addEventListener("click", () => {
      if (state.entityModes.card !== "ai") return;
      state.assistDraft.composerOpen = !state.assistDraft.composerOpen;
      if (state.assistDraft.composerOpen) {
        queueAuthoringFocus("ai-prompt");
      }
      render({ preserveState: true });
    });
    if (assistPrompt) {
      assistPrompt.addEventListener("input", () => {
        state.assistDraft.promptText = assistPrompt.value;
        syncAssistSubmitState();
      });
    }
    root.querySelector("[data-action='open-provider-config']")?.addEventListener("click", () => {
      openProviderConfig();
    });
    root.querySelectorAll("[data-action='open-assist-config']").forEach((node) => {
      node.addEventListener("click", () => {
        openProviderConfig();
      });
    });
    root.querySelector("[data-action='submit-card-assistance']")?.addEventListener("click", () => {
      void submitCardAssistanceRequest();
    });
    root.querySelectorAll("[data-action='toggle-card-assistance-whole-card']").forEach((node) => {
      node.addEventListener("click", () => {
        toggleCurrentCardWholeSelection();
      });
    });
    root.querySelectorAll("[data-card-whole-selection-surface='true']").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (!["edit", "ai"].includes(state.entityModes.card)) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest([
          ".runtime-resource-edit-target",
          ".runtime-card-authoring",
          ".runtime-card-title",
          "button",
          "input",
          "textarea",
          "select",
          "a",
          "summary",
          "[contenteditable='true']"
        ].join(","))) return;
        toggleCurrentCardWholeSelection();
      });
    });
    const manualCardEditor = root.querySelector("[data-manual-target-id]");
    manualCardEditor?.addEventListener("input", () => {
      rememberManualCardEditDraft(manualCardEditor);
    });
    root.querySelector("[data-action='save-manual-card-edit']")?.addEventListener("click", () => {
      void saveManualCardEdit();
    });
    root.querySelector("[data-action='cancel-manual-card-edit']")?.addEventListener("click", () => {
      cancelManualCardEdit();
    });
    root.querySelector("[data-action='undo-card-edit']")?.addEventListener("click", () => {
      void undoCardEdit();
    });
    root.querySelector("[data-action='provider-config-close']")?.addEventListener("click", () => closeProviderConfig());
    root.querySelector("[data-action='provider-config-check-codex']")?.addEventListener("click", () => {
      void testCodexCliConnection();
    });
    root.querySelector("[data-action='test-codex-cli-connection']")?.addEventListener("click", () => {
      void testCodexCliConnection();
    });
    root.querySelector("[data-action='copy-codex-cli-script']")?.addEventListener("click", () => {
      void copyTextToClipboard(getCodexSetupScript());
    });
    root.querySelector("[data-action='copy-codex-cli-endpoint']")?.addEventListener("click", () => {
      void copyTextToClipboard(getCodexSetupEndpoint());
    });
    root.querySelector("[data-action='copy-codex-cli-health-command']")?.addEventListener("click", () => {
      void copyTextToClipboard(getCodexSetupHealthCommand());
    });

  }

  syncAssistDraft();
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("resize", () => {
      syncCardStripScroller({ keepActiveCardInView: true });
    });
    window.addEventListener("online", () => {
      void refreshHomeTrails().finally(() => attemptAllContextualAuthoringSync());
    });
    window.addEventListener("offline", () => {
      void refreshHomeTrails();
    });
  }
  render({ preserveState: false });
  void refreshHomeTrails({ preserveSelection: false });
  void loadCardAssistanceLocalState(state.selection.courseKey).then(() => {
    if (globalThis.navigator?.onLine !== false) {
      return attemptAllContextualAuthoringSync();
    }
    return undefined;
  });
  globalThis.AndroidHost?.runtimeReady?.();
  return {
    async refreshPersonalState() {
      await Promise.allSettled(
        [...state.trailPersonalStorageByItemId.entries()].map(async ([itemId, personalStorage]) => {
          try {
            await personalStorage.refresh?.();
          } catch (error) {
            if (isHomeTrailsAuthorityError(error)) {
              state.trailPersonalStorageByItemId.delete(itemId);
              state.trailPersonalStorageLoadingByItemId.delete(itemId);
            }
            throw error;
          }
        })
      );
      render({ preserveState: true });
      return refreshHomeTrails();
    },
    replaceProject(nextProject) {
      const localStateCourseKey = state.assistDraft.localStateCourseKey;
      if (courseDocumentChanged(state.project, nextProject, localStateCourseKey)) {
        state.assistDraft.localState = setCardAssistanceUndo(
          state.assistDraft.localState,
          null
        );
      }
      const composedProject = composeLoadedWorkspaceCourses(nextProject);
      setProject(composedProject);
      if (!applySelectionByKeys(composedProject, state.selection)) selectFirstPath(composedProject);
      render({ preserveState: false });
      void loadCardAssistanceLocalState(state.selection.courseKey);
    },
    openCourse(courseIdentity) {
      const courseKey = storage.resolveCourseContractKey?.(courseIdentity) || String(courseIdentity || "");
      const course = findCourse(state.project, courseKey);
      if (!course) return false;
      applySelection(buildNodeSelection({ courseKey: course.id }));
      state.view = "course";
      render({ preserveState: false });
      return true;
    },
    refreshTrails() {
      return refreshHomeTrails();
    },
    flushPersonalState() {
      return Promise.all(
        [...state.trailPersonalStorageByItemId.values()].map((personalStorage) =>
          Promise.resolve(personalStorage.flush?.())
        )
      );
    },
    syncContextualAuthoring() {
      return attemptAllContextualAuthoringSync();
    },
    openCardPath(entityPath, { edit = false } = {}) {
      const selection = resolveExactCardSelection(state.project, entityPath);
      if (!selection) return false;
      applySelection(selection);
      if (edit) {
        return openCardAssistanceMode(selection.microsequenceKey, selection.cardIndex) === true;
      }
      return openMicrosequenceScreen(selection.microsequenceKey, selection.cardIndex, "play") === true;
    }
  };
}
