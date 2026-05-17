import { sanitizeContractCard } from "../contract/contractCard.js";
import { buildMicrosequenceGenerationContract } from "../generation/contracts/buildMicrosequenceGenerationContract.js";
import { buildMicrosequencePlanningContract } from "../generation/planning/buildMicrosequencePlanningContract.js";
import { buildMicrosequencePlanningPrompt } from "../generation/planning/buildMicrosequencePlanningPrompt.js";
import { validateMicrosequencePlan } from "../generation/planning/validateMicrosequencePlan.js";
import { buildMicrosequenceGenerationPrompt } from "../generation/prompts/buildMicrosequenceGenerationPrompt.js";
import { getModelCapabilities } from "../generation/providers/modelCapabilities.js";
import { ProviderOperationError, classifyProviderError, createValidationFailedError } from "../generation/providers/providerErrors.js";
import { adaptResourceCardsToPublicCards } from "../generation/resources/adaptResourceCardToPublicCard.js";
import { canResumeGeneration, createGenerationRunState, updateGenerationRunState } from "../generation/runs/generationRunState.js";
import { validateOrRepairGeneratedCards } from "../generation/validation/validateOrRepairGeneratedCards.js";

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveComposeFlowDeps(deps = {}) {
  if (typeof deps.callProviderWithRetry !== "function" || typeof deps.buildRequestBody !== "function") {
    fail("Dependências inválidas para o fluxo de compose da microssequência.");
  }
  return deps;
}

function buildOperationalErrorPayload({ phase, classified, canResume = false, runState = null, fallbackUsed = false, modelId = "" }) {
  const category = classified?.category || "unknown";
  const retryable = classified?.retryable === true;
  const message =
    canResume && retryable
      ? "O provedor está temporariamente indisponível. O plano foi preservado e a geração pode ser retomada."
      : phase === "planning"
        ? "Não foi possível concluir o planejamento com o provedor."
        : phase === "generation"
          ? "Não foi possível concluir a geração dos cards com o provedor."
          : "Não foi possível concluir a chamada ao provedor.";
  return {
    ok: false,
    phase,
    category,
    retryable,
    canResume,
    runId: runState?.runId || "",
    message,
    statusCode: classified?.statusCode || 0,
    fallbackUsed,
    modelId: modelId || runState?.actualModelId || runState?.modelId || ""
  };
}

function throwOperationalError(payload, runState = null) {
  const error = new Error(payload.message);
  Object.assign(error, payload);
  if (runState) {
    error.generationRunState = runState;
  }
  throw error;
}

export function mapPreferredContainerToResource(preferredContainer) {
  const map = {
    say: "paragraph",
    ask: "multiple_choice",
    code: "code_editor",
    table: "table",
    tree: "tree",
    flow: "flowchart",
    plane: "plane",
    matrix: "matrix"
  };
  return map[preferredContainer] || "";
}

function buildGenerationContextEntities(microsequence = {}) {
  return {
    selectedCourse: {
      key: microsequence.courseKey || "",
      title: microsequence.courseTitle || "",
      description: microsequence.courseDescription || "",
      sourceGuide: microsequence.courseSourceGuide || "",
      sourceGuideStructured: microsequence.courseSourceGuideStructured || {}
    },
    selectedModule: {
      key: microsequence.moduleKey || "",
      title: microsequence.moduleTitle || "",
      description: microsequence.moduleDescription || "",
      sourceGuide: microsequence.moduleSourceGuide || "",
      sourceGuideStructured: microsequence.moduleSourceGuideStructured || {}
    },
    selectedLesson: {
      key: microsequence.lessonKey || "",
      title: microsequence.lessonTitle || "",
      description: microsequence.lessonDescription || "",
      sourceGuide: microsequence.lessonSourceGuide || "",
      sourceGuideStructured: microsequence.lessonSourceGuideStructured || {},
      domainMap: microsequence.lessonDomainMap || {},
      resourceTags: microsequence.lessonResourceTags || [],
      contentTypeTags: microsequence.lessonContentTypeTags || [],
      learningActionTags: microsequence.lessonLearningActionTags || [],
      supportLevel: microsequence.lessonSupportLevel || "",
      microsequences: Array.isArray(microsequence.lessonMicrosequences) ? microsequence.lessonMicrosequences : []
    },
    targetMicrosequence: {
      key: microsequence.key || "",
      title: microsequence.title || "",
      description: microsequence.description || "",
      tags: Array.isArray(microsequence.tags) ? microsequence.tags : [],
      domainRefs: Array.isArray(microsequence.domainRefs) ? microsequence.domainRefs : [],
      practiceVariantRefs: Array.isArray(microsequence.practiceVariantRefs) ? microsequence.practiceVariantRefs : [],
      didacticPurpose: microsequence.didacticPurpose || "",
      coverageRole: microsequence.coverageRole || "",
      cards: Array.isArray(microsequence.cards) ? microsequence.cards : []
    }
  };
}

