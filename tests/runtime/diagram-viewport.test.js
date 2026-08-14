import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateDiagramFitScale,
  normalizeDiagramScale,
  renderDiagramViewportShell
} from "../../src/resources/sdk/diagramViewport.js";
import {
  createPackageGapMarker,
  packageReferenceText
} from "../../src/resources/sdk/html.js";

test("ajuste global usa simultaneamente largura e altura do quadro", () => {
  assert.equal(calculateDiagramFitScale({
    naturalWidth: 1200,
    naturalHeight: 800,
    viewportWidth: 380,
    viewportHeight: 280,
    padding: 20
  }), 0.3);
  assert.equal(calculateDiagramFitScale({
    naturalWidth: 200,
    naturalHeight: 120,
    viewportWidth: 380,
    viewportHeight: 280,
    padding: 20
  }), 1);
  assert.equal(calculateDiagramFitScale({
    naturalWidth: 10000,
    naturalHeight: 4000,
    viewportWidth: 320,
    viewportHeight: 220,
    padding: 20
  }), 0.03);
});

test("escala respeita visão global extrema e limite de leitura ampliada", () => {
  assert.equal(normalizeDiagramScale(0.01), 0.08);
  assert.equal(normalizeDiagramScale(1.4), 1.4);
  assert.equal(normalizeDiagramScale(8), 2.4);
});

test("shell separa exploração, zoom explícito e detalhe sem gesto obrigatório", () => {
  const markup = renderDiagramViewportShell({
    canvasHtml: '<div data-test-canvas></div>',
    detailHtml: '<section data-test-detail></section>'
  });
  assert.match(markup, /data-diagram-action="zoom-out"/u);
  assert.match(markup, /data-diagram-action="fit"/u);
  assert.match(markup, /data-diagram-action="zoom-in"/u);
  assert.match(markup, /data-diagram-action="toggle-expanded"/u);
  assert.match(markup, /<dialog[^>]+data-diagram-modal/u);
  assert.equal((markup.match(/data-test-canvas/gu) || []).length, 1);
  assert.equal((markup.match(/data-test-detail/gu) || []).length, 1);
});

test("texto de referência neutraliza marker e nunca expõe resposta de medição", () => {
  const marker = createPackageGapMarker({
    blockKey: "card::response",
    index: 0,
    layoutText: "resposta sigilosa",
    value: ""
  });
  assert.equal(packageReferenceText(`Antes ${marker} depois`), "Antes … depois");
  assert.equal(packageReferenceText(marker, "lacuna"), "lacuna");
});
