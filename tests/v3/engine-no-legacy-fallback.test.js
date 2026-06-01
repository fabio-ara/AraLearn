import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const TARGET_FILES = [
  "src/generation/bottomUp/generateMicrosequenceCards.js",
  "src/generation/bottomUp/createBranchMicrosequence.js",
  "src/generation/bottomUp/generateNextMicrosequence.js",
  "src/generation/bottomUp/improveMicrosequenceVersion.js",
  "src/generation/bottomUp/addPracticeToMicrosequence.js",
  "src/generation/topDown/planCourseFromScope.js",
  "src/generation/engine/bottomUpPlanRuntime.js",
  "src/generation/engine/bottomUpBuildRuntime.js",
  "src/generation/engine/bottomUpAuditRuntime.js",
  "src/generation/engine/topDownStructuredRuntime.js",
  "src/generation/engine/cardCompilers/index.js"
];

const FORBIDDEN_PATTERNS = [
  { pattern: /generateStructured/u, reason: "generateStructured não pode aparecer no runtime ativo" },
  { pattern: /draft_cards/u, reason: "draft_cards não pode aparecer no runtime ativo" },
  { pattern: /write_cards/u, reason: "write_cards não pode aparecer no runtime ativo" },
  { pattern: /response_format\s*:\s*\{\s*type\s*:\s*"json_object"/u, reason: "json mode não pode aparecer no Structured Engine" },
  { pattern: /optionIds\s*\[\s*0\s*\]/u, reason: "fallback para primeira alternativa é proibido" },
  { pattern: /deterministicPlanItem/u, reason: "fallback semântico deterministicPlanItem é proibido" },
  { pattern: /deterministicSlotsForTemplate/u, reason: "fallback genérico deterministicSlotsForTemplate é proibido" },
  { pattern: /fallback JSON/iu, reason: "referência a fallback JSON no runtime ativo é proibida" },
  { pattern: /fluxo antigo/iu, reason: "referência a fluxo antigo no runtime ativo é proibida" },
  { pattern: /modo legado/iu, reason: "referência a modo legado no runtime ativo é proibida" }
];

test("runtime ativo do Structured Engine não carrega padrões de fallback legado", () => {
  const failures = [];
  for (const relativePath of TARGET_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    FORBIDDEN_PATTERNS.forEach(({ pattern, reason }) => {
      if (pattern.test(source)) {
        failures.push(`${relativePath}: ${reason}`);
      }
    });
  }
  assert.deepEqual(failures, []);
});
