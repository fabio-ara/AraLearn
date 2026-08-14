import { normalizeCardEnvelope, validateCardEnvelope } from "../../resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../resources/packages/index.js";
import { normalizeJsonSchemaDocument } from "../providers/structuredOutput.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function contentPackages() {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" });
}

function responsePackages() {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "response" });
}

function compositionId(content, response) {
  const contentItems = Array.isArray(content) ? content : content ? [content] : [];
  const contentId = contentItems.length
    ? contentItems.map(({ id }) => id).join("+")
    : "sem-conteudo";
  return response ? `${contentId}+${response.id}` : `${contentId}+teoria`;
}

function crossInstanceOrderingCandidates(contents, responses) {
  const response = responses.find(({ id }) => id === "aralearn.response.ordering");
  if (!response) return [];
  const compatible = contents.filter(({ responseCompatibility }) => (
    responseCompatibility.includes(response.id)
  ));
  return compatible.flatMap((left) => compatible.map((right) => ({
      id: compositionId([left, right], response),
      role: "practice",
      content: [left, right].map(({ id: packageId, version }) => ({
        package: packageId,
        version
      })),
      response: { package: response.id, version: response.version },
      feedback: [{ package: "aralearn.resource.paragraph", version: "1.0.0" }]
    })));
}

export function listCardRepresentationCandidates() {
  const contents = contentPackages();
  const responses = responsePackages();
  const theory = contents.map((content) => ({
    id: compositionId(content, null),
    role: "theory",
    content: [{ package: content.id, version: content.version }],
    response: null,
    feedback: []
  }));
  const standalonePractice = responses
    .filter(({ id }) => id === "aralearn.response.choice")
    .map((response) => ({
      id: compositionId(null, response),
      role: "practice",
      content: [],
      response: { package: response.id, version: response.version },
      feedback: [{ package: "aralearn.resource.paragraph", version: "1.0.0" }]
    }));
  const contextualPractice = contents.flatMap((content) => responses
    .filter((response) => content.responseCompatibility.includes(response.id))
    .map((response) => ({
      id: compositionId(content, response),
      role: "practice",
      content: [{ package: content.id, version: content.version }],
      response: { package: response.id, version: response.version },
      feedback: [{ package: "aralearn.resource.paragraph", version: "1.0.0" }]
    })));
  return [
    ...theory,
    ...standalonePractice,
    ...contextualPractice,
    ...crossInstanceOrderingCandidates(contents, responses)
  ].map(clone);
}

export function parseCardRepresentation(value, candidates = listCardRepresentationCandidates()) {
  const selected = text(value?.representation);
  const candidate = candidates.find(({ id }) => id === selected);
  if (!candidate) throw new Error("O provider escolheu uma composição fora do catálogo de packages.");
  return clone(candidate);
}

export function buildCardRepresentationCatalog() {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog().map((manifest) => ({
    id: manifest.id,
    version: manifest.version,
    label: manifest.label,
    purpose: manifest.purpose,
    slots: manifest.slots,
    cognitiveOperations: manifest.cognitiveOperations,
    responseCompatibility: manifest.responseCompatibility,
    limitations: manifest.limitations,
    accessibility: manifest.accessibility,
    academic: manifest.academic
  }));
}

function plannedInstanceSchema(spec, id) {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(spec.package, spec.version);
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "package", "version", "data"],
    properties: {
      id: { const: id },
      package: { const: spec.package },
      version: { const: spec.version },
      data: contract.schema
    }
  };
}

function plannedListSchema(specs, cardId, slot) {
  const schemas = specs.map((spec, index) => plannedInstanceSchema(
    spec,
    `${cardId}-${slot}-${index + 1}`
  ));
  return {
    type: "array",
    minItems: schemas.length,
    maxItems: schemas.length,
    ...(schemas.length
      ? { prefixItems: schemas, items: false }
      : { items: false })
  };
}

export function buildCardAssistanceAuthoringCardSchema(plan = {}) {
  const id = text(plan.id);
  const content = Array.isArray(plan.content) ? plan.content : [];
  const feedback = Array.isArray(plan.feedback) ? plan.feedback : [];
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["id", "position", "title", "role", "content", "response", "feedback", "topics", "sources"],
    properties: {
      id: { const: id },
      position: { const: Number(plan.position) },
      title: { type: "string", minLength: 1, maxLength: 300 },
      role: { const: plan.role },
      content: plannedListSchema(content, id, "content"),
      response: plan.response
        ? plannedInstanceSchema(plan.response, `${id}-response-1`)
        : { type: "null" },
      feedback: plannedListSchema(feedback, id, "feedback"),
      topics: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
      sources: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } }
    }
  };
  return normalizeJsonSchemaDocument(schema);
}

export function compileAndValidateAuthoringCard(value, path = "$.card") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A resposta não contém um card estruturado.");
  }
  const validation = validateCardEnvelope(value, RESOURCE_PACKAGE_REGISTRY, path);
  if (!validation.valid) throw new Error(validation.errors[0]);
  return normalizeCardEnvelope(value, RESOURCE_PACKAGE_REGISTRY);
}
