function normalizeTopic(value) {
  return String(value || "").trim();
}

export function splitGenerationTopics(rawValue) {
  return String(rawValue || "")
    .split(/\r?\n/)
    .map((item) => normalizeTopic(item))
    .filter(Boolean);
}

export function mergeGenerationTopics(currentTopics = [], oppositeTopics = [], rawValue = "") {
  const nextEntries = splitGenerationTopics(rawValue);
  if (!nextEntries.length) {
    return null;
  }

  const nextSet = new Set((Array.isArray(currentTopics) ? currentTopics : []).map((item) => normalizeTopic(item)).filter(Boolean));
  nextEntries.forEach((item) => nextSet.add(item));
  const nextTopics = Array.from(nextSet);
  const blocked = new Set(nextEntries);
  const filteredOppositeTopics = (Array.isArray(oppositeTopics) ? oppositeTopics : []).filter(
    (item) => !blocked.has(normalizeTopic(item))
  );

  return {
    nextTopics,
    filteredOppositeTopics
  };
}

