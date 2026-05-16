function text(value) {
  return typeof value === "string" ? value.trim() : "";
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

export function validateCourseForgeSourceLedger(input = []) {
  const errors = [];
  const seen = new Set();
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
      spans: Array.isArray(item?.spans)
        ? item.spans.map((span, spanIndex) => ({
            spanId: text(span?.spanId) || `${id}:span:${spanIndex + 1}`,
            locator: text(span?.locator || item?.locator),
            text: text(span?.text),
            topics: Array.isArray(span?.topics) ? span.topics.map(text).filter(Boolean) : [],
            assessmentSignals: Array.isArray(span?.assessmentSignals)
              ? span.assessmentSignals.map(text).filter(Boolean)
              : [],
            notationSignals: Array.isArray(span?.notationSignals) ? span.notationSignals.map(text).filter(Boolean) : [],
            teacherConventions: Array.isArray(span?.teacherConventions)
              ? span.teacherConventions.map(text).filter(Boolean)
              : [],
            confidence: ["low", "medium", "high"].includes(text(span?.confidence)) ? text(span?.confidence) : "medium"
          }))
        : []
    };
  });

  return {
    ok: errors.length === 0,
    errors,
    sourceLedger: {
      ledgerId: text(input?.ledgerId) || "courseforge-source-ledger",
      sources,
      summary: {
        sourceCount: sources.length
      }
    }
  };
}
