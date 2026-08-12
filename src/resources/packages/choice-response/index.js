import {
  escapePackageAttribute,
  renderPackageActionIcon,
  renderPackageInline,
  renderPackageProse
} from "../../sdk/html.js";
import { shuffleExerciseOptions } from "../../../core/exerciseOptions.js";

function optionValue(option) {
  return option.kind === "code" ? `${option.language}:${option.code}` : option.text;
}

function instruction(data) {
  if (data.selectionCriterion === "best") return "Selecione a melhor alternativa.";
  return data.selectionMode === "multiple"
    ? "Selecione todas as alternativas corretas."
    : "Selecione a alternativa correta.";
}

function responseFeedback(blockKey, feedback) {
  if (!feedback) return "";
  if (feedback === "correct") return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  if (feedback === "incomplete") return '<div class="inline-feedback warn"><p class="tiny">Selecione pelo menos uma resposta.</p></div>';
  const key = escapePackageAttribute(blockKey);
  return `<div class="inline-feedback err has-actions"><p class="tiny">As respostas marcadas não correspondem ao conjunto esperado.</p><div class="feedback-icons"><button class="icon-pill" type="button" data-action="choice-view-answer" data-choice-block-key="${key}" title="Ver resposta" aria-label="Ver resposta">${renderPackageActionIcon("answer")}</button><button class="icon-pill primary" type="button" data-action="choice-try-again" data-choice-block-key="${key}" title="Tentar de novo" aria-label="Tentar de novo">${renderPackageActionIcon("retry")}</button></div></div>`;
}

