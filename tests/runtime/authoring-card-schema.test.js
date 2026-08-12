import test from "node:test";
import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  getAuthoringResourceContract,
  listAuthoringResourceContracts
} from "../../src/core/authoringResourceContract.js";
import {
  AuthoringGapError,
  compileAuthoringCardGaps
} from "../../src/core/authoringGaps.js";

test("schema estrutural discrimina recursos e o compilador aplica semântica de gaps", () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(ajv);
  const validators = new Map(
    listAuthoringResourceContracts().map(({ resource }) => [
      resource,
      ajv.compile(getAuthoringResourceContract(resource).authoringSchema)
    ])
  );
  const common = {
    id: "card-1",
    position: 1,
    kind: "exercise",
    exercise: "gap",
    title: "Complete",
    after: "Confira a operação."
  };

  const valid = {
    ...common,
    resource: "code",
    prompt: "Complete a atribuição.",
    language: "python",
    code: "colunas = df[[\"nome\", \"idade\"]]\nresultado = {gap:selection}",
    gaps: [{
      id: "selection",
      response: "text",
      answer: "colunas"
    }]
  };
  const validateCode = validators.get("code");
  assert.equal(validateCode(valid), true, ajv.errorsText(validateCode.errors));
  const missingGaps = structuredClone(valid);
  delete missingGaps.gaps;

  for (const invalid of [
    { ...common, resource: "table", columns: ["A"] },
    {
      ...common,
      resource: "paragraph",
      text: "{gap:item}",
      rows: [["campo indevido"]],
      gaps: [{ id: "item", response: "text", answer: "valor" }]
    },
    {
      ...common,
      resource: "paragraph",
      text: "[[valor]]"
    },
    {
      ...valid,
      html: "<script>não pertence ao contrato</script>"
    },
    missingGaps
  ]) {
    const validateResource = validators.get(invalid.resource);
    assert.ok(validateResource, `Contrato autoral ausente para ${invalid.resource}.`);
    assert.equal(validateResource(invalid), false, JSON.stringify(invalid));
  }

  for (const invalidGaps of [
    [{ id: "selection", response: "text", answer: "   " }],
    [{ id: "selection", response: "text", answer: " colunas" }],
    [{ id: "selection", response: "text", answer: "uma\nlinha" }],
    [{
      id: "selection",
      response: "choice",
      answer: "colunas",
      distractors: ["linhas", "linhas"]
    }]
  ]) {
    assert.throws(
      () => compileAuthoringCardGaps({ ...valid, gaps: invalidGaps }),
      (error) => error instanceof AuthoringGapError
    );
  }
});
