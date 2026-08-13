import {
  escapePackageAttribute,
  renderPackageActionIcon,
  renderPackageInline,
  renderPackageProse
} from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

function feedbackHtml(blockKey, feedback) {
  if (!feedback) return "";
  const key = escapePackageAttribute(blockKey);
  if (feedback === "correct") return `<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>`;
  if (feedback === "incomplete") return `<div class="inline-feedback warn"><p class="tiny">Organize todos os itens.</p></div>`;
  return `<div class="inline-feedback err has-actions"><p class="tiny">A ordem ainda não está correta.</p><div class="feedback-icons"><button class="icon-pill" type="button" data-action="ordering-view-answer" data-response-block-key="${key}" title="Ver resposta" aria-label="Ver resposta">${renderPackageActionIcon("answer")}</button><button class="icon-pill primary" type="button" data-action="ordering-try-again" data-response-block-key="${key}" title="Tentar de novo" aria-label="Tentar de novo">${renderPackageActionIcon("retry")}</button></div></div>`;
}

export const orderingResponsePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.response.ordering", version: "2.0.0", label: "Ordenação",
    purpose: "Pedir que o estudante reconstrua uma ordem causal, temporal ou procedimental.", slots: Object.freeze(["response"]),
    cognitiveOperations: Object.freeze(["order", "reconstruct-process", "sequence-causes"]), responseCompatibility: Object.freeze([]),
    academic: academicProfile({ domains: ["transversal"], knowledgeObjects: ["ordem de itens", "procedimento reconstruído"], conventions: ["posição explícita", "alternativa ao arraste", "conjunto de itens preservado"], appropriateWhen: ["reconstruir a ordem é a evidência de aprendizagem"], avoidWhen: ["a ordem é arbitrária"], technologies: ["HTML semântico", "controles de movimento acessíveis"], practiceModes: ["ordering"], content: false }),
    limitations: Object.freeze(["Não use para ordem arbitrária ou mera decoração." ]), accessibility: "Oferece botões de mover e posição anunciada; arrastar nunca é obrigatório."
  }),
  authoringContract: Object.freeze({ intent: "Declare os blocos que o estudante deve ordenar e a sequência correta, sem depender da estrutura do package de conteúdo.", required: Object.freeze(["prompt", "items", "answerOrder"]), optional: Object.freeze([]), rules: Object.freeze(["Cada item possui id e texto próprios.", "answerOrder contém exatamente os ids declarados em items.", "A ordem precisa ser pedagogicamente significativa."]), example: Object.freeze({ prompt: "Ordene as etapas.", items: [{ id: "s1", label: "Preparar" }, { id: "s2", label: "Executar" }], answerOrder: ["s1", "s2"] }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["prompt", "items", "answerOrder"], properties: { prompt: { type: "string", minLength: 1 }, items: { type: "array", minItems: 2, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } }, answerOrder: { type: "array", minItems: 2, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1 } } } }),
  normalize(data) { return { prompt: String(data?.prompt || "").trim(), items: (data?.items || []).map((item) => ({ id: String(item?.id || "").trim(), label: String(item?.label || "").trim() })), answerOrder: (data?.answerOrder || []).map(String) }; },
  validate(data) {
    const itemIds = data.items.map(({ id }) => id);
    const answer = [...data.answerOrder].sort();
    const items = [...itemIds].sort();
    const errors = [];
    if (new Set(itemIds).size !== itemIds.length) errors.push("Itens de ordenação precisam de ids únicos.");
    if (items.length !== answer.length || !items.every((id, index) => id === answer[index])) errors.push("answerOrder precisa conter exatamente os ids de items.");
    return errors;
  },
  render(data, options = {}) {
    const labels = new Map(data.items.map(({ id, label }) => [id, label]));
    const order = Array.isArray(options.responseState?.order)
      ? options.responseState.order
      : data.items.map(({ id }) => id);
    const key = escapePackageAttribute(options.blockKey);
    const body = `<div class="package-ordering-response">${renderPackageProse(data.prompt)}<ol>${order.map((id, index) => `<li data-ordering-item-id="${escapePackageAttribute(id)}"><span>${renderPackageInline(labels.get(id) || id)}</span><span class="package-ordering-controls"><button type="button" data-action="ordering-move" data-response-block-key="${key}" data-ordering-item-id="${escapePackageAttribute(id)}" data-ordering-direction="up" aria-label="Mover para cima"${index === 0 ? " disabled" : ""}>↑</button><button type="button" data-action="ordering-move" data-response-block-key="${key}" data-ordering-item-id="${escapePackageAttribute(id)}" data-ordering-direction="down" aria-label="Mover para baixo"${index === order.length - 1 ? " disabled" : ""}>↓</button></span><span class="visually-hidden">Posição ${index + 1}</span></li>`).join("")}</ol></div>`;
    const feedback = feedbackHtml(options.blockKey, options.responseState?.feedback);
    if (Array.isArray(options.dockExerciseParts)) {
      if (feedback) options.dockExerciseParts.push(feedback);
      return body;
    }
    return body + feedback;
  },
  accessibleText(data) { return `${data.prompt} Itens: ${data.items.map(({ label }) => label).join(", ")}.`; },
  editableTargets(data) { return [{ path: "prompt", label: "Editar pergunta" }, ...data.items.map((_, index) => ({ path: `items[${index}].label`, label: `Editar bloco ${index + 1}` }))]; },
  evaluate(data, answer) { const order = Array.isArray(answer?.order) ? answer.order.map(String) : []; return { correct: order.length === data.answerOrder.length && order.every((id, index) => id === data.answerOrder[index]), order, expectedOrder: [...data.answerOrder] }; }
});
