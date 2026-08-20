const PROGRESS_VERSION = 1;
const PROGRESS_FIELDS = new Set(["version", "lessons"]);
const PROGRESS_ENTRY_FIELDS = new Set([
  "cursorStudyUnitId",
  "completedStudyUnitIds",
  "updatedAt"
]);
const PROGRESS_REFERENCE_FIELDS = new Set(["courseId", "moduleId", "lessonId"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new Error(`Documento de progresso inválido: ${message}`);
}

function assertPlainObject(value, path) {
  if (!isPlainObject(value)) fail(`${path} deve ser um objeto.`);
}

function assertKnownFields(value, allowedFields, path) {
  const unknownField = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unknownField) fail(`${path}.${unknownField} não pertence ao contrato.`);
}

function readRequiredText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${path} deve ser uma string não vazia.`);
  }
  if (value !== value.trim()) fail(`${path} não pode conter espaços externos.`);
  return value;
}

function validateProgressReference(reference) {
  assertPlainObject(reference, "reference");
  assertKnownFields(reference, PROGRESS_REFERENCE_FIELDS, "reference");
  return {
    courseId: readRequiredText(reference.courseId, "reference.courseId"),
    moduleId: readRequiredText(reference.moduleId, "reference.moduleId"),
    lessonId: readRequiredText(reference.lessonId, "reference.lessonId")
  };
}

function validateProgressPath(pathValue) {
  const normalized = readRequiredText(pathValue, "lessons.<caminho>");
  const segments = normalized.split("::");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    fail(`caminho de Lição inválido: "${normalized}".`);
  }
  segments.forEach((segment, index) =>
    readRequiredText(segment, `lessons.<caminho>[${index}]`));
  return normalized;
}

function validateStudyUnitIds(value, path) {
  if (!Array.isArray(value)) fail(`${path} deve ser uma lista.`);
  const ids = value.map((item, index) => readRequiredText(item, `${path}[${index}]`));
  if (new Set(ids).size !== ids.length) fail(`${path} não pode conter ids duplicados.`);
  return ids;
}

function validateProgressEntry(entry, path) {
  assertPlainObject(entry, path);
  assertKnownFields(entry, PROGRESS_ENTRY_FIELDS, path);
  const completedStudyUnitIds = validateStudyUnitIds(
    entry.completedStudyUnitIds,
    `${path}.completedStudyUnitIds`
  );
  if (!completedStudyUnitIds.length) fail(`${path}.completedStudyUnitIds não pode ficar vazia.`);
  const cursorStudyUnitId = readRequiredText(
    entry.cursorStudyUnitId,
    `${path}.cursorStudyUnitId`
  );
  if (!completedStudyUnitIds.includes(cursorStudyUnitId)) {
    fail(`${path}.cursorStudyUnitId deve identificar uma Unidade de estudo concluída.`);
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
    cursorStudyUnitId,
    completedStudyUnitIds,
    ...(updatedAt ? { updatedAt } : {})
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

export function createEmptyProgressDocument() {
  return { version: PROGRESS_VERSION, lessons: {} };
}

export function validateProgressDocument(progressDocument) {
  validateProgressEnvelope(progressDocument);
  const lessons = {};
  for (const [rawPath, entry] of Object.entries(progressDocument.lessons)) {
    const lessonPath = validateProgressPath(rawPath);
    lessons[lessonPath] = validateProgressEntry(
      entry,
      `$.lessons[${JSON.stringify(lessonPath)}]`
    );
  }
  return { version: PROGRESS_VERSION, lessons };
}

export function buildLessonProgressPath(reference) {
  const normalized = validateProgressReference(reference);
  return `${normalized.courseId}::${normalized.moduleId}::${normalized.lessonId}`;
}

export function readLessonProgressEntry(progressDocument, reference) {
  validateProgressEnvelope(progressDocument);
  const lessonPath = buildLessonProgressPath(reference);
  const entry = progressDocument.lessons[lessonPath];
  return entry === undefined
    ? null
    : validateProgressEntry(entry, `$.lessons[${JSON.stringify(lessonPath)}]`);
}
