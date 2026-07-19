import { readLessonProgressEntry } from "../storage/progressStore.js";
import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";
import { renderUiIcon } from "./renderUiIcons.js";
import {
  listGenerationProgressPhases,
  summarizeGenerationProgressStatus
} from "../generation/runtime/progressViewModel.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}



function getStructureHandleTitle(level) {
  if (level === "course") return "Arrastar curso";
  if (level === "module") return "Arrastar módulo";
  if (level === "lesson") return "Arrastar lição";
  if (level === "microsequence") return "Arrastar microssequência";
  if (level === "card") return "Arrastar card";
  return "Arrastar item";
}

function renderStructureHandle({ level, courseKey, moduleKey = "", lessonKey = "", microsequenceKey = "", label }) {
  return (
    '<button class="icon-ghost tiny-icon builder-tool-handle" type="button" draggable="true" data-action="structure-drag-handle" data-structure-level="' +
    escapeHtml(level) +
    '" data-course-key="' +
    escapeHtml(courseKey || "") +
    '" data-module-key="' +
    escapeHtml(moduleKey) +
    '" data-lesson-key="' +
    escapeHtml(lessonKey) +
    '" data-microsequence-key="' +
    escapeHtml(microsequenceKey) +
    '" title="' +
    escapeHtml(getStructureHandleTitle(level)) +
    '" aria-label="' +
    escapeHtml(label) +
    '">&#9776;</button>'
  );
}

function entityId(entity) {
  return typeof entity?.id === "string" ? entity.id : "";
}

function cardsOfMicrosequence(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

function countLessons(course) {
  return (course.modules || []).reduce((total, moduleValue) => total + (moduleValue.lessons || []).length, 0);
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) => {
    if (!isRunnableMicrosequence(microsequence)) {
      return total;
    }
    return total + cardsOfMicrosequence(microsequence).length;
  }, 0);
}

function countCardsInCourse(course) {
  return (course.modules || []).reduce(
    (total, moduleValue) => total + (moduleValue.lessons || []).reduce((lessonTotal, lesson) => lessonTotal + countCardsInLesson(lesson), 0),
    0
  );
}

