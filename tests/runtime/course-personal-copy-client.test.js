import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import {
  CourseController,
  coursePendingPersonalCopyEditCacheKey
} from "../../src/supabase/CourseController.js";
import { createCourseStudyApplication } from
  "../../src/study/CourseStudyApplication.js";
import { CourseStudyBridge } from "../../src/study/CourseStudyBridge.js";
import { CourseStudyRepository } from "../../src/study/CourseStudyRepository.js";

const SOURCE_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "30000000-0000-4000-8000-000000000003";

function studyUnit(title = "Unidade original") {
  return {
    id: "unit-a",
    position: 1,
    title,
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: `${title}.` }
    }],
    response: null,
    feedback: [],
    topics: []
  };
}

function paragraphEditedStudyUnit(title, text) {
  const value = studyUnit(title);
  value.content[0].data.text = text;
  return value;
}

function courseDocument(courseId = SOURCE_ID, unit = studyUnit()) {
  return {
    contract: "aralearn.course.v1",
    courses: [{
      id: courseId,
      title: "Curso compartilhado",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo A",
        guide: { goal: "Guiar.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: "lesson-a",
          title: "Lição A",
          guide: { goal: "Ensinar.", include: [], exclude: [], notation: [], avoid: [] },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Microssequência A",
            goal: "Explicar.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [structuredClone(unit)]
          }]
        }]
      }]
    }]
  };
}

function studyUnitPath(courseId) {
  return [courseId, "module-a", "lesson-a", "micro-a", "unit-a"];
}

function sourceRows() {
  return flattenCourseDocument(courseDocument()).rows.map((row) => ({
    ...row,
    version: row.entityType === "study_unit" ? 3 : 7
  }));
}

function entityPage(courseId, revision, rows) {
  return {
    contract: "aralearn.course-entities.v1",
    courseId,
    revision,
    items: structuredClone(rows),
    hasMore: false,
    nextCursor: null
  };
}

function sourceDescriptor() {
  return {
    courseId: SOURCE_ID,
    title: "Curso compartilhado",
    goal: "Aprender.",
    revision: 4,
    ownership: "shared",
    canEdit: false,
    canDerive: true,
    isPersonalCopy: false,
    personalCopyCourseId: null,
    moduleCount: 1,
    lessonCount: 1,
    topicCount: 0,
    microsequenceCount: 1,
    studyUnitCount: 1,
    completedStudyUnitCount: 0,
    updatedAt: "2026-08-21T10:00:00.000Z"
  };
}

function courseListPage() {
  return {
    contract: "aralearn.course-list.v1",
    items: [sourceDescriptor()],
    hasMore: false,
    nextCursor: null
  };
}

function personalCopySnapshot({
  revision = 2,
  studyUnitVersion = revision,
  unitTitle = "Unidade pessoal",
  moduleId = "module-a",
  lessonId = "lesson-a",
  microsequenceId = "micro-a",
  includeStudyUnit = true,
  updatedAt = "2026-08-21T10:05:00.000Z"
} = {}) {
  const document = courseDocument(TARGET_ID, studyUnit(unitTitle));
  const target = document.courses[0];
  const moduleValue = target.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  moduleValue.id = moduleId;
  lesson.id = lessonId;
  microsequence.id = microsequenceId;
  if (!includeStudyUnit) microsequence.studyUnits = [];
  const rows = flattenCourseDocument(document).rows.map((row) => ({
    ...row,
    version: row.entityType === "study_unit" ? studyUnitVersion : 1
  }));
  return {
    course: {
      contract: "aralearn.course.v1",
      courseId: TARGET_ID,
      title: target.title,
      goal: target.goal,
      revision,
      ownership: "owned",
      canEdit: true,
      canDerive: false,
      isPersonalCopy: true,
      personalCopyCourseId: null,
      sourceCourseId: SOURCE_ID,
      sourceCourseRevision: 4,
      updatedAt
    },
    rows,
    document
  };
}

function completedPersonalState() {
  return {
    contract: "aralearn.course-personal-state.v2",
    courseId: TARGET_ID,
    revision: 1,
    updatedAt: "2026-08-21T10:09:00.000Z",
    state: {
      version: 2,
      progress: {
        version: 3,
        lessons: {
          "lesson-a": {
            cursorStudyUnitId: "unit-a",
            completedStudyUnitIds: ["unit-a"]
          }
        }
      },
      reviewMarks: {}
    }
  };
}

function selection(courseId = SOURCE_ID) {
  return {
    courseId,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: "unit-a"
  };
}

function intent(requestId = "personal-copy-request-0001") {
  return {
    requestId,
    sourceCourseId: SOURCE_ID,
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 3,
    didacticMicrosequenceId: "micro-a",
    studyUnit: studyUnit("Unidade pessoal"),
    origin: "manual",
    targetId: "paragraph-a",
    sourceSelection: selection()
  };
}

function normalizedReceipt({ idempotent = false } = {}) {
  return {
    courseId: TARGET_ID,
    sourceCourseId: SOURCE_ID,
    sourceCourseRevision: 4,
    courseRevision: 2,
    studyUnitId: "unit-a",
    studyUnitVersion: 2,
    operation: "commit_personal_course_copy_edit",
    createdCopy: true,
    changed: true,
    idempotent,
    channel: "application",
    origin: "manual",
    updatedAt: "2026-08-21T10:05:00.000Z"
  };
}

function networkFailure() {
  return Object.assign(new Error("offline"), { status: 0, code: "network_error" });
}

class FakeActionNode {
  constructor() {
    this.listeners = new Map();
    this.dataset = {};
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({
        currentTarget: this,
        target: this,
        detail: 1,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
      });
    }
  }

  focus() {}
}

class FakeStudyRoot {
  #html = "";
  #nodes = new Map();

  set innerHTML(value) {
    this.#html = String(value || "");
    this.#nodes.clear();
  }

  get innerHTML() {
    return this.#html;
  }

