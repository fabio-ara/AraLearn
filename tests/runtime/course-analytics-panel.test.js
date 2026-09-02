import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_AUTHORING_ANALYTICS_CONTRACT,
  COURSE_AUTHORING_ANALYTICS_DICTIONARY_VERSION
} from "../../src/domain/courseAuthoringAnalytics.js";
import { createCourseAnalyticsPanel } from "../../src/ui/CourseAnalyticsPanel.js";

const COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";

class FakeFocusable {
  constructor(root, name) {
    this.root = root;
    this.name = name;
    this.focusOptions = [];
  }

  focus(options) {
    this.focusOptions.push(options);
    this.root.ownerDocument.activeElement = this;
  }
}

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
    this.ownerDocument = { activeElement: null };
    this.metricTrigger = new FakeFocusable(this, "metric-trigger");
    this.factTrigger = new FakeFocusable(this, "fact-trigger");
    this.closeControl = new FakeFocusable(this, "close-details");
    this.sheet = { contains: (node) => node === this.closeControl };
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector(selector) {
    const sheetOpen = this.innerHTML.includes('class="course-analytics-sheet"');
    if (selector === ".course-analytics-sheet") return sheetOpen ? this.sheet : null;
    if (selector === '[data-course-analytics-action="close-details"]') {
      return sheetOpen ? this.closeControl : null;
    }
    if (selector === '[data-course-analytics-action="open-metric"]') {
      return this.innerHTML.includes('data-course-analytics-action="open-metric"')
        ? this.metricTrigger
        : null;
    }
    if (selector.startsWith('[data-course-analytics-action="open-fact"]')) {
      return this.innerHTML.includes('data-course-analytics-action="open-fact"')
        ? this.factTrigger
        : null;
    }
    return null;
  }
  querySelectorAll(selector) {
    return selector.startsWith(".course-analytics-sheet :is(") &&
      this.innerHTML.includes('class="course-analytics-sheet"')
      ? [this.closeControl]
      : [];
  }
}

function clickAction(root, action, dataset = {}) {
  const target = {
    dataset: { courseAnalyticsAction: action, ...dataset },
    matches: () => false,
    closest: (selector) => selector === "[data-course-analytics-action]" ? target : null
  };
  root.listeners.get("click")({ target });
}

