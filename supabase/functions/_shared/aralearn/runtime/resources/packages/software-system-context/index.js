import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotQuote, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

function text(value) {
  return String(value ?? "").trim();
}

function contextObjects(data) {
  return [
    { ...data.system, role: "focus", stereotype: "Sistema em foco" },
    ...data.people.map((item) => ({ ...item, role: "person", stereotype: "Pessoa" })),
    ...data.externalSystems.map((item) => ({ ...item, role: "external", stereotype: "Sistema externo" }))
  ];
}

function objectPlainLabel(item) {
  return [`[${item.stereotype}]`, wrapGraphvizLabel(item.label, 26), wrapGraphvizLabel(item.description, 32)].join("\n");
}

function objectTemplate(item) {
  return `<span class="package-system-diagram-node-content"><small>[${renderPackageInline(item.stereotype)}]</small><strong>${renderPackageInline(item.label)}</strong><span>${renderPackageInline(item.description)}</span></span>`;
}

function contextAccessibleText(data) {
  const names = new Map(contextObjects(data).map(({ id, label }) => [id, label]));
  return [
    data.prompt,
    `Sistema em foco: ${data.system.label}. ${data.system.description}.`,
    ...data.people.map((item) => `Pessoa: ${item.label}. ${item.description}.`),
    ...data.externalSystems.map((item) => `Sistema externo: ${item.label}. ${item.description}.`),
    ...data.relationships.map((item) => `${names.get(item.from)} ${item.label} ${names.get(item.to)}.`)
  ].join(" ");
}

