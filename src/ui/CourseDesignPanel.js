import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { formatDesignValue, renderDesignValueInput } from "./courseDesignControls.js";
import { renderCourseAuthoringProfiles } from "./CourseAuthoringProfiles.js";

const ORIGIN_LABELS = Object.freeze({
  system_default: "Calibração contextual pendente",
  automatic: "Escolha automática",
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

function renderParameterInspection(design, definition, resolution, {
  appliedParameters, appliedFailure = ""
} = {}) {
  const effective = resolution.effectiveAssignment;
  const currentScope = design.scopeContext.current;
  const source = sourceScopeLabel(design, effective.sourceScope);
  const automatic = effective.mode === "automatic";
  const mode = automatic
    ? "Automático: escolher e justificar conforme o contexto da próxima produção."
    : `Fixo: ${formatDesignValue(definition, effective.value)}.`;
  const origin = effective.inherited
    ? `Herdado de ${source} · ${originLabel(effective.origin)}.`
    : `${originLabel(effective.origin)}${effective.sourceScope ? ` · ${source}` : ""}.`;
  const scope = `${SCOPE_LABELS[currentScope.kind]}: ${currentScope.label}.`;
  let applied;
  if (currentScope.kind !== "study_unit") {
    applied = '<p>O registro de produção é inspecionado em cada Unidade de estudo. Neste alcance, os ajustes orientam os escopos abaixo, preservando suas exceções.</p>';
  } else if (appliedFailure) {
    applied = `<p role="status">Não foi possível consultar o registro desta produção. ${escapeHtml(appliedFailure)}</p>`;
  } else if (appliedParameters === undefined) {
    applied = '<p role="status">Consultando o registro desta produção…</p>';
  } else {
    const parameter = appliedParameters?.find(item => item.parameterId === definition.id);
    if (!parameter) {
      applied = '<p>Não há valor aplicado registrado para este parâmetro nesta unidade. A configuração atual não preenche esse histórico.</p>';
    } else {
      const valuesEqual = JSON.stringify(Array.isArray(effective.value) ? [...effective.value].sort() : effective.value)
        === JSON.stringify(Array.isArray(parameter.value) ? [...parameter.value].sort() : parameter.value);
      const relation = automatic
        ? "Essa escolha descreve a produção existente; o modo automático permite uma nova escolha contextual."
        : valuesEqual ? "O valor coincide com a configuração atual; isso não comprova que o conteúdo a realiza adequadamente."
          : "O valor aplicado difere da configuração atual. Salvar um ajuste não atualiza esta produção.";
      applied = `<p><strong>Aplicado nesta produção:</strong> ${escapeHtml(formatDesignValue(definition, parameter.value))}.</p>` +
        `<p>${escapeHtml(originLabel(parameter.origin))}${parameter.sourceScope ? ` · ${escapeHtml(sourceScopeLabel(design, parameter.sourceScope))}` : ""}.</p>` +
        `<p><strong>Motivo registrado:</strong> ${escapeHtml(parameter.reason || "Não há justificativa registrada para esta produção.")}</p>` +
        `<p>${relation}</p>`;
    }
  }
  return '<details class="course-design-explanation"><summary>Definição e origem</summary>' +
    `<p><strong>O que regula:</strong> ${escapeHtml(definition.operationalization)}</p>` +
    `<p><strong>Onde se aplica:</strong> ${escapeHtml(scope)}</p>` +
    `<p><strong>Configuração atual:</strong> ${escapeHtml(mode)}</p><p>${escapeHtml(origin)}</p>` +
    `<p><strong>Por que esta configuração:</strong> ${escapeHtml(effective.reason || "Não há justificativa registrada.")}</p>` +
    applied + `<p><strong>O que muda ao salvar:</strong> a orientação para a próxima produção ou revisão solicitada. O conteúdo existente só muda quando uma alteração de conteúdo é aplicada explicitamente.</p>` +
    `<p><strong>Limites:</strong> ${escapeHtml(definition.limitations)}</p></details>`;
}

function renderParameterCard(design, definition, resolution, busy, { editing = false,
  appliedParameters, appliedFailure = "" } = {}) {
  const local = resolution.localAssignment;
  const effective = resolution.effectiveAssignment;
  const supported = definition.supportedScopes.includes(design.scopeContext.current.kind);
  const draftValue = local ? local.value : effective.value;
  const automatic = (local || effective).mode === "automatic";
  const source = sourceScopeLabel(design, effective.sourceScope);
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
      "A configuração e o registro de produção continuam inspecionáveis neste escopo.</p></div>";
  if (editing) return `<section class="course-design-parameter-editor" data-parameter-id="${escapeHtml(definition.id)}">` +
    `<h3>${escapeHtml(definition.label)}</h3><p>${escapeHtml(definition.construct)}</p>` +
    renderParameterInspection(design, definition, resolution, { appliedParameters, appliedFailure }) +
    '<p class="course-design-context-note">Salvar ajusta a orientação; não reescreve as unidades nem a explicação já produzidas.</p>' +
    editor + '</section>';
  return `<article class="course-design-parameter" data-parameter-id="${escapeHtml(definition.id)}">` +
    '<header tabindex="0"><div>' +
    `<h3>${escapeHtml(definition.label)}</h3><p class="course-authoring-visually-hidden">Configuração atual</p></div>` +
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

function renderInstructionalContext(state) {
  const context = state.designInstructionalContext;
  if (!context) return '<p role="status">Consultando a base, a revisão e os vínculos instrucionais desta microssequência…</p>';
  const entity = context.entity;
  const reviewLabels = { unregistered: "Sem declaração de revisão", draft: "Sem declaração de revisão", current: "Revisão atual", stale: "Revisão desatualizada" };
  const basis = context.basis;
  const units = basis?.studyUnits || [];
  const declarations = units.flatMap(unit => unit.declaration ? [unit.declaration] : []);
  const analysisRefs = new Set(declarations.flatMap(value => [...value.introducedInstructionalAnalysisUnitIds,
    ...value.usedInstructionalAnalysisUnitIds, ...value.explanationApplications.map(item => item.instructionalAnalysisUnitId)]));
  const evidenceRefs = new Set(declarations.flatMap(value => value.practiceApplications.map(item => item.evidenceRequirementId)));
  const intendedAnalysis = new Set(state.courseDesign.targetPlanItems?.instructionalAnalysisUnitIds || []);
  const intendedEvidence = new Set(state.courseDesign.targetPlanItems?.evidenceRequirementIds || []);
  const inventory = (items, intended, selected, label) => `<section><h3>${label}</h3>` +
    (items.length ? `<ul>${items.map(item => `<li><strong>${escapeHtml(item.statement)}</strong>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}` +
      `<p>${intended.has(item.ref) ? "Previsto na intenção corrente desta microssequência." : "Sem vínculo na intenção corrente desta microssequência."}</p>` +
      `<p>${selected.has(item.ref) ? "Vinculado ao desenho aplicado nas unidades deste recorte." : "Inventário do curso; vínculo aplicado não registrado neste recorte."}</p></li>`).join("")}</ul>` : '<p>Nenhum item consta nesta leitura do inventário do curso.</p>') + '</section>';
  const plan = entity?.content?.explanationPlan;
  return '<section class="course-design-instructional-context" aria-label="Base, análise e evidência da microssequência">' +
    (context.errors.length ? `<div role="status">${context.errors.map(error => `<p>${escapeHtml(error)}</p>`).join("")}</div>` : "") +
    '<section><h3>Base explicativa</h3>' + (entity ? `<p>${entity.content?.explanation ? "Há uma base explicativa salva." : "A microssequência ainda não tem base explicativa salva."}</p>` : '<p>O estado da base não pôde ser confirmado.</p>') +
    `<p>${context.review ? escapeHtml(reviewLabels[context.review.state]) : "O estado da revisão não pôde ser confirmado."}</p>` +
    (plan ? `<details><summary>Intenção da base</summary><p>${escapeHtml(plan.purpose)}</p>` +
      (plan.prerequisites.length ? `<h4>Pressupostos</h4><ul>${plan.prerequisites.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : "") +
      (plan.relations.length ? `<h4>Relações</h4><ul>${plan.relations.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : "") + '</details>' : "") +
    '<p>A configuração corrente orienta próximas produções. O registro de qual base sustentou uma produção pertence à unidade que a utilizou.</p></section>' +
    (basis ? inventory(basis.analysisUnits, intendedAnalysis, analysisRefs, "Unidades de análise instrucional") +
      inventory(basis.evidenceRequirements, intendedEvidence, evidenceRefs, "Requisitos de evidência") +
      `<p>${units.length ? "Os vínculos acima vêm das declarações salvas nas unidades desta microssequência." : "Ainda não há unidades neste recorte para consultar declarações de aplicação."}</p>` : "") + '</section>';
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
  if (design.scopeContext.current.kind === "didactic_microsequence") groups.push({ id: "instruction", label: "Base, análise e evidência" });
  groups.push({ id: "resources", label: "Recursos" }, { id: "profiles", label: "Perfis" });
  const selected = groups.find(group => group.id === state.designCategory) || groups[0];
  const edited = design.definitions.find(definition => definition.id === state.designParameterId);
  const categoryMenu = '<details class="course-design-category-menu"><summary aria-label="Escolher grupo de ajustes" title="Grupos de ajustes">' +
    renderUiIcon("module", "course-authoring-button-icon") + `<span>${escapeHtml(selected.label)}</span></summary>` +
    '<nav aria-label="Grupos de ajustes">' + groups.map(group =>
      `<button type="button" data-course-authoring-action="select-design-category" data-design-category="${escapeHtml(group.id)}"` +
      `${group.id === selected.id ? ' aria-current="page"' : ""}>${escapeHtml(group.label)}</button>`).join("") + '</nav></details>';
  const content = edited ? renderParameterCard(design, edited,
    design.parameters.find(parameter => parameter.parameterId === edited.id), state.designBusy, { editing: true, appliedParameters: state.designAppliedParameters, appliedFailure: state.designAppliedFailure }) :
    selected.id === "instruction" ? renderInstructionalContext(state) :
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
