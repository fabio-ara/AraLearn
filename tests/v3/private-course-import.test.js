import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { IDBFactory } from "fake-indexeddb";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import { importCourses } from "../../src/editor/contractEditor.js";
import {
  IndexedDbRelationalStore,
  OFFICIAL_COURSE_STORE_NAMES
} from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  DomainMutationService,
  PRIVATE_COURSE_CREATE_OUTBOX_KIND
} from "../../src/persistence/DomainMutationService.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import { RelationalSyncEngine } from "../../src/sync/RelationalSyncEngine.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";
const REMOTE_COURSE_ID = "30000000-0000-4000-8000-000000000003";
const REMOTE_SELECTION_ID = "40000000-0000-4000-8000-000000000004";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v3/project-minimal.json", import.meta.url),
  "utf8"
));
const realisticCourseFixture = JSON.parse(fs.readFileSync(
  new URL("../../supabase/fixtures/catalog/fundamentos-ia-analise-dados-seed-course.json", import.meta.url),
  "utf8"
));

function importedProject() {
  return importCourses(createEmptyProjectDocument(), { document: fixture });
}

function realisticImportedProject() {
  return importCourses(createEmptyProjectDocument(), {
    document: {
      contract: "aralearn.contract",
      version: 3,
      kind: "project",
      courses: [realisticCourseFixture]
    }
  });
}

async function openRepository(indexedDb) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: USER_ID });
  const repository = new RelationalProjectRepository({ store, userId: USER_ID });
  await repository.initialize();
  return { store, repository };
}

async function stageImport(repository) {
  const project = importedProject();
  const courseKey = project.courses[0].id;
  const staged = await repository.importPrivateCourse(project, { courseKey });
  await repository.flush();
  return { ...staged, courseKey };
}

async function storedCourseGraph(store, courseId) {
  return Object.fromEntries(await Promise.all(OFFICIAL_COURSE_STORE_NAMES.map(async (storeName) => [
    storeName,
    (await store.getAll(storeName)).filter((row) =>
      storeName === "courses" ? row.id === courseId : row.courseId === courseId
    )
  ])));
}

test("importação privada offline persiste a árvore e a outbox antes de acessar a rede", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const staged = await stageImport(repository);
  const beforeFailure = await store.getAll("outbox");
  const root = beforeFailure.find((entry) => entry.outboxKind === "privateCourseCreate");

  assert.ok(root);
  assert.equal(root.courseId, staged.courseId);
  assert.equal(root.importId, staged.importId);
  assert.ok(beforeFailure.length > 1);
  assert.equal(repository.loadProject().courses[0].id, staged.courseKey);

  let contentWasSent = false;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async createPersonalCourse() {
        throw new TypeError("Failed to fetch: offline");
      },
      async applySyncBatch() {
        contentWasSent = true;
        return { results: [] };
      },
      async pullSyncChanges() {
        return { changes: [], nextCursor: 0, hasMore: false };
      }
    }
  });
  await engine.initialize();
  await assert.rejects(() => engine.push(), /offline/u);
  assert.equal(contentWasSent, false);
  assert.equal((await store.get("outbox", root.mutationId)).status, "pending");
  assert.equal((await store.get("outbox", root.mutationId)).attemptCount, 1);
  assert.equal((await repository.getPrivateCourseImportState(staged.importId)).remoteConfirmed, false);

  await repository.close();
  const reopened = await openRepository(indexedDb);
  assert.equal(reopened.repository.loadProject().courses[0].id, staged.courseKey);
  assert.equal((await reopened.repository.getPrivateCourseImportState(staged.importId)).pending, beforeFailure.length);
  await reopened.repository.close();
});

test("retomada cria a raiz remota, remapeia a réplica e envia somente linhas granulares", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const staged = await stageImport(repository);
  const sentBatches = [];
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 500,
    transport: {
      async createPersonalCourse(entry) {
        assert.equal(entry.importId, staged.importId);
        return { courseId: REMOTE_COURSE_ID, selectionId: REMOTE_SELECTION_ID };
      },
      async applySyncBatch({ mutations }) {
        sentBatches.push(structuredClone(mutations));
        return {
          results: mutations.map(({ mutationId }) => ({ mutationId, status: "applied" }))
        };
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });
  await engine.initialize();
  const result = await engine.push();

  assert.ok(result.accepted > 1);
  assert.deepEqual(await store.getAll("outbox"), []);
  assert.equal(await store.get("courses", staged.courseId), undefined);
  assert.ok(await store.get("courses", REMOTE_COURSE_ID));
  assert.equal(await store.get("courseSelections", staged.selectionId), undefined);
  assert.equal((await store.get("courseSelections", REMOTE_SELECTION_ID)).courseId, REMOTE_COURSE_ID);
  assert.ok(sentBatches.flat().length > 0);
  assert.equal(sentBatches.flat().some((entry) => entry.outboxKind === "privateCourseCreate"), false);
  assert.equal(sentBatches.flat().every((entry) => entry.courseId === REMOTE_COURSE_ID), true);
  for (const storeName of OFFICIAL_COURSE_STORE_NAMES) {
    if (storeName === "courses") continue;
    assert.equal(
      (await store.getAll(storeName)).every((row) => row.courseId === REMOTE_COURSE_ID),
      true,
      storeName
    );
  }
  assert.deepEqual(await repository.getPrivateCourseImportState(staged.importId), {
    importId: staged.importId,
    pending: 0,
    rejected: 0,
    remoteConfirmed: true,
    mutationCount: 0
  });
  await repository.close();
});

