import { FLOWCHART_STRUCTURE_INPUT_SCHEMA, normalizeFlowchartStructure, validateFlowchartStructureContract } from "../../../flowchart/flowchartStructure.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

const FLOW_KIND_LABELS = Object.freeze({
  sequence: "Sequência", start: "Início", end: "Fim", input: "Entrada",
  output: "Saída", process: "Processo", if_then: "Decisão",
  if_then_else: "Decisão", if_chain: "Decisão encadeada",
  switch_case: "Escolha", while: "Enquanto", for: "Repetição",
  do_while: "Repita"
});

function flowChildren(node) {
  if (!node || typeof node !== "object") return [];
  const groups = [node.items, node.thenBranch, node.elseBranch, node.body, node.defaultBranch];
  if (Array.isArray(node.cases)) groups.push(...node.cases.map((item) => item.thenBranch || item.body));
  return groups.flatMap((value) => Array.isArray(value) ? value : []);
}

function nodeSummary(node) {
  if (node.kind === "for") {
    return [node.init, node.condition, node.update].filter(Boolean).join("; ") || [node.iterator, node.iterable].filter(Boolean).join(" em ");
  }
  return node.text || node.condition || node.expression || node.match || "";
}

function renderConnector() {
  return '<span class="package-flow-connector" aria-hidden="true"><span></span></span>';
}

function renderShape(kind, text) {
  const shape = ({ start: "terminal", end: "terminal", input: "input-output", output: "input-output" })[kind] || "process";
  return `<div class="package-flow-shape is-${shape}" data-flow-kind="${kind}"><span>${renderPackageInline(text || FLOW_KIND_LABELS[kind] || kind)}</span></div>`;
}

function renderSequence(nodes) {
  return `<div class="package-flow-sequence">${(nodes || []).map((node, index) => `${index ? renderConnector() : ""}${renderFlowNode(node)}`).join("")}</div>`;
}

function renderBranch(label, nodes, options = {}) {
  const content = nodes?.length
    ? renderSequence(nodes)
    : '<div class="package-flow-continuation">Continua</div>';
  return `<div class="package-flow-branch"><span class="package-flow-branch-label">${renderPackageInline(label)}</span><span class="package-flow-branch-line" aria-hidden="true"></span>${content}${options.returns ? '<span class="package-flow-loop-return" aria-label="Retorna à condição">↺ retorna à condição</span>' : ""}</div>`;
}

function renderDecision(condition, branches, kind = "if_then_else") {
  return `<div class="package-flow-decision" data-flow-kind="${kind}"><div class="package-flow-shape is-decision"><span>${renderPackageInline(condition)}</span></div><div class="package-flow-branch-rail" aria-hidden="true"></div><div class="package-flow-branches${branches.length > 2 ? " is-multiple" : ""}">${branches.map(({ label, nodes, returns }) => renderBranch(label, nodes, { returns })).join("")}</div><div class="package-flow-merge" aria-hidden="true"><span></span></div></div>`;
}

