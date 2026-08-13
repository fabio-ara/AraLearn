import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotQuote, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

const VARIANT_LABELS = Object.freeze({
  filesystem: "sistema de arquivos",
  hierarchy: "hierarquia",
  taxonomy: "taxonomia",
  phylogeny: "filogenia",
  syntax: "árvore sintática",
  organization: "organização"
});

function text(value) {
  return String(value ?? "").trim();
}

function nodePlainLabel(node, variant) {
  if (variant !== "filesystem" || !node.entryType) return wrapGraphvizLabel(node.label, 24);
  return `[${wrapGraphvizLabel(node.entryType, 16)}]\n${wrapGraphvizLabel(node.label, 24)}`;
}

function nodeTemplate(node, variant) {
  return `<span class="package-system-diagram-node-content">${variant === "filesystem" && node.entryType ? `<small>[${renderPackageInline(node.entryType)}]</small>` : ""}<strong>${renderPackageInline(node.label)}</strong></span>`;
}

function treeAccessibleText(data) {
  const labels = new Map(data.nodes.map(({ id, label }) => [id, label]));
  return [data.prompt, `Árvore de ${VARIANT_LABELS[data.variant]}.`, ...data.nodes.map((node) => node.parentId ? `${node.label} é descendente direto de ${labels.get(node.parentId)}.` : `${node.label} é raiz.`)].filter(Boolean).join(" ");
}

