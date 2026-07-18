import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const TARGET_FILES = [
  "src/generation/bottomUp/generateMicrosequenceCards.js",
  "src/generation/bottomUp/createBranchMicrosequence.js",
  "src/generation/bottomUp/generateNextMicrosequence.js",
  "src/generation/bottomUp/repairMicrosequenceCards.js",
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
  { pattern: /optionIds\s*\[\s*0\s*\]/u, reason: "a primeira alternativa não pode ser escolhida sem validação semântica" },
  { pattern: /deterministicPlanItem/u, reason: "deterministicPlanItem não pode aparecer no runtime ativo" },
  { pattern: /deterministicSlotsForTemplate/u, reason: "deterministicSlotsForTemplate não pode aparecer no runtime ativo" }
];

test("o Structured Engine ativo respeita o contrato atual de execução", () => {
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
