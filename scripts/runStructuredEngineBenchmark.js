import fs from "node:fs";
import path from "node:path";

import { validateCard } from "../src/domain/cards.js";
import { compileAuthoringCardGaps } from "../src/core/authoringGaps.js";
import { getCardResourceDefinition } from "../src/resources/registry/index.js";

const corpusPath = path.join(process.cwd(), "benchmarks", "resource-generation-corpus.v4.json");
const reportPath = path.join(process.cwd(), "tests", "reports", "resource-generation-benchmark.v4.json");

function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

function main() {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const startedAt = Date.now();
  const scenarios = corpus.scenarios.map((scenario, index) => {
    const scenarioStartedAt = performance.now();
    const definition = getCardResourceDefinition(scenario.resource);
    const source = definition?.examples?.[0];
    if (!source) {
      return {
        id: scenario.id,
        resource: scenario.resource,
        ok: false,
        latencyMs: performance.now() - scenarioStartedAt,
        errors: ["recurso sem exemplo canônico"]
      };
    }
    const card = compileAuthoringCardGaps(source, `$.scenarios[${index}].card`);
    card.id = `benchmark-${index + 1}`;
    card.position = index + 1;
    const validation = validateCard(card, `$.scenarios[${index}].card`);
    return {
      id: scenario.id,
      domain: scenario.domain,
      resource: scenario.resource,
      exercise: card.exercise,
      ok: validation.ok,
      latencyMs: Number((performance.now() - scenarioStartedAt).toFixed(3)),
      errors: validation.errors || []
    };
  });
  const latencies = scenarios.map((scenario) => scenario.latencyMs);
  const passed = scenarios.filter((scenario) => scenario.ok).length;
  const report = {
    contract: "aralearn.resource-generation-benchmark.v4",
    corpusVersion: corpus.version,
    createdAt: new Date().toISOString(),
    deterministicReference: true,
    totals: {
      scenarios: scenarios.length,
      passed,
      failed: scenarios.length - passed,
      successRate: Number((passed / scenarios.length).toFixed(4)),
      durationMs: Date.now() - startedAt,
      p50ValidationLatencyMs: percentile(latencies, 0.5),
      p95ValidationLatencyMs: percentile(latencies, 0.95)
    },
    byResource: Object.fromEntries([...new Set(scenarios.map((item) => item.resource))].map((resource) => {
      const entries = scenarios.filter((item) => item.resource === resource);
      return [resource, {
        scenarios: entries.length,
        passed: entries.filter((item) => item.ok).length
      }];
    })),
    scenarios
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.totals, null, 2));
  if (report.totals.failed) process.exitCode = 1;
}

main();
