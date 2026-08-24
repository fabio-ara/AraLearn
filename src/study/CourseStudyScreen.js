import {
  getPackageStudyUnitFeedbackEntry,
  readPackageStudyUnitText,
  renderPackageStudyUnitBlocksWithDock,
  renderPackageStudyUnitFeedback
} from "../render/renderPackageStudyUnit.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import { listManualStudyUnitTargetIds } from "../ui/manualStudyUnitEdit.js";
import { renderHomeScreen } from "../ui/renderHomeScreen.js";
import { collectLessonStudyUnits } from "./CourseStudyNavigation.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function topbar(title, backTitle = "Voltar", upTitle = "") {
  return (
    '<header class="topbar lesson-topbar navigation-topbar">' +
    '<button class="icon-ghost" type="button" data-action="go-back" title="' +
    escapeHtml(backTitle) + '" aria-label="' + escapeHtml(backTitle) + '">' +
    renderUiIcon("arrow-left", "home-tab-icon") + "</button>" +
    (upTitle
      ? '<button class="icon-ghost navigation-up" type="button" data-action="go-up"' +
        ' title="' + escapeHtml(upTitle) + '" aria-label="' + escapeHtml(upTitle) + '">' +
        renderUiIcon("arrow-up", "home-tab-icon") + "</button>"
      : '<span class="navigation-up-slot" aria-hidden="true"></span>') +
    '<div class="topbar-heading"><div class="topbar-title">' + escapeHtml(title) +
    '</div></div><div class="lesson-top-actions">' +
    '<button class="icon-ghost" type="button" data-action="open-settings"' +
    ' title="Conta e aparência" aria-label="Conta e aparência">' +
    renderUiIcon("more", "home-tab-icon") + "</button></div></header>"
  );
}

function runtimeNotice(status) {
  if (status?.offline !== true && status?.stale !== true) return "";
  const offline = status?.offline === true;
  return '<p class="study-runtime-notice" role="status">' +
    renderUiIcon(offline ? "offline" : "cloud", "home-tab-icon") +
    '<span>' + (offline
      ? "Sem conexão · alterações pessoais ficam salvas neste dispositivo."
      : "Exibindo a versão salva · o AraLearn está atualizando os dados.") +
    "</span></p>";
}

function progressEntry(course, moduleValue, lesson, progress) {
  return readLessonProgressEntry(progress, {
    courseId: course.id,
    moduleId: moduleValue.id,
    lessonId: lesson.id
  });
}

function lessonTotal(lesson) {
  return collectLessonStudyUnits(lesson).length;
}

function lessonCompleted(course, moduleValue, lesson, progress) {
  return progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds?.length || 0;
}

function moduleTotal(moduleValue) {
  return (moduleValue.lessons || []).reduce((total, lesson) => total + lessonTotal(lesson), 0);
}

function moduleCompleted(course, moduleValue, progress) {
  return (moduleValue.lessons || []).reduce(
    (total, lesson) => total + lessonCompleted(course, moduleValue, lesson, progress),
    0
  );
}

