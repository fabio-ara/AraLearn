import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("o workbench da microssequência zera o padding externo inferior para não duplicar safe area no Android", () => {
  const source = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8");

  assert.match(
    source,
    /\.microsequence-workbench-screen\s*\{[\s\S]*?padding-bottom:\s*0;/u
  );
  assert.match(
    source,
    /\.microsequence-workbench-screen\s*>\s*\.screen-content\s*\{[\s\S]*?padding-bottom:\s*0;/u
  );
});

test("o fluxograma não captura o gesto vertical principal no Android", () => {
  const styles = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8");
  const document = fs.readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
  const renderer = fs.readFileSync(
    new URL("../../src/resources/packages/flow/index.js", import.meta.url),
    "utf8"
  );
  const graphvizSdk = fs.readFileSync(
    new URL("../../src/resources/sdk/graphviz.js", import.meta.url),
    "utf8"
  );

  assert.match(renderer, /package-flowchart/u);
  assert.match(renderer, /package-flow-node/u);
  assert.match(renderer, /renderGraphvizSvg\(canvas, \{ source, engine: "dot", className: "package-flow-svg" \}\)/u);
  assert.match(graphvizSdk, /renderSVGElement\(source, \{ engine \}\)/u);
  assert.match(graphvizSdk, /vendor\/viz-global\.js/u);
  assert.match(document, /script-src 'self' 'wasm-unsafe-eval'/u);
  assert.doesNotMatch(document, /script-src[^;]*'unsafe-eval'/u);
  assert.doesNotMatch(renderer, /package-flow-tree|package-flow-node-card/u);
  assert.doesNotMatch(renderer, /touch-action|pointerdown|pointermove/iu);
  assert.doesNotMatch(styles, /\.runtime-flow-board/u);
});