export const choiceResponsePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.response.choice", version: "1.0.0", label: "Escolha",
    purpose: "Pedir que o estudante discrimine uma ou mais alternativas plausíveis.", slots: Object.freeze(["response"]),
    cognitiveOperations: Object.freeze(["discriminate", "select-best", "identify-set", "diagnose-misconception"]),
    responseCompatibility: Object.freeze([]), limitations: Object.freeze(["Não use quando recordar ou produzir a resposta for a operação desejada."]),
    accessibility: "Alternativas usam fieldset, legend e controles nativos."
  }),
  authoringContract: Object.freeze({
    intent: "Declare a pergunta, o modo de seleção, alternativas semanticamente distintas e o conjunto correto.",
    required: Object.freeze(["question", "selectionMode", "selectionCriterion", "options", "answerIds"]), optional: Object.freeze([]),
    rules: Object.freeze(["A pergunta aparece somente aqui; não a repita em um paragraph de content.", "Distratores representam erros plausíveis.", "Multiple avalia o conjunto exato.", "Best só usa seleção single."]),
    example: Object.freeze({ question: "Qual protocolo fornece entrega confiável?", selectionMode: "single", selectionCriterion: "correct", options: [{ id: "tcp", text: "TCP" }, { id: "udp", text: "UDP" }], answerIds: ["tcp"] })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["question", "selectionMode", "selectionCriterion", "options", "answerIds"], properties: {
      question: { type: "string", minLength: 1, maxLength: 3000 }, selectionMode: { type: "string", enum: ["single", "multiple"] }, selectionCriterion: { type: "string", enum: ["correct", "best"] },
      options: { type: "array", minItems: 2, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1 }, kind: { type: "string", enum: ["text", "code"] }, text: { type: "string" }, language: { type: "string" }, code: { type: "string" }, feedback: { type: "string" }, misconceptionId: { type: "string" } } } },
      answerIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } }
    }
  }),
  normalize(data) { return { question: String(data?.question || "").trim(), selectionMode: String(data?.selectionMode || "single").trim(), selectionCriterion: String(data?.selectionCriterion || "correct").trim(), options: (data?.options || []).map((option) => ({ id: String(option?.id || "").trim(), ...(option?.kind === "code" ? { kind: "code", language: String(option.language || "text").trim(), code: String(option.code || "") } : { kind: "text", text: String(option?.text || "").trim() }), ...(option?.feedback ? { feedback: String(option.feedback).trim() } : {}), ...(option?.misconceptionId ? { misconceptionId: String(option.misconceptionId).trim() } : {}) })), answerIds: (data?.answerIds || []).map(String) }; },
  validate(data) { const ids = new Set(data.options.map(({ id }) => id)); const errors = []; if (ids.size !== data.options.length) errors.push("Alternativas precisam de ids únicos."); if (data.answerIds.some((id) => !ids.has(id))) errors.push("answerIds precisa referenciar alternativas existentes."); if (data.selectionMode === "single" && data.answerIds.length !== 1) errors.push("Escolha single exige uma resposta."); if (data.selectionMode === "multiple" && data.answerIds.length === data.options.length) errors.push("Escolha multiple não pode tornar todas as opções corretas."); if (data.selectionCriterion === "best" && data.selectionMode !== "single") errors.push("Critério best exige seleção single."); if (data.options.some((option) => option.kind === "code" ? !option.code || !option.language : !option.text)) errors.push("Toda alternativa precisa de texto ou código."); return errors; },
  render(data, options = {}) {
    const blockKey = String(options.blockKey || options.instanceId || "package-choice");
    const selected = new Set((options.responseState?.selected || []).map(String));
    const feedback = options.responseState?.feedback || null;
    const expected = new Set(data.answerIds);
    const items = data.options.map((option, index) => ({ option, index }));
    const displayed = options.manualEditEnabled
      ? items
      : shuffleExerciseOptions(items, `${options.exerciseShuffleSeed || "runtime"}::${blockKey}`);
    const optionsHtml = displayed.map(({ option }) => {
      const checked = selected.has(option.id);
      const evaluatedCorrect = feedback === "correct";
      const evaluatedWrong = feedback === "wrong";
      const shouldBeChecked = expected.has(option.id);
      const classes = [
        checked ? "active" : "",
        evaluatedCorrect && checked && shouldBeChecked ? "selected-correct" : "",
        evaluatedWrong && checked && !shouldBeChecked ? "selected-incorrect" : ""
      ].filter(Boolean).join(" ");
      const value = option.kind === "code"
        ? `<pre class="multiple-choice-code"><code data-language="${escapePackageAttribute(option.language)}">${renderPackageInline(option.code)}</code></pre>`
        : renderPackageInline(option.text);
      const optionFeedback = checked && (evaluatedCorrect || evaluatedWrong) && option.feedback
        ? `<div class="multiple-choice-option-feedback">${renderPackageProse(option.feedback)}</div>`
        : "";
      return `<button class="multiple-choice-option${classes ? ` ${classes}` : ""}" type="button" data-action="choice-toggle" data-choice-block-key="${escapePackageAttribute(blockKey)}" data-choice-option-id="${escapePackageAttribute(option.id)}" role="${data.selectionMode === "single" ? "radio" : "checkbox"}" aria-checked="${checked ? "true" : "false"}"><span class="multiple-choice-mark">${checked ? '<span class="multiple-choice-dot" aria-hidden="true"></span>' : ""}</span><span class="multiple-choice-label"><span>${value}</span>${optionFeedback}</span></button>`;
    }).join("");
    const feedbackHtml = responseFeedback(blockKey, feedback);
    if (feedbackHtml && Array.isArray(options.dockExerciseParts)) options.dockExerciseParts.push(feedbackHtml);
    return `<section class="runtime-block runtime-choice-block multiple-choice-exercise package-choice-response"><div class="runtime-choice-body"><div>${renderPackageProse(data.question)}</div><p class="multiple-choice-instruction" id="${escapePackageAttribute(`${blockKey}::instruction`)}">${instruction(data)}</p></div><div class="multiple-choice-list" role="${data.selectionMode === "single" ? "radiogroup" : "group"}" aria-labelledby="${escapePackageAttribute(`${blockKey}::instruction`)}">${optionsHtml}</div>${Array.isArray(options.dockExerciseParts) ? "" : feedbackHtml}</section>`;
  },
  accessibleText(data) { return `${data.question} ${data.options.map((option, index) => `${index + 1}: ${optionValue(option)}`).join("; ")}`; },
  editableTargets(data) { return [{ path: "question", label: "Editar pergunta" }, ...data.options.flatMap((option, index) => [{ path: `options[${index}].${option.kind === "code" ? "code" : "text"}`, label: `Editar alternativa ${index + 1}` }, ...(option.feedback ? [{ path: `options[${index}].feedback`, label: `Editar feedback ${index + 1}` }] : [])])]; },
  evaluate(data, answer) { const selectedIds = [...new Set(Array.isArray(answer?.selectedIds) ? answer.selectedIds.map(String) : [])].sort(); const expectedIds = [...data.answerIds].sort(); const correct = selectedIds.length === expectedIds.length && selectedIds.every((id, index) => id === expectedIds[index]); const selectedFeedback = data.options.filter(({ id }) => selectedIds.includes(id)).map(({ id, feedback, misconceptionId }) => ({ id, feedback: feedback || "", misconceptionId: misconceptionId || "" })); return { correct, selectedIds, expectedIds, selectedFeedback }; }
});
