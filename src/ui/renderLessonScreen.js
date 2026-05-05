import { renderInlineCardEditor } from "./renderCardEditorOverlay.js";
import { renderHomeScreen } from "./renderHomeScreen.js";
import { readCardText } from "../core/cardRuntime.js";
import { renderCardRuntimeBlocks } from "../render/renderCardRuntime.js";

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
  return (lesson.microsequences || []).reduce((total, microsequence) => total + (microsequence.cards || []).length, 0);
}

function countCardsInMicrosequence(microsequence) {
  return (microsequence.cards || []).length;
}

function countCompletedCardsInLesson(lesson, progress) {
  const lessons = progress && progress.lessons ? progress.lessons : {};
  const entry = lessons[lesson.key];
  return entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys.length : 0;
}

function countCompletedCardsInMicrosequence(lesson, microsequence, progress) {
  const lessons = progress && progress.lessons ? progress.lessons : {};
  const entry = lessons[lesson.key];
  const completedCardKeys = entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys : [];
  const cardKeys = new Set((microsequence.cards || []).map((card) => card.key));
  return completedCardKeys.reduce((total, key) => total + (cardKeys.has(key) ? 1 : 0), 0);
}

function countCardsInModule(moduleValue) {
  return (moduleValue.lessons || []).reduce((total, lesson) => total + countCardsInLesson(lesson), 0);
}

function countCompletedCardsInModule(moduleValue, progress) {
  return (moduleValue.lessons || []).reduce((total, lesson) => total + countCompletedCardsInLesson(lesson, progress), 0);
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
      return (
        '<button class="mini-card thumb' +
        (index === activeIndex ? " active" : "") +
        '" type="button" data-action="open-card" data-card-index="' +
        String(index) +
        '">' +
        '<div class="mini-card-kicker">Card ' +
        String(index + 1) +
        "</div>" +
        '<div class="mini-card-title">' +
        escapeHtml(card.title || card.key) +
        "</div>" +
        "</button>"
      );
    })
    .join("");
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

function renderRuntimeBlocks(card, fallbackText) {
  return renderCardRuntimeBlocks(card, {
    omitRepeatedHeading: true,
    fallbackText
  });
}

function renderMetaLine({ completed, total, parts = [] }) {
  const normalizedParts = parts.filter(Boolean);
  return (
    '<p class="muted tiny progress-meta">Progresso: ' +
    String(completed) +
    "/" +
    String(total) +
    (normalizedParts.length ? " · " + normalizedParts.join(" · ") : "") +
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
          parts: [formatCount(cardCount, "card", "cards")]
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
      editAction: "edit-course",
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
    '<button class="icon-ghost" type="button" data-action="edit-lesson" data-module-key="' +
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
      const moduleCompleted = countCompletedCardsInModule(moduleValue, progress);
      const moduleTotal = countCardsInModule(moduleValue);
      const modulePercent = percent(moduleTotal, moduleCompleted);
      const lessons = (moduleValue.lessons || [])
        .map((lesson) => {
          const lessonCompleted = countCompletedCardsInLesson(lesson, progress);
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
              parts: [formatCount((lesson.microsequences || []).length, "microssequência", "microssequências")]
            }) +
            "</div>" +
            '<div class="lesson-actions">' +
            '<button class="icon-ghost" type="button" data-action="edit-lesson" data-module-key="' +
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
        '<button class="icon-ghost" type="button" data-action="edit-module" data-module-key="' +
        escapeHtml(moduleValue.key) +
        '" title="Ações do módulo" aria-label="Ações do módulo">&ctdot;</button>' +
        "</header>" +
        renderMetaLine({
          completed: moduleCompleted,
          total: moduleTotal,
          parts: [formatCount((moduleValue.lessons || []).length, "lição", "lições")]
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
      editAction: "edit-course",
      editTitle: "Ações",
      editIcon: "&#9776;"
    }) +
    '<main class="screen-content course-screen">' +
    modules +
    "</main>" +
    "</section>"
  );
}

