import { buildCourseForgeSourceSpanMap, listCourseForgeSources } from "./courseForgeSourceLedger.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const TRANSFORMATION_STATES = new Set([
  "literal",
  "paraphrase",
  "inference",
  "application",
  "example",
  "external_enrichment",
  "unsupported",
  "contradicted"
]);

export function normalizeCourseForgeCardSourceRefs(sourceRefs = [], sourceLedger = []) {
  const ledgerIds = new Set(listCourseForgeSources(sourceLedger).map((item) => text(item?.sourceId || item?.id)).filter(Boolean));
  const spansById = buildCourseForgeSourceSpanMap(sourceLedger);
  const firstSpanIdBySourceId = new Map();
  [...spansById.values()].forEach((span) => {
    const sourceId = text(span?.sourceId);
    if (sourceId && !firstSpanIdBySourceId.has(sourceId)) {
      firstSpanIdBySourceId.set(sourceId, text(span?.spanId));
    }
  });
  return (Array.isArray(sourceRefs) ? sourceRefs : [])
    .map((item, index) => {
      if (typeof item === "string") {
        const defaultSourceId = text(item);
        const defaultSpanId = firstSpanIdBySourceId.get(defaultSourceId) || "";
        return {
          number: index + 1,
          sourceId: defaultSourceId,
          spanId: text(defaultSpanId),
          locator: "",
          supportType: "direct",
          confidence: "medium",
          transformationState: "paraphrase",
          claim: "",
          note: ""
        };
      }
      const explicitSpanId = text(item?.spanId);
      const inferredSourceId = explicitSpanId ? text(spansById.get(explicitSpanId)?.sourceId) : "";
      const sourceId = text(item?.sourceId) || inferredSourceId;
      const spanId = explicitSpanId || firstSpanIdBySourceId.get(sourceId) || "";
      const transformationState = TRANSFORMATION_STATES.has(text(item?.transformationState))
        ? text(item?.transformationState)
        : "paraphrase";
      return {
        number: Number.isInteger(item?.number) ? item.number : index + 1,
        sourceId,
        spanId,
        locator: text(item?.locator),
        supportType: text(item?.supportType) || "direct",
        confidence: text(item?.confidence) || "medium",
        transformationState,
        claim: text(item?.claim),
        note: text(item?.note),
        knownSource: ledgerIds.has(sourceId),
        knownSpan: spanId ? spansById.has(spanId) : false
      };
    })
    .filter((item) => item.sourceId || item.transformationState === "external_enrichment");
}

export function validateCourseForgeCardSourceRefs(sourceRefs = [], sourceLedger = []) {
  const normalized = normalizeCourseForgeCardSourceRefs(sourceRefs, sourceLedger);
  const errors = [];
  const ledgerIds = new Set(listCourseForgeSources(sourceLedger).map((item) => text(item?.sourceId || item?.id)).filter(Boolean));
  const spansById = buildCourseForgeSourceSpanMap(sourceLedger);

  normalized.forEach((item, index) => {
    if (item.transformationState !== "external_enrichment" && !ledgerIds.has(item.sourceId)) {
      errors.push(`sourceRefs[${index}] aponta para sourceId inexistente: ${item.sourceId}.`);
    }
    if (!["high", "medium", "low"].includes(item.confidence)) {
      errors.push(`sourceRefs[${index}] com confidence inválida: ${item.confidence}.`);
    }
    if (!TRANSFORMATION_STATES.has(item.transformationState)) {
      errors.push(`sourceRefs[${index}] com transformationState inválido: ${item.transformationState}.`);
    }
    if (item.transformationState !== "external_enrichment" && !item.spanId) {
      errors.push(`sourceRefs[${index}] sem spanId para o suporte declarado.`);
    }
    if (item.spanId && !spansById.has(item.spanId)) {
      errors.push(`sourceRefs[${index}] aponta para spanId inexistente: ${item.spanId}.`);
    }
    if (item.spanId && item.sourceId && spansById.has(item.spanId) && text(spansById.get(item.spanId)?.sourceId) !== text(item.sourceId)) {
      errors.push(`sourceRefs[${index}] mistura sourceId e spanId de fontes diferentes.`);
    }
    if (item.transformationState === "external_enrichment" && !item.note) {
      errors.push(`sourceRefs[${index}] com external_enrichment precisa de note.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    normalized,
    publicSourceRefs: [...new Set(normalized.map((item) => item.sourceId).filter(Boolean))]
  };
}
