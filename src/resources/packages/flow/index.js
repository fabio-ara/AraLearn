import { FLOWCHART_STRUCTURE_INPUT_SCHEMA, normalizeFlowchartStructure, validateFlowchartStructureContract } from "../../../flowchart/flowchartStructure.js";
import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import {
  appendGraphvizForeignLabel,
  dotAttributes,
  dotQuote,
  graphvizGroupById,
  hasGraphvizGap,
  plainGraphvizLabel,
  renderGraphvizSvg,
  unionGraphvizTextBounds
} from "../../sdk/graphviz.js";

const FLOW_KIND_LABELS = Object.freeze({
  sequence: "Sequência", start: "Início", end: "Fim", input: "Entrada",
  output: "Saída", process: "Processo", if_then: "Decisão",
  if_then_else: "Decisão", if_chain: "Decisão encadeada",
  switch_case: "Escolha", while: "Enquanto", for: "Repetição",
  do_while: "Repita"
});

const GAP_MARKER = /\uE000[^\uE001]+\uE001/gu;

function flowChildren(node) {
  if (!node || typeof node !== "object") return [];
  const groups = [node.items, node.thenBranch, node.elseBranch, node.body, node.defaultBranch];
  if (Array.isArray(node.cases)) groups.push(...node.cases.map((item) => item.thenBranch || item.body));
  return groups.flatMap((value) => Array.isArray(value) ? value : []);
}

function nodeSummary(node) {
  if (node.kind === "for") {
    return [node.init, node.condition, node.update].filter(Boolean).join("; ") ||
      [node.iterator, node.iterable].filter(Boolean).join(" em ");
  }
  return node.text || node.condition || node.expression || node.match || "";
}

function branchLabels(node) {
  return {
    yes: node.branchLabels?.yes || "Sim",
    no: node.branchLabels?.no || "Não",
    default: node.branchLabels?.default || "Outro caso"
  };
}

