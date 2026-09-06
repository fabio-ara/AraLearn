import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";

import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { renderRuntimeStatusControl } from "../../src/ui/renderHomeScreen.js";
import { createCourseInspectionSequence } from "../../src/ui/CourseInspectionSequence.js";
import { createUxUi328Fixture } from "../fixtures/uxUi328Fixture.js";

// #328 records the failing acceptance cases before any product correction.
// Setup must pass before a known acceptance failure is marked TODO. The strict
// reproduction executes those same assertions without TODO and exits nonzero.
// Neither mode is evidence that the synchronization product gate is green.
function markKnownDefect(t, reason) {
  if (process.env.ARALEARN_328_STRICT !== "1") t.todo(`#328 — defeito reproduzido: ${reason}`);
}
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PATH = `/v1/courses/${COURSE_ID}/instructional-plan`;

class MemoryStateStore {
  values = new Map();
  async getCache(key) { return this.values.get(key) ?? null; }
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observed(promise) {
  const state = { status: "pending", value: null };
  const completion = promise.then(
    (value) => Object.assign(state, { status: "fulfilled", value }),
    (value) => Object.assign(state, { status: "rejected", value })
  );
  return { state, completion };
}

function response(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json", ...headers }
  });
}

function header(revision = 7) {
  return { contract: "aralearn.course.v1", courseId: COURSE_ID,
    title: "Curso sintético de diagnóstico", goal: "Conferir revisão.", revision,
    ownership: "owned", canEdit: true };
}

function client(fetchImpl, overrides = {}) {
  return new CourseApiClient({
    projectUrl: "https://course-diagnostic.invalid", publishableKey: "synthetic-public-key",
    fetchImpl,
    authClient: {
      async getAccessToken() { return "synthetic-access-token"; },
      async clearSession() {}, emit() {}, ...overrides
    }
  });
}

test("S03: HTTP 503 com navegador online não deve afirmar ausência de conexão", async (t) => {
  const store = new MemoryStateStore();
  const trace = [];
  let unavailable = false;
  const api = client(async (url, init) => {
    const startedAt = performance.now();
    const status = unavailable ? 503 : 200;
    const result = response(unavailable ? { code: "service_unavailable", message: "Serviço indisponível." } : header(), status);
    trace.push({ path: new URL(url).pathname, method: init.method, status,
      durationMs: Number((performance.now() - startedAt).toFixed(3)) });
    return result;
  });
  const controller = new CourseController({ api, store, ownerOnly: true,
    now: () => "2026-09-06T12:00:00.000Z" });
  await controller.getCourse(COURSE_ID);
  unavailable = true;
  const cached = await controller.getCourse(COURSE_ID);
  assert.equal(cached.revision, 7);
  assert.equal(cached.stale, true);
  assert.equal(cached.cachedAt, "2026-09-06T12:00:00.000Z");
  const navigatorValue = { onLine: true };
  t.diagnostic(JSON.stringify({ trace, navigatorOnline: navigatorValue.onLine,
    receivedRevision: cached.revision, cachedAt: cached.cachedAt, offline: cached.offline,
    stale: cached.stale, causeStatusRetained: Object.hasOwn(cached, "status") }));
  const markup = renderRuntimeStatusControl({ offline: cached.offline, stale: cached.stale });
  assert.deepEqual(trace.map(({ method, status }) => ({ method, status })), [
    { method: "POST", status: 200 }, { method: "POST", status: 503 }
  ]);
  assert.match(markup, /data-runtime-state=/u);
  markKnownDefect(t, "a cópia cacheada após HTTP 503 recebe offline:true e a nuvem anuncia Sem conexão");
  assert.doesNotMatch(markup, /Sem conexão/u);
});

test("S03: solicitação explícita recupera o serviço sem emitir evento online", async (t) => {
  let callCount = 0;
  const controller = new CourseController({
    store: new MemoryStateStore(), ownerOnly: true,
    api: client(async () => {
      callCount += 1;
      return callCount === 2
        ? response({ message: "Serviço temporariamente indisponível." }, 503)
        : response(header(callCount === 1 ? 7 : 8));
    })
  });
  assert.equal((await controller.getCourse(COURSE_ID)).revision, 7);
  assert.equal((await controller.getCourse(COURSE_ID)).stale, true);
  const current = await controller.getCourse(COURSE_ID);
  assert.equal(current.revision, 8);
  assert.equal(current.offline, false);
  assert.equal(current.stale, false);
  assert.equal(callCount, 3);
  t.diagnostic("Três solicitações explícitas; nenhuma emissão de online/offline; revisão 7 → cache 7 → 8.");
});

