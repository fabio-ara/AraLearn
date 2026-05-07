import { renderHomeScreen } from "./renderHomeScreen.js";
import { readCardText } from "../core/cardRuntime.js";
import { renderCardRuntimeBlocks, renderCardRuntimeBlocksWithDock } from "../render/renderCardRuntime.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { isDraftMicrosequence, isReadyMicrosequence } from "../model/microsequenceStatus.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTopbar({
  title,
  canGoBack,
  backTitle = "Voltar",
  editAction,
  editTitle = "Editar",
  editIcon = "&#9998;"
}) {
  return (
    '<header class="lesson-topbar">' +
    (canGoBack
      ? '<button class="icon-ghost" type="button" data-action="go-back" title="' +
        escapeHtml(backTitle) +
        '" aria-label="' +
        escapeHtml(backTitle) +
        '">‹</button>'
      : '<div class="topbar-space"></div>') +
    '<div class="topbar-heading">' +
    '<div class="topbar-title">' +
    escapeHtml(title) +
    "</div>" +
    "</div>" +
    '<div class="lesson-top-actions">' +
    (editAction
      ? '<button class="icon-ghost" type="button" data-action="' +
        escapeHtml(editAction) +
        '" title="' +
        escapeHtml(editTitle) +
        '" aria-label="' +
        escapeHtml(editTitle) +
        '">' +
        editIcon +
        "</button>"
      : '<div class="topbar-space"></div>') +
    "</div>" +
    "</header>"
  );
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce(
    (total, microsequence) => total + (isReadyMicrosequence(microsequence) ? (microsequence.cards || []).length : 0),
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

function percent(total, completed) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (completed / total) * 100));
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

function renderEditorCardStrip(cards, activeIndex) {
  return cards
    .map((card, index) => {
      const cardTitle = card.title || card.key;
      return (
        '<button class="mini-card thumb' +
        (index === activeIndex ? " active" : "") +
        '" type="button" data-action="open-card" data-card-index="' +
        String(index) +
        '" aria-label="Card ' +
        String(index + 1) +
        ": " +
        escapeHtml(cardTitle) +
        '" title="Card ' +
        String(index + 1) +
        '">' +
        '<div class="mini-card-kicker" aria-hidden="true">' +
        renderWorkbenchIcon("card", "mini-card-kicker-icon") +
        "</div>" +
        '<div class="mini-card-title">' +
        escapeHtml(cardTitle) +
        "</div>" +
        "</button>"
      );
    })
    .join("");
}

function renderWorkbenchCardStrip(cards, activeIndex) {
  return (
    '<div class="editor-card-strip-shell" data-card-strip-shell="true">' +
    '<button class="editor-card-strip-arrow is-prev" type="button" data-action="scroll-card-strip-prev" title="Mostrar cards anteriores" aria-label="Mostrar cards anteriores" hidden>&larr;</button>' +
    '<div class="editor-step-strip editor-card-strip-track" data-card-strip="true">' +
    renderEditorCardStrip(cards, activeIndex) +
    "</div>" +
    '<button class="editor-card-strip-arrow is-next" type="button" data-action="scroll-card-strip-next" title="Mostrar mais cards" aria-label="Mostrar mais cards" hidden>&rarr;</button>' +
    "</div>"
  );
}

function renderWorkbenchPaneIcon(pane) {
  return renderUiIcon(pane === "edit" ? "edit" : "preview", "workbench-surface-tab-icon");
}

function renderWorkbenchIcon(iconName, className = "workbench-icon") {
  return renderUiIcon(iconName, className);
}

function renderWorkbenchIconLabel(iconName, label) {
  return (
    '<label class="workbench-icon-label" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '">' +
    renderWorkbenchIcon(iconName) +
    "</label>"
  );
}