function createFlowGraphCompiler() {
  const nodes = [];
  const edges = [];
  let nodeCounter = 0;
  let edgeCounter = 0;

  function addNode(kind, label, depth = 0, sourceId = "") {
    const id = `flow-node-${++nodeCounter}`;
    nodes.push({ id, kind, label, depth, sourceId });
    return id;
  }

  function addMerge(depth = 0) {
    return addNode("merge", "", depth);
  }

  function addEdge(source, target, { label = "", kind = "flow", visible = true } = {}) {
    if (!source || !target) return;
    edges.push({ id: `flow-edge-${++edgeCounter}`, source, target, label, kind, visible });
  }

  function connectExits(exits, target) {
    exits.forEach((exit) => {
      addEdge(exit.node, target, exit);
      (exit.layoutAfter || []).forEach((source) =>
        addEdge(source, target, { kind: "constraint", visible: false })
      );
    });
  }

  function compileSequence(items, depth = 0) {
    let entry = null;
    let exits = [];
    (items || []).forEach((item) => {
      const fragment = compileNode(item, depth);
      if (!fragment.entry) return;
      if (!entry) entry = fragment.entry;
      if (exits.length) connectExits(exits, fragment.entry);
      exits = fragment.exits;
    });
    return { entry, exits };
  }

  function compileChoice(node, branches, depth) {
    const decision = addNode("decision", nodeSummary(node) || FLOW_KIND_LABELS[node.kind], depth, node.id);
    const merge = addMerge(depth);
    branches.forEach((branch) => {
      const fragment = compileSequence(branch.items, depth + 1);
      addEdge(decision, fragment.entry || merge, { label: branch.label, kind: "branch" });
      if (fragment.entry) connectExits(fragment.exits, merge);
    });
    return { entry: decision, exits: [{ node: merge }] };
  }

  function compileLoop(node, depth, bodyFirst = false) {
    const labels = branchLabels(node);
    const decision = addNode("decision", nodeSummary(node) || FLOW_KIND_LABELS[node.kind], depth, node.id);
    const body = compileSequence(node.body, depth + 1);
    if (bodyFirst) {
      if (body.entry) connectExits(body.exits, decision);
      addEdge(decision, body.entry || decision, { label: labels.yes, kind: "loop" });
      return {
        entry: body.entry || decision,
        exits: [{ node: decision, label: labels.no, kind: "branch", layoutAfter: body.exits.map((exit) => exit.node) }]
      };
    }
    addEdge(decision, body.entry || decision, {
      label: labels.yes,
      kind: body.entry ? "branch" : "loop"
    });
    if (body.entry) connectExits(body.exits.map((exit) => ({ ...exit, kind: "loop" })), decision);
    return {
      entry: decision,
      exits: [{ node: decision, label: labels.no, kind: "branch", layoutAfter: body.exits.map((exit) => exit.node) }]
    };
  }

  function compileNode(node, depth = 0) {
    if (!node) return { entry: null, exits: [] };
    if (node.kind === "sequence") return compileSequence(node.items, depth);
    if (["start", "end", "input", "output", "process"].includes(node.kind)) {
      const id = addNode(node.kind, nodeSummary(node) || FLOW_KIND_LABELS[node.kind], depth, node.id);
      return { entry: id, exits: node.kind === "end" ? [] : [{ node: id }] };
    }
    const labels = branchLabels(node);
    if (node.kind === "if_then" || node.kind === "if_then_else") {
      return compileChoice(node, [
        { label: labels.yes, items: node.thenBranch },
        { label: labels.no, items: node.kind === "if_then_else" ? node.elseBranch : [] }
      ], depth);
    }
    if (node.kind === "while" || node.kind === "for") return compileLoop(node, depth);
    if (node.kind === "do_while") return compileLoop(node, depth, true);
    if (node.kind === "if_chain") {
      return compileChoice(node, [
        ...(node.cases || []).map((item) => ({ label: item.condition, items: item.thenBranch })),
        { label: "Caso contrário", items: node.elseBranch }
      ], depth);
    }
    if (node.kind === "switch_case") {
      return compileChoice(node, [
        ...(node.cases || []).map((item) => ({ label: item.match, items: item.body })),
        { label: labels.default, items: node.defaultBranch }
      ], depth);
    }
    const id = addNode("process", nodeSummary(node) || FLOW_KIND_LABELS[node.kind] || node.kind, depth, node.id);
    return { entry: id, exits: [{ node: id }] };
  }

  return {
    compile(structure) {
      compileNode(structure);
      return { nodes, edges };
    }
  };
}

export function compileFlowGraph(structure) {
  return createFlowGraphCompiler().compile(structure);
}

function flattenFlow(node, output = []) {
  if (!node) return output;
  output.push(`${FLOW_KIND_LABELS[node.kind] || node.kind}: ${nodeSummary(node) || FLOW_KIND_LABELS[node.kind] || node.kind}`);
  flowChildren(node).forEach((child) => flattenFlow(child, output));
  return output;
}

function renderAccessibleOutline(node) {
  const children = flowChildren(node);
  const summary = `${FLOW_KIND_LABELS[node.kind] || node.kind}: ${nodeSummary(node) || FLOW_KIND_LABELS[node.kind] || node.kind}`
    .replace(GAP_MARKER, "lacuna");
  return `<li>${renderPackageInline(summary)}${children.length ? `<ol>${children.map(renderAccessibleOutline).join("")}</ol>` : ""}</li>`;
}