  querySelector(selector) {
    const match = /^\[data-action='([^']+)'\]$/u.exec(selector);
    if (!match || !this.#html.includes(`data-action="${match[1]}"`)) return null;
    if (!this.#nodes.has(selector)) this.#nodes.set(selector, new FakeActionNode());
    return this.#nodes.get(selector);
  }

  querySelectorAll() {
    return [];
  }

  setAttribute() {}

  removeAttribute() {}

  dispatchEvent() { return true; }

  click(action) {
    const node = this.querySelector(`[data-action='${action}']`);
    if (!node) throw new Error(`Ação ausente no teste: ${action}`);
    node.dispatch("click");
  }
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function basicApplicationRepository(getProject, overrides = {}) {
  return {
    loadProgress() { return { version: 1, lessons: {} }; },
    loadStudyNavigation() { return null; },
    loadCourseSummaries() {
      return getProject().courses.map((course) => ({
        courseId: course.id,
        title: course.title,
        revision: 4,
        ownership: "shared",
        canEdit: false,
        canDerive: true,
        isPersonalCopy: false,
        personalCopyCourseId: null,
        moduleCount: 1,
        lessonCount: 1,
        microsequenceCount: 1,
        studyUnitCount: 1,
        completedStudyUnitCount: 0
      }));
    },
    loadRuntimeStatus() { return {}; },
    loadReviewItems() { return []; },
    hasMoreReviewItems() { return false; },
    loadAnnotationsForPath() { return []; },
    isStudyUnitMarkedForReview() { return false; },
    loadProject() { return structuredClone(getProject()); },
    async loadCourse() { return structuredClone(getProject()); },
    loadStudyUnitCompositionContext(reference) {
      return {
        courseId: reference.courseId,
        courseRevision: 4,
        didacticMicrosequenceId: reference.microsequenceId,
        studyUnitId: reference.studyUnitId,
        studyUnitVersion: 3
      };
    },
    async clearStudyNavigationPosition() { return true; },
    ...overrides
  };
}

function controllerApi({ commit, target = null, targetPersonalState = null }) {
  const rows = sourceRows();
  const targetSnapshot = () => typeof target === "function" ? target() : target;
  return {
    async listCourses() { return courseListPage(); },
    async getCourse(courseId) {
      if (courseId === TARGET_ID) {
        const snapshot = targetSnapshot();
        if (!snapshot) throw networkFailure();
        return structuredClone(snapshot.course);
      }
      return {
        contract: "aralearn.course.v1",
        courseId: SOURCE_ID,
        title: "Curso compartilhado",
        goal: "Aprender.",
        revision: 4,
        ownership: "shared",
        canEdit: false,
        canDerive: true,
        isPersonalCopy: false,
        personalCopyCourseId: null
      };
    },
    async getCourseEntities(courseId) {
      if (courseId === TARGET_ID) {
        const snapshot = targetSnapshot();
        if (!snapshot) throw networkFailure();
        return entityPage(
          TARGET_ID,
          snapshot.course.revision,
          snapshot.rows
        );
      }
      return entityPage(SOURCE_ID, 4, rows);
    },
    commitPersonalCourseCopyEdit: commit,
    async listCourseReviewItems() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async loadPersonalState(courseId) {
      return courseId === TARGET_ID && targetPersonalState
        ? structuredClone(targetPersonalState)
        : null;
    },
    async mutatePersonalState() { throw new Error("não usado"); }
  };
}

async function seedSource(controller) {
  await controller.listCourses();
  await controller.loadCourseDocument(SOURCE_ID, { verifiedRevision: 4 });
}

async function prepareLostConfirmationRecovery(context, {
  target,
  targetPersonalState = null
}) {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  let commitCalls = 0;
  const api = controllerApi({
    target,
    targetPersonalState,
    async commit() {
      commitCalls += 1;
      if (commitCalls === 1) throw networkFailure();
      return normalizedReceipt({ idempotent: true });
    }
  });
  const controller = new CourseController({ api, store });
  await seedSource(controller);
  await assert.rejects(
    controller.commitPersonalCourseCopyEdit(intent()),
    /offline/u
  );
  const repository = new CourseStudyRepository({
    bridge: new CourseStudyBridge({ controller }),
    api,
    cache: store,
    windowValue: {}
  });
  await repository.initialize();
  await repository.loadCourse(SOURCE_ID);
  return {
    controller,
    repository,
    commitCallCount: () => commitCalls
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("cliente Edge envia apenas o comando focal e normaliza a confirmação da cópia", async () => {
  let request = null;
  const rawReceipt = {
    contract: "aralearn.personal-course-copy-edit.v1",
    operation: "commit_personal_course_copy_edit",
    sourceCourseId: SOURCE_ID,
    sourceCourseRevision: 4,
    targetCourseId: TARGET_ID,
    targetCourseRevision: 2,
    studyUnitId: "unit-a",
    studyUnitVersion: 2,
    applicationOrigin: "manual",
    channel: "application",
    createdCopy: true,
    changed: true,
    idempotent: false,
    updatedAt: "2026-08-21T10:05:00.000Z"
  };
  const client = new CourseApiClient({
    projectUrl: "https://project.invalid",
    publishableKey: "publishable",
    authClient: { async getAccessToken() { return "access"; } },
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return jsonResponse({ ok: true, data: rawReceipt });
    }
  });

  const command = intent();
  const result = await client.commitPersonalCourseCopyEdit({
    requestId: command.requestId,
    sourceCourseId: command.sourceCourseId,
    expectedSourceCourseRevision: command.expectedSourceCourseRevision,
    expectedStudyUnitVersion: command.expectedStudyUnitVersion,
    didacticMicrosequenceId: command.didacticMicrosequenceId,
    studyUnit: command.studyUnit,
    origin: command.origin
  });

  assert.match(request.url,
    new RegExp(
      `/functions/v1/aralearn-course-api/v1/courses/${SOURCE_ID}/personal-copy/composition$`,
      "u"
    ));
  assert.deepEqual(Object.keys(request.body).sort(), [
    "applicationOrigin", "didacticMicrosequenceId", "expectedSourceCourseRevision",
    "expectedStudyUnitVersion", "requestId", "sourceCourseId", "studyUnit"
  ]);
  assert.equal(JSON.stringify(request.body).includes("paragraph-a"), true);
  assert.equal(Object.hasOwn(request.body, "targetId"), false);
  assert.equal(Object.hasOwn(request.body, "sourceSelection"), false);
  assert.equal(Object.hasOwn(request.body, "sourceLinks"), false);
  assert.deepEqual(result, normalizedReceipt());
});

test("cliente distingue no-op de cópia materializada e recusa revisão física inesperada", async () => {
  const command = intent();
  const raw = {
    contract: "aralearn.personal-course-copy-edit.v1",
    operation: "commit_personal_course_copy_edit",
    sourceCourseId: SOURCE_ID,
    sourceCourseRevision: 4,
    targetCourseId: null,
    targetCourseRevision: null,
    studyUnitId: "unit-a",
    studyUnitVersion: 3,
    applicationOrigin: "manual",
    channel: "application",
    createdCopy: false,
    changed: false,
    idempotent: false,
    updatedAt: "2026-08-21T10:05:00.000Z"
  };
  let responseValue = raw;
  const client = new CourseApiClient({
    projectUrl: "https://project.invalid",
    publishableKey: "publishable",
    authClient: { async getAccessToken() { return "access"; } },
    fetchImpl: async () => jsonResponse({ ok: true, data: responseValue })
  });
  const apiCommand = {
    requestId: command.requestId,
    sourceCourseId: command.sourceCourseId,
    expectedSourceCourseRevision: command.expectedSourceCourseRevision,
    expectedStudyUnitVersion: command.expectedStudyUnitVersion,
    didacticMicrosequenceId: command.didacticMicrosequenceId,
    studyUnit: command.studyUnit,
    origin: command.origin
  };

  const noOp = await client.commitPersonalCourseCopyEdit(apiCommand);
  assert.equal(noOp.changed, false);
  assert.equal(noOp.courseId, null);
  assert.equal(noOp.studyUnitVersion, 3);

  responseValue = {
    ...raw,
    targetCourseId: TARGET_ID,
    targetCourseRevision: 3,
    studyUnitVersion: 2,
    createdCopy: true,
    changed: true
  };
  await assert.rejects(client.commitPersonalCourseCopyEdit(apiCommand),
    /confirmação não corresponde/iu);
});

test("cliente preserva o target do conflito sem aceitar confirmação frouxa", async () => {
  const client = new CourseApiClient({
    projectUrl: "https://project.invalid",
    publishableKey: "publishable",
    authClient: { async getAccessToken() { return "access"; } },
    fetchImpl: async () => jsonResponse({
      error: {
        code: "personal_copy_exists",
        message: "A cópia já existe.",
        details: { targetCourseId: TARGET_ID }
      }
    }, 409)
  });
  const command = intent();

  await assert.rejects(client.commitPersonalCourseCopyEdit({
    requestId: command.requestId,
    sourceCourseId: command.sourceCourseId,
    expectedSourceCourseRevision: command.expectedSourceCourseRevision,
    expectedStudyUnitVersion: command.expectedStudyUnitVersion,
    didacticMicrosequenceId: command.didacticMicrosequenceId,
    studyUnit: command.studyUnit,
    origin: command.origin
  }), (error) => {
    assert.equal(error.code, "personal_copy_exists");
    assert.equal(error.targetCourseId, TARGET_ID);
    return true;
  });
});

test("resposta ambígua sobrevive à recarga, repete o mesmo comando e promove a cópia offline", async (context) => {
  const indexedDb = new IDBFactory();
  const firstStore = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  let calls = 0;
  const sent = [];
  const api = controllerApi({
    target: personalCopySnapshot(),
    async commit(value) {
      calls += 1;
      sent.push(structuredClone(value));
      if (calls === 1) throw networkFailure();
      return normalizedReceipt({ idempotent: true });
    }
  });
  const first = new CourseController({ api, store: firstStore });
  await seedSource(first);
  await assert.rejects(first.commitPersonalCourseCopyEdit(intent()), /offline/u);
  const pending = await first.loadPendingPersonalCopyEdit();
  assert.equal(pending.requestId, "personal-copy-request-0001");
  assert.equal(pending.targetId, "paragraph-a");
  assert.deepEqual(pending.sourceSelection, selection());
  assert.equal(Object.hasOwn(pending, "sourceLinks"), false);
  assert.equal(JSON.stringify(pending).includes("prompt"), false);
  firstStore.close();

  const secondStore = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => secondStore.close());
  const second = new CourseController({ api, store: secondStore });
  const result = await second.retryPendingPersonalCopyEdit();

  assert.equal(calls, 2);
  assert.deepEqual(sent[1], sent[0]);
  assert.equal(result.courseId, TARGET_ID);
  assert.equal(result.reconciled, true);
  assert.equal(result.document.courses[0].id, TARGET_ID);
  assert.equal(result.document.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0].title, "Unidade pessoal");
  assert.equal(await second.loadPendingPersonalCopyEdit(), null);
  const cached = await second.loadCourseDocument(TARGET_ID, { verifiedRevision: 2 });
  assert.equal(cached.document.courses[0].id, TARGET_ID);
  assert.equal(cached.rows.find((row) => row.entityType === "study_unit").version, 2);
  assert.equal(cached.rows.filter((row) => row.entityType !== "study_unit")
    .every((row) => row.version === 1), true);
  api.listCourses = async () => { throw networkFailure(); };
  const list = await second.listCourses();
  assert.equal(list.items.find((item) => item.courseId === SOURCE_ID)
    .personalCopyCourseId, TARGET_ID);
  assert.equal(list.items.find((item) => item.courseId === SOURCE_ID).canDerive, false);
  const target = list.items.find((item) => item.courseId === TARGET_ID);
  assert.equal(target.isPersonalCopy, true);
  assert.equal(target.sourceCourseId, SOURCE_ID);
});

test("confirmação perdida relê a revisão 3 e preserva seu conteúdo e progresso", async (context) => {
  const target = personalCopySnapshot({
    revision: 3,
    studyUnitVersion: 3,
    unitTitle: "Unidade pessoal atual",
    updatedAt: "2026-08-21T10:10:00.000Z"
  });
  const {
    controller,
    repository,
    commitCallCount
  } = await prepareLostConfirmationRecovery(context, {
    target,
    targetPersonalState: completedPersonalState()
  });

  const result = await repository.retryPendingPersonalCopyEdit(SOURCE_ID);

  assert.equal(commitCallCount(), 2);
  assert.equal(result.courseRevision, 3);
  assert.equal(result.studyUnitVersion, 3);
  assert.equal(result.studyUnit.title, "Unidade pessoal atual");
  assert.equal(result.selection.courseId, TARGET_ID);
  assert.equal(result.project.courses.find(({ id }) => id === TARGET_ID)
    .modules[0].lessons[0].microsequences[0].studyUnits[0].title,
  "Unidade pessoal atual");
  assert.equal(repository.isStudyUnitCompleted(result.selection), true);
  const targetSummary = repository.loadCourseSummaries()
    .find(({ courseId }) => courseId === TARGET_ID);
  assert.equal(targetSummary.revision, 3);
  assert.equal(targetSummary.completedStudyUnitCount, 1);
  assert.equal(await controller.hasVerifiedCourseDocument(TARGET_ID, { revision: 3 }), true);
  assert.equal(await controller.hasVerifiedCourseDocument(TARGET_ID, { revision: 2 }), false);
  assert.equal(await controller.loadPendingPersonalCopyEdit(), null);
});

test("releitura idempotente indisponível mantém a intenção sem inventar revisão 2", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  let calls = 0;
  const api = controllerApi({
    async commit() {
      calls += 1;
      if (calls === 1) throw networkFailure();
      return normalizedReceipt({ idempotent: true });
    }
  });
  const controller = new CourseController({ api, store });
  await seedSource(controller);
  await assert.rejects(
    controller.commitPersonalCourseCopyEdit(intent()),
    /offline/u
  );

  await assert.rejects(
    controller.retryPendingPersonalCopyEdit(SOURCE_ID),
    (error) => {
      assert.equal(error.code, "personal_copy_reconciliation_pending");
      assert.equal(error.ambiguous, true);
      return true;
    }
  );

  assert.equal(calls, 2);
  assert.equal((await controller.loadPendingPersonalCopyEdit()).requestId,
    "personal-copy-request-0001");
  assert.equal(await controller.hasVerifiedCourseDocument(TARGET_ID, { revision: 2 }), false);
});

