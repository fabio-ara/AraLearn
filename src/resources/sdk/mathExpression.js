import { escapePackageAttribute, escapePackageHtml } from "./html.js";
import { renderStretchDelimiter } from "./stretchDelimiter.js";
import { validateFormulaExpression } from "../../domain/formulaExpression.js";

const STACKED_EXPRESSION_TYPES = new Set(["fraction", "derivative", "integral", "large_operator"]);
const FORMULA_FENCE_OBSERVERS = new WeakMap();

function containsStackedExpression(node) {
  if (!node || typeof node !== "object") return false;
  if (STACKED_EXPRESSION_TYPES.has(node.type)) return true;
  return Object.values(node).some((value) => Array.isArray(value)
    ? value.some(containsStackedExpression)
    : containsStackedExpression(value));
}

function expressionText(node) {
  if (!node || typeof node !== "object") return "";
  if (Object.hasOwn(node, "value")) return String(node.value);
  if (Array.isArray(node.children)) return node.children.map(expressionText).join(" ");
  if (node.type === "fraction") return `(${expressionText(node.numerator)})/(${expressionText(node.denominator)})`;
  if (node.type === "root") return `raiz${node.index ? ` de índice ${expressionText(node.index)}` : " quadrada"} de ${expressionText(node.radicand)}`;
  if (node.type === "superscript") return `${expressionText(node.base)}^${expressionText(node.exponent)}`;
  if (node.type === "subscript") return `${expressionText(node.base)}_${expressionText(node.subscript)}`;
  if (node.type === "subsup") return `${expressionText(node.base)}_${expressionText(node.subscript)}^${expressionText(node.superscript)}`;
  if (node.type === "fenced") return `${node.open}${expressionText(node.content)}${node.close}`;
  if (node.type === "function") return `${node.name}(${node.arguments.map(expressionText).join(", ")})`;
  if (node.type === "integral") return `integral ${node.kind === "double" ? "dupla" : node.kind === "triple" ? "tripla" : node.kind === "contour" ? "de contorno" : node.kind === "surface" ? "de superfície" : node.kind === "volume" ? "de volume" : ""}${expressionLimitsText(node)} de ${expressionText(node.integrand)} em relação a ${expressionText(node.variable)}`;
  if (node.type === "derivative") return `${node.kind === "partial" ? "derivada parcial" : "derivada"} de ${expressionText(node.expression)} em relação a ${node.variables.map(variable => `${expressionText(variable.symbol)}${variable.order > 1 ? `, ordem ${variable.order}` : ""}`).join(" e ")}`;
  if (node.type === "tensor") return `${node.symbol} com índices inferiores ${(node.lowerIndices || []).map(expressionText).join(", ")} e superiores ${(node.upperIndices || []).map(expressionText).join(", ")}`;
  if (node.type === "large_operator") return `${({ sum: "somatório", product: "produtório", limit: "limite" })[node.operator]}${expressionLimitsText(node)} de ${expressionText(node.body)}`;
  return Object.values(node).filter((value) => value && typeof value === "object").map(expressionText).join(" ");
}

function expressionLimitsText(node) {
  return `${node.lower ? `, limite inferior ${expressionText(node.lower)}` : ""}${node.upper ? `, limite superior ${expressionText(node.upper)}` : ""}`;
}

function renderFenced(open, content, close, stacked = false) {
  const anchor = (symbol, side) => `<mo class="package-formula-fence-anchor is-${side}" data-stretch-delimiter="${escapePackageAttribute(symbol)}" fence="true" stretchy="false" symmetric="true">${escapePackageHtml(symbol)}</mo>`;
  return `<mrow class="package-formula-fenced${stacked ? " is-stacked" : ""}">${anchor(open, "open")}<mrow class="package-formula-fenced-content">${content}</mrow>${anchor(close, "close")}</mrow>`;
}

function renderDelimitedList(items) {
  const content = items.map((item, index) => `${index ? "<mo>,</mo>" : ""}${renderMathNode(item)}`).join("");
  return renderFenced("(", content, ")", containsStackedExpression(items));
}

function renderWithLimits(base, lower, upper) {
  if (lower && upper) return `<msubsup>${base}${renderMathNode(lower)}${renderMathNode(upper)}</msubsup>`;
  if (lower) return `<msub>${base}${renderMathNode(lower)}</msub>`;
  if (upper) return `<msup>${base}${renderMathNode(upper)}</msup>`;
  return base;
}

