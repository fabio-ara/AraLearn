import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import {
  listPackageManualTextPaths,
  stripPackageManualTextMarkersDeep
} from "../../kernel/manualTextMarkers.js";
import { readVegaTheme, renderVegaLite } from "../../sdk/vegaRuntime.js";
import { annotateVegaManualAxisTitles } from "../../sdk/vegaManualLabels.js";

const AXIS_TYPES = Object.freeze(["quantitative", "temporal", "ordinal"]);
const SCALE_TYPES = Object.freeze(["linear", "log", "symlog", "sqrt"]);

function axisTitle(axis) {
  return `${axis.label}${axis.unit ? ` (${axis.unit})` : ""}`;
}

function axisScale(axis, { zero = false } = {}) {
  return {
    ...(axis.scale ? { type: axis.scale } : {}),
    ...(axis.domain ? { domain: axis.domain } : {}),
    ...(axis.type === "quantitative" && axis.scale !== "log" ? { zero } : {})
  };
}

function flattenedValues(data) {
  return data.series.flatMap((series, seriesIndex) => series.values.map((point, pointIndex) => ({
    seriesId: series.id,
    seriesName: series.name,
    seriesIndex,
    pointIndex,
    x: point.x,
    y: point.y,
    ...(point.lower !== undefined ? { lower: point.lower, upper: point.upper } : {})
  })));
}

function chartAccessibleText(data) {
  const interval = data.uncertainty?.label ? ` Incerteza: ${data.uncertainty.label}.` : "";
  const values = data.series.map((series) => `${series.name}: ${series.values.map((point) => {
    const range = point.lower !== undefined ? `, intervalo de ${point.lower} a ${point.upper}` : "";
    return `${point.x}, ${point.y}${range}`;
  }).join("; ")}`).join(". ");
  return `${data.prompt || "Gráfico estatístico."} Eixo x: ${axisTitle(data.xAxis)}. Eixo y: ${axisTitle(data.yAxis)}.${interval} ${values}${data.caption ? `. Nota: ${data.caption}` : ""}`;
}

function baseEncoding(data, theme) {
  return {
    x: {
      field: "x",
      type: data.xAxis.type,
      title: axisTitle(data.xAxis),
      scale: axisScale(data.xAxis),
      axis: { labelOverlap: "greedy", labelLimit: 72, titlePadding: 10, tickCount: 5 }
    },
    color: {
      field: "seriesId",
      type: "nominal",
      scale: { domain: data.series.map(({ id }) => id), range: theme.colors },
      legend: null
    }
  };
}

function seriesDashEncoding(data) {
  return {
    field: "seriesId",
    type: "nominal",
    scale: { domain: data.series.map(({ id }) => id), range: [[1, 0], [7, 4], [2, 3], [10, 3, 2, 3], [12, 4], [3, 2, 1, 2]] },
    legend: null
  };
}

function seriesShapeEncoding(data) {
  return {
    field: "seriesId",
    type: "nominal",
    scale: { domain: data.series.map(({ id }) => id), range: ["circle", "diamond", "square", "triangle-up", "triangle-down", "cross"] },
    legend: null
  };
}

function yEncoding(data, { zero = false, field = "y", title = axisTitle(data.yAxis) } = {}) {
  return {
    field,
    type: "quantitative",
    title,
    scale: axisScale(data.yAxis, { zero }),
    axis: { labelOverlap: "greedy", labelLimit: 58, titlePadding: 10, tickCount: 5 }
  };
}

