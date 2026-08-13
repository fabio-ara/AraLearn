export const CARD_ASSISTANCE_CONVERSATION_CONTRACT =
  "aralearn.card-assistance-conversation.v1";

const MAX_TURNS = 8;
const MAX_TURN_TEXT = 3000;
const MAX_CONTEXT_CHARACTERS = 12000;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function cardAssistanceConversationKey(selection = {}) {
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey", "cardKey"]
    .map((field) => text(selection[field]))
    .join("::");
}

export function normalizeCardAssistanceConversation(value = {}, selection = {}) {
  const key = cardAssistanceConversationKey(selection);
  const turns = Array.isArray(value?.turns)
    ? value.turns.slice(-MAX_TURNS).map((turn) => ({
        request: text(turn?.request).slice(0, MAX_TURN_TEXT),
        scope: turn?.scope === "card" ? "card" : "resources",
        targetIds: Array.isArray(turn?.targetIds)
          ? turn.targetIds.map(text).filter(Boolean).slice(0, 24)
          : [],
        outcome: "applied",
        modelId: text(turn?.modelId).slice(0, 200)
      })).filter(({ request }) => request)
    : [];
  return {
    contract: CARD_ASSISTANCE_CONVERSATION_CONTRACT,
    referenceKey: key,
    turns
  };
}

export function appendCardAssistanceConversationTurn(value, selection, turn) {
  const normalized = normalizeCardAssistanceConversation(value, selection);
  return normalizeCardAssistanceConversation({
    ...normalized,
    turns: [...normalized.turns, turn]
  }, selection);
}

export function cardAssistanceConversationContext(value, selection) {
  const normalized = normalizeCardAssistanceConversation(value, selection);
  const turns = normalized.turns.map((turn, index) => ({
    turn: index + 1,
    userRequest: turn.request,
    appliedTo: turn.scope === "card" ? ["card"] : turn.targetIds,
    result: "A alteração foi validada e já está refletida no currentCard."
  }));
  while (JSON.stringify(turns).length > MAX_CONTEXT_CHARACTERS && turns.length > 1) {
    turns.shift();
  }
  return turns;
}
