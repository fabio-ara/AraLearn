import { classifyProviderError } from "../providers/providerErrors.js";
import {
  isReconstructibleStructuredOutputError
} from "../providers/structuredOutput.js";
import {
  isLocalProviderSelection,
  resolveConfiguredModelId
} from "../providers/providerRegistry.js";
import { resolveCardAssistanceLaunchConfig } from "./cardAssistanceLaunchConfig.js";
import { resolveCardAssistanceProviderReadiness } from "./cardAssistanceConfig.js";
import {
  applyCardAssistanceChangeSet,
  buildCardAssistanceScopeSnapshot,
  CardAssistanceScopeError,
  listCardAssistanceTextPaths,
  projectCardAssistanceTextChange,
  resolveCardAssistanceContext
} from "../../assist/cardAssistanceScope.js";
import {
  cardAssistanceSemanticFindingKey,
  validateCardAssistanceSemantics
} from "../validation/cardAssistanceSemantics.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../resources/packages/index.js";

const MAX_USER_REQUEST_CHARACTERS = 12000;
const MAX_PROVIDER_PROMPT_CHARACTERS = 64000;
const MAX_CONTEXT_INDEX_ITEMS = 36;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function boundedText(value, maxCharacters) {
  return String(value || "").slice(0, maxCharacters);
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CardAssistanceScopeError(message, "INVALID_CARD_ASSISTANCE_RESULT");
  }
}

function boundedValue(value, maxCharacters) {
  if (value === null || value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxCharacters) return clone(value);
  return {
    id: text(value?.id),
    title: text(value?.title),
    role: text(value?.role),
    packageIds: [
      ...(value?.content || []),
      ...(value?.response ? [value.response] : []),
      ...(value?.feedback || [])
    ].map((instance) => text(instance?.package)).filter(Boolean),
    sources: Array.isArray(value?.sources)
      ? value.sources.map(text).filter(Boolean).slice(0, 24)
      : [],
    excerpt: serialized.slice(0, maxCharacters)
  };
}

function boundedContextValue(value, maxCharacters) {
  if (value === null || value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxCharacters) return clone(value);
  return {
    truncated: true,
    excerpt: serialized.slice(0, maxCharacters)
  };
}

function boundedGuideValue(value, maxCharacters, guideLabel) {
  if (value === null || value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxCharacters) return clone(value);
  const remainder = clone(value);
  delete remainder.exclude;
  delete remainder.avoid;
  const barrierEnvelope = {
    truncated: true,
    ...(Array.isArray(value.exclude) ? { exclude: clone(value.exclude) } : {}),
    ...(Array.isArray(value.avoid) ? { avoid: clone(value.avoid) } : {})
  };
  if (JSON.stringify(barrierEnvelope).length > maxCharacters) {
    throw new CardAssistanceScopeError(
      `As barreiras exclude/avoid do guide ${guideLabel} excedem o limite seguro de ${maxCharacters} caracteres em JSON; reduza-as antes de usar a assistência.`,
      "INVALID_CARD_ASSISTANCE_REQUEST"
    );
  }
  const envelope = { ...barrierEnvelope, excerpt: "" };
  if (JSON.stringify(envelope).length > maxCharacters) return barrierEnvelope;
  const excerptSource = JSON.stringify(remainder);
  let minimum = 0;
  let maximum = excerptSource.length;
  let result = envelope;
  while (minimum <= maximum) {
    const length = Math.floor((minimum + maximum) / 2);
    const candidate = { ...envelope, excerpt: excerptSource.slice(0, length) };
    if (JSON.stringify(candidate).length <= maxCharacters) {
      result = candidate;
      minimum = length + 1;
    } else {
      maximum = length - 1;
    }
  }
  return result;
}

function compactCardIndexItem(card, index) {
  return {
    index,
    id: text(card?.id),
    position: Number(card?.position ?? index + 1),
    title: boundedText(card?.title, 300),
    role: text(card?.role),
    packages: [
      ...(card?.content || []),
      ...(card?.response ? [card.response] : []),
      ...(card?.feedback || [])
    ].map((instance) => text(instance?.package)).filter(Boolean)
  };
}

