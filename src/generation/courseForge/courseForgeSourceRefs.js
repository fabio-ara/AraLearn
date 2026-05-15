function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCourseForgeCardSourceRefs(sourceRefs = [], sourceLedger = []) {
  const ledgerIds = new Set((Array.isArray(sourceLedger) ? sourceLedger : []).map((item) => text(item?.id)).filter(Boolean));
  return (Array.isArray(sourceRefs) ? sourceRefs : [])
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          number: index + 1,
          sourceId: text(item),
          locator: "",
          supportType: "direct",
          confidence: "medium",
          claim: "",
          note: ""
        };
      }
      return {
        number: Number.isInteger(item?.number) ? item.number : index + 1,
        sourceId: text(item?.sourceId),
        locator: text(item?.locator),
        supportType: text(item?.supportType) || "direct",
        confidence: text(item?.confidence) || "medium",
        claim: text(item?.claim),
        note: text(item?.note),
        knownSource: ledgerIds.has(text(item?.sourceId))
      };
    })
    .filter((item) => item.sourceId);
}

export function validateCourseForgeCardSourceRefs(sourceRefs = [], sourceLedger = []) {
  const normalized = normalizeCourseForgeCardSourceRefs(sourceRefs, sourceLedger);
  const errors = [];
  const ledgerIds = new Set((Array.isArray(sourceLedger) ? sourceLedger : []).map((item) => text(item?.id)).filter(Boolean));

  normalized.forEach((item, index) => {
    if (!ledgerIds.has(item.sourceId)) {
      errors.push(`sourceRefs[${index}] aponta para sourceId inexistente: ${item.sourceId}.`);
    }
    if (!["high", "medium", "low"].includes(item.confidence)) {
      errors.push(`sourceRefs[${index}] com confidence inválida: ${item.confidence}.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    normalized,
    publicSourceRefs: normalized.map((item) => item.sourceId)
  };
}
