import { patchTargetWithinScope, resolveCourseForgeScope } from "./courseForgeScope.js";
import { COURSE_FORGE_PATCH_TYPE } from "./courseForgeSchemas.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
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

function arraysEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

function sameCardContent(left = {}, right = {}) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeOperation(operation = {}) {
  return {
    ...clone(operation),
    op: text(operation.op)
  };
}

function normalizePatchEvent(event = {}) {
  return {
    ...clone(event),
    eventType: text(event.eventType)
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

function buildScopedArchitectureFromProject(projectDocument = {}, scope = {}) {
  const course = findCourse(projectDocument, scope?.courseKey);
  if (!course) {
    return null;
  }
  if (scope?.level === "course") {
    return {
      course: {
        key: text(course?.key),
        title: text(course?.title),
        description: text(course?.description),
        modules: clone(course?.modules || [])
      }
    };
  }
  const moduleValue = findModule(projectDocument, scope?.courseKey, scope?.moduleKey);
  if (!moduleValue) {
    return null;
  }
  if (scope?.level === "module") {
    return {
      course: {
        key: text(course?.key),
        title: text(course?.title),
        description: text(course?.description),
        modules: [
          {
            key: text(moduleValue?.key),
            title: text(moduleValue?.title),
            description: text(moduleValue?.description),
            lessons: clone(moduleValue?.lessons || [])
          }
        ]
      }
    };
  }
  const lesson = findLesson(projectDocument, scope?.courseKey, scope?.moduleKey, scope?.lessonKey);
  if (!lesson) {
    return null;
  }
  return {
    course: {
      key: text(course?.key),
      title: text(course?.title),
      description: text(course?.description),
      modules: [
        {
          key: text(moduleValue?.key),
          title: text(moduleValue?.title),
          description: text(moduleValue?.description),
          lessons: [
            {
              ...clone(lesson),
              microsequences: []
            }
          ]
        }
      ]
    }
  };
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

function buildCardMutationOperations({ sharedTarget = {}, desiredCards = [], existingMicrosequence = {} } = {}) {
  const existingCards = normalizeArray(existingMicrosequence?.cards)
    .map(clone)
    .filter((card) => text(card?.key));
  const existingByKey = new Map(existingCards.map((card) => [text(card?.key), card]));
  const usedExistingKeys = new Set();
  const reservedKeys = new Set(existingCards.map((card) => text(card?.key)).filter(Boolean));

  const normalizedDesiredCards = normalizeArray(desiredCards).map((card, index) => {
    const explicitKey = text(card?.key);
    const positionalKey = text(existingCards[index]?.key);
    let resolvedKey = "";

    if (explicitKey && existingByKey.has(explicitKey) && !usedExistingKeys.has(explicitKey)) {
      resolvedKey = explicitKey;
    } else if (positionalKey && !usedExistingKeys.has(positionalKey)) {
      resolvedKey = positionalKey;
    } else if (explicitKey && !reservedKeys.has(explicitKey)) {
      resolvedKey = explicitKey;
    } else {
      resolvedKey = uniqueKey(text(card?.title) || `card-${index + 1}`, reservedKeys, "card");
    }

    if (existingByKey.has(resolvedKey)) {
      usedExistingKeys.add(resolvedKey);
    }
    reservedKeys.add(resolvedKey);

    return {
      ...clone(card),
      key: resolvedKey
    };
  });

  const desiredKeys = normalizedDesiredCards.map((card) => text(card?.key)).filter(Boolean);
  const desiredKeySet = new Set(desiredKeys);
  const operations = [];
  let addCount = 0;
  let updateCount = 0;
  let deleteCount = 0;
  let reorderCount = 0;

  normalizedDesiredCards.forEach((card, index) => {
    const current = existingByKey.get(text(card?.key));
    if (!current) {
      addCount += 1;
      operations.push({
        op: "add_card",
        ...sharedTarget,
        position: index,
        card: clone(card)
      });
      return;
    }
    if (!sameCardContent(current, card)) {
      updateCount += 1;
      operations.push({
        op: "update_card",
        ...sharedTarget,
        cardKey: text(card?.key),
        card: clone(card)
      });
    }
  });

  existingCards.forEach((card) => {
    const cardKey = text(card?.key);
    if (!cardKey || desiredKeySet.has(cardKey)) {
      return;
    }
    deleteCount += 1;
    operations.push({
      op: "delete_card",
      ...sharedTarget,
      cardKey
    });
  });

  const currentOrder = existingCards.map((card) => text(card?.key)).filter((cardKey) => desiredKeySet.has(cardKey));
  if (desiredKeys.length > 1 && !arraysEqual(currentOrder, desiredKeys)) {
    reorderCount = 1;
    operations.push({
      op: "reorder_children",
      ...sharedTarget,
      childType: "card",
      order: desiredKeys
    });
  }

  const hasChanges = addCount || updateCount || deleteCount || reorderCount;
  return {
    operations,
    events: hasChanges
      ? [
          {
            eventType: "sync_microsequence_cards",
            strategy: "semantic_diff",
            target: clone(sharedTarget),
            stats: {
              existingCount: existingCards.length,
              desiredCount: normalizedDesiredCards.length,
              addCount,
              updateCount,
              deleteCount,
              reorderCount
            }
          }
        ]
      : []
  };
}

function buildMicrosequenceOperations({
  courseKey = "",
  moduleKey = "",
  lessonKey = "",
  microsequence = {},
  existingMicrosequence = null
} = {}) {
  const normalized = normalizeMicrosequenceForPatch(microsequence);
  const exists = Boolean(existingMicrosequence);
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
    return {
      operations: [{
        op: "add_microsequence",
        courseKey,
        moduleKey,
        lessonKey,
        microsequence: microsequencePatch
      }],
      events: []
    };
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
  const cardMutations = buildCardMutationOperations({
    sharedTarget,
    desiredCards: normalized.publicCards,
    existingMicrosequence
  });
  operations.push(...cardMutations.operations);
  return {
    operations,
    events: cardMutations.events
  };
}

export function compileCourseStructureToPatch({ intent, architectureDraft, projectDocument = {} }) {
  if (architectureDraft?.patch) {
    return clone(architectureDraft.patch);
  }

  const scope = intent?.scope || {};
  const normalizedDraft = architectureDraft?.course
    ? architectureDraft
    : ["course", "module", "lesson", "microsequence"].includes(text(scope?.level))
      ? {
          ...(clone(architectureDraft || {})),
          ...(buildScopedArchitectureFromProject(projectDocument, scope) || {})
        }
      : null;
  const course = normalizedDraft?.course;
  if (!course) {
    throw new Error("Arquitetura sem curso para compilar patch.");
  }

  const courseKey = text(course.key);
  const existingCourse = findCourse(projectDocument, courseKey);
  const operations = [buildCourseOperation(course, Boolean(existingCourse))];
  const events = [];

  const microsequencePlansByLessonKey = new Map(
    (Array.isArray(normalizedDraft?.microsequencePlans) ? normalizedDraft.microsequencePlans : [])
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
        const compiled = buildMicrosequenceOperations({
          courseKey,
          moduleKey,
          lessonKey,
          microsequence,
          existingMicrosequence
        });
        operations.push(...compiled.operations);
        events.push(...compiled.events);
      });
    });
  });

  return {
    patchType: COURSE_FORGE_PATCH_TYPE,
    target: clone(intent?.scope || { level: "project" }),
    operations,
    events
  };
}

export function validateCourseForgePatch(patch = {}, { intent = {} } = {}) {
  const errors = [];
  if (patch?.patchType !== COURSE_FORGE_PATCH_TYPE) {
    errors.push(`patchType inválido: ${patch?.patchType || ""}.`);
  }

  const operations = Array.isArray(patch?.operations) ? patch.operations.map(normalizeOperation) : [];
  const events = Array.isArray(patch?.events) ? patch.events.map(normalizePatchEvent) : [];
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
      operations,
      events
    }
  };
}
