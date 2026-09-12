import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { renderUiIcon } from "./renderUiIcons.js";

const escape = value => String(value ?? "").replace(/[&<>"']/gu, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function instructionalFunction(item) {
  return ({ expository: "Apresentação e explicação", practice: "Prática", mixed: "Explicação e prática" })[item.authorship.design.application?.mode] ||
    (item.studyUnit.role === "practice" ? "Prática" : "Apresentação e explicação");
}

export function contentReviewLabel(item) {
  return ({ current: "Revisão autoral declarada", stale: "Revisão autoral desatualizada",
    draft: "Revisão autoral pendente", unregistered: "Revisão autoral pendente" })[item.contentReview?.state] || "Estado da revisão ainda não consultado";
}

function rows(values) {
  return '<dl class="course-inspection-metadata-values">' + values.map(([label, value]) =>
    `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("") + '</dl>';
}

function group(label, content) {
  return `<section class="course-inspection-metadata-group" aria-label="${escape(label)}"><h4>${escape(label)}</h4>${content}</section>`;
}

function ideas(label, values) {
  if (!values?.length) return "";
  return '<div class="course-inspection-analysis-idea-group">' +
    `<p class="course-inspection-metadata-label">${escape(label)}</p><ul>` + values.map(idea =>
      `<li><strong>${escape(idea.name)}</strong>` + (idea.description ? `<p>${escape(idea.description)}</p>` : "") + '</li>').join("") + '</ul></div>';
}

function actions(item, state) {
  const id = escape(item.studyUnit.id);
  const icon = name => renderUiIcon(name, "course-authoring-button-icon");
  return `<nav class="course-inspection-item-menu" aria-label="Mais ações para ${escape(item.studyUnit.title)}">` +
    `<button type="button" data-inspection-copy-link data-deep-link="${escape(item.deepLink)}"` +
    ` data-inspection-control-key="copy:${id}" aria-label="Copiar link" title="Copiar link">${icon("copy")}</button>` +
    (state.canReviewContent
      ? `<button type="button" data-inspection-review-unit data-study-unit-id="${id}"` +
        ` data-inspection-control-key="content-review:${id}" aria-label="Revisão autoral desta unidade" title="Revisão autoral"` +
        `${state.manualStudyUnitId ? " disabled" : ""}>${icon("review")}</button>`
      : `<a href="${escape(buildCourseAuthoringRoute(state.courseId, { section: "review", studyUnitId: item.studyUnit.id }))}"` +
        ` data-inspection-route data-inspection-control-key="review:${id}" aria-label="Revisar unidade" title="Revisar unidade">${icon("review")}</a>`) +
    `<button type="button" class="course-inspection-view-menu" data-inspection-unit-mode="view" data-study-unit-id="${id}"` +
    ` aria-label="Visualizar" title="Visualizar"${state.manualSaving ? " disabled" : ""}>${icon("preview")}</button>` +
    [["undo", state.manualUndo, "Desfazer última edição", "arrow-left"], ["redo", state.manualRedo, "Refazer edição", "arrow-right"]]
      .map(([action, history, label, glyph]) => state.canEditManually && history.at(-1)?.studyUnitId === item.studyUnit.id
        ? `<button type="button" data-inspection-manual-history="${action}" data-study-unit-id="${id}"` +
          ` aria-label="${label}" title="${label}"${state.manualSaving ? " disabled" : ""}>${icon(glyph)}</button>` : "").join("") + '</nav>';
}

/** Metadados da unidade corrente, separados do conteúdo de leitura. */
export function renderCourseInspectionMetadata(item, state, observationCount) {
  const application = item.authorship.design.application;
  const path = item.curriculumPath;
  const components = application?.componentRefs.map(ref => {
    const [id, version] = ref.split("@");
    return RESOURCE_PACKAGE_REGISTRY.get(id, version)?.manifest.label || "Componente fora do catálogo atual";
  }) || [];
  const origin = value => ({ human: "Autoria humana", gpt: "GPT" })[value] || "Origem não informada";
  const analysis = application?.analysisIdeas;
  const analysisContent = analysis ? ideas("Introduzidas aqui", analysis.introduced) +
    ideas("Já estabelecidas", analysis.used) + ideas("Retomadas", analysis.revisited) : "";
  return '<header class="course-inspection-metadata-heading"><h3>Sobre esta unidade</h3>' + actions(item, state) + '</header>' +
    group("Localização", rows([
      ["Módulo", path.module.title], ["Lição", path.lesson.title], ["Microssequência", path.didacticMicrosequence.title]
    ])) +
    group("Apresentação", rows([
      ["Função instrucional", instructionalFunction(item)],
      ["Componentes usados", application ? components.join(" · ") || "Sem componentes registrados" : "Configuração ainda não consultada"]
    ])) +
    group("Autoria", rows([
      ["Origem", origin(item.authorship.createdOrigin)], ["Última intervenção", origin(item.authorship.lastRevisionOrigin)],
      ["Revisão autoral", contentReviewLabel(item)],
      ["Observações autorais", observationCount === null ? "Contagem ainda não consultada" : `${observationCount} pendentes`]
    ]) + `<p class="course-inspection-metadata-updated">Atualizado em <time datetime="${escape(item.updatedAt)}">${escape(new Date(item.updatedAt).toLocaleString("pt-BR"))}</time></p>`) +
    (analysisContent ? group("Ideias trabalhadas", analysisContent) : "") +
    group("Prática", application?.practiceEvidence?.length ? ideas("Evidência esperada", application.practiceEvidence)
      : `<p class="course-inspection-metadata-note">${application?.practiceEvidence === null || !application
        ? "Evidência da prática ainda não consultada." : "Nenhum requisito de evidência vinculado a esta unidade."}</p>`);
}
