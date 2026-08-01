import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import {
  createCourse,
  createLesson,
  createMicrosequence,
  createModule,
  replaceMicrosequenceCards
} from "../../src/editor/contractEditor.js";
import {
  deterministicUuid,
  relationalNaturalKey
} from "../../src/persistence/deterministicUuid.js";
import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import { ProjectDocumentDiffer } from "../../src/persistence/ProjectDocumentDiffer.js";
import { ProjectDocumentAssembler } from "../../src/persistence/ProjectDocumentAssembler.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import {
  minimalProjectFixture,
  officialGraphFromDocument,
  openSelectedCourseRepository,
  seedSelectedOfficialCourse,
  TEST_USER_ID
} from "./helpers/leanRelationalFixture.js";
import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";

const FIXED_TIME = "2026-07-20T12:34:56.000Z";

function paragraphCard(id, text) {
  return {
    id,
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: `Card ${id}`,
    text,
    after: ""
  };
}

function buildProject() {
  let project = createEmptyProjectDocument();
  project = createCourse(project, {
    id: "course-a",
    title: "Curso A",
    goal: "Aprender com granularidade."
  });
  project = createModule(project, {
    courseKey: "course-a",
    id: "module-a",
    title: "Módulo A",
    goal: "Organizar a aprendizagem."
  });
  project = createLesson(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    id: "lesson-a",
    title: "Lição A",
    goal: "Estudar duas microssequências."
  });
  for (const [microsequenceKey, cardKey] of [["micro-a", "card-a"], ["micro-b", "card-b"]]) {
    project = createMicrosequence(project, {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      id: microsequenceKey,
      title: `Micros ${microsequenceKey}`
    });
    project = replaceMicrosequenceCards(project, {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey,
      cards: [paragraphCard(cardKey, `Texto de ${cardKey}.`)]
    });
  }
  return project;
}

function cardAt(project, microsequenceIndex = 0) {
  return project.courses[0].modules[0].lessons[0].microsequences[microsequenceIndex].cards[0];
}

function projectReference(cardKey = "card-fixture-minimal-regra") {
  return {
    courseKey: "course-fixture-minimal",
    moduleKey: "module-fixture-minimal",
    lessonKey: "lesson-fixture-minimal",
    microsequenceKey: "micro-fixture-minimal",
    cardKey
  };
}

const FIXTURE_LESSON_PATH =
  "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal";
const FIXTURE_CARD_KEYS = [
  "card-fixture-minimal-regra",
  "card-fixture-minimal-complete"
];

async function persistLessonPrefix(repository, count = 1) {
  await repository.saveProgress({
    version: 1,
    lessons: {
      [FIXTURE_LESSON_PATH]: {
        cursor: count - 1,
        completedCardKeys: FIXTURE_CARD_KEYS.slice(0, count),
        updatedAt: FIXED_TIME
      }
    }
  });
  await repository.flush();
}

test("eco remoto de progresso não recompõe a árvore didática", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  context.after(() => store.close());
  await seedSelectedOfficialCourse(store);
  const delegate = new ProjectDocumentAssembler({ validate: true });
  let assemblyCount = 0;
  const repository = new RelationalProjectRepository({
    store,
    userId: TEST_USER_ID,
    assembler: {
      assemble(rows) {
        assemblyCount += 1;
        return delegate.assemble(rows);
      }
    }
  });
  await repository.initialize();
  await persistLessonPrefix(repository);
  const countBeforeRefresh = assemblyCount;

  const refreshed = await repository.refreshPersonalStateFromReplica();

  assert.equal(assemblyCount, countBeforeRefresh);
  assert.equal(refreshed.documentChanged, false);
  assert.equal(refreshed.progressChanged, false);
  assert.equal(refreshed.studyPathsChanged, false);
});

function identityMapFromGraph(graph) {
  return new Map(
    Object.values(graph)
      .flat()
      .filter((row) => row?.identityKey && row?.id)
      .map((row) => [row.identityKey, row.id])
  );
}

