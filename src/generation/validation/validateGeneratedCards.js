import { validateGeneratedCardsStructural } from "./validateGeneratedCardsStructural.js";
import { validateGeneratedCardsDidactic } from "./validateGeneratedCardsDidactic.js";
import { validateGeneratedCardsSourceGrounding } from "./validateGeneratedCardsSourceGrounding.js";

export function validateGeneratedCards(response, generationContract) {
  const structural = validateGeneratedCardsStructural(response, generationContract);
  const cards = structural.cards || [];
  const didactic = structural.ok
    ? validateGeneratedCardsDidactic(cards, generationContract)
    : { ok: false, didacticErrors: [], didacticWarnings: [], didacticAudit: null };
  const source = structural.ok
    ? validateGeneratedCardsSourceGrounding(cards, generationContract)
    : { ok: false, sourceErrors: [] };

  const errors = [
    ...(structural.structuralErrors || []),
    ...(didactic.didacticErrors || []),
    ...(source.sourceErrors || [])
  ];

  return {
    ok: structural.ok && didactic.ok && source.ok,
    cards,
    structuralErrors: structural.structuralErrors || [],
    didacticErrors: didactic.didacticErrors || [],
    didacticWarnings: didactic.didacticWarnings || [],
    didacticAudit: didactic.didacticAudit || null,
    sourceErrors: source.sourceErrors || [],
    errors
  };
}
