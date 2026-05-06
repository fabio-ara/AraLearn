import {
  collectAssistDependencies,
  findCard,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  getFirstPath
} from "./projectNavigation.js";
import { readAssistConfigStorage, writeAssistConfigStorage } from "./assistConfigStorage.js";
import { createStarterContractCard, sanitizeContractCard } from "../contract/contractCard.js";
import { runGeminiAssist } from "../llm/geminiAssist.js";

const ASSIST_MODEL_OPTIONS = [
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash · até 2026-06-01" }
];

function fail(message) {
  throw new Error(message);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseLines(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRows(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean));
}

function parseFlow(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex < 0) {
        return { process: line };
      }
      const kind = line.slice(0, separatorIndex).trim() || "process";
      const label = line.slice(separatorIndex + 1).trim();
      return { [kind]: label };
    });
}

function serializeRows(rows) {
  return (rows || []).map((row) => row.join(" | ")).join("\n");
}

function serializeFlow(flow) {
  return (flow || [])
    .map((step) => {
      const [kind] = Object.keys(step);
      return `${kind}: ${step[kind]}`;
    })
    .join("\n");
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) => total + (microsequence.cards || []).length, 0);
}

function getCardDraft(card) {
  if (!card) {
    const starter = createStarterContractCard("text");
    return {
      type: starter.type,
      title: starter.title || "",
      text: starter.text || "",
      ask: "",
      answerText: "",
      wrongText: "",
      language: "",
      code: "",
      columnsText: "",
      rowsText: "",
      flowText: "",
      src: "",
      alt: ""
    };
  }

  return {
    type: card.type,
    title: card.title || "",
    text: card.text || "",
    ask: card.ask || "",
    answerText: Array.isArray(card.answer) ? card.answer.join("\n") : "",
    wrongText: Array.isArray(card.wrong) ? card.wrong.join("\n") : "",
    language: card.language || "",
    code: card.code || "",
    columnsText: Array.isArray(card.columns) ? card.columns.join(", ") : "",
    rowsText: serializeRows(card.rows),
    flowText: serializeFlow(card.flow),
    src: card.src || "",
    alt: card.alt || ""
  };
}

function buildCardInputFromDraft(draft, existingKey) {
  const base = {
    ...(existingKey ? { key: existingKey } : {}),
    type: draft.type,
    ...(normalizeInlineText(draft.title) ? { title: normalizeInlineText(draft.title) } : {})
  };

  if (draft.type === "text") {
    return sanitizeContractCard({
      ...base,
      text: draft.text
    });
  }
  if (draft.type === "choice") {
    return sanitizeContractCard({
      ...base,
      ask: draft.ask,
      answer: parseLines(draft.answerText),
      wrong: parseLines(draft.wrongText)
    });
  }
  if (draft.type === "complete") {
    return sanitizeContractCard({
      ...base,
      text: draft.text,
      answer: parseLines(draft.answerText),
      wrong: parseLines(draft.wrongText)
    });
  }
  if (draft.type === "editor") {
    return sanitizeContractCard({
      ...base,
      language: draft.language,
      code: draft.code
    });
  }
  if (draft.type === "table") {
    return sanitizeContractCard({
      ...base,
      columns: parseLines(draft.columnsText),
      rows: parseRows(draft.rowsText)
    });
  }
  if (draft.type === "flow") {
    return sanitizeContractCard({
      ...base,
      flow: parseFlow(draft.flowText)
    });
  }
  if (draft.type === "image") {
    return sanitizeContractCard({
      ...base,
      src: draft.src,
      alt: draft.alt
    });
  }

  fail(`Tipo de card desconhecido: "${draft.type}".`);
}

