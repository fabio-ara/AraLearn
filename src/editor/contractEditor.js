import {
  CONTRACT_KIND_PROJECT,
  CONTRACT_NAME,
  CONTRACT_VERSION,
  validateContractDocument
} from "../contract/validateContract.js";
import {
  createStarterContractCard,
  sanitizeContractCard
} from "../contract/contractCard.js";
import { PROJECT_CONTRACT, PROJECT_VERSION } from "../domain/aralearnProject.js";
import {
  MICROSEQUENCE_STATUS_DRAFT,
  MICROSEQUENCE_STATUS_READY,
  normalizeMicrosequenceStatus
} from "../model/microsequenceStatus.js";
import { normalizeGuide as normalizeGuideFields, GUIDE_LEVELS } from "../sourceGuides/sourceGuideStructured.js";

function clone(value) {
  return structuredClone(value);
}

function fail(message) {
  throw new Error(message);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function normalizeText(value, fieldName) {
  const normalized = text(value);
  if (!normalized) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }
  return normalized;
}

function normalizeOptionalText(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    fail(`Campo opcional inválido: "${fieldName}".`);
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeOptionalStringArray(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail(`Campo opcional inválido: "${fieldName}".`);
  }
  return uniqueList(value);
}

function assertNoEntityKey(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "key")) {
    fail('Campo fora do schema: "key".');
  }
}

function collectSiblingIds(items = []) {
  return new Set((Array.isArray(items) ? items : []).map((item) => text(item?.id)).filter(Boolean));
}

