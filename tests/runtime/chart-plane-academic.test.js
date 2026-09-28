import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_PACKAGE_REGISTRY, chartPackage, planePackage } from "../../src/resources/packages/index.js";
import { compileChartVegaLite } from "../../src/resources/packages/chart/index.js";
import { compilePlaneVegaLite, resolvePlaneLabelOffsets } from "../../src/resources/packages/plane/index.js";
import { compile as compileVegaLite } from "vega-lite";
import { instrumentPackageManualTextTargets } from "../../src/resources/kernel/manualTextMarkers.js";

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

test("chart conserva nome e unidade do eixo x em linhas nativas sem reduzir fonte ou perder edição", () => {
  const data = chartPackage.normalize(chartPackage.authoringContract.example);
  const specification = compileChartVegaLite(data, theme);
  const compiled = compileVegaLite(specification).spec;
  const horizontal = compiled.axes.find(axis => axis.scale === "x" && axis.title);
  assert.deepEqual(horizontal.title, ["Concorrência", "(requisições simultâneas)"]);
  assert.equal(horizontal.title.join(" "), `${data.xAxis.label} (${data.xAxis.unit})`);
  assert.ok(horizontal.titleLimit == null || horizontal.titleLimit === 0);
  assert.equal(specification.config.axis.titleFontSize, 12);
  assert.equal(compiled.axes.find(axis => axis.scale === "y" && axis.title).title,
    `${data.yAxis.label} (${data.yAxis.unit})`);
  assert.ok(chartPackage.accessibleText(data).includes(horizontal.title.join(" ")));
  const html = chartPackage.render(instrumentPackageManualTextTargets(data, chartPackage.editableTargets(data)));
  assert.match(html, /data-package-manual-x-axis-path="xAxis.label"/u);
  assert.ok(html.includes(`data-package-manual-x-axis-suffix=" (${data.xAxis.unit})"`));
  const encoded = /data-chart-data="([^"]+)"/u.exec(html)[1];
  assert.deepEqual(JSON.parse(decodeURIComponent(encoded)), data, "A quebra visual não modifica a base salva nem a cópia de edição.");
  const withoutUnit = structuredClone(data);
  delete withoutUnit.xAxis.unit;
  assert.equal(compileVegaLite(compileChartVegaLite(withoutUnit, theme)).spec.axes
    .find(axis => axis.scale === "x" && axis.title).title, data.xAxis.label);
});

test("plane acadêmico diferencia pontos, vetores aplicados e regiões em domínios explícitos", () => {
  const data = planePackage.normalize(planePackage.authoringContract.example);
  const deliveredContract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.resource.plane",
    "1.0.0"
  ).contract;
  assert.deepEqual(planePackage.validate(data), []);
  assert.equal(data.points.length, 2);
  assert.equal(data.vectors.length, 4);
  assert.equal(data.paths.length, 2);
  assert.match(deliveredContract.fieldSemantics.groups, /não altera o tipo geométrico/iu);
  assert.match(deliveredContract.fieldSemantics.vectors, /to.*extremidade.*ponta.*termina/iu);
  assert.match(deliveredContract.visualGrammar.geometricType, /círculo para ponto/iu);
  assert.match(deliveredContract.visualGrammar.semanticGroup, /nunca transformam ponto em losango/iu);
  assert.deepEqual(data.groups.map(({ label }) => label), ["Objeto original", "Imagem por A"]);
  assert.ok([...data.points, ...data.vectors, ...data.paths].every(({ group }) => ["original", "image"].includes(group)));
  assert.ok(data.vectors.every(({ from, to }) => from.length === 2 && to.length === 2));
  assert.ok(data.paths.every(({ points }) => points.length === 4));
  const specification = compilePlaneVegaLite(data, theme);
  // Largura natural fixa: o quadro compartilhado de diagramas dá rolagem, zoom e tela inteira
  // em vez de espremer rótulos e eixos na largura conceitual do celular.
  assert.equal(specification.width, 520);
  assert.equal(specification.autosize, undefined);
  assert.ok(specification.layer.some(({ mark }) => mark?.type === "rule"));
  assert.ok(specification.layer.some(({ mark, encoding }) => mark?.type === "line" && !mark?.point && encoding?.strokeDash?.field === "tone"));
  assert.equal(specification.layer.filter(({ mark }) => mark?.shape === "triangle-up").length, 0);
  assert.ok(specification.layer.some(({ mark, encoding }) => mark?.type === "point" && mark?.shape === "circle" && !encoding?.shape));
  const vectorLabels = Object.fromEntries(
    specification.layer
      .filter(({ mark }) => mark?.type === "text")
      .flatMap(({ data: layerData }) => layerData?.values || [])
      .filter(({ id }) => ["e1", "e2", "ae1", "ae2"].includes(id))
      .map((value) => [value.id, value])
  );
  assert.ok(vectorLabels.e1.labelX > 0 && vectorLabels.e1.labelX < 1);
  assert.ok(vectorLabels.e1.labelY > 0);
  assert.ok(vectorLabels.e2.labelX < 0);
  assert.ok(vectorLabels.e2.labelY > 0 && vectorLabels.e2.labelY < 1);
  assert.notEqual(vectorLabels.e1.labelX, data.vectors[0].to[0]);
  assert.notEqual(vectorLabels.e2.labelY, data.vectors[1].to[1]);
});

