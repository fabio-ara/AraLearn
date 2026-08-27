import {
  COURSE_AUTHORING_ANALYTICS_CHANNELS,
  COURSE_AUTHORING_ANALYTICS_DATASETS,
  COURSE_AUTHORING_ANALYTICS_EXPORT_CONTRACT,
  assembleCourseAuthoringAnalyticsExport,
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery,
  serializeCourseAuthoringAnalyticsCsv
} from "../domain/courseAuthoringAnalytics.js";
import { downloadTextFile, TEXT_EXPORT_MAX_BYTES } from "./downloadTextFile.js";
import { renderUiIcon } from "./renderUiIcons.js";
const exportEncoder = new TextEncoder();
const DATASET_LABELS = Object.freeze({
  activity: "Atividade do Curso",
  materializations: "Produção por Partes",
  design: "Decisões de desenho",
  sources: "Fontes e atribuições",
  annotations: "Observações",
  audits: "Auditorias e correções",
  variants: "Variantes"
});

const CHANNEL_LABELS = Object.freeze({
  authoring_interface: "Interface de Autoria",
  authoring_chat: "Conversa com o assistente",
  study_interface: "Estudo",
  audit_process: "Processo de auditoria"
});

const FACT_KIND_LABELS = Object.freeze({
  create_course: "Curso criado",
  update_course_metadata: "Dados do Curso atualizados",
  replace_course_composition: "Composição do Curso substituída",
  update_course_instructional_plan: "Planejamento instrucional atualizado",
  advance_course_authoring_part_materialization: "Materialização da Parte avançada",
  update_course_design: "Desenho do Curso atualizado",
  update_course_sources: "Fontes do Curso atualizadas",
  grant_course_access: "Acesso ao Curso concedido",
  revoke_course_access: "Acesso ao Curso revogado",
  apply_authoring_correction: "Correção de Autoria aplicada",
  rollback_authoring_correction: "Correção de Autoria revertida",
  plan_changed: "Planejamento alterado",
  materialization_started: "Materialização iniciada",
  materialization_step_recorded: "Etapa de materialização registrada",
  materialization_finished: "Materialização finalizada",
  course_source_changed: "Fontes do Curso alteradas",
  part_materialization_pending: "Materialização da Parte pendente",
  part_materialization_running: "Materialização da Parte em andamento",
  part_materialization_completed: "Materialização da Parte concluída",
  part_materialization_failed: "Materialização da Parte com falha",
  design_parameter_set: "Parâmetro de desenho definido",
  design_parameter_clear: "Parâmetro de desenho removido",
  authoring_guidance_set: "Orientação de Autoria definida",
  authoring_guidance_clear: "Orientação de Autoria removida",
  authoring_guidance_interpreted: "Orientação de Autoria interpretada",
  component_policy_set: "Política de componentes definida",
  component_policy_clear: "Política de componentes removida",
  source_active: "Fonte ativa",
  source_retired: "Fonte retirada",
  source_unresolved_legacy: "Fonte importada pendente de identificação",
  source_anchor_active: "Âncora de Fonte ativa",
  source_anchor_retired: "Âncora de Fonte retirada",
  source_attribution_recorded: "Atribuição de Fonte registrada",
  source_attachment_recorded: "Anexo de Fonte registrado",
  annotation_created: "Observação criada",
  annotation_revised: "Observação revisada",
  annotation_classification_corrected: "Classificação da Observação corrigida",
  annotation_considered: "Observação considerada",
  annotation_responded: "Observação respondida",
  annotation_resolved: "Observação resolvida",
  annotation_reopened: "Observação reaberta",
  annotation_withdrawn: "Observação retirada",
  audit_run_audit: "Auditoria realizada",
  audit_run_verification: "Verificação realizada",
  audit_finding_recorded: "Achado de auditoria registrado",
  audit_finding_dismissed: "Achado de auditoria descartado",
  audit_finding_reopened: "Achado de auditoria reaberto",
  audit_finding_correction_applied: "Correção aplicada ao achado de auditoria",
  audit_finding_resolved: "Achado de auditoria resolvido",
  audit_finding_still_open: "Achado de auditoria mantido aberto",
  audit_finding_rolled_back: "Correção do achado de auditoria revertida",
  authoring_correction_proposed: "Correção de Autoria proposta",
  authoring_correction_rejected: "Correção de Autoria rejeitada",
  authoring_correction_applied: "Correção de Autoria aplicada",
  authoring_correction_verified: "Correção de Autoria verificada",
  authoring_correction_rolled_back: "Correção de Autoria revertida",
  variant_checkpoint_recorded: "Marco de comparação de variantes registrado",
  variant_comparison_recorded: "Comparação de variantes registrada",
  variant_member_attached: "Variante vinculada à comparação",
  variant_member_detached: "Variante retirada da comparação"
});

