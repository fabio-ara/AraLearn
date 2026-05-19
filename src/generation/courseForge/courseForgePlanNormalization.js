function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLookupLabel(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mergeTagList(primary = [], fallback = []) {
  const values = [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(fallback) ? fallback : [])]
    .map(text)
    .filter(Boolean);
  return [...new Set(values)];
}

function mergePlainObject(primary = {}, fallback = {}) {
  return {
    ...structuredClone(fallback || {}),
    ...structuredClone(primary || {})
  };
}

function fallbackLessonKeyFromTitle(title = "", index = 0) {
  const normalized = normalizeLookupLabel(title);
  return normalized ? `lesson-${normalized}` : `lesson-${index + 1}`;
}

function fallbackMicrosequenceKey(lessonKey = "", title = "", index = 0) {
  const normalizedTitle = normalizeLookupLabel(title);
  return normalizedTitle
    ? `${lessonKey || "lesson"}-micro-${normalizedTitle}`
    : `${lessonKey || "lesson"}-micro-${index + 1}`;
}

export function buildCourseSemanticFields(engineProfile = {}) {
  return {
    courseSemantics: structuredClone(engineProfile?.didacticPolicy?.courseSemantics || {}),
    resourcePreferences: structuredClone(engineProfile?.didacticPolicy?.resourcePreferences || {})
  };
}

export function readArchitectureValue(payload = {}) {
  if (payload?.architectureFinal?.course) {
    return payload.architectureFinal;
  }
  if (payload?.architectureDraft?.course) {
    return payload.architectureDraft;
  }
  if (payload?.course) {
    return payload;
  }
  return payload;
}

export function listArchitectureLessons(architectureDraft = {}) {
  const course = readArchitectureValue(architectureDraft)?.course;
  const lessons = [];
  (Array.isArray(course?.modules) ? course.modules : []).forEach((moduleValue) => {
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).forEach((lesson) => {
      lessons.push({
        courseKey: text(course?.key),
        moduleKey: text(moduleValue?.key),
        lessonKey: text(lesson?.key),
        lessonTitle: text(lesson?.title),
        lessonDescription: text(lesson?.description),
        sourceGuideStructured: structuredClone(lesson?.sourceGuideStructured || {}),
        domainMap: structuredClone(lesson?.domainMap || null),
        resourceTags: structuredClone(lesson?.resourceTags || []),
        contentTypeTags: structuredClone(lesson?.contentTypeTags || []),
        learningActionTags: structuredClone(lesson?.learningActionTags || []),
        supportLevel: text(lesson?.supportLevel),
        presetId: text(lesson?.presetId)
      });
    });
  });
  return lessons;
}

function buildLessonIndexes(lessonPlans = []) {
  const byLessonKey = new Map();
  const byLessonTitle = new Map();

  (Array.isArray(lessonPlans) ? lessonPlans : []).forEach((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    const lessonTitle = normalizeLookupLabel(lessonPlan?.lessonTitle);
    if (lessonKey) {
      byLessonKey.set(lessonKey, lessonPlan);
    }
    if (lessonTitle) {
      byLessonTitle.set(lessonTitle, lessonPlan);
    }
  });

  return { byLessonKey, byLessonTitle };
}

function extractLessonPlanEntries(payload = {}) {
  if (Array.isArray(payload?.lessonPlans)) {
    return payload.lessonPlans;
  }
  if (Array.isArray(payload?.lessons)) {
    return payload.lessons;
  }
  return Array.isArray(payload) ? payload : [];
}

function mergeLessonPlanEntries(existing = {}, incoming = {}) {
  return {
    ...structuredClone(existing),
    ...structuredClone(incoming),
    sourceGuideStructured: mergePlainObject(incoming?.sourceGuideStructured || {}, existing?.sourceGuideStructured || {}),
    domainMap: structuredClone(incoming?.domainMap || existing?.domainMap || null),
    resourceTags: mergeTagList(incoming?.resourceTags, existing?.resourceTags),
    contentTypeTags: mergeTagList(incoming?.contentTypeTags, existing?.contentTypeTags),
    learningActionTags: mergeTagList(incoming?.learningActionTags, existing?.learningActionTags)
  };
}

