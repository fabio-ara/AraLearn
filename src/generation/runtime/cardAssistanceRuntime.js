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
  applyCardAssistanceTextEdits,
  buildCardAssistanceScopeSnapshot,
  CardAssistanceScopeError,
  listCardAssistanceTextEntries,
  listCardResourceTargets,
  resolveCardAssistanceContext
} from "../../assist/cardAssistanceScope.js";
import {
  CARD_ASSISTANCE_OPERATIONS,
  normalizeCardAssistanceOperation
} from "../../assist/cardAssistanceOperations.js";
import {
  cardAssistanceCandidatePrompt,
  queryCardAssistanceCatalog
} from "../../assist/cardAssistanceCatalog.js";
import {
  cardAssistanceSemanticFindingKey,
  validateCardAssistanceSemantics
} from "../validation/cardAssistanceSemantics.js";
import {
  buildCardAssistanceAuthoringCardSchema,
  compileAndValidateAuthoringCard
} from "../engine/cardAuthoringSchema.js";
import { RESOURCE_CATALOG } from "../../resources/catalog/resourceCatalog.js";
import {
  appendCardAssistanceLedgerTurn,
  assertCardAssistanceLedgerCurrent,
  cardAssistanceLedgerContext,
  createCardAssistanceLedger,
  readCardAssistanceLedgerVersion,
  restoreCardAssistanceLedgerVersion
} from "../../assist/cardAssistanceLedger.js";

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
    operation = CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT,
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
      current: boundedValue(
        readOnlyCurrentCard,
        operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT ? 14000 : 8000
      ),
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

function assertResourceEditSemantics(beforeCard, afterCard, contextPacket) {
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
        || "A edição introduziu uma nova violação semântica no resource selecionado.",
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
  return afterCard;
}

function compactConversationTurns(value) {
  const turns = (Array.isArray(value) ? value : []).slice(-8).map((turn) => ({
    operation: text(turn?.operation) || CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT,
    userRequest: boundedText(turn?.userRequest ?? turn?.request, 1800),
    assistantResponse: boundedText(turn?.assistantResponse, 1800),
    appliedTo: Array.isArray(turn?.appliedTo)
      ? turn.appliedTo.map((item) => boundedText(item, 300)).filter(Boolean).slice(0, 24)
      : turn?.scope === "card" ? ["card"] : (turn?.targetIds || []).slice(0, 24)
  })).filter(({ userRequest, assistantResponse }) => userRequest && assistantResponse);
  while (JSON.stringify(turns).length > 8000 && turns.length > 1) turns.shift();
  return turns;
}

function textualPatchSchema(entries) {
  const paths = entries.map(({ path }) => path);
  return {
    type: "object",
    additionalProperties: false,
    required: ["message", "edits"],
    properties: {
      message: { type: "string", minLength: 1, maxLength: 800 },
      edits: {
        type: "array",
        minItems: 0,
        maxItems: Math.min(paths.length, 64),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "value"],
          properties: {
            path: { type: "string", enum: paths },
            value: { type: "string", maxLength: 24000 }
          }
        }
      }
    }
  };
}

function assistantMessage(value, fallback) {
  const message = text(value?.message);
  if (!message) {
    throw new CardAssistanceScopeError(fallback, "INVALID_CARD_ASSISTANCE_RESULT");
  }
  return message;
}

