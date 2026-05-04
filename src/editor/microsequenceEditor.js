import { validateIntentV1Document } from "../contract/validateIntentV1.js";
import { createDefaultCardData } from "../core/cardBlockModel.js";

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

function findLesson(document, moduleKey, lessonKey, courseKey) {
  const course = findCourse(document, courseKey);
  const moduleValue = course.modules.find((item) => item.key === moduleKey);
  if (!moduleValue) {
    fail(`Módulo não encontrado: "${moduleKey}".`);
  }

  const lesson = moduleValue.lessons.find((item) => item.key === lessonKey);
  if (!lesson) {
    fail(`Lição não encontrada: "${lessonKey}".`);
  }

  return { moduleValue, lesson };
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

function findMicrosequence(lesson, microsequenceKey) {
  const microsequence = lesson.microsequences.find((item) => item.key === microsequenceKey);
  if (!microsequence) {
    fail(`Microssequência não encontrada: "${microsequenceKey}".`);
  }

  return microsequence;
}

function ensureValidDocument(document) {
  const result = validateIntentV1Document(document);
  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    fail(`Documento inválido após edição: ${summary}`);
  }

  return result.value;
}

function collectSiblingKeys(items) {
  return new Set(items.map((item) => item.key).filter(Boolean));
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

function buildCardPayload({ title, data }) {
  const normalizedTitle = title && typeof title === "string" ? title.trim() : "";
  if (data !== undefined) {
    const nextData = clone(data);
    const defaultData = createDefaultCardData({
      title: normalizedTitle || "Novo card",
      text: typeof nextData.text === "string" ? nextData.text : ""
    });

    return {
      ...nextData,
      blocks: Array.isArray(nextData.blocks) ? nextData.blocks : defaultData.blocks,
      text: typeof nextData.text === "string" ? nextData.text : defaultData.text
    };
  }

  return createDefaultCardData({
    title: normalizedTitle || "Novo card"
  });
}

function createStarterCard(title = "Novo card") {
  return {
    key: uniqueKey("introducao", new Set(), "card"),
    intent: "text",
    title,
    data: createDefaultCardData({
      title
    })
  };
}

function createStarterMicrosequence({
  title = "Nova microssequência",
  objective = "Organizar o próximo bloco didático"
} = {}) {
  return {
    key: uniqueKey(title || objective, new Set(), "microsequence"),
    ...(title ? { title } : {}),
    objective,
    cards: [createStarterCard()]
  };
}

function createStarterLesson({
  title = "Nova lição",
  description
} = {}) {
  return {
    key: uniqueKey(title, new Set(), "lesson"),
    title,
    ...(description ? { description } : {}),
    microsequences: [createStarterMicrosequence()]
  };
}

function createStarterModule({
  title = "Novo módulo",
  description
} = {}) {
  return {
    key: uniqueKey(title, new Set(), "module"),
    title,
    ...(description ? { description } : {}),
    lessons: [createStarterLesson()]
  };
}

function createStarterCourse({
  title = "Novo curso",
  description
} = {}) {
  return {
    key: uniqueKey(title, new Set(), "course"),
    title,
    ...(description ? { description } : {}),
    modules: [createStarterModule()]
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
  const title =
    input.title && typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : "Novo curso";
  const description =
    input.description && typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : "";

  const usedKeys = collectSiblingKeys(nextDocument.courses || []);
  const course = createStarterCourse({
    title,
    description
  });
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
  const title =
    input.title && typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : "Novo módulo";
  const description =
    input.description && typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : "";
  const usedKeys = collectSiblingKeys(course.modules);
  const moduleValue = createStarterModule({
    title,
    description
  });

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
  const title =
    input.title && typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : "Nova lição";
  const description =
    input.description && typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : "";
  const usedKeys = collectSiblingKeys(moduleValue.lessons);
  const lesson = createStarterLesson({
    title,
    description
  });

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
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);

  assignOptionalTextField(lesson, "title", input.title);
  assignOptionalTextField(lesson, "description", input.description);

  return ensureValidDocument(nextDocument);
}

export function deleteLesson(document, input) {
  const nextDocument = clone(document);
  const { moduleValue } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
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
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
  const title = input.title && typeof input.title === "string" ? input.title.trim() : "";
  const objective = normalizeText(input.objective, "objective");

  const usedKeys = collectSiblingKeys(lesson.microsequences);
  const key = input.key && typeof input.key === "string" && input.key.trim()
    ? input.key.trim()
    : uniqueKey(title || objective, usedKeys, "microsequence");

  if (usedKeys.has(key)) {
    fail(`Key de microssequência duplicada: "${key}".`);
  }

  const starterCardKey = uniqueKey("introducao", new Set(), "card");
  const microsequence = {
    key,
    ...(title ? { title } : {}),
    objective,
    cards: [
      {
        key: starterCardKey,
        intent: "text",
        title: "Novo card",
        data: createDefaultCardData({
          title: "Novo card"
        })
      }
    ]
  };

  lesson.microsequences.push(microsequence);
  return ensureValidDocument(nextDocument);
}

export function updateMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);

  if (input.title !== undefined) {
    if (typeof input.title !== "string") {
      fail('Campo opcional inválido: "title".');
    }

    const nextTitle = input.title.trim();
    if (nextTitle) {
      microsequence.title = nextTitle;
    } else {
      delete microsequence.title;
    }
  }

  if (input.objective !== undefined) {
    microsequence.objective = normalizeText(input.objective, "objective");
  }

  return ensureValidDocument(nextDocument);
}