function renderFlowNode(node) {
  if (node.kind === "sequence") return renderSequence(node.items);
  if (["start", "end", "input", "output", "process"].includes(node.kind)) {
    return renderShape(node.kind, node.text);
  }
  const labels = node.branchLabels || {};
  if (node.kind === "if_then" || node.kind === "if_then_else") {
    return renderDecision(node.condition, [
      { label: labels.yes || "Sim", nodes: node.thenBranch },
      { label: labels.no || "Não", nodes: node.kind === "if_then_else" ? node.elseBranch : [] }
    ], node.kind);
  }
  if (node.kind === "while" || node.kind === "for") {
    return renderDecision(nodeSummary(node), [
      { label: labels.yes || "Sim", nodes: node.body, returns: true },
      { label: labels.no || "Não", nodes: [] }
    ], node.kind);
  }
  if (node.kind === "do_while") {
    return `<div class="package-flow-loop">${renderSequence(node.body)}${renderConnector()}${renderDecision(node.condition, [
      { label: labels.yes || "Sim", nodes: [], returns: true },
      { label: labels.no || "Não", nodes: [] }
    ], node.kind)}</div>`;
  }
  if (node.kind === "if_chain") {
    const branches = (node.cases || []).map((item) => ({ label: item.condition, nodes: item.thenBranch }));
    branches.push({ label: "Caso contrário", nodes: node.elseBranch });
    return renderDecision("Qual condição é satisfeita?", branches, node.kind);
  }
  if (node.kind === "switch_case") {
    const branches = (node.cases || []).map((item) => ({ label: item.match, nodes: item.body }));
    branches.push({ label: labels.default || "Outro caso", nodes: node.defaultBranch });
    return renderDecision(node.expression, branches, node.kind);
  }
  return renderShape("process", nodeSummary(node) || FLOW_KIND_LABELS[node.kind] || node.kind);
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

export const flowPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.flow", version: "1.0.0", label: "Fluxograma", purpose: "Representar sequência, decisão, ramificação e repetição com a convenção visual de fluxogramas.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["trace-control-flow", "decide", "recognize-loop", "predict-path"]), academic: academicProfile({ domains: ["algoritmos", "processos", "engenharia de software"], knowledgeObjects: ["fluxograma", "decisão", "ramificação", "repetição"], conventions: ["terminais arredondados", "processos retangulares", "entrada e saída em paralelogramo", "decisões em losango", "ramos nomeados", "fluxo orientado"], appropriateWhen: ["o caminho depende de decisão ou repetição"], avoidWhen: ["há apenas ordem linear ou estados persistentes"], technologies: ["HTML semântico", "CSS lógico", "estrutura declarativa"], practiceModes: ["exposition", "gap", "typing", "selection", "ordering"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.ordering"]), limitations: Object.freeze(["Use sequence quando não houver ramificação.", "A geometria é derivada e nunca autoral."]), accessibility: "O fluxograma visual possui uma descrição linear equivalente para tecnologia assistiva." }),
  authoringContract: Object.freeze({ intent: "Declare a lógica do fluxograma; o renderer escolhe símbolos, conectores, ramos e retornos.", required: Object.freeze(["structure"]), optional: Object.freeze(["prompt"]), rules: Object.freeze(["A raiz é sequence.", "Use start e end para terminais, process para transformação, input/output para dados e estruturas condicionais para losangos.", "Toda decisão declara rótulos semanticamente inequívocos para seus ramos.", "Não declare coordenadas, símbolos ou arestas.", "Use a menor estrutura que preserve a lógica."]), example: Object.freeze({ prompt: "Acompanhe os dois caminhos possíveis.", structure: { id: "root", kind: "sequence", items: [{ id: "start", kind: "start", text: "Início" }, { id: "read", kind: "input", text: "Ler credenciais" }, { id: "decision", kind: "if_then_else", condition: "Credenciais válidas?", branchLabels: { yes: "Sim", no: "Não" }, thenBranch: [{ id: "open", kind: "process", text: "Abrir sessão" }], elseBranch: [{ id: "error", kind: "output", text: "Exibir erro" }] }, { id: "end", kind: "end", text: "Fim" }] } }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["structure"], properties: { prompt: { type: "string" }, structure: FLOWCHART_STRUCTURE_INPUT_SCHEMA } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), structure: normalizeFlowchartStructure(data?.structure) }; },
  validate(data) { const result = validateFlowchartStructureContract(data.structure); return result.valid ? [] : result.findings.map((error) => String(error)); },
  render(data) { return `<div class="runtime-block runtime-flow-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<div class="package-flowchart" role="group" aria-label="Fluxograma">${renderFlowNode(data.structure)}</div><ol class="visually-hidden">${renderAccessibleOutline(data.structure)}</ol></div>`; },
  accessibleText(data) { return [data.prompt, ...flattenFlow(data.structure)].filter(Boolean).join(". "); },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...flowEditableTargets(data.structure)]; },
  practiceTargets(data) { return flowEditableTargets(data.structure).map((target) => ({ ...target, label: target.label.replace("Editar", "Lacuna em"), modes: ["gap", "typing"] })); }
});
