import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotQuote, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

const CONTAINER_KINDS = Object.freeze(["application", "data_store", "queue", "file_store"]);

function text(value) {
  return String(value ?? "").trim();
}

function externalObjects(data) {
  return [
    ...data.people.map((item) => ({ ...item, role: "person", stereotype: "Pessoa" })),
    ...data.externalSystems.map((item) => ({ ...item, role: "external", stereotype: "Sistema externo" }))
  ];
}

function containerStereotype(kind) {
  return ({ application: "Aplicação", data_store: "Armazenamento de dados", queue: "Fila", file_store: "Armazenamento de arquivos" })[kind];
}

function containerPlainLabel(item) {
  return [`Contêiner · ${containerStereotype(item.kind)}`, wrapGraphvizLabel(item.label, 28), wrapGraphvizLabel(item.technology, 30), wrapGraphvizLabel(item.responsibility, 32)].join("\n");
}

function externalPlainLabel(item) {
  return [item.stereotype, wrapGraphvizLabel(item.label, 28), wrapGraphvizLabel(item.description, 32)].join("\n");
}

function containerTemplate(item) {
  return `<span class="package-system-diagram-node-content"><small>Contêiner · ${renderPackageInline(containerStereotype(item.kind))}</small><strong>${renderPackageInline(item.label)}</strong><em>${renderPackageInline(item.technology)}</em><span>${renderPackageInline(item.responsibility)}</span></span>`;
}

function externalTemplate(item) {
  return `<span class="package-system-diagram-node-content"><small>${renderPackageInline(item.stereotype)}</small><strong>${renderPackageInline(item.label)}</strong><span>${renderPackageInline(item.description)}</span></span>`;
}

function containerObjects(data) {
  return [
    ...data.containers.map((item) => ({ ...item, role: `container-${item.kind}` })),
    ...externalObjects(data)
  ];
}

function containerAccessibleText(data) {
  const names = new Map(containerObjects(data).map(({ id, label }) => [id, label]));
  return [
    data.prompt,
    `Sistema: ${data.system.label}. ${data.system.description}.`,
    ...data.containers.map((item) => `Contêiner ${item.label}, tecnologia ${item.technology}. ${item.responsibility}.`),
    ...data.people.map((item) => `Pessoa externa: ${item.label}. ${item.description}.`),
    ...data.externalSystems.map((item) => `Sistema externo: ${item.label}. ${item.description}.`),
    ...data.relationships.map((item) => `${names.get(item.from)} ${item.label} ${names.get(item.to)}.`)
  ].join(" ");
}

