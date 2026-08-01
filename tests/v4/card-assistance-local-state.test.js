import test from "node:test";
import assert from "node:assert/strict";

import {
  CARD_ASSISTANCE_QUEUE_MAX_ITEMS,
  enqueueCardAssistanceRequest,
  normalizeCardAssistanceLocalState,
  removeQueuedCardAssistanceRequest,
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

test("fila offline é compacta, limitada e idempotente por requestId", () => {
  let state = normalizeCardAssistanceLocalState({});
  for (let index = 0; index < CARD_ASSISTANCE_QUEUE_MAX_ITEMS + 3; index += 1) {
    state = enqueueCardAssistanceRequest(state, request(index));
  }
  assert.equal(state.queue.length, CARD_ASSISTANCE_QUEUE_MAX_ITEMS);
  assert.equal(state.queue[0].requestId, "request-3");

  state = enqueueCardAssistanceRequest(state, {
    ...request(5),
    promptText: "Versão única do mesmo pedido."
  });
  assert.equal(state.queue.filter((item) => item.requestId === "request-5").length, 1);
  assert.equal(state.queue.at(-1).promptText, "Versão única do mesmo pedido.");
});

test("remoção e reversão usam um único registro sobrescrito", () => {
  let state = enqueueCardAssistanceRequest({}, request(1));
  const undo = {
    contract: "aralearn.card-edit-undo.v1",
    courseKey: "course-a",
    microsequenceKey: "micro-a",
    expectedRevision: "revision-a",
    beforeMicrosequence: { id: "micro-a", cards: [] }
  };
  state = setCardAssistanceUndo(state, undo);
  assert.deepEqual(state.undo, undo);
  state = removeQueuedCardAssistanceRequest(state, "request-1");
  assert.deepEqual(state.queue, []);
  assert.deepEqual(state.undo, undo);
  assert.equal(setCardAssistanceUndo(state, null).undo, null);
});

test("fila rejeita payload sem contexto e não armazena anexos", () => {
  assert.throws(
    () => enqueueCardAssistanceRequest({}, {
      ...request(1),
      selection: { courseKey: "course-a" }
    }),
    /contexto válido/u
  );
  const state = enqueueCardAssistanceRequest({}, {
    ...request(1),
    attachments: [{ name: "não-deve-persistir.pdf", bytes: "x" }]
  });
  assert.equal(Object.hasOwn(state.queue[0], "attachments"), false);
});
