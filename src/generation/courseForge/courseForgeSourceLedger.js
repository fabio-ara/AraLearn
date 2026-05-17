function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeClaimText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeClaimText(value) {
  return [...new Set(
    normalizeClaimText(value)
      .split(/[^a-z0-9_]+/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .filter((item) => !new Set(["para", "com", "uma", "das", "dos", "que", "por", "ser", "sao", "são"]).has(item))
  )];
}

function splitSpanClaims(value = "") {
  const normalized = text(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((item) => text(item))
    .filter(Boolean);
}

function normalizeSpanClaims(span = {}, sourceId = "", spanId = "", fallbackText = "") {
  const explicitClaims = normalizeArray(span?.claims);
  const baseClaims = explicitClaims.length
    ? explicitClaims
    : splitSpanClaims(text(span?.text || fallbackText)).map((claimText) => ({ text: claimText }));
  return baseClaims
    .map((claim, index) => {
      const claimText = text(claim?.text || claim);
      const tokens = tokenizeClaimText(claimText);
      if (!claimText || tokens.length < 4) {
        return null;
      }
      return {
        claimId: text(claim?.claimId) || `${spanId || `${sourceId}:span:1`}:claim:${index + 1}`,
        sourceId,
        spanId,
        text: claimText,
        normalizedText: normalizeClaimText(claimText),
        tokens,
        confidence: ["low", "medium", "high"].includes(text(claim?.confidence)) ? text(claim?.confidence) : "medium"
      };
    })
    .filter(Boolean);
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
      blockType: text(span?.blockType) || "paragraph",
      instructionalRole: text(span?.instructionalRole),
      topics: normalizeArray(span?.topics).map(text).filter(Boolean),
      assessmentSignals: normalizeArray(span?.assessmentSignals).map(text).filter(Boolean),
      notationSignals: normalizeArray(span?.notationSignals).map(text).filter(Boolean),
      teacherConventions: normalizeArray(span?.teacherConventions).map(text).filter(Boolean),
      confidence: ["low", "medium", "high"].includes(text(span?.confidence)) ? text(span?.confidence) : "medium"
    }))
  );
}

export function listCourseForgeSourceClaims(input = null) {
  return listCourseForgeSources(input).flatMap((source, sourceIndex) =>
    normalizeArray(source?.spans).flatMap((span, spanIndex) => {
      const sourceId = text(source?.sourceId || source?.id) || `source_${sourceIndex + 1}`;
      const spanId = text(span?.spanId) || `${sourceId}:span:${spanIndex + 1}`;
      return normalizeSpanClaims(span, sourceId, spanId, text(span?.text)).map((claim, claimIndex) => ({
        claimId: text(claim?.claimId) || `${spanId}:claim:${claimIndex + 1}`,
        sourceId,
        spanId,
        text: text(claim?.text),
        normalizedText: text(claim?.normalizedText) || normalizeClaimText(claim?.text),
        tokens: normalizeArray(claim?.tokens).map(text).filter(Boolean),
        confidence: ["low", "medium", "high"].includes(text(claim?.confidence)) ? text(claim?.confidence) : "medium"
      }));
    })
  );
}

export function buildCourseForgeSourceSpanMap(input = null) {
  const map = new Map();
  listCourseForgeSourceSpans(input).forEach((span) => {
    map.set(text(span?.spanId), span);
  });
  return map;
}

export function buildCourseForgeSourceClaimMap(input = null) {
  const map = new Map();
  listCourseForgeSourceClaims(input).forEach((claim) => {
    map.set(text(claim?.claimId), claim);
  });
  return map;
}

export function validateCourseForgeSourceLedger(input = []) {
  const errors = [];
  const seen = new Set();
  const seenSpanIds = new Set();
  const seenClaimIds = new Set();
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
            blockType: text(span?.blockType) || "paragraph",
            instructionalRole: text(span?.instructionalRole),
            topics: Array.isArray(span?.topics) ? span.topics.map(text).filter(Boolean) : [],
            assessmentSignals: Array.isArray(span?.assessmentSignals) ? span.assessmentSignals.map(text).filter(Boolean) : [],
            notationSignals: Array.isArray(span?.notationSignals) ? span.notationSignals.map(text).filter(Boolean) : [],
            teacherConventions: Array.isArray(span?.teacherConventions) ? span.teacherConventions.map(text).filter(Boolean) : [],
            confidence: ["low", "medium", "high"].includes(text(span?.confidence)) ? text(span?.confidence) : "medium",
            claims: normalizeSpanClaims(span, id, spanId, text(span?.text || item?.title)).map((claim) => {
              if (seenClaimIds.has(claim.claimId)) {
                errors.push(`sourceLedger com claimId duplicado: ${claim.claimId}.`);
              }
              seenClaimIds.add(claim.claimId);
              return claim;
            })
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
        spanCount: listCourseForgeSourceSpans({ sources }).length,
        claimCount: listCourseForgeSourceClaims({ sources }).length
      }
    }
  };
}
