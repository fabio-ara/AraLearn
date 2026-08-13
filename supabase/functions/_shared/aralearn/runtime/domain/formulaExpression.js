export const FORMULA_NOTATIONS = Object.freeze(["mathematics", "chemistry"]);

export const FORMULA_NODE_TYPES = Object.freeze([
  "row",
  "number",
  "identifier",
  "operator",
  "text",
  "fraction",
  "root",
  "superscript",
  "subscript",
  "subsup",
  "fenced",
  "function",
  "integral",
  "derivative",
  "tensor",
  "large_operator"
]);

const FORMULA_NODE_TYPE_SET = new Set(FORMULA_NODE_TYPES);
const FORMULA_FENCE_PAIRS = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["|", "|"],
  ["‖", "‖"],
  ["⟨", "⟩"]
]);
const MAX_FORMULA_DEPTH = 32;
const MAX_FORMULA_NODES = 512;
const MAX_FORMULA_TOKEN_LENGTH = 256;
const MARKUP_PATTERN = /<\/?[A-Za-z][^>]*>/u;

const FORMULA_TOKEN_INPUT_SCHEMA = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: MAX_FORMULA_TOKEN_LENGTH,
  description: "Token textual sem HTML ou MathML."
});

function formulaObjectSchema(type, requiredFields, properties) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", ...requiredFields],
    properties: {
      type: { const: type },
      ...properties
    }
  };
}

const FORMULA_REFERENCE = Object.freeze({ $ref: "#/$defs/node" });
const FORMULA_NODE_LIST_INPUT_SCHEMA = Object.freeze({
  type: "array",
  minItems: 1,
  maxItems: 16,
  items: FORMULA_REFERENCE
});

/**
 * Linguagem autoral canônica da AST de fórmulas.
 *
 * O runtime e a porta MCP importam esta mesma definição. Os `$ref` são locais
 * para que o esquema continue autocontido quando for incorporado a outro
 * contrato.
 */
export const FORMULA_EXPRESSION_INPUT_SCHEMA = Object.freeze({
  $id: "urn:aralearn:schema:formula-expression:v1",
  $ref: "#/$defs/node",
  $defs: {
    node: {
      oneOf: [
        formulaObjectSchema("row", ["children"], {
          children: {
            type: "array",
            minItems: 1,
            maxItems: 64,
            items: FORMULA_REFERENCE
          }
        }),
        ...["number", "identifier", "operator", "text"].map((type) =>
          formulaObjectSchema(type, ["value"], {
            value: FORMULA_TOKEN_INPUT_SCHEMA
          })
        ),
        formulaObjectSchema("fraction", ["numerator", "denominator"], {
          numerator: FORMULA_REFERENCE,
          denominator: FORMULA_REFERENCE
        }),
        formulaObjectSchema("root", ["radicand"], {
          radicand: FORMULA_REFERENCE,
          index: FORMULA_REFERENCE
        }),
        formulaObjectSchema("superscript", ["base", "exponent"], {
          base: FORMULA_REFERENCE,
          exponent: FORMULA_REFERENCE
        }),
        formulaObjectSchema("subscript", ["base", "subscript"], {
          base: FORMULA_REFERENCE,
          subscript: FORMULA_REFERENCE
        }),
        formulaObjectSchema("subsup", ["base", "subscript", "superscript"], {
          base: FORMULA_REFERENCE,
          subscript: FORMULA_REFERENCE,
          superscript: FORMULA_REFERENCE
        }),
        ...[...FORMULA_FENCE_PAIRS.entries()].map(([open, close]) =>
          formulaObjectSchema("fenced", ["open", "close", "content"], {
            open: { const: open },
            close: { const: close },
            content: FORMULA_REFERENCE
          })
        ),
        formulaObjectSchema("function", ["name", "arguments"], {
          name: FORMULA_TOKEN_INPUT_SCHEMA,
          arguments: FORMULA_NODE_LIST_INPUT_SCHEMA
        }),
        formulaObjectSchema("integral", ["kind", "integrand", "variable"], {
          kind: { type: "string", enum: ["single", "double", "triple", "contour", "surface", "volume"] },
          integrand: FORMULA_REFERENCE,
          variable: FORMULA_REFERENCE,
          lower: FORMULA_REFERENCE,
          upper: FORMULA_REFERENCE
        }),
        formulaObjectSchema("derivative", ["kind", "expression", "variables"], {
          kind: { type: "string", enum: ["ordinary", "partial"] },
          expression: FORMULA_REFERENCE,
          variables: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { $ref: "#/$defs/derivativeVariable" }
          }
        }),
        {
          ...formulaObjectSchema("tensor", ["symbol"], {
            symbol: FORMULA_TOKEN_INPUT_SCHEMA,
            lowerIndices: FORMULA_NODE_LIST_INPUT_SCHEMA,
            upperIndices: FORMULA_NODE_LIST_INPUT_SCHEMA
          }),
          anyOf: [{ required: ["lowerIndices"] }, { required: ["upperIndices"] }]
        },
        formulaObjectSchema("large_operator", ["operator", "body"], {
          operator: { type: "string", enum: ["sum", "product", "limit"] },
          body: FORMULA_REFERENCE,
          lower: FORMULA_REFERENCE,
          upper: FORMULA_REFERENCE
        })
      ]
    },
    derivativeVariable: {
      type: "object",
      additionalProperties: false,
      required: ["symbol"],
      properties: {
        symbol: FORMULA_REFERENCE,
        order: { type: "integer", minimum: 1, maximum: 9 }
      }
    }
  },
  description: "AST determinística de fórmula matemática ou química, com nós semânticos para funções, integrais, derivadas, tensores e operadores grandes."
});

