import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyValidationImpact, isDocumentationPath } from "./validationImpact.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Falha ao consultar Git (${args[0]}).`);
  return result.stdout;
}

export function candidateFiles(root) {
  return [...new Set(git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))].sort();
}

export function changedPaths(root, base) {
  const mergeBase = git(root, ["merge-base", "HEAD", base]).trim();
  return [...new Set([
    ...git(root, ["diff", "--name-only", "--no-renames", "-z", mergeBase, "--"]).split("\0"),
    ...git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")
  ].filter(Boolean))].sort();
}

export function fingerprintInputs(root, files, configuration = {}) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(configuration));
  for (const file of [...files].sort()) {
    hash.update(`\0${file}\0`);
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Input fora do repositório.");
    try {
      const stat = fs.lstatSync(absolute);
      hash.update(String(stat.mode));
      hash.update(stat.isSymbolicLink() ? fs.readlinkSync(absolute) : fs.readFileSync(absolute));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("<deleted>");
    }
  }
  return hash.digest("hex");
}

function selectedBrowserSpecs(args) {
  if (!Array.isArray(args) || args[0] !== "scripts/runE2eTests.mjs") return null;
  const specs = [];
  for (const arg of args.slice(1)) {
    if (/^tests\/e2e\/[A-Za-z0-9_-]+\.spec\.js$/u.test(arg)) specs.push(new RegExp(arg, "i"));
    else if (!/^--(?:retries=\d+|forbid-only|reporter=json)$/u.test(arg)) return null;
  }
  // Sem seleção explícita, ou com outro formato de comando, conservar todas.
  // Playwright interpreta os paths posicionais como regex sem âncoras.
  return specs.length ? specs : null;
}

export function selectGateInputs(files, gate, args = null) {
  if (gate !== "frontend-e2e") return [...files];
  const specs = selectedBrowserSpecs(args);
  // O E2E ordinário usa o runtime web e seus fixtures. Contratos publicados,
  // scripts de build/browser e raízes desconhecidas continuam incluídos.
  return files.filter(file => !isDocumentationPath(file) &&
    (!specs || !/^tests\/e2e\/[^/]+\.spec\.js$/u.test(file) || specs.some(pattern => pattern.test(file))) &&
    !/^(?:android\/|supabase\/(?:migrations|tests)\/|\.github\/workflows\/|tests\/(?:runtime|kernel)\/)/u.test(file) &&
    !/^scripts\/(?:runLocalIntegration\.mjs|validateLocalSupabase\.ps1|validateCandidate\.mjs|classifyCiPaths\.mjs|validationImpact\.mjs|runPreflight\.mjs)$/u.test(file));
}

export function reusableInputReceipt(previous, { root, inputs, step, configuration, fingerprint }) {
  if (previous?.result !== "passed") return false;
  if (previous.fingerprint === fingerprint) return true;
  if (previous.schemaVersion !== 2 || previous.configuration !== configuration ||
      previous.command !== digest(JSON.stringify(step)) || !previous.inputs) return false;
  // A união detecta inputs removidos, além de arquivos novos ou alterados.
  const consumed = selectGateInputs([...new Set([...inputs, ...Object.keys(previous.inputs)])], step.gate, step.args);
  return consumed.every(file => previous.inputs[file] === fingerprintInputs(root, [file]));
}

