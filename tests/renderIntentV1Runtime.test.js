import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { renderIntentV1Runtime } from "../src/render/renderIntentV1Runtime.js";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

test("renderiza HTML básico a partir de documento compilado", () => {
  const result = renderIntentV1Runtime(readText("./docs/examples/aralearn-intent-v1.renderable.json"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.stages, ["load", "validate", "normalize", "compile", "render"]);
  assert.match(result.rendered.html, /class="card card-text"/);
  assert.match(result.rendered.html, /class="card card-ask"/);
  assert.match(result.rendered.html, /class="card card-complete"/);
  assert.match(result.rendered.html, /class="card card-code"/);
  assert.match(result.rendered.html, /class="card card-table"/);
  assert.match(result.rendered.html, /class="card card-flow"/);
  assert.match(result.rendered.html, /class="card card-image"/);
});

test("renderizador consome o modelo compilado e não o contrato cru", () => {
  const result = renderIntentV1Runtime(readText("./docs/examples/aralearn-intent-v1.renderable.json"));

  assert.equal(result.ok, true);
  assert.equal("id" in result.normalized.courses[0], false);
  assert.equal("id" in result.compiled.courses[0], true);
  assert.match(result.rendered.html, /data-course-id="course:course-curso-renderizavel"/);
});

test("renderização não acontece quando a validação falha", () => {
  const result = renderIntentV1Runtime(readText("./docs/examples/aralearn-intent-v1.invalid.json"));

  assert.equal(result.ok, false);
  assert.equal(result.stage, "validate");
});
