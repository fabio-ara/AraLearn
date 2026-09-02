import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";

const ORIGIN_LABELS = Object.freeze({
  system_default: "Padrão do produto",
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
  study_unit: "StudyUnit"
});

const VALUE_LABELS = Object.freeze({
  plain_definition: "Definição em linguagem direta",
  concrete_example: "Exemplo concreto",
  mechanism: "Mecanismo",
  contrast: "Contraste",
  application_condition: "Condição de aplicação",
  limit_or_exception: "Limite ou exceção",
  worked_example: "Exemplo resolvido",
  representation_link: "Relação entre representações",
  case_or_data: "Caso ou dado",
  context: "Contexto",
  task_feature: "Característica da tarefa",
  external_representation: "Representação externa",
  support_level: "Nível de apoio"
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

function formatValue(value) {
  if (!Array.isArray(value)) return String(value);
  return value.map((item) => VALUE_LABELS[item] || item).join(" · ");
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
    return current
      ? `<span aria-current="page">${escapeHtml(scope.label)}</span>`
      : `<a href="${escapeHtml(scopeRoute(design.courseId, scope))}"` +
        ' data-course-authoring-action="change-design-scope"' +
        ` data-scope-kind="${scope.kind}" data-scope-ref="${escapeHtml(scope.ref)}">` +
        `${escapeHtml(scope.label)}</a>`;
  }).join('<span aria-hidden="true">›</span>');
  const childKind = context.children[0]?.kind || null;
  const selector = context.children.length
    ? '<form class="course-design-scope-selector" data-course-design-scope>' +
      `<label for="course-design-child-scope">Abrir ${escapeHtml(
        (SCOPE_LABELS[childKind] || "subescopo").toLocaleLowerCase("pt-BR")
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
  const contextualNote = ["didactic_microsequence", "study_unit"].includes(context.current.kind)
    ? "As StudyUnits desta Microssequência usam estes valores. Cada Unidade preserva a configuração usada na produção."
    : "Escolha um escopo para consultar o valor vigente e, quando necessário, sobrescrever ou restaurar a herança.";
  return '<section class="course-design-scope" aria-labelledby="course-design-scope-title">' +
    '<div><p id="course-design-scope-title">Escopo atual</p>' +
    `<strong>${escapeHtml(SCOPE_LABELS[context.current.kind])}: ` +
    `${escapeHtml(context.current.label)}</strong>` +
    `<span class="course-design-context-note">${escapeHtml(contextualNote)}</span></div>` +
    `<nav aria-label="Caminho do escopo">${breadcrumbs}</nav>${selector}${more}</section>`;
}

function renderParameterInput(definition, value, { disabled = false } = {}) {
  if (definition.valueSchema.type === "integer") {
    return `<label for="course-design-value-${escapeHtml(definition.id)}">Valor</label>` +
      `<input id="course-design-value-${escapeHtml(definition.id)}" name="parameterValue"` +
      ` type="number" min="${definition.valueSchema.minimum}" max="${definition.valueSchema.maximum}"` +
      ` required value="${escapeHtml(value)}"${disabled ? " disabled" : ""}>`;
  }
  const selected = new Set(value);
  return '<fieldset class="course-design-value-options"' + (disabled ? " disabled" : "") +
    '><legend>Valores exigidos</legend>' + definition.valueSchema.allowedValues.map((allowed) =>
      '<label><input type="checkbox" name="parameterValue"' +
      ` value="${escapeHtml(allowed)}"${selected.has(allowed) ? " checked" : ""}>` +
      `<span>${escapeHtml(VALUE_LABELS[allowed] || allowed)}</span></label>`).join("") + "</fieldset>";
}

function renderParameterCard(design, definition, resolution, busy) {
  const local = resolution.localAssignment;
  const effective = resolution.effectiveAssignment;
  const supported = definition.supportedScopes.includes(design.scopeContext.current.kind);
  const draftValue = local?.value ?? effective.value;
  const source = sourceScopeLabel(design, effective.sourceScope);
  const resolutionLabel = local
    ? `${originLabel(effective.origin)} · sobrescrito neste escopo`
    : effective.inherited
      ? `Herdado de ${source} · ${originLabel(effective.origin)}`
      : `${originLabel(effective.origin)} · ${source}`;
  const editor = supported
    ? '<form class="course-design-parameter-form" data-course-design-parameter>' +
      `<input type="hidden" name="parameterId" value="${escapeHtml(definition.id)}">` +
      renderParameterInput(definition, draftValue) +
      `<label for="course-design-origin-${escapeHtml(definition.id)}">Origem</label>` +
      `<select id="course-design-origin-${escapeHtml(definition.id)}" name="origin" required>` +
      formOriginOptions(local?.origin === "research_condition" ? local.origin : "author", {
        allowAutomatic: false
      }) + "</select>" +
      `<label for="course-design-reason-${escapeHtml(definition.id)}">Justificativa</label>` +
      `<textarea id="course-design-reason-${escapeHtml(definition.id)}" name="reason" maxlength="1000"` +
      ` rows="3" required>${escapeHtml(local?.reason || "")}</textarea>` +
      '<div class="course-design-form-actions"><button type="submit" aria-label="Salvar neste escopo" title="Salvar neste escopo"' +
      `${busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
      '<button type="reset" class="is-secondary" aria-label="Descartar alterações" title="Descartar alterações">' +
      `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` +
      (local
        ? '<button type="button" class="is-secondary" data-course-authoring-action="clear-design-parameter"' +
          ` data-parameter-id="${escapeHtml(definition.id)}" aria-label="Restaurar herança" title="Restaurar herança"${busy ? " disabled" : ""}>` +
          `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>`
        : "") + "</div></form>"
    : '<div class="course-design-disabled-editor" aria-disabled="true"><p>' +
      "Parâmetros pedagógicos não são definidos em Módulo. O valor herdado continua visível; " +
      "selecione Curso, Lição ou Microssequência para alterá-lo.</p>" +
      '<fieldset disabled><legend>Valor herdado</legend>' +
      renderParameterInput(definition, effective.value, { disabled: true }) + "</fieldset></div>";
  return `<article class="course-design-parameter" data-parameter-id="${escapeHtml(definition.id)}">` +
    '<header><div>' +
    `<h3>${escapeHtml(definition.label)}</h3><p>Valor vigente</p></div>` +
    `<strong>${escapeHtml(formatValue(effective.value))}</strong></header>` +
    '<dl class="course-design-resolution"><div>' +
    '<dt class="course-authoring-visually-hidden">Origem e escopo</dt>' +
    `<dd>${escapeHtml(resolutionLabel)}</dd></div></dl>` +
    `<details><summary class="course-authoring-icon-action" aria-label="Ajustar ${escapeHtml(
      definition.label
    )}" title="Ajustar ${escapeHtml(definition.label)}">` +
    renderUiIcon("edit", "course-authoring-button-icon") + "</summary>" +
    `<p class="course-design-reason">${escapeHtml(effective.reason)}</p>` +
    `<div class="course-design-parameter-explanation"><p>${escapeHtml(definition.construct)}</p>` +
    `<p><strong>Como é aplicado:</strong> ${escapeHtml(definition.operationalization)}</p>` +
    `<p><strong>Limite:</strong> ${escapeHtml(definition.limitations)}</p></div>${editor}</details></article>`;
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
    '<p>Extensão, parágrafos, títulos e estilo. Nunca comprime nem remove conteúdo necessário; quando preciso, distribui em mais StudyUnits.</p></div></header>' + stack +
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


function renderTargetPlanItemList(label, items) {
  return '<section class="course-design-target-group">' +
    `<h4>${escapeHtml(label)}</h4>` +
    (items.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item.statement)}</li>`).join("")}</ul>`
      : "<p>Nenhum item deste tipo foi definido no Planejamento.</p>") +
    "</section>";
}

