export const MICROSEQUENCE_SIZES = Object.freeze([
  Object.freeze({
    id: "short",
    label: "Lote curto",
    cardCount: 3,
    recommendedBatchCards: 3,
    technicalBudgetOnly: true
  }),
  Object.freeze({
    id: "medium",
    label: "Lote médio",
    cardCount: 5,
    recommendedBatchCards: 5,
    technicalBudgetOnly: true
  }),
  Object.freeze({
    id: "long",
    label: "Lote amplo",
    cardCount: 8,
    recommendedBatchCards: 8,
    technicalBudgetOnly: true
  })
]);

export function listMicrosequenceSizes() {
  return MICROSEQUENCE_SIZES.map((item) => ({ ...item }));
}

export function getMicrosequenceSize(sizeId) {
  return listMicrosequenceSizes().find((item) => item.id === sizeId) || null;
}

export function getMicrosequenceCardCount(sizeId) {
  return getMicrosequenceSize(sizeId)?.recommendedBatchCards || 0;
}
