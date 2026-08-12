import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

export const annotatedTextPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.annotated_text", version: "1.0.0", label: "Texto anotado",
    purpose: "Relacionar trechos precisos de um texto a observações, funções ou explicações.", slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["annotate", "identify-function", "connect-evidence", "close-reading"]),
    responseCompatibility: Object.freeze(["aralearn.response.choice", "aralearn.response.gap"]), limitations: Object.freeze(["Não use para comentários sem alvo textual preciso."]),
    accessibility: "Anotações repetem textualmente os ids e rótulos dos trechos-alvo."
  }),
  authoringContract: Object.freeze({
    intent: "Divida o texto em segmentos e ligue cada anotação aos segmentos que ela explica.", required: Object.freeze(["segments", "annotations"]), optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["Todo targetId precisa existir.", "Uma anotação explica uma relação relevante, não apenas renomeia o trecho."]),
    example: Object.freeze({ segments: [{ id: "s1", text: "O cliente envia uma requisição." }], annotations: [{ id: "a1", targetIds: ["s1"], label: "Ação inicial", note: "A comunicação começa no cliente." }] })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["segments", "annotations"], properties: {
      prompt: { type: "string", maxLength: 2000 },
      segments: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string", minLength: 1 }, text: { type: "string", minLength: 1, maxLength: 3000 } } } },
      annotations: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "targetIds", "label", "note"], properties: { id: { type: "string", minLength: 1 }, targetIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } }, label: { type: "string", minLength: 1 }, note: { type: "string", minLength: 1 } } } }
    }
  }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), segments: (data?.segments || []).map((item) => ({ id: String(item?.id || "").trim(), text: String(item?.text || "").trim() })), annotations: (data?.annotations || []).map((item) => ({ id: String(item?.id || "").trim(), targetIds: (item?.targetIds || []).map(String), label: String(item?.label || "").trim(), note: String(item?.note || "").trim() })) }; },
  validate(data) { const ids = new Set(data.segments.map(({ id }) => id)); return data.annotations.some(({ targetIds }) => targetIds.some((id) => !ids.has(id))) ? ["Toda anotação precisa apontar para segmentos existentes."] : []; },
  render(data) {
    const segments = `<p class="runtime-annotated-text-source">${data.segments.map((segment) => `<span data-segment-id="${escapePackageAttribute(segment.id)}">${renderPackageInline(segment.text)}</span>`).join(" ")}</p>`;
    const annotations = `<dl class="runtime-annotated-text-notes">${data.annotations.map((annotation) => `<div><dt>${renderPackageInline(annotation.label)}</dt><dd>${renderPackageProse(annotation.note)}<small>Trechos: ${annotation.targetIds.map(renderPackageInline).join(", ")}</small></dd></div>`).join("")}</dl>`;
    return `<div class="runtime-block runtime-annotated-text-block">${data.prompt ? renderPackageProse(data.prompt) : ""}${segments}${annotations}</div>`;
  },
  accessibleText(data) { return [...data.segments.map(({ text }) => text), ...data.annotations.map((item) => `${item.label}: ${item.note}`)].join(" "); },
  editableTargets(data) { return [...data.segments.map((_, index) => ({ path: `segments[${index}].text`, label: `Editar trecho ${index + 1}` })), ...data.annotations.flatMap((_, index) => [{ path: `annotations[${index}].label`, label: `Editar rótulo ${index + 1}` }, { path: `annotations[${index}].note`, label: `Editar anotação ${index + 1}` }])]; }
});
