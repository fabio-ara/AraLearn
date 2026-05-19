import { isCodexLocalModel } from "../providers/codexCliConfig.js";
import { resolveGenerationLaunchConfig } from "./launchConfig.js";
import { resolveGenerationProviderReadiness } from "./generationViewModel.js";
import { generateMicrosequenceProjectDocument } from "./projectGenerationRuntime.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueTextList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
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

export function buildMicrosequencePrompt({
  promptText = "",
  dependencyTitles = [],
  selectedDidacticTypeId = "",
  preferredContainerLabel = "",
  interventionType = "",
  interventionTargetMode = "current",
  domainRef = "",
  relatedConceptRefs = [],
  prerequisiteRefs = [],
  bridgeTargetRef = "",
  desiredMicrosequenceTitle = "",
  currentMicrosequenceTitle = ""
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
  if (text(desiredMicrosequenceTitle)) {
    lines.push(
      interventionTargetMode === "new_after_current"
        ? `Use "${text(desiredMicrosequenceTitle)}" como título da nova microssequência, salvo se houver conflito didático forte.`
        : `Preserve "${text(desiredMicrosequenceTitle)}" como título da microssequência, salvo se o ajuste didático exigir mudança mínima.`
    );
  }
  if (text(interventionType)) {
    lines.push(`A intervenção local deve priorizar o padrão didático "${text(interventionType)}".`);
  }
  if (text(domainRef)) {
    lines.push(`Conceito-alvo obrigatório: ${text(domainRef)}.`);
  }
  if (uniqueTextList(relatedConceptRefs).length >= 2) {
    lines.push(`Contraste explicitamente os conceitos: ${uniqueTextList(relatedConceptRefs).join(", ")}.`);
  }
  if (uniqueTextList(prerequisiteRefs).length) {
    lines.push(`Prepare explicitamente estes pré-requisitos antes da cobrança principal: ${uniqueTextList(prerequisiteRefs).join(", ")}.`);
  }
  if (text(bridgeTargetRef)) {
    lines.push(`A ponte guiada deve levar claramente até: ${text(bridgeTargetRef)}.`);
  }
  if (interventionTargetMode === "new_after_current" && text(currentMicrosequenceTitle)) {
    lines.push(`Insira a nova etapa depois da microssequência atual "${text(currentMicrosequenceTitle)}", sem replanejar o restante da lição.`);
  }

  return lines.filter(Boolean).join("\n\n");
}

export function resolveMicrosequenceRequestConfig({
  promptText = "",
  operationMode = "",
  interventionTargetMode = "current"
} = {}) {
  const normalizedOperationMode = text(operationMode);
  const operation =
    interventionTargetMode === "new_after_current"
      ? "extend"
      : normalizedOperationMode === "repair" || normalizedOperationMode === "reinforce"
        ? normalizedOperationMode
        : inferLocalOperation(promptText);
  return {
    operation,
    requestedGenerationDepth: operation === "repair" ? "repair_only" : "reinforce_only",
    interventionModeHint:
      interventionTargetMode === "new_after_current"
        ? "targeted_scope_expansion"
        : "targeted_single_microsequence"
  };
}

export function buildInterventionRequestFromDraft({
  selection = {},
  draft = {},
  lessonContext = {}
} = {}) {
  const courseKey = text(selection?.courseKey);
  const moduleKey = text(selection?.moduleKey);
  const lessonKey = text(selection?.lessonKey);
  const microsequenceKey = text(selection?.microsequenceKey);
  const interventionTargetMode = text(draft?.interventionTargetMode) === "new_after_current" ? "new_after_current" : "current";
  const requestConfig = resolveMicrosequenceRequestConfig({
    promptText: text(draft?.promptText),
    operationMode: text(draft?.operationMode),
    interventionTargetMode
  });
  const interventionType = text(draft?.interventionType) || "local_semantic_rewrite";
  const reason =
    text(draft?.promptText)
    || (interventionTargetMode === "new_after_current"
      ? "Inserir uma nova microssequência local coerente com a progressão atual."
      : "Intervir localmente na microssequência atual sem ampliar desnecessariamente o escopo.");
  const target =
    interventionTargetMode === "new_after_current"
      ? {
          level: "lesson",
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey: ""
        }
      : {
          level: "microsequence",
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey
        };
  const lessonMicrosequenceKeys = uniqueTextList([
    microsequenceKey,
    ...(Array.isArray(lessonContext?.microsequenceKeys) ? lessonContext.microsequenceKeys : [])
  ]);

  return {
    kind: "intervention_request",
    status: "ready",
    source: "editor_surface",
    recommendedAction: interventionTargetMode === "new_after_current" ? "needs_new_microsequence" : "suggest_editor_patch",
    studentPrompt: text(draft?.promptText),
    responseText: "",
    studyTrackConnection: "",
    rationale: reason,
    target,
    editorIntent: {
      operation: requestConfig.operation,
      generationDepthHint: requestConfig.requestedGenerationDepth,
      interventionModeHint: requestConfig.interventionModeHint,
      requestedBy: "editor"
    },
    requestedChanges: [
      {
        changeId: "requested_change_1",
        type: interventionTargetMode === "new_after_current" ? "add_new_microsequence" : "patch_existing_material",
        operation: requestConfig.operation,
        patchStrategy: interventionTargetMode === "new_after_current" ? "add_microsequence" : "patch_existing_microsequence",
        didacticInterventionType: interventionType,
        target,
        reason,
        domainRef: text(draft?.domainRef),
        relatedConceptRefs: uniqueTextList(draft?.relatedConceptRefs),
        bridgeTargetRef: text(draft?.bridgeTargetRef),
        prerequisiteRefs: uniqueTextList(draft?.prerequisiteRefs)
      }
    ],
    contextSnapshot: {
      lessonKeys: lessonKey ? [lessonKey] : [],
      microsequenceKeys: lessonMicrosequenceKeys,
      reusableMicrosequenceCount: Math.max(0, Number(lessonContext?.reusableMicrosequenceCount || lessonMicrosequenceKeys.length))
    }
  };
}

export async function prepareMicrosequenceGeneration({
  selection = {},
  draft = {},
  assistConfig = {},
  dependencyTitles = [],
  selectedDidacticTypeId = "",
  preferredContainerLabel = "",
  lessonContext = {},
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

  const promptText = buildMicrosequencePrompt({
    promptText: rawPromptText,
    dependencyTitles,
    selectedDidacticTypeId,
    preferredContainerLabel,
    interventionType: text(draft?.interventionType),
    interventionTargetMode: text(draft?.interventionTargetMode),
    domainRef: text(draft?.domainRef),
    relatedConceptRefs: uniqueTextList(draft?.relatedConceptRefs),
    prerequisiteRefs: uniqueTextList(draft?.prerequisiteRefs),
    bridgeTargetRef: text(draft?.bridgeTargetRef),
    desiredMicrosequenceTitle: text(draft?.microsequenceTitle),
    currentMicrosequenceTitle: text(lessonContext?.currentMicrosequenceTitle)
  });
  const requestConfig = resolveMicrosequenceRequestConfig({
    promptText: rawPromptText,
    operationMode: text(draft?.operationMode),
    interventionTargetMode: text(draft?.interventionTargetMode)
  });
  const interventionRequest = buildInterventionRequestFromDraft({
    selection,
    draft: {
      ...draft,
      promptText: promptText
    },
    lessonContext
  });
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
    requestConfig,
    request: {
      intent: {
        scope: {
          level: interventionRequest.target.level,
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey: interventionRequest.target.level === "microsequence" ? microsequenceKey : ""
        },
        promptText,
        attachments: ingestedAttachments.attachments,
        operation: requestConfig.operation,
        requestedGenerationDepth: requestConfig.requestedGenerationDepth,
        interventionRequest,
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

export async function executeMicrosequenceGeneration({
  selection = {},
  draft = {},
  assistConfig = {},
  dependencyTitles = [],
  selectedDidacticTypeId = "",
  preferredContainerLabel = "",
  lessonContext = {},
  projectDocument = {},
  checkCodexLocalHealth,
  ingestAttachments,
  provider
} = {}) {
  const readiness = await resolveGenerationProviderReadiness({
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
    const preparedIntervention = await prepareMicrosequenceGeneration({
      selection,
      draft,
      assistConfig,
      dependencyTitles,
      selectedDidacticTypeId,
      preferredContainerLabel,
      lessonContext,
      ingestAttachments
    });
    const generationResult = await generateMicrosequenceProjectDocument({
      selection,
      draft,
      assistConfig,
      projectDocument,
      provider,
      dependencyTitles,
      selectedDidacticTypeId,
      preferredContainerLabel,
      ingestAttachments
    });
    return {
      status: "success",
      generationResult,
      preparedIntervention
    };
  } catch (error) {
    return {
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Falha ao chamar o serviço de IA."
    };
  }
}
