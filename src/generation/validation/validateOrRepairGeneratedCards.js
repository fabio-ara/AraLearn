import { buildGeneratedCardsRepairPrompt } from "../prompts/buildGeneratedCardsRepairPrompt.js";
import { repairGeneratedCardsDeterministic } from "../repair/repairGeneratedCardsDeterministic.js";
import { validateGeneratedCards } from "./validateGeneratedCards.js";

function compactErrors(errors = []) {
  return Array.isArray(errors) ? errors.map((error) => String(error || "").trim()).filter(Boolean) : [];
}

export async function validateOrRepairGeneratedCards({
  rawGeneratedResponse,
  generationContract,
  callModel,
  maxRepairAttempts = 1,
  throwRepairModelErrors = false
}) {
  const normalizedResponse = repairGeneratedCardsDeterministic(rawGeneratedResponse, generationContract);
  const initialValidation = validateGeneratedCards(normalizedResponse, generationContract);

  if (initialValidation.ok) {
    return {
      ok: true,
      cards: initialValidation.cards,
      repaired: normalizedResponse !== rawGeneratedResponse,
      repairAttempts: 0,
      generationContract,
      didacticContinuation: null
    };
  }

  const initialErrors = compactErrors(initialValidation.errors);
  if (!maxRepairAttempts || typeof callModel !== "function") {
    return {
      ok: false,
      errors: initialErrors,
      repaired: normalizedResponse !== rawGeneratedResponse,
      repairAttempts: 0,
      generationContract,
      didacticContinuation: null
    };
  }

  try {
    const repairedResponse = await callModel({
      phase: "generation_repair",
      systemInstruction: "Você repara JSON de cards do AraLearn. Responda apenas JSON válido.",
      prompt: buildGeneratedCardsRepairPrompt({
        invalidResponse: normalizedResponse,
        validationErrors: initialErrors,
        generationContract
      }),
      temperature: 0.05,
      maxOutputTokens: 4096
    });
    const deterministic = repairGeneratedCardsDeterministic(repairedResponse, generationContract);
    const finalValidation = validateGeneratedCards(deterministic, generationContract);
    if (finalValidation.ok) {
      return {
        ok: true,
        cards: finalValidation.cards,
        repaired: true,
        repairAttempts: 1,
        generationContract,
        didacticContinuation: null
      };
    }
    return {
      ok: false,
      errors: compactErrors(finalValidation.errors),
      repaired: true,
      repairAttempts: 1,
      generationContract,
      didacticContinuation: null
    };
  } catch (error) {
    if (throwRepairModelErrors) {
      throw error;
    }
    return {
      ok: false,
      errors: [`Reparo de cards não devolveu JSON parseável: ${error instanceof Error ? error.message : "erro desconhecido"}`],
      repaired: true,
      repairAttempts: 1,
      generationContract,
      didacticContinuation: null
    };
  }
}
