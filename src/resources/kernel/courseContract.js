import { COURSE_CONTRACT, normalizeCardEnvelope, validateCardEnvelope } from "./cardEnvelope.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function validateOrderedEntities(items, path, validateEntity) {
  const errors = [];
  const ids = new Set();
  list(items).forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    const id = text(item?.id);
    if (!id) errors.push(`${itemPath}.id é obrigatório.`);
    if (id && ids.has(id)) errors.push(`${itemPath}.id está duplicado.`);
    if (id) ids.add(id);
    if (item?.position !== index + 1) errors.push(`${itemPath}.position precisa ser ${index + 1}.`);
    errors.push(...validateEntity(item, itemPath));
  });
  return errors;
}

export function validateCourseDocument(document, registry) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { valid: false, errors: ["$ precisa ser um documento."] };
  }
  const allowedRoot = new Set(["contract", "course"]);
  Object.keys(document).forEach((key) => {
    if (!allowedRoot.has(key)) errors.push(`$.${key} não pertence ao contrato.`);
  });
  if (document.contract !== COURSE_CONTRACT) errors.push(`$.contract precisa ser ${COURSE_CONTRACT}.`);
  const course = document.course;
  if (!course || typeof course !== "object" || Array.isArray(course)) {
    errors.push("$.course é obrigatório.");
    return { valid: false, errors };
  }
  if (!text(course.id) || !text(course.title) || !text(course.goal)) {
    errors.push("$.course precisa de id, title e goal.");
  }
  errors.push(...validateOrderedEntities(course.modules, "$.course.modules", (module, modulePath) => {
    const moduleErrors = [];
    if (!text(module?.title) || !text(module?.goal)) moduleErrors.push(`${modulePath} precisa de title e goal.`);
    moduleErrors.push(...validateOrderedEntities(module?.lessons, `${modulePath}.lessons`, (lesson, lessonPath) => {
      const lessonErrors = [];
      if (!text(lesson?.title) || !text(lesson?.goal)) lessonErrors.push(`${lessonPath} precisa de title e goal.`);
      lessonErrors.push(...validateOrderedEntities(lesson?.microsequences, `${lessonPath}.microsequences`, (microsequence, microPath) => {
        const microErrors = [];
        if (!text(microsequence?.title) || !text(microsequence?.goal)) {
          microErrors.push(`${microPath} precisa de title e goal.`);
        }
        microErrors.push(...validateOrderedEntities(microsequence?.cards, `${microPath}.cards`, (card, cardPath) => (
          validateCardEnvelope(card, registry, cardPath).errors
        )));
        return microErrors;
      }));
      return lessonErrors;
    }));
    return moduleErrors;
  }));
  return { valid: errors.length === 0, errors };
}

function normalizeOrdered(items, normalizeEntity) {
  return list(items).map((item, index) => ({
    ...normalizeEntity(item),
    position: index + 1
  }));
}

export function normalizeCourseDocument(document, registry) {
  const course = document?.course || {};
  const normalized = {
    contract: COURSE_CONTRACT,
    course: {
      id: text(course.id),
      title: text(course.title),
      goal: text(course.goal),
      modules: normalizeOrdered(course.modules, (module) => ({
        id: text(module?.id),
        title: text(module?.title),
        goal: text(module?.goal),
        lessons: normalizeOrdered(module?.lessons, (lesson) => ({
          id: text(lesson?.id),
          title: text(lesson?.title),
          goal: text(lesson?.goal),
          microsequences: normalizeOrdered(lesson?.microsequences, (microsequence) => ({
            id: text(microsequence?.id),
            title: text(microsequence?.title),
            goal: text(microsequence?.goal),
            cards: normalizeOrdered(microsequence?.cards, (card) => normalizeCardEnvelope(card, registry))
          }))
        }))
      }))
    }
  };
  const validation = validateCourseDocument(normalized, registry);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return normalized;
}
