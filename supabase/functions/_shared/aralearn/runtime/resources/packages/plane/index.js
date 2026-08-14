import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import {
  listPackageManualTextPaths,
  stripPackageManualTextMarkersDeep
} from "../../kernel/manualTextMarkers.js";
import { readVegaTheme, renderVegaLite } from "../../sdk/vegaRuntime.js";
import { annotateVegaManualAxisTitles } from "../../sdk/vegaManualLabels.js";

function coordinate(value) {
  return Array.isArray(value) && value.length === 2 ? value.map(Number) : null;
}

function axisTitle(axis) {
  return `${axis.label}${axis.unit ? ` (${axis.unit})` : ""}`;
}

function planeObjects(data) {
  return [
    ...(data.points || []).map((point) => ({ type: "Ponto", id: point.id, label: point.label, group: point.group, coordinates: point.at })),
    ...(data.vectors || []).map((vector) => ({ type: "Vetor", id: vector.id, label: vector.label, group: vector.group, from: vector.from, coordinates: vector.to })),
    ...(data.paths || []).map((path) => ({ type: path.closed ? "Região" : "Trajetória", id: path.id, label: path.label, group: path.group, coordinates: path.points }))
  ];
}

function automaticGroupLabel(type) {
  return { Ponto: "Pontos", Vetor: "Vetores", Região: "Regiões", Trajetória: "Trajetórias" }[type] || type;
}

function planeGroups(data) {
  const objects = planeObjects(data);
  const orderObjects = (members) => [...members].sort((left, right) => {
    const rank = { Vetor: 0, Ponto: 1, Região: 2, Trajetória: 2 };
    return (rank[left.type] ?? 3) - (rank[right.type] ?? 3);
  });
  if (data.groups?.length) {
    return data.groups.map((group) => ({
      ...group,
      objects: orderObjects(objects.filter((object) => object.group === group.id))
    }));
  }
  return [...new Set(objects.map(({ type }) => type))].map((type) => ({
    id: `type:${type}`,
    label: automaticGroupLabel(type),
    objects: objects.filter((object) => object.type === type)
  }));
}

function objectTone(object, data, fallbackType = object.type) {
  return data.groups?.length ? object.group : `type:${fallbackType}`;
}

function planeAccessibleText(data) {
  const groupNames = new Map((data.groups || []).map(({ id, label }) => [id, label]));
  const objects = planeObjects(data).map((object) => {
    const group = object.group ? `, grupo ${groupNames.get(object.group) || object.group}` : "";
    if (object.from) return `${object.type} ${object.label}${group}, de (${object.from.join(", ")}) a (${object.coordinates.join(", ")})`;
    if (Array.isArray(object.coordinates[0])) return `${object.type} ${object.label}${group}: ${object.coordinates.map((point) => `(${point.join(", ")})`).join(", ")}`;
    return `${object.type} ${object.label}${group}: (${object.coordinates.join(", ")})`;
  }).join(". ");
  return `${data.prompt || "Plano cartesiano."} Eixo x: ${axisTitle(data.xAxis)}, domínio de ${data.xAxis.domain.join(" a ")}. Eixo y: ${axisTitle(data.yAxis)}, domínio de ${data.yAxis.domain.join(" a ")}. ${objects}`;
}

function positionEncodings(data, { axes = false, xField = "x", yField = "y" } = {}) {
  return {
    x: {
      field: xField,
      type: "quantitative",
      scale: { domain: data.xAxis.domain, nice: false, zero: false },
      ...(axes ? { axis: { title: axisTitle(data.xAxis), tickCount: 7, labelOverlap: "greedy", titlePadding: 10 } } : {})
    },
    y: {
      field: yField,
      type: "quantitative",
      scale: { domain: data.yAxis.domain, nice: false, zero: false },
      ...(axes ? { axis: { title: axisTitle(data.yAxis), tickCount: 7, labelOverlap: "greedy", titlePadding: 10 } } : {})
    }
  };
}

