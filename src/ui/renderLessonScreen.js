import { renderHomeScreen } from "./renderHomeScreen.js";
import { readPackageCardText } from "../render/renderPackageCard.js";
import {
  getPackageFeedbackEntry,
  renderPackageCardBlocksWithDock,
  renderPackageFeedback
} from "../render/renderPackageCard.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { buildManualCardEditModel } from "./manualCardEdit.js";
import {
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
      const text = normalizeInlineText(readPackageCardText(card));
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
    operation: "edit_text",
    wholeCardSelected: value.wholeCardSelected === true,
    scope: value.scope === "resources" ? "resources" : "card",
    resourceTargetIds: Array.isArray(value.resourceTargetIds)
      ? value.resourceTargetIds.map((targetId) => String(targetId || "")).filter(Boolean)
      : [],
    selectedCardKeys: Array.isArray(value.selectedCardKeys)
      ? value.selectedCardKeys.map((cardKey) => String(cardKey || "")).filter(Boolean)
      : activeCard?.id ? [String(activeCard.id)] : []
  };
}

function renderManualCardTitleEditor(card, draftValues = null) {
  const model = card ? buildManualCardEditModel(card, "card") : null;
  const titleField = model?.fields.find((field) => field.key === "title");
  if (!titleField) return "";
  const draft = draftValues && typeof draftValues === "object" ? draftValues : {};
  const value = Object.hasOwn(draft, "title") ? draft.title : titleField.value;
  return (
    '<section class="runtime-card-manual-editor manual-card-editor is-card-title-editor runtime-card-title"' +
    ' data-manual-target-id="card" aria-label="Edição manual">' +
    '<div class="manual-card-editor-body">' +
    '<span class="runtime-card-title-edit-base" aria-hidden="true">' +
    escapeHtml(card?.title || card?.id || "") +
    '</span><label class="manual-card-edit-field"><span>' +
    escapeHtml(titleField.label) +
    '</span><textarea data-manual-edit-key="title" aria-label="' +
    escapeHtml(titleField.label) +
    '" data-card-authoring-focus="manual-first-field">' +
    escapeHtml(value) +
    "</textarea></label></div></section>"
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

function authoringCapability(permissions, capability) {
  return permissions?.[capability] === true;
}

function permittedEntityMode(editorSupport, level, { canEdit = false, canAi = false } = {}) {
  const requested = entityMode(editorSupport, level);
  if (requested === "edit" && canEdit) return "edit";
  if (requested === "ai" && canAi) return "ai";
  return "view";
}

function renderAuthoringStatus(editorSupport, mode = "view") {
  const errorHtml = editorSupport?.entityMutationError &&
    !(mode === "edit" && editorSupport.inlineStructureEditor)
    ? '<p class="card-assistance-message" role="status">' +
      escapeHtml(editorSupport.entityMutationError) + "</p>"
    : "";
  const workspaceState = editorSupport?.workspaceAuthoring || {};
  if (!["pending", "conflict"].includes(workspaceState.status)) return errorHtml;
  const pendingCount = Math.max(0, Number(workspaceState.pendingCount) || 0);
  const statusMessage = workspaceState.status === "conflict"
    ? workspaceState.errorMessage ||
      "A redação salva neste dispositivo diverge da versão remota. Escolha como continuar."
    : pendingCount === 1
      ? "Uma alteração está salva neste dispositivo e aguarda sincronização."
      : pendingCount > 1
        ? `${pendingCount} alterações estão salvas neste dispositivo e aguardam sincronização.`
        : "Há alterações salvas neste dispositivo aguardando sincronização.";
  const busy = editorSupport?.entitySaving === true;
  const resolutionHtml = workspaceState.status === "conflict"
    ? '<div class="workspace-authoring-resolution-actions">' +
      '<button class="open-main" type="button" data-action="resolve-workspace-authoring-conflict" data-resolution="keep_local"' +
      ' title="Comparar e manter a minha redação"' +
      (workspaceState.canKeepLocal && !busy ? "" : ' disabled aria-disabled="true"') +
      ">Manter meu texto</button>" +
      (workspaceState.canDiscardLocal
        ? '<button class="icon-ghost" type="button" data-action="resolve-workspace-authoring-conflict" data-resolution="discard_local"' +
          ' title="Descartar as alterações locais"' +
          (busy ? ' disabled aria-disabled="true"' : "") +
          ">Descartar alterações locais</button>"
        : "") +
      "</div>"
    : "";
  return errorHtml +
    '<section class="workspace-authoring-status is-' + escapeHtml(workspaceState.status) +
    '" aria-label="Sincronização da autoria">' +
    '<p role="status">' + escapeHtml(statusMessage) + "</p>" +
    resolutionHtml +
    "</section>";
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

function renderStructureTextField({
  tag,
  value,
  selected = false,
  field,
  label,
  className = "",
  multiline = false,
  focus = false
}) {
  const normalizedValue = value || "";
  const classes = [className, "structure-edit-field-shell", normalizedValue ? "" : "is-empty"]
    .filter(Boolean)
    .join(" ");
  return (
    '<' + tag + ' class="' + classes + '">' +
    '<span class="structure-edit-field-base' + (selected ? " is-concealed" : "") + '"' +
    (selected ? ' aria-hidden="true"' : "") + '>' + escapeHtml(normalizedValue) + "</span>" +
    (selected
      ? '<span class="structure-edit-field-overlay" contenteditable="plaintext-only" role="textbox"' +
        (multiline ? ' aria-multiline="true"' : "") + ' data-field="' + escapeHtml(field) + '"' +
        (focus ? ' data-card-authoring-focus="inline-structure-title"' : "") +
        ' aria-label="' + escapeHtml(label) + '" spellcheck="true">' +
        escapeHtml(normalizedValue) + "</span>"
      : "") +
    "</" + tag + ">"
  );
}

function renderEntityModeSwitcher(level, mode, { canEdit = false, canAi = false } = {}) {
  if (!canEdit && !canAi) return "";
  const options = [
    ["view", "Visualizar", "preview"],
    ...(canEdit ? [["edit", "Editar", "edit"]] : []),
    ...(canAi ? [["ai", "Assistência por IA", "sparkles"]] : [])
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
  inlineEditing = false
}) {
  const selected = mode === "ai"
    ? assistanceState?.kind === "container"
    : mode === "edit" && inlineEditing;
  const content = renderStructureTextField({
    tag: "strong",
    value: title,
    selected: selected && mode === "edit",
    field: "inline-entity-title",
    label: "Título",
    focus: true
  }) + renderStructureTextField({
    tag: "p",
    value: description,
    selected: selected && mode === "edit",
    field: "inline-entity-description",
    label: "Descrição",
    multiline: true
  });
  if (mode === "ai") {
    return (
      '<button class="bottom-up-container-target' + (selected ? " is-selected" : "") +
      '" type="button" data-action="toggle-bottom-up-container" data-assistance-level="' +
      escapeHtml(level) + '" aria-pressed="' + (selected ? "true" : "false") + '"' +
      (submitting ? ' disabled aria-disabled="true"' : "") + '>' + content + "</button>"
    );
  }
  if (mode === "edit") {
    return (
      '<section class="entity-summary bottom-up-container-target' + (selected ? " is-selected" : "") +
      '" role="button" tabindex="' + (submitting ? "-1" : "0") +
      '" data-action="select-inline-structure-entity"' + structureTargetAttributes(target) +
      ' aria-pressed="' + (selected ? "true" : "false") + '" aria-label="' +
      (selected ? "Editando " : "Editar ") + escapeHtml(title || "conteúdo") + '"' +
      (selected ? ' data-inline-structure-editor="true"' : "") +
      (submitting ? ' aria-disabled="true"' : "") + '>' + content + "</section>"
    );
  }
  return (
    '<section class="entity-summary">' + content + "</section>"
  );
}

function renderStructureEditDock({
  target,
  submitting = false,
  errorMessage = "",
  canMoveUp = false,
  canMoveDown = false,
  canDelete = false
}) {
  if (!target) return "";
  const attributes = structureTargetAttributes(target);
  const disabled = submitting ? ' disabled aria-disabled="true"' : "";
  const deleteAction = target.level === "course" ? "delete-course-direct" : "delete-entity-direct";
  const resetAction = target.level === "course" ? "reset-course-progress-direct" : "reset-entity-progress-direct";
  return (
    '<nav class="study-reader-footer structure-edit-dock" aria-label="Edição estrutural">' +
    '<div class="study-action-dock"><div class="study-action-stack">' +
    (errorMessage ? '<p class="card-assistance-message" role="status">' + escapeHtml(errorMessage) + "</p>" : "") +
    '<div class="study-next-wrap structure-edit-dock-actions">' +
    (canMoveUp
      ? '<button class="icon-ghost" type="button" data-action="move-inline-structure-up"' + attributes +
        ' title="Mover para cima" aria-label="Mover para cima"' + disabled + '>' +
        renderUiIcon("arrow-up", "home-tab-icon") + "</button>"
      : "") +
    (canMoveDown
      ? '<button class="icon-ghost" type="button" data-action="move-inline-structure-down"' + attributes +
        ' title="Mover para baixo" aria-label="Mover para baixo"' + disabled + '>' +
        renderUiIcon("arrow-down", "home-tab-icon") + "</button>"
      : "") +
    '<button class="icon-ghost" type="button" data-action="' + resetAction + '"' + attributes +
    ' title="Zerar progresso" aria-label="Zerar progresso"' + disabled + '>' +
    renderUiIcon("rotate", "home-tab-icon") + "</button>" +
    (canDelete
      ? '<button class="icon-ghost danger-action" type="button" data-action="' + deleteAction + '"' + attributes +
        ' title="Excluir" aria-label="Excluir"' + disabled + '>' +
        renderUiIcon("trash", "home-tab-icon") + "</button>"
      : "") +
    '<button class="icon-ghost" type="button" data-action="close-inline-structure-entity" title="Cancelar edição" aria-label="Cancelar edição"' +
    disabled + '>' + renderUiIcon("remove-state", "home-tab-icon") + "</button>" +
    '<button class="open-main" type="button" data-action="save-inline-entity"' + attributes +
    ' title="Salvar" aria-label="Salvar"' + disabled + '>' +
    renderUiIcon("ready-state", "home-tab-icon") + "</button>" +
    "</div></div></div></nav>"
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
    '<div class="study-action-dock"><div class="study-action-stack">' +
    (composerOpen
      ? '<div class="bottom-up-composer-shell">' + renderBottomUpComposer(editorSupport, level) + "</div>"
      : "") +
    '<div class="study-next-wrap">' +
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

function renderMicrosequenceStateIcon() { return ""; }

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
  metaHtml = "",
  openAction = "",
  progressPercent = 0,
  progressLabel = "",
  openTitle,
  leadingIconHtml = "",
  openDisabled = false,
  authoringMode = false,
  selectable = false,
  selected = false,
  selectionLevel = "",
  selectionDisabled = false,
  inlineEditing = false,
  submitting = false
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
  const editSelected = authoringMode && inlineEditing;
  const itemSelected = selectable ? selected : editSelected;
  const interactionAction = selectable
    ? "toggle-bottom-up-item"
    : authoringMode
      ? "select-inline-structure-entity"
      : "";
  const interactionAttributes = interactionAction
    ? (editSelected && !selectable
        ? ""
        : ' role="button" tabindex="' + (selectionDisabled || submitting ? "-1" : "0") + '"') +
      ' data-action="' + escapeHtml(interactionAction) + '"' +
      (selectable
        ? ' data-assistance-level="' + escapeHtml(selectionLevel) + '" data-assistance-item-id="' +
          escapeHtml(itemKey) + '" aria-pressed="' + (itemSelected ? "true" : "false") + '"'
        : authoringMode
          ? ' aria-pressed="' + (itemSelected ? "true" : "false") + '"'
          : "") +
      (level === "card" ? ' data-card-index="' + String(cardIndex) + '"' : "") +
      ' aria-label="' + escapeHtml(
        selectable
          ? (itemSelected ? "Retirar da seleção " : "Selecionar ") + title
          : (itemSelected ? "Editando " : "Editar ") + title
      ) + '"' +
      (selectionDisabled || submitting ? ' aria-disabled="true"' : "")
    : "";

  return (
    '<article class="clean-card progress-card structure-list-card navigation-list-card' +
    (selectable || authoringMode ? " bottom-up-selectable-card" : "") +
    (itemSelected ? " is-selected" : "") +
    '" data-structure-target="' +
    escapeHtml(level) +
    '"' +
    targetAttributes +
    interactionAttributes +
    (editSelected ? ' data-inline-structure-editor="true"' : "") +
    ">" +
    '<div class="card-progress-fill" style="width:' +
    progress +
    '%"' +
    (progressLabel
      ? ' role="progressbar" aria-label="Conclusão do card" aria-valuemin="0" aria-valuemax="100"' +
        ' aria-valuenow="' + progress + '" aria-valuetext="' + escapeHtml(progressLabel) + '"'
      : "") +
    "></div>" +
    '<div class="lesson-copy structure-copy navigation-main">' +
    '<div class="structure-title-row navigation-title-row">' +
    '<h3 class="card-title">' +
    leadingIconHtml +
    renderStructureTextField({
      tag: "span",
      value: title,
      selected: editSelected,
      field: "inline-entity-title",
      label: "Título",
      focus: true
    }) +
    "</h3></div>" +
    (level !== "card" || description
      ? renderStructureTextField({
          tag: "p",
          value: description,
          selected: editSelected,
          field: "inline-entity-description",
          label: "Descrição",
          className: "card-subtitle",
          multiline: true
        })
      : "") +
    supportingHtml +
    "</div>" +
    metaHtml +
    '<div class="lesson-actions structure-actions navigation-actions">' +
    '<button class="icon-ghost" type="button" data-action="reset-entity-progress-direct"' +
    targetAttributes + ' title="Zerar progresso" aria-label="Zerar progresso"' +
    (submitting ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("rotate", "home-tab-icon") + "</button>" +
    (openAction
      ? '<button class="open-mini" type="button" data-action="' + escapeHtml(openAction) + '"' +
        targetAttributes + (level === "card" ? ' data-card-index="' + String(cardIndex) + '"' : "") +
        ' title="' + escapeHtml(openTitle) + '" aria-label="' + escapeHtml(openTitle) + '"' +
        (openDisabled || submitting ? ' disabled aria-disabled="true"' : "") + '>' +
        renderUiIcon("play", "home-tab-icon") + "</button>"
      : "") +
    "</div>" +
    "</article>"
  );
}

function renderCourseScreen({ course, progress, editorSupport }) {
  const permissions = editorSupport.coursePermissions;
  const canEdit = authoringCapability(permissions, "canEditMetadata");
  const mode = permittedEntityMode(editorSupport, "course", { canEdit });
  const moduleValues = Array.isArray(course.modules) ? course.modules : [];
  const modules = moduleValues
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
        permissions?.canComment === true
          ? { action: "open-context-observation", title: "Observações do curso", icon: renderUiIcon("prompt", "home-tab-icon") }
          : null,
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content course-screen" data-structure-collection="module" data-course-key="' +
    escapeHtml(entityId(course)) +
    '">' +
    renderEntityModeSwitcher("course", mode, { canEdit }) +
    renderAuthoringStatus(editorSupport, mode) +
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
    "</main>" +
    (mode === "edit"
      ? renderStructureEditDock({
          target: editorSupport.inlineStructureEditor,
          submitting: editorSupport.entitySaving,
          errorMessage: editorSupport.entityMutationError,
          canMoveUp: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "module" &&
            moduleValues.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.moduleKey) > 0,
          canMoveDown: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "module" &&
            moduleValues.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.moduleKey) < moduleValues.length - 1,
          canDelete: editorSupport.inlineStructureEditor?.level === "course"
            ? permissions?.canDeleteCourse === true
            : permissions?.canDeleteEntity === true
        })
      : "") +
    "</section>"
  );
}

function renderModuleScreen({ course, moduleValue, progress, editorSupport }) {
  const permissions = editorSupport.coursePermissions;
  const canEdit = authoringCapability(permissions, "canEditMetadata");
  const mode = permittedEntityMode(editorSupport, "module", { canEdit });
  const lessonValues = Array.isArray(moduleValue.lessons) ? moduleValue.lessons : [];
  const lessons = lessonValues
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
        permissions?.canComment === true
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
    renderEntityModeSwitcher("module", mode, { canEdit }) +
    renderAuthoringStatus(editorSupport, mode) +
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
    "</main>" +
    (mode === "edit"
      ? renderStructureEditDock({
          target: editorSupport.inlineStructureEditor,
          submitting: editorSupport.entitySaving,
          errorMessage: editorSupport.entityMutationError,
          canMoveUp: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "lesson" &&
            lessonValues.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.lessonKey) > 0,
          canMoveDown: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "lesson" &&
            lessonValues.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.lessonKey) < lessonValues.length - 1,
          canDelete: permissions?.canDeleteEntity === true
        })
      : "") +
    "</section>"
  );
}

