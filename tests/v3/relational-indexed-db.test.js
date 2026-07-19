import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  IndexedDbRelationalStore,
  RELATIONAL_DATABASE_NAME,
  RELATIONAL_STORE_DEFINITIONS,
  relationalDatabaseNameForUser
} from "../../src/persistence/IndexedDbRelationalStore.js";

const REQUIRED_STORES = [
  "courses",
  "memberships",
  "modules",
  "lessons",
  "microsequences",
  "dependencies",
  "cards",
  "blocks",
  "options",
  "nodes",
  "edges",
  "cells",
  "points",
  "lines",
  "lessonProgress",
  "cardProgress",
  "comments",
  "studyPaths",
  "studyPathCourses",
  "outbox",
  "syncState",
  "conflicts"
];

function uuid(suffix) {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

test("o IndexedDB relacional usa banco novo e cria stores e índices granulares", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb);
  context.after(() => store.close());

  assert.equal(store.name, RELATIONAL_DATABASE_NAME);
  assert.equal(RELATIONAL_DATABASE_NAME, "aralearn-relational-v1");
  REQUIRED_STORES.forEach((storeName) => {
    assert.ok(store.objectStoreNames.includes(storeName), `store ausente: ${storeName}`);
  });
  assert.ok(RELATIONAL_STORE_DEFINITIONS.blocks.indexes.some((entry) => entry.name === "byCardRegionPosition"));
  assert.ok(RELATIONAL_STORE_DEFINITIONS.cards.indexes.some((entry) => entry.name === "byMicrosequencePosition"));
  assert.ok(RELATIONAL_STORE_DEFINITIONS.outbox.indexes.some((entry) => entry.name === "byStatusCreatedAt"));

  const block = {
    id: uuid(1),
    courseId: uuid(2),
    cardId: uuid(3),
    region: "primary",
    position: 0,
    revision: 1,
    updatedAt: "2026-07-18T00:00:00.000Z",
    deletedAt: null
  };
  await store.put("blocks", block);
  assert.deepEqual(
    await store.getAllByIndex("blocks", "byCardRegionPosition", [block.cardId, "primary", 0]),
    [block]
  );
});

test("RelationalTransaction confirma todas as linhas ou aborta todas", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const course = {
    id: uuid(10),
    courseId: uuid(10),
    contractKey: "course-ok",
    title: "Curso",
    revision: 1,
    updatedAt: null,
    deletedAt: null
  };
  const moduleValue = {
    id: uuid(11),
    courseId: course.id,
    contractKey: "module-ok",
    position: 0,
    revision: 1,
    updatedAt: null,
    deletedAt: null
  };

  await store.transaction(["courses", "modules"], "readwrite", async (transaction) => {
    await transaction.put("courses", course);
    await transaction.put("modules", moduleValue);
  });
  assert.equal((await store.get("courses", course.id)).contractKey, "course-ok");
  assert.equal((await store.get("modules", moduleValue.id)).contractKey, "module-ok");

  await assert.rejects(
    store.transaction(["courses", "modules"], "readwrite", async (transaction) => {
      await transaction.put("courses", { ...course, id: uuid(12), contractKey: "course-abort" });
      await transaction.put("modules", { ...moduleValue, id: uuid(13), contractKey: "module-abort" });
      throw new Error("falha deliberada");
    }),
    /falha deliberada/u
  );
  assert.equal(await store.get("courses", uuid(12)), undefined);
  assert.equal(await store.get("modules", uuid(13)), undefined);
});

test("syncState conserva apenas valores do novo banco e não consulta o banco legado", async (context) => {
  const indexedDb = new IDBFactory();
  const legacyRequest = indexedDb.open("aralearn", 1);
  await new Promise((resolve, reject) => {
    legacyRequest.addEventListener("upgradeneeded", () => {
      legacyRequest.result.createObjectStore("documents").put("legado", "project");
    });
    legacyRequest.addEventListener("success", resolve, { once: true });
    legacyRequest.addEventListener("error", () => reject(legacyRequest.error), { once: true });
  });
  legacyRequest.result.close();

  const store = await IndexedDbRelationalStore.open(indexedDb);
  context.after(() => store.close());
  assert.deepEqual(await store.getAll("projectMeta"), []);

  await store.putSyncState("device.id", "device-123");
  assert.equal(await store.getSyncState("device.id"), "device-123");
  await store.putSyncState("auth.session", { access_token: "token" });
  assert.deepEqual(await store.getSyncState("auth.session"), { access_token: "token" });
  await store.putSyncState("auth.session", null);
  assert.equal(await store.getSyncState("auth.session"), null);
});

