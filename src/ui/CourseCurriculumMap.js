import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { renderUiIcon } from "./renderUiIcons.js";

const MAP_STATUS = Object.freeze({ absent: "Ainda não definido", draft: "Rascunho", approved: "Aprovado" });
const COVERAGE_STATUS = Object.freeze({ planned: "Planejado", developed: "Desenvolvido" });
const bindings = new WeakMap();
const PENDING_LABELS = Object.freeze({ audience_missing: "Público ainda não definido", modules_missing: "Módulos ainda não definidos",
  scope_missing: "Escopo ainda não definido", lessons_missing: "Módulo sem lições", microsequences_missing: "Lição sem microssequências",
  scope_uncovered: "Item de escopo sem cobertura", dependency_order: "Pré-requisito fora da ordem do percurso",
  dependency_missing: "Pré-requisito ainda não localizado", scope_reference_missing: "Referência de escopo ainda não localizada" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function key(...parts) { return parts.map((part) => encodeURIComponent(part)).join(":"); }

function contextualActions(kind, id, label, enabled) {
  if (!enabled) return "";
  const actions = [["parameters", "tags", "Parâmetros"], ["guidance", "edit", "Orientações"]];
  if (kind === "didactic_microsequence") actions.unshift(["explanation", "book-open", "Explicação"], ["sources", "study", "Fontes e ocorrências"], ["instruction", "graph", "Análise e evidência"]);
  return `<nav class="course-curriculum-context-actions" aria-label="Decisões de ${escapeHtml(label)}">${actions.map(([action, icon, name]) =>
    `<button class="course-authoring-icon-action" type="button" data-curriculum-context="${action}" data-target-kind="${kind}" data-target-id="${escapeHtml(id)}"` +
    ` data-target-label="${escapeHtml(label)}" data-curriculum-key="${escapeHtml(key("context", kind, id, action))}"` +
    ` title="${name}" aria-label="${name} de ${escapeHtml(label)}">${renderUiIcon(icon, "course-authoring-button-icon")}</button>`).join("")}</nav>`;
}

function pendingDescription(item, nodes) {
  const target = nodes.modules.get(item.targetId) || nodes.lessons.get(item.targetId) || nodes.microsequences.get(item.targetId) || nodes.scopeItems.get(item.targetId);
  return `${PENDING_LABELS[item.reason] || "Referência pendente"}${target ? ` · ${target.title || target.statement}` : ""}`;
}

function nodeAttributes(kind, node, nodes) {
  const own = [node.title, node.statement, node.objective, node.explanationPlan?.purpose, ...(node.explanationPlan?.prerequisites || []), ...(node.explanationPlan?.relations || [])].filter(Boolean).join(" ");
  return ` data-curriculum-node="${kind}" data-curriculum-node-id="${escapeHtml(node.id)}" data-curriculum-search-text="${escapeHtml(own)}" data-curriculum-pending="${nodes.pending.some(item => item.targetId === node.id)}"`;
}

function referenceLink(courseId, option, id, node, controlKey) {
  return node ? link(courseId, option, id, node.title, controlKey)
    : '<span class="course-curriculum-pending-reference">Referência ainda não localizada</span>';
}

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
        `<li>${referenceLink(courseId, "didacticMicrosequenceId", id, nodes.microsequences.get(id),
          key("dependency", microsequence.id, id))}</li>`).join("") + '</ul>', expansion)
    : "";
  return `<li class="course-curriculum-map-microsequence"${nodeAttributes("didactic_microsequence", microsequence, nodes)}>` +
    '<header class="course-curriculum-map-node-heading">' +
    `<h5>${escapeHtml(microsequence.title)}</h5>` +
    link(courseId, "didacticMicrosequenceId", microsequence.id, `Abrir microssequência em Conteúdo: ${microsequence.title}`,
      key("microsequence", microsequence.id), { iconOnly: true }) + '</header>' +
    contextualActions("didactic_microsequence", microsequence.id, microsequence.title, nodes.contextual) +
    objective("microsequence", microsequence, expansion) + dependencies +
    (microsequence.role ? `<p class="course-curriculum-map-caption">Função no percurso: ${escapeHtml({ explain: "explicação e desenvolvimento teórico", practice: "prática", review: "revisão", support: "apoio" }[microsequence.role] || microsequence.role)}</p>` : "") +
    details(key("explanation", microsequence.id), "Explicação prevista",
      renderExplanationPlan(courseId, microsequence.explanationPlan, microsequence.id, nodes.sourceTitles), expansion) + '</li>';
}

