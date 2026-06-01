function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function collectCompositeBlockStrings(card = {}) {
  return (Array.isArray(card?.blocks) ? card.blocks : []).flatMap((block) => {
    const kind = text(block?.kind);
    if (kind === "heading" || kind === "paragraph") {
      return [text(block?.value)];
    }
    if (kind === "choice") {
      return [text(block?.question), ...(Array.isArray(block?.options) ? block.options.map((option) => text(option?.text)) : [])];
    }
    return [text(block?.prompt), text(block?.code)];
  }).filter(Boolean);
}

function cardHasFactualDensity(card = {}) {
  const mainText = text(card?.resource) === "composite"
    ? collectCompositeBlockStrings(card).join(" ")
    : [card.text, card.prompt, card.question].map(text).join(" ");
  return [mainText, card.after].map(text).join(" ").split(/\s+/).filter(Boolean).length >= 8;
}

export function validateGeneratedCardsSourceGrounding(cards = [], generationContract = {}) {
  const sourceErrors = [];
  const availableSourceIds = new Set((generationContract?.sources || []).map((item) => text(item?.id || item)));
  if (!availableSourceIds.size) {
    return { ok: true, sourceErrors: [] };
  }
  cards.forEach((card, index) => {
    const prefix = `cards[${index}]`;
    const sources = Array.isArray(card?.sources) ? card.sources.map((item) => text(item)).filter(Boolean) : [];
    if (!sources.length && cardHasFactualDensity(card)) {
      sourceErrors.push(`${prefix} deve declarar sources.`);
    }
    sources.forEach((sourceId) => {
      if (!availableSourceIds.has(sourceId)) {
        sourceErrors.push(`${prefix} source inexistente: ${sourceId}.`);
      }
    });
  });
  return {
    ok: sourceErrors.length === 0,
    sourceErrors
  };
}
