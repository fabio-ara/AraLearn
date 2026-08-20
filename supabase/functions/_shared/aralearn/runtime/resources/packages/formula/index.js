import { FORMULA_EXPRESSION_INPUT_SCHEMA, isFormulaNotation, validateFormulaExpression } from "../../../domain/formulaExpression.js";
import { escapePackageAttribute, escapePackageHtml, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import { renderStretchDelimiter } from "../../sdk/stretchDelimiter.js";

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
  if (node.type === "root") return `raiz de ${expressionText(node.radicand)}`;
  if (node.type === "superscript") return `${expressionText(node.base)}^${expressionText(node.exponent)}`;
  if (node.type === "subscript") return `${expressionText(node.base)}_${expressionText(node.subscript)}`;
  if (node.type === "subsup") return `${expressionText(node.base)}_${expressionText(node.subscript)}^${expressionText(node.superscript)}`;
  if (node.type === "fenced") return `${node.open}${expressionText(node.content)}${node.close}`;
  if (node.type === "function") return `${node.name}(${node.arguments.map(expressionText).join(", ")})`;
  if (node.type === "integral") return `integral de ${expressionText(node.integrand)} em relação a ${expressionText(node.variable)}`;
  if (node.type === "derivative") return `${node.kind === "partial" ? "derivada parcial" : "derivada"} de ${expressionText(node.expression)}`;
  if (node.type === "tensor") return `${node.symbol} com índices inferiores ${(node.lowerIndices || []).map(expressionText).join(", ")} e superiores ${(node.upperIndices || []).map(expressionText).join(", ")}`;
  if (node.type === "large_operator") return `${node.operator} de ${expressionText(node.body)}`;
  return Object.values(node).filter((value) => value && typeof value === "object").map(expressionText).join(" ");
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

function renderMathNode(node) {
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

const FORMULA_EXAMPLE = Object.freeze({
  prompt: "Em teoria de campos, uma ação pode ser definida por uma integral sobre uma região. Leia a expressão e identifique a integral, a derivada parcial, a contração entre índices tensoriais e a função aplicada.",
  notation: "mathematics",
  accessibleText: "A ação S de u é a integral sobre ômega de um meio vezes a derivada parcial da componente u índice i em relação à coordenada x índice j, contraída com o tensor T índices superiores i e j, mais f de u, em relação ao volume V.",
  expression: {
    type: "row",
    children: [
      { type: "function", name: "S", arguments: [{ type: "identifier", value: "u" }] },
      { type: "operator", value: "=" },
      {
        type: "integral", kind: "single", lower: { type: "identifier", value: "Ω" },
        variable: { type: "identifier", value: "V" },
        integrand: {
          type: "fenced", open: "[", close: "]", content: {
            type: "row", children: [
              { type: "fraction", numerator: { type: "number", value: "1" }, denominator: { type: "number", value: "2" } },
              { type: "operator", value: "·" },
              {
                type: "derivative", kind: "partial",
                expression: { type: "tensor", symbol: "u", lowerIndices: [{ type: "identifier", value: "i" }] },
                variables: [{ symbol: { type: "tensor", symbol: "x", lowerIndices: [{ type: "identifier", value: "j" }] } }]
              },
              { type: "operator", value: "·" },
              { type: "tensor", symbol: "T", upperIndices: [{ type: "identifier", value: "i" }, { type: "identifier", value: "j" }] },
              { type: "operator", value: "+" },
              { type: "function", name: "f", arguments: [{ type: "identifier", value: "u" }] }
            ]
          }
        }
      }
    ]
  }
});

export const formulaPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.formula", version: "1.0.0", label: "Fórmula", purpose: "Representar expressão matemática ou química estruturada com leitura acessível explícita.", slots: Object.freeze(["content", "feedback"]), taskOperations: Object.freeze(["read-formula", "transform-expression", "identify-operator", "calculate"]), academic: academicProfile({ domains: ["matemática", "estatística", "física", "química", "computação"], knowledgeObjects: ["expressão simbólica", "equação", "identidade"], conventions: ["estrutura bidimensional preservada", "símbolos conforme a área", "leitura acessível equivalente"], appropriateWhen: ["a forma simbólica participa do raciocínio"], avoidWhen: ["uma frase é mais clara que a notação"], technologies: ["MathML"], practiceModes: ["exposition", "gap", "typing", "selection"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["accessibleText não pode apenas repetir símbolos incompreensíveis." ]), accessibility: "A expressão sempre exige descrição textual equivalente." }),
  authoringContract: Object.freeze({ intent: "Declare uma AST semântica, a notação e uma leitura acessível equivalentes; o renderer produz os símbolos e o MathML.", required: Object.freeze(["notation", "accessibleText", "expression"]), optional: Object.freeze(["prompt"]), rules: Object.freeze(["Use os nós semânticos integral, derivative, tensor, function e large_operator antes de montar esses objetos com tokens soltos.", "Um token contém somente um número, identificador, operador ou trecho textual curto; nunca envie LaTeX, HTML ou MathML.", "Use prompt ou um package paragraph separado para explicações longas; text dentro da AST serve apenas para conectar notação e frase matemática curta.", "A descrição acessível acompanha a AST e verbaliza operadores, limites, variáveis e índices.", "Não digite símbolos de layout manualmente: frações, raízes, índices, cercas, integrais e derivadas pertencem aos respectivos nós."]), example: FORMULA_EXAMPLE }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["notation", "accessibleText", "expression"], properties: { prompt: { type: "string" }, notation: { type: "string", enum: ["mathematics", "chemistry"] }, accessibleText: { type: "string", minLength: 1 }, expression: FORMULA_EXPRESSION_INPUT_SCHEMA } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), notation: String(data?.notation || "mathematics"), accessibleText: String(data?.accessibleText || "").trim(), expression: structuredClone(data?.expression) }; },
  validate(data) { const errors = []; if (!isFormulaNotation(data.notation)) errors.push("Notação inválida."); const result = validateFormulaExpression(data.expression); if (!result.ok) errors.push(...result.errors.map((error) => `${error.path}: ${error.message}`)); return errors; },
  render(data) { return `<div class="runtime-block runtime-formula-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure class="package-formula"><math display="block" aria-label="${escapePackageAttribute(data.accessibleText)}">${renderMathNode(data.expression)}</math><figcaption class="visually-hidden">${escapePackageHtml(data.accessibleText)}</figcaption></figure></div>`; },
  hydrate(instanceRoot) {
    const figure = instanceRoot.querySelector(".package-formula");
    if (!figure) return;
    FORMULA_FENCE_OBSERVERS.get(figure)?.disconnect();
    figure.querySelectorAll(":scope > .package-formula-fence").forEach((delimiter) => delimiter.remove());
    const alignments = [];
    for (const fenced of instanceRoot.querySelectorAll(".package-formula-fenced")) {
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
  },
  accessibleText(data) { return data.accessibleText; }, editableTargets(data) { return data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []; },
  practiceTargets() { return []; }
});