async function generateTextEdit({
  provider,
  modelId,
  contextPacket,
  userRequest,
  context,
  snapshot,
  conversationTurns,
  onProgress
}) {
  const scope = snapshot.target.scope;
  const targets = snapshot.target.resources || [];
  const writableText = listCardAssistanceTextEntries(context.card, { scope, targets });
  if (!writableText.length) {
    throw new CardAssistanceScopeError(
      "O alvo selecionado não expõe folhas textuais editáveis.",
      "INVALID_CARD_ASSISTANCE_REQUEST"
    );
  }
  const currentValues = new Map(writableText.map(({ path, value }) => [path, value]));
  return callStructuredWithValidation({
    provider,
    modelId,
    buildRequest: (feedback) => ({
      phase: "card_assistance_text_edit",
      system: "Edite apenas as folhas textuais autorizadas. Devolva somente os caminhos cujo valor deve ser substituído; nunca devolva o card inteiro. Preserve estrutura, IDs, packages, versões, campos formais e tudo que não estiver em writableText. O estado atual já incorpora as iterações anteriores. Em message, descreva brevemente apenas o que o patch realmente faz. Responda somente no schema.",
      prompt: serializeAssistanceEnvelope({
        contract: "aralearn.card-assistance-edit-text.v2",
        userRequest: normalizedUserRequest(userRequest),
        scope,
        selectedTargets: targets.map(({ targetId, resourceType }) => ({ targetId, resourceType })),
        priorConversation: compactConversationTurns(conversationTurns),
        writableText,
        readOnlyContext: contextPacket,
        validationFeedback: feedback.slice(-1)
      }),
      schemaName: "aralearn_card_assistance_text_patch_v2",
      schema: textualPatchSchema(writableText),
      temperature: feedback.length ? 0 : 0.1,
      maxTokens: 3000
    }),
    validate: (value) => {
      const message = assistantMessage(
        value,
        "A edição textual não explicou brevemente o resultado."
      );
      if (!Array.isArray(value?.edits)) {
        throw new CardAssistanceScopeError(
          "A edição textual não devolveu um patch.",
          "INVALID_CARD_ASSISTANCE_RESULT"
        );
      }
      const card = applyCardAssistanceTextEdits(context.card, value.edits, {
        scope,
        targets
      });
      return {
        assistantMessage: message,
        card,
        edits: value.edits.filter(({ path, value: nextValue }) => (
          currentValues.has(path) && !Object.is(currentValues.get(path), nextValue)
        ))
      };
    },
    onProgress,
    reconstructionBudget: { remaining: 1 }
  });
}

function candidateSelectionSchema(candidates) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["candidateId"],
    properties: {
      candidateId: { type: "string", enum: candidates.map(({ id }) => id) }
    }
  };
}

async function selectRecompositionCandidate({
  provider,
  modelId,
  candidates,
  userRequest,
  contextPacket,
  conversationTurns,
  onProgress
}) {
  if (candidates.length === 1) return candidates[0];
  const selected = await callStructuredWithValidation({
    provider,
    modelId,
    buildRequest: (feedback) => ({
      phase: "card_assistance_representation",
      system: "Escolha a composição de packages que melhor materializa a intenção pedagógica. Use somente um candidateId fornecido. Responda somente no schema.",
      prompt: serializeAssistanceEnvelope({
        contract: "aralearn.card-assistance-recomposition-choice.v1",
        userRequest: normalizedUserRequest(userRequest),
        currentCard: contextPacket.cards.current,
        didacticContext: contextPacket.hierarchy,
        priorConversation: compactConversationTurns(conversationTurns),
        candidates: candidates.map(({ id, label, description, composition }) => ({
          id,
          label,
          description,
          composition
        })),
        validationFeedback: feedback.slice(-1)
      }),
      schemaName: "aralearn_card_assistance_recomposition_choice_v1",
      schema: candidateSelectionSchema(candidates),
      temperature: 0,
      maxTokens: 300
    }),
    validate: (value) => {
      const candidate = candidates.find(({ id }) => id === text(value?.candidateId));
      if (!candidate) {
        throw new CardAssistanceScopeError(
          "O modelo escolheu uma composição fora do recorte do catálogo.",
          "INVALID_CARD_ASSISTANCE_RESULT"
        );
      }
      return candidate;
    },
    onProgress,
    reconstructionBudget: { remaining: 1 }
  });
  return selected;
}

function recompositionResultSchema(plan) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["message", "card"],
    properties: {
      message: { type: "string", minLength: 1, maxLength: 800 },
      card: buildCardAssistanceAuthoringCardSchema(plan)
    }
  };
}

