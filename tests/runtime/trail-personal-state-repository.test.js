import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  TrailPersonalStateRepository,
  createEmptyTrailPersonalState,
  validateTrailPersonalState
} from "../../src/persistence/TrailPersonalStateRepository.js";
import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { RemoteCourseCatalog } from "../../src/supabase/RemoteCourseCatalog.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const TRAIL_ITEM_ID = "20000000-0000-4000-8000-000000000002";
const SECOND_TRAIL_ITEM_ID = "20000000-0000-4000-8000-000000000003";

function uuid(index) {
  return `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function course() {
  return {
    id: "course/a",
    title: "Curso",
    modules: [{
      id: "module-a",
      title: "Módulo",
      lessons: [{
        id: "lesson-a",
        title: "Lição",
        microsequences: [{
          id: "micro-a",
          cards: [
            { id: "card-a", title: "Card A" },
            { id: "card-b", title: "Card B" }
          ]
        }]
      }]
    }]
  };
}

const CARD_A = Object.freeze({
  courseKey: "course/a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a"
});

const CARD_B = Object.freeze({ ...CARD_A, cardKey: "card-b" });

class MemorySyncState {
  constructor() {
    this.rows = new Map();
  }

  async getSyncState(key) {
    return this.rows.has(key) ? structuredClone(this.rows.get(key)) : null;
  }

  async putSyncState(key, value) {
    if (value === null || value === undefined) this.rows.delete(key);
    else this.rows.set(key, structuredClone(value));
    return value;
  }
}

function remoteFixture({ load = async () => null, mutate } = {}) {
  const calls = { load: [], mutate: [] };
  return {
    calls,
    async requireAuthenticatedUserId() {
      return USER_ID;
    },
    async loadTrailPersonalState(trailItemId) {
      calls.load.push(trailItemId);
      return load(trailItemId, calls.load.length);
    },
    async mutateTrailPersonalState(input) {
      calls.mutate.push(structuredClone(input));
      if (mutate) return mutate(input, calls.mutate.length);
      return {
        trailItemId: input.trailItemId,
        revision: input.expectedRevision + 1,
        updatedAt: "2026-08-07T12:00:00.000Z",
        idempotent: false
      };
    }
  };
}

function repository(
  remote,
  store = new MemorySyncState(),
  courseValue = course(),
  trailItemId = TRAIL_ITEM_ID
) {
  let mutation = 0;
  let tick = 0;
  return {
    store,
    value: new TrailPersonalStateRepository({
      trailItemId,
      remoteCatalog: remote,
      store,
      course: courseValue,
      uuidFactory: () => uuid(++mutation),
      clock: () => new Date(Date.UTC(2026, 7, 7, 10, 0, tick++))
    })
  };
}

test("contrato pessoal é fechado e usa identidades estáveis de lição e card", () => {
  const state = createEmptyTrailPersonalState();
  state.progress.lessons[CARD_A.lessonKey] = {
    cursorCardId: "card-a",
    completedCardIds: ["card-a"]
  };
  state.reviewMarks[CARD_A.cardKey] = "2026-08-07T10:01:00+00:00";
  state.observations[CARD_A.cardKey] = {
    category: "question",
    body: "Onde aplicar?",
    updatedAt: "2026-08-07T10:02:00Z"
  };
  const normalized = validateTrailPersonalState(state);
  assert.equal(normalized.progress.version, 3);
  assert.deepEqual(normalized.progress.lessons[CARD_A.lessonKey], {
    cursorCardId: "card-a",
    completedCardIds: ["card-a"]
  });
  assert.equal(normalized.reviewMarks[CARD_A.cardKey], "2026-08-07T10:01:00.000Z");

  assert.throws(
    () => validateTrailPersonalState({ ...state, selectionId: uuid(90) }),
    /não pertence ao contrato/u
  );
  assert.throws(
    () => validateTrailPersonalState({
      ...state,
      observations: {
        [CARD_A.cardKey]: {
          category: "other",
          body: "Texto",
          updatedAt: "2026-08-07T10:00:00Z"
        }
      }
    }),
    /tipo válido/u
  );
});

test("estado pessoal rejeita cursor fora dos concluídos e card em duas lições", () => {
  const cursorOutsideCompleted = createEmptyTrailPersonalState();
  cursorOutsideCompleted.progress.lessons["lesson-a"] = {
    cursorCardId: "card-b",
    completedCardIds: ["card-a"]
  };
  assert.throws(
    () => validateTrailPersonalState(cursorOutsideCompleted),
    /cursorCardId deve pertencer a completedCardIds/u
  );

  const cardInTwoLessons = createEmptyTrailPersonalState();
  cardInTwoLessons.progress.lessons["lesson-a"] = {
    cursorCardId: "card-a",
    completedCardIds: ["card-a"]
  };
  cardInTwoLessons.progress.lessons["lesson-b"] = {
    cursorCardId: "card-a",
    completedCardIds: ["card-a"]
  };
  assert.throws(
    () => validateTrailPersonalState(cardInTwoLessons),
    /repete o card "card-a" nas lições "lesson-a" e "lesson-b"/u
  );
});

test("RemoteCourseCatalog envia somente UUID, revisão, operações e mutationId aos RPCs", async () => {
  const calls = [];
  const catalog = Object.create(RemoteCourseCatalog.prototype);
  catalog.rpc = async (name, parameters) => {
    calls.push([name, structuredClone(parameters)]);
    return null;
  };
  const operations = [{
    kind: "set",
    collection: "reviewMarks",
    path: "course/module/lesson/micro/card",
    value: "2026-08-07T12:00:00.000Z"
  }];
  await catalog.loadTrailPersonalState(TRAIL_ITEM_ID);
  await catalog.mutateTrailPersonalState({
    trailItemId: TRAIL_ITEM_ID,
    expectedRevision: 0,
    operations,
    mutationId: uuid(1)
  });
  assert.deepEqual(calls, [
    ["load_trail_personal_state_v1", { p_trail_item_id: TRAIL_ITEM_ID }],
    ["mutate_trail_personal_state_v1", {
      p_trail_item_id: TRAIL_ITEM_ID,
      p_expected_revision: 0,
      p_operations: operations,
      p_mutation_id: uuid(1)
    }]
  ]);
  assert.throws(
    () => catalog.mutateTrailPersonalState({
      trailItemId: TRAIL_ITEM_ID,
      expectedRevision: -1,
      operations,
      mutationId: uuid(2)
    }),
    /Revisão inválida/u
  );
});

test("progresso, Rever e observação usam uma linha por trailItemId sem selectionId", async () => {
  const remote = remoteFixture();
  const { value, store } = repository(remote);
  await value.initialize();
  const progressSave = value.saveProgress({
    version: 1,
    lessons: {
      "course/a::module-a::lesson-a": {
        cursor: 1,
        completedCardKeys: ["card-a", "card-b"],
        updatedAt: "2026-08-07T11:00:00.000Z"
      }
    }
  });
  assert.deepEqual(value.loadProgress().lessons["course/a::module-a::lesson-a"], {
    cursor: 1,
    completedCardKeys: ["card-a", "card-b"]
  });
  await progressSave;
  assert.equal(value.isCardCompleted(CARD_A), true);

  await value.setCardReviewMark(CARD_A, true);
  assert.equal(value.isCardMarkedForReview(CARD_A), true);
  assert.equal(value.loadReviewItems()[0].title, "Card A");

  await value.saveCommentForPath(CARD_A, { category: "question", body: "  Onde aplicar? " });
  assert.equal(value.loadCommentForPath(CARD_A).body, "Onde aplicar?");
  assert.equal(value.loadPersonalObservationItems()[0].title, "Card A");

  assert.equal(store.rows.size, 1, "há um documento corrente no syncState");
  assert.equal(remote.calls.mutate.length, 3);
  assert.deepEqual(remote.calls.mutate.map((call) => call.operations[0].path), [
    CARD_A.lessonKey,
    CARD_A.cardKey,
    CARD_A.cardKey
  ]);
  remote.calls.mutate.forEach((call) => {
    assert.deepEqual(Object.keys(call).sort(), [
      "expectedRevision", "mutationId", "operations", "trailItemId"
    ]);
    assert.equal(Object.hasOwn(call, "state"), false);
    assert.equal(Object.hasOwn(call, "selectionId"), false);
  });
});

test("curso selection-only usa o mesmo estado sem workspaceId ou selectionId", async () => {
  const remote = remoteFixture();
  const { value } = repository(remote);
  await value.initialize();
  await value.setCardCompleted(CARD_A, true);
  await value.setCardReviewMark(CARD_B, true);
  assert.equal(value.isCardCompleted(CARD_A), true);
  assert.equal(value.isCardMarkedForReview(CARD_B), true);
  assert.deepEqual(remote.calls.load, [TRAIL_ITEM_ID]);
  assert.equal(remote.calls.mutate.every((call) =>
    call.trailItemId === TRAIL_ITEM_ID &&
    !Object.hasOwn(call, "workspaceId") &&
    !Object.hasOwn(call, "selectionId") &&
    !Object.hasOwn(call, "courseId")
  ), true);
});

test("progresso local fica durável sem aguardar a rede e sincroniza depois", async () => {
  const remote = remoteFixture();
  const { value, store } = repository(remote);
  await value.initialize();

  await value.saveProgressLocally({
    version: 1,
    lessons: {
      "course/a::module-a::lesson-a": {
        cursor: 0,
        completedCardKeys: ["card-a"],
        updatedAt: "2026-08-07T11:00:00.000Z"
      }
    }
  });

  assert.equal(remote.calls.mutate.length, 0);
  assert.deepEqual(value.loadProgress().lessons["course/a::module-a::lesson-a"], {
    cursor: 0,
    completedCardKeys: ["card-a"]
  });
  assert.deepEqual(store.rows.values().next().value.state.progress.lessons["lesson-a"], {
    cursorCardId: "card-a",
    completedCardIds: ["card-a"]
  });

  await value.flush();
  assert.equal(remote.calls.mutate.length, 1);
  assert.equal(value.snapshot().pending, false);
});

test("reordenar cards não transforma um card novo em concluído", async () => {
  const original = course();
  original.modules[0].lessons[0].microsequences[0].cards.push({
    id: "card-c",
    title: "Card C"
  });
  const remote = remoteFixture();
  const { value } = repository(remote, new MemorySyncState(), original);
  await value.initialize();
  await value.saveProgress({
    version: 1,
    lessons: {
      "course/a::module-a::lesson-a": {
        cursor: 2,
        completedCardKeys: ["card-a", "card-b", "card-c"]
      }
    }
  });

  const reordered = course();
  reordered.modules[0].lessons[0].microsequences[0].cards = [
    { id: "card-c", title: "Card C" },
    { id: "card-d", title: "Card D" },
    { id: "card-a", title: "Card A" },
    { id: "card-b", title: "Card B" }
  ];
  value.setCourse(reordered);

  assert.deepEqual(value.loadProgress().lessons["course/a::module-a::lesson-a"], {
    cursor: 0,
    completedCardKeys: ["card-c"]
  });
  assert.equal(value.isCardCompleted({ ...CARD_A, cardKey: "card-d" }), false);
  assert.equal(value.isCardCompleted({ ...CARD_A, cardKey: "card-a" }), true);
});

test("mover card e lição preserva progresso pelas identidades estáveis", async () => {
  const remote = remoteFixture();
  const { value } = repository(remote);
  await value.initialize();
  await value.saveProgress({
    version: 1,
    lessons: {
      "course/a::module-a::lesson-a": {
        cursor: 1,
        completedCardKeys: ["card-a", "card-b"]
      }
    }
  });

  const moved = course();
  const sourceLesson = moved.modules[0].lessons[0];
  const [cardA] = sourceLesson.microsequences[0].cards.splice(0, 1);
  moved.modules.push({
    id: "module-b",
    title: "Módulo B",
    lessons: [{
      id: "lesson-b",
      title: "Lição B",
      microsequences: [{ id: "micro-b", cards: [cardA] }]
    }]
  });
  value.setCourse(moved);

  assert.equal(value.isCardCompleted({
    ...CARD_A,
    moduleKey: "module-b",
    lessonKey: "lesson-b",
    microsequenceKey: "micro-b"
  }), true);
  assert.deepEqual(value.loadProgress().lessons, {
    "course/a::module-a::lesson-a": {
      cursor: 0,
      completedCardKeys: ["card-b"]
    },
    "course/a::module-b::lesson-b": {
      cursor: 0,
      completedCardKeys: ["card-a"]
    }
  });

  await value.saveProgress(value.loadProgress());
  assert.deepEqual(value.loadCanonicalState().progress.lessons, {
    "lesson-a": {
      cursorCardId: "card-b",
      completedCardIds: ["card-b"]
    },
    "lesson-b": {
      cursorCardId: "card-a",
      completedCardIds: ["card-a"]
    }
  });
});

test("cursos homônimos não compartilham estado entre trailItemIds", async () => {
  const store = new MemorySyncState();
  const first = repository(remoteFixture(), store, course(), TRAIL_ITEM_ID).value;
  const second = repository(remoteFixture(), store, course(), SECOND_TRAIL_ITEM_ID).value;
  await first.initialize();
  await first.setCardReviewMark(CARD_A, true);
  await second.initialize();

  assert.equal(first.isCardMarkedForReview(CARD_A), true);
  assert.equal(second.isCardMarkedForReview(CARD_A), false);
  assert.equal(store.rows.size, 2);
});

test("metadados de resposta da thread são somente leitura no cliente", async () => {
  const path = CARD_A.cardKey;
  const state = createEmptyTrailPersonalState();
  state.observations[path] = {
    category: "question",
    body: "Onde aplicar?",
    updatedAt: "2026-08-07T10:02:00Z",
    commentId: uuid(81),
    status: "resolved",
    response: "Aplique depois da comparação.",
    resolutionNote: "Exemplo incluído.",
    respondedAt: "2026-08-07T10:03:00Z",
    resolvedAt: "2026-08-07T10:04:00Z",
    correction: {
      requestId: "repair:card-a:20260807",
      entityPath: ["course/a", "module-a", "lesson-a", "micro-a", "card-a"],
      linkedAt: "2026-08-07T10:04:00Z"
    }
  };
  const remote = remoteFixture({
    load: async () => ({
      trailItemId: TRAIL_ITEM_ID,
      revision: 1,
      state,
      updatedAt: "2026-08-07T10:04:00Z"
    })
  });
  const { value } = repository(remote);
  await value.initialize();
  const comment = value.loadCommentForPath(CARD_A);
  assert.equal(comment.commentId, uuid(81));
  assert.equal(comment.status, "resolved");
  assert.equal(comment.response, "Aplique depois da comparação.");

  await value.saveCommentForPath(CARD_A, {
    category: "question",
    body: "Reformulei a pergunta."
  });
  const operation = remote.calls.mutate[0].operations[0];
  assert.deepEqual(Object.keys(operation.value).sort(), ["body", "category", "updatedAt"]);
  assert.equal(value.loadCommentForPath(CARD_A).status, "open");
});

test("falha de rede mantém fila compacta e flush reaproveita mutationId", async () => {
  let online = false;
  const remote = remoteFixture({
    mutate: async (input) => {
      if (!online) throw new TypeError("Failed to fetch");
      return {
        trailItemId: input.trailItemId,
        revision: 1,
        updatedAt: "2026-08-07T12:00:00Z",
        idempotent: false
      };
    }
  });
  const { value, store } = repository(remote);
  await value.initialize();
  const local = await value.setCardReviewMark(CARD_A, true);
  assert.equal(local.pending, true);
  assert.equal(remote.calls.mutate.length, 2, "retry imediato é limitado");
  assert.equal(remote.calls.mutate[0].mutationId, remote.calls.mutate[1].mutationId);
  assert.equal(store.rows.size, 1);

  online = true;
  const synchronized = await value.flush();
  assert.equal(synchronized.pending, false);
  assert.equal(remote.calls.mutate[2].mutationId, remote.calls.mutate[0].mutationId);
  assert.equal(value.isCardMarkedForReview(CARD_A), true);
});

test("resposta idempotente após perda de rede relê o estado sem reenviar documento", async () => {
  const path = CARD_A.cardKey;
  const serverState = createEmptyTrailPersonalState();
  serverState.reviewMarks[path] = "2026-08-07T10:00:00.000Z";
  const remote = remoteFixture({
    load: async (_id, callNumber) => callNumber === 1 ? null : {
      trailItemId: TRAIL_ITEM_ID,
      revision: 1,
      state: serverState,
      updatedAt: "2026-08-07T12:00:00.000Z"
    },
    mutate: async (input, callNumber) => {
      if (callNumber === 1) throw new TypeError("resposta perdida");
      return {
        trailItemId: input.trailItemId,
        revision: 1,
        updatedAt: "2026-08-07T12:00:00.000Z",
        idempotent: true
      };
    }
  });
  const { value } = repository(remote);
  await value.initialize();
  const saved = await value.setCardReviewMark(CARD_A, true);
  assert.equal(saved.pending, false);
  assert.equal(value.isCardMarkedForReview(CARD_A), true);
  assert.equal(remote.calls.mutate.length, 2);
  assert.equal(
    remote.calls.mutate[0].mutationId,
    remote.calls.mutate[1].mutationId
  );
  assert.deepEqual(
    remote.calls.mutate[0].operations,
    remote.calls.mutate[1].operations
  );
  assert.equal(remote.calls.mutate.every((call) => !Object.hasOwn(call, "state")), true);
  assert.equal(remote.calls.load.length, 2, "a confirmação idempotente relê o estado corrente");
});

test("alteração feita durante uma requisição recebe mutationId e lote próprios", async () => {
  let releaseFirst;
  let notifyFirst;
  const firstStarted = new Promise((resolve) => { notifyFirst = resolve; });
  const remote = remoteFixture({
    mutate: async (input, callNumber) => {
      if (callNumber === 1) {
        notifyFirst();
        await new Promise((resolve) => { releaseFirst = resolve; });
      }
      return {
        trailItemId: input.trailItemId,
        revision: input.expectedRevision + 1,
        updatedAt: "2026-08-07T12:00:00.000Z",
        idempotent: false
      };
    }
  });
  const { value } = repository(remote);
  await value.initialize();
  const first = value.setCardReviewMark(CARD_A, true);
  await firstStarted;
  const second = value.setCardReviewMark(CARD_B, true);
  releaseFirst();
  await Promise.all([first, second]);

  assert.equal(remote.calls.mutate.length, 2);
  assert.equal(remote.calls.mutate[0].operations.length, 1);
  assert.equal(remote.calls.mutate[1].operations.length, 1);
  assert.notEqual(
    remote.calls.mutate[0].mutationId,
    remote.calls.mutate[1].mutationId
  );
  assert.equal(remote.calls.mutate[1].expectedRevision, 1);
  assert.equal(value.isCardMarkedForReview(CARD_A), true);
  assert.equal(value.isCardMarkedForReview(CARD_B), true);
});

test("fila grande é particionada nos limites de quantidade e bytes", async () => {
  const remote = remoteFixture();
  const largeCourse = course();
  largeCourse.modules[0].lessons[0].microsequences[0].cards = Array.from(
    { length: 513 },
    (_, index) => ({ id: `c${index}`, title: `Card ${index}` })
  );
  const { value } = repository(remote, new MemorySyncState(), largeCourse);
  await value.initialize();
  await Promise.all(largeCourse.modules[0].lessons[0].microsequences[0].cards.map((card) =>
    value.setCardReviewMark({ ...CARD_A, cardKey: card.id }, true)
  ));
  assert.equal(remote.calls.mutate.length, 2);
  assert.equal(
    remote.calls.mutate.reduce((sum, call) => sum + call.operations.length, 0),
    513
  );
  remote.calls.mutate.forEach((call) => {
    assert.equal(call.operations.length <= 512, true);
    assert.equal(
      new TextEncoder().encode(JSON.stringify(call.operations)).byteLength <= 65_536,
      true
    );
  });
  assert.equal(remote.calls.mutate[0].expectedRevision, 0);
  assert.equal(remote.calls.mutate[1].expectedRevision, 1);
  assert.notEqual(
    remote.calls.mutate[0].mutationId,
    remote.calls.mutate[1].mutationId
  );
  assert.equal(value.snapshot().pending, false);
});

test("IndexedDB persiste somente o registro corrente do item entre reinicializações", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId: USER_ID });
  context.after(() => store.close());
  let online = false;
  const remote = remoteFixture({
    mutate: async (input) => {
      if (!online) throw new TypeError("offline");
      return {
        trailItemId: input.trailItemId,
        revision: 1,
        updatedAt: "2026-08-07T12:00:00Z",
        idempotent: false
      };
    }
  });
  const first = repository(remote, store).value;
  await first.initialize();
  await first.setCardReviewMark(CARD_A, true);
  assert.equal((await store.getAll("syncState")).filter((row) =>
    String(row.id).startsWith("trail.personalState:")
  ).length, 1);

  online = true;
  const second = repository(remote, store).value;
  await second.initialize();
  assert.equal(second.isCardMarkedForReview(CARD_A), true);
  assert.equal(second.snapshot().pending, false);
  assert.equal((await store.getAll("syncState")).filter((row) =>
    String(row.id).startsWith("trail.personalState:")
  ).length, 1);
});

test("CAS relê, preserva estado remoto concorrente e reaplica apenas o patch local", async () => {
  const observationPath = CARD_B.cardKey;
  const concurrent = createEmptyTrailPersonalState();
  concurrent.observations[observationPath] = {
    category: "suggestion",
    body: "Acrescente um exemplo.",
    updatedAt: "2026-08-07T11:30:00Z"
  };
  const initialEnvelope = {
    trailItemId: TRAIL_ITEM_ID,
    revision: 1,
    state: createEmptyTrailPersonalState(),
    updatedAt: "2026-08-07T11:00:00Z"
  };
  const concurrentEnvelope = {
    trailItemId: TRAIL_ITEM_ID,
    revision: 2,
    state: concurrent,
    updatedAt: "2026-08-07T11:30:00Z"
  };
  const remote = remoteFixture({
    load: async (_id, callNumber) => callNumber === 1 ? initialEnvelope : concurrentEnvelope,
    mutate: async (input, callNumber) => {
      if (callNumber === 1) {
        const error = new Error("revisão divergente");
        error.code = "40001";
        throw error;
      }
      return {
        trailItemId: input.trailItemId,
        revision: 3,
        updatedAt: "2026-08-07T12:00:00Z",
        idempotent: false
      };
    }
  });
  const { value } = repository(remote);
  await value.initialize();
  await value.setCardReviewMark(CARD_A, true);
  assert.equal(remote.calls.mutate[0].expectedRevision, 1);
  assert.equal(remote.calls.mutate[1].expectedRevision, 2);
  assert.notEqual(remote.calls.mutate[0].mutationId, remote.calls.mutate[1].mutationId);
  assert.equal(value.loadCommentForPath(CARD_B).body, "Acrescente um exemplo.");
  assert.equal(value.isCardMarkedForReview(CARD_A), true);
  assert.equal(value.snapshot().revision, 3);
});

test("CAS encerra a pendência quando o estado remoto já contém a alteração", async () => {
  let attemptedValue = null;
  const remote = remoteFixture({
    load: async (_id, callNumber) => {
      if (callNumber === 1) return null;
      const concurrent = createEmptyTrailPersonalState();
      concurrent.reviewMarks[CARD_A.cardKey] = attemptedValue;
      return {
        trailItemId: TRAIL_ITEM_ID,
        revision: 1,
        state: concurrent,
        updatedAt: "2026-08-07T12:00:00.000Z"
      };
    },
    mutate: async (input) => {
      attemptedValue = input.operations[0].value;
      const error = new Error("revisão divergente");
      error.code = "40001";
      throw error;
    }
  });
  const { value } = repository(remote);
  await value.initialize();
  const saved = await value.setCardReviewMark(CARD_A, true);
  assert.equal(saved.pending, false);
  assert.equal(saved.revision, 1);
  assert.equal(value.isCardMarkedForReview(CARD_A), true);
  assert.equal(remote.calls.mutate.length, 1);
});

test("perda de autoridade apaga o cache do item e falha fechada", async () => {
  const remote = remoteFixture({
    mutate: async () => {
      const error = new Error("Item inacessível");
      error.status = 403;
      error.code = "42501";
      throw error;
    }
  });
  const { value, store } = repository(remote);
  await value.initialize();
  await assert.rejects(() => value.setCardReviewMark(CARD_A, true), /inacessível/u);
  assert.equal(store.rows.size, 0);
  assert.throws(() => value.snapshot(), /Inicialize/u);
});
