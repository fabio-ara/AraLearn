import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import test from "node:test";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";
import {
  assembleCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../../src/domain/courseAuthoringAnalytics.js";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import {
  COURSE_ANNOTATION_CACHE_CONTRACT,
  COURSE_ANNOTATION_OUTBOX_CONTRACT
} from "../../src/persistence/CourseAnnotationRepository.js";
import {
  COURSE_PERSONAL_STATE_CACHE_CONTRACT
} from "../../src/persistence/CoursePersonalStateRepository.js";
import {
  ACCESSIBLE_COURSE_IDS_CACHE_KEY,
  ACCESSIBLE_COURSE_IDS_CONTRACT,
  CourseController,
  coursePendingCompositionCacheKey
} from "../../src/supabase/CourseController.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_B = "20000000-0000-4000-8000-000000000002";

function analyticsSnapshot() {
  const scope = { kind: "course", ref: null, label: "Curso" };
  return {
    contract: "aralearn.course-authoring-analytics.v3",
    course: { id: COURSE_ID, revision: 7, title: "Curso" },
    scope: { selected: scope, options: [scope] },
    design: {
      studyUnitCount: 0,
      parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
      parameterId: definition.id, label: definition.label,
      valueKind: definition.valueSchema.type === "set" ? "string_list" : definition.valueSchema.type,
      definition: structuredClone(definition), effectiveValues: []
    })),
      editorialDirections: [],
      analysisUnits: [],
      introductionsByStudyUnit: [],
      explanationForms: [],
      components: [],
      practiceByRequirement: [],
      practiceVariationDimensions: [],
      sourcesByRole: [],
      wordCountsByStudyUnit: [],
      practiceSequence: []
    },
    authorship: {
      observations: { createdCount: 0, openCount: 0, resolvedCount: 0 },
      explicitParameterOverrideCount: 0,
      manuallyRevisedStudyUnitCount: 0,
      studyUnitsByOrigin: []
    },
    missingData: [],
    deepLink: null
  };
}

class MemoryStateStore {
  values = new Map();

  async getCache(key) {
    return this.values.get(key) ?? null;
  }

  async putCache(key, value) {
    if (value == null) this.values.delete(key);
    else this.values.set(key, structuredClone(value));
  }

  async deleteCachePrefix(prefix) {
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) this.values.delete(key);
    }
  }
}

function networkFailure() {
  const error = new Error("offline");
  error.status = 0;
  error.code = "network_error";
  return error;
}

function courseListItem(overrides = {}) {
  const ownership = overrides.ownership || "owned";
  return {
    courseId: COURSE_ID,
    title: "Curso",
    goal: "Aprender",
    revision: 1,
    ownership,
    canEdit: ownership === "owned",
    canObserve: true, visibility: "private", publicFileAccess: "restricted",
    moduleCount: 0,
    lessonCount: 0,
    topicCount: 0,
    microsequenceCount: 0,
    studyUnitCount: 0,
    completedStudyUnitCount: 0,
    updatedAt: "2026-08-17T10:00:00.000Z",
    ...overrides
  };
}

function courseListPage(items = [courseListItem()], overrides = {}) {
  return {
    contract: "aralearn.course-list.v2",
    items,
    hasMore: false,
    nextCursor: null,
    ...overrides
  };
}

test("manual lê somente lista e composição verificadas do cache, sem promover revisão pela checagem de acesso", async () => {
  const store = new MemoryStateStore();
  const fixture = documentFixture();
  const { rows } = flattenCourseDocument(fixture);
  let remoteRevision = 3;
  let networkReads = 0;
  let remoteError = null;
  const controller = new CourseController({ store, api: {
    async listCourses() { networkReads += 1; return courseListPage([courseListItem({ revision: 3 })]); },
    async getCourse() {
      networkReads += 1;
      if (remoteError) throw remoteError;
      return { contract: "aralearn.course.v1", courseId: COURSE_ID, title: "Curso", goal: "Aprender.", revision: remoteRevision };
    },
    async getCourseEntities() { networkReads += 1; return { contract: "aralearn.course-entities.v1", courseId: COURSE_ID,
      revision: 3, items: rows, hasMore: false, nextCursor: null }; }
  } });
  assert.equal(await controller.loadCachedCourseDocument(COURSE_ID), null);
  assert.equal((await controller.listCachedCourses()).items.length, 0);
  assert.equal(networkReads, 0);
  await controller.listCourses();
  await controller.loadCourseDocument(COURSE_ID);
  const reads = networkReads;
  assert.equal((await controller.listCachedCourses()).items[0].revision, 3);
  assert.deepEqual((await controller.loadCachedCourseDocument(COURSE_ID)).document, fixture);
  assert.equal(networkReads, reads);
  remoteRevision = 4;
  assert.equal((await controller.checkCourseAccess(COURSE_ID)).revision, 4);
  assert.equal((await controller.loadCachedCourseDocument(COURSE_ID)).course.revision, 3);
  remoteError = networkFailure();
  await assert.rejects(controller.checkCourseAccess(COURSE_ID));
  assert.equal((await controller.loadCachedCourseDocument(COURSE_ID)).course.revision, 3);
  remoteError = Object.assign(new Error("Revogado"), { status: 403 });
  await assert.rejects(controller.checkCourseAccess(COURSE_ID), { status: 403 });
  assert.equal(await controller.loadCachedCourseDocument(COURSE_ID), null);
});

function editableStudyUnit(title = "Unidade revista") {
  return {
    id: "unit-a",
    position: 1,
    title,
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo curricular revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
}

test("cacheia a página conhecida e a devolve somente como leitura offline", async () => {
  const store = new MemoryStateStore();
  let online = true;
  const api = {
    async listCourses() {
      if (!online) throw networkFailure();
      return courseListPage();
    },
    async getCourse() { throw new Error("não usado"); }
  };
  const controller = new CourseController({
    api,
    store,
    now: () => "2026-08-17T12:00:00.000Z"
  });

  const fresh = await controller.listCourses();
  assert.equal(fresh.offline, false);
  assert.equal(fresh.items[0].courseId, COURSE_ID);

  online = false;
  const cached = await controller.listCourses();
  assert.equal(cached.offline, true);
  assert.equal(cached.stale, true);
  assert.equal(cached.readOnly, true);
  assert.equal(cached.cachedAt, "2026-08-17T12:00:00.000Z");
});

test("não mascara erro de contrato sem status como modo offline", async () => {
  const store = new MemoryStateStore();
  let failure = null;
  const controller = new CourseController({
    store,
    api: {
      async listCourses() {
        if (failure) throw failure;
        return courseListPage();
      },
      async getCourse() { throw new Error("não usado"); }
    }
  });
  await controller.listCourses();

  failure = new TypeError("Resposta de Curso inválida.");
  await assert.rejects(() => controller.listCourses(), /Resposta de Curso inválida/u);

  failure = new TypeError("Failed to fetch");
  const offline = await controller.listCourses();
  assert.equal(offline.offline, true);
});

test("rejeita página remota ou cacheada que não cumpra o contrato da lista", async () => {
  const malformedPages = [
    null,
    { items: [], hasMore: false, nextCursor: null },
    courseListPage([{ courseId: COURSE_ID, title: "Sem versão" }]),
    courseListPage([courseListItem(), courseListItem()]),
    courseListPage([], { hasMore: true, nextCursor: { beforeId: COURSE_ID } })
  ];
  for (const malformed of malformedPages) {
    const controller = new CourseController({
      store: new MemoryStateStore(),
      api: {
        async listCourses() { return malformed; },
        async getCourse() { throw new Error("não usado"); }
      }
    });
    await assert.rejects(
      () => controller.listCourses(),
      /Resposta da lista de Cursos inválida/u
    );
  }

  const store = new MemoryStateStore();
  await store.putCache("course.v1.list::start", {
    savedAt: "2026-08-17T12:00:00.000Z",
    data: { items: [] }
  });
  const offlineController = new CourseController({
    store,
    api: {
      async listCourses() { throw networkFailure(); },
      async getCourse() { throw new Error("não usado"); }
    }
  });
  await assert.rejects(
    () => offlineController.listCourses(),
    /Resposta da lista de Cursos inválida/u
  );
});

test("não converte acesso revogado em fallback local", async () => {
  const store = new MemoryStateStore();
  let revoked = false;
  const api = {
    async listCourses() {
      return courseListPage();
    },
    async getCourse() {
      if (revoked) {
        const error = new Error("not found");
        error.status = 400;
        error.code = "PT404";
        throw error;
      }
      return { courseId: COURSE_ID, title: "Curso", goal: "Aprender", revision: 1 };
    }
  };
  const controller = new CourseController({ api, store });

  await controller.listCourses();
  await controller.getCourse(COURSE_ID);
  await store.putCache(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_ID}`, {
    courseId: COURSE_ID
  });
  await store.putCache("course.v1.review-page", {
    items: [{ courseId: COURSE_ID }]
  });
  revoked = true;
  await assert.rejects(() => controller.getCourse(COURSE_ID), /not found/u);
  assert.equal(
    [...store.values.keys()].some((key) =>
      key.includes(COURSE_ID) || key.startsWith("course.v1.list:")),
    false
  );
  assert.equal(store.values.has(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_ID}`), false);
  assert.equal(store.values.has("course.v1.review-page"), false);
});

