import { getCorrectExerciseOptionIds, getExerciseOptionStableId } from "../core/exerciseOptions.js";
import { resolveCardRuntime } from "../core/cardRuntime.js";
import { extractTextGapAnswers } from "../core/textGaps.js";
import {
  createFlowchartExerciseState,
  fillFlowchartExerciseAnswer,
  flowchartProjectionHasPractice,
  resetFlowchartExerciseState,
  validateFlowchartExerciseState
} from "../flowchart/flowchartExercise.js";
import {
  getRuntimePopupButtonEntry,
  resolveRuntimeFlowchartProjection
} from "../render/renderCardRuntime.js";
import { writeLessonProgressEntry } from "../storage/progressStore.js";
import { resolveMicrosequenceRuntimeIncluded } from "../model/microsequenceStatus.js";
import { renderCardCommentOverlay } from "./renderCardCommentOverlay.js";
import {
  buildCourseNavigationState,
  buildLessonNavigationState,
  buildModuleNavigationState,
  buildNavigationViewState,
  resolveFirstSelection,
  resolveSelectionByKeys
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
import { renderLearnerScreen } from "./renderLearnerScreen.js";
import { continuePopupMatches, createContinuePopupState, resolveIndexedTarget } from "./studyCardProgression.js";

function fail(message) {
  throw new Error(message);
}

function emptySelection() {
  return {
    courseKey: null,
    moduleKey: null,
    lessonKey: null,
    microsequenceKey: null,
    cardKey: null,
    cardIndex: 0
  };
}

function selectionFromPath(path) {
  if (!path) return emptySelection();
  return {
    courseKey: path.courseKey || null,
    moduleKey: path.moduleKey || null,
    lessonKey: path.lessonKey || null,
    microsequenceKey: path.microsequenceKey || null,
    cardKey: path.cardKey || null,
    cardIndex: Number.isInteger(path.cardIndex) ? path.cardIndex : 0
  };
}

function normalizeAnswer(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeContentEditableGapValue(node) {
  const raw = String(node?.textContent || "").replace(/\u2007/g, "");
  return raw.replace(/\s+/g, " ").trim();
}

function textGapAnswers(block) {
  if (!block || typeof block !== "object") return [];
  if (block.kind === "complete") return extractTextGapAnswers(block.text);
  if (block.kind === "paragraph" || block.kind === "editor") return extractTextGapAnswers(block.value);
  if (block.kind === "code") return extractTextGapAnswers(block.code);
  if (block.kind === "plane") return extractTextGapAnswers(block.resultText);

  const answers = [];
  const rows = block.kind === "matrix"
    ? (Array.isArray(block.sequence) && block.sequence.length ? block.sequence : [block])
      .flatMap((item) => Array.isArray(item?.values) ? item.values : [])
    : block.kind === "table"
      ? (Array.isArray(block.rows) ? block.rows : [])
      : [];
  rows.forEach((row) => {
    (Array.isArray(row) ? row : []).forEach((cell) => {
      answers.push(...extractTextGapAnswers(cell?.value || ""));
    });
  });
  return answers;
}

function runtimeBlockEntries(card, selection, predicate, popupOnly = false) {
  if (!card) return [];
  const pathKey = buildCardPathKey(selection);
  const runtime = resolveCardRuntime(card);
  const cardBlocks = Array.isArray(runtime?.blocks) ? runtime.blocks : [];
  const popup = getRuntimePopupButtonEntry(card);
  const blocks = popupOnly ? (Array.isArray(popup?.block?.popupBlocks) ? popup.block.popupBlocks : []) : cardBlocks;
  const prefix = popupOnly && popup ? `${pathKey}::${popup.index}::popup` : pathKey;
  return blocks
    .map((block, index) => ({ block, blockKey: `${prefix}::${index}` }))
    .filter((entry) => predicate(entry.block));
}

function clampScale(value) {
  return Math.max(0.45, Math.min(2.4, Number(value || 1)));
}

function captureLearnerRenderState(root) {
  const screen = root.querySelector(".screen-content");
  const strip = root.querySelector("[data-card-strip='true']");
  return {
    screenTop: screen?.scrollTop || 0,
    stripLeft: strip?.scrollLeft || 0
  };
}

function restoreLearnerRenderState(root, snapshot) {
  if (!snapshot) return;
  const screen = root.querySelector(".screen-content");
  const strip = root.querySelector("[data-card-strip='true']");
  if (screen) screen.scrollTop = snapshot.screenTop;
  if (strip) strip.scrollLeft = snapshot.stripLeft;
}

export function createLearnerApp({ root, storage, initialProject }) {
  if (!root) fail("Raiz inválida.");
  if (!storage || typeof storage.loadProject !== "function") fail("Repositório inválido.");
  if (typeof storage.loadCommentForPath !== "function" || typeof storage.saveCommentForPath !== "function") {
    fail("Repositório relacional de comentários inválido.");
  }
  if (!initialProject || !Array.isArray(initialProject.courses)) fail("Projeto inicial inválido.");

  const state = {
    project: initialProject,
    view: "courses",
    selection: selectionFromPath(resolveFirstSelection(initialProject)),
    microsequenceMode: "play",
    cardCommentOpen: false,
    cardCommentDraft: "",
    cardCommentError: "",
    cardCommentSaving: false,
    flowchartProjectionByBlockKey: {},
    flowchartByBlockKey: {},
    choiceByBlockKey: {},
    completeByBlockKey: {},
    activeFlowchartPrompt: null,
    activeTextGapPrompt: null,
    continuePopup: null,
    cardExerciseLoadVersion: 0
  };

  function context() {
    const course = findCourse(state.project, state.selection.courseKey);
    const moduleValue = findModule(state.project, state.selection.courseKey, state.selection.moduleKey);
    const lesson = findLesson(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey
    );
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    const cards = Array.isArray(microsequence?.cards) ? microsequence.cards : [];
    const card = findSelectedCard(microsequence, state.selection) || cards[0] || null;
    return { course, moduleValue, lesson, microsequence, cards, card };
  }

  function lessonReference() {
    const { courseKey, moduleKey, lessonKey } = state.selection;
    return courseKey && moduleKey && lessonKey ? { courseKey, moduleKey, lessonKey } : null;
  }

  function recordCardView() {
    if (!state.selection.cardKey || typeof storage.recordCardView !== "function") return;
    void storage.recordCardView(state.selection).catch((error) => {
      console.warn("A visualização do card será sincronizada depois.", error);
    });
  }

  function recordAttempt(result) {
    if (!state.selection.cardKey || typeof storage.recordCardAttempt !== "function") return;
    void storage.recordCardAttempt(state.selection, result).catch((error) => {
      console.warn("A tentativa do card será sincronizada depois.", error);
    });
  }

  function saveReachedCard(lessonCards, reachedIndex) {
    const reference = lessonReference();
    if (!reference || !lessonCards.length) return;
    const next = writeLessonProgressEntry(
      storage.loadProgress(),
      reference,
      lessonCards.map((entry) => entry.card),
      reachedIndex
    );
    void Promise.resolve(storage.saveProgress(next)).catch((error) => {
      console.warn("O progresso permanecerá pendente neste dispositivo.", error);
    });
  }

  function currentEntries(predicate, { popup = false } = {}) {
    return runtimeBlockEntries(context().card, state.selection, predicate, popup);
  }

  function flowEntries() {
    return [
      ...currentEntries((block) => block?.kind === "flow"),
      ...currentEntries((block) => block?.kind === "flow", { popup: true })
    ];
  }

  function flowProjection(block, blockKey) {
    const cached = state.flowchartProjectionByBlockKey[blockKey];
    if (cached) return cached;
    const projection = resolveRuntimeFlowchartProjection(block);
    state.flowchartProjectionByBlockKey[blockKey] = projection;
    return projection;
  }

  function choiceEntries() {
    return [
      ...currentEntries((block) => block?.kind === "choice"),
      ...currentEntries((block) => block?.kind === "choice", { popup: true })
    ];
  }

  function completeEntries() {
    const predicate = (block) => textGapAnswers(block).length > 0;
    return [...currentEntries(predicate), ...currentEntries(predicate, { popup: true })];
  }

  function ensureExerciseState() {
    const prefix = buildCardPathKey(state.selection);
    const options = {
      blockKeyPrefix: prefix,
      enableFlowchartPractice: true,
      flowchartProjectionByBlockKey: {},
      flowchartExerciseStateByBlockKey: {},
      choiceExerciseStateByBlockKey: {},
      completeExerciseStateByBlockKey: {},
      textGapExerciseStateByBlockKey: {},
      activeFlowchartPrompt: null,
      activeTextGapPrompt: state.activeTextGapPrompt,
      exerciseShuffleSeed: `${prefix}::load::${state.cardExerciseLoadVersion}`
    };

    flowEntries().forEach(({ block, blockKey }) => {
      const projection = flowProjection(block, blockKey);
      state.flowchartByBlockKey[blockKey] = createFlowchartExerciseState(
        projection,
        state.flowchartByBlockKey[blockKey]
      );
      options.flowchartProjectionByBlockKey[blockKey] = projection;
      options.flowchartExerciseStateByBlockKey[blockKey] = state.flowchartByBlockKey[blockKey];
    });
    if (state.activeFlowchartPrompt && options.flowchartExerciseStateByBlockKey[state.activeFlowchartPrompt.blockKey]) {
      options.activeFlowchartPrompt = state.activeFlowchartPrompt;
    } else {
      state.activeFlowchartPrompt = null;
    }

    choiceEntries().forEach(({ block, blockKey }) => {
      const current = state.choiceByBlockKey[blockKey] || {};
      const choices = Array.isArray(block?.options) ? block.options : [];
      const selected = (Array.isArray(current.selected) ? current.selected : [])
        .map((item) => Number.isInteger(item) ? getExerciseOptionStableId(choices[item], item) : String(item || "").trim())
        .filter(Boolean);
      state.choiceByBlockKey[blockKey] = { selected, feedback: current.feedback || null };
      options.choiceExerciseStateByBlockKey[blockKey] = state.choiceByBlockKey[blockKey];
    });

    completeEntries().forEach(({ blockKey }) => {
      const current = state.completeByBlockKey[blockKey] || {};
      state.completeByBlockKey[blockKey] = {
        values: Array.isArray(current.values) ? current.values : [],
        feedback: current.feedback || null
      };
      options.completeExerciseStateByBlockKey[blockKey] = state.completeByBlockKey[blockKey];
      options.textGapExerciseStateByBlockKey[blockKey] = state.completeByBlockKey[blockKey];
    });
    return options;
  }

  function render({ preserveState = true } = {}) {
    const snapshot = preserveState ? captureLearnerRenderState(root) : null;
    const current = context();
    const popupEntry = getRuntimePopupButtonEntry(current.card);
    const popupBlockKey = popupEntry
      ? `${buildCardPathKey(state.selection)}::${popupEntry.index}`
      : null;
    root.innerHTML =
      '<div class="app-shell">' +
      renderLearnerScreen({
        project: state.project,
        view: state.view,
        selection: state.selection,
        course: current.course,
        moduleValue: current.moduleValue,
        lesson: current.lesson,
        microsequence: current.microsequence,
        cards: current.cards,
        support: {
          studyPaths: storage.loadStudyPaths?.() || [],
          progress: storage.loadProgress(),
          cardRuntimeOptions: ensureExerciseState(),
          continuePopup: {
            open: Boolean(
              popupBlockKey &&
              state.continuePopup &&
              continuePopupMatches(state.continuePopup, buildCardPathKey(state.selection), popupBlockKey)
            ),
            blockKey: popupBlockKey
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
      "</div>";
    if (snapshot) restoreLearnerRenderState(root, snapshot);
    syncCardStrip(true);
    root.querySelectorAll("[data-flowchart-scroll='true']").forEach((node) => {
      node.setAttribute("data-flowchart-scale", node.getAttribute("data-flowchart-scale") || "1");
    });
    const commentInput = root.querySelector("[data-field='card-comment']");
    if (commentInput) {
      commentInput.value = state.cardCommentDraft;
      commentInput.addEventListener("input", () => {
        state.cardCommentDraft = commentInput.value;
      });
    }
    if (state.activeTextGapPrompt || state.activeFlowchartPrompt) {
      requestAnimationFrame(() => {
        root.querySelector("[data-text-gap-prompt='true'], [data-flowchart-prompt='true']")?.focus();
      });
    }
  }

  function setNavigation(navigationState) {
    if (!navigationState) return false;
    Object.assign(state, buildNavigationViewState(navigationState));
    state.cardCommentOpen = false;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    return true;
  }

  function openCourse(courseKey) {
    if (setNavigation(buildCourseNavigationState(state.project, courseKey))) render({ preserveState: false });
  }

  function openModule(moduleKey) {
    if (setNavigation(buildModuleNavigationState(state.project, {
      courseKey: state.selection.courseKey,
      moduleKey
    }))) render({ preserveState: false });
  }

  function openLesson(moduleKey, lessonKey) {
    if (setNavigation(buildLessonNavigationState(state.project, storage.loadProgress(), {
      courseKey: state.selection.courseKey,
      moduleKey,
      lessonKey
    }))) {
      recordCardView();
      render({ preserveState: false });
    }
  }

  function openMicrosequence(microsequenceKey, cardIndex = 0) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence || !resolveMicrosequenceRuntimeIncluded(microsequence)) return;
    const cards = Array.isArray(microsequence.cards) ? microsequence.cards : [];
    const safeIndex = Math.max(0, Math.min(cardIndex, Math.max(0, cards.length - 1)));
    state.selection = {
      ...state.selection,
      microsequenceKey: microsequence.id,
      cardIndex: safeIndex,
      cardKey: cards[safeIndex]?.id || null
    };
    state.view = "microsequence";
    state.microsequenceMode = "play";
    state.cardExerciseLoadVersion += 1;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    recordCardView();
    render({ preserveState: false });
  }

  function openCard(targetIndex, { completeCurrent = false } = {}) {
    const { lesson } = context();
    if (!lesson) return;
    const lessonCards = collectLessonCards(lesson);
    const currentIndex = Math.max(0, findLessonCardEntryIndex(lessonCards, state.selection));
    const { item } = resolveIndexedTarget(lessonCards, targetIndex, currentIndex);
    if (!item) return;
    if (completeCurrent) saveReachedCard(lessonCards, currentIndex);
    state.selection = {
      ...state.selection,
      microsequenceKey: item.microsequenceKey,
      cardKey: item.cardKey,
      cardIndex: item.cardIndex
    };
    state.cardExerciseLoadVersion += 1;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    recordCardView();
    render();
  }

  function validateChoice(blockKey, { reveal = false } = {}) {
    const entry = choiceEntries().find((item) => item.blockKey === blockKey);
    if (!entry) return null;
    ensureExerciseState();
    const correct = getCorrectExerciseOptionIds(entry.block?.options, entry.block?.answer);
    const current = state.choiceByBlockKey[blockKey];
    if (reveal) {
      state.choiceByBlockKey[blockKey] = { selected: correct, feedback: "correct" };
      render();
      return "correct";
    }
    const selected = new Set(current.selected || []);
    if (!selected.size) {
      state.choiceByBlockKey[blockKey] = { ...current, feedback: "incomplete" };
      render();
      return "incomplete";
    }
    const expected = new Set(correct);
    const ok = selected.size === expected.size && [...selected].every((id) => expected.has(id));
    state.choiceByBlockKey[blockKey] = { ...current, feedback: ok ? "correct" : "wrong" };
    recordAttempt(ok ? "correct" : "wrong");
    render();
    return ok ? "correct" : "wrong";
  }

  function validateComplete(blockKey, { reveal = false } = {}) {
    const entry = completeEntries().find((item) => item.blockKey === blockKey);
    if (!entry) return null;
    ensureExerciseState();
    const answers = textGapAnswers(entry.block);
    const current = state.completeByBlockKey[blockKey];
    if (reveal) {
      state.completeByBlockKey[blockKey] = { values: answers, feedback: "correct" };
      state.activeTextGapPrompt = null;
      render();
      return "correct";
    }
    const values = answers.map((_, index) => normalizeAnswer(current.values[index]));
    if (values.some((value) => !value)) {
      state.completeByBlockKey[blockKey] = { ...current, feedback: "incomplete" };
      render();
      return "incomplete";
    }
    const ok = values.every((value, index) => value === normalizeAnswer(answers[index]));
    state.completeByBlockKey[blockKey] = { ...current, feedback: ok ? "correct" : "wrong" };
    recordAttempt(ok ? "correct" : "wrong");
    render();
    return ok ? "correct" : "wrong";
  }

  function validateFlow(blockKey, { reveal = false } = {}) {
    const entry = flowEntries().find((item) => item.blockKey === blockKey);
    if (!entry) return null;
    if (reveal) {
      state.flowchartByBlockKey[blockKey] = fillFlowchartExerciseAnswer(
        flowProjection(entry.block, blockKey),
        state.flowchartByBlockKey[blockKey]
      );
      state.activeFlowchartPrompt = null;
      render();
      return "correct";
    }
    const result = validateFlowchartExerciseState(
      flowProjection(entry.block, blockKey),
      state.flowchartByBlockKey[blockKey]
    );
    state.flowchartByBlockKey[blockKey] = result.state;
    if (result.status !== "incomplete") recordAttempt(result.status);
    render();
    return result.status;
  }

  function cardCanAdvance({ popupOnly = false } = {}) {
    const flowTargets = currentEntries((block) => block?.kind === "flow", { popup: popupOnly });
    const choiceTargets = currentEntries((block) => block?.kind === "choice", { popup: popupOnly });
    const completeTargets = currentEntries((block) => textGapAnswers(block).length > 0, { popup: popupOnly });
    for (const entry of flowTargets) {
      if (!flowchartProjectionHasPractice(flowProjection(entry.block, entry.blockKey))) continue;
      if (validateFlow(entry.blockKey) !== "correct") return false;
    }
    for (const entry of choiceTargets) {
      if (state.choiceByBlockKey[entry.blockKey]?.feedback !== "correct" && validateChoice(entry.blockKey) !== "correct") {
        return false;
      }
    }
    for (const entry of completeTargets) {
      if (state.completeByBlockKey[entry.blockKey]?.feedback !== "correct" && validateComplete(entry.blockKey) !== "correct") {
        return false;
      }
    }
    return true;
  }

  function stepCard(delta) {
    if (delta > 0 && !cardCanAdvance()) return;
    const popup = getRuntimePopupButtonEntry(context().card);
    const popupBlockKey = popup ? `${buildCardPathKey(state.selection)}::${popup.index}` : null;
    const popupOpen = Boolean(
      popupBlockKey && state.continuePopup &&
      continuePopupMatches(state.continuePopup, buildCardPathKey(state.selection), popupBlockKey)
    );
    if (delta > 0 && popup && !popupOpen) {
      state.continuePopup = createContinuePopupState(buildCardPathKey(state.selection), popupBlockKey);
      render();
      return;
    }
    if (delta > 0 && popupOpen && !cardCanAdvance({ popupOnly: true })) return;
    if (popupOpen) state.continuePopup = null;

    const { lesson } = context();
    const lessonCards = collectLessonCards(lesson);
    const currentIndex = Math.max(0, findLessonCardEntryIndex(lessonCards, state.selection));
    if (delta > 0 && currentIndex >= lessonCards.length - 1) {
      saveReachedCard(lessonCards, currentIndex);
      goBack();
      return;
    }
    openCard(currentIndex + delta, { completeCurrent: delta > 0 });
  }

  function goBack() {
    state.cardCommentOpen = false;
    state.continuePopup = null;
    if (state.view === "microsequence") state.view = "lesson";
    else if (state.view === "lesson") state.view = "module";
    else if (state.view === "module") state.view = "course";
    else if (state.view === "course") state.view = "courses";
    render();
  }

  function openComment() {
    const comment = storage.loadCommentForPath(state.selection);
    state.cardCommentDraft = typeof comment?.body === "string" ? comment.body : "";
    state.cardCommentError = "";
    state.cardCommentOpen = true;
    render();
  }

  async function saveComment() {
    if (state.cardCommentSaving) return;
    state.cardCommentSaving = true;
    render();
    try {
      await storage.saveCommentForPath(state.selection, state.cardCommentDraft);
      state.cardCommentOpen = false;
      state.cardCommentError = "";
    } catch (error) {
      state.cardCommentError = error instanceof Error ? error.message : String(error);
    } finally {
      state.cardCommentSaving = false;
      render();
    }
  }

  function syncCardStrip(keepActive = false) {
    const strip = root.querySelector("[data-card-strip='true']");
    if (!strip) return;
    const previous = root.querySelector("[data-action='scroll-card-strip-prev']");
    const next = root.querySelector("[data-action='scroll-card-strip-next']");
    requestAnimationFrame(() => {
      if (keepActive) strip.querySelector("[data-action='open-card'].active")?.scrollIntoView({ inline: "nearest" });
      const maximum = Math.max(0, strip.scrollWidth - strip.clientWidth);
      if (previous) previous.hidden = strip.scrollLeft <= 4;
      if (next) next.hidden = strip.scrollLeft >= maximum - 4;
    });
  }

  function changeFlowValue(blockKey, kind, targetId, value) {
    const entry = flowEntries().find((item) => item.blockKey === blockKey);
    if (!entry) return;
    const exercise = createFlowchartExerciseState(
      flowProjection(entry.block, blockKey),
      state.flowchartByBlockKey[blockKey]
    );
    const field = kind === "shape" ? "shapes" : kind === "label" ? "labels" : "texts";
    exercise[field][targetId] = value || null;
    exercise.feedback = null;
    state.flowchartByBlockKey[blockKey] = exercise;
  }

  function updateScale(button, delta, reset = false) {
    const scroll = button.closest(".runtime-flow-board-shell")?.querySelector("[data-flowchart-scroll='true']");
    if (!scroll) return;
    const current = Number(scroll.getAttribute("data-flowchart-scale") || 1);
    const scale = reset ? Number(button.getAttribute("data-flowchart-default-scale") || 1) : clampScale(current + delta);
    const canvas = scroll.querySelector("[data-flowchart-canvas='true']");
    if (canvas) canvas.style.transform = `scale(${scale})`;
    scroll.setAttribute("data-flowchart-scale", String(scale));
  }

  function updateCompleteInput(node, { normalizeDom = false } = {}) {
    const blockKey = node.getAttribute("data-complete-block-key");
    const index = Number(node.getAttribute("data-complete-blank-index"));
    if (!blockKey || !Number.isInteger(index)) return;
    const current = state.completeByBlockKey[blockKey] || { values: [], feedback: null };
    const values = [...current.values];
    const value = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
      ? node.value
      : normalizeContentEditableGapValue(node);
    if (normalizeDom && node.getAttribute("contenteditable") === "true") node.textContent = value;
    node.setAttribute("data-empty", value ? "false" : "true");
    values[index] = value;
    state.completeByBlockKey[blockKey] = { values, feedback: null };
  }

  root.addEventListener("click", (event) => {
    const node = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!node || !root.contains(node)) return;
    const action = node.getAttribute("data-action");
    const blockKey = node.getAttribute("data-choice-block-key") || node.getAttribute("data-complete-block-key") || node.getAttribute("data-flowchart-block-key");

    if (action === "future-sync") root.dispatchEvent(new CustomEvent("aralearn:open-library", { bubbles: true }));
    else if (action === "go-back" || action === "close-study" || action === "go-home") goBack();
    else if (action === "open-course") openCourse(node.getAttribute("data-course-key"));
    else if (action === "open-module") openModule(node.getAttribute("data-module-key"));
    else if (action === "open-lesson") openLesson(node.getAttribute("data-module-key"), node.getAttribute("data-lesson-key"));
    else if (action === "play-microsequence") openMicrosequence(node.getAttribute("data-microsequence-key"), 0);
    else if (action === "open-microsequence-card") openMicrosequence(node.getAttribute("data-microsequence-key"), Number(node.getAttribute("data-card-index") || 0));
    else if (action === "open-card" || action === "open-card-index") openCard(Number(node.getAttribute("data-card-index") || 0));
    else if (action === "prev-card") stepCard(-1);
    else if (action === "next-card" || action === "continue-popup-next") stepCard(1);
    else if (action === "open-card-comment") openComment();
    else if (action === "comment-close") { state.cardCommentOpen = false; render(); }
    else if (action === "comment-save") void saveComment();
    else if (action === "choice-toggle") {
      ensureExerciseState();
      const optionId = String(node.getAttribute("data-choice-option-id") || "").trim();
      const current = state.choiceByBlockKey[blockKey] || { selected: [], feedback: null };
      const selected = new Set(current.selected || []);
      if (selected.has(optionId)) selected.delete(optionId); else selected.add(optionId);
      state.choiceByBlockKey[blockKey] = { selected: [...selected], feedback: null };
      render();
    } else if (action === "choice-validate") validateChoice(blockKey);
    else if (action === "choice-view-answer") validateChoice(blockKey, { reveal: true });
    else if (action === "choice-try-again") { state.choiceByBlockKey[blockKey] = { selected: [], feedback: null }; render(); }
    else if (action === "complete-validate") validateComplete(blockKey);
    else if (action === "complete-view-answer") validateComplete(blockKey, { reveal: true });
    else if (action === "complete-try-again") { state.completeByBlockKey[blockKey] = { values: [], feedback: null }; render(); }
    else if (action === "text-gap-open-choice") {
      state.activeTextGapPrompt = { blockKey, blankIndex: Number(node.getAttribute("data-complete-blank-index")) };
      render();
    } else if (action === "text-gap-set-choice") {
      const index = Number(node.getAttribute("data-complete-blank-index"));
      const current = state.completeByBlockKey[blockKey] || { values: [], feedback: null };
      const values = [...current.values];
      values[index] = node.getAttribute("data-text-gap-value") || "";
      state.completeByBlockKey[blockKey] = { values, feedback: null };
      state.activeTextGapPrompt = null;
      render();
    } else if (action?.startsWith("flowchart-open-")) {
      state.activeFlowchartPrompt = {
        blockKey,
        kind: action.slice("flowchart-open-".length),
        targetId: node.getAttribute("data-flowchart-target-id")
      };
      render();
    } else if (action?.startsWith("flowchart-set-")) {
      changeFlowValue(blockKey, action.slice("flowchart-set-".length), node.getAttribute("data-flowchart-target-id"), node.getAttribute("data-flowchart-value"));
      state.activeFlowchartPrompt = null;
      render();
    } else if (action === "flowchart-clear-choice") {
      changeFlowValue(blockKey, node.getAttribute("data-flowchart-choice-kind"), node.getAttribute("data-flowchart-target-id"), null);
      render();
    } else if (action === "flowchart-check") validateFlow(blockKey);
    else if (action === "flowchart-view-answer") validateFlow(blockKey, { reveal: true });
    else if (action === "flowchart-reset") {
      const entry = flowEntries().find((item) => item.blockKey === blockKey);
      if (entry) {
        state.flowchartByBlockKey[blockKey] = resetFlowchartExerciseState(
          flowProjection(entry.block, blockKey),
          state.flowchartByBlockKey[blockKey]
        );
      }
      state.activeFlowchartPrompt = null;
      render();
    } else if (action === "flowchart-try-again") {
      const current = state.flowchartByBlockKey[blockKey];
      if (current) current.feedback = null;
      render();
    } else if (action === "flowchart-close-prompt") { state.activeFlowchartPrompt = null; render(); }
    else if (action === "flowchart-zoom-in") updateScale(node, 0.1);
    else if (action === "flowchart-zoom-out") updateScale(node, -0.1);
    else if (action === "flowchart-zoom-reset") updateScale(node, 0, true);
    else if (action === "scroll-card-strip-prev" || action === "scroll-card-strip-next") {
      const strip = root.querySelector("[data-card-strip='true']");
      strip?.scrollBy({ left: (action.endsWith("prev") ? -1 : 1) * Math.max(160, strip.clientWidth * 0.82), behavior: "smooth" });
    }
  });

  root.addEventListener("input", (event) => {
    const node = event.target;
    if (!(node instanceof HTMLElement)) return;
    if (node.matches("[data-action='complete-input']")) {
      updateCompleteInput(node);
    } else if (node.matches("[data-flowchart-inline-input='true']")) {
      changeFlowValue(
        node.getAttribute("data-flowchart-block-key"),
        node.getAttribute("data-flowchart-choice-kind"),
        node.getAttribute("data-flowchart-target-id"),
        node.value
      );
    }
  });

  root.addEventListener("keydown", (event) => {
    const node = event.target;
    if (!(node instanceof HTMLElement)) return;
    if (
      node.matches("[data-action='text-gap-open-choice']") &&
      (event.key === "Enter" || event.key === " " || event.key === "Spacebar")
    ) {
      event.preventDefault();
      node.click();
      return;
    }
    if (event.key !== "Enter") return;
    if (node.matches("[data-action='complete-input'][contenteditable='true']")) {
      event.preventDefault();
      return;
    }
    if (node.matches("[data-flowchart-inline-input='true']")) {
      event.preventDefault();
      node.blur();
    }
  });

  root.addEventListener("focusout", (event) => {
    const node = event.target;
    if (!(node instanceof HTMLElement)) return;
    if (node.matches("[data-action='complete-input'][contenteditable='true']")) {
      updateCompleteInput(node, { normalizeDom: true });
    }
  });

  render({ preserveState: false });
  globalThis.AndroidHost?.runtimeReady?.();
  return {
    replaceProject(nextProject) {
      state.project = nextProject;
      state.flowchartProjectionByBlockKey = {};
      state.flowchartByBlockKey = {};
      state.activeFlowchartPrompt = null;
      state.selection = selectionFromPath(resolveSelectionByKeys(nextProject, state.selection) || resolveFirstSelection(nextProject));
      if (!state.selection.courseKey) state.view = "courses";
      render({ preserveState: false });
    }
  };
}