test("identidades naturais do estado pessoal são estáveis entre dispositivos", async () => {
  const lessonKey = relationalNaturalKey("lessonProgress", TEST_USER_ID, "lesson-uuid");
  const cardKey = relationalNaturalKey("cardProgress", TEST_USER_ID, "card-uuid");

  assert.equal(await deterministicUuid(lessonKey), await deterministicUuid(lessonKey));
  assert.equal(await deterministicUuid(cardKey), await deterministicUuid(cardKey));
  assert.notEqual(await deterministicUuid(lessonKey), await deterministicUuid(cardKey));
  assert.match(
    await deterministicUuid(lessonKey),
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
  );
});

test("changedFields incompleto é rejeitado antes de divergir IndexedDB e servidor", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  context.after(() => store.close());
  const previous = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerId: TEST_USER_ID,
    title: "Trilha anterior",
    position: 0,
    updatedAt: FIXED_TIME,
    deletedAt: null
  };
  await store.put("studyPaths", previous);
  const mutations = new DomainMutationService({ store });

  await assert.rejects(
    () => mutations.applyMutations([{
      storeName: "studyPaths",
      entityId: previous.id,
      operation: "upsert",
      previousRow: previous,
      nextRow: { ...previous, title: "Trilha nova", position: 1 },
      changedFields: ["title"]
    }]),
    /changedFields omite campos realmente alterados.*position/u
  );

  assert.deepEqual(await store.get("studyPaths", previous.id), previous);
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("campos auxiliares locais ausentes na réplica não bloqueiam o progresso", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  context.after(() => store.close());
  const previousLocal = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: TEST_USER_ID,
    courseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    lessonId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    cursor: 0,
    completedAt: null,
    updatedAt: FIXED_TIME,
    deletedAt: null
  };
  await store.put("lessonProgress", previousLocal);
  const previousInMemory = {
    ...previousLocal,
    moduleId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    pathKey: "curso::modulo::licao"
  };
  const next = {
    ...previousInMemory,
    cursor: 1,
    updatedAt: "2026-07-20T12:35:56.000Z"
  };
  const mutations = new DomainMutationService({
    store,
    clock: () => new Date("2026-07-20T12:35:56.000Z")
  });

  const result = await mutations.applyMutations([{
    storeName: "lessonProgress",
    entityId: previousLocal.id,
    courseId: previousLocal.courseId,
    operation: "upsert",
    previousRow: previousInMemory,
    nextRow: next,
    changedFields: ["cursor"]
  }]);

  assert.deepEqual(result.outboxEntries[0].changedFields, [
    "completedAt",
    "cursor"
  ]);
  assert.equal(result.outboxEntries[0].payload.moduleId, undefined);
  assert.equal(result.outboxEntries[0].payload.pathKey, undefined);
  assert.equal((await store.get("lessonProgress", previousLocal.id)).pathKey, next.pathKey);
});

test("alterar um texto gera somente uma mutação granular do bloco", () => {
  const previous = buildProject();
  const next = structuredClone(previous);
  cardAt(next).text = "Texto alterado sem regravar o card.";

  const result = new ProjectDocumentDiffer().diff(previous, next);

  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].storeName, "blocks");
  assert.equal(result.mutations[0].operation, "upsert");
  assert.deepEqual(result.mutations[0].changedFields, ["value"]);
});

test("renomear a chave pública de um card preserva sua identidade e a dos filhos", () => {
  const differ = new ProjectDocumentDiffer();
  const previous = buildProject();
  const previousRows = differ.normalize(previous);
  const previousCard = previousRows.cards.find((row) => row.contractKey === "card-a");
  const previousBlock = previousRows.blocks.find((row) => row.cardId === previousCard.id);
  const next = structuredClone(previous);
  cardAt(next).id = "card-renamed";

  const result = differ.diff(previous, next, { previousRows });
  const nextCard = result.nextRows.cards.find((row) => row.contractKey === "card-renamed");
  const nextBlock = result.nextRows.blocks.find((row) => row.cardId === nextCard.id);

  assert.equal(nextCard.id, previousCard.id);
  assert.equal(nextBlock.id, previousBlock.id);
  assert.deepEqual(
    result.mutations.map((mutation) => [mutation.storeName, mutation.operation]),
    [["cards", "upsert"], ["blocks", "upsert"]]
  );
});

