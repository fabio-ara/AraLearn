import {
  COMPOSITE_BLOCK_INPUT_SCHEMA,
  normalizeGeneratedCard
} from "../../domain/cards.js";
import { FORMULA_EXPRESSION_INPUT_SCHEMA } from "../../domain/formulaExpression.js";
import { FLOWCHART_STRUCTURE_INPUT_SCHEMA } from "../../flowchart/flowchartStructure.js";
import {
  getCardResourceDefinition,
  listResourceDefinitions
} from "../../resources/registry/index.js";

const PRACTICE_ROLES = new Set(["practice", "practice_more", "fix_error"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function availableResourceIds(planningContract = {}) {
  const declared = new Set(
    (Array.isArray(planningContract?.availableResources)
      ? planningContract.availableResources
      : []
    ).map((item) => text(item?.id || item)).filter(Boolean)
  );
  return listResourceDefinitions()
    .map((definition) => definition.id)
    .filter((resource) => declared.size === 0 || declared.has(resource));
}

function representationCandidates(planItem = {}, planningContract = {}) {
  const practice = PRACTICE_ROLES.has(text(planItem?.role));
  return listResourceDefinitions()
    .filter((definition) => availableResourceIds(planningContract).includes(definition.id))
    .flatMap((definition) => {
      const exercises = definition.interactionCapabilities?.exercises || [];
      if (!practice) {
        return exercises.includes("none")
          ? [`${definition.id}:none`]
          : [];
      }
      return ["choice", "gap"]
        .filter((exercise) => exercises.includes(exercise))
        .map((exercise) => `${definition.id}:${exercise}`);
    });
}

function representationSchema(candidates) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["representation"],
    properties: {
      representation: {
        type: "string",
        enum: candidates
      }
    }
  };
}

function fieldsForExercise(exercise) {
  return exercise === "choice"
    ? ["question", "selectionMode", "selectionCriterion", "options", "answerIds"]
    : [];
}

function structuredResourceProperties(resource, properties) {
  const next = clone(properties);
  if (next.afterBlocks) {
    next.afterBlocks = {
      type: "array",
      items: clone(COMPOSITE_BLOCK_INPUT_SCHEMA)
    };
  }
  if (resource === "composite") {
    next.blocks = {
      type: "array",
      items: clone(COMPOSITE_BLOCK_INPUT_SCHEMA)
    };
  }
  if (resource === "flow") {
    const flowRoot = clone(FLOWCHART_STRUCTURE_INPUT_SCHEMA.$defs.node.oneOf[0]);
    next.structure = {
      ...flowRoot,
      $defs: clone(FLOWCHART_STRUCTURE_INPUT_SCHEMA.$defs)
    };
  }
  if (resource === "formula") {
    next.expression = clone(FORMULA_EXPRESSION_INPUT_SCHEMA);
  }
  return next;
}

function exactBuildSchema(planItem) {
  const definition = getCardResourceDefinition(planItem.resource);
  if (!definition) {
    throw new Error(`Recurso ausente no registro canônico: ${planItem.resource}.`);
  }
  const source = clone(definition.cardSchema);
  const required = new Set([
    ...(source.required || []),
    ...fieldsForExercise(planItem.exercise)
  ]);
  const sourceProperties = structuredResourceProperties(
    planItem.resource,
    source.properties || {}
  );
  const properties = Object.fromEntries(
    Object.entries(sourceProperties)
      .filter(([fieldName]) => required.has(fieldName))
      .map(([fieldName, schema]) => [fieldName, clone(schema)])
  );
  properties.position = { const: Number(planItem.position) };
  properties.resource = { const: planItem.resource };
  properties.kind = { const: planItem.kind };
  properties.exercise = { const: planItem.exercise };
  return {
    type: "object",
    additionalProperties: false,
    required: [...required],
    properties,
    ...(source.$defs ? { $defs: clone(source.$defs) } : {})
  };
}

function buildResponseSchema(planItem) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["card"],
    properties: {
      card: exactBuildSchema(planItem)
    }
  };
}

function parseRepresentation(value, candidates) {
  const representation = text(value?.representation);
  if (!candidates.includes(representation)) {
    throw new Error("O provider escolheu uma representação fora do conjunto autorizado.");
  }
  const separator = representation.lastIndexOf(":");
  return {
    resource: representation.slice(0, separator),
    exercise: representation.slice(separator + 1)
  };
}

function normalizeBuiltCard(value, planItem) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !value.card || typeof value.card !== "object" || Array.isArray(value.card) ||
      Object.keys(value).some((fieldName) => fieldName !== "card")) {
    throw new Error("A construção estruturada não devolveu exatamente um card.");
  }
  const card = normalizeGeneratedCard(value.card, `$.cards[${planItem.position - 1}]`);
  ["position", "resource", "kind", "exercise"].forEach((fieldName) => {
    if (card[fieldName] !== planItem[fieldName]) {
      throw new Error(
        `O card ${planItem.position} alterou ${fieldName} definido no plano estruturado.`
      );
    }
  });
  const normalized = { ...card };
  delete normalized.id;
  return normalized;
}

