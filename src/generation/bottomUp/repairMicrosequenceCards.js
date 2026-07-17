import { generateMicrosequenceCards } from "./generateMicrosequenceCards.js";

export async function repairMicrosequenceCards({ reason, ...options } = {}) {
  if (!reason) {
    throw new Error("Informe o motivo da melhoria.");
  }

  return generateMicrosequenceCards({
    ...options,
    userRequest: reason,
    density: "standard",
    generationAction: "repair"
  });
}
