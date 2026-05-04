import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateIntentV1Document } from "../src/contract/validateIntentV1.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

test("valida o exemplo público e gera keys ausentes", () => {
  const document = readJson("./docs/examples/aralearn-intent-v1.valid.json");

  const result = validateIntentV1Document(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.intent.v1");
  assert.equal(result.value.courses[0].key, "course-curso-de-exemplo");
  assert.equal(result.value.courses[0].modules[0].key, "module-fundamentos");
  assert.equal(result.value.courses[0].modules[0].lessons[0].key, "lesson-primeira-licao");
  assert.equal(
    result.value.courses[0].modules[0].lessons[0].microsequences[0].key,
    "microsequence-apresentar-o-primeiro-conceito"
  );
  assert.equal(
    result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].key,
    "card-conceito-inicial"
  );
});

test("rejeita card solto fora de microssequência", () => {
  const document = readJson("./docs/examples/aralearn-intent-v1.invalid.json");

  const result = validateIntentV1Document(document);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Card solto é inválido/
  );
});

test("rejeita key duplicada no mesmo escopo", () => {
  const duplicateKeys = {
    contract: "aralearn.intent.v1",
    courses: [
      {
        key: "curso",
        title: "Curso",
        modules: [
          {
            key: "modulo",
            title: "Módulo A",
            lessons: [
              {
                key: "licao",
                title: "Lição A",
                microsequences: [
                  {
                    key: "micro",
                    objective: "Objetivo A",
                    cards: [
                      { key: "card-a", intent: "text" },
                      { key: "card-a", intent: "text" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const result = validateIntentV1Document(duplicateKeys);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Key duplicada no escopo/
  );
});

test("rejeita intent desconhecida com erro claro", () => {
  const invalidIntent = {
    contract: "aralearn.intent.v1",
    courses: [
      {
        title: "Curso",
        modules: [
          {
            title: "Módulo",
            lessons: [
              {
                title: "Lição",
                microsequences: [
                  {
                    objective: "Objetivo",
                    cards: [
                      {
                        intent: "legacy-widget"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const result = validateIntentV1Document(invalidIntent);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Intent desconhecida: "legacy-widget"/
  );
});
