import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

export const sequencePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.sequence", version: "1.0.0", label: "Sequência",
    purpose: "Tornar visível ordem, cronologia, procedimento ou ciclo sem ramificação.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["order", "trace-process", "locate-in-time", "recognize-cycle"]),
    academic: academicProfile({ domains: ["transversal", "processos", "computação"], knowledgeObjects: ["ordem temporal", "procedimento linear", "ciclo"], conventions: ["ordem de leitura explícita", "etapas identificáveis", "ciclo fechado quando aplicável"], appropriateWhen: ["a ordem é parte do conceito e não há ramificação"], avoidWhen: ["há decisão, concorrência ou hierarquia"], technologies: ["HTML semântico", "CSS lógico"], practiceModes: ["exposition", "gap", "typing", "selection", "ordering"] }),
    responseCompatibility: Object.freeze(["aralearn.response.ordering", "aralearn.response.choice", "aralearn.response.gap"]),
    limitations: Object.freeze(["Não representa decisão ou ramificação." ]),
    accessibility: "A ordem visual também é a ordem do DOM e cada item tem posição textual."
  }),
  authoringContract: Object.freeze({
    intent: "Declare etapas semanticamente distintas na ordem correta.", required: Object.freeze(["variant", "items"]),
    optional: Object.freeze(["prompt"]), rules: Object.freeze(["Use flow quando houver ramificação.", "Cada item precisa ser compreensível por si no contexto."]),
    example: Object.freeze({ prompt: "Acompanhe o envio.", variant: "ordered_steps", items: [{ id: "s1", label: "Preparar mensagem" }, { id: "s2", label: "Transmitir" }] })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["variant", "items"],
    properties: {
      prompt: { type: "string", maxLength: 2000 },
      variant: { type: "string", enum: ["ordered_steps", "timeline", "lifecycle", "cycle", "code_blocks"] },
      items: { type: "array", minItems: 2, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 1200 }, detail: { type: "string", maxLength: 3000 } } } }
    }
  }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), variant: String(data?.variant || "ordered_steps").trim(), items: (data?.items || []).map((item) => ({ id: String(item?.id || "").trim(), label: String(item?.label || "").trim(), ...(item?.detail ? { detail: String(item.detail).trim() } : {}) })) };
  },
  validate(data) { return new Set(data.items.map(({ id }) => id)).size === data.items.length ? [] : ["Items precisam de ids únicos."]; },
  render(data) {
    return `<div class="runtime-block runtime-sequence-block" data-sequence-variant="${escapePackageAttribute(data.variant)}">${data.prompt ? renderPackageProse(data.prompt) : ""}<ol class="runtime-sequence-list">${data.items.map((item) => `<li data-sequence-item-id="${escapePackageAttribute(item.id)}"><strong>${renderPackageInline(item.label)}</strong>${item.detail ? renderPackageProse(item.detail) : ""}</li>`).join("")}</ol></div>`;
  },
  accessibleText(data) { return [data.prompt, ...data.items.map((item, index) => `${index + 1}. ${item.label}. ${item.detail || ""}`)].filter(Boolean).join(" "); },
  editableTargets(data) { return data.items.flatMap((item, index) => [{ path: `items[${index}].label`, label: `Editar etapa ${index + 1}` }, ...(item.detail ? [{ path: `items[${index}].detail`, label: `Editar detalhe ${index + 1}` }] : [])]); }
});
