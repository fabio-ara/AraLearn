import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IDBFactory } from "fake-indexeddb";

import {
  markContextualAuthoringSyncPending,
  normalizeCardAssistanceLocalState
} from "../../src/assist/cardAssistanceLocalState.js";
import {
  IndexedDbRelationalStore,
  localCourseAuthoringStateId
} from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import {
  minimalProjectFixture,
  openSelectedCourseRepository,
  TEST_USER_ID
} from "./helpers/leanRelationalFixture.js";

function fixturePath(projectDocument = minimalProjectFixture) {
  const course = projectDocument.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  return {
    courseKey: course.id,
    moduleKey: moduleValue.id,
    lessonKey: lesson.id,
    microsequenceKey: microsequence.id
  };
}

async function persistPendingCardAuthoring(repository, course) {
  const edited = repository.loadProject();
  edited.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text =
    "Alteração local ainda não materializada.";
  const localState = markContextualAuthoringSyncPending(
    normalizeCardAssistanceLocalState({}),
    fixturePath(edited)
  );
  return repository.saveProjectWithCardAssistanceState(edited, {
    courseIdentity: course.id,
    localState,
    expectedLocalDraftRevision: null
  });
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `início ausente: ${start}`);
  assert.notEqual(endIndex, -1, `fim ausente: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("pendências locais consolidam rascunho e assistência uma vez por curso", async (context) => {
  const { store, repository, course } = await openSelectedCourseRepository(
    new IDBFactory(),
    { courseOrigin: "private" }
  );
  context.after(() => store.close());

  assert.deepEqual(await repository.listPendingLocalAuthoring(), []);
  await persistPendingCardAuthoring(repository, course);

  assert.deepEqual(await repository.listPendingLocalAuthoring(), [{
    courseId: course.id,
    hasDraft: true,
    hasAssistance: true
  }]);
});

test("troca de sessão preserva a autoria no namespace do mesmo usuário e não a expõe a outro", async (context) => {
  const indexedDb = new IDBFactory();
  const { store, repository, course } = await openSelectedCourseRepository(
    indexedDb,
    { courseOrigin: "private" }
  );
  await persistPendingCardAuthoring(repository, course);
  const draftBefore = await repository.getLocalCourseDraft(course.id);
  assert.ok(draftBefore?.revision);
  store.close();

  const reopenedStore = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  const reopenedRepository = await RelationalProjectRepository.open({
    store: reopenedStore,
    userId: TEST_USER_ID
  });
  context.after(() => reopenedStore.close());
  assert.deepEqual(await reopenedRepository.listPendingLocalAuthoring(), [{
    courseId: course.id,
    hasDraft: true,
    hasAssistance: true
  }]);
  assert.equal(
    (await reopenedRepository.getLocalCourseDraft(course.id)).revision,
    draftBefore.revision
  );
  assert.ok(await reopenedStore.getSyncState(`authoring.cardAssistance:${course.id}`));

  const otherUserStore = await IndexedDbRelationalStore.open(indexedDb, {
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  });
  context.after(() => otherUserStore.close());
  assert.equal(
    await otherUserStore.getSyncState(localCourseAuthoringStateId(course.id)),
    null
  );
  assert.equal(
    await otherUserStore.getSyncState(`authoring.cardAssistance:${course.id}`),
    null
  );
});

test("logout tenta drenar, conta autoria local e avisa sem descartar o namespace", () => {
  const mainSource = fs.readFileSync(
    new URL("../../public/main.js", import.meta.url),
    "utf8"
  );
  const panelSource = fs.readFileSync(
    new URL("../../src/ui/LearningSpacesPanel.js", import.meta.url),
    "utf8"
  );
  const beforeSignOut = sourceBetween(
    mainSource,
    "async beforeSignOut() {",
    "async onChanged() {"
  );
  assert.match(beforeSignOut, /editorApp\?\.syncContextualAuthoring\?\.\(\)/u);
  assert.match(beforeSignOut, /repository\.listPendingLocalAuthoring\(\)/u);
  assert.match(
    beforeSignOut,
    /return pending\.length \+ rejected\.length \+ workspacePending \+\s*Math\.max\(contextualPending\.length, contextualPendingFallback\)/u
  );
  assert.doesNotMatch(beforeSignOut, /discardPendingLocalAuthoringForSignOut/u);

  const signOutHandler = sourceBetween(
    panelSource,
    "root.querySelector(\"[data-panel-action='signout']\")",
    "root.querySelector(\"[data-panel-action='delete-account']\")"
  );
  const countIndex = signOutHandler.indexOf("await beforeSignOut()");
  const warningIndex = signOutHandler.indexOf("globalThis.confirm");
  const signOutIndex = signOutHandler.indexOf("await authClient.signOut()");
  assert.ok(countIndex >= 0, "o painel deve consultar as pendências antes de sair");
  assert.ok(warningIndex > countIndex, "o aviso deve usar a contagem retornada");
  assert.ok(signOutIndex > warningIndex, "a sessão só pode terminar depois da confirmação");
});

test("poda seguida de bootstrap não ressuscita estado de card-assistance", async (context) => {
  const indexedDb = new IDBFactory();
  const { store, repository, course, graph, selection } =
    await openSelectedCourseRepository(indexedDb, { courseOrigin: "private" });
  const assistanceStateId = `authoring.cardAssistance:${course.id}`;
  const pendingState = markContextualAuthoringSyncPending(
    normalizeCardAssistanceLocalState({}),
    fixturePath()
  );
  await repository.saveCardAssistanceLocalState(course.id, pendingState);
  assert.ok(await store.getSyncState(assistanceStateId));

  assert.deepEqual(await store.pruneOfficialCourseReplicas([]), [course.id]);
  assert.equal(await store.getSyncState(assistanceStateId), null);

  const bootstrap = await store.applyReplicaBootstrap({
    snapshot: { courseSelections: [selection] },
    selectedCourses: [{
      courseId: course.id,
      publicationSeq: selection.publicationSeq,
      contentHash: selection.contentHash
    }],
    highWaterSequence: 11,
    deviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    syncStateId: "sync.cursor:signout-continuity"
  });
  assert.equal(bootstrap.status, "applied");
  await store.replaceOfficialCourseReplica(course.id, graph, {
    publicationSeq: selection.publicationSeq,
    contentHash: selection.contentHash
  });
  store.close();

  const reopenedStore = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  const reopenedRepository = await RelationalProjectRepository.open({
    store: reopenedStore,
    userId: TEST_USER_ID
  });
  context.after(() => reopenedStore.close());
  const rehydratedState = await reopenedRepository.loadCardAssistanceLocalState(course.id);
  assert.equal(rehydratedState, null);
  assert.equal(await reopenedStore.getSyncState(assistanceStateId), null);
});
