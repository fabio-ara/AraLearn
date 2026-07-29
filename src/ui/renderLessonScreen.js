import { renderHomeScreen } from "./renderHomeScreen.js";
import { readCardText } from "../core/cardRuntime.js";
import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocksWithDock,
  renderPopupButtonDock
} from "../render/renderCardRuntime.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "./renderUiIcons.js";
import {
  isDraftMicrosequence,
  isRunnableMicrosequence,
  resolveMicrosequenceRuntimeIncluded
} from "../model/microsequenceStatus.js";
import {
  getCompositeBlockLabel,
  getResourceLabel
} from "../domain/resources.js";

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
  if (level === "card") return "Arrastar card";
  return "Arrastar item";
}

function renderStructureHandle({ level, courseKey = "", moduleKey = "", lessonKey = "", microsequenceKey = "", label }) {
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
    '">&#9776;</button>'
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
        '">‹</button>'
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

function renderWorkbenchPaneIcon(pane) {
  return renderUiIcon(pane === "edit" ? "sparkles" : "preview", "workbench-surface-tab-icon");
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

function renderPromptAttachmentButton(action = "open-assist-attachment-picker") {
  const title = "Anexar documentos";
  return (
    '<button class="icon-ghost tiny-icon generate-inline-icon" type="button" data-action="' +
    escapeHtml(action) +
    '" title="' +
    escapeHtml(title) +
    '" aria-label="' +
    escapeHtml(title) +
    '">' +
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
        '<span class="dependency-chip-remove">&times;</span></button>'
      );
    })
    .join("");

  return '<div class="dependency-chip-row workbench-tag-chip-row assist-attachment-chip-row">' + chips + "</div>";
}

function granularBlockLabel(block = {}, blockIndex = 0) {
  return `${getCompositeBlockLabel(block?.kind)} ${blockIndex + 1}`;
}

function renderGranularScopeControls(activeCard, granularScope = {}, disabled = false) {
  if (!activeCard) return "";
  const mode = ["microsequence", "card", "blocks"].includes(granularScope?.mode)
    ? granularScope.mode
    : "microsequence";
  const blocks = activeCard.resource === "composite" && Array.isArray(activeCard.blocks)
    ? activeCard.blocks
    : [];
  const selectedBlocks = new Set(granularScope?.blockIds || []);
  const activeResourceLabel = getResourceLabel(activeCard.resource, "Recurso");
  const scopeButtons = [
    { mode: "microsequence", icon: "microsequence", label: "Microssequência inteira", disabled: false },
    { mode: "card", icon: "card", label: `Card atual: ${activeResourceLabel}`, disabled: false },
    { mode: "blocks", icon: "module", label: "Recursos do card", disabled: !blocks.length }
  ].map((option) => {
    const isSelected = mode === option.mode;
    const isDisabled = disabled || option.disabled;
    return (
      '<button class="icon-ghost assist-scope-button' +
      (isSelected ? " is-selected" : "") +
      '" type="button" data-action="select-assist-scope" data-scope-mode="' +
      option.mode +
      '" aria-pressed="' +
      (isSelected ? "true" : "false") +
      '" title="' +
      escapeHtml(option.label) +
      '" aria-label="' +
      escapeHtml(option.label) +
      '"' +
      (isDisabled ? ' disabled aria-disabled="true"' : "") +
      ">" +
      renderUiIcon(option.icon, "assist-scope-icon") +
      "</button>"
    );
  }).join("");
  const blockButtons = mode === "blocks"
    ? '<div class="assist-block-scope-list" role="group" aria-label="Blocos selecionados">' +
      blocks.map((block, blockIndex) => {
        const label = granularBlockLabel(block, blockIndex);
        const blockId = String(block?.id || "");
        const isSelected = selectedBlocks.has(blockId);
        return (
          '<button class="assist-block-scope-button' +
          (isSelected ? " is-selected" : "") +
          '" type="button" data-action="toggle-assist-block" data-block-index="' +
          String(blockIndex) +
          '" data-block-id="' +
          escapeHtml(blockId) +
          '" aria-pressed="' +
          (isSelected ? "true" : "false") +
          '" title="' +
          escapeHtml(label) +
          '" aria-label="' +
          escapeHtml(label) +
          '"' +
          (disabled ? ' disabled aria-disabled="true"' : "") +
          ">" +
          renderUiIcon("card", "assist-block-scope-icon") +
          '<span aria-hidden="true">' +
          String(blockIndex + 1) +
          "</span></button>"
        );
      }).join("") +
      "</div>"
    : "";
  return (
    '<section class="assist-granular-scope" aria-label="Escopo da intervenção">' +
    '<div class="assist-granular-scope-heading">' +
    renderInlineFieldIcon("intent", "Escopo") +
    '<p class="workbench-editor-section-label">Escopo</p>' +
    '<div class="assist-scope-buttons" role="group" aria-label="Escolher escopo">' +
    scopeButtons +
    "</div></div>" +
    blockButtons +
    (mode !== "microsequence"
      ? '<label class="assist-granular-intent-field"><span>Tipo de alteração</span>' +
        '<select data-field="granular-mutation-intent"' +
        (disabled ? ' disabled aria-disabled="true"' : "") +
        ' aria-label="Tipo de alteração">' +
        [
          ["rewrite_content", "Reescrever conteúdo"],
          ["rebuild_practice", "Refazer prática"],
          ["change_resource", "Trocar recurso"],
          ...(mode === "card" ? [["rebuild_card", "Reconstruir card"]] : [])
        ].map(([value, label]) =>
          `<option value="${value}"${granularScope?.intent === value ? " selected" : ""}>${label}</option>`
        ).join("") +
        "</select></label>"
      : "") +
    "</section>"
  );
}