function toneEncoding(domain, theme) {
  return { field: "tone", type: "nominal", scale: { domain, range: theme.colors }, legend: null };
}

function dashEncoding(domain) {
  return { field: "tone", type: "nominal", scale: { domain, range: [[1, 0], [7, 4], [2, 3], [10, 3, 2, 3], [12, 4], [3, 2, 1, 2]] }, legend: null };
}

function pointLabelOffsets([x, y], [originX = 0, originY = 0] = []) {
  const dx = x - originX;
  const dy = y - originY;
  return { dx: dx < -0.2 ? -8 : 8, dy: dy > 0.2 ? -9 : 12, align: dx < -0.2 ? "right" : "left" };
}

function vectorLabelPosition(vector, data) {
  const [fromX, fromY] = vector.from;
  const [toX, toY] = vector.to;
  const xSpan = data.xAxis.domain[1] - data.xAxis.domain[0];
  const ySpan = data.yAxis.domain[1] - data.yAxis.domain[0];
  const normalizedX = (toX - fromX) / xSpan;
  const normalizedY = (toY - fromY) / ySpan;
  const normalizedLength = Math.hypot(normalizedX, normalizedY) || 1;
  const perpendicularX = -normalizedY / normalizedLength;
  const perpendicularY = normalizedX / normalizedLength;
  const shaftFraction = 0.58;
  const offsetFraction = 0.035;
  return {
    labelX: fromX + ((toX - fromX) * shaftFraction) +
      (perpendicularX * xSpan * offsetFraction),
    labelY: fromY + ((toY - fromY) * shaftFraction) +
      (perpendicularY * ySpan * offsetFraction)
  };
}