test("retomada confirma primeiro e abre o target mesmo após revogação da origem", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  let calls = 0;
  let sourceRevoked = false;
  const api = controllerApi({
    target: personalCopySnapshot({
      revision: 3,
      studyUnitVersion: 3,
      unitTitle: "Unidade preservada no target"
    }),
    async commit() {
      calls += 1;
      if (calls === 1) throw networkFailure();
      return normalizedReceipt({ idempotent: true });
    }
  });
  const getCourse = api.getCourse.bind(api);
  const getCourseEntities = api.getCourseEntities.bind(api);
  api.getCourse = async (courseId, options) => {
    if (sourceRevoked && courseId === SOURCE_ID) {
      throw Object.assign(new Error("Acesso revogado."), {
        status: 403,
        code: "42501"
      });
    }
    return getCourse(courseId, options);
  };
  api.getCourseEntities = async (courseId, options) => {
    if (sourceRevoked && courseId === SOURCE_ID) {
      throw Object.assign(new Error("Acesso revogado."), {
        status: 403,
        code: "42501"
      });
    }
    return getCourseEntities(courseId, options);
  };
  const controller = new CourseController({ api, store });
  await seedSource(controller);
  await assert.rejects(
    controller.commitPersonalCourseCopyEdit(intent()),
    /offline/u
  );
  await Promise.all([
    store.deleteCachePrefix(`course.v1.header:${SOURCE_ID}`),
    store.deleteCachePrefix(`course.v1.verified-composition:${SOURCE_ID}`),
    store.deleteCachePrefix(`course.v1.entities:${SOURCE_ID}:`)
  ]);
  sourceRevoked = true;

  const result = await controller.retryPendingPersonalCopyEdit(SOURCE_ID);

  assert.equal(calls, 2);
  assert.equal(result.courseId, TARGET_ID);
  assert.equal(result.courseRevision, 3);
  assert.equal(result.studyUnit.title, "Unidade preservada no target");
  assert.equal(await controller.loadPendingPersonalCopyEdit(), null);
});

