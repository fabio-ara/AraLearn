import {
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../domain/courseAuthoringAnalytics.js";
import { downloadTextFile } from "./downloadTextFile.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringComparison, normalizeCourseAuthoringComparison, normalizeCourseAuthoringExport, serializeCourseAuthoringExport } from "../domain/courseAuthoringComparison.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";

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
  return '<label class="course-analytics-scope" for="course-analytics-scope">Escopo' +
    '<select id="course-analytics-scope" name="scope">' +
    page.scope.options.map((option, index) => {
      const selected = option.kind === page.scope.selected.kind &&
        option.ref === page.scope.selected.ref;
      return `<option value="${index}"${selected ? " selected" : ""}>` +
        `${escapeHtml(option.label)}</option>`;
    }).join("") + '</select></label>';
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

function renderDesign(design, basis) {
  const practiceCount = sum(design.practiceByRequirement.map(({ opportunityCount }) => opportunityCount));
  const sourceCount = new Set(basis.studyUnits.flatMap(({ sourceLinks }) => sourceLinks.map(({ sourceId }) => sourceId))).size;
  return '<section class="course-analytics-area" aria-labelledby="course-analytics-design-title">' +
    '<header><h3 id="course-analytics-design-title">Desenho</h3>' +
    '<p>Configuração e composição efetivamente usadas neste escopo.</p></header>' +
    renderMetrics([{
      name: "Unidades de estudo", value: design.studyUnitCount, definition: "Unidades no escopo."
    }, {
      name: "Unidades de análise", value: basis.analysisUnits.length,
      definition: "Ideias acompanhadas no repertório."
    }, {
      name: "Prática", value: practiceCount, definition: "Oportunidades declaradas por exigência."
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

function iconAction(action, label, icon, disabled = false, extra = "") {
  return `<button type="button" data-course-analytics-action="${action}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${disabled ? " disabled" : ""}${extra}>${renderUiIcon(icon, "course-authoring-button-icon")}</button>`;
}
function selectedDimension(state, side = null) {
  return (side ? state.comparison?.dimensions : state.page?.dimensions)?.find(({ id }) => id === state.dimension) || null;
}
function dimensionReading(dimension, reading, sideName = "current") {
  return `<div class="course-analytics-reading"><p class="course-analytics-total">${reading.value === null ? "—" : formatCount(reading.value)} <small>${escapeHtml(dimension.unit)}</small></p>` +
    `<p class="course-analytics-caption">${plural(reading.denominator, "unidade observada", "unidades observadas")}` +
    (reading.missingCount ? ` · ${formatCount(reading.missingCount)} sem declaração` : "") +
    (reading.notApplicableCount ? ` · ${formatCount(reading.notApplicableCount)} não aplicável` : "") + '</p>' +
    (reading.distribution.length ? '<ul class="course-analytics-distribution" aria-label="Distribuição por unidade de estudo">' + reading.distribution.map((group, index) =>
      `<li><button type="button" data-course-analytics-action="drill" data-side="${sideName}" data-group="${index}" aria-label="Abrir ${formatCount(group.count)} unidades: ${escapeHtml(group.label)}">` +
      `<span>${escapeHtml(group.label)}</span><span class="course-analytics-bar" style="--share:${100 * group.count / reading.denominator}%" aria-hidden="true"></span><strong>${formatCount(group.count)}</strong></button></li>`).join("") + '</ul>' : '<p class="course-analytics-caption">Nenhuma observação aplicável neste escopo.</p>') + '</div>';
}
function parametersHtml(parameters, { single = false } = {}) {
  return parameters.map((entry) => '<details class="course-analytics-details"><summary>' + escapeHtml(entry.label) + '</summary>' +
    (single ? ["left"] : ["left", "right"]).map((side) => `<section><h4>${single ? "Escopo atual" : side === "left" ? "Curso de referência" : "Curso comparado"}</h4>` +
      (entry[side].values.length ? '<ul>' + entry[side].values.map((value) => '<li>' +
        escapeHtml(value.value === null ? "Escolha automática ainda não aplicada" : appliedValue(value.value)) +
        `<small>${escapeHtml(humanLabel(value.origin))} · ${plural(value.studyUnitRefs.length, "unidade", "unidades")}` +
        (value.sourceScope ? ` · ${escapeHtml(SOURCE_SCOPE_LABELS[value.sourceScope.kind] || "")}` : "") + '</small>' +
        `<p>${escapeHtml(value.reason || "Motivo não registrado na aplicação original.")}</p></li>`).join("") + '</ul>' : '') +
      (entry[side].missingCount ? `<p>${formatCount(entry[side].missingCount)} unidades sem valor aplicado registrado.</p>` : '') + '</section>').join("") + '</details>').join("");
}
function inventoryHtml(inventory) {
  return '<p class="course-analytics-caption">O inventário abrange os cursos completos, inclusive itens ainda não aplicados. Igualdade é literal e respeita repetições.</p>' +
    [["analysisUnits", "Unidades de análise"], ["evidenceRequirements", "Exigências de evidência"], ["sources", "Fontes"]].map(([key, label]) => {
      const value = inventory[key];
      return `<details class="course-analytics-details"><summary>${label}<small>${value.equal ? "Inventários literais iguais" : "Diferenças literais"} · ${value.leftCount} / ${value.rightCount}</small></summary>` +
        [["onlyLeft", "Somente no curso de referência"], ["onlyRight", "Somente no curso comparado"]].map(([side, heading]) => `<h4>${heading}</h4>` +
          (value[side].length ? '<ul>' + value[side].map((entry) => `<li><strong>${escapeHtml(entry.value.statement || entry.value.document?.title || entry.value.document?.citationText || "Fonte sem título")}</strong>` +
            (entry.value.description ? `<p>${escapeHtml(entry.value.description)}</p>` : '') +
            `<small>${plural(entry.count, "ocorrência", "ocorrências")}</small></li>`).join("") + '</ul>' : '<p>Nenhuma diferença literal.</p>')).join("") + '</details>';
    }).join("");
}
function sheetContent(state) {
  if (state.sheet === "configuration") return '<form data-course-analytics-configuration><label>Dimensão<select name="dimension">' +
    state.page.dimensions.map(({ id, label }) => `<option value="${id}"${id === state.dimension ? " selected" : ""}>${escapeHtml(label)}</option>`).join("") + '</select></label>' +
    renderScopeFilter(state.page) + '</form>';
  if (state.sheet === "details") return '<details class="course-analytics-details"><summary>Configuração solicitada</summary>' + parametersHtml(buildCourseAuthoringComparison({ left: state.page, right: state.page }).requestedParameters, { single: true }) + '</details><h3>Leitura aplicada e intervenções</h3>' + renderDesign(state.page.design, state.page.basis) + renderAuthorship(state.page.authorship) + renderMissingData(state.page.missingData);
  if (state.sheet === "compare") return '<form data-course-analytics-compare><label>Curso para comparar<select name="comparisonCourse"><option value="">Escolha um curso próprio</option>' +
    state.courses.map((course, index) => `<option value="${index}"${course.courseId === state.opponent?.course.id ? " selected" : ""}>${escapeHtml(course.title)}</option>`).join("") + '</select></label>' +
    (state.courseCursor ? '<button type="button" data-course-analytics-action="more-courses">Carregar mais cursos</button>' : '') +
    (state.opponent ? `<p class="course-analytics-caption">${escapeHtml(state.opponent.course.title)} · edição ${state.opponent.course.revision}</p><label>Escopo comparado<select name="comparisonScope">` +
      state.opponent.scope.options.map((scope, index) => `<option value="${index}"${scope.kind === state.opponent.scope.selected.kind && scope.ref === state.opponent.scope.selected.ref ? " selected" : ""}>${escapeHtml(scope.label)}</option>`).join("") + '</select></label>' : '') +
    `<p class="course-analytics-caption">Referência: ${escapeHtml(state.page.scope.selected.label)} · edição ${state.page.course.revision}. As duas edições serão conferidas novamente.</p></form>` +
    (state.comparison ? '<details class="course-analytics-details"><summary>Inventário planejado</summary>' + inventoryHtml(state.comparison.inventory) + '</details>' +
      '<details class="course-analytics-details"><summary>Configuração solicitada</summary>' + parametersHtml(state.comparison.requestedParameters) + '</details>' +
      '<details class="course-analytics-details"><summary>Configuração aplicada</summary>' + parametersHtml(state.comparison.appliedParameters) + '</details>' +
      `<p class="course-analytics-caption">${escapeHtml(state.comparison.semanticVerification.message)}</p>` : '');
  if (state.sheet === "drill") {
    const page = state.drill?.side === "right" ? state.opponent : state.page;
    return `<p class="course-analytics-caption">${escapeHtml(page.course.title)} · ${escapeHtml(page.scope.selected.label)} · edição ${page.course.revision}</p><ol class="course-analytics-unit-list">` +
      state.drill.refs.map((ref) => {
        const unit = page.basis.studyUnits.find((entry) => entry.studyUnitRef === ref);
        return unit ? `<li><a href="${escapeHtml(buildCourseAuthoringRoute(page.course.id, { section: "content", studyUnitId: ref }))}"><span>${unit.position}</span>${escapeHtml(unit.title)}</a></li>` : '';
      }).join("") + '</ol>';
  }
  if (state.sheet === "export") return '<p>Exportar o curso e a leitura de autoria desta edição?</p><p class="course-analytics-caption">O arquivo inclui o conteúdo integral do curso, o inventário planejado, os parâmetros solicitados e aplicados e as declarações e contagens do escopo escolhido. Não inclui arquivos PDF ou áudio, credenciais, pessoas, progresso pessoal ou conversas.</p>' +
    `<p>${escapeHtml(state.page.course.title)} · ${escapeHtml(state.page.scope.selected.label)} · edição ${state.page.course.revision}</p>`;
  return '';
}
function renderPanel(state) {
  const dimension = selectedDimension(state);
  const comparisonDimension = selectedDimension(state, "comparison");
  const busy = state.loading || state.busy;
  const failure = state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : '';
  const status = busy ? '<p class="course-analytics-caption" role="status">Carregando leitura…</p>' : '';
  const titles = { configuration: "Dimensão e escopo", compare: "Comparar cursos", details: "Dados e definições", drill: "Unidades desta distribuição", export: "Exportar curso e análise" };
  return '<section class="course-analytics" aria-label="Dados de autoria">' +
    '<header class="course-analytics-toolbar"><div>' + (dimension ? `<h3>${escapeHtml(dimension.label)}</h3><p class="course-analytics-caption">${escapeHtml(state.page.scope.selected.label)} · edição ${state.page.course.revision}</p>` : '<h3>Dados de autoria</h3>') + '</div><nav aria-label="Ações da análise">' +
    iconAction("configuration", "Escolher dimensão e escopo", "tags", busy || !state.page) + iconAction("compare", "Comparar cursos", "copy", busy || !state.page) +
    iconAction("details", "Abrir dados e definições", "review", busy || !state.page) + iconAction("export", "Exportar curso e análise", "download", busy || !state.page) + '</nav></header>' +
    (!state.sheet ? status + failure : '') +
    (dimension ? `<p class="course-analytics-caption">${escapeHtml(dimension.definition)}</p>` +
      (state.comparison ? '<div class="course-analytics-comparison"><section><h4>' + escapeHtml(state.comparison.left.course.title) + '</h4>' + dimensionReading(dimension, comparisonDimension.left, "left") + '</section><section><h4>' + escapeHtml(state.comparison.right.course.title) + '</h4>' + dimensionReading(dimension, comparisonDimension.right, "right") + '</section></div>' +
        `<p class="course-analytics-caption">${comparisonDimension.delta === null ? "Diferença numérica não aplicável." : `Diferença entre os totais: ${formatCount(comparisonDimension.delta)}.`} As contagens não avaliam qualidade ou equivalência semântica.</p>` +
        iconAction("clear-comparison", "Encerrar comparação", "remove-state", busy) : dimensionReading(dimension, dimension)) : '') +
    ((!state.page || state.failure) && !busy ? iconAction("reload", "Atualizar leitura", "rotate") : '') +
    (state.sheet ? `<dialog class="course-analytics-sheet" aria-labelledby="course-analytics-sheet-title"><header><h2 id="course-analytics-sheet-title">${titles[state.sheet]}</h2>` + iconAction("close-sheet", "Fechar análise contextual", "remove-state", busy) + '</header><div class="course-analytics-sheet-feedback" aria-live="polite">' + status + failure + '</div>' +
      '<div class="course-analytics-sheet-body"><fieldset' + (busy ? ' disabled' : '') + '>' + sheetContent(state) + '</fieldset></div><footer>' +
      (state.sheet === "configuration" ? '<button type="button" data-course-analytics-action="apply-configuration"' + (busy ? ' disabled' : '') + '>Aplicar leitura</button>' : '') +
      (state.sheet === "compare" ? '<button type="button" data-course-analytics-action="apply-comparison"' + (busy || !state.opponent ? ' disabled' : '') + '>Comparar estas edições</button>' : '') +
      (state.sheet === "export" ? '<button type="button" data-course-analytics-action="export-json"' + (busy ? ' disabled' : '') + '>Baixar arquivo JSON</button>' : '') + '</footer></dialog>' : '') + '</section>';
}

export function createCourseAnalyticsPanel({ root, controller, course, initialQuery = undefined, expectedCourseRevision = course?.revision, onSnapshotDisplayed = null, download = downloadTextFile } = {}) {
  if (!root || !controller || !course?.courseId || !Number.isSafeInteger(expectedCourseRevision) || expectedCourseRevision < 1 || typeof controller.loadCourseAuthoringAnalytics !== "function") throw new TypeError("Painel de dados de autoria inválido.");
  const state = { course: { ...course, revision: expectedCourseRevision }, query: normalizeCourseAuthoringAnalyticsQuery(initialQuery), page: null, dimension: "novelty", sheet: null, returnAction: null, loading: false, busy: false, failure: "", comparison: null, opponent: null, courses: [], courseCursor: null, drill: null };
  let epoch = 0; let destroyed = false;
  const render = () => {
    if (destroyed) return;
    const dialog = root.querySelector?.("dialog"); const active = root.ownerDocument?.activeElement;
    const focusedName = dialog?.contains?.(active) ? active.name : null;
    const scrollTop = dialog?.querySelector?.(".course-analytics-sheet-body")?.scrollTop || 0;
    dialog?.close?.(); root.innerHTML = renderPanel(state);
    const next = root.querySelector?.("dialog");
    if (next) {
      next.addEventListener("cancel", (event) => { event.preventDefault(); event.stopPropagation(); closeSheet(); });
      next.addEventListener("keydown", (event) => { event.stopPropagation(); trapAuthoringConfirmationTab({ event, root, confirmationSelector: ".course-analytics-sheet" }); });
      next.showModal?.();
      if (focusedName) [...next.querySelectorAll("[name]")].find((node) => node.name === focusedName)?.focus({ preventScroll: true });
      next.querySelector(".course-analytics-sheet-body").scrollTop = scrollTop;
    }
  };
  function closeSheet() {
    if (state.loading || state.busy) return;
    const action = state.returnAction; state.sheet = null; state.failure = ""; render();
    root.querySelector?.(`[data-course-analytics-action='${action}']`)?.focus?.({ preventScroll: true });
  }
  async function load({ close = false } = {}) {
    const ownEpoch = ++epoch; const query = structuredClone(state.query); const revision = state.course.revision;
    state.loading = true; state.failure = ""; render();
    try {
      const incoming = normalizeCourseAuthoringAnalyticsPage(await controller.loadCourseAuthoringAnalytics(state.course.courseId, { expectedCourseRevision: revision, query }), { expectedCourseId: state.course.courseId, expectedRevision: revision, expectedQuery: query });
      if (destroyed || epoch !== ownEpoch) return false;
      state.page = incoming; state.comparison = null; onSnapshotDisplayed?.(incoming); if (close) state.sheet = null;
      return true;
    } catch (error) { if (!destroyed && epoch === ownEpoch) { state.failure = errorText(error); if ([403, 404].includes(error?.status)) { state.page = null; state.comparison = null; state.sheet = null; } } return false; }
    finally { if (!destroyed && epoch === ownEpoch) { state.loading = false; render(); } }
  }
  async function readCourses(append = false) {
    if (typeof controller.listCourses !== "function") { state.failure = "A lista de cursos próprios não está disponível."; render(); return; }
    const ownEpoch = epoch; state.busy = true; state.failure = ""; render();
    try {
      const page = await controller.listCourses({ limit: 24, cursor: append ? state.courseCursor : null });
      if (destroyed || ownEpoch !== epoch) return;
      if (!Array.isArray(page?.items) || page.hasMore && (!page.nextCursor || JSON.stringify(page.nextCursor) === JSON.stringify(state.courseCursor))) throw new Error("Paginação inválida");
      const items = page.items.filter((item) => item.ownership === "owned" && item.canEdit === true);
      state.courses = [...new Map([...(append ? state.courses : []), ...items].map((item) => [item.courseId, item])).values()];
      state.courseCursor = page.hasMore ? page.nextCursor : null;
    } catch (error) { state.failure = errorText(error); }
    finally { if (!destroyed && epoch === ownEpoch) { state.busy = false; render(); } }
  }
  async function readOpponent(index) {
    const opponent = state.courses[index]; if (!opponent) return;
    const ownEpoch = epoch; state.busy = true; state.failure = ""; render();
    try {
      const query = { scope: { kind: "course", ref: null } };
      const page = normalizeCourseAuthoringAnalyticsPage(await controller.loadCourseAuthoringAnalytics(opponent.courseId, { expectedCourseRevision: opponent.revision, query }), { expectedCourseId: opponent.courseId, expectedRevision: opponent.revision, expectedQuery: query });
      if (!destroyed && ownEpoch === epoch) state.opponent = page;
    } catch (error) { state.failure = errorText(error); state.opponent = null; }
    finally { if (!destroyed && ownEpoch === epoch) { state.busy = false; render(); } }
  }
  async function compare() {
    if (!state.opponent || typeof controller.loadCourseAuthoringComparison !== "function") return;
    const selected = state.opponent.scope.options[Number(root.querySelector?.("[name='comparisonScope']")?.value ?? 0)];
    if (!selected) return;
    const scope = { kind: selected.kind, ref: selected.ref };
    const request = { left: { courseId: state.page.course.id, expectedRevision: state.page.course.revision, scope: { kind: state.page.scope.selected.kind, ref: state.page.scope.selected.ref } }, right: { courseId: state.opponent.course.id, expectedRevision: state.opponent.course.revision, scope } };
    const ownEpoch = epoch; state.busy = true; state.failure = ""; render();
    try {
      const opponent = normalizeCourseAuthoringAnalyticsPage(await controller.loadCourseAuthoringAnalytics(request.right.courseId, { expectedCourseRevision: request.right.expectedRevision, query: { scope } }), { expectedCourseId: request.right.courseId, expectedRevision: request.right.expectedRevision, expectedQuery: { scope } });
      const result = normalizeCourseAuthoringComparison(await controller.loadCourseAuthoringComparison(request), { expectedRequest: request });
      if (destroyed || ownEpoch !== epoch) return;
      state.opponent = opponent; state.comparison = result;
      // Keep the result options available in this sheet; closing reveals the paired distribution.
    } catch (error) { state.comparison = null; state.failure = errorText(error); }
    finally { if (!destroyed && ownEpoch === epoch) { state.busy = false; render(); } }
  }
  async function exportArtifact() {
    if (!state.page || state.busy || typeof controller.exportCourseAuthoring !== "function") return null;
    const expectedSelection = { courseId: state.page.course.id, expectedRevision: state.page.course.revision, scope: { kind: state.page.scope.selected.kind, ref: state.page.scope.selected.ref } };
    const ownEpoch = epoch; state.busy = true; state.failure = ""; render();
    try {
      const result = normalizeCourseAuthoringExport(await controller.exportCourseAuthoring(expectedSelection), { expectedSelection });
      if (destroyed || ownEpoch !== epoch) return null;
      return download({ name: `aralearn-curso-e-analise-edicao-${result.course.revision}.json`, type: "application/json;charset=utf-8", content: serializeCourseAuthoringExport(result) });
    } catch (error) { state.failure = errorText(error); return null; }
    finally { if (!destroyed && ownEpoch === epoch) { state.busy = false; render(); } }
  }
  function onClick(event) {
    const node = event.target?.closest?.("[data-course-analytics-action]"); const action = node?.dataset.courseAnalyticsAction;
    if (!action || state.loading || state.busy) return;
    if (["configuration", "details", "compare", "export"].includes(action)) {
      state.sheet = action; state.returnAction = action; state.failure = ""; render();
      if (action === "compare" && !state.courses.length) void readCourses();
    } else if (action === "close-sheet") closeSheet();
    else if (action === "export-json") void exportArtifact();
    else if (action === "more-courses") void readCourses(true);
    else if (action === "apply-comparison") void compare();
    else if (action === "reload") void (async () => {
      if (typeof controller.getCourse === "function") {
        try {
          const courseValue = await controller.getCourse(state.course.courseId);
          if (destroyed) return;
          if (courseValue?.courseId !== state.course.courseId || courseValue.ownership !== "owned" || courseValue.canEdit !== true || !Number.isSafeInteger(courseValue.revision)) throw new Error("Curso próprio indisponível");
          state.course.revision = courseValue.revision;
        } catch (error) { state.failure = errorText(error); state.page = null; state.comparison = null; state.sheet = null; render(); return; }
      }
      await load();
    })();
    else if (action === "clear-comparison") { state.comparison = null; render(); }
    else if (action === "apply-configuration") {
      const dimension = root.querySelector?.("[name='dimension']")?.value;
      const index = Number(root.querySelector?.("[name='scope']")?.value ?? 0);
      const selected = state.page.scope.options[index];
      if (!selected || !state.page.dimensions.some(({ id }) => id === dimension)) return;
      state.dimension = dimension;
      const changed = selected.kind !== state.page.scope.selected.kind || selected.ref !== state.page.scope.selected.ref;
      state.query = normalizeCourseAuthoringAnalyticsQuery({ scope: { kind: selected.kind, ref: selected.ref } });
      if (changed) void load({ close: true }); else closeSheet();
    } else if (action === "drill") {
      const reading = node.dataset.side === "current" ? selectedDimension(state) : selectedDimension(state, "comparison")?.[node.dataset.side];
      const group = reading?.distribution[Number(node.dataset.group)]; if (!group) return;
      state.drill = { side: node.dataset.side, refs: group.studyUnitRefs }; state.sheet = "drill"; state.returnAction = "drill"; render();
    }
  }
  function onChange(event) {
    if (event.target?.name === "comparisonCourse" && event.target.value !== "" && !state.busy && !state.loading) void readOpponent(Number(event.target.value));
  }
  function onSubmit(event) {
    if (event.target?.matches?.("[data-course-analytics-scope], [data-course-analytics-configuration], [data-course-analytics-compare]")) event.preventDefault();
  }
  root.addEventListener("click", onClick); root.addEventListener("change", onChange); root.addEventListener("submit", onSubmit); render();
  return { open: load, export: exportArtifact, refresh(nextRevision = state.course.revision) { if (!Number.isSafeInteger(nextRevision) || nextRevision < 1) return Promise.reject(new TypeError("A edição do curso é inválida.")); state.course.revision = nextRevision; return load(); }, destroy() { destroyed = true; epoch += 1; root.querySelector?.("dialog")?.close?.(); root.removeEventListener("click", onClick); root.removeEventListener("change", onChange); root.removeEventListener("submit", onSubmit); root.innerHTML = ""; } };
}
export { renderPanel as renderCourseAnalyticsPanel };
