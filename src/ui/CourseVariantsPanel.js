import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../domain/courseDesignParameters.js";
import { createUuid } from "../domain/identifiers.js";
import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function errorText(error) { return String(error?.message || "Não foi possível concluir a operação."); }
function quantity(value, singular, plural) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}
const integerParameters = COURSE_DESIGN_PARAMETER_DEFINITIONS.filter(({ valueSchema }) => valueSchema.type === "integer");
const parameterById = new Map(COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => [definition.id, definition]));

function parameterLabel(parameterId) {
  return parameterById.get(parameterId)?.label || parameterId;
}

function policySummary(policy) {
  if (!policy) return "Sem diferença de componentes declarada.";
  const allowed = Array.isArray(policy.allowedRefs) ? policy.allowedRefs.length : 0;
  const excluded = Array.isArray(policy.excludedRefs) ? policy.excludedRefs.length : 0;
  const preferred = Array.isArray(policy.preferredRefs) ? policy.preferredRefs.length : 0;
  return policy.availability === "allow_only"
    ? `${quantity(allowed, "componente permitido", "componentes permitidos")}` +
      `${preferred ? ` · ${quantity(preferred, "preferido", "preferidos")}` : ""}.`
    : `Todos disponíveis${excluded ? ` · ${quantity(excluded, "excluído", "excluídos")}` : ""}` +
      `${preferred ? ` · ${quantity(preferred, "preferido", "preferidos")}` : ""}.`;
}

function differenceValue(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);
}

function materializationStatusLabel(status) {
  return ({
    not_started: "não iniciada", running: "em andamento",
    completed: "concluída", failed: "com falha"
  })[status] || status;
}

function renderComparisonDifference(item, labels) {
  const owner = labels.get(item.courseId) || "Curso";
  const values = item.expectedValue === null && item.actualValue === null ? "" :
    '<small>Esperado: ' + escapeHtml(differenceValue(item.expectedValue)) +
    ' · observado: ' + escapeHtml(differenceValue(item.actualValue)) + '</small>';
  return '<li><strong>' + escapeHtml(owner) + ' · ' + escapeHtml(item.key) +
    '</strong><br>' + escapeHtml(item.explanation) + (values ? '<br>' + values : '') + '</li>';
}

function renderComparisonDifferenceGroup(title, items, labels, emptyText) {
  return '<section class="course-variants-difference-group"><h3>' + escapeHtml(title) + '</h3>' +
    (items.length ? '<ul class="course-variants-differences">' + items.map((item) =>
      renderComparisonDifference(item, labels)).join("") + '</ul>' :
      '<p>' + escapeHtml(emptyText) + '</p>') + '</section>';
}

