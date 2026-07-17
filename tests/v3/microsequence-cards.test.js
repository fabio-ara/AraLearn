import test from "node:test";
import assert from "node:assert/strict";

import { replaceMicrosequenceCards } from "../../src/domain/microsequence.js";

test("a microssequência substitui seus cards diretamente", () => {
  const microsequence = {
    id: "micro-2",
    title: "Segunda etapa",
    goal: "Continuar",
    status: "generated",
    role: "practice",
    dependsOn: [],
    covers: [],
    checks: [],
    cards: []
  };
  const next = replaceMicrosequenceCards(microsequence, [{ id: "card-1", position: 1 }], "generated");

  assert.equal(next.status, "generated");
  assert.deepEqual(next.cards, [{ id: "card-1", position: 1 }]);
});
