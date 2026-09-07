import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { renderUiIcon } from "./renderUiIcons.js";

const MAP_STATUS = Object.freeze({ absent: "Ainda não definido", draft: "Rascunho", approved: "Aprovado" });
const COVERAGE_STATUS = Object.freeze({ planned: "Planejado", developed: "Desenvolvido" });
const bindings = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function key(...parts) { return parts.map((part) => encodeURIComponent(part)).join(":"); }

function details(id, label, content, expansion, className = "", navigation = "") {
  const disclosure = `<details class="course-curriculum-map-details ${className}"` +
    ` data-curriculum-expansion="${escapeHtml(id)}"${expansion.has(id) ? " open" : ""}>` +
    `<summary data-curriculum-key="${escapeHtml(`expand:${id}`)}">${label}</summary>` +
    `<div class="course-curriculum-map-body">${content}</div></details>`;
  return navigation ? `<div class="course-curriculum-map-node">${disclosure}${navigation}</div>` : disclosure;
}

export function formatCoverageLabel(statement) {
  const text = String(statement ?? "");
  // Only short, unambiguous label fragments lose an editorial stop. This is not
  // a grammar parser: sentences, abbreviations and uncertain cases keep their text.
  if (!text.endsWith(".") || text.endsWith("..") || text.length > 140 || /[\n!?;:]/u.test(text)) return text;
  const label = text.slice(0, -1);
  if (/\b(?:etc|ex|pág|págs|fig|figs|art|arts|cap|caps|vol|vols|sr|sra|dr|dra|prof|profa|aprox|obs)\.$/iu.test(text) ||
      /(?:^|\s)\p{L}\.$/u.test(text) || /\.(?!\d)/u.test(label)) return text;
  if (/^(?:a|o|as|os|um|uma|uns|umas|cada|este|esta|esse|essa|isso|isto|quando|como)\b/iu.test(label) ||
      /^\p{L}+(?:ar|er|ir)\b/iu.test(label) ||
      /\b(?:é|são|era|eram|foi|foram|será|serão|está|estão|estava|estavam|tem|têm|há|pode|podem|deve|devem|usa|usam|permite|permitem|inclui|incluem|contém|contêm|transmite|transmitem|representa|representam|significa|significam)\b/iu.test(label) ||
      /\b(?!(?:sem|bem|nem)\b)\p{L}+(?:am|em|ou|aram|avam|iam)\b/iu.test(label)) return text;
  return label;
}

function objective(kind, node, expansion) {
  return node.objective ? details(key("objective", kind, node.id), "Objetivo",
    `<p class="course-curriculum-map-prose">${escapeHtml(node.objective)}</p>`, expansion,
    "course-curriculum-map-objective") : "";
}

function link(courseId, option, id, label, controlKey, { iconOnly = false } = {}) {
  const route = buildCourseAuthoringRoute(courseId, { section: "content", [option]: id });
  return `<a href="${escapeHtml(route)}" data-curriculum-navigate` +
    ` data-curriculum-key="${escapeHtml(controlKey)}"` +
    (iconOnly ? ` class="course-curriculum-map-open" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"` : "") +
    `>${iconOnly ? renderUiIcon("arrow-right", "course-authoring-button-icon") : escapeHtml(label)}</a>`;
}

function indexCurriculum(curriculum) {
  const modules = new Map();
  const lessons = new Map();
  const microsequences = new Map();
  for (const module of curriculum.modules) {
    modules.set(module.id, module);
    for (const lesson of module.lessons) {
      lessons.set(lesson.id, lesson);
      for (const microsequence of lesson.microsequences) microsequences.set(microsequence.id, microsequence);
    }
  }
  return { modules, lessons, microsequences };
}

function renderMicrosequence(courseId, microsequence, nodes, expansion) {
  const dependencies = microsequence.dependencyMicrosequenceIds.length
    ? details(key("prerequisites", microsequence.id),
      `Pré-requisitos · ${microsequence.dependencyMicrosequenceIds.length}`,
      '<ul class="course-curriculum-map-links">' + microsequence.dependencyMicrosequenceIds.map((id) =>
        `<li>${link(courseId, "didacticMicrosequenceId", id, nodes.microsequences.get(id).title,
          key("dependency", microsequence.id, id))}</li>`).join("") + '</ul>', expansion)
    : "";
  return '<li class="course-curriculum-map-microsequence">' +
    '<header class="course-curriculum-map-node-heading">' +
    `<h5>${escapeHtml(microsequence.title)}</h5>` +
    link(courseId, "didacticMicrosequenceId", microsequence.id, `Abrir microssequência em Conteúdo: ${microsequence.title}`,
      key("microsequence", microsequence.id), { iconOnly: true }) + '</header>' +
    objective("microsequence", microsequence, expansion) + dependencies + '</li>';
}