export function deleteMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
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

export function createCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const intent = normalizeText(input.intent, "intent");
  const title = input.title && typeof input.title === "string" ? input.title.trim() : "";
  const usedKeys = collectSiblingKeys(microsequence.cards);
  const key = input.key && typeof input.key === "string" && input.key.trim()
    ? input.key.trim()
    : uniqueKey(title || intent, usedKeys, "card");

  if (usedKeys.has(key)) {
    fail(`Key de card duplicada: "${key}".`);
  }

  const card = {
    key,
    intent,
    ...(title ? { title } : {}),
    data: buildCardPayload({
      title: title || "Novo card",
      data: input.data
    })
  };

  const position = Number.isInteger(input.position) ? input.position : microsequence.cards.length;
  const safeIndex = Math.max(0, Math.min(position, microsequence.cards.length));
  microsequence.cards.splice(safeIndex, 0, card);

  return ensureValidDocument(nextDocument);
}

export function updateCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const card = microsequence.cards.find((item) => item.key === input.cardKey);

  if (!card) {
    fail(`Card não encontrado: "${input.cardKey}".`);
  }

  if (input.title !== undefined) {
    if (typeof input.title !== "string") {
      fail('Campo opcional inválido: "title".');
    }

    const nextTitle = input.title.trim();
    if (nextTitle) {
      card.title = nextTitle;
    } else {
      delete card.title;
    }
  }

  if (input.intent !== undefined) {
    card.intent = normalizeText(input.intent, "intent");
  }

  if (input.data !== undefined) {
    card.data = clone(input.data);
  }

  return ensureValidDocument(nextDocument);
}

export function moveCardWithinMicrosequence(document, input) {
  const nextDocument = clone(document);
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
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
  const { lesson } = findLesson(nextDocument, input.moduleKey, input.lessonKey, input.courseKey);
  const microsequence = findMicrosequence(lesson, input.microsequenceKey);
  const fromIndex = microsequence.cards.findIndex((item) => item.key === input.cardKey);

  if (fromIndex < 0) {
    fail(`Card não encontrado: "${input.cardKey}".`);
  }

  microsequence.cards.splice(fromIndex, 1);

  if (!microsequence.cards.length) {
    const starterCardKey = uniqueKey("introducao", new Set(), "card");
    microsequence.cards.push({
      key: starterCardKey,
      intent: "text",
      title: "Novo card",
      data: createDefaultCardData({
        title: "Novo card"
      })
    });
  }

  return ensureValidDocument(nextDocument);
}

export function createEditorSession(storage) {
  if (!storage || typeof storage.loadProject !== "function" || typeof storage.saveProject !== "function") {
    fail("Storage inválido para sessão de edição.");
  }

  return {
    updateCourse(input) {
      const nextDocument = updateCourse(storage.loadProject(), input);
      storage.saveProject(nextDocument);
      return nextDocument;
    },

    createCourse(input) {
      const nextDocument = createCourse(storage.loadProject(), input);
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
