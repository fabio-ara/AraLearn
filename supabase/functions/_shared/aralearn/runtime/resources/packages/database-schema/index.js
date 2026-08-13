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

function keyLabel(key) {
  if (key === "primary") return "PK";
  if (key === "foreign") return "FK";
  if (key === "primary-foreign") return "PK, FK";
  return "";
}

function attributeLine(attribute) {
  const key = keyLabel(attribute.key);
  return `${key ? `[${key}] ` : ""}${attribute.name} : ${attribute.type}${attribute.nullable ? " [NULL]" : " [NOT NULL]"}`;
}

function relationPlainLabel(relation) {
  return [wrapGraphvizLabel(relation.name, 28), ...relation.attributes.map(attributeLine)].join("\n");
}

function relationTemplate(relation) {
  return `<span class="package-relational-table"><strong>${renderPackageInline(relation.name)}</strong><span>${relation.attributes.map((attribute) => `<small><b>${renderPackageInline(keyLabel(attribute.key))}</b><code>${renderPackageInline(attribute.name)}</code><i>${renderPackageInline(attribute.type)}</i>${attribute.nullable ? "<em>NULL</em>" : ""}</small>`).join("")}</span></span>`;
}

function referenceLabel(reference) {
  return reference.cardinality === "one-to-one" ? "1 : 1" : "N : 1";
}

function accessibleText(data) {
  const relations = new Map(data.relations.map((relation) => [relation.id, relation]));
  return [
    data.prompt,
    ...data.relations.map((relation) => `Relação ${relation.name}: ${relation.attributes.map(attributeLine).join(", ")}.`),
    ...data.references.map((reference) => {
      const from = relations.get(reference.fromRelation);
      const to = relations.get(reference.toRelation);
      return `${from?.name}.${reference.fromAttribute} referencia ${to?.name}.${reference.toAttribute}; cardinalidade ${reference.cardinality}.`;
    })
  ].filter(Boolean).join(" ");
}

function graphvizSource(data) {
  return [
    "digraph RelationalSchema {",
    `  graph ${dotAttributes({ bgcolor: "transparent", pad: "0.2", margin: "0", overlap: "false", splines: "polyline", outputorder: "edgesfirst", rankdir: "LR", nodesep: "0.5", ranksep: "0.9" })};`,
    "  node [fontname=\"Arial\", fontsize=\"15\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", shape=\"box\", style=\"rounded\", margin=\"0.16,0.12\"];",
    "  edge [fontname=\"Arial\", fontsize=\"13\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", arrowsize=\"0.7\"];",
    ...data.relations.map((relation) => `  ${dotQuote(relation.id)} ${dotAttributes({ id: `system-node-${relation.id}`, class: "package-relational-relation", label: relationPlainLabel(relation) })};`),
    ...data.references.map((reference) => `  ${dotQuote(reference.fromRelation)} -> ${dotQuote(reference.toRelation)} ${dotAttributes({ id: `system-edge-${reference.id}`, class: "package-relational-reference", label: referenceLabel(reference), arrowhead: "normal", arrowtail: reference.cardinality === "one-to-one" ? "tee" : "crow", dir: "both" })};`),
    "}"
  ].join("\n");
}

function diagramLabels(data) {
  return [
    ...data.relations.map((relation) => ({ kind: "node", id: relation.id, plain: relationPlainLabel(relation), html: relationTemplate(relation) })),
    ...data.references.map((reference) => ({ kind: "edge", id: reference.id, plain: referenceLabel(reference), html: `<span>${renderPackageInline(referenceLabel(reference))}</span>` }))
  ];
}

