import test from "node:test";
import assert from "node:assert/strict";

import { buildSourceLedgerArtifact } from "../src/generation/courseForge/courseForgeIr.js";
import { buildCourseForgeSourcePack } from "../src/generation/courseForge/courseForgeSourcePack.js";

function buildLargeText(label = "", repeat = 80) {
  return Array.from({ length: repeat }, (_, index) =>
    `${label} ${index + 1}. Exercício curto, definição explícita e observação de notação para manter contexto estável no SourceLedger.`
  ).join("\n\n");
}

test("buildCourseForgeSourcePack compacta fontes grandes dentro do budget da fase", () => {
  const ledger = buildSourceLedgerArtifact({
    attachments: [
      { id: "attachment_1", name: "base-1.md", kind: "attachment", textContent: buildLargeText("Fonte A", 120) },
      { id: "attachment_2", name: "base-2.md", kind: "attachment", textContent: buildLargeText("Fonte B", 120) }
    ],
    promptText: buildLargeText("Prompt", 120)
  });

  const result = buildCourseForgeSourcePack({
    sourceLedger: ledger,
    phaseId: "plan_architecture"
  });

  assert.ok(result.text.length <= result.budget.maxChars);
  assert.ok(result.budget.omittedSpanCount > 0);
  assert.match(result.text, /contexto resumido por budget/i);
});

test("buildCourseForgeSourcePack usa prompt quando não há anexos", () => {
  const ledger = buildSourceLedgerArtifact({
    attachments: [],
    promptText: "Quero uma trilha de revisão curta sobre grafos."
  });

  const result = buildCourseForgeSourcePack({
    sourceLedger: ledger,
    phaseId: "answer_locally"
  });

  assert.match(result.text, /prompt complementar: 1/i);
  assert.match(result.text, /trilha de revisão curta sobre grafos/i);
});
