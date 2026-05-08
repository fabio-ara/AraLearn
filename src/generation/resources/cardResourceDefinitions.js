function clone(value) {
  return structuredClone(value);
}

export const CARD_RESOURCE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "paragraph",
    label: "Parágrafo",
    shortDescription: "Texto curto com uma ideia principal.",
    limits: { maxChars: 420 },
    schema: {
      type: "object",
      required: ["resourceType", "title", "text"],
      properties: {
        position: { type: "number" },
        resourceType: { const: "paragraph" },
        title: { type: "string" },
        text: { type: "string", maxLength: 420 },
        sourceRefs: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    id: "multiple_choice",
    label: "Múltipla escolha",
    shortDescription: "Pergunta curta com uma alternativa correta.",
    limits: { minOptions: 3, maxOptions: 4, maxPromptChars: 220 },
    schema: {
      type: "object",
      required: ["resourceType", "title", "question", "options", "correctOptionId", "feedback"],
      properties: {
        position: { type: "number" },
        resourceType: { const: "multiple_choice" },
        title: { type: "string" },
        question: { type: "string", maxLength: 220 },
        options: {
          type: "array",
          minItems: 3,
          maxItems: 4,
          items: {
            type: "object",
            required: ["optionId", "label"],
            properties: {
              optionId: { type: "string" },
              label: { type: "string" }
            },
            additionalProperties: false
          }
        },
        correctOptionId: { type: "string" },
        feedback: { type: "string" }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    id: "code_editor",
    label: "Editor de código",
    shortDescription: "Trecho curto de código ou comando com linguagem explícita.",
    limits: { maxLines: 6, maxPromptChars: 260 },
    schema: {
      type: "object",
      required: ["resourceType", "title", "prompt", "language", "code"],
      properties: {
        position: { type: "number" },
        resourceType: { const: "code_editor" },
        title: { type: "string" },
        prompt: { type: "string" },
        language: { type: "string" },
        code: { type: "string" },
        expectedAnswer: { type: "string" }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    id: "table",
    label: "Tabela",
    shortDescription: "Poucas linhas e colunas para comparação ou organização.",
    limits: { maxColumns: 4, maxRows: 6, maxCellChars: 80 },
    schema: {
      type: "object",
      required: ["resourceType", "title", "columns", "rows"],
      properties: {
        position: { type: "number" },
        resourceType: { const: "table" },
        title: { type: "string" },
        columns: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
        rows: { type: "array", minItems: 1, maxItems: 6, items: { type: "array", items: { type: "string" } } }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    id: "flowchart",
    label: "Fluxograma",
    shortDescription: "Poucos nós com rótulos curtos e conexões simples.",
    limits: { maxNodes: 7, maxLabelChars: 80 },
    schema: {
      type: "object",
      required: ["resourceType", "title", "nodes", "edges"],
      properties: {
        position: { type: "number" },
        resourceType: { const: "flowchart" },
        title: { type: "string" },
        nodes: { type: "array", minItems: 2, maxItems: 7, items: { type: "object" } },
        edges: { type: "array", minItems: 1, items: { type: "object" } }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    id: "block_gap_fill",
    label: "Lacunas com blocos",
    shortDescription: "Parágrafo com lacunas por opções e comentário posterior.",
    publicResourceType: "say",
    publicMapping: "paragraph_text_gap_options",
    limits: { maxBlanks: 4, maxBlocks: 8, maxLabelChars: 48 },
    schema: {
      type: "object",
      required: ["resourceType", "title", "prompt", "segments", "blocks", "feedbackAfter"],
      properties: {
        position: { type: "number" },
        resourceType: { const: "block_gap_fill" },
        title: { type: "string" },
        prompt: { type: "string" },
        segments: { type: "array", minItems: 1, items: { type: "object" } },
        blocks: { type: "array", minItems: 1, items: { type: "object" } },
        feedbackAfter: { type: "string" }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    id: "tree",
    label: "Árvore de diretórios",
    shortDescription: "Estrutura hierárquica simples de pastas e arquivos.",
    publicResourceType: "tree",
    limits: { maxNodes: 20, maxLabelChars: 48 },
    schema: {
      type: "object",
      required: ["resourceType", "title", "nodes"],
      properties: {
        position: { type: "number" },
        resourceType: { const: "tree" },
        title: { type: "string" },
        prompt: { type: "string" },
        base: { type: "string" },
        current: { type: "string" },
        selected: { type: "string" },
        closed: { type: "array", items: { type: "string" } },
        rootLabel: { type: "string" },
        nodes: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            required: ["id", "label"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              parentId: { type: ["string", "null"] },
              type: { enum: ["folder", "file"] }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    }
  })
]);

export function listCardResourceDefinitions() {
  return CARD_RESOURCE_DEFINITIONS.map(clone);
}

export function listGenerationResourceDefinitions() {
  return listCardResourceDefinitions().filter((item) => item.generationAvailable !== false);
}

export function getCardResourceDefinition(resourceId) {
  return listCardResourceDefinitions().find((item) => item.id === resourceId) || null;
}

export function listCardResourceSummaries() {
  return listGenerationResourceDefinitions().map(({ id, label, shortDescription }) => ({ id, label, shortDescription }));
}

export function getResourceSchemas(resourceIds = []) {
  return Object.fromEntries(
    resourceIds
      .map((resourceId) => getCardResourceDefinition(resourceId))
      .filter(Boolean)
      .map((definition) => [definition.id, definition.schema])
  );
}

export function validateBlockGapFill(card) {
  const errors = [];
  if (!card || typeof card !== "object") {
    return ["block_gap_fill inválido."];
  }
  if (typeof card.feedbackAfter !== "string" || !card.feedbackAfter.trim()) {
    errors.push("feedbackAfter é obrigatório.");
  }

  const blocks = Array.isArray(card.blocks) ? card.blocks : [];
  const blockIds = new Set();
  blocks.forEach((block) => {
    if (!block?.blockId || blockIds.has(block.blockId)) {
      errors.push("Cada blockId deve ser único.");
    }
    blockIds.add(block?.blockId);
    if (!block?.label || String(block.label).length > 48) {
      errors.push("Cada bloco precisa de rótulo curto.");
    }
  });

  const segments = Array.isArray(card.segments) ? card.segments : [];
  const blankIds = new Set();
  segments.filter((segment) => segment?.kind === "blank").forEach((segment) => {
    if (!segment.blankId || blankIds.has(segment.blankId)) {
      errors.push("Cada blankId deve ser único.");
    }
    blankIds.add(segment.blankId);
    if (!Array.isArray(segment.acceptedBlockIds) || !segment.acceptedBlockIds.length) {
      errors.push("Cada lacuna precisa de acceptedBlockIds.");
    }
    (segment.acceptedBlockIds || []).forEach((blockId) => {
      if (!blockIds.has(blockId)) {
        errors.push(`acceptedBlockId inexistente: ${blockId}.`);
      }
    });
  });
  if (blankIds.size === 0 || blankIds.size > 4) {
    errors.push("O número de lacunas deve ser pequeno e maior que zero.");
  }
  return errors;
}

export function validateTreeResource(card) {
  const errors = [];
  if (!card || typeof card !== "object") {
    return ["tree inválido."];
  }
  const nodes = Array.isArray(card.nodes) ? card.nodes : [];
  if (!nodes.length || nodes.length > 20) {
    errors.push("tree deve ter entre 1 e 20 nós.");
  }

  const ids = new Set();
  nodes.forEach((node) => {
    const id = typeof node?.id === "string" ? node.id.trim() : "";
    const label = typeof node?.label === "string" ? node.label.trim() : "";
    if (!id || ids.has(id)) {
      errors.push("Cada nó de tree precisa de id único.");
    }
    ids.add(id);
    if (!label || label.length > 48) {
      errors.push("Cada nó de tree precisa de label curto.");
    }
    if (node?.type && !["folder", "file"].includes(node.type)) {
      errors.push("tree.type deve ser folder ou file.");
    }
  });

  nodes.forEach((node) => {
    const parentId = typeof node?.parentId === "string" ? node.parentId.trim() : "";
    if (parentId && !ids.has(parentId)) {
      errors.push(`parentId inexistente em tree: ${parentId}.`);
    }
    if (parentId && parentId === node?.id) {
      errors.push("Nó de tree não pode apontar para si mesmo.");
    }
  });

  return errors;
}
