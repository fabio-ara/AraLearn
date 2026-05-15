function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateCourseForgeSourceLedger(input = []) {
  const errors = [];
  const seen = new Set();
  const sourceLedger = (Array.isArray(input) ? input : []).map((item, index) => {
    const id = text(item?.id);
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
      id,
      title,
      kind: text(item?.kind) || "attachment",
      locator: text(item?.locator),
      priority: Number.isInteger(item?.priority) ? item.priority : index + 1,
      extractedTopics: Array.isArray(item?.extractedTopics) ? item.extractedTopics.map(text).filter(Boolean) : [],
      assessmentSignals: Array.isArray(item?.assessmentSignals) ? item.assessmentSignals.map(text).filter(Boolean) : [],
      notationSignals: Array.isArray(item?.notationSignals) ? item.notationSignals.map(text).filter(Boolean) : [],
      teacherConventions: Array.isArray(item?.teacherConventions) ? item.teacherConventions.map(text).filter(Boolean) : []
    };
  });

  return {
    ok: errors.length === 0,
    errors,
    sourceLedger
  };
}
