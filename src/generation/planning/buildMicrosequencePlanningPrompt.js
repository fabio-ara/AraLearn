export function buildMicrosequencePlanningPrompt(contract) {
  return [
    "Você receberá um contrato JSON. Devolva somente JSON válido no formato pedido.",
    JSON.stringify(contract)
  ].join("\n");
}
