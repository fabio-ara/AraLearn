import { InterventionScopeError } from "../../assist/interventionScopeGuard.js";
import { validateProjectDocument } from "../../domain/aralearnProject.js";
import { validateCard } from "../../domain/cards.js";
import { parseJsonText } from "../engine/structuredText.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function omit(value = {}, fields = []) {
  const omitted = new Set(fields);
  return Object.fromEntries(
    Object.entries(value || {}).filter(([fieldName]) => !omitted.has(fieldName))
  );
}

function assertPlainObject(value, message, code = "INVALID_GRANULAR_RESULT") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InterventionScopeError(message, code);
  }
}

function assertOnlyFields(value, allowedFields, message) {
  assertPlainObject(value, message);
  const allowed = new Set(allowedFields);
  if (Object.keys(value).some((fieldName) => !allowed.has(fieldName))) {
    throw new InterventionScopeError(message, "OUT_OF_SCOPE_CHANGE");
  }
}

function resolveScope(projectDocument = {}, selection = {}, scopeSnapshot = {}) {
  const course = (projectDocument.courses || []).find(
    (item) => item?.id === text(selection?.courseKey)
  );
  const moduleValue = (course?.modules || []).find(
    (item) => item?.id === text(selection?.moduleKey)
  );
  const lesson = (moduleValue?.lessons || []).find(
    (item) => item?.id === text(selection?.lessonKey)
  );
  const microsequence = (lesson?.microsequences || []).find(
    (item) => item?.id === text(selection?.microsequenceKey)
  );
  const card = (microsequence?.cards || [])[Number(scopeSnapshot?.target?.cardIndex)];
  if (!course || !moduleValue || !lesson || !microsequence ||
      !card || card.id !== scopeSnapshot?.target?.cardKey) {
    throw new InterventionScopeError(
      "O card selecionado não está mais disponível no contexto autorizado.",
      "STALE_INTERVENTION_SCOPE"
    );
  }
  return { course, moduleValue, lesson, microsequence, card };
}

function selectedBlockEntries(card, target) {
  const blocks = Array.isArray(card?.blocks) ? card.blocks : [];
  return (target?.blocks || []).map(({ blockIndex, blockIdentity, blockKind }) => ({
    blockIndex,
    blockIdentity,
    blockKind,
    block: clone(blocks[blockIndex])
  }));
}

function readOnlyBlockEntries(card, target) {
  const selectedIndexes = new Set(
    (target?.blocks || []).map(({ blockIndex }) => Number(blockIndex))
  );
  return (Array.isArray(card?.blocks) ? card.blocks : [])
    .map((block, blockIndex) => ({
      blockIndex,
      blockKind: text(block?.kind),
      block: clone(block)
    }))
    .filter(({ blockIndex }) => !selectedIndexes.has(blockIndex));
}

function buildDidacticContext(scope) {
  return {
    course: omit(scope.course, ["modules"]),
    module: omit(scope.moduleValue, ["lessons"]),
    lesson: omit(scope.lesson, ["microsequences"]),
    microsequence: omit(scope.microsequence, ["cards"])
  };
}

function responseContract(target) {
  if (target.level === "card") {
    return {
      requiredShape: { card: "card v3 completo" },
      rules: [
        "Retorne somente a propriedade card.",
        "Preserve exatamente card.id e card.position.",
        "O card deve ser válido no contrato AraLearn v3."
      ]
    };
  }
  return {
    requiredShape: {
      blocks: target.blocks.map(({ blockIndex }) => ({
        blockIndex,
        block: "bloco v3 completo"
      }))
    },
    rules: [
      "Retorne somente a propriedade blocks.",
      "Retorne exatamente os blockIndex solicitados, uma única vez cada.",
      "Preserve kind, id e position de cada bloco quando esses campos existirem.",
      "Não retorne nem altere blocos que estejam apenas no contexto de leitura."
    ]
  };
}

