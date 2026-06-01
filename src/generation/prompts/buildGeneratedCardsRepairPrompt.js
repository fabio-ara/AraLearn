export function buildGeneratedCardsRepairPrompt({
  invalidResponse,
  validationErrors = [],
  generationContract
}) {
  return [
    "Você receberá um contrato JSON e uma resposta inválida. Devolva somente JSON válido no formato pedido.",
    JSON.stringify({
      task: "repair_cards",
      contract: generationContract,
      errors: validationErrors,
      invalidResponse
    })
  ].join("\n");
}
