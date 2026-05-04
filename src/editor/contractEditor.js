import { validateContractDocument } from "../contract/validateContract.js";
import { createStarterContractCard, sanitizeContractCard } from "../contract/contractCard.js";

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

function createStarterMicrosequence({ title = "Nova microssequência" } = {}) {
  return {
    key: uniqueKey(title, new Set(), "microsequence"),
    title,
    cards: [createStarterCard()]
  };
}

function createStarterLesson({ title = "Nova lição", description } = {}) {
  return {
    key: uniqueKey(title, new Set(), "lesson"),
    title,
    ...(description ? { description } : {}),
    microsequences: [createStarterMicrosequence()]
  };
}

function createStarterModule({ title = "Novo módulo", description } = {}) {
  return {
    key: uniqueKey(title, new Set(), "module"),
    title,
    ...(description ? { description } : {}),
    lessons: [createStarterLesson()]
  };
}

function createStarterCourse({ title = "Novo curso", description } = {}) {
  return {
    key: uniqueKey(title, new Set(), "course"),
    title,
    ...(description ? { description } : {}),
    modules: [createStarterModule()]
  };
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

export function updateCourse(document, input) {
  const nextDocument = clone(document);
  const course = findCourse(nextDocument, input.courseKey);
  assignOptionalTextField(course, "title", input.title);
  assignOptionalTextField(course, "description", input.description);
  return ensureValidDocument(nextDocument);
}

export function createCourse(document, input = {}) {
  const nextDocument = clone(document);
  const title = input.title && typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Novo curso";
  const description =
    input.description && typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : "";
  const usedKeys = collectSiblingKeys(nextDocument.courses || []);
  const course = createStarterCourse({ title, description });
  course.key = input.key && typeof input.key === "string" && input.key.trim()
    ? input.key.trim()
    : uniqueKey(title, usedKeys, "course");

  if (usedKeys.has(course.key)) {
    fail(`Key de curso duplicada: "${course.key}".`);
  }

  nextDocument.courses.push(course);
  return ensureValidDocument(nextDocument);
}

export function deleteCourse(document, input) {
  const nextDocument = clone(document);
  const courseIndex = (nextDocument.courses || []).findIndex((item) => item.key === input.courseKey);
  if (courseIndex < 0) {
    fail(`Curso não encontrado: "${input.courseKey}".`);
  }

  nextDocument.courses.splice(courseIndex, 1);

  if (!nextDocument.courses.length) {
    nextDocument.courses.push(createStarterCourse());
  }

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
  const usedKeys = collectSiblingKeys(course.modules);
  const moduleValue = createStarterModule({ title, description });
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

  if (!course.modules.length) {
    course.modules.push(createStarterModule());
  }

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
  const usedKeys = collectSiblingKeys(moduleValue.lessons);
  const lesson = createStarterLesson({ title, description });
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

  if (!moduleValue.lessons.length) {
    moduleValue.lessons.push(createStarterLesson());
  }

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

  const microsequence = {
    key,
    title: buildUniqueMicrosequenceTitle(lesson, title, null),
    cards: [normalizeCardForInsert(createStarterContractCard(), new Set(), "Novo card")]
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

  if (!lesson.microsequences.length) {
    lesson.microsequences.push(createStarterMicrosequence());
  }

  return ensureValidDocument(nextDocument);
}

export function moveMicrosequence(document, input) {
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

  return ensureValidDocument(nextDocument);
}

export function replaceMicrosequenceCards(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const cards = Array.isArray(input.cards) ? input.cards : [];

  if (!cards.length) {
    fail('Campo obrigatório inválido: "cards".');
  }

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

  const usedKeys = new Set();
  microsequence.cards = cards.map((entry, index) => normalizeCardForInsert(entry, usedKeys, `Card ${index + 1}`));
  return ensureValidDocument(nextDocument);
}

export function createCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const usedKeys = collectSiblingKeys(microsequence.cards);
  const card = normalizeCardForInsert(input, usedKeys, input.title || input.type || "card");
  const position = Number.isInteger(input.position) ? input.position : microsequence.cards.length;
  const safeIndex = Math.max(0, Math.min(position, microsequence.cards.length));
  microsequence.cards.splice(safeIndex, 0, card);
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
      ...input,
      key: currentCard.key
    },
    collectSiblingKeys(microsequence.cards.filter((item) => item.key !== currentCard.key)),
    currentCard.title || currentCard.type
  );

  microsequence.cards[cardIndex] = nextCard;
  return ensureValidDocument(nextDocument);
}

export function moveCardWithinMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.courseKey, input.moduleKey, input.lessonKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const fromIndex = microsequence.cards.findIndex((item) => item.key === input.cardKey);

  if (fromIndex < 0) {
    fail(`Card não encontrado: "${input.cardKey}".`);
  }
  if (!Number.isInteger(input.toIndex)) {
    fail('Campo obrigatório inválido: "toIndex".');
  }

  const [card] = microsequence.cards.splice(fromIndex, 1);
  const safeIndex = Math.max(0, Math.min(input.toIndex, microsequence.cards.length));
  microsequence.cards.splice(safeIndex, 0, card);
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
  if (!microsequence.cards.length) {
    microsequence.cards.push(normalizeCardForInsert(createStarterContractCard(), new Set(), "Novo card"));
  }
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
      const nextDocument = moveMicrosequence(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
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
