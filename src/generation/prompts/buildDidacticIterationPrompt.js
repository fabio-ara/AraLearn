function compactJson(value, multiline = true) {
  return multiline ? JSON.stringify(value || {}, null, 2) : JSON.stringify(value || {});
}

function pickAllowedResourceSchemas(generationContract = {}, iterationPlan = {}) {
  const allowed = new Set([
    ...(generationContract?.resources?.allowedResourceTypes || []),
    ...((iterationPlan?.cardPlan || []).map((item) => item.resourceType).filter(Boolean))
  ]);
  const schemas = generationContract?.resources?.effectiveResourceSchemas || generationContract?.resources?.resourceSchemas || {};
  return Object.fromEntries([...allowed].map((resourceType) => [resourceType, schemas[resourceType]]).filter(([, schema]) => schema));
}

export function buildDidacticIterationPrompt({
  cardsResponse,
  validationResult,
  generationContract,
  iterationPlan,
  modelCapabilities = {}
}) {
  const pretty = modelCapabilities?.preferShortSchemas !== true;
  return [
    "Revise a microssequência para corrigir a falha didática detectada pelo AraLearn.",
    "Não faça resumo genérico.",
    "Não explique a auditoria.",
    "Não concorra com o pedido do usuário.",
    "Preserve os cards já úteis sempre que possível e altere apenas o necessário.",
    "Se o plano iterado pedir mais cards, use os novos cards apenas para fechar a lacuna didática detectada.",
    "Cada card deve manter uma função principal clara.",
    "Se houver reescrita, foque só nos cards-alvo.",
    "Se houver expansão, acrescente exemplo, preparação ou prática apenas onde o plano mandar.",
    "Não mude a intenção do pedido original.",
    "Responda somente JSON válido no formato {\"cards\":[...]}.",
    "",
    `Outcome da continuação: ${iterationPlan?.outcome || "rewrite_cards"}`,
    "Ações determinadas pelo AraLearn:",
    ...(iterationPlan?.requestedActions || []).map((item) => `- ${item}`),
    "",
    "Motivos resumidos da checagem local:",
    ...(iterationPlan?.auditReasons || []).map((item) => `- ${item}`),
    "",
    `Cards esperados nesta iteração: ${iterationPlan?.expectedCardCount || 0}`,
    iterationPlan?.rewritePositions?.length ? `Reescrever posições: ${iterationPlan.rewritePositions.join(", ")}` : "Reescrever posições: nenhuma obrigatória",
    "",
    "Plano determinístico desta iteração:",
    compactJson(iterationPlan?.cardPlan || [], pretty),
    "",
    "Schemas permitidos:",
    compactJson(pickAllowedResourceSchemas(generationContract, iterationPlan), pretty),
    "",
    "Cards atuais a preservar ou revisar:",
    compactJson(cardsResponse, pretty),
    "",
    "Erros atuais:",
    compactJson(validationResult?.errors || [], pretty)
  ].join("\n");
}