export function buildCandidatePlan(impact) {
  if (impact.docsOnly) return [
    { gate: "documentation", args: ["scripts/auditDocumentation.mjs"] },
    { gate: "references", args: ["scripts/buildReadableReferences.mjs", "--check"] },
    { gate: "terminology", args: ["scripts/auditTerminology.mjs"] }
  ];
  const gates = [
    { gate: "preflight", args: ["scripts/runPreflight.mjs"] },
    { gate: "lint", args: ["node_modules/eslint/bin/eslint.js", "."] },
    { gate: "runtime-contract", args: ["scripts/validateCourseRuntime.mjs"] }
  ];
  if (impact.runtimeFiles.length) gates.push({ gate: "runtime-focal", args: ["scripts/runTests.mjs", "--focal", ...impact.runtimeFiles] });
  if (impact.requires.supabase) gates.push({ gate: "local-database", command: "pwsh", args: ["-NoProfile", "-File", "scripts/validateLocalSupabase.ps1", "-DatabaseOnly"], reusable: false });
  if (impact.e2eFiles.length) gates.push({
    gate: "frontend-e2e", args: ["scripts/runE2eTests.mjs", ...impact.e2eFiles, "--retries=0", "--forbid-only", "--reporter=json"],
    env: { PLAYWRIGHT_JSON_OUTPUT_NAME: ".validation/frontend-e2e.playwright.json" }
  });
  if (impact.requires.supabase) gates.push({ gate: "local-integration", args: ["scripts/runLocalIntegration.mjs"], reusable: false });
  if (impact.requires.android) gates.push({
    gate: "android", command: process.platform === "win32" ? "cmd.exe" : "bash",
    args: [...(process.platform === "win32" ? ["/d", "/c", "android\\gradlew.bat"] : ["android/gradlew"]), "-p", "android", ":app:assembleDebug", ":app:lintDebug", "--no-daemon"]
  });
  return gates;
}

export function redactOutput(value, env = process.env) {
  let safe = String(value);
  for (const [name, secret] of Object.entries(env)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu.test(name) && secret?.length >= 8) safe = safe.split(secret).join("[REDACTED]");
  }
  return safe.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[REDACTED_JWT]")
    .replace(/(?:sb_secret_|sb_publishable_|ghp_|github_pat_)[A-Za-z0-9_-]+/gu, "[REDACTED_KEY]")
    .replace(/(Bearer\s+)[^\s"']+/giu, "$1[REDACTED]");
}

export async function executeGate(step, { root, logPath, env = process.env }) {
  const childEnv = { ...env, ...step.env };
  const fd = fs.openSync(logPath, "w");
  const failedTests = [];
  let pending = "";
  const write = (chunk, flush = false) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/u);
    pending = flush ? "" : lines.pop();
    for (const line of lines) {
      const safe = redactOutput(line, childEnv);
      fs.writeSync(fd, `${safe}\n`);
      if (/^\s*(?:not ok |✖ |× |\d+\) |Error:)/u.test(safe) && failedTests.length < 20) failedTests.push(safe.slice(0, 300));
    }
  };
  let exitCode;
  try {
    exitCode = await new Promise((resolve) => {
      const child = spawn(step.command || process.execPath, step.args, { cwd: root, env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => write(chunk.toString()));
      child.stderr.on("data", (chunk) => write(chunk.toString()));
      child.on("error", () => resolve(1));
      child.on("close", (code) => resolve(code ?? 1));
    });
  } finally {
    write("", true);
    fs.closeSync(fd);
  }
  return { result: exitCode === 0 ? "passed" : "failed", exitCode, failed_tests: failedTests };
}