function containsForbiddenControl(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 8 || codePoint === 11 || codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) || codePoint === 127;
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function validateFields(node, allowed, path, errors) {
  Object.keys(node).forEach((fieldName) => {
    if (!allowed.includes(fieldName)) {
      addError(errors, `${path}.${fieldName}`, `Campo fora da AST de fórmula: "${fieldName}".`);
    }
  });
}

function validateToken(value, path, errors, label) {
  if (typeof value !== "string" || !value.trim()) {
    addError(errors, path, `${label} precisa ser texto não vazio.`);
    return;
  }
  if ([...value].length > MAX_FORMULA_TOKEN_LENGTH) {
    addError(errors, path, `${label} aceita no máximo ${MAX_FORMULA_TOKEN_LENGTH} caracteres.`);
  }
  if (containsForbiddenControl(value)) {
    addError(errors, path, `${label} contém caractere de controle proibido.`);
  }
  if (MARKUP_PATTERN.test(value)) {
    addError(errors, path, `${label} não pode conter marcação HTML ou MathML.`);
  }
}

function validateChild(value, path, errors, state, depth) {
  if (!isPlainObject(value)) {
    addError(errors, path, "Nó de fórmula precisa ser objeto.");
    return;
  }
  validateNode(value, path, errors, state, depth);
}

