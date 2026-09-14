import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  classifyChangedPaths,
  classifyCiImpact,
  classifyGitDiff,
  parseGitDiffPaths,
  isDocumentationPath
} from "../../scripts/classifyCiPaths.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const classifierPath = path.join(repositoryRoot, "scripts", "classifyCiPaths.mjs");
const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);

function gates(paths, options = {}) {
  return classifyCiImpact(paths, { baseSha: BASE_SHA, headSha: HEAD_SHA, ...options }).applicability.gates;
}

test("matriz de gates representa impactos focais e amplia unknown ou orquestração", () => {
  const packageAfter = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
  const packageBefore = JSON.stringify({ ...packageAfter, version: "999.999.999" });
  const androidAfter = fs.readFileSync(path.join(repositoryRoot, "android/app/build.gradle.kts"), "utf8");
  const androidBefore = androidAfter.replace(/versionCode = (\d+)/u, (_match, value) => `versionCode = ${Number(value) - 1}`)
    .replace(/versionName = "\d+\.\d+\.\d+"/u, 'versionName = "999.999.999"');
  const scenarios = [
    ["documentação", ["docs/arquitetura.md"], { preparation: true, web: false, android: false, supabase: false }],
    ["metadado de release", ["package.json", "android/app/build.gradle.kts"],
      { preparation: true, web: false, android: false, supabase: false },
      { readBase: file => file === "package.json" ? packageBefore : androidBefore }],
    ["runner", ["scripts/runTests.mjs"], { preparation: true, web: true, android: true, supabase: true }],
    ["verificador", ["scripts/verifyPublishedSite.mjs"], { preparation: true, web: true, android: false, supabase: false }],
    ["CSS", ["public/styles.css"], { preparation: true, web: true, android: false, supabase: false }],
    ["Android", ["android/app/build.gradle.kts"], { preparation: true, web: false, android: true, supabase: false }],
    ["migration", ["supabase/migrations/20260909000000_example.sql"], { preparation: true, web: true, android: false, supabase: true }],
    ["Edge Function", ["supabase/functions/aralearn-course-api/index.ts"], { preparation: true, web: true, android: false, supabase: true }],
    ["runtime compartilhado", ["src/domain/courseSources.js"], { preparation: true, web: true, android: false, supabase: true }],
    ["unknown", ["unknown/input.bin"], { preparation: true, web: true, android: true, supabase: true }],
    ["web + backend", ["public/styles.css", "supabase/functions/aralearn-course-api/index.ts"],
      { preparation: true, web: true, android: false, supabase: true }]
  ];
  for (const [name, paths, expected, options] of scenarios) {
    assert.deepEqual(gates(paths, options), expected, name);
  }
});

test("classificação inconclusiva exige integral e conserva a identidade do delta", () => {
  const result = classifyCiImpact(["docs/arquitetura.md"], {
    baseSha: BASE_SHA, headSha: HEAD_SHA, conclusive: false
  });
  assert.deepEqual(result.applicability.gates, { preparation: true, web: true, android: true, supabase: true });
  assert.deepEqual(result.applicability.source, { baseSha: BASE_SHA, headSha: HEAD_SHA });
  assert.equal(result.applicability.classification.conclusive, false);
});

test("classificador aceita somente conteúdo documental reconhecido", () => {
  assert.equal(classifyChangedPaths(["docs/principios-editoriais.md"]), true);
  assert.equal(classifyChangedPaths([
    "README.md",
    "LICENSE.md",
    "docs/arquitetura.md",
    "docs/avaliação-metodológica.md",
    "docs/referencias.bib",
    "docs/evidence/registro-buscas-bibliograficas.csv",
    "ux-atlas/FINAL-UX-CONTRACT.md"
  ]), true);
});

test("classificador envia qualquer alteração executável ao pipeline integral", () => {
  assert.equal(classifyChangedPaths(["docs/README.md", "src/ui/CourseAuthoringSurface.js"]), false);
  assert.equal(classifyChangedPaths([
    "docs/principios-editoriais.md",
    "supabase/migrations/20260825000000_example.sql"
  ]), false);
  assert.equal(classifyChangedPaths([".github/workflows/validacao.yml"]), false);
  assert.equal(classifyChangedPaths(["unknown/content.txt"]), false);
});

test("contratos, instruções e artefatos documentais não dispensam validação de runtime", () => {
  for (const repositoryPath of [
    "docs/aralearn-contract.md",
    "docs/autoria-actions.md",
    "docs/autoria-mcp.md",
    "docs/downloads/aralearn-chatgpt-action-openapi.yaml",
    "docs/downloads/instrucoes.md",
    "docs/instructions/runtime.md",
    "docs/AGENTS.md",
    "docs/SKILL.md",
    "AGENTS.override.md",
    "UNKNOWN.md"
  ]) {
    assert.equal(isDocumentationPath(repositoryPath), false, repositoryPath);
    assert.equal(classifyChangedPaths(["docs/README.md", repositoryPath]), false, repositoryPath);
  }
});

test("segurança, migrations, componentes compartilhados, dependências e CI ampliam o gate", () => {
  for (const repositoryPath of [
    "supabase/functions/_shared/aralearn-authoring/security.js",
    "supabase/migrations/20260905000000_access.sql",
    "src/resources/kernel/packageRegistry.js",
    "src/resources/sdk/practice.js",
    "package.json",
    "package-lock.json",
    "deno.lock",
    "android/gradle/wrapper/gradle-wrapper.properties",
    ".github/workflows/validacao.yml",
    "scripts/classifyCiPaths.mjs",
    "scripts/runTests.mjs"
  ]) {
    assert.equal(classifyChangedPaths([repositoryPath]), false, repositoryPath);
  }
});

