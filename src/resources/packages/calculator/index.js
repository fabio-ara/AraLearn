import { academicProfile } from "../../sdk/academic.js";
import { escapePackageAttribute, renderPackageLiteral, renderPackageProse } from "../../sdk/html.js";
import { CalculatorError, evaluateCalculatorExpression } from "./expression.js";

const bindings = new WeakMap();
const limitations = "Cálculo real aproximado, com até 12 algarismos significativos na exibição. Não resolve equações nem calcula com unidades ou números complexos.";
const text = (value) => String(value ?? "").trim();
const actionIcon = path => `<svg class="home-tab-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
const keyButton = (value, label = value) => `<button type="button" data-calculator-key="${escapePackageAttribute(value)}" aria-label="${escapePackageAttribute(label)}">${renderPackageLiteral(value)}</button>`;

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
    return `<section class="runtime-block package-calculator"><h3>${renderPackageLiteral(data.title)}</h3>${data.prompt ? renderPackageProse(data.prompt) : ""}` +
      `<form data-calculator-form><div class="package-calculator-display"><label class="visually-hidden" for="${key}">Expressão</label>` +
      `<input id="${key}" data-calculator-input type="text" dir="ltr" inputmode="decimal" maxlength="256" autocomplete="off" autocapitalize="off" spellcheck="false" value="${escapePackageAttribute(data.initialExpression || "")}">` +
      '<output data-calculator-output role="status" aria-label="Resultado aproximado" aria-live="polite" aria-atomic="true"></output></div>' +
      '<div class="package-calculator-keypad" aria-label="Teclado da calculadora">' +
      `<button type="button" data-calculator-clear aria-label="Limpar" title="Limpar">${actionIcon("m4 14 8-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-6 7H9l-5-5a1 1 0 0 1 0-1ZM9 9l9 9M14 20h7")}</button>` +
      `<button type="button" data-calculator-backspace aria-label="Apagar último caractere" title="Apagar último caractere">${actionIcon("M9 5H21V19H9L2 12ZM12 9l6 6m0-6-6 6")}</button>` +
      keyButton("(", "Abrir parênteses") + keyButton(")", "Fechar parênteses") +
      ["7", "8", "9"].map(value => keyButton(value)).join("") + keyButton("÷", "Dividir") +
      ["4", "5", "6"].map(value => keyButton(value)).join("") + keyButton("×", "Multiplicar") +
      ["1", "2", "3"].map(value => keyButton(value)).join("") + keyButton("−", "Subtrair") +
      keyButton("0") + keyButton(",", "Separador decimal") +
      `<button type="submit" class="primary" aria-label="Calcular" title="Calcular">${actionIcon("M5 9h14M5 15h14")}</button>` +
      keyButton("+", "Somar") + '</div>' +
      '<details class="package-calculator-limits"><summary>Funções e precisão</summary>' +
      `<label>Unidade dos ângulos<select data-calculator-angle><option value="radians"${data.angleUnit === "radians" ? " selected" : ""}>Radianos</option><option value="degrees"${data.angleUnit === "degrees" ? " selected" : ""}>Graus</option></select></label>` +
      '<div class="package-calculator-functions">' + [["sqrt(", "Raiz quadrada"], ["^", "Potência"], ["pi", "Pi"], ["e", "Número de Euler"],
        ["sin(", "Seno"], ["cos(", "Cosseno"], ["tan(", "Tangente"], ["ln(", "Logaritmo natural"],
        ["log(", "Logaritmo de base dez"], ["abs(", "Valor absoluto"], ["exp(", "Exponencial"]].map(([value, label]) => keyButton(value, label)).join("") +
      '</div><p>Até 12 algarismos significativos. Use ponto ou vírgula decimal, sem separador de milhar. Multiplicação explícita; potências antecedem o sinal negativo. O resultado é aproximado.</p></details></form></section>';
  },
  toolInteraction: Object.freeze({ bind(root) {
    bindings.get(root)?.();
    const form = root.querySelector("[data-calculator-form]");
    const input = root.querySelector("[data-calculator-input]");
    const angle = root.querySelector("[data-calculator-angle]");
    const output = root.querySelector("[data-calculator-output]");
    const clear = root.querySelector("[data-calculator-clear]");
    if (!form || !input || !angle || !output || !clear) return () => {};
    let lastResult = null;
    let selection = [input.value.length, input.value.length];
    const captureSelection = () => { selection = [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length]; };
    const calculate = (event) => {
      event.preventDefault();
      try {
        const result = evaluateCalculatorExpression(input.value, { angleUnit: angle.value });
        lastResult = result.value;
        output.textContent = result.text;
        input.removeAttribute("aria-invalid");
      } catch (error) {
        lastResult = null;
        output.textContent = error instanceof CalculatorError ? error.message : "Não foi possível calcular. Confira a expressão.";
        input.setAttribute("aria-invalid", "true");
      }
    };
    const invalidate = () => { lastResult = null; output.textContent = ""; input.removeAttribute("aria-invalid"); };
    const reset = () => { input.value = ""; selection = [0, 0]; invalidate(); input.focus({ preventScroll: true }); };
    const enter = event => {
      const button = event.target.closest("[data-calculator-key], [data-calculator-backspace]");
      if (!button || !form.contains(button)) return;
      const value = button.dataset.calculatorKey ?? "";
      if (lastResult !== null && value) {
        input.value = /^[+−×÷^]$/u.test(value) ? String(lastResult) : "";
        selection = [input.value.length, input.value.length];
      }
      let [start, end] = selection;
      if (button.hasAttribute("data-calculator-backspace") && start === end) start = Math.max(0, start - 1);
      if (input.value.length - (end - start) + value.length > 256) return;
      input.setRangeText(value, start, end, "end");
      selection = [start + value.length, start + value.length];
      invalidate();
    };
    form.addEventListener("submit", calculate); clear.addEventListener("click", reset);
    form.addEventListener("click", enter);
    input.addEventListener("input", invalidate); angle.addEventListener("change", invalidate);
    for (const event of ["input", "keyup", "pointerup", "blur"]) input.addEventListener(event, captureSelection);
    const cleanup = () => {
      form.removeEventListener("submit", calculate); clear.removeEventListener("click", reset);
      form.removeEventListener("click", enter);
      input.removeEventListener("input", invalidate); angle.removeEventListener("change", invalidate);
      for (const event of ["input", "keyup", "pointerup", "blur"]) input.removeEventListener(event, captureSelection);
      if (bindings.get(root) === cleanup) bindings.delete(root);
    };
    bindings.set(root, cleanup); return cleanup;
  } }),
  accessibleText(data) { return `${data.title}. ${data.prompt || ""} Calculadora em ${data.angleUnit === "degrees" ? "graus" : "radianos"}. ${limitations}`; },
  editableTargets(data) { return [{ path: "title", label: "Editar título da calculadora" }, ...(data.prompt ? [{ path: "prompt", label: "Editar orientação da calculadora" }] : [])]; },
  practiceTargets() { return []; }
});
