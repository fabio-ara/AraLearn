import { validateGeneratedCards } from "../validation/validateGeneratedCards.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildFallbackContract(payload = {}, options = {}) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  return {
    guide: structuredClone(options?.guide || options?.packet?.guide || { goal: "", include: [], exclude: [], notation: [], avoid: [] }),
    microsequence: structuredClone(options?.packet?.microsequence || { title: "", goal: "", checks: [] }),
    plan: cards.map((card, index) => ({
      position: Number(card?.position) || index + 1,
      role: text(card?.kind) === "exercise" ? "practice" : "explain",
      resource: text(card?.resource),
      kind: text(card?.kind),
      exercise: text(card?.exercise),
      goal: "",
      checks: []
    })),
    output: {
      cardCount: cards.length
    }
  };
}

export function validateMicrosequenceCards(payload, generationContract = {}, options = {}) {
  const contract =
    generationContract && Array.isArray(generationContract.plan)
      ? generationContract
      : buildFallbackContract(payload, { ...options, packet: generationContract?.packet || options?.packet });
  const validation = validateGeneratedCards(payload, contract);
  return {
    ok: validation.ok,
    errors: validation.errors.map((message) => ({ message })),
    value: {
      summary: text(payload?.summary),
      cards: validation.cards
    },
    report: {
      structuralErrors: validation.structuralErrors,
      didacticErrors: validation.didacticErrors,
      sourceErrors: validation.sourceErrors
    }
  };
}
