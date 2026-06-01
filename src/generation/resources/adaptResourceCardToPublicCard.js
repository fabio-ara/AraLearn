import { normalizeGeneratedCard as normalizeCard } from "../../domain/cards.js";

export function normalizeGeneratedCard(card) {
  return normalizeCard(card);
}

export function normalizeGeneratedCards(cards = []) {
  const errors = [];
  const normalizedCards = [];
  (Array.isArray(cards) ? cards : []).forEach((card, index) => {
    try {
      normalizedCards.push(normalizeGeneratedCard(card));
    } catch (error) {
      errors.push(`Card ${index + 1}: ${error instanceof Error ? error.message : "falha na normalização"}`);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, cards: normalizedCards };
}
