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
  "fenced"
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