function clickBackdrop(root) {
  root.listeners.get("click")({
    target: {
      matches: (selector) => selector === "[data-course-analytics-backdrop]",
      closest: () => null
    }
  });
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
    deepLink: `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE_ID}?section=review`
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

test("Pesquisa abre uma sheet compacta, contém o foco e o restaura ao acionador", async () => {
  const root = new FakeRoot();
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: { async loadCourseAuthoringAnalytics() { return page(); } }
  });
  await panel.open();
  assert.match(root.innerHTML, /course-authoring-visually-hidden[^>]*>Pesquisa<\/h2>/u);
  assert.match(root.innerHTML, /role="img" aria-label="Estado das observações\./u);
  assert.match(root.innerHTML, /Em aberto: 1/u);
  assert.doesNotMatch(root.innerHTML, />Aberta</u);
  assert.match(root.innerHTML, /Revisão 7/u);
  assert.match(root.innerHTML, /data-course-analytics-action="open-metric"/u);
  assert.doesNotMatch(root.innerHTML, /<table|<dt>Pergunta<\/dt>|<dt>Definição<\/dt>/u);
  assert.doesNotMatch(root.innerHTML, /não mede a aprendizagem do estudante/u);

  clickAction(root, "open-metric");
  const sheetHtml = root.innerHTML.slice(root.innerHTML.indexOf(
    '<div class="course-analytics-sheet-backdrop"'
  ));
  assert.match(root.innerHTML, /course-analytics-sheet-backdrop/u);
  assert.match(root.innerHTML, /role="dialog"[^>]*aria-modal="true"/u);
  assert.match(root.innerHTML, /<h3 id="course-analytics-sheet-title">Detalhes da pesquisa<\/h3>/u);
  assert.match(sheetHtml, /<dt>Mede<\/dt><dd>Qual é o estado corrente das observações do recorte\?<\/dd>/u);
  assert.match(sheetHtml, /<dt>Unidade<\/dt><dd>Contagem<\/dd>/u);
  assert.match(sheetHtml, /<dt>Base<\/dt><dd>Observações correntes no recorte\.<\/dd>/u);
  assert.doesNotMatch(sheetHtml, /<table|Definição|Dados ausentes|Dado ausente/u);
  assert.doesNotMatch(sheetHtml, /Não mede aprendizagem|não mede a aprendizagem/u);
  assert.equal(root.ownerDocument.activeElement, root.closeControl);
  assert.deepEqual(root.closeControl.focusOptions.at(-1), { preventScroll: true });

  const tab = { key: "Tab", shiftKey: false, defaultPrevented: false, preventDefault() {
    this.defaultPrevented = true;
  } };
  root.listeners.get("keydown")(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(root.ownerDocument.activeElement, root.closeControl);

  const escape = { key: "Escape", defaultPrevented: false, preventDefault() {
    this.defaultPrevented = true;
  } };
  root.listeners.get("keydown")(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.doesNotMatch(root.innerHTML, /course-analytics-sheet-backdrop/u);
  assert.equal(root.ownerDocument.activeElement, root.metricTrigger);
  assert.deepEqual(root.metricTrigger.focusOptions.at(-1), { preventScroll: true });

  clickAction(root, "open-metric");
  clickAction(root, "close-details");
  assert.doesNotMatch(root.innerHTML, /course-analytics-sheet-backdrop/u);
  assert.equal(root.ownerDocument.activeElement, root.metricTrigger);

  clickAction(root, "open-metric");
  clickBackdrop(root);
  assert.doesNotMatch(root.innerHTML, /course-analytics-sheet-backdrop/u);
  assert.equal(root.ownerDocument.activeElement, root.metricTrigger);
  panel.destroy();
  assert.equal(root.innerHTML, "");
});

test("Pesquisa mantém bastidores fora dos cards e preserva os dados no detalhe e na exportação", async () => {
  const root = new FakeRoot();
  const downloads = [];
  const opaqueId = "0f3a1df0-3e75-47cc-9c78-1328e7c17798";
  const opaqueHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const opaqueParameter = "content_density_v2";
  const internalFact = {
    ...fact("opaque", null),
    subject: { kind: "study_unit", id: opaqueId, label: null },
    values: {
      operation: "update_course",
      configuration_hash: opaqueHash,
      parameter_id: opaqueParameter,
      method_id: "audit-v3",
      checkpoint_id: "checkpoint-19",
      created_count: 2,
      source_revision: 4
    },
    missingData: ["A origem deste fato não foi registrada."],
    deepLink: null
  };
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    download: (value) => downloads.push(value),
    controller: { async loadCourseAuthoringAnalytics() {
      return page({
        facts: [internalFact],
        revision: 7
      });
    } }
  });

  await panel.open();

  assert.match(root.innerHTML, /<strong>Observação reaberta<\/strong><span>Unidade de estudo<\/span>/u);
  assert.match(root.innerHTML, /data-course-analytics-action="open-fact" data-fact-id="opaque"/u);
  assert.doesNotMatch(root.innerHTML, /Itens criados: 2|Revisão da Fonte: 4/u);
  assert.doesNotMatch(root.innerHTML, /<dt>Canal<\/dt>|<dt>Origem<\/dt>|<dt>Estado<\/dt>/u);
  assert.doesNotMatch(root.innerHTML, new RegExp(opaqueId, "u"));
  assert.doesNotMatch(root.innerHTML, new RegExp(opaqueHash, "u"));
  assert.doesNotMatch(root.innerHTML, new RegExp(opaqueParameter, "u"));
  assert.doesNotMatch(root.innerHTML, /update_course|audit-v3|checkpoint-19/u);

  clickAction(root, "open-fact", { factId: "opaque" });
  assert.match(root.innerHTML, /role="dialog"[^>]*aria-modal="true"/u);
  assert.match(root.innerHTML, /Itens criados: 2 · Revisão da Fonte: 4/u);
  assert.match(root.innerHTML, /<dt>Canal<\/dt><dd>Estudo<\/dd>/u);
  assert.match(root.innerHTML, /<dt>Origem<\/dt><dd>Pessoa estudante<\/dd>/u);
  assert.match(root.innerHTML, /<dt>Estado<\/dt><dd>Em aberto<\/dd>/u);
  assert.match(root.innerHTML, /A origem deste fato não foi registrada\./u);
  assert.doesNotMatch(root.innerHTML, new RegExp(opaqueHash, "u"));
  assert.doesNotMatch(root.innerHTML, new RegExp(opaqueParameter, "u"));
  assert.doesNotMatch(root.innerHTML, /update_course|audit-v3|checkpoint-19/u);

  await panel.export("json");
  assert.deepEqual(JSON.parse(downloads[0].content).facts[0].values, internalFact.values);
});

test("sheet aberta sobrevive ao refresh que adota a revisão relida", async () => {
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
  clickAction(root, "open-metric");
  assert.match(root.innerHTML, /course-analytics-sheet-backdrop/u);
  await panel.refresh(8);

  assert.deepEqual(revisions, [7, 8]);
  assert.match(root.innerHTML, /Revisão 8/u);
  assert.match(root.innerHTML, /course-analytics-sheet-backdrop/u);
  assert.match(root.innerHTML, /<dt>Mede<\/dt>/u);
  assert.doesNotMatch(root.innerHTML.slice(root.innerHTML.indexOf(
    '<div class="course-analytics-sheet-backdrop"'
  )), /<table|<dt>Definição<\/dt>/u);
  assert.equal(root.ownerDocument.activeElement, root.closeControl);
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
