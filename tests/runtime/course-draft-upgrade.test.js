import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { CourseLocalStore, COURSE_LOCAL_DATABASE_PREFIX } from "../../src/persistence/CourseLocalStore.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { STUDY_DRAFT_RECOVERY_CACHE_KEY, readStudyDraftRecoveries, serializeStudyDraftSnapshot } from "../../src/persistence/studyDraftRecovery.js";

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER_COURSE = "20000000-0000-4000-8000-000000000002";
const NAME = `${COURSE_LOCAL_DATABASE_PREFIX}-${USER}`;
const PREVIOUS_KEYS = ["course.v1.study-draft-recovery", "aralearn.personal-course-copy-edit-pending.v1"];
const draft = (requestId, sourceCourseId = USER) => ({ sourceCourseId, requestId,
  studyUnit: { title: `Texto ${requestId}`, unknown: { preserve: "Integral" } },
  sourceSelection: { courseId: sourceCourseId, studyUnitId: "unit-a" }, extra: [1, 2, 3] });

async function versionOne(indexedDb, records = null) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDb.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("course_cache", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (records) {
    const transaction = database.transaction("course_cache", "readwrite");
    for (const [key, value] of records) transaction.objectStore("course_cache").put({ key, value });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
  }
  return database;
}

async function upgraded(t, records) {
  const indexedDb = new IDBFactory();
  (await versionOne(indexedDb, records)).close();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER });
  t.after(() => store.close());
  const calls = [];
  const controller = new CourseController({ store, api: { listCourses: async () => ({}),
    getCourse: async () => ({}), recoverOwnedCourseCopy: async (input) => { calls.push(input); return {}; } } });
  return { store, indexedDb, controller, calls };
}

test("instalação nova não lê chaves anteriores e upgrade vazio converge à mesma versão", async (t) => {
  const fresh = await CourseLocalStore.open(new IDBFactory(), { userId: USER });
  t.after(() => fresh.close());
  const { store } = await upgraded(t, []);
  assert.equal(fresh.database.version, 2);
  assert.equal(store.database.version, fresh.database.version);
  assert.equal(await fresh.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), null);
  assert.equal(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), null);
  assert.equal(typeof store.moveCacheValue, "undefined");
});

test("duas chaves de cursos distintos convergem sem sobrescrever conteúdo nem cache corrente", async (t) => {
  const snapshots = [draft("one"), draft("two", OTHER_COURSE)];
  const { store, controller } = await upgraded(t,
    [...PREVIOUS_KEYS.map((key, index) => [key, snapshots[index]]), ["course.v1.header:useful", { revision: 9 }]]);
  for (const key of PREVIOUS_KEYS) assert.equal(await store.getCache(key), null);
  assert.deepEqual(await store.getCache("course.v1.header:useful"), { revision: 9 });
  assert.deepEqual((await controller.loadStudyDraftRecovery(USER)).originalSnapshot, snapshots[0]);
  assert.deepEqual((await controller.loadStudyDraftRecovery(OTHER_COURSE)).originalSnapshot, snapshots[1]);
  const collection = await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY);
  assert.deepEqual(readStudyDraftRecoveries(collection).map(({ originalSnapshot }) => originalSnapshot), snapshots);
});

for (const sameRequest of [false, true]) {
  test(`duas intenções do mesmo curso ficam acessíveis com requestId ${sameRequest ? "igual" : "distinto"}`, async (t) => {
    const first = draft("one");
    const second = { ...draft(sameRequest ? "one" : "two"), usefulDifference: "Outra intenção" };
    const { controller, calls } = await upgraded(t, [[PREVIOUS_KEYS[0], first], [PREVIOUS_KEYS[1], second]]);
    const current = await controller.loadStudyDraftRecovery(USER);
    assert.equal(await controller.clearStudyDraftRecovery(USER, current.requestId, current.recoveryId), true);
    const next = await controller.loadStudyDraftRecovery(USER);
    assert.notEqual(next.recoveryId, current.recoveryId);
    assert.deepEqual(next.originalSnapshot, second);
    assert.equal(await controller.clearStudyDraftRecovery(USER, current.requestId, current.recoveryId), false);
    assert.equal(await controller.recoverStudyDraft(USER, current.recoveryId), null);
    assert.equal(calls.length, 0);
    assert.equal(await controller.clearStudyDraftRecovery(USER, next.requestId, next.recoveryId), true);
    assert.equal(await controller.loadStudyDraftRecovery(), null);
  });
}

