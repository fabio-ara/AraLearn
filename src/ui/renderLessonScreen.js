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
          '">' +
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

function renderInlineFieldIcon(iconName, label) {
  return (
    '<span class="generate-icon-label workbench-inline-icon" aria-hidden="true" title="' +
    escapeHtml(label) +
    '">' +
    renderUiIcon(iconName, "generate-field-icon workbench-inline-icon-svg") +
    "</span>"
  );
}

function summarizeIconTitle(label) {
  const text = String(label || "").trim();
  const match = text.match(/^[^:]+:\s*(.+)$/);
  return match ? match[1].trim() : text;
}

function renderPromptAttachmentButton(action = "open-assist-attachment-picker", disabled = false) {
  const title = "Anexar documentos";
  return (
    '<button class="icon-ghost tiny-icon generate-inline-icon" type="button" data-action="' +
    escapeHtml(action) +
    '" title="' +
    escapeHtml(title) +
    '" aria-label="' +
    escapeHtml(title) +
    '"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("lesson", "assist-attachment-button-icon") +
    "</button>"
  );
}

function renderAssistAttachmentChips(attachments) {
  const items = Array.isArray(attachments) ? attachments : [];
  if (!items.length) {
    return "";
  }

  const chips = items
    .map((item, index) => {
      const name = item?.name || `Documento ${index + 1}`;
      return (
        '<button class="dependency-chip-button assist-attachment-chip" type="button" data-action="remove-assist-attachment" data-attachment-index="' +
        String(index) +
        '" title="Remover anexo' +
        '" aria-label="Remover anexo ' +
        escapeHtml(name) +
        '">' +
        '<span class="assist-attachment-chip-icon" aria-hidden="true">' +
        renderUiIcon("lesson", "assist-attachment-button-icon") +
        "</span>" +
        '<span class="dependency-chip-label">' +
        escapeHtml(name) +
        "</span>" +
        '<span class="dependency-chip-remove">' +
        renderUiIcon("remove-state", "dependency-chip-remove-icon") +
        "</span></button>"
      );
    })
    .join("");

  return '<div class="dependency-chip-row workbench-tag-chip-row assist-attachment-chip-row">' + chips + "</div>";
}

function normalizeCardAssistanceState(editorSupport = {}, activeCard = null) {
  const value = editorSupport.cardAssistanceState || {};
  const operation = activeCard && value.operation !== "create" ? "repair" : "create";
  const requestedPlacement = [
    "before_current",
    "after_current",
    "end_current",
    "new_microsequence"
  ].includes(value.placement)
    ? value.placement
    : "after_current";
  return {
    operation,
    repairScope: value.repairScope === "resources" ? "resources" : "card",
    resourceTargetIds: Array.isArray(value.resourceTargetIds)
      ? value.resourceTargetIds.map((targetId) => String(targetId || "")).filter(Boolean)
      : [],
    selectedCardKeys: Array.isArray(value.selectedCardKeys)
      ? value.selectedCardKeys.map((cardKey) => String(cardKey || "")).filter(Boolean)
      : activeCard?.id ? [String(activeCard.id)] : [],
    placement: !activeCard && ["before_current", "after_current"].includes(requestedPlacement)
      ? "end_current"
      : requestedPlacement
  };
}

function renderCardAssistanceOperationControls(state, activeCard, disabled = false) {
  const options = [
    {
      value: "repair",
      label: "Reparar",
      description: "Corrigir o card atual",
      disabled: !activeCard
    },
    {
      value: "create",
      label: "Criar card",
      description: "Adicionar um card novo",
      disabled: false
    }
  ];
  return (
    '<section class="card-assistance-section" aria-labelledby="card-assistance-operation-label">' +
    '<p class="workbench-editor-section-label" id="card-assistance-operation-label">Operação</p>' +
    '<div class="card-assistance-mode-grid" role="group" aria-label="Operação da assistência">' +
    options.map((option) => {
      const isSelected = state.operation === option.value;
      const isDisabled = disabled || option.disabled;
      return (
        '<button class="card-assistance-mode-button' +
        (isSelected ? " is-selected" : "") +
        '" type="button" data-action="select-card-assistance-operation" data-operation="' +
        option.value +
        '" aria-pressed="' +
        (isSelected ? "true" : "false") +
        '" title="' +
        escapeHtml(option.description) +
        '"' +
        (isDisabled ? ' disabled aria-disabled="true"' : "") +
        ">" +
        '<span class="card-assistance-mode-title">' +
        escapeHtml(option.label) +
        "</span>" +
        '<span class="card-assistance-mode-description">' +
        escapeHtml(option.description) +
        "</span></button>"
      );
    }).join("") +
    "</div></section>"
  );
}

