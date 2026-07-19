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
  PROJECT_ROW_STORE_NAMES,
  IndexedDbRelationalStore
} from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import { SupabaseSyncTransport } from "../../src/sync/RelationalSyncEngine.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "10000000-0000-4000-8000-000000000002";
const LESSON_PROGRESS_ID = "10000000-0000-4000-8000-000000000003";
const CARD_PROGRESS_ID = "10000000-0000-4000-8000-000000000004";
const COMMENT_ID = "10000000-0000-4000-8000-000000000005";
const CONFLICT_ID = "10000000-0000-4000-8000-000000000006";
const STUDY_PATH_ID = "10000000-0000-4000-8000-000000000007";

function projectFixture() {
  let project = createEmptyProjectDocument();
  project = createCourse(project, {
    id: "course-delete",
    title: "Curso removível",
    goal: "Validar exclusão atômica."
  });
  project = createModule(project, {
    courseKey: "course-delete",
    id: "module-delete",
    title: "Módulo",
    goal: "Organizar o conteúdo."
  });
  project = createLesson(project, {
    courseKey: "course-delete",
    moduleKey: "module-delete",
    id: "lesson-delete",
    title: "Lição",
    goal: "Estudar uma microssequência."
  });
  project = createMicrosequence(project, {
    courseKey: "course-delete",
    moduleKey: "module-delete",
    lessonKey: "lesson-delete",
    id: "micro-delete",
    title: "Microssequência"
  });
  return replaceMicrosequenceCards(project, {
    courseKey: "course-delete",
    moduleKey: "module-delete",
    lessonKey: "lesson-delete",
    microsequenceKey: "micro-delete",
    cards: [{
      id: "card-delete",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Card",
      text: "Conteúdo granular.",
      after: ""
    }]
  });
}

test("excluir curso cria uma única operação composta e tombstones locais completos", async (context) => {
  const identityMap = new Map();
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  const repository = await RelationalProjectRepository.open({
    store,
    identityMap,
    userId: USER_ID
  });
  context.after(() => store.close());

  const project = projectFixture();
  repository.saveProject(project);
  await repository.flush();
  await store.acknowledgeOutbox((await store.getAll("outbox")).map((row) => row.mutationId));

  const course = (await store.getAll("courses"))[0];
  const lesson = (await store.getAll("lessons"))[0];
  const card = (await store.getAll("cards"))[0];
  const now = "2026-07-18T12:00:00.000Z";
  await store.put("memberships", {
    id: MEMBERSHIP_ID,
    courseId: course.id,
    userId: USER_ID,
    role: "owner",
    position: 0,
    revision: 1,
    updatedAt: now,
    deletedAt: null
  });
  await store.put("lessonProgress", {
    id: LESSON_PROGRESS_ID,
    courseId: course.id,
    lessonId: lesson.id,
    userId: USER_ID,
    pathKey: "course-delete::module-delete::lesson-delete",
    revision: 1,
    updatedAt: now,
    deletedAt: null
  });
  await store.put("cardProgress", {
    id: CARD_PROGRESS_ID,
    courseId: course.id,
    lessonId: lesson.id,
    lessonProgressId: LESSON_PROGRESS_ID,
    cardId: card.id,
    userId: USER_ID,
    revision: 1,
    updatedAt: now,
    deletedAt: null
  });
  await store.put("comments", {
    id: COMMENT_ID,
    courseId: course.id,
    cardId: card.id,
    userId: USER_ID,
    body: "Comentário",
    revision: 1,
    updatedAt: now,
    deletedAt: null
  });
  await store.put("studyPaths", {
    id: STUDY_PATH_ID,
    ownerId: USER_ID,
    title: "Concurso",
    position: 0,
    revision: 1,
    updatedAt: now,
    deletedAt: null
  });
  await store.put("conflicts", {
    id: CONFLICT_ID,
    courseId: course.id,
    entityType: "blocks",
    entityId: (await store.getAll("blocks"))[0].id,
    mutationId: null,
    status: "open",
    localRow: { value: "local" },
    remoteRow: { value: "remoto" },
    createdAt: now,
    updatedAt: now
  });
  await repository.refreshFromReplica();

  await repository.addCourseToStudyPath(STUDY_PATH_ID, course.id);
  await repository.flush();
  assert.equal((await store.listPendingOutbox()).length, 1);
  const [rejectedAssociation] = await store.getAll("outbox");
  await store.put("outbox", {
    ...rejectedAssociation,
    status: "rejected",
    lastError: "Curso pessoal não autorizado."
  });
  assert.equal((await store.listRejectedOutbox()).length, 1);

  const edited = structuredClone(project);
  edited.courses[0].title = "Edição que será superada pela exclusão";
  repository.saveProject(edited);
  await repository.flush();
  assert.equal((await store.getAll("outbox")).length, 2);

  repository.deletePersonalCourse(course.id);
  await repository.flush();

  assert.deepEqual(repository.loadProject().courses, []);
  const pending = await store.listPendingOutbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].entityType, "personalCourseDeletion");
  assert.equal(pending[0].operation, "delete");
  assert.equal(pending[0].payload.courseId, course.id);
  assert.ok(pending[0].payload.affectedEntities.length > 5);
  assert.ok(pending[0].payload.rollbackRows.some(
    (entry) => entry.storeName === "courses" && entry.entityId === course.id
  ));

  for (const storeName of [
    ...PROJECT_ROW_STORE_NAMES.filter((name) => name !== "projectMeta"),
    "memberships",
    "lessonProgress",
    "cardProgress",
    "comments",
    "studyPathCourses"
  ]) {
    const rows = (await store.getAll(storeName)).filter(
      (row) => row.courseId === course.id || (storeName === "courses" && row.id === course.id)
    );
    rows.forEach((row) => assert.ok(row.deletedAt, `${storeName}:${row.id} sem tombstone`));
  }
  assert.equal((await store.get("conflicts", CONFLICT_ID)).resolution, "course_deleted");
  assert.equal([...identityMap.values()].includes(course.id), false);
  assert.equal([...identityMap.values()].includes(card.id), false);
});

