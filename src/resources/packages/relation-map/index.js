import { academicProfile } from "../../sdk/academic.js";
import {
  dotAttributes,
  dotQuote,
  graphvizHtmlLines,
  graphvizLayoutAttributes,
  plainGraphvizLabel
} from "../../sdk/graphviz.js";
import {
  renderPackageInline,
  renderPackageInlineReference,
  renderPackageProse
} from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

function text(value) {
  return String(value ?? "").trim();
}

function normalizeSet(raw, fallbackLabel) {
  return {
    label: text(raw?.label) || fallbackLabel,
    items: (raw?.items || []).map((item) => ({
      id: text(item?.id),
      label: text(item?.label)
    }))
  };
}

function relationMapAccessibleText(data) {
  const left = new Map(data.leftSet.items.map(({ id, label }) => [id, label]));
  const right = new Map(data.rightSet.items.map(({ id, label }) => [id, label]));
  const meaning = data.relationMeaning || "relaciona-se a";
  return [
    data.prompt,
    `Relação ${data.name}, de ${data.leftSet.label} em ${data.rightSet.label}.`,
    `${data.leftSet.label}: ${data.leftSet.items.map(({ label }) => label).join(", ")}.`,
    `${data.rightSet.label}: ${data.rightSet.items.map(({ label }) => label).join(", ")}.`,
    ...data.relations.map(({ from, to }) => `${left.get(from)} ${meaning} ${right.get(to)}.`)
  ].join(" ");
}

function graphvizNode(id, label, side, highlighted) {
  return `    ${dotQuote(`${side}-${id}`)} [${[
    `id=${dotQuote(`system-node-${side}-${id}`)}`,
    `class=${dotQuote(`package-relation-map-node is-${side}${highlighted ? " is-highlighted" : ""}`)}`,
    "shape=ellipse",
    "margin=\"0.16,0.10\"",
    `label=<${graphvizHtmlLines(plainGraphvizLabel(label), 22)}>`
  ].join(", ")}];`;
}

