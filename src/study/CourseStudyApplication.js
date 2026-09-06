import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import {
  getPackageStudyUnitFeedbackEntry,
  getPackageStudyUnitResponseEntry
} from "../render/renderPackageStudyUnit.js";
import {
  formatObservationTextBudget,
  isObservationTextOverLimit,
  renderStudyUnitObservationSheet,
  revealStudyObservationControl,
  validateStudyUnitObservationText
} from "../ui/renderStudyUnitObservationSheet.js";
import { captureRenderState, restoreRenderState } from "../ui/renderState.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import { downloadTextFile } from "../ui/downloadTextFile.js";
import { serializeStudyDraftSnapshot } from "../persistence/studyDraftRecovery.js";
import { publicErrorMessage } from "../ui/publicErrorMessage.js";
import { parseCourseAuthoringRoute } from "../ui/courseAuthoringRoute.js";
import { trapAuthoringConfirmationTab } from "../ui/courseAuthoringConfirmation.js";
import { courseSourceOccurrenceTextTargets, resolveCourseSourceOccurrences } from "../domain/courseSourceOccurrences.js";
import { formatCourseSourceReference } from "../domain/courseSourceReference.js";
import { placeStudyCitationMarkers, renderStudyCitations } from "./studyCitations.js";
import { createStudyTools, openStudyResourceUrl } from "./studyTools.js";
import {
  activateManualStudyUnitEdit,
  applyManualStudyUnitEdit,
  isAmbiguousManualStudyUnitWriteFailure,
  listManualStudyUnitEditablePaths,
  listManualStudyUnitTargetIds,
  readManualStudyUnitEditPathValues
} from "../ui/manualStudyUnitEdit.js";
import { createCourseProviderAssistance } from
  "../ui/CourseProviderAssistance.js";
import { buildCourseAssistanceCompositionChange } from
  "../domain/courseAssistanceComposition.js";
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
import { renderCourseStudyScreen, renderStudyDraftRecovery, renderAuthoringEditorExitConfirmation } from "./CourseStudyScreen.js";

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

