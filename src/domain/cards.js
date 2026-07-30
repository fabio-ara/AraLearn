import { buildScopedKey } from "../core/ids.js";
import {
  getChoiceOptionComparableValue,
  normalizeChoiceComparableValue,
  normalizeChoiceOption
} from "../core/choiceOptions.js";
import { buildResourceGapModel, resourceHasGap } from "../core/resourceGaps.js";
import { hasTextGapSyntax, parseTextGapTokens } from "../core/textGaps.js";
import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import {
  normalizeFlowchartStructure,
  validateFlowchartStructureContract
} from "../flowchart/flowchartStructure.js";
import {
  CARD_EXERCISE_VALUES,
  isExerciseCardShape,
  isTheoryCardShape
} from "./cardExerciseSupport.js";
import { isSupportedResourceType } from "./resources.js";
import {
  isFormulaNotation,
  validateFormulaExpression
} from "./formulaExpression.js";
import {
  CARD_AFTER_BLOCKS_MAX_ITEMS,
  getCardResourceDefinition
} from "../resources/registry/index.js";

const CARD_KINDS = new Set(["theory", "exercise"]);
const EXERCISE_KINDS = new Set(CARD_EXERCISE_VALUES);
const MATRIX_CONNECTORS = new Set(["=", "+", "-", "×", "*", "·", "→", "->", "⇒"]);
const MATRIX_HIGHLIGHT_PATTERNS = new Set(["mainDiagonal"]);

function canonicalResourceFieldSchema(resource, field) {
  const schema = getCardResourceDefinition(resource)?.cardSchema?.properties?.[field];
  if (!schema) {
    throw new Error(`Campo ${resource}.${field} ausente no registro canônico de resources.`);
  }
  return structuredClone(schema);
}

function canonicalResourceDefinitions(resource) {
  return structuredClone(
    getCardResourceDefinition(resource)?.cardSchema?.$defs || {}
  );
}

function canonicalSemanticLimits(resource) {
  const limits = getCardResourceDefinition(resource)?.semanticLimits;
  if (!limits) {
    throw new Error(`Limites semânticos ausentes para o resource ${resource}.`);
  }
  return limits;
}

export const COMPOSITE_BLOCK_FIELDS_BY_KIND = Object.freeze({
  heading: Object.freeze(["id", "kind", "value", "languageTag", "textDirection"]),
  paragraph: Object.freeze(["id", "kind", "value", "languageTag", "textDirection"]),
  choice: Object.freeze([
    "id",
    "kind",
    "question",
    "selectionMode",
    "selectionCriterion",
    "options",
    "answerIds",
    "languageTag",
    "textDirection"
  ]),
  code: Object.freeze(["id", "kind", "prompt", "language", "code", "languageTag", "textDirection"]),
  table: Object.freeze(["id", "kind", "columns", "rows", "layout", "columnMeta", "languageTag", "textDirection"]),
  flow: Object.freeze(["id", "kind", "prompt", "structure", "languageTag", "textDirection"]),
  tree: Object.freeze(["id", "kind", "prompt", "variant", "nodes", "languageTag", "textDirection"]),
  graph: Object.freeze(["id", "kind", "prompt", "layout", "vertices", "edges", "highlight", "languageTag", "textDirection"]),
  relation_map: Object.freeze([
    "id", "kind", "prompt", "leftSet", "rightSet", "relations", "pairList",
    "relationTable", "highlight", "languageTag", "textDirection"
  ]),
  matrix: Object.freeze([
    "id", "kind", "prompt", "name", "values", "highlight", "dividerAfterColumn",
    "sequence", "languageTag", "textDirection"
  ]),
  plane: Object.freeze([
    "id", "kind", "prompt", "x", "y", "vector", "vectors", "sum", "scale",
    "distance", "result", "languageTag", "textDirection"
  ]),
  formula: Object.freeze([
    "id", "kind", "prompt", "notation", "accessibleText", "expression",
    "languageTag", "textDirection"
  ]),
  chart: Object.freeze([
    "id", "kind", "prompt", "chartType", "xAxis", "yAxis", "series", "highlight",
    "languageTag", "textDirection"
  ]),
  sequence: Object.freeze([
    "id", "kind", "prompt", "variant", "items", "highlight",
    "languageTag", "textDirection"
  ]),
  annotated_text: Object.freeze([
    "id", "kind", "prompt", "segments", "annotations", "languageTag", "textDirection"
  ]),
  linguistic_example: Object.freeze([
    "id", "kind", "prompt", "languageTag", "textDirection", "writingMode",
    "alignment", "units"
  ]),
  system_map: Object.freeze([
    "id", "kind", "prompt", "groups", "nodes", "links", "highlight",
    "languageTag", "textDirection"
  ]),
  reaction: Object.freeze([
    "id", "kind", "prompt", "reactionType", "reactants", "products",
    "conditions", "highlight", "languageTag", "textDirection"
  ])
});

const COMPOSITE_TEXT_INPUT_SCHEMA = Object.freeze({ type: "string" });
const COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 20000
});
const COMPOSITE_IDENTIFIER_INPUT_SCHEMA = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160
});
const COMPOSITE_SCALAR_INPUT_SCHEMA = Object.freeze({
  type: ["string", "number", "boolean", "null"]
});
const COMPOSITE_COORDINATE_INPUT_SCHEMA = Object.freeze({
  type: "array",
  minItems: 2,
  maxItems: 2,
  items: { type: "number" }
});
const COMPOSITE_MATRIX_VALUES_INPUT_SCHEMA = Object.freeze({
  ...canonicalResourceFieldSchema("matrix", "values"),
  items: {
    ...canonicalResourceFieldSchema("matrix", "values").items,
    items: COMPOSITE_SCALAR_INPUT_SCHEMA
  }
});
const COMPOSITE_TEXT_METADATA_INPUT_PROPERTIES = Object.freeze({
  languageTag: {
    type: "string",
    minLength: 2,
    maxLength: 63
  },
  textDirection: {
    type: "string",
    enum: ["auto", "ltr", "rtl"]
  }
});

function compositeObjectSchema(required, properties) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties
  };
}

function compositeBlockInputBranch(kind, required, properties) {
  const allProperties = {
    id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
    kind: { const: kind },
    ...COMPOSITE_TEXT_METADATA_INPUT_PROPERTIES,
    ...properties
  };
  return compositeObjectSchema(
    ["id", "kind", ...required],
    Object.fromEntries(
      COMPOSITE_BLOCK_FIELDS_BY_KIND[kind].map((fieldName) => [
        fieldName,
        allProperties[fieldName]
      ])
    )
  );
}

const COMPOSITE_CHOICE_OPTION_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    { type: "string", minLength: 1, maxLength: 20000 },
    compositeObjectSchema(
      ["id", "kind", "text"],
      {
        id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
        kind: { const: "text" },
        text: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        feedback: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        misconceptionId: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
      }
    ),
    compositeObjectSchema(
      ["id", "kind", "language", "code"],
      {
        id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
        kind: { const: "code" },
        language: { type: "string", minLength: 1, maxLength: 80 },
        code: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        feedback: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        misconceptionId: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
      }
    )
  ]
});
const COMPOSITE_TREE_NODE_INPUT_SCHEMA = compositeObjectSchema(
  ["id", "label", "parentId"],
  {
    id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
    label: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
    entryType: { type: "string", enum: ["directory", "file", "symlink"] },
    parentId: { type: ["string", "null"], maxLength: 160 }
  }
);
const COMPOSITE_GRAPH_VERTEX_INPUT_SCHEMA = compositeObjectSchema(
  ["id", "label"],
  {
    id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
    label: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA
  }
);
const COMPOSITE_GRAPH_EDGE_INPUT_SCHEMA = compositeObjectSchema(
  ["id", "from", "to"],
  {
    id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
    from: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
    to: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
    label: COMPOSITE_TEXT_INPUT_SCHEMA,
    weight: COMPOSITE_TEXT_INPUT_SCHEMA,
    directed: { type: "boolean" }
  }
);
const COMPOSITE_RELATION_SET_INPUT_SCHEMA = compositeObjectSchema(
  ["label", "items"],
  {
    label: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
    items: {
      type: "array",
      minItems: 1,
      maxItems: canonicalSemanticLimits("relation_map").maxItemsPerSet,
      items: compositeObjectSchema(
        ["id", "label"],
        {
          id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
          label: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA
        }
      )
    }
  }
);
const COMPOSITE_MATRIX_HIGHLIGHT_INPUT_SCHEMA = compositeObjectSchema(
  [],
  {
    pattern: { const: "mainDiagonal" },
    cells: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "integer", minimum: 0 }
      }
    },
    rows: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "integer", minimum: 0 }
    },
    columns: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "integer", minimum: 0 }
    }
  }
);
const COMPOSITE_MATRIX_SEQUENCE_ITEM_INPUT_SCHEMA = compositeObjectSchema(
  ["values"],
  {
    name: COMPOSITE_TEXT_INPUT_SCHEMA,
    connector: {
      type: "string",
      enum: [...MATRIX_CONNECTORS]
    },
    values: COMPOSITE_MATRIX_VALUES_INPUT_SCHEMA,
    highlight: COMPOSITE_MATRIX_HIGHLIGHT_INPUT_SCHEMA
  }
);

/**
 * Linguagem formal dos blocos de um card composite.
 *
 * O mapa de campos acima também governa a rejeição de campos desconhecidos no
 * validador do runtime. O MCP importa este esquema, inclusive as gramáticas
 * recursivas de flow e formula, em vez de manter uma segunda enumeração.
 */
export const COMPOSITE_BLOCK_INPUT_SCHEMA = Object.freeze({
  $id: "urn:aralearn:schema:composite-block:v1",
  $defs: {
    ...canonicalResourceDefinitions("flow"),
    ...canonicalResourceDefinitions("formula")
  },
  oneOf: [
    compositeBlockInputBranch("heading", ["value"], {
      value: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA
    }),
    compositeBlockInputBranch("paragraph", ["value"], {
      value: {
        ...canonicalResourceFieldSchema("paragraph", "text"),
        minLength: 1
      }
    }),
    compositeBlockInputBranch(
      "choice",
      ["question", "selectionMode", "selectionCriterion", "options", "answerIds"],
      {
      id: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
      question: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
      selectionMode: { type: "string", enum: ["single", "multiple"] },
      selectionCriterion: { type: "string", enum: ["correct", "incorrect", "best"] },
      options: {
        type: "array",
        minItems: 2,
        maxItems: 7,
        items: COMPOSITE_CHOICE_OPTION_INPUT_SCHEMA
      },
      answerIds: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        uniqueItems: true,
        items: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
      }
    }),
    compositeBlockInputBranch("code", ["prompt", "language", "code"], {
      prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
      language: { type: "string", minLength: 1, maxLength: 80 },
      code: {
        ...canonicalResourceFieldSchema("code", "code"),
        minLength: 1
      }
    }),
    compositeBlockInputBranch("table", ["columns", "rows"], {
      layout: {
        type: "string",
        enum: ["compact", "auto", "wide"]
      },
      columnMeta: {
        type: "array",
        maxItems: canonicalSemanticLimits("table").maxColumns,
        items: compositeObjectSchema(
          ["align", "wrap"],
          {
            align: { type: "string", enum: ["left", "center", "right", "numeric"] },
            wrap: { type: "boolean" }
          }
        )
      },
      columns: {
        type: "array",
        minItems: 1,
        maxItems: canonicalSemanticLimits("table").maxColumns,
        items: COMPOSITE_TEXT_INPUT_SCHEMA
      },
      rows: {
        type: "array",
        minItems: 1,
        maxItems: canonicalSemanticLimits("table").maxRows,
        items: {
          type: "array",
          minItems: 1,
          maxItems: canonicalSemanticLimits("table").maxColumns,
          items: COMPOSITE_SCALAR_INPUT_SCHEMA
        }
      }
    }),
    compositeBlockInputBranch("flow", ["structure"], {
      prompt: COMPOSITE_TEXT_INPUT_SCHEMA,
      structure: canonicalResourceFieldSchema("flow", "structure")
    }),
    compositeBlockInputBranch("tree", ["prompt", "variant", "nodes"], {
      prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
      variant: {
        type: "string",
        enum: ["filesystem", "hierarchy", "taxonomy", "phylogeny", "syntax", "organization"]
      },
      nodes: {
        type: "array",
        minItems: 1,
        maxItems: canonicalSemanticLimits("tree").maxNodes,
        items: COMPOSITE_TREE_NODE_INPUT_SCHEMA
      }
    }),
    compositeBlockInputBranch("graph", ["prompt", "vertices", "edges"], {
      prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
      layout: {
        type: "string",
        enum: ["auto", "path", "cycle", "star", "hierarchical", "network", "causal"]
      },
      vertices: {
        type: "array",
        minItems: 1,
        maxItems: canonicalSemanticLimits("graph").maxVertices,
        items: COMPOSITE_GRAPH_VERTEX_INPUT_SCHEMA
      },
      edges: {
        type: "array",
        maxItems: canonicalSemanticLimits("graph").maxEdges,
        items: COMPOSITE_GRAPH_EDGE_INPUT_SCHEMA
      },
      highlight: compositeObjectSchema(
        [],
        {
          vertices: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
          },
          edges: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
          }
        }
      )
    }),
    compositeBlockInputBranch(
      "relation_map",
      ["prompt", "leftSet", "rightSet", "relations"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        leftSet: COMPOSITE_RELATION_SET_INPUT_SCHEMA,
        rightSet: COMPOSITE_RELATION_SET_INPUT_SCHEMA,
        relations: {
          type: "array",
          minItems: 1,
          maxItems: canonicalSemanticLimits("relation_map").maxRelations,
          items: compositeObjectSchema(
            ["from", "to"],
            {
              from: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
              to: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
              label: COMPOSITE_TEXT_INPUT_SCHEMA
            }
          )
        },
        pairList: {
          type: "array",
          maxItems: canonicalSemanticLimits("relation_map").maxRelations,
          items: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA
        },
        relationTable: compositeObjectSchema(
          ["columns", "rows"],
          {
            columns: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              items: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA
            },
            rows: {
              type: "array",
              minItems: 1,
              maxItems: canonicalSemanticLimits("relation_map").maxRelations,
              items: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                items: COMPOSITE_SCALAR_INPUT_SCHEMA
              }
            }
          }
        ),
        highlight: compositeObjectSchema(
          [],
          {
            leftItems: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
            },
            rightItems: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
            },
            relations: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                items: COMPOSITE_IDENTIFIER_INPUT_SCHEMA
              }
            }
          }
        )
      }
    ),
    {
      ...compositeBlockInputBranch("matrix", [], {
        prompt: COMPOSITE_TEXT_INPUT_SCHEMA,
        name: COMPOSITE_TEXT_INPUT_SCHEMA,
        values: COMPOSITE_MATRIX_VALUES_INPUT_SCHEMA,
        highlight: COMPOSITE_MATRIX_HIGHLIGHT_INPUT_SCHEMA,
        dividerAfterColumn: { type: "integer", minimum: 0 },
        sequence: {
          type: "array",
          minItems: 2,
          maxItems: canonicalSemanticLimits("matrix").maxSequenceItems,
          items: COMPOSITE_MATRIX_SEQUENCE_ITEM_INPUT_SCHEMA
        }
      }),
      anyOf: [
        { required: ["values"] },
        { required: ["sequence"] }
      ]
    },
    {
      ...compositeBlockInputBranch("plane", [], {
        prompt: COMPOSITE_TEXT_INPUT_SCHEMA,
        x: COMPOSITE_COORDINATE_INPUT_SCHEMA,
        y: COMPOSITE_COORDINATE_INPUT_SCHEMA,
        vector: COMPOSITE_COORDINATE_INPUT_SCHEMA,
        vectors: {
          type: "array",
          minItems: 1,
          maxItems: canonicalSemanticLimits("plane").maxObjects,
          items: COMPOSITE_COORDINATE_INPUT_SCHEMA
        },
        sum: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: COMPOSITE_COORDINATE_INPUT_SCHEMA
        },
        scale: compositeObjectSchema(
          ["k", "vector"],
          {
            k: { type: "number" },
            vector: COMPOSITE_COORDINATE_INPUT_SCHEMA
          }
        ),
        distance: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: COMPOSITE_COORDINATE_INPUT_SCHEMA
        },
        result: {
          oneOf: [
            { type: "string", minLength: 1, maxLength: 80 },
            COMPOSITE_COORDINATE_INPUT_SCHEMA
          ]
        }
      }),
      allOf: [{
        anyOf: [
          { required: ["x", "y"] },
          { required: ["vector"] },
          { required: ["vectors"] },
          { required: ["sum"] },
          { required: ["scale"] },
          { required: ["distance"] }
        ]
      }, ...["vector", "vectors", "sum", "scale", "distance"].flatMap(
        (fieldName, index, fields) =>
          fields.slice(index + 1).map((otherField) => ({
            not: { required: [fieldName, otherField] }
          }))
      )]
    },
    compositeBlockInputBranch(
      "formula",
      ["prompt", "notation", "accessibleText", "expression"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        notation: { type: "string", enum: ["mathematics", "chemistry"] },
        accessibleText: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        expression: canonicalResourceFieldSchema("formula", "expression")
      }
    ),
    compositeBlockInputBranch(
      "chart",
      ["prompt", "chartType", "xAxis", "yAxis", "series"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        chartType: canonicalResourceFieldSchema("chart", "chartType"),
        xAxis: canonicalResourceFieldSchema("chart", "xAxis"),
        yAxis: canonicalResourceFieldSchema("chart", "yAxis"),
        series: canonicalResourceFieldSchema("chart", "series"),
        highlight: canonicalResourceFieldSchema("chart", "highlight")
      }
    ),
    compositeBlockInputBranch(
      "sequence",
      ["prompt", "variant", "items"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        variant: canonicalResourceFieldSchema("sequence", "variant"),
        items: canonicalResourceFieldSchema("sequence", "items"),
        highlight: canonicalResourceFieldSchema("sequence", "highlight")
      }
    ),
    compositeBlockInputBranch(
      "annotated_text",
      ["prompt", "segments", "annotations"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        segments: canonicalResourceFieldSchema("annotated_text", "segments"),
        annotations: canonicalResourceFieldSchema("annotated_text", "annotations")
      }
    ),
    compositeBlockInputBranch(
      "linguistic_example",
      ["prompt", "languageTag", "writingMode", "alignment", "units"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        languageTag: COMPOSITE_IDENTIFIER_INPUT_SCHEMA,
        writingMode: canonicalResourceFieldSchema("linguistic_example", "writingMode"),
        alignment: canonicalResourceFieldSchema("linguistic_example", "alignment"),
        units: canonicalResourceFieldSchema("linguistic_example", "units")
      }
    ),
    compositeBlockInputBranch(
      "system_map",
      ["prompt", "groups", "nodes", "links"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        groups: canonicalResourceFieldSchema("system_map", "groups"),
        nodes: canonicalResourceFieldSchema("system_map", "nodes"),
        links: canonicalResourceFieldSchema("system_map", "links"),
        highlight: canonicalResourceFieldSchema("system_map", "highlight")
      }
    ),
    compositeBlockInputBranch(
      "reaction",
      ["prompt", "reactionType", "reactants", "products", "conditions"],
      {
        prompt: COMPOSITE_NON_EMPTY_TEXT_INPUT_SCHEMA,
        reactionType: canonicalResourceFieldSchema("reaction", "reactionType"),
        reactants: canonicalResourceFieldSchema("reaction", "reactants"),
        products: canonicalResourceFieldSchema("reaction", "products"),
        conditions: canonicalResourceFieldSchema("reaction", "conditions"),
        highlight: canonicalResourceFieldSchema("reaction", "highlight")
      }
    )
  ],
  description: "Bloco formal de um card composite."
});

