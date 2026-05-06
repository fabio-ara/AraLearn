import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildRuntime } from "../src/core/buildRuntime.js";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

test("compila o contrato principal com pipeline própria e ids determinísticos", () => {
  const result = buildRuntime(readText("./docs/examples/aralearn-contract.renderable.json"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.stages, ["load", "validate", "normalize", "compile"]);
  assert.equal(result.normalizedDocument.courses[0].modules[0].lessons[0].microsequences[0].title, "Modelo cascata");
  assert.equal(result.compiled.contract, "aralearn.contract");
  assert.equal(result.compiled.index.cards[1].type, "choice");
  assert.equal(result.compiled.index.cards[3].type, "editor");
  assert.equal(result.compiled.index.cards[1].runtime.blocks[1].kind, "multiple_choice");
  assert.equal(result.compiled.index.cards[4].runtime.blocks[1].kind, "table");
  assert.equal(result.compiled.index.cards[5].runtime.blocks[1].kind, "flowchart");
  assert.equal(result.compiled.index.cards[5].runtime.blocks[1].structureVersion, 1);
  assert.equal(result.compiled.index.cards[5].runtime.blocks[1].projectionVersion, 1);
  assert.equal(result.compiled.index.cards[5].runtime.blocks[1].projectionValid, true);
  assert.equal(
    result.compiled.index.cards[0].scope.lessonId,
    "lesson:course-curso-renderizavel:module-modulo-experimental:lesson-licao-experimental"
  );
});

test("falha cedo quando o contrato principal é inválido", () => {
  const result = buildRuntime({
    contract: "aralearn.contract",
    courses: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, "validate");
});

test("preserva runtime autorado ao compilar o documento", () => {
  const result = buildRuntime({
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
                        type: "text",
                        title: "Árvore",
                        text: "Fallback",
                        runtime: {
                          title: "Árvore",
                          blocks: [
                            { kind: "heading", value: "Árvore" },
                            { kind: "directory_tree", base: "/", currentNodeId: "node-a", nodes: [] }
                          ]
                        }
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
  assert.equal(result.compiled.index.cards[0].runtime.blocks[1].kind, "directory_tree");
  assert.equal(result.compiled.index.cards[0].runtime.blocks[1].currentNodeId, "node-a");
});
