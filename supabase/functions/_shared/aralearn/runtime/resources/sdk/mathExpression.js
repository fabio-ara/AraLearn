import { escapePackageAttribute, escapePackageHtml } from "./html.js";
import { renderStretchDelimiter } from "./stretchDelimiter.js";

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
