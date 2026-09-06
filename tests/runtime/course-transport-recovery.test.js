import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { SupabaseHttpClient } from "../../src/supabase/SupabaseHttpClient.js";

const config = { projectUrl: "https://synthetic.supabase.test", publishableKey: "synthetic-public-key" };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const api = (fetchImpl, options = {}) => new CourseApiClient({ ...config,
  authClient: { getAccessToken: async () => "synthetic-token" }, fetchImpl, ...options });

test("prazo HTTP encerra fetch e corpos JSON/blob que ignoram o abort", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const phase of ["fetch", "json", "blob"]) {
    let signal;
    const client = new SupabaseHttpClient({ ...config, timeoutMs: 20, fetchImpl: (_url, init) => {
      signal = init.signal;
      return phase === "fetch" ? new Promise(() => {}) : Promise.resolve({ ok: true, status: 200,
        text: () => new Promise(() => {}), blob: () => new Promise(() => {}) });
    } });
    const pending = assert.rejects(client.request("/synthetic", { responseType: phase }),
      error => error.code === "request_timeout");
    await setImmediate();
    t.mock.timers.tick(20);
    await pending;
    assert.equal(signal.aborted, true);
  }
});

test("sessão pendente termina sem HTTP, sem invalidar sessão e sem retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let clears = 0;
  let resolveToken;
  const client = api(async () => { calls++; return json({}); }, { retryReads: true,
    authClient: { getAccessToken: () => new Promise(resolve => { resolveToken = resolve; }),
      clearSession: () => { clears++; } } });
  const pending = assert.rejects(client.requestCourseApi("/v1/synthetic", { timeoutMs: 20 }),
    error => error.code === "auth_timeout");
  await setImmediate();
  t.mock.timers.tick(20);
  await pending;
  resolveToken("synthetic-late-token");
  await setImmediate();
  assert.equal(calls, 0);
  assert.equal(clears, 0);
});

test("automático respeita Retry-After em segundos e data, com no máximo duas chamadas", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  for (const header of ["2", "Thu, 01 Jan 1970 00:00:04 GMT"]) {
    const calls = [];
    const start = Date.now();
    const client = api(async () => { calls.push(Date.now()); return calls.length === 1
      ? json({ message: "Aguarde" }, 429, { "Retry-After": header }) : json({ revision: 8 });
    }, { retryReads: true });
    const pending = client.rpc("get_course_v1");
    await setImmediate();
    t.mock.timers.tick(1_999);
    await setImmediate();
    assert.equal(calls.length, 1);
    t.mock.timers.tick(1);
    assert.equal((await pending).revision, 8);
    assert.deepEqual(calls, [start, start + 2_000]);
  }
});

test("Retry-After longo é devolvido sem antecipar a repetição", async () => {
  for (const header of ["3600", "9".repeat(400)]) {
    let calls = 0;
    const client = api(async () => { calls++; return json({}, 429, { "Retry-After": header }); }, { retryReads: true });
    await assert.rejects(client.rpc("get_course_v1"), error => error.status === 429 && error.retryAfter === header);
    assert.equal(calls, 1);
  }
});

test("soma de sessão, dois prazos HTTP e pausa continua finita", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  let calls = 0;
  const client = api(() => { calls++; return new Promise(() => {}); }, { retryReads: true,
    authClient: { getAccessToken: () => new Promise(resolve => setTimeout(() => resolve("synthetic-token"), 10)) } });
  const pending = assert.rejects(client.rpc("get_course_v1", {}, { timeoutMs: 20 }),
    error => error.code === "request_timeout");
  t.mock.timers.tick(10);
  await setImmediate();
  t.mock.timers.tick(20);
  await setImmediate();
  t.mock.timers.tick(750);
  await setImmediate();
  t.mock.timers.tick(20);
  await pending;
  assert.equal(calls, 2);
  assert.equal(Date.now(), 800);
});

test("manual e escritas não recebem retry de leitura; 401/403 e cancelamento permanecem recusados", async () => {
  for (const entry of [
    { status: 503, retryReads: false, name: "get_course_v1" },
    { status: 503, retryReads: true, name: "mutate_course_personal_state_v2" },
    { status: 401, retryReads: true, name: "get_course_v1" },
    { status: 403, retryReads: true, name: "get_course_v1" }
  ]) {
    let calls = 0;
    const client = api(async () => { calls++; return json({}, entry.status); }, entry);
    await assert.rejects(client.rpc(entry.name), error => error.status === entry.status);
    assert.equal(calls, 1);
  }
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = api(async () => { calls++; return json({}); }, { retryReads: true });
  await assert.rejects(client.rpc("get_course_v1", {}, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("falha persistente tem duas tentativas e mudança para manual cancela a segunda", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const switchToManual of [false, true]) {
    let calls = 0;
    const client = api(async () => { calls++; return json({}, 503); }, { retryReads: true });
    const pending = assert.rejects(client.requestCourseApi("/v1/synthetic"), error => error.status === 503);
    await setImmediate();
    if (switchToManual) client.setReadRecoveryEnabled(false);
    t.mock.timers.tick(750);
    await pending;
    assert.equal(calls, switchToManual ? 1 : 2);
  }
});

test("cancelamento durante corpo ou espera impede resultado tardio e repetição", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const phase of ["body", "retry"]) {
    const controller = new AbortController();
    let calls = 0;
    const client = api(async () => { calls++; return phase === "body"
      ? { ok: true, status: 200, text: () => new Promise(() => {}) } : json({}, 503);
    }, { retryReads: true });
    const pending = assert.rejects(client.rpc("get_course_v1", {}, { signal: controller.signal }), { name: "AbortError" });
    await setImmediate();
    controller.abort();
    await pending;
    t.mock.timers.tick(60_000);
    assert.equal(calls, 1);
  }
});
