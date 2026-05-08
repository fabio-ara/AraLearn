export function buildMicrosequenceEditPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const body = modelCapabilities.profile === "compact-json" ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    "Aplique a edição planejada à microssequência do AraLearn.",
    "Responda somente JSON válido no formato: {\"cards\":[...]}",
    "Preserve cards não afetados quando editScope for selected_cards.",
    "Use apenas recursos permitidos em resources.allowedResourceTypes.",
    "Mantenha target e versionId.",
    "Contrato:",
    body
  ].join("\n");
}
