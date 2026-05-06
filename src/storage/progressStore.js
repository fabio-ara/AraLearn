function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeProgressReference(reference) {
  if (typeof reference === "string" && reference.trim() !== "") {
    return { lessonKey: reference.trim() };
  }

  if (!isPlainObject(reference)) {
    return null;
  }

  const courseKey =
    typeof reference.courseKey === "string" && reference.courseKey.trim() !== ""
      ? reference.courseKey.trim()
      : "";
  const moduleKey =
    typeof reference.moduleKey === "string" && reference.moduleKey.trim() !== ""
      ? reference.moduleKey.trim()
      : "";
  const lessonKey =
    typeof reference.lessonKey === "string" && reference.lessonKey.trim() !== ""
      ? reference.lessonKey.trim()
      : "";

  if (!lessonKey) {
    return null;
  }

  return {
    courseKey,
    moduleKey,
    lessonKey
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== "").map((value) => value.trim()))];
}

export function buildLessonProgressKey(reference) {
  const normalized = normalizeProgressReference(reference);
  if (!normalized) {
    return "";
  }

  if (normalized.courseKey && normalized.moduleKey) {
    return `${normalized.courseKey}::${normalized.moduleKey}::${normalized.lessonKey}`;
  }

  return normalized.lessonKey;
}

export function listLessonProgressKeys(reference) {
  const normalized = normalizeProgressReference(reference);
  if (!normalized) {
    return [];
  }

  const keys = [];
  const pathKey = buildLessonProgressKey(normalized);
  if (pathKey) {
    keys.push(pathKey);
  }
  if (normalized.lessonKey && normalized.lessonKey !== pathKey) {
    keys.push(normalized.lessonKey);
  }

  return keys;
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

export function readLessonProgressEntry(progressDocument, reference) {
  const normalized = normalizeProgressDocument(progressDocument);
  const lessons = normalized.lessons || {};

  for (const key of listLessonProgressKeys(reference)) {
    if (lessons[key]) {
      return lessons[key];
    }
  }

  return null;
}

export function getLessonProgressCursor(progressDocument, reference, totalCards = 0) {
  const entry = readLessonProgressEntry(progressDocument, reference);
  if (!entry) {
    return 0;
  }

  const maxIndex = Math.max(0, Number(totalCards || 0) - 1);
  const safeCursor = Number.isInteger(entry.cursor) && entry.cursor >= 0 ? entry.cursor : 0;
  return Math.max(0, Math.min(safeCursor, maxIndex));
}

export function writeLessonProgressEntry(progressDocument, reference, cards = [], reachedIndex = 0) {
  const normalized = normalizeProgressDocument(progressDocument);
  const normalizedCards = Array.isArray(cards) ? cards.filter((card) => card && typeof card.key === "string" && card.key.trim() !== "") : [];
  if (!normalizedCards.length) {
    return normalized;
  }

  const pathKey = buildLessonProgressKey(reference);
  if (!pathKey) {
    return normalized;
  }

  const nextLessons = { ...(normalized.lessons || {}) };
  const previous = readLessonProgressEntry(normalized, reference);
  const previousCursor = previous && Number.isInteger(previous.cursor) && previous.cursor >= 0 ? previous.cursor : 0;
  const safeReachedIndex = Math.max(0, Math.min(Number.isInteger(reachedIndex) ? reachedIndex : 0, normalizedCards.length - 1));
  const furthestCursor = Math.max(previousCursor, safeReachedIndex);

  nextLessons[pathKey] = {
    cursor: furthestCursor,
    completedCardKeys: normalizedCards.slice(0, furthestCursor + 1).map((card) => card.key.trim()),
    updatedAt: new Date().toISOString()
  };

  for (const legacyKey of listLessonProgressKeys(reference)) {
    if (legacyKey && legacyKey !== pathKey) {
      delete nextLessons[legacyKey];
    }
  }

  return {
    version: 1,
    lessons: nextLessons
  };
}

export function removeLessonProgressEntries(progressDocument, lessonReferences = []) {
  const normalized = normalizeProgressDocument(progressDocument);
  const blockedKeys = new Set(
    (Array.isArray(lessonReferences) ? lessonReferences : []).flatMap((reference) => listLessonProgressKeys(reference))
  );

  if (!blockedKeys.size) {
    return normalized;
  }

  const nextLessons = {};
  for (const [lessonKey, entry] of Object.entries(normalized.lessons)) {
    if (!blockedKeys.has(lessonKey)) {
      nextLessons[lessonKey] = entry;
    }
  }

  return {
    version: 1,
    lessons: nextLessons
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
