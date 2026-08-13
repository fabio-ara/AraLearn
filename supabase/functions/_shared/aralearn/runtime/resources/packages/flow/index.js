import { FLOWCHART_STRUCTURE_INPUT_SCHEMA, normalizeFlowchartStructure, validateFlowchartStructureContract } from "../../../flowchart/flowchartStructure.js";
import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

const FLOW_KIND_LABELS = Object.freeze({
  sequence: "Sequência", start: "Início", end: "Fim", input: "Entrada",
  output: "Saída", process: "Processo", if_then: "Decisão",
  if_then_else: "Decisão", if_chain: "Decisão encadeada",
  switch_case: "Escolha", while: "Enquanto", for: "Repetição",
  do_while: "Repita"
});

const ELK_LAYOUT_OPTIONS = Object.freeze({
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.padding": "[top=8,left=8,bottom=8,right=8]",
  "elk.spacing.nodeNode": "14",
  "elk.spacing.edgeNode": "18",
  "elk.layered.spacing.nodeNodeBetweenLayers": "46",
  "elk.layered.spacing.edgeNodeBetweenLayers": "18",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.cycleBreaking.strategy": "GREEDY"
});

let elkConstructorPromise = null;

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
  return `<li>${renderPackageInline(`${FLOW_KIND_LABELS[node.kind] || node.kind}: ${nodeSummary(node) || FLOW_KIND_LABELS[node.kind] || node.kind}`)}${children.length ? `<ol>${children.map(renderAccessibleOutline).join("")}</ol>` : ""}</li>`;
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

function stableSuffix(value) {
  let hash = 2166136261;
  for (const character of String(value || "flow")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function renderFlowGraph(structure, options = {}) {
  const graph = compileFlowGraph(structure);
  const markerId = `package-flow-arrow-${stableSuffix(options.instanceId || options.blockKey)}`;
  const nodes = graph.nodes.map((node) => {
    const classes = `package-flow-node is-${shapeClass(node.kind)}`;
    const sourceAttribute = node.sourceId ? ` data-flow-source-id="${escapePackageAttribute(node.sourceId)}"` : "";
    return `<div class="${classes}" data-flow-node-id="${node.id}" data-flow-kind="${node.kind}" data-flow-depth="${node.depth}"${node.kind === "merge" ? ' aria-hidden="true"' : ""}${sourceAttribute}>${node.kind === "merge" ? "" : `<span>${renderPackageInline(node.label)}</span>`}</div>`;
  }).join("");
  const edgeSpecs = graph.edges.map((edge) =>
    `<span class="package-flow-edge-spec" data-flow-edge-id="${edge.id}" data-flow-source="${edge.source}" data-flow-target="${edge.target}" data-flow-edge-kind="${edge.kind}" data-flow-edge-visible="${edge.visible ? "true" : "false"}" hidden></span>`
  ).join("");
  const labels = graph.edges.filter((edge) => edge.visible && edge.label).map((edge) =>
    `<span class="package-flow-edge-label" data-flow-edge-label-id="${edge.id}">${renderPackageInline(edge.label)}</span>`
  ).join("");
  return `<div class="package-flowchart" role="group" aria-label="Fluxograma"><div class="package-flow-canvas" data-flow-layout-status="pending" aria-busy="true"><svg class="package-flow-edges" aria-hidden="true"><defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs><g></g></svg><div class="package-flow-nodes">${nodes}</div><div class="package-flow-labels">${labels}</div>${edgeSpecs}</div><p class="package-flow-layout-error" hidden>Não foi possível diagramar o fluxograma.</p></div>`;
}

function elkAssetUrl() {
  const stylesheet = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => link.href)
    .find((href) => /(?:^|\/)styles\.css(?:$|\?)/u.test(href));
  return stylesheet
    ? new URL("vendor/elk.bundled.js", stylesheet).href
    : new URL("public/vendor/elk.bundled.js", document.baseURI).href;
}

function loadElkConstructor() {
  if (globalThis.ELK) return Promise.resolve(globalThis.ELK);
  if (elkConstructorPromise) return elkConstructorPromise;
  elkConstructorPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = elkAssetUrl();
    script.async = true;
    script.addEventListener("load", () => globalThis.ELK
      ? resolve(globalThis.ELK)
      : reject(new Error("ELK não inicializou.")));
    script.addEventListener("error", () => reject(new Error("ELK não pôde ser carregado.")));
    document.head.append(script);
  });
  return elkConstructorPromise;
}

