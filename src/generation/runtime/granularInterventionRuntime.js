import { InterventionScopeError } from "../../assist/interventionScopeGuard.js";
import { COMPOSITE_BLOCK_INPUT_SCHEMA, validateCard } from "../../domain/cards.js";
import { validateProjectDocument } from "../../domain/aralearnProject.js";
import { FORMULA_EXPRESSION_INPUT_SCHEMA } from "../../domain/formulaExpression.js";
import { FLOWCHART_STRUCTURE_INPUT_SCHEMA } from "../../flowchart/flowchartStructure.js";
import { getCardResourceDefinition } from "../../resources/registry/index.js";

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
  const cardIndex = (microsequence?.cards || []).findIndex(
    (item) => item?.id === text(scopeSnapshot?.target?.cardKey)
  );
  const card = cardIndex >= 0 ? microsequence.cards[cardIndex] : null;
  if (!course || !moduleValue || !lesson || !microsequence || !card ||
      cardIndex !== scopeSnapshot?.target?.cardIndex) {
    throw new InterventionScopeError(
      "O card selecionado não está mais disponível no contexto autorizado.",
      "STALE_INTERVENTION_SCOPE"
    );
  }
  return {
    course,
    moduleValue,
    lesson,
    microsequence,
    card,
    cardIndex,
    previousCard: microsequence.cards[cardIndex - 1] || null,
    nextCard: microsequence.cards[cardIndex + 1] || null
  };
}

function selectedBlockEntries(card, target) {
  const selectedIds = new Set((target?.blocks || []).map((block) => block.targetId));
  return (Array.isArray(card?.blocks) ? card.blocks : [])
    .filter((block) => selectedIds.has(text(block?.id)))
    .map((block) => ({
      targetId: text(block.id),
      value: clone(block)
    }));
}

function readOnlyBlockEntries(card, target) {
  const selectedIds = new Set((target?.blocks || []).map((block) => block.targetId));
  return (Array.isArray(card?.blocks) ? card.blocks : [])
    .filter((block) => !selectedIds.has(text(block?.id)))
    .map((block) => clone(block));
}

function normalizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
    name: text(attachment?.name),
    type: text(attachment?.type),
    text: text(attachment?.textContent || attachment?.text || attachment?.content)
  })).filter((attachment) => attachment.name || attachment.text);
}

function readOnlyContext(scope, attachments) {
  return {
    course: omit(scope.course, ["modules"]),
    module: omit(scope.moduleValue, ["lessons"]),
    lesson: omit(scope.lesson, ["microsequences"]),
    microsequence: omit(scope.microsequence, ["cards"]),
    previousCard: scope.previousCard ? clone(scope.previousCard) : null,
    nextCard: scope.nextCard ? clone(scope.nextCard) : null,
    currentCard: clone(scope.card),
    authorizedSources: normalizeAttachments(attachments)
  };
}

function exactCardSchema(resource) {
  const definition = getCardResourceDefinition(resource);
  if (!definition) {
    throw new InterventionScopeError(
      `Recurso não autorizado para construção: "${resource}".`,
      "INVALID_GRANULAR_SELECTION"
    );
  }
  const schema = clone(definition.cardSchema);
  if (schema.properties.afterBlocks) {
    schema.properties.afterBlocks = {
      type: "array",
      items: clone(COMPOSITE_BLOCK_INPUT_SCHEMA)
    };
  }
  if (resource === "composite") {
    schema.properties.blocks = {
      type: "array",
      items: clone(COMPOSITE_BLOCK_INPUT_SCHEMA)
    };
  }
  if (resource === "flow") {
    const flowRoot = clone(FLOWCHART_STRUCTURE_INPUT_SCHEMA.$defs.node.oneOf[0]);
    schema.properties.structure = {
      ...flowRoot,
      $defs: clone(FLOWCHART_STRUCTURE_INPUT_SCHEMA.$defs)
    };
  }
  if (resource === "formula") {
    schema.properties.expression = clone(FORMULA_EXPRESSION_INPUT_SCHEMA);
  }
  schema.properties = {
    id: { type: "string", minLength: 1 },
    ...schema.properties
  };
  schema.required = ["id", ...new Set(schema.required || [])];
  return schema;
}

function exactBlockSchema(kind) {
  const branch = (COMPOSITE_BLOCK_INPUT_SCHEMA.oneOf || []).find(
    (candidate) => candidate?.properties?.kind?.const === kind
  );
  if (!branch) {
    throw new InterventionScopeError(
      `Bloco não autorizado para construção: "${kind}".`,
      "INVALID_GRANULAR_SELECTION"
    );
  }
  return clone(branch);
}

