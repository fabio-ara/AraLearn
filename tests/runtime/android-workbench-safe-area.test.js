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

test("diagramas sistêmicos oferecem pan e pinça no card e na exploração Android", () => {
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
  const viewportSdk = fs.readFileSync(
    new URL("../../src/resources/sdk/diagramViewport.js", import.meta.url),
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
  assert.match(renderer, /data-resource-scroll-frame="diagram"/u);
  assert.match(styles, /\.package-flowchart\s*\{[\s\S]*?max-height:\s*min\(48dvh, 430px\);[\s\S]*?overflow:\s*auto;[\s\S]*?overscroll-behavior-block:\s*auto;[\s\S]*?touch-action:\s*pan-x pan-y;/u);
  assert.match(styles, /\.package-diagram-frame\s*\{[\s\S]*?grid-template-rows:\s*calc\(var\(--tap\) \+ 12px\) minmax\(0, 1fr\);[\s\S]*?height:\s*clamp\(220px, 34dvh, 300px\);[\s\S]*?overflow:\s*hidden;/u);
  assert.match(styles, /\.package-system-diagram-canvas\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*auto;[\s\S]*?touch-action:\s*none;/u);
  assert.match(styles, /\.package-system-diagram-canvas\[data-diagram-viewport-mode="explore"\]\s*\{[\s\S]*?overflow:\s*auto;[\s\S]*?touch-action:\s*none;/u);
  assert.match(styles, /\.package-diagram-modal\s*\{[\s\S]*?width:\s*min\(100dvw, 430px\);[\s\S]*?height:\s*100dvh;/u);
  assert.match(styles, /\.runtime-card-rendered-content\s*\{[\s\S]*?overflow:\s*hidden;/u);
  assert.match(styles, /\.card-sheet-content\s*\{[\s\S]*?overflow-y:\s*auto;/u);
  assert.match(viewportSdk, /showModal\(\)/u);
  assert.match(viewportSdk, /data-diagram-action="zoom-in"/u);
  assert.doesNotMatch(viewportSdk, /data-diagram-action="fit"/u);
  assert.doesNotMatch(renderer, /pointerdown|pointermove/iu);
  assert.match(viewportSdk, /pointerdown/iu);
  assert.match(viewportSdk, /pointermove/iu);
  assert.match(viewportSdk, /pointerDistance/iu);
  assert.doesNotMatch(styles, /\.runtime-flow-board/u);
});