function renderMemberFacts(member) {
  const materialization = member.materialization;
  return '<p>' + quantity(materialization.plannedPartCount, 'Parte planejada', 'Partes planejadas') + ' · ' +
    quantity(materialization.notStartedPartCount, 'não iniciada', 'não iniciadas') + ' · ' +
    materialization.runningPartCount + ' em andamento · ' +
    quantity(materialization.completedPartCount, 'concluída', 'concluídas') + ' · ' +
    quantity(materialization.studyUnitCount, 'Unidade', 'Unidades') + '.</p>' +
    '<p>' + quantity(member.references.sourceCount, 'Fonte', 'Fontes') + ' · ' +
    quantity(member.references.anchorCount, 'Âncora', 'Âncoras') + ' · ' +
    quantity(member.references.pdfCount, 'PDF', 'PDFs') +
    (member.references.sharedPdfCount
      ? ' · ' + quantity(member.references.sharedPdfCount, 'PDF compartilhado', 'PDFs compartilhados') +
        ' sem duplicar o arquivo'
      : '') + '.</p>' +
    '<details class="course-variants-facts"><summary>Parâmetros e política efetivos</summary>' +
    '<ul class="course-variants-differences">' + member.effectiveParameters.map((parameter) =>
      '<li><strong>' + escapeHtml(parameterLabel(parameter.parameterId)) + '</strong> (' +
      escapeHtml(parameter.scopeKind) + ': ' + escapeHtml(parameter.scopeId) + '): ' +
      escapeHtml(differenceValue(parameter.value)) + '</li>').join("") + '</ul>' +
    '<ul class="course-variants-differences">' + member.effectiveComponentPolicies.map((entry) =>
      '<li><strong>Política efetiva</strong> (' + escapeHtml(entry.scopeKind) + ': ' +
      escapeHtml(entry.scopeId) + '): ' + escapeHtml(policySummary(entry.policy)) + '</li>'
    ).join("") + '</ul>' +
    '<p><strong>Componentes usados:</strong> ' +
    escapeHtml(member.componentsUsed.length ? member.componentsUsed.join(", ") : "nenhum") + '.</p></details>' +
    '<details class="course-variants-facts"><summary>Partes e Unidades desta revisão</summary>' +
    (materialization.parts.length ? '<ol class="course-variants-fact-list">' + materialization.parts.map((part) =>
      '<li><strong>' + escapeHtml(part.title) + '</strong> · ' +
      'versão ' + part.version + ' · ' + escapeHtml(materializationStatusLabel(part.status)) +
      (part.materializationVersion === null ? '' : ' · materialização ' + part.materializationVersion) +
      ' · ' + quantity(part.studyUnitCount, 'Unidade', 'Unidades') + '</li>'
    ).join("") + '</ol>' : '<p>Nenhuma Parte ativa.</p>') +
    (materialization.studyUnits.length ? '<ul class="course-variants-fact-list">' + materialization.studyUnits.map((unit) =>
      '<li><strong>' + escapeHtml(unit.title) + '</strong> · versão ' + unit.version + ' · ' + escapeHtml(unit.parentMicrosequenceId) +
      (unit.componentRefs.length ? '<br><small>' + escapeHtml(unit.componentRefs.join(", ")) + '</small>' : '') + '</li>'
    ).join("") + '</ul>' : '<p>Nenhuma Unidade materializada nesta variante.</p>') +
    (materialization.truncated.studyUnits ? '<p>A lista mostra as primeiras 64 Unidades; a contagem acima é total.</p>' : '') +
    '</details>';
}

function renderList(state) {
  const items = state.list?.items || [];
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-authoring-section-title">Variantes</h2>' +
    '<p>Cursos independentes a partir do mesmo planejamento.</p></div>' +
    '<button type="button" data-course-variants-action="create" aria-label="Criar variantes" title="Criar variantes">' +
    renderUiIcon("add", "course-authoring-button-icon") + '</button></header>' +
    (state.loading ? '<p class="course-authoring-loading" role="status">Carregando variantes…</p>' :
      items.length ? '<div class="course-variants-list">' + items.map((item) =>
        '<article class="course-authoring-card"><div><h3>Planejamento compartilhado</h3>' +
        `<p>${quantity(item.attachedCount, "variante vinculada", "variantes vinculadas")} · ` +
        `${quantity(item.detachedCount, "desvinculada", "desvinculadas")}</p></div>` +
        (item.attachedCount >= 2
          ? `<button type="button" data-course-variants-action="open" data-set-id="${escapeHtml(item.comparisonSetId)}">Comparar</button>`
          : '<p class="course-authoring-form-hint">A comparação exige duas variantes ativas.</p>') + '</article>'
      ).join("") + '</div>' : '<p class="course-authoring-empty-copy">Nenhuma comparação criada neste Curso.</p>') +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") +
    '</section>';
}

function renderComponentPolicyDifference(state, index) {
  if (!state.componentCatalog) {
    return state.componentCatalogLoading
      ? '<p class="course-authoring-form-hint">Carregando o catálogo de componentes…</p>'
      : '<p class="course-authoring-form-hint">A variante pode ser criada só com a diferença de parâmetro. O catálogo de componentes não ficou disponível.</p>';
  }
  return '<details class="course-variants-policy"><summary>Também restringir componentes desta variante</summary>' +
    '<p class="course-authoring-form-hint">Se marcar esta opção, selecione ao menos um componente permitido. A política completa pode ser refinada depois em Parâmetros.</p>' +
    `<label><input type="checkbox" name="policy-enabled-${index}" value="true"> Restringir aos componentes selecionados</label>` +
    '<div class="course-design-component-list">' + state.componentCatalog.options.map((option) =>
      '<label class="course-design-component-option"><input type="checkbox" name="policy-allowed-' + index +
      '" value="' + escapeHtml(option.ref) + '"><span><strong>' + escapeHtml(option.label) +
      '</strong><small>' + escapeHtml(option.purpose) + '</small></span></label>'
    ).join("") + '</div></details>';
}

