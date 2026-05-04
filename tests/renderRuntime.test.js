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
  assert.match(result.rendered.html, /class="card card-text"/);
  assert.match(result.rendered.html, /class="card card-ask"/);
  assert.match(result.rendered.html, /class="card card-complete"/);
  assert.match(result.rendered.html, /class="card card-code"/);
  assert.match(result.rendered.html, /class="card card-table"/);
  assert.match(result.rendered.html, /class="card card-flow"/);
  assert.match(result.rendered.html, /class="card card-image"/);
  assert.doesNotMatch(result.rendered.html, /aralearn\.intent\.v1/);
});
