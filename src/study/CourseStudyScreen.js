import {
  getPackageStudyUnitFeedbackEntry,
  renderPackageStudyUnitBlocksWithDock,
  renderPackageStudyUnitFeedback
} from "../render/renderPackageStudyUnit.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import { listManualStudyUnitTargetIds } from "../ui/manualStudyUnitEdit.js";
import {
  renderHomeScreen,
  renderRuntimeStatusControl
} from "../ui/renderHomeScreen.js";
import { buildCourseAuthoringRoute } from "../ui/courseAuthoringRoute.js";
import { collectLessonStudyUnits } from "./CourseStudyNavigation.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function topbar(title, backTitle = "Voltar", modeControls = "", runtimeStatus = {}) {
  return (
    '<header class="topbar lesson-topbar navigation-topbar">' +
    '<nav class="navigation-primary-actions" aria-label="Navegação">' +
    '<button class="icon-ghost" type="button" data-action="go-back" title="' +
    escapeHtml(backTitle) + '" aria-label="' + escapeHtml(backTitle) + '">' +
    renderUiIcon("arrow-left", "home-tab-icon") + "</button>" +
    '<button class="icon-ghost" type="button" data-action="go-home" title="Home" aria-label="Home">' +
    renderUiIcon("home", "home-tab-icon") + "</button></nav>" +
    '<div class="topbar-heading"><span class="visually-hidden">' + escapeHtml(title) +
    '</span>' + modeControls + '</div><div class="lesson-top-actions">' +
    renderRuntimeStatusControl(runtimeStatus) +
    '<button class="icon-ghost" type="button" data-action="open-settings"' +
    ' title="Conta e aparência" aria-label="Conta e aparência">' +
    renderUiIcon("more", "home-tab-icon") + "</button></div></header>"
  );
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
  studyUnitIndex = null,
  assistanceSelection = null,
  structuralEdit = null
}) {
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  const attributes = Object.entries(ids).map(([name, value]) =>
    ` data-${name}="${escapeHtml(value)}"`).join("");
  return (
    '<article class="clean-card progress-card structure-list-card navigation-list-card' +
    (assistanceSelection?.selected ? " is-assistance-selected" : "") +
    (structuralEdit?.selected ? " is-structure-selected" : "") + '" data-study-level="' +
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
    (assistanceSelection?.enabled
      ? '<button class="icon-ghost" type="button" data-action="toggle-assistance-target"' +
        ' data-assistance-target-id="' + escapeHtml(assistanceSelection.id) + '"' +
        ' aria-pressed="' + String(assistanceSelection.selected) + '" aria-label="' +
        escapeHtml((assistanceSelection.selected ? "Retirar " : "Selecionar ") + title) + '" title="' +
        escapeHtml(assistanceSelection.selected ? "Retirar da seleção" : "Selecionar") + '">' +
        renderUiIcon(assistanceSelection.selected ? "save" : "add", "home-tab-icon") + '</button>'
      : "") +
    (structuralEdit?.enabled
      ? '<button class="icon-ghost" type="button" data-action="select-study-structure-child"' +
        ' data-child-id="' + escapeHtml(structuralEdit.id) + '" aria-pressed="' +
        String(structuralEdit.selected) + '" aria-label="Selecionar ' + escapeHtml(title) +
        '" title="Selecionar">' + renderUiIcon("edit", "home-tab-icon") + '</button>' +
        (structuralEdit.selected
          ? '<button class="icon-ghost" type="button" data-action="move-study-structure-child"' +
            ' data-child-id="' + escapeHtml(structuralEdit.id) + '" data-direction="up"' +
            (structuralEdit.first ? ' disabled aria-disabled="true"' : '') +
            ' aria-label="Mover para cima" title="Mover para cima">' +
            renderUiIcon("arrow-up", "home-tab-icon") + '</button>' +
            '<button class="icon-ghost" type="button" data-action="move-study-structure-child"' +
            ' data-child-id="' + escapeHtml(structuralEdit.id) + '" data-direction="down"' +
            (structuralEdit.last ? ' disabled aria-disabled="true"' : '') +
            ' aria-label="Mover para baixo" title="Mover para baixo">' +
            renderUiIcon("arrow-down", "home-tab-icon") + '</button>'
          : "")
      : "") +
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

function levelHeading(label) {
  return '<h1 class="section-heading entity-level-heading">' + escapeHtml(label) + '</h1>';
}

function summary(title, description) {
  return '<section class="clean-card entity-summary-card"><h2 class="card-title"' +
    ' data-study-destination-heading tabindex="-1">' +
    escapeHtml(title) + "</h2>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    "</section>";
}

function readStudyUnitOverviewDescription(studyUnit) {
  const visibleStudyUnit = RESOURCE_PACKAGE_REGISTRY.prepareStudyUnitForSemantics(studyUnit);
  return visibleStudyUnit.content
    .map((instance) => RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "content"))
    .filter(Boolean)
    .join(" ");
}

function renderAssistanceModeButton({ action, pressed, disabled = false }) {
  return '<button class="study-mode-button" type="button" data-action="' + escapeHtml(action) + '"' +
    ` aria-pressed="${String(pressed)}" aria-label="Assistência por IA" title="Assistência por IA"` +
    `${disabled ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon("prompt", "home-tab-icon")}</button>`;
}

function renderModeControls({
  label,
  mode = "view",
  editable = false,
  assistanceAction = "",
  disabled = false,
  unit = false
}) {
  if (!editable && !assistanceAction) return "";
  const viewAction = unit
    ? ' data-action="study-manual-view"'
    : ' data-action="study-level-view"';
  const editAction = unit
    ? ' data-action="study-manual-edit"'
    : ' data-action="study-level-edit"';
  return '<nav class="study-mode-actions" role="group" aria-label="Modo de ' +
    escapeHtml(label) + '">' +
    '<button class="study-mode-button" type="button"' + viewAction + ' aria-pressed="' +
    `${String(mode === "view")}" aria-label="Visualizar" title="Visualizar"` +
    `${disabled ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon("preview", "home-tab-icon")}</button>` +
    (editable
      ? '<button class="study-mode-button" type="button"' + editAction + ' aria-pressed="' +
        `${String(mode === "edit")}" aria-label="Editar" title="Editar"` +
        `${disabled ? ' disabled aria-disabled="true"' : ""}>` +
        `${renderUiIcon("edit", "home-tab-icon")}</button>`
      : "") +
    (assistanceAction
      ? renderAssistanceModeButton({
          action: assistanceAction,
          pressed: mode === "assist",
          disabled
        })
      : "") + "</nav>";
}

function renderAssistanceDraftDock(assistance = {}, scope) {
  if (!assistance.draft || assistance.draft.scope !== scope) return "";
  return '<section class="study-assistance-draft-dock" aria-label="Rascunho da Assistência por IA">' +
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

function assistanceSelectionLabel(selection, scope) {
  const count = selection?.ids?.length || 0;
  if (scope === "study_unit") {
    return selection?.ids?.includes("study_unit")
      ? "Unidade inteira"
      : `${count} ${count === 1 ? "componente" : "componentes"}`;
  }
  if (scope === "didactic_microsequence") {
    return `${count} ${count === 1 ? "Unidade" : "Unidades"}`;
  }
  return `${count} ${count === 1 ? "Microssequência" : "Microssequências"}`;
}

function renderAssistanceSelectionDock(assistance = {}, scope) {
  if (assistance.selection?.scope !== scope) return "";
  const controls = '<section class="study-assistance-selection-dock" aria-label="Edição com IA">' +
    '<span class="visually-hidden">' +
    escapeHtml(assistanceSelectionLabel(assistance.selection, scope)) + '</span>' +
    '<button class="icon-ghost" type="button" data-action="cancel-assistance-selection"' +
    ' aria-label="Cancelar seleção" title="Cancelar seleção">' +
    renderUiIcon("remove-state", "home-tab-icon") + '</button>' +
    '<button class="open-mini" type="button" data-action="start-assistance-chat"' +
    ' aria-label="Abrir Edição com IA" title="Edição com IA">' +
    renderUiIcon("sparkles", "home-tab-icon") + '</button></section>';
  return scope === "study_unit"
    ? '<section class="study-reader-footer study-assistance-selection-footer">' +
      '<div class="study-action-dock">' + controls + '</div></section>'
    : controls;
}

function renderStructuralEditor(structuralEditor, { titleLabel, goalLabel }) {
  if (!structuralEditor?.editing) return "";
  const fields = structuralEditor.fields || {};
  return '<section class="clean-card entity-summary-card study-structure-editor" aria-label="Edição de ' +
    escapeHtml(structuralEditor.label) + '">' +
    (fields.title == null ? "" : '<h2 class="card-title" contenteditable="plaintext-only"' +
      ' data-study-structure-field="title" data-maxlength="300" role="textbox"' +
      ' aria-label="' + escapeHtml(titleLabel) + '">' + escapeHtml(fields.title) + '</h2>') +
    (fields.goal == null ? "" : '<p class="card-subtitle" contenteditable="plaintext-only"' +
      ' data-study-structure-field="goal" data-maxlength="2000" role="textbox"' +
      ' aria-label="' + escapeHtml(goalLabel) + '">' + escapeHtml(fields.goal) + '</p>') +
    (structuralEditor.error
      ? '<p class="study-structure-editor-error" role="alert">' +
        escapeHtml(structuralEditor.error) + '</p>'
      : '') + '</section>';
}

function renderStructuralEditDock(structuralEditor) {
  if (!structuralEditor?.editing) return "";
  return '<footer class="study-structure-edit-dock" aria-label="Ações da edição"><button class="icon-ghost" type="button" data-action="cancel-study-structure"' +
    ' aria-label="Cancelar edição" title="Cancelar edição"' +
    (structuralEditor.saving ? ' disabled aria-disabled="true"' : '') + '>' +
    renderUiIcon("remove-state", "home-tab-icon") + '</button>' +
    '<button class="open-mini" type="button" data-action="save-study-structure"' +
    ' aria-label="Salvar edição" title="Salvar edição"' +
    (structuralEditor.saving ? ' disabled aria-disabled="true"' : '') + '>' +
    renderUiIcon(structuralEditor.saving ? "rotate" : "save", "home-tab-icon") +
    '</button></footer>';
}

function renderCourse(course, progress, runtimeStatus, structuralEditor) {
  const moduleItems = course.modules || [];
  const modules = moduleItems.map((moduleValue, index) => navigationCard({
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
    resetLabel: "Zerar progresso deste Módulo",
    structuralEdit: structuralEditor?.editing ? {
      enabled: true,
      id: moduleValue.id,
      selected: structuralEditor.selectedChildId === moduleValue.id,
      first: index === 0,
      last: index === moduleItems.length - 1
    } : null
  })).join("");
  const modes = renderModeControls({
    label: "Curso",
    mode: structuralEditor?.editing ? "edit" : "view",
    editable: structuralEditor?.enabled,
    disabled: structuralEditor?.saving
  });
  return '<section class="screen">' + topbar("Curso", "Voltar", modes, runtimeStatus) +
    '<main class="screen-content course-screen">' +
    levelHeading("Curso") +
    (structuralEditor?.editing
      ? renderStructuralEditor(structuralEditor, {
          titleLabel: "Título",
          goalLabel: "Objetivo",
          childrenLabel: "Ordem dos Módulos"
        })
      : summary(course.title || "Curso", course.goal || "")) +
    '<h2 class="section-heading">Módulos</h2><section class="navigation-list">' +
    (modules || '<p class="empty-state-copy">Sem módulos.</p>') + "</section>" +
    renderStructuralEditDock(structuralEditor) + "</main></section>";
}

function renderModule(course, moduleValue, progress, runtimeStatus, structuralEditor) {
  const lessonItems = moduleValue.lessons || [];
  const lessons = lessonItems.map((lesson, index) => navigationCard({
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
    resetLabel: "Zerar progresso desta Lição",
    structuralEdit: structuralEditor?.editing ? {
      enabled: true,
      id: lesson.id,
      selected: structuralEditor.selectedChildId === lesson.id,
      first: index === 0,
      last: index === lessonItems.length - 1
    } : null
  })).join("");
  const modes = renderModeControls({
    label: "Módulo",
    mode: structuralEditor?.editing ? "edit" : "view",
    editable: structuralEditor?.enabled,
    disabled: structuralEditor?.saving
  });
  return '<section class="screen">' + topbar("Módulo", "Voltar", modes, runtimeStatus) +
    '<main class="screen-content course-screen">' +
    levelHeading("Módulo") +
    (structuralEditor?.editing
      ? renderStructuralEditor(structuralEditor, {
          titleLabel: "Título",
          goalLabel: "Objetivo",
          childrenLabel: "Ordem das Lições"
        })
      : summary(moduleValue.title || "Módulo", moduleValue.guide?.goal || "")) +
    '<h2 class="section-heading">Lições</h2><section class="navigation-list">' +
    (lessons || '<p class="empty-state-copy">Sem lições.</p>') + "</section>" +
    renderStructuralEditDock(structuralEditor) + "</main></section>";
}

function renderLesson(course, moduleValue, lesson, progress, runtimeStatus, assistance, structuralEditor) {
  const completedIds = new Set(
    progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds || []
  );
  const microsequenceItems = lesson.microsequences || [];
  const rows = microsequenceItems.map((microsequence, index) => {
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
      resetLabel: "Zerar progresso desta Microssequência didática",
      assistanceSelection: assistance.selection?.scope === "lesson" ? {
        enabled: true,
        id: microsequence.id,
        selected: assistance.selection.ids.includes(microsequence.id)
      } : null,
      structuralEdit: structuralEditor?.editing ? {
        enabled: true,
        id: microsequence.id,
        selected: structuralEditor.selectedChildId === microsequence.id,
        first: index === 0,
        last: index === microsequenceItems.length - 1
      } : null
    });
  }).join("");
  const modes = renderModeControls({
    label: "Lição",
    mode: assistance.activeScope === "lesson" ? "assist" : structuralEditor?.editing ? "edit" : "view",
    editable: structuralEditor?.enabled,
    assistanceAction: assistance.enabled ? "open-lesson-assistance" : "",
    disabled: assistance.saving || structuralEditor?.saving
  });
  return '<section class="screen">' + topbar("Lição", "Voltar", modes, runtimeStatus) +
    '<main class="screen-content lesson-structure-screen navigation-screen">' +
    levelHeading("Lição") +
    (structuralEditor?.editing
      ? renderStructuralEditor(structuralEditor, {
          titleLabel: "Título",
          goalLabel: "Objetivo",
          childrenLabel: "Ordem das Microssequências"
        })
      : summary(lesson.title || "Lição", lesson.guide?.goal || "")) +
    '<h2 class="section-heading">Microssequências didáticas</h2><section class="navigation-list">' +
    (rows || '<p class="empty-state-copy">Sem microssequências.</p>') + "</section>" +
    renderStructuralEditDock(structuralEditor) +
    renderAssistanceSelectionDock(assistance, "lesson") +
    renderAssistanceDraftDock(assistance, "lesson") + "</main></section>";
}