function renderLessonScreenView({ lesson, moduleValue, progress }) {
  const lessonCompleted = countCompletedCardsInLesson(lesson, progress);
  const lessonTotal = countCardsInLesson(lesson);
  const microsequenceBlocks = (lesson.microsequences || [])
    .map((microsequence) => {
      const cardCount = countCardsInMicrosequence(microsequence);
      const microsequenceCompleted = countCompletedCardsInMicrosequence(lesson, microsequence, progress);
      const microsequencePercent = percent(cardCount, microsequenceCompleted);
      const didacticTags = renderDidacticTags(moduleValue, lesson.key, microsequence);

      return (
        '<article class="clean-card microsequence-card progress-card">' +
        '<div class="card-progress-fill" style="width:' +
        String(microsequencePercent) +
        '%"></div>' +
        '<div class="microsequence-copy">' +
        '<button class="row-main microsequence-main-button" type="button" data-action="play-microsequence" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '">' +
        '<span class="microsequence-title">' +
        escapeHtml(microsequence.title || microsequence.key) +
        "</span>" +
        "</button>" +
        didacticTags +
        renderMetaLine({
          completed: microsequenceCompleted,
          total: cardCount,
          parts: [formatCount(cardCount, "card", "cards")]
        }) +
        "</div>" +
        '<div class="microsequence-actions">' +
        '<button class="icon-ghost tiny-icon" type="button" data-action="open-microsequence" data-microsequence-key="' +
        escapeHtml(microsequence.key) +
        '" title="Ações da microssequência" aria-label="Ações da microssequência">&#8943;</button>' +
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
      title: lesson.title || "Lição",
      canGoBack: true,
      editAction: "edit-lesson",
      editTitle: "Ações da lição",
      editIcon: "&#8943;"
    }) +
    '<main class="screen-content lesson-structure-screen">' +
    '<section class="context-band lesson-context-band">' +
    '<span class="context-chip lesson-context-chip lesson-context-chip-start">' +
    "Mód.: " + escapeHtml(moduleValue.title || moduleValue.key) +
    "</span>" +
    '<span class="context-chip lesson-context-chip lesson-context-chip-end">' +
    "Progr.: " +
    String(lessonCompleted) +
    "/" +
    String(lessonTotal) +
    " · " +
    formatCount((lesson.microsequences || []).length, "microssequência", "microssequências") +
    "</span>" +
    "</section>" +
    '<section class="microsequence-list">' +
    microsequenceBlocks +
    "</section>" +
    "</main>" +
    "</section>"
  );
}

