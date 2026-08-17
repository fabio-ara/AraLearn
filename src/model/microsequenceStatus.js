function studyUnits(microsequence) {
  return Array.isArray(microsequence?.studyUnits) ? microsequence.studyUnits : [];
}

export function resolveMicrosequenceRuntimeIncluded(microsequence) {
  return studyUnits(microsequence).length > 0;
}

export function isRunnableMicrosequence(microsequence) {
  return resolveMicrosequenceRuntimeIncluded(microsequence);
}

export function normalizeMicrosequenceRuntimeIncluded(value, microsequence) {
  return typeof value === "boolean" ? value : resolveMicrosequenceRuntimeIncluded(microsequence);
}