test("retomada acompanha a Unidade movida na revisão atual da cópia", async (context) => {
  const { repository } = await prepareLostConfirmationRecovery(context, {
    target: personalCopySnapshot({
      revision: 3,
      studyUnitVersion: 3,
      unitTitle: "Unidade pessoal movida",
      moduleId: "module-b",
      lessonId: "lesson-b",
      microsequenceId: "micro-b",
      updatedAt: "2026-08-21T10:10:00.000Z"
    })
  });

  const result = await repository.retryPendingPersonalCopyEdit(SOURCE_ID);

  assert.deepEqual(result.selection, {
    courseId: TARGET_ID,
    moduleId: "module-b",
    lessonId: "lesson-b",
    microsequenceId: "micro-b",
    studyUnitId: "unit-a",
    studyUnitIndex: 0
  });
  assert.equal(result.studyUnit.title, "Unidade pessoal movida");
});

test("retomada sem a Unidade removida abre o Curso e encerra a pendência", async (context) => {
  const {
    controller,
    repository,
    commitCallCount
  } = await prepareLostConfirmationRecovery(context, {
    target: personalCopySnapshot({
      revision: 3,
      includeStudyUnit: false,
      updatedAt: "2026-08-21T10:10:00.000Z"
    })
  });

  const result = await repository.retryPendingPersonalCopyEdit(SOURCE_ID);

  assert.equal(result.courseRevision, 3);
  assert.equal(result.studyUnit, null);
  assert.equal(result.studyUnitVersion, null);
  assert.deepEqual(result.selection, {
    courseId: TARGET_ID,
    moduleId: "module-a",
    lessonId: "lesson-a",
    microsequenceId: "micro-a",
    studyUnitId: null,
    studyUnitIndex: 0
  });
  assert.equal(await controller.loadPendingPersonalCopyEdit(), null);
  assert.equal(await repository.retryPendingPersonalCopyEdit(SOURCE_ID), null);
  assert.equal(commitCallCount(), 2);
});

test("duas instâncias usam um único envelope e o mesmo requestId", async (context) => {
  const indexedDb = new IDBFactory();
  const [firstStore, secondStore] = await Promise.all([
    CourseLocalStore.open(indexedDb, { userId: USER_ID }),
    CourseLocalStore.open(indexedDb, { userId: USER_ID })
  ]);
  context.after(() => {
    firstStore.close();
    secondStore.close();
  });
  const sent = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const api = controllerApi({
    target: personalCopySnapshot(),
    async commit(value) {
      sent.push(structuredClone(value));
      const callNumber = sent.length;
      if (sent.length === 2) release();
      await gate;
      return normalizedReceipt({ idempotent: callNumber > 1 });
    }
  });
  const first = new CourseController({ api, store: firstStore });
  const second = new CourseController({ api, store: secondStore });
  await seedSource(first);

  const [left, right] = await Promise.all([
    first.commitPersonalCourseCopyEdit(intent("personal-copy-first-0001")),
    second.commitPersonalCourseCopyEdit(intent("personal-copy-second-0002"))
  ]);

  assert.equal(left.courseId, TARGET_ID);
  assert.equal(right.courseId, TARGET_ID);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].requestId, sent[1].requestId);
  assert.equal(new Set([
    "personal-copy-first-0001", "personal-copy-second-0002"
  ]).has(sent[0].requestId), true);
  assert.equal(left.reconciled, true);
  assert.equal(right.reconciled, true);
  assert.equal(await first.loadPendingPersonalCopyEdit(), null);
});

test("resposta tardia de P não apaga Q guardada por outra aba", async (context) => {
  const indexedDb = new IDBFactory();
  const [firstStore, secondStore] = await Promise.all([
    CourseLocalStore.open(indexedDb, { userId: USER_ID }),
    CourseLocalStore.open(indexedDb, { userId: USER_ID })
  ]);
  context.after(() => {
    firstStore.close();
    secondStore.close();
  });
  let signalFirstRequest;
  let releaseFirstRequest;
  const firstRequestStarted = new Promise((resolve) => {
    signalFirstRequest = resolve;
  });
  const firstRequestGate = new Promise((resolve) => {
    releaseFirstRequest = resolve;
  });
  const api = controllerApi({
    target: personalCopySnapshot(),
    async commit(value) {
      if (value.requestId === "personal-copy-first-0001") {
        signalFirstRequest();
        await firstRequestGate;
        return normalizedReceipt();
      }
      throw networkFailure();
    }
  });
  const first = new CourseController({ api, store: firstStore });
  const second = new CourseController({ api, store: secondStore });
  await seedSource(first);

  const delayedFirst = first.commitPersonalCourseCopyEdit(
    intent("personal-copy-first-0001")
  );
  await firstRequestStarted;
  assert.equal(await second.clearPendingPersonalCopyEdit(
    SOURCE_ID,
    "personal-copy-first-0001"
  ), true);
  await assert.rejects(
    second.commitPersonalCourseCopyEdit(intent("personal-copy-second-0002")),
    /offline/u
  );
  releaseFirstRequest();
  const firstResult = await delayedFirst;

  assert.equal(firstResult.courseId, TARGET_ID);
  const pending = await second.loadPendingPersonalCopyEdit(SOURCE_ID);
  assert.equal(pending.requestId, "personal-copy-second-0002");
});

test("releitura antiga não rebaixa a composição verificada mais recente", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  let target = personalCopySnapshot({
    revision: 4,
    studyUnitVersion: 4,
    unitTitle: "Unidade na revisão 4",
    updatedAt: "2026-08-21T10:15:00.000Z"
  });
  let calls = 0;
  const api = controllerApi({
    target: () => target,
    async commit() {
      calls += 1;
      if (calls === 1) throw networkFailure();
      return normalizedReceipt({ idempotent: true });
    }
  });
  const controller = new CourseController({ api, store });
  await seedSource(controller);
  await controller.loadCourseDocument(TARGET_ID, { verifiedRevision: 4 });
  await assert.rejects(
    controller.commitPersonalCourseCopyEdit(intent()),
    /offline/u
  );
  target = personalCopySnapshot({
    revision: 3,
    studyUnitVersion: 3,
    unitTitle: "Unidade na releitura antiga",
    updatedAt: "2026-08-21T10:10:00.000Z"
  });

  const result = await controller.retryPendingPersonalCopyEdit(SOURCE_ID);

  assert.equal(result.courseRevision, 4);
  assert.equal(result.studyUnitVersion, 4);
  assert.equal(result.studyUnit.title, "Unidade na revisão 4");
  assert.equal(await controller.hasVerifiedCourseDocument(TARGET_ID, { revision: 4 }), true);
  assert.equal(await controller.hasVerifiedCourseDocument(TARGET_ID, { revision: 3 }), false);
  assert.equal(await controller.hasVerifiedCourseDocument(TARGET_ID, { revision: 2 }), false);
});