function compactMicrosequenceIndexItem(microsequence, index) {
  return {
    index,
    id: text(microsequence?.id),
    title: boundedText(microsequence?.title, 300),
    goal: boundedText(microsequence?.goal, 800),
    role: text(microsequence?.role),
    dependsOn: boundedContextValue(microsequence?.dependsOn || [], 900),
    covers: boundedContextValue(microsequence?.covers || [], 900),
    checks: boundedContextValue(microsequence?.checks || [], 900),
    errors: boundedContextValue(microsequence?.errors || [], 900),
    cardCount: Array.isArray(microsequence?.cards) ? microsequence.cards.length : 0
  };
}

function compactLocalIndex(items, focusId, summarize) {
  const source = Array.isArray(items) ? items : [];
  const focusIndex = source.findIndex((item) => text(item?.id) === text(focusId));
  let indices;
  if (source.length <= MAX_CONTEXT_INDEX_ITEMS) {
    indices = source.map((_, index) => index);
  } else {
    const selected = new Set([
      ...source.slice(0, 5).map((_, index) => index),
      ...source.slice(-5).map((_, index) => source.length - 5 + index)
    ]);
    if (focusIndex >= 0) {
      for (let offset = -6; offset <= 6; offset += 1) {
        const candidate = focusIndex + offset;
        if (candidate >= 0 && candidate < source.length) selected.add(candidate);
      }
    }
    for (
      let index = 0;
      index < source.length && selected.size < MAX_CONTEXT_INDEX_ITEMS;
      index += 1
    ) {
      selected.add(index);
    }
    indices = [...selected]
      .sort((left, right) => left - right)
      .slice(0, MAX_CONTEXT_INDEX_ITEMS);
  }
  return {
    totalItems: source.length,
    focusIndex,
    truncated: indices.length < source.length,
    items: indices.map((index) => summarize(source[index], index))
  };
}

function omitSelectedPackagesFromReadOnlyCard(card, targetIds = []) {
  const omittedTargetIds = new Set(
    (Array.isArray(targetIds) ? targetIds : []).map(text).filter(Boolean)
  );
  if (!omittedTargetIds.size) return card;
  const readOnlyCard = clone(card);
  const omitInstanceData = (instance, slot) => (
    omittedTargetIds.has(`${slot}:${text(instance?.id)}`)
      ? {
          id: instance.id,
          package: instance.package,
          version: instance.version,
          selectedWritableContentOmitted: true
        }
      : instance
  );
  readOnlyCard.content = (readOnlyCard.content || [])
    .map((instance) => omitInstanceData(instance, "content"));
  if (readOnlyCard.response) {
    readOnlyCard.response = omitInstanceData(readOnlyCard.response, "response");
  }
  readOnlyCard.feedback = (readOnlyCard.feedback || [])
    .map((instance) => omitInstanceData(instance, "feedback"));
  readOnlyCard.selectedWritableContentOmitted = [...omittedTargetIds];
  return readOnlyCard;
}

function serializeAssistanceEnvelope(envelope) {
  const serialized = JSON.stringify(envelope);
  if (serialized.length > MAX_PROVIDER_PROMPT_CHARACTERS) {
    throw new CardAssistanceScopeError(
      `O recorte selecionado excede o limite seguro de ${MAX_PROVIDER_PROMPT_CHARACTERS} caracteres; reduza a seleção.`,
      "INVALID_CARD_ASSISTANCE_REQUEST"
    );
  }
  return serialized;
}

function normalizedUserRequest(value) {
  const request = text(value);
  if (request.length > MAX_USER_REQUEST_CHARACTERS) {
    throw new CardAssistanceScopeError(
      `O pedido deve ter no máximo ${MAX_USER_REQUEST_CHARACTERS} caracteres; reduza o texto antes de enviar.`,
      "INVALID_CARD_ASSISTANCE_REQUEST"
    );
  }
  return request;
}

