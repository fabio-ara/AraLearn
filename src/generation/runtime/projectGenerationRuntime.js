import { buildScopedKey } from "../../core/ids.js";
import { normalizeLabelToken } from "../../core/text.js";
import { toLegacyContractCard } from "../../domain/cards.js";
import { EVIDENCE_KINDS, validateScopeContractDocument } from "../../domain/scopeContract.js";
import { createCodexCliProvider } from "../providers/codexCliProvider.js";
import { createGeminiProvider } from "../providers/geminiProvider.js";
import { createOpenAiCompatibleProvider } from "../providers/openAiCompatibleProvider.js";
import { validateMicrosequenceCards } from "../bottomUp/validateMicrosequenceCards.js";
import {
  buildBottomUpDidacticDraftSchema,
  buildMicrosequenceCardsSchema,
  buildSupportMicrosequenceSchema,
  buildTechnicalCardBudget
} from "../schemas/bottomUpSchema.js";
import {
  buildBottomUpCompileSystemPrompt,
  buildBottomUpCompileUserPrompt,
  buildBottomUpDraftSystemPrompt,
  buildBottomUpDraftUserPrompt
} from "../prompts/bottomUpPrompt.js";
import { buildImprovePrompt } from "../prompts/improvePrompt.js";
import { buildPracticePrompt } from "../prompts/practicePrompt.js";
import { buildSupportPrompt } from "../prompts/supportPrompt.js";
import { buildStudyTrackPolicy } from "../policies/studyTrackPolicy.js";
import { buildLessonTopicRefsFromMicrosequences, normalizeSelectedLessonTopicRefs } from "../tags/selectedLessonTopicRefs.js";
import { planCourseFromScope } from "../topDown/planCourseFromScope.js";
import { buildSourceGuideTextForModel, SOURCE_GUIDE_LEVELS } from "../../sourceGuides/sourceGuideStructured.js";
import { buildDidacticCardPlan } from "../planning/buildDeterministicCardPlan.js";
import { getModelCapabilities } from "../providers/modelCapabilities.js";

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

function listScopeTermLabels(items = []) {
  return uniqueList(
    (Array.isArray(items) ? items : [])
      .map((item) => text(item?.label || item))
      .filter(Boolean)
  );
}

function mapScopeRefsToLabels(scopeRefs = [], scopeTerms = []) {
  const labelById = new Map(
    (Array.isArray(scopeTerms) ? scopeTerms : [])
      .map((term) => [text(term?.id), text(term?.label)])
      .filter(([id, label]) => id && label)
  );
  return uniqueList(
    (Array.isArray(scopeRefs) ? scopeRefs : [])
      .map((scopeRef) => labelById.get(text(scopeRef)) || "")
      .filter(Boolean)
  );
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
  const modelCapabilities = getModelCapabilities(runtime.modelId);
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
    ...(text(plannedMicrosequence.didacticKind) ? { didacticKind: text(plannedMicrosequence.didacticKind) } : {}),
    ...(text(plannedMicrosequence.practiceMode) ? { practiceMode: text(plannedMicrosequence.practiceMode) } : {}),
    ...(text(plannedMicrosequence.representationNeed) ? { representationNeed: text(plannedMicrosequence.representationNeed) } : {}),
    ...(text(plannedMicrosequence.dependencyPolicy) ? { dependencyPolicy: text(plannedMicrosequence.dependencyPolicy) } : {}),
    ...(text(plannedMicrosequence.coverageRole) ? { coverageRole: text(plannedMicrosequence.coverageRole) } : {}),
    ...(Array.isArray(plannedMicrosequence.expectedEvidence) && plannedMicrosequence.expectedEvidence.length
      ? { expectedEvidence: uniqueList(plannedMicrosequence.expectedEvidence) }
      : {}),
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
    goal: text(microsequence.goal || microsequence.didacticPurpose || microsequence.description || microsequence.title),
    summary: text(microsequence.goal || microsequence.description || microsequence.didacticPurpose || microsequence.title),
    tags: uniqueList(microsequence.tags)
  };
}

