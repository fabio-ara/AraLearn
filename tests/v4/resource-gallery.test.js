import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { renderCardRuntimeBlocksWithDock } from "../../src/render/renderCardRuntime.js";
import { listResourceIds } from "../../src/resources/registry/index.js";

const fixtureUrl = new URL("../fixtures/v4/project-resources-gallery.json", import.meta.url);

function galleryCards(project) {
  return project.courses[0].modules[0].lessons[0].microsequences[0].cards;
}

test("galeria local contém um card válido de cada resource canônico", () => {
  const project = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
  const validation = validateProjectDocument(project);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(
    galleryCards(validation.value).map((card) => card.resource),
    listResourceIds()
  );
});

test("todos os cards da galeria atravessam o renderer completo", () => {
  const project = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
  galleryCards(project).forEach((card, index) => {
    const runtime = renderCardRuntimeBlocksWithDock(card, {
      blockKeyPrefix: `gallery-test-${index}`
    });
    assert.match(runtime.bodyHtml, /runtime-/u, card.resource);
    assert.doesNotMatch(runtime.bodyHtml, /\{gap:/u, card.resource);
    assert.doesNotMatch(runtime.bodyHtml, /#[\da-f]{3,8}\b|rgba?\(/iu, card.resource);
  });
});

test("renderer de resources usa paleta semântica e ícones vetoriais", () => {
  const project = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
  const chart = galleryCards(project).find((card) => card.resource === "chart");
  const graph = galleryCards(project).find((card) => card.resource === "graph");
  const chartHtml = renderCardRuntimeBlocksWithDock(chart).bodyHtml;
  const graphHtml = renderCardRuntimeBlocksWithDock(graph).bodyHtml;

  assert.match(chartHtml, /--series-color:var\(--data-series-1\)/u);
  assert.match(graphHtml, /var\(--resource-(?:surface|border|accent|text)/u);
  assert.doesNotMatch(`${chartHtml}${graphHtml}`, /&#(?:8635|9679|10003|128065);/u);
});