export function buildCardAssistanceContextPacket(
  projectDocument = {},
  selection = {},
  {
    operation = "repair",
    didacticProfileId = "",
    didacticPolicy = {},
    resourceTargetIds = []
  } = {}
) {
  const context = resolveCardAssistanceContext(projectDocument, selection);
  const readOnlyCurrentCard = omitSelectedPackagesFromReadOnlyCard(
    context.card,
    resourceTargetIds
  );
  return {
    contract: "aralearn.card-assistance-context.v1",
    hierarchy: {
      course: {
        id: context.course.id,
        title: boundedText(context.course.title, 300),
        goal: boundedText(context.course.goal, 1800)
      },
      module: {
        id: context.moduleValue.id,
        title: boundedText(context.moduleValue.title, 300),
        guide: boundedGuideValue(context.moduleValue.guide || null, 3500, "do módulo")
      },
      lesson: {
        id: context.lesson.id,
        title: boundedText(context.lesson.title, 300),
        guide: boundedGuideValue(context.lesson.guide || null, 3500, "da lição"),
        topics: boundedContextValue(context.lesson.topics || [], 3500)
      },
      microsequence: {
        id: context.microsequence.id,
        title: boundedText(context.microsequence.title, 300),
        goal: boundedText(context.microsequence.goal, 1800),
        role: boundedText(context.microsequence.role, 80),
        dependsOn: boundedContextValue(context.microsequence.dependsOn || [], 1800),
        covers: boundedContextValue(context.microsequence.covers || [], 1800),
        checks: boundedContextValue(context.microsequence.checks || [], 1800),
        errors: boundedContextValue(context.microsequence.errors || [], 1800)
      }
    },
    didacticPolicy: {
      profileId: text(didacticProfileId),
      targetStudentProfile: text(didacticPolicy?.targetStudentProfile),
      courseSemantics: boundedContextValue(didacticPolicy?.courseSemantics || null, 2500)
    },
    cards: {
      previous: boundedValue(context.previousCard, 3500),
      current: boundedValue(readOnlyCurrentCard, operation === "repair" ? 14000 : 8000),
      next: boundedValue(context.nextCard, 3500)
    },
    indexes: {
      lesson: compactLocalIndex(
        context.lesson.microsequences,
        context.microsequence.id,
        compactMicrosequenceIndexItem
      ),
      microsequence: compactLocalIndex(
        context.microsequence.cards,
        context.card.id,
        compactCardIndexItem
      )
    }
  };
}

async function callStructured(provider, request, modelId, attempt = 1) {
  const result = await provider.generateStructured({
    ...request,
    modelId,
    ...(attempt > 1 ? { maxAttempts: 1 } : {})
  });
  return result?.value;
}

async function callStructuredWithValidation({
  provider,
  modelId,
  buildRequest,
  validate,
  onProgress,
  reconstructionBudget = { remaining: 1 }
}) {
  let feedback = [];
  function scheduleReconstruction(error, request, attempt) {
    if (attempt >= 2 || Number(reconstructionBudget.remaining) < 1) return false;
    reconstructionBudget.remaining -= 1;
    feedback = [error instanceof Error ? error.message : "Saída estruturada inválida."];
    onProgress?.({
      stage: request.phase,
      status: "retry",
      message: "A saída não passou na validação; reconstruindo somente o alvo.",
      attempt: attempt + 1
    });
    return true;
  }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const request = buildRequest(feedback);
    let value;
    try {
      value = await callStructured(provider, request, modelId, attempt);
    } catch (error) {
      if (
        !isReconstructibleStructuredOutputError(error)
        || !scheduleReconstruction(error, request, attempt)
      ) {
        throw error;
      }
      continue;
    }
    try {
      return validate(value, { attempt, request });
    } catch (error) {
      if (!scheduleReconstruction(error, request, attempt)) throw error;
    }
  }
  throw new Error("Não foi possível validar a saída estruturada.");
}

function assertCardAssistanceSemantics(card, contextPacket) {
  const result = validateCardAssistanceSemantics(card, contextPacket);
  if (!result.ok) {
    const gapLeak = (result.findings || []).find(
      (finding) => finding.code === "gap_answer_leak"
    );
    const error = new CardAssistanceScopeError(
      [
        result.errors[0] || "O card não respeita o contexto didático autorizado.",
        ...(gapLeak
          ? [
              "Reconstrua enunciado, resposta e distratores em conjunto: a lacuna deve exigir uma inferência, e não repetir literal ou simbolicamente um dado visível antes da tentativa."
            ]
          : [])
      ].join(" "),
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
    error.semanticFindings = clone(result.findings || []);
    throw error;
  }
  return card;
}

function assertResourceRepairSemantics(beforeCard, afterCard, contextPacket) {
  const before = validateCardAssistanceSemantics(beforeCard, contextPacket);
  const after = validateCardAssistanceSemantics(afterCard, contextPacket);
  const remainingBaseline = new Map();
  (before.findings || []).forEach((finding) => {
    const key = cardAssistanceSemanticFindingKey(finding);
    remainingBaseline.set(key, (remainingBaseline.get(key) || 0) + 1);
  });
  const regressions = (after.findings || []).filter((finding) => {
    const key = cardAssistanceSemanticFindingKey(finding);
    const remaining = remainingBaseline.get(key) || 0;
    if (remaining <= 0) return true;
    remainingBaseline.set(key, remaining - 1);
    return false;
  });
  if (regressions.length) {
    throw new CardAssistanceScopeError(
      regressions[0].message
        || "O reparo introduziu uma nova violação semântica no resource selecionado.",
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
  return afterCard;
}

function exactPackageInstanceSchema(instance) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "package", "version", "data"],
    properties: {
      id: { const: instance.id },
      package: { const: instance.package },
      version: { const: instance.version },
      data: RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
        instance.package,
        instance.version
      ).schema
    }
  };
}

