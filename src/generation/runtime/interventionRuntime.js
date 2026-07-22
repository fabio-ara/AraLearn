import { classifyProviderError } from "../providers/providerErrors.js";
import {
  isLocalProviderSelection,
  resolveConfiguredModelId
} from "../providers/providerRegistry.js";
import {
  assertInterventionResultScope,
  assertInterventionResumeScope,
  buildInterventionScopeSnapshot,
  InterventionScopeError
} from "../../assist/interventionScopeGuard.js";
import {
  appendInterventionRunStep,
  buildInterventionRunFeedbackText,
  createInterventionRun,
  normalizeInterventionRun
} from "./interventionRunState.js";
import { resolveGenerationLaunchConfig } from "./launchConfig.js";
import { resolveGenerationProviderReadiness } from "./generationViewModel.js";
import { generateMicrosequenceProjectDocument } from "./projectGenerationRuntime.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueTextList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function normalizePreferredResource(value = "") {
  const normalized = text(value);
  const lowered = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return lowered === "automatico" || lowered === "automatic" ? "" : normalized;
}

function classifyInterventionFailure(error) {
  if (error?.details && typeof error.details === "object") {
    return error.details;
  }
  const direct = classifyProviderError(error);
  if (direct?.category && direct.category !== "unknown") {
    return direct;
  }
  if (error?.cause) {
    return classifyInterventionFailure(error.cause);
  }
  return direct;
}