function renderExplanationPlan(courseId, plan, microsequenceId, sourceTitles) {
  if (!plan) return '<p>O apoio desta microssequência ainda não foi planejado. Isso não impede a leitura do conteúdo anterior.</p>';
  const list = (label, values, empty) => `<h6>${label}</h6>` + (values.length
    ? `<ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : `<p>${empty}</p>`);
  return `<p>${escapeHtml(plan.purpose)}</p>` +
    list("Pressupostos a desenvolver", plan.prerequisites, "Nenhum pressuposto foi registrado no apoio previsto.") +
    list("Relações a explicar", plan.relations, "Nenhuma relação foi registrada no apoio previsto.") +
    '<h6>Fontes previstas</h6>' + (plan.sourceIds.length ? '<ul>' + plan.sourceIds.map(sourceId =>
      `<li><a data-curriculum-navigate data-curriculum-key="${escapeHtml(key("explanation-source", microsequenceId, sourceId))}" href="${escapeHtml(buildCourseAuthoringRoute(courseId,
        { section: "sources", sourceId }))}">${escapeHtml(sourceTitles.get(sourceId) || "Fonte prevista · título indisponível")}</a></li>`).join("") + '</ul>' :
      '<p>Fontes ainda não indicadas. A revisão precisa conferir o apoio e seus vínculos.</p>');
}

function renderLesson(courseId, lesson, nodes, expansion, index) {
  const count = lesson.microsequences.length;
  const label = `<span class="course-curriculum-map-node-title">${index + 1}. ${escapeHtml(lesson.title)}</span>` +
    `<span class="course-curriculum-map-count">${count} ${count === 1 ? "microssequência" : "microssequências"}</span>`;
  return `<li${nodeAttributes("lesson", lesson, nodes)}>` + details(key("lesson", lesson.id), label,
    contextualActions("lesson", lesson.id, lesson.title, nodes.contextual) + objective("lesson", lesson, expansion) +
    '<ol class="course-curriculum-map-microsequences">' + lesson.microsequences.map((microsequence) =>
      renderMicrosequence(courseId, microsequence, nodes, expansion)).join("") + '</ol>', expansion,
    "course-curriculum-map-lesson",
    link(courseId, "lessonId", lesson.id, `Inspecionar lição: ${lesson.title}`, key("lesson", lesson.id), { iconOnly: true })) + '</li>';
}

function renderModule(courseId, module, nodes, expansion, index) {
  const count = module.lessons.length;
  const label = `<span class="course-curriculum-map-node-title">${index + 1}. ${escapeHtml(module.title)}</span>` +
    `<span class="course-curriculum-map-count">${count} ${count === 1 ? "lição" : "lições"}</span>`;
  return `<li${nodeAttributes("module", module, nodes)}>` + details(key("module", module.id), label,
    contextualActions("module", module.id, module.title, nodes.contextual) + objective("module", module, expansion) +
    '<ol class="course-curriculum-map-lessons">' + module.lessons.map((lesson, index) =>
      renderLesson(courseId, lesson, nodes, expansion, index)).join("") + '</ol>', expansion,
    "course-curriculum-map-module",
    link(courseId, "moduleId", module.id, `Inspecionar módulo: ${module.title}`, key("module", module.id), { iconOnly: true })) + '</li>';
}

function renderCoverageItem(courseId, item, nodes, expansion) {
  const targets = item.curriculumTargets.map((target, targetIndex) => '<li>' +
    '<p class="course-curriculum-map-path">' +
    referenceLink(courseId, "moduleId", target.moduleId, nodes.modules.get(target.moduleId),
      key("coverage-module", item.id, targetIndex)) + ' · ' +
    referenceLink(courseId, "lessonId", target.lessonId, nodes.lessons.get(target.lessonId),
      key("coverage-lesson", item.id, targetIndex)) + '</p><ul class="course-curriculum-map-links">' +
    target.didacticMicrosequenceIds.map((id) => '<li>' +
      referenceLink(courseId, "didacticMicrosequenceId", id, nodes.microsequences.get(id),
        key("coverage-microsequence", item.id, targetIndex, id)) + '</li>').join("") + '</ul></li>').join("");
  const developed = item.developedIn?.length
    ? '<p class="course-curriculum-map-caption">Desenvolvido em</p><ul class="course-curriculum-map-links">' +
      item.developedIn.map((reference) => '<li>' + link(courseId, "studyUnitId", reference.studyUnitId,
        reference.title, key("development", item.id, reference.studyUnitId)) + '</li>').join("") + '</ul>'
    : "";
  return `<li${nodeAttributes("scope", item, nodes)}>` + details(key("coverage", item.id),
    `<span class="course-curriculum-map-node-title">${escapeHtml(formatCoverageLabel(item.statement))}</span>` +
    `<span class="course-curriculum-map-count">${escapeHtml(COVERAGE_STATUS[item.state])}</span>`,
    '<ul class="course-curriculum-map-targets">' + targets + '</ul>' + developed, expansion,
    "course-curriculum-map-coverage-item") + '</li>';
}

