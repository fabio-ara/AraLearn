import { getContractCardKind } from "../contract/contractCard.js";
import {
  buildGeminiRequestBody,
  callGeminiWithOperationalRetry,
  createGeminiComposeFlowDeps,
  deleteGeminiAttachments,
  getGeminiModelCapabilities,
  normalizeGeminiAttachmentParts,
  uploadGeminiAttachments
} from "./geminiProviderAdapter.js";
import {
  buildMicrosequencePlanningRepairPrompt as buildMicrosequencePlanningRepairPromptFlow,
  composeMicrosequenceWithTwoStepGeneration as composeMicrosequenceWithTwoStepGenerationFlow,
  mapPreferredContainerToResource as mapPreferredContainerToResourceFlow,
  normalizeComposeResult as normalizeComposeResultFlow,
  resumeGenerationFromValidatedPlan as resumeGenerationFromValidatedPlanFlow,
  validateOrRepairMicrosequencePlan as validateOrRepairMicrosequencePlanFlow
} from "./microsequenceComposeFlow.js";
import {
  buildEditPrompt,
  buildLadderPrompt,
  buildRepositionPrompt,
  buildStructurePrompt,
  normalizeEditResult,
  normalizeLadderResult,
  normalizeRepositionResult,
  normalizeStructureResult
} from "./assistPromptBuilders.js";
import { getEditSchema, getLadderSchema, getRepositionSchema, getStructureSchema } from "./assistPromptSchemas.js";

const GEMINI_COMPOSE_FLOW_DEPS = createGeminiComposeFlowDeps();
const DEFAULT_MODEL_ID = "gemini-2.5-flash";
const DEFAULT_ALLOW_FALLBACK_ON = ["rate_limited", "service_unavailable", "timeout"];
const GENERIC_SYSTEM_INSTRUCTION =
  "Você escreve conteúdo em JSON para o contrato do AraLearn. " +
  "Use apenas campos semânticos simples e respostas previsíveis; nunca use type, text, runtime, intent ou data. " +
  "Não explique o que está fazendo. Responda apenas no JSON pedido.";
const LADDER_SYSTEM_INSTRUCTION =
  "Você planeja escadas de microssequências para o AraLearn. " +
  "Responda apenas no JSON pedido, sem cards, sem tags e sem explicação.";
const STRUCTURE_SYSTEM_INSTRUCTION =
  "Você gera estruturas de curso para o AraLearn. " +
  "Responda apenas no JSON pedido com governança estruturada de curso, módulo e lição.";

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFallbackOptions(fallbackEnabled, fallbackModelId, allowFallbackOn = DEFAULT_ALLOW_FALLBACK_ON) {
  return {
    fallbackEnabled,
    fallbackModelId,
    allowFallbackOn
  };
}

function buildStructuredModeRequest({
  model,
  mode,
  microsequence,
  card,
  dependencyTitles,
  destinationSlots,
  promptText,
  fileParts
}) {
  const modelCapabilities = getGeminiModelCapabilities(model);
  if (mode === "edit-card") {
    return {
      body: buildGeminiRequestBody({
        systemInstruction: GENERIC_SYSTEM_INSTRUCTION,
        prompt: buildEditPrompt({ microsequence, card, dependencyTitles, promptText }),
        fileParts,
        schema: getEditSchema(getContractCardKind(card) || "say"),
        temperature: 0.2,
        maxOutputTokens: 1536,
        modelCapabilities
      }),
      normalize: normalizeEditResult,
      phase: "assist_edit_card"
    };
  }

  if (mode === "reposition-microsequence") {
    return {
      body: buildGeminiRequestBody({
        systemInstruction: GENERIC_SYSTEM_INSTRUCTION,
        prompt: buildRepositionPrompt({ microsequence, dependencyTitles, promptText, destinationSlots }),
        fileParts,
        schema: getRepositionSchema(),
        temperature: 0.2,
        maxOutputTokens: 1024,
        modelCapabilities
      }),
      normalize: normalizeRepositionResult,
      phase: "assist_reposition_microsequence"
    };
  }

  if (mode === "plan-microsequence-ladder") {
    return {
      body: buildGeminiRequestBody({
        systemInstruction: LADDER_SYSTEM_INSTRUCTION,
        prompt: buildLadderPrompt({ context: microsequence, promptText }),
        fileParts,
        schema: getLadderSchema(),
        temperature: 0.15,
        maxOutputTokens: 1024,
        modelCapabilities
      }),
      normalize: normalizeLadderResult,
      phase: "assist_plan_microsequence_ladder"
    };
  }

  if (mode === "generate-top-down-structure") {
    return {
      body: buildGeminiRequestBody({
        systemInstruction: STRUCTURE_SYSTEM_INSTRUCTION,
        prompt: buildStructurePrompt({ context: microsequence, promptText }),
        fileParts,
        schema: getStructureSchema(),
        temperature: 0.2,
        maxOutputTokens: 4096,
        modelCapabilities
      }),
      normalize: normalizeStructureResult,
      phase: "assist_generate_top_down_structure"
    };
  }

  return null;
}

