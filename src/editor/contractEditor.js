import {
  CONTRACT_KIND_PROJECT,
  CONTRACT_NAME,
  CONTRACT_VERSION,
  validateContractDocument
} from "../contract/validateContract.js";
import {
  createStarterContractCard,
  getContractCardKindLabel,
  sanitizeContractCard
} from "../contract/contractCard.js";
import {
  MICROSEQUENCE_STATUS_DRAFT,
  MICROSEQUENCE_STATUS_READY,
  normalizeMicrosequenceRuntimeIncluded,
  normalizeMicrosequenceStatus
} from "../model/microsequenceStatus.js";
import {
  buildSourceGuideText,
  normalizeSourceGuideStructured,
  SOURCE_GUIDE_LEVELS
} from "../sourceGuides/sourceGuideStructured.js";

function clone(value) {
  return structuredClone(value);
}

function fail(message) {
  throw new Error(message);
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function uniqueKey(baseLabel, usedKeys, fallbackPrefix) {
  const base = slugify(baseLabel) || fallbackPrefix;
  let candidate = `${fallbackPrefix}-${base}`;
  let counter = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${fallbackPrefix}-${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function normalizeText(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return value.trim();
}

function assignOptionalTextField(record, fieldName, value) {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    fail(`Campo opcional inválido: "${fieldName}".`);
  }

  const nextValue = value.trim();
  if (nextValue) {
    record[fieldName] = nextValue;
  } else {
    delete record[fieldName];
  }
}

function assignOptionalSourceGuide(record, sourceGuide, sourceGuideStructured, level) {
  if (sourceGuide === undefined && sourceGuideStructured === undefined) {
    return;
  }

  if (sourceGuideStructured === undefined) {
    assignOptionalTextField(record, "sourceGuide", sourceGuide);
    delete record.sourceGuideStructured;
    return;
  }

  const normalizedText = sourceGuide === undefined ? "" : sourceGuide;
  const structured = normalizeSourceGuideStructured(sourceGuideStructured, { level });
  const nextText = buildSourceGuideText(structured, normalizedText, { level });

  if (nextText) {
    record.sourceGuide = nextText;
  } else {
    delete record.sourceGuide;
  }

  if (Object.keys(structured).length) {
    record.sourceGuideStructured = structured;
  } else {
    delete record.sourceGuideStructured;
  }
}

function normalizeOptionalTags(value) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    fail('Campo opcional inválido: "tags".');
  }

  return value.map((item) => normalizeText(item, "tags"));
}

function normalizeOptionalRenames(value) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    fail('Campo opcional inválido: "renames".');
  }

  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail('Campo opcional inválido: "renames".');
    }

    return {
      microsequenceKey: normalizeText(item.microsequenceKey, "microsequenceKey"),
      title: normalizeText(item.title, "title")
    };
  });
}

function collectSiblingKeys(items) {
  return new Set((items || []).map((item) => item.key).filter(Boolean));
}

function normalizeTargetIndex(value, maxIndex) {
  if (!Number.isInteger(value)) {
    fail('Campo obrigatório inválido: "toIndex".');
  }

  return Math.max(0, Math.min(value, Math.max(0, maxIndex)));
}

function reorderSiblingItems(items, itemKey, toIndex, label) {
  const fromIndex = items.findIndex((item) => item.key === itemKey);
  if (fromIndex < 0) {
    fail(`${label} não encontrado: "${itemKey}".`);
  }

  const [item] = items.splice(fromIndex, 1);
  const safeIndex = normalizeTargetIndex(toIndex, items.length);
  items.splice(safeIndex, 0, item);

  return {
    fromIndex,
    toIndex: safeIndex,
    item
  };
}

function ensureValidDocument(document) {
  const result = validateContractDocument(document);
  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    fail(`Documento inválido após edição: ${summary}`);
  }

  return result.value;
}

function findCourse(document, courseKey) {
  const course = (document.courses || []).find((item) => item.key === courseKey);
  if (!course) {
    fail(`Curso não encontrado: "${courseKey}".`);
  }
  return course;
}

function findModule(document, courseKey, moduleKey) {
  const course = findCourse(document, courseKey);
  const moduleValue = course.modules.find((item) => item.key === moduleKey);
  if (!moduleValue) {
    fail(`Módulo não encontrado: "${moduleKey}".`);
  }
  return { course, moduleValue };
}