function renderCardPreview(card) {
  if (!card) {
    return '<div class="clean-card"><p class="muted tiny">Selecione um card.</p></div>';
  }

  const title = card.title || "Card";
  if (card.type === "text") {
    return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + '</h3><p>' + escapeHtml(card.text) + "</p></article>";
  }
  if (card.type === "choice") {
    const options = [...(card.answer || []), ...(card.wrong || [])]
      .map((item) => '<li>' + escapeHtml(item) + "</li>")
      .join("");
    return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + '</h3><p>' + escapeHtml(card.ask) + "</p><ul>" + options + "</ul></article>";
  }
  if (card.type === "complete") {
    return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + '</h3><p>' + escapeHtml(card.text) + "</p></article>";
  }
  if (card.type === "editor") {
    return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + '</h3><pre><code>' + escapeHtml(card.code) + "</code></pre></article>";
  }
  if (card.type === "table") {
    const head = (card.columns || []).map((item) => "<th>" + escapeHtml(item) + "</th>").join("");
    const rows = (card.rows || []).map((row) => "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>").join("");
    return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + '</h3><table><thead><tr>' + head + "</tr></thead><tbody>" + rows + "</tbody></table></article>";
  }
  if (card.type === "flow") {
    const steps = (card.flow || []).map((step) => {
      const [kind] = Object.keys(step);
      return "<li>" + escapeHtml(`${kind}: ${step[kind]}`) + "</li>";
    }).join("");
    return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + '</h3><ol>' + steps + "</ol></article>";
  }
  if (card.type === "image") {
    return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + '</h3><p class="muted tiny">' + escapeHtml(card.src) + "</p></article>";
  }
  return '<article class="clean-card"><h3 class="card-title">' + escapeHtml(title) + "</h3></article>";
}

function renderCardFields(draft) {
  const common = (
    '<div class="field compact-field">' +
    "<label>Título do card</label>" +
    '<input data-field="card-title" type="text" value="' + escapeHtml(draft.title) + '">' +
    "</div>"
  );

  if (draft.type === "text") {
    return common + '<div class="field compact-field"><label>Texto</label><textarea data-field="card-text">' + escapeHtml(draft.text) + "</textarea></div>";
  }
  if (draft.type === "choice") {
    return common +
      '<div class="field compact-field"><label>Pergunta</label><textarea data-field="card-ask">' + escapeHtml(draft.ask) + "</textarea></div>" +
      '<div class="field compact-field"><label>Resposta(s)</label><textarea data-field="card-answer">' + escapeHtml(draft.answerText) + "</textarea></div>" +
      '<div class="field compact-field"><label>Distratores</label><textarea data-field="card-wrong">' + escapeHtml(draft.wrongText) + "</textarea></div>";
  }
  if (draft.type === "complete") {
    return common +
      '<div class="field compact-field"><label>Texto com lacuna</label><textarea data-field="card-text">' + escapeHtml(draft.text) + "</textarea></div>" +
      '<div class="field compact-field"><label>Resposta(s)</label><textarea data-field="card-answer">' + escapeHtml(draft.answerText) + "</textarea></div>" +
      '<div class="field compact-field"><label>Distratores</label><textarea data-field="card-wrong">' + escapeHtml(draft.wrongText) + "</textarea></div>";
  }
  if (draft.type === "editor") {
    return common +
      '<div class="field compact-field"><label>Linguagem</label><input data-field="card-language" type="text" value="' + escapeHtml(draft.language) + '"></div>' +
      '<div class="field compact-field"><label>Código</label><textarea data-field="card-code">' + escapeHtml(draft.code) + "</textarea></div>";
  }
  if (draft.type === "table") {
    return common +
      '<div class="field compact-field"><label>Colunas</label><input data-field="card-columns" type="text" value="' + escapeHtml(draft.columnsText) + '"></div>' +
      '<div class="field compact-field"><label>Linhas</label><textarea data-field="card-rows">' + escapeHtml(draft.rowsText) + "</textarea></div>";
  }
  if (draft.type === "flow") {
    return common + '<div class="field compact-field"><label>Fluxo</label><textarea data-field="card-flow">' + escapeHtml(draft.flowText) + "</textarea></div>";
  }
  if (draft.type === "image") {
    return common +
      '<div class="field compact-field"><label>Origem</label><input data-field="card-src" type="text" value="' + escapeHtml(draft.src) + '"></div>' +
      '<div class="field compact-field"><label>Alt</label><input data-field="card-alt" type="text" value="' + escapeHtml(draft.alt) + '"></div>';
  }

  return common;
}

