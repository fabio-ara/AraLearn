import { academicProfile } from "../../sdk/academic.js";
import { dotAttributes, dotQuote, graphvizLayoutAttributes, wrapGraphvizLabel } from "../../sdk/graphviz.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import {
  hydrateSystemDiagrams,
  renderSystemDiagramFigure,
  systemDiagramModelLabels
} from "../system-diagrams/shared.js";

const CARDINALITIES = Object.freeze(["one", "zero_or_one", "one_or_many", "zero_or_many"]);
const CARDINALITY_TEXT = Object.freeze({ one: "exatamente um", zero_or_one: "zero ou um", one_or_many: "um ou muitos", zero_or_many: "zero ou muitos" });
const ARROW_SHAPES = Object.freeze({ one: "tee", zero_or_one: "odottee", one_or_many: "crowtee", zero_or_many: "crowodot" });

function text(value) {
  return String(value ?? "").trim();
}

function attributeLine(attribute) {
  const key = attribute.key === "primary" ? "PK" : attribute.key === "foreign" ? "FK" : attribute.key === "primary-foreign" ? "PK, FK" : "";
  return `${key ? `[${key}] ` : ""}${attribute.name} : ${attribute.type}${attribute.optional ? " [0..1]" : ""}`;
}

function entityPlainLabel(entity) {
  return [wrapGraphvizLabel(entity.name, 28), ...entity.attributes.map(attributeLine)].join("\n");
}

function entityTemplate(entity) {
  return `<span class="package-er-entity-content"><strong>${renderPackageInline(entity.name)}</strong><span>${entity.attributes.map((attribute) => `<small>${renderPackageInline(attributeLine(attribute))}</small>`).join("")}</span></span>`;
}

function erAccessibleText(data) {
  const names = new Map(data.entities.map(({ id, name }) => [id, name]));
  return [
    data.prompt,
    ...data.entities.map((entity) => `Entidade ${entity.name}: ${entity.attributes.map(attributeLine).join(", ")}.`),
    ...data.relationships.map((relationship) => `${names.get(relationship.from)} participa de ${relationship.label} com ${names.get(relationship.to)}; do lado de ${names.get(relationship.from)}, ${CARDINALITY_TEXT[relationship.fromCardinality]}; do lado de ${names.get(relationship.to)}, ${CARDINALITY_TEXT[relationship.toCardinality]}.`)
  ].filter(Boolean).join(" ");
}