function replacementResponseSchema(target, resourcesByTarget = new Map()) {
  const targets = target.level === "card"
    ? [{ targetId: target.cardKey, resource: resourcesByTarget.get(target.cardKey) || target.resourceType }]
    : target.blocks.map((block) => ({
        targetId: block.targetId,
        resource: resourcesByTarget.get(block.targetId) || block.blockKind
      }));
  return {
    type: "object",
    additionalProperties: false,
    required: ["replacements"],
    properties: {
      replacements: {
        type: "array",
        minItems: targets.length,
        maxItems: targets.length,
        items: {
          oneOf: targets.map(({ targetId, resource }) => ({
            type: "object",
            additionalProperties: false,
            required: ["targetId", "value"],
            properties: {
              targetId: { const: targetId },
              value: target.level === "card"
                ? exactCardSchema(resource)
                : exactBlockSchema(resource)
            }
          }))
        }
      }
    }
  };
}

function resourceSelectionSchema(target) {
  if (target.level === "card") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["resource"],
      properties: {
        resource: {
          type: "string",
          enum: target.allowedResources
        }
      }
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    required: ["selections"],
    properties: {
      selections: {
        type: "array",
        minItems: target.blocks.length,
        maxItems: target.blocks.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["targetId", "resource"],
          properties: {
            targetId: {
              type: "string",
              enum: target.blocks.map((block) => block.targetId)
            },
            resource: {
              type: "string",
              enum: target.allowedResources
            }
          }
        }
      }
    }
  };
}

function mutationInvariants(target) {
  return [
    "Somente writableTarget pode ser substituído.",
    "readOnlyContext é exclusivamente informativo.",
    "Preserve cada targetId e a ordem do documento.",
    "Não devolva projeto, curso, módulo, lição, microssequência ou card vizinho.",
    ...(target.intent === "rewrite_content"
      ? ["Preserve recurso, kind, exercise e função didática; reescreva somente o conteúdo."]
      : []),
    ...(target.intent === "rebuild_practice"
      ? ["Preserve recurso e função didática; reconstrua somente pergunta, dados, opções, resposta e feedback."]
      : []),
    ...(target.intent === "change_resource"
      ? ["Use somente o recurso previamente autorizado para cada targetId."]
      : []),
    ...(target.intent === "rebuild_card"
      ? ["Preserve card.id, card.position e o recorte semântico da microssequência."]
      : [])
  ];
}

export function buildGranularInterventionProviderRequest({
  projectDocument = {},
  selection = {},
  scopeSnapshot = {},
  userRequest = "",
  attachments = [],
  resourcesByTarget = new Map()
} = {}) {
  const scope = resolveScope(projectDocument, selection, scopeSnapshot);
  const target = scopeSnapshot.target;
  const writableTarget = target.level === "card"
    ? { targetId: target.cardKey, value: clone(scope.card) }
    : selectedBlockEntries(scope.card, target);
  const envelope = {
    contract: "aralearn.atomic-resource-patch.v2",
    intention: target.intent,
    userRequest: text(userRequest),
    writableTarget,
    readOnlyContext: {
      ...readOnlyContext(scope, attachments),
      ...(target.level === "blocks"
        ? { unselectedBlocks: readOnlyBlockEntries(scope.card, target) }
        : {})
    },
    invariants: mutationInvariants(target),
    responseContract: {
      shape: {
        replacements: target.level === "card"
          ? [{ targetId: target.cardKey, value: "card completo" }]
          : target.blocks.map((block) => ({
              targetId: block.targetId,
              value: "bloco completo"
            }))
      },
      allowedResources: Object.fromEntries(
        (target.level === "card"
          ? [{ targetId: target.cardKey, resourceType: target.resourceType }]
          : target.blocks
        ).map((entry) => [
          entry.targetId,
          resourcesByTarget.get(entry.targetId) ||
            (target.level === "card" ? target.resourceType : entry.blockKind)
        ])
      )
    }
  };
  return {
    phase: "bottom_up_atomic_resource_patch",
    system: [
      "Produza somente o objeto estruturado solicitado.",
      "Trate readOnlyContext como imutável.",
      "Aplique literalmente intention e invariants.",
      "Não acrescente propriedades fora do schema."
    ].join(" "),
    prompt: JSON.stringify(envelope),
    schemaName: `aralearn_atomic_${target.level}_${target.intent}_v2`,
    schema: replacementResponseSchema(target, resourcesByTarget),
    temperature: 0.1,
    maxTokens: target.level === "card" ? 5000 : 3500,
    engineContext: envelope
  };
}

