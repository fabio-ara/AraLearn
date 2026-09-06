export const CALCULATOR_LIMITS = Object.freeze({ characters: 256, tokens: 128, depth: 32, significantDigits: 12 });
export const CALCULATOR_FUNCTIONS = Object.freeze(["abs", "sqrt", "ln", "log", "exp", "sin", "cos", "tan"]);

export class CalculatorError extends Error {
  constructor(code, message, position = null) {
    super(message);
    this.name = "CalculatorError";
    this.code = code;
    this.position = position;
  }
}

const fail = (code, message, position) => { throw new CalculatorError(code, message, position); };
const finite = (value) => {
  if (!Number.isFinite(value)) fail("result_out_of_range", "O resultado não é um número real finito representável nesta calculadora.");
  return Object.is(value, -0) ? 0 : value;
};

function tokenize(expression) {
  if (typeof expression !== "string" || !expression.trim()) fail("empty_expression", "Digite uma expressão para calcular.");
  if (expression.length > CALCULATOR_LIMITS.characters) fail("expression_too_long", "Use uma expressão de até 256 caracteres.");
  const tokens = [];
  let position = 0;
  while (position < expression.length) {
    if (/\s/u.test(expression[position])) { position += 1; continue; }
    const start = position;
    const rest = expression.slice(position);
    const number = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?/u.exec(rest)?.[0];
    if (number) {
      const value = Number(number.replace(",", "."));
      if (!Number.isFinite(value) || value === 0 && /[1-9]/u.test(number.split(/[eE]/u)[0])) {
        fail("number_out_of_range", "O número está fora do intervalo representável.", start);
      }
      tokens.push({ kind: "number", value, position: start }); position += number.length;
    } else {
      const name = /^[a-z]+/iu.exec(rest)?.[0];
      if (name) {
        const value = name.toLowerCase();
        if (!["pi", "e", ...CALCULATOR_FUNCTIONS].includes(value)) {
          fail("unknown_name", "Use somente pi, e e as funções indicadas na calculadora.", start);
        }
        tokens.push({ kind: "name", value, position: start }); position += name.length;
      } else {
        const raw = expression[position];
        const value = ({ "−": "-", "×": "*", "÷": "/", "π": "pi" })[raw] ?? raw;
        if (!"+-*/^()".includes(value) && value !== "pi") {
          fail("invalid_character", "A expressão contém um símbolo não aceito. Use os operadores indicados.", start);
        }
        tokens.push({ kind: value === "pi" ? "name" : "operator", value, position: start }); position += 1;
      }
    }
    if (tokens.length > CALCULATOR_LIMITS.tokens) fail("expression_too_complex", "Divida o cálculo em expressões menores.");
  }
  return tokens;
}

function applyFunction(name, value, angleUnit) {
  if (name === "sqrt" && value < 0) fail("outside_real_domain", "A raiz quadrada exige um número maior ou igual a zero.");
  if (["ln", "log"].includes(name) && value <= 0) fail("outside_real_domain", "O logaritmo exige um número maior que zero.");
  if (name === "abs") return Math.abs(value);
  if (name === "sqrt") return Math.sqrt(value);
  if (name === "ln") return Math.log(value);
  if (name === "log") return Math.log10(value);
  if (name === "exp") {
    const result = finite(Math.exp(value));
    if (result === 0) fail("result_out_of_range", "O resultado é pequeno demais para ser representado sem se tornar zero.");
    return result;
  }
  if (Math.abs(value) > 1e12) fail("angle_out_of_range", "Use um ângulo entre −10¹² e 10¹² para limitar a perda de precisão.");
  const radians = angleUnit === "degrees" ? value / 180 * Math.PI : value;
  if (name === "sin") return Math.sin(radians);
  if (name === "cos") return Math.cos(radians);
  if (name === "tan") {
    if (Math.abs(Math.cos(radians)) < 1e-12) fail("outside_real_domain", "A tangente está indefinida ou perto demais de um polo para este cálculo aproximado.");
    return Math.tan(radians);
  }
  fail("unknown_name", "Função não aceita.");
}

// Recursive descent over an explicit numeric grammar. No property access,
// variables, assignment, implicit multiplication or executable language nodes.
export function evaluateCalculatorExpression(expression, { angleUnit = "radians" } = {}) {
  if (!["radians", "degrees"].includes(angleUnit)) fail("invalid_angle_unit", "Escolha radianos ou graus.");
  const tokens = tokenize(expression);
  let cursor = 0;
  const peek = () => tokens[cursor]?.value;
  const accept = (value) => peek() === value ? (cursor += 1, true) : false;
  const checkDepth = (depth) => {
    if (depth > CALCULATOR_LIMITS.depth) fail("expression_too_deep", "Use até 32 níveis de parênteses, sinais e potências.");
  };
  const primary = (depth) => {
    checkDepth(depth);
    const token = tokens[cursor++];
    if (!token) fail("incomplete_expression", "Complete a expressão antes de calcular.");
    if (token.kind === "number") return token.value;
    if (token.value === "(") {
      const value = sum(depth + 1);
      if (!accept(")")) fail("unclosed_parenthesis", "Feche os parênteses da expressão.", token.position);
      return value;
    }
    if (token.kind === "name") {
      if (token.value === "pi") return Math.PI;
      if (token.value === "e") return Math.E;
      if (!accept("(")) fail("function_parenthesis", "Escreva o argumento da função entre parênteses.", token.position);
      const value = sum(depth + 1);
      if (!accept(")")) fail("unclosed_parenthesis", "Feche os parênteses da função.", token.position);
      return finite(applyFunction(token.value, value, angleUnit));
    }
    fail("unexpected_operator", "Há um operador sem número ou expressão correspondente.", token.position);
  };
  const power = (depth) => {
    const left = primary(depth);
    if (!accept("^")) return left;
    const right = unary(depth + 1);
    if (left === 0 && right <= 0) fail("outside_real_domain", "Zero exige expoente positivo nesta calculadora.");
    if (left < 0 && !Number.isInteger(right)) fail("outside_real_domain", "Uma base negativa exige expoente inteiro nesta calculadora real.");
    const value = finite(left ** right);
    if (value === 0 && left !== 0) fail("result_out_of_range", "O resultado é pequeno demais para ser representado sem se tornar zero.");
    return value;
  };
  const unary = (depth) => {
    checkDepth(depth);
    if (accept("+")) return unary(depth + 1);
    if (accept("-")) return finite(-unary(depth + 1));
    return power(depth);
  };
  const product = (depth) => {
    let value = unary(depth);
    while (["*", "/"].includes(peek())) {
      const operator = tokens[cursor++].value;
      const right = unary(depth);
      if (operator === "/" && right === 0) fail("division_by_zero", "Não é possível dividir por zero.");
      const result = finite(operator === "*" ? value * right : value / right);
      if (result === 0 && value !== 0 && right !== 0) fail("result_out_of_range", "O resultado é pequeno demais para ser representado sem se tornar zero.");
      value = result;
    }
    return value;
  };
  const sum = (depth) => {
    let value = product(depth);
    while (["+", "-"].includes(peek())) {
      const operator = tokens[cursor++].value;
      const right = product(depth);
      value = finite(operator === "+" ? value + right : value - right);
    }
    return value;
  };
  const value = finite(sum(0));
  if (cursor !== tokens.length) fail("unexpected_token", "Separe números e expressões com um operador explícito; confira os parênteses.", tokens[cursor].position);
  return { value, text: String(Number(value.toPrecision(CALCULATOR_LIMITS.significantDigits))) };
}