function renderIndexList(items) {
  return `<mrow>${(items || []).map(renderMathNode).join("")}</mrow>`;
}

export function renderMathNode(node) {
  if (["number", "identifier", "operator", "text"].includes(node.type)) {
    const tag = node.type === "number" ? "mn" : node.type === "operator" ? "mo" : node.type === "text" ? "mtext" : "mi";
    return `<${tag}>${escapePackageHtml(node.value)}</${tag}>`;
  }
  if (node.type === "row") return `<mrow>${node.children.map(renderMathNode).join("")}</mrow>`;
  if (node.type === "fraction") return `<mfrac>${renderMathNode(node.numerator)}${renderMathNode(node.denominator)}</mfrac>`;
  if (node.type === "root") return node.index ? `<mroot>${renderMathNode(node.radicand)}${renderMathNode(node.index)}</mroot>` : `<msqrt>${renderMathNode(node.radicand)}</msqrt>`;
  if (node.type === "superscript") return `<msup>${renderMathNode(node.base)}${renderMathNode(node.exponent)}</msup>`;
  if (node.type === "subscript") return `<msub>${renderMathNode(node.base)}${renderMathNode(node.subscript)}</msub>`;
  if (node.type === "subsup") return `<msubsup>${renderMathNode(node.base)}${renderMathNode(node.subscript)}${renderMathNode(node.superscript)}</msubsup>`;
  if (node.type === "fenced") return renderFenced(node.open, renderMathNode(node.content), node.close, containsStackedExpression(node.content));
  if (node.type === "function") return `<mrow><mi>${escapePackageHtml(node.name)}</mi><mo>⁡</mo>${renderDelimitedList(node.arguments)}</mrow>`;
  if (node.type === "integral") {
    const symbols = { single: "∫", double: "∬", triple: "∭", contour: "∮", surface: "∯", volume: "∰" };
    const integral = renderWithLimits(`<mo largeop="true">${symbols[node.kind]}</mo>`, node.lower, node.upper);
    return `<mrow>${integral}<mspace width="0.2em"/>${renderMathNode(node.integrand)}<mspace width="0.22em"/><mi mathvariant="normal">d</mi>${renderMathNode(node.variable)}</mrow>`;
  }
  if (node.type === "derivative") {
    const operator = node.kind === "partial" ? "∂" : "d";
    const order = node.variables.reduce((total, variable) => total + (variable.order || 1), 0);
    const numeratorOperator = order > 1 ? `<msup><mo>${operator}</mo><mn>${order}</mn></msup>` : `<mo>${operator}</mo>`;
    const denominator = node.variables.map((variable) => {
      const factor = `<mrow><mo>${operator}</mo>${renderMathNode(variable.symbol)}</mrow>`;
      return (variable.order || 1) > 1 ? `<msup>${factor}<mn>${variable.order}</mn></msup>` : factor;
    }).join("");
    return `<mfrac><mrow>${numeratorOperator}${renderMathNode(node.expression)}</mrow><mrow>${denominator}</mrow></mfrac>`;
  }
  if (node.type === "tensor") {
    const base = `<mi>${escapePackageHtml(node.symbol)}</mi>`;
    const lower = node.lowerIndices?.length ? renderIndexList(node.lowerIndices) : "";
    const upper = node.upperIndices?.length ? renderIndexList(node.upperIndices) : "";
    if (lower && upper) return `<msubsup>${base}${lower}${upper}</msubsup>`;
    if (lower) return `<msub>${base}${lower}</msub>`;
    return `<msup>${base}${upper}</msup>`;
  }
  if (node.type === "large_operator") {
    const symbols = { sum: "∑", product: "∏", limit: "lim" };
    const tag = node.operator === "limit" ? "mi" : "mo";
    const base = `<${tag}${tag === "mo" ? ' largeop="true"' : ""}>${symbols[node.operator]}</${tag}>`;
    return `<mrow>${renderWithLimits(base, node.lower, node.upper)}<mspace width="0.2em"/>${renderMathNode(node.body)}</mrow>`;
  }
  return `<mtext>${escapePackageHtml(expressionText(node))}</mtext>`;
}

/* ------------------------------------------------------------------------ *
 * Notação TeX/LaTeX: subconjunto seguro convertido para a AST canônica.      *
 * A AST continua sendo a única linguagem interna; o TeX é uma porta autoral. *
 * ------------------------------------------------------------------------ */

const TEX_MAX_LENGTH = 2000;
const TEX_MAX_TEXT_GROUP = 256;
const TEX_FORBIDDEN_MARKUP = /<\/?[A-Za-z][^>]*>/u;

