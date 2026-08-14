import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotAttributesWithHtmlLabel, dotQuote, graphvizHtmlLines, graphvizLayoutAttributes, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

const DEVICE_LABELS = Object.freeze({
  host: "Host",
  router: "Roteador",
  switch: "Switch",
  firewall: "Firewall",
  access_point: "Ponto de acesso",
  server: "Servidor",
  cloud: "Rede externa",
  subnet: "Sub-rede"
});

const DEVICE_SHAPES = Object.freeze({
  host: "box",
  router: "ellipse",
  switch: "box3d",
  firewall: "hexagon",
  access_point: "ellipse",
  server: "component",
  cloud: "oval",
  subnet: "folder"
});

function text(value) {
  return String(value ?? "").trim();
}

function devicePlainLabel(device) {
  return [
    DEVICE_LABELS[device.kind],
    wrapGraphvizLabel(device.label, 24),
    ...(device.address ? [wrapGraphvizLabel(device.address, 28)] : [])
  ].join("\n");
}

function deviceTemplate(device) {
  return `<span class="package-system-diagram-node-content"><small>${renderPackageInline(DEVICE_LABELS[device.kind])}</small><strong>${renderPackageInline(device.label)}</strong>${device.address ? `<code>${renderPackageInline(device.address)}</code>` : ""}</span>`;
}

function deviceGraphvizLabel(device) {
  return `<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2"><TR><TD><FONT POINT-SIZE="12">${graphvizHtmlLines(DEVICE_LABELS[device.kind], 24)}</FONT></TD></TR><TR><TD><B>${graphvizHtmlLines(device.label, 24)}</B></TD></TR>${device.address ? `<TR><TD><FONT FACE="Courier New" POINT-SIZE="13">${graphvizHtmlLines(device.address, 28)}</FONT></TD></TR>` : ""}</TABLE>`;
}

function deviceStatement(device, indent = "  ") {
  return `${indent}${dotQuote(device.id)} ${dotAttributesWithHtmlLabel({ id: `system-node-${device.id}`, class: `package-network-topology-device is-${device.kind}`, shape: DEVICE_SHAPES[device.kind], style: device.kind === "host" ? "rounded" : device.kind === "cloud" ? "dashed" : "solid" }, deviceGraphvizLabel(device))};`;
}

function linkPlainLabel(link) {
  return [link.medium, link.protocol].filter(Boolean).join(" · ");
}

function topologyAccessibleText(data) {
  const names = new Map(data.devices.map(({ id, label }) => [id, label]));
  const segments = new Map(data.segments.map(({ id, label }) => [id, label]));
  return [
    data.prompt,
    ...data.devices.map((device) => `${device.label}, ${DEVICE_LABELS[device.kind]}${device.address ? `, endereço ${device.address}` : ""}${device.segmentId ? `, no segmento ${segments.get(device.segmentId)}` : ", externo aos segmentos"}.`),
    ...data.links.map((link) => `${names.get(link.from)} ${link.directed ? "envia para" : "liga-se a"} ${names.get(link.to)} por ${linkPlainLabel(link)}.`)
  ].filter(Boolean).join(" ");
}

