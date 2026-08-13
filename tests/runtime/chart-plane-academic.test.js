import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_PACKAGE_REGISTRY, chartPackage, planePackage } from "../../src/resources/packages/index.js";
import { compileChartVegaLite } from "../../src/resources/packages/chart/index.js";
import { compilePlaneVegaLite } from "../../src/resources/packages/plane/index.js";

const theme = Object.freeze({
  colors: ["#2563eb", "#b45309", "#15803d", "#7e22ce", "#be123c", "#0369a1"],
  text: "#111827",
  secondaryText: "#475569",
  border: "#94a3b8",
  grid: "#cbd5e1"
});

function instance(packageId, data) {
  return { id: "academic-fixture", package: packageId, version: "1.0.0", data };
}

test("chart acadêmico declara escala, incerteza, referência e dados suficientes para inspeção", () => {
  const data = chartPackage.normalize(chartPackage.authoringContract.example);
  assert.deepEqual(chartPackage.validate(data), []);
  assert.equal(data.xAxis.scale, "log");
  assert.equal(data.uncertainty.label, "Intervalo de confiança de 95%");
  assert.equal(data.series.length, 2);
  assert.equal(data.series[0].values.length, 6);
  assert.ok(data.series.every((series) => series.values.every((point) => point.lower < point.y && point.y < point.upper)));
  assert.equal(data.referenceLines[0].label, "Limite operacional");
  const specification = compileChartVegaLite(data, theme);
  assert.equal(specification.width, "container");
  assert.ok(specification.layer.some(({ mark }) => mark?.type === "errorbar"));
  assert.ok(specification.layer.some(({ mark, encoding }) => mark?.type === "line" && encoding?.strokeDash?.field === "seriesId"));
  assert.ok(specification.layer.some(({ mark, encoding }) => mark?.type === "point" && encoding?.shape?.field === "seriesId"));
  assert.ok(specification.layer.some(({ mark }) => mark?.type === "rule"));
});

test("chart rejeita a antiga tupla categórica e tipos declarados sem renderer", () => {
  const old = RESOURCE_PACKAGE_REGISTRY.validateInstance(instance("aralearn.resource.chart", {
    chartType: "boxplot",
    xAxis: { label: "Tempo" },
    yAxis: { label: "Valor" },
    series: [{ id: "s1", name: "Série", values: [["1", 10], ["2", 12]] }]
  }), "content");
  assert.equal(old.valid, false);
  assert.match(old.errors.join(" "), /schema|chartType|xAxis|values/iu);
});

test("plane acadêmico diferencia pontos, vetores aplicados e regiões em domínios explícitos", () => {
  const data = planePackage.normalize(planePackage.authoringContract.example);
  assert.deepEqual(planePackage.validate(data), []);
  assert.equal(data.points.length, 2);
  assert.equal(data.vectors.length, 4);
  assert.equal(data.paths.length, 2);
  assert.deepEqual(data.groups.map(({ label }) => label), ["Objeto original", "Imagem por A"]);
  assert.ok([...data.points, ...data.vectors, ...data.paths].every(({ group }) => ["original", "image"].includes(group)));
  assert.ok(data.vectors.every(({ from, to }) => from.length === 2 && to.length === 2));
  assert.ok(data.paths.every(({ points }) => points.length === 4));
  const specification = compilePlaneVegaLite(data, theme);
  assert.equal(specification.width, "container");
  assert.ok(specification.layer.some(({ mark }) => mark?.type === "rule"));
  assert.ok(specification.layer.some(({ mark, encoding }) => mark?.type === "line" && encoding?.strokeDash?.field === "tone"));
  assert.ok(specification.layer.some(({ mark }) => mark?.type === "point" && mark?.shape === "triangle"));
  assert.ok(specification.layer.some(({ mark, encoding }) => mark?.type === "point" && mark?.filled && encoding?.shape?.field === "tone"));
});

test("plane rejeita agrupamento cromático ambíguo", () => {
  const data = planePackage.normalize({
    xAxis: { label: "x", domain: [0, 2] },
    yAxis: { label: "y", domain: [0, 2] },
    groups: [{ id: "original", label: "Original" }],
    points: [{ id: "p", label: "p", group: "não-declarado", at: [1, 1] }]
  });
  assert.match(planePackage.validate(data).join(" "), /grupo declarado/iu);
});

test("plane rejeita o vetor ambíguo da versão abolida", () => {
  const old = RESOURCE_PACKAGE_REGISTRY.validateInstance(instance("aralearn.resource.plane", {
    prompt: "Observe o vetor.",
    vector: [2, 1]
  }), "content");
  assert.equal(old.valid, false);
  assert.match(old.errors.join(" "), /schema|xAxis|yAxis|vector/iu);
});