function renderMicrosequenceScreen({ lesson, microsequence, cards, selection, microsequenceMode, editorSupport }) {
  const activeIndex = Number.isInteger(selection.cardIndex) ? selection.cardIndex : 0;
  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, cards.length - 1)));
  const activeCard = cards[safeIndex] || null;
  const lessonCardEntries = (lesson.microsequences || []).flatMap((lessonMicrosequence) =>
    (lessonMicrosequence.cards || []).map((card, cardIndex) => ({
      microsequenceKey: lessonMicrosequence.key,
      microsequenceTitle: lessonMicrosequence.title || lessonMicrosequence.key,
      cardKey: card.key,
      card,
      cardIndex
    }))
  );
  const lessonStudyIndex = Math.max(0, lessonCardEntries.findIndex((entry) => entry.cardKey === selection.cardKey));
  const lessonStudyCount = lessonCardEntries.length;
  const prevDisabled = microsequenceMode === "play" ? lessonStudyIndex <= 0 : safeIndex <= 0;
  const nextDisabled = microsequenceMode === "play" ? lessonStudyIndex >= lessonStudyCount - 1 : safeIndex >= cards.length - 1;
  const strip = renderEditorCardStrip(cards, safeIndex);

  const bodyText = readCardText(activeCard);
  const lightDependencyTags = renderLightDependencyTags(editorSupport.dependencies || []);
  const microsequenceIndex = Math.max(0, (lesson.microsequences || []).findIndex((item) => item.key === microsequence.key));
  const cardProgressPercent = lessonStudyCount ? ((lessonStudyIndex + 1) / lessonStudyCount) * 100 : 0;

  const cardBody =
    '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
    '<div class="runtime-card-title">' +
    escapeHtml(activeCard ? activeCard.title || activeCard.key : "Sem card") +
    "</div>" +
    '<div class="card-sheet-content">' +
    renderRuntimeBlocks(activeCard, bodyText) +
    "</div>" +
    "</article>";

  const leadingPanel =
    lightDependencyTags
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
    escapeHtml(lesson.title || lesson.key) +
    " - " +
    escapeHtml(microsequence.title || microsequence.key) +
    "</span>" +
    '<span class="study-reader-count">Card ' +
    String(lessonStudyIndex + 1) +
    " de " +
    String(lessonStudyCount) +
    "</span></div></section>" +
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
      '<select data-field="assist-dependency-picker">' +
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
    ? '<section class="microsequence-assist-panel">' +
      '<p class="tiny muted">' +
      escapeHtml(editorSupport.lastRequest.title || "Último pedido") +
      "</p>" +
      '<p class="muted assist-last-request">' +
      escapeHtml(editorSupport.lastRequest.description || "") +
      "</p></section>"
    : "";
  const actionLabel = getAssistActionLabel(editorSupport.selectedAssistMode);
  const cardStrip = hasCards
    ? renderEditorCardStrip(visibleCards, safeIndex)
    : '<div class="editor-step-empty">Os cards aparecerão aqui após o envio do prompt.</div>';
  const previewBody = hasCards
    ? '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
      '<div class="runtime-card-title">' +
      escapeHtml(activeCard ? activeCard.title || activeCard.key : "Sem card") +
      "</div>" +
      '<div class="card-sheet-content">' +
      renderRuntimeBlocks(activeCard, bodyText) +
      "</div>" +
      "</article>"
    : '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet runtime-card-sheet-empty">' +
      '<div class="runtime-card-title">Sem cards ainda</div>' +
      '<div class="card-sheet-content card-sheet-content-empty">' +
      '<p class="runtime-paragraph">Envie o pedido à LLM para materializar uma microssequência.</p>' +
      "</div>" +
      "</article>";

  return (
    '<section class="screen">' +
    renderTopbar({
      title,
      canGoBack: true,
      backTitle,
      editAction: "edit-microsequence",
      editTitle: "Ações da microssequência",
      editIcon: "&#8943;"
    }) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="microsequence-assist-panel">' +
    '<div class="field compact-field">' +
    "<label>Título da microssequência</label>" +
    '<input data-field="assist-microsequence-title" type="text" value="' +
    escapeHtml(microsequence?.title || "") +
    '">' +
    "</div>" +
    '<div class="assist-toolbar">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="open-version-history" title="Versões do card" aria-label="Versões do card"' +
    (hasCards ? "" : ' disabled aria-disabled="true"') +
    '>&#8635;</button>' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="switch-microsequence-edit" title="Abrir editor de cards" aria-label="Abrir editor de cards"' +
    (hasCards ? "" : ' disabled aria-disabled="true"') +
    '>&#9998;</button>' +
    "</div>" +
    "</section>" +
    '<section class="editor-step-nav">' +
    '<div class="editor-step-nav-head">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="editor-prev-card" ' +
    (!hasCards || safeIndex <= 0 ? 'disabled aria-disabled="true"' : "") +
    ' title="Card anterior" aria-label="Card anterior">&larr;</button>' +
    '<p class="chip-muted">' +
    (hasCards ? "Card " + String(safeIndex + 1) + " de " + String(visibleCards.length) : "Nenhum card ainda") +
    "</p>" +
    '<button class="icon-ghost tiny-icon" type="button" data-action="editor-next-card" ' +
    (!hasCards || safeIndex >= visibleCards.length - 1 ? 'disabled aria-disabled="true"' : "") +
    ' title="Próximo card" aria-label="Próximo card">&rarr;</button>' +
    "</div>" +
    '<div class="editor-step-strip">' +
    cardStrip +
    "</div></section>" +
    '<section class="card-portrait editor-card-portrait study-stage generator-preview-stage">' +
    previewBody +
    "</section>" +
    '<section class="microsequence-assist-panel microsequence-generator-panel">' +
    '<div class="field compact-field">' +
    "<label>Tags</label>" +
    dependencyPicker +
    '<div class="dependency-chip-row">' +
    selectedDependencyTags +
    "</div></div>" +
    '<div class="field compact-field">' +
    "<label>Intenção do usuário</label>" +
    '<select data-field="assist-mode"' +
    (editorSupport.assistModeLocked ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    assistModeOptions +
    "</select></div>" +
    '<div class="field compact-field">' +
    "<label>" +
    escapeHtml(promptLabel) +
    "</label>" +
    '<textarea data-field="assist-prompt" class="assist-prompt">' +
    escapeHtml(editorSupport.promptText || "") +
    "</textarea></div>" +
    '<div class="assist-actions assist-actions-wide">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="clear-prompt" title="Limpar prompt" aria-label="Limpar prompt">&#8635;</button>' +
    '<select data-field="assist-model">' +
    modelOptions +
    "</select>" +
    '<button class="icon-ghost tiny-icon" type="button" data-action="open-assist-config" title="Configurar API" aria-label="Configurar API">&#128273;</button>' +
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
    "</section>" +
    "</main></section>"
  );
}

