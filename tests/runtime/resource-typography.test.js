import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const styles = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8").replace(/\r\n?/gu, "\n");
const graphvizPackageSources = [
  "../../src/resources/packages/graph/index.js",
  "../../src/resources/packages/software-system-context/index.js",
  "../../src/resources/packages/software-container/index.js",
  "../../src/resources/packages/system-internal-block/index.js"
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertUsesType(selector, token) {
  assert.match(
    styles,
    new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*font-size:\\s*var\\(--type-${token}\\)`, "u"),
    `${selector} precisa usar --type-${token}`
  );
}

test("conteúdo primário dos resources compartilha a escala tipográfica do texto explicado", () => {
  for (const selector of [
    ".runtime-code-block pre",
    ".package-terminal-session pre",
    ".multiple-choice-option",
    ".package-matching-response label",
    ".package-packet-legend li",
    ".package-er-entity-content",
    ".package-relational-table",
    ".package-set-name",
    ".runtime-table th,\n.runtime-table td",
    ".runtime-matrix-item",
    ".package-math-graph-label-content",
    ".package-chart-legend",
    ".package-plane-legend",
    ".package-system-diagram-node-content",
    ".package-formula math",
    ".package-reaction-equation",
    ".package-flow-node",
    ".runtime-annotated-text-source"
  ]) assertUsesType(selector, "base");

  assert.doesNotMatch(styles, /\.package-formula math\s*\{[^}]*font-size:\s*clamp/gu);
});

test("metadados acadêmicos compactos usam apenas os degraus tipográficos secundários", () => {
  for (const selector of [
    ".package-reaction-state",
    ".package-flow-edge-label",
    ".runtime-interlinear-abbreviations"
  ]) assertUsesType(selector, "sm");

  assert.doesNotMatch(styles, /--resource-svg-label-size/u, "Vega deriva a tipografia interna sem token SVG artesanal");
});

test("Graphviz calcula caixas e trajetórias com a mesma tipografia que permanece na renderização", () => {
  assert.doesNotMatch(
    styles,
    /\.package-(?:math-graph|system-diagram)-svg\s+text\s*\{[^}]*(?:font-size|font-family)\s*:/u,
    "CSS não pode trocar a métrica tipográfica depois que o Graphviz calcula a geometria"
  );
  for (const source of graphvizPackageSources) {
    assert.match(source, /fontname=\\"Arial\\"/u);
    assert.match(source, /edge \[fontname=\\"Arial\\", fontsize=\\"1[34]\\"/u);
  }
});