test("inbox não confunde observação ausente com revogação e purga todo cache privado real", async () => {
  const store = new MemoryStateStore();
  const privateKeys = [
    `${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_ID}`,
    `${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`,
    `${COURSE_ANNOTATION_OUTBOX_CONTRACT}:${COURSE_ID}`,
    `course-authoring.v1.header:${COURSE_ID}`,
    `course-authoring.v1.verified-composition:${COURSE_ID}`
  ];
  for (const key of privateKeys) await store.putCache(key, { private: true });
  let failure = Object.assign(new Error("observação ausente"), {
    status: 404,
    code: "course_anchored_annotation_not_found"
  });
  const controller = new CourseController({
    store,
    ownerOnly: true,
    api: {
      async listCourses() { return courseListPage([]); },
      async getCourse() { throw new Error("não usado"); },
      async loadCourseAnchoredAnnotations() { throw failure; }
    }
  });

  await assert.rejects(
    () => controller.loadCourseAnchoredAnnotations(COURSE_ID, {
      expectedCourseRevision: 7
    }),
    (error) => error.code === "course_anchored_annotation_not_found"
  );
  assert.equal(privateKeys.every((key) => store.values.has(key)), true);

  failure = Object.assign(new Error("Curso revogado"), { status: 404, code: "PT404" });
  await assert.rejects(
    () => controller.loadCourseAnchoredAnnotations(COURSE_ID, {
      expectedCourseRevision: 7
    }),
    (error) => error.code === "PT404"
  );
  assert.equal(privateKeys.some((key) => store.values.has(key)), false);
});

test("mutação owner liga o replay à revisão original sem rejeitar avanço corrente", async () => {
  let courseRevision = 8;
  let receivedMutation = null;
  const requestId = "request-annotation-controller-1";
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { throw new Error("não usado"); },
    async mutateCourseAnchoredAnnotations(value) {
      receivedMutation = structuredClone(value);
      return {
        contract: "aralearn.course-anchored-annotation-change.v1",
        courseId: COURSE_ID,
        courseRevision,
        annotationSetVersion: 3,
        requestId: value.requestId,
        idempotent: true,
        changed: false,
        annotation: null
      };
    }
  };
  const controller = new CourseController({
    store: new MemoryStateStore(),
    ownerOnly: true,
    api
  });
  const mutation = {
    requestId,
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    command: {
      type: "create_anchored_annotation",
      annotationId: "60000000-0000-4000-8000-000000000006",
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro nesta Unidade.",
      category: "possible_error",
      capturedAt: null,
      briefSummary: null
    }
  };

  const replay = await controller.mutateCourseAnchoredAnnotations(mutation);
  assert.equal(replay.courseRevision, 8);

  const consideredSourceLinks = [{
    sourceId: "source-a",
    linkId: "source-a", roles: [], occurrences: [],
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a" }]
  }];
  await controller.mutateCourseAnchoredAnnotations({
    requestId: "request-annotation-controller-2",
    courseId: COURSE_ID,
    expectedCourseRevision: null,
    command: {
      type: "respond_to_anchored_annotation",
      annotationId: mutation.command.annotationId,
      expectedAnnotationVersion: 2,
      ownerResponse: "Interpretação reformulada.",
      responseKind: "reformulation",
      consideredSourceLinks
    }
  });
  assert.equal(receivedMutation.expectedCourseRevision, null);
  assert.deepEqual(receivedMutation.command.consideredSourceLinks,
    consideredSourceLinks);

  courseRevision = 6;
  await assert.rejects(
    () => controller.mutateCourseAnchoredAnnotations(mutation),
    /não corresponde ao comando/u
  );
});

test("não usa página parcial como cache de outra paginação", async () => {
  const store = new MemoryStateStore();
  let online = true;
  const calls = [];
  const api = {
    async listCourses(options) {
      calls.push(options);
      if (!online) throw networkFailure();
      return courseListPage([
        courseListItem({ title: options.cursor ? "Página 2" : "Página 1" })
      ], {
        hasMore: !options.cursor,
        nextCursor: options.cursor ? null : {
          beforeUpdatedAt: "2026-08-17T10:00:00Z",
          beforeId: COURSE_ID
        }
      });
    },
    async getCourse() { throw new Error("não usado"); }
  };
  const controller = new CourseController({ api, store });
  const first = await controller.listCourses();
  online = false;

  await assert.rejects(
    () => controller.listCourses({ cursor: first.nextCursor }),
    /offline/u
  );
  assert.equal(calls.length, 2);
});

test("nova primeira página substitui páginas de lista que perderam acesso", async () => {
  const store = new MemoryStateStore();
  await store.putCache("course.v1.list:antiga:start", {
    data: { items: [{ courseId: COURSE_ID, title: "Revogado" }] }
  });
  const controller = new CourseController({
    store,
    api: {
      async listCourses() {
        return courseListPage([]);
      },
      async getCourse() { throw new Error("não usado"); }
    }
  });

  await controller.listCourses();
  assert.equal(store.values.has("course.v1.list:antiga:start"), false);
  assert.equal([...store.values.keys()].filter((key) =>
    key.startsWith("course.v1.list:")).length, 1);
});