function resolveGranularPreviewCard(preview = null) {
  const selection = preview?.scopeSnapshot?.selection || {};
  const target = preview?.scopeSnapshot?.target || {};
  const course = (preview?.projectDocument?.courses || []).find((item) => item?.id === selection.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item?.id === selection.moduleKey);
  const lesson = (moduleValue?.lessons || []).find((item) => item?.id === selection.lessonKey);
  const microsequence = (lesson?.microsequences || []).find((item) => item?.id === selection.microsequenceKey);
  return (microsequence?.cards || []).find((item) => item?.id === target.cardKey) || null;
}

function renderGranularPreview(preview = null, disabled = false) {
  const card = resolveGranularPreviewCard(preview);
  if (!card) return "";
  const runtime = renderCardRuntimeBlocksWithDock(card, {
    omitRepeatedHeading: true,
    fallbackText: readCardText(card),
    omitPopupButtonBlock: false
  });
  const message = preview?.errorMessage || (preview?.stale
    ? "O card mudou. Descarte esta prévia e faça um novo pedido."
    : "");
  return (
    '<section class="assist-granular-preview" data-role="granular-preview"' +
    (preview?.stale ? ' data-stale="true"' : "") +
    ">" +
    '<div class="assist-granular-preview-heading"><p class="workbench-editor-section-label">Prévia</p>' +
    '<div class="assist-granular-preview-actions">' +
    '<button class="icon-ghost" type="button" data-action="discard-granular-preview" title="Descartar prévia" aria-label="Descartar prévia"' +
    (disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("remove-state", "assist-scope-icon") +
    "</button>" +
    '<button class="open-main" type="button" data-action="apply-granular-preview" title="Aplicar alteração" aria-label="Aplicar alteração"' +
    (disabled || preview?.stale ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("ready-state", "assist-scope-icon") +
    "</button></div></div>" +
    '<article class="assist-granular-preview-card"><div class="runtime-card-title">' +
    escapeHtml(card.title || card.id) +
    '</div><div class="card-sheet-content">' +
    runtime.bodyHtml +
    "</div></article>" +
    (message ? '<p class="assist-granular-preview-message">' + escapeHtml(message) + "</p>" : "") +
    "</section>"
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

function renderWorkbenchPaneTabs(activePane) {
  return (
    '<div class="workbench-surface-tabbar">' +
    '<div class="workbench-surface-strip" role="tablist" aria-label="Modos do card selecionado">' +
    '<button class="workbench-surface-tab' +
    (activePane === "preview" ? " active" : "") +
    '" type="button" role="tab" aria-selected="' +
    (activePane === "preview" ? "true" : "false") +
    '" data-action="select-workbench-pane" data-workbench-pane="preview" aria-label="Preview" title="Preview">' +
    renderWorkbenchPaneIcon("preview") +
    "</button>" +
    '<button class="workbench-surface-tab' +
    (activePane === "edit" ? " active" : "") +
    '" type="button" role="tab" aria-selected="' +
    (activePane === "edit" ? "true" : "false") +
    '" data-action="select-workbench-pane" data-workbench-pane="edit" aria-label="Edição" title="Edição">' +
    renderWorkbenchPaneIcon("edit") +
    "</button>" +
    "</div>" +
    "</div>"
  );
}

function renderGenerationPaneTab() {
  return (
    '<div class="workbench-surface-tabbar">' +
    '<div class="workbench-surface-strip" role="tablist" aria-label="Modo de geração">' +
    '<button class="workbench-surface-tab active" type="button" role="tab" aria-selected="true" data-action="select-workbench-pane" data-workbench-pane="edit" aria-label="Geração" title="Geração">' +
    renderWorkbenchPaneIcon("edit") +
    "</button>" +
    "</div>" +
    "</div>"
  );
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

function renderAssistActionOptions(actionOptions = [], selectedAction = "") {
  return actionOptions
    .map((item, index) => {
      const optionId = `assist-action-${index}`;
      const disabled = !!item.disabled;
      const checked = !disabled && item.value === selectedAction;
      return (
        '<label class="assist-action-option' +
        (checked ? " is-selected" : "") +
        (disabled ? " is-disabled" : "") +
        '" for="' +
        escapeHtml(optionId) +
        '"' +
        (disabled ? ' aria-disabled="true"' : "") +
        ' title="' +
        escapeHtml(disabled ? (item.disabledLabel || "Nenhuma próxima microssequência planejada.") : (item.label || item.value)) +
        '">' +
        '<input id="' +
        escapeHtml(optionId) +
        '" type="radio" name="assist-action-intent" data-field="assist-action-intent" value="' +
        escapeHtml(item.value) +
        '"' +
        (checked ? " checked" : "") +
        (disabled ? " disabled" : "") +
        ">" +
        '<span class="assist-action-icon" aria-hidden="true">' +
        renderUiIcon(item.icon || "intent", "assist-action-icon-svg") +
        "</span>" +
        '<span class="assist-action-copy">' +
        '<span class="assist-action-title">' +
        escapeHtml(item.label || item.value) +
        "</span></span></label>"
      );
    })
    .join("");
}

function renderAssistActionHint(selectedAction = "", { isPlanned = false } = {}) {
  const text =
    selectedAction === "repair_current"
      ? "Corrige os cards já gerados desta microssequência sem sair do foco local."
      : selectedAction === "next_planned"
        ? "Materializa a próxima microssequência já prevista na trilha principal."
        : selectedAction === "branch_after_current"
          ? "Cria uma microssequência nova fora da trilha principal com base no que o aluno já estudou. Depois, a continuação volta para a próxima etapa prevista na trilha."
          : selectedAction === "generate_current"
            ? isPlanned
              ? "Materializa os primeiros cards desta microssequência prevista na trilha."
              : "Gera mais cards dentro desta microssequência sem replanejar a trilha."
            : "";
  if (!text) {
    return "";
  }
  return '<p class="tiny muted assist-action-hint">' + escapeHtml(text) + "</p>";
}

function renderAssistContainerSelectOptions(options = [], selectedValue = "", confirmed = false) {
  const selectValue = confirmed ? selectedValue : "__unset__";
  return ['<option value="__unset__"' + (selectValue === "__unset__" ? " selected" : "") + '>Selecionar materialização</option>']
    .concat((options || []).map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.value) +
        '"' +
        (item.value === selectValue ? " selected" : "") +
        ">" +
        escapeHtml(item.label || item.value) +
        "</option>"
      );
    }))
    .join("");
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
  sourceGuideAction = "",
  sourceGuideTitle = "",
  menuAction = "",
  openAction = "",
  generationAction = "",
  progressPercent = 0,
  dragLabel,
  openTitle,
  leadingIconHtml = ""
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
      label: dragLabel
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
    (sourceGuideAction
      ? '<button class="icon-ghost" type="button" data-action="' +
        escapeHtml(sourceGuideAction) +
        '" data-course-key="' +
        escapeHtml(courseKey) +
        '"' +
        levelData +
        ' title="' +
        escapeHtml(sourceGuideTitle) +
        '" aria-label="' +
        escapeHtml(sourceGuideTitle) +
        '">📎</button>'
      : "") +
    (menuAction
      ? '<button class="icon-ghost" type="button" data-action="' +
        escapeHtml(menuAction) +
        '" data-course-key="' +
        escapeHtml(courseKey) +
        '"' +
        levelData +
        ' title="Ações" aria-label="Ações">⋯</button>'
      : "") +
    (generationAction
      ? '<button class="icon-ghost" type="button" data-action="' +
        escapeHtml(generationAction) +
        '" data-course-key="' +
        escapeHtml(courseKey) +
        '"' +
        levelData +
        ' title="Gerar neste nível" aria-label="Gerar neste nível">' +
        renderUiIcon("sparkles", "home-tab-icon") +
        "</button>"
      : "") +
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
    '">▶</button>'
      : "") +
    "</div>" +
    "</article>"
  );
}