test("cada UUID de usuário mantém réplica física persistente sem visibilidade cruzada", async () => {
  const indexedDb = new IDBFactory();
  const userA = uuid(901);
  const userB = uuid(902);
  const courseA = uuid(903);
  const courseB = uuid(904);
  const storeA = await IndexedDbRelationalStore.open(indexedDb, { userId: userA });
  await storeA.bindReplicaToUser(userA);
  await storeA.put("courses", {
    id: courseA, courseId: courseA, contractKey: "privado-a", revision: 1, deletedAt: null
  });
  await storeA.put("outbox", {
    mutationId: uuid(905), entityType: "courses", entityId: courseA, courseId: courseA,
    status: "pending", operation: "upsert", payload: { id: courseA }
  });
  storeA.close();

  const storeB = await IndexedDbRelationalStore.open(indexedDb, { userId: userB });
  await storeB.bindReplicaToUser(userB);
  assert.equal(storeB.name, relationalDatabaseNameForUser(userB));
  assert.deepEqual(await storeB.getAll("courses"), []);
  assert.deepEqual(await storeB.getAll("outbox"), []);
  await storeB.put("courses", {
    id: courseB, courseId: courseB, contractKey: "privado-b", revision: 1, deletedAt: null
  });
  storeB.close();

  const returnedA = await IndexedDbRelationalStore.open(indexedDb, { userId: userA });
  assert.equal((await returnedA.get("courses", courseA)).contractKey, "privado-a");
  assert.equal(await returnedA.get("courses", courseB), undefined);
  assert.equal((await returnedA.get("outbox", uuid(905))).status, "pending");
  returnedA.close();

  const returnedB = await IndexedDbRelationalStore.open(indexedDb, { userId: userB });
  assert.equal((await returnedB.get("courses", courseB)).contractKey, "privado-b");
  assert.equal(await returnedB.get("courses", courseA), undefined);
  returnedB.close();
});

test("outbox ordena pais antes dos filhos e tombstones na ordem inversa", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(70);
  const moduleId = uuid(71);
  const lessonId = uuid(72);
  const entries = [
    {
      mutationId: uuid(73), sequence: 1, entityType: "lessons", entityId: lessonId,
      courseId, operation: "upsert", status: "pending", payload: { id: lessonId, courseId, moduleId }
    },
    {
      mutationId: uuid(74), sequence: 2, entityType: "modules", entityId: moduleId,
      courseId, operation: "upsert", status: "pending", payload: { id: moduleId, courseId }
    },
    {
      mutationId: uuid(75), sequence: 3, entityType: "courses", entityId: courseId,
      courseId, operation: "upsert", status: "pending", payload: { id: courseId }
    },
    {
      mutationId: uuid(76), sequence: 4, entityType: "modules", entityId: uuid(77),
      courseId: uuid(78), operation: "delete", status: "pending",
      payload: { id: uuid(77), courseId: uuid(78) }
    },
    {
      mutationId: uuid(79), sequence: 5, entityType: "lessons", entityId: uuid(80),
      courseId: uuid(78), operation: "delete", status: "pending",
      payload: { id: uuid(80), courseId: uuid(78), moduleId: uuid(77) }
    }
  ];
  await store.putMany("outbox", entries);

  const ordered = await store.listPendingOutbox({ limit: 10 });
  assert.deepEqual(ordered.map((entry) => entry.mutationId), [
    uuid(79),
    uuid(76),
    uuid(75),
    uuid(74),
    uuid(73)
  ]);
});

test("outbox preserva replace antes de mutação posterior coberta pelo fragmento", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(170);
  const microsequenceId = uuid(171);
  const cardId = uuid(172);
  const replacementId = uuid(173);
  const deletionId = uuid(174);
  await store.putMany("outbox", [
    {
      mutationId: replacementId,
      sequence: 1,
      entityType: "microsequenceCardReplacement",
      entityId: microsequenceId,
      courseId,
      operation: "replace",
      status: "pending",
      payload: {
        courseId,
        microsequenceId,
        fragment: { cards: [{ id: cardId, courseId, microsequenceId }] }
      }
    },
    {
      mutationId: deletionId,
      sequence: 2,
      entityType: "cards",
      entityId: cardId,
      courseId,
      operation: "delete",
      status: "pending",
      payload: { id: cardId, courseId, microsequenceId }
    }
  ]);

  const ordered = await store.listPendingOutbox({ limit: 10 });
  assert.deepEqual(ordered.map((entry) => entry.mutationId), [replacementId, deletionId]);
});

test("outbox não reenvia descendentes enquanto a mutação causal está em conflito", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(175);
  const microsequenceId = uuid(176);
  const cardId = uuid(177);
  await store.putMany("outbox", [
    {
      mutationId: uuid(178), sequence: 1, entityType: "microsequenceCardReplacement",
      entityId: microsequenceId, courseId, operation: "replace", status: "conflict",
      payload: { courseId, microsequenceId, fragment: { cards: [{ id: cardId }] } }
    },
    {
      mutationId: uuid(179), sequence: 2, entityType: "cards", entityId: cardId,
      courseId, operation: "delete", status: "pending",
      payload: { id: cardId, courseId, microsequenceId }
    }
  ]);

  assert.deepEqual(await store.listPendingOutbox(), []);
});

