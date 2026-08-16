import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAuthoringAnalyticsChartTableParity,
  authoringAnalyticsTableRows,
  normalizeAuthoringAnalyticsScope,
  serializeAuthoringAnalyticsExportPage
} from "../../src/authoring/authoringAnalytics.js";

test("analytics normaliza escopos fechados e exige referência fora do workspace", () => {
  assert.deepEqual(normalizeAuthoringAnalyticsScope({ kind: "workspace" }), {
    kind: "workspace"
  });
  assert.deepEqual(normalizeAuthoringAnalyticsScope({
    kind: "lesson", ref: "lesson-1", entityPath: ["course", "module", "lesson-1"]
  }), {
    kind: "lesson", ref: "lesson-1", entityPath: ["course", "module", "lesson-1"]
  });
  assert.throws(() => normalizeAuthoringAnalyticsScope({ kind: "lesson" }), /exige ref/u);
  assert.throws(() => normalizeAuthoringAnalyticsScope({ kind: "workspace", score: 1 }), /desconhecidos/u);
});

test("gráfico e tabela usam exatamente a mesma base numérica", () => {
  const visualization = {
    unit: "finding",
    items: [
      { key: "open", label: "Abertos", value: 3, missing: false },
      { key: "missing", label: "Sem medida", value: null, missing: true }
    ]
  };
  const rows = authoringAnalyticsTableRows(visualization);
  assert.equal(assertAuthoringAnalyticsChartTableParity(visualization, rows), true);
  assert.throws(
    () => assertAuthoringAnalyticsChartTableParity(visualization, [{ ...rows[0], value: 4 }]),
    /mesma base numérica/u
  );
});

test("exportações JSON e CSV preservam dataset, versão, ausências e pseudônimo", () => {
  const input = {
    dataset: "experiment_outcomes",
    datasetSetRef: { id: "analytics:set", version: "a".repeat(64) },
    scope: { kind: "experiment", ref: "experiment-1" },
    dictionary: [{ metricRef: { id: "experiment.outcome_numeric", version: "1.0.0" } }],
    items: [{
      rowKind: "outcome",
      participantRef: "participant:00000000-0000-4000-8000-000000000001",
      valueKind: "missing",
      value: null,
      missingReason: "não coletado"
    }]
  };
  const json = serializeAuthoringAnalyticsExportPage({ ...input, format: "json" });
  const csv = serializeAuthoringAnalyticsExportPage({ ...input, format: "csv" });
  assert.match(json, /experiment_outcomes/u);
  assert.match(json, /participant:00000000/u);
  assert.doesNotMatch(json, /userId|seed/u);
  assert.match(csv, /^schemaVersion,dataset,rowKind,rowJson\r\n/u);
  assert.match(csv, /não coletado/u);
});
