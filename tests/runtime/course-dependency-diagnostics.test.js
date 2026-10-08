// Diagnóstico interno mínimo de dependência (incidente de integração 2026-10).
// Distingue qual RPC falhou, orçamento global vs tempo da tentativa, com contagem
// real de fetches e tempos limitados, correlacionado ao requestId do evento único
// aralearn.authoring.error. Nenhuma prova usa 40 s de parede, serviço real ou
// payload privado: só relógio/fetch de fixture locais.
import test from "node:test";
import assert from "node:assert/strict";

import { CourseSupabaseAdapter } from
  "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import {
  AuthoringApiError,
  readDependencyDiagnostic,
  withDependencyDiagnostic
} from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

// Nomes REAIS do enum fechado (um deles é leitura de preparar_revisao).
const READ_RPC = "get_course_content_review_for_actor_v1";
const OTHER_RPC = "list_owned_courses_for_actor_v1";
const ORIGIN = "https://client.example";
const RESOURCE_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const PRINCIPAL = Object.freeze({
  actorId: "30000000-0000-4000-8000-000000000003",
  authenticationKind: "oauth",
  scopes: Object.freeze(["authoring:read", "authoring:write"])
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" }
  });
}

function adapter(fetchImpl, options = {}) {
  return new CourseSupabaseAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "sb_secret_test",
    publishableKey: "sb_publishable_test",
    publicAppUrl: "https://app.example/AraLearn/",
    fetchImpl,
    attempts: 1,
    ...options
  });
}

function hangingFetch(_url, init) {
  return new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")), { once: true });
  });
}

function request(method, params = {}) {
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
}

