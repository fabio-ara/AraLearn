import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../domain/courseDesignParameters.js";
import { createUuid } from "../domain/identifiers.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function errorText(error) { return String(error?.message || "Não foi possível concluir a operação."); }
function ambiguousWriteFailure(error) {
  const rawStatus = error?.status ?? error?.response?.status;
  const status = rawStatus == null || rawStatus === "" ? null : Number(rawStatus);
  const code = String(error?.code || error?.response?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  if (error?.ambiguous === true || error?.name === "AbortError" || error?.name === "TimeoutError") {
    return true;
  }
  if (status != null && Number.isFinite(status)) {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  if (status === 409 || code === "course_revision_changed" || code.startsWith("invalid_")) {
    return false;
  }
  return [
    "failed_to_fetch", "gateway_timeout", "network_error", "network_unavailable", "offline",
    "request_timeout", "service_unavailable"
  ].includes(code) || /(?:failed to fetch|fetch failed|network|offline|connection|socket|timeout)/u
    .test(message) || (status == null && !code);
}
function quantity(value, singular, plural) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}
const integerParameters = COURSE_DESIGN_PARAMETER_DEFINITIONS.filter(({ valueSchema }) => valueSchema.type === "integer");
const parameterById = new Map(COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => [definition.id, definition]));

function parameterLabel(parameterId) {
  return parameterById.get(parameterId)?.label || parameterId;
}

function createVariantDraft(course, index) {
  const label = String.fromCharCode(65 + index);
  const definition = integerParameters[index % integerParameters.length];
  return {
    label,
    title: `${String(course.title ?? "")}: ${label}`,
    goal: String(course.goal ?? ""),
    parameterId: definition.id,
    parameterValue: String(definition.valueSchema.minimum),
    rationale: "",
    policyEnabled: false,
    allowedRefs: []
  };
}

function createVariantsDraft(course, variantCount = 2) {
  return {
    variantCount,
    variants: Array.from({ length: variantCount }, (_, index) => createVariantDraft(course, index))
  };
}

function activeVariantsDraft(draft) {
  return {
    variantCount: draft.variantCount,
    variants: structuredClone(draft.variants.slice(0, draft.variantCount))
  };
}

function pendingCreationMatches(pending, draft) {
  return pending != null && JSON.stringify(pending.draft) === JSON.stringify(draft);
}

function resizeVariantsDraft(draft, course, variantCount) {
  const variants = draft.variants.slice();
  while (variants.length < variantCount) variants.push(createVariantDraft(course, variants.length));
  draft.variantCount = variantCount;
  draft.variants = variants;
}

function updateVariantDraftControl(draft, control) {
  const name = String(control?.name || "");
  if (name === "variant-count") return;
  const match = /^(label|title|goal|parameter-id|parameter-value|rationale|policy-enabled|policy-allowed)-(\d+)$/u.exec(name);
  if (!match) return;
  const index = Number(match[2]);
  const variant = draft.variants[index];
  if (!variant) return;
  const field = match[1];
  if (field === "policy-enabled") {
    variant.policyEnabled = Boolean(control.checked);
    return;
  }
  if (field === "policy-allowed") {
    const ref = String(control.value || "");
    const allowed = new Set(variant.allowedRefs);
    if (control.checked) allowed.add(ref);
    else allowed.delete(ref);
    variant.allowedRefs = [...allowed];
    return;
  }
  const property = ({
    label: "label",
    title: "title",
    goal: "goal",
    "parameter-id": "parameterId",
    "parameter-value": "parameterValue",
    rationale: "rationale"
  })[field];
  variant[property] = String(control.value ?? "");
}