test("após reinício purga Curso revogado somente ao completar a lista online", async () => {
  const indexedDb = new IDBFactory();
  let store = await CourseLocalStore.open(indexedDb, { userId: COURSE_ID });
  const nextCursor = {
    beforeUpdatedAt: "2026-08-17T10:00:00.000Z",
    beforeId: COURSE_ID
  };
  let currentList = false;
  const api = {
    async listCourses({ cursor }) {
      if (!currentList) {
        return courseListPage([
          courseListItem({ title: "Mantido" }),
          courseListItem({ courseId: COURSE_B, title: "Depois revogado" })
        ]);
      }
      return cursor
        ? courseListPage([])
        : courseListPage([courseListItem({ title: "Mantido" })], {
            hasMore: true,
            nextCursor
          });
    },
    async getCourse() { throw new Error("não usado"); }
  };
  const beforeRestart = new CourseController({ api, store });
  await beforeRestart.listCourses();
  await store.putCache(`course.v1.header:${COURSE_ID}`, { data: { revision: 1 } });
  await store.putCache(`course.v1.header:${COURSE_B}`, { data: { revision: 1 } });
  await store.putCache(`course.v1.entities:${COURSE_B}:1:500:start`, {
    data: { items: [{ entityId: "privado" }] }
  });
  await store.putCache(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_B}`, {
    contract: COURSE_PERSONAL_STATE_CACHE_CONTRACT,
    courseId: COURSE_B
  });
  await store.putCache("course.v1.review-page", {
    items: [{ courseId: COURSE_B, title: "Observação privada" }],
    hasMore: false,
    nextCursor: null
  });
  store.close();

  currentList = true;
  store = await CourseLocalStore.open(indexedDb, { userId: COURSE_ID });
  const afterRestart = new CourseController({ api, store });
  const firstPage = await afterRestart.listCourses({ limit: 1 });

  assert.notEqual(await store.getCache(`course.v1.header:${COURSE_B}`), null);
  assert.notEqual(await store.getCache(`course.v1.entities:${COURSE_B}:1:500:start`), null);
  assert.notEqual(await store.getCache(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_B}`), null);
  assert.notEqual(await store.getCache("course.v1.review-page"), null);

  await afterRestart.listCourses({ limit: 1, cursor: firstPage.nextCursor });

  assert.equal(await store.getCache(`course.v1.header:${COURSE_B}`), null);
  assert.equal(await store.getCache(`course.v1.entities:${COURSE_B}:1:500:start`), null);
  assert.equal(await store.getCache(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_B}`), null);
  assert.equal(await store.getCache("course.v1.review-page"), null);
  assert.notEqual(await store.getCache(`course.v1.header:${COURSE_ID}`), null);
  assert.deepEqual(await store.getCache(ACCESSIBLE_COURSE_IDS_CACHE_KEY), {
    contract: ACCESSIBLE_COURSE_IDS_CONTRACT,
    courseIds: [COURSE_ID]
  });
  store.close();
});

test("reinício offline conserva caches e não deduz revogação de lista local incompleta", async () => {
  const store = new MemoryStateStore();
  const online = new CourseController({
    store,
    api: {
      async listCourses() {
        return courseListPage([
          courseListItem({ title: "Mantido" }),
          courseListItem({ courseId: COURSE_B, title: "Possivelmente acessível" })
        ]);
      },
      async getCourse() { throw new Error("não usado"); }
    }
  });
  await online.listCourses();
  await store.putCache(`course.v1.header:${COURSE_B}`, { data: { revision: 1 } });
  await store.putCache(`course.v1.entities:${COURSE_B}:1:500:start`, {
    data: { items: [{ entityId: "privado" }] }
  });
  await store.putCache(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_B}`, {
    contract: COURSE_PERSONAL_STATE_CACHE_CONTRACT,
    courseId: COURSE_B
  });
  await store.putCache("course.v1.review-page", {
    items: [{ courseId: COURSE_B, title: "Observação preservada offline" }],
    hasMore: false,
    nextCursor: null
  });
  await store.putCache("course.v1.list::start", {
    savedAt: "2026-08-17T12:00:00.000Z",
    data: courseListPage([courseListItem({ title: "Lista local incompleta" })])
  });

  const afterRestart = new CourseController({
    store,
    api: {
      async listCourses() { throw networkFailure(); },
      async getCourse() { throw new Error("não usado"); }
    }
  });
  const page = await afterRestart.listCourses();

  assert.equal(page.offline, true);
  assert.equal(store.values.has(`course.v1.header:${COURSE_B}`), true);
  assert.equal(store.values.has(`course.v1.entities:${COURSE_B}:1:500:start`), true);
  assert.equal(store.values.has(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_B}`), true);
  assert.equal(store.values.has("course.v1.review-page"), true);
  assert.deepEqual(store.values.get(ACCESSIBLE_COURSE_IDS_CACHE_KEY), {
    contract: ACCESSIBLE_COURSE_IDS_CONTRACT,
    courseIds: [COURSE_ID, COURSE_B]
  });
});

function documentFixture() {
  return {
    contract: "aralearn.course.v1",
    courses: [{
      id: COURSE_ID,
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        guide: { goal: "Guiar.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: []
      }]
    }]
  };
}

function documentWithStudyUnitFixture() {
  return {
    contract: "aralearn.course.v1",
    courses: [{
      id: COURSE_ID,
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        guide: { goal: "Guiar.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          guide: { goal: "Ensinar.", include: [], exclude: [], notation: [], avoid: [] },
          topics: [],
          microsequences: [{
            id: "microsequence-a",
            title: "Microssequência",
            goal: "Explicar.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [{
              id: "unit-a",
              position: 1,
              title: "Unidade",
              role: "theory",
              content: [{
                id: "content-a",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Conteúdo atual." }
              }],
              response: null,
              feedback: [],
              topics: []
            }]
          }]
        }]
      }]
    }]
  };
}

test("é o único componente que pagina, recompõe e sinaliza documento offline", async () => {
  const store = new MemoryStateStore();
  const fixture = documentFixture();
  const { rows } = flattenCourseDocument(fixture);
  let online = true;
  let revision = 3;
  let headerReads = 0;
  let entityReads = 0;
  const api = {
    async listCourses() { throw new Error("não usado"); },
    async getCourse() {
      if (!online) throw networkFailure();
      headerReads += 1;
      return {
        contract: "aralearn.course.v1",
        courseId: COURSE_ID,
        title: "Curso",
        goal: "Aprender.",
        revision
      };
    },
    async getCourseEntities(_courseId, { cursor }) {
      if (!online) throw networkFailure();
      entityReads += 1;
      return {
        contract: "aralearn.course-entities.v1",
        courseId: COURSE_ID,
        revision,
        items: cursor ? rows.slice(1) : rows.slice(0, 1),
        hasMore: !cursor,
        nextCursor: cursor ? null : { entityType: "module", entityId: "module-a" }
      };
    }
  };
  const controller = new CourseController({ api, store });

  const fresh = await controller.loadCourseDocument(COURSE_ID, { entityPageSize: 1 });
  assert.deepEqual(fresh.document, fixture);
  assert.equal(fresh.offline, false);
  assert.equal(headerReads, 1);
  assert.equal(entityReads, 2);

  const verified = await controller.loadCourseDocument(COURSE_ID, {
    entityPageSize: 1,
    verifiedRevision: 3
  });
  assert.deepEqual(verified.document, fixture);
  assert.equal(verified.cacheVerified, true);
  assert.equal(headerReads, 1);
  assert.equal(entityReads, 2);

  const laterPageKey = [...store.values.keys()].find((key) =>
    key.startsWith(`course.v1.entities:${COURSE_ID}:3:1:`) && !key.endsWith(":start"));
  store.values.delete(laterPageKey);
  const repaired = await controller.loadCourseDocument(COURSE_ID, {
    entityPageSize: 1,
    verifiedRevision: 3
  });
  assert.deepEqual(repaired.document, fixture);
  assert.equal(repaired.cacheVerified, undefined);
  assert.equal(headerReads, 2);
  assert.equal(entityReads, 4);

  revision = 4;
  const updated = await controller.loadCourseDocument(COURSE_ID, {
    entityPageSize: 1,
    verifiedRevision: 4
  });
  assert.deepEqual(updated.document, fixture);
  assert.equal(updated.course.revision, 4);
  assert.equal(headerReads, 3);
  assert.equal(entityReads, 6);
  assert.equal([...store.values.keys()].some((key) =>
    key.startsWith(`course.v1.entities:${COURSE_ID}:3:`)), false);
  assert.equal([...store.values.keys()].some((key) =>
    key.startsWith(`course.v1.entities:${COURSE_ID}:4:`)), true);

  online = false;
  const cached = await controller.loadCourseDocument(COURSE_ID, { entityPageSize: 1 });
  assert.deepEqual(cached.document, fixture);
  assert.equal(cached.offline, true);
  assert.equal(cached.stale, true);
  assert.equal(cached.readOnly, true);
});

test("confirma disponibilidade offline somente para a composição verificada e completa", async () => {
  const store = new MemoryStateStore();
  const fixture = documentFixture();
  const { rows } = flattenCourseDocument(fixture);
  let headerReads = 0;
  let entityReads = 0;
  const controller = new CourseController({
    store,
    api: {
      async listCourses() { throw new Error("não usado"); },
      async getCourse() {
        headerReads += 1;
        return {
          contract: "aralearn.course.v1",
          courseId: COURSE_ID,
          title: "Curso",
          goal: "Aprender.",
          revision: 3
        };
      },
      async getCourseEntities() {
        entityReads += 1;
        return {
          contract: "aralearn.course-entities.v1",
          courseId: COURSE_ID,
          revision: 3,
          items: rows,
          hasMore: false,
          nextCursor: null
        };
      }
    }
  });

  await controller.loadCourseDocument(COURSE_ID, { entityPageSize: 1 });
  assert.equal(await controller.hasVerifiedCourseDocument(COURSE_ID), true);
  assert.equal(await controller.hasVerifiedCourseDocument(COURSE_ID, { revision: 3 }), true);
  assert.equal(await controller.hasVerifiedCourseDocument(COURSE_ID, { revision: 4 }), false);
  assert.deepEqual([headerReads, entityReads], [1, 1]);

  store.values.delete(`course.v1.entities:${COURSE_ID}:3:1:start`);
  assert.equal(await controller.hasVerifiedCourseDocument(COURSE_ID, { revision: 3 }), false);
  assert.deepEqual([headerReads, entityReads], [1, 1]);

  await assert.rejects(
    () => controller.hasVerifiedCourseDocument("curso-inválido"),
    /identidade do Curso/u
  );
  await assert.rejects(
    () => controller.hasVerifiedCourseDocument(COURSE_ID, { revision: 0 }),
    /versão do Curso/u
  );
});

test("preserva a última composição válida após revisão inválida e reinício", async () => {
  const indexedDb = new IDBFactory();
  let store = await CourseLocalStore.open(indexedDb, { userId: COURSE_ID });
  const fixture = documentFixture();
  const { rows } = flattenCourseDocument(fixture);
  let revision = 3;
  let online = true;
  let invalidRevisionKind = "page";
  const api = {
    async listCourses() { throw new Error("não usado"); },
    async getCourse() {
      if (!online) throw networkFailure();
      return {
        contract: "aralearn.course.v1",
        courseId: COURSE_ID,
        title: "Curso",
        goal: "Aprender.",
        revision
      };
    },
    async getCourseEntities() {
      if (!online) throw networkFailure();
      return {
        contract: "aralearn.course-entities.v1",
        courseId: revision === 4 && invalidRevisionKind === "page" ? COURSE_B : COURSE_ID,
        revision,
        items: revision === 3 || invalidRevisionKind === "page" ? rows : [...rows, rows[0]],
        hasMore: false,
        nextCursor: null
      };
    }
  };
  let controller = new CourseController({
    api,
    store,
    now: () => "2026-08-20T12:00:00.000Z"
  });

  const initial = await controller.loadCourseDocument(COURSE_ID);
  assert.equal(initial.course.revision, 3);
  revision = 4;

  const preserved = await controller.loadCourseDocument(COURSE_ID, {
    verifiedRevision: 4
  });
  assert.deepEqual(preserved.document, fixture);
  assert.equal(preserved.course.revision, 3);
  assert.equal(preserved.offline, false);
  assert.equal(preserved.stale, true);
  assert.equal(preserved.readOnly, true);
  store.close();

  invalidRevisionKind = "composition";
  store = await CourseLocalStore.open(indexedDb, { userId: COURSE_ID });
  controller = new CourseController({ api, store });
  const afterRestart = await controller.loadCourseDocument(COURSE_ID, {
    verifiedRevision: 4
  });

  assert.deepEqual(afterRestart.document, fixture);
  assert.equal(afterRestart.course.revision, 3);
  assert.equal(afterRestart.offline, false);
  assert.equal(afterRestart.stale, true);
  assert.equal(afterRestart.readOnly, true);
  store.close();

  online = false;
  store = await CourseLocalStore.open(indexedDb, { userId: COURSE_ID });
  controller = new CourseController({ api, store });
  const offlineRestart = await controller.loadCourseDocument(COURSE_ID, {
    verifiedRevision: 4
  });
  assert.deepEqual(offlineRestart.document, fixture);
  assert.equal(offlineRestart.course.revision, 3);
  assert.equal(offlineRestart.offline, true);
  assert.equal(offlineRestart.stale, true);
  assert.equal(offlineRestart.readOnly, true);
  store.close();
});

test("cache verificado legado com StudyUnit.sources é purgado antes da releitura remota", async () => {
  const store = new MemoryStateStore();
  const fixture = documentWithStudyUnitFixture();
  const { rows } = flattenCourseDocument(fixture);
  const entityKey = `course.v1.entities:${COURSE_ID}:3:500:start`;
  let headerReads = 0;
  let entityReads = 0;
  let expectPurged = false;
  const controller = new CourseController({
    store,
    api: {
      async listCourses() { throw new Error("não usado"); },
      async getCourse() {
        headerReads += 1;
        return {
          contract: "aralearn.course.v1",
          courseId: COURSE_ID,
          title: "Curso",
          goal: "Aprender.",
          revision: 3
        };
      },
      async getCourseEntities() {
        entityReads += 1;
        if (expectPurged) {
          assert.equal(store.values.has(entityKey), false);
          expectPurged = false;
        }
        return {
          contract: "aralearn.course-entities.v1",
          courseId: COURSE_ID,
          revision: 3,
          items: rows,
          hasMore: false,
          nextCursor: null
        };
      }
    }
  });

  await controller.loadCourseDocument(COURSE_ID);
  const cachedPage = store.values.get(entityKey);
  cachedPage.data.items.find(({ entityType }) => entityType === "study_unit")
    .content.sources = [];
  expectPurged = true;

  const repaired = await controller.loadCourseDocument(COURSE_ID, {
    verifiedRevision: 3
  });
  assert.deepEqual(repaired.document, fixture);
  assert.equal(repaired.cacheVerified, undefined);
  assert.equal(headerReads, 2);
  assert.equal(entityReads, 2);
  assert.equal(expectPurged, false);
  assert.equal(JSON.stringify(store.values.get(entityKey)).includes('"sources"'), false);
});

test("a projeção de lista exclui estado autoral antes de chegar ao cache", async () => {
  const store = new MemoryStateStore();
  const controller = new CourseController({
    store,
    api: {
      async listCourses() {
        return courseListPage([courseListItem({
          completedStudyUnitCount: 3,
          authoringState: { mandate: "não pertence à lista" }
        })]);
      },
      async getCourse() { throw new Error("não usado"); }
    }
  });

  const result = await controller.listCourses();
  assert.equal(Object.hasOwn(result.items[0], "authoringState"), false);
  assert.equal(result.items[0].completedStudyUnitCount, 3);
  assert.equal(JSON.stringify([...store.values.values()]).includes("authoringState"), false);
});

test("limpa lista, cabeçalho e todas as páginas de entidades do Curso revogado", async () => {
  const store = new MemoryStateStore();
  await store.putCache("course.v1.list::start", { data: { items: [] } });
  await store.putCache(`course.v1.header:${COURSE_ID}`, { data: { revision: 2 } });
  await store.putCache(`course.v1.verified-composition:${COURSE_ID}`, {
    contract: "aralearn.course-verified-composition.v1",
    courseId: COURSE_ID,
    revision: 2
  });
  await store.putCache(`course.v1.entities:${COURSE_ID}:2:start`, { data: { items: [] } });
  await store.putCache(`course.v1.entities:${COURSE_ID}:2:next`, { data: { items: [] } });
  await store.putCache(coursePendingCompositionCacheKey(COURSE_ID), {
    privateConfirmedContent: true
  });
  await store.putCache(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_ID}`, {
    courseId: COURSE_ID
  });
  await store.putCache("course.v1.review-page", {
    items: [{ courseId: COURSE_ID }]
  });
  await store.putCache("course.v1.header:outro", { data: { revision: 1 } });
  const controller = new CourseController({
    store,
    api: {
      async listCourses() { throw new Error("não usado"); },
      async getCourse() { throw new Error("não usado"); }
    }
  });

  await controller.clearCourse(COURSE_ID);
  assert.deepEqual([...store.values.keys()], ["course.v1.header:outro"]);
});

