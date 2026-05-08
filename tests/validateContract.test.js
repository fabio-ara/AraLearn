import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function projectWithCards(cards) {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
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
                status: "draft",
                cards
              }
            ]
              }
            ]
          }
        ]
      }
    ]
  };
}

test("valida o exemplo público do contrato principal e gera keys ausentes", () => {
  const document = readJson("./docs/examples/aralearn-contract.renderable.json");

  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.contract");
  assert.equal(result.value.version, 1);
  assert.equal(result.value.kind, "project");
  assert.equal(result.value.courses[0].key, "course-curso-renderizavel");
  assert.equal(
    result.value.courses[0].modules[0].lessons[0].microsequences[0].key,
    "microsequence-modelo-cascata"
  );
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].say, "O modelo cascata organiza o trabalho em fases sequenciais.");
});

test("rejeita campos legados de card no contrato principal", () => {
  const result = validateContractDocument(projectWithCards([{ type: "text", title: "Antigo", text: "x" }]));

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Campo não suportado em card: "type"/
  );
});

test("aceita card flow com estrutura pública composta", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
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
    ])
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].flow[1].if, "x > 0");
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].flow[1].id, "flow-2");
});

test("aceita card tree expositivo sem prática", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Árvore",
        say: "Observe os diretórios.",
        tree: {
          base: "/",
          current: "/home/aluno",
          items: {
            home: {
              aluno: {
                "README.txt": null
              }
            }
          }
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  const card = result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  assert.equal(card.tree.items.home.aluno["README.txt"], null);
  assert.equal("practice" in card.tree, false);
});

test("aceita microssequência sem cards quando o status é explícito", () => {
  const result = validateContractDocument(projectWithCards([]));

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].status, "draft");
  assert.deepEqual(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards, []);
});

test("rejeita microssequência sem status explícito", () => {
  const document = projectWithCards([
    {
      title: "Ideia",
      say: "Leia a ideia."
    }
  ]);
  delete document.courses[0].modules[0].lessons[0].microsequences[0].status;

  const result = validateContractDocument(document);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Campo obrigatório inválido: "status"/
  );
});

test("aceita status explícito de rascunho", () => {
  const document = projectWithCards([]);
  document.courses[0].modules[0].lessons[0].microsequences[0].status = "draft";

  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].status, "draft");
});

test("rejeita runtime autorado no JSON público", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Árvore",
        say: "Fallback",
        runtime: {
          blocks: [{ kind: "directory_tree", base: "/", nodes: [] }]
        }
      }
    ])
  );

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Campo não suportado em card: "runtime"/
  );
});