function summarizeLegacyTrailMicrosequence(microsequence = {}) {
  return {
    key: text(microsequence.key),
    title: text(microsequence.title),
    goal: text(microsequence.goal || microsequence.didacticPurpose || microsequence.description || microsequence.title),
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
    density = "standard",
    dependencyTitles = [],
    selectedDidacticTypeId = "",
    preferredContainerLabel = "",
    ingestedAttachments = null,
    interactionMode = "normal_generation"
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
  const moduleIncludeLabels = listScopeTermLabels(moduleValue.include);
  const moduleExcludeLabels = listScopeTermLabels(moduleValue.exclude);
  const currentScopeLabels = mapScopeRefsToLabels(microsequence.scopeRefs, moduleValue.include);
  const dependencyScopeLabels = dependencyMicrosequences.flatMap((item) => mapScopeRefsToLabels(item?.scopeRefs, moduleValue.include));
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
        ...currentScopeLabels,
        ...dependencyScopeLabels,
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
    description: text(lesson.goal || lesson.description || lesson.title),
    objective: text(lesson.goal || lesson.description || lesson.title),
    sourceGuideStructured: lesson?.sourceGuideStructured || {},
    microsequenceLine: microsequences.map((item) => ({
      key: text(item.key),
      title: text(item.title),
      objective: text(item.goal || item.didacticPurpose || item.description || item.title),
      description: text(item.goal || item.description),
      didacticPurpose: text(item.didacticPurpose),
      coverageRole: text(item.coverageRole),
      tags: uniqueList(item.tags),
      domainRefs: uniqueList(item.domainRefs),
      scopeLabels: mapScopeRefsToLabels(item?.scopeRefs, moduleValue.include)
    }))
  };
  const currentForPolicy = {
    title: text(microsequence.title),
    description: text(microsequence.goal || microsequence.description),
    didacticPurpose: text(microsequence.goal || microsequence.didacticPurpose || microsequence.description || microsequence.title),
    coverageRole: text(microsequence.coverageRole),
    tags: uniqueList(microsequence.tags),
    domainRefs: uniqueList(microsequence.domainRefs),
    practiceVariantRefs: uniqueList(microsequence.practiceVariantRefs),
    scopeLabels: currentScopeLabels
  };
  const studyTrackPolicy = buildStudyTrackPolicy({
    userPrompt: userRequest,
    lesson: lessonForPolicy,
    microsequence: currentForPolicy,
    selectedLessonTopicRefs
  });

  return {
    courseTitle: text(course.title),
    ...(text(course.goal || course.description) ? { courseGoal: text(course.goal || course.description) } : {}),
    module: {
      title: text(moduleValue.title),
      include: moduleIncludeLabels.length ? moduleIncludeLabels : deriveModuleInclude(moduleValue, lesson),
      exclude: moduleExcludeLabels,
      ...(text(moduleValue.notes) ? { notes: text(moduleValue.notes) } : {}),
      assessmentStyle:
        ["theoretical", "practical", "mixed"].includes(text(moduleValue.assessmentStyle))
          ? text(moduleValue.assessmentStyle)
          : "mixed"
    },
    lesson: {
      title: text(lesson.title),
      goal: text(lesson.goal || lesson.description || lesson.title),
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
      goal: text(microsequence.goal || microsequence.didacticPurpose || microsequence.description || microsequence.title),
      type: text(microsequence.type) || "main",
      tags: uniqueList(microsequence.tags),
      dependsOn: dependencyMicrosequences.map((item) => summarizeLegacyDependencyMicrosequence(item)),
      scopeLabels: currentScopeLabels,
      didacticKind: text(microsequence.didacticKind),
      practiceMode: text(microsequence.practiceMode),
      representationNeed: text(microsequence.representationNeed),
      dependencyPolicy: text(microsequence.dependencyPolicy),
      coverageRole: text(microsequence.coverageRole),
      expectedEvidence: uniqueList(microsequence.expectedEvidence)
    },
    neighborMicrosequences: {
      ...(previous
        ? {
            previous: {
              key: text(previous.key),
              title: text(previous.title),
              goal: text(previous.goal || previous.didacticPurpose || previous.description || previous.title),
              summary: text(previous.goal || previous.description || previous.didacticPurpose),
              tags: uniqueList(previous.tags)
            }
          }
        : {}),
      ...(next
        ? {
            next: {
              key: text(next.key),
              title: text(next.title),
              goal: text(next.goal || next.didacticPurpose || next.description || next.title),
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
    interactionMode,
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
    density,
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

function classifyBottomUpIntervention({ draft = {}, packet = {}, hasCards = false } = {}) {
  if (text(draft?.interventionTargetMode) === "new_after_current") {
    return "create_support";
  }
  if (text(draft?.operationMode) === "repair") {
    return "repair";
  }
  if (packet?.studyTrackPolicy?.mode === "clarify_local_doubt") {
    return "answer_local_doubt";
  }
  if (hasCards) {
    return "add_practice";
  }
  return "normal_generation";
}

function buildDraftSeed(packet = {}, interactionMode = "normal_generation") {
  return {
    didacticKind: text(packet?.currentMicrosequence?.didacticKind) || "concept",
    practiceMode: text(packet?.currentMicrosequence?.practiceMode) || (interactionMode === "add_practice" ? "variation" : "explanation"),
    representationNeed: text(packet?.currentMicrosequence?.representationNeed) || "text",
    dependencyPolicy: text(packet?.currentMicrosequence?.dependencyPolicy) || "self_contained",
    coverageRole:
      text(packet?.currentMicrosequence?.coverageRole) ||
      ({
        normal_generation: "explain",
        add_practice: "extend_practice",
        repair: "repair_gap",
        create_support: "repair_gap",
        answer_local_doubt: "repair_gap"
      }[interactionMode] || "explain"),
    expectedEvidence: uniqueList(packet?.currentMicrosequence?.expectedEvidence)
  };
}

function buildFallbackCardPlan(packet = {}, interactionMode = "normal_generation", technicalBudget = {}) {
  const seed = buildDraftSeed(packet, interactionMode);
  return buildDidacticCardPlan(
    {
      currentMicrosequence: {
        ...(packet?.currentMicrosequence || {}),
        ...seed
      },
      preferredContainerLabel: packet?.userFocus?.preferredContainerLabel
    },
    {
      targetCount: Number(technicalBudget?.suggestedCardsPerCall) || 5,
      allowedResourceTypes: Array.isArray(packet?.allowedResources) ? packet.allowedResources : ["say", "table", "code", "graph", "block_gap_fill"]
    }
  );
}

function normalizeDraftSteps(draft = {}, fallbackCardPlan = []) {
  const steps = Array.isArray(draft?.steps) ? draft.steps : [];
  if (steps.length) {
    return steps.map((step, index) => ({
      position: index + 1,
      role: text(step?.role) || fallbackCardPlan[index]?.role || "microtheory",
      resourceType: text(step?.resourceType) || fallbackCardPlan[index]?.resourceType || "say",
      purpose: text(step?.purpose) || fallbackCardPlan[index]?.purpose || "",
      inCardContext: uniqueList(step?.inCardContext),
      usesDependency: uniqueList(step?.usesDependency),
      expectedEvidence: uniqueList(step?.expectedEvidence)
    }));
  }
  return fallbackCardPlan.map((item) => ({
    position: item.position,
    role: item.role,
    resourceType: item.resourceType,
    purpose: text(item?.purpose),
    inCardContext: [],
    usesDependency: uniqueList(item?.usesDependency),
    expectedEvidence: uniqueList(item?.expectedEvidence)
  }));
}

function buildContinuationPrompt({
  packet = {},
  interactionMode = "normal_generation",
  continuationMode = "same_microsequence",
  continuationReason = ""
} = {}) {
  const title = text(packet?.currentMicrosequence?.title) || "a microssequência atual";
  const reason = text(continuationReason);
  if (continuationMode === "support_microsequence") {
    return [
      `Crie uma microssequência de apoio adjacente antes de retomar "${title}".`,
      reason ? `Foco obrigatório: ${reason}.` : "Explique o pré-requisito local necessário e retorne ao objetivo principal."
    ].join(" ");
  }
  if (continuationMode === "next_microsequence") {
    return [
      `Abra uma nova microssequência depois de "${title}" para continuar a trilha sem comprimir conteúdo.`,
      reason ? `Objetivo da continuação: ${reason}.` : "Continue o objetivo atual com nova etapa e mesma governança local."
    ].join(" ");
  }
  return [
    `Continue "${title}" sem abrir novo escopo e sem resumir a etapa atual.`,
    reason ? `Priorize agora: ${reason}.` : "Distribua a continuação com mais decomposição, prática e contexto local."
  ].join(" ");
}

function buildInterventionFeedback({
  interactionMode = "normal_generation",
  modelId = "",
  promptText = "",
  attachmentNames = [],
  draftPlan = {},
  microsequenceTitle = "",
  cardCount = 0,
  createdSupport = false
} = {}) {
  const continuationNeeded = draftPlan?.continuationNeeded === true;
  const continuationMode = text(draftPlan?.continuationMode) || "none";
  const continuationReason = text(draftPlan?.continuationReason);
  if (createdSupport) {
    return {
      status: "completed",
      title: "Microssequência de apoio criada",
      message: `A etapa de apoio foi criada em "${microsequenceTitle || "Microssequência de apoio"}" e já pode ser iterada localmente.`,
      feedbackText: `A etapa de apoio foi criada com ${cardCount} cards.`,
      nextPromptDraft: "",
      recommendedActionIntent: "",
      recommendedInterventionTargetMode: "",
      recommendedOperationMode: "",
      recommendedInterventionType: "",
      continuationNeeded: false,
      continuationMode: "none",
      modelId,
      promptText,
      attachmentNames
    };
  }

  if (!continuationNeeded || continuationMode === "none") {
    return {
      status: "completed",
      title: "Intervenção concluída",
      message: `${cardCount} cards foram preparados em "${microsequenceTitle || "Microssequência"}".`,
      feedbackText: `Intervenção concluída em "${microsequenceTitle || "Microssequência"}".`,
      nextPromptDraft: "",
      recommendedActionIntent: "",
      recommendedInterventionTargetMode: "",
      recommendedOperationMode: "",
      recommendedInterventionType: "",
      continuationNeeded: false,
      continuationMode: "none",
      modelId,
      promptText,
      attachmentNames
    };
  }

  const mapping = {
    same_microsequence: {
      status: "needs_continue_here",
      title: "Continuação recomendada",
      recommendedActionIntent: interactionMode === "repair" ? "repair_current" : "continue_current",
      recommendedInterventionTargetMode: "current",
      recommendedOperationMode: interactionMode === "repair" ? "repair" : "reinforce",
      recommendedInterventionType: interactionMode === "repair" ? "local_semantic_rewrite" : "",
      message: reason =>
        reason || "A etapa atual ficou didaticamente bem decomposta, mas ainda pede nova iteração na mesma microssequência."
    },
    support_microsequence: {
      status: "needs_support_microsequence",
      title: "Apoio recomendado",
      recommendedActionIntent: "create_after_current",
      recommendedInterventionTargetMode: "new_after_current",
      recommendedOperationMode: "reinforce",
      recommendedInterventionType: "explanatory_bridge",
      message: reason =>
        reason || "A continuação segura exige uma etapa de apoio antes de retomar o objetivo principal."
    },
    next_microsequence: {
      status: "needs_new_microsequence",
      title: "Nova microssequência recomendada",
      recommendedActionIntent: "create_after_current",
      recommendedInterventionTargetMode: "new_after_current",
      recommendedOperationMode: "reinforce",
      recommendedInterventionType: "guided_practice_bridge",
      message: reason =>
        reason || "O conteúdo seguinte deve ser aberto em nova microssequência para preservar a carga didática."
    }
  };
  const selected = mapping[continuationMode] || mapping.same_microsequence;
  return {
    status: selected.status,
    title: selected.title,
    message: selected.message(continuationReason),
    feedbackText: text(draftPlan?.continuationPrompt)
      || buildContinuationPrompt({
        packet: {
          currentMicrosequence: {
            title: microsequenceTitle
          }
        },
        interactionMode,
        continuationMode,
        continuationReason
      }),
    nextPromptDraft: text(draftPlan?.continuationPrompt)
      || buildContinuationPrompt({
        packet: {
          currentMicrosequence: {
            title: microsequenceTitle
          }
        },
        interactionMode,
        continuationMode,
        continuationReason
      }),
    recommendedActionIntent: selected.recommendedActionIntent,
    recommendedInterventionTargetMode: selected.recommendedInterventionTargetMode,
    recommendedOperationMode: selected.recommendedOperationMode,
    recommendedInterventionType: selected.recommendedInterventionType,
    continuationNeeded: true,
    continuationMode,
    modelId,
    promptText,
    attachmentNames
  };
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
    "- Se aparecer a orientação para dividir um card, separe teoria, exemplo e prática em cards distintos.",
    "- Se um card for do tipo table, ele deve ter columns e pelo menos 1 linha com pelo menos 1 célula (rows não pode ser vazio).",
    "- Se o modelo estiver em dúvida sobre o formato, prefira say ou block_gap_fill em vez de table.",
    "- Reescreva a resposta inteira em JSON valido, sem comentários."
  ].join("\n");
}

async function generateDidacticDraft({
  runtime,
  modelId,
  packet,
  interactionMode,
  fallbackCardPlan,
  temperature = 0.2
} = {}) {
  try {
    const draft = await runtime.provider.generateStructured({
      ...runtime.providerOptions,
      modelId,
      mode: `${interactionMode}-draft`,
      system: buildBottomUpDraftSystemPrompt(),
      prompt: buildBottomUpDraftUserPrompt(packet, { fallbackPlan: fallbackCardPlan }),
      schema: buildBottomUpDidacticDraftSchema(),
      temperature
    });
    return {
      steps: normalizeDraftSteps(draft, fallbackCardPlan),
      coverageNotes: uniqueList(draft?.coverageNotes),
      continuationNeeded: draft?.continuationNeeded === true,
      continuationReason: text(draft?.continuationReason),
      continuationMode: text(draft?.continuationMode) || "none",
      continuationPrompt: text(draft?.continuationPrompt)
    };
  } catch {
    return {
      steps: normalizeDraftSteps({}, fallbackCardPlan),
      coverageNotes: ["Draft intermediário indisponível; usando plano didático determinístico."],
      continuationNeeded: false,
      continuationReason: "",
      continuationMode: "none",
      continuationPrompt: ""
    };
  }
}

async function generateValidatedBottomUpPayload({
  runtime,
  modelId,
  mode,
  basePrompt,
  packet,
  density = "standard",
  modelCapabilities = {},
  cardPlan = [],
  temperature = 0.2
} = {}) {
  const schema = buildMicrosequenceCardsSchema(density, { modelCapabilities });
  let lastError = null;
  let prompt = basePrompt;
  // Modelos fracos podem precisar de mais tentativas com correção guiada.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const payload = await runtime.provider.generateStructured({
      ...runtime.providerOptions,
      modelId,
      mode,
      system: buildBottomUpCompileSystemPrompt(),
      prompt,
      schema,
      temperature
    });
    const validation = validateMicrosequenceCards(payload, density, {
      packet,
      cardPlan,
      modelCapabilities
    });
    if (!validation.ok) {
      lastError = new Error(validation.errors.map((error) => error.message).join("; "));
      prompt = buildBottomUpCorrectionPrompt(basePrompt, validation.errors.map((error) => error.message));
      continue;
    }
    return validation.value;
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
    goal: payload.goal,
    description: payload.goal,
    tags: uniqueList(
      Array.isArray(existing?.tags) && existing.tags.length ? existing.tags : current?.tags
    ),
    type: "support",
    status: "ready",
    included: true,
    dependsOn: uniqueList([text(current?.key)]),
    parentMicrosequenceKey: text(current?.key),
    supportReason: payload.supportReason,
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
  const modelCapabilities = getModelCapabilities(runtime.modelId);
  const ingestedAttachments =
    typeof ingestAttachments === "function"
      ? await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : [])
      : { attachments: [], extractedCount: 0, warnings: [] };
  if (!text(draft.promptText) && !ingestedAttachments.extractedCount) {
    throw new Error("Informe um pedido ou anexo com texto utilizável antes de editar a microssequência.");
  }
  const currentMicrosequence = findMicrosequence(projectDocument, selection);
  const hasCards = Array.isArray(currentMicrosequence?.cards) && currentMicrosequence.cards.length > 0;
  const interactionMode = classifyBottomUpIntervention({
    draft,
    packet: {
      studyTrackPolicy: buildStudyTrackPolicy({
        userPrompt: draft.promptText,
        lesson: {
          ...(findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey) || {}),
          microsequenceLine: (findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey)?.microsequences || []).map((item) => ({
            key: text(item?.key),
            title: text(item?.title),
            objective: text(item?.didacticPurpose || item?.description || item?.title)
          }))
        },
        microsequence: {
          key: text(currentMicrosequence?.key),
          title: text(currentMicrosequence?.title),
          didacticPurpose: text(currentMicrosequence?.didacticPurpose || currentMicrosequence?.description || currentMicrosequence?.title)
        },
        selectedLessonTopicRefs: []
      })
    },
    hasCards
  });
  const packet = buildBottomUpContextPacket(projectDocument, selection, {
    userRequest: draft.promptText,
    density,
    dependencyTitles,
    selectedDidacticTypeId,
    preferredContainerLabel,
    ingestedAttachments,
    interactionMode
  });
  const technicalBudget = buildTechnicalCardBudget(density, modelCapabilities);

  if (interactionMode === "create_support") {
    const payload = await runtime.provider.generateStructured({
      ...runtime.providerOptions,
      modelId: runtime.modelId,
      mode: "create-support",
      system: buildBottomUpCompileSystemPrompt(),
      prompt: buildSupportPrompt(packet, draft.promptText),
      schema: buildSupportMicrosequenceSchema(density, { modelCapabilities }),
      temperature: 0.3
    });
  const validated = validateSupportPayload(payload);
    const applied = applySupportMicrosequence(projectDocument, selection, validated);
    const targetMicrosequence = findMicrosequence(applied.projectDocument, applied.target);
    return {
      ...applied,
      interventionFeedback: buildInterventionFeedback({
        interactionMode,
        modelId: runtime.modelId,
        promptText: text(draft.promptText),
        attachmentNames: (Array.isArray(ingestedAttachments.attachments) ? ingestedAttachments.attachments : []).map((item) => text(item?.name)).filter(Boolean),
        microsequenceTitle: text(targetMicrosequence?.title || validated.title),
        cardCount: Array.isArray(validated.cards) ? validated.cards.length : 0,
        createdSupport: true
      })
    };
  }

  const mode =
    interactionMode === "repair"
      ? "improve-microsequence"
      : interactionMode === "add_practice"
        ? "add-practice"
        : interactionMode === "answer_local_doubt"
          ? "answer-local-doubt"
          : "generate-microsequence";
  const correctionPrompt =
    interactionMode === "repair"
      ? buildImprovePrompt(packet, draft.promptText)
      : interactionMode === "add_practice"
        ? buildPracticePrompt(packet, draft.promptText)
        : interactionMode === "answer_local_doubt"
          ? buildImprovePrompt(packet, draft.promptText || "Responder à dúvida local e retornar à trilha.")
          : "";
  const fallbackCardPlan = buildFallbackCardPlan(packet, interactionMode, technicalBudget);
  const draftPlan = await generateDidacticDraft({
    runtime,
    modelId: runtime.modelId,
    packet,
    interactionMode,
    fallbackCardPlan,
    temperature: hasCards ? 0.3 : 0.2
  });
  const cardPlan = draftPlan.steps.map((step) => ({
    position: step.position,
    role: step.role,
    resourceType: step.resourceType,
    purpose: step.purpose,
    expectedEvidence: step.expectedEvidence
  }));
  const prompt = buildBottomUpCompileUserPrompt(
    packet,
    draftPlan,
    {
      cardPlan,
      schema: buildMicrosequenceCardsSchema(density, {
        modelCapabilities
      })
    }
  );
  const validated = await generateValidatedBottomUpPayload({
    runtime,
    modelId: runtime.modelId,
    mode,
    basePrompt: correctionPrompt ? `${prompt}\n\nAjuste adicional:\n${correctionPrompt}` : prompt,
    packet,
    density,
    modelCapabilities,
    cardPlan,
    temperature: hasCards ? 0.3 : 0.2
  });
  const applied = applyCardsToCurrentMicrosequence(projectDocument, selection, validated);
  const appliedMicrosequence = findMicrosequence(applied.projectDocument, applied.target);
  return {
    ...applied,
    interventionFeedback: buildInterventionFeedback({
      interactionMode,
      modelId: runtime.modelId,
      promptText: text(draft.promptText),
      attachmentNames: (Array.isArray(ingestedAttachments.attachments) ? ingestedAttachments.attachments : []).map((item) => text(item?.name)).filter(Boolean),
      draftPlan,
      microsequenceTitle: text(appliedMicrosequence?.title || currentMicrosequence?.title),
      cardCount: Array.isArray(validated.cards) ? validated.cards.length : 0
    })
  };
}