export function buildMicrosequencePlanningRepairPrompt({ planningContract, invalidPlan, errors }) {
  return [
    "Repare apenas o plano de microssequência do AraLearn.",
    "Responda somente JSON válido com typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, sourceUsePlan e reason.",
    "Não devolva cardPlan, cards, position, role nem resourceType por card; o AraLearn monta a sequência de cards de forma determinística depois do planejamento.",
    "Preserve estritamente request.userFixedTypeId quando ele existir e não for assisted.",
    "Use apenas ids presentes em availableTypes e availableResources do contrato.",
    "Preserve todos os recursos extras de request.userSelectedExtraResourceTypes em selectedExtraResourceTypes.",
    "Erros de validação:",
    JSON.stringify(errors || []),
    "Plano inválido:",
    JSON.stringify(invalidPlan || {}),
    "Contrato de planejamento:",
    JSON.stringify(planningContract || {})
  ].join("\n");
}

export async function validateOrRepairMicrosequencePlan({
  apiKey,
  model,
  planningContract,
  planningResult,
  modelCapabilities,
  fileParts = [],
  retryOptions = {},
  fallbackOptions = {},
  deps = {}
}) {
  const { callProviderWithRetry, buildRequestBody } = resolveComposeFlowDeps(deps);
  const validation = validateMicrosequencePlan(planningResult, planningContract);
  if (validation.ok) {
    return validation;
  }

  const repairedCall = await callProviderWithRetry({
    apiKey,
    model,
    phase: "planning_repair",
    retryOptions,
    fallbackOptions,
    body: buildRequestBody({
      systemInstruction:
        "Você repara planos de microssequência para o AraLearn. Responda apenas JSON válido e compacto.",
      prompt: buildMicrosequencePlanningRepairPrompt({
        planningContract,
        invalidPlan: planningResult,
        errors: validation.errors
      }),
      fileParts,
      schema: null,
      temperature: 0.05,
      maxOutputTokens: modelCapabilities?.preferShortSchemas === true ? 1536 : 2048
    })
  });
  const repairedPlan = repairedCall.value;
  const repairedValidation = validateMicrosequencePlan(repairedPlan, planningContract);
  if (repairedValidation.ok) {
    return repairedValidation;
  }

  return {
    ok: false,
    errors: [
      ...validation.errors,
      ...repairedValidation.errors.map((error) => `Após reparo: ${error}`)
    ]
  };
}

function attachDidacticMetadataToPublicCards(cards = [], generationContract = {}) {
  const planByPosition = new Map((generationContract?.didacticPlan?.cardPlan || []).map((item) => [item.position, item]));
  const domainRefs = Array.isArray(generationContract?.context?.microsequence?.domainRefs)
    ? generationContract.context.microsequence.domainRefs
    : [];
  const practiceVariantRefs = Array.isArray(generationContract?.context?.microsequence?.practiceVariantRefs)
    ? generationContract.context.microsequence.practiceVariantRefs
    : [];
  const microsequencePurpose = normalizeText(generationContract?.context?.microsequence?.didacticPurpose);

  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const planned = planByPosition.get(index + 1) || {};
    return sanitizeContractCard({
      ...card,
      ...(domainRefs.length ? { domainRefs } : {}),
      ...(practiceVariantRefs.length ? { practiceVariantRefs } : {}),
      didacticPurpose:
        normalizeText(card?.didacticPurpose) ||
        normalizeText(planned?.learningGoal) ||
        microsequencePurpose ||
        "Cumprir a função didática planejada deste card."
    });
  });
}

export function normalizeComposeResult(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.cards) || !value.cards.length) {
    fail("Resposta inválida do serviço de IA para geração da microssequência.");
  }

  return {
    microsequenceTitle: normalizeText(value.microsequenceTitle) || "Microssequência",
    tags: Array.isArray(value.tags) ? value.tags.map((item) => normalizeText(item)).filter(Boolean) : [],
    cards: value.cards.slice(0, 7).map((card) => sanitizeContractCard(card))
  };
}

