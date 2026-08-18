import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../domain/courseDesignParameters.js";
import { createUuid } from "../domain/identifiers.js";
import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function errorText(error) { return String(error?.message || "Não foi possível concluir a operação."); }
const integerParameters = COURSE_DESIGN_PARAMETER_DEFINITIONS.filter(({ valueSchema }) => valueSchema.type === "integer");

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
        `<p>${item.attachedCount} vinculada(s) · ${item.detachedCount} desvinculada(s)</p></div>` +
        `<button type="button" data-course-variants-action="open" data-set-id="${escapeHtml(item.comparisonSetId)}">Comparar</button></article>`
      ).join("") + '</div>' : '<p class="course-authoring-empty-copy">Nenhuma comparação criada neste Curso.</p>') +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") +
    '</section>';
}

function renderCreate(state) {
  const parameterOptions = integerParameters.map((definition) =>
    `<option value="${escapeHtml(definition.id)}">${escapeHtml(definition.label)}</option>`).join("");
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-authoring-section-title">Criar variantes</h2>' +
    '<p>Os Cursos começam com o mesmo planejamento e uma diferença declarada.</p></div>' +
    '<button type="button" data-course-variants-action="back" aria-label="Voltar" title="Voltar">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button></header>' +
    '<form class="course-authoring-write-form" data-course-variants-create>' +
    '<fieldset><legend>Variante A</legend><label>Rótulo<input name="label-a" maxlength="80" required value="A"></label>' +
    `<label>Título<input name="title-a" maxlength="300" required value="${escapeHtml(state.course.title)} — A"></label>` +
    `<label>Objetivo<textarea name="goal-a" maxlength="2000" required>${escapeHtml(state.course.goal)}</textarea></label></fieldset>` +
    '<fieldset><legend>Variante B</legend><label>Rótulo<input name="label-b" maxlength="80" required value="B"></label>' +
    `<label>Título<input name="title-b" maxlength="300" required value="${escapeHtml(state.course.title)} — B"></label>` +
    `<label>Objetivo<textarea name="goal-b" maxlength="2000" required>${escapeHtml(state.course.goal)}</textarea></label>` +
    '<label>Parâmetro que muda<select name="parameter-id">' + parameterOptions + '</select></label>' +
    '<label>Valor da variante B<input name="parameter-value" type="number" min="1" max="64" value="1" required></label>' +
    '<label>Por que essa diferença é intencional?<textarea name="rationale" maxlength="1000" required></textarea></label></fieldset>' +
    `<button type="submit"${state.busy ? " disabled" : ""}>Criar e comparar</button></form>` +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") + '</section>';
}

function renderComparison(state) {
  const comparison = state.comparison;
  return '<section class="course-authoring-section course-variants" aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-authoring-section-title">Comparação</h2>' +
    `<p>${comparison.source.changedSinceCheckpoint ? "A origem mudou desde o checkpoint." : "A origem corresponde ao checkpoint."}</p></div>` +
    '<button type="button" data-course-variants-action="back" aria-label="Voltar" title="Voltar">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button></header>' +
    '<div class="course-variants-list">' + comparison.members.map((member) =>
      '<article class="course-authoring-card"><div><h3>' + escapeHtml(member.label) + ': ' + escapeHtml(member.title) + '</h3>' +
      `<p>${member.changedSinceAttached ? "Mudou desde o vínculo." : "Sem mudança desde o vínculo."} ` +
      `${member.materialization.completedCount}/${member.materialization.partCount} Partes materializadas.</p>` +
      (member.parameterDifferences.length ? `<p>${member.parameterDifferences.length} diferença(s) de parâmetro declarada(s).</p>` : "") +
      (member.detachedAt ? '<p>Desvinculada.</p>' : "") + '</div>' +
      (member.detachedAt ? "" : `<button type="button" data-course-variants-action="detach" data-course-id="${escapeHtml(member.courseId)}">Desvincular</button>`) +
      '</article>').join("") + '</div>' +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") + '</section>';
}

export function createCourseVariantsPanel({ root, controller, course, onCourseRevisionChange = () => undefined, confirmValue = globalThis.confirm } = {}) {
  if (!root || !controller || !course?.courseId || !Number.isSafeInteger(course.revision)) throw new TypeError("Painel de variantes inválido.");
  const state = { course, list: null, comparison: null, screen: "list", loading: false, busy: false, failure: "" };
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
  const onClick = (event) => {
    const node = event.target?.closest?.("[data-course-variants-action]"); if (!node) return;
    const action = node.dataset.courseVariantsAction;
    if (action === "create") { state.screen = "create"; state.failure = ""; render(); }
    else if (action === "back") { state.screen = "list"; state.comparison = null; void refreshList(); }
    else if (action === "open") void openComparison(node.dataset.setId);
    else if (action === "detach" && state.comparison && confirmValue?.("Desvincular esta variante sem apagar o Curso?")) {
      void (async () => { state.busy = true; render(); try { await controller.mutateCourseVariants({ requestId: createUuid(), courseId: state.course.courseId, command: { type: "detach_comparison_variant", comparisonSetId: state.comparison.comparisonSetId, courseId: node.dataset.courseId } }); state.comparison = await controller.loadCourseVariantComparison(state.course.courseId, { comparisonSetId: state.comparison.comparisonSetId, expectedCourseRevision: state.course.revision }); } catch (error) { state.failure = errorText(error); } finally { state.busy = false; render(); } })();
    }
  };
  const onSubmit = (event) => {
    if (!event.target?.matches?.("[data-course-variants-create]")) return; event.preventDefault();
    const values = new FormData(event.target); const comparisonSetId = createUuid();
    const command = { type: "create_comparison_variants", comparisonSetId, expectedCourseRevision: state.course.revision, variants: [
      { label: values.get("label-a"), title: values.get("title-a"), goal: values.get("goal-a"), parameterDifferences: [], componentPolicyDifference: null },
      { label: values.get("label-b"), title: values.get("title-b"), goal: values.get("goal-b"), parameterDifferences: [{ scopeKind: "course", scopeId: "course", parameterId: values.get("parameter-id"), value: Number(values.get("parameter-value")), rationale: values.get("rationale") }], componentPolicyDifference: null }
    ] };
    void (async () => { state.busy = true; state.failure = ""; render(); try { await controller.mutateCourseVariants({ requestId: createUuid(), courseId: state.course.courseId, expectedCourseRevision: state.course.revision, command }); state.comparison = await controller.loadCourseVariantComparison(state.course.courseId, { comparisonSetId, expectedCourseRevision: state.course.revision }); state.screen = "comparison"; onCourseRevisionChange(state.course.revision); } catch (error) { state.failure = errorText(error); } finally { state.busy = false; render(); } })();
  };
  root.addEventListener("click", onClick); root.addEventListener("submit", onSubmit);
  return { open: refreshList, refresh: refreshList, destroy() { root.removeEventListener("click", onClick); root.removeEventListener("submit", onSubmit); root.innerHTML = ""; } };
}
