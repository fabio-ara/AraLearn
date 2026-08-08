import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  CARD_ASSISTANCE_UNDO_CONTRACT,
  createContextualAuthoringInversePatch,
  markContextualAuthoringSyncPending,
  normalizeCardAssistanceLocalState,
  setCardAssistanceUndo
} from "../../src/assist/cardAssistanceLocalState.js";
import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import {
  IndexedDbRelationalStore,
  LocalCourseDraftChangedError,
  localCourseAuthoringStateId
} from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  minimalProjectFixture,
  seedSelectedOfficialCourse,
  TEST_USER_ID
} from "./helpers/leanRelationalFixture.js";

const FIXED_TIME = "2026-07-22T12:00:00.000Z";

function fixturePath(projectDocument = minimalProjectFixture) {
  const course = projectDocument.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  return {
    courseKey: course.id,
    moduleKey: moduleValue.id,
    lessonKey: lesson.id,
    microsequenceKey: microsequence.id,
    cardKey: microsequence.cards[0].id
  };
}

function assistanceStateWithLessonUndo(beforeLesson, expectedRevision = null) {
  const path = fixturePath();
  const afterLesson = structuredClone(beforeLesson);
  afterLesson.title = `${afterLesson.title || afterLesson.id} · alterada`;
  let state = normalizeCardAssistanceLocalState({});
  state = setCardAssistanceUndo(state, {
    contract: CARD_ASSISTANCE_UNDO_CONTRACT,
    kind: "lesson",
    ...path,
    expectedRevision,
    affectedMicrosequenceIds: [path.microsequenceKey],
    inversePatch: createContextualAuthoringInversePatch(beforeLesson, afterLesson)
  });
  return markContextualAuthoringSyncPending(state, path);
}

