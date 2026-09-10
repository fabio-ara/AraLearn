import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { captureLocalCommand, readLocalMigrationVersions, runLocalIntegration, localIntegrationSummary } from "../../scripts/runLocalIntegration.mjs";

const URL = "http://127.0.0.1:54321";
const VERSION = "20260908000000";
const HOSTED_SECRET = "sb_secret_fixture_hosted_never_forward";

test("inventário real conserva a versão inicial 001 e todas as migrations do AraLearn", async () => {
  const versions = await readLocalMigrationVersions();
  const sqlFiles = (await fs.readdir(new globalThis.URL("../../supabase/migrations/", import.meta.url))).filter(name => name.endsWith(".sql"));
  assert.equal(versions[0], "001");
  assert.equal(versions.length, sqlFiles.length);
  assert.equal(new Set(versions).size, versions.length);
  assert.ok(versions.includes("20260908023156"));
});

async function fixture(t, options = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-integration-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, "supabase/functions"), { recursive: true });
  await fs.mkdir(path.join(cwd, "supabase/migrations"));
  await fs.writeFile(path.join(cwd, "supabase/config.toml"), 'project_id="aralearn"');
  await fs.writeFile(path.join(cwd, "supabase/functions/index.ts"), "// fixture");
  await fs.writeFile(path.join(cwd, `supabase/migrations/${VERSION}_fixture.sql`), "select 1;");
  const calls = [], started = [], stopped = [], probes = [];
  let active = Boolean(options.active), alive = true;
  const environment = { PATH: process.env.PATH, SUPABASE_SECRET_KEY: HOSTED_SECRET,
    ARALEARN_SUPABASE_URL: "https://hosted.example.invalid", OPENAI_API_KEY: "sk-fixture-never-forward",
    ARALEARN_E2E_REUSE_SERVER: "1", ...options.environment };
  const fetchImpl = async (input, init) => {
    probes.push({ input, method: init.method || "GET" });
    let response;
    if (!active) response = new Response("inactive", { status: 503 });
    else if (input.includes("aralearn-course-api")) response = new Response('{"error":{"code":"authentication_required"}}',
      { status: 401, headers: { "content-type": "application/json" } });
    else if (input.includes("aralearn-authoring-mcp")) response = Response.json({ resource: `${URL}/functions/v1/aralearn-authoring-mcp` },
      { headers: { "x-aralearn-authoring-contract": "synthetic-local-contract" } });
    else if (init.method === "OPTIONS") response = new Response(null, { status: 200, headers: { "access-control-allow-origin": "*" } });
    else response = Response.json({ error: { code: "method_not_allowed" } }, { status: 405,
      headers: { "access-control-allow-origin": "*", "x-aralearn-authoring-contract": "synthetic-local-contract" } });
    return await options.probe?.({ input, init, response, call: probes.length, stop: () => { alive = false; } }) ?? response;
  };
  const start = (command, args) => {
    started.push({ command, args }); active = true;
    return { alive: () => alive, serving: () => true, output: () => `Bearer ${HOSTED_SECRET}`,
      stop: async () => { stopped.push(true); alive = false; if (options.stopFailure) throw new Error("cleanup sintético falhou"); } };
  };
  const run = async (command, args, settings) => {
    calls.push({ command, args, env: settings.env });
    if (args.join(" ").includes("status --output json")) return { status: 0, stdout: JSON.stringify({
      API_URL: options.url || URL, ANON_KEY: "publica-local-sintetica", SERVICE_ROLE_KEY: "admin-local-sintetica"
    }) };
    if (command === "git") return { status: 0, stdout: args.includes("--name-status") ? options.migrationChanges || "" : options.edgeChanges || "" };
    if (command === "docker" && args.join(" ").includes("ARALEARN_PUBLIC_APP_URL")) return { status: 0,
      stdout: `ARALEARN_PUBLIC_APP_URL=${options.applicationOrigin || "http://127.0.0.1:4185"}` };
    if (command === "docker") return { status: 0, stdout: args[0] === "inspect" ? JSON.stringify({
      id: "container-local-sintetico", state: { Running: true, Restarting: false },
      mounts: [{ Type: "bind", RW: false, Source: options.foreignMount || path.join(cwd, "supabase/functions") }]
    }) : JSON.stringify(options.applied || [VERSION]) };
    if (options.throwAt === args[0]) throw new Error(`erro de processo com ${HOSTED_SECRET}`);
    if (settings.env.ARALEARN_LOCAL_FIXTURE_LEDGER_DIR && !options.missingLedger &&
        options.missingLedgerAt !== settings.env.ARALEARN_LOCAL_FIXTURE_ORIGIN &&
        ["storage-local", "current-local", "channels-local", "e2e-local", "copy-files-local"].includes(settings.env.ARALEARN_LOCAL_FIXTURE_ORIGIN)) {
      const dir = path.join(settings.env.ARALEARN_LOCAL_FIXTURE_LEDGER_DIR, createHash("sha256").update(URL).digest("hex").slice(0, 16));
      await fs.mkdir(dir, { recursive: true });
      const ownerId = randomUUID();
      for (const kind of ["user", "cleanup_probe", "course"]) {
        const attemptId = randomUUID();
        await fs.writeFile(path.join(dir, `${attemptId}.json`), JSON.stringify({ contract: "aralearn.local-fixture.v1",
          environment: URL, attemptId, kind, ownerId, id: kind === "user" ? ownerId : randomUUID(), files: [],
          state: options.pendingLedger && kind === "course" ? "uncertain" : "absent",
          ...(kind === "cleanup_probe" ? { verification: "owner-get-course-404", cleanupResult: { fileCleanupPending: false } } : {}) }));
      }
    }
    if (args[0].includes("course-authoring-current-local")) return { status: options.functionalFailure ? 1 : 0, stdout: JSON.stringify({
      contract: "aralearn.course-authoring-current-proof.v1", cleanup: { completed: !options.cleanupFailure }
    }), stderr: `Bearer ${HOSTED_SECRET}` };
    if (args[0].includes("course-authoring-channels-local")) return { status: 0, stdout: JSON.stringify({
      contract: "aralearn.local-authoring-channels-proof.v1", cleanup: { completed: true }
    }) };
    if (args[0].includes("course-storage-lifecycle")) return { status: 0,
      stdout: JSON.stringify({ contract: "aralearn.course-storage-lifecycle-proof.v1", orphanCollected: true }) };
    if (args[0].includes("runE2eTests")) {
      const skipped = options.skippedE2e ? 1 : 0;
      const failed = options.e2eFailure ? 1 : 0;
      await fs.writeFile(settings.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify({
        stats: { expected: 10 - skipped - failed, skipped, unexpected: failed, flaky: 0 }, errors: [],
        suites: [{ specs: Array.from({ length: 10 }, (_, index) => ({ file: "synthetic.spec.js", title: `jornada ${index}`,
          line: 12, column: 3,
          tests: [{ status: failed && index === 0 ? "unexpected" : skipped && index === 0 ? "skipped" : "expected",
            results: [{ status: failed && index === 0 ? "failed" : skipped && index === 0 ? "skipped" : "passed",
              retry: 0, ...(failed && index === 0 ? options.e2eFailure : {}) }] }] })) }]
      }));
      return { status: failed ? 1 : 0, stdout: "build sintético" };
    }
    if (args[0] === "--test") {
      await fs.writeFile(settings.env.ARALEARN_LOCAL_COPY_PROOF_PATH, JSON.stringify({ ok: true,
        checks: ["bytes", "copia", "remocao"], cleanup: [{ courseId: "a", status: "completed" },
          { courseId: "b", status: "completed" }, { userId: "c", status: "deleted" }] }));
      if (options.changeEdgeDuringProof) await fs.writeFile(path.join(cwd, "supabase/functions/index.ts"), "// mudou");
      return { status: 0, stdout: options.skippedCopy ? "# tests 1\n# pass 0\n# skipped 1\n" : "# tests 1\n# pass 1\n# skipped 0\n" };
    }
    return { status: 0, stdout: "smoke sintético com teardown" };
  };
  const execute = (argv = []) => runLocalIntegration({ cwd, argv, environment, run, start, fetchImpl,
    processAlive: pid => pid === 1234 && options.externalAlive !== false, pause: async () => {}, signal: options.signal });
  return { cwd, calls, started, stopped, probes, environment, execute };
}

