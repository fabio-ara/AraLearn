import { validateCard } from "../../domain/cards.js";

function densityBounds(density) {
  if (density === "deep") {
    return { min: 6, max: 10 };
  }
  if (density === "exam") {
    return { min: 8, max: 14 };
  }
  return { min: 4, max: 6 };
}

export function validateMicrosequenceCards(payload, density = "standard") {
  const errors = [];
  const summary = typeof payload?.summary === "string" ? payload.summary.trim() : "";
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const normalizedCards = cards
    .map((card, index) => {
      const result = validateCard(card, `$.cards[${index}]`);
      if (!result.ok) {
        result.errors.forEach((error) => errors.push(error));
        return null;
      }
      return result.value;
    })
    .filter(Boolean);

  const bounds = densityBounds(density);
  if (normalizedCards.length < bounds.min || normalizedCards.length > bounds.max) {
    errors.push({
      path: "$.cards",
      message: `Quantidade de cards fora do esperado para ${density}: ${normalizedCards.length} (esperado entre ${bounds.min} e ${bounds.max}).`
    });
  }
  if (!summary) {
    errors.push({
      path: "$.summary",
      message: "Resumo da versão é obrigatório."
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      summary,
      cards: normalizedCards
    },
    report: {
      ok: errors.length === 0,
      density,
      cardCount: normalizedCards.length,
      issues: errors.map((error) => error.message)
    }
  };
}

