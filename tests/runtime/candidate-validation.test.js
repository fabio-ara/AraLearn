import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertReadyBase, assertReadyIdentity, buildCandidatePlan, executeGate, fingerprintInputs,
  redactOutput, reusableInputReceipt, selectGateInputs, validateCandidate, verifyBrowserReport
} from "../../scripts/validateCandidate.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-candidate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["tests/kernel", "tests/runtime", "tests/e2e", "docs"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, ".gitignore"), ".validation/\nnode_modules/\n");
  fs.writeFileSync(path.join(root, "docs/guide.md"), "before\n");
  for (const args of [["init", "-q"], ["add", "."], ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "base"]]) {
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  }
  fs.writeFileSync(path.join(root, "docs/guide.md"), "after\n");
  return root;
}

test("preparação reutiliza somente sucesso com inputs idênticos; falha interrompe gates seguintes", async t => {
  const root = fixture(t);
  let calls = 0;
  const execute = async () => { calls++; return { result: "passed", exitCode: 0 }; };
  const first = await validateCandidate({ root, base: "HEAD", execute, env: {} });
  assert.equal(first.result, "passed");
  assert.equal(calls, 3);
  const second = await validateCandidate({ root, base: "HEAD", execute, env: {} });
  assert.equal(calls, 3);
  assert.ok(second.gates.every(gate => gate.reused));
  fs.writeFileSync(path.join(root, "docs/guide.md"), "third\n");
  const failed = await validateCandidate({ root, base: "HEAD", execute: async () => ({ result: "failed", exitCode: 7, failed_tests: ["regression"] }), env: {} });
  assert.equal(failed.result, "failed");
  assert.equal(failed.gates.length, 1);
  assert.deepEqual(failed.failed_tests, ["regression"]);
  await validateCandidate({ root, base: "HEAD", execute, env: {} });
  assert.equal(calls, 6, "falha não é cacheável; os demais recibos antigos também foram invalidados");
});

test("mudança de configuração ou inputs durante execução invalida sucesso", async t => {
  const root = fixture(t);
  const execute = async () => ({ result: "passed", exitCode: 0 });
  await validateCandidate({ root, base: "HEAD", execute, env: { ARALEARN_MODE: "a" } });
  const changedConfig = await validateCandidate({ root, base: "HEAD", execute, env: { ARALEARN_MODE: "b" } });
  assert.ok(changedConfig.gates.every(gate => !gate.reused));
  const changedDuringGate = await validateCandidate({ root, base: "HEAD", force: true, env: {}, execute: async () => {
    fs.writeFileSync(path.join(root, "docs/new.md"), "new input");
    return { result: "passed", exitCode: 0 };
  } });
  assert.equal(changedDuringGate.result, "failed");
  assert.match(changedDuringGate.failed_tests[0], /Inputs mudaram/u);
});

test("fingerprint detecta exclusão, conteúdo e modo; não aceita arquivo externo", t => {
  const root = fixture(t);
  const files = ["docs/guide.md"];
  const before = fingerprintInputs(root, files);
  fs.unlinkSync(path.join(root, files[0]));
  assert.notEqual(fingerprintInputs(root, files), before);
  assert.throws(() => fingerprintInputs(root, ["../outside"]), /fora/u);
});

test("E2E reutiliza prova após texto documental e invalida após alteração de CSS", t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "public"));
  fs.writeFileSync(path.join(root, "public/styles.css"), "body { color: black; }\n");
  const files = ["docs/guide.md", "public/styles.css", ".gitignore"];
  const frontendInputs = selectGateInputs(files, "frontend-e2e");
  const frontendBefore = fingerprintInputs(root, frontendInputs);
  const preflightBefore = fingerprintInputs(root, selectGateInputs(files, "preflight"));
  fs.writeFileSync(path.join(root, "docs/guide.md"), "documentação corrigida\n");
  assert.equal(fingerprintInputs(root, frontendInputs), frontendBefore);
  assert.notEqual(fingerprintInputs(root, selectGateInputs(files, "preflight")), preflightBefore);
  fs.writeFileSync(path.join(root, "public/styles.css"), "body { color: blue; }\n");
  assert.notEqual(fingerprintInputs(root, frontendInputs), frontendBefore);
});