/** Receives the already normalized planning projection; expansion is temporary UI state. */
export function renderCourseCurriculumMap({
  courseId, courseRevision = null, sourceTitles = new Map(), curriculum, curriculumScopeItems = [], curriculumMapStatus = "absent", expansion = [],
  contextual = false, courseTitle = "Curso", query = "", pendingOnly = false, completeness = null, approval = null
}) {
  const nodes = indexCurriculum(curriculum);
  nodes.sourceTitles = sourceTitles;
  nodes.scopeItems = new Map(curriculumScopeItems.map(item => [item.id, item]));
  nodes.contextual = contextual;
  nodes.pending = completeness?.pending || [];
  const expanded = new Set(expansion);
  const approvalLabel = approval?.pending
    ? approval.pending.operation === "slice" ? "Retomar alteração curricular pendente" : "Confirmar aprovação pendente"
    : "Aprovar mapa inspecionado";
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
    contextualActions("course", courseId, courseTitle, contextual) +
    '<div class="course-curriculum-search"><label for="curriculum-map-query">Buscar no mapa</label>' +
    `<input id="curriculum-map-query" type="search" data-curriculum-query data-curriculum-key="search" value="${escapeHtml(query)}" placeholder="Título, objetivo ou ideia" autocomplete="off">` +
    (completeness ? `<button class="course-authoring-icon-action" type="button" data-curriculum-pending-only data-curriculum-key="pending-filter" aria-pressed="${pendingOnly}"` +
      ` aria-label="Mostrar somente pendências do mapa, ${nodes.pending.length}" title="Pendências do mapa">${renderUiIcon("draft-state", "course-authoring-button-icon")}</button>` : "") + '</div>' +
    (completeness ? `<details class="course-curriculum-pending-list"${nodes.pending.length ? " open" : ""}><summary>Pendências do mapa · ${nodes.pending.length}</summary>` +
      (nodes.pending.length ? `<ul>${nodes.pending.map(item => `<li>${escapeHtml(pendingDescription(item, nodes))}</li>`).join("")}</ul>` : '<p>As referências e a cobertura atendem aos critérios estruturais do mapa.</p>') +
      '<p>Base explicativa e revisão são verificadas ao abrir cada objeto.</p></details>' : "") +
    '<p class="course-curriculum-map-orientation">Abra um módulo e uma lição para examinar a progressão, os objetivos, os pré-requisitos e a Explicação prevista. A aprovação do mapa se refere ao plano; o conteúdo produzido exige sua própria revisão.</p>' +
    '<p data-curriculum-search-status role="status" hidden></p>' + content + coverage +
    (approval ? `<section class="course-curriculum-approval" aria-label="Aprovação do mapa"><p>Mapa salvo · versão ${approval.planVersion} · revisão do curso ${courseRevision}.</p>` +
      '<p>A aprovação declara sua inspeção do mapa completo, incluindo ramos recolhidos e resultados fora da busca.</p>' +
      `<label><input type="checkbox" data-curriculum-inspected${approval.inspected ? " checked" : ""}${approval.busy || !completeness?.complete || approval.pending ? " disabled" : ""}> Inspecionei esta versão do mapa completo.</label>` +
      `<button class="course-authoring-icon-action" type="button" data-curriculum-approve data-curriculum-key="approve"` +
      ` aria-label="${approvalLabel}" title="${approvalLabel}"` +
      `${approval.busy || !approval.pending && (!approval.inspected || !completeness?.complete || curriculumMapStatus === "approved") ? " disabled" : ""}>${renderUiIcon(approval.pending ? "rotate" : "ready-state", "course-authoring-button-icon")}</button>` +
      `<p data-curriculum-approval-status role="status">${escapeHtml(approval.message || "")}</p></section>` : "") + '</section>';
}

