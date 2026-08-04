import { renderLessonScreen } from "./renderLessonScreen.js";
import { renderCardCommentOverlay } from "./renderCardCommentOverlay.js";
import { renderEntityEditorOverlay } from "./renderEntityEditorOverlay.js";
import { renderAssistConfigOverlay } from "./renderAssistConfigOverlay.js";
import { renderProviderConfigOverlay } from "./renderProviderConfigOverlay.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { applyManualCardEdit } from "./manualCardEdit.js";
import { buildEntityEditorModel } from "./entityEditorModel.js";
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
import { DEEPSEEK_BASE_URL, DEEPSEEK_QUALITY_MODEL, isDeepSeekModelId } from "../generation/providers/deepSeekPolicy.js";
import {
  CUSTOM_PROVIDER_MODEL_ID,
  isCustomProviderSelection,
  isLocalProviderSelection,
  PROVIDER_PROTOCOL,
  resolveConfiguredModelId
} from "../generation/providers/providerRegistry.js";
import { executeCardAssistance } from "../generation/runtime/cardAssistanceRuntime.js";
import {
  enqueueCardAssistanceRequest,
  clearContextualAuthoringSync,
  markContextualAuthoringSyncPending,
  normalizeCardAssistanceLocalState,
  removeQueuedCardAssistanceRequest,
  setContextualAuthoringReplacement,
  setCardAssistanceUndo
} from "../assist/cardAssistanceLocalState.js";
import { materializeContextualCourseDraft } from "../assist/contextualAuthoringSync.js";
import {
  deleteIntegratedEntity,
  deleteIntegratedPrivateCourse,
  moveIntegratedEntity,
  saveIntegratedEntityMetadata
} from "../assist/integratedCourseSync.js";
import {
  applyCardAssistanceBatchChangeSet,
  assertCardAssistanceScopeCurrent,
  listCardResourceTargets
} from "../assist/cardAssistanceScope.js";
import {
  cardAssistancePreviewMatchesSelection,
  cardAssistanceSelectionIsReady,
  createCardAssistanceUiState,
  reconcileCardAssistanceUiState,
  selectCardAssistanceOperation,
  selectCardCreationPlacement,
  selectCardRepairScope,
  toggleCardAssistanceCard,
  toggleCardAssistanceResource
} from "./cardAssistanceUiState.js";
import {
  createDefaultCourseModel
} from "../generation/runtime/courseModelSemantics.js";
import {
  applyAssistConfigPatch,
  checkCodexCliConnection,
  createCodexCliSetupStatus,
  normalizeAssistConfig
} from "../generation/runtime/cardAssistanceConfig.js";
import {
  createProfileTuning
} from "../generation/runtime/profileTuning.js";
import {
  removeCardProgressEntries,
  removeLessonProgressEntries,
  writeLessonProgressEntry
} from "../storage/progressStore.js";
import { resolveMicrosequenceRuntimeIncluded } from "../model/microsequenceStatus.js";
import { ingestAttachments } from "../generation/ingestion/attachmentIngestion.js";
import { DEFAULT_ENGINE_PROFILE_ID, listEngineProfileSeeds } from "../generation/config/engineProfileRegistry.js";
import {
  updateCourse as updateCourseDocument,
  updateLesson as updateLessonDocument,
  updateModule as updateModuleDocument,
  updateCardInMicrosequence
} from "../editor/contractEditor.js";

const MAX_ASSIST_ATTACHMENTS = 8;
const ASSIST_ATTACHMENT_EXTENSIONS = new Set([
  "txt",
  "csv",
  "json",
  "md",
  "html",
  "xml",
  "yml",
  "yaml",
  "pdf",
  "docx"
]);
const ASSIST_ATTACHMENT_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "application/json",
  "text/markdown",
  "text/html",
  "application/xml",
  "text/xml",
  "application/yaml",
  "text/yaml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const ASSIST_MODEL_OPTIONS = [
  { value: DEEPSEEK_QUALITY_MODEL, label: "DeepSeek Quality" },
  { value: "deepseek-v4-flash", label: "DeepSeek v4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek v4 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: CODEX_LOCAL_MODEL_ID, label: "Codex local" },
  { value: CUSTOM_PROVIDER_MODEL_ID, label: "Outro modelo" }
];
const DIDACTIC_PROFILE_SEED_OPTIONS = listEngineProfileSeeds().map((profile) => ({
  value: profile.profileId,
  label: profile.label || profile.profileId
}));
const COURSES_VIEWS = new Set(["courses", "course", "module", "lesson", "microsequence"]);

export function canSubmitCardAssistanceRequest({
  promptText,
  attachmentCount = 0,
  isSubmitting,
  selectionReady = false,
  hasPreview = false
}) {
  const hasInput = Boolean(String(promptText || "").trim()) || Number(attachmentCount) > 0;
  return hasInput && selectionReady && !isSubmitting && !hasPreview;
}

export function resolveCourseUiPermissions(storage, courseIdentity) {
  const fallback = { role: "learner", canEdit: false, canDelete: false };
  if (!courseIdentity || typeof storage?.coursePermissions !== "function") return fallback;
  const permissions = storage.coursePermissions(courseIdentity) || {};
  return {
    role: String(permissions.role || "learner"),
    canEdit: permissions.canEdit === true,
    canDelete: permissions.canDelete === true
  };
}



