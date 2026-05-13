function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cardHasFactualDensity(card) {
  const source = text(card?.text || card?.prompt || card?.question || card?.feedback || card?.feedbackAfter);
  return /\d|`|:|;/.test(source) || source.split(/\s+/).filter(Boolean).length >= 8;
}

export function validateGeneratedCardsSourceGrounding(cards = [], generationContract = {}) {
  const sourceErrors = [];
  const availableSourceIds = new Set((generationContract?.sources || []).map((item) => item.sourceId));
  const sourceUsePlan = Array.isArray(generationContract?.sourceUsePlan) ? generationContract.sourceUsePlan : [];
  const requiresGrounding = availableSourceIds.size > 0 || sourceUsePlan.length > 0;

  if (!requiresGrounding) {
    return { ok: true, sourceErrors: [] };
  }

  cards.forEach((card, index) => {
    const prefix = `cards[${index}]`;
    const sourceRefs = Array.isArray(card?.sourceRefs) ? card.sourceRefs.map((item) => text(item)).filter(Boolean) : [];
    const sourceNote = text(card?.sourceNote);

    if (!sourceRefs.length && !sourceNote) {
      sourceErrors.push(`${prefix} deve declarar sourceRefs ou justificar ausência.`);
    }
    sourceRefs.forEach((sourceId) => {
      if (!availableSourceIds.has(sourceId)) {
        sourceErrors.push(`${prefix} sourceRefs inexistente: ${sourceId}.`);
      }
    });
    if (cardHasFactualDensity(card) && !sourceRefs.length && !sourceNote) {
      sourceErrors.push(`${prefix} afirmação factual sem fonte.`);
    }
  });

  return {
    ok: sourceErrors.length === 0,
    sourceErrors
  };
}
