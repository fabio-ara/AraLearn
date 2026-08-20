import assert from "node:assert/strict";
import test from "node:test";
import {
  COURSE_AUTHORING_ANALYTICS_CONTRACT,
  COURSE_AUTHORING_ANALYTICS_DATASETS,
  COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION,
  COURSE_AUTHORING_ANALYTICS_ROWS_CONTRACT,
  assembleCourseAuthoringAnalyticsPage,
  assembleCourseAuthoringAnalyticsExport,
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery,
  serializeCourseAuthoringAnalyticsCsv
} from "../../src/domain/courseAuthoringAnalytics.js";

const COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";

function page(overrides = {}) {
  return {
    contract: COURSE_AUTHORING_ANALYTICS_CONTRACT,
    dictionaryVersion: COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION,
    courseId: COURSE_ID,
    courseRevision: 7,
    generatedAt: "2026-08-20T09:00:00.000Z",
    query: {
      datasets: ["materializations"],
      channels: ["authoring_chat"],
      origins: [],
      states: [],
      from: null,
      to: null,
      limit: 100,
      cursor: null
    },
    metrics: [{
      id: "materialization_by_status",
      version: 1,
      label: "Materializações por estado",
      question: "Em que estado ficaram as materializações registradas?",
      definition: "Conta uma materialização uma vez pelo estado corrente no recorte.",
      unit: "count",
      denominator: "Todas as materializações registradas no recorte.",
      missingData: "A ausência de materialização permanece ausência e não vira zero.",
      prohibitedInferences: ["Não mede aprendizagem, atenção ou qualidade do conteúdo."]
    }],
    overview: {
      metricId: "materialization_by_status",
      title: "Estado das materializações",
      question: "Em que estado ficaram as materializações registradas?",
      series: [{
        key: "completed",
        label: "Concluída",
        value: 1,
        unit: "count",
        denominator: 1,
        missing: false
      }, {
        key: "failed",
        label: "Falhou",
        value: null,
        unit: "count",
        denominator: 1,
        missing: true
      }]
    },
    facts: [{
      factId: "materialization:part-a:3",
      dataset: "materializations",
      kind: "part_materialization_completed",
      occurredAt: "2026-08-20T08:30:00.000Z",
      courseRevision: 7,
      channel: "authoring_chat",
      origin: "automatic",
      state: "completed",
      subject: { kind: "authoring_part", id: "part-a", label: "Parte inicial" },
      related: null,
      values: { duration_milliseconds: 3200, produced_study_units: 4 },
      missingData: [],
      deepLink: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/123e4567-e89b-42d3-a456-426614174000?section=planning&authoringPartId=part-a"
    }],
    nextCursor: null,
    limitations: ["O estado técnico da produção não mede a qualidade didática."],
    deepLink: "https://fabio-ara.github.io/AraLearn/#/authoring/courses/123e4567-e89b-42d3-a456-426614174000?section=research",
    ...overrides
  };
}

test("o recorte de Analytics aplica limites e conserva filtros explícitos", () => {
  assert.deepEqual(normalizeCourseAuthoringAnalyticsQuery(), {
    datasets: [...COURSE_AUTHORING_ANALYTICS_DATASETS],
    channels: [],
    origins: [],
    states: [],
    from: null,
    to: null,
    limit: 100,
    cursor: null
  });
  assert.deepEqual(normalizeCourseAuthoringAnalyticsQuery({
    datasets: ["annotations", "audits"],
    channels: ["study_interface"],
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-20T23:59:59.000Z",
    limit: 25
  }), {
    datasets: ["annotations", "audits"],
    channels: ["study_interface"],
    origins: [],
    states: [],
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-20T23:59:59.000Z",
    limit: 25,
    cursor: null
  });
  assert.throws(() => normalizeCourseAuthoringAnalyticsQuery({
    datasets: ["annotations"],
    channels: [],
    from: "2026-08-21T00:00:00.000Z",
    to: "2026-08-20T00:00:00.000Z"
  }), /início do período/u);
});

