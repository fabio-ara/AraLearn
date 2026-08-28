const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDENTIFIER = /^[a-z][a-z0-9._:-]{0,159}$/u;
const FACT_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

export const COURSE_AUTHORING_ANALYTICS_CONTRACT =
  "aralearn.course-authoring-analytics.v1";
export const COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION =
  "aralearn.course-authoring-analytics-dictionary.v1";
export const COURSE_AUTHORING_ANALYTICS_EXPORT_CONTRACT =
  "aralearn.course-authoring-analytics-export.v1";
export const COURSE_AUTHORING_ANALYTICS_ROWS_CONTRACT =
  "aralearn.course-authoring-analytics-rows.v1";

export const COURSE_AUTHORING_ANALYTICS_DATASETS = Object.freeze([
  "activity",
  "materializations",
  "design",
  "sources",
  "annotations",
  "audits",
  "variants"
]);

export const COURSE_AUTHORING_ANALYTICS_CHANNELS = Object.freeze([
  "authoring_interface",
  "authoring_chat",
  "study_interface",
  "audit_process"
]);

const DATASET_SET = new Set(COURSE_AUTHORING_ANALYTICS_DATASETS);
const CHANNEL_SET = new Set(COURSE_AUTHORING_ANALYTICS_CHANNELS);
const UNIT_SET = new Set(["count", "milliseconds", "ratio", "percentage"]);
const FORBIDDEN_FACT_KEYS = /^(?:actor_?id|user_?id|email|raw_?text|before_?snapshot|after_?snapshot)$/iu;

export class CourseAuthoringAnalyticsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CourseAuthoringAnalyticsError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CourseAuthoringAnalyticsError(code, message);
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

function exact(value, fields, label) {
  plainObject(value, label);
  const actual = Object.keys(value);
  if (actual.some((field) => !fields.includes(field)) ||
      fields.some((field) => !Object.hasOwn(value, field))) {
    fail("invalid_course_authoring_analytics", `${label} não possui a forma esperada.`);
  }
}

function hasInvalidControl(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 8 || code === 11 || code === 12 ||
      (code >= 14 && code <= 31) || (code >= 127 && code <= 159);
  });
}

function text(value, maximum, label, { empty = false } = {}) {
  if (typeof value !== "string" || value !== value.trim() ||
      (!empty && !value) || [...value].length > maximum || hasInvalidControl(value)) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

function nullableText(value, maximum, label) {
  return value === null ? null : text(value, maximum, label);
}

function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail("invalid_course_authoring_analytics", `${label} precisa ser UUID.`);
  }
  return value.toLowerCase();
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

function nullablePositiveInteger(value, label) {
  return value === null ? null : positiveInteger(value, label);
}

function timestamp(value, label) {
  const normalized = text(value, 40, label);
  if (Number.isNaN(Date.parse(normalized))) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return normalized;
}

function nullableTimestamp(value, label) {
  return value === null ? null : timestamp(value, label);
}

function identifier(value, label) {
  const normalized = text(value, 160, label);
  if (!IDENTIFIER.test(normalized)) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return normalized;
}

function factIdentifier(value, label) {
  const normalized = text(value, 240, label);
  if (!FACT_IDENTIFIER.test(normalized)) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return normalized;
}

function uniqueTexts(value, maximumItems, maximumLength, label, validator = null) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  const result = value.map((entry) => text(entry, maximumLength, label));
  if (validator && result.some((entry) => !validator(entry)) ||
      new Set(result).size !== result.length) {
    fail("invalid_course_authoring_analytics", `${label} contém valor inválido ou repetido.`);
  }
  return result;
}

function nullableCursor(value) {
  if (value === null) return null;
  const normalized = text(value, 2048, "O cursor");
  if (!/^[A-Za-z0-9_-]+$/u.test(normalized)) {
    fail("invalid_course_authoring_analytics", "O cursor é inválido.");
  }
  return normalized;
}

function deepLink(value, label) {
  const normalized = text(value, 2048, label);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return parsed.href;
}