function renderTargetPlanItems(state, design) {
  if (design.scopeContext.current.kind !== "didactic_microsequence") return "";
  if (state.planningLoading && !state.authoringPlan) {
    return '<section class="course-design-targets"><h3>Cobertura planejada</h3>' +
      '<p role="status">Carregando itens do Planejamento…</p></section>';
  }
  const plan = state.authoringPlan?.plan;
  if (!plan) {
    return '<section class="course-design-targets"><h3>Cobertura planejada</h3>' +
      `<p role="alert">${escapeHtml(state.planningFailure ||
        "Não foi possível carregar os itens do Planejamento.")}</p>` +
      '<button type="button" data-course-authoring-action="retry-planning" aria-label="Tentar novamente" title="Tentar novamente">' +
      `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>` +
      "</section>";
  }
  const targets = design.targetPlanItems;
  const analysis = new Set(targets.instructionalAnalysisUnitIds);
  const evidence = new Set(targets.evidenceRequirementIds);
  const assignedAnalysis = plan.instructionalAnalysisUnits.filter(({ id }) => analysis.has(id));
  const assignedEvidence = plan.evidenceRequirements.filter(({ id }) => evidence.has(id));
  return '<section class="course-design-targets" aria-labelledby="course-design-targets-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-targets-title">' +
    'Cobertura planejada desta Microssequência</h3>' +
    '<p>Definida no planejamento da Parte.</p></div></header>' +
    '<div class="course-design-target-groups">' +
    renderTargetPlanItemList(
      "Unidades de análise instrucional",
      assignedAnalysis
    ) +
    renderTargetPlanItemList(
      "Requisitos de evidência",
      assignedEvidence
    ) + "</div></section>";
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
  if (state.designLoading && !state.courseDesign) {
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
  return '<section class="course-authoring-section course-design"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Parâmetros, direção editorial e componentes</h2>' +
    (state.designMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.designMessage)}</p>`
      : "") +
    (state.designFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.designFailure)}</p>`
      : "") +
    renderScopeContext(design) +
    '<section class="course-design-parameters" aria-labelledby="course-design-parameters-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-parameters-title">Parâmetros pedagógicos</h3>' +
    '<p>Quatro decisões educacionais, separadas da direção editorial.</p></div></header>' +
    design.definitions.map((definition, index) => renderParameterCard(
      design,
      definition,
      design.parameters[index],
      state.designBusy
    )).join("") + "</section>" +
    renderTargetPlanItems(state, design) +
    renderGuidance(design, state.designBusy) +
    renderComponentPolicy(design, state.designBusy) +
    "</section>";
}
