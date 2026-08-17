import { academicProfile } from "../../sdk/academic.js";
import { stripPackageManualTextMarkersDeep } from "../../kernel/manualTextMarkers.js";
import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

const VIEWBOX = Object.freeze({ width: 300, height: 250, padding: 20 });
const MARKER_RADIUS = 11;
const MARKER_CLEARANCE = 2;
let vennModulePromise = null;

function text(value) {
  return String(value ?? "").trim();
}

function membershipKey(ids) {
  return [...ids].sort().join("+");
}

function combinations(ids) {
  const output = [];
  for (let mask = 1; mask < 2 ** ids.length; mask += 1) {
    output.push(ids.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return output;
}

function vennModuleUrl() {
  const stylesheet = [...document.styleSheets].find(({ href }) => href?.endsWith("/styles.css"));
  return stylesheet?.href
    ? new URL("vendor/venn.esm.js", stylesheet.href).href
    : new URL("public/vendor/venn.esm.js", document.baseURI).href;
}

function loadVennModule() {
  if (!vennModulePromise) vennModulePromise = import(vennModuleUrl());
  return vennModulePromise;
}

function topologyAreas(data) {
  const ids = data.sets.map(({ id }) => id);
  const regionByKey = new Map(data.regions.map((region) => [membershipKey(region.setIds), region]));
  return combinations(ids).map((setIds) => {
    if (data.kind === "venn") {
      const symmetricSize = setIds.length === 1 ? 12 : setIds.length === 2 ? 4 : 1.4;
      return { sets: setIds, size: symmetricSize };
    }
    const inclusiveSize = data.regions
      .filter((region) => setIds.every((id) => region.setIds.includes(id)))
      .reduce((sum, region) => sum + region.items.length, 0);
    const declaredEmptyRegion = regionByKey.has(membershipKey(setIds)) && inclusiveSize === 0;
    return { sets: setIds, size: declaredEmptyRegion ? 0 : inclusiveSize };
  });
}

function svgElement(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function appendSetShapes(svg, data, layout) {
  const setById = new Map(data.sets.map((set, index) => [set.id, { ...set, index }]));
  layout.filter(({ data: area }) => area.sets.length === 1).forEach((area) => {
    const set = setById.get(area.data.sets[0]);
    if (!set) return;
    const path = svgElement("path", {
      d: area.path,
      class: `package-set-shape tone-${set.index}`,
      "data-set-id": set.id
    });
    svg.append(path);
    const circle = area.circles[0];
    const label = svgElement("text", {
      x: circle.x,
      y: Math.max(15, circle.y - circle.radius + 17),
      class: `package-set-name tone-${set.index}`,
      "text-anchor": "middle"
    });
    label.textContent = set.symbol;
    svg.append(label);
  });
}

function circleBySetId(layout) {
  return new Map(layout
    .filter(({ data: area }) => area.sets.length === 1)
    .map((area) => [area.data.sets[0], area.circles[0]]));
}

function exactRegionClearance(point, includedIds, circles) {
  const included = new Set(includedIds);
  return Math.min(...[...circles].map(([id, circle]) => {
    const distance = Math.hypot(point.x - circle.x, point.y - circle.y);
    return included.has(id) ? circle.radius - distance : distance - circle.radius;
  }));
}

function labelClearance(point, circles) {
  return Math.min(...[...circles.values()].map((circle) => (
    Math.hypot(point.x - circle.x, point.y - (circle.y - circle.radius + 17)) - 20
  )));
}

export function findExactRegionMarker(setIds, layout) {
  const circles = circleBySetId(layout);
  let best = null;
  for (let y = VIEWBOX.padding; y <= VIEWBOX.height - VIEWBOX.padding; y += 2) {
    for (let x = VIEWBOX.padding; x <= VIEWBOX.width - VIEWBOX.padding; x += 2) {
      const point = { x, y };
      const regionClearance = exactRegionClearance(point, setIds, circles);
      const clearance = Math.min(regionClearance, labelClearance(point, circles));
      if (!best || clearance > best.clearance) best = { ...point, clearance };
    }
  }
  return best;
}

function appendRegionMarkers(svg, data, layout) {
  const circles = circleBySetId(layout);
  data.regions.forEach((region, index) => {
    const marker = svgElement("g", {
      class: "package-set-region-marker",
      "data-region-id": region.id,
      "data-region-membership": membershipKey(region.setIds),
      "aria-label": region.label || `Região ${index + 1}`
    });
    let x = VIEWBOX.padding;
    let y = VIEWBOX.padding;
    if (region.setIds.length) {
      const point = findExactRegionMarker(region.setIds, layout);
      if (!point || point.clearance < MARKER_RADIUS + MARKER_CLEARANCE) return;
      ({ x, y } = point);
    }
    marker.setAttribute("data-region-clearance", String(exactRegionClearance({ x, y }, region.setIds, circles)));
    marker.append(svgElement("circle", { cx: x, cy: y, r: MARKER_RADIUS }));
    const number = svgElement("text", { x, y, dy: "0.35em", "text-anchor": "middle" });
    number.textContent = String(index + 1);
    marker.append(number);
    svg.append(marker);
  });
}

export async function hydrateSetDiagrams(root = document) {
  const canvases = [...root.querySelectorAll("[data-set-diagram]")]
    .filter((canvas) => canvas.dataset.setDiagramState !== "ready");
  if (!canvases.length) return;
  try {
    const venn = await loadVennModule();
    canvases.forEach((canvas) => {
      const data = JSON.parse(decodeURIComponent(canvas.dataset.setDiagram || ""));
      const layout = venn.layout(topologyAreas(data), {
        width: VIEWBOX.width,
        height: VIEWBOX.height,
        padding: VIEWBOX.padding,
        distinct: data.kind === "euler",
        symmetricalTextCentre: true
      });
      const svg = canvas.querySelector("svg");
      svg.replaceChildren();
      appendSetShapes(svg, data, layout);
      appendRegionMarkers(svg, data, layout);
      svg.removeAttribute("aria-busy");
      canvas.dataset.setDiagramState = "ready";
    });
  } catch {
    canvases.forEach((canvas) => {
      canvas.dataset.setDiagramState = "error";
      const error = canvas.parentElement?.querySelector(".package-set-layout-error");
      if (error) error.hidden = false;
    });
  }
}

export const setDiagramPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.set_diagram",
    version: "1.0.0",
    label: "Diagrama de conjuntos",
    purpose: "Representar inclusão, exclusão e interseção entre dois ou três conjuntos, preservando as regiões de Venn ou a topologia de Euler.",
    slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["inspect-intersection", "classify-membership", "compare-sets", "apply-set-operation"]),
    academic: academicProfile({
      domains: ["teoria dos conjuntos", "lógica", "probabilidade", "bancos de dados"],
      knowledgeObjects: ["conjunto", "interseção", "união", "complemento", "região"],
      conventions: ["contorno por conjunto", "interseções por sobreposição", "universo explícito quando necessário", "marcador ancorado à região exata", "distinção explícita entre Venn e Euler"],
      appropriateWhen: ["pertencimento simultâneo, ausência de interseção ou operações entre conjuntos são parte da inferência"],
      avoidWhen: ["a relação é entre elementos de domínio e contradomínio", "a tarefa é apenas classificar itens em categorias sem sobreposição", "há mais de três conjuntos relevantes"],
      technologies: ["@upsetjs/venn.js", "SVG responsivo", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection", "classification"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["No máximo três conjuntos por Unidade de estudo.", "Os contornos não codificam cardinalidade; números e itens pertencem à legenda ancorada por marcadores.", "Para mais de três conjuntos, use uma representação de interseções própria, como UpSet."]),
    accessibility: "Cada marcador liga uma região visual a uma descrição textual completa; o desenho nunca é a única fonte de informação."
  }),
  authoringContract: Object.freeze({
    intent: "Escolha Venn para mostrar todas as combinações possíveis ou Euler para mostrar somente interseções existentes; declare pertencimento, nunca círculos ou coordenadas.",
    required: Object.freeze(["kind", "sets", "regions"]),
    optional: Object.freeze(["prompt", "universeLabel"]),
    fieldSemantics: Object.freeze({
      kind: "venn preserva todas as regiões lógicas; euler preserva somente relações de inclusão e interseção existentes nos dados.",
      sets: "Conjuntos que definem os contornos; symbol é a notação curta junto da curva e label é sua descrição por extenso.",
      regions: "Cada região declara exatamente a quais conjuntos seus elementos pertencem; setIds vazio significa exterior aos conjuntos."
    }),
    visualGrammar: Object.freeze(["Curva fechada = conjunto identificado por seu símbolo.", "Sobreposição = interseção.", "Número dentro da região = descrição homônima na legenda.", "Ausência de sobreposição em Euler = interseção vazia."]),
    rules: Object.freeze(["Cada region.setIds contém ids existentes e sem repetição.", "Regiões semanticamente iguais não se repetem.", "Não use Venn/Euler para uma simples lista ou pareamento.", "Use relation_map para pares entre domínio e contradomínio.", "Use no máximo três conjuntos."]),
    example: Object.freeze({
      prompt: "Classifique as linguagens por paradigma e observe quais pertencem simultaneamente a mais de um conjunto.",
      kind: "venn",
      universeLabel: "Linguagens analisadas",
      sets: [
        { id: "imperative", symbol: "I", label: "Imperativas" },
        { id: "object", symbol: "O", label: "Orientadas a objetos" },
        { id: "functional", symbol: "F", label: "Funcionais" }
      ],
      regions: [
        { id: "all", setIds: ["imperative", "object", "functional"], label: "Multiparadigma nos três grupos", items: ["Python", "Scala"] },
        { id: "imperative-object", setIds: ["imperative", "object"], label: "Imperativa e orientada a objetos", items: ["Java"] },
        { id: "functional-only", setIds: ["functional"], label: "Funcional neste recorte", items: ["Haskell"] },
        { id: "outside", setIds: [], label: "Fora dos três critérios", items: ["SQL declarativa"] }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["kind", "sets", "regions"], properties: {
    prompt: { type: "string" },
    kind: { type: "string", enum: ["venn", "euler"] },
    universeLabel: { type: "string" },
    sets: { type: "array", minItems: 2, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["id", "symbol", "label"], properties: { id: { type: "string", minLength: 1 }, symbol: { type: "string", minLength: 1, maxLength: 4 }, label: { type: "string", minLength: 1 } } } },
    regions: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["id", "setIds", "items"], properties: { id: { type: "string", minLength: 1 }, setIds: { type: "array", maxItems: 3, uniqueItems: true, items: { type: "string", minLength: 1 } }, label: { type: "string" }, items: { type: "array", items: { type: "string", minLength: 1 } } } } }
  } }),
  normalize(data) {
    return {
      ...(data?.prompt ? { prompt: text(data.prompt) } : {}),
      kind: text(data?.kind),
      ...(data?.universeLabel ? { universeLabel: text(data.universeLabel) } : {}),
      sets: (data?.sets || []).map((set) => ({ id: text(set?.id), symbol: text(set?.symbol), label: text(set?.label) })),
      regions: (data?.regions || []).map((region) => ({ id: text(region?.id), setIds: (region?.setIds || []).map(text), ...(region?.label ? { label: text(region.label) } : {}), items: (region?.items || []).map(text) }))
    };
  },
  validate(data) {
    const setIds = new Set(data.sets.map(({ id }) => id));
    const setSymbols = new Set(data.sets.map(({ symbol }) => symbol));
    const regionIds = new Set(data.regions.map(({ id }) => id));
    const keys = data.regions.map(({ setIds: ids }) => membershipKey(ids));
    const errors = [];
    if (setIds.size !== data.sets.length) errors.push("Conjuntos precisam de ids únicos.");
    if (setSymbols.size !== data.sets.length) errors.push("Símbolos dos conjuntos precisam ser únicos.");
    if (regionIds.size !== data.regions.length) errors.push("Regiões precisam de ids únicos.");
    if (data.regions.some(({ setIds: ids }) => ids.some((id) => !setIds.has(id)))) errors.push("Região referencia conjunto inexistente.");
    if (new Set(keys).size !== keys.length) errors.push("Cada combinação de pertencimento pode aparecer uma única vez.");
    if (data.kind === "euler" && data.sets.some((set) => !data.regions.some((region) => region.setIds.includes(set.id) && region.items.length))) errors.push("Em Euler, cada conjunto precisa possuir ao menos um elemento representado.");
    return errors;
  },
  render(data) {
    const setById = new Map(data.sets.map((set) => [set.id, set]));
    const encoded = encodeURIComponent(JSON.stringify(stripPackageManualTextMarkersDeep(data)));
    const diagramLabel = `${data.kind === "venn" ? "Diagrama de Venn" : "Diagrama de Euler"}: ${data.sets.map(({ label }) => label).join(", ")}.`;
    return `<div class="runtime-block package-set-diagram">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure><div class="package-set-canvas" data-set-diagram="${escapePackageAttribute(encoded)}" data-set-diagram-state="pending"><svg viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="${escapePackageAttribute(diagramLabel)}" aria-busy="true"></svg></div><dl class="package-set-key">${data.sets.map((set, index) => `<div class="tone-${index}"><dt>${renderPackageInline(set.symbol)}</dt><dd>${renderPackageInline(set.label)}</dd></div>`).join("")}</dl><figcaption>${data.universeLabel ? `<strong>Universo: ${renderPackageInline(data.universeLabel)}</strong>` : ""}<ol>${data.regions.map((region, index) => `<li><b aria-hidden="true">${index + 1}</b><span>${region.setIds.length ? region.setIds.map((id) => renderPackageInline(setById.get(id)?.symbol || id)).join(" ∩ ") : "Fora dos conjuntos"}</span>${region.label ? `<strong>${renderPackageInline(region.label)}</strong>` : ""}<small>${region.items.length ? region.items.map(renderPackageInline).join(", ") : "∅"}</small></li>`).join("")}</ol></figcaption><p class="package-set-layout-error" hidden>Não foi possível diagramar os conjuntos.</p></figure></div>`;
  },
  hydrate: hydrateSetDiagrams,
  accessibleText(data) {
    const sets = new Map(data.sets.map((set) => [set.id, set.label]));
    return `${data.prompt || "Diagrama de conjuntos."} ${data.kind === "venn" ? "Diagrama de Venn" : "Diagrama de Euler"}. ${data.regions.map((region) => `${region.setIds.length ? region.setIds.map((id) => sets.get(id)).join(" e ") : "fora dos conjuntos"}: ${region.items.length ? region.items.join(", ") : "conjunto vazio"}`).join("; ")}.`;
  },
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...(data.universeLabel ? [{ path: "universeLabel", label: "Editar universo" }] : []), ...data.sets.flatMap((_, index) => [{ path: `sets[${index}].symbol`, label: `Editar símbolo do conjunto ${index + 1}` }, { path: `sets[${index}].label`, label: `Editar nome do conjunto ${index + 1}` }]), ...data.regions.flatMap((region, regionIndex) => [...(region.label ? [{ path: `regions[${regionIndex}].label`, label: `Editar região ${regionIndex + 1}` }] : []), ...region.items.map((_, itemIndex) => ({ path: `regions[${regionIndex}].items[${itemIndex}]`, label: `Editar elemento ${regionIndex + 1}.${itemIndex + 1}` }))])];
  },
  practiceTargets(data) {
    return data.regions.flatMap((region, regionIndex) => region.items.map((_, itemIndex) => ({ path: `regions[${regionIndex}].items[${itemIndex}]`, label: `Lacuna no elemento ${regionIndex + 1}.${itemIndex + 1}`, modes: ["gap", "typing"] })));
  }
});