function referenceLayers(reference, data, theme) {
  const encoding = reference.axis === "x"
    ? { x: { datum: reference.value, type: data.xAxis.type, scale: axisScale(data.xAxis) } }
    : { y: { datum: reference.value, type: "quantitative", scale: axisScale(data.yAxis) } };
  const labelData = { label: reference.label, x: data.xAxis.domain?.[1], y: data.yAxis.domain?.[1] };
  const labelEncoding = reference.axis === "x"
    ? { x: { datum: reference.value, type: data.xAxis.type, scale: axisScale(data.xAxis) }, y: { datum: data.yAxis.domain?.[1], type: "quantitative", scale: axisScale(data.yAxis) } }
    : { x: { datum: data.xAxis.domain?.[1], type: data.xAxis.type, scale: axisScale(data.xAxis) }, y: { datum: reference.value, type: "quantitative", scale: axisScale(data.yAxis) } };
  return [
    { mark: { type: "rule", strokeDash: [5, 4], strokeWidth: 1.2, color: theme.secondaryText }, encoding },
    ...(data.xAxis.domain && data.yAxis.domain ? [{ data: { values: [labelData] }, mark: { type: "text", align: "right", baseline: "bottom", dx: -3, dy: -3, fontSize: 10, color: theme.secondaryText }, encoding: { ...labelEncoding, text: { field: "label" } } }] : [])
  ];
}

export function compileChartVegaLite(data, theme) {
  const values = flattenedValues(data);
  const base = baseEncoding(data, theme);
  const markEncoding = {
    ...base,
    y: yEncoding(data, { zero: data.chartType === "bar" }),
    ...(data.chartType === "bar" && data.series.length > 1
      ? { xOffset: { field: "seriesId", type: "nominal" } }
      : {})
  };
  const layers = [];
  if (values.some(({ lower }) => lower !== undefined)) {
    layers.push({
      mark: { type: "errorbar", ticks: true, rule: { strokeWidth: 1.3 }, color: theme.secondaryText },
      encoding: {
        ...base,
        y: yEncoding(data, { zero: data.chartType === "bar", field: "lower", title: axisTitle(data.yAxis) }),
        y2: { field: "upper" },
        ...(data.chartType === "bar" && data.series.length > 1
          ? { xOffset: { field: "seriesId", type: "nominal" } }
          : {})
      }
    });
  }
  if (data.chartType === "line") {
    layers.push({ mark: { type: "line", strokeWidth: 2 }, encoding: { ...markEncoding, strokeDash: seriesDashEncoding(data) } });
  }
  layers.push({
    mark: data.chartType === "bar"
      ? { type: "bar", opacity: 0.78 }
      : { type: "point", filled: true, size: 62, strokeWidth: 1 },
    encoding: {
      ...markEncoding,
      ...(data.chartType !== "bar" ? { shape: seriesShapeEncoding(data) } : {}),
      tooltip: [
        { field: "seriesName", type: "nominal", title: "Série" },
        { field: "x", type: data.xAxis.type, title: axisTitle(data.xAxis) },
        { field: "y", type: "quantitative", title: axisTitle(data.yAxis) },
        ...(values.some(({ lower }) => lower !== undefined)
          ? [
              { field: "lower", type: "quantitative", title: "Limite inferior" },
              { field: "upper", type: "quantitative", title: "Limite superior" }
            ]
          : [])
      ]
    }
  });
  layers.push(...(data.referenceLines || []).flatMap((reference) => referenceLayers(reference, data, theme)));
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: "container",
    height: 220,
    autosize: { type: "fit", contains: "padding", resize: true },
    background: null,
    data: { values },
    layer: layers,
    config: {
      font: "system-ui",
      view: { stroke: null },
      axis: {
        domainColor: theme.border,
        tickColor: theme.border,
        gridColor: theme.grid,
        gridOpacity: 0.46,
        labelColor: theme.secondaryText,
        titleColor: theme.text,
        labelFontSize: 11,
        titleFontSize: 12,
        titleFontWeight: 500
      }
    }
  };
}

