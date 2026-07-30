import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(fileName) {
  return fs.readFileSync(path.join(root, "scripts", fileName), "utf8");
}

function runScript(fileName) {
  const result = spawnSync(process.execPath, [path.join("scripts", fileName)], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000
  });
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n")
  );
  assert.equal(result.signal, null);
  return JSON.parse(result.stdout);
}

function assertCompleteCoverage(actual, expected, label) {
  assert.deepEqual(
    new Set(actual),
    new Set(expected),
    label
  );
}

test("validação do corpus usa exemplos reais e matriz explícita, sem benchmark sintético", () => {
  const report = runScript("runResourceCorpusValidation.js");

  assert.equal(report.contract, "aralearn.resource-corpus-validation.v2");
  assert.equal(report.ok, true);
  assert.equal(report.totals.failed, 0);
  assert.equal(report.totals.passed, report.totals.cases);
  assertCompleteCoverage(
    report.coverage.canonicalResources.validated,
    report.coverage.canonicalResources.expected,
    "resources canônicos"
  );
  assertCompleteCoverage(
    report.coverage.specializedResources.validated,
    ["system_map", "reaction"],
    "resources especializados"
  );
  assertCompleteCoverage(
    report.coverage.systemMapGroupKinds.validated,
    [
      "region",
      "zone",
      "network",
      "cluster",
      "namespace",
      "container",
      "stage",
      "boundary"
    ],
    "tipos de agrupamento de system_map"
  );
  assertCompleteCoverage(
    report.coverage.systemMapNodeKinds.validated,
    [
      "client",
      "service",
      "database",
      "queue",
      "storage",
      "gateway",
      "worker",
      "external"
    ],
    "tipos de componente de system_map"
  );
  assertCompleteCoverage(
    report.coverage.reactionTypes.validated,
    ["forward", "reversible", "equilibrium"],
    "direções de reaction"
  );
  assertCompleteCoverage(
    report.coverage.chartVariants.validated,
    ["bar", "line", "scatter", "histogram", "boxplot"],
    "variantes de chart"
  );
  assertCompleteCoverage(
    report.coverage.sequenceVariants.validated,
    ["ordered_steps", "timeline", "lifecycle", "cycle", "code_blocks"],
    "variantes de sequence"
  );
  assertCompleteCoverage(
    report.coverage.linguisticWritingModes.validated,
    ["horizontal", "vertical"],
    "modos de escrita"
  );
  assertCompleteCoverage(
    report.coverage.linguisticTextDirections.validated,
    ["auto", "ltr", "rtl"],
    "direções de escrita"
  );
  assert.equal(
    report.cases.every((scenario) => scenario.ok),
    true
  );
  assert.equal(Object.hasOwn(report.totals, "successRate"), false);
  assert.equal(Object.hasOwn(report.totals, "p95ValidationLatencyMs"), false);
});

test("harness cobre provider strict, prévia e persistência atômica sem rede", () => {
  const report = runScript("runCardAssistanceHarness.js");

  assert.equal(report.contract, "aralearn.card-assistance-harness.v2");
  assert.equal(report.ok, true);
  assert.equal(report.calls.network, 0);
  assert.ok(report.strictProviderChecks >= report.repair.scenarios + 2);
  assertCompleteCoverage(
    report.repair.resources,
    report.expected.resources,
    "resources reparados"
  );
  for (const resource of report.expected.resources) {
    assertCompleteCoverage(
      report.repair.placementsByResource[resource],
      report.expected.placements,
      `${resource}: main/body/after`
    );
  }
  assertCompleteCoverage(
    report.repair.chartVariants,
    report.expected.chartVariants,
    "variantes de chart no reparo"
  );
  assertCompleteCoverage(
    report.repair.sequenceVariants,
    report.expected.sequenceVariants,
    "variantes de sequence no reparo"
  );
  assertCompleteCoverage(
    report.repair.linguisticWritingModes,
    report.expected.linguisticWritingModes,
    "modos linguísticos no reparo"
  );
  assertCompleteCoverage(
    report.repair.linguisticTextDirections,
    report.expected.linguisticTextDirections,
    "direções linguísticas no reparo"
  );
  assert.equal(report.repair.previewed, report.repair.scenarios);
  assert.equal(report.repair.applied, report.repair.scenarios);
  assert.equal(report.repair.persisted, report.repair.scenarios);
  assert.deepEqual(
    report.calls.phases,
    {
      card_assistance_resource_repair: report.repair.scenarios,
      card_assistance_representation: 1,
      card_assistance_build: 1
    }
  );
  assert.deepEqual(
    {
      previewed: report.creation.previewed,
      applied: report.creation.applied,
      persisted: report.creation.persisted
    },
    {
      previewed: true,
      applied: true,
      persisted: true
    }
  );
});

test("package expõe validação honesta e não mantém o benchmark removido", () => {
  const packageDocument = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );
  assert.equal(
    packageDocument.scripts["validate:resource-corpus"],
    "node ./scripts/runResourceCorpusValidation.js"
  );
  assert.equal(
    Object.hasOwn(packageDocument.scripts, "benchmark:structured"),
    false
  );
  assert.equal(
    Object.hasOwn(packageDocument.scripts, "benchmark:topdown"),
    false
  );
  assert.equal(
    Object.hasOwn(packageDocument.scripts, "validate:scope"),
    false
  );
  assert.equal(
    Object.hasOwn(packageDocument.scripts, "harness:scope"),
    false
  );
  assert.equal(
    fs.existsSync(path.join(root, "scripts", "runStructuredEngineBenchmark.js")),
    false
  );
  assert.equal(
    fs.existsSync(path.join(root, "scripts", "runTopDownStructuredBenchmark.js")),
    false
  );
  assert.equal(
    fs.existsSync(path.join(root, "scripts", "runScopePlanningHarness.js")),
    false
  );
});

test("smoke real DeepSeek exercita somente a assistência atômica", () => {
  const smoke = source("runDeepSeekCardAssistanceSmoke.js");
  const sharedSmoke = source("cardAssistanceSmoke.lib.js");
  assert.match(smoke, /DEEPSEEK_API_KEY/u);
  assert.match(smoke, /deepseek-v4-flash/u);
  assert.match(smoke, /deepseek-card-assistance\.json/u);
  assert.match(smoke, /runCardAssistanceSmoke/u);
  assert.match(sharedSmoke, /generateCardAssistanceChangeSet/u);
  assert.match(sharedSmoke, /applyCardAssistanceChangeSet/u);
  assert.doesNotMatch(smoke, /bottom.?up|top.?down|microsequenceGeneration/u);
  assert.doesNotMatch(sharedSmoke, /bottom.?up|top.?down|microsequenceGeneration/u);
});
