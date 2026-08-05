import test from "node:test";
import assert from "node:assert/strict";

import {
  cardAssistanceSelectionIsReady,
  createCardAssistanceUiState,
  reconcileCardAssistanceUiState,
  toggleCardAssistanceResource,
  toggleCardAssistanceWholeCard
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

test("modo IA começa sem ampliar implicitamente a autoridade", () => {
  const context = { selection, card };
  const state = reconcileCardAssistanceUiState(
    createCardAssistanceUiState(selection),
    context
  );
  assert.equal(state.wholeCardSelected, false);
  assert.deepEqual(state.resourceTargetIds, []);
  assert.equal(cardAssistanceSelectionIsReady(state, context), false);
});

test("card inteiro alterna sem coexistir com recursos", () => {
  const context = { selection, card };
  let state = createCardAssistanceUiState(selection);
  state = toggleCardAssistanceResource(state, context, "body:paragraph-1");
  assert.deepEqual(state.resourceTargetIds, ["body:paragraph-1"]);

  state = toggleCardAssistanceWholeCard(state, context);
  assert.equal(state.wholeCardSelected, true);
  assert.deepEqual(state.resourceTargetIds, []);
  assert.equal(cardAssistanceSelectionIsReady(state, context), true);

  state = toggleCardAssistanceWholeCard(state, context);
  assert.equal(state.wholeCardSelected, false);
  assert.equal(cardAssistanceSelectionIsReady(state, context), false);
});

test("um ou vários recursos são selecionados diretamente e não viram card inteiro", () => {
  const context = { selection, card };
  let state = createCardAssistanceUiState(selection);
  state = toggleCardAssistanceResource(state, context, "body:paragraph-1");
  state = toggleCardAssistanceResource(state, context, "body:paragraph-2");
  assert.equal(state.wholeCardSelected, false);
  assert.deepEqual(state.resourceTargetIds, ["body:paragraph-1", "body:paragraph-2"]);
  assert.equal(cardAssistanceSelectionIsReady(state, context), true);

  state = toggleCardAssistanceResource(state, context, "body:paragraph-1");
  assert.deepEqual(state.resourceTargetIds, ["body:paragraph-2"]);
});

test("alvo inexistente é ignorado e mudança de card limpa a seleção", () => {
  const context = { selection, card };
  let state = toggleCardAssistanceResource(
    createCardAssistanceUiState(selection),
    context,
    "body:paragraph-1"
  );
  state = toggleCardAssistanceResource(state, context, "body:inexistente");
  assert.deepEqual(state.resourceTargetIds, ["body:paragraph-1"]);

  const movedSelection = { ...selection, cardKey: "card-b" };
  const secondCard = { ...card, id: "card-b" };
  state = reconcileCardAssistanceUiState(state, {
    selection: movedSelection,
    card: secondCard
  });
  assert.equal(state.wholeCardSelected, false);
  assert.deepEqual(state.resourceTargetIds, []);
  assert.deepEqual(state.selectedCardKeys, ["card-b"]);
});
