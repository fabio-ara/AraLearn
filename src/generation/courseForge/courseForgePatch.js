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

function textArraysEqual(left = [], right = []) {
  return arraysEqual(
    normalizeArray(left).map(text).filter(Boolean),
    normalizeArray(right).map(text).filter(Boolean)
  );
}

function sameCardContent(left = {}, right = {}) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function containsDidacticTerm(value = "", terms = []) {
  const normalized = text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalizeArray(terms).some((term) => normalized.includes(String(term).toLowerCase()));
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
    eventType: text(event.eventType),
    appliedAs: text(event.appliedAs),
    requestedChangeId: text(event.requestedChangeId),
    interventionActionId: text(event.interventionActionId),
    semanticOperation: text(event.semanticOperation),
    reason: text(event.reason),
    evidence: clone(event?.evidence || {}),
    placement: text(event.placement),
    anchorMicrosequenceKey: text(event.anchorMicrosequenceKey)
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

function actionTargetsLesson(action = {}, courseKey = "", moduleKey = "", lessonKey = "") {
  return (Array.isArray(action?.lessonTargets) ? action.lessonTargets : []).some(
    (lessonTarget) =>
      text(lessonTarget?.courseKey) === text(courseKey)
      && text(lessonTarget?.moduleKey) === text(moduleKey)
      && text(lessonTarget?.lessonKey) === text(lessonKey)
  );
}

function createInterventionActionResolver(interventionPlan = {}) {
  const actions = Array.isArray(interventionPlan?.actions) ? interventionPlan.actions.map(clone) : [];
  const newActionUsageById = new Map();
  return {
    resolveExisting({ courseKey = "", moduleKey = "", lessonKey = "", microsequenceKey = "" } = {}) {
      return (
        actions.find((action) =>
          !action?.expectsNewMicrosequence
          && text(action?.existingMicrosequenceKey) === text(microsequenceKey)
          && text(microsequenceKey)
        )
        || actions.find((action) =>
          !action?.expectsNewMicrosequence
          && !text(action?.existingMicrosequenceKey)
          && actionTargetsLesson(action, courseKey, moduleKey, lessonKey)
        )
        || null
      );
    },
    claimNew({ courseKey = "", moduleKey = "", lessonKey = "" } = {}) {
      const action = actions.find((candidate) => {
        if (!candidate?.expectsNewMicrosequence || !actionTargetsLesson(candidate, courseKey, moduleKey, lessonKey)) {
          return false;
        }
        const usedCount = Number(newActionUsageById.get(text(candidate?.actionId)) || 0);
        return usedCount < 1;
      }) || null;
      if (action) {
        newActionUsageById.set(text(action?.actionId), Number(newActionUsageById.get(text(action?.actionId)) || 0) + 1);
      }
      return action;
    }
  };
}

function buildRequestedChangeEvent({
  action = null,
  target = {},
  appliedAs = "",
  stats = null,
  details = null
} = {}) {
  if (!action) {
    return null;
  }
  return {
    eventType: "apply_requested_change",
    strategy: text(action?.patchStrategy),
    appliedAs: text(appliedAs),
    target: clone(target),
    requestedChangeId: text(action?.requestedChangeId),
    interventionActionId: text(action?.actionId),
    semanticOperation: text(action?.semanticOperation),
    reason: text(action?.reason),
    evidence: clone(action?.evidence || {}),
    ...(details && typeof details === "object" ? clone(details) : {}),
    ...(stats && typeof stats === "object" ? { stats: clone(stats) } : {})
  };
}

function resolveDidacticDirectPatchOp({ interventionAction = null, microsequence = {}, exists = false } = {}) {
  if (!interventionAction) {
    return exists ? "replace_microsequence_cards" : "add_microsequence";
  }

  const coverageRole = text(microsequence?.coverageRole);
  const didacticPurpose = text(microsequence?.didacticPurpose || microsequence?.objective);
  const reason = text(interventionAction?.reason);
  const placement = text(interventionAction?.insertionPolicy?.placement);
  const looksLikePractice = containsDidacticTerm(coverageRole, ["practice", "guided_practice", "independent_practice", "exam_transfer"])
    || containsDidacticTerm(didacticPurpose, ["pratic", "practice", "exercicio", "exercício", "guiad"]);
  const looksLikeContrast = containsDidacticTerm(didacticPurpose, ["contrast", "contraste"])
    || containsDidacticTerm(reason, ["contrast", "contraste", "diferenca", "diferença", "contraexemplo"]);

  if (!exists) {
    if (placement === "after_anchor" && looksLikePractice) {
      return "insert_practice_bridge_after";
    }
    if (placement === "after_anchor" && looksLikeContrast) {
      return "insert_contrast_example_after";
    }
    if (placement === "after_anchor") {
      return "insert_explanatory_bridge_after";
    }
    return "add_microsequence";
  }

  if (looksLikePractice) {
    return "replace_microsequence_with_guided_practice";
  }
  if (looksLikeContrast) {
    return "replace_microsequence_with_contrast";
  }
  return "replace_microsequence_cards";
}

function sameMicrosequenceMetadata(existingMicrosequence = {}, nextMicrosequence = {}) {
  return (
    text(existingMicrosequence?.title) === text(nextMicrosequence?.title)
    && text(existingMicrosequence?.description) === text(nextMicrosequence?.description)
    && text(existingMicrosequence?.status) === text(nextMicrosequence?.status)
    && Boolean(existingMicrosequence?.included) === Boolean(nextMicrosequence?.included)
    && text(existingMicrosequence?.didacticPurpose) === text(nextMicrosequence?.didacticPurpose)
    && text(existingMicrosequence?.coverageRole) === text(nextMicrosequence?.coverageRole)
    && textArraysEqual(existingMicrosequence?.tags, nextMicrosequence?.tags)
    && textArraysEqual(existingMicrosequence?.domainRefs, nextMicrosequence?.domainRefs)
    && textArraysEqual(existingMicrosequence?.practiceVariantRefs, nextMicrosequence?.practiceVariantRefs)
  );
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
  existingMicrosequence = null,
  interventionAction = null
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
    const directPatchOp = resolveDidacticDirectPatchOp({
      interventionAction,
      microsequence: normalized,
      exists: false
    });
    const requestedChangeEvent = buildRequestedChangeEvent({
      action: interventionAction,
      target: sharedTarget,
      appliedAs: directPatchOp,
      details: interventionAction?.insertionPolicy?.placement === "after_anchor"
        ? {
            placement: text(interventionAction?.insertionPolicy?.placement),
            anchorMicrosequenceKey: text(interventionAction?.insertionPolicy?.anchorMicrosequenceKey)
          }
        : null,
      stats: {
        desiredCardCount: normalized.publicCards.length
      }
    });
    return {
      operations: [
        interventionAction?.insertionPolicy?.placement === "after_anchor"
          ? {
              op: directPatchOp,
              courseKey,
              moduleKey,
              lessonKey,
              anchorMicrosequenceKey: text(interventionAction?.insertionPolicy?.anchorMicrosequenceKey),
              microsequence: microsequencePatch
            }
          : {
              op: "add_microsequence",
              courseKey,
              moduleKey,
              lessonKey,
              microsequence: microsequencePatch
            }
      ],
      events: requestedChangeEvent ? [requestedChangeEvent] : []
    };
  }

  if (interventionAction) {
    const directPatchOp = resolveDidacticDirectPatchOp({
      interventionAction,
      microsequence: normalized,
      exists: true
    });
    const requestedChangeEvent = buildRequestedChangeEvent({
      action: interventionAction,
      target: sharedTarget,
      appliedAs: directPatchOp,
      stats: {
        desiredCardCount: normalized.publicCards.length
      }
    });
    return {
      operations: [{
        op: directPatchOp,
        courseKey,
        moduleKey,
        lessonKey,
        microsequenceKey: normalized.key,
        microsequence: microsequencePatch
      }],
      events: requestedChangeEvent ? [requestedChangeEvent] : []
    };
  }

  const microsequenceMetadataPatch = {
    title: normalized.title,
    description: normalized.description,
    status: normalized.status,
    included: normalized.included,
    tags: normalized.tags,
    domainRefs: normalized.domainRefs,
    practiceVariantRefs: normalized.practiceVariantRefs,
    didacticPurpose: normalized.didacticPurpose,
    coverageRole: normalized.coverageRole
  };
  const operations = sameMicrosequenceMetadata(existingMicrosequence, microsequenceMetadataPatch)
    ? []
    : [{
        op: "update_microsequence",
        ...sharedTarget,
        microsequence: microsequenceMetadataPatch
      }];
  const cardMutations = buildCardMutationOperations({
    sharedTarget,
    desiredCards: normalized.publicCards,
    existingMicrosequence
  });
  const hasMicrosequenceMutations = operations.length > 0 || cardMutations.operations.length > 0;
  const requestedChangeEvent = buildRequestedChangeEvent({
    action: hasMicrosequenceMutations ? interventionAction : null,
    target: sharedTarget,
    appliedAs: "patch_existing_microsequence",
    stats: {
      desiredCardCount: normalized.publicCards.length
    }
  });
  const cardMutationEvents = cardMutations.events.map((event) => (
    interventionAction
      ? {
          ...event,
          requestedChangeId: text(interventionAction?.requestedChangeId),
          interventionActionId: text(interventionAction?.actionId),
          semanticOperation: text(interventionAction?.semanticOperation),
          reason: text(interventionAction?.reason),
          evidence: clone(interventionAction?.evidence || {})
        }
      : event
  ));
  operations.push(...cardMutations.operations);
  return {
    operations,
    events: [
      ...(requestedChangeEvent ? [requestedChangeEvent] : []),
      ...cardMutationEvents
    ]
  };
}

