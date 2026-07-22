function clone(value) {
  return structuredClone(value);
}

function choiceOptionSchema() {
  return {
    type: "object",
    required: ["id"],
    anyOf: [
      {
        additionalProperties: false,
        required: ["id", "text"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["text"] },
          text: { type: "string" }
        }
      },
      {
        additionalProperties: false,
        required: ["id", "kind", "language", "code"],
        properties: {
          id: { type: "string" },
          kind: { const: "code" },
          language: { type: "string" },
          code: { type: "string" }
        }
      }
    ]
  };
}

function matrixHighlightSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      pattern: { type: "string", enum: ["mainDiagonal"] },
      cells: {
        type: "array",
        items: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: { type: "integer" }
        }
      },
      rows: { type: "array", items: { type: "integer" } },
      columns: { type: "array", items: { type: "integer" } }
    }
  };
}

function afterBlocksSchema() {
  return {
    type: "array",
    items: compositeBlockSchema()
  };
}

function pedagogicFields() {
  return {
    position: { type: "integer" },
    resource: { type: "string" },
    kind: { type: "string", enum: ["theory", "exercise"] },
    exercise: { type: "string", enum: ["none", "gap", "choice"] },
    title: { type: "string" },
    after: { type: "string" },
    afterBlocks: afterBlocksSchema(),
    sources: { type: "array", items: { type: "string" } },
    topics: { type: "array", items: { type: "string" } }
  };
}

function contextualChoiceFields() {
  return {
    question: { type: "string" },
    options: {
      type: "array",
      items: choiceOptionSchema()
    },
    answer: { type: "string" }
  };
}

function coordinatePairSchema() {
  return {
    type: "array",
    minItems: 2,
    maxItems: 2,
    items: { type: "number" }
  };
}

function coordinatePairListSchema() {
  return {
    type: "array",
    items: coordinatePairSchema()
  };
}

function flowStructureSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      kind: {
        type: "string",
        enum: ["sequence", "start", "end", "input", "output", "process", "if_then", "if_then_else", "while", "for", "do_while", "if_chain", "switch_case"]
      },
      text: { type: "string" },
      condition: { type: "string" },
      expression: { type: "string" },
      init: { type: "string" },
      update: { type: "string" },
      items: { type: "array", items: { type: "object" } },
      thenBranch: { type: "array", items: { type: "object" } },
      elseBranch: { type: "array", items: { type: "object" } },
      body: { type: "array", items: { type: "object" } },
      cases: { type: "array", items: { type: "object" } },
      defaultBranch: { type: "array", items: { type: "object" } }
    }
  };
}

function choiceOptionsSchema() {
  return {
    type: "array",
    items: choiceOptionSchema()
  };
}

function graphVertexSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      label: { type: "string" }
    }
  };
}

function graphEdgeSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      from: { type: "string" },
      to: { type: "string" },
      label: { type: "string" },
      weight: { type: "string" }
    }
  };
}

function formulaNodeDefinition() {
  const node = { $ref: "#/$defs/formulaNode" };
  const leaf = (type) => ({
    type: "object",
    additionalProperties: false,
    required: ["type", "value"],
    properties: { type: { const: type }, value: { type: "string", minLength: 1, maxLength: 256 } }
  });
  return {
    oneOf: [
      leaf("number"),
      leaf("identifier"),
      leaf("operator"),
      leaf("text"),
      {
        type: "object", additionalProperties: false, required: ["type", "children"],
        properties: {
          type: { const: "row" },
          children: { type: "array", minItems: 1, maxItems: 64, items: node }
        }
      },
      {
        type: "object", additionalProperties: false, required: ["type", "numerator", "denominator"],
        properties: { type: { const: "fraction" }, numerator: node, denominator: node }
      },
      {
        type: "object", additionalProperties: false, required: ["type", "radicand"],
        properties: { type: { const: "root" }, radicand: node, index: node }
      },
      {
        type: "object", additionalProperties: false, required: ["type", "base", "exponent"],
        properties: { type: { const: "superscript" }, base: node, exponent: node }
      },
      {
        type: "object", additionalProperties: false, required: ["type", "base", "subscript"],
        properties: { type: { const: "subscript" }, base: node, subscript: node }
      },
      {
        type: "object", additionalProperties: false,
        required: ["type", "base", "subscript", "superscript"],
        properties: { type: { const: "subsup" }, base: node, subscript: node, superscript: node }
      },
      {
        type: "object", additionalProperties: false,
        required: ["type", "open", "close", "content"],
        properties: {
          type: { const: "fenced" },
          open: { enum: ["(", "[", "{", "|", "‖", "⟨"] },
          close: { enum: [")", "]", "}", "|", "‖", "⟩"] },
          content: node
        }
      }
    ]
  };
}