export function normalizeLessonPlans(payload = {}, architectureDraft = {}, engineProfile = {}) {
  const architectureLessons = listArchitectureLessons(architectureDraft);
  const { byLessonKey, byLessonTitle } = buildLessonIndexes(architectureLessons);
  const explicit = extractLessonPlanEntries(payload);

  if (!explicit.length) {
    return architectureLessons.map((lessonPlan) => ({
      ...lessonPlan,
      ...buildCourseSemanticFields(engineProfile)
    }));
  }

  const normalizedPlans = [];
  const byResolvedLessonKey = new Map();

  explicit.forEach((lessonPlan, index) => {
    const explicitLessonKey = text(lessonPlan?.lessonKey || lessonPlan?.key);
    const explicitLessonTitle = text(lessonPlan?.lessonTitle || lessonPlan?.title);
    const architectureLesson =
      byLessonKey.get(explicitLessonKey) ||
      byLessonTitle.get(normalizeLookupLabel(explicitLessonTitle)) ||
      (architectureLessons.length === 1 ? architectureLessons[0] : null);
    const resolvedLessonKey = text(
      architectureLesson?.lessonKey ||
      explicitLessonKey ||
      (!architectureLessons.length ? fallbackLessonKeyFromTitle(explicitLessonTitle, index) : "")
    );

    if (!resolvedLessonKey) {
      return;
    }

    const normalized = {
      courseKey: text(lessonPlan?.courseKey || architectureLesson?.courseKey),
      moduleKey: text(lessonPlan?.moduleKey || architectureLesson?.moduleKey),
      lessonKey: resolvedLessonKey,
      lessonTitle: text(explicitLessonTitle || architectureLesson?.lessonTitle),
      lessonDescription: text(lessonPlan?.lessonDescription || lessonPlan?.description || architectureLesson?.lessonDescription),
      sourceGuideStructured: mergePlainObject(lessonPlan?.sourceGuideStructured || {}, architectureLesson?.sourceGuideStructured || {}),
      domainMap: structuredClone(lessonPlan?.domainMap || architectureLesson?.domainMap || null),
      resourceTags: mergeTagList(lessonPlan?.resourceTags, architectureLesson?.resourceTags),
      contentTypeTags: mergeTagList(lessonPlan?.contentTypeTags, architectureLesson?.contentTypeTags),
      learningActionTags: mergeTagList(lessonPlan?.learningActionTags, architectureLesson?.learningActionTags),
      supportLevel: text(lessonPlan?.supportLevel || architectureLesson?.supportLevel),
      presetId: text(lessonPlan?.presetId || architectureLesson?.presetId),
      ...buildCourseSemanticFields(engineProfile)
    };

    if (byResolvedLessonKey.has(resolvedLessonKey)) {
      const merged = mergeLessonPlanEntries(byResolvedLessonKey.get(resolvedLessonKey), normalized);
      byResolvedLessonKey.set(resolvedLessonKey, merged);
      const currentIndex = normalizedPlans.findIndex((item) => text(item?.lessonKey) === resolvedLessonKey);
      if (currentIndex >= 0) {
        normalizedPlans[currentIndex] = merged;
      }
      return;
    }

    byResolvedLessonKey.set(resolvedLessonKey, normalized);
    normalizedPlans.push(normalized);
  });

  architectureLessons.forEach((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    if (!lessonKey || byResolvedLessonKey.has(lessonKey)) {
      return;
    }
    normalizedPlans.push({
      ...structuredClone(lessonPlan),
      ...buildCourseSemanticFields(engineProfile)
    });
  });

  return normalizedPlans;
}