function renderVariantFields(state, index) {
  const label = String.fromCharCode(65 + index);
  const definition = integerParameters[index % integerParameters.length];
  const baseline = index === 0;
  return '<fieldset><legend>' + (baseline ? 'Base A' : 'Variante ' + label) + '</legend><label>Rótulo<input name="label-' + index + '" maxlength="80" required value="' + label + '"></label>' +
    `<label>Título<input name="title-${index}" maxlength="300" required value="${escapeHtml(state.course.title)}: ${label}"></label>` +
    `<label>Objetivo<textarea name="goal-${index}" maxlength="2000" required>${escapeHtml(state.course.goal)}</textarea></label>` +
    (baseline ? '<p class="course-authoring-form-hint">Referência inicial: mantém os parâmetros e componentes do Curso de origem.</p>' :
      '<label>Parâmetro que muda<select name="parameter-id-' + index + '">' + integerParameters.map((candidate) =>
        `<option value="${escapeHtml(candidate.id)}"${candidate.id === definition.id ? " selected" : ""}>${escapeHtml(candidate.label)}</option>`).join("") + '</select></label>' +
      '<label>Valor desta variante<input name="parameter-value-' + index + '" type="number" min="' + definition.valueSchema.minimum +
      '" max="' + definition.valueSchema.maximum + '" value="' + definition.valueSchema.minimum + '" required></label>' +
      '<label>Por que essa diferença é intencional?<textarea name="rationale-' + index + '" maxlength="1000" required></textarea></label>' +
      renderComponentPolicyDifference(state, index)) + '</fieldset>';
}

function renderCreate(state) {
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-authoring-section-title">Criar variantes</h2>' +
    '<p>Os Cursos começam com o mesmo planejamento e uma diferença declarada.</p></div>' +
    '<button type="button" data-course-variants-action="back" aria-label="Voltar" title="Voltar">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button></header>' +
    '<form class="course-authoring-write-form" data-course-variants-create>' +
    '<label>Quantidade de variantes<select name="variant-count" data-course-variants-count>' + [2,3,4,5,6,7,8].map((count) =>
      `<option value="${count}"${count === state.variantCount ? " selected" : ""}>${count}</option>`).join("") + '</select></label>' +
    Array.from({ length: state.variantCount }, (_, index) => renderVariantFields(state, index)).join("") +
    `<button type="submit"${state.busy ? " disabled" : ""}>Criar e comparar</button></form>` +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") + '</section>';
}

