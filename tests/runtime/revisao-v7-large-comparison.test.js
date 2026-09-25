import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { courseAuthoringAnalyticsFixture } from "../helpers/courseAuthoringAnalyticsFixture.js";
import { assembleCourseAuthoringAnalyticsPage } from "../../src/domain/courseAuthoringAnalytics.js";
import { buildCourseAuthoringComparison } from "../../src/domain/courseAuthoringComparison.js";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { createCourseAnalyticsPanel } from "../../src/ui/CourseAnalyticsPanel.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";

const LEFT = "10000000-0000-4000-8000-000000000001";
const RIGHT = "10000000-0000-4000-8000-000000000002";
const ACTOR = "10000000-0000-4000-8000-000000000003";
const APP = "http://127.0.0.1/fixture-app";
const PUBLIC_LIMIT = 2 * 1024 * 1024;
const RPC_LIMIT = 8 * 1024 * 1024;
const WHOLE = { kind: "course", ref: null };
const NARROW = { kind: "didactic_microsequence", ref: "micro-fixture" };
const bytes = value => Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));
const selection = (courseId, scope = WHOLE) => ({ courseId, expectedRevision: 7, scope });

// DTO sintético do contrato atual: não contém conteúdo nem identidade de cursos reais.
// As 12 configurações por unidade e o inventário global também passam pelo assembler real.
function fixture({ units = 76, padding = 0, inventory = 1, inventoryWidth = 0,
  courseId = LEFT, scope = WHOLE } = {}) {
  const visibleUnits = scope.kind === "course" ? units : Math.min(units, 1);
  const value = courseAuthoringAnalyticsFixture({
    courseId, title: "Curso sintético H005",
    studyUnits: Array.from({ length: visibleUnits }, (_, i) => ({
      studyUnitRef: "20000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
      title: "Unidade sintética " + String(i + 1).padStart(5, "0"), wordCount: 180 + i,
      components: [{ componentRef: "aralearn.resource.paragraph@1.0.0", instanceRef: "enunciado", slot: "content" }]
    }))
  });
  value.basis.analysisUnits = Array.from({ length: inventory }, (_, i) => ({
    ref: "analysis-" + String(i + 1).padStart(6, "0"), position: i + 1,
    statement: "Relação sintética " + String(i + 1).padStart(6, "0"),
    description: "a".repeat(inventoryWidth + (i === 0 ? padding : 0))
  }));
  value.scope.options.push({ ...NARROW, label: "Microssequência sintética" });
  value.scope.selected = value.scope.options.find(item => item.kind === scope.kind && item.ref === scope.ref);
  assert.ok(value.scope.selected);
  return value;
}

function assembled(raw) {
  return assembleCourseAuthoringAnalyticsPage(raw, {
    publicAppUrl: APP, expectedCourseId: raw.course.id, expectedRevision: 7,
    expectedQuery: { scope: { kind: raw.scope.selected.kind, ref: raw.scope.selected.ref } }
  });
}

function measure(config) {
  const raw = fixture(config), page = assembled(raw);
  return { rawBytes: bytes(raw), assembledBytes: bytes(page),
    envelopeBytes: bytes({ ok: true, requestId: null, data: page }) };
}

function firstCountOver(limit, key) {
  let low = 1, high = 128;
  while (measure({ units: high })[key] <= limit) {
    low = high; high *= 2;
    assert.ok(high <= 16384, "Busca sintética excedeu o orçamento de unidades");
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (measure({ units: mid })[key] > limit) high = mid;
    else low = mid;
  }
  return { below: low, over: high };
}

