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
  buildTechnicalCardBudget,
  DEPENDENCY_POLICY_ENUM,
  DIDACTIC_KIND_ENUM,
  PRACTICE_MODE_ENUM,
  REPRESENTATION_NEED_ENUM
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

function normalizeToken(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function resolveAllowedBottomUpResources({
  lesson = {},
  currentMicrosequence = {},
  preferredContainerLabel = "",
  selectedDidacticTypeId = ""
} = {}) {
  const base = ["say", "table", "code", "block_gap_fill"];
  const normalizedSignals = [
    text(preferredContainerLabel),
    text(selectedDidacticTypeId),
    text(currentMicrosequence?.representationNeed),
    text(currentMicrosequence?.didacticKind),
    text(currentMicrosequence?.goal),
    text(currentMicrosequence?.title),
    text(lesson?.title),
    text(lesson?.goal),
    text(lesson?.sourceGuide),
    text(lesson?.sourceGuideStructured?.notationRules)
  ]
    .map((item) => normalizeToken(item))
    .filter(Boolean)
    .join(" ");
  const explicitlyWantsGraph =
    /\bgrafo|grafos|graph|vertice|vertices|aresta|arestas|adjacencia|incidencia|dijkstra|euler/.test(normalizedSignals)
    || normalizeToken(preferredContainerLabel) === "grafo";
  return explicitlyWantsGraph ? [...base, "graph"] : base;
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

function findNextPlannedMainMicrosequence(projectDocument = {}, selection = {}) {
  const lesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const currentIndex = microsequences.findIndex((item) => item?.key === selection.microsequenceKey);
  if (currentIndex < 0) {
    return null;
  }
  return microsequences
    .slice(currentIndex + 1)
    .find((item) => text(item?.type || "main") === "main") || null;
}

function isMaterializedLegacyMicrosequence(microsequence = {}) {
  return ["ready", "generated", "needs_review"].includes(text(microsequence?.status))
    || microsequence?.included === true
    || (Array.isArray(microsequence?.cards) && microsequence.cards.length > 0);
}

function isReadyDependencyStatus(status = "") {
  return ["generated", "ready", "needs_review"].includes(text(status));
}

function isReadyDependencyMicrosequence(microsequence = {}) {
  return isReadyDependencyStatus(microsequence?.status)
    || (microsequence?.included === true && Array.isArray(microsequence?.cards) && microsequence.cards.length > 0);
}

function resolveBottomUpTargetSelection(projectDocument = {}, selection = {}, draft = {}) {
  if (text(draft?.actionIntent) !== "next_planned") {
    return {
      targetSelection: { ...selection },
      routeHint: ""
    };
  }
  const nextMain = findNextPlannedMainMicrosequence(projectDocument, selection);
  if (!nextMain) {
    throw new Error("Não existe próxima microssequência principal planejada.");
  }
  const lesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const missingDependency = uniqueList(nextMain?.dependsOn).find((dependencyKey) => {
    const dependency = microsequences.find((item) => item?.key === dependencyKey);
    return !dependency || !isReadyDependencyMicrosequence(dependency);
  });
  if (missingDependency) {
    return {
      targetSelection: { ...selection },
      routeHint: "generate_planned_next",
      blockedBy: missingDependency,
      blockedTargetKey: text(nextMain.key)
    };
  }
  return {
    targetSelection: {
      ...selection,
      microsequenceKey: text(nextMain.key)
    },
    routeHint: "generate_planned_next"
  };
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
    goal: text(plannedMicrosequence.goal || existing?.goal),
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
  const plannedByTitle = new Map(
    (Array.isArray(plannedLesson?.microsequences) ? plannedLesson.microsequences : [])
      .map((item) => [normalizeLabelToken(item?.title), item])
      .filter(([title]) => title)
  );
  const titleToKey = new Map(
    microsequences.map((item) => [normalizeLabelToken(item?.title), text(item?.key)]).filter((entry) => entry[0] && entry[1])
  );
  return microsequences.map((microsequence) => {
    const plannedMicrosequence = plannedByTitle.get(normalizeLabelToken(microsequence?.title));
    if (!plannedMicrosequence) {
      return {
        ...microsequence,
        dependsOn: Array.isArray(microsequence?.dependsOn) ? uniqueList(microsequence.dependsOn) : []
      };
    }
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
  const plannedMicrosequences = (Array.isArray(plannedLesson.microsequences) ? plannedLesson.microsequences : []).map((item) =>
    buildLegacyMicrosequenceFromPlan(item, existing || {})
  );
  const plannedTitles = new Set(
    (Array.isArray(plannedLesson.microsequences) ? plannedLesson.microsequences : [])
      .map((item) => normalizeLabelToken(item?.title))
      .filter(Boolean)
  );
  const preservedExistingMicrosequences = (Array.isArray(existing?.microsequences) ? existing.microsequences : [])
    .filter((item) => !plannedTitles.has(normalizeLabelToken(item?.title)) && isMaterializedLegacyMicrosequence(item))
    .map((item) => clone(item));
  const normalizedSourceGuideStructured =
    plannedLesson?.sourceGuideStructured && typeof plannedLesson.sourceGuideStructured === "object"
      ? clone(plannedLesson.sourceGuideStructured)
      : {};
  const lesson = {
    ...(existing ? clone(existing) : {}),
    key: text(existing?.key) || buildScopedKey("lesson", plannedLesson.title),
    title: text(plannedLesson.title),
    goal: text(plannedLesson.goal || existing?.goal),
    description: text(plannedLesson.goal),
    ...(Object.keys(normalizedSourceGuideStructured).length
      ? {
          sourceGuideStructured: normalizedSourceGuideStructured,
          sourceGuide: buildSourceGuideTextForModel(normalizedSourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
        }
      : {}),
    microsequences: [...preservedExistingMicrosequences, ...plannedMicrosequences]
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
    ...(text(plannedCourse?.course?.goal || existingCourse?.goal)
      ? { goal: text(plannedCourse?.course?.goal || existingCourse?.goal) }
      : {}),
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

function readLegacyCardContent(card = {}) {
  return [
    text(card?.title),
    text(card?.say),
    text(card?.content),
    text(card?.code),
    Array.isArray(card?.table?.rows) ? card.table.rows.flat().map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" ") : "",
    Array.isArray(card?.table?.columns) ? card.table.columns.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" ") : ""
  ].filter(Boolean).join(" ");
}

function summarizeLegacyCardsBrief(cards = [], limit = 3) {
  return (Array.isArray(cards) ? cards : [])
    .slice(0, limit)
    .map((card) => readLegacyCardContent(card).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((item) => item.length > 180 ? `${item.slice(0, 177)}...` : item);
}

function summarizeLegacyDependencyMicrosequence(microsequence = {}) {
  return {
    key: text(microsequence.key),
    title: text(microsequence.title),
    goal: text(microsequence.goal || microsequence.didacticPurpose || microsequence.description || microsequence.title),
    summary: text(microsequence.goal || microsequence.description || microsequence.didacticPurpose || microsequence.title),
    tags: uniqueList(microsequence.tags),
    cardSummary: summarizeLegacyCardsBrief(microsequence.cards)
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
      expectedEvidence: uniqueList(microsequence.expectedEvidence),
      existingCards: summarizeLegacyCardsBrief(microsequence.cards, 8)
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
    allowedResources: resolveAllowedBottomUpResources({
      lesson,
      currentMicrosequence: microsequence,
      preferredContainerLabel,
      selectedDidacticTypeId
    }),
    density,
    ...(text(userRequest) ? { userRequest: text(userRequest) } : {})
  };
}

function validateSupportPayload(payload = {}, { packet = {}, density = "standard", modelCapabilities = {} } = {}) {
  const title = text(payload?.title);
  const goal = text(payload?.goal);
  const supportReason = text(payload?.supportReason);
  const didacticKind = DIDACTIC_KIND_ENUM.includes(text(payload?.didacticKind))
    ? text(payload.didacticKind)
    : text(packet?.currentMicrosequence?.didacticKind) || "concept";
  const practiceMode = PRACTICE_MODE_ENUM.includes(text(payload?.practiceMode))
    ? text(payload.practiceMode)
    : "explanation";
  const representationNeed = REPRESENTATION_NEED_ENUM.includes(text(payload?.representationNeed))
    ? text(payload.representationNeed)
    : "text";
  const dependencyPolicy = DEPENDENCY_POLICY_ENUM.includes(text(payload?.dependencyPolicy))
    ? text(payload.dependencyPolicy)
    : "uses_previous";
  const expectedEvidence = uniqueList(payload?.expectedEvidence).length
    ? uniqueList(payload.expectedEvidence)
    : [`explicar como o apoio permite retomar ${text(packet?.currentMicrosequence?.title) || "a trilha principal"}`];
  const forbiddenTerms = Array.isArray(packet?.module?.exclude) ? uniqueList(packet.module.exclude) : [];
  const baseValidation = validateMicrosequenceCards({
    summary: text(payload?.summary),
    cards: Array.isArray(payload?.cards) ? payload.cards : []
  }, density, {
    packet,
    modelCapabilities
  });
  const headerText = [title, goal, supportReason].join("\n");
  const leakedHeaderTerms = forbiddenTerms.filter((term) => normalizeToken(headerText).includes(normalizeToken(term)));
  const lastSupportCard = baseValidation.value?.cards?.[baseValidation.value.cards.length - 1] || {};
  const lastSupportText = normalizeToken([
    text(lastSupportCard?.title),
    typeof lastSupportCard?.content === "string" ? lastSupportCard.content : text(lastSupportCard?.content?.text || lastSupportCard?.content?.intro)
  ].join(" "));
  const hasReturnToTrack = /\b(volte|retome|retornar|retorne|trilha principal|fluxo principal)\b/u.test(lastSupportText);
  if (
    !title
    || !goal
    || !supportReason
    || leakedHeaderTerms.length
    || !baseValidation.ok
    || (baseValidation.value?.cards || []).length < 4
    || !hasReturnToTrack
  ) {
    const messages = [];
    if (!title) messages.push("Título da microssequência de suporte é obrigatório.");
    if (!goal) messages.push("Objetivo da microssequência de suporte é obrigatório.");
    if (!supportReason) messages.push("Motivo de suporte é obrigatório.");
    if ((baseValidation.value?.cards || []).length < 4) {
      messages.push("O apoio deve ter pelo menos 4 cards.");
    }
    if (!hasReturnToTrack) {
      messages.push("O último card do apoio deve retomar explicitamente a trilha principal.");
    }
    if (leakedHeaderTerms.length) {
      messages.push(`Conteúdo fora do escopo (exclude do módulo): ${leakedHeaderTerms.join(", ")}.`);
    }
    messages.push(...baseValidation.errors.map((error) => error.message));
    throw new Error(messages.join("; "));
  }
  return {
    title,
    goal,
    supportReason,
    didacticKind,
    practiceMode,
    representationNeed,
    dependencyPolicy,
    expectedEvidence,
    summary: baseValidation.value.summary,
    cards: baseValidation.value.cards
  };
}

function buildDeterministicSupportPayload(packet = {}, request = "") {
  const currentTitle = text(packet?.currentMicrosequence?.title) || "a etapa atual";
  const currentGoal = text(packet?.currentMicrosequence?.goal) || "o objetivo atual";
  const supportReason = text(request) || `Pré-requisito local para retomar ${currentTitle}.`;
  const dependencyTitle =
    text(packet?.neighborMicrosequences?.previous?.title)
    || text(packet?.currentMicrosequence?.dependsOn?.[0]?.title)
    || "a base imediatamente anterior";
  return {
    title: `Apoio local para ${currentTitle}`,
    goal: `Explicar o pré-requisito mínimo necessário para retomar ${currentGoal}.`,
    supportReason,
    didacticKind: "concept",
    practiceMode: "explanation",
    representationNeed: "text",
    dependencyPolicy: "uses_previous",
    expectedEvidence: [`explicar como o apoio permite retomar ${currentTitle}`],
    summary: `Microssequência de apoio curta para retomar ${currentTitle} sem abrir escopo paralelo.`,
    cards: [
      {
        key: "support-card-1",
        resourceType: "say",
        content: `Antes de retomar ${currentTitle}, precisamos fixar um pré-requisito local conectado a ${dependencyTitle}.`
      },
      {
        key: "support-card-2",
        resourceType: "say",
        content: `Foque no mínimo necessário: ${supportReason}. Explique isso sem abrir temas paralelos e mantendo a relação com ${currentGoal}.`
      },
      {
        key: "support-card-3",
        resourceType: "block_gap_fill",
        content: `Complete a ideia central: este apoio existe para retomar [[${currentTitle}::${currentTitle}]].`
      },
      {
        key: "support-card-4",
        resourceType: "block_gap_fill",
        content: `Escolha o foco correto: para voltar a ${currentTitle}, primeiro confirme [[${dependencyTitle}::${dependencyTitle}|um assunto paralelo]].`
      },
      {
        key: "support-card-5",
        resourceType: "say",
        content: `Com esse apoio local fechado, volte agora para ${currentTitle} e continue a trilha principal.`
      }
    ]
  };
}

function firstSentence(value = "") {
  const normalized = text(value).replace(/\s+/g, " ");
  return normalized.split(/(?<=[.!?])\s+/u)[0] || normalized;
}

function extractInstructionFlowTerms(packet = {}) {
  const source = [
    text(packet?.currentMicrosequence?.title),
    text(packet?.currentMicrosequence?.goal),
    text(packet?.currentMicrosequence?.description),
    ...uniqueList(packet?.currentMicrosequence?.expectedEvidence),
    ...uniqueList(packet?.currentMicrosequence?.scopeLabels)
  ].join(" ");
  const normalized = normalizeToken(source);
  const terms = [];
  if (/\bmemoria\b/u.test(normalized)) terms.push("memória");
  if (/\bcpu\b/u.test(normalized)) terms.push("CPU");
  if (/\bregistrador|registradores\b/u.test(normalized)) terms.push("registradores");
  return uniqueList(terms);
}

function hasProgramCounterFocus(packet = {}) {
  const source = [
    text(packet?.currentMicrosequence?.title),
    text(packet?.currentMicrosequence?.goal),
    ...uniqueList(packet?.currentMicrosequence?.expectedEvidence),
    ...uniqueList(packet?.currentMicrosequence?.scopeLabels),
    ...uniqueList(packet?.module?.include)
  ].join(" ");
  const normalized = normalizeToken(source);
  return /\b(pc|contador de programa|program counter|proxima instrucao|proximo endereco)\b/u.test(normalized);
}

function buildFallbackCardTitle(role = "", index = 0) {
  return {
    microtheory: "Ideia central",
    guided_example: "Exemplo guiado",
    example_reading: "Leitura guiada",
    contrast: "Compare os papéis",
    active_practice: "Complete o percurso",
    analogous_practice: "Classifique os papéis",
    cumulative_review: "Retomada final",
    correction: "Corrija a leitura",
    bridge_or_consolidation: "Fechamento"
  }[text(role)] || `Passo ${index + 1}`;
}

function buildFallbackRoleText(step = {}, packet = {}, interactionMode = "normal_generation") {
  const role = text(step?.role);
  const currentTitle = text(packet?.currentMicrosequence?.title) || "a etapa atual";
  const currentGoal = firstSentence(packet?.currentMicrosequence?.goal) || "entender o objetivo atual";
  const previousTitle = text(packet?.neighborMicrosequences?.previous?.title);
  const nextTitle = text(packet?.neighborMicrosequences?.next?.title);
  const scopeLabel = uniqueList(packet?.currentMicrosequence?.scopeLabels)[0] || currentTitle;
  const expectedEvidence = uniqueList(step?.expectedEvidence)[0] || "explicar o ponto central";
  const flowTerms = extractInstructionFlowTerms(packet);
  const hasInstructionFlow = flowTerms.includes("memória") && flowTerms.includes("CPU") && flowTerms.includes("registradores");
  const hasPcFocus = hasProgramCounterFocus(packet);

  if (role === "microtheory") {
    if (hasPcFocus) {
      return "O PC, ou contador de programa, é um registrador da CPU que guarda o endereço da próxima instrução a buscar na memória. Ele não guarda a instrução inteira; guarda a referência para onde a CPU deve olhar em seguida.";
    }
    if (hasInstructionFlow) {
      return "A instrução começa guardada na memória. Para ser tratada, ela precisa chegar à CPU. Dentro da CPU, registradores podem manter informações por pouco tempo enquanto a instrução é tratada.";
    }
    return `${currentGoal}. Antes de praticar, identifique o ponto principal desta etapa: ${scopeLabel}.`;
  }
  if (role === "guided_example") {
    if (hasPcFocus) {
      return "Exemplo: se o PC contém o endereço 104, a CPU usa esse número para buscar na memória a instrução que está no endereço 104. Depois da busca, a instrução pode ir para o registrador de instruções, enquanto o PC passa a apontar para a próxima busca.";
    }
    if (hasInstructionFlow) {
      return "Leia o caso: uma instrução está na memória, é buscada pela CPU e fica temporariamente em registradores internos enquanto é analisada. Esse é o percurso mínimo que esta etapa quer fixar.";
    }
    return `Caso guiado: quando aparecer "${currentTitle}", localize ${scopeLabel} e explique em uma frase como isso cumpre o objetivo da etapa.`;
  }
  if (role === "example_reading") {
    return `Leitura guiada: encontre no exemplo o trecho que mostra ${scopeLabel}. Depois escreva uma frase curta explicando por que esse trecho pertence a "${currentTitle}".`;
  }
  if (role === "contrast") {
    if (hasPcFocus) {
      return "Compare: a memória guarda instruções em endereços; o PC guarda o endereço da próxima instrução; o registrador de instruções guarda a instrução que acabou de ser buscada para ser interpretada.";
    }
    if (hasInstructionFlow) {
      return "Compare os papéis: a memória guarda a instrução antes do uso, a CPU trata a instrução, e os registradores guardam informações temporárias dentro da CPU.";
    }
    return `Compare dois papéis locais: ${scopeLabel} é o foco desta etapa; qualquer outro papel só deve aparecer se ajudar a cumprir o objetivo "${currentGoal}".`;
  }
  if (role === "active_practice") {
    if (hasPcFocus) {
      return "Complete: a CPU consulta o ____ para saber em qual endereço da memória buscar a próxima instrução.";
    }
    if (hasInstructionFlow) {
      return "Complete com: memória, CPU, registradores.\n\nA instrução está inicialmente na ____. Para ser tratada, ela chega à ____. Durante o tratamento, informações podem ficar temporariamente em ____.";
    }
    return `Complete: nesta etapa, o foco local é ____. Use uma palavra do objetivo e confira se a frase ajuda a ${expectedEvidence}.`;
  }
  if (role === "analogous_practice") {
    if (hasPcFocus) {
      return "Classifique cada frase como PC, memória ou registrador de instruções.\n\n1. Guarda o endereço da próxima instrução.\n2. Guarda várias instruções em endereços.\n3. Guarda a instrução que acabou de ser buscada.";
    }
    if (hasInstructionFlow) {
      return "Associe cada papel ao componente correto: guardar a instrução antes do uso; tratar a instrução; guardar temporariamente informações internas.";
    }
    return `Variação curta: escolha o termo central de "${currentTitle}" e escreva uma frase ligando essa escolha ao objetivo "${currentGoal}".`;
  }
  if (role === "cumulative_review") {
    if (hasPcFocus) {
      return "Retome em uma frase: a CPU usa o PC para encontrar na memória a próxima instrução, busca essa instrução e então segue o ciclo básico.";
    }
    if (hasInstructionFlow) {
      return "Retome o percurso em uma frase: a instrução sai da memória, chega à CPU e pode ficar temporariamente em registradores enquanto é tratada.";
    }
    return `Revise a trilha: explique ${scopeLabel} com suas palavras e conecte a resposta ao objetivo "${currentGoal}".`;
  }
  if (role === "correction") {
    return `Corrija a resposta: se a explicação não menciona ${scopeLabel}, acrescente uma frase dizendo como esse ponto sustenta o objetivo "${currentGoal}".`;
  }
  if (interactionMode === "answer_local_doubt") {
    return `Dúvida local fechada. Retome agora ${currentTitle} e siga a trilha principal.`;
  }
  if (interactionMode === "create_support") {
    return `Com esse apoio local fechado, volte agora para ${currentTitle} e siga a trilha principal.`;
  }
  const bridgeTarget = nextTitle ? ` e prepare a passagem para ${nextTitle}` : "";
  const dependencyBridge = previousTitle ? ` sem perder a ligação com ${previousTitle}` : "";
  return `Feche ${currentTitle}${dependencyBridge}${bridgeTarget} e retome a trilha principal.`;
}

function buildFallbackStructuredCard(step = {}, packet = {}, interactionMode = "normal_generation", index = 0) {
  const resourceType = text(step?.resourceType) || "say";
  const title = buildFallbackCardTitle(step?.role, index);
  const roleText = buildFallbackRoleText(step, packet, interactionMode);
  const keyPrefix = interactionMode === "repair" ? "repair-card" : "fallback-card";
  const scopeLabel = uniqueList(packet?.currentMicrosequence?.scopeLabels)[0] || text(packet?.currentMicrosequence?.title) || "ponto atual";
  const flowTerms = extractInstructionFlowTerms(packet);
  const hasInstructionFlow = flowTerms.includes("memória") && flowTerms.includes("CPU") && flowTerms.includes("registradores");

  if (resourceType === "block_gap_fill") {
    return {
      key: `${keyPrefix}-${index + 1}`,
      title,
      resourceType,
      content: roleText
    };
  }
  if (resourceType === "table") {
    const tableContent = hasInstructionFlow
      ? {
          intro: "Classifique cada descrição usando: memória, CPU ou registradores.",
          columns: ["Descrição", "Componente"],
          rows: [
            ["Guarda a instrução antes de ela ser usada.", "____"],
            ["Trata a instrução depois que ela chega.", "____"],
            ["Mantêm informações por pouco tempo dentro da CPU.", "____"]
          ]
        }
      : {
          intro: `Preencha a coluna Resposta com o papel que cumpre ${scopeLabel}.`,
          columns: ["Descrição", "Resposta"],
          rows: [
            [`Ponto que cumpre o objetivo: ${text(packet?.currentMicrosequence?.goal) || scopeLabel}.`, "____"],
            [`Evidência esperada: ${uniqueList(step?.expectedEvidence)[0] || "explicar o ponto central"}.`, "____"]
          ]
        };
    return {
      key: `${keyPrefix}-${index + 1}`,
      title,
      resourceType,
      content: tableContent
    };
  }
  if (resourceType === "graph") {
    return {
      key: `${keyPrefix}-${index + 1}`,
      title,
      resourceType,
      content: {
        intro: `Relação mínima para orientar esta etapa.`,
        vertices: [
          { id: "ATUAL", label: text(packet?.currentMicrosequence?.title) || "Etapa atual" },
          { id: "FOCO", label: scopeLabel }
        ],
        edges: [
          { from: "ATUAL", to: "FOCO", label: "foco local" }
        ]
      }
    };
  }
  if (resourceType === "code") {
    return {
      key: `${keyPrefix}-${index + 1}`,
      title,
      resourceType,
      content: {
        intro: `Leia o esquema mínimo e diga o papel de cada linha.`,
        code: `etapa_atual = "${text(packet?.currentMicrosequence?.title) || "etapa"}"\nfoco_local = "${scopeLabel}"`,
        language: "text"
      }
    };
  }
  return {
    key: `${keyPrefix}-${index + 1}`,
    title,
    resourceType: "say",
    content: roleText
  };
}

function buildDeterministicBottomUpPayload(packet = {}, cardPlan = [], interactionMode = "normal_generation") {
  const currentTitle = text(packet?.currentMicrosequence?.title) || "Microssequência";
  const normalizedPlan = Array.isArray(cardPlan) && cardPlan.length
    ? cardPlan
    : [
        { position: 1, role: "microtheory", resourceType: "say", purpose: "explicar a ideia central" },
        { position: 2, role: "active_practice", resourceType: "block_gap_fill", purpose: "pedir uma ação observável" },
        { position: 3, role: "bridge_or_consolidation", resourceType: "say", purpose: "reconectar à trilha" }
      ];
  return {
    summary: `Versão determinística preparada para ${currentTitle} com cards separados por função didática.`,
    cards: normalizedPlan.map((step, index) => buildFallbackStructuredCard(step, packet, interactionMode, index))
  };
}

function normalizeCardKeyPrefix(prefix = "") {
  return text(prefix) || "card";
}

function cloneLegacyCards(cards = []) {
  return (Array.isArray(cards) ? cards : []).map((card) => clone(card));
}

function legacyCardText(card = {}) {
  return [
    text(card?.title),
    text(card?.say),
    text(card?.code),
    Array.isArray(card?.table?.rows) ? card.table.rows.flat().map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" ") : "",
    Array.isArray(card?.table?.columns) ? card.table.columns.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" ") : ""
  ].filter(Boolean).join(" ");
}

function legacyCardSignature(card = {}) {
  return normalizeToken([
    text(card?.say),
    text(card?.code),
    Array.isArray(card?.table?.rows) ? card.table.rows.flat().map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" ") : "",
    Array.isArray(card?.table?.columns) ? card.table.columns.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" ") : ""
  ].filter(Boolean).join(" ")).replace(/\s+/g, " ");
}

function isWeakFallbackLegacyCard(card = {}) {
  const key = text(card?.key);
  const source = normalizeToken(legacyCardText(card));
  return /^fallback-card-\d+$/u.test(key)
    || /\b(outro elemento|um detalhe lateral|nesta etapa,\s*explicar que|pedir que o estudante|compare os elementos minimos)\b/u.test(source);
}

function dedupeLegacyCardsByContent(cards = []) {
  const seen = new Set();
  const result = [];
  cloneLegacyCards(cards).forEach((card) => {
    const signature = legacyCardSignature(card);
    if (signature && seen.has(signature)) {
      return;
    }
    if (signature) {
      seen.add(signature);
    }
    result.push(card);
  });
  return result;
}

function resequenceLegacyCards(cards = [], prefix = "card") {
  const used = new Set();
  const normalizedPrefix = normalizeCardKeyPrefix(prefix);
  return cloneLegacyCards(cards).map((card, index) => {
    const baseKey = text(card?.key) || `${normalizedPrefix}-${index + 1}`;
    let key = baseKey;
    let counter = 2;
    while (used.has(key)) {
      key = `${baseKey}-${counter}`;
      counter += 1;
    }
    used.add(key);
    return {
      ...card,
      key
    };
  });
}

function buildMergedLegacyCards(currentCards = [], nextCards = [], interactionMode = "normal_generation", microsequenceKey = "") {
  const legacyNextCards = nextCards.map((card) => toLegacyContractCard(card));
  if (!legacyNextCards.length) {
    return resequenceLegacyCards(currentCards, microsequenceKey || "card");
  }
  if (interactionMode === "add_practice") {
    return resequenceLegacyCards(
      dedupeLegacyCardsByContent([...cloneLegacyCards(currentCards), ...legacyNextCards]),
      microsequenceKey || "card"
    );
  }
  if (interactionMode === "answer_local_doubt") {
    const usefulExistingCards = cloneLegacyCards(currentCards).filter((card) => !isWeakFallbackLegacyCard(card));
    return resequenceLegacyCards(
      dedupeLegacyCardsByContent([...legacyNextCards, ...usefulExistingCards]),
      microsequenceKey || "card"
    );
  }
  return resequenceLegacyCards(legacyNextCards, microsequenceKey || "card");
}

function classifyBottomUpIntervention({ draft = {}, packet = {}, hasCards = false, routeHint = "" } = {}) {
  if (text(routeHint) === "generate_planned_next" || text(draft?.actionIntent) === "next_planned") {
    return {
      legacyMode: "normal_generation",
      canonicalRoute: "generate_planned_next"
    };
  }
  if (text(draft?.interventionTargetMode) === "new_after_current") {
    return {
      legacyMode: "create_support",
      canonicalRoute: "create_support_branch"
    };
  }
  if (text(draft?.operationMode) === "repair") {
    return {
      legacyMode: "repair",
      canonicalRoute: "repair_current"
    };
  }
  if (packet?.studyTrackPolicy?.mode === "clarify_local_doubt") {
    return {
      legacyMode: "answer_local_doubt",
      canonicalRoute: "extend_current"
    };
  }
  if (hasCards) {
    return {
      legacyMode: "add_practice",
      canonicalRoute: "extend_current"
    };
  }
  return {
    legacyMode: "normal_generation",
    canonicalRoute: "extend_current"
  };
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
  const plan = buildDidacticCardPlan(
    {
      currentMicrosequence: {
        ...(packet?.currentMicrosequence || {}),
        ...seed
      },
      preferredContainerLabel: packet?.userFocus?.preferredContainerLabel,
      userRequest: packet?.userRequest
    },
    {
      targetCount: Number(technicalBudget?.suggestedCardsPerCall) || 5,
      interactionMode,
      allowedResourceTypes: Array.isArray(packet?.allowedResources) ? packet.allowedResources : ["say", "table", "code", "graph", "block_gap_fill"]
    }
  );
  const practiceRoles = new Set(["active_practice", "analogous_practice", "cumulative_review", "correction"]);
  const canonicalRoute = text(packet?.canonicalRoute);
  const asksPractice = /\b(pratica|prática|exercicio|exercício|exercicios|exercícios|treino)\b/u.test(text(packet?.userRequest).toLowerCase())
    || text(interactionMode) === "add_practice"
    || text(interactionMode) === "repair"
    || canonicalRoute === "generate_planned_next";
  const practiceCount = plan.filter((item) => practiceRoles.has(text(item?.role))).length;
  const theoryIndexes = plan
    .map((item, index) => ({ role: text(item?.role), index }))
    .filter((item) => item.role === "microtheory" || item.role === "guided_example" || item.role === "example_reading");
  if (asksPractice && practiceCount < 2) {
    const insertAt = Math.max(1, plan.length - 1);
    const extraPractice = {
      position: insertAt + 1,
      role: "analogous_practice",
      label: `analogous_practice_${insertAt + 1}`,
      purpose: "variar a prática no mesmo eixo",
      resourceType: plan.some((item) => text(item?.resourceType) === "block_gap_fill") ? "table" : "block_gap_fill",
      usesDependency: [],
      expectedEvidence: uniqueList(packet?.currentMicrosequence?.expectedEvidence)
    };
    if (plan.length < (Number(technicalBudget?.maxCardsPerCall) || 8)) {
      plan.splice(insertAt, 0, extraPractice);
    } else {
      const replaceAt = Math.max(1, plan.length - 2);
      plan[replaceAt] = extraPractice;
    }
  }
  const normalizedPlan = plan.map((item, index) => ({ ...item, position: index + 1 }));
  const normalizedPracticeCount = normalizedPlan.filter((item) => practiceRoles.has(text(item?.role))).length;
  if (canonicalRoute === "generate_planned_next" && normalizedPracticeCount < 2 && theoryIndexes.length >= 2) {
    const replaceIndex = theoryIndexes[theoryIndexes.length - 1].index;
    normalizedPlan[replaceIndex] = {
      ...normalizedPlan[replaceIndex],
      position: replaceIndex + 1,
      role: "analogous_practice",
      resourceType: normalizedPlan.some((step) => text(step?.resourceType) === "block_gap_fill") ? "table" : "block_gap_fill",
      purpose: "consolidar a etapa planejada com segunda prática guiada",
      expectedEvidence: uniqueList(packet?.currentMicrosequence?.expectedEvidence)
    };
  }
  return normalizedPlan.map((item, index) => ({ ...item, position: index + 1 }));
}

function inferContinuationFromFallbackPlan(fallbackCardPlan = [], interactionMode = "normal_generation") {
  const normalizedMode = text(interactionMode);
  const practiceRoles = (Array.isArray(fallbackCardPlan) ? fallbackCardPlan : []).filter((step) =>
    ["active_practice", "analogous_practice", "cumulative_review", "correction"].includes(text(step?.role))
  );
  if (normalizedMode === "add_practice") {
    return {
      continuationNeeded: true,
      continuationReason: "A prática extra deve continuar de forma incremental para ampliar cobertura sem condensar a microssequência.",
      continuationMode: "same_microsequence",
      continuationPrompt: "Continue a mesma microssequência com nova prática autossuficiente e variação adicional, sem reescrever os cards já úteis."
    };
  }
  if (normalizedMode === "answer_local_doubt") {
    return {
      continuationNeeded: true,
      continuationReason: "A dúvida local foi tratada com fallback; valide se ainda falta um fechamento explícito de retorno à trilha principal.",
      continuationMode: "same_microsequence",
      continuationPrompt: "Continue a mesma microssequência respondendo a dúvida local e fechando com retorno explícito à trilha principal, sem apagar os cards já úteis."
    };
  }
  if (practiceRoles.length >= 2) {
    return {
      continuationNeeded: true,
      continuationReason: "O plano determinístico indica que ainda há prática relevante a distribuir sem condensar os cards.",
      continuationMode: "same_microsequence",
      continuationPrompt: "Continue a mesma microssequência distribuindo a prática restante em novos cards curtos e autossuficientes."
    };
  }
  return {
    continuationNeeded: false,
    continuationReason: "",
    continuationMode: "none",
    continuationPrompt: ""
  };
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

function ensureMinimumPracticeStepsForMode(steps = [], packet = {}, interactionMode = "normal_generation") {
  const normalizedSteps = Array.isArray(steps) ? steps : [];
  const practiceRoles = new Set(["active_practice", "analogous_practice", "cumulative_review", "correction"]);
  const request = text(packet?.userRequest).toLowerCase();
  const canonicalRoute = text(packet?.canonicalRoute);
  const needsExtraPractice = text(interactionMode) === "repair"
    || canonicalRoute === "generate_planned_next"
    || /\b(mais pratica|mais prática|exercicios|exercícios|treino guiado)\b/u.test(request);
  const practiceCount = normalizedSteps.filter((step) => practiceRoles.has(text(step?.role))).length;
  if (!needsExtraPractice || practiceCount >= 2) {
    return normalizedSteps;
  }
  const insertAt = Math.max(1, normalizedSteps.length - 1);
  const nextSteps = [...normalizedSteps];
  nextSteps.splice(insertAt, 0, {
    position: insertAt + 1,
    role: "analogous_practice",
    resourceType: nextSteps.some((step) => text(step?.resourceType) === "block_gap_fill") ? "table" : "block_gap_fill",
    purpose: "consolidar com segunda prática guiada",
    inCardContext: [],
    usesDependency: [],
    expectedEvidence: uniqueList(packet?.currentMicrosequence?.expectedEvidence)
  });
  return nextSteps.map((step, index) => ({ ...step, position: index + 1 }));
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
  canonicalRoute = "",
  modelId = "",
  promptText = "",
  attachmentNames = [],
  draftPlan = {},
  microsequenceTitle = "",
  returnMicrosequenceTitle = "",
  cardCount = 0,
  createdSupport = false
} = {}) {
  const continuationNeeded = draftPlan?.continuationNeeded === true;
  const continuationMode = text(draftPlan?.continuationMode) || "none";
  const continuationReason = text(draftPlan?.continuationReason);
  if (createdSupport) {
    const supportTitle = microsequenceTitle || "Microssequência de apoio";
    const trackTitle = returnMicrosequenceTitle || "a trilha principal";
    const nextPromptDraft = buildContinuationPrompt({
      packet: {
        currentMicrosequence: {
          title: trackTitle
        }
      },
      interactionMode,
      continuationMode: "same_microsequence",
      continuationReason: `Retome a trilha principal depois do apoio em "${supportTitle}".`
    });
    return {
      status: "completed",
      title: "Microssequência de apoio criada",
      message: `A etapa de apoio foi criada em "${supportTitle}" e já pode ser iterada localmente.`,
      feedbackText: `A etapa de apoio foi criada com ${cardCount} cards. Depois dela, retome a trilha principal.`,
      nextPromptDraft,
      recommendedActionIntent: "continue_current",
      recommendedInterventionTargetMode: "current",
      recommendedOperationMode: "reinforce",
      recommendedInterventionType: "return_to_track",
      continuationNeeded: true,
      continuationMode: "same_microsequence",
      canonicalRoute: canonicalRoute || "create_support_branch",
      modelId,
      promptText,
      attachmentNames
    };
  }

  if (!continuationNeeded || continuationMode === "none") {
    return {
      status: "completed",
      title: "Intervenção concluída",
      message: `"${microsequenceTitle || "Microssequência"}" ficou com ${cardCount} cards no total.`,
      feedbackText: `Intervenção concluída em "${microsequenceTitle || "Microssequência"}".`,
      nextPromptDraft: "",
      recommendedActionIntent: "",
      recommendedInterventionTargetMode: "",
      recommendedOperationMode: "",
      recommendedInterventionType: "",
      continuationNeeded: false,
      continuationMode: "none",
      canonicalRoute: canonicalRoute || "extend_current",
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
    canonicalRoute: canonicalRoute || "extend_current",
    modelId,
    promptText,
    attachmentNames
  };
}

function buildBottomUpCorrectionPrompt(basePrompt = "", issues = [], packet = {}) {
  const normalizedIssues = uniqueList(issues);
  const forbiddenTerms = Array.isArray(packet?.module?.exclude) ? uniqueList(packet.module.exclude) : [];
  if (!normalizedIssues.length) {
    return basePrompt;
  }
  return [
    basePrompt,
    "",
    "CORRECOES OBRIGATORIAS:",
    ...normalizedIssues.map((issue) => `- ${issue}`),
    "- Se aparecer a orientação para dividir um card, separe teoria, exemplo e prática em cards distintos.",
    forbiddenTerms.length
      ? `- Remova totalmente estes termos excluídos do summary e dos cards, inclusive como negação ou contraste: ${forbiddenTerms.join(", ")}.`
      : "",
    "- Quando usar graph, table ou code, inclua content.intro curto e suficiente para o card fazer sentido sozinho.",
    "- Se um card for do tipo table, ele deve ter columns e pelo menos 1 linha com pelo menos 1 célula (rows não pode ser vazio).",
    "- Se o modelo estiver em dúvida sobre o formato, prefira say ou block_gap_fill em vez de table.",
    "- Reescreva a resposta inteira em JSON valido, sem comentários."
  ].filter(Boolean).join("\n");
}

function isTimeoutLikeError(error) {
  const message = text(error?.message).toLowerCase();
  const name = text(error?.name).toLowerCase();
  return name === "aborterror" || /\btimeout\b|\btimed out\b|\babort/.test(message);
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
    const fallbackContinuation = inferContinuationFromFallbackPlan(fallbackCardPlan, interactionMode);
    return {
      steps: normalizeDraftSteps({}, fallbackCardPlan),
      coverageNotes: ["Draft intermediário indisponível; usando plano didático determinístico."],
      continuationNeeded: fallbackContinuation.continuationNeeded,
      continuationReason: fallbackContinuation.continuationReason,
      continuationMode: fallbackContinuation.continuationMode,
      continuationPrompt: fallbackContinuation.continuationPrompt
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
    try {
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
        prompt = buildBottomUpCorrectionPrompt(basePrompt, validation.errors.map((error) => error.message), packet);
        continue;
      }
      return validation.value;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (isTimeoutLikeError(lastError)) {
        break;
      }
      prompt = buildBottomUpCorrectionPrompt(basePrompt, [lastError.message], packet);
    }
  }
  const deterministicValidation = validateMicrosequenceCards(
    buildDeterministicBottomUpPayload(packet, cardPlan, text(packet?.interactionMode) || mode),
    density,
    {
      packet,
      cardPlan,
      modelCapabilities
    }
  );
  if (!deterministicValidation.ok) {
    throw new Error(deterministicValidation.errors.map((error) => error.message).join("; ") || lastError?.message || "Falha ao validar a microssequência gerada.");
  }
  return deterministicValidation.value;
}

async function generateValidatedSupportPayload({
  runtime,
  modelId,
  packet,
  request = "",
  density = "standard",
  modelCapabilities = {}
} = {}) {
  const schema = buildSupportMicrosequenceSchema(density, { modelCapabilities });
  const basePrompt = buildSupportPrompt(packet, request);
  let prompt = basePrompt;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const payload = await runtime.provider.generateStructured({
        ...runtime.providerOptions,
        modelId,
        mode: "create-support",
        system: buildBottomUpCompileSystemPrompt(),
        prompt,
        schema,
        temperature: 0.2
      });
      return validateSupportPayload(payload, { packet, density, modelCapabilities });
    } catch (error) {
      lastError = error;
      if (isTimeoutLikeError(lastError)) {
        break;
      }
      prompt = buildBottomUpCorrectionPrompt(basePrompt, [
        error instanceof Error ? error.message : String(error),
        "Devolva obrigatoriamente title, goal, supportReason, didacticKind, practiceMode, representationNeed, dependencyPolicy, expectedEvidence, summary e cards.",
        "O apoio deve ter pelo menos 4 cards e terminar com retorno explícito à trilha principal."
      ], packet);
    }
  }
  if (lastError) {
    return validateSupportPayload(buildDeterministicSupportPayload(packet, request), { packet, density, modelCapabilities });
  }
  return validateSupportPayload(buildDeterministicSupportPayload(packet, request), { packet, density, modelCapabilities });
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
    cards: buildMergedLegacyCards(
      current?.cards,
      payload.cards,
      text(payload?.interactionMode),
      text(current?.key)
    )
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
  const previous = currentIndex > 0 ? lesson.microsequences[currentIndex - 1] : null;
  const supportDependsOn = uniqueList(
    (Array.isArray(current?.dependsOn) && current.dependsOn.length)
      ? current.dependsOn
      : [text(previous?.key)].filter(Boolean)
  );
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
    dependsOn: supportDependsOn,
    parentMicrosequenceKey: text(current?.key),
    returnToMicrosequenceKey: text(current?.key),
    supportReason: payload.supportReason,
    branchPolicy: "must_return_to_planned_track",
    didacticPurpose: payload.goal,
    didacticKind: payload.didacticKind,
    practiceMode: payload.practiceMode,
    representationNeed: payload.representationNeed,
    dependencyPolicy: payload.dependencyPolicy,
    coverageRole: "repair_gap",
    expectedEvidence: uniqueList(payload.expectedEvidence),
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
  const { targetSelection, routeHint, blockedBy, blockedTargetKey } = resolveBottomUpTargetSelection(projectDocument, selection, draft);
  const ingestedAttachments =
    typeof ingestAttachments === "function"
      ? await ingestAttachments(Array.isArray(draft.attachments) ? draft.attachments : [])
      : { attachments: [], extractedCount: 0, warnings: [] };
  if (!text(draft.promptText) && !ingestedAttachments.extractedCount && text(draft?.actionIntent) !== "next_planned") {
    throw new Error("Informe um pedido ou anexo com texto utilizável antes de editar a microssequência.");
  }
  if (blockedBy) {
    const currentMicrosequence = findMicrosequence(projectDocument, targetSelection);
    return {
      projectDocument,
      target: { ...targetSelection },
      route: {
        legacyMode: "normal_generation",
        canonicalRoute: "generate_planned_next"
      },
      blockedBy,
      blockedTargetKey,
      interventionFeedback: {
        status: "blocked",
        title: "Próxima microssequência bloqueada",
        message: `A próxima microssequência planejada ainda depende de "${blockedBy}".`,
        feedbackText: `Antes de avançar, conclua "${text(currentMicrosequence?.title) || blockedBy}" na trilha principal.`,
        nextPromptDraft: `Continue "${text(currentMicrosequence?.title) || "a microssequência atual"}" até deixá-la pronta; depois preencha a próxima microssequência planejada.`,
        recommendedActionIntent: "continue_current",
        recommendedInterventionTargetMode: "current",
        recommendedOperationMode: "reinforce",
        recommendedInterventionType: "return_to_track",
        continuationNeeded: true,
        continuationMode: "same_microsequence",
        canonicalRoute: "generate_planned_next",
        modelId: runtime.modelId,
        promptText: text(draft.promptText),
        attachmentNames: (Array.isArray(ingestedAttachments.attachments) ? ingestedAttachments.attachments : []).map((item) => text(item?.name)).filter(Boolean)
      }
    };
  }
  const currentMicrosequence = findMicrosequence(projectDocument, targetSelection);
  const hasCards = Array.isArray(currentMicrosequence?.cards) && currentMicrosequence.cards.length > 0;
  const packet = buildBottomUpContextPacket(projectDocument, targetSelection, {
    userRequest: text(draft.promptText) || (text(draft?.actionIntent) === "next_planned"
      ? "Preencha a próxima microssequência planejada sem abrir assunto novo."
      : ""),
    density,
    dependencyTitles,
    selectedDidacticTypeId,
    preferredContainerLabel,
    ingestedAttachments,
    interactionMode: "normal_generation"
  });
  const route = classifyBottomUpIntervention({
    draft,
    packet,
    hasCards
    ,
    routeHint
  });
  packet.interactionMode = route.legacyMode;
  packet.canonicalRoute = route.canonicalRoute;
  const interactionMode = route.legacyMode;
  const promptText = text(draft.promptText) || (route.canonicalRoute === "generate_planned_next"
    ? `Preencha a próxima microssequência planejada "${text(currentMicrosequence?.title)}" seguindo a trilha top-down sem abrir assunto novo.`
    : "");
  const rebuiltPacket = buildBottomUpContextPacket(projectDocument, targetSelection, {
    userRequest: promptText,
    density,
    dependencyTitles,
    selectedDidacticTypeId,
    preferredContainerLabel,
    ingestedAttachments,
    interactionMode
  });
  rebuiltPacket.canonicalRoute = route.canonicalRoute;
  const technicalBudget = buildTechnicalCardBudget(density, modelCapabilities);

  if (interactionMode === "create_support") {
    const validated = await generateValidatedSupportPayload({
      runtime,
      modelId: runtime.modelId,
      packet: rebuiltPacket,
      request: promptText,
      density,
      modelCapabilities
    });
    const applied = applySupportMicrosequence(projectDocument, selection, validated);
    const targetMicrosequence = findMicrosequence(applied.projectDocument, applied.target);
    return {
      ...applied,
      route,
      interventionFeedback: buildInterventionFeedback({
        interactionMode,
        canonicalRoute: route.canonicalRoute,
        modelId: runtime.modelId,
        promptText,
        attachmentNames: (Array.isArray(ingestedAttachments.attachments) ? ingestedAttachments.attachments : []).map((item) => text(item?.name)).filter(Boolean),
        microsequenceTitle: text(targetMicrosequence?.title || validated.title),
        returnMicrosequenceTitle: text(currentMicrosequence?.title),
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
      ? buildImprovePrompt(rebuiltPacket, promptText)
      : interactionMode === "add_practice"
        ? buildPracticePrompt(rebuiltPacket, promptText)
        : interactionMode === "answer_local_doubt"
          ? buildImprovePrompt(rebuiltPacket, promptText || "Responder à dúvida local e retornar à trilha.")
          : "";
  const fallbackCardPlan = buildFallbackCardPlan(rebuiltPacket, interactionMode, technicalBudget);
  const draftPlan = await generateDidacticDraft({
    runtime,
    modelId: runtime.modelId,
    packet: rebuiltPacket,
    interactionMode,
    fallbackCardPlan,
    temperature: hasCards ? 0.3 : 0.2
  });
  const plannedSteps = ensureMinimumPracticeStepsForMode(draftPlan.steps, rebuiltPacket, interactionMode);
  const cardPlan = plannedSteps.map((step) => ({
    position: step.position,
    role: step.role,
    resourceType: step.resourceType,
    purpose: step.purpose,
    expectedEvidence: step.expectedEvidence
  }));
  const prompt = buildBottomUpCompileUserPrompt(
    rebuiltPacket,
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
    packet: rebuiltPacket,
    density,
    modelCapabilities,
    cardPlan,
    temperature: hasCards ? 0.3 : 0.2
  });
  const applied = applyCardsToCurrentMicrosequence(projectDocument, targetSelection, {
    ...validated,
    interactionMode
  });
  const appliedMicrosequence = findMicrosequence(applied.projectDocument, applied.target);
  return {
    ...applied,
    route,
    interventionFeedback: buildInterventionFeedback({
      interactionMode,
      canonicalRoute: route.canonicalRoute,
      modelId: runtime.modelId,
      promptText,
      attachmentNames: (Array.isArray(ingestedAttachments.attachments) ? ingestedAttachments.attachments : []).map((item) => text(item?.name)).filter(Boolean),
      draftPlan,
      microsequenceTitle: text(appliedMicrosequence?.title || currentMicrosequence?.title),
      returnMicrosequenceTitle: text(currentMicrosequence?.title),
      cardCount: Array.isArray(appliedMicrosequence?.cards) ? appliedMicrosequence.cards.length : 0
    })
  };
}
