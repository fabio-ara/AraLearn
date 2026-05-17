import { buildMicrosequenceEditPromptLines } from "../didactics/microsequenceEditPolicy.js";

export function buildMicrosequenceEditPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const body = modelCapabilities?.preferShortSchemas === true ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    ...buildMicrosequenceEditPromptLines(contract),
    "Contrato:",
    body
  ].join("\n");
}
