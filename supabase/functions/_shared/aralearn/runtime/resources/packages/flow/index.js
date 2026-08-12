import { FLOWCHART_STRUCTURE_INPUT_SCHEMA, normalizeFlowchartStructure, validateFlowchartStructureContract } from "../../../flowchart/flowchartStructure.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";

function flowChildren(node) {
  if (!node || typeof node !== "object") return [];
  const groups = [node.items, node.thenBranch, node.elseBranch, node.body];
  if (Array.isArray(node.cases)) groups.push(...node.cases.map((item) => item.thenBranch || item.body));
  if (Array.isArray(node.defaultBranch)) groups.push(node.defaultBranch);
  return groups.flatMap((value) => Array.isArray(value) ? value : []);
}

const FLOW_KIND_LABELS = Object.freeze({ sequence: "Sequência", start: "Início", end: "Fim", process: "Processo", if_then: "Decisão", if_then_else: "Decisão", switch: "Escolha", while: "Enquanto", for: "Repetição", do_while: "Repita" });
function nodeSummary(node) { return node.text || node.condition || node.initialization || node.match || ""; }
function renderFlowNode(node) { const children = flowChildren(node); const label = FLOW_KIND_LABELS[node.kind] || node.kind; const summary = nodeSummary(node); return `<li class="package-flow-node" data-flow-kind="${node.kind}"><div class="package-flow-node-card${summary ? "" : " is-label-only"}"><span class="package-flow-kind">${renderPackageInline(label)}</span>${summary ? `<span class="package-flow-summary">${renderPackageInline(summary)}</span>` : ""}</div>${children.length ? `<ol class="package-flow-children">${children.map(renderFlowNode).join("")}</ol>` : ""}</li>`; }
function flattenFlow(node, output = []) { if (!node) return output; output.push(`${FLOW_KIND_LABELS[node.kind] || node.kind}: ${nodeSummary(node) || FLOW_KIND_LABELS[node.kind] || node.kind}`); flowChildren(node).forEach((child) => flattenFlow(child, output)); return output; }

export const flowPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.flow", version: "1.0.0", label: "Fluxo", purpose: "Representar sequência, decisão, ramificação e repetição a partir de lógica declarativa.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["trace-control-flow", "decide", "recognize-loop", "predict-path"]), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.ordering"]), limitations: Object.freeze(["Use sequence quando não houver ramificação.", "A geometria é derivada e nunca autoral." ]), accessibility: "A lógica é exposta também como árvore ordenada, independente do desenho." }),
  authoringContract: Object.freeze({ intent: "Declare a lógica aninhada; não declare nós geométricos nem arestas.", required: Object.freeze(["structure"]), optional: Object.freeze(["prompt"]), rules: Object.freeze(["Toda condição e ramo precisa ser semanticamente nomeado.", "Use a menor estrutura que preserve a lógica."]), example: Object.freeze({ prompt: "Acompanhe a decisão.", structure: { id: "root", kind: "sequence", items: [{ id: "start", kind: "start", text: "Início" }, { id: "decision", kind: "if_then", condition: "há conexão", thenBranch: [{ id: "send", kind: "process", text: "Enviar" }] }, { id: "end", kind: "end", text: "Fim" }] } }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["structure"], properties: { prompt: { type: "string" }, structure: FLOWCHART_STRUCTURE_INPUT_SCHEMA } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), structure: normalizeFlowchartStructure(data?.structure) }; },
  validate(data) { const result = validateFlowchartStructureContract(data.structure); return result.valid ? [] : result.findings.map((error) => String(error)); },
  render(data) { return `<div class="runtime-block runtime-flow-block package-flow-semantic">${data.prompt ? renderPackageProse(data.prompt) : ""}<ol class="package-flow-tree">${renderFlowNode(data.structure)}</ol></div>`; },
  accessibleText(data) { return [data.prompt, ...flattenFlow(data.structure)].filter(Boolean).join(". "); }, editableTargets() { return []; }
});
