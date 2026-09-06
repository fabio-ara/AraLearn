import { academicProfile } from "../../sdk/academic.js";
import { escapePackageAttribute, renderPackageLiteral, renderPackageProse } from "../../sdk/html.js";
import { CalculatorError, evaluateCalculatorExpression } from "./expression.js";

const bindings = new WeakMap();
const limitations = "Cálculo real aproximado, com até 12 algarismos significativos na exibição. Não resolve equações nem calcula com unidades ou números complexos.";
const text = (value) => String(value ?? "").trim();

export const calculatorPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.calculator", version: "1.0.0", label: "Calculadora",
    purpose: "Disponibilizar cálculo numérico real para verificar resultados, explorar valores e comparar uma previsão com um cálculo explícito.",
    slots: Object.freeze(["content"]), tool: Object.freeze({ label: "Calculadora", icon: "calculator" }),
    taskOperations: Object.freeze(["calculate", "compare-values", "check-prediction"]),
    academic: academicProfile({ domains: ["matemática", "estatística", "física", "engenharia"],
      knowledgeObjects: ["expressão numérica", "resultado aproximado", "ângulo"],
      conventions: ["precedência explícita", "unidade angular visível", "precisão limitada"],
      appropriateWhen: ["o cálculo apoia o raciocínio da tarefa, sem substituir a justificativa"],
      avoidWhen: ["a tarefa avalia cálculo mental sem apoio", "é necessário cálculo simbólico ou precisão arbitrária"],
      technologies: ["HTML semântico", "parser numérico delimitado"], practiceModes: ["exposition"],
      taxonomy: { primaryFamilyId: "family.quantitative_symbolic", familyIds: ["family.quantitative_symbolic"], structureIds: ["structure.symbolic"], specificity: "disciplinary" } }),
    responseCompatibility: Object.freeze([]), limitations: Object.freeze([limitations]),
    accessibility: "Expressão e unidade angular têm rótulos; Enter calcula e resultado ou erro é anunciado sem deslocar o foco."
  }),
  authoringContract: Object.freeze({
    intent: "Ofereça a calculadora quando o cálculo numérico é um apoio pertinente à tarefa.",
    required: Object.freeze(["title", "angleUnit"]), optional: Object.freeze(["prompt", "initialExpression"]),
    rules: Object.freeze(["Declare radians ou degrees; a escolha permanece visível.", "Não coloque uma resposta esperada em initialExpression quando ela revelaria o exercício.",
      "Use +, -, *, /, ^ e parênteses; multiplicação é explícita. Potências associam à direita e antecedem o sinal unário.",
      "Funções unárias: abs, sqrt, ln, log (base 10), exp, sin, cos, tan; constantes pi e e. Ponto ou vírgula decimal, sem separador de milhar.", limitations]),
    example: Object.freeze({ title: "Compare a estimativa com o cálculo", prompt: "Estime a diagonal antes de calcular a raiz da soma dos quadrados dos catetos.", initialExpression: "sqrt(3^2 + 4^2)", angleUnit: "radians" })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["title", "angleUnit"], properties: {
    title: { type: "string", minLength: 1, maxLength: 300 }, prompt: { type: "string", maxLength: 2000 },
    initialExpression: { type: "string", maxLength: 256 }, angleUnit: { type: "string", enum: ["radians", "degrees"] }
  } }),
  normalize(data) { return { title: text(data?.title), angleUnit: data?.angleUnit,
    ...(text(data?.prompt) ? { prompt: text(data.prompt) } : {}),
    ...(text(data?.initialExpression) ? { initialExpression: text(data.initialExpression) } : {}) }; },
  validate(data) {
    const errors = [];
    if (!text(data.title)) errors.push("A calculadora precisa de um título legível.");
    if (data.initialExpression?.trim()) {
      try { evaluateCalculatorExpression(data.initialExpression, { angleUnit: data.angleUnit }); }
      catch (error) { errors.push(`Expressão inicial: ${error.message}`); }
    }
    return errors;
  },
  render(data, options = {}) {
    const key = escapePackageAttribute(`${options.instanceId || options.blockKey || "calculator"}::expression`);
    return `<section class="runtime-block package-calculator"><h3>${renderPackageLiteral(data.title)}</h3>${data.prompt ? renderPackageProse(data.prompt) : ""}<form data-calculator-form><label for="${key}">Expressão</label><input id="${key}" data-calculator-input type="text" dir="ltr" maxlength="256" autocomplete="off" autocapitalize="off" spellcheck="false" value="${escapePackageAttribute(data.initialExpression || "")}"><label>Unidade dos ângulos<select data-calculator-angle><option value="radians"${data.angleUnit === "radians" ? " selected" : ""}>Radianos</option><option value="degrees"${data.angleUnit === "degrees" ? " selected" : ""}>Graus</option></select></label><div class="package-calculator-actions"><button type="submit">Calcular</button><button type="button" data-calculator-clear>Limpar</button></div><output data-calculator-output role="status" aria-live="polite" aria-atomic="true"></output></form><details class="package-calculator-limits"><summary>Operações e precisão</summary><p>Cálculo numérico aproximado. Use + − × ÷ ^, parênteses, pi e e. Multiplicação explícita: 2 × 3.</p><p>Funções: abs, sqrt, ln, log (base 10), exp, sin, cos e tan. Exemplo: sqrt(9).</p><p>Ponto ou vírgula decimal, sem separador de milhar. Potências: 2^3^2 = 512; −2^2 = −4.</p></details></section>`;
  },
  toolInteraction: Object.freeze({ bind(root) {
    bindings.get(root)?.();
    const form = root.querySelector("[data-calculator-form]");
    const input = root.querySelector("[data-calculator-input]");
    const angle = root.querySelector("[data-calculator-angle]");
    const output = root.querySelector("[data-calculator-output]");
    const clear = root.querySelector("[data-calculator-clear]");
    if (!form || !input || !angle || !output || !clear) return () => {};
    const calculate = (event) => {
      event.preventDefault();
      try {
        const result = evaluateCalculatorExpression(input.value, { angleUnit: angle.value });
        output.textContent = `Resultado aproximado: ${result.text}`;
        input.removeAttribute("aria-invalid");
      } catch (error) {
        output.textContent = error instanceof CalculatorError ? error.message : "Não foi possível calcular. Confira a expressão.";
        input.setAttribute("aria-invalid", "true");
      }
    };
    const reset = () => { input.value = ""; output.textContent = "Expressão limpa."; input.removeAttribute("aria-invalid"); input.focus(); };
    const invalidate = () => { output.textContent = ""; input.removeAttribute("aria-invalid"); };
    form.addEventListener("submit", calculate); clear.addEventListener("click", reset);
    input.addEventListener("input", invalidate); angle.addEventListener("change", invalidate);
    const cleanup = () => {
      form.removeEventListener("submit", calculate); clear.removeEventListener("click", reset);
      input.removeEventListener("input", invalidate); angle.removeEventListener("change", invalidate);
      if (bindings.get(root) === cleanup) bindings.delete(root);
    };
    bindings.set(root, cleanup); return cleanup;
  } }),
  accessibleText(data) { return `${data.title}. ${data.prompt || ""} Calculadora em ${data.angleUnit === "degrees" ? "graus" : "radianos"}. ${limitations}`; },
  editableTargets(data) { return [{ path: "title", label: "Editar título da calculadora" }, ...(data.prompt ? [{ path: "prompt", label: "Editar orientação da calculadora" }] : [])]; },
  practiceTargets() { return []; }
});
