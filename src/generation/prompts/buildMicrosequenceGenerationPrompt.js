import { buildMicrosequenceGenerationPromptLines } from "../didactics/microsequenceGenerationPromptPolicy.js";

export function buildMicrosequenceGenerationPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities?.preferShortSchemas !== false;
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);

  return [
    ...buildMicrosequenceGenerationPromptLines(contract),
    "Contrato:",
    body
  ].join("\n");
}