function inferMicrosequenceTitle(microsequence = {}, lessonMeta = {}, microIndex = 0) {
  return (
    text(microsequence?.title || microsequence?.name) ||
    text(microsequence?.objective) ||
    text(microsequence?.description) ||
    (text(lessonMeta?.lessonTitle) ? `Etapa ${microIndex + 1} de ${text(lessonMeta.lessonTitle)}` : `Microssequência ${microIndex + 1}`)
  );
}

function buildFallbackMicrosequenceEntries(lessonMeta = {}, microIndex = 0) {
  const lessonKey = text(lessonMeta?.lessonKey) || "lesson";
  const lessonTitle = text(lessonMeta?.lessonTitle);
  const objective =
    text(lessonMeta?.sourceGuideStructured?.lessonGoal) ||
    text(lessonMeta?.lessonDescription) ||
    (lessonTitle ? `Compreender a ideia central de ${lessonTitle}.` : "Compreender a ideia central da lição.");
  const explainTitle = lessonTitle ? `Panorama de ${lessonTitle}` : `Panorama da lição ${microIndex + 1}`;
  const practiceTitle = lessonTitle ? `Verificação guiada de ${lessonTitle}` : `Verificação guiada ${microIndex + 1}`;
  const baseTags = mergeTagList(lessonMeta?.learningActionTags, lessonMeta?.resourceTags);
  return [
    {
      key: fallbackMicrosequenceKey(lessonKey, explainTitle, microIndex),
      title: explainTitle,
      description: text(lessonMeta?.lessonDescription || objective),
      objective,
      domainRefs: [],
      practiceVariantRefs: [],
      didacticPurpose: "Estabelecer a base comum da lição antes de prática distribuída.",
      coverageRole: "explain",
      tags: baseTags
    },
    {
      key: fallbackMicrosequenceKey(lessonKey, practiceTitle, microIndex + 1),
      title: practiceTitle,
      description: `Aplicar a ideia central de ${lessonTitle || "esta lição"} em exemplo curto.`,
      objective: `Aplicar ${lessonTitle || "a lição"} em situação simples e verificável.`,
      domainRefs: [],
      practiceVariantRefs: [],
      didacticPurpose: "Consolidar imediatamente o conteúdo central com prática guiada curta.",
      coverageRole: "practice",
      tags: mergeTagList(baseTags, ["prática"])
    }
  ];
}

function extractMicrosequencePlanEntries(payload = {}, lessonPlans = []) {
  if (Array.isArray(payload?.microsequencePlans)) {
    return payload.microsequencePlans;
  }
  if (Array.isArray(payload?.lessons)) {
    return payload.lessons;
  }
  if (Array.isArray(payload)) {
    const looksLikeGroupedPlans = payload.some((entry) => Array.isArray(entry?.microsequences));
    if (looksLikeGroupedPlans) {
      return payload;
    }
    if (lessonPlans.length === 1) {
      return [{
        lessonKey: lessonPlans[0]?.lessonKey,
        lessonTitle: lessonPlans[0]?.lessonTitle,
        microsequences: payload
      }];
    }
    return [];
  }
  if (Array.isArray(payload?.microsequences)) {
    if (lessonPlans.length === 1) {
      return [{
        lessonKey: lessonPlans[0]?.lessonKey,
        lessonTitle: lessonPlans[0]?.lessonTitle,
        microsequences: payload.microsequences
      }];
    }
    return [{
      lessonKey: payload?.lessonKey,
      lessonTitle: payload?.lessonTitle || payload?.title,
      microsequences: payload.microsequences
    }];
  }
  return [];
}

function normalizeMicrosequenceEntry(microsequence = {}, lessonMeta = {}, microIndex = 0) {
  const lessonKey = text(lessonMeta?.lessonKey);
  const title = inferMicrosequenceTitle(microsequence, lessonMeta, microIndex);
  return {
    key: text(microsequence?.key) || fallbackMicrosequenceKey(lessonKey, title, microIndex),
    title,
    description: text(microsequence?.description || microsequence?.objective),
    objective: text(microsequence?.objective || microsequence?.description || title),
    domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs.map(text).filter(Boolean) : [],
    practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs) ? microsequence.practiceVariantRefs.map(text).filter(Boolean) : [],
    didacticPurpose: text(microsequence?.didacticPurpose),
    coverageRole: text(microsequence?.coverageRole),
    tags: Array.isArray(microsequence?.tags) ? microsequence.tags.map(text).filter(Boolean) : []
  };
}