export function buildGranularInterventionProviderRequest({
  projectDocument = {},
  selection = {},
  scopeSnapshot = {},
  userRequest = "",
  attachments = []
} = {}) {
  const scope = resolveScope(projectDocument, selection, scopeSnapshot);
  const target = scopeSnapshot.target;
  const requestEnvelope = {
    contract: "aralearn.granular-intervention.v1",
    request: text(userRequest),
    didacticContext: buildDidacticContext(scope),
    target: target.level === "card"
      ? {
          level: "card",
          resourceType: target.resourceType,
          card: clone(scope.card)
        }
      : {
          level: "blocks",
          resourceType: target.resourceType,
          card: omit(scope.card, ["blocks"]),
          selectedBlocks: selectedBlockEntries(scope.card, target),
          readOnlyBlocks: readOnlyBlockEntries(scope.card, target)
        },
    responseContract: responseContract(target),
    attachments: (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
      name: text(attachment?.name),
      type: text(attachment?.type),
      text: text(attachment?.textContent || attachment?.text || attachment?.content)
    })).filter((attachment) => attachment.name || attachment.text)
  };

  return {
    phase: "bottom_up_granular_intervention",
    system: [
      "Responda somente com um objeto JSON válido no formato indicado.",
      "Use didacticContext e readOnlyBlocks somente para leitura.",
      "Altere exclusivamente o destino declarado em target.",
      "Não crie, remova ou reordene entidades fora desse destino."
    ].join(" "),
    prompt: JSON.stringify(requestEnvelope),
    temperature: 0.1,
    maxTokens: target.level === "card" ? 5000 : 3500,
    engineContext: requestEnvelope
  };
}