test("H005: 13 casos de tamanho no cliente, handler e adaptador reais em HTTP local", async t => {
  // Só os dados das RPCs e a identidade são simulados. Isto NÃO prova Auth/MCP,
  // políticas SQL ou produção. Nenhuma resposta da fixture fabrica um status 413.
  let config = {}, declaredLength = true, rpcLog = [], apiLog = [], handler, base;
  const serverErrors = [];
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = Buffer.concat(chunks), url = new URL(req.url, base);
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1), args = JSON.parse(input.toString());
        let data;
        if (name === "get_owned_course_authoring_analytics_for_actor_v4") {
          data = fixture({ ...config, courseId: args.p_course_id, scope: args.p_query.scope });
        } else if (name === "get_owned_course_for_actor_v1") {
          data = { courseId: args.p_course_id, revision: 7, title: "Curso sintético H005", goal: "Medir o limite de leitura." };
        } else throw new Error("RPC inesperada: " + name);
        const body = Buffer.from(JSON.stringify(data));
        rpcLog.push({ name, status: 200, bytes: body.length, declaredLength });
        res.writeHead(200, { "content-type": "application/json",
          ...(declaredLength ? { "content-length": body.length } : {}) });
        for (let i = 0; i < body.length; i += 16384) res.write(body.subarray(i, i + 16384));
        res.end();
        return;
      }
      assert.ok(url.pathname.startsWith("/functions/v1/aralearn-course-api/"));
      const request = new Request(url, { method: req.method, headers: req.headers,
        ...(input.length ? { body: input } : {}) });
      const response = await handler(request), body = Buffer.from(await response.arrayBuffer());
      apiLog.push({ path: url.pathname, status: response.status,
        requestBytes: input.length, responseBytes: body.length });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(body);
    } catch (error) {
      serverErrors.push(error);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ fixtureError: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  base = "http://127.0.0.1:" + server.address().port;
  async function localFetch(url, init) {
    assert.equal(new URL(url).origin, base, "Rede fora deste servidor local proibida");
    assert.ok(!new URL(url).pathname.startsWith("/auth/"), "remoteAuth proibido");
    return fetch(url, init);
  }
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: base,
    serverApiKey: "synthetic-local-server-key", publishableKey: "synthetic-local-public-key",
    publicAppUrl: APP, fetchImpl: localFetch });
  adapter.resolveApplicationPrincipal = async token => {
    assert.equal(token, "synthetic-local-session");
    return { actorId: ACTOR, scopes: ["authoring:write"], authenticationKind: "application" };
  };
  handler = createCourseApiHandler({ adapter, allowedOrigins: new Set([base]) });
  const client = new CourseApiClient({ projectUrl: base, publishableKey: "synthetic-local-public-key",
    authClient: { getAccessToken: async () => "synthetic-local-session" }, fetchImpl: localFetch, retryReads: true });
  const measurements = [];
  async function read(next, { comparison = false, scope = WHOLE, lengthHeader = true } = {}) {
    config = next; declaredLength = lengthHeader; rpcLog = []; apiLog = [];
    let result, error;
    try {
      result = comparison
        ? await client.loadCourseAuthoringComparison({ left: selection(LEFT, scope), right: selection(RIGHT, scope) })
        : await client.loadCourseAuthoringAnalytics(LEFT, { expectedCourseRevision: 7, query: { scope } });
    } catch (caught) { error = caught; }
    assert.deepEqual(serverErrors, []);
    assert.equal(apiLog.length, 1, "Nem cliente nem adaptador devem repetir um 413");
    assert.equal(rpcLog.length, comparison ? 4 : 1, "Quantidade de leituras/rechecagens real");
    assert.ok(rpcLog.every(row => row.status === 200), "Fixture só emite dados, nunca 413");
    if (!comparison) assert.equal(apiLog[0].requestBytes, 0, "GET não atingiu limite de corpo de entrada");
    const measured = measure({ ...next, scope });
    const status = error?.status ?? 200;
    assert.equal(apiLog[0].status, status);
    measurements.push({ ...next, scope: scope.kind, comparison, lengthHeader, ...measured,
      status, code: error?.code ?? null, responseBytes: apiLog[0].responseBytes });
    return { result, error, measured, status, api: apiLog[0], rpc: rpcLog };
  }
  function oversized(row, code = "response_too_large") {
    assert.equal(row.status, 413);
    assert.equal(row.error.code, code);
    assert.equal(row.result, undefined, "Não fornecer snapshot truncado como sucesso");
  }

  const threshold = firstCountOver(PUBLIC_LIMIT, "envelopeBytes");
  const padding = PUBLIC_LIMIT - measure({ units: threshold.below }).envelopeBytes;
  assert.ok(padding > 0 && padding + 1 < 20000, "Padding dentro do contrato");
  await t.test("01: leitura de 76 unidades abaixo do limite", async () => {
    const row = await read({ units: 76 });
    assert.equal(row.status, 200);
    assert.equal(row.api.responseBytes, row.measured.envelopeBytes);
  });
  for (const [index, delta] of [-1, 0, 1].entries()) {
    await t.test(`0${index + 2}: envelope de 2 MiB ${delta >= 0 ? "+" : ""}${delta} byte`, async () => {
      const row = await read({ units: threshold.below, padding: padding + delta });
      assert.equal(row.measured.envelopeBytes, PUBLIC_LIMIT + delta);
      assert.ok(row.measured.rawBytes < PUBLIC_LIMIT, "O limite é do envelope montado");
      if (delta > 0) oversized(row);
      else {
        assert.equal(row.status, 200);
        assert.equal(row.api.responseBytes, PUBLIC_LIMIT + delta);
      }
    });
  }
  const large = { units: threshold.over };
  await t.test("05: primeira quantidade de unidades sem padding que excede o envelope", async () => {
    oversized(await read(large));
  });
  await t.test("06: repetir a mesma leitura conserva o 413, sem retry automático", async () => {
    oversized(await read(large));
  });
  await t.test("07: diff local e comparação direta cabem apesar do GET grande", async () => {
    const left = assembled(fixture(large)), right = assembled(fixture({ ...large, courseId: RIGHT }));
    assert.ok(bytes(left) > PUBLIC_LIMIT);
    assert.ok(bytes(right) > PUBLIC_LIMIT);
    const diff = buildCourseAuthoringComparison({ left, right });
    const row = await read(large, { comparison: true });
    assert.equal(row.status, 200);
    assert.deepEqual(row.result, diff);
    assert.ok(row.api.responseBytes < PUBLIC_LIMIT);
    assert.ok(row.api.requestBytes < 512 * 1024);
    assert.equal(row.rpc.filter(item => item.name === "get_owned_course_for_actor_v1").length, 2);
  });
  await t.test("08: escopo menor reduz unidades e cabe nesta fixture", async () => {
    const row = await read(large, { scope: NARROW });
    assert.equal(row.status, 200);
    assert.equal(row.result.basis.studyUnits.length, 1);
    assert.equal(row.api.responseBytes, row.measured.envelopeBytes);
  });
  for (const [index, scope] of [WHOLE, NARROW].entries()) {
    await t.test(`${index + 9}: inventário global excede o limite no escopo ${scope.kind}`, async () => {
      oversized(await read({ units: 1, inventory: 1100, inventoryWidth: 2000 }, { scope }));
    });
  }
  const rawThreshold = firstCountOver(RPC_LIMIT, "rawBytes");
  const rawPadding = RPC_LIMIT - measure({ units: rawThreshold.below }).rawBytes;
  assert.ok(rawPadding >= 0 && rawPadding + 1 < 20000);
  for (const delta of [0, 1]) {
    await t.test(`${delta + 11}: RPC de 8 MiB +${delta} byte com Content-Length`, async () => {
      const row = await read({ units: rawThreshold.below, padding: rawPadding + delta });
      assert.equal(row.measured.rawBytes, RPC_LIMIT + delta);
      assert.equal(row.rpc[0].bytes, RPC_LIMIT + delta);
      oversized(row, delta === 0 ? "response_too_large" : "course_authoring_analytics_response_too_large");
    });
  }
  await t.test("13: RPC acima de 8 MiB sem Content-Length é barrada durante streaming", async () => {
    const row = await read({ units: rawThreshold.below, padding: rawPadding + 1 }, { lengthHeader: false });
    assert.equal(row.measured.rawBytes, RPC_LIMIT + 1);
    assert.equal(row.rpc[0].declaredLength, false);
    oversized(row, "course_authoring_analytics_response_too_large");
  });
  assert.equal(measurements.length, 13);
  t.diagnostic(JSON.stringify({ threshold, rawThreshold, measurements }));
});