function nullableDeepLink(value, label) {
  return value === null ? null : deepLink(value, label);
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

export function normalizeCourseAuthoringAnalyticsQuery(value = {}) {
  const source = plainObject(value, "O recorte de Analytics");
  const allowed = ["datasets", "channels", "origins", "states", "from", "to", "limit", "cursor"];
  if (Object.keys(source).some((field) => !allowed.includes(field))) {
    fail("invalid_course_authoring_analytics", "O recorte de Analytics contém campos desconhecidos.");
  }
  const datasets = source.datasets == null
    ? [...COURSE_AUTHORING_ANALYTICS_DATASETS]
    : uniqueTexts(source.datasets, DATASET_SET.size, 32, "Os conjuntos de fatos",
      (entry) => DATASET_SET.has(entry));
  if (!datasets.length) {
    fail("invalid_course_authoring_analytics", "Selecione ao menos um conjunto de fatos.");
  }
  const channels = source.channels == null
    ? []
    : uniqueTexts(source.channels, CHANNEL_SET.size, 32, "Os canais",
      (entry) => CHANNEL_SET.has(entry));
  const origins = source.origins == null
    ? []
    : uniqueTexts(source.origins, 16, 80, "As origens", (entry) => IDENTIFIER.test(entry));
  const states = source.states == null
    ? []
    : uniqueTexts(source.states, 24, 80, "Os estados", (entry) => IDENTIFIER.test(entry));
  const from = source.from == null ? null : nullableTimestamp(source.from, "O início do período");
  const to = source.to == null ? null : nullableTimestamp(source.to, "O fim do período");
  if (from !== null && to !== null && Date.parse(from) > Date.parse(to)) {
    fail("invalid_course_authoring_analytics", "O início do período precisa anteceder o fim.");
  }
  const limit = source.limit == null ? 100 : source.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    fail("invalid_course_authoring_analytics", "O limite precisa estar entre 1 e 200.");
  }
  return {
    datasets,
    channels,
    origins,
    states,
    from,
    to,
    limit,
    cursor: nullableCursor(source.cursor ?? null)
  };
}

function normalizeMissingData(value, label = "Os dados ausentes") {
  return uniqueTexts(value, 32, 240, label);
}

function normalizeMetricDefinition(value) {
  exact(value, [
    "id", "version", "label", "question", "definition", "unit", "denominator",
    "missingData", "prohibitedInferences"
  ], "A definição da métrica");
  const unit = identifier(value.unit, "A unidade da métrica");
  if (!UNIT_SET.has(unit)) {
    fail("invalid_course_authoring_analytics", "A unidade da métrica é desconhecida.");
  }
  return {
    id: identifier(value.id, "A identidade da métrica"),
    version: positiveInteger(value.version, "A versão da métrica"),
    label: text(value.label, 160, "O nome da métrica"),
    question: text(value.question, 500, "A pergunta da métrica"),
    definition: text(value.definition, 2000, "A definição da métrica"),
    unit,
    denominator: nullableText(value.denominator, 1000, "O denominador da métrica"),
    missingData: text(value.missingData, 1000, "A regra de ausência da métrica"),
    prohibitedInferences: uniqueTexts(
      value.prohibitedInferences,
      12,
      500,
      "As inferências vedadas"
    )
  };
}

function normalizeSeriesEntry(value, metric) {
  exact(value, ["key", "label", "value", "unit", "denominator", "missing"],
    "A linha da visualização");
  const unit = identifier(value.unit, "A unidade da visualização");
  if (unit !== metric.unit || value.value !== null &&
      (typeof value.value !== "number" || !Number.isFinite(value.value)) ||
      value.denominator !== null &&
      (typeof value.denominator !== "number" || !Number.isFinite(value.denominator) ||
        value.denominator < 0) || typeof value.missing !== "boolean" ||
      value.missing !== (value.value === null)) {
    fail("invalid_course_authoring_analytics", "A linha da visualização é inválida.");
  }
  return {
    key: factIdentifier(value.key, "A chave da visualização"),
    label: text(value.label, 240, "O rótulo da visualização"),
    value: value.value,
    unit,
    denominator: value.denominator,
    missing: value.missing
  };
}

