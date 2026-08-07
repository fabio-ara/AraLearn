import {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  COMPOSITE_BLOCK_TYPES,
  getAuthoringResourceContract as getAuthoringMetadata
} from "./authoring.js";
import { FLOWCHART_STRUCTURE_INPUT_SCHEMA } from "../../flowchart/flowchartStructure.js";

export const RESOURCE_CONTRACT_VERSION = "aralearn.resources.v4";
const MOBILE_CARD_BLOCK_LIMIT = 5;
export const CARD_AFTER_BLOCKS_MAX_ITEMS = MOBILE_CARD_BLOCK_LIMIT;

const RESOURCE_LABELS = Object.freeze({
  paragraph: "Parágrafo",
  choice: "Escolha",
  composite: "Composto",
  code: "Código",
  table: "Tabela",
  flow: "Fluxo",
  tree: "Árvore",
  graph: "Grafo",
  relation_map: "Mapa de relações",
  matrix: "Matriz",
  plane: "Plano",
  formula: "Fórmula",
  chart: "Gráfico estatístico",
  sequence: "Sequência",
  annotated_text: "Texto anotado",
  linguistic_example: "Exemplo linguístico",
  system_map: "Mapa de sistema",
  reaction: "Reação"
});

function getResourceLabel(resource) {
  return RESOURCE_LABELS[resource] || resource;
}

function clone(value) {
  return structuredClone(value);
}

function choiceOptionSchema() {
  const commonProperties = {
    id: { type: "string", minLength: 1 },
    feedback: { type: "string" },
    misconceptionId: { type: "string" }
  };
  return {
    type: "object",
    required: ["id"],
    anyOf: [
      {
        additionalProperties: false,
        required: ["id", "text"],
        properties: {
          ...commonProperties,
          kind: { type: "string", enum: ["text"] },
          text: { type: "string" }
        }
      },
      {
        additionalProperties: false,
        required: ["id", "kind", "language", "code"],
        properties: {
          ...commonProperties,
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
    minItems: 1,
    maxItems: CARD_AFTER_BLOCKS_MAX_ITEMS,
    items: compositeBlockSchema()
  };
}

function textMetadataFields() {
  return {
    languageTag: {
      type: "string",
      maxLength: 63,
      pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$"
    },
    textDirection: { type: "string", enum: ["auto", "ltr", "rtl"] }
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
    topics: { type: "array", items: { type: "string" } },
    ...textMetadataFields()
  };
}

function contextualChoiceFields() {
  return {
    question: { type: "string" },
    selectionMode: { type: "string", enum: ["single", "multiple"] },
    selectionCriterion: { type: "string", enum: ["correct", "incorrect", "best"] },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 7,
      items: choiceOptionSchema()
    },
    answerIds: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
      items: { type: "string", minLength: 1 }
    }
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

function replaceEmbeddedFlowReferences(value) {
  if (Array.isArray(value)) return value.map(replaceEmbeddedFlowReferences);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === "$ref" && child === "#/$defs/node") {
      return [key, "#/$defs/flowNode"];
    }
    if (key === "$ref" && child === "#/$defs/practice") {
      return [key, "#/$defs/flowPractice"];
    }
    return [key, replaceEmbeddedFlowReferences(child)];
  }));
}

function embeddedFlowStructureContract() {
  const source = replaceEmbeddedFlowReferences(
    structuredClone(FLOWCHART_STRUCTURE_INPUT_SCHEMA)
  );
  const { $defs = {} } = source;
  const root = { ...source };
  delete root.$id;
  delete root.$defs;
  return {
    root,
    $defs: {
      flowPractice: $defs.practice,
      flowNode: $defs.node
    }
  };
}

function flowStructureSchema() {
  return embeddedFlowStructureContract().root;
}

function flowStructureDefinitions() {
  return embeddedFlowStructureContract().$defs;
}

function choiceOptionsSchema() {
  return {
    type: "array",
    minItems: 2,
    maxItems: 7,
    items: choiceOptionSchema()
  };
}

function graphVertexSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "label"],
    properties: {
      id: { type: "string" },
      label: { type: "string" }
    }
  };
}

function graphEdgeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "from", "to"],
    properties: {
      id: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      label: { type: "string" },
      weight: { type: "string" },
      directed: { type: "boolean" }
    }
  };
}

function treeNodeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "parentId"],
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      entryType: { type: "string", enum: ["directory", "file", "symlink"] },
      parentId: { type: ["string", "null"] }
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
    additionalProperties: false,
    required: ["id", "kind"],
    allOf: [{
      if: {
        required: ["kind"],
        properties: { kind: { const: "table" } }
      },
      then: { required: ["columns", "rows"] }
    }],
    properties: {
      id: { type: "string", minLength: 1 },
      kind: {
        type: "string",
        enum: COMPOSITE_BLOCK_TYPES
      },
      value: { type: "string" },
      question: { type: "string" },
      selectionMode: { type: "string", enum: ["single", "multiple"] },
      selectionCriterion: { type: "string", enum: ["correct", "incorrect", "best"] },
      options: choiceOptionsSchema(),
      answerIds: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      },
      prompt: { type: "string" },
      language: { type: "string" },
      code: { type: "string" },
      layout: { type: "string" },
      columnMeta: { type: "array", items: { type: "object" } },
      columns: { type: "array", items: { type: "string" } },
      rows: { type: "array", items: { type: "array", items: { type: "string" } } },
      structure: flowStructureSchema(),
      variant: { type: "string" },
      groups: { type: "array", items: systemMapGroupSchema() },
      nodes: {
        type: "array",
        items: {
          oneOf: [treeNodeSchema(), systemMapNodeSchema()]
        }
      },
      links: { type: "array", items: systemMapLinkSchema() },
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
      expression: { type: "object" },
      chartType: { type: "string" },
      xAxis: labeledAxisSchema(),
      yAxis: labeledAxisSchema(),
      series: { type: "array", items: chartSeriesSchema() },
      items: { type: "array", items: sequenceItemSchema() },
      segments: { type: "array", items: annotatedSegmentSchema() },
      annotations: { type: "array", items: annotationSchema() },
      writingMode: { type: "string", enum: ["horizontal", "vertical"] },
      alignment: { type: "string", enum: ["word", "morpheme"] },
      units: { type: "array", items: linguisticUnitSchema() },
      reactionType: {
        type: "string",
        enum: ["forward", "reversible", "equilibrium"]
      },
      reactants: { type: "array", items: reactionSpeciesSchema() },
      products: { type: "array", items: reactionSpeciesSchema() },
      conditions: { type: "array", items: { type: "string" } },
      ...textMetadataFields()
    }
  };
}

const CARD_SCHEMA_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "paragraph",
    label: getResourceLabel("paragraph"),
    shortDescription: "Texto para teoria, resposta digitada ou lacuna por opções.",
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
    label: getResourceLabel("choice"),
    shortDescription: "Pergunta objetiva de seleção única ou múltipla, com 2 a 7 alternativas.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "resource",
        "kind",
        "exercise",
        "title",
        "question",
        "selectionMode",
        "selectionCriterion",
        "options",
        "answerIds",
        "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "choice" },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "composite",
    label: getResourceLabel("composite"),
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
    label: getResourceLabel("code"),
    shortDescription: "Trecho de código ou comando com teoria, resposta digitada, lacuna por opções ou pergunta objetiva.",
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
    label: getResourceLabel("table"),
    shortDescription: "Linhas e colunas curtas com teoria ou pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "columns", "rows", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "table" },
        layout: { type: "string", enum: ["compact", "auto", "wide"] },
        columnMeta: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["align", "wrap"],
            properties: {
              align: { type: "string", enum: ["left", "center", "right", "numeric"] },
              wrap: { type: "boolean" }
            }
          }
        },
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "flow",
    label: getResourceLabel("flow"),
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
    label: getResourceLabel("tree"),
    shortDescription: "Árvore simples de nós hierárquicos com teoria ou pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "prompt", "variant", "nodes", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "tree" },
        prompt: { type: "string" },
        variant: {
          type: "string",
          enum: ["filesystem", "hierarchy", "taxonomy", "phylogeny", "syntax", "organization"]
        },
        nodes: { type: "array", items: treeNodeSchema() },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "graph",
    label: getResourceLabel("graph"),
    shortDescription: "Grafo estrutural com layout resolvido pelo motor e pergunta objetiva.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["position", "resource", "kind", "exercise", "title", "prompt", "vertices", "edges", "after"],
      properties: {
        ...pedagogicFields(),
        resource: { const: "graph" },
        prompt: { type: "string" },
        layout: {
          type: "string",
          enum: ["auto", "path", "cycle", "star", "hierarchical", "network", "causal"]
        },
        vertices: { type: "array", items: graphVertexSchema() },
        edges: { type: "array", items: graphEdgeSchema() },
        highlight: {
          type: "object",
          additionalProperties: false,
          properties: {
            vertices: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: { type: "string" }
            },
            edges: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: { type: "string" }
            }
          }
        },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "relation_map",
    label: getResourceLabel("relation_map"),
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
    label: getResourceLabel("matrix"),
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
    label: getResourceLabel("plane"),
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
    label: getResourceLabel("formula"),
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
  }),
  Object.freeze({
    id: "chart",
    label: getResourceLabel("chart"),
    shortDescription: "Gráfico estatístico determinístico para tendência, distribuição e comparação.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position", "resource", "kind", "exercise", "title", "prompt",
        "chartType", "xAxis", "yAxis", "series", "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "chart" },
        prompt: { type: "string" },
        chartType: {
          type: "string",
          enum: ["bar", "line", "scatter", "histogram", "boxplot"]
        },
        xAxis: labeledAxisSchema(),
        yAxis: labeledAxisSchema(),
        series: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: chartSeriesSchema()
        },
        highlight: {
          type: "object",
          additionalProperties: false,
          required: ["points"],
          properties: {
            points: {
              type: "array",
              uniqueItems: true,
              items: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                prefixItems: [
                  { type: "string" },
                  { type: ["string", "number"] }
                ],
                items: false
              }
            }
          }
        },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "sequence",
    label: getResourceLabel("sequence"),
    shortDescription: "Ordem, cronologia, procedimento ou ciclo sem ramificação.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position", "resource", "kind", "exercise", "title", "prompt",
        "variant", "items", "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "sequence" },
        prompt: { type: "string" },
        variant: {
          type: "string",
          enum: ["ordered_steps", "timeline", "lifecycle", "cycle", "code_blocks"]
        },
        items: {
          type: "array",
          minItems: 2,
          maxItems: 12,
          items: sequenceItemSchema()
        },
        highlight: {
          type: "object",
          additionalProperties: false,
          required: ["itemIds"],
          properties: {
            itemIds: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: { type: "string", minLength: 1 }
            }
          }
        },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "annotated_text",
    label: getResourceLabel("annotated_text"),
    shortDescription: "Trechos curtos com anotações locais para interpretação e argumentação.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position", "resource", "kind", "exercise", "title", "prompt",
        "segments", "annotations", "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "annotated_text" },
        prompt: { type: "string" },
        segments: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: annotatedSegmentSchema()
        },
        annotations: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: annotationSchema()
        },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "linguistic_example",
    label: getResourceLabel("linguistic_example"),
    shortDescription: "Forma, leitura, IPA, glosa e tradução alinhadas por unidade.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position", "resource", "kind", "exercise", "title", "prompt",
        "languageTag", "writingMode", "alignment", "units", "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "linguistic_example" },
        prompt: { type: "string" },
        writingMode: { type: "string", enum: ["horizontal", "vertical"] },
        alignment: { type: "string", enum: ["word", "morpheme"] },
        units: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: linguisticUnitSchema()
        },
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "system_map",
    label: getResourceLabel("system_map"),
    shortDescription:
      "Limites, agrupamentos, componentes e conexões de um sistema sem geometria autoral.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "resource",
        "kind",
        "exercise",
        "title",
        "prompt",
        "groups",
        "nodes",
        "links",
        "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "system_map" },
        prompt: { type: "string", minLength: 1 },
        groups: {
          type: "array",
          minItems: 1,
          items: systemMapGroupSchema()
        },
        nodes: {
          type: "array",
          minItems: 1,
          items: systemMapNodeSchema()
        },
        links: {
          type: "array",
          items: systemMapLinkSchema()
        },
        highlight: systemMapHighlightSchema(),
        ...contextualChoiceFields()
      }
    }
  }),
  Object.freeze({
    id: "reaction",
    label: getResourceLabel("reaction"),
    shortDescription:
      "Equação de reação com espécies, coeficientes, estados, condições e direção explícita.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "resource",
        "kind",
        "exercise",
        "title",
        "prompt",
        "reactionType",
        "reactants",
        "products",
        "conditions",
        "after"
      ],
      properties: {
        ...pedagogicFields(),
        resource: { const: "reaction" },
        prompt: { type: "string", minLength: 1 },
        reactionType: {
          type: "string",
          enum: ["forward", "reversible", "equilibrium"]
        },
        reactants: {
          type: "array",
          minItems: 1,
          items: reactionSpeciesSchema()
        },
        products: {
          type: "array",
          minItems: 1,
          items: reactionSpeciesSchema()
        },
        conditions: {
          type: "array",
          items: { type: "string", minLength: 1 }
        },
        highlight: reactionHighlightSchema(),
        ...contextualChoiceFields()
      }
    }
  })
]);