function renderMicrosequenceAssistScreen({ lesson, microsequence, cards, selection, editorSupport }) {
  return renderMicrosequenceWorkbenchScreen({
    title: "Painel da microssequência",
    backTitle: "Voltar para a lição",
    sendTitle: "Enviar pedido",
    promptLabel: "Pedido de revisão",
    lesson,
    microsequence,
    cards,
    selection,
    editorSupport
  });
}

function renderDraftGeneratorScreen({ lesson, microsequence, cards, selection, editorSupport }) {
  return renderMicrosequenceWorkbenchScreen({
    title: "Gerar microssequência",
    backTitle: "Voltar para a fila",
    sendTitle: "Gerar microssequência",
    promptLabel: "Pedido",
    lesson,
    microsequence,
    cards,
    selection,
    editorSupport,
    hideCards: editorSupport.currentMicrosequenceIsPlaceholder
  });
}

export function renderLessonScreen({ project, view, selection, course, moduleValue, lesson, microsequence, cards, microsequenceMode, editorSupport }) {
  if (view === "courses") {
    return renderHomeScreen({
      project,
      progress: editorSupport.progress,
      selection,
      featuredCourseKey: editorSupport.draftCourseKey
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
    return renderLessonScreenView({ lesson, moduleValue, selection, progress: editorSupport.progress });
  }

  if (view === "microsequence-assist") {
    return renderMicrosequenceAssistScreen({ lesson, microsequence, cards, selection, editorSupport });
  }

  if (view === "draft-generator") {
    return renderDraftGeneratorScreen({ lesson, microsequence, cards, selection, editorSupport });
  }

  if (view === "card-editor") {
    return (
      '<section class="screen">' +
      renderTopbar({
        title: "Editor de card",
        canGoBack: true,
        backTitle: "Voltar para o painel da microssequência",
        editAction: "save-inline-card",
        editTitle: "Salvar card",
        editIcon: "&#10003;"
      }) +
      '<main class="screen-content card-editor-screen">' +
      '<section class="context-band context-band-tight">' +
      '<span class="context-chip">Lição: ' +
      escapeHtml(lesson.title || lesson.key) +
      "</span>" +
      '<span class="context-chip">Microsseq.: ' +
      escapeHtml(microsequence.title || microsequence.key) +
      "</span></section>" +
      renderInlineCardEditor({ cards, card: cards[Math.max(0, Math.min(selection.cardIndex || 0, Math.max(0, cards.length - 1)))] || null, selection }) +
      "</main>" +
      "</section>"
    );
  }

  return renderMicrosequenceScreen({ lesson, microsequence, cards, selection, microsequenceMode, editorSupport });
}
