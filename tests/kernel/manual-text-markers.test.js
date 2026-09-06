import assert from "node:assert/strict";
import test from "node:test";

import {
  createPackageManualTextMarker,
  instrumentPackageManualTextTargets,
  listPackageManualTextPaths,
  stripPackageManualTextMarkers
} from "../../src/resources/kernel/manualTextMarkers.js";
import { dotAttributes } from "../../src/resources/sdk/graphviz.js";
import { createPackageGapMarker, renderPackageInline } from "../../src/resources/sdk/html.js";

test("markers associam paths distintos mesmo quando os literais são iguais", () => {
  const source = {
    prompt: "Mesmo texto",
    labels: [{ value: "Mesmo texto" }, { value: "Mesmo texto" }]
  };
  const rendered = instrumentPackageManualTextTargets(source, [
    { path: "prompt" },
    { path: "labels[0].value" },
    { path: "labels[1].value" }
  ]);

  assert.deepEqual(listPackageManualTextPaths(rendered.prompt), ["prompt"]);
  assert.deepEqual(listPackageManualTextPaths(rendered.labels[0].value), ["labels[0].value"]);
  assert.deepEqual(listPackageManualTextPaths(rendered.labels[1].value), ["labels[1].value"]);
  assert.match(renderPackageInline(rendered.prompt), /data-package-manual-field-path="prompt"/u);
  assert.match(
    renderPackageInline(rendered.labels[1].value),
    /data-package-manual-field-path="labels%5B1%5D\.value"/u
  );
  assert.deepEqual(source, {
    prompt: "Mesmo texto",
    labels: [{ value: "Mesmo texto" }, { value: "Mesmo texto" }]
  });
});

test("texto autoral com delimitadores reservados permanece idêntico e falha fechado", () => {
  const values = [
    "antes\uE100depois",
    "antes\uE101depois",
    "antes\uE102depois",
    "antes\uE100AraLearnManualText/1:value\uE101conteúdo\uE102depois"
  ];
  values.forEach((value) => {
    const rendered = instrumentPackageManualTextTargets({ value }, [{ path: "value" }]);
    assert.equal(createPackageManualTextMarker("value", value), value);
    assert.deepEqual(listPackageManualTextPaths(rendered.value), []);
    assert.equal(stripPackageManualTextMarkers(rendered.value), value);
    assert.equal(renderPackageInline(rendered.value), value);
  });
});

test("marker manual é consumido antes de serializar DOT", () => {
  const rendered = instrumentPackageManualTextTargets(
    { label: "Rótulo em várias\nlinhas" },
    [{ path: "label" }]
  );
  const dot = dotAttributes({ id: "node", label: rendered.label });
  assert.match(dot, /label="Rótulo em várias\\nlinhas"/u);
  assert.doesNotMatch(dot, /\uE100|\uE101|\uE102|package-manual|label%/u);
});

test("campo preparado como prática conserva a identidade manual e o texto canônico protegido", () => {
  const gap = createPackageGapMarker({ blockKey: "gap-1", index: 0, responseMode: "choice",
    value: "", manualText: "a resposta <canônica>" });
  const source = `Antes ${gap} depois.`;
  const rendered = instrumentPackageManualTextTargets({ value: source }, [{ path: "value" }]);
  assert.deepEqual(listPackageManualTextPaths(rendered.value), ["value"]);
  assert.equal(stripPackageManualTextMarkers(rendered.value), source);
  const html = renderPackageInline(rendered.value);
  assert.match(html, /data-package-manual-field-path="value"/u);
  assert.match(html, /data-manual-practice-text="a resposta &lt;canônica&gt;" contenteditable="false"/u);
  assert.match(html, /data-action="text-gap-open-choice"/u);
  assert.doesNotMatch(html, /[\uE000\uE001\uE100-\uE102]/u);
});