const LIMIT_MESSAGE = "Leitura acima do limite. Escolha outro curso ou uma parte menor, se disponível.";
const FALLBACK = "Não foi possível carregar os dados de autoria. Tente novamente.";

test("H005: orientação de erro no painel preserva sessão, permissão, conflito e serviço", async t => {
  const cases = [
    [401, "unauthorized", "Seu acesso expirou. Entre novamente e tente outra vez."],
    [403, "forbidden", "Você não tem permissão para concluir esta operação."],
    [409, "course_revision_changed", "O conteúdo mudou. Recarregue e tente novamente."],
    ...[500, 502, 503, 504].map(status => [status, "service_failure", FALLBACK]),
    ...["response_too_large", "course_authoring_analytics_response_too_large", "course_response_too_large"]
      .map(code => [413, code, LIMIT_MESSAGE]),
    [413, "other_failure", FALLBACK],
    [503, "response_too_large", FALLBACK]
  ];
  for (const [status, code, expected] of cases) {
    await t.test(`${status} ${code}`, async () => {
      const root = { innerHTML: "", addEventListener() {}, removeEventListener() {}, querySelector() { return null; } };
      let calls = 0;
      const panel = createCourseAnalyticsPanel({ root, course: { courseId: LEFT, revision: 7 },
        controller: { async loadCourseAuthoringAnalytics() {
          calls += 1;
          throw Object.assign(new Error("schema interno da leitura"), { status, code });
        } } });
      try {
        assert.equal(await panel.open(), false);
        assert.equal(root.innerHTML.match(/role="alert">([^<]*)<\/p>/u)?.[1], expected);
        assert.equal(calls, 1);
        assert.doesNotMatch(root.innerHTML, /schema interno|Carregando leitura/u);
        if (expected === LIMIT_MESSAGE) assert.doesNotMatch(root.innerHTML, /tente novamente/iu);
      } finally { panel.destroy(); }
    });
  }
});
