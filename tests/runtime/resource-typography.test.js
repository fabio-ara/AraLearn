import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const styles = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8").replace(/\r\n?/gu, "\n");

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
    ".multiple-choice-option",
    ".package-matching-response label",
    ".package-relation-row",
    ".package-packet-legend li",
    ".package-schema-relations li",
    ".package-network-segments article",
    ".package-set-labels span",
    ".runtime-table th,\n.runtime-table td",
    ".runtime-tree-node-label",
    ".runtime-matrix-item",
    ".package-graph-relations li",
    ".package-chart-figure figcaption",
    ".package-system-node strong",
    ".package-formula math",
    ".package-reaction-equation",
    ".package-flow-shape",
    ".runtime-annotated-text-source"
  ]) assertUsesType(selector, "base");

  assert.doesNotMatch(styles, /\.package-formula math\s*\{[^}]*font-size:\s*clamp/gu);
});

test("metadados acadêmicos compactos usam apenas os degraus tipográficos secundários", () => {
  for (const selector of [
    ".runtime-tree-node-chip",
    ".package-graph-node text",
    ".package-system-group > header span,\n.package-system-node-kind",
    ".package-reaction-state",
    ".package-flow-branch-label",
    ".runtime-interlinear-abbreviations"
  ]) assertUsesType(selector, "sm");

  assert.match(
    styles,
    /\.package-plane,\n\.package-chart\s*\{[^}]*--resource-svg-label-size:\s*5px/u,
    "plano e gráfico precisam declarar uma escala secundária em unidades do viewBox"
  );
  assert.match(
    styles,
    /\.package-plane-axis-label,\n\.package-plane-vector text,\n\.package-chart-tick\s*\{[^}]*font-size:\s*var\(--resource-svg-label-size\)/u,
    "rótulos SVG precisam usar a escala percebida compartilhada"
  );
});
