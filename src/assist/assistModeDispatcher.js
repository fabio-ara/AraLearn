import {
  buildMicrosequencePlanningRepairPrompt,
  mapPreferredContainerToResource,
  normalizeComposeResult,
  normalizeEditResult,
  resumeGenerationFromValidatedPlan as resumeGenerationFromValidatedPlanRuntime,
  runAssistWithApiProvider,
  validateOrRepairMicrosequencePlan as validateOrRepairMicrosequencePlanRuntime
} from "./assistApiProviderRuntime.js";
import { geminiAssistProvider } from "./geminiAssistProvider.js";

const DEFAULT_ALLOW_FALLBACK_ON = ["rate_limited", "service_unavailable", "timeout"];

export {
  buildMicrosequencePlanningRepairPrompt,
  mapPreferredContainerToResource,
  normalizeComposeResult,
  normalizeEditResult
};

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
  return runAssistWithApiProvider({
    provider: geminiAssistProvider,
    apiKey,
    model,
    mode,
    microsequence,
    card,
    dependencyTitles,
    selectedLessonTopicRefs,
    destinationSlots,
    promptText,
    userFixedTypeId,
    preferredContainer,
    attachments,
    retryOptions,
    fallbackModelId,
    fallbackEnabled,
    allowFallbackOn,
    saveGeneratedCards
  });
}

export async function validateOrRepairMicrosequencePlan(args) {
  return validateOrRepairMicrosequencePlanRuntime({
    ...args,
    deps: geminiAssistProvider.createComposeFlowDeps({
      credentials: geminiAssistProvider.normalizeCredentials({ apiKey: args?.apiKey })
    })
  });
}

export async function resumeGenerationFromValidatedPlan(args) {
  return resumeGenerationFromValidatedPlanRuntime({
    ...args,
    deps: geminiAssistProvider.createComposeFlowDeps({
      credentials: geminiAssistProvider.normalizeCredentials({ apiKey: args?.apiKey })
    })
  });
}