function containsForbiddenControl(value) {
  return [...String(value ?? "")].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 8 || codePoint === 11 || codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) || codePoint === 127;
  });
}

export const TEX_NOTATION_GUIDE = Object.freeze([
  "Escreva matemática em TeX/LaTeX no campo tex; em prosa, use \\(…\\) inline ou \\[…\\] em bloco. O AraLearn interpreta a estrutura e calcula a apresentação.",
  "Aceitos: \\frac{a}{b}, \\sqrt[n]{a}, grupos {…}, \\left…\\right, \\int/\\iint/\\iiint/\\oint/\\oiint/\\oiiint, \\sum, \\prod, \\lim, funções como \\sin, \\cos, \\log, \\ln, \\exp, \\partial, letras gregas e símbolos relacionais comuns.",
  "Use ^ e _ com um token ou grupo: x^2, a_{i}, x_i^2. Integrais exigem diferencial explícito, como \\int_0^1 x^2\\,dx.",
  "\\frac{du}{dx} vira derivada ordinária e \\frac{\\partial u}{\\partial x} vira derivada parcial; fora desses padrões o nó continua sendo fração.",
  "Comandos desconhecidos, ambientes, \\input, \\newcommand, \\href e qualquer HTML ou MathML são recusados com erro explícito."
]);

const TEX_OPERATOR_COMMANDS = Object.freeze({
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡",
  to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔",
  infty: "∞", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", cup: "∪", cap: "∩",
  forall: "∀", exists: "∃", not: "¬", neg: "¬", land: "∧", wedge: "∧", lor: "∨", vee: "∨",
  nabla: "∇", partial: "∂", ldots: "…", dots: "…", cdots: "⋯", circ: "∘", prime: "′"
});

const TEX_LETTER_COMMANDS = Object.freeze({
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ϵ", zeta: "ζ",
  eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", omicron: "ο", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς",
  tau: "τ", upsilon: "υ", phi: "φ", varphi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω", hbar: "ℏ", ell: "ℓ"
});

const TEX_FUNCTION_COMMANDS = Object.freeze({
  sin: "sin", cos: "cos", tan: "tan", cot: "cot", sec: "sec", csc: "csc",
  arcsin: "arcsin", arccos: "arccos", arctan: "arctan",
  log: "log", ln: "ln", exp: "exp", max: "max", min: "min", det: "det", gcd: "gcd"
});

const TEX_INTEGRAL_KINDS = Object.freeze({
  int: "single", iint: "double", iiint: "triple", oint: "contour", oiint: "surface", oiiint: "volume"
});

const TEX_LARGE_OPERATORS = Object.freeze({ sum: "sum", prod: "product", lim: "limit" });
const TEX_SPACING_COMMANDS = new Set([",", ";", ":", "!", "quad", "qquad", " "]);
const TEX_RAW_TEXT_COMMANDS = new Set(["text", "operatorname", "mathrm"]);
const TEX_DELIMITER_COMMANDS = Object.freeze({
  "{": "{", "}": "}", "|": "|", vert: "|", lvert: "|", rvert: "|",
  Vert: "‖", lVert: "‖", rVert: "‖", langle: "⟨", rangle: "⟩", lbrace: "{", rbrace: "}"
});
const TEX_DELIMITER_PAIRS = new Map([["(", ")"], ["[", "]"], ["{", "}"], ["|", "|"], ["‖", "‖"], ["⟨", "⟩"]]);
const TEX_CHAR_OPERATORS = Object.freeze({ "*": "·" });

export class TexNotationError extends Error {
  constructor(message, position = 0) {
    super(`TeX (posição ${position + 1}): ${message}`);
    this.name = "TexNotationError";
    this.position = position;
  }
}

function readTexRawGroup(source, braceIndex, position) {
  let cursor = braceIndex + 1;
  let depth = 1;
  let raw = "";
  while (cursor < source.length) {
    const character = source[cursor];
    if (character === "\\" && source[cursor + 1] === "}") { raw += "}"; cursor += 2; continue; }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (!depth) return { value: raw, next: cursor + 1 };
    }
    raw += character;
    cursor += 1;
  }
  throw new TexNotationError("Feche o grupo {…} de texto.", position);
}

