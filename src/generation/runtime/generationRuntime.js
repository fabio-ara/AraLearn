import { resolveGenerationLaunchConfig } from "./launchConfig.js";
import {
  resolveGenerationScope,
  resolveGenerationNavigationTarget,
  summarizeTopDownResult
} from "./generationState.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function prepareStructureGeneration({
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

  const launchConfig = resolveGenerationLaunchConfig({
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
        scope: resolveGenerationScope(scopeState),
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

export function buildAppliedGeneration({
  generationResult = {},
  ingestedAttachments = {},
  scopeState = {}
} = {}) {
  const generationSummary = summarizeTopDownResult(generationResult);
  return {
    ...generationSummary,
    ...(Array.isArray(ingestedAttachments.warnings) && ingestedAttachments.warnings.length
      ? {
          message: `${generationSummary.message} Avisos de ingestão: ${ingestedAttachments.warnings.join(" ")}`
        }
      : {}),
    ...resolveGenerationNavigationTarget({
      projectDocument: generationResult.projectDocument,
      patch: generationResult.patch,
      scopeState
    })
  };
}
