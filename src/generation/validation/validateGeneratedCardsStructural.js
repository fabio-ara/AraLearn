import { getCardResourceDefinition, validateBlockGapFill, validateGraphResource, validateTreeResource } from "../resources/cardResourceDefinitions.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseResponse(rawResponse) {
  if (typeof rawResponse === "string") {
    try {
      return parseResponse(JSON.parse(rawResponse));
    } catch {
      return { ok: false, structuralErrors: ["JSON incorreto."] };
    }
  }
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) {
    return { ok: false, structuralErrors: ["JSON incorreto."] };
  }
  if (!Array.isArray(rawResponse.cards)) {
    return { ok: false, structuralErrors: ["cards ausentes."] };
  }
  return { ok: true, response: rawResponse, cards: rawResponse.cards };
}

function schemaFields(definition) {
  return new Set(Object.keys(definition?.schema?.properties || {}));
}

function schemaRequired(definition) {
  return new Set(definition?.schema?.required || []);
}

function validateRequiredFields(card, definition, errors, prefix) {
  schemaRequired(definition).forEach((fieldName) => {
    if (card?.[fieldName] === undefined || card?.[fieldName] === null || card?.[fieldName] === "") {
      errors.push(`${prefix} campo obrigatório ausente: ${fieldName}.`);
    }
  });
}

function validateUnknownFields(card, definition, errors, prefix) {
  const allowed = schemaFields(definition);
  Object.keys(card || {}).forEach((fieldName) => {
    if (!allowed.has(fieldName)) {
      errors.push(`${prefix} campo fora do schema: ${fieldName}.`);
    }
  });
}

function validateMultipleChoice(card, errors, prefix) {
  const options = Array.isArray(card.options) ? card.options : [];
  const optionIds = new Set();
  options.forEach((option, index) => {
    const optionId = text(option?.optionId);
    if (!optionId) {
      errors.push(`${prefix} optionId inválido em options[${index}].`);
    }
    if (optionIds.has(optionId)) {
      errors.push(`${prefix} optionId duplicado: ${optionId}.`);
    }
    optionIds.add(optionId);
  });
  if (!optionIds.has(text(card.correctOptionId))) {
    errors.push(`${prefix} correctOptionId inválido.`);
  }
}

function validateBlockGap(card, errors, prefix) {
  validateBlockGapFill(card).forEach((error) => {
    if (/blankId/i.test(error)) {
      errors.push(`${prefix} blankId inválido.`);
    } else if (/blockId/i.test(error) || /acceptedBlockId/i.test(error)) {
      errors.push(`${prefix} blockId inválido.`);
    } else {
      errors.push(`${prefix} ${error}`);
    }
  });
}

function validateTree(card, errors, prefix) {
  validateTreeResource(card).forEach((error) => errors.push(`${prefix} ${error}`));
}

function validateMatrix(card, errors, prefix) {
  const sequence = Array.isArray(card.sequence) ? card.sequence : [];
  const highlightValues = [
    card.highlight,
    ...sequence.map((item) => item?.highlight)
  ].filter((value) => value !== undefined);
  highlightValues.forEach((highlight) => {
    if (typeof highlight === "object" && highlight !== null && !Array.isArray(highlight)) {
      const valid = highlight.row !== undefined || highlight.col !== undefined || Array.isArray(highlight.cell);
      if (!valid) {
        errors.push(`${prefix} highlight inválido.`);
      }
    }
  });
}

function validateGraph(card, errors, prefix) {
  validateGraphResource(card).forEach((error) => errors.push(`${prefix} ${error}`));
}

export function validateGeneratedCardsStructural(rawResponse, generationContract = {}) {
  const parsed = parseResponse(rawResponse);
  if (!parsed.ok) {
    return { ok: false, structuralErrors: parsed.structuralErrors, cards: [] };
  }

  const structuralErrors = [];
  const cards = parsed.cards;
  const expectedCardCount = Number(generationContract?.output?.expectedCardCount || 0);
  const plannedByPosition = new Map((generationContract?.didacticPlan?.cardPlan || []).map((item) => [item.position, item]));

  if (cards.length !== expectedCardCount) {
    structuralErrors.push("quantidade errada.");
  }

  const seenPositions = new Set();
  cards.forEach((card, index) => {
    const prefix = `cards[${index}]`;
    const position = Number(card?.position);
    const planned = plannedByPosition.get(position);
    if (!Number.isInteger(position) || !planned || seenPositions.has(position)) {
      structuralErrors.push(`${prefix} position errada.`);
    }
    seenPositions.add(position);

    const definition = getCardResourceDefinition(text(card?.resourceType));
    if (!definition) {
      structuralErrors.push(`${prefix} resourceType diferente do plano.`);
      return;
    }
    if (text(card?.resourceType) !== text(planned?.resourceType)) {
      structuralErrors.push(`${prefix} resourceType diferente do plano.`);
    }

    validateUnknownFields(card, definition, structuralErrors, prefix);
    validateRequiredFields(card, definition, structuralErrors, prefix);

    if (card.resourceType === "multiple_choice") {
      validateMultipleChoice(card, structuralErrors, prefix);
    }
    if (card.resourceType === "block_gap_fill") {
      validateBlockGap(card, structuralErrors, prefix);
    }
    if (card.resourceType === "tree") {
      validateTree(card, structuralErrors, prefix);
    }
    if (card.resourceType === "matrix") {
      validateMatrix(card, structuralErrors, prefix);
    }
    if (card.resourceType === "graph") {
      validateGraph(card, structuralErrors, prefix);
    }
  });

  return {
    ok: structuralErrors.length === 0,
    structuralErrors,
    cards
  };
}