function findLesson(document, courseKey, moduleKey, lessonKey) {
  const { moduleValue } = findModule(document, courseKey, moduleKey);
  const lesson = moduleValue.lessons.find((item) => item.key === lessonKey);
  if (!lesson) {
    fail(`Lição não encontrada: "${lessonKey}".`);
  }
  return { moduleValue, lesson };
}

function findMicrosequence(lesson, microsequenceKey) {
  const microsequence = lesson.microsequences.find((item) => item.key === microsequenceKey);
  if (!microsequence) {
    fail(`Microssequência não encontrada: "${microsequenceKey}".`);
  }
  return microsequence;
}

function buildUniqueMicrosequenceTitle(lesson, desiredTitle, excludingKey) {
  const baseTitle = String(desiredTitle || "").replace(/\s+/g, " ").trim();
  if (!baseTitle) {
    return "";
  }

  const titlesInUse = new Set(
    (lesson.microsequences || [])
      .filter((item) => item && item.key !== excludingKey)
      .map((item) => String(item.title || item.key).toLowerCase())
  );

  if (!titlesInUse.has(baseTitle.toLowerCase())) {
    return baseTitle;
  }

  let counter = 2;
  let candidate = `${baseTitle} (${counter})`;
  while (titlesInUse.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${baseTitle} (${counter})`;
  }

  return candidate;
}

function assignUniqueMicrosequenceTitle(lesson, microsequence, title) {
  const uniqueTitle = buildUniqueMicrosequenceTitle(lesson, title, microsequence.key);
  if (uniqueTitle) {
    microsequence.title = uniqueTitle;
  } else {
    delete microsequence.title;
  }
}

function createStarterCard() {
  return sanitizeContractCard(createStarterContractCard());
}

function createProjectDocument(courses) {
  return {
    contract: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    kind: CONTRACT_KIND_PROJECT,
    courses
  };
}

function createScopedProjectDocument(scope, courses) {
  return {
    contract: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    kind: CONTRACT_KIND_PROJECT,
    scope,
    courses
  };
}

function inferContractScope(document) {
  const explicitScope = typeof document?.scope === "string" ? document.scope.trim() : "";
  if (explicitScope) {
    return explicitScope;
  }

  return "course";
}

function getScopeLabel(scope) {
  if (scope === "course") return "curso";
  if (scope === "module") return "módulo";
  if (scope === "lesson") return "lição";
  if (scope === "microsequence") return "microssequência";
  return "conteúdo";
}

function assertImportScope(document, expectedScope) {
  const actualScope = inferContractScope(document);
  if (actualScope === expectedScope) {
    return;
  }

  fail(`Este arquivo contém ${getScopeLabel(actualScope)}. Importe dentro do nível correto para ${getScopeLabel(actualScope)}.`);
}

function createStarterMicrosequence({ title = "Nova microssequência" } = {}) {
  return {
    key: uniqueKey(title, new Set(), "microsequence"),
    title,
    status: MICROSEQUENCE_STATUS_DRAFT,
    included: false,
    cards: []
  };
}

function createStarterLesson({ title = "Nova lição", description, sourceGuide, sourceGuideStructured } = {}) {
  const lesson = {
    key: uniqueKey(title, new Set(), "lesson"),
    title,
    ...(description ? { description } : {}),
    microsequences: []
  };
  assignOptionalSourceGuide(lesson, sourceGuide, sourceGuideStructured, SOURCE_GUIDE_LEVELS.LESSON);
  return lesson;
}

function createStarterModule({ title = "Novo módulo", description, sourceGuide, sourceGuideStructured } = {}) {
  const moduleValue = {
    key: uniqueKey(title, new Set(), "module"),
    title,
    ...(description ? { description } : {}),
    lessons: []
  };
  assignOptionalSourceGuide(moduleValue, sourceGuide, sourceGuideStructured, SOURCE_GUIDE_LEVELS.MODULE);
  return moduleValue;
}

function createStarterCourse({ title = "Novo curso", description, sourceGuide, sourceGuideStructured } = {}) {
  const course = {
    key: uniqueKey(title, new Set(), "course"),
    title,
    ...(description ? { description } : {}),
    modules: []
  };
  assignOptionalSourceGuide(course, sourceGuide, sourceGuideStructured, SOURCE_GUIDE_LEVELS.COURSE);
  return course;
}

function normalizeCardForInsert(entry, usedKeys, fallbackLabel = "card") {
  const normalizedCard = sanitizeContractCard(entry);
  const title = normalizedCard.title || fallbackLabel;
  const key = normalizedCard.key || uniqueKey(title, usedKeys, "card");

  if (usedKeys.has(key)) {
    fail(`Key de card duplicada: "${key}".`);
  }

  usedKeys.add(key);
  return {
    ...normalizedCard,
    key
  };
}

function extractCardInput(input = {}) {
  const {
    courseKey,
    moduleKey,
    lessonKey,
    microsequenceKey,
    cardKey,
    position,
    toIndex,
    targetCourseKey,
    targetModuleKey,
    targetLessonKey,
    targetPosition,
    renames,
    ...cardInput
  } = input || {};

  return cardInput;
}

export function updateCourse(document, input) {
  const nextDocument = clone(document);
  const course = findCourse(nextDocument, input.courseKey);
  assignOptionalTextField(course, "title", input.title);
  assignOptionalTextField(course, "description", input.description);
  assignOptionalSourceGuide(course, input.sourceGuide, input.sourceGuideStructured, SOURCE_GUIDE_LEVELS.COURSE);
  return ensureValidDocument(nextDocument);
}

export function createCourse(document, input = {}) {
  const nextDocument = clone(document);
  const title = input.title && typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Novo curso";
  const description =
    input.description && typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : "";
  const sourceGuide =
    input.sourceGuide && typeof input.sourceGuide === "string" && input.sourceGuide.trim()
      ? input.sourceGuide.trim()
      : "";
  const sourceGuideStructured =
    input.sourceGuideStructured === undefined
      ? undefined
      : normalizeSourceGuideStructured(input.sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.COURSE });
  const usedKeys = collectSiblingKeys(nextDocument.courses || []);
  const course = createStarterCourse({ title, description, sourceGuide, sourceGuideStructured });
  course.key = input.key && typeof input.key === "string" && input.key.trim()
    ? input.key.trim()
    : uniqueKey(title, usedKeys, "course");

  if (usedKeys.has(course.key)) {
    fail(`Key de curso duplicada: "${course.key}".`);
  }

  nextDocument.courses.push(course);
  return ensureValidDocument(nextDocument);
}

export function importCourses(document, input = {}) {
  const nextDocument = clone(document);
  const importedDocument = ensureValidDocument(input.document);
  assertImportScope(importedDocument, "course");
  const importedCourses = Array.isArray(importedDocument.courses) ? importedDocument.courses : [];

  if (!importedCourses.length) {
    fail("Documento importado sem cursos.");
  }

  const usedKeys = collectSiblingKeys(nextDocument.courses || []);
  importedCourses.forEach((course) => {
    const importedCourse = clone(course);
    const preferredKey = typeof importedCourse.key === "string" && importedCourse.key.trim() ? importedCourse.key.trim() : "";
    if (preferredKey && !usedKeys.has(preferredKey)) {
      importedCourse.key = preferredKey;
      usedKeys.add(preferredKey);
    } else {
      importedCourse.key = uniqueKey(importedCourse.title || "Curso importado", usedKeys, "course");
    }
    nextDocument.courses.push(importedCourse);
  });

  return ensureValidDocument(nextDocument);
}

export function importModules(document, input = {}) {
  const nextDocument = clone(document);
  const course = findCourse(nextDocument, input.courseKey);
  const importedDocument = ensureValidDocument(input.document);
  assertImportScope(importedDocument, "module");
  const importedModules = importedDocument.courses.flatMap((entry) => entry.modules || []);

  if (!importedModules.length) {
    fail("Documento importado sem módulos.");
  }

  const usedKeys = collectSiblingKeys(course.modules || []);
  importedModules.forEach((moduleValue) => {
    const importedModule = clone(moduleValue);
    const preferredKey = typeof importedModule.key === "string" && importedModule.key.trim() ? importedModule.key.trim() : "";
    if (preferredKey && !usedKeys.has(preferredKey)) {
      importedModule.key = preferredKey;
      usedKeys.add(preferredKey);
    } else {
      importedModule.key = uniqueKey(importedModule.title || "Módulo importado", usedKeys, "module");
    }
    course.modules.push(importedModule);
  });

  return ensureValidDocument(nextDocument);
}

export function importLessons(document, input = {}) {
  const nextDocument = clone(document);
  const { moduleValue } = findModule(nextDocument, input.courseKey, input.moduleKey);
  const importedDocument = ensureValidDocument(input.document);
  assertImportScope(importedDocument, "lesson");
  const importedLessons = importedDocument.courses.flatMap((course) =>
    (course.modules || []).flatMap((moduleItem) => moduleItem.lessons || [])
  );

  if (!importedLessons.length) {
    fail("Documento importado sem lições.");
  }

  const usedKeys = collectSiblingKeys(moduleValue.lessons || []);
  importedLessons.forEach((lesson) => {
    const importedLesson = clone(lesson);
    const preferredKey = typeof importedLesson.key === "string" && importedLesson.key.trim() ? importedLesson.key.trim() : "";
    if (preferredKey && !usedKeys.has(preferredKey)) {
      importedLesson.key = preferredKey;
      usedKeys.add(preferredKey);
    } else {
      importedLesson.key = uniqueKey(importedLesson.title || "Lição importada", usedKeys, "lesson");
    }
    moduleValue.lessons.push(importedLesson);
  });

  return ensureValidDocument(nextDocument);
}

export function importMicrosequences(document, input = {}) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const importedDocument = ensureValidDocument(input.document);
  assertImportScope(importedDocument, "microsequence");
  const importedMicrosequences = importedDocument.courses.flatMap((course) =>
    (course.modules || []).flatMap((moduleItem) =>
      (moduleItem.lessons || []).flatMap((lessonItem) => lessonItem.microsequences || [])
    )
  );

  if (!importedMicrosequences.length) {
    fail("Documento importado sem microssequências.");
  }

  const usedKeys = collectSiblingKeys(lesson.microsequences || []);
  importedMicrosequences.forEach((entry) => {
    const importedMicrosequence = clone(entry);
    const preferredKey =
      typeof importedMicrosequence.key === "string" && importedMicrosequence.key.trim()
        ? importedMicrosequence.key.trim()
        : "";

    if (preferredKey && !usedKeys.has(preferredKey)) {
      importedMicrosequence.key = preferredKey;
      usedKeys.add(preferredKey);
    } else {
      importedMicrosequence.key = uniqueKey(importedMicrosequence.title || "Microssequência importada", usedKeys, "microsequence");
    }

    if (importedMicrosequence.title) {
      importedMicrosequence.title = buildUniqueMicrosequenceTitle(lesson, importedMicrosequence.title, null);
    }

    lesson.microsequences.push(importedMicrosequence);
  });

  return ensureValidDocument(nextDocument);
}

export function exportCourseDocument(document, input) {
  const course = findCourse(document, input.courseKey);
  return ensureValidDocument(createScopedProjectDocument("course", [clone(course)]));
}

export function exportModuleDocument(document, input) {
  const course = findCourse(document, input.courseKey);
  const moduleValue = course.modules.find((item) => item.key === input.moduleKey);
  if (!moduleValue) {
    fail(`Módulo não encontrado: "${input.moduleKey}".`);
  }

  return ensureValidDocument(
    createScopedProjectDocument("module", [
      {
        key: course.key,
        title: course.title,
        modules: [clone(moduleValue)]
      }
    ])
  );
}

export function exportLessonDocument(document, input) {
  const course = findCourse(document, input.courseKey);
  const moduleValue = course.modules.find((item) => item.key === input.moduleKey);
  if (!moduleValue) {
    fail(`Módulo não encontrado: "${input.moduleKey}".`);
  }
  const lesson = moduleValue.lessons.find((item) => item.key === input.lessonKey);
  if (!lesson) {
    fail(`Lição não encontrada: "${input.lessonKey}".`);
  }

  return ensureValidDocument(
    createScopedProjectDocument("lesson", [
      {
        key: course.key,
        title: course.title,
        modules: [
          {
            key: moduleValue.key,
            title: moduleValue.title,
            lessons: [clone(lesson)]
          }
        ]
      }
    ])
  );
}

export function exportMicrosequenceDocument(document, input) {
  const course = findCourse(document, input.courseKey);
  const moduleValue = course.modules.find((item) => item.key === input.moduleKey);
  if (!moduleValue) {
    fail(`Módulo não encontrado: "${input.moduleKey}".`);
  }
  const lesson = moduleValue.lessons.find((item) => item.key === input.lessonKey);
  if (!lesson) {
    fail(`Lição não encontrada: "${input.lessonKey}".`);
  }
  const microsequence = lesson.microsequences.find((item) => item.key === input.microsequenceKey);
  if (!microsequence) {
    fail(`Microssequência não encontrada: "${input.microsequenceKey}".`);
  }

  return ensureValidDocument(
    createScopedProjectDocument("microsequence", [
      {
        key: course.key,
        title: course.title,
        modules: [
          {
            key: moduleValue.key,
            title: moduleValue.title,
            lessons: [
              {
                key: lesson.key,
                title: lesson.title,
                microsequences: [clone(microsequence)]
              }
            ]
          }
        ]
      }
    ])
  );
}

export function deleteCourse(document, input) {
  const nextDocument = clone(document);
  const courseIndex = (nextDocument.courses || []).findIndex((item) => item.key === input.courseKey);
  if (courseIndex < 0) {
    fail(`Curso não encontrado: "${input.courseKey}".`);
  }

  nextDocument.courses.splice(courseIndex, 1);
  return ensureValidDocument(nextDocument);
}

export function moveCourse(document, input) {
  const nextDocument = clone(document);
  reorderSiblingItems(nextDocument.courses || [], input.courseKey, input.toIndex, "Curso");
  return ensureValidDocument(nextDocument);
}

export function createModule(document, input) {
  const nextDocument = clone(document);
  const course = findCourse(nextDocument, input.courseKey);
  const title = input.title && typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Novo módulo";
  const description =
    input.description && typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : "";
  const sourceGuide =
    input.sourceGuide && typeof input.sourceGuide === "string" && input.sourceGuide.trim()
      ? input.sourceGuide.trim()
      : "";
  const sourceGuideStructured =
    input.sourceGuideStructured === undefined
      ? undefined
      : normalizeSourceGuideStructured(input.sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.MODULE });
  const usedKeys = collectSiblingKeys(course.modules);
  const moduleValue = createStarterModule({ title, description, sourceGuide, sourceGuideStructured });
  moduleValue.key = input.key && typeof input.key === "string" && input.key.trim()
    ? input.key.trim()
    : uniqueKey(title, usedKeys, "module");

  if (usedKeys.has(moduleValue.key)) {
    fail(`Key de módulo duplicada: "${moduleValue.key}".`);
  }

  course.modules.push(moduleValue);
  return ensureValidDocument(nextDocument);
}

export function updateModule(document, input) {
  const nextDocument = clone(document);
  const { moduleValue } = findModule(nextDocument, input.courseKey, input.moduleKey);
  assignOptionalTextField(moduleValue, "title", input.title);
  assignOptionalTextField(moduleValue, "description", input.description);
  assignOptionalSourceGuide(moduleValue, input.sourceGuide, input.sourceGuideStructured, SOURCE_GUIDE_LEVELS.MODULE);
  return ensureValidDocument(nextDocument);
}

export function deleteModule(document, input) {
  const nextDocument = clone(document);
  const { course } = findModule(nextDocument, input.courseKey, input.moduleKey);
  const moduleIndex = course.modules.findIndex((item) => item.key === input.moduleKey);

  if (moduleIndex < 0) {
    fail(`Módulo não encontrado: "${input.moduleKey}".`);
  }

  course.modules.splice(moduleIndex, 1);
  return ensureValidDocument(nextDocument);
}

export function moveModule(document, input) {
  const nextDocument = clone(document);
  const course = findCourse(nextDocument, input.courseKey);
  reorderSiblingItems(course.modules || [], input.moduleKey, input.toIndex, "Módulo");
  return ensureValidDocument(nextDocument);
}

export function createLesson(document, input) {
  const nextDocument = clone(document);
  const { moduleValue } = findModule(nextDocument, input.courseKey, input.moduleKey);
  const title = input.title && typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Nova lição";
  const description =
    input.description && typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : "";
  const sourceGuide =
    input.sourceGuide && typeof input.sourceGuide === "string" && input.sourceGuide.trim()
      ? input.sourceGuide.trim()
      : "";
  const sourceGuideStructured =
    input.sourceGuideStructured === undefined
      ? undefined
      : normalizeSourceGuideStructured(input.sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON });
  const usedKeys = collectSiblingKeys(moduleValue.lessons);
  const lesson = createStarterLesson({ title, description, sourceGuide, sourceGuideStructured });
  lesson.key = input.key && typeof input.key === "string" && input.key.trim()
    ? input.key.trim()
    : uniqueKey(title, usedKeys, "lesson");

  if (usedKeys.has(lesson.key)) {
    fail(`Key de lição duplicada: "${lesson.key}".`);
  }

  moduleValue.lessons.push(lesson);
  return ensureValidDocument(nextDocument);
}

export function updateLesson(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  assignOptionalTextField(lesson, "title", input.title);
  assignOptionalTextField(lesson, "description", input.description);
  assignOptionalSourceGuide(lesson, input.sourceGuide, input.sourceGuideStructured, SOURCE_GUIDE_LEVELS.LESSON);
  return ensureValidDocument(nextDocument);
}

export function deleteLesson(document, input) {
  const nextDocument = clone(document);
  const { moduleValue } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const lessonIndex = moduleValue.lessons.findIndex((item) => item.key === input.lessonKey);

  if (lessonIndex < 0) {
    fail(`Lição não encontrada: "${input.lessonKey}".`);
  }

  moduleValue.lessons.splice(lessonIndex, 1);
  return ensureValidDocument(nextDocument);
}

export function moveLesson(document, input) {
  const nextDocument = clone(document);
  const { moduleValue } = findModule(nextDocument, input.courseKey, input.moduleKey);
  reorderSiblingItems(moduleValue.lessons || [], input.lessonKey, input.toIndex, "Lição");
  return ensureValidDocument(nextDocument);
}

export function createMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const title = normalizeText(input.title || "Nova microssequência", "title");
  const usedKeys = collectSiblingKeys(lesson.microsequences);
  const key = input.key && typeof input.key === "string" && input.key.trim()
    ? input.key.trim()
    : uniqueKey(title, usedKeys, "microsequence");

  if (usedKeys.has(key)) {
    fail(`Key de microssequência duplicada: "${key}".`);
  }

  const cardInput = Array.isArray(input.cards) ? input.cards : null;
  const usedCardKeys = new Set();
  const cards = cardInput ? cardInput.map((entry, index) => normalizeCardForInsert(entry, usedCardKeys, `Card ${index + 1}`)) : [];
  const tags = normalizeOptionalTags(input.tags);
  const microsequence = {
    key,
    title: buildUniqueMicrosequenceTitle(lesson, title, null),
    status: normalizeMicrosequenceStatus(input.status || MICROSEQUENCE_STATUS_DRAFT, { cards }),
    included: normalizeMicrosequenceRuntimeIncluded(input.included, { cards }),
    ...(tags && tags.length ? { tags } : {}),
    cards
  };

  lesson.microsequences.push(microsequence);
  return ensureValidDocument(nextDocument);
}

export function updateMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);

  if (input.title !== undefined) {
    assignUniqueMicrosequenceTitle(lesson, microsequence, normalizeText(input.title, "title"));
  }

  if (input.tags !== undefined) {
    const tags = normalizeOptionalTags(input.tags);
    if (tags && tags.length) {
      microsequence.tags = tags;
    } else {
      delete microsequence.tags;
    }
  }

  if (input.status !== undefined) {
    microsequence.status = normalizeMicrosequenceStatus(input.status, microsequence);
  }

  if (input.included !== undefined) {
    microsequence.included = normalizeMicrosequenceRuntimeIncluded(input.included, microsequence);
  }

  return ensureValidDocument(nextDocument);
}

export function deleteMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequenceIndex = lesson.microsequences.findIndex((item) => item.key === input.microsequenceKey);

  if (microsequenceIndex < 0) {
    fail(`Microssequência não encontrada: "${input.microsequenceKey}".`);
  }

  lesson.microsequences.splice(microsequenceIndex, 1);
  return ensureValidDocument(nextDocument);
}

export function moveMicrosequenceWithResult(document, input) {
  const nextDocument = clone(document);
  const { lesson: sourceLesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const { lesson: targetLesson } = findLesson(
    nextDocument,
    input.targetCourseKey,
    input.targetModuleKey,
    input.targetLessonKey
  );
  const microsequenceIndex = sourceLesson.microsequences.findIndex((item) => item.key === input.microsequenceKey);

  if (microsequenceIndex < 0) {
    fail(`Microssequência não encontrada: "${input.microsequenceKey}".`);
  }

  const [microsequence] = sourceLesson.microsequences.splice(microsequenceIndex, 1);
  const originalKey = microsequence.key;

  if (sourceLesson !== targetLesson && !sourceLesson.microsequences.length) {
    sourceLesson.microsequences.push(createStarterMicrosequence());
  }

  const usedKeys = collectSiblingKeys(targetLesson.microsequences);
  if (usedKeys.has(microsequence.key)) {
    microsequence.key = uniqueKey(microsequence.title || input.microsequenceKey, usedKeys, "microsequence");
  }

  const targetPosition = Number.isInteger(input.targetPosition) ? input.targetPosition : targetLesson.microsequences.length;
  const adjustedTargetPosition =
    sourceLesson === targetLesson && targetPosition > microsequenceIndex
      ? targetPosition - 1
      : targetPosition;
  const safeIndex = Math.max(0, Math.min(adjustedTargetPosition, targetLesson.microsequences.length));
  targetLesson.microsequences.splice(safeIndex, 0, microsequence);

  if (microsequence.title) {
    assignUniqueMicrosequenceTitle(targetLesson, microsequence, microsequence.title);
  }

  const renames = normalizeOptionalRenames(input.renames);
  renames.forEach((rename) => {
    const targetMicrosequence = targetLesson.microsequences.find((item) => item.key === rename.microsequenceKey);
    if (!targetMicrosequence) {
      return;
    }

    assignUniqueMicrosequenceTitle(targetLesson, targetMicrosequence, rename.title);
  });

  return {
    document: ensureValidDocument(nextDocument),
    movedMicrosequence: {
      courseKey: input.targetCourseKey,
      moduleKey: input.targetModuleKey,
      lessonKey: input.targetLessonKey,
      microsequenceKey: microsequence.key,
      previousMicrosequenceKey: originalKey,
      position: safeIndex
    }
  };
}

export function moveMicrosequence(document, input) {
  return moveMicrosequenceWithResult(document, input).document;
}

export function replaceMicrosequenceCards(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const cards = Array.isArray(input.cards) ? input.cards : [];

  if (input.title !== undefined) {
    assignUniqueMicrosequenceTitle(lesson, microsequence, normalizeText(input.title, "title"));
  }

  if (input.tags !== undefined) {
    const tags = normalizeOptionalTags(input.tags);
    if (tags && tags.length) {
      microsequence.tags = tags;
    } else {
      delete microsequence.tags;
    }
  }

  assignOptionalTextField(microsequence, "description", input.description);

  const usedKeys = new Set();
  microsequence.cards = cards.map((entry, index) => normalizeCardForInsert(entry, usedKeys, `Card ${index + 1}`));
  microsequence.status = normalizeMicrosequenceStatus(input.status || microsequence.status || MICROSEQUENCE_STATUS_READY, microsequence);
  microsequence.included = normalizeMicrosequenceRuntimeIncluded(input.included ?? microsequence.included, microsequence);
  return ensureValidDocument(nextDocument);
}

export function createCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const usedKeys = collectSiblingKeys(microsequence.cards);
  const cardInput = extractCardInput(input);
  const card = normalizeCardForInsert(cardInput, usedKeys, cardInput.title || getContractCardKindLabel(cardInput) || "card");
  const position = Number.isInteger(input.position) ? input.position : microsequence.cards.length;
  const safeIndex = Math.max(0, Math.min(position, microsequence.cards.length));
  microsequence.cards.splice(safeIndex, 0, card);
  microsequence.status = normalizeMicrosequenceStatus(input.status || microsequence.status, microsequence);
  microsequence.included = normalizeMicrosequenceRuntimeIncluded(input.included ?? microsequence.included, microsequence);
  return ensureValidDocument(nextDocument);
}

export function updateCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const cardIndex = microsequence.cards.findIndex((item) => item.key === input.cardKey);

  if (cardIndex < 0) {
    fail(`Card não encontrado: "${input.cardKey}".`);
  }

  const currentCard = microsequence.cards[cardIndex];
  const nextCard = normalizeCardForInsert(
    {
      ...currentCard,
      ...extractCardInput(input),
      key: currentCard.key
    },
    collectSiblingKeys(microsequence.cards.filter((item) => item.key !== currentCard.key)),
    currentCard.title || getContractCardKindLabel(currentCard)
  );

  microsequence.cards[cardIndex] = nextCard;
  return ensureValidDocument(nextDocument);
}

export function moveCardWithinMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  reorderSiblingItems(microsequence.cards || [], input.cardKey, input.toIndex, "Card");
  return ensureValidDocument(nextDocument);
}

export function deleteCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const fromIndex = microsequence.cards.findIndex((item) => item.key === input.cardKey);

  if (fromIndex < 0) {
    fail(`Card não encontrado: "${input.cardKey}".`);
  }

  microsequence.cards.splice(fromIndex, 1);
  microsequence.status = normalizeMicrosequenceStatus(
    microsequence.cards.length ? microsequence.status : MICROSEQUENCE_STATUS_DRAFT,
    microsequence
  );
  microsequence.included = normalizeMicrosequenceRuntimeIncluded(
    microsequence.cards.length ? microsequence.included : false,
    microsequence
  );
  return ensureValidDocument(nextDocument);
}

export function createEditorSession(storage) {
  if (!storage || typeof storage.loadProject !== "function" || typeof storage.saveProject !== "function") {
    fail("Storage inválido para sessão de edição.");
  }

  return {
    createCourse(input) {
      const nextDocument = createCourse(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    importCourses(input) {
      const nextDocument = importCourses(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    importModules(input) {
      const nextDocument = importModules(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    importLessons(input) {
      const nextDocument = importLessons(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    importMicrosequences(input) {
      const nextDocument = importMicrosequences(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    exportCourseDocument(input) {
      return exportCourseDocument(storage.loadProject(), input);
    },
    exportModuleDocument(input) {
      return exportModuleDocument(storage.loadProject(), input);
    },
    exportLessonDocument(input) {
      return exportLessonDocument(storage.loadProject(), input);
    },
    exportMicrosequenceDocument(input) {
      return exportMicrosequenceDocument(storage.loadProject(), input);
    },
    updateCourse(input) {
      const nextDocument = updateCourse(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    deleteCourse(input) {
      const nextDocument = deleteCourse(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    moveCourse(input) {
      const nextDocument = moveCourse(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    createModule(input) {
      const nextDocument = createModule(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    updateModule(input) {
      const nextDocument = updateModule(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    deleteModule(input) {
      const nextDocument = deleteModule(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    moveModule(input) {
      const nextDocument = moveModule(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    createLesson(input) {
      const nextDocument = createLesson(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    updateLesson(input) {
      const nextDocument = updateLesson(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    deleteLesson(input) {
      const nextDocument = deleteLesson(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    moveLesson(input) {
      const nextDocument = moveLesson(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    createMicrosequence(input) {
      const nextDocument = createMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    updateMicrosequence(input) {
      const nextDocument = updateMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    deleteMicrosequence(input) {
      const nextDocument = deleteMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    moveMicrosequence(input) {
      const result = moveMicrosequenceWithResult(storage.loadProject(), input);
      storage.saveProject(result.document);
      return result;
    },
    replaceMicrosequenceCards(input) {
      const nextDocument = replaceMicrosequenceCards(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    createCard(input) {
      const nextDocument = createCardInMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    updateCard(input) {
      const nextDocument = updateCardInMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    moveCard(input) {
      const nextDocument = moveCardWithinMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },
    deleteCard(input) {
      const nextDocument = deleteCardInMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    }
  };
}