test("S04: leitura RPC recuperável respeita Retry-After e termina com sucesso", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const calls = [];
  const api = client(async () => {
    calls.push(Date.now());
    return calls.length === 1
      ? response({ message: "Aguarde." }, 429, { "Retry-After": "2" })
      : response(header(8));
  });
  const operation = observed(api.getCourse(COURSE_ID));
  await nextTurn();
  t.mock.timers.tick(1_999);
  await nextTurn();
  assert.equal(calls.length, 1, "Não deve repetir antes de Retry-After.");
  t.mock.timers.tick(1);
  await nextTurn();
  t.diagnostic(JSON.stringify({ callsAtMs: calls, outcome: operation.state.status,
    status: operation.state.value?.status, retryAfter: operation.state.value?.retryAfter ?? null }));
  assert.equal(calls[0], 0);
  if (operation.state.status === "rejected") assert.equal(operation.state.value.status, 429);
  markKnownDefect(t, "HTTP 429 encerra a leitura RPC na primeira chamada; Retry-After não chega ao chamador");
  assert.equal(operation.state.status, "fulfilled");
  assert.equal(operation.state.value.revision, 8);
  assert.deepEqual(calls, [0, 2_000]);
});

test("S05: espera de fetch é limitada pelo timeout já existente", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let aborted = false;
  const api = client(async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Operação cancelada.", "AbortError"));
    }, { once: true });
  }));
  const operation = observed(api.rpc("get_owned_course_v1", { p_course_id: COURSE_ID }, { timeoutMs: 20 }));
  await nextTurn();
  t.mock.timers.tick(20);
  await operation.completion;
  assert.equal(aborted, true);
  assert.equal(operation.state.status, "rejected");
  assert.equal(operation.state.value.code, "request_timeout");
});

test("S05: prazo da leitura abrange também o corpo da resposta", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const body = deferred();
  let requestSignal;
  let bodyReads = 0;
  const api = client(async (_url, { signal }) => {
    requestSignal = signal;
    return { ok: true, status: 200, text: () => { bodyReads += 1; return body.promise; } };
  });
  const operation = observed(api.requestCourseApi(PATH, { timeoutMs: 20 }));
  await nextTurn();
  t.mock.timers.tick(1_000);
  await nextTurn();
  try {
    assert.equal(bodyReads, 1);
    assert.ok(requestSignal instanceof AbortSignal);
    t.diagnostic(JSON.stringify({ requestedTimeoutMs: 20, elapsedVirtualMs: 1_000,
      phase: "response.text", outcome: operation.state.status, aborted: requestSignal.aborted }));
    markKnownDefect(t, "timer de 20 ms é retirado depois de fetch; response.text continua pendente após 1000 ms");
    assert.equal(operation.state.status, "rejected");
  } finally {
    body.resolve(JSON.stringify({ data: { synthetic: true } }));
    await operation.completion;
  }
});

test("S06: prazo da leitura abrange espera pela sessão", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const token = deferred();
  let calls = 0;
  let tokenReads = 0;
  const api = client(async () => {
    calls += 1;
    return response({ data: { synthetic: true } });
  }, { getAccessToken: () => { tokenReads += 1; return token.promise; } });
  const operation = observed(api.requestCourseApi(PATH, { timeoutMs: 20 }));
  await nextTurn();
  t.mock.timers.tick(1_000);
  await nextTurn();
  try {
    assert.equal(calls, 0);
    assert.equal(tokenReads, 1);
    t.diagnostic(JSON.stringify({ requestedTimeoutMs: 20, elapsedVirtualMs: 1_000,
      phase: "getAccessToken", outcome: operation.state.status, httpCalls: calls }));
    markKnownDefect(t, "getAccessToken antecede o timer; timeoutMs 20 não encerra sessão pendente após 1000 ms");
    assert.equal(operation.state.status, "rejected");
  } finally {
    token.resolve("synthetic-access-token");
    await operation.completion;
  }
});

