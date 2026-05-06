import test from "node:test";
import assert from "node:assert/strict";

import { computeFlowchartAutoFitScale } from "../src/flowchart/flowchartViewport.js";

test("auto-fit do flowchart reduz escala para caber no viewport", () => {
  const scale = computeFlowchartAutoFitScale({
    viewportWidth: 320,
    viewportHeight: 480,
    baseWidth: 800,
    baseHeight: 1200,
    preferredScale: 1
  });

  assert.equal(scale < 1, true);
});

test("auto-fit do flowchart respeita escala preferida quando já cabe", () => {
  const scale = computeFlowchartAutoFitScale({
    viewportWidth: 1200,
    viewportHeight: 900,
    baseWidth: 600,
    baseHeight: 400,
    preferredScale: 1
  });

  assert.equal(scale, 1);
});

test("auto-fit do flowchart respeita limites mínimos e máximos", () => {
  assert.equal(
    computeFlowchartAutoFitScale({
      viewportWidth: 10,
      viewportHeight: 10,
      baseWidth: 2000,
      baseHeight: 2000,
      preferredScale: 1,
      minScale: 0.33,
      maxScale: 0.9
    }),
    0.33
  );

  assert.equal(
    computeFlowchartAutoFitScale({
      viewportWidth: 5000,
      viewportHeight: 5000,
      baseWidth: 200,
      baseHeight: 200,
      preferredScale: 2,
      minScale: 0.2,
      maxScale: 1.2
    }),
    1.2
  );
});

