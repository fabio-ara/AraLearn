import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildIntentV1Runtime } from "../src/core/buildIntentV1Runtime.js";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

test("compila o exemplo válido para um modelo interno determinístico", () => {
  const result = buildIntentV1Runtime(readText("./docs/examples/aralearn-intent-v1.valid.json"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.stages, ["load", "validate", "normalize", "compile"]);
  assert.equal(result.compiled.courses[0].id, "course:course-curso-de-exemplo");
  assert.equal(result.compiled.courses[0].modules[0].id, "module:course-curso-de-exemplo:module-fundamentos");
  assert.equal(
    result.compiled.courses[0].modules[0].lessons[0].microsequences[0].id,
    "microsequence:course-curso-de-exemplo:module-fundamentos:lesson-primeira-licao:microsequence-apresentar-o-primeiro-conceito"
  );
  assert.equal(
    result.compiled.index.cards[0].id,
    "card:course-curso-de-exemplo:module-fundamentos:lesson-primeira-licao:microsequence-apresentar-o-primeiro-conceito:card-conceito-inicial"
  );
  assert.equal(result.compiled.index.sequences[0].cardIds[0], result.compiled.index.cards[0].id);
});

test("falha na etapa de load quando a fonte JSON é inválida", () => {
  const result = buildIntentV1Runtime("{ invalid json");

  assert.equal(result.ok, false);
  assert.equal(result.stage, "load");
  assert.match(result.errors[0].message, /JSON inválido/);
});

test("falha antes da compilação quando o documento é estruturalmente inválido", () => {
  const result = buildIntentV1Runtime(readText("./docs/examples/aralearn-intent-v1.invalid.json"));

  assert.equal(result.ok, false);
  assert.equal(result.stage, "validate");
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Card solto é inválido/
  );
});

test("mantém ids internos apenas no modelo compilado", () => {
  const result = buildIntentV1Runtime(readText("./docs/examples/aralearn-intent-v1.valid.json"));

  assert.equal(result.ok, true);
  assert.equal("id" in result.normalized.courses[0], false);
  assert.equal("id" in result.normalized.courses[0].modules[0], false);
  assert.equal("id" in result.normalized.courses[0].modules[0].lessons[0].microsequences[0], false);
  assert.equal("id" in result.normalized.courses[0].modules[0].lessons[0].microsequences[0].cards[0], false);
});
