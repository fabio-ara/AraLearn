export const MICROSEQUENCE_SIZES = Object.freeze([
  Object.freeze({ id: "short", label: "Curta", cardCount: 3 }),
  Object.freeze({ id: "medium", label: "Média", cardCount: 5 }),
  Object.freeze({ id: "long", label: "Longa", cardCount: 7 })
]);

export function listMicrosequenceSizes() {
  return MICROSEQUENCE_SIZES.map((item) => ({ ...item }));
}

export function getMicrosequenceSize(sizeId) {
  return listMicrosequenceSizes().find((item) => item.id === sizeId) || null;
}

export function getMicrosequenceCardCount(sizeId) {
  return getMicrosequenceSize(sizeId)?.cardCount || 0;
}
