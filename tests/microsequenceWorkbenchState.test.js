import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveMicrosequenceAssistOpenState,
  resolveWorkbenchPaneAfterCardSelection
} from "../src/ui/microsequenceWorkbenchState.js";

test("abre o painel da microssequência na última versão e em preview", () => {
  const state = resolveMicrosequenceAssistOpenState(
    {
      versions: [
        { id: "v1", cards: Array.from({ length: 3 }, (_, index) => ({ key: `c1-${index}` })) },
        { id: "v2", cards: Array.from({ length: 5 }, (_, index) => ({ key: `c2-${index}` })) },
        { id: "v3", cards: Array.from({ length: 7 }, (_, index) => ({ key: `c3-${index}` })) }
      ]
    },
    4
  );

  assert.deepEqual(state, {
    activeVersionId: "v3",
    cardIndex: 4,
    activeWorkbenchPane: "preview"
  });
});

test("limita o card inicial ao total visível da última versão", () => {
  const state = resolveMicrosequenceAssistOpenState(
    {
      versions: [
        { id: "v1", cards: Array.from({ length: 2 }, (_, index) => ({ key: `c1-${index}` })) },
        { id: "v2", cards: Array.from({ length: 4 }, (_, index) => ({ key: `c2-${index}` })) }
      ]
    },
    9
  );

  assert.equal(state.activeVersionId, "v2");
  assert.equal(state.cardIndex, 3);
  assert.equal(state.activeWorkbenchPane, "preview");
});

test("selecionar mini-card força preview apenas no painel da microssequência", () => {
  assert.equal(resolveWorkbenchPaneAfterCardSelection("microsequence-assist", "edit"), "preview");
  assert.equal(resolveWorkbenchPaneAfterCardSelection("microsequence-assist", "preview"), "preview");
  assert.equal(resolveWorkbenchPaneAfterCardSelection("lesson", "edit"), "edit");
});
