import { renderHomeScreen } from "./renderHomeScreen.js";
import { readCardText } from "../core/cardRuntime.js";
import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocksWithDock,
  renderPopupButtonDock
} from "../render/renderCardRuntime.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { buildManualCardEditModel } from "./manualCardEdit.js";
import {
  isDraftMicrosequence,
  isRunnableMicrosequence,
  resolveMicrosequenceRuntimeIncluded
} from "../model/microsequenceStatus.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function getStructureHandleTitle(level) {
  if (level === "course") return "Arrastar curso";
  if (level === "module") return "Arrastar módulo";
  if (level === "lesson") return "Arrastar lição";
  if (level === "microsequence") return "Arrastar microssequência";
  return "Arrastar item";
}

function renderStructureHandle({
  level,
  courseKey = "",
  moduleKey = "",
  lessonKey = "",
  microsequenceKey = "",
  label,
  disabled = false
}) {
  return (
    '<button class="icon-ghost tiny-icon builder-tool-handle" type="button" draggable="true" data-action="structure-drag-handle" data-structure-level="' +
    escapeHtml(level) +
    '" data-course-key="' +
    escapeHtml(courseKey) +
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
    '"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    '>' +
    renderUiIcon("drag", "home-tab-icon") +
    "</button>"
  );
}

function renderTopbar({
  title,
  canGoBack,
  backTitle = "Voltar",
  backAction = "go-back",
  subtitle = "",
  actions = []
}) {
  const actionMarkup = actions.length
    ? actions
      .map((action) => {
        return (
          '<button class="icon-ghost" type="button" data-action="' +
          escapeHtml(action.action) +
          '"' +
          (action.courseKey ? ' data-course-key="' + escapeHtml(action.courseKey) + '"' : "") +
          (action.moduleKey ? ' data-module-key="' + escapeHtml(action.moduleKey) + '"' : "") +
          (action.lessonKey ? ' data-lesson-key="' + escapeHtml(action.lessonKey) + '"' : "") +
          ' title="' +
          escapeHtml(action.title) +
          '" aria-label="' +
          escapeHtml(action.title) +
          '"' +
          (action.disabled ? ' disabled aria-disabled="true"' : "") +
          '>' +
          action.icon +
          "</button>"
        );
      })
      .join("")
    : '<div class="topbar-space"></div>';

  return (
    '<header class="topbar lesson-topbar navigation-topbar">' +
    (canGoBack
      ? '<button class="icon-ghost" type="button" data-action="' +
        escapeHtml(backAction) +
        '" title="' +
        escapeHtml(backTitle) +
        '" aria-label="' +
        escapeHtml(backTitle) +
        '">' +
        renderUiIcon("arrow-left", "home-tab-icon") +
        "</button>"
      : '<div class="topbar-space"></div>') +
    '<div class="topbar-heading">' +
    '<div class="topbar-title">' +
    escapeHtml(title) +
    "</div>" +
    (subtitle ? '<div class="topbar-subtitle tiny muted">' + escapeHtml(subtitle) + "</div>" : "") +
    "</div>" +
    '<div class="lesson-top-actions">' +
    actionMarkup +
    "</div>" +
    "</header>"
  );
}

function renderSectionHeading(title) {
  return (
    '<section class="section-heading-row centered-section-heading-row navigation-heading-row">' +
    '<h2 class="section-heading">' +
    escapeHtml(title) +
    "</h2></section>"
  );
}

function resolveModuleScreenContextTitle(moduleValue) {
  return moduleValue?.title || "Módulo";
}

function entityId(entity) {
  return typeof entity?.id === "string" ? entity.id : "";
}

function cardsOfMicrosequence(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce(
    (total, microsequence) => total + (isRunnableMicrosequence(microsequence) ? cardsOfMicrosequence(microsequence).length : 0),
    0
  );
}

function countCardsInMicrosequence(microsequence) {
  return cardsOfMicrosequence(microsequence).length;
}

function countCompletedCardsInLesson(course, moduleValue, lesson, progress) {
  const entry = readLessonProgressEntry(progress, {
    courseKey: entityId(course),
    moduleKey: entityId(moduleValue),
    lessonKey: entityId(lesson)
  });
  return entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys.length : 0;
}

function countCompletedCardsInMicrosequence(course, moduleValue, lesson, microsequence, progress) {
  const entry = readLessonProgressEntry(progress, {
    courseKey: entityId(course),
    moduleKey: entityId(moduleValue),
    lessonKey: entityId(lesson)
  });
  const completedCardKeys = entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys : [];
  const cardKeys = new Set(cardsOfMicrosequence(microsequence).map((card) => card.id));
  return completedCardKeys.reduce((total, key) => total + (cardKeys.has(key) ? 1 : 0), 0);
}

function countCardsInModule(moduleValue) {
  return (moduleValue.lessons || []).reduce((total, lesson) => total + countCardsInLesson(lesson), 0);
}

function countCompletedCardsInModule(course, moduleValue, progress) {
  return (moduleValue.lessons || []).reduce(
    (total, lesson) => total + countCompletedCardsInLesson(course, moduleValue, lesson, progress),
    0
  );
}