test("integração prepara ambiente uma vez, executa todas as provas locais serialmente e encerra só suas funções", async t => {
  const f = await fixture(t);
  const report = await f.execute();
  assert.equal(report.result, "passed");
  assert.deepEqual(report.stages.map(stage => stage.name), ["oauth-local", "storage-local", "email-local",
    "current-local", "channels-local", "e2e-local", "copy-files-local"]);
  assert.ok(report.stages.every(stage => stage.result === "passed"));
  assert.equal(f.calls.filter(call => call.args.join(" ").includes("status --output json")).length, 1);
  assert.equal(f.started.length, 1); assert.equal(f.stopped.length, 1);
  for (const call of f.calls) {
    assert.equal(call.env.SUPABASE_SECRET_KEY, undefined);
    assert.equal(call.env.OPENAI_API_KEY, undefined);
    assert.ok(!Object.values(call.env).includes(HOSTED_SECRET));
  }
  const e2e = f.calls.find(call => call.args[0] === "scripts/runE2eTests.mjs");
  assert.equal(e2e.env.ARALEARN_E2E_REAL_SUPABASE, "1");
  assert.equal(e2e.env.ARALEARN_E2E_REUSE_SERVER, "0");
  assert.ok(e2e.args.includes("--forbid-only"));
  assert.ok(e2e.env.PLAYWRIGHT_JSON_OUTPUT_NAME.startsWith(path.join(f.cwd, ".validation/private")));
  assert.deepEqual(report.cleanup, { fixtures: "completed", functions: "stopped" });
  assert.ok(f.probes.filter(probe => probe.input.includes("aralearn-authoring-action")).every(probe => probe.method === "GET"));
  assert.equal(report.readiness.channel_contracts_match, true);
  for (const ref of report.log_refs) assert.ok(!(await fs.readFile(path.join(f.cwd, ref), "utf8")).includes(HOSTED_SECRET));
});

