import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SPECS = ["course-access-local", "course-audio-local", "course-authoring-context-local", "course-parts-local"]
  .map(name => `tests/e2e/${name}.spec.js`);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sensitiveName = name => /SUPABASE|TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY/iu.test(name);

export function redactLocalIntegrationOutput(value, environment = {}) {
  let result = String(value);
  for (const [name, secret] of Object.entries(environment)) {
    if (sensitiveName(name) && typeof secret === "string" && secret.length >= 6) {
      result = result.split(secret).join("[credencial omitida]");
    }
  }
  return result
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[JWT omitido]")
    .replace(/\b(?:sb_secret_|ara_|ars_)[A-Za-z0-9_-]{12,}/gu, "[credencial omitida]")
    .replace(/(Bearer\s+)[^\s"',}]+/giu, "$1[omitido]")
    .replace(/("(?:access_token|refresh_token|client_secret|password)"\s*:\s*")[^"\r\n]*(")/giu, "$1[omitido]$2");
}

function cleanEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    !sensitiveName(name) && !/^ARALEARN_(?:E2E|LOCAL|TEST_REAL|AUTHORING|PUBLIC_APP_URL|COURSE_API_ALLOWED_ORIGINS)/u.test(name)
      && (!name.startsWith("PLAYWRIGHT_") || name === "PLAYWRIGHT_BROWSERS_PATH")));
}

function supabaseCommand(args, environment) {
  return process.platform === "win32"
    ? { command: environment.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `npx --yes supabase@2.115.0 ${args.join(" ")}`] }
    : { command: "npx", args: ["--yes", "supabase@2.115.0", ...args] };
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "EPERM"; }
}

function startCommand(command, args, { cwd, env }) {
  const child = spawn(command, args, {
    cwd, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "", stderr = "", done = false, serving = false;
  const append = (current, chunk) => (current + chunk).slice(-16 * 1024 * 1024);
  child.stdout.on("data", chunk => { stdout = append(stdout, chunk); serving ||= stdout.includes("Serving functions on "); });
  child.stderr.on("data", chunk => { stderr = append(stderr, chunk); serving ||= stderr.includes("Serving functions on "); });
  const completed = new Promise(resolve => {
    child.once("error", error => { stderr += error.message; done = true; resolve({ status: 1, stdout, stderr }); });
    child.once("close", code => { done = true; resolve({ status: code ?? 1, stdout, stderr }); });
  });
  async function stop() {
    if (done) return;
    if (process.platform === "win32") {
      await new Promise((resolve, reject) => {
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", reject); killer.once("close", resolve);
      });
    } else {
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    for (let attempt = 0; !done && attempt < 50; attempt++) await sleep(100);
    if (!done && process.platform !== "win32") {
      try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      for (let attempt = 0; !done && attempt < 20; attempt++) await sleep(100);
    }
    if (!done) throw new Error("O processo próprio não confirmou o encerramento.");
  }
  return { completed, stop, alive: () => !done, serving: () => serving, output: () => `${stdout}\n${stderr}` };
}

export async function captureLocalCommand(command, args, options) {
  const handle = startCommand(command, args, options);
  let interrupted = false, stopFailure;
  const cancel = () => {
    interrupted = true;
    void handle.stop().catch(error => { stopFailure = error; });
  };
  const timer = setTimeout(cancel, options.timeoutMs || 120_000);
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  try {
    const result = await handle.completed;
    if (stopFailure) throw stopFailure;
    return interrupted ? { ...result, status: 1, stderr: `${result.stderr}\nProcesso interrompido ou prazo excedido.` } : result;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

async function probeFunctions(projectUrl, fetchImpl) {
  const request = async (url, init = {}) => {
    try {
      const response = await fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(1500) });
      return { status: response.status, headers: response.headers, body: await response.text() };
    } catch { return { status: 0, headers: new Headers(), body: "" }; }
  };
  const base = `${projectUrl}/functions/v1`;
  const [api, mcp, actions] = await Promise.all([
    request(`${base}/aralearn-course-api/v1/courses`, { headers: { Origin: "http://127.0.0.1:4182" } }),
    request(`${base}/aralearn-authoring-mcp/.well-known/oauth-protected-resource`),
    request(`${base}/aralearn-authoring-action/retomar_curso`, {
      method: "OPTIONS", headers: { Origin: "https://chatgpt.com", "Access-Control-Request-Method": "POST" }
    })
  ]);
  let resource;
  try { resource = JSON.parse(mcp.body).resource; } catch { /* endpoint ainda não está pronto */ }
  const apiReady = api.status === 401 && api.body.includes('"authentication_required"') &&
    api.headers.get("content-type")?.includes("application/json");
  const mcpReady = mcp.status === 200 && resource === `${base}/aralearn-authoring-mcp`;
  const actionsReady = [200, 204].includes(actions.status) &&
    actions.headers.get("access-control-allow-origin") === "https://chatgpt.com" &&
    Boolean(actions.headers.get("x-aralearn-authoring-contract"));
  return { ready: Boolean(apiReady && mcpReady && actionsReady), active: Boolean(apiReady || mcpReady || actionsReady) };
}

function parseStatus(source) {
  const status = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1));
  const url = new URL(status.API_URL);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.port !== "54321" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("A integração aceita somente a stack local na porta 54321.");
  }
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Credenciais efêmeras locais ausentes.");
  return { projectUrl: url.origin, publishableKey: status.ANON_KEY, adminKey: status.SERVICE_ROLE_KEY };
}

