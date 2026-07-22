import { resolveGenerationLaunchConfig } from "./launchConfig.js";
import {
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
  ingestAttachments,
  provider = null
} = {}) {
  if (typeof ingestAttachments !== "function") {
    throw new Error("Ingestão de anexos indisponível para a geração estrutural.");
  }

  const promptText = text(draft.promptText);
  const ingestedAttachments = await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : []);

  if (!promptText && ingestedAttachments.extractedCount === 0) {
    throw new Error(
      "Informe um pedido ou anexo com texto utilizável para gerar a estrutura."
    );
  }

  const launchConfig = resolveGenerationLaunchConfig({
    selectedModel: assistConfig.model,
    apiKey: assistConfig.apiKey,
    baseUrl: assistConfig.baseUrl,
    didacticProfileId: assistConfig.didacticProfileId,
    profileTuning: assistConfig.profileTuning,
    codexEndpoint: assistConfig.codexEndpoint,
    codexToken: assistConfig.codexToken,
    providerProtocol: assistConfig.providerProtocol,
    customModelId: assistConfig.customModelId,
    providerEndpoint: assistConfig.providerEndpoint,
    providerSecret: assistConfig.providerSecret,
    provider
  });

  return {
    promptText,
    ingestedAttachments,
    launchConfig,
    scopeState
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
