import { validateBlockGapFill, validateTreeResource } from "../resources/cardResourceDefinitions.js";

function getCards(response) {
  if (typeof response === "string") {
    try {
      return getCards(JSON.parse(response));
    } catch {
      return null;
    }
  }
  return Array.isArray(response?.cards) ? response.cards : null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateMultipleChoice(card, errors) {
  const options = Array.isArray(card.options) ? card.options : [];
  if (options.length < 3 || options.length > 4) errors.push("multiple_choice deve ter 3 ou 4 alternativas.");
  const ids = new Set(options.map((item) => item?.optionId).filter(Boolean));
  if (!ids.has(card.correctOptionId)) errors.push("correctOptionId deve apontar para uma alternativa existente.");
}

function validateTable(card, errors) {
  const columns = Array.isArray(card.columns) ? card.columns : [];
  const rows = Array.isArray(card.rows) ? card.rows : [];
  if (!columns.length || columns.length > 4) errors.push("table deve ter poucas colunas.");
  if (!rows.length || rows.length > 6) errors.push("table deve ter poucas linhas.");
  rows.forEach((row) => {
    if (!Array.isArray(row) || row.length !== columns.length) errors.push("Cada linha da tabela deve acompanhar as colunas.");
  });
}

function validateCardByResource(card, errors) {
  if (!normalizeText(card.title)) errors.push("Card sem title.");
  if (card.resourceType === "paragraph" && !normalizeText(card.text)) errors.push("paragraph sem text.");
  if (card.resourceType === "multiple_choice") validateMultipleChoice(card, errors);
  if (card.resourceType === "code_editor" && (!normalizeText(card.language) || !normalizeText(card.code))) errors.push("code_editor sem language ou code.");
  if (card.resourceType === "table") validateTable(card, errors);
  if (card.resourceType === "flowchart" && (!Array.isArray(card.nodes) || !Array.isArray(card.edges))) errors.push("flowchart sem nodes ou edges.");
  if (card.resourceType === "block_gap_fill") errors.push(...validateBlockGapFill(card));
  if (card.resourceType === "tree") errors.push(...validateTreeResource(card));
}

export function validateGeneratedCards(response, generationContract) {
  const cards = getCards(response);
  const errors = [];
  if (!cards) return { ok: false, errors: ["JSON de cards inválido."] };
  const expectedCount = generationContract?.output?.expectedCardCount || 0;
  if (cards.length !== expectedCount) errors.push("Quantidade incorreta de cards.");
  const allowed = new Set(generationContract?.resources?.allowedResourceTypes || []);
  const plannedPositions = new Set((generationContract?.didacticPlan?.cardPlan || []).map((item) => item.position));
  const seenPositions = new Set();
  const seenText = new Set();

  cards.forEach((card) => {
    if (!plannedPositions.has(card?.position) || seenPositions.has(card?.position)) errors.push("position incoerente com cardPlan.");
    seenPositions.add(card?.position);
    if (!allowed.has(card?.resourceType)) errors.push(`Recurso fora do permitido: ${card?.resourceType || ""}.`);
    validateCardByResource(card, errors);
    const comparable = normalizeText(card?.text || card?.question || card?.prompt || card?.code || card?.title).toLowerCase();
    if (comparable && seenText.has(comparable)) errors.push("Duplicação textual grosseira.");
    if (comparable) seenText.add(comparable);
  });

  return errors.length ? { ok: false, errors } : { ok: true, cards };
}