function rectSize(element) {
  const rect = element.getBoundingClientRect();
  return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
}

function pathData(section) {
  const points = [section.startPoint, ...(section.bendPoints || []), section.endPoint].filter(Boolean);
  return points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
}

function overlapArea(left, right, margin = 4) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width + margin) - Math.max(left.x, right.x - margin));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height + margin) - Math.max(left.y, right.y - margin));
  return width * height;
}

function labelCandidates(edge, labelSize) {
  const candidates = [];
  let order = 0;
  (edge.sections || []).forEach((section) => {
    const points = [section.startPoint, ...(section.bendPoints || []), section.endPoint].filter(Boolean);
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
      const middleX = (start.x + end.x) / 2;
      const middleY = (start.y + end.y) / 2;
      const primary = horizontal
        ? { x: middleX - labelSize.width / 2, y: middleY - labelSize.height - 5 }
        : { x: middleX + 6, y: middleY - labelSize.height / 2 };
      const secondary = horizontal
        ? { x: middleX - labelSize.width / 2, y: middleY + 5 }
        : { x: middleX - labelSize.width - 6, y: middleY - labelSize.height / 2 };
      candidates.push({ ...primary, width: labelSize.width, height: labelSize.height, order: order++ });
      candidates.push({ ...secondary, width: labelSize.width, height: labelSize.height, order: order++ });
    }
  });
  return candidates;
}

function placeEdgeLabel(edge, labelSize, bounds, occupied) {
  const candidates = labelCandidates(edge, labelSize);
  if (!candidates.length) throw new Error(`Aresta ${edge.id} não recebeu rota para o rótulo.`);
  return candidates
    .map((candidate) => {
      const outside = Math.max(0, -candidate.x) + Math.max(0, -candidate.y) +
        Math.max(0, candidate.x + candidate.width - bounds.width) +
        Math.max(0, candidate.y + candidate.height - bounds.height);
      const collision = occupied.reduce((sum, item) => sum + overlapArea(candidate, item), 0);
      return { candidate, score: outside * 10000 + collision * 100 + candidate.order };
    })
    .sort((left, right) => left.score - right.score)[0].candidate;
}

