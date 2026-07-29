import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("bottom-up ativo usa saída estruturada e não importa o motor de slots", () => {
  const entrypoint = source("src/generation/bottomUp/generateMicrosequenceCards.js");
  const runtime = source("src/generation/engine/structuredBottomUpRuntime.js");

  assert.match(entrypoint, /runStructuredBottomUp/u);
  assert.doesNotMatch(entrypoint, /bottomUpPlanRuntime|bottomUpBuildRuntime|bottomUpAuditRuntime/u);
  assert.match(runtime, /provider\.generateStructured/u);
  assert.doesNotMatch(runtime, /generateText|parseCardSlotText|optionA|optionB|optionC|answerId\b/u);
});

test("schemas do bottom-up são específicos por fase e por recurso", () => {
  const runtime = source("src/generation/engine/structuredBottomUpRuntime.js");
  assert.match(runtime, /bottom_up_representation/u);
  assert.match(runtime, /bottom_up_card_build/u);
  assert.match(runtime, /exactBuildSchema/u);
  assert.match(runtime, /additionalProperties:\s*false/u);
});
