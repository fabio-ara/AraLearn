function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTopicRef(item, index) {
  if (typeof item === "string") {
    const label = text(item);
    return label ? { refKey: label, label, source: "topic" } : null;
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const label = text(item.label || item.title || item.name || item.refKey || item.tagId || item.id || item.key);
  const refKey = text(item.refKey || item.microsequenceKey || item.tagId || item.id || item.key || label || `topic-${index + 1}`);
  const source = text(item.source) || (item.microsequenceKey ? "microsequence" : "topic");
  if (!refKey && !label) {
    return null;
  }

  return {
    refKey: refKey || label,
    label: label || refKey,
    source
  };
}

export function normalizeSelectedLessonTopicRefs(input = {}) {
  const selected =
    input.selectedLessonTopicRefs ||
    input.selectedLessonScopeTagRefs ||
    input.selectedLessonTagRefs ||
    input.selectedLessonTags ||
    input.lessonTags ||
    [];
  const refs = (Array.isArray(selected) ? selected : [])
    .map((item, index) => normalizeTopicRef(item, index))
    .filter(Boolean);

  const available = (Array.isArray(input.availableLessonTopics) ? input.availableLessonTopics : [])
    .map((item, index) => normalizeTopicRef(item, index))
    .filter(Boolean);
  const availableKeys = new Set(available.map((item) => item.refKey));
  const availableLabels = new Set(available.map((item) => item.label.toLowerCase()));
  const shouldFilterByScope = available.length > 0;
  const seen = new Set();

  return refs.filter((ref) => {
    const key = `${ref.source}:${ref.refKey}`;
    if (!ref.refKey || seen.has(key)) {
      return false;
    }
    seen.add(key);
    if (!shouldFilterByScope) {
      return true;
    }
    return availableKeys.has(ref.refKey) || availableLabels.has(ref.label.toLowerCase());
  });
}

export function buildLessonTopicRefsFromMicrosequences(microsequences = []) {
  const topics = [];
  (Array.isArray(microsequences) ? microsequences : []).forEach((microsequence) => {
    const refKey = text(microsequence?.key);
    const title = text(microsequence?.title || microsequence?.key);
    if (refKey && title) {
      topics.push({ refKey, label: title, source: "microsequence" });
    }
    (Array.isArray(microsequence?.tags) ? microsequence.tags : []).forEach((tag, index) => {
      const label = text(tag);
      if (label) {
        topics.push({ refKey: `${refKey || title}::tag-${index + 1}`, label, source: "microsequence" });
      }
    });
  });
  return topics;
}
