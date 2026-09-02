import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import {
  CourseController,
  coursePendingCompositionCacheKey
} from "../../src/supabase/CourseController.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";

function networkFailure() {
  const error = new Error("offline");
  error.status = 0;
  error.code = "network_error";
  return error;
}

function courseListPage(revision) {
  return {
    contract: "aralearn.course-list.v1",
    items: [{
      courseId: COURSE_ID,
      title: "Curso",
      goal: "Aprender",
      revision,
      ownership: "owned",
      canEdit: true,
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 0,
      microsequenceCount: 1,
      studyUnitCount: 1,
      completedStudyUnitCount: 0,
      updatedAt: "2026-08-20T12:00:00.000Z"
    }],
    hasMore: false,
    nextCursor: null
  };
}

function inspectionPage(revision, items = []) {
  return {
    contract: "aralearn.course-study-unit-inspection-page.v2",
    courseId: COURSE_ID,
    courseRevision: revision,
    scope: { kind: "course", id: null },
    totalCount: items.length,
    scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
    items,
    hasPrevious: false,
    hasMore: false,
    previousCursor: null,
    nextCursor: null,
    pageBytes: 64
  };
}

function editedStudyUnit() {
  return {
    id: "unit-a",
    position: 1,
    title: "Unidade editada",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo canônico salvo." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
}

function courseDocument(studyUnit) {
  return {
    contract: "aralearn.course.v1",
    courses: [{
      id: COURSE_ID,
      title: "Curso",
      goal: "Aprender",
      modules: [{
        id: "module-a",
        title: "Módulo A",
        guide: { goal: "Guiar", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: "lesson-a",
          title: "Lição A",
          guide: { goal: "Ensinar", include: [], exclude: [], notation: [], avoid: [] },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Microssequência A",
            goal: "Explicar",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [structuredClone(studyUnit)]
          }]
        }]
      }]
    }]
  };
}

function versionedRows(studyUnit, version) {
  return flattenCourseDocument(courseDocument(studyUnit)).rows.map((row) => ({
    ...row,
    version: row.entityType === "study_unit" ? version : 1
  }));
}

function inspectionItem(studyUnit, version, updatedAt) {
  return {
    studyUnit: structuredClone(studyUnit),
    version,
    updatedAt,
    ordinal: 1,
    curriculumPath: {
      module: { id: "module-a", position: 0, title: "Módulo A" },
      lesson: { id: "lesson-a", position: 0, title: "Lição A" },
      didacticMicrosequence: {
        id: "micro-a", position: 0, title: "Microssequência A"
      }
    },
    authoringPart: null,
    deepLink: `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=unit-a`
  };
}