function compositeBlockSchema() {
  return {
    type: "object",
    additionalProperties: true,
    required: ["kind"],
    properties: {
      kind: {
        type: "string",
        enum: ["heading", "paragraph", "choice", "code", "table", "flow", "tree", "graph", "relation_map", "matrix", "plane", "formula"]
      },
      value: { type: "string" },
      question: { type: "string" },
      options: choiceOptionsSchema(),
      answer: { type: "string" },
      prompt: { type: "string" },
      language: { type: "string" },
      code: { type: "string" },
      columns: { type: "array", items: { type: "string" } },
      rows: { type: "array", items: { type: "array", items: { type: "string" } } },
      structure: flowStructureSchema(),
      nodes: { type: "array", items: { type: "object" } },
      vertices: { type: "array", items: graphVertexSchema() },
      edges: { type: "array", items: graphEdgeSchema() },
      highlight: { type: "object" },
      leftSet: { type: "object" },
      rightSet: { type: "object" },
      relations: { type: "array", items: { type: "object" } },
      pairList: { type: "array", items: { type: "string" } },
      relationTable: { type: "object" },
      name: { type: "string" },
      values: { type: "array", items: { type: "array" } },
      dividerAfterColumn: { type: "number" },
      sequence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            connector: { type: "string" },
            values: { type: "array", items: { type: "array" } },
            highlight: matrixHighlightSchema()
          }
        }
      },
      x: coordinatePairSchema(),
      y: coordinatePairSchema(),
      vector: coordinatePairSchema(),
      vectors: coordinatePairListSchema(),
      sum: coordinatePairListSchema(),
      scale: {
        type: "object",
        additionalProperties: false,
        properties: {
          k: { type: "number" },
          vector: coordinatePairSchema()
        }
      },
      distance: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: coordinatePairSchema()
      },
      result: {
        anyOf: [
          coordinatePairSchema(),
          { type: "string" }
        ]
      },
      notation: { type: "string", enum: ["mathematics", "chemistry"] },
      accessibleText: { type: "string" },
      expression: { type: "object" }
    }
  };
}

export const CARD_RESOURCE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "paragraph",
    label: "Parágrafo",
    shortDescription: "Texto curto para teoria ou lacuna por opções.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "text", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "paragraph" },
        text: { type: "string" }
      }
    }
  }),
  Object.freeze({
    id: "choice",
    label: "Escolha",
    shortDescription: "Pergunta objetiva com 3 ou 4 alternativas.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "question", "options", "answer", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "choice" },
        question: { type: "string" },
        options: choiceOptionsSchema(),
        answer: { type: "string" }
      }
    }
  }),
  Object.freeze({
    id: "composite",
    label: "Composto",
    shortDescription: "Card com múltiplos blocos visuais ou textuais, incluindo repetição do mesmo recurso.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "blocks", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "composite" },
        blocks: {
          type: "array",
          items: compositeBlockSchema()
        }
      }
    }
  }),
  Object.freeze({
    id: "code",
    label: "Código",
    shortDescription: "Trecho de código ou comando com teoria, lacuna por opções ou pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "prompt", "language", "code", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "code" },
        prompt: { type: "string" },
        language: { type: "string" },
        code: { type: "string" },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "table",
    label: "Tabela",
    shortDescription: "Linhas e colunas curtas com teoria ou pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "columns", "rows", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "table" },
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "flow",
    label: "Fluxo",
    shortDescription: "Fluxograma estrutural com sequência, decisão e laço sem depender de geometria persistida.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "structure", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "flow" },
        prompt: { type: "string" },
        structure: flowStructureSchema(),
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "tree",
    label: "Árvore",
    shortDescription: "Árvore simples de nós hierárquicos com teoria ou pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "prompt", "nodes", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "tree" },
        prompt: { type: "string" },
        nodes: { type: "array", items: { type: "object" } },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "graph",
    label: "Grafo",
    shortDescription: "Grafo estrutural com layout resolvido pelo motor e pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "prompt", "vertices", "edges", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "graph" },
        prompt: { type: "string" },
        vertices: { type: "array", items: { type: "object" } },
        edges: { type: "array", items: { type: "object" } },
        highlight: { type: "object" },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "relation_map",
    label: "Mapa de Relações",
    shortDescription: "Dois conjuntos com relações explícitas, lista de pares opcional e pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "prompt", "leftSet", "rightSet", "relations", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "relation_map" },
        prompt: { type: "string" },
        leftSet: { type: "object" },
        rightSet: { type: "object" },
        relations: { type: "array", items: { type: "object" } },
        pairList: { type: "array", items: { type: "string" } },
        relationTable: { type: "object" },
        highlight: { type: "object" },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "matrix",
    label: "Matriz",
    shortDescription: "Matriz ou sequência curta de matrizes com teoria ou pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "matrix" },
        prompt: { type: "string" },
        name: { type: "string" },
        values: { type: "array", items: { type: "array" } },
        highlight: matrixHighlightSchema(),
        dividerAfterColumn: { type: "number" },
        sequence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              connector: { type: "string" },
              values: { type: "array", items: { type: "array" } },
              highlight: matrixHighlightSchema()
            }
          }
        },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "plane",
    label: "Plano",
    shortDescription: "Plano cartesiano simples com teoria ou pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "plane" },
        prompt: { type: "string" },
        x: coordinatePairSchema(),
        y: coordinatePairSchema(),
        vector: coordinatePairSchema(),
        vectors: coordinatePairListSchema(),
        sum: coordinatePairListSchema(),
        scale: {
          type: "object",
          additionalProperties: false,
          properties: {
            k: { type: "number" },
            vector: coordinatePairSchema()
          }
        },
        distance: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: coordinatePairSchema()
        },
        result: {
          anyOf: [
            coordinatePairSchema(),
            { type: "string" }
          ]
        },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "formula",
    label: "Fórmula",
    shortDescription: "Expressão matemática ou química estruturada, legível e acessível.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position", "resource", "kind", "exercise", "title", "prompt",
        "notation", "accessibleText", "expression", "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "formula" },
        prompt: { type: "string" },
        notation: { type: "string", enum: ["mathematics", "chemistry"] },
        accessibleText: { type: "string", minLength: 1 },
        expression: { $ref: "#/$defs/formulaNode" },
        ...contextualChoiceFields()
      },
      $defs: { formulaNode: formulaNodeDefinition() }
    }
  })
]);

