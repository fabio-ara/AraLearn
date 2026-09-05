import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveTestFiles } from "../../scripts/runTests.mjs";

const runnerUrl = new URL("../../scripts/runTests.mjs", import.meta.url);
const runnerPath = fileURLToPath(runnerUrl);
const repositoryRoot = path.resolve(path.dirname(runnerPath), "..");

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-test-runner-"));
  fs.mkdirSync(path.join(root, "tests/kernel"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests/runtime"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n');
  fs.writeFileSync(path.join(root, "tests/kernel/pass.test.js"),
    'import test from "node:test"; test("selected passes", () => {});\n');
  fs.writeFileSync(path.join(root, "tests/runtime/fail.test.js"),
    'import test from "node:test"; test("unselected fails", () => { throw new Error("expected failure"); });\n');
  fs.writeFileSync(path.join(root, "tests/runtime/helper.js"), 'throw new Error("not a test");\n');
  return root;
}

function executeFixture(root, args) {
  const env = { ...process.env };
  // A fixture inicia outro runner completo, fora do protocolo do teste-pai.
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `import { runTests } from ${JSON.stringify(runnerUrl.href)}; process.exitCode = runTests(${JSON.stringify(args)}, ${JSON.stringify(root)});`
  ], { cwd: root, encoding: "utf8", env });
}

test("runner mantém integral por padrão e seleciona arquivos explícitos sem duplicação", () => {
  const root = fixtureRoot();
  try {
    const integral = resolveTestFiles([], root);
    assert.deepEqual(integral, [
      path.join(root, "tests/kernel/pass.test.js"),
      path.join(root, "tests/runtime/fail.test.js")
    ]);
    assert.deepEqual(resolveTestFiles([
      "--focal", "tests/kernel/pass.test.js", "tests/kernel/pass.test.js"
    ], root), [integral[0]]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runner focal real não executa arquivo fora da seleção e integral propaga a falha", () => {
  const root = fixtureRoot();
  try {
    const focal = executeFixture(root, ["--focal", "tests/kernel/pass.test.js"]);
    assert.equal(focal.status, 0, focal.stderr + focal.stdout);
    assert.match(focal.stdout, /modo focal, 1 arquivo/u);
    assert.match(focal.stdout, /selected passes/u);
    assert.doesNotMatch(focal.stdout, /unselected fails/u);

    const integral = executeFixture(root, []);
    assert.equal(integral.status, 1, integral.stderr + integral.stdout);
    assert.match(integral.stdout, /modo integral, 2 arquivo/u);
    assert.match(integral.stdout, /unselected fails/u);

    const failedFocal = executeFixture(root, ["--focal", "tests/runtime/fail.test.js"]);
    assert.equal(failedFocal.status, 1, failedFocal.stderr + failedFocal.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("seleção vazia, desconhecida ou fora das suítes falha antes de iniciar testes", () => {
  for (const args of [
    ["--focal"],
    ["--unknown"],
    ["--focal", "tests/runtime/does-not-exist.test.js"],
    ["--focal", "tests/runtime"],
    ["--focal", "package.json"],
    ["--focal", "../outside.test.js"]
  ]) {
    const result = spawnSync(process.execPath, [runnerPath, ...args], {
      cwd: repositoryRoot, encoding: "utf8"
    });
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /Uso:|Teste focal não encontrado/u);
    assert.doesNotMatch(result.stdout, /TAP version|Testes: modo/u);
  }
});