test("a página liga gráfico, tabela, revisão, definição e ausência ao mesmo contrato", () => {
  const normalized = normalizeCourseAuthoringAnalyticsPage(page(), {
    expectedCourseId: COURSE_ID
  });
  assert.equal(normalized.courseRevision, 7);
  assert.equal(normalized.overview.metricId, normalized.metrics[0].id);
  assert.equal(normalized.overview.question, normalized.metrics[0].question);
  assert.equal(normalized.overview.series[1].value, null);
  assert.equal(normalized.overview.series[1].missing, true);
  assert.equal(normalized.facts[0].values.duration_milliseconds, 3200);
  assert.deepEqual(normalized.facts[0].missingData, []);
});

test("o contrato recusa identificadores pessoais e fatos fora do recorte", () => {
  const sensitive = page();
  sensitive.facts[0].values.actorId = "123e4567-e89b-42d3-a456-426614174000";
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(sensitive), /sensível/u);

  const outside = page();
  outside.facts[0].channel = "authoring_interface";
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(outside), /recorte informado/u);
});

test("CSV e JSON usam os mesmos fatos e o mesmo dicionário versionado", () => {
  const first = page({ nextCursor: "bmV4dA" });
  const second = page({
    query: { ...page().query, cursor: "bmV4dA" },
    facts: [{
      ...page().facts[0],
      factId: "materialization:part-b:4",
      subject: { kind: "authoring_part", id: "part-b", label: "Parte final" },
      values: { duration_milliseconds: null, produced_study_units: 0 },
      missingData: ["Duração não registrada."]
    }]
  });
  const exported = assembleCourseAuthoringAnalyticsExport([first, second]);
  const csv = serializeCourseAuthoringAnalyticsCsv(exported);
  const json = JSON.parse(JSON.stringify(exported));
  assert.equal(exported.facts.length, 2);
  assert.equal(json.dictionaryVersion, COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION);
  assert.match(csv, /^\uFEFFdictionary_version,course_id,course_revision/u);
  assert.match(csv, /materialization:part-a:3/u);
  assert.match(csv, /materialization:part-b:4/u);
  assert.match(csv, /Duração não registrada\./u);
});

test("a projeção bruta recebe definições, links e limites no caso de uso compartilhado", () => {
  const query = normalizeCourseAuthoringAnalyticsQuery({ datasets: ["annotations"] });
  const raw = {
    contract: COURSE_AUTHORING_ANALYTICS_ROWS_CONTRACT,
    courseId: COURSE_ID,
    courseRevision: 7,
    generatedAt: "2026-08-20T09:00:00.000Z",
    query,
    facts: [{
      ...page().facts[0],
      channel: "study_interface",
      dataset: "annotations",
      deepLink: null,
      related: { kind: "study_unit", id: "unit-a", label: "Unidade A" }
    }],
    summary: {
      factCount: 1,
      missingCourseRevisionCount: 0,
      byDataset: [{ key: "annotations", value: 1 }],
      byKind: [{
        dataset: "annotations",
        kind: "annotation_state_changed",
        state: "open",
        value: 1
      }]
    },
    nextCursor: null
  };
  const assembled = assembleCourseAuthoringAnalyticsPage(raw, {
    publicAppUrl: "https://fabio-ara.github.io/AraLearn",
    expectedCourseId: COURSE_ID,
    expectedQuery: query
  });

  assert.equal(assembled.contract, COURSE_AUTHORING_ANALYTICS_CONTRACT);
  assert.equal(assembled.dictionaryVersion, COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION);
  assert.equal(assembled.metrics[0].id, "facts_by_kind");
  assert.equal(assembled.overview.series[0].value, 1);
  assert.equal(
    assembled.facts[0].deepLink,
    `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE_ID}` +
      "?section=inspection&studyUnitId=unit-a"
  );
  assert.match(assembled.limitations.join(" "), /não sustentam conclusão causal/u);
});