test("S08: HTTP 401 e 403 não expõem cópia local depois da recusa", async (t) => {
  for (const status of [401, 403]) {
    await t.test(String(status), async () => {
      let refused = false;
      let clears = 0;
      const store = new MemoryStateStore();
      const controller = new CourseController({ store, ownerOnly: true,
        api: client(async () => refused
          ? response({ message: "Acesso recusado." }, status) : response(header()),
        { async clearSession() { clears += 1; } }) });
      await controller.getCourse(COURSE_ID);
      refused = true;
      await assert.rejects(controller.getCourse(COURSE_ID), { status });
      assert.equal(await store.getCache(`course-authoring.v1.header:${COURSE_ID}`), null);
      assert.equal(clears, status === 401 ? 1 : 0);
    });
  }
});

test("S13: resposta antiga não rebaixa o cabeçalho cacheado por chamada posterior", async (t) => {
  const old = deferred();
  let calls = 0;
  const store = new MemoryStateStore();
  const controller = new CourseController({ store, ownerOnly: true, api: {
    async listCourses() { throw new Error("Lista fora desta prova."); },
    async getCourse() { return ++calls === 1 ? old.promise : header(8); }
  } });
  const oldRead = controller.getCourse(COURSE_ID);
  const latest = await controller.getCourse(COURSE_ID);
  assert.equal(latest.revision, 8);
  old.resolve(header(7));
  await oldRead;
  const cached = await store.getCache(`course-authoring.v1.header:${COURSE_ID}`);
  assert.equal(calls, 2);
  assert.equal(cached.data.courseId, COURSE_ID);
  assert.equal(cached.data.contract, "aralearn.course.v1");
  t.diagnostic(JSON.stringify({ responseOrder: [8, 7], cachedRevision: cached.data.revision }));
  markKnownDefect(t, "getCourse concorrente grava revisão 7 depois da revisão 8 no mesmo cache");
  assert.equal(cached.data.revision, 8);
});