test("duas instâncias compartilham caches autorais e nova revisão remota invalida os derivados", async (context) => {
  const indexedDb = new IDBFactory();
  const [firstStore, secondStore] = await Promise.all([
    CourseLocalStore.open(indexedDb, { userId: USER_ID }),
    CourseLocalStore.open(indexedDb, { userId: USER_ID })
  ]);
  context.after(() => {
    firstStore.close();
    secondStore.close();
  });

  let online = true;
  let revision = 4;
  const api = {
    async listCourses() {
      if (!online) throw networkFailure();
      return courseListPage(revision);
    },
    async getCourse() {
      if (!online) throw networkFailure();
      return {
        contract: "aralearn.course.v1",
        courseId: COURSE_ID,
        title: "Curso",
        goal: "Aprender",
        revision
      };
    },
    async loadAuthoringPlan() {
      if (!online) throw networkFailure();
      return {
        contract: "aralearn.course-instructional-plan.v1",
        courseId: COURSE_ID,
        courseRevision: revision,
        plan: { id: COURSE_ID, version: revision, parts: [] },
        recentActivity: []
      };
    },
    async loadAuthoringOutline() {
      if (!online) throw networkFailure();
      return { courseId: COURSE_ID, revision, outline: { modules: [] } };
    },
    async loadAuthoringStudyUnits() {
      if (!online) throw networkFailure();
      return inspectionPage(revision);
    }
  };
  const first = new CourseController({ api, store: firstStore, ownerOnly: true });
  const second = new CourseController({ api, store: secondStore, ownerOnly: true });

  await first.listCourses();
  await first.getCourse(COURSE_ID);
  await first.loadAuthoringPlan(COURSE_ID);
  await first.loadAuthoringOutline(COURSE_ID);
  await first.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 4 });

  online = false;
  assert.equal((await second.listCourses()).items[0].revision, 4);
  assert.equal((await second.getCourse(COURSE_ID)).revision, 4);
  assert.equal((await second.loadAuthoringPlan(COURSE_ID)).courseRevision, 4);
  assert.equal((await second.loadAuthoringOutline(COURSE_ID)).revision, 4);
  assert.equal((await second.loadAuthoringStudyUnits(
    COURSE_ID,
    { expectedRevision: 4 }
  )).courseRevision, 4);

  online = true;
  revision = 5;
  assert.equal((await second.getCourse(COURSE_ID)).revision, 5);

  online = false;
  assert.equal((await first.getCourse(COURSE_ID)).revision, 5);
  await assert.rejects(() => first.loadAuthoringPlan(COURSE_ID), /offline/u);
  await assert.rejects(() => first.loadAuthoringOutline(COURSE_ID), /offline/u);
  await assert.rejects(
    () => first.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 4 }),
    /offline/u
  );

  const listBeforeItsOwnRefresh = await first.listCourses();
  assert.equal(listBeforeItsOwnRefresh.items[0].revision, 4);
  assert.equal(listBeforeItsOwnRefresh.offline, true);

  online = true;
  await second.listCourses();
  online = false;
  const listAfterRemoteRefresh = await first.listCourses();
  assert.equal(listAfterRemoteRefresh.items[0].revision, 5);
  assert.equal(listAfterRemoteRefresh.offline, true);
});

test("save relê r+1 uma vez e reconcilia a Unidade canônica no IndexedDB", async (context) => {
  const indexedDb = new IDBFactory();
  const [writerStore, refreshedStore] = await Promise.all([
    CourseLocalStore.open(indexedDb, { userId: USER_ID }),
    CourseLocalStore.open(indexedDb, { userId: USER_ID })
  ]);
  context.after(() => {
    writerStore.close();
    refreshedStore.close();
  });
  let online = true;
  let commitAttempts = 0;
  let inspectionReads = 0;
  const unit = editedStudyUnit();
  const api = {
    async listCourses() { return courseListPage(5); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId) {
      if (!online) throw networkFailure();
      return {
        contract: "aralearn.course-sources.v1",
        courseId,
        courseRevision: 4,
        mode: "target",
        query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: [],
        nextCursor: null
      };
    },
    async commitCourseComposition() {
      commitAttempts += 1;
      return {
        courseId: COURSE_ID,
        courseRevision: 5,
        studyUnitId: "unit-a",
        studyUnitVersion: 3,
        changed: true,
        idempotent: false,
        channel: "application",
        origin: "manual",
        updatedAt: "2026-08-20T22:45:00.000Z"
      };
    },
    async loadAuthoringStudyUnits(courseId) {
      inspectionReads += 1;
      if (!online) throw networkFailure();
      return {
        ...inspectionPage(5, [{
          studyUnit: unit,
          version: 3,
          updatedAt: "2026-08-20T22:45:00.000Z",
          ordinal: 1,
          curriculumPath: {
            module: { id: "module-a", position: 0, title: "Módulo A" },
            lesson: { id: "lesson-a", position: 0, title: "Lição A" },
            didacticMicrosequence: {
              id: "micro-a", position: 0, title: "Microssequência A"
            }
          },
          authoringPart: null
        }]),
        courseId
      };
    }
  };
  const writer = new CourseController({ api, store: writerStore, ownerOnly: true });
  const refreshed = new CourseController({ api, store: refreshedStore, ownerOnly: true });

  const result = await writer.commitCourseComposition({
    requestId: "request-indexeddb-edit-0001",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: unit,
    origin: "manual"
  });
  assert.equal(commitAttempts, 1);
  assert.equal(inspectionReads, 1);
  assert.equal(result.courseRevision, 5);
  assert.equal(result.version, 3);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.studyUnit, unit);

  online = false;
  const cached = await refreshed.loadAuthoringStudyUnits(COURSE_ID, {
    expectedRevision: 5,
    anchorStudyUnitId: "unit-a",
    limit: 1,
    maxBytes: 64 * 1024
  });
  assert.equal(commitAttempts, 1);
  assert.equal(inspectionReads, 2);
  assert.equal(cached.offline, true);
  assert.equal(cached.stale, true);
  assert.equal(cached.courseRevision, 5);
  assert.equal(cached.items[0].version, 3);
  assert.deepEqual(cached.items[0].studyUnit, unit);
});