test("conflito mantém o rascunho no logout; descarte explícito o remove", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  const conflict = Object.assign(new Error("A cópia já existe."), {
    status: 409,
    code: "personal_copy_exists",
    targetCourseId: TARGET_ID
  });
  const api = controllerApi({ async commit() { throw conflict; } });
  const learner = new CourseController({ api, store });
  await seedSource(learner);

  await assert.rejects(learner.commitPersonalCourseCopyEdit(intent()), (error) => {
    assert.equal(error.targetCourseId, TARGET_ID);
    assert.equal(error.pending.studyUnit.title, "Unidade pessoal");
    return true;
  });
  assert.equal((await learner.loadPendingPersonalCopyEdit(SOURCE_ID)).targetId,
    "paragraph-a");
  await learner.clearPendingCourseCompositions();
  const reloadedStore = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => reloadedStore.close());
  const reloaded = new CourseController({ api, store: reloadedStore });
  assert.equal((await reloaded.loadPendingPersonalCopyEdit(SOURCE_ID)).requestId,
    "personal-copy-request-0001");
  assert.equal(await reloaded.clearPendingPersonalCopyEdit(SOURCE_ID), true);
  assert.equal(await learner.loadPendingPersonalCopyEdit(), null);

  const owner = new CourseController({ api, store, ownerOnly: true });
  await assert.rejects(owner.commitPersonalCourseCopyEdit(intent()),
    /Estudo não oferece edição/u);
});

test("descarte atrasado de outra aba não apaga uma intenção pessoal mais nova", async (context) => {
  const indexedDb = new IDBFactory();
  const [firstStore, secondStore] = await Promise.all([
    CourseLocalStore.open(indexedDb, { userId: USER_ID }),
    CourseLocalStore.open(indexedDb, { userId: USER_ID })
  ]);
  context.after(() => {
    firstStore.close();
    secondStore.close();
  });
  const key = coursePendingPersonalCopyEditCacheKey();
  const firstPending = {
    contract: "aralearn.personal-course-copy-edit-pending.v1",
    ...intent("personal-copy-old-0001"),
    savedAt: "2026-08-21T10:00:00.000Z"
  };
  await firstStore.putCache(key, firstPending);
  const api = controllerApi({ async commit() { throw networkFailure(); } });
  const first = new CourseController({ api, store: firstStore });
  const second = new CourseController({ api, store: secondStore });
  const originalUpdate = secondStore.updateCache.bind(secondStore);
  let releaseDelayedClear;
  let signalDelayedClear;
  const delayedClearStarted = new Promise((resolve) => { signalDelayedClear = resolve; });
  const delayedClearGate = new Promise((resolve) => { releaseDelayedClear = resolve; });
  secondStore.updateCache = async (cacheKey, updater) => {
    signalDelayedClear();
    await delayedClearGate;
    return originalUpdate(cacheKey, updater);
  };

  const delayedClear = second.clearPendingPersonalCopyEdit(SOURCE_ID);
  await delayedClearStarted;
  assert.equal(await first.clearPendingPersonalCopyEdit(SOURCE_ID), true);
  const newerPending = {
    ...firstPending,
    requestId: "personal-copy-new-0002",
    studyUnit: studyUnit("Unidade pessoal mais nova"),
    savedAt: "2026-08-21T10:10:00.000Z"
  };
  await firstStore.putCache(key, newerPending);
  releaseDelayedClear();

  assert.equal(await delayedClear, false);
  const preserved = await first.loadPendingPersonalCopyEdit();
  assert.equal(preserved.requestId, "personal-copy-new-0002");
  assert.equal(preserved.studyUnit.title, "Unidade pessoal mais nova");
});

test("cancelar o rascunho do Curso B retoma P do Curso A sem apagá-la", async () => {
  const project = {
    contract: "aralearn.course.v1",
    courses: [
      courseDocument(SOURCE_ID, studyUnit("Unidade A")).courses[0],
      courseDocument(TARGET_ID, studyUnit("Unidade B")).courses[0]
    ]
  };
  const pendingA = {
    contract: "aralearn.personal-course-copy-edit-pending.v1",
    ...intent("personal-copy-course-a-0001"),
    targetId: "content:paragraph-a",
    studyUnit: paragraphEditedStudyUnit(
      "Unidade A",
      "Alteração P guardada."
    ),
    savedAt: "2026-08-21T10:00:00.000Z"
  };
  const summaries = project.courses.map((course) => ({
    courseId: course.id,
    title: course.title,
    revision: 4,
    ownership: "shared",
    canEdit: false,
    canDerive: true,
    isPersonalCopy: false,
    personalCopyCourseId: null,
    moduleCount: 1,
    lessonCount: 1,
    microsequenceCount: 1,
    studyUnitCount: 1,
    completedStudyUnitCount: 0
  }));
  const pending = structuredClone(pendingA);
  const clearCalls = [];
  let pendingLoadCalls = 0;
  let signalResumed;
  const pendingResumed = new Promise((resolve) => { signalResumed = resolve; });
  const repository = {
    loadProgress() { return { version: 1, lessons: {} }; },
    loadStudyNavigation() { return null; },
    loadCourseSummaries() { return structuredClone(summaries); },
    loadRuntimeStatus() { return {}; },
    loadReviewItems() { return []; },
    hasMoreReviewItems() { return false; },
    loadAnnotationsForPath() { return []; },
    isStudyUnitMarkedForReview() { return false; },
    loadProject() { return structuredClone(project); },
    async loadCourse() { return structuredClone(project); },
    loadStudyUnitCompositionContext(reference) {
      return {
        courseId: reference.courseId,
        courseRevision: 4,
        didacticMicrosequenceId: reference.microsequenceId,
        studyUnitId: reference.studyUnitId,
        studyUnitVersion: 3
      };
    },
    async loadPendingPersonalCopyEdit() {
      pendingLoadCalls += 1;
      if (pendingLoadCalls === 2) signalResumed();
      return structuredClone(pending);
    },
    async clearPendingPersonalCopyEdit(sourceCourseId, expectedRequestId) {
      clearCalls.push([sourceCourseId, expectedRequestId]);
      return false;
    }
  };
  const root = new FakeStudyRoot();
  const saves = [];
  let signalSave;
  const saveCalled = new Promise((resolve) => { signalSave = resolve; });
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: project,
    async onSaveManualEdit(value) {
      saves.push(structuredClone(value));
      signalSave();
      const error = new Error("Há outra alteração pessoal guardada.");
      error.code = "personal_copy_edit_pending";
      error.pending = structuredClone(pendingA);
      throw error;
    }
  });

  await app.openEntityPath(studyUnitPath(TARGET_ID));
  assert.equal(app.previewManualEdit({
    targetId: "study_unit",
    pathValues: { title: "Unidade B editada" },
    origin: "manual"
  }), true);
  root.click("study-manual-save");
  await saveCalled;
  await nextTurn();

  assert.equal(saves.length, 1);
  assert.equal(saves[0].courseId, TARGET_ID);
  assert.equal(saves[0].sourceSelection.courseId, TARGET_ID);
  assert.equal(saves[0].replacesPendingRequestId, null);
  assert.equal(pending.requestId, pendingA.requestId);
  assert.equal(app.hasPendingManualEdit(), true);

  root.click("study-manual-cancel");
  await pendingResumed;
  await nextTurn();

  assert.deepEqual(clearCalls, []);
  assert.equal(pendingLoadCalls, 2);
  assert.equal(pending.requestId, pendingA.requestId);
  assert.equal(pending.sourceCourseId, SOURCE_ID);
  assert.equal(root.innerHTML.includes(
    "A alteração que já estava guardada foi retomada"
  ), true);
  assert.equal(app.hasPendingManualEdit(), true);
  app.destroy();
});

