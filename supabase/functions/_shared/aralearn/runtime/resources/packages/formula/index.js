import { FORMULA_EXPRESSION_INPUT_SCHEMA, isFormulaNotation, validateFormulaExpression } from "../../../domain/formulaExpression.js";
import { escapePackageAttribute, packageReferenceText, renderPackageLiteral, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import { hydrateMathExpression, renderMathNode, resolveFormulaExpression, TEX_NOTATION_GUIDE, validateTexNotation } from "../../sdk/mathExpression.js";

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

const FORMULA_AUTHORING_SCHEMA = Object.freeze({ type: "object", additionalProperties: false,
  required: ["accessibleText", "tex"], properties: { prompt: { type: "string", maxLength: 2000 },
    notation: { type: "string", enum: ["mathematics", "chemistry"] }, accessibleText: { type: "string", minLength: 1 },
    tex: { type: "string", minLength: 1, maxLength: 2000 } } });

export const formulaPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.formula", version: "1.0.0", label: "Fórmula", purpose: "Representar expressão matemática ou química estruturada com leitura acessível explícita.", slots: Object.freeze(["content", "feedback"]), taskOperations: Object.freeze(["read-formula", "transform-expression", "identify-operator", "calculate"]), academic: academicProfile({ domains: ["matemática", "estatística", "física", "química", "computação"], knowledgeObjects: ["expressão simbólica", "equação", "identidade"], conventions: ["estrutura bidimensional preservada", "símbolos conforme a área", "leitura acessível equivalente"], appropriateWhen: ["a forma simbólica participa do raciocínio"], avoidWhen: ["uma frase é mais clara que a notação"], technologies: ["MathML"], practiceModes: ["exposition", "gap", "typing", "selection"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["accessibleText não pode apenas repetir símbolos incompreensíveis." ]), accessibility: "A expressão sempre exige descrição textual equivalente." }),
  authoringContract: Object.freeze({ intent: "Escreva a fórmula em TeX e uma leitura acessível equivalente.", required: Object.freeze(["tex", "accessibleText"]), optional: Object.freeze(["prompt", "notation"]), rules: Object.freeze([...TEX_NOTATION_GUIDE, "A leitura acessível verbaliza operadores, limites, variáveis e índices. Explique os conceitos em prosa adjacente."]), example: { prompt: FORMULA_EXAMPLE.prompt, notation: FORMULA_EXAMPLE.notation, accessibleText: FORMULA_EXAMPLE.accessibleText, tex: "S(u)=\\int_{\\Omega} \\left[\\frac{1}{2}\\cdot\\frac{\\partial u_i}{\\partial x_j}\\cdot T^{ij}+f(u)\\right]\\,dV" } }),
  authoringSchema: FORMULA_AUTHORING_SCHEMA,
  schema: Object.freeze({ ...FORMULA_AUTHORING_SCHEMA, required: ["accessibleText"],
    oneOf: [{ required: ["tex"] }, { required: ["expression"] }],
    properties: { ...FORMULA_AUTHORING_SCHEMA.properties, prompt: { type: "string" }, expression: FORMULA_EXPRESSION_INPUT_SCHEMA } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), notation: String(data?.notation || "mathematics"), accessibleText: String(data?.accessibleText || "").trim(), ...(data?.tex !== undefined ? { tex: String(data.tex).trim() } : { expression: structuredClone(data?.expression) }) }; },
  validate(data) { const errors = []; if (data.notation !== undefined && !isFormulaNotation(data.notation)) errors.push("Notação inválida."); const result = data.tex !== undefined ? validateTexNotation(data.tex) : validateFormulaExpression(data.expression); if (!result.ok) errors.push(...result.errors.map((error) => `${error.path}: ${error.message}`)); return errors; },
  render(data, options = {}) { return `<div class="runtime-block runtime-formula-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure class="package-formula"><math display="block" aria-label="${escapePackageAttribute(packageReferenceText(data.accessibleText))}">${renderMathNode(resolveFormulaExpression(data))}</math><figcaption${options.manualEditing === true ? "" : ' class="visually-hidden"'}>${renderPackageLiteral(data.accessibleText)}</figcaption></figure></div>`; },
  hydrate(instanceRoot) { hydrateMathExpression(instanceRoot.querySelector(".package-formula")); },
  accessibleText(data) { return data.accessibleText; }, editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), { path: "accessibleText", label: "Editar leitura da fórmula" }]; },
  practiceTargets() { return []; }
});