class InspectionRoot {
  innerHTML = "";
  attributes = new Map();
  listeners = new Map();
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

function inspection(fixture, overrides = {}) {
  const root = new InspectionRoot();
  const sequence = createCourseInspectionSequence({
    root, controller: fixture.controller, course: fixture.course,
    windowValue: null, documentValue: null, navigatorValue: { onLine: true },
    ...overrides
  });
  return { root, sequence };
}

test("S02/S05: leitura inicial não anuncia vazio antes da resposta", async (t) => {
  const fixture = createUxUi328Fixture();
  const pending = deferred();
  const { root, sequence } = inspection(fixture, {
    controller: { ...fixture.controller, loadAuthoringStudyUnits: () => pending.promise }
  });
  const operation = sequence.open();
  await nextTurn();
  try {
    assert.match(root.innerHTML, /Carregando unidades/u);
    assert.equal(root.attributes.get("aria-busy"), "true");
    t.diagnostic("Inspeção com onLine=true e resposta pendente: loading e ausência aparecem simultaneamente.");
    markKnownDefect(t, "contexto mostra Nenhuma unidade de estudo enquanto corpo mostra Carregando unidades");
    assert.doesNotMatch(root.innerHTML, /Nenhuma unidade de estudo/u);
  } finally {
    sequence.destroy();
    pending.reject(new Error("Encerramento da fixture pendente."));
    await operation;
  }
});

test("S01/S02: duas produções sintéticas preservam âncora antiga e abrem deep link novo", async (t) => {
  const fixture = createUxUi328Fixture();
  const originalRead = fixture.controller.loadAuthoringStudyUnits;
  const allUnits = fixture.units.splice(18);
  fixture.course.revision = 4;
  fixture.course.counts.studyUnitCount = 18;
  const trace = [];
  fixture.controller.loadAuthoringStudyUnits = async (courseId, options) => {
    const startedAt = performance.now();
    const page = await originalRead(courseId, options);
    trace.push({ path: "synthetic:loadAuthoringStudyUnits", method: "local-call",
      expectedRevision: options.expectedRevision, receivedRevision: page.courseRevision,
      anchor: options.anchorStudyUnitId, count: page.items.length,
      totalCount: page.totalCount, durationMs: Number((performance.now() - startedAt).toFixed(3)) });
    return page;
  };
  const first = inspection(fixture, { routeTarget: { kind: "study_unit", id: "ux328-unit-13" } });
  let second;
  try {
    assert.equal(await first.sequence.open(), true);
    assert.equal(first.sequence.snapshot().studyUnitId, "ux328-unit-13");
    assert.equal(first.sequence.snapshot().courseRevision, 4);
    fixture.units.push(...allUnits);
    fixture.course.revision = 5;
    fixture.course.counts.studyUnitCount = 36;
    assert.equal(await first.sequence.refresh(5), true);
    assert.equal(first.sequence.snapshot().studyUnitId, "ux328-unit-13");
    assert.equal(first.sequence.snapshot().courseRevision, 5);
    second = inspection(fixture, { routeTarget: { kind: "study_unit", id: "ux328-unit-31" } });
    assert.equal(await second.sequence.open(), true);
    assert.equal(second.sequence.snapshot().studyUnitId, "ux328-unit-31");
    assert.equal(second.sequence.snapshot().courseRevision, 5);
    assert.equal(first.sequence.snapshot().studyUnitId, "ux328-unit-13");
    t.diagnostic(JSON.stringify({ materializations: fixture.events, trace }));
  } finally {
    first.sequence.destroy();
    second?.sequence.destroy();
  }
});

test("S07: 409 de revisão na leitura inicial é reconciliado em tentativas finitas", async (t) => {
  const fixture = createUxUi328Fixture();
  let calls = 0;
  let initialRequest;
  const { root, sequence } = inspection(fixture, {
    course: { ...fixture.course, revision: 4 },
    controller: {
      ...fixture.controller,
      async loadAuthoringStudyUnits(courseId, options) {
        calls += 1;
        if (calls === 1) {
          initialRequest = { courseId, expectedRevision: options.expectedRevision };
          throw Object.assign(new Error("Revisão avançou durante a leitura."), {
            code: "course_revision_changed", status: 409,
            expectedRevision: 4, receivedRevision: 5
          });
        }
        return fixture.controller.loadAuthoringStudyUnits(courseId, options);
      }
    }
  });
  try {
    const success = await sequence.open();
    assert.ok(calls >= 1);
    assert.deepEqual(initialRequest, { courseId: fixture.course.courseId, expectedRevision: 4 });
    assert.equal(root.attributes.get("aria-busy"), "false");
    t.diagnostic(JSON.stringify({ calls, success, expectedRevision: 4, receivedRevision: 5,
      currentRevision: sequence.snapshot().courseRevision, errorShown: /mudou durante a leitura/u.test(root.innerHTML) }));
    markKnownDefect(t, "inspeção encerra na primeira resposta course_revision_changed e não relê a revisão corrente");
    assert.equal(success, true);
  } finally {
    sequence.destroy();
  }
});

test("S13: refresh novo prevalece e montagem destruída ignora resposta antiga", async (t) => {
  const fixture = createUxUi328Fixture();
  const pending = deferred();
  let calls = 0;
  const { root, sequence } = inspection(fixture, {
    controller: {
      ...fixture.controller,
      async loadAuthoringStudyUnits(courseId, options) {
        if (++calls === 1) return pending.promise;
        return fixture.controller.loadAuthoringStudyUnits(courseId, options);
      }
    }
  });
  const old = sequence.open();
  await nextTurn();
  assert.equal(await sequence.refresh(5), true);
  const snapshot = sequence.snapshot();
  sequence.destroy();
  const html = root.innerHTML;
  const oldPage = await fixture.controller.loadAuthoringStudyUnits(fixture.course.courseId, {
    expectedRevision: 4, scope: { kind: "course", id: null },
    anchorStudyUnitId: null, cursor: null, direction: "forward", limit: 12
  });
  oldPage.courseRevision = 4;
  pending.resolve(oldPage);
  assert.equal(await old, false);
  assert.deepEqual(sequence.snapshot(), snapshot);
  assert.equal(root.innerHTML, html);
  assert.equal(root.listeners.size, 0);
  t.diagnostic("Epoch impede escrita visual obsoleta depois de refresh e destroy; leitura de rede não é cancelada pelo componente.");
});
