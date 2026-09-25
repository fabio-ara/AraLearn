import assert from "node:assert/strict";
import test from "node:test";

import { renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { setDiagramPackage } from "../../src/resources/packages/set-diagram/index.js";

const fallbackSet = {
  kind: "venn",
  universeLabel: "Elementos observados",
  sets: [
    { id: "alpha", symbol: "A", label: "Alpha" },
    { id: "beta", symbol: "B", label: "Beta" },
    { id: "gamma", symbol: "C", label: "Gamma" }
  ],
  regions: [
    { id: "alpha-only", setIds: ["alpha"], label: "Somente A", items: ["um"] },
    { id: "beta-only", setIds: ["beta"], label: "Somente B", items: ["dois"] },
    { id: "gamma-only", setIds: ["gamma"], label: "Somente C", items: ["três"] },
    { id: "alpha-beta", setIds: ["alpha", "beta"], label: "A e B", items: ["quatro"] },
    { id: "alpha-gamma", setIds: ["alpha", "gamma"], label: "A e C", items: ["cinco"] },
    { id: "beta-gamma", setIds: ["beta", "gamma"], label: "B e C", items: ["seis"] },
    { id: "all-three", setIds: ["alpha", "beta", "gamma"], label: "A, B e C", items: ["sete"] },
    { id: "outside", setIds: [], label: "Fora dos conjuntos", items: ["oito"] }
  ]
};

const normalSet = {
  kind: "venn",
  sets: [
    { id: "left", symbol: "L", label: "Esquerda" },
    { id: "right", symbol: "R", label: "Direita" }
  ],
  regions: [
    { id: "left-only", setIds: ["left"], label: "Somente L", items: ["um"] },
    { id: "right-only", setIds: ["right"], label: "Somente R", items: ["dois"] },
    { id: "both", setIds: ["left", "right"], label: "L e R", items: ["três"] },
    { id: "outside", setIds: [], label: "Fora dos conjuntos", items: ["quatro"] }
  ]
};

function orderingUnit() {
  return {
    id: "ordering-study-unit",
    position: 1,
    title: "Reconstruir uma sequência",
    role: "practice",
    content: [{
      id: "sequence-text",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Primeiro preparar; depois executar; por fim conferir." }
    }],
    response: {
      id: "ordering-response",
      package: "aralearn.response.ordering",
      version: "3.0.0",
      data: {
        targets: [
          { id: "prepare", targetInstanceId: "sequence-text", targetPath: "text:prepare", answer: "Primeiro preparar" },
          { id: "execute", targetInstanceId: "sequence-text", targetPath: "text:execute", answer: "depois executar" },
          { id: "check", targetInstanceId: "sequence-text", targetPath: "text:check", answer: "por fim conferir" }
        ]
      }
    },
    feedback: [],
    topics: []
  };
}

test("D026/O067: ordering materializa lista vertical com subir/descer icon-only", () => {
  const studyUnit = orderingUnit();
  assert.deepEqual(RESOURCE_PACKAGE_REGISTRY.validateStudyUnitRelations(studyUnit), []);

  const blockKeyPrefix = "synthetic-ordering";
  const blockKey = `${blockKeyPrefix}::response:ordering-response`;
  const html = renderPackageStudyUnitBlocks(studyUnit, {
    blockKeyPrefix,
    responseStateByBlockKey: {
      [blockKey]: { order: ["execute", "check", "prepare"], feedback: null }
    }
  });

  assert.equal((html.match(/class="runtime-ordering-slot"/gu) || []).length, 3);
  assert.equal((html.match(/data-ordering-direction="up"/gu) || []).length, 3);
  assert.equal((html.match(/data-ordering-direction="down"/gu) || []).length, 3);
  assert.match(html, /<span class="runtime-ordering-value">depois executar; <\/span>/u);
  assert.match(html, /<span class="runtime-ordering-value">por fim conferir; <\/span>/u);
  assert.match(html, /<span class="runtime-ordering-value">Primeiro preparar\.<\/span>/u);
  assert.doesNotMatch(html, /<button[^>]*data-action="ordering-move"[^>]*>[^<]+</u);

  const theory = { ...studyUnit, role: "theory", response: null };
  const theoryHtml = renderPackageStudyUnitBlocks(theory, { blockKeyPrefix: "synthetic-theory" });
  assert.doesNotMatch(theoryHtml, /runtime-ordering-slot|data-action="ordering-move"/u);
  assert.match(theoryHtml, /Primeiro preparar; depois executar; por fim conferir/u);
});

test("O053/Q014: o renderer preserva a descrição integral de cada região", () => {
  const html = setDiagramPackage.render(fallbackSet);
  const accessible = setDiagramPackage.accessibleText(fallbackSet);
  const normalHtml = setDiagramPackage.render(normalSet);

  assert.equal((html.match(/<li>/gu) || []).length, fallbackSet.regions.length);
  assert.equal((normalHtml.match(/<li>/gu) || []).length, normalSet.regions.length);
  for (const region of fallbackSet.regions) {
    assert.match(html, new RegExp(region.label, "u"));
    assert.match(html, new RegExp(region.items[0], "u"));
    assert.match(accessible, new RegExp(region.items[0], "u"));
  }
  assert.match(html, /data-set-diagram=/u);
  assert.match(html, /<ol>[\s\S]*<li>[\s\S]*<\/li>[\s\S]*<\/ol>/u);
});