test("snapshots idênticos ainda são duas entradas e descarte remove somente a selecionada", async (t) => {
  const snapshot = draft("same");
  const { store, controller } = await upgraded(t, PREVIOUS_KEYS.map((key) => [key, snapshot]));
  const first = await controller.loadStudyDraftRecovery();
  assert.equal(await controller.clearStudyDraftRecovery(USER, first.requestId, first.recoveryId), true);
  assert.equal((await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY)).entries.length, 1);
  assert.deepEqual((await controller.loadStudyDraftRecovery()).originalSnapshot, snapshot);
});

test("formatos desconhecidos, falsy e cíclicos são preservados integralmente sem chamada de rede", async (t) => {
  const cycle = { useful: "Não apagar" }; cycle.self = cycle;
  for (const snapshot of [{ unknown: ["preservar", { useful: true }] }, ["array"], "texto", false, 0, null, cycle]) {
    const { controller, calls } = await upgraded(t, [[PREVIOUS_KEYS[0], snapshot]]);
    const result = await controller.recoverStudyDraft();
    assert.equal(result.status, "unresolved");
    assert.deepEqual(result.pending.originalSnapshot, snapshot);
    assert.equal(result.pending.command, null);
    assert.equal(calls.length, 0);
    assert.equal(await controller.clearStudyDraftRecovery(null, null, result.pending.recoveryId), true);
    assert.equal(await controller.loadStudyDraftRecovery(), null);
  }
});

test("falha após gravação do destino reverte exclusões, conteúdo e versão; nova tentativa recupera", async (t) => {
  const indexedDb = new IDBFactory();
  const snapshots = [draft("one"), draft("two")];
  (await versionOne(indexedDb, PREVIOUS_KEYS.map((key, index) => [key, snapshots[index]]))).close();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...rest) {
    const request = originalPut.call(this, value, ...rest);
    if (value.key === STUDY_DRAFT_RECOVERY_CACHE_KEY) {
      request.addEventListener("success", () => this.transaction.abort());
    }
    return request;
  };
  try {
    await assert.rejects(CourseLocalStore.open(indexedDb, { userId: USER }), /preservados.*tente abrir/u);
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  const original = await versionOne(indexedDb);
  assert.equal(original.version, 1);
  const rows = await new Promise((resolve, reject) => {
    const request = original.transaction("course_cache").objectStore("course_cache").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(rows.length, 2);
  for (let i = 0; i < PREVIOUS_KEYS.length; i += 1) {
    assert.deepEqual(rows.find(({ key }) => key === PREVIOUS_KEYS[i]).value, snapshots[i]);
  }
  original.close();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER });
  t.after(() => store.close());
  assert.equal(store.database.version, 2);
  assert.equal((await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY)).entries.length, 2);
});

test("destino inesperado interrompe upgrade sem apagar qualquer registro", async () => {
  const indexedDb = new IDBFactory();
  const records = [[PREVIOUS_KEYS[0], draft("one")], [STUDY_DRAFT_RECOVERY_CACHE_KEY, { unknown: "Útil" }]];
  (await versionOne(indexedDb, records)).close();
  await assert.rejects(CourseLocalStore.open(indexedDb, { userId: USER }), /dados locais.*preservados/u);
  const original = await versionOne(indexedDb);
  const rows = await new Promise((resolve) => {
    const request = original.transaction("course_cache").objectStore("course_cache").getAll();
    request.onsuccess = () => resolve(request.result);
  });
  assert.equal(rows.length, 2);
  for (const [key, value] of records) assert.deepEqual(rows.find((row) => row.key === key).value, value);
  original.close();
});

