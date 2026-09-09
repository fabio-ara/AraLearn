import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import { CourseStudyRepository } from "../../src/study/CourseStudyRepository.js";
import { createCourseStudyApplication } from "../../src/study/CourseStudyApplication.js";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const COURSE = "33333333-3333-4333-8333-333333333333";
const KEY = "course-lifecycle.pending.v1";
const command = { courseId: COURSE, operation: "delete_owned_course", confirmed: true };
const timeout = () => Object.assign(new Error("Resposta perdida"), { status: 504 });
const receipt = request => ({ contract: "aralearn.course-lifecycle.v1", ...request,
  status: "completed", changed: true, fileCleanupPending: false });

async function fixture(t) {
  const indexedDb = new IDBFactory();
  const cache = await CourseLocalStore.open(indexedDb, { userId: ACTOR });
  t.after(() => cache.close());
  let session = { user: { id: ACTOR } };
  let items = [{ courseId: COURSE, title: "Curso de teste", ownership: "owned", canEdit: true, revision: 1 }];
  const calls = [];
  let handler = async request => receipt(request);
  const bridge = {
    listAccessibleCourses: async () => ({ items, hasMore: false }),
    loadCourse: async () => { throw new Error("Não carregar conteúdo para reconciliar exclusão"); },
    clearCourse: async () => {},
    maintainCourse: async request => {
      calls.push(structuredClone(request));
      const pending = await cache.getCache(KEY);
      assert.equal(pending[0].requestId, request.requestId, "transação local deve terminar antes do efeito");
      assert.equal(pending[0].actorId, ACTOR);
      return handler(request);
    }
  };
  const api = { authClient: { getSession: () => session }, loadPersonalState() {}, mutatePersonalState() {} };
  const reopen = async () => {
    const repository = new CourseStudyRepository({ bridge, api, cache, windowValue: null });
    await repository.initialize();
    return repository;
  };
  return { cache, calls, bridge, reopen, repository: await reopen(),
    setHandler(value) { handler = value; }, setSession(value) { session = value; },
    removeFromList() { items = []; } };
}

test("timeout após efeito conserva identidade e retoma após recarga sem depender da listagem", async t => {
  const f = await fixture(t);
  let deletions = 0;
  f.setHandler(async () => { deletions++; f.removeFromList(); throw timeout(); });
  await assert.rejects(f.repository.maintainCourse(command), /Resposta perdida/u);
  const [pending] = await f.cache.getCache(KEY);
  const reopened = await f.reopen();
  assert.equal(reopened.loadProject().courses.length, 0);
  assert.deepEqual(reopened.loadPendingCourseLifecycles(), [pending]);
  f.setHandler(async request => ({ ...receipt(request), status: "already_absent", changed: false }));
  const result = await reopened.resumeCourseLifecycle(COURSE);
  assert.equal(result.status, "already_absent");
  assert.equal(deletions, 1);
  assert.equal(f.calls[0].requestId, f.calls[1].requestId);
  assert.deepEqual(await f.cache.getCache(KEY), []);
  assert.equal(await reopened.resumeCourseLifecycle(COURSE), null);
  assert.equal(f.calls.length, 2, "retomada concluída não cria outra ação");
});

test("limpeza incompleta, recibo divergente e resposta incerta preservam a tentativa até curso e arquivos confirmados", async t => {
  const f = await fixture(t);
  for (const malformed of [
    request => ({ ...receipt(request), fileCleanupPending: true }),
    request => ({ ...receipt(request), requestId: "outro-request-id" }),
    request => ({ ...receipt(request), courseId: OTHER }),
    request => ({ ...receipt(request), status: "files_pending" })
  ]) {
    f.setHandler(async request => malformed(request));
    await assert.rejects(f.repository.maintainCourse(command), /ainda não foi confirmada/u);
    assert.equal((await f.cache.getCache(KEY)).length, 1);
    assert.equal(f.repository.loadProject().courses.length, 1);
  }
  assert.equal(new Set(f.calls.map(call => call.requestId)).size, 1);
  f.setHandler(async request => receipt(request));
  await f.repository.resumeCourseLifecycle(COURSE);
  assert.deepEqual(f.repository.loadPendingCourseLifecycles(), []);
  assert.equal(f.repository.loadProject().courses.length, 0);
});