export async function resumeGenerationFromValidatedPlan({
  apiKey,
  model,
  runState,
  fileParts = [],
  retryOptions = {},
  fallbackOptions = {},
  saveGeneratedCards = null,
  deps = {}
}) {
  const { callProviderWithRetry, buildRequestBody } = resolveComposeFlowDeps(deps);
  if (!canResumeGeneration(runState)) {
    fail("Estado de geração inválido para retomada.");
  }

  const generationContract = runState.generationContract;
  const generationModel = normalizeText(model) || normalizeText(runState.actualModelId) || normalizeText(runState.modelId);
  const generationPrompt = buildMicrosequenceGenerationPrompt(generationContract, getModelCapabilities(generationModel));
  let activeRunState = updateGenerationRunState(runState, { status: "generation_started", lastError: null });
  let generationCall;

  try {
    generationCall = await callProviderWithRetry({
      apiKey,
      model: generationModel,
      phase: "generation",
      retryOptions,
      fallbackOptions,
      body: buildRequestBody({
        systemInstruction:
          "Você gera cards para o AraLearn. Responda apenas JSON válido no formato pedido.",
        prompt: generationPrompt,
        fileParts,
        schema: null,
        temperature: 0.15,
        maxOutputTokens: 4096,
        modelCapabilities: getModelCapabilities(generationModel)
      })
    });
  } catch (error) {
    if (error instanceof ProviderOperationError) {
      const retryable = error.details?.retryable === true;
      activeRunState = updateGenerationRunState(activeRunState, {
        status: retryable ? "generation_failed_retryable" : "failed",
        lastError: {
          phase: "generation",
          category: error.details?.category || "unknown",
          retryable,
          message: error.details?.message || "Falha na geração.",
          statusCode: error.details?.statusCode || 0
        }
      });
      throwOperationalError(
        buildOperationalErrorPayload({
          phase: "generation",
          classified: error.details,
          canResume: retryable,
          runState: activeRunState,
          fallbackUsed: error.fallbackUsed,
          modelId: error.modelId
        }),
        activeRunState
      );
    }
    throw error;
  }

  let validation;
  try {
    validation = await validateOrRepairGeneratedCards({
      rawGeneratedResponse: generationCall.value,
      generationContract,
      modelCapabilities: getModelCapabilities(generationCall.modelId),
      maxRepairAttempts: 2,
      throwRepairModelErrors: true,
      callModel: ({ phase = "generation_repair", systemInstruction, prompt, temperature, maxOutputTokens }) =>
        callProviderWithRetry({
          apiKey,
          model: generationCall.modelId,
          phase,
          retryOptions,
          fallbackOptions,
          body: buildRequestBody({
            systemInstruction,
            prompt,
            fileParts,
            schema: null,
            temperature,
            maxOutputTokens,
            modelCapabilities: getModelCapabilities(generationCall.modelId)
          })
        }).then((result) => result.value)
    });
  } catch (error) {
    if (error instanceof ProviderOperationError) {
      const retryable = error.details?.retryable === true;
      const failedPhase = error.phase || "generation_repair";
      activeRunState = updateGenerationRunState(activeRunState, {
        status: retryable ? "generation_failed_retryable" : "failed",
        lastError: {
          phase: failedPhase,
          category: error.details?.category || "unknown",
          retryable,
          message: error.details?.message || "Falha no reparo da geração.",
          statusCode: error.details?.statusCode || 0
        }
      });
      throwOperationalError(
        buildOperationalErrorPayload({
          phase: failedPhase,
          classified: error.details,
          canResume: retryable,
          runState: activeRunState,
          fallbackUsed: error.fallbackUsed,
          modelId: error.modelId
        }),
        activeRunState
      );
    }
    throw error;
  }
  const finalGenerationContract = validation.generationContract || generationContract;
  if (!validation.ok) {
    const classified = classifyProviderError(createValidationFailedError(`O serviço de IA devolveu cards inválidos: ${validation.errors.join(" ")}`));
    activeRunState = updateGenerationRunState(activeRunState, {
      status: "failed",
      generationContract: finalGenerationContract,
      lastError: {
        phase: "generation",
        category: classified.category,
        retryable: false,
        message: classified.message,
        statusCode: 0
      }
    });
    throwOperationalError(
      buildOperationalErrorPayload({
        phase: "generation",
        classified,
        canResume: false,
        runState: activeRunState,
        fallbackUsed: generationCall.fallbackUsed,
        modelId: generationCall.modelId
      }),
      activeRunState
    );
  }

  const adapted = adaptResourceCardsToPublicCards(validation.cards);
  if (!adapted.ok) {
    const classified = classifyProviderError(createValidationFailedError(`O serviço de IA devolveu cards sem adaptação pública válida: ${adapted.errors.join(" ")}`));
    activeRunState = updateGenerationRunState(activeRunState, {
      status: "failed",
      lastError: {
        phase: "generation",
        category: classified.category,
        retryable: false,
        message: classified.message,
        statusCode: 0
      }
    });
    throwOperationalError(
      buildOperationalErrorPayload({
        phase: "generation",
        classified,
        canResume: false,
        runState: activeRunState,
        fallbackUsed: generationCall.fallbackUsed,
        modelId: generationCall.modelId
      }),
      activeRunState
    );
  }

  let finalRunState = updateGenerationRunState(activeRunState, {
    status: "generation_validated",
    actualModelId: generationCall.modelId,
    fallbackUsed: activeRunState.fallbackUsed || generationCall.fallbackUsed,
    generationContract: finalGenerationContract,
    autoDidacticIterations: Number(validation.didacticIterationCount) || 0,
    lastError: null
  });

  const result = normalizeComposeResult({
    microsequenceTitle:
      finalGenerationContract.context.microsequence.title || finalGenerationContract.didacticPlan?.microsequenceGoal || "Microssequência",
    tags: [],
    cards: attachDidacticMetadataToPublicCards(adapted.cards, finalGenerationContract)
  });

  if (typeof saveGeneratedCards === "function") {
    await saveGeneratedCards({ cards: result.cards, runState: finalRunState, result });
    finalRunState = updateGenerationRunState(finalRunState, { status: "saved" });
  }

  return {
    ...result,
    generationRunState: finalRunState,
    fallbackUsed: finalRunState.fallbackUsed,
    modelId: finalRunState.actualModelId
  };
}