function syncVariantsDraftFromForm(draft, form) {
  const values = new FormData(form);
  draft.variants.slice(0, draft.variantCount).forEach((variant, index) => {
    variant.label = String(values.get(`label-${index}`) ?? "");
    variant.title = String(values.get(`title-${index}`) ?? "");
    variant.goal = String(values.get(`goal-${index}`) ?? "");
    if (index === 0) return;
    variant.parameterId = String(values.get(`parameter-id-${index}`) ?? "");
    variant.parameterValue = String(values.get(`parameter-value-${index}`) ?? "");
    variant.rationale = String(values.get(`rationale-${index}`) ?? "");
    variant.policyEnabled = values.get(`policy-enabled-${index}`) === "true";
    variant.allowedRefs = values.getAll(`policy-allowed-${index}`).map(String);
  });
  return values;
}

function captureFocusedControl(root, documentValue) {
  const active = documentValue?.activeElement;
  if (!active || typeof active.name !== "string" || !active.name) return null;
  if (typeof root.contains === "function" && !root.contains(active)) return null;
  return {
    name: active.name,
    selectionStart: Number.isSafeInteger(active.selectionStart) ? active.selectionStart : null,
    selectionEnd: Number.isSafeInteger(active.selectionEnd) ? active.selectionEnd : null
  };
}

