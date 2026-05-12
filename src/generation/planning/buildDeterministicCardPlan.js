import { listGenerationResourceDefinitions } from "../resources/cardResourceDefinitions.js";
import { getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueKnown(items = [], knownIds = new Set()) {
  const seen = new Set();
  return (items || []).map(normalizeText).filter((item) => {
    if (!knownIds.has(item) || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function includesAny(value, terms = []) {
  const text = normalizeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return terms.some((term) => text.includes(term));
}

function pickResourceForRole(role, index, total, availableResources) {
  const has = (resourceType) => availableResources.includes(resourceType);

  if (includesAny(role, ["situar", "apresentar", "introduzir", "retomar", "preparacao", "ponto de partida", "ideia"])) {
    return has("paragraph") ? "paragraph" : availableResources[0] || "paragraph";
  }
  if (index === total - 1 && has("multiple_choice")) return "multiple_choice";
  if (includesAny(role, ["lacuna", "pratica", "aplicar", "recuperar"]) && has("block_gap_fill")) return "block_gap_fill";
  if (includesAny(role, ["comando", "codigo", "uso minimo", "parte importante"]) && has("code_editor")) return "code_editor";
  if (includesAny(role, ["compar", "criterio", "itens", "tabela"]) && has("table")) return "table";
  if (includesAny(role, ["fluxo", "condicao", "regra"]) && has("flowchart")) return "flowchart";
  if (includesAny(role, ["diretorio", "pasta", "arquivo", "estrutura"]) && has("tree")) return "tree";
  if (includesAny(role, ["vetor", "plano", "cartesiano"]) && has("plane")) return "plane";
  if (includesAny(role, ["matriz", "matrizes"]) && has("matrix")) return "matrix";

  return has("paragraph") ? "paragraph" : availableResources[0] || "paragraph";
}

export function buildDeterministicCardPlan({
  typeId,
  sizeId,
  selectedExtraResourceTypes = [],
  userSelectedExtraResourceTypes = [],
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const type = getMicrosequenceType(typeId) || getMicrosequenceType("simple");
  const size = getMicrosequenceSize(sizeId) || getMicrosequenceSize("short");
  const roles = type?.cardRolesBySize?.[size?.id] || type?.cardRolesBySize?.short || [];
  const baseResourceTypes = uniqueKnown(type?.baseResourceTypes || [], knownIds);
  const extras = uniqueKnown([...userSelectedExtraResourceTypes, ...selectedExtraResourceTypes], knownIds);
  const availableResources = uniqueKnown(["paragraph", ...baseResourceTypes, ...extras, "multiple_choice"], knownIds);

  return roles.slice(0, size.cardCount).map((role, index) => ({
    position: index + 1,
    role: normalizeText(role) || `card_${index + 1}`,
    resourceType: pickResourceForRole(role, index, roles.length, availableResources),
    sourceRefs: []
  }));
}