test("disponibilidade admite resposta íntegra após 1,5 s sem mudar o contrato ou repetir a etapa", async t => {
  const f = await fixture(t, { probe: ({ call, response, init }) => {
    if (call === 7) {
      const text = response.text.bind(response);
      response.text = async () => {
        await new Promise(resolve => setTimeout(resolve, 1650));
        init.signal.throwIfAborted();
        return text();
      };
    }
  } });
  const report = await f.execute();
  assert.equal(report.result, "passed");
  assert.equal(f.calls.filter(call => call.args[0] === "scripts/runLocalMcpOAuthSmoke.mjs").length, 1);
  assert.equal(report.readiness.timeout_ms, 5000);
});

test("timeout em headers ou no body conserva o diagnóstico atual e impede iniciar fixtures", async t => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  for (const phase of ["headers", "body"]) {
    const requestedTimeouts = [];
    const mock = t.mock.method(AbortSignal, "timeout", milliseconds => {
      requestedTimeouts.push(milliseconds);
      // A mesma sinalização real de prazo, abreviada somente no probe da etapa.
      return timeout(requestedTimeouts.length === 7 ? 5 : milliseconds);
    });
    const f = await fixture(t, { probe: async ({ call, init, response }) => {
      if (call !== 7) return;
      const expire = () => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("O sinal de prazo não chegou.")), 1000);
        const aborted = () => { clearTimeout(timer); reject(init.signal.reason); };
        if (init.signal.aborted) aborted();
        else init.signal.addEventListener("abort", aborted, { once: true });
      });
      if (phase === "headers") await expire();
      else response.text = expire;
    } });
    const report = await f.execute();
    mock.mock.restore();
    assert.equal(report.result, "failed");
    assert.ok(requestedTimeouts.every(value => value === 5000));
    assert.equal(report.availability.stage, "oauth-local");
    assert.equal(report.availability.reason, "probe_failed");
    assert.equal(report.availability.process_alive, true);
    assert.equal(report.readiness.api_status, 0, "falha de body não conserva prontidão anterior");
    const detail = report.readiness.requests.api;
    assert.equal(detail.status, phase === "headers" ? 0 : 401);
    assert.equal(detail.error_phase, phase);
    assert.equal(detail.error_name, "TimeoutError");
    assert.equal(detail.aborted, true);
    assert.equal(detail.body_complete, false);
    assert.equal(phase === "headers" ? detail.headers_ms === null : detail.headers_ms >= 0, true);
    assert.ok(detail.elapsed_ms >= 0);
    assert.deepEqual(localIntegrationSummary(report).availability, report.availability);
    assert.deepEqual(localIntegrationSummary(report).readiness, report.readiness);
    assert.ok(report.stages.every(stage => stage.result === "not_run"));
    assert.equal(report.cleanup.fixtures, "not_started");
    assert.equal(f.calls.some(call => call.args[0] === "scripts/runLocalMcpOAuthSmoke.mjs"), false);
    assert.equal(f.stopped.length, 1);
  }
});