function renderComparison(state) {
  const comparison = state.comparison;
  const labels = new Map(comparison.members.map((member) => [member.courseId, member.label]));
  labels.set(comparison.source.courseId, "Origem");
  const checkpointPlan = comparison.planning.snapshot?.plan || comparison.planning.snapshot;
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-authoring-section-title">Comparação</h2>' +
    `<p>${comparison.source.changedSinceCheckpoint ? "A origem mudou desde o checkpoint." : "A origem corresponde ao checkpoint."}</p></div>` +
    '<button type="button" data-course-variants-action="back" aria-label="Voltar" title="Voltar">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button></header>' +
    '<div class="course-variants-list"><article class="course-authoring-card course-variants-source"><div><h3>Planejamento comum</h3>' +
      '<p>Checkpoint do Curso na revisão ' + comparison.planning.courseRevision +
      ' · plano ' + comparison.planning.planVersion + '.</p>' +
      (checkpointPlan?.objective ? '<p><strong>Objetivo:</strong> ' + escapeHtml(checkpointPlan.objective) + '</p>' : '') +
      (checkpointPlan?.audience ? '<p><strong>Público:</strong> ' + escapeHtml(checkpointPlan.audience) + '</p>' : '') +
      '</div></article><article class="course-authoring-card course-variants-source"><div><h3>Origem: ' +
      escapeHtml(comparison.source.title) + '</h3><p>Revisão atual ' + comparison.source.currentCourseRevision +
      ' · checkpoint ' + comparison.source.checkpointCourseRevision + '.</p></div>' +
      '<button type="button" data-course-variants-action="visit" data-course-id="' + escapeHtml(comparison.source.courseId) + '">Abrir origem</button></article>' +
      comparison.members.map((member) =>
      '<article class="course-authoring-card"><div><h3>' +
      (member.position === 0 ? 'Referência · ' : '') + escapeHtml(member.label) + ': ' + escapeHtml(member.title) + '</h3>' +
      `<p>Revisão vinculada ${member.attachedCourseRevision} · revisão atual ${member.currentCourseRevision}. ` +
      `${member.changedSinceAttached ? "Mudou desde o vínculo." : "Sem mudança desde o vínculo."}</p>` +
      renderMemberFacts(member) +
      (member.parameterDifferences.length ? '<ul class="course-variants-differences">' + member.parameterDifferences.map((difference) =>
        '<li><strong>' + escapeHtml(parameterLabel(difference.parameterId)) + ':</strong> ' +
        escapeHtml(differenceValue(difference.value)) + '<br><small>' + escapeHtml(difference.rationale) + '</small></li>'
      ).join("") + '</ul>' : '<p>Sem diferença de parâmetro declarada.</p>') +
      '<p>' + escapeHtml(policySummary(member.componentPolicyDifference)) + '</p></div>' +
      '<div class="course-variants-actions"><button type="button" data-course-variants-action="visit" data-course-id="' + escapeHtml(member.courseId) + '">Abrir Curso</button>' +
      `<button type="button" data-course-variants-action="detach" data-course-id="${escapeHtml(member.courseId)}">Desvincular</button></div>` +
      '</article>').join("") + '</div>' +
    '<div class="course-variants-comparison-differences" aria-label="Diferenças da comparação">' +
      renderComparisonDifferenceGroup("Diferenças declaradas", comparison.differences.declared, labels, "Nenhuma diferença declarada.") +
      renderComparisonDifferenceGroup("Observadas conforme declarado", comparison.differences.observedExpected, labels, "Nenhuma diferença declarada pôde ser confirmada nesta revisão.") +
      renderComparisonDifferenceGroup("Desvios não declarados", comparison.differences.accidentalDeviations, labels, "Nenhum desvio não declarado foi detectado.") +
      renderComparisonDifferenceGroup("Diferenças factuais", comparison.differences.factual, labels, "Partes, Unidades e componentes não apresentam diferença factual.") +
      renderComparisonDifferenceGroup("Dados ausentes ou incompletos", comparison.differences.missingData, labels, "Não há dados ausentes nesta comparação.") +
    '</div>' +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") + '</section>';
}