test("substituição escopada alcança somente cards e filhos da microssequência alvo", () => {
  const previous = buildProject();
  const next = replaceMicrosequenceCards(previous, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cards: [paragraphCard("card-new", "Novo conteúdo.")]
  });

  const result = new ProjectDocumentDiffer().replaceMicrosequenceCards(
    previous,
    next,
    "micro-a"
  );

  assert.deepEqual(
    new Set(result.mutations.map((mutation) => mutation.storeName)),
    new Set(["cards", "blocks"])
  );
  result.mutations.forEach((mutation) => {
    const identityKey = mutation.previousRow?.identityKey || mutation.nextRow?.identityKey;
    assert.match(identityKey, /\/micro:micro-a\//u);
    assert.doesNotMatch(identityKey, /\/micro:micro-b\//u);
  });
});

test("repositório monta somente cursos oficiais selecionados", async (context) => {
  const indexedDb = new IDBFactory();
  const { repository, store, selection } = await openSelectedCourseRepository(indexedDb);
  context.after(() => store.close());

  assert.deepEqual(repository.loadProject(), minimalProjectFixture);
  assert.equal(repository.loadProject().courses.length, 1);

  await store.delete("courseSelections", selection.id);
  const removed = await repository.refreshFromReplica();
  assert.equal(removed.documentChanged, true);
  assert.deepEqual(repository.loadProject(), createEmptyProjectDocument());

  await store.put("courseSelections", selection);
  const restored = await repository.refreshFromReplica();
  assert.equal(restored.documentChanged, true);
  assert.deepEqual(repository.loadProject(), minimalProjectFixture);
});

test("retomada, revisão e comentário persistem como estado corrente enxuto", async (context) => {
  const { repository, store } = await openSelectedCourseRepository(new IDBFactory(), {
    clock: () => new Date(FIXED_TIME)
  });
  context.after(() => store.close());
  const reference = projectReference();
  const resolved = repository.resolveCardReference(reference);

  await persistLessonPrefix(repository);
  await repository.setCardReviewMark(reference, true);
  await repository.saveCommentForPath(reference, {
    category: "possible_error",
    body: "  Comentário pessoal.  "
  });
  await repository.flush();

  const [lessonRows, cardRows, commentRows, outbox] = await Promise.all([
    store.getAll("lessonProgress"),
    store.getAll("cardProgress"),
    store.getAll("comments"),
    store.getAll("outbox")
  ]);
  assert.equal(lessonRows.length, 1);
  assert.equal(cardRows.length, 1);
  assert.equal(commentRows.length, 1);
  assert.equal(cardRows[0].cardId, resolved.cardId);
  assert.equal(cardRows[0].completedAt, FIXED_TIME);
  assert.equal(cardRows[0].reviewMarkedAt, FIXED_TIME);
  assert.equal(cardRows[0].updatedAt, FIXED_TIME);
  assert.equal(commentRows[0].body, "Comentário pessoal.");
  assert.equal(commentRows[0].category, "possible_error");
  assert.equal(commentRows[0].status, "open");
  assert.equal(commentRows[0].updatedAt, FIXED_TIME);
  assert.deepEqual(
    new Set(outbox.map((row) => row.entityType)),
    new Set(["lessonProgress", "cardProgress", "comments"])
  );
  assert.equal(outbox.filter((row) => row.operation === "insert").length, 3);
  assert.equal(outbox.filter((row) => row.operation === "update").length, 1);
  assert.deepEqual(
    outbox.find((row) => row.entityType === "lessonProgress").changedFields,
    ["cursor", "completedAt"]
  );
  assert.deepEqual(
    outbox.find((row) => row.entityType === "cardProgress").changedFields,
    ["completedAt", "reviewMarkedAt"]
  );
  assert.deepEqual(
    outbox.find((row) => row.entityType === "comments").changedFields,
    ["category", "body"]
  );
  assert.ok(outbox.every((row) => !Object.hasOwn(row, "baseRevision")));
  assert.ok(outbox.every((row) => !Object.hasOwn(row.payload, "completedCardKeys")));
  const remoteFields = {
    lessonProgress: new Set([
      "courseId", "selectionId", "lessonId", "cursor", "completedAt"
    ]),
    cardProgress: new Set([
      "courseId", "selectionId", "cardId", "completedAt", "reviewMarkedAt"
    ]),
    comments: new Set([
      "courseId", "selectionId", "cardId", "courseKey", "moduleKey",
      "lessonKey", "microsequenceKey", "cardKey", "cardTitle", "category", "body"
    ])
  };
  outbox.forEach((row) => {
    assert.ok(Object.keys(row.payload).every((fieldName) =>
      remoteFields[row.entityType].has(fieldName)
    ));
  });
  const commentMutation = outbox.find((row) => row.entityType === "comments");
  assert.equal(commentMutation.payload.courseId, resolved.courseId);
  assert.equal(commentMutation.payload.cardId, resolved.cardId);

  const pathKey = "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal";
  assert.deepEqual(repository.loadProgress().lessons[pathKey], {
    cursor: 0,
    completedCardKeys: ["card-fixture-minimal-regra"],
    updatedAt: FIXED_TIME
  });
  assert.equal(repository.loadCommentForPath(reference).body, "Comentário pessoal.");
  assert.equal(repository.loadCommentForPath(reference).category, "possible_error");
  assert.deepEqual(repository.loadReviewItems().map((item) => ({
    title: item.title,
    reviewMarkedAt: item.reviewMarkedAt,
    entityPath: item.entityPath
  })), [{
    title: "Regra central",
    reviewMarkedAt: FIXED_TIME,
    entityPath: [
      "course-fixture-minimal", "module-fixture-minimal", "lesson-fixture-minimal",
      "micro-fixture-minimal", "card-fixture-minimal-regra"
    ]
  }]);
  assert.deepEqual(repository.loadPersonalObservationItems().map((item) => ({
    title: item.title,
    category: item.category,
    body: item.body,
    updatedAt: item.updatedAt,
    entityPath: item.entityPath
  })), [{
    title: "Regra central",
    category: "possible_error",
    body: "Comentário pessoal.",
    updatedAt: FIXED_TIME,
    entityPath: [
      "course-fixture-minimal", "module-fixture-minimal", "lesson-fixture-minimal",
      "micro-fixture-minimal", "card-fixture-minimal-regra"
    ]
  }]);
});

test("marcar outro card para rever não avança o prefixo concluído da lição", async (context) => {
  const { repository, store } = await openSelectedCourseRepository(new IDBFactory(), {
    clock: () => new Date(FIXED_TIME)
  });
  context.after(() => store.close());
  const first = projectReference("card-fixture-minimal-regra");
  const second = projectReference("card-fixture-minimal-complete");

  await persistLessonPrefix(repository);
  await repository.setCardReviewMark(second, true);
  await repository.flush();

  const firstReference = repository.resolveCardReference(first);
  const lessonRow = repository.loadLessonProgress(firstReference.lessonId);
  assert.equal(lessonRow.cursor, 0);
  assert.equal(lessonRow.completedAt, null);
  assert.deepEqual(repository.loadProgress().lessons[
    FIXTURE_LESSON_PATH
  ].completedCardKeys, ["card-fixture-minimal-regra"]);
});

test("repositório rejeita estado pessoal rotulado com outra conta", async (context) => {
  const { repository, store } = await openSelectedCourseRepository(new IDBFactory());
  context.after(() => store.close());
  const reference = projectReference();
  const resolved = repository.resolveCardReference(reference);
  const otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const shared = {
    userId: otherUserId,
    courseId: resolved.courseId,
    selectionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  };

  assert.throws(() => repository.saveLessonProgress({
    ...shared,
    lessonId: resolved.lessonId
  }), /usuário autenticado/u);
  assert.throws(() => repository.saveCardProgress({
    ...shared,
    cardId: resolved.cardId
  }), /usuário autenticado/u);
  assert.throws(() => repository.saveComment({
    ...shared,
    cardId: resolved.cardId,
    category: "observation",
    body: "Não deve entrar."
  }), /usuário autenticado/u);
  await assert.rejects(
    repository.saveCommentForPath(reference, {
      category: "observation",
      body: "Não deve entrar."
    }, otherUserId),
    /usuário autenticado/u
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("update pessoal envia a linha pequena completa para recriação LWW", async (context) => {
  const { repository, store, selection } = await openSelectedCourseRepository(new IDBFactory(), {
    clock: () => new Date(FIXED_TIME)
  });
  context.after(() => store.close());
  const resolved = repository.resolveCardReference(projectReference());
  const row = {
    id: "44444444-4444-4444-8444-444444444444",
    selectionId: selection.id,
    userId: TEST_USER_ID,
    courseId: resolved.courseId,
    cardId: resolved.cardId,
    completedAt: null,
    reviewMarkedAt: null
  };

  await repository.saveCardProgress(row);
  await repository.saveCardProgress({ ...row, reviewMarkedAt: FIXED_TIME });
  await repository.flush();

  const mutations = (await store.getAll("outbox"))
    .filter((entry) => entry.entityId === row.id)
    .sort((left, right) => left.sequence - right.sequence);
  assert.equal(mutations.length, 2);
  assert.equal(mutations[0].operation, "insert");
  assert.equal(mutations[1].operation, "update");
  assert.deepEqual(mutations[1].changedFields, [
    "completedAt",
    "reviewMarkedAt"
  ]);
  assert.deepEqual(mutations[1].payload, {
    completedAt: null,
    reviewMarkedAt: FIXED_TIME,
    courseId: resolved.courseId,
    selectionId: selection.id,
    cardId: resolved.cardId
  });
});

test("timestamp PostgreSQL remoto é remontado no contrato como ISO UTC canônico", async (context) => {
  const { repository, store } = await openSelectedCourseRepository(new IDBFactory());
  context.after(() => store.close());
  const resolved = repository.resolveCardReference(projectReference());
  const lessonProgressId = "11111111-1111-4111-8111-111111111111";
  const pathKey = "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal";
  const shared = {
    userId: TEST_USER_ID,
    courseId: resolved.courseId,
    moduleId: resolved.moduleId,
    lessonId: resolved.lessonId,
    pathKey,
    updatedAt: "2026-07-20 09:34:56-03",
    deletedAt: null
  };

  await store.put("lessonProgress", {
    ...shared,
    id: lessonProgressId,
    cursor: 0,
    completedAt: null
  });
  await store.put("cardProgress", {
    ...shared,
    id: "22222222-2222-4222-8222-222222222222",
    lessonProgressId,
    cardId: resolved.cardId,
    cardKey: resolved.cardKey,
    position: 0,
    completedAt: "2026-07-20 09:34:56-03",
    reviewMarkedAt: null
  });
  await repository.refreshFromReplica();

  assert.equal(repository.loadProgress().lessons[pathKey].updatedAt, FIXED_TIME);
});

test("progresso remoto de card encontra a lição pela árvore canônica enxuta", async (context) => {
  const { repository, store, selection } = await openSelectedCourseRepository(new IDBFactory());
  context.after(() => store.close());
  const resolved = repository.resolveCardReference(projectReference());
  const pathKey = "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal";
  const cachedCard = await store.get("cards", resolved.cardId);
  delete cachedCard.lessonId;
  await store.put("cards", cachedCard);

  await store.put("cardProgress", {
    id: "33333333-3333-4333-8333-333333333333",
    selectionId: selection.id,
    userId: TEST_USER_ID,
    courseId: resolved.courseId,
    cardId: resolved.cardId,
    completedAt: "2026-07-20 09:34:56-03",
    reviewMarkedAt: null,
    updatedAt: "2026-07-20 09:34:56-03"
  });
  await repository.refreshFromReplica();

  assert.deepEqual(repository.loadProgress().lessons[pathKey], {
    cursor: 0,
    completedCardKeys: [resolved.cardKey],
    updatedAt: FIXED_TIME
  });
});

test("nova publicação com UUIDs estáveis preserva o progresso pessoal", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  context.after(() => store.close());
  const { graph, course, selection } = await seedSelectedOfficialCourse(store);
  const repository = await RelationalProjectRepository.open({
    store,
    userId: TEST_USER_ID,
    clock: () => new Date(FIXED_TIME)
  });
  const reference = projectReference();
  const originalCardId = repository.resolveCardReference(reference).cardId;
  await persistLessonPrefix(repository);
  await store.acknowledgeOutbox(
    (await store.getAll("outbox")).map((entry) => entry.mutationId)
  );

  const updatedDocument = structuredClone(minimalProjectFixture);
  updatedDocument.courses[0].title = "Fixture Minimal Atualizada";
  updatedDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards[0].text = "Texto oficial atualizado.";
  const updatedGraph = officialGraphFromDocument(updatedDocument, {
    identityMap: identityMapFromGraph(graph)
  });
  assert.equal(updatedGraph.courses[0].id, course.id);
  assert.equal(
    updatedGraph.cards.find((row) => row.contractKey === reference.cardKey).id,
    originalCardId
  );

  await store.replaceOfficialCourseReplica(course.id, updatedGraph, {
    publicationSeq: 2,
    contentHash: "b".repeat(64)
  });
  await store.put("courseSelections", {
    ...selection,
    publicationSeq: 2,
    contentHash: "b".repeat(64),
    updatedAt: "2026-07-20T13:00:00.000Z"
  });
  const refresh = await repository.refreshFromReplica();

  assert.equal(refresh.documentChanged, true);
  assert.equal(repository.loadProject().courses[0].title, "Fixture Minimal Atualizada");
  assert.equal(repository.resolveCardReference(reference).cardId, originalCardId);
  assert.equal(repository.loadCardProgress(originalCardId).completedAt, FIXED_TIME);
  assert.deepEqual(repository.loadProgress().lessons[
    "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal"
  ].completedCardKeys, [reference.cardKey]);
});

test("publicação incompatível preserva trabalho pendente antes de reconciliar o progresso", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  context.after(() => store.close());
  const { graph, course } = await seedSelectedOfficialCourse(store);
  const repository = await RelationalProjectRepository.open({ store, userId: TEST_USER_ID });
  const firstReference = projectReference("card-fixture-minimal-regra");
  const secondReference = projectReference("card-fixture-minimal-complete");
  const firstCardId = repository.resolveCardReference(firstReference).cardId;
  const secondCardId = repository.resolveCardReference(secondReference).cardId;
  await persistLessonPrefix(repository, 2);

  const withNewFirst = structuredClone(minimalProjectFixture);
  const cards = withNewFirst.courses[0].modules[0].lessons[0].microsequences[0].cards;
  cards.forEach((card, index) => { card.position = index + 2; });
  cards.unshift({
    id: "card-fixture-new-first",
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Novo primeiro card",
    text: "Conteúdo acrescentado pela publicação oficial.",
    after: "Continue."
  });
  const identityMap = identityMapFromGraph(graph);
  const insertedGraph = officialGraphFromDocument(withNewFirst, { identityMap });
  await assert.rejects(
    store.replaceOfficialCourseReplica(course.id, insertedGraph, {
      publicationSeq: 2,
      contentHash: "c".repeat(64)
    }),
    (error) => error?.catalogReplicaReconciliationRequired === true &&
      error.mutationIds.length > 0
  );
  assert.equal((await store.getOfficialCourseReplicaState(course.id)).contentHash, "a".repeat(64));

  await store.acknowledgeOutbox(
    (await store.getAll("outbox")).map((entry) => entry.mutationId)
  );
  await store.replaceOfficialCourseReplica(course.id, insertedGraph, {
    publicationSeq: 2,
    contentHash: "c".repeat(64)
  });
  await repository.refreshFromReplica();

  assert.deepEqual(repository.loadProgress(), { version: 1, lessons: {} });
  assert.ok(repository.loadCardProgress(firstCardId));
  assert.ok(repository.loadCardProgress(secondCardId));

  await persistLessonPrefix(repository);

  const onlySecond = structuredClone(minimalProjectFixture);
  onlySecond.courses[0].modules[0].lessons[0].microsequences[0].cards = [
    { ...onlySecond.courses[0].modules[0].lessons[0].microsequences[0].cards[1], position: 1 }
  ];
  const reducedGraph = officialGraphFromDocument(onlySecond, { identityMap });
  await assert.rejects(
    store.replaceOfficialCourseReplica(course.id, reducedGraph, {
      publicationSeq: 3,
      contentHash: "d".repeat(64)
    }),
    (error) => error?.catalogReplicaReconciliationRequired === true &&
      error.mutationIds.length > 0
  );
  assert.ok(repository.loadCardProgress(firstCardId));
  assert.equal((await store.getOfficialCourseReplicaState(course.id)).contentHash, "c".repeat(64));

  const confirmedMutationIds = (await store.getAll("outbox")).map((entry) => entry.mutationId);
  await store.acknowledgeOutbox(confirmedMutationIds);
  await store.replaceOfficialCourseReplica(course.id, reducedGraph, {
    publicationSeq: 3,
    contentHash: "d".repeat(64)
  });
  await repository.refreshFromReplica();

  const pathKey = "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal";
  assert.equal(repository.loadCardProgress(firstCardId), null);
  assert.ok(repository.loadCardProgress(secondCardId));
  assert.deepEqual(repository.loadProgress().lessons[pathKey].completedCardKeys, [
    "card-fixture-minimal-complete"
  ]);
  assert.equal(repository.loadProgress().lessons[pathKey].cursor, 0);
  assert.equal(
    (await store.getAll("outbox")).some((entry) => entry.payload?.cardId === firstCardId),
    false
  );
});

test("IndexedDB não persiste projeto, progresso ou comentários como documentos", async (context) => {
  const { repository, store } = await openSelectedCourseRepository(new IDBFactory(), {
    clock: () => new Date(FIXED_TIME)
  });
  context.after(() => store.close());
  await persistLessonPrefix(repository);
  await repository.saveCommentForPath(projectReference(), {
    category: "observation",
    body: "Linha relacional."
  });
  await repository.flush();

  assert.equal(store.objectStoreNames.includes("projectDocuments"), false);
  assert.equal(store.objectStoreNames.includes("progressDocuments"), false);
  assert.equal(store.objectStoreNames.includes("commentDocuments"), false);
  assert.equal((await store.getAll("courses")).length, 1);
  assert.equal((await store.getAll("lessonProgress")).length, 1);
  assert.equal((await store.getAll("cardProgress")).length, 1);
  assert.equal((await store.getAll("comments")).length, 1);

  const persistedRows = await store.readStores(store.objectStoreNames);
  for (const rows of Object.values(persistedRows)) {
    for (const row of rows) {
      assert.equal(Object.hasOwn(row, "projectDocument"), false);
      assert.equal(Object.hasOwn(row, "progressDocument"), false);
      assert.equal(Object.hasOwn(row, "commentsByCard"), false);
    }
  }
});