test("outbox também bloqueia descendentes de uma mutação rejeitada", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(229);
  const parentId = uuid(230);
  const childId = uuid(231);
  await store.putMany("outbox", [
    {
      mutationId: uuid(232), sequence: 1, entityType: "modules", entityId: parentId,
      courseId, operation: "upsert", status: "rejected",
      payload: { id: parentId, courseId }
    },
    {
      mutationId: uuid(233), sequence: 2, entityType: "lessons", entityId: childId,
      courseId, operation: "upsert", status: "pending",
      payload: { id: childId, courseId, moduleId: parentId }
    }
  ]);

  assert.deepEqual(await store.listPendingOutbox(), []);
});

test("replace posterior não atravessa conflito granular coberto pelo fragmento", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(180);
  const microsequenceId = uuid(181);
  const blockId = uuid(182);
  await store.putMany("outbox", [
    {
      mutationId: uuid(183), sequence: 1, entityType: "blocks", entityId: blockId,
      courseId, operation: "upsert", status: "conflict",
      payload: { id: blockId, courseId, value: "edição em conflito" }
    },
    {
      mutationId: uuid(184), sequence: 2, entityType: "microsequenceCardReplacement",
      entityId: microsequenceId, courseId, operation: "replace", status: "pending",
      payload: {
        courseId,
        microsequenceId,
        fragment: { blocks: [{ id: blockId, courseId, value: "fragmento dependente" }] }
      }
    }
  ]);

  assert.deepEqual(await store.listPendingOutbox(), []);
});

test("índices locais permitem tombstone e substituto ativo com a mesma chave pública", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  await store.put("courses", {
    id: uuid(81),
    courseId: uuid(81),
    contractKey: "curso-atualizado",
    revision: 2,
    deletedAt: "2026-07-18T17:00:00.000Z"
  });
  await store.put("courses", {
    id: uuid(82),
    courseId: uuid(82),
    contractKey: "curso-atualizado",
    revision: 1,
    deletedAt: null
  });
  const copies = await store.getAllByIndex("courses", "byContractKey", "curso-atualizado");
  assert.equal(copies.length, 2);
  assert.equal(copies.filter((row) => row.deletedAt == null).length, 1);
});

test("página remota é atômica, preserva conflito e permite confirmar a outbox", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const blockId = uuid(20);
  const base = {
    id: blockId,
    courseId: uuid(21),
    cardId: uuid(22),
    slot: "primary",
    position: 0,
    value: "local",
    revision: 1,
    updatedAt: "2026-07-18T00:00:00.000Z",
    deletedAt: null
  };
  await store.put("blocks", base);
  await store.put("outbox", {
    mutationId: uuid(23),
    courseId: base.courseId,
    entityType: "blocks",
    entityId: blockId,
    operation: "upsert",
    baseRevision: 1,
    payload: { ...base, value: "local pendente", revision: 2 },
    status: "pending",
    createdAt: "2026-07-18T00:01:00.000Z"
  });

  const remote = { ...base, value: "remoto", revision: 2, updatedAt: "2026-07-18T00:02:00.000Z" };
  const conflicted = await store.applyRemotePage({
    changes: [{ storeName: "blocks", entityId: blockId, operation: "upsert", row: remote }],
    cursor: 10,
    courseId: base.courseId,
    deviceId: "device-a",
    uuidFactory: () => uuid(24)
  });
  assert.equal(conflicted.applied.length, 0);
  assert.equal(conflicted.conflicts.length, 1);
  assert.equal((await store.get("blocks", blockId)).value, "local");
  assert.equal((await store.get("syncState", `device-a:${base.courseId}`)).cursor, 10);

  assert.deepEqual(await store.acknowledgeOutbox([uuid(23)]), [uuid(23)]);
  assert.equal(await store.get("outbox", uuid(23)), undefined);
  const applied = await store.applyRemotePage({
    changes: [{ storeName: "blocks", entityId: blockId, operation: "upsert", row: remote }],
    cursor: 11,
    courseId: base.courseId,
    deviceId: "device-a"
  });
  assert.equal(applied.applied.length, 1);
  assert.equal((await store.get("blocks", blockId)).value, "remoto");

  const canonicalSameRevision = {
    ...remote,
    value: "remoto canônico",
    updatedAt: "2026-07-18T00:02:30.000Z"
  };
  const reconciled = await store.applyRemotePage({
    changes: [{
      storeName: "blocks",
      entityId: blockId,
      operation: "upsert",
      row: canonicalSameRevision
    }],
    cursor: 11,
    courseId: base.courseId,
    deviceId: "device-a"
  });
  assert.equal(reconciled.conflicts.length, 0);
  assert.equal(reconciled.applied.length, 1);
  assert.equal((await store.get("blocks", blockId)).value, "remoto canônico");

  await store.applyRemotePage({
    changes: [{
      storeName: "blocks",
      entityId: blockId,
      operation: "delete",
      row: { ...remote, revision: 3, deletedAt: "2026-07-18T00:03:00.000Z" }
    }],
    cursor: 12,
    courseId: base.courseId,
    deviceId: "device-a"
  });
  assert.equal((await store.get("blocks", blockId)).revision, 3);
  assert.equal((await store.get("blocks", blockId)).deletedAt, "2026-07-18T00:03:00.000Z");
  assert.equal((await store.get("syncState", `device-a:${base.courseId}`)).cursor, 12);
});