test("seleção E2E conserva contratos, scripts e raízes desconhecidas; demais gates conservam tudo", () => {
  const irrelevant = ["README.md", "docs/guide.md", "android/app/build.gradle.kts",
    "supabase/migrations/new.sql", "supabase/tests/new.sql", ".github/workflows/validacao.yml",
    "scripts/runLocalIntegration.mjs", "scripts/validateLocalSupabase.ps1", "scripts/validateCandidate.mjs",
    "tests/runtime/local-integration-runner.test.js"];
  const relevant = ["public/styles.css", "src/ui/Example.js", "tests/e2e/example.spec.js",
    "scripts/runE2eTests.mjs", "scripts/new.mjs", "package-lock.json", "playwright.config.js",
    "docs/autoria-mcp.md", "docs/downloads/aralearn-chatgpt-action-openapi.yaml",
    "supabase/functions/_shared/example.js", "unknown/input.txt", ".github/actions/custom/action.yml"];
  const files = [...irrelevant, ...relevant];
  assert.deepEqual(selectGateInputs(files, "frontend-e2e"), relevant);
  for (const gate of ["preflight", "lint", "runtime-focal", "unknown-gate"]) {
    assert.deepEqual(selectGateInputs(files, gate), files);
  }
});

test("specs E2E seguem a seleção efetiva e comandos desconhecidos conservam todos os inputs", () => {
  const selected = "tests/e2e/example.spec.js";
  const unselected = "tests/e2e/course-authoring-context-local.spec.js";
  const regexOverlap = "tests/e2e/example.spec.js-extra.spec.js";
  const files = [selected, unselected, regexOverlap, "tests/e2e/helper.js", "tests/fixtures/course.json",
    "tests/helpers/browser.js", "scripts/runE2eTests.mjs", "unknown/input.js"];
  const args = ["scripts/runE2eTests.mjs", selected, "--retries=0", "--forbid-only", "--reporter=json"];
  assert.deepEqual(selectGateInputs(files, "frontend-e2e", args), files.filter(file => file !== unselected));
  for (const alternate of [null, ["scripts/runE2eTests.mjs", "--reporter=json"],
    [...args, "--config=custom.config.js"], ["another-runner.mjs", selected]]) {
    assert.deepEqual(selectGateInputs(files, "frontend-e2e", alternate), files);
  }
  assert.deepEqual(selectGateInputs(files, "runtime-focal", args), files);
});

test("recibo indexado ignora spec não selecionada e invalida spec, fixture, seleção e novos inputs consumidos", t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "tests/fixtures"));
  const selected = "tests/e2e/example.spec.js";
  const unselected = "tests/e2e/course-authoring-context-local.spec.js";
  const fixturePath = "tests/fixtures/course.json";
  const files = [selected, unselected, fixturePath];
  for (const file of files) fs.writeFileSync(path.join(root, file), "before\n");
  const step = { gate: "frontend-e2e", args: ["scripts/runE2eTests.mjs", selected, "--retries=0", "--forbid-only", "--reporter=json"] };
  // Simula o formato indexado anterior, que guardava também as specs não executadas.
  const previous = {
    schemaVersion: 2, result: "passed", configuration: "same-configuration", fingerprint: "previous-wide-fingerprint",
    command: createHash("sha256").update(JSON.stringify(step)).digest("hex"),
    inputs: Object.fromEntries(files.map(file => [file, fingerprintInputs(root, [file])]))
  };
  const reusable = (inputs = files, nextStep = step) => reusableInputReceipt(previous, {
    root, inputs, step: nextStep, configuration: previous.configuration, fingerprint: "new-selected-fingerprint"
  });
  fs.writeFileSync(path.join(root, unselected), "integration-only repair\n");
  assert.equal(reusable(), true);
  assert.equal(reusable(files, { ...step, args: [...step.args, unselected] }), false, "a seleção faz parte do hash do comando");
  fs.writeFileSync(path.join(root, selected), "browser assertion changed\n");
  assert.equal(reusable(), false);
  fs.writeFileSync(path.join(root, selected), "before\n");
  fs.writeFileSync(path.join(root, fixturePath), "fixture changed\n");
  assert.equal(reusable(), false);
  fs.writeFileSync(path.join(root, fixturePath), "before\n");
  const added = "tests/e2e/example.spec.js-extra.spec.js";
  fs.writeFileSync(path.join(root, added), "new matching spec\n");
  assert.equal(reusable([...files, added]), false, "nova spec que casa com a regex também é consumida");
  fs.unlinkSync(path.join(root, selected));
  assert.equal(reusable(files.filter(file => file !== selected)), false, "a união conserva a origem removida");
});