export function listCardResourceDefinitions() {
  return CARD_RESOURCE_DEFINITIONS.map(clone);
}

export function listGenerationResourceDefinitions() {
  return listCardResourceDefinitions();
}

export function getCardResourceDefinition(resourceId) {
  return listCardResourceDefinitions().find((item) => item.id === resourceId) || null;
}

export function listCardResourceSummaries() {
  return listCardResourceDefinitions().map(({ id, label, shortDescription }) => ({ id, label, shortDescription }));
}

export function getResourceSchemas(resourceIds = []) {
  return Object.fromEntries(
    resourceIds
      .map((resourceId) => getCardResourceDefinition(resourceId))
      .filter(Boolean)
      .map((definition) => [definition.id, definition.schema])
  );
}

export function validateTreeResource(card) {
  const errors = [];
  const nodes = Array.isArray(card?.nodes) ? card.nodes : [];
  if (!nodes.length) {
    errors.push("tree precisa de nodes.");
    return errors;
  }
  const nodeIds = new Set();
  nodes.forEach((node) => {
    const id = typeof node?.id === "string" ? node.id.trim() : "";
    const label = typeof node?.label === "string" ? node.label.trim() : "";
    if (!id || nodeIds.has(id)) {
      errors.push("Cada nó de tree precisa de id único.");
    }
    nodeIds.add(id);
    if (!label) {
      errors.push("Cada nó de tree precisa de label.");
    }
    if (!["folder", "file"].includes(String(node?.type || ""))) {
      errors.push("tree.type deve ser folder ou file.");
    }
  });
  return errors;
}

export function validateGraphResource(card) {
  const errors = [];
  const vertices = Array.isArray(card?.vertices) ? card.vertices : [];
  const edges = Array.isArray(card?.edges) ? card.edges : [];
  if (!vertices.length) {
    errors.push("graph precisa de vertices.");
    return errors;
  }
  const ids = new Set();
  vertices.forEach((vertex) => {
    const id = typeof vertex?.id === "string" ? vertex.id.trim() : "";
    if (!id || ids.has(id)) {
      errors.push("Cada vértice de graph precisa de id único.");
    }
    ids.add(id);
  });
  edges.forEach((edge) => {
    const from = typeof edge?.from === "string" ? edge.from.trim() : "";
    const to = typeof edge?.to === "string" ? edge.to.trim() : "";
    if (!from || !to || !ids.has(from) || !ids.has(to)) {
      errors.push("Toda aresta de graph deve apontar para vértices existentes.");
    }
  });
  return errors;
}

function validateRelationSet(setValue, side, errors) {
  const label = typeof setValue?.label === "string" ? setValue.label.trim() : "";
  const items = Array.isArray(setValue?.items) ? setValue.items : [];
  if (!label) {
    errors.push(`${side}Set precisa de label.`);
  }
  if (!items.length) {
    errors.push(`${side}Set precisa de items.`);
    return [];
  }
  const ids = new Set();
  items.forEach((item) => {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const itemLabel = typeof item?.label === "string" ? item.label.trim() : "";
    if (!id || ids.has(id)) {
      errors.push(`Cada item de ${side}Set precisa de id único.`);
    }
    ids.add(id);
    if (!itemLabel) {
      errors.push(`Cada item de ${side}Set precisa de label.`);
    }
  });
  return [...ids];
}

export function validateRelationMapResource(card) {
  const errors = [];
  const leftIds = new Set(validateRelationSet(card?.leftSet, "left", errors));
  const rightIds = new Set(validateRelationSet(card?.rightSet, "right", errors));
  const relations = Array.isArray(card?.relations) ? card.relations : [];
  if (!relations.length) {
    errors.push("relation_map precisa de relations.");
    return errors;
  }
  relations.forEach((relation) => {
    const from = typeof relation?.from === "string" ? relation.from.trim() : "";
    const to = typeof relation?.to === "string" ? relation.to.trim() : "";
    if (!from || !to || !leftIds.has(from) || !rightIds.has(to)) {
      errors.push("Toda relação de relation_map deve ligar um item existente do conjunto esquerdo a um item existente do conjunto direito.");
    }
  });
  return errors;
}