test("eco da revisão de base não conflita nem regride edição local posterior", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const entityId = uuid(180);
  const courseId = uuid(181);
  const mutationId = uuid(182);
  const local = {
    id: entityId,
    courseId,
    value: "edição B",
    revision: 3,
    updatedAt: "2026-07-18T19:02:00.000Z",
    deletedAt: null
  };
  await store.put("blocks", local);
  await store.put("outbox", {
    mutationId,
    entityType: "blocks",
    entityId,
    courseId,
    operation: "upsert",
    baseRevision: 2,
    payload: local,
    status: "pending",
    createdAt: "2026-07-18T19:02:00.000Z"
  });

  const result = await store.applyRemotePage({
    changes: [{
      storeName: "blocks",
      entityId,
      operation: "upsert",
      row: {
        ...local,
        value: "edição A confirmada",
        revision: 2,
        updatedAt: "2026-07-18T19:01:00.000Z"
      }
    }],
    cursor: 20,
    courseId,
    deviceId: "device-b"
  });

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.applied.length, 0);
  assert.equal((await store.get("blocks", entityId)).value, "edição B");
  assert.equal((await store.get("outbox", mutationId)).status, "pending");
});

test("resolver conflito pelo remoto aplica a linha canônica e encerra a mutação antiga", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const entityId = uuid(90);
  const mutationId = uuid(91);
  const conflictId = uuid(92);
  await store.put("blocks", { id: entityId, courseId: uuid(93), value: "local", revision: 2 });
  await store.put("outbox", {
    mutationId,
    entityType: "blocks",
    entityId,
    courseId: uuid(93),
    status: "conflict",
    operation: "upsert",
    payload: { id: entityId, courseId: uuid(93), value: "local", revision: 2 }
  });
  await store.put("conflicts", {
    id: conflictId,
    entityType: "blocks",
    entityId,
    courseId: uuid(93),
    mutationId,
    status: "open",
    localRow: { id: entityId, courseId: uuid(93), value: "local", revision: 2 },
    remoteRow: { id: entityId, courseId: uuid(93), value: "remoto", revision: 3 },
    remoteRevision: 3,
    createdAt: "2026-07-18T18:00:00.000Z"
  });

  const result = await store.resolveConflict(conflictId, "acceptRemote");
  assert.equal(result.conflict.status, "resolved");
  assert.equal((await store.get("blocks", entityId)).value, "remoto");
  assert.equal(await store.get("outbox", mutationId), undefined);
  assert.equal((await store.listConflicts()).length, 0);
});

test("resolver conflito não aplica snapshot remoto mais antigo que a linha atual", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const entityId = uuid(190);
  const courseId = uuid(191);
  const mutationId = uuid(192);
  const conflictId = uuid(193);
  await store.put("blocks", { id: entityId, courseId, value: "atual", revision: 4 });
  await store.put("outbox", {
    mutationId,
    entityType: "blocks",
    entityId,
    courseId,
    status: "conflict",
    operation: "upsert",
    payload: { id: entityId, courseId, value: "local", revision: 2 }
  });
  await store.put("conflicts", {
    id: conflictId,
    entityType: "blocks",
    entityId,
    courseId,
    mutationId,
    status: "open",
    localRow: { id: entityId, courseId, value: "local", revision: 2 },
    remoteRow: { id: entityId, courseId, value: "remoto antigo", revision: 3 },
    remoteRevision: 3,
    createdAt: "2026-07-18T19:00:00.000Z"
  });

  await assert.rejects(
    store.resolveConflict(conflictId, "acceptRemote"),
    /obsoleta/u
  );
  assert.equal((await store.get("blocks", entityId)).value, "atual");
  assert.equal((await store.get("outbox", mutationId)).status, "conflict");
  assert.equal((await store.get("conflicts", conflictId)).status, "open");
});

