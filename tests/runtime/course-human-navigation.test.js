import assert from "node:assert/strict";
import test from "node:test";
import { createHumanNavigation, normalizeHumanNavigation, normalizeHumanNavigationEnvelope, buildHumanNavigationEnvelope } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanNavigation.js";
import { parseCourseAuthoringRoute } from "../../src/ui/courseAuthoringRoute.js";

const courseId = "10000000-0000-4000-8000-000000000001";
const adapter = { publicAppUrl: "https://example.test/AraLearn" };

test("destinos usam o mesmo construtor/parser e mantêm leitura separada da fila", () => {
  const content = createHumanNavigation(adapter, { courseId, relation: "content",
    target: { kind: "microsequence_explanation", id: "base-á" }, revision: 7 });
  const observations = createHumanNavigation(adapter, { courseId, relation: "observations" });
  const envelope = buildHumanNavigationEnvelope(content, [observations]);
  assert.equal(envelope.deepLink, content.url);
  assert.equal(envelope.links[0].relation, "content");
  assert.equal(envelope.links[1].relation, "observations");
  assert.deepEqual(parseCourseAuthoringRoute(new URL(content.url).hash), {
    courseId, section: "content", target: { kind: "microsequence_explanation", id: "base-á" }, revision: 7
  });
  assert.match(envelope.nextDecision, /Leia o conteúdo/u);
  assert.equal(parseCourseAuthoringRoute(new URL(observations.url).hash).section, "review");
});

test("relação, identidade e revisão divergentes falham antes de abrir o navegador", () => {
  const content = createHumanNavigation(adapter, { courseId, relation: "content",
    target: { kind: "study_unit", id: "unit-a" }, revision: 3 });
  for (const change of [ { relation: "observations" }, { target: { kind: "study_unit", id: "unit-b" } },
    { revision: 4 }, { url: "javascript:alert(1)" }, { target: { kind: "study_unit", id: "" } } ]) {
    assert.throws(() => normalizeHumanNavigation({ ...content, ...change }), TypeError);
  }
  assert.throws(() => createHumanNavigation(adapter, { courseId, relation: "observations",
    target: { kind: "microsequence_explanation", id: "base-a" } }), /seção/u);
});

test("origem ausente informa limitação sem inventar endereço", () => {
  const primary = createHumanNavigation({}, { courseId, relation: "content" });
  assert.deepEqual(buildHumanNavigationEnvelope(primary), { deepLink: null, links: [],
    nextDecision: "Não há destino de navegação disponível para esta leitura." });
});

test("resultado exige destino principal igual ao primeiro link tipado", () => {
  const content = createHumanNavigation(adapter, { courseId, relation: "content", target: { kind: "study_unit", id: "u1" } });
  const observations = createHumanNavigation(adapter, { courseId, relation: "observations" });
  assert.deepEqual(normalizeHumanNavigationEnvelope({ deepLink: content.url, links: [content, observations] }),
    { deepLink: content.url, links: [content, observations] });
  for (const value of [
    { deepLink: content.url, links: [] }, { deepLink: content.url, links: [observations, content] },
    { deepLink: observations.url, links: [content] }, { deepLink: null, links: {} },
    { deepLink: content.url, links: [{ ...content, target: { kind: "study_unit", id: "u2" } }] }
  ]) assert.throws(() => normalizeHumanNavigationEnvelope(value), TypeError);
});