test("receipt confirmado sobrevive ao reload offline e a releitura canônica substitui o snapshot", async (context) => {
  const indexedDb = new IDBFactory();
  const stores = [];
  const openStore = async () => {
    const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
    stores.push(store);
    return store;
  };
  context.after(() => stores.forEach((store) => store.close()));
  const original = editedStudyUnit();
  original.title = "Unidade original";
  original.content[0].data.text = "Conteúdo anterior.";
  const submitted = editedStudyUnit();
  const canonical = editedStudyUnit();
  canonical.title = "Unidade canônica relida";
  canonical.content[0].data.text = "Conteúdo canônico reconciliado.";
  let online = true;
  let failInspectionReread = false;
  let remoteRevision = 4;
  let remoteVersion = 2;
  let remoteUnit = original;
  let commits = 0;
  const api = {
    async listCourses() {
      if (!online) throw networkFailure();
      return courseListPage(remoteRevision);
    },
    async getCourse() {
      if (!online) throw networkFailure();
      return {
        contract: "aralearn.course.v1",
        courseId: COURSE_ID,
        title: "Curso",
        goal: "Aprender",
        revision: remoteRevision
      };
    },
    async getCourseEntities(courseId) {
      if (!online) throw networkFailure();
      return {
        contract: "aralearn.course-entities.v1",
        courseId,
        revision: remoteRevision,
        items: versionedRows(remoteUnit, remoteVersion),
        hasMore: false,
        nextCursor: null
      };
    },
    async loadCourseSources(courseId) {
      return {
        contract: "aralearn.course-sources.v1",
        courseId,
        courseRevision: 4,
        mode: "target",
        query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: [],
        nextCursor: null
      };
    },
    async commitCourseComposition() {
      commits += 1;
      remoteRevision = 5;
      remoteVersion = 3;
      remoteUnit = canonical;
      failInspectionReread = true;
      return {
        courseId: COURSE_ID,
        courseRevision: 5,
        studyUnitId: "unit-a",
        studyUnitVersion: 3,
        changed: true,
        idempotent: false,
        channel: "application",
        origin: "manual",
        updatedAt: "2026-08-20T22:45:00.000Z"
      };
    },
    async loadAuthoringStudyUnits(courseId) {
      if (!online || failInspectionReread) throw networkFailure();
      return {
        ...inspectionPage(remoteRevision, [inspectionItem(
          remoteUnit,
          remoteVersion,
          "2026-08-20T22:46:00.000Z"
        )]),
        courseId
      };
    }
  };
  const initialStore = await openStore();
  const study = new CourseController({ api, store: initialStore });
  const authoring = new CourseController({ api, store: initialStore, ownerOnly: true });
  await study.listCourses();
  await study.loadCourseDocument(COURSE_ID);
  await authoring.listCourses();

  const saved = await authoring.commitCourseComposition({
    requestId: "request-confirmed-pending-reload-01",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: submitted,
    origin: "manual"
  });
  assert.equal(saved.reconciled, false);
  assert.equal(commits, 1);
  assert.ok(await initialStore.getCache(coursePendingCompositionCacheKey(COURSE_ID)));
  initialStore.close();

  online = false;
  const offlineStore = await openStore();
  const offlineStudy = new CourseController({ api, store: offlineStore });
  const offlineAuthoring = new CourseController({
    api,
    store: offlineStore,
    ownerOnly: true
  });
  const studyList = await offlineStudy.listCourses();
  assert.equal(studyList.items[0].revision, 5);
  const offlineDocument = await offlineStudy.loadCourseDocument(COURSE_ID, {
    verifiedRevision: 5
  });
  assert.equal(offlineDocument.offline, true);
  assert.equal(offlineDocument.pendingConfirmed, true);
  assert.deepEqual(offlineDocument.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0], submitted);
  const authoringList = await offlineAuthoring.listCourses();
  assert.equal(authoringList.items[0].revision, 5);
  const offlineInspection = await offlineAuthoring.loadAuthoringStudyUnits(COURSE_ID, {
    expectedRevision: 5,
    anchorStudyUnitId: "unit-a",
    limit: 1,
    maxBytes: 64 * 1024
  });
  assert.equal(offlineInspection.offline, true);
  assert.equal(offlineInspection.items[0].version, 3);
  assert.deepEqual(offlineInspection.items[0].studyUnit, submitted);
  assert.deepEqual(offlineInspection.items[0].curriculumPath, {
    module: { id: "module-a", position: 0, title: "Módulo A" },
    lesson: { id: "lesson-a", position: 0, title: "Lição A" },
    didacticMicrosequence: {
      id: "micro-a", position: 0, title: "Microssequência A"
    }
  });

  online = true;
  failInspectionReread = false;
  const reconciled = await offlineAuthoring.loadAuthoringStudyUnits(COURSE_ID, {
    expectedRevision: 5,
    anchorStudyUnitId: "unit-a",
    limit: 1,
    maxBytes: 64 * 1024
  });
  assert.equal(reconciled.offline, false);
  assert.deepEqual(reconciled.items[0].studyUnit, canonical);
  assert.equal(await offlineStore.getCache(
    coursePendingCompositionCacheKey(COURSE_ID)
  ), null);

  online = false;
  const afterReconciliation = new CourseController({ api, store: offlineStore });
  const canonicalOffline = await afterReconciliation.loadCourseDocument(COURSE_ID, {
    verifiedRevision: 5
  });
  assert.deepEqual(canonicalOffline.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0], canonical);
  assert.equal(commits, 1);
});