export async function composeMicrosequenceWithTwoStepGeneration({
  apiKey,
  model,
  microsequence,
  dependencyTitles,
  selectedLessonTopicRefs = [],
  promptText,
  userFixedTypeId = "",
  preferredContainer = "",
  fileParts = [],
  retryOptions = {},
  fallbackOptions = {},
  saveGeneratedCards = null,
  deps = {}
}) {
  const { callProviderWithRetry, buildRequestBody } = resolveComposeFlowDeps(deps);
  const modelCapabilities = getModelCapabilities(model);
  const entities = buildGenerationContextEntities(microsequence);
  const preferredResource = mapPreferredContainerToResource(preferredContainer);
  const planningContract = buildMicrosequencePlanningContract({
    ...entities,
    selectedLessonTopicRefs: selectedLessonTopicRefs.length
      ? selectedLessonTopicRefs
      : dependencyTitles.map((title) => ({ refKey: title, label: title, source: "microsequence" })),
    userPrompt: promptText,
    userFixedTypeId: userFixedTypeId || null,
    userSelectedExtraResourceTypes: preferredResource ? [preferredResource] : [],
    selectedModel: model
  });
  const planningPrompt = buildMicrosequencePlanningPrompt(planningContract, modelCapabilities);
  let planningCall;
  try {
    planningCall = await callProviderWithRetry({
      apiKey,
      model,
      phase: "planning",
      retryOptions,
      fallbackOptions,
      body: buildRequestBody({
        systemInstruction:
          "Você planeja microssequências para o AraLearn. Responda apenas JSON válido e compacto.",
        prompt: planningPrompt,
        fileParts,
        schema: null,
        temperature: 0.1,
        maxOutputTokens: 1536
      })
    });
  } catch (error) {
    if (error instanceof ProviderOperationError) {
      throwOperationalError(
        buildOperationalErrorPayload({
          phase: "planning",
          classified: error.details,
          canResume: false,
          fallbackUsed: error.fallbackUsed,
          modelId: error.modelId
        })
      );
    }
    throw error;
  }

  let validatedPlan;
  try {
    validatedPlan = await validateOrRepairMicrosequencePlan({
      apiKey,
      model: planningCall.modelId,
      planningContract,
      planningResult: planningCall.value,
      modelCapabilities: getModelCapabilities(planningCall.modelId),
      fileParts,
      retryOptions,
      fallbackOptions,
      deps
    });
  } catch (error) {
    if (error instanceof ProviderOperationError) {
      throwOperationalError(
        buildOperationalErrorPayload({
          phase: "planning_repair",
          classified: error.details,
          canResume: false,
          fallbackUsed: error.fallbackUsed,
          modelId: error.modelId
        })
      );
    }
    throw error;
  }
  if (!validatedPlan.ok) {
    const classified = classifyProviderError(createValidationFailedError(`Plano de microssequência inválido: ${validatedPlan.errors.join(" ")}`));
    throwOperationalError(
      buildOperationalErrorPayload({
        phase: "planning",
        classified,
        canResume: false,
        fallbackUsed: planningCall.fallbackUsed,
        modelId: planningCall.modelId
      })
    );
  }

  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan,
    selectedModel: model
  });
  const runState = createGenerationRunState({
    modelId: model,
    planningContract,
    validatedPlan,
    generationContract
  });

  return resumeGenerationFromValidatedPlan({
    apiKey,
    model,
    runState: updateGenerationRunState(runState, {
      actualModelId: planningCall.modelId,
      fallbackUsed: planningCall.fallbackUsed
    }),
    fileParts,
    retryOptions,
    fallbackOptions,
    saveGeneratedCards,
    deps
  });
}