function renderMetaMetric(iconName, value, label) {
  return (
    '<span class="progress-meta-item" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
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
    escapeHtml(label) +
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

function renderLightDependencyTags(dependencies) {
  return (dependencies || [])
    .slice(0, 4)
    .map((item) => {
      return (
        '<span class="didactic-tag dependency-tag-chip light-tag">' +
        '<span class="didactic-tag-text">' +
        escapeHtml(item.title || item.key) +
        "</span>" +
        "</span>"
      );
    })
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

function getAssistActionLabel(mode) {
  if (mode === "edit-microsequence") {
    return "Editar microssequência";
  }
  if (mode === "reposition-in-course") {
    return "Reposicionar em um curso";
  }
  return "Gerar microssequência";
}

function renderMicrosequenceStatusBadge(microsequence) {
  if (!isDraftMicrosequence(microsequence)) {
    return "";
  }
  return '<span class="microsequence-status-badge">rascunho</span>';
}

function renderAssistControlPanel({ editorSupport, promptLabel, sendTitle, className = "" }) {
  const selectedDependencyTags = (editorSupport.dependencies || [])
    .filter((item) => editorSupport.selectedDependencyKeys.includes(item.key))
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
    .filter((item) => !editorSupport.selectedDependencyKeys.includes(item.key))
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
  const assistModeOptions = (editorSupport.assistModeOptions || [])
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.value) +
        '"' +
        (item.value === editorSupport.selectedAssistMode ? " selected" : "") +
        ">" +
        escapeHtml(item.label) +
        "</option>"
      );
    })
    .join("");
  const assistWarning = editorSupport.assistError
    ? '<section class="microsequence-assist-panel assist-status-panel is-warning">' +
      '<p class="muted assist-last-request">' +
      escapeHtml(editorSupport.assistError) +
      "</p></section>"
    : "";
  const assistStatus = editorSupport.lastRequest
    ? '<section class="microsequence-assist-panel assist-status-panel">' +
      '<p class="tiny muted">' +
      escapeHtml(editorSupport.lastRequest.title || "Último pedido") +
      "</p>" +
      '<p class="muted assist-last-request">' +
      escapeHtml(editorSupport.lastRequest.description || "") +
      "</p></section>"
    : "";
  const actionLabel = getAssistActionLabel(editorSupport.selectedAssistMode);

  return (
    '<section class="microsequence-assist-panel microsequence-generator-panel workbench-editor-panel' +
    (className ? " " + escapeHtml(className) : "") +
    '">' +
    '<div class="field compact-field">' +
    renderWorkbenchIconLabel("tags", "Tags") +
    dependencyPicker +
    '<div class="dependency-chip-row">' +
    selectedDependencyTags +
    "</div></div>" +
    '<div class="field compact-field">' +
    renderWorkbenchIconLabel("intent", "Intenção") +
    '<select data-field="assist-mode" aria-label="Intenção" title="Intenção"' +
    (editorSupport.assistModeLocked ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    assistModeOptions +
    "</select></div>" +
    '<div class="field compact-field workbench-prompt-field">' +
    renderWorkbenchIconLabel("prompt", promptLabel) +
    '<textarea data-field="assist-prompt" class="assist-prompt" aria-label="' +
    escapeHtml(promptLabel) +
    '" title="' +
    escapeHtml(promptLabel) +
    '">' +
    escapeHtml(editorSupport.promptText || "") +
    "</textarea></div>" +
    '<div class="assist-actions assist-actions-wide">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="clear-prompt" title="Limpar prompt" aria-label="Limpar prompt">&#8635;</button>' +
    '<select data-field="assist-model">' +
    modelOptions +
    "</select>" +
    '<button class="icon-ghost tiny-icon" type="button" data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA">&#128273;</button>' +
    '<button class="open-mini" type="button" data-action="apply-assist" title="' +
    escapeHtml(actionLabel || sendTitle) +
    '" aria-label="' +
    escapeHtml(actionLabel || sendTitle) +
    '"' +
    (editorSupport.isSubmitting ? " disabled aria-disabled=\"true\"" : "") +
    ">&#9654;</button>" +
    "</div>" +
    assistWarning +
    assistStatus +
    "</section>"
  );
}