const RESOURCE_LIMITS = Object.freeze({
  paragraph: Object.freeze({
    semantic: Object.freeze({ maxParagraphs: 4, maxCharacters: 1800 }),
    mobile: Object.freeze({ maxViewportHeights: 2 })
  }),
  choice: Object.freeze({
    semantic: Object.freeze({ minOptions: 2, maxOptions: 7 }),
    mobile: Object.freeze({ minTargetSizeCssPx: 44, maxOptionsWithoutSectioning: 7 })
  }),
  composite: Object.freeze({
    semantic: Object.freeze({ minBlocks: 2, maxBlocks: MOBILE_CARD_BLOCK_LIMIT }),
    mobile: Object.freeze({ maxBlocks: MOBILE_CARD_BLOCK_LIMIT })
  }),
  code: Object.freeze({
    semantic: Object.freeze({ maxLines: 32, maxLineLength: 120 }),
    mobile: Object.freeze({ horizontalScrollWhenRequired: true })
  }),
  table: Object.freeze({
    semantic: Object.freeze({ maxColumns: 7, maxRows: 16 }),
    mobile: Object.freeze({ maxColumnsWithoutHorizontalScroll: 3 })
  }),
  flow: Object.freeze({
    semantic: Object.freeze({ maxNodes: 24, maxDepth: 6 }),
    mobile: Object.freeze({ preferredDirection: "vertical", maxVisibleBranches: 4 })
  }),
  tree: Object.freeze({
    semantic: Object.freeze({ maxNodes: 32, maxDepth: 7 }),
    mobile: Object.freeze({ defaultLayout: "outline" })
  }),
  graph: Object.freeze({
    semantic: Object.freeze({ maxVertices: 16, maxEdges: 24 }),
    mobile: Object.freeze({ maxLegendEntries: 8 })
  }),
  relation_map: Object.freeze({
    semantic: Object.freeze({ maxItemsPerSet: 8, maxRelations: 16 }),
    mobile: Object.freeze({ auxiliaryPairsAfterCrossingThreshold: 8 })
  }),
  matrix: Object.freeze({
    semantic: Object.freeze({ maxRows: 4, maxColumns: 5, maxSequenceItems: 5 }),
    mobile: Object.freeze({ wrapSequence: true })
  }),
  plane: Object.freeze({
    semantic: Object.freeze({ maxObjects: 10 }),
    mobile: Object.freeze({ labelsMustNotOverlap: true })
  }),
  formula: Object.freeze({
    semantic: Object.freeze({ maxDepth: 10, maxLeaves: 64 }),
    mobile: Object.freeze({ wrapRows: true })
  }),
  chart: Object.freeze({
    semantic: Object.freeze({ maxSeries: 6, maxPointsPerSeries: 24 }),
    mobile: Object.freeze({ minPlotHeightCssPx: 220, legendWraps: true })
  }),
  sequence: Object.freeze({
    semantic: Object.freeze({ minItems: 2, maxItems: 12 }),
    mobile: Object.freeze({ preferredDirection: "vertical" })
  }),
  annotated_text: Object.freeze({
    semantic: Object.freeze({ maxSegments: 12, maxAnnotations: 12 }),
    mobile: Object.freeze({ annotationsRemainAdjacent: true })
  }),
  linguistic_example: Object.freeze({
    semantic: Object.freeze({ maxUnits: 12 }),
    mobile: Object.freeze({ rowsWrapByUnit: true })
  }),
  system_map: Object.freeze({
    semantic: Object.freeze({
      maxGroups: 8,
      maxGroupDepth: 4,
      maxNodes: 16,
      maxLinks: 24
    }),
    mobile: Object.freeze({
      nestedBoundariesCollapseToOutline: true,
      maxVisibleDepth: 4
    })
  }),
  reaction: Object.freeze({
    semantic: Object.freeze({
      maxSpeciesPerSide: 8,
      maxConditions: 4
    }),
    mobile: Object.freeze({
      equationWrapsBySemanticPart: true
    })
  })
});

