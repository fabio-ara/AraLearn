export function getMicrosequenceCards(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

export function replaceMicrosequenceCards(microsequence, nextCards) {
  return {
    ...microsequence,
    cards: Array.isArray(nextCards?.cards)
      ? nextCards.cards
      : Array.isArray(nextCards) ? nextCards : []
  };
}
