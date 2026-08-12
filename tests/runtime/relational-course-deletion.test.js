import test from "node:test";
import assert from "node:assert/strict";

import { IDBFactory } from "fake-indexeddb";

import {
  OFFICIAL_COURSE_STORE_NAMES,
  IndexedDbRelationalStore
} from "../../src/persistence/IndexedDbRelationalStore.js";
import { createModule } from "../../src/editor/contractEditor.js";
import {
  TEST_USER_ID,
  minimalProjectFixture,
  openSelectedCourseRepository,
  seedSelectedOfficialCourse
} from "./helpers/leanRelationalFixture.js";

function uuid(suffix) {
  return `10000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function sequentialUuidFactory(first) {
  let next = first;
  return () => uuid(next++);
}

function secondCourseDocument() {
  const document = structuredClone(minimalProjectFixture);
  document.courses[0].id = "course-fixture-secondary";
  document.courses[0].title = "Fixture secundária";
  return document;
}

test("remoção remota limpa somente a seleção e a réplica oficial daquele curso", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  context.after(() => store.close());
  const first = await seedSelectedOfficialCourse(store, {
    userId: TEST_USER_ID,
    uuidFactory: sequentialUuidFactory(1)
  });
  const second = await seedSelectedOfficialCourse(store, {
    userId: TEST_USER_ID,
    document: secondCourseDocument(),
    uuidFactory: sequentialUuidFactory(1000),
    publicationSeq: 2,
    contentHash: "b".repeat(64)
  });
  const now = "2026-07-20T12:00:00.000Z";

  await store.putMany("outbox", [{
    mutationId: uuid(2008),
    courseId: second.course.id,
    entityType: "courseSelections",
    entityId: second.selection.id,
    operation: "upsert",
    payload: { courseId: second.course.id },
    status: "pending",
    createdAt: now,
    updatedAt: now
  }]);

  await store.applyRemotePage({
    changes: [{
      storeName: "courseSelections",
      entityId: first.selection.id,
      courseId: first.course.id,
      operation: "delete",
      row: {
        ...first.selection,
        deletedAt: "2026-07-20T12:05:00.000Z"
      }
    }],
    cursor: 41,
    deviceId: uuid(2009)
  });

  assert.equal(await store.get("courseSelections", first.selection.id), undefined);
  assert.ok(await store.get("courseSelections", second.selection.id));
  for (const storeName of OFFICIAL_COURSE_STORE_NAMES) {
    const firstRows = storeName === "courses"
      ? [await store.get(storeName, first.course.id)].filter(Boolean)
      : await store.getAllByIndex(storeName, "byCourseId", first.course.id);
    assert.deepEqual(firstRows, [], `${storeName} ainda contém a réplica removida`);
  }
  assert.ok(await store.get("courses", second.course.id));
  assert.deepEqual(
    (await store.getAll("outbox")).map((row) => row.courseId),
    [second.course.id]
  );

  // A remoção é apenas da seleção do usuário. O grafo oficial de origem não é
  // mutado nem transformado em uma operação de exclusão de conteúdo remoto.
  assert.equal(first.graph.courses[0].title, "Fixture Minimal");
  assert.equal(
    (await store.getAll("outbox")).some((row) => OFFICIAL_COURSE_STORE_NAMES.includes(row.entityType)),
    false
  );
});

test("remoção pessoal confirmada descarta seleção, réplica e pendências daquele curso", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId: TEST_USER_ID });
  context.after(() => store.close());
  const seeded = await seedSelectedOfficialCourse(store, {
    userId: TEST_USER_ID,
    uuidFactory: sequentialUuidFactory(3000)
  });
  const mutationId = uuid(4001);
  await store.put("outbox", {
    mutationId,
    courseId: seeded.course.id,
    entityType: "courseSelections",
    entityId: uuid(4002),
    operation: "upsert",
    payload: { courseId: seeded.course.id },
    status: "pending",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z"
  });

  await store.removeOfficialCourseReplica(seeded.course.id, {
    removeSelection: true
  });

  assert.equal(await store.get("courseSelections", seeded.selection.id), undefined);
  assert.equal(await store.get("courses", seeded.course.id), undefined);
  assert.equal(await store.get("outbox", mutationId), undefined);
});

test("administrador edita curso oficial sem alterar a revisão remota até confirmar", async (context) => {
  const authoredAt = "2026-07-20T12:00:00.000Z";
  const { store, repository, course } = await openSelectedCourseRepository(new IDBFactory(), {
    clock: () => new Date(authoredAt)
  });
  context.after(() => store.close());
  repository.setCatalogManagementAllowed(true);
  const edited = repository.loadProject();
  edited.courses[0].title = "Título da área de trabalho";

  assert.deepEqual(repository.coursePermissions(course.id), {
    role: "editor",
    canAuthorContent: true,
    writeTarget: "catalog",
    canOrganizeSelection: true,
    canRemoveSelection: true,
    canDeleteCourse: true,
    canEdit: true,
    canDelete: true,
    requiresFork: false
  });
  await repository.saveProject(edited);
  await repository.saveProject(createModule(repository.loadProject(), {
    courseKey: edited.courses[0].id,
    id: "module-autoria-local",
    title: "Novo módulo"
  }));
  assert.equal((await store.get("courses", course.id)).title, "Título da área de trabalho");
  assert.equal(
    (await store.getAllByIndex("modules", "byCourseId", course.id))
      .some((row) => row.contractKey === "module-autoria-local"),
    true
  );
  const localDraft = await store.getLocalCourseDraft(course.id);
  assert.match(localDraft.revision, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ ...localDraft, revision: undefined }, {
    courseId: course.id,
    status: "dirty",
    revision: undefined,
    basePublicationSeq: 1,
    baseContentHash: "a".repeat(64),
    createdAt: authoredAt,
    updatedAt: authoredAt
  });
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("repositório confirma materialização no workspace sem restaurar publicação antiga", async (context) => {
  const { store, repository, course } = await openSelectedCourseRepository(new IDBFactory(), {
    courseOrigin: "private"
  });
  context.after(() => store.close());
  const edited = repository.loadProject();
  edited.courses[0].title = "Título da composição corrente";
  await repository.saveProject(edited);
  const draft = await repository.getLocalCourseDraft(course.id);
  const workspaceId = uuid(4500);

  const result = await repository.acknowledgeWorkspaceCourseDraft(course.id, {
    expectedLocalDraftRevision: draft.revision,
    workspaceId,
    workspaceRevision: 11
  });

  assert.equal(result.status, "acknowledged");
  assert.equal(result.workspaceId, workspaceId);
  assert.equal(result.workspaceRevision, 11);
  assert.equal(result.courseKey, "course-fixture-minimal");
  assert.equal(result.courseOrigin, "private");
  assert.equal(await repository.getLocalCourseDraft(course.id), null);
  assert.equal(repository.loadProject().courses[0].title, "Título da composição corrente");
});

test("repositório consulta e restaura localDraft sem criar mutação remota", async (context) => {
  const authoredAt = "2026-07-20T12:00:00.000Z";
  const { store, repository, course, graph } = await openSelectedCourseRepository(
    new IDBFactory(),
    { clock: () => new Date(authoredAt) }
  );
  context.after(() => store.close());
  repository.setCatalogManagementAllowed(true);
  const edited = repository.loadProject();
  edited.courses[0].title = "Título local a descartar";
  await repository.saveProject(edited);

  const draft = await repository.getLocalCourseDraft(course.id);
  assert.match(draft.revision, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ ...draft, revision: undefined }, {
    courseId: course.id,
    courseKey: "course-fixture-minimal",
    courseOrigin: "catalog",
    status: "dirty",
    revision: undefined,
    basePublicationSeq: 1,
    baseContentHash: "a".repeat(64),
    createdAt: authoredAt,
    updatedAt: authoredAt
  });

  const restored = await repository.discardLocalCourseDraft(course.id, graph, {
    expectedRevision: draft.revision,
    publicationSeq: 1,
    contentHash: "a".repeat(64),
    receivedAt: "2026-07-20T12:05:00.000Z"
  });

  assert.equal(restored.status, "restored");
  assert.equal(restored.courseOrigin, "catalog");
  assert.equal(repository.loadProject().courses[0].title, "Fixture Minimal");
  assert.equal(await repository.getLocalCourseDraft(course.id), null);
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("permissões usam a origem explícita da seleção privada", async (context) => {
  const { store, repository, course } = await openSelectedCourseRepository(
    new IDBFactory(),
    { courseOrigin: "private" }
  );
  context.after(() => store.close());

  assert.deepEqual(repository.coursePermissions(course.id), {
    role: "owner",
    canAuthorContent: true,
    writeTarget: "private",
    canOrganizeSelection: true,
    canRemoveSelection: true,
    canDeleteCourse: true,
    canEdit: true,
    canDelete: true,
    requiresFork: false
  });
});

test("permissões recusam seleção sem uma origem canônica", async (context) => {
  const { store, repository, course } = await openSelectedCourseRepository(
    new IDBFactory(),
    { courseOrigin: null }
  );
  context.after(() => store.close());

  assert.throws(
    () => repository.coursePermissions(course.id),
    /precisa declarar origem catalog ou private/u
  );
});