async function openEditableRepository(
  indexedDb,
  { courseOrigin = "private", document = minimalProjectFixture } = {}
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

test("desfazer da assistência ocupa um único registro local por curso", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const path = fixturePath();
  const first = normalizeCardAssistanceLocalState({});
  await repository.saveCardAssistanceLocalState(course.id, first);
  assert.deepEqual(await repository.loadCardAssistanceLocalState(course.id), first);

  const second = setCardAssistanceUndo(
    first,
    {
      contract: CARD_ASSISTANCE_UNDO_CONTRACT,
      kind: "microsequence",
      ...path,
      expectedRevision: null,
      affectedMicrosequenceIds: [path.microsequenceKey],
      inversePatch: createContextualAuthoringInversePatch(
        minimalProjectFixture.courses[0].modules[0].lessons[0].microsequences[0],
        {
          ...minimalProjectFixture.courses[0].modules[0].lessons[0].microsequences[0],
          title: "Microssequência alterada"
        }
      )
    }
  );
  await repository.saveCardAssistanceLocalState(course.id, second);
  assert.deepEqual(await repository.loadCardAssistanceLocalState(course.id), second);
  assert.equal(
    (await store.getAll("syncState"))
      .filter((row) => row.id === `authoring.cardAssistance:${course.id}`).length,
    1
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("conteúdo, rascunho, sincronização e desfazer são confirmados na mesma transação", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const beforeLesson = structuredClone(before.courses[0].modules[0].lessons[0]);
  const edited = structuredClone(before);
  edited.courses[0].modules[0].lessons[0].microsequences[0]
    .cards[0].text = "Alteração contextual confirmada.";
  const guard = repository.createLocalCourseDraftGuard(course.id);
  const localState = assistanceStateWithLessonUndo(beforeLesson, guard.expectedRevision);

  const saved = await repository.saveProjectWithCardAssistanceState(edited, {
    courseIdentity: course.id,
    localState,
    expectedLocalDraftRevision: guard.expectedRevision
  });

  const draft = await repository.getLocalCourseDraft(course.id);
  assert.equal(
    saved.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].cards[0].text,
    "Alteração contextual confirmada."
  );
  assert.equal(draft.status, "dirty");
  assert.equal(saved.localState.undo.kind, "lesson");
  assert.equal(saved.localState.undo.expectedRevision, draft.revision);
  assert.equal(saved.localState.sync.expectedRevision, draft.revision);
  assert.deepEqual(saved.localState.sync.pendingPaths, [fixturePath()].map((item) => ({
    courseKey: item.courseKey,
    moduleKey: item.moduleKey,
    lessonKey: item.lessonKey,
    microsequenceKey: item.microsequenceKey
  })));
  assert.equal(
    (await store.getAll("syncState"))
      .filter((row) => row.id === `authoring.cardAssistance:${course.id}`).length,
    1
  );
  await repository.saveProject(repository.loadProject(), {
    expectedLocalDraftRevision: draft.revision
  });
  assert.deepEqual(
    await repository.loadCardAssistanceLocalState(course.id),
    saved.localState
  );
});

test("edição normal posterior invalida só o desfazer dos cursos alterados", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const unrelatedCourseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const unrelatedCourseKey = "course-fixture-unrelated";

  const firstStateBefore = assistanceStateWithLessonUndo(
    minimalProjectFixture.courses[0].modules[0].lessons[0]
  );
  const secondState = structuredClone(firstStateBefore);
  secondState.undo.courseKey = unrelatedCourseKey;
  secondState.sync.pendingPaths[0].courseKey = unrelatedCourseKey;
  await repository.saveCardAssistanceLocalState(course.id, firstStateBefore);
  await store.putSyncState(
    `authoring.cardAssistance:${unrelatedCourseId}`,
    secondState
  );

  const normallyEdited = repository.loadProject();
  normallyEdited.courses.find((course) => course.id === fixturePath().courseKey)
    .goal = "Meta alterada manualmente depois da assistência.";
  await repository.saveProject(normallyEdited, { expectedLocalDraftRevision: null });

  const firstState = await repository.loadCardAssistanceLocalState(course.id);
  const normalDraft = await repository.getLocalCourseDraft(course.id);
  assert.equal(firstState.undo, null);
  assert.deepEqual(firstState.sync.pendingPaths, firstStateBefore.sync.pendingPaths);
  assert.equal(firstState.sync.expectedRevision, normalDraft.revision);
  assert.deepEqual(
    await store.getSyncState(`authoring.cardAssistance:${unrelatedCourseId}`),
    secondState
  );
});

test("edição normal rebasa sincronização de R1 para R2 e finaliza com R2", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const beforeLesson = structuredClone(before.courses[0].modules[0].lessons[0]);
  const assisted = structuredClone(before);
  assisted.courses[0].modules[0].lessons[0].microsequences[0]
    .cards[0].text = "Alteração da assistência em R1.";
  const firstSaved = await repository.saveProjectWithCardAssistanceState(assisted, {
    courseIdentity: course.id,
    localState: assistanceStateWithLessonUndo(beforeLesson),
    expectedLocalDraftRevision: null
  });
  const revisionR1 = firstSaved.localState.sync.expectedRevision;
  assert.ok(revisionR1);

  const normallyEdited = repository.loadProject();
  normallyEdited.courses[0].goal = "Edição normal posterior em R2.";
  await repository.saveProject(normallyEdited, {
    expectedLocalDraftRevision: revisionR1
  });
  const draftR2 = await repository.getLocalCourseDraft(course.id);
  const stateR2 = await repository.loadCardAssistanceLocalState(course.id);
  assert.notEqual(draftR2.revision, revisionR1);
  assert.equal(stateR2.undo, null);
  assert.deepEqual(stateR2.sync.pendingPaths, firstSaved.localState.sync.pendingPaths);
  assert.equal(stateR2.sync.expectedRevision, draftR2.revision);

  await store.transaction(["syncState"], "readwrite", (transaction) =>
    transaction.delete("syncState", localCourseAuthoringStateId(course.id))
  );
  const finalized = await repository.finalizeCardAssistanceSync(course.id, {
    expectedLocalDraftRevision: draftR2.revision
  });
  assert.deepEqual(finalized.sync.pendingPaths, []);
  assert.equal(finalized.sync.expectedRevision, null);
  assert.equal(repository.createLocalCourseDraftGuard(course.id).expectedRevision, null);
});

