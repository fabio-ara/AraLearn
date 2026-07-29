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

test("remoção remota sem pendências limpa somente a réplica e o estado pessoal daquele curso", async (context) => {
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
  const firstLesson = first.graph.lessons[0];
  const firstCard = first.graph.cards[0];
  const pathId = uuid(2001);
  const pathItemId = uuid(2002);
  const firstProgressId = uuid(2003);
  const firstCardProgressId = uuid(2004);
  const firstCommentId = uuid(2005);
  const secondProgressId = uuid(2006);
  const now = "2026-07-20T12:00:00.000Z";

  await store.putMany("lessonProgress", [{
    id: firstProgressId,
    userId: TEST_USER_ID,
    courseId: first.course.id,
    lessonId: firstLesson.id,
    updatedAt: now
  }, {
    id: secondProgressId,
    userId: TEST_USER_ID,
    courseId: second.course.id,
    lessonId: second.graph.lessons[0].id,
    updatedAt: now
  }]);
  await store.put("cardProgress", {
    id: firstCardProgressId,
    userId: TEST_USER_ID,
    courseId: first.course.id,
    lessonId: firstLesson.id,
    cardId: firstCard.id,
    updatedAt: now
  });
  await store.put("comments", {
    id: firstCommentId,
    userId: TEST_USER_ID,
    courseId: first.course.id,
    cardId: firstCard.id,
    body: "Nota local",
    updatedAt: now
  });
  await store.put("studyPaths", {
    id: pathId,
    ownerId: TEST_USER_ID,
    title: "Estudos",
    position: 0,
    updatedAt: now
  });
  await store.put("studyPathCourses", {
    id: pathItemId,
    ownerId: TEST_USER_ID,
    pathId,
    courseId: first.course.id,
    position: 0,
    updatedAt: now
  });
  await store.putMany("outbox", [{
    mutationId: uuid(2008),
    courseId: second.course.id,
    entityType: "lessonProgress",
    entityId: secondProgressId,
    operation: "upsert",
    payload: { cursor: 0 },
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
  assert.equal(await store.get("lessonProgress", firstProgressId), undefined);
  assert.equal(await store.get("cardProgress", firstCardProgressId), undefined);
  assert.equal(await store.get("comments", firstCommentId), undefined);
  assert.equal(await store.get("studyPathCourses", pathItemId), undefined);
  assert.ok(await store.get("studyPaths", pathId));
  assert.ok(await store.get("lessonProgress", secondProgressId));
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
    entityType: "comments",
    entityId: uuid(4002),
    operation: "upsert",
    payload: { body: "Descartar junto com o curso" },
    status: "pending",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z"
  });

  await store.removeOfficialCourseReplica(seeded.course.id, {
    removePersonalState: true,
    removeSelection: true
  });

  assert.equal(await store.get("courseSelections", seeded.selection.id), undefined);
  assert.equal(await store.get("courses", seeded.course.id), undefined);
  assert.equal(await store.get("outbox", mutationId), undefined);
});

test("curso selecionado usa área de trabalho local sem alterar a revisão remota", async (context) => {
  const authoredAt = "2026-07-20T12:00:00.000Z";
  const { store, repository, course } = await openSelectedCourseRepository(new IDBFactory(), {
    clock: () => new Date(authoredAt)
  });
  context.after(() => store.close());
  const edited = repository.loadProject();
  edited.courses[0].title = "Título da área de trabalho";

  assert.deepEqual(repository.coursePermissions(course.id), {
    role: "learner",
    canEdit: true,
    canDelete: false,
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
  assert.deepEqual(await store.getLocalCourseAuthoringState(course.id), {
    status: "dirty",
    basePublicationSeq: 1,
    baseContentHash: "a".repeat(64),
    createdAt: authoredAt,
    updatedAt: authoredAt
  });
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("learner persiste progresso e comentário em linhas granulares", async (context) => {
  const { store, repository, course } = await openSelectedCourseRepository(new IDBFactory());
  context.after(() => store.close());
  const reference = {
    courseKey: "course-fixture-minimal",
    moduleKey: "module-fixture-minimal",
    lessonKey: "lesson-fixture-minimal",
    microsequenceKey: "micro-fixture-minimal",
    cardKey: "card-fixture-minimal-regra"
  };

  await repository.recordCardView(reference);
  await repository.saveCommentForPath(reference, "Lembrar desta regra.");
  await repository.flush();

  const outbox = await store.listPendingOutbox();
  assert.deepEqual(
    new Set(outbox.map((row) => row.entityType)),
    new Set(["lessonProgress", "cardProgress", "comments"])
  );
  assert.equal(outbox.every((row) => row.courseId === course.id), true);
  assert.equal(outbox.every((row) => !Object.hasOwn(row.payload, "modules")), true);
  assert.equal((await store.getAll("lessonProgress")).length, 1);
  assert.equal((await store.getAll("cardProgress")).length, 1);
  assert.equal((await store.getAll("comments"))[0].body, "Lembrar desta regra.");
  assert.equal((await store.get("courses", course.id)).title, "Fixture Minimal");
});