function texTokens(source) {
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const character = source[position];
    const rest = source.slice(position);
    if (/\s/u.test(character)) { position += 1; continue; }
    if (character === "~") { position += 1; continue; }
    if (character === "\\") {
      const command = /^\\[A-Za-z]+/u.exec(rest)?.[0] ?? /^\\[^A-Za-z\s]/u.exec(rest)?.[0];
      if (!command) throw new TexNotationError("Comando TeX incompleto.", position);
      const name = command.slice(1);
      let cursor = position + command.length;
      if (TEX_RAW_TEXT_COMMANDS.has(name)) {
        while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
        if (source[cursor] !== "{") throw new TexNotationError(`\\${name} exige um grupo {...}.`, position);
        const group = readTexRawGroup(source, cursor, position);
        if (/[\\{}]/u.test(group.value)) throw new TexNotationError(`\\${name} aceita texto literal sem comandos aninhados.`, position);
        tokens.push({ kind: "text", value: group.value, position });
        position = group.next;
        continue;
      }
      if (TEX_SPACING_COMMANDS.has(name)) { position = cursor; continue; }
      tokens.push({ kind: "command", name, position });
      position = cursor;
      continue;
    }
    if (character === "{") { tokens.push({ kind: "groupOpen", position }); position += 1; continue; }
    if (character === "}") { tokens.push({ kind: "groupClose", position }); position += 1; continue; }
    if (character === "^") { tokens.push({ kind: "superscript", position }); position += 1; continue; }
    if (character === "_") { tokens.push({ kind: "subscript", position }); position += 1; continue; }
    if (/[0-9]/u.test(character)) {
      const number = /^\d+(?:\.\d+)?/u.exec(rest)[0];
      tokens.push({ kind: "number", value: number, position });
      position += number.length;
      continue;
    }
    if (/\p{L}/u.test(character)) {
      tokens.push({ kind: "letter", value: character, position });
      position += 1;
      continue;
    }
    if (!"+-*=/<>!,;'.|()[]".includes(character) && !Object.values(TEX_OPERATOR_COMMANDS).includes(character)) {
      throw new TexNotationError(`Caractere fora do subconjunto seguro: "${character}".`, position);
    }
    tokens.push({ kind: "operator", value: TEX_CHAR_OPERATORS[character] ?? character, position });
    position += 1;
  }
  return tokens;
}