function calculateProgressPercent(completed, total) {
  return total ? Math.max(0, Math.min(100, (completed / total) * 100)) : 0;
}

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, maxLength = 120) {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getLessonDescription(lesson) {
  const explicitDescription = normalizeInlineText(lesson?.guide?.goal || lesson?.description);
  if (explicitDescription) {
    return truncateText(explicitDescription);
  }

  for (const microsequence of lesson.microsequences || []) {
    const refs = normalizeInlineText((microsequence.dependsOn || []).join(", "));
    if (refs) {
      return truncateText(refs);
    }
  }

  for (const microsequence of lesson.microsequences || []) {
    for (const card of cardsOfMicrosequence(microsequence)) {
      const text = normalizeInlineText(readCardText(card));
      if (text) {
        return truncateText(text);
      }
    }
  }

  return "";
}

function summarizeIconTitle(label) {
  const text = String(label || "").trim();
  const match = text.match(/^[^:]+:\s*(.+)$/);
  return match ? match[1].trim() : text;
}

function normalizeCardAssistanceState(editorSupport = {}, activeCard = null) {
  const value = editorSupport.cardAssistanceState || {};
  return {
    operation: "repair",
    wholeCardSelected: value.wholeCardSelected === true,
    repairScope: value.repairScope === "resources" ? "resources" : "card",
    resourceTargetIds: Array.isArray(value.resourceTargetIds)
      ? value.resourceTargetIds.map((targetId) => String(targetId || "")).filter(Boolean)
      : [],
    selectedCardKeys: Array.isArray(value.selectedCardKeys)
      ? value.selectedCardKeys.map((cardKey) => String(cardKey || "")).filter(Boolean)
      : activeCard?.id ? [String(activeCard.id)] : []
  };
}

function renderManualCardEditor(
  card,
  targetId,
  editorSupport = {},
  disabled = false,
  draftValues = null
) {
  const model = card ? buildManualCardEditModel(card, targetId) : null;
  if (!model) return "";
  const draft = draftValues && typeof draftValues === "object" ? draftValues : {};
  const compactSingleField = targetId !== "card" &&
    model.fields.length === 1 &&
    !Array.isArray(model.options) &&
    !(Array.isArray(model.columns) && Array.isArray(model.rows));
  const fields = model.fields.map((field, index) => {
    const value = Object.hasOwn(draft, field.key) ? draft[field.key] : field.value;
    const useCompactInput = compactSingleField &&
      model.targetKind === "heading" &&
      field.type === "textarea" &&
      String(value).length <= 120 &&
      !String(value).includes("\n");
    const control = field.type === "textarea" && !useCompactInput
      ? '<textarea data-manual-edit-key="' + escapeHtml(field.key) + '" aria-label="' +
        escapeHtml(field.label) + '"' + (index === 0 ? ' data-card-authoring-focus="manual-first-field"' : "") +
        '>' + escapeHtml(value) + "</textarea>"
      : '<input data-manual-edit-key="' + escapeHtml(field.key) + '" type="text" value="' +
        escapeHtml(value) + '" aria-label="' + escapeHtml(field.label) + '"' +
        (index === 0 ? ' data-card-authoring-focus="manual-first-field"' : "") + '>';
    return '<label class="manual-card-edit-field"><span>' + escapeHtml(field.label) +
      "</span>" + control + "</label>";
  }).join("");
  const optionValues = Array.isArray(draft.optionValues) ? draft.optionValues : [];
  const correctOptionIndexes = Object.hasOwn(draft, "correctOptionIndexes")
    ? new Set(Array.isArray(draft.correctOptionIndexes) ? draft.correctOptionIndexes.map(Number) : [])
    : null;
  const options = Array.isArray(model.options)
      ? '<section class="manual-card-choice-options" aria-label="Alternativas">' +
      model.options.map((option) => {
        const optionValue = Object.hasOwn(optionValues, option.index)
          ? optionValues[option.index]
          : option.value;
        const correct = correctOptionIndexes
          ? correctOptionIndexes.has(option.index)
          : option.correct;
        return (
        '<label class="manual-card-choice-option"><input type="checkbox" data-manual-correct-index="' +
        String(option.index) + '"' + (correct ? " checked" : "") +
        ' aria-label="Alternativa ' + String(option.index + 1) +
        ' correta"><input type="text" data-manual-option-index="' +
        String(option.index) + '" value="' + escapeHtml(optionValue) +
        '" aria-label="Texto da alternativa ' + String(option.index + 1) + '"></label>'
        );
      }).join("") + "</section>"
    : "";
  const columns = Array.isArray(draft.columns) ? draft.columns : model.columns;
  const rows = Array.isArray(draft.rows) ? draft.rows : model.rows;
  const table = Array.isArray(model.columns) && Array.isArray(model.rows)
    ? '<section class="manual-card-table-fields" aria-label="Tabela"><div class="manual-card-table-row">' +
      columns.map((column, index) =>
        '<input type="text" data-manual-column-index="' + String(index) + '" value="' +
        escapeHtml(column) + '" aria-label="Cabeçalho ' + String(index + 1) + '">'
      ).join("") + "</div>" +
      rows.map((row, rowIndex) => '<div class="manual-card-table-row">' +
        row.map((cell, columnIndex) =>
          '<input type="text" data-manual-cell-row="' + String(rowIndex) +
          '" data-manual-cell-column="' + String(columnIndex) + '" value="' +
          escapeHtml(cell) + '" aria-label="Célula ' + String(rowIndex + 1) + ", " +
          String(columnIndex + 1) + '">'
      ).join("") + "</div>").join("") + "</section>"
    : "";
  return (
    '<section class="runtime-card-manual-editor manual-card-editor' +
    (targetId === "card" ? " is-card-title-editor" : " is-resource-editor") +
    (compactSingleField ? " is-single-field-resource-editor" : "") +
    '" data-manual-target-id="' + escapeHtml(targetId) +
    '" aria-label="Edição manual"><div class="manual-card-editor-body">' +
    fields + options + table +
    '<div class="manual-card-editor-actions">' +
    '<button class="open-main" type="button" data-action="save-manual-card-edit" title="Salvar edição" aria-label="Salvar edição"' +
    (disabled ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("ready-state", "manual-card-editor-icon") + "</button></div>" +
    (editorSupport.manualCardEditError
      ? '<p class="card-assistance-message" role="status">' +
        escapeHtml(editorSupport.manualCardEditError) + "</p>"
      : "") +
    "</div></section>"
  );
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

function renderCountMetric(iconName, count, singular, plural) {
  return renderMetaMetric(iconName, String(count), formatCount(count, singular, plural));
}

function renderExplicitTags(tags, rowClass = "didactic-tag-row") {
  const visibleTags = (tags || []).slice(0, 5);
  if (!visibleTags.length) {
    return "";
  }

  const tagMarkup = visibleTags
    .map((tag) => {
      return (
        '<span class="didactic-tag dependency-tag-chip">' +
        '<span class="didactic-tag-text">' +
        escapeHtml(tag) +
        "</span>" +
        "</span>"
      );
    })
    .join("");

  return '<div class="' + escapeHtml(rowClass) + '">' + tagMarkup + "</div>";
}

function buildMicrosequenceTitleMap(lesson = {}) {
  return new Map(
    (Array.isArray(lesson?.microsequences) ? lesson.microsequences : [])
      .map((item) => [String(item?.id || "").trim().toLowerCase(), item?.title || item?.id || ""])
      .filter((entry) => entry[0] && entry[1])
  );
}

function resolveMicrosequenceRefTitles(refIds = [], lesson = {}) {
  const titleMap = buildMicrosequenceTitleMap(lesson);
  return (Array.isArray(refIds) ? refIds : []).map((refId) => titleMap.get(String(refId || "").trim().toLowerCase()) || String(refId || "").trim()).filter(Boolean);
}

function renderCompactRuntimeRefs(refIds, refs) {
  const normalizedRefIds = Array.isArray(refIds) ? refIds.filter(Boolean) : [];
  if (!normalizedRefIds.length) {
    return "";
  }

  const dependencyMap = new Map(
    (refs || []).map((item) => [String(item.id || "").trim().toLowerCase(), item.title || item.id || ""])
  );
  const labels = normalizedRefIds.map((refId) => dependencyMap.get(String(refId).trim().toLowerCase()) || String(refId));
  const visibleLabels = labels.slice(0, 2);
  const hiddenCount = Math.max(0, labels.length - visibleLabels.length);
  return (
    visibleLabels
      .map((label) => {
        return (
          '<span class="didactic-tag dependency-tag-chip light-tag">' +
          '<span class="didactic-tag-text">' +
          escapeHtml(label) +
          "</span></span>"
        );
      })
      .join("") +
    (hiddenCount
      ? '<span class="didactic-tag dependency-tag-chip light-tag light-tag-more"><span class="didactic-tag-text">+' +
        String(hiddenCount) +
        "</span></span>"
      : "")
  );
}

function renderMetaLine({ completed, total, parts = [] }) {
  const normalizedParts = parts.filter(Boolean);
  const items = [renderMetaMetric("progress", `${completed}/${total}`, `Progresso: ${completed}/${total}`), ...normalizedParts];
  return (
    '<p class="muted tiny progress-meta">' +
    items.join('<span class="progress-meta-separator" aria-hidden="true">·</span>') +
    "</p>"
  );
}

function entityMode(editorSupport, level) {
  const requested = editorSupport?.entityModes?.[level];
  if (requested === "edit" || requested === "ai") return requested;
  return "view";
}

function structureTargetAttributes({
  level,
  courseKey = "",
  moduleKey = "",
  lessonKey = "",
  microsequenceKey = "",
  cardKey = ""
}) {
  return (
    ' data-structure-level="' + escapeHtml(level) + '"' +
    ' data-course-key="' + escapeHtml(courseKey) + '"' +
    (moduleKey ? ' data-module-key="' + escapeHtml(moduleKey) + '"' : "") +
    (lessonKey ? ' data-lesson-key="' + escapeHtml(lessonKey) + '"' : "") +
    (microsequenceKey ? ' data-microsequence-key="' + escapeHtml(microsequenceKey) + '"' : "") +
    (cardKey ? ' data-card-key="' + escapeHtml(cardKey) + '"' : "")
  );
}

function inlineStructureTargetMatches(editorSupport, target) {
  const active = editorSupport?.inlineStructureEditor;
  if (!active || active.level !== target.level) return false;
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey", "cardKey"]
    .every((key) => String(active[key] || "") === String(target[key] || ""));
}

function renderInlineStructureEditor({ target, title, description, submitting = false, errorMessage = "" }) {
  const attributes = structureTargetAttributes(target);
  return (
    '<section class="inline-entity-editor structure-inline-entity-editor" data-inline-structure-editor="true">' +
    '<input class="inline-entity-title" data-field="inline-entity-title" data-card-authoring-focus="inline-structure-title" type="text" value="' +
    escapeHtml(title || "") + '" aria-label="Título">' +
    '<textarea class="inline-entity-description" data-field="inline-entity-description" aria-label="Descrição">' +
    escapeHtml(description || "") + "</textarea>" +
    '<div class="inline-entity-actions">' +
    '<button class="icon-ghost" type="button" data-action="close-inline-structure-entity"' + attributes +
    ' title="Fechar edição" aria-label="Fechar edição"' +
    (submitting ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("preview", "entity-mode-icon") + "</button>" +
    '<button class="open-main inline-entity-save" type="button" data-action="save-inline-entity"' + attributes +
    ' title="Salvar" aria-label="Salvar"' +
    (submitting ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("ready-state", "entity-mode-icon") + "</button></div>" +
    (errorMessage ? '<p class="card-assistance-message" role="status">' + escapeHtml(errorMessage) + "</p>" : "") +
    "</section>"
  );
}

function renderEntityModeSwitcher(level, mode, canAuthorContent, { allowAi = false } = {}) {
  if (!canAuthorContent) return "";
  const options = [
    ["view", "Visualizar", "preview"],
    ["edit", "Editar", "edit"],
    ...(allowAi ? [["ai", "Assistência por IA", "sparkles"]] : [])
  ];
  return (
    '<nav class="entity-mode-switcher" role="group" aria-label="Modo">' +
    options.map(([value, label, icon]) =>
      '<button class="entity-mode-button' + (mode === value ? " is-selected" : "") +
      '" type="button" data-action="select-entity-mode" data-entity-level="' +
      escapeHtml(level) + '" data-entity-mode="' + value + '" aria-pressed="' +
      (mode === value ? "true" : "false") + '" title="' + escapeHtml(label) +
      '" aria-label="' + escapeHtml(label) + '">' +
      renderUiIcon(icon, "entity-mode-icon") + "</button>"
    ).join("") +
    "</nav>"
  );
}

function renderEntitySummary({
  level,
  title,
  description,
  mode,
  assistanceState,
  submitting = false,
  target,
  inlineEditing = false,
  errorMessage = ""
}) {
  if (inlineEditing) {
    return renderInlineStructureEditor({ target, title, description, submitting, errorMessage });
  }
  const selected = mode === "ai" && assistanceState?.kind === "container";
  const content = '<strong>' + escapeHtml(title || "") + "</strong>" +
    (description ? '<p>' + escapeHtml(description) + "</p>" : "");
  if (mode === "ai") {
    return (
      '<button class="bottom-up-container-target' + (selected ? " is-selected" : "") +
      '" type="button" data-action="toggle-bottom-up-container" data-assistance-level="' +
      escapeHtml(level) + '" aria-pressed="' + (selected ? "true" : "false") + '"' +
      (submitting ? ' disabled aria-disabled="true"' : "") + '>' + content + "</button>"
    );
  }
  return (
    '<section class="entity-summary' + (mode === "edit" ? " is-editable" : "") + '">' + content +
    (mode === "edit"
      ? '<button class="icon-ghost" type="button" data-action="edit-entity-direct"' +
        structureTargetAttributes(target) + ' title="Editar" aria-label="Editar">' +
        renderUiIcon("edit", "entity-mode-icon") + "</button>"
      : "") +
    "</section>"
  );
}

function renderBottomUpComposer(editorSupport, level) {
  const assistance = editorSupport.bottomUpAssistance || {};
  const submitting = assistance.isSubmitting === true;
  return (
    '<section class="bottom-up-composer" aria-label="Assistência por IA">' +
    '<textarea data-field="bottom-up-assist-prompt" data-card-authoring-focus="bottom-up-ai-prompt" aria-label="Pedido para a IA" placeholder="Descreva a alteração desejada."' +
    (submitting ? ' disabled aria-disabled="true"' : "") + '>' +
    escapeHtml(assistance.promptText || "") + "</textarea>" +
    '<div class="bottom-up-composer-actions">' +
    '<button class="icon-ghost" type="button" data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA"' +
    (submitting ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("key", "entity-mode-icon") + "</button>" +
    '<button class="open-main" type="button" data-action="submit-bottom-up-assistance" data-assistance-level="' +
    escapeHtml(level) + '" title="Enviar" aria-label="Enviar"' +
    (!assistance.ready || submitting ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("sparkles", "entity-mode-icon") + "</button></div>" +
    (assistance.errorMessage
      ? '<p class="card-assistance-message" role="status">' + escapeHtml(assistance.errorMessage) + "</p>"
      : "") +
    "</section>"
  );
}

function renderBottomUpAssistanceDock(editorSupport, level) {
  const assistance = editorSupport.bottomUpAssistance || {};
  const composerOpen = assistance.composerOpen === true;
  const submitting = assistance.isSubmitting === true;
  const toggleTitle = composerOpen ? "Ocultar pedido" : "Escrever pedido para a IA";
  return (
    '<nav class="study-reader-footer bottom-up-assistance-dock" aria-label="Assistência por IA">' +
    '<div class="study-action-dock"><div class="study-action-stack"><div class="study-next-wrap">' +
    (assistance.canUndo
      ? '<button class="icon-ghost" type="button" data-action="undo-bottom-up-assistance" title="Desfazer" aria-label="Desfazer"' +
        (submitting ? ' disabled aria-disabled="true"' : "") + '>' +
        renderUiIcon("arrow-left", "entity-mode-icon") + "</button>"
      : "") +
    '<button class="open-mini study-continue-btn" type="button" data-action="toggle-bottom-up-composer" data-assistance-level="' +
    escapeHtml(level) + '" aria-expanded="' + (composerOpen ? "true" : "false") + '" title="' +
    escapeHtml(toggleTitle) + '" aria-label="' + escapeHtml(toggleTitle) + '"' +
    (submitting ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("sparkles", "home-tab-icon") +
    "</button></div></div></div></nav>"
  );
}

function isPlannedMicrosequence(microsequence) {
  return isDraftMicrosequence(microsequence) && countCardsInMicrosequence(microsequence) === 0;
}

function renderMicrosequenceStateIcon(microsequence) {
  if (!isPlannedMicrosequence(microsequence)) return "";
  return (
    '<span class="microsequence-state-icon is-draft" aria-label="Microssequência planejada" title="Microssequência planejada">' +
    renderUiIcon("draft-state", "microsequence-state-icon-svg") +
    "</span>"
  );
}

function renderHierarchyItemCard({
  level,
  courseKey = "",
  moduleKey = "",
  lessonKey = "",
  microsequenceKey = "",
  itemKey = "",
  cardIndex = 0,
  title,
  description = "",
  supportingHtml = "",
  metaHtml,
  openAction = "",
  openIcon = "play",
  progressPercent = 0,
  dragLabel,
  openTitle,
  leadingIconHtml = "",
  openDisabled = false,
  authoringMode = false,
  selectable = false,
  selected = false,
  selectionLevel = "",
  selectionDisabled = false,
  inlineEditing = false,
  submitting = false,
  errorMessage = "",
  permissions = { canEdit: false, canDelete: false }
}) {
  const target = {
    level,
    courseKey,
    moduleKey: level === "module" ? itemKey : moduleKey,
    lessonKey: level === "lesson" ? itemKey : lessonKey,
    microsequenceKey: level === "microsequence" ? itemKey : level === "card" ? microsequenceKey : "",
    cardKey: level === "card" ? itemKey : ""
  };
  const targetAttributes = structureTargetAttributes(target);
  const progress = String(Math.max(0, Math.min(100, Number(progressPercent) || 0)));
  const selectionAttributes = selectable
    ? ' role="button" tabindex="' + (selectionDisabled ? "-1" : "0") +
      '" data-action="toggle-bottom-up-item" data-assistance-level="' +
      escapeHtml(selectionLevel) + '" data-assistance-item-id="' + escapeHtml(itemKey) +
      '" aria-pressed="' + (selected ? "true" : "false") + '" aria-label="' +
      (selected ? "Retirar da seleção " : "Selecionar ") +
      escapeHtml(title) + '"' + (selectionDisabled ? ' aria-disabled="true"' : "")
    : "";

  if (inlineEditing) {
    return (
      '<article class="clean-card progress-card structure-list-card navigation-list-card is-inline-structure-editing" data-structure-target="' +
      escapeHtml(level) + '"' + targetAttributes + ">" +
      '<div class="card-progress-fill" style="width:' + progress + '%"></div>' +
      '<div class="structure-inline-card-content">' +
      renderInlineStructureEditor({ target, title, description, submitting, errorMessage }) +
      "</div></article>"
    );
  }

  return (
    '<article class="clean-card progress-card structure-list-card navigation-list-card' +
    (selectable ? " bottom-up-selectable-card" : "") +
    (selected ? " is-selected" : "") +
    '" data-structure-target="' +
    escapeHtml(level) +
    '"' +
    targetAttributes +
    selectionAttributes +
    ">" +
    '<div class="card-progress-fill" style="width:' +
    progress +
    '%"></div>' +
    '<div class="lesson-copy structure-copy navigation-main">' +
    '<div class="structure-title-row navigation-title-row">' +
    (authoringMode && level !== "card" ? renderStructureHandle({
      level,
      courseKey: target.courseKey,
      moduleKey: target.moduleKey,
      lessonKey: target.lessonKey,
      microsequenceKey: target.microsequenceKey,
      label: dragLabel,
      disabled: !permissions.canEdit
    }) : "") +
    '<h3 class="card-title">' +
    leadingIconHtml +
    escapeHtml(title) +
    "</h3></div>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    supportingHtml +
    "</div>" +
    metaHtml +
    (selectable
      ? ""
      : '<div class="lesson-actions structure-actions navigation-actions">' +
    '<button class="icon-ghost" type="button" data-action="reset-entity-progress-direct"' +
    targetAttributes +
    ' title="Zerar progresso" aria-label="Zerar progresso">' +
    renderUiIcon("rotate", "home-tab-icon") +
    "</button>" +
    (authoringMode ? '<button class="icon-ghost" type="button" data-action="edit-entity-direct"' +
    targetAttributes +
    (level === "card" ? ' data-card-index="' + String(cardIndex) + '"' : "") +
    ' title="Editar" aria-label="Editar"' +
    (permissions.canEdit ? "" : ' disabled aria-disabled="true"') +
    '>' +
    renderUiIcon("edit", "home-tab-icon") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="delete-entity-direct"' +
    targetAttributes +
    ' title="Excluir" aria-label="Excluir"' +
    (permissions.canDelete ? "" : ' disabled aria-disabled="true"') +
    '>' +
    renderUiIcon("trash", "home-tab-icon") +
    "</button>" : "") +
    (openAction
      ? '<button class="open-mini" type="button" data-action="' +
        escapeHtml(openAction) +
    '"' + targetAttributes +
    (level === "card" ? ' data-card-index="' + String(cardIndex) + '"' : "") +
    ' title="' +
    escapeHtml(openTitle) +
    '" aria-label="' +
    escapeHtml(openTitle) +
    '"' +
    (openDisabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon(openIcon, "home-tab-icon") +
    "</button>"
      : "") +
    "</div>") +
    "</article>"
  );
}

function renderCourseScreen({ course, progress, editorSupport }) {
  const permissions = editorSupport.coursePermissions;
  const canAuthorContent = permissions?.canAuthorContent === true;
  const mode = canAuthorContent ? entityMode(editorSupport, "course") : "view";
  const modules = (course.modules || [])
    .map((moduleValue) => {
      const target = {
        level: "module",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue)
      };
      const moduleCompleted = countCompletedCardsInModule(course, moduleValue, progress);
      const moduleTotal = countCardsInModule(moduleValue);
      return renderHierarchyItemCard({
        level: "module",
        courseKey: entityId(course),
        itemKey: entityId(moduleValue),
        title: moduleValue.title || entityId(moduleValue),
        description: normalizeInlineText(moduleValue?.guide?.goal || ""),
        progressPercent: calculateProgressPercent(moduleCompleted, moduleTotal),
        metaHtml: renderMetaLine({
          completed: moduleCompleted,
          total: moduleTotal,
          parts: [renderCountMetric("lesson", (moduleValue.lessons || []).length, "lição", "lições")]
        }),
        openAction: "open-module",
        dragLabel: `Arrastar módulo ${moduleValue.title || entityId(moduleValue)}`,
        openTitle: "Abrir módulo",
        authoringMode: mode === "edit",
        inlineEditing: inlineStructureTargetMatches(editorSupport, target),
        submitting: editorSupport.entitySaving,
        errorMessage: editorSupport.entityMutationError,
        permissions
      });
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: "Curso",
      canGoBack: true,
      backAction: "go-back",
      backTitle: "Menu principal",
      actions: [
        canAuthorContent
          ? { action: "open-context-observation", title: "Observações do curso", icon: renderUiIcon("prompt", "home-tab-icon") }
          : null,
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content course-screen" data-structure-collection="module" data-course-key="' +
    escapeHtml(entityId(course)) +
    '">' +
    renderEntityModeSwitcher("course", mode, canAuthorContent) +
    renderEntitySummary({
      level: "course",
      title: course.title || "Curso",
      description: normalizeInlineText(course.goal || ""),
      mode,
      target: { level: "course", courseKey: entityId(course) },
      inlineEditing: inlineStructureTargetMatches(editorSupport, {
        level: "course",
        courseKey: entityId(course)
      }),
      submitting: editorSupport.entitySaving,
      errorMessage: editorSupport.entityMutationError
    }) +
    renderSectionHeading("Módulos") +
    '<section class="navigation-list structure-navigation-list" data-structure-collection="module" data-course-key="' +
    escapeHtml(entityId(course)) +
    '">' +
    (modules || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem módulos.</p></section>') +
    "</section>" +
    "</main></section>"
  );
}

function renderModuleScreen({ course, moduleValue, progress, editorSupport }) {
  const permissions = editorSupport.coursePermissions;
  const canAuthorContent = permissions?.canAuthorContent === true;
  const mode = canAuthorContent ? entityMode(editorSupport, "module") : "view";
  const lessons = (moduleValue.lessons || [])
    .map((lesson) => {
      const target = {
        level: "lesson",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue),
        lessonKey: entityId(lesson)
      };
      const lessonCompleted = countCompletedCardsInLesson(course, moduleValue, lesson, progress);
      const lessonTotal = countCardsInLesson(lesson);
      return renderHierarchyItemCard({
        level: "lesson",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue),
        itemKey: entityId(lesson),
        title: lesson.title || entityId(lesson),
        description: getLessonDescription(lesson),
        progressPercent: calculateProgressPercent(lessonCompleted, lessonTotal),
        metaHtml: renderMetaLine({
          completed: lessonCompleted,
          total: lessonTotal,
          parts: [renderCountMetric("microsequence", (lesson.microsequences || []).length, "microssequência", "microssequências")]
        }),
        openAction: "open-lesson",
        dragLabel: `Arrastar lição ${lesson.title || entityId(lesson)}`,
        openTitle: "Abrir lição",
        authoringMode: mode === "edit",
        inlineEditing: inlineStructureTargetMatches(editorSupport, target),
        submitting: editorSupport.entitySaving,
        errorMessage: editorSupport.entityMutationError,
        permissions
      });
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: "Módulo",
      canGoBack: true,
      backAction: "go-back",
      backTitle: "Voltar",
      actions: [
        canAuthorContent
          ? { action: "open-context-observation", title: "Observações do módulo", icon: renderUiIcon("prompt", "home-tab-icon") }
          : null,
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content course-screen" data-structure-collection="lesson" data-course-key="' +
    escapeHtml(entityId(course)) +
    '" data-module-key="' +
    escapeHtml(entityId(moduleValue)) +
    '">' +
    renderEntityModeSwitcher("module", mode, canAuthorContent) +
    renderEntitySummary({
      level: "module",
      title: moduleValue.title || resolveModuleScreenContextTitle(moduleValue),
      description: normalizeInlineText(moduleValue.goal || moduleValue?.guide?.goal || ""),
      mode,
      target: {
        level: "module",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue)
      },
      inlineEditing: inlineStructureTargetMatches(editorSupport, {
        level: "module",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue)
      }),
      submitting: editorSupport.entitySaving,
      errorMessage: editorSupport.entityMutationError
    }) +
    renderSectionHeading("Lições") +
    '<section class="navigation-list structure-navigation-list" data-structure-collection="lesson" data-course-key="' +
    escapeHtml(entityId(course)) +
    '" data-module-key="' +
    escapeHtml(entityId(moduleValue)) +
    '">' +
    (lessons || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem lições.</p></section>') +
    "</section>" +
    "</main></section>"
  );
}

function renderLessonScreenView({ course, lesson, moduleValue, progress, editorSupport }) {
  const permissions = editorSupport.coursePermissions;
  const canAuthorContent = permissions?.canAuthorContent === true;
  const mode = canAuthorContent ? entityMode(editorSupport, "lesson") : "view";
  const assistanceState = editorSupport.bottomUpAssistance || {};
  const selectedIds = new Set(assistanceState.selectedIds || []);
  const microsequences = Array.isArray(lesson.microsequences) ? lesson.microsequences : [];
  const rows = microsequences.map((microsequence) => {
      const target = {
        level: "microsequence",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue),
        lessonKey: entityId(lesson),
        microsequenceKey: entityId(microsequence)
      };
      const cardCount = countCardsInMicrosequence(microsequence);
      const microsequenceCompleted = countCompletedCardsInMicrosequence(course, moduleValue, lesson, microsequence, progress);
      const isPlanned = isPlannedMicrosequence(microsequence);
      const hasRuntimeCards = resolveMicrosequenceRuntimeIncluded(microsequence);
      const canPlay = isRunnableMicrosequence(microsequence) || hasRuntimeCards;
      const description = normalizeInlineText(microsequence.goal || "");
      const supportingHtml = renderExplicitTags(
        resolveMicrosequenceRefTitles(microsequence.dependsOn, lesson),
        "didactic-tag-row microsequence-tag-row"
      );

      return renderHierarchyItemCard({
        level: "microsequence",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue),
        lessonKey: entityId(lesson),
        itemKey: entityId(microsequence),
        title: microsequence.title || entityId(microsequence),
        description,
        supportingHtml,
        leadingIconHtml: renderMicrosequenceStateIcon(microsequence),
        progressPercent: isPlanned ? 0 : calculateProgressPercent(microsequenceCompleted, cardCount),
        metaHtml: renderMetaLine({
          completed: isPlanned ? 0 : microsequenceCompleted,
          total: cardCount,
          parts: [renderCountMetric("card", cardCount, "card", "cards")]
        }),
        openAction: "open-microsequence-overview",
        openIcon: "play",
        dragLabel: `Arrastar microssequência ${microsequence.title || entityId(microsequence)}`,
        openTitle: isPlanned ? "Abrir microssequência planejada" : "Abrir microssequência",
        openDisabled: !(canPlay || isPlanned || canAuthorContent),
        authoringMode: mode === "edit",
        selectable: mode === "ai",
        selected: selectedIds.has(entityId(microsequence)),
        selectionLevel: "lesson",
        selectionDisabled: assistanceState.isSubmitting,
        inlineEditing: inlineStructureTargetMatches(editorSupport, target),
        submitting: editorSupport.entitySaving,
        errorMessage: editorSupport.entityMutationError,
        permissions
      });
    }).join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: "Lições",
      canGoBack: true,
      backAction: "go-back",
      backTitle: "Voltar",
      actions: [
        canAuthorContent
          ? { action: "open-context-observation", title: "Observações da lição", icon: renderUiIcon("prompt", "home-tab-icon") }
          : null,
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content lesson-structure-screen navigation-screen">' +
    renderEntityModeSwitcher("lesson", mode, canAuthorContent, { allowAi: true }) +
    renderEntitySummary({
      level: "lesson",
      title: lesson.title || "Lição",
      description: getLessonDescription(lesson),
      mode,
      assistanceState,
      target: {
        level: "lesson",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue),
        lessonKey: entityId(lesson)
      },
      inlineEditing: inlineStructureTargetMatches(editorSupport, {
        level: "lesson",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue),
        lessonKey: entityId(lesson)
      }),
      submitting: assistanceState.isSubmitting || editorSupport.entitySaving,
      errorMessage: editorSupport.entityMutationError
    }) +
    renderSectionHeading("Microssequências") +
    '<section data-structure-collection="microsequence" data-course-key="' +
    escapeHtml(entityId(course)) +
    '" data-module-key="' +
    escapeHtml(entityId(moduleValue)) +
    '" data-lesson-key="' +
    escapeHtml(entityId(lesson)) +
    '" class="navigation-list">' +
    (rows || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem microssequências.</p></section>') +
    "</section>" +
    (mode === "ai" && assistanceState.composerOpen === true
      ? renderBottomUpComposer(editorSupport, "lesson")
      : "") +
    "</main>" +
    (mode === "ai" ? renderBottomUpAssistanceDock(editorSupport, "lesson") : "") +
    "</section>"
  );
}

function renderMicrosequenceOverview({
  course,
  moduleValue,
  lesson,
  microsequence,
  cards,
  progress,
  editorSupport
}) {
  const permissions = editorSupport.coursePermissions || {};
  const canAuthorContent = permissions.canAuthorContent === true;
  const mode = canAuthorContent ? entityMode(editorSupport, "microsequence") : "view";
  const assistanceState = editorSupport.bottomUpAssistance || {};
  const selectedIds = new Set(assistanceState.selectedIds || []);
  const lessonProgress = readLessonProgressEntry(progress, {
    courseKey: entityId(course),
    moduleKey: entityId(moduleValue),
    lessonKey: entityId(lesson)
  });
  const completedCardKeys = new Set(
    Array.isArray(lessonProgress?.completedCardKeys) ? lessonProgress.completedCardKeys : []
  );
  const cardRows = (Array.isArray(cards) ? cards : []).map((card, index) => {
    const cardKey = entityId(card);
    const completed = completedCardKeys.has(cardKey) ? 1 : 0;
    return renderHierarchyItemCard({
      level: "card",
      courseKey: entityId(course),
      moduleKey: entityId(moduleValue),
      lessonKey: entityId(lesson),
      microsequenceKey: entityId(microsequence),
      itemKey: cardKey,
      cardIndex: index,
      title: card.title || cardKey,
      progressPercent: completed * 100,
      metaHtml: renderMetaLine({ completed, total: 1 }),
      openAction: "open-microsequence-card",
      openIcon: "play",
      openTitle: "Abrir card",
      authoringMode: mode === "edit",
      selectable: mode === "ai",
      selected: selectedIds.has(cardKey),
      selectionLevel: "microsequence",
      selectionDisabled: assistanceState.isSubmitting,
      permissions
    });
  }).join("");
  const microsequenceTarget = {
    level: "microsequence",
    courseKey: entityId(course),
    moduleKey: entityId(moduleValue),
    lessonKey: entityId(lesson),
    microsequenceKey: entityId(microsequence)
  };
  return (
    '<section class="screen microsequence-overview-screen">' +
    renderTopbar({
      title: "Microssequência",
      canGoBack: true,
      backTitle: "Voltar para a lição",
      actions: [
        canAuthorContent
          ? { action: "open-context-observation", title: "Observações da microssequência", icon: renderUiIcon("prompt", "home-tab-icon") }
          : null,
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content microsequence-overview-content navigation-screen">' +
    renderEntityModeSwitcher("microsequence", mode, canAuthorContent, { allowAi: true }) +
    renderEntitySummary({
      level: "microsequence",
      title: microsequence?.title || "Microssequência",
      description: normalizeInlineText(microsequence?.goal || ""),
      mode,
      assistanceState,
      target: microsequenceTarget,
      inlineEditing: inlineStructureTargetMatches(editorSupport, microsequenceTarget),
      submitting: assistanceState.isSubmitting || editorSupport.entitySaving,
      errorMessage: editorSupport.entityMutationError
    }) +
    renderSectionHeading("Cards") +
    '<section class="navigation-list structure-navigation-list" data-structure-collection="card" data-course-key="' +
    escapeHtml(entityId(course)) + '" data-module-key="' + escapeHtml(entityId(moduleValue)) +
    '" data-lesson-key="' + escapeHtml(entityId(lesson)) + '" data-microsequence-key="' +
    escapeHtml(entityId(microsequence)) + '">' +
    (cardRows || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem cards.</p></section>') +
    "</section>" +
    (mode === "ai" && assistanceState.composerOpen === true
      ? renderBottomUpComposer(editorSupport, "microsequence")
      : "") +
    "</main>" +
    (mode === "ai" ? renderBottomUpAssistanceDock(editorSupport, "microsequence") : "") +
    "</section>"
  );
}

function renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode, editorSupport }) {
  const visualizedCards = Array.isArray(cards) ? cards : [];
  const visualizedTitle = microsequence?.title || "";
  const visualizedRefIds = Array.isArray(microsequence?.dependsOn)
    ? microsequence.dependsOn
    : [];
  const visualizedRefTitles = resolveMicrosequenceRefTitles(visualizedRefIds, lesson);
  const visibleCards = Array.isArray(visualizedCards) ? visualizedCards : [];
  const activeIndex = Number.isInteger(selection.cardIndex) ? selection.cardIndex : 0;
  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, visibleCards.length - 1)));
  const activeCard = visibleCards[safeIndex] || null;
  const hasCards = visibleCards.length > 0;
  const permissions = editorSupport.coursePermissions || {};
  const canAuthorContent = typeof permissions.canAuthorContent === "boolean"
    ? permissions.canAuthorContent
    : typeof permissions.canEdit === "boolean"
      ? permissions.canEdit
      : true;
  const cardMode = canAuthorContent ? entityMode(editorSupport, "card") : "view";
  const authoringMode = Boolean(hasCards && (cardMode === "edit" || cardMode === "ai"));
  const lessonStudyCount = visibleCards.length;
  const prevDisabled = safeIndex <= 0;
  const nextDisabled = !hasCards || (microsequenceMode !== "play" && safeIndex >= visibleCards.length - 1);
  const lightDependencyTags = renderCompactRuntimeRefs(visualizedRefIds, editorSupport.refs || [])
    || renderExplicitTags(visualizedRefTitles, "didactic-tag-row");
  const cardAssistanceState = normalizeCardAssistanceState(editorSupport, activeCard);
  const cardEditorMode = cardMode === "edit" ? "manual" : "ai";
  const displayedCardNumber = hasCards ? safeIndex + 1 : 0;
  const cardProgressPercent = clampPercent(
    lessonStudyCount ? (displayedCardNumber / lessonStudyCount) * 100 : 0
  );
  const displayedCard = activeCard;
  const bodyText = readCardText(displayedCard);
  const popupEntry = displayedCard ? getRuntimePopupButtonEntry(displayedCard) : null;
  const popupBlockKey = editorSupport.continuePopup?.blockKey || `runtime-block::${popupEntry?.index ?? 0}`;
  const selectedCardKeys = Array.isArray(cardAssistanceState.selectedCardKeys)
    ? cardAssistanceState.selectedCardKeys
    : [];
  const wholeCardSelected = Boolean(
    authoringMode &&
    cardAssistanceState.wholeCardSelected &&
    cardAssistanceState.repairScope === "card" &&
    selectedCardKeys.includes(activeCard?.id)
  );
  const selectsResourcesInCard = Boolean(
    authoringMode &&
    selectedCardKeys.length === 1 &&
    selectedCardKeys[0] === activeCard?.id
  );
  const resourceTargetIdsByRuntimeIndex = [];
  const popupResourceTargetIds = [];
  if (activeCard?.resource === "composite") {
    (Array.isArray(activeCard.blocks) ? activeCard.blocks : []).forEach((block, index) => {
      resourceTargetIdsByRuntimeIndex[index + 1] = block?.id ? `body:${block.id}` : "";
    });
  } else if (activeCard) {
    resourceTargetIdsByRuntimeIndex[1] = "main";
    const responseTarget = (editorSupport.cardResourceTargets || [])
      .find((target) => target?.location === "response");
    if (responseTarget) resourceTargetIdsByRuntimeIndex[2] = responseTarget.targetId;
  }
  if (normalizeInlineText(activeCard?.after || "")) {
    popupResourceTargetIds.push("after:text");
  }
  (Array.isArray(activeCard?.afterBlocks) ? activeCard.afterBlocks : []).forEach((block) => {
    popupResourceTargetIds.push(block?.id ? `after:${block.id}` : "");
  });
  const selectedResourceTargetIds = new Set(cardAssistanceState.resourceTargetIds);
  const resourceSelectionLabels = Object.fromEntries(
    (editorSupport.cardResourceTargets || []).map((target) => {
      const targetId = String(target?.targetId || "");
      const label = target?.label || target?.resourceType || "recurso";
      return [targetId, selectedResourceTargetIds.has(targetId)
        ? `Retirar ${label} do reparo`
        : `Selecionar ${label} para reparo`];
    })
  );
  const cardAssistanceLocked = Boolean(editorSupport.isSubmitting);
  const manualEditTargetId =
    selectedCardKeys.length === 1 && selectedCardKeys[0] === activeCard?.id
      ? cardAssistanceState.repairScope === "resources"
        ? cardAssistanceState.resourceTargetIds.length === 1
          ? cardAssistanceState.resourceTargetIds[0]
          : ""
        : cardAssistanceState.wholeCardSelected ? "card" : ""
      : "";
  const manualCardEditor = cardEditorMode === "manual" && manualEditTargetId
    ? renderManualCardEditor(
        activeCard,
        manualEditTargetId,
        editorSupport,
        cardAssistanceLocked,
        editorSupport.manualCardEditDraft?.cardKey === activeCard?.id &&
          editorSupport.manualCardEditDraft?.targetId === manualEditTargetId
          ? editorSupport.manualCardEditDraft.values
          : null
      )
    : "";
  const runtime = renderCardRuntimeBlocksWithDock(displayedCard, {
    omitRepeatedHeading: true,
    fallbackText: bodyText,
    resourceSelectionEnabled: selectsResourcesInCard,
    resourceSelectionDisabled: Boolean(editorSupport.isSubmitting),
    resourceSelectionTargetIds: resourceTargetIdsByRuntimeIndex,
    selectedResourceTargetIds: cardAssistanceState.resourceTargetIds,
    resourceSelectionLabels,
    resourceEditorHtmlByTargetId: cardEditorMode === "manual" && manualEditTargetId !== "card"
      ? { [manualEditTargetId]: manualCardEditor }
      : {},
    ...(editorSupport.cardRuntimeOptions || {})
  });
  const continuePopup =
    popupEntry && editorSupport.continuePopup?.open
      ? renderPopupButtonDock(popupEntry.block, {
          ...(editorSupport.cardRuntimeOptions || {}),
          blockKeyPrefix: `${popupBlockKey}::popup`,
          resourceSelectionEnabled: selectsResourcesInCard,
          resourceSelectionDisabled: Boolean(editorSupport.isSubmitting),
          resourceSelectionTargetIds: popupResourceTargetIds,
          selectedResourceTargetIds: cardAssistanceState.resourceTargetIds,
          resourceSelectionLabels,
          resourceEditorHtmlByTargetId: cardEditorMode === "manual" && manualEditTargetId !== "card"
            ? { [manualEditTargetId]: manualCardEditor }
            : {}
        })
      : { bodyHtml: "", dockHtml: "" };
  const continuePopupHtml =
    popupEntry && editorSupport.continuePopup?.open
      ? '<div class="study-continue-popup-shell">' +
        '<section class="study-continue-popup">' +
        '<div class="study-continue-popup-body">' +
        continuePopup.bodyHtml +
        "</div>" +
        continuePopup.dockHtml +
        '<div class="study-continue-popup-actions">' +
        '<button class="open-mini study-continue-popup-btn" type="button" data-action="continue-popup-next" title="Continuar" aria-label="Continuar">' +
        renderUiIcon("play", "home-tab-icon") +
        "</button>" +
        "</div></section></div>"
      : "";
  const promptLabel = editorSupport.assistPromptLabel || "Descreva o reparo";
  const submitLabel = editorSupport.assistSubmitLabel || "Enviar para a IA";
  const promptPlaceholder = editorSupport.assistPromptPlaceholder ||
    "Explique pontualmente o que precisa ser corrigido.";
  const cardUndo = editorSupport.canUndoCardEdit
    ? '<div class="runtime-card-authoring-utility"><button class="icon-ghost" type="button" data-action="undo-card-edit" title="Desfazer última alteração" aria-label="Desfazer última alteração">' +
      renderUiIcon("arrow-left", "manual-card-editor-icon") + "</button></div>"
    : "";
  const cardAssistanceComposerOpen = editorSupport.cardAssistanceComposerOpen === true;
  const aiEditor = cardEditorMode === "ai" && cardAssistanceComposerOpen
    ? '<section class="runtime-card-ai-editor" aria-label="Assistência por IA">' +
      '<textarea data-field="assist-prompt" class="assist-prompt" data-card-authoring-focus="ai-prompt" aria-label="' +
      escapeHtml(promptLabel) + '" title="' + escapeHtml(promptLabel) + '" placeholder="' +
      escapeHtml(promptPlaceholder) + '"' +
      (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + ">" +
      escapeHtml(editorSupport.promptText || "") + "</textarea>" +
      '<div class="card-assistance-command-row">' +
      '<button class="icon-ghost tiny-icon generate-inline-icon" type="button" data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA"' +
      (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + ">" +
      renderUiIcon("key", "generate-inline-icon-svg") + "</button>" +
      '<button class="open-main generate-submit" type="button" data-action="submit-card-assistance" title="' +
      escapeHtml(submitLabel) + '" aria-label="' + escapeHtml(submitLabel) + '"' +
      (cardAssistanceLocked || !editorSupport.cardAssistanceRequestReady
        ? ' disabled aria-disabled="true"'
        : "") + ">" + renderUiIcon("sparkles", "generate-submit-icon") + "</button></div></section>"
    : "";
  const authoringMessages =
    (editorSupport.assistErrorMessage
      ? '<p class="card-assistance-message" role="status">' + escapeHtml(editorSupport.assistErrorMessage) + "</p>"
      : "");
  const cardAuthoringContent = cardUndo + aiEditor + authoringMessages;
  const cardAuthoring = authoringMode && cardAuthoringContent
    ? '<section class="runtime-card-authoring' +
      (cardEditorMode === "manual" ? " is-manual" : " is-ai") +
      " is-repairing" +
      '" aria-label="Editar card">' +
      cardAuthoringContent +
      "</section>"
    : "";
  const hasRenderedCard = Boolean(displayedCard);
  const runtimeCardTitle = authoringMode && cardEditorMode === "manual" && manualEditTargetId === "card"
    ? manualCardEditor
    : authoringMode
      ? '<button class="runtime-card-title runtime-card-selection-surface" type="button" data-action="toggle-card-assistance-whole-card" aria-pressed="' +
      (wholeCardSelected ? "true" : "false") +
      '" data-card-authoring-focus="scope-card" aria-label="Selecionar card inteiro" title="Selecionar card inteiro"' +
      (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + '>' +
        escapeHtml(displayedCard ? displayedCard.title || displayedCard.id : "Sem card") +
        "</button>"
      : '<div class="runtime-card-title">' +
        escapeHtml(displayedCard ? displayedCard.title || displayedCard.id : "Sem card") +
        "</div>";
  const runtimeCardBody =
    hasCards || hasRenderedCard
      ? '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet' +
        (authoringMode ? " is-editing" : "") +
        (wholeCardSelected ? " is-selected-for-edit" : "") +
        '"' + (authoringMode ? ' data-card-whole-selection-surface="true"' : "") + '>' +
        '<div class="runtime-card-rendered-content">' +
        runtimeCardTitle +
        '<div class="card-sheet-content">' +
        runtime.bodyHtml +
        "</div>" +
        runtime.dockHtml +
        "</div>" +
        cardAuthoring +
        "</article>"
      : '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet runtime-card-sheet-empty">' +
        '<div class="runtime-card-title">Sem cards ainda</div>' +
        '<div class="card-sheet-content card-sheet-content-empty"><p class="empty-state-copy">' +
        "Esta microssequência ainda não possui cards.</p></div></article>";
  const previousCardButton =
    '<button class="icon-ghost" type="button" data-action="prev-card" ' +
    (prevDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Card anterior" aria-label="Card anterior">' +
    renderUiIcon("arrow-left", "home-tab-icon") +
    "</button>";
  const nextCardButton =
    '<button class="open-mini study-continue-btn" type="button" data-action="next-card" ' +
    (nextDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Continuar" aria-label="Continuar">' +
    renderUiIcon("play", "home-tab-icon") +
    "</button>";
  const studyActions =
    '<button class="icon-ghost study-comment-btn' +
    (editorSupport.hasCardComment ? " has-comment" : "") +
    '" type="button" data-action="open-card-comment" title="Observação do card" aria-label="Observação do card' +
    (editorSupport.hasCardComment ? ": 1" : "") + '">' +
    renderUiIcon("prompt", "home-tab-icon") +
    (editorSupport.hasCardComment
      ? '<span class="study-comment-count" aria-hidden="true">1</span>'
      : "") +
    "</button>" +
    '<button class="icon-ghost study-review-btn' +
    (editorSupport.cardMarkedForReview ? " is-marked" : "") +
    '" type="button" data-action="toggle-card-review" aria-pressed="' +
    (editorSupport.cardMarkedForReview ? "true" : "false") +
    '" title="' +
    (editorSupport.cardMarkedForReview ? "Retirar de Rever" : "Marcar para rever") +
    '" aria-label="' +
    (editorSupport.cardMarkedForReview ? "Retirar card de Rever" : "Marcar card para rever") +
    '">' + renderUiIcon("review", "home-tab-icon") + "</button>";
  const assistanceToggleTitle = cardAssistanceComposerOpen
    ? "Ocultar pedido"
    : "Escrever pedido para a IA";
  const assistanceToggle =
    '<button class="open-mini study-continue-btn" type="button" data-action="toggle-card-assistance-composer" aria-expanded="' +
    (cardAssistanceComposerOpen ? "true" : "false") + '" title="' +
    escapeHtml(assistanceToggleTitle) + '" aria-label="' + escapeHtml(assistanceToggleTitle) + '"' +
    (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("sparkles", "home-tab-icon") +
    "</button>";
  const footerActions = cardMode === "view"
    ? studyActions + previousCardButton + nextCardButton + continuePopupHtml
    : cardMode === "ai"
      ? previousCardButton + assistanceToggle + nextCardButton
      : previousCardButton + nextCardButton;
  const readerSurface =
    '<section class="workbench-surface-pane workbench-reader-pane study-reader-screen' +
    (authoringMode ? " is-editing" : "") + '">' +
    '<section class="study-reader-context">' +
    '<div class="study-reader-line">' +
    '<span class="study-reader-context-line study-reader-course-title">' +
    escapeHtml(visualizedTitle || microsequence?.title || "Microssequência") +
    "</span></div>" +
    '<div class="study-reader-progress"><span style="width:' +
    String(cardProgressPercent) +
    '%"></span></div>' +
    "</section>" +
    (lightDependencyTags ? '<div class="study-context-tags compact-study-tags">' + lightDependencyTags + "</div>" : "") +
    '<section class="card-portrait editor-card-portrait study-stage">' +
    runtimeCardBody +
    "</section>" +
    '<div class="study-reader-stage-meta"><span class="study-reader-count" aria-label="Card ' +
    String(displayedCardNumber) +
    " de " +
    String(lessonStudyCount) +
    '" title="Card ' +
    String(displayedCardNumber) +
    " de " +
    String(lessonStudyCount) +
    '">' +
    renderUiIcon("card", "study-reader-count-icon") +
    '<span class="study-reader-count-value">' +
    String(displayedCardNumber) +
    "/" +
    String(lessonStudyCount) +
    "</span></span></div>" +
    '<section class="study-reader-footer"><div class="study-action-dock"><div class="study-action-stack"><div class="study-next-wrap' +
    (continuePopupHtml ? " is-popup-open" : "") +
    '">' +
    footerActions +
    "</div></div></div></section></section>";

  return (
    '<section class="screen microsequence-workbench-screen">' +
    renderTopbar({
      title: course?.title || course?.id || "Curso",
      canGoBack: true,
      backTitle: "Voltar para a lição",
      actions: [
        {
          action: "open-central",
          title: "Abrir painel",
          icon: renderUiIcon("cloud", "home-tab-icon")
        }
      ].filter(Boolean)
    }) +
    '<main class="screen-content microsequence-generator-screen">' +
    renderEntityModeSwitcher("card", cardMode, canAuthorContent && hasCards, { allowAi: true }) +
    '<section class="workbench-surface' + (authoringMode ? " is-editing" : "") + '">' +
    '<div class="workbench-surface-body">' +
    readerSurface +
    "</div></section></main></section>"
  );
}

export function renderLessonScreen({ project, view, selection, course, moduleValue, lesson, microsequence, cards, microsequenceMode, editorSupport }) {
  if (view === "courses") {
    return renderHomeScreen({
      project,
      progress: editorSupport.progress,
      editorSupport
    });
  }

  if (view === "course") {
    return renderCourseScreen({ course, progress: editorSupport.progress, editorSupport });
  }

  if (view === "module") {
    return renderModuleScreen({ course, moduleValue, progress: editorSupport.progress, editorSupport });
  }

  if (view === "lesson") {
    return renderLessonScreenView({ course, lesson, moduleValue, progress: editorSupport.progress, editorSupport });
  }

  if (microsequenceMode === "overview") {
    return renderMicrosequenceOverview({
      course,
      moduleValue,
      lesson,
      microsequence,
      cards,
      progress: editorSupport.progress,
      editorSupport
    });
  }

  return renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode, editorSupport });
}
