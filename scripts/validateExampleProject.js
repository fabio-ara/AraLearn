import { validateContractDocument } from "../src/contract/validateContract.js";
import { createExampleProjectDocument, createTeoriaDosGrafosProvaProjectDocument } from "../tests/support/exampleProjectDocument.js";

function assertValid(label, document) {
  const result = validateContractDocument(document);
  if (!result.ok) {
    throw new Error(`${label} inválido: ${result.error}`);
  }

  return {
    label,
    courseCount: result.value.courses.length
  };
}

const summaries = [
  assertValid("exampleProjectDocument", createExampleProjectDocument()),
  assertValid("teoriaDosGrafosProvaProjectDocument", createTeoriaDosGrafosProvaProjectDocument())
];

console.log(JSON.stringify(summaries, null, 2));