function texNodeTree(tokens) {
  let index = 0;
  const peek = (offset = 0) => tokens[index + offset];
  const fail = (message, position) => {
    throw new TexNotationError(message, position ?? peek()?.position ?? 0);
  };
  const isOperator = (token, value) => token?.kind === "operator" && token.value === value;
  const isCommand = (token, name) => token?.kind === "command" && token.name === name;

  const single = (children) => children.length === 1 ? children[0] : { type: "row", children };

  function parseSequence(stops = {}) {
    const children = [];
    while (index < tokens.length) {
      const token = peek();
      if (stops.groupClose && token.kind === "groupClose") break;
      if (stops.rightCommand && isCommand(token, "right")) break;
      if (stops.parenClose && isOperator(token, ")")) break;
      if (stops.bracketClose && isOperator(token, "]")) break;
      if (stops.comma && isOperator(token, ",")) break;
      children.push(parseScriptedAtom());
    }
    if (!children.length) fail("Expressão TeX vazia neste ponto.");
    return single(children);
  }

  function parseGroup() {
    const opener = peek();
    index += 1;
    const node = parseSequence({ groupClose: true });
    if (peek()?.kind !== "groupClose") fail("Feche o grupo {…} iniciado antes.", opener.position);
    index += 1;
    return node;
  }

  function parseRequiredGroup(label, position) {
    if (peek()?.kind !== "groupOpen") fail(`\\${label} exige um grupo {...}.`, position);
    return parseGroup();
  }

  function parseScriptArgument(position) {
    if (peek()?.kind === "groupOpen") return parseGroup();
    if (!peek()) fail("Complete o expoente ou índice.", position);
    const token = peek();
    if (token.kind === "letter") { index += 1; return { type: "identifier", value: token.value }; }
    if (token.kind === "number" && token.value.length > 1) {
      tokens[index] = { ...token, value: token.value.slice(1), position: token.position + 1 };
      return { type: "number", value: token.value[0] };
    }
    return parseBaseAtom();
  }

  function parseScriptedAtom() {
    const base = parseBaseAtom();
    let superscript = null;
    let subscript = null;
    while (true) {
      const token = peek();
      if (token?.kind === "superscript") {
        if (superscript) fail("Expoente repetido; agrupe a expressão com {...}.", token.position);
        index += 1; superscript = parseScriptArgument(token.position); continue;
      }
      if (token?.kind === "subscript") {
        if (subscript) fail("Índice repetido; agrupe a expressão com {...}.", token.position);
        index += 1; subscript = parseScriptArgument(token.position); continue;
      }
      break;
    }
    if (superscript && subscript) return { type: "subsup", base, subscript, superscript };
    if (superscript) return { type: "superscript", base, exponent: superscript };
    if (subscript) return { type: "subscript", base, subscript };
    return base;
  }

  function parseOptionalLimits() {
    let lower = null;
    let upper = null;
    while (true) {
      const token = peek();
      if (token?.kind === "subscript" && !lower) { index += 1; lower = parseScriptArgument(token.position); continue; }
      if (token?.kind === "superscript" && !upper) { index += 1; upper = parseScriptArgument(token.position); continue; }
      break;
    }
    return { lower, upper };
  }

  function parseArguments(position) {
    const groups = [];
    let current = [];
    while (true) {
      const token = peek();
      if (!token) fail("Feche os parênteses da função.", position);
      if (isOperator(token, ")")) { index += 1; break; }
      if (isOperator(token, ",")) { index += 1; groups.push(single(current)); current = []; continue; }
      current.push(parseScriptedAtom());
    }
    groups.push(single(current));
    if (groups.some((group) => !group || group.type === "row" && !group.children.length)) {
      fail("Função exige um argumento em cada posição.", position);
    }
    return groups;
  }

  function readDelimiter(position) {
    const token = peek();
    if (!token) fail("\\left e \\right exigem delimitador.", position);
    if (token.kind === "operator" && ["(", ")", "[", "]", "|"].includes(token.value)) {
      index += 1;
      return token.value;
    }
    if (token.kind === "command" && Object.hasOwn(TEX_DELIMITER_COMMANDS, token.name)) {
      index += 1;
      return TEX_DELIMITER_COMMANDS[token.name];
    }
    fail("Delimitador TeX não aceito.", token.position);
  }

  function parseFenced(position) {
    const open = readDelimiter(position);
    const content = parseSequence({ rightCommand: true });
    if (!isCommand(peek(), "right")) fail("\\left exige \\right correspondente.", position);
    index += 1;
    const close = readDelimiter(position);
    if (TEX_DELIMITER_PAIRS.get(open) !== close) {
      fail(`Par de delimitadores TeX inválido: ${open} … ${close}.`, position);
    }
    return { type: "fenced", open, close, content };
  }

  function integralVariable(position) {
    if (!(peek()?.kind === "letter" && peek().value === "d")) {
      fail("Integral exige diferencial explícito, como \\int x\\,dx.", position);
    }
    index += 1;
    const variable = parseBaseAtom();
    if (variable.type !== "identifier") fail("O diferencial da integral precisa de uma variável simples.", position);
    return variable;
  }

  function parseIntegral(name, position) {
    const limits = parseOptionalLimits();
    const integrand = [];
    while (index < tokens.length) {
      const token = peek();
      if (token.kind === "groupClose" || isCommand(token, "right") || isOperator(token, ")") || isOperator(token, "]")) break;
      if (token.kind === "letter" && token.value === "d" && integrand.length &&
          peek(1) && !isOperator(peek(1), ",")) break;
      integrand.push(parseScriptedAtom());
    }
    if (!integrand.length) fail("Integral exige integrando antes do diferencial.", position);
    const variable = integralVariable(position);
    return {
      type: "integral", kind: TEX_INTEGRAL_KINDS[name],
      integrand: single(integrand), variable,
      ...(limits.lower ? { lower: limits.lower } : {}),
      ...(limits.upper ? { upper: limits.upper } : {})
    };
  }

  function parseDerivativeFromFraction(numerator, denominator) {
    const head = (node) => {
      if (!node || node.type === "row" && !node.children.length) return null;
      const parts = node.type === "row" ? node.children : [node];
      const [first, ...rest] = parts;
      const symbol = first.type === "operator" ? first.value
        : first.type === "identifier" ? first.value : "";
      if (!["∂", "d"].includes(symbol)) return null;
      let order = 1;
      if (rest[0]?.type === "superscript" && rest[0].base?.type === "identifier" && rest[0].base.value === symbol) {
        const exponent = Number(rest.shift().exponent?.value);
        if (!Number.isInteger(exponent) || exponent < 1 || exponent > 9) return null;
        order = exponent;
      }
      return { symbol, order, rest };
    };
    const numeratorHead = head(numerator);
    const denominatorHead = head(denominator);
    if (!numeratorHead || !denominatorHead || !numeratorHead.rest.length || !denominatorHead.rest.length) return null;
    if (numeratorHead.symbol !== denominatorHead.symbol) return null;
    const variableParts = denominatorHead.rest.slice();
    let order = denominatorHead.order;
    const tail = variableParts.at(-1);
    if (tail?.type === "superscript" && tail.base?.type === "identifier") {
      const exponent = Number(tail.exponent?.value);
      if (!Number.isInteger(exponent) || exponent < 1 || exponent > 9) return null;
      variableParts[variableParts.length - 1] = tail.base;
      order = exponent;
    }
    if (order !== numeratorHead.order) return null;
    return {
      type: "derivative",
      kind: numeratorHead.symbol === "∂" ? "partial" : "ordinary",
      expression: single(numeratorHead.rest),
      variables: [{ symbol: single(variableParts), ...(order > 1 ? { order } : {}) }]
    };
  }

  function parseCommand(token) {
    const { name, position } = token;
    index += 1;
    if (name === "frac") {
      const numerator = parseRequiredGroup("frac", position);
      const denominator = parseRequiredGroup("frac", position);
      return parseDerivativeFromFraction(numerator, denominator)
        ?? { type: "fraction", numerator, denominator };
    }
    if (name === "sqrt") {
      let rootIndex = null;
      if (isOperator(peek(), "[")) {
        index += 1;
        rootIndex = parseSequence({ bracketClose: true });
        if (!isOperator(peek(), "]")) fail("\\sqrt[...] exige o índice entre colchetes fechados.", position);
        index += 1;
      }
      const radicand = parseRequiredGroup("sqrt", position);
      return rootIndex ? { type: "root", radicand, index: rootIndex } : { type: "root", radicand };
    }
    if (name === "left") return parseFenced(position);
    if (Object.hasOwn(TEX_INTEGRAL_KINDS, name)) return parseIntegral(name, position);
    if (Object.hasOwn(TEX_LARGE_OPERATORS, name)) {
      const limits = parseOptionalLimits();
      const body = parseScriptedAtom();
      return {
        type: "large_operator", operator: TEX_LARGE_OPERATORS[name], body,
        ...(limits.lower ? { lower: limits.lower } : {}),
        ...(limits.upper ? { upper: limits.upper } : {})
      };
    }
    if (Object.hasOwn(TEX_FUNCTION_COMMANDS, name)) {
      const label = TEX_FUNCTION_COMMANDS[name];
      if (isOperator(peek(), "(")) {
        index += 1;
        return { type: "function", name: label, arguments: parseArguments(position) };
      }
      return { type: "identifier", value: label };
    }
    if (Object.hasOwn(TEX_OPERATOR_COMMANDS, name)) return { type: "operator", value: TEX_OPERATOR_COMMANDS[name] };
    if (Object.hasOwn(TEX_LETTER_COMMANDS, name)) return { type: "identifier", value: TEX_LETTER_COMMANDS[name] };
    fail(`Comando TeX fora do subconjunto seguro: \\${name}.`, position);
  }

  function parseBaseAtom() {
    const token = peek();
    if (!token) fail("Complete a expressão TeX.");
    if (token.kind === "groupOpen") return parseGroup();
    if (token.kind === "number") { index += 1; return { type: "number", value: token.value }; }
    if (token.kind === "text") {
      index += 1;
      if (!token.value.trim()) fail("\\text exige conteúdo não vazio.", token.position);
      if (token.value.length > TEX_MAX_TEXT_GROUP) fail("\\text aceita no máximo 256 caracteres.", token.position);
      if (TEX_FORBIDDEN_MARKUP.test(token.value)) fail("\\text não aceita marcação HTML ou MathML.", token.position);
      return { type: "text", value: token.value };
    }
    if (token.kind === "letter") {
      index += 1;
      if (isOperator(peek(), "(")) {
        index += 1;
        return { type: "function", name: token.value, arguments: parseArguments(token.position) };
      }
      return { type: "identifier", value: token.value };
    }
    if (token.kind === "operator") {
      if (isOperator(token, "(")) {
        index += 1;
        const content = parseSequence({ parenClose: true });
        if (!isOperator(peek(), ")")) fail("Feche os parênteses da expressão.", token.position);
        index += 1;
        return { type: "fenced", open: "(", close: ")", content };
      }
      if (isOperator(token, "[")) {
        index += 1;
        const content = parseSequence({ bracketClose: true });
        if (!isOperator(peek(), "]")) fail("Feche os colchetes da expressão.", token.position);
        index += 1;
        return { type: "fenced", open: "[", close: "]", content };
      }
      if (isOperator(token, ")") || isOperator(token, "]")) fail("Delimitador de fechamento sem abertura.", token.position);
      index += 1;
      return { type: "operator", value: token.value };
    }
    if (token.kind === "command") return parseCommand(token);
    fail("Notação TeX não reconhecida.", token.position);
  }

  const expression = parseSequence();
  if (index !== tokens.length) fail("Sobrou notação TeX que não pôde ser interpretada.", peek().position);
  return expression;
}