export function createContractApp({ root, storage, editor }) {
  if (!root) fail("Raiz inválida.");
  if (!storage || typeof storage.loadProject !== "function") fail("Storage inválido.");
  if (!editor) fail("Editor inválido.");

  const initialProject = storage.loadProject();
  const initialSelection = getFirstPath(initialProject);
  const assistConfig = readAssistConfigStorage();

  const state = {
    project: initialProject,
    selection: initialSelection,
    view: "courses",
    assistConfig,
    assistDraft: {
      promptText: "",
      dependencyKeys: [],
      pendingDependencyKey: "",
      errorMessage: "",
      isSubmitting: false
    },
    microsequenceDraft: {
      title: "",
      tagsText: ""
    },
    cardDraft: getCardDraft(null),
    statusMessage: ""
  };

  function getContext(project = state.project, selection = state.selection) {
    const course = findCourse(project, selection.courseKey);
    const moduleValue = course ? findModule(project, selection.courseKey, selection.moduleKey) : null;
    const lesson = moduleValue ? findLesson(project, selection.courseKey, selection.moduleKey, selection.lessonKey) : null;
    const microsequence = lesson ? findMicrosequence(project, selection.courseKey, selection.moduleKey, selection.lessonKey, selection.microsequenceKey) : null;
    const cards = microsequence?.cards || [];
    const card = microsequence && selection.cardKey ? findCard(microsequence, selection.cardKey) : cards[0] || null;
    return { course, moduleValue, lesson, microsequence, cards, card };
  }

  function syncDrafts() {
    const { microsequence, card, course } = getContext();
    state.microsequenceDraft = {
      title: microsequence?.title || "",
      tagsText: (microsequence?.tags || []).join(", ")
    };
    state.cardDraft = getCardDraft(card);
    if (!course) {
      state.selection = getFirstPath(state.project);
    }
  }

  function setProject(nextProject) {
    state.project = nextProject;
    storage.saveProject(nextProject);
    syncDrafts();
  }

  function applySelection(selection) {
    state.selection = selection;
    syncDrafts();
  }

  function openCourse(courseKey) {
    const course = findCourse(state.project, courseKey);
    const moduleValue = course?.modules?.[0] || null;
    const lesson = moduleValue?.lessons?.[0] || null;
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey: course?.key || null,
      moduleKey: moduleValue?.key || null,
      lessonKey: lesson?.key || null,
      microsequenceKey: microsequence?.key || null,
      cardKey: card?.key || null,
      cardIndex: 0
    });
    state.view = "course";
    render();
  }

  function openLesson(moduleKey, lessonKey) {
    const lesson = findLesson(state.project, state.selection.courseKey, moduleKey, lessonKey);
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey: state.selection.courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey: microsequence?.key || null,
      cardKey: card?.key || null,
      cardIndex: 0
    });
    state.view = "lesson";
    render();
  }

  function openMicrosequence(microsequenceKey) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      ...state.selection,
      microsequenceKey,
      cardKey: card?.key || null,
      cardIndex: 0
    });
    state.view = "microsequence";
    render();
  }

  function selectCard(cardKey) {
    const { cards } = getContext();
    const cardIndex = Math.max(0, cards.findIndex((item) => item.key === cardKey));
    applySelection({
      ...state.selection,
      cardKey,
      cardIndex
    });
    render();
  }

  function goBack() {
    if (state.view === "microsequence") {
      state.view = "lesson";
    } else if (state.view === "lesson") {
      state.view = "course";
    } else if (state.view === "course") {
      state.view = "courses";
    }
    render();
  }

  function createCourse() {
    const nextProject = editor.createCourse({ title: "Novo curso" });
    setProject(nextProject);
    const course = nextProject.courses.at(-1);
    openCourse(course.key);
  }

  function createModule() {
    const nextProject = editor.createModule({
      courseKey: state.selection.courseKey,
      title: "Novo módulo"
    });
    setProject(nextProject);
    render();
  }

  function createLesson(moduleKey = state.selection.moduleKey) {
    const nextProject = editor.createLesson({
      courseKey: state.selection.courseKey,
      moduleKey,
      title: "Nova lição"
    });
    setProject(nextProject);
    render();
  }

  function createMicrosequence() {
    const nextProject = editor.createMicrosequence({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      title: "Nova microssequência"
    });
    setProject(nextProject);
    const lesson = findLesson(nextProject, state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey);
    const microsequence = lesson.microsequences.at(-1);
    openMicrosequence(microsequence.key);
  }

  function createCard(cardType) {
    const starter = createStarterContractCard(cardType);
    const nextProject = editor.createCard({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      ...starter
    });
    setProject(nextProject);
    const { microsequence } = getContext(nextProject);
    const card = microsequence.cards.at(-1);
    selectCard(card.key);
  }

  function saveMicrosequenceMeta() {
    const tags = parseLines(state.microsequenceDraft.tagsText);
    const nextProject = editor.updateMicrosequence({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      title: state.microsequenceDraft.title,
      tags
    });
    setProject(nextProject);
    state.statusMessage = "Microssequência atualizada.";
    render();
  }

  function saveCard() {
    const nextCardInput = buildCardInputFromDraft(state.cardDraft, state.selection.cardKey);
    const nextProject = editor.updateCard({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      cardKey: state.selection.cardKey,
      ...nextCardInput
    });
    setProject(nextProject);
    state.statusMessage = "Card atualizado.";
    render();
  }

  function deleteCard() {
    const nextProject = editor.deleteCard({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      cardKey: state.selection.cardKey
    });
    setProject(nextProject);
    const { microsequence } = getContext(nextProject);
    const card = microsequence.cards[0];
    selectCard(card.key);
  }

  async function generateMicrosequence() {
    const { course, moduleValue, lesson, microsequence, card } = getContext();
    const dependencies = collectAssistDependencies(course, moduleValue, lesson, microsequence);
    const dependencyTitles = dependencies
      .filter((item) => state.assistDraft.dependencyKeys.includes(item.key))
      .map((item) => item.title || item.key);

    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    render();

    try {
      const result = await runGeminiAssist({
        apiKey: state.assistConfig.apiKey,
        model: state.assistConfig.model,
        mode: "compose-microsequence",
        microsequence,
        card,
        dependencyTitles,
        promptText: state.assistDraft.promptText
      });

      const nextProject = editor.replaceMicrosequenceCards({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: state.selection.microsequenceKey,
        title: result.microsequenceTitle,
        tags: result.tags.length ? result.tags : dependencyTitles,
        cards: result.cards
      });
      setProject(nextProject);
      const nextMicro = getContext(nextProject).microsequence;
      state.selection.cardKey = nextMicro.cards[0].key;
      state.selection.cardIndex = 0;
      state.statusMessage = `Microssequência gerada com ${result.cards.length} cards.`;
    } catch (error) {
      state.assistDraft.errorMessage = error.message;
    } finally {
      state.assistDraft.isSubmitting = false;
      render();
    }
  }

  async function reviseCard() {
    const { course, moduleValue, lesson, microsequence, card } = getContext();
    const dependencies = collectAssistDependencies(course, moduleValue, lesson, microsequence);
    const dependencyTitles = dependencies
      .filter((item) => state.assistDraft.dependencyKeys.includes(item.key))
      .map((item) => item.title || item.key);

    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    render();

    try {
      const nextCard = await runGeminiAssist({
        apiKey: state.assistConfig.apiKey,
        model: state.assistConfig.model,
        mode: "edit-card",
        microsequence,
        card,
        dependencyTitles,
        promptText: state.assistDraft.promptText
      });

      const nextProject = editor.updateCard({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: state.selection.microsequenceKey,
        cardKey: state.selection.cardKey,
        ...nextCard
      });
      setProject(nextProject);
      state.statusMessage = "Card revisado pela LLM.";
    } catch (error) {
      state.assistDraft.errorMessage = error.message;
    } finally {
      state.assistDraft.isSubmitting = false;
      render();
    }
  }

  function renderCoursesView() {
    const coursesHtml = (state.project.courses || []).map((course) => (
      '<article class="clean-card module-card progress-card">' +
      '<h3 class="card-title">' + escapeHtml(course.title) + "</h3>" +
      (course.description ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>" : "") +
      '<p class="muted tiny progress-meta">' + String((course.modules || []).length) + " módulos</p>" +
      '<button class="open-mini" type="button" data-action="open-course" data-course-key="' + escapeHtml(course.key) + '">&#9654;</button>' +
      "</article>"
    )).join("");

    return (
      '<section class="screen">' +
      '<header class="lesson-topbar"><div class="topbar-space"></div><div class="topbar-heading"><div class="topbar-title">AraLearn</div></div><button class="icon-ghost" type="button" data-action="create-course" title="Novo curso" aria-label="Novo curso">+</button></header>' +
      '<main class="screen-content course-screen">' +
      '<section class="clean-card draft-course-hero"><div class="draft-course-hero-main"><div class="microsequence-copy"><h3 class="card-title card-title-featured">Contrato principal em produção</h3><p class="card-subtitle">Storage, editor e API usam tipos explícitos e campos rasos por card.</p></div></div></section>' +
      coursesHtml +
      "</main></section>"
    );
  }

  function renderCourseView(context) {
    const lessonsHtml = (context.course.modules || []).map((moduleValue) => (
      '<section class="clean-card module-card progress-card">' +
      '<header class="module-head"><h3 class="card-title">' + escapeHtml(moduleValue.title) + '</h3><button class="icon-ghost" type="button" data-action="create-lesson" data-module-key="' + escapeHtml(moduleValue.key) + '">+</button></header>' +
      ((moduleValue.lessons || []).map((lesson) => (
        '<div class="lesson-item progress-row">' +
        '<div class="lesson-copy"><button class="row-main lesson-main-button" type="button" data-action="open-lesson" data-module-key="' + escapeHtml(moduleValue.key) + '" data-lesson-key="' + escapeHtml(lesson.key) + '"><span class="lesson-title">' + escapeHtml(lesson.title) + '</span></button>' +
        (lesson.description ? '<p class="card-subtitle lesson-description">' + escapeHtml(lesson.description) + "</p>" : "") +
        '<p class="muted tiny progress-meta">' + String((lesson.microsequences || []).length) + " microssequências · " + String(countCardsInLesson(lesson)) + " cards</p></div>" +
        '<div class="lesson-actions"><button class="open-mini" type="button" data-action="open-lesson" data-module-key="' + escapeHtml(moduleValue.key) + '" data-lesson-key="' + escapeHtml(lesson.key) + '">&#9654;</button></div>' +
        "</div>"
      )).join("")) +
      "</section>"
    )).join("");

    return (
      '<section class="screen">' +
      '<header class="lesson-topbar"><button class="icon-ghost" type="button" data-action="go-back">‹</button><div class="topbar-heading"><div class="topbar-title">' + escapeHtml(context.course.title) + '</div></div><button class="icon-ghost" type="button" data-action="create-module">+</button></header>' +
      '<main class="screen-content course-screen">' + lessonsHtml + "</main></section>"
    );
  }

  function renderLessonView(context) {
    const microHtml = (context.lesson.microsequences || []).map((microsequence) => (
      '<article class="clean-card microsequence-card progress-card">' +
      '<div class="microsequence-copy"><button class="row-main microsequence-main-button" type="button" data-action="open-microsequence" data-microsequence-key="' + escapeHtml(microsequence.key) + '"><span class="microsequence-title">' + escapeHtml(microsequence.title) + '</span></button>' +
      '<p class="muted tiny progress-meta">' + String((microsequence.cards || []).length) + " cards" + ((microsequence.tags || []).length ? " · " + escapeHtml((microsequence.tags || []).join(", ")) : "") + "</p></div>" +
      '<div class="microsequence-actions"><button class="open-mini" type="button" data-action="open-microsequence" data-microsequence-key="' + escapeHtml(microsequence.key) + '">&#9654;</button></div>' +
      "</article>"
    )).join("");

    return (
      '<section class="screen">' +
      '<header class="lesson-topbar"><button class="icon-ghost" type="button" data-action="go-back">‹</button><div class="topbar-heading"><div class="topbar-title">' + escapeHtml(context.lesson.title) + '</div></div><button class="icon-ghost" type="button" data-action="create-microsequence">+</button></header>' +
      '<main class="screen-content lesson-structure-screen">' +
      '<section class="context-band lesson-context-band"><span class="context-chip lesson-context-chip lesson-context-chip-start">' + escapeHtml(context.moduleValue.title) + '</span><span class="context-chip lesson-context-chip lesson-context-chip-end">' + String((context.lesson.microsequences || []).length) + " microssequências</span></section>" +
      '<section class="microsequence-list">' + microHtml + "</section></main></section>"
    );
  }

  function renderMicrosequenceView(context) {
    const dependencies = collectAssistDependencies(context.course, context.moduleValue, context.lesson, context.microsequence);
    const dependencyOptions = dependencies.map((item) => (
      '<label class="didactic-tag dependency-tag-chip light-tag">' +
      '<input type="checkbox" data-action="toggle-dependency" data-dependency-key="' + escapeHtml(item.key) + '"' +
      (state.assistDraft.dependencyKeys.includes(item.key) ? " checked" : "") +
      ">" +
      '<span class="didactic-tag-text">' + escapeHtml(item.title) + "</span></label>"
    )).join("");
    const cardList = context.cards.map((card) => (
      '<button class="mini-card thumb' + (card.key === state.selection.cardKey ? " active" : "") + '" type="button" data-action="select-card" data-card-key="' + escapeHtml(card.key) + '">' +
      '<div class="mini-card-kicker">' + escapeHtml(card.type) + '</div><div class="mini-card-title">' + escapeHtml(card.title || card.key) + "</div></button>"
    )).join("");
    const modelOptions = ASSIST_MODEL_OPTIONS.map((item) => (
      '<option value="' + escapeHtml(item.value) + '"' + (item.value === state.assistConfig.model ? " selected" : "") + ">" + escapeHtml(item.label) + "</option>"
    )).join("");

    return (
      '<section class="screen">' +
      '<header class="lesson-topbar"><button class="icon-ghost" type="button" data-action="go-back">‹</button><div class="topbar-heading"><div class="topbar-title">' + escapeHtml(context.microsequence.title) + '</div></div><button class="icon-ghost" type="button" data-action="create-card" title="Novo card">+</button></header>' +
      '<main class="screen-content microsequence-generator-screen">' +
      '<section class="clean-card microsequence-assist-panel">' +
      '<div class="field compact-field"><label>Título</label><input data-field="microsequence-title" type="text" value="' + escapeHtml(state.microsequenceDraft.title) + '"></div>' +
      '<div class="field compact-field"><label>Tags</label><input data-field="microsequence-tags" type="text" value="' + escapeHtml(state.microsequenceDraft.tagsText) + '"></div>' +
      '<div class="assist-actions assist-actions-wide"><button class="open-mini" type="button" data-action="save-microsequence-meta">Salvar microssequência</button></div>' +
      "</section>" +
      '<section class="editor-step-nav"><div class="editor-step-nav-head"><p class="chip-muted">' + String(context.cards.length) + ' cards</p><select data-field="new-card-type"><option value="text">text</option><option value="choice">choice</option><option value="complete">complete</option><option value="editor">editor</option><option value="table">table</option><option value="flow">flow</option><option value="image">image</option></select></div><div class="editor-step-strip">' + cardList + "</div></section>" +
      renderCardPreview(context.card) +
      '<section class="clean-card microsequence-assist-panel">' +
      '<div class="field compact-field"><label>Tipo</label><select data-field="card-type"><option value="text"' + (state.cardDraft.type === "text" ? " selected" : "") + '>text</option><option value="choice"' + (state.cardDraft.type === "choice" ? " selected" : "") + '>choice</option><option value="complete"' + (state.cardDraft.type === "complete" ? " selected" : "") + '>complete</option><option value="editor"' + (state.cardDraft.type === "editor" ? " selected" : "") + '>editor</option><option value="table"' + (state.cardDraft.type === "table" ? " selected" : "") + '>table</option><option value="flow"' + (state.cardDraft.type === "flow" ? " selected" : "") + '>flow</option><option value="image"' + (state.cardDraft.type === "image" ? " selected" : "") + '>image</option></select></div>' +
      renderCardFields(state.cardDraft) +
      '<div class="assist-actions assist-actions-wide"><button class="icon-ghost" type="button" data-action="delete-card">Excluir</button><button class="open-mini" type="button" data-action="save-card">Salvar card</button></div>' +
      "</section>" +
      '<section class="clean-card microsequence-assist-panel microsequence-generator-panel">' +
      '<div class="field compact-field"><label>Dependências</label><div class="dependency-chip-row">' + dependencyOptions + '</div></div>' +
      '<div class="field compact-field"><label>Prompt assistido</label><textarea data-field="assist-prompt" class="assist-prompt">' + escapeHtml(state.assistDraft.promptText) + "</textarea></div>" +
      '<div class="assist-actions assist-actions-wide"><select data-field="assist-model">' + modelOptions + '</select><input data-field="assist-api-key" type="password" value="' + escapeHtml(state.assistConfig.apiKey) + '" placeholder="API key"><button class="open-mini" type="button" data-action="generate-microsequence"' + (state.assistDraft.isSubmitting ? " disabled" : "") + '>Gerar microssequência</button><button class="icon-ghost" type="button" data-action="revise-card"' + (state.assistDraft.isSubmitting ? " disabled" : "") + '>Revisar card</button></div>' +
      (state.assistDraft.errorMessage ? '<p class="muted assist-last-request">' + escapeHtml(state.assistDraft.errorMessage) + "</p>" : "") +
      (state.statusMessage ? '<p class="muted assist-last-request">' + escapeHtml(state.statusMessage) + "</p>" : "") +
      "</section>" +
      "</main></section>"
    );
  }

  function render() {
    const context = getContext();
    if (state.view === "courses") {
      root.innerHTML = renderCoursesView();
    } else if (state.view === "course") {
      root.innerHTML = renderCourseView(context);
    } else if (state.view === "lesson") {
      root.innerHTML = renderLessonView(context);
    } else {
      root.innerHTML = renderMicrosequenceView(context);
    }

    root.querySelector("[data-action='go-back']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='create-course']")?.addEventListener("click", () => createCourse());
    root.querySelector("[data-action='create-module']")?.addEventListener("click", () => createModule());
    root.querySelector("[data-action='create-microsequence']")?.addEventListener("click", () => createMicrosequence());
    root.querySelectorAll("[data-action='create-lesson']").forEach((node) =>
      node.addEventListener("click", () => createLesson(node.getAttribute("data-module-key")))
    );
    root.querySelectorAll("[data-action='open-course']").forEach((node) => node.addEventListener("click", () => openCourse(node.getAttribute("data-course-key"))));
    root.querySelectorAll("[data-action='open-lesson']").forEach((node) => node.addEventListener("click", () => openLesson(node.getAttribute("data-module-key"), node.getAttribute("data-lesson-key"))));
    root.querySelectorAll("[data-action='open-microsequence']").forEach((node) => node.addEventListener("click", () => openMicrosequence(node.getAttribute("data-microsequence-key"))));
    root.querySelectorAll("[data-action='select-card']").forEach((node) => node.addEventListener("click", () => selectCard(node.getAttribute("data-card-key"))));

    root.querySelector("[data-action='save-microsequence-meta']")?.addEventListener("click", () => saveMicrosequenceMeta());
    root.querySelector("[data-action='save-card']")?.addEventListener("click", () => saveCard());
    root.querySelector("[data-action='delete-card']")?.addEventListener("click", () => deleteCard());
    root.querySelector("[data-action='create-card']")?.addEventListener("click", () => {
      const type = root.querySelector("[data-field='new-card-type']")?.value || "text";
      createCard(type);
    });
    root.querySelector("[data-action='generate-microsequence']")?.addEventListener("click", () => { void generateMicrosequence(); });
    root.querySelector("[data-action='revise-card']")?.addEventListener("click", () => { void reviseCard(); });

    root.querySelectorAll("[data-action='toggle-dependency']").forEach((node) => {
      node.addEventListener("change", () => {
        const key = node.getAttribute("data-dependency-key");
        if (!key) return;
        const current = new Set(state.assistDraft.dependencyKeys);
        if (node.checked) {
          current.add(key);
        } else {
          current.delete(key);
        }
        state.assistDraft.dependencyKeys = Array.from(current);
      });
    });

    root.querySelector("[data-field='microsequence-title']")?.addEventListener("input", (event) => {
      state.microsequenceDraft.title = event.target.value;
    });
    root.querySelector("[data-field='microsequence-tags']")?.addEventListener("input", (event) => {
      state.microsequenceDraft.tagsText = event.target.value;
    });
    root.querySelector("[data-field='assist-prompt']")?.addEventListener("input", (event) => {
      state.assistDraft.promptText = event.target.value;
    });
    root.querySelector("[data-field='assist-model']")?.addEventListener("change", (event) => {
      state.assistConfig.model = event.target.value;
      writeAssistConfigStorage(state.assistConfig);
    });
    root.querySelector("[data-field='assist-api-key']")?.addEventListener("input", (event) => {
      state.assistConfig.apiKey = event.target.value;
      writeAssistConfigStorage(state.assistConfig);
    });

    [
      "card-title",
      "card-text",
      "card-ask",
      "card-answer",
      "card-wrong",
      "card-language",
      "card-code",
      "card-columns",
      "card-rows",
      "card-flow",
      "card-src",
      "card-alt"
    ].forEach((field) => {
      root.querySelector(`[data-field='${field}']`)?.addEventListener("input", (event) => {
        const propertyMap = {
          "card-title": "title",
          "card-text": "text",
          "card-ask": "ask",
          "card-answer": "answerText",
          "card-wrong": "wrongText",
          "card-language": "language",
          "card-code": "code",
          "card-columns": "columnsText",
          "card-rows": "rowsText",
          "card-flow": "flowText",
          "card-src": "src",
          "card-alt": "alt"
        };
        state.cardDraft[propertyMap[field]] = event.target.value;
      });
    });

    root.querySelector("[data-field='card-type']")?.addEventListener("change", (event) => {
      state.cardDraft = getCardDraft(createStarterContractCard(event.target.value));
      state.cardDraft.type = event.target.value;
      render();
    });
  }

  syncDrafts();
  render();
}
