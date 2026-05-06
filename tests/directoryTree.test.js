import test from "node:test";
import assert from "node:assert/strict";

import {
  addDirectoryTreeChildNode,
  compareDirectoryTreeStructures,
  deriveDirectoryTreeExpectedNodes,
  normalizeDirectoryTreePractice,
  removeDirectoryTreeNode,
  renameDirectoryTreeNode,
  resolveDirectoryTreePracticeExpectedName,
  resolveDirectoryTreeTemplateValue
} from "../src/core/directoryTree.js";

test("resolve nome esperado da prática com template parcial", () => {
  const practice = normalizeDirectoryTreePractice({
    mode: "create_file",
    nameTemplate: "[[README]].[[txt::txt|md]]"
  });

  assert.equal(resolveDirectoryTreeTemplateValue(practice.nameTemplate), "README.txt");
  assert.equal(resolveDirectoryTreePracticeExpectedName(practice), "README.txt");
});

test("deriva árvore esperada para criação, remoção e renomeação", () => {
  const nodes = [
    {
      id: "node-home",
      type: "folder",
      name: "home",
      children: [
        {
          id: "node-docs",
          type: "folder",
          name: "docs"
        },
        {
          id: "node-notas",
          type: "file",
          name: "notas.txt"
        }
      ]
    }
  ];

  const created = deriveDirectoryTreeExpectedNodes(nodes, {
    mode: "create_folder",
    parentNodeId: "node-home",
    nameTemplate: "[[assets]]"
  });
  assert.equal(created[0].children[2].name, "assets");

  const removed = removeDirectoryTreeNode(nodes, "node-notas");
  assert.equal(removed[0].children.length, 1);

  const renamed = renameDirectoryTreeNode(nodes, "node-notas", "relatorio-final.pdf");
  assert.equal(renamed[0].children[1].name, "relatorio-final.pdf");
});

test("compara estruturas de árvore ignorando ids gerados no runtime", () => {
  const left = addDirectoryTreeChildNode([], "__directory_tree_base__", {
    id: "runtime-1",
    type: "file",
    name: "README.txt"
  });
  const right = [
    {
      id: "answer-1",
      type: "file",
      name: "README.txt"
    }
  ];

  assert.equal(compareDirectoryTreeStructures(left, right), true);
});
