import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { runBottomUpCardAudit } from "../../src/generation/engine/bottomUpAuditRuntime.js";

function auditContext() {
  return {
    generationContract: { microsequence: { title: "Teste" } },
    cards: [{ position: 1, resource: "matrix", kind: "exercise", exercise: "choice" }],
    slotPackets: [{ position: 1, slots: { 1: "Posição", 2: "Observe.", 3: "A", 4: "1 | 2", 5: "3 | 4", 6: "2", 7: "1", 8: "Qual valor está na linha 2, coluna 1?", 9: "3", 10: "2", 11: "4", 12: "Feedback genérico." } }],
    planItems: [{ position: 1, templateId: "matrix_locate_cell_choice" }]
  };
}

test("runBottomUpCardAudit não aplica patch não numérico e faz retry", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_card_audit: [
        {
          text: `AUDIT
CARD 1
action: 1202
values: [
`,
          usage: {}
        },
        {
          text: `AUDIT
CARD 1
action: 1202
reason: Corrigir feedback
12: Primeiro vem a linha e depois a coluna.
`,
          usage: {}
        }
      ]
    }
  });
  const result = await runBottomUpCardAudit({
    provider,
    modelId: "fake:model",
    ...auditContext()
  });
  assert.equal(result.failClosed, false);
  assert.equal(result.appliedSlotPatches.length, 1);
  assert.equal(result.appliedSlotPackets[0].slots["12"], "Primeiro vem a linha e depois a coluna.");
});

test("runBottomUpCardAudit falha fechado se a auditoria persiste em patch inválido", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_card_audit: [
        { text: "AUDIT\nCARD 1\naction: 1202\nvalues: [", usage: {} },
        { text: "AUDIT\nCARD 1\naction: 1202\nvalues: [", usage: {} }
      ]
    }
  });
  const result = await runBottomUpCardAudit({
    provider,
    modelId: "fake:model",
    ...auditContext()
  });
  assert.equal(result.failClosed, true);
  assert.match(result.invalidAuditPatches[0], /slots numéricos|values/i);
});

test("runBottomUpCardAudit aplica patch numérico válido", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_card_audit: {
        text: `AUDIT
CARD 1
action: 1202
reason: Corrigir linha da matriz
4: [2, 5, 8]
5: 3 | 6 | 9
`,
        usage: {}
      }
    }
  });
  const result = await runBottomUpCardAudit({
    provider,
    modelId: "fake:model",
    ...auditContext()
  });
  assert.equal(result.failClosed, false);
  assert.equal(result.appliedSlotPackets[0].slots["4"], "2 | 5 | 8");
  assert.equal(result.appliedSlotPackets[0].slots["5"], "3 | 6 | 9");
});

test("runBottomUpCardAudit rejeita vazamento estrutural em slot textual e corrige só o slot pedido", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_card_audit: [
        {
          text: `AUDIT
CARD 1
action: 1209
reason: feedback com vazamento estrutural
12: CARD 2
`,
          usage: {}
        },
        {
          text: `AUDIT
CARD 1
action: 1209
reason: feedback mais útil
12: Primeiro vem a linha e depois a coluna.
`,
          usage: {}
        }
      ]
    }
  });
  const result = await runBottomUpCardAudit({
    provider,
    modelId: "fake:model",
    ...auditContext()
  });
  assert.equal(result.failClosed, false);
  assert.equal(result.appliedSlotPatches.length, 1);
  assert.deepEqual(Object.keys(result.appliedSlotPatches[0].patches), ["12"]);
  assert.equal(result.appliedSlotPackets[0].slots["12"], "Primeiro vem a linha e depois a coluna.");
});