test("aceitar remoto em replace restaura a árvore anterior e elimina entidades locais fantasma", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(200);
  const microsequenceId = uuid(201);
  const oldCardId = uuid(202);
  const oldBlockId = uuid(203);
  const newCardId = uuid(204);
  const newBlockId = uuid(205);
  const mutationId = uuid(206);
  const removedAt = "2026-07-18T20:00:00.000Z";
  const oldCard = { id: oldCardId, courseId, microsequenceId, revision: 1, deletedAt: null };
  const oldBlock = { id: oldBlockId, courseId, cardId: oldCardId, value: "base", revision: 1, deletedAt: null };
  const newCard = { id: newCardId, courseId, microsequenceId, revision: 1, deletedAt: null };
  const newBlock = { id: newBlockId, courseId, cardId: newCardId, value: "local", revision: 1, deletedAt: null };
  await store.putMany("cards", [{ ...oldCard, deletedAt: removedAt }, newCard]);
  await store.putMany("blocks", [{ ...oldBlock, deletedAt: removedAt }, newBlock]);
  await store.put("microsequences", { id: microsequenceId, courseId, revision: 1, deletedAt: null });
  await store.put("outbox", {
    mutationId,
    sequence: 1,
    entityType: "microsequenceCardReplacement",
    entityId: microsequenceId,
    courseId,
    operation: "replace",
    baseRevision: 1,
    status: "pending",
    payload: {
      courseId,
      microsequenceId,
      fragment: { cards: [newCard], blocks: [newBlock] },
      previousFragment: { cards: [oldCard], blocks: [oldBlock] }
    }
  });
  const remoteBlock = { ...oldBlock, value: "remoto", revision: 2, updatedAt: removedAt };
  const remoteMicrosequence = {
    id: microsequenceId,
    courseId,
    revision: 2,
    status: "ready",
    updatedAt: removedAt,
    deletedAt: null
  };

  const pulled = await store.applyRemotePage({
    changes: [
      { storeName: "blocks", entityId: oldBlockId, operation: "upsert", row: remoteBlock },
      { storeName: "microsequences", entityId: microsequenceId, operation: "upsert", row: remoteMicrosequence }
    ],
    cursor: 30,
    courseId,
    deviceId: "device-composite"
  });
  assert.equal(pulled.conflicts.length, 1);
  assert.equal((await store.get("blocks", newBlockId)).value, "local");
  const conflict = (await store.listConflicts())[0];
  assert.equal(conflict.entityType, "microsequenceCardReplacement");
  assert.equal(conflict.remoteChanges.length, 2);

  await store.resolveConflict(conflict.id, "acceptRemote");
  assert.equal(await store.get("cards", newCardId), undefined);
  assert.equal(await store.get("blocks", newBlockId), undefined);
  assert.equal((await store.get("cards", oldCardId)).deletedAt, null);
  assert.equal((await store.get("blocks", oldBlockId)).value, "remoto");
  assert.equal((await store.get("microsequences", microsequenceId)).revision, 2);
  assert.equal(await store.get("outbox", mutationId), undefined);
});

test("colisão natural remapeia UUID legado para a identidade canônica", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const localId = uuid(220);
  const canonicalId = uuid(221);
  const cardProgressId = uuid(222);
  const mutationId = uuid(223);
  const conflictId = uuid(224);
  const courseId = uuid(225);
  const lessonId = uuid(226);
  const localRow = {
    id: localId,
    courseId,
    lessonId,
    userId: uuid(227),
    pathKey: "course::module::lesson",
    revision: 1,
    deletedAt: null
  };
  const remoteRow = {
    ...localRow,
    id: canonicalId,
    revision: 3,
    updatedAt: "2026-07-18T22:00:00.000Z"
  };
  await store.put("lessonProgress", localRow);
  await store.put("cardProgress", {
    id: cardProgressId,
    courseId,
    lessonId,
    lessonProgressId: localId,
    cardId: uuid(228),
    userId: localRow.userId,
    revision: 1,
    deletedAt: null
  });
  await store.put("outbox", {
    mutationId,
    sequence: 1,
    courseId,
    entityType: "lessonProgress",
    entityId: localId,
    operation: "upsert",
    baseRevision: 0,
    payload: localRow,
    status: "conflict"
  });
  await store.put("conflicts", {
    id: conflictId,
    courseId,
    entityType: "lessonProgress",
    entityId: localId,
    canonicalEntityId: canonicalId,
    mutationId,
    baseRevision: 0,
    remoteRevision: 3,
    localRow,
    remoteRow,
    status: "open"
  });

  await store.resolveConflict(conflictId, "acceptRemote");

  assert.equal(await store.get("lessonProgress", localId), undefined);
  assert.deepEqual(await store.get("lessonProgress", canonicalId), remoteRow);
  assert.equal((await store.get("cardProgress", cardProgressId)).lessonProgressId, canonicalId);
});

test("snapshot remoto preserva curso quando há outbox, conflito, rejeição ou edição suja", async () => {
  const blockerKinds = ["pending", "conflict", "rejected", "dirty"];
  for (const [offset, blockerKind] of blockerKinds.entries()) {
    const store = await IndexedDbRelationalStore.open(new IDBFactory());
    const courseId = uuid(300 + offset);
    const mutationId = uuid(310 + offset);
    await store.put("courses", {
      id: courseId,
      courseId,
      contractKey: `local-${blockerKind}`,
      title: "Trabalho local",
      revision: 2,
      deletedAt: null
    });
    if (blockerKind === "dirty") {
      await store.putCourseDirtyState(courseId, true);
    } else {
      await store.put("outbox", {
        mutationId,
        sequence: 1,
        courseId,
        entityType: "courses",
        entityId: courseId,
        operation: "upsert",
        baseRevision: 1,
        payload: { id: courseId, courseId, title: "Trabalho local", revision: 2 },
        previousRow: { id: courseId, courseId, title: "Anterior", revision: 1 },
        status: blockerKind
      });
    }
    const result = await store.replaceCourseSnapshot(courseId, {
      courses: [{
        id: courseId,
        courseId,
        contractKey: `remote-${blockerKind}`,
        title: "Remoto",
        revision: 9,
        deletedAt: null
      }]
    }, { uuidFactory: () => uuid(350 + offset) });
    assert.equal(result.status, "reconciliation_required", blockerKind);
    assert.equal((await store.get("courses", courseId)).title, "Trabalho local", blockerKind);
    assert.equal((await store.listRemoteReconciliationRows(courseId)).length, 1, blockerKind);
    assert.equal((await store.listConflicts({ courseId })).at(-1).reason, "local_work_pending");
    store.close();
  }
});

