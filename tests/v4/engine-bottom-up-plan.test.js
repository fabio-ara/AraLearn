import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { runBottomUpMicroPlan } from "../../src/generation/engine/bottomUpPlanRuntime.js";

test("bottom-up plan usa códigos válidos e template coerente", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_micro_plan: {
        text: `
CARD 1
1: 103
2: 204
3: 1101
4: 402
5: 502
6: usar matriz
7: matrix_theory
`,
        usage: {}
      }
    }
  });
  const result = await runBottomUpMicroPlan({
    provider,
    modelId: "fake:model",
    planningContract: { microsequence: { title: "Posição a_ij" } },
    validatedPlan: { plan: { goal: "Posição a_ij", slotPlan: [{ position: 1, role: "explain", goal: "mostrar matriz" }] } }
  });
  assert.equal(result[0].resourceCode, 103);
  assert.equal(result[0].templateId, "matrix_theory");
});