function validateFullCard(response, currentCard) {
  assertOnlyFields(
    response,
    ["card"],
    "A resposta tentou incluir dados fora do card selecionado."
  );
  assertPlainObject(response.card, "A resposta não contém um card válido.");
  if (response.card.id !== currentCard.id || response.card.position !== currentCard.position) {
    throw new InterventionScopeError(
      "A resposta tentou alterar a identidade ou a posição do card.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
  const validation = validateCard(response.card, "$.intervention.card");
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    throw new InterventionScopeError(
      `A resposta contém um card inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
      "INVALID_GRANULAR_RESULT"
    );
  }
  return clone(response.card);
}

function validateBlockReplacements(response, currentCard, target) {
  assertOnlyFields(
    response,
    ["blocks"],
    "A resposta tentou incluir dados fora dos blocos selecionados."
  );
  if (!Array.isArray(response.blocks)) {
    throw new InterventionScopeError(
      "A resposta não contém a lista de blocos solicitada.",
      "INVALID_GRANULAR_RESULT"
    );
  }
  const expectedIndexes = target.blocks.map(({ blockIndex }) => blockIndex);
  const returnedIndexes = response.blocks.map((entry) => Number(entry?.blockIndex));
  if (returnedIndexes.some((blockIndex) => !Number.isInteger(blockIndex)) ||
      new Set(returnedIndexes).size !== returnedIndexes.length ||
      returnedIndexes.length !== expectedIndexes.length ||
      expectedIndexes.some((blockIndex) => !returnedIndexes.includes(blockIndex))) {
    throw new InterventionScopeError(
      "A resposta tentou omitir, repetir ou alterar blocos fora da seleção.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }

  const nextCard = clone(currentCard);
  response.blocks.forEach((entry) => {
    assertOnlyFields(
      entry,
      ["blockIndex", "block"],
      "A resposta de bloco contém dados fora do formato autorizado."
    );
    assertPlainObject(entry.block, "A resposta contém um bloco inválido.");
    const blockIndex = Number(entry.blockIndex);
    const currentBlock = currentCard.blocks[blockIndex];
    const selectedBlock = target.blocks.find((block) => block.blockIndex === blockIndex);
    if (text(entry.block?.kind) !== text(selectedBlock?.blockKind) ||
        text(currentBlock?.kind) !== text(selectedBlock?.blockKind)) {
      throw new InterventionScopeError(
        "A resposta tentou substituir o tipo de um recurso selecionado.",
        "OUT_OF_SCOPE_CHANGE"
      );
    }
    nextCard.blocks[blockIndex] = clone(entry.block);
  });
  const validation = validateCard(nextCard, "$.intervention.card");
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    throw new InterventionScopeError(
      `A resposta contém um bloco inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
      "INVALID_GRANULAR_RESULT"
    );
  }
  return nextCard;
}

function replaceTargetCard(projectDocument, selection, scopeSnapshot, nextCard) {
  const nextProjectDocument = clone(projectDocument);
  const scope = resolveScope(nextProjectDocument, selection, scopeSnapshot);
  scope.microsequence.cards[scopeSnapshot.target.cardIndex] = clone(nextCard);
  return nextProjectDocument;
}

export async function generateGranularProjectDocument({
  selection = {},
  projectDocument = {},
  preparedIntervention = {},
  scopeSnapshot = {},
  onProgress
} = {}) {
  const launchConfig = preparedIntervention?.launchConfig;
  if (typeof launchConfig?.provider?.generateText !== "function") {
    throw new Error("Intervenção granular não preparada.");
  }
  const scope = resolveScope(projectDocument, selection, scopeSnapshot);
  const providerRequest = buildGranularInterventionProviderRequest({
    projectDocument,
    selection,
    scopeSnapshot,
    userRequest: preparedIntervention?.promptText,
    attachments: preparedIntervention?.ingestedAttachments?.attachments
  });
  onProgress?.({
    stage: "generate",
    status: "started",
    message: "Processando o escopo selecionado."
  });
  let rawResult;
  try {
    rawResult = await launchConfig.provider.generateText({
      ...providerRequest,
      modelId: launchConfig.modelId
    });
  } catch (error) {
    onProgress?.({
      stage: "generate",
      status: "failed",
      message: error instanceof Error ? error.message : "Falha no serviço de linguagem.",
      resumeFrom: "generate"
    });
    throw error;
  }
  const response = parseJsonText(rawResult?.text);
  const nextCard = scopeSnapshot.target.level === "card"
    ? validateFullCard(response, scope.card)
    : validateBlockReplacements(response, scope.card, scopeSnapshot.target);
  const nextProjectDocument = replaceTargetCard(
    projectDocument,
    selection,
    scopeSnapshot,
    nextCard
  );
  const documentValidation = validateProjectDocument(nextProjectDocument);
  if (!documentValidation.ok) {
    const issue = documentValidation.errors?.[0];
    throw new InterventionScopeError(
      `A resposta deixou o documento inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
      "INVALID_GRANULAR_RESULT"
    );
  }
  onProgress?.({
    stage: "validate",
    status: "ok",
    message: "Escopo granular validado."
  });

  return {
    projectDocument: nextProjectDocument,
    patch: {
      kind: scopeSnapshot.target.level === "card" ? "update-card" : "update-card-blocks",
      target: {
        courseKey: selection.courseKey,
        moduleKey: selection.moduleKey,
        lessonKey: selection.lessonKey,
        microsequenceKey: selection.microsequenceKey,
        cardKey: scopeSnapshot.target.cardKey,
        resourceType: scopeSnapshot.target.resourceType,
        ...(scopeSnapshot.target.level === "blocks"
          ? {
              blocks: scopeSnapshot.target.blocks.map(({ blockIndex, blockKind }) => ({
                blockIndex,
                blockKind
              })),
              blockIndexes: scopeSnapshot.target.blocks.map(({ blockIndex }) => blockIndex)
            }
          : {})
      }
    },
    summary: {
      message: scopeSnapshot.target.level === "card"
        ? "Card atualizado no contrato v3."
        : "Blocos atualizados no contrato v3.",
      openActionLabel: "Abrir card"
    }
  };
}