export const databaseSchemaPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.database_schema",
    version: "1.0.0",
    label: "Esquema relacional",
    purpose: "Representar relações, atributos, chaves e dependências referenciais no modelo lógico relacional.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["identify-key", "trace-foreign-key", "normalize-schema", "inspect-cardinality"]),
    academic: academicProfile({
      domains: ["bancos de dados", "modelagem lógica de dados"],
      knowledgeObjects: ["relação", "atributo", "chave primária", "chave estrangeira", "integridade referencial"],
      conventions: ["relações como esquemas nomeados", "PK e FK junto dos atributos", "tipo e nulabilidade explícitos", "referência orientada da FK para a chave-alvo"],
      appropriateWhen: ["estrutura lógica relacional, normalização ou integridade referencial são parte da tarefa"],
      avoidWhen: ["é necessário representar instâncias de dados", "a tarefa exige o modelo conceitual ER"],
      technologies: ["notação de esquema relacional", "Graphviz", "Viz.js WebAssembly", "SVG", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection", "matching", "classification"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.matching"]),
    limitations: Object.freeze(["Não confunde esquema com linhas de dados.", "Esquemas densos devem ser recortados pela dependência em estudo."]),
    accessibility: "Cada relação lista atributos, chaves, tipos e nulabilidade; cada referência é repetida em texto."
  }),
  authoringContract: Object.freeze({
    intent: "Declare o modelo relacional em alto nível; o renderer calcula posições e rotas e materializa relações, PK, FK e referências.",
    required: Object.freeze(["relations", "references"]),
    optional: Object.freeze(["prompt"]),
    fieldSemantics: Object.freeze({ relations: "Relações do modelo lógico, não entidades conceituais nem dados de exemplo.", references: "Cada referência parte do atributo FK e termina na chave candidata ou primária referenciada.", nullable: "Declara se o atributo aceita NULL; não significa participação conceitual." }),
    visualGrammar: Object.freeze(["Caixa = esquema de relação.", "Linha interna = atributo.", "PK/FK = papel da chave.", "Seta = dependência referencial da relação dependente para a referenciada."]),
    rules: Object.freeze(["Toda relação tem chave primária.", "Toda FK visualizada possui uma referência válida.", "Use entity_relationship para o modelo conceitual.", "Não declare coordenadas, tamanhos, formas ou rotas."]),
    example: Object.freeze({
      prompt: "Observe como o item do pedido preserva a chave composta e referencia pedido e produto sem redundância desnecessária.",
      relations: [
        { id: "customer", name: "CLIENTE", attributes: [{ id: "customer_id", name: "id_cliente", type: "uuid", key: "primary", nullable: false }, { id: "customer_name", name: "nome", type: "text", key: "none", nullable: false }] },
        { id: "order", name: "PEDIDO", attributes: [{ id: "order_id", name: "id_pedido", type: "uuid", key: "primary", nullable: false }, { id: "customer_fk", name: "id_cliente", type: "uuid", key: "foreign", nullable: false }, { id: "placed_at", name: "realizado_em", type: "timestamp", key: "none", nullable: false }] },
        { id: "product", name: "PRODUTO", attributes: [{ id: "product_id", name: "id_produto", type: "uuid", key: "primary", nullable: false }, { id: "description", name: "descricao", type: "text", key: "none", nullable: false }, { id: "price", name: "preco_atual", type: "decimal", key: "none", nullable: false }] },
        { id: "order_item", name: "ITEM_PEDIDO", attributes: [{ id: "order_fk", name: "id_pedido", type: "uuid", key: "primary-foreign", nullable: false }, { id: "product_fk", name: "id_produto", type: "uuid", key: "primary-foreign", nullable: false }, { id: "quantity", name: "quantidade", type: "integer", key: "none", nullable: false }, { id: "sale_price", name: "preco_venda", type: "decimal", key: "none", nullable: false }] }
      ],
      references: [
        { id: "order_customer", fromRelation: "order", fromAttribute: "customer_fk", toRelation: "customer", toAttribute: "customer_id", cardinality: "many-to-one" },
        { id: "item_order", fromRelation: "order_item", fromAttribute: "order_fk", toRelation: "order", toAttribute: "order_id", cardinality: "many-to-one" },
        { id: "item_product", fromRelation: "order_item", fromAttribute: "product_fk", toRelation: "product", toAttribute: "product_id", cardinality: "many-to-one" }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["relations", "references"], properties: {
    prompt: { type: "string" },
    relations: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "name", "attributes"], properties: { id: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, attributes: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "name", "type", "key", "nullable"], properties: { id: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, type: { type: "string", minLength: 1 }, key: { type: "string", enum: ["none", "primary", "foreign", "primary-foreign"] }, nullable: { type: "boolean" } } } } } } },
    references: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, required: ["id", "fromRelation", "fromAttribute", "toRelation", "toAttribute", "cardinality"], properties: { id: { type: "string", minLength: 1 }, fromRelation: { type: "string", minLength: 1 }, fromAttribute: { type: "string", minLength: 1 }, toRelation: { type: "string", minLength: 1 }, toAttribute: { type: "string", minLength: 1 }, cardinality: { type: "string", enum: ["one-to-one", "one-to-many", "many-to-one", "many-to-many"] } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), relations: (data?.relations || []).map((relation) => ({ id: text(relation?.id), name: text(relation?.name), attributes: (relation?.attributes || []).map((attribute) => ({ id: text(attribute?.id), name: text(attribute?.name), type: text(attribute?.type), key: text(attribute?.key) || "none", nullable: attribute?.nullable === true })) })), references: (data?.references || []).map((reference) => ({ id: text(reference?.id), fromRelation: text(reference?.fromRelation), fromAttribute: text(reference?.fromAttribute), toRelation: text(reference?.toRelation), toAttribute: text(reference?.toAttribute), cardinality: text(reference?.cardinality) })) };
  },
  validate(data) {
    const relations = new Map(data.relations.map((relation) => [relation.id, relation]));
    const errors = [];
    if (relations.size !== data.relations.length) errors.push("Relações precisam de ids únicos.");
    data.relations.forEach((relation) => {
      if (!relation.attributes.some(({ key }) => ["primary", "primary-foreign"].includes(key))) errors.push(`Relação ${relation.id} não declara chave primária.`);
      if (new Set(relation.attributes.map(({ id }) => id)).size !== relation.attributes.length) errors.push(`Atributos de ${relation.id} precisam de ids únicos.`);
    });
    data.references.forEach((reference) => {
      const from = relations.get(reference.fromRelation);
      const to = relations.get(reference.toRelation);
      const fromAttribute = from?.attributes.find(({ id }) => id === reference.fromAttribute);
      const toAttribute = to?.attributes.find(({ id }) => id === reference.toAttribute);
      if (!fromAttribute || !toAttribute) errors.push(`Referência ${reference.id} aponta para atributo inexistente.`);
      if (fromAttribute && !["foreign", "primary-foreign"].includes(fromAttribute.key)) errors.push(`Referência ${reference.id} não parte de uma FK.`);
      if (toAttribute && !["primary", "primary-foreign"].includes(toAttribute.key)) errors.push(`Referência ${reference.id} não termina em chave referenciável.`);
    });
    return errors;
  },
  render(data) {
    const labels = diagramLabels(data);
    const figure = renderSystemDiagramFigure({ source: graphvizSource(data), engine: "dot", accessibleText: accessibleText(data), caption: "Modelo lógico relacional · dependências de chave estrangeira", labels, model: { labels: systemDiagramModelLabels(labels) }, focusId: `system-node-${data.relations[0]?.id || ""}`, errorMessage: "Não foi possível diagramar o esquema relacional." });
    return `<div class="runtime-block package-database-schema">${data.prompt ? renderPackageProse(data.prompt) : ""}${figure}</div>`;
  },
  hydrate: hydrateSystemDiagrams,
  accessibleText,
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.relations.flatMap((relation, relationIndex) => [{ path: `relations[${relationIndex}].name`, label: `Editar relação ${relationIndex + 1}` }, ...relation.attributes.flatMap((_, attributeIndex) => [{ path: `relations[${relationIndex}].attributes[${attributeIndex}].name`, label: `Editar atributo ${relationIndex + 1}.${attributeIndex + 1}` }, { path: `relations[${relationIndex}].attributes[${attributeIndex}].type`, label: `Editar tipo ${relationIndex + 1}.${attributeIndex + 1}` }])])];
  },
  practiceTargets(data) {
    return data.relations.flatMap((relation, relationIndex) => [{ path: `relations[${relationIndex}].name`, label: `Lacuna na relação ${relationIndex + 1}`, modes: ["gap", "typing"] }, ...relation.attributes.flatMap((_, attributeIndex) => [{ path: `relations[${relationIndex}].attributes[${attributeIndex}].name`, label: `Lacuna no atributo ${relationIndex + 1}.${attributeIndex + 1}`, modes: ["gap", "typing"] }, { path: `relations[${relationIndex}].attributes[${attributeIndex}].type`, label: `Lacuna no tipo ${relationIndex + 1}.${attributeIndex + 1}`, modes: ["gap", "typing"] }])]);
  }
});