test("bootstrap bloqueado não aplica snapshot parcial nem avança high-water", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const localCourseId = uuid(360);
  const otherCourseId = uuid(361);
  const mutationId = uuid(362);
  await store.put("courses", {
    id: localCourseId, courseId: localCourseId, contractKey: "local", revision: 2, deletedAt: null
  });
  await store.put("outbox", {
    mutationId,
    sequence: 1,
    courseId: localCourseId,
    entityType: "courses",
    entityId: localCourseId,
    operation: "upsert",
    baseRevision: 1,
    payload: { id: localCourseId, courseId: localCourseId, contractKey: "local", revision: 2 },
    status: "pending"
  });
  const result = await store.applyReplicaBootstrap({
    snapshot: {
      courses: [
        { id: localCourseId, courseId: localCourseId, contractKey: "remoto", revision: 3, deletedAt: null },
        { id: otherCourseId, courseId: otherCourseId, contractKey: "outro", revision: 1, deletedAt: null }
      ]
    },
    highWaterSequence: 77,
    deviceId: uuid(363),
    syncStateId: `sync.cursor:${uuid(363)}`,
    uuidFactory: (() => {
      let next = 364;
      return () => uuid(next++);
    })()
  });
  assert.equal(result.status, "reconciliation_required");
  assert.equal((await store.get("courses", localCourseId)).contractKey, "local");
  assert.equal(await store.get("courses", otherCourseId), undefined);
  assert.equal(await store.get("syncState", `sync.cursor:${uuid(363)}`), undefined);
});

test("bootstrap não ressuscita curso tombstonado com exclusão pessoal pendente", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(365);
  const mutationId = uuid(366);
  const deviceId = uuid(367);
  const deletedAt = "2026-07-18T12:00:00.000Z";
  await store.put("courses", {
    id: courseId,
    courseId,
    contractKey: "exclusao-local",
    revision: 3,
    deletedAt
  });
  await store.put("outbox", {
    mutationId,
    sequence: 1,
    courseId,
    entityType: "personalCourseDeletion",
    entityId: courseId,
    operation: "delete",
    baseRevision: 2,
    payload: { courseId, affectedEntities: [] },
    status: "pending",
    createdAt: deletedAt
  });

  const result = await store.applyReplicaBootstrap({
    snapshot: {
      courses: [{
        id: courseId,
        courseId,
        contractKey: "versao-remota",
        revision: 4,
        deletedAt: null
      }]
    },
    highWaterSequence: 79,
    deviceId,
    syncStateId: `sync.cursor:${deviceId}`,
    uuidFactory: () => uuid(368)
  });

  assert.equal(result.status, "reconciliation_required");
  assert.equal((await store.get("courses", courseId)).deletedAt, deletedAt);
  assert.equal((await store.get("outbox", mutationId)).status, "pending");
  assert.equal(await store.get("syncState", `sync.cursor:${deviceId}`), undefined);
  assert.equal((await store.listConflicts({ courseId })).at(-1).reason, "bootstrap_local_work_pending");
});

test("conflito remoto usa primeira mutação causal, não a ordem lexical do UUID", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(370);
  const entityId = uuid(371);
  const firstMutationId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const secondMutationId = "00000000-0000-4000-8000-000000000001";
  await store.put("blocks", { id: entityId, courseId, value: "mais recente", revision: 3, deletedAt: null });
  await store.putMany("outbox", [
    {
      mutationId: firstMutationId,
      sequence: 1,
      courseId,
      entityType: "blocks",
      entityId,
      operation: "upsert",
      baseRevision: 1,
      payload: { id: entityId, courseId, value: "primeira", revision: 2 },
      status: "pending",
      createdAt: "2026-07-18T00:00:00.000Z"
    },
    {
      mutationId: secondMutationId,
      sequence: 2,
      courseId,
      entityType: "blocks",
      entityId,
      operation: "upsert",
      baseRevision: 2,
      payload: { id: entityId, courseId, value: "segunda", revision: 3 },
      status: "pending",
      createdAt: "2026-07-18T00:00:01.000Z"
    }
  ]);
  await store.applyRemotePage({
    changes: [{
      storeName: "blocks",
      entityId,
      courseId,
      revision: 4,
      row: { id: entityId, courseId, value: "remoto", revision: 4, deletedAt: null }
    }],
    cursor: 1,
    uuidFactory: () => uuid(372)
  });
  const conflict = (await store.listConflicts())[0];
  assert.equal(conflict.mutationId, firstMutationId);
  assert.equal((await store.get("outbox", firstMutationId)).status, "conflict");
  assert.equal((await store.get("outbox", secondMutationId)).status, "pending");
  assert.deepEqual(await store.listPendingOutbox(), []);
});