test("refresh remoto que altera o curso invalida seu desfazer antes de retornar", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const localState = assistanceStateWithLessonUndo(
    before.courses[0].modules[0].lessons[0]
  );
  localState.sync = { pendingPaths: [], expectedRevision: null };
  await repository.saveCardAssistanceLocalState(course.id, localState);

  const card = (await store.getAll("cards")).find((row) =>
    row.contractKey === fixturePath().cardKey
  );
  assert.ok(card);
  await store.put("cards", {
    ...card,
    title: "Título remoto mais novo",
    updatedAt: "2026-07-22T13:00:00.000Z"
  });

  const refreshed = await repository.refreshFromReplica();
  const stateAfterRefresh = await repository.loadCardAssistanceLocalState(course.id);

  assert.equal(refreshed.documentChanged, true);
  assert.equal(stateAfterRefresh.undo, null);
  assert.deepEqual(stateAfterRefresh.sync, localState.sync);
  assert.equal(
    repository.loadProject().courses[0].modules[0].lessons[0]
      .microsequences[0].cards.find((item) => item.id === fixturePath().cardKey).title,
    "Título remoto mais novo"
  );
});

test("refresh sem alteração documental preserva o desfazer corrente", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const localState = assistanceStateWithLessonUndo(
    before.courses[0].modules[0].lessons[0]
  );
  localState.sync = { pendingPaths: [], expectedRevision: null };
  await repository.saveCardAssistanceLocalState(course.id, localState);

  const refreshed = await repository.refreshFromReplica();

  assert.equal(refreshed.documentChanged, false);
  assert.deepEqual(
    await repository.loadCardAssistanceLocalState(course.id),
    localState
  );
});

test("refresh pessoal que retira o curso também invalida seu desfazer", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const localState = assistanceStateWithLessonUndo(
    before.courses[0].modules[0].lessons[0]
  );
  localState.sync = { pendingPaths: [], expectedRevision: null };
  await repository.saveCardAssistanceLocalState(course.id, localState);
  const selection = (await store.getAll("courseSelections"))[0];
  await store.delete("courseSelections", selection.id);

  const refreshed = await repository.refreshPersonalStateFromReplica();
  const persisted = await store.getSyncState(`authoring.cardAssistance:${course.id}`);

  assert.equal(refreshed.documentChanged, true);
  assert.equal(persisted.undo, null);
  assert.deepEqual(persisted.sync, localState.sync);
});

test("CAS obsoleto não grava conteúdo nem estado auxiliar parcialmente", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const beforeLesson = structuredClone(before.courses[0].modules[0].lessons[0]);
  const edited = structuredClone(before);
  edited.courses[0].modules[0].lessons[0].microsequences[0]
    .cards[0].text = "Esta alteração não pode escapar da transação.";
  const localState = assistanceStateWithLessonUndo(beforeLesson, "revision-obsoleta");

  await assert.rejects(
    repository.saveProjectWithCardAssistanceState(edited, {
      courseIdentity: course.id,
      localState,
      expectedLocalDraftRevision: "revision-obsoleta"
    }),
    (error) => error instanceof LocalCourseDraftChangedError
  );

  assert.equal(
    repository.loadProject().courses[0].modules[0].lessons[0]
      .microsequences[0].cards[0].text,
    before.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text
  );
  assert.equal(await repository.getLocalCourseDraft(course.id), null);
  assert.equal(await repository.loadCardAssistanceLocalState(course.id), null);
});

