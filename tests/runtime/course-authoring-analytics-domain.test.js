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
import { parseCourseAuthoringRoute } from "../../src/ui/courseAuthoringRoute.js";

const COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";
const PART_ID = "223e4567-e89b-42d3-a456-426614174001";
const MATERIALIZATION_ID = "323e4567-e89b-42d3-a456-426614174002";
const ANNOTATION_ID = "423e4567-e89b-42d3-a456-426614174003";
const AUDIT_RUN_ID = "523e4567-e89b-42d3-a456-426614174004";
const FINDING_ID = "623e4567-e89b-42d3-a456-426614174005";
const CHECKPOINT_ID = "723e4567-e89b-42d3-a456-426614174006";
const COMPARISON_ID = "823e4567-e89b-42d3-a456-426614174007";
const PUBLIC_APP_URL = "https://fabio-ara.github.io/AraLearn";

function fact(overrides = {}) {
  return {
    factId: "activity:event:1",
    dataset: "activity",
    kind: "update_course_metadata",
    occurredAt: "2026-08-27T20:09:34.000Z",
    courseRevision: 18,
    channel: "authoring_chat",
    origin: "author",
    state: null,
    subject: { kind: "course", id: COURSE_ID, label: "Curso" },
    related: null,
    values: {},
    missingData: [],
    deepLink: null,
    ...overrides
  };
}

function assembleFacts(facts) {
  const datasets = [...new Set(facts.map(({ dataset }) => dataset))];
  const query = normalizeCourseAuthoringAnalyticsQuery({ datasets });
  const byDataset = datasets.map((dataset) => ({
    key: dataset,
    value: facts.filter((entry) => entry.dataset === dataset).length
  }));
  const byKind = facts.map((entry) => ({
    dataset: entry.dataset,
    kind: entry.kind,
    state: entry.state,
    value: 1
  }));
  return assembleCourseAuthoringAnalyticsPage({
    contract: COURSE_AUTHORING_ANALYTICS_ROWS_CONTRACT,
    courseId: COURSE_ID,
    courseRevision: 18,
    generatedAt: "2026-08-27T20:10:00.000Z",
    query,
    facts,
    summary: {
      factCount: facts.length,
      missingCourseRevisionCount: facts.filter(({ courseRevision }) =>
        courseRevision === null).length,
      byDataset,
      byKind
    },
    nextCursor: null
  }, {
    publicAppUrl: PUBLIC_APP_URL,
    expectedCourseId: COURSE_ID,
    expectedQuery: query
  });
}

function parsedDeepLink(deepLink) {
  return parseCourseAuthoringRoute(new URL(deepLink).hash);
}

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
      related: { kind: "annotation", id: ANNOTATION_ID, label: null }
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
      `?section=review&annotationId=${ANNOTATION_ID}`
  );
  assert.match(assembled.limitations.join(" "), /não sustentam conclusão causal/u);
});

test("fato plan_changed do Curso aponta diretamente para Planejamento", () => {
  const query = normalizeCourseAuthoringAnalyticsQuery({ datasets: ["activity"] });
  const assembled = assembleCourseAuthoringAnalyticsPage({
    contract: COURSE_AUTHORING_ANALYTICS_ROWS_CONTRACT,
    courseId: COURSE_ID,
    courseRevision: 18,
    generatedAt: "2026-08-27T20:09:34.000Z",
    query,
    facts: [{
      factId: "activity:plan:18",
      dataset: "activity",
      kind: "plan_changed",
      occurredAt: "2026-08-27T20:09:34.000Z",
      courseRevision: 18,
      channel: "authoring_chat",
      origin: "author",
      state: null,
      subject: { kind: "course", id: COURSE_ID, label: "Dataprev: Gestão de Servidores" },
      related: null,
      values: { activity_kind: "plan_changed" },
      missingData: [],
      deepLink: null
    }],
    summary: {
      factCount: 1,
      missingCourseRevisionCount: 0,
      byDataset: [{ key: "activity", value: 1 }],
      byKind: [{ dataset: "activity", kind: "plan_changed", state: null, value: 1 }]
    },
    nextCursor: null
  }, {
    publicAppUrl: "https://fabio-ara.github.io/AraLearn",
    expectedCourseId: COURSE_ID,
    expectedQuery: query
  });

  assert.equal(
    assembled.facts[0].deepLink,
    `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE_ID}?section=planning`
  );
});

test("eventos do Curso apontam para a seção pública correspondente", () => {
  const cases = [
    ["plan_changed", "planning"],
    ["course_source_changed", "sources"],
    ["commit_course_composition", "content"]
  ];
  for (const [kind, section] of cases) {
    const assembled = assembleFacts([fact({ factId: `activity:${kind}`, kind })]);
    assert.deepEqual(parsedDeepLink(assembled.facts[0].deepLink), {
      courseId: COURSE_ID,
      section,
      target: null
    });
  }
});