function fail(message) {
  throw new Error(message);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildDidacticProfileOptions(customProfiles = []) {
  return [
    ...DIDACTIC_PROFILE_SEED_OPTIONS,
    ...(Array.isArray(customProfiles)
      ? customProfiles.map((profile) => ({
          value: profile.id,
          label: profile.label || profile.id
        }))
      : [])
  ];
}

function buildAssistCustomProfileId() {
  return `assist.custom.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeAssistAttachmentName(value, fallback = "documento") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}









function buildAssistAttachmentSignature(file) {
  if (!file || typeof file !== "object") {
    return "";
  }

  return [
    normalizeAssistAttachmentName(file.name),
    Number(file.size || 0),
    Number(file.lastModified || 0),
    String(file.type || "").trim()
  ].join("::");
}

function isSupportedAssistAttachment(file) {
  const name = normalizeAssistAttachmentName(file?.name, "");
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const mimeType = String(file?.type || "").trim().toLowerCase();
  return extension
    ? ASSIST_ATTACHMENT_EXTENSIONS.has(extension)
    : ASSIST_ATTACHMENT_MIME_TYPES.has(mimeType);
}

export function normalizeAssistAttachmentSelection(files = []) {
  const nextItems = [];
  const seen = new Set();
  const warnings = [];

  for (const file of files || []) {
    if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
      warnings.push("Um arquivo não pôde ser lido pelo navegador e não foi adicionado.");
      continue;
    }

    const name = normalizeAssistAttachmentName(file.name);
    if (!isSupportedAssistAttachment(file)) {
      warnings.push(
        `${name}: formato não suportado. Use texto, CSV, JSON, Markdown, HTML, XML, YAML, PDF ou DOCX.`
      );
      continue;
    }
    const signature = buildAssistAttachmentSignature(file);
    if (!signature) {
      warnings.push(`${name}: não foi possível identificar o arquivo.`);
      continue;
    }
    if (seen.has(signature)) {
      warnings.push(`${name}: anexo duplicado não foi adicionado.`);
      continue;
    }
    if (nextItems.length >= MAX_ASSIST_ATTACHMENTS) {
      warnings.push(`${name}: o limite é de ${MAX_ASSIST_ATTACHMENTS} anexos por pedido.`);
      continue;
    }
    seen.add(signature);
    nextItems.push(file);
  }

  return {
    attachments: nextItems,
    warnings
  };
}

function normalizeAssistAttachmentList(files = []) {
  return normalizeAssistAttachmentSelection(files).attachments;
}

function clampFlowchartScale(value) {
  return Math.max(0.45, Math.min(2.4, Number(value || 1)));
}

export function createLessonEditorApp({
  root,
  storage,
  editor,
  initialProject,
  assistProvider = null,
  contextualAuthoring = null
}) {
  if (!root) fail("Raiz inválida.");
  if (!storage || typeof storage.loadProject !== "function") fail("Storage inválido.");
  if (
    typeof storage.loadCommentForPath !== "function" ||
    typeof storage.saveCommentForPath !== "function" ||
    typeof storage.deleteCommentForPath !== "function"
  ) fail("Storage relacional de comentários inválido.");
  if (!editor) fail("Editor inválido.");
  if (!initialProject || !Array.isArray(initialProject.courses)) fail("Projeto inicial inválido.");
  const initialAssistConfig = normalizeAssistConfig({});
  const state = {
    project: initialProject,
    view: "courses",
    homeTab: "courses",
    selection: null,
    cardCommentOpen: false,
    entityEditor: null,
    entityEditorSaving: false,
    entityEditorError: "",
    assistConfigOpen: false,
    providerConfigOpen: false,
    assistConfig: initialAssistConfig,
    assistConfigDraft: { ...initialAssistConfig },
    assistProfileEditor: null,
    codexCliSetupStatus: createCodexCliSetupStatus(),
    microsequenceMode: "play",
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
      editMode: false,
      promptText: "",
      attachments: [],
      assistance: createCardAssistanceUiState(),
      preview: null,
      undo: null,
      localState: normalizeCardAssistanceLocalState({}),
      localStateCourseKey: "",
      processingQueuedRequest: false,
      syncingContextualAuthoring: false,
      isSubmitting: false,
      errorMessage: "",
      ingestionMessage: "",
      manualEditError: ""
    },
    structureDrag: null,
    structureDrop: null,
    lastCoursesView: "courses",
    pendingExerciseFocus: null
  };

  state.selection = resolveFirstSelection(state.project);

  function setProject(nextProject) {
    state.project = nextProject;
    state.flowchartProjectionByBlockKey = {};
  }

  function commitVisibleProjectMutation(mutator, input) {
    const nextProject = mutator(state.project, input);
    storage.saveProject(nextProject);
    return nextProject;
  }

  const structuralEditor = {
    updateCourse(input) {
      return commitVisibleProjectMutation(updateCourseDocument, input);
    },
    updateModule(input) {
      return commitVisibleProjectMutation(updateModuleDocument, input);
    },
    updateLesson(input) {
      return commitVisibleProjectMutation(updateLessonDocument, input);
    }
  };

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
      microsequenceKey: node.getAttribute("data-microsequence-key") || ""
    };
  }

  function isSameStructurePayload(left, right) {
    return !!left &&
      !!right &&
      left.level === right.level &&
      left.courseKey === right.courseKey &&
      left.moduleKey === right.moduleKey &&
      left.lessonKey === right.lessonKey &&
      left.microsequenceKey === right.microsequenceKey;
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
    return false;
  }

  function clearStructureDropClasses() {
    root
      .querySelectorAll(
        ".structure-drop-before, .structure-drop-after, .structure-drag-origin"
      )
      .forEach((node) => {
        node.classList.remove(
          "structure-drop-before",
          "structure-drop-after",
          "structure-drag-origin"
        );
      });
  }

  function getStructureDropClass(position) {
    return position === "after" ? "structure-drop-after" : "structure-drop-before";
  }

  function resetStructureDragState() {
    state.structureDrag = null;
    state.structureDrop = null;
    clearStructureDropClasses();
  }

  function resolveStructureDropIndex(items, draggedKey, targetKey, position) {
    const fromIndex = (items || []).findIndex((item) => item.key === draggedKey);
    const targetIndex = (items || []).findIndex((item) => item.key === targetKey);
    if (fromIndex < 0 || targetIndex < 0) {
      return null;
    }

    let nextIndex = position === "after" ? targetIndex + 1 : targetIndex;
    if (fromIndex < nextIndex) {
      nextIndex -= 1;
    }

    return nextIndex;
  }

  function getStructureDropPosition(targetNode, clientY) {
    const rect = targetNode.getBoundingClientRect();
    return clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  function readStructureCollection(node) {
    if (!node) {
      return null;
    }
    const level = node.getAttribute("data-structure-collection") || "";
    if (!level) {
      return null;
    }
    return readStructurePayload(node, level);
  }

  function getStructureCollectionItems(node, level) {
    return Array.from(node?.children || []).filter((child) => child.getAttribute?.("data-structure-target") === level);
  }

  function resolveCollectionDropState(collectionNode, drag, clientY) {
    const collection = readStructureCollection(collectionNode);
    if (!collection || !drag || collection.level !== drag.level) {
      return null;
    }

    const items = getStructureCollectionItems(collectionNode, collection.level)
      .map((node) => ({
        node,
        payload: readStructurePayload(node)
      }))
      .filter((entry) => canDropStructure(drag, entry.payload));

    if (!items.length) {
      return null;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const firstRect = first.node.getBoundingClientRect();
    const lastRect = last.node.getBoundingClientRect();
    const firstThreshold = firstRect.top + firstRect.height / 2;
    const lastThreshold = lastRect.top + lastRect.height / 2;

    if (clientY <= firstThreshold) {
      return { target: first.payload, position: "before", node: first.node };
    }
    if (clientY >= lastThreshold) {
      return { target: last.payload, position: "after", node: last.node };
    }

    for (const entry of items) {
      const position = getStructureDropPosition(entry.node, clientY);
      const rect = entry.node.getBoundingClientRect();
      const threshold = rect.top + rect.height / 2;
      if (
        (position === "before" && clientY <= threshold)
        || (position === "after" && clientY >= threshold)
      ) {
        return { target: entry.payload, position, node: entry.node };
      }
    }

    return { target: last.payload, position: "after", node: last.node };
  }

  function markStructureDropTarget(targetNode, position) {
    clearStructureDropClasses();
    const originNode = state.structureDrag?.originNode || null;
    originNode?.classList.add("structure-drag-origin");
    targetNode.classList.add(getStructureDropClass(position));
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

  function openCourse(courseKey) {
    const navigationState = buildCourseNavigationState(state.project, courseKey);
    if (!navigationState) return;
    Object.assign(state, buildNavigationViewState(navigationState));

    render({ preserveState: false });
  }

  function openModule(moduleKey) {
    const navigationState = buildModuleNavigationState(state.project, {
      courseKey: state.selection.courseKey,
      moduleKey
    });
    if (!navigationState) return;
    Object.assign(state, buildNavigationViewState(navigationState));

    render({ preserveState: false });
  }

  function openLesson(moduleKey, lessonKey) {
    const navigationState = buildLessonNavigationState(state.project, storage.loadProgress(), {
      courseKey: state.selection.courseKey,
      moduleKey,
      lessonKey
    });
    if (!navigationState) return;
    Object.assign(state, buildNavigationViewState(navigationState));

    render({ preserveState: false });
  }

  function getLessonProgressReference(courseKey, moduleKey, lessonKey) {
    if (!courseKey || !moduleKey || !lessonKey) {
      return null;
    }

    return { courseKey, moduleKey, lessonKey };
  }

  function currentCardIsMarkedForReview() {
    return Boolean(storage.isCardMarkedForReview?.(state.selection));
  }

  async function toggleCurrentCardReviewMark() {
    if (typeof storage.setCardReviewMark !== "function" || !state.selection.cardKey) return;
    try {
      await storage.setCardReviewMark(
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

    const currentProgress = storage.loadProgress();
    const nextProgress = writeLessonProgressEntry(
      currentProgress,
      reference,
      lessonCards.map((entry) => entry.card),
      reachedIndex
    );
    storage.saveProgress(nextProgress);
  }

  function collectProgressReferencesInModule(courseKey, moduleValue) {
    return (moduleValue?.lessons || []).map((lesson) => ({
      courseKey,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id
    }));
  }

  function removeProgressEntries(lessonReferences) {
    if (typeof storage.removeProgressEntries === "function") {
      storage.removeProgressEntries(lessonReferences);
      return;
    }
    const currentProgress = storage.loadProgress();
    const nextProgress = removeLessonProgressEntries(currentProgress, lessonReferences);
    storage.saveProgress(nextProgress);
  }



























  function getAssistModelLabel(model) {
    if (isCustomProviderSelection(model)) {
      return resolveConfiguredModelId({
        selectedModel: model,
        customModelId: state.assistConfig.customModelId
      }) || "Outro modelo";
    }
    return ASSIST_MODEL_OPTIONS.find((item) => item.value === model)?.label || model;
  }

  function cloneAssistConfig(config = state.assistConfig) {
    return structuredClone(config || {});
  }

  function findAssistCustomProfile(profileId = "", customProfiles = state.assistConfig.customProfiles) {
    return (Array.isArray(customProfiles) ? customProfiles : []).find((entry) => entry.id === String(profileId || "").trim()) || null;
  }

  function getSelectedAssistProfileId(config = state.assistConfig) {
    return config.selectedProfileId || config.didacticProfileId || DEFAULT_ENGINE_PROFILE_ID;
  }

  function getAssistProfileEditorViewModel(config = state.assistConfig) {
    const selectedProfileId = getSelectedAssistProfileId(config);
    const selectedCustomProfile = findAssistCustomProfile(selectedProfileId, config.customProfiles);
    const editor = state.assistProfileEditor;
    const draftLabel = editor?.draftLabel || "";
    const normalizedLabel = String(draftLabel).trim();
    const isCreateMode = editor?.mode === "create";
    const isEditMode = editor?.mode === "edit";
    const hasUnsavedChanges = hasUnsavedAssistCustomProfileChanges(config);
    const canSave =
      (Boolean(editor?.active) &&
        Boolean(normalizedLabel) &&
        ((isCreateMode && Boolean(editor?.profileId)) ||
          (isEditMode &&
            selectedCustomProfile &&
            (normalizedLabel !== String(editor?.originalLabel || "").trim() || hasUnsavedChanges)))) ||
      (!editor?.active && hasUnsavedChanges);

    return {
      active: Boolean(editor?.active),
      mode: editor?.mode || "",
      draftLabel,
      canEdit: Boolean(selectedCustomProfile),
      canDelete: Boolean(selectedCustomProfile),
      canSave,
      state: editor?.active ? "editing" : canSave ? "dirty" : "saved"
    };
  }

  function createEmptyAssistProfileTuning() {
    return createProfileTuning(DEFAULT_ENGINE_PROFILE_ID, {
      targetStudentProfile: "",
      courseModelEdited: true,
      courseModel: {
        description: "",
        learningTrail: "",
        microsequenceProgression: ""
      }
    });
  }

  function hasUnsavedAssistCustomProfileChanges(config = state.assistConfig) {
    const selectedProfileId = getSelectedAssistProfileId(config);
    const selectedCustomProfile = findAssistCustomProfile(selectedProfileId, config.customProfiles);
    if (!selectedCustomProfile) {
      return false;
    }
    return (
      selectedCustomProfile.baseProfileId !== config.didacticProfileId ||
      JSON.stringify(selectedCustomProfile.profileTuning || {}) !== JSON.stringify(config.profileTuning || {})
    );
  }

  function cancelAssistProfileEditor() {
    const snapshot = state.assistProfileEditor?.snapshot;
    state.assistProfileEditor = null;
    if (!snapshot) {
      return;
    }
    state.assistConfig = normalizeAssistConfig(snapshot);
    state.assistConfigDraft = structuredClone(state.assistConfig);
  }

  function startAssistCustomProfileCreation() {
    state.assistProfileEditor = {
      active: true,
      mode: "create",
      profileId: buildAssistCustomProfileId(),
      draftLabel: "",
      originalLabel: "",
      baseProfileId: DEFAULT_ENGINE_PROFILE_ID,
      snapshot: cloneAssistConfig()
    };
    state.assistConfig = normalizeAssistConfig({
      ...state.assistConfig,
      selectedProfileId: DEFAULT_ENGINE_PROFILE_ID,
      didacticProfileId: DEFAULT_ENGINE_PROFILE_ID,
      profileTuning: createEmptyAssistProfileTuning()
    });
    state.assistConfigDraft = structuredClone(state.assistConfig);
    render({ preserveState: true });
  }

  function startAssistCustomProfileRename() {
    const selectedProfileId = getSelectedAssistProfileId();
    const selectedCustomProfile = findAssistCustomProfile(selectedProfileId);
    if (!selectedCustomProfile) {
      return;
    }
    state.assistProfileEditor = {
      active: true,
      mode: "edit",
      profileId: selectedCustomProfile.id,
      draftLabel: selectedCustomProfile.label || "",
      originalLabel: selectedCustomProfile.label || "",
      baseProfileId: selectedCustomProfile.baseProfileId,
      snapshot: cloneAssistConfig()
    };
    render({ preserveState: true });
  }

  function updateAssistProfileEditorLabel(label = "") {
    if (!state.assistProfileEditor?.active) {
      return;
    }
    state.assistProfileEditor = {
      ...state.assistProfileEditor,
      draftLabel: String(label || "")
    };
    render({ preserveState: true });
  }

  function saveAssistProfileEditor() {
    const editor = state.assistProfileEditor;
    if (!editor?.active) {
      const selectedProfileId = getSelectedAssistProfileId();
      const selectedCustomProfile = findAssistCustomProfile(selectedProfileId);
      if (!selectedCustomProfile || !hasUnsavedAssistCustomProfileChanges()) {
        return;
      }
      persistAssistConfigValue({
        customProfiles: (state.assistConfig.customProfiles || []).map((entry) =>
          entry.id === selectedCustomProfile.id
            ? {
                ...entry,
                baseProfileId: state.assistConfig.didacticProfileId,
                profileTuning: structuredClone(state.assistConfig.profileTuning || {})
              }
            : entry
        )
      });
      render({ preserveState: true });
      return;
    }

    const normalizedLabel = String(editor.draftLabel || "").trim();
    if (!normalizedLabel) {
      return;
    }

    if (editor.mode === "create") {
      const customProfile = {
        id: editor.profileId || buildAssistCustomProfileId(),
        label: normalizedLabel,
        baseProfileId: state.assistConfig.didacticProfileId || DEFAULT_ENGINE_PROFILE_ID,
        profileTuning: structuredClone(state.assistConfig.profileTuning || createProfileTuning(state.assistConfig.didacticProfileId))
      };
      persistAssistConfigValue({
        selectedProfileId: customProfile.id,
        customProfiles: [...(state.assistConfig.customProfiles || []), customProfile]
      });
    } else if (editor.mode === "edit") {
      persistAssistConfigValue({
        customProfiles: (state.assistConfig.customProfiles || []).map((entry) =>
          entry.id === editor.profileId
            ? {
                ...entry,
                label: normalizedLabel,
                baseProfileId: state.assistConfig.didacticProfileId,
                profileTuning: structuredClone(state.assistConfig.profileTuning || {})
              }
            : entry
        )
      });
    }

    state.assistProfileEditor = null;
    render({ preserveState: true });
  }

  function deleteAssistCustomProfile() {
    const selectedProfileId = getSelectedAssistProfileId();
    const selectedCustomProfile = findAssistCustomProfile(selectedProfileId);
    if (!selectedCustomProfile) {
      return;
    }

    persistAssistConfigValue({
      selectedProfileId: selectedCustomProfile.baseProfileId,
      didacticProfileId: selectedCustomProfile.baseProfileId,
      profileTuning: createProfileTuning(selectedCustomProfile.baseProfileId),
      customProfiles: (state.assistConfig.customProfiles || []).filter((entry) => entry.id !== selectedCustomProfile.id)
    });
    state.assistProfileEditor = null;
    render({ preserveState: true });
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

  function openAssistConfig() {
    state.assistConfigDraft = cloneAssistConfig();
    state.assistConfigOpen = true;
    render({ preserveState: true });
  }

  function closeAssistConfig() {
    cancelAssistProfileEditor();
    state.assistConfigOpen = false;
    render({ preserveState: true });
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
    const leavingCustomProvider = isCustomProviderSelection(state.assistConfig.model) && !isCustomProviderSelection(model);
    const shouldDefaultDeepSeekBaseUrl =
      isDeepSeekModelId(model)
      && !String(state.assistConfig.baseUrl || "").trim();
    state.assistConfig = normalizeAssistConfig({
      ...state.assistConfig,
      model,
      ...(shouldDefaultDeepSeekBaseUrl
        ? { baseUrl: DEEPSEEK_BASE_URL }
        : {}),
      ...(leavingCustomProvider ? { providerSecret: "" } : {})
    });
    if (state.assistConfigOpen) {
      state.assistConfigDraft = cloneAssistConfig();
    }
    if (isCustomProviderSelection(model)) {
      state.providerConfigOpen = true;
    }
    void handleCodexModelSelection(state.assistConfig.model);
  }

  function selectAssistDidacticProfile(profileSelectionId = state.assistConfig.selectedProfileId || state.assistConfig.didacticProfileId) {
    const customProfile = findAssistCustomProfile(profileSelectionId, state.assistConfig.customProfiles);
    if (customProfile) {
      persistAssistConfigValue({
        selectedProfileId: customProfile.id,
        didacticProfileId: customProfile.baseProfileId,
        profileTuning: structuredClone(customProfile.profileTuning)
      });
      render({ preserveState: true });
      return;
    }

    const profileId = String(profileSelectionId || "").trim() || state.assistConfig.didacticProfileId;
    persistAssistConfigValue({
      selectedProfileId: profileId,
      didacticProfileId: profileId,
      profileTuning: createProfileTuning(profileId)
    });
    render({ preserveState: true });
  }

  function resetAssistProfileTuning(profileSelectionId = state.assistConfig.selectedProfileId || state.assistConfig.didacticProfileId) {
    selectAssistDidacticProfile(profileSelectionId);
  }

  function updateAssistProfileTuning(patch = {}) {
    persistAssistConfigValue({
      profileTuning: {
        ...(state.assistConfig.profileTuning || {}),
        ...patch
      }
    });
  }

  function updateAssistCourseModel(patch = {}) {
    const nextCourseModel = createDefaultCourseModel({
      ...(state.assistConfig.profileTuning?.courseModel || {}),
      ...patch
    });
    updateAssistProfileTuning({
      courseModelEdited: true,
      courseModel: nextCourseModel
    });
  }

  function persistAssistConfigValue(patch = {}) {
    const nextAssistConfigState = applyAssistConfigPatch({
      assistConfig: state.assistConfig,
      patch
    });
    state.assistConfig = nextAssistConfigState.assistConfig;
    state.assistConfigDraft = nextAssistConfigState.assistConfigDraft;
    state.assistConfigDraft = structuredClone(state.assistConfig);
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
      state.assistDraft.promptText = "";
      state.assistDraft.attachments = [];
      state.assistDraft.errorMessage = "";
      state.assistDraft.ingestionMessage = "";
    }
    if (!cardAssistancePreviewMatchesSelection(state.assistDraft.preview, state.selection)) {
      state.assistDraft.preview = null;
    }
    state.assistDraft.attachments = normalizeAssistAttachmentList(state.assistDraft.attachments);
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
      openMicrosequenceAssistPage(microsequenceKey, targetIndex);
      return;
    }

    state.view = "microsequence";
    state.microsequenceMode = mode;
    state.assistDraft.editMode = mode === "assist";
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
    void loadCardAssistanceLocalState(state.selection.courseKey);
  }

  function openMicrosequenceAssistPage(microsequenceKey, targetIndex = 0) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence) return;
    state.selection.microsequenceKey = microsequence.id;
    selectMicrosequenceCard(microsequenceKey, targetIndex);

    state.view = "microsequence";
    state.assistDraft.editMode = true;
    state.assistDraft.attachments = [];
    state.assistDraft.promptText = "";
    state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
    state.assistDraft.preview = null;
    state.assistDraft.errorMessage = "";
    state.microsequenceMode = "assist";
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.entityEditor = null;
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
    const comment = storage.loadCommentForPath(state.selection);
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
    state.entityEditor = null;
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
      await storage.saveCommentForPath(state.selection, {
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

  function openEntityEditor(kind, target = {}) {
    state.entityEditor = {
      kind,
      courseKey: target.courseKey || state.selection.courseKey,
      moduleKey: target.moduleKey || state.selection.moduleKey,
      lessonKey: target.lessonKey || state.selection.lessonKey,
      microsequenceKey: target.microsequenceKey || state.selection.microsequenceKey,
      cardKey: target.cardKey || state.selection.cardKey
    };
    state.entityEditorSaving = false;
    state.entityEditorError = "";
    state.cardCommentOpen = false;
    state.assistConfigOpen = false;
    render({ preserveState: true });
  }











  function closeEntityEditor() {
    if (state.entityEditorSaving) return;
    state.entityEditor = null;
    state.entityEditorError = "";
    render({ preserveState: true });
  }

  function parseEntityTagComboboxValues(node) {
    if (!node) return [];
    try {
      const parsed = JSON.parse(String(node.getAttribute("data-values") || "[]"));
      return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function readEntityFieldValue(node) {
    if (!node) return "";
    if (node instanceof HTMLSelectElement && node.multiple) {
      return Array.from(node.selectedOptions).map((option) => option.value);
    }
    if (node instanceof HTMLElement && node.classList.contains("entity-tag-combobox")) {
      return parseEntityTagComboboxValues(node);
    }
    return node.value;
  }

  function setEntityTagComboboxValues(node, nextValues) {
    if (!(node instanceof HTMLElement) || !node.classList.contains("entity-tag-combobox")) {
      return;
    }

    const selectedRow = node.querySelector("[data-role='selected-tags']");
    const input = node.querySelector("[data-role='tag-input']");
    const allowCustom = node.getAttribute("data-allow-custom") === "true";
    let options = [];
    try {
      const parsed = JSON.parse(String(node.getAttribute("data-options") || "[]"));
      options = Array.isArray(parsed) ? parsed : [];
    } catch {
      options = [];
    }

    const findOption = (rawValue) => {
      const value = String(rawValue || "").trim().toLowerCase();
      if (!value) return null;
      return (
        options.find((option) => String(option?.id || "").trim().toLowerCase() === value) ||
        options.find((option) => String(option?.label || "").trim().toLowerCase() === value) ||
        null
      );
    };

    const seen = new Set();
    const normalized = (Array.isArray(nextValues) ? nextValues : [])
      .map((item) => String(item || "").trim())
      .filter((item) => {
        if (!item) return false;
        const option = findOption(item);
        if (!allowCustom && !option) {
          return false;
        }
        const finalValue = option ? String(option.id) : item;
        const key = finalValue.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => {
        const option = findOption(item);
        return option ? String(option.id) : item;
      });

    node.setAttribute("data-values", JSON.stringify(normalized));
    if (selectedRow) {
      selectedRow.innerHTML = normalized
        .map((item) => {
          const option = findOption(item);
          const value = String(option?.id || item);
          const label = String(option?.label || item);
          return (
            '<button class="didactic-tag dependency-tag-chip dependency-chip-button entity-tag-chip" type="button" data-action="remove-entity-tag" data-value="' +
            value
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;") +
            '">' +
            '<span class="didactic-tag-text dependency-chip-label">' +
            label
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;") +
            "</span>" +
            '<span class="dependency-chip-remove" aria-hidden="true">' +
            renderUiIcon("remove-state", "dependency-chip-remove-icon") +
            "</span>" +
            "</button>"
          );
        })
        .join("");
    }
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  }

  function bindEntityTagCombobox(node, handler) {
    if (!(node instanceof HTMLElement) || node.getAttribute("data-bind-ready") === "true") {
      return;
    }

    node.setAttribute("data-bind-ready", "true");
    const input = node.querySelector("[data-role='tag-input']");
    const allowCustom = node.getAttribute("data-allow-custom") === "true";
    let options = [];
    try {
      const parsed = JSON.parse(String(node.getAttribute("data-options") || "[]"));
      options = Array.isArray(parsed) ? parsed : [];
    } catch {
      options = [];
    }

    const findOption = (rawValue) => {
      const value = String(rawValue || "").trim().toLowerCase();
      if (!value) return null;
      return (
        options.find((option) => String(option?.id || "").trim().toLowerCase() === value) ||
        options.find((option) => String(option?.label || "").trim().toLowerCase() === value) ||
        null
      );
    };

    const setValues = (nextValues) => {
      setEntityTagComboboxValues(node, nextValues);
      handler();
    };

    const addCurrentInput = () => {
      if (!(input instanceof HTMLInputElement)) return;
      const rawValue = input.value.trim();
      if (!rawValue) return;
      const option = findOption(rawValue);
      if (!allowCustom && !option) {
        input.value = "";
        return;
      }
      const values = parseEntityTagComboboxValues(node);
      values.push(option ? String(option.id) : rawValue);
      input.value = "";
      setValues(values);
    };

    if (input instanceof HTMLInputElement) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === "," || event.key === ";") {
          event.preventDefault();
          addCurrentInput();
        }
        if (event.key === "Backspace" && !input.value.trim()) {
          const values = parseEntityTagComboboxValues(node);
          if (values.length) {
            values.pop();
            setValues(values);
          }
        }
      });
      input.addEventListener("change", addCurrentInput);
      input.addEventListener("blur", addCurrentInput);
    }

    node.querySelector("[data-action='add-entity-tag']")?.addEventListener("click", () => {
      addCurrentInput();
      input?.focus();
    });

    node.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-action='remove-entity-tag']") : null;
      if (!target) return;
      event.preventDefault();
      const value = String(target.getAttribute("data-value") || "").trim().toLowerCase();
      setValues(parseEntityTagComboboxValues(node).filter((item) => String(item).trim().toLowerCase() !== value));
      input?.focus();
    });
  }

  function bindEntityFieldNode(node, handler) {
    if (node instanceof HTMLElement && node.classList.contains("entity-tag-combobox")) {
      bindEntityTagCombobox(node, handler);
      return;
    }
    node.addEventListener("input", handler);
    if (node instanceof HTMLSelectElement) {
      node.addEventListener("change", handler);
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
    const nextProgress = removeCardProgressEntries(
      storage.loadProgress(),
      { courseKey, moduleKey, lessonKey },
      cardKeys
    );
    storage.saveProgress(nextProgress);
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
      operation: assistance.operation,
      promptText: state.assistDraft.promptText,
      attachments: state.assistDraft.attachments,
      ...(assistance.operation === "repair"
        ? {
            repairScope: assistance.repairScope,
            resourceTargetIds: assistance.resourceTargetIds
          }
        : {
            placement: assistance.placement
          })
    };
  }

  async function deleteCardComment() {
    if (state.cardCommentSaving || !state.cardCommentExists) return;
    state.cardCommentSaving = true;
    state.cardCommentError = "";
    render({ preserveState: true });
    try {
      await storage.deleteCommentForPath(state.selection);
      state.cardCommentExists = false;
      state.cardCommentOpen = false;
    } catch (error) {
      state.cardCommentError = error instanceof Error ? error.message : String(error);
    } finally {
      state.cardCommentSaving = false;
      render({ preserveState: true });
    }
  }

  async function persistCardAssistanceLocalState(courseKey = state.selection.courseKey) {
    if (typeof storage.saveCardAssistanceLocalState !== "function" || !courseKey) return;
    await storage.saveCardAssistanceLocalState(courseKey, state.assistDraft.localState);
    state.assistDraft.localStateCourseKey = courseKey;
  }

  async function loadCardAssistanceLocalState(courseKey = state.selection.courseKey) {
    if (!courseKey || typeof storage.loadCardAssistanceLocalState !== "function") return;
    try {
      const stored = await storage.loadCardAssistanceLocalState(courseKey);
      if (courseKey !== state.selection.courseKey) return;
      state.assistDraft.localState = normalizeCardAssistanceLocalState(stored || {});
      state.assistDraft.localStateCourseKey = courseKey;
      state.assistDraft.undo = state.assistDraft.localState.undo;
      render({ preserveState: true });
    } catch {
      // A leitura e a edição continuam disponíveis sem a fila auxiliar.
    }
  }

  function contextualAuthoringIsAvailable() {
    return typeof contextualAuthoring?.remoteCatalog?.executeApplicationAuthoringAction === "function" &&
      typeof contextualAuthoring?.syncEngine?.restoreDeferredCourseRevision === "function" &&
      typeof contextualAuthoring?.synchronizeReplica === "function";
  }

  async function attemptContextualAuthoringSync() {
    if (
      !contextualAuthoringIsAvailable() ||
      state.assistDraft.syncingContextualAuthoring ||
      globalThis.navigator?.onLine === false
    ) return;
    const courseKey = state.selection?.courseKey;
    if (!courseKey) return;
    if (state.assistDraft.localStateCourseKey !== courseKey) {
      await loadCardAssistanceLocalState(courseKey);
    }
    const pendingPaths = state.assistDraft.localState.sync.pendingPaths;
    const pendingReplacement = state.assistDraft.localState.sync.replacement;
    if (!pendingPaths.length && !pendingReplacement) return;
    state.assistDraft.syncingContextualAuthoring = true;
    try {
      if (pendingReplacement) {
        const localDraft = await storage.getLocalCourseDraft?.(courseKey);
        if (localDraft) {
          await contextualAuthoring.syncEngine.restoreDeferredCourseRevision({
            courseId: pendingReplacement.sourceCourseId,
            expectedLocalDraftRevision: localDraft.revision
          });
        }
        await contextualAuthoring.remoteCatalog.unselectCourse(
          pendingReplacement.sourceCourseId
        );
        state.assistDraft.localState = clearContextualAuthoringSync(
          state.assistDraft.localState
        );
        await persistCardAssistanceLocalState(courseKey);
        await contextualAuthoring.synchronizeReplica({
          expectedCourseIds: [pendingReplacement.publishedCourseId]
        });
        state.assistDraft.ingestionMessage = "Alteração disponível em Trilhas.";
        return;
      }

      const result = await materializeContextualCourseDraft({
        remoteCatalog: contextualAuthoring.remoteCatalog,
        storage,
        projectDocument: state.project,
        courseKey,
        pendingPaths
      });
      if (result.status === "clean") {
        state.assistDraft.localState = clearContextualAuthoringSync(
          state.assistDraft.localState
        );
        await persistCardAssistanceLocalState(courseKey);
        return;
      }
      if (result.draft.courseOrigin === "catalog") {
        state.assistDraft.localState = setContextualAuthoringReplacement(
          state.assistDraft.localState,
          {
            sourceCourseId: result.draft.courseId,
            publishedCourseId: result.publication.courseId
          }
        );
        await persistCardAssistanceLocalState(courseKey);
      }
      await contextualAuthoring.syncEngine.restoreDeferredCourseRevision({
        courseId: result.draft.courseId,
        expectedLocalDraftRevision: result.draft.revision
      });
      if (result.draft.courseOrigin === "catalog") {
        await contextualAuthoring.remoteCatalog.unselectCourse(result.draft.courseId);
      }
      state.assistDraft.localState = clearContextualAuthoringSync(
        state.assistDraft.localState
      );
      await persistCardAssistanceLocalState(courseKey);
      await contextualAuthoring.synchronizeReplica({
        expectedCourseIds: [result.publication.courseId]
      });
      state.assistDraft.ingestionMessage = "Alteração disponível em Trilhas.";
    } catch (error) {
      state.assistDraft.ingestionMessage =
        "Salvo neste dispositivo; a sincronização será retomada.";
      console.warn("Sincronização da autoria contextual adiada.", error);
    } finally {
      state.assistDraft.syncingContextualAuthoring = false;
      render({ preserveState: true });
    }
  }

  async function queueCurrentCardAssistanceRequest(request) {
    if (state.assistDraft.attachments.length) {
      state.assistDraft.errorMessage =
        "Conecte-se para enviar anexos; eles não são guardados na fila local.";
      render({ preserveState: true });
      return false;
    }
    if (state.assistDraft.localStateCourseKey !== state.selection.courseKey) {
      const stored = await storage.loadCardAssistanceLocalState?.(state.selection.courseKey);
      state.assistDraft.localState = normalizeCardAssistanceLocalState(stored || {});
      state.assistDraft.localStateCourseKey = state.selection.courseKey;
    }
    const requestId = globalThis.crypto?.randomUUID?.() ||
      `card-assistance-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.assistDraft.localState = enqueueCardAssistanceRequest(
      state.assistDraft.localState,
      {
        requestId,
        selection: state.selection,
        operation: request.operation,
        promptText: request.promptText,
        selectedCardKeys: state.assistDraft.assistance.selectedCardKeys,
        repairScope: request.repairScope,
        resourceTargetIds: request.resourceTargetIds,
        placement: request.placement
      }
    );
    await persistCardAssistanceLocalState();
    state.assistDraft.ingestionMessage = "Pedido guardado neste dispositivo.";
    render({ preserveState: true });
    return true;
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
      throw new Error("O guard transacional do rascunho local é inválido.");
    }
    const normalized = {
      contract: value.contract,
      courseId: String(value.courseId || ""),
      courseKey: expectedCourseKey,
      expectedRevision: expectedRevision === null ? null : expectedRevision.trim()
    };
    if (Object.prototype.hasOwnProperty.call(value, "expectedCreatedCard")) {
      if (!value.expectedCreatedCard || typeof value.expectedCreatedCard !== "object") {
        throw new Error("O card autorizado pelo guard transacional é inválido.");
      }
      normalized.expectedCreatedCard = structuredClone(value.expectedCreatedCard);
    }
    return Object.freeze(normalized);
  }

  function captureCurrentMicrosequence() {
    const context = getRenderContext();
    return context.microsequence ? structuredClone(context.microsequence) : null;
  }

  async function recordCardEditUndo(beforeMicrosequence, reference = state.selection) {
    if (!beforeMicrosequence || typeof storage.createLocalCourseDraftGuard !== "function") {
      state.assistDraft.undo = null;
      return;
    }
    const guard = requireCardAssistancePersistenceGuard(
      await storage.createLocalCourseDraftGuard(reference.courseKey),
      reference.courseKey
    );
    state.assistDraft.undo = {
      contract: "aralearn.card-edit-undo.v1",
      courseKey: reference.courseKey,
      moduleKey: reference.moduleKey,
      lessonKey: reference.lessonKey,
      microsequenceKey: beforeMicrosequence.id,
      expectedRevision: guard.expectedRevision,
      beforeMicrosequence
    };
    state.assistDraft.localState = setCardAssistanceUndo(
      state.assistDraft.localState,
      state.assistDraft.undo
    );
    if (contextualAuthoringIsAvailable()) {
      state.assistDraft.localState = markContextualAuthoringSyncPending(
        state.assistDraft.localState,
        reference
      );
    }
    await persistCardAssistanceLocalState(reference.courseKey);
  }

  async function recordMicrosequenceCreationUndo(
    createdMicrosequenceKey,
    previousSiblingPositions,
    reference = state.selection
  ) {
    if (
      !createdMicrosequenceKey ||
      !Array.isArray(previousSiblingPositions) ||
      typeof storage.createLocalCourseDraftGuard !== "function"
    ) {
      state.assistDraft.undo = null;
      return;
    }
    const guard = requireCardAssistancePersistenceGuard(
      await storage.createLocalCourseDraftGuard(reference.courseKey),
      reference.courseKey
    );
    state.assistDraft.undo = {
      contract: "aralearn.card-edit-undo.v1",
      mode: "remove_created_microsequence",
      courseKey: reference.courseKey,
      moduleKey: reference.moduleKey,
      lessonKey: reference.lessonKey,
      microsequenceKey: createdMicrosequenceKey,
      expectedRevision: guard.expectedRevision,
      previousSiblingPositions: previousSiblingPositions.map((item) => ({
        id: String(item.id || ""),
        position: Number(item.position || 0)
      }))
    };
    state.assistDraft.localState = setCardAssistanceUndo(
      state.assistDraft.localState,
      state.assistDraft.undo
    );
    if (contextualAuthoringIsAvailable()) {
      state.assistDraft.localState = markContextualAuthoringSyncPending(
        state.assistDraft.localState,
        {
          ...reference,
          microsequenceKey: createdMicrosequenceKey
        }
      );
    }
    await persistCardAssistanceLocalState(reference.courseKey);
  }

  async function saveManualCardEdit() {
    if (state.assistDraft.isSubmitting) return;
    const container = root.querySelector("[data-manual-target-id]");
    const context = getRenderContext();
    if (!container || !context.card || !context.microsequence) return;
    const values = Object.fromEntries(
      [...container.querySelectorAll("[data-manual-edit-key]")].map((node) => [
        node.getAttribute("data-manual-edit-key"),
        node.value
      ])
    );
    const optionInputs = [...container.querySelectorAll("[data-manual-option-index]")];
    if (optionInputs.length) {
      values.optionValues = optionInputs
        .sort((left, right) => Number(left.dataset.manualOptionIndex) - Number(right.dataset.manualOptionIndex))
        .map((node) => node.value);
      values.correctOptionIndexes = [...container.querySelectorAll("[data-manual-correct-index]:checked")]
        .map((node) => Number(node.dataset.manualCorrectIndex));
    }
    const columnInputs = [...container.querySelectorAll("[data-manual-column-index]")];
    if (columnInputs.length) {
      values.columns = columnInputs
        .sort((left, right) => Number(left.dataset.manualColumnIndex) - Number(right.dataset.manualColumnIndex))
        .map((node) => node.value);
      const rows = [];
      [...container.querySelectorAll("[data-manual-cell-row]")].forEach((node) => {
        const row = Number(node.dataset.manualCellRow);
        const column = Number(node.dataset.manualCellColumn);
        if (!rows[row]) rows[row] = [];
        rows[row][column] = node.value;
      });
      values.rows = rows;
    }

    state.assistDraft.isSubmitting = true;
    state.assistDraft.manualEditError = "";
    try {
      await storage.flush?.();
      const guard = requireCardAssistancePersistenceGuard(
        await storage.createLocalCourseDraftGuard(state.selection.courseKey),
        state.selection.courseKey
      );
      const beforeMicrosequence = captureCurrentMicrosequence();
      const editedCard = applyManualCardEdit(
        context.card,
        container.getAttribute("data-manual-target-id") || "card",
        values
      );
      const nextProject = updateCardInMicrosequence(state.project, {
        ...state.selection,
        card: editedCard
      });
      await storage.saveMicrosequenceGeneration(nextProject, context.microsequence.id, {
        expectedLocalDraftRevision: guard.expectedRevision
      });
      setProject(nextProject);
      await recordCardEditUndo(beforeMicrosequence);
      void attemptContextualAuthoringSync();
      state.cardExerciseLoadVersion += 1;
    } catch (error) {
      if (error?.code === "local_course_draft_changed") setProject(storage.loadProject());
      state.assistDraft.manualEditError =
        error instanceof Error ? error.message : "Não foi possível salvar a edição.";
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function undoCardEdit() {
    const undo = state.assistDraft.undo;
    if (!undo || state.assistDraft.isSubmitting) return;
    state.assistDraft.isSubmitting = true;
    state.assistDraft.manualEditError = "";
    try {
      const nextProject = structuredClone(state.project);
      const lesson = findLesson(nextProject, undo.courseKey, undo.moduleKey, undo.lessonKey);
      const index = (lesson?.microsequences || []).findIndex(
        (microsequence) => microsequence.id === undo.microsequenceKey
      );
      if (index < 0) throw new Error("A microssequência da última alteração não existe mais.");
      if (undo.mode === "remove_created_microsequence") {
        if (typeof storage.saveMicrosequenceRemoval !== "function") {
          throw new Error("A reversão atômica da microssequência não está disponível.");
        }
        lesson.microsequences.splice(index, 1);
        const previousPositions = new Map(
          (undo.previousSiblingPositions || []).map((item) => [
            String(item.id || ""),
            Number(item.position || 0)
          ])
        );
        lesson.microsequences.forEach((microsequence, siblingIndex) => {
          microsequence.position = previousPositions.has(microsequence.id)
            ? previousPositions.get(microsequence.id)
            : siblingIndex;
        });
        await storage.saveMicrosequenceRemoval(nextProject, {
          lessonId: undo.lessonKey,
          microsequenceId: undo.microsequenceKey,
          expectedLocalDraftRevision: undo.expectedRevision
        });
        const fallbackMicrosequence = lesson.microsequences[Math.max(0, index - 1)] ||
          lesson.microsequences[0] || null;
        state.selection.microsequenceKey = fallbackMicrosequence?.id || null;
        state.selection.cardIndex = 0;
        state.selection.cardKey = fallbackMicrosequence?.cards?.[0]?.id || null;
      } else {
        lesson.microsequences[index] = structuredClone(undo.beforeMicrosequence);
        await storage.saveMicrosequenceGeneration(nextProject, undo.microsequenceKey, {
          expectedLocalDraftRevision: undo.expectedRevision
        });
      }
      setProject(nextProject);
      state.assistDraft.undo = null;
      state.assistDraft.localState = setCardAssistanceUndo(
        state.assistDraft.localState,
        null
      );
      if (contextualAuthoringIsAvailable()) {
        state.assistDraft.localState = markContextualAuthoringSyncPending(
          state.assistDraft.localState,
          {
            courseKey: undo.courseKey,
            moduleKey: undo.moduleKey,
            lessonKey: undo.lessonKey,
            microsequenceKey: undo.microsequenceKey
          }
        );
      }
      await persistCardAssistanceLocalState(undo.courseKey);
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

  async function submitCardAssistanceRequest({ queuedRequestId = "" } = {}) {
    if (state.assistDraft.isSubmitting || state.assistDraft.preview) return;
    const context = getRenderContext();
    const selectionReady = cardAssistanceSelectionIsReady(
      state.assistDraft.assistance,
      { selection: state.selection, card: context.card, cards: context.cards }
    );
    if (!canSubmitCardAssistanceRequest({
      promptText: state.assistDraft.promptText,
      attachmentCount: state.assistDraft.attachments.length,
      isSubmitting: state.assistDraft.isSubmitting,
      selectionReady,
      hasPreview: Boolean(state.assistDraft.preview)
    })) {
      return;
    }
    const request = buildCurrentCardAssistanceRequest();
    if (!queuedRequestId && globalThis.navigator?.onLine === false) {
      await queueCurrentCardAssistanceRequest(request);
      return;
    }
    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    state.assistDraft.ingestionMessage = "";
    render({ preserveState: true });
    try {
      if (
        typeof storage.flush !== "function" ||
        typeof storage.createLocalCourseDraftGuard !== "function"
      ) {
        throw new Error("A persistência transacional da assistência não está disponível.");
      }
      await storage.flush();
      const requestedProjectDocument = structuredClone(state.project);
      const requestedSelection = { ...state.selection };
      const requestedAssistConfig = structuredClone(state.assistConfig);
      const persistenceGuard = requireCardAssistancePersistenceGuard(
        await storage.createLocalCourseDraftGuard(requestedSelection.courseKey),
        requestedSelection.courseKey
      );
      const assistance = state.assistDraft.assistance;
      const requestedCardKeys = assistance.operation === "repair"
        ? assistance.selectedCardKeys
        : [requestedSelection.cardKey].filter(Boolean);
      const requestedSelections = requestedCardKeys.map((cardKey) => {
        const cardIndex = (context.cards || []).findIndex((card) => card.id === cardKey);
        if (cardIndex < 0) throw new Error("Um card selecionado deixou de existir.");
        return { ...requestedSelection, cardKey, cardIndex };
      });
      if (!requestedSelections.length) requestedSelections.push(requestedSelection);
      const previewItems = [];
      const ingestionWarnings = new Set();
      for (const itemSelection of requestedSelections) {
        const itemRequest = requestedSelections.length > 1
          ? { ...request, repairScope: "card", resourceTargetIds: [] }
          : request;
        const submission = await executeCardAssistance({
          projectDocument: requestedProjectDocument,
          selection: itemSelection,
          request: itemRequest,
          assistConfig: requestedAssistConfig,
          provider: assistProvider,
          ingestAttachments,
          checkCodexLocalHealth
        });
        (submission.ingestionWarnings || []).forEach((warning) => ingestionWarnings.add(warning));
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
        if (submission.status !== "success" || !submission.preview) {
          state.assistDraft.errorMessage =
            submission.errorMessage || "Não foi possível gerar uma prévia válida.";
          return;
        }
        await assertCardAssistanceScopeCurrent({
          snapshot: submission.preview.snapshot,
          projectDocument: state.project,
          selection: itemSelection
        });
        previewItems.push({
          selection: itemSelection,
          snapshot: submission.preview.snapshot,
          changeSet: submission.preview.changeSet
        });
      }
      state.assistDraft.ingestionMessage = [...ingestionWarnings].join(" ");
      const firstPreview = previewItems[0];
      const createsMicrosequence =
        firstPreview.snapshot?.target?.operation === "create" &&
        firstPreview.snapshot?.target?.placement === "new_microsequence";
      state.assistDraft.preview = {
        contract: "aralearn.card-assistance-preview-batch.v1",
        selection: requestedSelection,
        items: previewItems,
        persistenceGuard: createsMicrosequence
          ? Object.freeze({
              ...persistenceGuard,
              expectedCreatedCard: structuredClone(firstPreview.changeSet.card)
            })
          : persistenceGuard,
        stale: false,
        errorMessage: ""
      };
      if (queuedRequestId) {
        state.assistDraft.localState = removeQueuedCardAssistanceRequest(
          state.assistDraft.localState,
          queuedRequestId
        );
        await persistCardAssistanceLocalState(requestedSelection.courseKey);
      }
    } catch (error) {
      state.assistDraft.errorMessage =
        error instanceof Error ? error.message : "Falha ao chamar o serviço de linguagem.";
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function processQueuedCardAssistanceRequest() {
    if (
      state.assistDraft.processingQueuedRequest ||
      state.assistDraft.isSubmitting ||
      state.assistDraft.preview ||
      globalThis.navigator?.onLine === false
    ) return;
    const courseKey = state.selection?.courseKey;
    if (!courseKey) return;
    if (state.assistDraft.localStateCourseKey !== courseKey) {
      await loadCardAssistanceLocalState(courseKey);
    }
    const queued = state.assistDraft.localState.queue[0];
    if (!queued) return;
    state.assistDraft.processingQueuedRequest = true;
    try {
      const nextPath = applySelectionByKeys(state.project, queued.selection);
      if (!nextPath || nextPath.microsequenceKey !== queued.selection.microsequenceKey) {
        state.assistDraft.localState = removeQueuedCardAssistanceRequest(
          state.assistDraft.localState,
          queued.requestId
        );
        await persistCardAssistanceLocalState(courseKey);
        state.assistDraft.errorMessage = "O alvo de um pedido guardado não existe mais.";
        render({ preserveState: true });
        return;
      }
      const context = getRenderContext();
      state.view = "microsequence";
      state.microsequenceMode = "assist";
      state.assistDraft.editMode = true;
      state.assistDraft.promptText = queued.promptText;
      state.assistDraft.attachments = [];
      state.assistDraft.assistance = reconcileCardAssistanceUiState({
        ...createCardAssistanceUiState(state.selection),
        operation: queued.operation,
        repairScope: queued.repairScope,
        resourceTargetIds: queued.resourceTargetIds,
        selectedCardKeys: queued.selectedCardKeys,
        placement: queued.placement
      }, {
        selection: state.selection,
        card: context.card,
        cards: context.cards
      });
      render({ preserveState: false });
      await submitCardAssistanceRequest({ queuedRequestId: queued.requestId });
    } finally {
      state.assistDraft.processingQueuedRequest = false;
    }
  }

  function discardCardAssistancePreview() {
    state.assistDraft.preview = null;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });
  }

  async function applyCardAssistancePreview() {
    const preview = state.assistDraft.preview;
    if (!preview || preview.stale || state.assistDraft.isSubmitting) return;
    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });
    try {
      const beforeMicrosequence = captureCurrentMicrosequence();
      const beforeLessonPositions = (getRenderContext().lesson?.microsequences || [])
        .map((microsequence) => ({
          id: microsequence.id,
          position: Number(microsequence.position || 0)
        }));
      const persistenceGuard = requireCardAssistancePersistenceGuard(
        preview.persistenceGuard,
        state.selection.courseKey
      );
      const previewItems = Array.isArray(preview.items) ? preview.items : [];
      const applied = await applyCardAssistanceBatchChangeSet({
        projectDocument: state.project,
        entries: previewItems
      });
      const targetMicrosequence = findMicrosequence(
        applied.projectDocument,
        state.selection.courseKey,
        state.selection.moduleKey,
        state.selection.lessonKey,
        applied.targetMicrosequenceKey
      );
      const targetIndex = (targetMicrosequence?.cards || [])
        .findIndex((card) => card.id === applied.cardKey);
      if (!targetMicrosequence || targetIndex < 0) {
        throw new Error("A alteração validada não contém o card de destino.");
      }
      const createsMicrosequence =
        previewItems[0]?.snapshot?.target?.operation === "create" &&
        previewItems[0]?.snapshot?.target?.placement === "new_microsequence";
      if (createsMicrosequence) {
        if (typeof storage.saveMicrosequenceCreation !== "function") {
          throw new Error("A persistência atômica da nova microssequência não está disponível.");
        }
        await storage.saveMicrosequenceCreation(applied.projectDocument, {
          lessonId: state.selection.lessonKey,
          microsequenceId: applied.targetMicrosequenceKey,
          expectedLocalDraftRevision: persistenceGuard.expectedRevision,
          expectedCreatedCard: persistenceGuard.expectedCreatedCard
        });
      } else {
        if (typeof storage.saveMicrosequenceGeneration !== "function") {
          throw new Error("A persistência atômica da microssequência não está disponível.");
        }
        await storage.saveMicrosequenceGeneration(
          applied.projectDocument,
          applied.targetMicrosequenceKey,
          {
            expectedLocalDraftRevision: persistenceGuard.expectedRevision
          }
        );
      }
      setProject(applied.projectDocument);
      state.selection.microsequenceKey = applied.targetMicrosequenceKey;
      state.selection.cardIndex = targetIndex;
      state.selection.cardKey = targetMicrosequence.cards[targetIndex].id;
      state.assistDraft.preview = null;
      state.assistDraft.promptText = "";
      state.assistDraft.attachments = [];
      state.assistDraft.ingestionMessage = "";
      state.assistDraft.assistance = createCardAssistanceUiState(state.selection);
      if (!createsMicrosequence) {
        await recordCardEditUndo(beforeMicrosequence, state.selection);
      } else {
        await recordMicrosequenceCreationUndo(
          applied.targetMicrosequenceKey,
          beforeLessonPositions,
          state.selection
        );
      }
      void attemptContextualAuthoringSync();
      state.cardExerciseLoadVersion += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível aplicar a prévia.";
      const stale = error?.code === "STALE_CARD_ASSISTANCE_SCOPE" ||
        error?.code === "local_course_draft_changed";
      if (error?.code === "local_course_draft_changed") {
        setProject(storage.loadProject());
      }
      state.assistDraft.preview = {
        ...preview,
        stale,
        errorMessage: message
      };
      state.assistDraft.errorMessage = message;
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  async function applyStructureReorder(drag, target, position) {
    if (!canDropStructure(drag, target) || state.entityEditorSaving) {
      resetStructureDragState();
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
    }

    resetStructureDragState();
    if (toIndex === null || !entityPath || !contextualAuthoringIsAvailable()) return;
    state.entityEditorSaving = true;
    render({ preserveState: true });
    try {
      await moveIntegratedEntity({
        ...contextualAuthoring,
        storage,
        courseKey: drag.courseKey,
        entityType: drag.level,
        entityPath,
        targetParentPath: entityPath.length === 1 ? null : entityPath.slice(0, -1),
        position: toIndex,
        title: findCourse(state.project, drag.courseKey)?.title
      });
      const nextProject = storage.loadProject();
      setProject(nextProject);
      applySelectionByKeys(nextProject, state.selection);
      syncAssistDraft();
    } catch (error) {
      globalThis.alert?.(error instanceof Error ? error.message : "Não foi possível mover.");
    } finally {
      state.entityEditorSaving = false;
      render({ preserveState: true });
    }
  }

  function goBack() {
    state.cardCommentOpen = false;
    state.assistConfigOpen = false;
    state.entityEditor = null;

    if (state.view === "microsequence") {
      state.view = "lesson";
      state.microsequenceMode = "play";
    } else if (state.view === "lesson") {
      state.view = "module";
    } else if (state.view === "module") {
      state.view = "course";
    } else if (state.view === "course") {
      state.view = "courses";
    }

    render({ preserveState: false });
  }

  function updateEntityDraft(payload) {
    if (!state.entityEditor) return;
    let nextProject = null;
      if (state.entityEditor.kind === "course") {
        nextProject = structuralEditor.updateCourse({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          title: payload.title,
          goal: payload.description
        });
      } else if (state.entityEditor.kind === "course-metadata") {
        nextProject = structuralEditor.updateCourse({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          title: payload.title,
          goal: payload.description
        });
      } else if (state.entityEditor.kind === "module") {
        nextProject = structuralEditor.updateModule({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          title: payload.title,
          goal: payload.description
        });
      } else if (state.entityEditor.kind === "lesson") {
        nextProject = structuralEditor.updateLesson({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          title: payload.title,
          goal: payload.description
        });
      } else if (state.entityEditor.kind === "microsequence") {
        nextProject = editor.updateMicrosequence({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          microsequenceKey: state.entityEditor.microsequenceKey,
          title: payload.title,
          goal: payload.goal,
          role: payload.role,
          dependsOn: Array.isArray(payload.dependsOn) ? payload.dependsOn : [],
          covers: Array.isArray(payload.covers) ? payload.covers : [],
          checks: Array.isArray(payload.checks) ? payload.checks : []
        });
      }

    if (nextProject) setProject(nextProject);
    return nextProject;
  }

  async function saveEntityEditor() {
    if (!state.entityEditor || state.entityEditorSaving) return;
    const model = buildEntityEditorModel({
      ...state,
      coursePermissions: resolveCourseUiPermissions(
        storage,
        state.entityEditor.courseKey || state.selection.courseKey
      )
    });
    if (!model) return;
    const payload = Object.fromEntries(model.fields.map((field) => {
      const node = root.querySelector(`[data-field='${field.name}']`);
      return [field.name, readEntityFieldValue(node)];
    }));
    state.entityEditorSaving = true;
    state.entityEditorError = "";
    render({ preserveState: true, preserveFocus: false });
    const editorTarget = { ...state.entityEditor };
    try {
      updateEntityDraft(payload);
      await storage.flush?.();
      if (contextualAuthoringIsAvailable()) {
        const entityType = editorTarget.kind === "course-metadata" ? "course" : editorTarget.kind;
        const entityPath = [
          editorTarget.courseKey || state.selection.courseKey,
          ...(entityType === "course" ? [] : [editorTarget.moduleKey]),
          ...(["lesson", "microsequence"].includes(entityType) ? [editorTarget.lessonKey] : []),
          ...(entityType === "microsequence" ? [editorTarget.microsequenceKey] : [])
        ];
        const metadata = entityType === "course"
          ? { title: payload.title, goal: payload.description }
          : entityType === "module" || entityType === "lesson"
            ? { title: payload.title, goal: payload.description }
            : {
                title: payload.title,
                goal: payload.goal,
                role: payload.role,
                dependsOn: payload.dependsOn,
                covers: payload.covers,
                checks: payload.checks
              };
        await saveIntegratedEntityMetadata({
          ...contextualAuthoring,
          storage,
          courseKey: entityPath[0],
          entityType,
          entityPath,
          metadata,
          title: findCourse(state.project, entityPath[0])?.title
        });
      }
      state.entityEditor = null;
    } catch (error) {
      state.entityEditorError = error instanceof Error ? error.message : "Não foi possível salvar.";
    } finally {
      state.entityEditorSaving = false;
      render({ preserveState: false });
    }
  }

  async function deleteCourseDirect(courseKey) {
    const course = findCourse(state.project, courseKey);
    if (!course || state.entityEditorSaving) return;
    if (
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(`Excluir o curso privado "${course.title || "Curso"}"?`)
    ) return;
    state.entityEditorSaving = true;
    try {
      if (!contextualAuthoringIsAvailable()) throw new Error("A exclusão precisa de conexão.");
      await deleteIntegratedPrivateCourse({
        ...contextualAuthoring,
        storage,
        courseKey
      });
      setProject(storage.loadProject());
      selectFirstPath(state.project);
      state.view = "courses";
    } catch (error) {
      globalThis.alert?.(error instanceof Error ? error.message : "Não foi possível excluir o curso.");
    } finally {
      state.entityEditorSaving = false;
      render({ preserveState: false });
    }
  }

  async function deleteEntityDirect(target) {
    if (!target || state.entityEditorSaving) return;
    const course = findCourse(state.project, target.courseKey);
    const entity = target.level === "module"
      ? findModule(state.project, target.courseKey, target.moduleKey)
      : target.level === "lesson"
        ? findLesson(state.project, target.courseKey, target.moduleKey, target.lessonKey)
        : findMicrosequence(
            state.project,
            target.courseKey,
            target.moduleKey,
            target.lessonKey,
            target.microsequenceKey
          );
    if (!course || !entity) return;
    if (
      typeof globalThis.confirm === "function" &&
      !globalThis.confirm(`Excluir "${entity.title || "Parte"}" e todo o seu conteúdo?`)
    ) return;
    state.entityEditorSaving = true;
    try {
      if (!contextualAuthoringIsAvailable()) throw new Error("A exclusão precisa de conexão.");
      const entityPath = [
        target.courseKey,
        target.moduleKey,
        ...(["lesson", "microsequence"].includes(target.level) ? [target.lessonKey] : []),
        ...(target.level === "microsequence" ? [target.microsequenceKey] : [])
      ];
      await deleteIntegratedEntity({
        ...contextualAuthoring,
        storage,
        courseKey: target.courseKey,
        entityType: target.level,
        entityPath,
        title: course.title
      });
      setProject(storage.loadProject());
      applySelectionByKeys(state.project, state.selection) || selectFirstPath(state.project);
    } catch (error) {
      globalThis.alert?.(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      state.entityEditorSaving = false;
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

  function setCardEditMode(enabled) {
    state.assistDraft.editMode = Boolean(enabled);
    state.microsequenceMode = enabled ? "assist" : "play";
    state.assistDraft.preview = null;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });
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
    const needsAllCoursePermissions = state.view === "courses" || Boolean(state.entityEditor);
    const permissionCourses = needsAllCoursePermissions
      ? state.project.courses || []
      : context.course
        ? [context.course]
        : [];
    const coursePermissionsById = Object.fromEntries(
      permissionCourses.map((course) => [
        course.id,
        resolveCourseUiPermissions(storage, course.id)
      ])
    );
    const currentCoursePermissions = context.course
      ? coursePermissionsById[context.course.id] || resolveCourseUiPermissions(storage, context.course.id)
      : { role: "owner", canEdit: true, canDelete: true };
    const entityEditorModel = buildEntityEditorModel({
      ...state,
      coursePermissions: currentCoursePermissions,
      coursePermissionsById
    });
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
      attachmentCount: state.assistDraft.attachments.length,
      isSubmitting: state.assistDraft.isSubmitting,
      selectionReady: cardAssistanceSelectionIsReady(
        state.assistDraft.assistance,
        cardAssistanceContext
      ),
      hasPreview: Boolean(state.assistDraft.preview)
    });
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
          studyPaths: state.view === "courses" ? storage.loadStudyPaths?.() || [] : [],
          progress: storage.loadProgress(),
          editMode: state.assistDraft.editMode,
          cardAssistanceState: state.assistDraft.assistance,
          cardResourceTargets: rendersCardRuntime ? listCardResourceTargets(context.card) : [],
          cardAssistancePreview: state.assistDraft.preview,
          cardAssistanceRequestReady,
          assistPromptLabel:
            state.assistDraft.assistance.operation === "repair"
              ? "O que precisa ser reparado?"
              : "Que card deve ser criado?",
          assistSubmitLabel:
            state.assistDraft.assistance.operation === "repair"
              ? "Gerar prévia do reparo"
              : "Gerar prévia do novo card",
          assistPromptPlaceholder:
            state.assistDraft.assistance.operation === "repair"
              ? "Descreva com precisão o problema e o resultado esperado."
              : "Descreva a microteoria ou prática que o novo card deve conter.",
          attachments: state.assistDraft.attachments.map((item) => ({
            name: normalizeAssistAttachmentName(item?.name),
            size: Number(item?.size || 0),
            type: String(item?.type || "").trim()
          })),
          selectedModel: state.assistConfig.model,
          selectedModelLabel: getAssistModelLabel(state.assistConfig.model),
          apiKey: state.assistConfig.apiKey,
          modelOptions: ASSIST_MODEL_OPTIONS,
          promptText: state.assistDraft.promptText,
          assistErrorMessage: state.assistDraft.errorMessage,
          assistIngestionMessage: state.assistDraft.ingestionMessage,
          manualCardEditError: state.assistDraft.manualEditError,
          hasCardComment: Boolean(storage.loadCommentForPath(state.selection)),
          cardMarkedForReview: currentCardIsMarkedForReview(),
          canUndoCardEdit: Boolean(
            state.assistDraft.undo &&
            state.assistDraft.undo.courseKey === state.selection.courseKey &&
            state.assistDraft.undo.microsequenceKey === state.selection.microsequenceKey
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
      (state.assistConfigOpen
        ? renderAssistConfigOverlay({
            didacticProfileId: state.assistConfigDraft.selectedProfileId || state.assistConfigDraft.didacticProfileId,
            profileTuning: state.assistConfigDraft.profileTuning,
            didacticProfileOptions: buildDidacticProfileOptions(state.assistConfigDraft.customProfiles),
            profileEditor: getAssistProfileEditorViewModel(state.assistConfigDraft)
          })
        : "") +
      (state.providerConfigOpen
        ? renderProviderConfigOverlay({
            selectedModel: state.assistConfig.model,
            selectedModelLabel: getAssistModelLabel(state.assistConfig.model),
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
      (entityEditorModel
        ? renderEntityEditorOverlay({
            ...entityEditorModel,
            saving: state.entityEditorSaving,
            error: state.entityEditorError
          })
        : "") +
      "</div>";

    root.querySelectorAll(
      ".card-assistance-preview-card button, .card-assistance-preview-card input, .card-assistance-preview-card select, .card-assistance-preview-card textarea"
    ).forEach((node) => {
      node.disabled = true;
      node.tabIndex = -1;
      node.setAttribute("aria-disabled", "true");
    });

    if (renderState) {
      restoreRenderState(root, renderState, { restoreFocus: preserveFocus });
    }

    syncCardStripScroller({ keepActiveCardInView: true });
    syncPendingExerciseFocus();

    root.querySelector("[data-action='go-back']")?.addEventListener("click", () => goBack());
    root.querySelectorAll("[data-action='open-central']").forEach((node) => {
      node.addEventListener("click", () => {
        root.dispatchEvent(new CustomEvent("aralearn:open-library", { bubbles: true }));
      });
    });
    root.querySelectorAll("[data-action='open-course']").forEach((node) => {
      node.addEventListener("click", () => {
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
          microsequence: "microssequência"
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
        }
        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='edit-entity-direct']").forEach((node) => {
      node.addEventListener("click", () => {
        const target = readStructurePayload(node);
        if (!target || !["module", "lesson", "microsequence"].includes(target.level)) return;
        openEntityEditor(target.level, target);
      });
    });
    root.querySelectorAll("[data-action='delete-course-direct']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key");
        if (!courseKey) return;
        void deleteCourseDirect(courseKey);
      });
    });
    root.querySelectorAll("[data-action='delete-entity-direct']").forEach((node) => {
      node.addEventListener("click", () => {
        const target = readStructurePayload(node);
        if (!target || !["module", "lesson", "microsequence"].includes(target.level)) return;
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
    root.querySelectorAll("[data-action='play-microsequence']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        if (!microsequenceKey) return;
        openMicrosequenceScreen(microsequenceKey, 0, "play");
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
    root.querySelector("[data-action='toggle-card-edit-mode']")?.addEventListener("click", () => {
      setCardEditMode(!state.assistDraft.editMode);
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
        openMicrosequenceAssistPage(microsequenceKey, Number.isFinite(targetIndex) ? targetIndex : 0);
      });
    });

    root.querySelectorAll("[data-action='choice-toggle']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        const optionId = node.getAttribute("data-choice-option-id");
        if (!blockKey || optionId === null) return;
        const current = state.choiceExerciseByBlockKey[blockKey];
        const selected = Array.isArray(current?.selected) ? current.selected : [];
        const isSelected = selected.includes(optionId);
        setChoiceSelection(blockKey, optionId, !isSelected);
      });
      node.addEventListener("keydown", (event) => {
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

    root.querySelectorAll("[data-action='structure-drag-handle'], [data-structure-draggable='true']").forEach((node) => {
      node.addEventListener("dragstart", (event) => {
        const payload = readStructurePayload(node);
        const originNode = node.closest("[data-structure-target]");
        if (!payload || !originNode) {
          event.preventDefault();
          return;
        }

        state.structureDrag = {
          ...payload,
          originNode
        };
        state.structureDrop = null;
        clearStructureDropClasses();
        originNode.classList.add("structure-drag-origin");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", [
            payload.level,
            payload.courseKey,
            payload.moduleKey,
            payload.lessonKey,
            payload.microsequenceKey
          ].join("::"));
        }
      });
      node.addEventListener("dragend", () => {
        resetStructureDragState();
      });
    });
    root.querySelectorAll("[data-structure-target]").forEach((node) => {
      node.addEventListener("dragover", (event) => {
        const target = readStructurePayload(node);
        if (!canDropStructure(state.structureDrag, target)) {
          return;
        }

        event.preventDefault();
        const position = getStructureDropPosition(node, event.clientY);
        state.structureDrop = { target, position };
        markStructureDropTarget(node, position);
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });
      node.addEventListener("drop", (event) => {
        const target = readStructurePayload(node);
        if (!canDropStructure(state.structureDrag, target)) {
          return;
        }

        event.preventDefault();
        const position =
          state.structureDrop?.position
          || getStructureDropPosition(node, event.clientY);
        applyStructureReorder(state.structureDrag, target, position);
      });
    });
    root.querySelectorAll("[data-structure-collection]").forEach((node) => {
      node.addEventListener("dragover", (event) => {
        const resolved = resolveCollectionDropState(node, state.structureDrag, event.clientY);
        if (!resolved) {
          return;
        }

        event.preventDefault();
        state.structureDrop = { target: resolved.target, position: resolved.position };
        markStructureDropTarget(resolved.node, resolved.position);
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });
      node.addEventListener("drop", (event) => {
        const resolved = resolveCollectionDropState(node, state.structureDrag, event.clientY);
        if (!resolved) {
          return;
        }

        event.preventDefault();
        applyStructureReorder(state.structureDrag, resolved.target, resolved.position);
      });
    });
    root.querySelectorAll("[data-action='edit-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        if (!courseKey) return;
        openEntityEditor("course", { courseKey });
      });
    });
    root.querySelectorAll("[data-action='edit-module']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key");
        if (!courseKey || !moduleKey) return;
        openEntityEditor("module", { courseKey, moduleKey });
      });
    });
    root.querySelectorAll("[data-action='edit-lesson']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key") || state.selection.moduleKey;
        const lessonKey = node.getAttribute("data-lesson-key") || state.selection.lessonKey;
        if (!courseKey || !moduleKey || !lessonKey) return;
        openEntityEditor("lesson", { courseKey, moduleKey, lessonKey });
      });
    });
    root.querySelector("[data-action='entity-editor-close']")?.addEventListener("click", () => closeEntityEditor());
    root.querySelector("[data-action='entity-editor-save']")?.addEventListener("click", () => {
      void saveEntityEditor();
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
        if (state.assistConfigOpen) {
          closeAssistConfig();
          return;
        }
        if (state.entityEditor) {
          closeEntityEditor();
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
    const assistAttachmentInput = root.querySelector("[data-field='assist-attachments']");
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
        attachmentCount: state.assistDraft.attachments.length,
        isSubmitting: state.assistDraft.isSubmitting,
        selectionReady: cardAssistanceSelectionIsReady(
          state.assistDraft.assistance,
          { selection: state.selection, card: context.card, cards: context.cards }
        ),
        hasPreview: Boolean(state.assistDraft.preview)
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
    root.querySelectorAll("[data-action='select-card-assistance-operation']").forEach((node) => {
      node.addEventListener("click", () => {
        const context = getRenderContext();
        state.assistDraft.assistance = selectCardAssistanceOperation(
          state.assistDraft.assistance,
          { selection: state.selection, card: context.card, cards: context.cards },
          node.getAttribute("data-operation")
        );
        state.assistDraft.preview = null;
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='select-card-repair-scope']").forEach((node) => {
      node.addEventListener("click", () => {
        const context = getRenderContext();
        state.assistDraft.assistance = selectCardRepairScope(
          state.assistDraft.assistance,
          { selection: state.selection, card: context.card, cards: context.cards },
          node.getAttribute("data-repair-scope")
        );
        state.assistDraft.preview = null;
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='toggle-card-assistance-resource']").forEach((node) => {
      node.addEventListener("click", () => {
        const context = getRenderContext();
        state.assistDraft.assistance = toggleCardAssistanceResource(
          state.assistDraft.assistance,
          { selection: state.selection, card: context.card, cards: context.cards },
          node.getAttribute("data-resource-target-id")
        );
        state.assistDraft.preview = null;
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='toggle-card-assistance-card']").forEach((node) => {
      node.addEventListener("click", () => {
        const context = getRenderContext();
        state.assistDraft.assistance = toggleCardAssistanceCard(
          state.assistDraft.assistance,
          { selection: state.selection, card: context.card, cards: context.cards },
          node.getAttribute("data-card-key")
        );
        state.assistDraft.preview = null;
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='select-card-creation-placement']").forEach((node) => {
      node.addEventListener("click", () => {
        const context = getRenderContext();
        state.assistDraft.assistance = selectCardCreationPlacement(
          state.assistDraft.assistance,
          { selection: state.selection, card: context.card, cards: context.cards },
          node.getAttribute("data-placement")
        );
        state.assistDraft.preview = null;
        render({ preserveState: true });
      });
    });
    if (assistPrompt) {
      assistPrompt.addEventListener("input", () => {
        state.assistDraft.promptText = assistPrompt.value;
        syncAssistSubmitState();
      });
    }
    if (assistAttachmentInput) {
      assistAttachmentInput.addEventListener("change", () => {
        const nextFiles = Array.from(assistAttachmentInput.files || []);
        const normalizedSelection = normalizeAssistAttachmentSelection([
          ...state.assistDraft.attachments,
          ...nextFiles
        ]);
        state.assistDraft.attachments = normalizedSelection.attachments;
        state.assistDraft.ingestionMessage = normalizedSelection.warnings.join(" ");
        assistAttachmentInput.value = "";
        render({ preserveState: true });
      });
    }
    root.querySelectorAll("[data-action='remove-assist-attachment']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-attachment-index"));
        if (!Number.isInteger(index) || index < 0) return;
        state.assistDraft.attachments = state.assistDraft.attachments.filter((_, itemIndex) => itemIndex !== index);
        state.assistDraft.ingestionMessage = "";
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='open-assist-attachment-picker']").forEach((node) => {
      node.addEventListener("click", () => {
        root.querySelector("[data-field='assist-attachments']")?.click();
      });
    });
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
    root.querySelector("[data-action='apply-card-assistance-preview']")?.addEventListener("click", () => {
      void applyCardAssistancePreview();
    });
    root.querySelector("[data-action='discard-card-assistance-preview']")?.addEventListener("click", () => {
      discardCardAssistancePreview();
    });
    root.querySelector("[data-action='save-manual-card-edit']")?.addEventListener("click", () => {
      void saveManualCardEdit();
    });
    root.querySelector("[data-action='undo-card-edit']")?.addEventListener("click", () => {
      void undoCardEdit();
    });
    root.querySelector("[data-action='assist-config-close']")?.addEventListener("click", () => closeAssistConfig());
    root.querySelector("[data-action='provider-config-close']")?.addEventListener("click", () => closeProviderConfig());
    root.querySelector("[data-action='provider-config-open-didactic']")?.addEventListener("click", () => {
      state.providerConfigOpen = false;
      openAssistConfig();
    });
    root.querySelector("[data-action='provider-config-check-codex']")?.addEventListener("click", () => {
      void testCodexCliConnection();
    });
    root.querySelector("[data-action='assist-config-reset-profile']")?.addEventListener("click", () => {
      resetAssistProfileTuning(state.assistConfig.selectedProfileId || state.assistConfig.didacticProfileId);
    });
    root.querySelector("[data-action='assist-config-start-create-profile']")?.addEventListener("click", () => {
      startAssistCustomProfileCreation();
    });
    root.querySelector("[data-action='assist-config-edit-profile']")?.addEventListener("click", () => {
      startAssistCustomProfileRename();
    });
    root.querySelector("[data-action='assist-config-delete-profile']")?.addEventListener("click", () => {
      deleteAssistCustomProfile();
    });
    root.querySelector("[data-action='assist-config-save-profile']")?.addEventListener("click", () => {
      saveAssistProfileEditor();
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

    const assistConfigProfile = root.querySelector("[data-field='assist-config-profile']");
    const assistConfigTargetStudentProfile = root.querySelector("[data-field='assist-config-target-student-profile']");
    const assistConfigCourseModelDescription = root.querySelector("[data-field='assist-config-course-model-description']");
    const assistConfigCourseLearningTrail = root.querySelector("[data-field='assist-config-course-learning-trail']");
    const assistConfigCourseMicrosequenceProgression = root.querySelector("[data-field='assist-config-course-microsequence-progression']");
    if (assistConfigProfile) {
      if (assistConfigProfile.tagName === "SELECT") {
        assistConfigProfile.addEventListener("change", () => {
          selectAssistDidacticProfile(assistConfigProfile.value);
        });
      } else {
        assistConfigProfile.addEventListener("input", () => {
          updateAssistProfileEditorLabel(assistConfigProfile.value);
        });
      }
    }
    if (assistConfigTargetStudentProfile) {
      assistConfigTargetStudentProfile.addEventListener("input", () => {
        updateAssistProfileTuning({ targetStudentProfile: assistConfigTargetStudentProfile.value });
      });
    }
    if (assistConfigCourseModelDescription) {
      assistConfigCourseModelDescription.addEventListener("input", () => {
        updateAssistCourseModel({ description: assistConfigCourseModelDescription.value });
      });
    }
    if (assistConfigCourseLearningTrail) {
      assistConfigCourseLearningTrail.addEventListener("change", () => {
        updateAssistCourseModel({
          learningTrail: assistConfigCourseLearningTrail.value,
          microsequenceProgression: ""
        });
      });
    }
    if (assistConfigCourseMicrosequenceProgression) {
      assistConfigCourseMicrosequenceProgression.addEventListener("change", () => {
        updateAssistCourseModel({ microsequenceProgression: assistConfigCourseMicrosequenceProgression.value });
      });
    }

    if (entityEditorModel) {
      const fields = {};
      entityEditorModel.fields.forEach((field) => {
        const node = root.querySelector(`[data-field='${field.name}']`);
        if (node) {
          fields[field.name] = node;
        }
      });

      Object.values(fields).forEach((node) => {
        if (node instanceof HTMLElement && node.classList.contains("entity-tag-combobox")) {
          bindEntityFieldNode(node, () => {});
        }
      });
    }

  }

  syncAssistDraft();
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("resize", () => {
      syncCardStripScroller({ keepActiveCardInView: true });
    });
    window.addEventListener("online", () => {
      void processQueuedCardAssistanceRequest();
      void attemptContextualAuthoringSync();
    });
  }
  render({ preserveState: false });
  void loadCardAssistanceLocalState(state.selection.courseKey).then(() => {
    if (globalThis.navigator?.onLine !== false) {
      return processQueuedCardAssistanceRequest().then(
        () => attemptContextualAuthoringSync()
      );
    }
    return undefined;
  });
  globalThis.AndroidHost?.runtimeReady?.();
  return {
    refreshPersonalState() {
      render({ preserveState: true });
    },
    replaceProject(nextProject) {
      setProject(nextProject);
      if (!applySelectionByKeys(nextProject, state.selection)) selectFirstPath(nextProject);
      render({ preserveState: false });
    },
    openCourse(courseIdentity) {
      const courseKey = storage.resolveCourseContractKey?.(courseIdentity) || String(courseIdentity || "");
      const course = findCourse(state.project, courseKey);
      if (!course) return false;
      applySelection(buildNodeSelection({ courseKey: course.id }));
      state.view = "course";
      state.entityEditor = null;
      render({ preserveState: false });
      return true;
    },
    openCardPath(entityPath, { edit = false } = {}) {
      const selection = resolveExactCardSelection(state.project, entityPath);
      if (!selection) return false;
      applySelection(selection);
      if (edit) {
        openMicrosequenceAssistPage(selection.microsequenceKey, selection.cardIndex);
      } else {
        openMicrosequenceScreen(selection.microsequenceKey, selection.cardIndex, "play");
      }
      return true;
    }
  };
}
