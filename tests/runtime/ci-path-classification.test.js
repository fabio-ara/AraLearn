import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  classifyChangedPaths,
  classifyGitDiff,
  isDocumentationPath
} from "../../scripts/classifyCiPaths.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const classifierPath = path.join(repositoryRoot, "scripts", "classifyCiPaths.mjs");

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
    assert.equal(fs.readFileSync(outputPath, "utf8"), "docs_only=false\n");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
