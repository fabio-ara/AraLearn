import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import {
  EDITORIAL_FOOTPRINT_THEMES,
  EDITORIAL_FOOTPRINT_VIEWPORTS,
  REQUIRED_EDITORIAL_FAMILIES,
  measureEditorialFootprintCandidate
} from "../../scripts/editorialFootprintMetrics.mjs";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/editorial-footprint.v1.json", import.meta.url),
  "utf8"
));

function candidateFor(benchmarkCase, viewportWidth = 390) {
  const descriptor = RESOURCE_CATALOG.previewStudyUnitDescriptor(benchmarkCase.studyUnit);
  return measureEditorialFootprintCandidate({
    accessibleText: descriptor.accessibleText,
    contentClientHeight: 700,
    studyUnit: benchmarkCase.studyUnit,
    viewportWidth
  });
}

test("corpus de extensão editorial é fixo, válido e cobre as famílias do ensaio", () => {
  assert.equal(fixture.contract, "aralearn.editorial-footprint-benchmark.v1");
  assert.equal(fixture.cases.length, 13);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, fixture.cases.length);
  const coveredFamilies = new Set(fixture.cases.flatMap(({ families }) => families));
  REQUIRED_EDITORIAL_FAMILIES.forEach((family) => assert.ok(
    coveredFamilies.has(family),
    `Família ausente: ${family}.`
  ));
  fixture.cases.forEach((benchmarkCase) => {
    const validation = RESOURCE_CATALOG.validateStudyUnit(benchmarkCase.studyUnit);
    assert.equal(validation.valid, true, `${benchmarkCase.id}: ${validation.errors.join(" ")}`);
    assert.ok(RESOURCE_CATALOG.previewStudyUnitDescriptor(
      benchmarkCase.studyUnit
    ).accessibleText.trim());
  });
});

test("métricas candidatas são determinísticas e preservam contagens estruturais", () => {
  fixture.cases.forEach((benchmarkCase) => {
    assert.deepEqual(candidateFor(benchmarkCase), candidateFor(benchmarkCase));
  });
  const byId = new Map(fixture.cases.map((benchmarkCase) => [benchmarkCase.id, benchmarkCase]));
  assert.ok(
    candidateFor(byId.get("paragraph-medium")).lexical.words
      > candidateFor(byId.get("paragraph-short")).lexical.words
  );
  assert.ok(
    candidateFor(byId.get("paragraph-extreme")).lexical.words
      > candidateFor(byId.get("paragraph-medium")).lexical.words * 4
  );
  assert.equal(candidateFor(byId.get("code-short")).structure.codeLines, 4);
  assert.equal(candidateFor(byId.get("code-long")).structure.codeLines, 23);
  assert.equal(candidateFor(byId.get("table-compact")).structure.tableRows, 2);
  assert.equal(candidateFor(byId.get("table-dense")).structure.tableRows, 6);
  assert.equal(candidateFor(byId.get("chart-standard")).structure.chartPoints, 12);
  assert.equal(candidateFor(byId.get("graph-standard")).structure.graphVertices, 8);
  assert.equal(candidateFor(byId.get("choice-compact")).structure.choiceOptions, 2);
  assert.equal(candidateFor(byId.get("choice-extended")).structure.choiceOptions, 8);
  assert.equal(candidateFor(byId.get("table-ordering-combination")).structure.orderingTargets, 4);
});

test("matriz de execução permanece finita e os dois comprimentos geram estimativas explícitas", () => {
  assert.deepEqual(EDITORIAL_FOOTPRINT_VIEWPORTS, [
    { width: 390, height: 844 },
    { width: 430, height: 932 }
  ]);
  assert.deepEqual(EDITORIAL_FOOTPRINT_THEMES, ["light", "dark"]);
  assert.equal(
    fixture.cases.length * EDITORIAL_FOOTPRINT_VIEWPORTS.length * EDITORIAL_FOOTPRINT_THEMES.length,
    52
  );
  const benchmarkCase = fixture.cases[0];
  const narrow = candidateFor(benchmarkCase, 390);
  const wide = candidateFor(benchmarkCase, 430);
  assert.ok(narrow.estimatedPixels >= wide.estimatedPixels);
  assert.ok(Number.isFinite(narrow.exploratoryWeightedWords));
  assert.ok(Number.isFinite(narrow.abstractRows));
  assert.ok(Number.isFinite(narrow.estimatedViewportRatio));
});