test("confirmação da importação ignora rejeição pertencente a outro curso", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const staged = await stageImport(repository);
  await store.put("outbox", {
    mutationId: "50000000-0000-4000-8000-000000000005",
    sequence: 99999,
    courseId: "60000000-0000-4000-8000-000000000006",
    entityType: "comments",
    entityId: "70000000-0000-4000-8000-000000000007",
    operation: "insert",
    changedFields: [],
    payload: {},
    previousRow: null,
    status: "rejected",
    attemptCount: 1,
    lastError: "Rejeição independente.",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z"
  });
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 500,
    transport: {
      async createPersonalCourse() {
        return { courseId: REMOTE_COURSE_ID, selectionId: REMOTE_SELECTION_ID };
      },
      async applySyncBatch({ mutations }) {
        return {
          results: mutations.map(({ mutationId }) => ({ mutationId, status: "applied" }))
        };
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });
  await engine.initialize();
  await engine.push();

  const importState = await repository.getPrivateCourseImportState(staged.importId);
  assert.equal(importState.remoteConfirmed, true);
  assert.equal(importState.pending, 0);
  assert.equal(importState.rejected, 0);
  assert.equal((await store.listRejectedOutbox()).length, 1);
  await repository.close();
});

test("rejeição da raiz bloqueia os descendentes e o descarte remove a importação inteira", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const staged = await stageImport(repository);
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async createPersonalCourse() {
        const error = new Error("Autorização revogada.");
        error.status = 403;
        error.code = "42501";
        throw error;
      },
      async applySyncBatch() {
        assert.fail("Descendentes não podem ser enviados sem a raiz remota.");
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });
  await engine.initialize();
  const result = await engine.push();
  const importState = await repository.getPrivateCourseImportState(staged.importId);
  const [root] = await store.listRejectedOutbox({ courseId: staged.courseId });

  assert.equal(result.rejected, 1);
  assert.ok(root);
  assert.equal(importState.pending, 0);
  assert.ok(importState.rejected > 1);
  assert.equal((await store.getAll("outbox")).some((entry) => entry.status === "blocked"), true);

  const discarded = await engine.discardRejectedMutation(root.mutationId);
  assert.equal(discarded.rollbackApplied, true);
  assert.deepEqual(await store.getAll("outbox"), []);
  assert.equal(await store.get("courses", staged.courseId), undefined);
  assert.equal(await store.get("courseSelections", staged.selectionId), undefined);
  await repository.close();
});

test("401 após o remapeamento preserva os filhos e o novo login conclui a mesma importação", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const staged = await stageImport(repository);
  const before = (await store.getAll("outbox"))
    .filter((entry) => entry.outboxKind !== "privateCourseCreate");
  let rootCalls = 0;
  let expiredBatchCalls = 0;
  const expiredEngine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 500,
    transport: {
      async createPersonalCourse() {
        rootCalls += 1;
        return { courseId: REMOTE_COURSE_ID, selectionId: REMOTE_SELECTION_ID };
      },
      async applySyncBatch() {
        expiredBatchCalls += 1;
        const error = new Error("JWT expired");
        error.status = 401;
        error.code = "PGRST301";
        throw error;
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });

  const expired = await expiredEngine.synchronize();
  const preserved = await store.getAll("outbox");
  assert.equal(rootCalls, 1);
  assert.equal(expiredBatchCalls, 1);
  assert.equal(expired.authRequired, true);
  assert.equal(expired.replicaIdentityChanged, true);
  assert.equal(expired.pushed.replicaIdentityChanged, true);
  assert.equal(await store.get("courses", staged.courseId), undefined);
  assert.ok(await store.get("courses", REMOTE_COURSE_ID));
  assert.equal(preserved.length, before.length);
  assert.deepEqual(
    preserved.map((entry) => ({
      mutationId: entry.mutationId,
      status: entry.status,
      attemptCount: entry.attemptCount,
      courseId: entry.courseId
    })),
    before.map((entry) => ({
      mutationId: entry.mutationId,
      status: "pending",
      attemptCount: entry.attemptCount,
      courseId: REMOTE_COURSE_ID
    }))
  );

  let resumedRootCalls = 0;
  const resumedBatches = [];
  const resumedEngine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 500,
    transport: {
      async createPersonalCourse() {
        resumedRootCalls += 1;
        assert.fail("A raiz já confirmada não pode ser criada novamente.");
      },
      async applySyncBatch({ mutations }) {
        resumedBatches.push(structuredClone(mutations));
        return {
          results: mutations.map(({ mutationId }) => ({ mutationId, status: "applied" }))
        };
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });
  await resumedEngine.initialize();
  const resumed = await resumedEngine.push();

  assert.equal(resumedRootCalls, 0);
  assert.equal(resumed.accepted, before.length);
  assert.equal(resumedBatches.flat().length, before.length);
  assert.equal(resumedBatches.flat().every((entry) => entry.courseId === REMOTE_COURSE_ID), true);
  assert.deepEqual(await store.getAll("outbox"), []);
  await repository.close();
});