function graphvizSource(data) {
  const objects = contextObjects(data);
  const nodeLines = objects.map((item) => `  ${dotQuote(item.id)} ${dotAttributes({
    id: `system-node-${item.id}`,
    class: `package-system-context-node is-${item.role}`,
    label: objectPlainLabel(item),
    shape: item.role === "person" ? "box" : "box",
    style: item.role === "person" ? "rounded" : "rounded",
    margin: "0.16,0.11"
  })};`);
  const edgeLines = data.relationships.map((item) => `  ${dotQuote(item.from)} -> ${dotQuote(item.to)} ${dotAttributes({
    id: `system-edge-${item.id}`,
    class: "package-system-context-relationship",
    label: wrapGraphvizLabel(item.label, 16),
    arrowsize: "0.72"
  })};`);
  return [
    "digraph SoftwareSystemContext {",
    `  graph ${dotAttributes({ bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: "spline", outputorder: "edgesfirst", rankdir: "TB", nodesep: "0.38", ranksep: "0.72" })};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];",
    "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];",
    ...nodeLines,
    ...edgeLines,
    "}"
  ].join("\n");
}

function labels(data) {
  return [
    ...contextObjects(data).map((item) => ({ kind: "node", id: item.id, plain: objectPlainLabel(item), html: objectTemplate(item) })),
    ...data.relationships.map((item) => ({ kind: "edge", id: item.id, plain: item.label, html: `<span>${renderPackageInline(item.label)}</span>` }))
  ];
}

function editableTargets(data) {
  return [
    { path: "prompt", label: "Editar orientação" },
    { path: "system.label", label: "Editar nome do sistema em foco" },
    { path: "system.description", label: "Editar responsabilidade do sistema em foco" },
    ...data.people.flatMap((_, index) => [
      { path: `people[${index}].label`, label: `Editar pessoa ${index + 1}` },
      { path: `people[${index}].description`, label: `Editar papel da pessoa ${index + 1}` }
    ]),
    ...data.externalSystems.flatMap((_, index) => [
      { path: `externalSystems[${index}].label`, label: `Editar sistema externo ${index + 1}` },
      { path: `externalSystems[${index}].description`, label: `Editar responsabilidade externa ${index + 1}` }
    ]),
    ...data.relationships.map((_, index) => ({ path: `relationships[${index}].label`, label: `Editar relação ${index + 1}` }))
  ];
}

export const softwareSystemContextPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.software_system_context",
    version: "1.0.0",
    label: "Contexto de sistema de software",
    purpose: "Situar um sistema de software entre pessoas e sistemas externos segundo o diagrama de contexto do modelo C4.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["identify-scope", "distinguish-actor", "trace-external-dependency", "explain-system-context"]),
    academic: academicProfile({
      domains: ["arquitetura de software", "engenharia de software", "análise de sistemas"],
      knowledgeObjects: ["sistema em foco", "pessoa", "sistema externo", "relação externa", "fronteira de escopo"],
      conventions: ["um único sistema em foco", "pessoas e sistemas externos identificados por tipo", "relações direcionais rotuladas", "ausência de componentes internos"],
      appropriateWhen: ["a tarefa é explicar o contexto e a fronteira externa de um sistema de software"],
      avoidWhen: ["a tarefa exige contêineres internos", "o objeto é um grafo matemático", "a tarefa trata de hardware e portas internas"],
      technologies: ["C4 Model", "Graphviz", "Viz.js WebAssembly", "SVG"],
      practiceModes: ["exposition", "gap", "typing", "selection"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Não representa contêineres, componentes, classes, infraestrutura ou sequência temporal."]),
    accessibility: "O sistema, as pessoas, os sistemas externos e todas as relações possuem descrição textual equivalente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare o sistema em foco, seus usuários, os sistemas externos e as relações; o renderer decide posição e rotas.",
    required: Object.freeze(["prompt", "system", "people", "externalSystems", "relationships"]),
    optional: Object.freeze([]),
    fieldSemantics: Object.freeze({
      system: "Único sistema cujo escopo está sendo explicado.",
      people: "Papéis humanos que usam ou administram o sistema; não são nomes de indivíduos.",
      externalSystems: "Sistemas fora da fronteira do sistema em foco.",
      relationships: "Interações direcionais descritas por verbo ou pequena locução verbal."
    }),
    visualGrammar: Object.freeze(["[Sistema em foco] identifica o objeto central.", "[Pessoa] identifica papel humano.", "[Sistema externo] identifica dependência fora do escopo.", "Seta rotulada identifica quem inicia a interação e sua finalidade."]),
    rules: Object.freeze(["Não inclua banco de dados, API, fila ou módulo interno.", "Use descrições de responsabilidade, não detalhes de implementação.", "Não declare coordenadas, cores, formas ou agrupamentos.", "Toda relação deve ligar objetos declarados."]),
    example: Object.freeze({
      prompt: "Observe quem interage com o ambiente de aprendizagem e quais serviços permanecem fora de sua fronteira.",
      system: { id: "aralearn", label: "AraLearn", description: "Organiza autoria e estudo de cursos em microssequências." },
      people: [
        { id: "student", label: "Estudante", description: "Estuda, pratica e registra seu progresso." },
        { id: "author", label: "Autor-pesquisador", description: "Planeja, revisa e investiga os cursos." }
      ],
      externalSystems: [
        { id: "identity", label: "Serviço de identidade", description: "Autentica contas e emite sessões." },
        { id: "model", label: "Serviço de modelo", description: "Auxilia revisões textuais solicitadas pelo usuário." }
      ],
      relationships: [
        { id: "studies", from: "student", to: "aralearn", label: "estuda e pratica" },
        { id: "authors", from: "author", to: "aralearn", label: "cria e audita cursos" },
        { id: "auth", from: "aralearn", to: "identity", label: "solicita autenticação" },
        { id: "assist", from: "aralearn", to: "model", label: "solicita assistência textual" }
      ]
    })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["prompt", "system", "people", "externalSystems", "relationships"],
    properties: {
      prompt: { type: "string", minLength: 1 },
      system: { $ref: "#/$defs/object" },
      people: { type: "array", minItems: 1, maxItems: 8, items: { $ref: "#/$defs/object" } },
      externalSystems: { type: "array", maxItems: 10, items: { $ref: "#/$defs/object" } },
      relationships: { type: "array", minItems: 1, maxItems: 24, items: { $ref: "#/$defs/relationship" } }
    },
    $defs: {
      object: { type: "object", additionalProperties: false, required: ["id", "label", "description"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 48 }, description: { type: "string", minLength: 1, maxLength: 120 } } },
      relationship: { type: "object", additionalProperties: false, required: ["id", "from", "to", "label"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 72 } } }
    }
  }),
  normalize(data) {
    const object = (item) => ({ id: text(item?.id), label: text(item?.label), description: text(item?.description) });
    return { prompt: text(data?.prompt), system: object(data?.system), people: (data?.people || []).map(object), externalSystems: (data?.externalSystems || []).map(object), relationships: (data?.relationships || []).map((item) => ({ id: text(item?.id), from: text(item?.from), to: text(item?.to), label: text(item?.label) })) };
  },
  validate(data) {
    const objects = contextObjects(data);
    const ids = objects.map(({ id }) => id);
    const relationships = data.relationships.map(({ id }) => id);
    const known = new Set(ids);
    const errors = [];
    if (known.size !== ids.length) errors.push("Todos os objetos precisam de ids únicos.");
    if (new Set(relationships).size !== relationships.length) errors.push("Relações precisam de ids únicos.");
    if (data.relationships.some(({ from, to }) => !known.has(from) || !known.has(to))) errors.push("Relação referencia objeto inexistente.");
    if (data.relationships.some(({ from, to }) => from === to)) errors.push("Relação de contexto não pode ligar um objeto a ele mesmo.");
    return errors;
  },
  render(data) {
    const diagramLabels = labels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: contextAccessibleText(data), caption: "Diagrama de contexto de sistema · C4", labels: diagramLabels, model: { labels: systemDiagramModelLabels(diagramLabels) }, focusId: `system-node-${data.system.id}` });
    return `<div class="runtime-block runtime-software-system-context-block">${renderPackageProse(data.prompt)}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: contextAccessibleText,
  editableTargets,
  practiceTargets(data) { return editableTargets(data).filter(({ path }) => path !== "prompt").map((target) => ({ ...target, label: target.label.replace("Editar", "Lacuna em"), modes: ["gap", "typing"] })); }
});
