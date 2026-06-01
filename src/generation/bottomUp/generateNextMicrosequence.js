import { findSelection } from "./_shared.js";
import { generateMicrosequenceCards } from "./generateMicrosequenceCards.js";

export async function generateNextMicrosequence({
  project,
  selection,
  ...options
} = {}) {
  const info = findSelection(project, selection);
  if (!info) {
    throw new Error("Microssequência não encontrada.");
  }

  const nextMain = (info.lesson.microsequences || [])
    .slice(info.microsequenceIndex + 1)
    .find((item) => !item.branchOf);

  if (!nextMain) {
    throw new Error("Não existe próxima microssequência planejada.");
  }

  const blockedBy = (nextMain.dependsOn || []).find((dependencyId) => {
    const dependency = (info.lesson.microsequences || []).find((item) => item.id === dependencyId);
    return !dependency || dependency.status === "planned";
  });
  if (blockedBy) {
    const blockedDependency = (info.lesson.microsequences || []).find((item) => item.id === blockedBy) || null;
    return {
      blockedBy,
      blockedByTitle: blockedDependency?.title || blockedBy
    };
  }

  return generateMicrosequenceCards({
    ...options,
    project,
    selection: {
      ...selection,
      microsequenceKey: nextMain.id
    }
  });
}