const ORIGIN_LABELS = Object.freeze({
  automatic: "Processo automático",
  author: "Pessoa autora",
  research_condition: "Condição de pesquisa",
  migration: "Estado importado",
  learner: "Pessoa estudante",
  human_audit: "Auditoria humana",
  automatic_audit: "Auditoria automática",
  unknown_legacy: "Origem não registrada"
});

const STATE_LABELS = Object.freeze({
  pending: "Pendente",
  running: "Em andamento",
  completed: "Conclusão registrada",
  failed: "Falha registrada",
  set: "Definição registrada",
  clear: "Remoção registrada",
  active: "Em atividade",
  retired: "Retirada registrada",
  unresolved_legacy: "Pendente de identificação",
  recorded: "Registro concluído",
  created: "Criação registrada",
  revised: "Revisão registrada",
  classification_corrected: "Correção da classificação registrada",
  considered: "Consideração registrada",
  responded: "Resposta registrada",
  resolved: "Resolução registrada",
  reopened: "Reabertura registrada",
  withdrawn: "Retirada registrada",
  open: "Em aberto",
  awaiting_verification: "Aguardando verificação",
  dismissed: "Descarte registrado",
  still_open: "Permanece em aberto",
  proposed: "Proposta registrada",
  rejected: "Rejeição registrada",
  applied: "Aplicação registrada",
  verified: "Verificação concluída",
  rolled_back: "Reversão registrada",
  attached: "Vínculo ativo",
  detached: "Vínculo encerrado"
});

const VALUE_KEY_LABELS = Object.freeze({
  operation: "Operação",
  activity_kind: "Tipo de atividade",
  created_count: "Itens criados",
  updated_count: "Itens atualizados",
  deleted_count: "Itens excluídos",
  materialization_version: "Versão da materialização",
  authoring_part_version: "Versão da Parte",
  duration_milliseconds: "Duração em milissegundos",
  step_count: "Etapas",
  produced_study_units: "Unidades de estudo produzidas",
  configuration_hash: "Identificador da configuração",
  action: "Ação",
  parameter_id: "Parâmetro",
  catalog_version: "Versão do catálogo",
  value_kind: "Tipo de valor",
  configuration_item_count: "Itens da configuração",
  guidance_hash: "Identificador da orientação",
  guidance_character_count: "Caracteres da orientação",
  interpretation_hash: "Identificador da interpretação",
  source_revision: "Revisão da Fonte",
  source_kind: "Tipo de Fonte",
  study_visibility: "Visibilidade no Estudo",
  has_citation: "Possui citação",
  has_url: "Possui endereço",
  attachment_count: "Anexos",
  anchor_revision: "Revisão da Âncora",
  selector_kind: "Tipo de localização",
  has_verification_excerpt: "Possui trecho de verificação",
  target_version: "Versão do objeto",
  attribution_revision: "Revisão da atribuição",
  source_count: "Fontes",
  anchor_count: "Âncoras",
  attribution_hash: "Identificador da atribuição",
  content_hash: "Identificador do conteúdo",
  byte_size: "Tamanho em bytes",
  media_type: "Tipo de mídia",
  annotation_version: "Versão da Observação",
  event_type: "Tipo do evento",
  target_kind: "Tipo do objeto",
  category: "Categoria",
  subject_count: "Assuntos",
  observed_target_version: "Versão observada do objeto",
  automatic_method: "Método automático",
  automatic_method_version: "Versão do método automático",
  effective_method: "Método vigente",
  effective_method_version: "Versão do método vigente",
  effective_taxonomy_revision: "Revisão da taxonomia vigente",
  run_kind: "Tipo de execução",
  method_id: "Método",
  method_version: "Versão do método",
  check_count: "Verificações",
  findings_created: "Achados criados",
  context_hash: "Identificador do contexto",
  finding_version: "Versão do achado",
  decision: "Decisão",
  code: "Código",
  severity: "Gravidade",
  annotation_count: "Observações",
  correction_version: "Versão da correção",
  base_target_version: "Versão inicial do objeto",
  applied_target_version: "Versão aplicada do objeto",
  verification_outcome: "Resultado da verificação",
  rollback_course_revision: "Revisão do Curso após reversão",
  source_plan_version: "Versão do planejamento de origem",
  set_version: "Versão do conjunto",
  member_count: "Variantes",
  active_member_count: "Variantes vinculadas",
  checkpoint_id: "Marco de comparação",
  parameter_difference_count: "Diferenças de parâmetros",
  has_component_policy_difference: "Possui diferença na política de componentes"
});