const COMPOSITE_BLOCK_KIND_SET = new Set(
  (COMPOSITE_BLOCK_INPUT_SCHEMA.oneOf || [])
    .map((branch) => branch?.properties?.kind?.const)
    .filter(Boolean)
);

function flowPracticeEntryHasBlank(value) {
  if (value === true) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.blank === true
    || value.blankShape === true
    || value.blankText === true
    || value.blankLabel === true
    || Object.values(value.labels || {}).some(flowPracticeEntryHasBlank)
    || flowPracticeEntryHasBlank(value.text);
}

function flowStructureHasPractice(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(flowStructureHasPractice);
  if (flowPracticeEntryHasBlank(value.practice)) return true;
  return Object.entries(value).some(([key, child]) =>
    key !== "practice" && flowStructureHasPractice(child)
  );
}
const TEXT_DIRECTIONS = new Set(["auto", "ltr", "rtl"]);
const CONSERVATIVE_BCP47_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*$/u;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function countUnicodeCharacters(value) {
  return [...String(value ?? "")].length;
}

function countParagraphs(value) {
  const source = String(value ?? "").trim();
  if (!source) return 0;
  return source
    .split(/(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)+/u)
    .filter((paragraph) => paragraph.trim())
    .length;
}

function hasUnambiguousTextGapSyntax(value) {
  return parseTextGapTokens(value).some((token) => token.valid && token.hasOptions);
}

function codeText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
}

function codeLines(value = "") {
  return String(value || "").split(/\r\n|\r|\n/u);
}

function projectCodeGapChoices(value = "") {
  const source = String(value || "");
  const tokens = parseTextGapTokens(source)
    .filter((token) => token.valid);
  if (!tokens.length) return source;
  let cursor = 0;
  let projected = "";
  tokens.forEach((token) => {
    projected += source.slice(cursor, token.start);
    const candidates = [
      token.answer,
      ...(Array.isArray(token.options) ? token.options : []),
      ...(Array.isArray(token.acceptedAnswers) ? token.acceptedAnswers : [])
    ].filter((candidate) => typeof candidate === "string");
    projected += candidates.reduce(
      (longest, candidate) =>
        countUnicodeCharacters(candidate) > countUnicodeCharacters(longest)
          ? candidate
          : longest,
      ""
    );
    cursor = token.end;
  });
  return projected + source.slice(cursor);
}

function countIndent(line = "") {
  const match = String(line || "").match(/^[ \t]*/);
  return match ? match[0].length : 0;
}

function isCodeBlockStarter(line = "", language = "") {
  const trimmed = text(line);
  if (!trimmed) {
    return false;
  }
  if (/[{[]\s*$/.test(trimmed)) {
    return true;
  }
  if (/:$/.test(trimmed)) {
    return true;
  }
  const normalizedLanguage = text(language).toLowerCase();
  if (normalizedLanguage === "python" && /(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b.*:\s*$/.test(trimmed)) {
    return true;
  }
  return false;
}

function codeNeedsIndentation(value = "", language = "") {
  const lines = codeLines(value).filter((line) => text(line));
  if (lines.length < 2) {
    return false;
  }
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index];
    if (!isCodeBlockStarter(current, language)) {
      continue;
    }
    const currentIndent = countIndent(current);
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (!text(nextLine)) {
        continue;
      }
      const nextIndent = countIndent(nextLine);
      if (text(nextLine).startsWith("}") || /^\s*(elif|else|except|finally)\b/.test(nextLine)) {
        break;
      }
      if (nextIndent <= currentIndent) {
        return true;
      }
      break;
    }
  }
  return false;
}