function graphvizSource(data) {
  const shape = data.variant === "filesystem" ? "folder" : data.variant === "syntax" ? "plaintext" : data.variant === "phylogeny" ? "point" : "ellipse";
  return [
    "digraph RootedTree {",
    `  graph ${dotAttributes({ bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: data.variant === "phylogeny" ? "ortho" : "polyline", outputorder: "edgesfirst", rankdir: "TB", nodesep: "0.38", ranksep: "0.62", ordering: "out" })};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", margin=\"0.13,0.08\"];",
    "  edge [penwidth=\"1.15\", color=\"#64748b\", arrowsize=\"0.68\"];",
    ...data.nodes.map((node) => `  ${dotQuote(node.id)} ${dotAttributes({ id: `system-node-${node.id}`, class: `package-rooted-tree-node is-${data.variant}`, label: nodePlainLabel(node, data.variant), shape, ...(data.variant === "syntax" ? { fontname: "Arial Italic" } : {}), ...(data.variant === "phylogeny" ? { width: "0.08", height: "0.08", xlabel: wrapGraphvizLabel(node.label, 18) } : {}) })};`),
    ...data.nodes.filter(({ parentId }) => parentId).map((node) => `  ${dotQuote(node.parentId)} -> ${dotQuote(node.id)} ${dotAttributes({ class: "package-rooted-tree-edge", dir: data.variant === "phylogeny" ? "none" : "forward" })};`),
    "}"
  ].join("\n");
}

function diagramLabels(data) {
  if (data.variant === "phylogeny") return [];
  return data.nodes.map((node) => ({ kind: "node", id: node.id, plain: nodePlainLabel(node, data.variant), html: nodeTemplate(node, data.variant) }));
}

export const treePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.tree",
    version: "1.0.0",
    label: "Árvore enraizada",
    purpose: "Representar hierarquia com relação pai-filho, raiz explícita e no máximo um pai por nó.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["locate-parent", "trace-ancestry", "compare-depth", "identify-subtree"]),
    academic: academicProfile({
      domains: ["matemática discreta", "estruturas de dados", "computação", "classificação"],
      knowledgeObjects: ["árvore enraizada", "raiz", "pai", "filho", "ancestral", "subárvore"],
      conventions: ["raiz no topo", "um pai por nó", "níveis alinhados", "arestas sem cruzamento sempre que a estrutura permitir"],
      appropriateWhen: ["a relação pai-filho e o caminho até a raiz são o objeto do raciocínio"],
      avoidWhen: ["há múltiplos pais ou relações cruzadas", "a notação especializada de classes, estados, sintaxe ou filogenia é parte do conteúdo"],
      technologies: ["Graphviz", "Viz.js WebAssembly", "SVG", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection", "classification"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Relações muitos-para-muitos exigem outro package.", "Árvores grandes devem ser recortadas por subárvore ou objetivo."]),
    accessibility: "Cada nó é descrito com seu pai; a ordem visual acompanha os níveis."
  }),
  authoringContract: Object.freeze({
    intent: "Declare nós e parentId; o renderer calcula níveis, espaçamento e conectores.",
    required: Object.freeze(["variant", "nodes"]),
    optional: Object.freeze(["prompt"]),
    fieldSemantics: Object.freeze({ variant: "Contexto de leitura; não substitui packages disciplinares mais específicos quando sua notação for essencial.", nodes: "Cada nó possui id, rótulo e parentId; null identifica raiz." }),
    visualGrammar: Object.freeze(["Nó superior sem pai = raiz.", "Aresta descendente = relação pai-filho.", "Mesma faixa horizontal = mesma profundidade."]),
    rules: Object.freeze(["Existe ao menos uma raiz.", "Não há ciclos nem pai inexistente.", "Não declare coordenadas, níveis, curvas ou tamanhos.", "Use graph quando relações cruzadas forem essenciais."]),
    example: Object.freeze({
      prompt: "Observe a árvore binária de busca e compare os caminhos da raiz até 20 e 65.",
      variant: "hierarchy",
      nodes: [
        { id: "n40", label: "40", parentId: null },
        { id: "n20", label: "20", parentId: "n40" },
        { id: "n60", label: "60", parentId: "n40" },
        { id: "n10", label: "10", parentId: "n20" },
        { id: "n30", label: "30", parentId: "n20" },
        { id: "n50", label: "50", parentId: "n60" },
        { id: "n70", label: "70", parentId: "n60" },
        { id: "n65", label: "65", parentId: "n70" }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["variant", "nodes"], properties: {
    prompt: { type: "string" },
    variant: { type: "string", enum: Object.keys(VARIANT_LABELS) },
    nodes: { type: "array", minItems: 1, maxItems: 80, items: { type: "object", additionalProperties: false, required: ["id", "label", "parentId"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, parentId: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] }, entryType: { type: "string" } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), variant: text(data?.variant) || "hierarchy", nodes: (data?.nodes || []).map((node) => ({ id: text(node?.id), label: text(node?.label), parentId: node?.parentId == null ? null : text(node.parentId), ...(node?.entryType ? { entryType: text(node.entryType) } : {}) })) };
  },
  validate(data) {
    const errors = [];
    const ids = new Set(data.nodes.map(({ id }) => id));
    if (ids.size !== data.nodes.length) errors.push("Nós precisam de ids únicos.");
    if (!data.nodes.some(({ parentId }) => parentId === null)) errors.push("A árvore precisa de ao menos uma raiz.");
    data.nodes.forEach((node) => {
      if (node.parentId != null && !ids.has(node.parentId)) errors.push(`Pai inexistente em ${node.id}.`);
      let current = node;
      const seen = new Set([node.id]);
      while (current?.parentId) {
        if (seen.has(current.parentId)) { errors.push(`Ciclo em ${node.id}.`); break; }
        seen.add(current.parentId);
        current = data.nodes.find(({ id }) => id === current.parentId);
      }
    });
    return errors;
  },
  render(data) {
    const labels = diagramLabels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: treeAccessibleText(data), caption: `Árvore enraizada · ${VARIANT_LABELS[data.variant]}`, labels, model: { labels: systemDiagramModelLabels(labels) }, focusId: `system-node-${data.nodes.find(({ parentId }) => parentId === null)?.id || ""}`, errorMessage: "Não foi possível diagramar a árvore." });
    return `<div class="runtime-block runtime-tree-block">${data.prompt ? renderPackageProse(data.prompt) : ""}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: treeAccessibleText,
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.nodes.map((_, index) => ({ path: `nodes[${index}].label`, label: `Editar nó ${index + 1}` }))];
  },
  practiceTargets(data) {
    return data.nodes.map((_, index) => ({ path: `nodes[${index}].label`, label: `Lacuna no nó ${index + 1}`, modes: ["gap", "typing"] }));
  }
});