function validateNode(node, path, errors, state, depth) {
  state.count += 1;
  if (state.count > MAX_FORMULA_NODES) {
    if (!state.reportedSize) {
      addError(errors, path, `A fórmula aceita no máximo ${MAX_FORMULA_NODES} nós.`);
      state.reportedSize = true;
    }
    return;
  }
  if (depth > MAX_FORMULA_DEPTH) {
    addError(errors, path, `A fórmula aceita profundidade máxima de ${MAX_FORMULA_DEPTH} níveis.`);
    return;
  }

  const type = typeof node.type === "string" ? node.type.trim() : "";
  if (!FORMULA_NODE_TYPE_SET.has(type)) {
    addError(errors, `${path}.type`, `Tipo de nó de fórmula inválido: "${type}".`);
    return;
  }

  if (["number", "identifier", "operator", "text"].includes(type)) {
    validateFields(node, ["type", "value"], path, errors);
    validateToken(node.value, `${path}.value`, errors, `value de ${type}`);
    return;
  }

  if (type === "row") {
    validateFields(node, ["type", "children"], path, errors);
    if (!Array.isArray(node.children) || !node.children.length) {
      addError(errors, `${path}.children`, "row precisa de ao menos um filho.");
      return;
    }
    if (node.children.length > 64) {
      addError(errors, `${path}.children`, "row aceita no máximo 64 filhos.");
    }
    node.children.forEach((child, index) => validateChild(child, `${path}.children[${index}]`, errors, state, depth + 1));
    return;
  }

  if (type === "fraction") {
    validateFields(node, ["type", "numerator", "denominator"], path, errors);
    validateChild(node.numerator, `${path}.numerator`, errors, state, depth + 1);
    validateChild(node.denominator, `${path}.denominator`, errors, state, depth + 1);
    return;
  }

  if (type === "root") {
    validateFields(node, ["type", "radicand", "index"], path, errors);
    validateChild(node.radicand, `${path}.radicand`, errors, state, depth + 1);
    if (node.index !== undefined) {
      validateChild(node.index, `${path}.index`, errors, state, depth + 1);
    }
    return;
  }

  if (type === "superscript") {
    validateFields(node, ["type", "base", "exponent"], path, errors);
    validateChild(node.base, `${path}.base`, errors, state, depth + 1);
    validateChild(node.exponent, `${path}.exponent`, errors, state, depth + 1);
    return;
  }

  if (type === "subscript") {
    validateFields(node, ["type", "base", "subscript"], path, errors);
    validateChild(node.base, `${path}.base`, errors, state, depth + 1);
    validateChild(node.subscript, `${path}.subscript`, errors, state, depth + 1);
    return;
  }

  if (type === "subsup") {
    validateFields(node, ["type", "base", "subscript", "superscript"], path, errors);
    validateChild(node.base, `${path}.base`, errors, state, depth + 1);
    validateChild(node.subscript, `${path}.subscript`, errors, state, depth + 1);
    validateChild(node.superscript, `${path}.superscript`, errors, state, depth + 1);
    return;
  }

  if (type === "function") {
    validateFields(node, ["type", "name", "arguments"], path, errors);
    validateToken(node.name, `${path}.name`, errors, "Nome da função");
    if (!Array.isArray(node.arguments) || !node.arguments.length) {
      addError(errors, `${path}.arguments`, "function precisa de ao menos um argumento.");
      return;
    }
    node.arguments.forEach((child, index) => validateChild(child, `${path}.arguments[${index}]`, errors, state, depth + 1));
    return;
  }

  if (type === "integral") {
    validateFields(node, ["type", "kind", "integrand", "variable", "lower", "upper"], path, errors);
    if (!["single", "double", "triple", "contour", "surface", "volume"].includes(node.kind)) addError(errors, `${path}.kind`, "Tipo de integral inválido.");
    validateChild(node.integrand, `${path}.integrand`, errors, state, depth + 1);
    validateChild(node.variable, `${path}.variable`, errors, state, depth + 1);
    if (node.lower !== undefined) validateChild(node.lower, `${path}.lower`, errors, state, depth + 1);
    if (node.upper !== undefined) validateChild(node.upper, `${path}.upper`, errors, state, depth + 1);
    return;
  }

  if (type === "derivative") {
    validateFields(node, ["type", "kind", "expression", "variables"], path, errors);
    if (!["ordinary", "partial"].includes(node.kind)) addError(errors, `${path}.kind`, "Tipo de derivada inválido.");
    validateChild(node.expression, `${path}.expression`, errors, state, depth + 1);
    if (!Array.isArray(node.variables) || !node.variables.length) {
      addError(errors, `${path}.variables`, "derivative precisa de ao menos uma variável.");
      return;
    }
    node.variables.forEach((variable, index) => {
      const variablePath = `${path}.variables[${index}]`;
      if (!isPlainObject(variable)) {
        addError(errors, variablePath, "Variável de derivação precisa ser objeto.");
        return;
      }
      validateFields(variable, ["symbol", "order"], variablePath, errors);
      validateChild(variable.symbol, `${variablePath}.symbol`, errors, state, depth + 1);
      if (variable.order !== undefined && (!Number.isInteger(variable.order) || variable.order < 1 || variable.order > 9)) addError(errors, `${variablePath}.order`, "Ordem precisa ser inteiro entre 1 e 9.");
    });
    return;
  }

  if (type === "tensor") {
    validateFields(node, ["type", "symbol", "lowerIndices", "upperIndices"], path, errors);
    validateToken(node.symbol, `${path}.symbol`, errors, "Símbolo do tensor");
    const lower = Array.isArray(node.lowerIndices) ? node.lowerIndices : [];
    const upper = Array.isArray(node.upperIndices) ? node.upperIndices : [];
    if (!lower.length && !upper.length) addError(errors, path, "tensor precisa de índice inferior ou superior.");
    lower.forEach((child, index) => validateChild(child, `${path}.lowerIndices[${index}]`, errors, state, depth + 1));
    upper.forEach((child, index) => validateChild(child, `${path}.upperIndices[${index}]`, errors, state, depth + 1));
    return;
  }

  if (type === "large_operator") {
    validateFields(node, ["type", "operator", "body", "lower", "upper"], path, errors);
    if (!["sum", "product", "limit"].includes(node.operator)) addError(errors, `${path}.operator`, "Operador grande inválido.");
    validateChild(node.body, `${path}.body`, errors, state, depth + 1);
    if (node.lower !== undefined) validateChild(node.lower, `${path}.lower`, errors, state, depth + 1);
    if (node.upper !== undefined) validateChild(node.upper, `${path}.upper`, errors, state, depth + 1);
    return;
  }

  validateFields(node, ["type", "open", "close", "content"], path, errors);
  if (!FORMULA_FENCE_PAIRS.has(node.open) || FORMULA_FENCE_PAIRS.get(node.open) !== node.close) {
    addError(errors, path, "fenced precisa usar um par permitido: (), [], {}, ||, ‖‖ ou ⟨⟩.");
  }
  validateChild(node.content, `${path}.content`, errors, state, depth + 1);
}

export function validateFormulaExpression(expression, path = "$.expression") {
  const errors = [];
  if (!isPlainObject(expression)) {
    return { ok: false, errors: [{ path, message: "expression precisa ser uma AST de fórmula." }] };
  }
  validateNode(expression, path, errors, { count: 0, reportedSize: false }, 1);
  return errors.length
    ? { ok: false, errors }
    : { ok: true, errors: [], value: structuredClone(expression) };
}

export function isFormulaNotation(value) {
  return FORMULA_NOTATIONS.includes(String(value || "").trim());
}