function paragraphTextPattern(maxParagraphs) {
  const separators = Math.max(0, Number(maxParagraphs) || 0);
  return `^(?!(?:[\\s\\S]*?(?:\\r\\n|\\r|\\n)[\\t ]*(?:\\r\\n|\\r|\\n)){${separators}})[\\s\\S]*$`;
}

function codeTextPattern(maxLines, maxLineLength) {
  const lines = Math.max(1, Number(maxLines) || 1);
  const lineLength = Math.max(1, Number(maxLineLength) || 1);
  const visibleUnit = "(?:\\[\\[[^\\r\\n]*?\\]\\]|(?!\\[\\[)[^\\r\\n])";
  const boundedLine = `(?:${visibleUnit}){0,${lineLength}}`;
  return `^(?:${boundedLine}(?:\\r\\n|\\r|\\n)){0,${lines - 1}}${boundedLine}$`;
}

function boundedMatrixValuesSchema(limits = {}) {
  return {
    type: "array",
    minItems: 1,
    maxItems: limits.maxRows,
    items: {
      type: "array",
      minItems: 1,
      maxItems: limits.maxColumns,
      items: {}
    }
  };
}

function relationItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "label"],
    properties: {
      id: { type: "string", minLength: 1 },
      label: { type: "string", minLength: 1 }
    }
  };
}

function relationSetSchema(maxItems) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "items"],
    properties: {
      label: { type: "string", minLength: 1 },
      items: {
        type: "array",
        minItems: 1,
        maxItems,
        items: relationItemSchema()
      }
    }
  };
}

function relationEntrySchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["from", "to"],
    properties: {
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
      label: { type: "string" }
    }
  };
}

function replaceFlowNodeReferences(value, replacement) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceFlowNodeReferences(item, replacement));
  }
  if (!value || typeof value !== "object") return value;
  if (value.$ref === "#/$defs/flowNode") {
    return structuredClone(replacement);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      replaceFlowNodeReferences(child, replacement)
    ])
  );
}

function capFlowChildLists(nodeSchema, maxNodes) {
  (nodeSchema.oneOf || [nodeSchema]).forEach((branch) => {
    const properties = branch?.properties || {};
    ["items", "thenBranch", "elseBranch", "body", "defaultBranch"]
      .forEach((fieldName) => {
        if (properties[fieldName]?.type === "array") {
          properties[fieldName].maxItems = maxNodes;
        }
      });
    if (properties.cases?.type === "array") {
      properties.cases.maxItems = maxNodes;
      const caseProperties = properties.cases.items?.properties || {};
      ["thenBranch", "body"].forEach((fieldName) => {
        if (caseProperties[fieldName]?.type === "array") {
          caseProperties[fieldName].maxItems = maxNodes;
        }
      });
    }
  });
  return nodeSchema;
}