test("snapshot não substitui curso privado enquanto seus filhos aguardam envio", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  await stageImport(repository);
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 500,
    transport: {
      async createPersonalCourse() {
        return { courseId: REMOTE_COURSE_ID, selectionId: REMOTE_SELECTION_ID };
      },
      async applySyncBatch() {
        const error = new Error("Sessão expirada");
        error.status = 401;
        throw error;
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });
  await engine.initialize();
  await engine.push();

  const original = await store.get("courses", REMOTE_COURSE_ID);
  const replacement = await storedCourseGraph(store, REMOTE_COURSE_ID);
  replacement.courses[0] = { ...replacement.courses[0], title: "Título remoto concorrente" };
  await assert.rejects(
    store.replaceOfficialCourseReplica(REMOTE_COURSE_ID, replacement, { validate: false }),
    (error) => error?.catalogReplicaReconciliationRequired === true && error.mutationIds.length > 0
  );
  assert.deepEqual(await store.get("courses", REMOTE_COURSE_ID), original);
  assert.ok((await store.listPendingOutbox({ courseId: REMOTE_COURSE_ID })).length > 0);
  await repository.close();
});

test("rejeição determinística de um filho bloqueia o restante da importação", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const staged = await stageImport(repository);
  let batchCalls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 2,
    transport: {
      async createPersonalCourse() {
        return { courseId: REMOTE_COURSE_ID, selectionId: REMOTE_SELECTION_ID };
      },
      async applySyncBatch({ mutations }) {
        batchCalls += 1;
        return {
          results: mutations.map((entry, index) => index === 0
            ? {
                mutationId: entry.mutationId,
                status: "rejected",
                code: "23503",
                reason: "invalid_reference",
                message: "Referência estrutural inválida."
              }
            : { mutationId: entry.mutationId, status: "applied" })
        };
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });
  await engine.initialize();
  const result = await engine.push();
  const importEntries = (await store.getAll("outbox"))
    .filter((entry) => entry.importId === staged.importId);
  const rejected = importEntries.find((entry) => entry.status === "rejected");

  assert.equal(result.rejected, 1);
  assert.equal(batchCalls, 1);
  assert.ok(rejected);
  assert.equal(importEntries.some((entry) => entry.status === "pending"), false);
  assert.equal(importEntries.some((entry) => entry.status === "blocked"), true);
  assert.equal((await repository.getPrivateCourseImportState(staged.importId)).remoteConfirmed, false);

  const replacement = await storedCourseGraph(store, REMOTE_COURSE_ID);
  replacement.courses[0] = { ...replacement.courses[0], title: "Snapshot que não pode vencer" };
  await assert.rejects(
    store.replaceOfficialCourseReplica(REMOTE_COURSE_ID, replacement, { validate: false }),
    (error) => error?.catalogReplicaReconciliationRequired === true
  );

  await engine.push();
  assert.equal(batchCalls, 1, "a cadeia bloqueada não pode ser reenviada automaticamente");
  const beforeDiscard = await store.getAll("outbox");
  await assert.rejects(
    engine.discardRejectedMutation(rejected.mutationId),
    (error) => error?.code === "private_course_import_reconciliation_required"
  );
  assert.deepEqual(await store.getAll("outbox"), beforeDiscard);
  assert.ok(await store.get("courses", REMOTE_COURSE_ID));
  await repository.close();
});