function renderCourseScreen({ course, progress }) {
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
        menuAction: "open-module-actions",
        openAction: "open-module",
        generationAction: "open-generation-panel-module",
        dragLabel: `Arrastar módulo ${moduleValue.title || entityId(moduleValue)}`,
        openTitle: "Abrir módulo"
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
        {
          action: "open-generation-panel-course",
          title: "Abrir geração por IA neste curso",
          icon: renderUiIcon("sparkles", "home-tab-icon"),
          courseKey: entityId(course)
        },
        { action: "quick-create-module", title: "Criar módulo vazio", icon: "＋" },
        { action: "future-sync", title: "Abrir biblioteca e sincronização", icon: "☁" },
        { action: "open-course-screen-actions", title: "Ações do curso", icon: "⋯" }
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

function renderModuleScreen({ course, moduleValue, progress }) {
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
        sourceGuideAction: "open-lesson-source-guide",
        sourceGuideTitle: "Editar fonte-guia da lição",
        menuAction: "open-lesson-actions",
        openAction: "open-lesson",
        generationAction: "open-generation-panel-lesson",
        dragLabel: `Arrastar lição ${lesson.title || entityId(lesson)}`,
        openTitle: "Abrir lição"
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
        {
          action: "open-generation-panel-module",
          title: "Abrir geração por IA neste módulo",
          icon: renderUiIcon("sparkles", "home-tab-icon"),
          courseKey: entityId(course),
          moduleKey: entityId(moduleValue)
        },
        { action: "quick-create-lesson", title: "Criar lição vazia", icon: "＋" },
        { action: "future-sync", title: "Abrir biblioteca e sincronização", icon: "☁" },
        { action: "open-module-screen-actions", title: "Ações do módulo", icon: "⋯" }
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

function renderLessonScreenView({ course, lesson, moduleValue, progress }) {
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
        menuAction: "open-microsequence-actions",
        openAction: hasRuntimeCards ? "play-microsequence" : "open-microsequence-assist",
        generationAction: "open-microsequence-assist",
        dragLabel: `Arrastar microssequência ${microsequence.title || entityId(microsequence)}`,
        openTitle: hasRuntimeCards
          ? "Abrir microssequência"
          : isPlanned
            ? "Abrir microssequência planejada"
            : "Abrir microssequência"
      }).replace('>▶</button>', canPlay || isPlanned ? '>▶</button>' : ' disabled aria-disabled="true">▶</button>');
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
        {
          action: "open-lesson-source-guide",
          title: "Editar fonte-guia da lição",
          icon: "📎",
          courseKey: entityId(course),
          moduleKey: entityId(moduleValue),
          lessonKey: entityId(lesson)
        },
        {
          action: "open-generation-panel-lesson",
          title: "Abrir geração por IA nesta lição",
          icon: renderUiIcon("sparkles", "home-tab-icon"),
          courseKey: entityId(course),
          moduleKey: entityId(moduleValue),
          lessonKey: entityId(lesson)
        },
        { action: "quick-create-microsequence", title: "Criar microssequência vazia", icon: "＋" },
        { action: "future-sync", title: "Abrir biblioteca e sincronização", icon: "☁" },
        { action: "open-lesson-screen-actions", title: "Ações da lição", icon: "⋯" }
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
  const visualizedRefIds = Array.isArray(editorSupport.selectedRefIds) && editorSupport.selectedRefIds.length
    ? editorSupport.selectedRefIds
    : Array.isArray(microsequence?.dependsOn)
      ? microsequence.dependsOn
      : [];
  const visualizedRefTitles = resolveMicrosequenceRefTitles(visualizedRefIds, lesson);
  const visibleCards = Array.isArray(visualizedCards) ? visualizedCards : [];
  const activeIndex = Number.isInteger(selection.cardIndex) ? selection.cardIndex : 0;
  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, visibleCards.length - 1)));
  const activeCard = visibleCards[safeIndex] || null;
  const hasCards = visibleCards.length > 0;
  const isPlanned = isPlannedMicrosequence(microsequence);
  const activeWorkbenchPane = hasCards
    ? editorSupport.activeWorkbenchPane === "edit"
      ? "edit"
      : "preview"
    : "edit";
  const targetsNewMicrosequence = editorSupport.interventionTargetMode === "new_after_current";
  const promptLabel = editorSupport.assistPromptLabel || (targetsNewMicrosequence
    ? "Pedido da nova microssequência"
    : hasCards
      ? "Pedido dos próximos cards"
      : isPlanned
        ? "Pedido dos primeiros cards"
        : "Pedido");
  const submitLabel = editorSupport.assistSubmitLabel || (targetsNewMicrosequence
    ? "Gerar nova microssequência"
    : hasCards
      ? "Gerar próximos cards"
      : isPlanned
        ? "Gerar primeiros cards"
        : "Gerar cards");
  const lessonStudyCount = visibleCards.length;
  const prevDisabled = safeIndex <= 0;
  const nextDisabled = !hasCards || (microsequenceMode !== "play" && safeIndex >= visibleCards.length - 1);
  const cardProgressPercent = clampPercent(lessonStudyCount ? ((safeIndex + 1) / lessonStudyCount) * 100 : 0);
  const bodyText = readCardText(activeCard);
  const lightDependencyTags = renderCompactRuntimeRefs(visualizedRefIds, editorSupport.refs || [])
    || renderExplicitTags(visualizedRefTitles, "didactic-tag-row");
  const popupEntry = activeCard ? getRuntimePopupButtonEntry(activeCard) : null;
  const popupBlockKey = editorSupport.continuePopup?.blockKey || `runtime-block::${popupEntry?.index ?? 0}`;
  const runtime = renderCardRuntimeBlocksWithDock(activeCard, {
    omitRepeatedHeading: true,
    fallbackText: bodyText,
    ...(editorSupport.cardRuntimeOptions || {}),
    omitPopupButtonBlock: !!popupEntry
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
        '<button class="open-mini study-continue-popup-btn" type="button" data-action="continue-popup-next" title="Continuar" aria-label="Continuar">&#9654;</button>' +
        "</div></section></div>"
      : "";
  const selectedDependencyTags = (editorSupport.refs || [])
    .filter((item) => visualizedRefIds.includes(item.id))
    .map((item) => {
      return (
        '<button class="didactic-tag dependency-tag-chip dependency-chip-button" type="button" data-action="remove-ref" data-ref-id="' +
        escapeHtml(item.id) +
        '">' +
        '<span class="didactic-tag-text dependency-chip-label">' +
        escapeHtml(item.title || item.id) +
        "</span>" +
        '<span class="dependency-chip-remove">&times;</span></button>'
      );
    })
    .join("");
  const availableDependencyOptions = (editorSupport.refs || [])
    .filter((item) => !visualizedRefIds.includes(item.id))
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.id) +
        '"' +
        (item.id === editorSupport.pendingRefId ? " selected" : "") +
        ">" +
        escapeHtml(item.title || item.id) +
        "</option>"
      );
    })
    .join("");
  const dependencyPicker = availableDependencyOptions
    ? '<div class="assist-tag-picker">' +
      '<select data-field="assist-ref-picker" aria-label="Refs" title="Refs">' +
      availableDependencyOptions +
      "</select>" +
      '<button class="icon-ghost tiny-icon" type="button" data-action="add-ref" title="Adicionar ref" aria-label="Adicionar ref">+</button>' +
      "</div>"
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
    .join("");
  const assistActionOptions = renderAssistActionOptions(
    editorSupport.assistActionOptions || [],
    editorSupport.selectedAssistAction || ""
  );
  const assistActionHint = renderAssistActionHint(editorSupport.selectedAssistAction || "", { isPlanned });
  const containerOptions = renderAssistContainerSelectOptions(
    editorSupport.containerOptions || [],
    editorSupport.preferredContainer,
    editorSupport.preferredContainerConfirmed
  );
  const feedbackSession = editorSupport.feedbackSession || {};
  const feedbackValue = editorSupport.feedbackEditing
    ? editorSupport.feedbackDraftText || feedbackSession.nextPromptDraft || ""
    : feedbackSession.feedbackText || editorSupport.feedbackDraftText || feedbackSession.nextPromptDraft || "";
  const feedbackCanEdit = Boolean((feedbackSession.nextPromptDraft || feedbackValue).trim());
  const feedbackStatusClass =
    feedbackSession.status === "blocked"
      ? " is-warning"
      : feedbackSession.status === "stale"
        ? " is-muted"
        : feedbackSession.status && feedbackSession.status !== "completed"
          ? " is-attention"
          : "";
  const attachmentInput =
    '<input data-field="assist-attachments" class="assist-attachment-input" type="file" multiple accept=".pdf,.txt,.md,.json,.csv,.html,.xml,.js,.ts,.py,.java,.c,.cpp,.doc,.docx,.ppt,.pptx,.rtf,.odt,.ods,.odp,text/*,application/pdf,application/json,application/xml">';
  const attachmentChips = renderAssistAttachmentChips(editorSupport.attachments);
  const granularScopeControls = renderGranularScopeControls(
    activeCard,
    editorSupport.granularScope,
    editorSupport.isSubmitting || Boolean(editorSupport.granularPreview)
  );
  const granularPreview = renderGranularPreview(
    editorSupport.granularPreview,
    editorSupport.isSubmitting
  );
  const runtimeCardBody =
    hasCards
      ? '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
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
            ? "Envie o pedido para gerar os primeiros cards desta microssequência."
            : "Envie o pedido para continuar a microssequência com os próximos cards.") +
        "</p></div></article>";
  const previewPane =
    '<section class="workbench-surface-pane workbench-preview-pane study-reader-screen">' +
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
    '<button class="icon-ghost study-comment-btn" type="button" data-action="open-card-comment" title="Anotação pessoal" aria-label="Anotação pessoal"><span class="comment-glyph" aria-hidden="true"></span></button>' +
    '<button class="icon-ghost" type="button" data-action="prev-card" ' +
    (prevDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Card anterior" aria-label="Card anterior">&larr;</button>' +
    '<button class="open-mini study-continue-btn" type="button" data-action="next-card" ' +
    (nextDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Continuar" aria-label="Continuar">&#9654;</button>' +
    continuePopupHtml +
    "</div></div></div></section></section>";
  const editPane =
    '<section class="workbench-editor-panel workbench-editor-pane">' +
    '<header class="workbench-editor-heading">' +
    '<h2 class="generation-overlay-title workbench-editor-title">Editar com IA</h2>' +
    "</header>" +
    '<label class="field generate-prompt-field workbench-prompt-field">' +
    '<div class="generate-prompt-layout">' +
    '<div class="workbench-prompt-tools">' +
    renderInlineFieldIcon("prompt", promptLabel) +
    '<button class="icon-ghost tiny-icon generate-inline-icon workbench-inline-reset" type="button" data-action="clear-assist-request" title="Limpar pedido" aria-label="Limpar pedido">&#8635;</button>' +
    "</div>" +
    '<div class="generate-prompt-content">' +
    '<textarea data-field="assist-prompt" class="assist-prompt" aria-label="' +
    escapeHtml(promptLabel) +
    '" title="' +
    escapeHtml(promptLabel) +
    '" placeholder="' +
    escapeHtml(editorSupport.assistPromptPlaceholder || "") +
    '">' +
    escapeHtml(editorSupport.promptText || "") +
    "</textarea></div></div></label>" +
    attachmentInput +
    attachmentChips +
    granularScopeControls +
    granularPreview +
    '<section class="microsequence-assist-panel bottomup-focus-panel assist-simple-panel assist-action-panel">' +
    '<div class="workbench-form-row assist-action-heading">' +
    renderInlineFieldIcon("intent", "O que a IA deve fazer agora") +
    '<p class="workbench-editor-section-label">O que a IA deve fazer agora</p>' +
    "</div>" +
    '<div class="assist-action-options" role="radiogroup" aria-label="Ação da intervenção">' +
    assistActionOptions +
    "</div>" +
    assistActionHint +
    "</section>" +
    '<div class="generate-divider workbench-divider"></div>' +
    '<div class="workbench-tag-layout">' +
    '<div class="workbench-form-row workbench-tag-picker-row">' +
    renderInlineFieldIcon("tags", "Refs") +
    (dependencyPicker || '<div class="workbench-tag-picker-empty"></div>') +
    "</div>" +
    '<div class="dependency-chip-row workbench-tag-chip-row">' +
    (selectedDependencyTags || '<p class="tiny muted bottomup-empty-copy">Selecione pelo menos uma ref para ancorar o pedido.</p>') +
    "</div></div>" +
    '<label class="field generate-icon-field workbench-select-field">' +
    renderInlineFieldIcon("card", "Materialização preferida") +
    '<select data-field="assist-preferred-container" aria-label="Materialização preferida" title="Materialização preferida">' +
    containerOptions +
    "</select></label>" +
    '<div class="generate-action-row assist-actions assist-actions-wide assist-request-actions">' +
    '<label class="field generate-icon-field generate-model-field">' +
    renderInlineFieldIcon("intent", "Modelo") +
    '<select data-field="assist-model" aria-label="Modelo" title="Modelo">' +
    modelOptions +
    "</select></label>" +
    renderPromptAttachmentButton("open-assist-attachment-picker") +
    '<button class="icon-ghost tiny-icon generate-inline-icon" type="button" data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA">&#128273;</button>' +
    '<button class="open-main generate-submit" type="button" data-action="apply-assist" title="' +
    escapeHtml(submitLabel) +
    '" aria-label="' +
    escapeHtml(submitLabel) +
    '"' +
    (!editorSupport.assistRequestReady
      ? ' disabled aria-disabled="true"'
      : "") +
    ">" +
    renderUiIcon("sparkles", "generate-submit-icon") +
    "</button>" +
    "</div>" +
    '<div class="generate-divider workbench-divider"></div>' +
    '<section class="assist-feedback-panel' +
    feedbackStatusClass +
    '">' +
    '<div class="assist-feedback-heading">' +
    '<p class="workbench-editor-section-label">Feedback</p>' +
    "</div>" +
    '<div class="field generate-prompt-field workbench-prompt-field assist-feedback-field">' +
    '<div class="generate-prompt-layout">' +
    '<div class="workbench-prompt-tools">' +
    renderInlineFieldIcon("prompt", "Retorno da intervenção") +
    '<button class="icon-ghost tiny-icon generate-inline-icon assist-feedback-edit-button" type="button" data-action="toggle-feedback-edit" aria-pressed="' +
    (editorSupport.feedbackEditing ? "true" : "false") +
    '" title="' +
    escapeHtml(editorSupport.feedbackEditing ? "Concluir edição do retorno" : "Editar retorno") +
    '" aria-label="' +
    escapeHtml(editorSupport.feedbackEditing ? "Concluir edição do retorno" : "Editar retorno") +
    '"' +
    (!feedbackCanEdit ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon(editorSupport.feedbackEditing ? "ready-state" : "edit", "generate-submit-icon") +
    "</button>" +
    "</div>" +
    '<div class="generate-prompt-content assist-feedback-content">' +
    '<textarea data-field="assist-feedback" class="assist-prompt assist-feedback-textarea" aria-label="Retorno da intervenção" title="Retorno da intervenção"' +
    (editorSupport.feedbackEditing ? "" : ' readonly aria-readonly="true"') +
    ">" +
    escapeHtml(feedbackValue) +
    "</textarea></div></div></div>" +
    '<div class="generate-action-row assist-actions assist-actions-wide assist-request-actions assist-feedback-actions">' +
    '<label class="field generate-icon-field generate-model-field">' +
    renderInlineFieldIcon("intent", "Modelo") +
    '<select data-field="assist-feedback-model" aria-label="Modelo" title="Modelo">' +
    modelOptions +
    "</select></label>" +
    renderPromptAttachmentButton("open-assist-feedback-attachment-picker") +
    '<button class="icon-ghost tiny-icon generate-inline-icon" type="button" data-action="open-assist-feedback-config" title="Configurar IA" aria-label="Configurar IA">&#128273;</button>' +
    '<button class="open-main generate-submit" type="button" data-action="apply-assist-feedback" title="' +
    escapeHtml(editorSupport.feedbackSubmitLabel || "Iterar") +
    '" aria-label="' +
    escapeHtml(editorSupport.feedbackSubmitLabel || "Iterar") +
    '"' +
    (!editorSupport.feedbackRequestReady ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("sparkles", "generate-submit-icon") +
    "</button></div></section>" +
    "</section>";

  return (
    '<section class="screen microsequence-workbench-screen">' +
    renderTopbar({
      title: course?.title || course?.id || "Curso",
      canGoBack: true,
      backTitle: "Voltar para a lição",
      actions: [
        {
          action: "future-sync",
          title: "Abrir biblioteca e sincronização",
          icon: "☁"
        },
        {
          action: "open-microsequence-actions",
          title: "Ações da microssequência",
          icon: "⋯"
        }
      ]
    }) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="workbench-surface" data-workbench-pane="' +
    activeWorkbenchPane +
    '">' +
    (hasCards
        ? renderWorkbenchPaneTabs(activeWorkbenchPane)
        : renderGenerationPaneTab()) +
    '<div class="workbench-surface-body">' +
    (activeWorkbenchPane === "edit" ? editPane : previewPane) +
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