test("classificador rejeita entrada ausente ou ambígua", () => {
  assert.equal(classifyChangedPaths([]), false);
  assert.equal(isDocumentationPath("docs\\principios-editoriais.md"), false);
  assert.equal(isDocumentationPath("docs/../src/runtime.md"), false);
  assert.equal(isDocumentationPath("/docs/principios-editoriais.md"), false);
  assert.equal(isDocumentationPath(" docs/principios-editoriais.md"), false);
});

test("diff considera exclusões e não permite que renomeação ou mudança de tipo esconda runtime", () => {
  assert.equal(classifyGitDiff("M\0docs/arquitetura.md\0D\0docs/uso-do-app.md\0"), true);
  assert.equal(classifyGitDiff("D\0src/runtime.js\0A\0docs/runtime.md\0"), false);
  assert.equal(classifyGitDiff("M\0docs/README.md\0T\0README.md\0"), false);
  assert.equal(classifyGitDiff("R100\0src/runtime.js\0docs/runtime.md\0"), false);
  assert.equal(classifyGitDiff("U\0README.md\0"), false);
  assert.equal(classifyGitDiff("M\0docs/README.md"), false);
  assert.equal(classifyGitDiff(""), false);
  assert.deepEqual(parseGitDiffPaths("D\0src/runtime.js\0A\0docs/runtime.md\0"), ["src/runtime.js", "docs/runtime.md"]);
  assert.equal(parseGitDiffPaths("R100\0src/runtime.js\0docs/runtime.md\0"), null);
  assert.equal(parseGitDiffPaths("M\0../README.md\0"), null);
});

test("interface de linha de comando produz docs_only booleano", () => {
  const docsOnly = spawnSync(process.execPath, [classifierPath, "--stdin"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: "docs/principios-editoriais.md\ndocs/referencias.bib\n"
  });
  assert.equal(docsOnly.status, 0, docsOnly.stderr);
  assert.equal(docsOnly.stdout, "docs_only=true\n");

  const safeFallback = spawnSync(process.execPath, [classifierPath, "--stdin"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: "docs/principios-editoriais.md\n.github/workflows/validacao.yml\n"
  });
  assert.equal(safeFallback.status, 0, safeFallback.stderr);
  assert.equal(safeFallback.stdout, "docs_only=false\n");
});

test("falha na leitura do evento do GitHub produz fallback integral", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-ci-paths-"));
  try {
    const outputPath = path.join(temporaryRoot, "github-output.txt");
    const result = spawnSync(process.execPath, [classifierPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: path.join(temporaryRoot, "missing-event.json"),
        GITHUB_OUTPUT: outputPath
      }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Classificação inconclusiva; usando pipeline integral/u);
    const outputs = Object.fromEntries(fs.readFileSync(outputPath, "utf8").trim().split("\n").map(line => {
      const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1)];
    }));
    assert.equal(outputs.docs_only, "false");
    assert.equal(outputs.requires_supabase, "true");
    assert.equal(outputs.requires_web, "true");
    assert.equal(outputs.requires_android, "true");
    assert.ok(Object.values(JSON.parse(outputs.applicability).gates).every(Boolean));
    assert.equal(outputs.categories, '["unknown"]');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI JSON expõe seleção completa e outputs de impacto sem alterar stdout histórico", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-ci-impact-"));
  try {
    const outputPath = path.join(temporaryRoot, "github-output.txt");
    const result = spawnSync(process.execPath, [classifierPath, "--stdin", "--json"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: "public/styles.css\n",
      env: { ...process.env, GITHUB_OUTPUT: outputPath }
    });
    assert.equal(result.status, 0, result.stderr);
    const impact = JSON.parse(result.stdout);
    assert.equal(impact.schemaVersion, 1);
    assert.deepEqual(impact.requires, { web: true, contracts: false, supabase: false, android: false });
    assert.deepEqual(impact.e2eFiles, []);
    assert.deepEqual(impact.realE2eFiles, []);
    const outputs = fs.readFileSync(outputPath, "utf8");
    assert.match(outputs, /docs_only=false\n/u);
    assert.match(outputs, /requires_supabase=false\n/u);
    assert.match(outputs, /requires_web=true\n/u);
    assert.match(outputs, /requires_android=false\n/u);
    assert.match(outputs, /applicability=\{/u);
    assert.match(outputs, /categories=\["web"\]\n/u);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});


test("CI protegida mantém check único e torna jobs caros condicionais à matriz", () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/validacao.yml"), "utf8");
  assert.match(workflow, /run: npm run test:runtime\r?\n/u);
  assert.match(workflow, /run: npm run test:e2e -- --forbid-only --output=test-results-stub/u);
  assert.match(workflow, /name: Testar e validar/u);
  assert.match(workflow, /needs: \[preparar, web, android, supabase\]/u);
  assert.match(workflow, /needs\.preparar\.outputs\.requires_web == 'true'/u);
  assert.match(workflow, /needs\.preparar\.outputs\.requires_android == 'true'/u);
  assert.match(workflow, /needs\.preparar\.outputs\.requires_supabase == 'true'/u);
  assert.match(workflow, /certifyGateResults/u);
  assert.match(workflow, /ready_for_review/u);
  assert.match(workflow, /!github.event.pull_request.draft/u);
  for (const file of ["scripts/validateCandidate.mjs", "package.json", "docs/evidence/paridade-vertical.v1.json"]) {
    assert.equal(classifyChangedPaths([file]), false);
  }
});