function normalizeOverview(value, metrics) {
  exact(value, ["metricId", "title", "question", "series"], "A visão geral");
  const metricId = identifier(value.metricId, "A métrica da visão geral");
  const metric = metrics.find((entry) => entry.id === metricId);
  if (!metric || value.question !== metric.question ||
      !Array.isArray(value.series) || value.series.length > 64) {
    fail("invalid_course_authoring_analytics", "A visão geral é inválida.");
  }
  return {
    metricId,
    title: text(value.title, 240, "O título da visão geral"),
    question: value.question,
    series: value.series.map((entry) => normalizeSeriesEntry(entry, metric))
  };
}

function normalizeEntityReference(value, label) {
  exact(value, ["kind", "id", "label"], label);
  return {
    kind: identifier(value.kind, `O tipo de ${label}`),
    id: factIdentifier(value.id, `A identidade de ${label}`),
    label: nullableText(value.label, 300, `O rótulo de ${label}`)
  };
}

function normalizeFactValues(value) {
  const source = plainObject(value, "Os valores do fato");
  const entries = Object.entries(source);
  if (entries.length > 24) {
    fail("invalid_course_authoring_analytics", "O fato possui valores demais.");
  }
  const result = {};
  for (const [key, entry] of entries) {
    if (!IDENTIFIER.test(key) || FORBIDDEN_FACT_KEYS.test(key) ||
        entry !== null && !["string", "number", "boolean"].includes(typeof entry) ||
        typeof entry === "number" && !Number.isFinite(entry) ||
        typeof entry === "string" && ([...entry].length > 1000 || hasInvalidControl(entry))) {
      fail("invalid_course_authoring_analytics", "O fato contém um valor inválido ou sensível.");
    }
    result[key] = entry;
  }
  return result;
}

function normalizeFact(value) {
  exact(value, [
    "factId", "dataset", "kind", "occurredAt", "courseRevision", "channel", "origin",
    "state", "subject", "related", "values", "missingData", "deepLink"
  ], "O fato de Autoria");
  const dataset = identifier(value.dataset, "O conjunto do fato");
  if (!DATASET_SET.has(dataset)) {
    fail("invalid_course_authoring_analytics", "O conjunto do fato é desconhecido.");
  }
  const channel = value.channel === null
    ? null
    : identifier(value.channel, "O canal do fato");
  if (channel !== null && !CHANNEL_SET.has(channel)) {
    fail("invalid_course_authoring_analytics", "O canal do fato é desconhecido.");
  }
  return {
    factId: factIdentifier(value.factId, "A identidade do fato"),
    dataset,
    kind: identifier(value.kind, "O tipo do fato"),
    occurredAt: timestamp(value.occurredAt, "O instante do fato"),
    courseRevision: nullablePositiveInteger(value.courseRevision, "A revisão do fato"),
    channel,
    origin: value.origin === null ? null : identifier(value.origin, "A origem do fato"),
    state: value.state === null ? null : identifier(value.state, "O estado do fato"),
    subject: normalizeEntityReference(value.subject, "o sujeito do fato"),
    related: value.related === null ? null : normalizeEntityReference(value.related,
      "o objeto relacionado"),
    values: normalizeFactValues(value.values),
    missingData: normalizeMissingData(value.missingData),
    deepLink: nullableDeepLink(value.deepLink, "O destino do fato")
  };
}