function renderLesson(courseId, lesson, nodes, expansion, index) {
  const count = lesson.microsequences.length;
  const label = `<span class="course-curriculum-map-node-title">${index + 1}. ${escapeHtml(lesson.title)}</span>` +
    `<span class="course-curriculum-map-count">${count} ${count === 1 ? "microssequência" : "microssequências"}</span>`;
  return '<li>' + details(key("lesson", lesson.id), label,
    objective("lesson", lesson, expansion) +
    '<ol class="course-curriculum-map-microsequences">' + lesson.microsequences.map((microsequence) =>
      renderMicrosequence(courseId, microsequence, nodes, expansion)).join("") + '</ol>', expansion,
    "course-curriculum-map-lesson",
    link(courseId, "lessonId", lesson.id, `Inspecionar lição: ${lesson.title}`, key("lesson", lesson.id), { iconOnly: true })) + '</li>';
}

function renderModule(courseId, module, nodes, expansion, index) {
  const count = module.lessons.length;
  const label = `<span class="course-curriculum-map-node-title">${index + 1}. ${escapeHtml(module.title)}</span>` +
    `<span class="course-curriculum-map-count">${count} ${count === 1 ? "lição" : "lições"}</span>`;
  return '<li>' + details(key("module", module.id), label,
    objective("module", module, expansion) +
    '<ol class="course-curriculum-map-lessons">' + module.lessons.map((lesson, index) =>
      renderLesson(courseId, lesson, nodes, expansion, index)).join("") + '</ol>', expansion,
    "course-curriculum-map-module",
    link(courseId, "moduleId", module.id, `Inspecionar módulo: ${module.title}`, key("module", module.id), { iconOnly: true })) + '</li>';
}

function renderCoverageItem(courseId, item, nodes, expansion) {
  const targets = item.curriculumTargets.map((target, targetIndex) => '<li>' +
    '<p class="course-curriculum-map-path">' +
    link(courseId, "moduleId", target.moduleId, nodes.modules.get(target.moduleId).title,
      key("coverage-module", item.id, targetIndex)) + ' · ' +
    link(courseId, "lessonId", target.lessonId, nodes.lessons.get(target.lessonId).title,
      key("coverage-lesson", item.id, targetIndex)) + '</p><ul class="course-curriculum-map-links">' +
    target.didacticMicrosequenceIds.map((id) => '<li>' +
      link(courseId, "didacticMicrosequenceId", id, nodes.microsequences.get(id).title,
        key("coverage-microsequence", item.id, targetIndex, id)) + '</li>').join("") + '</ul></li>').join("");
  const developed = item.developedIn?.length
    ? '<p class="course-curriculum-map-caption">Desenvolvido em</p><ul class="course-curriculum-map-links">' +
      item.developedIn.map((reference) => '<li>' + link(courseId, "studyUnitId", reference.studyUnitId,
        reference.title, key("development", item.id, reference.studyUnitId)) + '</li>').join("") + '</ul>'
    : "";
  return '<li>' + details(key("coverage", item.id),
    `<span class="course-curriculum-map-node-title">${escapeHtml(formatCoverageLabel(item.statement))}</span>` +
    `<span class="course-curriculum-map-count">${escapeHtml(COVERAGE_STATUS[item.state])}</span>`,
    '<ul class="course-curriculum-map-targets">' + targets + '</ul>' + developed, expansion,
    "course-curriculum-map-coverage-item") + '</li>';
}