test("recibo E2E conserva prova após reparo exclusivo da integração e invalida CSS", async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "public"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.writeFileSync(path.join(root, "public/styles.css"), "body {color:black}");
  fs.writeFileSync(path.join(root, "tests/e2e/example.spec.js"), "// ordinary browser fixture");
  let browsers = 0;
  const execute = async step => {
    if (step.gate === "frontend-e2e") {
      browsers++;
      fs.writeFileSync(path.join(root, step.env.PLAYWRIGHT_JSON_OUTPUT_NAME), JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 }, errors: [] }));
    }
    return { result: "passed", exitCode: 0 };
  };
  await validateCandidate({ root, base: "HEAD", execute, env: {} });
  assert.equal(browsers, 1);
  fs.writeFileSync(path.join(root, "scripts/runLocalIntegration.mjs"), "// migration precondition repaired");
  const reused = await validateCandidate({ root, base: "HEAD", execute, env: {} });
  assert.equal(browsers, 1);
  assert.equal(reused.gates.find(gate => gate.gate === "frontend-e2e").reused, true);
  const previous = JSON.parse(fs.readFileSync(path.join(root, ".validation/frontend-e2e.receipt.json"), "utf8"));
  assert.equal(reusableInputReceipt(previous, { root, inputs: Object.keys(previous.inputs), step: { args: ["different command"] }, configuration: previous.configuration, fingerprint: "different" }), false);
  fs.writeFileSync(path.join(root, "public/styles.css"), "body {color:blue}");
  await validateCandidate({ root, base: "HEAD", execute, env: {} });
  assert.equal(browsers, 2);
  await validateCandidate({ root, base: "HEAD", execute, env: { ARALEARN_MODE: "changed" } });
  assert.equal(browsers, 3);
});

test("planejamento não executa comandos nem grava recibo e lock impede concorrência", async t => {
  const root = fixture(t);
  const plan = await validateCandidate({ root, base: "HEAD", planOnly: true });
  assert.equal(plan.scope, "preparation");
  assert.equal(fs.existsSync(path.join(root, ".validation")), false);
  fs.mkdirSync(path.join(root, ".validation"));
  fs.writeFileSync(path.join(root, ".validation/candidate.lock"), "owner");
  await assert.rejects(validateCandidate({ root, base: "HEAD" }), /Outra validação/u);
});

test("impacto visual não prepara banco; integração mutável não usa cache de PASS", () => {
  const visual = { docsOnly: false, runtimeFiles: ["tests/runtime/ui.test.js"], e2eFiles: ["tests/e2e/ui.spec.js"], requires: { supabase: false } };
  assert.equal(buildCandidatePlan(visual).some(gate => gate.gate === "local-integration"), false);
  assert.equal(buildCandidatePlan({ ...visual, requires: { supabase: true } }).at(-1).reusable, false);
});

