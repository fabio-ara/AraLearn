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
          { blockType: "heading", instructionalRole: "objective", text: "1 INTRODUCAO" },
          { blockType: "list_item", instructionalRole: "exercise", text: "- conceito A" },
          { blockType: "list_item", instructionalRole: "exercise", text: "- conceito B" },
          { blockType: "paragraph", instructionalRole: "note", text: "Texto final." }
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
  assert.equal(spans[0].instructionalRole, "objective");
  assert.ok(spans[0].assessmentSignals.includes("goal_reference"));
  assert.ok(spans[0].teacherConventions.includes("explicit_objective_block"));
  assert.ok(spans[1].assessmentSignals.includes("practice_prompt"));
  assert.ok(spans[1].teacherConventions.includes("exercise_block"));
  assert.ok(spans[3].teacherConventions.includes("teacher_note_block"));
});