function buildResourceSelectionRequest({
  projectDocument,
  selection,
  scopeSnapshot,
  userRequest,
  attachments
}) {
  const scope = resolveScope(projectDocument, selection, scopeSnapshot);
  const target = scopeSnapshot.target;
  const envelope = {
    contract: "aralearn.atomic-resource-selection.v1",
    intention: "change_resource",
    userRequest: text(userRequest),
    writableTarget: target.level === "card"
      ? { targetId: target.cardKey, value: clone(scope.card) }
      : selectedBlockEntries(scope.card, target),
    readOnlyContext: readOnlyContext(scope, attachments),
    allowedResources: target.allowedResources,
    rule: "Escolha somente a representação; não reescreva conteúdo nesta fase."
  };
  return {
    phase: "bottom_up_atomic_resource_selection",
    system: "Escolha somente recursos permitidos e responda no schema fornecido.",
    prompt: JSON.stringify(envelope),
    schemaName: `aralearn_atomic_resource_selection_${target.level}_v1`,
    schema: resourceSelectionSchema(target),
    temperature: 0,
    maxTokens: 700,
    engineContext: envelope
  };
}

function validateResourceSelection(value, target) {
  assertPlainObject(value, "A seleção de recurso não contém um objeto válido.");
  const result = new Map();
  if (target.level === "card") {
    assertOnlyFields(value, ["resource"], "A seleção de recurso contém campos não autorizados.");
    const resource = text(value.resource);
    if (!target.allowedResources.includes(resource)) {
      throw new InterventionScopeError("O provider escolheu um recurso não autorizado.", "OUT_OF_SCOPE_CHANGE");
    }
    result.set(target.cardKey, resource);
    return result;
  }
  assertOnlyFields(value, ["selections"], "A seleção de recurso contém campos não autorizados.");
  if (!Array.isArray(value.selections)) {
    throw new InterventionScopeError("A seleção de recurso não contém todos os alvos.");
  }
  const expected = new Set(target.blocks.map((block) => block.targetId));
  value.selections.forEach((entry) => {
    assertOnlyFields(entry, ["targetId", "resource"], "Uma seleção de recurso é inválida.");
    const targetId = text(entry.targetId);
    const resource = text(entry.resource);
    if (!expected.has(targetId) || result.has(targetId) ||
        !target.allowedResources.includes(resource)) {
      throw new InterventionScopeError("A seleção de recurso alterou o conjunto autorizado.", "OUT_OF_SCOPE_CHANGE");
    }
    result.set(targetId, resource);
  });
  if (result.size !== expected.size) {
    throw new InterventionScopeError("A seleção de recurso omitiu um alvo.", "OUT_OF_SCOPE_CHANGE");
  }
  return result;
}

function replacementMap(response, target) {
  assertOnlyFields(response, ["replacements"], "A resposta tentou incluir dados fora do patch atômico.");
  if (!Array.isArray(response.replacements)) {
    throw new InterventionScopeError("A resposta não contém replacements.", "INVALID_GRANULAR_RESULT");
  }
  const expected = new Set(target.level === "card"
    ? [target.cardKey]
    : target.blocks.map((block) => block.targetId));
  const replacements = new Map();
  response.replacements.forEach((entry) => {
    assertOnlyFields(entry, ["targetId", "value"], "Uma substituição contém campos não autorizados.");
    const targetId = text(entry.targetId);
    assertPlainObject(entry.value, "Uma substituição contém value inválido.");
    if (!expected.has(targetId) || replacements.has(targetId)) {
      throw new InterventionScopeError(
        "A resposta omitiu, repetiu ou alcançou um alvo fora da seleção.",
        "OUT_OF_SCOPE_CHANGE"
      );
    }
    replacements.set(targetId, clone(entry.value));
  });
  if (replacements.size !== expected.size) {
    throw new InterventionScopeError("A resposta omitiu um alvo selecionado.", "OUT_OF_SCOPE_CHANGE");
  }
  return replacements;
}

