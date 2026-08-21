import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_AUTHORING_ANALYTICS_CONTRACT,
  COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION
} from "../../src/domain/courseAuthoringAnalytics.js";
import { createCourseAnalyticsPanel } from "../../src/ui/CourseAnalyticsPanel.js";

const COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";

class FakeRoot {
  constructor() { this.innerHTML = ""; this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}

function fact(id, label, value = 1) {
  return {
    factId: id,
    dataset: "annotations",
    kind: "annotation_reopened",
    occurredAt: "2026-08-20T08:30:00.000Z",
    courseRevision: 7,
    channel: "study_interface",
    origin: "learner",
    state: "open",
    subject: { kind: "anchored_annotation", id: `annotation:${id}`, label },
    related: { kind: "study_unit", id: "unit-a", label: "Unidade A" },
    values: { annotation_version: value, event_type: "reopened", target_kind: "study_unit" },
    missingData: value === null ? ["A contagem não foi registrada."] : [],
    deepLink: `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE_ID}?section=observations`
  };
}

function page({
  cursor = null,
  nextCursor = null,
  facts = [fact("annotation:a", "Observação A")],
  revision = 7
} = {}) {
  return {
    contract: COURSE_AUTHORING_ANALYTICS_CONTRACT,
    dictionaryVersion: COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION,
    courseId: COURSE_ID,
    courseRevision: revision,
    generatedAt: "2026-08-20T09:00:00.000Z",
    query: {
      datasets: ["activity", "materializations", "design", "sources", "annotations", "audits", "variants"],
      channels: [], origins: [], states: [], from: null, to: null, limit: 100, cursor
    },
    metrics: [{
      id: "annotations_by_state",
      version: 1,
      label: "Observações por estado",
      question: "Qual é o estado corrente das observações do recorte?",
      definition: "Conta a versão corrente de cada observação uma vez pelo estado.",
      unit: "count",
      denominator: "Observações correntes no recorte.",
      missingData: "Ausência de observação permanece ausência.",
      prohibitedInferences: ["Não mede aprendizagem, atenção ou dificuldade."]
    }],
    overview: {
      metricId: "annotations_by_state",
      title: "Estado das observações",
      question: "Qual é o estado corrente das observações do recorte?",
      series: [{
        key: "open", label: "Aberta", value: 1, unit: "count", denominator: 1, missing: false
      }, {
        key: "resolved", label: "Resolvida", value: null, unit: "count", denominator: 1, missing: true
      }]
    },
    facts,
    nextCursor,
    limitations: ["O estado da observação não mede a aprendizagem do estudante."],
    deepLink: `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE_ID}?section=research`
  };
}

test("Pesquisa mostra gráfico e tabela equivalentes, revisão, ausência e limites", async () => {
  const root = new FakeRoot();
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: { async loadCourseAuthoringAnalytics() { return page(); } }
  });
  await panel.open();
  assert.match(root.innerHTML, /<h2 id="course-authoring-section-title">Pesquisa<\/h2>/u);
  assert.match(root.innerHTML, /role="img" aria-label="Estado das observações\./u);
  assert.match(root.innerHTML, /<caption>Valores equivalentes ao gráfico<\/caption>/u);
  assert.match(root.innerHTML, /Dado ausente/u);
  assert.match(root.innerHTML, /Revisão 7/u);
  assert.match(root.innerHTML, /Observações · Observação reaberta/u);
  assert.match(root.innerHTML, /Versão da Observação: 1/u);
  assert.match(root.innerHTML, /Tipo do evento: Reabertura/u);
  assert.match(root.innerHTML, /Tipo do objeto: Unidade de estudo/u);
  assert.match(root.innerHTML, /<dt>Origem<\/dt><dd>Pessoa estudante<\/dd>/u);
  assert.match(root.innerHTML, /<dt>Estado<\/dt><dd>Em aberto<\/dd>/u);
  assert.doesNotMatch(root.innerHTML, /annotation_reopened|learner|study_unit/u);
  assert.match(root.innerHTML, /não mede a aprendizagem do estudante/u);
  assert.match(root.innerHTML, /Não mede aprendizagem, atenção ou dificuldade/u);
  assert.match(root.innerHTML, /<dt>Unidade<\/dt><dd>Contagem<\/dd>/u);
  panel.destroy();
  assert.equal(root.innerHTML, "");
});