test("materialização usa Parte e execução nos parâmetros canônicos do Planejamento", () => {
  const assembled = assembleFacts([fact({
    factId: `materializations:attempt:${MATERIALIZATION_ID}`,
    dataset: "materializations",
    kind: "part_materialization_completed",
    origin: "automatic",
    state: "completed",
    subject: { kind: "authoring_part", id: PART_ID, label: "Parte" },
    related: { kind: "materialization", id: MATERIALIZATION_ID, label: null }
  })]);

  assert.deepEqual(parsedDeepLink(assembled.facts[0].deepLink), {
    courseId: COURSE_ID,
    section: "planning",
    target: {
      kind: "authoring_part",
      id: PART_ID,
      materializationId: MATERIALIZATION_ID
    }
  });
});

test("parâmetro e orientação usam o escopo, não o objeto relacionado interno", () => {
  const assembled = assembleFacts([
    fact({
      factId: "design:parameter:1",
      dataset: "design",
      kind: "design_parameter_set",
      state: "set",
      subject: { kind: "lesson", id: "lesson-1", label: "Lição" },
      related: { kind: "design_parameter", id: "difficulty", label: "Dificuldade" }
    }),
    fact({
      factId: "design:guidance:1",
      dataset: "design",
      kind: "authoring_guidance_set",
      state: "set",
      subject: {
        kind: "didactic_microsequence",
        id: "microsequence-1",
        label: "Microssequência"
      },
      related: { kind: "guidance_revision", id: "guidance-1", label: null }
    })
  ]);

  assert.deepEqual(parsedDeepLink(assembled.facts[0].deepLink), {
    courseId: COURSE_ID,
    section: "parameters",
    target: { kind: "lesson", id: "lesson-1" }
  });
  assert.deepEqual(parsedDeepLink(assembled.facts[1].deepLink), {
    courseId: COURSE_ID,
    section: "parameters",
    target: { kind: "didactic_microsequence", id: "microsequence-1" }
  });
});

test("anexo de Fonte aponta para Fontes sem fabricar identidade roteável", () => {
  const assembled = assembleFacts([fact({
    factId: "sources:attachment:1",
    dataset: "sources",
    kind: "source_attachment_recorded",
    channel: null,
    origin: null,
    state: "recorded",
    subject: { kind: "source", id: "source-redacted", label: "Edital" },
    related: { kind: "source_attachment", id: "sha256-content", label: null }
  })]);

  assert.deepEqual(parsedDeepLink(assembled.facts[0].deepLink), {
    courseId: COURSE_ID,
    section: "sources",
    target: null
  });
});

test("observação, rodada e achado usam os alvos públicos de Revisão", () => {
  const assembled = assembleFacts([
    fact({
      factId: `annotations:event:${ANNOTATION_ID}`,
      dataset: "annotations",
      kind: "annotation_created",
      state: "open",
      subject: { kind: "study_unit", id: "unit-1", label: "Unidade" },
      related: { kind: "annotation", id: ANNOTATION_ID, label: null }
    }),
    fact({
      factId: `audits:run:${AUDIT_RUN_ID}`,
      dataset: "audits",
      kind: "audit_run_minimal",
      channel: "audit_process",
      state: "recorded",
      subject: { kind: "study_unit", id: "unit-1", label: "Unidade" },
      related: { kind: "audit_run", id: AUDIT_RUN_ID, label: null }
    }),
    fact({
      factId: `audits:finding:${FINDING_ID}`,
      dataset: "audits",
      kind: "audit_finding_keep",
      channel: "audit_process",
      state: "open",
      subject: { kind: "study_unit", id: "unit-1", label: "Unidade" },
      related: { kind: "audit_finding", id: FINDING_ID, label: null }
    })
  ]);

  assert.deepEqual(parsedDeepLink(assembled.facts[0].deepLink), {
    courseId: COURSE_ID,
    section: "review",
    target: { kind: "anchored_annotation", id: ANNOTATION_ID }
  });
  assert.deepEqual(parsedDeepLink(assembled.facts[1].deepLink), {
    courseId: COURSE_ID,
    section: "review",
    target: { kind: "audit_run", id: AUDIT_RUN_ID }
  });
  assert.deepEqual(parsedDeepLink(assembled.facts[2].deepLink), {
    courseId: COURSE_ID,
    section: "review",
    target: { kind: "audit_finding", id: FINDING_ID }
  });
});

test("checkpoint fica em Pesquisa e comparação usa comparisonSetId canônico", () => {
  const assembled = assembleFacts([
    fact({
      factId: `variants:checkpoint:${CHECKPOINT_ID}`,
      dataset: "variants",
      kind: "variant_checkpoint_recorded",
      channel: null,
      state: "recorded",
      related: { kind: "variant_checkpoint", id: CHECKPOINT_ID, label: null }
    }),
    fact({
      factId: `variants:set:${COMPARISON_ID}`,
      dataset: "variants",
      kind: "variant_comparison_recorded",
      channel: null,
      state: "recorded",
      related: { kind: "variant_comparison", id: COMPARISON_ID, label: null }
    })
  ]);

  assert.deepEqual(parsedDeepLink(assembled.facts[0].deepLink), {
    courseId: COURSE_ID,
    section: "research",
    target: null
  });
  assert.deepEqual(parsedDeepLink(assembled.facts[1].deepLink), {
    courseId: COURSE_ID,
    section: "research",
    target: { kind: "variant_comparison", id: COMPARISON_ID }
  });
});
