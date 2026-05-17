import { isCodexLocalModel } from "../providers/codexCliConfig.js";
import { resolveCourseForgeLaunchConfig } from "./courseForgeLaunchConfig.js";
import { resolveCourseForgeProviderReadiness } from "./courseForgeGenerationViewModel.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inferLocalOperation(promptText = "") {
  const normalized = text(promptText)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(corrig|corrij|repar|consert|revise|audite|verifique|ajuste)/.test(normalized)) {
    return "repair";
  }
  return "reinforce";
}

export function buildCourseForgeMicrosequencePrompt({
  promptText = "",
  dependencyTitles = [],
  selectedDidacticTypeId = "",
  preferredContainerLabel = ""
} = {}) {
  const basePrompt = text(promptText);
  const lines = [basePrompt];
  const normalizedDependencies = Array.isArray(dependencyTitles)
    ? dependencyTitles.map(text).filter(Boolean)
    : [];

  if (normalizedDependencies.length) {
    lines.push(`Considere como dependências ou referências locais: ${normalizedDependencies.join(", ")}.`);
  }
  if (text(selectedDidacticTypeId)) {
    lines.push(`Priorize função didática compatível com "${text(selectedDidacticTypeId)}" quando isso melhorar a intervenção local.`);
  }
  if (text(preferredContainerLabel) && !["automatico", "automático"].includes(text(preferredContainerLabel).toLowerCase())) {
    lines.push(`Quando a representação continuar didaticamente adequada, prefira cards no formato "${text(preferredContainerLabel)}".`);
  }

  return lines.filter(Boolean).join("\n\n");
}

export function resolveCourseForgeMicrosequenceRequestConfig({ promptText = "" } = {}) {
  const operation = inferLocalOperation(promptText);
  return {
    operation,
    requestedGenerationDepth: operation === "repair" ? "repair_only" : "reinforce_only"
  };
}

export async function prepareCourseForgeMicrosequenceGeneration({
  selection = {},
  draft = {},
  assistConfig = {},
  dependencyTitles = [],
  selectedDidacticTypeId = "",
  preferredContainerLabel = "",
  ingestAttachments
} = {}) {
  if (typeof ingestAttachments !== "function") {
    throw new Error("Ingestão de anexos indisponível para a intervenção local.");
  }

  const courseKey = text(selection?.courseKey);
  const moduleKey = text(selection?.moduleKey);
  const lessonKey = text(selection?.lessonKey);
  const microsequenceKey = text(selection?.microsequenceKey);
  if (!courseKey || !moduleKey || !lessonKey || !microsequenceKey) {
    throw new Error("Selecione uma microssequência válida antes de pedir intervenção local.");
  }

  const rawPromptText = text(draft.promptText);
  const selectedModel = text(assistConfig.model) || "gemini-2.5-flash";
  const ingestedAttachments = await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : []);
  if (!rawPromptText && ingestedAttachments.extractedCount === 0) {
    throw new Error("Informe um pedido ou anexo com texto utilizável antes de editar a microssequência.");
  }

  const promptText = buildCourseForgeMicrosequencePrompt({
    promptText: rawPromptText,
    dependencyTitles,
    selectedDidacticTypeId,
    preferredContainerLabel
  });
  const requestConfig = resolveCourseForgeMicrosequenceRequestConfig({
    promptText: rawPromptText
  });
  const launchConfig = resolveCourseForgeLaunchConfig({
    selectedModel,
    apiKey: assistConfig.apiKey,
    didacticProfileId: assistConfig.didacticProfileId,
    customPromptGuidance: assistConfig.customPromptGuidance,
    codexEndpoint: assistConfig.codexEndpoint,
    codexToken: assistConfig.codexToken
  });

  return {
    promptText,
    selectedModel,
    ingestedAttachments,
    launchConfig,
    requestConfig,
    request: {
      intent: {
        scope: {
          level: "microsequence",
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey
        },
        promptText,
        attachments: ingestedAttachments.attachments,
        operation: requestConfig.operation,
        requestedGenerationDepth: requestConfig.requestedGenerationDepth,
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

export async function executeCourseForgeMicrosequenceGeneration({
  selection = {},
  draft = {},
  assistConfig = {},
  dependencyTitles = [],
  selectedDidacticTypeId = "",
  preferredContainerLabel = "",
  projectDocument = {},
  checkCodexLocalHealth,
  ingestAttachments,
  runCourseForge
} = {}) {
  const readiness = await resolveCourseForgeProviderReadiness({
    selectedModel: assistConfig.model,
    codexEndpoint: assistConfig.codexEndpoint,
    codexToken: assistConfig.codexToken,
    checkCodexLocalHealth
  });

  if (!readiness.ok && isCodexLocalModel(assistConfig.model)) {
    return {
      status: "provider-unready",
      errorMessage: readiness.error || "O bridge local não está ativo."
    };
  }

  try {
    const preparedIntervention = await prepareCourseForgeMicrosequenceGeneration({
      selection,
      draft,
      assistConfig,
      dependencyTitles,
      selectedDidacticTypeId,
      preferredContainerLabel,
      ingestAttachments
    });
    const courseForgeResult = await runCourseForge({
      ...preparedIntervention.request,
      projectDocument
    });
    return {
      status: "success",
      courseForgeResult,
      preparedIntervention
    };
  } catch (error) {
    return {
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Falha ao chamar o serviço de IA."
    };
  }
}