/** Converte o subconjunto seguro de TeX/LaTeX na AST canônica de fórmula. */
export function parseTexNotation(source) {
  if (typeof source !== "string" || !source.trim()) {
    throw new TexNotationError("A notação exige texto não vazio.");
  }
  if (source.length > TEX_MAX_LENGTH) {
    throw new TexNotationError(`A notação aceita no máximo ${TEX_MAX_LENGTH} caracteres.`);
  }
  if (containsForbiddenControl(source)) {
    throw new TexNotationError("A notação contém caractere de controle proibido.");
  }
  if (TEX_FORBIDDEN_MARKUP.test(source)) {
    throw new TexNotationError("A notação não pode conter marcação HTML ou MathML.");
  }
  let depth = 0;
  const tokens = texTokens(source);
  for (const token of tokens) {
    if (token.kind === "groupOpen" && ++depth > 48) throw new TexNotationError("Notação aninhada além de 48 níveis.", token.position);
    if (token.kind === "groupClose") depth -= 1;
  }
  const expression = texNodeTree(tokens);
  const validated = validateFormulaExpression(expression);
  if (!validated.ok) throw new TexNotationError(validated.errors.map(error => error.message).join(" "));
  return expression;
}

/** Valida TeX sem lançar: devolve erros e a AST equivalente quando possível. */
export function validateTexNotation(source, path = "$.tex") {
  let expression;
  try {
    expression = parseTexNotation(source);
  } catch (error) {
    return {
      ok: false,
      errors: [{ path, message: error instanceof TexNotationError ? error.message : "Notação TeX inválida." }]
    };
  }
  const result = validateFormulaExpression(expression, path);
  return result.ok ? result : { ok: false, errors: result.errors };
}