test("status incorreto ou contratos divergentes na etapa continuam bloqueando após prontidão válida", async t => {
  for (const mismatch of ["status", "contract"]) {
    const f = await fixture(t, { probe: ({ call, response }) => {
      if (mismatch === "status" && call === 7) return Response.json({ error: { code: "authentication_required" } }, { status: 200 });
      if (mismatch === "contract" && call === 9) response.headers.set("x-aralearn-authoring-contract", "different-contract");
    } });
    const report = await f.execute();
    assert.equal(report.result, "failed");
    assert.equal(report.availability.reason, "probe_failed");
    assert.equal(report.readiness.api_status, mismatch === "status" ? 200 : 401);
    assert.equal(report.readiness.channel_contracts_match, mismatch !== "contract");
    assert.ok(Object.values(report.readiness.requests).every(request => request.body_complete));
    assert.equal(report.cleanup.fixtures, "not_started");
  }
});

test("cancelamento e processo encerrado são distintos, inclusive durante o probe, sem executar a etapa", async t => {
  for (const phase of ["before", "during"]) for (const failure of ["signal", "process"]) {
    const controller = new AbortController();
    const f = await fixture(t, { signal: controller.signal, probe: ({ call, response, stop }) => {
      if (call !== (phase === "before" ? 6 : 9)) return;
      const text = response.text.bind(response);
      response.text = async () => {
        const body = await text();
        if (failure === "signal") controller.abort();
        else stop();
        return body;
      };
    } });
    const report = await f.execute();
    assert.equal(report.result, "failed");
    assert.equal(report.availability.stage, "oauth-local");
    assert.equal(report.availability.reason, failure === "signal" ? "signal_aborted" : "process_exited");
    assert.equal(report.availability.signal_aborted, failure === "signal");
    assert.equal(report.availability.process_alive, failure !== "process");
    if (phase === "before") assert.equal(report.readiness, null, "nenhum probe da etapa executou");
    else assert.equal(report.readiness.channel_contracts_match, true, "HTTP íntegro não ignora interrupção concorrente");
    assert.equal(f.probes.length, phase === "before" ? 6 : 9);
    assert.equal(report.cleanup.fixtures, "not_started");
    assert.equal(f.calls.some(call => call.args[0] === "scripts/runLocalMcpOAuthSmoke.mjs"), false);
  }
});

test("CI reutiliza somente o processo explicitamente identificado e não repete provas já feitas pelo workflow", async t => {
  const f = await fixture(t, { active: true, environment: { CI: "true", ARALEARN_LOCAL_FUNCTIONS_PID: "1234" } });
  const report = await f.execute(["--functions-external", "--ci"]);
  assert.equal(report.result, "passed");
  assert.equal(report.stages.length, 4);
  assert.deepEqual(report.coverage_provided_by_ci, ["oauth-local", "storage-local", "email-local"]);
  assert.equal(f.started.length, 0); assert.equal(f.stopped.length, 0);
  assert.equal(report.cleanup.functions, "external_preserved");
});

test("modo externo fora de CI ou sem PID vivo bloqueia antes de criar fixtures", async t => {
  for (const environment of [{}, { CI: "true" }, { CI: "true", ARALEARN_LOCAL_FUNCTIONS_PID: "9999" }]) {
    const f = await fixture(t, { active: true, environment });
    const report = await f.execute(["--functions-external", "--ci"]);
    assert.equal(report.result, "failed");
    assert.ok(report.stages.every(stage => stage.result === "not_run"));
    assert.equal(f.started.length, 0); assert.equal(f.stopped.length, 0);
  }
});

test("URL hospedada, migration ausente ou alterada bloqueiam antes de qualquer fixture", async t => {
  for (const option of [{ url: "https://hosted.example.invalid" }, { applied: [] }, { migrationChanges: "M\tsupabase/migrations/fixture.sql" }]) {
    const f = await fixture(t, option); const report = await f.execute();
    assert.equal(report.result, "failed"); assert.equal(f.started.length, 0);
    assert.equal(report.cleanup.fixtures, "not_started");
  }
});

