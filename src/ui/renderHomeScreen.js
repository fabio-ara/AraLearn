import { readLessonProgressEntry } from "../storage/progressStore.js";
import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { buildScopedVersionLineageLabel, splitVersionLineageLabel } from "./versionLineage.js";
import { renderAssistConfigPanel } from "./renderAssistConfigOverlay.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatVersionTabTimestamp(value) {
  const iso = String(value || "").trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, , month, day, hour, minute] = match;
    return `${day}/${month} ${hour}:${minute}`;
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const pad = (item) => String(item).padStart(2, "0");
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
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

function countLessons(course) {
  return (course.modules || []).reduce((total, moduleValue) => total + (moduleValue.lessons || []).length, 0);
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) => {
    if (!isRunnableMicrosequence(microsequence)) {
      return total;
    }
    return total + (microsequence.cards || []).length;
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
          courseKey: course.key,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key
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
    renderStructureHandle({
      level: "course",
      courseKey: course.key,
      label: `Arrastar curso ${course.title || course.key}`
    }) +
    title +
    "</div>"
  );
}

function buildHomeCoursePreviews(project, progress) {
  return (project.courses || []).map((course) => {
    const completedCount = countCompletedCardsInCourse(course, progress);
    const totalCount = countCardsInCourse(course);
    return {
      key: course.key,
      title: course.title || "Curso",
      description: course.description || "",
      moduleCount: (course.modules || []).length,
      lessonCount: countLessons(course),
      completedCount,
      totalCount,
      progressPercent: totalCount ? Math.max(0, Math.min(100, (completedCount / totalCount) * 100)) : 0
    };
  });
}

function getVisibleCourses(project) {
  return project.courses || [];
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
    '<button class="icon-ghost" type="button" data-action="open-version-history" title="Snapshots do projeto" aria-label="Snapshots do projeto">🕘</button>' +
    '<button class="icon-ghost" type="button" data-action="open-home-actions" title="Ações do app" aria-label="Ações do app">⋯</button>' +
    "</div>" +
    "</header>"
  );
}

function renderStructureVersionTabs({ tabs = [], activeVersionId = "", emptyLabel = "" } = {}) {
  const items = Array.isArray(tabs) ? tabs : [];
  if (!items.length) {
    return emptyLabel ? '<section class="structure-version-tabbar"><p class="card-subtitle">' + escapeHtml(emptyLabel) + "</p></section>" : "";
  }

  return (
    '<section class="structure-version-tabbar">' +
    '<div class="structure-version-strip-shell" data-structure-version-strip-shell="true">' +
    '<div class="editor-version-strip structure-version-strip" role="tablist" aria-label="Versões" data-structure-version-strip="true">' +
    items
      .map((item, index) => {
        const isActive = item.isActive === true || item.versionId === activeVersionId;
        const label = item.lineage || buildScopedVersionLineageLabel(item, items, "C", index);
        const labelParts = splitVersionLineageLabel(label);
        const timestamp = item.timestampLabel || formatVersionTabTimestamp(item.updatedAt || item.createdAt || "");
        return (
          '<button class="editor-version-tab structure-version-tab' +
          (isActive ? " active" : "") +
          '" type="button" role="tab" aria-selected="' +
          (isActive ? "true" : "false") +
          '" data-action="' +
          escapeHtml(item.action || "select-structure-version") +
          '"' +
          (item.versionId ? ' data-version-key="' + escapeHtml(item.versionId) + '"' : "") +
          (item.courseKey ? ' data-course-key="' + escapeHtml(item.courseKey) + '"' : "") +
          (item.moduleKey ? ' data-module-key="' + escapeHtml(item.moduleKey) + '"' : "") +
          (item.lessonKey ? ' data-lesson-key="' + escapeHtml(item.lessonKey) + '"' : "") +
          (item.microsequenceKey ? ' data-microsequence-key="' + escapeHtml(item.microsequenceKey) + '"' : "") +
          ' data-structure-tab="true" title="' +
          escapeHtml(label) +
          '" aria-label="' +
          escapeHtml(label) +
          '">' +
          '<span class="editor-version-tab-main">' +
          (labelParts.origin ? '<span class="editor-version-tab-origin">' + escapeHtml(labelParts.origin) + "</span>" : "") +
          '<span class="editor-version-tab-label">' +
          escapeHtml(labelParts.destination || label) +
          "</span></span>" +
          (timestamp ? '<span class="editor-version-tab-meta">' + escapeHtml(timestamp) + "</span>" : "") +
          "</button>"
        );
      })
      .join("") +
    "</div></div></section>"
  );
}

