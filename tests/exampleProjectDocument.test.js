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
  assert.equal(course.modules[0].lessons[0].microsequences[0].cards.length, 0);
});

test("seed principal termina sem cards de exemplo", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const document = result.value;
  const microsequence = document.courses[0].modules[0].lessons[0].microsequences[0];

  assert.equal(microsequence.title, "Microssequência vazia");
  assert.deepEqual(microsequence.cards, []);
});
