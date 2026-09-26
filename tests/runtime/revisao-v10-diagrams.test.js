import test from "node:test";
import assert from "node:assert/strict";

import { graphvizEdgeLabelAttributes } from "../../src/resources/sdk/graphviz.js";

// Contrato puro do helper compartilhado pelos três pacotes de diagrama de sistema.
// O comportamento no DOM (líder do `decorate`, colisões e enquadramento inicial) é
// provado em `tests/e2e/revisao-v10-diagrams.spec.js`.
test("a política compartilhada de rótulos de aresta usa label decorado e wrapping", () => {
  assert.deepEqual(graphvizEdgeLabelAttributes("uma legenda longa", 8), {
    label: "uma\nlegenda\nlonga",
    decorate: "true"
  });
  assert.deepEqual(graphvizEdgeLabelAttributes("curta"), { label: "curta", decorate: "true" });
});
