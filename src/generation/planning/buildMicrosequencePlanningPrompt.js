import { buildMicrosequencePlanningPolicyLines } from "../didactics/microsequencePlanningPromptPolicy.js";

export function buildMicrosequencePlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities?.preferShortSchemas !== false;
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);

  return [
    ...buildMicrosequencePlanningPolicyLines(contract),
    "Contrato:",
    body
  ].join("\n");
}
