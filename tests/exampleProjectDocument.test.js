import test from "node:test";
import assert from "node:assert/strict";

import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import { validateContractDocument } from "../src/contract/validateContract.js";
import { resolveCardRuntime } from "../src/core/cardRuntime.js";

test("o conteúdo inicial da interface valida no contrato atual", () => {
  const document = createExampleProjectDocument();
  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.contract");
  assert.equal(result.value.courses.length, 1);
});

test("o conteúdo inicial agora mantém um único curso de teste", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const document = result.value;
  const course = document.courses[0];

  assert.equal(course.key, "course-teste-runtime");
  assert.equal(course.modules.length, 1);
  assert.equal(course.modules[0].lessons.length, 2);
  assert.equal(course.modules[0].lessons[0].microsequences.length, 1);
  assert.equal(course.modules[0].lessons[0].microsequences[0].cards.length, 3);
});

test("o conteúdo inicial preserva o card oficial com árvore de diretórios", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const document = result.value;
  const microsequence = document.courses[0].modules[0].lessons[0].microsequences[0];
  const card = microsequence.cards[0];
  const treeBlock = resolveCardRuntime(card).blocks[2];

  assert.equal(microsequence.title, "Diretório atual e caminhos");
  assert.equal(card.title, "Onde você está na árvore");
  assert.equal(treeBlock.kind, "directory_tree");
  assert.equal(treeBlock.currentNodeId, "node-home-aluno-projetos");
  assert.equal(treeBlock.selectedNodeId, "node-home-aluno-projetos");
  assert.deepEqual(treeBlock.collapsedNodeIds, ["node-home-aluno-downloads", "node-home-aluno-publico"]);
  assert.equal(treeBlock.nodes[0].children[0].children[1].name, "projetos");
  assert.equal(treeBlock.nodes[0].children[0].children[0].children[0].name, "arquivos-antigos");
  assert.equal(treeBlock.nodes[0].children[0].children[2].children[0].name, "galeria");
});

test("o conteúdo inicial mantém a árvore apenas como exemplo expositivo", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const cards = result.value.courses[0].modules[0].lessons[0].microsequences[0].cards;
  const blocks = cards.map((card) => resolveCardRuntime(card).blocks[2]);

  assert.equal(cards[1].title, "Pastas irmãs e arquivo final");
  assert.equal(cards[2].title, "Downloads e arquivo compactado");
  assert.equal(blocks.every((block) => block.practice === undefined), true);
  assert.equal(blocks[1].selectedNodeId, "node-home-aluno-publico-notas-txt");
  assert.equal(blocks[2].selectedNodeId, "node-home-aluno-downloads-pacote-zip");
});

test("o conteúdo inicial inclui uma lição de teste com todos os exercícios por opções", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const lesson = result.value.courses[0].modules[0].lessons[1];
  const microsequence = lesson.microsequences[0];
  const runtimeKinds = microsequence.cards.map((card) =>
    resolveCardRuntime(card).blocks.filter((block) => block.kind !== "button").at(-1)?.kind
  );

  assert.equal(lesson.title, "Verificação dos exercícios com opções");
  assert.equal(microsequence.title, "Todos os exercícios com opções");
  assert.deepEqual(runtimeKinds, ["multiple_choice", "paragraph", "editor", "table", "flowchart"]);
  assert.equal(microsequence.cards.every((card) => typeof card.after === "string" && card.after.length > 0), true);
});