function graphvizSource(data) {
  const highlightedRelations = new Set(data.highlight?.relations || []);
  const highlightedLeft = new Set(data.highlight?.leftItems || []);
  const highlightedRight = new Set(data.highlight?.rightItems || []);
  const leftNodes = data.leftSet.items.map((item) => graphvizNode(
    item.id,
    item.label,
    "left",
    highlightedLeft.has(item.id)
  ));
  const rightNodes = data.rightSet.items.map((item) => graphvizNode(
    item.id,
    item.label,
    "right",
    highlightedRight.has(item.id)
  ));
  const edges = data.relations.map((relation) => `  ${dotQuote(`left-${relation.from}`)} -> ${dotQuote(`right-${relation.to}`)} ${dotAttributes({
    id: `relation-edge-${relation.id}`,
    class: `package-relation-map-edge${highlightedRelations.has(relation.id) ? " is-highlighted" : ""}`,
    arrowsize: "0.72",
    minlen: "2"
  })};`);
  return [
    `digraph ${dotQuote(data.name)} {`,
    `  graph ${dotAttributes(graphvizLayoutAttributes("inline", {
      id: `relation-map-${data.name}`,
      bgcolor: "transparent",
      pad: "0.18",
      margin: "0",
      nodesep: "0.42",
      ranksep: "1.15",
      splines: "spline",
      outputorder: "edgesfirst",
      remincross: "true",
      mclimit: "2"
    }))};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", style=\"solid\"];",
    "  edge [penwidth=\"1.15\", color=\"#64748b\"];",
    "  subgraph cluster_left {",
    `    graph ${dotAttributes({ id: "relation-set-left", class: "package-relation-map-set is-left", label: plainGraphvizLabel(data.leftSet.label), style: "rounded", margin: "14" })};`,
    ...leftNodes,
    "  }",
    "  subgraph cluster_right {",
    `    graph ${dotAttributes({ id: "relation-set-right", class: "package-relation-map-set is-right", label: plainGraphvizLabel(data.rightSet.label), style: "rounded", margin: "14" })};`,
    ...rightNodes,
    "  }",
    ...edges,
    "}"
  ].join("\n");
}

function diagramLabels(data) {
  return [
    ...data.leftSet.items.map((item) => ({
      kind: "node",
      id: `left-${item.id}`,
      plain: item.label,
      html: `<span class="package-system-diagram-node-content"><strong>${renderPackageInline(item.label)}</strong></span>`
    })),
    ...data.rightSet.items.map((item) => ({
      kind: "node",
      id: `right-${item.id}`,
      plain: item.label,
      html: `<span class="package-system-diagram-node-content"><strong>${renderPackageInline(item.label)}</strong></span>`
    }))
  ];
}

function relationNotation(data) {
  const left = new Map(data.leftSet.items.map(({ id, label }) => [id, label]));
  const right = new Map(data.rightSet.items.map(({ id, label }) => [id, label]));
  const pairs = data.relations
    .map(({ from, to }) => `(${left.get(from)}, ${right.get(to)})`)
    .join(", ");
  return `<i>${renderPackageInline(data.name)}</i> = {${renderPackageInlineReference(pairs)}}`;
}

export const relationMapPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.relation_map",
    version: "1.0.0",
    label: "Diagrama de relação",
    purpose: "Tornar visíveis domínio, contradomínio, imagens, preimagens e cardinalidade de uma relação binária.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["map-correspondence", "inspect-image", "inspect-preimage", "inspect-cardinality"]),
    academic: academicProfile({
      domains: ["teoria dos conjuntos", "lógica", "álgebra linear", "matemática discreta"],
      knowledgeObjects: ["relação binária", "domínio", "contradomínio", "imagem", "preimagem", "par ordenado"],
      conventions: ["dois conjuntos delimitados", "elementos individualizados", "seta por par ordenado", "notação extensional complementar"],
      appropriateWhen: ["as incidências entre elementos dos dois conjuntos precisam ser percebidas simultaneamente"],
      avoidWhen: ["pares independentes cabem em tabela", "a tarefa é apenas associar respostas", "há interseção de conjuntos"],
      technologies: ["Graphviz", "Viz.js WebAssembly", "SVG", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection", "matching"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.choice", "aralearn.response.gap", "aralearn.response.matching"]),
    limitations: Object.freeze([
      "Não representa interseção de conjuntos; para isso use diagrama de conjuntos.",
      "Uma relação densa deve ser dividida ou apresentada por matriz de incidência, conforme o gesto cognitivo."
    ]),
    accessibility: "A descrição textual enumera os conjuntos e todos os pares da relação; o desenho não é a única fonte de informação."
  }),
  authoringContract: Object.freeze({
    intent: "Declare semanticamente dois conjuntos e os pares da relação; o package calcula a disposição e as setas.",
    required: Object.freeze(["prompt", "name", "leftSet", "rightSet", "relations"]),
    optional: Object.freeze(["relationMeaning", "highlight"]),
    rules: Object.freeze([
      "Cada from pertence ao conjunto esquerdo e cada to ao conjunto direito.",
      "Uma seta representa somente a pertença do par à relação; não escreva o par sobre a seta.",
      "Use este package somente quando imagem, preimagem ou cardinalidade forem parte do raciocínio.",
      "Para uma simples lista de correspondências sem leitura relacional, use tabela ou matching."
    ]),
    example: Object.freeze({
      prompt: "Examine a relação R de A em B: a possui duas imagens e 4 não possui preimagem.",
      name: "R",
      relationMeaning: "relaciona-se a",
      leftSet: {
        label: "Domínio A",
        items: [{ id: "a", label: "a" }, { id: "b", label: "b" }, { id: "c", label: "c" }]
      },
      rightSet: {
        label: "Contradomínio B",
        items: [{ id: "one", label: "1" }, { id: "two", label: "2" }, { id: "three", label: "3" }, { id: "four", label: "4" }]
      },
      relations: [
        { id: "a1", from: "a", to: "one" },
        { id: "a2", from: "a", to: "two" },
        { id: "b2", from: "b", to: "two" },
        { id: "c3", from: "c", to: "three" }
      ],
      highlight: { relations: ["a1", "a2"], leftItems: ["a"], rightItems: [] }
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["prompt", "name", "leftSet", "rightSet", "relations"],
    properties: {
      prompt: { type: "string", minLength: 1, maxLength: 2000 },
      name: { type: "string", minLength: 1, maxLength: 40 },
      relationMeaning: { type: "string", minLength: 1, maxLength: 160 },
      leftSet: {
        type: "object", additionalProperties: false, required: ["label", "items"], properties: {
          label: { type: "string", minLength: 1, maxLength: 160 },
          items: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 300 } } } }
        }
      },
      rightSet: {
        type: "object", additionalProperties: false, required: ["label", "items"], properties: {
          label: { type: "string", minLength: 1, maxLength: 160 },
          items: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 300 } } } }
        }
      },
      relations: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "from", "to"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 } } } },
      highlight: { type: "object", additionalProperties: false, properties: { relations: { type: "array", uniqueItems: true, items: { type: "string" } }, leftItems: { type: "array", uniqueItems: true, items: { type: "string" } }, rightItems: { type: "array", uniqueItems: true, items: { type: "string" } } } }
    }
  }),
  normalize(data) {
    return {
      prompt: text(data?.prompt),
      name: text(data?.name),
      ...(text(data?.relationMeaning) ? { relationMeaning: text(data.relationMeaning) } : {}),
      leftSet: normalizeSet(data?.leftSet, "Conjunto A"),
      rightSet: normalizeSet(data?.rightSet, "Conjunto B"),
      relations: (data?.relations || []).map((relation) => ({
        id: text(relation?.id), from: text(relation?.from), to: text(relation?.to)
      })),
      ...((data?.highlight?.relations?.length || data?.highlight?.leftItems?.length || data?.highlight?.rightItems?.length) ? {
        highlight: {
          relations: (data.highlight.relations || []).map(text),
          leftItems: (data.highlight.leftItems || []).map(text),
          rightItems: (data.highlight.rightItems || []).map(text)
        }
      } : {})
    };
  },
  validate(data) {
    const leftIds = data.leftSet.items.map(({ id }) => id);
    const rightIds = data.rightSet.items.map(({ id }) => id);
    const relationIds = data.relations.map(({ id }) => id);
    const left = new Set(leftIds);
    const right = new Set(rightIds);
    const errors = [];
    if (left.size !== leftIds.length || right.size !== rightIds.length) errors.push("Itens precisam de ids únicos dentro de cada conjunto.");
    if (new Set(relationIds).size !== relationIds.length) errors.push("Relações precisam de ids únicos.");
    if (data.relations.some(({ from, to }) => !left.has(from) || !right.has(to))) errors.push("Relação referencia item inexistente.");
    if (new Set(data.relations.map(({ from, to }) => `${from}\u0000${to}`)).size !== data.relations.length) errors.push("O mesmo par ordenado não pode ser repetido.");
    if ((data.highlight?.leftItems || []).some((id) => !left.has(id))) errors.push("Destaque referencia item esquerdo inexistente.");
    if ((data.highlight?.rightItems || []).some((id) => !right.has(id))) errors.push("Destaque referencia item direito inexistente.");
    if ((data.highlight?.relations || []).some((id) => !relationIds.includes(id))) errors.push("Destaque referencia relação inexistente.");
    return errors;
  },
  render(data) {
    const labels = diagramLabels(data);
    const figure = renderSystemDiagramFigure({
      source: graphvizSource(data),
      engine: "dot",
      accessibleText: relationMapAccessibleText(data),
      caption: relationNotation(data),
      labels,
      model: { labels: systemDiagramModelLabels(labels) },
      focusId: `system-node-left-${data.leftSet.items[0]?.id || ""}`,
      errorMessage: "Não foi possível diagramar a relação."
    });
    return `<div class="runtime-block package-relation-map">${renderPackageProse(data.prompt)}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: relationMapAccessibleText,
  editableTargets(data) {
    return [
      { path: "prompt", label: "Editar orientação" },
      { path: "name", label: "Editar símbolo da relação" },
      ...(data.relationMeaning ? [{ path: "relationMeaning", label: "Editar leitura da relação" }] : []),
      { path: "leftSet.label", label: "Editar domínio" },
      { path: "rightSet.label", label: "Editar contradomínio" },
      ...data.leftSet.items.map((_, index) => ({ path: `leftSet.items[${index}].label`, label: `Editar elemento do domínio ${index + 1}` })),
      ...data.rightSet.items.map((_, index) => ({ path: `rightSet.items[${index}].label`, label: `Editar elemento do contradomínio ${index + 1}` }))
    ];
  },
  practiceTargets(data) {
    return [
      ...data.leftSet.items.map((_, index) => ({ path: `leftSet.items[${index}].label`, label: `Lacuna no domínio ${index + 1}`, modes: ["gap", "typing"] })),
      ...data.rightSet.items.map((_, index) => ({ path: `rightSet.items[${index}].label`, label: `Lacuna no contradomínio ${index + 1}`, modes: ["gap", "typing"] }))
    ];
  }
});