test("migration curta é confrontada como texto sem perder zeros e duplicatas bloqueiam", async t => {
  const f = await fixture(t, { applied: ["001", VERSION] });
  await fs.writeFile(path.join(f.cwd, "supabase/migrations/001_initial.sql"), "select 1;");
  assert.equal((await f.execute()).result, "passed");
  await fs.writeFile(path.join(f.cwd, "supabase/migrations/001_duplicate.sql"), "select 2;");
  const duplicated = await f.execute();
  assert.equal(duplicated.result, "failed");
  assert.match(duplicated.error, /duplicada/u);
  const mismatch = await fixture(t, { applied: ["1", VERSION] });
  await fs.writeFile(path.join(mismatch.cwd, "supabase/migrations/001_initial.sql"), "select 1;");
  assert.equal((await mismatch.execute()).result, "failed");
});

test("funções alheias ativas são preservadas no modo padrão", async t => {
  const f = await fixture(t, { active: true }); const report = await f.execute();
  assert.equal(report.result, "failed");
  assert.equal(report.cleanup.functions, "foreign_preserved");
  assert.equal(f.started.length, 0); assert.equal(f.stopped.length, 0);
});

test("cleanup de smoke falho, E2E ignorado e cópia ignorada nunca viram PASS", async t => {
  for (const option of [{ cleanupFailure: true }, { skippedE2e: true }, { skippedCopy: true }, { missingLedger: true }, { pendingLedger: true }]) {
    const f = await fixture(t, option); const report = await f.execute();
    assert.equal(report.result, "failed"); assert.equal(f.stopped.length, 1);
    assert.ok(report.failed_tests.length > 0);
    if (option.cleanupFailure || option.missingLedger || option.pendingLedger) assert.notEqual(report.cleanup.fixtures, "completed");
    else assert.equal(report.cleanup.fixtures, "completed", "o cenário ignorado reprova o gate sem apagar o teardown comprovado");
  }
});

test("falha funcional conserva limpeza confirmada e mantém o gate reprovado e os dependentes sem executar", async t => {
  const f = await fixture(t, { functionalFailure: true });
  const report = await f.execute();
  const current = report.stages.find(stage => stage.name === "current-local");
  assert.equal(report.result, "failed"); assert.equal(current.result, "failed"); assert.equal(current.exit_code, 1);
  assert.deepEqual(report.failed_tests, ["current-local"]);
  assert.equal(current.fixture_ledger.pending, 0); assert.equal(current.fixture_ledger.completed, true);
  assert.equal(current.cleanup, "completed"); assert.equal(report.cleanup.fixtures, "completed");
  assert.ok(report.stages.slice(report.stages.indexOf(current) + 1).every(stage => stage.result === "not_run"));
  assert.equal(f.stopped.length, 1);
  const stored = JSON.parse(await fs.readFile(path.join(f.cwd, ".validation/local-integration.json"), "utf8"));
  assert.equal(stored.result, "failed"); assert.equal(stored.cleanup.fixtures, "completed");
});

test("diagnóstico E2E preserva erro, localização e tentativa sem segredo ou alteração do gate/cleanup", async t => {
  const prefix = "Locator.click: Fontes não foi encontrado. ";
  const message = prefix + "x".repeat(1980 - prefix.length) + HOSTED_SECRET + "fim".repeat(1000);
  const f = await fixture(t, { e2eFailure: { errors: [
    { message, location: { file: "tests/e2e/course-authoring-context-local.spec.js", line: 217, column: 19 } },
    { message: `Bearer ${HOSTED_SECRET}` },
    { message: "terceiro erro fora do resumo" }
  ], stdout: [{ text: "stdout não pertence ao diagnóstico" }], attachments: [{ body: HOSTED_SECRET }] } });
  const report = await f.execute();
  const e2e = report.stages.find(stage => stage.name === "e2e-local");
  assert.equal(report.result, "failed"); assert.equal(e2e.result, "failed"); assert.equal(e2e.exit_code, 1);
  assert.equal(e2e.executed, 10); assert.deepEqual(report.failed_tests, ["synthetic.spec.js: jornada 0"]);
  assert.equal(e2e.fixture_ledger.pending, 0); assert.equal(e2e.cleanup, "completed");
  assert.deepEqual(report.cleanup, { fixtures: "completed", functions: "stopped" });
  assert.equal(report.stages.find(stage => stage.name === "copy-files-local").result, "not_run");
  assert.equal(f.stopped.length, 1);
  const summary = localIntegrationSummary(report);
  assert.equal(summary.result, "failed"); assert.equal(summary.cleanup.fixtures, "completed");
  assert.deepEqual(summary.failed_tests, report.failed_tests);
  assert.equal(summary.failure_details.length, 1);
  const detail = summary.failure_details[0];
  assert.equal(detail.stage, "e2e-local"); assert.equal(detail.title, "synthetic.spec.js: jornada 0");
  assert.equal(detail.attempt, 1); assert.equal(detail.retry, 0); assert.equal(detail.attempt_count, 1);
  assert.equal(detail.status, "failed"); assert.equal(detail.errors.length, 2);
  assert.ok(detail.errors[0].message.startsWith(prefix));
  assert.equal(detail.errors[0].message.length, 2000);
  assert.deepEqual(detail.errors[0].location, { file: "tests/e2e/course-authoring-context-local.spec.js", line: 217, column: 19 });
  assert.deepEqual(detail.errors[1].location, { file: "synthetic.spec.js", line: 12, column: 3 });
  const stored = await fs.readFile(path.join(f.cwd, ".validation/local-integration.json"), "utf8");
  for (const serialized of [JSON.stringify(report), JSON.stringify(summary), stored]) {
    assert.ok(!serialized.includes(HOSTED_SECRET.slice(0, 16)), "redigir antes de truncar evita vazar prefixo da credencial");
    assert.ok(!serialized.includes("terceiro erro fora do resumo"));
    assert.ok(!serialized.includes("stdout não pertence ao diagnóstico"));
  }
  assert.deepEqual(JSON.parse(stored).stages.find(stage => stage.name === "e2e-local").failure_details, e2e.failure_details);
});