test("limpa um Curso sem apagar a lista online que acabou de ser reconciliada", async () => {
  const store = new MemoryStateStore();
  await store.putCache("course.v1.list::start", {
    data: courseListPage([courseListItem({ title: "Mantido" })])
  });
  await store.putCache(`course.v1.header:${COURSE_B}`, { data: { revision: 2 } });
  const controller = new CourseController({
    store,
    api: {
      async listCourses() { throw new Error("não usado"); },
      async getCourse() { throw new Error("não usado"); }
    }
  });

  await controller.clearCourse(COURSE_B, { clearLists: false });

  assert.notEqual(await store.getCache("course.v1.list::start"), null);
  assert.equal(await store.getCache(`course.v1.header:${COURSE_B}`), null);
});

test("Autoria mantém cache próprio e solicita somente Cursos do proprietário", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  const api = {
    async listCourses(options) {
      calls.push(["list", options]);
      return courseListPage();
    },
    async getCourse(courseId, options) {
      calls.push(["get", { courseId, ...options }]);
      return { courseId, title: "Curso", goal: "Aprender", revision: 1 };
    },
    async getCourseEntities(courseId, options) {
      calls.push(["entities", { courseId, ...options }]);
      return { courseId, revision: 1, items: [], hasMore: false };
    }
  };
  const study = new CourseController({ api, store });
  const authoring = new CourseController({ api, store, ownerOnly: true });

  await study.listCourses();
  await authoring.listCourses();
  await authoring.getCourse(COURSE_ID);
  await authoring.getCourseEntities(COURSE_ID, { revision: 1 });

  assert.equal(calls[0][1].ownerOnly, false);
  assert.equal(calls[1][1].ownerOnly, true);
  assert.equal(calls[2][1].ownerOnly, true);
  assert.equal(calls[3][1].ownerOnly, true);
  assert.equal([...store.values.keys()].some((key) => key.startsWith("course.v1.list:")), true);
  assert.equal([...store.values.keys()].some((key) =>
    key.startsWith("course-authoring.v1.list:")), true);
});


