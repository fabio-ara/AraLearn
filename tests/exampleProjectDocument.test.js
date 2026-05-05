import test from "node:test";
import assert from "node:assert/strict";

import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import { validateContractDocument } from "../src/contract/validateContract.js";

test("seed principal da UI valida no contrato atual", () => {
  const document = createExampleProjectDocument();
  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.contract");
  assert.equal(result.value.courses.length >= 2, true);
});

test("seed principal expõe exemplos de fluxograma para leitura e prática", () => {
  const document = createExampleProjectDocument();
  const softwareCourse = document.courses.find((course) => course.key === "course-engenharia-software");
  const lesson = softwareCourse.modules[0].lessons.find((entry) => entry.key === "lesson-modelos-processo");
  const microsequence = lesson.microsequences.find((entry) => entry.key === "microsequence-modelo-v");
  const cards = microsequence.cards.filter((card) => card.type === "flow");
  const practiceCard = cards.find((card) => card.key === "card-v-fluxo-pratica");
  const structuralCard = cards.find((card) => card.key === "card-v-fluxo-estrutural");

  assert.equal(Boolean(structuralCard), true);
  assert.equal(Boolean(practiceCard), true);
  assert.equal(practiceCard.flow[0].practice.blankShape, true);
  assert.equal(practiceCard.flow[1].practice.text.blank, true);
  assert.equal(structuralCard.flow[1].practice.labels.yes.blank, true);
});