function uniqueList(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((item) => text(item))
    .filter((item) => {
      const token = item.toLowerCase();
      if (!item || seen.has(token)) {
        return false;
      }
      seen.add(token);
      return true;
    });
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateObjectFields(value, allowedFields, path, errors, label = "objeto") {
  if (!isPlainObject(value)) {
    pushError(errors, path, `${label} precisa ser objeto.`);
    return false;
  }
  Object.keys(value).forEach((fieldName) => {
    if (!allowedFields.includes(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema: "${fieldName}".`);
    }
  });
  return true;
}

function hasOwn(value, fieldName) {
  return Object.prototype.hasOwnProperty.call(value || {}, fieldName);
}

function validateTextMetadata(value, path, errors) {
  if (hasOwn(value, "languageTag")) {
    const languageTag = value.languageTag;
    if (
      typeof languageTag !== "string"
      || languageTag !== languageTag.trim()
      || languageTag.length > 63
      || !CONSERVATIVE_BCP47_PATTERN.test(languageTag)
    ) {
      pushError(
        errors,
        `${path}.languageTag`,
        "languageTag deve usar uma etiqueta BCP 47 simples, como pt-BR, en, ar ou zh-Hant."
      );
    }
  }
  if (hasOwn(value, "textDirection") && !TEXT_DIRECTIONS.has(value.textDirection)) {
    pushError(errors, `${path}.textDirection`, 'textDirection deve ser "auto", "ltr" ou "rtl".');
  }
}

function normalizedTextMetadata(value) {
  return {
    ...(hasOwn(value, "languageTag") ? { languageTag: value.languageTag } : {}),
    ...(hasOwn(value, "textDirection") ? { textDirection: value.textDirection } : {})
  };
}

function isRelationalScalar(value) {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || isFiniteNumber(value);
}

function validateRelationalScalar(value, path, errors, label = "valor") {
  if (!isRelationalScalar(value)) {
    pushError(errors, path, `${label} precisa ser string, número finito, booleano ou null.`);
    return false;
  }
  return true;
}

function validateUniquePrimitiveList(values, path, errors, label) {
  const seen = new Set();
  values.forEach((value, index) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      pushError(errors, `${path}[${index}]`, `${label} não pode repetir valores.`);
    }
    seen.add(key);
  });
}

function validateCoordinatePair(value, path, errors) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => isFiniteNumber(item))) {
    pushError(errors, path, "coordenada precisa ser um par numérico finito [x, y].");
    return false;
  }
  return true;
}

function validateMatrixValues(values, path, errors) {
  const limits = canonicalSemanticLimits("matrix");
  if (!Array.isArray(values) || !values.length) {
    pushError(errors, path, "values precisa ter ao menos uma linha.");
    return false;
  }
  if (values.length > limits.maxRows) {
    pushError(errors, path, `matrix aceita no máximo ${limits.maxRows} linhas.`);
  }
  let columnCount = null;
  values.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || !row.length) {
      pushError(errors, `${path}[${rowIndex}]`, "cada linha precisa ter ao menos uma célula.");
      return;
    }
    if (row.length > limits.maxColumns) {
      pushError(
        errors,
        `${path}[${rowIndex}]`,
        `matrix aceita no máximo ${limits.maxColumns} colunas.`
      );
    }
    if (columnCount === null) {
      columnCount = row.length;
    } else if (row.length !== columnCount) {
      pushError(errors, `${path}[${rowIndex}]`, "todas as linhas da matrix precisam ter o mesmo número de colunas.");
    }
    row.forEach((cell, cellIndex) => {
      validateRelationalScalar(cell, `${path}[${rowIndex}][${cellIndex}]`, errors, "célula da matrix");
      if (String(cell ?? "").trim().length > 80) {
        pushError(errors, `${path}[${rowIndex}][${cellIndex}]`, "cada célula da matrix aceita no máximo 80 caracteres.");
      }
    });
  });
  return true;
}

function acceptedTextGapAnswersAreValid(values) {
  return Array.isArray(values)
    && values.length <= 8
    && values.every(
      (item) => typeof item === "string"
        && item.length > 0
        && item.length <= 120
        && !item.includes("\n")
    );
}

function paragraphGapPartsAreValid(value) {
  const parts = parseTextGapTokens(value);
  if (!parts.length) {
    return false;
  }
  return parts.every(({ answer, options, acceptedAnswers, hasOptions, valid }) => {
    if (!valid) {
      return false;
    }
    if (!answer || answer.length > 40 || answer.split(/\s+/).filter(Boolean).length > 5) {
      return false;
    }
    return acceptedTextGapAnswersAreValid(acceptedAnswers)
      && (!hasOptions || options.filter((item) => item !== answer).length >= 1);
  });
}

function codeGapPartsAreValid(value) {
  const parts = parseTextGapTokens(value);
  if (!parts.length) {
    return false;
  }
  return parts.every(({ answer, options, acceptedAnswers, hasOptions, valid }) => {
    if (!valid || !answer || answer.length > 120 || answer.includes("\n")) {
      return false;
    }
    if (options.some((item) => String(item || "").includes("\n"))) {
      return false;
    }
    return acceptedTextGapAnswersAreValid(acceptedAnswers)
      && (!hasOptions || options.filter((item) => item !== answer).length >= 1);
  });
}

function textGapTokenContractsMatch(left, right) {
  return left?.answer === right?.answer
    && left?.hasOptions === right?.hasOptions
    && left?.hasAcceptedAnswers === right?.hasAcceptedAnswers
    && JSON.stringify(left?.options || []) === JSON.stringify(right?.options || [])
    && JSON.stringify(left?.acceptedAnswers || [])
      === JSON.stringify(right?.acceptedAnswers || []);
}

function validateCommon(card, path, errors) {
  const position = Number(card?.position);
  if (!Number.isInteger(position) || position < 1) {
    pushError(errors, `${path}.position`, "position deve ser inteiro positivo.");
  }

  const resource = text(card?.resource);
  if (!isSupportedResourceType(resource)) {
    pushError(errors, `${path}.resource`, `Recurso inválido: "${resource}".`);
  }

  const kind = text(card?.kind);
  if (!CARD_KINDS.has(kind)) {
    pushError(errors, `${path}.kind`, `kind inválido: "${kind}".`);
  }

  const exercise = text(card?.exercise);
  if (!EXERCISE_KINDS.has(exercise)) {
    pushError(errors, `${path}.exercise`, `exercise inválido: "${exercise}".`);
  }

  const title = text(card?.title);
  if (!title) {
    pushError(errors, `${path}.title`, "title é obrigatório.");
  }

  return { position, resource, kind, exercise, title };
}

function validateSources(card, path, errors) {
  if (card?.sources === undefined) {
    return [];
  }
  if (!Array.isArray(card.sources)) {
    pushError(errors, `${path}.sources`, "sources deve ser array.");
    return [];
  }
  const sources = uniqueList(card.sources);
  if (sources.length !== card.sources.length) {
    pushError(errors, `${path}.sources`, "sources não pode repetir itens vazios ou duplicados.");
  }
  return sources;
}

function validateTopics(card, path, errors) {
  if (card?.topics === undefined) {
    return [];
  }
  if (!Array.isArray(card.topics)) {
    pushError(errors, `${path}.topics`, "topics deve ser array.");
    return [];
  }
  const topics = uniqueList(card.topics);
  if (topics.length !== card.topics.length) {
    pushError(errors, `${path}.topics`, "topics não pode repetir itens vazios ou duplicados.");
  }
  return topics;
}

function validateParagraph(card, path, errors) {
  const limits = canonicalSemanticLimits("paragraph");
  if (text(card?.text) === "") {
    pushError(errors, `${path}.text`, "text é obrigatório em paragraph.");
  }
  if (countUnicodeCharacters(card?.text) > limits.maxCharacters) {
    pushError(
      errors,
      `${path}.text`,
      `paragraph aceita no máximo ${limits.maxCharacters} caracteres.`
    );
  }
  if (countParagraphs(card?.text) > limits.maxParagraphs) {
    pushError(
      errors,
      `${path}.text`,
      `paragraph aceita no máximo ${limits.maxParagraphs} parágrafos.`
    );
  }
  if (text(card?.kind) === "theory") {
    if (text(card?.exercise) !== "none") {
      pushError(errors, `${path}.exercise`, 'paragraph teórico deve usar exercise "none".');
    }
    if (hasUnambiguousTextGapSyntax(card?.text)) {
      pushError(errors, `${path}.text`, "paragraph teórico não pode conter lacunas interativas.");
    }
  }
  if (text(card?.kind) === "exercise") {
    if (text(card?.exercise) !== "gap") {
      pushError(errors, `${path}.exercise`, 'paragraph de exercício deve usar exercise "gap".');
    }
    if (!paragraphGapPartsAreValid(card?.text)) {
      pushError(errors, `${path}.text`, "paragraph de exercício precisa ter lacuna digitada ou por opções válida.");
    }
  }
}

function validateChoiceOption(option, path, errors, index = 0) {
  if (!isPlainObject(option)) {
    pushError(errors, path, "Opção inválida.");
    return null;
  }
  const rawKind = text(option.kind);
  if (rawKind && rawKind !== "text" && rawKind !== "code") {
    pushError(errors, `${path}.kind`, 'kind da opção deve ser "text" ou "code".');
  }
  const allowedFields = new Set([
    "id",
    "kind",
    "text",
    "language",
    "code",
    "feedback",
    "misconceptionId"
  ]);
  Object.keys(option).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema da opção: "${fieldName}".`);
    }
  });

  const normalized = normalizeChoiceOption(option, index);
  if (!normalized.id) {
    pushError(errors, `${path}.id`, "id é obrigatório em cada opção.");
    return null;
  }
  if (option?.feedback !== undefined && !text(option.feedback)) {
    pushError(errors, `${path}.feedback`, "feedback, quando informado, deve ser texto não vazio.");
  }
  if (option?.misconceptionId !== undefined && !text(option.misconceptionId)) {
    pushError(
      errors,
      `${path}.misconceptionId`,
      "misconceptionId, quando informado, deve ser identificador não vazio."
    );
  }

  if (normalized.kind === "code") {
    if (!text(option?.language)) {
      pushError(errors, `${path}.language`, "language é obrigatório em opção de código.");
    }
    if (!normalized.code.trim()) {
      pushError(errors, `${path}.code`, "code é obrigatório em opção de código.");
    }
    if (codeNeedsIndentation(normalized.code, normalized.language)) {
      pushError(errors, `${path}.code`, "code multilinha da opção precisa usar indentação consistente.");
    }
    return normalized;
  }

  if (!normalized.text) {
    pushError(errors, `${path}.text`, "text é obrigatório em cada opção textual.");
  }
  return normalized;
}

function validateChoiceQuestion(card, path, errors) {
  const limits = canonicalSemanticLimits("choice");
  if (!text(card?.question)) {
    pushError(errors, `${path}.question`, "question é obrigatório em exercício choice.");
  }
  const selectionMode = text(card?.selectionMode);
  const selectionCriterion = text(card?.selectionCriterion);
  if (!["single", "multiple"].includes(selectionMode)) {
    pushError(errors, `${path}.selectionMode`, 'selectionMode deve ser "single" ou "multiple".');
  }
  if (!["correct", "incorrect", "best"].includes(selectionCriterion)) {
    pushError(
      errors,
      `${path}.selectionCriterion`,
      'selectionCriterion deve ser "correct", "incorrect" ou "best".'
    );
  }
  if (selectionCriterion === "best" && selectionMode !== "single") {
    pushError(errors, `${path}.selectionMode`, 'selectionCriterion "best" exige selectionMode "single".');
  }
  if (!Array.isArray(card?.options) ||
      card.options.length < limits.minOptions ||
      card.options.length > limits.maxOptions) {
    pushError(
      errors,
      `${path}.options`,
      `exercise choice deve ter entre ${limits.minOptions} e ${limits.maxOptions} opções.`
    );
    return;
  }
  const optionIds = new Set();
  const optionValues = new Set();
  const normalizedOptions = [];
  card.options.forEach((option, index) => {
    const normalized = validateChoiceOption(option, `${path}.options[${index}]`, errors, index);
    if (!normalized) {
      return;
    }
    const id = text(normalized.id);
    if (optionIds.has(id)) {
      pushError(errors, `${path}.options[${index}].id`, `id duplicado: "${id}".`);
    }
    optionIds.add(id);
    const comparableValue = normalizeChoiceComparableValue(normalized, index);
    if (optionValues.has(comparableValue)) {
      pushError(
        errors,
        `${path}.options[${index}]`,
        "Opções distintas não podem repetir o mesmo conteúdo normalizado."
      );
    }
    optionValues.add(comparableValue);
    normalizedOptions.push(normalized);
  });
  const answerIds = Array.isArray(card?.answerIds)
    ? card.answerIds.map((answerId) => text(answerId)).filter(Boolean)
    : [];
  const uniqueAnswerIds = new Set(answerIds);
  if (!answerIds.length || uniqueAnswerIds.size !== answerIds.length) {
    pushError(errors, `${path}.answerIds`, "answerIds deve conter ids únicos e não pode ser vazio.");
  }
  answerIds.forEach((answerId, index) => {
    if (!optionIds.has(answerId)) {
      pushError(
        errors,
        `${path}.answerIds[${index}]`,
        `answerId inexistente: "${answerId}".`
      );
    }
  });
  if (selectionMode === "single" && answerIds.length !== 1) {
    pushError(errors, `${path}.answerIds`, "selectionMode single exige exatamente um answerId.");
  }
  if (
    selectionMode === "multiple"
    && (answerIds.length < 1 || answerIds.length >= card.options.length)
  ) {
    pushError(
      errors,
      `${path}.answerIds`,
      "selectionMode multiple exige ao menos uma resposta, mas não todas as opções."
    );
  }
  normalizedOptions
    .filter((option) => uniqueAnswerIds.has(text(option?.id)))
    .forEach((answerOption) => {
      const comparable = getChoiceOptionComparableValue(answerOption).trim().toLocaleLowerCase("pt-BR");
      if (comparable && text(card?.question).toLocaleLowerCase("pt-BR").includes(comparable)) {
        pushError(errors, `${path}.question`, "question não pode revelar literalmente uma resposta.");
      }
    });
}

function rejectChoiceFields(card, path, errors) {
  [
    "question",
    "selectionMode",
    "selectionCriterion",
    "options",
    "answerIds"
  ].forEach((fieldName) => {
    if (card?.[fieldName] !== undefined) {
      pushError(errors, `${path}.${fieldName}`, `${fieldName} só é permitido em exercício choice.`);
    }
  });
}

function validateContextualChoiceExercise(card, path, errors) {
  if (text(card?.kind) === "theory") {
    if (!isTheoryCardShape(card)) {
      pushError(errors, `${path}.exercise`, `${text(card?.resource)} teórico deve usar exercise "none".`);
    }
    rejectChoiceFields(card, path, errors);
    if (text(card?.resource) === "flow" && flowStructureHasPractice(card?.structure)) {
      pushError(errors, `${path}.structure`, "flow teórico não pode conter prática interativa.");
    }
    return;
  }

  if (text(card?.exercise) === "gap") {
    if (!isExerciseCardShape(card)) {
      pushError(errors, `${path}.exercise`, `${text(card?.resource)} não aceita exercise "gap".`);
      return;
    }
    rejectChoiceFields(card, path, errors);
    if (text(card?.resource) === "flow") {
      if (!flowStructureHasPractice(card?.structure)) {
        pushError(
          errors,
          `${path}.structure`,
          "flow gap precisa declarar ao menos uma lacuna em structure.practice."
        );
      }
      return;
    }

    const model = buildResourceGapModel(card);
    if (!model.gapCount) {
      pushError(
        errors,
        path,
        `${text(card?.resource)} gap precisa ter ao menos uma lacuna em um campo interativo do recurso.`
      );
      return;
    }
    model.tokens.forEach((token) => {
      if (!token.valid || !token.answer || token.answer.length > 120 || token.answer.includes("\n")) {
        pushError(errors, `${path}.${token.path}`, "Lacuna inválida ou extensa demais.");
      } else if (!acceptedTextGapAnswersAreValid(token.acceptedAnswers)) {
        pushError(
          errors,
          `${path}.${token.path}`,
          "Lacuna digitada aceita no máximo 8 respostas alternativas de uma linha."
        );
      } else if (token.hasOptions && token.distractors.length < 1) {
        pushError(errors, `${path}.${token.path}`, "Lacuna por opções precisa de ao menos um distrator.");
      }
    });
    if (text(card?.resource) === "formula") {
      const accessibleTokens = parseTextGapTokens(card?.accessibleText);
      if (
        accessibleTokens.some((token) => !token.valid)
        || accessibleTokens.length !== model.tokens.length
        || accessibleTokens.some(
          (token, index) => !textGapTokenContractsMatch(token, model.tokens[index])
        )
      ) {
        pushError(
          errors,
          `${path}.accessibleText`,
          "formula gap precisa repetir as mesmas lacunas, na mesma ordem, em accessibleText."
        );
      }
    }
    return;
  }

  if (!isExerciseCardShape(card)) {
    pushError(errors, `${path}.exercise`, `${text(card?.resource)} de exercício deve usar exercise "choice".`);
    return;
  }
  validateChoiceQuestion(card, path, errors);
}

function validateChoice(card, path, errors) {
  if (!isExerciseCardShape(card)) {
    pushError(errors, `${path}.kind`, 'choice deve usar kind "exercise" e exercise "choice".');
    return;
  }
  validateChoiceQuestion(card, path, errors);
}

function validateCode(card, path, errors) {
  const normalizedCode = codeText(card?.code);
  const limits = canonicalSemanticLimits("code");
  const lines = codeLines(projectCodeGapChoices(normalizedCode));
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em code.");
  }
  if (!text(card?.language)) {
    pushError(errors, `${path}.language`, "language é obrigatório em code.");
  }
  if (!normalizedCode.trim()) {
    pushError(errors, `${path}.code`, "code é obrigatório em code.");
  }
  if (lines.length > limits.maxLines) {
    pushError(
      errors,
      `${path}.code`,
      `code aceita no máximo ${limits.maxLines} linhas.`
    );
  }
  lines.forEach((line, index) => {
    if (countUnicodeCharacters(line) > limits.maxLineLength) {
      pushError(
        errors,
        `${path}.code[${index}]`,
        `cada linha de code aceita no máximo ${limits.maxLineLength} caracteres.`
      );
    }
  });
  if (codeNeedsIndentation(normalizedCode, card?.language)) {
    pushError(errors, `${path}.code`, "code multilinha precisa usar indentação consistente.");
  }
  if (text(card?.kind) === "theory") {
    if (!isTheoryCardShape(card)) {
      pushError(errors, `${path}.exercise`, 'code teórico deve usar exercise "none".');
    }
    rejectChoiceFields(card, path, errors);
    if (hasUnambiguousTextGapSyntax(normalizedCode)) {
      pushError(errors, `${path}.code`, "code teórico não pode conter lacunas interativas.");
    }
    return;
  }
  if (text(card?.kind) !== "exercise") {
    pushError(errors, `${path}.kind`, 'code deve usar kind "theory" ou "exercise".');
    return;
  }
  if (text(card?.exercise) === "gap") {
    rejectChoiceFields(card, path, errors);
    if (!codeGapPartsAreValid(normalizedCode)) {
      pushError(errors, `${path}.code`, "code gap precisa ter lacuna digitada ou por opções válida.");
    }
    return;
  }
  if (text(card?.exercise) === "choice") {
    validateChoiceQuestion(card, path, errors);
    return;
  }
  pushError(errors, `${path}.exercise`, 'code de exercício deve usar exercise "gap" ou "choice".');
}

function formulaChildNodes(node) {
  if (!isPlainObject(node)) return [];
  if (node.type === "row") return Array.isArray(node.children) ? node.children : [];
  if (node.type === "fraction") return [node.numerator, node.denominator];
  if (node.type === "root") return [node.radicand, node.index].filter(Boolean);
  if (node.type === "superscript") return [node.base, node.exponent];
  if (node.type === "subscript") return [node.base, node.subscript];
  if (node.type === "subsup") {
    return [node.base, node.subscript, node.superscript];
  }
  if (node.type === "fenced") return [node.content];
  return [];
}

function measureFormulaExpression(expression) {
  const result = { depth: 0, leaves: 0 };
  const visited = new WeakSet();
  const visit = (node, depth) => {
    if (!isPlainObject(node) || visited.has(node)) return;
    visited.add(node);
    result.depth = Math.max(result.depth, depth);
    const children = formulaChildNodes(node);
    if (!children.length) {
      result.leaves += 1;
      return;
    }
    children.forEach((child) => visit(child, depth + 1));
  };
  visit(expression, 1);
  return result;
}