test("conflito entre P e Q no mesmo Curso cancela Q e retoma P", async () => {
  const project = courseDocument(
    SOURCE_ID,
    studyUnit("Unidade A")
  );
  const pendingP = {
    contract: "aralearn.personal-course-copy-edit-pending.v1",
    ...intent("personal-copy-course-a-0001"),
    targetId: "content:paragraph-a",
    studyUnit: paragraphEditedStudyUnit(
      "Unidade A",
      "Alteração P guardada."
    ),
    savedAt: "2026-08-21T10:00:00.000Z"
  };
  let pendingLoadCalls = 0;
  const clearCalls = [];
  let signalResumed;
  const pendingResumed = new Promise((resolve) => { signalResumed = resolve; });
  const repository = basicApplicationRepository(
    () => project,
    {
      async loadPendingPersonalCopyEdit() {
        pendingLoadCalls += 1;
        if (pendingLoadCalls === 2) signalResumed();
        return structuredClone(pendingP);
      },
      async clearPendingPersonalCopyEdit(sourceCourseId, requestId) {
        clearCalls.push([sourceCourseId, requestId]);
        return false;
      }
    }
  );
  const root = new FakeStudyRoot();
  const saves = [];
  let signalFirstSave;
  let signalSecondSave;
  const firstSaveCalled = new Promise((resolve) => { signalFirstSave = resolve; });
  const secondSaveCalled = new Promise((resolve) => { signalSecondSave = resolve; });
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: project,
    async onSaveManualEdit(value) {
      saves.push(structuredClone(value));
      if (saves.length === 1) {
        signalFirstSave();
        const error = new Error("Há outra alteração pessoal guardada.");
        error.code = "personal_copy_edit_pending";
        error.pending = structuredClone(pendingP);
        throw error;
      }
      signalSecondSave();
      throw networkFailure();
    }
  });

  await app.openEntityPath(studyUnitPath(SOURCE_ID));
  assert.equal(app.previewManualEdit({
    targetId: "study_unit",
    pathValues: { title: "Rascunho Q diferente" },
    origin: "manual"
  }), true);
  root.click("study-manual-save");
  await firstSaveCalled;
  await nextTurn();

  assert.equal(saves[0].targetId, "study_unit");
  assert.equal(saves[0].studyUnit.title, "Rascunho Q diferente");
  assert.equal(saves[0].courseId, SOURCE_ID);

  root.click("study-manual-cancel");
  await pendingResumed;
  await nextTurn();

  assert.deepEqual(clearCalls, []);
  assert.equal(pendingLoadCalls, 2);
  assert.equal(root.innerHTML.includes(
    "A alteração que já estava guardada foi retomada"
  ), true);
  assert.equal(app.hasPendingManualEdit(), true);

  root.click("study-manual-save");
  await secondSaveCalled;
  await nextTurn();

  assert.equal(saves[1].courseId, SOURCE_ID);
  assert.equal(saves[1].targetId, "content:paragraph-a");
  assert.deepEqual(saves[1].studyUnit, pendingP.studyUnit);
  assert.deepEqual(clearCalls, []);
  app.destroy();
});

test("replay idempotente avançado usa a cabeça atual sem criar Desfazer", async () => {
  const sourceProject = courseDocument(
    SOURCE_ID,
    studyUnit("Unidade A")
  );
  const targetUnit = paragraphEditedStudyUnit(
    "Cabeça pessoal atual",
    "Conteúdo preservado na revisão 3."
  );
  const targetCourse = courseDocument(TARGET_ID, targetUnit).courses[0];
  const advancedProject = {
    contract: "aralearn.course.v1",
    courses: [sourceProject.courses[0], targetCourse]
  };
  let currentProject = structuredClone(sourceProject);
  let pending = {
    contract: "aralearn.personal-course-copy-edit-pending.v1",
    ...intent("personal-copy-replay-0001"),
    targetId: "content:paragraph-a",
    studyUnit: paragraphEditedStudyUnit(
      "Unidade A",
      "Primeira alteração P."
    ),
    savedAt: "2026-08-21T10:00:00.000Z"
  };
  const clearCalls = [];
  let signalSave;
  const saveCalled = new Promise((resolve) => { signalSave = resolve; });
  const repository = basicApplicationRepository(
    () => currentProject,
    {
      loadCourseSummaries() {
        return currentProject.courses.map((course) => course.id === TARGET_ID
          ? {
              courseId: TARGET_ID,
              title: course.title,
              revision: 3,
              ownership: "owned",
              canEdit: true,
              canDerive: false,
              isPersonalCopy: true,
              personalCopyCourseId: null,
              sourceCourseId: SOURCE_ID,
              sourceCourseRevision: 4,
              studyUnitCount: 1,
              completedStudyUnitCount: 0
            }
          : {
              courseId: SOURCE_ID,
              title: course.title,
              revision: 4,
              ownership: "shared",
              canEdit: false,
              canDerive: pending !== null,
              isPersonalCopy: false,
              personalCopyCourseId: pending === null ? TARGET_ID : null,
              studyUnitCount: 1,
              completedStudyUnitCount: 0
            });
      },
      async loadPendingPersonalCopyEdit() {
        return pending == null ? null : structuredClone(pending);
      },
      async clearPendingPersonalCopyEdit(sourceCourseId, requestId) {
        clearCalls.push([sourceCourseId, requestId]);
        if (!pending || pending.sourceCourseId !== sourceCourseId ||
            pending.requestId !== requestId) return false;
        pending = null;
        return true;
      }
    }
  );
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: sourceProject,
    async onSaveManualEdit(value) {
      signalSave();
      currentProject = structuredClone(advancedProject);
      return {
        courseId: TARGET_ID,
        sourceCourseId: SOURCE_ID,
        sourceCourseRevision: 4,
        courseRevision: 3,
        studyUnitId: "unit-a",
        studyUnitVersion: 3,
        studyUnit: structuredClone(targetUnit),
        version: 3,
        origin: value.origin,
        createdCopy: true,
        changed: true,
        idempotent: true,
        reconciled: true,
        project: structuredClone(advancedProject),
        selection: selection(TARGET_ID)
      };
    }
  });

  assert.equal(await app.resumePendingManualEdit({ retry: false }), true);
  root.click("study-manual-save");
  await saveCalled;
  await nextTurn();

  assert.deepEqual(clearCalls, [[SOURCE_ID, "personal-copy-replay-0001"]]);
  assert.equal(pending, null);
  assert.equal(root.innerHTML.includes("Sua cópia já avançou"), true);
  assert.equal(root.innerHTML.includes("Cabeça pessoal atual"), true);
  assert.equal(root.innerHTML.includes("Conteúdo preservado na revisão 3."), true);
  assert.equal(root.innerHTML.includes('data-action="study-manual-undo"'), false);

  assert.equal(root.innerHTML.includes("Cabeça pessoal atual"), true);
  assert.equal(root.innerHTML.includes("Primeira alteração P."), false);
  assert.equal(root.innerHTML.includes("data-action=\"study-manual-cancel\""), false);
  app.destroy();
});