function boundedFlowStructureSchema(limits = {}) {
  const maxDepth = Math.max(2, Number(limits.maxDepth) || 2);
  const maxNodes = Math.max(1, Number(limits.maxNodes) || 1);
  const canonicalNode = flowStructureDefinitions().flowNode;
  // `not: {}` mantém o ramo impossível para o validador canônico; a forma de
  // objeto evita um item estruturalmente vazio quando o schema é projetado
  // para o subconjunto strict dos providers (a resposta volta a ser validada
  // pelo contrato canônico antes de qualquer aplicação).
  const terminalChild = {
    type: "object",
    additionalProperties: false,
    properties: {},
    not: {}
  };
  const $defs = {};

  // A raiz sequence já ocupa o primeiro nível. As definições finitas abaixo
  // descrevem os níveis filhos sem cruzar dois schemas recursivos por allOf;
  // isso mantém a projeção para providers linear, mesmo no limite de 6 níveis.
  for (let index = 1; index < maxDepth; index += 1) {
    const childReference = index < maxDepth - 1
      ? { $ref: `#/$defs/flowBoundsDepth${index + 1}` }
      : terminalChild;
    $defs[`flowBoundsDepth${index}`] = capFlowChildLists(
      replaceFlowNodeReferences(canonicalNode, childReference),
      maxNodes
    );
  }

  const sequenceBranch = canonicalNode.oneOf.find(
    (branch) => branch?.properties?.kind?.const === "sequence"
  );
  const root = capFlowChildLists(
    replaceFlowNodeReferences(
      sequenceBranch,
      { $ref: "#/$defs/flowBoundsDepth1" }
    ),
    maxNodes
  );
  root.required = [...new Set([...(root.required || []), "items"])];
  root.properties.items.minItems = 1;
  root.properties.items.maxItems = Math.max(0, maxNodes - 1);
  $defs.flowBoundsRoot = root;

  return {
    root: { $ref: "#/$defs/flowBoundsRoot" },
    $defs
  };
}

function replaceFormulaReferences(value, reference) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceFormulaReferences(item, reference));
  }
  if (!value || typeof value !== "object") return value;
  if (value.$ref === "#/$defs/formulaNode") {
    return structuredClone(reference);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      replaceFormulaReferences(child, reference)
    ])
  );
}

function boundedFormulaSchema(baseNode, limits = {}) {
  const maxDepth = Math.max(1, Number(limits.maxDepth) || 1);
  const maxLeaves = Math.max(1, Number(limits.maxLeaves) || 1);
  const leafBranches = structuredClone(baseNode.oneOf.slice(0, 4));
  const $defs = {};
  for (let depth = maxDepth; depth >= 1; depth -= 1) {
    const name = `formulaNodeDepth${depth}`;
    if (depth === maxDepth) {
      $defs[name] = { oneOf: structuredClone(leafBranches) };
      continue;
    }
    const nextReference = { $ref: `#/$defs/formulaNodeDepth${depth + 1}` };
    const node = replaceFormulaReferences(baseNode, nextReference);
    node.oneOf.forEach((branch) => {
      if (branch?.properties?.children) {
        branch.properties.children.maxItems = maxLeaves;
      }
    });
    $defs[name] = node;
  }
  return {
    root: { $ref: "#/$defs/formulaNodeDepth1" },
    $defs
  };
}

function applySemanticLimitsToCardSchema(cardSchema, resource, limits = {}) {
  const schema = structuredClone(cardSchema);
  const properties = schema.properties || {};

  if (resource === "paragraph") {
    properties.text.maxLength = limits.maxCharacters;
    properties.text.pattern = paragraphTextPattern(limits.maxParagraphs);
  }
  if (resource === "choice") {
    properties.options.minItems = limits.minOptions;
    properties.options.maxItems = limits.maxOptions;
  }
  if (resource === "composite") {
    properties.blocks.minItems = limits.minBlocks;
    properties.blocks.maxItems = limits.maxBlocks;
  }
  if (resource === "code") {
    properties.code.maxLength =
      (limits.maxLines * limits.maxLineLength) + ((limits.maxLines - 1) * 2);
    properties.code.pattern = codeTextPattern(
      limits.maxLines,
      limits.maxLineLength
    );
  }
  if (resource === "table") {
    properties.columns.minItems = 1;
    properties.columns.maxItems = limits.maxColumns;
    properties.rows.minItems = 1;
    properties.rows.maxItems = limits.maxRows;
    properties.rows.items.minItems = 1;
    properties.rows.items.maxItems = limits.maxColumns;
    properties.columnMeta.maxItems = limits.maxColumns;
  }
  if (resource === "flow") {
    const bounded = boundedFlowStructureSchema(limits);
    properties.structure = bounded.root;
    schema.$defs = {
      ...(schema.$defs || {}),
      ...bounded.$defs
    };
  }
  if (resource === "tree") {
    properties.nodes.maxItems = limits.maxNodes;
  }
  if (resource === "graph") {
    properties.vertices.maxItems = limits.maxVertices;
    properties.edges.maxItems = limits.maxEdges;
  }
  if (resource === "relation_map") {
    properties.leftSet = relationSetSchema(limits.maxItemsPerSet);
    properties.rightSet = relationSetSchema(limits.maxItemsPerSet);
    properties.relations = {
      type: "array",
      minItems: 1,
      maxItems: limits.maxRelations,
      items: relationEntrySchema()
    };
    properties.pairList.maxItems = limits.maxRelations;
  }
  if (resource === "matrix") {
    properties.values = boundedMatrixValuesSchema(limits);
    properties.sequence.maxItems = limits.maxSequenceItems;
    properties.sequence.items.properties.values =
      boundedMatrixValuesSchema(limits);
  }
  if (resource === "plane") {
    properties.vectors.maxItems = limits.maxObjects;
  }
  if (resource === "formula") {
    const bounded = boundedFormulaSchema(
      schema.$defs.formulaNode,
      limits
    );
    properties.expression = bounded.root;
    schema.$defs = bounded.$defs;
  }
  if (resource === "chart") {
    properties.series.maxItems = limits.maxSeries;
    properties.series.items.properties.values.maxItems =
      limits.maxPointsPerSeries;
  }
  if (resource === "sequence") {
    properties.items.minItems = limits.minItems;
    properties.items.maxItems = limits.maxItems;
  }
  if (resource === "annotated_text") {
    properties.segments.maxItems = limits.maxSegments;
    properties.annotations.maxItems = limits.maxAnnotations;
  }
  if (resource === "linguistic_example") {
    properties.units.maxItems = limits.maxUnits;
  }
  if (resource === "system_map") {
    properties.groups.maxItems = limits.maxGroups;
    properties.nodes.maxItems = limits.maxNodes;
    properties.links.maxItems = limits.maxLinks;
  }
  if (resource === "reaction") {
    properties.reactants.maxItems = limits.maxSpeciesPerSide;
    properties.products.maxItems = limits.maxSpeciesPerSide;
    properties.conditions.maxItems = limits.maxConditions;
  }
  return schema;
}

function authoringGapDefinitionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "response", "answer"],
    properties: {
      id: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
      },
      response: { type: "string", enum: ["choice", "text"] },
      answer: { type: "string", minLength: 1, maxLength: 120 },
      distractors: {
        type: "array",
        maxItems: 5,
        items: { type: "string", minLength: 1, maxLength: 120 }
      },
      acceptedAnswers: {
        type: "array",
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 120 }
      }
    }
  };
}

function buildAuthoringCardSchema(cardSchema, authoring) {
  const source = structuredClone(cardSchema);
  const supportedExercises = structuredClone(authoring?.exercises || []);
  const supportsStructuredPractice =
    authoring?.structuredPracticeTargets
    && Object.keys(authoring.structuredPracticeTargets).length > 0;
  const properties = {
    ...(source.properties || {}),
    id: {
      type: "string",
      minLength: 1,
      maxLength: 160
    },
    position: {
      ...(source.properties?.position || { type: "integer" }),
      minimum: 1
    },
    exercise: {
      ...(source.properties?.exercise || { type: "string" }),
      enum: supportedExercises
    },
    gaps: {
      type: "array",
      maxItems: 120,
      items: authoringGapDefinitionSchema()
    }
  };
  const choiceFields = [
    "question",
    "selectionMode",
    "selectionCriterion",
    "options",
    "answerIds"
  ].filter((fieldName) => Object.hasOwn(properties, fieldName));
  const coherenceRules = [
    {
      if: {
        required: ["kind"],
        properties: { kind: { const: "theory" } }
      },
      then: {
        properties: { exercise: { const: "none" } }
      }
    },
    {
      if: {
        required: ["kind"],
        properties: { kind: { const: "exercise" } }
      },
      then: {
        properties: { exercise: { enum: ["gap", "choice"] } }
      }
    },
    {
      if: {
        required: ["exercise"],
        properties: { exercise: { const: "gap" } }
      },
      then: supportsStructuredPractice ? {} : { required: ["gaps"] },
      else: { not: { required: ["gaps"] } }
    },
    ...(choiceFields.length
      ? [{
          if: {
            required: ["exercise"],
            properties: { exercise: { const: "choice" } }
          },
          then: { required: choiceFields },
          else: {
            not: {
              anyOf: choiceFields.map((fieldName) => ({ required: [fieldName] }))
            }
          }
        }]
      : [])
  ];
  return {
    ...source,
    additionalProperties: false,
    required: [...new Set([...(source.required || []), "id"])],
    properties,
    allOf: [...(source.allOf || []), ...coherenceRules]
  };
}

function buildCanonicalDefinition(schemaDefinition) {
  const authoring = getAuthoringMetadata(schemaDefinition.id);
  if (!authoring) {
    throw new Error(`Registro incompleto para o recurso "${schemaDefinition.id}".`);
  }
  const generation = {
    id: schemaDefinition.id,
    didacticFunction: authoring.purpose,
    useWhen: structuredClone(authoring.useWhen || []),
    avoidWhen: structuredClone(authoring.avoidWhen || []),
    operations: structuredClone(authoring.operations || [])
  };
  const limits = RESOURCE_LIMITS[schemaDefinition.id] || {};
  const interactionCapabilities = {
    exercises: structuredClone(authoring.exercises || []),
    responseModes: structuredClone(authoring.responseModes || []),
    selectionModes: schemaDefinition.id === "choice" ? ["single", "multiple"] : [],
    selectionCriteria: schemaDefinition.id === "choice" ? ["correct", "incorrect", "best"] : []
  };
  const cardSchema = applySemanticLimitsToCardSchema(
    schemaDefinition.schema,
    schemaDefinition.id,
    limits.semantic || {}
  );
  cardSchema.$defs = {
    ...flowStructureDefinitions(),
    ...(cardSchema.$defs || {})
  };
  const authoringSchema = buildAuthoringCardSchema(cardSchema, authoring);
  return Object.freeze({
    id: schemaDefinition.id,
    label: schemaDefinition.label,
    contractVersion: RESOURCE_CONTRACT_VERSION,
    cardSchema,
    authoringSchema,
    interactionCapabilities: Object.freeze(interactionCapabilities),
    gapTargets: Object.freeze(structuredClone(authoring.gapTargets || [])),
    semanticLimits: Object.freeze(structuredClone(limits.semantic || {})),
    mobileLimits: Object.freeze(structuredClone(limits.mobile || {})),
    examples: Object.freeze([structuredClone(authoring.example)]),
    shortDescription: schemaDefinition.shortDescription,
    authoring: Object.freeze(structuredClone(authoring)),
    generation: Object.freeze(structuredClone(generation)),
    schema: cardSchema
  });
}

function labeledAxisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label"],
    properties: {
      label: { type: "string", minLength: 1 },
      unit: { type: "string" }
    }
  };
}

function chartSeriesSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "values"],
    properties: {
      id: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      values: {
        type: "array",
        minItems: 1,
        maxItems: 24,
        items: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          prefixItems: [
            { type: ["string", "number"] },
            { type: "number" }
          ],
          items: false
        }
      }
    }
  };
}

function sequenceItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "label"],
    properties: {
      id: { type: "string", minLength: 1 },
      label: { type: "string", minLength: 1 },
      detail: { type: "string" },
      code: { type: "string" },
      language: { type: "string" }
    }
  };
}

function annotatedSegmentSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "text"],
    properties: {
      id: { type: "string", minLength: 1 },
      text: { type: "string", minLength: 1 }
    }
  };
}

function annotationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "targetIds", "label", "note"],
    properties: {
      id: { type: "string", minLength: 1 },
      targetIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      },
      label: { type: "string", minLength: 1 },
      note: { type: "string", minLength: 1 }
    }
  };
}

function linguisticUnitSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "form", "translation"],
    properties: {
      id: { type: "string", minLength: 1 },
      form: { type: "string", minLength: 1 },
      traditional: { type: "string" },
      simplified: { type: "string" },
      reading: { type: "string" },
      ipa: { type: "string" },
      gloss: { type: "string" },
      translation: { type: "string", minLength: 1 }
    }
  };
}

function systemMapGroupSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "kind", "parentId"],
    properties: {
      id: { type: "string", minLength: 1 },
      label: { type: "string", minLength: 1 },
      kind: {
        type: "string",
        enum: [
          "region",
          "zone",
          "network",
          "cluster",
          "namespace",
          "container",
          "stage",
          "boundary"
        ]
      },
      parentId: {
        type: ["string", "null"],
        minLength: 1
      }
    }
  };
}

function systemMapNodeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "kind", "groupId"],
    properties: {
      id: { type: "string", minLength: 1 },
      label: { type: "string", minLength: 1 },
      kind: {
        type: "string",
        enum: [
          "client",
          "service",
          "database",
          "queue",
          "storage",
          "gateway",
          "worker",
          "external"
        ]
      },
      groupId: {
        type: ["string", "null"],
        minLength: 1
      }
    }
  };
}

function systemMapLinkSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "from", "to"],
    properties: {
      id: { type: "string", minLength: 1 },
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
      label: { type: "string" },
      directed: { type: "boolean" }
    }
  };
}

function systemMapHighlightSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      groupIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      },
      nodeIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      },
      linkIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      }
    }
  };
}

function reactionSpeciesSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "formula", "name"],
    properties: {
      id: { type: "string", minLength: 1 },
      formula: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      coefficient: {
        anyOf: [
          { type: "integer", minimum: 1, maximum: 99 },
          { type: "string", minLength: 1, maxLength: 120 }
        ]
      },
      state: {
        type: "string",
        enum: ["s", "l", "g", "aq"]
      },
      charge: {
        type: "integer",
        minimum: -8,
        maximum: 8
      }
    }
  };
}

function reactionHighlightSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["speciesIds"],
    properties: {
      speciesIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      }
    }
  };
}

export const RESOURCE_DEFINITIONS = Object.freeze(
  CARD_SCHEMA_DEFINITIONS.map(buildCanonicalDefinition)
);

export const CARD_RESOURCE_DEFINITIONS = RESOURCE_DEFINITIONS;

export const RESOURCE_CATALOG = Object.freeze(
  RESOURCE_DEFINITIONS.map((definition) => Object.freeze({
    ...structuredClone(definition.generation),
    supportedExercises: structuredClone(definition.interactionCapabilities.exercises)
  }))
);

export function listResourceDefinitions() {
  return RESOURCE_DEFINITIONS.map(clone);
}

export function getResourceDefinition(resourceId) {
  const definition = RESOURCE_DEFINITIONS.find((item) => item.id === resourceId);
  return definition ? clone(definition) : null;
}

export function listResourceIds() {
  return RESOURCE_DEFINITIONS.map((definition) => definition.id);
}

export function listResourceLabels() {
  return Object.fromEntries(
    RESOURCE_DEFINITIONS.map((definition) => [definition.id, definition.label])
  );
}

export function listCompositeBlockTypes() {
  return [...COMPOSITE_BLOCK_TYPES];
}

export function listCompositeBlockLabels() {
  return { heading: "Título", ...listResourceLabels() };
}

export function listCardResourceDefinitions() {
  return listResourceDefinitions();
}

export function listGenerationResourceDefinitions() {
  return listCardResourceDefinitions();
}