function contextEnvelope({
  generationContract,
  planItem,
  existingCards,
  validationFeedback = []
}) {
  return {
    contract: "aralearn.bottom-up-card-build.v2",
    task: "build_one_card",
    path: clone(generationContract?.path || {}),
    guide: clone(generationContract?.guide || {}),
    microsequence: clone(generationContract?.microsequence || {}),
    request: clone(generationContract?.request || {}),
    didactics: clone(generationContract?.didactics || {}),
    sources: clone(generationContract?.sources || []),
    readOnlyContext: {
      references: clone(generationContract?.context?.refs || []),
      currentCards: clone(generationContract?.context?.currentCards || []),
      cardsBuiltBefore: clone(existingCards)
    },
    writableTarget: clone(planItem),
    validationFeedback: clone(validationFeedback),
    invariants: [
      "Produza somente o card solicitado.",
      "Preserve position, resource, kind e exercise do writableTarget.",
      "O card deve ser autossuficiente e conter os dados necessários à prática.",
      "Não use HTML, SVG, CSS, coordenadas de layout ou propriedades fora do schema.",
      "Em choice, use distratores plausíveis, feedback localizado e answerIds exatos.",
      "Em gap automático, use alternativas objetivas; não dependa de correção semântica."
    ]
  };
}

async function chooseRepresentation({
  provider,
  modelId,
  generationContract,
  planItem
}) {
  const candidates = representationCandidates(planItem, generationContract);
  if (!candidates.length) {
    throw new Error(`Não há representação compatível com o papel ${planItem.role}.`);
  }
  const envelope = {
    contract: "aralearn.bottom-up-representation.v1",
    task: "choose_representation",
    guide: clone(generationContract?.guide || {}),
    microsequence: clone(generationContract?.microsequence || {}),
    request: clone(generationContract?.request || {}),
    cardPlan: clone(planItem),
    candidates,
    rule: "Escolha a representação que materializa melhor a operação sem redundância."
  };
  const result = await provider.generateStructured({
    phase: "bottom_up_representation",
    modelId,
    system: "Escolha somente uma representação autorizada no schema.",
    prompt: JSON.stringify(envelope),
    schemaName: `aralearn_representation_${planItem.role}_v1`,
    schema: representationSchema(candidates),
    temperature: 0,
    maxTokens: 300
  });
  return parseRepresentation(result?.value, candidates);
}

async function buildCard({
  provider,
  modelId,
  generationContract,
  planItem,
  existingCards
}) {
  let feedback = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await provider.generateStructured({
      phase: "bottom_up_card_build",
      modelId,
      system: "Construa um único card AraLearn e responda somente no schema fornecido.",
      prompt: JSON.stringify(contextEnvelope({
        generationContract,
        planItem,
        existingCards,
        validationFeedback: feedback
      })),
      schemaName: `aralearn_card_${planItem.resource}_${planItem.exercise}_v4`,
      schema: buildResponseSchema(planItem),
      temperature: attempt === 0 ? 0.2 : 0.1,
      maxTokens: 5000
    });
    try {
      return normalizeBuiltCard(result?.value, planItem);
    } catch (error) {
      feedback = [error instanceof Error ? error.message : "Card inválido."];
      if (attempt === 1) throw error;
    }
  }
  throw new Error("Não foi possível construir o card.");
}

export async function runStructuredBottomUp({
  provider,
  modelId,
  generationContract,
  didacticPlan
}) {
  if (typeof provider?.generateStructured !== "function") {
    throw new Error("O provider selecionado não oferece saída estruturada.");
  }
  const hasKnownErrors = Array.isArray(generationContract?.knownErrors) &&
    generationContract.knownErrors.length > 0;
  const normalizedDidacticPlan = didacticPlan.map((item) => ({
    ...clone(item),
    role: text(item?.role) === "fix_error" && !hasKnownErrors
      ? "practice_more"
      : text(item?.role)
  }));
  const cardPlan = [];
  for (const didacticItem of normalizedDidacticPlan) {
    const representation = await chooseRepresentation({
      provider,
      modelId,
      generationContract,
      planItem: didacticItem
    });
    cardPlan.push({
      ...clone(didacticItem),
      ...representation,
      kind: representation.exercise === "none" ? "theory" : "exercise"
    });
  }
  const cards = [];
  for (const planItem of cardPlan) {
    cards.push(await buildCard({
      provider,
      modelId,
      generationContract,
      planItem,
      existingCards: cards
    }));
  }
  return { cardPlan, cards };
}

export const structuredBottomUpSchemas = Object.freeze({
  representationSchema,
  exactBuildSchema,
  buildResponseSchema
});