test("transporte envia exclusão pessoal pela RPC idempotente, fora do lote genérico", async () => {
  const calls = [];
  const transport = new SupabaseSyncTransport({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { status: "applied", courseId: parameters.p_course_id };
    }
  });
  const mutationId = "20000000-0000-4000-8000-000000000001";
  const courseId = "20000000-0000-4000-8000-000000000002";

  const result = await transport.applySyncBatch({
    deviceId: "20000000-0000-4000-8000-000000000003",
    mutations: [{
      mutationId,
      entityType: "personalCourseDeletion",
      entityId: courseId,
      courseId,
      operation: "delete",
      baseRevision: 4,
      changedFields: [],
      payload: { courseId }
    }]
  });

  assert.deepEqual(calls, [{
    name: "delete_personal_course",
    parameters: { p_course_id: courseId, p_base_revision: 4, p_mutation_id: mutationId }
  }]);
  assert.deepEqual(result.results, [{
    status: "applied",
    courseId,
    mutationId,
    entityType: "personalCourseDeletion",
    entityId: courseId
  }]);
});

test("conflito de exclusão stale restaura a árvore remota ou permite repetir conscientemente", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => store.close());
  const courseId = "21000000-0000-4000-8000-000000000001";
  const moduleId = "21000000-0000-4000-8000-000000000002";
  const mutationId = "21000000-0000-4000-8000-000000000003";
  const conflictId = "21000000-0000-4000-8000-000000000004";
  const deletedAt = "2026-07-18T13:00:00.000Z";
  const payload = {
    courseId,
    affectedEntities: [
      {
        storeName: "courses",
        entityId: courseId,
        previousRevision: 5,
        previousUpdatedAt: "2026-07-18T11:00:00.000Z",
        previousDeletedAt: null
      },
      {
        storeName: "modules",
        entityId: moduleId,
        previousRevision: 2,
        previousUpdatedAt: "2026-07-18T11:00:00.000Z",
        previousDeletedAt: null
      }
    ],
    rollbackRows: []
  };
  await store.put("courses", {
    id: courseId,
    courseId,
    contractKey: "course-delete",
    title: "Local tombstone",
    revision: 6,
    updatedAt: deletedAt,
    deletedAt
  });
  await store.put("modules", {
    id: moduleId,
    courseId,
    contractKey: "module-delete",
    title: "Local tombstone",
    revision: 3,
    updatedAt: deletedAt,
    deletedAt
  });
  await store.put("outbox", {
    mutationId,
    sequence: 1,
    courseId,
    entityType: "personalCourseDeletion",
    entityId: courseId,
    operation: "delete",
    baseRevision: 5,
    payload,
    status: "conflict",
    createdAt: deletedAt,
    updatedAt: deletedAt
  });
  const remoteCourse = {
    id: courseId,
    courseId,
    contractKey: "course-delete",
    title: "Curso alterado remotamente",
    revision: 7,
    updatedAt: "2026-07-18T14:00:00.000Z",
    deletedAt: null
  };
  await store.put("conflicts", {
    id: conflictId,
    courseId,
    entityType: "personalCourseDeletion",
    entityId: courseId,
    mutationId,
    baseRevision: 5,
    remoteRevision: 7,
    localRow: payload,
    remoteRow: remoteCourse,
    status: "open",
    createdAt: deletedAt,
    updatedAt: deletedAt
  });
  const remoteModule = {
    id: moduleId,
    courseId,
    contractKey: "module-delete",
    title: "Módulo alterado remotamente",
    revision: 4,
    updatedAt: "2026-07-18T14:00:00.000Z",
    deletedAt: null
  };
  const newRemoteModule = {
    ...remoteModule,
    id: "21000000-0000-4000-8000-000000000008",
    contractKey: "module-created-remotely",
    title: "Módulo criado remotamente",
    revision: 1
  };

  await store.applyRemotePage({
    changes: [
      {
        storeName: "modules",
        entityId: moduleId,
        courseId,
        operation: "upsert",
        row: remoteModule
      },
      {
        storeName: "modules",
        entityId: newRemoteModule.id,
        courseId,
        operation: "upsert",
        row: newRemoteModule
      }
    ],
    cursor: 9,
    deviceId: "device-delete"
  });
  assert.equal((await store.get("modules", moduleId)).deletedAt, deletedAt);
  assert.equal(await store.get("modules", newRemoteModule.id), undefined);
  assert.equal((await store.get("conflicts", conflictId)).remoteChanges.length, 2);

  await store.resolveConflict(conflictId, "acceptRemote");
  assert.equal((await store.get("courses", courseId)).title, "Curso alterado remotamente");
  assert.equal((await store.get("courses", courseId)).deletedAt, null);
  assert.equal((await store.get("modules", moduleId)).title, "Módulo alterado remotamente");
  assert.equal((await store.get("modules", newRemoteModule.id)).title, "Módulo criado remotamente");
  assert.equal(await store.get("outbox", mutationId), undefined);

  const retryMutationId = "21000000-0000-4000-8000-000000000005";
  const retryConflictId = "21000000-0000-4000-8000-000000000006";
  await store.put("outbox", {
    mutationId: retryMutationId,
    sequence: 2,
    courseId,
    entityType: "personalCourseDeletion",
    entityId: courseId,
    operation: "delete",
    baseRevision: 7,
    payload,
    status: "conflict"
  });
  await store.put("conflicts", {
    id: retryConflictId,
    courseId,
    entityType: "personalCourseDeletion",
    entityId: courseId,
    mutationId: retryMutationId,
    baseRevision: 7,
    remoteRevision: 8,
    localRow: payload,
    remoteRow: { ...remoteCourse, revision: 8 },
    status: "open"
  });
  const resolution = await store.resolveConflict(retryConflictId, "keepLocal", {
    uuidFactory: () => "21000000-0000-4000-8000-000000000007",
    resolvedAt: "2026-07-18T15:00:00.000Z"
  });
  assert.equal(resolution.queuedMutation.baseRevision, 8);
  assert.equal(resolution.queuedMutation.entityType, "personalCourseDeletion");
  assert.equal(resolution.queuedMutation.payload.courseId, courseId);
});