function validateFormula(card, path, errors) {
  const limits = canonicalSemanticLimits("formula");
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em formula.");
  }
  if (!isFormulaNotation(card?.notation)) {
    pushError(errors, `${path}.notation`, 'notation deve ser "mathematics" ou "chemistry".');
  }
  if (!text(card?.accessibleText)) {
    pushError(errors, `${path}.accessibleText`, "accessibleText é obrigatório em formula.");
  }
  const expressionResult = validateFormulaExpression(card?.expression, `${path}.expression`);
  expressionResult.errors.forEach((entry) => pushError(errors, entry.path, entry.message));
  const measurement = measureFormulaExpression(card?.expression);
  if (measurement.depth > limits.maxDepth) {
    pushError(
      errors,
      `${path}.expression`,
      `formula aceita profundidade máxima de ${limits.maxDepth} níveis.`
    );
  }
  if (measurement.leaves > limits.maxLeaves) {
    pushError(
      errors,
      `${path}.expression`,
      `formula aceita no máximo ${limits.maxLeaves} folhas.`
    );
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateTable(card, path, errors) {
  const limits = canonicalSemanticLimits("table");
  if (!Array.isArray(card?.columns) || !card.columns.length) {
    pushError(errors, `${path}.columns`, "table precisa de columns.");
  } else if (card.columns.length > limits.maxColumns) {
    pushError(
      errors,
      `${path}.columns`,
      `table aceita no máximo ${limits.maxColumns} colunas.`
    );
  }
  if (!Array.isArray(card?.rows) || !card.rows.length) {
    pushError(errors, `${path}.rows`, "table precisa de rows.");
  } else {
    if (card.rows.length > limits.maxRows) {
      pushError(
        errors,
        `${path}.rows`,
        `table aceita no máximo ${limits.maxRows} linhas.`
      );
    }
    const expectedColumns = Array.isArray(card?.columns) ? card.columns.length : 0;
    card.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || !row.length) {
        pushError(errors, `${path}.rows[${rowIndex}]`, "cada linha da table precisa ter ao menos uma célula.");
        return;
      }
      if (expectedColumns && row.length !== expectedColumns) {
        pushError(
          errors,
          `${path}.rows[${rowIndex}]`,
          `cada linha da table precisa ter ${expectedColumns} células para acompanhar columns.`
        );
      }
      if (row.length > limits.maxColumns) {
        pushError(
          errors,
          `${path}.rows[${rowIndex}]`,
          `cada linha de table aceita no máximo ${limits.maxColumns} células.`
        );
      }
    });
  }
  if (card?.layout !== undefined &&
      !["compact", "auto", "wide"].includes(text(card.layout))) {
    pushError(errors, `${path}.layout`, 'layout de table deve ser "compact", "auto" ou "wide".');
  }
  if (card?.columnMeta !== undefined) {
    if (!Array.isArray(card.columnMeta)) {
      pushError(errors, `${path}.columnMeta`, "columnMeta de table deve ser uma lista.");
    } else {
      const expectedColumns = Array.isArray(card?.columns) ? card.columns.length : 0;
      if (card.columnMeta.length > limits.maxColumns) {
        pushError(
          errors,
          `${path}.columnMeta`,
          `columnMeta aceita no máximo ${limits.maxColumns} itens.`
        );
      }
      if (card.columnMeta.length !== expectedColumns) {
        pushError(
          errors,
          `${path}.columnMeta`,
          "columnMeta de table precisa acompanhar exatamente as colunas declaradas."
        );
      }
      card.columnMeta.forEach((meta, index) => {
        if (!validateObjectFields(
          meta,
          ["align", "wrap"],
          `${path}.columnMeta[${index}]`,
          errors,
          "metadado de coluna"
        )) return;
        if (!["left", "center", "right", "numeric"].includes(text(meta.align))) {
          pushError(errors, `${path}.columnMeta[${index}].align`, "alinhamento de coluna inválido.");
        }
        if (typeof meta.wrap !== "boolean") {
          pushError(errors, `${path}.columnMeta[${index}].wrap`, "wrap de coluna deve ser booleano.");
        }
      });
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function flowChildNodeLists(node) {
  const result = [];
  ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach(
    (fieldName) => {
      if (Array.isArray(node?.[fieldName])) result.push(node[fieldName]);
    }
  );
  (Array.isArray(node?.cases) ? node.cases : []).forEach((entry) => {
    ["thenBranch", "body"].forEach((fieldName) => {
      if (Array.isArray(entry?.[fieldName])) result.push(entry[fieldName]);
    });
  });
  (Array.isArray(node?.branches) ? node.branches : []).forEach((entry) => {
    if (Array.isArray(entry?.items)) result.push(entry.items);
  });
  return result;
}

function measureFlowStructure(structure) {
  const result = { nodes: 0, depth: 0 };
  const visit = (node, depth) => {
    if (!isPlainObject(node)) return;
    result.nodes += 1;
    result.depth = Math.max(result.depth, depth);
    flowChildNodeLists(node).forEach((children) => {
      children.forEach((child) => visit(child, depth + 1));
    });
  };
  visit(structure, 1);
  return result;
}

function validateFlow(card, path, errors) {
  const limits = canonicalSemanticLimits("flow");
  if (!card?.structure || typeof card.structure !== "object" || Array.isArray(card.structure)) {
    pushError(errors, `${path}.structure`, "flow precisa de structure.");
    validateContextualChoiceExercise(card, path, errors);
    return;
  }

  const contractResult = validateFlowchartStructureContract(card.structure);
  if (!contractResult.valid) {
    contractResult.findings.forEach((finding, index) => {
      pushError(errors, `${path}.structure[${index}]`, `estrutura inválida em flow: ${finding}.`);
    });
  }

  const normalized = normalizeFlowchartStructure(card.structure);
  if (!normalized || normalized.kind !== "sequence") {
    pushError(errors, `${path}.structure`, "flow precisa de uma raiz sequence válida.");
  } else if (!Array.isArray(normalized.items) || !normalized.items.length) {
    pushError(errors, `${path}.structure.items`, "flow precisa de ao menos um item na sequence raiz.");
  }
  const measurement = measureFlowStructure(card.structure);
  if (measurement.nodes > limits.maxNodes) {
    pushError(
      errors,
      `${path}.structure`,
      `flow aceita no máximo ${limits.maxNodes} nós.`
    );
  }
  if (measurement.depth > limits.maxDepth) {
    pushError(
      errors,
      `${path}.structure`,
      `flow aceita profundidade máxima de ${limits.maxDepth} níveis.`
    );
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateTree(card, path, errors) {
  const limits = canonicalSemanticLimits("tree");
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em tree.");
  }
  if (!Array.isArray(card?.nodes) || !card.nodes.length) {
    pushError(errors, `${path}.nodes`, "tree precisa de nodes.");
    return;
  }
  if (card.nodes.length > limits.maxNodes) {
    pushError(
      errors,
      `${path}.nodes`,
      `tree aceita no máximo ${limits.maxNodes} nós.`
    );
  }
  const variant = text(card?.variant);
  if (!["filesystem", "hierarchy", "taxonomy", "phylogeny", "syntax", "organization"].includes(variant)) {
    pushError(errors, `${path}.variant`, "variant de tree é obrigatória e deve ser reconhecida.");
  }
  const nodeIds = new Set();
  const nodesById = new Map();
  let rootCount = 0;
  card.nodes.forEach((node, index) => {
    Object.keys(node || {}).forEach((fieldName) => {
      if (!["id", "label", "entryType", "parentId"].includes(fieldName)) {
        pushError(errors, `${path}.nodes[${index}].${fieldName}`, `Campo fora do schema: "${fieldName}".`);
      }
    });
    const id = text(node?.id);
    if (!id) {
      pushError(errors, `${path}.nodes[${index}].id`, "id é obrigatório em tree.");
      return;
    }
    if (nodeIds.has(id)) {
      pushError(errors, `${path}.nodes[${index}].id`, `id duplicado em tree: "${id}".`);
    }
    nodeIds.add(id);
    nodesById.set(id, { node, index });
    if (!text(node?.label)) {
      pushError(errors, `${path}.nodes[${index}].label`, "label é obrigatório em tree.");
    }
    if (variant === "filesystem") {
      if (!["directory", "file", "symlink"].includes(text(node?.entryType))) {
        pushError(
          errors,
          `${path}.nodes[${index}].entryType`,
          "entryType é obrigatório em filesystem e deve ser directory, file ou symlink."
        );
      }
    } else if (node?.entryType !== undefined) {
      pushError(
        errors,
        `${path}.nodes[${index}].entryType`,
        "entryType só pode ser usado na variante filesystem."
      );
    }
    if (node?.parentId !== null && node?.parentId !== undefined && !text(node?.parentId)) {
      pushError(errors, `${path}.nodes[${index}].parentId`, "parentId deve ser string ou null.");
    } else if (node?.parentId === null || node?.parentId === undefined) {
      rootCount += 1;
    }
  });
  card.nodes.forEach((node, index) => {
    const id = text(node?.id);
    const parentId = text(node?.parentId);
    if (!id || !parentId) return;
    if (parentId === id) {
      pushError(errors, `${path}.nodes[${index}].parentId`, "Um nó não pode ser pai de si mesmo.");
      return;
    }
    const parent = nodesById.get(parentId);
    if (!parent) {
      pushError(errors, `${path}.nodes[${index}].parentId`, `Nó pai inexistente: "${parentId}".`);
      return;
    }
    if (variant === "filesystem" && parent.node?.entryType !== "directory") {
      pushError(
        errors,
        `${path}.nodes[${index}].parentId`,
        "Somente um diretório pode conter filhos em uma árvore filesystem."
      );
    }
  });
  if (rootCount === 0) {
    pushError(errors, `${path}.nodes`, "tree precisa de ao menos um nó raiz.");
  }
  const reportedCycles = new Set();
  let maxObservedDepth = 0;
  for (const [startId, entry] of nodesById) {
    const visited = new Set();
    let currentId = startId;
    let depth = 0;
    while (currentId) {
      depth += 1;
      if (visited.has(currentId)) {
        const signature = [...visited].sort().join("|");
        if (!reportedCycles.has(signature)) {
          reportedCycles.add(signature);
          pushError(errors, `${path}.nodes[${entry.index}].parentId`, "tree não pode conter ciclo.");
        }
        break;
      }
      visited.add(currentId);
      const current = nodesById.get(currentId)?.node;
      const parentId = text(current?.parentId);
      if (!parentId || !nodesById.has(parentId)) break;
      currentId = parentId;
    }
    maxObservedDepth = Math.max(maxObservedDepth, depth);
  }
  if (maxObservedDepth > limits.maxDepth) {
    pushError(
      errors,
      `${path}.nodes`,
      `tree aceita profundidade máxima de ${limits.maxDepth} níveis.`
    );
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateGraph(card, path, errors) {
  const limits = canonicalSemanticLimits("graph");
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em graph.");
  }
  const vertices = Array.isArray(card?.vertices) ? card.vertices : [];
  const edges = Array.isArray(card?.edges) ? card.edges : [];
  if (vertices.length > limits.maxVertices) {
    pushError(
      errors,
      `${path}.vertices`,
      `graph aceita no máximo ${limits.maxVertices} vértices.`
    );
  }
  if (edges.length > limits.maxEdges) {
    pushError(
      errors,
      `${path}.edges`,
      `graph aceita no máximo ${limits.maxEdges} arestas.`
    );
  }
  if (card?.layout !== undefined &&
      !["auto", "path", "cycle", "star", "hierarchical", "network", "causal"].includes(text(card.layout))) {
    pushError(errors, `${path}.layout`, "layout de graph usa um preset semântico inválido.");
  }
  if (!vertices.length) {
    pushError(errors, `${path}.vertices`, "graph precisa de vertices.");
    return;
  }
  const vertexIds = new Set();
  vertices.forEach((vertex, index) => {
    Object.keys(vertex || {}).forEach((fieldName) => {
      if (!["id", "label"].includes(fieldName)) {
        pushError(errors, `${path}.vertices[${index}].${fieldName}`, `Campo fora do schema: "${fieldName}".`);
      }
    });
    const id = text(vertex?.id);
    if (!id) {
      pushError(errors, `${path}.vertices[${index}].id`, "id é obrigatório em graph.");
      return;
    }
    if (vertexIds.has(id)) {
      pushError(errors, `${path}.vertices[${index}].id`, `id duplicado em graph: "${id}".`);
    }
    vertexIds.add(id);
    if (!text(vertex?.label)) {
      pushError(errors, `${path}.vertices[${index}].label`, "label é obrigatório em graph.");
    }
  });
  const edgeKeys = new Set();
  const edgeIds = new Set();
  edges.forEach((edge, index) => {
    Object.keys(edge || {}).forEach((fieldName) => {
      if (!["id", "from", "to", "label", "weight", "directed"].includes(fieldName)) {
        pushError(errors, `${path}.edges[${index}].${fieldName}`, `Campo fora do schema: "${fieldName}".`);
      }
    });
    const id = text(edge?.id);
    if (!id) {
      pushError(errors, `${path}.edges[${index}].id`, "id é obrigatório em cada aresta.");
    } else if (edgeIds.has(id)) {
      pushError(errors, `${path}.edges[${index}].id`, `id duplicado em graph: "${id}".`);
    }
    edgeIds.add(id);
    const [from, to] = [text(edge?.from), text(edge?.to)];
    if (!from || !to || !vertexIds.has(from) || !vertexIds.has(to)) {
      pushError(errors, `${path}.edges[${index}]`, "Toda aresta precisa ligar vertices existentes.");
    }
    const edgeKey = JSON.stringify([from, to, text(edge?.label), text(edge?.weight), edge?.directed === true]);
    if (edgeKeys.has(edgeKey)) {
      pushError(errors, `${path}.edges[${index}]`, "Aresta duplicada em graph.");
    }
    edgeKeys.add(edgeKey);
    ["label", "weight"].forEach((fieldName) => {
      if (edge?.[fieldName] !== undefined && typeof edge[fieldName] !== "string") {
        pushError(errors, `${path}.edges[${index}].${fieldName}`, `${fieldName} da aresta deve ser texto.`);
      }
    });
    if (edge?.directed !== undefined && typeof edge.directed !== "boolean") {
      pushError(errors, `${path}.edges[${index}].directed`, "directed da aresta deve ser booleano.");
    }
  });
  if (card?.highlight !== undefined) {
    if (validateObjectFields(
      card.highlight,
      ["vertices", "edges"],
      `${path}.highlight`,
      errors,
      "highlight de graph"
    )) {
      if (card.highlight.vertices !== undefined) {
        if (!Array.isArray(card.highlight.vertices) || !card.highlight.vertices.length) {
          pushError(errors, `${path}.highlight.vertices`, "vertices precisa ter ao menos um id destacado.");
        } else {
          card.highlight.vertices.forEach((value, index) => {
            const id = text(value);
            if (!id || !vertexIds.has(id)) {
              pushError(errors, `${path}.highlight.vertices[${index}]`, `Vértice destacado inexistente: "${id}".`);
            }
          });
          validateUniquePrimitiveList(card.highlight.vertices, `${path}.highlight.vertices`, errors, "vertices");
        }
      }
      if (card.highlight.edges !== undefined) {
        if (!Array.isArray(card.highlight.edges) || !card.highlight.edges.length) {
          pushError(errors, `${path}.highlight.edges`, "edges precisa ter ao menos uma aresta destacada.");
        } else {
          card.highlight.edges.forEach((value, index) => {
            const id = text(value);
            if (!id || !edgeIds.has(id)) {
              pushError(errors, `${path}.highlight.edges[${index}]`, `Aresta destacada inexistente: "${id}".`);
            }
          });
          validateUniquePrimitiveList(card.highlight.edges, `${path}.highlight.edges`, errors, "edges");
        }
      }
      if (!["vertices", "edges"].some((fieldName) => card.highlight[fieldName] !== undefined)) {
        pushError(errors, `${path}.highlight`, "highlight de graph precisa indicar vertices ou edges.");
      }
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateRelationSet(setValue, path, errors) {
  const limits = canonicalSemanticLimits("relation_map");
  if (!validateObjectFields(setValue, ["label", "items"], path, errors, "conjunto")) {
    return { ids: new Set(), labels: [] };
  }
  const label = text(setValue.label);
  if (!label) {
    pushError(errors, `${path}.label`, "label é obrigatório no conjunto.");
  }
  const items = Array.isArray(setValue.items) ? setValue.items : [];
  if (items.length > limits.maxItemsPerSet) {
    pushError(
      errors,
      `${path}.items`,
      `cada conjunto aceita no máximo ${limits.maxItemsPerSet} itens.`
    );
  }
  if (!items.length) {
    pushError(errors, `${path}.items`, "items precisa ter ao menos um item.");
    return { ids: new Set(), labels: [] };
  }
  const ids = new Set();
  const labels = [];
  items.forEach((item, index) => {
    if (!validateObjectFields(item, ["id", "label"], `${path}.items[${index}]`, errors, "item do conjunto")) {
      return;
    }
    const id = text(item?.id);
    const itemLabel = text(item?.label);
    if (!id) {
      pushError(errors, `${path}.items[${index}].id`, "id é obrigatório em cada item.");
      return;
    }
    if (ids.has(id)) {
      pushError(errors, `${path}.items[${index}].id`, `id duplicado no conjunto: "${id}".`);
    }
    ids.add(id);
    if (!itemLabel) {
      pushError(errors, `${path}.items[${index}].label`, "label é obrigatório em cada item.");
    }
    labels.push(itemLabel);
  });
  return { ids, labels };
}

function validateRelationHighlight(highlight, path, errors, leftIds, rightIds, relationKeys) {
  if (highlight === undefined) return;
  if (!validateObjectFields(
    highlight,
    ["leftItems", "rightItems", "relations"],
    path,
    errors,
    "highlight de relation_map"
  )) {
    return;
  }

  const validateIds = (fieldName, validIds) => {
    if (highlight[fieldName] === undefined) return;
    if (!Array.isArray(highlight[fieldName]) || !highlight[fieldName].length) {
      pushError(errors, `${path}.${fieldName}`, `${fieldName} precisa ter ao menos um id.`);
      return;
    }
    highlight[fieldName].forEach((value, index) => {
      const id = text(value);
      if (!id || !validIds.has(id)) {
        pushError(errors, `${path}.${fieldName}[${index}]`, `Item destacado inexistente: "${id}".`);
      }
    });
    validateUniquePrimitiveList(highlight[fieldName], `${path}.${fieldName}`, errors, fieldName);
  };

  validateIds("leftItems", leftIds);
  validateIds("rightItems", rightIds);
  if (highlight.relations !== undefined) {
    if (!Array.isArray(highlight.relations) || !highlight.relations.length) {
      pushError(errors, `${path}.relations`, "relations precisa ter ao menos um par destacado.");
    } else {
      const highlightedKeys = [];
      highlight.relations.forEach((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2) {
          pushError(errors, `${path}.relations[${index}]`, "relação destacada precisa usar [from, to].");
          return;
        }
        const key = JSON.stringify([text(pair[0]), text(pair[1])]);
        highlightedKeys.push(key);
        if (!relationKeys.has(key)) {
          pushError(errors, `${path}.relations[${index}]`, "relação destacada precisa existir em relations.");
        }
      });
      validateUniquePrimitiveList(highlightedKeys, `${path}.relations`, errors, "relations");
    }
  }
  if (!["leftItems", "rightItems", "relations"].some((fieldName) => highlight[fieldName] !== undefined)) {
    pushError(errors, path, "highlight de relation_map precisa indicar ao menos uma seleção.");
  }
}

function validateRelationTable(table, path, errors) {
  const limits = canonicalSemanticLimits("relation_map");
  if (!validateObjectFields(table, ["columns", "rows"], path, errors, "relationTable")) return;
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  if (columns.length !== 2) {
    pushError(errors, `${path}.columns`, "relationTable.columns precisa ter exatamente 2 colunas.");
  }
  columns.forEach((column, index) => {
    if (typeof column !== "string" || !text(column)) {
      pushError(errors, `${path}.columns[${index}]`, "cada coluna de relationTable precisa ser texto não vazio.");
    }
  });
  if (!rows.length) {
    pushError(errors, `${path}.rows`, "relationTable.rows precisa ter ao menos uma linha.");
  }
  if (rows.length > limits.maxRelations) {
    pushError(
      errors,
      `${path}.rows`,
      `relationTable aceita no máximo ${limits.maxRelations} linhas.`
    );
  }
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== 2) {
      pushError(errors, `${path}.rows[${rowIndex}]`, "cada linha de relationTable precisa ter exatamente 2 células.");
      return;
    }
    row.forEach((cell, columnIndex) => {
      validateRelationalScalar(cell, `${path}.rows[${rowIndex}][${columnIndex}]`, errors, "célula de relationTable");
    });
  });
}

function validateRelationMap(card, path, errors) {
  const limits = canonicalSemanticLimits("relation_map");
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em relation_map.");
  }
  const left = validateRelationSet(card?.leftSet, `${path}.leftSet`, errors);
  const right = validateRelationSet(card?.rightSet, `${path}.rightSet`, errors);
  const relations = Array.isArray(card?.relations) ? card.relations : [];
  if (!Array.isArray(card?.relations) || !relations.length) {
    pushError(errors, `${path}.relations`, "relation_map precisa de relations.");
  }
  if (relations.length > limits.maxRelations) {
    pushError(
      errors,
      `${path}.relations`,
      `relation_map aceita no máximo ${limits.maxRelations} relações.`
    );
  }
  const relationKeys = new Set();
  relations.forEach((relation, index) => {
    if (!validateObjectFields(
      relation,
      ["from", "to", "label"],
      `${path}.relations[${index}]`,
      errors,
      "relation"
    )) {
      return;
    }
    const from = text(relation?.from);
    const to = text(relation?.to);
    if (!from || !to || !left.ids.has(from) || !right.ids.has(to)) {
      pushError(errors, `${path}.relations[${index}]`, "cada relation precisa ligar itens válidos de leftSet e rightSet.");
    }
    if (relation?.label !== undefined && typeof relation.label !== "string") {
      pushError(errors, `${path}.relations[${index}].label`, "label da relation deve ser texto.");
    }
    const relationKey = JSON.stringify([from, to]);
    if (relationKeys.has(relationKey)) {
      pushError(errors, `${path}.relations[${index}]`, "relation_map não pode repetir a mesma relação.");
    }
    relationKeys.add(relationKey);
  });
  if (card?.pairList !== undefined) {
    if (!Array.isArray(card.pairList)) {
      pushError(errors, `${path}.pairList`, "pairList deve ser array.");
    } else {
      if (card.pairList.length > limits.maxRelations) {
        pushError(
          errors,
          `${path}.pairList`,
          `pairList aceita no máximo ${limits.maxRelations} itens.`
        );
      }
      card.pairList.forEach((value, index) => {
        if (typeof value !== "string" || !text(value)) {
          pushError(errors, `${path}.pairList[${index}]`, "cada item de pairList precisa ser texto não vazio.");
        }
      });
    }
  }
  if (card?.relationTable !== undefined) {
    validateRelationTable(card.relationTable, `${path}.relationTable`, errors);
  }
  validateRelationHighlight(card?.highlight, `${path}.highlight`, errors, left.ids, right.ids, relationKeys);
  validateContextualChoiceExercise(card, path, errors);
}

function normalizeGraphVertices(vertices = []) {
  return (Array.isArray(vertices) ? vertices : []).map((vertex, index) => ({
    id: text(vertex?.id) || `V${index + 1}`,
    label: text(vertex?.label) || text(vertex?.id) || `V${index + 1}`
  }));
}

function normalizeGraphEdges(edges = []) {
  return (Array.isArray(edges) ? edges : []).map((edge, index) => ({
    id: text(edge?.id) || `edge-${index + 1}`,
    from: text(edge?.from),
    to: text(edge?.to),
    ...(text(edge?.label) ? { label: text(edge.label) } : {}),
    ...(text(edge?.weight) ? { weight: text(edge.weight) } : {}),
    ...(typeof edge?.directed === "boolean" ? { directed: edge.directed } : {})
  }));
}

function normalizeRelationSetOutput(setValue = {}, fallbackPrefix = "item") {
  return {
    label: text(setValue?.label),
    items: (Array.isArray(setValue?.items) ? setValue.items : []).map((item, index) => ({
      id: text(item?.id) || `${fallbackPrefix}${index + 1}`,
      label: text(item?.label) || text(item?.id) || `${fallbackPrefix}${index + 1}`
    }))
  };
}

function allowedCompositeBlockFields(kind = "") {
  return new Set(COMPOSITE_BLOCK_FIELDS_BY_KIND[kind] || ["kind"]);
}

function validateCompositeBlockUnknownFields(block, path, errors, kind = "") {
  const allowed = allowedCompositeBlockFields(kind);
  Object.keys(block || {}).forEach((fieldName) => {
    if (!allowed.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema do bloco composto: "${fieldName}".`);
    }
  });
}

function normalizeCompositeBlock(block = {}) {
  const kind = text(block?.kind);
  const metadata = {
    id: text(block?.id),
    ...normalizedTextMetadata(block)
  };
  if (kind === "heading" || kind === "paragraph") {
    return {
      kind,
      value: text(block?.value),
      ...metadata
    };
  }
  if (kind === "choice") {
    return {
      kind,
      question: text(block?.question),
      selectionMode: text(block?.selectionMode),
      selectionCriterion: text(block?.selectionCriterion),
      options: (Array.isArray(block?.options) ? block.options : []).map((option, index) => normalizeChoiceOption(option, index)),
      answerIds: Array.isArray(block?.answerIds)
        ? block.answerIds.map((answerId) => text(answerId)).filter(Boolean)
        : [],
      ...metadata
    };
  }
  if (kind === "code") {
    return {
      kind,
      prompt: text(block?.prompt),
      language: text(block?.language),
      code: codeText(block?.code),
      ...metadata
    };
  }
  if (kind === "table") {
    return {
      kind,
      ...(text(block?.layout) ? { layout: text(block.layout) } : {}),
      ...(Array.isArray(block?.columnMeta) ? { columnMeta: structuredClone(block.columnMeta) } : {}),
      columns: (Array.isArray(block?.columns) ? block.columns : []).map((item) => text(item)),
      rows: (Array.isArray(block?.rows) ? block.rows : []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [])),
      ...metadata
    };
  }
  if (kind === "flow") {
    return {
      kind,
      ...(text(block?.prompt) ? { prompt: text(block.prompt) } : {}),
      structure: structuredClone(normalizeFlowchartStructure(block?.structure)),
      ...metadata
    };
  }
  if (kind === "tree") {
    return {
      kind,
      prompt: text(block?.prompt),
      variant: text(block?.variant),
      nodes: structuredClone(Array.isArray(block?.nodes) ? block.nodes : []),
      ...metadata
    };
  }
  if (kind === "graph") {
    return {
      kind,
      prompt: text(block?.prompt),
      ...(text(block?.layout) ? { layout: text(block.layout) } : {}),
      vertices: normalizeGraphVertices(block?.vertices),
      edges: normalizeGraphEdges(block?.edges),
      ...(block?.highlight && typeof block.highlight === "object" ? { highlight: structuredClone(block.highlight) } : {}),
      ...metadata
    };
  }
  if (kind === "relation_map") {
    return {
      kind,
      prompt: text(block?.prompt),
      leftSet: normalizeRelationSetOutput(block?.leftSet, "u"),
      rightSet: normalizeRelationSetOutput(block?.rightSet, "v"),
      relations: (Array.isArray(block?.relations) ? block.relations : []).map((relation) => ({
        from: text(relation?.from),
        to: text(relation?.to),
        ...(text(relation?.label) ? { label: text(relation.label) } : {})
      })),
      ...(Array.isArray(block?.pairList) ? { pairList: structuredClone(block.pairList) } : {}),
      ...(block?.relationTable && typeof block.relationTable === "object" ? { relationTable: structuredClone(block.relationTable) } : {}),
      ...(block?.highlight && typeof block.highlight === "object" ? { highlight: structuredClone(block.highlight) } : {}),
      ...metadata
    };
  }
  if (kind === "matrix") {
    return {
      kind,
      ...(text(block?.prompt) ? { prompt: text(block.prompt) } : {}),
      ...(text(block?.name) ? { name: text(block.name) } : {}),
      ...(Array.isArray(block?.values) ? { values: structuredClone(block.values) } : {}),
      ...(block?.highlight !== undefined ? { highlight: structuredClone(block.highlight) } : {}),
      ...(block?.dividerAfterColumn !== undefined ? { dividerAfterColumn: Number(block.dividerAfterColumn) } : {}),
      ...(Array.isArray(block?.sequence) ? { sequence: structuredClone(block.sequence) } : {}),
      ...metadata
    };
  }
  if (kind === "plane") {
    return {
      kind,
      ...(text(block?.prompt) ? { prompt: text(block.prompt) } : {}),
      ...(Array.isArray(block?.x) ? { x: structuredClone(block.x) } : {}),
      ...(Array.isArray(block?.y) ? { y: structuredClone(block.y) } : {}),
      ...(Array.isArray(block?.vector) ? { vector: structuredClone(block.vector) } : {}),
      ...(Array.isArray(block?.vectors) ? { vectors: structuredClone(block.vectors) } : {}),
      ...(Array.isArray(block?.sum) ? { sum: structuredClone(block.sum) } : {}),
      ...(block?.scale && typeof block.scale === "object" ? { scale: structuredClone(block.scale) } : {}),
      ...(Array.isArray(block?.distance) ? { distance: structuredClone(block.distance) } : {}),
      ...(Array.isArray(block?.result) || typeof block?.result === "string" ? { result: structuredClone(block.result) } : {}),
      ...metadata
    };
  }
  if (kind === "formula") {
    return {
      kind,
      prompt: text(block?.prompt),
      notation: text(block?.notation),
      accessibleText: text(block?.accessibleText),
      expression: structuredClone(block?.expression),
      ...metadata
    };
  }
  if (kind === "chart") {
    return {
      kind,
      prompt: text(block?.prompt),
      chartType: text(block?.chartType),
      xAxis: structuredClone(block?.xAxis),
      yAxis: structuredClone(block?.yAxis),
      series: structuredClone(block?.series),
      ...(block?.highlight ? { highlight: structuredClone(block.highlight) } : {}),
      ...metadata
    };
  }
  if (kind === "sequence") {
    return {
      kind,
      prompt: text(block?.prompt),
      variant: text(block?.variant),
      items: structuredClone(block?.items),
      ...(block?.highlight ? { highlight: structuredClone(block.highlight) } : {}),
      ...metadata
    };
  }
  if (kind === "annotated_text") {
    return {
      kind,
      prompt: text(block?.prompt),
      segments: structuredClone(block?.segments),
      annotations: structuredClone(block?.annotations),
      ...metadata
    };
  }
  if (kind === "linguistic_example") {
    return {
      kind,
      prompt: text(block?.prompt),
      writingMode: text(block?.writingMode),
      alignment: text(block?.alignment),
      units: structuredClone(block?.units),
      ...metadata
    };
  }
  if (kind === "system_map") {
    return {
      kind,
      prompt: text(block?.prompt),
      groups: structuredClone(block?.groups),
      nodes: structuredClone(block?.nodes),
      links: structuredClone(block?.links),
      ...(block?.highlight && typeof block.highlight === "object"
        ? { highlight: structuredClone(block.highlight) }
        : {}),
      ...metadata
    };
  }
  if (kind === "reaction") {
    return {
      kind,
      prompt: text(block?.prompt),
      reactionType: text(block?.reactionType),
      reactants: structuredClone(block?.reactants),
      products: structuredClone(block?.products),
      conditions: structuredClone(block?.conditions),
      ...(block?.highlight && typeof block.highlight === "object"
        ? { highlight: structuredClone(block.highlight) }
        : {}),
      ...metadata
    };
  }
  return {
    kind: "paragraph",
    value: text(block?.value)
  };
}

function compositeBlockHasFlowPractice(block) {
  if (text(block?.kind) !== "flow") {
    return false;
  }
  return flowStructureHasPractice(block?.structure);
}

function validateCompositeBlock(block, path, errors, parentExercise = "none") {
  if (!isPlainObject(block)) {
    pushError(errors, path, "bloco de composite deve ser objeto.");
    return null;
  }
  const kind = text(block?.kind);
  if (!text(block?.id)) {
    pushError(errors, `${path}.id`, "Todo bloco de composite precisa de id estável.");
  }
  if (!COMPOSITE_BLOCK_KIND_SET.has(kind)) {
    pushError(errors, `${path}.kind`, `kind inválido em composite: "${kind}".`);
    return null;
  }
  validateCompositeBlockUnknownFields(block, path, errors, kind);
  validateTextMetadata(block, path, errors);
  const blockHasGap = resourceHasGap(block) || compositeBlockHasFlowPractice(block);
  const blockExercise = parentExercise === "gap" && blockHasGap ? "gap" : "none";
  const blockKind = blockExercise === "gap" ? "exercise" : "theory";
  if (kind === "heading") {
    if (!text(block?.value)) {
      pushError(errors, `${path}.value`, `${kind} em composite precisa de value.`);
    }
    if (hasTextGapSyntax(block?.value)) {
      pushError(errors, `${path}.value`, "heading não pode conter lacuna interativa.");
    }
  } else if (kind === "paragraph") {
    validateParagraph({
      resource: "paragraph",
      kind: blockKind,
      exercise: blockExercise,
      text: block?.value
    }, path, errors);
  } else if (kind === "choice") {
    validateChoice({
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      question: block?.question,
      selectionMode: block?.selectionMode,
      selectionCriterion: block?.selectionCriterion,
      options: block?.options,
      answerIds: block?.answerIds
    }, path, errors);
  } else if (kind === "code") {
    validateCode({
      resource: "code",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      language: block?.language,
      code: block?.code
    }, path, errors);
  } else if (kind === "table") {
    validateTable({
      resource: "table",
      kind: blockKind,
      exercise: blockExercise,
      layout: block?.layout,
      columnMeta: block?.columnMeta,
      columns: block?.columns,
      rows: block?.rows
    }, path, errors);
  } else if (kind === "flow") {
    validateFlow({
      resource: "flow",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      structure: block?.structure
    }, path, errors);
  } else if (kind === "tree") {
    validateTree({
      resource: "tree",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      variant: block?.variant,
      nodes: block?.nodes
    }, path, errors);
  } else if (kind === "graph") {
    validateGraph({
      resource: "graph",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      layout: block?.layout,
      vertices: block?.vertices,
      edges: block?.edges,
      highlight: block?.highlight
    }, path, errors);
  } else if (kind === "relation_map") {
    validateRelationMap({
      resource: "relation_map",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      leftSet: block?.leftSet,
      rightSet: block?.rightSet,
      relations: block?.relations,
      pairList: block?.pairList,
      relationTable: block?.relationTable,
      highlight: block?.highlight
    }, path, errors);
  } else if (kind === "matrix") {
    validateMatrix({
      resource: "matrix",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      name: block?.name,
      values: block?.values,
      highlight: block?.highlight,
      dividerAfterColumn: block?.dividerAfterColumn,
      sequence: block?.sequence
    }, path, errors);
  } else if (kind === "plane") {
    validatePlane({
      resource: "plane",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      x: block?.x,
      y: block?.y,
      vector: block?.vector,
      vectors: block?.vectors,
      sum: block?.sum,
      scale: block?.scale,
      distance: block?.distance,
      result: block?.result
    }, path, errors);
  } else if (kind === "formula") {
    validateFormula({
      resource: "formula",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      notation: block?.notation,
      accessibleText: block?.accessibleText,
      expression: block?.expression
    }, path, errors);
  } else if (kind === "chart") {
    validateChart({
      resource: "chart",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      chartType: block?.chartType,
      xAxis: block?.xAxis,
      yAxis: block?.yAxis,
      series: block?.series,
      highlight: block?.highlight
    }, path, errors);
  } else if (kind === "sequence") {
    validateSequence({
      resource: "sequence",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      variant: block?.variant,
      items: block?.items,
      highlight: block?.highlight
    }, path, errors);
  } else if (kind === "annotated_text") {
    validateAnnotatedText({
      resource: "annotated_text",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      segments: block?.segments,
      annotations: block?.annotations
    }, path, errors);
  } else if (kind === "linguistic_example") {
    validateLinguisticExample({
      resource: "linguistic_example",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      languageTag: block?.languageTag,
      writingMode: block?.writingMode,
      alignment: block?.alignment,
      units: block?.units
    }, path, errors);
  } else if (kind === "system_map") {
    validateSystemMap({
      resource: "system_map",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      groups: block?.groups,
      nodes: block?.nodes,
      links: block?.links,
      highlight: block?.highlight
    }, path, errors);
  } else if (kind === "reaction") {
    validateReaction({
      resource: "reaction",
      kind: blockKind,
      exercise: blockExercise,
      prompt: block?.prompt,
      reactionType: block?.reactionType,
      reactants: block?.reactants,
      products: block?.products,
      conditions: block?.conditions,
      highlight: block?.highlight
    }, path, errors);
  }
  return normalizeCompositeBlock(block);
}

function validateComposite(card, path, errors) {
  const limits = canonicalSemanticLimits("composite");
  const blocks = Array.isArray(card?.blocks) ? card.blocks : [];
  if (!blocks.length) {
    pushError(errors, `${path}.blocks`, "composite precisa de blocks.");
    return [];
  }
  if (blocks.length < limits.minBlocks || blocks.length > limits.maxBlocks) {
    pushError(
      errors,
      `${path}.blocks`,
      `composite precisa de ${limits.minBlocks} a ${limits.maxBlocks} blocos.`
    );
  }
  const exerciseMode = text(card?.kind) === "exercise" ? text(card?.exercise) : "none";
  const blockIds = new Set();
  blocks.forEach((block, index) => {
    const id = text(block?.id);
    if (id && blockIds.has(id)) {
      pushError(errors, `${path}.blocks[${index}].id`, `id de bloco duplicado: "${id}".`);
    }
    if (id) blockIds.add(id);
  });
  const normalizedBlocks = blocks
    .map((block, index) => validateCompositeBlock(block, `${path}.blocks[${index}]`, errors, exerciseMode))
    .filter(Boolean);
  const choiceBlocks = normalizedBlocks.filter((block) => block.kind === "choice");
  if (text(card?.kind) === "theory") {
    if (text(card?.exercise) !== "none") {
      pushError(errors, `${path}.exercise`, 'composite teórico deve usar exercise "none".');
    }
    if (choiceBlocks.length) {
      pushError(errors, `${path}.blocks`, "composite teórico não pode conter bloco choice.");
    }
  }
  if (text(card?.kind) === "exercise") {
    if (!isExerciseCardShape(card)) {
      pushError(errors, `${path}.exercise`, 'composite de exercício deve usar exercise "gap" ou "choice".');
    } else if (text(card?.exercise) === "gap") {
      if (choiceBlocks.length) {
        pushError(errors, `${path}.blocks`, "composite gap não pode conter bloco choice.");
      }
      const hasFlowPractice = blocks.some((block) => compositeBlockHasFlowPractice(block));
      if (!resourceHasGap(card) && !hasFlowPractice) {
        pushError(errors, `${path}.blocks`, "composite gap precisa de ao menos uma lacuna nos seus blocos.");
      }
    } else if (choiceBlocks.length !== 1) {
      pushError(errors, `${path}.blocks`, "composite choice precisa de exatamente um bloco choice.");
    }
    if (
      text(card?.exercise) === "choice"
      && blocks.some((block) => compositeBlockHasFlowPractice(block))
    ) {
      pushError(errors, `${path}.blocks`, "composite choice não pode conter lacunas interativas.");
    }
  }
  return normalizedBlocks;
}

function validateAfterBlocks(card, path, errors) {
  if (card?.afterBlocks === undefined) {
    return [];
  }
  if (!Array.isArray(card.afterBlocks)) {
    pushError(errors, `${path}.afterBlocks`, "afterBlocks deve ser array.");
    return [];
  }
  if (!card.afterBlocks.length) {
    pushError(errors, `${path}.afterBlocks`, "afterBlocks não pode ser vazio quando informado.");
    return [];
  }
  if (card.afterBlocks.length > CARD_AFTER_BLOCKS_MAX_ITEMS) {
    pushError(
      errors,
      `${path}.afterBlocks`,
      `afterBlocks aceita no máximo ${CARD_AFTER_BLOCKS_MAX_ITEMS} blocos.`
    );
  }
  const blockIds = new Set();
  card.afterBlocks.forEach((block, index) => {
    const id = text(block?.id);
    if (id && blockIds.has(id)) {
      pushError(
        errors,
        `${path}.afterBlocks[${index}].id`,
        `id de bloco duplicado em afterBlocks: "${id}".`
      );
    }
    if (id) blockIds.add(id);
  });
  return card.afterBlocks
    .map((block, index) => {
      const blockPath = `${path}.afterBlocks[${index}]`;
      if (text(block?.kind) === "choice") {
        pushError(errors, `${blockPath}.kind`, "afterBlocks não aceita bloco choice.");
        return null;
      }
      if (text(block?.kind) === "paragraph" && hasTextGapSyntax(block?.value)) {
        pushError(errors, `${blockPath}.value`, "afterBlocks não pode conter lacunas interativas.");
      }
      if (text(block?.kind) === "code" && hasTextGapSyntax(block?.code)) {
        pushError(errors, `${blockPath}.code`, "afterBlocks não pode conter lacunas interativas.");
      }
      return validateCompositeBlock(block, blockPath, errors);
    })
    .filter(Boolean);
}

function validateAfter(card, path, errors) {
  if (!Object.hasOwn(card || {}, "after")) {
    pushError(errors, `${path}.after`, "after é obrigatório, ainda que vazio.");
    return;
  }
  if (typeof card.after !== "string") {
    pushError(errors, `${path}.after`, "after deve ser texto.");
    return;
  }
  if (hasTextGapSyntax(card?.after)) {
    pushError(errors, `${path}.after`, "after não pode conter lacunas interativas.");
  }
}

function validateMatrixHighlightItemCoordinates(entry, path, errors, rowCount, columnCount) {
  if (!Array.isArray(entry) || entry.length !== 2) {
    pushError(errors, path, "cada célula destacada precisa usar [linha, coluna].");
    return;
  }
  const rowIndex = Number(entry[0]);
  const columnIndex = Number(entry[1]);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) {
    pushError(errors, path, "cada célula destacada precisa usar índices inteiros.");
    return;
  }
  if (rowIndex < 0 || rowIndex >= rowCount || columnIndex < 0 || columnIndex >= columnCount) {
    pushError(errors, path, "célula destacada fora dos limites da matrix.");
  }
}

function validateMatrixHighlight(highlight, path, errors, rowCount, columnCount) {
  if (highlight === undefined) {
    return;
  }
  if (!isPlainObject(highlight)) {
    pushError(errors, path, "highlight da matrix precisa ser objeto.");
    return;
  }

  const allowedFields = new Set(["pattern", "cells", "rows", "columns"]);
  Object.keys(highlight).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `campo inválido em matrix.highlight: "${fieldName}".`);
    }
  });

  let hasSelection = false;
  if (highlight.pattern !== undefined) {
    const pattern = text(highlight.pattern);
    if (!MATRIX_HIGHLIGHT_PATTERNS.has(pattern)) {
      pushError(errors, `${path}.pattern`, `pattern inválido em matrix.highlight: "${pattern}".`);
    } else {
      hasSelection = true;
    }
  }
  if (highlight.cells !== undefined) {
    if (!Array.isArray(highlight.cells) || !highlight.cells.length) {
      pushError(errors, `${path}.cells`, "cells precisa ter ao menos uma coordenada.");
    } else {
      highlight.cells.forEach((entry, index) => {
        validateMatrixHighlightItemCoordinates(entry, `${path}.cells[${index}]`, errors, rowCount, columnCount);
      });
      validateUniquePrimitiveList(highlight.cells, `${path}.cells`, errors, "cells");
      hasSelection = true;
    }
  }
  if (highlight.rows !== undefined) {
    if (!Array.isArray(highlight.rows) || !highlight.rows.length) {
      pushError(errors, `${path}.rows`, "rows precisa ter ao menos um índice.");
    } else {
      highlight.rows.forEach((rowIndex, index) => {
        const safeRow = Number(rowIndex);
        if (!Number.isInteger(safeRow) || safeRow < 0 || safeRow >= rowCount) {
          pushError(errors, `${path}.rows[${index}]`, "índice de linha destacado fora dos limites da matrix.");
        }
      });
      validateUniquePrimitiveList(highlight.rows, `${path}.rows`, errors, "rows");
      hasSelection = true;
    }
  }
  if (highlight.columns !== undefined) {
    if (!Array.isArray(highlight.columns) || !highlight.columns.length) {
      pushError(errors, `${path}.columns`, "columns precisa ter ao menos um índice.");
    } else {
      highlight.columns.forEach((columnIndex, index) => {
        const safeColumn = Number(columnIndex);
        if (!Number.isInteger(safeColumn) || safeColumn < 0 || safeColumn >= columnCount) {
          pushError(errors, `${path}.columns[${index}]`, "índice de coluna destacado fora dos limites da matrix.");
        }
      });
      validateUniquePrimitiveList(highlight.columns, `${path}.columns`, errors, "columns");
      hasSelection = true;
    }
  }

  if (!hasSelection) {
    pushError(errors, path, "matrix.highlight precisa definir pattern, cells, rows ou columns.");
  }
}

function validateMatrix(card, path, errors) {
  const limits = canonicalSemanticLimits("matrix");
  if (card?.prompt !== undefined && typeof card.prompt !== "string") {
    pushError(errors, `${path}.prompt`, "prompt deve ser texto.");
  }
  const hasValues = Array.isArray(card?.values) && card.values.length > 0;
  const hasSequence = Array.isArray(card?.sequence) && card.sequence.length > 0;
  if (card?.values !== undefined && !hasValues) {
    pushError(errors, `${path}.values`, "values precisa ter ao menos uma linha quando informado.");
  }
  if (card?.sequence !== undefined && !hasSequence) {
    pushError(errors, `${path}.sequence`, "sequence precisa ter ao menos 2 itens quando informada.");
  }
  if (!hasValues && !hasSequence) {
    pushError(errors, path, "matrix precisa de values ou sequence.");
  }
  if (!hasValues && card?.name !== undefined) {
    pushError(errors, `${path}.name`, "name no nível do card exige values.");
  }
  if (!hasValues && card?.highlight !== undefined) {
    pushError(errors, `${path}.highlight`, "highlight no nível do card exige values.");
  }
  if (card?.name !== undefined && typeof card.name !== "string") {
    pushError(errors, `${path}.name`, "name deve ser texto.");
  }
  if (hasValues) {
    validateMatrixValues(card.values, `${path}.values`, errors);
    validateMatrixHighlight(card?.highlight, `${path}.highlight`, errors, card.values.length, card.values[0]?.length || 0);
  }
  if (hasSequence) {
    if (card.sequence.length < 2) {
      pushError(errors, `${path}.sequence`, "sequence precisa ter ao menos 2 itens.");
    }
    if (card.sequence.length > limits.maxSequenceItems) {
      pushError(
        errors,
        `${path}.sequence`,
        `sequence aceita no máximo ${limits.maxSequenceItems} itens.`
      );
    }
    card.sequence.forEach((item, index) => {
      if (!validateObjectFields(
        item,
        ["name", "connector", "values", "highlight"],
        `${path}.sequence[${index}]`,
        errors,
        "item de sequence"
      )) {
        return;
      }
      if (item?.name !== undefined && typeof item.name !== "string") {
        pushError(errors, `${path}.sequence[${index}].name`, "name de sequence deve ser texto.");
      }
      if (item?.connector !== undefined && typeof item.connector !== "string") {
        pushError(errors, `${path}.sequence[${index}].connector`, "connector de sequence deve ser texto.");
      }
      if (!Array.isArray(item?.values) || !item.values.length) {
        pushError(errors, `${path}.sequence[${index}].values`, "cada item de sequence precisa de values.");
        return;
      }
      validateMatrixValues(item.values, `${path}.sequence[${index}].values`, errors);
      if (item?.connector !== undefined && !MATRIX_CONNECTORS.has(text(item.connector))) {
        pushError(errors, `${path}.sequence[${index}].connector`, "connector inválido em sequence.");
      }
      validateMatrixHighlight(
        item?.highlight,
        `${path}.sequence[${index}].highlight`,
        errors,
        item.values.length,
        item.values[0]?.length || 0
      );
    });
  }
  if (card?.dividerAfterColumn !== undefined) {
    const divider = Number(card.dividerAfterColumn);
    if (!Number.isInteger(divider) || divider < 0) {
      pushError(errors, `${path}.dividerAfterColumn`, "dividerAfterColumn deve ser inteiro não negativo.");
    } else {
      const matrices = [
        ...(hasValues ? [card.values] : []),
        ...(hasSequence ? card.sequence.map((item) => item?.values).filter(Array.isArray) : [])
      ];
      matrices.forEach((values, index) => {
        const columnCount = Array.isArray(values?.[0]) ? values[0].length : 0;
        if (columnCount < 2 || divider >= columnCount - 1) {
          pushError(
            errors,
            `${path}.dividerAfterColumn`,
            `dividerAfterColumn fica fora da matriz ${index + 1}.`
          );
        }
      });
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validatePlane(card, path, errors) {
  const limits = canonicalSemanticLimits("plane");
  if (card?.prompt !== undefined && typeof card.prompt !== "string") {
    pushError(errors, `${path}.prompt`, "prompt deve ser texto.");
  }
  const hasX = card?.x !== undefined;
  const hasY = card?.y !== undefined;
  const visuals = [];
  if (hasX || hasY) {
    if (!hasX || !hasY) {
      pushError(errors, path, "plane exige x e y juntos.");
    } else {
      visuals.push(validateCoordinatePair(card.x, `${path}.x`, errors));
      visuals.push(validateCoordinatePair(card.y, `${path}.y`, errors));
      if (Array.isArray(card.x) && card.x.length === 2 && isFiniteNumber(card.x[0]) && isFiniteNumber(card.x[1]) && card.x[0] >= card.x[1]) {
        pushError(errors, `${path}.x`, "x precisa indicar intervalo crescente [mínimo, máximo].");
      }
      if (Array.isArray(card.y) && card.y.length === 2 && isFiniteNumber(card.y[0]) && isFiniteNumber(card.y[1]) && card.y[0] >= card.y[1]) {
        pushError(errors, `${path}.y`, "y precisa indicar intervalo crescente [mínimo, máximo].");
      }
    }
  }
  if (card?.vector !== undefined) {
    visuals.push(validateCoordinatePair(card.vector, `${path}.vector`, errors));
  }
  if (card?.vectors !== undefined) {
    if (!Array.isArray(card.vectors) || !card.vectors.length) {
      pushError(errors, `${path}.vectors`, "vectors precisa ter ao menos um vetor.");
    } else {
      card.vectors.forEach((item, index) => {
        visuals.push(validateCoordinatePair(item, `${path}.vectors[${index}]`, errors));
      });
    }
  }
  if (card?.sum !== undefined) {
    if (!Array.isArray(card.sum) || card.sum.length !== 2) {
      pushError(errors, `${path}.sum`, "sum precisa ter exatamente dois vetores.");
    } else {
      card.sum.forEach((item, index) => {
        visuals.push(validateCoordinatePair(item, `${path}.sum[${index}]`, errors));
      });
    }
  }
  if (card?.distance !== undefined) {
    if (!Array.isArray(card.distance) || card.distance.length !== 2) {
      pushError(errors, `${path}.distance`, "distance precisa de dois pontos.");
    } else {
      card.distance.forEach((item, index) => {
        visuals.push(validateCoordinatePair(item, `${path}.distance[${index}]`, errors));
      });
    }
  }
  if (card?.scale !== undefined) {
    if (!validateObjectFields(card.scale, ["k", "vector"], `${path}.scale`, errors, "scale")) {
      // A mensagem estrutural já foi registrada.
    } else {
      if (!isFiniteNumber(card.scale.k)) {
        pushError(errors, `${path}.scale.k`, "scale.k precisa ser número finito.");
      }
      visuals.push(validateCoordinatePair(card.scale.vector, `${path}.scale.vector`, errors));
    }
  }
  if (card?.result !== undefined) {
    if (Array.isArray(card.result)) {
      validateCoordinatePair(card.result, `${path}.result`, errors);
    } else if (!text(card.result) || text(card.result).length > 80) {
      pushError(errors, `${path}.result`, "result precisa ser par [x, y] ou texto de até 80 caracteres.");
    }
  }
  const primaryModes = ["vector", "vectors", "sum", "scale", "distance"]
    .filter((fieldName) => card?.[fieldName] !== undefined);
  const objectCount =
    (card?.vector !== undefined ? 1 : 0)
    + (Array.isArray(card?.vectors) ? card.vectors.length : 0)
    + (Array.isArray(card?.sum) ? card.sum.length : 0)
    + (card?.scale !== undefined ? 1 : 0)
    + (Array.isArray(card?.distance) ? card.distance.length : 0);
  if (objectCount > limits.maxObjects) {
    pushError(
      errors,
      path,
      `plane aceita no máximo ${limits.maxObjects} objetos geométricos.`
    );
  }
  if (primaryModes.length > 1) {
    pushError(errors, path, `plane aceita um único modo visual principal; recebidos: ${primaryModes.join(", ")}.`);
  }
  if (!visuals.some(Boolean)) {
    pushError(errors, path, "plane precisa de ao menos um dado visual.");
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateUniqueObjectIds(items, path, errors, label) {
  if (!Array.isArray(items) || !items.length) {
    pushError(errors, path, `${label} precisa conter itens.`);
    return new Set();
  }
  const ids = new Set();
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainObject(item)) {
      pushError(errors, itemPath, `${label} deve conter objetos.`);
      return;
    }
    const id = text(item.id);
    if (!id || ids.has(id)) {
      pushError(errors, `${itemPath}.id`, `Cada item de ${label} precisa de id único.`);
    }
    if (id) ids.add(id);
  });
  return ids;
}

function validateChart(card, path, errors) {
  const limits = canonicalSemanticLimits("chart");
  if (!text(card?.prompt)) pushError(errors, `${path}.prompt`, "chart precisa de prompt.");
  if (!["bar", "line", "scatter", "histogram", "boxplot"].includes(text(card?.chartType))) {
    pushError(errors, `${path}.chartType`, "chartType inválido.");
  }
  ["xAxis", "yAxis"].forEach((fieldName) => {
    if (!isPlainObject(card?.[fieldName]) || !text(card[fieldName]?.label)) {
      pushError(errors, `${path}.${fieldName}`, `${fieldName} precisa de label.`);
    } else if (Object.keys(card[fieldName]).some((key) => !["label", "unit"].includes(key))) {
      pushError(errors, `${path}.${fieldName}`, `${fieldName} contém campo fora do schema.`);
    }
  });
  const series = Array.isArray(card?.series) ? card.series : [];
  const seriesIds = validateUniqueObjectIds(series, `${path}.series`, errors, "series");
  if (series.length > limits.maxSeries) {
    pushError(
      errors,
      `${path}.series`,
      `chart aceita no máximo ${limits.maxSeries} séries.`
    );
  }
  const points = new Set();
  series.forEach((entry, seriesIndex) => {
    const seriesPath = `${path}.series[${seriesIndex}]`;
    if (Object.keys(entry || {}).some((key) => !["id", "name", "values"].includes(key))) {
      pushError(errors, seriesPath, "Série contém campo fora do schema.");
    }
    if (!text(entry?.name)) pushError(errors, `${seriesPath}.name`, "Série precisa de name.");
    if (!Array.isArray(entry?.values) || !entry.values.length ||
        entry.values.length > limits.maxPointsPerSeries) {
      pushError(
        errors,
        `${seriesPath}.values`,
        `Série precisa de 1 a ${limits.maxPointsPerSeries} pontos.`
      );
      return;
    }
    entry.values.forEach((point, pointIndex) => {
      if (!Array.isArray(point) || point.length !== 2 ||
          !["string", "number"].includes(typeof point[0]) ||
          typeof point[1] !== "number" || !Number.isFinite(point[1])) {
        pushError(errors, `${seriesPath}.values[${pointIndex}]`, "Ponto deve usar [categoria, número].");
      } else {
        points.add(`${text(entry.id)}\u0000${String(point[0])}`);
      }
    });
  });
  if (card?.highlight !== undefined) {
    const highlighted = card?.highlight?.points;
    if (!isPlainObject(card.highlight) || Object.keys(card.highlight).some((key) => key !== "points") ||
        !Array.isArray(highlighted)) {
      pushError(errors, `${path}.highlight`, "highlight de chart aceita somente points.");
    } else {
      highlighted.forEach((point, index) => {
        if (!Array.isArray(point) || point.length !== 2 ||
            !seriesIds.has(text(point[0])) || !points.has(`${text(point[0])}\u0000${String(point[1])}`)) {
          pushError(errors, `${path}.highlight.points[${index}]`, "Ponto destacado não existe.");
        }
      });
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateSequence(card, path, errors) {
  const limits = canonicalSemanticLimits("sequence");
  if (!text(card?.prompt)) pushError(errors, `${path}.prompt`, "sequence precisa de prompt.");
  if (!["ordered_steps", "timeline", "lifecycle", "cycle", "code_blocks"].includes(text(card?.variant))) {
    pushError(errors, `${path}.variant`, "variant de sequence inválida.");
  }
  const items = Array.isArray(card?.items) ? card.items : [];
  const ids = validateUniqueObjectIds(items, `${path}.items`, errors, "items");
  if (items.length < limits.minItems || items.length > limits.maxItems) {
    pushError(
      errors,
      `${path}.items`,
      `sequence precisa de ${limits.minItems} a ${limits.maxItems} itens.`
    );
  }
  items.forEach((item, index) => {
    if (Object.keys(item || {}).some((key) => !["id", "label", "detail", "code", "language"].includes(key))) {
      pushError(errors, `${path}.items[${index}]`, "Item contém campo fora do schema.");
    }
    if (!text(item?.label)) pushError(errors, `${path}.items[${index}].label`, "Item precisa de label.");
    if (text(item?.code) && !text(item?.language)) {
      pushError(errors, `${path}.items[${index}].language`, "Bloco de código precisa de language.");
    }
  });
  if (card?.highlight !== undefined) {
    const itemIds = card?.highlight?.itemIds;
    if (!isPlainObject(card.highlight) || Object.keys(card.highlight).some((key) => key !== "itemIds") ||
        !Array.isArray(itemIds) || itemIds.some((id) => !ids.has(text(id)))) {
      pushError(errors, `${path}.highlight`, "highlight referencia item inexistente.");
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateAnnotatedText(card, path, errors) {
  const limits = canonicalSemanticLimits("annotated_text");
  if (!text(card?.prompt)) pushError(errors, `${path}.prompt`, "annotated_text precisa de prompt.");
  const segments = Array.isArray(card?.segments) ? card.segments : [];
  const segmentIds = validateUniqueObjectIds(
    segments, `${path}.segments`, errors, "segments"
  );
  if (segments.length > limits.maxSegments) {
    pushError(
      errors,
      `${path}.segments`,
      `annotated_text aceita no máximo ${limits.maxSegments} segmentos.`
    );
  }
  segments.forEach((segment, index) => {
    if (Object.keys(segment || {}).some((key) => !["id", "text"].includes(key)) ||
        !text(segment?.text)) {
      pushError(errors, `${path}.segments[${index}]`, "Segmento precisa somente de id e text.");
    }
  });
  const annotations = Array.isArray(card?.annotations) ? card.annotations : [];
  validateUniqueObjectIds(annotations, `${path}.annotations`, errors, "annotations");
  if (annotations.length > limits.maxAnnotations) {
    pushError(
      errors,
      `${path}.annotations`,
      `annotated_text aceita no máximo ${limits.maxAnnotations} anotações.`
    );
  }
  annotations.forEach((annotation, index) => {
    const annotationPath = `${path}.annotations[${index}]`;
    if (Object.keys(annotation || {}).some((key) =>
      !["id", "targetIds", "label", "note"].includes(key))) {
      pushError(errors, annotationPath, "Anotação contém campo fora do schema.");
    }
    if (!Array.isArray(annotation?.targetIds) || !annotation.targetIds.length ||
        new Set(annotation.targetIds.map(text)).size !== annotation.targetIds.length ||
        annotation.targetIds.some((id) => !segmentIds.has(text(id)))) {
      pushError(errors, `${annotationPath}.targetIds`, "Anotação referencia segmento inexistente.");
    }
    if (!text(annotation?.label) || !text(annotation?.note)) {
      pushError(errors, annotationPath, "Anotação precisa de label e note.");
    }
  });
  validateContextualChoiceExercise(card, path, errors);
}

function validateLinguisticExample(card, path, errors) {
  const limits = canonicalSemanticLimits("linguistic_example");
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "linguistic_example precisa de prompt.");
  }
  if (!text(card?.languageTag)) {
    pushError(
      errors,
      `${path}.languageTag`,
      "linguistic_example precisa de languageTag explícito."
    );
  }
  if (!["horizontal", "vertical"].includes(text(card?.writingMode))) {
    pushError(errors, `${path}.writingMode`, "writingMode inválido.");
  }
  if (!["word", "morpheme"].includes(text(card?.alignment))) {
    pushError(errors, `${path}.alignment`, "alignment inválido.");
  }
  const units = Array.isArray(card?.units) ? card.units : [];
  validateUniqueObjectIds(units, `${path}.units`, errors, "units");
  if (units.length > limits.maxUnits) {
    pushError(
      errors,
      `${path}.units`,
      `linguistic_example aceita no máximo ${limits.maxUnits} unidades.`
    );
  }
  units.forEach((unit, index) => {
    const unitPath = `${path}.units[${index}]`;
    if (Object.keys(unit || {}).some((key) =>
      !["id", "form", "traditional", "simplified", "reading", "ipa", "gloss", "translation"].includes(key))) {
      pushError(errors, unitPath, "Unidade linguística contém campo fora do schema.");
    }
    if (!text(unit?.form) || !text(unit?.translation)) {
      pushError(errors, unitPath, "Unidade linguística precisa de form e translation.");
    }
  });
  validateContextualChoiceExercise(card, path, errors);
}

const SYSTEM_MAP_GROUP_KINDS = new Set([
  "region",
  "zone",
  "network",
  "cluster",
  "namespace",
  "container",
  "stage",
  "boundary"
]);
const SYSTEM_MAP_NODE_KINDS = new Set([
  "client",
  "service",
  "database",
  "queue",
  "storage",
  "gateway",
  "worker",
  "external"
]);
const REACTION_TYPES = new Set(["forward", "reversible", "equilibrium"]);
const REACTION_STATES = new Set(["s", "l", "g", "aq"]);

function validateReferencedHighlightIds({
  highlight,
  path,
  errors,
  fields
}) {
  if (highlight === undefined) return;
  const allowedFields = Object.keys(fields);
  if (!validateObjectFields(highlight, allowedFields, path, errors, "highlight")) {
    return;
  }
  let hasSelection = false;
  allowedFields.forEach((fieldName) => {
    if (!hasOwn(highlight, fieldName)) return;
    hasSelection = true;
    const values = highlight[fieldName];
    if (!Array.isArray(values) || !values.length) {
      pushError(errors, `${path}.${fieldName}`, "O destaque precisa conter ao menos um id.");
      return;
    }
    validateUniquePrimitiveList(values, `${path}.${fieldName}`, errors, "highlight");
    values.forEach((value, index) => {
      const id = text(value);
      if (!id || !fields[fieldName].has(id)) {
        pushError(
          errors,
          `${path}.${fieldName}[${index}]`,
          `O destaque referencia um id inexistente: "${id}".`
        );
      }
    });
  });
  if (!hasSelection) {
    pushError(errors, path, "highlight precisa indicar ao menos uma entidade.");
  }
}

function validateSystemMap(card, path, errors) {
  const limits = canonicalSemanticLimits("system_map");
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "system_map precisa de prompt.");
  }

  const groups = Array.isArray(card?.groups) ? card.groups : [];
  const groupIds = validateUniqueObjectIds(
    groups,
    `${path}.groups`,
    errors,
    "groups"
  );
  if (groups.length > limits.maxGroups) {
    pushError(
      errors,
      `${path}.groups`,
      `system_map aceita no máximo ${limits.maxGroups} grupos.`
    );
  }
  const groupById = new Map();
  groups.forEach((group, index) => {
    const groupPath = `${path}.groups[${index}]`;
    if (!validateObjectFields(
      group,
      ["id", "label", "kind", "parentId"],
      groupPath,
      errors,
      "grupo"
    )) return;
    const id = text(group.id);
    if (id) groupById.set(id, group);
    if (!text(group.label)) {
      pushError(errors, `${groupPath}.label`, "Grupo precisa de label.");
    }
    if (!SYSTEM_MAP_GROUP_KINDS.has(text(group.kind))) {
      pushError(errors, `${groupPath}.kind`, "kind de grupo inválido.");
    }
    if (!hasOwn(group, "parentId") ||
        (group.parentId !== null && !text(group.parentId))) {
      pushError(
        errors,
        `${groupPath}.parentId`,
        "parentId precisa ser null ou id de outro grupo."
      );
    } else if (group.parentId !== null) {
      const parentId = text(group.parentId);
      if (parentId === id || !groupIds.has(parentId)) {
        pushError(
          errors,
          `${groupPath}.parentId`,
          "parentId precisa apontar para outro grupo existente."
        );
      }
    }
  });

  let maxObservedDepth = 0;
  const reportedCycles = new Set();
  groupById.forEach((_group, startId) => {
    const chain = [];
    const visited = new Set();
    let currentId = startId;
    while (currentId && groupById.has(currentId)) {
      if (visited.has(currentId)) {
        const cycleStart = chain.indexOf(currentId);
        const signature = [...chain.slice(Math.max(0, cycleStart)), currentId]
          .sort()
          .join("|");
        if (!reportedCycles.has(signature)) {
          reportedCycles.add(signature);
          pushError(errors, `${path}.groups`, "A hierarquia de grupos contém ciclo.");
        }
        break;
      }
      visited.add(currentId);
      chain.push(currentId);
      const parentId = groupById.get(currentId)?.parentId;
      currentId = parentId === null ? "" : text(parentId);
    }
    maxObservedDepth = Math.max(maxObservedDepth, chain.length);
  });
  if (maxObservedDepth > limits.maxGroupDepth) {
    pushError(
      errors,
      `${path}.groups`,
      `system_map aceita profundidade máxima de ${limits.maxGroupDepth} grupos.`
    );
  }

  const nodes = Array.isArray(card?.nodes) ? card.nodes : [];
  const nodeIds = validateUniqueObjectIds(
    nodes,
    `${path}.nodes`,
    errors,
    "nodes"
  );
  if (nodes.length > limits.maxNodes) {
    pushError(
      errors,
      `${path}.nodes`,
      `system_map aceita no máximo ${limits.maxNodes} componentes.`
    );
  }
  nodes.forEach((node, index) => {
    const nodePath = `${path}.nodes[${index}]`;
    if (!validateObjectFields(
      node,
      ["id", "label", "kind", "groupId"],
      nodePath,
      errors,
      "componente"
    )) return;
    if (!text(node.label)) {
      pushError(errors, `${nodePath}.label`, "Componente precisa de label.");
    }
    if (!SYSTEM_MAP_NODE_KINDS.has(text(node.kind))) {
      pushError(errors, `${nodePath}.kind`, "kind de componente inválido.");
    }
    if (!hasOwn(node, "groupId") ||
        (node.groupId !== null && !text(node.groupId))) {
      pushError(
        errors,
        `${nodePath}.groupId`,
        "groupId precisa ser null ou id de grupo."
      );
    } else if (node.groupId !== null && !groupIds.has(text(node.groupId))) {
      pushError(
        errors,
        `${nodePath}.groupId`,
        "groupId referencia grupo inexistente."
      );
    }
  });

  if (!Array.isArray(card?.links)) {
    pushError(errors, `${path}.links`, "system_map precisa de links, ainda que vazio.");
  }
  const links = Array.isArray(card?.links) ? card.links : [];
  const linkIds = links.length
    ? validateUniqueObjectIds(links, `${path}.links`, errors, "links")
    : new Set();
  if (links.length > limits.maxLinks) {
    pushError(
      errors,
      `${path}.links`,
      `system_map aceita no máximo ${limits.maxLinks} conexões.`
    );
  }
  links.forEach((link, index) => {
    const linkPath = `${path}.links[${index}]`;
    if (!validateObjectFields(
      link,
      ["id", "from", "to", "label", "directed"],
      linkPath,
      errors,
      "conexão"
    )) return;
    if (!nodeIds.has(text(link.from))) {
      pushError(errors, `${linkPath}.from`, "from referencia componente inexistente.");
    }
    if (!nodeIds.has(text(link.to))) {
      pushError(errors, `${linkPath}.to`, "to referencia componente inexistente.");
    }
    if (hasOwn(link, "label") && typeof link.label !== "string") {
      pushError(errors, `${linkPath}.label`, "label de conexão deve ser texto.");
    }
    if (hasOwn(link, "directed") && typeof link.directed !== "boolean") {
      pushError(errors, `${linkPath}.directed`, "directed deve ser booleano.");
    }
  });

  validateReferencedHighlightIds({
    highlight: card?.highlight,
    path: `${path}.highlight`,
    errors,
    fields: {
      groupIds,
      nodeIds,
      linkIds
    }
  });
  validateContextualChoiceExercise(card, path, errors);
}

function isStandaloneCompiledGap(value) {
  const source = text(value);
  const tokens = parseTextGapTokens(source)
    .filter((token) => token.valid);
  return tokens.length === 1 && tokens[0].raw === source;
}

function validateReactionSpeciesList(
  species,
  path,
  errors,
  limits,
  globalIds
) {
  if (!Array.isArray(species) || !species.length) {
    pushError(errors, path, "Cada lado da reação precisa de ao menos uma espécie.");
    return new Set();
  }
  if (species.length > limits.maxSpeciesPerSide) {
    pushError(
      errors,
      path,
      `Cada lado aceita no máximo ${limits.maxSpeciesPerSide} espécies.`
    );
  }
  const ids = new Set();
  species.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!validateObjectFields(
      item,
      ["id", "formula", "name", "coefficient", "state", "charge"],
      itemPath,
      errors,
      "espécie"
    )) return;
    const id = text(item.id);
    if (!id || ids.has(id) || globalIds.has(id)) {
      pushError(
        errors,
        `${itemPath}.id`,
        "Cada espécie precisa de id único em toda a reação."
      );
    }
    if (id) {
      ids.add(id);
      globalIds.add(id);
    }
    if (!text(item.formula)) {
      pushError(errors, `${itemPath}.formula`, "Espécie precisa de formula.");
    }
    if (!text(item.name)) {
      pushError(errors, `${itemPath}.name`, "Espécie precisa de name.");
    }
    if (hasOwn(item, "coefficient")) {
      const coefficient = item.coefficient;
      const validInteger = Number.isInteger(coefficient)
        && coefficient >= 1
        && coefficient <= 99;
      if (!validInteger && !isStandaloneCompiledGap(coefficient)) {
        pushError(
          errors,
          `${itemPath}.coefficient`,
          "coefficient deve ser inteiro de 1 a 99 ou uma única lacuna compilada."
        );
      }
    }
    if (hasOwn(item, "state") && !REACTION_STATES.has(text(item.state))) {
      pushError(errors, `${itemPath}.state`, "state deve ser s, l, g ou aq.");
    }
    if (hasOwn(item, "charge") &&
        (!Number.isInteger(item.charge) || item.charge < -8 || item.charge > 8)) {
      pushError(errors, `${itemPath}.charge`, "charge deve ser inteiro entre -8 e 8.");
    }
  });
  return ids;
}

function validateReaction(card, path, errors) {
  const limits = canonicalSemanticLimits("reaction");
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "reaction precisa de prompt.");
  }
  if (!REACTION_TYPES.has(text(card?.reactionType))) {
    pushError(errors, `${path}.reactionType`, "reactionType inválido.");
  }
  const globalIds = new Set();
  const reactantIds = validateReactionSpeciesList(
    card?.reactants,
    `${path}.reactants`,
    errors,
    limits,
    globalIds
  );
  const productIds = validateReactionSpeciesList(
    card?.products,
    `${path}.products`,
    errors,
    limits,
    globalIds
  );
  if (!Array.isArray(card?.conditions)) {
    pushError(errors, `${path}.conditions`, "conditions precisa ser uma lista, ainda que vazia.");
  } else {
    if (card.conditions.length > limits.maxConditions) {
      pushError(
        errors,
        `${path}.conditions`,
        `reaction aceita no máximo ${limits.maxConditions} condições.`
      );
    }
    card.conditions.forEach((condition, index) => {
      if (!text(condition)) {
        pushError(
          errors,
          `${path}.conditions[${index}]`,
          "Cada condição precisa ser texto não vazio."
        );
      }
    });
  }
  validateReferencedHighlightIds({
    highlight: card?.highlight,
    path: `${path}.highlight`,
    errors,
    fields: {
      speciesIds: new Set([...reactantIds, ...productIds])
    }
  });
  validateContextualChoiceExercise(card, path, errors);
}

function buildAllowedFieldSet(resource) {
  const common = [
    "id", "position", "resource", "kind", "exercise", "title", "after", "afterBlocks", "sources", "topics",
    "languageTag", "textDirection"
  ];
  const perResource = {
    paragraph: [...common, "text"],
    choice: [
      ...common,
      "question",
      "selectionMode",
      "selectionCriterion",
      "options",
      "answerIds"
    ],
    composite: [...common, "blocks"],
    code: [...common, "prompt", "language", "code", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    table: [...common, "columns", "rows", "layout", "columnMeta", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    flow: [...common, "prompt", "structure", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    tree: [...common, "prompt", "variant", "nodes", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    graph: [...common, "prompt", "layout", "vertices", "edges", "highlight", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    relation_map: [...common, "prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable", "highlight", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    matrix: [...common, "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    plane: [...common, "prompt", "x", "y", "vector", "vectors", "sum", "scale", "distance", "result", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    formula: [...common, "prompt", "notation", "accessibleText", "expression", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    chart: [...common, "prompt", "chartType", "xAxis", "yAxis", "series", "highlight", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    sequence: [...common, "prompt", "variant", "items", "highlight", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    annotated_text: [...common, "prompt", "segments", "annotations", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    linguistic_example: [...common, "prompt", "writingMode", "alignment", "units", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    system_map: [...common, "prompt", "groups", "nodes", "links", "highlight", "question", "selectionMode", "selectionCriterion", "options", "answerIds"],
    reaction: [...common, "prompt", "reactionType", "reactants", "products", "conditions", "highlight", "question", "selectionMode", "selectionCriterion", "options", "answerIds"]
  };
  return new Set(perResource[resource] || common);
}

function validateUnknownFields(card, path, errors, resource) {
  const allowed = buildAllowedFieldSet(resource);
  Object.keys(card || {}).forEach((fieldName) => {
    if (!allowed.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema: "${fieldName}".`);
    }
  });
}

export function validateCard(card, path = "$.card") {
  const errors = [];
  if (!isPlainObject(card)) {
    return { ok: false, errors: [{ path, message: "Card deve ser um objeto." }] };
  }

  const common = validateCommon(card, path, errors);
  validateUnknownFields(card, path, errors, common.resource);
  validateTextMetadata(card, path, errors);
  const sources = validateSources(card, path, errors);
  const topics = validateTopics(card, path, errors);
  validateAfter(card, path, errors);
  const afterBlocks = validateAfterBlocks(card, path, errors);

  if (common.resource === "paragraph") validateParagraph(card, path, errors);
  if (common.resource === "choice") validateChoice(card, path, errors);
  const compositeBlocks = common.resource === "composite" ? validateComposite(card, path, errors) : [];
  if (common.resource === "code") validateCode(card, path, errors);
  if (common.resource === "table") validateTable(card, path, errors);
  if (common.resource === "flow") validateFlow(card, path, errors);
  if (common.resource === "tree") validateTree(card, path, errors);
  if (common.resource === "graph") validateGraph(card, path, errors);
  if (common.resource === "relation_map") validateRelationMap(card, path, errors);
  if (common.resource === "matrix") validateMatrix(card, path, errors);
  if (common.resource === "plane") validatePlane(card, path, errors);
  if (common.resource === "formula") validateFormula(card, path, errors);
  if (common.resource === "chart") validateChart(card, path, errors);
  if (common.resource === "sequence") validateSequence(card, path, errors);
  if (common.resource === "annotated_text") validateAnnotatedText(card, path, errors);
  if (common.resource === "linguistic_example") validateLinguisticExample(card, path, errors);
  if (common.resource === "system_map") validateSystemMap(card, path, errors);
  if (common.resource === "reaction") validateReaction(card, path, errors);

  return finalizeValidation(errors, {
    id: text(card?.id) || buildScopedKey("card", common.title || common.resource || "item"),
    position: common.position,
    resource: common.resource,
    kind: common.kind,
    exercise: common.exercise,
    title: common.title,
    ...normalizedTextMetadata(card),
    ...(text(card?.text) ? { text: text(card.text) } : {}),
    ...(text(card?.question) ? { question: text(card.question) } : {}),
    ...(common.resource === "composite" ? { blocks: compositeBlocks } : {}),
    ...(Array.isArray(card?.options)
      ? {
          options: card.options.map((option, index) => normalizeChoiceOption(option, index))
        }
      : {}),
    ...(text(card?.selectionMode) ? { selectionMode: text(card.selectionMode) } : {}),
    ...(text(card?.selectionCriterion)
      ? { selectionCriterion: text(card.selectionCriterion) }
      : {}),
    ...(Array.isArray(card?.answerIds)
      ? { answerIds: card.answerIds.map((answerId) => text(answerId)).filter(Boolean) }
      : {}),
    ...(text(card?.prompt) ? { prompt: text(card.prompt) } : {}),
    ...(text(card?.language) ? { language: text(card.language) } : {}),
    ...(codeText(card?.code).trim() ? { code: codeText(card.code) } : {}),
    ...(Array.isArray(card?.columns) ? { columns: card.columns.map((item) => text(item)) } : {}),
    ...(text(card?.layout) ? { layout: text(card.layout) } : {}),
    ...(Array.isArray(card?.columnMeta) ? { columnMeta: structuredClone(card.columnMeta) } : {}),
    ...(Array.isArray(card?.rows)
      ? { rows: card.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [])) }
      : {}),
    ...(card?.structure && typeof card.structure === "object" ? { structure: structuredClone(normalizeFlowchartStructure(card.structure)) } : {}),
    ...(text(card?.variant) ? { variant: text(card.variant) } : {}),
    ...(Array.isArray(card?.groups) ? { groups: structuredClone(card.groups) } : {}),
    ...(Array.isArray(card?.nodes) ? { nodes: structuredClone(card.nodes) } : {}),
    ...(Array.isArray(card?.links) ? { links: structuredClone(card.links) } : {}),
    ...(Array.isArray(card?.edges)
      ? { edges: common.resource === "graph" ? normalizeGraphEdges(card.edges) : structuredClone(card.edges) }
      : {}),
    ...(Array.isArray(card?.vertices) ? { vertices: normalizeGraphVertices(card.vertices) } : {}),
    ...(card?.leftSet && typeof card.leftSet === "object" ? { leftSet: normalizeRelationSetOutput(card.leftSet, "u") } : {}),
    ...(card?.rightSet && typeof card.rightSet === "object" ? { rightSet: normalizeRelationSetOutput(card.rightSet, "v") } : {}),
    ...(Array.isArray(card?.relations)
      ? {
          relations: card.relations.map((relation) => ({
            from: text(relation?.from),
            to: text(relation?.to),
            ...(text(relation?.label) ? { label: text(relation.label) } : {})
          }))
        }
      : {}),
    ...(Array.isArray(card?.pairList) ? { pairList: structuredClone(card.pairList) } : {}),
    ...(card?.relationTable && typeof card.relationTable === "object" ? { relationTable: structuredClone(card.relationTable) } : {}),
    ...(card?.highlight && typeof card.highlight === "object" ? { highlight: structuredClone(card.highlight) } : {}),
    ...(text(card?.name) ? { name: text(card.name) } : {}),
    ...(Array.isArray(card?.values) ? { values: structuredClone(card.values) } : {}),
    ...(card?.dividerAfterColumn !== undefined ? { dividerAfterColumn: Number(card.dividerAfterColumn) } : {}),
    ...(Array.isArray(card?.sequence) ? { sequence: structuredClone(card.sequence) } : {}),
    ...(Array.isArray(card?.x) ? { x: structuredClone(card.x) } : {}),
    ...(Array.isArray(card?.y) ? { y: structuredClone(card.y) } : {}),
    ...(Array.isArray(card?.vector) ? { vector: structuredClone(card.vector) } : {}),
    ...(Array.isArray(card?.vectors) ? { vectors: structuredClone(card.vectors) } : {}),
    ...(Array.isArray(card?.sum) ? { sum: structuredClone(card.sum) } : {}),
    ...(card?.scale && typeof card.scale === "object" ? { scale: structuredClone(card.scale) } : {}),
    ...(Array.isArray(card?.distance) ? { distance: structuredClone(card.distance) } : {}),
    ...(Array.isArray(card?.result) || typeof card?.result === "string" ? { result: structuredClone(card.result) } : {}),
    ...(text(card?.notation) ? { notation: text(card.notation) } : {}),
    ...(text(card?.accessibleText) ? { accessibleText: text(card.accessibleText) } : {}),
    ...(card?.expression && typeof card.expression === "object" ? { expression: structuredClone(card.expression) } : {}),
    ...(text(card?.chartType) ? { chartType: text(card.chartType) } : {}),
    ...(card?.xAxis && typeof card.xAxis === "object" ? { xAxis: structuredClone(card.xAxis) } : {}),
    ...(card?.yAxis && typeof card.yAxis === "object" ? { yAxis: structuredClone(card.yAxis) } : {}),
    ...(Array.isArray(card?.series) ? { series: structuredClone(card.series) } : {}),
    ...(Array.isArray(card?.items) ? { items: structuredClone(card.items) } : {}),
    ...(Array.isArray(card?.segments) ? { segments: structuredClone(card.segments) } : {}),
    ...(Array.isArray(card?.annotations) ? { annotations: structuredClone(card.annotations) } : {}),
    ...(text(card?.writingMode) ? { writingMode: text(card.writingMode) } : {}),
    ...(text(card?.alignment) ? { alignment: text(card.alignment) } : {}),
    ...(Array.isArray(card?.units) ? { units: structuredClone(card.units) } : {}),
    ...(text(card?.reactionType) ? { reactionType: text(card.reactionType) } : {}),
    ...(Array.isArray(card?.reactants) ? { reactants: structuredClone(card.reactants) } : {}),
    ...(Array.isArray(card?.products) ? { products: structuredClone(card.products) } : {}),
    ...(Array.isArray(card?.conditions) ? { conditions: structuredClone(card.conditions) } : {}),
    after: text(card?.after),
    ...(afterBlocks.length ? { afterBlocks } : {}),
    ...(sources.length ? { sources } : {}),
    ...(topics.length ? { topics } : {})
  });
}

export function normalizeGeneratedCard(card, path = "$.card") {
  const result = validateCard(card, path);
  if (!result.ok) {
    throw new Error(result.errors.map((error) => `${error.path}: ${error.message}`).join("; "));
  }
  return result.value;
}
