function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function collectPendingSlots({ cardResult = {}, expectedSlots = [], acceptedSlots = {}, slotErrors = [] } = {}) {
  if (!cardResult || (!cardResult.missing && !cardResult.invalid && !cardResult.duplicate)) {
    const accepted = acceptedSlots && typeof acceptedSlots === "object" ? acceptedSlots : {};
    const errorsBySlot = new Map();
    (Array.isArray(slotErrors) ? slotErrors : []).forEach((entry) => {
      const slotIndex = Number(entry?.slotIndex);
      if (!Number.isInteger(slotIndex)) {
        return;
      }
      errorsBySlot.set(slotIndex, text(entry?.message) || "slot inválido");
    });
    return (Array.isArray(expectedSlots) ? expectedSlots : [])
      .filter((slotIndex) => !(String(slotIndex) in accepted))
      .map((slotIndex) => ({
        slotIndex: Number(slotIndex),
        reason: errorsBySlot.get(Number(slotIndex)) || "slot ausente"
      }));
  }
  const pending = [];
  (Array.isArray(cardResult?.missing) ? cardResult.missing : []).forEach((entry) => {
    pending.push({
      slotIndex: Number(entry.index),
      reason: text(entry.reason) || "slot ausente"
    });
  });
  (Array.isArray(cardResult?.invalid) ? cardResult.invalid : []).forEach((entry) => {
    pending.push({
      slotIndex: Number(entry.index),
      reason: text(entry.reason) || "slot inválido"
    });
  });
  (Array.isArray(cardResult?.duplicate) ? cardResult.duplicate : []).forEach((entry) => {
    pending.push({
      slotIndex: Number(entry.index),
      reason: "slot duplicado"
    });
  });
  return pending.filter((entry, index, list) => list.findIndex((item) => item.slotIndex === entry.slotIndex) === index);
}

export function mergeAcceptedSlots(acceptedSlots = {}, cardResult = {}) {
  return {
    ...(acceptedSlots && typeof acceptedSlots === "object" ? acceptedSlots : {}),
    ...Object.fromEntries(
      Object.entries(cardResult?.accepted || {}).map(([slotIndex, entry]) => [String(slotIndex), entry])
    )
  };
}

export function buildRetryPrompt({
  phase = "",
  cardIndex = 0,
  pendingSlots = [],
  slotSchema = [],
  duplicate = [],
  extra = []
} = {}) {
  const schemaByIndex = new Map((Array.isArray(slotSchema) ? slotSchema : []).map((item) => [Number(item.index), item]));
  const requestedLines = (Array.isArray(pendingSlots) ? pendingSlots : []).map((item) => {
    const slot = schemaByIndex.get(Number(item.slotIndex));
    return `- ${item.slotIndex}: ${text(slot?.label) || "slot"} (${text(item.reason) || "corrigir"})`;
  });
  const duplicateLines = (Array.isArray(duplicate) ? duplicate : []).map((item) => `- ${Number(item.index)}: slot duplicado; responda uma única vez`);
  const extraLines = (Array.isArray(extra) ? extra : []).map((item) => `- ${Number(item.index)}: slot não solicitado; não repita`);
  return [
    `RETRY ${phase || "slot_fill"}`,
    `CARD ${Number(cardIndex) || 0}`,
    "Responda somente com os slots pendentes desta rodada.",
    ...(requestedLines.length ? ["Pendências:", ...requestedLines] : []),
    ...(duplicateLines.length ? ["Duplicidades rejeitadas:", ...duplicateLines] : []),
    ...(extraLines.length ? ["Slots extras rejeitados:", ...extraLines] : []),
    "Formato obrigatório:",
    ...(Array.isArray(pendingSlots) ? pendingSlots : []).map((item) => `${item.slotIndex}: ...`)
  ].join("\n");
}