async function edgeFingerprint(cwd) {
  const hash = createHash("sha256");
  async function add(directory) {
    for (const entry of (await fs.readdir(path.join(cwd, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await add(relative);
      else if (entry.isFile()) hash.update(relative).update("\0").update(await fs.readFile(path.join(cwd, relative)));
      else throw new Error("A impressão do runtime não aceita caminhos simbólicos.");
    }
  }
  hash.update(await fs.readFile(path.join(cwd, "supabase/config.toml")));
  await add("supabase/functions");
  return hash.digest("hex");
}

function hostMountPath(source) {
  let result = source.replace(/^\/run\/desktop\/mnt\/host\/([a-z])\//u, (_, drive) => `${drive.toUpperCase()}:/`);
  result = path.resolve(result);
  return process.platform === "win32" ? result.toLowerCase() : result;
}

function playwrightReceipt(report) {
  const tests = [];
  function visit(suites) {
    for (const suite of suites || []) {
      for (const spec of suite.specs || []) for (const test of spec.tests || []) tests.push({
        title: `${spec.file || suite.file || ""}: ${spec.title}`, status: test.status,
        attempts: test.results || []
      });
      visit(suite.suites);
    }
  }
  visit(report.suites);
  const failed = tests.filter(test => test.status !== "expected" || test.attempts.length !== 1 || test.attempts[0].status !== "passed");
  const ok = tests.length === 10 && !failed.length && !report.errors?.length &&
    report.stats?.expected === 10 && report.stats?.unexpected === 0 && report.stats?.skipped === 0 && report.stats?.flaky === 0;
  return { ok, executed: tests.length, failed_tests: failed.map(test => test.title), cleanup: ok ? "completed" : "unverified" };
}

export async function runLocalIntegration({
  argv = process.argv.slice(2), environment = process.env, cwd = ROOT, signal,
  run = captureLocalCommand, start = startCommand, fetchImpl = fetch, processAlive = isProcessAlive,
  pause = sleep
} = {}) {
  const directory = path.join(cwd, ".validation");
  const privateDirectory = path.join(directory, "private", `local-integration-${randomUUID()}`);
  await fs.mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const reportPath = path.join(directory, "local-integration.json");
  const report = {
    schema: "aralearn.local-integration.v1", result: "running", started_at: new Date().toISOString(),
    stages: ["current-local", "channels-local", "e2e-local", "copy-files-local"].map(name => ({ name, result: "not_run" })),
    failed_tests: [], log_refs: [], cleanup: { fixtures: "not_started", functions: "not_started" }
  };
  let secrets = { ...environment }, functions, persistentFingerprint;
  const redact = value => redactLocalIntegrationOutput(value, secrets);
  const relative = file => path.relative(cwd, file).split(path.sep).join("/");
  const save = () => fs.writeFile(reportPath, `${redact(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 });
  await save();
  try {
    const flags = new Set();
    let base = "origin/main";
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index];
      if (flags.has(arg) || !["--ci", "--functions-external", "--functions-existing", "--base"].includes(arg)) {
        throw new Error("Use --functions-external, --functions-existing, --ci ou --base <ref>, sem repetição.");
      }
      flags.add(arg);
      if (arg === "--base") {
        base = argv[++index];
        if (!base || base.startsWith("-")) throw new Error("--base exige uma referência Git explícita.");
      }
    }
    const external = flags.has("--functions-external");
    const existing = flags.has("--functions-existing");
    const ci = flags.has("--ci");
    if (external && existing) throw new Error("Escolha um único modo de ownership das funções.");
    if ((ci || external) && (!ci || environment.CI !== "true")) {
      throw new Error("Funções externas são permitidas somente com --ci e CI=true.");
    }
    const baseEnvironment = cleanEnvironment(environment);
    const cli = supabaseCommand(["status", "--output", "json"], baseEnvironment);
    const status = await run(cli.command, cli.args, { cwd, env: baseEnvironment, signal });
    if (status.status !== 0) throw new Error("Supabase local não respondeu ao status; prepare a stack antes deste gate.");
    const local = parseStatus(status.stdout);
    const read = async (command, args) => {
      const result = await run(command, args, { cwd, env: baseEnvironment, signal });
      if (result.status !== 0) throw new Error(`A inspeção local por ${command} falhou; nenhum gate foi aprovado.`);
      return result.stdout.trim();
    };
    const files = (await fs.readdir(path.join(cwd, "supabase/migrations"))).filter(name => name.endsWith(".sql")).sort();
    if (files.some(name => !/^\d{14}_.+\.sql$/u.test(name))) throw new Error("Nome de migration não reconhecido.");
    const versions = files.map(name => name.slice(0, 14));
    const applied = JSON.parse(await read("docker", ["exec", "supabase_db_aralearn", "psql", "-U", "postgres", "-d", "postgres",
      "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command",
      "select coalesce(json_agg(version order by version),'[]'::json) from supabase_migrations.schema_migrations;"]));
    if (JSON.stringify(applied) !== JSON.stringify(versions)) throw new Error("A stack local não corresponde ao inventário de migrations; execute o preparo/upgrade antes do gate.");
    const migrationChanges = await read("git", ["diff", "--name-status", "--no-renames", base, "--", "supabase/migrations"]);
    if ((existing && migrationChanges) || migrationChanges.split(/\r?\n/u).some(line => line && !line.startsWith("A\t"))) {
      throw new Error("Migrations alteradas exigem prova de preparo/upgrade; o runtime persistente não a substitui.");
    }
    report.database = { migration_count: versions.length, latest_migration: versions.at(-1), base,
      inventory_matches: true, new_migrations_require_database_gate: Boolean(migrationChanges) };
    const localEnvironment = {
      ...baseEnvironment, ARALEARN_SUPABASE_URL: local.projectUrl,
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
      SUPABASE_URL: local.projectUrl, SUPABASE_ANON_KEY: local.publishableKey,
      SUPABASE_PUBLISHABLE_KEY: local.publishableKey, SUPABASE_SERVICE_ROLE_KEY: local.adminKey,
      ARALEARN_E2E_PORT: "4182", ARALEARN_E2E_REUSE_SERVER: "0", ARALEARN_E2E_REAL_SUPABASE: "1",
      ARALEARN_LOCAL_APPLICATION_ORIGIN: "http://127.0.0.1:4182", ARALEARN_TEST_REAL_LOCAL_COPY_FILES: "1"
    };
    localEnvironment.MAILPIT_URL = "http://127.0.0.1:54324";
    localEnvironment.INBUCKET_URL = localEnvironment.MAILPIT_URL;
    secrets = { ...secrets, ...localEnvironment };
    let alive;
    if (existing) {
      const changed = await read("git", ["diff", "--name-only", base, "--", "supabase/functions", "supabase/config.toml"]);
      const untracked = await read("git", ["ls-files", "--others", "--exclude-standard", "--", "supabase/functions", "supabase/migrations"]);
      if (changed || untracked) throw new Error("Funções persistentes exigem código/configuração iguais à base e nenhum arquivo novo de backend.");
      const inspected = JSON.parse(await read("docker", ["inspect", "--format",
        '{"mounts":{{json .Mounts}},"state":{{json .State}},"id":{{json .Id}}}', "supabase_edge_runtime_aralearn"]));
      if (!inspected.state?.Running || inspected.state.Restarting || inspected.state.Paused ||
          !inspected.mounts?.some(mount => mount.Type === "bind" && mount.RW === false &&
            hostMountPath(mount.Source) === hostMountPath(path.join(cwd, "supabase/functions")))) {
        throw new Error("O Edge Runtime persistente não comprovou o bind somente leitura deste checkout.");
      }
      persistentFingerprint = await edgeFingerprint(cwd);
      report.runtime = { mode: "existing", container_id: inspected.id, edge_sha256: persistentFingerprint,
        base, limitation: "Runtime persistente sem reinício; nenhuma mudança de Edge/configuração relativa à base é admitida." };
      alive = () => true; // Saúde HTTP é relida em cada etapa; nenhum PID/container alheio é encerrado.
      report.cleanup.functions = "existing_preserved";
    } else if (external) {
      const pid = Number(environment.ARALEARN_LOCAL_FUNCTIONS_PID);
      alive = () => processAlive(pid);
      if (!alive()) throw new Error("O workflow precisa identificar seu processo vivo em ARALEARN_LOCAL_FUNCTIONS_PID.");
      report.cleanup.functions = "external_preserved";
    } else {
      if ((await probeFunctions(local.projectUrl, fetchImpl)).active) {
        report.cleanup.functions = "foreign_preserved";
        throw new Error("Edge Functions já estão ativas; este gate não substitui nem encerra um processo alheio.");
      }
      const serve = supabaseCommand(["functions", "serve", "--no-verify-jwt"], baseEnvironment);
      functions = start(serve.command, serve.args, { cwd, env: baseEnvironment });
      alive = functions.alive;
      report.cleanup.functions = "pending";
    }
    const deadline = Date.now() + 60_000;
    let ready = false;
    do {
      if (signal?.aborted) throw new Error("Integração interrompida antes das fixtures.");
      if (!alive()) throw new Error("O processo das Edge Functions encerrou antes da prontidão.");
      ready = (external || existing || functions.serving()) && (await probeFunctions(local.projectUrl, fetchImpl)).ready;
      if (!ready) await pause(500);
    } while (!ready && Date.now() < deadline);
    if (!ready) throw new Error("API, MCP e Actions locais não confirmaram prontidão.");

    async function stage(name, args, extraEnvironment, verify) {
      if (signal?.aborted || !alive() || !(await probeFunctions(local.projectUrl, fetchImpl)).ready) {
        throw new Error("Execução interrompida ou funções indisponíveis.");
      }
      const row = report.stages.find(stage => stage.name === name);
      row.result = "running"; report.cleanup.fixtures = "unverified"; await save();
      const started = Date.now();
      const logPath = path.join(privateDirectory, `${name}.log`);
      const result = await run(process.execPath, args, {
        cwd, env: { ...localEnvironment, ...extraEnvironment }, signal, timeoutMs: 1_200_000
      });
      await fs.writeFile(logPath, redact(`${result.stdout || ""}\n${result.stderr || ""}`), { mode: 0o600 });
      row.log_refs = [relative(logPath)]; report.log_refs.push(...row.log_refs);
      row.duration_ms = Date.now() - started; row.exit_code = result.status;
      let receipt;
      try { receipt = await verify(result); }
      catch { receipt = { ok: false, failed_tests: [name], cleanup: "unverified" }; }
      Object.assign(row, receipt, { result: result.status === 0 && receipt.ok ? "passed" : "failed" });
      delete row.ok;
      if (row.result === "failed") {
        report.failed_tests.push(...(receipt.failed_tests?.length ? receipt.failed_tests : [name]));
        await save(); throw new Error(`O gate ${name} falhou; consulte seu log privado redigido.`);
      }
      await save();
    }
    const smokeReceipt = contract => result => {
      if (result.status !== 0) return { ok: false, cleanup: "unverified" };
      const proof = JSON.parse(result.stdout.trim());
      return { ok: proof.contract === contract && proof.cleanup?.completed === true,
        cleanup: proof.cleanup?.completed ? "completed" : "failed" };
    };
    if (ci) {
      report.coverage_provided_by_ci = ["oauth-local", "storage-local", "email-local"];
    } else {
      report.stages.unshift(...["oauth-local", "storage-local", "email-local"].map(name => ({ name, result: "not_run" })));
      const exitReceipt = result => ({ ok: result.status === 0, cleanup: result.status === 0 ? "completed" : "unverified" });
      await stage("oauth-local", ["scripts/runLocalMcpOAuthSmoke.mjs"], {}, exitReceipt);
      await stage("storage-local", ["supabase/tests/course-storage-lifecycle-local-smoke.mjs"], {}, result => {
        const proof = JSON.parse(result.stdout.trim());
        return { ok: result.status === 0 && proof.contract === "aralearn.course-storage-lifecycle-proof.v1" && proof.orphanCollected === true,
          cleanup: result.status === 0 ? "completed" : "unverified" };
      });
      await stage("email-local", ["supabase/tests/auth-email-smoke.mjs"], {}, exitReceipt);
    }
    await stage("current-local", ["supabase/tests/course-authoring-current-local-smoke.mjs"], {},
      smokeReceipt("aralearn.course-authoring-current-proof.v1"));
    await stage("channels-local", ["supabase/tests/course-authoring-channels-local-smoke.mjs"], {},
      smokeReceipt("aralearn.local-authoring-channels-proof.v1"));
    const playwrightPath = path.join(privateDirectory, "playwright.json");
    await stage("e2e-local", ["scripts/runE2eTests.mjs", ...SPECS, "--project=android-chromium", "--workers=1", "--retries=0", "--forbid-only",
      "--reporter=json", `--output=${path.join(privateDirectory, "playwright-results")}`], {
      PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightPath
    }, async () => {
      const source = await fs.readFile(playwrightPath, "utf8");
      await fs.writeFile(playwrightPath, redact(source), { mode: 0o600 });
      return playwrightReceipt(JSON.parse(source));
    });
    const copyPath = path.join(privateDirectory, "copy-files.json");
    await stage("copy-files-local", ["--test", "--test-reporter=tap", "tests/runtime/course-copy-files-local.test.js"], {
      ARALEARN_LOCAL_COPY_PROOF_PATH: copyPath
    }, async result => {
      const proof = JSON.parse(await fs.readFile(copyPath, "utf8"));
      const ok = proof.ok === true && proof.checks?.length === 3 &&
        proof.cleanup?.filter(item => item.courseId && item.status === "completed").length === 2 &&
        proof.cleanup?.some(item => item.userId && item.status === "deleted") &&
        /^# tests 1\s*$/mu.test(result.stdout) && /^# pass 1\s*$/mu.test(result.stdout) && /^# skipped 0\s*$/mu.test(result.stdout);
      return { ok: Boolean(ok), executed: ok ? 1 : 0, cleanup: ok ? "completed" : "unverified" };
    });
    report.cleanup.fixtures = "completed";
    report.result = "passed";
  } catch (error) {
    report.result = "failed";
    report.error = redact(error instanceof Error ? error.message : String(error));
    for (const row of report.stages) if (row.result === "running") {
      row.result = "failed";
      if (!report.failed_tests.includes(row.name)) report.failed_tests.push(row.name);
    }
  } finally {
    if (persistentFingerprint && persistentFingerprint !== await edgeFingerprint(cwd)) {
      report.result = "failed";
      report.error = "O código/configuração de Edge mudou durante a prova persistente; a evidência foi invalidada.";
    }
    if (functions) {
      try { await functions.stop(); report.cleanup.functions = "stopped"; }
      catch (error) { report.result = "failed"; report.cleanup.functions = "failed"; report.cleanup.error = redact(error.message); }
      const functionsLog = path.join(privateDirectory, "functions.log");
      await fs.writeFile(functionsLog, redact(functions.output()), { mode: 0o600 });
      report.log_refs.push(relative(functionsLog));
    }
    report.finished_at = new Date().toISOString();
    await save();
  }
  return JSON.parse(redact(JSON.stringify(report)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on("SIGINT", abort); process.on("SIGTERM", abort);
  try {
    const report = await runLocalIntegration({ signal: controller.signal });
    process.stdout.write(`${JSON.stringify({ result: report.result, failed_tests: report.failed_tests,
      report: ".validation/local-integration.json", cleanup: report.cleanup })}\n`);
    process.exitCode = report.result === "passed" ? 0 : 1;
  } catch {
    process.stderr.write("Não foi possível registrar a prova local. Nenhum resultado deve ser considerado aprovado.\n");
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort);
  }
}