test("revogação limpa toda a árvore quando não há trabalho local", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const userId = uuid(380);
  const courseId = uuid(381);
  const membershipId = uuid(382);
  const moduleId = uuid(383);
  const lessonId = uuid(384);
  await store.putSyncState("replica.userId", userId);
  await store.put("courses", { id: courseId, courseId, contractKey: "revogado", revision: 1, deletedAt: null });
  await store.put("memberships", {
    id: membershipId, courseId, userId, role: "learner", revision: 1, deletedAt: null
  });
  await store.put("modules", { id: moduleId, courseId, position: 0, revision: 1, deletedAt: null });
  await store.put("lessons", {
    id: lessonId, courseId, moduleId, position: 0, revision: 1, deletedAt: null
  });
  await store.put("lessonProgress", {
    id: uuid(385), courseId, lessonId, userId, revision: 1, deletedAt: null
  });
  await store.put("comments", {
    id: uuid(386), courseId, cardId: uuid(387), userId, body: "local", revision: 1, deletedAt: null
  });
  const deletedAt = "2026-07-19T01:00:00.000Z";
  await store.applyRemotePage({
    changes: [{
      storeName: "memberships",
      entityId: membershipId,
      courseId,
      operation: "delete",
      revision: 2,
      deletedAt,
      row: { id: membershipId, courseId, userId, role: "learner", revision: 2, deletedAt }
    }],
    cursor: 20,
    receivedAt: deletedAt
  });
  assert.equal(await store.get("courses", courseId), undefined);
  assert.equal(await store.get("modules", moduleId), undefined);
  assert.equal(await store.get("lessons", lessonId), undefined);
  assert.deepEqual(await store.getAll("lessonProgress"), []);
  assert.deepEqual(await store.getAll("comments"), []);
  assert.equal((await store.get("memberships", membershipId)).deletedAt, deletedAt);
  assert.equal(await store.getSyncState(`revoked.course:${courseId}`), true);
});

test("revogação com mutação pendente oculta membership e preserva trabalho para reconciliação", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const userId = uuid(390);
  const courseId = uuid(391);
  const membershipId = uuid(392);
  const moduleId = uuid(393);
  await store.putSyncState("replica.userId", userId);
  await store.put("courses", { id: courseId, courseId, contractKey: "local", revision: 1, deletedAt: null });
  await store.put("memberships", {
    id: membershipId, courseId, userId, role: "editor", revision: 1, deletedAt: null
  });
  await store.put("modules", { id: moduleId, courseId, title: "trabalho", revision: 2, deletedAt: null });
  await store.put("outbox", {
    mutationId: uuid(394), sequence: 1, courseId, entityType: "modules", entityId: moduleId,
    operation: "upsert", baseRevision: 1,
    payload: { id: moduleId, courseId, title: "trabalho", revision: 2 }, status: "pending"
  });
  const deletedAt = "2026-07-19T02:00:00.000Z";
  await store.applyRemotePage({
    changes: [{
      storeName: "memberships", entityId: membershipId, courseId, operation: "delete", revision: 2,
      deletedAt, row: { id: membershipId, courseId, userId, role: "editor", revision: 2, deletedAt }
    }],
    cursor: 21,
    receivedAt: deletedAt,
    uuidFactory: (() => { let next = 395; return () => uuid(next++); })()
  });
  assert.equal((await store.get("memberships", membershipId)).deletedAt, deletedAt);
  assert.equal((await store.get("modules", moduleId)).title, "trabalho");
  assert.equal((await store.get("outbox", uuid(394))).status, "pending");
  assert.equal((await store.listConflicts({ courseId })).at(-1).reason, "membership_revoked_with_local_work");
});

test("descarte explícito de rejeição restaura a linha anterior e remove descendentes", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(400);
  const blockId = uuid(401);
  const rejectedId = uuid(402);
  const descendantId = uuid(403);
  const previousRow = { id: blockId, courseId, value: "anterior", revision: 1, deletedAt: null };
  await store.put("blocks", { ...previousRow, value: "posterior", revision: 3 });
  await store.putMany("outbox", [
    {
      mutationId: rejectedId, sequence: 1, courseId, entityType: "blocks", entityId: blockId,
      operation: "upsert", baseRevision: 1, previousRow,
      payload: { ...previousRow, value: "rejeitado", revision: 2 }, status: "rejected"
    },
    {
      mutationId: descendantId, sequence: 2, courseId, entityType: "blocks", entityId: blockId,
      operation: "upsert", baseRevision: 2,
      previousRow: { ...previousRow, value: "rejeitado", revision: 2 },
      payload: { ...previousRow, value: "posterior", revision: 3 }, status: "pending"
    }
  ]);
  const result = await store.discardRejectedMutation(rejectedId);
  assert.deepEqual(result.discardedDescendantIds, [descendantId]);
  assert.deepEqual(await store.get("blocks", blockId), previousRow);
  assert.equal(await store.get("outbox", rejectedId), undefined);
  assert.equal(await store.get("outbox", descendantId), undefined);
});