function exactPackageInstanceListSchema(instances) {
  const list = Array.isArray(instances) ? instances : [];
  return {
    type: "array",
    minItems: list.length,
    maxItems: list.length,
    items: list.length === 1
      ? exactPackageInstanceSchema(list[0])
      : { anyOf: list.map(exactPackageInstanceSchema) }
  };
}

function packageCardRepairSchema(card) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["message", "card"],
    properties: {
      message: {
        type: "string",
        minLength: 1,
        maxLength: 800
      },
      card: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "position",
          "title",
          "role",
          "content",
          "response",
          "feedback",
          "topics",
          "sources"
        ],
        properties: {
          id: { const: card.id },
          position: { const: card.position },
          title: { type: "string", minLength: 1 },
          role: { const: card.role },
          content: exactPackageInstanceListSchema(card.content),
          response: card.response
            ? exactPackageInstanceSchema(card.response)
            : { type: "null" },
          feedback: exactPackageInstanceListSchema(card.feedback),
          topics: { const: card.topics },
          sources: { const: card.sources }
        }
      }
    }
  };
}

async function generatePackageCardRepair({
  provider,
  modelId,
  contextPacket,
  userRequest,
  context,
  snapshot,
  conversationTurns,
  onProgress
}) {
  const repairScope = snapshot.target.repairScope;
  const targets = snapshot.target.resources || [];
  return callStructuredWithValidation({
    provider,
    modelId,
    buildRequest: (feedback) => ({
      phase: "package_card_assistance_repair",
      system: "Repare somente as folhas textuais autorizadas do card. Preserve identidades, packages, versões, estrutura e respostas formais. Considere priorRepairConversation como continuidade já aplicada e trate userRequest como a instrução mais recente; o currentCard é sempre o estado vigente. Em message, responda brevemente ao usuário, dizendo o que foi ajustado sem alegar mudanças que não estejam no card devolvido. Responda somente no schema.",
      prompt: serializeAssistanceEnvelope({
        contract: "aralearn.package-card-assistance.v1",
        userRequest: normalizedUserRequest(userRequest),
        repairScope,
        selectedPackageTargets: targets.map(({ targetId }) => targetId),
        priorRepairConversation: Array.isArray(conversationTurns) ? conversationTurns : [],
        writableTextPaths: listCardAssistanceTextPaths(context.card, {
          repairScope,
          targets
        }),
        currentCard: context.card,
        readOnlyContext: contextPacket,
        validationFeedback: feedback.slice(-1)
      }),
      schemaName: "aralearn_package_card_repair_v1",
      schema: packageCardRepairSchema(context.card),
      temperature: feedback.length ? 0 : 0.1,
      maxTokens: 5200
    }),
    validate: (value) => {
      assertPlainObject(value?.card, "O reparo não devolveu o card.");
      const assistantMessage = text(value?.message);
      if (!assistantMessage) {
        throw new CardAssistanceScopeError(
          "O reparo não explicou brevemente o resultado.",
          "INVALID_CARD_ASSISTANCE_RESULT"
        );
      }
      return {
        assistantMessage,
        card: projectCardAssistanceTextChange(context.card, value.card, {
          repairScope,
          targets
        })
      };
    },
    onProgress,
    reconstructionBudget: { remaining: 1 }
  });
}

