import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { createCourseCopyRequestIdentity } from "../../src/domain/courseCopy.js";

const SOURCE = "10000000-0000-4000-8000-000000000001";
const TARGET = "20000000-0000-4000-8000-000000000002";
const ACTOR = "30000000-0000-4000-8000-000000000003";
function request() {
  return { sourceCourseId: SOURCE, expectedSourceRevision: 7, title: "Cópia · 林", confirmed: true,
    ...createCourseCopyRequestIdentity({ now: 1788610000000, randomUUID: () => ACTOR }) };
}
function receipt(command, idempotent = false) {
  return { contract: "aralearn.course-copy.v1", sourceCourseId: SOURCE, sourceCourseRevision: 7,
    targetCourseId: TARGET, initialCourseRevision: 1, copiedAt: command.requestedAt,
    requestId: command.requestId, idempotent };
}

test("cópia usa endpoint autenticado e vincula a confirmação ao pedido original", async () => {
  let sent;
  const command = request();
  const client = new CourseApiClient({ projectUrl: "https://copy-test.supabase.co", publishableKey: "test",
    authClient: { async getAccessToken() { return "synthetic"; } },
    async fetchImpl(url, init) {
      sent = { url, body: JSON.parse(init.body), method: init.method, authorization: init.headers.get("Authorization") };
      return Response.json({ data: receipt(command) });
    } });
  assert.deepEqual(await client.copyCourse(command), receipt(command));
  assert.match(sent.url, new RegExp(`/v1/courses/${SOURCE}/copies$`, "u"));
  assert.equal(sent.method, "POST");
  assert.equal(sent.authorization, "Bearer synthetic");
  assert.deepEqual(sent.body, command);
  await assert.rejects(client.copyCourse({ ...command, expectedSourceRevision: 8 }), /não corresponde/u);
});

test("resposta perdida e reinicialização recuperam a mesma cópia e releem o alvo já editado", async () => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: ACTOR });
  const commands = [];
  let failed = false;
  const api = { listCourses() {},
    async copyCourse(command) {
      commands.push(structuredClone(command));
      if (!failed) { failed = true; throw new TypeError("Failed to fetch"); }
      return receipt(command, true);
    },
    async getCourse(id, options) {
      assert.equal(id, TARGET); assert.equal(options.ownerOnly, true);
      return { courseId: id, revision: 19, title: "Título já editado", ownership: "owned", canEdit: true };
    } };
  try {
    const first = new CourseController({ api, store });
    await assert.rejects(first.copyCourse(request()), /Failed to fetch/u);
    const reloaded = new CourseController({ api, store });
    const pending = await reloaded.loadPendingCourseCopy(SOURCE);
    assert.deepEqual(pending, request());
    await assert.rejects(reloaded.copyCourse({ ...pending, title: "Outra intenção" }), /cópia pendente/u);
    const result = await reloaded.copyCourse(pending);
    assert.equal(result.course.revision, 19);
    assert.equal(result.course.title, "Título já editado");
    assert.equal(result.initialCourseRevision, 1);
    assert.deepEqual(commands, [request(), request()]);
    assert.equal(await reloaded.loadPendingCourseCopy(SOURCE), null);
  } finally { store.close(); }
});

test("falha na releitura do alvo preserva o pedido; rejeição definitiva o libera", async () => {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: ACTOR });
  let rejected = false;
  const api = { listCourses() {},
    async copyCourse(command) {
      if (rejected) throw Object.assign(new Error("Permissão revogada"), { status: 403 });
      return receipt(command);
    },
    async getCourse() { throw Object.assign(new Error("Offline"), { status: 503 }); } };
  try {
    const controller = new CourseController({ api, store });
    await assert.rejects(controller.copyCourse(request()), /Offline/u);
    assert.deepEqual(await controller.loadPendingCourseCopy(SOURCE), request());
    rejected = true;
    await assert.rejects(controller.copyCourse(request()), /Permissão revogada/u);
    assert.equal(await controller.loadPendingCourseCopy(SOURCE), null);
  } finally { store.close(); }
});

test("pedidos pendentes ficam no compartimento da conta e a permissão não vem do cache", async () => {
  const indexedDb = new IDBFactory();
  const left = await CourseLocalStore.open(indexedDb, { userId: ACTOR });
  const right = await CourseLocalStore.open(indexedDb, { userId: TARGET });
  const api = { listCourses() {}, async getCourse(id, options) {
    assert.equal(id, SOURCE); assert.equal(options.ownerOnly, false);
    throw new Error("Sem conexão");
  }, async copyCourse() { throw new Error("Resposta perdida"); } };
  try {
    const controller = new CourseController({ api, store: left });
    await assert.rejects(controller.copyCourse(request()));
    assert.equal(await new CourseController({ api, store: right }).loadPendingCourseCopy(SOURCE), null);
    await assert.rejects(controller.loadCourseCopySource(SOURCE), /Sem conexão/u);
  } finally { left.close(); right.close(); }
});