async function hydrateChart(figure) {
  const canvas = figure.querySelector(".package-chart-canvas");
  if (!canvas || canvas.dataset.vegaStatus === "ready") return;
  const message = figure.querySelector(".package-chart-layout-error");
  if (message) message.hidden = true;
  try {
    const data = JSON.parse(decodeURIComponent(canvas.dataset.chartData || ""));
    const selectors = data.series.map((_, index) => `.package-chart-swatch.tone-${index % 6}`);
    const theme = readVegaTheme(canvas, selectors);
    await renderVegaLite(canvas, compileChartVegaLite(data, theme));
    annotateVegaManualAxisTitles(canvas, [
      {
        axis: "x",
        path: canvas.dataset.packageManualXAxisPath,
        suffix: canvas.dataset.packageManualXAxisSuffix
      },
      {
        axis: "y",
        path: canvas.dataset.packageManualYAxisPath,
        suffix: canvas.dataset.packageManualYAxisSuffix
      }
    ]);
    delete canvas.dataset.packageManualXAxisPath;
    delete canvas.dataset.packageManualXAxisSuffix;
    delete canvas.dataset.packageManualYAxisPath;
    delete canvas.dataset.packageManualYAxisSuffix;
  } catch (error) {
    canvas.dataset.vegaStatus = "error";
    canvas.setAttribute("aria-busy", "false");
    if (message) message.hidden = false;
    throw error;
  }
}

const axisSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["label", "type"],
  properties: {
    label: { type: "string", minLength: 1 },
    unit: { type: "string", minLength: 1 },
    type: { type: "string", enum: AXIS_TYPES },
    scale: { type: "string", enum: SCALE_TYPES },
    domain: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      prefixItems: [{ anyOf: [{ type: "number" }, { type: "string" }] }, { anyOf: [{ type: "number" }, { type: "string" }] }]
    }
  }
});

const pointSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: {
    x: { anyOf: [{ type: "number" }, { type: "string" }] },
    y: { type: "number" },
    lower: { type: "number" },
    upper: { type: "number" }
  },
  dependentRequired: { lower: ["upper"], upper: ["lower"] }
});

