import { generateMicrosequenceCards } from "./generateMicrosequenceCards.js";

export async function addPracticeToMicrosequence(options = {}) {
  const result = await generateMicrosequenceCards({
    ...options,
    density: "deep"
  });
  return {
    ...result,
    project: result.project
  };
}
