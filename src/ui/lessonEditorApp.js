import { renderLessonScreen } from "./renderLessonScreen.js";
import { renderCardCommentOverlay } from "./renderCardCommentOverlay.js";
import { renderCardVersionOverlay } from "./renderCardVersionOverlay.js";
import { renderEntityEditorOverlay } from "./renderEntityEditorOverlay.js";
import { renderAssistConfigOverlay } from "./renderAssistConfigOverlay.js";
import { captureRenderState, restoreRenderState } from "./renderState.js";
import { getRuntimePopupButtonEntry } from "../render/renderCardRuntime.js";
import { resolveCardRuntime } from "../core/cardRuntime.js";
import { getExerciseOptionStableId } from "../core/exerciseOptions.js";
import {
  createFlowchartExerciseState,
  fillFlowchartExerciseAnswer,
  flowchartProjectionHasPractice,
  resetFlowchartExerciseState,
  validateFlowchartExerciseState
} from "../flowchart/flowchartExercise.js";
import { computeFlowchartAutoFitScale } from "../flowchart/flowchartViewport.js";
import {
  buildCardPathKey,
  collectAssistDependencies,
  collectLessonCards,
  findCard,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  getDefaultDependencyKeys,
  getFirstPath
} from "./lessonEditorPaths.js";
import {
  readAssistConfigStorage,
  readCommentStorage,
  readHistoryStorage,
  writeAssistConfigStorage,
  writeCommentStorage,
  writeHistoryStorage
} from "./lessonEditorStorage.js";
import { runGeminiAssist } from "../llm/geminiAssist.js";

const DRAFT_COURSE_KEY = "__disabled-draft-course__";
const DRAFT_MODULE_KEY = "__disabled-draft-module__";
const DRAFT_LESSON_KEY = "__disabled-draft-lesson__";

const MAX_ASSIST_DEPENDENCIES = 5;
const MAX_CARD_SNAPSHOTS = 6;
const ASSIST_MODEL_OPTIONS = [
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash · até 2026-06-01" }
];
const ASSIST_USER_MODES = {
  GENERATE: "generate-microsequence",
  EDIT_MICROSEQUENCE: "edit-microsequence",
  REPOSITION: "reposition-in-course"
};

