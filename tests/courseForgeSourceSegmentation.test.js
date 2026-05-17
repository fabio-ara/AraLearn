import test from "node:test";
import assert from "node:assert/strict";

import { buildSourceLedgerArtifact } from "../src/generation/courseForge/courseForgeIr.js";

test("buildSourceLedgerArtifact preserva blocos estruturados como spans distintos", () => {
  const ledger = buildSourceLedgerArtifact({
    attachments: [
      {
        id: "src_1",
        name: "apostila.pdf",
        mimeType: "application/pdf",
        textContent: "1 INTRODUCAO\n\n- conceito A\n- conceito B\n\nTexto final.",
        sourceBlocks: [
          { blockType: "heading", text: "1 INTRODUCAO" },
          { blockType: "list_item", text: "- conceito A" },
          { blockType: "list_item", text: "- conceito B" },
          { blockType: "paragraph", text: "Texto final." }
        ]
      }
    ]
  });

  const spans = ledger.sources[0].spans;
  assert.equal(spans.length, 4);
  assert.equal(spans[0].blockType, "heading");
  assert.equal(spans[1].blockType, "list_item");
  assert.equal(spans[2].blockType, "list_item");
  assert.equal(spans[3].blockType, "paragraph");
});