const HIDDEN_VALUE_KEYS = new Set([
  "activity_kind",
  "code",
  "operation"
]);

const ENTITY_KIND_LABELS = Object.freeze({
  course: "Curso",
  module: "Módulo",
  lesson: "Lição",
  topic: "Assunto",
  didactic_microsequence: "Microssequência",
  study_unit: "Unidade de estudo",
  authoring_part: "Parte",
  materialization: "Materialização",
  design_parameter: "Parâmetro de desenho",
  guidance_revision: "Revisão de orientação",
  source: "Fonte",
  source_anchor: "Âncora de Fonte",
  source_attachment: "Anexo de Fonte",
  annotation: "Observação",
  anchored_annotation: "Observação",
  audit_run: "Execução de auditoria",
  audit_finding: "Achado de auditoria",
  variant_checkpoint: "Marco de comparação",
  variant_comparison: "Comparação de variantes"
});

const VALUE_KIND_LABELS = Object.freeze({
  integer: "Número inteiro",
  number: "Número",
  set: "Conjunto",
  string: "Texto",
  boolean: "Sim ou não"
});

const SOURCE_KIND_LABELS = Object.freeze({
  web_page: "Página da internet",
  article: "Artigo",
  book: "Livro",
  document: "Documento",
  media: "Mídia",
  other: "Outro"
});

const STUDY_VISIBILITY_LABELS = Object.freeze({
  hidden: "Oculta",
  citation: "Citação",
  citation_and_link: "Citação e endereço"
});

const SELECTOR_KIND_LABELS = Object.freeze({
  page_range: "Intervalo de páginas",
  time_range: "Intervalo de tempo",
  uri_fragment: "Trecho do endereço",
  text_quote: "Trecho de texto"
});

const ANNOTATION_CATEGORY_LABELS = Object.freeze({
  question: "Pergunta",
  possible_error: "Possível erro",
  confusing: "Trecho confuso",
  suggestion: "Sugestão"
});

const CLASSIFICATION_METHOD_LABELS = Object.freeze({
  exact_topic_target: "Assunto indicado pelo objeto",
  target_scope_unclassified: "Escopo sem classificação",
  legacy_unclassified: "Registro importado sem classificação",
  human_topic_selection: "Assuntos selecionados por uma pessoa"
});

const RUN_KIND_LABELS = Object.freeze({
  audit: "Auditoria",
  verification: "Verificação"
});

const SEVERITY_LABELS = Object.freeze({
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica"
});

const ACTION_LABELS = Object.freeze({
  set: "Definição",
  clear: "Remoção"
});

const ANNOTATION_EVENT_LABELS = Object.freeze({
  created: "Criação",
  revised: "Revisão",
  classification_corrected: "Correção da classificação",
  considered: "Consideração",
  responded: "Resposta",
  resolved: "Resolução",
  reopened: "Reabertura",
  withdrawn: "Retirada"
});