function fail(message) {
  throw new Error(message);
}

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readCardText(card) {
  if (!card || typeof card !== "object") {
    return "";
  }

  if (typeof card.text === "string") {
    return card.text;
  }
  if (typeof card.ask === "string") {
    return card.ask;
  }
  if (typeof card.code === "string") {
    return card.code;
  }
  if (Array.isArray(card.columns) && card.columns.length) {
    return card.columns.join(" | ");
  }
  if (Array.isArray(card.flow) && card.flow.length) {
    return card.flow
      .map((step) => {
        const [kind] = Object.keys(step || {});
        return kind ? `${kind}: ${step[kind]}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof card.src === "string") {
    return card.src;
  }

  return "";
}

function parseTagsText(value) {
  return String(value || "")
    .split(/,|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTagsText(tags) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function buildCardUpdateFromText(card, title, text) {
  const base = {
    type: card?.type || "text",
    title: String(title || "").trim() || card?.title || "Novo card"
  };

  if (base.type === "choice") {
    return {
      ...base,
      ask: String(text || "").trim() || card.ask || "Qual alternativa é a mais adequada?",
      answer: Array.isArray(card.answer) && card.answer.length ? card.answer : ["Alternativa correta"],
      wrong: Array.isArray(card.wrong) && card.wrong.length ? card.wrong : ["Distrator 1", "Distrator 2"]
    };
  }

  if (base.type === "complete") {
    return {
      ...base,
      text: String(text || "").trim() || card.text || "Preencha o trecho [[correto]].",
      answer: Array.isArray(card.answer) && card.answer.length ? card.answer : ["correto"],
      wrong: Array.isArray(card.wrong) && card.wrong.length ? card.wrong : ["incorreto", "parcial"]
    };
  }

  if (base.type === "editor") {
    return {
      ...base,
      language: card.language || "text",
      code: String(text || "") || card.code || ""
    };
  }

  if (base.type === "table") {
    return {
      ...base,
      columns: Array.isArray(card.columns) && card.columns.length ? card.columns : ["Coluna A", "Coluna B"],
      rows: Array.isArray(card.rows) && card.rows.length ? card.rows : [["Valor 1", "Valor 2"]]
    };
  }

  if (base.type === "flow") {
    return {
      ...base,
      flow: Array.isArray(card.flow) && card.flow.length ? card.flow : [{ start: "Início" }, { end: "Fim" }]
    };
  }

  if (base.type === "image") {
    return {
      ...base,
      src: card.src || "public/example.png",
      ...(card.alt ? { alt: card.alt } : {})
    };
  }

  return {
    ...base,
    text: String(text || "").trim() || card?.text || "Descreva a ideia central desta microssequência."
  };
}

function ensureDraftCourse(document) {
  return document;
}

function isDraftPlaceholderMicrosequence() {
  return false;
}

function clampFlowchartScale(value) {
  return Math.max(0.45, Math.min(2.4, Number(value || 1)));
}

function makeEntityEditorModel(state) {
  const { project, selection, entityEditor } = state;
  if (!entityEditor) return null;

  if (entityEditor.kind === "course") {
    const course = findCourse(project, entityEditor.courseKey || selection.courseKey);
    if (!course) return null;
    return {
      title: "Curso",
      fields: [
        { name: "title", label: "Título", type: "text", value: course.title || "" },
        { name: "description", label: "Descrição", type: "textarea", value: course.description || "" }
      ],
      actions: [
        { key: "create-module", label: "Novo módulo" },
        { key: "create-course", label: "Novo curso" },
        { key: "delete-course", label: "Excluir curso", tone: "danger" }
      ]
    };
  }

  if (entityEditor.kind === "module") {
    const moduleValue = findModule(project, entityEditor.courseKey || selection.courseKey, entityEditor.moduleKey);
    if (!moduleValue) return null;
    return {
      title: "Módulo",
      fields: [
        { name: "title", label: "Título", type: "text", value: moduleValue.title || "" },
        { name: "description", label: "Descrição", type: "textarea", value: moduleValue.description || "" }
      ],
      actions: [
        { key: "create-lesson", label: "Nova lição" },
        { key: "delete-module", label: "Excluir módulo", tone: "danger" }
      ]
    };
  }

  if (entityEditor.kind === "lesson") {
    const lesson = findLesson(project, entityEditor.courseKey || selection.courseKey, entityEditor.moduleKey, entityEditor.lessonKey);
    if (!lesson) return null;
    return {
      title: "Lição",
      fields: [
        { name: "title", label: "Título", type: "text", value: lesson.title || "" },
        { name: "description", label: "Descrição", type: "textarea", value: lesson.description || "" }
      ],
      actions: [
        { key: "create-microsequence", label: "Nova microssequência" },
        { key: "delete-lesson", label: "Excluir lição", tone: "danger" }
      ]
    };
  }

  if (entityEditor.kind === "microsequence") {
    const microsequence = findMicrosequence(
      project,
      entityEditor.courseKey || selection.courseKey,
      entityEditor.moduleKey,
      entityEditor.lessonKey,
      entityEditor.microsequenceKey
    );
    if (!microsequence) return null;
    return {
      title: "Microssequência",
      fields: [
        { name: "title", label: "Título", type: "text", value: microsequence.title || "" },
        { name: "tags", label: "Tags", type: "textarea", value: formatTagsText(microsequence.tags) }
      ],
      actions: [
        { key: "create-card", label: "Novo card" },
        { key: "delete-microsequence", label: "Excluir microssequência", tone: "danger" }
      ]
    };
  }

  if (entityEditor.kind === "card") {
    const microsequence = findMicrosequence(
      project,
      entityEditor.courseKey || selection.courseKey,
      entityEditor.moduleKey || selection.moduleKey,
      entityEditor.lessonKey || selection.lessonKey,
      entityEditor.microsequenceKey || selection.microsequenceKey
    );
    const card = microsequence && (entityEditor.cardKey || selection.cardKey)
      ? findCard(microsequence, entityEditor.cardKey || selection.cardKey)
      : null;
    if (!card) return null;
    return {
      title: "Card",
      fields: [],
      actions: [
        { key: "create-card", label: "Novo card após este" },
        { key: "delete-card", label: "Excluir card", tone: "danger" }
      ]
    };
  }

  return null;
}

export function createLessonEditorApp({ root, storage, editor }) {
  if (!root) fail("Raiz inválida.");
  if (!storage || typeof storage.loadProject !== "function") fail("Storage inválido.");
  if (!editor) fail("Editor inválido.");

  const loadedProject = storage.loadProject();
  const initialProject = ensureDraftCourse(loadedProject);
  const initialAssistConfig = readAssistConfigStorage();
  const state = {
    project: initialProject,
    view: "courses",
    selection: null,
    cardCommentOpen: false,
    versionHistoryOpen: false,
    entityEditor: null,
    assistConfigOpen: false,
    assistConfig: initialAssistConfig,
    assistConfigDraft: { ...initialAssistConfig },
    microsequenceMode: "play",
    cardHistory: readHistoryStorage(),
    cardComments: readCommentStorage(),
    cardCommentDraft: "",
    flowchartPracticeByBlockKey: {},
    activeFlowchartPrompt: null,
    flowchartPinch: null,
    choiceExerciseByBlockKey: {},
    completeExerciseByBlockKey: {},
    activeTextGapPrompt: null,
    cardExerciseLoadVersion: 0,
    continuePopup: null,
    assistDraft: {
      selectedMode: ASSIST_USER_MODES.GENERATE,
      promptText: "",
      dependencyKeys: [],
      pendingDependencyKey: "",
      lastRequest: null,
      isSubmitting: false,
      errorMessage: ""
    }
  };

  state.selection = getFirstPath(state.project);

  function ensureDraftWorkspace(nextProject) {
    const ensuredProject = ensureDraftCourse(nextProject);
    if (ensuredProject !== nextProject) {
      storage.saveProject(ensuredProject);
    }
    return ensuredProject;
  }

  function setProject(nextProject) {
    state.project = ensureDraftWorkspace(nextProject);
  }

  function getDraftLessonContext(project = state.project) {
    const course = findCourse(project, DRAFT_COURSE_KEY);
    const moduleValue = course ? findModule(project, DRAFT_COURSE_KEY, DRAFT_MODULE_KEY) : null;
    const lesson = moduleValue ? findLesson(project, DRAFT_COURSE_KEY, DRAFT_MODULE_KEY, DRAFT_LESSON_KEY) : null;
    return { course, moduleValue, lesson };
  }

  function getVisibleDraftMicrosequences(project = state.project) {
    const { lesson } = getDraftLessonContext(project);
    return (lesson?.microsequences || []).filter((item) => !isDraftPlaceholderMicrosequence(item));
  }

  function ensureDraftGeneratorWorkspace() {
    const draftContext = getDraftLessonContext();
    if (!draftContext.course || !draftContext.moduleValue || !draftContext.lesson) {
      return null;
    }

    const existingPlaceholder = (draftContext.lesson.microsequences || []).find((item) => isDraftPlaceholderMicrosequence(item));
    if (existingPlaceholder) {
      if ((existingPlaceholder.title || "").trim()) {
        const nextProject = editor.updateMicrosequence({
          courseKey: draftContext.course.key,
          moduleKey: draftContext.moduleValue.key,
          lessonKey: draftContext.lesson.key,
          microsequenceKey: existingPlaceholder.key,
          title: "",
          tags: existingPlaceholder.tags || []
        });
        setProject(nextProject);
        const nextDraftLesson = findLesson(nextProject, DRAFT_COURSE_KEY, DRAFT_MODULE_KEY, DRAFT_LESSON_KEY);
        return (nextDraftLesson?.microsequences || []).find((item) => isDraftPlaceholderMicrosequence(item)) || null;
      }

      return existingPlaceholder;
    }

    const nextProject = editor.createMicrosequence({
      courseKey: draftContext.course.key,
      moduleKey: draftContext.moduleValue.key,
      lessonKey: draftContext.lesson.key,
      title: "",
      tags: []
    });
    setProject(nextProject);

    const nextDraftLesson = findLesson(nextProject, DRAFT_COURSE_KEY, DRAFT_MODULE_KEY, DRAFT_LESSON_KEY);
    return (nextDraftLesson?.microsequences || []).find((item) => isDraftPlaceholderMicrosequence(item)) || null;
  }

  function collectGlobalAssistTags(project = state.project) {
    const seenTitles = new Set();
    const tags = [];

    (project.courses || []).forEach((course) => {
      if (!course || course.key === DRAFT_COURSE_KEY) {
        return;
      }

      (course.modules || []).forEach((moduleValue) => {
        (moduleValue.lessons || []).forEach((lesson) => {
          (lesson.microsequences || []).forEach((microsequence) => {
            const title = (microsequence.title || microsequence.key || "").trim();
            if (!title || seenTitles.has(title.toLowerCase())) {
              return;
            }

            seenTitles.add(title.toLowerCase());
            tags.push({
              key: title,
              title,
              scope: course.title || "Curso"
            });
          });
        });
      });
    });

    return tags;
  }

  function getAssistCatalog() {
    if (state.view === "draft-generator" || state.selection.courseKey === DRAFT_COURSE_KEY) {
      return collectGlobalAssistTags();
    }

    const context = getRenderContext();
    return collectAssistDependencies(context.course, context.moduleValue, context.lesson, context.microsequence);
  }

  function collectRepositionSlots(project = state.project) {
    const selectedTagTitles = state.assistDraft.dependencyKeys;
    if (!selectedTagTitles.length) {
      return [];
    }

    const normalizedSelectedTags = new Set(selectedTagTitles.map((item) => normalizeComparableText(item)));
    const slots = [];
    const seenSlotIds = new Set();

    (project.courses || []).forEach((course) => {
      if (!course || course.key === DRAFT_COURSE_KEY) {
        return;
      }

      (course.modules || []).forEach((moduleValue) => {
        (moduleValue.lessons || []).forEach((lesson) => {
          const microsequences = lesson.microsequences || [];
          microsequences.forEach((microsequence, startIndex) => {
            const normalizedTitle = normalizeComparableText(microsequence.title || microsequence.key);
            if (!normalizedSelectedTags.has(normalizedTitle)) {
              return;
            }

            const sequence = microsequences.slice(startIndex);
            const sequenceTitles = sequence.map((item) => item.title || item.key);
            const beforeSlotId = [
              "slot",
              course.key,
              moduleValue.key,
              lesson.key,
              "before",
              microsequence.key
            ].join("::");
            if (!seenSlotIds.has(beforeSlotId)) {
              seenSlotIds.add(beforeSlotId);
              slots.push({
                slotId: beforeSlotId,
                courseKey: course.key,
                courseTitle: course.title || course.key,
                moduleKey: moduleValue.key,
                moduleTitle: moduleValue.title || moduleValue.key,
                lessonKey: lesson.key,
                lessonTitle: lesson.title || lesson.key,
                insertBeforeMicrosequenceKey: microsequence.key,
                insertBeforeTitle: microsequence.title || microsequence.key,
                targetPosition: startIndex,
                sequenceTitles
              });
            }

            sequence.forEach((sequenceItem, relativeIndex) => {
              const absoluteIndex = startIndex + relativeIndex;
              const slotId = [
                "slot",
                course.key,
                moduleValue.key,
                lesson.key,
                "after",
                sequenceItem.key
              ].join("::");
              if (seenSlotIds.has(slotId)) {
                return;
              }

              seenSlotIds.add(slotId);
              slots.push({
                slotId,
                courseKey: course.key,
                courseTitle: course.title || course.key,
                moduleKey: moduleValue.key,
                moduleTitle: moduleValue.title || moduleValue.key,
                lessonKey: lesson.key,
                lessonTitle: lesson.title || lesson.key,
                insertAfterMicrosequenceKey: sequenceItem.key,
                insertAfterTitle: sequenceItem.title || sequenceItem.key,
                targetPosition: absoluteIndex + 1,
                sequenceTitles
              });
            });
          });
        });
      });
    });

    return slots;
  }

  function getAssistModeOptions() {
    const context = getRenderContext();
    const hasSelectedTags = state.assistDraft.dependencyKeys.length > 0;
    const hasCards = Array.isArray(context.cards) && context.cards.length > 0 && !isDraftPlaceholderMicrosequence(context.microsequence);

    if (state.view === "draft-generator") {
      const options = [
        { value: ASSIST_USER_MODES.GENERATE, label: "Gerar microssequência" }
      ];

      if (hasCards) {
        options.push({ value: ASSIST_USER_MODES.EDIT_MICROSEQUENCE, label: "Editar microssequência" });
      }
      if (hasCards && hasSelectedTags) {
        options.push({ value: ASSIST_USER_MODES.REPOSITION, label: "Reposicionar em um curso" });
      }

      return {
        options,
        locked: options.length === 1
      };
    }

    const options = [
      { value: ASSIST_USER_MODES.EDIT_MICROSEQUENCE, label: "Editar microssequência" }
    ];
    if (hasSelectedTags) {
      options.push({ value: ASSIST_USER_MODES.REPOSITION, label: "Reposicionar em um curso" });
    }

    return {
      options,
      locked: options.length === 1
    };
  }

  function getDefaultAssistUserMode() {
    return state.view === "draft-generator"
      ? ASSIST_USER_MODES.GENERATE
      : ASSIST_USER_MODES.EDIT_MICROSEQUENCE;
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

  function selectFirstPath(nextProject) {
    const nextPath = getFirstPath(nextProject);
    applySelection(nextPath);
    return nextPath;
  }

  function openCourse(courseKey) {
    const course = findCourse(state.project, courseKey);
    if (!course) return;
    const moduleValue = (course.modules || [])[0] || null;
    const lesson = moduleValue && moduleValue.lessons ? moduleValue.lessons[0] || null : null;
    const microsequence = lesson && lesson.microsequences ? lesson.microsequences[0] || null : null;
    const card = microsequence && microsequence.cards ? microsequence.cards[0] || null : null;

    state.selection.courseKey = course.key;
    state.selection.moduleKey = moduleValue ? moduleValue.key : null;
    state.selection.lessonKey = lesson ? lesson.key : null;
    state.selection.microsequenceKey = microsequence ? microsequence.key : null;
    state.selection.cardKey = card ? card.key : null;
    state.selection.cardIndex = 0;
    state.view = "course";
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.microsequenceMode = "play";
    render({ preserveState: false });
  }

  function openLesson(moduleKey, lessonKey) {
    const lesson = findLesson(state.project, state.selection.courseKey, moduleKey, lessonKey);
    if (!lesson) return;
    const firstMicrosequence = (lesson.microsequences || [])[0] || null;
    const firstCard = firstMicrosequence && firstMicrosequence.cards ? firstMicrosequence.cards[0] || null : null;

    state.selection.moduleKey = moduleKey;
    state.selection.lessonKey = lessonKey;
    state.selection.microsequenceKey = firstMicrosequence ? firstMicrosequence.key : null;
    state.selection.cardKey = firstCard ? firstCard.key : null;
    state.selection.cardIndex = 0;
    state.view = "lesson";
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.microsequenceMode = "play";
    render({ preserveState: false });
  }

  function saveCardHistory() {
    writeHistoryStorage(state.cardHistory);
  }

  function getAssistModelLabel(model) {
    return ASSIST_MODEL_OPTIONS.find((item) => item.value === model)?.label || model;
  }

  function persistAssistConfig() {
    writeAssistConfigStorage(state.assistConfig);
  }

  function openAssistConfig() {
    state.assistConfigDraft = { ...state.assistConfig };
    state.assistConfigOpen = true;
    render({ preserveState: true });
  }

  function openDraftGenerationPage() {
    const { course, moduleValue, lesson } = getDraftLessonContext();
    if (!course || !moduleValue || !lesson) {
      return;
    }

    const generatorMicrosequence = ensureDraftGeneratorWorkspace();
    const firstCard = generatorMicrosequence?.cards?.[0] || null;

    applySelection({
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      microsequenceKey: generatorMicrosequence ? generatorMicrosequence.key : null,
      cardKey: firstCard ? firstCard.key : null,
      cardIndex: 0
    });
    state.view = "draft-generator";
    state.assistDraft.selectedMode = ASSIST_USER_MODES.GENERATE;
    state.assistDraft.dependencyKeys = [];
    state.assistDraft.pendingDependencyKey = "";
    state.cardCommentOpen = false;
    state.versionHistoryOpen = false;
    state.entityEditor = null;
    syncAssistDraft();
    render({ preserveState: false });
  }

  function closeAssistConfig() {
    state.assistConfigOpen = false;
    render({ preserveState: true });
  }

  function saveAssistConfig() {
    state.assistConfig = {
      model: state.assistConfigDraft.model || "gemini-2.5-flash-lite",
      apiKey: typeof state.assistConfigDraft.apiKey === "string" ? state.assistConfigDraft.apiKey.trim() : ""
    };
    persistAssistConfig();
    state.assistConfigOpen = false;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });
  }

  function setAssistModel(model) {
    state.assistConfig.model = model || "gemini-2.5-flash-lite";
    if (state.assistConfigOpen) {
      state.assistConfigDraft.model = state.assistConfig.model;
    }
    persistAssistConfig();
  }

  function getCurrentCardHistory() {
    const pathKey = buildCardPathKey(state.selection);
    return Array.isArray(state.cardHistory[pathKey]) ? state.cardHistory[pathKey] : [];
  }

  function recordCurrentCardSnapshot(label, source) {
    const context = getRenderContext();
    if (!context.card) {
      return;
    }

    const pathKey = buildCardPathKey(state.selection);
    const history = getCurrentCardHistory();
    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      label,
      source,
      title: context.card.title || "",
      text: readCardText(context.card),
      savedAt: new Date().toISOString()
    };

    if (history[0] && history[0].title === snapshot.title && history[0].text === snapshot.text) {
      return;
    }

    state.cardHistory[pathKey] = [snapshot, ...history].slice(0, MAX_CARD_SNAPSHOTS);
    saveCardHistory();
  }

  function ensureCurrentCardSnapshot() {
    const context = getRenderContext();
    if (!context.card) {
      return;
    }

    if (!getCurrentCardHistory().length) {
      recordCurrentCardSnapshot("Inicial", "base");
    }
  }

  function getAssistDependencies() {
    return getAssistCatalog();
  }

  function syncAssistDraft() {
    const dependencies = getAssistDependencies();
    const allowedKeys = new Set(dependencies.map((item) => item.key));
    const filteredKeys = state.assistDraft.dependencyKeys.filter((key) => allowedKeys.has(key));
    state.assistDraft.dependencyKeys =
      state.view === "draft-generator"
        ? filteredKeys.slice(0, MAX_ASSIST_DEPENDENCIES)
        : filteredKeys.length > 0
          ? filteredKeys.slice(0, MAX_ASSIST_DEPENDENCIES)
          : getDefaultDependencyKeys(dependencies);

    const availableKeys = dependencies
      .filter((item) => !state.assistDraft.dependencyKeys.includes(item.key))
      .map((item) => item.key);
    if (!availableKeys.includes(state.assistDraft.pendingDependencyKey)) {
      state.assistDraft.pendingDependencyKey = availableKeys[0] || "";
    }
    const modeOptions = getAssistModeOptions();
    const allowedModes = new Set(modeOptions.options.map((item) => item.value));
    if (!allowedModes.has(state.assistDraft.selectedMode)) {
      const defaultMode = getDefaultAssistUserMode();
      state.assistDraft.selectedMode = allowedModes.has(defaultMode)
        ? defaultMode
        : modeOptions.options[0]?.value || defaultMode;
    }
  }

  function applyCardContent({ title, text }) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    if (!microsequence) return;

    const card = state.selection.cardKey ? findCard(microsequence, state.selection.cardKey) : null;
    if (!card) return;

    try {
      const nextCard = buildCardUpdateFromText(card, title, text);
      const nextProject = editor.updateCard({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: microsequence.key,
        cardKey: card.key,
        ...nextCard
      });

      setProject(nextProject);
    } catch {
      // Evita perder foco do editor em estados transitórios.
    }
  }

  function restoreCardVersion(versionKey) {
    if (!versionKey || versionKey === "current") {
      return;
    }

    const version = getCurrentCardHistory().find((item) => item.id === versionKey);
    if (!version) {
      return;
    }

    recordCurrentCardSnapshot("Antes de retomar", "manual");
    applyCardContent({
      title: version.title,
      text: version.text
    });
    state.assistDraft.lastRequest = {
      title: "Versão retomada",
      description: `Editor voltou para ${version.label.toLowerCase()}.`,
      timestamp: new Date().toISOString()
    };
    render({ preserveState: true });
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

    const cards = microsequence.cards || [];
    const safeIndex = Math.max(0, Math.min(targetIndex, Math.max(0, cards.length - 1)));
    const card = cards[safeIndex] || null;

    state.selection.microsequenceKey = microsequence.key;
    state.selection.cardIndex = safeIndex;
    state.selection.cardKey = card ? card.key : null;
    return microsequence;
  }

  function openMicrosequenceScreen(microsequenceKey, targetIndex = 0, mode = "play") {
    const microsequence = selectMicrosequenceCard(microsequenceKey, targetIndex);
    if (!microsequence) return;

    state.view = "microsequence";
    state.microsequenceMode = mode;
    ensureCurrentCardSnapshot();
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
    const microsequence = selectMicrosequenceCard(microsequenceKey, targetIndex);
    if (!microsequence) return;
    state.view = "microsequence-assist";
    state.assistDraft.selectedMode = ASSIST_USER_MODES.EDIT_MICROSEQUENCE;
    state.microsequenceMode = "play";
    ensureCurrentCardSnapshot();
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
  }

  function openCardByIndex(targetIndex) {
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
        lessonCards.findIndex((entry) => entry.cardKey === state.selection.cardKey)
      );
      const safeIndex = Math.max(0, Math.min(targetIndex, Math.max(0, lessonCards.length - 1)));
      const entry = lessonCards[safeIndex] || lessonCards[currentIndex] || null;
      if (!entry) return;
      state.selection.microsequenceKey = entry.microsequenceKey;
      state.selection.cardKey = entry.cardKey;
      state.selection.cardIndex = entry.cardIndex;
    } else {
      const microsequence = findMicrosequence(
        state.project,
        state.selection.courseKey,
        state.selection.moduleKey,
        state.selection.lessonKey,
        state.selection.microsequenceKey
      );
      if (!microsequence) return;

      const cards = microsequence.cards || [];
      const safeIndex = Math.max(0, Math.min(targetIndex, Math.max(0, cards.length - 1)));
      const card = cards[safeIndex] || null;
      state.selection.cardIndex = safeIndex;
      state.selection.cardKey = card ? card.key : null;
    }

    ensureCurrentCardSnapshot();
    syncAssistDraft();
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: true });
  }

  function stepCard(delta) {
    // No modo de estudo, o card só pode avançar quando exercícios do card atual estiverem completos
    // e validados como corretos. Isso espelha o comportamento do AraLearn_old.
    if (delta > 0) {
      const flowcharts = getCurrentCardRuntimeFlowcharts();
      for (const entry of flowcharts) {
        const projection = entry?.block?.projection;
        if (!projection || !flowchartProjectionHasPractice(projection)) continue;
        const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
        state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
        // Só bloqueia avanço quando há exercício e ele não está correto.
        if (result.status !== "correct") {
          render({ preserveState: true });
          return;
        }
      }

      const choices = getCurrentCardRuntimeChoiceBlocks();
      for (const entry of choices) {
        const exercise = state.choiceExerciseByBlockKey[entry.blockKey] || { selected: [], feedback: null };
        if (exercise.feedback !== "correct") {
          // Força feedback para impedir avanço silencioso.
          validateChoice(entry.blockKey);
          return;
        }
      }

      const completes = getCurrentCardRuntimeCompleteBlocks();
      for (const entry of completes) {
        const exercise = state.completeExerciseByBlockKey[entry.blockKey] || { values: [], feedback: null };
        if (exercise.feedback !== "correct") {
          validateComplete(entry.blockKey);
          return;
        }
      }

      const popupEntry = getCurrentPopupRuntimeButtonEntry();
      const popupIsOpen =
        !!popupEntry &&
        !!state.continuePopup &&
        state.continuePopup.cardPathKey === buildCardPathKey(state.selection) &&
        state.continuePopup.blockKey === popupEntry.blockKey;

      if (popupEntry && !popupIsOpen) {
        state.continuePopup = {
          cardPathKey: buildCardPathKey(state.selection),
          blockKey: popupEntry.blockKey
        };
        state.activeFlowchartPrompt = null;
        state.activeTextGapPrompt = null;
        render({ preserveState: true });
        return;
      }

      if (popupIsOpen) {
        const popupFlowcharts = getCurrentPopupRuntimeFlowcharts();
        for (const entry of popupFlowcharts) {
          const projection = entry?.block?.projection;
          if (!projection || !flowchartProjectionHasPractice(projection)) continue;
          const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
          state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
          if (result.status !== "correct") {
            render({ preserveState: true });
            return;
          }
        }

        const popupChoices = getCurrentPopupRuntimeChoiceBlocks();
        for (const entry of popupChoices) {
          const exercise = state.choiceExerciseByBlockKey[entry.blockKey] || { selected: [], feedback: null };
          if (exercise.feedback !== "correct") {
            validateChoice(entry.blockKey);
            return;
          }
        }

        const popupCompletes = getCurrentPopupRuntimeCompleteBlocks();
        for (const entry of popupCompletes) {
          const exercise = state.completeExerciseByBlockKey[entry.blockKey] || { values: [], feedback: null };
          if (exercise.feedback !== "correct") {
            validateComplete(entry.blockKey);
            return;
          }
        }

        state.continuePopup = null;
        state.activeFlowchartPrompt = null;
        state.activeTextGapPrompt = null;
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
        lessonCards.findIndex((entry) => entry.cardKey === state.selection.cardKey)
      );
      openCardByIndex(currentIndex + delta);
      return;
    }

    openCardByIndex((Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0) + delta);
  }

  function openCardComment() {
    const pathKey = buildCardPathKey(state.selection);
    state.cardCommentDraft = typeof state.cardComments[pathKey] === "string" ? state.cardComments[pathKey] : "";
    state.cardCommentOpen = true;
    state.versionHistoryOpen = false;
    state.entityEditor = null;
    render({ preserveState: true });
  }

  function closeCardComment() {
    state.cardCommentOpen = false;
    render({ preserveState: true });
  }

  function saveCardComment() {
    const pathKey = buildCardPathKey(state.selection);
    const nextValue = state.cardCommentDraft.trim();

    if (nextValue) {
    state.cardComments[pathKey] = state.cardCommentDraft;
    } else {
      delete state.cardComments[pathKey];
    }

    writeCommentStorage(state.cardComments);
    state.cardCommentOpen = false;
    render({ preserveState: true });
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
    state.versionHistoryOpen = false;
    state.assistConfigOpen = false;
    render({ preserveState: true });
  }

  function closeEntityEditor() {
    state.entityEditor = null;
    render({ preserveState: true });
  }

  function openVersionHistory() {
    state.versionHistoryOpen = true;
    state.cardCommentOpen = false;
    state.assistConfigOpen = false;
    state.entityEditor = null;
    render({ preserveState: true });
  }

  function closeVersionHistory() {
    state.versionHistoryOpen = false;
    render({ preserveState: true });
  }

  function createCardAtPosition(position) {
    const microsequenceKey = state.selection.microsequenceKey;
    if (!microsequenceKey) return null;

    const nextProject = editor.createCard({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey,
      title: "Novo card",
      type: "text",
      text: "Descreva a ideia central desta microssequência.",
      position
    });

    setProject(nextProject);
    const microsequence = findMicrosequence(
      nextProject,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    const cards = microsequence?.cards || [];
    const nextIndex = Math.max(0, Math.min(position, Math.max(0, cards.length - 1)));
    const nextCard = cards[nextIndex] || null;
    state.selection.cardIndex = nextIndex;
    state.selection.cardKey = nextCard ? nextCard.key : null;
    ensureCurrentCardSnapshot();
    syncAssistDraft();
    return nextProject;
  }

  function createCardAfterCurrent() {
    const microsequenceKey = state.selection.microsequenceKey;
    if (!microsequenceKey) return;

    try {
      createCardAtPosition((Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0) + 1);
      render({ preserveState: true });
    } catch {
      // Mantém a UI operacional se a criação falhar por estado transitório.
    }
  }

  function applyMicrosequenceGeneration({ microsequenceTitle, cards, tags = [] }) {
    const nextProject = editor.replaceMicrosequenceCards({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      title: microsequenceTitle,
      tags,
      cards
    });

    setProject(nextProject);
    const microsequence = findMicrosequence(
      nextProject,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    const firstCard = microsequence?.cards?.[0] || null;
    state.selection.cardIndex = 0;
    state.selection.cardKey = firstCard ? firstCard.key : null;
    syncAssistDraft();
  }

  function applyMicrosequenceReposition(slot, renames = []) {
    if (!slot) {
      fail("A API escolheu um slot de reposicionamento inexistente. Ajuste o pedido e tente de novo.");
    }

    const nextProject = editor.moveMicrosequence({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      targetCourseKey: slot.courseKey,
      targetModuleKey: slot.moduleKey,
      targetLessonKey: slot.lessonKey,
      targetPosition: slot.targetPosition,
      renames
    });

    setProject(nextProject);
    const movedMicrosequence = findMicrosequence(
      nextProject,
      slot.courseKey,
      slot.moduleKey,
      slot.lessonKey,
      state.selection.microsequenceKey
    );
    const firstCard = movedMicrosequence?.cards?.[0] || null;

    applySelection({
      courseKey: slot.courseKey,
      moduleKey: slot.moduleKey,
      lessonKey: slot.lessonKey,
      microsequenceKey: movedMicrosequence?.key || state.selection.microsequenceKey,
      cardKey: firstCard ? firstCard.key : null,
      cardIndex: 0
    });
    state.view = "microsequence-assist";
    state.microsequenceMode = "play";
    syncAssistDraft();
  }

  async function submitAssistRequest() {
    const context = getRenderContext();
    const assistCatalog = getAssistCatalog();
    const dependencyTitles = assistCatalog
      .filter((item) => state.assistDraft.dependencyKeys.includes(item.key))
      .map((item) => item.title || item.key);
    const destinationSlots = collectRepositionSlots();
    const requestedMode = state.assistDraft.selectedMode;
    const mode =
      requestedMode === ASSIST_USER_MODES.REPOSITION
        ? "reposition-microsequence"
        : "compose-microsequence";
    const isBlankDraftGenerator = state.view === "draft-generator" && isDraftPlaceholderMicrosequence(context.microsequence);

    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });

    try {
      if (mode === "reposition-microsequence" && !destinationSlots.length) {
        fail("Nenhum slot de reposicionamento foi encontrado a partir das tags escolhidas. Selecione tags válidas e tente de novo.");
      }

      const result = await runGeminiAssist({
        apiKey: state.assistConfig.apiKey,
        model: state.assistConfig.model,
        mode,
        microsequence:
          state.view === "draft-generator" || requestedMode === ASSIST_USER_MODES.GENERATE
            ? {
                title: context.microsequence?.title || "",
                tags: context.microsequence?.tags || []
              }
            : context.microsequence,
        card: context.card,
        dependencyTitles,
        destinationSlots,
        promptText: state.assistDraft.promptText
      });

      if (mode === "compose-microsequence") {
        applyMicrosequenceGeneration({
          ...result,
          tags: dependencyTitles
        });
        state.assistDraft.lastRequest = {
          title:
            requestedMode === ASSIST_USER_MODES.EDIT_MICROSEQUENCE
              ? "Microssequência atualizada"
              : isBlankDraftGenerator
                ? "Microssequência gerada"
                : "Microssequência atualizada",
          description:
            `${result.cards.length} cards aplicados em ${result.microsequenceTitle} com ${getAssistModelLabel(state.assistConfig.model)}.`,
          timestamp: new Date().toISOString()
        };
      } else {
        const chosenSlot = destinationSlots.find((item) => item.slotId === result.slotId);
        if (!chosenSlot) {
          fail("A LLM devolveu um slot inválido para reposicionamento. Informe o problema no pedido e tente novamente.");
        }

        applyMicrosequenceReposition(chosenSlot, result.renames);
        const destinationLesson = findLesson(state.project, chosenSlot.courseKey, chosenSlot.moduleKey, chosenSlot.lessonKey);
        state.assistDraft.lastRequest = {
          title: "Microssequência reposicionada",
          description:
            `${context.microsequence?.title || "Microssequência"} movida para ${destinationLesson?.title || chosenSlot.lessonKey} com ${getAssistModelLabel(state.assistConfig.model)}.`,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      state.assistDraft.errorMessage = error instanceof Error ? error.message : "Falha ao chamar a API.";
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  function deleteCurrentCard() {
    const microsequenceKey = state.selection.microsequenceKey;
    const cardKey = state.selection.cardKey;
    if (!microsequenceKey || !cardKey) return;

    try {
      const previousIndex = Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0;
      const nextProject = editor.deleteCard({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey,
        cardKey
      });

      setProject(nextProject);
      const microsequence = findMicrosequence(
        nextProject,
        state.selection.courseKey,
        state.selection.moduleKey,
        state.selection.lessonKey,
        microsequenceKey
      );
      const cards = microsequence?.cards || [];
      const nextIndex = Math.max(0, Math.min(previousIndex, Math.max(0, cards.length - 1)));
      const nextCard = cards[nextIndex] || null;
      state.selection.cardIndex = nextIndex;
      state.selection.cardKey = nextCard ? nextCard.key : null;
      ensureCurrentCardSnapshot();
      syncAssistDraft();
      render({ preserveState: true });
    } catch {
      // Mantém a UI operacional se a remoção falhar por estado transitório.
    }
  }

  function runEntityAction(actionKey) {
    if (!state.entityEditor || !actionKey) return;

    try {
      let nextProject = null;

      if (actionKey === "create-course") {
        nextProject = editor.createCourse({
          title: "Novo curso"
        });
        setProject(nextProject);
        const course = nextProject.courses[nextProject.courses.length - 1];
        const moduleValue = course.modules[0];
        const lesson = moduleValue.lessons[0];
        const microsequence = lesson.microsequences[0];
        const card = microsequence.cards[0];
        applySelection({
          courseKey: course.key,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key,
          microsequenceKey: microsequence.key,
          cardKey: card.key,
          cardIndex: 0
        });
        state.view = "courses";
      } else if (actionKey === "delete-course") {
        nextProject = editor.deleteCourse({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey
        });
        setProject(nextProject);
        selectFirstPath(nextProject);
        state.view = "courses";
      } else if (actionKey === "create-module") {
        nextProject = editor.createModule({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          title: "Novo módulo"
        });
        setProject(nextProject);
        const course = findCourse(nextProject, state.entityEditor.courseKey || state.selection.courseKey);
        const moduleValue = course.modules[course.modules.length - 1];
        const lesson = moduleValue.lessons[0];
        const microsequence = lesson.microsequences[0];
        const card = microsequence.cards[0];
        applySelection({
          courseKey: course.key,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key,
          microsequenceKey: microsequence.key,
          cardKey: card.key,
          cardIndex: 0
        });
        state.view = "course";
      } else if (actionKey === "delete-module") {
        nextProject = editor.deleteModule({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey
        });
        setProject(nextProject);
        selectFirstPath(nextProject);
        state.view = "course";
      } else if (actionKey === "create-lesson") {
        nextProject = editor.createLesson({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          title: "Nova lição"
        });
        setProject(nextProject);
        const moduleValue = findModule(
          nextProject,
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey
        );
        const lesson = moduleValue.lessons[moduleValue.lessons.length - 1];
        const microsequence = lesson.microsequences[0];
        const card = microsequence.cards[0];
        applySelection({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key,
          microsequenceKey: microsequence.key,
          cardKey: card.key,
          cardIndex: 0
        });
        state.view = "lesson";
      } else if (actionKey === "delete-lesson") {
        nextProject = editor.deleteLesson({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey
        });
        setProject(nextProject);
        selectFirstPath(nextProject);
        state.view = "course";
      } else if (actionKey === "create-microsequence") {
        nextProject = editor.createMicrosequence({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          title: "Nova microssequência",
          tags: []
        });
        setProject(nextProject);
        const lesson = findLesson(
          nextProject,
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey,
          state.entityEditor.lessonKey
        );
        const microsequence = lesson.microsequences[lesson.microsequences.length - 1];
        const card = microsequence.cards[0];
        applySelection({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: lesson.key,
          microsequenceKey: microsequence.key,
          cardKey: card.key,
          cardIndex: 0
        });
        state.view = "lesson";
      } else if (actionKey === "delete-microsequence") {
        nextProject = editor.deleteMicrosequence({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          microsequenceKey: state.entityEditor.microsequenceKey
        });
        setProject(nextProject);
        selectFirstPath(nextProject);
        state.view = "lesson";
      } else if (actionKey === "create-card") {
        createCardAtPosition((Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0) + 1);
        state.view = "microsequence-assist";
      } else if (actionKey === "delete-card") {
        state.entityEditor = null;
        deleteCurrentCard();
        return;
      }

      state.entityEditor = null;
      render({ preserveState: false });
    } catch {
      // Mantém a UI operacional se a ação estrutural falhar por estado transitório.
    }
  }

  function goBack() {
    state.cardCommentOpen = false;
    state.versionHistoryOpen = false;
    state.assistConfigOpen = false;
    state.entityEditor = null;

    if (state.view === "microsequence") {
      state.view = state.selection.courseKey === DRAFT_COURSE_KEY ? "course" : "lesson";
      state.microsequenceMode = "play";
    } else if (state.view === "microsequence-assist") {
      state.view = state.selection.courseKey === DRAFT_COURSE_KEY ? "course" : "lesson";
      state.microsequenceMode = "play";
    } else if (state.view === "draft-generator") {
      state.view = "course";
    } else if (state.view === "lesson") {
      state.view = "course";
    } else if (state.view === "course") {
      state.view = "courses";
    }

    render({ preserveState: false });
  }

  function updateEntityDraft(payload) {
    if (!state.entityEditor) return;

    try {
      let nextProject = null;
      if (state.entityEditor.kind === "course") {
        nextProject = editor.updateCourse({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          title: payload.title,
          description: payload.description
        });
      } else if (state.entityEditor.kind === "module") {
        nextProject = editor.updateModule({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          title: payload.title,
          description: payload.description
        });
      } else if (state.entityEditor.kind === "lesson") {
        nextProject = editor.updateLesson({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          title: payload.title,
          description: payload.description
        });
      } else if (state.entityEditor.kind === "microsequence") {
        nextProject = editor.updateMicrosequence({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          microsequenceKey: state.entityEditor.microsequenceKey,
          title: payload.title,
          tags: parseTagsText(payload.tags)
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
        title: payload.title,
        tags: parseTagsText(payload.tags)
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

  function parseTextGapAnswers(text) {
    const source = String(text || "");
    const answers = [];
    let index = 0;

    while (index < source.length) {
      const start = source.indexOf("[[", index);
      if (start < 0) {
        break;
      }

      const end = source.indexOf("]]", start + 2);
      if (end < 0) {
        break;
      }

      const raw = source.slice(start + 2, end);
      const delimiterIndex = raw.indexOf("::");
      answers.push(delimiterIndex >= 0 ? raw.slice(0, delimiterIndex) : raw);
      index = end + 2;
    }

    return answers;
  }

  function parseTextGapParts(text) {
    const source = String(text || "");
    const parts = [];
    let index = 0;
    let blankIndex = 0;

    while (index < source.length) {
      const start = source.indexOf("[[", index);
      if (start < 0) {
        break;
      }

      const end = source.indexOf("]]", start + 2);
      if (end < 0) {
        break;
      }

      const raw = source.slice(start + 2, end);
      const delimiterIndex = raw.indexOf("::");
      const expected = delimiterIndex >= 0 ? raw.slice(0, delimiterIndex) : raw;
      const options =
        delimiterIndex >= 0
          ? raw
              .slice(delimiterIndex + 2)
              .split("|")
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [];

      parts.push({ index: blankIndex, expected, options });
      blankIndex += 1;
      index = end + 2;
    }

    return parts;
  }

  function getTextGapAnswersForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }

    if (block.kind === "complete") {
      return parseTextGapAnswers(block.text);
    }
    if (block.kind === "paragraph" || block.kind === "editor") {
      return parseTextGapAnswers(block.value);
    }
    if (block.kind === "table") {
      const answers = [];
      (Array.isArray(block.rows) ? block.rows : []).forEach((row) => {
        (Array.isArray(row) ? row : []).forEach((cell) => {
          answers.push(...parseTextGapAnswers(cell?.value || ""));
        });
      });
      return answers;
    }

    return [];
  }

  function blockUsesTextGapExercise(block) {
    return getTextGapAnswersForBlock(block).length > 0;
  }

  function listTextGapPartsForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }

    if (block.kind === "complete") {
      return parseTextGapParts(block.text);
    }
    if (block.kind === "paragraph" || block.kind === "editor") {
      return parseTextGapParts(block.value);
    }
    if (block.kind === "table") {
      const parts = [];
      (Array.isArray(block.rows) ? block.rows : []).forEach((row) => {
        (Array.isArray(row) ? row : []).forEach((cell) => {
          parts.push(...parseTextGapParts(cell?.value || "").map((part) => ({ ...part, index: parts.length })));
        });
      });
      return parts;
    }

    return [];
  }

  function getTextGapChoicePart(blockKey, blankIndex) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return null;
    }

    return (
      listTextGapPartsForBlock(entry.block).find(
        (part) => Number(part.index) === Number(blankIndex) && Array.isArray(part.options) && part.options.length
      ) || null
    );
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
      (block) => block?.kind === "flowchart" && block?.projection
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

  function getCurrentCardRuntimeChoiceBlocks(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => block?.kind === "multiple_choice"
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
      (block) => block?.kind === "flowchart" && block?.projection
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
      (block) => block?.kind === "multiple_choice"
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

    const correct = (Array.isArray(entry.block?.options) ? entry.block.options : [])
      .map((option, idx) => (option?.answer ? getExerciseOptionStableId(option, idx) : null))
      .filter(Boolean);

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
      return;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.choiceExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
    const selected = new Set(Array.isArray(exercise.selected) ? exercise.selected : []);
    const options = Array.isArray(entry.block?.options) ? entry.block.options : [];
    const correct = new Set(
      options
        .map((option, idx) => (option?.answer ? getExerciseOptionStableId(option, idx) : null))
        .filter(Boolean)
    );

    if (!selected.size) {
      state.choiceExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      render({ preserveState: true });
      return;
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
    if (!getTextGapChoicePart(blockKey, blankIndex)) {
      return;
    }

    ensureCurrentCompleteExerciseState();
    const currentExercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const currentValues = Array.isArray(currentExercise.values) ? currentExercise.values : [];
    const index = Number.parseInt(String(blankIndex), 10);
    const currentValue = index >= 0 ? String(currentValues[index] ?? "").trim() : "";
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
    if (!getTextGapChoicePart(blockKey, blankIndex)) {
      return;
    }

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
      return;
    }

    ensureCurrentCompleteExerciseState();
    const exercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const values = Array.isArray(exercise.values) ? exercise.values : [];
    const answers = getTextGapAnswersForBlock(entry.block);

    if (!answers.length) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "correct" };
      render({ preserveState: true });
      return;
    }

    const normalizedValues = answers.map((_, idx) => String(values[idx] ?? "").trim().toLowerCase());
    const normalizedAnswers = answers.map((item) => String(item ?? "").trim().toLowerCase());

    if (normalizedValues.some((value) => !value)) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      render({ preserveState: true });
      return;
    }

    const ok = normalizedValues.every((value, idx) => value === normalizedAnswers[idx]);
    state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    render({ preserveState: true });
  }

  function ensureCurrentFlowchartPracticeState() {
    const flowcharts = [
      ...getCurrentCardRuntimeFlowcharts(),
      ...getCurrentPopupRuntimeFlowcharts()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      enableFlowchartPractice: true,
      flowchartExerciseStateByBlockKey: {},
      activeFlowchartPrompt: null
    };

    flowcharts.forEach((entry) => {
      state.flowchartPracticeByBlockKey[entry.blockKey] = createFlowchartExerciseState(
        entry.block.projection,
        state.flowchartPracticeByBlockKey[entry.blockKey]
      );
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

    // No AraLearn_old, clicar novamente numa lacuna já preenchida remove o valor.
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
      entry.block.projection,
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
      entry.block.projection,
      state.flowchartPracticeByBlockKey[blockKey]
    );
    state.flowchartPracticeByBlockKey[blockKey] = result.state;
    render({ preserveState: true });
  }

  function resetFlowchartPractice(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    state.flowchartPracticeByBlockKey[blockKey] = resetFlowchartExerciseState(
      entry.block.projection,
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
      entry.block.projection,
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
      entry.block.projection,
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
    const cards = microsequence ? microsequence.cards || [] : [];
    const card = microsequence && state.selection.cardKey ? findCard(microsequence, state.selection.cardKey) : cards[0] || null;
    const dependencies = [];
    dependencies.push(...collectAssistDependencies(course, moduleValue, lesson, microsequence));
    return { course, moduleValue, lesson, microsequence, cards, card, dependencies };
  }

  function render({ preserveState = true } = {}) {
    const renderState = preserveState ? captureRenderState(root) : null;
    const context = getRenderContext();
    const currentCardRuntimeOptions = ensureCurrentCardRuntimeOptions();
    const assistCatalog = getAssistCatalog();
    const assistModeConfig = getAssistModeOptions();
    const draftContext = getDraftLessonContext();
    const draftMicrosequences = getVisibleDraftMicrosequences();
    const entityEditorModel = makeEntityEditorModel(state);
    const historyVersions = getCurrentCardHistory().map((item) => ({
        key: item.id,
        label: item.label,
        meta: [item.source, item.savedAt].filter(Boolean).join(" · ")
      }));

    root.innerHTML =
      '<div class="app-shell">' +
      renderLessonScreen({
        project: state.project,
        view: state.view,
        selection: state.selection,
        course: context.course,
        moduleValue: context.moduleValue,
        lesson: context.lesson,
        microsequence: context.microsequence,
        cards: context.cards,
        card: context.card,
        microsequenceMode: state.microsequenceMode,
        editorSupport: {
          progress: storage.loadProgress(),
          dependencies: assistCatalog,
          selectedDependencyKeys: state.assistDraft.dependencyKeys,
          pendingDependencyKey: state.assistDraft.pendingDependencyKey,
          assistModeOptions: assistModeConfig.options,
          selectedAssistMode: state.assistDraft.selectedMode,
          assistModeLocked: assistModeConfig.locked,
          selectedModel: state.assistConfig.model,
          selectedModelLabel: getAssistModelLabel(state.assistConfig.model),
          modelOptions: ASSIST_MODEL_OPTIONS,
          promptText: state.assistDraft.promptText,
          lastRequest: state.assistDraft.lastRequest,
          isSubmitting: state.assistDraft.isSubmitting,
          assistError: state.assistDraft.errorMessage,
          hasApiKey: Boolean(state.assistConfig.apiKey),
          historyCount: historyVersions.length,
          cardRuntimeOptions: currentCardRuntimeOptions,
          currentMicrosequenceIsPlaceholder: isDraftPlaceholderMicrosequence(context.microsequence),
          draftCourseKey: DRAFT_COURSE_KEY,
          draftLessonKey: draftContext.lesson?.key || DRAFT_LESSON_KEY,
          draftMicrosequences,
          visibleDraftCount: draftMicrosequences.length,
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
            value: state.cardCommentDraft
          })
        : "") +
      (state.versionHistoryOpen
        ? renderCardVersionOverlay({
            versions: historyVersions
          })
        : "") +
      (state.assistConfigOpen
        ? renderAssistConfigOverlay({
            model: state.assistConfigDraft.model,
            apiKey: state.assistConfigDraft.apiKey,
            modelOptions: ASSIST_MODEL_OPTIONS
          })
        : "") +
      (entityEditorModel ? renderEntityEditorOverlay(entityEditorModel) : "") +
      "</div>";

    if (renderState) {
      restoreRenderState(root, renderState);
    }

    root.querySelector("[data-action='go-back']")?.addEventListener("click", () => goBack());

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

    root.querySelector("[data-action='open-draft-generator']")?.addEventListener("click", () => {
      openDraftGenerationPage();
    });

    root.querySelectorAll("[data-action='open-microsequence']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        if (!microsequenceKey) return;
        openMicrosequenceAssistPage(microsequenceKey, 0);
      });
    });

    root.querySelectorAll("[data-action='open-draft-review']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        if (!microsequenceKey) return;
        openMicrosequenceAssistPage(microsequenceKey, 0);
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

    root.querySelector("[data-action='prev-card']")?.addEventListener("click", () => stepCard(-1));
    root.querySelector("[data-action='continue-popup-next']")?.addEventListener("click", () => stepCard(1));
    root.querySelector("[data-action='next-card']")?.addEventListener("click", () => stepCard(1));
    root.querySelector("[data-action='close-study']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='go-home']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='open-card-comment']")?.addEventListener("click", () => openCardComment());
    root.querySelector("[data-action='open-microsequence-assist']")?.addEventListener("click", () => {
      openMicrosequenceAssistPage(state.selection.microsequenceKey, state.selection.cardIndex || 0);
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

    root.querySelector("[data-action='editor-prev-card']")?.addEventListener("click", () => openCardByIndex(state.selection.cardIndex - 1));
    root.querySelector("[data-action='editor-next-card']")?.addEventListener("click", () => openCardByIndex(state.selection.cardIndex + 1));
    root.querySelector("[data-action='edit-card']")?.addEventListener("click", () =>
      openEntityEditor("card", {
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: state.selection.microsequenceKey,
        cardKey: state.selection.cardKey
      })
    );

    root.querySelectorAll("[data-action='open-card-index']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number.parseInt(node.getAttribute("data-card-index") || "0", 10);
        if (!Number.isFinite(index)) return;
        openCardByIndex(index);
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
    root.querySelectorAll("[data-action='edit-microsequence']").forEach((node) => {
      node.addEventListener("click", () =>
        openEntityEditor("microsequence", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          microsequenceKey: state.selection.microsequenceKey
        })
      );
    });

    root.querySelector("[data-action='entity-editor-close']")?.addEventListener("click", () => closeEntityEditor());
    root.querySelector("[data-action='entity-editor-save']")?.addEventListener("click", () => closeEntityEditor());
    root.querySelectorAll("[data-action='run-entity-action']").forEach((node) => {
      node.addEventListener("click", () => {
        const actionKey = node.getAttribute("data-entity-action");
        if (!actionKey) return;
        runEntityAction(actionKey);
      });
    });
    root.querySelector("[data-action='comment-close']")?.addEventListener("click", () => closeCardComment());
    root.querySelector("[data-action='comment-save']")?.addEventListener("click", () => saveCardComment());
    root.querySelector("[data-action='version-history-close']")?.addEventListener("click", () => closeVersionHistory());

    const cardCommentInput = root.querySelector("[data-field='card-comment']");
    const assistMicrosequenceTitleInput = root.querySelector("[data-field='assist-microsequence-title']");
    if (cardCommentInput) {
      cardCommentInput.value = state.cardCommentDraft;
      cardCommentInput.addEventListener("input", () => {
        state.cardCommentDraft = cardCommentInput.value;
      });
    }
    if (assistMicrosequenceTitleInput) {
      assistMicrosequenceTitleInput.addEventListener("input", () => {
        updateMicrosequenceDraft({
          title: assistMicrosequenceTitleInput.value,
          tags: formatTagsText(context.microsequence?.tags)
        });
      });
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
          scrollNode.scrollLeft = Math.max(0, Math.round((stageWidth - scrollNode.clientWidth) / 2));
          scrollNode.scrollTop = Math.max(0, Math.round((stageHeight - scrollNode.clientHeight) / 2));
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
    const assistModel = root.querySelector("[data-field='assist-model']");
    const assistDependencyPicker = root.querySelector("[data-field='assist-dependency-picker']");
    const assistPrompt = root.querySelector("[data-field='assist-prompt']");
    if (assistMode) {
      assistMode.addEventListener("change", () => {
        state.assistDraft.selectedMode = assistMode.value;
        render({ preserveState: true });
      });
    }
    if (assistDependencyPicker) {
      assistDependencyPicker.addEventListener("change", () => {
        state.assistDraft.pendingDependencyKey = assistDependencyPicker.value;
      });
    }
    if (assistModel) {
      assistModel.addEventListener("change", () => {
        setAssistModel(assistModel.value);
        render({ preserveState: true });
      });
    }
    if (assistPrompt) {
      assistPrompt.addEventListener("input", () => {
        state.assistDraft.promptText = assistPrompt.value;
      });
    }
    root.querySelectorAll("[data-action='remove-dependency']").forEach((node) => {
      node.addEventListener("click", () => {
        const key = node.getAttribute("data-dependency-key");
        if (!key) return;
        state.assistDraft.dependencyKeys = state.assistDraft.dependencyKeys.filter((item) => item !== key);
        syncAssistDraft();
        render({ preserveState: true });
      });
    });
    root.querySelector("[data-action='add-dependency']")?.addEventListener("click", () => {
      const key = state.assistDraft.pendingDependencyKey;
      if (!key) return;
      const current = new Set(state.assistDraft.dependencyKeys);
      if (current.size >= MAX_ASSIST_DEPENDENCIES || current.has(key)) return;
      current.add(key);
      state.assistDraft.dependencyKeys = Array.from(current).slice(0, MAX_ASSIST_DEPENDENCIES);
      syncAssistDraft();
      render({ preserveState: true });
    });
    root.querySelector("[data-action='clear-prompt']")?.addEventListener("click", () => {
      state.assistDraft.promptText = "";
      render({ preserveState: true });
    });
    root.querySelector("[data-action='open-assist-config']")?.addEventListener("click", () => openAssistConfig());
    root.querySelector("[data-action='apply-assist']")?.addEventListener("click", () => {
      void submitAssistRequest();
    });
    root.querySelector("[data-action='open-version-history']")?.addEventListener("click", () => openVersionHistory());
    root.querySelector("[data-action='assist-config-close']")?.addEventListener("click", () => closeAssistConfig());
    root.querySelector("[data-action='assist-config-save']")?.addEventListener("click", () => saveAssistConfig());
    root.querySelectorAll("[data-action='restore-version']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        closeVersionHistory();
        restoreCardVersion(versionKey);
      });
    });

    const assistConfigModel = root.querySelector("[data-field='assist-config-model']");
    const assistConfigApiKey = root.querySelector("[data-field='assist-config-api-key']");
    if (assistConfigModel) {
      assistConfigModel.addEventListener("change", () => {
        state.assistConfigDraft.model = assistConfigModel.value;
      });
    }
    if (assistConfigApiKey) {
      assistConfigApiKey.addEventListener("input", () => {
        state.assistConfigDraft.apiKey = assistConfigApiKey.value;
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

      const handler = () => {
        updateEntityDraft(
          Object.fromEntries(
            Object.entries(fields).map(([name, node]) => [name, node.value])
          )
        );
      };

      Object.values(fields).forEach((node) => {
        node.addEventListener("input", handler);
      });
    }
  }

  ensureCurrentCardSnapshot();
  syncAssistDraft();
  render({ preserveState: false });
}