function restoreFocusedControl(root, snapshot) {
  if (!snapshot || !/^[a-z0-9-]+$/u.test(snapshot.name)) return;
  const control = root.querySelector?.(`[name="${snapshot.name}"]`);
  control?.focus?.({ preventScroll: true });
  if (snapshot.selectionStart !== null && typeof control?.setSelectionRange === "function") {
    control.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
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

function renderVariantConfirmation(state) {
  const confirmation = state.confirmation;
  if (!confirmation) return "";
  return '<div class="course-authoring-confirm-backdrop" data-course-variants-confirmation-backdrop>' +
    '<section class="course-authoring-confirm-dialog" data-course-variants-confirmation role="alertdialog"' +
    ' aria-modal="true" aria-labelledby="course-variants-confirmation-title"' +
    ' aria-describedby="course-variants-confirmation-message">' +
    '<h2 id="course-variants-confirmation-title">Desvincular variante?</h2>' +
    '<p id="course-variants-confirmation-message">O Curso será preservado e sairá somente desta comparação.</p>' +
    '<div class="course-authoring-confirm-actions">' +
    '<button type="button" class="course-authoring-secondary" data-course-variants-action="cancel-confirmation">' +
    renderUiIcon("remove-state", "course-authoring-button-icon") + '<span>Cancelar</span></button>' +
    '<button type="button" class="is-danger" data-course-variants-action="confirm-detach"' +
    `${state.busy ? " disabled" : ""}>${renderUiIcon("trash", "course-authoring-button-icon")}` +
    '<span>Desvincular</span></button></div></section></div>';
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
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-variants-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-variants-section-title">Variantes</h2></div>' +
    '<button type="button" class="course-authoring-header-action" data-course-variants-action="create"' +
    ' aria-label="Criar variantes" title="Criar variantes">' +
    renderUiIcon("add", "course-authoring-button-icon") + '</button></header>' +
    (state.loading ? '<p class="course-authoring-loading" role="status">Carregando variantes…</p>' :
      items.length ? '<div class="course-variants-list">' + items.map((item) =>
        '<article class="course-authoring-card"><div><h3>Planejamento compartilhado</h3>' +
        `<p>${quantity(item.attachedCount, "variante vinculada", "variantes vinculadas")} · ` +
        `${quantity(item.detachedCount, "desvinculada", "desvinculadas")}</p></div>` +
        (item.attachedCount >= 2
          ? `<button type="button" data-course-variants-action="open" data-set-id="${escapeHtml(item.comparisonSetId)}" aria-label="Comparar variantes" title="Comparar variantes">` +
            `${renderUiIcon("graph", "course-authoring-button-icon")}</button>`
          : '<span class="course-authoring-form-hint">Aguardando outra variante</span>') + '</article>'
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
  const draft = state.createDraft.variants[index];
  const allowedRefs = new Set(draft.allowedRefs);
  return `<details class="course-variants-policy"${draft.policyEnabled || allowedRefs.size ? " open" : ""}><summary>Também restringir componentes desta variante</summary>` +
    `<label><input type="checkbox" name="policy-enabled-${index}" value="true"${draft.policyEnabled ? " checked" : ""}> Restringir aos componentes selecionados</label>` +
    '<div class="course-design-component-list">' + state.componentCatalog.options.map((option) =>
      '<label class="course-design-component-option"><input type="checkbox" name="policy-allowed-' + index +
      '" value="' + escapeHtml(option.ref) + '"' + (allowedRefs.has(option.ref) ? ' checked' : '') + '><span><strong>' + escapeHtml(option.label) +
      '</strong><small>' + escapeHtml(option.purpose) + '</small></span></label>'
    ).join("") + '</div></details>';
}

function renderVariantFields(state, index) {
  const draft = state.createDraft.variants[index];
  const label = String.fromCharCode(65 + index);
  const definition = integerParameters.find(({ id }) => id === draft.parameterId) || integerParameters[index % integerParameters.length];
  const baseline = index === 0;
  return '<fieldset><legend>' + (baseline ? 'Base A' : 'Variante ' + label) + '</legend><label>Rótulo<input name="label-' + index + '" maxlength="80" required value="' + escapeHtml(draft.label) + '"></label>' +
    `<label>Título<input name="title-${index}" maxlength="300" required value="${escapeHtml(draft.title)}"></label>` +
    `<label>Objetivo<textarea name="goal-${index}" maxlength="2000" required>${escapeHtml(draft.goal)}</textarea></label>` +
    (baseline ? '' :
      '<label>Parâmetro que muda<select name="parameter-id-' + index + '">' + integerParameters.map((candidate) =>
        `<option value="${escapeHtml(candidate.id)}"${candidate.id === draft.parameterId ? " selected" : ""}>${escapeHtml(candidate.label)}</option>`).join("") + '</select></label>' +
      '<label>Valor desta variante<input name="parameter-value-' + index + '" type="number" min="' + definition.valueSchema.minimum +
      '" max="' + definition.valueSchema.maximum + '" value="' + escapeHtml(draft.parameterValue) + '" required></label>' +
      '<label>Por que essa diferença é intencional?<textarea name="rationale-' + index + '" maxlength="1000" required>' + escapeHtml(draft.rationale) + '</textarea></label>' +
      renderComponentPolicyDifference(state, index)) + '</fieldset>';
}

function renderCreate(state) {
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-variants-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-variants-section-title">Criar variantes</h2></div>' +
    '<button type="button" data-course-variants-action="back" aria-label="Voltar" title="Voltar">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button></header>' +
    `<form class="course-authoring-write-form" data-course-variants-create${state.busy ? ' aria-busy="true"' : ""}>` +
    '<label>Quantidade de variantes<select name="variant-count" data-course-variants-count>' + [2,3,4,5,6,7,8].map((count) =>
      `<option value="${count}"${count === state.createDraft.variantCount ? " selected" : ""}>${count}</option>`).join("") + '</select></label>' +
    Array.from({ length: state.createDraft.variantCount }, (_, index) => renderVariantFields(state, index)).join("") +
    `<button type="submit" name="create-comparison" aria-label="Criar e comparar" title="Criar e comparar"${state.busy ? ' aria-disabled="true"' : ""}>` +
    `${renderUiIcon("save", "course-authoring-button-icon")}</button></form>` +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") + '</section>';
}

function renderComparison(state) {
  const comparison = state.comparison;
  const labels = new Map(comparison.members.map((member) => [member.courseId, member.label]));
  labels.set(comparison.source.courseId, "Origem");
  const checkpointPlan = comparison.planning.snapshot?.plan || comparison.planning.snapshot;
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-variants-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-variants-section-title">Comparação</h2>' +
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
      '<button type="button" data-course-variants-action="visit" data-course-id="' + escapeHtml(comparison.source.courseId) + '" aria-label="Abrir origem" title="Abrir origem">' +
      renderUiIcon("arrow-right", "course-authoring-button-icon") + '</button></article>' +
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
      '<div class="course-variants-actions"><button type="button" data-course-variants-action="visit" data-course-id="' + escapeHtml(member.courseId) + '" aria-label="Abrir Curso" title="Abrir Curso">' +
      renderUiIcon("arrow-right", "course-authoring-button-icon") + '</button>' +
      `<button type="button" data-course-variants-action="detach" data-course-id="${escapeHtml(member.courseId)}" aria-label="Desvincular" title="Desvincular">` +
      `${renderUiIcon("trash", "course-authoring-button-icon")}</button></div>` +
      '</article>').join("") + '</div>' +
    '<div class="course-variants-comparison-differences" aria-label="Diferenças da comparação">' +
      renderComparisonDifferenceGroup("Diferenças declaradas", comparison.differences.declared, labels, "Nenhuma diferença declarada.") +
      renderComparisonDifferenceGroup("Observadas conforme declarado", comparison.differences.observedExpected, labels, "Nenhuma diferença declarada pôde ser confirmada nesta revisão.") +
      renderComparisonDifferenceGroup("Desvios não declarados", comparison.differences.accidentalDeviations, labels, "Nenhum desvio não declarado foi detectado.") +
      renderComparisonDifferenceGroup("Diferenças factuais", comparison.differences.factual, labels, "Partes, Unidades e componentes não apresentam diferença factual.") +
      renderComparisonDifferenceGroup("Dados ausentes ou incompletos", comparison.differences.missingData, labels, "Não há dados ausentes nesta comparação.") +
    '</div>' +
    renderVariantConfirmation(state) +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") + '</section>';
}

export function createCourseVariantsPanel({
  root,
  controller,
  course,
  initialComparisonSetId = null,
  onCourseRevisionChange = () => undefined,
  onOpenCourse = () => undefined,
  documentValue = root?.ownerDocument || globalThis.document || null
} = {}) {
  if (!root || !controller || !course?.courseId || !Number.isSafeInteger(course.revision)) throw new TypeError("Painel de variantes inválido.");
  const state = { course, list: null, comparison: null, screen: "list", createDraft: createVariantsDraft(course), pendingCreation: null, pendingDetach: null, loading: false, busy: false, failure: "", componentCatalog: null, componentCatalogLoading: false, confirmation: null };
  const render = ({ preserveFocus = false } = {}) => {
    const focusedControl = preserveFocus ? captureFocusedControl(root, documentValue) : null;
    root.innerHTML = state.screen === "create" ? renderCreate(state) : state.screen === "comparison" && state.comparison ? renderComparison(state) : renderList(state);
    restoreFocusedControl(root, focusedControl);
  };
  const focus = (selector) => root.querySelector?.(selector)?.focus?.({ preventScroll: true });
  const cancelConfirmation = ({ restoreFocus = true } = {}) => {
    const confirmation = state.confirmation;
    if (!confirmation) return false;
    state.confirmation = null;
    render();
    if (restoreFocus) focus(confirmation.returnFocusSelector);
    return true;
  };
  const requestDetach = (courseId) => {
    const draft = {
      comparisonSetId: state.comparison?.comparisonSetId || "",
      courseId
    };
    if (!pendingCreationMatches(state.pendingDetach, draft)) state.pendingDetach = null;
    state.confirmation = {
      courseId,
      returnFocusSelector: `[data-course-variants-action="detach"][data-course-id="${courseId}"]`
    };
    render();
    focus('[data-course-variants-action="cancel-confirmation"]');
  };
  const detachConfirmedVariant = () => {
    const confirmation = state.confirmation;
    if (!confirmation || !state.comparison || state.busy) return;
    const draft = {
      comparisonSetId: state.comparison.comparisonSetId,
      courseId: confirmation.courseId
    };
    if (!pendingCreationMatches(state.pendingDetach, draft)) {
      state.pendingDetach = {
        draft: structuredClone(draft),
        request: {
          requestId: createUuid(),
          courseId: state.course.courseId,
          command: {
            type: "detach_comparison_variant",
            comparisonSetId: draft.comparisonSetId,
            courseId: draft.courseId
          }
        }
      };
    }
    const pending = state.pendingDetach;
    state.confirmation = null;
    void (async () => {
      state.busy = true;
      state.failure = "";
      render();
      try {
        await controller.mutateCourseVariants(structuredClone(pending.request));
        state.pendingDetach = null;
        state.comparison = null;
        state.screen = "list";
        await refreshList();
      } catch (error) {
        const ambiguous = ambiguousWriteFailure(error);
        if (!ambiguous) state.pendingDetach = null;
        state.failure = ambiguous
          ? `${errorText(error)} Tente novamente para confirmar a mesma operação.`
          : errorText(error);
      } finally {
        state.busy = false;
        render();
      }
    })();
  };
  const refreshList = async ({ course = state.course, preserveExisting = false } = {}) => {
    state.loading = true; state.failure = "";
    if (!preserveExisting) render();
    try {
      const list = await controller.listCourseVariantComparisons(
        course.courseId,
        course.revision
      );
      state.course = course;
      state.list = list;
      return true;
    }
    catch (error) { state.failure = errorText(error); return false; }
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
    state.componentCatalogLoading = true; render({ preserveFocus: true });
    try {
      const design = await controller.loadCourseDesign(state.course.courseId, {
        scope: { kind: "course", ref: state.course.courseId }, limit: 1, cursor: null
      });
      if (design?.componentCatalog?.version && Array.isArray(design.componentCatalog.options)) {
        state.componentCatalog = design.componentCatalog;
      }
    } catch {
      // A diferença de parâmetro continua suficiente para criar uma comparação segura.
    } finally { state.componentCatalogLoading = false; render({ preserveFocus: true }); }
  };
  const onClick = (event) => {
    const node = event.target?.closest?.("[data-course-variants-action]"); if (!node) return;
    const action = node.dataset.courseVariantsAction;
    if (action === "create") { state.screen = "create"; state.failure = ""; state.pendingDetach = null; render(); void loadComponentCatalog(); }
    else if (action === "back") { state.screen = "list"; state.comparison = null; state.pendingDetach = null; void refreshList(); }
    else if (action === "open") {
      if (state.pendingDetach?.draft?.comparisonSetId !== node.dataset.setId) {
        state.pendingDetach = null;
      }
      void openComparison(node.dataset.setId);
    }
    else if (action === "visit") onOpenCourse(node.dataset.courseId);
    else if (action === "detach" && state.comparison) requestDetach(node.dataset.courseId);
    else if (action === "cancel-confirmation") cancelConfirmation();
    else if (action === "confirm-detach") detachConfirmedVariant();
  };
  const onKeyDown = (event) => {
    if (state.confirmation && event.key === "Tab") {
      trapAuthoringConfirmationTab({
        event,
        root,
        confirmationSelector: "[data-course-variants-confirmation]",
        documentValue
      });
      return;
    }
    if (event.key !== "Escape" || !cancelConfirmation()) return;
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  const onDocumentClick = (event) => {
    if (!state.confirmation ||
        !event.target?.matches?.("[data-course-variants-confirmation-backdrop]")) return;
    cancelConfirmation();
  };
  const onInput = (event) => {
    updateVariantDraftControl(state.createDraft, event.target);
  };
  const onChange = (event) => {
    updateVariantDraftControl(state.createDraft, event.target);
    if (event.target?.name === "variant-count") {
      const count = Number(event.target.value);
      if (Number.isSafeInteger(count) && count >= 2 && count <= 8) {
        resizeVariantsDraft(state.createDraft, state.course, count);
        render({ preserveFocus: true });
      }
    }
  };
  const onSubmit = (event) => {
    if (!event.target?.matches?.("[data-course-variants-create]")) return;
    event.preventDefault();
    if (state.busy) return;
    syncVariantsDraftFromForm(state.createDraft, event.target);
    const activeVariants = state.createDraft.variants.slice(0, state.createDraft.variantCount);
    const invalidPolicy = activeVariants.slice(1)
      .some((variant) => variant.policyEnabled &&
        (!state.componentCatalog || variant.allowedRefs.length === 0));
    if (invalidPolicy) {
      state.failure = "Selecione ao menos um componente permitido ou desmarque a restrição desta variante.";
      render({ preserveFocus: true });
      return;
    }
    const draft = activeVariantsDraft(state.createDraft);
    const matchesPending = pendingCreationMatches(state.pendingCreation, draft);
    if (!matchesPending) {
      const comparisonSetId = createUuid();
      state.pendingCreation = {
        requestId: createUuid(),
        comparisonSetId,
        draft,
        command: { type: "create_comparison_variants", comparisonSetId, expectedCourseRevision: state.course.revision, variants: activeVariants.map((variant, index) => ({
          label: variant.label, title: variant.title, goal: variant.goal,
          parameterDifferences: index === 0 ? [] : [{ scopeKind: "course", scopeId: "course", parameterId: variant.parameterId, value: Number(variant.parameterValue), rationale: variant.rationale }],
          componentPolicyDifference: index === 0 || !variant.policyEnabled ? null : {
            catalogVersion: state.componentCatalog?.version,
            availability: "allow_only",
            allowedRefs: [...variant.allowedRefs],
            excludedRefs: [],
            preferredRefs: []
          }
        })) }
      };
    }
    const pending = state.pendingCreation;
    void (async () => {
      let writeConfirmed = false;
      state.busy = true;
      state.failure = "";
      render({ preserveFocus: true });
      try {
        await controller.mutateCourseVariants({
          requestId: pending.requestId,
          courseId: state.course.courseId,
          expectedCourseRevision: state.course.revision,
          command: pending.command
        });
        writeConfirmed = true;
        state.comparison = await controller.loadCourseVariantComparison(state.course.courseId, {
          comparisonSetId: pending.comparisonSetId,
          expectedCourseRevision: state.course.revision
        });
        state.pendingCreation = null;
        state.createDraft = createVariantsDraft(state.course);
        state.screen = "comparison";
        onCourseRevisionChange(state.course.revision);
      } catch (error) {
        const retrySameOperation = writeConfirmed || ambiguousWriteFailure(error);
        if (!retrySameOperation) state.pendingCreation = null;
        state.failure = retrySameOperation
          ? `${errorText(error)} Tente novamente para confirmar a mesma operação.`
          : errorText(error);
      } finally {
        state.busy = false;
        render({ preserveFocus: true });
      }
    })();
  };
  root.addEventListener("click", onClick); root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("submit", onSubmit); root.addEventListener("keydown", onKeyDown);
  documentValue?.addEventListener?.("click", onDocumentClick);
  const hasPendingDraft = () => {
    const defaultDraft = createVariantsDraft(state.course);
    const createDraftChanged = state.screen !== "comparison" &&
      JSON.stringify(activeVariantsDraft(state.createDraft)) !==
        JSON.stringify(activeVariantsDraft(defaultDraft));
    return Boolean(
      state.pendingCreation || state.confirmation || state.busy || createDraftChanged
    );
  };
  const refresh = async (course = state.course) => {
    if (state.screen !== "comparison" || !state.comparison) {
      return refreshList({ course, preserveExisting: true });
    }
    state.loading = true;
    state.failure = "";
    try {
      const comparison = await controller.loadCourseVariantComparison(course.courseId, {
        comparisonSetId: state.comparison.comparisonSetId,
        expectedCourseRevision: course.revision
      });
      state.course = course;
      state.comparison = comparison;
      return true;
    } catch (error) {
      state.failure = errorText(error);
      return false;
    } finally {
      state.loading = false;
      render();
    }
  };
  return {
    open: initialComparisonSetId
      ? () => openComparison(initialComparisonSetId)
      : refreshList,
    refresh,
    hasPendingDraft,
    destroy() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("keydown", onKeyDown);
      documentValue?.removeEventListener?.("click", onDocumentClick);
      root.innerHTML = "";
    }
  };
}