test("ledger limpo de etapa anterior não comprova o teardown da etapa corrente sem registros", async t => {
  const f = await fixture(t, { functionalFailure: true, missingLedgerAt: "current-local" });
  const report = await f.execute();
  const current = report.stages.find(stage => stage.name === "current-local");
  assert.equal(current.fixture_ledger.completed, true, "o inventário anterior permanece reconciliado");
  assert.equal(current.cleanup, "unverified"); assert.equal(report.cleanup.fixtures, "unverified");
  assert.equal(report.result, "failed"); assert.deepEqual(report.failed_tests, ["current-local"]);
});

test("falha de processo ou encerramento conserva relatório redigido e bloqueia", async t => {
  for (const option of [{ throwAt: "supabase/tests/course-authoring-current-local-smoke.mjs" }, { stopFailure: true }]) {
    const f = await fixture(t, option); const report = await f.execute();
    assert.equal(report.result, "failed"); assert.equal(f.stopped.length, 1);
    const stored = await fs.readFile(path.join(f.cwd, ".validation/local-integration.json"), "utf8");
    assert.ok(!stored.includes(HOSTED_SECRET));
    if (option.stopFailure) assert.equal(report.cleanup.functions, "failed");
  }
});

test("runtime persistente exige mount correto, base sem delta e fingerprint estável, sem encerrá-lo", async t => {
  const f = await fixture(t, { active: true });
  const report = await f.execute(["--functions-existing", "--base", "origin/main"]);
  assert.equal(report.result, "passed"); assert.equal(report.runtime.mode, "existing");
  assert.equal(report.runtime.application_origin, "http://127.0.0.1:4185");
  assert.equal(f.calls.find(call => call.args[0].includes("course-authoring-channels-local"))
    .env.ARALEARN_LOCAL_APPLICATION_ORIGIN, "http://127.0.0.1:4185");
  assert.equal(report.cleanup.functions, "existing_preserved");
  assert.equal(f.started.length, 0); assert.equal(f.stopped.length, 0);
  for (const option of [{ foreignMount: os.tmpdir() }, { applicationOrigin: "https://hosted.example.invalid" }, { edgeChanges: "supabase/functions/index.ts" },
    { migrationChanges: "A\tsupabase/migrations/new.sql" }, { changeEdgeDuringProof: true }]) {
    const invalid = await fixture(t, { active: true, ...option });
    assert.equal((await invalid.execute(["--functions-existing"])).result, "failed");
    assert.equal(invalid.stopped.length, 0);
  }
});

test("captura executa um subprocesso sintético sem despejar stdout/stderr no chamador", async () => {
  const result = await captureLocalCommand(process.execPath, ["-e", 'process.stdout.write("recibo"); process.stderr.write("diagnostico"); process.exitCode=3;'],
    { cwd: process.cwd(), env: process.env, timeoutMs: 5000 });
  assert.equal(result.status, 3); assert.equal(result.stdout, "recibo"); assert.equal(result.stderr, "diagnostico");
});
