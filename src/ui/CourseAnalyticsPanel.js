import {
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../domain/courseAuthoringAnalytics.js";
import { downloadTextFile } from "./downloadTextFile.js";
import { renderUiIcon } from "./renderUiIcons.js";

const ORIGIN_LABELS = Object.freeze({
  automatic: "Calibração automática",
  author: "Pessoa autora",
  research_condition: "Condição de pesquisa",
  migration: "Estado importado",
  provider_assistance: "Assistência por IA",
  gpt: "GPT",
  authoring_interface: "Edição na Autoria",
  authoring_chat: "Conversa de Autoria",
  unknown: "Origem não informada",
  unknown_legacy: "Origem não informada"
});

const CONCEPT_LABELS = Object.freeze({
  definition: "Definição",
  context: "Contexto",
  mechanism: "Mecanismo",
  relationship: "Relação",
  example: "Exemplo",
  contrast: "Contraste",
  complementary_representation: "Representação complementar",
  retrieval: "Recuperação",
  consolidation: "Consolidação",
  practice: "Prática",
  paragraph: "Parágrafo",
  choice: "Escolha",
  table: "Tabela",
  sequence: "Sequência",
  flow: "Fluxo",
  classification: "Classificação",
  code: "Código",
  diagram: "Diagrama",
  image: "Imagem",
  relation_map: "Mapa de relações",
  text: "Texto",
  ordering: "Ordenação",
  factual_support: "Sustentação factual",
  contextualization: "Contextualização",
  worked_example: "Exemplo desenvolvido",
  counterexample: "Contraexemplo"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function errorText(error) {
  return String(error?.message || "Não foi possível carregar Analytics.");
}

function formatCount(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function plural(value, singular, pluralForm) {
  return `${formatCount(value)} ${value === 1 ? singular : pluralForm}`;
}

function humanLabel(value) {
  const source = String(value ?? "").trim();
  if (!source) return "Não informado";
  if (ORIGIN_LABELS[source]) return ORIGIN_LABELS[source];
  if (CONCEPT_LABELS[source]) return CONCEPT_LABELS[source];
  const words = source.replaceAll(/[_-]+/gu, " ").trim();
  return words ? words[0].toLocaleUpperCase("pt-BR") + words.slice(1) : "Não informado";
}

function appliedValue(value) {
  if (value === null) return "Não informado";
  if (Array.isArray(value)) return value.length ? value.map(humanLabel).join(", ") : "Nenhum";
  if (typeof value === "number") return formatCount(value);
  return humanLabel(value);
}

function componentLabel(value) {
  const source = String(value ?? "").trim();
  const token = source.match(/^aralearn\.(?:resource|response)\.([a-z0-9_-]+)@[0-9.]+$/u)?.[1] ||
    source;
  return humanLabel(token);
}

function renderScopeFilter(page) {
  return '<form class="course-analytics-scope" data-course-analytics-scope>' +
    '<label for="course-analytics-scope">Escopo</label><div>' +
    '<select id="course-analytics-scope" name="scope">' +
    page.scope.options.map((option, index) => {
      const selected = option.kind === page.scope.selected.kind &&
        option.ref === page.scope.selected.ref;
      return `<option value="${index}"${selected ? " selected" : ""}>` +
        `${escapeHtml(option.label)}</option>`;
    }).join("") + '</select><button type="submit" class="course-authoring-icon-action"' +
    ' aria-label="Aplicar escopo" title="Aplicar escopo">' +
    renderUiIcon("search", "course-authoring-button-icon") + '</button>' +
    '<button type="button" class="course-authoring-icon-action"' +
    ' data-course-analytics-action="export-json" aria-label="Exportar Analytics em JSON"' +
    ' title="Exportar Analytics">' + renderUiIcon("download", "course-authoring-button-icon") +
    "</button></div></form>";
}

function renderMetrics(items, label) {
  return `<dl class="course-analytics-metrics" aria-label="${escapeHtml(label)}">` +
    items.map(({ name, value, definition }) => '<div><dt>' + escapeHtml(name) +
      `<small>${escapeHtml(definition)}</small></dt>` + (value === null
        ? '<dd aria-label="Não disponível">—</dd>'
        : `<dd>${escapeHtml(formatCount(value))}</dd>`) + "</div>"
    ).join("") + "</dl>";
}

function renderTableDetails({ title, definition, rows }) {
  if (!rows.length) return "";
  return '<details class="course-analytics-details"><summary><span>' + escapeHtml(title) +
    `</span><small>${escapeHtml(plural(rows.length, "linha", "linhas"))}</small></summary>` +
    `<p>${escapeHtml(definition)}</p><table aria-label="${escapeHtml(title)}"><thead>` +
    '<tr><th scope="col">Item</th>' +
    '<th scope="col">Leitura</th></tr></thead><tbody>' +
    rows.map(({ label, value }) => `<tr><th scope="row">${escapeHtml(label)}</th>` +
      `<td>${escapeHtml(value)}</td></tr>`).join("") + "</tbody></table></details>";
}

function configurationRows(design) {
  const rows = [];
  for (const parameter of design.parameters) {
    for (const applied of parameter.effectiveValues) {
      const suffix = [
        plural(applied.studyUnitCount, "StudyUnit", "StudyUnits"),
        applied.origin ? humanLabel(applied.origin) : null
      ].filter(Boolean).join(" · ");
      rows.push({
        label: parameter.label,
        value: `${appliedValue(applied.value)} · ${suffix}`
      });
    }
  }
  for (const direction of design.editorialDirections) {
    const suffix = [
      plural(direction.studyUnitCount, "StudyUnit", "StudyUnits"),
      direction.origin ? humanLabel(direction.origin) : null
    ].filter(Boolean).join(" · ");
    rows.push({
      label: "Direção editorial",
      value: `${direction.direction || "Sem direção adicional"} · ${suffix}`
    });
  }
  return rows;
}

function structureRows(design) {
  return [
    ...design.analysisUnits.map((unit) => ({
      label: `AnalysisUnit ${unit.position}`,
      value: `${unit.statement} · ${plural(
        unit.introductionCount,
        "introdução",
        "introduções"
      )}`
    })),
    ...design.introductionsByStudyUnit.map((unit) => ({
      label: `StudyUnit ${unit.position} · ${unit.title}`,
      value: plural(unit.introducedCount, "novidade introduzida", "novidades introduzidas")
    })),
    ...design.explanationForms.map((form) => ({
      label: `Forma · ${humanLabel(form.form)}`,
      value: `${plural(form.studyUnitCount, "StudyUnit", "StudyUnits")} · ${plural(
        form.applicationCount,
        "aplicação",
        "aplicações"
      )}`
    })),
    ...design.components.map((component) => ({
      label: `Componente · ${componentLabel(component.componentRef)}`,
      value: `${plural(component.studyUnitCount, "StudyUnit", "StudyUnits")} · ${plural(
        component.instanceCount,
        "uso",
        "usos"
      )}`
    }))
  ];
}

function practiceAndSourceRows(design) {
  return [
    ...design.practiceByRequirement.map((requirement) => ({
      label: `Prática ${requirement.position}`,
      value: `${requirement.statement} · ${plural(
        requirement.opportunityCount,
        "oportunidade",
        "oportunidades"
      )}`
    })),
    ...design.practiceVariationDimensions.map((dimension) => ({
      label: `Variação · ${humanLabel(dimension.dimension)}`,
      value: plural(dimension.opportunityCount, "oportunidade", "oportunidades")
    })),
    ...design.sourcesByRole.map((source) => ({
      label: `Fonte · ${humanLabel(source.role)}`,
      value: `${plural(source.sourceCount, "Fonte", "Fontes")} · ${plural(
        source.anchorCount,
        "Âncora",
        "Âncoras"
      )} · ${plural(source.studyUnitCount, "StudyUnit", "StudyUnits")}`
    }))
  ];
}

function authorshipRows(authorship) {
  return [
    {
      label: "Observações criadas",
      value: plural(authorship.observations.createdCount, "Observação", "Observações")
    },
    {
      label: "Observações resolvidas",
      value: plural(authorship.observations.resolvedCount, "Observação", "Observações")
    },
    {
      label: "Reparos rejeitados",
      value: plural(authorship.repairs.rejectedCount, "reparo", "reparos")
    },
    ...authorship.studyUnitChangesByOrigin.map((entry) => ({
      label: humanLabel(entry.origin),
      value: `${plural(entry.createdCount, "StudyUnit criada", "StudyUnits criadas")} · ${plural(
        entry.revisedCount,
        "StudyUnit revisada",
        "StudyUnits revisadas"
      )}`
    }))
  ];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function renderDesign(design) {
  const practiceCount = sum(design.practiceByRequirement.map(({ opportunityCount }) =>
    opportunityCount));
  const sourceCount = sum(design.sourcesByRole.map(({ sourceCount }) => sourceCount));
  return '<section class="course-analytics-area" aria-labelledby="course-analytics-design-title">' +
    '<header><h3 id="course-analytics-design-title">Desenho</h3>' +
    '<p>Configuração e composição efetivamente usadas neste escopo.</p></header>' +
    renderMetrics([{
      name: "StudyUnits", value: design.studyUnitCount, definition: "Unidades no escopo."
    }, {
      name: "AnalysisUnits", value: design.analysisUnits.length,
      definition: "Novidades semânticas inventariadas."
    }, {
      name: "Prática", value: practiceCount, definition: "Oportunidades produzidas."
    }, {
      name: "Fontes", value: sourceCount, definition: "Fontes relacionadas."
    }], "Resumo do desenho") +
    renderTableDetails({
      title: "Configuração aplicada",
      definition: "Parâmetros pedagógicos e direção editorial usados pelas StudyUnits.",
      rows: configurationRows(design)
    }) + renderTableDetails({
      title: "Conteúdo e representações",
      definition: "Novidades, distribuição, formas explicativas e componentes do escopo.",
      rows: structureRows(design)
    }) + renderTableDetails({
      title: "Prática e Fontes",
      definition: "Oportunidades, variações e sustentação por papel.",
      rows: practiceAndSourceRows(design)
    }) + "</section>";
}

function renderAuthorship(authorship) {
  return '<section class="course-analytics-area" aria-labelledby="course-analytics-authorship-title">' +
    '<header><h3 id="course-analytics-authorship-title">Autoria</h3>' +
    '<p>Intervenções explícitas observáveis; ausência não significa concordância.</p></header>' +
    renderMetrics([{
      name: "Observações abertas", value: authorship.observations.openCount,
      definition: "Pendências humanas atuais."
    }, {
      name: "Parâmetros alterados", value: authorship.explicitParameterChangeCount,
      definition: "Mudanças explícitas da pessoa autora."
    }, {
      name: "Edições manuais", value: authorship.manualEditCount,
      definition: "Edições aplicadas diretamente."
    }, {
      name: "Reparos aceitos", value: authorship.repairs.acceptedCount,
      definition: "Propostas aceitas no fluxo."
    }], "Resumo da autoria") + renderTableDetails({
      title: "Intervenções por origem",
      definition: "Contagens explícitas por origem observável.",
      rows: authorshipRows(authorship)
    }) + "</section>";
}

function renderMissingData(missingData) {
  return missingData.length
    ? '<aside class="course-authoring-notice course-analytics-missing" aria-label="Dados ausentes">' +
      '<strong>Dados ausentes</strong><p>' + escapeHtml(missingData.join(" ")) + "</p></aside>"
    : "";
}

function renderPanel(state) {
  return '<section class="course-authoring-section course-analytics"' +
    ' aria-labelledby="course-analytics-section-title">' +
    '<h2 class="course-authoring-visually-hidden" id="course-analytics-section-title">Analytics</h2>' +
    (state.page ? renderScopeFilter(state.page) : "") +
    (state.loading && !state.page
      ? '<p class="course-authoring-loading" role="status">Carregando Analytics…</p>'
      : state.page
        ? renderDesign(state.page.design) + renderAuthorship(state.page.authorship) +
          renderMissingData(state.page.missingData)
        : "") +
    (state.loading && state.page
      ? '<p class="course-authoring-loading" role="status">Atualizando o escopo…</p>'
      : "") +
    (state.failure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>`
      : "") + "</section>";
}

export function createCourseAnalyticsPanel({
  root,
  controller,
  course,
  download = downloadTextFile
} = {}) {
  if (!root || !controller || !course?.courseId || !Number.isSafeInteger(course.revision) ||
      typeof controller.loadCourseAuthoringAnalytics !== "function") {
    throw new TypeError("Painel de Analytics inválido.");
  }
  const state = {
    course,
    query: normalizeCourseAuthoringAnalyticsQuery(),
    page: null,
    loading: false,
    failure: ""
  };

  const render = () => { root.innerHTML = renderPanel(state); };

  const load = async () => {
    state.loading = true;
    state.failure = "";
    render();
    try {
      const incoming = normalizeCourseAuthoringAnalyticsPage(
        await controller.loadCourseAuthoringAnalytics(state.course.courseId, {
          expectedCourseRevision: state.course.revision,
          query: state.query
        }),
        { expectedCourseId: state.course.courseId, expectedQuery: state.query }
      );
      if (incoming.course.revision !== state.course.revision) {
        state.course = { ...state.course, revision: incoming.course.revision };
      }
      state.page = incoming;
      state.query = normalizeCourseAuthoringAnalyticsQuery({
        scope: { kind: incoming.scope.selected.kind, ref: incoming.scope.selected.ref }
      });
    } catch (error) {
      state.failure = errorText(error);
      if (state.page) {
        state.query = normalizeCourseAuthoringAnalyticsQuery({
          scope: {
            kind: state.page.scope.selected.kind,
            ref: state.page.scope.selected.ref
          }
        });
      }
    } finally {
      state.loading = false;
      render();
    }
  };

  const onSubmit = (event) => {
    if (!event.target?.matches?.("[data-course-analytics-scope]")) return;
    event.preventDefault();
    const index = Number(event.target.elements?.scope?.value);
    const selected = Number.isSafeInteger(index) ? state.page?.scope.options[index] : null;
    if (!selected || selected.kind === state.page.scope.selected.kind &&
        selected.ref === state.page.scope.selected.ref) return;
    state.query = normalizeCourseAuthoringAnalyticsQuery({
      scope: { kind: selected.kind, ref: selected.ref }
    });
    void load();
  };

  const exportSnapshot = () => {
    if (!state.page) return null;
    try {
      state.failure = "";
      const result = download({
        name: `aralearn-analytics-snapshot-r${state.page.course.revision}.json`,
        type: "application/json;charset=utf-8",
        content: JSON.stringify(state.page, null, 2) + "\n"
      });
      render();
      return result;
    } catch (error) {
      state.failure = errorText(error);
      render();
      return null;
    }
  };

  const onClick = (event) => {
    const node = event.target?.closest?.("[data-course-analytics-action]");
    if (node?.dataset.courseAnalyticsAction === "export-json") exportSnapshot();
  };

  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  render();
  return {
    open: load,
    export: exportSnapshot,
    refresh(nextCourseRevision = state.course.revision) {
      const revision = Number(nextCourseRevision);
      if (!Number.isSafeInteger(revision) || revision < 1) {
        return Promise.reject(new TypeError(
          "A revisão do Curso para atualizar Analytics é inválida."
        ));
      }
      state.course = { ...state.course, revision };
      return load();
    },
    destroy() {
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      root.innerHTML = "";
    }
  };
}

export { renderPanel as renderCourseAnalyticsPanel };
