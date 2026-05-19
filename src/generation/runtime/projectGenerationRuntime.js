import { buildScopedKey } from "../../core/ids.js";
import { normalizeLabelToken } from "../../core/text.js";
import { toLegacyContractCard } from "../../domain/cards.js";
import { EVIDENCE_KINDS, validateScopeContractDocument } from "../../domain/scopeContract.js";
import { createCodexCliProvider } from "../providers/codexCliProvider.js";
import { createGeminiProvider } from "../providers/geminiProvider.js";
import { createOpenAiCompatibleProvider } from "../providers/openAiCompatibleProvider.js";
import { validateMicrosequenceCards } from "../bottomUp/validateMicrosequenceCards.js";
import {
  buildMicrosequenceCardsSchema,
  buildSupportMicrosequenceSchema,
  microsequenceCardsSchema,
  supportMicrosequenceSchema
} from "../schemas/bottomUpSchema.js";
import { buildBottomUpSystemPrompt, buildBottomUpUserPrompt } from "../prompts/bottomUpPrompt.js";
import { buildImprovePrompt } from "../prompts/improvePrompt.js";
import { buildPracticePrompt } from "../prompts/practicePrompt.js";
import { buildSupportPrompt } from "../prompts/supportPrompt.js";
import { buildStudyTrackPolicy } from "../policies/studyTrackPolicy.js";
import { buildLessonTopicRefsFromMicrosequences, normalizeSelectedLessonTopicRefs } from "../tags/selectedLessonTopicRefs.js";
import { planCourseFromScope } from "../topDown/planCourseFromScope.js";
import { buildSourceGuideTextForModel, SOURCE_GUIDE_LEVELS } from "../../sourceGuides/sourceGuideStructured.js";

const SCOPE_INFERENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["course", "modules"],
  properties: {
    course: {
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: {
        title: { type: "string" },
        goal: { type: "string" },
        evidencePriority: {
          type: "array",
          items: { type: "string", enum: [...EVIDENCE_KINDS] }
        }
      }
    },
    modules: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "include"],
        properties: {
          title: { type: "string" },
          include: { type: "array", minItems: 1, items: { type: "string" } },
          exclude: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
          assessmentStyle: {
            type: "string",
            enum: ["theoretical", "practical", "mixed"]
          }
        }
      }
    }
  }
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function clone(value) {
  return structuredClone(value);
}

export function resolveGenerationProviderRuntime(assistConfig = {}) {
  const modelId = text(assistConfig.model) || "gemini-2.5-flash";
  if (modelId.startsWith("codex")) {
    return {
      modelId,
      provider: createCodexCliProvider({
        endpoint: text(assistConfig.codexEndpoint),
        token: text(assistConfig.codexToken)
      }),
      providerOptions: {
        endpoint: text(assistConfig.codexEndpoint),
        token: text(assistConfig.codexToken)
      }
    };
  }
  if (modelId.startsWith("openai-compatible") || modelId.startsWith("openai:")) {
    return {
      modelId,
      provider: createOpenAiCompatibleProvider({
        baseUrl: text(assistConfig.baseUrl || assistConfig.apiBaseUrl),
        apiKey: text(assistConfig.apiKey)
      }),
      providerOptions: {
        baseUrl: text(assistConfig.baseUrl || assistConfig.apiBaseUrl),
        apiKey: text(assistConfig.apiKey)
      }
    };
  }
  return {
    modelId,
    provider: createGeminiProvider({
      apiKey: text(assistConfig.apiKey)
    }),
    providerOptions: {
      apiKey: text(assistConfig.apiKey)
    }
  };
}

function summarizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => {
      const name = text(attachment?.name) || "Anexo";
      const body = text(attachment?.textContent || attachment?.contentText);
      if (!body) {
        return "";
      }
      const safeBody = body.length > 2200 ? `${body.slice(0, 2200)}\n...[truncado]` : body;
      return `## ${name}\n${safeBody}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function summarizeBottomUpAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment, index) => {
      const name = text(attachment?.name) || `Anexo ${index + 1}`;
      const body = text(attachment?.textContent || attachment?.contentText);
      if (!body) {
        return null;
      }
      return {
        name,
        contentText: body.length > 1600 ? `${body.slice(0, 1600)}\n...[truncado]` : body
      };
    })
    .filter(Boolean);
}

function findCourse(projectDocument = {}, courseKey = "") {
  return (Array.isArray(projectDocument?.courses) ? projectDocument.courses : []).find((item) => item?.key === courseKey) || null;
}

function findModule(projectDocument = {}, courseKey = "", moduleKey = "") {
  return (findCourse(projectDocument, courseKey)?.modules || []).find((item) => item?.key === moduleKey) || null;
}

function findLesson(projectDocument = {}, courseKey = "", moduleKey = "", lessonKey = "") {
  return (findModule(projectDocument, courseKey, moduleKey)?.lessons || []).find((item) => item?.key === lessonKey) || null;
}

function findMicrosequence(projectDocument = {}, selection = {}) {
  return (
    findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey)?.microsequences || []
  ).find((item) => item?.key === selection.microsequenceKey) || null;
}

function findByTitle(items = [], title = "") {
  const normalizedTitle = normalizeLabelToken(title);
  return (Array.isArray(items) ? items : []).find((item) => normalizeLabelToken(item?.title) === normalizedTitle) || null;
}

function ensureUniqueKey(items = [], preferredKey = "", scope = "item", label = "") {
  const used = new Set((Array.isArray(items) ? items : []).map((item) => text(item?.key)).filter(Boolean));
  let candidate = text(preferredKey) || buildScopedKey(scope, label);
  if (!used.has(candidate)) {
    return candidate;
  }
  let counter = 2;
  while (used.has(`${candidate}-${counter}`)) {
    counter += 1;
  }
  return `${candidate}-${counter}`;
}

function listLessonLabels(lesson = {}) {
  const domainLabels = Array.isArray(lesson?.domainMap?.items)
    ? lesson.domainMap.items.map((item) => text(item?.label)).filter(Boolean)
    : [];
  const microsequenceTitles = Array.isArray(lesson?.microsequences)
    ? lesson.microsequences.map((item) => text(item?.title)).filter(Boolean)
    : [];
  return uniqueList([...domainLabels, ...microsequenceTitles, text(lesson?.title)]);
}

function deriveModuleInclude(moduleValue = {}, preferredLesson = null) {
  const lessons = preferredLesson ? [preferredLesson] : Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
  const lessonLabels = lessons.flatMap((lesson) => listLessonLabels(lesson));
  const include = uniqueList([...lessonLabels, text(moduleValue?.title)]);
  return include.length ? include : [text(moduleValue?.title) || "Tópico principal"];
}

function summarizeExistingStructure(scopeState = {}) {
  const course = scopeState?.course || null;
  const moduleValue = scopeState?.moduleValue || null;
  const lesson = scopeState?.lesson || null;
  if (lesson && moduleValue && course) {
    return {
      course: text(course.title),
      module: text(moduleValue.title),
      lesson: text(lesson.title),
      existingMicrosequences: (Array.isArray(lesson.microsequences) ? lesson.microsequences : [])
        .map((item) => text(item?.title))
        .filter(Boolean)
    };
  }
  if (moduleValue && course) {
    return {
      course: text(course.title),
      module: text(moduleValue.title),
      existingLessons: (Array.isArray(moduleValue.lessons) ? moduleValue.lessons : [])
        .map((item) => text(item?.title))
        .filter(Boolean)
    };
  }
  if (course) {
    return {
      course: text(course.title),
      existingModules: (Array.isArray(course.modules) ? course.modules : [])
        .map((item) => text(item?.title))
        .filter(Boolean)
    };
  }
  return null;
}

function buildScopeSeed({ draft = {}, scopeState = {} } = {}, projectDocument = {}) {
  const fixedCourse = scopeState?.course || null;
  const fixedModule = scopeState?.moduleValue || null;
  const fixedLesson = scopeState?.lesson || null;
  const courseTitle = text(fixedCourse?.title || draft.courseInput) || "Curso";
  const courseGoal = text(fixedCourse?.description);
  const includeTopics = uniqueList(draft.includeTopics);
  const excludeTopics = uniqueList(draft.excludeTopics);
  const fallbackModuleTitle = text(draft.moduleInput) || text(fixedModule?.title) || "Módulo inicial";
  const fallbackInclude =
    includeTopics.length
      ? includeTopics
      : [text(draft.lessonInput) || text(draft.promptText) || fallbackModuleTitle].filter(Boolean);

  if (fixedLesson && fixedModule) {
    return {
      course: {
        title: courseTitle,
        ...(courseGoal ? { goal: courseGoal } : {}),
        evidencePriority: ["none"]
      },
      modules: [
        {
          title: text(fixedModule.title) || "Módulo",
          include: includeTopics.length ? includeTopics : deriveModuleInclude(fixedModule, fixedLesson),
          exclude: excludeTopics,
          notes: uniqueList([
            `Planeje apenas a lição "${fixedLesson.title}" e as microssequências necessárias para ela.`,
            text(draft.promptText)
          ]).join(" "),
          assessmentStyle: "mixed"
        }
      ]
    };
  }

  if (fixedModule) {
    return {
      course: {
        title: courseTitle,
        ...(courseGoal ? { goal: courseGoal } : {}),
        evidencePriority: ["none"]
      },
      modules: [
        {
          title: text(draft.moduleInput) || text(fixedModule.title) || "Módulo",
          include: includeTopics.length ? includeTopics : deriveModuleInclude(fixedModule),
          exclude: excludeTopics,
          ...(text(draft.lessonInput)
            ? { notes: `Foque na lição "${text(draft.lessonInput)}" ao complementar este módulo.` }
            : {}),
          assessmentStyle: "mixed"
        }
      ]
    };
  }

  if (fixedCourse) {
    return {
      course: {
        title: courseTitle,
        ...(courseGoal ? { goal: courseGoal } : {}),
        evidencePriority: ["none"]
      },
      modules: [
        {
          title: fallbackModuleTitle,
          include: fallbackInclude.length ? fallbackInclude : [fallbackModuleTitle],
          exclude: excludeTopics,
          ...(text(draft.lessonInput)
            ? { notes: `Foque na lição "${text(draft.lessonInput)}" ao complementar este curso.` }
            : {}),
          assessmentStyle: "mixed"
        }
      ]
    };
  }

  return {
    course: {
      title: text(draft.courseInput) || "Curso",
      goal: "",
      evidencePriority: ["none"]
    },
    modules: [
      {
        title: fallbackModuleTitle,
        include: fallbackInclude.length ? fallbackInclude : [fallbackModuleTitle],
        exclude: excludeTopics,
        assessmentStyle: "mixed"
      }
    ]
  };
}

function appendScopeModuleNotes(scopeSeed = {}, notes = "") {
  const normalizedNotes = text(notes);
  const baseModule = Array.isArray(scopeSeed?.modules) ? scopeSeed.modules[0] : null;
  if (!baseModule || !normalizedNotes) {
    return scopeSeed;
  }
  return {
    ...scopeSeed,
    modules: [
      {
        ...baseModule,
        notes: uniqueList([text(baseModule.notes), normalizedNotes]).join(" ")
      },
      ...scopeSeed.modules.slice(1)
    ]
  };
}

function shouldInferScopeContract({ draft = {}, ingestedAttachments = {} } = {}) {
  const includeTopics = uniqueList(draft.includeTopics);
  const excludeTopics = uniqueList(draft.excludeTopics);
  if (includeTopics.length || excludeTopics.length) {
    return false;
  }
  return Number(ingestedAttachments?.extractedCount || 0) > 0;
}

function buildDeterministicScopeContract({ scopeSeed = {}, ingestedAttachments = {} } = {}) {
  const attachmentSummary = summarizeAttachments(ingestedAttachments.attachments);
  const candidate = attachmentSummary
    ? appendScopeModuleNotes(scopeSeed, attachmentSummary)
    : scopeSeed;
  const validation = validateScopeContractDocument({
    schemaVersion: "aralearn.scope.v1",
    course: candidate.course,
    modules: candidate.modules
  });
  if (!validation.ok) {
    const summary = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(summary);
  }
  return validation.value;
}

function buildScopeInferencePrompt({ draft = {}, scopeSeed = {}, scopeState = {}, ingestedAttachments = {} } = {}) {
  const attachmentSummary = summarizeAttachments(ingestedAttachments.attachments);
  const fixedCourseTitle = text(scopeState?.course?.title || draft.courseInput);
  const fixedModuleTitle = text(scopeState?.moduleValue?.title || draft.moduleInput);
  const fixedLessonTitle = text(scopeState?.lesson?.title || draft.lessonInput);
  const existingStructure = summarizeExistingStructure(scopeState);

  return [
    "ROLE:",
    "Você converte um pedido do editor do AraLearn em um contrato de escopo compacto para o planner top-down.",
    "",
    "TASK:",
    "Produza um JSON válido de contrato de escopo.",
    "Planeje apenas até microssequências. Não gere cards.",
    "",
    "RESTRIÇÕES:",
    fixedCourseTitle ? `- Preserve exatamente o título do curso: ${fixedCourseTitle}` : "- O título do curso pode ser inferido.",
    fixedModuleTitle ? `- Preserve exatamente o título do módulo: ${fixedModuleTitle}` : "- O título do módulo pode ser inferido.",
    fixedLessonTitle ? `- O planejamento deve focar explicitamente na lição: ${fixedLessonTitle}` : "- Não há lição fixa obrigatória.",
    fixedModuleTitle ? "- Se houver módulo fixo, devolva somente esse módulo." : "- Você pode devolver um ou mais módulos.",
    "",
    "SEMENTE:",
    JSON.stringify(scopeSeed, null, 2),
    "",
    "ESTRUTURA JÁ EXISTENTE:",
    existingStructure ? JSON.stringify(existingStructure, null, 2) : "(sem estrutura existente fixa neste pedido)",
    "",
    "PEDIDO:",
    text(draft.promptText) || "(sem texto direto; use anexos e semente)",
    "",
    "ANEXOS:",
    attachmentSummary || "(sem anexos com texto utilizável)",
    "",
    "REGRAS:",
    "- course.title é obrigatório.",
    "- modules precisa ter ao menos um módulo.",
    "- include deve listar tópicos concretos e curtos.",
    "- exclude pode ficar vazio.",
    "- assessmentStyle deve ser theoretical, practical ou mixed.",
    "- se já existir estrutura no curso, complemente sem duplicar títulos já existentes no mesmo nível.",
    "- se houver lição fixa, use notes para orientar explicitamente o planner a produzir essa lição e não abrir escopo lateral.",
    "- responda somente JSON válido."
  ].join("\n");
}

async function inferScopeContract({ draft = {}, scopeSeed = {}, scopeState = {}, ingestedAttachments = {}, assistConfig = {}, provider = null } = {}) {
  if (!shouldInferScopeContract({ draft, ingestedAttachments })) {
    return buildDeterministicScopeContract({ scopeSeed, ingestedAttachments });
  }
  const runtime = provider
    ? { modelId: text(assistConfig.model) || "gemini-2.5-flash", provider, providerOptions: {} }
    : resolveGenerationProviderRuntime(assistConfig);
  const inferred = await runtime.provider.generateStructured({
    ...runtime.providerOptions,
    modelId: runtime.modelId,
    mode: "infer-scope-contract",
    system: "Responda somente JSON válido. Converta o pedido em um contrato de escopo do AraLearn.",
    prompt: buildScopeInferencePrompt({
      draft,
      scopeSeed,
      scopeState,
      ingestedAttachments
    }),
    schema: SCOPE_INFERENCE_SCHEMA,
    temperature: 0.2
  });

  const candidate = {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: text(inferred?.course?.title || scopeSeed?.course?.title),
      ...(text(inferred?.course?.goal || scopeSeed?.course?.goal)
        ? { goal: text(inferred?.course?.goal || scopeSeed?.course?.goal) }
        : {}),
      evidencePriority: uniqueList(inferred?.course?.evidencePriority).filter((item) => EVIDENCE_KINDS.includes(item))
    },
    modules: (Array.isArray(inferred?.modules) ? inferred.modules : []).map((moduleValue, index) => ({
      title: text(moduleValue?.title || scopeSeed?.modules?.[index]?.title),
      include: uniqueList(moduleValue?.include),
      exclude: uniqueList(moduleValue?.exclude),
      ...(text(moduleValue?.notes) ? { notes: text(moduleValue.notes) } : {}),
      assessmentStyle: ["theoretical", "practical", "mixed"].includes(text(moduleValue?.assessmentStyle))
        ? text(moduleValue.assessmentStyle)
        : "mixed"
    }))
  };

  if (!candidate.course.evidencePriority.length) {
    candidate.course.evidencePriority = ["none"];
  }
  const validation = validateScopeContractDocument(candidate);
  if (!validation.ok) {
    const summary = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(summary);
  }
  return validation.value;
}

function buildLegacyMicrosequenceFromPlan(plannedMicrosequence = {}, existingLesson = {}) {
  const existing = findByTitle(existingLesson?.microsequences, plannedMicrosequence.title);
  return {
    key: text(existing?.key) || buildScopedKey("microsequence", plannedMicrosequence.title),
    title: text(plannedMicrosequence.title),
    description: text(plannedMicrosequence.goal),
    ...(plannedMicrosequence.scopeLabels?.length ? { tags: uniqueList(plannedMicrosequence.scopeLabels) } : {}),
    didacticPurpose: text(plannedMicrosequence.goal),
    status: "draft",
    included: false,
    cards: []
  };
}

function applyPlannedDependenciesToLegacyMicrosequences(plannedLesson = {}, microsequences = []) {
  const titleToKey = new Map(
    microsequences.map((item) => [normalizeLabelToken(item?.title), text(item?.key)]).filter((entry) => entry[0] && entry[1])
  );
  return microsequences.map((microsequence, index) => {
    const plannedMicrosequence = Array.isArray(plannedLesson?.microsequences) ? plannedLesson.microsequences[index] : null;
    return {
      ...microsequence,
      dependsOn: (Array.isArray(plannedMicrosequence?.dependsOnTitles) ? plannedMicrosequence.dependsOnTitles : [])
        .map((title) => titleToKey.get(normalizeLabelToken(title)) || "")
        .filter(Boolean)
    };
  });
}

function buildLegacyLessonFromPlan(plannedLesson = {}, existingModule = {}) {
  const existing = findByTitle(existingModule?.lessons, plannedLesson.title);
  const normalizedSourceGuideStructured =
    plannedLesson?.sourceGuideStructured && typeof plannedLesson.sourceGuideStructured === "object"
      ? clone(plannedLesson.sourceGuideStructured)
      : {};
  const lesson = {
    ...(existing ? clone(existing) : {}),
    key: text(existing?.key) || buildScopedKey("lesson", plannedLesson.title),
    title: text(plannedLesson.title),
    description: text(plannedLesson.goal),
    ...(Object.keys(normalizedSourceGuideStructured).length
      ? {
          sourceGuideStructured: normalizedSourceGuideStructured,
          sourceGuide: buildSourceGuideTextForModel(normalizedSourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
        }
      : {}),
    microsequences: (Array.isArray(plannedLesson.microsequences) ? plannedLesson.microsequences : []).map((item) =>
      buildLegacyMicrosequenceFromPlan(item, existing || {})
    )
  };
  lesson.microsequences = applyPlannedDependenciesToLegacyMicrosequences(plannedLesson, lesson.microsequences);
  return lesson;
}

function buildLegacyModuleFromPlan(plannedModule = {}, existingCourse = {}) {
  const existing = findByTitle(existingCourse?.modules, plannedModule.title);
  return {
    ...(existing ? clone(existing) : {}),
    key: text(existing?.key) || buildScopedKey("module", plannedModule.title),
    title: text(plannedModule.title),
    ...(Array.isArray(plannedModule.include) && plannedModule.include.length
      ? { include: uniqueList(plannedModule.include) }
      : Array.isArray(existing?.include) && existing.include.length
        ? { include: uniqueList(existing.include) }
        : {}),
    ...(Array.isArray(plannedModule.exclude) && plannedModule.exclude.length
      ? { exclude: uniqueList(plannedModule.exclude) }
      : Array.isArray(existing?.exclude) && existing.exclude.length
        ? { exclude: uniqueList(existing.exclude) }
        : {}),
    ...(text(plannedModule.notes || existing?.notes) ? { notes: text(plannedModule.notes || existing?.notes) } : {}),
    ...(text(plannedModule.assessmentStyle || existing?.assessmentStyle)
      ? { assessmentStyle: text(plannedModule.assessmentStyle || existing?.assessmentStyle) }
      : {}),
    lessons: (Array.isArray(plannedModule.lessons) ? plannedModule.lessons : []).map((item) =>
      buildLegacyLessonFromPlan(item, existing || {})
    )
  };
}

function mergeTopDownResultIntoProject({ projectDocument = {}, plannedCourse = {}, scopeState = {} } = {}) {
  const nextProject = clone(projectDocument);
  const existingCourse =
    (text(scopeState?.course?.key) ? findCourse(nextProject, scopeState.course.key) : null) ||
    findByTitle(nextProject.courses, plannedCourse?.course?.title) ||
    null;
  const generatedCourse = {
    ...(existingCourse ? clone(existingCourse) : {}),
    key: text(existingCourse?.key) || ensureUniqueKey(nextProject.courses, "", "course", plannedCourse.course.title),
    title: text(plannedCourse?.course?.title),
    ...(text(plannedCourse?.course?.goal || existingCourse?.description)
      ? { description: text(plannedCourse?.course?.goal || existingCourse?.description) }
      : {}),
    modules: (Array.isArray(plannedCourse?.course?.modules) ? plannedCourse.course.modules : []).map((item) =>
      buildLegacyModuleFromPlan(item, existingCourse || {})
    )
  };

  const courseIndex = nextProject.courses.findIndex((item) => item?.key === generatedCourse.key);
  if (courseIndex >= 0) {
    nextProject.courses[courseIndex] = generatedCourse;
  } else {
    nextProject.courses.push(generatedCourse);
  }
  return nextProject;
}

function resolveTopDownTarget(projectDocument = {}, plannedCourse = {}, scopeState = {}) {
  const course =
    (text(scopeState?.course?.key) ? findCourse(projectDocument, scopeState.course.key) : null) ||
    findByTitle(projectDocument.courses, plannedCourse?.course?.title) ||
    projectDocument.courses?.[0] ||
    null;
  const moduleValue =
    (scopeState?.moduleValue && (course?.modules || []).find((item) => item?.key === scopeState.moduleValue.key)) ||
    findByTitle(course?.modules, plannedCourse?.course?.modules?.[0]?.title) ||
    course?.modules?.[0] ||
    null;
  const lesson =
    (scopeState?.lesson && (moduleValue?.lessons || []).find((item) => item?.key === scopeState.lesson.key)) ||
    findByTitle(moduleValue?.lessons, plannedCourse?.course?.modules?.[0]?.lessons?.[0]?.title) ||
    moduleValue?.lessons?.[0] ||
    null;
  return {
    courseKey: text(course?.key),
    moduleKey: text(moduleValue?.key),
    lessonKey: text(lesson?.key)
  };
}

function summarizeLegacyDependencyMicrosequence(microsequence = {}) {
  return {
    key: text(microsequence.key),
    title: text(microsequence.title),
    goal: text(microsequence.didacticPurpose || microsequence.description || microsequence.title),
    summary: text(microsequence.description || microsequence.didacticPurpose || microsequence.title),
    tags: uniqueList(microsequence.tags)
  };
}

function summarizeLegacyTrailMicrosequence(microsequence = {}) {
  return {
    key: text(microsequence.key),
    title: text(microsequence.title),
    goal: text(microsequence.didacticPurpose || microsequence.description || microsequence.title),
    tags: uniqueList(microsequence.tags),
    status: text(microsequence.status),
    included: microsequence?.included === true
  };
}

function buildBottomUpContextPacket(
  projectDocument = {},
  selection = {},
  {
    userRequest = "",
    dependencyTitles = [],
    selectedDidacticTypeId = "",
    preferredContainerLabel = "",
    ingestedAttachments = null
  } = {}
) {
  const course = findCourse(projectDocument, selection.courseKey);
  const moduleValue = findModule(projectDocument, selection.courseKey, selection.moduleKey);
  const lesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const microsequenceIndex = microsequences.findIndex((item) => item?.key === selection.microsequenceKey);
  const microsequence = microsequenceIndex >= 0 ? microsequences[microsequenceIndex] : null;
  if (!course || !moduleValue || !lesson || !microsequence) {
    throw new Error("Microssequência não encontrada.");
  }

  const previous = microsequenceIndex > 0 ? microsequences[microsequenceIndex - 1] : null;
  const next = microsequenceIndex >= 0 && microsequenceIndex < microsequences.length - 1 ? microsequences[microsequenceIndex + 1] : null;
  const dependencyMicrosequences = uniqueList(microsequence.dependsOn)
    .map((dependencyKey) => microsequences.find((item) => item?.key === dependencyKey))
    .filter(Boolean);
  const availableLessonTopics = buildLessonTopicRefsFromMicrosequences(microsequences);
  const selectedLessonTopicRefs = normalizeSelectedLessonTopicRefs({
    selectedLessonTopicRefs: [
      ...uniqueList(dependencyTitles).map((label) => ({
        refKey: label,
        label,
        source: "user_focus"
      })),
      {
        refKey: text(microsequence.key),
        label: text(microsequence.title),
        source: "microsequence"
      },
      ...uniqueList([
        ...uniqueList(microsequence.tags),
        ...dependencyMicrosequences.flatMap((item) => [item?.title, ...(Array.isArray(item?.tags) ? item.tags : [])])
      ]).map((label) => ({
        refKey: label,
        label,
        source: "topic"
      }))
    ],
    availableLessonTopics
  });
  const lessonForPolicy = {
    title: text(lesson.title),
    description: text(lesson.description || lesson.title),
    objective: text(lesson.description || lesson.title),
    sourceGuideStructured: lesson?.sourceGuideStructured || {},
    microsequenceLine: microsequences.map((item) => ({
      key: text(item.key),
      title: text(item.title),
      objective: text(item.didacticPurpose || item.description || item.title),
      description: text(item.description),
      didacticPurpose: text(item.didacticPurpose),
      coverageRole: text(item.coverageRole),
      tags: uniqueList(item.tags),
      domainRefs: uniqueList(item.domainRefs)
    }))
  };
  const currentForPolicy = {
    title: text(microsequence.title),
    description: text(microsequence.description),
    didacticPurpose: text(microsequence.didacticPurpose || microsequence.description || microsequence.title),
    coverageRole: text(microsequence.coverageRole),
    tags: uniqueList(microsequence.tags),
    domainRefs: uniqueList(microsequence.domainRefs),
    practiceVariantRefs: uniqueList(microsequence.practiceVariantRefs)
  };
  const studyTrackPolicy = buildStudyTrackPolicy({
    userPrompt: userRequest,
    lesson: lessonForPolicy,
    microsequence: currentForPolicy,
    selectedLessonTopicRefs
  });

  return {
    courseTitle: text(course.title),
    ...(text(course.description) ? { courseGoal: text(course.description) } : {}),
    module: {
      title: text(moduleValue.title),
      include:
        Array.isArray(moduleValue.include) && moduleValue.include.length
          ? uniqueList(moduleValue.include)
          : deriveModuleInclude(moduleValue, lesson),
      exclude: Array.isArray(moduleValue.exclude) ? uniqueList(moduleValue.exclude) : [],
      ...(text(moduleValue.notes) ? { notes: text(moduleValue.notes) } : {}),
      assessmentStyle:
        ["theoretical", "practical", "mixed"].includes(text(moduleValue.assessmentStyle))
          ? text(moduleValue.assessmentStyle)
          : "mixed"
    },
    lesson: {
      title: text(lesson.title),
      goal: text(lesson.description || lesson.title),
      ...(lesson?.sourceGuideStructured && Object.keys(lesson.sourceGuideStructured).length
        ? {
            sourceGuideStructured: clone(lesson.sourceGuideStructured),
            sourceGuide: buildSourceGuideTextForModel(lesson.sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
          }
        : {}),
    },
    currentMicrosequence: {
      key: text(microsequence.key),
      title: text(microsequence.title),
      goal: text(microsequence.didacticPurpose || microsequence.description || microsequence.title),
      type: "main",
      tags: uniqueList(microsequence.tags),
      dependsOn: dependencyMicrosequences.map((item) => summarizeLegacyDependencyMicrosequence(item))
    },
    neighborMicrosequences: {
      ...(previous
        ? {
            previous: {
              key: text(previous.key),
              title: text(previous.title),
              goal: text(previous.didacticPurpose || previous.description || previous.title),
              summary: text(previous.description || previous.didacticPurpose),
              tags: uniqueList(previous.tags)
            }
          }
        : {}),
      ...(next
        ? {
            next: {
              key: text(next.key),
              title: text(next.title),
              goal: text(next.didacticPurpose || next.description || next.title),
              tags: uniqueList(next.tags)
            }
          }
        : {})
    },
    lessonMicrosequenceLine: microsequences.map((item) => summarizeLegacyTrailMicrosequence(item)),
    selectedLessonTopicRefs,
    studyTrackPolicy,
    generationRules: {
      adhereToPlannedTrack: true,
      allowOnlyDeclaredDependencies: true,
      allowCreateAdjacentMicrosequenceOnly: true
    },
    userFocus: {
      dependencyTitles: uniqueList(dependencyTitles),
      ...(text(selectedDidacticTypeId) ? { selectedDidacticTypeId: text(selectedDidacticTypeId) } : {}),
      ...(text(preferredContainerLabel) && !["automatico", "automático"].includes(text(preferredContainerLabel).toLowerCase())
        ? { preferredContainerLabel: text(preferredContainerLabel) }
        : {})
    },
    ...(ingestedAttachments?.extractedCount
      ? {
          attachments: {
            extractedCount: Number(ingestedAttachments.extractedCount) || 0,
            items: summarizeBottomUpAttachments(ingestedAttachments.attachments)
          }
        }
      : {}),
    allowedResources: ["say", "table", "code", "graph", "block_gap_fill"],
    density: "standard",
    ...(text(userRequest) ? { userRequest: text(userRequest) } : {})
  };
}

function validateSupportPayload(payload = {}) {
  const title = text(payload?.title);
  const goal = text(payload?.goal);
  const supportReason = text(payload?.supportReason);
  const baseValidation = validateMicrosequenceCards({
    summary: text(payload?.summary),
    cards: Array.isArray(payload?.cards) ? payload.cards : []
  });
  if (!title || !goal || !supportReason || !baseValidation.ok) {
    const messages = [];
    if (!title) messages.push("Título da microssequência de suporte é obrigatório.");
    if (!goal) messages.push("Objetivo da microssequência de suporte é obrigatório.");
    if (!supportReason) messages.push("Motivo de suporte é obrigatório.");
    messages.push(...baseValidation.errors.map((error) => error.message));
    throw new Error(messages.join("; "));
  }
  return {
    title,
    goal,
    supportReason,
    summary: baseValidation.value.summary,
    cards: baseValidation.value.cards
  };
}

function listBottomUpAuditIssues(packet = {}, validatedPayload = {}) {
  const issues = [];
  const cards = Array.isArray(validatedPayload?.cards) ? validatedPayload.cards : [];
  const tags = uniqueList(packet?.currentMicrosequence?.tags);
  const include = uniqueList(packet?.module?.include);
  const localText = [
    text(packet?.currentMicrosequence?.title),
    text(packet?.currentMicrosequence?.goal),
    text(packet?.lesson?.title),
    text(packet?.lesson?.goal),
    ...tags,
    ...include
  ]
    .join(" ")
    .toLowerCase();

  const shouldRequireGraph = /(modelagem por grafos|pontes de königsberg|vértices|arestas|grafo completo|grafo bipartido|isomorf)/u.test(localText);
  if (shouldRequireGraph && !cards.some((card) => text(card?.resourceType) === "graph")) {
    issues.push("Inclua ao menos um card com resourceType graph e content válido em vertices/edges para representar o caso local.");
  }

  if (/matriz de adjac|dijkstra|sequência de graus|graus/u.test(localText)) {
    const tableCount = cards.filter((card) => text(card?.resourceType) === "table").length;
    const sayCount = cards.filter((card) => text(card?.resourceType) === "say").length;
    if (!tableCount && !sayCount) {
      issues.push("Inclua ao menos um card explicativo ou tabular que materialize o procedimento cobrado em prova.");
    }
  }

  return issues;
}

function shouldRequireLeadingGraph(packet = {}) {
  const tags = uniqueList(packet?.currentMicrosequence?.tags);
  const include = uniqueList(packet?.module?.include);
  const localText = [
    text(packet?.currentMicrosequence?.title),
    text(packet?.currentMicrosequence?.goal),
    text(packet?.lesson?.title),
    text(packet?.lesson?.goal),
    ...tags,
    ...include
  ]
    .join(" ")
    .toLowerCase();
  return /(modelagem por grafos|pontes de königsberg|vértices|arestas|grafo completo|grafo bipartido|isomorf)/u.test(localText);
}

function buildBottomUpCorrectionPrompt(basePrompt = "", issues = []) {
  const normalizedIssues = uniqueList(issues);
  if (!normalizedIssues.length) {
    return basePrompt;
  }
  return [
    basePrompt,
    "",
    "CORRECOES OBRIGATORIAS:",
    ...normalizedIssues.map((issue) => `- ${issue}`),
    "- Reescreva a resposta inteira em JSON valido, sem comentários."
  ].join("\n");
}

async function generateValidatedBottomUpPayload({
  runtime,
  modelId,
  mode,
  system,
  basePrompt,
  packet,
  density = "standard",
  schema,
  temperature = 0.2
} = {}) {
  let lastError = null;
  let prompt = basePrompt;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const payload = await runtime.provider.generateStructured({
      ...runtime.providerOptions,
      modelId,
      mode,
      system,
      prompt,
      schema,
      temperature
    });
    const validation = validateMicrosequenceCards(payload, density);
    if (!validation.ok) {
      lastError = new Error(validation.errors.map((error) => error.message).join("; "));
      prompt = buildBottomUpCorrectionPrompt(basePrompt, validation.errors.map((error) => error.message));
      continue;
    }
    const auditIssues = listBottomUpAuditIssues(packet, validation.value);
    if (!auditIssues.length) {
      return validation.value;
    }
    lastError = new Error(auditIssues.join("; "));
    prompt = buildBottomUpCorrectionPrompt(basePrompt, auditIssues);
  }
  throw lastError || new Error("Falha ao validar a microssequência gerada.");
}

function applyCardsToCurrentMicrosequence(projectDocument = {}, selection = {}, payload = {}) {
  const nextProject = clone(projectDocument);
  const lesson = findLesson(nextProject, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequenceIndex = (lesson?.microsequences || []).findIndex((item) => item?.key === selection.microsequenceKey);
  if (!lesson || microsequenceIndex < 0) {
    throw new Error("Microssequência não encontrada.");
  }
  const current = lesson.microsequences[microsequenceIndex];
  lesson.microsequences[microsequenceIndex] = {
    ...current,
    status: "ready",
    included: true,
    cards: payload.cards.map((card) => toLegacyContractCard(card))
  };
  return {
    projectDocument: nextProject,
    target: {
      ...selection
    }
  };
}

function applySupportMicrosequence(projectDocument = {}, selection = {}, payload = {}) {
  const nextProject = clone(projectDocument);
  const lesson = findLesson(nextProject, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const currentIndex = (lesson?.microsequences || []).findIndex((item) => item?.key === selection.microsequenceKey);
  if (!lesson || currentIndex < 0) {
    throw new Error("Microssequência não encontrada.");
  }
  const existing = findByTitle(lesson.microsequences, payload.title);
  const current = lesson.microsequences[currentIndex];
  const nextMicrosequence = {
    ...(existing ? clone(existing) : {}),
    key: text(existing?.key) || ensureUniqueKey(lesson.microsequences, "", "microsequence", payload.title),
    title: payload.title,
    description: payload.goal,
    tags: uniqueList(
      Array.isArray(existing?.tags) && existing.tags.length ? existing.tags : current?.tags
    ),
    status: "ready",
    included: true,
    dependsOn: uniqueList([text(current?.key)]),
    cards: payload.cards.map((card) => toLegacyContractCard(card))
  };
  if (existing) {
    const existingIndex = lesson.microsequences.findIndex((item) => item?.key === existing.key);
    lesson.microsequences[existingIndex] = nextMicrosequence;
  } else {
    lesson.microsequences.splice(currentIndex + 1, 0, nextMicrosequence);
  }
  return {
    projectDocument: nextProject,
    target: {
      ...selection,
      microsequenceKey: nextMicrosequence.key
    }
  };
}

export async function generateStructureProjectDocument({
  draft = {},
  scopeState = {},
  projectDocument = {},
  assistConfig = {},
  ingestAttachments,
  provider = null,
  onProgress
} = {}) {
  if (typeof ingestAttachments !== "function") {
    throw new Error("Ingestão de anexos indisponível para a geração estrutural.");
  }
  const ingestedAttachments = await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : []);
  const runtime = provider
    ? { modelId: text(assistConfig.model) || "gemini-2.5-flash", provider, providerOptions: {} }
    : resolveGenerationProviderRuntime(assistConfig);
  const scopeSeed = buildScopeSeed({ draft, scopeState }, projectDocument);

  onProgress?.({ type: "phase_started", phaseId: "normalize_intent", modelId: runtime.modelId });
  onProgress?.({ type: "provider_call_started", phaseId: "normalize_intent", modelId: runtime.modelId });
  const scopeContract = await inferScopeContract({
    draft,
    scopeSeed,
    scopeState,
    ingestedAttachments,
    assistConfig,
    provider: runtime.provider
  });
  onProgress?.({ type: "provider_call_completed", phaseId: "normalize_intent", modelId: runtime.modelId });
  onProgress?.({ type: "phase_completed", phaseId: "normalize_intent", modelId: runtime.modelId });

  onProgress?.({ type: "phase_started", phaseId: "plan_architecture", modelId: runtime.modelId });
  onProgress?.({ type: "provider_call_started", phaseId: "plan_architecture", modelId: runtime.modelId });
  const planning = await planCourseFromScope({
    scopeContract,
    provider: runtime.provider,
    modelId: runtime.modelId,
    providerOptions: runtime.providerOptions
  });
  onProgress?.({ type: "provider_call_completed", phaseId: "plan_architecture", modelId: runtime.modelId });
  onProgress?.({ type: "phase_completed", phaseId: "plan_architecture", modelId: runtime.modelId });

  const nextProjectDocument = mergeTopDownResultIntoProject({
    projectDocument,
    plannedCourse: planning.plannedCourse,
    scopeState
  });
  const target = resolveTopDownTarget(nextProjectDocument, planning.plannedCourse, scopeState);
  return {
    projectDocument: nextProjectDocument,
    patch: {
      operations: [{}],
      events: [{}],
      target
    },
    scopeContract,
    plannedCourse: planning.plannedCourse
  };
}

export async function generateMicrosequenceProjectDocument({
  selection = {},
  draft = {},
  assistConfig = {},
  projectDocument = {},
  density = "standard",
  provider = null,
  dependencyTitles = [],
  selectedDidacticTypeId = "",
  preferredContainerLabel = "",
  ingestAttachments
} = {}) {
  const runtime = provider
    ? { modelId: text(assistConfig.model) || "gemini-2.5-flash", provider, providerOptions: {} }
    : resolveGenerationProviderRuntime(assistConfig);
  const ingestedAttachments =
    typeof ingestAttachments === "function"
      ? await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : [])
      : { attachments: [], extractedCount: 0, warnings: [] };
  if (!text(draft.promptText) && !ingestedAttachments.extractedCount) {
    throw new Error("Informe um pedido ou anexo com texto utilizável antes de editar a microssequência.");
  }
  const packet = buildBottomUpContextPacket(projectDocument, selection, {
    userRequest: draft.promptText,
    dependencyTitles,
    selectedDidacticTypeId,
    preferredContainerLabel,
    ingestedAttachments
  });
  const isCreateAfter = text(draft.interventionTargetMode) === "new_after_current";
  const isRepair = text(draft.operationMode) === "repair";
  const currentMicrosequence = findMicrosequence(projectDocument, selection);
  const hasCards = Array.isArray(currentMicrosequence?.cards) && currentMicrosequence.cards.length > 0;

  if (isCreateAfter) {
    const payload = await runtime.provider.generateStructured({
      ...runtime.providerOptions,
      modelId: runtime.modelId,
      mode: "create-support",
      system: buildBottomUpSystemPrompt(),
      prompt: buildSupportPrompt(packet, draft.promptText),
      schema: buildSupportMicrosequenceSchema(density),
      temperature: 0.3
    });
    const validated = validateSupportPayload(payload);
    return applySupportMicrosequence(projectDocument, selection, validated);
  }

  const mode = isRepair ? "improve-microsequence" : hasCards ? "add-practice" : "generate-microsequence";
  const prompt =
    isRepair
      ? buildImprovePrompt(packet, draft.promptText)
      : hasCards
        ? buildPracticePrompt(packet, draft.promptText)
        : buildBottomUpUserPrompt(packet);
  const requireLeadingGraph = shouldRequireLeadingGraph(packet);
  const validated = await generateValidatedBottomUpPayload({
    runtime,
    modelId: runtime.modelId,
    mode,
    system: buildBottomUpSystemPrompt(),
    basePrompt: prompt,
    packet,
    density,
    schema: buildMicrosequenceCardsSchema(density, { requireLeadingGraph }),
    temperature: hasCards ? 0.3 : 0.2
  });
  return applyCardsToCurrentMicrosequence(projectDocument, selection, validated);
}