function renderGenerateIconLabel(iconName, label) {
  return (
    '<span class="generate-icon-label" aria-hidden="true" title="' +
    escapeHtml(label) +
    '">' +
    renderUiIcon(iconName, "generate-field-icon") +
    "</span>"
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

function renderGenerateStatusButton(expanded = false) {
  const title = expanded ? "Ocultar planejamento didático" : "Abrir planejamento didático";
  const icon = renderUiIcon("trail", "assist-config-action-icon");
  return renderGenerateIconButton("open-assist-config", title, icon, false, expanded ? " is-pressed" : "");
}

function renderGenerateScopeButton({ level, iconName, label, pressed = false, disabled = false }) {
  return (
    '<button class="generate-scope-button' +
    (pressed ? " is-pressed" : "") +
    '" type="button" data-action="toggle-generate-level" data-level="' +
    escapeHtml(level) +
    '" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '" aria-pressed="' +
    (pressed ? "true" : "false") +
    '"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon(iconName, "generate-field-icon") +
    "</button>"
  );
}

function renderGenerateComboboxOptions(items) {
  return (items || [])
    .map((item) => {
      const value = item?.title || item?.key || "";
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

function renderGenerateComboboxField({
  level,
  iconName,
  label,
  placeholder,
  value = "",
  listId,
  options = [],
  disabled = false,
  pressed = false,
  buttonDisabled = false
}) {
  return (
    '<div class="field generate-icon-field generate-scope-field">' +
    renderGenerateScopeButton({
      level,
      iconName,
      label: pressed ? `${label} fixado` : `Fixar ${label}`,
      pressed,
      disabled: buttonDisabled
    }) +
    '<div class="generate-combobox-shell">' +
    '<input data-field="generate-' +
    escapeHtml(level) +
    '-input" type="text" class="generate-combobox-input" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '" placeholder="' +
    escapeHtml(placeholder) +
    '" value="' +
    escapeHtml(value) +
    '" list="' +
    escapeHtml(listId) +
    '"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    '<datalist id="' +
    escapeHtml(listId) +
    '">' +
    renderGenerateComboboxOptions(options) +
    "</datalist>" +
    "</div></div>"
  );
}

function renderGenerateSingleOptionToggleField({
  action,
  iconName,
  label,
  value,
  pressed = false,
  disabled = false
}) {
  return (
    '<div class="field generate-icon-field generate-scope-field">' +
    '<button class="generate-scope-button' +
    (pressed ? " is-pressed" : "") +
    '" type="button" data-action="' +
    escapeHtml(action) +
    '" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '" aria-pressed="' +
    (pressed ? "true" : "false") +
    '"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon(iconName, "generate-field-icon") +
    "</button>" +
    '<div class="generate-combobox-shell">' +
    '<input data-field="generate-microsequence-reposition-input" type="text" class="generate-combobox-input" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '" value="' +
    escapeHtml(value) +
    '" readonly disabled aria-disabled="true">' +
    "</div></div>"
  );
}

function renderGeneratePane({ project, editorSupport, includeDismissActions = false }) {
  const courses = getVisibleCourses(project);
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
          ? '<button type="button" data-action="view-generated-lesson">' + escapeHtml(draft.lastResult.openActionLabel) + "</button>"
          : "") +
        "</section>"
      : "";
  const attachmentInput =
    '<input data-field="generate-attachments" class="assist-attachment-input" type="file" multiple accept=".pdf,.txt,.md,.json,.csv,.html,.xml,.js,.ts,.py,.java,.c,.cpp,.doc,.docx,.ppt,.pptx,.rtf,.odt,.ods,.odp,text/*,application/pdf,application/json,application/xml">';
  const attachmentChips = renderGenerationAttachmentChips(draft.attachments);
  const hasScopedContext = draft.courseFixed || draft.moduleFixed || draft.lessonFixed;
  const assistConfigPanel = editorSupport.assistConfigExpanded
    ? '<div class="generate-assist-config-shell">' +
      renderAssistConfigPanel({
        didacticProfileId: editorSupport.didacticProfileId,
        profileTuning: editorSupport.profileTuning,
        didacticProfileOptions: editorSupport.didacticProfileOptions,
        profileEditor: editorSupport.profileEditor,
        inline: true
      }) +
      "</div>"
    : "";
  return (
    '<section class="home-generate-pane">' +
    '<section class="clean-card generate-card">' +
    (includeDismissActions
      ? '<header class="generation-overlay-header">' +
        '<div class="generation-overlay-heading">' +
        '<h2 class="card-title">' +
        escapeHtml(generationUiState.panelTitle || "Gerar estrutura") +
        "</h2>" +
        "</div>" +
        '<div class="lesson-top-actions">' +
        renderGenerateIconButton("clear-generation-scope", "Limpar escopo", "⌂", !hasScopedContext) +
        renderGenerateIconButton("close-generation-panel", "Fechar painel de geração", "×") +
        "</div></header>"
      : "") +
    assistConfigPanel +
    renderGenerateComboboxField({
      level: "course",
      iconName: "folder",
      label: "Curso",
      placeholder: "Selecione ou digite um curso",
      value: draft.courseInput || "",
      listId: "generate-course-options",
      options: courses,
      disabled: !draft.courseFixed,
      pressed: draft.courseFixed === true
    }) +
    renderGenerateComboboxField({
      level: "module",
      iconName: "module",
      label: "Módulo",
      placeholder: "Selecione ou digite um módulo",
      value: draft.moduleInput || "",
      listId: "generate-module-options",
      options: modules,
      disabled: !generationUiState.moduleInputEnabled,
      pressed: draft.moduleFixed === true,
      buttonDisabled: !generationUiState.moduleToggleEnabled
    }) +
    renderGenerateComboboxField({
      level: "lesson",
      iconName: "lesson",
      label: "Lição",
      placeholder: "Selecione ou digite uma lição",
      value: draft.lessonInput || "",
      listId: "generate-lesson-options",
      options: lessons,
      disabled: !generationUiState.lessonInputEnabled,
      pressed: draft.lessonFixed === true,
      buttonDisabled: !generationUiState.lessonToggleEnabled
    }) +
    '<div class="generate-divider"></div>' +
    '<label class="field generate-icon-field generate-prompt-field">' +
    renderGenerateIconLabel("prompt", "Pedido, conteúdo ou orientação") +
    '<textarea data-field="generate-prompt" aria-label="Pedido, conteúdo ou orientação" title="Pedido, conteúdo ou orientação" placeholder="Descreva o que você quer gerar neste escopo.">' +
    escapeHtml(draft.promptText || "") +
    "</textarea></label>" +
    attachmentInput +
    attachmentChips +
    '<div class="generate-inline-action-row">' +
    '<div class="generate-inline-action-spacer" aria-hidden="true"></div>' +
    renderGenerateIconButton("clear-prompt", "Limpar prompt", "↻") +
    "</div>" +
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
    '<div class="generate-action-row">' +
    '<label class="field generate-icon-field generate-model-field">' +
    renderGenerateIconLabel("intent", "Modelo") +
    '<select data-field="assist-model" aria-label="Modelo" title="Modelo">' +
    modelOptions +
    "</select></label>" +
    renderGenerateStatusButton(editorSupport.assistConfigExpanded === true) +
    renderGenerateIconButton("open-generation-attachment-picker", "Anexar documento", renderUiIcon("lesson", "assist-attachment-button-icon")) +
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
    "</section>" +
    status +
    "</section>"
  );
}

function renderCoursesPane({ project, progress }) {
  const courses = buildHomeCoursePreviews(project, progress)
    .map((course) => {
      return (
        '<article class="clean-card course-card progress-card navigation-list-card" data-structure-target="course" data-course-key="' +
        escapeHtml(course.key) +
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
        escapeHtml(course.key) +
        '" title="Ações do curso" aria-label="Ações do curso">⋯</button>' +
        '<button class="icon-ghost corner-btn" type="button" data-action="open-generation-panel-course" data-course-key="' +
        escapeHtml(course.key) +
        '" title="Gerar neste curso" aria-label="Gerar neste curso">' +
        renderUiIcon("sparkles", "home-tab-icon") +
        "</button>" +
        '<button class="open-main" type="button" data-action="open-course" data-course-key="' +
        escapeHtml(course.key) +
        '" title="Abrir curso" aria-label="Abrir curso">▶</button>' +
        "</div>" +
        "</article>"
      );
    })
    .join("");

  return courses || '<article class="clean-card"><p class="card-subtitle">Nenhum curso.</p></article>';
}

export function renderGenerationPanelOverlay({ project, editorSupport = {} }) {
  return (
    '<section class="overlay-shell" data-action="dismiss-generation-panel">' +
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
    '<section class="courses-home-list navigation-list" data-structure-collection="course">' +
    renderCoursesPane({ project, progress }) +
    "</section>" +
    "</main></section>"
  );
}
