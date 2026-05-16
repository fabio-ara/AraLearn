function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function listCourseForgeSources(input = null) {
  if (Array.isArray(input)) {
    return input.map((item, index) => ({
      sourceId: text(item?.sourceId || item?.id) || `source_${index + 1}`,
      id: text(item?.id || item?.sourceId) || `source_${index + 1}`,
      title: text(item?.title),
      kind: text(item?.kind) || "attachment",
      locator: text(item?.locator),
      priority: Number.isInteger(item?.priority) ? item.priority : index + 1,
      extractedTopics: Array.isArray(item?.extractedTopics) ? item.extractedTopics.map(text).filter(Boolean) : [],
      assessmentSignals: Array.isArray(item?.assessmentSignals) ? item.assessmentSignals.map(text).filter(Boolean) : [],
      notationSignals: Array.isArray(item?.notationSignals) ? item.notationSignals.map(text).filter(Boolean) : [],
      teacherConventions: Array.isArray(item?.teacherConventions) ? item.teacherConventions.map(text).filter(Boolean) : [],
      spans: Array.isArray(item?.spans) ? structuredClone(item.spans) : []
    }));
  }
  if (input && typeof input === "object" && Array.isArray(input.sources)) {
    return listCourseForgeSources(input.sources);
  }
  return [];
}

export function listCourseForgeSourceSpans(input = null) {
  return listCourseForgeSources(input).flatMap((source, sourceIndex) =>
    normalizeArray(source?.spans).map((span, spanIndex) => ({
      spanId: text(span?.spanId) || `${text(source?.sourceId || source?.id) || `source_${sourceIndex + 1}`}:span:${spanIndex + 1}`,
      sourceId: text(source?.sourceId || source?.id) || `source_${sourceIndex + 1}`,
      locator: text(span?.locator || source?.locator),
      text: text(span?.text),
      topics: normalizeArray(span?.topics).map(text).filter(Boolean),
      assessmentSignals: normalizeArray(span?.assessmentSignals).map(text).filter(Boolean),
      notationSignals: normalizeArray(span?.notationSignals).map(text).filter(Boolean),
      teacherConventions: normalizeArray(span?.teacherConventions).map(text).filter(Boolean),
      confidence: ["low", "medium", "high"].includes(text(span?.confidence)) ? text(span?.confidence) : "medium"
    }))
  );
}

export function buildCourseForgeSourceSpanMap(input = null) {
  const map = new Map();
  listCourseForgeSourceSpans(input).forEach((span) => {
    map.set(text(span?.spanId), span);
  });
  return map;
}

export function validateCourseForgeSourceLedger(input = []) {
  const errors = [];
  const seen = new Set();
  const seenSpanIds = new Set();
  const sources = listCourseForgeSources(input).map((item, index) => {
    const id = text(item?.sourceId || item?.id);
    const title = text(item?.title);
    if (!id) {
      errors.push(`sourceLedger[${index}] sem id.`);
    }
    if (!title) {
      errors.push(`sourceLedger[${index}] sem título.`);
    }
    if (id && seen.has(id)) {
      errors.push(`sourceLedger com id duplicado: ${id}.`);
    }
    seen.add(id);
    return {
      sourceId: id,
      id,
      title,
      kind: text(item?.kind) || "attachment",
      locator: text(item?.locator),
      priority: Number.isInteger(item?.priority) ? item.priority : index + 1,
      extractedTopics: Array.isArray(item?.extractedTopics) ? item.extractedTopics.map(text).filter(Boolean) : [],
      assessmentSignals: Array.isArray(item?.assessmentSignals) ? item.assessmentSignals.map(text).filter(Boolean) : [],
      notationSignals: Array.isArray(item?.notationSignals) ? item.notationSignals.map(text).filter(Boolean) : [],
      teacherConventions: Array.isArray(item?.teacherConventions) ? item.teacherConventions.map(text).filter(Boolean) : [],
      spans: (Array.isArray(item?.spans) && item.spans.length ? item.spans : [{ text: text(item?.title), locator: text(item?.locator) }]).map(
        (span, spanIndex) => {
          const spanId = text(span?.spanId) || `${id}:span:${spanIndex + 1}`;
          if (!spanId) {
            errors.push(`sourceLedger[${index}].spans[${spanIndex}] sem spanId.`);
          }
          if (spanId && seenSpanIds.has(spanId)) {
            errors.push(`sourceLedger com spanId duplicado: ${spanId}.`);
          }
          seenSpanIds.add(spanId);
          if (!text(span?.text) && !text(item?.title)) {
            errors.push(`sourceLedger[${index}].spans[${spanIndex}] sem texto utilizável.`);
          }
          return {
            spanId,
            locator: text(span?.locator || item?.locator),
            text: text(span?.text || item?.title),
            topics: Array.isArray(span?.topics) ? span.topics.map(text).filter(Boolean) : [],
            assessmentSignals: Array.isArray(span?.assessmentSignals) ? span.assessmentSignals.map(text).filter(Boolean) : [],
            notationSignals: Array.isArray(span?.notationSignals) ? span.notationSignals.map(text).filter(Boolean) : [],
            teacherConventions: Array.isArray(span?.teacherConventions) ? span.teacherConventions.map(text).filter(Boolean) : [],
            confidence: ["low", "medium", "high"].includes(text(span?.confidence)) ? text(span?.confidence) : "medium"
          };
        }
      )
    };
  });

  return {
    ok: errors.length === 0,
    errors,
    sourceLedger: {
      ledgerId: text(input?.ledgerId) || "courseforge-source-ledger",
      sources,
      summary: {
        sourceCount: sources.length,
        spanCount: listCourseForgeSourceSpans({ sources }).length
      }
    }
  };
}