export const chartPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.chart", version: "1.0.0", label: "Gráfico estatístico", purpose: "Tornar tendência, comparação quantitativa, escala e incerteza visualmente observáveis.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["compare-quantity", "identify-trend", "inspect-uncertainty", "read-scale", "find-outlier"]), academic: academicProfile({ domains: ["estatística", "ciência de dados", "métodos quantitativos"], knowledgeObjects: ["série quantitativa", "tendência", "intervalo de incerteza", "referência quantitativa"], conventions: ["eixos, unidades e domínios nomeados", "escala quantitativa, temporal ou ordinal explícita", "intervalos identificados", "tipo de marca coerente com o dado"], appropriateWhen: ["a forma quantitativa, a escala ou a incerteza são parte da evidência"], avoidWhen: ["poucos valores são mais claros em texto ou tabela", "o objetivo exige distribuição, boxplot ou histograma sem um package específico"], technologies: ["Vega-Lite", "Vega", "SVG", "HTML semântico"], practiceModes: ["exposition", "gap", "typing", "selection"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["Representa linhas, dispersão e barras; distribuições exigem package específico.", "O autor declara semântica e dados, nunca coordenadas ou sintaxe Vega."]), accessibility: "Eixos, séries, valores, intervalos e nota metodológica possuem descrição textual equivalente." }),
  authoringContract: Object.freeze({
    intent: "Declare eixos, escalas, séries e incerteza; o motor deriva marcas, eixos, domínios e geometria.",
    required: Object.freeze(["chartType", "xAxis", "yAxis", "series"]),
    optional: Object.freeze(["prompt", "uncertainty", "referenceLines", "caption"]),
    rules: Object.freeze(["Unidades, tipos de eixo e escalas não ficam implícitos.", "lower e upper delimitam uma incerteza já calculada e exigem uncertainty.label.", "Não envie Vega, SVG, pixels, cores ou posições.", "Não apresente dados sintéticos como observação empírica."]),
    example: Object.freeze({
      prompt: "Compare o comportamento das duas arquiteturas. Os pontos representam médias de 30 execuções independentes e as barras verticais mostram a incerteza da estimativa.",
      chartType: "line",
      xAxis: { label: "Concorrência", unit: "requisições simultâneas", type: "quantitative", scale: "log", domain: [8, 256] },
      yAxis: { label: "Latência no percentil 95", unit: "ms", type: "quantitative", domain: [80, 540] },
      uncertainty: { label: "Intervalo de confiança de 95%" },
      series: [
        { id: "central", name: "Controle centralizado", values: [{ x: 8, y: 104, lower: 96, upper: 113 }, { x: 16, y: 128, lower: 118, upper: 139 }, { x: 32, y: 169, lower: 156, upper: 184 }, { x: 64, y: 238, lower: 220, upper: 259 }, { x: 128, y: 352, lower: 324, upper: 384 }, { x: 256, y: 486, lower: 445, upper: 531 }] },
        { id: "adaptive", name: "Particionamento adaptativo", values: [{ x: 8, y: 101, lower: 94, upper: 109 }, { x: 16, y: 116, lower: 107, upper: 126 }, { x: 32, y: 142, lower: 131, upper: 154 }, { x: 64, y: 181, lower: 167, upper: 197 }, { x: 128, y: 244, lower: 225, upper: 265 }, { x: 256, y: 329, lower: 301, upper: 360 }] }
      ],
      referenceLines: [{ id: "sla", label: "Limite operacional", axis: "y", value: 300 }],
      caption: "Dados sintéticos para inspeção do resource; IC de 95% calculado por bootstrap percentil."
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["chartType", "xAxis", "yAxis", "series"],
    properties: {
      prompt: { type: "string" },
      chartType: { type: "string", enum: ["bar", "line", "scatter"] },
      xAxis: axisSchema,
      yAxis: { ...axisSchema, properties: { ...axisSchema.properties, type: { type: "string", enum: ["quantitative"] } } },
      uncertainty: { type: "object", additionalProperties: false, required: ["label"], properties: { label: { type: "string", minLength: 1 } } },
      referenceLines: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["id", "label", "axis", "value"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, axis: { type: "string", enum: ["x", "y"] }, value: { anyOf: [{ type: "number" }, { type: "string" }] } } } },
      caption: { type: "string" },
      series: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["id", "name", "values"], properties: { id: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, values: { type: "array", minItems: 1, maxItems: 60, items: pointSchema } } } }
    }
  }),
  normalize(data) {
    const normalizeAxis = (axis) => ({ label: String(axis?.label || "").trim(), type: String(axis?.type || "quantitative"), ...(axis?.unit ? { unit: String(axis.unit).trim() } : {}), ...(axis?.scale ? { scale: String(axis.scale) } : {}), ...(axis?.domain ? { domain: axis.domain.map((value) => typeof value === "number" ? Number(value) : String(value)) } : {}) });
    return {
      ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}),
      chartType: String(data?.chartType || "line"),
      xAxis: normalizeAxis(data?.xAxis),
      yAxis: normalizeAxis(data?.yAxis),
      ...(data?.uncertainty ? { uncertainty: { label: String(data.uncertainty.label || "").trim() } } : {}),
      series: (data?.series || []).map((series) => ({ id: String(series?.id || "").trim(), name: String(series?.name || "").trim(), values: (series?.values || []).map((point) => ({ x: typeof point?.x === "number" ? Number(point.x) : String(point?.x ?? ""), y: Number(point?.y), ...(point?.lower !== undefined ? { lower: Number(point.lower), upper: Number(point.upper) } : {}) })) })),
      ...(data?.referenceLines ? { referenceLines: data.referenceLines.map((reference) => ({ id: String(reference?.id || "").trim(), label: String(reference?.label || "").trim(), axis: String(reference?.axis || "y"), value: typeof reference?.value === "number" ? Number(reference.value) : String(reference?.value ?? "") })) } : {}),
      ...(data?.caption ? { caption: String(data.caption).trim() } : {})
    };
  },
  validate(data) {
    const findings = [];
    const ids = data.series.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) findings.push("Séries precisam de ids únicos.");
    const intervals = flattenedValues(data).filter(({ lower }) => lower !== undefined);
    if (intervals.length && !data.uncertainty?.label) findings.push("Intervalos exigem uncertainty.label.");
    if (intervals.some(({ lower, y, upper }) => lower > y || y > upper)) findings.push("Cada intervalo precisa satisfazer lower ≤ y ≤ upper.");
    for (const [name, axis] of [["xAxis", data.xAxis], ["yAxis", data.yAxis]]) {
      if (axis.domain && axis.domain[0] >= axis.domain[1]) findings.push(`${name}.domain precisa estar em ordem crescente.`);
      if (axis.scale === "log" && axis.domain?.some((value) => Number(value) <= 0)) findings.push(`${name} logarítmico exige domínio positivo.`);
      if (axis.scale && axis.type !== "quantitative") findings.push(`${name}.scale só é permitido em eixo quantitativo.`);
    }
    return findings;
  },
  render(data) {
    const encoded = encodeURIComponent(JSON.stringify(stripPackageManualTextMarkersDeep(data)));
    const xAxisPath = listPackageManualTextPaths(data.xAxis.label)[0] || "";
    const yAxisPath = listPackageManualTextPaths(data.yAxis.label)[0] || "";
    const manualAxes = `${xAxisPath ? ` data-package-manual-x-axis-path="${escapePackageAttribute(xAxisPath)}"` : ""}` +
      `${xAxisPath && data.xAxis.unit ? ` data-package-manual-x-axis-suffix="${escapePackageAttribute(` (${data.xAxis.unit})`)}"` : ""}` +
      `${yAxisPath ? ` data-package-manual-y-axis-path="${escapePackageAttribute(yAxisPath)}"` : ""}` +
      `${yAxisPath && data.yAxis.unit ? ` data-package-manual-y-axis-suffix="${escapePackageAttribute(` (${data.yAxis.unit})`)}"` : ""}`;
    const legend = data.series.map((series, index) => `<li><span class="package-chart-swatch mark-${data.chartType} tone-${index % 6}" aria-hidden="true"></span>${renderPackageInline(series.name)}</li>`).join("");
    return `<div class="runtime-block runtime-chart-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure class="package-chart-figure"><ul class="package-chart-legend">${legend}</ul>${data.uncertainty?.label ? `<p class="package-chart-uncertainty">${renderPackageInline(data.uncertainty.label)}</p>` : ""}<div class="package-chart-canvas" role="img" aria-label="${escapePackageAttribute(chartAccessibleText(data))}" aria-busy="true" data-vega-status="pending" data-chart-data="${escapePackageAttribute(encoded)}"${manualAxes}></div>${data.caption ? `<figcaption class="package-chart-caption">${renderPackageInline(data.caption)}</figcaption>` : ""}<p class="package-chart-layout-error" hidden>Não foi possível materializar o gráfico estatístico.</p></figure></div>`;
  },
  async hydrate(instanceRoot) { await Promise.all([...instanceRoot.querySelectorAll(".package-chart-figure")].map(hydrateChart)); },
  accessibleText(data) { return chartAccessibleText(data); },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), { path: "xAxis.label", label: "Editar eixo x" }, { path: "yAxis.label", label: "Editar eixo y" }, ...data.series.map((_, index) => ({ path: `series[${index}].name`, label: `Editar série ${index + 1}` })), ...(data.caption ? [{ path: "caption", label: "Editar nota metodológica" }] : [])]; },
  practiceTargets(data) { return data.series.map((_, index) => ({ path: `series[${index}].name`, label: `Lacuna na série ${index + 1}`, modes: ["gap", "typing"] })); }
});
