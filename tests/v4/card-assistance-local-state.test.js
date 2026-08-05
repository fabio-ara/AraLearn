import test from "node:test";
import assert from "node:assert/strict";

import {
  CARD_ASSISTANCE_LOCAL_STATE_CONTRACT,
  CARD_ASSISTANCE_SYNC_MAX_PATHS,
  CARD_ASSISTANCE_UNDO_CONTRACT,
  clearContextualAuthoringSync,
  markContextualAuthoringSyncPending,
  normalizeCardAssistanceUndo,
  normalizeCardAssistanceLocalState,
  setCardAssistanceUndo
} from "../../src/assist/cardAssistanceLocalState.js";

function request(index) {
  return {
    requestId: `request-${index}`,
    createdAt: `2026-08-01T12:${String(index).padStart(2, "0")}:00.000Z`,
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a",
      cardKey: "card-a"
    },
    operation: "repair",
    promptText: `Corrija o card ${index}.`,
    selectedCardKeys: ["card-a"],
    repairScope: "card"
  };
}

test("reversão de card e lição usa um único registro sobrescrito", () => {
  let state = normalizeCardAssistanceLocalState({});
  const cardUndo = {
    contract: CARD_ASSISTANCE_UNDO_CONTRACT,
    kind: "microsequence",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    expectedRevision: "revision-a",
    beforeMicrosequence: { id: "micro-a", cards: [] }
  };
  state = setCardAssistanceUndo(state, cardUndo);
  assert.deepEqual(state.undo, {
    contract: CARD_ASSISTANCE_UNDO_CONTRACT,
    kind: "microsequence",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    expectedRevision: "revision-a",
    beforeMicrosequence: { id: "micro-a", cards: [] }
  });
  const lessonUndo = {
    contract: CARD_ASSISTANCE_UNDO_CONTRACT,
    kind: "lesson",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    expectedRevision: "revision-b",
    beforeLesson: { id: "lesson-a", microsequences: [] }
  };
  state = setCardAssistanceUndo(state, lessonUndo);
  assert.deepEqual(state.undo, normalizeCardAssistanceUndo(lessonUndo));
  assert.equal(state.undo.kind, "lesson");
  assert.equal(setCardAssistanceUndo(state, null).undo, null);
});

test("reversão rejeita contrato anterior em vez de manter fallback", () => {
  assert.throws(
    () => setCardAssistanceUndo({}, {
      contract: "aralearn.card-edit-undo.v1",
      kind: "microsequence",
      ...request(1).selection,
      expectedRevision: null,
      beforeMicrosequence: { id: "micro-a", cards: [] }
    }),
    /contrato atual/u
  );
});

test("sincronização guarda somente os caminhos correntes", () => {
  let state = markContextualAuthoringSyncPending({}, request(1).selection);
  state = markContextualAuthoringSyncPending(state, request(1).selection);
  assert.equal(state.contract, CARD_ASSISTANCE_LOCAL_STATE_CONTRACT);
  assert.deepEqual(state.sync.pendingPaths, [{
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a"
  }]);
  assert.deepEqual(clearContextualAuthoringSync(state).sync, {
    pendingPaths: [],
    expectedRevision: null
  });
});

test("estado anterior não é reaproveitado como fallback", () => {
  const normalized = normalizeCardAssistanceLocalState({
    contract: "aralearn.card-assistance-local-state.v3",
    sync: { pendingPaths: [request(1).selection] }
  });
  assert.equal(normalized.contract, CARD_ASSISTANCE_LOCAL_STATE_CONTRACT);
  assert.deepEqual(normalized.sync, { pendingPaths: [], expectedRevision: null });
});

test("caminhos pendentes nunca são truncados silenciosamente", () => {
  let state = normalizeCardAssistanceLocalState({});
  for (let index = 0; index < CARD_ASSISTANCE_SYNC_MAX_PATHS; index += 1) {
    state = markContextualAuthoringSyncPending(state, {
      ...request(1).selection,
      microsequenceKey: `micro-${index}`
    });
  }
  assert.equal(state.sync.pendingPaths.length, CARD_ASSISTANCE_SYNC_MAX_PATHS);
  assert.throws(
    () => markContextualAuthoringSyncPending(state, {
      ...request(1).selection,
      microsequenceKey: "micro-overflow"
    }),
    (error) => error?.code === "card_assistance_sync_scope_too_large"
  );
  assert.equal(state.sync.pendingPaths.length, CARD_ASSISTANCE_SYNC_MAX_PATHS);
});

test("estado persistido acima do limite é rejeitado em vez de recortado", () => {
  assert.throws(
    () => normalizeCardAssistanceLocalState({
      contract: CARD_ASSISTANCE_LOCAL_STATE_CONTRACT,
      undo: null,
      sync: {
        pendingPaths: Array.from(
          { length: CARD_ASSISTANCE_SYNC_MAX_PATHS + 1 },
          (_, index) => ({
            ...request(1).selection,
            microsequenceKey: `micro-${index}`
          })
        )
      }
    }),
    (error) => error?.code === "card_assistance_sync_scope_too_large"
  );
});
