import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

function optionValue(option) {
  return option.kind === "code" ? `${option.language}:${option.code}` : option.text;
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
    rules: Object.freeze(["Distratores representam erros plausíveis.", "Multiple avalia o conjunto exato.", "Best só usa seleção single."]),
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
  render(data, options = {}) { const name = escapePackageAttribute(options.instanceId || "package-choice"); const type = data.selectionMode === "multiple" ? "checkbox" : "radio"; return `<fieldset class="runtime-choice package-choice-response"><legend>${renderPackageProse(data.question)}</legend>${data.options.map((option) => `<label><input type="${type}" name="${name}" value="${escapePackageAttribute(option.id)}"><span>${option.kind === "code" ? `<code>${renderPackageInline(option.code)}</code>` : renderPackageInline(option.text)}</span></label>`).join("")}</fieldset>`; },
  accessibleText(data) { return `${data.question} ${data.options.map((option, index) => `${index + 1}: ${optionValue(option)}`).join("; ")}`; },
  editableTargets(data) { return [{ path: "question", label: "Editar pergunta" }, ...data.options.flatMap((option, index) => [{ path: `options[${index}].${option.kind === "code" ? "code" : "text"}`, label: `Editar alternativa ${index + 1}` }, ...(option.feedback ? [{ path: `options[${index}].feedback`, label: `Editar feedback ${index + 1}` }] : [])])]; },
  evaluate(data, answer) { const selectedIds = [...new Set(Array.isArray(answer?.selectedIds) ? answer.selectedIds.map(String) : [])].sort(); const expectedIds = [...data.answerIds].sort(); const correct = selectedIds.length === expectedIds.length && selectedIds.every((id, index) => id === expectedIds[index]); const selectedFeedback = data.options.filter(({ id }) => selectedIds.includes(id)).map(({ id, feedback, misconceptionId }) => ({ id, feedback: feedback || "", misconceptionId: misconceptionId || "" })); return { correct, selectedIds, expectedIds, selectedFeedback }; }
});
