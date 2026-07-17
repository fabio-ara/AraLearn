
export const MICROSEQUENCE_STATUS_DRAFT = "planned";
export const MICROSEQUENCE_STATUS_READY = "ready";

const VALID_STATUSES = new Set(["planned", "generated", "needs_review", "ready"]);

function activeCards(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

export function resolveMicrosequenceStatus(microsequence) {
  const status = typeof microsequence?.status === "string" ? microsequence.status.trim() : "";
  if (VALID_STATUSES.has(status)) {
    return status;
  }
  return activeCards(microsequence).length ? MICROSEQUENCE_STATUS_READY : MICROSEQUENCE_STATUS_DRAFT;
}

export function isDraftMicrosequence(microsequence) {
  return resolveMicrosequenceStatus(microsequence) === MICROSEQUENCE_STATUS_DRAFT;
}

export function isReadyMicrosequence(microsequence) {
  return resolveMicrosequenceRuntimeIncluded(microsequence);
}

export function normalizeMicrosequenceStatus(value, microsequence) {
  const status = typeof value === "string" ? value.trim() : "";
  if (VALID_STATUSES.has(status)) {
    return status;
  }
  return resolveMicrosequenceStatus(microsequence);
}

export function resolveMicrosequenceRuntimeIncluded(microsequence) {
  return activeCards(microsequence).length > 0 && resolveMicrosequenceStatus(microsequence) !== MICROSEQUENCE_STATUS_DRAFT;
}

export function isRunnableMicrosequence(microsequence) {
  return resolveMicrosequenceRuntimeIncluded(microsequence);
}

export function normalizeMicrosequenceRuntimeIncluded(value, microsequence) {
  if (typeof value === "boolean") {
    return value;
  }
  return resolveMicrosequenceRuntimeIncluded(microsequence);
}
