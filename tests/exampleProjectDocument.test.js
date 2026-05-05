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

test("seed principal expõe um curso de exemplo para múltipla escolha", () => {
  const document = createExampleProjectDocument();
  const card = document.courses[0].modules[0].lessons[0].microsequences[0].cards[0];

  assert.equal(document.courses[0].key, "course-teste-choice");
  assert.equal(card.type, "choice");
  assert.deepEqual(card.answer, ["type"]);
  assert.deepEqual(card.wrong, ["title", "runtime"]);
});
