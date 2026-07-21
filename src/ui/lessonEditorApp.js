import { renderLessonScreen } from "./renderLessonScreen.js";
import { renderGenerationPanelOverlay } from "./renderHomeScreen.js";
import { renderCardCommentOverlay } from "./renderCardCommentOverlay.js";
import { renderEntityEditorOverlay } from "./renderEntityEditorOverlay.js";
import { renderActionMenuOverlay } from "./renderActionMenuOverlay.js";
import { renderAssistConfigOverlay } from "./renderAssistConfigOverlay.js";
import { renderProviderConfigOverlay } from "./renderProviderConfigOverlay.js";
import { renderExternalImportOverlay } from "./renderExternalImportOverlay.js";
import {
  ASSIST_CARD_CONTAINER_OPTIONS,
  buildEntityEditorModel
} from "./entityEditorModel.js";
import { captureRenderState, restoreRenderState } from "./renderState.js";
import { continuePopupMatches, createContinuePopupState, resolveIndexedTarget } from "./studyCardProgression.js";
import { mergeGenerationTopics, splitGenerationTopics } from "./generationTopicInput.js";
import {
  buildCodexCliHealthCommand,
  buildCodexCliSetupScript,
  detectCodexCliSetupPlatform
} from "./codexCliSetup.js";
import { handleExternalJsonImportText } from "./externalJsonImport.js";
import {
  resolveGuidePayload,
  GUIDE_LEVELS
} from "../sourceGuides/sourceGuideStructured.js";
import { buildLessonGuidanceFromPreset } from "../generation/guidance/lessonGuidance.js";
import {
  getRuntimePopupButtonEntry,
  resolveRuntimeFlowchartProjection
} from "../render/renderCardRuntime.js";
import { extractTextGapAnswers, parseTextGapRenderableParts } from "../core/textGaps.js";
import { resolveCardRuntime } from "../core/cardRuntime.js";
import { getCorrectExerciseOptionIds, getExerciseOptionStableId } from "../core/exerciseOptions.js";
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
  resolveFirstSelection,
  resolveSelectionByKeys as resolveSelectionByKeysRuntime
} from "./lessonEditorNavigation.js";
import {
  buildCardPathKey,
  collectAssistRefs,
  collectLessonCards,
  findLessonCardEntryIndex,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  findSelectedCard
} from "./lessonEditorPaths.js";
import { createEmptyInterventionSession, interventionSessionNeedsIteration } from "./interventionSessionState.js";
import {
  CODEX_LOCAL_MODEL_ID,
  DEFAULT_CODEX_LOCAL_ENDPOINT,
  checkCodexLocalHealth,
  isCodexLocalModel
} from "../generation/providers/codexCliConfig.js";
import { DEEPSEEK_BASE_URL, DEEPSEEK_QUALITY_MODEL, isDeepSeekModelId } from "../generation/providers/deepSeekPolicy.js";
import { executeMicrosequenceGeneration } from "../generation/runtime/interventionRuntime.js";
import {
  createDefaultCourseModel
} from "../generation/runtime/courseModelSemantics.js";
import {
  applyAssistConfigPatch,
  applyGenerationPanelScopeState,
  buildClosedGenerationPanelState,
  buildGenerationInputState,
  buildGenerationResultClearedState,
  buildOpenedGenerationPanelState,
  checkCodexCliConnection,
  createCodexCliSetupStatus,
  executeStructureGeneration,
  normalizeAssistConfig,
  resolveGenerationScopeViewState,
  resolveOpenGeneratedLessonState
} from "../generation/runtime/generationEditorRuntime.js";
import {
  createProfileTuning
} from "../generation/runtime/profileTuning.js";
import { inferPlanningProfileTuning } from "../generation/runtime/planningInference.js";
import {
  createGenerationProgressState,
  reduceGenerationProgress
} from "../generation/runtime/progressViewModel.js";
import { resolveGenerationProviderReadiness, resolveGenerationPanelScopeFromAction } from "../generation/runtime/generationViewModel.js";
import { removeLessonProgressEntries, writeLessonProgressEntry } from "../storage/progressStore.js";
import { detectJsonExchangeFormat } from "../storage/jsonExchange.js";
import { createStarterContractCard } from "../contract/contractCard.js";
import {
  isDraftMicrosequence,
  resolveMicrosequenceRuntimeIncluded
} from "../model/microsequenceStatus.js";
import { ingestAttachments } from "../generation/ingestion/attachmentIngestion.js";
import { DEFAULT_ENGINE_PROFILE_ID, listEngineProfileSeeds } from "../generation/config/engineProfileRegistry.js";
import {
  createCourse as createCourseDocument,
  createLesson as createLessonDocument,
  createModule as createModuleDocument,
  deleteCourse as deleteCourseDocument,
  deleteLesson as deleteLessonDocument,
  deleteModule as deleteModuleDocument,
  exportCourseDocument as exportCourseDocumentFromDocument,
  exportLessonDocument as exportLessonDocumentFromDocument,
  exportModuleDocument as exportModuleDocumentFromDocument,
  importCourses as importCoursesDocument,
  importLessons as importLessonsDocument,
  importModules as importModulesDocument,
  moveCourse as moveCourseDocument,
  moveLesson as moveLessonDocument,
  moveModule as moveModuleDocument,
  updateCourse as updateCourseDocument,
  updateLesson as updateLessonDocument,
  updateModule as updateModuleDocument
} from "../editor/contractEditor.js";

