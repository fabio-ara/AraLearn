import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";

const fixtureUrl = new URL("../fixtures/pedagogy/academic-stress-courses.json", import.meta.url);
const project = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
const lessons = project.courses.flatMap(({ modules }) => modules).flatMap(({ lessons: values }) => values);
const microsequences = lessons.flatMap(({ microsequences: values }) => values);
const cards = microsequences.flatMap(({ cards: values }) => values);

const packagesIn = (card) => [
  ...card.content.map(({ package: packageId }) => packageId),
  ...(card.response ? [card.response.package] : []),
  ...card.feedback.map(({ package: packageId }) => packageId)
];

test("corpus acadêmico inteiro permanece materializável", () => {
  const validation = validateProjectDocument(project);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(project.courses.length, 2);
  assert.equal(cards.length, 31);
});

test("cada módulo situa o iniciante antes de apresentar notação densa", () => {
  project.courses.flatMap(({ modules }) => modules).forEach((moduleValue) => {
    const first = moduleValue.lessons[0].microsequences[0];
    const firstCard = first.cards[0];
    assert.equal(first.role, "explain", moduleValue.id);
    assert.equal(first.dependsOn.length, 0, moduleValue.id);
    assert.equal(firstCard.role, "theory", moduleValue.id);
    assert.deepEqual(packagesIn(firstCard), ["aralearn.resource.paragraph"], moduleValue.id);
    assert.match(firstCard.content[0].data.text, /(?:Imagine|precisa|processo|participam|aplicações)/iu, moduleValue.id);
  });
});

test("a prática depende de teoria e cobra apenas tópicos previamente ensinados", () => {
  lessons.forEach((lesson) => {
    const byId = new Map(lesson.microsequences.map((microsequence) => [microsequence.id, microsequence]));
    lesson.microsequences.filter(({ role }) => role === "practice").forEach((practice) => {
      assert.ok(practice.dependsOn.length > 0, practice.id);
      const taughtTopics = new Set();
      const visit = (id) => {
        const dependency = byId.get(id);
        assert.ok(dependency, `${practice.id}: dependência ausente ${id}`);
        dependency.dependsOn.forEach(visit);
        dependency.covers.forEach((topicId) => taughtTopics.add(topicId));
      };
      practice.dependsOn.forEach(visit);
      practice.covers.forEach((topicId) => assert.ok(taughtTopics.has(topicId), `${practice.id}: ${topicId} não ensinado`));
      practice.cards.forEach((card) => {
        assert.equal(card.role, "practice", card.id);
        assert.ok(card.response, card.id);
        assert.ok(card.feedback.length > 0, card.id);
      });
    });
  });
});

test("representações especializadas só aparecem quando a estrutura não cabe em recurso mais simples", () => {
  const contentPackages = new Set(cards.flatMap(({ content }) => content.map(({ package: packageId }) => packageId)));
  [
    "aralearn.resource.entity_relationship",
    "aralearn.resource.database_schema",
    "aralearn.resource.packet_layout",
    "aralearn.resource.state_machine",
    "aralearn.resource.network_topology",
    "aralearn.resource.bpmn_process"
  ].forEach((packageId) => assert.ok(contentPackages.has(packageId), packageId));

  const modulePackages = Object.fromEntries(project.courses.flatMap(({ modules }) => modules).map((moduleValue) => [
    moduleValue.id,
    new Set(moduleValue.lessons.flatMap(({ microsequences: values }) => values).flatMap(({ cards: values }) => values).flatMap(packagesIn))
  ]));
  assert.equal(modulePackages["ifsp-algorithms"].has("aralearn.resource.table"), true);
  assert.equal(modulePackages["ifsp-algorithms"].has("aralearn.resource.algorithm_trace"), false);
  assert.equal(modulePackages["dataprev-bpmn"].has("aralearn.resource.flow"), false);
  assert.equal(modulePackages["dataprev-networking"].has("aralearn.resource.graph"), false);
});

test("a prática é abundante e varia o gesto de resposta sem quota pedagógica arbitrária", () => {
  project.courses.forEach((course) => {
    const courseCards = course.modules.flatMap(({ lessons: values }) => values)
      .flatMap(({ microsequences: values }) => values)
      .flatMap(({ cards: values }) => values);
    const responsePackages = new Set(courseCards.filter(({ response }) => response).map(({ response }) => response.package));
    assert.ok(courseCards.filter(({ role }) => role === "practice").length >= 6, course.id);
    assert.ok(responsePackages.size >= 3, course.id);
  });
});

test("a teoria do corpus não volta ao parágrafo-resumo", () => {
  cards.filter(({ role }) => role === "theory").forEach((card) => {
    card.content.filter(({ package: packageId }) => packageId === "aralearn.resource.paragraph").forEach(({ data }) => {
      const wordCount = data.text.trim().split(/\s+/u).length;
      assert.ok(wordCount <= 85, `${card.id}: ${wordCount} palavras`);
    });
  });
});

test("todo card conserva proveniência pública e oficial do recorte", () => {
  cards.forEach((card) => {
    assert.ok(card.sources.length > 0, card.id);
    card.sources.forEach((source) => assert.match(source, /^https:\/\/(?:spo\.ifsp\.edu\.br|conhecimento\.fgv\.br|www\.rfc-editor\.org|www\.omg\.org)\//u, `${card.id}: ${source}`));
  });
});