function cardComposition(card) {
  const specs = (items) => (Array.isArray(items) ? items : []).map((instance) => ({
    package: instance?.package,
    version: instance?.version
  }));
  return {
    role: card?.role,
    content: specs(card?.content),
    response: card?.response
      ? { package: card.response.package, version: card.response.version }
      : null,
    feedback: specs(card?.feedback)
  };
}

function assertCardMatchesRecompositionPlan(card, plan) {
  const expected = {
    role: plan.role,
    content: plan.content,
    response: plan.response,
    feedback: plan.feedback
  };
  if (JSON.stringify(cardComposition(card)) !== JSON.stringify(expected)) {
    throw new CardAssistanceScopeError(
      "O card devolvido não corresponde à composição escolhida no catálogo.",
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
  const expectedIds = [
    ...plan.content.map((_spec, index) => `${plan.id}-content-${index + 1}`),
    ...(plan.response ? [`${plan.id}-response-1`] : []),
    ...plan.feedback.map((_spec, index) => `${plan.id}-feedback-${index + 1}`)
  ];
  const actualIds = [
    ...(card.content || []).map(({ id }) => id),
    ...(card.response ? [card.response.id] : []),
    ...(card.feedback || []).map(({ id }) => id)
  ];
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    throw new CardAssistanceScopeError(
      "O card devolvido não preservou as identidades determinísticas da composição.",
      "INVALID_CARD_ASSISTANCE_RESULT"
    );
  }
}

async function generateRecomposedCard({
  provider,
  modelId,
  catalog,
  contextPacket,
  userRequest,
  context,
  conversationTurns,
  onProgress
}) {
  const priorConversation = compactConversationTurns(conversationTurns);
  const candidates = await queryCardAssistanceCatalog(catalog, {
    intent: normalizedUserRequest(userRequest),
    currentCard: {
      id: context.card.id,
      title: boundedText(context.card.title, 300),
      role: context.card.role,
      content: (context.card.content || [])
        .map(({ package: packageId, version }) => ({ package: packageId, version })),
      response: context.card.response
        ? { package: context.card.response.package, version: context.card.response.version }
        : null,
      feedback: (context.card.feedback || [])
        .map(({ package: packageId, version }) => ({ package: packageId, version }))
    },
    didacticContext: contextPacket.hierarchy,
    priorConversation
  });
  const candidate = await selectRecompositionCandidate({
    provider,
    modelId,
    candidates,
    userRequest,
    contextPacket,
    conversationTurns,
    onProgress
  });
  const plan = {
    id: context.card.id,
    position: context.card.position,
    ...candidate.composition
  };
  const result = await callStructuredWithValidation({
    provider,
    modelId,
    buildRequest: (feedback) => ({
      phase: "card_assistance_build",
      system: "Recomponha o card inteiro com a composição já escolhida. Siga os contratos dos packages, preserve exatamente id e position exigidos pelo schema e produza conteúdo autocontido, didático e coerente com os cards vizinhos. Em message, explique brevemente a mudança estrutural; se selectedComposition.catalogDisclosure estiver preenchido, inclua essa ressalva de cobertura com naturalidade. Responda somente no schema.",
      prompt: serializeAssistanceEnvelope({
        contract: "aralearn.card-assistance-recompose-card.v1",
        userRequest: normalizedUserRequest(userRequest),
        selectedComposition: cardAssistanceCandidatePrompt(candidate),
        priorConversation,
        readOnlyContext: contextPacket,
        validationFeedback: feedback.slice(-1)
      }),
      schemaName: "aralearn_card_assistance_recomposed_card_v1",
      schema: recompositionResultSchema(plan),
      temperature: feedback.length ? 0 : 0.1,
      maxTokens: 5600
    }),
    validate: (value) => {
      const message = assistantMessage(
        value,
        "A recomposição não explicou brevemente o resultado."
      );
      assertPlainObject(value?.card, "A recomposição não devolveu o card.");
      let card;
      try {
        card = compileAndValidateAuthoringCard(value.card, "$.assistance.card");
      } catch (error) {
        throw new CardAssistanceScopeError(
          error instanceof Error ? error.message : "A recomposição devolveu um card inválido.",
          "INVALID_CARD_ASSISTANCE_RESULT"
        );
      }
      if (card.id !== context.card.id || card.position !== context.card.position) {
        throw new CardAssistanceScopeError(
          "A recomposição tentou trocar a identidade ou a posição do card.",
          "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
        );
      }
      assertCardMatchesRecompositionPlan(card, plan);
      const disclosure = text(candidate.catalogDisclosure);
      return {
        assistantMessage: disclosure && !message.includes(disclosure)
          ? `${message} ${disclosure}`
          : message,
        card,
        candidateId: candidate.id,
        catalogDisclosure: disclosure
      };
    },
    onProgress,
    reconstructionBudget: { remaining: 1 }
  });
  return result;
}

export async function generateCardAssistanceChangeSet({
  projectDocument = {},
  selection = {},
  request = {},
  provider,
  modelId,
  didacticProfileId = "",
  didacticPolicy = {},
  resourceCatalog = RESOURCE_CATALOG,
  assistanceLedger = null,
  onProgress
} = {}) {
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
  const operation = snapshot.target.operation;
  const activeLedger = assistanceLedger
    ? assertCardAssistanceLedgerCurrent(assistanceLedger, context.card, selection)
    : null;
  const conversationTurns = activeLedger
    ? cardAssistanceLedgerContext(activeLedger)
    : request.conversationTurns;
  if (operation !== CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION &&
      typeof provider?.generateStructured !== "function") {
    throw new Error("O provider selecionado não oferece saída estruturada.");
  }
  const omittedTargets = operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT
    ? snapshot.target.scope === "resources"
      ? snapshot.target.resources.map((target) => target.targetId)
      : listCardResourceTargets(context.card).map((target) => target.targetId)
    : [];
  const contextPacket = buildCardAssistanceContextPacket(projectDocument, selection, {
    operation,
    didacticProfileId,
    didacticPolicy,
    resourceTargetIds: omittedTargets
  });
  const beforeCard = context.card;
  let generated;
  if (operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT) {
    generated = await generateTextEdit({
      provider,
      modelId,
      contextPacket,
      userRequest: request.promptText,
      context,
      snapshot,
      conversationTurns,
      onProgress
    });
  } else if (operation === CARD_ASSISTANCE_OPERATIONS.RECOMPOSE_CARD) {
    generated = await generateRecomposedCard({
      provider,
      modelId,
      catalog: resourceCatalog,
      contextPacket,
      userRequest: request.promptText,
      context,
      conversationTurns,
      onProgress
    });
  } else {
    if (!activeLedger) {
      throw new CardAssistanceScopeError(
        "A restauração exige o histórico volátil desta conversa.",
        "CARD_ASSISTANCE_VERSION_NOT_FOUND"
      );
    }
    const exactVersion = readCardAssistanceLedgerVersion(
      activeLedger,
      snapshot.target.versionId
    );
    assertPlainObject(exactVersion.card, "A versão solicitada não contém um card.");
    generated = {
      assistantMessage: text(request.restoreMessage) || "Restaurei a versão selecionada do card.",
      card: clone(exactVersion.card),
      versionId: snapshot.target.versionId
    };
  }
  const card = generated.card;
  const validatedCard = operation === CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION
    ? card
    : operation === CARD_ASSISTANCE_OPERATIONS.EDIT_TEXT &&
        snapshot.target.scope === "resources"
      ? assertResourceEditSemantics(beforeCard, card, contextPacket)
      : assertCardAssistanceSemantics(card, contextPacket);
  const changeSet = {
    contract: "aralearn.card-assistance-change.v2",
    operation,
    card: validatedCard,
    ...(generated.edits ? { textPatch: generated.edits } : {}),
    ...(generated.candidateId ? { candidateId: generated.candidateId } : {}),
    ...(generated.catalogDisclosure ? { catalogDisclosure: generated.catalogDisclosure } : {}),
    ...(generated.versionId ? { versionId: generated.versionId } : {})
  };
  const applied = await applyCardAssistanceChangeSet({
    projectDocument,
    selection,
    snapshot,
    changeSet
  });
  const outcome = applied.changed ? "applied" : "no-op";
  let nextLedger = activeLedger;
  let ledgerTransition = null;
  if (activeLedger) {
    if (operation === CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION && outcome === "applied") {
      ledgerTransition = restoreCardAssistanceLedgerVersion(
        activeLedger,
        snapshot.target.versionId
      );
      nextLedger = ledgerTransition.ledger;
    } else if (operation !== CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION) {
      ledgerTransition = appendCardAssistanceLedgerTurn(activeLedger, {
        beforeCard,
        afterCard: validatedCard,
        operation,
        request: request.promptText,
        assistantResponse: generated.assistantMessage,
        scope: snapshot.target.scope,
        targetIds: (snapshot.target.resources || []).map(({ targetId }) => targetId),
        modelId,
        textPatch: generated.edits,
        outcome
      });
      nextLedger = ledgerTransition.ledger;
    }
  }
  return {
    contract: "aralearn.card-assistance-generated-change.v2",
    snapshot,
    changeSet,
    assistantMessage: generated.assistantMessage,
    outcome,
    ...(nextLedger ? { assistanceLedger: nextLedger } : {}),
    ...(ledgerTransition ? {
        ledgerTransition: {
          changed: ledgerTransition.changed ?? ledgerTransition.applied ?? false,
          versionId: ledgerTransition.versionId || nextLedger.cursorVersionId,
          supersededVersionIds: ledgerTransition.supersededVersionIds || []
        }
      } : {}),
    diagnostics: { modelId, operation, contextContract: contextPacket.contract }
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
  resourceCatalog = RESOURCE_CATALOG,
  assistanceLedger = null,
  checkCodexLocalHealth,
  onProgress
} = {}) {
  const operation = normalizeCardAssistanceOperation(request.operation);
  if (!operation) {
    return {
      status: "error",
      errorMessage: "Escolha edit_text, recompose_card ou restore_version."
    };
  }
  const promptText = text(request.promptText);
  if (operation !== CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION && !promptText) {
    return {
      status: "error",
      errorMessage: "Descreva a alteração desejada."
    };
  }
  if (operation === CARD_ASSISTANCE_OPERATIONS.RESTORE_VERSION) {
    try {
      if (!assistanceLedger) {
        throw new CardAssistanceScopeError(
          "A restauração exige o histórico volátil desta conversa.",
          "CARD_ASSISTANCE_VERSION_NOT_FOUND"
        );
      }
      const change = await generateCardAssistanceChangeSet({
        projectDocument,
        selection,
        request: { ...request, promptText: "" },
        provider: null,
        modelId: "deterministic-restore",
        resourceCatalog,
        assistanceLedger,
        onProgress
      });
      return { status: "success", change, modelId: "" };
    } catch (error) {
      const isStale = [
        "STALE_CARD_ASSISTANCE_SCOPE",
        "STALE_CARD_ASSISTANCE_LEDGER"
      ].includes(error?.code);
      return {
        status: isStale ? "stale" : "error",
        errorMessage: error instanceof Error ? error.message : "Falha ao restaurar a versão."
      };
    }
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
    let activeLedger = assistanceLedger;
    if (!activeLedger) {
      const context = resolveCardAssistanceContext(projectDocument, selection);
      activeLedger = createCardAssistanceLedger({ selection, card: context.card });
    }
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
      resourceCatalog,
      assistanceLedger: activeLedger,
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
    const isStale = [
      "STALE_CARD_ASSISTANCE_SCOPE",
      "STALE_CARD_ASSISTANCE_LEDGER"
    ].includes(error?.code);
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
