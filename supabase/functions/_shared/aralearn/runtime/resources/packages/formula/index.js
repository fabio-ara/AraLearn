import { FORMULA_EXPRESSION_INPUT_SCHEMA, isFormulaNotation, validateFormulaExpression } from "../../../domain/formulaExpression.js";
import { escapePackageAttribute, escapePackageHtml, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

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
  return Object.values(node).filter((value) => value && typeof value === "object").map(expressionText).join(" ");
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
  if (node.type === "fenced") return `<mrow><mo fence="true">${escapePackageHtml(node.open)}</mo>${renderMathNode(node.content)}<mo fence="true">${escapePackageHtml(node.close)}</mo></mrow>`;
  return `<mtext>${escapePackageHtml(expressionText(node))}</mtext>`;
}

export const formulaPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.formula", version: "1.0.0", label: "Fórmula", purpose: "Representar expressão matemática ou química estruturada com leitura acessível explícita.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["read-formula", "transform-expression", "identify-operator", "calculate"]), academic: academicProfile({ domains: ["matemática", "estatística", "física", "química", "computação"], knowledgeObjects: ["expressão simbólica", "equação", "identidade"], conventions: ["estrutura bidimensional preservada", "símbolos conforme a área", "leitura acessível equivalente"], appropriateWhen: ["a forma simbólica participa do raciocínio"], avoidWhen: ["uma frase é mais clara que a notação"], technologies: ["MathML"], practiceModes: ["exposition", "gap", "typing", "selection"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["accessibleText não pode apenas repetir símbolos incompreensíveis." ]), accessibility: "A expressão sempre exige descrição textual equivalente." }),
  authoringContract: Object.freeze({ intent: "Declare AST, notação e leitura acessível equivalentes.", required: Object.freeze(["notation", "accessibleText", "expression"]), optional: Object.freeze(["prompt"]), rules: Object.freeze(["A ordem da descrição acompanha a AST."]), example: Object.freeze({ prompt: "Observe a potência.", notation: "mathematics", accessibleText: "x ao quadrado", expression: { type: "superscript", base: { type: "identifier", value: "x" }, exponent: { type: "number", value: "2" } } }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["notation", "accessibleText", "expression"], properties: { prompt: { type: "string" }, notation: { type: "string", enum: ["mathematics", "chemistry"] }, accessibleText: { type: "string", minLength: 1 }, expression: FORMULA_EXPRESSION_INPUT_SCHEMA } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), notation: String(data?.notation || "mathematics"), accessibleText: String(data?.accessibleText || "").trim(), expression: structuredClone(data?.expression) }; },
  validate(data) { const errors = []; if (!isFormulaNotation(data.notation)) errors.push("Notação inválida."); const result = validateFormulaExpression(data.expression); if (!result.ok) errors.push(...result.errors.map((error) => `${error.path}: ${error.message}`)); return errors; },
  render(data) { return `<div class="runtime-block runtime-formula-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure class="package-formula"><math display="block" aria-label="${escapePackageAttribute(data.accessibleText)}">${renderMathNode(data.expression)}</math><figcaption class="visually-hidden">${escapePackageHtml(data.accessibleText)}</figcaption></figure></div>`; },
  accessibleText(data) { return data.accessibleText; }, editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), { path: "accessibleText", label: "Editar descrição acessível" }]; }
});