function graphvizSource(data) {
  const clustered = new Set();
  const lines = [
    "digraph NetworkTopology {",
    `  graph ${dotAttributes(graphvizLayoutAttributes("block", { bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: "polyline", outputorder: "edgesfirst", nodesep: "0.48", ranksep: "0.82", newrank: "true", compound: "true" }))};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", margin=\"0.14,0.09\"];",
    "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", arrowsize=\"0.72\"];"
  ];
  data.segments.forEach((segment) => {
    const devices = data.devices.filter(({ segmentId }) => segmentId === segment.id);
    if (!devices.length) return;
    clustered.add(segment.id);
    lines.push(`  subgraph ${dotQuote(`cluster-${segment.id}`)} {`);
    lines.push(`    graph ${dotAttributes({ id: `network-segment-${segment.id}`, class: "package-network-topology-segment", label: wrapGraphvizLabel(segment.label, 34), labelloc: "t", labeljust: "l", margin: "18", style: "rounded,dashed" })};`);
    devices.forEach((device) => lines.push(deviceStatement(device, "    ")));
    lines.push("  }");
  });
  data.devices.filter(({ segmentId }) => segmentId === null || !clustered.has(segmentId)).forEach((device) => {
    lines.push(deviceStatement(device));
  });
  data.links.forEach((link) => {
    lines.push(`  ${dotQuote(link.from)} -> ${dotQuote(link.to)} ${dotAttributes({ id: `system-edge-${link.id}`, class: "package-network-topology-link", label: wrapGraphvizLabel(linkPlainLabel(link), 18), dir: link.directed ? "forward" : "none" })};`);
  });
  lines.push("}");
  return lines.join("\n");
}

function labels(data) {
  return [
    ...data.segments.map((segment) => ({
      kind: "boundary",
      id: segment.id,
      graphvizId: `network-segment-${segment.id}`,
      plain: segment.label,
      html: `<span>${renderPackageInline(segment.label)}</span>`
    })),
    ...data.devices.map((device) => ({ kind: "node", id: device.id, plain: devicePlainLabel(device), html: deviceTemplate(device) })),
    ...data.links.map((link) => ({ kind: "edge", id: link.id, plain: linkPlainLabel(link), html: `<span>${renderPackageInline(linkPlainLabel(link))}</span>` }))
  ];
}

export const networkTopologyPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.network_topology",
    version: "1.0.0",
    label: "Topologia de rede",
    purpose: "Representar equipamentos, segmentos e enlaces de uma rede sem confundi-los com vértices abstratos.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["trace-packet-path", "locate-network-role", "inspect-segmentation", "compare-link"]),
    academic: academicProfile({
      domains: ["redes de computadores", "segurança de redes", "infraestrutura"],
      knowledgeObjects: ["equipamento de rede", "segmento", "enlace", "caminho de pacote"],
      conventions: ["equipamentos tipados e nomeados", "segmentos como fronteiras", "enlaces com meio e direção", "endereçamento junto do equipamento"],
      appropriateWhen: ["a organização física ou lógica da rede e o caminho entre equipamentos participam do raciocínio"],
      avoidWhen: ["a tarefa é teoria abstrata de grafos", "a pilha de protocolos ou o layout de pacote é o objeto"],
      technologies: ["Graphviz", "Viz.js WebAssembly", "SVG", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection", "classification"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Topologias muito densas devem ser recortadas por domínio de broadcast, caminho ou camada.", "A geometria é calculada; não declare coordenadas."]),
    accessibility: "Segmentos, equipamentos e enlaces possuem descrição textual equivalente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare a semântica da topologia; o renderer calcula clusters, rotas, recortes e espaçamento.",
    required: Object.freeze(["segments", "devices", "links"]),
    optional: Object.freeze(["prompt"]),
    fieldSemantics: Object.freeze({ segments: "Domínios, sub-redes, VLANs ou zonas que agrupam equipamentos.", devices: "Elementos concretos da rede, tipados por função.", links: "Enlaces físicos ou lógicos; directed só quando a direção é parte da explicação." }),
    visualGrammar: Object.freeze(["Fronteira tracejada = segmento.", "Forma e estereótipo = papel do equipamento.", "Linha rotulada = enlace.", "Ponta de seta = direção relevante; ausência de ponta = enlace bidirecional."]),
    rules: Object.freeze(["Cada equipamento pertence a um segmento ou é externo.", "Todo enlace referencia equipamentos existentes.", "Não use graph matemático para topologia de rede.", "Não declare coordenadas, ícones, cores ou rotas."]),
    example: Object.freeze({
      prompt: "Acompanhe o caminho HTTPS da estação da VLAN de usuários até a aplicação na DMZ e identifique onde ocorre a filtragem.",
      segments: [{ id: "users", label: "VLAN 10 · usuários · 10.10.10.0/24" }, { id: "dmz", label: "DMZ · 10.10.30.0/24" }],
      devices: [
        { id: "client", label: "Estação de trabalho", kind: "host", segmentId: "users", address: "10.10.10.42" },
        { id: "access", label: "Switch de acesso", kind: "switch", segmentId: "users" },
        { id: "firewall", label: "Firewall de borda", kind: "firewall", segmentId: null },
        { id: "app", label: "Servidor de aplicação", kind: "server", segmentId: "dmz", address: "10.10.30.20:443" },
        { id: "internet", label: "Internet", kind: "cloud", segmentId: null }
      ],
      links: [
        { id: "l1", from: "client", to: "access", medium: "Ethernet", directed: false },
        { id: "l2", from: "access", to: "firewall", medium: "trunk 802.1Q", directed: false },
        { id: "l3", from: "firewall", to: "app", medium: "Ethernet", protocol: "HTTPS", directed: true },
        { id: "l4", from: "firewall", to: "internet", medium: "WAN", directed: false }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["segments", "devices", "links"], properties: {
    prompt: { type: "string" },
    segments: { type: "array", maxItems: 10, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } },
    devices: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "label", "kind", "segmentId"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, kind: { type: "string", enum: Object.keys(DEVICE_LABELS) }, segmentId: { anyOf: [{ type: "string" }, { type: "null" }] }, address: { type: "string" } } } },
    links: { type: "array", maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "from", "to", "medium", "directed"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, medium: { type: "string", minLength: 1 }, protocol: { type: "string" }, directed: { type: "boolean" } } } }
  } }),
  normalize(data) {
    return {
      ...(data?.prompt ? { prompt: text(data.prompt) } : {}),
      segments: (data?.segments || []).map((segment) => ({ id: text(segment?.id), label: text(segment?.label) })),
      devices: (data?.devices || []).map((device) => ({ id: text(device?.id), label: text(device?.label), kind: text(device?.kind) || "host", segmentId: device?.segmentId == null ? null : text(device.segmentId), ...(device?.address ? { address: text(device.address) } : {}) })),
      links: (data?.links || []).map((link) => ({ id: text(link?.id), from: text(link?.from), to: text(link?.to), medium: text(link?.medium), ...(link?.protocol ? { protocol: text(link.protocol) } : {}), directed: link?.directed === true }))
    };
  },
  validate(data) {
    const segments = new Set(data.segments.map(({ id }) => id));
    const devices = new Set(data.devices.map(({ id }) => id));
    const errors = [];
    if (segments.size !== data.segments.length || devices.size !== data.devices.length) errors.push("Segmentos e equipamentos precisam de ids únicos.");
    if (data.devices.some(({ segmentId }) => segmentId && !segments.has(segmentId))) errors.push("Equipamento referencia segmento inexistente.");
    if (data.links.some(({ from, to }) => !devices.has(from) || !devices.has(to))) errors.push("Enlace referencia equipamento inexistente.");
    if (new Set(data.links.map(({ id }) => id)).size !== data.links.length) errors.push("Enlaces precisam de ids únicos.");
    return errors;
  },
  render(data) {
    const diagramLabels = labels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: topologyAccessibleText(data), caption: "Topologia de rede · segmentos, equipamentos e enlaces", labels: diagramLabels, model: { labels: systemDiagramModelLabels(diagramLabels) }, focusId: `system-node-${data.devices[0]?.id || ""}`, errorMessage: "Não foi possível diagramar a topologia." });
    return `<div class="runtime-block package-network-topology">${data.prompt ? renderPackageProse(data.prompt) : ""}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: topologyAccessibleText,
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.segments.map((_, index) => ({ path: `segments[${index}].label`, label: `Editar segmento ${index + 1}` })), ...data.devices.flatMap((device, index) => [{ path: `devices[${index}].label`, label: `Editar equipamento ${index + 1}` }, ...(device.address ? [{ path: `devices[${index}].address`, label: `Editar endereço ${index + 1}` }] : [])]), ...data.links.flatMap((link, index) => [{ path: `links[${index}].medium`, label: `Editar meio ${index + 1}` }, ...(link.protocol ? [{ path: `links[${index}].protocol`, label: `Editar protocolo ${index + 1}` }] : [])])];
  },
  practiceTargets(data) {
    return [...data.devices.map((_, index) => ({ path: `devices[${index}].label`, label: `Lacuna no equipamento ${index + 1}`, modes: ["gap", "typing"] })), ...data.links.flatMap((link, index) => link.protocol ? [{ path: `links[${index}].protocol`, label: `Lacuna no protocolo ${index + 1}`, modes: ["gap", "typing"] }] : [])];
  }
});