test("sincronização concluída limpa pendências e mantém desfazer com CAS rebaseado", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const beforeLesson = structuredClone(before.courses[0].modules[0].lessons[0]);
  const edited = structuredClone(before);
  edited.courses[0].modules[0].lessons[0].microsequences[0]
    .cards[0].text = "Conteúdo já materializado remotamente.";
  const saved = await repository.saveProjectWithCardAssistanceState(edited, {
    courseIdentity: course.id,
    localState: assistanceStateWithLessonUndo(beforeLesson),
    expectedLocalDraftRevision: null
  });
  const consumedRevision = saved.localState.undo.expectedRevision;
  await store.transaction(["syncState"], "readwrite", (transaction) =>
    transaction.delete("syncState", localCourseAuthoringStateId(course.id))
  );

  const finalized = await repository.finalizeCardAssistanceSync(course.id, {
    expectedLocalDraftRevision: consumedRevision
  });
  const replayed = await repository.finalizeCardAssistanceSync(course.id, {
    expectedLocalDraftRevision: consumedRevision
  });

  assert.deepEqual(finalized.sync.pendingPaths, []);
  assert.equal(finalized.sync.expectedRevision, null);
  assert.equal(finalized.undo.expectedRevision, null);
  assert.deepEqual(replayed, finalized);
  assert.equal(repository.createLocalCourseDraftGuard(course.id).expectedRevision, null);
  const reverted = repository.loadProject();
  reverted.courses[0].modules[0].lessons[0] = structuredClone(beforeLesson);
  await repository.saveProject(reverted, { expectedLocalDraftRevision: null });
  assert.ok((await repository.getLocalCourseDraft(course.id)).revision);
  const stateAfterNormalSave = await repository.loadCardAssistanceLocalState(course.id);
  assert.equal(stateAfterNormalSave.undo, null);
  assert.deepEqual(stateAfterNormalSave.sync, finalized.sync);
});

test("finalização antiga preserva estado mais novo mesmo após seu rascunho ser consumido", async (context) => {
  const { store, repository, course } = await openEditableRepository(new IDBFactory());
  context.after(() => store.close());
  const before = repository.loadProject();
  const beforeLesson = structuredClone(before.courses[0].modules[0].lessons[0]);
  const first = structuredClone(before);
  first.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text = "Primeira revisão.";
  const firstSaved = await repository.saveProjectWithCardAssistanceState(first, {
    courseIdentity: course.id,
    localState: assistanceStateWithLessonUndo(beforeLesson),
    expectedLocalDraftRevision: null
  });
  const firstRevision = firstSaved.localState.undo.expectedRevision;
  const second = repository.loadProject();
  second.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text = "Segunda revisão.";
  const secondSaved = await repository.saveProjectWithCardAssistanceState(second, {
    courseIdentity: course.id,
    localState: assistanceStateWithLessonUndo(beforeLesson, firstRevision),
    expectedLocalDraftRevision: firstRevision
  });
  await store.transaction(["syncState"], "readwrite", (transaction) =>
    transaction.delete("syncState", localCourseAuthoringStateId(course.id))
  );

  await assert.rejects(
    repository.finalizeCardAssistanceSync(course.id, {
      expectedLocalDraftRevision: firstRevision
    }),
    (error) => error instanceof LocalCourseDraftChangedError &&
      error.actualRevision === secondSaved.localState.undo.expectedRevision
  );
  assert.deepEqual(
    await repository.loadCardAssistanceLocalState(course.id),
    secondSaved.localState
  );
});

for (const { courseOrigin, expectedRole } of [
  { courseOrigin: "catalog", expectedRole: "editor" },
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
      role: expectedRole,
      canAuthorContent: true,
      writeTarget: courseOrigin,
      canOrganizeSelection: true,
      canRemoveSelection: true,
      canDeleteCourse: true,
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
    const localDraft = await repository.getLocalCourseDraft(course.id);
    assert.equal(localDraft.status, "dirty");
    assert.equal(localDraft.courseOrigin, courseOrigin);
  });
}