function renderDraftCourseScreen({ course, draftMicrosequences }) {
  const draftCards = (draftMicrosequences || [])
    .map((microsequence) => {
      const cardCount = countCardsInMicrosequence(microsequence);
      const draftTags = renderExplicitTags(microsequence.tags, "didactic-tag-row didactic-tag-row-limited");
      return (
        '<article class="clean-card microsequence-card progress-card draft-microsequence-card">' +
        '<div class="microsequence-copy">' +
        '<button class="row-main microsequence-main-button" type="button" data-action="open-draft-review" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '">' +
        '<span class="microsequence-title">' +
        escapeHtml(microsequence.title || microsequence.key) +
        "</span>" +
        "</button>" +
        draftTags +
        renderMetaLine({
          completed: 0,
          total: cardCount,
          parts: [renderCountMetric("card", cardCount, "card", "cards")]
        }) +
        "</div>" +
        '<div class="microsequence-actions">' +
        '<button class="icon-ghost tiny-icon" type="button" data-action="open-draft-review" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '" title="Revisar microssequência" aria-label="Revisar microssequência">&#9998;</button>' +
        '<button class="open-mini" type="button" data-action="play-microsequence" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '" title="Começar microssequência" aria-label="Começar microssequência">&#9654;</button>' +
        "</div>" +
        "</article>"
      );
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: course.title || "Curso",
      canGoBack: true,
      backTitle: "Menu principal",
      editAction: "open-course-screen-actions",
      editTitle: "Ações",
      editIcon: "&#9776;"
    }) +
    '<main class="screen-content course-screen">' +
    '<section class="clean-card draft-course-hero">' +
    '<div class="draft-course-hero-main">' +
    '<div class="microsequence-copy">' +
    '<h3 class="card-title card-title-featured">Gerar novas microssequências</h3>' +
    '<p class="card-subtitle">Use um pedido amplo, selecione tags explícitas e gere rascunhos antes de consolidar em cursos definitivos.</p>' +
    "</div>" +
    '<div class="microsequence-actions">' +
    '<button class="open-mini" type="button" data-action="open-draft-generator" title="Gerar microssequência" aria-label="Gerar microssequência">&#9654;</button>' +
    "</div>" +
    "</div>" +
    "</section>" +
    '<section class="clean-card module-card progress-card">' +
    '<header class="module-head">' +
    '<h3 class="card-title">Fila de rascunhos</h3>' +
    '<button class="icon-ghost" type="button" data-action="open-lesson-actions" data-module-key="' +
    escapeHtml(course.modules?.[0]?.key || "") +
    '" data-lesson-key="' +
    escapeHtml(course.modules?.[0]?.lessons?.[0]?.key || "") +
    '" title="Ações da fila" aria-label="Ações da fila">&ctdot;</button>' +
    "</header>" +
    (draftCards || '<p class="card-subtitle">Nenhuma microssequência gerada ainda.</p>') +
    "</section>" +
    "</main>" +
    "</section>"
  );
}

function renderCourseScreen({ course, progress }) {
  const modules = (course.modules || [])
    .map((moduleValue) => {
      const moduleCompleted = countCompletedCardsInModule(course, moduleValue, progress);
      const moduleTotal = countCardsInModule(moduleValue);
      const modulePercent = percent(moduleTotal, moduleCompleted);
      const lessons = (moduleValue.lessons || [])
        .map((lesson) => {
          const lessonCompleted = countCompletedCardsInLesson(course, moduleValue, lesson, progress);
          const lessonTotal = countCardsInLesson(lesson);
          const lessonPercent = percent(lessonTotal, lessonCompleted);
          const lessonDescription = getLessonDescription(lesson);
          return (
            '<li class="lesson-item progress-row">' +
            '<div class="row-progress-fill" style="width:' +
            String(lessonPercent) +
            '%"></div>' +
            '<div class="lesson-copy">' +
            '<button class="row-main lesson-main-button" type="button" data-action="open-lesson" data-module-key="' +
            escapeHtml(moduleValue.key) +
            '" data-lesson-key="' +
            escapeHtml(lesson.key) +
            '">' +
            '<span class="lesson-title">' +
            escapeHtml(lesson.title || lesson.key) +
            "</span>" +
            "</button>" +
            (lessonDescription
              ? '<p class="card-subtitle lesson-description">' + escapeHtml(lessonDescription) + "</p>"
              : "") +
            renderMetaLine({
              completed: lessonCompleted,
              total: lessonTotal,
              parts: [renderCountMetric("microsequence", (lesson.microsequences || []).length, "microssequência", "microssequências")]
            }) +
            "</div>" +
            '<div class="lesson-actions">' +
            '<button class="icon-ghost" type="button" data-action="open-lesson-actions" data-module-key="' +
            escapeHtml(moduleValue.key) +
            '" data-lesson-key="' +
            escapeHtml(lesson.key) +
            '" title="Ações da lição" aria-label="Ações da lição">&ctdot;</button>' +
            '<button class="open-mini" type="button" data-action="open-lesson" data-module-key="' +
            escapeHtml(moduleValue.key) +
            '" data-lesson-key="' +
            escapeHtml(lesson.key) +
            '" title="Abrir lição" aria-label="Abrir lição">&#9654;</button>' +
            "</div>" +
            "</li>"
          );
        })
        .join("");

      return (
        '<section class="clean-card module-card progress-card">' +
        '<div class="card-progress-fill" style="width:' +
        String(modulePercent) +
        '%"></div>' +
        '<header class="module-head">' +
        '<h3 class="card-title">' +
        escapeHtml(moduleValue.title || moduleValue.key) +
        "</h3>" +
        '<button class="icon-ghost" type="button" data-action="open-module-actions" data-module-key="' +
        escapeHtml(moduleValue.key) +
        '" title="Ações do módulo" aria-label="Ações do módulo">&ctdot;</button>' +
        "</header>" +
        renderMetaLine({
          completed: moduleCompleted,
          total: moduleTotal,
          parts: [renderCountMetric("lesson", (moduleValue.lessons || []).length, "lição", "lições")]
        }) +
        '<ul class="lesson-list">' +
        (lessons || '<li class="lesson-item"><p class="muted tiny">Sem lições.</p></li>') +
        "</ul>" +
        "</section>"
      );
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: course.title || "Curso",
      canGoBack: true,
      backTitle: "Menu principal",
      editAction: "open-course-screen-actions",
      editTitle: "Ações",
      editIcon: "&#9776;"
    }) +
    '<main class="screen-content course-screen">' +
    modules +
    "</main>" +
    "</section>"
  );
}

