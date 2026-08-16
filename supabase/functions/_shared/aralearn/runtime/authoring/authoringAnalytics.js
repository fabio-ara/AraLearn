const DATASETS = Object.freeze([
  "authoring_design",
  "authoring_process",
  "experiment_assignments",
  "experiment_outcomes"
]);

export const AUTHORING_ANALYTICS_DATASETS = DATASETS;
export const AUTHORING_ANALYTICS_SCHEMA_VERSION = "1.0.0";
export const AUTHORING_ANALYTICS_PAGE_LIMIT = 20;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function normalizeAuthoringAnalyticsScope(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw new TypeError("O escopo de analytics deve ser um objeto.");
  }
  const kind = text(scope.kind);
  if (!["workspace", "course", "module", "lesson", "microsequence", "experiment"].includes(kind)) {
    throw new TypeError("O tipo de escopo de analytics é inválido.");
  }
  const allowed = new Set(["kind", "ref", "entityPath"]);
  if (Object.keys(scope).some((field) => !allowed.has(field))) {
    throw new TypeError("O escopo de analytics contém campos desconhecidos.");
  }
  if (kind === "workspace") return { kind };
  const ref = text(scope.ref);
  if (!ref) throw new TypeError("O escopo de analytics exige ref.");
  const normalized = { kind, ref };
  if (scope.entityPath != null) {
    if (!Array.isArray(scope.entityPath) || scope.entityPath.length < 1
        || scope.entityPath.length > 5 || scope.entityPath.some((item) => !text(item))) {
      throw new TypeError("entityPath de analytics é inválido.");
    }
    normalized.entityPath = scope.entityPath.map(text);
  }
  return normalized;
}

export function authoringAnalyticsTableRows(visualization) {
  const unit = text(visualization?.unit);
  return (Array.isArray(visualization?.items) ? visualization.items : []).map((item) => ({
    key: text(item?.key),
    label: text(item?.label) || text(item?.key),
    value: item?.value == null ? null : Number(item.value),
    unit,
    missing: item?.missing === true
  }));
}

export function assertAuthoringAnalyticsChartTableParity(visualization, rows) {
  const chartRows = authoringAnalyticsTableRows(visualization);
  if (JSON.stringify(chartRows) !== JSON.stringify(rows)) {
    throw new TypeError("Gráfico e tabela de analytics não compartilham a mesma base numérica.");
  }
  return true;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function csv(value) {
  const source = value == null ? "" : String(value);
  return /[\r\n,"]/u.test(source) ? `"${source.replaceAll('"', '""')}"` : source;
}

export function serializeAuthoringAnalyticsExportPage({
  dataset,
  datasetSetRef,
  scope,
  dictionary = [],
  items = [],
  format = "json",
  includeHeader = true
}) {
  if (!DATASETS.includes(dataset)) throw new TypeError("Dataset de analytics inválido.");
  if (!["csv", "json"].includes(format)) throw new TypeError("Formato de exportação inválido.");
  const safeItems = clone(items);
  if (format === "json") {
    return `${stable({
      schemaVersion: AUTHORING_ANALYTICS_SCHEMA_VERSION,
      dataset,
      datasetSetRef,
      scope,
      dictionary: clone(dictionary),
      items: safeItems
    })}\n`;
  }
  const header = "schemaVersion,dataset,rowKind,rowJson\r\n";
  const body = safeItems.map((item) => [
    AUTHORING_ANALYTICS_SCHEMA_VERSION,
    dataset,
    text(item?.rowKind),
    stable(item)
  ].map(csv).join(",")).join("\r\n");
  return `${includeHeader ? header : ""}${body}${body ? "\r\n" : ""}`;
}

