export const MICROSEQUENCE_STATUS_DRAFT = "draft";
export const MICROSEQUENCE_STATUS_READY = "ready";

export function resolveMicrosequenceStatus(microsequence) {
  if (microsequence?.status === MICROSEQUENCE_STATUS_DRAFT) {
    return MICROSEQUENCE_STATUS_DRAFT;
  }
  if (microsequence?.status === MICROSEQUENCE_STATUS_READY) {
    return MICROSEQUENCE_STATUS_READY;
  }
  return Array.isArray(microsequence?.cards) && microsequence.cards.length
    ? MICROSEQUENCE_STATUS_READY
    : MICROSEQUENCE_STATUS_DRAFT;
}

export function isDraftMicrosequence(microsequence) {
  return resolveMicrosequenceStatus(microsequence) === MICROSEQUENCE_STATUS_DRAFT;
}

export function isReadyMicrosequence(microsequence) {
  return resolveMicrosequenceStatus(microsequence) === MICROSEQUENCE_STATUS_READY;
}

export function normalizeMicrosequenceStatus(value, microsequence) {
  if (value === MICROSEQUENCE_STATUS_DRAFT || value === MICROSEQUENCE_STATUS_READY) {
    return value;
  }
  return resolveMicrosequenceStatus(microsequence);
}

export function resolveMicrosequenceRuntimeIncluded(microsequence) {
  if (typeof microsequence?.included === "boolean") {
    return microsequence.included;
  }
  return Array.isArray(microsequence?.cards) && microsequence.cards.length > 0;
}

export function isRunnableMicrosequence(microsequence) {
  return isReadyMicrosequence(microsequence) && resolveMicrosequenceRuntimeIncluded(microsequence);
}

export function normalizeMicrosequenceRuntimeIncluded(value, microsequence) {
  if (typeof value === "boolean") {
    return value;
  }
  return resolveMicrosequenceRuntimeIncluded(microsequence);
}
