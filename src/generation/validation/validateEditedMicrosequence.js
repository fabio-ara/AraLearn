import { validateGeneratedCards } from "./validateGeneratedCards.js";

export function validateEditedMicrosequence(response, editContract) {
  const pseudoGenerationContract = {
    output: { expectedCardCount: editContract?.currentVersion?.cards?.length || response?.cards?.length || 0 },
    resources: editContract.resources,
    didacticPlan: {
      cardPlan: (response?.cards || []).map((card, index) => ({ position: card.position || index + 1 }))
    }
  };
  const validation = validateGeneratedCards(response, pseudoGenerationContract);
  if (!validation.ok) return validation;

  if (editContract?.editPlan?.editScope === "selected_cards") {
    const affected = new Set(editContract.editPlan.affectedCards || []);
    const currentByKey = new Map((editContract.currentVersion.cards || []).map((card) => [card.key, JSON.stringify(card)]));
    for (const card of response.cards || []) {
      if (card.key && currentByKey.has(card.key) && !affected.has(card.key) && currentByKey.get(card.key) !== JSON.stringify(card)) {
        return { ok: false, errors: [`Card não afetado foi alterado: ${card.key}.`] };
      }
    }
  }

  return {
    ok: true,
    editedMicrosequence: {
      key: editContract?.target?.microsequenceKey,
      cards: validation.cards
    }
  };
}