export function compilePlaneVegaLite(data, theme) {
  const objects = planeObjects(data);
  const domain = planeGroups(data).map(({ id }) => id);
  const layers = [
    {
      data: { values: [{ x: data.xAxis.domain[0], y: data.yAxis.domain[0] }, { x: data.xAxis.domain[1], y: data.yAxis.domain[1] }] },
      mark: { type: "point", opacity: 0 },
      encoding: positionEncodings(data, { axes: true })
    }
  ];
  if (data.xAxis.domain[0] <= 0 && data.xAxis.domain[1] >= 0) {
    layers.push({ mark: { type: "rule", color: theme.border, strokeWidth: 1.1 }, encoding: { x: { datum: 0, type: "quantitative", scale: { domain: data.xAxis.domain } } } });
  }
  if (data.yAxis.domain[0] <= 0 && data.yAxis.domain[1] >= 0) {
    layers.push({ mark: { type: "rule", color: theme.border, strokeWidth: 1.1 }, encoding: { y: { datum: 0, type: "quantitative", scale: { domain: data.yAxis.domain } } } });
  }
  if (data.paths?.length) {
    const values = data.paths.flatMap((path) => {
      const points = path.closed && path.points[0].some((value, index) => value !== path.points.at(-1)[index])
        ? [...path.points, path.points[0]]
        : path.points;
      const object = objects.find(({ id }) => id === path.id);
      return points.map(([x, y], order) => ({ id: path.id, tone: objectTone(object, data), label: path.label, x, y, order }));
    });
    layers.push({
      data: { values },
      mark: { type: "line", strokeWidth: 2 },
      encoding: { ...positionEncodings(data), color: toneEncoding(domain, theme), strokeDash: dashEncoding(domain), detail: { field: "id" }, order: { field: "order", type: "ordinal" } }
    });
  }
  if (data.vectors?.length) {
    const values = data.vectors.map((vector) => ({
      id: vector.id,
      tone: objectTone(vector, data, "Vetor"),
      label: vector.label,
      x: vector.from[0],
      y: vector.from[1],
      x2: vector.to[0],
      y2: vector.to[1],
      ...vectorLabelPosition(vector, data)
    }));
    layers.push({
      data: { values },
      mark: { type: "rule", strokeWidth: 2.2 },
      encoding: { ...positionEncodings(data), x2: { field: "x2" }, y2: { field: "y2" }, color: toneEncoding(domain, theme), strokeDash: dashEncoding(domain) }
    });
    layers.push(...values.map((value) => ({
      data: { values: [value] },
      mark: {
        type: "text",
        fontSize: 11,
        fontWeight: 600,
        align: "center",
        baseline: "middle",
        color: theme.text
      },
      encoding: {
        ...positionEncodings(data, { xField: "labelX", yField: "labelY" }),
        text: { field: "label" }
      }
    })));
  }
  if (data.points?.length) {
    const values = data.points.map((point) => ({ id: point.id, tone: objectTone(point, data, "Ponto"), label: point.label, x: point.at[0], y: point.at[1], ...pointLabelOffsets(point.at) }));
    layers.push({
      data: { values },
      mark: { type: "point", shape: "circle", filled: true, size: 72, strokeWidth: 1 },
      encoding: { ...positionEncodings(data), color: toneEncoding(domain, theme), tooltip: [{ field: "label", title: "Objeto" }, { field: "x", title: axisTitle(data.xAxis) }, { field: "y", title: axisTitle(data.yAxis) }] }
    });
    layers.push(...values.map((value) => ({
      data: { values: [value] },
      mark: { type: "text", fontSize: 11, fontWeight: 600, dx: value.dx, dy: value.dy, align: value.align, color: theme.text },
      encoding: { ...positionEncodings(data), text: { field: "label" } }
    })));
  }
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: "container",
    height: 250,
    autosize: { type: "fit", contains: "padding", resize: true },
    background: null,
    layer: layers,
    config: {
      font: "system-ui",
      view: { stroke: null },
      axis: { domainColor: theme.border, tickColor: theme.border, gridColor: theme.grid, gridOpacity: 0.46, labelColor: theme.secondaryText, titleColor: theme.text, labelFontSize: 11, titleFontSize: 12, titleFontWeight: 500 }
    }
  };
}

let planeArrowMarkerSequence = 0;

function applyVectorArrowMarkers(canvas, expectedCount) {
  if (!expectedCount) return;
  const svg = canvas.querySelector("svg");
  const shafts = [...(svg?.querySelectorAll('g.mark-rule.role-mark line[x2][y2]') || [])];
  if (!svg || shafts.length !== expectedCount) {
    throw new Error("O renderer não materializou todas as hastes vetoriais do plano.");
  }
  const namespace = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(namespace, "defs");
  const markerSetId = `aralearn-plane-arrow-${planeArrowMarkerSequence += 1}`;
  shafts.forEach((shaft, index) => {
    const marker = document.createElementNS(namespace, "marker");
    const markerId = `${markerSetId}-${index}`;
    marker.setAttribute("id", markerId);
    marker.setAttribute("viewBox", "0 0 9 9");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "4.5");
    marker.setAttribute("markerWidth", "9");
    marker.setAttribute("markerHeight", "9");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("overflow", "visible");
    const head = document.createElementNS(namespace, "path");
    head.setAttribute("d", "M0 0 L9 4.5 L0 9 Z");
    head.setAttribute("fill", shaft.getAttribute("stroke") || "currentColor");
    marker.append(head);
    defs.append(marker);
    shaft.setAttribute("marker-end", `url(#${markerId})`);
    shaft.setAttribute("stroke-linecap", "round");
  });
  svg.prepend(defs);
}

