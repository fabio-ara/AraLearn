import { getCorrectExerciseOptionIds } from "../core/exerciseOptions.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import {
  getPackageStudyUnitFeedbackEntry,
  getPackageStudyUnitResponseEntry
} from "../render/renderPackageStudyUnit.js";
import {
  formatObservationTextBudget,
  isObservationTextOverLimit,
  renderStudyUnitObservationSheet,
  validateStudyUnitObservationText
} from "../ui/renderStudyUnitObservationSheet.js";
import { captureRenderState, restoreRenderState } from "../ui/renderState.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import {
  collectLessonStudyUnits,
  exactStudyUnitSelection,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  firstSelection,
  selectionForCourse,
  selectionForLesson,
  selectionForMicrosequence,
  selectionForModule,
  studyUnitPathKey
} from "./CourseStudyNavigation.js";
import { renderCourseStudyScreen } from "./CourseStudyScreen.js";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function canonicalReference(selection) {
  return {
    courseId: selection.courseId,
    moduleId: selection.moduleId,
    lessonId: selection.lessonId,
    microsequenceId: selection.microsequenceId,
    studyUnitId: selection.studyUnitId
  };
}

function responseKind(entry) {
  if (!entry?.instance) return "";
  if (entry.instance.package === "aralearn.response.choice") return "choice";
  if (entry.instance.package === "aralearn.response.gap") return "gap";
  if (entry.instance.package === "aralearn.response.ordering") return "ordering";
  return "";
}

function defaultResponseState(entry) {
  if (responseKind(entry) === "choice") return { selected: [], feedback: null };
  if (responseKind(entry) === "gap") return { values: [], feedback: null };
  if (responseKind(entry) === "ordering") {
    const ids = (entry.block?.targets || []).map(({ id }) => String(id));
    return {
      order: ids.length > 1 ? [...ids.slice(1), ids[0]] : ids,
      feedback: null
    };
  }
  return null;
}

function normalizeTextGapContentEditableValue(node) {
  if (!node) return "";
  return String(node.textContent || "")
    .replace(/[\u00a0\u2007]/g, " ")
    .replace(/[\r\n]+/g, "")
    .trim();
}