test("plane quebra títulos longos e preserva pontos e offsets junto aos limites", () => {
  const data = planePackage.normalize({
    xAxis: { label: "Número de entregas no mês", unit: "entregas", domain: [29, 34] },
    yAxis: { label: "Custo total", unit: "R$", domain: [178, 200] },
    groups: [{ id: "base", label: "Base" }, { id: "flex", label: "Flex" }],
    points: [
      { id: "base32", label: "Base32", group: "base", at: [32, 192] },
      { id: "flex32", label: "Flex32", group: "flex", at: [32, 192] },
      { id: "base33", label: "Base33", group: "base", at: [33, 198] },
      { id: "flex33", label: "Flex33", group: "flex", at: [33, 197] }
    ]
  });
  const specification = compilePlaneVegaLite(data, theme);
  const compiled = compileVegaLite(specification).spec;
  const horizontal = compiled.axes.find(axis => axis.scale === "x" && axis.title);
  const vertical = compiled.axes.find(axis => axis.scale === "y" && axis.title);
  assert.deepEqual(horizontal.title, ["Número de entregas", "no mês", "(entregas)"]);
  assert.deepEqual(vertical.title, ["Custo total", "(R$)"]);
  const labels = Object.fromEntries(specification.layer
    .filter(({ mark }) => mark?.type === "text")
    .flatMap(({ data: layerData }) => layerData?.values || [])
    .filter(({ id }) => id)
    .map(value => [value.id, value]));
  assert.deepEqual([labels.base32.x, labels.base32.y], [32, 192]);
  assert.deepEqual([labels.flex32.x, labels.flex32.y], [32, 192]);
  assert.deepEqual([labels.base33.x, labels.base33.y], [33, 198]);
  assert.deepEqual([labels.flex33.x, labels.flex33.y], [33, 197]);
  // A associação vive nas coordenadas do dado; o pós-layout nunca grava na camada autoral e
  // parte sempre da âncora, de modo que a exploração não acumula deslocamento. Estes dx/dy são
  // só o primeiro afastamento do rótulo: o encaixe pode afastá-lo bem mais quando precisa.
  assert.ok(Object.values(labels).every(({ dx, dy }) => Math.abs(dx) <= 12 && Math.abs(dy) <= 12));
  assert.notDeepEqual([labels.base32.x, labels.base32.y], [labels.flex33.x, labels.flex33.y]);
  const edgeData = planePackage.normalize({
    xAxis: { label: "x", domain: [29, 34] },
    yAxis: { label: "y", domain: [178, 200] },
    points: [{ id: "low", label: "low", at: [29, 178] }, { id: "high", label: "high", at: [34, 200] }]
  });
  const edgeLabels = Object.fromEntries(compilePlaneVegaLite(edgeData, theme).layer
    .filter(({ mark }) => mark?.type === "text")
    .flatMap(({ data: layerData }) => layerData?.values || [])
    .map(value => [value.id, value]));
  assert.deepEqual([edgeLabels.low.dx, edgeLabels.low.dy], [8, -9]);
  assert.deepEqual([edgeLabels.high.dx, edgeLabels.high.dy], [-8, 12]);
});

const planeTestBoxOverlap = (left, right) => Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
  Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
const planeTestInside = (box, bounds) => box.left >= bounds.left - 0.001 && box.right <= bounds.right + 0.001 &&
  box.top >= bounds.top - 0.001 && box.bottom <= bounds.bottom + 0.001;

