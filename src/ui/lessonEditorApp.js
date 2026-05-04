import { renderLessonScreen } from "./renderLessonScreen.js";
import { renderCardEditorOverlay } from "./renderCardEditorOverlay.js";
import { renderCardCommentOverlay } from "./renderCardCommentOverlay.js";
import { renderEntityEditorOverlay } from "./renderEntityEditorOverlay.js";
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
  readAssistCommentStorage,
  readCommentStorage,
  readHistoryStorage,
  writeAssistCommentStorage,
  writeCommentStorage,
  writeHistoryStorage
} from "./lessonEditorStorage.js";
import { cloneBlocks, getBlockAtPath, getParentArrayAtPath } from "./cardBlockPath.js";
import {
  createDefaultChildBlock,
  normalizeCardBlocks,
  summarizeCardTextFromBlocks
} from "../core/cardBlockModel.js";

const MAX_ASSIST_DEPENDENCIES = 5;
const MAX_CARD_SNAPSHOTS = 6;

function fail(message) {
  throw new Error(message);
}

function readCardText(card) {
  if (card && card.data && typeof card.data.text === "string") {
    return card.data.text;
  }

  return "";
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
        { name: "objective", label: "Objetivo", type: "textarea", value: microsequence.objective || "" }
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

  const state = {
    project: storage.loadProject(),
    view: "courses",
    selection: null,
    cardEditorOpen: false,
    cardCommentOpen: false,
    entityEditor: null,
    microsequenceMode: "play",
    cardHistory: readHistoryStorage(),
    cardComments: readCommentStorage(),
    assistCardComments: readAssistCommentStorage(),
    cardCommentDraft: "",
    assistDraft: {
      selectedMode: "edit-card",
      promptText: "",
      dependencyKeys: [],
      pendingDependencyKey: "",
      versionKey: "current",
      lastRequest: null
    }
  };

  state.selection = getFirstPath(state.project);

  function setProject(nextProject) {
    state.project = nextProject;
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
    state.selection.courseKey = course.key;
    state.view = "course";
    state.cardEditorOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.microsequenceMode = "play";
    render();
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
    state.cardEditorOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.microsequenceMode = "play";
    render();
  }

  function saveCardHistory() {
    writeHistoryStorage(state.cardHistory);
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
    const context = getRenderContext();
    return collectAssistDependencies(context.course, context.moduleValue, context.lesson, context.microsequence);
  }

  function syncAssistDraft() {
    const dependencies = getAssistDependencies();
    const allowedKeys = new Set(dependencies.map((item) => item.key));
    const filteredKeys = state.assistDraft.dependencyKeys.filter((key) => allowedKeys.has(key));
    state.assistDraft.dependencyKeys =
      filteredKeys.length > 0 ? filteredKeys.slice(0, MAX_ASSIST_DEPENDENCIES) : getDefaultDependencyKeys(dependencies);

    const availableKeys = dependencies
      .filter((item) => !state.assistDraft.dependencyKeys.includes(item.key))
      .map((item) => item.key);
    if (!availableKeys.includes(state.assistDraft.pendingDependencyKey)) {
      state.assistDraft.pendingDependencyKey = availableKeys[0] || "";
    }

    const allowedVersionKeys = new Set(getCurrentCardHistory().map((item) => item.id));
    if (state.assistDraft.versionKey !== "current" && !allowedVersionKeys.has(state.assistDraft.versionKey)) {
      state.assistDraft.versionKey = "current";
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
      const nextProject = editor.updateCard({
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: microsequence.key,
        cardKey: card.key,
        title,
        data: {
          ...(card.data || {}),
          text
        }
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
    state.assistDraft.versionKey = "current";
    state.assistDraft.lastRequest = {
      title: "Versão retomada",
      description: `Editor voltou para ${version.label.toLowerCase()}.`,
      timestamp: new Date().toISOString()
    };
    render();
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
    state.cardEditorOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    render();
  }

  function openMicrosequenceAssistPage(microsequenceKey, targetIndex = 0) {
    const microsequence = selectMicrosequenceCard(microsequenceKey, targetIndex);
    if (!microsequence) return;
    state.view = "microsequence-assist";
    state.microsequenceMode = "play";
    ensureCurrentCardSnapshot();
    syncAssistDraft();
    state.cardEditorOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    render();
  }

  function openCardEditorPage(microsequenceKey, targetIndex = 0) {
    const microsequence = selectMicrosequenceCard(microsequenceKey, targetIndex);
    if (!microsequence) return;
    state.view = "card-editor";
    state.microsequenceMode = "play";
    ensureCurrentCardSnapshot();
    state.cardEditorOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    render();
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
    render();
  }

  function stepCard(delta) {
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
    state.cardEditorOpen = false;
    state.entityEditor = null;
    render();
  }

  function closeCardComment() {
    state.cardCommentOpen = false;
    render();
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
    render();
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
    state.cardEditorOpen = false;
    state.cardCommentOpen = false;
    render();
  }

  function closeEntityEditor() {
    state.entityEditor = null;
    render();
  }

  function openCardEditor() {
    state.cardEditorOpen = true;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    render();
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
      intent: "text",
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
      render();
    } catch {
      // Mantém a UI operacional se a criação falhar por estado transitório.
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
      render();
    } catch {
      // Mantém a UI operacional se a remoção falhar por estado transitório.
    }
  }

  function closeCardEditor() {
    state.cardEditorOpen = false;
    render();
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
          objective: "Organizar o próximo bloco didático"
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
        state.view = state.view === "card-editor" ? "card-editor" : "microsequence-assist";
      } else if (actionKey === "delete-card") {
        state.entityEditor = null;
        deleteCurrentCard();
        return;
      }

      state.entityEditor = null;
      render();
    } catch {
      // Mantém a UI operacional se a ação estrutural falhar por estado transitório.
    }
  }

  function goBack() {
    state.cardEditorOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;

    if (state.view === "microsequence") {
      state.view = "lesson";
      state.microsequenceMode = "play";
    } else if (state.view === "microsequence-assist") {
      state.view = "lesson";
      state.microsequenceMode = "play";
    } else if (state.view === "card-editor") {
      state.view = "microsequence-assist";
      state.microsequenceMode = "play";
    } else if (state.view === "lesson") {
      state.view = "course";
    } else if (state.view === "course") {
      state.view = "courses";
    }

    render();
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
          objective: payload.objective
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
        objective: payload.objective
      });

      setProject(nextProject);
    } catch {
      // Evita quebrar a digitação durante estados transitórios inválidos.
    }
  }

  function setAssistCardComment(cardKey, value) {
    if (!cardKey) return;

    const pathKey = buildCardPathKey({
      ...state.selection,
      cardKey
    });
    const nextValue = String(value || "");

    if (nextValue.trim()) {
      state.assistCardComments[pathKey] = nextValue;
    } else {
      delete state.assistCardComments[pathKey];
    }

    writeAssistCommentStorage(state.assistCardComments);
  }

  function saveCardStructure({ title, blocks }) {
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

    const normalizedTitle = String(title || "").trim() || card.title || "Novo card";
    const normalizedBlocks = normalizeCardBlocks({
      title: normalizedTitle,
      blocks
    });

    try {
      const nextProject = editor.updateCard({
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: microsequence.key,
        cardKey: card.key,
        title: normalizedTitle,
        data: {
          ...(card.data || {}),
          text: summarizeCardTextFromBlocks(normalizedBlocks),
          blocks: normalizedBlocks
        }
      });

      setProject(nextProject);
    } catch {
      // Evita quebrar a digitação durante estados transitórios inválidos.
    }
  }

  function updateCardTitleDraft(title) {
    const context = getRenderContext();
    const blocks = normalizeCardBlocks({
      title,
      text: context.card?.data?.text || "",
      blocks: context.card?.data?.blocks || []
    });

    saveCardStructure({
      title,
      blocks
    });
  }

  function updateCardBlocks(mutator) {
    const context = getRenderContext();
    const title = context.card?.title || "Novo card";
    const blocks = cloneBlocks(
      normalizeCardBlocks({
        title,
        text: context.card?.data?.text || "",
        blocks: context.card?.data?.blocks || []
      })
    );

    mutator(blocks);
    saveCardStructure({
      title: blocks[0]?.label || title,
      blocks
    });
  }

  function setBlockLabel(path, value) {
    updateCardBlocks((blocks) => {
      const block = getBlockAtPath(blocks, path);
      if (!block || typeof block !== "object") {
        return;
      }

      block.label = value;
    });
  }

  function addBlock(parentPath, kind) {
    updateCardBlocks((blocks) => {
      const parent = getBlockAtPath(blocks, parentPath);
      if (!parent || parent.kind !== "popup") {
        return;
      }

      if (!Array.isArray(parent.children)) {
        parent.children = [];
      }

      parent.popupEnabled = true;
      parent.children.push(createDefaultChildBlock(kind));
    });
  }

  function setPopupEnabled(path, enabled) {
    updateCardBlocks((blocks) => {
      const block = getBlockAtPath(blocks, path);
      if (!block || block.kind !== "popup") {
        return;
      }

      block.popupEnabled = !!enabled;
      if (!block.popupEnabled) {
        block.children = [];
      }
    });
  }

  function moveBlock(path, delta) {
    updateCardBlocks((blocks) => {
      const parentInfo = getParentArrayAtPath(blocks, path);
      if (!parentInfo) {
        return;
      }

      const { array, index } = parentInfo;
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= array.length) {
        return;
      }

      const [item] = array.splice(index, 1);
      array.splice(nextIndex, 0, item);
    });
  }

  function removeBlock(path) {
    updateCardBlocks((blocks) => {
      const parentInfo = getParentArrayAtPath(blocks, path);
      if (!parentInfo) {
        return;
      }

      const { array, index } = parentInfo;
      array.splice(index, 1);
      if (!array.length) {
        array.push(createDefaultChildBlock());
      }
    });
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
    const assistCardComment = card
      ? state.assistCardComments[
          buildCardPathKey({
            ...state.selection,
            cardKey: card.key
          })
        ] || ""
      : "";

    return { course, moduleValue, lesson, microsequence, cards, card, dependencies, assistCardComment };
  }

  function render() {
    const context = getRenderContext();
    const entityEditorModel = makeEntityEditorModel(state);
    const currentVersions = [
      {
        key: "current",
        label: "Atual",
        source: "draft"
      },
      ...getCurrentCardHistory().map((item) => ({
        key: item.id,
        label: item.label,
        source: item.source,
        savedAt: item.savedAt
      }))
    ];

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
          dependencies: context.dependencies,
          selectedDependencyKeys: state.assistDraft.dependencyKeys,
          pendingDependencyKey: state.assistDraft.pendingDependencyKey,
          selectedMode: state.assistDraft.selectedMode,
          promptText: state.assistDraft.promptText,
          selectedVersionKey: state.assistDraft.versionKey,
          lastRequest: state.assistDraft.lastRequest,
          assistCardComment: context.assistCardComment,
          versionOptions: currentVersions,
          modeOptions: [
            {
              value: "edit-card",
              label: "Ajustar este card",
              hint: "",
              buttonLabel: "Enviar"
            },
            {
              value: "review-dependencies",
              label: "Ajustar tags",
              hint: "",
              buttonLabel: "Enviar"
            },
            {
              value: "compose-microsequence",
              label: "Montar microssequência",
              hint: "",
              buttonLabel: "Enviar"
            },
            {
              value: "check-continuity",
              label: "Checar continuidade",
              hint: "",
              buttonLabel: "Enviar"
            }
          ]
        }
      }) +
      (state.cardEditorOpen
        ? renderCardEditorOverlay({
            cards: context.cards,
            card: context.card,
            selection: state.selection
          })
        : "") +
      (state.cardCommentOpen
        ? renderCardCommentOverlay({
            value: state.cardCommentDraft
          })
        : "") +
      (entityEditorModel ? renderEntityEditorOverlay(entityEditorModel) : "") +
      "</div>";

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

    root.querySelectorAll("[data-action='open-microsequence']").forEach((node) => {
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
    root.querySelector("[data-action='next-card']")?.addEventListener("click", () => stepCard(1));
    root.querySelector("[data-action='close-study']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='go-home']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='open-card-comment']")?.addEventListener("click", () => openCardComment());
    root.querySelector("[data-action='open-microsequence-assist']")?.addEventListener("click", () => {
      openMicrosequenceAssistPage(state.selection.microsequenceKey, state.selection.cardIndex || 0);
    });

    root.querySelector("[data-action='open-editor']")?.addEventListener("click", () => openCardEditor());
    root.querySelector("[data-action='editor-close']")?.addEventListener("click", () => closeCardEditor());
    root.querySelector("[data-action='editor-save']")?.addEventListener("click", () => closeCardEditor());
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
    root.querySelector("[data-action='switch-microsequence-edit']")?.addEventListener("click", () => {
      openCardEditorPage(state.selection.microsequenceKey, state.selection.cardIndex || 0);
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

    const cardTitleInput = root.querySelector("[data-field='card-title']");
    const cardCommentInput = root.querySelector("[data-field='card-comment']");
    const assistMicrosequenceTitleInput = root.querySelector("[data-field='assist-microsequence-title']");
    const assistMicrosequenceObjectiveInput = root.querySelector("[data-field='assist-microsequence-objective']");
    const assistCardCommentInput = root.querySelector("[data-field='assist-card-comment']");
    if (cardTitleInput && context.card) {
      cardTitleInput.value = context.card.title || "";
      cardTitleInput.addEventListener("input", () => {
        updateCardTitleDraft(cardTitleInput.value);
      });
    }
    if (cardCommentInput) {
      cardCommentInput.value = state.cardCommentDraft;
      cardCommentInput.addEventListener("input", () => {
        state.cardCommentDraft = cardCommentInput.value;
      });
    }
    if (assistMicrosequenceTitleInput || assistMicrosequenceObjectiveInput) {
      const syncMicrosequenceDraft = () => {
        updateMicrosequenceDraft({
          title: assistMicrosequenceTitleInput ? assistMicrosequenceTitleInput.value : context.microsequence?.title || "",
          objective: assistMicrosequenceObjectiveInput ? assistMicrosequenceObjectiveInput.value : context.microsequence?.objective || ""
        });
      };

      assistMicrosequenceTitleInput?.addEventListener("input", syncMicrosequenceDraft);
      assistMicrosequenceObjectiveInput?.addEventListener("input", syncMicrosequenceDraft);
    }
    if (assistCardCommentInput && context.card) {
      assistCardCommentInput.value = context.assistCardComment || "";
      assistCardCommentInput.addEventListener("input", () => {
        setAssistCardComment(context.card.key, assistCardCommentInput.value);
      });
    }

    root.querySelectorAll("[data-field='block-label']").forEach((node) => {
      node.addEventListener("input", () => {
        setBlockLabel(node.getAttribute("data-block-path"), node.value);
      });
    });

    root.querySelectorAll("[data-field='block-popup-label']").forEach((node) => {
      node.addEventListener("input", () => {
        setBlockLabel(node.getAttribute("data-block-path"), node.value);
      });
    });

    root.querySelectorAll("[data-action='add-block']").forEach((node) => {
      node.addEventListener("click", () => {
        addBlock(node.getAttribute("data-block-parent"), node.getAttribute("data-block-kind"));
      });
    });

    root.querySelectorAll("[data-action='toggle-popup-enabled']").forEach((node) => {
      node.addEventListener("change", () => {
        setPopupEnabled(node.getAttribute("data-block-path"), node.checked);
      });
    });

    root.querySelectorAll("[data-action='move-block-up']").forEach((node) => {
      node.addEventListener("click", () => {
        moveBlock(node.getAttribute("data-block-path"), -1);
      });
    });

    root.querySelectorAll("[data-action='move-block-down']").forEach((node) => {
      node.addEventListener("click", () => {
        moveBlock(node.getAttribute("data-block-path"), 1);
      });
    });

    root.querySelectorAll("[data-action='remove-block']").forEach((node) => {
      node.addEventListener("click", () => {
        removeBlock(node.getAttribute("data-block-path"));
      });
    });

    root.querySelector("[data-action='save-inline-card']")?.addEventListener("click", () => {
      recordCurrentCardSnapshot("Manual", "manual");
      state.view = "microsequence-assist";
      state.microsequenceMode = "play";
      render();
    });

    const assistMode = root.querySelector("[data-field='assist-mode']");
    const assistVersion = root.querySelector("[data-field='assist-version']");
    const assistDependencyPicker = root.querySelector("[data-field='assist-dependency-picker']");
    const assistPrompt = root.querySelector("[data-field='assist-prompt']");
    if (assistMode) {
      assistMode.addEventListener("change", () => {
        state.assistDraft.selectedMode = assistMode.value;
      });
    }
    if (assistVersion) {
      assistVersion.addEventListener("change", () => {
        state.assistDraft.versionKey = assistVersion.value;
      });
    }
    if (assistDependencyPicker) {
      assistDependencyPicker.addEventListener("change", () => {
        state.assistDraft.pendingDependencyKey = assistDependencyPicker.value;
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
        render();
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
        render();
    });
    root.querySelector("[data-action='clear-prompt']")?.addEventListener("click", () => {
      state.assistDraft.promptText = "";
      render();
    });
    root.querySelector("[data-action='apply-assist']")?.addEventListener("click", () => {
      const modeOption =
        (
          [
            { value: "edit-card", label: "Ajustar este card" },
            { value: "review-dependencies", label: "Rever dependências" },
            { value: "compose-microsequence", label: "Montar a microssequência" },
            { value: "check-continuity", label: "Checar continuidade" }
          ].find((item) => item.value === state.assistDraft.selectedMode) || null
        );
      const selectedTitles = getAssistDependencies()
        .filter((item) => state.assistDraft.dependencyKeys.includes(item.key))
        .map((item) => item.title);
      const baseOption =
        currentVersions.find((item) => item.key === state.assistDraft.versionKey) || currentVersions[0];

      recordCurrentCardSnapshot("Antes do pedido", "assist");
      state.assistDraft.lastRequest = {
        title: modeOption ? modeOption.label : "Pedido",
        description:
          "Retomar: " +
          baseOption.label +
          " • Tags: " +
          (selectedTitles.length ? selectedTitles.join(", ") : "sem dependências extras") +
          (state.assistDraft.promptText.trim() ? " • Pedido pronto." : " • Falta escrever."),
        timestamp: new Date().toISOString()
      };
      render();
    });
    root.querySelector("[data-action='restore-version']")?.addEventListener("click", () => {
      restoreCardVersion(state.assistDraft.versionKey);
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
  render();
}
