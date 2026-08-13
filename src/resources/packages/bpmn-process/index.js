import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotQuote, plainGraphvizLabel, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { hydrateSystemDiagrams, renderSystemDiagramFigure, systemDiagramModelLabels } from "../system-diagrams/shared.js";

const NODE_KINDS = Object.freeze(["start_event", "end_event", "intermediate_event", "task", "user_task", "service_task", "exclusive_gateway", "parallel_gateway"]);
const FLOW_KINDS = Object.freeze(["sequence", "message"]);
const text = (value) => String(value ?? "").trim();

function nodeSymbol(node) {
  if (node.kind === "exclusive_gateway") return "×";
  if (node.kind === "parallel_gateway") return "+";
  return node.label;
}

function nodeStereotype(node) {
  if (node.kind === "user_task") return "Tarefa de usuário";
  if (node.kind === "service_task") return "Tarefa de serviço";
  if (node.kind === "task") return "Tarefa";
  return "";
}

function nodeGraphvizLabel(node) {
  const stereotype = nodeStereotype(node);
  const label = plainGraphvizLabel(nodeSymbol(node));
  return stereotype ? `${stereotype}\n${label}` : label;
}

function nodeInteractiveLabel(node) {
  const stereotype = nodeStereotype(node);
  return stereotype ? `${stereotype}\n${nodeSymbol(node)}` : nodeSymbol(node);
}

function nodeAttributes(node) {
  const common = { id: `system-node-${node.id}`, class: `package-bpmn-node is-${node.kind}`, label: nodeGraphvizLabel(node), margin: "0.25,0.27" };
  if (node.kind === "start_event") return { ...common, shape: "circle", width: "0.32", height: "0.32", fixedsize: "true", label: " " };
  if (node.kind === "end_event") return { ...common, shape: "doublecircle", width: "0.36", height: "0.36", fixedsize: "true", label: " " };
  if (node.kind === "intermediate_event") return { ...common, shape: "doublecircle", width: "0.48", height: "0.48", fixedsize: "true", label: " " };
  if (["exclusive_gateway", "parallel_gateway"].includes(node.kind)) return { ...common, shape: "diamond", width: "0.66", height: "0.66", fixedsize: "true" };
  return { ...common, shape: "box", style: "rounded", width: "2.05" };
}

function participantSource(participant, data) {
  const participantNodes = data.nodes.filter((node) => node.participant === participant.id);
  const laneLines = participant.lanes.map((lane) => {
    const laneNodes = participantNodes.filter((node) => node.lane === lane.id);
    return [`    subgraph ${dotQuote(`cluster-${participant.id}-${lane.id}`)} {`, `      graph ${dotAttributes({ id: `bpmn-lane-${participant.id}-${lane.id}`, class: "package-bpmn-lane", label: wrapGraphvizLabel(lane.label, 24), style: "rounded,dashed", margin: "14" })};`, ...laneNodes.map((node) => `      ${dotQuote(node.id)} ${dotAttributes(nodeAttributes(node))};`), "    }"].join("\n");
  });
  return [`  subgraph ${dotQuote(`cluster-${participant.id}`)} {`, `    graph ${dotAttributes({ id: `bpmn-participant-${participant.id}`, class: "package-bpmn-participant", label: wrapGraphvizLabel(participant.label, 28), style: "rounded", margin: "18" })};`, ...laneLines, "  }"].join("\n");
}

function graphvizSource(data) {
  return ["digraph BpmnProcess {", `  graph ${dotAttributes({ bgcolor: "transparent", pad: "0.22", margin: "0", overlap: "false", splines: "polyline", outputorder: "edgesfirst", rankdir: "TB", nodesep: "0.5", ranksep: "0.7", compound: "true", newrank: "true" })};`, "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];", "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", arrowsize=\"0.72\"];", ...data.participants.map((participant) => participantSource(participant, data)), ...data.flows.map((flow) => `  ${dotQuote(flow.from)} -> ${dotQuote(flow.to)} ${dotAttributes({ id: `system-edge-${flow.id}`, class: `package-bpmn-flow is-${flow.kind}`, ...(flow.label ? { label: wrapGraphvizLabel(flow.label, 20) } : {}), ...(flow.kind === "message" ? { style: "dashed", arrowhead: "onormal" } : { arrowhead: "normal" }) })};`), "}"].join("\n");
}

function labels(data) {
  return [...data.nodes.filter(({ kind }) => !["start_event", "end_event"].includes(kind)).map((node) => {
    const stereotype = nodeStereotype(node);
    return {
      kind: "node",
      id: node.id,
      plain: nodeInteractiveLabel(node),
      html: `<span class="package-system-diagram-node-content">${stereotype ? `<small>${stereotype}</small>` : ""}<strong>${renderPackageInline(nodeSymbol(node))}</strong></span>`,
      replacement: "always"
    };
  }), ...data.flows.filter((flow) => flow.label).map((flow) => ({ kind: "edge", id: flow.id, plain: flow.label, html: `<span>${renderPackageInline(flow.label)}</span>` }))];
}

