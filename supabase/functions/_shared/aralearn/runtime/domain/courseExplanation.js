import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

const plain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const exact = (value, fields) => plain(value) && Object.keys(value).every((key) => fields.includes(key));

/** Shared authored content. It has neither a response nor learning/progress facts. */
export function normalizeMicrosequenceExplanation(value, registry = RESOURCE_PACKAGE_REGISTRY) {
  if (!exact(value, ["title", "content"]) || !text(value.title) || value.title.length > 300 || /\p{Cc}/u.test(value.title) ||
      !Array.isArray(value.content) || value.content.length === 0) {
    throw new TypeError("A Explicação exige título e conteúdo previamente produzido.");
  }
  const ids = new Set();
  const content = value.content.map((instance) => {
    if (!text(instance?.id) || ids.has(instance.id)) {
      throw new TypeError("Cada elemento da Explicação precisa de uma identidade própria.");
    }
    ids.add(instance.id);
    const result = registry.validateInstance(instance, "content");
    if (!result.valid) throw new TypeError(result.errors.join(" "));
    return registry.normalizeInstance(instance, "content");
  });
  return { title: value.title.trim(), content };
}

export function normalizeMicrosequenceExplanationPlan(value) {
  if (!exact(value, ["purpose", "prerequisites", "relations", "sourceIds"]) || !text(value.purpose)) {
    throw new TypeError("O planejamento da Explicação exige um propósito explícito.");
  }
  const result = { purpose: value.purpose.trim() };
  for (const field of ["prerequisites", "relations", "sourceIds"]) {
    if (!Array.isArray(value[field]) || value[field].some((entry) => !text(entry)) ||
        new Set(value[field].map((entry) => entry.trim())).size !== value[field].length) {
      throw new TypeError("Informe pressupostos, relações e fontes previstas em listas sem repetições.");
    }
    result[field] = value[field].map((entry) => entry.trim());
  }
  return result;
}
