import test from "node:test";
import assert from "node:assert/strict";

import { cloneBlocks, getBlockAtPath, getParentArrayAtPath, parseBlockPath } from "../src/ui/cardBlockPath.js";

test("cardBlockPath interpreta segmentos numericos e textuais", () => {
  assert.deepEqual(parseBlockPath("0.children.2.label"), [0, "children", 2, "label"]);
  assert.deepEqual(parseBlockPath(""), []);
});

test("cardBlockPath encontra bloco e array pai no caminho informado", () => {
  const blocks = [
    {
      kind: "popup",
      children: [
        { kind: "paragraph", label: "A" },
        { kind: "list", label: "B" }
      ]
    }
  ];

  assert.equal(getBlockAtPath(blocks, "0.children.1.label"), "B");
  assert.deepEqual(getParentArrayAtPath(blocks, "0.children.1"), {
    array: blocks[0].children,
    index: 1
  });
  assert.equal(getParentArrayAtPath(blocks, ""), null);
});

test("cardBlockPath clona estrutura sem reaproveitar referencia", () => {
  const original = [{ kind: "paragraph", label: "Texto" }];
  const copied = cloneBlocks(original);

  copied[0].label = "Alterado";

  assert.equal(original[0].label, "Texto");
  assert.equal(copied[0].label, "Alterado");
});