function renderCardRepairControls(state, targets = [], disabled = false) {
  const selectedTargetIds = new Set(state.resourceTargetIds);
  const targetButtons = (Array.isArray(targets) ? targets : [])
    .filter((target) => ["after_text", "after"].includes(target?.location))
    .map((target) => {
    const targetId = String(target?.targetId || "");
    const label = target?.label || target?.resourceType || targetId || "Recurso";
    const isSelected = selectedTargetIds.has(targetId);
    return (
      '<button class="card-assistance-resource-chip' +
      (isSelected ? " is-selected" : "") +
      '" type="button" data-action="toggle-card-assistance-resource" data-resource-target-id="' +
      escapeHtml(targetId) +
      '" data-resource-location="' +
      escapeHtml(target?.location || "") +
      '" data-resource-type="' +
      escapeHtml(target?.resourceType || "") +
      '" aria-pressed="' +
      (isSelected ? "true" : "false") +
      '" title="' +
      escapeHtml(label) +
      '"' +
      (disabled || !targetId ? ' disabled aria-disabled="true"' : "") +
      ">" +
      escapeHtml(label) +
      "</button>"
    );
  }).join("");
  return (
    '<section class="card-assistance-section card-assistance-repair-section" aria-labelledby="card-repair-scope-label">' +
    '<p class="workbench-editor-section-label" id="card-repair-scope-label">Alcance do reparo</p>' +
    '<div class="card-assistance-scope-grid" role="group" aria-label="Alcance do reparo">' +
    [
      ["card", "Card inteiro"],
      ["resources", "Recursos"]
    ].map(([value, label]) => {
      const isSelected = state.repairScope === value;
      return (
        '<button class="card-assistance-scope-button' +
        (isSelected ? " is-selected" : "") +
        '" type="button" data-action="select-card-repair-scope" data-repair-scope="' +
        value +
        '" aria-pressed="' +
        (isSelected ? "true" : "false") +
        '"' +
        (disabled ? ' disabled aria-disabled="true"' : "") +
        ">" +
        escapeHtml(label) +
        "</button>"
      );
    }).join("") +
    "</div>" +
    (state.repairScope === "resources"
      ? '<div class="card-assistance-resource-list" role="group" aria-label="Recursos selecionados">' +
        targetButtons +
        "</div>"
      : "") +
    "</section>"
  );
}

function renderCardCreationControls(state, activeCard, disabled = false) {
  const options = [
    {
      value: "before_current",
      label: "Antes",
      title: "Criar antes do card atual",
      requiresCard: true
    },
    {
      value: "after_current",
      label: "Depois",
      title: "Criar depois do card atual",
      requiresCard: true
    },
    {
      value: "end_current",
      label: "No fim",
      title: "Criar no fim desta microssequência",
      requiresCard: false
    },
    {
      value: "new_microsequence",
      label: "Nova microssequência",
      title: "Criar em uma nova microssequência depois da atual",
      requiresCard: false
    }
  ];
  return (
    '<section class="card-assistance-section card-assistance-creation-section" aria-labelledby="card-creation-placement-label">' +
    '<p class="workbench-editor-section-label" id="card-creation-placement-label">Destino</p>' +
    '<div class="card-assistance-placement-grid" role="group" aria-label="Destino do novo card">' +
    options.map((option) => {
      const isSelected = state.placement === option.value;
      const isDisabled = disabled || (option.requiresCard && !activeCard);
      return (
        '<button class="card-assistance-placement-button' +
        (isSelected ? " is-selected" : "") +
        '" type="button" data-action="select-card-creation-placement" data-placement="' +
        option.value +
        '" aria-pressed="' +
        (isSelected ? "true" : "false") +
        '" title="' +
        escapeHtml(option.title) +
        '"' +
        (isDisabled ? ' disabled aria-disabled="true"' : "") +
        ">" +
        escapeHtml(option.label) +
        "</button>"
      );
    }).join("") +
    "</div></section>"
  );
}