test("manter versão local após conflito reenfileira somente o patch declarado", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(400);
  const cardId = uuid(401);
  const blockId = uuid(402);
  const mutationId = uuid(403);
  const localRow = {
    id: blockId,
    courseId,
    cardId,
    position: 0,
    value: "Texto local",
    prompt: "Contexto preservado",
    revision: 3,
    updatedAt: "2026-07-19T00:01:00.000Z",
    deletedAt: null
  };
  await store.put("blocks", localRow);
  await store.put("outbox", {
    mutationId,
    sequence: 1,
    courseId,
    entityType: "blocks",
    entityId: blockId,
    operation: "upsert",
    baseRevision: 2,
    changedFields: ["value"],
    previousRow: { ...localRow, value: "Texto base", revision: 2 },
    payload: { value: "Texto local" },
    status: "pending",
    createdAt: "2026-07-19T00:01:00.000Z"
  });
  const remoteRow = {
    ...localRow,
    value: "Texto remoto",
    revision: 3,
    updatedAt: "2026-07-19T00:02:00.000Z"
  };
  const remote = await store.applyRemotePage({
    changes: [{
      storeName: "blocks",
      entityId: blockId,
      courseId,
      operation: "upsert",
      revision: 3,
      row: remoteRow
    }],
    cursor: 30,
    receivedAt: "2026-07-19T00:02:00.000Z",
    uuidFactory: () => uuid(404)
  });

  const resolution = await store.resolveConflict(remote.conflicts[0].id, "keepLocal", {
    resolvedAt: "2026-07-19T00:03:00.000Z",
    uuidFactory: () => uuid(405)
  });

  assert.deepEqual(resolution.queuedMutation.changedFields, ["value"]);
  assert.deepEqual(resolution.queuedMutation.payload, { value: "Texto local" });
  assert.equal((await store.get("blocks", blockId)).prompt, "Contexto preservado");
  assert.equal((await store.get("blocks", blockId)).revision, 4);
});

test("aceitar snapshot remoto explicitamente substitui curso e descarta a cadeia local", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = uuid(410);
  const mutationId = uuid(411);
  await store.put("courses", {
    id: courseId, courseId, contractKey: "local", title: "Local", revision: 2, deletedAt: null
  });
  await store.put("outbox", {
    mutationId, sequence: 1, courseId, entityType: "courses", entityId: courseId,
    operation: "upsert", baseRevision: 1,
    payload: { id: courseId, courseId, contractKey: "local", title: "Local", revision: 2 },
    status: "pending"
  });
  const replacement = await store.replaceCourseSnapshot(courseId, {
    courses: [{
      id: courseId, courseId, contractKey: "remoto", title: "Remoto", revision: 8, deletedAt: null
    }]
  }, { uuidFactory: (() => { let next = 412; return () => uuid(next++); })() });
  await store.resolveConflict(replacement.conflict.id, "acceptRemote");
  assert.equal((await store.get("courses", courseId)).title, "Remoto");
  assert.equal(await store.get("outbox", mutationId), undefined);
  assert.deepEqual(await store.listRemoteReconciliationRows(courseId), []);
  assert.equal((await store.get("conflicts", replacement.conflict.id)).status, "resolved");
});

test("manter trabalho após revogação encerra reconciliação e torna a fila rejeitada", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const userId = uuid(420);
  const courseId = uuid(421);
  const membershipId = uuid(422);
  const mutationId = uuid(423);
  await store.putSyncState("replica.userId", userId);
  await store.put("courses", { id: courseId, courseId, contractKey: "local", revision: 1, deletedAt: null });
  await store.put("memberships", {
    id: membershipId, courseId, userId, role: "editor", revision: 1, deletedAt: null
  });
  await store.put("outbox", {
    mutationId, sequence: 1, courseId, entityType: "courses", entityId: courseId,
    operation: "upsert", baseRevision: 1,
    payload: { id: courseId, courseId, contractKey: "local", revision: 2 }, status: "pending"
  });
  const deletedAt = "2026-07-19T03:00:00.000Z";
  const result = await store.applyRemotePage({
    changes: [{
      storeName: "memberships", entityId: membershipId, courseId, operation: "delete", revision: 2,
      deletedAt, row: { id: membershipId, courseId, userId, role: "editor", revision: 2, deletedAt }
    }],
    cursor: 22,
    receivedAt: deletedAt,
    uuidFactory: (() => { let next = 424; return () => uuid(next++); })()
  });
  const conflict = result.conflicts.find((entry) => entry.entityType === "courseSnapshot");
  await store.resolveConflict(conflict.id, "keepLocal");
  assert.equal((await store.get("courses", courseId)).contractKey, "local");
  assert.equal((await store.get("outbox", mutationId)).status, "rejected");
  assert.equal((await store.get("outbox", mutationId)).rejectionReason, "membership_revoked");
  assert.equal((await store.get("conflicts", conflict.id)).status, "resolved");
});
