import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import { COURSE_PERSONAL_STATE_CACHE_CONTRACT } from
  "../../src/persistence/CoursePersonalStateRepository.js";
import {
  ACCESSIBLE_COURSE_IDS_CACHE_KEY,
  ACCESSIBLE_COURSE_IDS_CONTRACT,
  CourseController
} from "../../src/supabase/CourseController.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_B = "20000000-0000-4000-8000-000000000002";

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
    contract: "aralearn.course-list.v1",
    items,
    hasMore: false,
    nextCursor: null,
    ...overrides
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
    contract: "aralearn.library.v1",
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
  await store.putCache(`course.v1.entities:${COURSE_ID}:2:start`, { data: { items: [] } });
  await store.putCache(`course.v1.entities:${COURSE_ID}:2:next`, { data: { items: [] } });
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

test("plano instrucional usa cache autoral e mutação encaminha um comando estável", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  const plan = {
    contract: "aralearn.course-instructional-plan.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    plan: { id: COURSE_B, version: 2, parts: [] },
    recentActivity: []
  };
  let online = true;
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { throw new Error("não usado"); },
    async loadAuthoringPlan(courseId) {
      calls.push(["read", courseId]);
      if (!online) throw networkFailure();
      return plan;
    },
    async mutateAuthoringPlan(value) {
      calls.push(["write", value]);
      return { changed: true };
    }
  };
  const controller = new CourseController({ api, store, ownerOnly: true });

  assert.equal((await controller.loadAuthoringPlan(COURSE_ID)).offline, false);
  online = false;
  assert.equal((await controller.loadAuthoringPlan(COURSE_ID)).offline, true);
  online = true;
  await controller.mutateAuthoringPlan({
    requestId: COURSE_B,
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedPlanVersion: 2,
    operation: "update_plan",
    audience: "Docentes"
  });

  assert.deepEqual(calls.at(-1), ["write", {
    requestId: COURSE_B,
    courseId: COURSE_ID,
    expectedRevision: 4,
    expectedPlanVersion: 2,
    planCommand: { type: "update_plan", audience: "Docentes" }
  }]);
  assert.equal([...store.values.keys()].some((key) =>
    key.includes(`instructional-plan:${COURSE_ID}`)), false);
});

test("leitura de materialização é sempre remota e preserva as identidades explícitas", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  const materializationId = "30000000-0000-4000-8000-000000000003";
  const partId = "40000000-0000-4000-8000-000000000004";
  const value = { contract: "aralearn.course-authoring-part-materialization.v1" };
  const controller = new CourseController({
    store,
    ownerOnly: true,
    api: {
      async listCourses() { return courseListPage([]); },
      async getCourse() { throw new Error("não usado"); },
      async loadPartMaterialization(...args) {
        calls.push(args);
        return value;
      }
    }
  });

  assert.equal(
    await controller.loadPartMaterialization(COURSE_ID, partId, materializationId),
    value
  );
  assert.deepEqual(calls, [[COURSE_ID, partId, materializationId]]);
  assert.equal([...store.values.keys()].some((key) =>
    key.includes("materialization")), false);
});

test("pedido de materialização é somente entregue ao chat conectado", async () => {
  const store = new MemoryStateStore();
  const deliveries = [];
  const controller = new CourseController({
    store,
    api: {
      async listCourses() { return courseListPage([]); },
      async getCourse() { throw new Error("não usado"); }
    },
    deliverMaterializationRequest(payload) {
      deliveries.push(payload);
      return { delivery: "clipboard", message: "Pedido copiado." };
    }
  });
  const payload = {
    requestId: COURSE_B,
    courseId: COURSE_ID,
    authoringPartId: "30000000-0000-4000-8000-000000000003",
    requestText: "Materialize esta Parte."
  };

  assert.deepEqual(await controller.requestPartMaterialization(payload), {
    delivery: "clipboard",
    message: "Pedido copiado."
  });
  assert.deepEqual(deliveries, [payload]);
  payload.requestText = "alterado depois";
  assert.equal(deliveries[0].requestText, "Materialize esta Parte.");
});

test("operações de perfil, acesso, avatar e conta são delegadas sem outra camada", async () => {
  const store = new MemoryStateStore();
  const calls = [];
  const api = {
    async listCourses() { return courseListPage([]); },
    async getCourse() { return { courseId: COURSE_ID }; },
    async getPersonProfile() { calls.push(["profile-read"]); return { displayName: null }; },
    async updatePersonProfile(value) { calls.push(["profile-update", value]); return value; },
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
  await controller.updatePersonProfile({ displayName: "Pesquisadora" });
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