export function getCardResourceDefinition(resourceId) {
  return getResourceDefinition(resourceId);
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

export { AUTHORING_RESOURCE_CONTRACT_VERSION };

export function listAuthoringResourceContracts() {
  return RESOURCE_DEFINITIONS.map((definition) => {
    const value = structuredClone(definition.authoring);
    return {
      resource: value.resource,
      label: value.label,
      purpose: value.purpose,
      operations: value.operations,
      selection: value.selection,
      exercises: value.exercises,
      gapTargets: value.gapTargets,
      structuredPracticeTargets: value.structuredPracticeTargets
        ? Object.keys(value.structuredPracticeTargets)
        : []
    };
  });
}

export function getAuthoringResourceContract(resource) {
  return getResourceDefinition(String(resource || "").trim())?.authoring || null;
}

export function listResourceCatalog() {
  return RESOURCE_CATALOG.map(clone);
}

export function getResourceCatalogItemById(id = "") {
  return RESOURCE_CATALOG.find((item) => item.id === id) || null;
}

export function validateTreeResource(card) {
  const errors = [];
  const nodes = Array.isArray(card?.nodes) ? card.nodes : [];
  const variant = String(card?.variant || "").trim();
  if (!["filesystem", "hierarchy", "taxonomy", "phylogeny", "syntax", "organization"].includes(variant)) {
    errors.push("tree precisa de variant reconhecida.");
  }
  if (!nodes.length) {
    errors.push("tree precisa de nodes.");
    return errors;
  }
  const nodeIds = new Set();
  const nodesById = new Map();
  nodes.forEach((node) => {
    const id = typeof node?.id === "string" ? node.id.trim() : "";
    const label = typeof node?.label === "string" ? node.label.trim() : "";
    if (!id || nodeIds.has(id)) {
      errors.push("Cada nó da árvore precisa de id único.");
    }
    nodeIds.add(id);
    if (id) nodesById.set(id, node);
    if (!label) {
      errors.push("Cada nó da árvore precisa de label.");
    }
    if (variant === "filesystem" &&
        !["directory", "file", "symlink"].includes(String(node?.entryType || ""))) {
      errors.push("Cada nó filesystem precisa de entryType reconhecido.");
    }
    if (variant !== "filesystem" && node?.entryType !== undefined) {
      errors.push("entryType só pode existir em tree filesystem.");
    }
  });
  nodes.forEach((node) => {
    const id = typeof node?.id === "string" ? node.id.trim() : "";
    const parentId = typeof node?.parentId === "string" ? node.parentId.trim() : "";
    if (node?.parentId != null && (!parentId || !nodesById.has(parentId))) {
      errors.push(`O nó ${id || "sem id"} aponta para um ramo pai inexistente.`);
      return;
    }
    if (variant === "filesystem" && parentId &&
        nodesById.get(parentId)?.entryType !== "directory") {
      errors.push(`O pai de ${id || "um nó"} precisa ser um diretório.`);
    }
    const visited = new Set([id]);
    let currentParentId = parentId;
    while (currentParentId) {
      if (visited.has(currentParentId)) {
        errors.push(`A hierarquia do nó ${id || "sem id"} contém um ciclo.`);
        break;
      }
      visited.add(currentParentId);
      const parent = nodesById.get(currentParentId);
      currentParentId = typeof parent?.parentId === "string" ? parent.parentId.trim() : "";
    }
  });
  return errors;
}

export function validateGraphResource(card) {
  const errors = [];
  const vertices = Array.isArray(card?.vertices) ? card.vertices : [];
  const edges = Array.isArray(card?.edges) ? card.edges : [];
  if (card?.layout !== undefined &&
      !["auto", "path", "cycle", "star", "hierarchical", "network", "causal"].includes(String(card.layout))) {
    errors.push("layout do grafo usa um preset semântico inválido.");
  }
  if (!vertices.length) {
    errors.push("graph precisa de vertices.");
    return errors;
  }
  const ids = new Set();
  const edgeIds = new Set();
  vertices.forEach((vertex) => {
    if (Object.keys(vertex || {}).some((field) => !["id", "label"].includes(field))) {
      errors.push("Vértices aceitam somente id e label; geometria é calculada pelo renderer.");
    }
    const id = typeof vertex?.id === "string" ? vertex.id.trim() : "";
    const label = typeof vertex?.label === "string" ? vertex.label.trim() : "";
    if (!id || ids.has(id)) {
      errors.push("Cada vértice do grafo precisa de id único.");
    }
    ids.add(id);
    if (!label) errors.push("Cada vértice do grafo precisa de label.");
  });
  edges.forEach((edge) => {
    if (Object.keys(edge || {}).some((field) =>
      !["id", "from", "to", "label", "weight", "directed"].includes(field))) {
      errors.push("Aresta contém campo fora do contrato.");
    }
    const id = typeof edge?.id === "string" ? edge.id.trim() : "";
    if (!id || edgeIds.has(id)) {
      errors.push("Cada aresta do grafo precisa de id único.");
    }
    edgeIds.add(id);
    const from = typeof edge?.from === "string" ? edge.from.trim() : "";
    const to = typeof edge?.to === "string" ? edge.to.trim() : "";
    if (!from || !to || !ids.has(from) || !ids.has(to)) {
      errors.push("Toda aresta do grafo deve ligar vértices existentes.");
    }
    if (edge?.directed !== undefined && typeof edge.directed !== "boolean") {
      errors.push("directed da aresta deve ser booleano.");
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