function renderMicrosequenceOverview(
  course,
  moduleValue,
  lesson,
  microsequence,
  progress,
  runtimeStatus,
  assistance,
  structuralEditor
) {
  const completedIds = new Set(
    progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds || []
  );
  const unitItems = microsequence.studyUnits || [];
  const units = unitItems.map((studyUnit, index) => navigationCard({
    level: "study-unit",
    ids: {
      "course-id": course.id,
      "module-id": moduleValue.id,
      "lesson-id": lesson.id,
      "microsequence-id": microsequence.id,
      "study-unit-id": studyUnit.id
    },
    title: studyUnit.title || studyUnit.id,
    description: readStudyUnitOverviewDescription(studyUnit),
    completed: completedIds.has(studyUnit.id) ? 1 : 0,
    total: 1,
    openAction: "open-study-unit",
    openLabel: "Abrir unidade",
    resetLabel: "Zerar progresso a partir desta Unidade de estudo",
    studyUnitIndex: index,
    assistanceSelection: assistance.selection?.scope === "didactic_microsequence" ? {
      enabled: true,
      id: studyUnit.id,
      selected: assistance.selection.ids.includes(studyUnit.id)
    } : null,
    structuralEdit: structuralEditor?.editing ? {
      enabled: true,
      id: studyUnit.id,
      selected: structuralEditor.selectedChildId === studyUnit.id,
      first: index === 0,
      last: index === unitItems.length - 1
    } : null
  })).join("");
  const modes = renderModeControls({
    label: "Microssequência didática",
    mode: assistance.activeScope === "didactic_microsequence" ? "assist" : structuralEditor?.editing ? "edit" : "view",
    editable: structuralEditor?.enabled,
    assistanceAction: assistance.enabled ? "open-microsequence-assistance" : "",
    disabled: assistance.saving || structuralEditor?.saving
  });
  return '<section class="screen microsequence-overview-screen">' +
    topbar("Microssequência didática", "Voltar", modes, runtimeStatus) +
    '<main class="screen-content microsequence-overview-content navigation-screen">' +
    levelHeading("Microssequência") +
    (structuralEditor?.editing
      ? renderStructuralEditor(structuralEditor, {
          titleLabel: "Título",
          goalLabel: "Objetivo",
          childrenLabel: "Ordem das Unidades"
        })
      : summary(microsequence.title || "Microssequência didática", microsequence.goal || "")) +
    '<h2 class="section-heading">Unidades</h2><section class="navigation-list">' +
    (units || '<p class="empty-state-copy">Sem unidades.</p>') + "</section>" +
    renderStructuralEditDock(structuralEditor) +
    renderAssistanceSelectionDock(assistance, "didactic_microsequence") +
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

function citationAnchorLabel(anchor) {
  const exact = citationSelectorLabel(anchor.selector);
  return anchor.humanLocator ? `${anchor.humanLocator} · ${exact}` : exact;
}

function renderStudyCitations({ open, loading, value, error, courseId, canAuthorSources }) {
  if (!open) return "";
  let content;
  if (loading) {
    content = '<p class="study-citations-status" role="status">Carregando fontes…</p>';
  } else if (error) {
    content = `<p class="study-citations-status is-error" role="alert">${escapeHtml(error)}</p>` +
      '<button type="button" data-action="retry-citations">Tentar novamente</button>';
  } else if (!value?.citations?.length) {
    content = '<p class="study-citations-status">Nenhuma fonte.</p>';
  } else {
    content = '<ol class="study-citation-list">' + value.citations.map((citation) =>
      '<li><article><h3>' + escapeHtml(citation.title) + "</h3>" +
      `<p class="study-citation-reference">${escapeHtml(citation.citationText)}</p>` +
      (citation.editionOrVersion
        ? `<small>${escapeHtml(citation.editionOrVersion)}</small>`
        : "") +
      `<small>${citation.url ? "Link externo disponível" : "Referência sem link público"}</small>` +
      (citation.anchors.length
        ? `<ul>${citation.anchors.map((anchor) =>
            `<li><span>${escapeHtml(citationAnchorLabel(anchor))}</span>` +
            (canAuthorSources
              ? `<a href="${escapeHtml(buildCourseAuthoringRoute(courseId, {
                  section: "sources",
                  sourceId: citation.sourceId,
                  anchorId: anchor.anchorId
                }))}" data-study-source-return aria-label="Revisar esta âncora">Revisar</a>`
              : "") + "</li>").join("")}</ul>`
        : "") +
      (citation.url
        ? `<a href="${escapeHtml(citation.url)}" target="_blank" rel="noreferrer">Abrir fonte</a>`
        : "") +
      (canAuthorSources
        ? `<a href="${escapeHtml(buildCourseAuthoringRoute(courseId, {
            section: "sources", sourceId: citation.sourceId
          }))}" data-study-source-return>Revisar Fonte no Curso</a>`
        : "") + "</article></li>").join("") + "</ol>";
  }
  return '<section class="study-citations-panel" aria-labelledby="study-citations-title">' +
    '<header><h2 id="study-citations-title">Fontes</h2>' +
    '<button class="icon-ghost" type="button" data-action="toggle-citations"' +
    ' aria-label="Fechar fontes" title="Fechar fontes">' +
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

