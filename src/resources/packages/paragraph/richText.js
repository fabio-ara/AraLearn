import { FORMULA_EXPRESSION_INPUT_SCHEMA, validateFormulaExpression } from "../../../domain/formulaExpression.js";
import { escapePackageAttribute, packageReferenceText, packageTextAttributes, renderPackageInline } from "../../sdk/html.js";
import { hydrateMathExpression, renderMathNode } from "../../sdk/mathExpression.js";

export const PARAGRAPH_LANGUAGE_PROPERTIES = Object.freeze({
  languageTag: { type: "string", minLength: 2, maxLength: 63 },
  textDirection: { type: "string", enum: ["auto", "ltr", "rtl"] }
});

const textSchema = { type: "string", minLength: 1, maxLength: 12000 };
const mathProperties = {
  kind: { const: "math" },
  notation: { type: "string", enum: ["mathematics", "chemistry"] },
  accessibleText: { type: "string", minLength: 1, maxLength: 3000 },
  expression: FORMULA_EXPRESSION_INPUT_SCHEMA
};
const mathSchema = {
  type: "object", additionalProperties: false,
  required: ["kind", "notation", "accessibleText", "expression"], properties: mathProperties
};
const inlineSchema = {
  oneOf: [
    {
      type: "object", additionalProperties: false, required: ["kind", "text"],
      properties: { kind: { const: "text" }, text: textSchema, ...PARAGRAPH_LANGUAGE_PROPERTIES }
    },
    { $ref: "#/$defs/math" },
    {
      type: "object", additionalProperties: false, required: ["kind", "base", "reading"],
      properties: { kind: { const: "ruby" }, base: textSchema, reading: textSchema, ...PARAGRAPH_LANGUAGE_PROPERTIES }
    }
  ]
};

export const RICH_PARAGRAPH_SCHEMA = Object.freeze({
  $id: "urn:aralearn:schema:rich-paragraph:v1",
  $defs: { math: mathSchema },
  type: "object", additionalProperties: false, required: ["format", "blocks"],
  properties: {
    format: { const: "rich" },
    ...PARAGRAPH_LANGUAGE_PROPERTIES,
    blocks: {
      type: "array", minItems: 1, maxItems: 128,
      items: { oneOf: [
        { $ref: "#/$defs/math" },
        {
          type: "object", additionalProperties: false, required: ["kind", "inlines"],
          properties: {
            kind: { const: "paragraph" }, ...PARAGRAPH_LANGUAGE_PROPERTIES,
            inlines: { type: "array", minItems: 1, maxItems: 128, items: inlineSchema }
          }
        }
      ] }
    }
  }
});

function nodes(data) {
  return data.blocks.flatMap((block) => block.kind === "paragraph" ? [block, ...block.inlines] : [block]);
}

export function richParagraphTextTargets(data) {
  return data.blocks.flatMap((block, blockIndex) => block.kind === "paragraph"
    ? block.inlines.flatMap((inline, index) => {
      const path = `blocks[${blockIndex}].inlines[${index}]`;
      const label = `trecho ${index + 1} do parágrafo ${blockIndex + 1}`;
      if (inline.kind === "text") return [{ path: `${path}.text`, label: `Editar ${label}`, preserveMarkup: true }];
      if (inline.kind === "ruby") return [
        { path: `${path}.base`, label: `Editar escrita do ${label}` },
        { path: `${path}.reading`, label: `Editar leitura do ${label}` }
      ];
      return [];
    }) : []);
}

export function validateRichParagraph(data, validateProse) {
  const errors = [];
  let textLength = 0;
  let formulaNodes = 0;
  const countFormulaNodes = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.type === "string") formulaNodes += 1;
    Object.values(value).forEach((child) => Array.isArray(child)
      ? child.forEach(countFormulaNodes) : countFormulaNodes(child));
  };
  for (const node of [data, ...nodes(data)]) {
    if (node.languageTag) {
      try { Intl.getCanonicalLocales(node.languageTag); }
      catch { errors.push("Idioma precisa ser uma identificação BCP 47 válida, como pt-BR, zh-Hans ou ar."); }
    }
    if (node.kind === "math") {
      const result = validateFormulaExpression(node.expression);
      errors.push(...result.errors.map((error) => `${error.path}: ${error.message}`));
      if (result.ok) countFormulaNodes(node.expression);
      textLength += node.accessibleText.length;
      if (!node.accessibleText.trim()) errors.push("A matemática exige uma leitura acessível equivalente.");
    } else if (node.kind === "text") {
      textLength += node.text.length;
      errors.push(...validateProse(node.text));
    } else if (node.kind === "ruby") {
      textLength += node.base.length + node.reading.length;
      if (!node.base.trim() || !node.reading.trim()) errors.push("Ruby exige escrita e leitura não vazias.");
    }
  }
  if (textLength > 12000) errors.push("Texto e leituras do parágrafo excedem 12000 caracteres; distribua a explicação em mais componentes.");
  if (formulaNodes > 512) errors.push("As expressões do parágrafo excedem 512 nós; distribua a notação em mais componentes.");
  return errors;
}

function renderMath(node, display) {
  const tag = display === "block" ? "figure" : "span";
  return `<${tag} class="package-rich-math is-${display}" dir="ltr">` +
    `<math display="${display}" aria-label="${escapePackageAttribute(node.accessibleText)}">` +
    `${renderMathNode(node.expression)}</math></${tag}>`;
}

function inheritedTextAttributes(node) {
  return node.textDirection ? packageTextAttributes(node)
    : packageTextAttributes(node).replace(' dir="auto"', "");
}

function renderInline(node) {
  if (node.kind === "math") return renderMath(node, "inline");
  if (node.kind === "ruby") {
    const reading = `${packageReferenceText(node.base)} (${packageReferenceText(node.reading)})`;
    return `<ruby role="group" aria-label="${escapePackageAttribute(reading)}"${inheritedTextAttributes(node)}>${renderPackageInline(node.base)}` +
      `<rp>(</rp><rt>${renderPackageInline(node.reading)}</rt><rp>)</rp></ruby>`;
  }
  return `<span${inheritedTextAttributes(node)}>${renderPackageInline(node.text)}</span>`;
}

export function renderRichParagraph(data) {
  return `<div class="package-rich-paragraph"${packageTextAttributes(data)}>` + data.blocks.map((block) =>
    block.kind === "math" ? renderMath(block, "block")
      : `<p class="runtime-markdown-paragraph"${inheritedTextAttributes(block)}>${block.inlines.map(renderInline).join("")}</p>`
  ).join("") + "</div>";
}

export function hydrateRichParagraph(root) {
  root.querySelectorAll(".package-rich-math").forEach(hydrateMathExpression);
}

export function accessibleRichParagraph(data) {
  const inlineText = (node) => node.kind === "math" ? node.accessibleText
    : node.kind === "ruby" ? `${node.base} (${node.reading})` : node.text.replace(/`/g, "");
  return data.blocks.map((block) => block.kind === "math" ? block.accessibleText
    : block.inlines.map(inlineText).join("")).join("\n\n");
}