function renderLessonScreenView({ course, lesson, moduleValue, progress, editorSupport }) {
  const permissions = editorSupport.coursePermissions;
  const canEdit = authoringCapability(permissions, "canEditMetadata");
  const canAi = authoringCapability(permissions, "canUseBottomUpAi");
  const mode = permittedEntityMode(editorSupport, "lesson", { canEdit, canAi });
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
      const isPlanned = cardCount === 0;
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
        openTitle: isPlanned ? "Abrir microssequência planejada" : "Abrir microssequência",
        openDisabled: !(canPlay || isPlanned || canEdit || canAi),
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
        permissions?.canComment === true
          ? { action: "open-context-observation", title: "Observações da lição", icon: renderUiIcon("prompt", "home-tab-icon") }
          : null,
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content lesson-structure-screen navigation-screen">' +
    renderEntityModeSwitcher("lesson", mode, { canEdit, canAi }) +
    renderAuthoringStatus(editorSupport, mode) +
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
    "</main>" +
    (mode === "ai"
      ? renderBottomUpAssistanceDock(editorSupport, "lesson")
      : mode === "edit"
        ? renderStructureEditDock({
            target: editorSupport.inlineStructureEditor,
            submitting: editorSupport.entitySaving,
            errorMessage: editorSupport.entityMutationError,
            canMoveUp: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "microsequence" &&
              microsequences.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.microsequenceKey) > 0,
            canMoveDown: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "microsequence" &&
              microsequences.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.microsequenceKey) < microsequences.length - 1,
            canDelete: permissions?.canDeleteEntity === true
          })
        : "") +
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
  const canEdit = authoringCapability(permissions, "canEditMetadata");
  const canAi = authoringCapability(permissions, "canUseBottomUpAi");
  const mode = permittedEntityMode(editorSupport, "microsequence", { canEdit, canAi });
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
      progressLabel: completed ? "Card concluído" : "Card não concluído",
      metaHtml: "",
      openAction: "open-microsequence-card",
      openTitle: "Abrir card",
      authoringMode: mode === "edit",
      selectable: mode === "ai",
      selected: selectedIds.has(cardKey),
      selectionLevel: "microsequence",
      selectionDisabled: assistanceState.isSubmitting,
      inlineEditing: inlineStructureTargetMatches(editorSupport, {
        level: "card",
        courseKey: entityId(course),
        moduleKey: entityId(moduleValue),
        lessonKey: entityId(lesson),
        microsequenceKey: entityId(microsequence),
        cardKey
      }),
      submitting: assistanceState.isSubmitting || editorSupport.entitySaving,
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
        permissions?.canComment === true
          ? { action: "open-context-observation", title: "Observações da microssequência", icon: renderUiIcon("prompt", "home-tab-icon") }
          : null,
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content microsequence-overview-content navigation-screen">' +
    renderEntityModeSwitcher("microsequence", mode, { canEdit, canAi }) +
    renderAuthoringStatus(editorSupport, mode) +
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
    "</main>" +
    (mode === "ai"
      ? renderBottomUpAssistanceDock(editorSupport, "microsequence")
      : mode === "edit"
        ? renderStructureEditDock({
            target: editorSupport.inlineStructureEditor,
            submitting: editorSupport.entitySaving,
            errorMessage: editorSupport.entityMutationError,
            canMoveUp: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "card" &&
              cards.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.cardKey) > 0,
            canMoveDown: permissions?.canMove === true && editorSupport.inlineStructureEditor?.level === "card" &&
              cards.findIndex((item) => entityId(item) === editorSupport.inlineStructureEditor?.cardKey) < cards.length - 1,
            canDelete: permissions?.canDeleteEntity === true
          })
        : "") +
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
  const canEdit = authoringCapability(permissions, "canEditCards");
  const canAi = authoringCapability(permissions, "canUseCardAi");
  const cardMode = permittedEntityMode(editorSupport, "card", { canEdit, canAi });
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
  const popupEntry = displayedCard ? getPackageFeedbackEntry(displayedCard) : null;
  const popupBlockKey = editorSupport.continuePopup?.blockKey || `runtime-block::${popupEntry?.index ?? 0}`;
  const selectedCardKeys = Array.isArray(cardAssistanceState.selectedCardKeys)
    ? cardAssistanceState.selectedCardKeys
    : [];
  const wholeCardSelected = Boolean(
    authoringMode &&
    cardAssistanceState.wholeCardSelected &&
    cardAssistanceState.scope === "card" &&
    selectedCardKeys.includes(activeCard?.id)
  );
  const selectsResourcesInCard = Boolean(
    authoringMode &&
    selectedCardKeys.length === 1 &&
    selectedCardKeys[0] === activeCard?.id
  );
  const selectedResourceTargetIds = new Set(cardAssistanceState.resourceTargetIds);
  const cardResourceTargets = Array.isArray(editorSupport.cardResourceTargets)
    ? editorSupport.cardResourceTargets
    : [];
  const resourceSelectionLabels = Object.fromEntries(
    cardResourceTargets.map((target) => {
      const targetId = String(target?.targetId || "");
      const label = target?.label || target?.resourceType || "recurso";
      return [targetId, selectedResourceTargetIds.has(targetId)
        ? `Retirar ${label} da edição`
        : `Selecionar ${label} para edição`];
    })
  );
  const cardAssistanceLocked = Boolean(editorSupport.isSubmitting);
  const manualEditTargetId =
    selectedCardKeys.length === 1 && selectedCardKeys[0] === activeCard?.id
      ? cardAssistanceState.scope === "resources"
        ? cardAssistanceState.resourceTargetIds.length === 1
          ? cardAssistanceState.resourceTargetIds[0]
          : ""
        : cardAssistanceState.wholeCardSelected ? "card" : ""
      : "";
  const manualCardEditor = cardEditorMode === "manual" && manualEditTargetId === "card"
    ? renderManualCardTitleEditor(
        activeCard,
        editorSupport.manualCardEditDraft?.cardKey === activeCard?.id &&
          editorSupport.manualCardEditDraft?.targetId === manualEditTargetId
          ? editorSupport.manualCardEditDraft.values
          : null
      )
    : "";
  const runtime = renderPackageCardBlocksWithDock(displayedCard, {
    omitRepeatedHeading: true,
    resourceSelectionEnabled: selectsResourcesInCard,
    resourceSelectionDisabled: Boolean(editorSupport.isSubmitting),
    selectedResourceTargetIds: cardAssistanceState.resourceTargetIds,
    resourceSelectionLabels,
    resourceSelectionTargetIds: cardResourceTargets.map(({ targetId }) => targetId),
    manualEditingTargetId: cardEditorMode === "manual" && manualEditTargetId !== "card"
      ? manualEditTargetId
      : "",
    ...(editorSupport.packageCardOptions || {})
  });
  const continuePopup =
    popupEntry && editorSupport.continuePopup?.open
      ? renderPackageFeedback(popupEntry, {
          card: displayedCard,
          ...(editorSupport.packageCardOptions || {}),
          blockKeyPrefix: `${popupBlockKey}::popup`,
          resourceSelectionEnabled: selectsResourcesInCard,
          resourceSelectionDisabled: Boolean(editorSupport.isSubmitting),
          selectedResourceTargetIds: cardAssistanceState.resourceTargetIds,
          resourceSelectionLabels,
          resourceSelectionTargetIds: cardResourceTargets.map(({ targetId }) => targetId),
          manualEditingTargetId: cardEditorMode === "manual" && manualEditTargetId !== "card"
            ? manualEditTargetId
            : ""
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
  const promptLabel = editorSupport.assistPromptLabel || "O que você quer mudar?";
  const submitLabel = editorSupport.assistSubmitLabel || "Enviar mensagem";
  const promptPlaceholder = editorSupport.assistPromptPlaceholder ||
    "Explique pontualmente o que precisa ser corrigido.";
  const cardUndo = editorSupport.canUndoCardEdit
    ? '<button class="icon-ghost" type="button" data-action="undo-card-edit" title="Desfazer última alteração" aria-label="Desfazer última alteração"' +
      (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + '>' +
      renderUiIcon("arrow-left", "home-tab-icon") + "</button>"
    : "";
  const manualCancel = cardEditorMode === "manual" && manualEditTargetId
    ? '<button class="icon-ghost" type="button" data-action="cancel-manual-card-edit" title="Cancelar edição" aria-label="Cancelar edição"' +
      (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + '>' +
      renderUiIcon("remove-state", "home-tab-icon") + "</button>"
    : "";
  const manualSave = cardEditorMode === "manual" && manualEditTargetId
    ? '<button class="open-main" type="button" data-action="save-manual-card-edit" title="Salvar edição" aria-label="Salvar edição"' +
      (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + '>' +
      renderUiIcon("ready-state", "home-tab-icon") + "</button>"
    : "";
  const cardAssistanceComposerOpen = editorSupport.cardAssistanceComposerOpen === true;
  const assistanceHistory = Array.isArray(editorSupport.cardAssistanceHistory)
    ? editorSupport.cardAssistanceHistory
    : [];
  const assistanceHistoryHtml = assistanceHistory.length
    ? '<ol class="card-assistance-conversation" aria-label="Ajustes anteriores desta conversa">' +
      assistanceHistory.map((turn) => '<li class="card-assistance-turn">' +
        '<article class="card-assistance-message-bubble is-user"><span>Você</span><p>' +
        escapeHtml(turn.userRequest || turn.request) + '</p></article>' +
        '<article class="card-assistance-message-bubble is-assistant"><span>Assistente</span><p>' +
        escapeHtml(turn.assistantResponse) + '</p>' +
        (turn.outcome === "no-op"
          ? ""
          : '<small>Aplicado ao ' +
            escapeHtml(
              turn.appliedTo?.[0] === "card" || turn.scope === "card"
                ? "card"
                : "conteúdo selecionado"
            ) + '</small>') +
        '</article></li>').join("") + '</ol>'
    : "";
  const cardRedo = editorSupport.canRedoCardEdit
    ? '<button class="icon-ghost" type="button" data-action="redo-card-edit" title="Refazer alteração" aria-label="Refazer alteração"' +
      (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") + '>' +
      renderUiIcon("arrow-right", "home-tab-icon") + "</button>"
    : "";
  const selectedAssistanceTargets = wholeCardSelected
    ? cardResourceTargets
    : cardResourceTargets.filter(({ targetId }) => selectedResourceTargetIds.has(targetId));
  const assistanceScopeItems = [
    ...(wholeCardSelected ? [{ label: "Título do card", editableTextLabels: [] }] : []),
    ...selectedAssistanceTargets
  ];
  const assistanceBoundaryHtml = wholeCardSelected
    ? '<p><strong>Recomposição permitida:</strong> a IA pode trocar a representação e a prática; a identidade e a posição do card são preservadas.</p>'
    : '<p><strong>Contexto somente leitura:</strong> tipos de resource, IDs, ordem, relações, geometria, respostas e gabarito.</p>';
  const assistanceScopeHtml = assistanceScopeItems.length
    ? '<section class="card-assistance-scope" aria-label="Escopo da mudança"><strong>A IA pode alterar</strong><ul>' +
      assistanceScopeItems.map((target) => '<li><span>' + escapeHtml(target.label) + '</span>' +
        (Array.isArray(target.editableTextLabels) && target.editableTextLabels.length
          ? '<small>' + escapeHtml(target.editableTextLabels.join(" · ")) + '</small>'
          : '') + '</li>').join("") +
      '</ul>' + assistanceBoundaryHtml + '</section>'
    : "";
  const aiEditor = cardEditorMode === "ai" && cardAssistanceComposerOpen
    ? '<section class="runtime-card-ai-editor" aria-label="Assistência por IA">' +
      assistanceScopeHtml +
      assistanceHistoryHtml +
      '<textarea data-field="assist-prompt" class="assist-prompt" data-card-authoring-focus="ai-prompt" aria-label="' +
      escapeHtml(promptLabel) + '" title="' + escapeHtml(promptLabel) + '" placeholder="' +
      escapeHtml(assistanceHistory.length ? "Continue o ajuste a partir do resultado atual." : promptPlaceholder) + '"' +
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
    (editorSupport.assistStatusMessage
      ? '<p class="card-assistance-message is-neutral" role="status">' +
        escapeHtml(editorSupport.assistStatusMessage) + "</p>"
      : "") +
    (editorSupport.assistErrorMessage || editorSupport.manualCardEditError
      ? '<p class="card-assistance-message" role="status">' +
        escapeHtml(editorSupport.assistErrorMessage || editorSupport.manualCardEditError) + "</p>"
      : "");
  const cardAuthoringContent = aiEditor + authoringMessages;
  const cardAuthoring = authoringMode && cardAuthoringContent
    ? '<section class="runtime-card-authoring' +
      (cardEditorMode === "manual" ? " is-manual" : " is-ai") +
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
        "</div></article>"
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
      ? cardUndo + cardRedo + previousCardButton + assistanceToggle + nextCardButton
      : cardUndo + previousCardButton + manualCancel + manualSave + nextCardButton;
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
    '<section class="study-reader-footer">' + cardAuthoring +
    '<div class="study-action-dock"><div class="study-action-stack"><div class="study-next-wrap runtime-card-external-dock' +
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
    renderEntityModeSwitcher("card", cardMode, {
      canEdit: canEdit && hasCards,
      canAi: canAi && hasCards
    }) +
    renderAuthoringStatus(editorSupport, cardMode) +
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
