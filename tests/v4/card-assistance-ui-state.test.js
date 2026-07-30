import test from "node:test";
import assert from "node:assert/strict";

import {
  cardAssistanceSelectionIsReady,
  createCardAssistanceUiState,
  reconcileCardAssistanceUiState,
  selectCardCreationPlacement,
  selectCardRepairScope,
  toggleCardAssistanceResource
} from "../../src/ui/cardAssistanceUiState.js";

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a"
};

const card = {
  id: "card-a",
  position: 1,
  resource: "composite",
  kind: "theory",
  exercise: "none",
  title: "Card",
  blocks: [
    { id: "paragraph-1", kind: "paragraph", value: "Primeiro recurso." },
    { id: "paragraph-2", kind: "paragraph", value: "Segundo recurso." }
  ],
  after: ""
};

test("microssequência vazia normaliza destinos ancorados para o fim", () => {
  const emptySelection = { ...selection, cardKey: "" };
  const initial = reconcileCardAssistanceUiState(
    createCardAssistanceUiState(emptySelection),
    { selection: emptySelection, card: null }
  );
  assert.equal(initial.operation, "create");
  assert.equal(initial.placement, "end_current");

  const staleCardState = {
    ...createCardAssistanceUiState(selection),
    operation: "create",
    placement: "before_current"
  };
  const reconciled = reconcileCardAssistanceUiState(staleCardState, {
    selection: {
      ...emptySelection,
      microsequenceKey: "micro-empty"
    },
    card: null
  });
  assert.equal(reconciled.operation, "create");
  assert.equal(reconciled.placement, "end_current");

  const newMicrosequence = selectCardCreationPlacement(
    reconciled,
    {
      selection: {
        ...emptySelection,
        microsequenceKey: "micro-empty"
      },
      card: null
    },
    "new_microsequence"
  );
  assert.equal(newMicrosequence.placement, "new_microsequence");
});

test("seleção de recursos só fica pronta com alvos existentes e distintos", () => {
  let state = reconcileCardAssistanceUiState(
    createCardAssistanceUiState(selection),
    { selection, card }
  );
  state = selectCardRepairScope(state, { selection, card }, "resources");
  assert.equal(cardAssistanceSelectionIsReady(state, { selection, card }), false);

  state = toggleCardAssistanceResource(
    state,
    { selection, card },
    "body:paragraph-1"
  );
  assert.deepEqual(state.resourceTargetIds, ["body:paragraph-1"]);
  assert.equal(cardAssistanceSelectionIsReady(state, { selection, card }), true);

  state = toggleCardAssistanceResource(
    state,
    { selection, card },
    "body:inexistente"
  );
  assert.deepEqual(state.resourceTargetIds, ["body:paragraph-1"]);

  state = toggleCardAssistanceResource(
    state,
    { selection, card },
    "body:paragraph-1"
  );
  assert.deepEqual(state.resourceTargetIds, []);
  assert.equal(cardAssistanceSelectionIsReady(state, { selection, card }), false);
});