test("repositório impede que membro não proprietário apague curso pessoal", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  const repository = await RelationalProjectRepository.open({ store, userId: USER_ID });
  context.after(() => store.close());
  const project = projectFixture();
  repository.saveProject(project);
  await repository.flush();
  const course = (await store.getAll("courses"))[0];
  await store.put("courses", {
    ...course,
    ownerId: "30000000-0000-4000-8000-000000000001",
    kind: "personal"
  });
  await repository.refreshFromReplica();

  assert.throws(
    () => repository.saveProject({ ...project, courses: [] }),
    /Somente o proprietário/u
  );
  assert.equal(repository.loadProject().courses.length, 1);
});

test("learner estuda e comenta, mas não cria mutação autoral local", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory());
  const repository = await RelationalProjectRepository.open({ store, userId: USER_ID });
  context.after(() => store.close());
  const project = projectFixture();
  repository.saveProject(project);
  await repository.flush();
  await store.acknowledgeOutbox((await store.getAll("outbox")).map((row) => row.mutationId));
  const course = (await store.getAll("courses"))[0];
  await store.put("courses", {
    ...course,
    ownerId: "30000000-0000-4000-8000-000000000002",
    kind: "personal",
    status: "active"
  });
  await store.put("memberships", {
    id: MEMBERSHIP_ID,
    courseId: course.id,
    userId: USER_ID,
    role: "learner",
    position: 0,
    revision: 1,
    updatedAt: "2026-07-18T12:00:00.000Z",
    deletedAt: null
  });
  await repository.refreshFromReplica();

  assert.deepEqual(repository.coursePermissions("course-delete"), {
    role: "learner",
    canEdit: false,
    canDelete: false
  });
  const edited = structuredClone(project);
  edited.courses[0].title = "Learner não pode editar";
  assert.throws(() => repository.saveProject(edited), /somente para estudo/u);
  assert.deepEqual(await store.listPendingOutbox(), []);

  const reference = {
    courseKey: "course-delete",
    moduleKey: "module-delete",
    lessonKey: "lesson-delete",
    microsequenceKey: "micro-delete",
    cardKey: "card-delete"
  };
  await repository.recordCardView(reference);
  await repository.saveCommentForPath(reference, "Comentário do learner");
  assert.deepEqual(
    new Set((await store.listPendingOutbox()).map((row) => row.entityType)),
    new Set(["lessonProgress", "cardProgress", "comments"])
  );
});