function renderLessonScreenView({ course, lesson, moduleValue, progress }) {
  const lessonCompleted = countCompletedCardsInLesson(course, moduleValue, lesson, progress);
  const lessonTotal = countCardsInLesson(lesson);
  const microsequenceBlocks = (lesson.microsequences || [])
    .map((microsequence) => {
      const cardCount = countCardsInMicrosequence(microsequence);
      const microsequenceCompleted = countCompletedCardsInMicrosequence(course, moduleValue, lesson, microsequence, progress);
      const microsequencePercent = percent(cardCount, microsequenceCompleted);
      const didacticTags = renderDidacticTags(moduleValue, lesson.key, microsequence);
      const isDraft = isDraftMicrosequence(microsequence);

      return (
        '<article class="clean-card microsequence-card progress-card' +
        (isDraft ? " draft-microsequence-card" : "") +
        '">' +
        '<div class="card-progress-fill" style="width:' +
        String(isDraft ? 0 : microsequencePercent) +
        '%"></div>' +
        '<div class="microsequence-copy">' +
        '<button class="row-main microsequence-main-button" type="button" data-action="' +
        (isDraft ? "open-microsequence-assist" : "play-microsequence") +
        '" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '">' +
        '<span class="microsequence-title">' +
        escapeHtml(microsequence.title || microsequence.key) +
        "</span>" +
        renderMicrosequenceStatusBadge(microsequence) +
        "</button>" +
        didacticTags +
        renderMetaLine({
          completed: isDraft ? 0 : microsequenceCompleted,
          total: cardCount,
          parts: [renderCountMetric("card", cardCount, "card", "cards")]
        }) +
        "</div>" +
        '<div class="microsequence-actions">' +
        '<button class="icon-ghost tiny-icon" type="button" data-action="open-microsequence-actions" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '" title="Ações da microssequência" aria-label="Ações da microssequência">&#8943;</button>' +
        '<button class="open-mini" type="button" data-action="' +
        (isDraft ? "open-microsequence-assist" : "play-microsequence") +
        '" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '" title="' +
        (isDraft ? "Editar rascunho" : "Começar microssequência") +
        '" aria-label="' +
        (isDraft ? "Editar rascunho" : "Começar microssequência") +
        '">' +
        (isDraft ? "&#9998;" : "&#9654;") +
        "</button>" +
        "</div>" +
        "</article>"
      );
    })
    .join("");

  return (
    '<section class="screen">' +
    renderTopbar({
      title: lesson.title || "Lição",
      canGoBack: true,
      editAction: "open-lesson-screen-actions",
      editTitle: "Ações",
      editIcon: "&#9776;"
    }) +
    '<main class="screen-content lesson-structure-screen">' +
    '<section class="context-band lesson-context-band">' +
    '<span class="context-chip lesson-context-chip lesson-context-chip-start">' +
    renderContextMetric("module", moduleValue.title || moduleValue.key, `Módulo: ${moduleValue.title || moduleValue.key}`) +
    "</span>" +
    '<span class="context-chip lesson-context-chip lesson-context-chip-end">' +
    renderContextMetric("progress", `${lessonCompleted}/${lessonTotal}`, `Progresso: ${lessonCompleted}/${lessonTotal}`) +
    '<span class="context-chip-separator" aria-hidden="true">·</span>' +
    renderContextMetric(
      "microsequence",
      String((lesson.microsequences || []).length),
      formatCount((lesson.microsequences || []).length, "microssequência", "microssequências")
    ) +
    "</span>" +
    "</section>" +
    '<section class="microsequence-list">' +
    microsequenceBlocks +
    "</section>" +
    "</main>" +
    "</section>"
  );
}

function renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode, editorSupport }) {
  const activeIndex = Number.isInteger(selection.cardIndex) ? selection.cardIndex : 0;
  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, cards.length - 1)));
  const activeCard = cards[safeIndex] || null;
  const lessonCardEntries = (lesson.microsequences || []).flatMap((lessonMicrosequence) => {
    if (!isReadyMicrosequence(lessonMicrosequence)) {
      return [];
    }
    return (lessonMicrosequence.cards || []).map((card, cardIndex) => ({
      microsequenceKey: lessonMicrosequence.key,
      microsequenceTitle: lessonMicrosequence.title || lessonMicrosequence.key,
      cardKey: card.key,
      card,
      cardIndex
    }));
  });
  const lessonStudyIndex = Math.max(0, lessonCardEntries.findIndex((entry) => entry.cardKey === selection.cardKey));
  const lessonStudyCount = lessonCardEntries.length;
  const prevDisabled = microsequenceMode === "play" ? lessonStudyIndex <= 0 : safeIndex <= 0;
  const nextDisabled = microsequenceMode === "play" ? lessonStudyIndex >= lessonStudyCount - 1 : safeIndex >= cards.length - 1;

  const bodyText = readCardText(activeCard);
  const lightDependencyTags = renderLightDependencyTags(editorSupport.dependencies || []);
  const microsequenceIndex = Math.max(0, (lesson.microsequences || []).findIndex((item) => item.key === microsequence.key));
  const cardProgressPercent = lessonStudyCount ? ((lessonStudyIndex + 1) / lessonStudyCount) * 100 : 0;

  const runtime = renderCardRuntimeBlocksWithDock(activeCard, {
    omitRepeatedHeading: true,
    fallbackText: bodyText,
    ...(editorSupport.cardRuntimeOptions || {})
  });
  const cardBody =
    '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
    '<div class="runtime-card-title">' +
    escapeHtml(activeCard ? activeCard.title || activeCard.key : "Sem card") +
    "</div>" +
    '<div class="card-sheet-content">' +
    runtime.bodyHtml +
    "</div>" +
    runtime.dockHtml +
    "</article>";

  const leadingPanel = lightDependencyTags
    ? '<div class="study-context-tags compact-study-tags">' + lightDependencyTags + "</div>"
    : "";

  return (
    '<section class="screen study-reader-screen">' +
    '<section class="study-reader-topbar">' +
    '<button class="icon-ghost" type="button" data-action="go-home" title="Voltar para a lição" aria-label="Voltar para a lição">&#8962;</button>' +
    '<button class="icon-ghost" type="button" data-action="prev-card" ' +
    (prevDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Card anterior" aria-label="Card anterior">&larr;</button>' +
    '<div class="study-reader-progress"><span style="width:' +
    String(cardProgressPercent) +
    '%"></span></div>' +
    '<button class="icon-ghost" type="button" data-action="open-microsequence-assist" title="Painel da microssequência" aria-label="Painel da microssequência">&#9998;</button>' +
    '<button class="icon-ghost" type="button" data-action="close-study" title="Fechar leitura" aria-label="Fechar leitura">&times;</button>' +
    "</section>" +
    '<main class="screen-content microsequence-screen">' +
    '<section class="study-reader-context">' +
    '<div class="study-reader-line">' +
    '<span class="study-reader-context-line">' +
    escapeHtml(course?.title || course?.key || "Curso") +
    "</span>" +
    '<span class="study-reader-count" aria-label="Card ' +
    String(lessonStudyIndex + 1) +
    " de " +
    String(lessonStudyCount) +
    '" title="Card ' +
    String(lessonStudyIndex + 1) +
    " de " +
    String(lessonStudyCount) +
    '">' +
    renderUiIcon("card", "study-reader-count-icon") +
    '<span class="study-reader-count-value">' +
    String(lessonStudyIndex + 1) +
    "/" +
    String(lessonStudyCount) +
    "</span></span></div></section>" +
    leadingPanel +
    '<section class="card-portrait editor-card-portrait' +
    " study-stage" +
    '">' +
    cardBody +
    "</section>" +
    "</main>" +
    '<section class="study-reader-footer"><div class="study-action-dock"><div class="study-action-stack"><div class="study-next-wrap">' +
    '<button class="icon-ghost study-comment-btn" type="button" data-action="open-card-comment" title="Anotação pessoal" aria-label="Anotação pessoal"><span class="comment-glyph" aria-hidden="true"></span></button>' +
    '<button class="open-mini study-continue-btn" type="button" data-action="next-card" ' +
    (nextDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Continuar" aria-label="Continuar">&#9654;</button>' +
    "</div></div></div></section>" +
    "</section>"
  );
}

function renderMicrosequenceWorkbenchScreen({
  title,
  backTitle,
  sendTitle,
  promptLabel,
  microsequence,
  cards,
  selection,
  editorSupport,
  hideCards = false
}) {
  const visibleCards = hideCards ? [] : cards;
  const activeIndex = Number.isInteger(selection.cardIndex) ? selection.cardIndex : 0;
  const safeIndex = visibleCards.length ? Math.max(0, Math.min(activeIndex, Math.max(0, visibleCards.length - 1))) : 0;
  const activeCard = visibleCards[safeIndex] || null;
  const hasCards = visibleCards.length > 0;
  const bodyText = readCardText(activeCard);
  const selectedDependencyTags = (editorSupport.dependencies || [])
    .filter((item) => editorSupport.selectedDependencyKeys.includes(item.key))
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
    .filter((item) => !editorSupport.selectedDependencyKeys.includes(item.key))
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
  const assistModeOptions = (editorSupport.assistModeOptions || [])
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.value) +
        '"' +
        (item.value === editorSupport.selectedAssistMode ? " selected" : "") +
        ">" +
        escapeHtml(item.label) +
        "</option>"
      );
    })
    .join("");
  const assistWarning = editorSupport.assistError
    ? '<section class="microsequence-assist-panel assist-status-panel is-warning">' +
      '<p class="muted assist-last-request">' +
      escapeHtml(editorSupport.assistError) +
      "</p></section>"
    : "";
  const assistStatus = editorSupport.lastRequest
    ? '<section class="microsequence-assist-panel assist-status-panel">' +
      '<p class="tiny muted">' +
      escapeHtml(editorSupport.lastRequest.title || "Último pedido") +
      "</p>" +
      '<p class="muted assist-last-request">' +
      escapeHtml(editorSupport.lastRequest.description || "") +
      "</p></section>"
    : "";
  const actionLabel = getAssistActionLabel(editorSupport.selectedAssistMode);
  const cardStrip = hasCards
    ? renderWorkbenchCardStrip(visibleCards, safeIndex)
    : '<div class="editor-step-empty">Os cards aparecerão aqui após o envio do prompt.</div>';
  const activeWorkbenchPane = editorSupport.activeWorkbenchPane === "edit" ? "edit" : "preview";
  const versionCount = Array.isArray(editorSupport.microsequenceVersions) ? editorSupport.microsequenceVersions.length : 0;
  const activeVersionIndex =
    versionCount > 0
      ? editorSupport.microsequenceVersions.findIndex((item) => item.id === editorSupport.activeMicrosequenceVersionId)
      : -1;
  const safeVersionIndex = versionCount > 0 ? Math.max(0, activeVersionIndex >= 0 ? activeVersionIndex : 0) : 0;
  const versionTabs = (editorSupport.microsequenceVersions || [])
    .map((item, index) => {
      return (
        '<button class="editor-version-tab' +
        (item.id === editorSupport.activeMicrosequenceVersionId ? " active" : "") +
        '" type="button" role="tab" aria-selected="' +
        (item.id === editorSupport.activeMicrosequenceVersionId ? "true" : "false") +
        '" title="Versão ' +
        String(index + 1) +
        '" aria-label="Versão ' +
        String(index + 1) +
        '" data-action="select-microsequence-version" data-version-id="' +
        escapeHtml(item.id) +
        '">' +
        '<span class="editor-version-tab-label">' +
        String(index + 1) +
        "</span>" +
        "</button>"
      );
    })
    .join("");
  const versionPrevControl =
    versionCount > 1 && safeVersionIndex > 0
      ? '<button class="editor-version-nav-arrow" type="button" data-action="editor-prev-version" title="Versão anterior" aria-label="Versão anterior">&larr;</button>'
      : '<span class="editor-version-nav-spacer" aria-hidden="true"></span>';
  const versionNextControl =
    versionCount > 1 && safeVersionIndex < versionCount - 1
      ? '<button class="editor-version-nav-arrow" type="button" data-action="editor-next-version" title="Próxima versão" aria-label="Próxima versão">&rarr;</button>'
      : '<span class="editor-version-nav-spacer" aria-hidden="true"></span>';
  const previewBody =
    '<div class="editor-card-stage-shell">' +
    '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet' +
    (!hasCards ? " runtime-card-sheet-empty" : "") +
    '">' +
    '<div class="runtime-card-title">' +
    escapeHtml(hasCards ? activeCard.title || activeCard.key : "Sem cards ainda") +
    "</div>" +
    '<div class="card-sheet-content' +
    (!hasCards ? " card-sheet-content-empty" : "") +
    '">' +
    (hasCards
      ? renderRuntimeBlocks(activeCard, bodyText)
      : '<p class="runtime-paragraph">Envie o pedido para montar uma microssequência.</p>') +
    "</div>" +
    "</article>" +
    '<p class="chip-muted editor-card-stage-count" aria-label="' +
    escapeHtml(hasCards ? "Card " + String(safeIndex + 1) + " de " + String(visibleCards.length) : "Nenhum card ainda") +
    '" title="' +
    escapeHtml(hasCards ? "Card " + String(safeIndex + 1) + " de " + String(visibleCards.length) : "Nenhum card ainda") +
    '">' +
    renderWorkbenchIcon("card", "workbench-icon editor-card-count-icon") +
    '<span class="editor-card-count-value">' +
    (hasCards ? String(safeIndex + 1) + "/" + String(visibleCards.length) : "0/0") +
    "</span>" +
    "</p>" +
    "</div>";
  const previewPane =
    '<section class="workbench-surface-pane workbench-preview-pane">' +
    '<div class="generator-preview-stage">' +
    previewBody +
    "</div>" +
    "</section>";
  const editPane =
    '<section class="microsequence-assist-panel microsequence-generator-panel workbench-editor-panel">' +
    '<div class="field compact-field">' +
    renderWorkbenchIconLabel("tags", "Tags") +
    dependencyPicker +
    '<div class="dependency-chip-row">' +
    selectedDependencyTags +
    "</div></div>" +
    '<div class="field compact-field">' +
    renderWorkbenchIconLabel("intent", "Intenção") +
    '<select data-field="assist-mode" aria-label="Intenção" title="Intenção"' +
    (editorSupport.assistModeLocked ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    assistModeOptions +
    "</select></div>" +
    '<div class="field compact-field workbench-prompt-field">' +
    renderWorkbenchIconLabel("prompt", promptLabel) +
    '<textarea data-field="assist-prompt" class="assist-prompt" aria-label="' +
    escapeHtml(promptLabel) +
    '" title="' +
    escapeHtml(promptLabel) +
    '">' +
    escapeHtml(editorSupport.promptText || "") +
    "</textarea></div>" +
    '<div class="assist-actions assist-actions-wide">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="clear-prompt" title="Limpar prompt" aria-label="Limpar prompt">&#8635;</button>' +
    '<select data-field="assist-model">' +
    modelOptions +
    "</select>" +
    '<button class="icon-ghost tiny-icon" type="button" data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA">&#128273;</button>' +
    '<button class="open-mini" type="button" data-action="apply-assist" title="' +
    escapeHtml(actionLabel || sendTitle) +
    '" aria-label="' +
    escapeHtml(actionLabel || sendTitle) +
    '"' +
    (editorSupport.isSubmitting ? " disabled aria-disabled=\"true\"" : "") +
    ">&#9654;</button>" +
    "</div>" +
    assistWarning +
    assistStatus +
    "</section>";

  return (
    '<section class="screen">' +
    renderTopbar({
      title,
      canGoBack: true,
      backTitle
    }) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="microsequence-assist-panel">' +
    '<div class="field compact-field">' +
    renderWorkbenchIconLabel("title", "Título da microssequência") +
    '<input data-field="assist-microsequence-title" type="text" aria-label="Título da microssequência" title="Título da microssequência" value="' +
    escapeHtml(microsequence?.title || "") +
    '">' +
    "</div></section>" +
    '<section class="editor-step-nav">' +
    '<div class="editor-step-nav-head editor-version-nav-head">' +
    versionPrevControl +
    '<p class="chip-muted editor-version-count" aria-label="' +
    escapeHtml(versionCount ? "Versão " + String(safeVersionIndex + 1) + " de " + String(versionCount) : "Sem versões ainda") +
    '" title="' +
    escapeHtml(versionCount ? "Versão " + String(safeVersionIndex + 1) + " de " + String(versionCount) : "Sem versões ainda") +
    '">' +
    renderWorkbenchIcon("versions", "workbench-icon editor-version-count-icon") +
    '<span class="editor-version-count-value">' +
    (versionCount ? String(safeVersionIndex + 1) + "/" + String(versionCount) : "0/0") +
    "</span>" +
    "</p>" +
    versionNextControl +
    "</div>" +
    '<div class="editor-version-strip-wrap">' +
    '<div class="editor-version-tabbar">' +
    '<div class="editor-version-strip" data-version-strip="true" role="tablist" aria-label="Versões da microssequência">' +
    versionTabs +
    "</div>" +
    "</div>" +
    '<div class="editor-version-controls">' +
    '<button class="icon-ghost tiny-icon version-delete-btn" type="button" data-action="delete-microsequence-version" title="Excluir versão atual" aria-label="Excluir versão atual"' +
    ((editorSupport.microsequenceVersions || []).length <= 1 ? ' disabled aria-disabled="true"' : "") +
    '>&#128465;</button>' +
    "</div>" +
    "</div>" +
    '<div class="editor-step-strip">' +
    cardStrip +
    "</div></section>" +
    '<section class="workbench-surface" data-workbench-pane="' +
    activeWorkbenchPane +
    '">' +
    renderWorkbenchPaneTabs(activeWorkbenchPane) +
    '<div class="workbench-surface-body">' +
    (activeWorkbenchPane === "preview" ? previewPane : editPane) +
    "</div>" +
    "</section>" +
    "</main></section>"
  );
}