function flowEditableTargets(value, path = "structure", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flowEditableTargets(item, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  Object.entries(value).forEach(([key, child]) => {
    const childPath = `${path}.${key}`;
    const visibleStringFields = new Set([
      "text", "condition", "expression", "init", "update", "iterator",
      "iterable", "match", "yes", "no", "default"
    ]);
    if (typeof child === "string" && visibleStringFields.has(key)) output.push({ path: childPath, label: `Editar ${key}` });
    else if (["practice", "comment"].includes(key)) return;
    else if (child && typeof child === "object") flowEditableTargets(child, childPath, output);
  });
  return output;
}

function shapeClass(kind) {
  if (kind === "start" || kind === "end") return "terminal";
  if (kind === "input" || kind === "output") return "input-output";
  if (kind === "decision") return "decision";
  if (kind === "merge") return "merge";
  return "process";
}

function graphvizNodeAttributes(node) {
  const shape = shapeClass(node.kind);
  const common = {
    id: node.id,
    class: `package-flow-node is-${shape}`,
    label: node.kind === "merge" ? "" : plainGraphvizLabel(node.label),
    shape: ({ terminal: "oval", "input-output": "parallelogram", decision: "diamond", merge: "point" })[shape] || "box",
    ...(node.sourceId ? { tooltip: node.sourceId } : {})
  };
  if (shape === "merge") return { ...common, width: "0.08", height: "0.08", fixedsize: "true" };
  if (shape === "decision") return { ...common, width: "2.15", height: "0.85", margin: "0.24,0.12" };
  if (shape === "input-output") return { ...common, width: "2.1", margin: "0.18,0.1", skew: "0.18" };
  return { ...common, width: "1.9", margin: "0.16,0.1" };
}

function graphvizEdgeAttributes(edge, nodeById) {
  if (!edge.visible) return {
    id: edge.id,
    class: "package-flow-edge is-constraint",
    style: "invis",
    constraint: "true",
    weight: "20"
  };
  const targetIsMerge = nodeById.get(edge.target)?.kind === "merge";
  return {
    id: edge.id,
    class: `package-flow-edge is-${edge.kind}`,
    ...(edge.label ? { label: plainGraphvizLabel(edge.label) } : {}),
    ...(targetIsMerge ? { arrowhead: "none" } : {}),
    ...(edge.kind === "loop" ? { constraint: "false", style: "dashed", minlen: "2" } : {})
  };
}

export function compileFlowGraphviz(structure) {
  const graph = compileFlowGraph(structure);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes = graph.nodes.map((node) =>
    `  ${dotQuote(node.id)} ${dotAttributes(graphvizNodeAttributes(node))};`
  );
  const edges = graph.edges.map((edge) =>
    `  ${dotQuote(edge.source)} -> ${dotQuote(edge.target)} ${dotAttributes(graphvizEdgeAttributes(edge, nodeById))};`
  );
  return {
    graph,
    source: [
      "digraph AraLearnFlow {",
      "  graph [rankdir=TB, bgcolor=\"transparent\", pad=\"0.08\", nodesep=\"0.34\", ranksep=\"0.46\", splines=\"polyline\", outputorder=\"edgesfirst\"];",
      "  node [fontname=\"Arial\", fontsize=\"16\", penwidth=\"1\", color=\"#64748b\", fontcolor=\"#111827\", style=\"solid\"];",
      "  edge [fontname=\"Arial\", fontsize=\"14\", penwidth=\"1\", arrowsize=\"0.68\", color=\"#3b82f6\", fontcolor=\"#2563eb\"];",
      ...nodes,
      ...edges,
      "}"
    ].join("\n")
  };
}

function labelTemplate(kind, id, value) {
  if (!value) return "";
  return `<template data-flow-${kind}-template="${escapePackageAttribute(id)}"><span class="package-flow-label-content">${renderPackageInline(value)}</span></template>`;
}

function renderFlowGraph(structure) {
  const { graph, source } = compileFlowGraphviz(structure);
  const templates = [
    ...graph.nodes.filter((node) => node.kind !== "merge").map((node) => labelTemplate("node", node.id, node.label)),
    ...graph.edges.filter((edge) => edge.visible && edge.label).map((edge) => labelTemplate("edge", edge.id, edge.label))
  ].join("");
  const edgeSpecs = graph.edges.map((edge) =>
    `<span data-flow-edge-id="${escapePackageAttribute(edge.id)}" data-flow-source="${escapePackageAttribute(edge.source)}" data-flow-target="${escapePackageAttribute(edge.target)}" data-flow-edge-kind="${escapePackageAttribute(edge.kind)}" data-flow-edge-visible="${edge.visible ? "true" : "false"}" hidden></span>`
  ).join("");
  const encodedGraph = encodeURIComponent(JSON.stringify(graph));
  return `<div class="package-flowchart" role="group" aria-label="Fluxograma"><div class="package-flow-canvas" data-flow-layout-status="pending" aria-busy="true" data-flow-graph="${escapePackageAttribute(encodedGraph)}" data-flow-graphviz-source="${escapePackageAttribute(source)}"></div>${templates}${edgeSpecs}<p class="package-flow-layout-error" hidden>Não foi possível diagramar o fluxograma.</p></div>`;
}

function nodeLabelBounds(group) {
  const shape = group.querySelector("ellipse, polygon, path");
  if (!shape) return null;
  const box = shape.getBBox();
  const kind = group.classList.contains("is-decision")
    ? "decision"
    : group.classList.contains("is-input-output") ? "input-output" : "other";
  const horizontalInset = kind === "decision" ? box.width * 0.22 : kind === "input-output" ? box.width * 0.12 : 5;
  const verticalInset = kind === "decision" ? box.height * 0.18 : 3;
  return {
    x: box.x + horizontalInset,
    y: box.y + verticalInset,
    width: box.width - (2 * horizontalInset),
    height: box.height - (2 * verticalInset)
  };
}

function replaceGraphvizLabels(chart, svg, graph) {
  graph.nodes.filter((node) => node.kind !== "merge").forEach((node) => {
    const group = graphvizGroupById(svg, node.id);
    if (hasGraphvizGap(node.label)) {
      const template = chart.querySelector(`template[data-flow-node-template="${CSS.escape(node.id)}"]`);
      group?.querySelectorAll("text").forEach((text) => { text.style.visibility = "hidden"; });
      appendGraphvizForeignLabel(group, template, nodeLabelBounds(group), "package-flow-node-label");
    }
    if (group) {
      group.dataset.flowNodeId = node.id;
      group.dataset.flowKind = node.kind;
      if (node.sourceId) group.dataset.flowSourceId = node.sourceId;
    }
  });
  graph.edges.filter((edge) => edge.visible && edge.label).forEach((edge) => {
    const group = graphvizGroupById(svg, edge.id);
    const texts = [...(group?.querySelectorAll("text") || [])];
    texts.forEach((text) => text.classList.add("package-flow-edge-label"));
    if (!hasGraphvizGap(edge.label)) return;
    const box = unionGraphvizTextBounds(texts);
    const template = chart.querySelector(`template[data-flow-edge-template="${CSS.escape(edge.id)}"]`);
    texts.forEach((text) => { text.style.visibility = "hidden"; });
    if (box) {
      const width = Math.max(48, box.width + 16);
      const height = Math.max(24, box.height + 8);
      appendGraphvizForeignLabel(group, template, {
        x: box.x + (box.width - width) / 2,
        y: box.y + (box.height - height) / 2,
        width,
        height
      }, "package-flow-edge-label");
    }
  });
}

async function layoutFlowchart(chart) {
  const canvas = chart.querySelector(".package-flow-canvas");
  if (!canvas || canvas.dataset.flowLayoutStatus === "ready") return;
  try {
    const source = canvas.dataset.flowGraphvizSource;
    if (!source) throw new Error("Fluxograma sem fonte Graphviz.");
    const graph = JSON.parse(decodeURIComponent(canvas.dataset.flowGraph || ""));
    const svg = await renderGraphvizSvg(canvas, { source, engine: "dot", className: "package-flow-svg" });
    replaceGraphvizLabels(chart, svg, graph);
    canvas.dataset.flowLayoutStatus = "ready";
    canvas.setAttribute("aria-busy", "false");
    const start = svg.querySelector('[data-flow-kind="start"]') || svg.querySelector(".package-flow-node");
    if (start && chart.scrollWidth > chart.clientWidth) {
      const chartRect = chart.getBoundingClientRect();
      const startRect = start.getBoundingClientRect();
      chart.scrollLeft = Math.max(0,
        chart.scrollLeft + startRect.left - chartRect.left + (startRect.width - chart.clientWidth) / 2
      );
    }
  } catch (error) {
    canvas.dataset.flowLayoutStatus = "error";
    canvas.setAttribute("aria-busy", "false");
    const message = chart.querySelector(".package-flow-layout-error");
    if (message) message.hidden = false;
    throw error;
  }
}

export const flowPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.flow", version: "1.0.0", label: "Fluxograma", purpose: "Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["trace-control-flow", "decide", "recognize-loop", "predict-path"]), academic: academicProfile({ domains: ["algoritmos", "processos", "engenharia de software"], knowledgeObjects: ["fluxograma", "decisão", "ramificação", "repetição"], conventions: ["terminais arredondados", "processos retangulares", "entrada e saída em paralelogramo", "decisões em losango", "ramos nomeados na própria aresta", "fluxo orientado", "junções explícitas"], appropriateWhen: ["o caminho depende de decisão ou repetição"], avoidWhen: ["há apenas ordem linear ou estados persistentes"], technologies: ["Graphviz dot", "Viz.js WebAssembly", "SVG", "HTML semântico"], practiceModes: ["exposition", "gap", "typing", "selection", "ordering"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.ordering"]), limitations: Object.freeze(["Use sequence quando não houver ramificação.", "A geometria é derivada e nunca autoral."]), accessibility: "O fluxograma visual possui uma descrição linear equivalente para tecnologia assistiva." }),
  authoringContract: Object.freeze({ intent: "Declare a lógica do fluxograma; o renderer escolhe símbolos, conectores, ramos, junções e retornos.", required: Object.freeze(["structure"]), optional: Object.freeze(["prompt"]), rules: Object.freeze(["A raiz é sequence.", "Use start e end para terminais, process para transformação, input/output para dados e estruturas condicionais para losangos.", "Toda decisão declara rótulos semanticamente inequívocos para seus ramos.", "Não declare coordenadas, símbolos, arestas ou pontos de junção.", "Use a menor estrutura que preserve a lógica."]), example: Object.freeze({ prompt: "Acompanhe os dois caminhos possíveis.", structure: { id: "root", kind: "sequence", items: [{ id: "start", kind: "start", text: "Início" }, { id: "read", kind: "input", text: "Ler credenciais" }, { id: "decision", kind: "if_then_else", condition: "Credenciais válidas?", branchLabels: { yes: "Sim", no: "Não" }, thenBranch: [{ id: "open", kind: "process", text: "Abrir sessão" }], elseBranch: [{ id: "error", kind: "output", text: "Exibir erro" }] }, { id: "end", kind: "end", text: "Fim" }] } }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["structure"], properties: { prompt: { type: "string" }, structure: FLOWCHART_STRUCTURE_INPUT_SCHEMA } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), structure: normalizeFlowchartStructure(data?.structure) }; },
  validate(data) { const result = validateFlowchartStructureContract(data.structure); return result.valid ? [] : result.findings.map((error) => String(error)); },
  render(data, options = {}) { return `<div class="runtime-block runtime-flow-block">${data.prompt ? renderPackageProse(data.prompt) : ""}${renderFlowGraph(data.structure, options)}<ol class="visually-hidden">${renderAccessibleOutline(data.structure)}</ol></div>`; },
  async hydrate(instanceRoot) { await Promise.all([...instanceRoot.querySelectorAll(".package-flowchart")].map(layoutFlowchart)); },
  accessibleText(data) { return [data.prompt, ...flattenFlow(data.structure)].filter(Boolean).join(". "); },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...flowEditableTargets(data.structure)]; },
  practiceTargets(data) { return flowEditableTargets(data.structure).map((target) => ({ ...target, label: target.label.replace("Editar", "Lacuna em"), modes: ["gap", "typing"] })); }
});