/** Resolve a expressão de um nó de matemática que aceite AST ou TeX. */
export function resolveFormulaExpression(value) {
  if (value && typeof value === "object" && typeof value.tex === "string") {
    try { return parseTexNotation(value.tex); } catch { return null; }
  }
  return value?.expression ?? null;
}

export function formulaAccessibleText(expression) {
  return expressionText(expression);
}

/** Delimitadores explícitos evitam interpretar valores monetários como fórmulas. */
export function splitTexDelimitedText(text) {
  const source = String(text ?? "");
  const segments = [];
  let buffer = "";
  let position = 0;
  let code = false;
  while (position < source.length) {
    const character = source[position];
    if (character === "`") code = !code;
    if (!code && character === "\\" && ["(", "["].includes(source[position + 1])) {
      const block = source[position + 1] === "[";
      const delimiter = block ? "\\]" : "\\)";
      const closeAt = source.indexOf(delimiter, position + 2);
      if (closeAt < 0) {
        segments.push({ kind: "text", value: buffer + source.slice(position) });
        return { segments, balanced: false, position };
      }
      if (buffer) { segments.push({ kind: "text", value: buffer }); buffer = ""; }
      segments.push({
        kind: "math",
        value: source.slice(position + 2, closeAt),
        display: block ? "block" : "inline",
        position
      });
      position = closeAt + delimiter.length;
      continue;
    }
    buffer += character;
    position += 1;
  }
  if (buffer) segments.push({ kind: "text", value: buffer });
  return { segments, balanced: true, position: null };
}

/** A prosa carrega notação TeX delimitada? */
export function hasDelimitedTexNotation(text) {
  const source = String(text ?? "");
  return source.includes("\\(") || source.includes("\\[");
}

const LITERAL_MARKER = String.fromCharCode(96);

/** Crase é apresentação do literal, não conteúdo: o marcador sai e o trecho fica íntegro. */
export function stripLiteralMarkers(value) {
  const source = String(value ?? "");
  return source.includes(LITERAL_MARKER) ? source.split(LITERAL_MARKER).join("") : source;
}

