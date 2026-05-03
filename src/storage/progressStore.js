function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== "").map((value) => value.trim()))];
}

function normalizeProgressEntry(entry) {
  if (!isPlainObject(entry)) return null;

  const cursor = Number.isInteger(entry.cursor) && entry.cursor >= 0 ? entry.cursor : 0;
  const completedCardKeys = uniqueStrings(Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys : []);
  const updatedAt = typeof entry.updatedAt === "string" && entry.updatedAt.trim() ? entry.updatedAt.trim() : null;

  return {
    cursor,
    completedCardKeys,
    ...(updatedAt ? { updatedAt } : {})
  };
}

export function normalizeProgressDocument(progressDocument) {
  if (!isPlainObject(progressDocument)) {
    return {
      version: 1,
      lessons: {}
    };
  }

  const lessons = isPlainObject(progressDocument.lessons) ? progressDocument.lessons : {};
  const normalizedLessons = {};

  for (const [lessonKey, value] of Object.entries(lessons)) {
    const normalizedEntry = normalizeProgressEntry(value);
    if (normalizedEntry) {
      normalizedLessons[lessonKey] = normalizedEntry;
    }
  }

  return {
    version: 1,
    lessons: normalizedLessons
  };
}

export function serializeProgressDocument(progressDocument) {
  return JSON.stringify(normalizeProgressDocument(progressDocument), null, 2);
}

export function parseProgressDocument(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return normalizeProgressDocument(null);
  }

  return normalizeProgressDocument(JSON.parse(rawValue));
}