test("desenho exige leitura corrente, mantém DTO exato e mutação limpa o Curso", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  let online = true;
  let revoked = false;
  const design = {
    contract: "aralearn.course-design.v3",
    courseId: COURSE_ID,
    courseRevision: 4,
    scopeContext: { current: { kind: "lesson", ref: "lesson-a", label: "Lição A" } }
  };
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseDesign(courseId, options) {
      calls.push(["read", courseId, options]);
      if (revoked) {
        const error = new Error("acesso revogado");
        error.status = 403;
        throw error;
      }
      if (!online) throw networkFailure();
      return design;
    },
    async mutateCourseDesign(value) {
      calls.push(["write", value]);
      return { changed: true };
    }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });
  const options = { scope: { kind: "lesson", ref: "lesson-a" }, limit: 16 };

  assert.deepEqual(await controller.loadCourseDesign(COURSE_ID, options), design);
  const studyUnitOptions = {
    scope: { kind: "study_unit", ref: "study-unit-a" },
    limit: 16,
    cursor: null
  };
  assert.deepEqual(await controller.loadCourseDesign(COURSE_ID, studyUnitOptions), design);
  assert.deepEqual(calls[1], ["read", COURSE_ID, studyUnitOptions]);
  online = false;
  await assert.rejects(
    () => controller.loadCourseDesign(COURSE_ID, options),
    /offline/u
  );

  online = true;
  const command = {
    type: "clear_guidance",
    scope: { kind: "lesson", ref: "lesson-a" }
  };
  await controller.mutateCourseDesign({
    requestId: COURSE_B,
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    command
  });
  assert.deepEqual(calls.at(-1), ["write", {
    requestId: COURSE_B,
    courseId: COURSE_ID,
    expectedRevision: 4,
    designCommand: command
  }]);
  assert.equal([...store.values.keys()].some((key) => key.includes("course-design")), false);

  for (const key of [
    "course-authoring.v1.list:legacy",
    `course-authoring.v1.header:${COURSE_ID}`,
    `course-authoring.v1.instructional-plan:${COURSE_ID}`,
    `course-authoring.v1.course-design:${COURSE_ID}:legacy`,
    `course-authoring.v1.outline:${COURSE_ID}`,
    `course-authoring.v1.study-unit-inspection:${COURSE_ID}`,
    `course-authoring.v1.study-unit-inspection-position:${COURSE_ID}`,
    `course-authoring.v1.entities:${COURSE_ID}:legacy`
  ]) {
    await store.putCache(key, { data: { sensitive: true } });
  }
  revoked = true;
  await assert.rejects(
    () => controller.loadCourseDesign(COURSE_ID, options),
    /acesso revogado/u
  );
  assert.equal(store.values.size, 0);

  await assert.rejects(
    () => controller.loadCourseDesign(COURSE_ID, { ...options, offset: 16 }),
    /Leitura do desenho inválida/u
  );
  await assert.rejects(
    () => controller.mutateCourseDesign({
      requestId: COURSE_B,
      courseId: COURSE_ID,
      expectedCourseRevision: 4,
      command,
      designCommand: command
    }),
    /Alteração do desenho inválida/u
  );
});

test("Controller compartilha citações redigidas e reserva catálogo completo ao proprietário", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  const currentSourceId = "source-current";
  const sources = {
    contract: "aralearn.course-sources.v3",
    bibliographyStyle: "abnt-2025",
    courseId: COURSE_ID,
    courseRevision: 4,
    mode: "catalog",
    query: { sourceId: null, targetId: null, targetKind: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [],
    nextCursor: null
  };
  const contextualSources = {
    ...sources,
    mode: "source",
    query: {
      sourceId: currentSourceId,
      targetKind: "study_unit",
      targetId: "unit-a"
    }
  };
  const change = {
    contract: "aralearn.course-source-change.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    requestId: "request-source-controller-1",
    idempotent: false,
    changed: true,
    change: { type: "retire_source", subjectId: currentSourceId, revision: 2 }
  };
  const citations = {
    contract: "aralearn.course-study-citations.v2",
    bibliographyStyle: "abnt-2025",
    courseId: COURSE_ID,
    courseRevision: 4,
    studyUnitId: "unit-a",
    citations: [{
      sourceRevision: 1, attachments: [],
      linkId: "link-fixture", kind: "document", authors: [], publicationDate: null, identifier: null, language: null,
      citationMode: "manual", bibliographic: createEmptyCourseSourceBibliographicMetadata(),
      relation: "informed_by", roles: [], occurrences: [],
      sourceId: currentSourceId,
      title: "Fonte A",
      citationText: "Fonte A, 2026.",
      url: null,
      editionOrVersion: null,
      anchors: []
    }]
  };
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId, options) {
      calls.push(["read", courseId, options]);
      return options.mode === "source" ? contextualSources : sources;
    },
    async mutateCourseSources(value) {
      calls.push(["write", structuredClone(value)]);
      return change;
    },
    async getStudyUnitCitations(courseId, studyUnitId, options) {
      calls.push(["citations", courseId, studyUnitId, options]);
      return citations;
    }
  };
  const owner = new CourseController({ api, store, ownerOnly: true });
  const shared = new CourseController({ api, store });
  assert.deepEqual(await owner.loadCourseSources(COURSE_ID, {
    expectedRevision: 4,
    mode: "catalog"
  }), sources);
  await assert.rejects(
    () => shared.loadCourseSources(COURSE_ID, { expectedRevision: 4, mode: "catalog" }),
    /catálogo privado/u
  );
  assert.deepEqual(await shared.getStudyUnitCitations(
    COURSE_ID,
    "unit-a",
    { expectedRevision: 4 }
  ), citations);
  assert.deepEqual(calls[0], ["read", COURSE_ID, {
    expectedRevision: 4,
    mode: "catalog",
    sourceId: null,
    targetKind: null,
    targetId: null,
    cursor: null,
    limit: 10
  }]);
  assert.deepEqual(calls[1], ["citations", COURSE_ID, "unit-a", {
    expectedRevision: 4
  }]);
  assert.deepEqual(await owner.loadCourseSources(COURSE_ID, {
    expectedRevision: 4,
    mode: "source",
    sourceId: currentSourceId,
    targetKind: "study_unit",
    targetId: "unit-a"
  }), contextualSources);
  assert.deepEqual(calls[2], ["read", COURSE_ID, {
    expectedRevision: 4,
    mode: "source",
    sourceId: currentSourceId,
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: null,
    limit: 1
  }]);

  for (const key of [
    `course-authoring.v1.course-sources:${COURSE_ID}:catalog`,
    `course-authoring.v1.entities:${COURSE_ID}:4:start`,
    `course-authoring.v1.header:${COURSE_ID}`
  ]) {
    await store.putCache(key, { sensitive: true });
  }
  const command = {
    type: "retire_source",
    sourceId: currentSourceId,
    expectedSourceRevision: 1
  };
  const mutation = {
    requestId: "request-source-controller-1",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    command
  };
  assert.deepEqual(await owner.mutateCourseSources(mutation), change);
  assert.deepEqual(await owner.mutateCourseSources(mutation), change);
  assert.deepEqual(calls.at(-2), calls.at(-1));
  assert.deepEqual(calls.at(-1)[1], {
    requestId: "request-source-controller-1",
    courseId: COURSE_ID,
    expectedRevision: 4,
    sourceCommand: command
  });
  assert.equal([...store.values.keys()].some((key) => key.includes(COURSE_ID)), false);

  const astralTargetId = "🔎".repeat(240);
  const astralSources = {
    ...sources,
    mode: "target",
    query: { sourceId: null, targetKind: "study_unit", targetId: astralTargetId }
  };
  const astralCitations = {
    ...citations,
    studyUnitId: astralTargetId,
    citations: []
  };
  const astralController = new CourseController({
    store: new MemoryStateStore(),
    ownerOnly: true,
    api: {
      ...api,
      async loadCourseSources() { return astralSources; },
      async getStudyUnitCitations() { return astralCitations; }
    }
  });
  assert.deepEqual(await astralController.loadCourseSources(COURSE_ID, {
    expectedRevision: 4,
    mode: "target",
    targetKind: "study_unit",
    targetId: astralTargetId
  }), astralSources);
  assert.deepEqual(await astralController.getStudyUnitCitations(
    COURSE_ID,
    astralTargetId,
    { expectedRevision: 4 }
  ), astralCitations);
  await assert.rejects(
    () => astralController.loadCourseSources(COURSE_ID, {
      expectedRevision: 4,
      mode: "target",
      targetKind: "study_unit",
      targetId: "🔎".repeat(241)
    }),
    /Leitura de Fontes inválida/u
  );
  await assert.rejects(
    () => astralController.getStudyUnitCitations(
      COURSE_ID,
      "🔎".repeat(241),
      { expectedRevision: 4 }
    ),
    /Leitura de citações inválida/u
  );

  const leaking = new CourseController({
    store: new MemoryStateStore(),
    api: {
      ...api,
      async getStudyUnitCitations() {
        return {
          ...citations,
          citations: [{ ...citations.citations[0], verificationExcerpt: "privado" }]
        };
      }
    }
  });
  await assert.rejects(
    () => leaking.getStudyUnitCitations(COURSE_ID, "unit-a", { expectedRevision: 4 }),
    (error) => error.code === "invalid_course_study_citations"
  );
});