test("falha determinística do lote rejeita o causador e bloqueia seus descendentes", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const staged = await stageImport(repository);
  let batchCalls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize: 3,
    transport: {
      async createPersonalCourse() {
        return { courseId: REMOTE_COURSE_ID, selectionId: REMOTE_SELECTION_ID };
      },
      async applySyncBatch() {
        batchCalls += 1;
        const error = new Error("mutationId incompatível");
        error.status = 400;
        error.code = "23514";
        throw error;
      },
      async pullSyncChanges({ afterSequence }) {
        return { changes: [], nextCursor: afterSequence, hasMore: false };
      }
    }
  });
  await engine.initialize();
  const result = await engine.push();
  const entries = (await store.getAll("outbox"))
    .filter((entry) => entry.importId === staged.importId);

  assert.equal(result.rejected, 1);
  assert.equal(batchCalls, 1);
  assert.equal(entries.filter((entry) => entry.status === "rejected").length, 1);
  assert.equal(entries.some((entry) => entry.status === "blocked"), true);
  assert.equal(entries.some((entry) => entry.status === "pending"), false);
  await engine.push();
  assert.equal(batchCalls, 1);
  await repository.close();
});

test("importação privada realista persiste 5,8 mil mutações em tempo limitado", async () => {
  const indexedDb = new IDBFactory();
  const { store, repository } = await openRepository(indexedDb);
  const project = realisticImportedProject();
  const startedAt = performance.now();
  const imported = await repository.importPrivateCourse(project, {
    courseKey: project.courses[0].id
  });
  await repository.flush();
  const elapsedMs = performance.now() - startedAt;
  const outbox = await store.getAll("outbox");

  assert.ok(imported.mutationIds.length >= 5_800);
  assert.equal(outbox.length, imported.mutationIds.length);
  assert.ok(
    elapsedMs < 10_000,
    `A importação de ${imported.mutationIds.length} mutações levou ${Math.round(elapsedMs)} ms.`
  );

  const linkedFlowNode = (await store.getAll("flowNodes")).find((row) => row.parentCaseId);
  assert.ok(linkedFlowNode, "a fixture deve exercitar a atualização diferida de parentCaseId");
  const nodeMutations = outbox
    .filter((entry) => entry.entityType === "flowNodes" && entry.entityId === linkedFlowNode.id)
    .sort((left, right) => left.sequence - right.sequence);
  assert.equal(nodeMutations.length, 2);
  assert.equal(nodeMutations[0].payload.parentCaseId, null);
  assert.equal(nodeMutations[1].payload.parentCaseId, linkedFlowNode.parentCaseId);
  await repository.close();
});

test("falha em gravação agrupada reverte raiz, filhos e outbox na mesma transação", async () => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId: USER_ID });
  const mutations = new DomainMutationService({ store });
  const importId = "50000000-0000-4000-8000-000000000005";
  const courseId = "60000000-0000-4000-8000-000000000006";
  const selectionId = "70000000-0000-4000-8000-000000000007";
  const duplicateMutationId = "80000000-0000-4000-8000-000000000008";
  const rootMutationId = "90000000-0000-4000-8000-000000000009";

  await assert.rejects(mutations.applyMutations([
    {
      storeName: "modules",
      entityId: "a0000000-0000-4000-8000-00000000000a",
      courseId,
      operation: "upsert",
      previousRow: null,
      nextRow: {
        id: "a0000000-0000-4000-8000-00000000000a",
        courseId,
        contractKey: "modulo-a",
        position: 0
      },
      mutationId: duplicateMutationId,
      importId
    },
    {
      storeName: "modules",
      entityId: "b0000000-0000-4000-8000-00000000000b",
      courseId,
      operation: "upsert",
      previousRow: null,
      nextRow: {
        id: "b0000000-0000-4000-8000-00000000000b",
        courseId,
        contractKey: "modulo-b",
        position: 1
      },
      mutationId: duplicateMutationId,
      importId
    }
  ], {
    localRows: [
      { storeName: "courses", row: { id: courseId, courseId, contractKey: "curso-privado" } },
      {
        storeName: "courseSelections",
        row: { id: selectionId, userId: USER_ID, courseId, position: 0 }
      }
    ],
    leadingOutboxEntries: [{
      mutationId: rootMutationId,
      importId,
      outboxKind: PRIVATE_COURSE_CREATE_OUTBOX_KIND,
      localSelectionId: selectionId,
      courseId,
      entityType: "courses",
      entityId: courseId,
      operation: "create",
      payload: { contractKey: "curso-privado", title: "Curso privado" }
    }]
  }));

  assert.equal(await store.get("courses", courseId), undefined);
  assert.equal(await store.get("courseSelections", selectionId), undefined);
  assert.deepEqual(await store.getAll("modules"), []);
  assert.deepEqual(await store.getAll("outbox"), []);
  await store.close();
});
