import { escapePackageAttribute, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

export const orderingResponsePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.response.ordering", version: "1.0.0", label: "Ordenação",
    purpose: "Pedir que o estudante reconstrua uma ordem causal, temporal ou procedimental.", slots: Object.freeze(["response"]),
    cognitiveOperations: Object.freeze(["order", "reconstruct-process", "sequence-causes"]), responseCompatibility: Object.freeze([]),
    limitations: Object.freeze(["Não use para ordem arbitrária ou mera decoração." ]), accessibility: "Oferece botões de mover e posição anunciada; arrastar nunca é obrigatório."
  }),
  authoringContract: Object.freeze({ intent: "Referencie itens expostos por um package de conteúdo e declare a ordem correta.", required: Object.freeze(["prompt", "targetInstanceId", "itemIds", "answerOrder"]), optional: Object.freeze([]), rules: Object.freeze(["answerOrder contém exatamente os mesmos ids de itemIds."]), example: Object.freeze({ prompt: "Ordene as etapas.", targetInstanceId: "body-1", itemIds: ["s1", "s2"], answerOrder: ["s1", "s2"] }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["prompt", "targetInstanceId", "itemIds", "answerOrder"], properties: { prompt: { type: "string", minLength: 1 }, targetInstanceId: { type: "string", minLength: 1 }, itemIds: { type: "array", minItems: 2, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1 } }, answerOrder: { type: "array", minItems: 2, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1 } } } }),
  normalize(data) { return { prompt: String(data?.prompt || "").trim(), targetInstanceId: String(data?.targetInstanceId || "").trim(), itemIds: (data?.itemIds || []).map(String), answerOrder: (data?.answerOrder || []).map(String) }; },
  validate(data) { const items = [...data.itemIds].sort(); const answer = [...data.answerOrder].sort(); return items.length === answer.length && items.every((id, index) => id === answer[index]) ? [] : ["answerOrder precisa conter exatamente os ids de itemIds."]; },
  render(data) { return `<div class="package-ordering-response">${renderPackageProse(data.prompt)}<ol>${data.itemIds.map((id, index) => `<li data-ordering-item-id="${escapePackageAttribute(id)}"><span>${renderPackageInline(id)}</span><button type="button" data-ordering-move="up" aria-label="Mover ${renderPackageInline(id)} para cima">↑</button><button type="button" data-ordering-move="down" aria-label="Mover ${renderPackageInline(id)} para baixo">↓</button><span class="visually-hidden">Posição ${index + 1}</span></li>`).join("")}</ol></div>`; },
  accessibleText(data) { return `${data.prompt} Itens: ${data.itemIds.join(", ")}.`; }, editableTargets() { return [{ path: "prompt", label: "Editar pergunta" }]; },
  evaluate(data, answer) { const order = Array.isArray(answer?.order) ? answer.order.map(String) : []; return { correct: order.length === data.answerOrder.length && order.every((id, index) => id === data.answerOrder[index]), order, expectedOrder: [...data.answerOrder] }; }
});