function graphvizSource(data) {
  const externalLines = externalObjects(data).map((item) => `  ${dotQuote(item.id)} ${dotAttributes({ id: `system-node-${item.id}`, class: `package-software-container-node is-${item.role}`, label: externalPlainLabel(item), shape: "box", style: "rounded", margin: "0.16,0.11" })};`);
  const containerLines = data.containers.map((item) => `    ${dotQuote(item.id)} ${dotAttributes({ id: `system-node-${item.id}`, class: `package-software-container-node is-${item.role}`, label: containerPlainLabel(item), shape: item.kind === "data_store" ? "cylinder" : item.kind === "queue" ? "component" : "box", style: item.kind === "application" ? "rounded" : "solid", margin: "0.16,0.11" })};`);
  const edgeLines = data.relationships.map((item) => `  ${dotQuote(item.from)} -> ${dotQuote(item.to)} ${dotAttributes({ id: `system-edge-${item.id}`, class: "package-software-container-relationship", label: wrapGraphvizLabel(item.label, 16), arrowsize: "0.72" })};`);
  return [
    "digraph SoftwareContainers {",
    `  graph ${dotAttributes({ bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: "polyline", outputorder: "edgesfirst", rankdir: "TB", nodesep: "0.42", ranksep: "0.72", newrank: "true" })};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];",
    "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];",
    ...externalLines,
    `  subgraph cluster_system { graph ${dotAttributes({ id: "software-container-boundary", class: "package-software-container-boundary", label: `Sistema · ${wrapGraphvizLabel(data.system.label, 30)}\n${wrapGraphvizLabel(data.system.description, 36)}`, labelloc: "t", labeljust: "l", margin: "20", style: "rounded" })};`,
    ...containerLines,
    "  }",
    ...edgeLines,
    "}"
  ].join("\n");
}

function labels(data) {
  return [
    ...data.containers.map((item) => ({ kind: "node", id: item.id, plain: containerPlainLabel(item), html: containerTemplate(item), replacement: "always" })),
    ...externalObjects(data).map((item) => ({ kind: "node", id: item.id, plain: externalPlainLabel(item), html: externalTemplate(item), replacement: "always" })),
    ...data.relationships.map((item) => ({ kind: "edge", id: item.id, plain: item.label, html: `<span>${renderPackageInline(item.label)}</span>` }))
  ];
}

function editableTargets(data) {
  return [
    { path: "prompt", label: "Editar orientação" },
    { path: "system.label", label: "Editar nome do sistema" },
    { path: "system.description", label: "Editar responsabilidade do sistema" },
    ...data.containers.flatMap((_, index) => [
      { path: `containers[${index}].label`, label: `Editar contêiner ${index + 1}` },
      { path: `containers[${index}].technology`, label: `Editar tecnologia do contêiner ${index + 1}` },
      { path: `containers[${index}].responsibility`, label: `Editar responsabilidade do contêiner ${index + 1}` }
    ]),
    ...data.people.flatMap((_, index) => [{ path: `people[${index}].label`, label: `Editar pessoa ${index + 1}` }, { path: `people[${index}].description`, label: `Editar papel da pessoa ${index + 1}` }]),
    ...data.externalSystems.flatMap((_, index) => [{ path: `externalSystems[${index}].label`, label: `Editar sistema externo ${index + 1}` }, { path: `externalSystems[${index}].description`, label: `Editar responsabilidade externa ${index + 1}` }]),
    ...data.relationships.map((_, index) => ({ path: `relationships[${index}].label`, label: `Editar relação ${index + 1}` }))
  ];
}

export const softwareContainerPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.software_container",
    version: "1.0.0",
    label: "Contêineres de software",
    purpose: "Representar aplicações e armazenamentos executáveis ou implantáveis dentro de um sistema segundo o nível de contêiner do C4.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["identify-runtime-boundary", "trace-container-dependency", "compare-responsibility", "explain-deployment-unit"]),
    academic: academicProfile({ domains: ["arquitetura de software", "engenharia de software", "sistemas distribuídos"], knowledgeObjects: ["contêiner", "aplicação", "armazenamento de dados", "fila", "tecnologia", "responsabilidade"], conventions: ["fronteira única de sistema", "contêineres internos tipados", "tecnologia e responsabilidade explícitas", "relações direcionais rotuladas"], appropriateWhen: ["a tarefa exige compreender unidades executáveis ou armazenamentos e suas dependências"], avoidWhen: ["o contexto externo basta", "a tarefa exige componentes internos de um contêiner", "a topologia de infraestrutura física é o objeto"], technologies: ["C4 Model", "Graphviz", "Viz.js WebAssembly", "SVG"], practiceModes: ["exposition", "gap", "typing", "selection"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Não representa classes, módulos internos, processos temporais ou nós físicos de implantação."]),
    accessibility: "Fronteira, contêineres, tecnologias, responsabilidades e relações possuem descrição textual equivalente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare unidades executáveis ou armazenamentos dentro de um sistema e suas dependências, sem desenhar a arquitetura.",
    required: Object.freeze(["prompt", "system", "containers", "people", "externalSystems", "relationships"]),
    optional: Object.freeze([]),
    fieldSemantics: Object.freeze({ containers: "Aplicações e armazenamentos implantáveis ou executáveis; não classes ou módulos.", kind: "Classe operacional do contêiner.", technology: "Tecnologia concreta do contêiner.", responsibility: "Responsabilidade arquitetural única e observável.", relationships: "Uso, leitura, escrita, publicação ou consumo entre objetos declarados." }),
    visualGrammar: Object.freeze(["Fronteira nomeada = sistema.", "Forma interna tipada = contêiner.", "Estereótipo e tecnologia distinguem semântica sem depender de cor.", "Seta rotulada = dependência em tempo de execução ou troca de dados."]),
    rules: Object.freeze(["Não trate classe, pacote ou função como contêiner.", "Cada contêiner deve ter responsabilidade própria.", "Declare a tecnologia em texto, sem ícones de fornecedor.", "Não declare coordenadas, rotas, cores ou tamanhos."]),
    example: Object.freeze({
      prompt: "Observe como a interface, o trabalho local e a persistência cooperam sem confundir responsabilidades.",
      system: { id: "aralearn", label: "AraLearn", description: "Ambiente móvel de autoria e estudo." },
      containers: [
        { id: "web", label: "Aplicação Web", kind: "application", technology: "JavaScript no navegador", responsibility: "Renderiza autoria, estudo e recursos interativos." },
        { id: "worker", label: "Service Worker", kind: "application", technology: "Web Worker", responsibility: "Mantém ativos locais e navegação sem conexão." },
        { id: "local", label: "Base local", kind: "data_store", technology: "IndexedDB", responsibility: "Guarda cursos, progresso e operações pendentes." },
        { id: "sync", label: "API de sincronização", kind: "application", technology: "Edge runtime", responsibility: "Valida e sincroniza alterações autorizadas." },
        { id: "files", label: "Armazenamento de objetos", kind: "file_store", technology: "Storage", responsibility: "Mantém artefatos imutáveis e econômicos." }
      ],
      people: [{ id: "learner", label: "Estudante-autor", description: "Estuda e modifica os próprios cursos." }],
      externalSystems: [{ id: "identity", label: "Identidade", description: "Autentica a conta e a sessão." }],
      relationships: [
        { id: "uses", from: "learner", to: "web", label: "usa" },
        { id: "cache", from: "web", to: "worker", label: "solicita ativos" },
        { id: "read", from: "web", to: "local", label: "lê e grava estado" },
        { id: "publish", from: "web", to: "sync", label: "envia alterações" },
        { id: "objects", from: "sync", to: "files", label: "grava artefatos" },
        { id: "login", from: "web", to: "identity", label: "valida sessão" }
      ]
    })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["prompt", "system", "containers", "people", "externalSystems", "relationships"],
    properties: {
      prompt: { type: "string", minLength: 1 },
      system: { type: "object", additionalProperties: false, required: ["id", "label", "description"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 } } },
      containers: { type: "array", minItems: 2, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label", "kind", "technology", "responsibility"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, kind: { type: "string", enum: CONTAINER_KINDS }, technology: { type: "string", minLength: 1 }, responsibility: { type: "string", minLength: 1 } } } },
      people: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["id", "label", "description"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 } } } },
      externalSystems: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["id", "label", "description"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 } } } },
      relationships: { type: "array", minItems: 1, maxItems: 32, items: { type: "object", additionalProperties: false, required: ["id", "from", "to", "label"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } }
    }
  }),
  normalize(data) {
    const external = (item) => ({ id: text(item?.id), label: text(item?.label), description: text(item?.description) });
    return { prompt: text(data?.prompt), system: external(data?.system), containers: (data?.containers || []).map((item) => ({ id: text(item?.id), label: text(item?.label), kind: text(item?.kind), technology: text(item?.technology), responsibility: text(item?.responsibility) })), people: (data?.people || []).map(external), externalSystems: (data?.externalSystems || []).map(external), relationships: (data?.relationships || []).map((item) => ({ id: text(item?.id), from: text(item?.from), to: text(item?.to), label: text(item?.label) })) };
  },
  validate(data) {
    const ids = containerObjects(data).map(({ id }) => id);
    const relationshipIds = data.relationships.map(({ id }) => id);
    const known = new Set(ids);
    const errors = [];
    if (known.size !== ids.length) errors.push("Contêineres e objetos externos precisam de ids únicos.");
    if (new Set(relationshipIds).size !== relationshipIds.length) errors.push("Relações precisam de ids únicos.");
    if (data.relationships.some(({ from, to }) => !known.has(from) || !known.has(to))) errors.push("Relação referencia objeto inexistente.");
    if (data.relationships.some(({ from, to }) => from === to)) errors.push("Relação não pode ligar um objeto a ele mesmo.");
    return errors;
  },
  render(data) {
    const diagramLabels = labels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: containerAccessibleText(data), caption: "Diagrama de contêineres · C4", labels: diagramLabels, model: { labels: systemDiagramModelLabels(diagramLabels) }, focusId: `system-node-${data.containers[0]?.id || ""}` });
    return `<div class="runtime-block runtime-software-container-block">${renderPackageProse(data.prompt)}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: containerAccessibleText,
  editableTargets,
  practiceTargets(data) { return editableTargets(data).filter(({ path }) => path !== "prompt" && !path.startsWith("system.")).map((target) => ({ ...target, label: target.label.replace("Editar", "Lacuna em"), modes: ["gap", "typing"] })); }
});