test("revisão canônica posterior elimina o snapshot focal superseded", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  const unit = editedStudyUnit();
  let revision = 4;
  let version = 2;
  let rereadFails = false;
  const api = {
    async listCourses() { return courseListPage(revision); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId) {
      return {
        contract: "aralearn.course-sources.v1",
        courseId,
        courseRevision: 4,
        mode: "target",
        query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: [],
        nextCursor: null
      };
    },
    async commitCourseComposition() {
      revision = 5;
      version = 3;
      rereadFails = true;
      return {
        courseId: COURSE_ID,
        courseRevision: 5,
        studyUnitId: "unit-a",
        studyUnitVersion: 3,
        changed: true,
        idempotent: false,
        channel: "application",
        origin: "manual",
        updatedAt: "2026-08-20T22:45:00.000Z"
      };
    },
    async loadAuthoringStudyUnits(courseId) {
      if (rereadFails) throw networkFailure();
      return {
        ...inspectionPage(revision, [inspectionItem(
          unit,
          version,
          "2026-08-20T22:47:00.000Z"
        )]),
        courseId
      };
    }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });
  await controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 4 });
  const saved = await controller.commitCourseComposition({
    requestId: "request-superseded-pending-0001",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: unit,
    origin: "manual"
  });
  assert.equal(saved.reconciled, false);
  assert.ok(await store.getCache(coursePendingCompositionCacheKey(COURSE_ID)));

  revision = 6;
  version = 4;
  rereadFails = false;
  const newer = await controller.loadAuthoringStudyUnits(COURSE_ID, {
    expectedRevision: 6,
    anchorStudyUnitId: "unit-a",
    limit: 1,
    maxBytes: 64 * 1024
  });
  assert.equal(newer.courseRevision, 6);
  assert.equal(await store.getCache(coursePendingCompositionCacheKey(COURSE_ID)), null);
});

test("limpeza de logout remove somente snapshots confirmados pendentes", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  await store.putCache(coursePendingCompositionCacheKey(COURSE_ID), {
    privateConfirmedContent: true
  });
  await store.putCache(`course.v1.header:${COURSE_ID}`, { preserve: true });
  const controller = new CourseController({
    store,
    ownerOnly: true,
    api: {
      async listCourses() { return courseListPage(4); },
      async getCourse() { throw new Error("não usado"); }
    }
  });

  await controller.clearPendingCourseCompositions();

  assert.equal(await store.getCache(coursePendingCompositionCacheKey(COURSE_ID)), null);
  assert.deepEqual(await store.getCache(`course.v1.header:${COURSE_ID}`), {
    preserve: true
  });
});
