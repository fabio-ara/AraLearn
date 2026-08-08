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
  getRuntimePopupButtonEntry,
  resolveRuntimeFlowchartProjection
} from "../render/renderCardRuntime.js";
import { buildResourceGapModel } from "../core/resourceGaps.js";
import { resolveCardRuntime } from "../core/cardRuntime.js";
import { getCorrectExerciseOptionIds, getExerciseOptionStableId } from "../core/exerciseOptions.js";
import {
  normalizeTextGapResponse,
  textGapResponseMatches
} from "../core/textGaps.js";
import {
  createFlowchartExerciseState,
  fillFlowchartExerciseAnswer,
  flowchartLinkUsesLabelChoiceBlank,
  flowchartNodeUsesTextChoiceBlank,
  flowchartProjectionHasPractice,
  resetFlowchartExerciseState,
  validateFlowchartExerciseState
} from "../flowchart/flowchartExercise.js";
import { computeFlowchartAutoFitScale } from "../flowchart/flowchartViewport.js";
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
import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import {
  CARD_ASSISTANCE_UNDO_CONTRACT,
  applyContextualAuthoringInversePatch,
  clearContextualAuthoringSync,
  createContextualAuthoringInversePatch,
  markContextualAuthoringSyncPending,
  normalizeCardAssistanceLocalState,
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
  moveIntegratedEntity,
  saveIntegratedEntityMetadata
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

function clampFlowchartScale(value) {
  return Math.max(0.45, Math.min(2.4, Number(value || 1)));
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
    homeOrganization: {
      active: false,
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
    flowchartProjectionByBlockKey: {},
    flowchartPracticeByBlockKey: {},
    activeFlowchartPrompt: null,
    flowchartPinch: null,
    choiceExerciseByBlockKey: {},
    completeExerciseByBlockKey: {},
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
      contextualAuthoringSync: {
        running: false,
        trailingAttemptRequested: false
      },
      syncError: "",
      isSubmitting: false,
      errorMessage: "",
      manualEditError: ""
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

  function workspaceAuthoringAvailable(courseKey) {
    const reference = workspaceCourseRef(courseKey);
    return Boolean(
      reference?.canEdit === true &&
      workspaceCourseHook("saveMetadata") &&
      workspaceCourseHook("saveMicrosequenceCards") &&
      workspaceCourseHook("moveEntity") &&
      workspaceCourseHook("deleteEntity") &&
      workspaceCourseHook("deleteCourse")
    );
  }

  function activeTrailPersonalStorage(courseKey = state.selection?.courseKey) {
    if (!homeTrailsController) return storage;
    const reference = trailCourseRef(courseKey);
    if (!reference) return null;
    return state.trailPersonalStorageByItemId.get(reference.trailItemId) || null;
  }

  async function ensureTrailPersonalStorage(item, course) {
    if (!item || !course || !homeTrailsController) return storage;
    const reference = homeTrailsController.bindCourseKey(item.itemId, course.id);
    if (!reference) throw new Error("O item de Trilhas não corresponde ao curso carregado.");
    const existing = state.trailPersonalStorageByItemId.get(reference.trailItemId);
    if (existing) {
      existing.setCourse?.(course);
      try {
        await existing.refresh?.();
      } catch (error) {
        if (isHomeTrailsAuthorityError(error)) {
          state.trailPersonalStorageByItemId.delete(reference.trailItemId);
          state.trailPersonalStorageLoadingByItemId.delete(reference.trailItemId);
        }
        throw error;
      }
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
      await personalStorage.initialize();
      state.trailPersonalStorageByItemId.set(reference.trailItemId, personalStorage);
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
    if (!personalStorage?.saveProgress) return;
    void Promise.resolve(personalStorage.saveProgress(nextProgress)).catch((error) => {
      console.warn("Não foi possível salvar o progresso em Trilhas.", error);
    });
  }

  function homeReviewItems() {
    if (!homeTrailsController) return storage.loadReviewItems?.() || [];
    return [...state.trailPersonalStorageByItemId.entries()].flatMap(([trailItemId, personalStorage]) =>
      (personalStorage.loadReviewItems?.() || []).map((item) => ({ ...item, trailItemId }))
    );
  }

  function setProject(nextProject) {
    state.project = nextProject;
    state.flowchartProjectionByBlockKey = {};
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
    state.homeTrailLoading = true;
    if (state.view === "courses") render({ preserveState: true });
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
      state.homeSelectedCourseKey = homeTrailsController.courseRefs
        .get(state.homeSelectedTrailItemId)?.courseKey ||
        selectedItem?.courseKey || selectedItem?.courseId || "";
      setProject(composeLoadedWorkspaceCourses(storage.loadProject()));
      return snapshot;
    } catch (error) {
      if (isHomeTrailsAuthorityError(error)) {
        await clearTrailPersonalStorage();
        state.homeTrailSnapshot = null;
        state.homeSelectedTrailItemId = "";
        state.homeSelectedCourseKey = "";
        state.homeOrganization.active = false;
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
      if (state.view === "courses") render({ preserveState: true });
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
    if (course) homeTrailsController.bindCourseKey(item.itemId, course.id);
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
      openCourse(course.id, { mode });
      return true;
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
    if (!navigationState) return;
    state.homeSelectedCourseKey = courseKey;
    Object.assign(state, buildNavigationViewState(navigationState));
    state.entityModes.course = mode === "edit" ? "edit" : "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";

    render({ preserveState: false });
  }

  function openModule(moduleKey, { mode = "view" } = {}) {
    const navigationState = buildModuleNavigationState(state.project, {
      courseKey: state.selection.courseKey,
      moduleKey
    });
    if (!navigationState) return;
    Object.assign(state, buildNavigationViewState(navigationState));
    state.entityModes.module = mode === "edit" ? "edit" : "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";

    render({ preserveState: false });
  }

  function openLesson(moduleKey, lessonKey, { mode = "view" } = {}) {
    const navigationState = buildLessonNavigationState(state.project, activeProgress(state.selection.courseKey), {
      courseKey: state.selection.courseKey,
      moduleKey,
      lessonKey
    });
    if (!navigationState) return;
    Object.assign(state, buildNavigationViewState(navigationState));
    state.entityModes.lesson = mode === "edit" ? "edit" : "view";
    state.inlineStructureEditor = null;
    state.entityMutationError = "";
    state.bottomUpDraft.composerOpen = false;
    state.bottomUpDraft.promptText = "";
    state.bottomUpDraft.errorMessage = "";

    render({ preserveState: false });
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
    saveActiveProgress(nextProgress, reference.courseKey);
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
      void Promise.resolve(personalStorage.removeProgressEntries(lessonReferences)).catch((error) => {
        console.warn("Não foi possível zerar o progresso em Trilhas.", error);
      });
      return;
    }
    const currentProgress = activeProgress(courseKey);
    const nextProgress = removeLessonProgressEntries(currentProgress, lessonReferences);
    saveActiveProgress(nextProgress, courseKey);
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
    if (!microsequence) return;
    if (mode === "play" && !resolveMicrosequenceRuntimeIncluded(microsequence)) {
      openMicrosequenceOverview(microsequenceKey);
      return;
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
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
    void loadCardAssistanceLocalState(state.selection.courseKey);
  }

  function openCardAssistanceMode(microsequenceKey, targetIndex = 0) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence) return;
    try {
      assertCourseAuthoringAllowed(state.selection.courseKey);
    } catch (error) {
      state.assistDraft.errorMessage = error.message;
      render({ preserveState: true });
      return;
    }
    state.selection.microsequenceKey = microsequence.id;
    selectMicrosequenceCard(microsequenceKey, targetIndex);

    state.view = "microsequence";
    state.entityModes.card = "ai";
    state.assistDraft.composerOpen = false;
    state.assistDraft.promptText = "";
    state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
    state.assistDraft.errorMessage = "";
    state.microsequenceMode = "assist";
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
    void loadCardAssistanceLocalState(state.selection.courseKey);
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
    state.activeFlowchartPrompt = null;
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
    state.activeFlowchartPrompt = null;
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
    if (!microsequence) return;
    state.view = "microsequence";
    state.microsequenceMode = "overview";
    state.entityModes.microsequence = mode === "edit" ? "edit" : "view";
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
    render({ preserveState: false });
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

  function findFirstIncompleteFlowchartTarget(projection, exerciseState) {
    const exercise = createFlowchartExerciseState(projection, exerciseState);
    const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
    const links = Array.isArray(projection?.links) ? projection.links : [];

    for (const node of nodes) {
      if (!node?.id) continue;

      if (node.shapeBlank) {
        const currentShape = String(exercise.shapes?.[node.id] || "").trim();
        if (!currentShape) {
          return { kind: "shape", targetId: node.id, focusMode: "prompt" };
        }
      }

      if (node.textBlank) {
        const currentText = String(exercise.texts?.[node.id] || "").trim();
        if (!currentText) {
          return {
            kind: "text",
            targetId: node.id,
            focusMode: flowchartNodeUsesTextChoiceBlank(node) ? "prompt" : "input"
          };
        }
      }
    }

    for (const link of links) {
      if (!link?.id || !link.labelBlank) continue;
      const currentLabel = String(exercise.labels?.[link.id] || "").trim();
      if (!currentLabel) {
        return {
          kind: "label",
          targetId: link.id,
          focusMode: flowchartLinkUsesLabelChoiceBlank(link) ? "prompt" : "input"
        };
      }
    }

    return null;
  }

  function focusFirstIncompleteFlowchartTarget(blockKey, projection, exerciseState) {
    const target = findFirstIncompleteFlowchartTarget(projection, exerciseState);
    if (!target) {
      return false;
    }

    if (target.focusMode === "prompt") {
      state.activeFlowchartPrompt = {
        blockKey,
        kind: target.kind,
        targetId: target.targetId
      };
      queueExerciseFocus(
        "[data-flowchart-prompt='true'] .runtime-flow-shape-option, [data-flowchart-prompt='true'] .token-option"
      );
      return true;
    }

    state.activeFlowchartPrompt = null;
    queueExerciseFocus(
      "[data-flowchart-inline-input='true'][data-flowchart-block-key=\"" +
        blockKey +
        "\"][data-flowchart-choice-kind=\"" +
        target.kind +
        "\"][data-flowchart-target-id=\"" +
        target.targetId +
        "\"]",
      { caretToEnd: true }
    );
    return true;
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

    const exercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const values = Array.isArray(exercise.values) ? exercise.values : [];
    const parts = listTextGapPartsForBlock(entry.block);
    const firstMissing = parts.find((part) => !String(values[part.index] ?? "").trim());
    if (!firstMissing) {
      return false;
    }

    if (Array.isArray(firstMissing.options) && firstMissing.options.length) {
      state.activeTextGapPrompt = {
        blockKey,
        blankIndex: Number(firstMissing.index)
      };
      queueExerciseFocus("[data-text-gap-prompt='true'] .token-option");
      return true;
    }

    state.activeTextGapPrompt = null;
    queueExerciseFocus(
      "[data-text-gap-field='true'][data-complete-block-key=\"" +
        blockKey +
        "\"][data-complete-blank-index=\"" +
        firstMissing.index +
        "\"]"
    );
    return true;
  }

  function advanceToNextCard(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    stepCard(1);
  }

  function isCurrentContinuePopupOpen(popupEntry = getCurrentPopupRuntimeButtonEntry()) {
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
      const flowcharts = getCurrentCardRuntimeFlowcharts();
      for (const entry of flowcharts) {
        const projection = getStableFlowchartProjection(entry);
        if (!projection || !flowchartProjectionHasPractice(projection)) continue;
        const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
        state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
        // Só bloqueia avanço quando há exercício e ele não está correto.
        if (result.status !== "correct") {
          if (result.status === "incomplete") {
            notifyIncompleteExercise("Preencha todas as lacunas do fluxograma.");
            focusFirstIncompleteFlowchartTarget(entry.blockKey, projection, result.state);
          }
          render({ preserveState: true });
          return;
        }
      }

      const choices = getCurrentCardRuntimeChoiceBlocks();
      for (const entry of choices) {
        const exercise = state.choiceExerciseByBlockKey[entry.blockKey] || { selected: [], feedback: null };
        if (exercise.feedback !== "correct") {
          // Força feedback para impedir avanço silencioso.
          const status = validateChoice(entry.blockKey);
          if (status !== "correct") {
            return;
          }
        }
      }

      const completes = getCurrentCardRuntimeCompleteBlocks();
      for (const entry of completes) {
        const exercise = state.completeExerciseByBlockKey[entry.blockKey] || { values: [], feedback: null };
        if (exercise.feedback !== "correct") {
          const status = validateComplete(entry.blockKey);
          if (status !== "correct") {
            return;
          }
        }
      }

      const popupEntry = getCurrentPopupRuntimeButtonEntry();
      const popupIsOpen = isCurrentContinuePopupOpen(popupEntry);

      if (popupEntry && !popupIsOpen) {
        state.continuePopup = createContinuePopupState(
          buildCardPathKey(state.selection),
          popupEntry.blockKey
        );
        state.activeFlowchartPrompt = null;
        state.activeTextGapPrompt = null;
        render({ preserveState: true });
        return;
      }

      if (popupIsOpen) {
        const popupFlowcharts = getCurrentPopupRuntimeFlowcharts();
        for (const entry of popupFlowcharts) {
          const projection = getStableFlowchartProjection(entry);
          if (!projection || !flowchartProjectionHasPractice(projection)) continue;
          const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
          state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
          if (result.status !== "correct") {
            if (result.status === "incomplete") {
              notifyIncompleteExercise("Preencha todas as lacunas do fluxograma.");
              focusFirstIncompleteFlowchartTarget(entry.blockKey, projection, result.state);
            }
            render({ preserveState: true });
            return;
          }
        }

        const popupChoices = getCurrentPopupRuntimeChoiceBlocks();
        for (const entry of popupChoices) {
          const exercise = state.choiceExerciseByBlockKey[entry.blockKey] || { selected: [], feedback: null };
          if (exercise.feedback !== "correct") {
            const status = validateChoice(entry.blockKey);
            if (status !== "correct") {
              return;
            }
          }
        }

        const popupCompletes = getCurrentPopupRuntimeCompleteBlocks();
        for (const entry of popupCompletes) {
          const exercise = state.completeExerciseByBlockKey[entry.blockKey] || { values: [], feedback: null };
          if (exercise.feedback !== "correct") {
            const status = validateComplete(entry.blockKey);
            if (status !== "correct") {
              return;
            }
          }
        }

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
    removeProgressEntries(lessonReferences);
  }

  function resetModuleProgress(courseKey, moduleKey) {
    const moduleValue = findModule(state.project, courseKey, moduleKey);
    removeProgressEntries(collectProgressReferencesInModule(courseKey, moduleValue));
  }

  function resetLessonProgress(courseKey, moduleKey, lessonKey) {
    removeProgressEntries([{ courseKey, moduleKey, lessonKey }]);
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
    saveActiveProgress(nextProgress, courseKey);
  }

  function resetCardProgress(courseKey, moduleKey, lessonKey, cardKey) {
    const nextProgress = truncateLessonProgressFromCardKeys(
      activeProgress(courseKey),
      { courseKey, moduleKey, lessonKey },
      [cardKey]
    );
    saveActiveProgress(nextProgress, courseKey);
  }

  function buildCurrentCardAssistanceRequest() {
    const context = getRenderContext();
    const assistance = reconcileCardAssistanceUiState(state.assistDraft.assistance, {
      selection: state.selection,
      card: context.card,
      cards: context.cards
    });
    state.assistDraft.assistance = assistance;
    return {
      operation: "repair",
      promptText: state.assistDraft.promptText,
      repairScope: assistance.wholeCardSelected ? "card" : "resources",
      resourceTargetIds: assistance.wholeCardSelected ? [] : assistance.resourceTargetIds
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

  async function loadCardAssistanceLocalState(courseKey = state.selection.courseKey) {
    if (!courseKey || typeof storage.loadCardAssistanceLocalState !== "function") return;
    try {
      const stored = await readCardAssistanceLocalState(courseKey);
      if (courseKey !== state.selection.courseKey) return;
      state.assistDraft.localState = stored;
      state.assistDraft.localStateCourseKey = courseKey;
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
    if (!contextualAuthoringAttemptOwnsVisibleState(courseKey)) return false;
    state.assistDraft.localState = normalizeCardAssistanceLocalState(localState || {});
    return true;
  }

  function contextualAuthoringIsAvailable() {
    return typeof contextualAuthoring?.remoteCatalog?.executeApplicationAuthoringAction === "function";
  }

  async function attemptContextualAuthoringSync() {
    const courseKey = state.selection?.courseKey;
    if (
      !courseKey ||
      !contextualAuthoringIsAvailable() ||
      globalThis.navigator?.onLine === false
    ) return;
    if (!claimContextualAuthoringSyncAttempt(
      state.assistDraft.contextualAuthoringSync
    )) return;
    if (contextualAuthoringAttemptOwnsVisibleState(courseKey)) {
      state.assistDraft.syncError = "";
    }
    try {
      let attemptLocalState;
      if (state.assistDraft.localStateCourseKey !== courseKey) {
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
      if (!pendingPaths.length) return;
      const result = await materializeContextualCourseDraft({
        remoteCatalog: contextualAuthoring.remoteCatalog,
        storage,
        projectDocument: state.project,
        courseKey,
        pendingPaths
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
        return;
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
      if (materializedItem) {
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
    } catch (error) {
      console.warn("Sincronização da autoria contextual adiada.", error);
      if (contextualAuthoringAttemptOwnsVisibleState(courseKey)) {
        state.assistDraft.syncError =
          "A alteração ficou na fila local e será materializada quando a conexão permitir.";
      }
    } finally {
      settleContextualAuthoringSyncAttempt(
        state.assistDraft.contextualAuthoringSync,
        () => {
          void attemptContextualAuthoringSync();
        }
      );
      render({ preserveState: true });
    }
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
    const workspaceRef = workspaceCourseRef(requestedSelection.courseKey);
    if (!workspaceRef) assertCourseAuthoringAllowed(requestedSelection.courseKey);
    else if (!workspaceCourseHook("saveMicrosequenceCards")) {
      throw new Error("A gravação deste curso de workspace não está disponível.");
    }
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
    if (workspaceRef) {
      const saved = await workspaceCourseHook("saveMicrosequenceCards")({
        courseRef: workspaceRef,
        microsequencePath: [
          requestedSelection.courseKey,
          requestedSelection.moduleKey,
          requestedSelection.lessonKey,
          applied.targetMicrosequenceKey
        ],
        cards: structuredClone(targetMicrosequence.cards || [])
      });
      if (Number.isSafeInteger(Number(saved?.revision))) {
        homeTrailsController.updateCourseRef(workspaceRef.trailItemId, {
          revision: Number(saved.revision)
        });
      }
      setProject(applied.projectDocument);
      homeTrailsController.loadedCourses.set(
        workspaceRef.trailItemId,
        structuredClone(findCourse(applied.projectDocument, requestedSelection.courseKey))
      );
      state.selection.microsequenceKey = applied.targetMicrosequenceKey;
      state.selection.cardIndex = targetIndex;
      state.selection.cardKey = targetMicrosequence.cards[targetIndex].id;
      state.assistDraft.promptText = "";
      state.assistDraft.composerOpen = false;
      state.assistDraft.manualDraft = null;
      state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
      queueAuthoringFocus("card-title");
      state.cardExerciseLoadVersion += 1;
      await refreshHomeTrails();
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
        microsequenceKey: applied.targetMicrosequenceKey
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
    state.cardExerciseLoadVersion += 1;
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
      const workspaceRef = workspaceCourseRef(requestedSelection.courseKey);
      let guard = null;
      if (!workspaceRef) {
        assertCourseAuthoringAllowed(state.selection.courseKey);
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
      lesson.microsequences[index] = applyContextualAuthoringInversePatch(
        lesson.microsequences[index],
        undo.inversePatch
      );
      let nextLocalState = setCardAssistanceUndo(state.assistDraft.localState, null);
      nextLocalState = markContextualAuthoringSyncPending(nextLocalState, {
        courseKey: undo.courseKey,
        moduleKey: undo.moduleKey,
        lessonKey: undo.lessonKey,
        microsequenceKey: undo.microsequenceKey
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
      state.cardExerciseLoadVersion += 1;
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
      const workspaceRef = workspaceCourseRef(requestedSelection.courseKey);
      let persistenceGuard = null;
      if (!workspaceRef) {
        assertCourseAuthoringAllowed(state.selection.courseKey);
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
      } else if (!workspaceCourseHook("saveMicrosequenceCards")) {
        throw new Error("A gravação deste curso de workspace não está disponível.");
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

    const workspaceRef = workspaceCourseRef(drag.courseKey);
    if (
      toIndex === null ||
      !entityPath ||
      (!workspaceRef && !contextualAuthoringIsAvailable()) ||
      (workspaceRef && !workspaceCourseHook("moveEntity"))
    ) return;
    state.entityMutationSaving = true;
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
      globalThis.alert?.(error instanceof Error ? error.message : "Não foi possível mover.");
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
    if (
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(`Excluir "${entity.title || "Parte"}" e todo o seu conteúdo?`)
    ) return;
    state.entityMutationSaving = true;
    try {
      const workspaceRef = workspaceCourseRef(target.courseKey);
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

  function setFlowchartViewportScale(scrollNode, nextScale, anchorClientX = null, anchorClientY = null) {
    if (!scrollNode) {
      return;
    }

    const previousScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
    const safeScale = clampFlowchartScale(nextScale);
    const baseWidth = Number(scrollNode.getAttribute("data-flowchart-base-width") || 0);
    const baseHeight = Number(scrollNode.getAttribute("data-flowchart-base-height") || 0);
    const stage = scrollNode.querySelector("[data-flowchart-stage='true']");
    const canvas = scrollNode.querySelector("[data-flowchart-canvas='true']");
    const valueButton = scrollNode.parentElement?.querySelector("[data-action='flowchart-zoom-reset']");
    let anchorContentX = null;
    let anchorContentY = null;

    if (
      Number.isFinite(Number(anchorClientX)) &&
      Number.isFinite(Number(anchorClientY)) &&
      previousScale > 0
    ) {
      const rect = scrollNode.getBoundingClientRect();
      anchorContentX = (scrollNode.scrollLeft + (Number(anchorClientX) - rect.left)) / previousScale;
      anchorContentY = (scrollNode.scrollTop + (Number(anchorClientY) - rect.top)) / previousScale;
    }

    scrollNode.setAttribute("data-flowchart-scale", safeScale.toFixed(3));
    if (canvas) {
      canvas.style.transform = `scale(${safeScale.toFixed(3)})`;
    }
    if (stage && baseWidth > 0 && baseHeight > 0) {
      stage.style.width = `${Math.max(1, Math.round(baseWidth * safeScale))}px`;
      stage.style.height = `${Math.max(1, Math.round(baseHeight * safeScale))}px`;
    }
    if (valueButton) {
      valueButton.textContent = `${Math.round(safeScale * 100)}%`;
    }
    if (
      anchorContentX !== null &&
      anchorContentY !== null &&
      Number.isFinite(anchorContentX) &&
      Number.isFinite(anchorContentY)
    ) {
      const rect = scrollNode.getBoundingClientRect();
      scrollNode.scrollLeft = Math.max(0, anchorContentX * safeScale - (Number(anchorClientX) - rect.left));
      scrollNode.scrollTop = Math.max(0, anchorContentY * safeScale - (Number(anchorClientY) - rect.top));
    }
  }

  function autoFitFlowchartViewport(scrollNode) {
    if (!scrollNode || scrollNode.getAttribute("data-flowchart-autofit") === "true") {
      return;
    }

    const baseWidth = Number(scrollNode.getAttribute("data-flowchart-base-width") || 0);
    const baseHeight = Number(scrollNode.getAttribute("data-flowchart-base-height") || 0);
    const preferredScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);

    if (!(baseWidth > 0 && baseHeight > 0)) {
      return;
    }

    const targetScale = computeFlowchartAutoFitScale({
      viewportWidth: scrollNode.clientWidth,
      viewportHeight: scrollNode.clientHeight,
      baseWidth,
      baseHeight,
      preferredScale,
      padding: 12,
      minScale: 0.2,
      maxScale: 1.2
    });

    setFlowchartViewportScale(scrollNode, targetScale);
    scrollNode.setAttribute("data-flowchart-autofit", "true");
  }

  function getTouchDistance(touchA, touchB) {
    if (!touchA || !touchB) {
      return 0;
    }
    const dx = touchA.clientX - touchB.clientX;
    const dy = touchA.clientY - touchB.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchMidpoint(touchA, touchB) {
    return {
      x: (touchA.clientX + touchB.clientX) / 2,
      y: (touchA.clientY + touchB.clientY) / 2
    };
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

  function getCurrentCardRuntimeBlocks(card = getRenderContext().card) {
    const runtime = resolveCardRuntime(card);
    return Array.isArray(runtime?.blocks) ? runtime.blocks : [];
  }

  function collectRuntimeBlockEntries(blocks, blockKeyPrefix, predicate) {
    return (Array.isArray(blocks) ? blocks : [])
      .map((block, index) => ({
        block,
        blockKey: `${blockKeyPrefix}::${index}`
      }))
      .filter((entry) => predicate(entry.block));
  }

  function getTextGapAnswersForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }
    if (block.exerciseMode !== undefined && block.exerciseMode !== "gap") {
      return [];
    }
    return buildResourceGapModel(block).answers;
  }

  function blockUsesTextGapExercise(block) {
    return getTextGapAnswersForBlock(block).length > 0;
  }

  function listTextGapPartsForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }
    if (block.exerciseMode !== undefined && block.exerciseMode !== "gap") {
      return [];
    }
    return buildResourceGapModel(block).tokens;
  }

  function getCurrentPopupRuntimeButtonEntry(card = getRenderContext().card) {
    const popupEntry = getRuntimePopupButtonEntry(card);
    if (!popupEntry) {
      return null;
    }

    return {
      ...popupEntry,
      blockKey: `${buildCardPathKey(state.selection)}::${popupEntry.index}`
    };
  }

  function getCurrentCardRuntimeFlowcharts(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => block?.kind === "flow"
    );
  }

  function getCurrentFlowchartEntry(blockKey) {
    return (
      [
        ...getCurrentCardRuntimeFlowcharts(),
        ...getCurrentPopupRuntimeFlowcharts()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getStableFlowchartProjection(entry) {
    if (!entry?.blockKey) return null;
    const cached = state.flowchartProjectionByBlockKey[entry.blockKey];
    if (cached) return cached;
    const projection = resolveRuntimeFlowchartProjection(entry.block);
    if (projection) state.flowchartProjectionByBlockKey[entry.blockKey] = projection;
    return projection;
  }

  function getCurrentCardRuntimeChoiceBlocks(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => block?.kind === "choice"
    );
  }

  function getCurrentCardRuntimeCompleteBlocks(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => blockUsesTextGapExercise(block)
    );
  }

  function getCurrentChoiceEntry(blockKey) {
    return (
      [
        ...getCurrentCardRuntimeChoiceBlocks(),
        ...getCurrentPopupRuntimeChoiceBlocks()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getCurrentCompleteEntry(blockKey) {
    return (
      [
        ...getCurrentCardRuntimeCompleteBlocks(),
        ...getCurrentPopupRuntimeCompleteBlocks()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getCurrentPopupRuntimeFlowcharts(card = getRenderContext().card) {
    const popupEntry = getCurrentPopupRuntimeButtonEntry(card);
    if (!popupEntry) {
      return [];
    }

    return collectRuntimeBlockEntries(
      popupEntry.block.popupBlocks,
      `${popupEntry.blockKey}::popup`,
      (block) => block?.kind === "flow"
    );
  }

  function getCurrentPopupRuntimeChoiceBlocks(card = getRenderContext().card) {
    const popupEntry = getCurrentPopupRuntimeButtonEntry(card);
    if (!popupEntry) {
      return [];
    }

    return collectRuntimeBlockEntries(
      popupEntry.block.popupBlocks,
      `${popupEntry.blockKey}::popup`,
      (block) => block?.kind === "choice"
    );
  }

  function getCurrentPopupRuntimeCompleteBlocks(card = getRenderContext().card) {
    const popupEntry = getCurrentPopupRuntimeButtonEntry(card);
    if (!popupEntry) {
      return [];
    }

    return collectRuntimeBlockEntries(
      popupEntry.block.popupBlocks,
      `${popupEntry.blockKey}::popup`,
      (block) => blockUsesTextGapExercise(block)
    );
  }

  function ensureCurrentChoiceExerciseState() {
    const choices = [
      ...getCurrentCardRuntimeChoiceBlocks(),
      ...getCurrentPopupRuntimeChoiceBlocks()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      choiceExerciseStateByBlockKey: {},
      exerciseShuffleSeed: `${buildCardPathKey(state.selection)}::load::${state.cardExerciseLoadVersion}`
    };

    choices.forEach((entry) => {
      const current = state.choiceExerciseByBlockKey[entry.blockKey];
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
      state.choiceExerciseByBlockKey[entry.blockKey] = {
        selected,
        feedback: current?.feedback || null
      };
      runtimeOptions.choiceExerciseStateByBlockKey[entry.blockKey] = state.choiceExerciseByBlockKey[entry.blockKey];
    });

    return runtimeOptions;
  }

  function ensureCurrentCompleteExerciseState() {
    const completes = [
      ...getCurrentCardRuntimeCompleteBlocks(),
      ...getCurrentPopupRuntimeCompleteBlocks()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      completeExerciseStateByBlockKey: {},
      textGapExerciseStateByBlockKey: {}
    };

    completes.forEach((entry) => {
      const current = state.completeExerciseByBlockKey[entry.blockKey];
      state.completeExerciseByBlockKey[entry.blockKey] = {
        values: Array.isArray(current?.values) ? current.values : [],
        feedback: current?.feedback || null
      };
      runtimeOptions.completeExerciseStateByBlockKey[entry.blockKey] = state.completeExerciseByBlockKey[entry.blockKey];
      runtimeOptions.textGapExerciseStateByBlockKey[entry.blockKey] = state.completeExerciseByBlockKey[entry.blockKey];
    });

    return runtimeOptions;
  }

  function setChoiceSelection(blockKey, optionId, checked) {
    const entry = getCurrentChoiceEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.choiceExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
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

    state.choiceExerciseByBlockKey[blockKey] = {
      selected: Array.from(selected),
      feedback: null
    };

    render({ preserveState: true });
  }

  function tryAgainChoice(blockKey) {
    ensureCurrentChoiceExerciseState();
    if (!state.choiceExerciseByBlockKey[blockKey]) {
      return;
    }
    state.choiceExerciseByBlockKey[blockKey] = {
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
    state.choiceExerciseByBlockKey[blockKey] = {
      selected: correct,
      feedback: "correct"
    };
    render({ preserveState: true });
  }

  function validateChoice(blockKey) {
    const entry = getCurrentChoiceEntry(blockKey);
    if (!entry) {
      return null;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.choiceExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
    const selected = new Set(Array.isArray(exercise.selected) ? exercise.selected : []);
    const options = Array.isArray(entry.block?.options) ? entry.block.options : [];
    const correct = new Set(getCorrectExerciseOptionIds(options, entry.block?.answerIds));

    if (!selected.size) {
      state.choiceExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Selecione pelo menos uma resposta.");
      focusFirstIncompleteChoice(blockKey);
      render({ preserveState: true });
      return "incomplete";
    }

    let ok = selected.size === correct.size;
    if (ok) {
      for (const idx of selected) {
        if (!correct.has(idx)) {
          ok = false;
          break;
        }
      }
    }

    state.choiceExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    render({ preserveState: true });
    return ok ? "correct" : "wrong";
  }

  function setCompleteBlank(blockKey, blankIndex, value, { rerender = false } = {}) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentCompleteExerciseState();
    const exercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
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
    state.completeExerciseByBlockKey[blockKey] = { values, feedback: null };
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
    const currentExercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const currentValues = Array.isArray(currentExercise.values) ? currentExercise.values : [];
    if (currentExercise.feedback) {
      state.completeExerciseByBlockKey[blockKey] = {
        values: currentValues.slice(),
        feedback: null
      };
    }
    state.activeTextGapPrompt = {
      blockKey,
      blankIndex: Number(blankIndex)
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
    if (!state.completeExerciseByBlockKey[blockKey]) {
      return;
    }
    state.completeExerciseByBlockKey[blockKey] = { values: [], feedback: null };
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

    const gapModel = buildResourceGapModel(entry.block);
    const answers = gapModel.answers;

    ensureCurrentCompleteExerciseState();
    state.completeExerciseByBlockKey[blockKey] = { values: answers, feedback: "correct" };
    if (state.activeTextGapPrompt?.blockKey === blockKey) {
      state.activeTextGapPrompt = null;
    }
    render({ preserveState: true });
  }

  function validateComplete(blockKey) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return null;
    }

    ensureCurrentCompleteExerciseState();
    const exercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const values = Array.isArray(exercise.values) ? exercise.values : [];
    const gapModel = buildResourceGapModel(entry.block);
    const answers = gapModel.answers;
    const tokens = gapModel.tokens;

    if (!answers.length) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "correct" };
      render({ preserveState: true });
      return "correct";
    }

    const normalizedValues = answers.map((_, idx) => normalizeTextGapResponse(values[idx]));
    if (normalizedValues.some((value) => !value)) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Preencha todas as lacunas.");
      focusFirstIncompleteTextGap(blockKey);
      render({ preserveState: true });
      return "incomplete";
    }

    const ok = normalizedValues.every((value, idx) =>
      textGapResponseMatches(tokens[idx], value)
    );
    state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    render({ preserveState: true });
    return ok ? "correct" : "wrong";
  }

  function ensureCurrentFlowchartPracticeState() {
    const flowcharts = [
      ...getCurrentCardRuntimeFlowcharts(),
      ...getCurrentPopupRuntimeFlowcharts()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      enableFlowchartPractice: true,
      flowchartProjectionByBlockKey: {},
      flowchartExerciseStateByBlockKey: {},
      activeFlowchartPrompt: null
    };

    flowcharts.forEach((entry) => {
      const projection = getStableFlowchartProjection(entry);
      state.flowchartPracticeByBlockKey[entry.blockKey] = createFlowchartExerciseState(
        projection,
        state.flowchartPracticeByBlockKey[entry.blockKey]
      );
      runtimeOptions.flowchartProjectionByBlockKey[entry.blockKey] = projection;
      runtimeOptions.flowchartExerciseStateByBlockKey[entry.blockKey] = state.flowchartPracticeByBlockKey[entry.blockKey];
    });

    if (state.activeFlowchartPrompt && runtimeOptions.flowchartExerciseStateByBlockKey[state.activeFlowchartPrompt.blockKey]) {
      runtimeOptions.activeFlowchartPrompt = state.activeFlowchartPrompt;
    } else {
      state.activeFlowchartPrompt = null;
    }

    return runtimeOptions;
  }

  function ensureCurrentCardRuntimeOptions() {
    const flowchartOptions = ensureCurrentFlowchartPracticeState();
    const choiceOptions = ensureCurrentChoiceExerciseState();
    const completeOptions = ensureCurrentCompleteExerciseState();
    return {
      ...flowchartOptions,
      ...choiceOptions,
      ...completeOptions,
      choiceExerciseStateByBlockKey: {
        ...(flowchartOptions.choiceExerciseStateByBlockKey || {}),
        ...(choiceOptions.choiceExerciseStateByBlockKey || {})
      },
      completeExerciseStateByBlockKey: {
        ...(completeOptions.completeExerciseStateByBlockKey || {})
      },
      textGapExerciseStateByBlockKey: {
        ...(completeOptions.textGapExerciseStateByBlockKey || {})
      },
      activeTextGapPrompt: state.activeTextGapPrompt,
      exerciseShuffleSeed: choiceOptions.exerciseShuffleSeed || flowchartOptions.exerciseShuffleSeed || "runtime"
    };
  }

  function openFlowchartPrompt(blockKey, kind, targetId) {
    if (!blockKey || !kind || !targetId) {
      return;
    }
    ensureCurrentFlowchartPracticeState();
    const current = state.flowchartPracticeByBlockKey[blockKey] || null;
    if (current?.feedback) {
      current.feedback = null;
    }
    const currentValue =
      kind === "shape"
        ? String(current?.shapes?.[targetId] || "").trim()
        : kind === "label"
          ? String(current?.labels?.[targetId] || "").trim()
          : String(current?.texts?.[targetId] || "").trim();

    // Ao clicar novamente numa lacuna já preenchida, o valor atual deve ser removido.
    if (currentValue) {
      setFlowchartPracticeValue(blockKey, kind, targetId, null, {
        closePrompt: false,
        rerender: false
      });
    }

    state.activeFlowchartPrompt = {
      blockKey,
      kind,
      targetId
    };
    render({ preserveState: true });
  }

  function closeFlowchartPrompt() {
    if (!state.activeFlowchartPrompt) {
      return;
    }
    state.activeFlowchartPrompt = null;
    render({ preserveState: true });
  }

  function setFlowchartPracticeValue(blockKey, choiceKind, targetId, value, { closePrompt = false, rerender = true } = {}) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry || !targetId || !choiceKind) {
      return;
    }

    const exercise = createFlowchartExerciseState(
      getStableFlowchartProjection(entry),
      state.flowchartPracticeByBlockKey[blockKey]
    );
    if (choiceKind === "shape") {
      exercise.shapes[targetId] = value;
    } else if (choiceKind === "label") {
      exercise.labels[targetId] = value;
    } else {
      exercise.texts[targetId] = value;
    }
    exercise.feedback = null;
    state.flowchartPracticeByBlockKey[blockKey] = exercise;
    if (closePrompt) {
      state.activeFlowchartPrompt = null;
    }
    if (rerender) {
      render({ preserveState: true });
    }
  }

  function clearFlowchartPracticeValue(blockKey, choiceKind, targetId) {
    setFlowchartPracticeValue(blockKey, choiceKind, targetId, null, {
      closePrompt: true,
      rerender: true
    });
  }

  function checkFlowchartPractice(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    const result = validateFlowchartExerciseState(
      getStableFlowchartProjection(entry),
      state.flowchartPracticeByBlockKey[blockKey]
    );
    state.flowchartPracticeByBlockKey[blockKey] = result.state;
    if (result.status === "incomplete") {
      notifyIncompleteExercise("Preencha todas as lacunas do fluxograma.");
      focusFirstIncompleteFlowchartTarget(
        blockKey,
        getStableFlowchartProjection(entry),
        result.state
      );
    }
    render({ preserveState: true });
  }

  function resetFlowchartPractice(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    state.flowchartPracticeByBlockKey[blockKey] = resetFlowchartExerciseState(
      getStableFlowchartProjection(entry),
      state.flowchartPracticeByBlockKey[blockKey]
    );
    state.activeFlowchartPrompt = null;
    render({ preserveState: true });
  }

  function viewFlowchartPracticeAnswer(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    state.flowchartPracticeByBlockKey[blockKey] = fillFlowchartExerciseAnswer(
      getStableFlowchartProjection(entry),
      state.flowchartPracticeByBlockKey[blockKey]
    );
    state.activeFlowchartPrompt = null;
    render({ preserveState: true });
  }

  function tryFlowchartPracticeAgain(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    const exercise = createFlowchartExerciseState(
      getStableFlowchartProjection(entry),
      state.flowchartPracticeByBlockKey[blockKey]
    );
    exercise.feedback = null;
    state.flowchartPracticeByBlockKey[blockKey] = exercise;
    render({ preserveState: true });
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
      assertCourseAuthoringAllowed(target.courseKey);
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

  function setEntityMode(level, requestedMode) {
    const allowAi = level === "lesson" || level === "microsequence" || level === "card";
    const mode = requestedMode === "edit" || (requestedMode === "ai" && allowAi)
      ? requestedMode
      : "view";
    if (mode !== "view") {
      try {
        assertCourseAuthoringAllowed(state.selection.courseKey);
      } catch (error) {
        state.bottomUpDraft.errorMessage = error.message;
        render({ preserveState: true });
        return;
      }
    }
    state.entityModes[level] = mode;
    if (level !== "card") {
      state.inlineStructureEditor = null;
      state.entityMutationError = "";
    }
    if (level === "card") {
      state.microsequenceMode = mode === "view" ? "play" : "assist";
      state.assistDraft.composerOpen = false;
      state.assistDraft.errorMessage = "";
      state.assistDraft.manualEditError = "";
      state.assistDraft.manualDraft = null;
      state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
      render({ preserveState: true });
      return;
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
    render({ preserveState: true });
  }

  function markBottomUpSyncPending(localState, microsequenceIds, reference = state.selection) {
    let nextLocalState = localState;
    for (const microsequenceKey of microsequenceIds) {
      nextLocalState = markContextualAuthoringSyncPending(
        nextLocalState,
        { ...reference, microsequenceKey }
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
      assertCourseAuthoringAllowed(state.selection.courseKey);
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
        requestedSelection
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
      moduleValue.lessons[lessonIndex] = applyContextualAuthoringInversePatch(
        moduleValue.lessons[lessonIndex],
        undo.inversePatch
      );
      let nextLocalState = setCardAssistanceUndo(state.assistDraft.localState, null);
      nextLocalState = markBottomUpSyncPending(
        nextLocalState,
        undo.affectedMicrosequenceIds,
        undo
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
      const workspaceRef = workspaceCourseRef(target.courseKey);
      if (!workspaceRef) assertCourseAuthoringAllowed(target.courseKey);
      else if (!workspaceAuthoringAvailable(target.courseKey)) {
        throw new Error("A edição deste curso de workspace não está disponível.");
      }
      const guard = workspaceRef ? null : requireCardAssistancePersistenceGuard(
        await storage.createLocalCourseDraftGuard(target.courseKey),
        target.courseKey
      );
      let nextProject;
      let entityPath;
      let metadata;
      if (level === "course") {
        nextProject = updateCourseDocument(state.project, {
          courseKey: target.courseKey,
          title,
          goal: description
        });
        entityPath = [target.courseKey];
        metadata = { title, goal: description };
      } else if (level === "module") {
        nextProject = updateModuleDocument(state.project, {
          courseKey: target.courseKey,
          moduleKey: target.moduleKey,
          title,
          goal: description
        });
        entityPath = [target.courseKey, target.moduleKey];
        metadata = { title, goal: description };
      } else if (level === "lesson") {
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
        metadata = {
          title,
          goal: description,
          role: microsequence.role,
          dependsOn: microsequence.dependsOn || [],
          covers: microsequence.covers || [],
          checks: microsequence.checks || []
        };
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
      if (workspaceRef) {
        const saved = await workspaceCourseHook("saveMetadata")({
          courseRef: workspaceRef,
          entityType: level,
          entityPath,
          metadata
        });
        if (Number.isSafeInteger(Number(saved?.revision))) {
          homeTrailsController.updateCourseRef(workspaceRef.trailItemId, {
            revision: Number(saved.revision)
          });
        }
        setProject(nextProject);
        const updatedCourse = findCourse(nextProject, target.courseKey);
        if (updatedCourse) {
          homeTrailsController.loadedCourses.set(
            workspaceRef.trailItemId,
            structuredClone(updatedCourse)
          );
        }
        await refreshHomeTrails();
      } else {
        await storage.saveProject(nextProject, {
          expectedLocalDraftRevision: guard.expectedRevision
        });
        await storage.flush?.();
        setProject(nextProject);
      }
      if (!workspaceRef && contextualAuthoringIsAvailable()) {
        const preservedSelection = { ...state.selection };
        await saveIntegratedEntityMetadata({
          ...contextualAuthoring,
          storage,
          courseKey: target.courseKey,
          entityType: level,
          entityPath,
          metadata,
          title: findCourse(state.project, target.courseKey)?.title
        });
        setProject(storage.loadProject());
        applySelectionByKeys(state.project, preservedSelection);
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
    const rendersCardRuntime = state.view === "microsequence";
    const currentCardRuntimeOptions = rendersCardRuntime
      ? ensureCurrentCardRuntimeOptions()
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
        (() => {
          const reference = workspaceCourseRef(course.id);
          if (!reference) return resolveCourseUiPermissions(storage, course.id);
          const canAuthorContent = reference.canEdit === true && workspaceAuthoringAvailable(course.id);
          return {
            role: canAuthorContent ? "author" : "learner",
            canAuthorContent,
            writeTarget: null,
            canOrganizeSelection: true,
            canRemoveSelection: false,
            canDeleteCourse: reference.canDelete === true && Boolean(workspaceCourseHook("deleteCourse")),
            canEdit: canAuthorContent,
            canDelete: reference.canDelete === true && Boolean(workspaceCourseHook("deleteCourse"))
          };
        })()
      ])
    );
    const currentCoursePermissions = context.course
      ? coursePermissionsById[context.course.id] || resolveCourseUiPermissions(storage, context.course.id)
      : {
          role: "learner",
          canAuthorContent: false,
          writeTarget: null,
          canOrganizeSelection: false,
          canRemoveSelection: false,
          canDeleteCourse: false,
          canEdit: false,
          canDelete: false
        };
    if (rendersCardRuntime) {
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
          homeOrganization: state.homeOrganization,
          reviewItems: state.view === "courses" ? homeReviewItems() : [],
          progress: activeProgress(
            state.view === "courses" ? state.homeSelectedCourseKey : context.course?.id
          ),
          entityModes: state.entityModes,
          entitySaving: state.entityMutationSaving,
          entityMutationError: state.entityMutationError,
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
                  state.assistDraft.localState.undo?.kind === "lesson" &&
                  state.assistDraft.localState.undo.courseKey === state.selection.courseKey &&
                  state.assistDraft.localState.undo.lessonKey === state.selection.lessonKey
                )
              }
            : null,
          cardAssistanceState: state.assistDraft.assistance,
          cardResourceTargets: rendersCardRuntime
            ? listCardResourceTargets(context.card).filter((target) =>
                target.location !== "after_text" || text(context.card?.after).trim()
              )
            : [],
          manualCardEditDraft: state.assistDraft.manualDraft,
          cardAssistanceComposerOpen: state.assistDraft.composerOpen,
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
            state.assistDraft.localState.undo?.kind === "microsequence" &&
            state.assistDraft.localState.undo.courseKey === state.selection.courseKey &&
            state.assistDraft.localState.undo.microsequenceKey === state.selection.microsequenceKey
          ),
          isSubmitting: state.assistDraft.isSubmitting,
          hasApiKey: Boolean(state.assistConfig.apiKey || state.assistConfig.providerSecret),
          cardRuntimeOptions: currentCardRuntimeOptions,
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

    const manualResourceEditor = root.querySelector(
      ".runtime-resource-edit-target[data-manual-target-id]"
    );
    if (manualResourceEditor) {
      manualResourceEditor.querySelectorAll("[data-flowchart-scroll='true']")
        .forEach((scrollNode) => autoFitFlowchartViewport(scrollNode));
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
        const courseKey = node.getAttribute("data-course-key");
        const course = findCourse(state.project, courseKey);
        if (!course) return;
        if (
          typeof globalThis.confirm === "function" &&
          !globalThis.confirm(`Zerar progresso de todo o curso "${course.title || "Curso"}"?`)
        ) return;
        resetCourseProgress(courseKey);
        render({ preserveState: false });
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
    root.querySelectorAll("[data-action='delete-home-trail-item']").forEach((node) => {
      node.addEventListener("click", () => {
        const trailItemId = node.getAttribute("data-trail-item-id") || "";
        const reference = homeTrailsController?.courseRefs.get(trailItemId);
        if (trailItemId && reference) {
          void deleteCourseDirect(reference.courseKey || "", { trailItemId });
        }
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
      if (!trailItemId || !homeTrailsController?.select(trailItemId)) return;
      state.homeSelectedTrailItemId = trailItemId;
      const item = homeTrailsController.item(trailItemId);
      state.homeSelectedCourseKey = homeTrailsController.courseRefs.get(trailItemId)?.courseKey ||
        item?.courseKey || item?.courseId || "";
      setProject(composeLoadedWorkspaceCourses(storage.loadProject()));
      render({ preserveState: true });
    });
    root.querySelector("[data-action='toggle-home-organize']")?.addEventListener("click", () => {
      state.homeOrganization.active = true;
      state.homeOrganization.error = "";
      render({ preserveState: false });
    });
    root.querySelector("[data-action='finish-home-organize']")?.addEventListener("click", () => {
      state.homeOrganization = {
        ...state.homeOrganization,
        active: false,
        creatingGroup: false,
        editingGroupId: "",
        movingItemId: "",
        error: ""
      };
      render({ preserveState: false });
    });
    root.querySelector("[data-action='start-home-group-create']")?.addEventListener("click", () => {
      state.homeOrganization.creatingGroup = true;
      state.homeOrganization.editingGroupId = "";
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
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='save-home-group']").forEach((node) => {
      node.addEventListener("click", () => {
        const form = node.closest("[data-home-group-form]");
        const title = String(form?.querySelector("[name='title']")?.value || "").trim();
        if (!title) return;
        const groupId = form?.getAttribute("data-group-id") || "";
        void mutateHomeTrails(groupId ? "renameGroup" : "createGroup", groupId
          ? { groupId, title }
          : { title }).then((snapshot) => {
          if (!snapshot) return;
          state.homeOrganization.creatingGroup = false;
          state.homeOrganization.editingGroupId = "";
          render({ preserveState: true });
        });
      });
    });
    root.querySelectorAll("[data-action='move-home-group-up'], [data-action='move-home-group-down']")
      .forEach((node) => {
        node.addEventListener("click", () => {
          const groupId = node.getAttribute("data-group-id") || "";
          const groups = state.homeTrailSnapshot?.groups || [];
          const index = groups.findIndex((group) => group.id === groupId);
          const delta = node.getAttribute("data-action") === "move-home-group-up" ? -1 : 1;
          const targetPosition = index + delta;
          if (index < 0 || targetPosition < 0 || targetPosition >= groups.length) return;
          void mutateHomeTrails("moveGroup", { groupId, targetPosition });
        });
      });
    root.querySelectorAll("[data-action='delete-home-group']").forEach((node) => {
      node.addEventListener("click", () => {
        const groupId = node.getAttribute("data-group-id") || "";
        if (!groupId) return;
        if (typeof globalThis.confirm === "function" && !globalThis.confirm("Excluir este grupo? Os itens irão para Outros.")) return;
        void mutateHomeTrails("deleteGroup", { groupId });
      });
    });
    root.querySelectorAll("[data-action='choose-home-item-group']").forEach((node) => {
      node.addEventListener("click", () => {
        state.homeOrganization.movingItemId = node.getAttribute("data-trail-item-id") || "";
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='cancel-home-item-move']").forEach((node) => {
      node.addEventListener("click", () => {
        state.homeOrganization.movingItemId = "";
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='save-home-item-group']").forEach((node) => {
      node.addEventListener("click", () => {
        const form = node.closest("[data-home-item-move-form]");
        const trailItemId = form?.getAttribute("data-home-item-move-form") || "";
        const groupId = String(form?.querySelector("[name='groupId']")?.value || "");
        if (!trailItemId || !groupId) return;
        void mutateHomeTrails(
          groupId === "__others__" ? "removeItemFromGroup" : "placeItem",
          groupId === "__others__" ? { trailItemId } : { trailItemId, groupId }
        ).then((snapshot) => {
          if (!snapshot) return;
          state.homeOrganization.movingItemId = "";
          render({ preserveState: true });
        });
      });
    });
    root.querySelectorAll("[data-action='detach-home-item']").forEach((node) => {
      node.addEventListener("click", () => {
        const trailItemId = node.getAttribute("data-trail-item-id") || "";
        if (trailItemId) void mutateHomeTrails("removeItemFromGroup", { trailItemId });
      });
    });
    root.querySelectorAll("[data-action='move-home-item-up'], [data-action='move-home-item-down']")
      .forEach((node) => {
        node.addEventListener("click", () => {
          const trailItemId = node.getAttribute("data-trail-item-id") || "";
          const groupId = node.getAttribute("data-group-id") || "";
          const groupItems = state.homeTrailSnapshot?.items
            ?.filter((item) => item.pathId === groupId)
            .sort((left, right) => left.itemPosition - right.itemPosition) || [];
          const index = groupItems.findIndex((item) => item.itemId === trailItemId);
          const delta = node.getAttribute("data-action") === "move-home-item-up" ? -1 : 1;
          const targetPosition = index + delta;
          if (index < 0 || targetPosition < 0 || targetPosition >= groupItems.length) return;
          void mutateHomeTrails("moveItem", { trailItemId, groupId, targetPosition });
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
        const current = state.choiceExerciseByBlockKey[blockKey];
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

    root.querySelectorAll("[data-action='complete-input']").forEach((node) => {
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

      if (node.getAttribute("contenteditable") !== "true") {
        return;
      }

      const updateEmptyAttribute = () => {
        const content = String(node.textContent || "").replace(/\u2007/g, "");
        const isEmpty = !content.length;
        node.setAttribute("data-empty", isEmpty ? "true" : "false");
      };

      updateEmptyAttribute();

      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
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
    root.querySelectorAll("[data-action='text-gap-open-choice']").forEach((node) => {
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
    root.querySelectorAll("[data-action='text-gap-set-choice']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        const blankIndex = node.getAttribute("data-complete-blank-index");
        const value = node.getAttribute("data-text-gap-value");
        if (!blockKey || blankIndex === null || value === null) return;
        setTextGapChoice(blockKey, blankIndex, value);
      });
    });
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

    root.querySelectorAll("[data-action='flowchart-open-shape']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFlowchartPrompt(
          node.getAttribute("data-flowchart-block-key"),
          "shape",
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-open-text']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFlowchartPrompt(
          node.getAttribute("data-flowchart-block-key"),
          "text",
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-open-label']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFlowchartPrompt(
          node.getAttribute("data-flowchart-block-key"),
          "label",
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-set-shape']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          "shape",
          node.getAttribute("data-flowchart-target-id"),
          node.getAttribute("data-flowchart-value"),
          { closePrompt: true, rerender: true }
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-set-text']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          "text",
          node.getAttribute("data-flowchart-target-id"),
          node.getAttribute("data-flowchart-value"),
          { closePrompt: true, rerender: true }
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-set-label']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          "label",
          node.getAttribute("data-flowchart-target-id"),
          node.getAttribute("data-flowchart-value"),
          { closePrompt: true, rerender: true }
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-clear-choice']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clearFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          node.getAttribute("data-flowchart-choice-kind"),
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-check']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        checkFlowchartPractice(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-reset']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        resetFlowchartPractice(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-view-answer']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        viewFlowchartPracticeAnswer(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-try-again']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        tryFlowchartPracticeAgain(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-close-prompt']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeFlowchartPrompt();
      });
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
          void openHomeTrailCourse(trailItemId, { mode: "edit" });
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
    root.querySelectorAll("[data-flowchart-inline-input='true']").forEach((node) => {
      node.addEventListener("click", () => {
        node.focus();
        if (typeof node.setSelectionRange === "function") {
          const size = String(node.value || "").length;
          node.setSelectionRange(size, size);
        }
      });
      node.addEventListener("input", () => {
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          node.getAttribute("data-flowchart-choice-kind"),
          node.getAttribute("data-flowchart-target-id"),
          node.value,
          { closePrompt: false, rerender: false }
        );
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          node.blur();
        }
      });
    });
    root.querySelector(".app-shell")?.addEventListener("click", (event) => {
      if (!state.activeFlowchartPrompt) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const insidePrompt = target.closest("[data-flowchart-prompt='true']");
      const promptTrigger = target.closest(
        "[data-action='flowchart-open-shape'], [data-action='flowchart-open-text'], [data-action='flowchart-open-label']"
      );
      if (!insidePrompt && !promptTrigger) {
        closeFlowchartPrompt();
      }
    });

    root.querySelectorAll("[data-flowchart-scroll='true']").forEach((scrollNode) => {
      autoFitFlowchartViewport(scrollNode);
      if (scrollNode.getAttribute("data-flowchart-centered") !== "true") {
        const stage = scrollNode.querySelector("[data-flowchart-stage='true']");
        const stageWidth = stage ? stage.offsetWidth : 0;
        const stageHeight = stage ? stage.offsetHeight : 0;
        if (stageWidth > 0 && stageHeight > 0) {
          scrollNode.scrollLeft = 0;
          scrollNode.scrollTop = 0;
          scrollNode.setAttribute("data-flowchart-centered", "true");
        }
      }

      scrollNode.addEventListener(
        "wheel",
        (event) => {
          if (!(event.ctrlKey || event.metaKey)) {
            return;
          }
          event.preventDefault();
          const currentScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
          const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
          setFlowchartViewportScale(scrollNode, currentScale * factor, event.clientX, event.clientY);
        },
        { passive: false }
      );
      scrollNode.addEventListener(
        "touchstart",
        (event) => {
          if (!event.touches || event.touches.length < 2) {
            return;
          }
          const touchA = event.touches[0];
          const touchB = event.touches[1];
          state.flowchartPinch = {
            scrollNode,
            startScale: Number(scrollNode.getAttribute("data-flowchart-scale") || 1),
            startDistance: getTouchDistance(touchA, touchB)
          };
          event.preventDefault();
        },
        { passive: false }
      );
      scrollNode.addEventListener(
        "touchmove",
        (event) => {
          if (!state.flowchartPinch || state.flowchartPinch.scrollNode !== scrollNode || !event.touches || event.touches.length < 2) {
            return;
          }
          const touchA = event.touches[0];
          const touchB = event.touches[1];
          const distance = getTouchDistance(touchA, touchB);
          if (!distance || !state.flowchartPinch.startDistance) {
            return;
          }
          const midpoint = getTouchMidpoint(touchA, touchB);
          const nextScale = state.flowchartPinch.startScale * (distance / state.flowchartPinch.startDistance);
          setFlowchartViewportScale(scrollNode, nextScale, midpoint.x, midpoint.y);
          event.preventDefault();
        },
        { passive: false }
      );
      const finishPinch = () => {
        if (state.flowchartPinch?.scrollNode === scrollNode) {
          state.flowchartPinch = null;
        }
      };
      scrollNode.addEventListener("touchend", finishPinch);
      scrollNode.addEventListener("touchcancel", finishPinch);
    });

    root.querySelectorAll("[data-action='flowchart-zoom-in']").forEach((node) => {
      node.addEventListener("click", () => {
        const scrollNode = node.closest(".runtime-flow-board-shell")?.querySelector("[data-flowchart-scroll='true']");
        if (!scrollNode) return;
        const currentScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
        setFlowchartViewportScale(scrollNode, currentScale + 0.1);
      });
    });
    root.querySelectorAll("[data-action='flowchart-zoom-out']").forEach((node) => {
      node.addEventListener("click", () => {
        const scrollNode = node.closest(".runtime-flow-board-shell")?.querySelector("[data-flowchart-scroll='true']");
        if (!scrollNode) return;
        const currentScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
        setFlowchartViewportScale(scrollNode, currentScale - 0.1);
      });
    });
    root.querySelectorAll("[data-action='flowchart-zoom-reset']").forEach((node) => {
      node.addEventListener("click", () => {
        const scrollNode = node.closest(".runtime-flow-board-shell")?.querySelector("[data-flowchart-scroll='true']");
        if (!scrollNode) return;
        const defaultScale = Number(node.getAttribute("data-flowchart-default-scale") || 1);
        setFlowchartViewportScale(scrollNode, defaultScale);
      });
    });

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
      void attemptContextualAuthoringSync();
    });
  }
  render({ preserveState: false });
  void refreshHomeTrails({ preserveSelection: false });
  void loadCardAssistanceLocalState(state.selection.courseKey).then(() => {
    if (globalThis.navigator?.onLine !== false) {
      return attemptContextualAuthoringSync();
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
    openCardPath(entityPath, { edit = false } = {}) {
      const selection = resolveExactCardSelection(state.project, entityPath);
      if (!selection) return false;
      applySelection(selection);
      if (edit) {
        openCardAssistanceMode(selection.microsequenceKey, selection.cardIndex);
      } else {
        openMicrosequenceScreen(selection.microsequenceKey, selection.cardIndex, "play");
      }
      return true;
    }
  };
}
