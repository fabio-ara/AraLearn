import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import {
  IndexedDbRelationalStore,
  LocalCourseDraftChangedError
} from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  minimalProjectFixture,
  seedSelectedOfficialCourse,
  TEST_USER_ID
} from "./helpers/leanRelationalFixture.js";

const FIXED_TIME = "2026-07-22T12:00:00.000Z";

async function openEditableRepository(
  indexedDb,
  { courseOrigin = "catalog", document = minimalProjectFixture } = {}
) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  const { course } = await seedSelectedOfficialCourse(store, {
    courseOrigin,
    document
  });
  const repository = await RelationalProjectRepository.open({
    store,
    userId: TEST_USER_ID,
    clock: () => new Date(FIXED_TIME)
  });
  return { store, repository, course };
}

function clonedMicrosequence(source, id, title) {
  return {
    ...structuredClone(source),
    id,
    title,
    dependsOn: [source.id],
    cards: (source.cards || []).map((card, index) => ({
      ...structuredClone(card),
      id: `${id}-card-${index + 1}`,
      position: index + 1
    }))
  };
}

function singleCardMicrosequence(source, id, title) {
  const cloned = clonedMicrosequence(source, id, title);
  cloned.cards = cloned.cards.slice(0, 1);
  return cloned;
}

function projectWithTwoMicrosequences() {
  const project = structuredClone(minimalProjectFixture);
  const lesson = project.courses[0].modules[0].lessons[0];
  lesson.microsequences.push(
    clonedMicrosequence(
      lesson.microsequences[0],
      "micro-fixture-second",
      "Segunda microssequência"
    )
  );
  return project;
}

