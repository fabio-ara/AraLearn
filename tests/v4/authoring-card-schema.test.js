import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEMA_ROOT = path.join(ROOT, "authoring", "schemas");

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_ROOT, name), "utf8"));
}

test("schema formal discrimina recursos, exige gaps e rejeita campos estranhos", () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(ajv);
  const validate = ajv.compile(readSchema("card.schema.json"));
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
  assert.equal(validate(valid), true, ajv.errorsText(validate.errors));

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
    {
      ...valid,
      gaps: [{ id: "selection", response: "text", answer: "   " }]
    },
    {
      ...valid,
      gaps: [{ id: "selection", response: "text", answer: " colunas" }]
    },
    {
      ...valid,
      gaps: [{ id: "selection", response: "text", answer: "uma\nlinha" }]
    },
    {
      ...valid,
      gaps: [{
        id: "selection",
        response: "choice",
        answer: "colunas",
        distractors: ["linhas", "linhas"]
      }]
    }
  ]) {
    assert.equal(validate(invalid), false, JSON.stringify(invalid));
  }

  assert.match(
    JSON.stringify(readSchema("card.schema.json")),
    /NFKC/u,
    "O schema precisa tornar pública a regra semântica de unicidade."
  );
});