function annotationIndexes(node) {
  return String(node?.getAttribute?.("data-annotation-indexes") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function runForwardStudyInteraction(event, action) {
  event?.preventDefault();
  event?.stopImmediatePropagation();
  const clickCount = Number.isFinite(Number(event?.detail))
    ? Math.max(0, Number(event.detail))
    : 0;
  if (clickCount > 1) return false;
  action();
  return true;
}

function courseAccessWasRevoked(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  if (new Set([
    "ANNOTATION_NOT_FOUND", "ANCHORED_ANNOTATION_NOT_FOUND", "ANNOTATION_TARGET_NOT_FOUND",
    "COURSE_ANCHORED_ANNOTATION_NOT_FOUND", "COURSE_ANCHORED_ANNOTATION_TARGET_NOT_FOUND",
    "TARGET_NOT_FOUND"
  ]).has(code)) return false;
  return status === 403 || status === 404 || code === "42501" || code === "PT404";
}

export function createCourseStudyApplication({
  root,
  repository,
  initialProject,
  onViewChange = () => {}
} = {}) {
  if (!root || typeof root.querySelector !== "function") {
    throw new TypeError("Raiz de Estudo inválida.");
  }
  if (!repository || typeof repository.loadProgress !== "function") {
    throw new TypeError("Repositório canônico de Estudo obrigatório.");
  }
  if (!initialProject || !Array.isArray(initialProject.courses)) {
    throw new TypeError("Documento de Cursos inválido.");
  }

  let citationsEpoch = 0;
  let observationsEpoch = 0;
  let observationSignalVersion = 0;
  let unsubscribeAnnotations = null;
  const state = {
    project: clone(initialProject),
    view: "courses",
    selection: firstSelection(initialProject),
    microsequenceMode: "play",
    responseByBlockKey: {},
    activeGapPrompt: null,
    pendingStudyFocus: null,
    feedbackOpen: false,
    observationSheetOpen: false,
    observationItems: [],
    observationDraft: { category: null, rawText: "" },
    observationDraftTouched: false,
    observationEditingId: null,
    observationError: "",
    observationSaving: false,
    observationLoading: false,
    observationStale: false,
    citationsOpen: false,
    citationsLoading: false,
    citations: null,
    citationsError: "",
    accountProfile: null,
    connectionOffline: globalThis.navigator?.onLine === false
  };

  function retainContext(nextProject, previousSelection, previousView) {
    const fallback = firstSelection(nextProject);
    const courseSelection = selectionForCourse(nextProject, previousSelection.courseId);
    if (!courseSelection) return { selection: fallback, view: "courses" };
    if (previousView === "courses") {
      return { selection: courseSelection, view: "courses" };
    }
    if (previousView === "course") {
      return { selection: courseSelection, view: "course" };
    }
    const moduleSelection = selectionForModule(
      nextProject,
      courseSelection,
      previousSelection.moduleId
    );
    if (!moduleSelection) return { selection: courseSelection, view: "course" };
    if (previousView === "module") {
      return { selection: moduleSelection, view: "module" };
    }
    const lessonSelection = selectionForLesson(
      nextProject,
      moduleSelection,
      previousSelection.lessonId
    );
    if (!lessonSelection) return { selection: moduleSelection, view: "module" };
    if (previousView === "lesson") {
      return { selection: lessonSelection, view: "lesson" };
    }
    const exactSelection = exactStudyUnitSelection(nextProject, [
      previousSelection.courseId,
      previousSelection.moduleId,
      previousSelection.lessonId,
      previousSelection.microsequenceId,
      previousSelection.studyUnitId
    ]);
    const microsequenceSelection = exactSelection || selectionForMicrosequence(
      nextProject,
      lessonSelection,
      previousSelection.microsequenceId,
      previousSelection.studyUnitIndex
    );
    return microsequenceSelection
      ? { selection: microsequenceSelection, view: "microsequence" }
      : { selection: lessonSelection, view: "lesson" };
  }

  function syncAccountControl() {
    root.querySelectorAll("[data-action='open-settings']").forEach((node) => {
      const avatarUrl = String(state.accountProfile?.avatarUrl || "").trim();
      node.innerHTML = avatarUrl
        ? `<img class="account-control-avatar" src="${avatarUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" alt="">`
        : renderUiIcon("account", "home-tab-icon");
    });
  }

  function context() {
    const course = findCourse(state.project, state.selection.courseId);
    const moduleValue = findModule(
      state.project,
      state.selection.courseId,
      state.selection.moduleId
    );
    const lesson = findLesson(
      state.project,
      state.selection.courseId,
      state.selection.moduleId,
      state.selection.lessonId
    );
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseId,
      state.selection.moduleId,
      state.selection.lessonId,
      state.selection.microsequenceId
    );
    const studyUnits = Array.isArray(microsequence?.studyUnits) ? microsequence.studyUnits : [];
    const studyUnit = studyUnits.find((unit) => unit.id === state.selection.studyUnitId) ||
      studyUnits[state.selection.studyUnitIndex] || studyUnits[0] || null;
    return { course, moduleValue, lesson, microsequence, studyUnits, studyUnit };
  }

  function currentResponseEntry(studyUnit = context().studyUnit) {
    return getPackageStudyUnitResponseEntry(studyUnit, studyUnitPathKey(state.selection));
  }

  function ensureResponseState(entry = currentResponseEntry()) {
    if (!entry || !responseKind(entry)) return null;
    state.responseByBlockKey[entry.blockKey] ??= defaultResponseState(entry);
    return state.responseByBlockKey[entry.blockKey];
  }

  function queueStudyFocus(selector, attributes = {}) {
    state.pendingStudyFocus = { selector, attributes };
  }

  function focusStudyTarget(target) {
    if (!target?.selector) return;
    const focus = () => {
      const node = [...root.querySelectorAll(target.selector)].find((candidate) =>
        Object.entries(target.attributes).every(([name, value]) =>
          candidate.getAttribute(name) === String(value)));
      if (typeof node?.focus !== "function") return;
      try {
        node.focus({ preventScroll: true });
      } catch {
        node.focus();
      }
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
    else focus();
  }

  function currentStudyFocusTarget() {
    const active = root.ownerDocument?.activeElement;
    if (!active || !root.contains(active) || !active.tagName) return null;
    const attributes = Object.fromEntries([...active.attributes]
      .filter(({ name }) => name.startsWith("data-") ||
        name === "name" || name === "aria-label" || name === "role")
      .map(({ name, value }) => [name, value]));
    if (!Object.keys(attributes).length) return null;
    return { selector: active.tagName.toLowerCase(), attributes };
  }

  function packageStudyUnitOptions() {
    const entry = currentResponseEntry();
    const responseState = ensureResponseState(entry);
    return {
      blockKeyPrefix: studyUnitPathKey(state.selection),
      responseStateByBlockKey: entry && responseState
        ? { [entry.blockKey]: responseState }
        : {},
      activeTextGapPrompt: state.activeGapPrompt,
      exerciseShuffleSeed: `${studyUnitPathKey(state.selection)}::study`
    };
  }

  function resetCitations() {
    ++citationsEpoch;
    state.citationsOpen = false;
    state.citationsLoading = false;
    state.citations = null;
    state.citationsError = "";
  }

  function resetObservationSheet() {
    ++observationsEpoch;
    unsubscribeAnnotations?.();
    unsubscribeAnnotations = null;
    state.observationSheetOpen = false;
    state.observationItems = [];
    state.observationDraft = { category: null, rawText: "" };
    state.observationDraftTouched = false;
    state.observationEditingId = null;
    state.observationError = "";
    state.observationSaving = false;
    state.observationLoading = false;
    state.observationStale = false;
  }

  function resetStudyUnitInteraction() {
    const entry = currentResponseEntry();
    if (entry && state.responseByBlockKey[entry.blockKey]) {
      state.responseByBlockKey[entry.blockKey].feedback = null;
    }
    state.activeGapPrompt = null;
    state.pendingStudyFocus = null;
    state.feedbackOpen = false;
    resetCitations();
    resetObservationSheet();
  }

  function reconcileProjectAfterRevocation() {
    const nextProject = repository.loadProject?.();
    if (!nextProject || !Array.isArray(nextProject.courses)) return false;
    const retained = retainContext(nextProject, state.selection, state.view);
    state.project = clone(nextProject);
    state.selection = retained.selection;
    state.view = retained.view;
    resetStudyUnitInteraction();
    render({ preserveFocus: false });
    return true;
  }

  async function toggleCitations() {
    const reference = canonicalReference(state.selection);
    if (!reference || typeof repository.loadStudyUnitCitations !== "function") return false;
    if (state.citationsOpen) {
      state.citationsOpen = false;
      render();
      return true;
    }
    state.citationsOpen = true;
    if (state.citations) {
      render();
      return true;
    }
    const epoch = ++citationsEpoch;
    state.citationsLoading = true;
    state.citationsError = "";
    render();
    try {
      const result = await repository.loadStudyUnitCitations(reference);
      if (epoch !== citationsEpoch) return false;
      state.citations = result;
      return true;
    } catch (error) {
      if (epoch !== citationsEpoch) return false;
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) {
        return false;
      }
      const code = String(error?.code || "").toLowerCase();
      state.citationsError = code === "course_revision_changed"
        ? "O Curso mudou. Reabra esta Unidade para consultar as fontes atuais."
        : /offline|network|failed to fetch|connection/iu.test(`${code} ${error?.message || ""}`)
          ? "Sem conexão para consultar as fontes desta Unidade."
          : "Não foi possível consultar as fontes desta Unidade.";
      return false;
    } finally {
      if (epoch === citationsEpoch) {
        state.citationsLoading = false;
        render();
      }
    }
  }

  function selectMicrosequence(microsequenceId, studyUnitIndex = 0) {
    const selection = selectionForMicrosequence(
      state.project,
      state.selection,
      microsequenceId,
      studyUnitIndex
    );
    if (!selection) return false;
    state.selection = selection;
    resetStudyUnitInteraction();
    return true;
  }

  async function ensureCourseLoaded(courseId) {
    if (typeof repository.loadCourse !== "function") return true;
    root.setAttribute("aria-busy", "true");
    try {
      await repository.loadCourse(courseId);
      state.project = clone(repository.loadProject());
      return true;
    } catch (error) {
      root.dispatchEvent(new CustomEvent("aralearn:course-load-error", {
        bubbles: true,
        detail: { courseId, error }
      }));
      return false;
    } finally {
      root.setAttribute("aria-busy", "false");
    }
  }

  async function openCourse(courseId) {
    if (!await ensureCourseLoaded(courseId)) return false;
    const selection = selectionForCourse(state.project, courseId);
    if (!selection) return false;
    state.selection = selection;
    state.view = "course";
    render({ preserveFocus: false });
    return true;
  }

  function openModule(moduleId) {
    const selection = selectionForModule(state.project, state.selection, moduleId);
    if (!selection) return false;
    state.selection = selection;
    state.view = "module";
    render({ preserveFocus: false });
    return true;
  }

  function openLesson(lessonId) {
    const selection = selectionForLesson(state.project, state.selection, lessonId);
    if (!selection) return false;
    state.selection = selection;
    state.view = "lesson";
    render({ preserveFocus: false });
    return true;
  }

  function openMicrosequence(microsequenceId, studyUnitIndex = 0, mode = "overview") {
    if (!selectMicrosequence(microsequenceId, studyUnitIndex)) return false;
    state.view = "microsequence";
    state.microsequenceMode = mode === "play" ? "play" : "overview";
    render({ preserveFocus: false });
    return true;
  }

  function openLessonStudyUnit(entry) {
    if (!entry) return false;
    state.selection = {
      ...state.selection,
      ...(entry.courseId ? { courseId: entry.courseId } : {}),
      ...(entry.moduleId ? { moduleId: entry.moduleId } : {}),
      ...(entry.lessonId ? { lessonId: entry.lessonId } : {}),
      microsequenceId: entry.microsequenceId,
      studyUnitId: entry.studyUnitId,
      studyUnitIndex: Number.isInteger(entry.studyUnitIndex)
        ? entry.studyUnitIndex
        : entry.index
    };
    state.view = "microsequence";
    state.microsequenceMode = "play";
    resetStudyUnitInteraction();
    render({ preserveFocus: false });
    return true;
  }

  async function openReviewItem(entityPath) {
    if (!await ensureCourseLoaded(entityPath?.[0])) return false;
    const selection = exactStudyUnitSelection(state.project, entityPath);
    return selection ? openLessonStudyUnit(selection) : false;
  }

  async function resetCourseProgress(courseId) {
    if (!courseId || typeof repository.clearCourseProgress !== "function") return false;
    const course = findCourse(state.project, courseId);
    const accepted = typeof globalThis.confirm !== "function" || globalThis.confirm(
      `Zerar o progresso de ${course?.title || "este Curso"}?`
    );
    if (!accepted) return false;
    if (!await ensureCourseLoaded(courseId)) return false;
    await repository.clearCourseProgress(courseId);
    render({ preserveFocus: false });
    return true;
  }

  async function resetStudyProgress(node) {
    if (typeof repository.clearProgressScope !== "function") return false;
    const level = node?.getAttribute("data-reset-level") || "";
    const labels = {
      module: "este Módulo",
      lesson: "esta Lição",
      microsequence: "esta Microssequência didática",
      "study-unit": "esta Unidade de estudo e as seguintes na Lição"
    };
    if (!labels[level]) return false;
    if (typeof globalThis.confirm === "function" &&
        !globalThis.confirm(`Zerar o progresso de ${labels[level]}?`)) return false;
    await repository.clearProgressScope({
      courseId: node.getAttribute("data-course-id") || state.selection.courseId,
      moduleId: node.getAttribute("data-module-id") || "",
      lessonId: node.getAttribute("data-lesson-id") || "",
      microsequenceId: node.getAttribute("data-microsequence-id") || "",
      studyUnitId: node.getAttribute("data-study-unit-id") || ""
    });
    render({ preserveFocus: false });
    return true;
  }

  async function loadMoreReviewItems() {
    if (typeof repository.loadMoreReviewItems !== "function") return false;
    root.setAttribute("aria-busy", "true");
    try {
      await repository.loadMoreReviewItems();
      render({ preserveFocus: false });
      return true;
    } finally {
      root.setAttribute("aria-busy", "false");
    }
  }

  function goBack() {
    if (state.observationSheetOpen) {
      resetObservationSheet();
      render();
      return true;
    }
    if (state.feedbackOpen) {
      state.feedbackOpen = false;
      render();
      return true;
    }
    if (state.view === "microsequence") state.view = "lesson";
    else if (state.view === "lesson") state.view = "module";
    else if (state.view === "module") state.view = "course";
    else if (state.view === "course") state.view = "courses";
    else return false;
    state.microsequenceMode = "play";
    render({ preserveFocus: false });
    return true;
  }

  function validateResponse({ rerender = true } = {}) {
    const entry = currentResponseEntry();
    if (!entry) return true;
    const exercise = ensureResponseState(entry);
    const kind = responseKind(entry);
    let payload;
    if (kind === "choice") {
      if (!exercise.selected.length) {
        exercise.feedback = "incomplete";
        queueStudyFocus("[data-action='choice-toggle']", {
          "data-choice-block-key": entry.blockKey
        });
        if (rerender) render();
        return false;
      }
      payload = { selectedIds: [...exercise.selected] };
    } else if (kind === "gap") {
      const blanks = Array.isArray(entry.block?.blanks) ? entry.block.blanks : [];
      const values = blanks.map((_, index) => String(exercise.values[index] ?? "").trim());
      const incompleteIndex = values.findIndex((value) => !value);
      if (incompleteIndex >= 0) {
        exercise.feedback = "incomplete";
        const blank = blanks[incompleteIndex];
        if (blank?.responseMode === "choice") {
          state.activeGapPrompt = { blockKey: entry.blockKey, blankIndex: incompleteIndex };
          queueStudyFocus("[data-action='text-gap-set-choice']", {
            "data-complete-block-key": entry.blockKey,
            "data-complete-blank-index": incompleteIndex
          });
        } else {
          queueStudyFocus("[data-action='complete-input']", {
            "data-complete-block-key": entry.blockKey,
            "data-complete-blank-index": incompleteIndex
          });
        }
        if (rerender) render();
        return false;
      }
      payload = { values: Object.fromEntries(blanks.map((blank, index) => [blank.id, values[index]])) };
    } else if (kind === "ordering") {
      payload = { order: [...exercise.order] };
    } else {
      return true;
    }
    exercise.feedback = RESOURCE_PACKAGE_REGISTRY.evaluateResponse(entry.instance, payload).correct
      ? "correct"
      : "wrong";
    if (rerender) render();
    return exercise.feedback === "correct";
  }

  async function stepStudyUnit(delta) {
    const current = context();
    if (!current.lesson) return false;
    if (delta > 0 && !validateResponse({ rerender: false })) {
      render();
      return false;
    }
    if (delta > 0 && getPackageStudyUnitFeedbackEntry(current.studyUnit) && !state.feedbackOpen) {
      state.feedbackOpen = true;
      render();
      return true;
    }
    state.feedbackOpen = false;
    const lessonStudyUnits = collectLessonStudyUnits(current.lesson);
    const currentIndex = lessonStudyUnits.findIndex((entry) =>
      entry.microsequenceId === state.selection.microsequenceId &&
      entry.studyUnitId === state.selection.studyUnitId
    );
    if (currentIndex < 0) return false;
    if (delta > 0) {
      await repository.setStudyUnitCompleted(canonicalReference(state.selection), true);
    }
    const next = lessonStudyUnits[currentIndex + delta];
    if (!next) {
      if (delta > 0) goBack();
      return false;
    }
    return openLessonStudyUnit(next);
  }

  async function openObservations() {
    const reference = canonicalReference(state.selection);
    const epoch = ++observationsEpoch;
    state.observationItems = repository.loadAnnotationsForPath?.(reference) || [];
    state.observationDraft = { category: null, rawText: "" };
    state.observationDraftTouched = false;
    state.observationEditingId = null;
    state.observationError = "";
    state.observationStale = false;
    state.observationSheetOpen = true;
    unsubscribeAnnotations?.();
    unsubscribeAnnotations = typeof repository.subscribeToAnnotations === "function"
      ? repository.subscribeToAnnotations(reference, ({ stale }) => {
          if (!state.observationSheetOpen || epoch !== observationsEpoch) return;
          if (stale) observationSignalVersion += 1;
          const activeElement = root.ownerDocument?.activeElement;
          const protectsDraft = state.observationDraftTouched ||
            Boolean(state.observationEditingId) ||
            Boolean(activeElement?.closest?.("[data-observation-composer]"));
          if (stale && protectsDraft) {
            state.observationStale = true;
            render();
            return;
          }
          if (stale) {
            void refreshOpenObservations(reference, epoch);
            return;
          }
          state.observationItems = repository.loadAnnotationsForPath(reference);
          render();
        })
      : null;
    render();
    if (typeof repository.refreshAnnotationsForPath !== "function") {
      state.observationError = "As observações ainda não estão disponíveis.";
      render();
      return;
    }
    await refreshOpenObservations(reference, epoch);
  }

  async function refreshOpenObservations(reference, epoch) {
    if (state.observationLoading) {
      state.observationStale = true;
      return false;
    }
    const signalAtStart = observationSignalVersion;
    state.observationLoading = true;
    render();
    try {
      const items = await repository.refreshAnnotationsForPath(reference);
      if (epoch !== observationsEpoch || !state.observationSheetOpen) return false;
      state.observationItems = items;
      state.observationStale = observationSignalVersion !== signalAtStart;
      return true;
    } catch (error) {
      if (epoch !== observationsEpoch) return false;
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) return false;
      state.observationError = error instanceof Error
        ? error.message
        : "Não foi possível atualizar as observações.";
      return false;
    } finally {
      if (epoch === observationsEpoch) {
        state.observationLoading = false;
        const shouldRetry = state.observationStale && !state.observationDraftTouched &&
          !state.observationEditingId;
        render();
        if (shouldRetry) {
          state.observationStale = false;
          queueMicrotask(() => void refreshOpenObservations(reference, epoch));
        }
      }
    }
  }

  function editObservation(annotationId) {
    const item = state.observationItems.find((candidate) =>
      candidate.annotationId === annotationId);
    if (!item || item.state === "withdrawn" || item.capabilities?.canRevise !== true) return;
    state.observationEditingId = annotationId;
    state.observationDraft = { category: item.category ?? null, rawText: item.rawText || "" };
    state.observationDraftTouched = true;
    state.observationError = "";
    render();
  }

  async function saveObservation() {
    if (state.observationSaving) return;
    const textIssue = validateStudyUnitObservationText(state.observationDraft.rawText);
    if (textIssue) {
      state.observationError = textIssue;
      render();
      return;
    }
    const reference = canonicalReference(state.selection);
    state.observationSaving = true;
    state.observationError = "";
    render();
    try {
      if (state.observationEditingId) {
        await repository.reviseAnnotation(
          reference,
          state.observationEditingId,
          state.observationDraft
        );
      } else {
        await repository.createAnnotationForPath(reference, state.observationDraft);
      }
      state.observationItems = repository.loadAnnotationsForPath(reference);
      state.observationDraft = { category: null, rawText: "" };
      state.observationDraftTouched = false;
      state.observationEditingId = null;
      state.observationStale = false;
    } catch (error) {
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) return;
      state.observationError = error instanceof Error ? error.message : "Não foi possível salvar.";
    } finally {
      state.observationSaving = false;
      render();
    }
  }

  async function withdrawObservation(annotationId) {
    if (state.observationSaving) return;
    const reference = canonicalReference(state.selection);
    state.observationSaving = true;
    state.observationError = "";
    render();
    try {
      await repository.withdrawAnnotation(reference, annotationId);
      state.observationItems = repository.loadAnnotationsForPath(reference);
      if (state.observationEditingId === annotationId) {
        state.observationEditingId = null;
        state.observationDraft = { category: null, rawText: "" };
        state.observationDraftTouched = false;
      }
    } catch (error) {
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) return;
      state.observationError = error instanceof Error
        ? error.message
        : "Não foi possível retirar a observação.";
    } finally {
      state.observationSaving = false;
      render();
    }
  }

  async function discardFailedObservation(annotationId) {
    const reference = canonicalReference(state.selection);
    try {
      await repository.discardFailedAnnotation(reference, annotationId);
      state.observationItems = repository.loadAnnotationsForPath(reference);
      state.observationError = "";
    } catch (error) {
      state.observationItems = repository.loadAnnotationsForPath?.(reference) || [];
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) return;
      state.observationError = error instanceof Error
        ? error.message
        : "Não foi possível descartar a alteração com falha.";
    }
    render();
  }

  function toggleReview() {
    const reference = canonicalReference(state.selection);
    return repository.setStudyUnitReviewMark(
      reference,
      !repository.isStudyUnitMarkedForReview(reference)
    ).then(() => render());
  }

  function bindGapInputs(scope) {
    scope.querySelectorAll("[data-action='complete-input']").forEach((node) => {
      if (node.dataset.studyBound === "true") return;
      node.dataset.studyBound = "true";
      const contentEditable = node.getAttribute("contenteditable") === "true";
      const readValue = () => contentEditable
        ? normalizeTextGapContentEditableValue(node)
        : String(node.value ?? node.textContent ?? "");
      const update = () => {
        const entry = currentResponseEntry();
        const exercise = ensureResponseState(entry);
        const index = Number(node.getAttribute("data-complete-blank-index"));
        if (!exercise || !Number.isInteger(index) || index < 0) return;
        const values = [...exercise.values];
        values[index] = readValue();
        exercise.values = values;
        exercise.feedback = null;
        if (contentEditable) {
          node.setAttribute("data-empty", values[index] ? "false" : "true");
        }
      };
      if (contentEditable) {
        node.setAttribute(
          "data-empty",
          normalizeTextGapContentEditableValue(node) ? "false" : "true"
        );
        node.addEventListener("keydown", (event) => {
          if (event.key === "Enter") event.preventDefault();
        });
        node.addEventListener("beforeinput", (event) => {
          if (["insertParagraph", "insertLineBreak"].includes(event.inputType)) {
            event.preventDefault();
          }
        });
        node.addEventListener("blur", () => {
          if (normalizeTextGapContentEditableValue(node)) return;
          node.textContent = "";
          node.setAttribute("data-empty", "true");
          update();
        });
      }
      node.addEventListener("input", update);
    });
  }

  function selectChoice(node, { forceSelected = false, focusAfterRender = true } = {}) {
    const entry = currentResponseEntry();
    const exercise = ensureResponseState(entry);
    const id = node.getAttribute("data-choice-option-id");
    const blockKey = node.getAttribute("data-choice-block-key");
    if (!exercise || !id) return false;
    const selected = new Set(exercise.selected);
    if (entry.block?.selectionMode === "single") selected.clear();
    if (forceSelected || !exercise.selected.includes(id)) selected.add(id);
    else selected.delete(id);
    exercise.selected = [...selected];
    exercise.feedback = null;
    if (focusAfterRender) {
      queueStudyFocus("[data-action='choice-toggle']", {
        "data-choice-option-id": id,
        "data-choice-block-key": blockKey
      });
    }
    render({ preserveFocus: false });
    return true;
  }

  function bindActions() {
    root.querySelector("[data-action='go-back']")?.addEventListener("click", goBack);
    root.querySelectorAll("[data-action='open-settings']").forEach((node) =>
      node.addEventListener("click", () => root.dispatchEvent(new CustomEvent(
        "aralearn:open-settings", { bubbles: true }
      ))));
    root.querySelectorAll("[data-action='open-authoring']").forEach((node) =>
      node.addEventListener("click", () => root.dispatchEvent(new CustomEvent(
        "aralearn:open-authoring", { bubbles: true }
      ))));
    root.querySelectorAll("[data-action='open-course']").forEach((node) =>
      node.addEventListener("click", () => void openCourse(node.getAttribute("data-course-id"))));
    root.querySelectorAll("[data-action='open-review-item']").forEach((node) =>
      node.addEventListener("click", () => void openReviewItem([
        node.getAttribute("data-course-id"),
        node.getAttribute("data-module-id"),
        node.getAttribute("data-lesson-id"),
        node.getAttribute("data-microsequence-id"),
        node.getAttribute("data-study-unit-id")
      ])));
    root.querySelector("[data-action='load-more-review-items']")?.addEventListener(
      "click",
      () => void loadMoreReviewItems()
    );
    root.querySelectorAll("[data-action='reset-course-progress']").forEach((node) =>
      node.addEventListener("click", () => void resetCourseProgress(
        node.getAttribute("data-course-id")
      )));
    root.querySelectorAll("[data-action='reset-study-progress']").forEach((node) =>
      node.addEventListener("click", () => void resetStudyProgress(node)));
    root.querySelectorAll("[data-action='open-module']").forEach((node) =>
      node.addEventListener("click", () => openModule(node.getAttribute("data-module-id"))));
    root.querySelectorAll("[data-action='open-lesson']").forEach((node) =>
      node.addEventListener("click", () => openLesson(node.getAttribute("data-lesson-id"))));
    root.querySelectorAll("[data-action='open-microsequence']").forEach((node) =>
      node.addEventListener("click", () => openMicrosequence(
        node.getAttribute("data-microsequence-id"), 0, "overview"
      )));
    root.querySelectorAll("[data-action='open-study-unit']").forEach((node) =>
      node.addEventListener("click", () => openMicrosequence(
        node.getAttribute("data-microsequence-id"),
        Number(node.getAttribute("data-study-unit-index") || 0),
        "play"
      )));
    root.querySelector("[data-action='previous-study-unit']")?.addEventListener("click", () => void stepStudyUnit(-1));
    root.querySelector("[data-action='next-study-unit']")?.addEventListener("click", (event) => {
      runForwardStudyInteraction(event, () => void stepStudyUnit(1));
    });
    root.querySelector("[data-action='continue-feedback']")?.addEventListener("click", (event) => {
      runForwardStudyInteraction(event, () => void stepStudyUnit(1));
    });
    root.querySelector("[data-action='open-observation']")?.addEventListener(
      "click",
      () => void openObservations()
    );
    root.querySelector("[data-action='toggle-review']")?.addEventListener("click", () => void toggleReview());
    root.querySelectorAll("[data-action='toggle-citations']").forEach((node) =>
      node.addEventListener("click", () => void toggleCitations()));
    root.querySelector("[data-action='retry-citations']")?.addEventListener(
      "click",
      () => {
        state.citations = null;
        state.citationsOpen = false;
        void toggleCitations();
      }
    );

    root.querySelectorAll("[data-action='choice-toggle']").forEach((node) => {
      node.addEventListener("click", () => selectChoice(node));
      node.addEventListener("keydown", (event) => {
        if (node.getAttribute("role") !== "radio" ||
            !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
        const group = node.closest("[role='radiogroup']");
        const options = [...(group?.querySelectorAll(
          "[data-action='choice-toggle'][role='radio']"
        ) || [])];
        const currentIndex = options.indexOf(node);
        if (currentIndex < 0 || !options.length) return;
        event.preventDefault();
        const direction = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
        const next = options[(currentIndex + direction + options.length) % options.length];
        selectChoice(next, { forceSelected: true, focusAfterRender: true });
      });
    });
    root.querySelectorAll("[data-action='choice-validate'], [data-action='complete-validate']")
      .forEach((node) => node.addEventListener("click", () => validateResponse()));
    root.querySelectorAll("[data-action='choice-try-again'], [data-action='complete-try-again']")
      .forEach((node) => node.addEventListener("click", () => {
        const entry = currentResponseEntry();
        if (entry) state.responseByBlockKey[entry.blockKey] = defaultResponseState(entry);
        state.activeGapPrompt = null;
        render();
      }));
    root.querySelector("[data-action='choice-view-answer']")?.addEventListener("click", () => {
      const entry = currentResponseEntry();
      const exercise = ensureResponseState(entry);
      if (!exercise) return;
      exercise.selected = getCorrectExerciseOptionIds(entry.block?.options, entry.block?.answerIds);
      exercise.feedback = "correct";
      render();
    });
    root.querySelector("[data-action='complete-view-answer']")?.addEventListener("click", () => {
      const entry = currentResponseEntry();
      const exercise = ensureResponseState(entry);
      if (!exercise) return;
      exercise.values = (entry.block?.blanks || []).map((blank) => String(blank.answer || ""));
      exercise.feedback = "correct";
      state.activeGapPrompt = null;
      render();
    });
    root.querySelectorAll("[data-action='text-gap-open-choice']").forEach((node) => {
      const openPrompt = () => {
        state.activeGapPrompt = {
          blockKey: node.getAttribute("data-complete-block-key"),
          blankIndex: Number(node.getAttribute("data-complete-blank-index"))
        };
        render();
      };
      node.addEventListener("click", openPrompt);
      node.addEventListener("keydown", (event) => {
        if (node.getAttribute("role") !== "button" ||
            !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openPrompt();
      });
    });
    root.querySelectorAll("[data-action='text-gap-set-choice']").forEach((node) =>
      node.addEventListener("click", () => {
        const entry = currentResponseEntry();
        const exercise = ensureResponseState(entry);
        const index = Number(node.getAttribute("data-complete-blank-index"));
        if (!exercise || !Number.isInteger(index)) return;
        exercise.values[index] = node.getAttribute("data-text-gap-value") || "";
        exercise.feedback = null;
        state.activeGapPrompt = null;
        render();
      }));
    root.querySelectorAll("[data-action='ordering-move']").forEach((node) =>
      node.addEventListener("click", () => {
        const entry = currentResponseEntry();
        const exercise = ensureResponseState(entry);
        if (!exercise) return;
        const id = node.getAttribute("data-ordering-item-id");
        const index = exercise.order.indexOf(id);
        const delta = node.getAttribute("data-ordering-direction") === "left" ? -1 : 1;
        const target = index + delta;
        if (index < 0 || target < 0 || target >= exercise.order.length) return;
        [exercise.order[index], exercise.order[target]] = [exercise.order[target], exercise.order[index]];
        exercise.feedback = null;
        queueStudyFocus(".runtime-ordering-slot", { "data-ordering-item-id": id });
        render({ preserveFocus: false });
      }));
    root.querySelector("[data-action='ordering-view-answer']")?.addEventListener("click", () => {
      const entry = currentResponseEntry();
      const exercise = ensureResponseState(entry);
      if (!exercise) return;
      exercise.order = (entry.block?.targets || []).map(({ id }) => String(id));
      exercise.feedback = "correct";
      render();
    });
    root.querySelector("[data-action='ordering-try-again']")?.addEventListener("click", () => {
      const entry = currentResponseEntry();
      if (entry) state.responseByBlockKey[entry.blockKey] = defaultResponseState(entry);
      render();
    });
    root.querySelectorAll("[data-action='annotation-toggle']").forEach((node) =>
      node.addEventListener("click", () => {
        const packageRoot = node.closest(".package-instance");
        if (!packageRoot) return;
        const indexes = new Set(annotationIndexes(node));
        const shouldActivate = !node.classList.contains("is-active");
        packageRoot?.querySelectorAll("[data-action='annotation-toggle']").forEach((target) => {
          const active = shouldActivate && annotationIndexes(target)
            .some((index) => indexes.has(index));
          target.classList.toggle("is-active", active);
          target.setAttribute("aria-pressed", String(active));
        });
        if (shouldActivate && node.classList.contains("runtime-annotated-text-segment")) {
          const note = [...packageRoot.querySelectorAll(".runtime-annotated-text-note")]
            .find((target) => annotationIndexes(target).some((index) => indexes.has(index)));
          note?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
      }));

    root.querySelector(".study-reader-screen")?.addEventListener("click", (event) => {
      if (!state.feedbackOpen || typeof event.target?.closest !== "function") return;
      if (event.target.closest(".study-continue-popup") ||
          event.target.closest("[data-action='next-study-unit']") ||
          event.target.closest("[data-action='continue-feedback']")) return;
      state.feedbackOpen = false;
      render();
    });

    root.querySelector("[data-field='study-unit-observation']")?.addEventListener("input", (event) => {
      state.observationDraft.rawText = event.currentTarget.value;
      state.observationDraftTouched = true;
      const counter = root.querySelector("#study-observation-counter");
      if (counter) {
        counter.textContent = formatObservationTextBudget(state.observationDraft.rawText);
        counter.classList?.toggle(
          "is-over-limit",
          isObservationTextOverLimit(state.observationDraft.rawText)
        );
      }
    });
    root.querySelectorAll("[data-field='study-unit-observation-category']").forEach((node) =>
      node.addEventListener("change", () => {
        state.observationDraft.category = node.value || null;
        state.observationDraftTouched = true;
      }));
    root.querySelector("[data-observation-composer]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveObservation();
    });
    root.querySelectorAll("[data-observation-action]").forEach((node) =>
      node.addEventListener("click", () => {
        const action = node.dataset.observationAction;
        const annotationId = node.dataset.observationId;
        if (action === "close") {
          resetObservationSheet();
          render();
        } else if (action === "edit") {
          editObservation(annotationId);
        } else if (action === "withdraw") {
          void withdrawObservation(annotationId);
        } else if (action === "discard-failed") {
          void discardFailedObservation(annotationId);
        } else if (action === "cancel-edit") {
          state.observationEditingId = null;
          state.observationDraft = { category: null, rawText: "" };
          state.observationDraftTouched = false;
          state.observationError = "";
          render();
        }
      }));
    bindGapInputs(root);
  }

  function render({ preserveFocus = true } = {}) {
    const pendingStudyFocus = state.pendingStudyFocus;
    state.pendingStudyFocus = null;
    const preservedState = preserveFocus || pendingStudyFocus
      ? captureRenderState(root, {
          trackedScrollSelectors: [".screen-content", ".card-sheet-content"],
          includePageScroll: true,
          includeFocus: preserveFocus && !pendingStudyFocus
        })
      : null;
    const current = context();
    const summaries = repository.loadCourseSummaries?.() || [];
    const byCourseId = Object.fromEntries(state.project.courses.map((course) => {
      const summary = summaries.find((item) => item.courseId === course.id);
      return [course.id, {
        canEdit: summary?.canEdit === true,
        moduleCount: summary?.moduleCount || 0,
        lessonCount: summary?.lessonCount || 0,
        studyUnitCount: summary?.studyUnitCount || 0,
        completedStudyUnitCount: summary?.completedStudyUnitCount || 0
      }];
    }));
    const reference = state.selection.studyUnitId ? canonicalReference(state.selection) : null;
    const observationItems = reference
      ? repository.loadAnnotationsForPath?.(reference) || []
      : [];
    const repositoryRuntimeStatus =
      repository.loadRuntimeStatus?.(state.selection.courseId) || {};
    const runtimeStatus = state.connectionOffline
      ? { ...repositoryRuntimeStatus, offline: true, stale: true }
      : repositoryRuntimeStatus;
    root.innerHTML = '<div class="app-shell">' + renderCourseStudyScreen({
      project: state.project,
      view: state.view,
      selection: state.selection,
      course: current.course,
      moduleValue: current.moduleValue,
      lesson: current.lesson,
      microsequence: current.microsequence,
      studyUnit: current.studyUnit,
      microsequenceMode: state.microsequenceMode,
      progress: repository.loadProgress(),
      reviewItems: repository.loadReviewItems?.() || [],
      reviewHasMore: repository.hasMoreReviewItems?.() === true,
      runtimeStatus,
      coursePermissionsById: byCourseId,
      packageStudyUnitOptions: packageStudyUnitOptions(),
      feedbackOpen: state.feedbackOpen,
      observationCount: observationItems.filter(({ state: value }) => value !== "withdrawn").length,
      markedForReview: Boolean(reference && repository.isStudyUnitMarkedForReview(reference)),
      citationsOpen: state.citationsOpen,
      citationsLoading: state.citationsLoading,
      citations: state.citations,
      citationsError: state.citationsError
    }) + (state.observationSheetOpen ? renderStudyUnitObservationSheet({
      items: state.observationItems,
      draft: state.observationDraft,
      editingId: state.observationEditingId,
      error: state.observationError,
      saving: state.observationSaving,
      loading: state.observationLoading,
      stale: state.observationStale
    }) : "") + "</div>";
    onViewChange(state.view);
    syncAccountControl();
    bindActions();
    void RESOURCE_PACKAGE_REGISTRY.hydrate(root).then(() => bindGapInputs(root)).catch((error) => {
      root.dispatchEvent(new CustomEvent("aralearn:package-hydration-error", {
        bubbles: true,
        detail: { error }
      }));
    });
    if (preservedState) {
      restoreRenderState(root, preservedState, {
        restorePageScroll: true,
        restoreFocus: preserveFocus && !pendingStudyFocus
      });
    }
    focusStudyTarget(pendingStudyFocus);
  }

  render({ preserveFocus: false });
  globalThis.AndroidHost?.runtimeReady?.();

  return Object.freeze({
    setAccountProfile(profile) {
      state.accountProfile = profile && typeof profile === "object"
        ? { ...profile }
        : null;
      syncAccountControl();
    },
    async replaceProject(nextProject) {
      if (!nextProject || !Array.isArray(nextProject.courses)) {
        throw new TypeError("Documento de Cursos inválido.");
      }
      resetCitations();
      render();
      const previousSelection = clone(state.selection);
      const previousView = state.view;
      const previousStudyUnit = clone(context().studyUnit);
      let refreshedProject = clone(nextProject);
      if (previousView !== "courses" && previousSelection.courseId &&
          findCourse(refreshedProject, previousSelection.courseId) &&
          typeof repository.loadCourse === "function") {
        await repository.loadCourse(previousSelection.courseId);
        refreshedProject = clone(repository.loadProject());
      }
      state.project = refreshedProject;
      const retained = retainContext(state.project, previousSelection, previousView);
      state.selection = retained.selection;
      state.view = retained.view;
      if (JSON.stringify(previousStudyUnit) !== JSON.stringify(context().studyUnit)) {
        resetStudyUnitInteraction();
      }
      render();
    },
    openCourses() {
      state.view = "courses";
      render({ preserveFocus: false });
      return true;
    },
    openCourse,
    openEntityPath(entityPath) {
      return openReviewItem(entityPath);
    },
    handleBack: goBack,
    async refreshPersonalState() {
      const previousSelection = clone(state.selection);
      const previousView = state.view;
      const previousStudyUnit = clone(context().studyUnit);
      const preservedFocus = currentStudyFocusTarget();
      root.setAttribute("aria-busy", "true");
      try {
        const refreshed = await repository.refreshPersonalState();
        const nextProject = refreshed && Array.isArray(refreshed.courses)
          ? refreshed
          : repository.loadProject?.();
        if (nextProject && Array.isArray(nextProject.courses)) {
          state.project = clone(nextProject);
          const retained = retainContext(state.project, previousSelection, previousView);
          state.selection = retained.selection;
          state.view = retained.view;
        }
        state.connectionOffline =
          repository.loadRuntimeStatus?.(state.selection.courseId)?.offline === true;
        if (JSON.stringify(previousStudyUnit) !== JSON.stringify(context().studyUnit)) {
          resetStudyUnitInteraction();
        }
        state.pendingStudyFocus ||= preservedFocus;
        render();
        return clone(state.project);
      } finally {
        root.removeAttribute("aria-busy");
      }
    },
    setOfflineStatus(offline = true) {
      const preservedFocus = currentStudyFocusTarget();
      state.connectionOffline = offline === true;
      state.pendingStudyFocus ||= preservedFocus;
      render();
      return state.connectionOffline;
    },
    flushPersonalState() {
      return repository.flush();
    }
  });
}
