import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

test("valida o exemplo público do contrato principal e gera keys ausentes", () => {
  const document = readJson("./docs/examples/aralearn-contract.renderable.json");

  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.contract");
  assert.equal(result.value.courses[0].key, "course-curso-renderizavel");
  assert.equal(
    result.value.courses[0].modules[0].lessons[0].microsequences[0].key,
    "microsequence-modelo-cascata"
  );
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].type, "text");
});

test("rejeita tipo de card desconhecido no contrato principal", () => {
  const result = validateContractDocument({
    contract: "aralearn.contract",
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
                    title: "Microssequência",
                    cards: [{ type: "tree", title: "Ainda não", text: "x" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Tipo de card desconhecido: "tree"/
  );
});

test("aceita card flow com estrutura pública composta", () => {
  const result = validateContractDocument({
    contract: "aralearn.contract",
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
                    title: "Microssequência",
                    cards: [
                      {
                        type: "flow",
                        title: "Decisão",
                        flow: [
                          { start: "Início" },
                          {
                            if: "x > 0",
                            then: [{ process: "Seguir" }],
                            else: [{ output: "Parar" }]
                          },
                          { end: "Fim" }
                        ]
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
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].flow[1].if, "x > 0");
});