function safeClone(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
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

function buildRecommendedActionIntent({ draft = {}, status = "" } = {}) {
  if (status === "needs_new_microsequence") {
    return "branch_after_current";
  }
  if (text(draft?.actionIntent) === "next_planned") {
    return "next_planned";
  }
  if (text(draft?.operationMode) === "repair") {
    return "repair_current";
  }
  return "generate_current";
}

function buildContinuationMode(status = "") {
  if (status === "needs_new_microsequence") {
    return "next_microsequence";
  }
  if (status === "needs_retry" || status === "needs_continue_here" || status === "running") {
    return "same_microsequence";
  }
  return "none";
}

function buildInterventionFeedback({
  draft = {},
  assistConfig = {},
  status = "needs_retry",
  title = "Iteração pendente",
  message = "",
  run = null
} = {}) {
  const promptText = text(draft?.promptText);
  const normalizedRun = normalizeInterventionRun(run);
  const feedbackText = buildInterventionRunFeedbackText(normalizedRun) || text(message) || promptText;
  return {
    status,
    title,
    message,
    feedbackText,
    nextPromptDraft: promptText,
    rawFeedbackText: message,
    recommendedActionIntent: buildRecommendedActionIntent({ draft, status }),
    recommendedInterventionTargetMode: status === "needs_new_microsequence" ? "new_after_current" : "current",
    recommendedOperationMode: text(draft?.operationMode) === "repair" ? "repair" : "reinforce",
    continuationNeeded: !["completed", "blocked", "stale"].includes(status),
    continuationMode: buildContinuationMode(status),
    modelId: resolveConfiguredModelId({
      selectedModel: assistConfig?.model,
      customModelId: assistConfig?.customModelId
    }),
    promptText,
    attachmentNames: (Array.isArray(draft?.attachments) ? draft.attachments : []).map((item) => text(item?.name)).filter(Boolean),
    run: normalizedRun
  };
}

export function buildMicrosequencePrompt({
  promptText = "",
  preferredContainerLabel = "",
  interventionTargetMode = "current",
  desiredMicrosequenceTitle = "",
  currentMicrosequenceTitle = ""
} = {}) {
  const basePrompt = text(promptText);
  const lines = [basePrompt];
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
  if (interventionTargetMode === "new_after_current" && text(currentMicrosequenceTitle)) {
    lines.push(`Insira a nova etapa depois da microssequência atual "${text(currentMicrosequenceTitle)}", sem replanejar o restante da lição.`);
  }

  return lines.filter(Boolean).join("\n\n");
}

function buildPlanningRequestContext({
  draft = {},
  promptText = "",
  selectedRefIds = [],
  preferredContainerId = "",
  mode = "generate"
} = {}) {
  const preferredResource = normalizePreferredResource(preferredContainerId);
  return {
    mode: text(mode) === "repair" ? "repair" : "generate",
    prompt: text(promptText) || text(draft?.promptText),
    preferredResource,
    selectedRefs: uniqueTextList(selectedRefIds),
    extraResources: uniqueTextList([preferredResource])
  };
}

export function resolveMicrosequenceRequestConfig({
  promptText = "",
  operationMode = "",
  interventionTargetMode = "current",
  actionIntent = ""
} = {}) {
  if (text(actionIntent) === "next_planned") {
    return {
      operation: "generate_planned_next",
      requestedGenerationDepth: "planned_next_only",
      interventionModeHint: "planned_track_advance"
    };
  }
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
    interventionTargetMode,
    actionIntent: text(draft?.actionIntent)
  });
  const reason =
    text(draft?.promptText)
    || (interventionTargetMode === "new_after_current"
      ? "Inserir uma nova microssequência local coerente com a progressão atual."
      : "Intervir localmente na microssequência atual sem ampliar desnecessariamente o escopo.");
  const target =
    text(draft?.actionIntent) === "next_planned"
      ? {
          level: "microsequence",
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey
        }
      : interventionTargetMode === "new_after_current"
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
    recommendedAction:
      text(draft?.actionIntent) === "next_planned"
        ? "next_planned"
        : interventionTargetMode === "new_after_current"
          ? "needs_new_microsequence"
          : "suggest_editor_patch",
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
        type:
          text(draft?.actionIntent) === "next_planned"
            ? "fill_planned_microsequence"
            : interventionTargetMode === "new_after_current"
              ? "add_new_microsequence"
              : "patch_existing_material",
        operation: requestConfig.operation,
        patchStrategy:
          text(draft?.actionIntent) === "next_planned"
            ? "fill_existing_planned_microsequence"
            : interventionTargetMode === "new_after_current"
              ? "add_microsequence"
              : "patch_existing_microsequence",
        target,
        reason
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
  selectedRefIds = [],
  preferredContainerId = "",
  preferredContainerLabel = "",
  lessonContext = {},
  ingestAttachments,
  provider = null
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
  const ingestedAttachments = await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : []);
  const allowPromptlessSubmit = draft?.allowPromptlessSubmit === true;
  if (!rawPromptText && ingestedAttachments.extractedCount === 0 && text(draft?.actionIntent) !== "next_planned" && !allowPromptlessSubmit) {
    throw new Error("Informe um pedido ou anexo com texto utilizável antes de editar a microssequência.");
  }

  const promptText = buildMicrosequencePrompt({
    promptText:
      rawPromptText
      || (text(draft?.actionIntent) === "next_planned"
        ? "Preencha a próxima microssequência planejada."
        : allowPromptlessSubmit
          ? ""
          : ""),
    preferredContainerLabel,
    interventionTargetMode: text(draft?.interventionTargetMode),
    desiredMicrosequenceTitle: text(draft?.microsequenceTitle),
    currentMicrosequenceTitle: text(lessonContext?.currentMicrosequenceTitle)
  });
  const requestConfig = resolveMicrosequenceRequestConfig({
    promptText: rawPromptText,
    operationMode: text(draft?.operationMode),
    interventionTargetMode: text(draft?.interventionTargetMode),
    actionIntent: text(draft?.actionIntent)
  });
  const requestContext = buildPlanningRequestContext({
    draft,
    promptText,
    selectedRefIds,
    preferredContainerId,
    mode: requestConfig.operation
  });
  const launchConfig = resolveGenerationLaunchConfig({
    selectedModel: text(assistConfig.model) || "gemini-2.5-flash",
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
  const selectedModel = launchConfig.modelId;

  return {
    promptText,
    selectedModel,
    ingestedAttachments,
    launchConfig,
    requestConfig,
    requestContext
  };
}

function snapshotPreparedIntervention(prepared = {}, scopeSnapshot = null) {
  return safeClone({
    promptText: text(prepared?.promptText),
    selectedModel: text(prepared?.selectedModel),
    ingestedAttachments: prepared?.ingestedAttachments || {
      attachments: [],
      warnings: [],
      extractedCount: 0
    },
    requestConfig: prepared?.requestConfig || {},
    requestContext: prepared?.requestContext || {},
    scopeSnapshot
  }) || null;
}

function createInterventionRunController({
  previousRun = null,
  draft = {},
  assistConfig = {},
  onFeedback
} = {}) {
  const initialRun = previousRun?.runId ? normalizeInterventionRun(previousRun) : createInterventionRun();
  const attemptStartedAt = Date.now();
  const baseElapsedMs = Number(initialRun.elapsedMs || 0);
  let currentRun = initialRun;

  function elapsedMs() {
    return baseElapsedMs + Math.max(0, Date.now() - attemptStartedAt);
  }

  function publish(status, title, message) {
    const feedback = buildInterventionFeedback({
      draft,
      assistConfig,
      status,
      title,
      message,
      run: currentRun
    });
    if (typeof onFeedback === "function") {
      onFeedback(feedback);
    }
    return feedback;
  }

  function appendStep({
    stage = "",
    status = "ok",
    message = "",
    artifacts = {},
    resumeFrom = ""
  } = {}) {
    currentRun = appendInterventionRunStep(
      {
        ...currentRun,
        resumeFrom: text(resumeFrom) || currentRun.resumeFrom
      },
      {
        stage,
        status,
        message,
        elapsedMs: elapsedMs()
      },
      {
        artifacts
      }
    );
    if (status === "failed") {
      currentRun = {
        ...currentRun,
        resumeFrom: text(resumeFrom) || (stage === "validate" ? "compile" : stage)
      };
    }
    if (status === "ok" && stage === "complete") {
      currentRun = {
        ...currentRun,
        resumeFrom: "",
        currentStage: "complete"
      };
    }
    return currentRun;
  }

  return {
    get run() {
      return currentRun;
    },
    progress(event = {}) {
      appendStep(event);
      return publish("running", "Intervenção em andamento", text(event?.message) || "Processando a intervenção.");
    },
    fail({
      stage = "prepare",
      title = "Nova iteração necessária",
      message = "",
      status = "needs_retry",
      resumeFrom = ""
    } = {}) {
      const lastStep = Array.isArray(currentRun.steps) ? currentRun.steps[currentRun.steps.length - 1] : null;
      if (!lastStep || lastStep.status !== "failed" || lastStep.stage !== stage || lastStep.message !== message) {
        appendStep({
          stage,
          status: "failed",
          message,
          resumeFrom
        });
      } else if (text(resumeFrom)) {
        currentRun = {
          ...currentRun,
          resumeFrom: text(resumeFrom)
        };
      }
      return publish(status, title, message);
    },
    complete(message = "Entrega concluída.") {
      return publish("completed", "Entrega concluída", message);
    }
  };
}

export async function executeMicrosequenceGeneration({
  selection = {},
  draft = {},
  assistConfig = {},
  selectedRefIds = [],
  preferredContainerId = "",
  preferredContainerLabel = "",
  lessonContext = {},
  projectDocument = {},
  checkCodexLocalHealth,
  ingestAttachments,
  provider,
  resumeSession = null,
  onFeedback
} = {}) {
  const resumeRun = normalizeInterventionRun(resumeSession?.run);
  const runController = createInterventionRunController({
    previousRun: resumeRun,
    draft,
    assistConfig,
    onFeedback
  });
  const isResuming = Boolean(resumeRun?.runId) && Boolean(resumeRun?.resumeFrom);
  if (isResuming && resumeRun.resumeFrom !== "prepare") {
    runController.progress({
      stage: "resume",
      status: "started",
      message: `Retomando da etapa ${resumeRun.resumeFrom}.`,
      artifacts: {
        resumeFrom: resumeRun.resumeFrom
      }
    });
  } else {
    runController.progress({
      stage: "prepare",
      status: "started",
      message: "Preparando contexto local."
    });
  }

  const readiness = await resolveGenerationProviderReadiness({
    selectedModel: assistConfig.model,
    providerProtocol: assistConfig.providerProtocol,
    customModelId: assistConfig.customModelId,
    apiKey: assistConfig.apiKey,
    baseUrl: assistConfig.baseUrl,
    codexEndpoint: assistConfig.codexEndpoint,
    codexToken: assistConfig.codexToken,
    providerEndpoint: assistConfig.providerEndpoint,
    providerSecret: assistConfig.providerSecret,
    provider,
    checkCodexLocalHealth
  });

  if (!readiness.ok && isLocalProviderSelection({
    selectedModel: assistConfig.model,
    providerProtocol: assistConfig.providerProtocol
  })) {
    const interventionFeedback = runController.fail({
      stage: "prepare",
      status: "blocked",
      title: "Provider indisponível",
      message: readiness.error || "O bridge local não está ativo.",
      resumeFrom: "prepare"
    });
    return {
      status: "provider-unready",
      errorMessage: readiness.error || "O bridge local não está ativo.",
      interventionFeedback
    };
  }

  if (!readiness.ok) {
    const interventionFeedback = runController.fail({
      stage: "prepare",
      status: "blocked",
      title: "Configuração inválida",
      message: readiness.error || "Revise a configuração do serviço de linguagem.",
      resumeFrom: "prepare"
    });
    return {
      status: "provider-unready",
      errorMessage: readiness.error || "Revise a configuração do serviço de linguagem.",
      interventionFeedback
    };
  }

  try {
    const savedPreparation =
      isResuming && resumeRun.resumeFrom !== "prepare"
        ? resumeRun.artifacts?.preparedIntervention
        : null;
    const scopeSnapshot = savedPreparation
      ? assertInterventionResumeScope({
          savedSnapshot: savedPreparation.scopeSnapshot,
          projectDocument,
          selection
        })
      : buildInterventionScopeSnapshot(projectDocument, selection);
    const preparedIntervention = savedPreparation
      ? {
          ...savedPreparation,
          launchConfig: resolveGenerationLaunchConfig({
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
          })
        }
      : await prepareMicrosequenceGeneration({
            selection,
            draft,
            assistConfig,
            selectedRefIds,
            preferredContainerId,
            preferredContainerLabel,
            lessonContext,
            ingestAttachments,
            provider
          });
    if (savedPreparation) {
      runController.progress({
        stage: "prepare",
        status: "ok",
        message: "Contexto local reaproveitado da etapa anterior.",
        artifacts: {
          preparedIntervention
        }
      });
    } else {
      runController.progress({
        stage: "prepare",
        status: "ok",
        message: "Contexto local preparado.",
        artifacts: {
          preparedIntervention: snapshotPreparedIntervention(preparedIntervention, scopeSnapshot)
        }
      });
    }
    const generationResult = await generateMicrosequenceProjectDocument({
      selection,
      draft: {
        ...draft,
        promptText: preparedIntervention.promptText,
        requestedGenerationDepth: preparedIntervention.requestConfig?.requestedGenerationDepth || draft?.requestedGenerationDepth
      },
      projectDocument,
      preparedIntervention,
      resumeState: runController.run,
      onProgress: (event = {}) => {
        runController.progress(event);
      }
    });
    const guardedTarget = assertInterventionResultScope({
      previousProjectDocument: projectDocument,
      nextProjectDocument: generationResult.projectDocument,
      selection,
      targetMicrosequenceKey: generationResult.patch?.target?.microsequenceKey,
      targetMode: draft?.interventionTargetMode,
      actionIntent: draft?.actionIntent
    });
    generationResult.patch = {
      ...generationResult.patch,
      guardedScope: guardedTarget
    };
    const interventionFeedback = runController.complete("Fluxo concluído.");
    return {
      status: "success",
      generationResult: {
        ...generationResult,
        interventionFeedback
      },
      preparedIntervention
    };
  } catch (error) {
    const details = classifyInterventionFailure(error);
    const isAuthError = details?.category === "auth_error";
    const isScopeError = error instanceof InterventionScopeError;
    const isStaleScope = isScopeError && error.code === "STALE_INTERVENTION_SCOPE";
    const authMessage = isAuthError
      ? "Erro de autenticação do provider. Revise a chave API e a configuração do modelo antes de tentar de novo."
      : "";
    const message = authMessage || (error instanceof Error ? error.message : "Falha ao chamar o serviço de IA.");
    const currentStage = text(runController.run?.resumeFrom) || text(runController.run?.currentStage) || "prepare";
    return {
      status: isAuthError ? "auth-error" : isStaleScope ? "stale" : isScopeError ? "scope-error" : "error",
      errorMessage: message,
      shouldOpenProviderConfig: isAuthError,
      interventionFeedback: runController.fail({
        stage: currentStage,
        status: isAuthError || isScopeError ? (isStaleScope ? "stale" : "blocked") : "needs_retry",
        title: isAuthError
          ? "Configuração do provider necessária"
          : isStaleScope
            ? "Conteúdo alterado"
            : isScopeError
              ? "Intervenção bloqueada"
              : "Nova iteração necessária",
        message,
        resumeFrom: currentStage
      })
    };
  }
}