test("refresh revogado preserva P até a retomada limpá-la pelo pedido exato", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  context.after(() => store.close());
  let commitCalls = 0;
  const api = controllerApi({
    async commit() {
      commitCalls += 1;
      if (commitCalls === 1) throw networkFailure();
      throw Object.assign(new Error("Acesso revogado."), {
        status: 403,
        code: "42501"
      });
    }
  });
  const controller = new CourseController({ api, store });
  await seedSource(controller);
  await assert.rejects(
    controller.commitPersonalCourseCopyEdit(intent("personal-copy-revoked-0001")),
    /offline/u
  );
  api.listCourses = async () => ({
    contract: "aralearn.course-list.v1",
    items: [],
    hasMore: false,
    nextCursor: null
  });

  const refreshedList = await controller.listCourses();

  assert.deepEqual(refreshedList.items, []);
  assert.equal(await controller.hasVerifiedCourseDocument(
    SOURCE_ID,
    { revision: 4 }
  ), false);
  assert.equal((await controller.loadPendingPersonalCopyEdit()).requestId,
    "personal-copy-revoked-0001");

  const retainedProject = courseDocument(
    TARGET_ID,
    studyUnit("Unidade B")
  );
  const clearCalls = [];
  const repository = basicApplicationRepository(
    () => retainedProject,
    {
      loadPendingPersonalCopyEdit(sourceCourseId = null) {
        return controller.loadPendingPersonalCopyEdit(sourceCourseId);
      },
      retryPendingPersonalCopyEdit(sourceCourseId) {
        return controller.retryPendingPersonalCopyEdit(sourceCourseId);
      },
      clearPendingPersonalCopyEdit(sourceCourseId, requestId) {
        clearCalls.push([sourceCourseId, requestId]);
        return controller.clearPendingPersonalCopyEdit(sourceCourseId, requestId);
      },
      async refreshCourses() { return structuredClone(retainedProject); }
    }
  );
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: retainedProject,
    async onSaveManualEdit() { throw new Error("não usado"); }
  });

  assert.equal(await app.resumePendingManualEdit({ retry: true }), true);

  assert.equal(commitCalls, 2);
  assert.deepEqual(clearCalls, [[
    SOURCE_ID,
    "personal-copy-revoked-0001"
  ]]);
  assert.equal(await controller.loadPendingPersonalCopyEdit(), null);
  assert.equal(root.innerHTML.includes("discard-pending-personal-copy"), false);
  app.destroy();
});

test("revogação da origem remove P por CAS e libera outra derivação", async () => {
  const fullProject = {
    contract: "aralearn.course.v1",
    courses: [
      courseDocument(SOURCE_ID, studyUnit("Unidade A")).courses[0],
      courseDocument(TARGET_ID, studyUnit("Unidade B")).courses[0]
    ]
  };
  let currentProject = structuredClone(fullProject);
  let pending = {
    contract: "aralearn.personal-course-copy-edit-pending.v1",
    ...intent("personal-copy-revoked-0001"),
    savedAt: "2026-08-21T10:00:00.000Z"
  };
  const clearCalls = [];
  const repository = basicApplicationRepository(
    () => currentProject,
    {
      async loadPendingPersonalCopyEdit() {
        return pending == null ? null : structuredClone(pending);
      },
      async retryPendingPersonalCopyEdit() {
        throw Object.assign(new Error("Acesso revogado."), {
          status: 403,
          code: "42501"
        });
      },
      async clearPendingPersonalCopyEdit(sourceCourseId, requestId) {
        clearCalls.push([sourceCourseId, requestId]);
        if (!pending || pending.sourceCourseId !== sourceCourseId ||
            pending.requestId !== requestId) return false;
        pending = null;
        return true;
      },
      async refreshCourses() {
        currentProject = {
          ...structuredClone(fullProject),
          courses: fullProject.courses.filter(({ id }) => id !== SOURCE_ID)
        };
        return structuredClone(currentProject);
      }
    }
  );
  const root = new FakeStudyRoot();
  const saves = [];
  let signalSave;
  const saveCalled = new Promise((resolve) => { signalSave = resolve; });
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: fullProject,
    async onSaveManualEdit(value) {
      saves.push(structuredClone(value));
      signalSave();
      return { changed: false, createdCopy: false };
    }
  });

  assert.equal(await app.resumePendingManualEdit({ retry: true }), true);

  assert.deepEqual(clearCalls, [[
    SOURCE_ID,
    "personal-copy-revoked-0001"
  ]]);
  assert.equal(pending, null);
  assert.equal(root.innerHTML.includes("discard-pending-personal-copy"), false);

  await app.openEntityPath(studyUnitPath(TARGET_ID));
  assert.equal(app.previewManualEdit({
    targetId: "study_unit",
    pathValues: { title: "Nova derivação de B" },
    origin: "manual"
  }), true);
  root.click("study-manual-save");
  await saveCalled;
  await nextTurn();

  assert.equal(saves.length, 1);
  assert.equal(saves[0].courseId, TARGET_ID);
  assert.equal(saves[0].createsPersonalCopy, true);
  assert.equal(saves[0].replacesPendingRequestId, null);
  assert.equal(app.hasPendingManualEdit(), false);
  app.destroy();
});

test("CAS de P preserva Q e a Home mantém seu descarte disponível", async () => {
  const fullProject = {
    contract: "aralearn.course.v1",
    courses: [
      courseDocument(SOURCE_ID, studyUnit("Unidade A")).courses[0],
      courseDocument(TARGET_ID, studyUnit("Unidade B")).courses[0]
    ]
  };
  let currentProject = structuredClone(fullProject);
  const pendingP = {
    contract: "aralearn.personal-course-copy-edit-pending.v1",
    ...intent("personal-copy-revoked-0001"),
    savedAt: "2026-08-21T10:00:00.000Z"
  };
  const pendingQ = {
    ...structuredClone(pendingP),
    requestId: "personal-copy-newer-0002",
    sourceCourseId: TARGET_ID,
    sourceSelection: selection(TARGET_ID),
    studyUnit: studyUnit("Alteração Q mais nova"),
    savedAt: "2026-08-21T10:10:00.000Z"
  };
  let pending = structuredClone(pendingP);
  const clearCalls = [];
  let signalDiscard;
  const discardCalled = new Promise((resolve) => { signalDiscard = resolve; });
  const repository = basicApplicationRepository(
    () => currentProject,
    {
      async loadPendingPersonalCopyEdit() {
        return pending == null ? null : structuredClone(pending);
      },
      async retryPendingPersonalCopyEdit() {
        throw Object.assign(new Error("Acesso revogado."), {
          status: 403,
          code: "42501"
        });
      },
      async clearPendingPersonalCopyEdit(sourceCourseId, requestId) {
        clearCalls.push([sourceCourseId, requestId]);
        if (requestId === pendingP.requestId) {
          pending = structuredClone(pendingQ);
          return false;
        }
        if (sourceCourseId === null && requestId === pendingQ.requestId) {
          pending = null;
          signalDiscard();
          return true;
        }
        return false;
      },
      async refreshCourses() {
        currentProject = {
          ...structuredClone(fullProject),
          courses: fullProject.courses.filter(({ id }) => id !== SOURCE_ID)
        };
        return structuredClone(currentProject);
      }
    }
  );
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: fullProject,
    async onSaveManualEdit() { throw new Error("não usado"); }
  });

  assert.equal(await app.resumePendingManualEdit({ retry: true }), true);

  assert.deepEqual(clearCalls, [[SOURCE_ID, pendingP.requestId]]);
  assert.equal(pending.requestId, pendingQ.requestId);
  assert.equal(pending.sourceCourseId, TARGET_ID);
  assert.equal(root.innerHTML.includes("discard-pending-personal-copy"), true);
  assert.equal(root.innerHTML.includes("Há outra alteração guardada"), true);

  root.click("discard-pending-personal-copy");
  await discardCalled;
  await nextTurn();

  assert.deepEqual(clearCalls, [
    [SOURCE_ID, pendingP.requestId],
    [null, pendingQ.requestId]
  ]);
  assert.equal(pending, null);
  assert.equal(root.innerHTML.includes("discard-pending-personal-copy"), false);
  app.destroy();
});

