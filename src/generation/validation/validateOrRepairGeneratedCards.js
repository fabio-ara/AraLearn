import { buildGeneratedCardsRepairPrompt } from "../prompts/buildGeneratedCardsRepairPrompt.js";
import { repairGeneratedCardsDeterministic } from "../repair/repairGeneratedCardsDeterministic.js";
import { validateGeneratedCardsStructural } from "./validateGeneratedCardsStructural.js";
import { validateGeneratedCardsDidactic } from "./validateGeneratedCardsDidactic.js";
import { validateGeneratedCardsSourceGrounding } from "./validateGeneratedCardsSourceGrounding.js";
import { validateGeneratedCards } from "./validateGeneratedCards.js";

function compactErrors(errors = []) {
  return Array.isArray(errors) ? errors.map((error) => String(error || "").trim()).filter(Boolean) : [];
}

export async function validateOrRepairGeneratedCards({
  rawGeneratedResponse,
  generationContract,
  modelCapabilities = {},
  callModel,
  maxRepairAttempts = 1,
  throwRepairModelErrors = false
}) {
  const normalizedResponse = repairGeneratedCardsDeterministic(rawGeneratedResponse, generationContract);
  const structuralValidation = validateGeneratedCardsStructural(normalizedResponse, generationContract);
  const didacticValidation = structuralValidation.ok
    ? validateGeneratedCardsDidactic(structuralValidation.cards, generationContract)
    : { ok: false, didacticErrors: [] };
  const sourceValidation = structuralValidation.ok
    ? validateGeneratedCardsSourceGrounding(structuralValidation.cards, generationContract)
    : { ok: false, sourceErrors: [] };

  if (structuralValidation.ok && didacticValidation.ok && sourceValidation.ok) {
    return {
      ok: true,
      cards: structuralValidation.cards,
      repaired: normalizedResponse !== rawGeneratedResponse,
      repairAttempts: 0
    };
  }

  const initialErrors = [
    ...compactErrors(structuralValidation.structuralErrors),
    ...compactErrors(didacticValidation.didacticErrors),
    ...compactErrors(sourceValidation.sourceErrors)
  ];
  const attempts = Math.max(0, Number.isFinite(maxRepairAttempts) ? Math.floor(maxRepairAttempts) : 1);
  if (!attempts || typeof callModel !== "function") {
    return {
      ok: false,
      errors: initialErrors,
      repaired: normalizedResponse !== rawGeneratedResponse,
      repairAttempts: 0
    };
  }

  let lastResponse = normalizedResponse;
  let lastErrors = initialErrors;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let repairedResponse;
    try {
      repairedResponse = await callModel({
        systemInstruction: "Você repara JSON de cards do AraLearn. Responda apenas JSON válido.",
        prompt: buildGeneratedCardsRepairPrompt({
          invalidResponse: lastResponse,
          validationErrors: lastErrors,
          generationContract,
          modelCapabilities
        }),
        temperature: 0.05,
        maxOutputTokens: modelCapabilities?.preferShortSchemas === true ? 4096 : 6144
      });
    } catch (error) {
      if (throwRepairModelErrors) {
        throw error;
      }
      return {
        ok: false,
        errors: [`Reparo de cards não devolveu JSON parseável: ${error instanceof Error ? error.message : "erro desconhecido"}`],
        repaired: true,
        repairAttempts: attempt
      };
    }

    const deterministicallyRepaired = repairGeneratedCardsDeterministic(repairedResponse, generationContract);
    const finalValidation = validateGeneratedCards(deterministicallyRepaired, generationContract);
    if (finalValidation.ok) {
      return {
        ok: true,
        cards: finalValidation.cards,
        repaired: true,
        repairAttempts: attempt
      };
    }
    lastResponse = deterministicallyRepaired;
    lastErrors = compactErrors(finalValidation.errors);
  }

  return {
    ok: false,
    errors: lastErrors,
    repaired: true,
    repairAttempts: attempts
  };
}