function mergeMicrosequenceLists(existing = [], incoming = []) {
  const normalized = [];
  const seen = new Set();

  [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((microsequence, microIndex) => {
    const uniqueKey = text(microsequence?.key) || normalizeLookupLabel(microsequence?.title) || `micro-${microIndex + 1}`;
    if (!uniqueKey || seen.has(uniqueKey)) {
      return;
    }
    seen.add(uniqueKey);
    normalized.push(structuredClone(microsequence));
  });

  return normalized;
}

export function normalizeMicrosequencePlans(payload = {}, lessonPlans = []) {
  const explicit = extractMicrosequencePlanEntries(payload, lessonPlans);
  const { byLessonKey, byLessonTitle } = buildLessonIndexes(lessonPlans);

  const groupedPlans = [];
  const byResolvedLessonKey = new Map();

  explicit.forEach((lessonEntry, lessonIndex) => {
    const explicitLessonKey = text(lessonEntry?.lessonKey);
    const explicitLessonTitle = text(lessonEntry?.lessonTitle || lessonEntry?.title);
    const lessonMeta =
      byLessonKey.get(explicitLessonKey) ||
      byLessonTitle.get(normalizeLookupLabel(explicitLessonTitle)) ||
      (lessonPlans.length === 1 ? lessonPlans[0] : null) ||
      null;
    const resolvedLessonKey = text(lessonMeta?.lessonKey || explicitLessonKey);

    if (!resolvedLessonKey) {
      return;
    }

    const normalizedMicrosequences = (Array.isArray(lessonEntry?.microsequences) ? lessonEntry.microsequences : [])
      .map((microsequence, microIndex) => normalizeMicrosequenceEntry(microsequence, lessonMeta, microIndex));
    const nextGroup = {
      lessonKey: resolvedLessonKey,
      lessonTitle: text(lessonMeta?.lessonTitle || explicitLessonTitle),
      moduleKey: text(lessonEntry?.moduleKey || lessonMeta?.moduleKey),
      courseKey: text(lessonEntry?.courseKey || lessonMeta?.courseKey),
      microsequences: normalizedMicrosequences.length
        ? mergeMicrosequenceLists([], normalizedMicrosequences)
        : buildFallbackMicrosequenceEntries(lessonMeta || {}, lessonIndex)
    };

    if (byResolvedLessonKey.has(resolvedLessonKey)) {
      const previous = byResolvedLessonKey.get(resolvedLessonKey);
      const merged = {
        ...structuredClone(previous),
        ...structuredClone(nextGroup),
        microsequences: mergeMicrosequenceLists(previous?.microsequences, nextGroup?.microsequences)
      };
      byResolvedLessonKey.set(resolvedLessonKey, merged);
      const currentIndex = groupedPlans.findIndex((item) => text(item?.lessonKey) === resolvedLessonKey);
      if (currentIndex >= 0) {
        groupedPlans[currentIndex] = merged;
      }
      return;
    }

    byResolvedLessonKey.set(resolvedLessonKey, nextGroup);
    groupedPlans.push(nextGroup);
  });

  (Array.isArray(lessonPlans) ? lessonPlans : []).forEach((lessonPlan, lessonIndex) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    if (!lessonKey || byResolvedLessonKey.has(lessonKey)) {
      return;
    }
    groupedPlans.push({
      lessonKey,
      lessonTitle: text(lessonPlan?.lessonTitle),
      moduleKey: text(lessonPlan?.moduleKey),
      courseKey: text(lessonPlan?.courseKey),
      microsequences: buildFallbackMicrosequenceEntries(lessonPlan, lessonIndex)
    });
  });

  return groupedPlans;
}
