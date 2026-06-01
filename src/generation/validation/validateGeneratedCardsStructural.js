import { normalizeGeneratedCard } from "../../domain/cards.js";
import { getCardResourceDefinition, validateGraphResource, validateRelationMapResource, validateTreeResource } from "../resources/cardResourceDefinitions.js";

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
    return { ok: false, structuralErrors: ['A resposta precisa ser {"cards":[...]}.'] };
  }
  return { ok: true, cards: rawResponse.cards };
}

function validateSchemaFields(card, definition, prefix, errors) {
  const allowed = new Set(Object.keys(definition?.schema?.properties || {}));
  const required = definition?.schema?.required || [];
  Object.keys(card || {}).forEach((fieldName) => {
    if (!allowed.has(fieldName)) {
      errors.push(`${prefix} campo fora do schema: ${fieldName}.`);
    }
  });
  required.forEach((fieldName) => {
    if (card?.[fieldName] === undefined) {
      errors.push(`${prefix} campo obrigatório ausente: ${fieldName}.`);
    }
  });
}

export function validateGeneratedCardsStructural(rawResponse, generationContract = {}) {
  const parsed = parseResponse(rawResponse);
  if (!parsed.ok) {
    return { ok: false, structuralErrors: parsed.structuralErrors, cards: [] };
  }

  const structuralErrors = [];
  const plan = Array.isArray(generationContract?.plan) ? generationContract.plan : [];
  const plannedByPosition = new Map(plan.map((item) => [Number(item.position), item]));
  const expectedCardCount = Number(generationContract?.output?.cardCount || 0);
  const cards = parsed.cards;

  if (cards.length !== expectedCardCount) {
    structuralErrors.push("quantidade errada.");
  }

  const normalizedCards = cards.map((card, index) => {
    const prefix = `cards[${index}]`;
    const position = Number(card?.position);
    const planned = plannedByPosition.get(position);
    if (!Number.isInteger(position) || !planned) {
      structuralErrors.push(`${prefix} position errada.`);
    } else {
      ["resource", "kind", "exercise"].forEach((fieldName) => {
        if (text(card?.[fieldName]) !== text(planned?.[fieldName])) {
          structuralErrors.push(`${prefix} ${fieldName} diferente do plano.`);
        }
      });
    }
    const definition = getCardResourceDefinition(text(card?.resource));
    if (!definition) {
      structuralErrors.push(`${prefix} resource inválido.`);
      return null;
    }
    validateSchemaFields(card, definition, prefix, structuralErrors);
    const result = (() => {
      try {
        return normalizeGeneratedCard(card, prefix);
      } catch (error) {
        structuralErrors.push(error instanceof Error ? error.message : `${prefix} card inválido.`);
        return null;
      }
    })();
    if (result?.resource === "tree") {
      validateTreeResource(result).forEach((entry) => structuralErrors.push(`${prefix} ${entry}`));
    }
    if (result?.resource === "graph") {
      validateGraphResource(result).forEach((entry) => structuralErrors.push(`${prefix} ${entry}`));
    }
    if (result?.resource === "relation_map") {
      validateRelationMapResource(result).forEach((entry) => structuralErrors.push(`${prefix} ${entry}`));
    }
    return result;
  }).filter(Boolean);

  return {
    ok: structuralErrors.length === 0,
    structuralErrors,
    cards: normalizedCards
  };
}