test("Controller owner encaminha upload e download do PDF exato e invalida o Curso", async () => {
  const store = new MemoryStateStore();
  await store.putCache(`course-authoring.v1.course-sources:${COURSE_ID}:source`, {
    sensitive: true
  });
  const sourceId = "source-pdf";
  const contentHash = "a".repeat(64);
  const file = new Blob(["%PDF-1.7\nfixture"], { type: "application/pdf" });
  const calls = [];
  const change = {
    contract: "aralearn.course-source-change.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    requestId: "request-source-pdf-1",
    idempotent: false,
    changed: true,
    change: { type: "ingest_pdf", subjectId: sourceId, revision: 2 }
  };
  const access = {
    contract: "aralearn.course-source-pdf-download.v2",
    courseId: COURSE_ID,
    courseRevision: 5,
    sourceId,
    sourceRevision: 2,
    attachment: {
      contentHash,
      byteSize: file.size,
      mediaType: "application/pdf",
    },
    signedUrl: "https://project.invalid/storage/file.pdf?token=download-token",
    expiresAt: "2026-08-20T12:01:00.000Z"
  };
  const owner = new CourseController({
    store,
    ownerOnly: true,
    api: {
      async listCourses() { return courseListPage([]); },
      async getCourse() { throw new Error("não usado"); },
      async uploadCourseSourcePdf(value) {
        calls.push(["upload", value]);
        return change;
      },
      async getCourseSourceAttachmentDownload(value) {
        calls.push(["download", value]);
        return access;
      }
    }
  });
  assert.deepEqual(await owner.uploadCourseSourcePdf({
    requestId: "request-source-pdf-1",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    sourceId,
    sourceRevision: 2,
    file
  }), change);
  assert.equal([...store.values.keys()].some((key) => key.includes(COURSE_ID)), false);
  assert.equal(calls[0][1].expectedRevision, 4);
  assert.equal(calls[0][1].file, file);

  assert.deepEqual(await owner.getCourseSourceAttachmentDownload({
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    sourceId,
    sourceRevision: 2,
    contentHash
  }), access);
  assert.deepEqual(calls[1], ["download", {
    courseId: COURSE_ID,
    expectedRevision: 5,
    sourceId,
    sourceRevision: 2,
    contentHash
  }]);

  const shared = new CourseController({
    store: new MemoryStateStore(),
    api: {
      async listCourses() { return courseListPage([]); },
      async getCourse() { throw new Error("não usado"); },
      async getCourseSourceAttachmentDownload() { return access; }
    }
  });
  assert.deepEqual(await shared.getCourseSourceAttachmentDownload({
    courseId: COURSE_ID, expectedCourseRevision: 5, sourceId, sourceRevision: 2, contentHash
  }), access);

});

test("Controller classifica remove_pdf como mudança da Fonte", async () => {
  const sourceId = "source-pdf";
  const contentHash = "b".repeat(64);
  const calls = [];
  const owner = new CourseController({
    store: new MemoryStateStore(),
    ownerOnly: true,
    api: {
      async listCourses() { return courseListPage([]); },
      async getCourse() { throw new Error("não usado"); },
      async mutateCourseSources(value) {
        calls.push(structuredClone(value));
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 5,
          requestId: value.requestId,
          idempotent: false,
          changed: true,
          change: { type: "remove_pdf", subjectId: sourceId, revision: 1 }
        };
      }
    }
  });
  const command = {
    type: "remove_pdf",
    sourceId,
    expectedSourceRevision: 1,
    contentHash
  };
  await owner.mutateCourseSources({
    requestId: "request-remove-pdf-1",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    command
  });
  assert.deepEqual(calls[0].sourceCommand, command);
});


test("Analytics é owner-only, remoto e ligado à revisão solicitada", async () => {
  const query = normalizeCourseAuthoringAnalyticsQuery();
  const page = assembleCourseAuthoringAnalyticsPage(analyticsSnapshot(), {
    publicAppUrl: "https://app.example",
    expectedQuery: query
  });
  const calls = [];
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseAuthoringAnalytics(courseId, value) {
      calls.push({ courseId, value: structuredClone(value) });
      return page;
    }
  };
  const owner = new CourseController({
    api,
    store: new MemoryStateStore(),
    ownerOnly: true
  });
  const reader = new CourseController({
    api,
    store: new MemoryStateStore(),
    ownerOnly: false
  });

  assert.deepEqual(await owner.loadCourseAuthoringAnalytics(COURSE_ID, {
    expectedCourseRevision: 7,
    query
  }), page);
  assert.deepEqual(calls[0], {
    courseId: COURSE_ID,
    value: { expectedCourseRevision: 7, query }
  });
  await assert.rejects(() => reader.loadCourseAuthoringAnalytics(COURSE_ID, {
    expectedCourseRevision: 7,
    query
  }), /não oferece (?:Analytics|Pesquisa)/u);
});


test("Controller preserva caches no conflito de citações e purga somente a revogação real", async () => {
  const store = new MemoryStateStore();
  let failure = "stale";
  const controller = new CourseController({
    store,
    api: {
      async listCourses() { return courseListPage([]); },
      async getCourse() { throw new Error("não usado"); },
      async getStudyUnitCitations() {
        if (failure === "stale") {
          throw Object.assign(new Error("Revisão base desatualizada."), {
            status: 500,
            code: "40001"
          });
        }
        throw Object.assign(new Error("Curso não encontrado."), {
          status: 404,
          code: "PT404"
        });
      }
    }
  });
  const privateKeys = [
    "course.v1.list::start",
    `course.v1.header:${COURSE_ID}`,
    `course.v1.verified-composition:${COURSE_ID}`,
    `course.v1.entities:${COURSE_ID}:4:start`,
    `${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${COURSE_ID}`
  ];
  for (const key of privateKeys) await store.putCache(key, { sensitive: true });

  await assert.rejects(
    () => controller.getStudyUnitCitations(
      COURSE_ID,
      "unit-removed-after-revision-4",
      { expectedRevision: 4 }
    ),
    (error) => error.code === "course_revision_changed" &&
      error.status === 409 && error.cause?.code === "40001"
  );
  assert.deepEqual([...store.values.keys()].sort(), [...privateKeys].sort());

  failure = "revoked";
  await assert.rejects(
    () => controller.getStudyUnitCitations(
      COURSE_ID,
      "unit-a",
      { expectedRevision: 4 }
    ),
    (error) => error.status === 404 && error.code === "PT404"
  );
  assert.deepEqual([...store.values.keys()], []);
});