export function normalizeCourseAuthoringAnalyticsPage(value, {
  expectedCourseId = null,
  expectedQuery = null
} = {}) {
  exact(value, [
    "contract", "dictionaryVersion", "courseId", "courseRevision", "generatedAt", "query",
    "metrics", "overview", "facts", "nextCursor", "limitations", "deepLink"
  ], "A página de Analytics de Autoria");
  if (value.contract !== COURSE_AUTHORING_ANALYTICS_CONTRACT ||
      value.dictionaryVersion !== COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION ||
      !Array.isArray(value.metrics) || !value.metrics.length || value.metrics.length > 32 ||
      !Array.isArray(value.facts) || value.facts.length > 200) {
    fail("invalid_course_authoring_analytics", "A página de Analytics de Autoria é inválida.");
  }
  const courseId = uuid(value.courseId, "A identidade do Curso");
  if (expectedCourseId !== null && courseId !== uuid(expectedCourseId, "O Curso esperado")) {
    fail("course_authoring_analytics_mismatch", "A resposta pertence a outro Curso.");
  }
  const query = normalizeCourseAuthoringAnalyticsQuery(value.query);
  if (expectedQuery !== null && JSON.stringify(query) !== JSON.stringify(
    normalizeCourseAuthoringAnalyticsQuery(expectedQuery))) {
    fail("course_authoring_analytics_mismatch", "A resposta pertence a outro recorte.");
  }
  const metrics = value.metrics.map(normalizeMetricDefinition);
  if (new Set(metrics.map(({ id }) => id)).size !== metrics.length) {
    fail("invalid_course_authoring_analytics", "As métricas precisam ter identidades distintas.");
  }
  const facts = value.facts.map(normalizeFact);
  if (new Set(facts.map(({ factId }) => factId)).size !== facts.length) {
    fail("invalid_course_authoring_analytics", "Os fatos da página precisam ser distintos.");
  }
  if (facts.some((fact) => !query.datasets.includes(fact.dataset) ||
      query.channels.length && (fact.channel === null || !query.channels.includes(fact.channel)) ||
      query.origins.length && (fact.origin === null || !query.origins.includes(fact.origin)) ||
      query.states.length && (fact.state === null || !query.states.includes(fact.state)) ||
      query.from !== null && Date.parse(fact.occurredAt) < Date.parse(query.from) ||
      query.to !== null && Date.parse(fact.occurredAt) > Date.parse(query.to))) {
    fail("course_authoring_analytics_mismatch", "Um fato não pertence ao recorte informado.");
  }
  return {
    contract: value.contract,
    dictionaryVersion: value.dictionaryVersion,
    courseId,
    courseRevision: positiveInteger(value.courseRevision, "A revisão do Curso"),
    generatedAt: timestamp(value.generatedAt, "A geração da página"),
    query,
    metrics,
    overview: normalizeOverview(value.overview, metrics),
    facts,
    nextCursor: nullableCursor(value.nextCursor),
    limitations: uniqueTexts(value.limitations, 16, 1000, "Os limites de interpretação"),
    deepLink: deepLink(value.deepLink, "O destino de Analytics")
  };
}