test("Repository troca somente a seleção corrente e mantém progresso separado", async () => {
  const source = courseDocument().courses[0];
  const target = courseDocument(TARGET_ID, studyUnit("Unidade pessoal")).courses[0];
  const rows = flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [target]
  }).rows.map((row) => ({ ...row, version: row.entityType === "study_unit" ? 2 : 1 }));
  const localCache = (() => {
    const values = new Map();
    return {
      name: "personal-copy-repository",
      async getCache(key) { return structuredClone(values.get(key) ?? null); },
      async putCache(key, value) {
        if (value == null) values.delete(key);
        else values.set(key, structuredClone(value));
      },
      async updateCache(key, updater) {
        const next = updater(structuredClone(values.get(key) ?? null));
        if (next == null) values.delete(key);
        else values.set(key, structuredClone(next));
        return structuredClone(next);
      },
      async updateCaches(keys, updater) {
        const current = Object.fromEntries(keys.map((key) => [
          key,
          structuredClone(values.get(key) ?? null)
        ]));
        const next = updater(current);
        for (const key of keys) {
          if (next[key] == null) values.delete(key);
          else values.set(key, structuredClone(next[key]));
        }
        return structuredClone(next);
      },
      async deleteCachePrefix(prefix) {
        for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
      }
    };
  })();
  let captured = null;
  const loadedCourseIds = [];
  const bridge = {
    async listAccessibleCourses() {
      return { items: [sourceDescriptor()], hasMore: false, nextCursor: null };
    },
    async loadCourse(courseId) {
      loadedCourseIds.push(courseId);
      const value = courseId === SOURCE_ID ? source : target;
      return {
        courseId,
        revision: courseId === SOURCE_ID ? 4 : 2,
        course: {
          courseId,
          title: value.title,
          goal: value.goal,
          revision: courseId === SOURCE_ID ? 4 : 2
        },
        rows: courseId === SOURCE_ID ? sourceRows() : rows,
        document: { contract: "aralearn.course.v1", courses: [value] },
        offline: false,
        stale: false
      };
    },
    async clearCourse() {},
    async hasOfflineCourse() { return false; },
    async commitPersonalCourseCopyEdit(value) {
      captured = structuredClone(value);
      return {
        ...normalizedReceipt(),
        targetId: value.targetId,
        sourceSelection: structuredClone(value.sourceSelection),
        studyUnit: structuredClone(value.studyUnit),
        version: 2,
        reconciled: false,
        course: {
          courseId: TARGET_ID,
          title: target.title,
          goal: target.goal,
          revision: 2
        },
        rows,
        document: { contract: "aralearn.course.v1", courses: [target] }
      };
    },
    async loadPendingPersonalCopyEdit() { return null; },
    async clearPendingPersonalCopyEdit() { return true; }
  };
  const api = {
    async listCourseReviewItems() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async loadPersonalState() { return null; },
    async mutatePersonalState() { throw new Error("não usado"); },
    async getMyCourseAnchoredAnnotations() { throw networkFailure(); },
    async executeMyCourseAnchoredAnnotationCommand() { throw new Error("não usado"); }
  };
  const repository = new CourseStudyRepository({
    bridge,
    api,
    cache: localCache,
    windowValue: {}
  });
  await repository.initialize();
  await repository.loadCourse(SOURCE_ID);
  const result = await repository.commitPersonalCourseCopyEdit({
    sourceCourseId: SOURCE_ID,
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 3,
    didacticMicrosequenceId: "micro-a",
    studyUnit: studyUnit("Unidade pessoal"),
    applicationOrigin: "manual",
    targetId: "paragraph-a",
    sourceSelection: selection()
  });

  assert.match(captured.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.equal(captured.origin, "manual");
  assert.equal(result.selection.courseId, TARGET_ID);
  assert.equal(result.selection.moduleId, "module-a");
  assert.equal(result.project.courses.some((item) => item.id === TARGET_ID), true);
  const summaries = repository.loadCourseSummaries();
  assert.equal(summaries.find((item) => item.courseId === SOURCE_ID)
    .personalCopyCourseId, TARGET_ID);
  assert.equal(summaries.find((item) => item.courseId === SOURCE_ID).canDerive, false);
  assert.equal(summaries.find((item) => item.courseId === TARGET_ID)
    .isPersonalCopy, true);
  assert.equal(repository.isStudyUnitCompleted(selection(TARGET_ID)), false);
  assert.deepEqual(repository.loadAnnotationsForPath(selection(TARGET_ID)), []);
  const unsubscribe = repository.subscribeToAnnotations(selection(TARGET_ID), () => {});
  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
  assert.equal(repository.loadStudyNavigation().selectedCourseId, SOURCE_ID);
  assert.deepEqual(loadedCourseIds, [SOURCE_ID]);
});

test("Bridge expõe somente as quatro operações delimitadas de retomada", async () => {
  const calls = [];
  const controller = {
    async listCourses() { return { items: [], hasMore: false }; },
    async loadCourseDocument() { throw new Error("não usado"); },
    async clearCourse() {},
    async commitPersonalCourseCopyEdit(value) { calls.push(["commit", value]); return value; },
    async loadPendingPersonalCopyEdit(value) { calls.push(["load", value]); return null; },
    async retryPendingPersonalCopyEdit(value) { calls.push(["retry", value]); return null; },
    async clearPendingPersonalCopyEdit(value) { calls.push(["clear", value]); return true; }
  };
  const bridge = new CourseStudyBridge({ controller });
  await bridge.commitPersonalCourseCopyEdit({ requestId: "request-1" });
  await bridge.loadPendingPersonalCopyEdit();
  await bridge.retryPendingPersonalCopyEdit(SOURCE_ID);
  await bridge.clearPendingPersonalCopyEdit(SOURCE_ID);
  assert.deepEqual(calls, [
    ["commit", { requestId: "request-1" }],
    ["load", null],
    ["retry", SOURCE_ID],
    ["clear", SOURCE_ID]
  ]);
});