test("inspeção autoral usa cache paginado limitado e posição local por dispositivo", async () => {
  const store = new MemoryStateStore();
  let online = true;
  const calls = [];
  const page = {
    contract: "aralearn.course-study-unit-inspection-page.v2",
    courseId: COURSE_ID,
    courseRevision: 4,
    scope: { kind: "course", id: null },
    totalCount: 0,
    scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 0 },
    items: [],
    hasPrevious: false,
    hasMore: false,
    previousCursor: null,
    nextCursor: null,
    pageBytes: 32
  };
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { throw new Error("não usado"); },
    async loadAuthoringOutline(courseId) {
      if (!online) throw networkFailure();
      return { courseId, revision: 4, outline: { modules: [] } };
    },
    async loadAuthoringStudyUnits(courseId, options) {
      calls.push({ courseId, options });
      if (!online) throw networkFailure();
      return page;
    }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });

  assert.equal((await controller.loadAuthoringOutline(COURSE_ID)).offline, false);
  const first = await controller.loadAuthoringStudyUnits(COURSE_ID, {
    expectedRevision: 4
  });
  assert.equal(first.offline, false);
  assert.equal(calls.length, 1);

  online = false;
  const cached = await controller.loadAuthoringStudyUnits(COURSE_ID, {
    expectedRevision: 4
  });
  assert.equal(cached.offline, true);
  assert.equal(cached.stale, true);

  const position = {
    scope: { kind: "course", id: null },
    studyUnitId: "unit-a",
    offsetFromStickyTop: 18.5,
    courseRevision: 4
  };
  assert.deepEqual(
    await controller.saveAuthoringInspectionPosition(COURSE_ID, position),
    position
  );
  assert.deepEqual(await controller.loadAuthoringInspectionPosition(COURSE_ID), position);

  online = true;
  for (let index = 0; index < 5; index += 1) {
    await controller.loadAuthoringStudyUnits(COURSE_ID, {
      expectedRevision: 4,
      cursor: { studyUnitId: `unit-${index}` }
    });
  }
  const inspectionCache = store.values.get(
    `course-authoring.v1.study-unit-inspection:${COURSE_ID}`
  );
  assert.equal(inspectionCache.entries.length, 4);
  assert.equal(
    [...store.values.keys()].some((key) =>
      key.includes(`study-unit-inspection-position:${COURSE_ID}`)),
    true
  );
});

test("duas instâncias observam a mesma posição de Inspeção no IndexedDB do dispositivo", async () => {
  const indexedDb = new IDBFactory();
  const [firstStore, secondStore] = await Promise.all([
    CourseLocalStore.open(indexedDb, { userId: COURSE_ID }),
    CourseLocalStore.open(indexedDb, { userId: COURSE_ID })
  ]);
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { throw new Error("não usado"); }
  };
  const first = new CourseController({ api, store: firstStore, ownerOnly: true });
  const second = new CourseController({ api, store: secondStore, ownerOnly: true });
  const position = {
    scope: { kind: "didactic_microsequence", id: "micro-a" },
    studyUnitId: "unit-025",
    offsetFromStickyTop: 14.5,
    courseRevision: 4
  };

  await first.saveAuthoringInspectionPosition(COURSE_ID, position);
  assert.deepEqual(await second.loadAuthoringInspectionPosition(COURSE_ID), position);
  const next = { ...position, studyUnitId: "unit-026", offsetFromStickyTop: 9 };
  await second.saveAuthoringInspectionPosition(COURSE_ID, next);
  assert.deepEqual(await first.loadAuthoringInspectionPosition(COURSE_ID), next);

  firstStore.close();
  secondStore.close();
});


test("edição contextual owner preserva proveniência e invalida todas as projeções afetadas", async () => {
  const store = new MemoryStateStore();
  const sourceLinks = [{
    sourceId: "fonte retirada",
    linkId: "fonte retirada", roles: [], occurrences: [],
    relation: "needs_verification",
    anchors: []
  }];
  const calls = [];
  const api = {
    async listCourses() { return courseListPage(); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId, options) {
      calls.push(["sources", courseId, structuredClone(options)]);
      return {
        contract: "aralearn.course-sources.v3",
        bibliographyStyle: "abnt-2025",
        courseId,
        courseRevision: 4,
        mode: "target",
        query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: [{
          targetKind: "study_unit",
          targetId: "unit-a",
          targetVersion: 2,
          sourceLinks,
          createdAt: "2026-08-20T22:40:00.000Z"
        }],
        nextCursor: null
      };
    },
    async commitCourseComposition(value) {
      calls.push(["commit", structuredClone(value)]);
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
    async loadAuthoringStudyUnits(courseId, options) {
      calls.push(["reread", courseId, structuredClone(options)]);
      return {
        contract: "aralearn.course-study-unit-inspection-page.v2",
        courseId,
        courseRevision: 5,
        scope: { kind: "course", id: null },
        totalCount: 1,
        scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
        items: [{
          studyUnit: editableStudyUnit(),
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
        }],
        hasPrevious: false,
        hasMore: false,
        previousCursor: null,
        nextCursor: null,
        pageBytes: 640
      };
    }
  };
  const owner = new CourseController({ api, store, ownerOnly: true });
  const shared = new CourseController({ api, store });
  const affected = [
    `course-authoring.v1.list:`,
    `course-authoring.v1.header:${COURSE_ID}`,
    `course-authoring.v1.verified-composition:${COURSE_ID}`,
    `course-authoring.v1.instructional-plan:${COURSE_ID}`,
    `course-authoring.v1.course-design:${COURSE_ID}:course`,
    `course-authoring.v1.course-sources:${COURSE_ID}:target`,
    `course-authoring.v1.outline:${COURSE_ID}`,
    `course-authoring.v1.entities:${COURSE_ID}:4`,
    "course.v1.review-page"
  ];
  for (const key of affected) await store.putCache(key, { stale: true });
  const positionKey = `course-authoring.v1.study-unit-inspection-position:${COURSE_ID}`;
  await store.putCache(positionKey, { preserve: true });
  const command = {
    requestId: "request-manual-edit-0001",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: editableStudyUnit(),
    origin: "manual"
  };

  const result = await owner.commitCourseComposition(command);

  assert.equal(result.courseRevision, 5);
  assert.deepEqual(result.studyUnit, editableStudyUnit());
  assert.equal(result.version, 3);
  assert.equal(result.reconciled, true);
  assert.deepEqual(calls[0], ["sources", COURSE_ID, {
    expectedRevision: 4,
    mode: "target",
    sourceId: null,
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: null,
    limit: 1
  }]);
  assert.deepEqual(calls[1][1].sourceLinks, sourceLinks);
  assert.equal(calls[1][1].origin, "manual");
  assert.deepEqual(calls[2], ["reread", COURSE_ID, {
    expectedRevision: 5,
    scope: { kind: "course", id: null },
    anchorStudyUnitId: "unit-a",
    cursor: null,
    direction: "forward",
    limit: 1,
    maxBytes: 64 * 1024
  }]);
  for (const key of affected) assert.equal(store.values.has(key), false, key);
  const refreshedInspection = await store.getCache(
    `course-authoring.v1.study-unit-inspection:${COURSE_ID}`
  );
  assert.equal(refreshedInspection.entries[0].page.courseRevision, 5);
  assert.equal(refreshedInspection.entries[0].page.items[0].version, 3);
  assert.deepEqual(await store.getCache(positionKey), { preserve: true });
  await assert.rejects(
    () => shared.commitCourseComposition(command),
    /edição contextual/u
  );
});

test("edição contextual de Unidade sem atribuição preserva proveniência vazia", async () => {
  const store = new MemoryStateStore();
  let committed = null;
  const api = {
    async listCourses() { return courseListPage(); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId) {
      return {
        contract: "aralearn.course-sources.v3",
        bibliographyStyle: "abnt-2025",
        courseId,
        courseRevision: 4,
        mode: "target",
        query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: [],
        nextCursor: null
      };
    },
    async commitCourseComposition(value) {
      committed = structuredClone(value);
      return {
        courseId: COURSE_ID,
        courseRevision: 5,
        studyUnitId: "unit-a",
        studyUnitVersion: 3,
        changed: true,
        idempotent: false,
        channel: "application",
        origin: "provider_assistance",
        updatedAt: "2026-08-20T22:45:00.000Z"
      };
    },
    async loadAuthoringStudyUnits(courseId) {
      return {
        contract: "aralearn.course-study-unit-inspection-page.v2",
        courseId,
        courseRevision: 5,
        scope: { kind: "course", id: null },
        totalCount: 1,
        scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
        items: [{
          studyUnit: editableStudyUnit(),
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
        }],
        hasPrevious: false,
        hasMore: false,
        previousCursor: null,
        nextCursor: null,
        pageBytes: 640
      };
    }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });

  const result = await controller.commitCourseComposition({
    requestId: "request-provider-edit-0001",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: editableStudyUnit(),
    origin: "provider_assistance"
  });

  assert.deepEqual(committed.sourceLinks, []);
  assert.equal(result.origin, "provider_assistance");
  assert.equal(result.version, 3);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.studyUnit, editableStudyUnit());
});

