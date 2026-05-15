import { patchTargetWithinScope, resolveCourseForgeScope } from "./courseForgeScope.js";
import { COURSE_FORGE_PATCH_TYPE } from "./courseForgeSchemas.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function normalizeOperation(operation = {}) {
  return {
    ...clone(operation),
    op: text(operation.op)
  };
}

function normalizeMicrosequenceForPatch(microsequence = {}) {
  const publicCards = Array.isArray(microsequence?.publicCards)
    ? clone(microsequence.publicCards)
    : Array.isArray(microsequence?.cards)
      ? clone(microsequence.cards)
      : [];
  return {
    key: text(microsequence?.key),
    title: text(microsequence?.title) || "Nova microssequência",
    description: text(microsequence?.description || microsequence?.objective),
    status: publicCards.length ? "ready" : "draft",
    included: publicCards.length > 0,
    tags: Array.isArray(microsequence?.tags) ? microsequence.tags.map(text).filter(Boolean) : [],
    domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs.map(text).filter(Boolean) : [],
    practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs) ? microsequence.practiceVariantRefs.map(text).filter(Boolean) : [],
    didacticPurpose: text(microsequence?.didacticPurpose || microsequence?.objective),
    coverageRole: text(microsequence?.coverageRole),
    publicCards
  };
}

function findCourse(projectDocument = {}, courseKey = "") {
  return (Array.isArray(projectDocument?.courses) ? projectDocument.courses : []).find((course) => text(course?.key) === text(courseKey)) || null;
}

function findModule(projectDocument = {}, courseKey = "", moduleKey = "") {
  return (findCourse(projectDocument, courseKey)?.modules || []).find((moduleValue) => text(moduleValue?.key) === text(moduleKey)) || null;
}

function findLesson(projectDocument = {}, courseKey = "", moduleKey = "", lessonKey = "") {
  return (findModule(projectDocument, courseKey, moduleKey)?.lessons || []).find((lesson) => text(lesson?.key) === text(lessonKey)) || null;
}

function findMicrosequence(projectDocument = {}, courseKey = "", moduleKey = "", lessonKey = "", microsequenceKey = "") {
  return (findLesson(projectDocument, courseKey, moduleKey, lessonKey)?.microsequences || []).find(
    (microsequence) => text(microsequence?.key) === text(microsequenceKey)
  ) || null;
}

function buildCourseOperation(course = {}, exists = false) {
  const payload = {
    key: text(course?.key),
    title: text(course?.title) || "Novo curso",
    description: text(course?.description),
    modules: []
  };
  return exists
    ? { op: "update_course", courseKey: text(course?.key), course: payload }
    : { op: "add_course", course: payload };
}

function buildModuleOperation(courseKey = "", moduleValue = {}, exists = false) {
  const payload = {
    key: text(moduleValue?.key),
    title: text(moduleValue?.title) || "Novo módulo",
    description: text(moduleValue?.description)
  };
  return exists
    ? { op: "update_module", courseKey, moduleKey: text(moduleValue?.key), module: payload }
    : { op: "add_module", courseKey, module: payload };
}

function buildLessonOperation(courseKey = "", moduleKey = "", lesson = {}, exists = false) {
  const payload = clone(lesson);
  return exists
    ? { op: "update_lesson", courseKey, moduleKey, lessonKey: text(lesson?.key), lesson: payload }
    : { op: "add_lesson", courseKey, moduleKey, lesson: payload };
}