const AUDIT_DECISION_LABELS = Object.freeze({
  recorded: "Registro",
  dismissed: "Descarte",
  reopened: "Reabertura",
  correction_applied: "Correção aplicada",
  resolved: "Resolução",
  still_open: "Permanência em aberto",
  rolled_back: "Reversão"
});

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function errorText(error) {
  return String(error?.message || "Não foi possível carregar os fatos de Autoria.");
}

function formatNumber(value, unit) {
  if (value === null) return "Dado ausente";
  if (unit === "percentage") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value) + "%";
  }
  if (unit === "ratio") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value);
  }
  if (unit === "milliseconds") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value) + " ms";
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function unitLabel(value) {
  return ({
    count: "Contagem",
    milliseconds: "Milissegundos",
    ratio: "Proporção",
    percentage: "Porcentagem"
  })[value] || "Unidade não reconhecida";
}

function formatInstant(value) {
  if (!value) return "Instante ausente";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function factKindLabel(value) {
  return FACT_KIND_LABELS[value] || "Tipo de fato não reconhecido";
}

function originLabel(value) {
  return ORIGIN_LABELS[value] || "Origem não reconhecida";
}

function stateLabel(value) {
  return STATE_LABELS[value] || "Estado não reconhecido";
}

function factValueLabel(key) {
  return VALUE_KEY_LABELS[key] || "Dado registrado";
}

function factValueText(key, value) {
  if (value === null) return "ausente";
  if (typeof value === "boolean") return value ? "sim" : "não";
  const labels = {
    operation: FACT_KIND_LABELS,
    activity_kind: FACT_KIND_LABELS,
    action: ACTION_LABELS,
    value_kind: VALUE_KIND_LABELS,
    source_kind: SOURCE_KIND_LABELS,
    study_visibility: STUDY_VISIBILITY_LABELS,
    selector_kind: SELECTOR_KIND_LABELS,
    event_type: ANNOTATION_EVENT_LABELS,
    target_kind: ENTITY_KIND_LABELS,
    category: ANNOTATION_CATEGORY_LABELS,
    automatic_method: CLASSIFICATION_METHOD_LABELS,
    effective_method: CLASSIFICATION_METHOD_LABELS,
    run_kind: RUN_KIND_LABELS,
    decision: AUDIT_DECISION_LABELS,
    severity: SEVERITY_LABELS,
    verification_outcome: AUDIT_DECISION_LABELS
  }[key];
  return typeof value === "string" && labels?.[value] ? labels[value] : String(value);
}

function visibleValueKey(key) {
  return Object.hasOwn(VALUE_KEY_LABELS, key) &&
    !HIDDEN_VALUE_KEYS.has(key) &&
    !/(?:^|_)(?:hash|id)$/u.test(key);
}

function overviewEntryLabel(entry) {
  const key = String(entry?.key || "");
  if (DATASET_LABELS[key]) return DATASET_LABELS[key];
  if (FACT_KIND_LABELS[key]) return FACT_KIND_LABELS[key];
  if (STATE_LABELS[key]) return STATE_LABELS[key];
  if (key === "no_facts") return "Nenhum fato";
  const separator = key.indexOf(":");
  if (separator > 0) {
    const kind = key.slice(0, separator);
    const state = key.slice(separator + 1);
    const kindText = FACT_KIND_LABELS[kind];
    if (kindText) {
      return state && state !== "none" && STATE_LABELS[state]
        ? `${kindText} · ${STATE_LABELS[state]}`
        : kindText;
    }
  }
  return "Fato registrado";
}

function subjectLabel(subject) {
  const supplied = String(subject?.label || "").trim();
  const identifier = String(subject?.id || "").trim();
  const opaque = supplied === identifier ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(supplied) ||
    /^[0-9a-f]{32,}$/iu.test(supplied) ||
    /^[a-z_]+:[^\s]+$/u.test(supplied);
  if (supplied && !opaque) return supplied;
  return ENTITY_KIND_LABELS[subject?.kind] || "Objeto relacionado";
}

function renderFactMetadata(fact) {
  const entries = [];
  if (fact.channel && CHANNEL_LABELS[fact.channel]) {
    entries.push(["Canal", CHANNEL_LABELS[fact.channel]]);
  }
  if (fact.origin) entries.push(["Origem", originLabel(fact.origin)]);
  if (fact.state) entries.push(["Estado", stateLabel(fact.state)]);
  if (Number.isSafeInteger(fact.courseRevision) && fact.courseRevision > 0) {
    entries.push(["Revisão", String(fact.courseRevision)]);
  }
  return entries.length
    ? '<dl>' + entries.map(([label, value]) =>
      `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("") + '</dl>'
    : "";
}

function renderFilters(state) {
  const selectedDataset = state.query.datasets.length === COURSE_AUTHORING_ANALYTICS_DATASETS.length
    ? "all"
    : state.query.datasets[0];
  const selectedChannel = state.query.channels.length ? state.query.channels[0] : "all";
  const dateValue = (value) => value ? value.slice(0, 10) : "";
  return '<form class="course-analytics-filters" data-course-analytics-filters>' +
    '<label>Fatos<select name="dataset">' +
    '<option value="all">Todos os fatos</option>' +
    COURSE_AUTHORING_ANALYTICS_DATASETS.map((dataset) =>
      `<option value="${dataset}"${dataset === selectedDataset ? " selected" : ""}>` +
      `${escapeHtml(DATASET_LABELS[dataset])}</option>`
    ).join("") + '</select></label>' +
    '<label>Origem da interação<select name="channel">' +
    '<option value="all">Todas as origens</option>' +
    COURSE_AUTHORING_ANALYTICS_CHANNELS.map((channel) =>
      `<option value="${channel}"${channel === selectedChannel ? " selected" : ""}>` +
      `${escapeHtml(CHANNEL_LABELS[channel])}</option>`
    ).join("") + '</select></label>' +
    `<label>Desde<input name="from" type="date" value="${escapeHtml(dateValue(state.query.from))}"></label>` +
    `<label>Até<input name="to" type="date" value="${escapeHtml(dateValue(state.query.to))}"></label>` +
    '<button type="submit" aria-label="Aplicar filtros" title="Aplicar filtros">' +
    `${renderUiIcon("search", "course-authoring-button-icon")}</button></form>`;
}

function renderOverview(page) {
  const metric = page.metrics.find(({ id }) => id === page.overview.metricId);
  const series = page.overview.series;
  const finiteValues = series.map(({ value }) => value).filter((value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0);
  const maximum = Math.max(1, ...finiteValues);
  const displaySeries = series.map((entry) => ({
    ...entry,
    displayLabel: overviewEntryLabel(entry)
  }));
  return '<section class="course-analytics-overview" aria-labelledby="course-analytics-overview-title">' +
    '<header><div><h3 id="course-analytics-overview-title">' + escapeHtml(page.overview.title) + '</h3>' +
    `</div><span>Revisão ${page.courseRevision}</span></header>` +
    (displaySeries.length
      ? '<div class="course-analytics-chart" role="img" aria-label="' +
        escapeHtml(`${page.overview.title}. ${displaySeries.map((entry) =>
          `${entry.displayLabel}: ${formatNumber(entry.value, entry.unit)}`).join("; ")}`) + '">' +
        displaySeries.map((entry) => {
          const width = entry.value === null || entry.value < 0
            ? 0
            : Math.max(1, Math.min(100, entry.value / maximum * 100));
          return '<div class="course-analytics-bar"><span>' + escapeHtml(entry.displayLabel) + '</span>' +
            '<span class="course-analytics-bar-track" aria-hidden="true"><span style="width:' +
            width + '%"></span></span><strong>' + escapeHtml(formatNumber(entry.value, entry.unit)) +
            '</strong></div>';
        }).join("") + '</div>' +
        '<div class="course-analytics-table-wrap"><table><caption>Valores equivalentes ao gráfico</caption>' +
        '<thead><tr><th>Categoria</th><th>Valor</th><th>Denominador</th><th>Ausência</th></tr></thead><tbody>' +
        displaySeries.map((entry) => '<tr><th scope="row" data-label="Categoria">' + escapeHtml(entry.displayLabel) +
          '</th><td data-label="Valor">' + escapeHtml(formatNumber(entry.value, entry.unit)) +
          '</td><td data-label="Denominador">' +
          escapeHtml(entry.denominator === null ? "Não se aplica" : String(entry.denominator)) +
          '</td><td data-label="Ausência">' + (entry.missing ? "Sim" : "Não") + '</td></tr>').join("") +
        '</tbody></table></div>'
      : '<p class="course-authoring-empty-copy">Não há linhas neste recorte. A ausência não foi convertida em zero.</p>') +
    (metric ? '<details class="course-analytics-definition"><summary class="course-analytics-disclosure-trigger">' +
      `${renderUiIcon("review", "course-authoring-button-icon")}<span>Métrica</span></summary>` +
      `<dl><div><dt>Pergunta</dt><dd>${escapeHtml(metric.question)}</dd></div>` +
      `<div><dt>Definição</dt><dd>${escapeHtml(metric.definition)}</dd></div>` +
      `<div><dt>Unidade</dt><dd>${escapeHtml(unitLabel(metric.unit))}</dd></div>` +
      `<div><dt>Denominador</dt><dd>${escapeHtml(metric.denominator || "Não se aplica")}</dd></div>` +
      `<div><dt>Dados ausentes</dt><dd>${escapeHtml(metric.missingData)}</dd></div></dl>` +
      (metric.prohibitedInferences.length ? '<p><strong>Esta métrica não permite concluir:</strong> ' +
        escapeHtml(metric.prohibitedInferences.join(" ")) + '</p>' : "") + '</details>' : "") +
    '</section>';
}

function valuesSummary(values) {
  const entries = Object.entries(values).filter(([key]) => visibleValueKey(key));
  return entries.length
    ? entries.map(([key, value]) =>
      `${factValueLabel(key)}: ${factValueText(key, value)}`).join(" · ")
    : "";
}

function renderFacts(page) {
  return '<section class="course-analytics-facts" aria-labelledby="course-analytics-facts-title">' +
    '<header><div><h3 id="course-analytics-facts-title">Fatos do recorte</h3></div></header>' +
    (page.facts.length
      ? '<ol>' + page.facts.map((fact) => {
        const label = subjectLabel(fact.subject);
        const summary = valuesSummary(fact.values);
        return '<li><article>' +
          '<header><div><strong>' + escapeHtml(label) + '</strong>' +
          `<span>${escapeHtml(DATASET_LABELS[fact.dataset] || "Fatos do Curso")} · ${escapeHtml(factKindLabel(fact.kind))}</span>` +
          `</div><time datetime="${escapeHtml(fact.occurredAt)}">${escapeHtml(formatInstant(fact.occurredAt))}</time></header>` +
          (summary ? `<p>${escapeHtml(summary)}</p>` : "") +
          renderFactMetadata(fact) +
          (fact.missingData.length ? '<details class="course-analytics-missing"><summary class="course-analytics-disclosure-trigger course-authoring-icon-action" aria-label="Ver dados ausentes" title="Dados ausentes">' +
            `${renderUiIcon("more", "course-authoring-button-icon")}</summary><p>` +
            escapeHtml(fact.missingData.join(" ")) + '</p></details>' : "") +
          (fact.deepLink ? `<a href="${escapeHtml(fact.deepLink)}" aria-label="Abrir ${escapeHtml(label)}" title="Abrir objeto relacionado">` +
            `${renderUiIcon("arrow-right", "course-authoring-button-icon")}</a>` : "") +
          '</article></li>';
      }).join("") + '</ol>'
      : '<p class="course-authoring-empty-copy">Nenhum fato corresponde ao recorte.</p>') +
    '</section>';
}

function renderPanel(state) {
  return '<section class="course-authoring-section course-analytics" aria-labelledby="course-analytics-section-title">' +
    '<header class="course-authoring-section-heading"><div>' +
    '<h2 id="course-analytics-section-title">Pesquisa</h2></div>' +
    '<div class="course-analytics-export-actions">' +
    `<button type="button" data-course-analytics-action="export-csv"${!state.page || state.exporting ? " disabled" : ""}>CSV</button>` +
    `<button type="button" data-course-analytics-action="export-json"${!state.page || state.exporting ? " disabled" : ""}>JSON</button>` +
    '</div></header>' +
    renderFilters(state) +
    (state.loading && !state.page
      ? '<p class="course-authoring-loading" role="status">Carregando fatos de Autoria…</p>'
      : state.page ? renderOverview(state.page) + renderFacts(state.page) : "") +
    (state.page?.limitations?.length ? '<details class="course-analytics-limitations"><summary class="course-analytics-disclosure-trigger">' +
      `${renderUiIcon("review", "course-authoring-button-icon")}<span>Limites</span></summary><ul>` +
      state.page.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("") + '</ul></details>' : "") +
    (state.page?.nextCursor ? `<button type="button" data-course-analytics-action="more" aria-label="Carregar mais fatos" title="Carregar mais fatos"${state.loading ? " disabled" : ""}>` +
      `${renderUiIcon("arrow-down", "course-authoring-button-icon")}</button>` : "") +
    (state.exporting ? '<p class="course-authoring-loading" role="status">Preparando a exportação do recorte…</p>' : "") +
    (state.failure ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>` : "") +
    '</section>';
}

function mergePages(current, incoming) {
  if (!current) return incoming;
  return {
    ...incoming,
    facts: [...current.facts, ...incoming.facts]
  };
}

function dateBoundary(value, end = false) {
  if (!value) return null;
  return `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
}

export function createCourseAnalyticsPanel({
  root,
  controller,
  course,
  download = downloadTextFile
} = {}) {
  if (!root || !controller || !course?.courseId || !Number.isSafeInteger(course.revision) ||
      typeof controller.loadCourseAuthoringAnalytics !== "function") {
    throw new TypeError("Painel de Pesquisa inválido.");
  }
  const state = {
    course,
    query: normalizeCourseAuthoringAnalyticsQuery(),
    page: null,
    loading: false,
    exporting: false,
    failure: ""
  };
  const render = () => { root.innerHTML = renderPanel(state); };

  const load = async ({ append = false } = {}) => {
    state.loading = true;
    state.failure = "";
    render();
    try {
      const query = normalizeCourseAuthoringAnalyticsQuery({
        ...state.query,
        cursor: append ? state.page?.nextCursor || null : null
      });
      const incoming = normalizeCourseAuthoringAnalyticsPage(
        await controller.loadCourseAuthoringAnalytics(state.course.courseId, {
          expectedCourseRevision: state.course.revision,
          query
        }),
        { expectedCourseId: state.course.courseId, expectedQuery: query }
      );
      if (incoming.courseRevision !== state.course.revision) {
        state.course = { ...state.course, revision: incoming.courseRevision };
      }
      state.page = append ? mergePages(state.page, incoming) : incoming;
    } catch (error) {
      state.failure = errorText(error);
    } finally {
      state.loading = false;
      render();
    }
  };

  const collectPages = async (format) => {
    const pages = [];
    let cursor = null;
    const seen = new Set();
    let minimumBytes = 0;
    let factCount = 0;
    let csvHeaderBytes = null;
    let jsonEnvelopeBytes = null;
    do {
      if (cursor !== null && seen.has(cursor)) {
        throw new Error("A paginação repetiu o mesmo cursor.");
      }
      if (cursor !== null) seen.add(cursor);
      const query = normalizeCourseAuthoringAnalyticsQuery({ ...state.query, cursor });
      const page = normalizeCourseAuthoringAnalyticsPage(
        await controller.loadCourseAuthoringAnalytics(state.course.courseId, {
          expectedCourseRevision: state.course.revision,
          query
        }),
        { expectedCourseId: state.course.courseId, expectedQuery: query }
      );
      if (format === "csv") {
        const csvSlice = {
          contract: COURSE_AUTHORING_ANALYTICS_EXPORT_CONTRACT,
          dictionaryVersion: page.dictionaryVersion,
          courseId: page.courseId,
          courseRevision: page.courseRevision,
          facts: page.facts
        };
        const emptyBytes = exportEncoder.encode(serializeCourseAuthoringAnalyticsCsv({
          ...csvSlice,
          facts: []
        })).byteLength;
        const sliceBytes = exportEncoder.encode(
          serializeCourseAuthoringAnalyticsCsv(csvSlice)
        ).byteLength;
        csvHeaderBytes ??= emptyBytes;
        minimumBytes += sliceBytes - emptyBytes;
      } else {
        jsonEnvelopeBytes ??= exportEncoder.encode(JSON.stringify(
          assembleCourseAuthoringAnalyticsExport([{
            ...page,
            facts: [],
            nextCursor: null
          }]),
          null,
          2
        ) + "\n").byteLength;
        for (const fact of page.facts) {
          const serialized = JSON.stringify(fact, null, 2);
          const lineCount = serialized.split("\n").length;
          minimumBytes += exportEncoder.encode(serialized).byteLength + (lineCount * 4);
          if (factCount > 0) minimumBytes += 2;
          factCount += 1;
        }
      }
      const projectedBytes = format === "csv"
        ? (csvHeaderBytes ?? 0) + minimumBytes
        : (jsonEnvelopeBytes ?? 0) + minimumBytes + (factCount > 0 ? 4 : 0);
      if (projectedBytes > TEXT_EXPORT_MAX_BYTES) {
        throw new RangeError(
          "A exportação excede 8 MiB. Restrinja o período, o conjunto ou o canal e tente novamente."
        );
      }
      pages.push(page);
      cursor = page.nextCursor;
      if (pages.length >= 100 && cursor !== null) {
        throw new Error("A exportação excedeu o limite seguro de páginas.");
      }
    } while (cursor !== null);
    return pages;
  };

  const exportFacts = async (format) => {
    state.exporting = true;
    state.failure = "";
    render();
    try {
      if (format !== "csv" && format !== "json") {
        throw new TypeError("O formato da exportação precisa ser CSV ou JSON.");
      }
      const assembled = assembleCourseAuthoringAnalyticsExport(await collectPages(format));
      const stem = `aralearn-analytics-${assembled.courseId}-r${assembled.courseRevision}`;
      download(format === "csv"
        ? {
          name: `${stem}.csv`,
          type: "text/csv;charset=utf-8",
          content: serializeCourseAuthoringAnalyticsCsv(assembled)
        }
        : {
          name: `${stem}.json`,
          type: "application/json;charset=utf-8",
          content: JSON.stringify(assembled, null, 2) + "\n"
        });
    } catch (error) {
      state.failure = errorText(error);
    } finally {
      state.exporting = false;
      render();
    }
  };

  const onSubmit = (event) => {
    if (!event.target?.matches?.("[data-course-analytics-filters]")) return;
    event.preventDefault();
    const values = new FormData(event.target);
    const dataset = values.get("dataset");
    const channel = values.get("channel");
    state.query = normalizeCourseAuthoringAnalyticsQuery({
      datasets: dataset === "all" ? [...COURSE_AUTHORING_ANALYTICS_DATASETS] : [dataset],
      channels: channel === "all" ? [] : [channel],
      from: dateBoundary(values.get("from")),
      to: dateBoundary(values.get("to"), true),
      limit: state.query.limit
    });
    state.page = null;
    void load();
  };

  const onClick = (event) => {
    const node = event.target?.closest?.("[data-course-analytics-action]");
    if (!node) return;
    const action = node.dataset.courseAnalyticsAction;
    if (action === "more" && state.page?.nextCursor) void load({ append: true });
    if (action === "export-csv") void exportFacts("csv");
    if (action === "export-json") void exportFacts("json");
  };

  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  render();
  return {
    open: () => load(),
    refresh: (nextCourseRevision = state.course.revision) => {
      const revision = Number(nextCourseRevision);
      if (!Number.isSafeInteger(revision) || revision < 1) {
        return Promise.reject(new TypeError("A revisão do Curso para atualizar a Pesquisa é inválida."));
      }
      state.course = { ...state.course, revision };
      return load();
    },
    export: (format) => exportFacts(format),
    destroy() {
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      root.innerHTML = "";
    }
  };
}

export { renderPanel as renderCourseAnalyticsPanel };
