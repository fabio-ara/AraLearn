import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

function annotationsBySegment(data) {
  const bySegment = new Map(data.segments.map(({ id }) => [id, []]));
  data.annotations.forEach((annotation, index) => {
    annotation.targetIds.forEach((targetId) => bySegment.get(targetId)?.push(index));
  });
  return bySegment;
}

function targetExcerpt(data, targetIds) {
  const selected = new Set(targetIds);
  return data.segments.filter(({ id }) => selected.has(id)).map(({ text }) => (
    text.replace(/\uE000[^\uE001]+\uE001/gu, "[…]")
  )).join("");
}

export const annotatedTextPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.annotated_text", version: "1.0.0", label: "Texto anotado",
    purpose: "Relacionar trechos precisos de um texto a observações, funções ou explicações.", slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["annotate", "identify-function", "connect-evidence", "close-reading"]),
    academic: academicProfile({ domains: ["linguagens", "direito", "humanidades", "programação"], knowledgeObjects: ["trecho", "evidência", "anotação localizada"], conventions: ["alvo e comentário identificados", "citação preservada", "anotação próxima ao alvo"], appropriateWhen: ["a tarefa exige leitura minuciosa ou associação entre evidência e explicação"], avoidWhen: ["a observação não possui alvo textual preciso"], technologies: ["HTML semântico", "ARIA"], practiceModes: ["exposition", "gap", "typing", "selection", "matching"] }),
    responseCompatibility: Object.freeze(["aralearn.response.choice", "aralearn.response.gap"]), limitations: Object.freeze(["Não use para comentários sem alvo textual preciso."]),
    accessibility: "Trechos e notas usam marcadores numerados, controles associados e repetição textual do excerto."
  }),
  authoringContract: Object.freeze({
    intent: "Divida o texto em segmentos e ligue cada anotação aos segmentos que ela explica.", required: Object.freeze(["segments", "annotations"]), optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["Todo targetId precisa existir.", "Uma anotação explica uma relação relevante, não apenas renomeia o trecho."]),
    example: Object.freeze({
      prompt: "Examine os participantes da comunicação.",
      segments: [
        { id: "lead", text: "O " },
        { id: "client", text: "cliente" },
        { id: "middle", text: " envia uma " },
        { id: "request", text: "requisição" },
        { id: "end", text: " ao servidor." }
      ],
      annotations: [
        { id: "initiator", targetIds: ["client"], category: "Papel", label: "Iniciador", note: "Entidade que inicia a comunicação." },
        { id: "message", targetIds: ["request"], category: "Mensagem", label: "Pedido", note: "Mensagem que formaliza o pedido enviado ao servidor." }
      ]
    })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["segments", "annotations"], properties: {
      prompt: { type: "string", maxLength: 2000 },
      segments: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string", minLength: 1 }, text: { type: "string", minLength: 1, maxLength: 3000 } } } },
      annotations: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "targetIds", "label", "note"], properties: { id: { type: "string", minLength: 1 }, targetIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } }, category: { type: "string", minLength: 1, maxLength: 80 }, label: { type: "string", minLength: 1 }, note: { type: "string", minLength: 1 } } } }
    }
  }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), segments: (data?.segments || []).map((item) => ({ id: String(item?.id || "").trim(), text: String(item?.text || "") })), annotations: (data?.annotations || []).map((item) => ({ id: String(item?.id || "").trim(), targetIds: (item?.targetIds || []).map(String), ...(item?.category ? { category: String(item.category).trim() } : {}), label: String(item?.label || "").trim(), note: String(item?.note || "").trim() })) }; },
  validate(data) {
    const segmentIds = data.segments.map(({ id }) => id);
    const annotationIds = data.annotations.map(({ id }) => id);
    const knownSegments = new Set(segmentIds);
    const errors = [];
    if (new Set(segmentIds).size !== segmentIds.length) errors.push("Segmentos precisam de ids únicos.");
    if (new Set(annotationIds).size !== annotationIds.length) errors.push("Anotações precisam de ids únicos.");
    if (data.annotations.some(({ targetIds }) => targetIds.some((id) => !knownSegments.has(id)))) errors.push("Toda anotação precisa apontar para segmentos existentes.");
    return errors;
  },
  render(data) {
    const bySegment = annotationsBySegment(data);
    const segments = `<p class="runtime-annotated-text-source">${data.segments.map((segment) => {
      const indexes = bySegment.get(segment.id) || [];
      if (!indexes.length) return `<span>${renderPackageInline(segment.text)}</span>`;
      const markers = indexes.map((index) => index + 1).join(", ");
      return `<button type="button" class="runtime-annotated-text-segment" data-action="annotation-toggle" data-annotation-indexes="${escapePackageAttribute(indexes.join(","))}" aria-pressed="false" aria-label="${escapePackageAttribute(`${segment.text}, anotação ${markers}`)}">${renderPackageInline(segment.text)}<sup aria-hidden="true">${markers}</sup></button>`;
    }).join("")}</p>`;
    const annotations = `<ol class="runtime-annotated-text-notes">${data.annotations.map((annotation, index) => `<li data-annotation-index="${index}"><button type="button" class="runtime-annotated-text-note" data-action="annotation-toggle" data-annotation-indexes="${index}" aria-pressed="false"><span class="runtime-annotation-number" aria-hidden="true">${index + 1}</span><span class="runtime-annotation-copy">${annotation.category ? `<span class="runtime-annotation-category">${renderPackageInline(annotation.category)}</span>` : ""}<strong>${renderPackageInline(annotation.label)}</strong><q>${renderPackageInline(targetExcerpt(data, annotation.targetIds))}</q>${renderPackageProse(annotation.note)}</span></button></li>`).join("")}</ol>`;
    return `<div class="runtime-block runtime-annotated-text-block">${data.prompt ? renderPackageProse(data.prompt) : ""}${segments}${annotations}</div>`;
  },
  accessibleText(data) { return [...data.segments.map(({ text }) => text), ...data.annotations.map((item) => `${item.label}: ${item.note}`)].join(" "); },
  editableTargets(data) { return [...data.segments.map((_, index) => ({ path: `segments[${index}].text`, label: `Editar trecho ${index + 1}` })), ...data.annotations.flatMap((annotation, index) => [...(annotation.category ? [{ path: `annotations[${index}].category`, label: `Editar categoria ${index + 1}` }] : []), { path: `annotations[${index}].label`, label: `Editar rótulo ${index + 1}` }, { path: `annotations[${index}].note`, label: `Editar anotação ${index + 1}` }])]; },
  practiceTargets(data) { const annotatedIds = new Set(data.annotations.flatMap(({ targetIds }) => targetIds)); return [...data.segments.flatMap((segment, index) => annotatedIds.has(segment.id) ? [{ path: `segments[${index}].text`, label: `Lacuna no trecho anotado ${index + 1}`, modes: ["gap", "typing"] }] : []), ...data.annotations.map((_, index) => ({ path: `annotations[${index}].note`, label: `Lacuna na anotação ${index + 1}`, modes: ["gap", "typing"] }))]; }
});