test("renovação da sessão preserva ator e identidade; outra conta não despacha nem elimina tentativa", async t => {
  const f = await fixture(t);
  f.setHandler(async () => { throw Object.assign(new Error("Sessão expirada"), { status: 401 }); });
  await assert.rejects(f.repository.maintainCourse(command), /Sessão expirada/u);
  const pending = await f.cache.getCache(KEY);
  for (const session of [null, { user: { id: OTHER } }]) {
    f.setSession(session);
    await assert.rejects(f.repository.resumeCourseLifecycle(COURSE), error => error.code === "course_lifecycle_account_required");
    assert.deepEqual(await f.cache.getCache(KEY), pending);
  }
  assert.equal(f.calls.length, 1);
  f.setSession({ user: { id: ACTOR }, refreshed: true });
  f.setHandler(async request => receipt(request));
  await f.repository.resumeCourseLifecycle(COURSE);
  assert.equal(f.calls[1].requestId, pending[0].requestId);
});

test("troca de conta durante a resposta e falha de limpeza local não perdem a recuperação", async t => {
  const f = await fixture(t);
  f.setHandler(async request => { f.setSession({ user: { id: OTHER } }); return receipt(request); });
  await assert.rejects(f.repository.maintainCourse(command), /conta que iniciou/u);
  assert.equal((await f.cache.getCache(KEY)).length, 1);
  f.setSession({ user: { id: ACTOR } });
  f.setHandler(async request => receipt(request));
  f.bridge.clearCourse = async () => { throw new Error("Cache temporariamente indisponível"); };
  await assert.rejects(f.repository.resumeCourseLifecycle(COURSE), /Cache temporariamente/u);
  assert.equal((await f.cache.getCache(KEY)).length, 1);
  f.bridge.clearCourse = async () => {};
  await f.repository.resumeCourseLifecycle(COURSE);
  assert.deepEqual(await f.cache.getCache(KEY), []);
});

test("falha ao persistir impede efeito; tentativa guardada recusa substituição de operação ou identidade", async t => {
  const f = await fixture(t);
  const updateCache = f.cache.updateCache.bind(f.cache);
  f.cache.updateCache = async () => { throw new Error("Disco cheio"); };
  await assert.rejects(f.repository.maintainCourse(command), /Disco cheio/u);
  assert.equal(f.calls.length, 0);
  f.cache.updateCache = updateCache;
  f.setHandler(async () => { throw timeout(); });
  await assert.rejects(f.repository.maintainCourse(command));
  await assert.rejects(f.repository.maintainCourse({ ...command, requestId: "outra-identidade" }), /tentativa guardada/u);
  await assert.rejects(f.repository.maintainCourse({ ...command, operation: "leave_shared_course" }), /tentativa guardada/u);
  assert.equal(f.calls.length, 1);
});

test("cliques simultâneos compartilham a tentativa em voo sem outro despacho", async t => {
  const f = await fixture(t);
  const first = f.repository.maintainCourse(command);
  const second = f.repository.maintainCourse(command);
  await assert.rejects(f.repository.maintainCourse({ ...command, requestId: "nova-identidade-em-voo" }), /em andamento/u);
  assert.deepEqual(await first, await second);
  assert.equal(f.calls.length, 1);
});

test("duas instâncias usam a identidade persistida atomicamente e preservam tentativa de resultado incerto", async t => {
  const f = await fixture(t);
  const second = await f.reopen();
  f.setHandler(async () => { throw timeout(); });
  const results = await Promise.allSettled([
    f.repository.maintainCourse(command), second.maintainCourse(command)
  ]);
  assert.ok(results.every(result => result.status === "rejected"));
  assert.equal(f.calls.length, 2);
  assert.equal(new Set(f.calls.map(call => call.requestId)).size, 1);
  assert.equal((await f.cache.getCache(KEY)).length, 1);
});

