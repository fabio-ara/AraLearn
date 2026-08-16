import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const styles = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8").replace(/\r\n?/gu, "\n");
const tokens = fs.readFileSync(new URL("../../public/styles-tokens.css", import.meta.url), "utf8").replace(/\r\n?/gu, "\n");
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
    ".multiple-choice-option",
    ".runtime-ordering-value",
    ".package-er-entity-content",
    ".package-relational-table",
    ".package-set-name",
    ".runtime-matrix-item",
    ".package-math-graph-label-content",
    ".package-chart-legend",
    ".package-plane-legend",
    ".package-formula math",
    ".package-reaction-equation",
    ".package-flow-node"
  ]) assertUsesType(selector, "base");

  assert.doesNotMatch(styles, /\.package-formula math\s*\{[^}]*font-size:\s*clamp/gu);
});

test("prosa e estruturas densas usam degraus próprios e opções recuperam a escala compacta", () => {
  assert.match(tokens, /--type-prose:\s*0\.96875rem;/u);
  assert.match(tokens, /--leading-prose:\s*1\.5;/u);
  assert.match(tokens, /--type-dense:\s*0\.9375rem;/u);
  assert.match(tokens, /--leading-dense:\s*1\.44;/u);
  assert.match(tokens, /--type-diagram:\s*16px;/u);
  assert.match(tokens, /--type-diagram-secondary:\s*14\.5px;/u);
  assert.match(tokens, /--type-diagram-detail:\s*13\.5px;/u);

  assertUsesType(".card-sheet-content", "prose");
  assertUsesType(".runtime-annotated-text-source", "prose");
  assert.match(styles, /\.runtime-flow-prompt\s*\{[^}]*padding:\s*6px;[^}]*gap:\s*4px/u);
  assert.match(styles, /\.token-options\s*\{[^}]*gap:\s*4px/u);
  assert.match(styles, /\.token-option\s*\{[^}]*min-height:\s*28px/u);
  assert.match(styles, /\.token-option\s*\{[^}]*padding:\s*3px 6px/u);
  assert.match(styles, /\.token-option\s*\{[^}]*font-size:\s*0\.69rem/u);
  assert.match(styles, /\.token-option\s*\{[^}]*font-weight:\s*400/u);
  assert.match(styles, /\.token-option\s*\{[^}]*line-height:\s*1\.14/u);
  assert.match(styles, /\.token-option\s*\{[^}]*overflow-wrap:\s*anywhere/u);

  for (const selector of [
    ".runtime-code-block pre",
    ".package-terminal-session pre",
    ".package-packet-legend li",
    ".runtime-table th,\n.runtime-table td"
  ]) assertUsesType(selector, "dense");

  assert.match(styles, /\.card-sheet-content\s*\{[^}]*line-height:\s*var\(--leading-prose\)/u);
  assert.match(styles, /\.runtime-table th,\n\.runtime-table td\s*\{[^}]*line-height:\s*var\(--leading-dense\)/u);
  assert.match(styles, /\.runtime-text-gap-blank\s*\{[^}]*font-size:\s*var\(--type-base\)/u);
  assertUsesType(".package-system-diagram-node-content", "diagram");
  assert.match(styles, /\.package-system-diagram-node-label \.runtime-text-gap-blank,[^{]*\{[^}]*font-size:\s*var\(--type-diagram\)/u);
  assert.match(styles, /\.runtime-markdown-paragraph \+ \.runtime-markdown-paragraph,[^{]*\{[^}]*margin-top:\s*8px/u);
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
