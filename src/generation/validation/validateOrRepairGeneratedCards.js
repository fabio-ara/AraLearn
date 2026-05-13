import { buildDidacticIterationPrompt } from "../prompts/buildDidacticIterationPrompt.js";
import { buildGeneratedCardsRepairPrompt } from "../prompts/buildGeneratedCardsRepairPrompt.js";
import { repairGeneratedCardsDeterministic } from "../repair/repairGeneratedCardsDeterministic.js";
import { validateGeneratedCards } from "./validateGeneratedCards.js";
import { buildDidacticIterationPlan } from "./buildDidacticIterationPlan.js";

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

  const initialErrors = [
    ...compactErrors(initialValidation.structuralErrors),
    ...compactErrors(initialValidation.didacticErrors),
    ...compactErrors(initialValidation.sourceErrors)
  ];
  const attempts = Math.max(0, Number.isFinite(maxRepairAttempts) ? Math.floor(maxRepairAttempts) : 1);
  if (!attempts || typeof callModel !== "function") {
    return {
      ok: false,
      errors: initialErrors,
      repaired: normalizedResponse !== rawGeneratedResponse,
      repairAttempts: 0,
      generationContract,
      didacticContinuation: null
    };
  }

  let lastResponse = normalizedResponse;
  let lastErrors = initialErrors;
  let lastValidation = initialValidation;
  let currentGenerationContract = generationContract;
  let didacticIterationCount = 0;
  let lastDidacticContinuation = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let repairedResponse;
    let nextGenerationContract = currentGenerationContract;
    try {
      const didacticIterationPlan =
        lastValidation.structuralErrors.length === 0 && lastValidation.sourceErrors.length === 0
          ? buildDidacticIterationPlan(lastValidation, currentGenerationContract)
          : null;
      lastDidacticContinuation = didacticIterationPlan;

      if (didacticIterationPlan) {
        if (didacticIterationPlan.shouldTriggerModelIteration !== true) {
          return {
            ok: false,
            errors:
              didacticIterationPlan.outcome === "reject_as_redundant"
                ? compactErrors(didacticIterationPlan.rejectionReasons)
                : compactErrors(didacticIterationPlan.lessonFollowUpActions),
            repaired: normalizedResponse !== rawGeneratedResponse,
            repairAttempts: attempt - 1,
            generationContract: currentGenerationContract,
            didacticIterationCount,
            didacticContinuation: didacticIterationPlan
          };
        }
        nextGenerationContract = {
          ...currentGenerationContract,
          didacticPlan: {
            ...(currentGenerationContract?.didacticPlan || {}),
            cardPlan: didacticIterationPlan.cardPlan
          },
          output: {
            ...(currentGenerationContract?.output || {}),
            expectedCardCount: didacticIterationPlan.expectedCardCount
          }
        };
        repairedResponse = await callModel({
          phase: "generation_iteration",
          systemInstruction: "Você melhora uma microssequência do AraLearn dentro de um plano determinístico revisado. Responda apenas JSON válido.",
          prompt: buildDidacticIterationPrompt({
            cardsResponse: lastResponse,
            validationResult: lastValidation,
            generationContract: nextGenerationContract,
            iterationPlan: didacticIterationPlan,
            modelCapabilities
          }),
          temperature: 0.1,
          maxOutputTokens: modelCapabilities?.preferShortSchemas === true ? 5120 : 7168
        });
        didacticIterationCount += 1;
      } else {
        repairedResponse = await callModel({
          phase: "generation_repair",
          systemInstruction: "Você repara JSON de cards do AraLearn. Responda apenas JSON válido.",
          prompt: buildGeneratedCardsRepairPrompt({
            invalidResponse: lastResponse,
            validationErrors: lastErrors,
            generationContract: currentGenerationContract,
            modelCapabilities
          }),
          temperature: 0.05,
          maxOutputTokens: modelCapabilities?.preferShortSchemas === true ? 4096 : 6144
        });
      }
    } catch (error) {
      if (throwRepairModelErrors) {
        throw error;
      }
      return {
        ok: false,
        errors: [`Reparo de cards não devolveu JSON parseável: ${error instanceof Error ? error.message : "erro desconhecido"}`],
        repaired: true,
        repairAttempts: attempt,
        generationContract: currentGenerationContract,
        didacticContinuation: null
      };
    }

    currentGenerationContract = nextGenerationContract;
    const deterministicallyRepaired = repairGeneratedCardsDeterministic(repairedResponse, currentGenerationContract);
    const finalValidation = validateGeneratedCards(deterministicallyRepaired, currentGenerationContract);
    if (finalValidation.ok) {
      return {
        ok: true,
        cards: finalValidation.cards,
        repaired: true,
        repairAttempts: attempt,
        generationContract: currentGenerationContract,
        didacticIterationCount,
        didacticContinuation: lastDidacticContinuation
      };
    }
    lastResponse = deterministicallyRepaired;
    lastErrors = compactErrors(finalValidation.errors);
    lastValidation = finalValidation;
  }

  return {
    ok: false,
    errors: lastErrors,
    repaired: true,
    repairAttempts: attempts,
    generationContract: currentGenerationContract,
    didacticIterationCount,
    didacticContinuation: lastDidacticContinuation
  };
}