/** Receives the already normalized planning projection; expansion is temporary UI state. */
export function renderCourseCurriculumMap({
  courseId, curriculum, curriculumScopeItems = [], curriculumMapStatus = "absent", expansion = []
}) {
  const nodes = indexCurriculum(curriculum);
  const expanded = new Set(expansion);
  const returnTo = buildCourseAuthoringRoute(courseId, { section: "planning" });
  const content = curriculum.modules.length
    ? '<ol class="course-curriculum-map-modules">' + curriculum.modules.map((module, index) =>
      renderModule(courseId, module, nodes, expanded, index)).join("") + '</ol>'
    : '<p class="course-curriculum-map-prose">O mapa curricular ainda não foi definido.</p>';
  const coverage = details("coverage", `<span>Cobertura do escopo</span>` +
    `<span class="course-curriculum-map-count">${curriculumScopeItems.length} ${curriculumScopeItems.length === 1 ? "item" : "itens"}</span>`,
    curriculumScopeItems.length
      ? '<ol class="course-curriculum-map-coverage-items">' + curriculumScopeItems.map((item) =>
        renderCoverageItem(courseId, item, nodes, expanded)).join("") + '</ol>'
      : '<p>Nenhum item de cobertura foi definido.</p>', expanded, "course-curriculum-map-coverage");
  return `<section class="course-curriculum-map" data-course-curriculum-map data-curriculum-return="${escapeHtml(returnTo)}"` +
    ' aria-label="Mapa curricular"><header class="course-curriculum-map-header"><h3>Mapa curricular</h3>' +
    `<span class="course-curriculum-map-status">${escapeHtml(MAP_STATUS[curriculumMapStatus])}</span></header>` +
    '<p class="course-curriculum-map-orientation">Abra um módulo e uma lição para examinar a progressão, os objetivos e os pré-requisitos.</p>' +
    content + coverage + '</section>';
}

/** Binds native disclosures without re-rendering the map or replacing its focused element. */
export function bindCourseCurriculumMap(root, {
  scrollRoot = root, onNavigate, onStateChange = () => {}, initialState = null
} = {}) {
  bindings.get(root)?.destroy();
  let destroyed = false;
  let navigationFocusKey = "";
  const disclosures = () => [...root.querySelectorAll("details[data-curriculum-expansion]")];
  const controls = () => [...root.querySelectorAll("[data-curriculum-key]")];
  const visible = (node) => node?.getClientRects?.().length > 0;
  const findControl = (controlKey) => controls().find((node) => node.dataset.curriculumKey === controlKey);
  const top = () => scrollRoot.getBoundingClientRect?.().top || 0;

  function captureState() {
    const active = root.ownerDocument?.activeElement;
    const focusKey = (root.contains?.(active) ? active.dataset?.curriculumKey : "") || navigationFocusKey;
    const activeControl = findControl(focusKey);
    const viewportTop = top();
    const viewportBottom = viewportTop + (scrollRoot.clientHeight || Infinity);
    const inViewport = (node) => visible(node) && node.getBoundingClientRect().bottom > viewportTop &&
      node.getBoundingClientRect().top < viewportBottom;
    const anchor = inViewport(activeControl) ? activeControl : controls().find(inViewport);
    return {
      expansion: disclosures().filter((node) => node.open).map((node) => node.dataset.curriculumExpansion),
      position: {
        anchorKey: anchor?.dataset.curriculumKey || "",
        offset: anchor ? anchor.getBoundingClientRect().top - viewportTop : 0,
        scrollTop: Number(scrollRoot.scrollTop) || 0,
        scrollLeft: Number(scrollRoot.scrollLeft) || 0,
        focusKey: focusKey || ""
      }
    };
  }

  function restorePosition() {
    if (destroyed || !initialState?.position) return false;
    const position = initialState.position;
    scrollRoot.scrollTop = Math.max(0, Number(position.scrollTop) || 0);
    scrollRoot.scrollLeft = Math.max(0, Number(position.scrollLeft) || 0);
    const anchor = findControl(position.anchorKey);
    if (visible(anchor) && Number.isFinite(position.offset)) {
      scrollRoot.scrollTop += anchor.getBoundingClientRect().top - top() - position.offset;
    }
    const focus = findControl(position.focusKey);
    if (visible(focus)) focus.focus?.({ preventScroll: true });
    return true;
  }

  function handleToggle(event) {
    if (event.target.matches?.("details[data-curriculum-expansion]")) onStateChange(captureState());
  }

  function handleClick(event) {
    const destination = event.target.closest?.("a[data-curriculum-navigate]");
    if (!destination || !root.contains(destination) || event.defaultPrevented ||
        event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
        typeof onNavigate !== "function") return;
    event.preventDefault();
    navigationFocusKey = destination.dataset.curriculumKey;
    onStateChange(captureState());
    onNavigate(destination.getAttribute("href"), { returnTo: root.dataset.curriculumReturn });
  }

  root.addEventListener("toggle", handleToggle, true);
  root.addEventListener("click", handleClick);
  const binding = {
    captureState,
    restorePosition,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener("toggle", handleToggle, true);
      root.removeEventListener("click", handleClick);
      if (bindings.get(root) === binding) bindings.delete(root);
    }
  };
  bindings.set(root, binding);
  return binding;
}