function handler(throwingAdapter) {
  return createAuthoringMcpHandler({
    adapter: throwingAdapter,
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
}

function adapterThrowing(error) {
  return {
    async resolvePrincipal() { return PRINCIPAL; },
    async listCourses() { throw error; }
  };
}

async function captureLogs(run) {
  const logs = [];
  const original = console.error;
  console.error = (line) => { logs.push(String(line)); };
  try {
    return { value: await run(), logs };
  } finally {
    console.error = original;
  }
}

function callTool() {
  return request("tools/call", { name: "retomar_curso", arguments: { titulo: "Redes" } });
}

test("orçamento esgotado antes do fetch registra 0 de 1 fetches iniciados", async () => {
  let calls = 0;
  const value = adapter(async () => { calls += 1; return json({ ok: true }); });
  const error = await value.rpc(READ_RPC, {}, { deadlineAt: Date.now() - 1 })
    .then(() => null, (thrown) => thrown);

  assert.ok(error instanceof AuthoringApiError);
  assert.equal(error.status, 503);
  assert.equal(error.code, "service_timeout");
  assert.equal(calls, 0, "o fetch não é tentado quando o orçamento já esgotou");
  const dependency = readDependencyDiagnostic(error);
  assert.deepEqual(Object.keys(dependency).sort(),
    ["attemptsAllowed", "attemptsStarted", "elapsedMs", "reason", "remainingMs", "rpc"]);
  assert.equal(dependency.rpc, READ_RPC);
  assert.equal(dependency.reason, "deadline_exhausted");
  assert.equal(dependency.attemptsStarted, 0, "contagem real: nenhum fetch iniciado");
  assert.equal(dependency.attemptsAllowed, 1);
  assert.equal(dependency.remainingMs, 0);
  assert.equal(Object.keys(error).includes("aralearnDependency"), false,
    "o diagnóstico interno não é enumerável");
  assert.doesNotMatch(JSON.stringify(error), /get_course_content_review/u,
    "o diagnóstico não vai ao JSON do erro");
});

test("RPCs de estrutura do curso estão no enum e contam 0 fetches no deadline", async () => {
  for (const rpc of ["mutate_course_structure_for_actor_v1", "reorder_course_study_units_for_actor_v1"]) {
    let calls = 0;
    const value = adapter(async () => { calls += 1; return json({ ok: true }); });
    const error = await value.rpc(rpc, { p_actor_id: "00000000-0000-4000-8000-000000000000" },
      { deadlineAt: Date.now() - 1 }).then(() => null, (thrown) => thrown);
    assert.ok(error instanceof AuthoringApiError, rpc);
    assert.equal(calls, 0, rpc + ": nenhum fetch antes do deadline");
    const dependency = readDependencyDiagnostic(error);
    assert.equal(dependency.rpc, rpc, rpc + ": nome real preservado no diagnóstico");
    assert.equal(dependency.reason, "deadline_exhausted");
    assert.equal(dependency.attemptsStarted, 0);
    assert.equal(dependency.attemptsAllowed, 1);
  }
});

test("orçamento global menor que a tentativa marca budget_abort", async () => {
  const value = adapter(hangingFetch, { requestTimeoutMs: 5_000 });
  const error = await value.rpc(READ_RPC, {}, { deadlineAt: Date.now() + 30 })
    .then(() => null, (thrown) => thrown);
  const dependency = readDependencyDiagnostic(error);
  assert.equal(dependency.reason, "budget_abort",
    "remaining < timeoutMs significa que o orçamento global abortou");
  assert.equal(dependency.attemptsStarted, 1, "a tentativa chegou a começar");
  assert.equal(dependency.attemptsAllowed, 1);
  assert.ok(dependency.remainingMs <= 30, "remaining limitado");
});

test("tentativa individual estoura o próprio tempo com orçamento folgado", async () => {
  const value = adapter(hangingFetch, { requestTimeoutMs: 20 });
  const error = await value.rpc(READ_RPC, {}, { deadlineAt: Date.now() + 5_000 })
    .then(() => null, (thrown) => thrown);
  const dependency = readDependencyDiagnostic(error);
  assert.equal(dependency.reason, "attempt_abort");
  assert.equal(dependency.attemptsStarted, 1);
  assert.ok(dependency.elapsedMs >= 10, "a dependência concentrou a espera da tentativa");
  assert.ok(dependency.remainingMs > 0, "ainda havia orçamento global");

  const retried = adapter(hangingFetch, { requestTimeoutMs: 20, attempts: 3 });
  const retriedError = await retried.rpc(READ_RPC, {}, { deadlineAt: Date.now() + 5_000 })
    .then(() => null, (thrown) => thrown);
  const retriedDependency = readDependencyDiagnostic(retriedError);
  assert.equal(retriedDependency.reason, "attempt_abort");
  assert.equal(retriedDependency.attemptsStarted, 3, "conta os fetches realmente iniciados");
  assert.equal(retriedDependency.attemptsAllowed, 3);
});

test("orçamento que expira antes da próxima tentativa mantém a contagem real", async () => {
  const value = adapter(hangingFetch, { requestTimeoutMs: 15, attempts: 3 });
  const error = await value.rpc(READ_RPC, {}, { deadlineAt: Date.now() + 25 })
    .then(() => null, (thrown) => thrown);
  const dependency = readDependencyDiagnostic(error);
  assert.equal(dependency.reason, "deadline_exhausted");
  assert.equal(dependency.attemptsStarted, 1, "uma tentativa iniciou; a seguinte não");
  assert.equal(dependency.attemptsAllowed, 3);
});

test("erro HTTP que encerra as tentativas marca attempt_error", async () => {
  const value = adapter(async () => json({ code: "XX000", message: "falha sintética" }, 500));
  const error = await value.rpc(READ_RPC, {}, { deadlineAt: Date.now() + 5_000 })
    .then(() => null, (thrown) => thrown);
  const dependency = readDependencyDiagnostic(error);
  assert.equal(dependency.rpc, READ_RPC);
  assert.equal(dependency.reason, "attempt_error");
  assert.equal(dependency.attemptsStarted, 1);
});

test("sucesso não deixa diagnóstico pendurado no adapter compartilhado", async () => {
  const value = adapter(async () => json({ contract: "aralearn.synthetic.v1" }));
  assert.deepEqual(await value.rpc(READ_RPC, {}), { contract: "aralearn.synthetic.v1" });
  assert.equal(Object.keys(value).some((key) => /depend|lastRpc/iu.test(key)), false);
});

test("chamadas RPC concorrentes no mesmo adapter não trocam diagnóstico", async () => {
  const value = adapter(async (url) => json({ url }, url.endsWith(READ_RPC) ? 400 : 500));
  const [first, second] = await Promise.all([
    value.rpc(READ_RPC, {}).then(() => null, (thrown) => thrown),
    value.rpc(OTHER_RPC, {}).then(() => null, (thrown) => thrown)
  ]);
  assert.equal(readDependencyDiagnostic(first).rpc, READ_RPC);
  assert.equal(readDependencyDiagnostic(second).rpc, OTHER_RPC);
  assert.notEqual(readDependencyDiagnostic(first), readDependencyDiagnostic(second));
});

test("evento único carrega dependency fechado e mantém o erro público idêntico", async () => {
  const { value: response, logs } = await captureLogs(() => handler(adapterThrowing(
    withDependencyDiagnostic(
      new AuthoringApiError(503, "service_timeout", "O prazo da operação terminou."),
      { rpc: READ_RPC, reason: "budget_abort", attemptsStarted: 1, attemptsAllowed: 3,
        elapsedMs: 8_000, remainingMs: 0 }
    )
  ))(callTool()));

  const payload = await response.json();
  const publicError = payload.result.structuredContent.error;
  assert.equal(payload.result.isError, true);
  assert.deepEqual(Object.keys(publicError).sort(),
    ["code", "diagnostico", "message", "retryable"], "o erro público não ganha campo novo");
  assert.equal(publicError.code, "temporarily_unavailable");
  assert.equal(publicError.retryable, true);
  assert.deepEqual(Object.keys(publicError.diagnostico).sort(), ["fase", "requestId", "status"]);
  assert.equal(publicError.diagnostico.fase, "execucao");

  assert.equal(logs.length, 1, "uma falha transitória gera um único evento");
  const record = JSON.parse(logs[0]);
  assert.deepEqual(Object.keys(record).sort(),
    ["classe", "code", "dependency", "duracaoMs", "event", "fase", "requestId", "status", "tool"]);
  assert.equal(record.event, "aralearn.authoring.error");
  assert.deepEqual(record.dependency, {
    rpc: READ_RPC, reason: "budget_abort", attemptsStarted: 1, attemptsAllowed: 3,
    elapsedMs: 8_000, remainingMs: 0
  });
  assert.equal(record.requestId, publicError.diagnostico.requestId,
    "o mesmo requestId liga o log à resposta");
  assert.doesNotMatch(JSON.stringify(payload),
    /get_course_content_review_for_actor_v1|budget_abort|dependency|token/u,
    "o diagnóstico interno nunca aparece na resposta pública");
  assert.doesNotMatch(logs[0], /Bearer|token|Redes/u,
    "credencial e entrada do cliente não vão ao log");
});

test("nome desconhecido com forma válida não passa no enum", async () => {
  const { value: response, logs } = await captureLogs(() => handler(adapterThrowing(
    withDependencyDiagnostic(
      new AuthoringApiError(503, "service_timeout", "Falha sintética."),
      { rpc: "segredo_do_curso_abc", reason: "attempt_abort", attemptsStarted: 1,
        attemptsAllowed: 1, elapsedMs: 20, remainingMs: 10 }
    )
  ))(callTool()));

  assert.equal((await response.json()).result.isError, true);
  const record = JSON.parse(logs[0]);
  assert.equal(record.dependency.rpc, null,
    "nome fora do enum vira null mesmo com forma válida");
  assert.equal(record.dependency.reason, "attempt_abort", "o motivo fechado permanece");
  assert.doesNotMatch(logs[0], /segredo_do_curso_abc/u, "o nome desconhecido não é refletido");
});

test("diagnóstico inteiramente fora do vocabulário é omitido", async () => {
  const { value: response, logs } = await captureLogs(() => handler(adapterThrowing(
    withDependencyDiagnostic(
      new AuthoringApiError(503, "service_timeout", "Falha sintética."),
      { rpc: "SEGREDO/../rpc?token=abc", reason: "SEGREDO", attemptsStarted: 999,
        attemptsAllowed: -1, elapsedMs: -1, remainingMs: 10 ** 9 }
    )
  ))(callTool()));

  assert.equal((await response.json()).result.isError, true);
  const record = JSON.parse(logs[0]);
  assert.equal(Object.hasOwn(record, "dependency"), false);
  assert.doesNotMatch(logs[0], /SEGREDO|token=abc/u);
});

test("getter hostil e erro congelado não derrubam a resposta", async () => {
  const hostile = {};
  Object.defineProperty(hostile, "rpc", { get() { throw new Error("getter hostil"); } });
  Object.defineProperty(hostile, "reason", { get() { throw new Error("getter hostil"); } });
  const { value: response } = await captureLogs(() => handler(adapterThrowing(
    withDependencyDiagnostic(new AuthoringApiError(503, "service_timeout", "Falha sintética."), hostile)
  ))(callTool()));

  const payload = await response.json();
  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.error.retryable, true);

  const frozen = Object.freeze(new AuthoringApiError(503, "service_timeout", "Falha sintética."));
  assert.doesNotThrow(() => withDependencyDiagnostic(frozen, { rpc: READ_RPC, reason: "attempt_abort" }));
  assert.equal(readDependencyDiagnostic(frozen), null, "erro congelado não recebe o campo");
  const frozenRun = await captureLogs(() => handler(adapterThrowing(frozen))(callTool()));
  assert.equal((await frozenRun.value.json()).result.isError, true);
  assert.equal(JSON.parse(frozenRun.logs[0]).code, "service_timeout");
});

test("falha do sink de log não derruba a resposta da ferramenta", async () => {
  const original = console.error;
  console.error = () => { throw new Error("sink quebrado"); };
  try {
    const response = await handler(adapterThrowing(
      withDependencyDiagnostic(
        new AuthoringApiError(503, "service_timeout", "O prazo da operação terminou."),
        { rpc: READ_RPC, reason: "deadline_exhausted", attemptsStarted: 0,
          attemptsAllowed: 1, elapsedMs: 12, remainingMs: 0 }
      )
    ))(callTool());
    const payload = await response.json();
    assert.equal(payload.result.isError, true);
    assert.equal(payload.result.structuredContent.error.retryable, true);
  } finally {
    console.error = original;
  }
});

test("enum admite RPC real e rejeita valor de comando ou forma desconhecida", async () => {
  const { closedAuthoringRpcName } =
    await import("../../supabase/functions/_shared/aralearn-authoring/errors.js");
  assert.equal(closedAuthoringRpcName(READ_RPC), READ_RPC);
  assert.equal(closedAuthoringRpcName(OTHER_RPC), OTHER_RPC);
  assert.equal(closedAuthoringRpcName("segredo_do_curso_abc"), null);
  assert.equal(closedAuthoringRpcName("approve"), null, "valor de comando não é RPC");
  assert.equal(closedAuthoringRpcName("remove_pdf"), null, "valor de comando não é RPC");
});
