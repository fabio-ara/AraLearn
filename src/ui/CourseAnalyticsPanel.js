import {
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../domain/courseAuthoringAnalytics.js";
import { downloadTextFile } from "./downloadTextFile.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import { renderUiIcon } from "./renderUiIcons.js";

const ORIGIN_LABELS = Object.freeze({
  system_default: "Calibração contextual pendente",
  automatic: "Calibração automática",
  author: "Pessoa autora",
  research_condition: "Condição de pesquisa",
  migration: "Estado importado",
  provider_assistance: "Assistência por IA",
  gpt: "GPT",
  authoring_interface: "Edição na Autoria",
  authoring_chat: "Conversa de Autoria",
  unknown: "Origem não informada",
});

const SOURCE_SCOPE_LABELS = Object.freeze({
  course: "no curso",
  module: "no módulo",
  lesson: "na lição",
  didactic_microsequence: "na microssequência",
  study_unit: "na unidade de estudo"
});

const CONCEPT_LABELS = Object.freeze({
  plain_definition: "Definição em linguagem direta",
  concrete_example: "Exemplo concreto",
  definition: "Definição",
  context: "Contexto",
  mechanism: "Mecanismo",
  relationship: "Relação",
  example: "Exemplo",
  contrast: "Contraste",
  application_condition: "Condição de aplicação",
  limit_or_exception: "Limite ou exceção",
  representation_link: "Relação entre representações",
  case_or_data: "Caso ou dado",
  task_feature: "Característica da tarefa",
  external_representation: "Representação externa",
  support_level: "Nível de apoio",
  complementary_representation: "Representação complementar",
  retrieval: "Recuperação",
  consolidation: "Consolidação",
  practice: "Prática",
  paragraph: "Parágrafo",
  choice: "Escolha",
  gap: "Lacuna",
  open: "Resposta aberta",
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
  contextualization: "Contextualização",
  representation: "Representação",
  worked_example: "Exemplo desenvolvido",
  counterexample: "Contraexemplo",
  curricular_scope: "Escopo curricular",
  assessment_evidence: "Evidência de avaliação",
  technical_conceptual: "Técnica ou conceitual"
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
  return publicErrorMessage(
    error,
    "Não foi possível carregar os dados de autoria. Tente novamente."
  );
}

function formatCount(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatMeasure(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
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

function contextualLabel(value) {
  const label = humanLabel(value);
  return /^[A-ZÀ-Ý]{2,}$/u.test(label)
    ? label
    : label[0].toLocaleLowerCase("pt-BR") + label.slice(1);
}

function sourceScopeLabel(value) {
  const label = SOURCE_SCOPE_LABELS[value];
  return label ? `origem ${label}` : null;
}

function wordCountSummary(distribution) {
  const rows = [...distribution].sort((left, right) => left.wordCount - right.wordCount);
  const unitCount = sum(rows.map(({ studyUnitCount }) => studyUnitCount));
  if (!unitCount) return null;
  const total = rows.reduce((value, row) =>
    value + row.wordCount * row.studyUnitCount, 0);
  const wordCountAt = (position) => {
    let seen = 0;
    for (const row of rows) {
      seen += row.studyUnitCount;
      if (seen >= position) return row.wordCount;
    }
    return rows.at(-1).wordCount;
  };
  const lower = wordCountAt(Math.floor((unitCount + 1) / 2));
  const upper = wordCountAt(Math.ceil((unitCount + 1) / 2));
  return {
    total,
    minimum: rows[0].wordCount,
    median: (lower + upper) / 2,
    mean: total / unitCount,
    maximum: rows.at(-1).wordCount
  };
}

function appliedValue(value) {
  if (value === null) return "Não informado";
  if (Array.isArray(value)) return value.length
    ? value.map((item, index) => index === 0 ? humanLabel(item) : contextualLabel(item)).join(", ")
    : "Nenhum";
  if (typeof value === "number") return formatCount(value);
  return humanLabel(value);
}

function componentLabel(value) {
  const source = String(value ?? "").trim();
  const token = source.match(/^aralearn\.(?:resource|response)\.([a-z0-9_-]+)@[0-9.]+$/u)?.[1] ||
    source;
  return humanLabel(token);
}

function practiceComponents(design) {
  return design.components.filter(({ componentRef }) =>
    componentRef.startsWith("aralearn.response."));
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
    ' data-course-analytics-action="export-json" aria-label="Baixar dados de autoria"' +
    ' title="Baixar dados de autoria">' + renderUiIcon("download", "course-authoring-button-icon") +
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
        parameter.parameterId === "authoring_chat_response_word_target"
          ? `configuração registrada em ${plural(
            applied.studyUnitCount,
            "unidade de estudo",
            "unidades de estudo"
          )}`
          : plural(applied.studyUnitCount, "unidade de estudo", "unidades de estudo"),
        applied.origin ? contextualLabel(applied.origin) : null,
        sourceScopeLabel(applied.sourceScopeKind)
      ].filter(Boolean).join(" · ");
      rows.push({
        label: parameter.label,
        value: `${appliedValue(applied.value)} · ${suffix}`
      });
    }
  }
  for (const direction of design.editorialDirections) {
    const suffix = [
      plural(direction.studyUnitCount, "unidade de estudo", "unidades de estudo"),
      direction.origin ? contextualLabel(direction.origin) : null,
      sourceScopeLabel(direction.sourceScopeKind)
    ].filter(Boolean).join(" · ");
    rows.push({
      label: "Direção editorial",
      value: `${direction.direction || "Sem direção adicional"} · ${suffix}`
    });
  }
  const words = wordCountSummary(design.wordCountsByStudyUnit);
  if (words) {
    rows.push({
      label: "Extensão observada",
      value: `${plural(words.total, "palavra", "palavras")} no total · ` +
        `mínimo ${formatCount(words.minimum)} · mediana ${formatMeasure(words.median)} · ` +
        `média ${formatMeasure(words.mean)} · máximo ${formatCount(words.maximum)} ` +
        "por unidade de estudo"
    });
  }
  return rows;
}

function structureRows(design) {
  return [
    ...design.analysisUnits.map((unit) => ({
      label: `Unidade de análise ${unit.position}`,
      value: `${unit.statement} · ${plural(
        unit.introductionCount,
        "introdução",
        "introduções"
      )} · ${plural(unit.useCount, "uso", "usos")} · ${plural(
        unit.revisitCount,
        "retomada",
        "retomadas"
      )}`
    })),
    ...design.introductionsByStudyUnit.map((unit) => ({
      label: `Unidade de estudo ${unit.position} · ${unit.title}`,
      value: plural(unit.introducedCount, "novidade introduzida", "novidades introduzidas")
    })),
    ...design.explanationForms.map((form) => ({
      label: `Forma · ${contextualLabel(form.form)}`,
      value: `${plural(form.studyUnitCount, "unidade de estudo", "unidades de estudo")} · ${plural(
        form.applicationCount,
        "aplicação",
        "aplicações"
      )}`
    })),
    ...design.components.map((component) => ({
      label: `Componente · ${contextualLabel(componentLabel(component.componentRef))}`,
      value: `${plural(component.studyUnitCount, "unidade de estudo", "unidades de estudo")} · ${plural(
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
    ...practiceComponents(design).map((component) => ({
      label: `Modalidade · ${contextualLabel(componentLabel(component.componentRef))}`,
      value: `${plural(component.instanceCount, "oportunidade", "oportunidades")} · ${plural(
        component.studyUnitCount,
        "unidade de estudo",
        "unidades de estudo"
      )}`
    })),
    ...design.practiceVariationDimensions.map((dimension) => ({
      label: `Variação · ${contextualLabel(dimension.dimension)}`,
      value: plural(dimension.opportunityCount, "oportunidade", "oportunidades")
    })),
    ...design.sourcesByRole.map((source) => ({
      label: `Fonte · ${contextualLabel(source.role)}`,
      value: `${plural(source.sourceCount, "fonte", "fontes")} · ${plural(
        source.anchorCount,
        "âncora",
        "âncoras"
      )} · ${plural(source.studyUnitCount, "unidade de estudo", "unidades de estudo")}`
    }))
  ];
}

function practiceDistributionRows(design) {
  const observed = design.practiceDistribution;
  const order = new Map([...design.practiceSequence].sort((left, right) => left.position - right.position)
    .map(({ position }, index) => [position, index + 1]));
  const positions = (values) => values.length
    ? values.map((position) => `${formatCount(order.get(position))}ª`).join(", ")
    : "Nenhuma";
  let relativePosition = "Sem explicação declarada, a posição relativa da prática não está definida.";
  if (observed.expositionPositions.length && !observed.practicePositions.length) {
    relativePosition = "Não há prática declarada para comparar com a explicação.";
  } else if (observed.expositionPositions.length && observed.practicePositions.length) {
    relativePosition = `${formatCount(observed.practiceBeforeExpositionCount)} antes da primeira explicação · ` +
      `${formatCount(observed.practiceBetweenExpositionsCount)} entre a primeira e a última · ` +
      `${formatCount(observed.practiceAfterExpositionCount)} depois da última. ` +
      "Na mesma unidade, explicação e prática são contadas como mistas.";
  }
  return [
    { label: "Somente explicação", value: plural(observed.expositoryOnlyCount, "unidade de estudo", "unidades de estudo") },
    { label: "Somente prática", value: plural(observed.practiceOnlyCount, "unidade de estudo", "unidades de estudo") },
    { label: "Explicação e prática na mesma unidade", value: plural(observed.mixedCount, "unidade mista", "unidades mistas") },
    { label: "Função não declarada", value: plural(observed.undeclaredCount, "unidade de estudo", "unidades de estudo") },
    { label: "Posições com explicação, incluindo mistas", value: positions(observed.expositionPositions) },
    { label: "Posições com prática, incluindo mistas", value: positions(observed.practicePositions) },
    { label: "Trechos consecutivos somente de explicação", value: observed.expositoryRunLengths.length
      ? observed.expositoryRunLengths.map((length) => plural(length, "unidade", "unidades")).join(" · ") : "Nenhum" },
    { label: "Maior trecho somente de explicação", value: plural(observed.longestExpositoryRun, "unidade", "unidades") },
    { label: "Posição da prática em relação à explicação", value: relativePosition }
  ];
}

function authorshipRows(authorship) {
  return [
    {
      label: "Observações criadas",
      value: plural(authorship.observations.createdCount, "observação", "observações")
    },
    {
      label: "Observações resolvidas",
      value: plural(authorship.observations.resolvedCount, "observação", "observações")
    },
    ...authorship.studyUnitsByOrigin.map((entry) => ({
      label: humanLabel(entry.origin),
      value: `${plural(entry.createdCount, "unidade de estudo criada", "unidades de estudo criadas")} · ${plural(
        entry.lastRevisedCount,
        "unidade de estudo com última edição",
        "unidades de estudo com última edição"
      )}`
    }))
  ];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function renderDesign(design) {
  const practiceCount = sum(practiceComponents(design).map(({ instanceCount }) => instanceCount));
  const sourceCount = sum(design.sourcesByRole.map(({ sourceCount }) => sourceCount));
  return '<section class="course-analytics-area" aria-labelledby="course-analytics-design-title">' +
    '<header><h3 id="course-analytics-design-title">Desenho</h3>' +
    '<p>Configuração e composição efetivamente usadas neste escopo.</p></header>' +
    renderMetrics([{
      name: "Unidades de estudo", value: design.studyUnitCount, definition: "Unidades no escopo."
    }, {
      name: "Unidades de análise", value: design.analysisUnits.length,
      definition: "Ideias acompanhadas no repertório."
    }, {
      name: "Prática", value: practiceCount, definition: "Oportunidades produzidas."
    }, {
      name: "Fontes", value: sourceCount, definition: "Fontes relacionadas."
    }], "Resumo do desenho") +
    renderTableDetails({
      title: "Configuração aplicada",
      definition: "Parâmetros, direção editorial e extensão observada nas unidades de estudo, " +
        "sem atribuir qualidade. Direções de escopos diferentes podem alcançar a mesma " +
        "unidade de estudo.",
      rows: configurationRows(design)
    }) + renderTableDetails({
      title: "Conteúdo e representações",
      definition: "Introduções, usos, retomadas, formas explicativas e componentes do escopo.",
      rows: structureRows(design)
    }) + renderTableDetails({
      title: "Distribuição de explicação e prática",
      definition: "Funções declaradas nas unidades, em ordem neste escopo. As posições começam em 1. " +
        "Unidades mistas aparecem nas duas listas de posições; funções não declaradas permanecem distintas. " +
        "Essas contagens não avaliam qualidade, alternância nem atendimento à preferência de distribuição.",
      rows: practiceDistributionRows(design)
    }) + renderTableDetails({
      title: "Prática e fontes",
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
      name: "Parâmetros definidos", value: authorship.explicitParameterOverrideCount,
      definition: "Atribuições explícitas correntes."
    }, {
      name: "Unidades de estudo revisadas manualmente",
      value: authorship.manuallyRevisedStudyUnitCount,
      definition: "Unidades cuja última edição observável é humana."
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
    '<h2 class="course-authoring-visually-hidden" id="course-analytics-section-title">Dados de autoria</h2>' +
    (state.page ? renderScopeFilter(state.page) : "") +
    (state.loading && !state.page
      ? '<p class="course-authoring-loading" role="status">Carregando dados de autoria…</p>'
      : state.page
        ? renderDesign(state.page.design) + renderAuthorship(state.page.authorship) +
          renderMissingData(state.page.missingData)
        : "") +
    (state.loading && state.page
      ? '<p class="course-authoring-loading" role="status">Atualizando o escopo…</p>'
      : "") +
    (state.failure
      ? '<div class="course-authoring-notice is-error" role="alert"><p>' +
        `${escapeHtml(state.failure)}</p>` + (state.reloadQuery
          ? '<button type="button" class="course-authoring-icon-action"' +
            ' data-course-analytics-action="reload" aria-label="Tentar novamente"' +
            ` title="Tentar novamente">${renderUiIcon(
              "rotate",
              "course-authoring-button-icon"
            )}</button>`
          : "") + "</div>"
      : "") + "</section>";
}

export function createCourseAnalyticsPanel({
  root,
  controller,
  course,
  initialQuery = undefined,
  expectedCourseRevision = course?.revision,
  onSnapshotDisplayed = null,
  download = downloadTextFile
} = {}) {
  const initialRevision = Number(expectedCourseRevision);
  if (!root || !controller || !course?.courseId || !Number.isSafeInteger(course.revision) ||
      !Number.isSafeInteger(initialRevision) || initialRevision < 1 ||
      typeof controller.loadCourseAuthoringAnalytics !== "function" ||
      onSnapshotDisplayed !== null && typeof onSnapshotDisplayed !== "function") {
    throw new TypeError("Painel de dados de autoria inválido.");
  }
  const state = {
    course: { ...course, revision: initialRevision },
    query: normalizeCourseAuthoringAnalyticsQuery(initialQuery),
    page: null,
    loading: false,
    failure: "",
    reloadQuery: null
  };

  const render = () => { root.innerHTML = renderPanel(state); };

  const load = async () => {
    const requestedQuery = state.query;
    state.loading = true;
    state.failure = "";
    state.reloadQuery = null;
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
      onSnapshotDisplayed?.(incoming);
    } catch (error) {
      state.failure = errorText(error);
      state.reloadQuery = requestedQuery;
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
      state.reloadQuery = null;
      const result = download({
        name: `aralearn-dados-de-autoria-edicao-${state.page.course.revision}.json`,
        type: "application/json;charset=utf-8",
        content: JSON.stringify(state.page, null, 2) + "\n"
      });
      render();
      return result;
    } catch (error) {
      state.failure = errorText(error);
      state.reloadQuery = null;
      render();
      return null;
    }
  };

  const onClick = (event) => {
    const node = event.target?.closest?.("[data-course-analytics-action]");
    if (node?.dataset.courseAnalyticsAction === "export-json") exportSnapshot();
    if (node?.dataset.courseAnalyticsAction === "reload" && !state.loading && state.reloadQuery) {
      state.query = state.reloadQuery;
      void load();
    }
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
          "O estado do curso para atualizar os dados de autoria é inválido."
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
