import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { captureLocalCommand, readLocalMigrationVersions, runLocalIntegration } from "../../scripts/runLocalIntegration.mjs";

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
    if (!active) return new Response("inactive", { status: 503 });
    if (input.includes("aralearn-course-api")) return new Response('{"error":{"code":"authentication_required"}}',
      { status: 401, headers: { "content-type": "application/json" } });
    if (input.includes("aralearn-authoring-mcp")) return Response.json({ resource: `${URL}/functions/v1/aralearn-authoring-mcp` },
      { headers: { "x-aralearn-authoring-contract": "synthetic-local-contract" } });
    if (init.method === "OPTIONS") return new Response(null, { status: 200, headers: { "access-control-allow-origin": "*" } });
    return Response.json({ error: { code: "method_not_allowed" } }, { status: 405,
      headers: { "access-control-allow-origin": "*", "x-aralearn-authoring-contract": "synthetic-local-contract" } });
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
      await fs.writeFile(settings.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify({
        stats: { expected: 10 - skipped, skipped, unexpected: 0, flaky: 0 }, errors: [],
        suites: [{ specs: Array.from({ length: 10 }, (_, index) => ({ file: "synthetic.spec.js", title: `jornada ${index}`,
          tests: [{ status: skipped && index === 0 ? "skipped" : "expected", results: [{ status: skipped && index === 0 ? "skipped" : "passed" }] }] })) }]
      }));
      return { status: 0, stdout: "build sintético" };
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
    processAlive: pid => pid === 1234 && options.externalAlive !== false, pause: async () => {} });
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