async function layoutFlowchart(chart) {
  const canvas = chart.querySelector(".package-flow-canvas");
  if (!canvas || canvas.dataset.flowLayoutStatus === "ready") return;
  const nodeElements = new Map([...canvas.querySelectorAll("[data-flow-node-id]")]
    .map((element) => [element.dataset.flowNodeId, element]));
  const labelElements = new Map([...canvas.querySelectorAll("[data-flow-edge-label-id]")]
    .map((element) => [element.dataset.flowEdgeLabelId, element]));
  const edgeSpecs = [...canvas.querySelectorAll("[data-flow-edge-id]")];
  const edgeSpecById = new Map(edgeSpecs.map((element) => [element.dataset.flowEdgeId, element]));
  try {
    const Elk = await loadElkConstructor();
    const loopSpecs = edgeSpecs.filter((element) => element.dataset.flowEdgeKind === "loop");
    const graph = {
      id: "flow-root",
      layoutOptions: {
        ...ELK_LAYOUT_OPTIONS,
        ...(loopSpecs.length ? {
          "elk.padding": `[top=8,left=${36 + ((loopSpecs.length - 1) * 12)},bottom=8,right=8]`
        } : {})
      },
      children: [...nodeElements].map(([id, element]) => ({ id, ...rectSize(element) })),
      edges: edgeSpecs.filter((element) => element.dataset.flowEdgeKind !== "loop").map((element) => {
        const id = element.dataset.flowEdgeId;
        const label = labelElements.get(id);
        return {
          id,
          sources: [element.dataset.flowSource],
          targets: [element.dataset.flowTarget],
          ...(label ? { labels: [{ id: `label-${id}`, ...rectSize(label) }] } : {})
        };
      })
    };
    const layout = await new Elk().layout(graph);
    const width = Math.ceil(layout.width || 0);
    const height = Math.ceil(layout.height || 0);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    layout.children?.forEach((node) => {
      const element = nodeElements.get(node.id);
      if (!element) return;
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
    });
    const svg = canvas.querySelector(".package-flow-edges");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    const markerId = svg.querySelector("marker")?.id || "";
    const paths = [];
    const layoutNodeById = new Map((layout.children || []).map((node) => [node.id, node]));
    const occupied = (layout.children || []).map((node) => ({
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    }));
    layout.edges?.forEach((edge) => {
      const edgeSpec = edgeSpecById.get(edge.id);
      if (edgeSpec?.dataset.flowEdgeVisible === "false") return;
      (edge.sections || []).forEach((section, sectionIndex, sections) => {
        const targetKind = nodeElements.get(edgeSpec?.dataset.flowTarget)?.dataset.flowKind;
        const marker = sectionIndex === sections.length - 1 && targetKind !== "merge"
          ? ` marker-end="url(#${escapePackageAttribute(markerId)})"`
          : "";
        paths.push(`<path class="package-flow-edge-path is-${escapePackageAttribute(edgeSpec?.dataset.flowEdgeKind || "flow")}" data-flow-rendered-edge-id="${escapePackageAttribute(edge.id)}" d="${escapePackageAttribute(pathData(section))}"${marker}></path>`);
      });
      const element = labelElements.get(edge.id);
      if (element) {
        const position = placeEdgeLabel(edge, rectSize(element), { width, height }, occupied);
        element.style.left = `${position.x}px`;
        element.style.top = `${position.y}px`;
        occupied.push(position);
      }
    });
    loopSpecs.forEach((edgeSpec, index) => {
      const source = layoutNodeById.get(edgeSpec.dataset.flowSource);
      const target = layoutNodeById.get(edgeSpec.dataset.flowTarget);
      if (!source || !target) throw new Error(`Laço ${edgeSpec.dataset.flowEdgeId} sem extremidades diagramadas.`);
      const laneX = 8 + (index * 12);
      const start = { x: source.x, y: source.y + (source.height / 2) };
      const end = { x: target.x, y: target.y + (target.height / 2) };
      const bendPoints = [{ x: laneX, y: start.y }, { x: laneX, y: end.y }];
      const route = pathData({ startPoint: start, bendPoints, endPoint: end });
      paths.push(`<path class="package-flow-edge-path is-loop" data-flow-rendered-edge-id="${escapePackageAttribute(edgeSpec.dataset.flowEdgeId)}" d="${escapePackageAttribute(route)}" marker-end="url(#${escapePackageAttribute(markerId)})"></path>`);
      const label = labelElements.get(edgeSpec.dataset.flowEdgeId);
      if (label) {
        const position = placeEdgeLabel({
          id: edgeSpec.dataset.flowEdgeId,
          sections: [{ startPoint: start, bendPoints, endPoint: end }]
        }, rectSize(label), { width, height }, occupied);
        label.style.left = `${position.x}px`;
        label.style.top = `${position.y}px`;
        occupied.push(position);
      }
    });
    svg.querySelector("g").innerHTML = paths.join("");
    canvas.dataset.flowLayoutStatus = "ready";
    canvas.setAttribute("aria-busy", "false");
  } catch (error) {
    canvas.dataset.flowLayoutStatus = "error";
    canvas.setAttribute("aria-busy", "false");
    const message = chart.querySelector(".package-flow-layout-error");
    if (message) message.hidden = false;
    throw error;
  }
}

export const flowPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.flow", version: "1.0.0", label: "Fluxograma", purpose: "Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["trace-control-flow", "decide", "recognize-loop", "predict-path"]), academic: academicProfile({ domains: ["algoritmos", "processos", "engenharia de software"], knowledgeObjects: ["fluxograma", "decisão", "ramificação", "repetição"], conventions: ["terminais arredondados", "processos retangulares", "entrada e saída em paralelogramo", "decisões em losango", "ramos nomeados na própria aresta", "fluxo orientado", "junções explícitas"], appropriateWhen: ["o caminho depende de decisão ou repetição"], avoidWhen: ["há apenas ordem linear ou estados persistentes"], technologies: ["ELK Layered", "SVG de conectores", "HTML semântico", "estrutura declarativa"], practiceModes: ["exposition", "gap", "typing", "selection", "ordering"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.ordering"]), limitations: Object.freeze(["Use sequence quando não houver ramificação.", "A geometria é derivada e nunca autoral."]), accessibility: "O fluxograma visual possui uma descrição linear equivalente para tecnologia assistiva." }),
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