function renderMicrosequenceAssistScreen({ lesson, microsequence, cards, selection, editorSupport }) {
  return renderMicrosequenceWorkbenchScreen({
    title: "Painel da microssequência",
    backTitle: "Voltar para a lição",
    sendTitle: "Enviar pedido",
    promptLabel: "Pedido",
    lesson,
    microsequence,
    cards,
    selection,
    editorSupport
  });
}

function renderDraftGeneratorScreen({ editorSupport }) {
  return (
    '<section class="screen">' +
    renderTopbar({
      title: "Gerar microssequência",
      canGoBack: true,
      backTitle: "Voltar para a fila"
    }) +
    '<main class="screen-content microsequence-generator-screen">' +
    renderAssistControlPanel({
      editorSupport,
      promptLabel: "Pedido",
      sendTitle: "Gerar microssequência",
      className: "draft-generator-control-panel"
    }) +
    "</main></section>"
  );
}

export function renderLessonScreen({ project, view, activeHomeTab, selection, course, moduleValue, lesson, microsequence, cards, microsequenceMode, editorSupport }) {
  if (view === "courses") {
    return renderHomeScreen({
      project,
      progress: editorSupport.progress,
      selection,
      featuredCourseKey: editorSupport.draftCourseKey,
      activeHomeTab,
      editorSupport
    });
  }

  if (view === "course") {
    if (course?.key === editorSupport.draftCourseKey) {
      return renderDraftCourseScreen({
        course,
        draftMicrosequences: editorSupport.draftMicrosequences
      });
    }

    return renderCourseScreen({ course, progress: editorSupport.progress });
  }

  if (view === "lesson") {
    return renderLessonScreenView({ course, lesson, moduleValue, selection, progress: editorSupport.progress });
  }

  if (view === "microsequence-assist") {
    return renderMicrosequenceAssistScreen({ lesson, microsequence, cards, selection, editorSupport });
  }

  if (view === "draft-generator") {
    return renderDraftGeneratorScreen({ lesson, microsequence, cards, selection, editorSupport });
  }

  return renderMicrosequenceScreen({ course, lesson, microsequence, cards, selection, microsequenceMode, editorSupport });
}
