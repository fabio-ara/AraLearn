import test from "node:test";
import assert from "node:assert/strict";

import {
  bottomUpAssistanceScopeInput,
  bottomUpAssistanceUiSelectionIsReady,
  createBottomUpAssistanceUiState,
  reconcileBottomUpAssistanceUiState,
  toggleBottomUpAssistanceContainer,
  toggleBottomUpAssistanceItem
} from "../../src/ui/bottomUpAssistanceUiState.js";

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a"
};

function context(level, itemIds = []) {
  return {
    level,
    selection,
    containerId: level === "lesson" ? "lesson-a" : level === "microsequence" ? "micro-a" : "card-a",
    itemIds
  };
}

test("card distingue todos os resources do card inteiro", () => {
  const target = context("card", ["body:a", "body:b"]);
  let state = createBottomUpAssistanceUiState(target);
  state = toggleBottomUpAssistanceItem(state, target, "body:a");
  state = toggleBottomUpAssistanceItem(state, target, "body:b");
  assert.equal(state.kind, "items");
  assert.deepEqual(state.selectedIds, ["body:a", "body:b"]);
  assert.deepEqual(bottomUpAssistanceScopeInput(state, target), {
    level: "card",
    kind: "items",
    targetIds: ["body:a", "body:b"]
  });

  state = toggleBottomUpAssistanceContainer(state, target);
  assert.equal(state.kind, "container");
  assert.deepEqual(bottomUpAssistanceScopeInput(state, target), {
    level: "card",
    kind: "container",
    targetIds: []
  });
});

test("todos os cards promovem a microssequência e um clique demove", () => {
  const target = context("microsequence", ["card-a", "card-b", "card-c"]);
  let state = createBottomUpAssistanceUiState(target);
  for (const cardId of target.itemIds) {
    state = toggleBottomUpAssistanceItem(state, target, cardId);
  }
  assert.equal(state.kind, "container");
  assert.equal(state.selectionSource, "promoted");

  state = toggleBottomUpAssistanceItem(state, target, "card-b");
  assert.equal(state.kind, "items");
  assert.deepEqual(state.selectedIds, ["card-a", "card-c"]);
});

test("todas as microssequências promovem a lição e permitem desseleção", () => {
  const target = context("lesson", ["micro-a", "micro-b"]);
  let state = createBottomUpAssistanceUiState(target);
  state = toggleBottomUpAssistanceItem(state, target, "micro-b");
  state = toggleBottomUpAssistanceItem(state, target, "micro-a");
  assert.equal(state.kind, "container");
  assert.deepEqual(state.selectedIds, ["micro-a", "micro-b"]);

  state = toggleBottomUpAssistanceContainer(state, target);
  assert.equal(state.kind, "none");
  assert.equal(bottomUpAssistanceUiSelectionIsReady(state, target), false);
});

test("contêiner vazio só é autorizado por seleção explícita", () => {
  const target = context("lesson", []);
  let state = createBottomUpAssistanceUiState(target);
  assert.equal(bottomUpAssistanceUiSelectionIsReady(state, target), false);
  state = toggleBottomUpAssistanceContainer(state, target);
  assert.equal(state.kind, "container");
  assert.equal(bottomUpAssistanceUiSelectionIsReady(state, target), true);
});

test("mudança de referência descarta seleção antiga", () => {
  const first = context("microsequence", ["card-a", "card-b"]);
  let state = toggleBottomUpAssistanceItem(
    createBottomUpAssistanceUiState(first),
    first,
    "card-a"
  );
  const second = {
    ...first,
    selection: { ...selection, microsequenceKey: "micro-b", cardKey: "card-c" },
    containerId: "micro-b",
    itemIds: ["card-c"]
  };
  state = reconcileBottomUpAssistanceUiState(state, second);
  assert.equal(state.kind, "none");
  assert.deepEqual(state.selectedIds, []);
});
