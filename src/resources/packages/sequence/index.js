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
    example: Object.freeze({ prompt: "Acompanhe uma resolução DNS iterativa depois que o nome completo e o papel do resolvedor já foram apresentados.", variant: "ordered_steps", items: [{ id: "query", label: "Receber a consulta do cliente", detail: "O resolvedor verifica primeiro seu cache." }, { id: "root", label: "Consultar um servidor raiz", detail: "A resposta encaminha para o domínio de topo apropriado." }, { id: "tld", label: "Consultar o servidor do domínio de topo", detail: "A resposta indica servidores autoritativos do domínio." }, { id: "authoritative", label: "Consultar o servidor autoritativo", detail: "O registro solicitado é devolvido com seu TTL." }, { id: "answer", label: "Armazenar e devolver a resposta", detail: "O cache evita repetir imediatamente todo o percurso." }] })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["variant", "items"],
    properties: {
      prompt: { type: "string", maxLength: 2000 },
      variant: { type: "string", enum: ["ordered_steps", "timeline", "lifecycle", "cycle"] },
      items: { type: "array", minItems: 2, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 1200 }, detail: { type: "string", maxLength: 3000 } } } }
    }
  }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), variant: String(data?.variant || "ordered_steps").trim(), items: (data?.items || []).map((item) => ({ id: String(item?.id || "").trim(), label: String(item?.label || "").trim(), ...(item?.detail ? { detail: String(item.detail).trim() } : {}) })) };
  },
  validate(data) { return new Set(data.items.map(({ id }) => id)).size === data.items.length ? [] : ["Items precisam de ids únicos."]; },
  render(data) {
    const cyclic = ["cycle", "lifecycle"].includes(data.variant);
    return `<div class="runtime-block runtime-sequence-block" data-sequence-variant="${escapePackageAttribute(data.variant)}">${data.prompt ? renderPackageProse(data.prompt) : ""}<ol class="runtime-sequence-list" aria-label="Sequência ${cyclic ? "cíclica" : "ordenada"}">${data.items.map((item, index) => `<li data-sequence-item-id="${escapePackageAttribute(item.id)}"><span class="runtime-sequence-position" aria-hidden="true">${index + 1}</span><div class="runtime-sequence-content"><strong>${renderPackageInline(item.label)}</strong>${item.detail ? renderPackageProse(item.detail) : ""}</div>${index < data.items.length - 1 || cyclic ? `<span class="runtime-sequence-connector" aria-hidden="true">${index === data.items.length - 1 ? "↺" : "↓"}</span>` : ""}</li>`).join("")}</ol></div>`;
  },
  accessibleText(data) { return [data.prompt, ...data.items.map((item, index) => `${index + 1}. ${item.label}. ${item.detail || ""}`)].filter(Boolean).join(" "); },
  editableTargets(data) { return data.items.flatMap((item, index) => [{ path: `items[${index}].label`, label: `Editar etapa ${index + 1}` }, ...(item.detail ? [{ path: `items[${index}].detail`, label: `Editar detalhe ${index + 1}` }] : [])]); },
  practiceTargets(data) { return data.items.flatMap((item, index) => [{ path: `items[${index}].label`, label: `Lacuna na etapa ${index + 1}`, modes: ["gap", "typing"] }, ...(item.detail ? [{ path: `items[${index}].detail`, label: `Lacuna no detalhe ${index + 1}`, modes: ["gap", "typing"] }] : [])]); }
});
