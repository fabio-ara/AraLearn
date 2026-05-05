import test from "node:test";
import assert from "node:assert/strict";

import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import { validateContractDocument } from "../src/contract/validateContract.js";

test("seed principal da UI valida no contrato atual", () => {
  const document = createExampleProjectDocument();
  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.contract");
  assert.equal(result.value.courses.length, 1);
});

test("seed principal agora mantém um único curso de teste", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const document = result.value;
  const course = document.courses[0];

  assert.equal(course.key, "course-teste-runtime");
  assert.equal(course.modules.length, 1);
  assert.equal(course.modules[0].lessons.length, 1);
  assert.equal(course.modules[0].lessons[0].microsequences.length, 1);
  assert.equal(course.modules[0].lessons[0].microsequences[0].cards.length, 1);
});

test("primeiro card do seed é uma tabela com lacunas por bloco", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const document = result.value;
  const card = document.courses[0].modules[0].lessons[0].microsequences[0].cards[0];

  assert.equal(card.key, "card-tabela-blocos");
  assert.equal(card.type, "table");
  assert.equal(Array.isArray(card.rows), true);
  assert.match(card.rows[0][0], /\[\[type::type\|title\|key\]\]/);
  assert.match(card.rows[1][1], /\[\[blocos::blocos\|módulos\|tokens\]\]/);
});
