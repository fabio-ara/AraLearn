import { findSelection } from "./_shared.js";
import { generateMicrosequenceCards } from "./generateMicrosequenceCards.js";

export async function generateNextMicrosequence({
  project,
  selection,
  provider,
  modelId,
  density = "standard",
  providerOptions = {},
  source = "llm"
} = {}) {
  const info = findSelection(project, selection);
  if (!info) {
    throw new Error("Microssequência não encontrada.");
  }
  const microsequences = info.lesson.microsequences || [];
  const nextMain = microsequences.slice(info.microsequenceIndex + 1).find((item) => item.type === "main");
  if (!nextMain) {
    throw new Error("Não existe próxima microssequência principal planejada.");
  }
  const missingDependency = (nextMain.dependsOn || []).find((dependencyKey) => {
    const dependency = microsequences.find((item) => item.key === dependencyKey);
    return !dependency || (dependency.status !== "generated" && dependency.status !== "ready" && dependency.status !== "needs_review");
  });
  if (missingDependency) {
    return {
      blockedBy: missingDependency
    };
  }
  return generateMicrosequenceCards({
    project,
    selection: {
      ...selection,
      microsequenceKey: nextMain.key
    },
    provider,
    modelId,
    density,
    providerOptions,
    source
  });
}
