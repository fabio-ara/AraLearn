const PROGRESS_VERSION = 1;
const PROGRESS_FIELDS = new Set(["version", "lessons"]);
const PROGRESS_ENTRY_FIELDS = new Set(["cursor", "completedCardKeys", "updatedAt"]);
const PROGRESS_REFERENCE_FIELDS = new Set(["courseKey", "moduleKey", "lessonKey"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new Error(`Documento de progresso inválido: ${message}`);
}

function assertPlainObject(value, path) {
  if (!isPlainObject(value)) {
    fail(`${path} deve ser um objeto.`);
  }
}

function assertKnownFields(value, allowedFields, path) {
  const unknownField = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unknownField) {
    fail(`${path}.${unknownField} não pertence ao contrato.`);
  }
}

function readRequiredText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${path} deve ser uma string não vazia.`);
  }
  if (value !== value.trim()) {
    fail(`${path} não pode conter espaços externos.`);
  }
  return value;
}

function validateProgressReference(reference) {
  assertPlainObject(reference, "reference");
  assertKnownFields(reference, PROGRESS_REFERENCE_FIELDS, "reference");
  return {
    courseKey: readRequiredText(reference.courseKey, "reference.courseKey"),
    moduleKey: readRequiredText(reference.moduleKey, "reference.moduleKey"),
    lessonKey: readRequiredText(reference.lessonKey, "reference.lessonKey")
  };
}

function validateProgressPathKey(pathKey) {
  const normalized = readRequiredText(pathKey, "lessons.<chave>");
  const segments = normalized.split("::");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    fail(`chave de lição inválida: "${normalized}".`);
  }
  segments.forEach((segment, index) => readRequiredText(segment, `lessons.<chave>[${index}]`));
  return normalized;
}

function validateCompletedCardKeys(value, path) {
  if (!Array.isArray(value)) {
    fail(`${path} deve ser uma lista.`);
  }

  const keys = value.map((item, index) => readRequiredText(item, `${path}[${index}]`));
  if (new Set(keys).size !== keys.length) {
    fail(`${path} não pode conter ids duplicados.`);
  }
  return keys;
}

function validateProgressEntry(entry, path) {
  assertPlainObject(entry, path);
  assertKnownFields(entry, PROGRESS_ENTRY_FIELDS, path);
  if (!Number.isInteger(entry.cursor) || entry.cursor < 0) {
    fail(`${path}.cursor deve ser um inteiro não negativo.`);
  }

  const completedCardKeys = validateCompletedCardKeys(entry.completedCardKeys, `${path}.completedCardKeys`);
  if (completedCardKeys.length !== entry.cursor + 1) {
    fail(`${path}.completedCardKeys deve registrar exatamente os cards até o cursor.`);
  }
  const updatedAt = entry.updatedAt === undefined
    ? null
    : readRequiredText(entry.updatedAt, `${path}.updatedAt`);
  if (updatedAt) {
    const parsedDate = new Date(updatedAt);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString() !== updatedAt) {
      fail(`${path}.updatedAt deve usar o formato ISO UTC.`);
    }
  }

  return {
    cursor: entry.cursor,
    completedCardKeys,
    ...(updatedAt ? { updatedAt } : {})
  };
}

function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new TypeError("A gravação de progresso exige uma lista não vazia de cards.");
  }

  const ids = cards.map((card, index) => {
    if (!isPlainObject(card)) {
      throw new TypeError(`Card inválido na posição ${index}.`);
    }
    return readRequiredText(card.id, `cards[${index}].id`);
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("A gravação de progresso não aceita ids de card duplicados.");
  }
  return ids;
}

export function createEmptyProgressDocument() {
  return {
    version: PROGRESS_VERSION,
    lessons: {}
  };
}

function validateProgressEnvelope(progressDocument) {
  assertPlainObject(progressDocument, "$");
  assertKnownFields(progressDocument, PROGRESS_FIELDS, "$");
  if (progressDocument.version !== PROGRESS_VERSION) {
    fail(`$.version deve ser ${PROGRESS_VERSION}.`);
  }
  assertPlainObject(progressDocument.lessons, "$.lessons");
}

export function validateProgressDocument(progressDocument) {
  validateProgressEnvelope(progressDocument);

  const lessons = {};
  for (const [rawPathKey, entry] of Object.entries(progressDocument.lessons)) {
    const pathKey = validateProgressPathKey(rawPathKey);
    lessons[pathKey] = validateProgressEntry(entry, `$.lessons[${JSON.stringify(pathKey)}]`);
  }

  return {
    version: PROGRESS_VERSION,
    lessons
  };
}

export function buildLessonProgressKey(reference) {
  const normalized = validateProgressReference(reference);
  return `${normalized.courseKey}::${normalized.moduleKey}::${normalized.lessonKey}`;
}

export function readLessonProgressEntry(progressDocument, reference) {
  validateProgressEnvelope(progressDocument);
  const pathKey = buildLessonProgressKey(reference);
  const entry = progressDocument.lessons[pathKey];
  return entry === undefined ? null : validateProgressEntry(entry, `$.lessons[${JSON.stringify(pathKey)}]`);
}

export function getLessonProgressCursor(progressDocument, reference, totalCards = 0) {
  if (!Number.isInteger(totalCards) || totalCards < 0) {
    throw new TypeError("A quantidade de cards deve ser um inteiro não negativo.");
  }
  const entry = readLessonProgressEntry(progressDocument, reference);
  if (!entry || totalCards === 0) {
    return 0;
  }
  return Math.min(entry.cursor, totalCards - 1);
}

export function writeLessonProgressEntry(progressDocument, reference, cards, reachedIndex) {
  const validated = validateProgressDocument(progressDocument);
  const pathKey = buildLessonProgressKey(reference);
  const cardIds = validateCards(cards);
  if (!Number.isInteger(reachedIndex) || reachedIndex < 0) {
    throw new TypeError("O índice alcançado deve ser um inteiro não negativo.");
  }

  const previousCursor = validated.lessons[pathKey]?.cursor || 0;
  const lastCardIndex = cardIds.length - 1;
  const furthestCursor = Math.min(Math.max(previousCursor, reachedIndex), lastCardIndex);
  return {
    version: PROGRESS_VERSION,
    lessons: {
      ...validated.lessons,
      [pathKey]: {
        cursor: furthestCursor,
        completedCardKeys: cardIds.slice(0, furthestCursor + 1),
        updatedAt: new Date().toISOString()
      }
    }
  };
}

export function removeLessonProgressEntries(progressDocument, lessonReferences = []) {
  const validated = validateProgressDocument(progressDocument);
  if (!Array.isArray(lessonReferences)) {
    throw new TypeError("As referências de progresso devem formar uma lista.");
  }
  const blockedKeys = new Set(lessonReferences.map((reference) => buildLessonProgressKey(reference)));
  const lessons = Object.fromEntries(
    Object.entries(validated.lessons).filter(([pathKey]) => !blockedKeys.has(pathKey))
  );
  return {
    version: PROGRESS_VERSION,
    lessons
  };
}

export function truncateLessonProgressFromCardKeys(progressDocument, reference, cardKeys = []) {
  const validated = validateProgressDocument(progressDocument);
  const pathKey = buildLessonProgressKey(reference);
  const current = validated.lessons[pathKey];
  if (!current) return validated;
  const resetTargets = new Set(
    (Array.isArray(cardKeys) ? cardKeys : []).map((value) => String(value || "").trim()).filter(Boolean)
  );
  const resetIndex = current.completedCardKeys.findIndex((key) => resetTargets.has(key));
  if (resetIndex < 0) return validated;

  const completedCardKeys = current.completedCardKeys.slice(0, resetIndex);
  const lessons = { ...validated.lessons };
  if (!completedCardKeys.length) {
    delete lessons[pathKey];
  } else {
    lessons[pathKey] = {
      cursor: completedCardKeys.length - 1,
      completedCardKeys,
      updatedAt: new Date().toISOString()
    };
  }
  return { version: PROGRESS_VERSION, lessons };
}