async function runStructuredAssistMode({
  apiKey,
  model,
  mode,
  microsequence,
  card,
  dependencyTitles,
  destinationSlots,
  promptText,
  fileParts,
  retryOptions,
  fallbackOptions
}) {
  const request = buildStructuredModeRequest({
    model,
    mode,
    microsequence,
    card,
    dependencyTitles,
    destinationSlots,
    promptText,
    fileParts
  });
  if (!request) {
    return null;
  }

  const response = await callGeminiWithOperationalRetry({
    apiKey,
    model,
    body: request.body,
    phase: request.phase,
    retryOptions,
    fallbackOptions
  });

  return request.normalize(response.value);
}

export function mapPreferredContainerToResource(preferredContainer) {
  return mapPreferredContainerToResourceFlow(preferredContainer);
}

export function buildMicrosequencePlanningRepairPrompt(payload) {
  return buildMicrosequencePlanningRepairPromptFlow(payload);
}

export async function validateOrRepairMicrosequencePlan(args) {
  return validateOrRepairMicrosequencePlanFlow({
    ...args,
    deps: GEMINI_COMPOSE_FLOW_DEPS
  });
}

export async function resumeGenerationFromValidatedPlan(args) {
  return resumeGenerationFromValidatedPlanFlow({
    ...args,
    deps: GEMINI_COMPOSE_FLOW_DEPS
  });
}

export function normalizeComposeResult(value) {
  return normalizeComposeResultFlow(value);
}

export { normalizeEditResult };

export async function runGeminiAssist({
  apiKey,
  model,
  mode,
  microsequence,
  card,
  dependencyTitles = [],
  selectedLessonTopicRefs = [],
  destinationSlots = [],
  promptText,
  userFixedTypeId = "",
  preferredContainer = "",
  attachments = [],
  retryOptions = {},
  fallbackModelId = "",
  fallbackEnabled = false,
  allowFallbackOn = DEFAULT_ALLOW_FALLBACK_ON,
  saveGeneratedCards = null
}) {
  const trimmedKey = normalizeText(apiKey);
  const trimmedModel = normalizeText(model) || DEFAULT_MODEL_ID;
  const trimmedPrompt = normalizeText(promptText);

  if (!trimmedKey) {
    fail("Informe a chave da API antes de enviar o pedido.");
  }
  if (!trimmedPrompt) {
    fail("Escreva o pedido antes de enviar.");
  }
  if (typeof globalThis.fetch !== "function") {
    fail("Este ambiente não oferece suporte a fetch.");
  }

  const normalizedAttachments = (attachments || []).filter(
    (item) => item && typeof item === "object" && typeof item.arrayBuffer === "function"
  );
  const uploadedAttachments = normalizedAttachments.length
    ? await uploadGeminiAttachments({ apiKey: trimmedKey, attachments: normalizedAttachments })
    : [];
  const fileParts = normalizeGeminiAttachmentParts(uploadedAttachments);
  const fallbackOptions = normalizeFallbackOptions(fallbackEnabled, fallbackModelId, allowFallbackOn);

  try {
    if (mode === "compose-microsequence") {
      return composeMicrosequenceWithTwoStepGenerationFlow({
        apiKey: trimmedKey,
        model: trimmedModel,
        microsequence,
        dependencyTitles,
        selectedLessonTopicRefs,
        promptText: trimmedPrompt,
        userFixedTypeId,
        preferredContainer,
        fileParts,
        retryOptions,
        fallbackOptions,
        saveGeneratedCards,
        deps: GEMINI_COMPOSE_FLOW_DEPS
      });
    }

    const result = await runStructuredAssistMode({
      apiKey: trimmedKey,
      model: trimmedModel,
      mode,
      microsequence,
      card,
      dependencyTitles,
      destinationSlots,
      promptText: trimmedPrompt,
      fileParts,
      retryOptions,
      fallbackOptions
    });
    if (result) {
      return result;
    }

    fail("Modo de assistência inválido.");
  } finally {
    await deleteGeminiAttachments({ apiKey: trimmedKey, attachments: uploadedAttachments });
  }
}
