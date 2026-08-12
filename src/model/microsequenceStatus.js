function cards(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

export function resolveMicrosequenceRuntimeIncluded(microsequence) {
  return cards(microsequence).length > 0;
}

export function isRunnableMicrosequence(microsequence) {
  return resolveMicrosequenceRuntimeIncluded(microsequence);
}

export function normalizeMicrosequenceRuntimeIncluded(value, microsequence) {
  return typeof value === "boolean" ? value : resolveMicrosequenceRuntimeIncluded(microsequence);
}
