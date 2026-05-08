import { getResourceSchemas } from "../resources/cardResourceDefinitions.js";

function compactJson(value, modelCapabilities = {}) {
  return modelCapabilities?.profile === "compact-json" ? JSON.stringify(value || {}) : JSON.stringify(value || {}, null, 2);
}

function pickAllowedResourceSchemas(generationContract = {}) {
  const allowed = generationContract?.resources?.allowedResourceTypes || [];
  const contractSchemas = generationContract?.resources?.resourceSchemas || {};
  const fallbackSchemas = getResourceSchemas(allowed);

  return Object.fromEntries(
    allowed.map((resourceType) => [resourceType, contractSchemas[resourceType] || fallbackSchemas[resourceType]]).filter(([, schema]) => schema)
  );
}

export function buildGeneratedCardsRepairPrompt({
  invalidResponse,
  validationErrors = [],
  generationContract,
  modelCapabilities = {}
}) {
  const expectedCardCount = generationContract?.output?.expectedCardCount || 0;
  const cardPlan = generationContract?.didacticPlan?.cardPlan || [];
  const allowedResourceTypes = generationContract?.resources?.allowedResourceTypes || [];
  const resourceSchemas = pickAllowedResourceSchemas(generationContract);

  return [
    "Corrija apenas o JSON abaixo para obedecer ao contrato.",
    "Preserve o conteúdo pedagógico sempre que possível.",
    "Altere somente o necessário para satisfazer os campos obrigatórios, tipos permitidos, quantidade de cards e schemas dos recursos.",
    "Não regenere livremente a microssequência.",
    "Não altere o tipo didático nem o plano.",
    "Não adicione recursos fora do contrato.",
    "Remova campos inesperados e corrija nomes de campos incorretos.",
    "",
    "Critérios obrigatórios:",
    `- devolva exatamente ${expectedCardCount} cards;`,
    "- cada card deve manter position coerente com cardPlan;",
    "- resourceType deve estar em allowedResourceTypes;",
    "- block_gap_fill deve usar segments[].kind/value ou kind/blankId/acceptedBlockIds, blocks[].blockId/label e feedbackAfter;",
    "- multiple_choice deve ter correctOptionId apontando para options[].optionId;",
    "- tree deve ter nodes com id único, label curto e parentId existente quando informado;",
    "- responda somente JSON válido no formato {\"cards\":[...]}.",
    "",
    "Erros de validação:",
    compactJson(validationErrors, modelCapabilities),
    "",
    "Resposta inválida original:",
    compactJson(invalidResponse, modelCapabilities),
    "",
    "Target da microssequência:",
    compactJson(generationContract?.target || {}, modelCapabilities),
    "",
    "expectedCardCount:",
    String(expectedCardCount),
    "",
    "cardPlan validado:",
    compactJson(cardPlan, modelCapabilities),
    "",
    "allowedResourceTypes:",
    compactJson(allowedResourceTypes, modelCapabilities),
    "",
    "resourceSchemas permitidos:",
    compactJson(resourceSchemas, modelCapabilities),
    "",
    "Formato esperado:",
    "{\"cards\":[{\"position\":1,\"resourceType\":\"paragraph\",\"title\":\"\",\"text\":\"\"}]}"
  ].join("\n");
}