function countCompletedCardsInCourse(course, progress) {
  return (course.modules || []).reduce((total, moduleValue) => {
    return (
      total +
      (moduleValue.lessons || []).reduce((lessonTotal, lesson) => {
        const entry = readLessonProgressEntry(progress, {
          courseKey: entityId(course),
          moduleKey: entityId(moduleValue),
          lessonKey: entityId(lesson)
        });
        const completed = entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys.length : 0;
        return lessonTotal + completed;
      }, 0)
    );
  }, 0);
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeIconTitle(label) {
  const text = String(label || "").trim();
  const match = text.match(/^[^:]+:\s*(.+)$/);
  return match ? match[1].trim() : text;
}

function renderMetaMetric(iconName, value, label) {
  return (
    '<span class="progress-meta-item" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(summarizeIconTitle(label)) +
    '">' +
    renderUiIcon(iconName, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' +
    escapeHtml(value) +
    "</span></span>"
  );
}

function renderHomeCourseMeta(course) {
  return (
    '<p class="muted tiny progress-meta">' +
    [
      renderMetaMetric("progress", `${course.completedCount}/${course.totalCount}`, `Progresso: ${course.completedCount}/${course.totalCount}`),
      renderMetaMetric("module", String(course.moduleCount), formatCount(course.moduleCount, "módulo", "módulos")),
      renderMetaMetric("lesson", String(course.lessonCount), formatCount(course.lessonCount, "lição", "lições"))
    ].join('<span class="progress-meta-separator" aria-hidden="true">·</span>') +
    "</p>"
  );
}

function renderHomeCourseTitle(course) {
  const title = '<h3 class="card-title">' + escapeHtml(course.title || "Curso") + "</h3>";
  return (
    '<div class="course-title-row navigation-title-row">' +
    (course.readOnly
      ? ""
      : renderStructureHandle({
          level: "course",
          courseKey: course.id,
          label: `Arrastar curso ${course.title || course.id}`
        })) +
    title +
    "</div>"
  );
}

function resolveCoursePermissions(editorSupport, courseId) {
  const permissionsById = editorSupport?.coursePermissionsById;
  const permissions = permissionsById instanceof Map
    ? permissionsById.get(courseId)
    : permissionsById?.[courseId];
  return permissions || { role: "owner", canEdit: true, canDelete: true };
}

function buildHomeCoursePreviews(project, progress, editorSupport) {
  return (project.courses || []).map((course) => {
    const completedCount = countCompletedCardsInCourse(course, progress);
    const totalCount = countCardsInCourse(course);
    const permissions = resolveCoursePermissions(editorSupport, entityId(course));
    return {
      id: entityId(course),
      title: course.title || "Curso",
      description: course.goal || "",
      moduleCount: (course.modules || []).length,
      lessonCount: countLessons(course),
      completedCount,
      totalCount,
      progressPercent: totalCount ? Math.max(0, Math.min(100, (completedCount / totalCount) * 100)) : 0,
      readOnly: !permissions.canEdit
    };
  });
}

function getVisibleCourses(project, editorSupport = {}) {
  return (project.courses || []).filter((course) => (
    resolveCoursePermissions(editorSupport, entityId(course)).canEdit
  ));
}

function renderCoursesTopbar() {
  return (
    '<header class="topbar home-topbar navigation-topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title">' +
    '<span class="brand-title">' +
    '<img class="brand-mark" src="assets/brand/aralearn-mark.png" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span>' +
    "</span>" +
    "</h1>" +
    '<div class="lesson-top-actions">' +
    '<button class="icon-ghost" type="button" data-action="open-generation-panel-global" title="Abrir geração por IA" aria-label="Abrir geração por IA">' +
    renderUiIcon("sparkles", "home-tab-icon") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="quick-create-course" title="Criar curso vazio" aria-label="Criar curso vazio">＋</button>' +
    '<button class="icon-ghost" type="button" data-action="future-sync" title="Abrir biblioteca e sincronização" aria-label="Abrir biblioteca e sincronização">☁</button>' +
    '<button class="icon-ghost" type="button" data-action="open-home-actions" title="Ações do app" aria-label="Ações do app">⋯</button>' +
    "</div>" +
    "</header>"
  );
}



function renderGenerateIconLabel(iconName, label) {
  return (
    '<span class="generate-icon-label workbench-inline-icon" aria-hidden="true" title="' +
    escapeHtml(label) +
    '">' +
    renderUiIcon(iconName, "generate-field-icon workbench-inline-icon-svg") +
    "</span>"
  );
}

function renderGenerateSectionTitle(title) {
  return '<div class="generate-section-title"><h3 class="generate-section-title-text">' + escapeHtml(title) + "</h3></div>";
}

function renderNavigationContextHeading(title) {
  return (
    '<section class="section-heading-row centered-section-heading-row navigation-heading-row">' +
    '<h2 class="section-heading">' +
    escapeHtml(title) +
    "</h2></section>"
  );
}

function renderGenerateIconButton(action, title, content, disabled = false, extraClassName = "") {
  return (
    '<button class="icon-ghost tiny-icon generate-inline-icon' +
    escapeHtml(extraClassName) +
    '" type="button" data-action="' +
    escapeHtml(action) +
    '" title="' +
    escapeHtml(title) +
    '" aria-label="' +
    escapeHtml(title) +
    '"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    content +
    "</button>"
  );
}

function renderGenerateInputField({
  field,
  iconName,
  label,
  placeholder,
  value = "",
  listId = "",
  options = [],
  disabled = false
}) {
  return (
    '<label class="field generate-icon-field generate-scope-field">' +
    renderGenerateIconLabel(iconName, label) +
    '<div class="generate-combobox-shell">' +
    '<input data-field="' +
    escapeHtml(field) +
    '" type="text" class="generate-combobox-input" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '" placeholder="' +
    escapeHtml(placeholder) +
    '" value="' +
    escapeHtml(value) +
    '"' +
    (listId ? ' list="' + escapeHtml(listId) + '"' : "") +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    (listId
      ? '<datalist id="' + escapeHtml(listId) + '">' + renderGenerateComboboxOptions(options) + "</datalist>"
      : "") +
    "</div></label>"
  );
}

function renderStaticChips(items = [], { emptyLabel = "", iconName = "module", action = "", dataField = "" } = {}) {
  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!normalizedItems.length) {
    return emptyLabel ? '<p class="tiny muted bottomup-empty-copy">' + escapeHtml(emptyLabel) + "</p>" : "";
  }
  return normalizedItems
    .map((item) => {
      const attrs =
        action
          ? ' type="button" data-action="' + escapeHtml(action) + '" data-' + escapeHtml(dataField) + '="' + escapeHtml(item) + '"'
          : ' type="button" disabled aria-disabled="true"';
      return (
        '<button class="didactic-tag dependency-tag-chip dependency-chip-button"' +
        attrs +
        ' title="' +
        escapeHtml(item) +
        '" aria-label="' +
        escapeHtml(item) +
        '">' +
        renderUiIcon(iconName, "assist-attachment-button-icon") +
        '<span class="dependency-chip-label">' +
        escapeHtml(item) +
        "</span></button>"
      );
    })
    .join("");
}

function renderEditableTopicChips(items = [], action = "") {
  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!normalizedItems.length) {
    return "";
  }
  return normalizedItems
    .map((item) => (
      '<button class="didactic-tag dependency-tag-chip dependency-chip-button" type="button" data-action="' +
      escapeHtml(action) +
      '" data-topic="' +
      escapeHtml(item) +
      '" title="Remover tópico" aria-label="Remover tópico">' +
      '<span class="dependency-chip-label">' +
      escapeHtml(item) +
      "</span>" +
      '<span class="dependency-chip-remove" aria-hidden="true">&times;</span></button>'
    ))
    .join("");
}