/**
 * Projeção textual de prosa com TeX delimitado. O trecho matemático vira a mesma
 * verbalização que o aria-label do MathML já usa; crases protegem o literal da
 * interpretação e o texto sem delimitação permanece idêntico ao original.
 */
export function accessibleDelimitedTexText(text) {
  const source = String(text ?? "");
  if (!hasDelimitedTexNotation(source)) return source;
  const { segments } = splitTexDelimitedText(source);
  if (!segments.some((segment) => segment.kind === "math")) return stripLiteralMarkers(source);
  return stripLiteralMarkers(segments.map((segment) => {
    if (segment.kind === "text") return segment.value;
    const open = segment.display === "block" ? "\\[" : "\\(";
    const close = segment.display === "block" ? "\\]" : "\\)";
    try {
      const spoken = formulaAccessibleText(parseTexNotation(segment.value)).replace(/\s+/gu, " ").trim();
      return spoken || open + segment.value + close;
    } catch {
      // Mascaramento pode inserir placeholder dentro da fórmula. Nada é silenciado: a
      // notação delimitada volta íntegra em vez de virar projeção parcial.
      return open + segment.value + close;
    }
  }).join(""));
}

export function validateTexDelimitedText(text, path = "$") {
  const { segments, balanced } = splitTexDelimitedText(text);
  if (!balanced) return [`${path}: fórmula TeX sem fechamento; use \\(…\\) ou \\[…\\].`];
  return segments.filter((segment) => segment.kind === "math").flatMap((segment) => {
    if (!segment.value.trim()) return [`${path}: fórmula TeX vazia.`];
    const result = validateTexNotation(segment.value, path);
    return result.ok ? [] : result.errors.map((error) => `${error.path}: ${error.message}`);
  });
}

/**
 * Renderiza prosa com TeX explicitamente delimitado.
 * O motor AST continua sendo o único responsável pela notação.
 */
export function renderTexDelimitedText(text, renderTextSegment, options = {}) {
  const className = options.className || "package-rich-tex";
  const { segments } = splitTexDelimitedText(text);
  return segments.map((segment) => {
    if (segment.kind === "text") return renderTextSegment(segment.value);
    const expression = parseTexNotation(segment.value);
    const display = segment.display === "block" ? "block" : "inline";
    return `<span class="${className} is-${display}" dir="ltr">` +
      `<math display="${display}" aria-label="${escapePackageAttribute(formulaAccessibleText(expression))}">` +
      `${renderMathNode(expression)}</math></span>`;
  }).join("");
}

export function hydrateMathExpression(figure) {
    if (!figure) return;
    FORMULA_FENCE_OBSERVERS.get(figure)?.disconnect();
    figure.querySelectorAll(":scope > .package-formula-fence").forEach((delimiter) => delimiter.remove());
    const alignments = [];
    for (const fenced of figure.querySelectorAll(".package-formula-fenced")) {
      const content = fenced.querySelector(":scope > .package-formula-fenced-content");
      if (!content) continue;
      for (const anchor of fenced.querySelectorAll(":scope > .package-formula-fence-anchor")) {
        const template = anchor.ownerDocument.createElement("template");
        const side = anchor.classList.contains("is-open") ? "open" : "close";
        template.innerHTML = renderStretchDelimiter(anchor.dataset.stretchDelimiter, `package-formula-fence is-${side}`);
        const delimiter = template.content.firstElementChild;
        figure.append(delimiter);
        alignments.push({ anchor, content, delimiter });
      }
    }
    const align = () => {
      const figureRect = figure.getBoundingClientRect();
      const scrollLeft = figure.scrollLeft;
      for (const { anchor, content, delimiter } of alignments) {
        const anchorRect = anchor.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const width = Number.parseFloat(getComputedStyle(figure).fontSize) * 0.5;
        const height = Math.max(contentRect.height, anchorRect.height);
        delimiter.style.left = `${anchorRect.left - figureRect.left - figure.clientLeft + scrollLeft + (anchorRect.width - width) / 2}px`;
        delimiter.style.top = `${contentRect.top - figureRect.top - figure.clientTop + (contentRect.height - height) / 2}px`;
        delimiter.style.width = `${width}px`;
        delimiter.style.height = `${height}px`;
      }
    };
    align();
    if (typeof globalThis.ResizeObserver === "function") {
      const observer = new globalThis.ResizeObserver(align);
      observer.observe(figure);
      alignments.forEach(({ content }) => observer.observe(content));
      FORMULA_FENCE_OBSERVERS.set(figure, observer);
    }
}