function accessibleText(data) {
  const nodes = new Map(data.nodes.map(({ id, label }) => [id, label]));
  return [data.prompt, ...data.participants.map((participant) => `Participante ${participant.label}; raias ${participant.lanes.map(({ label }) => label).join(", ")}.`), ...data.flows.map((flow) => `${nodes.get(flow.from)} segue para ${nodes.get(flow.to)} por fluxo ${flow.kind === "message" ? "de mensagem" : "de sequência"}${flow.label ? `, condição ${flow.label}` : ""}.`)].filter(Boolean).join(" ");
}

export const bpmnProcessPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.bpmn_process", version: "1.0.0", label: "Processo BPMN", purpose: "Representar participantes, raias, eventos, atividades, gateways e fluxos segundo o subconjunto didático de BPMN 2.0.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["trace-business-process", "distinguish-responsibility", "inspect-gateway", "compare-message-and-sequence-flow"]), academic: academicProfile({ domains: ["gestão de processos", "análise de negócios", "engenharia de software"], knowledgeObjects: ["participante", "raia", "evento", "atividade", "gateway", "fluxo de sequência", "fluxo de mensagem"], conventions: ["eventos circulares", "atividades em retângulos arredondados", "gateways em losangos", "fluxo de sequência contínuo", "fluxo de mensagem tracejado", "responsabilidade delimitada por participante e raia"], appropriateWhen: ["o processo de negócio e a responsabilidade entre participantes são parte da tarefa"], avoidWhen: ["o objeto é um algoritmo de programação", "o percurso depende de estado persistente", "um simples procedimento linear basta"], technologies: ["BPMN 2.0", "Graphviz", "Viz.js WebAssembly", "SVG"], practiceModes: ["exposition", "gap", "typing", "selection", "ordering"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.ordering"]), limitations: Object.freeze(["Cobre eventos, tarefas, gateways, raias e fluxos; coreografia e conversação exigem packages próprios.", "Processos extensos devem ser decompostos por subprocesso."]), accessibility: "Participantes, raias, elementos e fluxos possuem descrição textual equivalente." }),
  authoringContract: Object.freeze({ intent: "Declare a semântica BPMN; o renderer escolhe posições, dimensões e rotas e nunca recebe coordenadas.", required: Object.freeze(["participants", "nodes", "flows"]), optional: Object.freeze(["prompt"]), fieldSemantics: Object.freeze({ participants: "Pools e respectivas lanes de responsabilidade.", nodes: "Elementos BPMN pertencentes a participante e raia.", flows: "sequence conecta elementos do mesmo participante; message conecta participantes diferentes." }), visualGrammar: Object.freeze(["Círculo fino = evento inicial.", "Círculo duplo = evento intermediário ou final conforme o tipo.", "Retângulo arredondado = atividade.", "Losango × = gateway exclusivo.", "Losango + = gateway paralelo.", "Linha contínua = sequência; tracejada = mensagem."]), rules: Object.freeze(["Todo nó pertence a participante e raia existentes.", "Fluxo de sequência não cruza participantes.", "Fluxo de mensagem conecta participantes distintos.", "Não declare coordenadas, tamanhos, símbolos ou rotas.", "Use flow para algoritmos e state_machine para comportamento por estado."]), example: Object.freeze({ prompt: "Acompanhe o atendimento de uma solicitação e distinga a decisão exclusiva do fluxo de mensagem entre cliente e organização.", participants: [{ id: "customer", label: "Cliente", lanes: [{ id: "customer_lane", label: "Solicitante" }] }, { id: "organization", label: "Organização", lanes: [{ id: "service", label: "Atendimento" }, { id: "analysis", label: "Análise" }] }], nodes: [{ id: "need", kind: "start_event", label: "Necessidade identificada", participant: "customer", lane: "customer_lane" }, { id: "send", kind: "user_task", label: "Enviar solicitação", participant: "customer", lane: "customer_lane" }, { id: "receive", kind: "start_event", label: "Solicitação recebida", participant: "organization", lane: "service" }, { id: "register", kind: "user_task", label: "Registrar solicitação", participant: "organization", lane: "service" }, { id: "analyze", kind: "user_task", label: "Analisar requisitos", participant: "organization", lane: "analysis" }, { id: "complete", kind: "exclusive_gateway", label: "Dados completos?", participant: "organization", lane: "analysis" }, { id: "request", kind: "user_task", label: "Solicitar complemento", participant: "organization", lane: "service" }, { id: "approve", kind: "service_task", label: "Emitir decisão", participant: "organization", lane: "analysis" }, { id: "finish", kind: "end_event", label: "Solicitação decidida", participant: "organization", lane: "analysis" }], flows: [{ id: "f1", kind: "sequence", from: "need", to: "send" }, { id: "m1", kind: "message", from: "send", to: "receive", label: "solicitação" }, { id: "f2", kind: "sequence", from: "receive", to: "register" }, { id: "f3", kind: "sequence", from: "register", to: "analyze" }, { id: "f4", kind: "sequence", from: "analyze", to: "complete" }, { id: "f5", kind: "sequence", from: "complete", to: "approve", label: "Sim" }, { id: "f6", kind: "sequence", from: "complete", to: "request", label: "Não" }, { id: "f7", kind: "sequence", from: "request", to: "analyze", label: "dados recebidos" }, { id: "f8", kind: "sequence", from: "approve", to: "finish" }] }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["participants", "nodes", "flows"], properties: { prompt: { type: "string" }, participants: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["id", "label", "lanes"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, lanes: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } } } } }, nodes: { type: "array", minItems: 2, maxItems: 36, items: { type: "object", additionalProperties: false, required: ["id", "kind", "label", "participant", "lane"], properties: { id: { type: "string", minLength: 1 }, kind: { type: "string", enum: NODE_KINDS }, label: { type: "string", minLength: 1 }, participant: { type: "string", minLength: 1 }, lane: { type: "string", minLength: 1 } } } }, flows: { type: "array", minItems: 1, maxItems: 72, items: { type: "object", additionalProperties: false, required: ["id", "kind", "from", "to"], properties: { id: { type: "string", minLength: 1 }, kind: { type: "string", enum: FLOW_KINDS }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, label: { type: "string" } } } } } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), participants: (data?.participants || []).map((participant) => ({ id: text(participant?.id), label: text(participant?.label), lanes: (participant?.lanes || []).map((lane) => ({ id: text(lane?.id), label: text(lane?.label) })) })), nodes: (data?.nodes || []).map((node) => ({ id: text(node?.id), kind: text(node?.kind), label: text(node?.label), participant: text(node?.participant), lane: text(node?.lane) })), flows: (data?.flows || []).map((flow) => ({ id: text(flow?.id), kind: text(flow?.kind), from: text(flow?.from), to: text(flow?.to), ...(flow?.label ? { label: text(flow.label) } : {}) })) }; },
  validate(data) { const participants = new Map(data.participants.map((participant) => [participant.id, new Set(participant.lanes.map(({ id }) => id))])); const nodes = new Map(data.nodes.map((node) => [node.id, node])); const errors = []; if (participants.size !== data.participants.length || nodes.size !== data.nodes.length || new Set(data.flows.map(({ id }) => id)).size !== data.flows.length) errors.push("Participantes, nós e fluxos precisam de ids únicos."); if (data.participants.some((participant) => new Set(participant.lanes.map(({ id }) => id)).size !== participant.lanes.length)) errors.push("Raias precisam de ids únicos dentro do participante."); if (data.nodes.some((node) => !participants.get(node.participant)?.has(node.lane))) errors.push("Nó referencia participante ou raia inexistente."); data.flows.forEach((flow) => { const from = nodes.get(flow.from); const to = nodes.get(flow.to); if (!from || !to) errors.push(`Fluxo ${flow.id} referencia nó inexistente.`); else if (flow.kind === "sequence" && from.participant !== to.participant) errors.push(`Fluxo de sequência ${flow.id} cruza participantes.`); else if (flow.kind === "message" && from.participant === to.participant) errors.push(`Fluxo de mensagem ${flow.id} precisa cruzar participantes.`); }); return errors; },
  render(data) { const diagramLabels = labels(data); const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: accessibleText(data), caption: "BPMN 2.0 · participantes, raias e fluxo de processo", labels: diagramLabels, model: { labels: systemDiagramModelLabels(diagramLabels) }, focusId: `system-node-${data.nodes[0]?.id || ""}`, errorMessage: "Não foi possível diagramar o processo BPMN." }); return `<div class="runtime-block package-bpmn-process">${data.prompt ? renderPackageProse(data.prompt) : ""}${figure}</div>`; },
  hydrate: hydrateSystemDiagrams, accessibleText,
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.participants.flatMap((participant, participantIndex) => [{ path: `participants[${participantIndex}].label`, label: `Editar participante ${participantIndex + 1}` }, ...participant.lanes.map((_, laneIndex) => ({ path: `participants[${participantIndex}].lanes[${laneIndex}].label`, label: `Editar raia ${participantIndex + 1}.${laneIndex + 1}` }))]), ...data.nodes.map((_, index) => ({ path: `nodes[${index}].label`, label: `Editar elemento BPMN ${index + 1}` })), ...data.flows.flatMap((flow, index) => flow.label ? [{ path: `flows[${index}].label`, label: `Editar fluxo ${index + 1}` }] : [])]; },
  practiceTargets(data) { return [...data.nodes.flatMap((node, index) => ["start_event", "end_event"].includes(node.kind) ? [] : [{ path: `nodes[${index}].label`, label: `Lacuna no elemento BPMN ${index + 1}`, modes: ["gap", "typing"] }]), ...data.flows.flatMap((flow, index) => flow.label ? [{ path: `flows[${index}].label`, label: `Lacuna no fluxo ${index + 1}`, modes: ["gap", "typing"] }] : [])]; }
});
