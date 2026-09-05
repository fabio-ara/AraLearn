import { FORMULA_EXPRESSION_INPUT_SCHEMA, isFormulaNotation, validateFormulaExpression } from "../../../domain/formulaExpression.js";
import { escapePackageAttribute, escapePackageHtml, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import { hydrateMathExpression, renderMathNode } from "../../sdk/mathExpression.js";

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
  hydrate(instanceRoot) { hydrateMathExpression(instanceRoot.querySelector(".package-formula")); },
  accessibleText(data) { return data.accessibleText; }, editableTargets(data) { return data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []; },
  practiceTargets() { return []; }
});