test("plane separa rótulos coincidentes e é determinístico, sem acumular deslocamento", () => {
  const entries = [
    { key: "base32", home: { x: 120, y: 90 }, boxOffset: { left: 0, right: 38, top: -12, bottom: 3 } },
    { key: "flex32", home: { x: 120, y: 90 }, boxOffset: { left: 0, right: 34, top: -12, bottom: 3 } },
    { key: "base33", home: { x: 150, y: 118 }, boxOffset: { left: 0, right: 38, top: -12, bottom: 3 } },
    { key: "flex33", home: { x: 150, y: 118 }, boxOffset: { left: 0, right: 34, top: -12, bottom: 3 } }
  ];
  const bounds = { left: 0, top: 0, right: 240, bottom: 200 };
  const first = resolvePlaneLabelOffsets(entries, { bounds, blockedBoxes: [] });
  const second = resolvePlaneLabelOffsets(entries, { bounds, blockedBoxes: [] });
  assert.deepEqual(first, second, "o mesmo insumo precisa reproduzir o mesmo encaixe");
  assert.deepEqual(first.map(({ offset }) => offset[0]), [0, 0, 0, 0],
    "o deslocamento de rótulos vizinhos é vertical, não lateral");
  assert.ok(Math.abs(first[1].offset[1]) >= 15 && Math.abs(first[3].offset[1]) >= 15,
    "o rótulo coincidente sai da caixa do vizinho");
  assert.ok(first[0].box.left === first[1].box.left && first[2].box.left === first[3].box.left,
    "os pares partem da mesma coluna");
  assert.deepEqual(first.map(({ displaced }) => displaced), [false, true, false, true]);
  for (const item of first) assert.ok(planeTestInside(item.box, bounds), `${item.key} precisa permanecer no gráfico`);
  for (let left = 0; left < first.length; left += 1) {
    for (let right = left + 1; right < first.length; right += 1) {
      assert.equal(planeTestBoxOverlap(first[left].box, first[right].box), 0,
        `${first[left].key} e ${first[right].key} não podem se sobrepor`);
    }
  }
});

test("plane encaixa muitos rótulos longos na área natural do gráfico", () => {
  // Área do gráfico na largura natural de 520px; o que não couber na largura conceitual do
  // celular fica acessível pela rolagem, zoom e tela inteira do quadro compartilhado.
  const bounds = { left: 60, top: 10, right: 470, bottom: 195 };
  const entries = Array.from({ length: 12 }, (_, index) => ({
    key: `p${index}`,
    home: { x: 90 + (index % 3) * 120, y: 30 + index * 12 },
    boxOffset: { left: 0, right: 110 + (index % 5) * 6, top: -12, bottom: 3 }
  }));
  const settled = resolvePlaneLabelOffsets(entries, { bounds, blockedBoxes: [] });
  for (const item of settled) assert.ok(planeTestInside(item.box, bounds), `${item.key} precisa caber no gráfico`);
  for (let left = 0; left < settled.length; left += 1) {
    for (let right = left + 1; right < settled.length; right += 1) {
      assert.equal(planeTestBoxOverlap(settled[left].box, settled[right].box), 0,
        `rótulos longos ${settled[left].key}/${settled[right].key} não podem se sobrepor`);
    }
  }
  assert.ok(settled.some(({ displaced }) => displaced), "há deslocamento quando os rótulos concorrem pelo mesmo espaço");
});

test("plane reutiliza o quadro compartilhado de exploração do diagrama", () => {
  const data = planePackage.normalize({
    xAxis: { label: "Número de entregas", unit: "un", domain: [29, 34] },
    yAxis: { label: "Custo", unit: "R$", domain: [178, 200] },
    points: [{ id: "p", label: "Base32", at: [32, 192] }]
  });
  const html = planePackage.render(data);
  assert.match(html, /data-diagram-viewport-home/u);
  assert.match(html, /data-diagram-modal/u);
  assert.match(html, /data-diagram-action="zoom-out"/u);
  assert.match(html, /data-diagram-action="zoom-in"/u);
  assert.match(html, /data-diagram-action="toggle-expanded"/u);
  assert.equal((html.match(/class="package-plane-canvas"/gu) || []).length, 1);
  assert.match(html, /class="package-plane-canvas" data-resource-scroll-frame="diagram"/u);
  assert.match(html, /tabindex="0"/u);
  assert.match(html, /overflow:auto/u);
  assert.match(html, /data-vega-status="pending"/u);
  assert.match(html, /data-plane-data="/u);
  assert.ok(html.indexOf("data-diagram-frame") < html.indexOf("package-plane-canvas"),
    "o canvas faz parte do quadro compartilhado, não de um contêiner próprio");
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

test("plane rejeita vetor nulo e grupo sem objeto", () => {
  const data = planePackage.normalize({
    xAxis: { label: "x", domain: [0, 2] },
    yAxis: { label: "y", domain: [0, 2] },
    groups: [{ id: "usado", label: "Usado" }, { id: "vazio", label: "Vazio" }],
    vectors: [{ id: "v", label: "v", group: "usado", from: [1, 1], to: [1, 1] }]
  });
  assert.match(planePackage.validate(data).join(" "), /grupo declarado precisa conter|origem e extremidade distintas/iu);
});

test("plane rejeita o vetor ambíguo da versão abolida", () => {
  const old = RESOURCE_PACKAGE_REGISTRY.validateInstance(instance("aralearn.resource.plane", {
    prompt: "Observe o vetor.",
    vector: [2, 1]
  }), "content");
  assert.equal(old.valid, false);
  assert.match(old.errors.join(" "), /schema|xAxis|yAxis|vector/iu);
});
