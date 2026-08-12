import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

function renderChildren(parentId, children, visited = new Set()) {
  const items = children.get(parentId) || [];
  if (!items.length) return "";
  return `<ul>${items.map((node) => {
    if (visited.has(node.id)) return "";
    const next = new Set(visited); next.add(node.id);
    return `<li data-tree-node-id="${escapePackageAttribute(node.id)}"><span>${renderPackageInline(node.label)}</span>${renderChildren(node.id, children, next)}</li>`;
  }).join("")}</ul>`;
}

export const treePackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.tree", version: "1.0.0", label: "Árvore", purpose: "Representar hierarquia, classificação ou descendência com um único pai por nó.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["classify-hierarchically", "locate-parent", "trace-ancestry"]), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["Não representa relações muitos-para-muitos." ]), accessibility: "A hierarquia usa listas aninhadas na mesma ordem visual." }),
  authoringContract: Object.freeze({ intent: "Declare nós e parentId; o motor deriva a árvore.", required: Object.freeze(["variant", "nodes"]), optional: Object.freeze(["prompt"]), rules: Object.freeze(["Existe ao menos uma raiz.", "Não há ciclos nem pai inexistente."]), example: Object.freeze({ prompt: "Observe a classificação.", variant: "taxonomy", nodes: [{ id: "animalia", label: "Animalia", parentId: null }, { id: "chordata", label: "Chordata", parentId: "animalia" }] }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["variant", "nodes"], properties: { prompt: { type: "string" }, variant: { type: "string", enum: ["filesystem", "hierarchy", "taxonomy", "phylogeny", "syntax", "organization"] }, nodes: { type: "array", minItems: 1, maxItems: 80, items: { type: "object", additionalProperties: false, required: ["id", "label", "parentId"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, parentId: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] }, entryType: { type: "string" } } } } } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), variant: String(data?.variant || "hierarchy"), nodes: (data?.nodes || []).map((node) => ({ id: String(node?.id || "").trim(), label: String(node?.label || "").trim(), parentId: node?.parentId == null ? null : String(node.parentId).trim(), ...(node?.entryType ? { entryType: String(node.entryType).trim() } : {}) })) }; },
  validate(data) { const errors = []; const ids = new Set(data.nodes.map(({ id }) => id)); if (ids.size !== data.nodes.length) errors.push("Nós precisam de ids únicos."); data.nodes.forEach((node) => { if (node.parentId != null && !ids.has(node.parentId)) errors.push(`Pai inexistente em ${node.id}.`); let current = node; const seen = new Set([node.id]); while (current?.parentId) { if (seen.has(current.parentId)) { errors.push(`Ciclo em ${node.id}.`); break; } seen.add(current.parentId); current = data.nodes.find(({ id }) => id === current.parentId); } }); return errors; },
  render(data) { const children = new Map(); data.nodes.forEach((node) => { const key = node.parentId; if (!children.has(key)) children.set(key, []); children.get(key).push(node); }); return `<div class="runtime-block runtime-tree-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<div class="runtime-tree" role="tree">${renderChildren(null, children)}</div></div>`; },
  accessibleText(data) { const labels = new Map(data.nodes.map((node) => [node.id, node.label])); return data.nodes.map((node) => `${node.label}${node.parentId ? `, filho de ${labels.get(node.parentId)}` : ", raiz"}`).join(". "); },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.nodes.map((_, index) => ({ path: `nodes[${index}].label`, label: `Editar nó ${index + 1}` }))]; }
});