function graphvizSource(data) {
  return [
    "digraph EntityRelationship {",
    `  graph ${dotAttributes(graphvizLayoutAttributes("block", { bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: "polyline", outputorder: "edgesfirst", nodesep: "0.48", ranksep: "0.95" }))};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", shape=\"box\", style=\"rounded\", margin=\"0.17,0.12\"];",
    "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", arrowsize=\"0.72\"];",
    ...data.entities.map((entity) => `  ${dotQuote(entity.id)} ${dotAttributes({ id: `system-node-${entity.id}`, class: "package-er-entity", label: entityPlainLabel(entity) })};`),
    ...data.relationships.map((relationship) => `  ${dotQuote(relationship.from)} -> ${dotQuote(relationship.to)} ${dotAttributes({ id: `system-edge-${relationship.id}`, class: `package-er-relationship${relationship.identifying ? " is-identifying" : ""}`, label: wrapGraphvizLabel(relationship.label, 18), dir: "both", arrowtail: ARROW_SHAPES[relationship.fromCardinality], arrowhead: ARROW_SHAPES[relationship.toCardinality], style: relationship.identifying ? "solid" : "dashed" })};`),
    "}"
  ].join("\n");
}

function labels(data) {
  return [
    ...data.entities.map((entity) => ({ kind: "node", id: entity.id, plain: entityPlainLabel(entity), html: entityTemplate(entity) })),
    ...data.relationships.map((relationship) => ({ kind: "edge", id: relationship.id, plain: relationship.label, html: `<span>${renderPackageInline(relationship.label)}</span>` }))
  ];
}

export const entityRelationshipPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.entity_relationship",
    version: "1.0.0",
    label: "Modelo entidade-relacionamento",
    purpose: "Representar entidades, atributos e cardinalidades no nível conceitual da modelagem de dados.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["identify-entity", "inspect-cardinality", "compare-optional-participation", "derive-relational-model"]),
    academic: academicProfile({
      domains: ["bancos de dados", "modelagem conceitual de dados", "engenharia de software"],
      knowledgeObjects: ["entidade", "atributo", "relacionamento", "cardinalidade", "participação"],
      conventions: ["entidades como caixas nomeadas", "atributos internos", "cardinalidade em cada extremidade", "participação opcional explícita", "relação identificadora distinguida"],
      appropriateWhen: ["o modelo conceitual e as regras de cardinalidade são o objeto"],
      avoidWhen: ["o objeto é o esquema relacional com PK e FK já transformadas", "é preciso mostrar instâncias de dados"],
      technologies: ["notação pé-de-galinha", "Graphviz", "Viz.js WebAssembly", "SVG"],
      practiceModes: ["exposition", "gap", "typing", "selection", "matching"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.matching"]),
    limitations: Object.freeze(["Relacionamentos ternários complexos devem ser reificados ou receber package próprio.", "O renderer não mistura modelo conceitual e físico."]),
    accessibility: "Entidades, atributos, relações e cardinalidades possuem descrição textual equivalente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare entidades e cardinalidades em linguagem de domínio; o renderer materializa a notação de pé-de-galinha.",
    required: Object.freeze(["entities", "relationships"]),
    optional: Object.freeze(["prompt"]),
    fieldSemantics: Object.freeze({ entities: "Objetos conceituais do domínio, não tabelas de implementação.", fromCardinality: "Participação possível de instâncias de from para uma instância de to.", toCardinality: "Participação possível de instâncias de to para uma instância de from.", identifying: "true quando a existência/identidade da entidade dependente participa da relação." }),
    visualGrammar: Object.freeze(["Caixa = entidade.", "Linha = relacionamento.", "círculo = opcionalidade.", "barra = um.", "pé-de-galinha = muitos.", "linha contínua = identificador; tracejada = não identificador."]),
    rules: Object.freeze(["Use nomes de domínio no singular.", "Declare cardinalidade nas duas extremidades.", "Não declare coordenadas, símbolos, cores ou rotas.", "Use database_schema depois da transformação para o modelo relacional."]),
    example: Object.freeze({
      prompt: "Observe como matrícula resolve a relação muitos-para-muitos entre estudante e turma e conserva o resultado acadêmico.",
      entities: [
        { id: "student", name: "Estudante", attributes: [{ id: "student_id", name: "id_estudante", type: "UUID", key: "primary", optional: false }, { id: "name", name: "nome", type: "texto", key: "none", optional: false }] },
        { id: "class", name: "Turma", attributes: [{ id: "class_id", name: "id_turma", type: "UUID", key: "primary", optional: false }, { id: "term", name: "período", type: "texto", key: "none", optional: false }] },
        { id: "enrollment", name: "Matrícula", attributes: [{ id: "student_fk", name: "id_estudante", type: "UUID", key: "primary-foreign", optional: false }, { id: "class_fk", name: "id_turma", type: "UUID", key: "primary-foreign", optional: false }, { id: "grade", name: "nota_final", type: "decimal", key: "none", optional: true }] }
      ],
      relationships: [
        { id: "student_enrollment", from: "student", to: "enrollment", label: "realiza", fromCardinality: "one", toCardinality: "zero_or_many", identifying: true },
        { id: "class_enrollment", from: "class", to: "enrollment", label: "recebe", fromCardinality: "one", toCardinality: "zero_or_many", identifying: true }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["entities", "relationships"], properties: {
    prompt: { type: "string" },
    entities: { type: "array", minItems: 2, maxItems: 14, items: { type: "object", additionalProperties: false, required: ["id", "name", "attributes"], properties: { id: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, attributes: { type: "array", minItems: 1, maxItems: 18, items: { type: "object", additionalProperties: false, required: ["id", "name", "type", "key", "optional"], properties: { id: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, type: { type: "string", minLength: 1 }, key: { type: "string", enum: ["none", "primary", "foreign", "primary-foreign"] }, optional: { type: "boolean" } } } } } } },
    relationships: { type: "array", minItems: 1, maxItems: 28, items: { type: "object", additionalProperties: false, required: ["id", "from", "to", "label", "fromCardinality", "toCardinality", "identifying"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, fromCardinality: { type: "string", enum: CARDINALITIES }, toCardinality: { type: "string", enum: CARDINALITIES }, identifying: { type: "boolean" } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), entities: (data?.entities || []).map((entity) => ({ id: text(entity?.id), name: text(entity?.name), attributes: (entity?.attributes || []).map((attribute) => ({ id: text(attribute?.id), name: text(attribute?.name), type: text(attribute?.type), key: text(attribute?.key) || "none", optional: attribute?.optional === true })) })), relationships: (data?.relationships || []).map((relationship) => ({ id: text(relationship?.id), from: text(relationship?.from), to: text(relationship?.to), label: text(relationship?.label), fromCardinality: text(relationship?.fromCardinality), toCardinality: text(relationship?.toCardinality), identifying: relationship?.identifying === true })) };
  },
  validate(data) {
    const ids = new Set(data.entities.map(({ id }) => id));
    const errors = [];
    if (ids.size !== data.entities.length) errors.push("Entidades precisam de ids únicos.");
    if (new Set(data.relationships.map(({ id }) => id)).size !== data.relationships.length) errors.push("Relacionamentos precisam de ids únicos.");
    if (data.relationships.some(({ from, to }) => !ids.has(from) || !ids.has(to))) errors.push("Relacionamento referencia entidade inexistente.");
    data.entities.forEach((entity) => { if (new Set(entity.attributes.map(({ id }) => id)).size !== entity.attributes.length) errors.push(`Atributos de ${entity.id} precisam de ids únicos.`); });
    return errors;
  },
  render(data) {
    const diagramLabels = labels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: erAccessibleText(data), caption: "Modelo conceitual · notação pé-de-galinha", labels: diagramLabels, model: { labels: systemDiagramModelLabels(diagramLabels) }, focusId: `system-node-${data.entities[0]?.id || ""}`, errorMessage: "Não foi possível diagramar o modelo entidade-relacionamento." });
    return `<div class="runtime-block package-entity-relationship">${data.prompt ? renderPackageProse(data.prompt) : ""}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText: erAccessibleText,
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.entities.flatMap((entity, entityIndex) => [{ path: `entities[${entityIndex}].name`, label: `Editar entidade ${entityIndex + 1}` }, ...entity.attributes.flatMap((_, attributeIndex) => [{ path: `entities[${entityIndex}].attributes[${attributeIndex}].name`, label: `Editar atributo ${entityIndex + 1}.${attributeIndex + 1}` }, { path: `entities[${entityIndex}].attributes[${attributeIndex}].type`, label: `Editar tipo ${entityIndex + 1}.${attributeIndex + 1}` }])]), ...data.relationships.map((_, index) => ({ path: `relationships[${index}].label`, label: `Editar relacionamento ${index + 1}` }))];
  },
  practiceTargets(data) {
    return [...data.entities.flatMap((entity, entityIndex) => [{ path: `entities[${entityIndex}].name`, label: `Lacuna na entidade ${entityIndex + 1}`, modes: ["gap", "typing"] }, ...entity.attributes.map((_, attributeIndex) => ({ path: `entities[${entityIndex}].attributes[${attributeIndex}].name`, label: `Lacuna no atributo ${entityIndex + 1}.${attributeIndex + 1}`, modes: ["gap", "typing"] }))]), ...data.relationships.map((_, index) => ({ path: `relationships[${index}].label`, label: `Lacuna no relacionamento ${index + 1}`, modes: ["gap", "typing"] }))];
  }
});
