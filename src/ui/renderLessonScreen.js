import { renderInlineCardEditor } from "./renderCardEditorOverlay.js";
import { renderHomeScreen } from "./renderHomeScreen.js";
import { normalizeCardBlocks } from "../core/cardBlockModel.js";

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

function getLessonDescription(lesson) {
  const explicitDescription = normalizeInlineText(lesson.description);
  if (explicitDescription) {
    return truncateText(explicitDescription);
  }

  for (const microsequence of lesson.microsequences || []) {
    const objective = normalizeInlineText(microsequence.objective);
    if (objective) {
      return truncateText(objective);
    }
  }

  for (const microsequence of lesson.microsequences || []) {
    for (const card of microsequence.cards || []) {
      const text =
        card && card.data && typeof card.data.text === "string" ? normalizeInlineText(card.data.text) : "";
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

function normalizeBlocks(card) {
  return normalizeCardBlocks({
    title: card?.title || "",
    text: card?.data?.text || "",
    blocks: card?.data?.blocks || []
  });
}

function renderMarkdownInline(text) {
  return escapeHtml(text || "")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function renderMarkdownParagraph(text) {
  return renderMarkdownInline(text);
}

function splitLabelToItems(label) {
  return String(label || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function renderRuntimeBlockList(blocks, fallbackText) {
  if (!blocks.length) {
    return '<p class="runtime-paragraph">' + escapeHtml(fallbackText || "Sem conteúdo.") + "</p>";
  }

  const cardTitle = "";
  const normalizedBlocks =
    blocks.length &&
    blocks[0] &&
    blocks[0].kind === "heading" &&
    cardTitle &&
    normalizeInlineText(blocks[0].label).toLowerCase() === cardTitle.toLowerCase()
      ? blocks.slice(1)
      : blocks;

  return normalizedBlocks
    .map((block) => {
      const label = block.label || "";
      const kind = escapeHtml(block.kind || "paragraph");

      if (block.kind === "heading") {
        return '<h3 class="runtime-block runtime-heading">' + renderMarkdownInline(label) + "</h3>";
      }

      if (block.kind === "paragraph") {
        return '<p class="runtime-block runtime-paragraph">' + renderMarkdownParagraph(label) + "</p>";
      }

      if (block.kind === "list") {
        const items = String(block.label || "")
          .split(/\n|[;,]/)
          .map((item) => item.trim())
          .filter(Boolean);
        const listItems = (items.length ? items : [block.label || "Ponto de apoio"])
          .map((item) => '<li>' + renderMarkdownInline(item) + "</li>")
          .join("");
        return '<div class="runtime-block runtime-list-block"><ul class="runtime-list">' + listItems + "</ul></div>";
      }

      if (block.kind === "choice") {
        return (
          '<div class="runtime-block runtime-choice-block">' +
          '<div class="runtime-choice-label">Pergunta-guia</div>' +
          '<div class="runtime-choice-body">' +
          renderMarkdownParagraph(label) +
          "</div></div>"
        );
      }

      if (block.kind === "table") {
        return (
          '<div class="runtime-block runtime-table-block">' +
          '<div class="runtime-table-title">' +
          renderMarkdownInline(label) +
          "</div>" +
          '<div class="runtime-table-wrap"><table class="runtime-table">' +
          "<thead><tr><th>Parte</th><th>Foco</th></tr></thead>" +
          "<tbody>" +
          "<tr><td>Base</td><td>" + renderMarkdownInline(label) + "</td></tr>" +
          "<tr><td>Uso</td><td>Aplicar na leitura do card atual</td></tr>" +
          "</tbody></table></div></div>"
        );
      }

      if (block.kind === "flowchart") {
        const items = splitLabelToItems(block.label);
        const flowItems = (items.length ? items : [block.label || "Etapa central"])
          .map((item) => '<span class="runtime-flow-node">' + renderMarkdownInline(item) + "</span>")
          .join('<span class="runtime-flow-arrow">→</span>');
        return '<div class="runtime-block runtime-flow-block">' + flowItems + "</div>";
      }

      if (block.kind === "popup") {
        return (
          '<details class="runtime-block runtime-popup-block" open>' +
          '<summary class="runtime-popup-summary">' +
          renderMarkdownInline(block.label || "Botão") +
          "</summary>" +
          '<div class="runtime-popup-body">' +
          renderRuntimeBlockList(Array.isArray(block.children) ? block.children : [], "") +
          "</div></details>"
        );
      }

      return '<p class="runtime-block runtime-paragraph" data-kind="' + kind + '">' + renderMarkdownParagraph(label) + "</p>";
    })
    .join("");
}

function renderRuntimeBlocks(card, fallbackText) {
  const blocks = normalizeBlocks(card);
  const cardTitle = normalizeInlineText(card && (card.title || card.key));
  const normalizedBlocks =
    blocks.length &&
    blocks[0] &&
    blocks[0].kind === "heading" &&
    normalizeInlineText(blocks[0].label).toLowerCase() === cardTitle.toLowerCase()
      ? blocks.slice(1)
      : blocks;

  return renderRuntimeBlockList(normalizedBlocks, fallbackText);
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
              parts: [String((lesson.microsequences || []).length) + " microssequências"]
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
          parts: [String((moduleValue.lessons || []).length) + " lições"]
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
          parts: [String(cardCount) + " cards"]
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
    "Mod.: " + escapeHtml(moduleValue.title || moduleValue.key) +
    "</span>" +
    '<span class="context-chip lesson-context-chip lesson-context-chip-end">' +
    "Progr.: " +
    String(lessonCompleted) +
    "/" +
    String(lessonTotal) +
    " · " +
    String((lesson.microsequences || []).length) +
    " micr." +
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

  const bodyText =
    activeCard && activeCard.data && typeof activeCard.data.text === "string" ? activeCard.data.text : "";
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

function renderMicrosequenceAssistScreen({ lesson, microsequence, cards, selection, editorSupport }) {
  const activeIndex = Number.isInteger(selection.cardIndex) ? selection.cardIndex : 0;
  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, cards.length - 1)));
  const selectedDependencyTags = (editorSupport.dependencies || [])
    .filter((item) => editorSupport.selectedDependencyKeys.includes(item.key))
    .map((item) => {
      return (
        '<button class="dependency-tag active" type="button" data-action="remove-dependency" data-dependency-key="' +
        escapeHtml(item.key) +
        '">' +
        '<span class="dependency-tag-label">' +
        escapeHtml(item.title || item.key) +
        "</span>" +
        '<span class="dependency-tag-remove">&times;</span></button>'
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
  const modeOptions = (editorSupport.modeOptions || [])
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.value) +
        '"' +
        (item.value === editorSupport.selectedMode ? " selected" : "") +
        ">" +
        escapeHtml(item.label) +
        "</option>"
      );
    })
    .join("");
  const versionOptions = (editorSupport.versionOptions || [])
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.key) +
        '"' +
        (item.key === editorSupport.selectedVersionKey ? " selected" : "") +
        ">" +
        escapeHtml(item.label) +
        "</option>"
      );
    })
    .join("");
  const activeCard = cards[safeIndex] || null;
  const assistRequest = editorSupport.lastRequest
    ? '<section class="microsequence-assist-panel">' +
      '<p class="tiny muted">' +
      escapeHtml(editorSupport.lastRequest.title || "Último pedido") +
      "</p>" +
      '<p class="muted assist-last-request">' +
      escapeHtml(editorSupport.lastRequest.description || "") +
      "</p></section>"
    : "";

  return (
    '<section class="screen">' +
    renderTopbar({
      title: "Painel da microssequência",
      canGoBack: true,
      backTitle: "Voltar para a lição",
      editAction: "switch-microsequence-edit",
      editTitle: "Abrir editor de cards"
    }) +
    '<main class="screen-content microsequence-assist-screen">' +
    '<section class="context-band context-band-tight">' +
    '<span class="context-chip">Lição: ' +
    escapeHtml(lesson.title || lesson.key) +
    "</span>" +
    '<span class="context-chip">API · ' +
    escapeHtml(microsequence.title || microsequence.key) +
    "</span></section>" +
    '<section class="microsequence-assist-panel">' +
    '<div class="field compact-field">' +
    "<label>Título da microssequência</label>" +
    '<input data-field="assist-microsequence-title" type="text" value="' +
    escapeHtml(microsequence.title || "") +
    '">' +
    "</div>" +
    '<div class="field compact-field">' +
    "<label>Objetivo</label>" +
    '<textarea data-field="assist-microsequence-objective" class="assist-objective-textarea">' +
    escapeHtml(microsequence.objective || "") +
    "</textarea></div></section>" +
    '<section class="editor-step-nav">' +
    '<div class="editor-step-nav-head">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="editor-prev-card" ' +
    (safeIndex <= 0 ? 'disabled aria-disabled="true"' : "") +
    ' title="Card anterior" aria-label="Card anterior">&larr;</button>' +
    '<p class="chip-muted">Card ' +
    String(safeIndex + 1) +
    " de " +
    String(cards.length) +
    "</p>" +
    '<button class="icon-ghost tiny-icon" type="button" data-action="editor-next-card" ' +
    (safeIndex >= cards.length - 1 ? 'disabled aria-disabled="true"' : "") +
    ' title="Próximo card" aria-label="Próximo card">&rarr;</button>' +
    "</div>" +
    '<div class="editor-step-strip">' +
    renderEditorCardStrip(cards, safeIndex) +
    "</div></section>" +
    '<section class="microsequence-assist-panel">' +
    '<p class="tiny muted">Comentário do card para a API</p>' +
    '<p class="muted assist-card-caption">' +
    escapeHtml(activeCard ? activeCard.title || activeCard.key : "Sem card selecionado") +
    "</p>" +
    '<div class="field compact-field">' +
    '<textarea data-field="assist-card-comment" class="assist-card-comment-textarea">' +
    escapeHtml(editorSupport.assistCardComment || "") +
    "</textarea></div></section>" +
    '<section class="microsequence-assist-panel">' +
    '<div class="field compact-field">' +
    "<label>Ação</label>" +
    '<select data-field="assist-mode">' +
    modeOptions +
    "</select></div>" +
    '<div class="assist-grid version-grid">' +
    '<div class="field compact-field">' +
    "<label>Retomar</label>" +
    '<select data-field="assist-version">' +
    versionOptions +
    "</select></div>" +
    '<button class="icon-ghost version-restore-btn" type="button" data-action="restore-version" title="Retomar versão" aria-label="Retomar versão">&#8634;</button>' +
    "</div>" +
    '<div class="field compact-field">' +
    "<label>Tags</label>" +
    dependencyPicker +
    '<div class="dependency-strip">' +
    selectedDependencyTags +
    "</div></div>" +
    '<div class="field compact-field">' +
    "<label>Pedido para a API</label>" +
    '<textarea data-field="assist-prompt" class="assist-prompt">' +
    escapeHtml(editorSupport.promptText || "") +
    "</textarea></div>" +
    '<div class="assist-actions">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="clear-prompt" title="Limpar prompt" aria-label="Limpar prompt">&#8635;</button>' +
    '<button class="primary-btn compact-btn" type="button" data-action="apply-assist">Enviar</button>' +
    "</div></section>" +
    assistRequest +
    "</main></section>"
  );
}

export function renderLessonScreen({ project, view, selection, course, moduleValue, lesson, microsequence, cards, microsequenceMode, editorSupport }) {
  if (view === "courses") {
    return renderHomeScreen({ project, progress: editorSupport.progress });
  }

  if (view === "course") {
    return renderCourseScreen({ course, progress: editorSupport.progress });
  }

  if (view === "lesson") {
    return renderLessonScreenView({ lesson, moduleValue, selection, progress: editorSupport.progress });
  }

  if (view === "microsequence-assist") {
    return renderMicrosequenceAssistScreen({ lesson, microsequence, cards, selection, editorSupport });
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
