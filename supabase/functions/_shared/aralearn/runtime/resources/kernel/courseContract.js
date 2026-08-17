import {
  COURSE_CONTRACT,
  normalizeStudyUnitEnvelope,
  validateStudyUnitEnvelope
} from "./studyUnitEnvelope.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function validateTextList(value, path) {
  if (!Array.isArray(value)) return [`${path} precisa ser uma lista.`];
  const errors = [];
  value.forEach((item, index) => {
    if (!text(item)) errors.push(`${path}[${index}] precisa ser texto não vazio.`);
  });
  if (new Set(value).size !== value.length) errors.push(`${path} não aceita duplicatas.`);
  return errors;
}

function validateGuidance(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [`${path} precisa ser um objeto.`];
  }
  const errors = [];
  for (const field of ["include", "exclude", "notation", "avoid"]) {
    errors.push(...validateTextList(value[field], `${path}.${field}`));
  }
  return errors;
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
    moduleErrors.push(...validateGuidance(module?.guidance, `${modulePath}.guidance`));
    moduleErrors.push(...validateOrderedEntities(module?.lessons, `${modulePath}.lessons`, (lesson, lessonPath) => {
      const lessonErrors = [];
      if (!text(lesson?.title) || !text(lesson?.goal)) lessonErrors.push(`${lessonPath} precisa de title e goal.`);
      lessonErrors.push(...validateGuidance(lesson?.guidance, `${lessonPath}.guidance`));
      if (!Array.isArray(lesson?.topics)) lessonErrors.push(`${lessonPath}.topics precisa ser uma lista.`);
      lessonErrors.push(...validateOrderedEntities(lesson?.microsequences, `${lessonPath}.microsequences`, (microsequence, microPath) => {
        const microErrors = [];
        if (!text(microsequence?.title) || !text(microsequence?.goal)) {
          microErrors.push(`${microPath} precisa de title e goal.`);
        }
        for (const field of ["dependsOn", "covers", "checks", "errors"]) {
          microErrors.push(...validateTextList(microsequence?.[field], `${microPath}.${field}`));
        }
        microErrors.push(...validateOrderedEntities(
          microsequence?.studyUnits,
          `${microPath}.studyUnits`,
          (studyUnit, studyUnitPath) => (
            validateStudyUnitEnvelope(studyUnit, registry, studyUnitPath).errors
          )
        ));
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
        guidance: {
          include: list(module?.guidance?.include).map(text).filter(Boolean),
          exclude: list(module?.guidance?.exclude).map(text).filter(Boolean),
          notation: list(module?.guidance?.notation).map(text).filter(Boolean),
          avoid: list(module?.guidance?.avoid).map(text).filter(Boolean)
        },
        lessons: normalizeOrdered(module?.lessons, (lesson) => ({
          id: text(lesson?.id),
          title: text(lesson?.title),
          goal: text(lesson?.goal),
          guidance: {
            include: list(lesson?.guidance?.include).map(text).filter(Boolean),
            exclude: list(lesson?.guidance?.exclude).map(text).filter(Boolean),
            notation: list(lesson?.guidance?.notation).map(text).filter(Boolean),
            avoid: list(lesson?.guidance?.avoid).map(text).filter(Boolean)
          },
          topics: list(lesson?.topics).map((topic) => structuredClone(topic)),
          microsequences: normalizeOrdered(lesson?.microsequences, (microsequence) => ({
            id: text(microsequence?.id),
            title: text(microsequence?.title),
            goal: text(microsequence?.goal),
            ...(text(microsequence?.role) ? { role: text(microsequence.role) } : {}),
            ...(text(microsequence?.branchOf) ? { branchOf: text(microsequence.branchOf) } : {}),
            dependsOn: list(microsequence?.dependsOn).map(text).filter(Boolean),
            covers: list(microsequence?.covers).map(text).filter(Boolean),
            checks: list(microsequence?.checks).map(text).filter(Boolean),
            errors: list(microsequence?.errors).map(text).filter(Boolean),
            studyUnits: normalizeOrdered(
              microsequence?.studyUnits,
              (studyUnit) => normalizeStudyUnitEnvelope(studyUnit, registry)
            )
          }))
        }))
      }))
    }
  };
  const validation = validateCourseDocument(normalized, registry);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return normalized;
}