function defaultResponseState(entry) {
  return entry?.instance ? RESOURCE_PACKAGE_REGISTRY.createResponseState(entry.instance) : null;
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
  onViewChange = () => {},
  onAuthoringContextReturn = null,
  onSaveManualEdit = null,
  onSaveAssistedStructure = null,
  loadAssistanceConfiguration = null,
  providerAssistanceSession = null,
  visitor = false,
  downloadRecovery = downloadTextFile,
  downloadCitationPdf = (url) => {
    const anchor = (root?.ownerDocument || globalThis.document)?.createElement?.("a");
    if (!anchor) throw new TypeError("O navegador não oferece download de arquivos.");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.download = "fonte.pdf";
    anchor.click();
  }
} = {}) {
  if (!root || typeof root.querySelector !== "function") {
    throw new TypeError("Raiz de Estudo inválida.");
  }
  if (!repository || typeof repository.loadProgress !== "function") {
    throw new TypeError("Repositório canônico de Estudo obrigatório.");
  }
  if (!initialProject || !Array.isArray(initialProject.courses)) {
    throw new TypeError("Documento de cursos inválido.");
  }
  if (typeof downloadCitationPdf !== "function") throw new TypeError("Download de fonte inválido.");
  if (typeof downloadRecovery !== "function") throw new TypeError("Exportação de rascunho inválida.");
  if (onAuthoringContextReturn !== null && typeof onAuthoringContextReturn !== "function") throw new TypeError("Retorno contextual de Autoria inválido.");
  if (onSaveManualEdit !== null && typeof onSaveManualEdit !== "function") {
    throw new TypeError("Gravação contextual de unidade de estudo inválida.");
  }
  if (onSaveAssistedStructure !== null && typeof onSaveAssistedStructure !== "function") {
    throw new TypeError("Gravação estrutural assistida inválida.");
  }
  if (providerAssistanceSession !== null &&
      (typeof providerAssistanceSession?.read !== "function" ||
       typeof providerAssistanceSession?.update !== "function" ||
       typeof providerAssistanceSession?.snapshot !== "function")) {
    throw new TypeError("Sessão de assistência contextual inválida.");
  }

  let citationsEpoch = 0;
  let observationsEpoch = 0;
  let observationSignalVersion = 0;
  let unsubscribeAnnotations = null;
  const initialNavigation = repository.loadStudyNavigation?.() || null;
  const initialCourseId = initialProject.courses.some((course) =>
    course.id === initialNavigation?.selectedCourseId)
    ? initialNavigation.selectedCourseId
    : initialProject.courses[0]?.id || null;
  const state = {
    authoringContext: null,
    authoringExitConfirmation: false,
    authoringExitReturnState: null,
    structuralUnknown: false,
    project: clone(initialProject),
    view: "courses",
    selection: initialCourseId
      ? selectionForCourse(initialProject, initialCourseId)
      : firstSelection(initialProject),
    microsequenceMode: "play",
    responseByBlockKey: {},
    activeGapPrompt: null,
    pendingStudyFocus: null,
    feedbackOpen: false,
    advancePending: false,
    advanceError: "",
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
    citationDownloadPending: false,
    citationDownloadError: "",
    citationsReferenceKey: "",
    selectedCitationLinkId: "",
    selectedCitationOccurrenceId: "",
    formattedReferences: {},
    citationReturnState: null,
    citationReturnFocus: null,
    manualEditing: false,
    manualTargetId: "",
    manualDraft: { pathValues: {} },
    manualComposition: null,
    manualOrigin: "manual",
    manualSaving: false,
    manualError: "",
    manualStatus: "",
    manualRestoreFocus: false,
    manualUndo: [],
    manualRedo: [],
    manualHistoryPreview: null,
    manualUnknownSignature: "",
    manualDiscardArmed: false,
    manualVersionByStudyUnit: {},
    manualCourseRevisionByCourse: {},
    accountProfile: null,
    connectionOffline: globalThis.navigator?.onLine === false,
    homeLoadingCourseId: "",
    homeError: "",
    homeNotice: "",
    studyDraftRecovery: null,
    studyDraftRecoveryError: "",
    reviewQueueOpen: false,
    reviewUndo: null,
    navigationHistory: [],
    assistanceDraft: null,
    assistanceSaving: false,
    assistanceError: "",
    assistanceActiveScope: "",
    assistanceLoading: false,
    assistanceSelection: null,
    structuralEditing: false,
    structuralSelectedChildId: "",
    structuralBaselineProject: null,
    structuralSaving: false,
    structuralError: ""
  };
  let manualInlineController = null;
  let providerAssistance = null;
  let destroyed = false;
  let synchronizationState = {};
  let studyRenderGeneration = 0;
  const citationMarkerBindings = new WeakSet();
  const studyTools = createStudyTools({
    root,
    getStudyUnit: () => context().studyUnit,
    getContextKey: () => studyUnitPathKey(state.selection),
    canOpen: () => !destroyed && !state.manualEditing && !state.assistanceSelection &&
      state.view === "microsequence" && state.microsequenceMode === "play",
    onOpen: () => { closeCitations(); closeObservationSheet(); },
    getHost: async () => ({
      canRevealAnswers: context().studyUnit?.role !== "practice" || state.feedbackOpen ||
        Boolean(ensureResponseState()?.feedback),
      loadAudioConfiguration: () => repository.loadStudyAudioConfiguration(canonicalReference(state.selection)),
      downloadMedia: (media, options) => repository.downloadStudyMedia(canonicalReference(state.selection), media, options),
      openExternalUrl: (url) => openStudyResourceUrl(url, root.ownerDocument),
      openSourceAttachment: async (target) => {
        const result = await repository.getStudyInstructionalAttachmentDownload(
          canonicalReference(state.selection), target);
        downloadCitationPdf(result.signedUrl, result.attachment);
      }
    })
  });

  function setHomeNotice(message, reviewUndo = null) {
    state.homeNotice = message;
    state.reviewUndo = reviewUndo;
  }

  function updateCitationsOverlay({ focus = false } = {}) {
    const existing = root.querySelector(".study-citations-overlay");
    const previousFocus = existing?.contains(root.ownerDocument.activeElement) ? currentStudyFocusTarget() : null;
    const scrollTop = existing?.querySelector(".study-citations-body")?.scrollTop || 0;
    existing?.remove();
    const screen = root.querySelector(".app-shell > .screen");
    if (screen) {
      screen.inert = state.citationsOpen || state.observationSheetOpen || studyTools.isOpen();
      if (screen.inert) screen.setAttribute("aria-hidden", "true");
      else screen.removeAttribute("aria-hidden");
    }
    root.querySelector(".study-citations-btn")?.setAttribute("aria-expanded", String(state.citationsOpen));
    if (!state.citationsOpen) return;
    root.querySelector(".app-shell")?.insertAdjacentHTML("beforeend", renderStudyCitations({
      open: true, loading: state.citationsLoading, value: state.citations, error: state.citationsError,
      courseId: state.selection.courseId, canAuthorSources: coursePermission().ownership === "owned" && coursePermission().canEdit === true,
      downloadPending: state.citationDownloadPending, downloadError: state.citationDownloadError,
      selectedLinkId: state.selectedCitationLinkId, selectedOccurrenceId: state.selectedCitationOccurrenceId,
      formattedReferences: state.formattedReferences, studyUnit: context().studyUnit
    }));
    const overlay = root.querySelector(".study-citations-overlay");
    if (!overlay) return;
    overlay.querySelector(".study-citations-body").scrollTop = scrollTop;
    overlay.querySelector("[data-action='toggle-citations']")?.addEventListener("click", closeCitations);
    overlay.querySelector("[data-action='retry-citations']")?.addEventListener("click", () => void loadStudyCitations({ retry: true }));
    overlay.querySelectorAll("[data-action='download-citation-attachment']").forEach(node =>
      node.addEventListener("click", () => void downloadCitationAttachment(node)));
    overlay.addEventListener("click", event => { if (event.target === overlay) closeCitations(); });
    overlay.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCitations(); return; }
      if (event.key !== "Tab") return;
      const buttons = [...overlay.querySelectorAll("button:not([disabled]), a[href]")];
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && root.ownerDocument.activeElement === first) {
        event.preventDefault(); last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && root.ownerDocument.activeElement === last) {
        event.preventDefault(); first?.focus({ preventScroll: true });
      }
    });
    if (focus) overlay.querySelector("[aria-label='Fechar fontes']")?.focus({ preventScroll: true });
    else if (previousFocus) focusStudyTarget(previousFocus);
  }

  function closeCitations() {
    if (!state.citationsOpen) return false;
    state.citationsOpen = false;
    updateCitationsOverlay();
    restoreRenderState(root, state.citationReturnState, { restoreFocus: false });
    focusStudyTarget(state.citationReturnFocus || { selector: ".study-citations-btn", attributes: {} });
    return true;
  }

  function bindCitationMarkers() {
    root.querySelectorAll("[data-action='open-citation']").forEach(node => {
      if (citationMarkerBindings.has(node)) return;
      citationMarkerBindings.add(node);
      node.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        void toggleCitations(node);
      });
    });
  }

  function navigationSnapshot() {
    const scroller = root.querySelector?.(".screen-content");
    return {
      view: state.view,
      selection: clone(state.selection),
      microsequenceMode: state.microsequenceMode,
      scrollTop: Number(scroller?.scrollTop || 0),
      focusTarget: currentStudyFocusTarget()
    };
  }

  function sameNavigationSnapshot(left, right) {
    return left?.view === right?.view &&
      left?.microsequenceMode === right?.microsequenceMode &&
      JSON.stringify(left?.selection || {}) === JSON.stringify(right?.selection || {});
  }

  function pushNavigationHistory(snapshot = navigationSnapshot()) {
    const previous = state.navigationHistory.at(-1);
    if (!sameNavigationSnapshot(previous, snapshot)) {
      state.navigationHistory.push(snapshot);
      if (state.navigationHistory.length > 32) state.navigationHistory.shift();
    }
  }

  function restoreNavigationSnapshot(snapshot) {
    if (!snapshot) return false;
    const retained = retainContext(state.project, snapshot.selection, snapshot.view);
    resetStudyUnitInteraction();
    state.selection = retained.selection;
    state.view = retained.view;
    state.microsequenceMode = retained.view === "microsequence"
      ? snapshot.microsequenceMode === "play" ? "play" : "overview"
      : "play";
    persistStudyNavigation({ includePosition: state.view !== "courses" });
    if (snapshot.focusTarget?.selector) {
      queueStudyFocus(snapshot.focusTarget.selector, snapshot.focusTarget.attributes);
    } else {
      queueStudyFocus(state.view === "courses"
        ? "[data-field='home-course-select']"
        : "[data-study-destination-heading]");
    }
    render({ preserveFocus: false });
    const restoreScroll = () => {
      const scroller = root.querySelector?.(".screen-content");
      if (scroller && Number.isFinite(snapshot.scrollTop)) {
        scroller.scrollTop = Math.max(0, snapshot.scrollTop);
      }
    };
    restoreScroll();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreScroll);
    return true;
  }

  function manualStudyUnitVersionKey(courseId, studyUnitId) {
    return `${courseId}\u0000${studyUnitId}`;
  }

  function rebaseManualCompositionOverrides() {
    const summaries = repository.loadCourseSummaries?.() || [];
    const summaryByCourse = new Map(summaries.map((summary) => [
      summary.courseId,
      summary
    ]));
    for (const [key, storedVersion] of
      Object.entries(state.manualVersionByStudyUnit)) {
      const separator = key.indexOf("\u0000");
      const courseId = separator < 0 ? "" : key.slice(0, separator);
      const studyUnitId = separator < 0 ? key : key.slice(separator + 1);
      const summary = summaryByCourse.get(courseId);
      if (!summary) {
        delete state.manualVersionByStudyUnit[key];
        continue;
      }
      const persisted = repository.loadStudyUnitCompositionContext?.({
        courseId,
        studyUnitId
      });
      const storedCourseRevision = state.manualCourseRevisionByCourse[courseId];
      if (persisted && Number.isSafeInteger(persisted.courseRevision) &&
          Number.isSafeInteger(persisted.studyUnitVersion) &&
          persisted.courseRevision >= (storedCourseRevision || 0) &&
          persisted.studyUnitVersion >= storedVersion) {
        delete state.manualVersionByStudyUnit[key];
      }
    }
    for (const [courseId, storedRevision] of
      Object.entries(state.manualCourseRevisionByCourse)) {
      const canonicalRevision = Number(summaryByCourse.get(courseId)?.revision);
      if (!Number.isSafeInteger(canonicalRevision) || canonicalRevision < 1) {
        delete state.manualCourseRevisionByCourse[courseId];
        continue;
      }
      const unresolved = Object.keys(state.manualVersionByStudyUnit).some((key) =>
        key.startsWith(`${courseId}\u0000`)
      );
      if (canonicalRevision >= storedRevision && !unresolved) {
        delete state.manualCourseRevisionByCourse[courseId];
      } else if (canonicalRevision > storedRevision) {
        state.manualCourseRevisionByCourse[courseId] = canonicalRevision;
      }
    }
  }

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

  function currentNavigationPosition() {
    if (state.view === "courses" || !state.selection ||
        [
          state.selection.courseId,
          state.selection.moduleId,
          state.selection.lessonId,
          state.selection.microsequenceId,
          state.selection.studyUnitId
        ].some((value) => typeof value !== "string" || !value)) return null;
    return {
      view: state.view,
      entityPath: [
        state.selection.courseId,
        state.selection.moduleId,
        state.selection.lessonId,
        state.selection.microsequenceId,
        state.selection.studyUnitId
      ],
      microsequenceMode: state.microsequenceMode
    };
  }

  function persistStudyNavigation({ includePosition = true } = {}) {
    if (state.authoringContext) return;
    const courseId = state.selection?.courseId;
    if (!courseId || typeof repository.saveStudyNavigation !== "function") return;
    void repository.saveStudyNavigation({
      selectedCourseId: courseId,
      position: includePosition ? currentNavigationPosition() : null
    }).catch((error) => root.dispatchEvent(new CustomEvent(
      "aralearn:study-navigation-save-error",
      { bubbles: true, detail: { error } }
    )));
  }

  function syncAccountControl() {
    if (state.authoringContext) return;
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
    if (!entry) return null;
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
      if (typeof target.selectionStart === "number" &&
          typeof target.selectionEnd === "number" &&
          typeof node.setSelectionRange === "function") {
        node.setSelectionRange(target.selectionStart, target.selectionEnd);
      }
      revealStudyObservationControl(node);
    };
    focus();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
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
      sourceTextTargets: courseSourceOccurrenceTextTargets(context().studyUnit,
        (state.citations?.citations || []).flatMap(citation => citation.occurrences || [])),
      exerciseShuffleSeed: `${studyUnitPathKey(state.selection)}::study`
    };
  }

  function resetCitations() {
    studyTools.close({ restore: false });
    ++citationsEpoch;
    state.citationsOpen = false;
    state.citationsLoading = false;
    state.citations = null;
    state.citationsError = "";
    state.citationDownloadPending = false;
    state.citationDownloadError = "";
    state.citationsReferenceKey = "";
    state.selectedCitationLinkId = "";
    state.selectedCitationOccurrenceId = "";
    state.formattedReferences = {};
    state.citationReturnState = null;
    state.citationReturnFocus = null;
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

  function closeObservationSheet() {
    if (!state.observationSheetOpen) return false;
    resetObservationSheet();
    queueStudyFocus("[data-action='open-observation']");
    render({ preserveFocus: false });
    return true;
  }

  function restoreManualHistoryPreview() {
    const preview = state.manualHistoryPreview;
    if (!preview) return;
    const source = preview.direction === "undo" ? state.manualRedo : state.manualUndo;
    const destination = preview.direction === "undo" ? state.manualUndo : state.manualRedo;
    const sourceIndex = source.lastIndexOf(preview.entry);
    if (sourceIndex >= 0) {
      source.splice(sourceIndex, 1);
      destination.push(preview.entry);
    }
    state.manualHistoryPreview = null;
  }

  function manualHistoryIndex(entries, courseId, studyUnitId) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.courseId === courseId && entry.studyUnitId === studyUnitId) return index;
    }
    return -1;
  }

  function resetManualEditorState({ status = "", keepHistoryPreview = false } = {}) {
    if (keepHistoryPreview) state.manualHistoryPreview = null;
    else restoreManualHistoryPreview();
    manualInlineController?.destroy?.();
    manualInlineController = null;
    state.manualEditing = false;
    state.manualTargetId = "";
    state.manualDraft = { pathValues: {} };
    state.manualOrigin = "manual";
    state.manualComposition = null;
    state.manualSaving = false;
    state.manualError = "";
    state.manualStatus = status;
    state.manualRestoreFocus = false;
    state.manualUnknownSignature = "";
    state.manualDiscardArmed = false;
  }

  function resetStudyUnitInteraction() {
    const entry = currentResponseEntry();
    if (entry && state.responseByBlockKey[entry.blockKey]) {
      state.responseByBlockKey[entry.blockKey].feedback = null;
    }
    state.activeGapPrompt = null;
    state.pendingStudyFocus = null;
    state.feedbackOpen = false;
    state.advancePending = false;
    state.advanceError = "";
    resetManualEditorState();
    resetCitations();
    resetObservationSheet();
  }

  function reconcileProjectAfterRevocation() {
    const nextProject = repository.loadProject?.();
    if (!nextProject || !Array.isArray(nextProject.courses)) return false;
    const revokedTitle = context().course?.title || "o curso selecionado";
    const previousCourseId = state.selection.courseId;
    const retained = retainContext(nextProject, state.selection, state.view);
    state.project = clone(nextProject);
    state.selection = retained.selection;
    state.view = retained.view;
    if (previousCourseId && !findCourse(nextProject, previousCourseId)) {
      setHomeNotice(`Seu acesso a ${revokedTitle} foi encerrado.`);
      state.homeError = "";
      persistStudyNavigation({ includePosition: false });
    }
    rebaseManualCompositionOverrides();
    resetStudyUnitInteraction();
    if (previousCourseId && !findCourse(nextProject, previousCourseId) &&
        nextProject.courses.length) {
      queueStudyFocus("[data-field='home-course-select']");
    }
    render({ preserveFocus: false });
    return true;
  }

  async function toggleCitations(node = null) {
    if (state.citationsOpen) return closeCitations();
    const reference = canonicalReference(state.selection);
    if (!reference || typeof repository.loadStudyUnitCitations !== "function") return false;
    state.selectedCitationLinkId = node?.dataset?.citationLinkId || "";
    state.selectedCitationOccurrenceId = node?.dataset?.citationOccurrenceId || "";
    state.citationReturnState = captureRenderState(root);
    state.citationReturnFocus = node?.dataset?.citationLinkId ? {
      selector: "[data-action='open-citation']", attributes: {
        "data-citation-link-id": node.dataset.citationLinkId,
        "data-citation-occurrence-id": node.dataset.citationOccurrenceId || ""
      }
    } : currentStudyFocusTarget();
    state.citationsOpen = true;
    state.citationDownloadError = "";
    updateCitationsOverlay({ focus: true });
    await loadStudyCitations();
    return true;
  }

  async function loadStudyCitations({ retry = false } = {}) {
    const reference = canonicalReference(state.selection);
    if (!reference || destroyed || !root.querySelector(".study-reader-screen") ||
        typeof repository.loadStudyUnitCitations !== "function") return false;
    const key = studyUnitPathKey(state.selection);
    if (!retry && state.citationsReferenceKey === key) return true;
    const epoch = ++citationsEpoch;
    state.citationsReferenceKey = key;
    state.citationsLoading = true;
    state.citationsError = "";
    updateCitationsOverlay();
    try {
      const result = await repository.loadStudyUnitCitations(reference);
      if (epoch !== citationsEpoch || destroyed) return false;
      state.citations = { ...result, citations: result.citations.map(citation => ({
        ...citation, occurrences: resolveCourseSourceOccurrences(context().studyUnit,
          (citation.occurrences || []).map(occurrence => Object.fromEntries(
            Object.entries(occurrence).filter(([field]) => field !== "status"))))
      })) };
      state.citationsLoading = false;
      render();
      const formatted = await Promise.all(state.citations.citations.map(async citation => {
        try { return [citation.linkId, await formatCourseSourceReference(citation, { style: result.bibliographyStyle })]; }
        catch { return [citation.linkId, { text: citation.citationMode === "manual" ? citation.citationText : "Não foi possível preparar esta referência. Consulte a fonte.", runs: [] }]; }
      }));
      if (epoch !== citationsEpoch || destroyed) return false;
      state.formattedReferences = Object.fromEntries(formatted);
      updateCitationsOverlay();
      return true;
    } catch (error) {
      if (epoch !== citationsEpoch || destroyed) return false;
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) return false;
      const code = String(error?.code || "").toLowerCase();
      state.citationsError = code === "course_revision_changed"
        ? "O curso mudou. Reabra esta unidade de estudo para consultar as fontes atuais."
        : /offline|network|failed to fetch|connection/iu.test(`${code} ${error?.message || ""}`)
          ? "Sem conexão para consultar as fontes desta unidade de estudo."
          : "Não foi possível consultar as fontes desta unidade de estudo.";
      return false;
    } finally {
      if (epoch === citationsEpoch && !destroyed) {
        state.citationsLoading = false;
        updateCitationsOverlay();
      }
    }
  }

  async function downloadCitationAttachment(node) {
    if (state.citationDownloadPending || !state.citationsOpen ||
        typeof repository.getStudyCitationAttachmentDownload !== "function") return false;
    const citationIndex = Number(node.dataset.citationIndex);
    const attachmentIndex = Number(node.dataset.attachmentIndex);
    if (!Number.isSafeInteger(citationIndex) || citationIndex < 0 ||
        !Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0) return false;
    const citation = state.citations?.citations?.[citationIndex];
    const attachment = citation?.attachments?.[attachmentIndex];
    if (!attachment) return false;
    const epoch = citationsEpoch;
    state.citationDownloadPending = true;
    state.citationDownloadError = "";
    updateCitationsOverlay();
    try {
      const result = await repository.getStudyCitationAttachmentDownload(canonicalReference(state.selection), {
        courseRevision: state.citations.courseRevision, sourceId: citation.sourceId,
        sourceRevision: citation.sourceRevision, attachment: clone(attachment)
      });
      if (epoch !== citationsEpoch || destroyed) return false;
      const url = new URL(result.signedUrl);
      const localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost", "10.0.2.2"].includes(url.hostname);
      if (url.protocol !== "https:" && !localHttp || url.username || url.password) throw new TypeError("URL do PDF inválida.");
      const page = Number(node.dataset.citationPage);
      if (Number.isSafeInteger(page) && page > 0 && page <= 1_000_000) url.hash = `page=${page}`;
      downloadCitationPdf(url.href, attachment);
      return true;
    } catch (error) {
      if (epoch !== citationsEpoch || destroyed) return false;
      state.citationDownloadError = publicErrorMessage(error, "Não foi possível baixar este PDF.", {
        conflict: "O curso mudou. Reabra a unidade para consultar os PDFs atuais.",
        network: "Sem conexão para baixar este PDF."
      });
      return false;
    } finally {
      if (epoch === citationsEpoch && !destroyed) {
        state.citationDownloadPending = false;
        updateCitationsOverlay();
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
      await (repository.loadCourseById?.(courseId) ?? repository.loadCourse(courseId));
      state.project = clone(repository.loadProject());
      rebaseManualCompositionOverrides();
      return true;
    } catch (error) {
      root.dispatchEvent(new CustomEvent("aralearn:course-load-error", {
        bubbles: true,
        detail: { courseId, error }
      }));
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) {
        return false;
      }
      state.homeError = state.connectionOffline ||
        repository.loadRuntimeStatus?.(courseId)?.offline === true
        ? "Este curso ainda não está disponível neste dispositivo. Conecte-se para abri-lo pela primeira vez."
        : courseAccessWasRevoked(error)
          ? "Seu acesso a este curso foi encerrado."
          : "Não foi possível abrir este curso. Tente novamente.";
      return false;
    } finally {
      root.setAttribute("aria-busy", "false");
    }
  }

  async function openCourse(courseId) {
    if (state.homeLoadingCourseId) return false;
    const origin = {
      ...navigationSnapshot(),
      focusTarget: {
        selector: "[data-action='open-course']",
        attributes: { "data-course-id": courseId }
      }
    };
    state.homeLoadingCourseId = courseId;
    state.homeError = "";
    setHomeNotice("");
    render();
    try {
      if (!await ensureCourseLoaded(courseId)) {
        state.homeLoadingCourseId = "";
        if (state.homeError && findCourse(state.project, courseId)) {
          queueStudyFocus("[data-action='open-course']", {
            "data-course-id": courseId
          });
        }
        render();
        return false;
      }
      const selection = selectionForCourse(state.project, courseId);
      if (!selection) return false;
      resetStudyUnitInteraction();
      pushNavigationHistory(origin);
      state.selection = selection;
      state.view = "course";
      state.microsequenceMode = "play";
      state.homeLoadingCourseId = "";
      persistStudyNavigation();
      queueStudyFocus("[data-study-destination-heading]");
      render({ preserveFocus: false });
      return true;
    } finally {
      if (state.homeLoadingCourseId === courseId) {
        state.homeLoadingCourseId = "";
        render();
      }
    }
  }

  async function selectHomeCourse(courseId) {
    const selection = selectionForCourse(state.project, courseId);
    if (!selection || state.homeLoadingCourseId) return false;
    state.selection = selection;
    state.homeError = "";
    setHomeNotice("");
    state.reviewQueueOpen = false;
    persistStudyNavigation({ includePosition: false });
    render();
    if (typeof repository.refreshCourseOfflineAvailability === "function") {
      await repository.refreshCourseOfflineAvailability(courseId);
      if (state.view === "courses" && state.selection.courseId === courseId) render();
    }
    return true;
  }

  function openModule(moduleId) {
    if (state.structuralEditing) {
      state.structuralError = "Salve ou cancele a edição antes de abrir um módulo.";
      render();
      return false;
    }
    const selection = selectionForModule(state.project, state.selection, moduleId);
    if (!selection) return false;
    pushNavigationHistory();
    state.selection = selection;
    state.view = "module";
    persistStudyNavigation();
    render({ preserveFocus: false });
    return true;
  }

  function openLesson(lessonId) {
    if (state.structuralEditing) {
      state.structuralError = "Salve ou cancele a edição antes de abrir uma lição.";
      render();
      return false;
    }
    const selection = selectionForLesson(state.project, state.selection, lessonId);
    if (!selection) return false;
    pushNavigationHistory();
    state.selection = selection;
    state.view = "lesson";
    persistStudyNavigation();
    render({ preserveFocus: false });
    return true;
  }

  function openMicrosequence(microsequenceId, studyUnitIndex = 0, mode = "overview") {
    if (state.structuralEditing) {
      state.structuralError = "Salve ou cancele a edição antes de continuar.";
      render();
      return false;
    }
    const origin = navigationSnapshot();
    if (!selectMicrosequence(microsequenceId, studyUnitIndex)) return false;
    pushNavigationHistory(origin);
    state.view = "microsequence";
    state.microsequenceMode = mode === "play" ? "play" : "overview";
    persistStudyNavigation();
    render({ preserveFocus: false });
    return true;
  }

  function openLessonStudyUnit(entry, {
    focusDestination = false,
    recordHistory = true
  } = {}) {
    if (!entry) return false;
    if (recordHistory) pushNavigationHistory();
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
    persistStudyNavigation();
    if (focusDestination) queueStudyFocus("[data-study-destination-heading]");
    render({ preserveFocus: false });
    return true;
  }

  async function openReviewItem(entityPath) {
    setHomeNotice("");
    if (!await ensureCourseLoaded(entityPath?.[0])) {
      if (state.view === "courses" && state.homeError) {
        queueStudyFocus(".study-review-queue > summary");
        render({ preserveFocus: false });
      }
      return false;
    }
    const selection = exactStudyUnitSelection(state.project, entityPath);
    return selection ? openLessonStudyUnit(selection, { focusDestination: true }) : false;
  }

  async function removeReviewItem(entityPath, title = "Unidade de estudo") {
    if (!Array.isArray(entityPath) || entityPath.length !== 5) return false;
    const reference = {
      courseId: entityPath[0],
      moduleId: entityPath[1],
      lessonId: entityPath[2],
      microsequenceId: entityPath[3],
      studyUnitId: entityPath[4]
    };
    setHomeNotice("");
    try {
      await repository.setStudyUnitReviewMark(reference, false);
      setHomeNotice("Marca de Rever retirada.", { reference, title });
      state.homeError = "";
      queueStudyFocus("[data-action='undo-review-removal']");
      render({ preserveFocus: false });
      return true;
    } catch (error) {
      state.homeError = publicErrorMessage(error, "Não foi possível retirar a marca de Rever.");
      queueStudyFocus("[data-action='remove-review-item']", {
        "data-course-id": reference.courseId,
        "data-module-id": reference.moduleId,
        "data-lesson-id": reference.lessonId,
        "data-microsequence-id": reference.microsequenceId,
        "data-study-unit-id": reference.studyUnitId
      });
      render({ preserveFocus: false });
      return false;
    }
  }

  async function undoReviewRemoval() {
    const pending = state.reviewUndo;
    if (!pending) return false;
    try {
      await repository.setStudyUnitReviewMark(pending.reference, true);
      setHomeNotice(`${pending.title} voltou para Rever.`);
      state.homeError = "";
      queueStudyFocus(".study-review-queue > summary");
      render({ preserveFocus: false });
      return true;
    } catch (error) {
      state.homeError = publicErrorMessage(error, "Não foi possível restaurar a marca de Rever.");
      queueStudyFocus("[data-action='undo-review-removal']");
      render({ preserveFocus: false });
      return false;
    }
  }

  async function openCanonicalEntityPath(entityPath, { editing = false, authoringContext = null } = {}) {
    if (!Array.isArray(entityPath) || entityPath.length < 1 || entityPath.length > 5 ||
        entityPath.some((identity) => typeof identity !== "string" || !identity)) {
      return false;
    }
    if (state.manualEditing || state.manualSaving || state.structuralEditing ||
        state.structuralSaving || providerAssistance?.opened) return false;
    const previousNavigation = navigationSnapshot();
    const previousHistory = clone(state.navigationHistory);
    const returnRoute = authoringContext && parseCourseAuthoringRoute(authoringContext.returnRoute);
    if (authoringContext && (!editing || !onAuthoringContextReturn || returnRoute?.courseId !== entityPath[0])) return false;
    if (!await ensureCourseLoaded(entityPath[0])) return false;
    const permission = coursePermission(entityPath[0]);
    if (authoringContext && (visitor || permission?.ownership !== "owned" || permission.canEdit !== true)) return false;
    let selection = selectionForCourse(state.project, entityPath[0]);
    let view = "course";
    let microsequenceMode = "play";
    if (entityPath.length >= 2) {
      selection = selectionForModule(state.project, selection, entityPath[1]);
      view = "module";
    }
    if (entityPath.length >= 3 && selection) {
      selection = selectionForLesson(state.project, selection, entityPath[2]);
      view = "lesson";
    }
    if (entityPath.length === 4 && selection) {
      selection = selectionForMicrosequence(state.project, selection, entityPath[3]);
      view = "microsequence";
      microsequenceMode = "overview";
    }
    if (entityPath.length === 5) {
      selection = exactStudyUnitSelection(state.project, entityPath);
      view = "microsequence";
      microsequenceMode = "play";
    }
    if (!selection) return false;
    state.authoringContext = authoringContext ? {
      returnRoute: authoringContext.returnRoute, courseId: entityPath[0],
      previousNavigation, previousHistory
    } : null;
    state.navigationHistory = [];
    state.selection = selection;
    state.view = view;
    state.microsequenceMode = microsequenceMode;
    resetStudyUnitInteraction();
    persistStudyNavigation();
    if (editing) {
      const opened = entityPath.length === 5 ? beginManualEdit() : beginStructuralEdit();
      if (!opened && state.authoringContext) {
        state.authoringContext = null;
        state.selection = previousNavigation.selection;
        state.view = previousNavigation.view;
        state.microsequenceMode = previousNavigation.microsequenceMode;
        state.navigationHistory = previousHistory;
        render({ preserveFocus: false, captureDraft: false });
      }
      return opened;
    }
    queueStudyFocus("[data-study-destination-heading]");
    render({ preserveFocus: false });
    return true;
  }

  async function resetCourseProgress(courseId) {
    if (!courseId || typeof repository.clearCourseProgress !== "function") return false;
    const course = findCourse(state.project, courseId);
    const accepted = typeof globalThis.confirm !== "function" || globalThis.confirm(
      `Zerar o progresso de ${course?.title || "este curso"}?`
    );
    if (!accepted) return false;
    if (!await ensureCourseLoaded(courseId)) {
      if (state.view === "courses" && state.homeError) {
        queueStudyFocus("[data-action='course-lifecycle-menu']", {
          "data-course-id": courseId
        });
        render({ preserveFocus: false });
      }
      return false;
    }
    try {
      await repository.clearCourseProgress(courseId);
    } catch (error) {
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) return false;
      state.homeError = "Não foi possível zerar o progresso. Tente novamente.";
      queueStudyFocus("[data-action='course-lifecycle-menu']", {
        "data-course-id": courseId
      });
      render({ preserveFocus: false });
      return false;
    }
    await repository.clearStudyNavigationPosition?.(courseId);
    render({ preserveFocus: false });
    return true;
  }

  async function resetStudyProgress(node) {
    if (typeof repository.clearProgressScope !== "function") return false;
    const level = node?.getAttribute("data-reset-level") || "";
    const labels = {
      module: "este módulo",
      lesson: "esta lição",
      microsequence: "esta microssequência didática",
      "study-unit": "esta unidade de estudo e as seguintes na lição"
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
    const requestedCourseId = state.selection.courseId;
    const requestedQueue = root.querySelector(".study-review-queue");
    root.setAttribute("aria-busy", "true");
    try {
      await repository.loadMoreReviewItems();
      if (state.view !== "courses") return true;
      if (state.selection.courseId !== requestedCourseId) {
        render();
        return true;
      }
      const currentQueue = root.querySelector(".study-review-queue");
      if (currentQueue === requestedQueue) {
        state.reviewQueueOpen = currentQueue.open === true;
      }
      const reviewHasMore = repository.hasMoreReviewItems?.() === true;
      const queueRemains = reviewHasMore || (repository.loadReviewItems?.() || [])
        .some((item) => Array.isArray(item?.entityPath) &&
          item.entityPath[0] === requestedCourseId);
      queueStudyFocus(!queueRemains
        ? "[data-field='home-course-select']"
        : state.reviewQueueOpen && reviewHasMore
          ? "[data-action='load-more-review-items']"
          : ".study-review-queue > summary");
      render({ preserveFocus: false });
      return true;
    } finally {
      root.setAttribute("aria-busy", "false");
    }
  }

  function coursePermission(courseId = state.selection.courseId) {
    return (repository.loadCourseSummaries?.() || [])
      .find((item) => item.courseId === courseId) || null;
  }

  function manualEditCapability() {
    const summary = coursePermission();
    return Boolean(
      !visitor && onSaveManualEdit && summary?.ownership === "owned" && summary.canEdit === true &&
      state.view === "microsequence" && state.microsequenceMode === "play" && context().studyUnit
    );
  }

  function captureManualDraft() {
    if (!state.manualEditing || !state.manualTargetId) return;
    if (state.manualTargetId === "study_unit") {
      const title = root.querySelector?.("[data-study-manual-title]");
      if (title) state.manualDraft.pathValues.title = title.textContent || "";
      return;
    }
    const container = root.querySelector?.(".runtime-resource-edit-target.is-inline-editing");
    if (container) state.manualDraft.pathValues = readManualStudyUnitEditPathValues(container);
  }

  function placeManualCaretAtEnd(field) {
    const selection = field?.ownerDocument?.getSelection?.();
    if (!selection || !field?.ownerDocument?.createRange) return;
    const range = field.ownerDocument.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function activateManualEditing() {
    manualInlineController?.destroy?.();
    manualInlineController = null;
    if (!state.manualEditing || !state.manualTargetId) return;
    if (state.manualTargetId === "study_unit") {
      const title = root.querySelector?.("[data-study-manual-title]");
      if (state.manualRestoreFocus) {
        title?.focus?.({ preventScroll: true });
        placeManualCaretAtEnd(title);
        state.manualRestoreFocus = false;
      }
      return;
    }
    const container = root.querySelector?.(".runtime-resource-edit-target.is-inline-editing");
    if (!container) return;
    manualInlineController = activateManualStudyUnitEdit(container, state.manualDraft);
    if (state.manualRestoreFocus) {
      const field = manualInlineController?.fields?.[0];
      field?.focus?.({ preventScroll: true });
      placeManualCaretAtEnd(field);
      state.manualRestoreFocus = false;
    }
  }

  function manualDraftChanged() {
    const studyUnit = context().studyUnit;
    if (!state.manualEditing || !studyUnit || !state.manualTargetId) return false;
    captureManualDraft();
    const original = new Map(
      listManualStudyUnitEditablePaths(studyUnit, state.manualTargetId)
        .map(({ path, value }) => [path, value])
    );
    return Object.entries(state.manualDraft.pathValues)
      .some(([path, value]) => original.has(path) && original.get(path) !== value);
  }

  function manualAttemptSignature(targetId, studyUnit, origin) {
    return JSON.stringify({ targetId, studyUnit, origin });
  }

  async function resumeStudyDraftRecovery() {
    if (visitor || typeof repository.loadStudyDraftRecovery !== "function") return false;
    const pending = await repository.loadStudyDraftRecovery();
    if (!pending) return false;
    state.studyDraftRecovery = { pending, status: "unresolved", targetCourseId: null };
    if (globalThis.navigator?.onLine !== false) {
      try {
        const result = await repository.recoverStudyDraft?.(pending.sourceCourseId, pending.recoveryId);
        if (result) state.studyDraftRecovery = { ...result, pending };
        if (result?.project) state.project = clone(result.project);
      } catch {
        state.studyDraftRecoveryError = "A confirmação ainda não está disponível. O rascunho continua guardado neste dispositivo.";
      }
    }
    render({ preserveFocus: true, captureDraft: false });
    return true;
  }

  async function discardStudyDraftRecovery() {
    const pending = state.studyDraftRecovery?.pending;
    if (!pending) return false;
    try {
      const cleared = await repository.clearStudyDraftRecovery?.(pending.sourceCourseId, pending.requestId, pending.recoveryId);
      if (!cleared) {
        state.studyDraftRecoveryError = "O rascunho guardado mudou. Reabra esta área antes de descartá-lo.";
        render();
        return false;
      }
      state.studyDraftRecovery = null;
      state.studyDraftRecoveryError = "";
      setHomeNotice("");
    } catch {
      state.studyDraftRecoveryError = "Não foi possível descartar o rascunho. Ele continua guardado.";
      render();
      return false;
    }
    try {
      if (await resumeStudyDraftRecovery()) return true;
      setHomeNotice("Rascunho guardado descartado.");
    } catch {
      setHomeNotice("Rascunho descartado. Não foi possível ler os demais; reabra esta área para recuperá-los.");
    }
    render();
    return true;
  }

  async function exportStudyDraftRecovery() {
    const pending = state.studyDraftRecovery?.pending;
    if (!pending) return false;
    try {
      const content = serializeStudyDraftSnapshot(pending.originalSnapshot);
      await downloadRecovery({ name: "aralearn-rascunho-guardado.json", type: "application/json;charset=utf-8", content });
      return true;
    } catch (error) {
      state.studyDraftRecoveryError = error?.code === "DRAFT_EXPORT_FORMAT_UNSUPPORTED"
        ? error.message
        : "Não foi possível exportar o rascunho. Ele continua guardado; tente novamente.";
      render();
      return false;
    }
  }

  function beginManualEdit(targetId = "study_unit", {
    pathValues = {},
    origin = "manual",
    restoreFocus = true,
    status = ""
  } = {}) {
    const studyUnit = context().studyUnit;
    if (!manualEditCapability() || state.manualSaving || !studyUnit) return false;
    if (targetId !== "study_unit" &&
        !listManualStudyUnitTargetIds(studyUnit).includes(targetId)) return false;
    const composition = manualCompositionContext();
    state.assistanceSelection = null;
    state.assistanceActiveScope = "";
    state.manualEditing = true;
    state.manualTargetId = targetId;
    state.manualDraft = { pathValues: clone(pathValues) };
    state.manualComposition = clone(composition);
    state.manualOrigin = origin;
    state.manualError = "";
    state.manualStatus = status;
    state.manualRestoreFocus = restoreFocus;
    state.feedbackOpen = false;
    if (state.citationsOpen) closeCitations();
    queueStudyFocus("[data-action='study-manual-edit']");
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function previewManualDraft({
    targetId,
    pathValues,
    origin = "provider_assistance",
    restoreFocus = true
  } = {}) {
    if (!new Set(["manual", "provider_assistance"]).has(origin) ||
        !pathValues || typeof pathValues !== "object" || Array.isArray(pathValues)) {
      throw new TypeError("O rascunho contextual de edição é inválido.");
    }
    const current = context().studyUnit;
    if (!manualEditCapability() || !current || !targetId) {
      throw new Error("A edição contextual não está disponível nesta unidade de estudo.");
    }
    applyManualStudyUnitEdit(current, targetId, { pathValues });
    return beginManualEdit(targetId, { pathValues, origin, restoreFocus });
  }

  function ensureProviderAssistance() {
    if (providerAssistance) return providerAssistance;
    providerAssistance = createCourseProviderAssistance({
      documentValue: root.ownerDocument || globalThis.document,
      windowValue: root.ownerDocument?.defaultView || globalThis.window,
      session: providerAssistanceSession
    });
    return providerAssistance;
  }

  function studyProviderTriggerAction(scope) {
    return scope === "lesson"
      ? "open-lesson-assistance"
      : scope === "didactic_microsequence"
        ? "open-microsequence-assistance"
        : "study-provider-assistance";
  }

  function studyProviderTriggerFocus(scope) {
    const action = studyProviderTriggerAction(scope);
    return Object.freeze({
      focus(options) {
        const focus = () => root.querySelector?.(`[data-action='${action}']`)
          ?.focus?.(options);
        focus();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
        root.ownerDocument?.defaultView?.setTimeout?.(focus, 0);
      }
    });
  }

  async function maintainCourseFromHome(courseId, operation) {
    if (!courseId || state.homeLoadingCourseId ||
        typeof repository.maintainCourse !== "function") return false;
    const course = findCourse(state.project, courseId);
    if (!course) return false;
    const owned = operation === "delete_owned_course";
    const prompt = owned
      ? `Excluir definitivamente ${course.title || "este curso"}? Esta ação também remove os dados compartilhados do curso.`
      : `Sair de ${course.title || "este curso"}? Seu acesso compartilhado será encerrado.`;
    if (typeof globalThis.confirm === "function" && !globalThis.confirm(prompt)) return false;
    state.homeLoadingCourseId = courseId;
    state.homeError = "";
    setHomeNotice("");
    render();
    try {
      await repository.maintainCourse({
        courseId,
        operation,
        confirmed: true,
        requestId: globalThis.crypto?.randomUUID?.() ||
          `course-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`
      });
      state.project = repository.loadProject();
      const nextCourseId = state.project.courses[0]?.id || null;
      state.selection = nextCourseId
        ? selectionForCourse(state.project, nextCourseId)
        : firstSelection(state.project);
      state.navigationHistory = [];
      state.homeLoadingCourseId = "";
      setHomeNotice(owned
        ? `${course.title || "O curso"} foi excluído.`
        : `Seu acesso a ${course.title || "o curso"} foi encerrado.`);
      if (nextCourseId) persistStudyNavigation({ includePosition: false });
      queueStudyFocus(nextCourseId
        ? "[data-field='home-course-select']"
        : "[data-action='open-authoring']");
      render({ preserveFocus: false });
      return true;
    } catch (error) {
      state.homeLoadingCourseId = "";
      state.homeError = publicErrorMessage(error, "Não foi possível concluir a ação deste curso.");
      queueStudyFocus("[data-action='course-lifecycle-menu']", {
        "data-course-id": courseId
      });
      render({ preserveFocus: false });
      return false;
    }
  }

  function assistanceCapability(scope) {
    const permission = coursePermission();
    if (scope === "study_unit") return manualEditCapability();
    return Boolean(
      !visitor && onSaveAssistedStructure && permission?.ownership === "owned" && permission.canEdit === true
    );
  }

  function structuralScope() {
    if (state.view === "course") return "course";
    if (state.view === "module") return "module";
    if (state.view === "lesson") return "lesson";
    if (state.view === "microsequence" && state.microsequenceMode === "overview") {
      return "didactic_microsequence";
    }
    return "";
  }

  function structuralEditCapability() {
    const permission = coursePermission();
    return Boolean(
      !visitor && structuralScope() && onSaveAssistedStructure &&
      permission?.ownership === "owned" && permission.canEdit === true
    );
  }

  function structuralTarget(scope = structuralScope(), current = context()) {
    if (scope === "course") {
      return { target: current.course, children: current.course?.modules || [] };
    }
    if (scope === "module") {
      return { target: current.moduleValue, children: current.moduleValue?.lessons || [] };
    }
    if (scope === "lesson") {
      return { target: current.lesson, children: current.lesson?.microsequences || [] };
    }
    if (scope === "didactic_microsequence") {
      return { target: current.microsequence, children: current.microsequence?.studyUnits || [] };
    }
    return { target: null, children: [] };
  }

  function resetStructuralEditor({ restoreBaseline = false } = {}) {
    if (restoreBaseline && state.structuralBaselineProject) {
      const previousSelection = clone(state.selection);
      const previousView = state.view;
      state.project = clone(state.structuralBaselineProject);
      const retained = retainContext(state.project, previousSelection, previousView);
      state.selection = retained.selection;
      state.view = retained.view;
    }
    state.structuralEditing = false;
    state.structuralSelectedChildId = "";
    state.structuralBaselineProject = null;
    state.structuralSaving = false;
    state.structuralError = "";
  }

  function beginStructuralEdit() {
    if (!structuralEditCapability() || state.structuralSaving || state.assistanceDraft ||
        providerAssistance?.opened) return false;
    state.assistanceSelection = null;
    state.assistanceActiveScope = "";
    state.structuralBaselineProject = clone(state.project);
    state.structuralEditing = true;
    state.structuralSelectedChildId = structuralTarget().children[0]?.id || "";
    state.structuralError = "";
    state.structuralUnknown = false;
    queueStudyFocus(state.authoringContext ? "[data-study-structure-field='title']" : "[data-action='study-level-edit']");
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function cancelStructuralEdit({
    status = "Edição cancelada.",
    focusSelector = "[data-action='study-level-edit']"
  } = {}) {
    if (!state.structuralEditing || state.structuralSaving) return false;
    if (state.authoringContext && state.structuralUnknown) return requestAuthoringContextExit();
    resetStructuralEditor({ restoreBaseline: true });
    if (state.authoringContext) return finishAuthoringContext("cancelled");
    state.manualStatus = status;
    queueStudyFocus(focusSelector);
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function updateStructuralField(field, value) {
    if (!state.structuralEditing || state.structuralSaving ||
        !new Set(["title", "goal"]).has(field)) return false;
    const scope = structuralScope();
    const { target } = structuralTarget(scope);
    if (!target) return false;
    if (field === "title") target.title = value;
    else if (scope === "course" || scope === "didactic_microsequence") target.goal = value;
    else target.guide = { ...(target.guide || {}), goal: value };
    state.structuralError = "";
    return true;
  }

  function moveStructuralChild(childId, direction) {
    if (!state.structuralEditing || state.structuralSaving) return false;
    const { children } = structuralTarget();
    const index = children.findIndex(({ id }) => id === childId);
    const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const targetIndex = index + delta;
    if (index < 0 || !delta || targetIndex < 0 || targetIndex >= children.length) return false;
    [children[index], children[targetIndex]] = [children[targetIndex], children[index]];
    if (structuralScope() === "didactic_microsequence") {
      children.forEach((studyUnit, position) => { studyUnit.position = position + 1; });
    }
    queueStudyFocus("[data-action='move-study-structure-child']", {
      "data-child-id": childId,
      "data-direction": direction
    });
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function currentCourseRevision(courseId = state.selection.courseId) {
    const summary = coursePermission(courseId);
    const values = [
      state.manualCourseRevisionByCourse[courseId],
      summary?.revision
    ].filter((value) => Number.isSafeInteger(Number(value)) && Number(value) >= 1)
      .map(Number);
    if (!values.length) {
      throw new Error("A versão canônica deste curso não está disponível para edição.");
    }
    return Math.max(...values);
  }

  async function saveStructuralEdit() {
    if (!state.structuralEditing || state.structuralSaving ||
        !state.structuralBaselineProject || !structuralEditCapability()) return false;
    const scope = structuralScope();
    const { target } = structuralTarget(scope);
    if (!target) return false;
    const title = String(target.title || "").trim();
    const goal = String(scope === "course" || scope === "didactic_microsequence"
      ? target.goal || ""
      : target.guide?.goal || "").trim();
    if (!title || !goal) {
      state.structuralError = "Título e objetivo são obrigatórios.";
      queueStudyFocus(`[data-study-structure-field='${!title ? "title" : "goal"}']`);
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
    target.title = title;
    if (scope === "course" || scope === "didactic_microsequence") target.goal = goal;
    else target.guide.goal = goal;
    const baselineProject = clone(state.structuralBaselineProject);
    const proposedProject = clone(state.project);
    const selection = clone(state.selection);
    let change;
    try {
      change = buildCourseAssistanceCompositionChange({
        originalProject: baselineProject,
        proposedProject,
        selection,
        scope
      });
    } catch (error) {
      state.structuralError = publicErrorMessage(
        error,
        "A edição não satisfaz o formato deste curso."
      );
      queueStudyFocus("[data-action='save-study-structure']");
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
    const baselineCourse = findCourse(baselineProject, selection.courseId);
    const proposedCourse = findCourse(proposedProject, selection.courseId);
    const metadataChanged = scope === "course" && Boolean(
      baselineCourse && proposedCourse && (
        baselineCourse.title !== proposedCourse.title || baselineCourse.goal !== proposedCourse.goal
      )
    );
    if (!change.changed && !metadataChanged) {
      resetStructuralEditor();
      if (state.authoringContext) return finishAuthoringContext("saved");
      state.manualStatus = "Nenhuma alteração para salvar.";
      render({ preserveFocus: false, captureDraft: false });
      return true;
    }
    state.structuralSaving = true;
    state.structuralError = "";
    render({ preserveFocus: false, captureDraft: false });
    try {
      const expectedCourseRevision = currentCourseRevision(selection.courseId);
      const receipt = await onSaveAssistedStructure({
        courseId: selection.courseId,
        expectedCourseRevision,
        scope,
        selection,
        originalProject: baselineProject,
        proposedProject,
        metadataChanged,
        title: proposedCourse?.title || "",
        objective: proposedCourse?.goal || "",
        upserts: clone(change.upserts),
        deletes: clone(change.deletes)
      });
      const resultProject = receipt?.project?.courses ? clone(receipt.project) : proposedProject;
      state.project = resultProject;
      const retained = retainContext(state.project, selection, state.view);
      state.selection = retained.selection;
      state.view = retained.view;
      const nextRevision = Number(receipt?.courseRevision);
      if (Number.isSafeInteger(nextRevision) && nextRevision >= 1) {
        state.manualCourseRevisionByCourse[selection.courseId] = nextRevision;
      }
      resetStructuralEditor();
      if (state.authoringContext) return finishAuthoringContext("saved");
      state.manualStatus = "Edição salva.";
      queueStudyFocus("[data-action='study-level-edit']");
      render({ preserveFocus: false, captureDraft: false });
      return true;
    } catch (error) {
      state.structuralSaving = false;
      state.structuralUnknown = isAmbiguousManualStudyUnitWriteFailure(error);
      state.structuralError = publicErrorMessage(error, "Não foi possível salvar a edição.");
      queueStudyFocus("[data-action='save-study-structure']");
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
  }

  function assistanceTargetTitle(scope, current) {
    if (scope === "study_unit") return current.studyUnit?.title || "Unidade de estudo";
    if (scope === "didactic_microsequence") {
      return current.microsequence?.title || "Microssequência";
    }
    return current.lesson?.title || "Lição";
  }

  function selectStructuralChild(childId) {
    if (!state.structuralEditing || state.structuralSaving ||
        !structuralTarget().children.some(({ id }) => id === childId)) return false;
    state.structuralSelectedChildId = childId;
    queueStudyFocus("[data-action='select-study-structure-child']", {
      "data-child-id": childId
    });
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function assistanceAvailableIds(scope, current = context()) {
    if (scope === "study_unit") {
      return ["study_unit", ...listManualStudyUnitTargetIds(current.studyUnit)];
    }
    if (scope === "didactic_microsequence") {
      return (current.microsequence?.studyUnits || []).map(({ id }) => id);
    }
    return (current.lesson?.microsequences || []).map(({ id }) => id);
  }

  function beginAssistanceSelection(scope) {
    if (!assistanceCapability(scope) || state.assistanceDraft ||
        state.manualSaving || state.assistanceSaving || providerAssistance?.opened) return false;
    if (state.manualEditing) {
      if (state.manualUnknownSignature || manualDraftChanged()) {
        state.manualError = state.manualUnknownSignature
          ? "Confirme a gravação incerta ou descarte o pedido antes de mudar de modo."
          : "Salve ou cancele a edição antes de abrir a assistência.";
        queueStudyFocus("[data-action='study-manual-save']");
        render({ preserveFocus: false, captureDraft: false });
        return false;
      }
      resetManualEditorState({ status: "" });
    }
    if (state.structuralEditing) {
      if (JSON.stringify(state.project) !== JSON.stringify(state.structuralBaselineProject)) {
        state.structuralError = "Salve ou cancele a edição antes de abrir a assistência.";
        queueStudyFocus("[data-action='save-study-structure']");
        render({ preserveFocus: false, captureDraft: false });
        return false;
      }
      resetStructuralEditor({ restoreBaseline: true });
    }
    const current = context();
    const initialId = scope === "study_unit"
      ? "study_unit"
      : scope === "didactic_microsequence"
        ? current.studyUnit?.id
        : current.microsequence?.id;
    if (!initialId) return false;
    state.assistanceActiveScope = scope;
    state.assistanceSelection = { scope, ids: [initialId] };
    if (scope === "study_unit" && initialId === "study_unit") {
      queueStudyFocus("[data-action='start-assistance-chat']");
    } else {
      queueStudyFocus("[data-action='toggle-assistance-target']", {
        "data-assistance-target-id": initialId
      });
    }
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function toggleAssistanceSelection(targetId) {
    const selection = state.assistanceSelection;
    if (!selection || providerAssistance?.opened) return false;
    if (!new Set(assistanceAvailableIds(selection.scope)).has(targetId)) return false;
    let ids = new Set(selection.ids);
    if (selection.scope === "study_unit" && targetId === "study_unit") {
      ids = new Set(["study_unit"]);
    } else {
      ids.delete("study_unit");
      if (ids.has(targetId)) ids.delete(targetId);
      else ids.add(targetId);
    }
    if (!ids.size) ids.add(targetId);
    state.assistanceSelection = { ...selection, ids: [...ids] };
    queueStudyFocus("[data-action='toggle-assistance-target']", {
      "data-assistance-target-id": targetId
    });
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function cancelAssistanceSelection() {
    if (!state.assistanceSelection || providerAssistance?.opened) return false;
    const scope = state.assistanceSelection.scope;
    state.assistanceSelection = null;
    state.assistanceActiveScope = "";
    queueStudyFocus(`[data-action='${studyProviderTriggerAction(scope)}']`);
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function retainAssistanceSelection(project, selection) {
    return exactStudyUnitSelection(project, [
      selection.courseId,
      selection.moduleId,
      selection.lessonId,
      selection.microsequenceId,
      selection.studyUnitId
    ]) || selectionForLesson(
      project,
      selectionForModule(
        project,
        selectionForCourse(project, selection.courseId),
        selection.moduleId
      ),
      selection.lessonId
    ) || firstSelection(project);
  }

  async function openProviderAssistance(scope = "study_unit") {
    if (!assistanceCapability(scope) || state.manualSaving || state.assistanceSaving ||
        state.assistanceLoading || state.assistanceDraft || state.structuralEditing) return false;
    if (state.manualUnknownSignature) {
      state.manualDiscardArmed = true;
      state.manualError = "Confirme a mesma gravação ou descarte o pedido incerto antes de pedir outra alteração.";
      render();
      return false;
    }
    if (state.manualEditing && manualDraftChanged()) {
      state.manualError = "Salve ou cancele a edição manual antes de abrir a assistência.";
      render();
      return false;
    }
    if (state.manualEditing) resetManualEditorState();
    const current = context();
    const selectedIds = state.assistanceSelection?.scope === scope
      ? [...state.assistanceSelection.ids]
      : [];
    if (!selectedIds.length) return beginAssistanceSelection(scope);
    const baselineProject = clone(state.project);
    const baselineSelection = clone(state.selection);
    try {
      const baselineComposition = manualCompositionContext();
      const configurationScope = { kind: scope, ref: scope === "study_unit"
        ? baselineSelection.studyUnitId : scope === "didactic_microsequence"
          ? baselineSelection.microsequenceId : baselineSelection.lessonId };
      const loadConfiguration = loadAssistanceConfiguration || (({ courseId, scope: targetScope }) =>
        repository.loadCourseDesign(courseId, { scope: targetScope }));
      state.assistanceLoading = true;
      const configuration = await loadConfiguration({
        courseId: baselineSelection.courseId, scope: configurationScope
      });
      if (destroyed || JSON.stringify(state.selection) !== JSON.stringify(baselineSelection) ||
          !assistanceCapability(scope)) return false;
      if (configuration?.courseId !== baselineComposition.courseId ||
          configuration?.courseRevision !== baselineComposition.courseRevision ||
          configuration?.scopeContext?.current?.kind !== configurationScope.kind ||
          configuration?.scopeContext?.current?.ref !== configurationScope.ref) {
        throw Object.assign(new Error("O curso mudou antes da leitura dos ajustes. Sincronize e reabra a assistência."), {
          code: "assistance_configuration_mismatch"
        });
      }
      state.assistanceActiveScope = scope;
      state.manualError = "";
      state.assistanceError = "";
      const opened = ensureProviderAssistance().open({
        trigger: studyProviderTriggerFocus(scope),
        project: baselineProject,
        selection: baselineSelection,
        configuration,
        scope,
        targetTitle: assistanceTargetTitle(scope, current),
        writeTargetId: scope === "study_unit" ? state.manualTargetId : "",
        writeTargetIds: selectedIds,
        onClosed: () => {
          state.assistanceActiveScope = "";
          state.assistanceSelection = null;
          queueStudyFocus(`[data-action='${studyProviderTriggerAction(scope)}']`);
          render({ preserveFocus: false, captureDraft: false });
        },
        onApplyDraft: (prepared) => {
          if (!assistanceCapability(scope)) {
            throw Object.assign(new Error("Somente o proprietário pode aplicar esta proposta."), { code: "course_not_owned" });
          }
          state.project = clone(prepared.proposedProject);
          state.selection = retainAssistanceSelection(state.project, baselineSelection);
          state.assistanceDraft = {
            scope,
            summary: prepared.message,
            baselineProject: clone(baselineProject),
            proposedProject: clone(prepared.proposedProject),
            selection: clone(baselineSelection),
            composition: clone(baselineComposition),
            candidate: clone(prepared.candidate)
          };
          state.assistanceError = "";
          render({ preserveFocus: false, captureDraft: false });
        }
      });
      if (opened) render({ preserveFocus: false, captureDraft: false });
      else {
        state.assistanceActiveScope = "";
        state.assistanceSelection = null;
      }
      return opened;
    } catch (error) {
      state.assistanceActiveScope = "";
      state.assistanceSelection = null;
      state.manualError = publicErrorMessage(error, "A assistência por IA não está disponível.");
      state.assistanceError = state.manualError;
      render();
      return false;
    } finally {
      state.assistanceLoading = false;
    }
  }

  function selectManualTarget(targetId) {
    const studyUnit = context().studyUnit;
    if (!state.manualEditing || !studyUnit || state.manualSaving ||
        targetId === state.manualTargetId) return false;
    if (state.manualUnknownSignature) {
      state.manualDiscardArmed = true;
      state.manualError = "Confirme a mesma gravação ou descarte o pedido incerto antes de mudar de conteúdo.";
      render();
      return false;
    }
    if (manualDraftChanged()) {
      state.manualError = "Salve ou cancele a edição atual antes de escolher outro conteúdo.";
      render();
      return false;
    }
    if (targetId !== "study_unit" &&
        !listManualStudyUnitTargetIds(studyUnit).includes(targetId)) return false;
    state.manualTargetId = targetId;
    state.manualDraft = { pathValues: {} };
    state.manualError = "";
    state.manualRestoreFocus = true;
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  async function cancelManualEdit({
    status = "Edição cancelada.",
    focus = true,
    focusSelector = "[data-action='study-manual-edit']",
    confirmUnknownDiscard = false
  } = {}) {
    if (state.manualUnknownSignature && !confirmUnknownDiscard) {
      state.manualDiscardArmed = true;
      state.manualError = "A gravação pode ter sido aceita. Salve novamente para confirmar ou descarte explicitamente este rascunho.";
      queueStudyFocus("[data-action='study-manual-discard-unknown']");
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
    resetManualEditorState({ status });
    if (state.authoringContext) return finishAuthoringContext("cancelled", { discardedUnknown: confirmUnknownDiscard });
    if (focus) queueStudyFocus(focusSelector);
    render({ preserveFocus: false });
    return true;
  }

  async function discardUnknownManualEdit() {
    return cancelManualEdit({ confirmUnknownDiscard: true });
  }

  function replaceCurrentStudyUnit(studyUnit) {
    const current = context();
    const index = current.microsequence?.studyUnits?.findIndex(({ id }) =>
      id === state.selection.studyUnitId
    );
    if (!Number.isInteger(index) || index < 0) {
      throw new Error("A unidade de estudo editada deixou de existir.");
    }
    current.microsequence.studyUnits[index] = clone(studyUnit);
    return current.microsequence.studyUnits[index];
  }

  function manualCompositionContext() {
    const reference = canonicalReference(state.selection);
    const persisted = repository.loadStudyUnitCompositionContext?.(reference) || null;
    const storedVersion = state.manualVersionByStudyUnit[
      manualStudyUnitVersionKey(reference.courseId, reference.studyUnitId)
    ];
    const availableVersions = [storedVersion, persisted?.studyUnitVersion]
      .filter((value) => Number.isSafeInteger(value) && value >= 1);
    const expectedVersion = availableVersions.length
      ? Math.max(...availableVersions)
      : null;
    const summaries = repository.loadCourseSummaries?.() || [];
    const summary = summaries.find(({ courseId }) => courseId === reference.courseId);
    const availableRevisions = [
      state.manualCourseRevisionByCourse[reference.courseId],
      persisted?.courseRevision,
      summary?.revision
    ].filter((value) => Number.isSafeInteger(value) && value >= 1);
    const courseRevision = availableRevisions.length
      ? Math.max(...availableRevisions)
      : null;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
        !Number.isSafeInteger(courseRevision) || courseRevision < 1) {
      throw new Error("O estado atual desta unidade de estudo não está disponível para edição.");
    }
    return {
      ...reference,
      courseRevision,
      expectedVersion,
      didacticMicrosequenceId: persisted?.didacticMicrosequenceId ||
        reference.microsequenceId
    };
  }

  async function commitManualStudyUnit(studyUnit, origin = "manual", baselineComposition = null) {
    const composition = baselineComposition || manualCompositionContext();
    const permission = coursePermission(composition.courseId);
    if (visitor || permission?.ownership !== "owned" || permission.canEdit !== true) {
      throw new Error(visitor ? "Entre na sua conta para editar seus cursos." : "Somente o proprietário pode editar este curso.");
    }
    const result = await onSaveManualEdit({
      courseId: composition.courseId,
      expectedCourseRevision: composition.courseRevision,
      didacticMicrosequenceId: composition.didacticMicrosequenceId,
      studyUnitId: composition.studyUnitId,
      expectedVersion: composition.expectedVersion,
      studyUnit: clone(studyUnit),
      origin,
      targetId: state.manualTargetId
    });
    const targetCourseId = result?.courseId || composition.courseId;
    if (result != null && (typeof result !== "object" || Array.isArray(result) ||
        targetCourseId !== composition.courseId ||
        result.studyUnitId && result.studyUnitId !== composition.studyUnitId ||
        result.origin && result.origin !== origin ||
        result.reconciled != null && typeof result.reconciled !== "boolean")) {
      throw new TypeError("A confirmação não corresponde à edição enviada.");
    }
    const confirmedStudyUnit = applyManualStudyUnitEdit(
      result?.studyUnit ?? studyUnit,
      "study_unit",
      { pathValues: {} }
    );
    if (confirmedStudyUnit.id !== composition.studyUnitId) {
      throw new TypeError("A unidade de estudo confirmada não corresponde à edição enviada.");
    }
    const resultVersion = result?.version ?? result?.studyUnitVersion;
    const nextVersion = resultVersion == null
      ? composition.expectedVersion + 1
      : Number(resultVersion);
    if (!Number.isSafeInteger(nextVersion) || nextVersion < 1) {
      throw new TypeError("O estado confirmado da unidade de estudo é inválido.");
    }
    const nextCourseRevision = result?.courseRevision == null
      ? composition.courseRevision
      : Number(result.courseRevision);
    if (!Number.isSafeInteger(nextCourseRevision) || nextCourseRevision < 1) {
      throw new TypeError("A edição confirmada do curso é inválida.");
    }
    state.manualVersionByStudyUnit[
      manualStudyUnitVersionKey(targetCourseId, composition.studyUnitId)
    ] = nextVersion;
    state.manualCourseRevisionByCourse[targetCourseId] = nextCourseRevision;
    return {
      studyUnit: replaceCurrentStudyUnit(confirmedStudyUnit),
      reconciled: result?.reconciled !== false,
      noOp: false
    };
  }

  async function saveManualEdit() {
    if (!manualEditCapability() || !state.manualEditing || state.manualSaving) return false;
    const current = context().studyUnit;
    captureManualDraft();
    let edited;
    try {
      edited = applyManualStudyUnitEdit(current, state.manualTargetId, state.manualDraft);
    } catch (error) {
      state.manualError = publicErrorMessage(error, "A edição é inválida.");
      state.manualRestoreFocus = true;
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
    if (JSON.stringify(current) === JSON.stringify(edited)) {
      if (state.authoringContext) {
        resetManualEditorState();
        return finishAuthoringContext("saved");
      }
      await cancelManualEdit({ status: "Nenhuma alteração para salvar." });
      return true;
    }
    const attemptSignature = manualAttemptSignature(
      state.manualTargetId,
      edited,
      state.manualOrigin
    );
    if (state.manualUnknownSignature && state.manualUnknownSignature !== attemptSignature) {
      state.manualDiscardArmed = true;
      state.manualError = "O rascunho mudou depois de uma gravação incerta. Descarte o pedido anterior antes de salvar outra alteração.";
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
    const before = clone(current);
    state.manualSaving = true;
    state.manualError = "";
    render({ preserveFocus: false, captureDraft: false });
    try {
      const committed = await commitManualStudyUnit(edited, state.manualOrigin, state.manualComposition);
      const saved = committed.studyUnit;
      const historyPreview = state.manualHistoryPreview;
      const previewValue = historyPreview
        ? historyPreview.direction === "undo"
          ? historyPreview.entry.before
          : historyPreview.entry.after
        : null;
      const acceptedPreview = previewValue &&
        JSON.stringify(previewValue) === JSON.stringify(saved);
      if (!acceptedPreview) {
        restoreManualHistoryPreview();
        state.manualUndo.push({
          courseId: state.selection.courseId,
          studyUnitId: saved.id,
          targetId: state.manualTargetId,
          before,
          after: clone(saved)
        });
        if (state.manualUndo.length > 20) state.manualUndo.shift();
        state.manualRedo = state.manualRedo.filter(({ courseId }) =>
          courseId !== state.selection.courseId);
      }
      resetManualEditorState({
        status: committed.reconciled
          ? "Edição salva."
          : "Edição salva. A atualização completa ocorrerá na próxima sincronização.",
        keepHistoryPreview: acceptedPreview
      });
      resetCitations();
      const responseKey = currentResponseEntry(saved)?.blockKey;
      if (responseKey) delete state.responseByBlockKey[responseKey];
      if (state.authoringContext) return finishAuthoringContext("saved");
      queueStudyFocus("[data-action='study-manual-edit']");
      render({ preserveFocus: false, captureDraft: false });
      return true;
    } catch (error) {
      state.manualSaving = false;
      const ambiguous = isAmbiguousManualStudyUnitWriteFailure(error);
      state.manualUnknownSignature = ambiguous ? attemptSignature : "";
      state.manualDiscardArmed = false;
      state.manualError = ambiguous
        ? "Não foi possível confirmar se a edição foi salva. Tente Salvar novamente para consultar o mesmo pedido."
        : publicErrorMessage(error, "Não foi possível salvar a edição.");
      state.manualRestoreFocus = true;
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
  }

  function discardAssistanceDraft({ status = "Proposta descartada.", confirmUnknown = false } = {}) {
    const draft = state.assistanceDraft;
    if (!draft || state.assistanceSaving) return false;
    if (draft.writeUnknown && !confirmUnknown) {
      draft.discardArmed = true;
      state.assistanceError = "A gravação pode ter sido concluída. Tente salvar novamente para conferir, ou confirme o descarte local; isso não desfaz uma gravação no curso.";
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
    state.project = clone(draft.baselineProject);
    state.selection = clone(draft.selection);
    state.assistanceDraft = null;
    state.assistanceError = "";
    state.manualStatus = status;
    queueStudyFocus("[data-study-destination-heading]");
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  async function saveAssistanceDraft() {
    const draft = state.assistanceDraft;
    if (!draft || state.assistanceSaving) return false;
    state.assistanceSaving = true;
    state.assistanceError = "";
    render({ preserveFocus: false, captureDraft: false });
    try {
      if (!assistanceCapability(draft.scope)) {
        throw Object.assign(new Error("Somente o proprietário pode salvar esta proposta."), { code: "course_not_owned" });
      }
      if (draft.scope === "study_unit") {
        state.manualTargetId = "study_unit";
        state.manualOrigin = "provider_assistance";
        await commitManualStudyUnit(
          context().studyUnit,
          "provider_assistance",
          draft.composition
        );
        resetManualEditorState();
      } else {
        if (typeof onSaveAssistedStructure !== "function") {
          throw new Error("A gravação estrutural não está disponível.");
        }
        const composition = draft.composition;
        const change = buildCourseAssistanceCompositionChange({
          originalProject: draft.baselineProject,
          proposedProject: draft.proposedProject,
          selection: draft.selection,
          scope: draft.scope
        });
        if (!change.changed) {
          state.assistanceDraft = null;
          state.assistanceSaving = false;
          state.manualStatus = "Nenhuma alteração para salvar.";
          render({ preserveFocus: false, captureDraft: false });
          return true;
        }
        const receipt = await onSaveAssistedStructure({
          courseId: composition.courseId,
          expectedCourseRevision: composition.courseRevision,
          scope: draft.scope,
          selection: clone(draft.selection),
          originalProject: clone(draft.baselineProject),
          proposedProject: clone(draft.proposedProject),
          upserts: clone(change.upserts),
          deletes: clone(change.deletes)
        });
        if (receipt?.project?.courses) {
          state.project = clone(receipt.project);
          state.selection = retainAssistanceSelection(state.project, draft.selection);
        }
        const nextRevision = Number(receipt?.courseRevision);
        if (Number.isSafeInteger(nextRevision) && nextRevision >= 1) {
          state.manualCourseRevisionByCourse[composition.courseId] = nextRevision;
        }
      }
      state.assistanceDraft = null;
      state.assistanceSaving = false;
      state.assistanceError = "";
      state.manualStatus = "Proposta salva.";
      resetCitations();
      queueStudyFocus("[data-study-destination-heading]");
      render({ preserveFocus: false, captureDraft: false });
      return true;
    } catch (error) {
      state.assistanceSaving = false;
      if (isAmbiguousManualStudyUnitWriteFailure(error)) {
        draft.writeUnknown = true;
        draft.discardArmed = false;
      }
      state.assistanceError = publicErrorMessage(error, "Não foi possível salvar a proposta.");
      render({ preserveFocus: false, captureDraft: false });
      return false;
    }
  }

  function moveManualHistory(direction) {
    if (!manualEditCapability() || state.manualSaving) return false;
    const source = direction === "undo" ? state.manualUndo : state.manualRedo;
    const destination = direction === "undo" ? state.manualRedo : state.manualUndo;
    const current = context().studyUnit;
    const entryIndex = manualHistoryIndex(
      source,
      state.selection.courseId,
      current?.id
    );
    if (entryIndex < 0) return false;
    const entry = source[entryIndex];
    if (state.manualEditing && manualDraftChanged()) {
      state.manualError = "Salve ou cancele a edição atual antes de continuar.";
      render();
      return false;
    }
    const desired = direction === "undo" ? entry.before : entry.after;
    const targetId = entry.targetId || "study_unit";
    const pathValues = Object.fromEntries(
      listManualStudyUnitEditablePaths(desired, targetId)
        .map(({ path, value }) => [path, value])
    );
    source.splice(entryIndex, 1);
    destination.push(entry);
    state.manualHistoryPreview = { direction, entry };
    const opened = beginManualEdit(targetId, {
      pathValues,
      origin: "manual",
      status: direction === "undo"
        ? "Desfazer preparado. Confira e salve."
        : "Refazer preparado. Confira e salve."
    });
    if (!opened) restoreManualHistoryPreview();
    return opened;
  }

  function finishAuthoringContext(reason, { discardedUnknown = false } = {}) {
    const authoring = state.authoringContext;
    if (!authoring) return false;
    state.authoringContext = null;
    state.authoringExitConfirmation = false;
    state.authoringExitReturnState = null;
    state.structuralUnknown = false;
    const retained = retainContext(state.project, authoring.previousNavigation.selection, authoring.previousNavigation.view);
    state.selection = retained.selection;
    state.view = retained.view;
    state.microsequenceMode = authoring.previousNavigation.microsequenceMode;
    state.navigationHistory = authoring.previousHistory;
    onAuthoringContextReturn({ returnRoute: authoring.returnRoute, courseId: authoring.courseId, reason, discardedUnknown });
    render({ preserveFocus: false, captureDraft: false });
    return true;
  }

  function requestAuthoringContextExit() {
    if (!state.authoringContext) return false;
    if (state.manualSaving || state.structuralSaving) return true;
    const changed = state.manualUnknownSignature || state.structuralUnknown || manualDraftChanged() ||
      state.structuralEditing && JSON.stringify(state.structuralBaselineProject) !== JSON.stringify(state.project);
    if (changed) {
      state.authoringExitReturnState = captureRenderState(root);
      state.authoringExitConfirmation = true;
      queueStudyFocus("[data-action='cancel-authoring-exit']");
      render({ preserveFocus: false });
      return true;
    }
    resetStructuralEditor({ restoreBaseline: true });
    resetManualEditorState();
    return finishAuthoringContext("cancelled");
  }

  function cancelAuthoringContextExit() {
    const preserved = state.authoringExitReturnState;
    state.authoringExitConfirmation = false;
    state.authoringExitReturnState = null;
    render({ preserveFocus: false, captureDraft: false });
    if (preserved) restoreRenderState(root, preserved, { restoreFocus: true, restorePageScroll: true });
  }

  function confirmAuthoringContextExit() {
    if (!state.authoringContext || !state.authoringExitConfirmation || state.manualSaving || state.structuralSaving) return;
    const discardedUnknown = Boolean(state.manualUnknownSignature || state.structuralUnknown);
    resetStructuralEditor({ restoreBaseline: true });
    resetManualEditorState();
    finishAuthoringContext("cancelled", { discardedUnknown });
  }

  function goBack() {
    if (providerAssistance?.handleBack?.()) return true;
    if (state.authoringExitConfirmation) { cancelAuthoringContextExit(); return true; }
    if (state.authoringContext) return requestAuthoringContextExit();
    if (state.assistanceDraft) {
      state.assistanceError = "Salve ou descarte a proposta antes de sair do alvo.";
      render();
      return false;
    }
    if (state.manualEditing) {
      state.manualError = "Salve ou cancele a edição antes de sair da unidade de estudo.";
      render();
      return false;
    }
    if (state.structuralEditing) {
      state.structuralError = "Salve ou cancele a edição antes de voltar.";
      render();
      return false;
    }
    if (state.observationSheetOpen) {
      return closeObservationSheet();
    }
    if (state.feedbackOpen) {
      state.feedbackOpen = false;
      render();
      return true;
    }
    const previous = state.navigationHistory.pop();
    if (previous) return restoreNavigationSnapshot(previous);
    return false;
  }

  function goHome() {
    if (state.authoringContext) return requestAuthoringContextExit();
    if (providerAssistance?.opened) return false;
    if (state.assistanceDraft) {
      state.assistanceError = "Salve ou descarte a proposta antes de ir para a Home.";
      render();
      return false;
    }
    if (state.manualEditing) {
      state.manualError = "Salve ou cancele a edição antes de ir para a Home.";
      render();
      return false;
    }
    if (state.structuralEditing) {
      state.structuralError = "Salve ou cancele a edição antes de ir para a Home.";
      render();
      return false;
    }
    if (state.observationSheetOpen) {
      return closeObservationSheet();
    }
    if (state.view === "courses") return false;
    persistStudyNavigation({ includePosition: true });
    resetStudyUnitInteraction();
    state.view = "courses";
    state.microsequenceMode = "play";
    queueStudyFocus("[data-field='home-course-select']");
    render({ preserveFocus: false });
    return true;
  }

  function validateResponse({ rerender = true } = {}) {
    const entry = currentResponseEntry();
    if (!entry) return true;
    const complete = RESOURCE_PACKAGE_REGISTRY.submitResponseState(entry.instance, ensureResponseState(entry), {
      blockKey: entry.blockKey,
      focus: queueStudyFocus,
      setActivePrompt: (prompt) => { state.activeGapPrompt = prompt; }
    });
    if (rerender) render();
    return complete;
  }

  async function stepStudyUnit(delta) {
    if (state.advancePending) return false;
    if (state.assistanceDraft) {
      state.assistanceError = "Salve ou descarte a proposta antes de mudar de unidade de estudo.";
      render();
      return false;
    }
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
      state.advancePending = true;
      state.advanceError = "";
      render();
      try {
        await repository.setStudyUnitCompleted(
          canonicalReference(state.selection),
          true,
          { synchronize: false }
        );
      } catch {
        state.advancePending = false;
        state.advanceError = "Não foi possível guardar o progresso neste dispositivo. Tente novamente.";
        render();
        return false;
      }
      state.advancePending = false;
      void flushPersonalState().catch(() => undefined);
    }
    const next = lessonStudyUnits[currentIndex + delta];
    if (!next) {
      if (delta > 0) {
        resetStudyUnitInteraction();
        state.view = "lesson";
        state.microsequenceMode = "play";
        persistStudyNavigation({ includePosition: true });
        queueStudyFocus("[data-study-destination-heading]");
        render({ preserveFocus: false });
      }
      return false;
    }
    return openLessonStudyUnit(next, { recordHistory: false });
  }

  async function flushPersonalState() {
    try {
      return await repository.flush?.();
    } finally {
      if (!destroyed) render();
    }
  }

  async function openObservations() {
    if (visitor) {
      root.dispatchEvent(new CustomEvent("aralearn:request-auth", {
        bubbles: true, detail: { entityPath: currentNavigationPosition()?.entityPath ?? null }
      }));
      return false;
    }
    const reference = canonicalReference(state.selection);
    const epoch = ++observationsEpoch;
    state.observationItems = repository.loadAnnotationsForPath?.(reference) || [];
    state.observationDraft = { category: null, rawText: "" };
    state.observationDraftTouched = false;
    state.observationEditingId = null;
    state.observationError = "";
    state.observationStale = false;
    state.observationSheetOpen = true;
    queueStudyFocus(state.observationItems.length
      ? "[data-observation-action='close']"
      : "[data-field='study-unit-observation']");
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
    await refreshOpenObservations(reference, epoch, { explicit: true });
  }

  async function refreshOpenObservations(reference, epoch, options = {}) {
    if (state.observationLoading) {
      state.observationStale = true;
      return false;
    }
    const signalAtStart = observationSignalVersion;
    state.observationLoading = true;
    render();
    try {
      const items = await repository.refreshAnnotationsForPath(reference, options);
      if (epoch !== observationsEpoch || !state.observationSheetOpen) return false;
      state.observationItems = items;
      state.observationStale = observationSignalVersion !== signalAtStart;
      return true;
    } catch (error) {
      if (epoch !== observationsEpoch) return false;
      if (courseAccessWasRevoked(error) && reconcileProjectAfterRevocation()) return false;
      state.observationError = publicErrorMessage(error, "Não foi possível atualizar as observações.");
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
    if (visitor) return false;
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
      state.observationError = publicErrorMessage(error, "Não foi possível salvar.");
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
      state.observationError = publicErrorMessage(error, "Não foi possível retirar a observação.");
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
      state.observationError = publicErrorMessage(
        error,
        "Não foi possível descartar a alteração com falha."
      );
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

  function bindResponseInteraction(scope) {
    const entry = currentResponseEntry();
    if (!entry) return;
    const isCurrent = () => currentResponseEntry()?.blockKey === entry.blockKey;
    RESOURCE_PACKAGE_REGISTRY.bindResponseInteraction(entry.instance, scope, {
      blockKey: entry.blockKey,
      getState: () => isCurrent() ? ensureResponseState(entry) : null,
      focus: queueStudyFocus,
      render,
      setActivePrompt: (prompt) => { if (isCurrent()) state.activeGapPrompt = prompt; },
      submit: () => { if (isCurrent()) validateResponse(); },
      reset: () => {
        if (!isCurrent()) return;
        state.responseByBlockKey[entry.blockKey] = defaultResponseState(entry);
        state.activeGapPrompt = null;
        render();
      }
    });
  }

  function bindActions() {
    root.querySelectorAll("[data-action='authoring-context-back']").forEach(node => node.addEventListener("click", requestAuthoringContextExit));
    root.querySelector("[data-action='cancel-authoring-exit']")?.addEventListener("click", cancelAuthoringContextExit);
    root.querySelector("[data-action='confirm-authoring-exit']")?.addEventListener("click", confirmAuthoringContextExit);
    root.querySelector("[data-authoring-editor-exit]")?.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelAuthoringContextExit(); }
      else trapAuthoringConfirmationTab({ event, root, confirmationSelector: "[data-authoring-editor-exit]" });
    });
    const authoringMenu = state.authoringContext && root.querySelector(".course-authoring-task-menu");
    authoringMenu?.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); authoringMenu.open = false;
      authoringMenu.querySelector("summary")?.focus({ preventScroll: true });
    });
    authoringMenu?.addEventListener("focusout", () => globalThis.queueMicrotask?.(() => {
      if (!authoringMenu.contains(root.ownerDocument?.activeElement)) authoringMenu.open = false;
    }));
    root.querySelector("[data-action='go-back']")?.addEventListener("click", goBack);
    root.querySelector("[data-action='go-home']")?.addEventListener("click", goHome);
    root.querySelector("[data-action='study-level-edit']")?.addEventListener(
      "click",
      () => beginStructuralEdit()
    );
    root.querySelector("[data-action='study-level-view']")?.addEventListener(
      "click",
      () => {
        if (state.structuralEditing) cancelStructuralEdit({
          focusSelector: "[data-action='study-level-view']"
        });
        else if (state.assistanceSelection) {
          state.assistanceSelection = null;
          state.assistanceActiveScope = "";
          queueStudyFocus("[data-action='study-level-view']");
          render({ preserveFocus: false, captureDraft: false });
        }
        else void providerAssistance?.close?.();
      }
    );
    root.querySelector("[data-action='cancel-study-structure']")?.addEventListener(
      "click",
      () => cancelStructuralEdit()
    );
    root.querySelector("[data-action='save-study-structure']")?.addEventListener(
      "click",
      () => void saveStructuralEdit()
    );
    root.querySelectorAll("[data-study-structure-field]").forEach((node) => {
      node.addEventListener("input", () => {
        const maxlength = Number(node.getAttribute("data-maxlength")) || Infinity;
        const value = String(node.textContent || "").slice(0, maxlength);
        if (node.textContent !== value) node.textContent = value;
        updateStructuralField(node.getAttribute("data-study-structure-field"), value);
      });
      if (node.getAttribute("data-study-structure-field") === "title") {
        node.addEventListener("keydown", (event) => {
          if (event.key === "Enter") event.preventDefault();
        });
      }
    });
    root.querySelectorAll("[data-action='move-study-structure-child']").forEach((node) =>
      node.addEventListener("click", () => moveStructuralChild(
        node.getAttribute("data-child-id"),
        node.getAttribute("data-direction")
      )));
    root.querySelector("[data-action='study-manual-edit']")?.addEventListener(
      "click",
      () => beginManualEdit()
    );
    root.querySelector("[data-action='study-manual-view']")?.addEventListener(
      "click",
      () => {
        if (state.manualEditing) void cancelManualEdit({
          focusSelector: "[data-action='study-manual-view']"
        });
        else if (state.assistanceSelection?.scope === "study_unit") {
          state.assistanceSelection = null;
          state.assistanceActiveScope = "";
          queueStudyFocus("[data-action='study-manual-view']");
          render({ preserveFocus: false, captureDraft: false });
        }
      }
    );
    root.querySelector("[data-action='study-manual-cancel']")?.addEventListener(
      "click",
      () => void cancelManualEdit()
    );
    root.querySelector("[data-action='study-manual-keep-unknown']")?.addEventListener(
      "click",
      () => {
        state.manualDiscardArmed = false;
        state.manualError = "Tente Salvar novamente para confirmar a mesma gravação.";
        queueStudyFocus("[data-action='study-manual-save']");
        render({ preserveFocus: false });
      }
    );
    root.querySelector("[data-action='study-manual-discard-unknown']")?.addEventListener(
      "click",
      () => void discardUnknownManualEdit()
    );
    root.querySelector("[data-action='study-manual-save']")?.addEventListener(
      "click",
      () => void saveManualEdit()
    );
    root.querySelector("[data-action='study-manual-undo']")?.addEventListener(
      "click",
      () => void moveManualHistory("undo")
    );
    root.querySelector("[data-action='study-manual-redo']")?.addEventListener(
      "click",
      () => void moveManualHistory("redo")
    );
    root.querySelector("[data-action='study-provider-assistance']")?.addEventListener(
      "click",
      () => void beginAssistanceSelection("study_unit")
    );
    root.querySelector("[data-action='open-microsequence-assistance']")?.addEventListener(
      "click",
      () => void beginAssistanceSelection("didactic_microsequence")
    );
    root.querySelector("[data-action='open-lesson-assistance']")?.addEventListener(
      "click",
      () => void beginAssistanceSelection("lesson")
    );
    root.querySelectorAll("[data-action='select-study-structure-child']").forEach((node) =>
      node.addEventListener("click", () => selectStructuralChild(node.dataset.childId || ""))
    );
    root.querySelector("[data-action='start-assistance-chat']")?.addEventListener(
      "click",
      () => openProviderAssistance(state.assistanceSelection?.scope)
    );
    root.querySelector("[data-action='cancel-assistance-selection']")?.addEventListener(
      "click",
      () => cancelAssistanceSelection()
    );
    root.querySelectorAll("[data-action='toggle-assistance-target']").forEach((node) =>
      node.addEventListener("click", (event) => {
        event.preventDefault();
        toggleAssistanceSelection(node.dataset.assistanceTargetId || "");
      })
    );
    root.querySelector("[data-action='discard-assistance-draft']")?.addEventListener(
      "click",
      () => discardAssistanceDraft()
    );
    root.querySelector("[data-action='discard-assistance-draft-unknown']")?.addEventListener(
      "click",
      () => discardAssistanceDraft({ confirmUnknown: true, status: "Rascunho local descartado; a gravação pendente não foi desfeita." })
    );
    root.querySelector("[data-action='undo-assistance-draft']")?.addEventListener(
      "click",
      () => discardAssistanceDraft({ status: "Proposta desfeita." })
    );
    root.querySelector("[data-action='save-assistance-draft']")?.addEventListener(
      "click",
      () => void saveAssistanceDraft()
    );
    root.querySelector("[data-study-manual-target]")?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        selectManualTarget(event.currentTarget.dataset.studyManualTarget);
      }
    );
    root.querySelectorAll("[data-action='toggle-study-unit-assistance-resource']")
      .forEach((node) => node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.assistanceSelection?.scope === "study_unit") {
          toggleAssistanceSelection(node.dataset.resourceTargetId);
        } else selectManualTarget(node.dataset.resourceTargetId);
      }));
    root.querySelector("[data-study-manual-title]")?.addEventListener("input", (event) => {
      state.manualDraft.pathValues.title = event.currentTarget.textContent || "";
    });
    root.querySelector(".study-reader-screen")?.addEventListener("keydown", (event) => {
      if (!state.manualEditing || state.manualSaving) return;
      if (event.target?.matches?.("[data-study-manual-title]") && event.key === "Enter") {
        event.preventDefault();
        void saveManualEdit();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void cancelManualEdit();
      }
    });
    root.querySelectorAll("[data-action='open-settings']").forEach((node) =>
      node.addEventListener("click", () => root.dispatchEvent(new CustomEvent(
        "aralearn:open-settings", { bubbles: true }
      ))));
    root.querySelectorAll("[data-action='open-authoring']").forEach((node) =>
      node.addEventListener("click", () => root.dispatchEvent(new CustomEvent(
        "aralearn:open-authoring", { bubbles: true }
      ))));
    root.querySelector("[data-field='home-course-select']")?.addEventListener(
      "change",
      (event) => void selectHomeCourse(event.currentTarget.value)
    );
    root.querySelector("[data-action='request-auth']")?.addEventListener("click", () =>
      root.dispatchEvent(new CustomEvent("aralearn:request-auth", {
        bubbles: true, detail: { entityPath: currentNavigationPosition()?.entityPath ?? null }
      })));
    root.querySelector("[data-action='discard-study-draft-recovery']")?.addEventListener(
      "click",
      () => void discardStudyDraftRecovery()
    );
    root.querySelector("[data-action='export-study-draft-recovery']")?.addEventListener(
      "click", () => void exportStudyDraftRecovery()
    );
    root.querySelector(".study-review-queue")?.addEventListener("toggle", (event) => {
      state.reviewQueueOpen = event.currentTarget.open === true;
    });
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
    root.querySelectorAll("[data-action='remove-review-item']").forEach((node) =>
      node.addEventListener("click", () => void removeReviewItem([
        node.getAttribute("data-course-id"),
        node.getAttribute("data-module-id"),
        node.getAttribute("data-lesson-id"),
        node.getAttribute("data-microsequence-id"),
        node.getAttribute("data-study-unit-id")
      ], node.getAttribute("aria-label")?.replace(/^Retirar de Rever:\s*/u, "") || "Unidade de estudo")));
    root.querySelector("[data-action='undo-review-removal']")?.addEventListener(
      "click",
      () => void undoReviewRemoval()
    );
    root.querySelector("[data-action='load-more-review-items']")?.addEventListener(
      "click",
      () => void loadMoreReviewItems()
    );
    root.querySelectorAll("[data-action='reset-course-progress']").forEach((node) =>
      node.addEventListener("click", () => void resetCourseProgress(
        node.getAttribute("data-course-id")
      )));
    root.querySelectorAll("[data-action='clear-local-course']").forEach((node) =>
      node.addEventListener("click", async () => {
        await repository.clearLocalCourse(node.getAttribute("data-course-id"));
        state.project = clone(repository.loadProject());
        state.view = "courses";
        render();
      }));
    root.querySelectorAll("[data-action='delete-owned-course']").forEach((node) =>
      node.addEventListener("click", () => void maintainCourseFromHome(
        node.getAttribute("data-course-id"),
        "delete_owned_course"
      )));
    root.querySelectorAll("[data-action='leave-shared-course']").forEach((node) =>
      node.addEventListener("click", () => void maintainCourseFromHome(
        node.getAttribute("data-course-id"),
        "leave_shared_course"
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
    bindCitationMarkers();

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
          closeObservationSheet();
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
    const observationOverlay = root.querySelector(".study-observation-overlay");
    observationOverlay?.addEventListener("focusin", (event) => {
      revealStudyObservationControl(event.target);
    });
    observationOverlay?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeObservationSheet();
        return;
      }
      if (event.key !== "Tab") return;
      const sheet = observationOverlay.querySelector(".study-observation-sheet");
      const controls = [...(sheet?.querySelectorAll([
        "button:not([disabled])",
        "input:not([disabled]):not([type='hidden'])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "a[href]",
        "summary",
        "[tabindex]:not([tabindex='-1'])"
      ].join(",")) || [])].filter((control) =>
        !control.hidden && !control.closest("[hidden]")
      );
      if (!controls.length) {
        event.preventDefault();
        sheet?.focus?.({ preventScroll: true });
        return;
      }
      const documentValue = root.ownerDocument || globalThis.document;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (documentValue.activeElement === first ||
          !sheet?.contains(documentValue.activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (documentValue.activeElement === last ||
          !sheet?.contains(documentValue.activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
    bindResponseInteraction(root);
  }

  function render({ preserveFocus = true, captureDraft = true } = {}) {
    const generation = ++studyRenderGeneration;
    if (captureDraft) captureManualDraft();
    const pendingStudyFocus = state.pendingStudyFocus;
    state.pendingStudyFocus = null;
    const preservedState = preserveFocus || pendingStudyFocus
      ? captureRenderState(root, {
          trackedScrollSelectors: [".screen-content", ".card-sheet-content"],
          includePageScroll: true,
          includeFocus: preserveFocus && !pendingStudyFocus
        })
      : null;
    const observationFocus = preserveFocus && !pendingStudyFocus && state.observationSheetOpen
      ? currentStudyFocusTarget() : null;
    if (observationFocus && preservedState?.focused) {
      observationFocus.selectionStart = preservedState.focused.selectionStart;
      observationFocus.selectionEnd = preservedState.focused.selectionEnd;
    }
    const current = context();
    const summaries = repository.loadCourseSummaries?.() || [];
    const byCourseId = Object.fromEntries(state.project.courses.map((course) => {
      const summary = summaries.find((item) => item.courseId === course.id);
      return [course.id, {
        ownership: summary?.ownership || "shared",
        canEdit: !visitor && summary?.ownership === "owned" && summary?.canEdit === true,
        moduleCount: summary?.moduleCount || 0,
        lessonCount: summary?.lessonCount || 0,
        studyUnitCount: summary?.studyUnitCount || 0,
        completedStudyUnitCount: summary?.completedStudyUnitCount || 0,
        availableOffline: summary?.availableOffline === true
      }];
    }));
    const reference = state.selection.studyUnitId ? canonicalReference(state.selection) : null;
    const observationItems = reference
      ? repository.loadAnnotationsForPath?.(reference) || []
      : [];
    const repositoryRuntimeStatus =
      repository.loadRuntimeStatus?.(state.selection.courseId) || {};
    const currentSyncStatus = {
      ...repositoryRuntimeStatus,
      ...synchronizationState,
      syncError: synchronizationState.syncError || repositoryRuntimeStatus.syncError || "",
      synchronizing: synchronizationState.synchronizing === true || repositoryRuntimeStatus.synchronizing === true
    };
    const runtimeStatus = state.connectionOffline
      ? { ...currentSyncStatus, offline: true, stale: true }
      : currentSyncStatus;
    const currentPermission = byCourseId[state.selection.courseId] || {};
    const manualEnabled = Boolean(
      !visitor && onSaveManualEdit && currentPermission.ownership === "owned" && currentPermission.canEdit === true
    );
    if (!manualEnabled && state.manualEditing) resetManualEditorState();
    const currentStudyUnitId = current.studyUnit?.id || "";
    const currentCourseId = current.course?.id || "";
    const manualEditor = {
      authoringContext: state.authoringContext ? { courseTitle: current.course?.title || "Curso" } : null,
      enabled: manualEnabled,
      editing: manualEnabled && state.manualEditing,
      mode: providerAssistance?.opened || state.assistanceSelection?.scope === "study_unit"
        ? "assist"
        : manualEnabled && state.manualEditing ? "edit" : "view",
      targetId: state.manualTargetId,
      draft: state.manualDraft,
      saving: state.manualSaving,
      error: state.manualError,
      status: state.manualStatus,
      canUndo: manualHistoryIndex(
        state.manualUndo,
        currentCourseId,
        currentStudyUnitId
      ) >= 0,
      canRedo: manualHistoryIndex(
        state.manualRedo,
        currentCourseId,
        currentStudyUnitId
      ) >= 0,
      discardArmed: state.manualDiscardArmed,
      assistance: {
        draft: state.assistanceDraft,
        saving: state.assistanceSaving,
        error: state.assistanceError,
        selection: state.assistanceSelection?.scope === "study_unit"
          ? state.assistanceSelection
          : null
      }
    };
    const structuralAssistanceEnabled = Boolean(
      !visitor && onSaveAssistedStructure && currentPermission.ownership === "owned" &&
      currentPermission.canEdit === true
    );
    const assistance = {
      enabled: structuralAssistanceEnabled,
      activeScope: state.assistanceActiveScope,
      draft: state.assistanceDraft,
      saving: state.assistanceSaving,
      error: state.assistanceError,
      selection: state.assistanceSelection
    };
    const activeStructuralScope = structuralScope();
    const activeStructural = structuralTarget(activeStructuralScope, current);
    const structuralEnabled = Boolean(
      !visitor && activeStructuralScope && onSaveAssistedStructure &&
      currentPermission.ownership === "owned" && currentPermission.canEdit === true
    );
    if (!structuralEnabled && state.structuralEditing) resetStructuralEditor({
      restoreBaseline: true
    });
    const structuralLabel = activeStructuralScope === "course"
      ? "Curso"
      : activeStructuralScope === "module"
        ? "Módulo"
        : activeStructuralScope === "lesson"
          ? "Lição"
          : "Microssequência didática";
    const structuralEditor = {
      authoringContext: state.authoringContext ? { courseTitle: current.course?.title || "Curso" } : null,
      enabled: structuralEnabled,
      editing: structuralEnabled && state.structuralEditing,
      saving: state.structuralSaving,
      error: state.structuralError,
      label: structuralLabel,
      fields: {
        title: activeStructural.target?.title || "",
        goal: activeStructuralScope === "course" || activeStructuralScope === "didactic_microsequence"
          ? activeStructural.target?.goal || ""
          : activeStructural.target?.guide?.goal || ""
      },
      children: (activeStructural.children || []).map(({ id, title }) => ({
        id,
        title: title || id
      })),
      selectedChildId: state.structuralSelectedChildId
    };
    manualInlineController?.destroy?.();
    manualInlineController = null;
    studyTools.beforeRender();
    root.innerHTML = `<div class="app-shell${state.authoringContext ? ' course-authoring-context-shell' : ''}">` + renderCourseStudyScreen({
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
      reviewQueueOpen: state.reviewQueueOpen,
      reviewUndo: state.reviewUndo,
      runtimeStatus,
      coursePermissionsById: byCourseId,
      selectedCourseId: state.selection.courseId,
      homeLoadingCourseId: state.homeLoadingCourseId,
      homeError: state.homeError,
      homeNotice: state.homeNotice,
      packageStudyUnitOptions: packageStudyUnitOptions(),
      feedbackOpen: state.feedbackOpen,
      advancePending: state.advancePending,
      advanceError: state.advanceError,
      visitor,
      observationCount: observationItems.filter(({ state: value }) => value !== "withdrawn").length,
      markedForReview: Boolean(reference && repository.isStudyUnitMarkedForReview(reference)),
      citationsOpen: state.citationsOpen,
      citationsLoading: state.citationsLoading,
      citations: state.citations,
      citationsError: state.citationsError,
      citationDownloadPending: state.citationDownloadPending,
      citationDownloadError: state.citationDownloadError,
      canAuthorSources: currentPermission.ownership === "owned" && currentPermission.canEdit === true,
      manualEditor,
      assistance,
      structuralEditor
    }) + (state.view === "courses" ? renderStudyDraftRecovery({
      recovery: state.studyDraftRecovery,
      error: state.studyDraftRecoveryError
    }) : "") + (state.observationSheetOpen ? renderStudyUnitObservationSheet({
      items: state.observationItems,
      draft: state.observationDraft,
      editingId: state.observationEditingId,
      error: state.observationError,
      saving: state.observationSaving,
      loading: state.observationLoading,
      stale: state.observationStale
    }) : "") + (state.authoringExitConfirmation ? renderAuthoringEditorExitConfirmation({
      unknown: Boolean(state.manualUnknownSignature || state.structuralUnknown)
    }) : "") + "</div>";
    const studyScreen = root.querySelector(".app-shell > .screen");
    if ((state.observationSheetOpen || state.authoringExitConfirmation) && studyScreen) {
      studyScreen.inert = true;
      studyScreen.setAttribute("aria-hidden", "true");
    }
    onViewChange(state.view);
    syncAccountControl();
    bindActions();
    updateCitationsOverlay();
    studyTools.afterRender();
    void RESOURCE_PACKAGE_REGISTRY.hydrate(root).then(() => {
      if (generation !== studyRenderGeneration || destroyed) return;
      placeStudyCitationMarkers(root, context().studyUnit, state.citations);
      bindCitationMarkers();
      activateManualEditing();
      bindResponseInteraction(root);
    }).catch((error) => {
      root.dispatchEvent(new CustomEvent("aralearn:package-hydration-error", {
        bubbles: true,
        detail: { error }
      }));
    });
    if (preservedState) {
      restoreRenderState(root, preservedState, {
        restorePageScroll: true,
        restoreFocus: preserveFocus && !pendingStudyFocus && !observationFocus
      });
    }
    focusStudyTarget(pendingStudyFocus || observationFocus);
    revealStudyObservationControl(root.ownerDocument?.activeElement);
    void loadStudyCitations();
  }

  render({ preserveFocus: false });

  return Object.freeze({
    setAccountProfile(profile) {
      state.accountProfile = profile && typeof profile === "object"
        ? { ...profile }
        : null;
      syncAccountControl();
    },
    async replaceProject(nextProject, { explicit = false } = {}) {
      if (!nextProject || !Array.isArray(nextProject.courses)) {
        throw new TypeError("Documento de cursos inválido.");
      }
      if (state.manualEditing || state.structuralEditing) return false;
      resetCitations();
      render();
      const previousSelection = clone(state.selection);
      const previousView = state.view;
      const previousStudyUnit = clone(context().studyUnit);
      let refreshedProject = clone(nextProject);
      if (previousSelection.courseId &&
          findCourse(refreshedProject, previousSelection.courseId) &&
          typeof repository.refreshCourseOfflineAvailability === "function") {
        await repository.refreshCourseOfflineAvailability(previousSelection.courseId, { explicit });
      }
      if (previousView !== "courses" && previousSelection.courseId &&
          findCourse(refreshedProject, previousSelection.courseId) &&
          typeof repository.loadCourse === "function") {
        await repository.loadCourse(previousSelection.courseId, { explicit });
        refreshedProject = clone(repository.loadProject());
      }
      state.project = refreshedProject;
      const retained = retainContext(state.project, previousSelection, previousView);
      state.selection = retained.selection;
      state.view = retained.view;
      if (previousSelection.courseId &&
          !findCourse(state.project, previousSelection.courseId)) {
        setHomeNotice("Seu acesso ao curso selecionado foi encerrado.");
        state.homeError = "";
        persistStudyNavigation({ includePosition: false });
      }
      rebaseManualCompositionOverrides();
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
    openEntityPath(entityPath, options) {
      return openCanonicalEntityPath(entityPath, options);
    },
    focusAuthoringContext() {
      if (!state.authoringContext) return false;
      const selector = state.structuralEditing ? "[data-study-structure-field='title']"
        : state.manualTargetId === "study_unit" ? "[data-study-manual-title]"
          : ".runtime-resource-edit-target.is-inline-editing [contenteditable='true']";
      const target = root.querySelector(selector) || root.querySelector("[data-action='authoring-context-back']");
      target?.focus?.({ preventScroll: true });
      return Boolean(target);
    },
    getNavigationPosition() {
      return clone(currentNavigationPosition());
    },
    getCourseDesignContext() {
      const permission = coursePermission();
      if (visitor || permission?.ownership !== "owned" || permission.canEdit !== true ||
          state.view === "courses") return null;
      const current = context();
      const kind = state.view === "microsequence"
        ? state.microsequenceMode === "play" ? "study_unit" : "didactic_microsequence"
        : state.view;
      const targets = {
        course: [current.course, "curso"],
        module: [current.moduleValue, "módulo"],
        lesson: [current.lesson, "lição"],
        didactic_microsequence: [current.microsequence, "microssequência"],
        study_unit: [current.studyUnit, "unidade de estudo"]
      };
      const [entity, label] = targets[kind] || [];
      if (!current.course || !entity) return null;
      return { courseId: current.course.id, scope: { kind, ref: entity.id }, label };
    },
    resumePendingManualEdit(options) {
      return resumeStudyDraftRecovery(options);
    },
    hasPendingManualEdit() {
      return Boolean(
        state.manualEditing || state.manualSaving || manualDraftChanged() ||
        state.structuralEditing || state.structuralSaving || state.assistanceDraft ||
        state.assistanceSaving || state.assistanceLoading || providerAssistance?.opened
      );
    },
    previewManualEdit({
      targetId,
      pathValues,
      origin = "provider_assistance"
    } = {}) {
      return previewManualDraft({ targetId, pathValues, origin });
    },
    handleBack: goBack,
    setSynchronizationState(value = {}) {
      synchronizationState = { ...synchronizationState, ...value };
      render({ preserveFocus: true, captureDraft: true });
    },
    refreshRuntimeStatus() {
      render({ preserveFocus: true, captureDraft: true });
    },
    async refreshPersonalState(options) {
      if (state.manualEditing || state.manualSaving || state.structuralEditing ||
          state.structuralSaving || state.assistanceDraft || state.assistanceSaving || state.assistanceLoading ||
          providerAssistance?.opened || manualDraftChanged()) return false;
      const previousSelection = clone(state.selection);
      const previousView = state.view;
      const previousStudyUnit = clone(context().studyUnit);
      const preservedFocus = currentStudyFocusTarget();
      root.setAttribute("aria-busy", "true");
      try {
        const refreshed = await repository.refreshPersonalState(options);
        const nextProject = refreshed && Array.isArray(refreshed.courses)
          ? refreshed
          : repository.loadProject?.();
        if (nextProject && Array.isArray(nextProject.courses)) {
          state.project = clone(nextProject);
          const retained = retainContext(state.project, previousSelection, previousView);
          state.selection = retained.selection;
          state.view = retained.view;
          if (previousSelection.courseId &&
              !findCourse(state.project, previousSelection.courseId)) {
            setHomeNotice("Seu acesso ao curso selecionado foi encerrado.");
            state.homeError = "";
            persistStudyNavigation({ includePosition: false });
          }
          rebaseManualCompositionOverrides();
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
      if (!state.connectionOffline) state.homeError = "";
      state.pendingStudyFocus ||= preservedFocus;
      render();
      return state.connectionOffline;
    },
    flushPersonalState,
    destroy() {
      destroyed = true;
      studyTools.destroy();
      providerAssistance?.destroy?.();
      providerAssistance = null;
      manualInlineController?.destroy?.();
      manualInlineController = null;
      unsubscribeAnnotations?.();
      unsubscribeAnnotations = null;
    }
  });
}
