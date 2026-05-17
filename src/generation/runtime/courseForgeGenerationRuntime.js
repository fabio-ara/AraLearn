import { resolveCourseForgeLaunchConfig } from "./courseForgeLaunchConfig.js";
import {
  resolveCourseForgeGenerationScope,
  resolveCourseForgeNavigationTarget,
  summarizeCourseForgeTopDownResult
} from "./courseForgeGenerationState.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function prepareCourseForgeStructureGeneration({
  scopeState = {},
  draft = {},
  assistConfig = {},
  ingestAttachments
} = {}) {
  if (typeof ingestAttachments !== "function") {
    throw new Error("Ingestão de anexos indisponível para a geração estrutural.");
  }

  const promptText = text(draft.promptText);
  const selectedModel = text(assistConfig.model) || "gemini-2.5-flash";
  const ingestedAttachments = await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : []);

  if (!promptText && ingestedAttachments.extractedCount === 0 && ingestedAttachments.attachments.length > 0) {
    throw new Error(
      "Os anexos atuais ainda não geraram texto utilizável para o top-down. Use TXT, Markdown, HTML, JSON, CSV ou complemente com um prompt."
    );
  }

  const launchConfig = resolveCourseForgeLaunchConfig({
    selectedModel,
    apiKey: assistConfig.apiKey,
    didacticProfileId: assistConfig.didacticProfileId,
    profileTuning: assistConfig.profileTuning,
    codexEndpoint: assistConfig.codexEndpoint,
    codexToken: assistConfig.codexToken
  });

  return {
    promptText,
    selectedModel,
    ingestedAttachments,
    launchConfig,
    request: {
      intent: {
        scope: resolveCourseForgeGenerationScope(scopeState),
        promptText,
        attachments: ingestedAttachments.attachments,
        didacticProfileId: launchConfig.didacticProfileId,
        engineProfileOverrides: launchConfig.engineProfileOverrides,
        phaseModelOverrides: launchConfig.phaseModelOverrides,
        selectedTopDownProfileId: launchConfig.selectedTopDownProfileId
      },
      providerRegistry: launchConfig.providerRegistry,
      providerId: launchConfig.providerId
    }
  };
}

export function buildAppliedCourseForgeGeneration({
  courseForgeResult = {},
  ingestedAttachments = {},
  scopeState = {}
} = {}) {
  const courseForgeSummary = summarizeCourseForgeTopDownResult(courseForgeResult);
  return {
    ...courseForgeSummary,
    ...(Array.isArray(ingestedAttachments.warnings) && ingestedAttachments.warnings.length
      ? {
          message: `${courseForgeSummary.message} Avisos de ingestão: ${ingestedAttachments.warnings.join(" ")}`
        }
      : {}),
    ...resolveCourseForgeNavigationTarget({
      projectDocument: courseForgeResult.projectDocument,
      patch: courseForgeResult.patch,
      scopeState
    })
  };
}