export async function generateCardAssistanceChangeSet({
  projectDocument = {},
  selection = {},
  request = {},
  provider,
  modelId,
  didacticProfileId = "",
  didacticPolicy = {},
  onProgress
} = {}) {
  if (typeof provider?.generateStructured !== "function") {
    throw new Error("O provider selecionado não oferece saída estruturada.");
  }
  const snapshot = await buildCardAssistanceScopeSnapshot(
    projectDocument,
    selection,
    request
  );
  const context = resolveCardAssistanceContext(projectDocument, selection);
  if (!Array.isArray(context.card?.content)) {
    throw new CardAssistanceScopeError(
      "A assistência aceita exclusivamente cards canônicos compostos por packages.",
      "INVALID_CARD_ASSISTANCE_REQUEST"
    );
  }
  const contextPacket = buildCardAssistanceContextPacket(projectDocument, selection, {
    operation: snapshot.target.operation,
    didacticProfileId,
    didacticPolicy,
    resourceTargetIds: snapshot.target.repairScope === "resources"
      ? snapshot.target.resources.map((target) => target.targetId)
      : []
  });
  const beforeCard = context.card;
  const repair = await generatePackageCardRepair({
    provider,
    modelId,
    contextPacket,
    userRequest: request.promptText,
    context,
    snapshot,
    conversationTurns: request.conversationTurns,
    onProgress
  });
  const card = repair.card;
  const validatedCard = snapshot.target.repairScope === "resources"
    ? assertResourceRepairSemantics(beforeCard, card, contextPacket)
    : assertCardAssistanceSemantics(card, contextPacket);
  const changeSet = {
    contract: "aralearn.card-assistance-change.v1",
    operation: snapshot.target.operation,
    card: validatedCard
  };
  await applyCardAssistanceChangeSet({
    projectDocument,
    selection,
    snapshot,
    changeSet
  });
  return {
    contract: "aralearn.card-assistance-generated-change.v1",
    snapshot,
    changeSet,
    assistantMessage: repair.assistantMessage,
    diagnostics: { modelId, contextContract: contextPacket.contract }
  };
}

function classifyFailure(error) {
  if (error?.details && typeof error.details === "object") return error.details;
  const direct = classifyProviderError(error);
  if (direct?.category && direct.category !== "unknown") return direct;
  return error?.cause ? classifyFailure(error.cause) : direct;
}

export async function executeCardAssistance({
  projectDocument = {},
  selection = {},
  request = {},
  assistConfig = {},
  provider = null,
  checkCodexLocalHealth,
  onProgress
} = {}) {
  const promptText = text(request.promptText);
  if (!promptText) {
    return {
      status: "error",
      errorMessage: "Descreva a alteração desejada."
    };
  }
  const readiness = await resolveCardAssistanceProviderReadiness({
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
  if (!readiness.ok) {
    return {
      status: "provider-unready",
      errorMessage: readiness.error || (
        isLocalProviderSelection({
          selectedModel: assistConfig.model,
          providerProtocol: assistConfig.providerProtocol
        })
          ? "O serviço local não está ativo."
          : "Revise a configuração do serviço de linguagem."
      )
    };
  }
  try {
    const launchConfig = resolveCardAssistanceLaunchConfig({
      selectedModel: text(assistConfig.model),
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
    const change = await generateCardAssistanceChangeSet({
      projectDocument,
      selection,
      request: { ...request, promptText },
      provider: launchConfig.provider,
      modelId: launchConfig.modelId,
      didacticProfileId: launchConfig.didacticProfileId,
      didacticPolicy: launchConfig.didacticPolicy,
      onProgress
    });
    return {
      status: "success",
      change,
      modelId: launchConfig.modelId
    };
  } catch (error) {
    const details = classifyFailure(error);
    const isAuthError = details?.category === "auth_error";
    const isStale = error?.code === "STALE_CARD_ASSISTANCE_SCOPE";
    return {
      status: isAuthError ? "auth-error" : isStale ? "stale" : "error",
      errorMessage: isAuthError
        ? "Erro de autenticação do provider. Revise a credencial e o modelo."
        : error instanceof Error
          ? error.message
          : "Falha ao chamar o serviço de linguagem.",
      shouldOpenProviderConfig: isAuthError
    };
  }
}

export function resolveCardAssistanceModelId(assistConfig = {}) {
  return resolveConfiguredModelId({
    selectedModel: assistConfig.model,
    customModelId: assistConfig.customModelId
  });
}
