export function wideExpression(nodeCount = 512) {
  const expression = { type: "row", children: [] };
  let remaining = nodeCount - 1;
  while (remaining > 0) {
    if (remaining === 1) { expression.children.push({ type: "identifier", value: "x" }); break; }
    const leafCount = Math.min(64, remaining - 1);
    expression.children.push({ type: "row", children: Array.from({ length: leafCount }, (_, index) => ({ type: index % 2 ? "operator" : "identifier", value: index % 2 ? "+" : "x" })) });
    remaining -= leafCount + 1;
  }
  return expression;
}

export function tallExpression(depth = 22) {
  let expression = { type: "fraction", numerator: { type: "number", value: "1" }, denominator: { type: "identifier", value: "x" } };
  for (let index = 0; index < depth; index += 1) expression = {
    type: "root", radicand: expression
  };
  return { type: "fenced", open: "(", close: ")", content: expression };
}

export const mathBlock = (expression, label = "Expressão sintética extensa.") => ({ kind: "math", notation: "mathematics", accessibleText: label, expression });
export const richData = (blocks) => ({ format: "rich", languageTag: "pt-BR", textDirection: "ltr", blocks });
export const paragraphInstance = (id, data) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data });
export function largeRichStudyUnit() {
  return { id: "large-rich-synthetic", position: 1, title: "Limites de notação", role: "theory", response: null, feedback: [], topics: [], content: [
    paragraphInstance("wide-inline", richData([{ kind: "paragraph", inlines: [{ kind: "text", text: "Antes: " }, mathBlock(wideExpression(), "Soma extensa inline com 512 nós."), { kind: "text", text: " Depois da expressão." }] }])),
    paragraphInstance("wide-block", richData([mathBlock(wideExpression(), "Soma extensa em bloco com 512 nós.")])),
    paragraphInstance("tall-fences", richData([mathBlock(tallExpression(), "Radicais aninhados sobre uma fração entre parênteses.")])),
    paragraphInstance("many-blocks", richData(Array.from({ length: 128 }, (_, index) => mathBlock({ type: "row", children: [{ type: "identifier", value: "x" }, { type: "operator", value: "=" }, { type: "number", value: String(index) }] }, `Igualdade sintética ${index}.`))))
  ] };
}