const MAX_ASSIST_REFS = 5;
const MAX_ASSIST_ATTACHMENTS = 6;
const ASSIST_MODEL_OPTIONS = [
  { value: DEEPSEEK_QUALITY_MODEL, label: "DeepSeek Quality" },
  { value: "deepseek-v4-flash", label: "DeepSeek v4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek v4 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: CODEX_LOCAL_MODEL_ID, label: "Codex local" }
];
const DIDACTIC_PROFILE_SEED_OPTIONS = listEngineProfileSeeds().map((profile) => ({
  value: profile.profileId,
  label: profile.label || profile.profileId
}));
const ASSIST_USER_MODES = {
  EDIT_MICROSEQUENCE: "edit-microsequence"
};
const BOTTOM_UP_TARGET_MODE_OPTIONS = [
  { value: "current", label: "Nesta etapa" },
  { value: "new_after_current", label: "Nova etapa depois" }
];
const BOTTOM_UP_OPERATION_MODE_OPTIONS = [
  { value: "reinforce", label: "Continuar/reforçar" },
  { value: "repair", label: "Corrigir" }
];
const ASSIST_ACTION_INTENTS = Object.freeze({
  GENERATE_CURRENT: "generate_current",
  REPAIR_CURRENT: "repair_current",
  NEXT_PLANNED: "next_planned",
  BRANCH_AFTER_CURRENT: "branch_after_current"
});
const COURSES_VIEWS = new Set(["courses", "course", "module", "lesson", "microsequence"]);

export function canSubmitAssistRequestFromState({
  promptText,
  actionIntent,
  attachmentCount = 0,
  isSubmitting,
  allowPromptlessSubmit = false
}) {
  if (actionIntent === ASSIST_ACTION_INTENTS.NEXT_PLANNED || allowPromptlessSubmit) {
    return !isSubmitting;
  }
  const hasPrompt = !!String(promptText || "").trim();
  const hasAttachments = Number(attachmentCount) > 0;
  const hasIntent = !!String(actionIntent || "").trim();
  return hasIntent && (hasPrompt || hasAttachments) && !isSubmitting;
}

export function resolveCourseUiPermissions(storage, courseIdentity) {
  const fallback = { role: "owner", canEdit: true, canDelete: true };
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

function slugifyDownloadName(value, fallback = "curso") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || fallback;
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

function normalizeAssistAttachmentList(files = []) {
  const nextItems = [];
  const seen = new Set();

  for (const file of files || []) {
    if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
      continue;
    }

    const signature = buildAssistAttachmentSignature(file);
    if (!signature || seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    nextItems.push(file);
    if (nextItems.length >= MAX_ASSIST_ATTACHMENTS) {
      break;
    }
  }

  return nextItems;
}

function clampFlowchartScale(value) {
  return Math.max(0.45, Math.min(2.4, Number(value || 1)));
}

export function createLessonEditorApp({ root, storage, editor, initialProject }) {
  if (!root) fail("Raiz inválida.");
  if (!storage || typeof storage.loadProject !== "function") fail("Storage inválido.");
  if (typeof storage.loadCommentForPath !== "function" || typeof storage.saveCommentForPath !== "function") fail("Storage relacional de comentários inválido.");
  if (!editor) fail("Editor inválido.");
  if (!initialProject || !Array.isArray(initialProject.courses)) fail("Projeto inicial inválido.");
  const initialAssistConfig = normalizeAssistConfig({});
  const state = {
    project: initialProject,
    view: "courses",
    homeTab: "courses",
    generationPanelOpen: false,
    selection: null,
    cardCommentOpen: false,
    entityEditor: null,
    assistConfigOpen: false,
    providerConfigOpen: false,
    assistConfig: initialAssistConfig,
    assistConfigDraft: { ...initialAssistConfig },
    assistPlanningInferencePending: false,
    assistPlanningInferenceMessage: "",
    assistProfileEditor: null,
    codexCliSetupStatus: createCodexCliSetupStatus(),
    pendingExternalImport: null,
    microsequenceMode: "play",
    cardCommentDraft: "",
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
      selectedMode: ASSIST_USER_MODES.EDIT_MICROSEQUENCE,
      activeWorkbenchPane: "preview",
      actionIntent: "",
      promptText: "",
      preferredContainer: "",
      preferredContainerConfirmed: false,
      interventionTargetMode: "current",
      operationMode: "reinforce",
      attachments: [],
      selectedRefIds: [],
      pendingRefId: "",
      feedbackEditing: false,
      feedbackDraftText: "",
      interventionSession: createEmptyInterventionSession(),
      isSubmitting: false,
      errorMessage: ""
    },
    generationDraft: {
      courseFixed: false,
      moduleFixed: false,
      lessonFixed: false,
      courseInput: "",
      courseKey: "",
      moduleInput: "",
      moduleKey: "",
      lessonInput: "",
      lessonKey: "",
      includeTopics: [],
      excludeTopics: [],
      pendingIncludeTopic: "",
      pendingExcludeTopic: "",
      promptText: "",
      attachments: [],
      lastResult: null,
      isSubmitting: false,
      errorMessage: "",
      progress: createGenerationProgressState()
    },
    structureDrag: null,
    structureDrop: null,
    lastCoursesView: "courses",
    pendingGeneratedNavigation: null,
    pendingStructureFocus: null,
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

  function readVisibleProjectProjection(reader, input) {
    return reader(state.project, input);
  }

  const structuralEditor = {
    createCourse(input) {
      return commitVisibleProjectMutation(createCourseDocument, input);
    },
    importCourses(input) {
      return commitVisibleProjectMutation(importCoursesDocument, input);
    },
    importModules(input) {
      return commitVisibleProjectMutation(importModulesDocument, input);
    },
    importLessons(input) {
      return commitVisibleProjectMutation(importLessonsDocument, input);
    },
    exportCourseDocument(input) {
      return readVisibleProjectProjection(exportCourseDocumentFromDocument, input);
    },
    exportModuleDocument(input) {
      return readVisibleProjectProjection(exportModuleDocumentFromDocument, input);
    },
    exportLessonDocument(input) {
      return readVisibleProjectProjection(exportLessonDocumentFromDocument, input);
    },
    updateCourse(input) {
      return commitVisibleProjectMutation(updateCourseDocument, input);
    },
    deleteCourse(input) {
      return commitVisibleProjectMutation(deleteCourseDocument, input);
    },
    moveCourse(input) {
      return commitVisibleProjectMutation(moveCourseDocument, input);
    },
    createModule(input) {
      return commitVisibleProjectMutation(createModuleDocument, input);
    },
    updateModule(input) {
      return commitVisibleProjectMutation(updateModuleDocument, input);
    },
    deleteModule(input) {
      return commitVisibleProjectMutation(deleteModuleDocument, input);
    },
    moveModule(input) {
      return commitVisibleProjectMutation(moveModuleDocument, input);
    },
    createLesson(input) {
      return commitVisibleProjectMutation(createLessonDocument, input);
    },
    updateLesson(input) {
      return commitVisibleProjectMutation(updateLessonDocument, input);
    },
    deleteLesson(input) {
      return commitVisibleProjectMutation(deleteLessonDocument, input);
    },
    moveLesson(input) {
      return commitVisibleProjectMutation(moveLessonDocument, input);
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

  function clearStructureDropClasses() {
    root
      .querySelectorAll(
        ".structure-drop-before, .structure-drop-after, .structure-drop-inline-before, .structure-drop-inline-after, .structure-drag-origin"
      )
      .forEach((node) => {
        node.classList.remove(
          "structure-drop-before",
          "structure-drop-after",
          "structure-drop-inline-before",
          "structure-drop-inline-after",
          "structure-drag-origin"
        );
      });
  }

  function getStructureDropClass(level, position) {
    if (level === "card") {
      return position === "after" ? "structure-drop-inline-after" : "structure-drop-inline-before";
    }
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

  function getStructureAxis(level) {
    return level === "card" ? "x" : "y";
  }

  function getStructureDropPositionForAxis(targetNode, point, axis) {
    const rect = targetNode.getBoundingClientRect();
    if (axis === "x") {
      return point > rect.left + rect.width / 2 ? "after" : "before";
    }
    return point > rect.top + rect.height / 2 ? "after" : "before";
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

  function resolveCollectionDropState(collectionNode, drag, clientX, clientY) {
    const collection = readStructureCollection(collectionNode);
    if (!collection || !drag || collection.level !== drag.level) {
      return null;
    }

    const axis = getStructureAxis(drag.level);
    const point = axis === "x" ? clientX : clientY;
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
    const firstThreshold = axis === "x" ? firstRect.left + firstRect.width / 2 : firstRect.top + firstRect.height / 2;
    const lastThreshold = axis === "x" ? lastRect.left + lastRect.width / 2 : lastRect.top + lastRect.height / 2;

    if (point <= firstThreshold) {
      return { target: first.payload, position: "before", node: first.node };
    }
    if (point >= lastThreshold) {
      return { target: last.payload, position: "after", node: last.node };
    }

    for (const entry of items) {
      const position = getStructureDropPositionForAxis(entry.node, point, axis);
      const rect = entry.node.getBoundingClientRect();
      const threshold = axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      if ((position === "before" && point <= threshold) || (position === "after" && point >= threshold)) {
        return { target: entry.payload, position, node: entry.node };
      }
    }

    return { target: last.payload, position: "after", node: last.node };
  }

  function markStructureDropTarget(targetNode, position) {
    clearStructureDropClasses();
    const originNode = state.structureDrag?.originNode || null;
    originNode?.classList.add("structure-drag-origin");
    targetNode.classList.add(getStructureDropClass(state.structureDrag?.level, position));
  }

  function getAssistCatalog() {
    const context = getRenderContext();
    return collectAssistRefs(context.course, context.moduleValue, context.lesson, context.microsequence);
  }

  function getAssistModeOptions() {
    return {
      options: [{ value: ASSIST_USER_MODES.EDIT_MICROSEQUENCE, label: "Editar microssequência" }],
      locked: true
    };
  }

  function getDefaultAssistUserMode() {
    return ASSIST_USER_MODES.EDIT_MICROSEQUENCE;
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

  function focusStructureTarget(target) {
    if (!target) {
      return;
    }
    state.pendingStructureFocus = {
      view: target.view || state.view,
      courseKey: target.courseKey || null,
      moduleKey: target.moduleKey || null,
      lessonKey: target.lessonKey || null,
      microsequenceKey: target.microsequenceKey || null
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
    recordCurrentCardView();

    render({ preserveState: false });
  }

  function getLessonProgressReference(courseKey, moduleKey, lessonKey) {
    if (!courseKey || !moduleKey || !lessonKey) {
      return null;
    }

    return { courseKey, moduleKey, lessonKey };
  }

  function recordCurrentCardView() {
    if (typeof storage.recordCardView !== "function" || !state.selection.cardKey) return;
    storage.recordCardView(state.selection).catch((error) => {
      console.warn("A primeira visualização do card ficou pendente.", error);
    });
  }

  function recordCurrentCardAttempt(result) {
    if (typeof storage.recordCardAttempt !== "function" || !state.selection.cardKey) return;
    storage.recordCardAttempt(state.selection, result).catch((error) => {
      console.warn("A tentativa do card ficou pendente.", error);
    });
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
    return ASSIST_MODEL_OPTIONS.find((item) => item.value === model)?.label || model;
  }

  function getAssistContainerLabel(container) {
    return ASSIST_CARD_CONTAINER_OPTIONS.find((item) => item.value === container)?.label || "Automático";
  }

  function getCurrentInterventionReference(reference = state.selection) {
    return {
      courseKey: String(reference?.courseKey || "").trim(),
      moduleKey: String(reference?.moduleKey || "").trim(),
      lessonKey: String(reference?.lessonKey || "").trim(),
      microsequenceKey: String(reference?.microsequenceKey || "").trim()
    };
  }



  function getInterventionSession() {
    return state.assistDraft.interventionSession || createEmptyInterventionSession();
  }

  function persistInterventionSession(sessionPatch = {}) {
    const current = getInterventionSession();
    const nextSession = { ...current, ...sessionPatch };
    state.assistDraft.interventionSession = nextSession;
    if (!state.assistDraft.feedbackEditing) {
      state.assistDraft.feedbackDraftText = nextSession.nextPromptDraft || nextSession.feedbackText || "";
    }
    return nextSession;
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
      minMicrosequences: 3,
      targetMicrosequences: 5,
      maxMicrosequences: 8,
      requireCoreCoverageBeforeExtensions: true,
      requireVocabularyMap: true,
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
    return state.assistConfig.codexEndpoint || DEFAULT_CODEX_LOCAL_ENDPOINT;
  }

  function getCodexSetupPlatform() {
    return detectCodexCliSetupPlatform();
  }

  function getCodexSetupScript() {
    try {
      return buildCodexCliSetupScript({
        platform: getCodexSetupPlatform(),
        endpoint: getCodexSetupEndpoint(),
        token: state.assistConfig.codexToken
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
        token: state.assistConfig.codexToken
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
    if (!isCodexLocalModel(model)) {
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
    state.assistPlanningInferencePending = false;
    state.assistPlanningInferenceMessage = "";
    state.assistConfigOpen = true;
    render({ preserveState: true });
  }

  function closeAssistConfig() {
    cancelAssistProfileEditor();
    state.assistPlanningInferencePending = false;
    state.assistPlanningInferenceMessage = "";
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
    const shouldDefaultDeepSeekBaseUrl =
      isDeepSeekModelId(model)
      && !String(state.assistConfig.baseUrl || "").trim();
    state.assistConfig = normalizeAssistConfig({
      ...state.assistConfig,
      model,
      ...(shouldDefaultDeepSeekBaseUrl
        ? { baseUrl: DEEPSEEK_BASE_URL }
        : {})
    });
    if (state.assistConfigOpen) {
      state.assistConfigDraft = cloneAssistConfig();
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

  function setAssistPlanningInferenceState({ pending = false, message = "" } = {}) {
    state.assistPlanningInferencePending = pending === true;
    state.assistPlanningInferenceMessage = text(message);
  }

  function normalizeAssistMicrosequenceRange(patch = {}) {
    const current = state.assistConfig.profileTuning || {};
    const resolveValue = (value, fallback) => {
      const numeric = Number.parseInt(String(value ?? ""), 10);
      return Number.isFinite(numeric) ? Math.max(1, numeric) : fallback;
    };

    const minMicrosequences = resolveValue(patch.minMicrosequences, resolveValue(current.minMicrosequences, 3));
    const maxCandidate = resolveValue(patch.maxMicrosequences, resolveValue(current.maxMicrosequences, 8));
    const maxMicrosequences = Math.max(minMicrosequences, maxCandidate);
    const targetCandidate = resolveValue(
      patch.targetMicrosequences,
      resolveValue(current.targetMicrosequences, 5)
    );
    const targetMicrosequences = Math.min(maxMicrosequences, Math.max(minMicrosequences, targetCandidate));

    return {
      minMicrosequences,
      targetMicrosequences,
      maxMicrosequences
    };
  }

  async function inferAssistPlanningFromRequest() {
    const requestText = text(state.generationDraft.promptText);
    const currentDescription = text(state.assistConfig.profileTuning?.courseModel?.description);
    const hasAttachments = Array.isArray(state.generationDraft.attachments) && state.generationDraft.attachments.length > 0;
    if (!requestText && !currentDescription && !hasAttachments) {
      setAssistPlanningInferenceState({
        pending: false,
        message: "Informe um pedido, escreva no campo Perfil ou anexe material antes de completar o planejamento."
      });
      render({ preserveState: true });
      return;
    }

    const readiness = await resolveGenerationProviderReadiness({
      selectedModel: state.assistConfig.model,
      codexEndpoint: state.assistConfig.codexEndpoint,
      codexToken: state.assistConfig.codexToken,
      checkCodexLocalHealth
    });
    if (!readiness.ok && isCodexLocalModel(state.assistConfig.model)) {
      state.codexCliSetupStatus = createCodexCliSetupStatus({
        ok: false,
        checking: false,
        error: readiness.error || "O bridge local não está ativo.",
        data: readiness.data ?? null
      });
      setAssistPlanningInferenceState({
        pending: false,
        message: state.codexCliSetupStatus.error || "O bridge local não está ativo."
      });
      render({ preserveState: true });
      return;
    }

    setAssistPlanningInferenceState({
      pending: true,
      message: "Lendo o pedido e completando todos os parâmetros do planejamento..."
    });
    render({ preserveState: true });

    try {
      const result = await inferPlanningProfileTuning({
        assistConfig: state.assistConfig,
        requestText: [requestText, currentDescription].filter(Boolean).join("\n\n"),
        attachments: state.generationDraft.attachments || [],
        ingestAttachments: ingestAttachments
      });
      persistAssistConfigValue({
        profileTuning: {
          ...(state.assistConfig.profileTuning || {}),
          ...result.profileTuningPatch
        }
      });
      setAssistPlanningInferenceState({
        pending: false,
        message: "Planejamento completado com todos os parâmetros atualizados."
      });
      render({ preserveState: true });
    } catch (error) {
      setAssistPlanningInferenceState({
        pending: false,
        message: text(error?.message) || "Não foi possível completar o planejamento."
      });
      render({ preserveState: true });
    }
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







  function getAssistRefs() {
    return getAssistCatalog();
  }

  function syncAssistDraft() {
    const refs = getAssistRefs();
    const allowedIds = new Set(refs.map((item) => item.id));
    const filteredIds = state.assistDraft.selectedRefIds.filter((id) => allowedIds.has(id));
    state.assistDraft.selectedRefIds = filteredIds.slice(0, MAX_ASSIST_REFS);

    const availableIds = refs
      .filter((item) => !state.assistDraft.selectedRefIds.includes(item.id))
      .map((item) => item.id);
    if (!availableIds.includes(state.assistDraft.pendingRefId)) {
      state.assistDraft.pendingRefId = availableIds[0] || "";
    }
    const modeOptions = getAssistModeOptions();
    const allowedModes = new Set(modeOptions.options.map((item) => item.value));
    if (!allowedModes.has(state.assistDraft.selectedMode)) {
      const defaultMode = getDefaultAssistUserMode();
      state.assistDraft.selectedMode = allowedModes.has(defaultMode)
        ? defaultMode
        : modeOptions.options[0]?.value || defaultMode;
    }
    if (!ASSIST_CARD_CONTAINER_OPTIONS.some((item) => item.value === state.assistDraft.preferredContainer)) {
      state.assistDraft.preferredContainer = "";
      state.assistDraft.preferredContainerConfirmed = false;
    }
    if (!BOTTOM_UP_TARGET_MODE_OPTIONS.some((item) => item.value === state.assistDraft.interventionTargetMode)) {
      state.assistDraft.interventionTargetMode = "current";
    }
    if (!BOTTOM_UP_OPERATION_MODE_OPTIONS.some((item) => item.value === state.assistDraft.operationMode)) {
      state.assistDraft.operationMode = "reinforce";
    }
    const context = getRenderContext();
    const hasNextPlannedMicrosequence = Boolean(findNextPlannedMicrosequenceInLesson(context.lesson, context.microsequence?.id));
    if (!isValidAssistActionIntent(state.assistDraft.actionIntent, {
      microsequence: context.microsequence,
      hasNextPlannedMicrosequence
    })) {
      state.assistDraft.actionIntent = "";
    }
    state.assistDraft.attachments = normalizeAssistAttachmentList(state.assistDraft.attachments);
    const reference = getCurrentInterventionReference();
    if (!reference.microsequenceKey) {
      state.assistDraft.interventionSession = createEmptyInterventionSession();
      return;
    }
    const nextSession = getInterventionSession(reference);
    state.assistDraft.interventionSession = nextSession;
    if (!state.assistDraft.feedbackEditing) {
      state.assistDraft.feedbackDraftText = nextSession.nextPromptDraft || nextSession.feedbackText || "";
    }
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
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
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
    state.assistDraft.selectedRefIds = Array.isArray(microsequence.dependsOn)
      ? microsequence.dependsOn.slice(0, MAX_ASSIST_REFS)
      : [];

    state.view = "microsequence";
    state.assistDraft.selectedMode = ASSIST_USER_MODES.EDIT_MICROSEQUENCE;
    state.assistDraft.activeWorkbenchPane = "content";
    state.assistDraft.attachments = [];
    state.assistDraft.actionIntent = "";
    state.assistDraft.promptText = "";
    state.assistDraft.preferredContainer = "";
    state.assistDraft.preferredContainerConfirmed = false;
    state.assistDraft.interventionTargetMode = "current";
    state.assistDraft.operationMode = "reinforce";
    state.assistDraft.feedbackEditing = false;
    state.assistDraft.feedbackDraftText = "";
    state.microsequenceMode = "play";
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
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
      recordCurrentCardView();
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
        const wasAlreadyCorrect = state.flowchartPracticeByBlockKey[entry.blockKey]?.feedback === "correct";
        const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
        state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
        if (!wasAlreadyCorrect && result.status !== "incomplete" && result.status !== "none") {
          recordCurrentCardAttempt(result.status);
        }
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
          const wasAlreadyCorrect = state.flowchartPracticeByBlockKey[entry.blockKey]?.feedback === "correct";
          const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
          state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
          if (!wasAlreadyCorrect && result.status !== "incomplete" && result.status !== "none") {
            recordCurrentCardAttempt(result.status);
          }
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
    state.cardCommentDraft = typeof comment?.body === "string" ? comment.body : "";
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
      await storage.saveCommentForPath(state.selection, state.cardCommentDraft);
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
    state.cardCommentOpen = false;
    state.assistConfigOpen = false;
    render({ preserveState: true });
  }











  function closeEntityEditor() {
    state.entityEditor = null;
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
            '<span class="dependency-chip-remove" aria-hidden="true">&times;</span>' +
            "</button>"
          );
        })
        .join("");
    }
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  }

  function setEntityFieldValue(node, value) {
    if (!node) return;
    if (node instanceof HTMLSelectElement) {
      node.value = String(value || "");
      return;
    }
    if (node instanceof HTMLElement && node.classList.contains("entity-tag-combobox")) {
      setEntityTagComboboxValues(node, value);
      return;
    }
    if ("value" in node) {
      node.value = value;
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























  function notifyUser(message) {
    if (typeof globalThis.alert === "function") {
      globalThis.alert(message);
    }
  }

  function notifyIncompleteExercise(message) {
    void message;
  }

  function encodeBase64Utf8(value) {
    const text = String(value ?? "");
    if (typeof TextEncoder !== "undefined") {
      const bytes = new TextEncoder().encode(text);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return globalThis.btoa(binary);
    }
    return globalThis.btoa(unescape(encodeURIComponent(text)));
  }

  function downloadJsonFile(filename, content) {
    if (
      globalThis.AndroidHost &&
      typeof globalThis.AndroidHost.saveExportFile === "function" &&
      typeof globalThis.btoa === "function"
    ) {
      try {
        const saved = globalThis.AndroidHost.saveExportFile(
          encodeBase64Utf8(content),
          filename,
          "application/json"
        );
        if (saved) return;
      } catch (error) {
        console.warn("Falha ao exportar pelo host Android.", error);
      }
    }

    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
      fail("Exportação indisponível neste ambiente.");
    }

    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function pickJsonFile() {
    if (typeof document === "undefined") {
      return Promise.reject(new Error("Importação indisponível neste ambiente."));
    }

    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.style.display = "none";

      const cleanup = () => {
        input.remove();
      };

      input.addEventListener(
        "change",
        async () => {
          try {
            const [file] = Array.from(input.files || []);
            cleanup();
            if (!file) {
              resolve(null);
              return;
            }
            resolve(await file.text());
          } catch (error) {
            cleanup();
            reject(error);
          }
        },
        { once: true }
      );
      input.addEventListener(
        "cancel",
        () => {
          cleanup();
          resolve(null);
        },
        { once: true }
      );

      document.body.appendChild(input);
      input.click();
    });
  }

  function selectImportedCourse(nextProject) {
    setProject(nextProject);

    const importedCourse = nextProject.courses[nextProject.courses.length - 1];
    const moduleValue = importedCourse?.modules?.[0] || null;
    const lesson = moduleValue?.lessons?.[0] || null;
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;

    if (importedCourse && moduleValue && lesson && microsequence && card) {
      applySelection({
        courseKey: importedCourse.id,
        moduleKey: moduleValue.id,
        lessonKey: lesson.id,
        microsequenceKey: microsequence.id,
        cardKey: card.id,
        cardIndex: 0
      });
    } else {
      selectFirstPath(nextProject);
    }
  }

  function clearPendingExternalImport({ preserveState = true } = {}) {
    state.pendingExternalImport = null;
    render({ preserveState });
  }

  function applyJsonImportFromParsed(parsed) {
    detectJsonExchangeFormat(parsed);
    const nextProject = structuralEditor.importCourses({ document: parsed });
    selectImportedCourse(nextProject);
    notifyUser("Curso importado.");
  }

  function receiveExternalJsonImport(rawText, { sourceName = "Compartilhamento Android" } = {}) {
    try {
      const prepared = handleExternalJsonImportText(rawText, { sourceName });
      state.pendingExternalImport = {
        rawText: prepared.rawText,
        parsed: prepared.parsed,
        detectedFormat: prepared.detectedFormat,
        sourceName: prepared.sourceName,
        error: ""
      };
    } catch (error) {
      state.pendingExternalImport = {
        rawText: typeof rawText === "string" ? rawText : "",
        parsed: null,
        detectedFormat: "",
        sourceName: String(sourceName || "Compartilhamento Android").trim() || "Compartilhamento Android",
        error: error instanceof Error ? error.message : "Falha ao receber o conteúdo compartilhado."
      };
    }

    state.assistConfigOpen = false;
    state.generationPanelOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    render({ preserveState: true });
    return true;
  }

  function confirmPendingExternalImport() {
    const pendingImport = state.pendingExternalImport;
    if (!pendingImport || pendingImport.error) {
      return;
    }

    try {
      applyJsonImportFromParsed(pendingImport.parsed);
      state.pendingExternalImport = null;
      render({ preserveState: false });
    } catch (error) {
      state.pendingExternalImport = {
        ...pendingImport,
        error: error instanceof Error ? error.message : "Falha ao importar o conteúdo recebido."
      };
      render({ preserveState: true });
    }
  }

  async function importJsonFromFile() {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      fail("JSON inválido.");
    }
    applyJsonImportFromParsed(parsed);
  }

  function parseContractDocument(rawJson, scopeLabel) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      fail("JSON inválido.");
    }
    const format = detectJsonExchangeFormat(parsed);
    if (format !== "contract") {
      fail(`Arquivo incompatível para ${scopeLabel}. Use um JSON do AraLearn exportado no nível correto.`);
    }
    return parsed;
  }

  async function importModuleFromFile(courseKey) {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    const nextProject = structuralEditor.importModules({
      courseKey,
      document: parseContractDocument(rawJson, "importar módulo")
    });
    setProject(nextProject);
    const course = findCourse(nextProject, courseKey);
    const moduleValue = course.modules[course.modules.length - 1];
    const lesson = moduleValue?.lessons?.[0] || null;
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey,
      moduleKey: moduleValue?.id || null,
      lessonKey: lesson?.id || null,
      microsequenceKey: microsequence?.id || null,
      cardKey: card?.id || null,
      cardIndex: 0
    });
    state.view = "course";
    notifyUser("Módulo importado.");
  }

  async function importLessonFromFile(courseKey, moduleKey) {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    const nextProject = structuralEditor.importLessons({
      courseKey,
      moduleKey,
      document: parseContractDocument(rawJson, "importar lição")
    });
    setProject(nextProject);
    const moduleValue = findModule(nextProject, courseKey, moduleKey);
    const lesson = moduleValue.lessons[moduleValue.lessons.length - 1];
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey,
      moduleKey,
      lessonKey: lesson?.id || null,
      microsequenceKey: microsequence?.id || null,
      cardKey: card?.id || null,
      cardIndex: 0
    });
    state.view = "lesson";
    notifyUser("Lição importada.");
  }

  async function importMicrosequenceFromFile(courseKey, moduleKey, lessonKey) {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    const nextProject = editor.importMicrosequences({
      courseKey,
      moduleKey,
      lessonKey,
      document: parseContractDocument(rawJson, "importar microssequência")
    });
    setProject(nextProject);
    const lesson = findLesson(nextProject, courseKey, moduleKey, lessonKey);
    const microsequence = lesson.microsequences[lesson.microsequences.length - 1];
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey: microsequence?.id || null,
      cardKey: card?.id || null,
      cardIndex: 0
    });
    state.view = "lesson";
    notifyUser("Microssequência importada.");
  }

  function exportCourseAsJson(courseKey) {
    const course = findCourse(state.project, courseKey);
    const exportedDocument = structuralEditor.exportCourseDocument({ courseKey });
    downloadJsonFile(
      `${slugifyDownloadName(course.title || course.id)}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
  }

  function exportModuleAsJson(courseKey, moduleKey) {
    const moduleValue = findModule(state.project, courseKey, moduleKey);
    const exportedDocument = structuralEditor.exportModuleDocument({ courseKey, moduleKey });
    downloadJsonFile(
      `${slugifyDownloadName(moduleValue.title || moduleValue.id, "modulo")}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
  }

  function exportLessonAsJson(courseKey, moduleKey, lessonKey) {
    const lesson = findLesson(state.project, courseKey, moduleKey, lessonKey);
    const exportedDocument = structuralEditor.exportLessonDocument({ courseKey, moduleKey, lessonKey });
    downloadJsonFile(
      `${slugifyDownloadName(lesson.title || lesson.id, "licao")}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
  }

  function exportMicrosequenceAsJson(courseKey, moduleKey, lessonKey, microsequenceKey) {
    const microsequence = findMicrosequence(state.project, courseKey, moduleKey, lessonKey, microsequenceKey);
    const exportedDocument = editor.exportMicrosequenceDocument({ courseKey, moduleKey, lessonKey, microsequenceKey });
    downloadJsonFile(
      `${slugifyDownloadName(microsequence.title || microsequence.id, "microssequencia")}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
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

  function createCardAtPosition(position, kind = "paragraph", reference = {}) {
    const courseKey = reference.courseKey || state.selection.courseKey;
    const moduleKey = reference.moduleKey || state.selection.moduleKey;
    const lessonKey = reference.lessonKey || state.selection.lessonKey;
    const microsequenceKey = reference.microsequenceKey || state.selection.microsequenceKey;
    if (!microsequenceKey) return null;
    const starterCard = createStarterContractCard(kind);

    const nextProject = editor.createCard({
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      ...starterCard,
      position
    });

    setProject(nextProject);
    const cards = getActiveMicrosequenceCards({
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey
    });
    const nextIndex = Math.max(0, Math.min(position, Math.max(0, cards.length - 1)));
    const nextCard = cards[nextIndex] || null;
    state.selection.cardIndex = nextIndex;
    state.selection.cardKey = nextCard ? nextCard.id : null;
    state.selection.courseKey = courseKey;
    state.selection.moduleKey = moduleKey;
    state.selection.lessonKey = lessonKey;
    state.selection.microsequenceKey = microsequenceKey;
    syncAssistDraft();
    return nextProject;
  }

  function resolveGeneratedMicrosequenceSelection({
    previousProjectDocument,
    nextProjectDocument,
    fallbackSelection,
    targetMode = "current",
    anchorMicrosequenceKey = ""
  }) {
    if (targetMode !== "new_after_current") {
      return fallbackSelection;
    }
    const previousLesson = findLesson(
      previousProjectDocument,
      fallbackSelection.courseKey,
      fallbackSelection.moduleKey,
      fallbackSelection.lessonKey
    );
    const nextLesson = findLesson(
      nextProjectDocument,
      fallbackSelection.courseKey,
      fallbackSelection.moduleKey,
      fallbackSelection.lessonKey
    );
    const previousKeys = new Set((Array.isArray(previousLesson?.microsequences) ? previousLesson.microsequences : []).map((item) => item.id).filter(Boolean));
    const nextMicrosequences = Array.isArray(nextLesson?.microsequences) ? nextLesson.microsequences : [];
    const inserted = nextMicrosequences.filter((item) => item?.id && !previousKeys.has(item.id));
    const anchoredCandidate =
      anchorMicrosequenceKey
        ? (() => {
            const anchorIndex = nextMicrosequences.findIndex((item) => item?.id === anchorMicrosequenceKey);
            if (anchorIndex < 0) return null;
            for (let index = anchorIndex + 1; index < nextMicrosequences.length; index += 1) {
              const candidate = nextMicrosequences[index];
              if (candidate?.id && !previousKeys.has(candidate.id)) {
                return candidate;
              }
            }
            return null;
          })()
        : null;
    const targetMicrosequence = anchoredCandidate || inserted[0] || null;
    if (!targetMicrosequence?.id) {
      return fallbackSelection;
    }
    return {
      ...fallbackSelection,
      microsequenceKey: targetMicrosequence.id
    };
  }

  function applyMicrosequenceGeneration({
    projectDocument,
    previousProjectDocument = state.project,
    fallbackTitle = "Microssequência",
    targetMode = "current",
    anchorMicrosequenceKey = ""
  }) {
    setProject(projectDocument);
    const resolvedSelection = resolveGeneratedMicrosequenceSelection({
      previousProjectDocument,
      nextProjectDocument: projectDocument,
      fallbackSelection: {
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: state.selection.microsequenceKey,
        cardKey: null,
        cardIndex: 0
      },
      targetMode,
      anchorMicrosequenceKey
    });
    const nextPath = applySelectionByKeys(projectDocument, resolvedSelection);
    const microsequence = findMicrosequence(
      projectDocument,
      nextPath.courseKey,
      nextPath.moduleKey,
      nextPath.lessonKey,
      nextPath.microsequenceKey
    );
    const firstCard = getActiveMicrosequenceCards(nextPath)[0] || null;
    state.selection.cardIndex = 0;
    state.selection.cardKey = firstCard ? firstCard.id : null;
    state.assistDraft.activeWorkbenchPane = "preview";
    persistInterventionSession({
      status: "completed",
      title: "Cards atualizados",
      message: `${Array.isArray(getActiveMicrosequenceCards(state.selection)) ? getActiveMicrosequenceCards(state.selection).length : 0} cards aplicados em ${microsequence?.title || fallbackTitle}.`,
      feedbackText: `Cards aplicados em "${microsequence?.title || fallbackTitle}".`,
      nextPromptDraft: ""
    });
    syncAssistDraft();
  }





  function getVisibleCourses(project = state.project) {
    return project.courses || [];
  }

  function applyGenerationScope({
    courseKey = "",
    moduleKey = "",
    lessonKey = ""
  } = {}) {
    const nextGenerationPanelState = applyGenerationPanelScopeState({
      draft: state.generationDraft,
      scope: { courseKey, moduleKey, lessonKey },
      projectDocument: state.project,
      visibleCourses: getVisibleCourses(),
      findCourse,
      findModule,
      findLesson
    });
    state.generationDraft = nextGenerationPanelState.draft;
    state.pendingGeneratedNavigation = nextGenerationPanelState.pendingGeneratedNavigation;
  }

  function clearGenerationScope() {
    applyGenerationScope();
  }

  function openGenerationPanel(scope = {}) {
    const nextGenerationPanelState = buildOpenedGenerationPanelState({
      draft: state.generationDraft,
      scope,
      projectDocument: state.project,
      visibleCourses: getVisibleCourses(),
      findCourse,
      findModule,
      findLesson
    });
    state.generationDraft = nextGenerationPanelState.draft;
    state.pendingGeneratedNavigation = nextGenerationPanelState.pendingGeneratedNavigation;
    state.generationPanelOpen = nextGenerationPanelState.generationPanelOpen;
    state.entityEditor = nextGenerationPanelState.entityEditor;
    render({ preserveState: true });
  }

  function closeGenerationPanel({ preserveGeneratedResult = true } = {}) {
    const nextGenerationPanelState = buildClosedGenerationPanelState({
      draft: state.generationDraft,
      preserveGeneratedResult,
      pendingGeneratedNavigation: state.pendingGeneratedNavigation
    });
    if (state.assistConfigOpen) {
      cancelAssistProfileEditor();
    }
    state.generationDraft = nextGenerationPanelState.draft;
    state.pendingGeneratedNavigation = nextGenerationPanelState.pendingGeneratedNavigation;
    state.generationPanelOpen = nextGenerationPanelState.generationPanelOpen;
    state.assistConfigOpen = false;
    render({ preserveState: true });
  }

  function handleGenerationPanelActionClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return false;
    }

    const actionNode = target.closest(
      "[data-action='open-generation-panel-global'], [data-action='open-generation-panel-course'], [data-action='open-generation-panel-module'], [data-action='open-generation-panel-lesson']"
    );
    if (!actionNode || !root.contains(actionNode)) {
      return false;
    }

    const action = actionNode.getAttribute("data-action") || "";
    const scope = resolveGenerationPanelScopeFromAction({
      action,
      dataset: {
        courseKey: actionNode.getAttribute("data-course-key") || "",
        moduleKey: actionNode.getAttribute("data-module-key") || "",
        lessonKey: actionNode.getAttribute("data-lesson-key") || ""
      },
      selection: state.selection || {}
    });
    if (scope === null) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    openGenerationPanel(scope);
    return true;
  }

  function triggerGenerationPanelFromNode(node, event = null) {
    if (!node) {
      return false;
    }

    const action = node.getAttribute("data-action") || "";
    const scope = resolveGenerationPanelScopeFromAction({
      action,
      dataset: {
        courseKey: node.getAttribute("data-course-key") || "",
        moduleKey: node.getAttribute("data-module-key") || "",
        lessonKey: node.getAttribute("data-lesson-key") || ""
      },
      selection: state.selection || {}
    });
    if (scope === null) {
      return false;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openGenerationPanel(scope);
    return true;
  }

  function bindGenerationPanelTrigger(node) {
    if (!node || node.getAttribute("data-generation-bound") === "true") {
      return;
    }

    node.setAttribute("data-generation-bound", "true");
    node.addEventListener("click", (event) => {
      triggerGenerationPanelFromNode(node, event);
    });
    node.addEventListener(
      "touchend",
      (event) => {
        triggerGenerationPanelFromNode(node, event);
      },
      { passive: false }
    );
  }

  function clearGenerationResult() {
    const nextGenerationPanelState = buildGenerationResultClearedState({
      draft: state.generationDraft,
      pendingGeneratedNavigation: state.pendingGeneratedNavigation
    });
    state.generationDraft = nextGenerationPanelState.draft;
    state.pendingGeneratedNavigation = nextGenerationPanelState.pendingGeneratedNavigation;
  }

  function getGenerationScopeState(project = state.project) {
    return resolveGenerationScopeViewState({
      draft: state.generationDraft,
      projectDocument: project,
      visibleCourses: getVisibleCourses(project),
      findCourse,
      findModule,
      findLesson
    });
  }

  function setGenerationInput(level, value, { rerender = true } = {}) {
    const nextGenerationPanelState = buildGenerationInputState({
      draft: state.generationDraft,
      level,
      value,
      visibleCourses: getVisibleCourses()
    });
    state.generationDraft = nextGenerationPanelState.draft;
    state.pendingGeneratedNavigation = nextGenerationPanelState.pendingGeneratedNavigation;
    if (rerender) {
      render({ preserveState: true });
    }
  }

  function normalizeGenerationTopic(value) {
    return String(value || "").trim();
  }

  function commitGenerationTopics(type, rawValue) {
    const listName = type === "exclude" ? "excludeTopics" : "includeTopics";
    const oppositeListName = type === "exclude" ? "includeTopics" : "excludeTopics";
    const merged = mergeGenerationTopics(state.generationDraft[listName], state.generationDraft[oppositeListName], rawValue);
    if (!merged) {
      return false;
    }
    state.generationDraft[listName] = merged.nextTopics;
    state.generationDraft[oppositeListName] = merged.filteredOppositeTopics;
    return true;
  }

  function addGenerationTopic(type) {
    const fieldName = type === "exclude" ? "pendingExcludeTopic" : "pendingIncludeTopic";
    const committed = commitGenerationTopics(type, state.generationDraft[fieldName]);
    if (!committed) {
      return;
    }
    state.generationDraft[fieldName] = "";
    clearGenerationResult();
    render({ preserveState: true });
  }

  function removeGenerationTopic(type, topic) {
    const listName = type === "exclude" ? "excludeTopics" : "includeTopics";
    const normalizedTopic = normalizeGenerationTopic(topic);
    state.generationDraft[listName] = (state.generationDraft[listName] || []).filter(
      (item) => normalizeGenerationTopic(item) !== normalizedTopic
    );
    clearGenerationResult();
    render({ preserveState: true });
  }

  function openGeneratedLesson({ pendingGeneratedNavigation = state.pendingGeneratedNavigation } = {}) {
    const openTarget = resolveOpenGeneratedLessonState({
      pendingGeneratedNavigation,
      lastResult: state.generationDraft.lastResult
    });
    if (!openTarget.ok) {
      state.generationDraft.errorMessage = openTarget.errorMessage;
      render({ preserveState: true });
      return;
    }

    applySelection(openTarget.selection);
    Object.assign(state, openTarget.viewState);
    focusStructureTarget(openTarget.focusTarget);
    render({ preserveState: false });
  }

  async function submitAssistRequest({ resumeSession = null } = {}) {
    const context = getRenderContext();
    const hadCardsBefore = Array.isArray(context.cards) && context.cards.length > 0;
    const previousProjectDocument = structuredClone(state.project);
    const selectedRefIds = getAssistCatalog()
      .filter((item) => state.assistDraft.selectedRefIds.includes(item.id))
      .map((item) => item.id);

    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });

    try {
      const visibleAssistTitle = context.microsequence?.title || "Microssequência";
      const submission = await executeMicrosequenceGeneration({
        selection: state.selection,
        draft: {
          ...state.assistDraft,
          microsequenceTitle: visibleAssistTitle,
          allowPromptlessSubmit: canGeneratePlannedCurrentWithoutPrompt(context.microsequence)
        },
        assistConfig: state.assistConfig,
        selectedRefIds,
        preferredContainerId: state.assistDraft.preferredContainer,
        preferredContainerLabel: getAssistContainerLabel(state.assistDraft.preferredContainer),
        lessonContext: {
          currentMicrosequenceTitle: context.microsequence?.title || "",
          microsequenceKeys: Array.isArray(context.lesson?.microsequences) ? context.lesson.microsequences.map((item) => item.id) : [],
          reusableMicrosequenceCount: Array.isArray(context.lesson?.microsequences) ? context.lesson.microsequences.length : 0
        },
        projectDocument: state.project,
        checkCodexLocalHealth,
        ingestAttachments: ingestAttachments,
        resumeSession,
        onFeedback: (feedback = {}) => {
          persistInterventionSession(
            {
              ...feedback
            }
          );
          render({ preserveState: true });
        }
      });

      if (submission.status === "provider-unready") {
        persistInterventionSession(
          {
            ...(submission.interventionFeedback || {})
          }
        );
        state.assistDraft.errorMessage = submission.errorMessage || "O bridge local não está ativo.";
        updateCodexCliSetupStatus({
          ok: false,
          checking: false,
          error: submission.errorMessage || "O local não está ativo."
        });
        openProviderConfig();
        return;
      }

      if (submission.status === "auth-error") {
        persistInterventionSession(
          {
            ...(submission.interventionFeedback || {})
          }
        );
        state.assistDraft.errorMessage = submission.errorMessage || "Erro de autenticação do provider.";
        openProviderConfig();
        return;
      }

      if (submission.status !== "success") {
        persistInterventionSession(
          {
            ...(submission.interventionFeedback || {})
          }
        );
        state.assistDraft.errorMessage = submission.errorMessage || "Falha ao chamar o serviço de IA.";
        return;
      }

      if (
        state.assistDraft.interventionTargetMode === "current" &&
        state.selection.microsequenceKey &&
        typeof storage.replaceMicrosequenceCards === "function"
      ) {
        storage.replaceMicrosequenceCards(
          submission.generationResult.projectDocument,
          state.selection.microsequenceKey
        );
      } else {
        storage.saveProject(submission.generationResult.projectDocument);
      }
      applyMicrosequenceGeneration({
        projectDocument: submission.generationResult.projectDocument,
        previousProjectDocument,
        fallbackTitle: context.microsequence?.title || "Microssequência",
        targetMode: state.assistDraft.interventionTargetMode,
        anchorMicrosequenceKey: state.selection.microsequenceKey
      });
      const nextMicrosequence = findMicrosequence(
        submission.generationResult.projectDocument,
        state.selection.courseKey,
        state.selection.moduleKey,
        state.selection.lessonKey,
        state.selection.microsequenceKey
      );
      const runtimeFeedback = submission.generationResult?.interventionFeedback || {};
      persistInterventionSession(
        {
          ...runtimeFeedback,
          title:
            runtimeFeedback.title
            || (state.assistDraft.interventionTargetMode === "new_after_current"
              ? "Nova microssequência gerada"
              : hadCardsBefore
                ? "Microssequência continuada"
                : "Primeiros cards gerados"),
          message:
            runtimeFeedback.message
            || `${Array.isArray(nextMicrosequence?.cards) ? nextMicrosequence.cards.length : 0} cards ${hadCardsBefore ? "na iteração atual" : "gerados"} em ${nextMicrosequence?.title || context.microsequence?.title || "Microssequência"} com ${getAssistModelLabel(state.assistConfig.model)}.`
        }
      );
      state.assistDraft.feedbackEditing = false;
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : "Falha ao chamar o serviço de IA.";
      persistInterventionSession(
        {
          status: "needs_retry",
          title: "Nova iteração necessária",
          message: fallbackMessage,
          feedbackText: state.assistDraft.promptText || fallbackMessage,
          nextPromptDraft: state.assistDraft.promptText,
          recommendedActionIntent: state.assistDraft.operationMode === "repair" ? "repair_current" : "generate_current",
          recommendedInterventionTargetMode: "current",
          recommendedOperationMode: state.assistDraft.operationMode === "repair" ? "repair" : "reinforce"
        }
      );
      state.assistDraft.errorMessage = fallbackMessage;
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  function clearAssistRequest() {
    state.assistDraft.promptText = "";
    state.assistDraft.actionIntent = "";
    state.assistDraft.preferredContainer = "";
    state.assistDraft.preferredContainerConfirmed = false;
    state.assistDraft.attachments = [];
    state.assistDraft.feedbackEditing = false;
    state.assistDraft.feedbackDraftText = state.assistDraft.interventionSession?.nextPromptDraft || state.assistDraft.interventionSession?.feedbackText || "";
    render({ preserveState: true });
  }

  function toggleAssistFeedbackEditing() {
    state.assistDraft.feedbackEditing = !state.assistDraft.feedbackEditing;
    if (!state.assistDraft.feedbackEditing) {
      state.assistDraft.feedbackDraftText =
        state.assistDraft.interventionSession?.nextPromptDraft
        || state.assistDraft.interventionSession?.feedbackText
        || "";
    }
    render({ preserveState: true });
  }

  function submitAssistFeedbackIteration() {
    const session = state.assistDraft.interventionSession;
    if (!interventionSessionNeedsIteration(session) || state.assistDraft.isSubmitting) {
      return;
    }
    const nextPrompt = String(state.assistDraft.feedbackDraftText || session?.nextPromptDraft || session?.feedbackText || "").trim();
    if (!nextPrompt) {
      return;
    }
    applyInterventionSessionRecommendation(session);
    state.assistDraft.promptText = nextPrompt;
    state.assistDraft.feedbackEditing = false;
    render({ preserveState: true });
    void submitAssistRequest({ resumeSession: session });
  }

  async function submitGenerateStructureRequest() {
    state.generationDraft.isSubmitting = true;
    state.generationDraft.errorMessage = "";
    state.generationDraft.lastResult = null;
    state.generationDraft.progress = reduceGenerationProgress(
      createGenerationProgressState({ visible: true }),
      {
        type: "prepare_request",
        message: "Preparando anexos, provider e escopo da geração top-down."
      }
    );
    render({ preserveState: true });

    const handleGeraçãoProgress = (event = {}) => {
      state.generationDraft.progress = reduceGenerationProgress(state.generationDraft.progress, event);
      render({ preserveState: true });
    };

    const submission = await executeStructureGeneration({
      draft: state.generationDraft,
      assistConfig: state.assistConfig,
      projectDocument: state.project,
      visibleCourses: getVisibleCourses(),
      findCourse,
      findModule,
      findLesson,
      checkCodexLocalHealth,
      ingestAttachments: ingestAttachments,
      onProgress: handleGeraçãoProgress
    });

    const latestProgress = state.generationDraft.progress;
    state.generationDraft = {
      ...submission.draft,
      progress: latestProgress
    };
    state.pendingGeneratedNavigation = submission.pendingGeneratedNavigation ?? null;

    if (submission.status === "provider-unready" && submission.shouldOpenCodexCliSetup) {
      state.generationDraft.progress = reduceGenerationProgress(state.generationDraft.progress, {
        type: "run_failed",
        message: submission.codexCliSetupStatus?.error || "Provider local indisponível."
      });
      updateCodexCliSetupStatus(submission.codexCliSetupStatus);
      openAssistConfig();
      return;
    }

    if (submission.status === "success") {
      state.generationDraft.progress = reduceGenerationProgress(state.generationDraft.progress, {
        type: "run_completed",
        phaseId: "final_report"
      });
      storage.saveProject(submission.generationResult.projectDocument);

      setProject(submission.generationResult.projectDocument);
      applySelection(submission.selection);
      state.generationDraft.progress = createGenerationProgressState();
    } else {
      state.generationDraft.progress = reduceGenerationProgress(state.generationDraft.progress, {
        type: "run_failed",
        message: submission.draft?.errorMessage || "Falha ao gerar a estrutura."
      });
    }

    render({ preserveState: submission.status !== "success" });
  }

  function applyStructureReorder(drag, target, position) {
    if (!canDropStructure(drag, target)) {
      resetStructureDragState();
      return;
    }

    let nextProject = null;

    if (drag.level === "course") {
      const items = state.project.courses || [];
      const toIndex = resolveStructureDropIndex(items, drag.courseKey, target.courseKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = structuralEditor.moveCourse({ courseKey: drag.courseKey, toIndex });
    } else if (drag.level === "module") {
      const course = findCourse(state.project, drag.courseKey);
      const items = course?.modules || [];
      const toIndex = resolveStructureDropIndex(items, drag.moduleKey, target.moduleKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = structuralEditor.moveModule({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        toIndex
      });
    } else if (drag.level === "lesson") {
      const moduleValue = findModule(state.project, drag.courseKey, drag.moduleKey);
      const items = moduleValue?.lessons || [];
      const toIndex = resolveStructureDropIndex(items, drag.lessonKey, target.lessonKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = structuralEditor.moveLesson({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey,
        toIndex
      });
    } else if (drag.level === "microsequence") {
      const lesson = findLesson(state.project, drag.courseKey, drag.moduleKey, drag.lessonKey);
      const items = lesson?.microsequences || [];
      const toIndex = resolveStructureDropIndex(items, drag.microsequenceKey, target.microsequenceKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      const moveResult = editor.moveMicrosequence({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey,
        microsequenceKey: drag.microsequenceKey,
        targetCourseKey: drag.courseKey,
        targetModuleKey: drag.moduleKey,
        targetLessonKey: drag.lessonKey,
        targetPosition: toIndex
      });
      nextProject = moveResult.document;
    } else if (drag.level === "card") {
      const items = getActiveMicrosequenceCards({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey,
        microsequenceKey: drag.microsequenceKey
      });
      const toIndex = resolveStructureDropIndex(items, drag.cardKey, target.cardKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = editor.moveCard({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey,
        microsequenceKey: drag.microsequenceKey,
        cardKey: drag.cardKey,
        toIndex
      });
    }

    if (!nextProject) {
      resetStructureDragState();
      return;
    }

    state.entityEditor = null;
    setProject(nextProject);
    applySelectionByKeys(nextProject, state.selection);
    syncAssistDraft();
    resetStructureDragState();
    render({ preserveState: true });
  }

  function getAssistActionIntentOptions({ microsequence, hasNextPlannedMicrosequence = false } = {}) {
    const isPlanned = isPlannedMicrosequenceForRuntime(microsequence);
    const nextPlannedOption = {
      value: ASSIST_ACTION_INTENTS.NEXT_PLANNED,
      label: "Gerar a prevista na trilha",
      icon: "microsequence",
      disabled: !hasNextPlannedMicrosequence
    };
    const branchAfterCurrentOption = {
      value: ASSIST_ACTION_INTENTS.BRANCH_AFTER_CURRENT,
      label: "Criar microssequência nova com cards",
      icon: "add"
    };
    return [
      {
        value: ASSIST_ACTION_INTENTS.GENERATE_CURRENT,
        label: isPlanned ? "Gerar cards nesta microssequência" : "Gerar mais cards nesta microssequência",
        icon: "sparkles"
      },
      {
        value: ASSIST_ACTION_INTENTS.REPAIR_CURRENT,
        label: "Corrigir os cards desta microssequência",
        icon: "edit"
      },
      nextPlannedOption,
      branchAfterCurrentOption
    ];
  }

  function isValidAssistActionIntent(intent, { microsequence, hasNextPlannedMicrosequence = false } = {}) {
    return getAssistActionIntentOptions({ microsequence, hasNextPlannedMicrosequence }).some((item) => item.value === intent && !item.disabled);
  }

  function applyAssistActionIntent(intent, microsequence = getRenderContext().microsequence) {
    state.assistDraft.actionIntent = intent;
    if (intent === ASSIST_ACTION_INTENTS.REPAIR_CURRENT) {
      state.assistDraft.interventionTargetMode = "current";
      state.assistDraft.operationMode = "repair";
      return;
    }
    if (intent === ASSIST_ACTION_INTENTS.NEXT_PLANNED) {
      state.assistDraft.interventionTargetMode = "current";
      state.assistDraft.operationMode = "reinforce";
      return;
    }
    if (intent === ASSIST_ACTION_INTENTS.BRANCH_AFTER_CURRENT) {
      state.assistDraft.interventionTargetMode = "new_after_current";
      state.assistDraft.operationMode = "reinforce";
      return;
    }
    if (intent === ASSIST_ACTION_INTENTS.GENERATE_CURRENT) {
      state.assistDraft.interventionTargetMode = "current";
      state.assistDraft.operationMode = "reinforce";
      return;
    }
    state.assistDraft.actionIntent = "";
    state.assistDraft.interventionTargetMode = "current";
    state.assistDraft.operationMode = isPlannedMicrosequenceForRuntime(microsequence) ? "reinforce" : "reinforce";
  }

  function applyInterventionSessionRecommendation(session = state.assistDraft.interventionSession) {
    const recommendedActionIntent = String(session?.recommendedActionIntent || "").trim();
    if (recommendedActionIntent) {
      applyAssistActionIntent(recommendedActionIntent, getRenderContext().microsequence);
    }
    if (String(session?.recommendedInterventionTargetMode || "").trim()) {
      state.assistDraft.interventionTargetMode = String(session.recommendedInterventionTargetMode).trim();
    }
    if (String(session?.recommendedOperationMode || "").trim()) {
      state.assistDraft.operationMode = String(session.recommendedOperationMode).trim();
    }
  }

  function getAssistPromptMetadata({ microsequence, actionIntent, hasNextPlannedMicrosequence = false } = {}) {
    const options = getAssistActionIntentOptions({ microsequence, hasNextPlannedMicrosequence });
    const selectedOption = options.find((item) => item.value === actionIntent) || null;
    if (actionIntent === ASSIST_ACTION_INTENTS.REPAIR_CURRENT) {
      return {
        promptLabel: "Pedido de correção",
        submitLabel: "Corrigir os cards desta microssequência",
        promptPlaceholder: "Diga o que deve ser corrigido nos cards atuais."
      };
    }
    if (actionIntent === ASSIST_ACTION_INTENTS.NEXT_PLANNED) {
      return {
        promptLabel: "Próxima microssequência da trilha",
        submitLabel: "Gerar a prevista na trilha",
        promptPlaceholder: "Sem pedido necessário."
      };
    }
    if (actionIntent === ASSIST_ACTION_INTENTS.BRANCH_AFTER_CURRENT) {
      return {
        promptLabel: "Pedido da nova microssequência",
        submitLabel: "Criar microssequência nova com cards",
        promptPlaceholder: "Diga por que a trilha precisa desta nova microssequência antes de voltar ao plano principal."
      };
    }
    if (actionIntent === ASSIST_ACTION_INTENTS.GENERATE_CURRENT) {
      const isPlanned = isPlannedMicrosequenceForRuntime(microsequence);
      return {
        promptLabel: isPlanned ? "Pedido dos cards desta microssequência" : "Pedido dos próximos cards",
        submitLabel: isPlanned ? "Gerar cards nesta microssequência" : "Gerar mais cards nesta microssequência",
        promptPlaceholder: isPlanned ? "Sem pedido necessário." : "Diga o que deve vir agora dentro desta microssequência."
      };
    }
    return {
      promptLabel: "Pedido",
      submitLabel: selectedOption ? selectedOption.label : "Enviar pedido",
      promptPlaceholder: "Descreva com clareza o que deve acontecer nesta intervenção."
    };
  }

  function getFeedbackSubmitLabel(session = state.assistDraft.interventionSession) {
    const status = String(session?.status || "").trim();
    if (status === "needs_new_microsequence") {
      return "Criar microssequência nova";
    }
    if (status === "needs_retry") {
      return "Tentar novamente";
    }
    return "Iterar";
  }

  function isPlannedMicrosequenceForRuntime(microsequence) {
    const cards = getActiveMicrosequenceCards({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: microsequence?.id || state.selection.microsequenceKey
    });
    return isDraftMicrosequence(microsequence) && cards.length === 0;
  }

  function canGeneratePlannedCurrentWithoutPrompt(microsequence = getRenderContext().microsequence) {
    return state.assistDraft.actionIntent === ASSIST_ACTION_INTENTS.GENERATE_CURRENT
      && isPlannedMicrosequenceForRuntime(microsequence);
  }

  function findNextPlannedMicrosequenceInLesson(lesson, currentMicrosequenceKey) {
    const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
    const currentIndex = microsequences.findIndex((item) => item?.id === currentMicrosequenceKey);
    if (currentIndex < 0) {
      return null;
    }
    for (let index = currentIndex + 1; index < microsequences.length; index += 1) {
      const candidate = microsequences[index];
      if (!candidate?.branchOf && isPlannedMicrosequenceForRuntime(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  function runEntityAction(actionKey) {
    if (!state.entityEditor || !actionKey) return;

    try {
      let nextProject = null;

      if (actionKey.startsWith("set-assist-container:")) {
        const nextContainer = actionKey.slice("set-assist-container:".length);
        state.assistDraft.preferredContainer = ASSIST_CARD_CONTAINER_OPTIONS.some((item) => item.value === nextContainer)
          ? nextContainer
          : "";
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      }

      if (actionKey === "import-json") {
        importJsonFromFile()
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar JSON.");
          });
        return;
      } else if (actionKey === "export-backup") {
        downloadJsonFile("aralearn-project-v3.json", storage.exportJson());
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "import-module") {
        importModuleFromFile(state.selection.courseKey)
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar módulo.");
          });
        return;
      } else if (actionKey === "import-lesson") {
        importLessonFromFile(state.selection.courseKey, state.selection.moduleKey)
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar lição.");
          });
        return;
      } else if (actionKey === "import-microsequence") {
        importMicrosequenceFromFile(state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey)
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar microssequência.");
          });
        return;
      } else if (actionKey === "edit-course-metadata") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        openEntityEditor("course-metadata", { courseKey });
        return;
      } else if (actionKey === "edit-module-metadata") {
        openEntityEditor("module", {
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey
        });
        return;
      } else if (actionKey === "edit-lesson-metadata") {
        openEntityEditor("lesson", {
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey
        });
        return;
      } else if (actionKey === "edit-microsequence-metadata") {
        openEntityEditor("microsequence", {
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          microsequenceKey: state.entityEditor.microsequenceKey
        });
        return;
      } else if (actionKey === "reset-course-progress") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const course = findCourse(state.project, courseKey);
        if (typeof globalThis.confirm === "function") {
          const accepted = globalThis.confirm(`Zerar progresso de todo o curso "${course.title || "Curso"}"?`);
          if (!accepted) {
            return;
          }
        }
        resetCourseProgress(courseKey);
        state.entityEditor = null;
        render({ preserveState: false });
        return;
      } else if (actionKey === "reset-module-progress") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleValue = findModule(state.project, courseKey, state.entityEditor.moduleKey);
        if (typeof globalThis.confirm === "function") {
          const accepted = globalThis.confirm(`Zerar progresso de todo o módulo "${moduleValue.title || "Módulo"}"?`);
          if (!accepted) {
            return;
          }
        }
        resetModuleProgress(courseKey, state.entityEditor.moduleKey);
        state.entityEditor = null;
        render({ preserveState: false });
        return;
      } else if (actionKey === "reset-lesson-progress") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const lesson = findLesson(state.project, courseKey, state.entityEditor.moduleKey, state.entityEditor.lessonKey);
        if (typeof globalThis.confirm === "function") {
          const accepted = globalThis.confirm(`Zerar progresso da lição "${lesson.title || "Lição"}"?`);
          if (!accepted) {
            return;
          }
        }
        resetLessonProgress(courseKey, state.entityEditor.moduleKey, state.entityEditor.lessonKey);
        state.entityEditor = null;
        render({ preserveState: false });
        return;
      } else if (actionKey === "export-course") {
        exportCourseAsJson(state.entityEditor.courseKey || state.selection.courseKey);
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "export-module") {
        exportModuleAsJson(state.entityEditor.courseKey || state.selection.courseKey, state.entityEditor.moduleKey);
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "export-lesson") {
        exportLessonAsJson(
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey,
          state.entityEditor.lessonKey
        );
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "export-microsequence") {
        exportMicrosequenceAsJson(
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey,
          state.entityEditor.lessonKey,
          state.entityEditor.microsequenceKey
        );
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "create-course") {
        nextProject = structuralEditor.createCourse({
          title: "Novo curso"
        });
        const course = nextProject.courses[nextProject.courses.length - 1];
        setProject(nextProject);

        applySelection(buildNodeSelection({ courseKey: course.id }));
        state.view = "courses";
      } else if (actionKey === "delete-course") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const course = findCourse(state.project, courseKey);
        if (
          typeof globalThis.confirm === "function" &&
          !globalThis.confirm(
            `Remover a sua cópia de "${course.title || "Curso"}"? O curso oficial continuará publicado no catálogo. ` +
            "A remoção da sua cópia será sincronizada e não poderá ser desfeita."
          )
        ) {
          return;
        }
        resetCourseProgress(courseKey);
        nextProject = structuralEditor.deleteCourse({
          courseKey
        });
        setProject(nextProject);
        selectFirstPath(nextProject);
        state.view = "courses";
      } else if (actionKey === "create-module") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        nextProject = structuralEditor.createModule({
          courseKey,
          title: "Novo módulo"
        });

        setProject(nextProject);
        const course = findCourse(nextProject, courseKey);
        const moduleValue = course.modules[course.modules.length - 1];

        applySelection(buildNodeSelection({ courseKey: course.id, moduleKey: moduleValue.id }));
        state.view = "course";
      } else if (actionKey === "delete-module") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        resetModuleProgress(state.entityEditor.courseKey || state.selection.courseKey, state.entityEditor.moduleKey);
        nextProject = structuralEditor.deleteModule({
          courseKey,
          moduleKey: state.entityEditor.moduleKey
        });

        setProject(nextProject);
        applySelection(buildNodeSelection({ courseKey }));
        state.view = "course";
      } else if (actionKey === "create-lesson") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey;
        nextProject = structuralEditor.createLesson({
          courseKey,
          moduleKey,
          title: "Nova lição"
        });

        setProject(nextProject);
        const moduleValue = findModule(nextProject, courseKey, moduleKey);
        const lesson = moduleValue.lessons[moduleValue.lessons.length - 1];

        applySelection(
          buildNodeSelection({
            courseKey,
            moduleKey: moduleValue.id,
            lessonKey: lesson.id
          })
        );
        state.view = "module";
      } else if (actionKey === "delete-lesson") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey;
        resetLessonProgress(
          courseKey,
          moduleKey,
          state.entityEditor.lessonKey
        );
        nextProject = structuralEditor.deleteLesson({
          courseKey,
          moduleKey,
          lessonKey: state.entityEditor.lessonKey
        });

        setProject(nextProject);
        applySelection(buildNodeSelection({ courseKey, moduleKey }));
        state.view = "module";
      } else if (actionKey === "create-microsequence") {
        nextProject = editor.createMicrosequence({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          title: "Nova microssequência",
          status: "planned"
        });

        setProject(nextProject);
        const lesson = findLesson(
          nextProject,
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey,
          state.entityEditor.lessonKey
        );
        const microsequence = lesson.microsequences[lesson.microsequences.length - 1];
        applySelection(
          buildNodeSelection({
            courseKey: state.entityEditor.courseKey || state.selection.courseKey,
            moduleKey: state.entityEditor.moduleKey,
            lessonKey: lesson.id,
            microsequenceKey: microsequence.id
          })
        );
        state.view = "lesson";
      } else if (actionKey === "delete-microsequence") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey;
        const lessonKey = state.entityEditor.lessonKey;
        nextProject = editor.deleteMicrosequence({
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey: state.entityEditor.microsequenceKey
        });

        setProject(nextProject);
        applySelection(buildNodeSelection({ courseKey, moduleKey, lessonKey }));
        state.view = "lesson";
      } else if (actionKey === "create-card") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey || state.selection.moduleKey;
        const lessonKey = state.entityEditor.lessonKey || state.selection.lessonKey;
        const microsequenceKey = state.entityEditor.microsequenceKey || state.selection.microsequenceKey;
        const position = getActiveMicrosequenceCards({
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey
        }).length;
        createCardAtPosition(position, "paragraph", {
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey
        });
        state.view = "microsequence";
      }

      state.entityEditor = null;
      render({ preserveState: false });
    } catch {
      // Mantém a UI operacional se a ação estrutural falhar por estado transitório.
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

    render({ preserveState: true });
  }

  function updateEntityDraft(payload) {
    if (!state.entityEditor) return;

    try {
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
      } else if (state.entityEditor.kind === "lesson-source-guide") {
        const nextGuide = resolveGuidePayload(payload, { level: GUIDE_LEVELS.LESSON });
        nextProject = structuralEditor.updateLesson({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          guide: nextGuide.guide
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

      if (nextProject) {
        setProject(nextProject);
      }
    } catch {
      // Evita quebrar a digitação durante estados transitórios inválidos.
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
    const raw = String(node.textContent || "").replace(/\u2007/g, "");
    // Lacunas textuais sao tokens inline; evita quebras de linha e espacos acidentais.
    return raw.replace(/\s+/g, " ").trim();
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

  function parseTextGapParts(text) {
    return parseTextGapRenderableParts(text).filter((part) => part.kind === "blank");
  }

  function getTextGapAnswersForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }

    if (block.kind === "complete") {
      return extractTextGapAnswers(block.text);
    }
    if (block.kind === "paragraph" || block.kind === "editor") {
      return extractTextGapAnswers(block.value);
    }
    if (block.kind === "code") {
      return extractTextGapAnswers(block.code);
    }
    if (block.kind === "table") {
      const answers = [];
      (Array.isArray(block.rows) ? block.rows : []).forEach((row) => {
        (Array.isArray(row) ? row : []).forEach((cell) => {
          answers.push(...extractTextGapAnswers(cell?.value || ""));
        });
      });
      return answers;
    }
    if (block.kind === "plane") {
      return extractTextGapAnswers(block.resultText);
    }
    if (block.kind === "matrix") {
      const answers = [];
      getMatrixTextGapItems(block).forEach((matrixItem) => {
        (Array.isArray(matrixItem?.values) ? matrixItem.values : []).forEach((row) => {
          (Array.isArray(row) ? row : []).forEach((cell) => {
            answers.push(...extractTextGapAnswers(cell?.value || ""));
          });
        });
      });
      return answers;
    }

    return [];
  }

  function blockUsesTextGapExercise(block) {
    return getTextGapAnswersForBlock(block).length > 0;
  }

  function getMatrixTextGapItems(block) {
    return Array.isArray(block?.sequence) && block.sequence.length ? block.sequence : [block];
  }

  function appendTextGapBlankParts(parts, source) {
    parseTextGapParts(source).forEach((part) => {
      if (part.kind === "blank") {
        parts.push({ ...part, index: parts.length });
      }
    });
  }

  function listTextGapPartsForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }

    if (block.kind === "complete") {
      const parts = [];
      appendTextGapBlankParts(parts, block.text);
      return parts;
    }
    if (block.kind === "paragraph" || block.kind === "editor") {
      const parts = [];
      appendTextGapBlankParts(parts, block.value);
      return parts;
    }
    if (block.kind === "code") {
      const parts = [];
      appendTextGapBlankParts(parts, block.code);
      return parts;
    }
    if (block.kind === "table") {
      const parts = [];
      (Array.isArray(block.rows) ? block.rows : []).forEach((row) => {
        (Array.isArray(row) ? row : []).forEach((cell) => {
          appendTextGapBlankParts(parts, cell?.value || "");
        });
      });
      return parts;
    }
    if (block.kind === "plane") {
      const parts = [];
      appendTextGapBlankParts(parts, block.resultText);
      return parts;
    }
    if (block.kind === "matrix") {
      const parts = [];
      getMatrixTextGapItems(block).forEach((matrixItem) => {
        (Array.isArray(matrixItem?.values) ? matrixItem.values : []).forEach((row) => {
          (Array.isArray(row) ? row : []).forEach((cell) => {
            appendTextGapBlankParts(parts, cell?.value || "");
          });
        });
      });
      return parts;
    }

    return [];
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
    if (!getCurrentChoiceEntry(blockKey)) {
      return;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.choiceExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
    const selected = new Set(Array.isArray(exercise.selected) ? exercise.selected : []);
    const normalizedOptionId = String(optionId || "").trim();
    if (!normalizedOptionId) {
      return;
    }

    if (checked) {
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

    const correct = getCorrectExerciseOptionIds(entry.block?.options, entry.block?.answer);

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
    const correct = new Set(getCorrectExerciseOptionIds(options, entry.block?.answer));

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
    recordCurrentCardAttempt(ok ? "correct" : "wrong");
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
    if (rerender || hadFeedback) {
      render({ preserveState: true });
    }
  }

  function openTextGapChoicePrompt(blockKey, blankIndex) {
    ensureCurrentCompleteExerciseState();
    const currentExercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const currentValues = Array.isArray(currentExercise.values) ? currentExercise.values : [];
    const index = Number.parseInt(String(blankIndex), 10);
    const currentValue = index >= 0 ? String(currentValues[index] ?? "").trim() : "";
    if (currentExercise.feedback) {
      state.completeExerciseByBlockKey[blockKey] = {
        values: currentValues.slice(),
        feedback: null
      };
    }
    if (currentValue) {
      setCompleteBlank(blockKey, blankIndex, "", { rerender: false });
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

    const answers = getTextGapAnswersForBlock(entry.block);

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
    const answers = getTextGapAnswersForBlock(entry.block);

    if (!answers.length) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "correct" };
      render({ preserveState: true });
      return "correct";
    }

    const normalizedValues = answers.map((_, idx) => String(values[idx] ?? "").trim().toLowerCase());
    const normalizedAnswers = answers.map((item) => String(item ?? "").trim().toLowerCase());

    if (normalizedValues.some((value) => !value)) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Preencha todas as lacunas.");
      focusFirstIncompleteTextGap(blockKey);
      render({ preserveState: true });
      return "incomplete";
    }

    const ok = normalizedValues.every((value, idx) => value === normalizedAnswers[idx]);
    state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    recordCurrentCardAttempt(ok ? "correct" : "wrong");
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
    } else {
      recordCurrentCardAttempt(result.status);
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
    const dependencies = [];
    dependencies.push(...collectAssistRefs(course, moduleValue, lesson, microsequence));
    return { course, moduleValue, lesson, microsequence, cards, card, dependencies };
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

  function syncPendingStructureFocus() {
    const target = state.pendingStructureFocus;
    if (!target || target.view !== state.view) {
      return;
    }

    let selector = "";
    if (target.view === "lesson" && target.microsequenceKey) {
      selector =
        '[data-structure-target="microsequence"][data-course-key="' +
        target.courseKey +
        '"][data-module-key="' +
        target.moduleKey +
        '"][data-lesson-key="' +
        target.lessonKey +
        '"][data-microsequence-key="' +
        target.microsequenceKey +
        '"]';
    } else if (target.view === "course" && target.moduleKey) {
      selector =
        '[data-structure-target="module"][data-course-key="' +
        target.courseKey +
        '"][data-module-key="' +
        target.moduleKey +
        '"]';
    } else if (target.view === "courses" && target.courseKey) {
      selector = '[data-structure-target="course"][data-course-key="' + target.courseKey + '"]';
    }

    if (!selector) {
      state.pendingStructureFocus = null;
      return;
    }

    const node = root.querySelector(selector);
    if (!node) {
      return;
    }

    state.pendingStructureFocus = null;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
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

  function setAssistWorkbenchPane(pane) {
    state.assistDraft.activeWorkbenchPane = pane === "edit" ? "edit" : "preview";
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
    const currentCardRuntimeOptions = ensureCurrentCardRuntimeOptions();
    const assistCatalog = getAssistCatalog();
    const assistModeConfig = getAssistModeOptions();
    const coursePermissionsById = Object.fromEntries(
      (state.project.courses || []).map((course) => [
        course.id,
        resolveCourseUiPermissions(storage, course.id)
      ])
    );
    const currentCoursePermissions = context.course
      ? coursePermissionsById[context.course.id] || resolveCourseUiPermissions(storage, context.course.id)
      : { role: "owner", canEdit: true, canDelete: true };
    const readOnlyView = state.view !== "courses" && Boolean(context.course) && !currentCoursePermissions.canEdit;
    const readOnlySubtitle = readOnlyView
      ? "Disponível somente para estudo nesta conta."
      : "";
    const entityEditorModel = buildEntityEditorModel({
      ...state,
      coursePermissions: currentCoursePermissions,
      coursePermissionsById
    });
    const nextPlannedMicrosequence = findNextPlannedMicrosequenceInLesson(context.lesson, context.microsequence?.id);
    const assistActionOptions = getAssistActionIntentOptions({
      microsequence: context.microsequence,
      hasNextPlannedMicrosequence: Boolean(nextPlannedMicrosequence)
    });
    const assistPromptMetadata = getAssistPromptMetadata({
      microsequence: context.microsequence,
      actionIntent: state.assistDraft.actionIntent,
      hasNextPlannedMicrosequence: Boolean(nextPlannedMicrosequence)
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
          studyPaths: storage.loadStudyPaths?.() || [],
          readOnlyView,
          readOnlySubtitle,
          progress: storage.loadProgress(),
          refs: assistCatalog,
          selectedRefIds: state.assistDraft.selectedRefIds,
          pendingRefId: state.assistDraft.pendingRefId,
          assistModeOptions: assistModeConfig.options,
          selectedAssistMode: state.assistDraft.selectedMode,
          activeWorkbenchPane: state.assistDraft.activeWorkbenchPane,
          assistModeLocked: assistModeConfig.locked,
          preferredContainer: state.assistDraft.preferredContainer,
          preferredContainerConfirmed: state.assistDraft.preferredContainerConfirmed,
          preferredContainerLabel: getAssistContainerLabel(state.assistDraft.preferredContainer),
          containerOptions: ASSIST_CARD_CONTAINER_OPTIONS,
          assistActionOptions,
          selectedAssistAction: state.assistDraft.actionIntent,
          assistPromptLabel: assistPromptMetadata.promptLabel,
          assistSubmitLabel: assistPromptMetadata.submitLabel,
          assistPromptPlaceholder: assistPromptMetadata.promptPlaceholder,
          assistRequestReady: canSubmitAssistRequestFromState({
            promptText: state.assistDraft.promptText,
            actionIntent: state.assistDraft.actionIntent,
            attachmentCount: state.assistDraft.attachments.length,
            isSubmitting: state.assistDraft.isSubmitting,
            allowPromptlessSubmit: canGeneratePlannedCurrentWithoutPrompt(context.microsequence)
          }),
          interventionTargetMode: state.assistDraft.interventionTargetMode,
          operationMode: state.assistDraft.operationMode,
          nextPlannedMicrosequence,
          attachments: state.assistDraft.attachments.map((item) => ({
            name: normalizeAssistAttachmentName(item?.name),
            size: Number(item?.size || 0),
            type: String(item?.type || "").trim()
          })),
          selectedModel: state.assistConfig.model,
          selectedModelLabel: getAssistModelLabel(state.assistConfig.model),
          apiKey: state.assistConfig.apiKey,
          modelOptions: ASSIST_MODEL_OPTIONS,
          generationDraft: {
            ...state.generationDraft,
            attachments: state.generationDraft.attachments.map((item) => ({
              name: normalizeAssistAttachmentName(item?.name),
              size: Number(item?.size || 0),
              type: String(item?.type || "").trim()
            }))
          },
          generationUiState: getGenerationScopeState(),
          promptText: state.assistDraft.promptText,
          feedbackSession: state.assistDraft.interventionSession,
          feedbackDraftText: state.assistDraft.feedbackDraftText,
          feedbackEditing: state.assistDraft.feedbackEditing,
          feedbackRequestReady:
            interventionSessionNeedsIteration(state.assistDraft.interventionSession) &&
            !state.assistDraft.isSubmitting,
          feedbackSubmitLabel: getFeedbackSubmitLabel(state.assistDraft.interventionSession),
          isSubmitting: state.assistDraft.isSubmitting,
          hasApiKey: Boolean(state.assistConfig.apiKey),
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
            value: state.cardCommentDraft,
            error: state.cardCommentError,
            saving: state.cardCommentSaving
          })
        : "") +
      (state.assistConfigOpen && !state.generationPanelOpen && !readOnlyView
        ? renderAssistConfigOverlay({
            didacticProfileId: state.assistConfigDraft.selectedProfileId || state.assistConfigDraft.didacticProfileId,
            profileTuning: state.assistConfigDraft.profileTuning,
            didacticProfileOptions: buildDidacticProfileOptions(state.assistConfigDraft.customProfiles),
            profileEditor: getAssistProfileEditorViewModel(state.assistConfigDraft),
            planningInferencePending: state.assistPlanningInferencePending,
            planningInferenceMessage: state.assistPlanningInferenceMessage
          })
        : "") +
      (state.providerConfigOpen && !readOnlyView
        ? renderProviderConfigOverlay({
            selectedModel: state.assistConfig.model,
            selectedModelLabel: getAssistModelLabel(state.assistConfig.model),
            apiKey: state.assistConfig.apiKey,
            baseUrl: state.assistConfig.baseUrl || "",
            codexEndpoint: state.assistConfig.codexEndpoint || DEFAULT_CODEX_LOCAL_ENDPOINT,
            codexToken: state.assistConfig.codexToken || "",
            codexStatus: state.codexCliSetupStatus
          })
        : "") +
      (state.pendingExternalImport
        ? renderExternalImportOverlay({
            sourceName: state.pendingExternalImport.sourceName,
            detectedFormat: state.pendingExternalImport.detectedFormat === "contract" ? "Projeto AraLearn" : "",
            error: state.pendingExternalImport.error
          })
        : "") +
      (state.generationPanelOpen && !readOnlyView
        ? renderGenerationPanelOverlay({
            project: state.project,
            editorSupport: {
              coursePermissionsById,
              generationDraft: {
                ...state.generationDraft,
                attachments: state.generationDraft.attachments.map((item) => ({
                  name: normalizeAssistAttachmentName(item?.name),
                  size: Number(item?.size || 0),
                  type: String(item?.type || "").trim()
                }))
              },
              generationUiState: getGenerationScopeState(),
              selectedModel: state.assistConfig.model,
              modelOptions: ASSIST_MODEL_OPTIONS,
              localProviderStatus: state.codexCliSetupStatus,
              assistConfigExpanded: state.assistConfigOpen === true,
              didacticProfileId: state.assistConfigDraft.selectedProfileId || state.assistConfigDraft.didacticProfileId,
              profileTuning: state.assistConfigDraft.profileTuning,
              didacticProfileOptions: buildDidacticProfileOptions(state.assistConfigDraft.customProfiles),
              profileEditor: getAssistProfileEditorViewModel(state.assistConfigDraft),
              planningInferencePending: state.assistPlanningInferencePending,
              planningInferenceMessage: state.assistPlanningInferenceMessage
            }
          })
        : "") +
      (entityEditorModel
        ? entityEditorModel.variant === "action-menu"
          ? renderActionMenuOverlay(entityEditorModel)
          : renderEntityEditorOverlay(entityEditorModel)
        : "") +
      "</div>";

    if (renderState) {
      restoreRenderState(root, renderState, { restoreFocus: preserveFocus });
    }

    root
      .querySelectorAll(
        "[data-action='open-generation-panel-global'], [data-action='open-generation-panel-course'], [data-action='open-generation-panel-module'], [data-action='open-generation-panel-lesson']"
      )
      .forEach((node) => bindGenerationPanelTrigger(node));

    syncCardStripScroller({ keepActiveCardInView: true });
    syncPendingExerciseFocus();

    root.querySelector("[data-action='go-back']")?.addEventListener("click", () => goBack());
    root.querySelectorAll("[data-action='future-sync']").forEach((node) => {
      node.addEventListener("click", () => {
        root.dispatchEvent(new CustomEvent("aralearn:open-library", { bubbles: true }));
      });
    });

    root.querySelectorAll("[data-action='close-generation-panel']").forEach((node) => {
      node.addEventListener("click", () => closeGenerationPanel());
    });
    root.querySelectorAll("[data-action='dismiss-generation-panel']").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target === node) {
          closeGenerationPanel();
        }
      });
    });
    root.querySelectorAll("[data-action='clear-generation-scope']").forEach((node) => {
      node.addEventListener("click", () => {
        clearGenerationScope();
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='quick-create-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const nextProject = structuralEditor.createCourse({ title: "Novo curso" });

        setProject(nextProject);
        const course = nextProject.courses[nextProject.courses.length - 1];
        applySelection(buildNodeSelection({ courseKey: course?.id || null }));
        state.view = "courses";

        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='quick-create-module']").forEach((node) => {
      node.addEventListener("click", () => {
        if (!state.selection.courseKey) return;
        const nextProject = structuralEditor.createModule({ courseKey: state.selection.courseKey, title: "Novo módulo" });

        setProject(nextProject);
        const course = findCourse(nextProject, state.selection.courseKey);
        const moduleValue = course?.modules?.[course.modules.length - 1] || null;
        applySelection(buildNodeSelection({ courseKey: course?.id || null, moduleKey: moduleValue?.id || null }));
        state.view = "course";

        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='quick-create-lesson']").forEach((node) => {
      node.addEventListener("click", () => {
        if (!state.selection.courseKey || !state.selection.moduleKey) return;
        const nextProject = structuralEditor.createLesson({
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          title: "Nova lição"
        });

        setProject(nextProject);
        const moduleValue = findModule(nextProject, state.selection.courseKey, state.selection.moduleKey);
        const lesson = moduleValue?.lessons?.[moduleValue.lessons.length - 1] || null;
        applySelection(
          buildNodeSelection({
            courseKey: state.selection.courseKey,
            moduleKey: state.selection.moduleKey,
            lessonKey: lesson?.id || null
          })
        );
        state.view = "module";

        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='quick-create-microsequence']").forEach((node) => {
      node.addEventListener("click", () => {
        if (!state.selection.courseKey || !state.selection.moduleKey || !state.selection.lessonKey) return;
        const nextProject = editor.createMicrosequence({
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          title: "Nova microssequência",
          status: "planned"
        });

        setProject(nextProject);
        const lesson = findLesson(nextProject, state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey);
        const microsequence = lesson?.microsequences?.[lesson.microsequences.length - 1] || null;
        applySelection(
          buildNodeSelection({
            courseKey: state.selection.courseKey,
            moduleKey: state.selection.moduleKey,
            lessonKey: state.selection.lessonKey,
            microsequenceKey: microsequence?.id || null
          })
        );
        state.view = "lesson";

        render({ preserveState: false });
      });
    });

    root.querySelector("[data-field='generate-course-input']")?.addEventListener("input", (event) => {
      setGenerationInput("course", event.target.value, { rerender: false });
    });
    root.querySelector("[data-field='generate-course-input']")?.addEventListener("change", (event) => {
      setGenerationInput("course", event.target.value);
    });
    root.querySelector("[data-field='generate-module-input']")?.addEventListener("input", (event) => {
      setGenerationInput("module", event.target.value, { rerender: false });
    });
    root.querySelector("[data-field='generate-module-input']")?.addEventListener("change", (event) => {
      setGenerationInput("module", event.target.value);
    });
    root.querySelector("[data-field='generate-lesson-input']")?.addEventListener("input", (event) => {
      setGenerationInput("lesson", event.target.value, { rerender: false });
    });
    root.querySelector("[data-field='generate-lesson-input']")?.addEventListener("change", (event) => {
      setGenerationInput("lesson", event.target.value);
    });
    root.querySelector("[data-field='generate-include-topic']")?.addEventListener("input", (event) => {
      state.generationDraft.pendingIncludeTopic = event.target.value;
    });
    root.querySelector("[data-field='generate-exclude-topic']")?.addEventListener("input", (event) => {
      state.generationDraft.pendingExcludeTopic = event.target.value;
    });
    root.querySelector("[data-field='generate-include-topic']")?.addEventListener("paste", (event) => {
      const pastedText = event.clipboardData?.getData("text") || "";
      if (splitGenerationTopics(pastedText).length <= 1) {
        return;
      }
      event.preventDefault();
      if (!commitGenerationTopics("include", pastedText)) {
        return;
      }
      state.generationDraft.pendingIncludeTopic = "";
      clearGenerationResult();
      render({ preserveState: true });
    });
    root.querySelector("[data-field='generate-exclude-topic']")?.addEventListener("paste", (event) => {
      const pastedText = event.clipboardData?.getData("text") || "";
      if (splitGenerationTopics(pastedText).length <= 1) {
        return;
      }
      event.preventDefault();
      if (!commitGenerationTopics("exclude", pastedText)) {
        return;
      }
      state.generationDraft.pendingExcludeTopic = "";
      clearGenerationResult();
      render({ preserveState: true });
    });
    root.querySelector("[data-field='generate-prompt']")?.addEventListener("input", (event) => {
      state.generationDraft.promptText = event.target.value;
      const hadVisibleFeedback =
        Boolean(state.generationDraft.errorMessage) ||
        Boolean(state.generationDraft.lastResult) ||
        state.generationDraft.isSubmitting === true ||
        state.generationDraft.progress?.visible === true;
      clearGenerationResult();
      if (hadVisibleFeedback) {
        render({ preserveState: true });
      }
    });
    root.querySelector("[data-field='generate-attachments']")?.addEventListener("change", (event) => {
      const nextFiles = Array.from(event.target.files || []);
      state.generationDraft.attachments = normalizeAssistAttachmentList([
        ...state.generationDraft.attachments,
        ...nextFiles
      ]);
      event.target.value = "";
      clearGenerationResult();
      render({ preserveState: true });
    });
    root.querySelectorAll("[data-action='remove-generation-attachment']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-attachment-index"));
        if (!Number.isInteger(index) || index < 0) return;
        state.generationDraft.attachments = state.generationDraft.attachments.filter((_, itemIndex) => itemIndex !== index);
        clearGenerationResult();
        render({ preserveState: true });
      });
    });
    root.querySelector("[data-action='add-generate-include-topic']")?.addEventListener("click", () => {
      addGenerationTopic("include");
    });
    root.querySelector("[data-action='add-generate-exclude-topic']")?.addEventListener("click", () => {
      addGenerationTopic("exclude");
    });
    root.querySelectorAll("[data-action='remove-generate-include-topic']").forEach((node) => {
      node.addEventListener("click", () => {
        removeGenerationTopic("include", node.getAttribute("data-topic") || "");
      });
    });
    root.querySelectorAll("[data-action='remove-generate-exclude-topic']").forEach((node) => {
      node.addEventListener("click", () => {
        removeGenerationTopic("exclude", node.getAttribute("data-topic") || "");
      });
    });
    root.querySelectorAll("[data-action='select-existing-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const title = node.getAttribute("data-course-title");
        if (!title) return;
        setGenerationInput("course", title);
      });
    });
    root.querySelectorAll("[data-action='select-existing-module']").forEach((node) => {
      node.addEventListener("click", () => {
        const title = node.getAttribute("data-module-title");
        if (!title) return;
        setGenerationInput("module", title);
      });
    });
    root.querySelectorAll("[data-action='select-existing-lesson']").forEach((node) => {
      node.addEventListener("click", () => {
        const title = node.getAttribute("data-lesson-title");
        if (!title) return;
        setGenerationInput("lesson", title);
      });
    });
    root.querySelector("[data-action='generate-structure']")?.addEventListener("click", () => {
      void submitGenerateStructureRequest();
    });
    root.querySelector("[data-action='view-generated-lesson']")?.addEventListener("click", () => {
      openGeneratedLesson();
    });

    root.querySelectorAll("[data-action='open-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key");
        if (!courseKey) return;
        openCourse(courseKey);
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
    root.querySelectorAll("[data-action='open-microsequence']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        if (!microsequenceKey) return;
        openEntityEditor("microsequence-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          microsequenceKey
        });
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
    root.querySelectorAll("[data-action='select-workbench-pane']").forEach((node) => {
      node.addEventListener("click", () => {
        setAssistWorkbenchPane(node.getAttribute("data-workbench-pane"));
      });
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

    root.querySelectorAll("[data-action='open-home-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("home-actions");
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
        const axis = getStructureAxis(target.level);
        const point = axis === "x" ? event.clientX : event.clientY;
        const position = getStructureDropPositionForAxis(node, point, axis);
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
        const axis = getStructureAxis(target.level);
        const point = axis === "x" ? event.clientX : event.clientY;
        const position = state.structureDrop?.position || getStructureDropPositionForAxis(node, point, axis);
        applyStructureReorder(state.structureDrag, target, position);
      });
    });
    root.querySelectorAll("[data-structure-collection]").forEach((node) => {
      node.addEventListener("dragover", (event) => {
        const resolved = resolveCollectionDropState(node, state.structureDrag, event.clientX, event.clientY);
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
        const resolved = resolveCollectionDropState(node, state.structureDrag, event.clientX, event.clientY);
        if (!resolved) {
          return;
        }

        event.preventDefault();
        applyStructureReorder(state.structureDrag, resolved.target, resolved.position);
      });
    });
    root.querySelectorAll("[data-action='open-course-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        if (!courseKey) return;
        openEntityEditor("course-actions", { courseKey });
      });
    });
    root.querySelectorAll("[data-action='open-course-screen-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("course-screen-actions", { courseKey: state.selection.courseKey });
      });
    });
    root.querySelectorAll("[data-action='open-module-screen-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("module-screen-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey
        });
      });
    });
    root.querySelectorAll("[data-action='open-lesson-screen-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("lesson-screen-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey
        });
      });
    });
    root.querySelectorAll("[data-action='edit-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        if (!courseKey) return;
        openEntityEditor("course", { courseKey });
      });
    });
    root.querySelectorAll("[data-action='open-module-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key");
        if (!courseKey || !moduleKey) return;
        openEntityEditor("module-actions", { courseKey, moduleKey });
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
    root.querySelectorAll("[data-action='open-lesson-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key") || state.selection.moduleKey;
        const lessonKey = node.getAttribute("data-lesson-key") || state.selection.lessonKey;
        if (!courseKey || !moduleKey || !lessonKey) return;
        openEntityEditor("lesson-actions", { courseKey, moduleKey, lessonKey });
      });
    });
    root.querySelectorAll("[data-action='open-lesson-source-guide']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key") || state.selection.moduleKey;
        const lessonKey = node.getAttribute("data-lesson-key") || state.selection.lessonKey;
        if (!courseKey || !moduleKey || !lessonKey) return;
        openEntityEditor("lesson-source-guide", { courseKey, moduleKey, lessonKey });
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
    root.querySelectorAll("[data-action='open-microsequence-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key") || state.selection.microsequenceKey;
        if (!microsequenceKey) return;
        openEntityEditor("microsequence-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          microsequenceKey
        });
      });
    });
    root.querySelector("[data-action='entity-editor-close']")?.addEventListener("click", () => closeEntityEditor());
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
        if (state.pendingExternalImport) {
          clearPendingExternalImport();
          return;
        }
        if (state.entityEditor) {
          closeEntityEditor();
        }
      });
    });
    root.querySelectorAll("[data-action='dismiss-action-menu']").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target === node) {
          closeEntityEditor();
        }
      });
    });
    root.querySelectorAll("[data-action='run-entity-action']").forEach((node) => {
      node.addEventListener("click", () => {
        const actionKey = node.getAttribute("data-entity-action");
        if (!actionKey) return;
        runEntityAction(actionKey);
      });
    });
    root.querySelector("[data-action='comment-close']")?.addEventListener("click", () => closeCardComment());
    root.querySelector("[data-action='comment-save']")?.addEventListener("click", () => void saveCardComment());
    const cardCommentInput = root.querySelector("[data-field='card-comment']");
    const assistMicrosequenceTitleInput = root.querySelector("[data-field='assist-microsequence-title']");
    if (cardCommentInput) {
      cardCommentInput.value = state.cardCommentDraft;
      cardCommentInput.addEventListener("input", () => {
        state.cardCommentDraft = cardCommentInput.value;
      });
    }
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
      if (handleGenerationPanelActionClick(event)) {
        return;
      }
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

    const assistMode = root.querySelector("[data-field='assist-mode']");
    const assistModelInputs = root.querySelectorAll("[data-field='assist-model'], [data-field='assist-feedback-model']");
    const assistApiKey = root.querySelector("[data-field='assist-api-key']");
    const providerConfigBaseUrl = root.querySelector("[data-field='provider-config-base-url']");
    const providerConfigCodexEndpoint = root.querySelector("[data-field='provider-config-codex-endpoint']");
    const providerConfigCodexToken = root.querySelector("[data-field='provider-config-codex-token']");
    const assistActionIntentInputs = root.querySelectorAll("[data-field='assist-action-intent']");
    const assistPreferredContainer = root.querySelector("[data-field='assist-preferred-container']");
    const assistRefPicker = root.querySelector("[data-field='assist-ref-picker']");
    const assistPrompt = root.querySelector("[data-field='assist-prompt']");
    const assistFeedback = root.querySelector("[data-field='assist-feedback']");
    const assistAttachmentInput = root.querySelector("[data-field='assist-attachments']");
    const assistSubmitButton = root.querySelector("[data-action='apply-assist']");
    const assistFeedbackSubmitButton = root.querySelector("[data-action='apply-assist-feedback']");
    const syncAssistSubmitState = () => {
      if (!assistSubmitButton) {
        if (!assistFeedbackSubmitButton) {
          return;
        }
      }
      const visiblePromptValue =
        assistPrompt instanceof HTMLTextAreaElement
          ? assistPrompt.value
          : state.assistDraft.promptText || "";
      const canEditCurrentView = state.view === "microsequence";
      const canSubmitAssist = canEditCurrentView && canSubmitAssistRequestFromState({
        promptText: visiblePromptValue,
        actionIntent: state.assistDraft.actionIntent,
        attachmentCount: state.assistDraft.attachments.length,
        isSubmitting: state.assistDraft.isSubmitting,
        allowPromptlessSubmit: canGeneratePlannedCurrentWithoutPrompt(getRenderContext().microsequence)
      });
      if (assistSubmitButton) {
        assistSubmitButton.disabled = !canSubmitAssist;
        assistSubmitButton.setAttribute("aria-disabled", canSubmitAssist ? "false" : "true");
      }
      if (assistFeedbackSubmitButton) {
        const canIterate = interventionSessionNeedsIteration(state.assistDraft.interventionSession) && !state.assistDraft.isSubmitting;
        assistFeedbackSubmitButton.disabled = !canIterate;
        assistFeedbackSubmitButton.setAttribute("aria-disabled", canIterate ? "false" : "true");
      }
    };
    if (assistMode) {
      assistMode.addEventListener("change", () => {
        state.assistDraft.selectedMode = assistMode.value;
        render({ preserveState: true });
      });
    }
    if (assistRefPicker) {
      assistRefPicker.addEventListener("change", () => {
        state.assistDraft.pendingRefId = assistRefPicker.value;
      });
    }
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
    assistActionIntentInputs.forEach((node) => {
      node.addEventListener("change", () => {
        if (!(node instanceof HTMLInputElement) || !node.checked) {
          return;
        }
        applyAssistActionIntent(node.value, getRenderContext().microsequence);
        render({ preserveState: true });
      });
    });
    if (assistPreferredContainer) {
      assistPreferredContainer.addEventListener("change", () => {
        const nextContainer = assistPreferredContainer.value;
        const isKnownContainer = ASSIST_CARD_CONTAINER_OPTIONS.some((item) => item.value === nextContainer);
        state.assistDraft.preferredContainer = isKnownContainer ? nextContainer : "";
        state.assistDraft.preferredContainerConfirmed = isKnownContainer;
        render({ preserveState: true });
      });
    }
    if (assistPrompt) {
      assistPrompt.addEventListener("input", () => {
        state.assistDraft.promptText = assistPrompt.value;
        syncAssistSubmitState();
      });
    }
    if (assistFeedback instanceof HTMLTextAreaElement) {
      assistFeedback.addEventListener("input", () => {
        state.assistDraft.feedbackDraftText = assistFeedback.value;
      });
    }
    if (assistAttachmentInput) {
      assistAttachmentInput.addEventListener("change", () => {
        const nextFiles = Array.from(assistAttachmentInput.files || []);
        state.assistDraft.attachments = normalizeAssistAttachmentList([
          ...state.assistDraft.attachments,
          ...nextFiles
        ]);
        assistAttachmentInput.value = "";
        render({ preserveState: true });
      });
    }
    root.querySelectorAll("[data-action='remove-ref']").forEach((node) => {
      node.addEventListener("click", () => {
        const refId = node.getAttribute("data-ref-id");
        if (!refId) return;
        state.assistDraft.selectedRefIds = state.assistDraft.selectedRefIds.filter((item) => item !== refId);
        syncAssistDraft();
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='remove-assist-attachment']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-attachment-index"));
        if (!Number.isInteger(index) || index < 0) return;
        state.assistDraft.attachments = state.assistDraft.attachments.filter((_, itemIndex) => itemIndex !== index);
        render({ preserveState: true });
      });
    });
    root.querySelector("[data-action='add-ref']")?.addEventListener("click", () => {
      const refId = state.assistDraft.pendingRefId;
      if (!refId) return;
      const current = new Set(state.assistDraft.selectedRefIds);
      if (current.size >= MAX_ASSIST_REFS || current.has(refId)) return;
      current.add(refId);
      state.assistDraft.selectedRefIds = Array.from(current).slice(0, MAX_ASSIST_REFS);
      syncAssistDraft();
      render({ preserveState: true });
    });
    root.querySelector("[data-action='clear-prompt']")?.addEventListener("click", () => {
      if (root.querySelector("[data-field='generate-prompt']")) {
        state.generationDraft.promptText = "";
        clearGenerationResult();
      }
      render({ preserveState: true });
    });
    root.querySelector("[data-action='clear-assist-request']")?.addEventListener("click", () => {
      clearAssistRequest();
    });
    root.querySelectorAll("[data-action='open-assist-attachment-picker'], [data-action='open-assist-feedback-attachment-picker']").forEach((node) => {
      node.addEventListener("click", () => {
        root.querySelector("[data-field='assist-attachments']")?.click();
      });
    });
    root.querySelector("[data-action='open-generation-attachment-picker']")?.addEventListener("click", () => {
      root.querySelector("[data-field='generate-attachments']")?.click();
    });
    root.querySelector("[data-action='open-provider-config']")?.addEventListener("click", () => {
      openProviderConfig();
    });
    root.querySelectorAll("[data-action='open-assist-config'], [data-action='open-assist-feedback-config']").forEach((node) => {
      node.addEventListener("click", () => {
        if (state.generationPanelOpen) {
          if (state.assistConfigOpen) {
            closeAssistConfig();
          } else {
            openAssistConfig();
          }
          return;
        }
        openProviderConfig();
      });
    });
    root.querySelector("[data-action='apply-assist']")?.addEventListener("click", () => {
      void submitAssistRequest();
    });
    root.querySelector("[data-action='toggle-feedback-edit']")?.addEventListener("click", () => {
      toggleAssistFeedbackEditing();
    });
    root.querySelector("[data-action='apply-assist-feedback']")?.addEventListener("click", () => {
      submitAssistFeedbackIteration();
    });
    root.querySelector("[data-action='assist-config-close']")?.addEventListener("click", () => closeAssistConfig());
    root.querySelector("[data-action='provider-config-close']")?.addEventListener("click", () => closeProviderConfig());
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
    root.querySelector("[data-action='assist-config-infer-course-model']")?.addEventListener("click", () => {
      void inferAssistPlanningFromRequest();
    });
    root.querySelector("[data-action='cancel-external-import']")?.addEventListener("click", () => clearPendingExternalImport());
    root.querySelector("[data-action='confirm-external-import']")?.addEventListener("click", () => confirmPendingExternalImport());
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
    const assistConfigMinMicrosequences = root.querySelector("[data-field='assist-config-min-microsequences']");
    const assistConfigTargetMicrosequences = root.querySelector("[data-field='assist-config-target-microsequences']");
    const assistConfigMaxMicrosequences = root.querySelector("[data-field='assist-config-max-microsequences']");
    const assistConfigMicrosequenceRangeShell = root.querySelector("[data-field='assist-config-microsequence-range-shell']");
    const assistConfigMinMicrosequencesLabel = root.querySelector("[data-role='assist-config-min-microsequences-label']");
    const assistConfigTargetMicrosequencesLabel = root.querySelector("[data-role='assist-config-target-microsequences-label']");
    const assistConfigMaxMicrosequencesLabel = root.querySelector("[data-role='assist-config-max-microsequences-label']");
    const syncAssistMicrosequenceRange = (patch = {}) => {
      const normalized = normalizeAssistMicrosequenceRange(patch);
      updateAssistProfileTuning(normalized);

      if (assistConfigMinMicrosequences) {
        assistConfigMinMicrosequences.value = String(normalized.minMicrosequences);
      }
      if (assistConfigTargetMicrosequences) {
        assistConfigTargetMicrosequences.value = String(normalized.targetMicrosequences);
      }
      if (assistConfigMaxMicrosequences) {
        assistConfigMaxMicrosequences.value = String(normalized.maxMicrosequences);
      }
      if (assistConfigMinMicrosequencesLabel) {
        assistConfigMinMicrosequencesLabel.textContent = String(normalized.minMicrosequences);
      }
      if (assistConfigTargetMicrosequencesLabel) {
        assistConfigTargetMicrosequencesLabel.textContent = String(normalized.targetMicrosequences);
      }
      if (assistConfigMaxMicrosequencesLabel) {
        assistConfigMaxMicrosequencesLabel.textContent = String(normalized.maxMicrosequences);
      }
      if (assistConfigMicrosequenceRangeShell) {
        const toPercent = (value) => (((value - 1) / 11) * 100).toFixed(2);
        assistConfigMicrosequenceRangeShell.style.setProperty("--assist-range-start", toPercent(normalized.minMicrosequences));
        assistConfigMicrosequenceRangeShell.style.setProperty("--assist-range-target", toPercent(normalized.targetMicrosequences));
        assistConfigMicrosequenceRangeShell.style.setProperty("--assist-range-end", toPercent(normalized.maxMicrosequences));
      }
    };
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
    if (assistConfigMinMicrosequences) {
      assistConfigMinMicrosequences.addEventListener("input", () => {
        syncAssistMicrosequenceRange({ minMicrosequences: assistConfigMinMicrosequences.value });
      });
    }
    if (assistConfigTargetMicrosequences) {
      assistConfigTargetMicrosequences.addEventListener("input", () => {
        syncAssistMicrosequenceRange({ targetMicrosequences: assistConfigTargetMicrosequences.value });
      });
    }
    if (assistConfigMaxMicrosequences) {
      assistConfigMaxMicrosequences.addEventListener("input", () => {
        syncAssistMicrosequenceRange({ maxMicrosequences: assistConfigMaxMicrosequences.value });
      });
    }
    root.querySelectorAll("[data-action='toggle-assist-config-flag']").forEach((node) => {
      node.addEventListener("click", () => {
        const field = node.getAttribute("data-field") || "";
        if (!field) {
          return;
        }
        updateAssistProfileTuning({
          [field]: state.assistConfig.profileTuning?.[field] !== true
        });
        render({ preserveState: true });
      });
    });

    if (entityEditorModel) {
      const fields = {};
      entityEditorModel.fields.forEach((field) => {
        const node = root.querySelector(`[data-field='${field.name}']`);
        if (node) {
          fields[field.name] = node;
        }
      });

      const handler = () => {
        updateEntityDraft(
          Object.fromEntries(
            Object.entries(fields).map(([name, node]) => [name, readEntityFieldValue(node)])
          )
        );
      };

      Object.values(fields).forEach((node) => {
        bindEntityFieldNode(node, handler);
      });

      if (state.entityEditor?.kind === "lesson-source-guide" && fields.presetId instanceof HTMLSelectElement) {
        fields.presetId.addEventListener("change", () => {
          const preset = buildLessonGuidanceFromPreset(fields.presetId.value);
          setEntityFieldValue(fields.resourceTags, preset.resourceTags);
          setEntityFieldValue(fields.contentTypeTags, preset.contentTypeTags);
          setEntityFieldValue(fields.learningActionTags, preset.learningActionTags);
          setEntityFieldValue(fields.supportLevel, preset.supportLevel);
          handler();
        });
      }
    }

    syncPendingStructureFocus();
  }

  syncAssistDraft();
  globalThis.AraLearnAndroidImport = {
    receiveSharedJson(rawText, sourceName) {
      return receiveExternalJsonImport(rawText, { sourceName });
    }
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("resize", () => {
      syncCardStripScroller({ keepActiveCardInView: true });
    });
  }
  root.addEventListener("click", (event) => {
    void handleGenerationPanelActionClick(event);
  });

  render({ preserveState: false });
  globalThis.AndroidHost?.runtimeReady?.();
  return {
    replaceProject(nextProject) {
      setProject(nextProject);
      if (!applySelectionByKeys(nextProject, state.selection)) selectFirstPath(nextProject);
      render({ preserveState: false });
    }
  };
}