function buildMicrosequenceOperations({
  courseKey = "",
  moduleKey = "",
  lessonKey = "",
  microsequence = {},
  exists = false
} = {}) {
  const normalized = normalizeMicrosequenceForPatch(microsequence);
  const sharedTarget = {
    courseKey,
    moduleKey,
    lessonKey,
    microsequenceKey: normalized.key
  };
  const microsequencePatch = {
    key: normalized.key,
    title: normalized.title,
    description: normalized.description,
    status: normalized.status,
    included: normalized.included,
    tags: normalized.tags,
    domainRefs: normalized.domainRefs,
    practiceVariantRefs: normalized.practiceVariantRefs,
    didacticPurpose: normalized.didacticPurpose,
    coverageRole: normalized.coverageRole,
    ...(normalized.publicCards.length ? { cards: normalized.publicCards } : {})
  };

  if (!exists) {
    return [{
      op: "add_microsequence",
      courseKey,
      moduleKey,
      lessonKey,
      microsequence: microsequencePatch
    }];
  }

  const operations = [{
    op: "update_microsequence",
    ...sharedTarget,
    microsequence: {
      title: normalized.title,
      description: normalized.description,
      status: normalized.status,
      included: normalized.included,
      tags: normalized.tags,
      domainRefs: normalized.domainRefs,
      practiceVariantRefs: normalized.practiceVariantRefs,
      didacticPurpose: normalized.didacticPurpose,
      coverageRole: normalized.coverageRole
    }
  }];
  if (normalized.publicCards.length) {
    operations.push({
      op: "replace_microsequence_cards",
      ...sharedTarget,
      microsequence: {
        cards: normalized.publicCards,
        status: normalized.status,
        included: normalized.included
      }
    });
  }
  return operations;
}

export function compileCourseStructureToPatch({ intent, architectureDraft, projectDocument = {} }) {
  if (architectureDraft?.patch) {
    return clone(architectureDraft.patch);
  }

  const course = architectureDraft?.course;
  if (!course) {
    throw new Error("Arquitetura sem curso para compilar patch.");
  }

  const courseKey = text(course.key);
  const existingCourse = findCourse(projectDocument, courseKey);
  const operations = [buildCourseOperation(course, Boolean(existingCourse))];

  const microsequencePlansByLessonKey = new Map(
    (Array.isArray(architectureDraft?.microsequencePlans) ? architectureDraft.microsequencePlans : [])
      .map((entry) => [text(entry?.lessonKey), entry])
      .filter(([lessonKey]) => lessonKey)
  );

  (course.modules || []).forEach((moduleValue) => {
    const moduleKey = text(moduleValue.key);
    const existingModule = findModule(projectDocument, courseKey, moduleKey);
    operations.push(buildModuleOperation(courseKey, moduleValue, Boolean(existingModule)));
    (moduleValue.lessons || []).forEach((lesson) => {
      const lessonKey = text(lesson?.key);
      const existingLesson = findLesson(projectDocument, courseKey, moduleKey, lessonKey);
      operations.push(buildLessonOperation(courseKey, moduleKey, lesson, Boolean(existingLesson)));
      const lessonMicrosequencePlan = microsequencePlansByLessonKey.get(text(lesson?.key));
      (Array.isArray(lessonMicrosequencePlan?.microsequences) ? lessonMicrosequencePlan.microsequences : []).forEach((microsequence) => {
        const existingMicrosequence = findMicrosequence(projectDocument, courseKey, moduleKey, lessonKey, text(microsequence?.key));
        operations.push(
          ...buildMicrosequenceOperations({
            courseKey,
            moduleKey,
            lessonKey,
            microsequence,
            exists: Boolean(existingMicrosequence)
          })
        );
      });
    });
  });

  return {
    patchType: COURSE_FORGE_PATCH_TYPE,
    target: clone(intent?.scope || { level: "project" }),
    operations
  };
}

export function validateCourseForgePatch(patch = {}, { intent = {} } = {}) {
  const errors = [];
  if (patch?.patchType !== COURSE_FORGE_PATCH_TYPE) {
    errors.push(`patchType inválido: ${patch?.patchType || ""}.`);
  }

  const operations = Array.isArray(patch?.operations) ? patch.operations.map(normalizeOperation) : [];
  if (!operations.length) {
    errors.push("Patch sem operações.");
  }

  const scope = resolveCourseForgeScope(intent);
  operations.forEach((operation, index) => {
    if (!operation.op) {
      errors.push(`operations[${index}] sem op.`);
      return;
    }
    const target = {
      courseKey: text(operation.courseKey || patch?.target?.courseKey),
      moduleKey: text(operation.moduleKey || patch?.target?.moduleKey),
      lessonKey: text(operation.lessonKey || patch?.target?.lessonKey),
      microsequenceKey: text(operation.microsequenceKey || patch?.target?.microsequenceKey)
    };
    if (!patchTargetWithinScope(scope, target) && operation.op !== "add_course") {
      errors.push(`operations[${index}] toca fora do escopo selecionado.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    patch: {
      patchType: patch?.patchType,
      target: structuredClone(patch?.target || {}),
      operations
    }
  };
}