/** Binds native disclosures without re-rendering the map or replacing its focused element. */
export function bindCourseCurriculumMap(root, {
  scrollRoot = root, onNavigate, onStateChange = () => {}, initialState = null,
  onOpenContext, onInspectionChange, onApprove
} = {}) {
  bindings.get(root)?.destroy();
  let destroyed = false;
  let navigationFocusKey = "";
  const search = root.querySelector?.("[data-curriculum-query]");
  const pendingFilter = root.querySelector?.("[data-curriculum-pending-only]");
  let query = initialState?.query || search?.value || "";
  let pendingOnly = initialState?.pendingOnly === true;
  let unfilteredExpansion = null;
  const normalizeSearch = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
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
      expansion: unfilteredExpansion || disclosures().filter((node) => node.open).map((node) => node.dataset.curriculumExpansion),
      query, pendingOnly,
      position: {
        anchorKey: anchor?.dataset.curriculumKey || "",
        offset: anchor ? anchor.getBoundingClientRect().top - viewportTop : 0,
        scrollTop: Number(scrollRoot.scrollTop) || 0,
        scrollLeft: Number(scrollRoot.scrollLeft) || 0,
        focusKey: focusKey || ""
      }
    };
  }

  function filterMap() {
    if (!search) return;
    const needle = normalizeSearch(query);
    const filtering = Boolean(needle || pendingOnly);
    if (filtering && unfilteredExpansion === null) unfilteredExpansion = disclosures().filter(node => node.open).map(node => node.dataset.curriculumExpansion);
    search.value = query;
    pendingFilter?.setAttribute("aria-pressed", String(pendingOnly));
    const nodes = [...root.querySelectorAll("[data-curriculum-node]")];
    const queryMatches = node => !needle || normalizeSearch(node.dataset.curriculumSearchText).includes(needle);
    const pendingMatches = node => !pendingOnly || node.dataset.curriculumPending === "true";
    const ownMatches = node => queryMatches(node) && pendingMatches(node);
    for (const node of nodes) {
      const ancestors = [];
      let parent = node.parentElement?.closest("[data-curriculum-node]");
      while (parent && root.contains(parent)) { ancestors.push(parent); parent = parent.parentElement?.closest("[data-curriculum-node]"); }
      const descendants = [...node.querySelectorAll("[data-curriculum-node]")];
      node.hidden = filtering && ![node, ...ancestors, ...descendants].some(ownMatches);
      if (filtering && !node.hidden) node.querySelector(":scope > .course-curriculum-map-node > details, :scope > details")?.setAttribute("open", "");
    }
    if (!filtering && unfilteredExpansion !== null) {
      const previous = new Set(unfilteredExpansion);
      unfilteredExpansion = null;
      disclosures().forEach(node => { node.open = previous.has(node.dataset.curriculumExpansion); });
    }
    const status = root.querySelector("[data-curriculum-search-status]");
    if (status) {
      status.hidden = !filtering;
      status.textContent = nodes.some(node => !node.hidden) ? "Resultados no mapa. Limpe os filtros para consultar todos os ramos." : "Nenhum ramo ou item corresponde aos filtros.";
    }
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
    const context = event.target.closest?.("[data-curriculum-context]");
    if (context && root.contains(context) && typeof onOpenContext === "function") {
      event.preventDefault();
      navigationFocusKey = context.dataset.curriculumKey;
      onStateChange(captureState());
      onOpenContext({ action: context.dataset.curriculumContext, targetKind: context.dataset.targetKind,
        targetId: context.dataset.targetId, targetLabel: context.dataset.targetLabel, button: context });
      return;
    }
    if (event.target.closest?.("[data-curriculum-pending-only]") && pendingFilter) {
      pendingOnly = !pendingOnly; filterMap(); onStateChange(captureState()); return;
    }
    const approval = event.target.closest?.("[data-curriculum-approve]");
    if (approval && !approval.disabled && typeof onApprove === "function") {
      event.preventDefault(); onStateChange(captureState()); onApprove(); return;
    }
    const destination = event.target.closest?.("a[data-curriculum-navigate]");
    if (!destination || !root.contains(destination) || event.defaultPrevented ||
        event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
        typeof onNavigate !== "function") return;
    event.preventDefault();
    navigationFocusKey = destination.dataset.curriculumKey;
    onStateChange(captureState());
    onNavigate(destination.getAttribute("href"), { returnTo: root.dataset.curriculumReturn });
  }

  function handleInput(event) {
    if (!event.target.matches?.("[data-curriculum-query]")) return;
    query = event.target.value; filterMap(); onStateChange(captureState());
  }
  function handleChange(event) {
    if (event.target.matches?.("[data-curriculum-inspected]")) onInspectionChange?.(event.target.checked);
  }

  root.addEventListener("toggle", handleToggle, true);
  root.addEventListener("click", handleClick);
  root.addEventListener("input", handleInput);
  root.addEventListener("change", handleChange);
  filterMap();
  const binding = {
    captureState,
    restorePosition,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener("toggle", handleToggle, true);
      root.removeEventListener("click", handleClick);
      root.removeEventListener("input", handleInput);
      root.removeEventListener("change", handleChange);
      if (bindings.get(root) === binding) bindings.delete(root);
    }
  };
  bindings.set(root, binding);
  return binding;
}