function assertCardIntent(currentCard, nextCard, target, resourcesByTarget) {
  if (nextCard.id !== currentCard.id || nextCard.position !== currentCard.position) {
    throw new InterventionScopeError(
      "A resposta tentou alterar a identidade ou a posição do card.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
  if (target.intent === "rewrite_content" || target.intent === "rebuild_practice") {
    if (nextCard.resource !== currentCard.resource ||
        nextCard.kind !== currentCard.kind ||
        nextCard.exercise !== currentCard.exercise) {
      throw new InterventionScopeError(
        "A intenção selecionada não autoriza trocar recurso, função ou interação do card.",
        "OUT_OF_SCOPE_CHANGE"
      );
    }
  }
  if (target.intent === "change_resource" &&
      nextCard.resource !== resourcesByTarget.get(target.cardKey)) {
    throw new InterventionScopeError(
      "A resposta não respeitou o recurso escolhido na fase de seleção.",
      "OUT_OF_SCOPE_CHANGE"
    );
  }
}

function applyReplacements(response, currentCard, target, resourcesByTarget) {
  const replacements = replacementMap(response, target);
  if (target.level === "card") {
    const nextCard = replacements.get(target.cardKey);
    assertCardIntent(currentCard, nextCard, target, resourcesByTarget);
    const validation = validateCard(nextCard, "$.intervention.card");
    if (!validation.ok) {
      const issue = validation.errors?.[0];
      throw new InterventionScopeError(
        `A resposta contém um card inválido${issue?.path ? ` em ${issue.path}` : ""}.`,
        "INVALID_GRANULAR_RESULT"
      );
    }
    return nextCard;
  }

  const nextCard = clone(currentCard);
  const selectedKinds = new Map(target.blocks.map((block) => [block.targetId, block.blockKind]));
  nextCard.blocks = nextCard.blocks.map((block) => {
    const targetId = text(block?.id);
    if (!replacements.has(targetId)) return block;
    const replacement = replacements.get(targetId);
    if (text(replacement.id) !== targetId) {
      throw new InterventionScopeError(
        "A resposta tentou substituir a identidade de um bloco.",
        "OUT_OF_SCOPE_CHANGE"
      );
    }
    if (target.intent !== "change_resource" &&
        text(replacement.kind) !== selectedKinds.get(targetId)) {
      throw new InterventionScopeError(
        "A resposta tentou substituir o tipo de um recurso selecionado.",
        "OUT_OF_SCOPE_CHANGE"
      );
    }
    if (target.intent === "change_resource" &&
        text(replacement.kind) !== resourcesByTarget.get(targetId)) {
      throw new InterventionScopeError(
        "A resposta não respeitou o recurso escolhido na fase de seleção.",
        "OUT_OF_SCOPE_CHANGE"
      );
    }
    return replacement;
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
  scope.microsequence.cards[scope.cardIndex] = clone(nextCard);
  return nextProjectDocument;
}

async function callStructured(provider, request, modelId) {
  const result = await provider.generateStructured({ ...request, modelId });
  return result?.value;
}

export async function generateGranularProjectDocument({
  selection = {},
  projectDocument = {},
  preparedIntervention = {},
  scopeSnapshot = {},
  onProgress
} = {}) {
  const launchConfig = preparedIntervention?.launchConfig;
  if (typeof launchConfig?.provider?.generateStructured !== "function") {
    throw new Error("O provider selecionado não oferece saída estruturada para edição atômica.");
  }
  const provider = launchConfig.provider;
  const target = scopeSnapshot.target;
  const resourcesByTarget = new Map(
    (target.level === "card"
      ? [{ targetId: target.cardKey, resource: target.resourceType }]
      : target.blocks.map((block) => ({ targetId: block.targetId, resource: block.blockKind }))
    ).map((entry) => [entry.targetId, entry.resource])
  );
  const common = {
    projectDocument,
    selection,
    scopeSnapshot,
    userRequest: preparedIntervention?.promptText,
    attachments: preparedIntervention?.ingestedAttachments?.attachments
  };
  onProgress?.({
    stage: "generate",
    status: "started",
    message: "Processando o patch atômico."
  });
  try {
    if (target.intent === "change_resource") {
      const selectionRequest = buildResourceSelectionRequest(common);
      const selectionValue = await callStructured(provider, selectionRequest, launchConfig.modelId);
      const selectedResources = validateResourceSelection(selectionValue, target);
      selectedResources.forEach((resource, targetId) => resourcesByTarget.set(targetId, resource));
    }
    const providerRequest = buildGranularInterventionProviderRequest({
      ...common,
      resourcesByTarget
    });
    const response = await callStructured(provider, providerRequest, launchConfig.modelId);
    const scope = resolveScope(projectDocument, selection, scopeSnapshot);
    const nextCard = applyReplacements(response, scope.card, target, resourcesByTarget);
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
      message: "Patch atômico validado."
    });
    return {
      projectDocument: nextProjectDocument,
      patch: {
        kind: target.level === "card" ? "replace-card" : "replace-card-blocks",
        intention: target.intent,
        replacements: [...resourcesByTarget].map(([targetId, resource]) => ({
          targetId,
          resource
        })),
        target: {
          courseKey: selection.courseKey,
          moduleKey: selection.moduleKey,
          lessonKey: selection.lessonKey,
          microsequenceKey: selection.microsequenceKey,
          cardKey: target.cardKey,
          ...(target.level === "blocks"
            ? { blockIds: target.blocks.map((block) => block.targetId) }
            : {})
        }
      },
      summary: {
        message: target.level === "card"
          ? "Card atualizado por patch atômico."
          : "Recursos atualizados por patch atômico.",
        openActionLabel: "Abrir card"
      }
    };
  } catch (error) {
    onProgress?.({
      stage: "generate",
      status: "failed",
      message: error instanceof Error ? error.message : "Falha no serviço de linguagem.",
      resumeFrom: "generate"
    });
    throw error;
  }
}