test("fila e reversão da assistência ocupam um único registro local por curso", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const first = {
    contract: "aralearn.card-assistance-local-state.v1",
    queue: [{ requestId: "request-a" }],
    undo: null
  };
  await repository.saveCardAssistanceLocalState(course.id, first);
  assert.deepEqual(await repository.loadCardAssistanceLocalState(course.id), first);

  const second = {
    contract: first.contract,
    queue: [],
    undo: { contract: "aralearn.card-edit-undo.v1", microsequenceKey: "micro-a" }
  };
  await repository.saveCardAssistanceLocalState(course.id, second);
  assert.deepEqual(await repository.loadCardAssistanceLocalState(course.id), second);
  assert.equal(
    (await store.getAll("syncState"))
      .filter((row) => row.id === `authoring.cardAssistance:${course.id}`).length,
    1
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

for (const { courseOrigin, expectedRole } of [
  { courseOrigin: "catalog", expectedRole: "learner" },
  { courseOrigin: "private", expectedRole: "owner" }
]) {
  test(`persistência da assistência aplica localmente em curso ${courseOrigin}`, async (context) => {
    const { store, repository, course } = await openEditableRepository(
      new IDBFactory(),
      { courseOrigin }
    );
    context.after(() => store.close());
    if (courseOrigin === "catalog") repository.setCatalogManagementAllowed(true);
    assert.deepEqual(repository.coursePermissions(course.id), {
      role: courseOrigin === "catalog" ? "editor" : expectedRole,
      canEdit: true,
      canDelete: true,
      requiresFork: false
    });
    const edited = repository.loadProject();
    const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
    microsequence.status = "generated";
    microsequence.cards[0].text = "Texto alterado pela assistência de card.";

    await repository.saveMicrosequenceGeneration(edited, microsequence.id);

    assert.deepEqual(await store.getAll("outbox"), []);
    const saved = repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences[0];
    assert.equal(saved.status, "generated");
    assert.equal(saved.cards[0].text, "Texto alterado pela assistência de card.");
    assert.equal(repository.loadProject().courses[0].title, minimalProjectFixture.courses[0].title);
    const localDraft = await repository.getLocalCourseDraft(course.id);
    assert.equal(localDraft.status, "dirty");
    assert.equal(localDraft.courseKey, minimalProjectFixture.courses[0].id);
    assert.equal(localDraft.courseOrigin, courseOrigin);
  });
}

test("aplicar prévia de bloco composto grava somente a linha do bloco alterado", async (context) => {
  const { store, repository } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  const originalCard = microsequence.cards[0];
  microsequence.cards[0] = {
    id: originalCard.id,
    position: originalCard.position,
    resource: "composite",
    kind: originalCard.kind,
    exercise: originalCard.exercise,
    title: originalCard.title,
    blocks: [
      { id: "paragraph-1", kind: "paragraph", value: originalCard.text },
      { id: "paragraph-2", kind: "paragraph", value: "Bloco preservado." }
    ],
    after: originalCard.after
  };
  await repository.saveMicrosequenceGeneration(edited, microsequence.id);
  await store.transaction(["outbox"], "readwrite", (transaction) => transaction.clear("outbox"));

  const changed = repository.loadProject();
  const target = changed.courses[0].modules[0].lessons[0].microsequences[0];
  target.cards[0].blocks[0].value = "Somente este bloco mudou.";
  await repository.saveMicrosequenceGeneration(changed, target.id);

  assert.deepEqual(await store.getAll("outbox"), []);
  assert.equal(
    repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences[0]
      .cards[0].blocks[0].value,
    "Somente este bloco mudou."
  );
});

test("persistência atômica falha antes do commit se outra entidade também mudou", async (context) => {
  const { store, repository } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0].text = "Texto local válido.";
  edited.courses[0].title = "Alteração fora do escopo";

  assert.throws(
    () => repository.saveMicrosequenceGeneration(edited, microsequence.id),
    /entidades externas/u
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

for (const courseOrigin of ["catalog", "private"]) {
  test(`criação atômica insere microssequência no meio do curso ${courseOrigin}`, async (context) => {
    const { store, repository, course } = await openEditableRepository(
      new IDBFactory(),
      {
        courseOrigin,
        document: projectWithTwoMicrosequences()
      }
    );
    context.after(() => store.close());
    const edited = repository.loadProject();
    const lesson = edited.courses[0].modules[0].lessons[0];
    const created = singleCardMicrosequence(
      lesson.microsequences[0],
      "micro-fixture-created",
      "Microssequência criada"
    );
    lesson.microsequences.splice(1, 0, created);

    await repository.saveMicrosequenceCreation(edited, {
      lessonId: lesson.id,
      microsequenceId: created.id
    });

    const savedLesson = repository.loadProject()
      .courses[0].modules[0].lessons[0];
    assert.deepEqual(
      savedLesson.microsequences.map((microsequence) => microsequence.id),
      [
        "micro-fixture-minimal",
        "micro-fixture-created",
        "micro-fixture-second"
      ]
    );
    assert.deepEqual(await store.getAll("outbox"), []);
    const localDraft = await repository.getLocalCourseDraft(course.id);
    assert.equal(localDraft.status, "dirty");
    assert.equal(localDraft.courseOrigin, courseOrigin);
  });
}

test("reversão atômica remove somente a microssequência recém-criada", async (context) => {
  const { store, repository } = await openEditableRepository(
    new IDBFactory(),
    { document: projectWithTwoMicrosequences() }
  );
  context.after(() => store.close());
  const before = repository.loadProject();
  const beforeIds = before.courses[0].modules[0].lessons[0].microsequences
    .map((microsequence) => microsequence.id);
  const edited = structuredClone(before);
  const lesson = edited.courses[0].modules[0].lessons[0];
  const created = singleCardMicrosequence(
    lesson.microsequences[0],
    "micro-fixture-created",
    "Microssequência criada"
  );
  lesson.microsequences.splice(1, 0, created);
  await repository.saveMicrosequenceCreation(edited, {
    lessonId: lesson.id,
    microsequenceId: created.id
  });

  const guard = await repository.createLocalCourseDraftGuard(before.courses[0].id);
  const reverted = repository.loadProject();
  const revertedLesson = reverted.courses[0].modules[0].lessons[0];
  revertedLesson.microsequences.splice(
    revertedLesson.microsequences.findIndex((item) => item.id === created.id),
    1
  );
  await repository.saveMicrosequenceRemoval(reverted, {
    lessonId: revertedLesson.id,
    microsequenceId: created.id,
    expectedLocalDraftRevision: guard.expectedRevision
  });

  assert.deepEqual(
    repository.loadProject().courses[0].modules[0].lessons[0].microsequences
      .map((microsequence) => microsequence.id),
    beforeIds
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("criação atômica rejeita alteração de irmão ou de entidade externa", async (context) => {
  const { store, repository } = await openEditableRepository(
    new IDBFactory(),
    { document: projectWithTwoMicrosequences() }
  );
  context.after(() => store.close());
  const edited = repository.loadProject();
  const lesson = edited.courses[0].modules[0].lessons[0];
  const created = singleCardMicrosequence(
    lesson.microsequences[0],
    "micro-fixture-created",
    "Microssequência criada"
  );
  lesson.microsequences.splice(1, 0, created);
  lesson.microsequences[2].title = "Alteração lateral indevida";

  assert.throws(
    () => repository.saveMicrosequenceCreation(edited, {
      lessonId: lesson.id,
      microsequenceId: created.id
    }),
    /inserção da microssequência tentou alterar entidades externas/u
  );
  assert.deepEqual(
    repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences
      .map((microsequence) => microsequence.id),
    ["micro-fixture-minimal", "micro-fixture-second"]
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("criação em nova microssequência rejeita mais de um card antes do commit", async (context) => {
  const { store, repository } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const edited = repository.loadProject();
  const lesson = edited.courses[0].modules[0].lessons[0];
  const created = singleCardMicrosequence(
    lesson.microsequences[0],
    "micro-fixture-created",
    "Microssequência criada"
  );
  created.cards.push({
    ...structuredClone(created.cards[0]),
    id: "micro-fixture-created-card-2",
    position: 2
  });
  lesson.microsequences.push(created);

  assert.throws(
    () => repository.saveMicrosequenceCreation(edited, {
      lessonId: lesson.id,
      microsequenceId: created.id
    }),
    /exatamente um card/u
  );
  assert.equal(
    repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences.length,
    1
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("criação em nova microssequência confere o card autorizado pela prévia", async (context) => {
  const { store, repository } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const edited = repository.loadProject();
  const lesson = edited.courses[0].modules[0].lessons[0];
  const created = singleCardMicrosequence(
    lesson.microsequences[0],
    "micro-fixture-created",
    "Microssequência criada"
  );
  lesson.microsequences.push(created);
  const unauthorizedCard = structuredClone(created.cards[0]);
  unauthorizedCard.title = "Card diferente do autorizado";

  assert.throws(
    () => repository.saveMicrosequenceCreation(edited, {
      lessonId: lesson.id,
      microsequenceId: created.id,
      expectedCreatedCard: unauthorizedCard
    }),
    /diverge do card autorizado/u
  );
  assert.equal(
    repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences.length,
    1
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("reparo local preserva curso de catálogo dentro da Trilha", async (context) => {
  const { store, repository, course } = await openEditableRepository(
    new IDBFactory(),
    { courseOrigin: "catalog" }
  );
  context.after(() => store.close());
  const path = await repository.createStudyPath("Minha trilha");
  await repository.addCourseToStudyPath(path.id, course.id);
  await store.transaction(
    ["outbox"],
    "readwrite",
    (transaction) => transaction.clear("outbox")
  );

  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0].text = "Reparo local na cópia selecionada do catálogo.";
  await repository.saveMicrosequenceGeneration(edited, microsequence.id);

  const paths = repository.loadStudyPaths();
  assert.equal(paths.length, 1);
  assert.equal(paths[0].title, "Minha trilha");
  assert.deepEqual(
    paths[0].courses.map((item) => item.courseId),
    [minimalProjectFixture.courses[0].id]
  );
  assert.deepEqual(await store.getAll("outbox"), []);
  assert.equal(
    repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences[0].cards[0].text,
    "Reparo local na cópia selecionada do catálogo."
  );
});

for (const courseOrigin of ["catalog", "private"]) {
  test(`CAS transacional recusa prévia obsoleta entre duas abas em curso ${courseOrigin}`, async (context) => {
    const indexedDb = new IDBFactory();
    const seedStore = await IndexedDbRelationalStore.open(indexedDb, {
      userId: TEST_USER_ID
    });
    const { course } = await seedSelectedOfficialCourse(seedStore, {
      courseOrigin,
      document: minimalProjectFixture
    });
    const storeA = await IndexedDbRelationalStore.open(indexedDb, {
      userId: TEST_USER_ID
    });
    const storeB = await IndexedDbRelationalStore.open(indexedDb, {
      userId: TEST_USER_ID
    });
    const realMutationsB = new DomainMutationService({ store: storeB });
    let signalBReachedMutation;
    let releaseBMutation;
    const bReachedMutation = new Promise((resolve) => {
      signalBReachedMutation = resolve;
    });
    const bMutationReleased = new Promise((resolve) => {
      releaseBMutation = resolve;
    });
    const mutationServiceB = {
      async applyMutations(...args) {
        signalBReachedMutation();
        await bMutationReleased;
        return realMutationsB.applyMutations(...args);
      },
      applyRowChange(...args) {
        return realMutationsB.applyRowChange(...args);
      }
    };
    const repositoryA = await RelationalProjectRepository.open({
      store: storeA,
      userId: TEST_USER_ID
    });
    const repositoryB = await RelationalProjectRepository.open({
      store: storeB,
      userId: TEST_USER_ID,
      mutationService: mutationServiceB
    });
    context.after(() => {
      seedStore.close();
      storeA.close();
      storeB.close();
    });

    const guardA = repositoryA.createLocalCourseDraftGuard(course.id);
    const guardB = repositoryB.createLocalCourseDraftGuard(course.id);
    assert.equal(guardA.expectedRevision, null);
    assert.equal(guardB.expectedRevision, null);

    const projectB = repositoryB.loadProject();
    const microsequenceB =
      projectB.courses[0].modules[0].lessons[0].microsequences[0];
    microsequenceB.cards[0].text = "Alteração obsoleta da aba B.";
    const pendingB = repositoryB.saveMicrosequenceGeneration(
      projectB,
      microsequenceB.id,
      { expectedLocalDraftRevision: guardB.expectedRevision }
    );
    await bReachedMutation;

    const projectA = repositoryA.loadProject();
    const microsequenceA =
      projectA.courses[0].modules[0].lessons[0].microsequences[0];
    microsequenceA.cards[0].text = "Alteração confirmada da aba A.";
    await repositoryA.saveMicrosequenceGeneration(
      projectA,
      microsequenceA.id,
      { expectedLocalDraftRevision: guardA.expectedRevision }
    );
    const draftA = await storeA.getLocalCourseDraft(course.id);
    releaseBMutation();

    await assert.rejects(
      pendingB,
      (error) => error instanceof LocalCourseDraftChangedError &&
        error.expectedRevision === null &&
        error.actualRevision === draftA.revision
    );
    await repositoryA.refreshFromReplica();

    assert.equal(
      repositoryA.loadProject()
        .courses[0].modules[0].lessons[0].microsequences[0].cards[0].text,
      "Alteração confirmada da aba A."
    );
    assert.equal(
      repositoryB.loadProject()
        .courses[0].modules[0].lessons[0].microsequences[0].cards[0].text,
      "Alteração confirmada da aba A."
    );
    assert.equal(
      (await storeA.getLocalCourseDraft(course.id)).revision,
      draftA.revision
    );
    assert.deepEqual(await storeA.getAll("outbox"), []);
    assert.equal(repositoryB.getDurabilityState().status, "saved");
  });
}