function renderStudyManualHistory(manualEditor) {
  if (!manualEditor.enabled) return "";
  return '<div class="study-manual-controls">' +
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
  advancePending,
  advanceError,
  observationCount,
  markedForReview,
  runtimeStatus,
  citationsOpen,
  citationsLoading,
  citations,
  citationsError,
  canAuthorSources,
  manualEditor = { enabled: false, editing: false, draft: { pathValues: {} } }
}) {
  const units = microsequence.studyUnits || [];
  const manualTargetIds = listManualStudyUnitTargetIds(studyUnit);
  const selectedManualTargets = manualTargetIds.includes(manualEditor.targetId)
    ? [manualEditor.targetId]
    : [];
  const assistanceSelection = manualEditor.assistance?.selection;
  const selectedAssistanceTargets = assistanceSelection?.scope === "study_unit"
    ? assistanceSelection.ids.filter((id) => manualTargetIds.includes(id))
    : [];
  const runtime = renderPackageStudyUnitBlocksWithDock(studyUnit, {
    omitRepeatedHeading: true,
    resourceSelectionEnabled: manualEditor.editing || Boolean(assistanceSelection),
    resourceSelectionDisabled: manualEditor.saving,
    resourceSelectionTargetIds: manualTargetIds,
    selectedResourceTargetIds: assistanceSelection ? selectedAssistanceTargets : selectedManualTargets,
    manualEditingTargetId: manualEditor.editing && selectedManualTargets.length
      ? manualEditor.targetId
      : "",
    ...packageStudyUnitOptions
  });
  const feedbackEntry = getPackageStudyUnitFeedbackEntry(studyUnit);
  const nextActionLabel = feedbackEntry && !feedbackOpen
    ? "Ver explicação"
    : "Próxima Unidade";
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
      ` title="${advancePending ? "Guardando progresso" : "Próxima Unidade"}"` +
      ` aria-label="${advancePending ? "Guardando progresso" : "Próxima Unidade"}"${advancePending
        ? ' disabled aria-disabled="true"'
        : ""}>` +
      renderUiIcon(advancePending ? "rotate" : "play", "home-tab-icon") +
      "</button></div></section></div>"
    : "";
  const modes = renderModeControls({
    label: "Unidade de estudo",
    mode: manualEditor.mode,
    editable: manualEditor.enabled,
    assistanceAction: manualEditor.enabled ? "study-provider-assistance" : "",
    disabled: manualEditor.saving,
    unit: true
  });
  return '<section class="screen microsequence-workbench-screen">' +
    topbar(course.title || "Curso", "Voltar", modes, runtimeStatus) +
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
    renderStudyManualHistory(manualEditor) +
    '<div class="runtime-card-rendered-content"><div class="card-sheet-content">' +
    renderStudyManualTitle(studyUnit, manualEditor) + runtime.bodyHtml + renderStudyCitations({
      open: citationsOpen,
      loading: citationsLoading,
      value: citations,
      error: citationsError,
      courseId: course.id,
      canAuthorSources
    }) + "</div>" + runtime.dockHtml + "</div></article></section>" +
    '<div class="study-reader-stage-meta"><span class="study-reader-count" aria-label="Unidade ' +
    String(studyUnitIndex + 1) + " de " + String(units.length) + '">' +
    renderUiIcon("study-unit", "study-reader-count-icon") +
    '<span class="study-reader-count-value">' + String(studyUnitIndex + 1) + "/" +
    String(units.length) + "</span></span></div>" +
    (manualEditor.status
      ? `<p class="study-manual-status" role="status" aria-live="polite">${escapeHtml(manualEditor.status)}</p>`
      : "") +
    (advanceError
      ? `<p class="study-advance-error" role="alert">${escapeHtml(advanceError)}</p>`
      : "") +
    renderAssistanceDraftDock(manualEditor.assistance, "study_unit") +
    (manualEditor.editing ? renderStudyManualDock(manualEditor) :
    assistanceSelection ? renderAssistanceSelectionDock(manualEditor.assistance, "study_unit") :
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
    ` title="${advancePending ? "Guardando progresso" : nextActionLabel}"` +
    ` aria-label="${advancePending ? "Guardando progresso" : nextActionLabel}"${advancePending
      ? ' disabled aria-disabled="true"'
      : ""}>` + renderUiIcon(advancePending ? "rotate" : "play", "home-tab-icon") +
    "</button>" +
    feedbackMarkup + "</div></div></div></section>") +
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
  reviewUndo = null,
  runtimeStatus = {},
  coursePermissionsById,
  selectedCourseId = null,
  homeLoadingCourseId = "",
  homeError = "",
  homeNotice = "",
  homePendingPersonalCopyDiscard = false,
  packageStudyUnitOptions = {},
  feedbackOpen = false,
  advancePending = false,
  advanceError = "",
  observationCount = 0,
  markedForReview = false,
  citationsOpen = false,
  citationsLoading = false,
  citations = null,
  citationsError = "",
  canAuthorSources = false,
  manualEditor = { enabled: false, editing: false, draft: { pathValues: {} } },
  assistance = { enabled: false, activeScope: "", draft: null, saving: false, error: "" },
  structuralEditor = { enabled: false, editing: false, saving: false }
}) {
  if (view === "courses") {
    return renderHomeScreen({
      project,
      progress,
      reviewItems,
      reviewHasMore,
      reviewQueueOpen,
      reviewUndo,
      runtimeStatus,
      selectedCourseId,
      homeLoadingCourseId,
      homeError,
      homeNotice,
      homePendingPersonalCopyDiscard,
      editorSupport: { coursePermissionsById }
    });
  }
  if (view === "course") return renderCourse(course, progress, runtimeStatus, structuralEditor);
  if (view === "module") return renderModule(course, moduleValue, progress, runtimeStatus, structuralEditor);
  if (view === "lesson") {
    return renderLesson(course, moduleValue, lesson, progress, runtimeStatus, assistance, structuralEditor);
  }
  if (microsequenceMode === "overview") {
    return renderMicrosequenceOverview(
      course,
      moduleValue,
      lesson,
      microsequence,
      progress,
      runtimeStatus,
      assistance,
      structuralEditor
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
    advancePending,
    advanceError,
    observationCount,
    markedForReview,
    runtimeStatus,
    citationsOpen,
    citationsLoading,
    citations,
    citationsError,
    canAuthorSources,
    manualEditor
  });
}
