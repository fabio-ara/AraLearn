import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotQuote, graphvizLayoutAttributes, plainGraphvizLabel, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

const PORT_DIRECTIONS = Object.freeze(["in", "out", "inout"]);
const FLOW_DIRECTIONS = Object.freeze(["forward", "reverse", "both", "none"]);

function text(value) {
  return String(value ?? "").trim();
}

function html(value) {
  return String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function htmlLines(value, lineLength = 22) {
  return wrapGraphvizLabel(value, lineLength).split("\n").map(html).join("<BR/>");
}

function partPlainLabel(part, ports) {
  return [`Parte · ${part.type}`, part.label, ...ports.map((port) => `${port.label}: ${port.itemType} (${port.direction})`)].join("\n");
}

function partTemplate(part, ports) {
  return `<span class="package-system-diagram-node-content"><small>Parte · ${renderPackageInline(part.type)}</small><strong>${renderPackageInline(part.label)}</strong>${ports.map((port) => `<span>${renderPackageInline(port.label)}: ${renderPackageInline(port.itemType)} (${renderPackageInline(port.direction)})</span>`).join("")}</span>`;
}

function directionArrow(direction) {
  return direction === "forward" ? "forward" : direction === "reverse" ? "back" : direction === "both" ? "both" : "none";
}

function portRow(port, portName) {
  const label = `<FONT POINT-SIZE="12">${htmlLines(`${port.label}: ${port.itemType}`, 24)}</FONT>`;
  const portCell = (name) => `<TD PORT="${name}" BORDER="1" WIDTH="11" HEIGHT="11" FIXEDSIZE="TRUE"></TD>`;
  const spacer = "<TD BORDER=\"0\" WIDTH=\"11\"></TD>";
  if (port.direction === "inout") return `<TR>${portCell(`${portName}w`)}<TD ALIGN="CENTER">${label}</TD>${portCell(`${portName}e`)}</TR>`;
  return port.direction === "out"
    ? `<TR>${spacer}<TD ALIGN="RIGHT">${label}</TD>${portCell(portName)}</TR>`
    : `<TR>${portCell(portName)}<TD ALIGN="LEFT">${label}</TD>${spacer}</TR>`;
}

function portEndpoint(port, endpoint) {
  const side = port.direction === "inout" ? (endpoint === "from" ? "e" : "w") : port.direction === "out" ? "e" : "w";
  const name = port.direction === "inout" ? `${port.port}${side}` : port.port;
  return `${dotQuote(port.node)}:${name}:${side}`;
}

function internalAccessibleText(data) {
  const partNames = new Map(data.parts.map(({ id, label }) => [id, label]));
  const ports = new Map(data.ports.map((port) => [port.id, port]));
  return [
    data.prompt,
    `Diagrama interno do bloco ${data.block.label}.`,
    ...data.parts.map((part) => `Parte ${part.label}, tipo ${part.type}.`),
    ...data.ports.map((port) => `Porta ${port.label}, item ${port.itemType}, direção ${port.direction}, na parte ${partNames.get(port.partId)}.`),
    ...data.connectors.map((connector) => {
      const from = ports.get(connector.fromPort);
      const to = ports.get(connector.toPort);
      return `${partNames.get(from.partId)}, porta ${from.label}, conecta-se a ${partNames.get(to.partId)}, porta ${to.label}, por ${connector.label}.`;
    })
  ].join(" ");
}

function graphvizSource(data) {
  const portsByPart = new Map(data.parts.map(({ id }) => [id, []]));
  data.ports.forEach((port) => portsByPart.get(port.partId)?.push(port));
  const portName = new Map();
  const partLines = data.parts.map((part) => {
    const ports = portsByPart.get(part.id) || [];
    const rows = ports.map((port, index) => {
      const name = `p${index}`;
      portName.set(port.id, { node: part.id, port: name, direction: port.direction });
      return portRow(port, name);
    }).join("");
    const label = `<<TABLE BORDER="1" COLOR="#64748b" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6"><TR><TD><FONT POINT-SIZE="11">Parte · ${htmlLines(part.type, 24)}</FONT></TD></TR><TR><TD><B>${htmlLines(part.label, 24)}</B></TD></TR>${rows}</TABLE>>`;
    return `    ${dotQuote(part.id)} [id=${dotQuote(`system-node-${part.id}`)}, class=${dotQuote("package-system-internal-part")}, shape=plain, margin=0, label=${label}];`;
  });
  const connectorLines = data.connectors.map((connector) => {
    const from = portName.get(connector.fromPort);
    const to = portName.get(connector.toPort);
    return `  ${portEndpoint(from, "from")} -> ${portEndpoint(to, "to")} ${dotAttributes({ id: `system-edge-${connector.id}`, class: "package-system-internal-connector", label: wrapGraphvizLabel(connector.label, 18), dir: directionArrow(connector.flowDirection), arrowsize: "0.72" })};`;
  });
  return [
    "digraph InternalBlock {",
    `  graph ${dotAttributes(graphvizLayoutAttributes("inline", { bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: "spline", outputorder: "edgesfirst", nodesep: "0.5", ranksep: "0.82" }))};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];",
    "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];",
    `  subgraph cluster_block { graph ${dotAttributes({ id: "system-internal-block-boundary", class: "package-system-internal-boundary", label: `ibd · ${plainGraphvizLabel(data.block.label)}`, labelloc: "t", labeljust: "l", margin: "22", style: "solid" })};`,
    ...partLines,
    "  }",
    ...connectorLines,
    "}"
  ].join("\n");
}

function labels(data) {
  const portsByPart = new Map(data.parts.map(({ id }) => [id, []]));
  data.ports.forEach((port) => portsByPart.get(port.partId)?.push(port));
  return [
    ...data.parts.map((part) => ({ kind: "node", id: part.id, plain: partPlainLabel(part, portsByPart.get(part.id)), html: partTemplate(part, portsByPart.get(part.id)) })),
    ...data.connectors.map((item) => ({ kind: "edge", id: item.id, plain: item.label, html: `<span>${renderPackageInline(item.label)}</span>` }))
  ];
}

function editableTargets(data) {
  return [
    { path: "prompt", label: "Editar orientação" },
    { path: "block.label", label: "Editar nome do bloco" },
    ...data.parts.flatMap((_, index) => [{ path: `parts[${index}].label`, label: `Editar parte ${index + 1}` }, { path: `parts[${index}].type`, label: `Editar tipo da parte ${index + 1}` }]),
    ...data.ports.flatMap((_, index) => [{ path: `ports[${index}].label`, label: `Editar porta ${index + 1}` }, { path: `ports[${index}].itemType`, label: `Editar item da porta ${index + 1}` }]),
    ...data.connectors.map((_, index) => ({ path: `connectors[${index}].label`, label: `Editar conector ${index + 1}` }))
  ];
}

export const systemInternalBlockPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.system_internal_block",
    version: "1.0.0",
    label: "Diagrama interno de bloco",
    purpose: "Representar partes, portas, itens e conectores internos de um bloco segundo a gramática de diagrama interno do SysML.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["inspect-part", "trace-item-flow", "identify-port", "compare-interface", "explain-internal-connection"]),
    academic: academicProfile({ domains: ["engenharia de sistemas", "modelagem de sistemas", "sistemas embarcados", "arquitetura de hardware"], knowledgeObjects: ["bloco", "parte", "porta", "tipo de item", "conector", "fluxo"], conventions: ["quadro ibd nomeado", "partes tipadas", "portas ancoradas à parte", "conectores entre portas", "direção de fluxo explícita"], appropriateWhen: ["a tarefa exige compreender a composição interna e as interfaces de um bloco"], avoidWhen: ["a tarefa é o contexto externo de software", "a tarefa trata apenas de contêineres executáveis", "o objeto é um grafo abstrato"], technologies: ["SysML", "Graphviz", "Viz.js WebAssembly", "SVG"], practiceModes: ["exposition", "gap", "typing", "selection"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Não substitui diagramas paramétricos, de requisitos, de sequência ou de estados.", "Lacunas incidem em rótulos de conectores; portas e partes permanecem estruturalmente estáveis durante a prática."]),
    accessibility: "Bloco, partes, portas, tipos de item, direções e conectores possuem descrição textual equivalente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare composição, interfaces e fluxos internos; o renderer ancora portas e roteia conectores.",
    required: Object.freeze(["prompt", "block", "parts", "ports", "connectors"]),
    optional: Object.freeze([]),
    fieldSemantics: Object.freeze({ block: "Bloco cujo interior é apresentado.", parts: "Instâncias internas com nome e tipo.", ports: "Pontos de interação pertencentes a uma parte e tipados pelo item que transportam.", direction: "in, out ou inout em relação à parte.", connectors: "Ligações entre portas; flowDirection define a direção visual do fluxo." }),
    visualGrammar: Object.freeze(["Quadro ibd nomeado = interior do bloco.", "Retângulo com nome e tipo = parte interna tipada.", "Linha de porta = interface nomeada e tipada.", "Conector toca portas declaradas, nunca o centro arbitrário da parte.", "Ponta de seta = direção de fluxo, não mera decoração."]),
    rules: Object.freeze(["Toda porta pertence a uma parte.", "Todo conector liga duas portas existentes.", "Não declare coordenadas ou lados de ancoragem.", "Use itemType para o que atravessa a porta; não o confunda com a finalidade da conexão.", "Prefira outro recurso quando portas não forem semanticamente importantes."]),
    example: Object.freeze({
      prompt: "Acompanhe dados de sensores e comandos de atuação pelas interfaces internas do controlador.",
      block: { id: "controller", label: "Controlador ambiental" },
      parts: [
        { id: "sensorHub", label: "Concentrador", type: "SensorHub" },
        { id: "control", label: "Lógica de controle", type: "ControlUnit" },
        { id: "actuator", label: "Acionamento", type: "ActuatorDriver" }
      ],
      ports: [
        { id: "samplesOut", partId: "sensorHub", label: "amostras", itemType: "SampleFrame", direction: "out" },
        { id: "samplesIn", partId: "control", label: "telemetria", itemType: "SampleFrame", direction: "in" },
        { id: "commandOut", partId: "control", label: "comando", itemType: "ControlCommand", direction: "out" },
        { id: "commandIn", partId: "actuator", label: "referência", itemType: "ControlCommand", direction: "in" },
        { id: "statusOut", partId: "actuator", label: "estado", itemType: "ActuatorStatus", direction: "out" },
        { id: "statusIn", partId: "control", label: "retorno", itemType: "ActuatorStatus", direction: "in" }
      ],
      connectors: [
        { id: "telemetry", fromPort: "samplesOut", toPort: "samplesIn", label: "transporta amostras calibradas", flowDirection: "forward" },
        { id: "command", fromPort: "commandOut", toPort: "commandIn", label: "envia referência de atuação", flowDirection: "forward" },
        { id: "feedback", fromPort: "statusOut", toPort: "statusIn", label: "retorna estado observado", flowDirection: "forward" }
      ]
    })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["prompt", "block", "parts", "ports", "connectors"],
    properties: {
      prompt: { type: "string", minLength: 1 },
      block: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } },
      parts: { type: "array", minItems: 2, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label", "type"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, type: { type: "string", minLength: 1 } } } },
      ports: { type: "array", minItems: 2, maxItems: 36, items: { type: "object", additionalProperties: false, required: ["id", "partId", "label", "itemType", "direction"], properties: { id: { type: "string", minLength: 1 }, partId: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, itemType: { type: "string", minLength: 1 }, direction: { type: "string", enum: PORT_DIRECTIONS } } } },
      connectors: { type: "array", minItems: 1, maxItems: 36, items: { type: "object", additionalProperties: false, required: ["id", "fromPort", "toPort", "label", "flowDirection"], properties: { id: { type: "string", minLength: 1 }, fromPort: { type: "string", minLength: 1 }, toPort: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, flowDirection: { type: "string", enum: FLOW_DIRECTIONS } } } }
    }
  }),
  normalize(data) {
    return { prompt: text(data?.prompt), block: { id: text(data?.block?.id), label: text(data?.block?.label) }, parts: (data?.parts || []).map((item) => ({ id: text(item?.id), label: text(item?.label), type: text(item?.type) })), ports: (data?.ports || []).map((item) => ({ id: text(item?.id), partId: text(item?.partId), label: text(item?.label), itemType: text(item?.itemType), direction: text(item?.direction) })), connectors: (data?.connectors || []).map((item) => ({ id: text(item?.id), fromPort: text(item?.fromPort), toPort: text(item?.toPort), label: text(item?.label), flowDirection: text(item?.flowDirection) })) };
  },
  validate(data) {
    const partIds = data.parts.map(({ id }) => id);
    const portIds = data.ports.map(({ id }) => id);
    const connectorIds = data.connectors.map(({ id }) => id);
    const parts = new Set(partIds);
    const ports = new Map(data.ports.map((item) => [item.id, item]));
    const errors = [];
    if (parts.size !== partIds.length || ports.size !== portIds.length || new Set(connectorIds).size !== connectorIds.length) errors.push("Partes, portas e conectores precisam de ids únicos em seus escopos.");
    if (data.ports.some(({ partId }) => !parts.has(partId))) errors.push("Porta referencia parte inexistente.");
    if (data.connectors.some(({ fromPort, toPort }) => !ports.has(fromPort) || !ports.has(toPort))) errors.push("Conector referencia porta inexistente.");
    if (data.connectors.some(({ fromPort, toPort }) => ports.get(fromPort)?.partId === ports.get(toPort)?.partId)) errors.push("Conector interno precisa ligar partes distintas.");
    return errors;
  },
  render(data) {
    const diagramLabels = labels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: internalAccessibleText(data), caption: "Diagrama interno de bloco · SysML", labels: diagramLabels, model: { labels: systemDiagramModelLabels(diagramLabels) }, focusId: `system-node-${data.parts[0]?.id || ""}` });
    return `<div class="runtime-block runtime-system-internal-block">${renderPackageProse(data.prompt)}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: internalAccessibleText,
  editableTargets,
  practiceTargets(data) { return data.connectors.map((_, index) => ({ path: `connectors[${index}].label`, label: `Lacuna no conector ${index + 1}`, modes: ["gap", "typing"] })); }
});
