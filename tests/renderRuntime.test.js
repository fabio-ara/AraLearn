import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { renderRuntime } from "../src/render/renderRuntime.js";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

test("renderiza o exemplo do contrato principal com renderer próprio", () => {
  const result = renderRuntime(readText("./docs/examples/aralearn-contract.renderable.json"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.stages, ["load", "validate", "normalize", "compile", "render"]);
  assert.match(result.rendered.html, /class="card card-say"/);
  assert.match(result.rendered.html, /class="card card-ask"/);
  assert.match(result.rendered.html, /class="card card-code"/);
  assert.match(result.rendered.html, /class="card card-table"/);
  assert.match(result.rendered.html, /class="card card-flow"/);
  assert.match(result.rendered.html, /class="card card-tree"/);
  assert.match(result.rendered.html, /class="card card-plane"/);
  assert.match(result.rendered.html, /class="card card-matrix"/);
  assert.doesNotMatch(result.rendered.html, /aralearn\.intent\.v1/);
  assert.doesNotMatch(result.rendered.html, /card-image/);
});

test("renderiza o exemplo público de graph com classe própria do card", () => {
  const result = renderRuntime(readText("./docs/examples/aralearn-contract.graph.json"));

  assert.equal(result.ok, true);
  assert.match(result.rendered.html, /class="card card-graph"/);
  assert.match(result.rendered.html, /runtime-graph-svg/);
});