test("edição estrutural assistida preserva proveniência por Unidade e é restrita ao proprietário", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  const sourceLinks = [{
    sourceId: "fonte retirada",
    linkId: "fonte retirada", roles: [], occurrences: [],
    relation: "needs_verification",
    anchors: []
  }];
  const api = {
    async listCourses() { return courseListPage(); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId, options) {
      calls.push(["sources", options.targetId]);
      return {
        contract: "aralearn.course-sources.v3",
        bibliographyStyle: "abnt-2025",
        courseId,
        courseRevision: 4,
        mode: "target",
        query: { sourceId: null, targetKind: "study_unit", targetId: options.targetId },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: options.targetId === "unit-a" ? [{
          targetKind: "study_unit",
          targetId: "unit-a",
          targetVersion: 2,
          sourceLinks,
          createdAt: "2026-08-20T22:40:00.000Z"
        }] : [],
        nextCursor: null
      };
    },
    async commitCourseStructuralComposition(value) {
      calls.push(["commit", structuredClone(value)]);
      return {
        courseId: COURSE_ID,
        requestId: value.requestId,
        courseRevision: 5,
        changed: true,
        idempotent: false
      };
    }
  };
  const owner = new CourseController({ api, store, ownerOnly: true });
  const reader = new CourseController({ api, store });
  const command = {
    requestId: "request-structural-edit-0001",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    upserts: [{
      entityType: "study_unit", entityId: "unit-a", parentType: "microsequence",
      parentId: "micro-a", position: 1, content: {
        title: "Unidade revista", role: "theory", content: [], response: null,
        feedback: [], topics: []
      }
    }, {
      entityType: "study_unit", entityId: "unit-new", parentType: "microsequence",
      parentId: "micro-a", position: 2, content: {
        title: "Unidade nova", role: "theory", content: [], response: null,
        feedback: [], topics: []
      }
    }],
    deletes: []
  };
  const result = await owner.commitCourseStructuralComposition(command);
  assert.equal(result.courseRevision, 5);
  assert.deepEqual(calls.slice(0, 2), [["sources", "unit-a"], ["sources", "unit-new"]]);
  assert.deepEqual(calls[2][1].sourceAttributionApplications, [{
    studyUnitId: "unit-a", sourceLinks
  }, {
    studyUnitId: "unit-new", sourceLinks: []
  }]);
  await assert.rejects(
    () => reader.commitCourseStructuralComposition(command),
    /edição estrutural assistida/u
  );
});

test("falha transitória da releitura não transforma receipt confirmado em escrita ambígua", async () => {
  const store = new MemoryStateStore();
  let commits = 0;
  const api = {
    async listCourses() { return courseListPage(); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId) {
      return {
        contract: "aralearn.course-sources.v3",
        bibliographyStyle: "abnt-2025",
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
    async loadAuthoringStudyUnits() { throw networkFailure(); }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });

  const result = await controller.commitCourseComposition({
    requestId: "request-confirmed-read-failure-01",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: editableStudyUnit(),
    origin: "manual"
  });

  assert.equal(commits, 1);
  assert.equal(result.courseRevision, 5);
  assert.equal(result.version, 3);
  assert.equal(result.reconciled, false);
  assert.deepEqual(result.studyUnit, editableStudyUnit());
  assert.equal(store.values.has(
    `course-authoring.v1.study-unit-inspection:${COURSE_ID}`
  ), false);
});

test("retry idempotente reutiliza a proveniência anterior sem preflight na revisão já avançada", async () => {
  const store = new MemoryStateStore();
  const sourceLinks = [{
    sourceId: "fonte retirada",
    linkId: "fonte retirada", roles: [], occurrences: [],
    relation: "needs_verification",
    anchors: []
  }];
  let sourceReads = 0;
  const commits = [];
  const api = {
    async listCourses() { return courseListPage(); },
    async getCourse() { throw new Error("não usado"); },
    async loadCourseSources(courseId) {
      sourceReads += 1;
      if (sourceReads > 1) {
        throw Object.assign(new Error("revisão antiga"), {
          code: "course_revision_changed",
          status: 409
        });
      }
      return {
        contract: "aralearn.course-sources.v3",
        bibliographyStyle: "abnt-2025",
        courseId,
        courseRevision: 4,
        mode: "target",
        query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: [{
          targetKind: "study_unit",
          targetId: "unit-a",
          targetVersion: 2,
          sourceLinks,
          createdAt: "2026-08-20T22:40:00.000Z"
        }],
        nextCursor: null
      };
    },
    async commitCourseComposition(value) {
      commits.push(structuredClone(value));
      if (commits.length === 1) throw networkFailure();
      return {
        courseId: COURSE_ID,
        courseRevision: 5,
        studyUnitId: "unit-a",
        studyUnitVersion: 3,
        changed: true,
        idempotent: true,
        channel: "application",
        origin: "manual",
        updatedAt: "2026-08-20T22:45:00.000Z"
      };
    },
    async loadAuthoringStudyUnits(courseId) {
      return {
        contract: "aralearn.course-study-unit-inspection-page.v2",
        courseId,
        courseRevision: 5,
        scope: { kind: "course", id: null },
        totalCount: 1,
        scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
        items: [{
          studyUnit: editableStudyUnit(),
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
        }],
        hasPrevious: false,
        hasMore: false,
        previousCursor: null,
        nextCursor: null,
        pageBytes: 640
      };
    }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });
  const command = {
    requestId: "request-ambiguous-replay-0001",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: editableStudyUnit(),
    origin: "manual"
  };

  await assert.rejects(() => controller.commitCourseComposition(command), /offline/u);
  const result = await controller.commitCourseComposition(command);

  assert.equal(sourceReads, 1);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[1], commits[0]);
  assert.deepEqual(commits[1].sourceLinks, sourceLinks);
  assert.equal(result.idempotent, true);
  assert.equal(result.reconciled, true);
});

test("perfil escolhido atualiza cache e operações de acesso, avatar e conta chegam à API", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  const profile = { contract: "aralearn.person-profile.v2", userId: COURSE_B,
    handle: null, avatarObjectKey: null, updatedAt: "2026-09-05T12:00:00Z" };
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { return { courseId: COURSE_ID }; },
    async getPersonProfile() { calls.push(["profile-read"]); return profile; },
    async updatePersonProfile(value) { calls.push(["profile-update", value]); return { ...profile, ...value }; },
    async listCourseAccess(value) { calls.push(["access-list", value]); return { items: [] }; },
    async grantCourseAccess(value) { calls.push(["access-grant", value]); return value; },
    async revokeCourseAccess(value) { calls.push(["access-revoke", value]); return value; },
    async uploadAvatar(value, options) { calls.push(["avatar-upload", value, options]); return {}; },
    async loadAvatar(value) { calls.push(["avatar-load", value]); return new Blob(); },
    async deleteOwnAvatar(value) { calls.push(["avatar-delete", value]); },
    async deleteMyAccount(value) { calls.push(["account-delete", value]); return { deleted: true }; }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });
  const file = new Blob(["x"], { type: "image/png" });
  const key = "20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003.png";

  await controller.getPersonProfile();
  await controller.updatePersonProfile({ handle: "pesquisadora" });
  assert.equal((await store.getCache("aralearn.person-profile.v2")).data.handle, "pesquisadora");
  await controller.listCourseAccess(COURSE_ID);
  await controller.grantCourseAccess({ courseId: COURSE_ID });
  await controller.revokeCourseAccess({ courseId: COURSE_ID });
  await controller.uploadAvatar(file, { objectId: "id" });
  await controller.loadAvatar(key);
  await controller.deleteOwnAvatar(key);
  await controller.deleteMyAccount({ confirmation: "EXCLUIR MINHA CONTA" });

  assert.deepEqual(calls.map(([name]) => name), [
    "profile-read", "profile-update", "access-list", "access-grant", "access-revoke",
    "avatar-upload", "avatar-load", "avatar-delete", "account-delete"
  ]);
});
