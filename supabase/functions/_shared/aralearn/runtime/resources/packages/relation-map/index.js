import {
  escapePackageAttribute,
  renderPackageInline,
  renderPackageProse
} from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

function text(value) {
  return String(value ?? "").trim();
}

function normalizeSet(raw, fallbackLabel) {
  return {
    label: text(raw?.label) || fallbackLabel,
    items: (raw?.items || []).map((item) => ({ id: text(item?.id), label: text(item?.label) }))
  };
}

function relationMapAccessibleText(data) {
  const left = new Map(data.leftSet.items.map(({ id, label }) => [id, label]));
  const right = new Map(data.rightSet.items.map(({ id, label }) => [id, label]));
  return `${data.prompt} Conjunto ${data.leftSet.label}: ${data.leftSet.items.map(({ label }) => label).join(", ")}. Conjunto ${data.rightSet.label}: ${data.rightSet.items.map(({ label }) => label).join(", ")}. Relações: ${data.relations.map((relation) => `${left.get(relation.from)} ${relation.label || "corresponde a"} ${right.get(relation.to)}`).join("; ")}.`;
}

export const relationMapPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.relation_map",
    version: "1.0.0",
    label: "Mapa de relações",
    purpose: "Relacionar elementos de dois conjuntos preservando rótulos completos e correspondências legíveis.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["map-correspondence", "compare-roles", "classify-pair", "inspect-cardinality"]),
    academic: academicProfile({ domains: ["teoria dos conjuntos", "lógica", "álgebra linear", "bancos de dados"], knowledgeObjects: ["relação binária", "domínio", "contradomínio", "par ordenado"], conventions: ["dois conjuntos distintos", "cada elemento aparece uma única vez", "correspondências ligam elementos sem atravessar rótulos"], appropriateWhen: ["a relação entre elementos de dois conjuntos é o objeto estudado"], avoidWhen: ["a tarefa é comparar pares independentes", "há interseção de conjuntos"], technologies: ["HTML semântico", "SVG responsivo derivado"], practiceModes: ["exposition", "gap", "typing", "selection", "matching"] }),
    responseCompatibility: Object.freeze(["aralearn.response.choice", "aralearn.response.gap"]),
    limitations: Object.freeze(["Não representa interseção de conjuntos; para isso deve existir package específico.", "Muitas correspondências devem ser divididas em microssequências menores."]),
    accessibility: "Cada conjunto lista seus elementos uma única vez e toda correspondência também aparece como par ordenado textual."
  }),
  authoringContract: Object.freeze({
    intent: "Declare domínio, contradomínio e pares da relação sem coordenadas ou pontos de ancoragem.",
    required: Object.freeze(["prompt", "leftSet", "rightSet", "relations"]),
    optional: Object.freeze(["highlight"]),
    rules: Object.freeze(["from pertence ao conjunto esquerdo e to ao direito.", "Use um rótulo verbal quando a direção não for autoexplicativa.", "Prefira labels curtos, mas nunca os abrevie a ponto de perder sentido."]),
    example: Object.freeze({
      prompt: "Relacione cada componente à responsabilidade que ele exerce.",
      leftSet: { label: "Componente", items: [{ id: "manager", label: "Gerente" }, { id: "agent", label: "Agente" }] },
      rightSet: { label: "Responsabilidade", items: [{ id: "request", label: "Envia a solicitação" }, { id: "local", label: "Acessa o dado local" }] },
      relations: [{ id: "r1", from: "manager", to: "request", label: "executa" }, { id: "r2", from: "agent", to: "local", label: "executa" }]
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["prompt", "leftSet", "rightSet", "relations"],
    properties: {
      prompt: { type: "string", minLength: 1 },
      leftSet: { type: "object", additionalProperties: false, required: ["label", "items"], properties: { label: { type: "string", minLength: 1 }, items: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } } } },
      rightSet: { type: "object", additionalProperties: false, required: ["label", "items"], properties: { label: { type: "string", minLength: 1 }, items: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } } } },
      relations: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "from", "to"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, label: { type: "string" } } } },
      highlight: { type: "object", additionalProperties: false, properties: { relations: { type: "array", uniqueItems: true, items: { type: "string" } }, leftItems: { type: "array", uniqueItems: true, items: { type: "string" } }, rightItems: { type: "array", uniqueItems: true, items: { type: "string" } } } }
    }
  }),
  normalize(data) {
    return {
      prompt: text(data?.prompt),
      leftSet: normalizeSet(data?.leftSet, "Conjunto A"),
      rightSet: normalizeSet(data?.rightSet, "Conjunto B"),
      relations: (data?.relations || []).map((relation, index) => ({ id: text(relation?.id) || `relation-${index + 1}`, from: text(relation?.from), to: text(relation?.to), ...(text(relation?.label) ? { label: text(relation.label) } : {}) })),
      ...((data?.highlight?.relations?.length || data?.highlight?.leftItems?.length || data?.highlight?.rightItems?.length) ? { highlight: { relations: (data.highlight.relations || []).map(text), leftItems: (data.highlight.leftItems || []).map(text), rightItems: (data.highlight.rightItems || []).map(text) } } : {})
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
    if ((data.highlight?.leftItems || []).some((id) => !left.has(id))) errors.push("Destaque referencia item esquerdo inexistente.");
    if ((data.highlight?.rightItems || []).some((id) => !right.has(id))) errors.push("Destaque referencia item direito inexistente.");
    if ((data.highlight?.relations || []).some((id) => !relationIds.includes(id))) errors.push("Destaque referencia relação inexistente.");
    return errors;
  },
  render(data) {
    const left = new Map(data.leftSet.items.map(({ id, label }) => [id, label]));
    const right = new Map(data.rightSet.items.map(({ id, label }) => [id, label]));
    const highlighted = new Set(data.highlight?.relations || []);
    const highlightedLeft = new Set(data.highlight?.leftItems || []);
    const highlightedRight = new Set(data.highlight?.rightItems || []);
    const setPanel = (set, side, selected) => `<section class="package-relation-set is-${side}"><h4>${renderPackageInline(set.label)}</h4><ul>${set.items.map((item) => `<li class="${selected.has(item.id) ? "is-highlighted" : ""}" data-set-item-id="${escapePackageAttribute(item.id)}">${renderPackageInline(item.label)}</li>`).join("")}</ul></section>`;
    return `<div class="runtime-block runtime-relation-map-block package-relation-map" data-density="${data.relations.length > 8 ? "high" : "normal"}">${renderPackageProse(data.prompt)}<div class="package-relation-sets" aria-label="Conjuntos da relação">${setPanel(data.leftSet, "left", highlightedLeft)}<span class="package-relation-symbol" aria-hidden="true">R ⊆ A × B</span>${setPanel(data.rightSet, "right", highlightedRight)}</div><ol class="package-relation-pairs" aria-label="Pares da relação entre ${escapePackageAttribute(data.leftSet.label)} e ${escapePackageAttribute(data.rightSet.label)}">${data.relations.map((relation) => `<li class="${highlighted.has(relation.id) ? "is-highlighted" : ""}" data-relation-id="${escapePackageAttribute(relation.id)}"><span aria-hidden="true">(</span><strong>${renderPackageInline(left.get(relation.from))}</strong><span aria-hidden="true">,</span><strong>${renderPackageInline(right.get(relation.to))}</strong><span aria-hidden="true">)</span>${relation.label ? `<small>${renderPackageInline(relation.label)}</small>` : ""}</li>`).join("")}</ol></div>`;
  },
  accessibleText(data) { return relationMapAccessibleText(data); },
  editableTargets(data) { return [{ path: "prompt", label: "Editar orientação" }, { path: "leftSet.label", label: "Editar domínio" }, { path: "rightSet.label", label: "Editar contradomínio" }, ...data.leftSet.items.map((_, index) => ({ path: `leftSet.items[${index}].label`, label: `Editar elemento do domínio ${index + 1}` })), ...data.rightSet.items.map((_, index) => ({ path: `rightSet.items[${index}].label`, label: `Editar elemento do contradomínio ${index + 1}` })), ...data.relations.flatMap((relation, index) => relation.label ? [{ path: `relations[${index}].label`, label: `Editar relação ${index + 1}` }] : [])]; }
});