test("falhas de frontend e Android não executam banco; retomada conserva provas e exige banco fresco", async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "src/ui"), { recursive: true });
  fs.mkdirSync(path.join(root, "android"));
  fs.writeFileSync(path.join(root, "src/ui/example.js"), "export const example = 1;");
  fs.writeFileSync(path.join(root, "android/build.gradle"), "// candidate");
  fs.writeFileSync(path.join(root, "tests/e2e/example.spec.js"), "// ordinary browser fixture");
  let failing = "frontend-e2e";
  let calls = [];
  const execute = async step => {
    calls.push(step.gate);
    if (step.gate === failing) return { result: "failed", exitCode: 1 };
    if (step.gate === "frontend-e2e") {
      fs.writeFileSync(path.join(root, step.env.PLAYWRIGHT_JSON_OUTPUT_NAME), JSON.stringify({
        stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 }, errors: []
      }));
    }
    return { result: "passed", exitCode: 0 };
  };
  const run = () => validateCandidate({ root, base: "HEAD", execute, env: {} });
  assert.equal((await run()).result, "failed");
  assert.equal(calls.includes("local-database"), false);
  assert.equal(calls.includes("local-integration"), false);
  failing = "android";
  calls = [];
  assert.equal((await run()).result, "failed");
  assert.deepEqual(calls, ["frontend-e2e", "android"]);
  failing = null;
  calls = [];
  assert.equal((await run()).result, "passed");
  assert.deepEqual(calls, ["android", "local-database", "local-integration"]);
  calls = [];
  assert.equal((await run()).result, "passed");
  assert.deepEqual(calls, ["local-database", "local-integration"], "estado mutável exige nova prova mesmo com bytes idênticos");
});

test("processo real preserva exit code e escreve log redigido sem saída narrativa", async t => {
  const root = fixture(t);
  const logPath = path.join(root, "test.log");
  const result = await executeGate({ args: ["-e", "console.log('not ok 1 - regression'); console.error(process.env.TEST_TOKEN); process.exit(7)"] }, { root, logPath, env: { TEST_TOKEN: "sensitive-value-123" } });
  assert.equal(result.exitCode, 7);
  assert.equal(result.result, "failed");
  assert.match(fs.readFileSync(logPath, "utf8"), /REDACTED/u);
  assert.doesNotMatch(fs.readFileSync(logPath, "utf8"), /sensitive-value/u);
  assert.deepEqual(result.failed_tests, ["not ok 1 - regression"]);
  assert.equal(redactOutput("Bearer abcdefg"), "Bearer [REDACTED]");
});

test("E2E obrigatório exige execução, zero skip, zero retry instável e zero erro", () => {
  const pass = { stats: { expected: 3, unexpected: 0, skipped: 0, flaky: 0 }, errors: [] };
  assert.equal(verifyBrowserReport(pass).passed, 3);
  for (const stats of [null, { ...pass.stats, expected: 0 }, { ...pass.stats, skipped: 1 }, { ...pass.stats, unexpected: 1 }, { ...pass.stats, flaky: 1 }]) {
    assert.throws(() => verifyBrowserReport({ stats }));
  }
});

test("ready exige prova verde e identidade exata do PR sem substituir integral", () => {
  assert.doesNotThrow(() => assertReadyBase("full-pr-base", "full-pr-base"));
  assert.throws(() => assertReadyBase("only-last-document-commit", "full-pr-base"), /delta inteiro/u);
  const valid = { result: "passed", clean: true, localHead: "abc", remoteHead: "abc", baseBranch: "main", draft: true };
  assert.doesNotThrow(() => assertReadyIdentity(valid));
  for (const mutation of [{ result: "failed" }, { clean: false }, { remoteHead: "def" }, { draft: false }, { baseBranch: "release/other" }]) {
    assert.throws(() => assertReadyIdentity({ ...valid, ...mutation }));
  }
});

test("Android aplicável compila e analisa antes de pronto; E2E recusa test.only", () => {
  const gates = buildCandidatePlan({ docsOnly: false, runtimeFiles: [], e2eFiles: ["tests/e2e/ui.spec.js"], requires: { android: true, supabase: true } });
  assert.ok(gates.find(gate => gate.gate === "frontend-e2e").args.includes("--forbid-only"));
  assert.ok(gates.find(gate => gate.gate === "local-database").args.includes("-DatabaseOnly"));
  const android = gates.find(gate => gate.gate === "android");
  assert.ok(android.args.includes(":app:assembleDebug"));
  assert.ok(android.args.includes(":app:lintDebug"));
});
