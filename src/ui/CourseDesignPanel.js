import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { formatDesignValue, renderDesignValueInput } from "./courseDesignControls.js";
import { renderCourseAuthoringProfiles } from "./CourseAuthoringProfiles.js";

const ORIGIN_LABELS = Object.freeze({
  system_default: "Calibração contextual pendente",
  automatic: "Escolha automática explicada",
  author: "Definido pelo autor",
  research_condition: "Condição de pesquisa",
  migration: "Importada"
});

const SCOPE_LABELS = Object.freeze({
  course: "Curso",
  module: "Módulo",
  lesson: "Lição",
  didactic_microsequence: "Microssequência didática",
  study_unit: "Unidade de estudo"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function scopeRoute(courseId, scope) {
  const options = { section: "parameters" };
  if (scope.kind === "module") options.moduleId = scope.ref;
  if (scope.kind === "lesson") options.lessonId = scope.ref;
  if (scope.kind === "didactic_microsequence") {
    options.didacticMicrosequenceId = scope.ref;
  }
  if (scope.kind === "study_unit") options.studyUnitId = scope.ref;
  return buildCourseAuthoringRoute(courseId, options);
}

function sourceScopeLabel(design, scope) {
  if (!scope) return "Produto";
  const path = [...design.scopeContext.ancestors, design.scopeContext.current];
  return path.find((candidate) =>
    candidate.kind === scope.kind && candidate.ref === scope.ref)?.label || SCOPE_LABELS[scope.kind];
}

function originLabel(origin) {
  return ORIGIN_LABELS[origin] || origin;
}

function formOriginOptions(selected = "author", { allowAutomatic = true } = {}) {
  const origins = allowAutomatic
    ? ["author", "automatic", "research_condition"]
    : ["author", "research_condition"];
  return origins.map((origin) =>
    `<option value="${origin}"${origin === selected ? " selected" : ""}>` +
      `${escapeHtml(originLabel(origin))}</option>`).join("");
}

function renderScopeContext(design) {
  const context = design.scopeContext;
  const breadcrumbs = [...context.ancestors, context.current].map((scope, index, path) => {
    const current = index === path.length - 1;
    const label = `<small>${escapeHtml(SCOPE_LABELS[scope.kind])}</small><span>${escapeHtml(scope.label)}</span>`;
    const entry = current
      ? `<span aria-current="page">${label}</span>`
      : `<a href="${escapeHtml(scopeRoute(design.courseId, scope))}"` +
        ' data-course-authoring-action="change-design-scope"' +
        ` data-scope-kind="${scope.kind}" data-scope-ref="${escapeHtml(scope.ref)}">` +
        `${label}</a>`;
    return `<li style="--scope-depth:${index}">${entry}</li>`;
  }).join("");
  const childKind = context.children[0]?.kind || null;
  const selector = context.children.length
    ? '<form class="course-design-scope-selector" data-course-design-scope>' +
      `<label for="course-design-child-scope">Abrir ${escapeHtml(
        childKind === "study_unit"
          ? SCOPE_LABELS[childKind]
          : (SCOPE_LABELS[childKind] || "subescopo").toLocaleLowerCase("pt-BR")
      )}</label>` +
      `<input type="hidden" name="scopeKind" value="${escapeHtml(childKind)}">` +
      '<div><select id="course-design-child-scope" name="scopeRef" required>' +
      '<option value="">Selecione…</option>' +
      context.children.map((scope) =>
        `<option value="${escapeHtml(scope.ref)}">${escapeHtml(scope.label)}</option>`).join("") +
      '</select><button type="submit" aria-label="Abrir escopo" title="Abrir escopo">' +
      renderUiIcon("arrow-right", "course-authoring-button-icon") + "</button></div></form>"
    : '<span class="course-design-scope-leaf">Escopo final</span>';
  const more = context.hasMoreChildren
    ? '<button type="button" class="course-design-load-scopes"' +
      ' data-course-authoring-action="load-more-design-scopes" aria-label="Carregar mais escopos"' +
      ' title="Carregar mais escopos">' + renderUiIcon("arrow-down", "course-authoring-button-icon") + "</button>"
    : "";
  return '<details class="course-design-scope"><summary title="Alterar alcance dos ajustes">' +
    renderUiIcon("intent", "course-authoring-button-icon") +
    `<span><small>Alcance dos ajustes · ${escapeHtml(SCOPE_LABELS[context.current.kind])}</small>` +
    `<strong>${escapeHtml(context.current.label)}</strong></span></summary>` +
    '<div class="course-design-scope-target"><p id="course-design-scope-title">Aplicar em</p>' +
    `<strong>${escapeHtml(SCOPE_LABELS[context.current.kind])}: ` +
    `${escapeHtml(context.current.label)}</strong>` +
    '<span class="course-design-context-note">Orienta a próxima produção. Exceções locais são preservadas.</span></div>' +
    `<nav aria-label="Caminho do escopo"><ol>${breadcrumbs}</ol></nav>${selector}${more}</details>`;
}

function renderParameterCard(design, definition, resolution, busy, { editing = false } = {}) {
  const local = resolution.localAssignment;
  const effective = resolution.effectiveAssignment;
  const supported = definition.supportedScopes.includes(design.scopeContext.current.kind);
  const draftValue = local ? local.value : effective.value;
  const automatic = (local || effective).mode === "automatic";
  const source = sourceScopeLabel(design, effective.sourceScope);
  const resolutionLabel = effective.inherited
    ? `Herdado de ${source} · ${originLabel(effective.origin)}`
    : local ? `${originLabel(effective.origin)} · definido neste escopo`
      : `${originLabel(effective.origin)} · ${source}`;
  const displayedOrigin = effective.mode === "automatic" && effective.value !== null
    ? "Valor aplicado · decisão automática"
    : effective.inherited ? `Herdado de ${source}`
      : local ? "Definido neste escopo" : "";
  const editor = supported
    ? '<form class="course-design-parameter-form" data-course-design-parameter data-design-value-owner>' +
      `<input type="hidden" name="parameterId" value="${escapeHtml(definition.id)}">` +
      `<label for="course-design-mode-${definition.id}">Decisão neste escopo</label>` +
      `<select id="course-design-mode-${definition.id}" name="mode" data-design-mode>` +
      `<option value="fixed"${automatic ? "" : " selected"}>Fixar valor</option>` +
      `<option value="automatic"${automatic ? " selected" : ""}>Automático pelo contexto</option></select>` +
      '<p class="course-design-reason">Automático: a IA escolhe e justifica antes de produzir.</p>' +
      `<div class="course-design-fixed-values" data-design-values${automatic ? " hidden" : ""}>` +
      renderDesignValueInput(definition, draftValue, { disabled: automatic }) +
      `<label for="course-design-origin-${escapeHtml(definition.id)}">Origem</label>` +
      `<select id="course-design-origin-${escapeHtml(definition.id)}" name="origin" required>` +
      formOriginOptions(local?.origin === "research_condition" ? local.origin : "author", {
        allowAutomatic: false
      }) + "</select></div>" +
      `<label for="course-design-reason-${escapeHtml(definition.id)}">Justificativa</label>` +
      `<textarea id="course-design-reason-${escapeHtml(definition.id)}" name="reason" maxlength="1000"` +
      ` rows="3" required>${escapeHtml(local?.reason || "")}</textarea>` +
      '<div class="course-design-form-actions">' +
      '<button type="button" class="is-secondary" data-course-authoring-action="clear-design-parameter"' +
      ` data-parameter-id="${escapeHtml(definition.id)}" aria-label="Restaurar herança" title="Restaurar herança"${busy || !local ? " disabled" : ""}>` +
      `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>` +
      '<button type="reset" class="is-secondary" aria-label="Descartar alterações" title="Descartar alterações">' +
      `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` +
      '<button type="submit" aria-label="Salvar neste escopo" title="Salvar neste escopo"' +
      `${busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button></div></form>`
    : '<div class="course-design-disabled-editor" aria-disabled="true"><p>' +
      `Ajuste disponível em: ${escapeHtml(definition.supportedScopes.map((kind) => SCOPE_LABELS[kind]).join(", "))}. ` +
      "O valor herdado continua visível neste escopo.</p></div>";
  if (editing) return `<section class="course-design-parameter-editor" data-parameter-id="${escapeHtml(definition.id)}">` +
    `<h3>${escapeHtml(definition.label)}</h3>${editor}` +
    '<details class="course-design-explanation"><summary>Definição e origem</summary>' +
    `<p>${escapeHtml(definition.construct)}</p><p>${escapeHtml(definition.operationalization)}</p>` +
    `<p>${escapeHtml(definition.limitations)}</p><p>${escapeHtml(resolutionLabel)}</p>` +
    `<p>${escapeHtml(effective.reason)}</p></details></section>`;
  return `<article class="course-design-parameter" data-parameter-id="${escapeHtml(definition.id)}">` +
    '<header tabindex="0"><div>' +
    `<h3>${escapeHtml(definition.label)}</h3><p class="course-authoring-visually-hidden">Valor vigente</p></div>` +
    `<strong>${escapeHtml(effective.value === null ? "Automático" : formatDesignValue(definition, effective.value))}</strong>` +
    (displayedOrigin ? `<small class="course-design-value-origin">${escapeHtml(displayedOrigin)}</small>` : "") + '</header>' +
    `<button type="button" data-course-authoring-action="edit-design-parameter" data-parameter-id="${escapeHtml(definition.id)}" class="course-authoring-icon-action" aria-label="Ajustar ${escapeHtml(
      definition.label
    )}" title="Ajustar ${escapeHtml(definition.label)}">` +
    renderUiIcon("edit", "course-authoring-button-icon") + "</button></article>";
}

function renderParameterGroup(design, busy, {
  group,
  titleId,
  title,
  description
}) {
  const cards = design.definitions.flatMap((definition) =>
    definition.group === group
      ? [renderParameterCard(design, definition, design.parameters.find((item) => item.parameterId === definition.id), busy)]
      : []
  ).join("");
  return `<section class="course-design-parameters" aria-labelledby="${titleId}">` +
    `<header class="course-design-subheading"><div><h3 id="${titleId}">${title}</h3>` +
    (description ? `<p>${description}</p>` : "") + `</div></header>${cards}</section>`;
}

function renderGuidanceAssignmentCopy(assignment) {
  return `<blockquote>${escapeHtml(assignment.guidance)}</blockquote>` +
    `<p class="course-design-reason">${escapeHtml(assignment.reason)}</p>`;
}

function renderGuidance(design, busy) {
  const guidance = design.guidance;
  const stack = guidance.effectiveAssignments.length
    ? '<ol class="course-design-guidance-stack">' + guidance.effectiveAssignments.map((assignment) =>
      '<li><article><header><span>' +
      `${escapeHtml(sourceScopeLabel(design, assignment.sourceScope))}</span>` +
      `<small>${escapeHtml(originLabel(assignment.origin))}</small></header>` +
      renderGuidanceAssignmentCopy(assignment) + "</article></li>").join("") + "</ol>"
    : '<p class="course-design-empty-copy">Nenhuma direção editorial foi definida no caminho deste escopo.</p>';
  const local = guidance.localAssignment;
  return '<section class="course-design-guidance" aria-labelledby="course-design-guidance-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-guidance-title">Direção editorial</h3>' +
    '</div></header>' + stack +
    '<details class="course-design-local-editor"><summary class="course-authoring-icon-action"' +
    ` aria-label="${local ? "Editar" : "Adicionar"} direção editorial neste escopo"` +
    ` title="${local ? "Editar" : "Adicionar"} direção editorial neste escopo">` +
    renderUiIcon(local ? "edit" : "add", "course-authoring-button-icon") + "</summary>" +
    '<form data-course-design-guidance>' +
    '<label>Direção editorial<textarea name="guidance" maxlength="8192" rows="5" required>' +
    `${escapeHtml(local?.guidance || "")}</textarea></label>` +
    '<label>Origem da decisão<select name="origin" required>' +
    formOriginOptions(local && local.origin !== "migration" ? local.origin : "author") + "</select></label>" +
    '<label>Justificativa<textarea name="reason" maxlength="1000" rows="3" required>' +
    `${escapeHtml(local?.reason || "")}</textarea></label>` +
    '<div class="course-design-form-actions"><button type="submit" aria-label="Salvar direção editorial" title="Salvar direção editorial"' +
    `${busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
    (local
      ? `<button type="button" class="is-secondary" data-course-authoring-action="clear-design-guidance"` +
        ` aria-label="Restaurar herança" title="Restaurar herança"${busy ? " disabled" : ""}>` +
        `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>`
      : "") + "</div></form></details></section>";
}

function renderComponentPolicy(design, busy) {
  const catalog = design.componentCatalog;
  const local = design.componentPolicy.localAssignment;
  const effective = design.componentPolicy.effectiveAssignment;
  const draft = local?.policy || effective.policy;
  const allowed = new Set(draft.allowedRefs);
  const excluded = new Set(draft.excludedRefs);
  const preferred = new Set(draft.preferredRefs);
  const components = catalog.options.map((option) =>
    '<article class="course-design-component-option"><div><strong>' +
    `${escapeHtml(option.label)}</strong><span>${escapeHtml(option.purpose)}</span></div>` +
    '<div class="course-design-component-choices">' +
    `<label><input type="checkbox" name="allowedRefs" value="${escapeHtml(option.ref)}"` +
    `${allowed.has(option.ref) ? " checked" : ""}><span>Permitir</span></label>` +
    `<label><input type="checkbox" name="excludedRefs" value="${escapeHtml(option.ref)}"` +
    `${excluded.has(option.ref) ? " checked" : ""}><span>Excluir</span></label>` +
    `<label><input type="checkbox" name="preferredRefs" value="${escapeHtml(option.ref)}"` +
    `${preferred.has(option.ref) ? " checked" : ""}><span>Preferir</span></label>` +
    "</div></article>").join("");
  const availability = effective.policy.availability === "all"
    ? "Todos os componentes do catálogo"
    : `${effective.policy.allowedRefs.length} componentes permitidos`;
  return '<section class="course-design-policy" aria-labelledby="course-design-policy-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-policy-title">Componentes</h3></div></header>' +
    '<div class="course-design-policy-summary"><strong>' + escapeHtml(availability) + "</strong>" +
    `<span>${escapeHtml(originLabel(effective.origin))} · ${escapeHtml(
      sourceScopeLabel(design, effective.sourceScope)
    )}</span><small>${effective.policy.excludedRefs.length} excluídos · ` +
    `${effective.policy.preferredRefs.length} preferidos</small></div>` +
    `<p class="course-design-reason">${escapeHtml(effective.reason)}</p>` +
    '<details><summary class="course-authoring-icon-action" aria-label="Ajustar componentes neste escopo"' +
    ' title="Ajustar componentes neste escopo">' +
    renderUiIcon("edit", "course-authoring-button-icon") + "</summary>" +
    '<form data-course-design-policy><label>Disponibilidade<select name="availability" required>' +
    `<option value="all"${draft.availability === "all" ? " selected" : ""}>Todos</option>` +
    `<option value="allow_only"${draft.availability === "allow_only" ? " selected" : ""}>Somente a seleção permitida</option>` +
    "</select></label>" +
    `<div class="course-design-component-list">${components}</div>` +
    '<label>Origem da decisão<select name="origin" required>' +
    formOriginOptions(local?.origin || "author") + "</select></label>" +
    '<label>Justificativa<textarea name="reason" maxlength="1000" rows="3" required>' +
    `${escapeHtml(local?.reason || "")}</textarea></label>` +
    '<div class="course-design-form-actions"><button type="submit" aria-label="Salvar componentes" title="Salvar componentes"' +
    `${busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
    (local
      ? `<button type="button" class="is-secondary" data-course-authoring-action="clear-design-policy"` +
        ` aria-label="Restaurar herança" title="Restaurar herança"${busy ? " disabled" : ""}>` +
        `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>`
      : "") + "</div></form></details></section>";
}


function renderDesignStatus({ kind, title, message, retry = false }) {
  return `<section class="course-authoring-state is-${escapeHtml(kind)}" role="${
    kind === "error" ? "alert" : "status"
  }">${renderUiIcon(kind === "error" ? "offline" : "progress", "course-authoring-state-icon")}` +
    `<h2>${escapeHtml(title)}</h2>${message ? `<p>${escapeHtml(message)}</p>` : ""}` +
    (retry
      ? '<button type="button" data-course-authoring-action="retry-design" aria-label="Tentar novamente" title="Tentar novamente">' +
        `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>`
      : "") + "</section>";
}

export function renderCourseDesignPanel(state) {
  if ((state.designLoading || state.loading) && !state.courseDesign) {
    return renderDesignStatus({
      kind: "status",
      title: "Carregando parâmetros",
      message: ""
    });
  }
  if (!state.courseDesign) {
    return renderDesignStatus({
      kind: "error",
      title: "Parâmetros indisponíveis",
      message: state.designFailure || "Não foi possível carregar este escopo.",
      retry: true
    });
  }
  const design = state.courseDesign;
  const conflicts = design.parameters.flatMap((parameter) => parameter.conflicts.map((conflict) => ({
    ...conflict, parameterId: parameter.parameterId
  })));
  const groups = [...new Map(design.definitions.map(definition => [definition.group, definition.groupLabel]))]
    .map(([id, label]) => ({ id, label }));
  groups.push({ id: "resources", label: "Recursos" }, { id: "profiles", label: "Perfis" });
  const selected = groups.find(group => group.id === state.designCategory) || groups[0];
  const edited = design.definitions.find(definition => definition.id === state.designParameterId);
  const categoryMenu = '<details class="course-design-category-menu"><summary aria-label="Escolher grupo de ajustes" title="Grupos de ajustes">' +
    renderUiIcon("module", "course-authoring-button-icon") + `<span>${escapeHtml(selected.label)}</span></summary>` +
    '<nav aria-label="Grupos de ajustes">' + groups.map(group =>
      `<button type="button" data-course-authoring-action="select-design-category" data-design-category="${escapeHtml(group.id)}"` +
      `${group.id === selected.id ? ' aria-current="page"' : ""}>${escapeHtml(group.label)}</button>`).join("") + '</nav></details>';
  const content = edited ? renderParameterCard(design, edited,
    design.parameters.find(parameter => parameter.parameterId === edited.id), state.designBusy, { editing: true }) :
    selected.id === "resources" ? renderComponentPolicy(design, state.designBusy) :
    selected.id === "profiles" ? renderCourseAuthoringProfiles({ ...state, profilesOpen: true }) :
    renderParameterGroup(design, state.designBusy, { group: selected.id,
      titleId: `course-design-${selected.id}-parameters-title`, title: escapeHtml(selected.label) }) +
      (selected.id === "editorial" ? renderGuidance(design, state.designBusy) : "");
  return '<section class="course-authoring-section course-design"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Parâmetros, direção editorial e componentes</h2>' +
    '<div class="course-design-settings-nav">' + renderScopeContext(design) +
    '<div class="course-design-group-heading">' +
    (edited ? '<button class="course-authoring-icon-action" type="button" data-course-authoring-action="design-group-back" aria-label="Voltar aos ajustes" title="Voltar aos ajustes">' +
      renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button><span>' + escapeHtml(selected.label) + '</span>' : categoryMenu) +
    '</div></div><div class="course-design-feedback" aria-live="polite">' +
    (state.designMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.designMessage)}</p>`
      : "") +
    (state.designFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.designFailure)}</p>`
      : "") +
    (state.pendingDesignCommands?.size && !state.designBusy ? '<button class="course-authoring-icon-action" type="button" data-course-authoring-action="retry-design-mutation" aria-label="Repetir gravação" title="Repetir gravação">' + renderUiIcon("rotate", "course-authoring-button-icon") + '</button>' : "") +
    '</div><div class="course-design-settings-body">' +
    (conflicts.length ? '<aside class="course-authoring-notice is-error" role="alert">' +
      'Resolva as exceções incompatíveis antes de produzir ou aplicar um perfil.' +
      '<ul>' + conflicts.map((conflict) => `<li>${escapeHtml(design.definitions.find((item) => item.id === conflict.parameterId)?.label)} · ` +
        `<a href="${escapeHtml(scopeRoute(design.courseId, conflict.exceptionScope))}">Abrir ${escapeHtml(SCOPE_LABELS[conflict.exceptionScope.kind])}</a></li>`).join("") + '</ul></aside>' : "") +
    content + "</div></section>";
}