test("edição de bloco composto grava somente a linha do bloco alterado", async (context) => {
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

  const changed = repository.loadProject();
  const target = changed.courses[0].modules[0].lessons[0].microsequences[0];
  target.cards[0].blocks[0].value = "Somente este bloco mudou.";
  await repository.saveMicrosequenceGeneration(changed, target.id);

  assert.equal(
    repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences[0]
      .cards[0].blocks[0].value,
    "Somente este bloco mudou."
  );
});

test("persistência recusa alteração externa antes do commit", async (context) => {
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
});

test("curso de catálogo comum não pode ser alterado pelo repositório local", async (context) => {
  const { store, repository, course } = await openEditableRepository(
    new IDBFactory(),
    { courseOrigin: "catalog" }
  );
  context.after(() => store.close());

  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0].text = "Alteração que deve ser recusada.";
  assert.equal(repository.coursePermissions(course.id).canAuthorContent, false);
  assert.throws(
    () => repository.createLocalCourseDraftGuard(course.id),
    (error) => error?.code === "course_authoring_forbidden"
  );
  await assert.rejects(
    repository.saveMicrosequenceGeneration(edited, microsequence.id),
    (error) => error?.code === "course_authoring_forbidden"
  );
  assert.equal(await repository.getLocalCourseDraft(course.id), null);
});

for (const courseOrigin of ["catalog", "private"]) {
  test(`CAS recusa alteração obsoleta entre duas abas em curso ${courseOrigin}`, async (context) => {
    const indexedDb = new IDBFactory();
    const seedStore = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
    const { course } = await seedSelectedOfficialCourse(seedStore, {
      courseOrigin,
      document: minimalProjectFixture
    });
    const storeA = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
    const storeB = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
    const realMutationsB = new DomainMutationService({ store: storeB });
    let signalBReachedMutation;
    let releaseBMutation;
    const bReachedMutation = new Promise((resolve) => {
      signalBReachedMutation = resolve;
    });
    const bMutationReleased = new Promise((resolve) => {
      releaseBMutation = resolve;
    });
    const repositoryA = await RelationalProjectRepository.open({
      store: storeA,
      userId: TEST_USER_ID
    });
    const repositoryB = await RelationalProjectRepository.open({
      store: storeB,
      userId: TEST_USER_ID,
      mutationService: {
        async applyMutations(...args) {
          signalBReachedMutation();
          await bMutationReleased;
          return realMutationsB.applyMutations(...args);
        },
        applyRowChange(...args) {
          return realMutationsB.applyRowChange(...args);
        }
      }
    });
    if (courseOrigin === "catalog") {
      repositoryA.setCatalogManagementAllowed(true);
      repositoryB.setCatalogManagementAllowed(true);
    }
    context.after(() => {
      seedStore.close();
      storeA.close();
      storeB.close();
    });

    const guardA = repositoryA.createLocalCourseDraftGuard(course.id);
    const guardB = repositoryB.createLocalCourseDraftGuard(course.id);
    const projectB = repositoryB.loadProject();
    const microsequenceB = projectB.courses[0].modules[0].lessons[0].microsequences[0];
    microsequenceB.cards[0].text = "Alteração obsoleta da aba B.";
    const pendingB = repositoryB.saveMicrosequenceGeneration(
      projectB,
      microsequenceB.id,
      { expectedLocalDraftRevision: guardB.expectedRevision }
    );
    await bReachedMutation;

    const projectA = repositoryA.loadProject();
    const microsequenceA = projectA.courses[0].modules[0].lessons[0].microsequences[0];
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
        error.actualRevision === draftA.revision
    );
    await repositoryA.refreshFromReplica();
    assert.equal(
      repositoryA.loadProject()
        .courses[0].modules[0].lessons[0].microsequences[0].cards[0].text,
      "Alteração confirmada da aba A."
    );
  });
}
