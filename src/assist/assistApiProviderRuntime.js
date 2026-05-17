import {
  buildMicrosequencePlanningRepairPrompt as buildMicrosequencePlanningRepairPromptFlow,
  composeMicrosequenceWithTwoStepGeneration as composeMicrosequenceWithTwoStepGenerationFlow,
  mapPreferredContainerToResource as mapPreferredContainerToResourceFlow,
  normalizeComposeResult as normalizeComposeResultFlow,
  resumeGenerationFromValidatedPlan as resumeGenerationFromValidatedPlanFlow,
  validateOrRepairMicrosequencePlan as validateOrRepairMicrosequencePlanFlow
} from "./microsequenceComposeFlow.js";
import { normalizeEditResult } from "./assistPromptBuilders.js";
import { buildStructuredAssistModePlan } from "./assistStructuredModePlan.js";

const DEFAULT_ALLOW_FALLBACK_ON = ["rate_limited", "service_unavailable", "timeout"];

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

export function mapPreferredContainerToResource(preferredContainer) {
  return mapPreferredContainerToResourceFlow(preferredContainer);
}

export function buildMicrosequencePlanningRepairPrompt(payload) {
  return buildMicrosequencePlanningRepairPromptFlow(payload);
}

export function normalizeComposeResult(value) {
  return normalizeComposeResultFlow(value);
}

export { normalizeEditResult };

export async function validateOrRepairMicrosequencePlan({ deps, ...args }) {
  return validateOrRepairMicrosequencePlanFlow({
    ...args,
    deps
  });
}

export async function resumeGenerationFromValidatedPlan({ deps, ...args }) {
  return resumeGenerationFromValidatedPlanFlow({
    ...args,
    deps
  });
}

export async function runAssistWithApiProvider({
  provider,
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
  if (!provider || typeof provider !== "object") {
    fail("Provider de assistência inválido.");
  }

  const trimmedModel = normalizeText(model) || provider.defaultModelId;
  const trimmedPrompt = normalizeText(promptText);
  const credentials = provider.normalizeCredentials({ apiKey });
  if (!trimmedPrompt) {
    fail("Escreva o pedido antes de enviar.");
  }
  if (typeof globalThis.fetch !== "function") {
    fail("Este ambiente não oferece suporte a fetch.");
  }
  provider.validateCredentials(credentials);

  const normalizedAttachments = (attachments || []).filter(
    (item) => item && typeof item === "object" && typeof item.arrayBuffer === "function"
  );
  const uploadedAttachments = normalizedAttachments.length
    ? await provider.uploadAttachments({ credentials, attachments: normalizedAttachments })
    : [];
  const fileParts = provider.normalizeFileParts(uploadedAttachments);
  const fallbackOptions = normalizeFallbackOptions(fallbackEnabled, fallbackModelId, allowFallbackOn);
  const composeDeps = provider.createComposeFlowDeps({ credentials });
  const buildRequestBody = (request) => provider.buildRequestBody({ ...request, fileParts });

  try {
    if (mode === "compose-microsequence") {
      return composeMicrosequenceWithTwoStepGenerationFlow({
        apiKey: credentials.apiKey,
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
        deps: composeDeps
      });
    }

    const plan = buildStructuredAssistModePlan({
      model: trimmedModel,
      mode,
      microsequence,
      card,
      dependencyTitles,
      destinationSlots,
      promptText: trimmedPrompt,
      buildRequestBody,
      getModelCapabilities: provider.getModelCapabilities
    });
    if (!plan) {
      fail("Modo de assistência inválido.");
    }

    const response = await provider.callWithRetry({
      credentials,
      model: trimmedModel,
      body: plan.body,
      phase: plan.phase,
      retryOptions,
      fallbackOptions
    });
    return plan.normalize(response.value);
  } finally {
    await provider.deleteAttachments({ credentials, attachments: uploadedAttachments });
  }
}