async function hydratePlane(figure) {
  const canvas = figure.querySelector(".package-plane-canvas");
  if (!canvas || canvas.dataset.vegaStatus === "ready") return;
  const message = figure.querySelector(".package-plane-layout-error");
  if (message) message.hidden = true;
  try {
    const data = JSON.parse(decodeURIComponent(canvas.dataset.planeData || ""));
    const selectors = planeGroups(data).map((_, index) => `.package-plane-swatch.tone-${index % 6}`);
    const theme = readVegaTheme(canvas, selectors);
    await renderVegaLite(canvas, compilePlaneVegaLite(data, theme));
    applyVectorArrowMarkers(canvas, data.vectors?.length || 0);
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

const coordinateSchema = Object.freeze({ type: "array", minItems: 2, maxItems: 2, items: { type: "number" } });
const planeAxisSchema = Object.freeze({ type: "object", additionalProperties: false, required: ["label", "domain"], properties: { label: { type: "string", minLength: 1 }, unit: { type: "string", minLength: 1 }, domain: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } } });

export const planePackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.plane", version: "1.0.0", label: "Plano cartesiano", purpose: "Situar pontos, vetores, trajetórias e regiões em duas dimensões com escala acadêmica explícita.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["locate-coordinate", "compare-vector", "inspect-transformation", "trace-path", "read-domain"]), academic: academicProfile({ domains: ["geometria analítica", "álgebra linear", "computação gráfica", "modelagem matemática"], knowledgeObjects: ["ponto", "vetor livre ou aplicado", "trajetória", "região no plano", "transformação linear"], conventions: ["eixos e unidades nomeados", "domínios explícitos", "escala quantitativa consistente", "origem e extremidade de vetores distintas"], appropriateWhen: ["posição, direção, deslocamento, trajetória ou transformação bidimensional são parte da tarefa"], avoidWhen: ["a operação é somente algébrica", "o objeto exige três dimensões, campo vetorial denso ou curvas implícitas"], technologies: ["Vega-Lite", "Vega", "SVG", "HTML semântico"], practiceModes: ["exposition", "selection"] }), responseCompatibility: Object.freeze(["aralearn.response.choice"]), limitations: Object.freeze(["Somente duas dimensões.", "Campos vetoriais, contornos e superfícies exigem packages específicos.", "O autor declara objetos e domínios, nunca pixels ou sintaxe Vega."]), accessibility: "Eixos, domínios, pontos, vetores e trajetórias possuem descrição textual equivalente." }),
  authoringContract: Object.freeze({
    intent: "Expresse uma ideia geométrica bidimensional por eixos, objetos e categorias sem descrever sua aparência; o motor preserva o significado e deriva escala, grade, formas, setas, traços, cores, rótulos e legenda.",
    required: Object.freeze(["xAxis", "yAxis"]),
    optional: Object.freeze(["prompt", "groups", "points", "vectors", "paths"]),
    fieldSemantics: Object.freeze({
      xAxis: "Significado, domínio crescente e unidade opcional da coordenada horizontal.",
      yAxis: "Significado, domínio crescente e unidade opcional da coordenada vertical.",
      groups: "Categorias comparativas opcionais da explicação, como observado/estimado, antes/depois ou original/imagem. Um grupo não altera o tipo geométrico do objeto.",
      points: "Localizações sem direção. Cada ponto declara sua posição em at e sempre é materializado como ponto.",
      vectors: "Segmentos orientados. From é a origem e to é a extremidade onde a ponta da seta termina.",
      paths: "Sequências ordenadas de coordenadas. Closed=false representa uma trajetória; closed=true fecha o contorno de uma região."
    }),
    visualGrammar: Object.freeze({
      geometricType: "Forma comunica o tipo: círculo para ponto, ponta de seta para vetor e contorno para trajetória ou região.",
      semanticGroup: "Cor e padrão de traço comunicam group; nunca transformam ponto em losango nem região em ponto.",
      legend: "A legenda explica os grupos e agrega seus objetos; uma chave separada explica ponto, vetor e região."
    }),
    rules: Object.freeze(["Escolha points, vectors e paths pelo objeto matemático que pretende ensinar; eles podem coexistir em qualquer quantidade admitida pelo schema.", "Declare ao menos um ponto, vetor ou trajetória.", "Use groups somente quando categorias semanticamente relevantes atravessarem os tipos geométricos; exemplos possíveis incluem observado/estimado, antes/depois, referência/resultado e original/imagem.", "Todo objeto referencia exatamente um grupo quando groups existir; não crie um grupo por objeto nem use group para dizer que algo é ponto, vetor ou região.", "Vetor declara origem e extremidade; ponto declara uma posição.", "Trajetória preserva a ordem dos pontos e closed fecha a região.", "Não envie SVG, Vega, cores, símbolos, padrões de traço, pixels ou posições de rótulo."]),
    example: Object.freeze({
      prompt: "Compare a base canônica com sua imagem pela transformação linear A e observe a região transformada.",
      xAxis: { label: "Coordenada x", domain: [-2.5, 3.5] },
      yAxis: { label: "Coordenada y", domain: [-1.5, 3.8] },
      groups: [
        { id: "original", label: "Objeto original" },
        { id: "image", label: "Imagem por A" }
      ],
      vectors: [
        { id: "e1", label: "e₁", group: "original", from: [0, 0], to: [1, 0] },
        { id: "e2", label: "e₂", group: "original", from: [0, 0], to: [0, 1] },
        { id: "ae1", label: "Ae₁", group: "image", from: [0, 0], to: [2, 1] },
        { id: "ae2", label: "Ae₂", group: "image", from: [0, 0], to: [-1, 2] }
      ],
      points: [
        { id: "p", label: "p", group: "original", at: [1.5, -0.5] },
        { id: "ap", label: "Ap", group: "image", at: [3.5, 0.5] }
      ],
      paths: [
        { id: "unit", label: "Q", group: "original", closed: true, points: [[0, 0], [1, 0], [1, 1], [0, 1]] },
        { id: "image", label: "A(Q)", group: "image", closed: true, points: [[0, 0], [2, 1], [1, 3], [-1, 2]] }
      ]
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["xAxis", "yAxis"],
    properties: {
      prompt: { type: "string" },
      xAxis: planeAxisSchema,
      yAxis: planeAxisSchema,
      groups: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } },
      points: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "label", "at"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, group: { type: "string", minLength: 1 }, at: coordinateSchema } } },
      vectors: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "label", "from", "to"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, group: { type: "string", minLength: 1 }, from: coordinateSchema, to: coordinateSchema } } },
      paths: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label", "points"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, group: { type: "string", minLength: 1 }, closed: { type: "boolean" }, points: { type: "array", minItems: 2, maxItems: 80, items: coordinateSchema } } } }
    }
  }),
  normalize(data) {
    const normalizeAxis = (axis) => ({ label: String(axis?.label || "").trim(), ...(axis?.unit ? { unit: String(axis.unit).trim() } : {}), domain: (axis?.domain || []).map(Number) });
    return {
      ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}),
      xAxis: normalizeAxis(data?.xAxis),
      yAxis: normalizeAxis(data?.yAxis),
      ...(data?.groups?.length ? { groups: data.groups.map((group) => ({ id: String(group?.id || "").trim(), label: String(group?.label || "").trim() })) } : {}),
      points: (data?.points || []).map((point) => ({ id: String(point?.id || "").trim(), label: String(point?.label || "").trim(), ...(point?.group ? { group: String(point.group).trim() } : {}), at: coordinate(point?.at) })),
      vectors: (data?.vectors || []).map((vector) => ({ id: String(vector?.id || "").trim(), label: String(vector?.label || "").trim(), ...(vector?.group ? { group: String(vector.group).trim() } : {}), from: coordinate(vector?.from), to: coordinate(vector?.to) })),
      paths: (data?.paths || []).map((path) => ({ id: String(path?.id || "").trim(), label: String(path?.label || "").trim(), ...(path?.group ? { group: String(path.group).trim() } : {}), ...(path?.closed ? { closed: true } : {}), points: (path?.points || []).map(coordinate) }))
    };
  },
  validate(data) {
    const findings = [];
    const objects = planeObjects(data);
    if (!objects.length) findings.push("Plane precisa de ao menos um ponto, vetor ou trajetória.");
    const ids = objects.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) findings.push("Objetos do plano precisam de ids únicos.");
    const groupIds = (data.groups || []).map(({ id }) => id);
    if (new Set(groupIds).size !== groupIds.length) findings.push("Grupos do plano precisam de ids únicos.");
    if (groupIds.length && objects.some(({ group }) => !groupIds.includes(group))) findings.push("Todo objeto precisa referenciar um grupo declarado quando groups é usado.");
    if (!groupIds.length && objects.some(({ group }) => group)) findings.push("Objetos só podem declarar group quando groups existe.");
    if (groupIds.some((groupId) => !objects.some(({ group }) => group === groupId))) findings.push("Todo grupo declarado precisa conter ao menos um objeto.");
    for (const [name, axis] of [["xAxis", data.xAxis], ["yAxis", data.yAxis]]) if (axis.domain[0] >= axis.domain[1]) findings.push(`${name}.domain precisa estar em ordem crescente.`);
    const coordinates = [...(data.points || []).map(({ at }) => at), ...(data.vectors || []).flatMap(({ from, to }) => [from, to]), ...(data.paths || []).flatMap(({ points }) => points)];
    if (coordinates.some((point) => !point?.every(Number.isFinite))) findings.push("Toda coordenada precisa conter dois números finitos.");
    if ((data.vectors || []).some(({ from, to }) => from.every((value, index) => value === to[index]))) findings.push("Vetor precisa ter origem e extremidade distintas.");
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
    const legend = planeGroups(data).map((group, index) => `<li><span class="package-plane-swatch group-line tone-${index % 6}" aria-hidden="true"></span><span><strong>${renderPackageInline(group.label)}</strong><small>${group.objects.map(({ label }) => renderPackageInline(label)).join(", ")}</small></span></li>`).join("");
    const objectKey = `<ul class="package-plane-object-key" aria-label="Convenções geométricas"><li><span class="package-plane-key-symbol point" aria-hidden="true"></span>Ponto</li><li><span class="package-plane-key-symbol vector" aria-hidden="true"></span>Vetor</li><li><span class="package-plane-key-symbol region" aria-hidden="true"></span>Região ou trajetória</li></ul>`;
    return `<div class="runtime-block runtime-plane-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure class="package-plane-figure"><ul class="package-plane-legend" aria-label="Categorias comparadas">${legend}</ul>${objectKey}<div class="package-plane-canvas" role="img" aria-label="${escapePackageAttribute(planeAccessibleText(data))}" aria-busy="true" data-vega-status="pending" data-plane-data="${escapePackageAttribute(encoded)}"${manualAxes}></div><p class="package-plane-layout-error" hidden>Não foi possível materializar o plano cartesiano.</p></figure></div>`;
  },
  async hydrate(instanceRoot) { await Promise.all([...instanceRoot.querySelectorAll(".package-plane-figure")].map(hydratePlane)); },
  accessibleText(data) { return planeAccessibleText(data); },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), { path: "xAxis.label", label: "Editar eixo x" }, { path: "yAxis.label", label: "Editar eixo y" }, ...(data.points || []).map((_, index) => ({ path: `points[${index}].label`, label: `Editar ponto ${index + 1}` })), ...(data.vectors || []).map((_, index) => ({ path: `vectors[${index}].label`, label: `Editar vetor ${index + 1}` })), ...(data.paths || []).map((_, index) => ({ path: `paths[${index}].label`, label: `Editar trajetória ${index + 1}` }))]; },
  practiceTargets() { return []; }
});