function renderCardAssistancePreview(preview = null, disabled = false) {
  const items = Array.isArray(preview?.items)
    ? preview.items
    : preview?.changeSet ? [preview] : [];
  if (!items.length) return "";
  const cardsMarkup = items.map((item, index) => {
    const card = item?.changeSet?.card || null;
    if (!card) return "";
    const microsequenceTitle = item?.changeSet?.microsequence?.title || "";
    const runtime = renderCardRuntimeBlocksWithDock(card, {
      omitRepeatedHeading: true,
      fallbackText: readCardText(card)
    });
    const supportEntry = getRuntimePopupButtonEntry(card);
    const support = supportEntry
      ? renderPopupButtonDock(supportEntry.block, {
          blockKeyPrefix: `card-assistance-preview-support-${index}`
        })
      : { bodyHtml: "", dockHtml: "" };
    const supportHtml = support.bodyHtml
      ? '<section class="card-assistance-preview-support" aria-label="Apoios e conteúdo posterior">' +
        '<p class="workbench-editor-section-label">Apoios e depois</p>' +
        support.bodyHtml + support.dockHtml + "</section>"
      : "";
    return (
      '<article class="card-assistance-preview-card">' +
      (items.length > 1
        ? '<p class="workbench-editor-section-label">Card ' + String(index + 1) + "</p>"
        : "") +
      (microsequenceTitle
        ? '<p class="card-assistance-preview-microsequence"><span>Nova microssequência</span>' +
          escapeHtml(microsequenceTitle) + "</p>"
        : "") +
      '<div class="runtime-card-title">' + escapeHtml(card.title || card.id) +
      '</div><div class="card-sheet-content">' + runtime.bodyHtml + supportHtml +
      "</div></article>"
    );
    }).join("");
  const message = preview?.errorMessage || (preview?.stale
    ? "O alvo mudou. Descarte esta prévia e faça um novo pedido."
    : "");
  return (
    '<section class="card-assistance-preview" data-role="card-assistance-preview"' +
    (preview?.stale ? ' data-stale="true"' : "") +
    ">" +
    '<div class="card-assistance-preview-heading">' +
    '<div class="card-assistance-preview-copy">' +
    '<p class="workbench-editor-section-label">Prévia' +
    (items.length > 1 ? " · " + String(items.length) + " cards" : "") +
    "</p>" +
    "</div>" +
    '<div class="card-assistance-preview-actions">' +
    '<button class="icon-ghost" type="button" data-action="discard-card-assistance-preview" title="Descartar prévia" aria-label="Descartar prévia"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("remove-state", "card-assistance-action-icon") +
    "</button>" +
    '<button class="open-main" type="button" data-action="apply-card-assistance-preview" title="Aplicar prévia" aria-label="Aplicar prévia"' +
    (disabled || preview?.stale ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("ready-state", "card-assistance-action-icon") +
    "</button></div></div>" +
    cardsMarkup +
    (message ? '<p class="card-assistance-preview-message">' + escapeHtml(message) + "</p>" : "") +
    "</section>"
  );
}

function renderManualCardEditor(card, targetId, editorSupport = {}, disabled = false) {
  const model = card ? buildManualCardEditModel(card, targetId) : null;
  if (!model) return "";
  const fields = model.fields.map((field) => {
    const control = field.type === "textarea"
      ? '<textarea data-manual-edit-key="' + escapeHtml(field.key) + '" aria-label="' +
        escapeHtml(field.label) + '">' + escapeHtml(field.value) + "</textarea>"
      : '<input data-manual-edit-key="' + escapeHtml(field.key) + '" type="text" value="' +
        escapeHtml(field.value) + '" aria-label="' + escapeHtml(field.label) + '">';
    return '<label class="manual-card-edit-field"><span>' + escapeHtml(field.label) +
      "</span>" + control + "</label>";
  }).join("");
  const options = Array.isArray(model.options)
    ? '<section class="manual-card-choice-options" aria-label="Alternativas">' +
      model.options.map((option) =>
        '<label class="manual-card-choice-option"><input type="checkbox" data-manual-correct-index="' +
        String(option.index) + '"' + (option.correct ? " checked" : "") +
        ' aria-label="Alternativa correta"><input type="text" data-manual-option-index="' +
        String(option.index) + '" value="' + escapeHtml(option.value) +
        '" aria-label="Texto da alternativa"></label>'
      ).join("") + "</section>"
    : "";
  const table = Array.isArray(model.columns) && Array.isArray(model.rows)
    ? '<section class="manual-card-table-fields" aria-label="Tabela"><div class="manual-card-table-row">' +
      model.columns.map((column, index) =>
        '<input type="text" data-manual-column-index="' + String(index) + '" value="' +
        escapeHtml(column) + '" aria-label="Cabeçalho ' + String(index + 1) + '">'
      ).join("") + "</div>" +
      model.rows.map((row, rowIndex) => '<div class="manual-card-table-row">' +
        row.map((cell, columnIndex) =>
          '<input type="text" data-manual-cell-row="' + String(rowIndex) +
          '" data-manual-cell-column="' + String(columnIndex) + '" value="' +
          escapeHtml(cell) + '" aria-label="Célula ' + String(rowIndex + 1) + ", " +
          String(columnIndex + 1) + '">'
        ).join("") + "</div>").join("") + "</section>"
    : "";
  return (
    '<details class="manual-card-editor" data-manual-target-id="' + escapeHtml(targetId) + '">' +
    '<summary title="Editar manualmente">' + renderUiIcon("edit", "manual-card-editor-icon") +
    '<span>Editar manualmente</span></summary><div class="manual-card-editor-body">' +
    fields + options + table +
    '<div class="manual-card-editor-actions">' +
    '<button class="open-main" type="button" data-action="save-manual-card-edit" title="Salvar edição" aria-label="Salvar edição"' +
    (disabled ? ' disabled aria-disabled="true"' : "") + '>' +
    renderUiIcon("save", "manual-card-editor-icon") + "</button></div>" +
    (editorSupport.manualCardEditError
      ? '<p class="card-assistance-message" role="status">' +
        escapeHtml(editorSupport.manualCardEditError) + "</p>"
      : "") +
    "</div></details>"
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

function isPlannedMicrosequence(microsequence) {
  return isDraftMicrosequence(microsequence) && countCardsInMicrosequence(microsequence) === 0;
}

function renderMicrosequenceStateIcon(microsequence) {
  if (isPlannedMicrosequence(microsequence)) {
    return (
      '<span class="microsequence-state-icon is-draft" aria-label="Microssequência planejada" title="Microssequência planejada">' +
      renderUiIcon("draft-state", "microsequence-state-icon-svg") +
      "</span>"
    );
  }
  if (isDraftMicrosequence(microsequence)) {
    return (
      '<span class="microsequence-state-icon is-draft" aria-label="Microssequência em revisão" title="Microssequência em revisão">' +
      renderUiIcon("draft-state", "microsequence-state-icon-svg") +
      "</span>"
    );
  }
  if (!resolveMicrosequenceRuntimeIncluded(microsequence)) {
    return (
      '<span class="microsequence-state-icon is-excluded" aria-label="Microssequência excluída do estudo" title="Microssequência excluída do estudo">' +
      renderUiIcon("excluded-state", "microsequence-state-icon-svg") +
      "</span>"
    );
  }
  return (
    '<span class="microsequence-state-icon is-ready" aria-label="Microssequência pronta para estudo" title="Microssequência pronta para estudo">' +
    renderUiIcon("ready-state", "microsequence-state-icon-svg") +
    "</span>"
  );
}

function renderHierarchyItemCard({
  level,
  courseKey = "",
  moduleKey = "",
  lessonKey = "",
  itemKey = "",
  title,
  description = "",
  supportingHtml = "",
  metaHtml,
  openAction = "",
  progressPercent = 0,
  dragLabel,
  openTitle,
  leadingIconHtml = "",
  openDisabled = false,
  permissions = { canEdit: false, canDelete: false }
}) {
  const levelData =
    level === "module"
      ? ' data-module-key="' + escapeHtml(itemKey) + '"'
      : level === "lesson"
        ? ' data-module-key="' + escapeHtml(moduleKey) + '" data-lesson-key="' + escapeHtml(itemKey) + '"'
        : ' data-module-key="' + escapeHtml(moduleKey) + '" data-lesson-key="' + escapeHtml(lessonKey) + '" data-microsequence-key="' + escapeHtml(itemKey) + '"';

  return (
    '<article class="clean-card progress-card structure-list-card navigation-list-card" data-structure-target="' +
    escapeHtml(level) +
    '" data-course-key="' +
    escapeHtml(courseKey) +
    '"' +
    levelData +
    ">" +
    '<div class="card-progress-fill" style="width:' +
    String(Math.max(0, Math.min(100, Number(progressPercent) || 0))) +
    '%"></div>' +
    '<div class="lesson-copy structure-copy navigation-main">' +
    '<div class="structure-title-row navigation-title-row">' +
    renderStructureHandle({
      level,
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey: level === "microsequence" ? itemKey : "",
      label: dragLabel,
      disabled: !permissions.canEdit
    }) +
    '<h3 class="card-title">' +
    leadingIconHtml +
    escapeHtml(title) +
    "</h3></div>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    supportingHtml +
    "</div>" +
    metaHtml +
    '<div class="lesson-actions structure-actions navigation-actions">' +
    '<button class="icon-ghost" type="button" data-action="reset-entity-progress-direct" data-structure-level="' +
    escapeHtml(level) +
    '" data-course-key="' +
    escapeHtml(courseKey) +
    '"' +
    levelData +
    ' title="Zerar progresso" aria-label="Zerar progresso">' +
    renderUiIcon("rotate", "home-tab-icon") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="edit-entity-direct" data-structure-level="' +
    escapeHtml(level) +
    '" data-course-key="' +
    escapeHtml(courseKey) +
    '"' +
    levelData +
    ' title="Editar" aria-label="Editar"' +
    (permissions.canEdit ? "" : ' disabled aria-disabled="true"') +
    '>' +
    renderUiIcon("edit", "home-tab-icon") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="delete-entity-direct" data-structure-level="' +
    escapeHtml(level) +
    '" data-course-key="' +
    escapeHtml(courseKey) +
    '"' +
    levelData +
    ' title="Excluir" aria-label="Excluir"' +
    (permissions.canDelete ? "" : ' disabled aria-disabled="true"') +
    '>' +
    renderUiIcon("trash", "home-tab-icon") +
    "</button>" +
    (openAction
      ? '<button class="open-mini" type="button" data-action="' +
        escapeHtml(openAction) +
    '"' +
    (level !== "module" ? ' data-module-key="' + escapeHtml(moduleKey) + '"' : "") +
    (level === "lesson" ? ' data-lesson-key="' + escapeHtml(itemKey) + '"' : "") +
    (level === "module" ? ' data-module-key="' + escapeHtml(itemKey) + '"' : "") +
    (level === "microsequence" ? ' data-microsequence-key="' + escapeHtml(itemKey) + '"' : "") +
    ' title="' +
    escapeHtml(openTitle) +
    '" aria-label="' +
    escapeHtml(openTitle) +
    '"' +
    (openDisabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("play", "home-tab-icon") +
    "</button>"
      : "") +
    "</div>" +
    "</article>"
  );
}

function renderCourseScreen({ course, progress, editorSupport }) {
  const permissions = editorSupport.coursePermissions;
  const modules = (course.modules || [])
    .map((moduleValue) => {
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
        permissions
      });
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: "Módulos",
      canGoBack: true,
      backAction: "go-back",
      backTitle: "Menu principal",
      actions: [
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content course-screen" data-structure-collection="module" data-course-key="' +
    escapeHtml(entityId(course)) +
    '">' +
    renderSectionHeading(course.title || "Curso") +
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
  const lessons = (moduleValue.lessons || [])
    .map((lesson) => {
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
        permissions
      });
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: "Lições",
      canGoBack: true,
      backAction: "go-back",
      backTitle: "Voltar",
      actions: [
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content course-screen" data-structure-collection="lesson" data-course-key="' +
    escapeHtml(entityId(course)) +
    '" data-module-key="' +
    escapeHtml(entityId(moduleValue)) +
    '">' +
    renderSectionHeading(resolveModuleScreenContextTitle(moduleValue)) +
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
  const lessonTotal = countCardsInLesson(lesson);
  const groupedMicrosequences = {
    main: [],
    branch: [],
    planned: [],
    paused: []
  };

  (lesson.microsequences || []).forEach((microsequence) => {
    if (isPlannedMicrosequence(microsequence)) {
      groupedMicrosequences.planned.push(microsequence);
      return;
    }
    if (!resolveMicrosequenceRuntimeIncluded(microsequence)) {
      groupedMicrosequences.paused.push(microsequence);
      return;
    }
    if (microsequence.branchOf || microsequence.role === "support") {
      groupedMicrosequences.branch.push(microsequence);
      return;
    }
    groupedMicrosequences.main.push(microsequence);
  });

  const renderMicrosequenceGroup = (title, items) => {
    if (!items.length) {
      return "";
    }
    const rows = items
      .map((microsequence) => {
      const cardCount = countCardsInMicrosequence(microsequence);
      const microsequenceCompleted = countCompletedCardsInMicrosequence(course, moduleValue, lesson, microsequence, progress);
      const isPlanned = isPlannedMicrosequence(microsequence);
      const hasRuntimeCards = resolveMicrosequenceRuntimeIncluded(microsequence);
      const canPlay = isRunnableMicrosequence(microsequence) || hasRuntimeCards;
      const description = normalizeInlineText(
        microsequence.goal || (isPlanned ? "Etapa planejada da trilha. Abra para materializar ou corrigir." : "")
      );
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
        openAction: hasRuntimeCards ? "play-microsequence" : "open-microsequence-assist",
        dragLabel: `Arrastar microssequência ${microsequence.title || entityId(microsequence)}`,
        openTitle: hasRuntimeCards
          ? "Abrir microssequência"
          : isPlanned
            ? "Abrir microssequência planejada"
            : "Abrir microssequência",
        openDisabled: !(canPlay || isPlanned),
        permissions
      });
    })
      .join("");

    return '<section class="microsequence-group navigation-list">' + renderSectionHeading(title) + rows + "</section>";
  };

  const readyEmptyMessage =
    lessonTotal === 0
      ? '<section class="clean-card lesson-ready-empty-card"><p class="empty-state-copy">' +
        escapeHtml(
          groupedMicrosequences.planned.length
            ? "Não há microssequências prontas para estudar aqui. As etapas planejadas abaixo podem ser materializadas quando você quiser."
            : "Não há microssequências prontas para estudar aqui."
        ) +
        "</p></section>"
      : "";
  const microsequenceGroups =
    renderMicrosequenceGroup(lesson.title || "Lição", groupedMicrosequences.main) +
    renderMicrosequenceGroup("Apoios", groupedMicrosequences.branch) +
    renderMicrosequenceGroup("Planejadas", groupedMicrosequences.planned) +
    renderMicrosequenceGroup("Fora do estudo", groupedMicrosequences.paused);

  return (
    '<section class="screen">' +
    renderTopbar({
      title: "",
      canGoBack: true,
      backAction: "go-back",
      backTitle: "Voltar",
      actions: [
        { action: "open-central", title: "Abrir painel", icon: renderUiIcon("cloud", "home-tab-icon") }
      ].filter(Boolean)
    }) +
    '<main class="screen-content lesson-structure-screen navigation-screen">' +
    readyEmptyMessage +
    '<section data-structure-collection="microsequence" data-course-key="' +
    escapeHtml(entityId(course)) +
    '" data-module-key="' +
    escapeHtml(entityId(moduleValue)) +
    '" data-lesson-key="' +
    escapeHtml(entityId(lesson)) +
    '">' +
    (microsequenceGroups || '<section class="clean-card progress-card"><p class="empty-state-copy">Sem microssequências.</p></section>') +
    "</section></main></section>"
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
  const isPlanned = isPlannedMicrosequence(microsequence);
  const editMode = Boolean(editorSupport.editMode || !hasCards);
  const lessonStudyCount = visibleCards.length;
  const prevDisabled = safeIndex <= 0;
  const nextDisabled = !hasCards || (microsequenceMode !== "play" && safeIndex >= visibleCards.length - 1);
  const cardProgressPercent = clampPercent(lessonStudyCount ? ((safeIndex + 1) / lessonStudyCount) * 100 : 0);
  const bodyText = readCardText(activeCard);
  const lightDependencyTags = renderCompactRuntimeRefs(visualizedRefIds, editorSupport.refs || [])
    || renderExplicitTags(visualizedRefTitles, "didactic-tag-row");
  const popupEntry = activeCard ? getRuntimePopupButtonEntry(activeCard) : null;
  const popupBlockKey = editorSupport.continuePopup?.blockKey || `runtime-block::${popupEntry?.index ?? 0}`;
  const cardAssistanceState = normalizeCardAssistanceState(editorSupport, activeCard);
  const selectedCardKeys = Array.isArray(cardAssistanceState.selectedCardKeys)
    ? cardAssistanceState.selectedCardKeys
    : [];
  const selectsResourcesInCard = Boolean(
    editMode &&
    cardAssistanceState.operation === "repair" &&
    cardAssistanceState.repairScope === "resources" &&
    selectedCardKeys.length === 1 &&
    selectedCardKeys[0] === activeCard?.id
  );
  const resourceTargetIdsByRuntimeIndex = [];
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
  const runtime = renderCardRuntimeBlocksWithDock(activeCard, {
    omitRepeatedHeading: true,
    fallbackText: bodyText,
    resourceSelectionEnabled: selectsResourcesInCard,
    resourceSelectionDisabled: Boolean(editorSupport.isSubmitting || editorSupport.cardAssistancePreview),
    resourceSelectionTargetIds: resourceTargetIdsByRuntimeIndex,
    selectedResourceTargetIds: cardAssistanceState.resourceTargetIds,
    ...(editorSupport.cardRuntimeOptions || {})
  });
  const continuePopup =
    popupEntry && editorSupport.continuePopup?.open
      ? renderPopupButtonDock(popupEntry.block, {
          ...(editorSupport.cardRuntimeOptions || {}),
          blockKeyPrefix: `${popupBlockKey}::popup`
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
  const modelOptions = (editorSupport.modelOptions || [])
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.value) +
        '"' +
        (item.value === editorSupport.selectedModel ? " selected" : "") +
        ">" +
        escapeHtml(item.label) +
        "</option>"
      );
    })
    .join("") || '<option value="">Configurar modelo</option>';
  const cardAssistancePreview = editorSupport.cardAssistancePreview || null;
  const cardAssistanceLocked = Boolean(editorSupport.isSubmitting || cardAssistancePreview);
  const cardAssistanceOperationControls = renderCardAssistanceOperationControls(
    cardAssistanceState,
    activeCard,
    cardAssistanceLocked
  );
  const cardAssistanceTargetControls = cardAssistanceState.operation === "repair"
    ? renderCardRepairControls(
        cardAssistanceState,
        editorSupport.cardResourceTargets,
        cardAssistanceLocked
      )
    : renderCardCreationControls(
        cardAssistanceState,
        activeCard,
        cardAssistanceLocked
      );
  const manualEditTargetId =
    cardAssistanceState.operation === "repair" &&
    selectedCardKeys.length === 1 &&
    selectedCardKeys[0] === activeCard?.id
      ? cardAssistanceState.repairScope === "resources" &&
        cardAssistanceState.resourceTargetIds.length === 1
        ? cardAssistanceState.resourceTargetIds[0]
        : "card"
      : "";
  const manualCardEditor = manualEditTargetId
    ? renderManualCardEditor(
        activeCard,
        manualEditTargetId,
        editorSupport,
        cardAssistanceLocked
      )
    : "";
  const cardAssistancePreviewMarkup = renderCardAssistancePreview(
    cardAssistancePreview,
    editorSupport.isSubmitting
  );
  const promptLabel = editorSupport.assistPromptLabel || (
    cardAssistanceState.operation === "repair"
      ? "Descreva o reparo"
      : "Descreva o novo card"
  );
  const submitLabel = editorSupport.assistSubmitLabel || (
    cardAssistanceState.operation === "repair"
      ? "Reparar card"
      : "Criar card"
  );
  const promptPlaceholder = editorSupport.assistPromptPlaceholder || (
    cardAssistanceState.operation === "repair"
      ? "Explique pontualmente o que precisa ser corrigido."
      : "Explique o conteúdo e a finalidade didática do novo card."
  );
  const attachmentInput =
    '<input data-field="assist-attachments" class="assist-attachment-input" type="file" multiple accept=".txt,.csv,.json,.md,.html,.xml,.yml,.yaml,.pdf,.docx,text/plain,text/csv,application/json,text/markdown,text/html,application/xml,text/xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"' +
    (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") +
    ">";
  const attachmentChips = renderAssistAttachmentChips(editorSupport.attachments);
  const runtimeCardBody =
    hasCards
      ? '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet' +
        (editMode ? " is-editing" : "") +
        (selectedCardKeys.includes(activeCard?.id) ? " is-selected-for-edit" : "") +
        '">' +
        (editMode
          ? '<button class="runtime-card-edit-select" type="button" data-action="toggle-card-assistance-card" data-card-key="' +
            escapeHtml(activeCard?.id || "") + '" aria-pressed="' +
            (selectedCardKeys.includes(activeCard?.id) ? "true" : "false") +
            '" aria-label="Selecionar card para reparo" title="Selecionar card para reparo">' +
            renderUiIcon(selectedCardKeys.includes(activeCard?.id) ? "ready-state" : "add", "runtime-card-edit-select-icon") +
            "</button>"
          : "") +
        '<div class="runtime-card-title">' +
        escapeHtml(activeCard ? activeCard.title || activeCard.id : "Sem card") +
        "</div>" +
        '<div class="card-sheet-content">' +
        runtime.bodyHtml +
        "</div>" +
        runtime.dockHtml +
        "</article>"
      : '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet runtime-card-sheet-empty">' +
        '<div class="runtime-card-title">Sem cards ainda</div>' +
        '<div class="card-sheet-content card-sheet-content-empty"><p class="empty-state-copy">' +
        escapeHtml(isPlanned
            ? "Descreva o primeiro card que deve ser criado nesta microssequência."
            : "Descreva o card que deve iniciar esta microssequência.") +
        "</p></div></article>";
  const readerSurface =
    '<section class="workbench-surface-pane workbench-preview-pane study-reader-screen' +
    (editMode ? " is-editing" : "") + '">' +
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
    String(hasCards ? safeIndex + 1 : 0) +
    " de " +
    String(lessonStudyCount) +
    '" title="Card ' +
    String(hasCards ? safeIndex + 1 : 0) +
    " de " +
    String(lessonStudyCount) +
    '">' +
    renderUiIcon("card", "study-reader-count-icon") +
    '<span class="study-reader-count-value">' +
    String(hasCards ? safeIndex + 1 : 0) +
    "/" +
    String(lessonStudyCount) +
    "</span></span></div>" +
    '<section class="study-reader-footer"><div class="study-action-dock"><div class="study-action-stack"><div class="study-next-wrap' +
    (continuePopupHtml ? " is-popup-open" : "") +
    '">' +
    '<button class="icon-ghost study-comment-btn' +
    (editorSupport.hasCardComment ? " has-comment" : "") +
    '" type="button" data-action="open-card-comment" title="Observação do card" aria-label="Observação do card' +
    (editorSupport.hasCardComment ? ": 1" : "") + '">' +
    renderUiIcon("edit", "home-tab-icon") +
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
    '">' + renderUiIcon("review", "home-tab-icon") + "</button>" +
    '<button class="icon-ghost" type="button" data-action="prev-card" ' +
    (prevDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Card anterior" aria-label="Card anterior">' +
    renderUiIcon("arrow-left", "home-tab-icon") +
    "</button>" +
    '<button class="open-mini study-continue-btn" type="button" data-action="next-card" ' +
    (nextDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Continuar" aria-label="Continuar">' +
    renderUiIcon("play", "home-tab-icon") +
    "</button>" +
    continuePopupHtml +
    "</div></div></div></section>" +
    (editMode
      ? '<section class="workbench-editor-panel workbench-editor-pane contextual-card-editor" aria-label="Editar card">' +
        '<div class="card-assistance-card-picker" role="group" aria-label="Cards no reparo">' +
        visibleCards.map((card, index) => {
          const selected = selectedCardKeys.includes(card.id);
          const current = index === safeIndex;
          return '<button class="card-assistance-card-chip' + (selected ? " is-selected" : "") +
            (current ? " is-current" : "") + '" type="button" data-action="toggle-card-assistance-card" data-card-key="' +
            escapeHtml(card.id) + '" aria-pressed="' + (selected ? "true" : "false") +
            '" title="Card ' + String(index + 1) + '">' + String(index + 1) + "</button>";
        }).join("") +
        "</div>" +
        (editorSupport.canUndoCardEdit
          ? '<div class="contextual-editor-utility-row"><button class="icon-ghost" type="button" data-action="undo-card-edit" title="Desfazer última alteração" aria-label="Desfazer última alteração">' +
            renderUiIcon("arrow-left", "manual-card-editor-icon") + "</button></div>"
          : "") +
    cardAssistanceOperationControls +
    cardAssistanceTargetControls +
    manualCardEditor +
    '<label class="field generate-prompt-field workbench-prompt-field">' +
    '<div class="generate-prompt-layout">' +
    '<div class="workbench-prompt-tools">' +
    renderInlineFieldIcon("prompt", promptLabel) +
    "</div>" +
    '<div class="generate-prompt-content">' +
    '<textarea data-field="assist-prompt" class="assist-prompt" aria-label="' +
    escapeHtml(promptLabel) +
    '" title="' +
    escapeHtml(promptLabel) +
    '" placeholder="' +
    escapeHtml(promptPlaceholder) +
    '"' +
    (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") +
    ">" +
    escapeHtml(editorSupport.promptText || "") +
    "</textarea></div></div></label>" +
    attachmentInput +
    attachmentChips +
    '<div class="generate-action-row assist-actions assist-actions-wide assist-request-actions card-assistance-command-row">' +
    '<label class="field generate-icon-field generate-model-field">' +
    renderInlineFieldIcon("intent", "Modelo") +
    '<select data-field="assist-model" aria-label="Modelo" title="Modelo"' +
    (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") +
    ">" +
    modelOptions +
    "</select></label>" +
    renderPromptAttachmentButton("open-assist-attachment-picker", cardAssistanceLocked) +
    '<button class="icon-ghost tiny-icon generate-inline-icon" type="button" data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA"' +
    (cardAssistanceLocked ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("key", "generate-inline-icon-svg") +
    "</button>" +
    '<button class="open-main generate-submit" type="button" data-action="submit-card-assistance" title="' +
    escapeHtml(submitLabel) +
    '" aria-label="' +
    escapeHtml(submitLabel) +
    '"' +
    (cardAssistanceLocked || !editorSupport.cardAssistanceRequestReady
      ? ' disabled aria-disabled="true"'
      : "") +
    ">" +
    renderUiIcon("sparkles", "generate-submit-icon") +
    "</button>" +
    "</div>" +
    (editorSupport.assistErrorMessage
      ? '<p class="card-assistance-message" role="status">' +
        escapeHtml(editorSupport.assistErrorMessage) +
        "</p>"
      : "") +
    (editorSupport.assistIngestionMessage
      ? '<p class="card-assistance-message is-warning" role="status">' +
        escapeHtml(editorSupport.assistIngestionMessage) +
        "</p>"
      : "") +
    cardAssistancePreviewMarkup +
        "</section>"
      : "") +
    "</section>";

  return (
    '<section class="screen microsequence-workbench-screen">' +
    renderTopbar({
      title: course?.title || course?.id || "Curso",
      canGoBack: true,
      backTitle: "Voltar para a lição",
      actions: [
        {
          action: "toggle-card-edit-mode",
          title: editMode ? "Voltar à leitura" : "Editar card",
          icon: renderUiIcon(editMode ? "preview" : "edit", "home-tab-icon")
        },
        {
          action: "open-central",
          title: "Abrir painel",
          icon: renderUiIcon("cloud", "home-tab-icon")
        }
      ]
    }) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="workbench-surface' + (editMode ? " is-editing" : "") + '">' +
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

  return renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode, editorSupport });
}