test("reabertura não remigra e leitura corrente nunca consulta as chaves removidas", async (t) => {
  const { store, indexedDb } = await upgraded(t, [[PREVIOUS_KEYS[0], draft("one")]]);
  const before = await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY);
  store.close();
  const reopened = await CourseLocalStore.open(indexedDb, { userId: USER });
  t.after(() => reopened.close());
  const read = reopened.getCache.bind(reopened);
  const reads = [];
  reopened.getCache = (key) => { reads.push(key); return read(key); };
  const controller = new CourseController({ store: reopened, api: { listCourses: async () => ({}), getCourse: async () => ({}) } });
  await controller.loadStudyDraftRecovery();
  await controller.loadStudyDraftRecovery(USER);
  assert.deepEqual(reads, [STUDY_DRAFT_RECOVERY_CACHE_KEY, STUDY_DRAFT_RECOVERY_CACHE_KEY]);
  assert.deepEqual(await read(STUDY_DRAFT_RECOVERY_CACHE_KEY), before);
  await assert.rejects(versionOne(indexedDb), { name: "VersionError" });
});

test("coleção corrente inválida falha fechada sem aceitar snapshot antigo como fallback", async (t) => {
  const { store, controller } = await upgraded(t, []);
  const unknown = { arbitrary: "recuperar fora do leitor corrente" };
  await store.putCache(STUDY_DRAFT_RECOVERY_CACHE_KEY, unknown);
  await assert.rejects(controller.loadStudyDraftRecovery(), /dados foram preservados/u);
  assert.deepEqual(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), unknown);
});

test("exportação mantém JSON original e reconstrói conteúdo e identidade de snapshot cíclico", () => {
  const plain = draft("one");
  assert.deepEqual(JSON.parse(serializeStudyDraftSnapshot(plain)), plain);
  const snapshot = { text: "Rascunho integral", values: [undefined, 2n, -0, Infinity] };
  snapshot.self = snapshot;
  snapshot.alias = snapshot.values;
  snapshot.values.push(snapshot);
  const exported = JSON.parse(serializeStudyDraftSnapshot(snapshot));
  assert.equal(exported.contract, "aralearn.study-draft-snapshot-graph.v1");
  const nodes = exported.nodes.map((node) => node.type === "array" ? new Array(node.length) : {});
  const decode = (value) => {
    if (value === null || typeof value !== "object") return value;
    if (Object.hasOwn(value, "ref")) return nodes[value.ref];
    if (value.scalar === "undefined") return undefined;
    if (value.scalar === "bigint") return BigInt(value.value);
    if (value.scalar === "number") return Number(value.value);
    throw new Error("Formato de referência desconhecido.");
  };
  exported.nodes.forEach((node, index) => {
    for (const [key, value] of node.properties) Object.defineProperty(nodes[index], key,
      { value: decode(value), writable: true, enumerable: true, configurable: true });
  });
  const restored = decode(exported.root);
  assert.deepEqual(restored, snapshot);
  assert.equal(restored.self, restored);
  assert.equal(restored.alias, restored.values);
  assert.equal(restored.values[4], restored);
  const array = [1]; array.note = "Propriedade útil";
  const arrayExport = JSON.parse(serializeStudyDraftSnapshot(array));
  assert.equal(arrayExport.contract, "aralearn.study-draft-snapshot-graph.v1");
  const restoredArray = new Array(arrayExport.nodes[0].length);
  for (const [key, value] of arrayExport.nodes[0].properties) restoredArray[key] = value;
  assert.deepEqual(restoredArray, array);
});

test("tipo fora da exportação suportada falha explicitamente sem produzir JSON parcial", () => {
  assert.throws(() => serializeStudyDraftSnapshot({ useful: new Map([["key", "value"]]) }),
    { code: "DRAFT_EXPORT_FORMAT_UNSUPPORTED", message: /original continua guardado/u });
});
