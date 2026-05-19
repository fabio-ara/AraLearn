import { buildMicrosequenceEditPlanningPromptLines } from "../didactics/microsequenceEditPolicy.js";

export function buildMicrosequenceEditPlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const body = modelCapabilities?.preferShortSchemas === true ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    ...buildMicrosequenceEditPlanningPromptLines(contract),
    "Contrato:",
    body
  ].join("\n");
}