function renderGenerateComboboxOptions(items) {
  return (items || [])
    .map((item) => {
      const value = item?.title || item?.id || "";
      return value ? '<option value="' + escapeHtml(value) + '"></option>' : "";
    })
    .join("");
}

function renderGenerationAttachmentChips(attachments = []) {
  const chips = (attachments || [])
    .map((item, index) => {
      const label = item?.name ? String(item.name) : "";
      if (!label) {
        return "";
      }

      return (
        '<button class="didactic-tag dependency-tag-chip dependency-chip-button assist-attachment-chip" type="button" data-action="remove-generation-attachment" data-attachment-index="' +
        String(index) +
        '" title="Remover anexo" aria-label="Remover anexo">' +
        '<span class="dependency-chip-label">' +
        escapeHtml(label) +
        "</span>" +
        '<span class="dependency-chip-remove" aria-hidden="true">&times;</span>' +
        "</button>"
      );
    })
    .join("");

  return chips ? '<div class="dependency-chip-row workbench-tag-chip-row assist-attachment-chip-row">' + chips + "</div>" : "";
}

function renderGeneratePane({ project, editorSupport, includeDismissActions = false }) {
  const courses = getVisibleCourses(project, editorSupport);
  const draft = editorSupport.generationDraft || {};
  const generationUiState = editorSupport.generationUiState || {};
  const modules = generationUiState.modules || [];
  const lessons = generationUiState.lessons || [];
  const modelOptions = (editorSupport.modelOptions || [])
    .map((item) => (
      '<option value="' +
      escapeHtml(item.value) +
      '"' +
      (item.value === editorSupport.selectedModel ? " selected" : "") +
      ">" +
      escapeHtml(item.label) +
      "</option>"
    ))
    .join("");
  const status = draft.errorMessage
    ? '<section class="generate-feedback is-warning"><p>' + escapeHtml(draft.errorMessage) + "</p></section>"
    : draft.lastResult
      ? '<section class="generate-feedback"><p>' +
        escapeHtml(draft.lastResult.message || "") +
        "</p>" +
        (draft.lastResult.openActionLabel
          ? '<button class="open-main generate-feedback-action" type="button" data-action="view-generated-lesson" aria-label="' +
            escapeHtml(draft.lastResult.openActionLabel) +
            '" title="' +
            escapeHtml(draft.lastResult.openActionLabel) +
            '">▶</button>'
          : "") +
        "</section>"
      : "";
  const attachmentInput =
    '<input data-field="generate-attachments" class="assist-attachment-input" type="file" multiple accept=".pdf,.txt,.md,.json,.csv,.html,.xml,.js,.ts,.py,.java,.c,.cpp,.doc,.docx,.ppt,.pptx,.rtf,.odt,.ods,.odp,text/*,application/pdf,application/json,application/xml">';
  const attachmentChips = renderGenerationAttachmentChips(draft.attachments);
  const hasScopedContext = draft.courseFixed || draft.moduleFixed || draft.lessonFixed;
  const existingCourses = courses.map((item) => item.title).filter(Boolean);
  const existingModules = (generationUiState.course?.modules || []).map((item) => item.title).filter(Boolean);
  const existingLessons = (generationUiState.moduleValue?.lessons || []).map((item) => item.title).filter(Boolean);
  const includeTopicChips = renderEditableTopicChips(draft.includeTopics, "remove-generate-include-topic");
  const excludeTopicChips = renderEditableTopicChips(draft.excludeTopics, "remove-generate-exclude-topic");
  return (
    '<section class="home-generate-pane">' +
    '<section class="clean-card generate-card">' +
    (includeDismissActions
      ? '<header class="generation-overlay-header">' +
        '<div class="generation-overlay-heading">' +
        '<h2 class="card-title generation-overlay-title">' +
        escapeHtml(generationUiState.panelTitle || "Gerar estrutura") +
        "</h2>" +
        "</div>" +
        '<div class="lesson-top-actions">' +
        renderGenerateIconButton("clear-generation-scope", "Limpar escopo", "⌂", !hasScopedContext) +
        renderGenerateIconButton("close-generation-panel", "Fechar painel de geração", "×") +
        "</div></header>"
      : "") +
    '<div class="generate-main-stack">' +
    '<section class="microsequence-assist-panel assist-simple-panel generate-plain-section">' +
    renderGenerateSectionTitle("Destino da árvore") +
    renderGenerateInputField({
      field: "generate-course-input",
      iconName: "folder",
      label: "Curso",
      placeholder: "Selecione ou digite um curso",
      value: draft.courseInput || "",
      listId: "generate-course-options",
      options: courses
    }) +
    '<div class="workbench-tag-layout"><div class="dependency-chip-row workbench-tag-chip-row">' +
    renderStaticChips(existingCourses, {
      emptyLabel: "Sem cursos ainda.",
      iconName: "folder",
      action: "select-existing-course",
      dataField: "course-title"
    }) +
    "</div></div>" +
    renderGenerateInputField({
      field: "generate-module-input",
      iconName: "module",
      label: draft.courseKey ? "Módulo novo ou existente" : "Primeiro módulo",
      placeholder: draft.courseKey ? "Selecione um módulo existente ou digite um novo" : "Digite o título do módulo",
      value: draft.moduleInput || "",
      listId: "generate-module-options",
      options: modules,
      disabled: !generationUiState.moduleInputEnabled
    }) +
    (draft.courseKey
      ? '<div class="workbench-tag-layout"><div class="dependency-chip-row workbench-tag-chip-row">' +
        renderStaticChips(existingModules, {
          emptyLabel: "Sem módulos neste curso ainda.",
          iconName: "module",
          action: "select-existing-module",
          dataField: "module-title"
        }) +
        "</div></div>"
      : "") +
    renderGenerateInputField({
      field: "generate-lesson-input",
      iconName: "lesson",
      label: "Lição focal (opcional)",
      placeholder: draft.moduleKey ? "Selecione uma lição existente ou digite uma nova" : "Opcional: digite uma lição para focar a geração",
      value: draft.lessonInput || "",
      listId: "generate-lesson-options",
      options: lessons,
      disabled: !generationUiState.lessonInputEnabled
    }) +
    (draft.moduleKey
      ? '<div class="workbench-tag-layout"><div class="dependency-chip-row workbench-tag-chip-row">' +
        renderStaticChips(existingLessons, {
          emptyLabel: "Sem lições neste módulo ainda.",
          iconName: "lesson",
          action: "select-existing-lesson",
          dataField: "lesson-title"
        }) +
        "</div></div>"
      : "") +
    "</section>" +
    '<div class="generate-divider"></div>' +
    '<section class="microsequence-assist-panel assist-simple-panel generate-plain-section">' +
    renderGenerateSectionTitle("Escopo do módulo") +
    '<div class="workbench-tag-layout">' +
    '<div class="workbench-form-row workbench-tag-picker-row">' +
    renderGenerateIconLabel("ready-state", "O que entra") +
    '<div class="assist-tag-picker">' +
    '<input data-field="generate-include-topic" type="text" class="generate-combobox-input" aria-label="O que entra" title="O que entra" placeholder="Adicionar tópico">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="add-generate-include-topic" title="Adicionar tópico" aria-label="Adicionar tópico">+</button>' +
    "</div></div>" +
    '<div class="dependency-chip-row workbench-tag-chip-row">' +
    includeTopicChips +
    "</div></div>" +
    '<div class="workbench-tag-layout">' +
    '<div class="workbench-form-row workbench-tag-picker-row">' +
    renderGenerateIconLabel("excluded-state", "O que não entra") +
    '<div class="assist-tag-picker">' +
    '<input data-field="generate-exclude-topic" type="text" class="generate-combobox-input" aria-label="O que não entra" title="O que não entra" placeholder="Adicionar exclusão">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="add-generate-exclude-topic" title="Adicionar exclusão" aria-label="Adicionar exclusão">+</button>' +
    "</div></div>" +
    '<div class="dependency-chip-row workbench-tag-chip-row">' +
    excludeTopicChips +
    "</div></div></section>" +
    '<div class="generate-divider"></div>' +
    '<div class="field generate-prompt-field workbench-prompt-field">' +
    '<div class="generate-prompt-layout">' +
    '<div class="generate-prompt-tools">' +
    renderGenerateIconLabel("prompt", "Pedido, conteúdo ou orientação") +
    renderGenerateIconButton("clear-prompt", "Limpar prompt", "↻", false, " workbench-inline-reset") +
    "</div>" +
    '<div class="generate-prompt-content">' +
    '<textarea data-field="generate-prompt" aria-label="Pedido, conteúdo ou orientação" title="Pedido, conteúdo ou orientação" placeholder="Descreva o que você quer gerar neste escopo.">' +
    escapeHtml(draft.promptText || "") +
    "</textarea>" +
    attachmentInput +
    attachmentChips +
    "</div></div></div>" +
    '<div class="generate-divider"></div>' +
    '<div class="generate-action-preview generate-action-preview-compact">' +
    '<div class="generate-action-summary">' +
    renderUiIcon(generationUiState.actionIconName || "sparkles", "generate-action-summary-icon") +
    '<span class="generate-action-summary-text">' +
    escapeHtml(
      generationUiState.actionSummary ||
        generationUiState.actionLabel ||
        generationUiState.actionHelpText ||
        "Ação indisponível."
    ) +
    "</span>" +
    "</div></div>" +
    '<div class="generate-action-row assist-actions assist-actions-wide assist-request-actions">' +
    '<label class="field generate-icon-field generate-model-field workbench-select-field">' +
    renderGenerateIconLabel("intent", "Modelo") +
    '<select data-field="assist-model" aria-label="Modelo" title="Modelo">' +
    modelOptions +
    "</select></label>" +
    renderGenerateIconButton("open-generation-attachment-picker", "Anexar documento", renderUiIcon("lesson", "assist-attachment-button-icon")) +
    renderGenerateIconButton("open-provider-config", "Configurar IA", "&#128273;") +
    '<button class="open-main generate-submit" type="button" data-action="generate-structure" aria-label="' +
    escapeHtml(generationUiState.submitLabel || "Gerar estrutura") +
    '" title="' +
    escapeHtml(generationUiState.submitLabel || "Gerar estrutura") +
    '"' +
    (!generationUiState.canSubmit || draft.isSubmitting ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    renderUiIcon("sparkles", "generate-submit-icon") +
    "</button>" +
    "</div>" +
    status +
    "</div>" +
    renderGenerationProgressPopup(draft.progress, { embedded: includeDismissActions }) +
    "</section></section>"
  );
}

function renderGenerationProgressPopup(progress = {}, { embedded = false } = {}) {
  if (!progress?.visible || progress.status === "idle") {
    return "";
  }

  const phaseIndex = Number(progress.phaseIndex || 0);
  const phaseCount = Number(progress.phaseCount || 0);
  const percent = phaseCount > 0 ? Math.max(4, Math.min(100, (phaseIndex / phaseCount) * 100)) : 8;
  const statusClass =
    progress.status === "completed"
      ? " is-completed"
      : progress.status === "failed"
        ? " is-failed"
        : "";
  const progressLabel = phaseCount > 0 && phaseIndex > 0 ? `${phaseIndex}/${phaseCount}` : "Iniciando";
  const statusLine = summarizeGenerationProgressStatus(progress);
  const phaseItems = listGenerationProgressPhases(phaseCount || 0, progress.phaseIds || [])
    .map((phase, index) => {
      const order = index + 1;
      const itemClass =
        order < phaseIndex
          ? " is-completed"
          : order === phaseIndex
            ? " is-current"
            : "";
      return (
        '<li class="generation-progress-phase-item' +
        itemClass +
        '">' +
        '<span class="generation-progress-phase-index">' +
        escapeHtml(String(order)) +
        "</span>" +
        '<span class="generation-progress-phase-label">' +
        escapeHtml(phase.phaseLabel) +
        "</span></li>"
      );
    })
    .join("");

  return (
    '<aside class="generation-progress-popup' +
    (embedded ? " is-embedded" : "") +
    statusClass +
    '" role="status" aria-live="polite">' +
    '<div class="generation-progress-head">' +
    '<span class="generation-progress-kicker">Top-down</span>' +
    '<span class="generation-progress-count">' +
    escapeHtml(progressLabel) +
    "</span></div>" +
    '<p class="generation-progress-title">' +
    escapeHtml(progress.phaseLabel || "Preparando geração") +
    "</p>" +
    '<p class="generation-progress-message">' +
    escapeHtml(statusLine) +
    "</p>" +
    '<div class="generation-progress-bar" aria-hidden="true"><span style="width:' +
    String(percent) +
    '%"></span></div>' +
    (phaseItems ? '<ol class="generation-progress-phases">' + phaseItems + "</ol>" : "") +
    "</aside>"
  );
}

function renderCoursePreview(course) {
  return (
        '<article class="clean-card course-card progress-card navigation-list-card" data-structure-target="course" data-course-key="' +
        escapeHtml(course.id) +
        '">' +
        '<div class="card-progress-fill" style="width:' +
        String(course.progressPercent) +
        '%"></div>' +
        '<div class="course-copy navigation-main">' +
        renderHomeCourseTitle(course) +
        (course.description
          ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>"
          : "") +
        "</div>" +
        renderHomeCourseMeta(course) +
        '<div class="course-actions navigation-actions">' +
        '<button class="icon-ghost corner-btn" type="button" data-action="open-course-actions" data-course-key="' +
        escapeHtml(course.id) +
        '" title="Ações do curso" aria-label="Ações do curso">⋯</button>' +
        (course.readOnly
          ? ""
          : '<button class="icon-ghost corner-btn" type="button" data-action="open-generation-panel-course" data-course-key="' +
            escapeHtml(course.id) +
            '" title="Gerar neste curso" aria-label="Gerar neste curso">' +
            renderUiIcon("sparkles", "home-tab-icon") +
            "</button>") +
        '<button class="open-main" type="button" data-action="open-course" data-course-key="' +
        escapeHtml(course.id) +
        '" title="Abrir curso" aria-label="Abrir curso">▶</button>' +
        "</div>" +
        "</article>"
  );
}

function renderCoursesPane({ project, progress, editorSupport }) {
  const courses = buildHomeCoursePreviews(project, progress, editorSupport);
  const paths = Array.isArray(editorSupport.studyPaths) ? editorSupport.studyPaths : [];
  if (paths.length) {
    const coursesById = new Map(courses.map((course) => [course.id, course]));
    const assigned = new Set();
    const pathSections = paths.map((path) => {
      const pathCourses = (path.courses || [])
        .map((item) => coursesById.get(item.courseId))
        .filter(Boolean);
      pathCourses.forEach((course) => assigned.add(course.id));
      return (
        '<section class="home-study-path">' +
        '<div class="centered-section-heading-row home-study-path-heading">' +
        renderUiIcon("trail", "home-study-path-icon") +
        '<h2 class="section-heading">' + escapeHtml(path.title || "Trilha") + "</h2></div>" +
        '<div class="navigation-list home-study-path-courses">' +
        (pathCourses.map(renderCoursePreview).join("") || '<p class="tiny muted home-study-path-empty">Sem cursos.</p>') +
        "</div></section>"
      );
    }).join("");
    const unassigned = courses.filter((course) => !assigned.has(course.id));
    return pathSections + (unassigned.length
      ? '<section class="home-study-path"><div class="centered-section-heading-row home-study-path-heading">' +
        '<h2 class="section-heading">Outros</h2></div><div class="navigation-list home-study-path-courses">' +
        unassigned.map(renderCoursePreview).join("") + "</div></section>"
      : "");
  }

  const courseMarkup = courses.map(renderCoursePreview).join("");

  return courseMarkup || '<article class="clean-card"><p class="card-subtitle">Nenhum curso.</p></article>';
}

export function renderGenerationPanelOverlay({ project, editorSupport = {} }) {
  return (
    '<section class="overlay-shell generation-overlay-shell" data-action="dismiss-generation-panel">' +
    '<div class="overlay-panel overlay-panel-side generation-overlay-panel">' +
    renderGeneratePane({ project, editorSupport, includeDismissActions: true }) +
    "</div></section>"
  );
}

export function renderHomeScreen({ project, progress, editorSupport = {} }) {
  return (
    '<section class="screen">' +
    renderCoursesTopbar() +
    '<main class="screen-content courses-home-screen navigation-screen">' +
    renderNavigationContextHeading(editorSupport.studyPaths?.length ? "Trilhas" : "Cursos") +
    '<section class="courses-home-list navigation-list" data-structure-collection="course">' +
    renderCoursesPane({ project, progress, editorSupport }) +
    "</section>" +
    "</main></section>"
  );
}
