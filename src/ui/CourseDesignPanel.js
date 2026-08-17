import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";

const ORIGIN_LABELS = Object.freeze({
  system_default: "Padrão do produto",
  automatic: "Escolha automática explicada",
  author: "Definido pelo autor",
  research_condition: "Condição de pesquisa",
  migration: "Migrada do planejamento"
});

const SCOPE_LABELS = Object.freeze({
  course: "Curso",
  module: "Módulo",
  lesson: "Lição",
  didactic_microsequence: "Microssequência didática"
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

const DIRECTIVE_LABELS = Object.freeze({
  require: "Exigir",
  avoid: "Evitar",
  prefer: "Preferir"
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

function formOriginOptions(selected = "author") {
  return ["author", "automatic", "research_condition"].map((origin) =>
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
    : '<p class="course-design-scope-leaf">Este é o escopo didático mais específico.</p>';
  const more = context.hasMoreChildren
    ? '<button type="button" class="course-design-load-scopes"' +
      ' data-course-authoring-action="load-more-design-scopes">Carregar mais escopos</button>'
    : "";
  return '<section class="course-design-scope" aria-labelledby="course-design-scope-title">' +
    '<div><p id="course-design-scope-title">Escopo atual</p>' +
    `<strong>${escapeHtml(SCOPE_LABELS[context.current.kind])}: ` +
    `${escapeHtml(context.current.label)}</strong></div>` +
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
  const editor = supported
    ? '<form class="course-design-parameter-form" data-course-design-parameter>' +
      `<input type="hidden" name="parameterId" value="${escapeHtml(definition.id)}">` +
      renderParameterInput(definition, draftValue) +
      `<label for="course-design-origin-${escapeHtml(definition.id)}">Origem da decisão</label>` +
      `<select id="course-design-origin-${escapeHtml(definition.id)}" name="origin" required>` +
      formOriginOptions(local?.origin || "author") + "</select>" +
      `<label for="course-design-reason-${escapeHtml(definition.id)}">Por que usar este valor?</label>` +
      `<textarea id="course-design-reason-${escapeHtml(definition.id)}" name="reason" maxlength="1000"` +
      ` rows="3" required>${escapeHtml(local?.reason || "")}</textarea>` +
      '<div class="course-design-form-actions"><button type="submit"' +
      `${busy ? " disabled" : ""}>Salvar neste escopo</button>` +
      (local
        ? '<button type="button" class="is-secondary" data-course-authoring-action="clear-design-parameter"' +
          ` data-parameter-id="${escapeHtml(definition.id)}"${busy ? " disabled" : ""}>` +
          "Restaurar herança</button>"
        : "") + "</div></form>"
    : '<div class="course-design-disabled-editor" aria-disabled="true"><p>' +
      "Parâmetros pedagógicos não são definidos em Módulo. O valor herdado continua visível; " +
      "selecione Curso, Lição ou Microssequência para alterá-lo.</p>" +
      '<fieldset disabled><legend>Valor herdado</legend>' +
      renderParameterInput(definition, effective.value, { disabled: true }) + "</fieldset></div>";
  return `<article class="course-design-parameter" data-parameter-id="${escapeHtml(definition.id)}">` +
    '<header><div><p>Hipótese operacional do produto</p>' +
    `<h3>${escapeHtml(definition.label)}</h3></div>` +
    `<strong>${escapeHtml(formatValue(effective.value))}</strong></header>` +
    '<dl class="course-design-resolution"><div><dt>Origem</dt>' +
    `<dd>${escapeHtml(originLabel(effective.origin))}</dd></div>` +
    `<div><dt>Fonte</dt><dd>${escapeHtml(source)}</dd></div></dl>` +
    `<p class="course-design-reason">${escapeHtml(effective.reason)}</p>` +
    '<details><summary>Entender e ajustar</summary>' +
    `<div class="course-design-parameter-explanation"><p>${escapeHtml(definition.construct)}</p>` +
    `<p><strong>Como é aplicado:</strong> ${escapeHtml(definition.operationalization)}</p>` +
    `<p><strong>Limite:</strong> ${escapeHtml(definition.limitations)}</p></div>${editor}</details></article>`;
}

function renderInterpretation(interpretation) {
  if (!interpretation) {
    return '<p class="course-design-empty-copy">Ainda não há interpretação estruturada para esta revisão.</p>';
  }
  const value = interpretation.interpretation;
  const directives = value.directives.length
    ? '<ul class="course-design-directives">' + value.directives.map((directive) =>
      `<li><strong>${escapeHtml(DIRECTIVE_LABELS[directive.kind])}:</strong> ` +
      `${escapeHtml(directive.statement)}</li>`).join("") + "</ul>"
    : "";
  const divergences = value.divergences.length
    ? '<div><h5>Divergências</h5><ul>' + value.divergences.map((item) =>
      `<li>${escapeHtml(item)}</li>`).join("") + "</ul></div>"
    : "";
  const questions = value.questions.length
    ? '<div><h5>Perguntas em aberto</h5><ul>' + value.questions.map((item) =>
      `<li>${escapeHtml(item)}</li>`).join("") + "</ul></div>"
    : "";
  return '<div class="course-design-interpretation"><h5>Interpretação estruturada</h5>' +
    `<p>${escapeHtml(value.summary)}</p>${directives}${divergences}${questions}</div>`;
}

function directiveLines(interpretation, kind) {
  return interpretation?.interpretation.directives
    .filter((directive) => directive.kind === kind)
    .map((directive) => directive.statement)
    .join("\n") || "";
}

function renderInterpretationForm(revision, busy) {
  const current = revision.currentInterpretation;
  const value = current?.interpretation;
  return '<details class="course-design-interpretation-editor"><summary>' +
    (current ? "Revisar interpretação" : "Interpretar separadamente") + "</summary>" +
    '<form data-course-design-interpretation>' +
    `<input type="hidden" name="guidanceRevisionId" value="${escapeHtml(revision.revisionId)}">` +
    '<label>Resumo estruturado<textarea name="summary" maxlength="1000" rows="3" required>' +
    `${escapeHtml(value?.summary || "")}</textarea></label>` +
    '<p class="course-design-form-hint">Uma diretiva por linha; o texto original acima não será alterado.</p>' +
    '<label>Exigir<textarea name="requireDirectives" maxlength="8015" rows="3">' +
    `${escapeHtml(directiveLines(current, "require"))}</textarea></label>` +
    '<label>Evitar<textarea name="avoidDirectives" maxlength="8015" rows="3">' +
    `${escapeHtml(directiveLines(current, "avoid"))}</textarea></label>` +
    '<label>Preferir<textarea name="preferDirectives" maxlength="8015" rows="3">' +
    `${escapeHtml(directiveLines(current, "prefer"))}</textarea></label>` +
    '<label>Divergências<textarea name="divergences" maxlength="8015" rows="3">' +
    `${escapeHtml(value?.divergences.join("\n") || "")}</textarea></label>` +
    '<label>Perguntas em aberto<textarea name="questions" maxlength="8015" rows="3">' +
    `${escapeHtml(value?.questions.join("\n") || "")}</textarea></label>` +
    `<button type="submit"${busy ? " disabled" : ""}>Salvar interpretação</button>` +
    "</form></details>";
}

function renderGuidance(design, busy) {
  const guidance = design.guidance;
  const stack = guidance.effectiveRevisions.length
    ? '<ol class="course-design-guidance-stack">' + guidance.effectiveRevisions.map((revision) =>
      '<li><article><header><span>' +
      `${escapeHtml(sourceScopeLabel(design, revision.sourceScope))}</span>` +
      `<small>${escapeHtml(originLabel(revision.origin))}</small></header>` +
      `<blockquote>${escapeHtml(revision.guidance)}</blockquote>` +
      `<p class="course-design-reason">${escapeHtml(revision.reason)}</p>` +
      renderInterpretation(revision.currentInterpretation) +
      renderInterpretationForm(revision, busy) + "</article></li>").join("") + "</ol>"
    : '<p class="course-design-empty-copy">Nenhuma orientação foi definida no caminho deste escopo.</p>';
  const local = guidance.localRevision;
  return '<section class="course-design-guidance" aria-labelledby="course-design-guidance-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-guidance-title">Orientação natural</h3>' +
    '<p>Os textos originais se acumulam do Curso até o escopo atual.</p></div></header>' + stack +
    '<details class="course-design-local-editor"><summary>' +
    (local ? "Editar orientação neste escopo" : "Adicionar orientação neste escopo") + "</summary>" +
    '<form data-course-design-guidance>' +
    '<label>Texto original<textarea name="guidance" maxlength="8192" rows="5" required>' +
    `${escapeHtml(local?.guidance || "")}</textarea></label>` +
    '<label>Origem da decisão<select name="origin" required>' +
    formOriginOptions(local && local.origin !== "migration" ? local.origin : "author") + "</select></label>" +
    '<label>Justificativa<textarea name="reason" maxlength="1000" rows="3" required>' +
    `${escapeHtml(local?.reason || "")}</textarea></label>` +
    '<div class="course-design-form-actions"><button type="submit"' +
    `${busy ? " disabled" : ""}>Salvar texto original</button>` +
    (local
      ? `<button type="button" class="is-secondary" data-course-authoring-action="clear-design-guidance"` +
        `${busy ? " disabled" : ""}>Restaurar herança</button>`
      : "") + "</div></form></details></section>";
}

function renderComponentPolicy(design, busy) {
  const catalog = design.componentCatalog;
  const local = design.componentPolicy.localChange;
  const effective = design.componentPolicy.effectiveChange;
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
    '<header class="course-design-subheading"><div><h3 id="course-design-policy-title">Política editorial e técnica</h3>' +
    '<p>Disponibilidade, exclusões e preferências de componentes didáticos.</p></div></header>' +
    '<div class="course-design-policy-summary"><strong>' + escapeHtml(availability) + "</strong>" +
    `<span>${escapeHtml(originLabel(effective.origin))} · ${escapeHtml(
      sourceScopeLabel(design, effective.sourceScope)
    )}</span><small>${effective.policy.excludedRefs.length} excluídos · ` +
    `${effective.policy.preferredRefs.length} preferidos</small></div>` +
    `<p class="course-design-reason">${escapeHtml(effective.reason)}</p>` +
    '<details><summary>Ajustar componentes neste escopo</summary>' +
    '<form data-course-design-policy><label>Disponibilidade<select name="availability" required>' +
    `<option value="all"${draft.availability === "all" ? " selected" : ""}>Todos</option>` +
    `<option value="allow_only"${draft.availability === "allow_only" ? " selected" : ""}>Somente a seleção permitida</option>` +
    "</select></label>" +
    '<p class="course-design-form-hint">Excluir vence permitir. Um componente preferido precisa permanecer permitido e não excluído.</p>' +
    `<div class="course-design-component-list">${components}</div>` +
    '<label>Origem da decisão<select name="origin" required>' +
    formOriginOptions(local?.origin || "author") + "</select></label>" +
    '<label>Justificativa<textarea name="reason" maxlength="1000" rows="3" required>' +
    `${escapeHtml(local?.reason || "")}</textarea></label>` +
    '<div class="course-design-form-actions"><button type="submit"' +
    `${busy ? " disabled" : ""}>Salvar política</button>` +
    (local
      ? `<button type="button" class="is-secondary" data-course-authoring-action="clear-design-policy"` +
        `${busy ? " disabled" : ""}>Restaurar herança</button>`
      : "") + "</div></form></details></section>";
}

function plannedParameter(design, parameterId) {
  return design.parameters.find((parameter) => parameter.parameterId === parameterId)
    ?.effectiveAssignment.value;
}

function labels(values) {
  return values.length ? values.map((value) => VALUE_LABELS[value] || value).join("; ") : "Nenhum";
}

function renderApplicationComparison(design) {
  const application = design.recentApplications[0];
  if (!application) {
    return '<section class="course-design-comparison" aria-labelledby="course-design-comparison-title">' +
      '<header class="course-design-subheading"><div><h3 id="course-design-comparison-title">Planejado × aplicado</h3>' +
      '<p>Somente fatos persistidos de materialização aparecem aqui.</p></div></header>' +
      '<p class="course-design-empty-copy">Nenhuma aplicação factual foi registrada neste escopo.</p></section>';
  }
  const componentLabels = new Map(design.componentCatalog.options.map((option) => [option.ref, option.label]));
  const ceiling = plannedParameter(
    design,
    "new_analysis_unit_ceiling_per_expository_study_unit"
  );
  const explanationForms = plannedParameter(design, "required_explanation_forms");
  const practiceMinimum = plannedParameter(
    design,
    "minimum_distinct_practice_opportunities_per_evidence_requirement"
  );
  const variationDimensions = plannedParameter(design, "required_practice_variation_dimensions");
  return '<section class="course-design-comparison" aria-labelledby="course-design-comparison-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-comparison-title">Planejado × aplicado</h3>' +
    '<p>Última aplicação registrada para este escopo.</p></div></header>' +
    '<p class="course-design-comparison-warning">A comparação descreve o que foi registrado. ' +
    "Ela não mede qualidade, aprendizagem nem conformidade quando o fato agregado não basta.</p>" +
    '<dl><div><dt>Unidades de análise</dt><dd><span>Planejado: até ' + escapeHtml(ceiling) +
    " nova(s) por Unidade expositiva.</span><span>Registrado: " +
    `${application.introducedInstructionalAnalysisUnitIds.length} identidade(s) introduzida(s) em ` +
    `${application.studyUnitCount} Unidade(s); ${application.modeCounts.expository} expositiva(s), ` +
    `${application.modeCounts.practice} de prática e ${application.modeCounts.mixed} mista(s).</span></dd></div>` +
    '<div><dt>Formas de explicação</dt><dd><span>Planejado: ' +
    `${escapeHtml(labels(explanationForms))}.</span><span>Registrado: ` +
    `${escapeHtml(labels(application.developedExplanationForms))}.</span></dd></div>` +
    '<div><dt>Prática</dt><dd><span>Planejado: ao menos ' + escapeHtml(practiceMinimum) +
    " oportunidade(s) distinta(s) por requisito de evidência.</span><span>Registrado: " +
    `${application.practiceOpportunityCount} oportunidade(s); variação em ` +
    `${escapeHtml(labels(application.variedDimensions))}. Dimensões planejadas: ` +
    `${escapeHtml(labels(variationDimensions))}.</span></dd></div>` +
    '<div><dt>Componentes</dt><dd><span>Registrado: ' +
    `${escapeHtml(application.componentRefs.length
      ? application.componentRefs.map((ref) => componentLabels.get(ref) || ref).join("; ")
      : "Nenhum")}.</span></dd></div></dl>` +
    `<p class="course-design-context-hash">Contexto selado: ${escapeHtml(application.contextHash)}</p>` +
    "</section>";
}

function renderBoundaries() {
  return '<aside class="course-design-boundaries" aria-label="Fronteiras das políticas">' +
    '<div><strong>Política de produção</strong><p>A faixa preferencial de Partes permanece no ' +
    "Planejamento. Ela não herda pelos escopos didáticos.</p></div>" +
    '<div><strong>Limites técnicos</strong><p>Paginação, tamanho e orçamento protegem o transporte. ' +
    "Eles não são parâmetros pedagógicos e não são editados aqui.</p></div></aside>";
}

function renderTargetPlanItemChoices(label, name, items, selected, disabled) {
  return `<fieldset><legend>${escapeHtml(label)}</legend>` +
    (items.length
      ? `<div class="course-design-target-options">${items.map((item) => (
        `<label><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(item.id)}"` +
        `${selected.has(item.id) ? " checked" : ""}${disabled ? " disabled" : ""}>` +
        `<span>${escapeHtml(item.statement)}</span></label>`
      )).join("")}</div>`
      : "<p>Nenhum item deste tipo foi definido no Planejamento.</p>") + "</fieldset>";
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
      '<button type="button" data-course-authoring-action="retry-planning">Tentar novamente</button>' +
      "</section>";
  }
  const targets = design.targetPlanItems;
  const analysis = new Set(targets.instructionalAnalysisUnitIds);
  const evidence = new Set(targets.evidenceRequirementIds);
  const disabled = state.designBusy === true;
  return '<section class="course-design-targets" aria-labelledby="course-design-targets-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-targets-title">' +
    'Cobertura planejada desta Microssequência</h3><p>Associe somente as unidades de análise e ' +
    'os requisitos de evidência que este alvo deve desenvolver. A materialização sela texto, versão e vínculo.</p>' +
    "</div></header>" +
    '<form data-course-design-target-items>' +
    renderTargetPlanItemChoices(
      "Unidades de análise instrucional",
      "instructionalAnalysisUnitIds",
      plan.instructionalAnalysisUnits,
      analysis,
      disabled
    ) +
    renderTargetPlanItemChoices(
      "Requisitos de evidência",
      "evidenceRequirementIds",
      plan.evidenceRequirements,
      evidence,
      disabled
    ) +
    `<button type="submit"${disabled ? " disabled" : ""}>Salvar cobertura</button></form></section>`;
}

function renderDesignStatus({ kind, title, message, retry = false }) {
  return `<section class="course-authoring-state is-${escapeHtml(kind)}" role="${
    kind === "error" ? "alert" : "status"
  }">${renderUiIcon(kind === "error" ? "offline" : "progress", "course-authoring-state-icon")}` +
    `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>` +
    (retry
      ? '<button type="button" data-course-authoring-action="retry-design">Tentar novamente</button>'
      : "") + "</section>";
}

export function renderCourseDesignPanel(state) {
  if (state.designLoading && !state.courseDesign) {
    return renderDesignStatus({
      kind: "status",
      title: "Carregando parâmetros",
      message: "Consultando somente o escopo selecionado."
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
    '<header class="course-authoring-section-heading"><div>' +
    '<h2 id="course-authoring-section-title">Parâmetros</h2>' +
    '<p>Decisões pedagógicas, orientação e componentes por escopo.</p></div></header>' +
    (state.designMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.designMessage)}</p>`
      : "") +
    (state.designFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.designFailure)}</p>`
      : "") +
    renderScopeContext(design) +
    '<section class="course-design-parameters" aria-labelledby="course-design-parameters-title">' +
    '<header class="course-design-subheading"><div><h3 id="course-design-parameters-title">Parâmetros pedagógicos</h3>' +
    '<p>Os valores iniciais são hipóteses operacionais, não resultados provados pela pesquisa.</p></div></header>' +
    design.definitions.map((definition, index) => renderParameterCard(
      design,
      definition,
      design.parameters[index],
      state.designBusy
    )).join("") + "</section>" +
    renderTargetPlanItems(state, design) +
    renderGuidance(design, state.designBusy) +
    renderComponentPolicy(design, state.designBusy) +
    renderBoundaries() +
    renderApplicationComparison(design) + "</section>";
}