function analyticsBaseUrl(publicAppUrl) {
  const normalized = deepLink(String(publicAppUrl || ""), "A URL pública do AraLearn");
  return normalized.replace(/[#?].*$/u, "").replace(/\/+$/u, "");
}

function courseFactSection(fact) {
  if (fact.dataset === "materializations") return "planning";
  if (fact.dataset === "design") return "parameters";
  if (fact.dataset === "sources") return "sources";
  if (fact.dataset === "annotations" || fact.dataset === "audits") return "review";
  if (fact.dataset === "variants") return "research";
  if ([
    "update_course_instructional_plan",
    "advance_course_authoring_part_materialization",
    "plan_changed",
    "materialization_started",
    "materialization_step_recorded",
    "materialization_finished",
    "part_materialization_pending",
    "part_materialization_running",
    "part_materialization_completed",
    "part_materialization_failed"
  ].includes(fact.kind)) return "planning";
  if ([
    "update_course_design",
    "design_parameter_set",
    "design_parameter_clear",
    "authoring_guidance_set",
    "authoring_guidance_clear",
    "authoring_guidance_interpreted",
    "component_policy_set",
    "component_policy_clear"
  ].includes(fact.kind)) return "parameters";
  if (["update_course_sources", "course_source_changed"].includes(fact.kind)) {
    return "sources";
  }
  if (fact.kind === "grant_course_access" || fact.kind === "revoke_course_access") {
    return "people";
  }
  if (["replace_course_composition", "commit_course_composition"].includes(fact.kind)) {
    return "content";
  }
  return "overview";
}

function referenceWithKind(fact, kinds) {
  return [fact.related, fact.subject].find((reference) =>
    reference !== null && kinds.includes(reference.kind)) || null;
}

function uuidReference(fact, kinds) {
  const reference = referenceWithKind(fact, kinds);
  return reference && UUID.test(reference.id)
    ? { ...reference, id: reference.id.toLowerCase() }
    : null;
}

function routeWithTarget(route, section, query, id) {
  return `${route}?section=${section}&${query}=${encodeURIComponent(id)}`;
}

function analyticsObjectDeepLink(baseUrl, courseId, fact) {
  const route = `${baseUrl}/#/authoring/courses/${encodeURIComponent(courseId)}`;
  const section = courseFactSection(fact);

  if (fact.dataset === "materializations") {
    const part = uuidReference(fact, ["authoring_part"]);
    if (!part) return `${route}?section=planning`;
    const materialization = uuidReference(fact, ["materialization"]);
    const partRoute = routeWithTarget(route, "planning", "authoringPartId", part.id);
    return materialization
      ? `${partRoute}&materializationId=${encodeURIComponent(materialization.id)}`
      : partRoute;
  }

  if (fact.dataset === "design") {
    const targetQuery = {
      module: "moduleId",
      lesson: "lessonId",
      didactic_microsequence: "didacticMicrosequenceId"
    }[fact.subject.kind];
    return targetQuery
      ? routeWithTarget(route, "parameters", targetQuery, fact.subject.id)
      : `${route}?section=parameters`;
  }

  if (fact.dataset === "annotations") {
    const annotation = uuidReference(fact, ["annotation"]);
    return annotation
      ? routeWithTarget(route, "review", "annotationId", annotation.id)
      : `${route}?section=review`;
  }

  if (fact.dataset === "audits") {
    const finding = uuidReference(fact, ["audit_finding"]);
    if (finding) return routeWithTarget(route, "review", "findingId", finding.id);
    const run = uuidReference(fact, ["audit_run"]);
    return run
      ? routeWithTarget(route, "review", "auditRunId", run.id)
      : `${route}?section=review`;
  }

  if (fact.dataset === "variants") {
    const comparison = uuidReference(fact, ["variant_comparison"]);
    return comparison
      ? routeWithTarget(route, "research", "comparisonSetId", comparison.id)
      : `${route}?section=research`;
  }

  return `${route}?section=${section}`;
}

function humanizeIdentifier(value) {
  const normalized = String(value || "").replaceAll("_", " ").trim();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Fato";
}

function normalizeAnalyticsSummary(value) {
  exact(value, [
    "factCount", "missingCourseRevisionCount", "byDataset", "byKind"
  ], "O resumo dos fatos");
  if (!Array.isArray(value.byDataset) || value.byDataset.length > 7 ||
      !Array.isArray(value.byKind) || value.byKind.length > 256) {
    fail("invalid_course_authoring_analytics", "O resumo dos fatos é inválido.");
  }
  const byDataset = value.byDataset.map((entry) => {
    exact(entry, ["key", "value"], "A contagem por conjunto");
    const key = identifier(entry.key, "O conjunto da contagem");
    if (!DATASET_SET.has(key)) {
      fail("invalid_course_authoring_analytics", "A contagem usa conjunto desconhecido.");
    }
    return { key, value: nonnegativeInteger(entry.value, "A contagem do conjunto") };
  });
  const byKind = value.byKind.map((entry) => {
    exact(entry, ["dataset", "kind", "state", "value"], "A contagem por tipo");
    const dataset = identifier(entry.dataset, "O conjunto da contagem");
    if (!DATASET_SET.has(dataset)) {
      fail("invalid_course_authoring_analytics", "A contagem usa conjunto desconhecido.");
    }
    return {
      dataset,
      kind: identifier(entry.kind, "O tipo da contagem"),
      state: entry.state === null ? null : identifier(entry.state, "O estado da contagem"),
      value: nonnegativeInteger(entry.value, "A contagem do tipo")
    };
  });
  return {
    factCount: nonnegativeInteger(value.factCount, "A contagem de fatos"),
    missingCourseRevisionCount: nonnegativeInteger(
      value.missingCourseRevisionCount,
      "A contagem de revisões ausentes"
    ),
    byDataset,
    byKind
  };
}

function analyticsMetric(query, summary) {
  const singleDataset = query.datasets.length === 1 ? query.datasets[0] : null;
  const entries = singleDataset === null
    ? query.datasets.map((dataset) => ({
      key: dataset,
      label: humanizeIdentifier(dataset),
      value: summary.byDataset.find(({ key }) => key === dataset)?.value ?? 0
    }))
    : summary.byKind.filter(({ dataset }) => dataset === singleDataset).map((entry) => ({
      key: `${entry.kind}:${entry.state ?? "none"}`,
      label: entry.state === null
        ? humanizeIdentifier(entry.kind)
        : `${humanizeIdentifier(entry.kind)} · ${humanizeIdentifier(entry.state)}`,
      value: entry.value
    }));
  const series = entries.length ? entries : [{ key: "no_facts", label: "Nenhum fato", value: 0 }];
  const metric = {
    id: singleDataset === null ? "facts_by_dataset" : "facts_by_kind",
    version: 1,
    label: singleDataset === null ? "Fatos por conjunto" : "Fatos por tipo e estado",
    question: singleDataset === null
      ? "Como os fatos do processo de criação se distribuem neste recorte?"
      : "Quais fatos e estados aparecem no conjunto selecionado?",
    definition: singleDataset === null
      ? "Conta cada fato uma vez no conjunto de origem, dentro dos filtros e da revisão informados."
      : "Conta cada fato uma vez pela combinação de tipo e estado, dentro dos filtros e da revisão informados.",
    unit: "count",
    denominator: "Todos os fatos que correspondem ao recorte informado.",
    missingData: "Revisão ou valor ausente permanece indicado no fato; ausência de fatos no recorte vale zero.",
    prohibitedInferences: [
      "A contagem não mede aprendizagem, atenção ou qualidade didática.",
      "Uma diferença observada não demonstra relação causal."
    ]
  };
  return {
    metric,
    overview: {
      metricId: metric.id,
      title: metric.label,
      question: metric.question,
      series: series.map((entry) => ({
        ...entry,
        unit: "count",
        denominator: summary.factCount,
        missing: false
      }))
    }
  };
}

export function assembleCourseAuthoringAnalyticsPage(rawValue, {
  publicAppUrl,
  expectedCourseId = null,
  expectedQuery = null
} = {}) {
  exact(rawValue, [
    "contract", "courseId", "courseRevision", "generatedAt", "query", "facts",
    "summary", "nextCursor"
  ], "A página bruta de Pesquisa");
  if (rawValue.contract !== COURSE_AUTHORING_ANALYTICS_ROWS_CONTRACT ||
      !Array.isArray(rawValue.facts) || rawValue.facts.length > 200) {
    fail("invalid_course_authoring_analytics", "A página bruta de Pesquisa é inválida.");
  }
  const courseId = uuid(rawValue.courseId, "A identidade do Curso");
  if (expectedCourseId !== null && courseId !== uuid(expectedCourseId, "O Curso esperado")) {
    fail("course_authoring_analytics_mismatch", "A resposta pertence a outro Curso.");
  }
  const courseRevision = positiveInteger(rawValue.courseRevision, "A revisão do Curso");
  const query = normalizeCourseAuthoringAnalyticsQuery(rawValue.query);
  if (expectedQuery !== null && JSON.stringify(query) !== JSON.stringify(
    normalizeCourseAuthoringAnalyticsQuery(expectedQuery))) {
    fail("course_authoring_analytics_mismatch", "A resposta pertence a outro recorte.");
  }
  const baseUrl = analyticsBaseUrl(publicAppUrl);
  const facts = rawValue.facts.map((entry) => {
    const fact = normalizeFact(entry);
    return { ...fact, deepLink: analyticsObjectDeepLink(baseUrl, courseId, fact) };
  });
  if (new Set(facts.map(({ factId }) => factId)).size !== facts.length) {
    fail("invalid_course_authoring_analytics", "Os fatos da página precisam ser distintos.");
  }
  const summary = normalizeAnalyticsSummary(rawValue.summary);
  if (summary.factCount < facts.length || summary.missingCourseRevisionCount > summary.factCount) {
    fail("invalid_course_authoring_analytics", "O resumo não corresponde aos fatos.");
  }
  const { metric, overview } = analyticsMetric(query, summary);
  return normalizeCourseAuthoringAnalyticsPage({
    contract: COURSE_AUTHORING_ANALYTICS_CONTRACT,
    dictionaryVersion: COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION,
    courseId,
    courseRevision,
    generatedAt: timestamp(rawValue.generatedAt, "A geração da página"),
    query,
    metrics: [metric],
    overview,
    facts,
    nextCursor: nullableCursor(rawValue.nextCursor),
    limitations: [
      "Os fatos descrevem o processo de criação; não medem aprendizagem nem atenção.",
      "Tempo registrado entre etapas inclui esperas técnicas e não representa esforço humano.",
      "Comparações são descritivas e não sustentam conclusão causal."
    ],
    deepLink: `${baseUrl}/#/authoring/courses/${encodeURIComponent(courseId)}?section=research`
  }, { expectedCourseId: courseId, expectedQuery: query });
}

function sameExportContext(left, right) {
  const comparable = (page) => ({
    dictionaryVersion: page.dictionaryVersion,
    courseId: page.courseId,
    courseRevision: page.courseRevision,
    query: { ...page.query, cursor: null }
  });
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function assembleCourseAuthoringAnalyticsExport(pages) {
  if (!Array.isArray(pages) || !pages.length) {
    fail("invalid_course_authoring_analytics_export", "A exportação precisa de ao menos uma página.");
  }
  const normalized = pages.map((page, index) => normalizeCourseAuthoringAnalyticsPage(page, {
    expectedCourseId: index ? pages[0]?.courseId : null
  }));
  if (normalized.some((page) => !sameExportContext(normalized[0], page))) {
    fail("course_authoring_analytics_mismatch", "As páginas da exportação pertencem a recortes diferentes.");
  }
  const facts = normalized.flatMap((page) => page.facts);
  if (new Set(facts.map(({ factId }) => factId)).size !== facts.length) {
    fail("invalid_course_authoring_analytics_export", "A exportação repetiu um fato.");
  }
  const first = normalized[0];
  return {
    contract: COURSE_AUTHORING_ANALYTICS_EXPORT_CONTRACT,
    dictionaryVersion: first.dictionaryVersion,
    exportedAt: new Date().toISOString(),
    courseId: first.courseId,
    courseRevision: first.courseRevision,
    query: { ...first.query, cursor: null },
    metrics: first.metrics,
    facts,
    limitations: first.limitations
  };
}

function csvCell(value) {
  const source = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/u.test(source) ? `"${source.replaceAll('"', '""')}"` : source;
}

export function serializeCourseAuthoringAnalyticsCsv(exportValue) {
  const source = plainObject(exportValue, "A exportação de Analytics");
  if (source.contract !== COURSE_AUTHORING_ANALYTICS_EXPORT_CONTRACT ||
      source.dictionaryVersion !== COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION ||
      !Array.isArray(source.facts)) {
    fail("invalid_course_authoring_analytics_export", "A exportação de Analytics é inválida.");
  }
  const headers = [
    "dictionary_version", "course_id", "course_revision", "fact_id", "dataset", "fact_kind",
    "occurred_at", "fact_course_revision", "channel", "origin", "state", "subject_kind",
    "subject_id", "subject_label", "related_kind", "related_id", "related_label", "values_json",
    "missing_data", "deep_link"
  ];
  const rows = source.facts.map((rawFact) => {
    const fact = normalizeFact(rawFact);
    return [
      source.dictionaryVersion,
      uuid(source.courseId, "A identidade do Curso"),
      positiveInteger(source.courseRevision, "A revisão do Curso"),
      fact.factId,
      fact.dataset,
      fact.kind,
      fact.occurredAt,
      fact.courseRevision,
      fact.channel,
      fact.origin,
      fact.state,
      fact.subject.kind,
      fact.subject.id,
      fact.subject.label,
      fact.related?.kind,
      fact.related?.id,
      fact.related?.label,
      JSON.stringify(fact.values),
      fact.missingData.join(" | "),
      fact.deepLink
    ];
  });
  return "\uFEFF" + [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n") + "\r\n";
}
