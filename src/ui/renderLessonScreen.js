import { renderHomeScreen } from "./renderHomeScreen.js";
import { readCardText } from "../core/cardRuntime.js";
import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocks,
  renderCardRuntimeBlocksWithDock,
  renderPopupButtonDock
} from "../render/renderCardRuntime.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { isDraftMicrosequence, isRunnableMicrosequence, resolveMicrosequenceRuntimeIncluded } from "../model/microsequenceStatus.js";
import { buildScopedVersionLineageLabel, splitVersionLineageLabel } from "./versionLineage.js";

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

function buildHistoryTopbarAction(historyTitle, historyCount, payload = {}) {
  return {
    action: "open-version-history",
    title: historyTitle,
    icon: "🕘",
    ...payload,
    ...(Number.isInteger(historyCount) ? { historyCount } : {})
  };
}

function renderStructureVersionContext(contextTabs = []) {
  const items = (contextTabs || []).filter((item) => item?.label);
  if (!items.length) {
    return "";
  }

  return items.map((item) => String(item.label || "").trim()).filter(Boolean).join(" · ");
}

function renderStructureVersionTabs({ tabs = [], activeVersionId = "", ariaLabel = "Versões" } = {}) {
  const items = Array.isArray(tabs) ? tabs : [];
  if (!items.length) {
    return "";
  }

  return (
    '<section class="structure-version-tabbar">' +
    '<div class="structure-version-strip-shell" data-structure-version-strip-shell="true">' +
    '<div class="editor-version-strip structure-version-strip" role="tablist" aria-label="' +
    escapeHtml(ariaLabel) +
    '" data-structure-version-strip="true">' +
    items
      .map((item, index) => {
        const label = item.lineage || item.displayId || buildScopedVersionLineageLabel(item, items, "V", index);
        const labelParts = splitVersionLineageLabel(label);
        const timestamp = item.timestampLabel || formatVersionTabTimestamp(item.updatedAt || item.createdAt || "");
        const isActive = item.isActive === true || item.versionId === activeVersionId;
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

function renderSectionHeading(title) {
  return (
    '<section class="section-heading-row centered-section-heading-row navigation-heading-row">' +
    '<h2 class="section-heading">' +
    escapeHtml(title) +
    "</h2></section>"
  );
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce(
    (total, microsequence) => total + (isRunnableMicrosequence(microsequence) ? (microsequence.cards || []).length : 0),
    0
  );
}

function countCardsInMicrosequence(microsequence) {
  return (microsequence.cards || []).length;
}

function countCompletedCardsInLesson(course, moduleValue, lesson, progress) {
  const entry = readLessonProgressEntry(progress, {
    courseKey: course.key,
    moduleKey: moduleValue.key,
    lessonKey: lesson.key
  });
  return entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys.length : 0;
}

function countCompletedCardsInMicrosequence(course, moduleValue, lesson, microsequence, progress) {
  const entry = readLessonProgressEntry(progress, {
    courseKey: course.key,
    moduleKey: moduleValue.key,
    lessonKey: lesson.key
  });
  const completedCardKeys = entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys : [];
  const cardKeys = new Set((microsequence.cards || []).map((card) => card.key));
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
  const explicitDescription = normalizeInlineText(lesson.description);
  if (explicitDescription) {
    return truncateText(explicitDescription);
  }

  for (const microsequence of lesson.microsequences || []) {
    const tags = normalizeInlineText((microsequence.tags || []).join(", "));
    if (tags) {
      return truncateText(tags);
    }
  }

  for (const microsequence of lesson.microsequences || []) {
    for (const card of microsequence.cards || []) {
      const text = normalizeInlineText(readCardText(card));
      if (text) {
        return truncateText(text);
      }
    }
  }

  return "";
}

function renderEditorCardStrip(cards, activeIndex, structureContext = {}) {
  return cards
    .map((card, index) => {
      const cardTitle = card.title || card.key;
      return (
        '<div class="mini-card-slot" data-structure-target="card" data-card-key="' +
        escapeHtml(card.key) +
        '" data-course-key="' +
        escapeHtml(structureContext.courseKey || "") +
        '" data-module-key="' +
        escapeHtml(structureContext.moduleKey || "") +
        '" data-lesson-key="' +
        escapeHtml(structureContext.lessonKey || "") +
        '" data-microsequence-key="' +
        escapeHtml(structureContext.microsequenceKey || "") +
        '">' +
        '<button class="mini-card thumb' +
        (index === activeIndex ? " active" : "") +
        '" type="button" draggable="true" data-structure-draggable="true" data-action="open-card" data-structure-level="card" data-course-key="' +
        escapeHtml(structureContext.courseKey || "") +
        '" data-module-key="' +
        escapeHtml(structureContext.moduleKey || "") +
        '" data-lesson-key="' +
        escapeHtml(structureContext.lessonKey || "") +
        '" data-microsequence-key="' +
        escapeHtml(structureContext.microsequenceKey || "") +
        '" data-card-key="' +
        escapeHtml(card.key) +
        '" aria-label="Card ' +
        String(index + 1) +
        ": " +
        escapeHtml(cardTitle) +
        '" title="Arrastar card' +
        '" data-card-index="' +
        String(index) +
        '">' +
        '<div class="mini-card-kicker" aria-hidden="true">' +
        renderWorkbenchIcon("card", "mini-card-kicker-icon") +
        "</div>" +
        '<div class="mini-card-title">' +
        escapeHtml(cardTitle) +
        "</div>" +
        "</button>" +
        "</div>"
      );
    })
    .join("");
}

function renderWorkbenchPaneIcon(pane) {
  return renderUiIcon(pane === "edit" ? "sparkles" : "preview", "workbench-surface-tab-icon");
}

function renderWorkbenchIcon(iconName, className = "workbench-icon") {
  return renderUiIcon(iconName, className);
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

function renderContextMetric(iconName, value, label) {
  return (
    '<span class="context-chip-metric" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(summarizeIconTitle(label)) +
    '">' +
    renderUiIcon(iconName, "context-chip-icon") +
    '<span class="context-chip-value">' +
    escapeHtml(value) +
    "</span></span>"
  );
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

function collectMicrosequenceDependencies(moduleValue, lessonKey, microsequenceKey) {
  const dependencies = [];
  for (const lesson of moduleValue.lessons || []) {
    for (const microsequence of lesson.microsequences || []) {
      if (lesson.key === lessonKey && microsequence.key === microsequenceKey) {
        return dependencies;
      }
      dependencies.push(microsequence);
    }
  }
  return dependencies;
}

function renderDidacticTags(moduleValue, lessonKey, microsequence) {
  const dependencies = collectMicrosequenceDependencies(moduleValue, lessonKey, microsequence.key);
  const visibleDependencies = dependencies.slice(-5);

  const dependencyTags = visibleDependencies
    .map((item) => {
      return (
        '<span class="didactic-tag dependency-tag-chip">' +
        '<span class="didactic-tag-text">' +
        escapeHtml(item.title || item.key) +
        "</span>" +
        "</span>"
      );
    })
    .join("");

  return (
    '<div class="didactic-tag-row">' +
    dependencyTags +
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

function renderCompactRuntimeTags(tags, dependencies) {
  const normalizedTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!normalizedTags.length) {
    return "";
  }

  const dependencyMap = new Map(
    (dependencies || []).map((item) => [String(item.key || "").trim().toLowerCase(), item.title || item.key || ""])
  );
  const labels = normalizedTags.map((tag) => dependencyMap.get(String(tag).trim().toLowerCase()) || String(tag));
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

function renderRuntimeBlocks(card, fallbackText, runtimeOptions = null) {
  return renderCardRuntimeBlocks(card, {
    omitRepeatedHeading: true,
    fallbackText,
    ...(runtimeOptions || {})
  });
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
      '<span class="microsequence-state-icon is-draft" aria-label="Rascunho" title="Rascunho">' +
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
  leadingIconHtml = "",
  readOnly = false
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
    (readOnly
      ? ""
      : renderStructureHandle({
          level,
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey: level === "microsequence" ? itemKey : "",
          label: dragLabel
        })) +
    '<h3 class="card-title">' +
    leadingIconHtml +
    escapeHtml(title) +
    "</h3></div>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    supportingHtml +
    "</div>" +
    metaHtml +
    ((readOnly && !openAction)
      ? ""
      : '<div class="lesson-actions structure-actions navigation-actions">' +
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
    "</div>") +
    "</article>"
  );
}

function renderCourseScreen({ course, progress, editorSupport }) {
  const readOnlyView = Boolean(editorSupport?.readOnlyView);
  const modules = (course.modules || [])
    .map((moduleValue) => {
      const moduleCompleted = countCompletedCardsInModule(course, moduleValue, progress);
      const moduleTotal = countCardsInModule(moduleValue);
      return renderHierarchyItemCard({
        level: "module",
        courseKey: course.key,
        itemKey: moduleValue.key,
        title: moduleValue.title || moduleValue.key,
        description: normalizeInlineText(moduleValue.description || ""),
        progressPercent: calculateProgressPercent(moduleCompleted, moduleTotal),
        metaHtml: renderMetaLine({
          completed: moduleCompleted,
          total: moduleTotal,
          parts: [renderCountMetric("lesson", (moduleValue.lessons || []).length, "lição", "lições")]
        }),
        menuAction: "open-module-actions",
        openAction: "open-module",
        generationAction: "open-generation-panel-module",
        dragLabel: `Arrastar módulo ${moduleValue.title || moduleValue.key}`,
        openTitle: "Abrir módulo",
        readOnly: readOnlyView
      });
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: course.title || "Curso",
      canGoBack: true,
      backAction: editorSupport?.readOnlyBackAction || "go-back",
      subtitle: editorSupport?.readOnlyView ? editorSupport?.readOnlySubtitle || "" : "",
      backTitle: editorSupport?.readOnlyBackTitle || "Menu principal",
      actions: readOnlyView ? [] : [
        {
          action: "open-generation-panel-course",
          title: "Abrir geração por IA neste curso",
          icon: renderUiIcon("sparkles", "home-tab-icon"),
          courseKey: course.key
        },
        { action: "quick-create-module", title: "Criar módulo vazio", icon: "＋" },
        { action: "open-version-history", title: "Snapshots do curso", icon: "🕘" },
        { action: "open-course-screen-actions", title: "Ações do curso", icon: "⋯" }
      ].filter(Boolean)
    }) +
    '<main class="screen-content course-screen" data-structure-collection="module" data-course-key="' +
    escapeHtml(course.key) +
    '">' +
    '<section class="navigation-list structure-navigation-list" data-structure-collection="module" data-course-key="' +
    escapeHtml(course.key) +
    '">' +
    (modules || '<section class="clean-card progress-card"><p class="card-subtitle">Sem módulos.</p></section>') +
    "</section>" +
    "</main></section>"
  );
}

function renderModuleScreen({ course, moduleValue, progress, editorSupport }) {
  const readOnlyView = Boolean(editorSupport?.readOnlyView);
  const lessons = (moduleValue.lessons || [])
    .map((lesson) => {
      const lessonCompleted = countCompletedCardsInLesson(course, moduleValue, lesson, progress);
      const lessonTotal = countCardsInLesson(lesson);
      return renderHierarchyItemCard({
        level: "lesson",
        courseKey: course.key,
        moduleKey: moduleValue.key,
        itemKey: lesson.key,
        title: lesson.title || lesson.key,
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
        dragLabel: `Arrastar lição ${lesson.title || lesson.key}`,
        openTitle: "Abrir lição",
        readOnly: readOnlyView
      });
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: moduleValue.title || "Módulo",
      canGoBack: true,
      backAction: editorSupport?.readOnlyBackAction || "go-back",
      subtitle: editorSupport?.readOnlyView ? editorSupport?.readOnlySubtitle || "" : "",
      backTitle: editorSupport?.readOnlyBackTitle || "Voltar",
      actions: readOnlyView ? [] : [
        {
          action: "open-generation-panel-module",
          title: "Abrir geração por IA neste módulo",
          icon: renderUiIcon("sparkles", "home-tab-icon"),
          courseKey: course.key,
          moduleKey: moduleValue.key
        },
        { action: "quick-create-lesson", title: "Criar lição vazia", icon: "＋" },
        { action: "open-version-history", title: "Snapshots do módulo", icon: "🕘" },
        { action: "open-module-screen-actions", title: "Ações do módulo", icon: "⋯" }
      ].filter(Boolean)
    }) +
    '<main class="screen-content course-screen" data-structure-collection="lesson" data-course-key="' +
    escapeHtml(course.key) +
    '" data-module-key="' +
    escapeHtml(moduleValue.key) +
    '">' +
    '<section class="navigation-list structure-navigation-list" data-structure-collection="lesson" data-course-key="' +
    escapeHtml(course.key) +
    '" data-module-key="' +
    escapeHtml(moduleValue.key) +
    '">' +
    (lessons || '<section class="clean-card progress-card"><p class="card-subtitle">Sem lições.</p></section>') +
    "</section>" +
    "</main></section>"
  );
}

function renderLessonScreenView({ course, lesson, moduleValue, progress, editorSupport }) {
  const readOnlyView = Boolean(editorSupport?.readOnlyView);
  const lessonTotal = countCardsInLesson(lesson);
  const groupedMicrosequences = {
    main: [],
    reinforcement: [],
    planned: [],
    draft: [],
    paused: []
  };

  (lesson.microsequences || []).forEach((microsequence) => {
    if (isPlannedMicrosequence(microsequence)) {
      groupedMicrosequences.planned.push(microsequence);
      return;
    }
    if (isDraftMicrosequence(microsequence)) {
      groupedMicrosequences.draft.push(microsequence);
      return;
    }
    if (!resolveMicrosequenceRuntimeIncluded(microsequence)) {
      groupedMicrosequences.paused.push(microsequence);
      return;
    }
    if (microsequence.role === "reinforcement") {
      groupedMicrosequences.reinforcement.push(microsequence);
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
      const isDraft = isDraftMicrosequence(microsequence);
      const isPlanned = isPlannedMicrosequence(microsequence);
      const canPlay = isRunnableMicrosequence(microsequence);
      const description = normalizeInlineText(
        microsequence.description || (isPlanned ? "Etapa planejada da trilha. Abra para materializar ou reformular." : "")
      );
      const supportingHtml = renderExplicitTags(microsequence.tags, "didactic-tag-row microsequence-tag-row");

      return renderHierarchyItemCard({
        level: "microsequence",
        courseKey: course.key,
        moduleKey: moduleValue.key,
        lessonKey: lesson.key,
        itemKey: microsequence.key,
        title: microsequence.title || microsequence.key,
        description,
        supportingHtml,
        leadingIconHtml: renderMicrosequenceStateIcon(microsequence),
        progressPercent: isDraft ? 0 : calculateProgressPercent(microsequenceCompleted, cardCount),
        metaHtml: renderMetaLine({
          completed: isDraft ? 0 : microsequenceCompleted,
          total: cardCount,
          parts: [renderCountMetric("card", cardCount, "card", "cards")]
        }),
        menuAction: "open-microsequence-actions",
        openAction: isDraft ? "open-microsequence-assist" : "play-microsequence",
        generationAction: "open-microsequence-assist",
        dragLabel: `Arrastar microssequência ${microsequence.title || microsequence.key}`,
        openTitle: isPlanned ? "Abrir microssequência planejada" : isDraft ? "Editar rascunho" : "Abrir microssequência",
        readOnly: readOnlyView
      }).replace('>▶</button>', canPlay || isDraft ? '>▶</button>' : ' disabled aria-disabled="true">▶</button>');
    })
      .join("");

    return '<section class="microsequence-group navigation-list">' + renderSectionHeading(title) + rows + "</section>";
  };

  const readyEmptyMessage =
    lessonTotal === 0
      ? '<section class="clean-card lesson-ready-empty-card"><p class="card-subtitle">' +
        escapeHtml(
          groupedMicrosequences.planned.length
            ? "Não há microssequências prontas para estudar aqui. As etapas planejadas abaixo podem ser materializadas quando você quiser."
            : "Não há microssequências prontas para estudar aqui."
        ) +
        "</p></section>"
      : "";
  const microsequenceGroups =
    renderMicrosequenceGroup("Microssequências", groupedMicrosequences.main) +
    renderMicrosequenceGroup("Reforços", groupedMicrosequences.reinforcement) +
    renderMicrosequenceGroup("Planejadas", groupedMicrosequences.planned) +
    renderMicrosequenceGroup("Rascunhos", groupedMicrosequences.draft) +
    renderMicrosequenceGroup("Fora do estudo", groupedMicrosequences.paused);

  return (
    '<section class="screen">' +
    renderTopbar({
      title: lesson.title || "Lição",
      canGoBack: true,
      backAction: editorSupport?.readOnlyBackAction || "go-back",
      subtitle: editorSupport?.readOnlyView ? editorSupport?.readOnlySubtitle || "" : "",
      backTitle: editorSupport?.readOnlyBackTitle || "Voltar",
      actions: readOnlyView ? [] : [
        {
          action: "open-lesson-source-guide",
          title: "Editar fonte-guia da lição",
          icon: "📎",
          courseKey: course.key,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key
        },
        {
          action: "open-generation-panel-lesson",
          title: "Abrir geração por IA nesta lição",
          icon: renderUiIcon("sparkles", "home-tab-icon"),
          courseKey: course.key,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key
        },
        { action: "quick-create-microsequence", title: "Criar microssequência vazia", icon: "＋" },
        { action: "open-version-history", title: "Snapshots da lição", icon: "🕘" },
        { action: "open-lesson-screen-actions", title: "Ações da lição", icon: "⋯" }
      ].filter(Boolean)
    }) +
    '<main class="screen-content lesson-structure-screen navigation-screen">' +
    readyEmptyMessage +
    '<section data-structure-collection="microsequence" data-course-key="' +
    escapeHtml(course.key) +
    '" data-module-key="' +
    escapeHtml(moduleValue.key) +
    '" data-lesson-key="' +
    escapeHtml(lesson.key) +
    '">' +
    (microsequenceGroups || '<section class="clean-card progress-card"><p class="card-subtitle">Sem microssequências.</p></section>') +
    "</section></main></section>"
  );
}

function renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode, editorSupport }) {
  const visualizedVersion = editorSupport.visualizedMicrosequenceVersion || null;
  const visualizedCards = Array.isArray(visualizedVersion?.cards) ? visualizedVersion.cards : cards;
  const visualizedTitle = visualizedVersion?.title || microsequence?.title || "";
  const visualizedTags = Array.isArray(visualizedVersion?.tags) ? visualizedVersion.tags : microsequence?.tags || [];
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
  const cardProgressPercent = lessonStudyCount ? ((safeIndex + 1) / lessonStudyCount) * 100 : 0;
  const bodyText = readCardText(activeCard);
  const lightDependencyTags = renderCompactRuntimeTags(visualizedTags, editorSupport.dependencies || []);
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
          blockKeyPrefix: popupBlockKey
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
  const pendingGeneratedActions = editorSupport.pendingGeneratedVersionActive
    ? '<section class="study-reader-footer workbench-preview-footer">' +
      '<div class="study-action-dock">' +
      '<div class="study-action-stack">' +
      '<div class="study-next-wrap workbench-preview-actions">' +
      '<button class="icon-ghost study-comment-btn" type="button" data-action="discard-generated-version" title="Excluir iteração atual" aria-label="Excluir iteração atual">' +
      renderUiIcon("remove-state", "generate-submit-icon") +
      "</button>" +
      '<button class="open-mini study-continue-btn" type="button" data-action="accept-generated-version" title="Aceitar iteração atual" aria-label="Aceitar iteração atual">' +
      renderUiIcon("ready-state", "generate-submit-icon") +
      "</button>" +
      "</div></div></div></section>"
    : "";
  const selectedDependencyTags = (editorSupport.dependencies || [])
    .filter((item) => visualizedTags.includes(item.key))
    .map((item) => {
      return (
        '<button class="didactic-tag dependency-tag-chip dependency-chip-button" type="button" data-action="remove-dependency" data-dependency-key="' +
        escapeHtml(item.key) +
        '">' +
        '<span class="didactic-tag-text dependency-chip-label">' +
        escapeHtml(item.title || item.key) +
        "</span>" +
        '<span class="dependency-chip-remove">&times;</span></button>'
      );
    })
    .join("");
  const availableDependencyOptions = (editorSupport.dependencies || [])
    .filter((item) => !visualizedTags.includes(item.key))
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.key) +
        '"' +
        (item.key === editorSupport.pendingDependencyKey ? " selected" : "") +
        ">" +
        escapeHtml(item.title || item.key) +
        "</option>"
      );
    })
    .join("");
  const dependencyPicker = availableDependencyOptions
    ? '<div class="assist-tag-picker">' +
      '<select data-field="assist-dependency-picker" aria-label="Tags" title="Tags">' +
      availableDependencyOptions +
      "</select>" +
      '<button class="icon-ghost tiny-icon" type="button" data-action="add-dependency" title="Adicionar tag" aria-label="Adicionar tag">+</button>' +
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
  const containerOptions = renderAssistContainerSelectOptions(
    editorSupport.containerOptions || [],
    editorSupport.preferredContainer,
    editorSupport.preferredContainerConfirmed
  );
  const feedbackSession = editorSupport.feedbackSession || {};
  const feedbackValue = editorSupport.feedbackDraftText || feedbackSession.feedbackText || feedbackSession.nextPromptDraft || "";
  const feedbackCanEdit = Boolean(feedbackValue.trim());
  const feedbackStatusClass =
    feedbackSession.status === "blocked"
      ? " is-warning"
      : feedbackSession.status === "stale"
        ? " is-muted"
        : feedbackSession.status && feedbackSession.status !== "completed"
          ? " is-attention"
          : "";
  const emptyCardsMessage = hasCards
    ? ""
    : isPlanned
      ? "Esta microssequência foi planejada, mas ainda não foi materializada."
      : "Os cards gerados aparecerão aqui após o envio do prompt.";
  const attachmentInput =
    '<input data-field="assist-attachments" class="assist-attachment-input" type="file" multiple accept=".pdf,.txt,.md,.json,.csv,.html,.xml,.js,.ts,.py,.java,.c,.cpp,.doc,.docx,.ppt,.pptx,.rtf,.odt,.ods,.odp,text/*,application/pdf,application/json,application/xml">';
  const attachmentChips = renderAssistAttachmentChips(editorSupport.attachments);
  const runtimeCardBody =
    hasCards
      ? '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
        '<div class="runtime-card-title">' +
        escapeHtml(activeCard ? activeCard.title || activeCard.key : "Sem card") +
        "</div>" +
        '<div class="card-sheet-content">' +
        runtime.bodyHtml +
        "</div>" +
        runtime.dockHtml +
        "</article>"
      : '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet runtime-card-sheet-empty">' +
        '<div class="runtime-card-title">Sem cards ainda</div>' +
        '<div class="card-sheet-content card-sheet-content-empty"><p class="runtime-paragraph">' +
        escapeHtml(isPlanned ? "Envie o pedido para gerar os primeiros cards desta microssequência." : "Envie o pedido para continuar a microssequência com os próximos cards.") +
        "</p></div></article>";
  const previewPane =
    '<section class="workbench-surface-pane workbench-preview-pane study-reader-screen">' +
    '<section class="study-reader-context">' +
    '<div class="study-reader-line">' +
    '<span class="study-reader-context-line study-reader-course-title">' +
    escapeHtml(course?.title || course?.key || "Curso") +
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
    "</div></div></div></section>" +
    pendingGeneratedActions +
    "</section>";
  const editPane =
    '<section class="workbench-editor-panel workbench-editor-pane">' +
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
    '<section class="microsequence-assist-panel bottomup-focus-panel assist-simple-panel assist-action-panel">' +
    '<div class="workbench-form-row assist-action-heading">' +
    renderInlineFieldIcon("intent", "O que a IA deve fazer agora") +
    '<p class="tiny muted">O que a IA deve fazer agora</p>' +
    "</div>" +
    '<div class="assist-action-options" role="radiogroup" aria-label="Ação da intervenção">' +
    assistActionOptions +
    "</div></section>" +
    '<div class="generate-divider workbench-divider"></div>' +
    '<div class="workbench-tag-layout">' +
    '<div class="workbench-form-row workbench-tag-picker-row">' +
    renderInlineFieldIcon("tags", "Tags") +
    (dependencyPicker || '<div class="workbench-tag-picker-empty"></div>') +
    "</div>" +
    '<div class="dependency-chip-row workbench-tag-chip-row">' +
    (selectedDependencyTags || '<p class="tiny muted bottomup-empty-copy">Selecione pelo menos uma tag para ancorar o pedido.</p>') +
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
    '<p class="tiny muted">Feedback</p>' +
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
      title: microsequence?.title || "Microssequência",
      canGoBack: true,
      backTitle: "Voltar para a lição",
      actions: [
        {
          action: "open-version-history",
          title: "Snapshots da microssequência",
          icon: "🕘"
        }
      ]
    }) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="workbench-surface" data-workbench-pane="' +
    activeWorkbenchPane +
    '">' +
    (hasCards ? renderWorkbenchPaneTabs(activeWorkbenchPane) : renderGenerationPaneTab()) +
    '<div class="workbench-surface-body">' +
    (activeWorkbenchPane === "edit" ? editPane : previewPane) +
    "</div></section></main></section>"
  );
}

function renderMicrosequenceAssistScreen({ course, lesson, microsequence, cards, selection, editorSupport }) {
  return renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode: "play", editorSupport });
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

  if (view === "microsequence-assist") {
    return renderMicrosequenceAssistScreen({ course, lesson, microsequence, cards, selection, editorSupport });
  }

  return renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode, editorSupport });
}
