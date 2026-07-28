import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { ProjectDocumentAssembler } from "../../src/persistence/ProjectDocumentAssembler.js";
import { prepareFixture } from "../../scripts/publishCatalogFixtures.mjs";
import {
  minimalProjectFixture,
  officialGraphFromDocument
} from "./helpers/leanRelationalFixture.js";
import {
  RelationalSyncEngine,
  SupabaseSyncTransport,
  SYNC_FAILURE_KIND,
  classifySyncFailure
} from "../../src/sync/RelationalSyncEngine.js";
import { deterministicUuid } from "../../src/persistence/deterministicUuid.js";
import { canonicalRevisionHash } from "../../src/storage/canonicalRevision.js";

const USER_ID = "30000000-0000-4000-8000-000000000003";
const DEVICE_ID = "40000000-0000-4000-8000-000000000004";
const COURSE_ID = "50000000-0000-4000-8000-000000000005";
const SELECTION_ID = "60000000-0000-4000-8000-000000000006";
const LESSON_ID = "70000000-0000-4000-8000-000000000007";
const PROGRESS_ID = "80000000-0000-4000-8000-000000000008";

function uuid(suffix) {
  return `90000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function selection({ publicationSeq = 1, contentHash = "hash-1" } = {}) {
  return {
    id: SELECTION_ID,
    userId: USER_ID,
    courseId: COURSE_ID,
    publicationSeq,
    contentHash,
    selectedAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    deletedAt: null
  };
}

function lessonProgress({ cursor = 0, updatedAt = "2026-07-19T12:00:00.000Z" } = {}) {
  return {
    id: PROGRESS_ID,
    userId: USER_ID,
    selectionId: SELECTION_ID,
    courseId: COURSE_ID,
    lessonId: LESSON_ID,
    cursor,
    firstViewedAt: "2026-07-19T12:00:00.000Z",
    completedAt: null,
    lastActivityAt: updatedAt,
    updatedAt,
    deletedAt: null
  };
}

function mutation({
  mutationId = uuid(1),
  entityType = "lessonProgress",
  entityId = PROGRESS_ID,
  payload = { cursor: 0 },
  attemptCount = 0
} = {}) {
  return {
    mutationId,
    sequence: 1,
    courseId: COURSE_ID,
    entityType,
    entityId,
    operation: "upsert",
    changedFields: Object.keys(payload).filter((key) => key !== "id"),
    payload,
    previousRow: null,
    status: "pending",
    attemptCount,
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z"
  };
}

function officialGraph({ title = "Curso", moduleId = uuid(10), publicationSeq = 1, contentHash = "hash-1" } = {}) {
  const document = structuredClone(minimalProjectFixture);
  document.courses[0].title = title;
  const identityMap = new Map([
    ["project", uuid(9)],
    ["course:course-fixture-minimal", COURSE_ID],
    ["course:course-fixture-minimal/module:module-fixture-minimal", moduleId],
    ["course:course-fixture-minimal/module:module-fixture-minimal/lesson:lesson-fixture-minimal", LESSON_ID]
  ]);
  const graph = officialGraphFromDocument(document, { identityMap });
  graph.courses[0] = {
    ...graph.courses[0],
    status: "published",
    publicationSeq,
    contentHash
  };
  return {
    courseId: COURSE_ID,
    publicationSeq,
    contentHash,
    graph
  };
}

async function immutableRevision({ title = null, removeFirstCard = false } = {}) {
  const document = structuredClone(minimalProjectFixture);
  if (title != null) document.courses[0].title = title;
  if (removeFirstCard) {
    document.courses[0].modules[0].lessons[0].microsequences[0].cards.shift();
  }
  return {
    document,
    contentHash: await canonicalRevisionHash(document)
  };
}

function emptyBootstrap({ highWaterSequence = 0, rows = {}, selectedCourses = [] } = {}) {
  return {
    snapshot: rows,
    selectedCourses,
    highWaterSequence
  };
}

function baseTransport(overrides = {}) {
  return {
    async applySyncBatch({ mutations }) {
      return { results: mutations.map(({ mutationId }) => ({ mutationId, status: "applied" })) };
    },
    async bootstrapReplica() {
      return emptyBootstrap();
    },
    async pullSyncChanges({ afterSequence }) {
      return { changes: [], nextCursor: afterSequence, hasMore: false };
    },
    async downloadCourseRevision() {
      throw new Error("Nenhum curso deveria ser baixado.");
    },
    ...overrides
  };
}

async function createStore(indexedDb = new IDBFactory(), userId = USER_ID) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId });
  await store.bindReplicaToUser(userId);
  return store;
}

async function markBootstrapped(store, cursor = 0, deviceId = DEVICE_ID) {
  await store.putSyncState(`sync.bootstrap:${deviceId}`, true);
  await store.put("syncState", {
    id: `sync.cursor:${deviceId}`,
    key: `sync.cursor:${deviceId}`,
    deviceId,
    cursor,
    updatedAt: "2026-07-19T12:00:00.000Z"
  });
}

test("a classificação separa autenticação, autorização, rejeição e falha transitória", () => {
  assert.equal(classifySyncFailure(Object.assign(new Error("JWT expired"), { status: 401 })).kind,
    SYNC_FAILURE_KIND.AUTH_REQUIRED);
  assert.equal(classifySyncFailure(Object.assign(new Error("sessão ausente"), { code: "NO_SESSION" })).kind,
    SYNC_FAILURE_KIND.AUTH_REQUIRED);
  assert.equal(classifySyncFailure(Object.assign(new Error("proibido"), { status: 403, code: "42501" })).kind,
    SYNC_FAILURE_KIND.REJECTED);
  assert.equal(classifySyncFailure(Object.assign(new Error("estrutura inválida"), { status: 400, code: "23514" })).kind,
    SYNC_FAILURE_KIND.REJECTED);
  assert.equal(classifySyncFailure(Object.assign(new Error("indisponível"), { status: 503 })).kind,
    SYNC_FAILURE_KIND.RETRYABLE);
  assert.equal(classifySyncFailure(Object.assign(new Error("timeout"), { code: "57014" })).kind,
    SYNC_FAILURE_KIND.RETRYABLE);
  assert.equal(classifySyncFailure(Object.assign(new Error("limite temporário"), { status: 429 })).kind,
    SYNC_FAILURE_KIND.RETRYABLE);
  assert.equal(classifySyncFailure(new TypeError("Failed to fetch")).kind,
    SYNC_FAILURE_KIND.RETRYABLE);
  assert.equal(classifySyncFailure(Object.assign(new Error("operação interrompida"), { name: "AbortError" })).kind,
    SYNC_FAILURE_KIND.RETRYABLE);
  assert.equal(classifySyncFailure(new TypeError("payload incompatível")).kind,
    SYNC_FAILURE_KIND.REJECTED);
});

for (const scenario of [
  { label: "HTTP 429", error: Object.assign(new Error("limite temporário"), { status: 429 }) },
  { label: "falha de rede", error: new TypeError("Failed to fetch") },
  { label: "AbortError", error: Object.assign(new Error("operação interrompida"), { name: "AbortError" }) }
]) {
  test(`${scenario.label} preserva a outbox e ainda permite pull`, async (context) => {
    const store = await createStore();
    context.after(() => store.close());
    await markBootstrapped(store);
    const entry = mutation();
    await store.put("outbox", entry);
    let pulls = 0;
    const engine = new RelationalSyncEngine({
      store,
      deviceId: DEVICE_ID,
      transport: baseTransport({
        async applySyncBatch() {
          throw scenario.error;
        },
        async pullSyncChanges({ afterSequence }) {
          pulls += 1;
          return { changes: [], nextCursor: afterSequence, hasMore: false };
        }
      })
    });

    const result = await engine.synchronize();
    const preserved = await store.get("outbox", entry.mutationId);
    assert.equal(result.pushed.retryable, true);
    assert.equal(preserved.status, "pending");
    assert.equal(preserved.attemptCount, 1);
    assert.deepEqual(preserved.payload, entry.payload);
    assert.equal(pulls, 1);
  });
}

test("401 no bootstrap preserva a réplica e devolve authRequired", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async bootstrapReplica() {
        throw Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" });
      }
    })
  });

  const result = await engine.synchronize();
  assert.equal(result.authRequired, true);
  assert.equal(result.bootstrap.status, SYNC_FAILURE_KIND.AUTH_REQUIRED);
  assert.equal(await store.getSyncState(`sync.bootstrap:${DEVICE_ID}`), null);
});

test("401 no pull não avança o cursor e devolve authRequired", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  await markBootstrapped(store, 37);
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async pullSyncChanges() {
        throw Object.assign(new Error("sessão expirada"), { status: 401, code: "AUTH_REQUIRED" });
      }
    })
  });

  const result = await engine.synchronize();
  assert.equal(result.authRequired, true);
  assert.equal(result.pulled.status, SYNC_FAILURE_KIND.AUTH_REQUIRED);
  assert.equal(await engine.currentCursor(), 37);
});

test("401 ao baixar curso não substitui o cache e devolve authRequired", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  await markBootstrapped(store);
  await store.put("courseSelections", selection({ contentHash: "a".repeat(64) }));
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async downloadCourseRevision() {
        throw Object.assign(new Error("JWT inválido"), { status: 401, code: "INVALID_JWT" });
      }
    })
  });

  const result = await engine.synchronize();
  assert.equal(result.authRequired, true);
  assert.equal(result.updatedCourses, 0);
  assert.equal(await store.get("courses", COURSE_ID), undefined);
  assert.equal((await store.get("courseSelections", SELECTION_ID)).deletedAt, null);
});

test("SupabaseSyncTransport envia patches pessoais e autorais granulares sem baseRevision", async () => {
  const calls = [];
  const transport = new SupabaseSyncTransport({
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { status: "applied" };
    }
  });
  const entry = mutation({ payload: { cursor: 2 } });
  await transport.applySyncBatch({ deviceId: DEVICE_ID, mutations: [entry] });

  assert.equal(calls[0].name, "apply_sync_batch");
  assert.deepEqual(calls[0].payload.p_mutations, [{
    mutationId: entry.mutationId,
    sequence: entry.sequence,
    courseId: COURSE_ID,
    entityType: "lessonProgress",
    entityId: PROGRESS_ID,
    operation: "upsert",
    changedFields: ["cursor"],
    payload: { cursor: 2 }
  }]);
  assert.ok(!Object.hasOwn(calls[0].payload.p_mutations[0], "baseRevision"));
  const cardPatch = mutation({
    mutationId: uuid(2),
    entityType: "cards",
    entityId: uuid(3),
    payload: { title: "Título corrigido" }
  });
  await transport.applySyncBatch({ deviceId: DEVICE_ID, mutations: [cardPatch] });
  assert.deepEqual(calls[1].payload.p_mutations[0], {
    mutationId: cardPatch.mutationId,
    sequence: cardPatch.sequence,
    courseId: COURSE_ID,
    entityType: "cards",
    entityId: cardPatch.entityId,
    operation: "upsert",
    changedFields: ["title"],
    payload: { title: "Título corrigido" }
  });
  assert.throws(
    () => transport.applySyncBatch({
      deviceId: DEVICE_ID,
      mutations: [mutation({ entityType: "internalSecrets", entityId: uuid(4) })]
    }),
    /outbox não aceita/u
  );
});

test("push idempotente confirma duplicate e remove a mutação uma única vez", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const entry = mutation();
  await store.put("outbox", entry);
  let calls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async applySyncBatch({ mutations }) {
        calls += 1;
        assert.deepEqual(mutations, [entry]);
        return { results: [{ mutationId: entry.mutationId, status: "duplicate" }] };
      }
    })
  });

  assert.deepEqual(await engine.push(), { accepted: 1, rejected: 0 });
  assert.equal(await store.get("outbox", entry.mutationId), undefined);
  assert.deepEqual(await engine.push(), { accepted: 0, rejected: 0 });
  assert.equal(calls, 1);
});

test("inicialização não reenvia automaticamente uma mutação definitivamente rejeitada", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const rejectedMutationId = uuid(71);
  await store.put("outbox", {
    mutationId: rejectedMutationId,
    sequence: 7,
    courseId: null,
    entityType: "studyPaths",
    entityId: uuid(72),
    operation: "update",
    changedFields: ["ownerId", "title"],
    payload: { ownerId: USER_ID, title: "SENAI" },
    previousRow: null,
    status: "rejected",
    attemptCount: 1,
    lastError: "changedFields de update contém campo imutável.",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:01:00.000Z"
  });
  let calls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async applySyncBatch({ mutations }) {
        calls += 1;
        return { results: mutations.map((entry) => ({ mutationId: entry.mutationId, status: "applied" })) };
      }
    })
  });

  await engine.initialize();
  const preserved = await store.get("outbox", rejectedMutationId);
  assert.equal(preserved.status, "rejected");
  assert.deepEqual(preserved.changedFields, ["ownerId", "title"]);
  assert.deepEqual(preserved.payload, { ownerId: USER_ID, title: "SENAI" });

  assert.deepEqual(await engine.push(), { accepted: 0, rejected: 0 });
  assert.equal(calls, 0);
});

test("401 preserva status, payload e attemptCount e o mesmo item segue após novo login", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const entry = mutation({ payload: { cursor: 5 }, attemptCount: 2 });
  await store.put("outbox", entry);
  let authenticated = false;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async applySyncBatch({ mutations }) {
        assert.deepEqual(mutations[0].payload, { cursor: 5 });
        if (!authenticated) throw Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" });
        return { results: [{ mutationId: entry.mutationId, status: "applied" }] };
      }
    })
  });

  const first = await engine.synchronize();
  const preserved = await store.get("outbox", entry.mutationId);
  assert.equal(first.authRequired, true);
  assert.equal(preserved.status, "pending");
  assert.equal(preserved.attemptCount, 2);
  assert.deepEqual(preserved.payload, { cursor: 5 });

  authenticated = true;
  const second = await engine.synchronize();
  assert.equal(second.authRequired, undefined);
  assert.equal(second.pushed.accepted, 1);
  assert.equal(await store.get("outbox", entry.mutationId), undefined);
});

test("403 é rejeição definitiva e não volta para a fila automática", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const entry = mutation();
  await store.put("outbox", entry);
  let pushes = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async applySyncBatch() {
        pushes += 1;
        throw Object.assign(new Error("permissão revogada"), { status: 403, code: "42501" });
      }
    })
  });

  const first = await engine.synchronize();
  assert.equal(first.pushed.rejected, 1);
  const rejected = await store.get("outbox", entry.mutationId);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.attemptCount, 1);
  assert.equal(rejected.rejectionReason, "authorization_denied");
  await engine.synchronize();
  assert.equal(pushes, 1);
});

test("5xx mantém pending, incrementa tentativa e não impede pull seguro", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  await markBootstrapped(store);
  const entry = mutation();
  await store.put("outbox", entry);
  let pulls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async applySyncBatch() {
        throw Object.assign(new Error("indisponível"), { status: 503 });
      },
      async pullSyncChanges() {
        pulls += 1;
        return { changes: [], nextCursor: 17, hasMore: false };
      }
    })
  });

  const result = await engine.synchronize();
  assert.equal(result.pushed.retryable, true);
  assert.equal(result.pulled.cursor, 17);
  assert.equal(pulls, 1);
  const pending = await store.get("outbox", entry.mutationId);
  assert.equal(pending.status, "pending");
  assert.equal(pending.attemptCount, 1);
});

test("pull aplica uma página por vez, persiste o cursor e retoma após interrupção", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  await markBootstrapped(store);
  const requested = [];
  let interrupt = true;
  const transport = baseTransport({
    async pullSyncChanges({ afterSequence }) {
      requested.push(afterSequence);
      if (afterSequence === 0) {
        return {
          changes: [{
            table_name: "lesson_progress",
            entity_id: PROGRESS_ID,
            course_id: COURSE_ID,
            row: lessonProgress({ cursor: 0 })
          }],
          next_cursor: 10,
          has_more: true
        };
      }
      assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 10);
      if (interrupt) throw Object.assign(new Error("rede caiu"), { status: 503 });
      return {
        changes: [{
          table_name: "lesson_progress",
          entity_id: PROGRESS_ID,
          course_id: COURSE_ID,
          row: lessonProgress({ cursor: 1, updatedAt: "2026-07-19T13:00:00.000Z" })
        }],
        next_cursor: 20,
        has_more: false
      };
    }
  });
  const engine = new RelationalSyncEngine({ store, deviceId: DEVICE_ID, transport, pageSize: 1 });

  await assert.rejects(engine.pull(), /rede caiu/u);
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 10);
  assert.equal((await store.get("lessonProgress", PROGRESS_ID)).cursor, 0);
  interrupt = false;
  const resumed = await engine.pull();
  assert.equal(resumed.previousCursor, 10);
  assert.equal(resumed.cursor, 20);
  assert.equal((await store.get("lessonProgress", PROGRESS_ID)).cursor, 1);
  assert.deepEqual(requested, [0, 10, 10]);
});

test("pull grande não acumula histórico: cada chamada vê o cursor da página anterior", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  await markBootstrapped(store);
  const pageCount = 80;
  let generated = 0;
  let previousPage = null;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 1,
    transport: baseTransport({
      async pullSyncChanges({ afterSequence }) {
        assert.equal(afterSequence, generated);
        if (generated > 0) {
          assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, generated);
          assert.equal(previousPage.length, 1);
        }
        generated += 1;
        previousPage = [{
          table_name: "card_progress",
          entity_id: uuid(1000 + generated),
          course_id: COURSE_ID,
          row: {
            id: uuid(1000 + generated),
            user_id: USER_ID,
            selection_id: SELECTION_ID,
            course_id: COURSE_ID,
            lesson_id: LESSON_ID,
            card_id: uuid(2000 + generated),
            completed: true,
            updated_at: "2026-07-19T12:00:00.000Z",
            deleted_at: null
          }
        }];
        return {
          changes: previousPage,
          next_cursor: generated,
          has_more: generated < pageCount
        };
      }
    })
  });

  const result = await engine.pull();
  assert.equal(result.pages, pageCount);
  assert.equal(result.applied, pageCount);
  assert.equal((await store.getAll("cardProgress")).length, pageCount);
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, pageCount);
});

test("bootstrap traz somente estado pessoal e baixa cada curso uma vez por hash", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const revision = await immutableRevision();
  let downloads = 0;
  const transport = baseTransport({
    async bootstrapReplica() {
      return emptyBootstrap({
        highWaterSequence: 300,
        rows: { courseSelections: [selection({ contentHash: revision.contentHash })] },
        selectedCourses: [{
          courseId: COURSE_ID,
          publicationSeq: 1,
          contentHash: revision.contentHash
        }]
      });
    },
    async pullSyncChanges({ afterSequence }) {
      assert.equal(afterSequence, 300);
      return { changes: [], nextCursor: 300, hasMore: false };
    },
    async downloadCourseRevision(courseId, contentHash) {
      downloads += 1;
      assert.equal(courseId, COURSE_ID);
      assert.equal(contentHash, revision.contentHash);
      return structuredClone(revision.document);
    }
  });
  const engine = new RelationalSyncEngine({ store, deviceId: DEVICE_ID, transport });

  const first = await engine.synchronize();
  assert.equal(first.bootstrap.status, "applied");
  assert.equal(first.bootstrap.rowCount, 1);
  assert.equal(first.updatedCourses, 1);
  assert.equal(downloads, 1);
  assert.ok(await store.get("courses", COURSE_ID));
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 300);

  const second = await engine.synchronize();
  assert.equal(second.bootstrap.status, "already_bootstrapped");
  assert.equal(second.updatedCourses, 0);
  assert.equal(downloads, 1);
});

test("manifesto remoto explicitamente vazio não deriva curso de seleção obsoleta", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  let downloads = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async bootstrapReplica() {
        return emptyBootstrap({
          highWaterSequence: 301,
          rows: { courseSelections: [selection()] },
          selectedCourses: []
        });
      },
      async downloadCourseRevision() {
        downloads += 1;
        throw new Error("curso retirado não deve ser baixado");
      }
    })
  });

  const result = await engine.synchronize();

  assert.equal(result.bootstrap.status, "applied");
  assert.equal(result.updatedCourses, 0);
  assert.equal(downloads, 0);
  assert.deepEqual(await store.getAll("courseSelections"), []);
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 301);
});

test("novo hash substitui apenas conteúdo oficial e preserva progresso", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const revision = await immutableRevision({ title: "Atualizado" });
  const stableLessonId = await deterministicUuid(
    `aralearn:revision:${COURSE_ID}:course:course-fixture-minimal/module:module-fixture-minimal/lesson:lesson-fixture-minimal`
  );
  await markBootstrapped(store, 5);
  await store.put("courseSelections", selection());
  const personal = { ...lessonProgress({ cursor: 6 }), lessonId: stableLessonId };
  await store.put("lessonProgress", personal);
  await store.replaceOfficialCourseReplica(COURSE_ID, {
    courses: [{ id: COURSE_ID, title: "Antigo", status: "published" }],
    modules: [{ id: uuid(10), courseId: COURSE_ID, position: 0 }],
    lessons: [{
      id: stableLessonId,
      courseId: COURSE_ID,
      moduleId: uuid(10),
      position: 0
    }]
  }, { publicationSeq: 1, contentHash: "hash-1", validate: false });
  let downloads = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async pullSyncChanges({ afterSequence }) {
        assert.equal(afterSequence, 5);
        return {
          changes: [{
            table_name: "user_course_selections",
            entity_id: SELECTION_ID,
            course_id: COURSE_ID,
            row: {
              ...selection({ publicationSeq: 2, contentHash: revision.contentHash }),
              publication_seq: 2,
              content_hash: revision.contentHash
            }
          }],
          next_cursor: 6,
          has_more: false
        };
      },
      async downloadCourseRevision(courseId, contentHash) {
        downloads += 1;
        assert.equal(courseId, COURSE_ID);
        assert.equal(contentHash, revision.contentHash);
        return structuredClone(revision.document);
      }
    })
  });

  const result = await engine.synchronize();
  assert.equal(result.updatedCourses, 1);
  assert.equal(downloads, 1);
  assert.equal((await store.get("courses", COURSE_ID)).title, "Atualizado");
  assert.equal(await store.get("modules", uuid(10)), undefined);
  assert.equal((await store.getAll("modules")).length, 1);
  assert.deepEqual(await store.get("lessonProgress", PROGRESS_ID), personal);
  assert.deepEqual(await store.getOfficialCourseReplicaState(COURSE_ID), {
    publicationSeq: 2,
    contentHash: revision.contentHash
  });
});

test("hash canônico remoto substitui cache com publicationSeq local maior", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const revision = await immutableRevision({ title: "Fonte canônica" });
  await markBootstrapped(store, 0);
  await store.put("courseSelections", selection({
    publicationSeq: 2,
    contentHash: revision.contentHash
  }));
  await store.replaceOfficialCourseReplica(COURSE_ID, {
    courses: [{ id: COURSE_ID, title: "Cache antigo", status: "published" }],
    modules: [{ id: uuid(10), courseId: COURSE_ID, position: 0 }]
  }, { publicationSeq: 9, contentHash: "hash-local", validate: false });
  let downloads = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async downloadCourseRevision(courseId, contentHash) {
        downloads += 1;
        assert.equal(courseId, COURSE_ID);
        assert.equal(contentHash, revision.contentHash);
        return structuredClone(revision.document);
      }
    })
  });

  const result = await engine.synchronize();

  assert.equal(result.updatedCourses, 1);
  assert.equal(downloads, 1);
  assert.equal((await store.get("courses", COURSE_ID)).title, "Fonte canônica");
  assert.deepEqual(await store.getOfficialCourseReplicaState(COURSE_ID), {
    publicationSeq: 2,
    contentHash: revision.contentHash
  });
});

test("publicação que remove alvo de mutação rejeitada é adiada sem perder trabalho local", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  await markBootstrapped(store, 0);
  const initial = officialGraph({ publicationSeq: 1, contentHash: "hash-1" });
  const removedCardId = initial.graph.cards[0].id;
  await store.replaceOfficialCourseReplica(COURSE_ID, initial.graph, {
    publicationSeq: 1,
    contentHash: "hash-1"
  });
  await store.put("courseSelections", selection({ publicationSeq: 2, contentHash: "hash-2" }));
  const rejected = {
    ...mutation({
      mutationId: uuid(550),
      entityType: "cardProgress",
      entityId: uuid(551),
      payload: {
        id: uuid(551),
        userId: USER_ID,
        selectionId: SELECTION_ID,
        courseId: COURSE_ID,
        lessonId: LESSON_ID,
        cardId: removedCardId,
        attempts: 1,
        updatedAt: "2026-07-19T13:00:00.000Z"
      }
    }),
    status: "rejected",
    lastError: "O card deixou de existir na publicação oficial."
  };
  await store.put("cardProgress", rejected.payload);
  await store.put("outbox", rejected);

  const revision = await immutableRevision({ removeFirstCard: true });
  await store.put("courseSelections", selection({
    publicationSeq: 2,
    contentHash: revision.contentHash
  }));
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async downloadCourseRevision(courseId, contentHash) {
        assert.equal(courseId, COURSE_ID);
        assert.equal(contentHash, revision.contentHash);
        return structuredClone(revision.document);
      }
    })
  });

  const result = await engine.synchronize();

  assert.equal(result.updatedCourses, 0);
  assert.deepEqual(result.catalogUpdatesDeferred, [{
    courseId: COURSE_ID,
    mutationIds: [uuid(550)]
  }]);
  assert.ok(await store.get("cards", removedCardId));
  assert.deepEqual(await store.get("cardProgress", rejected.entityId), rejected.payload);
  assert.equal((await store.get("outbox", rejected.mutationId)).status, "rejected");
  assert.equal((await store.getOfficialCourseReplicaState(COURSE_ID)).contentHash, "hash-1");
});

test("remoção concorrente durante download reconcilia a seleção sem erro fatal", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  await markBootstrapped(store, 0);
  await store.put("courseSelections", selection());
  await store.replaceOfficialCourseReplica(COURSE_ID, {
    courses: [{ id: COURSE_ID, title: "Curso local", status: "published" }],
    modules: [{ id: uuid(10), courseId: COURSE_ID, position: 0 }]
  }, { publicationSeq: 1, contentHash: "hash-1", validate: false });
  await store.put("lessonProgress", lessonProgress());
  let pullCalls = 0;
  let downloadCalls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async pullSyncChanges({ afterSequence }) {
        pullCalls += 1;
        if (pullCalls === 1) {
          return {
            changes: [{
              table_name: "user_course_selections",
              entity_id: SELECTION_ID,
              course_id: COURSE_ID,
              row: {
              ...selection({ publicationSeq: 2, contentHash: "b".repeat(64) }),
              publication_seq: 2,
              content_hash: "b".repeat(64)
            }
            }],
            next_sequence: afterSequence + 1,
            has_more: false
          };
        }
        return {
          changes: [{
            table_name: "user_course_selections",
            entity_id: SELECTION_ID,
            course_id: COURSE_ID,
            operation: "delete",
            row: null
          }],
          next_sequence: afterSequence + 1,
          has_more: false
        };
      },
      async downloadCourseRevision() {
        downloadCalls += 1;
        throw Object.assign(new Error("Seleção de curso não autorizada."), {
          status: 403,
          code: "42501"
        });
      }
    })
  });

  const result = await engine.synchronize({ expectedCourseIds: [COURSE_ID] });

  assert.equal(result.updatedCourses, 0);
  assert.equal(pullCalls, 2);
  assert.equal(downloadCalls, 1);
  assert.equal(await store.get("courseSelections", SELECTION_ID), undefined);
  assert.equal(await store.get("courses", COURSE_ID), undefined);
  assert.equal(await store.get("lessonProgress", PROGRESS_ID), undefined);
});

test("last-write-wins confirmado converge dois dispositivos sem conflito autoral", async () => {
  const deviceB = "41000000-0000-4000-8000-000000000014";
  const storeA = await createStore(new IDBFactory(), USER_ID);
  const storeB = await createStore(new IDBFactory(), USER_ID);
  await markBootstrapped(storeA);
  await markBootstrapped(storeB, 0, deviceB);
  const rowA = lessonProgress({ cursor: 1, updatedAt: "2026-07-19T13:00:00.000Z" });
  const rowB = {
    ...rowA,
    userId: USER_ID,
    cursor: 4,
    lastActivityAt: "2026-07-19T14:00:00.000Z",
    updatedAt: "2026-07-19T14:00:00.000Z"
  };
  await storeA.put("lessonProgress", rowA);
  await storeB.put("lessonProgress", rowB);
  await storeA.put("outbox", mutation({ mutationId: uuid(401), payload: rowA }));
  await storeB.put("outbox", mutation({ mutationId: uuid(402), payload: rowB }));

  let serverSequence = 0;
  let serverRow = null;
  const changes = [];
  const serverTransport = () => baseTransport({
    async applySyncBatch({ mutations }) {
      for (const entry of mutations) {
        serverSequence += 1;
        serverRow = { ...serverRow, ...entry.payload, id: entry.entityId };
        changes.push({
          sequence: serverSequence,
          table_name: "lesson_progress",
          entity_id: entry.entityId,
          course_id: entry.courseId,
          row: serverRow
        });
      }
      return { results: mutations.map(({ mutationId }) => ({ mutationId, status: "applied" })) };
    },
    async pullSyncChanges({ afterSequence }) {
      const page = changes.filter(({ sequence }) => sequence > afterSequence);
      return {
        changes: page,
        nextCursor: page.at(-1)?.sequence ?? afterSequence,
        hasMore: false
      };
    }
  });
  const engineA = new RelationalSyncEngine({ store: storeA, deviceId: DEVICE_ID, transport: serverTransport() });
  const engineB = new RelationalSyncEngine({
    store: storeB,
    deviceId: deviceB,
    transport: serverTransport()
  });

  await engineA.synchronize();
  await engineB.synchronize();
  await engineA.synchronize();

  assert.equal(serverRow.cursor, 4, "a última gravação válida confirmada vence");
  assert.equal((await storeA.get("lessonProgress", PROGRESS_ID)).cursor, 4);
  assert.equal((await storeB.get("lessonProgress", PROGRESS_ID)).cursor, 4);
  assert.deepEqual(await storeA.getAll("outbox"), []);
  assert.deepEqual(await storeB.getAll("outbox"), []);
  storeA.close();
  storeB.close();
});

test("chamadas simultâneas compartilham um único ciclo remoto", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let bootstrapCalls = 0;
  let pullCalls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async bootstrapReplica() {
        bootstrapCalls += 1;
        await gate;
        return emptyBootstrap();
      },
      async pullSyncChanges({ afterSequence }) {
        pullCalls += 1;
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    })
  });

  const first = engine.synchronize();
  const second = engine.synchronize();
  assert.equal(first, second);
  release();
  await Promise.all([first, second]);
  assert.equal(bootstrapCalls, 1);
  assert.equal(pullCalls, 1);
});

test("callback de progresso é monotônico e encerra em 100%", async (context) => {
  const store = await createStore();
  context.after(() => store.close());
  const globalProgress = [];
  const operationProgress = [];
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    onProgress: (event) => globalProgress.push(event),
    transport: baseTransport()
  });

  const result = await engine.synchronize({ onProgress: (event) => operationProgress.push(event) });
  assert.equal(result.updatedCourses, 0);
  assert.deepEqual(globalProgress.map(({ percent }) => percent), [12, 20, 36, 52, 68, 100]);
  assert.deepEqual(operationProgress, globalProgress);
  assert.match(globalProgress.at(-1).message, /concluída/u);
});

test("o maior curso oficial atravessa bootstrap, cache IndexedDB e montagem sem perda", async (context) => {
  const fixture = await prepareFixture("dataprev-analista-processamento-seed-course.json");
  const revision = {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [fixture.course]
  };
  const revisionHash = await canonicalRevisionHash(revision);
  const courseId = fixture.rows.courses[0].id;
  const selectionId = uuid(501);
  const selectedAt = "2026-07-19T12:00:00.000Z";
  const store = await createStore();
  context.after(() => store.close());
  let downloads = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: baseTransport({
      async bootstrapReplica() {
        return emptyBootstrap({
          highWaterSequence: 217,
          rows: {
            courseSelections: [{
              id: selectionId,
              userId: USER_ID,
              courseId,
              publicationSeq: 1,
              contentHash: revisionHash,
              selectedAt,
              updatedAt: selectedAt,
              deletedAt: null
            }]
          },
          selectedCourses: [{
            courseId,
            publicationSeq: 1,
            contentHash: revisionHash
          }]
        });
      },
      async downloadCourseRevision(requestedCourseId, requestedRevisionHash) {
        downloads += 1;
        assert.equal(requestedCourseId, courseId);
        assert.equal(requestedRevisionHash, revisionHash);
        return structuredClone(revision);
      }
    })
  });

  const result = await engine.synchronize();
  const rebuilt = new ProjectDocumentAssembler().assemble(await store.readStores());

  assert.equal(result.bootstrap.status, "applied");
  assert.equal(result.updatedCourses, 1);
  assert.equal(downloads, 1);
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 217);
  assert.deepEqual(rebuilt.courses, [fixture.course]);
});
