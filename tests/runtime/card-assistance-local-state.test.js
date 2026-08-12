import test from "node:test";
import assert from "node:assert/strict";

import {
  CARD_ASSISTANCE_LOCAL_STATE_CONTRACT,
  CARD_ASSISTANCE_SYNC_MAX_PATHS,
  CARD_ASSISTANCE_UNDO_CONTRACT,
  applyContextualAuthoringInversePatch,
  clearContextualAuthoringSync,
  createContextualAuthoringInversePatch,
  markContextualAuthoringMetadataPending,
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
  const beforeMicrosequence = { id: "micro-a", title: "Antes", cards: [] };
  const afterMicrosequence = { id: "micro-a", title: "Depois", cards: [] };
  const cardUndo = {
    contract: CARD_ASSISTANCE_UNDO_CONTRACT,
    kind: "microsequence",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    expectedRevision: "revision-a",
    affectedMicrosequenceIds: ["micro-a"],
    inversePatch: createContextualAuthoringInversePatch(
      beforeMicrosequence,
      afterMicrosequence
    )
  };
  state = setCardAssistanceUndo(state, cardUndo);
  assert.deepEqual(state.undo, normalizeCardAssistanceUndo(cardUndo));
  assert.deepEqual(
    applyContextualAuthoringInversePatch(afterMicrosequence, state.undo.inversePatch),
    beforeMicrosequence
  );
  const beforeLesson = { id: "lesson-a", microsequences: [beforeMicrosequence] };
  const afterLesson = { id: "lesson-a", microsequences: [afterMicrosequence] };
  const lessonUndo = {
    contract: CARD_ASSISTANCE_UNDO_CONTRACT,
    kind: "lesson",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    expectedRevision: "revision-b",
    affectedMicrosequenceIds: ["micro-a"],
    inversePatch: createContextualAuthoringInversePatch(beforeLesson, afterLesson)
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
      affectedMicrosequenceIds: ["micro-a"],
      inversePatch: { type: "replace", value: { id: "micro-a", cards: [] } }
    }),
    /contrato atual/u
  );
});

test("reversão inversa restaura inclusão, remoção, ordem e conteúdo sem copiar a coleção", () => {
  const largeText = "conteúdo extenso ".repeat(500);
  const before = {
    id: "lesson-a",
    microsequences: Array.from({ length: 100 }, (_, index) => ({
      id: `micro-${index}`,
      title: `Microssequência ${index}`,
      cards: [{ id: `card-${index}`, text: `${largeText}${index}` }]
    }))
  };
  const after = structuredClone(before);
  after.microsequences[51].cards[0].text = "Conteúdo corrigido.";
  const [moved] = after.microsequences.splice(51, 1);
  after.microsequences.splice(2, 0, moved);

  const inversePatch = createContextualAuthoringInversePatch(before, after);
  assert.deepEqual(applyContextualAuthoringInversePatch(after, inversePatch), before);
  assert.ok(
    JSON.stringify(inversePatch).length < 15_000,
    "uma edição pontual não deve duplicar a lição inteira"
  );
});

test("reversão de ordem preserva entidades remotas desconhecidas", () => {
  const before = {
    id: "lesson-a",
    microsequences: [
      { id: "a", title: "A" },
      { id: "b", title: "B" }
    ]
  };
  const after = {
    id: "lesson-a",
    microsequences: [
      { id: "b", title: "B" },
      { id: "a", title: "A alterada" }
    ]
  };
  const current = {
    id: "lesson-a",
    microsequences: [
      { id: "b", title: "B" },
      { id: "a", title: "A alterada" },
      { id: "c", title: "C criada remotamente" }
    ]
  };

  const inversePatch = createContextualAuthoringInversePatch(before, after);
  const restored = applyContextualAuthoringInversePatch(current, inversePatch);

  assert.deepEqual(restored, {
    id: "lesson-a",
    microsequences: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C criada remotamente" }
    ]
  });
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
    pendingMetadata: [],
    expectedRevision: null
  });
});

test("estado anterior não é reaproveitado como fallback", () => {
  const normalized = normalizeCardAssistanceLocalState({
    contract: "aralearn.card-assistance-local-state.v3",
    sync: { pendingPaths: [request(1).selection] }
  });
  assert.equal(normalized.contract, CARD_ASSISTANCE_LOCAL_STATE_CONTRACT);
  assert.deepEqual(normalized.sync, {
    pendingPaths: [],
    pendingMetadata: [],
    expectedRevision: null
  });
});

test("metadado textual pendente preserva a primeira base e a redação mais recente", () => {
  let state = markContextualAuthoringMetadataPending({}, {
    entityType: "lesson",
    entityPath: ["course-a", "module-a", "lesson-a"],
    baseMetadata: { title: "Antes", goal: "Objetivo" },
    metadata: { title: "Primeira", goal: "Objetivo" }
  });
  state = markContextualAuthoringMetadataPending(state, {
    entityType: "lesson",
    entityPath: ["course-a", "module-a", "lesson-a"],
    baseMetadata: { title: "Primeira", goal: "Objetivo" },
    metadata: { title: "Final", goal: "Objetivo" }
  });
  assert.deepEqual(state.sync.pendingMetadata, [{
    entityType: "lesson",
    entityPath: ["course-a", "module-a", "lesson-a"],
    baseMetadata: { title: "Antes", goal: "Objetivo" },
    metadata: { title: "Final", goal: "Objetivo" }
  }]);
  assert.throws(
    () => markContextualAuthoringMetadataPending(state, {
      entityType: "lesson",
      entityPath: ["course-a", "module-a", "lesson-a"],
      baseMetadata: { title: "Antes", goal: "Objetivo" },
      metadata: { title: "Final", goal: "Objetivo", lessons: [] }
    }),
    /alvo sincronizável/u
  );
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