function uniqueId(baseLabel, usedIds, prefix) {
  const slug = slugify(baseLabel) || prefix;
  let candidate = `${prefix}-${slug}`;
  let counter = 2;
  while (usedIds.has(candidate)) {
    candidate = `${prefix}-${slug}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function resolveEntityId(input = {}, usedIds, prefix, baseLabel) {
  const requestedId = text(input?.id);
  if (requestedId) {
    if (usedIds.has(requestedId)) {
      fail(`id duplicado: "${requestedId}".`);
    }
    return requestedId;
  }
  return uniqueId(baseLabel, usedIds, prefix);
}

function ensureValidDocument(document) {
  const result = validateContractDocument(document);
  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    fail(`Documento inválido após edição: ${summary}`);
  }
  return result.value;
}

function normalizeGuide(input = {}, level = GUIDE_LEVELS.LESSON, fallbackGoal = "") {
  const structured = normalizeGuideFields({
    goal: text(input?.goal) || fallbackGoal,
    include: Array.isArray(input?.include) ? input.include : [],
    exclude: Array.isArray(input?.exclude) ? input.exclude : [],
    notation: Array.isArray(input?.notation) ? input.notation : [],
    avoid: Array.isArray(input?.avoid) ? input.avoid : []
  }, { level });
  const goal = text(structured.goal) || fallbackGoal;
  return {
    goal,
    include: uniqueList(structured.include),
    exclude: uniqueList(structured.exclude),
    notation: uniqueList(structured.notation),
    avoid: uniqueList(structured.avoid)
  };
}

function normalizeCourseDraft(input = {}, usedIds = new Set()) {
  assertNoEntityKey(input);
  const title = normalizeText(input.title || "Novo curso", "title");
  return {
    id: resolveEntityId(input, usedIds, "course", title),
    title,
    goal: text(input.goal) || `Organizar ${title}.`,
    modules: []
  };
}

function normalizeModuleDraft(input = {}, usedIds = new Set()) {
  assertNoEntityKey(input);
  const title = normalizeText(input.title || "Novo módulo", "title");
  return {
    id: resolveEntityId(input, usedIds, "module", title),
    title,
    guide: normalizeGuide(input.guide || input, GUIDE_LEVELS.MODULE, text(input.goal) || `Guiar ${title}.`),
    lessons: []
  };
}

function normalizeLessonDraft(input = {}, usedIds = new Set()) {
  assertNoEntityKey(input);
  const title = normalizeText(input.title || "Nova lição", "title");
  return {
    id: resolveEntityId(input, usedIds, "lesson", title),
    title,
    guide: normalizeGuide(input.guide || input, GUIDE_LEVELS.LESSON, text(input.goal) || `Guiar ${title}.`),
    topics: Array.isArray(input.topics) ? clone(input.topics) : [],
    microsequences: []
  };
}

function normalizeCardToken(card, index = 0) {
  return text(card?.id) || `card-${Number(card?.position) || index + 1}`;
}

function ensureUniqueCardIds(cards = []) {
  const seen = new Set();
  return cards.map((card, index) => {
    const baseId = normalizeCardToken(card, index);
    let nextId = baseId;
    let counter = 2;
    while (seen.has(nextId)) {
      nextId = `${baseId}-${counter}`;
      counter += 1;
    }
    seen.add(nextId);
    return {
      ...card,
      id: nextId
    };
  });
}

function normalizeCards(cards = []) {
  const normalized = (Array.isArray(cards) ? cards : []).map((entry, index) => sanitizeContractCard({
    ...entry,
    position: index + 1
  }));
  return ensureUniqueCardIds(normalized);
}

function resolveMicrosequenceCards(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

function replaceMicrosequenceCardsDirectly(microsequence, cards = []) {
  microsequence.cards = normalizeCards(cards);
  return microsequence.cards;
}

function normalizeMicrosequenceDraft(input = {}, usedIds = new Set()) {
  assertNoEntityKey(input);
  const title = normalizeText(input.title || "Nova microssequência", "title");
  const cards = normalizeCards(input.cards);
  const status = normalizeMicrosequenceStatus(input.status, { cards });
  const role = text(input.role) || "explain";
  const microsequence = {
    id: resolveEntityId(input, usedIds, "microsequence", title),
    title,
    goal: text(input.goal) || `Explicar ${title}.`,
    role,
    status: cards.length ? status : MICROSEQUENCE_STATUS_DRAFT,
    dependsOn: uniqueList(input.dependsOn),
    covers: uniqueList(input.covers),
    checks: uniqueList(input.checks),
    cards
  };
  if (cards.length) microsequence.status = status || MICROSEQUENCE_STATUS_READY;
  return microsequence;
}

function findCourse(document, courseKey) {
  const course = (document.courses || []).find((item) => item.id === courseKey);
  if (!course) {
    fail(`Curso não encontrado: "${courseKey}".`);
  }
  return course;
}

function findModule(document, courseKey, moduleKey) {
  const course = findCourse(document, courseKey);
  const moduleValue = (course.modules || []).find((item) => item.id === moduleKey);
  if (!moduleValue) {
    fail(`Módulo não encontrado: "${moduleKey}".`);
  }
  return { course, moduleValue };
}

function findLesson(document, courseKey, moduleKey, lessonKey) {
  const { moduleValue } = findModule(document, courseKey, moduleKey);
  const lesson = (moduleValue.lessons || []).find((item) => item.id === lessonKey);
  if (!lesson) {
    fail(`Lição não encontrada: "${lessonKey}".`);
  }
  return { moduleValue, lesson };
}

function findMicrosequence(lesson, microsequenceKey) {
  const microsequence = (lesson.microsequences || []).find((item) => item.id === microsequenceKey);
  if (!microsequence) {
    fail(`Microssequência não encontrada: "${microsequenceKey}".`);
  }
  return microsequence;
}

function findCardIndex(microsequence, cardKey) {
  const cards = resolveMicrosequenceCards(microsequence);
  return cards.findIndex((card, index) => normalizeCardToken(card, index) === cardKey);
}

function assignTitleIfProvided(record, title) {
  const nextTitle = normalizeOptionalText(title, "title");
  if (nextTitle !== undefined) {
    record.title = nextTitle;
  }
}

function reorderSiblingItems(items, entityId, toIndex, label) {
  const fromIndex = items.findIndex((item) => item.id === entityId);
  if (fromIndex < 0) {
    fail(`${label} não encontrado: "${entityId}".`);
  }
  const [item] = items.splice(fromIndex, 1);
  const safeIndex = Math.max(0, Math.min(Number.isInteger(toIndex) ? toIndex : items.length, items.length));
  items.splice(safeIndex, 0, item);
  return { fromIndex, toIndex: safeIndex, item };
}

function buildProjectSlice(scope, course) {
  return ensureValidDocument({
    contract: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    kind: CONTRACT_KIND_PROJECT,
    scope,
    courses: course ? [clone(course)] : []
  });
}

function cloneCourseForImport(course, usedCourseIds) {
  const nextCourse = clone(course);
  const nextCourseId = resolveEntityId(nextCourse, usedCourseIds, "course", nextCourse.title || "course");
  nextCourse.id = nextCourseId;
  nextCourse.modules = (nextCourse.modules || []).map((moduleValue) => {
    const usedModuleIds = new Set();
    const nextModule = clone(moduleValue);
    nextModule.id = resolveEntityId(nextModule, usedModuleIds, "module", nextModule.title || "module");
    nextModule.lessons = (nextModule.lessons || []).map((lesson) => {
      const usedLessonIds = new Set();
      const nextLesson = clone(lesson);
      nextLesson.id = resolveEntityId(nextLesson, usedLessonIds, "lesson", nextLesson.title || "lesson");
      nextLesson.microsequences = (nextLesson.microsequences || []).map((microsequence) => {
        const usedMicroIds = new Set();
        const nextMicrosequence = clone(microsequence);
        nextMicrosequence.id = resolveEntityId(nextMicrosequence, usedMicroIds, "microsequence", nextMicrosequence.title || "microsequence");
        return nextMicrosequence;
      });
      return nextLesson;
    });
    return nextModule;
  });
  return nextCourse;
}

export function updateCourse(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const course = findCourse(nextDocument, courseKey);
  assignTitleIfProvided(course, input.title);
  if (input.goal !== undefined) {
    course.goal = normalizeText(input.goal, "goal");
  }
  return ensureValidDocument(nextDocument);
}

export function createCourse(document, input = {}) {
  const nextDocument = clone(document);
  if (!Array.isArray(nextDocument.courses)) {
    nextDocument.courses = [];
  }
  nextDocument.courses.push(normalizeCourseDraft(input, collectSiblingIds(nextDocument.courses)));
  return ensureValidDocument(nextDocument);
}

export function importCourses(document, input = {}) {
  const nextDocument = clone(document);
  const imported = ensureValidDocument(input.document);
  const usedCourseIds = collectSiblingIds(nextDocument.courses);
  imported.courses.forEach((course) => {
    const importedCourse = cloneCourseForImport(course, usedCourseIds);
    usedCourseIds.add(importedCourse.id);
    nextDocument.courses.push(importedCourse);
  });
  return ensureValidDocument(nextDocument);
}

export function importModules(document, input = {}) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const course = findCourse(nextDocument, courseKey);
  const imported = ensureValidDocument(input.document);
  if (imported.courses.length !== 1) {
    fail("Importação de módulo exige um único curso no recorte.");
  }
  const usedIds = collectSiblingIds(course.modules);
  (imported.courses[0].modules || []).forEach((moduleValue) => {
    const nextModule = clone(moduleValue);
    nextModule.id = resolveEntityId(nextModule, usedIds, "module", nextModule.title || "module");
    usedIds.add(nextModule.id);
    course.modules.push(nextModule);
  });
  return ensureValidDocument(nextDocument);
}

export function importLessons(document, input = {}) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const { moduleValue } = findModule(nextDocument, courseKey, moduleKey);
  const imported = ensureValidDocument(input.document);
  if (imported.courses.length !== 1 || (imported.courses[0].modules || []).length !== 1) {
    fail("Importação de lição exige um único módulo no recorte.");
  }
  const usedIds = collectSiblingIds(moduleValue.lessons);
  (imported.courses[0].modules[0].lessons || []).forEach((lesson) => {
    const nextLesson = clone(lesson);
    nextLesson.id = resolveEntityId(nextLesson, usedIds, "lesson", nextLesson.title || "lesson");
    usedIds.add(nextLesson.id);
    moduleValue.lessons.push(nextLesson);
  });
  return ensureValidDocument(nextDocument);
}

export function importMicrosequences(document, input = {}) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const imported = ensureValidDocument(input.document);
  if (
    imported.courses.length !== 1 ||
    (imported.courses[0].modules || []).length !== 1 ||
    (imported.courses[0].modules[0].lessons || []).length !== 1
  ) {
    fail("Importação de microssequência exige uma única lição no recorte.");
  }
  const usedIds = collectSiblingIds(lesson.microsequences);
  (imported.courses[0].modules[0].lessons[0].microsequences || []).forEach((microsequence) => {
    const nextMicrosequence = clone(microsequence);
    nextMicrosequence.id = resolveEntityId(nextMicrosequence, usedIds, "microsequence", nextMicrosequence.title || "microsequence");
    usedIds.add(nextMicrosequence.id);
    lesson.microsequences.push(nextMicrosequence);
  });
  return ensureValidDocument(nextDocument);
}

export function exportCourseDocument(document, input) {
  const courseKey = text(input?.courseKey);
  return buildProjectSlice("course", findCourse(document, courseKey));
}

export function exportModuleDocument(document, input) {
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const { course, moduleValue } = findModule(document, courseKey, moduleKey);
  return buildProjectSlice("module", {
    ...clone(course),
    modules: [clone(moduleValue)]
  });
}

export function exportLessonDocument(document, input) {
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const { course, moduleValue } = findModule(document, courseKey, moduleKey);
  const lesson = (moduleValue.lessons || []).find((item) => item.id === lessonKey);
  if (!lesson) {
    fail(`Lição não encontrada: "${lessonKey}".`);
  }
  return buildProjectSlice("lesson", {
    ...clone(course),
    modules: [{ ...clone(moduleValue), lessons: [clone(lesson)] }]
  });
}

export function exportMicrosequenceDocument(document, input) {
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { course, moduleValue } = findModule(document, courseKey, moduleKey);
  const lesson = (moduleValue.lessons || []).find((item) => item.id === lessonKey);
  if (!lesson) {
    fail(`Lição não encontrada: "${lessonKey}".`);
  }
  const microsequence = (lesson.microsequences || []).find((item) => item.id === microsequenceKey);
  if (!microsequence) {
    fail(`Microssequência não encontrada: "${microsequenceKey}".`);
  }
  return buildProjectSlice("microsequence", {
    ...clone(course),
    modules: [{
      ...clone(moduleValue),
      lessons: [{
        ...clone(lesson),
        microsequences: [clone(microsequence)]
      }]
    }]
  });
}

export function deleteCourse(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const index = (nextDocument.courses || []).findIndex((item) => item.id === courseKey);
  if (index < 0) {
    fail(`Curso não encontrado: "${courseKey}".`);
  }
  nextDocument.courses.splice(index, 1);
  return ensureValidDocument(nextDocument);
}

export function moveCourse(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  reorderSiblingItems(nextDocument.courses || [], courseKey, input.toIndex, "Curso");
  return ensureValidDocument(nextDocument);
}

export function createModule(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const course = findCourse(nextDocument, courseKey);
  course.modules.push(normalizeModuleDraft(input, collectSiblingIds(course.modules)));
  return ensureValidDocument(nextDocument);
}

export function updateModule(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const { moduleValue } = findModule(nextDocument, courseKey, moduleKey);
  assignTitleIfProvided(moduleValue, input.title);
  if (input.guide !== undefined || input.goal !== undefined || input.include !== undefined || input.exclude !== undefined || input.notation !== undefined || input.avoid !== undefined) {
    moduleValue.guide = normalizeGuide(input.guide || input, GUIDE_LEVELS.MODULE, text(input.goal) || moduleValue.guide.goal);
  }
  return ensureValidDocument(nextDocument);
}

export function deleteModule(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const course = findCourse(nextDocument, courseKey);
  const index = (course.modules || []).findIndex((item) => item.id === moduleKey);
  if (index < 0) {
    fail(`Módulo não encontrado: "${moduleKey}".`);
  }
  course.modules.splice(index, 1);
  return ensureValidDocument(nextDocument);
}

export function moveModule(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const course = findCourse(nextDocument, courseKey);
  reorderSiblingItems(course.modules || [], moduleKey, input.toIndex, "Módulo");
  return ensureValidDocument(nextDocument);
}

export function createLesson(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const { moduleValue } = findModule(nextDocument, courseKey, moduleKey);
  moduleValue.lessons.push(normalizeLessonDraft(input, collectSiblingIds(moduleValue.lessons)));
  return ensureValidDocument(nextDocument);
}

export function updateLesson(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  assignTitleIfProvided(lesson, input.title);
  if (input.guide !== undefined || input.goal !== undefined || input.include !== undefined || input.exclude !== undefined || input.notation !== undefined || input.avoid !== undefined) {
    lesson.guide = normalizeGuide(input.guide || input, GUIDE_LEVELS.LESSON, text(input.goal) || lesson.guide.goal);
  }
  if (input.topics !== undefined) {
    if (!Array.isArray(input.topics)) {
      fail('Campo opcional inválido: "topics".');
    }
    lesson.topics = clone(input.topics);
  }
  return ensureValidDocument(nextDocument);
}

export function deleteLesson(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const { moduleValue } = findModule(nextDocument, courseKey, moduleKey);
  const index = (moduleValue.lessons || []).findIndex((item) => item.id === lessonKey);
  if (index < 0) {
    fail(`Lição não encontrada: "${lessonKey}".`);
  }
  moduleValue.lessons.splice(index, 1);
  return ensureValidDocument(nextDocument);
}

export function moveLesson(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const { moduleValue } = findModule(nextDocument, courseKey, moduleKey);
  reorderSiblingItems(moduleValue.lessons || [], lessonKey, input.toIndex, "Lição");
  return ensureValidDocument(nextDocument);
}

export function createMicrosequence(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  lesson.microsequences.push(normalizeMicrosequenceDraft(input, collectSiblingIds(lesson.microsequences)));
  return ensureValidDocument(nextDocument);
}

export function updateMicrosequence(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const microsequence = findMicrosequence(lesson, microsequenceKey);
  assignTitleIfProvided(microsequence, input.title);
  if (input.goal !== undefined) {
    microsequence.goal = normalizeText(input.goal, "goal");
  }
  if (input.role !== undefined) {
    microsequence.role = normalizeText(input.role, "role");
  }
  if (input.dependsOn !== undefined) {
    microsequence.dependsOn = normalizeOptionalStringArray(input.dependsOn, "dependsOn") || [];
  }
  if (input.covers !== undefined) {
    microsequence.covers = normalizeOptionalStringArray(input.covers, "covers") || [];
  }
  if (input.checks !== undefined) {
    microsequence.checks = normalizeOptionalStringArray(input.checks, "checks") || [];
  }
  if (input.status !== undefined) {
    microsequence.status = normalizeMicrosequenceStatus(input.status, microsequence);
  }
  return ensureValidDocument(nextDocument);
}

export function deleteMicrosequence(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const index = (lesson.microsequences || []).findIndex((item) => item.id === microsequenceKey);
  if (index < 0) {
    fail(`Microssequência não encontrada: "${microsequenceKey}".`);
  }
  lesson.microsequences.splice(index, 1);
  return ensureValidDocument(nextDocument);
}

export function moveMicrosequenceWithResult(document, input) {
  const nextDocument = clone(document);
  const sourceCourseKey = text(input?.courseKey);
  const sourceModuleKey = text(input?.moduleKey);
  const sourceLessonKey = text(input?.lessonKey);
  const targetCourseKey = text(input?.targetCourseKey);
  const targetModuleKey = text(input?.targetModuleKey);
  const targetLessonKey = text(input?.targetLessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson: sourceLesson } = findLesson(nextDocument, sourceCourseKey, sourceModuleKey, sourceLessonKey);
  const { lesson: targetLesson } = findLesson(nextDocument, targetCourseKey, targetModuleKey, targetLessonKey);
  const index = (sourceLesson.microsequences || []).findIndex((item) => item.id === microsequenceKey);
  if (index < 0) {
    fail(`Microssequência não encontrada: "${microsequenceKey}".`);
  }
  const [microsequence] = sourceLesson.microsequences.splice(index, 1);
  const usedIds = collectSiblingIds(targetLesson.microsequences);
  if (usedIds.has(microsequence.id)) {
    microsequence.id = uniqueId(microsequence.title || microsequence.id, usedIds, "microsequence");
  }
  const safeIndex = Math.max(0, Math.min(Number.isInteger(input.targetPosition) ? input.targetPosition : targetLesson.microsequences.length, targetLesson.microsequences.length));
  targetLesson.microsequences.splice(safeIndex, 0, microsequence);
  return {
    document: ensureValidDocument(nextDocument),
    movedMicrosequence: {
      courseKey: targetCourseKey,
      moduleKey: targetModuleKey,
      lessonKey: targetLessonKey,
      microsequenceKey: microsequence.id,
      previousMicrosequenceKey: microsequenceKey,
      position: safeIndex
    }
  };
}

export function moveMicrosequence(document, input) {
  return moveMicrosequenceWithResult(document, input).document;
}

export function replaceMicrosequenceCards(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const microsequence = findMicrosequence(lesson, microsequenceKey);
  if (input.title !== undefined) {
    microsequence.title = normalizeText(input.title, "title");
  }
  if (input.goal !== undefined) {
    microsequence.goal = normalizeText(input.goal, "goal");
  }
  if (input.role !== undefined) {
    microsequence.role = normalizeText(input.role, "role");
  }
  if (input.dependsOn !== undefined) {
    microsequence.dependsOn = normalizeOptionalStringArray(input.dependsOn, "dependsOn") || [];
  }
  if (input.covers !== undefined) {
    microsequence.covers = normalizeOptionalStringArray(input.covers, "covers") || [];
  }
  if (input.checks !== undefined) {
    microsequence.checks = normalizeOptionalStringArray(input.checks, "checks") || [];
  }
  const cards = normalizeCards(input.cards);
  replaceMicrosequenceCardsDirectly(microsequence, cards);
  microsequence.status = cards.length
    ? normalizeMicrosequenceStatus(input.status || microsequence.status || MICROSEQUENCE_STATUS_READY, microsequence)
    : MICROSEQUENCE_STATUS_DRAFT;
  return ensureValidDocument(nextDocument);
}

export function createCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const microsequence = findMicrosequence(lesson, microsequenceKey);
  const cards = resolveMicrosequenceCards(microsequence).slice();
  const rawCard = input.card && typeof input.card === "object" ? input.card : input;
  const normalizedCard = sanitizeContractCard({
    ...createStarterContractCard(text(rawCard?.resource) || "paragraph"),
    ...rawCard,
    position: 1
  });
  const insertIndex = Math.max(0, Math.min(Number.isInteger(input.position) ? input.position : cards.length, cards.length));
  cards.splice(insertIndex, 0, normalizedCard);
  replaceMicrosequenceCardsDirectly(microsequence, cards);
  microsequence.status = normalizeMicrosequenceStatus(input.status || microsequence.status || MICROSEQUENCE_STATUS_READY, microsequence);
  return ensureValidDocument(nextDocument);
}

export function updateCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const microsequence = findMicrosequence(lesson, microsequenceKey);
  const cards = resolveMicrosequenceCards(microsequence).slice();
  const cardKey = text(input?.cardKey);
  const cardIndex = findCardIndex(microsequence, cardKey);
  if (cardIndex < 0) {
    fail(`Card não encontrado: "${cardKey}".`);
  }
  const currentCard = cards[cardIndex];
  const patch = input.card && typeof input.card === "object" ? input.card : input;
  cards[cardIndex] = sanitizeContractCard({
    ...currentCard,
    ...patch,
    position: currentCard.position
  });
  replaceMicrosequenceCardsDirectly(microsequence, cards);
  return ensureValidDocument(nextDocument);
}

export function moveCardWithinMicrosequence(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const microsequence = findMicrosequence(lesson, microsequenceKey);
  const cards = resolveMicrosequenceCards(microsequence).slice();
  const cardKey = text(input?.cardKey);
  const fromIndex = cards.findIndex((card, index) => normalizeCardToken(card, index) === cardKey);
  if (fromIndex < 0) {
    fail(`Card não encontrado: "${cardKey}".`);
  }
  const [card] = cards.splice(fromIndex, 1);
  const safeIndex = Math.max(0, Math.min(Number.isInteger(input.toIndex) ? input.toIndex : cards.length, cards.length));
  cards.splice(safeIndex, 0, card);
  replaceMicrosequenceCardsDirectly(microsequence, cards);
  return ensureValidDocument(nextDocument);
}

export function deleteCardInMicrosequence(document, input) {
  const nextDocument = clone(document);
  const courseKey = text(input?.courseKey);
  const moduleKey = text(input?.moduleKey);
  const lessonKey = text(input?.lessonKey);
  const microsequenceKey = text(input?.microsequenceKey);
  const { lesson } = findLesson(nextDocument, courseKey, moduleKey, lessonKey);
  const microsequence = findMicrosequence(lesson, microsequenceKey);
  const cards = resolveMicrosequenceCards(microsequence).slice();
  const cardKey = text(input?.cardKey);
  const index = cards.findIndex((card, cardIndex) => normalizeCardToken(card, cardIndex) === cardKey);
  if (index < 0) {
    fail(`Card não encontrado: "${cardKey}".`);
  }
  cards.splice(index, 1);
  replaceMicrosequenceCardsDirectly(microsequence, cards);
  microsequence.status = cards.length ? normalizeMicrosequenceStatus(microsequence.status || MICROSEQUENCE_STATUS_READY, microsequence) : MICROSEQUENCE_STATUS_DRAFT;
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

export { PROJECT_CONTRACT, PROJECT_VERSION };