export function verifyBrowserReport(report) {
  const stats = report?.stats;
  if (!stats || !(stats.expected > 0) || stats.unexpected !== 0 || stats.skipped !== 0 || stats.flaky !== 0 || report.errors?.length) {
    throw new Error("E2E obrigatório ausente, pulado, instável ou malsucedido.");
  }
  return { passed: stats.expected, skipped: stats.skipped };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function configuration(env) {
  const relevant = Object.entries(env).filter(([name]) => /^(?:ARALEARN_|SUPABASE_|PLAYWRIGHT_|ANDROID_|GRADLE_|JAVA_HOME$|PATH$|NODE_OPTIONS$|TZ$|CI$)/iu.test(name)).sort();
  return { node: process.version, platform: process.platform, arch: process.arch, environment: digest(JSON.stringify(relevant)) };
}

export async function validateCandidate({ root = repositoryRoot, base = "origin/main", planOnly = false, force = false, execute = executeGate, env = process.env } = {}) {
  const paths = changedPaths(root, base);
  if (!paths.length) throw new Error("Nenhuma alteração em relação à base; escolha a base da candidata existente.");
  const impact = classifyValidationImpact(paths, { root });
  const gates = buildCandidatePlan(impact);
  if (planOnly) return { scope: "preparation", base, paths, impact, gates };
  const output = path.join(root, ".validation");
  fs.mkdirSync(output, { recursive: true });
  const lockPath = path.join(output, "candidate.lock");
  let lock;
  try { lock = fs.openSync(lockPath, "wx"); } catch { throw new Error("Outra validação possui .validation/candidate.lock. Confira o processo antes de remover um lock abandonado."); }
  fs.writeSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  try {
    const config = configuration(env);
    const files = candidateFiles(root);
    const dependencyState = "node_modules/.package-lock.json";
    const inputs = [...files, dependencyState];
    const tree = fingerprintInputs(root, files);
    const report = { schemaVersion: 1, scope: "preparation", tree, configuration: digest(JSON.stringify(config)), base, paths, impact, result: "passed", gates: [], failed_tests: [], log_refs: [] };
    for (const step of gates) {
      const fingerprint = fingerprintInputs(root, selectGateInputs(inputs, step.gate, step.args), { config, step });
      const receiptPath = path.join(output, `${step.gate}.receipt.json`);
      const previous = readJson(receiptPath);
      if (!force && step.reusable !== false && reusableInputReceipt(previous, { root, inputs, step, configuration: report.configuration, fingerprint })) {
        report.gates.push({ ...previous, reused: true });
        continue;
      }
      if (step.env?.PLAYWRIGHT_JSON_OUTPUT_NAME) fs.rmSync(path.join(root, step.env.PLAYWRIGHT_JSON_OUTPUT_NAME), { force: true });
      const logRef = `.validation/${step.gate}.log`;
      const started = Date.now();
      const effectiveStep = step.gate === "local-integration" && env.ARALEARN_LOCAL_FUNCTIONS_EXISTING === "1"
        ? { ...step, args: [...step.args, "--functions-existing", "--base", base] } : step;
      let result;
      try { result = await execute(effectiveStep, { root, logPath: path.join(root, logRef), env }); }
      catch (error) { result = { result: "failed", exitCode: 1, failed_tests: [redactOutput(error.message, env)] }; }
      if (result.result === "passed" && step.gate === "frontend-e2e") {
        try { result.tests = verifyBrowserReport(readJson(path.join(root, step.env.PLAYWRIGHT_JSON_OUTPUT_NAME))); }
        catch (error) { result.result = "failed"; result.failed_tests = [error.message]; }
      }
      if (fingerprintInputs(root, selectGateInputs([...candidateFiles(root), dependencyState], step.gate, step.args), { config, step }) !== fingerprint) {
        result.result = "failed";
        result.failed_tests = [...(result.failed_tests || []), "Inputs mudaram durante a prova; execute novamente."];
      }
      const indexed = step.gate === "frontend-e2e" ? {
        command: digest(JSON.stringify(step)),
        inputs: Object.fromEntries(selectGateInputs(inputs, step.gate, step.args).map(file => [file, fingerprintInputs(root, [file])]))
      } : {};
      const receipt = { schemaVersion: step.gate === "frontend-e2e" ? 2 : 1, scope: "preparation", gate: step.gate, fingerprint, tree, configuration: report.configuration, ...indexed, ...result, elapsedMs: Date.now() - started, finishedAt: new Date().toISOString(), log_refs: [logRef] };
      fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      report.gates.push(receipt);
      if (receipt.result !== "passed") {
        report.result = "failed";
        report.failed_tests = receipt.failed_tests || [];
        report.log_refs = receipt.log_refs;
        break;
      }
    }
    fs.writeFileSync(path.join(output, "candidate.json"), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

export function assertReadyIdentity({ result, clean, localHead, remoteHead, baseBranch, draft }) {
  if (result !== "passed" || !clean || !localHead || localHead !== remoteHead || baseBranch !== "main" || !draft) {
    throw new Error("PR pronto exige preparação verde, árvore limpa, HEAD remoto idêntico, base main e PR em rascunho.");
  }
}

function readyPullRequest(root) {
  const query = spawnSync("gh", ["pr", "view", "--json", "number,headRefOid,baseRefName,baseRefOid,isDraft"], { cwd: root, encoding: "utf8" });
  if (query.status !== 0) throw new Error("Crie e envie o PR em rascunho antes de candidate:ready.");
  return JSON.parse(query.stdout);
}

export function assertReadyBase(selectedMergeBase, pullRequestMergeBase) {
  if (!selectedMergeBase || selectedMergeBase !== pullRequestMergeBase) throw new Error("A preparação precisa cobrir o delta inteiro do PR contra sua base real.");
}

function markReady(root, report, preparedPr) {
  const pr = readyPullRequest(root);
  const clean = !git(root, ["status", "--porcelain", "--untracked-files=normal"]).trim();
  assertReadyIdentity({ result: report.result, clean, localHead: git(root, ["rev-parse", "HEAD"]).trim(), remoteHead: pr.headRefOid, baseBranch: pr.baseRefName, draft: pr.isDraft });
  if (pr.number !== preparedPr.number || pr.baseRefOid !== preparedPr.baseRefOid) throw new Error("A base do PR mudou durante a preparação; atualize e execute novamente.");
  if (fingerprintInputs(root, candidateFiles(root)) !== report.tree) throw new Error("Árvore mudou após a preparação.");
  const ready = spawnSync("gh", ["pr", "ready", String(pr.number)], { cwd: root, stdio: "inherit" });
  if (ready.status !== 0) throw new Error("GitHub não confirmou a transição do PR para pronto.");
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    let ready = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--base" && args[i + 1] && !args[i + 1].startsWith("-")) options.base = args[++i];
      else if (args[i] === "--plan") options.planOnly = true;
      else if (args[i] === "--force") options.force = true;
      else if (args[i] === "--ready") ready = true;
      else throw new Error("Uso: validate:candidate [--base origin/main] [--plan] [--force] [--ready].");
    }
    if (ready && options.planOnly) throw new Error("--plan não pode marcar PR pronto.");
    let preparedPr;
    if (ready) {
      preparedPr = readyPullRequest(repositoryRoot);
      const selected = git(repositoryRoot, ["merge-base", "HEAD", options.base || preparedPr.baseRefOid]).trim();
      const actual = git(repositoryRoot, ["merge-base", "HEAD", preparedPr.baseRefOid]).trim();
      assertReadyBase(selected, actual);
      options.base = preparedPr.baseRefOid;
      assertReadyIdentity({ result: "passed", clean: !git(repositoryRoot, ["status", "--porcelain", "--untracked-files=normal"]).trim(), localHead: git(repositoryRoot, ["rev-parse", "HEAD"]).trim(), remoteHead: preparedPr.headRefOid, baseBranch: preparedPr.baseRefName, draft: preparedPr.isDraft });
    }
    const report = await validateCandidate(options);
    if (ready && report.result === "passed") markReady(repositoryRoot, report, preparedPr);
    process.stdout.write(`${JSON.stringify(options.planOnly ? report : { result: report.result, scope: report.scope, categories: report.impact.categories, gates: report.gates.map(({ gate, result, reused = false, elapsedMs }) => ({ gate, result, reused, elapsedMs })), failed_tests: report.failed_tests, log_refs: report.log_refs, report: ".validation/candidate.json" }, null, 2)}\n`);
    process.exitCode = report.result && report.result !== "passed" ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${redactOutput(error.message)}\n`);
    process.exitCode = 1;
  }
}