export function createCourseVariantsPanel({ root, controller, course, onCourseRevisionChange = () => undefined, onOpenCourse = () => undefined, confirmValue = globalThis.confirm } = {}) {
  if (!root || !controller || !course?.courseId || !Number.isSafeInteger(course.revision)) throw new TypeError("Painel de variantes inválido.");
  const state = { course, list: null, comparison: null, screen: "list", variantCount: 2, loading: false, busy: false, failure: "", componentCatalog: null, componentCatalogLoading: false };
  const render = () => { root.innerHTML = state.screen === "create" ? renderCreate(state) : state.screen === "comparison" && state.comparison ? renderComparison(state) : renderList(state); };
  const refreshList = async () => {
    state.loading = true; state.failure = ""; render();
    try { state.list = await controller.listCourseVariantComparisons(state.course.courseId, state.course.revision); }
    catch (error) { state.failure = errorText(error); }
    finally { state.loading = false; render(); }
  };
  const openComparison = async (comparisonSetId) => {
    state.loading = true; state.failure = ""; render();
    try { state.comparison = await controller.loadCourseVariantComparison(state.course.courseId, { comparisonSetId, expectedCourseRevision: state.course.revision }); state.screen = "comparison"; }
    catch (error) { state.failure = errorText(error); }
    finally { state.loading = false; render(); }
  };
  const loadComponentCatalog = async () => {
    if (state.componentCatalog || state.componentCatalogLoading || typeof controller.loadCourseDesign !== "function") return;
    state.componentCatalogLoading = true; render();
    try {
      const design = await controller.loadCourseDesign(state.course.courseId, {
        scope: { kind: "course", ref: state.course.courseId }, limit: 1, cursor: null
      });
      if (design?.componentCatalog?.version && Array.isArray(design.componentCatalog.options)) {
        state.componentCatalog = design.componentCatalog;
      }
    } catch {
      // A diferença de parâmetro continua suficiente para criar uma comparação segura.
    } finally { state.componentCatalogLoading = false; render(); }
  };
  const onClick = (event) => {
    const node = event.target?.closest?.("[data-course-variants-action]"); if (!node) return;
    const action = node.dataset.courseVariantsAction;
    if (action === "create") { state.screen = "create"; state.failure = ""; render(); void loadComponentCatalog(); }
    else if (action === "back") { state.screen = "list"; state.comparison = null; void refreshList(); }
    else if (action === "open") void openComparison(node.dataset.setId);
    else if (action === "visit") onOpenCourse(node.dataset.courseId);
    else if (action === "detach" && state.comparison && confirmValue?.("Desvincular esta variante sem apagar o Curso?")) {
      void (async () => { state.busy = true; render(); try { await controller.mutateCourseVariants({ requestId: createUuid(), courseId: state.course.courseId, command: { type: "detach_comparison_variant", comparisonSetId: state.comparison.comparisonSetId, courseId: node.dataset.courseId } }); state.comparison = null; state.screen = "list"; await refreshList(); } catch (error) { state.failure = errorText(error); } finally { state.busy = false; render(); } })();
    }
  };
  const onChange = (event) => {
    if (event.target?.matches?.("[data-course-variants-count]")) {
      const count = Number(event.target.value);
      if (Number.isSafeInteger(count) && count >= 2 && count <= 8) { state.variantCount = count; render(); }
    }
  };
  const onSubmit = (event) => {
    if (!event.target?.matches?.("[data-course-variants-create]")) return; event.preventDefault();
    const values = new FormData(event.target); const comparisonSetId = createUuid();
    const invalidPolicy = Array.from({ length: state.variantCount - 1 }, (_, offset) => offset + 1)
      .some((index) => values.get(`policy-enabled-${index}`) === "true" &&
        (!state.componentCatalog || values.getAll(`policy-allowed-${index}`).length === 0));
    if (invalidPolicy) {
      state.failure = "Selecione ao menos um componente permitido ou desmarque a restrição desta variante.";
      render();
      return;
    }
    const command = { type: "create_comparison_variants", comparisonSetId, expectedCourseRevision: state.course.revision, variants: Array.from({ length: state.variantCount }, (_, index) => ({
      label: values.get(`label-${index}`), title: values.get(`title-${index}`), goal: values.get(`goal-${index}`),
      parameterDifferences: index === 0 ? [] : [{ scopeKind: "course", scopeId: "course", parameterId: values.get(`parameter-id-${index}`), value: Number(values.get(`parameter-value-${index}`)), rationale: values.get(`rationale-${index}`) }],
      componentPolicyDifference: index === 0 || values.get(`policy-enabled-${index}`) !== "true" ? null : {
        catalogVersion: state.componentCatalog?.version,
        availability: "allow_only",
        allowedRefs: values.getAll(`policy-allowed-${index}`),
        excludedRefs: [],
        preferredRefs: []
      }
    })) };
    void (async () => { state.busy = true; state.failure = ""; render(); try { await controller.mutateCourseVariants({ requestId: createUuid(), courseId: state.course.courseId, expectedCourseRevision: state.course.revision, command }); state.comparison = await controller.loadCourseVariantComparison(state.course.courseId, { comparisonSetId, expectedCourseRevision: state.course.revision }); state.screen = "comparison"; onCourseRevisionChange(state.course.revision); } catch (error) { state.failure = errorText(error); } finally { state.busy = false; render(); } })();
  };
  root.addEventListener("click", onClick); root.addEventListener("change", onChange); root.addEventListener("submit", onSubmit);
  return { open: refreshList, refresh: refreshList, destroy() { root.removeEventListener("click", onClick); root.removeEventListener("change", onChange); root.removeEventListener("submit", onSubmit); root.innerHTML = ""; } };
}