test("tentativa de outro ator permanece guardada e impede efeito neste compartimento", async t => {
  const f = await fixture(t);
  const other = [{ actorId: OTHER, courseId: COURSE, operation: command.operation,
    requestId: "tentativa-de-outro-ator", title: "Outro curso", requestedAt: new Date().toISOString() }];
  await f.cache.putCache(KEY, other);
  await assert.rejects(f.repository.maintainCourse(command), /não corresponde a esta conta/u);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.cache.getCache(KEY), other);
});

class StudyRoot {
  #html = "";
  #nodes = new Map();
  set innerHTML(value) { this.#html = value; this.#nodes.clear(); }
  get innerHTML() { return this.#html; }
  querySelector(selector) {
    const action = /^\[data-action='([^']+)'\]$/u.exec(selector)?.[1];
    if (!action || !["delete-owned-course", "resume-course-lifecycle"].includes(action)) return null;
    const tag = new RegExp(`<button[^>]*data-action="${action}"[^>]*>`, "u").exec(this.#html)?.[0];
    if (!tag) return null;
    if (!this.#nodes.has(action)) {
      const listeners = [];
      this.#nodes.set(action, { addEventListener: (event, listener) => { if (event === "click") listeners.push(listener); },
        getAttribute: name => new RegExp(`${name}="([^"]*)"`, "u").exec(tag)?.[1] || null,
        focus() {}, click() { for (const listener of listeners) listener({}); } });
    }
    return this.#nodes.get(action);
  }
  querySelectorAll(selector) { const node = this.querySelector(selector); return node ? [node] : []; }
  setAttribute() {}
  removeAttribute() {}
  dispatchEvent() { return true; }
}

async function settleUntil(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail("A ação local não terminou");
}

test("Home confirma uma vez, preserva alvo ausente após recarga e retoma pela ação visível", async t => {
  const f = await fixture(t);
  const originalConfirm = globalThis.confirm;
  let confirmations = 0;
  globalThis.confirm = () => { confirmations++; return true; };
  t.after(() => { if (originalConfirm === undefined) delete globalThis.confirm; else globalThis.confirm = originalConfirm; });
  f.setHandler(async () => { f.removeFromList(); throw timeout(); });
  const firstRoot = new StudyRoot();
  const first = createCourseStudyApplication({ root: firstRoot, repository: f.repository, initialProject: f.repository.loadProject() });
  firstRoot.querySelector("[data-action='delete-owned-course']").click();
  await settleUntil(() => firstRoot.innerHTML.includes('data-action="resume-course-lifecycle"'));
  assert.equal(confirmations, 1);
  first.destroy();
  const reopened = await f.reopen();
  const root = new StudyRoot();
  const application = createCourseStudyApplication({ root, repository: reopened, initialProject: reopened.loadProject() });
  assert.equal(reopened.loadProject().courses.length, 0);
  assert.match(root.innerHTML, /Curso de teste/u);
  const requestId = reopened.loadPendingCourseLifecycles()[0].requestId;
  f.setHandler(async request => ({ ...receipt(request), status: "already_absent", changed: false }));
  root.querySelector("[data-action='resume-course-lifecycle']").click();
  await settleUntil(() => root.innerHTML.includes("foi excluído."));
  assert.equal(confirmations, 1);
  assert.equal(f.calls[1].requestId, requestId);
  assert.doesNotMatch(root.innerHTML, /data-action="resume-course-lifecycle"/u);
  application.destroy();
});

test("cancelar confirmação normal não persiste tentativa nem envia exclusão", async t => {
  const f = await fixture(t);
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => false;
  t.after(() => { if (originalConfirm === undefined) delete globalThis.confirm; else globalThis.confirm = originalConfirm; });
  const root = new StudyRoot();
  const application = createCourseStudyApplication({ root, repository: f.repository, initialProject: f.repository.loadProject() });
  root.querySelector("[data-action='delete-owned-course']").click();
  assert.deepEqual(f.calls, []);
  assert.equal(await f.cache.getCache(KEY), null);
  application.destroy();
});