export function compileCourseStructureToPatch({ intent, architectureDraft, projectDocument = {}, interventionPlan = null }) {
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
  const interventionActionResolver = createInterventionActionResolver(interventionPlan);

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
        const interventionAction = existingMicrosequence
          ? interventionActionResolver.resolveExisting({
              courseKey,
              moduleKey,
              lessonKey,
              microsequenceKey: text(microsequence?.key)
            })
          : interventionActionResolver.claimNew({
              courseKey,
              moduleKey,
              lessonKey
            });
        const compiled = buildMicrosequenceOperations({
          courseKey,
          moduleKey,
          lessonKey,
          microsequence,
          existingMicrosequence,
          interventionAction
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

export function validateCourseForgePatch(patch = {}, { intent = {}, interventionPlan = null } = {}) {
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
    if (["insert_microsequence_after", "insert_practice_bridge_after", "insert_contrast_example_after", "insert_explanatory_bridge_after"].includes(operation.op)
      && !text(operation.anchorMicrosequenceKey)) {
      errors.push(`operations[${index}] sem anchorMicrosequenceKey.`);
    }
    if (
      ["add_microsequence", "insert_microsequence_after", "insert_practice_bridge_after", "insert_contrast_example_after", "insert_explanatory_bridge_after"]
        .includes(operation.op)
      && !text(operation?.microsequence?.key)
    ) {
      errors.push(`operations[${index}] sem microsequence.key.`);
    }
    if (
      ["replace_microsequence_cards", "replace_microsequence_with_contrast", "replace_microsequence_with_guided_practice"].includes(operation.op)
      && !text(operation.microsequenceKey)
    ) {
      errors.push(`operations[${index}] sem microsequenceKey.`);
    }
  });

  events.forEach((event, index) => {
    if (event.eventType !== "apply_requested_change") {
      return;
    }
    if (!event.requestedChangeId) {
      errors.push(`events[${index}] sem requestedChangeId.`);
    }
    if (!event.interventionActionId) {
      errors.push(`events[${index}] sem interventionActionId.`);
    }
    if (!event.semanticOperation) {
      errors.push(`events[${index}] sem semanticOperation.`);
    }
    if (!event.reason) {
      errors.push(`events[${index}] sem reason.`);
    }
  });

  const interventionActions = Array.isArray(interventionPlan?.actions) ? interventionPlan.actions : [];
  if (interventionActions.length) {
    const appliedRequestedChangeIds = new Set(
      events
        .filter((event) => event.eventType === "apply_requested_change")
        .map((event) => text(event?.requestedChangeId))
        .filter(Boolean)
    );
    interventionActions.forEach((action, index) => {
      const requestedChangeId = text(action?.requestedChangeId);
      if (!requestedChangeId) {
        errors.push(`interventionPlan.actions[${index}] sem requestedChangeId.`);
        return;
      }
      if (!appliedRequestedChangeIds.has(requestedChangeId)) {
        errors.push(`Patch sem evento aplicado para ${requestedChangeId}.`);
      }
    });
  }

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