function metric(icon, value, label) {
  return '<span class="progress-meta-item" aria-label="' + escapeHtml(label) +
    '" title="' + escapeHtml(label) + '">' +
    renderUiIcon(icon, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' + escapeHtml(value) + "</span></span>";
}

function navigationCard({
  level,
  ids,
  title,
  description = "",
  completed = 0,
  total = 0,
  detailIcon,
  detailCount,
  openAction,
  openLabel,
  resetLabel = "",
  studyUnitIndex = null
}) {
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  const attributes = Object.entries(ids).map(([name, value]) =>
    ` data-${name}="${escapeHtml(value)}"`).join("");
  return (
    '<article class="clean-card progress-card structure-list-card navigation-list-card" data-study-level="' +
    escapeHtml(level) + '"' + attributes + ">" +
    '<div class="card-progress-fill" style="width:' + String(percentage) + '%"></div>' +
    '<div class="lesson-copy structure-copy navigation-main">' +
    '<div class="structure-title-row navigation-title-row"><h3 class="card-title">' +
    escapeHtml(title) + "</h3></div>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    '<p class="muted tiny progress-meta">' +
    metric("progress", `${completed}/${total}`, `Progresso: ${completed} de ${total}`) +
    (detailIcon
      ? '<span class="progress-meta-separator" aria-hidden="true">·</span>' +
        metric(detailIcon, String(detailCount), "Quantidade")
      : "") + "</p></div>" +
    '<div class="lesson-actions structure-actions navigation-actions">' +
    (completed > 0 && resetLabel
      ? '<button class="icon-ghost" type="button" data-action="reset-study-progress"' +
        attributes + ' data-reset-level="' + escapeHtml(level) + '" title="' +
        escapeHtml(resetLabel) + '" aria-label="' + escapeHtml(resetLabel) + '">' +
        renderUiIcon("reset", "home-tab-icon") + "</button>"
      : "") +
    '<button class="open-mini" type="button" data-action="' + escapeHtml(openAction) + '"' +
    attributes + (studyUnitIndex == null ? "" : ` data-study-unit-index="${studyUnitIndex}"`) +
    ' title="' + escapeHtml(openLabel) + '" aria-label="' + escapeHtml(openLabel) + '">' +
    renderUiIcon("play", "home-tab-icon") + "</button></div></article>"
  );
}

function summary(title, description) {
  return '<section class="clean-card entity-summary-card"><h1 class="card-title"' +
    ' data-study-destination-heading tabindex="-1">' +
    escapeHtml(title) + "</h1>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    "</section>";
}

function renderAssistanceModeButton({ action, pressed, disabled = false }) {
  return '<button type="button" data-action="' + escapeHtml(action) + '"' +
    ` aria-pressed="${String(pressed)}" aria-label="Assistência por API" title="Assistência por API"` +
    `${disabled ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon("prompt", "home-tab-icon")}<span>Assistência por API</span></button>`;
}

function renderStructuralModes(scope, assistance = {}) {
  if (!assistance.enabled) return "";
  return '<nav class="course-inspection-mode-actions study-structural-mode-actions" ' +
    `role="group" aria-label="Modo da ${escapeHtml(scope === "lesson" ? "Lição" : "Microssequência")}">` +
    '<button type="button" data-action="study-structural-view" aria-pressed="' +
    `${String(assistance.activeScope !== scope)}" aria-label="Visualizar" title="Visualizar">` +
    `${renderUiIcon("preview", "home-tab-icon")}<span>Visualizar</span></button>` +
    renderAssistanceModeButton({
      action: scope === "lesson" ? "open-lesson-assistance" : "open-microsequence-assistance",
      pressed: assistance.activeScope === scope,
      disabled: assistance.saving
    }) + "</nav>";
}

function renderAssistanceDraftDock(assistance = {}, scope) {
  if (!assistance.draft || assistance.draft.scope !== scope) return "";
  return '<section class="study-assistance-draft-dock" aria-label="Rascunho da Assistência por API">' +
    '<div><p>Proposta aplicada ao rascunho</p><strong>' +
    `${escapeHtml(assistance.draft.summary || "Mudança preparada")}</strong></div>` +
    (assistance.error ? `<p role="alert">${escapeHtml(assistance.error)}</p>` : "") +
    '<div class="study-assistance-draft-actions">' +
    '<button class="icon-ghost" type="button" data-action="discard-assistance-draft" ' +
    `aria-label="Descartar rascunho" title="Descartar rascunho"${assistance.saving ? " disabled" : ""}>` +
    `${renderUiIcon("remove-state", "home-tab-icon")}</button>` +
    '<button class="icon-ghost" type="button" data-action="undo-assistance-draft" ' +
    `aria-label="Desfazer proposta" title="Desfazer proposta"${assistance.saving ? " disabled" : ""}>` +
    `${renderUiIcon("arrow-left", "home-tab-icon")}</button>` +
    '<button class="open-mini" type="button" data-action="save-assistance-draft" ' +
    `aria-label="Salvar proposta" title="Salvar proposta"${assistance.saving ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon(assistance.saving ? "rotate" : "save", "home-tab-icon")}<span>` +
    `${assistance.saving ? "Salvando…" : "Salvar"}</span></button></div></section>`;
}

function renderCourse(course, progress, runtimeStatus) {
  const modules = (course.modules || []).map((moduleValue) => navigationCard({
    level: "module",
    ids: { "course-id": course.id, "module-id": moduleValue.id },
    title: moduleValue.title || moduleValue.id,
    description: moduleValue.guide?.goal || "",
    completed: moduleCompleted(course, moduleValue, progress),
    total: moduleTotal(moduleValue),
    detailIcon: "lesson",
    detailCount: (moduleValue.lessons || []).length,
    openAction: "open-module",
    openLabel: "Abrir módulo",
    resetLabel: "Zerar progresso deste Módulo"
  })).join("");
  return '<section class="screen">' + topbar("Curso", "Menu principal") + runtimeNotice(runtimeStatus) +
    '<main class="screen-content course-screen">' +
    summary(course.title || "Curso", course.goal || "") +
    '<h2 class="section-heading">Módulos</h2><section class="navigation-list">' +
    (modules || '<p class="empty-state-copy">Sem módulos.</p>') + "</section></main></section>";
}

function renderModule(course, moduleValue, progress, runtimeStatus) {
  const lessons = (moduleValue.lessons || []).map((lesson) => navigationCard({
    level: "lesson",
    ids: { "course-id": course.id, "module-id": moduleValue.id, "lesson-id": lesson.id },
    title: lesson.title || lesson.id,
    description: lesson.guide?.goal || "",
    completed: lessonCompleted(course, moduleValue, lesson, progress),
    total: lessonTotal(lesson),
    detailIcon: "microsequence",
    detailCount: (lesson.microsequences || []).length,
    openAction: "open-lesson",
    openLabel: "Abrir lição",
    resetLabel: "Zerar progresso desta Lição"
  })).join("");
  return '<section class="screen">' + topbar("Módulo", "Voltar", "Subir para o Curso") + runtimeNotice(runtimeStatus) +
    '<main class="screen-content course-screen">' +
    summary(moduleValue.title || "Módulo", moduleValue.guide?.goal || "") +
    '<h2 class="section-heading">Lições</h2><section class="navigation-list">' +
    (lessons || '<p class="empty-state-copy">Sem lições.</p>') + "</section></main></section>";
}

function renderLesson(course, moduleValue, lesson, progress, runtimeStatus, assistance) {
  const completedIds = new Set(
    progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds || []
  );
  const rows = (lesson.microsequences || []).map((microsequence) => {
    const units = microsequence.studyUnits || [];
    return navigationCard({
      level: "microsequence",
      ids: {
        "course-id": course.id,
        "module-id": moduleValue.id,
        "lesson-id": lesson.id,
        "microsequence-id": microsequence.id
      },
      title: microsequence.title || microsequence.id,
      description: microsequence.goal || "",
      completed: units.filter((unit) => completedIds.has(unit.id)).length,
      total: units.length,
      detailIcon: "study-unit",
      detailCount: units.length,
      openAction: "open-microsequence",
      openLabel: "Abrir microssequência didática",
      resetLabel: "Zerar progresso desta Microssequência didática"
    });
  }).join("");
  return '<section class="screen">' + topbar("Lição", "Voltar", "Subir para o Módulo") + runtimeNotice(runtimeStatus) +
    '<main class="screen-content lesson-structure-screen navigation-screen">' +
    summary(lesson.title || "Lição", lesson.guide?.goal || "") +
    renderStructuralModes("lesson", assistance) +
    '<h2 class="section-heading">Microssequências didáticas</h2><section class="navigation-list">' +
    (rows || '<p class="empty-state-copy">Sem microssequências.</p>') + "</section>" +
    renderAssistanceDraftDock(assistance, "lesson") + "</main></section>";
}

function renderMicrosequenceOverview(
  course,
  moduleValue,
  lesson,
  microsequence,
  progress,
  runtimeStatus,
  assistance
) {
  const completedIds = new Set(
    progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds || []
  );
  const units = (microsequence.studyUnits || []).map((studyUnit, index) => navigationCard({
    level: "study-unit",
    ids: {
      "course-id": course.id,
      "module-id": moduleValue.id,
      "lesson-id": lesson.id,
      "microsequence-id": microsequence.id,
      "study-unit-id": studyUnit.id
    },
    title: studyUnit.title || studyUnit.id,
    description: readPackageStudyUnitText(studyUnit).slice(0, 140),
    completed: completedIds.has(studyUnit.id) ? 1 : 0,
    total: 1,
    openAction: "open-study-unit",
    openLabel: "Abrir unidade",
    resetLabel: "Zerar progresso a partir desta Unidade de estudo",
    studyUnitIndex: index
  })).join("");
  return '<section class="screen microsequence-overview-screen">' +
    topbar("Microssequência didática", "Voltar", "Subir para a Lição") +
    runtimeNotice(runtimeStatus) +
    '<main class="screen-content microsequence-overview-content navigation-screen">' +
    summary(microsequence.title || "Microssequência didática", microsequence.goal || "") +
    renderStructuralModes("didactic_microsequence", assistance) +
    '<h2 class="section-heading">Unidades</h2><section class="navigation-list">' +
    (units || '<p class="empty-state-copy">Sem unidades.</p>') + "</section>" +
    renderAssistanceDraftDock(assistance, "didactic_microsequence") + "</main></section>";
}

function citationSelectorLabel(selector) {
  if (selector.kind === "page_range") {
    return selector.startPage === selector.endPage
      ? `p. ${selector.startPage}`
      : `pp. ${selector.startPage}–${selector.endPage}`;
  }
  if (selector.kind === "time_range") {
    return `${selector.startMilliseconds / 1_000}–${selector.endMilliseconds / 1_000} s`;
  }
  if (selector.kind === "uri_fragment") return `trecho #${selector.fragment}`;
  return `“${selector.exact}”`;
}

function renderStudyCitations({ open, loading, value, error }) {
  if (!open) return "";
  let content;
  if (loading) {
    content = '<p class="study-citations-status" role="status">Carregando fontes…</p>';
  } else if (error) {
    content = `<p class="study-citations-status is-error" role="alert">${escapeHtml(error)}</p>` +
      '<button type="button" data-action="retry-citations">Tentar novamente</button>';
  } else if (!value?.citations?.length) {
    content = '<p class="study-citations-status">Esta Unidade não possui fontes públicas.</p>';
  } else {
    content = '<ol class="study-citation-list">' + value.citations.map((citation) =>
      '<li><article><h3>' + escapeHtml(citation.title) + "</h3>" +
      `<p>${escapeHtml(citation.citationText)}</p>` +
      (citation.editionOrVersion
        ? `<small>${escapeHtml(citation.editionOrVersion)}</small>`
        : "") +
      (citation.anchors.length
        ? `<ul>${citation.anchors.map(({ selector }) =>
            `<li>${escapeHtml(citationSelectorLabel(selector))}</li>`).join("")}</ul>`
        : "") +
      (citation.url
        ? `<a href="${escapeHtml(citation.url)}" target="_blank" rel="noreferrer">Abrir fonte</a>`
        : "") + "</article></li>").join("") + "</ol>";
  }
  return '<section class="study-citations-panel" aria-labelledby="study-citations-title">' +
    '<header><div><p>Proveniência desta Unidade</p><h2 id="study-citations-title">Fontes</h2></div>' +
    '<button type="button" data-action="toggle-citations" aria-label="Fechar fontes" title="Fechar fontes">' +
    renderUiIcon("remove-state", "home-tab-icon") + "</button></header>" + content + "</section>";
}

function renderStudyManualTitle(studyUnit, manualEditor) {
  if (!manualEditor.editing) {
    return `<div class="runtime-card-title">${escapeHtml(studyUnit.title || studyUnit.id)}</div>`;
  }
  if (manualEditor.targetId !== "study_unit") {
    return '<button class="runtime-card-title course-inspection-title-edit-target" type="button"' +
      ' data-study-manual-target="study_unit" aria-label="Editar título" title="Editar título">' +
      `${escapeHtml(studyUnit.title || studyUnit.id)}</button>`;
  }
  const title = Object.hasOwn(manualEditor.draft.pathValues || {}, "title")
    ? manualEditor.draft.pathValues.title
    : studyUnit.title;
  return '<div class="runtime-card-title course-inspection-manual-title"' +
    ' contenteditable="plaintext-only" role="textbox" aria-multiline="false" spellcheck="true"' +
    ' data-study-manual-title aria-label="Título da Unidade de estudo" title="Editar título">' +
    `${escapeHtml(title)}</div>`;
}

function renderStudyManualToolbar(manualEditor) {
  if (!manualEditor.enabled) return "";
  const mode = new Set(["view", "edit", "assist"]).has(manualEditor.mode)
    ? manualEditor.mode
    : manualEditor.editing ? "edit" : "view";
  return '<div class="study-manual-controls"><nav class="course-inspection-mode-actions study-manual-mode-actions"' +
    ' role="group" aria-label="Modo da Unidade de estudo">' +
    `<button type="button" data-action="study-manual-view"` +
    ` aria-pressed="${mode === "view"}"` +
    ` aria-label="Visualizar" title="Visualizar"${manualEditor.saving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon("preview", "home-tab-icon")}<span>Visualizar</span></button>` +
    `<button type="button" data-action="study-manual-edit"` +
    ` aria-pressed="${mode === "edit"}"` +
    ` aria-label="Editar" title="Editar"${manualEditor.saving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon("edit", "home-tab-icon")}<span>Editar</span></button>` +
    renderAssistanceModeButton({
      action: "study-provider-assistance",
      disabled: manualEditor.saving,
      pressed: mode === "assist"
    }) + "</nav>" +
    (manualEditor.editing
      ? '<nav class="study-manual-edit-actions" aria-label="Histórico da edição">' +
    `<button class="icon-ghost" type="button" data-action="study-manual-undo"` +
    ` aria-label="Desfazer última edição" title="Desfazer"${manualEditor.canUndo && !manualEditor.saving ? "" : " disabled aria-disabled=\"true\""}>` +
    `${renderUiIcon("arrow-left", "home-tab-icon")}</button>` +
    `<button class="icon-ghost" type="button" data-action="study-manual-redo"` +
    ` aria-label="Refazer edição" title="Refazer"${manualEditor.canRedo && !manualEditor.saving ? "" : " disabled aria-disabled=\"true\""}>` +
    `${renderUiIcon("arrow-right", "home-tab-icon")}</button></nav>`
      : "") + "</div>";
}

function renderStudyManualDock(manualEditor) {
  if (!manualEditor.editing) return "";
  if (manualEditor.discardArmed) {
    return '<section class="study-manual-edit-dock" aria-label="Resultado incerto da edição">' +
      `<p><span role="alert">${escapeHtml(manualEditor.error)}</span></p>` +
      '<div><button class="icon-ghost" type="button" data-action="study-manual-keep-unknown"' +
      ' aria-label="Manter rascunho" title="Manter rascunho">' +
      `${renderUiIcon("arrow-left", "home-tab-icon")}</button>` +
      '<button class="open-mini" type="button" data-action="study-manual-discard-unknown"' +
      ' aria-label="Descartar rascunho com resultado incerto" title="Descartar rascunho">' +
      `${renderUiIcon("remove-state", "home-tab-icon")}<span>Descartar</span></button></div></section>`;
  }
  return '<section class="study-manual-edit-dock' +
    (manualEditor.createsPersonalCopy ? " is-personal-copy" : "") +
    '" aria-label="Edição manual">' +
    `<p>${manualEditor.error
      ? `<span role="alert">${escapeHtml(manualEditor.error)}</span>`
      : manualEditor.createsPersonalCopy
        ? "Ao salvar, o AraLearn criará uma cópia privada para você. O Curso compartilhado continuará intacto."
        : "Edite diretamente no conteúdo."}</p>` +
    '<div><button class="icon-ghost" type="button" data-action="study-manual-cancel"' +
    ` aria-label="Cancelar edição" title="Cancelar"${manualEditor.saving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon("remove-state", "home-tab-icon")}</button>` +
    '<button class="open-mini" type="button" data-action="study-manual-save"' +
    ` aria-label="${manualEditor.createsPersonalCopy ? "Salvar na minha cópia" : "Salvar edição"}"` +
    ` title="${manualEditor.createsPersonalCopy ? "Salvar na minha cópia" : "Salvar"}"` +
    `${manualEditor.saving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon(manualEditor.saving ? "rotate" : "save", "home-tab-icon")}` +
    (manualEditor.createsPersonalCopy ? "<span>Salvar na minha cópia</span>" : "") +
    "</button></div></section>";
}

function renderStudyUnit({
  course,
  lesson,
  microsequence,
  studyUnit,
  studyUnitIndex,
  packageStudyUnitOptions,
  feedbackOpen,
  observationCount,
  markedForReview,
  runtimeStatus,
  citationsOpen,
  citationsLoading,
  citations,
  citationsError,
  manualEditor = { enabled: false, editing: false, draft: { pathValues: {} } }
}) {
  const units = microsequence.studyUnits || [];
  const manualTargetIds = listManualStudyUnitTargetIds(studyUnit);
  const selectedManualTargets = manualTargetIds.includes(manualEditor.targetId)
    ? [manualEditor.targetId]
    : [];
  const runtime = renderPackageStudyUnitBlocksWithDock(studyUnit, {
    omitRepeatedHeading: true,
    resourceSelectionEnabled: manualEditor.editing,
    resourceSelectionDisabled: manualEditor.saving,
    resourceSelectionTargetIds: manualTargetIds,
    selectedResourceTargetIds: selectedManualTargets,
    manualEditingTargetId: manualEditor.editing && selectedManualTargets.length
      ? manualEditor.targetId
      : "",
    ...packageStudyUnitOptions
  });
  const feedbackEntry = getPackageStudyUnitFeedbackEntry(studyUnit);
  const feedback = feedbackOpen && feedbackEntry
    ? renderPackageStudyUnitFeedback(feedbackEntry, {
        studyUnit,
        ...packageStudyUnitOptions,
        blockKeyPrefix: "feedback"
      })
    : { bodyHtml: "", dockHtml: "" };
  const feedbackMarkup = feedbackOpen && feedbackEntry
    ? '<div class="study-continue-popup-shell"><section class="study-continue-popup">' +
      '<div class="study-continue-popup-body">' + feedback.bodyHtml + "</div>" +
      feedback.dockHtml + '<div class="study-continue-popup-actions">' +
      '<button class="open-mini study-continue-popup-btn" type="button" data-action="continue-feedback"' +
      ' title="Continuar" aria-label="Continuar">' +
      renderUiIcon("play", "home-tab-icon") + "</button></div></section></div>"
    : "";
  return '<section class="screen microsequence-workbench-screen">' +
    topbar(course.title || "Curso", "Voltar", "Subir para a Microssequência") +
    runtimeNotice(runtimeStatus) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="workbench-surface"><div class="workbench-surface-body">' +
    '<section class="workbench-surface-pane workbench-reader-pane study-reader-screen"' +
    ' data-study-destination-heading tabindex="-1">' +
    '<section class="study-reader-context"><div class="study-reader-line">' +
    '<span class="study-reader-context-line study-reader-course-title">' +
    escapeHtml(microsequence.title || lesson.title || "Unidade") + "</span>" +
    (manualEditor.isPersonalCopy
      ? '<span class="study-personal-copy-badge">Sua cópia</span>'
      : "") + "</div>" +
    '<div class="study-reader-progress"><span style="width:' +
    String(units.length ? ((studyUnitIndex + 1) / units.length) * 100 : 0) + '%"></span></div></section>' +
    '<section class="card-portrait editor-card-portrait study-stage">' +
    '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
    renderStudyManualToolbar(manualEditor) +
    '<div class="runtime-card-rendered-content">' + renderStudyManualTitle(studyUnit, manualEditor) +
    '<div class="card-sheet-content">' +
    runtime.bodyHtml + "</div>" + runtime.dockHtml + "</div></article></section>" +
    renderStudyCitations({
      open: citationsOpen,
      loading: citationsLoading,
      value: citations,
      error: citationsError
    }) +
    '<div class="study-reader-stage-meta"><span class="study-reader-count" aria-label="Unidade ' +
    String(studyUnitIndex + 1) + " de " + String(units.length) + '">' +
    renderUiIcon("study-unit", "study-reader-count-icon") +
    '<span class="study-reader-count-value">' + String(studyUnitIndex + 1) + "/" +
    String(units.length) + "</span></span></div>" +
    (manualEditor.status
      ? `<p class="study-manual-status" role="status" aria-live="polite">${escapeHtml(manualEditor.status)}</p>`
      : "") +
    renderAssistanceDraftDock(manualEditor.assistance, "study_unit") +
    (manualEditor.editing ? renderStudyManualDock(manualEditor) :
    '<section class="study-reader-footer"><div class="study-action-dock"><div class="study-action-stack">' +
    '<div class="study-next-wrap runtime-card-external-dock">' +
    '<button class="icon-ghost study-citations-btn" type="button" data-action="toggle-citations"' +
    ` aria-expanded="${String(citationsOpen)}" title="Fontes" aria-label="Fontes">` +
    renderUiIcon("study", "home-tab-icon") + "</button>" +
    '<button class="icon-ghost study-observation-btn' +
    (observationCount > 0 ? " has-observations" : "") +
    '" type="button" data-action="open-observation" title="Observações" aria-label="Observações' +
    (observationCount > 0 ? `, ${observationCount}` : "") + '">' +
    renderUiIcon("prompt", "home-tab-icon") +
    (observationCount > 0
      ? '<span class="study-observation-dock-count" aria-hidden="true">' +
        String(observationCount) + "</span>"
      : "") + "</button>" +
    '<button class="icon-ghost study-review-btn' + (markedForReview ? " is-marked" : "") +
    '" type="button" data-action="toggle-review" aria-pressed="' + String(markedForReview) +
    '" title="Marcar para rever" aria-label="Marcar para rever">' +
    renderUiIcon("review", "home-tab-icon") + "</button>" +
    '<button class="icon-ghost" type="button" data-action="previous-study-unit"' +
    (studyUnitIndex <= 0 ? ' disabled aria-disabled="true"' : "") +
    ' title="Unidade anterior" aria-label="Unidade anterior">' +
    renderUiIcon("arrow-left", "home-tab-icon") + "</button>" +
    '<button class="open-mini study-continue-btn" type="button" data-action="next-study-unit"' +
    ' title="Continuar" aria-label="Continuar">' + renderUiIcon("play", "home-tab-icon") +
    "</button>" + feedbackMarkup + "</div></div></div></section>") +
    "</section></div></section>" +
    "</main></section>";
}

export function renderCourseStudyScreen({
  project,
  view,
  selection,
  course,
  moduleValue,
  lesson,
  microsequence,
  studyUnit,
  microsequenceMode,
  progress,
  reviewItems = [],
  reviewHasMore = false,
  reviewQueueOpen = false,
  runtimeStatus = {},
  coursePermissionsById,
  selectedCourseId = null,
  studyNavigation = null,
  homeLoadingCourseId = "",
  homeError = "",
  homeNotice = "",
  homePendingPersonalCopyDiscard = false,
  packageStudyUnitOptions = {},
  feedbackOpen = false,
  observationCount = 0,
  markedForReview = false,
  citationsOpen = false,
  citationsLoading = false,
  citations = null,
  citationsError = "",
  manualEditor = { enabled: false, editing: false, draft: { pathValues: {} } },
  assistance = { enabled: false, activeScope: "", draft: null, saving: false, error: "" }
}) {
  if (view === "courses") {
    return renderHomeScreen({
      project,
      progress,
      reviewItems,
      reviewHasMore,
      reviewQueueOpen,
      runtimeStatus,
      selectedCourseId,
      studyNavigation,
      homeLoadingCourseId,
      homeError,
      homeNotice,
      homePendingPersonalCopyDiscard,
      editorSupport: { coursePermissionsById }
    });
  }
  if (view === "course") return renderCourse(course, progress, runtimeStatus);
  if (view === "module") return renderModule(course, moduleValue, progress, runtimeStatus);
  if (view === "lesson") {
    return renderLesson(course, moduleValue, lesson, progress, runtimeStatus, assistance);
  }
  if (microsequenceMode === "overview") {
    return renderMicrosequenceOverview(
      course,
      moduleValue,
      lesson,
      microsequence,
      progress,
      runtimeStatus,
      assistance
    );
  }
  return renderStudyUnit({
    course,
    lesson,
    microsequence,
    studyUnit,
    studyUnitIndex: selection.studyUnitIndex,
    packageStudyUnitOptions,
    feedbackOpen,
    observationCount,
    markedForReview,
    runtimeStatus,
    citationsOpen,
    citationsLoading,
    citations,
    citationsError,
    manualEditor
  });
}
