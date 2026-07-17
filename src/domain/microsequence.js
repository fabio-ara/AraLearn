export const MICROSEQUENCE_STATUSES = Object.freeze(["planned", "generated", "needs_review", "ready"]);

export function getMicrosequenceCards(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

export function replaceMicrosequenceCards(microsequence, nextCards, nextStatus = "generated") {
  return {
    ...microsequence,
    cards: Array.isArray(nextCards?.cards) ? nextCards.cards : Array.isArray(nextCards) ? nextCards : [],
    status: nextStatus
  };
}
