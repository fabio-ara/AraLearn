import {
  escapePackageAttribute,
  renderPackageActionIcon,
  renderPackageInline,
  renderPackageProse
} from "../../sdk/html.js";

function feedbackHtml(blockKey, feedback) {
  if (!feedback) return "";
  const key = escapePackageAttribute(blockKey);
  if (feedback === "correct") return `<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>`;
  if (feedback === "incomplete") return `<div class="inline-feedback warn"><p class="tiny">Organize todos os itens.</p></div>`;
  return `<div class="inline-feedback err has-actions"><p class="tiny">A ordem ainda não está correta.</p><div class="feedback-icons"><button class="icon-pill" type="button" data-action="ordering-view-answer" data-response-block-key="${key}" title="Ver resposta" aria-label="Ver resposta">${renderPackageActionIcon("answer")}</button><button class="icon-pill primary" type="button" data-action="ordering-try-again" data-response-block-key="${key}" title="Tentar de novo" aria-label="Tentar de novo">${renderPackageActionIcon("retry")}</button></div></div>`;
}

function itemLabels(data, options) {
  const target = (options.card?.content || []).find(({ id }) => id === data.targetInstanceId);
  const items = Array.isArray(target?.data?.items) ? target.data.items : [];
  return new Map(items.map((item) => [String(item.id), String(item.label || item.text || item.id)]));
}

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
  validateCard(card) {
    const data = card.response.data;
    const target = (card.content || []).find(({ id }) => id === data.targetInstanceId);
    if (!target) return ["A ordenação aponta para uma instância de conteúdo inexistente."];
    const availableIds = new Set((target.data?.items || []).map(({ id }) => String(id)));
    return data.itemIds.every((id) => availableIds.has(id))
      ? []
      : ["A ordenação referencia itens inexistentes no conteúdo indicado."];
  },
  render(data, options = {}) {
    const labels = itemLabels(data, options);
    const order = Array.isArray(options.responseState?.order)
      ? options.responseState.order
      : data.itemIds;
    const key = escapePackageAttribute(options.blockKey);
    const body = `<div class="package-ordering-response">${renderPackageProse(data.prompt)}<ol>${order.map((id, index) => `<li data-ordering-item-id="${escapePackageAttribute(id)}"><span>${renderPackageInline(labels.get(id) || id)}</span><span class="package-ordering-controls"><button type="button" data-action="ordering-move" data-response-block-key="${key}" data-ordering-item-id="${escapePackageAttribute(id)}" data-ordering-direction="up" aria-label="Mover para cima"${index === 0 ? " disabled" : ""}>↑</button><button type="button" data-action="ordering-move" data-response-block-key="${key}" data-ordering-item-id="${escapePackageAttribute(id)}" data-ordering-direction="down" aria-label="Mover para baixo"${index === order.length - 1 ? " disabled" : ""}>↓</button></span><span class="visually-hidden">Posição ${index + 1}</span></li>`).join("")}</ol></div>`;
    const validation = `<button class="choice-check-btn" type="button" data-action="ordering-validate" data-response-block-key="${key}">Conferir</button>`;
    const feedback = feedbackHtml(options.blockKey, options.responseState?.feedback);
    if (Array.isArray(options.dockExerciseParts)) {
      options.dockExerciseParts.push(validation + feedback);
      return body;
    }
    return body + validation + feedback;
  },
  accessibleText(data) { return `${data.prompt} Itens: ${data.itemIds.join(", ")}.`; },
  editableTargets() { return [{ path: "prompt", label: "Editar pergunta" }]; },
  evaluate(data, answer) { const order = Array.isArray(answer?.order) ? answer.order.map(String) : []; return { correct: order.length === data.answerOrder.length && order.every((id, index) => id === data.answerOrder[index]), order, expectedOrder: [...data.answerOrder] }; }
});