test("Pesquisa adota a revisão relida antes de atualizar após a volta do ChatGPT", async () => {
  const root = new FakeRoot();
  const revisions = [];
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: {
      async loadCourseAuthoringAnalytics(_courseId, { expectedCourseRevision }) {
        revisions.push(expectedCourseRevision);
        return page({ revision: expectedCourseRevision });
      }
    }
  });

  await panel.open();
  await panel.refresh(8);

  assert.deepEqual(revisions, [7, 8]);
  assert.match(root.innerHTML, /Revisão 8/u);
});

test("CSV e JSON exportam todas as páginas do mesmo recorte", async () => {
  const root = new FakeRoot();
  const downloads = [];
  const cursors = [];
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    download: (value) => downloads.push(value),
    controller: {
      async loadCourseAuthoringAnalytics(courseId, { expectedCourseRevision, query }) {
        assert.equal(courseId, COURSE_ID);
        assert.equal(expectedCourseRevision, 7);
        cursors.push(query.cursor);
        return query.cursor === null
          ? page({ nextCursor: "cGFnZS0y" })
          : page({ cursor: "cGFnZS0y", facts: [fact("annotation:b", "Observação B", null)] });
      }
    }
  });
  await panel.export("csv");
  await panel.export("json");
  assert.deepEqual(cursors, [null, "cGFnZS0y", null, "cGFnZS0y"]);
  assert.equal(downloads.length, 2);
  assert.match(downloads[0].name, /-r7\.csv$/u);
  assert.match(downloads[0].content, /annotation:a/u);
  assert.match(downloads[0].content, /annotation:b/u);
  const json = JSON.parse(downloads[1].content);
  assert.equal(json.dictionaryVersion, COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION);
  assert.equal(json.facts.length, 2);
  assert.equal(json.query.cursor, null);
  assert.equal(json.facts[0].kind, "annotation_reopened");
  assert.equal(json.facts[0].origin, "learner");
  assert.deepEqual(json.facts[0].values, {
    annotation_version: 1,
    event_type: "reopened",
    target_kind: "study_unit"
  });
  assert.match(downloads[0].content, /annotation_reopened/u);
  assert.match(downloads[0].content, /learner/u);
});

test("exportação interrompe a paginação assim que os fatos já não cabem em 8 MiB", async () => {
  const root = new FakeRoot();
  let calls = 0;
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    download: () => assert.fail("A exportação acima do limite não pode criar arquivo."),
    controller: {
      async loadCourseAuthoringAnalytics(_courseId, { query }) {
        calls += 1;
        const facts = Array.from({ length: 20 }, (_, index) => ({
          ...fact(`annotation:${calls}:${index}`, `Observação ${calls}:${index}`),
          values: Object.fromEntries(Array.from({ length: 24 }, (__, valueIndex) => [
            `value_${valueIndex}`,
            `${calls}:${index}:`.padEnd(1000, "x")
          ]))
        }));
        return page({
          cursor: query.cursor,
          nextCursor: Buffer.from(`page-${calls + 1}`).toString("base64url"),
          facts
        });
      }
    }
  });
  await panel.export("json");
  assert.ok(calls < 100);
  assert.match(root.innerHTML, /excede 8 MiB.*Restrinja o período, o conjunto ou o canal/u);
});

test("estimativa incremental do JSON inclui recuo e invólucro do arquivo final", async () => {
  const root = new FakeRoot();
  let calls = 0;
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    download: () => assert.fail("A exportação acima do limite não pode criar arquivo."),
    controller: {
      async loadCourseAuthoringAnalytics(_courseId, { query }) {
        calls += 1;
        return page({
          cursor: query.cursor,
          nextCursor: Buffer.from(`compact-page-${calls + 1}`).toString("base64url"),
          facts: Array.from({ length: 200 }, (_, index) =>
            fact(`annotation:${calls}:${index}`, `Observação ${calls}:${index}`))
        });
      }
    }
  });

  await panel.export("json");

  assert.ok(calls > 1 && calls < 100);
  assert.match(root.innerHTML, /excede 8 MiB.*Restrinja o período, o conjunto ou o canal/u);
});
