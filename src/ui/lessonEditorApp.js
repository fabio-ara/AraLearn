import { renderLessonScreen } from "./renderLessonScreen.js";
import { renderGenerationPanelOverlay } from "./renderHomeScreen.js";
import { renderCardCommentOverlay } from "./renderCardCommentOverlay.js";
import { renderCardVersionOverlay } from "./renderCardVersionOverlay.js";
import { renderVersionCompareOverlay } from "./renderVersionCompareOverlay.js";
import { renderEntityEditorOverlay } from "./renderEntityEditorOverlay.js";
import { renderActionMenuOverlay } from "./renderActionMenuOverlay.js";
import { renderAssistConfigOverlay } from "./renderAssistConfigOverlay.js";
import { renderCodexCliSetupOverlay } from "./renderCodexCliSetupOverlay.js";
import { renderExternalImportOverlay } from "./renderExternalImportOverlay.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { captureRenderState, restoreRenderState } from "./renderState.js";
import {
  buildCodexCliHealthCommand,
  buildCodexCliSetupScript,
  detectCodexCliSetupPlatform,
  getCodexCliSetupPresentation
} from "./codexCliSetup.js";
import { handleExternalJsonImportText } from "./externalJsonImport.js";
import {
  buildSourceGuideEditorFields,
  resolveSourceGuidePayload,
  SOURCE_GUIDE_LEVELS
} from "../sourceGuides/sourceGuideStructured.js";
import {
  buildLessonGuidanceEditorFields,
  buildLessonGuidanceFromPreset,
  normalizeLessonGuidance
} from "../generation/guidance/lessonGuidance.js";
import { resolveLessonMicrosequenceOrder } from "../generation/domain/resolveLessonMicrosequenceOrder.js";
import {
  createMicrosequenceVersionRecord,
  insertMicrosequenceVersionAfterActive,
  removeMicrosequenceVersion,
  setActiveMicrosequenceVersion,
  replaceActiveMicrosequenceVersion
} from "./microsequenceVersionState.js";
import {
  applyStructureVersionSnapshot,
  buildStructureVersionKey,
  createStructureSnapshot,
  seedStructureVersionMapFromProject,
  recordStructureVersionTransition,
  syncStructureVersionSnapshot
} from "./structureVersioning.js";
import { removeStructureVersion, setActiveStructureVersion } from "./structureVersionState.js";
import { buildMicrosequenceVersionComparisonForVersion } from "./microsequenceVersionComparison.js";
import { buildStructureVersionComparisonForVersion } from "./structureVersionComparison.js";
import {
  resolveMicrosequenceAssistOpenState,
  resolveWorkbenchPaneAfterCardSelection
} from "./microsequenceWorkbenchState.js";
import {
  buildScopedVersionLineageLabel,
  buildVersionLineageLabel,
  getScopedVersionDisplayId,
  getVersionDisplayId
} from "./versionLineage.js";
import { getRuntimePopupButtonEntry } from "../render/renderCardRuntime.js";
import { resolveCardRuntime } from "../core/cardRuntime.js";
import {
  cloneDirectoryTreeNodes,
  directoryTreeNodeCanHaveChildren,
  DIRECTORY_TREE_BASE_NODE_ID,
  findDirectoryTreeNodeEntry,
  getDirectoryTreePathLabels,
  normalizeDirectoryTreeNodeNameByType,
  normalizeDirectoryTreeNodeType,
  normalizeDirectoryTreePractice,
  resolveDirectoryTreePracticeExpectedName,
  resolveDirectoryTreePracticeExpectedType,
  resolveDirectoryTreePracticeNameTemplate
} from "../core/directoryTree.js";
import { getExerciseOptionStableId } from "../core/exerciseOptions.js";
import {
  createFlowchartExerciseState,
  fillFlowchartExerciseAnswer,
  flowchartLinkUsesLabelChoiceBlank,
  flowchartNodeUsesTextChoiceBlank,
  flowchartProjectionHasPractice,
  resetFlowchartExerciseState,
  validateFlowchartExerciseState
} from "../flowchart/flowchartExercise.js";
import { computeFlowchartAutoFitScale } from "../flowchart/flowchartViewport.js";
import {
  buildCardPathKey,
  collectAssistDependencies,
  collectLessonTopicRefs,
  collectLessonCards,
  findCard,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  getDefaultDependencyKeys,
  getFirstPath
} from "./lessonEditorPaths.js";
import {
  readAssistConfigStorage,
  readCommentStorage,
  readHistoryStorage,
  readMicrosequenceVersionStorage,
  readStructureVersionStorage,
  writeAssistConfigStorage,
  writeCommentStorage,
  writeHistoryStorage,
  writeMicrosequenceVersionStorage,
  writeStructureVersionStorage
} from "./lessonEditorStorage.js";
import {
  CODEX_LOCAL_MODEL_ID,
  DEFAULT_CODEX_LOCAL_ENDPOINT,
  checkCodexLocalHealth,
  isCodexLocalModel
} from "../assist/codexLocalAssist.js";
import { runAssist } from "../assist/runAssist.js";
import { runCourseForge } from "../generation/courseForge/courseForgeRunner.js";
import { createProviderRegistry, resolveProviderFromModelId } from "../generation/providers/providerRegistry.js";
import { createCodexCliProvider } from "../generation/providers/codexCliProvider.js";
import { createGeminiProvider } from "../generation/providers/geminiProvider.js";
import { listMicrosequenceTypes } from "../generation/types/microsequenceTypes.js";
import { buildLessonDomainCoverageReport } from "../generation/domain/lessonDomainModel.js";
import { validateDidacticDepth } from "../generation/validation/validateDidacticDepth.js";
import { getLessonProgressCursor, removeLessonProgressEntries, writeLessonProgressEntry } from "../storage/progressStore.js";
import { detectJsonExchangeFormat } from "../storage/jsonExchange.js";
import { createStarterContractCard, getContractCardKind, listContractAnswerValues } from "../contract/contractCard.js";
import { isRunnableMicrosequence, resolveMicrosequenceRuntimeIncluded } from "../model/microsequenceStatus.js";
import { ingestCourseForgeAttachments } from "./courseForgeAttachmentIngestion.js";
import {
  buildCourseForgePhaseModelOverrides,
  resolveCourseForgeGenerationScope,
  resolveCourseForgeNavigationTarget,
  summarizeCourseForgeTopDownResult
} from "./courseForgeGeneration.js";
import {
  createCourse as createCourseDocument,
  createLesson as createLessonDocument,
  createModule as createModuleDocument,
  deleteCourse as deleteCourseDocument,
  deleteLesson as deleteLessonDocument,
  deleteModule as deleteModuleDocument,
  exportCourseDocument as exportCourseDocumentFromDocument,
  exportLessonDocument as exportLessonDocumentFromDocument,
  exportModuleDocument as exportModuleDocumentFromDocument,
  importCourses as importCoursesDocument,
  importLessons as importLessonsDocument,
  importModules as importModulesDocument,
  moveCourse as moveCourseDocument,
  moveLesson as moveLessonDocument,
  moveModule as moveModuleDocument,
  updateCourse as updateCourseDocument,
  updateLesson as updateLessonDocument,
  updateModule as updateModuleDocument
} from "../editor/contractEditor.js";

const MAX_ASSIST_DEPENDENCIES = 5;
const MAX_ASSIST_ATTACHMENTS = 6;
const MAX_CARD_SNAPSHOTS = 6;
const ASSIST_MODEL_OPTIONS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash · até 2026-06-01" },
  { value: CODEX_LOCAL_MODEL_ID, label: "Codex CLI local · avançado" }
];
const ASSIST_USER_MODES = {
  EDIT_MICROSEQUENCE: "edit-microsequence",
  REPOSITION: "reposition-in-course"
};
const ASSIST_CARD_CONTAINER_OPTIONS = [
  { value: "", label: "Automático", icon: renderUiIcon("sparkles", "action-menu-svg-icon") },
  { value: "say", label: "Parágrafo", icon: renderUiIcon("prompt", "action-menu-svg-icon") },
  { value: "ask", label: "Pergunta", icon: renderUiIcon("intent", "action-menu-svg-icon") },
  { value: "code", label: "Código", icon: renderUiIcon("title", "action-menu-svg-icon") },
  { value: "table", label: "Tabela", icon: renderUiIcon("module", "action-menu-svg-icon") },
  { value: "tree", label: "Árvore de diretórios", icon: renderUiIcon("folder", "action-menu-svg-icon") },
  { value: "flow", label: "Fluxograma", icon: renderUiIcon("microsequence", "action-menu-svg-icon") },
  { value: "plane", label: "Plano cartesiano", icon: renderUiIcon("card", "action-menu-svg-icon") },
  { value: "matrix", label: "Matriz", icon: renderUiIcon("card", "action-menu-svg-icon") }
];
const ASSIST_DIDACTIC_TYPE_OPTIONS = [
  { value: "", label: "Automático" },
  ...listMicrosequenceTypes()
    .filter((item) => item.id !== "assisted")
    .map((item) => ({ value: item.id, label: item.label }))
];
const COURSES_VIEWS = new Set(["courses", "course", "module", "lesson", "microsequence", "microsequence-assist"]);
const GENERATION_PANEL_ACTIONS = new Set([
  "open-generation-panel-global",
  "open-generation-panel-course",
  "open-generation-panel-module",
  "open-generation-panel-lesson"
]);
const STRUCTURE_VERSIONING_ACTIVE = false;
const GENERATED_PENDING_OPERATION = "generated-pending";
const GENERATED_ACCEPTED_OPERATION = "generated";

function fail(message) {
  throw new Error(message);
}

function isGeneratedPendingOperation(value) {
  return String(value || "").trim() === GENERATED_PENDING_OPERATION;
}

export function resolveGenerationPanelScopeFromAction({ action, dataset = {}, selection = {} } = {}) {
  if (!GENERATION_PANEL_ACTIONS.has(action)) {
    return null;
  }

  if (action === "open-generation-panel-global") {
    return {};
  }

  const courseKey = dataset.courseKey || selection.courseKey || "";
  const moduleKey = dataset.moduleKey || selection.moduleKey || "";
  const lessonKey = dataset.lessonKey || selection.lessonKey || "";

  if (action === "open-generation-panel-course") {
    return courseKey ? { courseKey } : null;
  }

  if (action === "open-generation-panel-module") {
    return courseKey && moduleKey ? { courseKey, moduleKey } : null;
  }

  if (action === "open-generation-panel-lesson") {
    return courseKey && moduleKey && lessonKey ? { courseKey, moduleKey, lessonKey } : null;
  }

  return null;
}

export function resolveGenerationAssistMode({
  lessonFixed = false,
  hasResolvedLesson = false,
  repositionMicrosequences = false
} = {}) {
  if (lessonFixed === true && hasResolvedLesson === true) {
    return repositionMicrosequences === true
      ? "generate-and-reposition-lesson-microsequences"
      : "generate-lesson-microsequences";
  }
  return "generate-top-down-structure";
}

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readCardText(card) {
  if (!card || typeof card !== "object") {
    return "";
  }

  if (typeof card.say === "string") {
    return card.say;
  }
  if (typeof card.ask === "string") {
    return card.ask;
  }
  if (typeof card.code === "string") {
    return card.code;
  }
  if (Array.isArray(card?.table?.rows) && card.table.rows.length) {
    return card.table.rows
      .map((row) => (Array.isArray(row) ? row.join(" | ") : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(card?.table?.columns) && card.table.columns.length) {
    return card.table.columns.join(" | ");
  }
  if (card.plane && typeof card.plane === "object") {
    if (Array.isArray(card.plane.vector)) {
      return `v = (${card.plane.vector.join(", ")})`;
    }
    if (Array.isArray(card.plane.vectors)) {
      const labels = ["v", "w", "u", "t"];
      return card.plane.vectors.map((vector, index) => `${labels[index] || `v${index + 1}`} = (${vector.join(", ")})`).join("\n");
    }
    if (Array.isArray(card.plane.sum) && card.plane.sum.length === 2) {
      const [first, second] = card.plane.sum;
      return `v + w = (${Number(first[0]) + Number(second[0])}, ${Number(first[1]) + Number(second[1])})`;
    }
    if (card.plane.scale && typeof card.plane.scale === "object") {
      return `${card.plane.scale.k}v`;
    }
    if (Array.isArray(card.plane.distance) && card.plane.distance.length === 2) {
      return `A(${card.plane.distance[0].join(", ")}) B(${card.plane.distance[1].join(", ")})`;
    }
  }
  if (card.matrix && typeof card.matrix === "object") {
    return (Array.isArray(card.matrix.values) ? card.matrix.values : [])
      .map((row) => (Array.isArray(row) ? row.join(" ") : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (card.tree && typeof card.tree === "object") {
    return card.tree.current || card.tree.base || "tree";
  }
  if (Array.isArray(card.flow) && card.flow.length) {
    return card.flow
      .map((step) => {
        const [kind] = Object.keys(step || {});
        return kind ? `${kind}: ${step[kind]}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseTagsText(value) {
  return String(value || "")
    .split(/,|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTagsText(tags) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function summarizeStructuredLessons(lessons = []) {
  return Array.isArray(lessons)
    ? lessons.map((lesson) => ({
        title: String(lesson?.title || "").trim(),
        description: String(lesson?.description || "").trim(),
        sourceGuide: String(lesson?.sourceGuide || "").trim()
      }))
      .filter((lesson) => lesson.title || lesson.description || lesson.sourceGuide)
    : [];
}

function summarizeStructuredModules(modules = []) {
  return Array.isArray(modules)
    ? modules.map((moduleValue) => ({
        title: String(moduleValue?.title || "").trim(),
        description: String(moduleValue?.description || "").trim(),
        sourceGuide: String(moduleValue?.sourceGuide || "").trim(),
        lessons: summarizeStructuredLessons(moduleValue?.lessons || [])
      }))
      .filter((moduleValue) => moduleValue.title || moduleValue.description || moduleValue.sourceGuide || moduleValue.lessons.length)
    : [];
}

function slugifyDownloadName(value, fallback = "curso") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || fallback;
}

function normalizeAssistAttachmentName(value, fallback = "documento") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function describeStructureVersionOperation(operationType) {
  const normalized = String(operationType || "").trim();
  if (normalized === "manual-restore") {
    return {
      kind: "manual",
      label: "Variação",
      shortLabel: "Variação",
      shortIcon: "⧉",
      detailLabel: "Criar variação",
      detailIcon: "⧉",
      detailTone: "manual-detail"
    };
  }
  if (normalized === "seed") {
    return {
      kind: "automatic",
      label: "Inicial",
      shortLabel: "Inicial",
      shortIcon: "◉",
      detailLabel: "Versão inicial",
      detailIcon: "◉",
      detailTone: "automatic-detail"
    };
  }
  if (normalized === "update") {
    return {
      kind: "automatic",
      label: "Editar",
      shortLabel: "Editar",
      shortIcon: "✎",
      detailLabel: "Edição estrutural",
      detailIcon: "✎",
      detailTone: "automatic-detail"
    };
  }
  if (normalized === "create-child") {
    return {
      kind: "automatic",
      label: "Filho+",
      shortLabel: "Filho+",
      shortIcon: "+",
      detailLabel: "Inclusão de filho",
      detailIcon: "+",
      detailTone: "automatic-detail"
    };
  }
  if (normalized === "remove-child") {
    return {
      kind: "automatic",
      label: "Filho-",
      shortLabel: "Filho-",
      shortIcon: "−",
      detailLabel: "Remoção de filho",
      detailIcon: "−",
      detailTone: "automatic-detail"
    };
  }
  if (normalized === "reorder-children") {
    return {
      kind: "automatic",
      label: "Ordem",
      shortLabel: "Ordem",
      shortIcon: "↕",
      detailLabel: "Reordenação",
      detailIcon: "↕",
      detailTone: "automatic-detail"
    };
  }
  if (normalized === "generated") {
    return {
      kind: "automatic",
      label: "Gerada",
      shortLabel: "Gerada",
      shortIcon: "✦",
      detailLabel: "Gerada",
      detailIcon: "✦",
      detailTone: "automatic-detail"
    };
  }
  if (normalized === "migration") {
    return {
      kind: "automatic",
      label: "Migrada",
      shortLabel: "Migrada",
      shortIcon: "⇄",
      detailLabel: "Migração local",
      detailIcon: "⇄",
      detailTone: "automatic-detail"
    };
  }
  if (normalized === "snapshot") {
    return {
      kind: "automatic",
      label: "Editar",
      shortLabel: "Editar",
      shortIcon: "✎",
      detailLabel: "Snapshot local",
      detailIcon: "◌",
      detailTone: "automatic-detail"
    };
  }

  return {
    kind: "automatic",
    label: normalized || "Editar",
    shortLabel: normalized || "Editar",
    shortIcon: "•",
    detailLabel: "Local",
    detailIcon: "•",
    detailTone: "default"
  };
}

function getStructureVersionPrefix(level) {
  if (level === "project") return "C";
  if (level === "course") return "M";
  if (level === "module") return "L";
  if (level === "lesson") return "V";
  return "V";
}

function getStableStructureEntryDisplayId(entry, prefix = getStructureVersionPrefix(entry?.level)) {
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  if (!versions.length) {
    return `${String(prefix || "V").trim() || "V"}?`;
  }

  const firstVersion =
    versions
      .filter(Boolean)
      .slice()
      .sort((left, right) => {
        const leftNumber = Number.isInteger(left?.publicNumber) ? left.publicNumber : Number.MAX_SAFE_INTEGER;
        const rightNumber = Number.isInteger(right?.publicNumber) ? right.publicNumber : Number.MAX_SAFE_INTEGER;
        if (leftNumber !== rightNumber) {
          return leftNumber - rightNumber;
        }

        const leftVersionNumber = Number.isInteger(left?.versionNumber) ? left.versionNumber : Number.MAX_SAFE_INTEGER;
        const rightVersionNumber = Number.isInteger(right?.versionNumber) ? right.versionNumber : Number.MAX_SAFE_INTEGER;
        return leftVersionNumber - rightVersionNumber;
      })[0] || versions[0];

  return getScopedVersionDisplayId(firstVersion, prefix, 0);
}

function buildStructureTabsForEntry(entry, { prefix = getStructureVersionPrefix(entry?.level), action = "select-structure-version" } = {}) {
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  return versions.map((version, index) => ({
    versionId: version.id,
    action,
    displayId: getScopedVersionDisplayId(version, prefix, index),
    lineage: buildScopedVersionLineageLabel(version, versions, prefix, index),
    updatedAt: version.updatedAt || "",
    createdAt: version.createdAt || ""
  }));
}

function buildStructureContextTab(entry) {
  if (!entry?.activeVersionId) {
    return null;
  }

  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  const activeIndex = versions.findIndex((item) => item.id === entry.activeVersionId);
  const activeVersion = activeIndex >= 0 ? versions[activeIndex] : versions.at(-1);
  if (!activeVersion) {
    return null;
  }

  const prefix = getStructureVersionPrefix(entry.level);
  const label =
    entry.level === "project"
      ? buildScopedVersionLineageLabel(activeVersion, versions, prefix, Math.max(activeIndex, 0))
      : getStableStructureEntryDisplayId(entry, prefix);
  return {
    level: entry.level,
    versionId: activeVersion.id,
    label
  };
}

function buildChildStructureTabs(versionMap, items = [], resolveReference, prefix, action, activeKey = "") {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const reference = resolveReference(item);
      if (!reference) {
        return null;
      }
      const entry = versionMap?.[buildStructureVersionKey(reference)];
      const versions = Array.isArray(entry?.versions) ? entry.versions : [];
      const activeIndex = versions.findIndex((version) => version.id === entry?.activeVersionId);
      const activeVersion = activeIndex >= 0 ? versions[activeIndex] : versions.at(-1);
      if (!activeVersion) {
        return null;
      }

      return {
        action,
        isActive: item?.key === activeKey,
        courseKey: reference.courseKey || "",
        moduleKey: reference.moduleKey || "",
        lessonKey: reference.lessonKey || "",
        displayId: getStableStructureEntryDisplayId(entry, prefix),
        lineage: getStableStructureEntryDisplayId(entry, prefix),
        updatedAt: activeVersion.updatedAt || "",
        createdAt: activeVersion.createdAt || ""
      };
    })
    .filter(Boolean);
}

function formatOverlayTimestamp(value) {
  const iso = String(value || "").trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  const pad = (item) => String(item).padStart(2, "0");
  return (
    [pad(parsed.getDate()), pad(parsed.getMonth() + 1), parsed.getFullYear()].join("/") +
    " " +
    [pad(parsed.getHours()), pad(parsed.getMinutes()), pad(parsed.getSeconds())].join(":")
  );
}

function buildAssistAttachmentSignature(file) {
  if (!file || typeof file !== "object") {
    return "";
  }

  return [
    normalizeAssistAttachmentName(file.name),
    Number(file.size || 0),
    Number(file.lastModified || 0),
    String(file.type || "").trim()
  ].join("::");
}

function normalizeAssistAttachmentList(files = []) {
  const nextItems = [];
  const seen = new Set();

  for (const file of files || []) {
    if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
      continue;
    }

    const signature = buildAssistAttachmentSignature(file);
    if (!signature || seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    nextItems.push(file);
    if (nextItems.length >= MAX_ASSIST_ATTACHMENTS) {
      break;
    }
  }

  return nextItems;
}

function buildAssistHierarchyContext({ course, moduleValue, lesson, microsequence }) {
  return {
    courseKey: course?.key || "",
    courseTitle: course?.title || course?.key || "",
    courseDescription: course?.description || "",
    courseSourceGuide: course?.sourceGuide || "",
    courseSourceGuideStructured: structuredClone(course?.sourceGuideStructured || {}),
    moduleKey: moduleValue?.key || "",
    moduleTitle: moduleValue?.title || moduleValue?.key || "",
    moduleDescription: moduleValue?.description || "",
    moduleSourceGuide: moduleValue?.sourceGuide || "",
    moduleSourceGuideStructured: structuredClone(moduleValue?.sourceGuideStructured || {}),
    lessonKey: lesson?.key || "",
    lessonTitle: lesson?.title || lesson?.key || "",
    lessonDescription: lesson?.description || "",
    lessonSourceGuide: lesson?.sourceGuide || "",
    lessonSourceGuideStructured: structuredClone(lesson?.sourceGuideStructured || {}),
    lessonDomainMap: structuredClone(lesson?.domainMap || {}),
    lessonResourceTags: Array.isArray(lesson?.resourceTags) ? structuredClone(lesson.resourceTags) : [],
    lessonContentTypeTags: Array.isArray(lesson?.contentTypeTags) ? structuredClone(lesson.contentTypeTags) : [],
    lessonLearningActionTags: Array.isArray(lesson?.learningActionTags) ? structuredClone(lesson.learningActionTags) : [],
    lessonSupportLevel: lesson?.supportLevel || "",
    lessonMicrosequences: Array.isArray(lesson?.microsequences) ? structuredClone(lesson.microsequences) : [],
    key: microsequence?.key || "",
    title: microsequence?.title || "",
    description: microsequence?.description || "",
    tags: Array.isArray(microsequence?.tags) ? microsequence.tags : [],
    domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs : [],
    practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs) ? microsequence.practiceVariantRefs : [],
    didacticPurpose: microsequence?.didacticPurpose || "",
    coverageRole: microsequence?.coverageRole || "",
    cards: Array.isArray(microsequence?.cards) ? microsequence.cards : []
  };
}

function buildCardUpdateFromText(card, title, text) {
  const base = {
    title: String(title || "").trim() || card?.title || "Novo card"
  };
  const nextText = String(text || "").trim();
  const kind = getContractCardKind(card);

  if (kind === "ask") {
    return {
      ...base,
      ask: nextText || card.ask || "Qual alternativa é a mais adequada?",
      answer: listContractAnswerValues(card).length ? card.answer : "Alternativa correta",
      wrong: Array.isArray(card.wrong) && card.wrong.length ? card.wrong : ["Distrator 1", "Distrator 2"]
    };
  }

  if (kind === "code") {
    return {
      ...base,
      language: card.language || "text",
      code: String(text || "") || card.code || ""
    };
  }

  if (kind === "table") {
    return {
      ...base,
      ...(nextText ? { say: nextText } : card.say ? { say: card.say } : {}),
      table: card.table || {
        columns: ["Coluna A", "Coluna B"],
        rows: [["Valor 1", "Valor 2"]]
      }
    };
  }

  if (kind === "tree") {
    return {
      ...base,
      ...(nextText ? { say: nextText } : card.say ? { say: card.say } : {}),
      tree: card.tree || {
        base: "/",
        items: {}
      }
    };
  }

  if (kind === "flow") {
    return {
      ...base,
      ...(nextText ? { say: nextText } : card.say ? { say: card.say } : {}),
      flow: Array.isArray(card.flow) && card.flow.length ? card.flow : [{ start: "Início" }, { end: "Fim" }]
    };
  }

  if (kind === "plane") {
    return {
      ...base,
      ...(nextText ? { say: nextText } : card.say ? { say: card.say } : {}),
      plane: card.plane || createStarterContractCard("plane").plane
    };
  }

  if (kind === "matrix") {
    return {
      ...base,
      ...(nextText ? { say: nextText } : card.say ? { say: card.say } : {}),
      matrix: card.matrix || createStarterContractCard("matrix").matrix
    };
  }

  return {
    ...base,
    say: nextText || card?.say || "Descreva a ideia central desta microssequência.",
    ...(Array.isArray(card?.wrong) && card.wrong.length ? { wrong: card.wrong } : {})
  };
}

function clampFlowchartScale(value) {
  return Math.max(0.45, Math.min(2.4, Number(value || 1)));
}

function makeEntityEditorModel(state) {
  const { project, selection, entityEditor } = state;
  if (!entityEditor) return null;

  if (entityEditor.kind === "home-actions") {
    return {
      variant: "action-menu",
      title: "Ações",
      placement: "side",
      fields: [],
      actions: [
        { key: "import-json", label: "Importar", icon: "&#8679;" },
        { key: "export-backup", label: "Exportar backup", icon: "&#8681;" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "course-actions") {
    const course = findCourse(project, entityEditor.courseKey || selection.courseKey);
    if (!course) return null;
    return {
      variant: "action-menu",
      title: "Ações do curso",
      placement: "bottom",
      fields: [],
      actions: [
        { key: "edit-course-metadata", label: "Editar curso", icon: "&#9998;" },
        { key: "reset-course-progress", label: "Zerar progresso do curso", icon: "&#8635;" },
        { key: "export-course", label: "Exportar curso", icon: "&#8681;" },
        { key: "delete-course", label: "Excluir curso", icon: "&#128465;", tone: "danger" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "course-screen-actions") {
    return {
      variant: "action-menu",
      title: "Ações",
      placement: "side",
      fields: [],
      actions: [
        { key: "create-module", label: "Novo módulo", icon: "&#43;" },
        { key: "import-module", label: "Importar módulo", icon: "&#8679;" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "module-screen-actions") {
    return {
      variant: "action-menu",
      title: "Ações",
      placement: "side",
      fields: [],
      actions: [
        { key: "create-lesson", label: "Nova lição", icon: "&#43;" },
        { key: "import-lesson", label: "Importar lição", icon: "&#8679;" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "course-metadata") {
    const course = findCourse(project, entityEditor.courseKey || selection.courseKey);
    if (!course) return null;
    return {
      title: "Curso",
      fields: [
        { name: "title", label: "Título", type: "text", value: course.title || "" },
        { name: "description", label: "Descrição", type: "textarea", value: course.description || "" }
      ],
      actions: []
    };
  }

  if (entityEditor.kind === "course") {
    const course = findCourse(project, entityEditor.courseKey || selection.courseKey);
    if (!course) return null;
    return {
      title: "Curso",
      fields: [
        { name: "title", label: "Título", type: "text", value: course.title || "" },
        { name: "description", label: "Descrição", type: "textarea", value: course.description || "" }
      ],
      actions: [
        { key: "create-module", label: "Novo módulo" },
        { key: "create-course", label: "Novo curso" },
        { key: "delete-course", label: "Excluir curso", tone: "danger" }
      ]
    };
  }

  if (entityEditor.kind === "module") {
    const moduleValue = findModule(project, entityEditor.courseKey || selection.courseKey, entityEditor.moduleKey);
    if (!moduleValue) return null;
    return {
      title: "Módulo",
      fields: [
        { name: "title", label: "Título", type: "text", value: moduleValue.title || "" },
        { name: "description", label: "Descrição", type: "textarea", value: moduleValue.description || "" }
      ],
      actions: []
    };
  }

  if (entityEditor.kind === "module-actions") {
    const moduleValue = findModule(project, entityEditor.courseKey || selection.courseKey, entityEditor.moduleKey);
    if (!moduleValue) return null;
    return {
      variant: "action-menu",
      title: "Ações do módulo",
      placement: "bottom",
      fields: [],
      actions: [
        { key: "edit-module-metadata", label: "Editar módulo", icon: "&#9998;" },
        { key: "create-lesson", label: "Adicionar lição", icon: "&#43;" },
        { key: "reset-module-progress", label: "Zerar progresso do módulo", icon: "&#8635;" },
        { key: "export-module", label: "Exportar módulo", icon: "&#8681;" },
        { key: "delete-module", label: "Excluir módulo", icon: "&#128465;", tone: "danger" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "lesson") {
    const lesson = findLesson(project, entityEditor.courseKey || selection.courseKey, entityEditor.moduleKey, entityEditor.lessonKey);
    if (!lesson) return null;
    return {
      title: "Lição",
      fields: [
        { name: "title", label: "Título", type: "text", value: lesson.title || "" },
        { name: "description", label: "Descrição", type: "textarea", value: lesson.description || "" }
      ],
      actions: []
    };
  }

  if (entityEditor.kind === "lesson-source-guide") {
    const lesson = findLesson(project, entityEditor.courseKey || selection.courseKey, entityEditor.moduleKey, entityEditor.lessonKey);
    if (!lesson) return null;
      return {
        title: "Fonte-guia da lição",
        fields: [
          ...buildSourceGuideEditorFields(lesson.sourceGuideStructured || {}, { level: SOURCE_GUIDE_LEVELS.LESSON }),
          ...buildLessonGuidanceEditorFields(normalizeLessonGuidance(lesson))
        ],
        actions: []
      };
  }

  if (entityEditor.kind === "lesson-actions") {
    const lesson = findLesson(project, entityEditor.courseKey || selection.courseKey, entityEditor.moduleKey, entityEditor.lessonKey);
    if (!lesson) return null;
    return {
      variant: "action-menu",
      title: "Ações da lição",
      placement: "bottom",
      fields: [],
      actions: [
        { key: "edit-lesson-metadata", label: "Editar lição", icon: "&#9998;" },
        { key: "deepen-lesson", label: "Completar lacunas", icon: "&#9881;" },
        { key: "reset-lesson-progress", label: "Zerar progresso da lição", icon: "&#8635;" },
        { key: "export-lesson", label: "Exportar lição", icon: "&#8681;" },
        { key: "delete-lesson", label: "Excluir lição", icon: "&#128465;", tone: "danger" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "lesson-screen-actions") {
    return {
      variant: "action-menu",
      title: "Ações",
      placement: "side",
      fields: [],
      actions: [
        { key: "create-microsequence", label: "Nova microssequência", icon: "&#43;" },
        { key: "import-microsequence", label: "Importar microssequência", icon: "&#8679;" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "microsequence") {
    const microsequence = findMicrosequence(
      project,
      entityEditor.courseKey || selection.courseKey,
      entityEditor.moduleKey,
      entityEditor.lessonKey,
      entityEditor.microsequenceKey
    );
    if (!microsequence) return null;
    return {
      title: "Microssequência",
      fields: [
        { name: "title", label: "Título", type: "text", value: microsequence.title || "" },
        { name: "tags", label: "Tags", type: "textarea", value: formatTagsText(microsequence.tags) }
      ],
      actions: [
        { key: "create-card", label: "Novo card" },
        { key: "create-plane-card", label: "Novo plano cartesiano" },
        { key: "create-matrix-card", label: "Nova matriz" },
        { key: "delete-microsequence", label: "Excluir microssequência", tone: "danger" }
      ]
    };
  }

  if (entityEditor.kind === "microsequence-actions") {
    const microsequence = findMicrosequence(
      project,
      entityEditor.courseKey || selection.courseKey,
      entityEditor.moduleKey,
      entityEditor.lessonKey,
      entityEditor.microsequenceKey
    );
    if (!microsequence) return null;
    return {
      variant: "action-menu",
      title: "Ações da microssequência",
      placement: "bottom",
      fields: [],
      actions: [
        { key: "edit-microsequence-metadata", label: "Editar microssequência", icon: "&#9998;" },
        { key: "deepen-microsequence", label: "Completar lacunas", icon: "&#9881;" },
        { key: "create-card", label: "Novo card", icon: "&#43;" },
        { key: "create-plane-card", label: "Novo plano cartesiano", icon: "&#9641;" },
        { key: "create-matrix-card", label: "Nova matriz", icon: "&#91;&#93;" },
        { key: "export-microsequence", label: "Exportar microssequência", icon: "&#8681;" },
        { key: "delete-microsequence", label: "Excluir microssequência", icon: "&#128465;", tone: "danger" }
      ],
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "assist-container-picker") {
    return {
      variant: "action-menu",
      title: "Adicionar recursos",
      placement: "bottom",
      fields: [],
      actions: ASSIST_CARD_CONTAINER_OPTIONS.map((item) => ({
        key: `set-assist-container:${item.value}`,
        label: item.label,
        icon: item.icon
      })),
      showSaveButton: false
    };
  }

  if (entityEditor.kind === "card") {
    const microsequence = findMicrosequence(
      project,
      entityEditor.courseKey || selection.courseKey,
      entityEditor.moduleKey || selection.moduleKey,
      entityEditor.lessonKey || selection.lessonKey,
      entityEditor.microsequenceKey || selection.microsequenceKey
    );
    const card = microsequence && (entityEditor.cardKey || selection.cardKey)
      ? findCard(microsequence, entityEditor.cardKey || selection.cardKey)
      : null;
    if (!card) return null;
    const moveActions = buildMoveActions(microsequence.cards || [], card.key, "move-card-up", "move-card-down");
    return {
      title: "Card",
      fields: [],
      actions: [
        { key: "create-card", label: "Novo card após este" },
        { key: "create-plane-card", label: "Novo plano cartesiano" },
        { key: "create-matrix-card", label: "Nova matriz" },
        ...moveActions,
        { key: "delete-card", label: "Excluir card", tone: "danger" }
      ]
    };
  }

  return null;
}

export function createLessonEditorApp({ root, storage, editor }) {
  if (!root) fail("Raiz inválida.");
  if (!storage || typeof storage.loadProject !== "function") fail("Storage inválido.");
  if (!editor) fail("Editor inválido.");

  const initialProject = storage.loadProject();
  const initialAssistConfig = readAssistConfigStorage();
  const state = {
    project: initialProject,
    projectHead: initialProject,
    view: "courses",
    homeTab: "courses",
    generationPanelOpen: false,
    selection: null,
    cardCommentOpen: false,
    versionHistoryOpen: false,
    versionCompareOpen: false,
    versionHistorySelectionKey: "",
    versionHistoryExpandedMoreKey: "",
    versionCompareSelectionKey: "",
    versionCompareTab: "summary",
    versionCompareFocusTarget: null,
    entityEditor: null,
    assistConfigOpen: false,
    assistConfig: initialAssistConfig,
    assistConfigDraft: { ...initialAssistConfig },
    codexCliSetupOpen: false,
    codexCliSetupStatus: {
      ok: false,
      checking: false,
      error: "",
      data: null
    },
    pendingExternalImport: null,
    microsequenceMode: "play",
    cardHistory: readHistoryStorage(),
    microsequenceVersions: readMicrosequenceVersionStorage(),
    structureVersions: readStructureVersionStorage(),
    cardComments: readCommentStorage(),
    cardCommentDraft: "",
    flowchartPracticeByBlockKey: {},
    activeFlowchartPrompt: null,
    flowchartPinch: null,
    directoryTreeUiByBlockKey: {},
    choiceExerciseByBlockKey: {},
    completeExerciseByBlockKey: {},
    activeTextGapPrompt: null,
    cardExerciseLoadVersion: 0,
    continuePopup: null,
    assistDraft: {
      selectedMode: ASSIST_USER_MODES.EDIT_MICROSEQUENCE,
      activeWorkbenchPane: "preview",
      visualizedVersionId: "",
      editBaseVersionId: "",
      versionActionsOpen: false,
      promptText: "",
      didacticTypeId: "",
      preferredContainer: "",
      attachments: [],
      dependencyKeys: [],
      pendingDependencyKey: "",
      lastRequest: null,
      isSubmitting: false,
      errorMessage: ""
    },
    generationDraft: {
      courseFixed: false,
      moduleFixed: false,
      lessonFixed: false,
      repositionMicrosequences: false,
      courseInput: "",
      courseKey: "",
      moduleInput: "",
      moduleKey: "",
      lessonInput: "",
      lessonKey: "",
      promptText: "",
      attachments: [],
      lastResult: null,
      isSubmitting: false,
      errorMessage: ""
    },
    structureDrag: null,
    structureDrop: null,
    lastCoursesView: "courses",
    pendingGeneratedNavigation: null,
    pendingStructureFocus: null,
    pendingExerciseFocus: null,
    centerActiveStructureVersionTabOnRender: true
  };

  state.selection = getFirstPath(state.project);

  function setProject(nextProject, { updateHead = true } = {}) {
    state.project = nextProject;
    if (updateHead) {
      state.projectHead = nextProject;
    }
    if (STRUCTURE_VERSIONING_ACTIVE) {
      seedAllStructureVersionsFromProject();
    }
  }

  function commitVisibleProjectMutation(mutator, input) {
    const nextProject = mutator(state.project, input);
    storage.saveProject(nextProject);
    return nextProject;
  }

  function readVisibleProjectProjection(reader, input) {
    return reader(state.project, input);
  }

  const structuralEditor = {
    createCourse(input) {
      return commitVisibleProjectMutation(createCourseDocument, input);
    },
    importCourses(input) {
      return commitVisibleProjectMutation(importCoursesDocument, input);
    },
    importModules(input) {
      return commitVisibleProjectMutation(importModulesDocument, input);
    },
    importLessons(input) {
      return commitVisibleProjectMutation(importLessonsDocument, input);
    },
    exportCourseDocument(input) {
      return readVisibleProjectProjection(exportCourseDocumentFromDocument, input);
    },
    exportModuleDocument(input) {
      return readVisibleProjectProjection(exportModuleDocumentFromDocument, input);
    },
    exportLessonDocument(input) {
      return readVisibleProjectProjection(exportLessonDocumentFromDocument, input);
    },
    updateCourse(input) {
      return commitVisibleProjectMutation(updateCourseDocument, input);
    },
    deleteCourse(input) {
      return commitVisibleProjectMutation(deleteCourseDocument, input);
    },
    moveCourse(input) {
      return commitVisibleProjectMutation(moveCourseDocument, input);
    },
    createModule(input) {
      return commitVisibleProjectMutation(createModuleDocument, input);
    },
    updateModule(input) {
      return commitVisibleProjectMutation(updateModuleDocument, input);
    },
    deleteModule(input) {
      return commitVisibleProjectMutation(deleteModuleDocument, input);
    },
    moveModule(input) {
      return commitVisibleProjectMutation(moveModuleDocument, input);
    },
    createLesson(input) {
      return commitVisibleProjectMutation(createLessonDocument, input);
    },
    updateLesson(input) {
      return commitVisibleProjectMutation(updateLessonDocument, input);
    },
    deleteLesson(input) {
      return commitVisibleProjectMutation(deleteLessonDocument, input);
    },
    moveLesson(input) {
      return commitVisibleProjectMutation(moveLessonDocument, input);
    }
  };

  function isCoursesView(view) {
    return COURSES_VIEWS.has(view);
  }

  function rememberCoursesView(view = state.view) {
    if (!isCoursesView(view)) {
      return;
    }
    state.lastCoursesView = view;
  }

  function readStructurePayload(node, fallbackLevel = "") {
    if (!node) {
      return null;
    }

    const level = node.getAttribute("data-structure-level") || node.getAttribute("data-structure-target") || fallbackLevel;
    if (!level) {
      return null;
    }

    return {
      level,
      courseKey: node.getAttribute("data-course-key") || "",
      moduleKey: node.getAttribute("data-module-key") || "",
      lessonKey: node.getAttribute("data-lesson-key") || "",
      microsequenceKey: node.getAttribute("data-microsequence-key") || "",
      cardKey: node.getAttribute("data-card-key") || ""
    };
  }

  function isSameStructurePayload(left, right) {
    return !!left &&
      !!right &&
      left.level === right.level &&
      left.courseKey === right.courseKey &&
      left.moduleKey === right.moduleKey &&
      left.lessonKey === right.lessonKey &&
      left.microsequenceKey === right.microsequenceKey &&
      left.cardKey === right.cardKey;
  }

  function canDropStructure(drag, target) {
    if (!drag || !target || drag.level !== target.level || isSameStructurePayload(drag, target)) {
      return false;
    }

    if (drag.level === "course") {
      return !!drag.courseKey && !!target.courseKey;
    }
    if (drag.level === "module") {
      return drag.courseKey === target.courseKey && !!drag.moduleKey && !!target.moduleKey;
    }
    if (drag.level === "lesson") {
      return drag.courseKey === target.courseKey && drag.moduleKey === target.moduleKey && !!drag.lessonKey && !!target.lessonKey;
    }
    if (drag.level === "microsequence") {
      return (
        drag.courseKey === target.courseKey &&
        drag.moduleKey === target.moduleKey &&
        drag.lessonKey === target.lessonKey &&
        !!drag.microsequenceKey &&
        !!target.microsequenceKey
      );
    }
    if (drag.level === "card") {
      return (
        drag.courseKey === target.courseKey &&
        drag.moduleKey === target.moduleKey &&
        drag.lessonKey === target.lessonKey &&
        drag.microsequenceKey === target.microsequenceKey &&
        !!drag.cardKey &&
        !!target.cardKey
      );
    }

    return false;
  }

  function clearStructureDropClasses() {
    root
      .querySelectorAll(
        ".structure-drop-before, .structure-drop-after, .structure-drop-inline-before, .structure-drop-inline-after, .structure-drag-origin"
      )
      .forEach((node) => {
        node.classList.remove(
          "structure-drop-before",
          "structure-drop-after",
          "structure-drop-inline-before",
          "structure-drop-inline-after",
          "structure-drag-origin"
        );
      });
  }

  function getStructureDropClass(level, position) {
    if (level === "card") {
      return position === "after" ? "structure-drop-inline-after" : "structure-drop-inline-before";
    }
    return position === "after" ? "structure-drop-after" : "structure-drop-before";
  }

  function resetStructureDragState() {
    state.structureDrag = null;
    state.structureDrop = null;
    clearStructureDropClasses();
  }

  function resolveStructureDropIndex(items, draggedKey, targetKey, position) {
    const fromIndex = (items || []).findIndex((item) => item.key === draggedKey);
    const targetIndex = (items || []).findIndex((item) => item.key === targetKey);
    if (fromIndex < 0 || targetIndex < 0) {
      return null;
    }

    let nextIndex = position === "after" ? targetIndex + 1 : targetIndex;
    if (fromIndex < nextIndex) {
      nextIndex -= 1;
    }

    return nextIndex;
  }

  function getStructureDropPosition(targetNode, clientY) {
    const rect = targetNode.getBoundingClientRect();
    return clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  function getStructureAxis(level) {
    return level === "card" ? "x" : "y";
  }

  function getStructureDropPositionForAxis(targetNode, point, axis) {
    const rect = targetNode.getBoundingClientRect();
    if (axis === "x") {
      return point > rect.left + rect.width / 2 ? "after" : "before";
    }
    return point > rect.top + rect.height / 2 ? "after" : "before";
  }

  function readStructureCollection(node) {
    if (!node) {
      return null;
    }
    const level = node.getAttribute("data-structure-collection") || "";
    if (!level) {
      return null;
    }
    return readStructurePayload(node, level);
  }

  function getStructureCollectionItems(node, level) {
    return Array.from(node?.children || []).filter((child) => child.getAttribute?.("data-structure-target") === level);
  }

  function resolveCollectionDropState(collectionNode, drag, clientX, clientY) {
    const collection = readStructureCollection(collectionNode);
    if (!collection || !drag || collection.level !== drag.level) {
      return null;
    }

    const axis = getStructureAxis(drag.level);
    const point = axis === "x" ? clientX : clientY;
    const items = getStructureCollectionItems(collectionNode, collection.level)
      .map((node) => ({
        node,
        payload: readStructurePayload(node)
      }))
      .filter((entry) => canDropStructure(drag, entry.payload));

    if (!items.length) {
      return null;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const firstRect = first.node.getBoundingClientRect();
    const lastRect = last.node.getBoundingClientRect();
    const firstThreshold = axis === "x" ? firstRect.left + firstRect.width / 2 : firstRect.top + firstRect.height / 2;
    const lastThreshold = axis === "x" ? lastRect.left + lastRect.width / 2 : lastRect.top + lastRect.height / 2;

    if (point <= firstThreshold) {
      return { target: first.payload, position: "before", node: first.node };
    }
    if (point >= lastThreshold) {
      return { target: last.payload, position: "after", node: last.node };
    }

    for (const entry of items) {
      const position = getStructureDropPositionForAxis(entry.node, point, axis);
      const rect = entry.node.getBoundingClientRect();
      const threshold = axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      if ((position === "before" && point <= threshold) || (position === "after" && point >= threshold)) {
        return { target: entry.payload, position, node: entry.node };
      }
    }

    return { target: last.payload, position: "after", node: last.node };
  }

  function markStructureDropTarget(targetNode, position) {
    clearStructureDropClasses();
    const originNode = state.structureDrag?.originNode || null;
    originNode?.classList.add("structure-drag-origin");
    targetNode.classList.add(getStructureDropClass(state.structureDrag?.level, position));
  }

  function collectGlobalAssistTags(project = state.project) {
    const seenTitles = new Set();
    const tags = [];

    function pushCatalogEntry(key, title, scope) {
      const safeKey = String(key || "").trim();
      const safeTitle = String(title || key || "").trim();
      if (!safeKey || !safeTitle || seenTitles.has(safeKey.toLowerCase())) {
        return;
      }

      seenTitles.add(safeKey.toLowerCase());
      tags.push({
        key: safeKey,
        title: safeTitle,
        scope
      });
    }

    (project.courses || []).forEach((course) => {
      if (!course) {
        return;
      }

      (course.modules || []).forEach((moduleValue) => {
        (moduleValue.lessons || []).forEach((lesson) => {
          (lesson.microsequences || []).forEach((microsequence) => {
            const title = (microsequence.title || microsequence.key || "").trim();
            pushCatalogEntry(title, title, course.title || "Curso");
            (microsequence.tags || []).forEach((tag) => {
              pushCatalogEntry(tag, tag, "Tag");
            });
          });
        });
      });
    });

    return tags;
  }

  function getAssistCatalog() {
    const context = getRenderContext();
    const localDependencies = collectAssistDependencies(context.course, context.moduleValue, context.lesson, context.microsequence);
    const globalTags = collectGlobalAssistTags();
    const merged = [];
    const seenKeys = new Set();

    [...localDependencies, ...globalTags].forEach((item) => {
      const key = String(item?.key || "").trim();
      if (!key || seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      merged.push(item);
    });

    return merged;
  }

  function collectRepositionSlots(project = state.project) {
    const selectedTagTitles = state.assistDraft.dependencyKeys;
    if (!selectedTagTitles.length) {
      return [];
    }

    const normalizedSelectedTags = new Set(selectedTagTitles.map((item) => normalizeComparableText(item)));
    const slots = [];
    const seenSlotIds = new Set();

    (project.courses || []).forEach((course) => {
      if (!course) {
        return;
      }

      (course.modules || []).forEach((moduleValue) => {
        (moduleValue.lessons || []).forEach((lesson) => {
          const microsequences = lesson.microsequences || [];
          microsequences.forEach((microsequence, startIndex) => {
            const normalizedTitle = normalizeComparableText(microsequence.title || microsequence.key);
            if (!normalizedSelectedTags.has(normalizedTitle)) {
              return;
            }

            const sequence = microsequences.slice(startIndex);
            const sequenceTitles = sequence.map((item) => item.title || item.key);
            const beforeSlotId = [
              "slot",
              course.key,
              moduleValue.key,
              lesson.key,
              "before",
              microsequence.key
            ].join("::");
            if (!seenSlotIds.has(beforeSlotId)) {
              seenSlotIds.add(beforeSlotId);
              slots.push({
                slotId: beforeSlotId,
                courseKey: course.key,
                courseTitle: course.title || course.key,
                moduleKey: moduleValue.key,
                moduleTitle: moduleValue.title || moduleValue.key,
                lessonKey: lesson.key,
                lessonTitle: lesson.title || lesson.key,
                insertBeforeMicrosequenceKey: microsequence.key,
                insertBeforeTitle: microsequence.title || microsequence.key,
                targetPosition: startIndex,
                sequenceTitles
              });
            }

            sequence.forEach((sequenceItem, relativeIndex) => {
              const absoluteIndex = startIndex + relativeIndex;
              const slotId = [
                "slot",
                course.key,
                moduleValue.key,
                lesson.key,
                "after",
                sequenceItem.key
              ].join("::");
              if (seenSlotIds.has(slotId)) {
                return;
              }

              seenSlotIds.add(slotId);
              slots.push({
                slotId,
                courseKey: course.key,
                courseTitle: course.title || course.key,
                moduleKey: moduleValue.key,
                moduleTitle: moduleValue.title || moduleValue.key,
                lessonKey: lesson.key,
                lessonTitle: lesson.title || lesson.key,
                insertAfterMicrosequenceKey: sequenceItem.key,
                insertAfterTitle: sequenceItem.title || sequenceItem.key,
                targetPosition: absoluteIndex + 1,
                sequenceTitles
              });
            });
          });
        });
      });
    });

    return slots;
  }

  function getAssistModeOptions() {
    const hasSelectedTags = state.assistDraft.dependencyKeys.length > 0;

    const options = [
      { value: ASSIST_USER_MODES.EDIT_MICROSEQUENCE, label: "Editar microssequência" }
    ];
    if (hasSelectedTags) {
      options.push({ value: ASSIST_USER_MODES.REPOSITION, label: "Reposicionar em um curso" });
    }

    return {
      options,
      locked: options.length === 1
    };
  }

  function getDefaultAssistUserMode() {
    return ASSIST_USER_MODES.EDIT_MICROSEQUENCE;
  }

  function applySelection(path) {
    if (!path) return;
    state.selection = {
      courseKey: path.courseKey,
      moduleKey: path.moduleKey,
      lessonKey: path.lessonKey,
      microsequenceKey: path.microsequenceKey,
      cardKey: path.cardKey,
      cardIndex: path.cardIndex
    };
  }

  function buildNodeSelection({ courseKey = null, moduleKey = null, lessonKey = null, microsequenceKey = null } = {}) {
    return {
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      cardKey: null,
      cardIndex: 0
    };
  }

  function focusStructureTarget(target) {
    if (!target) {
      return;
    }
    state.pendingStructureFocus = {
      view: target.view || state.view,
      courseKey: target.courseKey || null,
      moduleKey: target.moduleKey || null,
      lessonKey: target.lessonKey || null,
      microsequenceKey: target.microsequenceKey || null
    };
  }

  function applySelectionByKeys(nextProject, desiredSelection = state.selection) {
    const fallbackPath = getFirstPath(nextProject);
    const course = findCourse(nextProject, desiredSelection?.courseKey) || findCourse(nextProject, fallbackPath.courseKey);
    const moduleValue =
      findModule(nextProject, course?.key, desiredSelection?.moduleKey) ||
      findModule(nextProject, course?.key, fallbackPath.moduleKey);
    const lesson =
      findLesson(nextProject, course?.key, moduleValue?.key, desiredSelection?.lessonKey) ||
      findLesson(nextProject, course?.key, moduleValue?.key, fallbackPath.lessonKey);
    const microsequence =
      findMicrosequence(nextProject, course?.key, moduleValue?.key, lesson?.key, desiredSelection?.microsequenceKey) ||
      findMicrosequence(nextProject, course?.key, moduleValue?.key, lesson?.key, fallbackPath.microsequenceKey);
    const cards = microsequence?.cards || [];
    const fallbackCardIndex = Number.isInteger(fallbackPath.cardIndex) ? fallbackPath.cardIndex : 0;
    const preferredIndex = Number.isInteger(desiredSelection?.cardIndex) ? desiredSelection.cardIndex : fallbackCardIndex;
    const cardFromKey = desiredSelection?.cardKey ? findCard(microsequence, desiredSelection.cardKey) : null;
    const safeCardIndex = cards.length ? Math.max(0, Math.min(preferredIndex, cards.length - 1)) : 0;
    const selectedCard = cardFromKey || cards[safeCardIndex] || null;

    const nextPath = {
      courseKey: course?.key || null,
      moduleKey: moduleValue?.key || null,
      lessonKey: lesson?.key || null,
      microsequenceKey: microsequence?.key || null,
      cardKey: selectedCard?.key || null,
      cardIndex: selectedCard ? cards.findIndex((item) => item.key === selectedCard.key) : 0
    };

    applySelection(nextPath);
    return nextPath;
  }

  function selectFirstPath(nextProject) {
    const nextPath = getFirstPath(nextProject);
    applySelection(nextPath);
    return nextPath;
  }

  function openCourse(courseKey) {
    const course = findCourse(state.project, courseKey);
    if (!course) return;
    const moduleValue = (course.modules || [])[0] || null;
    const lesson = moduleValue && moduleValue.lessons ? moduleValue.lessons[0] || null : null;
    const microsequence = lesson && lesson.microsequences ? lesson.microsequences[0] || null : null;
    const card = microsequence && microsequence.cards ? microsequence.cards[0] || null : null;

    state.selection.courseKey = course.key;
    state.selection.moduleKey = moduleValue ? moduleValue.key : null;
    state.selection.lessonKey = lesson ? lesson.key : null;
    state.selection.microsequenceKey = microsequence ? microsequence.key : null;
    state.selection.cardKey = card ? card.key : null;
    state.selection.cardIndex = 0;
    state.view = "course";
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.microsequenceMode = "play";
    syncVisibleStructureVersionsFromProject();
    render({ preserveState: false });
  }

  function openModule(moduleKey) {
    const moduleValue = findModule(state.project, state.selection.courseKey, moduleKey);
    if (!moduleValue) return;
    const lesson = (moduleValue.lessons || [])[0] || null;
    const microsequence = lesson && lesson.microsequences ? lesson.microsequences[0] || null : null;
    const card = microsequence && microsequence.cards ? microsequence.cards[0] || null : null;

    state.selection.moduleKey = moduleValue.key;
    state.selection.lessonKey = lesson ? lesson.key : null;
    state.selection.microsequenceKey = microsequence ? microsequence.key : null;
    state.selection.cardKey = card ? card.key : null;
    state.selection.cardIndex = 0;
    state.view = "module";
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.microsequenceMode = "play";
    syncVisibleStructureVersionsFromProject();
    render({ preserveState: false });
  }

  function openLesson(moduleKey, lessonKey) {
    const lesson = findLesson(state.project, state.selection.courseKey, moduleKey, lessonKey);
    if (!lesson) return;
    const lessonCards = collectLessonCards(lesson);
    const progressCursor = getLessonProgressCursor(
      storage.loadProgress(),
      getLessonProgressReference(state.selection.courseKey, moduleKey, lessonKey),
      lessonCards.length
    );
    const currentEntry = lessonCards[progressCursor] || lessonCards[0] || null;
    const firstMicrosequence = currentEntry
      ? findMicrosequence(state.project, state.selection.courseKey, moduleKey, lessonKey, currentEntry.microsequenceKey)
      : (lesson.microsequences || [])[0] || null;
    const firstCard = currentEntry ? currentEntry.card : firstMicrosequence && firstMicrosequence.cards ? firstMicrosequence.cards[0] || null : null;

    state.selection.moduleKey = moduleKey;
    state.selection.lessonKey = lessonKey;
    state.selection.microsequenceKey = currentEntry ? currentEntry.microsequenceKey : firstMicrosequence ? firstMicrosequence.key : null;
    state.selection.cardKey = firstCard ? firstCard.key : null;
    state.selection.cardIndex = currentEntry ? currentEntry.cardIndex : 0;
    state.view = "lesson";
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.microsequenceMode = "play";
    syncVisibleStructureVersionsFromProject();
    render({ preserveState: false });
  }

  function getLessonProgressReference(courseKey, moduleKey, lessonKey) {
    if (!courseKey || !moduleKey || !lessonKey) {
      return null;
    }

    return { courseKey, moduleKey, lessonKey };
  }

  function persistLessonProgress(reference, lessonCards, reachedIndex) {
    if (!reference || !Array.isArray(lessonCards) || !lessonCards.length) {
      return;
    }

    const currentProgress = storage.loadProgress();
    const nextProgress = writeLessonProgressEntry(
      currentProgress,
      reference,
      lessonCards.map((entry) => entry.card),
      reachedIndex
    );
    storage.saveProgress(nextProgress);
  }

  function collectProgressReferencesInModule(courseKey, moduleValue) {
    return (moduleValue?.lessons || []).map((lesson) => ({
      courseKey,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key
    }));
  }

  function removeProgressEntries(lessonReferences) {
    const currentProgress = storage.loadProgress();
    const nextProgress = removeLessonProgressEntries(currentProgress, lessonReferences);
    storage.saveProgress(nextProgress);
  }

  function saveCardHistory() {
    writeHistoryStorage(state.cardHistory);
  }

  function saveMicrosequenceVersions() {
    writeMicrosequenceVersionStorage(state.microsequenceVersions);
  }

  function saveStructureVersions() {
    writeStructureVersionStorage(state.structureVersions);
  }

  function seedAllStructureVersionsFromProject() {
    if (!STRUCTURE_VERSIONING_ACTIVE) {
      return;
    }
    const changed = seedStructureVersionMapFromProject(state.structureVersions, state.projectHead);
    if (changed) {
      saveStructureVersions();
    }
  }

  function syncActiveStructureVersionFromProject(reference) {
    if (!STRUCTURE_VERSIONING_ACTIVE) {
      return;
    }
    if (!reference?.level) {
      return;
    }

    const entry = syncStructureVersionSnapshot(state.structureVersions, state.projectHead, reference);
    if (entry) {
      saveStructureVersions();
    }
  }

  function createStructureVersionFromProject(nextProject, reference, options = {}) {
    if (!STRUCTURE_VERSIONING_ACTIVE) {
      return;
    }
    if (!nextProject) {
      return;
    }

    const references = [{ level: "project" }, ...(reference?.level ? [reference] : [])];
    let changed = false;
    references.forEach((targetReference) => {
      const entry = recordStructureVersionTransition(state.structureVersions, {
        beforeProject: state.project,
        afterProject: nextProject,
        reference: targetReference,
        ...options
      });
      if (entry) {
        changed = true;
      }
    });
    if (changed) {
      saveStructureVersions();
    }
  }

  function getCurrentStructureVersionReference() {
    if (state.view === "courses") {
      return {
        level: "project"
      };
    }

    if (state.view === "course" && state.selection.courseKey) {
      return {
        level: "course",
        courseKey: state.selection.courseKey
      };
    }

    if (state.view === "module" && state.selection.courseKey && state.selection.moduleKey) {
      return {
        level: "module",
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey
      };
    }

    if (state.view === "lesson" && state.selection.courseKey && state.selection.moduleKey && state.selection.lessonKey) {
      return {
        level: "lesson",
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey
      };
    }

    return null;
  }

  function listVisibleStructureVersionReferences() {
    const references = [];
    if (state.view === "courses") {
      references.push({ level: "project" });
      return references;
    }

    if (state.selection.courseKey) {
      references.push({ level: "project" });
      references.push({
        level: "course",
        courseKey: state.selection.courseKey
      });
    }

    if ((state.view === "module" || state.view === "lesson") && state.selection.courseKey && state.selection.moduleKey) {
      references.push({
        level: "module",
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey
      });
    }

    if (state.view === "lesson" && state.selection.courseKey && state.selection.moduleKey && state.selection.lessonKey) {
      references.push({
        level: "lesson",
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey
      });
    }

    return references;
  }

  function syncVisibleStructureVersionsFromProject() {
    if (!STRUCTURE_VERSIONING_ACTIVE) {
      return;
    }

    seedAllStructureVersionsFromProject();
    listVisibleStructureVersionReferences().forEach((reference) => syncActiveStructureVersionFromProject(reference));
  }

  function getStructureVersionEntry(reference = getCurrentStructureVersionReference()) {
    const versionKey = buildStructureVersionKey(reference);
    if (!versionKey) {
      return null;
    }

    return state.structureVersions[versionKey] || null;
  }

  function getSelectedStructureVersionId() {
    const entry = getStructureVersionEntry();
    return String(state.versionHistorySelectionKey || entry?.activeVersionId || "").trim();
  }

  function getSelectedStructureVersion(reference = getCurrentStructureVersionReference()) {
    const entry = getStructureVersionEntry(reference);
    if (!entry) {
      return null;
    }

    const selectedVersionId = getSelectedStructureVersionId();
    return (
      entry.versions.find((item) => item.id === selectedVersionId) ||
      entry.versions.find((item) => item.id === entry.activeVersionId) ||
      entry.versions[0] ||
      null
    );
  }

  function getAssistModelLabel(model) {
    return ASSIST_MODEL_OPTIONS.find((item) => item.value === model)?.label || model;
  }

  function getAssistContainerLabel(container) {
    return ASSIST_CARD_CONTAINER_OPTIONS.find((item) => item.value === container)?.label || "Automático";
  }

  function persistAssistConfig() {
    writeAssistConfigStorage(state.assistConfig);
  }

  function getCodexSetupEndpoint() {
    return state.assistConfig.codexEndpoint || DEFAULT_CODEX_LOCAL_ENDPOINT;
  }

  function getCodexSetupPlatform() {
    return detectCodexCliSetupPlatform();
  }

  function getCodexSetupPresentation() {
    return getCodexCliSetupPresentation(getCodexSetupPlatform());
  }

  function getCodexSetupScript() {
    try {
      return buildCodexCliSetupScript({
        platform: getCodexSetupPlatform(),
        endpoint: getCodexSetupEndpoint(),
        token: state.assistConfig.codexToken
      });
    } catch (error) {
      return `# Endpoint inválido\n# ${error instanceof Error ? error.message : "Revise o endpoint configurado."}`;
    }
  }

  function getCodexSetupHealthCommand() {
    try {
      return buildCodexCliHealthCommand({
        platform: getCodexSetupPlatform(),
        endpoint: getCodexSetupEndpoint(),
        token: state.assistConfig.codexToken
      });
    } catch (error) {
      return `# ${error instanceof Error ? error.message : "Revise o endpoint configurado."}`;
    }
  }

  function updateCodexCliSetupStatus(nextStatus = {}) {
    state.codexCliSetupStatus = {
      ok: nextStatus.ok === true,
      checking: nextStatus.checking === true,
      error: typeof nextStatus.error === "string" ? nextStatus.error : "",
      data: nextStatus.data ?? null
    };
  }

  function openCodexCliSetup(errorMessage = "") {
    state.assistConfigOpen = false;
    state.codexCliSetupOpen = true;
    updateCodexCliSetupStatus({
      ok: false,
      checking: false,
      error: errorMessage || state.codexCliSetupStatus.error || "",
      data: state.codexCliSetupStatus.data
    });
    render({ preserveState: true });
  }

  function closeCodexCliSetup() {
    state.codexCliSetupOpen = false;
    render({ preserveState: true });
  }

  async function testCodexCliConnection({ preserveState = true } = {}) {
    updateCodexCliSetupStatus({
      ok: false,
      checking: true,
      error: "",
      data: null
    });
    render({ preserveState });

    let status;
    try {
      status = await checkCodexLocalHealth({
        endpoint: state.assistConfig.codexEndpoint,
        token: state.assistConfig.codexToken
      });
    } catch (error) {
      status = {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao validar o endpoint local.",
        status: 0
      };
    }

    updateCodexCliSetupStatus({
      ok: status.ok,
      checking: false,
      error: status.ok ? "" : status.error || "Bridge local não encontrado.",
      data: status.ok ? status.data : null
    });
    render({ preserveState });
    return status;
  }

  async function ensureCodexLocalReady() {
    if (!isCodexLocalModel(state.assistConfig.model)) {
      return true;
    }

    const status = await testCodexCliConnection();
    if (status.ok) {
      return true;
    }

    openCodexCliSetup(status.error || "O bridge local não está ativo.");
    return false;
  }

  async function handleCodexModelSelection(model) {
    if (!isCodexLocalModel(model)) {
      return;
    }

    const status = await testCodexCliConnection();
    if (!status.ok) {
      openCodexCliSetup(status.error || "O bridge local não está ativo.");
    }
  }

  async function copyTextToClipboard(text) {
    const safeText = String(text || "");
    if (!safeText) {
      return false;
    }

    if (globalThis.navigator?.clipboard?.writeText) {
      try {
        await globalThis.navigator.clipboard.writeText(safeText);
        return true;
      } catch {
        // Continua para o fallback legado.
      }
    }

    if (!globalThis.document?.body) {
      return false;
    }

    const textarea = globalThis.document.createElement("textarea");
    textarea.value = safeText;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    globalThis.document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return globalThis.document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  function openAssistConfig() {
    state.codexCliSetupOpen = false;
    state.assistConfigDraft = { ...state.assistConfig };
    state.assistConfigOpen = true;
    render({ preserveState: true });
  }

  function closeAssistConfig() {
    state.assistConfigOpen = false;
    render({ preserveState: true });
  }

  function setAssistModel(model) {
    state.assistConfig.model = model || "gemini-2.5-flash";
    if (state.assistConfigOpen) {
      state.assistConfigDraft.model = state.assistConfig.model;
    }
    persistAssistConfig();
    void handleCodexModelSelection(state.assistConfig.model);
  }

  function persistAssistConfigValue(patch = {}) {
    state.assistConfig = {
      model: patch.model || state.assistConfig.model || "gemini-2.5-flash",
      apiKey:
        patch.apiKey !== undefined
          ? String(patch.apiKey || "").trim()
          : typeof state.assistConfig.apiKey === "string"
            ? state.assistConfig.apiKey.trim()
            : "",
      codexEndpoint:
        patch.codexEndpoint !== undefined
          ? String(patch.codexEndpoint || "").trim() || DEFAULT_CODEX_LOCAL_ENDPOINT
          : typeof state.assistConfig.codexEndpoint === "string" && state.assistConfig.codexEndpoint.trim()
            ? state.assistConfig.codexEndpoint.trim()
            : DEFAULT_CODEX_LOCAL_ENDPOINT,
      codexToken:
        patch.codexToken !== undefined
          ? String(patch.codexToken || "").trim()
          : typeof state.assistConfig.codexToken === "string"
            ? state.assistConfig.codexToken.trim()
            : ""
    };
    state.assistConfigDraft = { ...state.assistConfig };
    persistAssistConfig();
  }

  function getCurrentCardHistory() {
    const pathKey = buildCardPathKey(state.selection);
    return Array.isArray(state.cardHistory[pathKey]) ? state.cardHistory[pathKey] : [];
  }

  function recordCurrentCardSnapshot(label, source) {
    const context = getRenderContext();
    if (!context.card) {
      return;
    }

    const pathKey = buildCardPathKey(state.selection);
    const history = getCurrentCardHistory();
    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      label,
      source,
      title: context.card.title || "",
      text: readCardText(context.card),
      savedAt: new Date().toISOString()
    };

    if (history[0] && history[0].title === snapshot.title && history[0].text === snapshot.text) {
      return;
    }

    state.cardHistory[pathKey] = [snapshot, ...history].slice(0, MAX_CARD_SNAPSHOTS);
    saveCardHistory();
  }

  function ensureCurrentCardSnapshot() {
    const context = getRenderContext();
    if (!context.card) {
      return;
    }

    if (!getCurrentCardHistory().length) {
      recordCurrentCardSnapshot("Inicial", "base");
    }
  }

  function getAssistDependencies() {
    return getAssistCatalog();
  }

  function syncAssistDraft() {
    const dependencies = getAssistDependencies();
    const allowedKeys = new Set(dependencies.map((item) => item.key));
    const filteredKeys = state.assistDraft.dependencyKeys.filter((key) => allowedKeys.has(key));
    state.assistDraft.dependencyKeys =
      filteredKeys.length > 0
        ? filteredKeys.slice(0, MAX_ASSIST_DEPENDENCIES)
        : getDefaultDependencyKeys(dependencies);

    const availableKeys = dependencies
      .filter((item) => !state.assistDraft.dependencyKeys.includes(item.key))
      .map((item) => item.key);
    if (!availableKeys.includes(state.assistDraft.pendingDependencyKey)) {
      state.assistDraft.pendingDependencyKey = availableKeys[0] || "";
    }
    const modeOptions = getAssistModeOptions();
    const allowedModes = new Set(modeOptions.options.map((item) => item.value));
    if (!allowedModes.has(state.assistDraft.selectedMode)) {
      const defaultMode = getDefaultAssistUserMode();
      state.assistDraft.selectedMode = allowedModes.has(defaultMode)
        ? defaultMode
        : modeOptions.options[0]?.value || defaultMode;
    }
    if (!ASSIST_CARD_CONTAINER_OPTIONS.some((item) => item.value === state.assistDraft.preferredContainer)) {
      state.assistDraft.preferredContainer = "";
    }
    if (!ASSIST_DIDACTIC_TYPE_OPTIONS.some((item) => item.value === state.assistDraft.didacticTypeId)) {
      state.assistDraft.didacticTypeId = "";
    }
    state.assistDraft.attachments = normalizeAssistAttachmentList(state.assistDraft.attachments);
  }

  function applyCardContent({ title, text }) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    if (!microsequence) return;

    const card = state.selection.cardKey ? findCard(microsequence, state.selection.cardKey) : null;
    if (!card) return;

    try {
      const nextCard = buildCardUpdateFromText(card, title, text);
      const nextProject = editor.updateCard({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey: microsequence.key,
        cardKey: card.key,
        ...nextCard
      });

      setProject(nextProject);
    } catch {
      // Evita perder foco do editor em estados transitórios.
    }
  }

  function restoreCardVersion(versionKey) {
    if (!versionKey || versionKey === "current") {
      return;
    }

    const version = getCurrentCardHistory().find((item) => item.id === versionKey);
    if (!version) {
      return;
    }

    recordCurrentCardSnapshot("Antes de retomar", "manual");
    applyCardContent({
      title: version.title,
      text: version.text
    });
    state.assistDraft.lastRequest = {
      title: "Em uso",
      description: `Editor voltou para ${version.label.toLowerCase()}.`,
      timestamp: new Date().toISOString()
    };
    render({ preserveState: true });
  }

  function selectMicrosequenceCard(microsequenceKey, targetIndex = 0) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence) return;

    const cards = microsequence.cards || [];
    const safeIndex = Math.max(0, Math.min(targetIndex, Math.max(0, cards.length - 1)));
    const card = cards[safeIndex] || null;

    state.selection.microsequenceKey = microsequence.key;
    state.selection.cardIndex = safeIndex;
    state.selection.cardKey = card ? card.key : null;
    return microsequence;
  }

  function openMicrosequenceScreen(microsequenceKey, targetIndex = 0, mode = "play") {
    const microsequence = selectMicrosequenceCard(microsequenceKey, targetIndex);
    if (!microsequence) return;
    if (mode === "play" && !isRunnableMicrosequence(microsequence)) {
      openMicrosequenceAssistPage(microsequenceKey, targetIndex);
      return;
    }

    state.view = "microsequence";
    state.microsequenceMode = mode;
    ensureCurrentCardSnapshot();
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
  }

  function openMicrosequenceAssistPage(microsequenceKey, targetIndex = 0) {
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence) return;
    state.selection.microsequenceKey = microsequence.key;
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: microsequence.key
    };
    const entry = ensureMicrosequenceVersionEntry(reference, microsequence);
    const assistOpenState = resolveMicrosequenceAssistOpenState(entry, targetIndex);
    selectMicrosequenceCard(microsequenceKey, targetIndex);
    state.assistDraft.dependencyKeys = Array.isArray(microsequence.tags)
      ? microsequence.tags.slice(0, MAX_ASSIST_DEPENDENCIES)
      : [];

    state.view = "microsequence-assist";
    state.assistDraft.selectedMode = ASSIST_USER_MODES.EDIT_MICROSEQUENCE;
    state.assistDraft.activeWorkbenchPane = assistOpenState.activeWorkbenchPane;
    state.assistDraft.visualizedVersionId = assistOpenState.visualizedVersionId || "";
    state.assistDraft.editBaseVersionId = assistOpenState.editBaseVersionId || "";
    state.selection.cardIndex = assistOpenState.cardIndex;
    state.selection.cardKey =
      entry?.versions
        ?.find((item) => item.id === assistOpenState.visualizedVersionId)
        ?.cards?.[assistOpenState.cardIndex]?.key || state.selection.cardKey;
    state.assistDraft.attachments = [];
    state.assistDraft.didacticTypeId = "";
    state.microsequenceMode = "play";
    ensureCurrentCardSnapshot();
    syncAssistDraft();
    state.cardCommentOpen = false;
    state.entityEditor = null;
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: false });
  }

  function buildMicrosequenceVersionKey(reference = state.selection) {
    if (!reference?.courseKey || !reference?.moduleKey || !reference?.lessonKey || !reference?.microsequenceKey) {
      return "";
    }

    return [
      reference.courseKey,
      reference.moduleKey,
      reference.lessonKey,
      reference.microsequenceKey
    ].join("::");
  }

  function ensureMicrosequenceVersionEntry(reference = state.selection, microsequence = null) {
    const versionKey = buildMicrosequenceVersionKey(reference);
    if (!versionKey) {
      return null;
    }

    const currentMicrosequence =
      microsequence ||
      findMicrosequence(
        state.project,
        reference.courseKey,
        reference.moduleKey,
        reference.lessonKey,
        reference.microsequenceKey
      );
    if (!currentMicrosequence) {
      return null;
    }

    const currentEntry = state.microsequenceVersions[versionKey];
    if (currentEntry && Array.isArray(currentEntry.versions) && currentEntry.versions.length) {
      return currentEntry;
    }

    const initialVersion = createMicrosequenceVersionRecord(currentMicrosequence, {
      versionNumber: 1,
      label: "Snapshot 1",
      operationType: "snapshot"
    });
    state.microsequenceVersions[versionKey] = {
      activeVersionId: initialVersion.id,
      versions: [initialVersion]
    };
    saveMicrosequenceVersions();
    return state.microsequenceVersions[versionKey];
  }

  function getMicrosequenceVersionEntry(reference = state.selection) {
    const versionKey = buildMicrosequenceVersionKey(reference);
    if (!versionKey) {
      return null;
    }
    return state.microsequenceVersions[versionKey] || null;
  }

  function getActiveMicrosequenceVersion(reference = state.selection) {
    const entry = getMicrosequenceVersionEntry(reference);
    if (!entry) {
      return null;
    }

    return entry.versions.find((item) => item.id === entry.activeVersionId) || entry.versions[0] || null;
  }

  function getPendingGeneratedMicrosequenceVersion(reference = state.selection) {
    const activeVersion = getActiveMicrosequenceVersion(reference);
    return activeVersion && isGeneratedPendingOperation(activeVersion.operationType) ? activeVersion : null;
  }

  function getVisualizedMicrosequenceVersionId() {
    return String(state.assistDraft.visualizedVersionId || "").trim();
  }

  function getVisualizedMicrosequenceVersion(reference = state.selection) {
    const entry = getMicrosequenceVersionEntry(reference);
    if (!entry) {
      return null;
    }

    const visualizedVersionId = getVisualizedMicrosequenceVersionId();
    return visualizedVersionId ? entry.versions.find((item) => item.id === visualizedVersionId) || null : null;
  }

  function getMicrosequenceEditBaseVersionId() {
    return String(state.assistDraft.editBaseVersionId || "").trim();
  }

  function setMicrosequenceVersionViewState({
    visualizedVersionId = getVisualizedMicrosequenceVersionId(),
    editBaseVersionId = getMicrosequenceEditBaseVersionId()
  } = {}) {
    state.assistDraft.visualizedVersionId = String(visualizedVersionId || "").trim();
    state.assistDraft.editBaseVersionId = String(editBaseVersionId || state.assistDraft.visualizedVersionId || "").trim();
    state.assistDraft.versionActionsOpen = false;
  }

  function toggleMicrosequenceVersionMore() {
    state.assistDraft.versionActionsOpen = !state.assistDraft.versionActionsOpen;
    render({ preserveState: true });
  }

  function syncActiveMicrosequenceVersionFromProject(reference = state.selection) {
    return;
  }

  function applyMicrosequenceVersion(reference, version, targetCardIndex = 0) {
    if (!reference || !version) {
      return;
    }

    const nextProject = editor.replaceMicrosequenceCards({
      courseKey: reference.courseKey,
      moduleKey: reference.moduleKey,
      lessonKey: reference.lessonKey,
      microsequenceKey: reference.microsequenceKey,
      title: version.title || "Microssequência",
      description: version.description || "",
      tags: structuredClone(version.tags || []),
      status: version.status,
      included: version.included,
      cards: structuredClone(version.cards || [])
    });
    setProject(nextProject);

    const nextMicrosequence = findMicrosequence(
      nextProject,
      reference.courseKey,
      reference.moduleKey,
      reference.lessonKey,
      reference.microsequenceKey
    );
    const nextCards = nextMicrosequence?.cards || [];
    const safeIndex = Math.max(0, Math.min(targetCardIndex, Math.max(0, nextCards.length - 1)));
    const nextCard = nextCards[safeIndex] || null;
    applySelection({
      courseKey: reference.courseKey,
      moduleKey: reference.moduleKey,
      lessonKey: reference.lessonKey,
      microsequenceKey: reference.microsequenceKey,
      cardKey: nextCard?.key || null,
      cardIndex: safeIndex
    });
  }

  function createMicrosequenceVersionFromCurrentProject({
    parentVersionId = "",
    operationType = "snapshot",
    label = ""
  } = {}) {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const hadEntry = Boolean(getMicrosequenceVersionEntry(reference));
    const entry = getMicrosequenceVersionEntry(reference);
    const microsequence = findMicrosequence(
      state.project,
      reference.courseKey,
      reference.moduleKey,
      reference.lessonKey,
      reference.microsequenceKey
    );
    if (!entry || !microsequence) {
      return;
    }

    if (!hadEntry && (entry.versions || []).length === 1 && entry.versions[0]?.label === "Snapshot 1") {
      replaceActiveMicrosequenceVersion(entry, microsequence);
    } else {
      insertMicrosequenceVersionAfterActive(entry, microsequence, {
        label: label || `Snapshot ${entry.versions.length + 1}`,
        operationType,
        parentVersionId: String(parentVersionId || "").trim()
      });
    }
    saveMicrosequenceVersions();
    setMicrosequenceVersionViewState({
      visualizedVersionId: entry.activeVersionId,
      editBaseVersionId: entry.activeVersionId
    });
  }

  function ensureEditableMicrosequenceBranch({
    operationType = "snapshot",
    label = ""
  } = {}) {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const entry = getMicrosequenceVersionEntry(reference);
    const editBaseVersionId = getMicrosequenceEditBaseVersionId();
    if (!entry || !editBaseVersionId) {
      return null;
    }

    if (entry.activeVersionId === editBaseVersionId) {
      return entry.versions.find((item) => item.id === entry.activeVersionId) || null;
    }

    return null;
  }

  function selectMicrosequenceVersion(versionId, { preserveCardIndex = true } = {}) {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const entry = getMicrosequenceVersionEntry(reference);
    if (!entry) {
      return;
    }

    const version = entry.versions.find((item) => item.id === versionId);
    if (!version) {
      return;
    }

    setMicrosequenceVersionViewState({
      visualizedVersionId: version.id,
      editBaseVersionId: getMicrosequenceEditBaseVersionId()
    });
    const targetCardIndex = preserveCardIndex && Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0;
    const safeIndex = Math.max(0, Math.min(targetCardIndex, Math.max(0, (version.cards || []).length - 1)));
    state.selection.cardIndex = safeIndex;
    state.selection.cardKey = (version.cards || [])[safeIndex]?.key || null;
    state.assistDraft.versionActionsOpen = false;
    render({ preserveState: false });
  }

  function useMicrosequenceVersion(versionId) {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const entry = getMicrosequenceVersionEntry(reference);
    if (!entry) {
      return;
    }

    const version = entry.versions.find((item) => item.id === versionId);
    if (!version || version.id === entry.activeVersionId) {
      return;
    }

    setActiveMicrosequenceVersion(entry, version.id);
    saveMicrosequenceVersions();
    applyMicrosequenceVersion(reference, version, Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0);
    state.assistDraft.dependencyKeys = Array.isArray(version.tags) ? version.tags.slice(0, MAX_ASSIST_DEPENDENCIES) : [];
    setMicrosequenceVersionViewState({
      visualizedVersionId: version.id,
      editBaseVersionId: version.id
    });
    state.assistDraft.versionActionsOpen = false;
    render({ preserveState: false });
  }

  function editMicrosequenceFromVersion(versionId) {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const entry = getMicrosequenceVersionEntry(reference);
    if (!entry) {
      return;
    }

    const version = entry.versions.find((item) => item.id === versionId);
    if (!version) {
      return;
    }

    applyMicrosequenceVersion(reference, version, 0);
    state.assistDraft.dependencyKeys = Array.isArray(version.tags) ? version.tags.slice(0, MAX_ASSIST_DEPENDENCIES) : [];
    setMicrosequenceVersionViewState({
      visualizedVersionId: version.id,
      editBaseVersionId: version.id
    });
    state.assistDraft.activeWorkbenchPane = "edit";
    render({ preserveState: false });
  }

  function canDeleteMicrosequenceVersion(versionId) {
    const entry = getMicrosequenceVersionEntry();
    if (!entry || !Array.isArray(entry.versions) || entry.versions.length <= 1) {
      return false;
    }
    return Boolean(versionId);
  }

  function deleteMicrosequenceVersion(versionId) {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const entry = getMicrosequenceVersionEntry(reference);
    if (!entry || !canDeleteMicrosequenceVersion(versionId)) {
      return;
    }

    const fallbackVersion = removeMicrosequenceVersion(entry, versionId);
    if (!fallbackVersion) {
      return;
    }

    saveMicrosequenceVersions();
    const nextVisualized =
      getVisualizedMicrosequenceVersionId() === versionId
        ? fallbackVersion.id
        : getVisualizedMicrosequenceVersionId();
    setMicrosequenceVersionViewState({
      visualizedVersionId: nextVisualized,
      editBaseVersionId:
        getMicrosequenceEditBaseVersionId() === versionId ? fallbackVersion.id : getMicrosequenceEditBaseVersionId()
    });
    state.assistDraft.versionActionsOpen = false;
    render({ preserveState: true });
  }

  function stepMicrosequenceVersion(delta) {
    const entry = getMicrosequenceVersionEntry();
    if (!entry || !Array.isArray(entry.versions) || entry.versions.length <= 1) {
      return;
    }

    const visualizedVersionId = getVisualizedMicrosequenceVersionId();
    const currentIndex = Math.max(0, entry.versions.findIndex((item) => item.id === visualizedVersionId));
    const nextIndex = Math.max(0, Math.min(currentIndex + delta, entry.versions.length - 1));
    const nextVersion = entry.versions[nextIndex];
    if (!nextVersion || nextVersion.id === visualizedVersionId) {
      return;
    }

    selectMicrosequenceVersion(nextVersion.id);
  }

  function restoreMicrosequenceProjectToActiveVersion() {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const entry = getMicrosequenceVersionEntry(reference);
    if (!entry) {
      return;
    }

    const activeVersion = entry.versions.find((item) => item.id === entry.activeVersionId);
    if (!activeVersion) {
      return;
    }

    applyMicrosequenceVersion(reference, activeVersion, Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0);
    state.assistDraft.dependencyKeys = Array.isArray(activeVersion.tags) ? activeVersion.tags.slice(0, MAX_ASSIST_DEPENDENCIES) : [];
    setMicrosequenceVersionViewState({
      visualizedVersionId: activeVersion.id,
      editBaseVersionId: activeVersion.id
    });
  }

  function openCardByIndex(targetIndex) {
    const lesson = findLesson(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey
    );
    if (!lesson) return;

    if (state.view === "microsequence" && state.microsequenceMode === "play") {
      const lessonCards = collectLessonCards(lesson);
      const currentIndex = Math.max(
        0,
        lessonCards.findIndex((entry) => entry.cardKey === state.selection.cardKey)
      );
      const safeIndex = Math.max(0, Math.min(targetIndex, Math.max(0, lessonCards.length - 1)));
      const entry = lessonCards[safeIndex] || lessonCards[currentIndex] || null;
      if (!entry) return;
      state.selection.microsequenceKey = entry.microsequenceKey;
      state.selection.cardKey = entry.cardKey;
      state.selection.cardIndex = entry.cardIndex;
      persistLessonProgress(
        getLessonProgressReference(state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey),
        lessonCards,
        safeIndex
      );
    } else {
      const cards =
        state.view === "microsequence-assist"
          ? getVisualizedMicrosequenceVersion()?.cards || []
          : findMicrosequence(
              state.project,
              state.selection.courseKey,
              state.selection.moduleKey,
              state.selection.lessonKey,
              state.selection.microsequenceKey
            )?.cards || [];
      const safeIndex = Math.max(0, Math.min(targetIndex, Math.max(0, cards.length - 1)));
      const card = cards[safeIndex] || null;
      state.selection.cardIndex = safeIndex;
      state.selection.cardKey = card ? card.key : null;
    }

    state.assistDraft.activeWorkbenchPane = resolveWorkbenchPaneAfterCardSelection(
      state.view,
      state.assistDraft.activeWorkbenchPane
    );

    ensureCurrentCardSnapshot();
    syncAssistDraft();
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    state.cardExerciseLoadVersion += 1;
    render({ preserveState: true });
  }

  function closeContinuePopup({ rerender = true } = {}) {
    if (!state.continuePopup) {
      return;
    }
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    if (rerender) {
      render({ preserveState: true });
    }
  }

  function queueExerciseFocus(selector, { caretToEnd = false } = {}) {
    if (!selector) {
      state.pendingExerciseFocus = null;
      return;
    }
    state.pendingExerciseFocus = { selector, caretToEnd };
  }

  function syncPendingExerciseFocus() {
    const target = state.pendingExerciseFocus;
    if (!target?.selector) {
      return;
    }

    const node = root.querySelector(target.selector);
    if (!node || typeof node.focus !== "function") {
      return;
    }

    state.pendingExerciseFocus = null;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      node.focus();
      if (
        target.caretToEnd &&
        "value" in node &&
        typeof node.setSelectionRange === "function"
      ) {
        const size = String(node.value || "").length;
        node.setSelectionRange(size, size);
      }
    });
  }

  function findFirstIncompleteFlowchartTarget(projection, exerciseState) {
    const exercise = createFlowchartExerciseState(projection, exerciseState);
    const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
    const links = Array.isArray(projection?.links) ? projection.links : [];

    for (const node of nodes) {
      if (!node?.id) continue;

      if (node.shapeBlank) {
        const currentShape = String(exercise.shapes?.[node.id] || "").trim();
        if (!currentShape) {
          return { kind: "shape", targetId: node.id, focusMode: "prompt" };
        }
      }

      if (node.textBlank) {
        const currentText = String(exercise.texts?.[node.id] || "").trim();
        if (!currentText) {
          return {
            kind: "text",
            targetId: node.id,
            focusMode: flowchartNodeUsesTextChoiceBlank(node) ? "prompt" : "input"
          };
        }
      }
    }

    for (const link of links) {
      if (!link?.id || !link.labelBlank) continue;
      const currentLabel = String(exercise.labels?.[link.id] || "").trim();
      if (!currentLabel) {
        return {
          kind: "label",
          targetId: link.id,
          focusMode: flowchartLinkUsesLabelChoiceBlank(link) ? "prompt" : "input"
        };
      }
    }

    return null;
  }

  function focusFirstIncompleteFlowchartTarget(blockKey, projection, exerciseState) {
    const target = findFirstIncompleteFlowchartTarget(projection, exerciseState);
    if (!target) {
      return false;
    }

    if (target.focusMode === "prompt") {
      state.activeFlowchartPrompt = {
        blockKey,
        kind: target.kind,
        targetId: target.targetId
      };
      queueExerciseFocus(
        "[data-flowchart-prompt='true'] .runtime-flow-shape-option, [data-flowchart-prompt='true'] .token-option"
      );
      return true;
    }

    state.activeFlowchartPrompt = null;
    queueExerciseFocus(
      "[data-flowchart-inline-input='true'][data-flowchart-block-key=\"" +
        blockKey +
        "\"][data-flowchart-choice-kind=\"" +
        target.kind +
        "\"][data-flowchart-target-id=\"" +
        target.targetId +
        "\"]",
      { caretToEnd: true }
    );
    return true;
  }

  function focusFirstIncompleteChoice(blockKey) {
    queueExerciseFocus(
      "[data-action=\"choice-toggle\"][data-choice-block-key=\"" + blockKey + "\"]"
    );
    return true;
  }

  function focusFirstIncompleteTextGap(blockKey) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return false;
    }

    const exercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const values = Array.isArray(exercise.values) ? exercise.values : [];
    const parts = listTextGapPartsForBlock(entry.block);
    const firstMissing = parts.find((part) => !String(values[part.index] ?? "").trim());
    if (!firstMissing) {
      return false;
    }

    if (Array.isArray(firstMissing.options) && firstMissing.options.length) {
      state.activeTextGapPrompt = {
        blockKey,
        blankIndex: Number(firstMissing.index)
      };
      queueExerciseFocus("[data-text-gap-prompt='true'] .token-option");
      return true;
    }

    state.activeTextGapPrompt = null;
    queueExerciseFocus(
      "[data-text-gap-field='true'][data-complete-block-key=\"" +
        blockKey +
        "\"][data-complete-blank-index=\"" +
        firstMissing.index +
        "\"]"
    );
    return true;
  }

  function focusFirstIncompleteDirectoryTree(blockKey) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return false;
    }

    const practice = normalizeDirectoryTreePractice(entry.block?.practice);
    const current = state.directoryTreeUiByBlockKey[blockKey];
    if (!current) {
      return false;
    }

    if (practice.mode === "select" || practice.mode === "delete" || !current.hasInteracted) {
      queueExerciseFocus(
        "[data-action=\"directory-tree-select-node\"][data-directory-tree-block-key=\"" + blockKey + "\"]"
      );
      return true;
    }

    if (practice.typePrompt?.expected && !String(current.typeValue || "").trim()) {
      queueExerciseFocus(
        "[data-action=\"directory-tree-set-type\"][data-directory-tree-block-key=\"" + blockKey + "\"]"
      );
      return true;
    }

    const parts = parseTextGapParts(practice.nameTemplate || "");
    const values = Array.isArray(current.nameValues) ? current.nameValues : [];
    const firstMissing = parts.find((part) => {
      if (part.kind !== "blank") {
        return false;
      }
      return !String(values[part.index] ?? "").trim();
    });

    if (!firstMissing) {
      queueExerciseFocus(
        "[data-action=\"directory-tree-select-node\"][data-directory-tree-block-key=\"" + blockKey + "\"]"
      );
      return true;
    }

    if (Array.isArray(firstMissing.options) && firstMissing.options.length) {
      queueExerciseFocus(
        "[data-action=\"directory-tree-name-set-choice\"][data-directory-tree-block-key=\"" +
          blockKey +
          "\"][data-directory-tree-blank-index=\"" +
          firstMissing.index +
          "\"]"
      );
      return true;
    }

    queueExerciseFocus(
      "[data-action=\"directory-tree-name-input\"][data-directory-tree-block-key=\"" +
        blockKey +
        "\"][data-directory-tree-blank-index=\"" +
        firstMissing.index +
        "\"]",
      { caretToEnd: true }
    );
    return true;
  }

  function stepCard(delta) {
    // No modo de estudo, o card só pode avançar quando os exercícios do card atual
    // estiverem completos e validados como corretos.
    if (delta > 0) {
      const flowcharts = getCurrentCardRuntimeFlowcharts();
      for (const entry of flowcharts) {
        const projection = entry?.block?.projection;
        if (!projection || !flowchartProjectionHasPractice(projection)) continue;
        const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
        state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
        // Só bloqueia avanço quando há exercício e ele não está correto.
        if (result.status !== "correct") {
          if (result.status === "incomplete") {
            notifyIncompleteExercise("Preencha todas as lacunas do fluxograma.");
            focusFirstIncompleteFlowchartTarget(entry.blockKey, projection, result.state);
          }
          render({ preserveState: true });
          return;
        }
      }

      const choices = getCurrentCardRuntimeChoiceBlocks();
      for (const entry of choices) {
        const exercise = state.choiceExerciseByBlockKey[entry.blockKey] || { selected: [], feedback: null };
        if (exercise.feedback !== "correct") {
          // Força feedback para impedir avanço silencioso.
          const status = validateChoice(entry.blockKey);
          if (status !== "correct") {
            return;
          }
        }
      }

      const completes = getCurrentCardRuntimeCompleteBlocks();
      for (const entry of completes) {
        const exercise = state.completeExerciseByBlockKey[entry.blockKey] || { values: [], feedback: null };
        if (exercise.feedback !== "correct") {
          const status = validateComplete(entry.blockKey);
          if (status !== "correct") {
            return;
          }
        }
      }

      const trees = getCurrentCardRuntimeDirectoryTrees();
      for (const entry of trees) {
        const exercise = state.directoryTreeUiByBlockKey[entry.blockKey] || { feedback: null };
        if (normalizeDirectoryTreePractice(entry.block?.practice).mode !== "none" && exercise.feedback !== "correct") {
          const status = validateDirectoryTree(entry.blockKey);
          if (status !== "correct") {
            return;
          }
        }
      }

      const popupEntry = getCurrentPopupRuntimeButtonEntry();
      const popupIsOpen =
        !!popupEntry &&
        !!state.continuePopup &&
        state.continuePopup.cardPathKey === buildCardPathKey(state.selection) &&
        state.continuePopup.blockKey === popupEntry.blockKey;

      if (popupEntry && !popupIsOpen) {
        state.continuePopup = {
          cardPathKey: buildCardPathKey(state.selection),
          blockKey: popupEntry.blockKey
        };
        state.activeFlowchartPrompt = null;
        state.activeTextGapPrompt = null;
        render({ preserveState: true });
        return;
      }

      if (popupIsOpen) {
        const popupFlowcharts = getCurrentPopupRuntimeFlowcharts();
        for (const entry of popupFlowcharts) {
          const projection = entry?.block?.projection;
          if (!projection || !flowchartProjectionHasPractice(projection)) continue;
          const result = validateFlowchartExerciseState(projection, state.flowchartPracticeByBlockKey[entry.blockKey]);
          state.flowchartPracticeByBlockKey[entry.blockKey] = result.state;
          if (result.status !== "correct") {
            if (result.status === "incomplete") {
              notifyIncompleteExercise("Preencha todas as lacunas do fluxograma.");
              focusFirstIncompleteFlowchartTarget(entry.blockKey, projection, result.state);
            }
            render({ preserveState: true });
            return;
          }
        }

        const popupChoices = getCurrentPopupRuntimeChoiceBlocks();
        for (const entry of popupChoices) {
          const exercise = state.choiceExerciseByBlockKey[entry.blockKey] || { selected: [], feedback: null };
          if (exercise.feedback !== "correct") {
            const status = validateChoice(entry.blockKey);
            if (status !== "correct") {
              return;
            }
          }
        }

        const popupCompletes = getCurrentPopupRuntimeCompleteBlocks();
        for (const entry of popupCompletes) {
          const exercise = state.completeExerciseByBlockKey[entry.blockKey] || { values: [], feedback: null };
          if (exercise.feedback !== "correct") {
            const status = validateComplete(entry.blockKey);
            if (status !== "correct") {
              return;
            }
          }
        }

        const popupTrees = getCurrentPopupRuntimeDirectoryTrees();
        for (const entry of popupTrees) {
          const exercise = state.directoryTreeUiByBlockKey[entry.blockKey] || { feedback: null };
          if (normalizeDirectoryTreePractice(entry.block?.practice).mode !== "none" && exercise.feedback !== "correct") {
            const status = validateDirectoryTree(entry.blockKey);
            if (status !== "correct") {
              return;
            }
          }
        }

        closeContinuePopup({ rerender: false });
      }
    }

    const lesson = findLesson(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey
    );
    if (!lesson) return;

    if (state.view === "microsequence" && state.microsequenceMode === "play") {
      const lessonCards = collectLessonCards(lesson);
      const currentIndex = Math.max(
        0,
        lessonCards.findIndex((entry) => entry.cardKey === state.selection.cardKey)
      );
      if (delta > 0 && currentIndex >= lessonCards.length - 1) {
        goBack();
        return;
      }
      openCardByIndex(currentIndex + delta);
      return;
    }

    openCardByIndex((Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0) + delta);
  }

  function openCardComment() {
    const pathKey = buildCardPathKey(state.selection);
    state.cardCommentDraft = typeof state.cardComments[pathKey] === "string" ? state.cardComments[pathKey] : "";
    state.cardCommentOpen = true;
    state.versionHistoryOpen = false;
    state.entityEditor = null;
    render({ preserveState: true });
  }

  function closeCardComment() {
    state.cardCommentOpen = false;
    render({ preserveState: true });
  }

  function saveCardComment() {
    const pathKey = buildCardPathKey(state.selection);
    const nextValue = state.cardCommentDraft.trim();

    if (nextValue) {
    state.cardComments[pathKey] = state.cardCommentDraft;
    } else {
      delete state.cardComments[pathKey];
    }

    writeCommentStorage(state.cardComments);
    state.cardCommentOpen = false;
    render({ preserveState: true });
  }

  function openEntityEditor(kind, target = {}) {
    state.entityEditor = {
      kind,
      courseKey: target.courseKey || state.selection.courseKey,
      moduleKey: target.moduleKey || state.selection.moduleKey,
      lessonKey: target.lessonKey || state.selection.lessonKey,
      microsequenceKey: target.microsequenceKey || state.selection.microsequenceKey,
      cardKey: target.cardKey || state.selection.cardKey
    };
    state.cardCommentOpen = false;
    state.versionHistoryOpen = false;
    state.versionCompareOpen = false;
    state.assistConfigOpen = false;
    state.codexCliSetupOpen = false;
    render({ preserveState: true });
  }

  function selectVersionHistoryItem(versionKey) {
    if (!versionKey) {
      return;
    }

    state.versionHistorySelectionKey = versionKey;
    render({ preserveState: true });
  }

  function toggleVersionHistoryMore(versionKey) {
    state.versionHistoryExpandedMoreKey = state.versionHistoryExpandedMoreKey === versionKey ? "" : String(versionKey || "");
    render({ preserveState: true });
  }

  function useStructureVersion(versionKey) {
    const reference = getCurrentStructureVersionReference();
    const entry = getStructureVersionEntry(reference);
    if (!reference || !entry || !versionKey || versionKey === entry.activeVersionId) {
      return;
    }

    const version = setActiveStructureVersion(entry, versionKey);
    if (!version?.snapshot) {
      return;
    }

    const nextProject = applyStructureVersionSnapshot(state.projectHead, reference, version.snapshot);
    setProject(nextProject, { updateHead: false });
    applySelectionByKeys(nextProject, state.selection);
    syncAssistDraft();
    state.versionHistorySelectionKey = version.id;
    render({
      preserveState: true,
      preserveScrollSelectors: [
        ".screen-content",
        ".editor-sheet",
        ".editor-step-strip",
        ".workbench-editor-panel",
        ".assist-prompt",
        ".card-sheet-content",
        ".dependency-strip",
        ".dependency-chip-row"
      ],
      preserveFocus: false
    });
  }

  function deleteStructureVersion(versionKey) {
    const reference = getCurrentStructureVersionReference();
    const entry = getStructureVersionEntry(reference);
    if (!reference || !entry || !versionKey || (entry.versions || []).length <= 1) {
      return;
    }

    const removed = removeStructureVersion(entry, versionKey);
    if (!removed) {
      return;
    }

    saveStructureVersions();
    state.versionHistorySelectionKey = entry.activeVersionId || "";
    render({ preserveState: true });
  }

  function selectStructureVersionTab(versionKey, { centerActiveTab = true } = {}) {
    state.centerActiveStructureVersionTabOnRender = centerActiveTab;
    useStructureVersion(versionKey);
  }

  function closeEntityEditor() {
    state.entityEditor = null;
    render({ preserveState: true });
  }

  function parseEntityTagComboboxValues(node) {
    if (!node) return [];
    try {
      const parsed = JSON.parse(String(node.getAttribute("data-values") || "[]"));
      return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function readEntityFieldValue(node) {
    if (!node) return "";
    if (node instanceof HTMLSelectElement && node.multiple) {
      return Array.from(node.selectedOptions).map((option) => option.value);
    }
    if (node instanceof HTMLElement && node.classList.contains("entity-tag-combobox")) {
      return parseEntityTagComboboxValues(node);
    }
    return node.value;
  }

  function setEntityTagComboboxValues(node, nextValues) {
    if (!(node instanceof HTMLElement) || !node.classList.contains("entity-tag-combobox")) {
      return;
    }

    const selectedRow = node.querySelector("[data-role='selected-tags']");
    const input = node.querySelector("[data-role='tag-input']");
    const allowCustom = node.getAttribute("data-allow-custom") === "true";
    let options = [];
    try {
      const parsed = JSON.parse(String(node.getAttribute("data-options") || "[]"));
      options = Array.isArray(parsed) ? parsed : [];
    } catch {
      options = [];
    }

    const findOption = (rawValue) => {
      const value = String(rawValue || "").trim().toLowerCase();
      if (!value) return null;
      return (
        options.find((option) => String(option?.id || "").trim().toLowerCase() === value) ||
        options.find((option) => String(option?.label || "").trim().toLowerCase() === value) ||
        null
      );
    };

    const seen = new Set();
    const normalized = (Array.isArray(nextValues) ? nextValues : [])
      .map((item) => String(item || "").trim())
      .filter((item) => {
        if (!item) return false;
        const option = findOption(item);
        if (!allowCustom && !option) {
          return false;
        }
        const finalValue = option ? String(option.id) : item;
        const key = finalValue.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => {
        const option = findOption(item);
        return option ? String(option.id) : item;
      });

    node.setAttribute("data-values", JSON.stringify(normalized));
    if (selectedRow) {
      selectedRow.innerHTML = normalized
        .map((item) => {
          const option = findOption(item);
          const value = String(option?.id || item);
          const label = String(option?.label || item);
          return (
            '<button class="didactic-tag dependency-tag-chip dependency-chip-button entity-tag-chip" type="button" data-action="remove-entity-tag" data-value="' +
            value
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;") +
            '">' +
            '<span class="didactic-tag-text dependency-chip-label">' +
            label
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;") +
            "</span>" +
            '<span class="dependency-chip-remove" aria-hidden="true">&times;</span>' +
            "</button>"
          );
        })
        .join("");
    }
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  }

  function setEntityFieldValue(node, value) {
    if (!node) return;
    if (node instanceof HTMLSelectElement) {
      node.value = String(value || "");
      return;
    }
    if (node instanceof HTMLElement && node.classList.contains("entity-tag-combobox")) {
      setEntityTagComboboxValues(node, value);
      return;
    }
    if ("value" in node) {
      node.value = value;
    }
  }

  function bindEntityTagCombobox(node, handler) {
    if (!(node instanceof HTMLElement) || node.getAttribute("data-bind-ready") === "true") {
      return;
    }

    node.setAttribute("data-bind-ready", "true");
    const input = node.querySelector("[data-role='tag-input']");
    const selectedRow = node.querySelector("[data-role='selected-tags']");
    const allowCustom = node.getAttribute("data-allow-custom") === "true";
    let options = [];
    try {
      const parsed = JSON.parse(String(node.getAttribute("data-options") || "[]"));
      options = Array.isArray(parsed) ? parsed : [];
    } catch {
      options = [];
    }

    const findOption = (rawValue) => {
      const value = String(rawValue || "").trim().toLowerCase();
      if (!value) return null;
      return (
        options.find((option) => String(option?.id || "").trim().toLowerCase() === value) ||
        options.find((option) => String(option?.label || "").trim().toLowerCase() === value) ||
        null
      );
    };

    const setValues = (nextValues) => {
      setEntityTagComboboxValues(node, nextValues);
      handler();
    };

    const addCurrentInput = () => {
      if (!(input instanceof HTMLInputElement)) return;
      const rawValue = input.value.trim();
      if (!rawValue) return;
      const option = findOption(rawValue);
      if (!allowCustom && !option) {
        input.value = "";
        return;
      }
      const values = parseEntityTagComboboxValues(node);
      values.push(option ? String(option.id) : rawValue);
      input.value = "";
      setValues(values);
    };

    if (input instanceof HTMLInputElement) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === "," || event.key === ";") {
          event.preventDefault();
          addCurrentInput();
        }
        if (event.key === "Backspace" && !input.value.trim()) {
          const values = parseEntityTagComboboxValues(node);
          if (values.length) {
            values.pop();
            setValues(values);
          }
        }
      });
      input.addEventListener("change", addCurrentInput);
      input.addEventListener("blur", addCurrentInput);
    }

    node.querySelector("[data-action='add-entity-tag']")?.addEventListener("click", () => {
      addCurrentInput();
      input?.focus();
    });

    node.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-action='remove-entity-tag']") : null;
      if (!target) return;
      event.preventDefault();
      const value = String(target.getAttribute("data-value") || "").trim().toLowerCase();
      setValues(parseEntityTagComboboxValues(node).filter((item) => String(item).trim().toLowerCase() !== value));
      input?.focus();
    });
  }

  function bindEntityFieldNode(node, handler) {
    if (node instanceof HTMLElement && node.classList.contains("entity-tag-combobox")) {
      bindEntityTagCombobox(node, handler);
      return;
    }
    node.addEventListener("input", handler);
    if (node instanceof HTMLSelectElement) {
      node.addEventListener("change", handler);
    }
  }

  function openVersionHistory() {
    const structureReference = getCurrentStructureVersionReference();
    state.versionHistoryOpen = true;
    state.versionCompareOpen = false;
    state.versionCompareSelectionKey = "";
    state.versionHistoryExpandedMoreKey = "";
    state.cardCommentOpen = false;
    state.assistConfigOpen = false;
    state.codexCliSetupOpen = false;
    state.entityEditor = null;
    if (structureReference) {
      state.versionHistorySelectionKey = getStructureVersionEntry(structureReference)?.activeVersionId || "";
    } else if (state.view === "microsequence-assist") {
      state.versionHistorySelectionKey = getMicrosequenceVersionEntry()?.activeVersionId || "";
    } else {
      const currentHistory = getCurrentCardHistory();
      state.versionHistorySelectionKey = currentHistory[0]?.id || "";
    }
    render({ preserveState: true });
  }

  function closeVersionHistory() {
    state.versionHistoryOpen = false;
    state.versionHistorySelectionKey = "";
    state.versionHistoryExpandedMoreKey = "";
    render({ preserveState: true });
  }

  function openVersionCompare() {
    const structureReference = getCurrentStructureVersionReference();
    const comparison = structureReference
      ? buildStructureVersionComparisonForVersion({
        entry: getStructureVersionEntry(structureReference),
        versionId: state.versionCompareSelectionKey || getSelectedStructureVersionId()
      })
      : buildMicrosequenceVersionComparisonForVersion({
        versions: getMicrosequenceVersionEntry()?.versions || [],
        versionId: state.versionCompareSelectionKey || getVisualizedMicrosequenceVersionId(),
        cardIndex: Number.isInteger(state.selection?.cardIndex) ? state.selection.cardIndex : 0
      });
    if (!comparison) {
      return;
    }

    state.versionCompareOpen = true;
    state.versionHistoryOpen = false;
    state.versionCompareTab = "summary";
    state.versionCompareFocusTarget = null;
    state.cardCommentOpen = false;
    state.assistConfigOpen = false;
    state.codexCliSetupOpen = false;
    state.entityEditor = null;
    render({ preserveState: true });
  }

  function saveCurrentStructureSnapshot() {
    const reference = getCurrentStructureVersionReference();
    if (!reference) {
      return;
    }

    const entry = createStructureSnapshot(state.structureVersions, {
      project: state.project,
      reference
    });
    if (!entry) {
      return;
    }

    saveStructureVersions();
    state.versionHistorySelectionKey = entry.activeVersionId || "";
    render({ preserveState: true });
  }

  function saveCurrentMicrosequenceSnapshot() {
    createMicrosequenceVersionFromCurrentProject({
      operationType: "snapshot"
    });
    render({ preserveState: true });
  }

  function saveCurrentSnapshotFromHistory() {
    if (state.view === "microsequence-assist") {
      saveCurrentMicrosequenceSnapshot();
      return;
    }

    saveCurrentStructureSnapshot();
  }

  function closeVersionCompare() {
    state.versionCompareOpen = false;
    state.versionCompareSelectionKey = "";
    state.versionCompareTab = "summary";
    state.versionCompareFocusTarget = null;
    render({ preserveState: true });
  }

  function selectVersionCompareTab(tabId) {
    const safeTab = tabId === "previous" || tabId === "current" ? tabId : "summary";
    state.versionCompareTab = safeTab;
    render({ preserveState: true });
  }

  function openVersionCompareTarget(target, tab = "current") {
    if (!target || typeof target !== "object") {
      return;
    }

    state.versionCompareFocusTarget = structuredClone(target);
    state.versionCompareTab = tab === "previous" ? "previous" : "current";
    render({ preserveState: true });
  }

  function backToVersionCompareSummary() {
    state.versionCompareFocusTarget = null;
    state.versionCompareTab = "summary";
    render({ preserveState: true });
  }

  function useVersionCompareSide(side) {
    const structureReference = getCurrentStructureVersionReference();
    const comparison = structureReference
      ? buildStructureVersionComparisonForVersion({
        entry: getStructureVersionEntry(structureReference),
        versionId: state.versionCompareSelectionKey || getSelectedStructureVersionId()
      })
      : buildMicrosequenceVersionComparisonForVersion({
        versions: getMicrosequenceVersionEntry()?.versions || [],
        versionId: state.versionCompareSelectionKey || getVisualizedMicrosequenceVersionId(),
        cardIndex: Number.isInteger(state.selection?.cardIndex) ? state.selection.cardIndex : 0
      });
    if (!comparison) {
      return;
    }

    const versionId = side === "previous" ? comparison.previousVersion?.id : comparison.currentVersion?.id;
    if (!versionId) {
      return;
    }

    if (structureReference) {
      useStructureVersion(versionId);
    } else {
      useMicrosequenceVersion(versionId);
    }

    closeVersionCompare();
  }

  function notifyUser(message) {
    if (typeof globalThis.alert === "function") {
      globalThis.alert(message);
    }
  }

  function notifyIncompleteExercise(message) {
    void message;
  }

  function encodeBase64Utf8(value) {
    const text = String(value ?? "");
    if (typeof TextEncoder !== "undefined") {
      const bytes = new TextEncoder().encode(text);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return globalThis.btoa(binary);
    }
    return globalThis.btoa(unescape(encodeURIComponent(text)));
  }

  function downloadJsonFile(filename, content) {
    if (
      globalThis.AndroidHost &&
      typeof globalThis.AndroidHost.saveExportFile === "function" &&
      typeof globalThis.btoa === "function"
    ) {
      try {
        const saved = globalThis.AndroidHost.saveExportFile(
          encodeBase64Utf8(content),
          filename,
          "application/json"
        );
        if (saved) return;
      } catch (error) {
        console.warn("Falha ao exportar pelo host Android.", error);
      }
    }

    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
      fail("Exportação indisponível neste ambiente.");
    }

    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function pickJsonFile() {
    if (typeof document === "undefined") {
      return Promise.reject(new Error("Importação indisponível neste ambiente."));
    }

    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.style.display = "none";

      const cleanup = () => {
        input.remove();
      };

      input.addEventListener(
        "change",
        async () => {
          try {
            const [file] = Array.from(input.files || []);
            cleanup();
            if (!file) {
              resolve(null);
              return;
            }
            resolve(await file.text());
          } catch (error) {
            cleanup();
            reject(error);
          }
        },
        { once: true }
      );
      input.addEventListener(
        "cancel",
        () => {
          cleanup();
          resolve(null);
        },
        { once: true }
      );

      document.body.appendChild(input);
      input.click();
    });
  }

  function selectImportedCourse(nextProject) {
    setProject(nextProject);

    const importedCourse = nextProject.courses[nextProject.courses.length - 1];
    const moduleValue = importedCourse?.modules?.[0] || null;
    const lesson = moduleValue?.lessons?.[0] || null;
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;

    if (importedCourse && moduleValue && lesson && microsequence && card) {
      applySelection({
        courseKey: importedCourse.key,
        moduleKey: moduleValue.key,
        lessonKey: lesson.key,
        microsequenceKey: microsequence.key,
        cardKey: card.key,
        cardIndex: 0
      });
    } else {
      selectFirstPath(nextProject);
    }
  }

  function clearPendingExternalImport({ preserveState = true } = {}) {
    state.pendingExternalImport = null;
    render({ preserveState });
  }

  function applyStorageImport(rawJson) {
    const imported = storage.importJson(rawJson);
    setProject(imported.project);
    selectFirstPath(imported.project);
    state.view = "courses";
    state.continuePopup = null;
    state.activeFlowchartPrompt = null;
    state.activeTextGapPrompt = null;
    notifyUser("Backup restaurado.");
  }

  function applyJsonImportFromParsed(parsed, rawJson, { reviewed = false } = {}) {
    const format = detectJsonExchangeFormat(parsed);

    if (format === "contract") {
      const nextProject = structuralEditor.importCourses({ document: parsed });
      selectImportedCourse(nextProject);
      notifyUser("Curso importado.");
      return;
    }

    if (!reviewed && typeof globalThis.confirm === "function") {
      const accepted = globalThis.confirm("Backup completo detectado. Restaurar projeto e progresso atuais?");
      if (!accepted) {
        return;
      }
    }

    applyStorageImport(rawJson);
  }

  function receiveExternalJsonImport(rawText, { sourceName = "Compartilhamento Android" } = {}) {
    try {
      const prepared = handleExternalJsonImportText(rawText, { sourceName });
      state.pendingExternalImport = {
        rawText: prepared.rawText,
        parsed: prepared.parsed,
        detectedFormat: prepared.detectedFormat,
        sourceName: prepared.sourceName,
        error: ""
      };
    } catch (error) {
      state.pendingExternalImport = {
        rawText: typeof rawText === "string" ? rawText : "",
        parsed: null,
        detectedFormat: "",
        sourceName: String(sourceName || "Compartilhamento Android").trim() || "Compartilhamento Android",
        error: error instanceof Error ? error.message : "Falha ao receber o conteúdo compartilhado."
      };
    }

    state.assistConfigOpen = false;
    state.codexCliSetupOpen = false;
    state.generationPanelOpen = false;
    state.versionHistoryOpen = false;
    state.versionCompareOpen = false;
    state.cardCommentOpen = false;
    state.entityEditor = null;
    render({ preserveState: true });
    return true;
  }

  function confirmPendingExternalImport() {
    const pendingImport = state.pendingExternalImport;
    if (!pendingImport || pendingImport.error) {
      return;
    }

    try {
      applyJsonImportFromParsed(pendingImport.parsed, pendingImport.rawText, { reviewed: true });
      state.pendingExternalImport = null;
      render({ preserveState: false });
    } catch (error) {
      state.pendingExternalImport = {
        ...pendingImport,
        error: error instanceof Error ? error.message : "Falha ao importar o conteúdo recebido."
      };
      render({ preserveState: true });
    }
  }

  async function importJsonFromFile() {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      fail("JSON inválido.");
    }
    applyJsonImportFromParsed(parsed, rawJson, { reviewed: false });
  }

  function parseContractDocument(rawJson, scopeLabel) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      fail("JSON inválido.");
    }
    const format = detectJsonExchangeFormat(parsed);
    if (format !== "contract") {
      fail(`Arquivo incompatível para ${scopeLabel}. Use um JSON do AraLearn exportado no nível correto.`);
    }
    return parsed;
  }

  async function importModuleFromFile(courseKey) {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    const nextProject = structuralEditor.importModules({
      courseKey,
      document: parseContractDocument(rawJson, "importar módulo")
    });
    setProject(nextProject);
    const course = findCourse(nextProject, courseKey);
    const moduleValue = course.modules[course.modules.length - 1];
    const lesson = moduleValue?.lessons?.[0] || null;
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey,
      moduleKey: moduleValue?.key || null,
      lessonKey: lesson?.key || null,
      microsequenceKey: microsequence?.key || null,
      cardKey: card?.key || null,
      cardIndex: 0
    });
    state.view = "course";
    notifyUser("Módulo importado.");
  }

  async function importLessonFromFile(courseKey, moduleKey) {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    const nextProject = structuralEditor.importLessons({
      courseKey,
      moduleKey,
      document: parseContractDocument(rawJson, "importar lição")
    });
    setProject(nextProject);
    const moduleValue = findModule(nextProject, courseKey, moduleKey);
    const lesson = moduleValue.lessons[moduleValue.lessons.length - 1];
    const microsequence = lesson?.microsequences?.[0] || null;
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey,
      moduleKey,
      lessonKey: lesson?.key || null,
      microsequenceKey: microsequence?.key || null,
      cardKey: card?.key || null,
      cardIndex: 0
    });
    state.view = "lesson";
    notifyUser("Lição importada.");
  }

  async function importMicrosequenceFromFile(courseKey, moduleKey, lessonKey) {
    const rawJson = await pickJsonFile();
    if (!rawJson) {
      return;
    }

    const nextProject = editor.importMicrosequences({
      courseKey,
      moduleKey,
      lessonKey,
      document: parseContractDocument(rawJson, "importar microssequência")
    });
    setProject(nextProject);
    const lesson = findLesson(nextProject, courseKey, moduleKey, lessonKey);
    const microsequence = lesson.microsequences[lesson.microsequences.length - 1];
    const card = microsequence?.cards?.[0] || null;
    applySelection({
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey: microsequence?.key || null,
      cardKey: card?.key || null,
      cardIndex: 0
    });
    state.view = "lesson";
    notifyUser("Microssequência importada.");
  }

  function exportCourseAsJson(courseKey) {
    const course = findCourse(state.project, courseKey);
    const exportedDocument = structuralEditor.exportCourseDocument({ courseKey });
    downloadJsonFile(
      `${slugifyDownloadName(course.title || course.key)}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
  }

  function exportModuleAsJson(courseKey, moduleKey) {
    const moduleValue = findModule(state.project, courseKey, moduleKey);
    const exportedDocument = structuralEditor.exportModuleDocument({ courseKey, moduleKey });
    downloadJsonFile(
      `${slugifyDownloadName(moduleValue.title || moduleValue.key, "modulo")}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
  }

  function exportLessonAsJson(courseKey, moduleKey, lessonKey) {
    const lesson = findLesson(state.project, courseKey, moduleKey, lessonKey);
    const exportedDocument = structuralEditor.exportLessonDocument({ courseKey, moduleKey, lessonKey });
    downloadJsonFile(
      `${slugifyDownloadName(lesson.title || lesson.key, "licao")}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
  }

  function exportMicrosequenceAsJson(courseKey, moduleKey, lessonKey, microsequenceKey) {
    const microsequence = findMicrosequence(state.project, courseKey, moduleKey, lessonKey, microsequenceKey);
    const exportedDocument = editor.exportMicrosequenceDocument({ courseKey, moduleKey, lessonKey, microsequenceKey });
    downloadJsonFile(
      `${slugifyDownloadName(microsequence.title || microsequence.key, "microssequencia")}.json`,
      JSON.stringify(exportedDocument, null, 2)
    );
  }

  function collectLessonProgressReferencesInCourse(course) {
    return (course.modules || []).flatMap((moduleValue) =>
      (moduleValue.lessons || []).map((lesson) => ({
        courseKey: course.key,
        moduleKey: moduleValue.key,
        lessonKey: lesson.key
      }))
    );
  }

  function resetCourseProgress(courseKey) {
    const course = findCourse(state.project, courseKey);
    const lessonReferences = collectLessonProgressReferencesInCourse(course);
    removeProgressEntries(lessonReferences);
  }

  function resetModuleProgress(courseKey, moduleKey) {
    const moduleValue = findModule(state.project, courseKey, moduleKey);
    removeProgressEntries(collectProgressReferencesInModule(courseKey, moduleValue));
  }

  function resetLessonProgress(courseKey, moduleKey, lessonKey) {
    removeProgressEntries([{ courseKey, moduleKey, lessonKey }]);
  }

  function createCardAtPosition(position, kind = "say", reference = {}) {
    const courseKey = reference.courseKey || state.selection.courseKey;
    const moduleKey = reference.moduleKey || state.selection.moduleKey;
    const lessonKey = reference.lessonKey || state.selection.lessonKey;
    const microsequenceKey = reference.microsequenceKey || state.selection.microsequenceKey;
    if (!microsequenceKey) return null;
    ensureEditableMicrosequenceBranch({
      operationType: "edit",
      label: "Edição local"
    });

    const starterCard = createStarterContractCard(kind);

    const nextProject = editor.createCard({
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      ...starterCard,
      position
    });

    setProject(nextProject);
    const microsequence = findMicrosequence(
      nextProject,
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey
    );
    const cards = microsequence?.cards || [];
    const nextIndex = Math.max(0, Math.min(position, Math.max(0, cards.length - 1)));
    const nextCard = cards[nextIndex] || null;
    state.selection.cardIndex = nextIndex;
    state.selection.cardKey = nextCard ? nextCard.key : null;
    state.selection.courseKey = courseKey;
    state.selection.moduleKey = moduleKey;
    state.selection.lessonKey = lessonKey;
    state.selection.microsequenceKey = microsequenceKey;
    if (state.view === "microsequence-assist") {
      syncActiveMicrosequenceVersionFromProject();
    }
    ensureCurrentCardSnapshot();
    syncAssistDraft();
    return nextProject;
  }

  function createCardAfterCurrent() {
    const microsequenceKey = state.selection.microsequenceKey;
    if (!microsequenceKey) return;

    try {
      createCardAtPosition((Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0) + 1);
      render({ preserveState: true });
    } catch {
      // Mantém a UI operacional se a criação falhar por estado transitório.
    }
  }

  function applyMicrosequenceGeneration({ microsequenceTitle, cards }) {
    ensureMicrosequenceVersionEntry();
    const previousVersionId = getMicrosequenceVersionEntry()?.activeVersionId || "";
    ensureEditableMicrosequenceBranch({
      operationType: "generated",
      label: "Gerada"
    });
    const currentMicrosequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    const nextProject = editor.replaceMicrosequenceCards({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      title: String(microsequenceTitle || "").trim() || currentMicrosequence?.title || "Microssequência",
      description: currentMicrosequence?.description || "",
      tags: structuredClone(Array.isArray(currentMicrosequence?.tags) ? currentMicrosequence.tags : []),
      domainRefs: structuredClone(Array.isArray(currentMicrosequence?.domainRefs) ? currentMicrosequence.domainRefs : []),
      practiceVariantRefs: structuredClone(
        Array.isArray(currentMicrosequence?.practiceVariantRefs) ? currentMicrosequence.practiceVariantRefs : []
      ),
      didacticPurpose: currentMicrosequence?.didacticPurpose || "",
      coverageRole: currentMicrosequence?.coverageRole || "",
      cards: structuredClone(Array.isArray(cards) ? cards : [])
    });

    setProject(nextProject);
    const microsequence = findMicrosequence(
      nextProject,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    const firstCard = microsequence?.cards?.[0] || null;
    state.selection.cardIndex = 0;
    state.selection.cardKey = firstCard ? firstCard.key : null;
    state.assistDraft.activeWorkbenchPane = "preview";
    createMicrosequenceVersionFromCurrentProject({
      parentVersionId: previousVersionId,
      operationType: GENERATED_PENDING_OPERATION,
      label: `Gerada ${getMicrosequenceVersionEntry()?.versions?.length ? getMicrosequenceVersionEntry().versions.length + 1 : ""}`.trim()
    });
    setMicrosequenceVersionViewState({
      visualizedVersionId: getMicrosequenceVersionEntry()?.activeVersionId || "",
      editBaseVersionId: getMicrosequenceVersionEntry()?.activeVersionId || ""
    });
    state.assistDraft.lastRequest = {
      title: "Cards atualizados",
      description: `${Array.isArray(microsequence?.cards) ? microsequence.cards.length : 0} cards aplicados em ${microsequence?.title || microsequenceTitle || "Microssequência"}. Aceite ou exclua a iteração atual.`,
      timestamp: new Date().toISOString()
    };
    syncAssistDraft();
  }

  function acceptPendingGeneratedMicrosequenceVersion() {
    const entry = getMicrosequenceVersionEntry();
    const activeVersion = getPendingGeneratedMicrosequenceVersion();
    if (!entry || !activeVersion) {
      return;
    }

    activeVersion.operationType = GENERATED_ACCEPTED_OPERATION;
    activeVersion.updatedAt = new Date().toISOString();
    saveMicrosequenceVersions();
    state.assistDraft.lastRequest = {
      title: "Iteração aceita",
      description: `${activeVersion.label || "Versão atual"} mantida como estado em uso.`,
      timestamp: new Date().toISOString()
    };
    render({ preserveState: true });
  }

  function discardPendingGeneratedMicrosequenceVersion() {
    const reference = {
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey
    };
    const entry = getMicrosequenceVersionEntry(reference);
    const activeVersion = getPendingGeneratedMicrosequenceVersion(reference);
    if (!entry || !activeVersion || !canDeleteMicrosequenceVersion(activeVersion.id)) {
      return;
    }

    const fallbackVersion = removeMicrosequenceVersion(entry, activeVersion.id);
    if (!fallbackVersion) {
      return;
    }

    saveMicrosequenceVersions();
    applyMicrosequenceVersion(reference, fallbackVersion, Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0);
    state.assistDraft.dependencyKeys = Array.isArray(fallbackVersion.tags)
      ? fallbackVersion.tags.slice(0, MAX_ASSIST_DEPENDENCIES)
      : [];
    setMicrosequenceVersionViewState({
      visualizedVersionId: fallbackVersion.id,
      editBaseVersionId: fallbackVersion.id
    });
    state.assistDraft.lastRequest = {
      title: "Iteração excluída",
      description: `${activeVersion.label || "Versão atual"} removida; a versão anterior voltou a valer.`,
      timestamp: new Date().toISOString()
    };
    render({ preserveState: false });
  }

  function getVisibleCourses(project = state.project) {
    return project.courses || [];
  }

  function applyGenerationScope({
    courseKey = "",
    moduleKey = "",
    lessonKey = ""
  } = {}) {
    const draft = state.generationDraft;
    const course = courseKey ? findCourse(state.project, courseKey) : null;
    const moduleValue = course && moduleKey ? findModule(state.project, course.key, moduleKey) : null;
    const lesson = course && moduleValue && lessonKey ? findLesson(state.project, course.key, moduleValue.key, lessonKey) : null;

    draft.courseFixed = Boolean(course);
    draft.courseInput = course?.title || "";
    draft.courseKey = course?.key || "";
    draft.moduleFixed = Boolean(moduleValue);
    draft.moduleInput = moduleValue?.title || "";
    draft.moduleKey = moduleValue?.key || "";
    draft.lessonFixed = Boolean(lesson);
    draft.repositionMicrosequences = false;
    draft.lessonInput = lesson?.title || "";
    draft.lessonKey = lesson?.key || "";
    syncGenerationDraftHierarchy();
    clearGenerationResult();
  }

  function clearGenerationScope() {
    applyGenerationScope();
  }

  function openGenerationPanel(scope = {}) {
    applyGenerationScope(scope);
    state.generationPanelOpen = true;
    state.entityEditor = null;
    render({ preserveState: true });
  }

  function closeGenerationPanel({ preserveGeneratedResult = true } = {}) {
    state.generationPanelOpen = false;
    if (!preserveGeneratedResult) {
      clearGenerationResult();
    }
    render({ preserveState: true });
  }

  function handleGenerationPanelActionClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return false;
    }

    const actionNode = target.closest(
      "[data-action='open-generation-panel-global'], [data-action='open-generation-panel-course'], [data-action='open-generation-panel-module'], [data-action='open-generation-panel-lesson']"
    );
    if (!actionNode || !root.contains(actionNode)) {
      return false;
    }

    const action = actionNode.getAttribute("data-action") || "";
    const scope = resolveGenerationPanelScopeFromAction({
      action,
      dataset: {
        courseKey: actionNode.getAttribute("data-course-key") || "",
        moduleKey: actionNode.getAttribute("data-module-key") || "",
        lessonKey: actionNode.getAttribute("data-lesson-key") || ""
      },
      selection: state.selection || {}
    });
    if (scope === null) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    openGenerationPanel(scope);
    return true;
  }

  function triggerGenerationPanelFromNode(node, event = null) {
    if (!node) {
      return false;
    }

    const action = node.getAttribute("data-action") || "";
    const scope = resolveGenerationPanelScopeFromAction({
      action,
      dataset: {
        courseKey: node.getAttribute("data-course-key") || "",
        moduleKey: node.getAttribute("data-module-key") || "",
        lessonKey: node.getAttribute("data-lesson-key") || ""
      },
      selection: state.selection || {}
    });
    if (scope === null) {
      return false;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openGenerationPanel(scope);
    return true;
  }

  function bindGenerationPanelTrigger(node) {
    if (!node || node.getAttribute("data-generation-bound") === "true") {
      return;
    }

    node.setAttribute("data-generation-bound", "true");
    node.addEventListener("click", (event) => {
      triggerGenerationPanelFromNode(node, event);
    });
    node.addEventListener(
      "touchend",
      (event) => {
        triggerGenerationPanelFromNode(node, event);
      },
      { passive: false }
    );
  }

  function clearGenerationResult() {
    state.generationDraft.errorMessage = "";
    state.generationDraft.lastResult = null;
    state.pendingGeneratedNavigation = null;
  }

  function resolveHierarchyInputMatch(items, inputValue) {
    const normalizedInput = normalizeComparableText(inputValue);
    if (!normalizedInput) {
      return null;
    }

    return (
      (items || []).find((item) => {
        const labels = [item?.title, item?.key].map((value) => normalizeComparableText(value)).filter(Boolean);
        return labels.includes(normalizedInput);
      }) || null
    );
  }

  function syncGenerationDraftHierarchy() {
    const draft = state.generationDraft;

    if (!draft.courseFixed) {
      draft.courseInput = "";
      draft.courseKey = "";
      draft.moduleFixed = false;
      draft.moduleInput = "";
      draft.moduleKey = "";
      draft.lessonFixed = false;
      draft.repositionMicrosequences = false;
      draft.lessonInput = "";
      draft.lessonKey = "";
      return;
    }

    const course = resolveHierarchyInputMatch(getVisibleCourses(), draft.courseInput);
    draft.courseKey = course?.key || "";

    if (!course) {
      draft.moduleFixed = false;
      draft.moduleInput = "";
      draft.moduleKey = "";
      draft.lessonFixed = false;
      draft.repositionMicrosequences = false;
      draft.lessonInput = "";
      draft.lessonKey = "";
      return;
    }

    if (!draft.moduleFixed) {
      draft.moduleInput = "";
      draft.moduleKey = "";
      draft.lessonFixed = false;
      draft.repositionMicrosequences = false;
      draft.lessonInput = "";
      draft.lessonKey = "";
      return;
    }

    const moduleValue = resolveHierarchyInputMatch(course.modules || [], draft.moduleInput);
    draft.moduleKey = moduleValue?.key || "";

    if (!moduleValue) {
      draft.lessonFixed = false;
      draft.repositionMicrosequences = false;
      draft.lessonInput = "";
      draft.lessonKey = "";
      return;
    }

    if (!draft.lessonFixed) {
      draft.repositionMicrosequences = false;
      draft.lessonInput = "";
      draft.lessonKey = "";
      return;
    }

    const lesson = resolveHierarchyInputMatch(moduleValue.lessons || [], draft.lessonInput);
    draft.lessonKey = lesson?.key || "";
  }

  function getGenerationScopeState(project = state.project) {
    const draft = state.generationDraft;
    const courses = getVisibleCourses(project);
    const course = draft.courseKey ? findCourse(project, draft.courseKey) : null;
    const modules = course?.modules || [];
    const moduleValue = draft.moduleKey ? findModule(project, draft.courseKey, draft.moduleKey) : null;
    const lessons = moduleValue?.lessons || [];
    const lesson = draft.lessonKey ? findLesson(project, draft.courseKey, draft.moduleKey, draft.lessonKey) : null;
    const hasPrompt = !!String(draft.promptText || "").trim();
    const hasAttachments = Array.isArray(draft.attachments) && draft.attachments.length > 0;
    const hasInputSource = hasPrompt || hasAttachments;
    const pressedFieldsFilled =
      (!draft.courseFixed || !!String(draft.courseInput || "").trim()) &&
      (!draft.moduleFixed || !!String(draft.moduleInput || "").trim()) &&
      (!draft.lessonFixed || !!String(draft.lessonInput || "").trim());
    const invalidFixedHierarchy = (draft.moduleFixed && !course) || (draft.lessonFixed && !moduleValue);

    const generationMode = resolveGenerationAssistMode({
      lessonFixed: draft.lessonFixed === true,
      hasResolvedLesson: !!lesson,
      repositionMicrosequences: draft.repositionMicrosequences === true
    });
    const isLessonMicrosequenceMode =
      generationMode === "generate-lesson-microsequences" ||
      generationMode === "generate-and-reposition-lesson-microsequences";
    const isLessonRepositionMode = generationMode === "generate-and-reposition-lesson-microsequences";

    let actionLabel = "criar curso completo";
    let actionHelpText = "";
    let actionSummary = "Curso, módulos e lições";
    let actionIconName = "folder";
    let panelTitle = "Gerar estrutura";
    let panelSubtitle = "";
    let submitLabel = "Gerar estrutura";

    if (isLessonMicrosequenceMode) {
      actionLabel = isLessonRepositionMode
        ? "gerar e reposicionar microssequências nesta lição"
        : "criar microssequências draft nesta lição";
      actionHelpText = "";
      actionSummary = isLessonRepositionMode
        ? "Gerar e reposicionar microssequências"
        : "Microssequências draft sem cards";
      actionIconName = isLessonRepositionMode ? "reposition" : "microsequence";
      panelTitle = "Gerar microssequências";
      panelSubtitle = "";
      submitLabel = isLessonRepositionMode ? "Gerar e reposicionar" : "Gerar microssequências";
    } else if (draft.courseFixed) {
      if (!course) {
        actionLabel = "criar este curso, módulos e lições";
        actionSummary = "Curso, módulos e lições";
        actionIconName = "folder";
      } else if (!draft.moduleFixed) {
        actionLabel = "criar módulos e lições neste curso";
        actionSummary = "Módulos e lições neste curso";
        actionIconName = "module";
      } else if (!moduleValue) {
        actionLabel = "criar este módulo e suas lições";
        actionSummary = "Módulo e lições";
        actionIconName = "module";
      } else if (!draft.lessonFixed) {
        actionLabel = "criar lições neste módulo";
        actionSummary = "Lições neste módulo";
        actionIconName = "lesson";
      } else {
        actionLabel = "criar/atualizar esta lição";
        actionSummary = "Atualizar esta lição";
        actionIconName = "lesson";
      }
    }

    return {
      courses,
      course,
      modules,
      moduleValue,
      lessons,
      lesson,
      moduleToggleEnabled: !!course,
      moduleInputEnabled: !!course && draft.moduleFixed,
      lessonToggleEnabled: !!moduleValue,
      lessonInputEnabled: !!moduleValue && draft.lessonFixed,
      canSubmit: hasInputSource && pressedFieldsFilled && !invalidFixedHierarchy,
      actionLabel,
      actionHelpText,
      actionSummary,
      actionIconName,
      generationMode,
      isLessonMicrosequenceMode,
      isLessonGenerationMode: isLessonMicrosequenceMode,
      isLessonRepositionMode,
      panelTitle,
      panelSubtitle,
      submitLabel
    };
  }

  function setGenerationLevelFixed(level) {
    const draft = state.generationDraft;

    if (level === "course") {
      const willEnable = !draft.courseFixed;
      draft.courseFixed = willEnable;
      if (!willEnable) {
        draft.courseInput = "";
        draft.courseKey = "";
      }
    } else if (level === "module") {
      if (!getGenerationScopeState().moduleToggleEnabled) {
        return;
      }
      const willEnable = !draft.moduleFixed;
      draft.moduleFixed = willEnable;
      if (!willEnable) {
        draft.moduleInput = "";
        draft.moduleKey = "";
      }
    } else if (level === "lesson") {
      if (!getGenerationScopeState().lessonToggleEnabled) {
        return;
      }
      const willEnable = !draft.lessonFixed;
      draft.lessonFixed = willEnable;
      if (!willEnable) {
        draft.repositionMicrosequences = false;
        draft.lessonInput = "";
        draft.lessonKey = "";
      }
    }

    syncGenerationDraftHierarchy();
    clearGenerationResult();
    render({ preserveState: true });
  }

  function setGenerationInput(level, value) {
    const draft = state.generationDraft;
    if (level === "course") {
      draft.courseInput = value;
    } else if (level === "module") {
      draft.moduleInput = value;
    } else if (level === "lesson") {
      draft.lessonInput = value;
    }

    syncGenerationDraftHierarchy();
    clearGenerationResult();
    render({ preserveState: true });
  }

  function toggleGenerationMicrosequenceReposition() {
    const scopeState = getGenerationScopeState();
    if (!scopeState.isLessonGenerationMode) {
      return;
    }

    state.generationDraft.repositionMicrosequences = state.generationDraft.repositionMicrosequences !== true;
    clearGenerationResult();
    render({ preserveState: true });
  }

  function openGeneratedLesson({ pendingGeneratedNavigation = state.pendingGeneratedNavigation } = {}) {
    const result = state.generationDraft.lastResult;
    const target = pendingGeneratedNavigation || result;
    if (!target?.courseKey || !target?.moduleKey || !target?.lessonKey) {
      state.generationDraft.errorMessage = "Nenhuma estrutura nova foi gerada para abrir em Cursos.";
      render({ preserveState: true });
      return;
    }

    applySelection({
      courseKey: target.courseKey,
      moduleKey: target.moduleKey,
      lessonKey: target.lessonKey,
      microsequenceKey: null,
      cardKey: null,
      cardIndex: 0
    });
    state.homeTab = "courses";
    state.generationPanelOpen = false;
    state.view = "lesson";
    state.entityEditor = null;
    state.microsequenceMode = "play";
    state.pendingGeneratedNavigation = null;
    focusStructureTarget({
      view: "lesson",
      courseKey: target.courseKey,
      moduleKey: target.moduleKey,
      lessonKey: target.lessonKey,
      microsequenceKey: target.firstMicrosequenceKey || null
    });
    render({ preserveState: false });
  }

  function applyMicrosequenceReposition(slot, renames = []) {
    if (!slot) {
      fail("O serviço de IA escolheu um slot de reposicionamento inexistente. Ajuste o pedido e tente de novo.");
    }

    const moveResult = editor.moveMicrosequence({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey: state.selection.microsequenceKey,
      targetCourseKey: slot.courseKey,
      targetModuleKey: slot.moduleKey,
      targetLessonKey: slot.lessonKey,
      targetPosition: slot.targetPosition,
      renames
    });

    const nextProject = moveResult.document;
    const movedMicrosequence = moveResult.movedMicrosequence;
    setProject(nextProject);
    applySelectionByKeys(nextProject, {
      courseKey: movedMicrosequence?.courseKey || slot.courseKey,
      moduleKey: movedMicrosequence?.moduleKey || slot.moduleKey,
      lessonKey: movedMicrosequence?.lessonKey || slot.lessonKey,
      microsequenceKey: movedMicrosequence?.microsequenceKey || state.selection.microsequenceKey,
      cardKey: null,
      cardIndex: 0
    });
    state.view = "microsequence-assist";
    state.microsequenceMode = "play";
    syncAssistDraft();
  }

  async function submitAssistRequest() {
    const context = getRenderContext();
    const assistCatalog = getAssistCatalog();
    const hadCardsBefore = Array.isArray(context.microsequence?.cards) && context.microsequence.cards.length > 0;
    const dependencyTitles = assistCatalog
      .filter((item) => state.assistDraft.dependencyKeys.includes(item.key))
      .map((item) => item.title || item.key);
    const selectedDependencyKeys = new Set(state.assistDraft.dependencyKeys);
    const selectedLessonTopicRefs = collectLessonTopicRefs(context.lesson, context.microsequence)
      .filter((item) => selectedDependencyKeys.has(item.refKey) || selectedDependencyKeys.has(item.label));
    const destinationSlots = collectRepositionSlots();
    const requestedMode = state.assistDraft.selectedMode;
    const mode =
      requestedMode === ASSIST_USER_MODES.REPOSITION
        ? "reposition-microsequence"
        : "compose-microsequence";

    state.assistDraft.isSubmitting = true;
    state.assistDraft.errorMessage = "";
    render({ preserveState: true });

    try {
      if (mode === "reposition-microsequence" && !destinationSlots.length) {
        fail("Nenhum slot de reposicionamento foi encontrado a partir das tags escolhidas. Selecione tags válidas e tente de novo.");
      }

      if (!(await ensureCodexLocalReady())) {
        return;
      }

      const result = await runAssist({
        apiKey: state.assistConfig.apiKey,
        model: state.assistConfig.model,
        codexEndpoint: state.assistConfig.codexEndpoint,
        codexToken: state.assistConfig.codexToken,
        mode,
        microsequence: buildAssistHierarchyContext({
          course: context.course,
          moduleValue: context.moduleValue,
          lesson: context.lesson,
          microsequence: context.microsequence
        }),
        card: context.card,
        dependencyTitles,
        selectedLessonTopicRefs,
        destinationSlots,
        promptText: state.assistDraft.promptText,
        userFixedTypeId: state.assistDraft.didacticTypeId,
        preferredContainer: state.assistDraft.preferredContainer,
        attachments: state.assistDraft.attachments
      });

      if (mode === "compose-microsequence") {
        applyMicrosequenceGeneration(result);
        state.assistDraft.lastRequest = {
          title: hadCardsBefore ? "Cards substituídos" : "Cards gerados",
          description:
            `${result.cards.length} cards aplicados diretamente em ${result.microsequenceTitle} com ${getAssistModelLabel(state.assistConfig.model)}.`,
          timestamp: new Date().toISOString()
        };
      } else {
        const chosenSlot = destinationSlots.find((item) => item.slotId === result.slotId);
        if (!chosenSlot) {
          fail("A resposta do serviço de IA devolveu uma posição inválida para reposicionamento. Ajuste o pedido e tente novamente.");
        }

        applyMicrosequenceReposition(chosenSlot, result.renames);
        const destinationLesson = findLesson(state.project, chosenSlot.courseKey, chosenSlot.moduleKey, chosenSlot.lessonKey);
        state.assistDraft.lastRequest = {
          title: "Microssequência reposicionada",
          description:
            `${context.microsequence?.title || "Microssequência"} movida para ${destinationLesson?.title || chosenSlot.lessonKey} com ${getAssistModelLabel(state.assistConfig.model)}.`,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      state.assistDraft.errorMessage = error instanceof Error ? error.message : "Falha ao chamar o serviço de IA.";
    } finally {
      state.assistDraft.isSubmitting = false;
      render({ preserveState: true });
    }
  }

  function summarizeStructureChanges(summary, targetCourseTitle) {
    if (summary.createdCourses > 0) {
      return `Curso ${targetCourseTitle} estruturado com ${summary.totalModules} módulo(s) e ${summary.totalLessons} lição(ões).`;
    }
    if (summary.createdModules > 0 || summary.updatedModules > 0) {
      return `Estrutura aplicada em ${targetCourseTitle}: ${summary.totalModules} módulo(s) e ${summary.totalLessons} lição(ões).`;
    }
    return `Estrutura aplicada em ${targetCourseTitle}: ${summary.totalLessons} lição(ões) atualizada(s).`;
  }

  function createStructureSummary() {
    return {
      createdCourses: 0,
      updatedCourses: 0,
      createdModules: 0,
      updatedModules: 0,
      createdLessons: 0,
      updatedLessons: 0,
      totalModules: 0,
      totalLessons: 0
    };
  }

  function buildStructureGenerationContext(scopeState) {
    const courseModules = summarizeStructuredModules(scopeState.course?.modules || []);
    const moduleLessons = summarizeStructuredLessons(scopeState.moduleValue?.lessons || []);
    return {
      actionLabel: scopeState.actionLabel,
      courseFixed: state.generationDraft.courseFixed === true,
      moduleFixed: state.generationDraft.moduleFixed === true,
      lessonFixed: state.generationDraft.lessonFixed === true,
      courseTitle: scopeState.course?.title || String(state.generationDraft.courseInput || "").trim(),
      courseDescription: scopeState.course?.description || "",
      courseSourceGuide: scopeState.course?.sourceGuide || "",
      moduleTitle: scopeState.moduleValue?.title || String(state.generationDraft.moduleInput || "").trim(),
      moduleDescription: scopeState.moduleValue?.description || "",
      moduleSourceGuide: scopeState.moduleValue?.sourceGuide || "",
      courseModules,
      lessonTitle: scopeState.lesson?.title || String(state.generationDraft.lessonInput || "").trim(),
      lessonDescription: scopeState.lesson?.description || "",
      lessonSourceGuide: scopeState.lesson?.sourceGuide || "",
      lessonSourceGuideStructured: structuredClone(scopeState.lesson?.sourceGuideStructured || {}),
      lessonResourceTags: Array.isArray(scopeState.lesson?.resourceTags) ? [...scopeState.lesson.resourceTags] : [],
      lessonContentTypeTags: Array.isArray(scopeState.lesson?.contentTypeTags) ? [...scopeState.lesson.contentTypeTags] : [],
      lessonLearningActionTags: Array.isArray(scopeState.lesson?.learningActionTags) ? [...scopeState.lesson.learningActionTags] : [],
      lessonSupportLevel: String(scopeState.lesson?.supportLevel || "").trim(),
      moduleLessons,
      lessonMicrosequences: Array.isArray(scopeState.lesson?.microsequences)
        ? scopeState.lesson.microsequences.map((microsequence) => ({
            title: String(microsequence?.title || "").trim(),
            tags: Array.isArray(microsequence?.tags)
              ? microsequence.tags.map((item) => String(item || "").trim()).filter(Boolean)
              : []
          }))
        : []
    };
  }

  function buildLessonMicrosequenceGenerationContext(scopeState) {
    const domainCoverage = buildLessonDomainCoverageReport(scopeState.lesson || {});
    return {
      actionLabel: scopeState.actionLabel,
      courseTitle: scopeState.course?.title || String(state.generationDraft.courseInput || "").trim(),
      courseDescription: scopeState.course?.description || "",
      courseSourceGuide: scopeState.course?.sourceGuide || "",
      courseSourceGuideStructured: structuredClone(scopeState.course?.sourceGuideStructured || {}),
      moduleTitle: scopeState.moduleValue?.title || String(state.generationDraft.moduleInput || "").trim(),
      moduleDescription: scopeState.moduleValue?.description || "",
      moduleSourceGuide: scopeState.moduleValue?.sourceGuide || "",
      moduleSourceGuideStructured: structuredClone(scopeState.moduleValue?.sourceGuideStructured || {}),
      lessonTitle: scopeState.lesson?.title || String(state.generationDraft.lessonInput || "").trim(),
      lessonDescription: scopeState.lesson?.description || "",
      lessonSourceGuide: scopeState.lesson?.sourceGuide || "",
      lessonSourceGuideStructured: structuredClone(scopeState.lesson?.sourceGuideStructured || {}),
      lessonDomainMap: structuredClone(scopeState.lesson?.domainMap || {}),
      lessonDomainCoverage: {
        uncoveredItems: domainCoverage.uncoveredItems,
        weakItems: domainCoverage.weakItems,
        explainedWithoutPractice: domainCoverage.explainedWithoutPractice,
        practiceWithoutVariation: domainCoverage.practiceWithoutVariation,
        examMissing: domainCoverage.examMissing
      },
      lessonResourceTags: Array.isArray(scopeState.lesson?.resourceTags) ? [...scopeState.lesson.resourceTags] : [],
      lessonContentTypeTags: Array.isArray(scopeState.lesson?.contentTypeTags) ? [...scopeState.lesson.contentTypeTags] : [],
      lessonLearningActionTags: Array.isArray(scopeState.lesson?.learningActionTags) ? [...scopeState.lesson.learningActionTags] : [],
      lessonSupportLevel: String(scopeState.lesson?.supportLevel || "").trim(),
      existingMicrosequences: Array.isArray(scopeState.lesson?.microsequences)
        ? scopeState.lesson.microsequences.map((microsequence, index) => ({
            key: String(microsequence?.key || "").trim(),
            position: index,
            title: String(microsequence?.title || "").trim(),
            description: String(microsequence?.description || "").trim(),
            domainRefs: Array.isArray(microsequence?.domainRefs)
              ? microsequence.domainRefs.map((item) => String(item || "").trim()).filter(Boolean)
              : [],
            practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs)
              ? microsequence.practiceVariantRefs.map((item) => String(item || "").trim()).filter(Boolean)
              : [],
            didacticPurpose: String(microsequence?.didacticPurpose || "").trim(),
            coverageRole: String(microsequence?.coverageRole || "").trim(),
            tags: Array.isArray(microsequence?.tags)
              ? microsequence.tags.map((item) => String(item || "").trim()).filter(Boolean)
              : [],
            status: String(microsequence?.status || "").trim(),
            included: microsequence?.included === true
          }))
        : []
    };
  }

  function findSiblingByTitle(items, title) {
    const normalizedTitle = normalizeComparableText(title);
    if (!normalizedTitle) {
      return null;
    }

    return (
      (items || []).find((item) => normalizeComparableText(item?.title || item?.key) === normalizedTitle) || null
    );
  }

  function upsertGeneratedModule(courseKey, payload, summary) {
    const currentCourse = findCourse(state.project, courseKey);
    const existingModule = findSiblingByTitle(currentCourse?.modules || [], payload.title);
    let nextProject = null;

    if (existingModule) {
      nextProject = structuralEditor.updateModule({
        courseKey,
        moduleKey: existingModule.key,
        title: existingModule.title,
        description: payload.description,
        sourceGuide: payload.sourceGuide,
        sourceGuideStructured: payload.sourceGuideStructured
      });
      createStructureVersionFromProject(nextProject, {
        level: "module",
        courseKey,
        moduleKey: existingModule.key
      }, {
        operationType: "update"
      });
      summary.updatedModules += 1;
    } else {
      nextProject = structuralEditor.createModule({
        courseKey,
        title: payload.title,
        description: payload.description,
        sourceGuide: payload.sourceGuide,
        sourceGuideStructured: payload.sourceGuideStructured
      });
      createStructureVersionFromProject(nextProject, {
        level: "course",
        courseKey
      }, {
        operationType: "create-child"
      });
      summary.createdModules += 1;
    }

    setProject(nextProject);
    if (!existingModule) {
      const createdModule = findSiblingByTitle(findCourse(nextProject, courseKey)?.modules || [], payload.title);
      syncActiveStructureVersionFromProject({
        level: "module",
        courseKey,
        moduleKey: createdModule?.key
      });
    }
    return findSiblingByTitle(findCourse(nextProject, courseKey)?.modules || [], payload.title);
  }

  function upsertGeneratedLesson(courseKey, moduleKey, payload, summary) {
    const currentModule = findModule(state.project, courseKey, moduleKey);
    const existingLesson = findSiblingByTitle(currentModule?.lessons || [], payload.title);
    let nextProject = null;

    if (existingLesson) {
      nextProject = structuralEditor.updateLesson({
        courseKey,
        moduleKey,
        lessonKey: existingLesson.key,
        title: existingLesson.title,
        description: payload.description,
        sourceGuide: payload.sourceGuide,
        sourceGuideStructured: payload.sourceGuideStructured,
        resourceTags: payload.resourceTags,
        contentTypeTags: payload.contentTypeTags,
        learningActionTags: payload.learningActionTags,
        supportLevel: payload.supportLevel
      });
      createStructureVersionFromProject(nextProject, {
        level: "lesson",
        courseKey,
        moduleKey,
        lessonKey: existingLesson.key
      }, {
        operationType: "update"
      });
      summary.updatedLessons += 1;
    } else {
      nextProject = structuralEditor.createLesson({
        courseKey,
        moduleKey,
        title: payload.title,
        description: payload.description,
        sourceGuide: payload.sourceGuide,
        sourceGuideStructured: payload.sourceGuideStructured,
        resourceTags: payload.resourceTags,
        contentTypeTags: payload.contentTypeTags,
        learningActionTags: payload.learningActionTags,
        supportLevel: payload.supportLevel
      });
      createStructureVersionFromProject(nextProject, {
        level: "module",
        courseKey,
        moduleKey
      }, {
        operationType: "create-child"
      });
      summary.createdLessons += 1;
    }

    setProject(nextProject);
    if (!existingLesson) {
      const createdLesson = findSiblingByTitle(findModule(nextProject, courseKey, moduleKey)?.lessons || [], payload.title);
      syncActiveStructureVersionFromProject({
        level: "lesson",
        courseKey,
        moduleKey,
        lessonKey: createdLesson?.key
      });
    }
    return findSiblingByTitle(findModule(nextProject, courseKey, moduleKey)?.lessons || [], payload.title);
  }

  function applyGeneratedStructure(result, scopeState) {
    const draft = state.generationDraft;
    const generatedCourse = result.course;
    const generatedModules = generatedCourse.modules || [];
    const summary = createStructureSummary();
    let course = scopeState.course;
    let moduleValue = scopeState.moduleValue;
    let lesson = scopeState.lesson;

    if (!draft.courseFixed || !course) {
      const nextProject = structuralEditor.createCourse({
        title: String(draft.courseInput || "").trim() || generatedCourse.title,
        description: generatedCourse.description,
        sourceGuide: generatedCourse.sourceGuide,
        sourceGuideStructured: generatedCourse.sourceGuideStructured
      });
      const createdCourse = nextProject.courses[nextProject.courses.length - 1] || null;
      setProject(nextProject);
      syncActiveStructureVersionFromProject({
        level: "course",
        courseKey: createdCourse?.key
      });
      course = createdCourse;
      summary.createdCourses += 1;
    } else {
      const nextProject = structuralEditor.updateCourse({
        courseKey: course.key,
        title: course.title,
        description: generatedCourse.description,
        sourceGuide: generatedCourse.sourceGuide,
        sourceGuideStructured: generatedCourse.sourceGuideStructured
      });
      createStructureVersionFromProject(nextProject, {
        level: "course",
        courseKey: course.key
      }, {
        operationType: "update"
      });
      setProject(nextProject);
      course = findCourse(nextProject, course.key);
      summary.updatedCourses += 1;
    }

    if (!course) {
      fail("Falha ao aplicar o curso gerado.");
    }

    if (draft.moduleFixed) {
      const modulePayload = generatedModules[0];
      if (!modulePayload) {
        fail("A estrutura gerada não trouxe o módulo esperado.");
      }

      if (!moduleValue) {
        const nextProject = structuralEditor.createModule({
          courseKey: course.key,
          title: String(draft.moduleInput || "").trim() || modulePayload.title,
          description: modulePayload.description,
          sourceGuide: modulePayload.sourceGuide,
          sourceGuideStructured: modulePayload.sourceGuideStructured
        });
        createStructureVersionFromProject(nextProject, {
          level: "course",
          courseKey: course.key
        }, {
          operationType: "create-child"
        });
        setProject(nextProject);
        moduleValue = nextProject.courses
          .find((item) => item.key === course.key)
          ?.modules.at(-1) || null;
        syncActiveStructureVersionFromProject({
          level: "module",
          courseKey: course.key,
          moduleKey: moduleValue?.key
        });
        summary.createdModules += 1;
      } else {
        const nextProject = structuralEditor.updateModule({
          courseKey: course.key,
          moduleKey: moduleValue.key,
          title: moduleValue.title,
          description: modulePayload.description,
          sourceGuide: modulePayload.sourceGuide,
          sourceGuideStructured: modulePayload.sourceGuideStructured
        });
        createStructureVersionFromProject(nextProject, {
          level: "module",
          courseKey: course.key,
          moduleKey: moduleValue.key
        }, {
          operationType: "update"
        });
        setProject(nextProject);
        moduleValue = findModule(nextProject, course.key, moduleValue.key);
        summary.updatedModules += 1;
      }

      summary.totalModules += 1;

      if (draft.lessonFixed) {
        const lessonPayload = (modulePayload.lessons || [])[0];
        if (!lessonPayload) {
          fail("A estrutura gerada não trouxe a lição esperada.");
        }

        if (!lesson) {
          const nextProject = structuralEditor.createLesson({
            courseKey: course.key,
            moduleKey: moduleValue.key,
            title: String(draft.lessonInput || "").trim() || lessonPayload.title,
            description: lessonPayload.description,
            sourceGuide: lessonPayload.sourceGuide,
            sourceGuideStructured: lessonPayload.sourceGuideStructured,
            resourceTags: lessonPayload.resourceTags,
            contentTypeTags: lessonPayload.contentTypeTags,
            learningActionTags: lessonPayload.learningActionTags,
            supportLevel: lessonPayload.supportLevel
          });
          createStructureVersionFromProject(nextProject, {
            level: "module",
            courseKey: course.key,
            moduleKey: moduleValue.key
          }, {
            operationType: "create-child"
          });
          setProject(nextProject);
          lesson = findModule(nextProject, course.key, moduleValue.key)?.lessons.at(-1) || null;
          syncActiveStructureVersionFromProject({
            level: "lesson",
            courseKey: course.key,
            moduleKey: moduleValue.key,
            lessonKey: lesson?.key
          });
          summary.createdLessons += 1;
        } else {
          const nextProject = structuralEditor.updateLesson({
            courseKey: course.key,
            moduleKey: moduleValue.key,
            lessonKey: lesson.key,
            title: lesson.title,
            description: lessonPayload.description,
            sourceGuide: lessonPayload.sourceGuide,
            sourceGuideStructured: lessonPayload.sourceGuideStructured,
            resourceTags: lessonPayload.resourceTags,
            contentTypeTags: lessonPayload.contentTypeTags,
            learningActionTags: lessonPayload.learningActionTags,
            supportLevel: lessonPayload.supportLevel
          });
          createStructureVersionFromProject(nextProject, {
            level: "lesson",
            courseKey: course.key,
            moduleKey: moduleValue.key,
            lessonKey: lesson.key
          }, {
            operationType: "update"
          });
          setProject(nextProject);
          lesson = findLesson(nextProject, course.key, moduleValue.key, lesson.key);
          summary.updatedLessons += 1;
        }

        summary.totalLessons += 1;
      } else {
        let firstLesson = null;
        (modulePayload.lessons || []).forEach((lessonPayload) => {
          const appliedLesson = upsertGeneratedLesson(course.key, moduleValue.key, lessonPayload, summary);
          if (!firstLesson && appliedLesson) {
            firstLesson = appliedLesson;
          }
          summary.totalLessons += 1;
        });
        lesson = firstLesson;
      }
    } else {
      let firstModule = null;
      let firstLesson = null;
      generatedModules.forEach((modulePayload) => {
        const appliedModule = upsertGeneratedModule(course.key, modulePayload, summary);
        if (!firstModule && appliedModule) {
          firstModule = appliedModule;
        }
        summary.totalModules += 1;

        (modulePayload.lessons || []).forEach((lessonPayload) => {
          const appliedLesson = upsertGeneratedLesson(course.key, appliedModule.key, lessonPayload, summary);
          if (!firstLesson && appliedLesson) {
            firstLesson = appliedLesson;
            moduleValue = appliedModule;
          }
          summary.totalLessons += 1;
        });
      });
      moduleValue = moduleValue || firstModule;
      lesson = lesson || firstLesson;
    }

    return {
      message: summarizeStructureChanges(summary, course.title || course.key),
      openActionLabel: "Abrir em Cursos",
      courseKey: course.key,
      moduleKey: moduleValue?.key || "",
      lessonKey: lesson?.key || "",
      summary
    };
  }

  function applyGeneratedLessonMicrosequences(result, scopeState) {
    const lesson = scopeState.lesson;
    if (!scopeState.course || !scopeState.moduleValue || !lesson) {
      fail("A geração contextual da lição exige uma lição válida já existente.");
    }

    const createdItems = Array.isArray(result?.microsequences) ? result.microsequences.filter(Boolean) : [];
    if (!createdItems.length) {
      fail("O serviço de IA não devolveu microssequências válidas para esta lição.");
    }

    let nextProject = null;
    for (const item of createdItems) {
      nextProject = editor.createMicrosequence({
        courseKey: scopeState.course.key,
        moduleKey: scopeState.moduleValue.key,
        lessonKey: lesson.key,
        title: item.title,
        description: item.description,
        tags: Array.isArray(item.tags) ? item.tags : [],
        domainRefs: Array.isArray(item.domainRefs) ? item.domainRefs : [],
        practiceVariantRefs: Array.isArray(item.practiceVariantRefs) ? item.practiceVariantRefs : [],
        didacticPurpose: item.didacticPurpose,
        coverageRole: item.coverageRole,
        status: "draft",
        included: false,
        cards: []
      });
    }

    if (!nextProject) {
      fail("Falha ao criar microssequências na lição.");
    }

    createStructureVersionFromProject(
      nextProject,
      {
        level: "lesson",
        courseKey: scopeState.course.key,
        moduleKey: scopeState.moduleValue.key,
        lessonKey: lesson.key
      },
      {
        operationType: "create-child"
      }
    );
    setProject(nextProject);

    return {
      message:
        createdItems.length === 1
          ? `1 microssequência draft criada em ${lesson.title || lesson.key}.`
          : `${createdItems.length} microssequências draft criadas em ${lesson.title || lesson.key}.`,
      courseKey: scopeState.course.key,
      moduleKey: scopeState.moduleValue.key,
      lessonKey: lesson.key,
      createdMicrosequences: createdItems.length
    };
  }

  function applyGeneratedAndRepositionedLessonMicrosequences(result, scopeState) {
    const lesson = scopeState.lesson;
    if (!scopeState.course || !scopeState.moduleValue || !lesson) {
      fail("A geração contextual da lição exige uma lição válida já existente.");
    }

    const createdItems = Array.isArray(result?.generatedMicrosequences)
      ? result.generatedMicrosequences.filter(Boolean)
      : [];
    const existingKeys = Array.isArray(lesson.microsequences)
      ? lesson.microsequences.map((microsequence) => String(microsequence?.key || "").trim()).filter(Boolean)
      : [];
    const hasRequestedReorder = Array.isArray(result?.finalOrder) && result.finalOrder.length > 0;

    if (!createdItems.length && !hasRequestedReorder) {
      fail("O serviço de IA não devolveu microssequências novas nem uma nova ordem para a lição.");
    }

    let nextProject = state.project;
    const createdKeyByDraftId = new Map();

    for (const item of createdItems) {
      nextProject = editor.createMicrosequence({
        courseKey: scopeState.course.key,
        moduleKey: scopeState.moduleValue.key,
        lessonKey: lesson.key,
        title: item.title,
        description: item.description,
        tags: Array.isArray(item.tags) ? item.tags : [],
        domainRefs: Array.isArray(item.domainRefs) ? item.domainRefs : [],
        practiceVariantRefs: Array.isArray(item.practiceVariantRefs) ? item.practiceVariantRefs : [],
        didacticPurpose: item.didacticPurpose,
        coverageRole: item.coverageRole,
        status: "draft",
        included: false,
        cards: []
      });
      const updatedLesson = findLesson(nextProject, scopeState.course.key, scopeState.moduleValue.key, lesson.key);
      const createdMicrosequence = updatedLesson?.microsequences?.[updatedLesson.microsequences.length - 1] || null;
      if (createdMicrosequence?.key) {
        createdKeyByDraftId.set(item.draftId, createdMicrosequence.key);
      }
    }

    const lessonAfterCreate = findLesson(nextProject, scopeState.course.key, scopeState.moduleValue.key, lesson.key);
    const currentOrder = Array.isArray(lessonAfterCreate?.microsequences)
      ? lessonAfterCreate.microsequences.map((microsequence) => String(microsequence?.key || "").trim()).filter(Boolean)
      : [];
    const proposedOrderKeys = [];
    const proposedSet = new Set();

    for (const entry of result.finalOrder || []) {
      const resolvedKey =
        entry.entryType === "generated"
          ? createdKeyByDraftId.get(entry.draftId) || ""
          : entry.microsequenceKey || "";
      if (!resolvedKey || proposedSet.has(resolvedKey) || !currentOrder.includes(resolvedKey)) {
        continue;
      }
      proposedSet.add(resolvedKey);
      proposedOrderKeys.push(resolvedKey);
    }
    const desiredOrder = resolveLessonMicrosequenceOrder({
      microsequences: Array.isArray(lessonAfterCreate?.microsequences) ? lessonAfterCreate.microsequences : [],
      proposedOrderKeys,
      lessonDomainMap: lessonAfterCreate?.domainMap || {}
    });

    if (!desiredOrder.length) {
      fail("O serviço de IA não devolveu uma ordem utilizável para a lição.");
    }

    let reorderedProject = nextProject;
    desiredOrder.forEach((microsequenceKey, index) => {
      reorderedProject = editor.moveMicrosequence({
        courseKey: scopeState.course.key,
        moduleKey: scopeState.moduleValue.key,
        lessonKey: lesson.key,
        microsequenceKey,
        targetCourseKey: scopeState.course.key,
        targetModuleKey: scopeState.moduleValue.key,
        targetLessonKey: lesson.key,
        targetPosition: index,
        renames: []
      });
    });

    const movedCount = currentOrder.reduce((count, key, index) => count + (desiredOrder[index] !== key ? 1 : 0), 0);
    const operationType = createdItems.length > 0 ? "create-child" : "update";
    createStructureVersionFromProject(
      reorderedProject,
      {
        level: "lesson",
        courseKey: scopeState.course.key,
        moduleKey: scopeState.moduleValue.key,
        lessonKey: lesson.key
      },
      {
        label: "Iteração de microssequências",
        operationType
      }
    );
    setProject(reorderedProject);

    const messageParts = [];
    if (createdItems.length > 0) {
      messageParts.push(
        createdItems.length === 1 ? "1 microssequência draft criada" : `${createdItems.length} microssequências draft criadas`
      );
    }
    if (movedCount > 0) {
      messageParts.push(movedCount === 1 ? "1 posição ajustada" : `${movedCount} posições ajustadas`);
    }
    if (!messageParts.length) {
      messageParts.push("Ordem da lição confirmada");
    }

    return {
      message: `${messageParts.join(" e ")} em ${lesson.title || lesson.key}.`,
      courseKey: scopeState.course.key,
      moduleKey: scopeState.moduleValue.key,
      lessonKey: lesson.key,
      createdMicrosequences: createdItems.length,
      movedMicrosequences: movedCount
    };
  }

  async function submitGenerateStructureRequest() {
    syncGenerationDraftHierarchy();
    const scopeState = getGenerationScopeState();
    const promptText = String(state.generationDraft.promptText || "").trim();

    if (!scopeState.canSubmit) {
      state.generationDraft.errorMessage = "Informe texto e/ou anexo e preencha apenas os níveis fixados válidos antes de gerar a estrutura.";
      render({ preserveState: true });
      return;
    }

    state.generationDraft.isSubmitting = true;
    state.generationDraft.errorMessage = "";
    state.generationDraft.lastResult = null;
    render({ preserveState: true });

    try {
      const generationMode = scopeState.generationMode || resolveGenerationAssistMode({
        lessonFixed: state.generationDraft.lessonFixed === true,
        hasResolvedLesson: !!scopeState.lesson,
        repositionMicrosequences: state.generationDraft.repositionMicrosequences === true
      });

      if (!(await ensureCodexLocalReady())) {
        return;
      }

      let applied = null;
      if (
        generationMode === "generate-lesson-microsequences" ||
        generationMode === "generate-and-reposition-lesson-microsequences"
      ) {
        const result = await runAssist({
          apiKey: state.assistConfig.apiKey,
          model: state.assistConfig.model,
          codexEndpoint: state.assistConfig.codexEndpoint,
          codexToken: state.assistConfig.codexToken,
          mode: generationMode,
          microsequence:
            generationMode === "generate-lesson-microsequences"
              ? buildLessonMicrosequenceGenerationContext(scopeState)
              : buildStructureGenerationContext(scopeState),
          promptText,
          attachments: state.generationDraft.attachments
        });

        applied =
          generationMode === "generate-lesson-microsequences"
            ? applyGeneratedLessonMicrosequences(result, scopeState)
            : applyGeneratedAndRepositionedLessonMicrosequences(result, scopeState);
      } else {
        const selectedModel = String(state.assistConfig.model || "").trim() || "gemini-2.5-flash";
        const ingestedAttachments = await ingestCourseForgeAttachments(state.generationDraft.attachments);
        if (!promptText && ingestedAttachments.extractedCount === 0 && ingestedAttachments.attachments.length > 0) {
          throw new Error(
            "Os anexos atuais ainda não geraram texto utilizável para o top-down. Use TXT, Markdown, HTML, JSON, CSV ou complemente com um prompt."
          );
        }
        const providerId = resolveProviderFromModelId(selectedModel);
        const provider = isCodexLocalModel(selectedModel)
          ? createCodexCliProvider({
              endpoint: state.assistConfig.codexEndpoint,
              token: state.assistConfig.codexToken,
              modelId: selectedModel || CODEX_LOCAL_MODEL_ID
            })
          : createGeminiProvider({
              apiKey: state.assistConfig.apiKey,
              modelId: selectedModel || "gemini-2.5-flash"
            });
        const courseForgeResult = await runCourseForge({
          intent: {
            scope: resolveCourseForgeGenerationScope(scopeState),
            promptText,
            attachments: ingestedAttachments.attachments,
            phaseModelOverrides: buildCourseForgePhaseModelOverrides(selectedModel),
            selectedTopDownProfileId: isCodexLocalModel(selectedModel) ? "codex_all" : "custom"
          },
          projectDocument: state.project,
          providerRegistry: createProviderRegistry({ providers: [provider] }),
          providerId
        });
        storage.saveProject(courseForgeResult.projectDocument);
        createStructureVersionFromProject(courseForgeResult.projectDocument, getCurrentStructureVersionReference(), {
          operationType: "generated"
        });
        setProject(courseForgeResult.projectDocument);
        applied = {
          ...summarizeCourseForgeTopDownResult(courseForgeResult),
          ...(ingestedAttachments.warnings.length
            ? {
                message: `${summarizeCourseForgeTopDownResult(courseForgeResult).message} Avisos de ingestão: ${ingestedAttachments.warnings.join(" ")}`
              }
            : {}),
          ...resolveCourseForgeNavigationTarget({
            projectDocument: courseForgeResult.projectDocument,
            patch: courseForgeResult.patch,
            scopeState
          })
        };
      }

      applySelection({
        courseKey: applied.courseKey,
        moduleKey: applied.moduleKey || null,
        lessonKey: applied.lessonKey || null,
        microsequenceKey: null,
        cardKey: null,
        cardIndex: 0
      });
      state.generationDraft.promptText = "";
      state.generationDraft.attachments = [];
      if (
        generationMode === "generate-lesson-microsequences" ||
        generationMode === "generate-and-reposition-lesson-microsequences"
      ) {
        state.generationDraft.lastResult = null;
        state.pendingGeneratedNavigation = null;
        state.generationPanelOpen = false;
        state.view = "lesson";
        state.microsequenceMode = "play";
      } else {
        state.generationDraft.lastResult = applied;
        state.pendingGeneratedNavigation = {
          courseKey: applied.courseKey,
          moduleKey: applied.moduleKey || null,
          lessonKey: applied.lessonKey || null
        };
      }
    } catch (error) {
      state.pendingGeneratedNavigation = null;
      state.generationDraft.errorMessage = error instanceof Error ? error.message : "Falha ao gerar a estrutura.";
    } finally {
      state.generationDraft.isSubmitting = false;
      render({ preserveState: false });
    }
  }

  function deleteCurrentCard() {
    const microsequenceKey = state.selection.microsequenceKey;
    const cardKey = state.selection.cardKey;
    if (!microsequenceKey || !cardKey) return;

    try {
      ensureEditableMicrosequenceBranch({
        operationType: "edit",
        label: "Edição local"
      });
      const previousIndex = Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0;
      const nextProject = editor.deleteCard({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey,
        cardKey
      });

      setProject(nextProject);
      const microsequence = findMicrosequence(
        nextProject,
        state.selection.courseKey,
        state.selection.moduleKey,
        state.selection.lessonKey,
        microsequenceKey
      );
      const cards = microsequence?.cards || [];
      const nextIndex = Math.max(0, Math.min(previousIndex, Math.max(0, cards.length - 1)));
      const nextCard = cards[nextIndex] || null;
      state.selection.cardIndex = nextIndex;
      state.selection.cardKey = nextCard ? nextCard.key : null;
      if (state.view === "microsequence-assist") {
        syncActiveMicrosequenceVersionFromProject();
      }
      ensureCurrentCardSnapshot();
      syncAssistDraft();
      render({ preserveState: true });
    } catch {
      // Mantém a UI operacional se a remoção falhar por estado transitório.
    }
  }

  function moveSelectedCard(offset) {
    const courseKey = state.entityEditor?.courseKey || state.selection.courseKey;
    const moduleKey = state.entityEditor?.moduleKey || state.selection.moduleKey;
    const lessonKey = state.entityEditor?.lessonKey || state.selection.lessonKey;
    const microsequenceKey = state.entityEditor?.microsequenceKey || state.selection.microsequenceKey;
    const cardKey = state.entityEditor?.cardKey || state.selection.cardKey;
    const microsequence = findMicrosequence(state.project, courseKey, moduleKey, lessonKey, microsequenceKey);
    const cards = microsequence?.cards || [];
    const index = cards.findIndex((item) => item.key === cardKey);
    if (index < 0) {
      return null;
    }

    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= cards.length) {
      return null;
    }

    ensureEditableMicrosequenceBranch({
      operationType: "edit",
      label: "Edição local"
    });
    const nextProject = editor.moveCard({
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      cardKey,
      toIndex: targetIndex
    });
    setProject(nextProject);
    applySelectionByKeys(nextProject, {
      ...state.selection,
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey,
      cardKey
    });
    syncActiveMicrosequenceVersionFromProject();
    syncAssistDraft();
    ensureCurrentCardSnapshot();
    return nextProject;
  }

  function applyStructureReorder(drag, target, position) {
    if (!canDropStructure(drag, target)) {
      resetStructureDragState();
      return;
    }

    let nextProject = null;
    let versionReference = null;

    if (drag.level === "course") {
      const items = state.project.courses || [];
      const toIndex = resolveStructureDropIndex(items, drag.courseKey, target.courseKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = structuralEditor.moveCourse({ courseKey: drag.courseKey, toIndex });
    } else if (drag.level === "module") {
      const course = findCourse(state.project, drag.courseKey);
      const items = course?.modules || [];
      const toIndex = resolveStructureDropIndex(items, drag.moduleKey, target.moduleKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = structuralEditor.moveModule({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        toIndex
      });
      versionReference = {
        level: "course",
        courseKey: drag.courseKey
      };
    } else if (drag.level === "lesson") {
      const moduleValue = findModule(state.project, drag.courseKey, drag.moduleKey);
      const items = moduleValue?.lessons || [];
      const toIndex = resolveStructureDropIndex(items, drag.lessonKey, target.lessonKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = structuralEditor.moveLesson({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey,
        toIndex
      });
      versionReference = {
        level: "module",
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey
      };
    } else if (drag.level === "microsequence") {
      const lesson = findLesson(state.project, drag.courseKey, drag.moduleKey, drag.lessonKey);
      const items = lesson?.microsequences || [];
      const toIndex = resolveStructureDropIndex(items, drag.microsequenceKey, target.microsequenceKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      const moveResult = editor.moveMicrosequence({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey,
        microsequenceKey: drag.microsequenceKey,
        targetCourseKey: drag.courseKey,
        targetModuleKey: drag.moduleKey,
        targetLessonKey: drag.lessonKey,
        targetPosition: toIndex
      });
      nextProject = moveResult.document;
      versionReference = {
        level: "lesson",
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey
      };
    } else if (drag.level === "card") {
      const microsequence = findMicrosequence(
        state.project,
        drag.courseKey,
        drag.moduleKey,
        drag.lessonKey,
        drag.microsequenceKey
      );
      const items = microsequence?.cards || [];
      const toIndex = resolveStructureDropIndex(items, drag.cardKey, target.cardKey, position);
      if (toIndex === null) {
        resetStructureDragState();
        return;
      }
      nextProject = editor.moveCard({
        courseKey: drag.courseKey,
        moduleKey: drag.moduleKey,
        lessonKey: drag.lessonKey,
        microsequenceKey: drag.microsequenceKey,
        cardKey: drag.cardKey,
        toIndex
      });
    }

    if (!nextProject) {
      resetStructureDragState();
      return;
    }

    state.entityEditor = null;
    if (versionReference) {
      createStructureVersionFromProject(nextProject, versionReference, {
        operationType: "reorder-children"
      });
    }
    setProject(nextProject);
    applySelectionByKeys(nextProject, state.selection);
    syncAssistDraft();
    if (state.view === "microsequence-assist") {
      syncActiveMicrosequenceVersionFromProject();
    }
    if (state.view === "microsequence" || state.view === "microsequence-assist") {
      ensureCurrentCardSnapshot();
    }
    resetStructureDragState();
    render({ preserveState: true });
  }

  function buildLessonAuditPrompt(lesson, report) {
    return [
      "Melhore a lição passo a passo.",
      "Não faça resumo genérico.",
      report.uncoveredItems.length ? `Cubra estas lacunas reais: ${report.uncoveredItems.join("; ")}.` : "",
      report.explainedWithoutPractice.length
        ? `Adicione prática para: ${report.explainedWithoutPractice.join("; ")}.`
        : "",
      report.practiceWithoutVariation.length
        ? `Varie a prática de: ${report.practiceWithoutVariation.join("; ")}.`
        : "",
      report.examMissing.length ? `Inclua formato de prova para: ${report.examMissing.join("; ")}.` : "",
      `Lição atual: ${lesson?.title || "Lição"}.`
    ]
      .filter(Boolean)
      .join(" ");
  }

  function buildMicrosequenceAuditPrompt(microsequence, audit) {
    return [
      "Melhore esta microssequência passo a passo.",
      "Não faça resumo genérico.",
      audit.shallowErrors[0]?.message || "",
      audit.missingDepth[0]?.message || "",
      audit.suggestedActions[0] || "",
      `Microssequência atual: ${microsequence?.title || "Microssequência"}.`
    ]
      .filter(Boolean)
      .join(" ");
  }

  function deepenLessonFromAction() {
    const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
    const moduleKey = state.entityEditor.moduleKey;
    const lessonKey = state.entityEditor.lessonKey;
    const course = findCourse(state.project, courseKey);
    const moduleValue = findModule(state.project, courseKey, moduleKey);
    const lesson = findLesson(state.project, courseKey, moduleKey, lessonKey);
    const report = buildLessonDomainCoverageReport(lesson);

    state.entityEditor = null;
    state.generationDraft.courseFixed = true;
    state.generationDraft.moduleFixed = true;
    state.generationDraft.lessonFixed = true;
    state.generationDraft.courseInput = course?.title || courseKey || "";
    state.generationDraft.courseKey = courseKey || "";
    state.generationDraft.moduleInput = moduleValue?.title || moduleKey || "";
    state.generationDraft.moduleKey = moduleKey || "";
    state.generationDraft.lessonInput = lesson?.title || lessonKey || "";
    state.generationDraft.lessonKey = lesson?.key || "";
    state.generationDraft.promptText = buildLessonAuditPrompt(lesson, report);
    state.generationPanelOpen = true;
    notifyUser(
      report.uncoveredItems.length || report.explainedWithoutPractice.length || report.practiceWithoutVariation.length
        ? "Lacunas detectadas. O painel foi preparado com um pedido focado."
        : "Nenhuma lacuna didática clara foi detectada nesta lição."
    );
    render({ preserveState: true });
  }

  function deepenMicrosequenceFromAction() {
    const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
    const moduleKey = state.entityEditor.moduleKey;
    const lessonKey = state.entityEditor.lessonKey;
    const microsequenceKey = state.entityEditor.microsequenceKey;
    const lesson = findLesson(state.project, courseKey, moduleKey, lessonKey);
    const microsequence = findMicrosequence(state.project, courseKey, moduleKey, lessonKey, microsequenceKey);
    const audit = validateDidacticDepth({
      lesson,
      microsequence,
      cards: microsequence?.cards || [],
      existingMicrosequences: lesson?.microsequences || []
    });

    state.entityEditor = null;
    openMicrosequenceAssistPage(microsequence.key, 0);
    state.assistDraft.promptText = buildMicrosequenceAuditPrompt(microsequence, audit);
    state.assistDraft.lastRequest = {
      title: audit.ok ? "Sem lacunas claras" : "Lacunas detectadas",
      description: audit.ok
        ? "A microssequência já está coesa para o nível atual."
        : [...audit.shallowErrors, ...audit.missingDepth].map((item) => item.message).slice(0, 2).join(" "),
      timestamp: new Date().toISOString()
    };
    render({ preserveState: true });
  }

  function runEntityAction(actionKey) {
    if (!state.entityEditor || !actionKey) return;

    try {
      let nextProject = null;

      if (actionKey.startsWith("set-assist-container:")) {
        const nextContainer = actionKey.slice("set-assist-container:".length);
        state.assistDraft.preferredContainer = ASSIST_CARD_CONTAINER_OPTIONS.some((item) => item.value === nextContainer)
          ? nextContainer
          : "";
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      }

      if (actionKey === "import-json") {
        importJsonFromFile()
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar JSON.");
          });
        return;
      } else if (actionKey === "export-backup") {
        downloadJsonFile("aralearn-backup.json", storage.exportJson());
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "import-module") {
        importModuleFromFile(state.selection.courseKey)
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar módulo.");
          });
        return;
      } else if (actionKey === "import-lesson") {
        importLessonFromFile(state.selection.courseKey, state.selection.moduleKey)
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar lição.");
          });
        return;
      } else if (actionKey === "import-microsequence") {
        importMicrosequenceFromFile(state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey)
          .then(() => {
            state.entityEditor = null;
            render({ preserveState: false });
          })
          .catch((error) => {
            notifyUser(error instanceof Error ? error.message : "Falha ao importar microssequência.");
          });
        return;
      } else if (actionKey === "edit-course-metadata") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        openEntityEditor("course-metadata", { courseKey });
        return;
      } else if (actionKey === "edit-module-metadata") {
        openEntityEditor("module", {
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey
        });
        return;
      } else if (actionKey === "edit-lesson-metadata") {
        openEntityEditor("lesson", {
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey
        });
        return;
      } else if (actionKey === "deepen-lesson") {
        deepenLessonFromAction();
        return;
      } else if (actionKey === "edit-microsequence-metadata") {
        openMicrosequenceAssistPage(
          state.entityEditor.microsequenceKey,
          0
        );
        return;
      } else if (actionKey === "deepen-microsequence") {
        deepenMicrosequenceFromAction();
        return;
      } else if (actionKey === "reset-course-progress") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const course = findCourse(state.project, courseKey);
        if (typeof globalThis.confirm === "function") {
          const accepted = globalThis.confirm(`Zerar progresso de todo o curso "${course.title || "Curso"}"?`);
          if (!accepted) {
            return;
          }
        }
        resetCourseProgress(courseKey);
        state.entityEditor = null;
        render({ preserveState: false });
        return;
      } else if (actionKey === "reset-module-progress") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleValue = findModule(state.project, courseKey, state.entityEditor.moduleKey);
        if (typeof globalThis.confirm === "function") {
          const accepted = globalThis.confirm(`Zerar progresso de todo o módulo "${moduleValue.title || "Módulo"}"?`);
          if (!accepted) {
            return;
          }
        }
        resetModuleProgress(courseKey, state.entityEditor.moduleKey);
        state.entityEditor = null;
        render({ preserveState: false });
        return;
      } else if (actionKey === "reset-lesson-progress") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const lesson = findLesson(state.project, courseKey, state.entityEditor.moduleKey, state.entityEditor.lessonKey);
        if (typeof globalThis.confirm === "function") {
          const accepted = globalThis.confirm(`Zerar progresso da lição "${lesson.title || "Lição"}"?`);
          if (!accepted) {
            return;
          }
        }
        resetLessonProgress(courseKey, state.entityEditor.moduleKey, state.entityEditor.lessonKey);
        state.entityEditor = null;
        render({ preserveState: false });
        return;
      } else if (actionKey === "export-course") {
        exportCourseAsJson(state.entityEditor.courseKey || state.selection.courseKey);
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "export-module") {
        exportModuleAsJson(state.entityEditor.courseKey || state.selection.courseKey, state.entityEditor.moduleKey);
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "export-lesson") {
        exportLessonAsJson(
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey,
          state.entityEditor.lessonKey
        );
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "export-microsequence") {
        exportMicrosequenceAsJson(
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey,
          state.entityEditor.lessonKey,
          state.entityEditor.microsequenceKey
        );
        state.entityEditor = null;
        render({ preserveState: true });
        return;
      } else if (actionKey === "move-card-up") {
        nextProject = moveSelectedCard(-1);
        state.view = "microsequence-assist";
      } else if (actionKey === "move-card-down") {
        nextProject = moveSelectedCard(1);
        state.view = "microsequence-assist";
      } else if (actionKey === "create-course") {
        nextProject = structuralEditor.createCourse({
          title: "Novo curso"
        });
        const course = nextProject.courses[nextProject.courses.length - 1];
        setProject(nextProject);
        syncActiveStructureVersionFromProject({
          level: "course",
          courseKey: course?.key
        });
        applySelection(buildNodeSelection({ courseKey: course.key }));
        state.view = "courses";
      } else if (actionKey === "delete-course") {
        resetCourseProgress(state.entityEditor.courseKey || state.selection.courseKey);
        nextProject = structuralEditor.deleteCourse({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey
        });
        setProject(nextProject);
        selectFirstPath(nextProject);
        state.view = "courses";
      } else if (actionKey === "create-module") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        nextProject = structuralEditor.createModule({
          courseKey,
          title: "Novo módulo"
        });
        createStructureVersionFromProject(nextProject, {
          level: "course",
          courseKey
        }, {
          operationType: "create-child"
        });
        setProject(nextProject);
        const course = findCourse(nextProject, courseKey);
        const moduleValue = course.modules[course.modules.length - 1];
        syncActiveStructureVersionFromProject({
          level: "module",
          courseKey,
          moduleKey: moduleValue?.key
        });
        applySelection(buildNodeSelection({ courseKey: course.key, moduleKey: moduleValue.key }));
        state.view = "course";
      } else if (actionKey === "delete-module") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        resetModuleProgress(state.entityEditor.courseKey || state.selection.courseKey, state.entityEditor.moduleKey);
        nextProject = structuralEditor.deleteModule({
          courseKey,
          moduleKey: state.entityEditor.moduleKey
        });
        createStructureVersionFromProject(nextProject, {
          level: "course",
          courseKey
        }, {
          operationType: "remove-child"
        });
        setProject(nextProject);
        applySelection(buildNodeSelection({ courseKey }));
        state.view = "course";
      } else if (actionKey === "create-lesson") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey;
        nextProject = structuralEditor.createLesson({
          courseKey,
          moduleKey,
          title: "Nova lição"
        });
        createStructureVersionFromProject(nextProject, {
          level: "module",
          courseKey,
          moduleKey
        }, {
          operationType: "create-child"
        });
        setProject(nextProject);
        const moduleValue = findModule(nextProject, courseKey, moduleKey);
        const lesson = moduleValue.lessons[moduleValue.lessons.length - 1];
        syncActiveStructureVersionFromProject({
          level: "lesson",
          courseKey,
          moduleKey,
          lessonKey: lesson?.key
        });
        applySelection(
          buildNodeSelection({
            courseKey,
            moduleKey: moduleValue.key,
            lessonKey: lesson.key
          })
        );
        state.view = "module";
      } else if (actionKey === "delete-lesson") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey;
        resetLessonProgress(
          courseKey,
          moduleKey,
          state.entityEditor.lessonKey
        );
        nextProject = structuralEditor.deleteLesson({
          courseKey,
          moduleKey,
          lessonKey: state.entityEditor.lessonKey
        });
        createStructureVersionFromProject(nextProject, {
          level: "module",
          courseKey,
          moduleKey
        }, {
          operationType: "remove-child"
        });
        setProject(nextProject);
        applySelection(buildNodeSelection({ courseKey, moduleKey }));
        state.view = "module";
      } else if (actionKey === "create-microsequence") {
        nextProject = editor.createMicrosequence({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          title: "Nova microssequência",
          tags: [],
          status: "draft",
          cards: []
        });
        createStructureVersionFromProject(nextProject, {
          level: "lesson",
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey
        }, {
          operationType: "create-child"
        });
        setProject(nextProject);
        const lesson = findLesson(
          nextProject,
          state.entityEditor.courseKey || state.selection.courseKey,
          state.entityEditor.moduleKey,
          state.entityEditor.lessonKey
        );
        const microsequence = lesson.microsequences[lesson.microsequences.length - 1];
        applySelection(
          buildNodeSelection({
            courseKey: state.entityEditor.courseKey || state.selection.courseKey,
            moduleKey: state.entityEditor.moduleKey,
            lessonKey: lesson.key,
            microsequenceKey: microsequence.key
          })
        );
        state.view = "lesson";
      } else if (actionKey === "delete-microsequence") {
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey;
        const lessonKey = state.entityEditor.lessonKey;
        nextProject = editor.deleteMicrosequence({
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey: state.entityEditor.microsequenceKey
        });
        createStructureVersionFromProject(nextProject, {
          level: "lesson",
          courseKey,
          moduleKey,
          lessonKey
        }, {
          operationType: "remove-child"
        });
        setProject(nextProject);
        applySelection(buildNodeSelection({ courseKey, moduleKey, lessonKey }));
        state.view = "lesson";
      } else if (actionKey === "create-card" || actionKey === "create-plane-card" || actionKey === "create-matrix-card") {
        const kind =
          actionKey === "create-plane-card"
            ? "plane"
            : actionKey === "create-matrix-card"
              ? "matrix"
              : "say";
        const courseKey = state.entityEditor.courseKey || state.selection.courseKey;
        const moduleKey = state.entityEditor.moduleKey || state.selection.moduleKey;
        const lessonKey = state.entityEditor.lessonKey || state.selection.lessonKey;
        const microsequenceKey = state.entityEditor.microsequenceKey || state.selection.microsequenceKey;
        const microsequence = findMicrosequence(state.project, courseKey, moduleKey, lessonKey, microsequenceKey);
        const position =
          state.entityEditor.kind === "card"
            ? (Number.isInteger(state.selection.cardIndex) ? state.selection.cardIndex : 0) + 1
            : Array.isArray(microsequence?.cards)
              ? microsequence.cards.length
              : 0;
        createCardAtPosition(position, kind, {
          courseKey,
          moduleKey,
          lessonKey,
          microsequenceKey
        });
        state.view = "microsequence-assist";
      } else if (actionKey === "delete-card") {
        state.entityEditor = null;
        deleteCurrentCard();
        return;
      }

      state.entityEditor = null;
      render({ preserveState: false });
    } catch {
      // Mantém a UI operacional se a ação estrutural falhar por estado transitório.
    }
  }

  function goBack() {
    if (
      state.view === "microsequence-assist" &&
      getMicrosequenceEditBaseVersionId() &&
      getMicrosequenceVersionEntry()?.activeVersionId &&
      getMicrosequenceEditBaseVersionId() !== getMicrosequenceVersionEntry()?.activeVersionId
    ) {
      restoreMicrosequenceProjectToActiveVersion();
    }

    state.cardCommentOpen = false;
    state.versionHistoryOpen = false;
    state.versionCompareOpen = false;
    state.assistConfigOpen = false;
    state.codexCliSetupOpen = false;
    state.entityEditor = null;

    if (state.view === "microsequence") {
      state.view = "lesson";
      state.microsequenceMode = "play";
    } else if (state.view === "microsequence-assist") {
      state.view = "lesson";
      state.microsequenceMode = "play";
    } else if (state.view === "lesson") {
      state.view = "module";
    } else if (state.view === "module") {
      state.view = "course";
    } else if (state.view === "course") {
      state.view = "courses";
    }

    syncVisibleStructureVersionsFromProject();
    render({ preserveState: true });
  }

  function updateEntityDraft(payload) {
    if (!state.entityEditor) return;

    try {
      let nextProject = null;
      if (state.entityEditor.kind === "course") {
        nextProject = structuralEditor.updateCourse({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          title: payload.title,
          description: payload.description
        });
      } else if (state.entityEditor.kind === "course-metadata") {
        nextProject = structuralEditor.updateCourse({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          title: payload.title,
          description: payload.description
        });
      } else if (state.entityEditor.kind === "module") {
        nextProject = structuralEditor.updateModule({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          title: payload.title,
          description: payload.description
        });
      } else if (state.entityEditor.kind === "lesson") {
        nextProject = structuralEditor.updateLesson({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          title: payload.title,
          description: payload.description
        });
      } else if (state.entityEditor.kind === "lesson-source-guide") {
        const nextGuide = resolveSourceGuidePayload(payload, { level: SOURCE_GUIDE_LEVELS.LESSON });
        const lessonGuidance = normalizeLessonGuidance(payload);
        nextProject = structuralEditor.updateLesson({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          sourceGuide: nextGuide.sourceGuide,
          sourceGuideStructured: nextGuide.sourceGuideStructured,
          resourceTags: lessonGuidance.resourceTags,
          contentTypeTags: lessonGuidance.contentTypeTags,
          learningActionTags: lessonGuidance.learningActionTags,
          supportLevel: lessonGuidance.supportLevel
        });
      } else if (state.entityEditor.kind === "microsequence") {
        nextProject = editor.updateMicrosequence({
          courseKey: state.entityEditor.courseKey || state.selection.courseKey,
          moduleKey: state.entityEditor.moduleKey,
          lessonKey: state.entityEditor.lessonKey,
          microsequenceKey: state.entityEditor.microsequenceKey,
          title: payload.title,
          tags: parseTagsText(payload.tags)
        });
      }

      if (nextProject) {
        setProject(nextProject);
        if (
          state.entityEditor.kind === "course" ||
          state.entityEditor.kind === "course-metadata"
        ) {
          syncActiveStructureVersionFromProject({
            level: "course",
            courseKey: state.entityEditor.courseKey || state.selection.courseKey
          });
        } else if (state.entityEditor.kind === "module") {
          syncActiveStructureVersionFromProject({
            level: "module",
            courseKey: state.entityEditor.courseKey || state.selection.courseKey,
            moduleKey: state.entityEditor.moduleKey
          });
        } else if (state.entityEditor.kind === "lesson" || state.entityEditor.kind === "lesson-source-guide") {
          syncActiveStructureVersionFromProject({
            level: "lesson",
            courseKey: state.entityEditor.courseKey || state.selection.courseKey,
            moduleKey: state.entityEditor.moduleKey,
            lessonKey: state.entityEditor.lessonKey
          });
        } else if (state.entityEditor.kind === "microsequence") {
          syncActiveMicrosequenceVersionFromProject();
        }
      }
    } catch {
      // Evita quebrar a digitação durante estados transitórios inválidos.
    }
  }

  function updateMicrosequenceDraft(payload) {
    const microsequenceKey = state.selection.microsequenceKey;
    if (!microsequenceKey) return;

    try {
      ensureEditableMicrosequenceBranch({
        operationType: "edit",
        label: "Edição local"
      });
      const nextProject = editor.updateMicrosequence({
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey,
        microsequenceKey,
        title: payload.title,
        tags: parseTagsText(payload.tags)
      });

      setProject(nextProject);
      syncActiveStructureVersionFromProject({
        level: "lesson",
        courseKey: state.selection.courseKey,
        moduleKey: state.selection.moduleKey,
        lessonKey: state.selection.lessonKey
      });
      syncActiveMicrosequenceVersionFromProject();
    } catch {
      // Evita quebrar a digitação durante estados transitórios inválidos.
    }
  }

  function setFlowchartViewportScale(scrollNode, nextScale, anchorClientX = null, anchorClientY = null) {
    if (!scrollNode) {
      return;
    }

    const previousScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
    const safeScale = clampFlowchartScale(nextScale);
    const baseWidth = Number(scrollNode.getAttribute("data-flowchart-base-width") || 0);
    const baseHeight = Number(scrollNode.getAttribute("data-flowchart-base-height") || 0);
    const stage = scrollNode.querySelector("[data-flowchart-stage='true']");
    const canvas = scrollNode.querySelector("[data-flowchart-canvas='true']");
    const valueButton = scrollNode.parentElement?.querySelector("[data-action='flowchart-zoom-reset']");
    let anchorContentX = null;
    let anchorContentY = null;

    if (
      Number.isFinite(Number(anchorClientX)) &&
      Number.isFinite(Number(anchorClientY)) &&
      previousScale > 0
    ) {
      const rect = scrollNode.getBoundingClientRect();
      anchorContentX = (scrollNode.scrollLeft + (Number(anchorClientX) - rect.left)) / previousScale;
      anchorContentY = (scrollNode.scrollTop + (Number(anchorClientY) - rect.top)) / previousScale;
    }

    scrollNode.setAttribute("data-flowchart-scale", safeScale.toFixed(3));
    if (canvas) {
      canvas.style.transform = `scale(${safeScale.toFixed(3)})`;
    }
    if (stage && baseWidth > 0 && baseHeight > 0) {
      stage.style.width = `${Math.max(1, Math.round(baseWidth * safeScale))}px`;
      stage.style.height = `${Math.max(1, Math.round(baseHeight * safeScale))}px`;
    }
    if (valueButton) {
      valueButton.textContent = `${Math.round(safeScale * 100)}%`;
    }
    if (
      anchorContentX !== null &&
      anchorContentY !== null &&
      Number.isFinite(anchorContentX) &&
      Number.isFinite(anchorContentY)
    ) {
      const rect = scrollNode.getBoundingClientRect();
      scrollNode.scrollLeft = Math.max(0, anchorContentX * safeScale - (Number(anchorClientX) - rect.left));
      scrollNode.scrollTop = Math.max(0, anchorContentY * safeScale - (Number(anchorClientY) - rect.top));
    }
  }

  function autoFitFlowchartViewport(scrollNode) {
    if (!scrollNode || scrollNode.getAttribute("data-flowchart-autofit") === "true") {
      return;
    }

    const baseWidth = Number(scrollNode.getAttribute("data-flowchart-base-width") || 0);
    const baseHeight = Number(scrollNode.getAttribute("data-flowchart-base-height") || 0);
    const preferredScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);

    if (!(baseWidth > 0 && baseHeight > 0)) {
      return;
    }

    const targetScale = computeFlowchartAutoFitScale({
      viewportWidth: scrollNode.clientWidth,
      viewportHeight: scrollNode.clientHeight,
      baseWidth,
      baseHeight,
      preferredScale,
      padding: 12,
      minScale: 0.2,
      maxScale: 1.2
    });

    setFlowchartViewportScale(scrollNode, targetScale);
    scrollNode.setAttribute("data-flowchart-autofit", "true");
  }

  function getTouchDistance(touchA, touchB) {
    if (!touchA || !touchB) {
      return 0;
    }
    const dx = touchA.clientX - touchB.clientX;
    const dy = touchA.clientY - touchB.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchMidpoint(touchA, touchB) {
    return {
      x: (touchA.clientX + touchB.clientX) / 2,
      y: (touchA.clientY + touchB.clientY) / 2
    };
  }

  function autosizeTextGapField(node) {
    if (!node || (node.tagName !== "TEXTAREA" && node.tagName !== "INPUT")) {
      return;
    }
    const value = String(node.value || "");
    const longestLine = value.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
    node.style.width = `${Math.max(1, longestLine || 1)}ch`;
    if (node.tagName === "TEXTAREA") {
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    }
  }

  function normalizeTextGapContentEditableValue(node) {
    if (!node) return "";
    const raw = String(node.textContent || "").replace(/\u2007/g, "");
    // Lacunas textuais sao tokens inline; evita quebras de linha e espacos acidentais.
    return raw.replace(/\s+/g, " ").trim();
  }

  function getCurrentCardRuntimeBlocks(card = getRenderContext().card) {
    const runtime = resolveCardRuntime(card);
    return Array.isArray(runtime?.blocks) ? runtime.blocks : [];
  }

  function collectRuntimeBlockEntries(blocks, blockKeyPrefix, predicate) {
    return (Array.isArray(blocks) ? blocks : [])
      .map((block, index) => ({
        block,
        blockKey: `${blockKeyPrefix}::${index}`
      }))
      .filter((entry) => predicate(entry.block));
  }

  function parseTextGapAnswers(text) {
    const source = String(text || "");
    const answers = [];
    let index = 0;

    while (index < source.length) {
      const start = source.indexOf("[[", index);
      if (start < 0) {
        break;
      }

      const end = source.indexOf("]]", start + 2);
      if (end < 0) {
        break;
      }

      const raw = source.slice(start + 2, end);
      const delimiterIndex = raw.indexOf("::");
      answers.push(delimiterIndex >= 0 ? raw.slice(0, delimiterIndex) : raw);
      index = end + 2;
    }

    return answers;
  }

  function parseTextGapParts(text) {
    const source = String(text || "");
    const parts = [];
    let index = 0;
    let blankIndex = 0;

    while (index < source.length) {
      const start = source.indexOf("[[", index);
      if (start < 0) {
        break;
      }

      const end = source.indexOf("]]", start + 2);
      if (end < 0) {
        break;
      }

      const raw = source.slice(start + 2, end);
      const delimiterIndex = raw.indexOf("::");
      const expected = delimiterIndex >= 0 ? raw.slice(0, delimiterIndex) : raw;
      const options =
        delimiterIndex >= 0
          ? raw
              .slice(delimiterIndex + 2)
              .split("|")
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [];

      parts.push({ index: blankIndex, expected, options });
      blankIndex += 1;
      index = end + 2;
    }

    return parts;
  }

  function getTextGapAnswersForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }

    if (block.kind === "complete") {
      return parseTextGapAnswers(block.text);
    }
    if (block.kind === "paragraph" || block.kind === "editor") {
      return parseTextGapAnswers(block.value);
    }
    if (block.kind === "table") {
      const answers = [];
      (Array.isArray(block.rows) ? block.rows : []).forEach((row) => {
        (Array.isArray(row) ? row : []).forEach((cell) => {
          answers.push(...parseTextGapAnswers(cell?.value || ""));
        });
      });
      return answers;
    }
    if (block.kind === "plane") {
      return parseTextGapAnswers(block.resultText);
    }
    if (block.kind === "matrix") {
      const answers = [];
      getMatrixTextGapItems(block).forEach((matrixItem) => {
        (Array.isArray(matrixItem?.values) ? matrixItem.values : []).forEach((row) => {
          (Array.isArray(row) ? row : []).forEach((cell) => {
            answers.push(...parseTextGapAnswers(cell?.value || ""));
          });
        });
      });
      return answers;
    }

    return [];
  }

  function blockUsesTextGapExercise(block) {
    return getTextGapAnswersForBlock(block).length > 0;
  }

  function getMatrixTextGapItems(block) {
    return Array.isArray(block?.sequence) && block.sequence.length ? block.sequence : [block];
  }

  function appendTextGapBlankParts(parts, source) {
    parseTextGapParts(source).forEach((part) => {
      if (part.kind === "blank") {
        parts.push({ ...part, index: parts.length });
      }
    });
  }

  function listTextGapPartsForBlock(block) {
    if (!block || typeof block !== "object") {
      return [];
    }

    if (block.kind === "complete") {
      const parts = [];
      appendTextGapBlankParts(parts, block.text);
      return parts;
    }
    if (block.kind === "paragraph" || block.kind === "editor") {
      const parts = [];
      appendTextGapBlankParts(parts, block.value);
      return parts;
    }
    if (block.kind === "table") {
      const parts = [];
      (Array.isArray(block.rows) ? block.rows : []).forEach((row) => {
        (Array.isArray(row) ? row : []).forEach((cell) => {
          appendTextGapBlankParts(parts, cell?.value || "");
        });
      });
      return parts;
    }
    if (block.kind === "plane") {
      const parts = [];
      appendTextGapBlankParts(parts, block.resultText);
      return parts;
    }
    if (block.kind === "matrix") {
      const parts = [];
      getMatrixTextGapItems(block).forEach((matrixItem) => {
        (Array.isArray(matrixItem?.values) ? matrixItem.values : []).forEach((row) => {
          (Array.isArray(row) ? row : []).forEach((cell) => {
            appendTextGapBlankParts(parts, cell?.value || "");
          });
        });
      });
      return parts;
    }

    return [];
  }

  function getCurrentPopupRuntimeButtonEntry(card = getRenderContext().card) {
    const popupEntry = getRuntimePopupButtonEntry(card);
    if (!popupEntry) {
      return null;
    }

    return {
      ...popupEntry,
      blockKey: `${buildCardPathKey(state.selection)}::${popupEntry.index}`
    };
  }

  function getCurrentCardRuntimeFlowcharts(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => block?.kind === "flowchart" && block?.projection
    );
  }

  function getCurrentFlowchartEntry(blockKey) {
    return (
      [
        ...getCurrentCardRuntimeFlowcharts(),
        ...getCurrentPopupRuntimeFlowcharts()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getCurrentCardRuntimeChoiceBlocks(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => block?.kind === "multiple_choice"
    );
  }

  function getCurrentCardRuntimeCompleteBlocks(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => blockUsesTextGapExercise(block)
    );
  }

  function getCurrentCardRuntimeDirectoryTrees(card = getRenderContext().card) {
    if (!card) {
      return [];
    }

    return collectRuntimeBlockEntries(
      getCurrentCardRuntimeBlocks(card),
      buildCardPathKey(state.selection),
      (block) => block?.kind === "directory_tree"
    );
  }

  function getCurrentPopupRuntimeDirectoryTrees(card = getRenderContext().card) {
    const popupEntry = getCurrentPopupRuntimeButtonEntry(card);
    if (!popupEntry) {
      return [];
    }

    return collectRuntimeBlockEntries(
      popupEntry.block.popupBlocks,
      `${popupEntry.blockKey}::popup`,
      (block) => block?.kind === "directory_tree"
    );
  }

  function getCurrentDirectoryTreeEntry(blockKey) {
    return (
      [
        ...getCurrentCardRuntimeDirectoryTrees(),
        ...getCurrentPopupRuntimeDirectoryTrees()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getCurrentChoiceEntry(blockKey) {
    return (
      [
        ...getCurrentCardRuntimeChoiceBlocks(),
        ...getCurrentPopupRuntimeChoiceBlocks()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getCurrentCompleteEntry(blockKey) {
    return (
      [
        ...getCurrentCardRuntimeCompleteBlocks(),
        ...getCurrentPopupRuntimeCompleteBlocks()
      ].find((entry) => entry.blockKey === blockKey) || null
    );
  }

  function getCurrentPopupRuntimeFlowcharts(card = getRenderContext().card) {
    const popupEntry = getCurrentPopupRuntimeButtonEntry(card);
    if (!popupEntry) {
      return [];
    }

    return collectRuntimeBlockEntries(
      popupEntry.block.popupBlocks,
      `${popupEntry.blockKey}::popup`,
      (block) => block?.kind === "flowchart" && block?.projection
    );
  }

  function getCurrentPopupRuntimeChoiceBlocks(card = getRenderContext().card) {
    const popupEntry = getCurrentPopupRuntimeButtonEntry(card);
    if (!popupEntry) {
      return [];
    }

    return collectRuntimeBlockEntries(
      popupEntry.block.popupBlocks,
      `${popupEntry.blockKey}::popup`,
      (block) => block?.kind === "multiple_choice"
    );
  }

  function getCurrentPopupRuntimeCompleteBlocks(card = getRenderContext().card) {
    const popupEntry = getCurrentPopupRuntimeButtonEntry(card);
    if (!popupEntry) {
      return [];
    }

    return collectRuntimeBlockEntries(
      popupEntry.block.popupBlocks,
      `${popupEntry.blockKey}::popup`,
      (block) => blockUsesTextGapExercise(block)
    );
  }

  function ensureCurrentChoiceExerciseState() {
    const choices = [
      ...getCurrentCardRuntimeChoiceBlocks(),
      ...getCurrentPopupRuntimeChoiceBlocks()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      choiceExerciseStateByBlockKey: {},
      exerciseShuffleSeed: `${buildCardPathKey(state.selection)}::load::${state.cardExerciseLoadVersion}`
    };

    choices.forEach((entry) => {
      const current = state.choiceExerciseByBlockKey[entry.blockKey];
      const selected = Array.isArray(current?.selected)
        ? current.selected.map((item) => {
            if (Number.isInteger(item)) {
              const options = Array.isArray(entry.block?.options) ? entry.block.options : [];
              return item >= 0 && item < options.length ? getExerciseOptionStableId(options[item], item) : null;
            }
            const value = String(item || "").trim();
            return value || null;
          }).filter(Boolean)
        : [];
      state.choiceExerciseByBlockKey[entry.blockKey] = {
        selected,
        feedback: current?.feedback || null
      };
      runtimeOptions.choiceExerciseStateByBlockKey[entry.blockKey] = state.choiceExerciseByBlockKey[entry.blockKey];
    });

    return runtimeOptions;
  }

  function ensureCurrentCompleteExerciseState() {
    const completes = [
      ...getCurrentCardRuntimeCompleteBlocks(),
      ...getCurrentPopupRuntimeCompleteBlocks()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      completeExerciseStateByBlockKey: {},
      textGapExerciseStateByBlockKey: {}
    };

    completes.forEach((entry) => {
      const current = state.completeExerciseByBlockKey[entry.blockKey];
      state.completeExerciseByBlockKey[entry.blockKey] = {
        values: Array.isArray(current?.values) ? current.values : [],
        feedback: current?.feedback || null
      };
      runtimeOptions.completeExerciseStateByBlockKey[entry.blockKey] = state.completeExerciseByBlockKey[entry.blockKey];
      runtimeOptions.textGapExerciseStateByBlockKey[entry.blockKey] = state.completeExerciseByBlockKey[entry.blockKey];
    });

    return runtimeOptions;
  }

  function setChoiceSelection(blockKey, optionId, checked) {
    if (!getCurrentChoiceEntry(blockKey)) {
      return;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.choiceExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
    const selected = new Set(Array.isArray(exercise.selected) ? exercise.selected : []);
    const normalizedOptionId = String(optionId || "").trim();
    if (!normalizedOptionId) {
      return;
    }

    if (checked) {
      selected.add(normalizedOptionId);
    } else {
      selected.delete(normalizedOptionId);
    }

    state.choiceExerciseByBlockKey[blockKey] = {
      selected: Array.from(selected),
      feedback: null
    };

    render({ preserveState: true });
  }

  function tryAgainChoice(blockKey) {
    ensureCurrentChoiceExerciseState();
    if (!state.choiceExerciseByBlockKey[blockKey]) {
      return;
    }
    state.choiceExerciseByBlockKey[blockKey] = {
      selected: [],
      feedback: null
    };
    render({ preserveState: true });
  }

  function viewAnswerChoice(blockKey) {
    const entry = getCurrentChoiceEntry(blockKey);
    if (!entry) {
      return;
    }

    const correct = (Array.isArray(entry.block?.options) ? entry.block.options : [])
      .map((option, idx) => (option?.answer ? getExerciseOptionStableId(option, idx) : null))
      .filter(Boolean);

    ensureCurrentChoiceExerciseState();
    state.choiceExerciseByBlockKey[blockKey] = {
      selected: correct,
      feedback: "correct"
    };
    render({ preserveState: true });
  }

  function validateChoice(blockKey) {
    const entry = getCurrentChoiceEntry(blockKey);
    if (!entry) {
      return null;
    }

    ensureCurrentChoiceExerciseState();
    const exercise = state.choiceExerciseByBlockKey[blockKey] || { selected: [], feedback: null };
    const selected = new Set(Array.isArray(exercise.selected) ? exercise.selected : []);
    const options = Array.isArray(entry.block?.options) ? entry.block.options : [];
    const correct = new Set(
      options
        .map((option, idx) => (option?.answer ? getExerciseOptionStableId(option, idx) : null))
        .filter(Boolean)
    );

    if (!selected.size) {
      state.choiceExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Selecione pelo menos uma resposta.");
      focusFirstIncompleteChoice(blockKey);
      render({ preserveState: true });
      return "incomplete";
    }

    let ok = selected.size === correct.size;
    if (ok) {
      for (const idx of selected) {
        if (!correct.has(idx)) {
          ok = false;
          break;
        }
      }
    }

    state.choiceExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    render({ preserveState: true });
    return ok ? "correct" : "wrong";
  }

  function setCompleteBlank(blockKey, blankIndex, value, { rerender = false } = {}) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentCompleteExerciseState();
    const exercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const index = Number.parseInt(String(blankIndex), 10);
    if (!Number.isFinite(index) || index < 0) {
      return;
    }

    const values = Array.isArray(exercise.values) ? exercise.values.slice() : [];
    while (values.length <= index) {
      values.push("");
    }
    values[index] = String(value ?? "");
    const hadFeedback = exercise.feedback !== null;
    state.completeExerciseByBlockKey[blockKey] = { values, feedback: null };
    if (rerender || hadFeedback) {
      render({ preserveState: true });
    }
  }

  function openTextGapChoicePrompt(blockKey, blankIndex) {
    ensureCurrentCompleteExerciseState();
    const currentExercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const currentValues = Array.isArray(currentExercise.values) ? currentExercise.values : [];
    const index = Number.parseInt(String(blankIndex), 10);
    const currentValue = index >= 0 ? String(currentValues[index] ?? "").trim() : "";
    if (currentExercise.feedback) {
      state.completeExerciseByBlockKey[blockKey] = {
        values: currentValues.slice(),
        feedback: null
      };
    }
    if (currentValue) {
      setCompleteBlank(blockKey, blankIndex, "", { rerender: false });
    }
    state.activeTextGapPrompt = {
      blockKey,
      blankIndex: Number(blankIndex)
    };
    render({ preserveState: true });
  }

  function setTextGapChoice(blockKey, blankIndex, value) {
    setCompleteBlank(blockKey, blankIndex, value, { rerender: false });
    state.activeTextGapPrompt = null;
    render({ preserveState: true });
  }

  function tryAgainComplete(blockKey) {
    ensureCurrentCompleteExerciseState();
    if (!state.completeExerciseByBlockKey[blockKey]) {
      return;
    }
    state.completeExerciseByBlockKey[blockKey] = { values: [], feedback: null };
    if (state.activeTextGapPrompt?.blockKey === blockKey) {
      state.activeTextGapPrompt = null;
    }
    render({ preserveState: true });
  }

  function viewAnswerComplete(blockKey) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return;
    }

    const answers = getTextGapAnswersForBlock(entry.block);

    ensureCurrentCompleteExerciseState();
    state.completeExerciseByBlockKey[blockKey] = { values: answers, feedback: "correct" };
    if (state.activeTextGapPrompt?.blockKey === blockKey) {
      state.activeTextGapPrompt = null;
    }
    render({ preserveState: true });
  }

  function validateComplete(blockKey) {
    const entry = getCurrentCompleteEntry(blockKey);
    if (!entry) {
      return null;
    }

    ensureCurrentCompleteExerciseState();
    const exercise = state.completeExerciseByBlockKey[blockKey] || { values: [], feedback: null };
    const values = Array.isArray(exercise.values) ? exercise.values : [];
    const answers = getTextGapAnswersForBlock(entry.block);

    if (!answers.length) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "correct" };
      render({ preserveState: true });
      return "correct";
    }

    const normalizedValues = answers.map((_, idx) => String(values[idx] ?? "").trim().toLowerCase());
    const normalizedAnswers = answers.map((item) => String(item ?? "").trim().toLowerCase());

    if (normalizedValues.some((value) => !value)) {
      state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: "incomplete" };
      notifyIncompleteExercise("Preencha todas as lacunas.");
      focusFirstIncompleteTextGap(blockKey);
      render({ preserveState: true });
      return "incomplete";
    }

    const ok = normalizedValues.every((value, idx) => value === normalizedAnswers[idx]);
    state.completeExerciseByBlockKey[blockKey] = { ...exercise, feedback: ok ? "correct" : "wrong" };
    render({ preserveState: true });
    return ok ? "correct" : "wrong";
  }

  function ensureCurrentFlowchartPracticeState() {
    const flowcharts = [
      ...getCurrentCardRuntimeFlowcharts(),
      ...getCurrentPopupRuntimeFlowcharts()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      enableFlowchartPractice: true,
      flowchartExerciseStateByBlockKey: {},
      activeFlowchartPrompt: null
    };

    flowcharts.forEach((entry) => {
      state.flowchartPracticeByBlockKey[entry.blockKey] = createFlowchartExerciseState(
        entry.block.projection,
        state.flowchartPracticeByBlockKey[entry.blockKey]
      );
      runtimeOptions.flowchartExerciseStateByBlockKey[entry.blockKey] = state.flowchartPracticeByBlockKey[entry.blockKey];
    });

    if (state.activeFlowchartPrompt && runtimeOptions.flowchartExerciseStateByBlockKey[state.activeFlowchartPrompt.blockKey]) {
      runtimeOptions.activeFlowchartPrompt = state.activeFlowchartPrompt;
    } else {
      state.activeFlowchartPrompt = null;
    }

    return runtimeOptions;
  }

  function getDirectoryTreePracticeSignature(block) {
    return JSON.stringify({
      base: block?.base || "/",
      nodes: cloneDirectoryTreeNodes(block?.nodes),
      selectedNodeId: String(block?.selectedNodeId || ""),
      currentNodeId: String(block?.currentNodeId || block?.referenceNodeId || ""),
      practice: normalizeDirectoryTreePractice(block?.practice)
    });
  }

  function getDirectoryTreeInitialSelectedNodeId(block, nodes = block?.nodes) {
    const candidateIds = [
      block?.selectedNodeId,
      block?.currentNodeId,
      block?.referenceNodeId,
      DIRECTORY_TREE_BASE_NODE_ID
    ].map((item) => String(item || ""));

    for (const candidateId of candidateIds) {
      if (getDirectoryTreePathLabels(block?.base, nodes, candidateId)) {
        return candidateId;
      }
    }

    return DIRECTORY_TREE_BASE_NODE_ID;
  }

  function createDirectoryTreeNameValues(practice, currentValues = []) {
    const template = resolveDirectoryTreePracticeNameTemplate(practice);
    const blankCount = parseTextGapParts(template).length;
    const values = Array.isArray(currentValues) ? currentValues.map((item) => String(item ?? "")) : [];
    while (values.length < blankCount) {
      values.push("");
    }
    return values.slice(0, blankCount);
  }

  function buildDirectoryTreeNameFromValues(practice, values, nodeType) {
    const template = resolveDirectoryTreePracticeNameTemplate(practice);
    if (!template) {
      return "";
    }

    const parts = parseTextGapParts(template);
    const answerByIndex = new Map(parts.map((part) => [part.index, String(values?.[part.index] ?? "").trim()]));
    if (parts.some((part) => !(answerByIndex.get(part.index) || "").length)) {
      return "";
    }

    let currentIndex = 0;
    const resolved = template.replace(/\[\[([\s\S]*?)\]\]/g, () => {
      const nextValue = answerByIndex.get(currentIndex) || "";
      currentIndex += 1;
      return nextValue;
    });
    return normalizeDirectoryTreeNodeNameByType(resolved, nodeType);
  }

  function fillDirectoryTreeAnswerValues(practice) {
    const template = resolveDirectoryTreePracticeNameTemplate(practice);
    return parseTextGapParts(template).map((part) => String(part.expected || ""));
  }

  function setDirectoryTreeState(blockKey, nextState) {
    state.directoryTreeUiByBlockKey[blockKey] = nextState;
  }

  function ensureCurrentDirectoryTreeState() {
    const trees = [
      ...getCurrentCardRuntimeDirectoryTrees(),
      ...getCurrentPopupRuntimeDirectoryTrees()
    ];
    const runtimeOptions = {
      blockKeyPrefix: buildCardPathKey(state.selection),
      directoryTreeStateByBlockKey: {}
    };

    trees.forEach((entry) => {
      const practice = normalizeDirectoryTreePractice(entry.block?.practice);
      const signature = getDirectoryTreePracticeSignature(entry.block);
      const current = state.directoryTreeUiByBlockKey[entry.blockKey] || {};
      const sourceNodes =
        current.signature === signature && Array.isArray(current.nodes)
          ? cloneDirectoryTreeNodes(current.nodes)
          : cloneDirectoryTreeNodes(entry.block?.nodes);
      const selectedNodeId = String(current.selectedNodeId || getDirectoryTreeInitialSelectedNodeId(entry.block, sourceNodes));
      const selectedIsValid = !!getDirectoryTreePathLabels(entry.block?.base, sourceNodes, selectedNodeId);
      const collapsedNodeIds = Array.from(
        new Set(
          (Array.isArray(current.collapsedNodeIds) ? current.collapsedNodeIds : Array.isArray(entry.block?.collapsedNodeIds) ? entry.block.collapsedNodeIds : [])
            .map((item) => String(item || ""))
            .filter((item) => !!getDirectoryTreePathLabels(entry.block?.base, sourceNodes, item))
        )
      );

      state.directoryTreeUiByBlockKey[entry.blockKey] = {
        signature,
        nodes: sourceNodes,
        selectedNodeId: selectedIsValid ? selectedNodeId : getDirectoryTreeInitialSelectedNodeId(entry.block, sourceNodes),
        collapsedNodeIds,
        feedback: current.signature === signature ? current.feedback || null : null,
        hasInteracted: current.signature === signature ? !!current.hasInteracted : false,
        typeValue: current.signature === signature ? String(current.typeValue || "") : "",
        nameValues: createDirectoryTreeNameValues(practice, current.signature === signature ? current.nameValues : [])
      };
      runtimeOptions.directoryTreeStateByBlockKey[entry.blockKey] = state.directoryTreeUiByBlockKey[entry.blockKey];
    });

    return runtimeOptions;
  }

  function selectDirectoryTreeNode(blockKey, nodeId) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentDirectoryTreeState();
    const normalizedNodeId = String(nodeId || DIRECTORY_TREE_BASE_NODE_ID);
    const current = state.directoryTreeUiByBlockKey[blockKey] || {
      selectedNodeId: DIRECTORY_TREE_BASE_NODE_ID,
      collapsedNodeIds: [],
      nodes: cloneDirectoryTreeNodes(entry.block?.nodes)
    };
    if (!getDirectoryTreePathLabels(entry.block?.base, current.nodes, normalizedNodeId)) {
      return;
    }

    setDirectoryTreeState(blockKey, {
      ...current,
      selectedNodeId: normalizedNodeId,
      feedback: null,
      hasInteracted: true
    });
    render({ preserveState: true });
  }

  function toggleDirectoryTreeNode(blockKey, nodeId) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return;
    }

    const normalizedNodeId = String(nodeId || "");
    if (!normalizedNodeId) {
      return;
    }

    const hasChildren =
      normalizedNodeId === DIRECTORY_TREE_BASE_NODE_ID
        ? Array.isArray(state.directoryTreeUiByBlockKey[blockKey]?.nodes) && state.directoryTreeUiByBlockKey[blockKey].nodes.length > 0
        : (() => {
            const current = state.directoryTreeUiByBlockKey[blockKey] || { nodes: cloneDirectoryTreeNodes(entry.block?.nodes) };
            const labels = getDirectoryTreePathLabels(entry.block?.base, current.nodes, normalizedNodeId);
            if (!labels) {
              return false;
            }
            const queue = [...(Array.isArray(current.nodes) ? current.nodes : [])];
            while (queue.length) {
              const node = queue.shift();
              if (String(node?.id || "") === normalizedNodeId) {
                return Array.isArray(node?.children) && node.children.length > 0;
              }
              if (Array.isArray(node?.children) && node.children.length) {
                queue.push(...node.children);
              }
            }
            return false;
          })();

    if (!hasChildren) {
      return;
    }

    ensureCurrentDirectoryTreeState();
    const current = state.directoryTreeUiByBlockKey[blockKey] || {
      selectedNodeId: DIRECTORY_TREE_BASE_NODE_ID,
      collapsedNodeIds: [],
      nodes: cloneDirectoryTreeNodes(entry.block?.nodes)
    };
    const collapsed = new Set((Array.isArray(current.collapsedNodeIds) ? current.collapsedNodeIds : []).map((item) => String(item || "")));
    if (collapsed.has(normalizedNodeId)) {
      collapsed.delete(normalizedNodeId);
    } else {
      collapsed.add(normalizedNodeId);
    }
    setDirectoryTreeState(blockKey, {
      ...current,
      collapsedNodeIds: Array.from(collapsed)
    });
    render({ preserveState: true });
  }

  function setDirectoryTreeType(blockKey, nodeType) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentDirectoryTreeState();
    const current = state.directoryTreeUiByBlockKey[blockKey];
    const normalizedNodeType = normalizeDirectoryTreeNodeType(nodeType);
    setDirectoryTreeState(blockKey, {
      ...current,
      typeValue: normalizedNodeType,
      feedback: null,
      hasInteracted: true
    });
    render({ preserveState: true });
  }

  function setDirectoryTreeNameBlank(blockKey, blankIndex, value, { rerender = false } = {}) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentDirectoryTreeState();
    const current = state.directoryTreeUiByBlockKey[blockKey];
    const index = Number.parseInt(String(blankIndex), 10);
    if (!Number.isFinite(index) || index < 0) {
      return;
    }
    const values = Array.isArray(current.nameValues) ? current.nameValues.slice() : [];
    while (values.length <= index) {
      values.push("");
    }
    values[index] = String(value ?? "");
    setDirectoryTreeState(blockKey, {
      ...current,
      nameValues: values,
      feedback: null,
      hasInteracted: true
    });
    if (rerender || current.feedback) {
      render({ preserveState: true });
    }
  }

  function clearDirectoryTreeNameBlank(blockKey, blankIndex) {
    setDirectoryTreeNameBlank(blockKey, blankIndex, "", { rerender: true });
  }

  function tryAgainDirectoryTree(blockKey) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentDirectoryTreeState();
    const current = state.directoryTreeUiByBlockKey[blockKey];
    const practice = normalizeDirectoryTreePractice(entry.block?.practice);
    setDirectoryTreeState(blockKey, {
      ...current,
      nodes: cloneDirectoryTreeNodes(entry.block?.nodes),
      selectedNodeId: getDirectoryTreeInitialSelectedNodeId(entry.block, entry.block?.nodes),
      feedback: null,
      hasInteracted: false,
      typeValue: "",
      nameValues: createDirectoryTreeNameValues(practice, [])
    });
    render({ preserveState: true });
  }

  function viewAnswerDirectoryTree(blockKey) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return;
    }

    ensureCurrentDirectoryTreeState();
    const current = state.directoryTreeUiByBlockKey[blockKey];
    const practice = normalizeDirectoryTreePractice(entry.block?.practice);
    const nextSelectedNodeId =
      practice.mode === "select"
        ? String(practice.targetNodeId || DIRECTORY_TREE_BASE_NODE_ID)
        : practice.mode === "delete"
          ? String(practice.targetNodeId || DIRECTORY_TREE_BASE_NODE_ID)
          : String(practice.targetNodeId || practice.parentNodeId || DIRECTORY_TREE_BASE_NODE_ID);
    setDirectoryTreeState(blockKey, {
      ...current,
      selectedNodeId: nextSelectedNodeId,
      feedback: "correct",
      hasInteracted: true,
      typeValue: practice.typePrompt?.expected ? practice.typePrompt.expected : "",
      nameValues: fillDirectoryTreeAnswerValues(practice)
    });
    render({ preserveState: true });
  }

  function validateDirectoryTree(blockKey) {
    const entry = getCurrentDirectoryTreeEntry(blockKey);
    if (!entry) {
      return null;
    }

    ensureCurrentDirectoryTreeState();
    const practice = normalizeDirectoryTreePractice(entry.block?.practice);
    const current = state.directoryTreeUiByBlockKey[blockKey];

    if (practice.mode === "none") {
      return "correct";
    }

    let feedback = "correct";
    const selectedNodeId = String(current.selectedNodeId || DIRECTORY_TREE_BASE_NODE_ID);
    const selectedEntry = selectedNodeId === DIRECTORY_TREE_BASE_NODE_ID ? null : findDirectoryTreeNodeEntry(entry.block?.nodes, selectedNodeId);
    const selectedNode = selectedEntry?.node || null;

    if (practice.mode === "select" || practice.mode === "delete") {
      if (!current.hasInteracted) {
        feedback = "incomplete";
      } else {
        feedback = String(selectedNodeId) === String(practice.targetNodeId || "") ? "correct" : "wrong";
      }
    } else if (practice.mode === "create_folder" || practice.mode === "create_file") {
      const expectedParentId = String(practice.parentNodeId || DIRECTORY_TREE_BASE_NODE_ID);
      const expectedType = resolveDirectoryTreePracticeExpectedType(practice);
      const actualType = practice.typePrompt?.expected
        ? String(current.typeValue || "").trim()
        : expectedType;
      const nextName = buildDirectoryTreeNameFromValues(practice, current.nameValues, actualType || expectedType || "folder");

      if (
        !current.hasInteracted ||
        !selectedNodeId ||
        (selectedNodeId !== DIRECTORY_TREE_BASE_NODE_ID && !directoryTreeNodeCanHaveChildren(selectedNode)) ||
        !actualType ||
        !nextName
      ) {
        feedback = "incomplete";
      } else {
        const expectedName = normalizeDirectoryTreeNodeNameByType(
          resolveDirectoryTreePracticeExpectedName(practice),
          expectedType || "folder"
        );
        feedback =
          selectedNodeId === expectedParentId &&
          normalizeDirectoryTreeNodeType(actualType) === normalizeDirectoryTreeNodeType(expectedType) &&
          nextName === expectedName
            ? "correct"
            : "wrong";
      }
    } else if (practice.mode === "rename") {
      const expectedTargetId = String(practice.targetNodeId || "");
      const nextName = buildDirectoryTreeNameFromValues(practice, current.nameValues, selectedNode?.type || "folder");
      if (!current.hasInteracted || !selectedNode || !nextName) {
        feedback = "incomplete";
      } else {
        const expectedName = normalizeDirectoryTreeNodeNameByType(
          resolveDirectoryTreePracticeExpectedName(practice),
          selectedNode.type || "folder"
        );
        feedback =
          selectedNodeId === expectedTargetId &&
          nextName === expectedName
            ? "correct"
            : "wrong";
      }
    }

    setDirectoryTreeState(blockKey, {
      ...current,
      feedback
    });
    if (feedback === "incomplete") {
      notifyIncompleteExercise("Monte a resposta completa na árvore antes de continuar.");
      focusFirstIncompleteDirectoryTree(blockKey);
    }
    render({ preserveState: true });
    return feedback;
  }

  function ensureCurrentCardRuntimeOptions() {
    const directoryTreeOptions = ensureCurrentDirectoryTreeState();
    const flowchartOptions = ensureCurrentFlowchartPracticeState();
    const choiceOptions = ensureCurrentChoiceExerciseState();
    const completeOptions = ensureCurrentCompleteExerciseState();
    return {
      ...directoryTreeOptions,
      ...flowchartOptions,
      ...choiceOptions,
      ...completeOptions,
      choiceExerciseStateByBlockKey: {
        ...(flowchartOptions.choiceExerciseStateByBlockKey || {}),
        ...(choiceOptions.choiceExerciseStateByBlockKey || {})
      },
      completeExerciseStateByBlockKey: {
        ...(completeOptions.completeExerciseStateByBlockKey || {})
      },
      textGapExerciseStateByBlockKey: {
        ...(completeOptions.textGapExerciseStateByBlockKey || {})
      },
      directoryTreeStateByBlockKey: {
        ...(directoryTreeOptions.directoryTreeStateByBlockKey || {})
      },
      activeTextGapPrompt: state.activeTextGapPrompt,
      exerciseShuffleSeed: choiceOptions.exerciseShuffleSeed || flowchartOptions.exerciseShuffleSeed || "runtime"
    };
  }

  function openFlowchartPrompt(blockKey, kind, targetId) {
    if (!blockKey || !kind || !targetId) {
      return;
    }
    ensureCurrentFlowchartPracticeState();
    const current = state.flowchartPracticeByBlockKey[blockKey] || null;
    if (current?.feedback) {
      current.feedback = null;
    }
    const currentValue =
      kind === "shape"
        ? String(current?.shapes?.[targetId] || "").trim()
        : kind === "label"
          ? String(current?.labels?.[targetId] || "").trim()
          : String(current?.texts?.[targetId] || "").trim();

    // Ao clicar novamente numa lacuna já preenchida, o valor atual deve ser removido.
    if (currentValue) {
      setFlowchartPracticeValue(blockKey, kind, targetId, null, {
        closePrompt: false,
        rerender: false
      });
    }

    state.activeFlowchartPrompt = {
      blockKey,
      kind,
      targetId
    };
    render({ preserveState: true });
  }

  function closeFlowchartPrompt() {
    if (!state.activeFlowchartPrompt) {
      return;
    }
    state.activeFlowchartPrompt = null;
    render({ preserveState: true });
  }

  function setFlowchartPracticeValue(blockKey, choiceKind, targetId, value, { closePrompt = false, rerender = true } = {}) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry || !targetId || !choiceKind) {
      return;
    }

    const exercise = createFlowchartExerciseState(
      entry.block.projection,
      state.flowchartPracticeByBlockKey[blockKey]
    );
    if (choiceKind === "shape") {
      exercise.shapes[targetId] = value;
    } else if (choiceKind === "label") {
      exercise.labels[targetId] = value;
    } else {
      exercise.texts[targetId] = value;
    }
    exercise.feedback = null;
    state.flowchartPracticeByBlockKey[blockKey] = exercise;
    if (closePrompt) {
      state.activeFlowchartPrompt = null;
    }
    if (rerender) {
      render({ preserveState: true });
    }
  }

  function clearFlowchartPracticeValue(blockKey, choiceKind, targetId) {
    setFlowchartPracticeValue(blockKey, choiceKind, targetId, null, {
      closePrompt: true,
      rerender: true
    });
  }

  function checkFlowchartPractice(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    const result = validateFlowchartExerciseState(
      entry.block.projection,
      state.flowchartPracticeByBlockKey[blockKey]
    );
    state.flowchartPracticeByBlockKey[blockKey] = result.state;
    if (result.status === "incomplete") {
      notifyIncompleteExercise("Preencha todas as lacunas do fluxograma.");
      focusFirstIncompleteFlowchartTarget(blockKey, entry.block.projection, result.state);
    }
    render({ preserveState: true });
  }

  function resetFlowchartPractice(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    state.flowchartPracticeByBlockKey[blockKey] = resetFlowchartExerciseState(
      entry.block.projection,
      state.flowchartPracticeByBlockKey[blockKey]
    );
    state.activeFlowchartPrompt = null;
    render({ preserveState: true });
  }

  function viewFlowchartPracticeAnswer(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    state.flowchartPracticeByBlockKey[blockKey] = fillFlowchartExerciseAnswer(
      entry.block.projection,
      state.flowchartPracticeByBlockKey[blockKey]
    );
    state.activeFlowchartPrompt = null;
    render({ preserveState: true });
  }

  function tryFlowchartPracticeAgain(blockKey) {
    const entry = getCurrentFlowchartEntry(blockKey);
    if (!entry) {
      return;
    }

    const exercise = createFlowchartExerciseState(
      entry.block.projection,
      state.flowchartPracticeByBlockKey[blockKey]
    );
    exercise.feedback = null;
    state.flowchartPracticeByBlockKey[blockKey] = exercise;
    render({ preserveState: true });
  }

  function getRenderContext() {
    const course = findCourse(state.project, state.selection.courseKey);
    const moduleValue = findModule(state.project, state.selection.courseKey, state.selection.moduleKey);
    const lesson = findLesson(state.project, state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey);
    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      state.selection.microsequenceKey
    );
    const cards = microsequence ? microsequence.cards || [] : [];
    const card = microsequence && state.selection.cardKey ? findCard(microsequence, state.selection.cardKey) : cards[0] || null;
    const dependencies = [];
    dependencies.push(...collectAssistDependencies(course, moduleValue, lesson, microsequence));
    return { course, moduleValue, lesson, microsequence, cards, card, dependencies };
  }

  function syncVersionTabScroller() {
    const strip = root.querySelector("[data-version-strip='true']");
    if (!strip) {
      return;
    }

    const activeTab = strip.querySelector("[data-action='select-microsequence-version'][aria-selected='true']");

    requestAnimationFrame(() => {
      if (!activeTab) {
        return;
      }

      const visibleLeft = strip.scrollLeft;
      const visibleRight = visibleLeft + strip.clientWidth;
      const tabLeft = activeTab.offsetLeft;
      const tabRight = tabLeft + activeTab.offsetWidth;

      if (tabLeft < visibleLeft) {
        strip.scrollTo({ left: Math.max(0, tabLeft), behavior: "auto" });
        return;
      }

      if (tabRight > visibleRight) {
        strip.scrollTo({ left: Math.max(0, tabRight - strip.clientWidth), behavior: "auto" });
      }
    });
  }

  function syncStructureVersionStripScroller({ centerActiveTab = false } = {}) {
    const strip = root.querySelector("[data-structure-version-strip='true']");
    if (!strip) {
      return;
    }

    const shell = strip.closest("[data-structure-version-strip-shell='true']");
    const activeTab = strip.querySelector("[data-structure-tab='true'].active");
    const updateOverflowState = () => {
      const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const canScroll = maxScrollLeft > 4;

      if (shell) {
        shell.setAttribute("data-structure-version-overflowing", canScroll ? "true" : "false");
      }
    };

    updateOverflowState();

    if (centerActiveTab && activeTab) {
      const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const tabCenter = activeTab.offsetLeft + activeTab.offsetWidth / 2;
      const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, tabCenter - strip.clientWidth / 2));
      strip.scrollLeft = targetScrollLeft;
      updateOverflowState();
    }
  }

  function syncCardStripScroller({ keepActiveCardInView = false } = {}) {
    const strip = root.querySelector("[data-card-strip='true']");
    if (!strip) {
      return;
    }

    const shell = strip.closest("[data-card-strip-shell='true']");
    const prevArrow = root.querySelector("[data-action='scroll-card-strip-prev']");
    const nextArrow = root.querySelector("[data-action='scroll-card-strip-next']");
    const activeCard = strip.querySelector("[data-action='open-card'].active");

    requestAnimationFrame(() => {
      if (keepActiveCardInView && activeCard) {
        const visibleLeft = strip.scrollLeft;
        const visibleRight = visibleLeft + strip.clientWidth;
        const cardLeft = activeCard.offsetLeft;
        const cardRight = cardLeft + activeCard.offsetWidth;
        const inset = 12;

        if (cardLeft < visibleLeft + inset) {
          strip.scrollTo({ left: Math.max(0, cardLeft - inset), behavior: "auto" });
        } else if (cardRight > visibleRight - inset) {
          strip.scrollTo({ left: Math.max(0, cardRight - strip.clientWidth + inset), behavior: "auto" });
        }
      }

      const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const canScroll = maxScrollLeft > 4;
      const canScrollPrev = canScroll && strip.scrollLeft > 4;
      const canScrollNext = canScroll && strip.scrollLeft < maxScrollLeft - 4;

      if (shell) {
        shell.setAttribute("data-card-strip-overflowing", canScroll ? "true" : "false");
      }
      if (prevArrow) {
        prevArrow.hidden = !canScrollPrev;
      }
      if (nextArrow) {
        nextArrow.hidden = !canScrollNext;
      }
    });
  }

  function toggleSelectedMicrosequenceRuntime(microsequenceKey) {
    if (!microsequenceKey) {
      return;
    }

    const microsequence = findMicrosequence(
      state.project,
      state.selection.courseKey,
      state.selection.moduleKey,
      state.selection.lessonKey,
      microsequenceKey
    );
    if (!microsequence || !Array.isArray(microsequence.cards) || microsequence.cards.length === 0) {
      return;
    }

    const nextProject = editor.updateMicrosequence({
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey,
      included: !resolveMicrosequenceRuntimeIncluded(microsequence)
    });

    setProject(nextProject);
    focusStructureTarget({
      view: "lesson",
      courseKey: state.selection.courseKey,
      moduleKey: state.selection.moduleKey,
      lessonKey: state.selection.lessonKey,
      microsequenceKey
    });
    render({ preserveState: false });
  }

  function syncPendingStructureFocus() {
    const target = state.pendingStructureFocus;
    if (!target || target.view !== state.view) {
      return;
    }

    let selector = "";
    if (target.view === "lesson" && target.microsequenceKey) {
      selector =
        '[data-structure-target="microsequence"][data-course-key="' +
        target.courseKey +
        '"][data-module-key="' +
        target.moduleKey +
        '"][data-lesson-key="' +
        target.lessonKey +
        '"][data-microsequence-key="' +
        target.microsequenceKey +
        '"]';
    } else if (target.view === "course" && target.moduleKey) {
      selector =
        '[data-structure-target="module"][data-course-key="' +
        target.courseKey +
        '"][data-module-key="' +
        target.moduleKey +
        '"]';
    } else if (target.view === "courses" && target.courseKey) {
      selector = '[data-structure-target="course"][data-course-key="' + target.courseKey + '"]';
    }

    if (!selector) {
      state.pendingStructureFocus = null;
      return;
    }

    const node = root.querySelector(selector);
    if (!node) {
      return;
    }

    state.pendingStructureFocus = null;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    });
  }

  function scrollCardStrip(direction) {
    const strip = root.querySelector("[data-card-strip='true']");
    if (!strip) {
      return;
    }

    const step = Math.max(160, Math.round(strip.clientWidth * 0.82));
    strip.scrollBy({
      left: step * direction,
      behavior: "smooth"
    });
  }

  function setAssistWorkbenchPane(pane) {
    state.assistDraft.activeWorkbenchPane = pane === "edit" ? "edit" : "preview";
    render({ preserveState: true });
  }

  function render({
    preserveState = true,
    preserveScrollSelectors = null,
    preserveFocus = true
  } = {}) {
    rememberCoursesView();
    const renderState = preserveState
      ? captureRenderState(root, {
          trackedScrollSelectors: Array.isArray(preserveScrollSelectors) ? preserveScrollSelectors : undefined,
          includeFocus: preserveFocus
        })
      : null;
    const context = getRenderContext();
    const currentCardRuntimeOptions = ensureCurrentCardRuntimeOptions();
    const assistCatalog = getAssistCatalog();
    const assistModeConfig = getAssistModeOptions();
    const entityEditorModel = makeEntityEditorModel(state);
    const microsequenceVersionEntry = state.view === "microsequence-assist" ? getMicrosequenceVersionEntry() : null;
    const visualizedMicrosequenceVersion = state.view === "microsequence-assist" ? getVisualizedMicrosequenceVersion() : null;
    const visualizedMicrosequenceVersionId = visualizedMicrosequenceVersion?.id || "";
    const pendingGeneratedVersion = state.view === "microsequence-assist" ? getPendingGeneratedMicrosequenceVersion() : null;
    const pendingGeneratedVersionVisible =
      Boolean(pendingGeneratedVersion) &&
      (!visualizedMicrosequenceVersionId || visualizedMicrosequenceVersionId === pendingGeneratedVersion?.id);
    const structureVersionReference = getCurrentStructureVersionReference();
    const structureVersionEntry = getStructureVersionEntry(structureVersionReference);
    const visibleStructureReferences = listVisibleStructureVersionReferences();
    const visibleStructureEntries = visibleStructureReferences
      .map((reference) => getStructureVersionEntry(reference))
      .filter(Boolean);
    const structureVersionTabs =
      state.view === "courses"
        ? buildStructureTabsForEntry(structureVersionEntry, { prefix: "C" })
        : state.view === "course"
          ? buildChildStructureTabs(
            state.structureVersions,
            context.course?.modules || [],
            (item) => ({
              level: "module",
              courseKey: context.course?.key || "",
              moduleKey: item?.key || ""
            }),
            "M",
            "open-module",
            state.selection.moduleKey
          )
          : state.view === "module"
            ? buildChildStructureTabs(
              state.structureVersions,
              context.moduleValue?.lessons || [],
              (item) => ({
                level: "lesson",
                courseKey: context.course?.key || "",
                moduleKey: context.moduleValue?.key || "",
                lessonKey: item?.key || ""
              }),
              "L",
              "open-lesson",
              state.selection.lessonKey
            )
            : buildStructureTabsForEntry(structureVersionEntry, { prefix: "V" });
    const structureVersionContextTabs =
      state.view === "courses"
        ? []
        : visibleStructureEntries.slice(0, -1).map((entry) => buildStructureContextTab(entry)).filter(Boolean);
    const versionComparison =
      state.versionCompareOpen && structureVersionReference
        ? buildStructureVersionComparisonForVersion({
          entry: structureVersionEntry,
          versionId: state.versionCompareSelectionKey || getSelectedStructureVersionId()
        })
        : state.view === "microsequence-assist" && state.versionCompareOpen
          ? buildMicrosequenceVersionComparisonForVersion({
            versions: microsequenceVersionEntry?.versions || [],
            versionId: state.versionCompareSelectionKey || visualizedMicrosequenceVersionId || microsequenceVersionEntry?.activeVersionId || "",
            cardIndex: Number.isInteger(state.selection?.cardIndex) ? state.selection.cardIndex : 0
          })
          : null;
    const versionComparisonViewModel = versionComparison
      ? {
        ...versionComparison,
        activeVersionId: structureVersionReference
          ? structureVersionEntry?.activeVersionId || ""
          : microsequenceVersionEntry?.activeVersionId || ""
      }
      : null;
    const structureHistoryTitle =
      state.view === "courses"
        ? "Snapshots do projeto"
        : state.view === "course"
        ? "Versões do curso"
        : state.view === "module"
          ? "Versões do módulo"
          : state.view === "lesson"
            ? "Versões da lição"
            : "Versões do card";
    const historyVersions = getCurrentCardHistory().map((item, index) => ({
      key: item.id,
      label: item.label,
      versionLabel: item.label,
      origin: `Snapshot ${index + 1}`,
      meta: [item.source, formatOverlayTimestamp(item.savedAt)].filter(Boolean).join(" · "),
      selected: item.id === state.versionHistorySelectionKey,
      actions: [
        {
          action: "restore-version",
          label: "Usar",
          icon: "✓"
        }
      ]
    }));
    const structureHistoryVersions = (structureVersionEntry?.versions || []).map((item) => {
      const operationInfo = describeStructureVersionOperation(item.operationType);
      const isActive = item.id === structureVersionEntry?.activeVersionId;
      return {
        key: item.id,
        label: item.label || `Versão ${item.versionNumber || 1}`,
        origin: buildVersionLineageLabel(item, structureVersionEntry?.versions || []),
        versionLabel: getVersionDisplayId(item),
        meta: [formatOverlayTimestamp(item.updatedAt), operationInfo.label].filter(Boolean).join(" · "),
        sortKey: item.updatedAt || item.createdAt || "",
        summary: item.id === state.versionHistorySelectionKey ? "Selecionada para inspeção." : "",
        inUse: isActive,
        selected: item.id === state.versionHistorySelectionKey,
        actions: [
          {
            action: "use-structure-version",
            label: "Usar",
            icon: "✓",
            disabled: isActive
          },
          {
            action: "delete-structure-version",
            label: "Excluir",
            icon: "×",
            tone: "danger",
            disabled: (structureVersionEntry?.versions || []).length <= 1
          }
        ],
        moreExpanded: item.id === state.versionHistoryExpandedMoreKey
      };
    });
    const orderHistoryVersions = (items) => {
      const list = Array.isArray(items) ? items.slice() : [];
      return list.sort((left, right) => {
        if (left.inUse && !right.inUse) return -1;
        if (!left.inUse && right.inUse) return 1;
        return String(right.sortKey || "").localeCompare(String(left.sortKey || ""));
      });
    };
    const microsequenceHistoryVersions = (microsequenceVersionEntry?.versions || []).map((item) => {
      const isActive = item.id === microsequenceVersionEntry?.activeVersionId;
      return {
        key: item.id,
        label: item.label || `Snapshot ${item.versionNumber || 1}`,
        origin: buildVersionLineageLabel(item, microsequenceVersionEntry?.versions || []),
        versionLabel: getVersionDisplayId(item),
        meta: formatOverlayTimestamp(item.updatedAt),
        sortKey: item.updatedAt || item.createdAt || "",
        summary: item.id === state.versionHistorySelectionKey ? "Selecionada para inspeção." : "",
        inUse: isActive,
        selected: item.id === state.versionHistorySelectionKey,
        actions: [
          {
            action: "use-microsequence-version",
            label: "Usar",
            icon: "✓",
            disabled: isActive
          },
          {
            action: "delete-microsequence-version",
            label: "Excluir",
            icon: "×",
            tone: "danger",
            disabled: (microsequenceVersionEntry?.versions || []).length <= 1
          }
        ],
        moreExpanded: item.id === state.versionHistoryExpandedMoreKey
      };
    });
    const structureComparisonAvailable =
      Array.isArray(structureVersionEntry?.versions) &&
      structureVersionEntry.versions.findIndex((item) => item.id === structureVersionEntry.activeVersionId) > 0;
    const versionHistoryTitle = structureVersionReference
      ? structureHistoryTitle
      : state.view === "microsequence-assist"
        ? "Snapshots da microssequência"
        : "Versões do card";
    const versionHistoryItems = structureVersionReference
      ? orderHistoryVersions(structureHistoryVersions)
      : state.view === "microsequence-assist"
        ? orderHistoryVersions(microsequenceHistoryVersions)
        : historyVersions;
    const versionHistoryEmptyLabel = structureVersionReference || state.view === "microsequence-assist" ? "Sem snapshots locais ainda." : "Sem versões anteriores.";
    const versionHistoryFooter = structureVersionReference
      ? (() => {
        const activeVersion = structureVersionEntry?.versions?.find((item) => item.id === structureVersionEntry?.activeVersionId) || null;
        if (!activeVersion) {
          return "";
        }
        return `Em uso: ${getVersionDisplayId(activeVersion)} · ${formatOverlayTimestamp(activeVersion.updatedAt)}`;
      })()
      : state.view === "microsequence-assist"
        ? (() => {
          const activeVersion = microsequenceVersionEntry?.versions?.find((item) => item.id === microsequenceVersionEntry?.activeVersionId) || null;
          return activeVersion ? `Em uso: ${getVersionDisplayId(activeVersion)} · ${formatOverlayTimestamp(activeVersion.updatedAt)}` : "";
        })()
      : "";

    root.innerHTML =
      '<div class="app-shell">' +
      renderLessonScreen({
        project: state.project,
        view: state.view,
        activeHomeTab: state.homeTab,
        selection: state.selection,
        course: context.course,
        moduleValue: context.moduleValue,
        lesson: context.lesson,
        microsequence: context.microsequence,
        cards: context.cards,
        card: context.card,
        microsequenceMode: state.microsequenceMode,
        editorSupport: {
          progress: storage.loadProgress(),
          dependencies: assistCatalog,
          microsequenceVersions: microsequenceVersionEntry?.versions || [],
          activeMicrosequenceVersionId: microsequenceVersionEntry?.activeVersionId || "",
          visualizedMicrosequenceVersionId,
          editBaseMicrosequenceVersionId: getMicrosequenceEditBaseVersionId(),
          visualizedMicrosequenceVersion,
          pendingGeneratedVersionId: pendingGeneratedVersion?.id || "",
          pendingGeneratedVersionActive: pendingGeneratedVersionVisible,
          versionActionsOpen: state.assistDraft.versionActionsOpen,
          canDeleteVisualizedMicrosequenceVersion:
            state.view === "microsequence-assist" ? canDeleteMicrosequenceVersion(visualizedMicrosequenceVersionId) : false,
          selectedDependencyKeys: state.assistDraft.dependencyKeys,
          pendingDependencyKey: state.assistDraft.pendingDependencyKey,
          assistModeOptions: assistModeConfig.options,
          selectedAssistMode: state.assistDraft.selectedMode,
          activeWorkbenchPane: state.assistDraft.activeWorkbenchPane,
          assistModeLocked: assistModeConfig.locked,
          preferredContainer: state.assistDraft.preferredContainer,
          preferredContainerLabel: getAssistContainerLabel(state.assistDraft.preferredContainer),
          selectedDidacticTypeId: state.assistDraft.didacticTypeId,
          didacticTypeOptions: ASSIST_DIDACTIC_TYPE_OPTIONS,
          attachments: state.assistDraft.attachments.map((item) => ({
            name: normalizeAssistAttachmentName(item?.name),
            size: Number(item?.size || 0),
            type: String(item?.type || "").trim()
          })),
          selectedModel: state.assistConfig.model,
          selectedModelLabel: getAssistModelLabel(state.assistConfig.model),
          modelOptions: ASSIST_MODEL_OPTIONS,
          generationDraft: {
            ...state.generationDraft,
            attachments: state.generationDraft.attachments.map((item) => ({
              name: normalizeAssistAttachmentName(item?.name),
              size: Number(item?.size || 0),
              type: String(item?.type || "").trim()
            }))
          },
          generationUiState: getGenerationScopeState(),
          promptText: state.assistDraft.promptText,
          lastRequest: state.assistDraft.lastRequest,
          isSubmitting: state.assistDraft.isSubmitting,
          assistError: state.assistDraft.errorMessage,
          hasApiKey: Boolean(state.assistConfig.apiKey),
          historyCount: historyVersions.length,
          structureHistoryCount: structureVersionEntry?.versions?.length || 0,
          structureComparisonAvailable,
          structureVersionTabs,
          structureVersionContextTabs,
          activeStructureVersionId: structureVersionEntry?.activeVersionId || "",
          cardRuntimeOptions: currentCardRuntimeOptions,
          continuePopup: {
            open:
              !!state.continuePopup &&
              state.continuePopup.cardPathKey === buildCardPathKey(state.selection),
            blockKey: state.continuePopup?.blockKey || null
          }
        }
      }) +
      (state.cardCommentOpen
        ? renderCardCommentOverlay({
            value: state.cardCommentDraft
          })
        : "") +
      (state.versionHistoryOpen
        ? renderCardVersionOverlay({
            title: versionHistoryTitle,
            emptyLabel: versionHistoryEmptyLabel,
            versions: versionHistoryItems,
            footer: versionHistoryFooter,
            primaryAction: structureVersionReference || state.view === "microsequence-assist"
              ? { action: "save-version-snapshot", label: "Gravar snapshot", icon: "+" }
              : null
          })
        : "") +
      (versionComparison
        ? renderVersionCompareOverlay({
            comparison: versionComparisonViewModel,
            uiState: {
              activeTab: state.versionCompareTab,
              focusTarget: state.versionCompareFocusTarget
            }
          })
        : "") +
      (state.assistConfigOpen
        ? renderAssistConfigOverlay({
            model: state.assistConfigDraft.model,
            apiKey: state.assistConfigDraft.apiKey,
            codexEndpoint: state.assistConfigDraft.codexEndpoint,
            codexToken: state.assistConfigDraft.codexToken,
            modelOptions: ASSIST_MODEL_OPTIONS
          })
        : "") +
      (state.codexCliSetupOpen
        ? renderCodexCliSetupOverlay({
            endpoint: getCodexSetupEndpoint(),
            status: state.codexCliSetupStatus,
            setupScript: getCodexSetupScript(),
            presentation: getCodexSetupPresentation()
          })
        : "") +
      (state.pendingExternalImport
        ? renderExternalImportOverlay({
            sourceName: state.pendingExternalImport.sourceName,
            detectedFormat:
              state.pendingExternalImport.detectedFormat === "storage"
                ? "Backup completo"
                : state.pendingExternalImport.detectedFormat === "contract"
                  ? "Projeto AraLearn"
                  : "",
            error: state.pendingExternalImport.error
          })
        : "") +
      (state.generationPanelOpen
        ? renderGenerationPanelOverlay({
            project: state.project,
            editorSupport: {
              generationDraft: {
                ...state.generationDraft,
                attachments: state.generationDraft.attachments.map((item) => ({
                  name: normalizeAssistAttachmentName(item?.name),
                  size: Number(item?.size || 0),
                  type: String(item?.type || "").trim()
                }))
              },
              generationUiState: getGenerationScopeState(),
              selectedModel: state.assistConfig.model,
              modelOptions: ASSIST_MODEL_OPTIONS
            }
          })
        : "") +
      (entityEditorModel
        ? entityEditorModel.variant === "action-menu"
          ? renderActionMenuOverlay(entityEditorModel)
          : renderEntityEditorOverlay(entityEditorModel)
        : "") +
      "</div>";

    if (renderState) {
      restoreRenderState(root, renderState, { restoreFocus: preserveFocus });
    }

    root
      .querySelectorAll(
        "[data-action='open-generation-panel-global'], [data-action='open-generation-panel-course'], [data-action='open-generation-panel-module'], [data-action='open-generation-panel-lesson']"
      )
      .forEach((node) => bindGenerationPanelTrigger(node));

    syncVersionTabScroller();
    syncCardStripScroller({ keepActiveCardInView: true });
    syncPendingExerciseFocus();

    root.querySelector("[data-action='go-back']")?.addEventListener("click", () => goBack());

    root.querySelectorAll("[data-action='close-generation-panel']").forEach((node) => {
      node.addEventListener("click", () => closeGenerationPanel());
    });
    root.querySelectorAll("[data-action='dismiss-generation-panel']").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target === node) {
          closeGenerationPanel();
        }
      });
    });
    root.querySelectorAll("[data-action='clear-generation-scope']").forEach((node) => {
      node.addEventListener("click", () => {
        clearGenerationScope();
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='quick-create-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const nextProject = structuralEditor.createCourse({ title: "Novo curso" });
        createStructureVersionFromProject(nextProject, null, {
          label: "Iteração de cursos",
          operationType: "create-child"
        });
        setProject(nextProject);
        const course = nextProject.courses[nextProject.courses.length - 1];
        applySelection(buildNodeSelection({ courseKey: course?.key || null }));
        state.view = "courses";
        syncVisibleStructureVersionsFromProject();
        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='quick-create-module']").forEach((node) => {
      node.addEventListener("click", () => {
        if (!state.selection.courseKey) return;
        const nextProject = structuralEditor.createModule({ courseKey: state.selection.courseKey, title: "Novo módulo" });
        createStructureVersionFromProject(
          nextProject,
          {
            level: "course",
            courseKey: state.selection.courseKey
          },
          {
            label: "Iteração de módulos",
            operationType: "create-child"
          }
        );
        setProject(nextProject);
        const course = findCourse(nextProject, state.selection.courseKey);
        const moduleValue = course?.modules?.[course.modules.length - 1] || null;
        applySelection(buildNodeSelection({ courseKey: course?.key || null, moduleKey: moduleValue?.key || null }));
        state.view = "course";
        syncVisibleStructureVersionsFromProject();
        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='quick-create-lesson']").forEach((node) => {
      node.addEventListener("click", () => {
        if (!state.selection.courseKey || !state.selection.moduleKey) return;
        const nextProject = structuralEditor.createLesson({
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          title: "Nova lição"
        });
        createStructureVersionFromProject(
          nextProject,
          {
            level: "module",
            courseKey: state.selection.courseKey,
            moduleKey: state.selection.moduleKey
          },
          {
            label: "Iteração de lições",
            operationType: "create-child"
          }
        );
        setProject(nextProject);
        const moduleValue = findModule(nextProject, state.selection.courseKey, state.selection.moduleKey);
        const lesson = moduleValue?.lessons?.[moduleValue.lessons.length - 1] || null;
        applySelection(
          buildNodeSelection({
            courseKey: state.selection.courseKey,
            moduleKey: state.selection.moduleKey,
            lessonKey: lesson?.key || null
          })
        );
        state.view = "module";
        syncVisibleStructureVersionsFromProject();
        render({ preserveState: false });
      });
    });
    root.querySelectorAll("[data-action='quick-create-microsequence']").forEach((node) => {
      node.addEventListener("click", () => {
        if (!state.selection.courseKey || !state.selection.moduleKey || !state.selection.lessonKey) return;
        const nextProject = editor.createMicrosequence({
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          title: "Nova microssequência",
          tags: [],
          status: "draft",
          cards: []
        });
        createStructureVersionFromProject(
          nextProject,
          {
            level: "lesson",
            courseKey: state.selection.courseKey,
            moduleKey: state.selection.moduleKey,
            lessonKey: state.selection.lessonKey
          },
          {
            label: "Iteração de microssequências",
            operationType: "create-child"
          }
        );
        setProject(nextProject);
        const lesson = findLesson(nextProject, state.selection.courseKey, state.selection.moduleKey, state.selection.lessonKey);
        const microsequence = lesson?.microsequences?.[lesson.microsequences.length - 1] || null;
        applySelection(
          buildNodeSelection({
            courseKey: state.selection.courseKey,
            moduleKey: state.selection.moduleKey,
            lessonKey: state.selection.lessonKey,
            microsequenceKey: microsequence?.key || null
          })
        );
        state.view = "lesson";
        syncVisibleStructureVersionsFromProject();
        render({ preserveState: false });
      });
    });

    root.querySelectorAll("[data-action='toggle-generate-level']").forEach((node) => {
      node.addEventListener("click", () => {
        const level = node.getAttribute("data-level");
        if (!level) return;
        setGenerationLevelFixed(level);
      });
    });
    root.querySelector("[data-action='toggle-generate-microsequence-reposition']")?.addEventListener("click", () => {
      toggleGenerationMicrosequenceReposition();
    });
    root.querySelector("[data-field='generate-course-input']")?.addEventListener("input", (event) => {
      setGenerationInput("course", event.target.value);
    });
    root.querySelector("[data-field='generate-module-input']")?.addEventListener("input", (event) => {
      setGenerationInput("module", event.target.value);
    });
    root.querySelector("[data-field='generate-lesson-input']")?.addEventListener("input", (event) => {
      setGenerationInput("lesson", event.target.value);
    });
    root.querySelector("[data-field='generate-prompt']")?.addEventListener("input", (event) => {
      state.generationDraft.promptText = event.target.value;
      clearGenerationResult();
      render({ preserveState: true });
    });
    root.querySelector("[data-field='generate-attachments']")?.addEventListener("change", (event) => {
      const nextFiles = Array.from(event.target.files || []);
      state.generationDraft.attachments = normalizeAssistAttachmentList([
        ...state.generationDraft.attachments,
        ...nextFiles
      ]);
      event.target.value = "";
      clearGenerationResult();
      render({ preserveState: true });
    });
    root.querySelectorAll("[data-action='remove-generation-attachment']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-attachment-index"));
        if (!Number.isInteger(index) || index < 0) return;
        state.generationDraft.attachments = state.generationDraft.attachments.filter((_, itemIndex) => itemIndex !== index);
        clearGenerationResult();
        render({ preserveState: true });
      });
    });
    root.querySelector("[data-action='generate-structure']")?.addEventListener("click", () => {
      void submitGenerateStructureRequest();
    });
    root.querySelector("[data-action='view-generated-lesson']")?.addEventListener("click", () => {
      openGeneratedLesson();
    });

    root.querySelectorAll("[data-action='open-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key");
        if (!courseKey) return;
        openCourse(courseKey);
      });
    });

    root.querySelectorAll("[data-action='open-lesson']").forEach((node) => {
      node.addEventListener("click", () => {
        const moduleKey = node.getAttribute("data-module-key");
        const lessonKey = node.getAttribute("data-lesson-key");
        if (!moduleKey || !lessonKey) return;
        openLesson(moduleKey, lessonKey);
      });
    });

    root.querySelectorAll("[data-action='open-module']").forEach((node) => {
      node.addEventListener("click", () => {
        const moduleKey = node.getAttribute("data-module-key");
        if (!moduleKey) return;
        openModule(moduleKey);
      });
    });
    root.querySelectorAll("[data-action='select-structure-version']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        selectStructureVersionTab(versionKey, { centerActiveTab: true });
      });
    });
    root.querySelectorAll("[data-structure-tab='true']").forEach((node) => {
      node.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      node.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
    });
    root.querySelector("[data-structure-version-strip='true']")?.addEventListener("scroll", () => {
      syncStructureVersionStripScroller();
    });

    root.querySelectorAll("[data-action='open-microsequence']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        if (!microsequenceKey) return;
        openEntityEditor("microsequence-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          microsequenceKey
        });
      });
    });

    root.querySelectorAll("[data-action='play-microsequence']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        if (!microsequenceKey) return;
        openMicrosequenceScreen(microsequenceKey, 0, "play");
      });
    });

    root.querySelectorAll("[data-action='open-microsequence-card']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key");
        const index = Number.parseInt(node.getAttribute("data-card-index") || "0", 10);
        if (!microsequenceKey || !Number.isFinite(index)) return;
        openMicrosequenceScreen(microsequenceKey, index, "play");
      });
    });

    root.querySelectorAll("[data-action='open-card']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number.parseInt(node.getAttribute("data-card-index") || "0", 10);
        if (!Number.isFinite(index)) return;
        openCardByIndex(index);
      });
    });
    root.querySelectorAll("[data-action='select-microsequence-version']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionId = node.getAttribute("data-version-id");
        if (!versionId) return;
        selectMicrosequenceVersion(versionId);
      });
    });
    root.querySelector("[data-action='editor-prev-version']")?.addEventListener("click", () => {
      stepMicrosequenceVersion(-1);
    });
    root.querySelector("[data-action='editor-next-version']")?.addEventListener("click", () => {
      stepMicrosequenceVersion(1);
    });
    root.querySelector("[data-action='delete-microsequence-version']")?.addEventListener("click", () => {
      const versionId =
        root.querySelector("[data-action='delete-microsequence-version']")?.getAttribute("data-version-id") ||
        getVisualizedMicrosequenceVersionId();
      if (!versionId) return;
      deleteMicrosequenceVersion(versionId);
    });
    root.querySelector("[data-action='open-version-compare']")?.addEventListener("click", () => {
      state.versionCompareSelectionKey = getVisualizedMicrosequenceVersionId();
      openVersionCompare();
    });
    root.querySelector("[data-action='open-microsequence-version-compare']")?.addEventListener("click", () => {
      state.versionCompareSelectionKey = getVisualizedMicrosequenceVersionId();
      openVersionCompare();
    });
    root.querySelector("[data-action='toggle-microsequence-version-more']")?.addEventListener("click", () => {
      toggleMicrosequenceVersionMore();
    });
    root.querySelector("[data-action='use-microsequence-version']")?.addEventListener("click", () => {
      const versionId = root.querySelector("[data-action='use-microsequence-version']")?.getAttribute("data-version-id");
      if (!versionId) return;
      useMicrosequenceVersion(versionId);
    });
    root.querySelectorAll("[data-action='select-workbench-pane']").forEach((node) => {
      node.addEventListener("click", () => {
        setAssistWorkbenchPane(node.getAttribute("data-workbench-pane"));
      });
    });

    root.querySelector("[data-action='scroll-card-strip-prev']")?.addEventListener("click", () => {
      scrollCardStrip(-1);
    });
    root.querySelector("[data-action='scroll-card-strip-next']")?.addEventListener("click", () => {
      scrollCardStrip(1);
    });
    root.querySelector("[data-card-strip='true']")?.addEventListener("scroll", () => {
      syncCardStripScroller();
    });

    root.querySelector("[data-action='prev-card']")?.addEventListener("click", () => stepCard(-1));
    root.querySelector("[data-action='continue-popup-next']")?.addEventListener("click", () => stepCard(1));
    root.querySelector("[data-action='next-card']")?.addEventListener("click", () => stepCard(1));
    root.querySelector("[data-action='close-study']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='go-home']")?.addEventListener("click", () => goBack());
    root.querySelector("[data-action='open-card-comment']")?.addEventListener("click", () => openCardComment());
    root.querySelectorAll("[data-action='open-microsequence-assist']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key") || state.selection.microsequenceKey;
        const targetIndex = Number.parseInt(node.getAttribute("data-card-index") || String(state.selection.cardIndex || 0), 10);
        if (!microsequenceKey) return;
        openMicrosequenceAssistPage(microsequenceKey, Number.isFinite(targetIndex) ? targetIndex : 0);
      });
    });

    root.querySelectorAll("[data-action='choice-toggle']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        const optionId = node.getAttribute("data-choice-option-id");
        if (!blockKey || optionId === null) return;
        const current = state.choiceExerciseByBlockKey[blockKey];
        const selected = Array.isArray(current?.selected) ? current.selected : [];
        const isSelected = selected.includes(optionId);
        setChoiceSelection(blockKey, optionId, !isSelected);
      });
    });
    root.querySelectorAll("[data-action='choice-try-again']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        if (!blockKey) return;
        tryAgainChoice(blockKey);
      });
    });
    root.querySelectorAll("[data-action='choice-view-answer']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        if (!blockKey) return;
        viewAnswerChoice(blockKey);
      });
    });
    root.querySelectorAll("[data-action='choice-validate']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-choice-block-key");
        if (!blockKey) return;
        validateChoice(blockKey);
      });
    });

    root.querySelector(".study-reader-screen")?.addEventListener("click", (event) => {
      if (!state.continuePopup) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".study-continue-popup") ||
        target.closest("[data-action='next-card']") ||
        target.closest("[data-action='continue-popup-next']")
      ) {
        return;
      }

      closeContinuePopup();
    });

    root.querySelectorAll("[data-action='directory-tree-select-node']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        const nodeId = node.getAttribute("data-directory-tree-node-id");
        if (!blockKey || nodeId === null) return;
        selectDirectoryTreeNode(blockKey, nodeId);
      });
    });
    root.querySelectorAll("[data-action='directory-tree-toggle-node']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        const nodeId = node.getAttribute("data-directory-tree-node-id");
        if (!blockKey || nodeId === null) return;
        toggleDirectoryTreeNode(blockKey, nodeId);
      });
    });
    root.querySelectorAll("[data-action='directory-tree-set-type']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        const nodeType = node.getAttribute("data-directory-tree-node-type");
        if (!blockKey || nodeType === null) return;
        setDirectoryTreeType(blockKey, nodeType);
      });
    });
    root.querySelectorAll("[data-action='directory-tree-name-set-choice']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        const blankIndex = node.getAttribute("data-directory-tree-blank-index");
        const value = node.getAttribute("data-directory-tree-value");
        if (!blockKey || blankIndex === null || value === null) return;
        setDirectoryTreeNameBlank(blockKey, blankIndex, value, { rerender: true });
      });
    });
    root.querySelectorAll("[data-action='directory-tree-name-clear']").forEach((node) => {
      const clear = () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        const blankIndex = node.getAttribute("data-directory-tree-blank-index");
        if (!blockKey || blankIndex === null) return;
        clearDirectoryTreeNameBlank(blockKey, blankIndex);
      };
      node.addEventListener("click", clear);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          clear();
        }
      });
    });
    root.querySelectorAll("[data-action='directory-tree-apply']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        if (!blockKey) return;
        applyDirectoryTreeAction(blockKey);
      });
    });
    root.querySelectorAll("[data-action='directory-tree-view-answer']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        if (!blockKey) return;
        viewAnswerDirectoryTree(blockKey);
      });
    });
    root.querySelectorAll("[data-action='directory-tree-try-again']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        if (!blockKey) return;
        tryAgainDirectoryTree(blockKey);
      });
    });
    root.querySelectorAll("[data-action='directory-tree-name-input']").forEach((node) => {
      if (node.getAttribute("contenteditable") !== "true") {
        return;
      }

      const updateEmptyAttribute = () => {
        const content = String(node.textContent || "").replace(/\u2007/g, "");
        node.setAttribute("data-empty", content.length ? "false" : "true");
      };

      updateEmptyAttribute();

      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
      });

      node.addEventListener("input", () => {
        const blockKey = node.getAttribute("data-directory-tree-block-key");
        const blankIndex = node.getAttribute("data-directory-tree-blank-index");
        if (!blockKey || blankIndex === null) return;
        const normalized = normalizeTextGapContentEditableValue(node);
        node.setAttribute("data-empty", normalized ? "false" : "true");
        setDirectoryTreeNameBlank(blockKey, blankIndex, normalized, { rerender: false });
      });

      node.addEventListener("blur", () => {
        if (!normalizeTextGapContentEditableValue(node)) {
          node.textContent = "";
          node.setAttribute("data-empty", "true");
        }
      });
    });

    root.querySelectorAll("[data-action='complete-input']").forEach((node) => {
      if (node.tagName === "TEXTAREA" || node.tagName === "INPUT") {
        autosizeTextGapField(node);
        node.addEventListener("input", () => {
          const blockKey = node.getAttribute("data-complete-block-key");
          const blankIndex = node.getAttribute("data-complete-blank-index");
          if (!blockKey || blankIndex === null) return;
          autosizeTextGapField(node);
          setCompleteBlank(blockKey, blankIndex, node.value, { rerender: false });
        });
        return;
      }

      if (node.getAttribute("contenteditable") !== "true") {
        return;
      }

      const updateEmptyAttribute = () => {
        const content = String(node.textContent || "").replace(/\u2007/g, "");
        const isEmpty = !content.length;
        node.setAttribute("data-empty", isEmpty ? "true" : "false");
      };

      updateEmptyAttribute();

      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
      });

      node.addEventListener("input", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        const blankIndex = node.getAttribute("data-complete-blank-index");
        if (!blockKey || blankIndex === null) return;
        const normalized = normalizeTextGapContentEditableValue(node);
        node.setAttribute("data-empty", normalized ? "false" : "true");
        setCompleteBlank(blockKey, blankIndex, normalized, { rerender: false });
      });

      node.addEventListener("blur", () => {
        if (!normalizeTextGapContentEditableValue(node)) {
          node.textContent = "";
          node.setAttribute("data-empty", "true");
        }
      });
    });
    root.querySelectorAll("[data-action='text-gap-open-choice']").forEach((node) => {
      const openPrompt = () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        const blankIndex = node.getAttribute("data-complete-blank-index");
        if (!blockKey || blankIndex === null) return;
        openTextGapChoicePrompt(blockKey, blankIndex);
      };

      node.addEventListener("click", openPrompt);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPrompt();
        }
      });
    });
    root.querySelectorAll("[data-action='text-gap-set-choice']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        const blankIndex = node.getAttribute("data-complete-blank-index");
        const value = node.getAttribute("data-text-gap-value");
        if (!blockKey || blankIndex === null || value === null) return;
        setTextGapChoice(blockKey, blankIndex, value);
      });
    });
    root.querySelectorAll("[data-action='complete-try-again']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        if (!blockKey) return;
        tryAgainComplete(blockKey);
      });
    });
    root.querySelectorAll("[data-action='complete-view-answer']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        if (!blockKey) return;
        viewAnswerComplete(blockKey);
      });
    });
    root.querySelectorAll("[data-action='complete-validate']").forEach((node) => {
      node.addEventListener("click", () => {
        const blockKey = node.getAttribute("data-complete-block-key");
        if (!blockKey) return;
        validateComplete(blockKey);
      });
    });

    root.querySelectorAll("[data-action='flowchart-open-shape']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFlowchartPrompt(
          node.getAttribute("data-flowchart-block-key"),
          "shape",
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-open-text']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFlowchartPrompt(
          node.getAttribute("data-flowchart-block-key"),
          "text",
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-open-label']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFlowchartPrompt(
          node.getAttribute("data-flowchart-block-key"),
          "label",
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-set-shape']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          "shape",
          node.getAttribute("data-flowchart-target-id"),
          node.getAttribute("data-flowchart-value"),
          { closePrompt: true, rerender: true }
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-set-text']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          "text",
          node.getAttribute("data-flowchart-target-id"),
          node.getAttribute("data-flowchart-value"),
          { closePrompt: true, rerender: true }
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-set-label']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          "label",
          node.getAttribute("data-flowchart-target-id"),
          node.getAttribute("data-flowchart-value"),
          { closePrompt: true, rerender: true }
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-clear-choice']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clearFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          node.getAttribute("data-flowchart-choice-kind"),
          node.getAttribute("data-flowchart-target-id")
        );
      });
    });
    root.querySelectorAll("[data-action='flowchart-check']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        checkFlowchartPractice(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-reset']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        resetFlowchartPractice(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-view-answer']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        viewFlowchartPracticeAnswer(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-try-again']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        tryFlowchartPracticeAgain(node.getAttribute("data-flowchart-block-key"));
      });
    });
    root.querySelectorAll("[data-action='flowchart-close-prompt']").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeFlowchartPrompt();
      });
    });

    root.querySelectorAll("[data-action='open-card-index']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number.parseInt(node.getAttribute("data-card-index") || "0", 10);
        if (!Number.isFinite(index)) return;
        openCardByIndex(index);
      });
    });

    root.querySelectorAll("[data-action='open-home-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("home-actions");
      });
    });
    root.querySelectorAll("[data-action='structure-drag-handle'], [data-structure-draggable='true']").forEach((node) => {
      node.addEventListener("dragstart", (event) => {
        const payload = readStructurePayload(node);
        const originNode = node.closest("[data-structure-target]");
        if (!payload || !originNode) {
          event.preventDefault();
          return;
        }

        state.structureDrag = {
          ...payload,
          originNode
        };
        state.structureDrop = null;
        clearStructureDropClasses();
        originNode.classList.add("structure-drag-origin");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", [
            payload.level,
            payload.courseKey,
            payload.moduleKey,
            payload.lessonKey,
            payload.microsequenceKey
          ].join("::"));
        }
      });
      node.addEventListener("dragend", () => {
        resetStructureDragState();
      });
    });
    root.querySelectorAll("[data-structure-target]").forEach((node) => {
      node.addEventListener("dragover", (event) => {
        const target = readStructurePayload(node);
        if (!canDropStructure(state.structureDrag, target)) {
          return;
        }

        event.preventDefault();
        const axis = getStructureAxis(target.level);
        const point = axis === "x" ? event.clientX : event.clientY;
        const position = getStructureDropPositionForAxis(node, point, axis);
        state.structureDrop = { target, position };
        markStructureDropTarget(node, position);
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });
      node.addEventListener("drop", (event) => {
        const target = readStructurePayload(node);
        if (!canDropStructure(state.structureDrag, target)) {
          return;
        }

        event.preventDefault();
        const axis = getStructureAxis(target.level);
        const point = axis === "x" ? event.clientX : event.clientY;
        const position = state.structureDrop?.position || getStructureDropPositionForAxis(node, point, axis);
        applyStructureReorder(state.structureDrag, target, position);
      });
    });
    root.querySelectorAll("[data-structure-collection]").forEach((node) => {
      node.addEventListener("dragover", (event) => {
        const resolved = resolveCollectionDropState(node, state.structureDrag, event.clientX, event.clientY);
        if (!resolved) {
          return;
        }

        event.preventDefault();
        state.structureDrop = { target: resolved.target, position: resolved.position };
        markStructureDropTarget(resolved.node, resolved.position);
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });
      node.addEventListener("drop", (event) => {
        const resolved = resolveCollectionDropState(node, state.structureDrag, event.clientX, event.clientY);
        if (!resolved) {
          return;
        }

        event.preventDefault();
        applyStructureReorder(state.structureDrag, resolved.target, resolved.position);
      });
    });
    root.querySelectorAll("[data-action='open-course-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        if (!courseKey) return;
        openEntityEditor("course-actions", { courseKey });
      });
    });
    root.querySelectorAll("[data-action='open-course-screen-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("course-screen-actions", { courseKey: state.selection.courseKey });
      });
    });
    root.querySelectorAll("[data-action='open-module-screen-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("module-screen-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey
        });
      });
    });
    root.querySelectorAll("[data-action='open-lesson-screen-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        openEntityEditor("lesson-screen-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey
        });
      });
    });
    root.querySelectorAll("[data-action='edit-course']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        if (!courseKey) return;
        openEntityEditor("course", { courseKey });
      });
    });
    root.querySelectorAll("[data-action='open-module-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key");
        if (!courseKey || !moduleKey) return;
        openEntityEditor("module-actions", { courseKey, moduleKey });
      });
    });
    root.querySelectorAll("[data-action='edit-module']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key");
        if (!courseKey || !moduleKey) return;
        openEntityEditor("module", { courseKey, moduleKey });
      });
    });
    root.querySelectorAll("[data-action='open-lesson-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key") || state.selection.moduleKey;
        const lessonKey = node.getAttribute("data-lesson-key") || state.selection.lessonKey;
        if (!courseKey || !moduleKey || !lessonKey) return;
        openEntityEditor("lesson-actions", { courseKey, moduleKey, lessonKey });
      });
    });
    root.querySelectorAll("[data-action='open-lesson-source-guide']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key") || state.selection.moduleKey;
        const lessonKey = node.getAttribute("data-lesson-key") || state.selection.lessonKey;
        if (!courseKey || !moduleKey || !lessonKey) return;
        openEntityEditor("lesson-source-guide", { courseKey, moduleKey, lessonKey });
      });
    });
    root.querySelectorAll("[data-action='edit-lesson']").forEach((node) => {
      node.addEventListener("click", () => {
        const courseKey = node.getAttribute("data-course-key") || state.selection.courseKey;
        const moduleKey = node.getAttribute("data-module-key") || state.selection.moduleKey;
        const lessonKey = node.getAttribute("data-lesson-key") || state.selection.lessonKey;
        if (!courseKey || !moduleKey || !lessonKey) return;
        openEntityEditor("lesson", { courseKey, moduleKey, lessonKey });
      });
    });
    root.querySelectorAll("[data-action='open-microsequence-actions']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key") || state.selection.microsequenceKey;
        if (!microsequenceKey) return;
        openEntityEditor("microsequence-actions", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          microsequenceKey
        });
      });
    });
    root.querySelectorAll("[data-action='toggle-microsequence-runtime']").forEach((node) => {
      node.addEventListener("click", () => {
        const microsequenceKey = node.getAttribute("data-microsequence-key") || state.selection.microsequenceKey;
        toggleSelectedMicrosequenceRuntime(microsequenceKey);
      });
    });
    root.querySelectorAll("[data-action='edit-microsequence']").forEach((node) => {
      node.addEventListener("click", () =>
        openEntityEditor("microsequence", {
          courseKey: state.selection.courseKey,
          moduleKey: state.selection.moduleKey,
          lessonKey: state.selection.lessonKey,
          microsequenceKey: state.selection.microsequenceKey
        })
      );
    });

    root.querySelector("[data-action='entity-editor-close']")?.addEventListener("click", () => closeEntityEditor());
    root.querySelectorAll(".editor-overlay").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target !== node) {
          return;
        }
        if (state.versionCompareOpen) {
          closeVersionCompare();
          return;
        }
        if (state.versionHistoryOpen) {
          closeVersionHistory();
          return;
        }
        if (state.cardCommentOpen) {
          closeCardComment();
          return;
        }
        if (state.assistConfigOpen) {
          closeAssistConfig();
          return;
        }
        if (state.codexCliSetupOpen) {
          closeCodexCliSetup();
          return;
        }
        if (state.pendingExternalImport) {
          clearPendingExternalImport();
          return;
        }
        if (state.entityEditor) {
          closeEntityEditor();
        }
      });
    });
    root.querySelectorAll("[data-action='dismiss-action-menu']").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target === node) {
          closeEntityEditor();
        }
      });
    });
    root.querySelectorAll("[data-action='run-entity-action']").forEach((node) => {
      node.addEventListener("click", () => {
        const actionKey = node.getAttribute("data-entity-action");
        if (!actionKey) return;
        runEntityAction(actionKey);
      });
    });
    root.querySelector("[data-action='comment-close']")?.addEventListener("click", () => closeCardComment());
    root.querySelector("[data-action='comment-save']")?.addEventListener("click", () => saveCardComment());
    root.querySelector("[data-action='version-history-close']")?.addEventListener("click", () => closeVersionHistory());
    root.querySelector("[data-action='version-compare-close']")?.addEventListener("click", () => closeVersionCompare());
    root.querySelector("[data-action='back-to-comparison']")?.addEventListener("click", () => backToVersionCompareSummary());
    root.querySelectorAll("[data-action='use-version-compare-side']").forEach((node) => {
      node.addEventListener("click", () => {
        const side = node.getAttribute("data-compare-side");
        if (!side) return;
        useVersionCompareSide(side);
      });
    });
    root.querySelectorAll("[data-action='select-version-compare-tab']").forEach((node) => {
      node.addEventListener("click", () => {
        selectVersionCompareTab(node.getAttribute("data-compare-tab"));
      });
    });
    root.querySelectorAll("[data-action='open-version-compare-target']").forEach((node) => {
      node.addEventListener("click", () => {
        const rawTarget = node.getAttribute("data-compare-target");
        const tabId = node.getAttribute("data-compare-tab") || "current";
        if (!rawTarget) return;
        try {
          openVersionCompareTarget(JSON.parse(rawTarget), tabId);
        } catch {
          // noop
        }
      });
    });
    root.querySelectorAll("[data-action='select-version-history-item']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        selectVersionHistoryItem(versionKey);
      });
    });
    root.querySelectorAll("[data-action='toggle-version-history-more']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        toggleVersionHistoryMore(versionKey);
      });
    });
    root.querySelectorAll("[data-action='restore-version']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        closeVersionHistory();
        restoreCardVersion(versionKey);
      });
    });
    root.querySelectorAll("[data-action='save-version-snapshot']").forEach((node) => {
      node.addEventListener("click", () => saveCurrentSnapshotFromHistory());
    });
    root.querySelectorAll("[data-action='use-structure-version']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        useStructureVersion(versionKey);
      });
    });
    root.querySelectorAll("[data-action='delete-structure-version']").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        deleteStructureVersion(versionKey);
      });
    });
    root.querySelectorAll("[data-action='use-microsequence-version'][data-version-key]").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        useMicrosequenceVersion(versionKey);
      });
    });
    root.querySelectorAll("[data-action='delete-microsequence-version'][data-version-key]").forEach((node) => {
      node.addEventListener("click", () => {
        const versionKey = node.getAttribute("data-version-key");
        if (!versionKey) return;
        deleteMicrosequenceVersion(versionKey);
      });
    });

    const cardCommentInput = root.querySelector("[data-field='card-comment']");
    const assistMicrosequenceTitleInput = root.querySelector("[data-field='assist-microsequence-title']");
    if (cardCommentInput) {
      cardCommentInput.value = state.cardCommentDraft;
      cardCommentInput.addEventListener("input", () => {
        state.cardCommentDraft = cardCommentInput.value;
      });
    }
    if (assistMicrosequenceTitleInput) {
      const commitAssistMicrosequenceTitle = () => {
        const visibleVersion = getVisualizedMicrosequenceVersion();
        updateMicrosequenceDraft({
          title: assistMicrosequenceTitleInput.value,
          tags: formatTagsText(visibleVersion?.tags || context.microsequence?.tags)
        });
      };
      assistMicrosequenceTitleInput.addEventListener("input", () => {
        syncAssistSubmitState();
      });
      assistMicrosequenceTitleInput.addEventListener("change", commitAssistMicrosequenceTitle);
      assistMicrosequenceTitleInput.addEventListener("blur", commitAssistMicrosequenceTitle);
    }
    root.querySelectorAll("[data-flowchart-inline-input='true']").forEach((node) => {
      node.addEventListener("click", () => {
        node.focus();
        if (typeof node.setSelectionRange === "function") {
          const size = String(node.value || "").length;
          node.setSelectionRange(size, size);
        }
      });
      node.addEventListener("input", () => {
        setFlowchartPracticeValue(
          node.getAttribute("data-flowchart-block-key"),
          node.getAttribute("data-flowchart-choice-kind"),
          node.getAttribute("data-flowchart-target-id"),
          node.value,
          { closePrompt: false, rerender: false }
        );
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          node.blur();
        }
      });
    });
    root.querySelector(".app-shell")?.addEventListener("click", (event) => {
      if (handleGenerationPanelActionClick(event)) {
        return;
      }
      if (!state.activeFlowchartPrompt) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const insidePrompt = target.closest("[data-flowchart-prompt='true']");
      const promptTrigger = target.closest(
        "[data-action='flowchart-open-shape'], [data-action='flowchart-open-text'], [data-action='flowchart-open-label']"
      );
      if (!insidePrompt && !promptTrigger) {
        closeFlowchartPrompt();
      }
    });

    root.querySelectorAll("[data-flowchart-scroll='true']").forEach((scrollNode) => {
      autoFitFlowchartViewport(scrollNode);
      if (scrollNode.getAttribute("data-flowchart-centered") !== "true") {
        const stage = scrollNode.querySelector("[data-flowchart-stage='true']");
        const stageWidth = stage ? stage.offsetWidth : 0;
        const stageHeight = stage ? stage.offsetHeight : 0;
        if (stageWidth > 0 && stageHeight > 0) {
          scrollNode.scrollLeft = 0;
          scrollNode.scrollTop = 0;
          scrollNode.setAttribute("data-flowchart-centered", "true");
        }
      }

      scrollNode.addEventListener(
        "wheel",
        (event) => {
          if (!(event.ctrlKey || event.metaKey)) {
            return;
          }
          event.preventDefault();
          const currentScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
          const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
          setFlowchartViewportScale(scrollNode, currentScale * factor, event.clientX, event.clientY);
        },
        { passive: false }
      );
      scrollNode.addEventListener(
        "touchstart",
        (event) => {
          if (!event.touches || event.touches.length < 2) {
            return;
          }
          const touchA = event.touches[0];
          const touchB = event.touches[1];
          state.flowchartPinch = {
            scrollNode,
            startScale: Number(scrollNode.getAttribute("data-flowchart-scale") || 1),
            startDistance: getTouchDistance(touchA, touchB)
          };
          event.preventDefault();
        },
        { passive: false }
      );
      scrollNode.addEventListener(
        "touchmove",
        (event) => {
          if (!state.flowchartPinch || state.flowchartPinch.scrollNode !== scrollNode || !event.touches || event.touches.length < 2) {
            return;
          }
          const touchA = event.touches[0];
          const touchB = event.touches[1];
          const distance = getTouchDistance(touchA, touchB);
          if (!distance || !state.flowchartPinch.startDistance) {
            return;
          }
          const midpoint = getTouchMidpoint(touchA, touchB);
          const nextScale = state.flowchartPinch.startScale * (distance / state.flowchartPinch.startDistance);
          setFlowchartViewportScale(scrollNode, nextScale, midpoint.x, midpoint.y);
          event.preventDefault();
        },
        { passive: false }
      );
      const finishPinch = () => {
        if (state.flowchartPinch?.scrollNode === scrollNode) {
          state.flowchartPinch = null;
        }
      };
      scrollNode.addEventListener("touchend", finishPinch);
      scrollNode.addEventListener("touchcancel", finishPinch);
    });

    root.querySelectorAll("[data-action='flowchart-zoom-in']").forEach((node) => {
      node.addEventListener("click", () => {
        const scrollNode = node.closest(".runtime-flow-board-shell")?.querySelector("[data-flowchart-scroll='true']");
        if (!scrollNode) return;
        const currentScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
        setFlowchartViewportScale(scrollNode, currentScale + 0.1);
      });
    });
    root.querySelectorAll("[data-action='flowchart-zoom-out']").forEach((node) => {
      node.addEventListener("click", () => {
        const scrollNode = node.closest(".runtime-flow-board-shell")?.querySelector("[data-flowchart-scroll='true']");
        if (!scrollNode) return;
        const currentScale = Number(scrollNode.getAttribute("data-flowchart-scale") || 1);
        setFlowchartViewportScale(scrollNode, currentScale - 0.1);
      });
    });
    root.querySelectorAll("[data-action='flowchart-zoom-reset']").forEach((node) => {
      node.addEventListener("click", () => {
        const scrollNode = node.closest(".runtime-flow-board-shell")?.querySelector("[data-flowchart-scroll='true']");
        if (!scrollNode) return;
        const defaultScale = Number(node.getAttribute("data-flowchart-default-scale") || 1);
        setFlowchartViewportScale(scrollNode, defaultScale);
      });
    });

    const assistMode = root.querySelector("[data-field='assist-mode']");
    const assistModel = root.querySelector("[data-field='assist-model']");
    const assistDidacticType = root.querySelector("[data-field='assist-didactic-type']");
    const assistDependencyPicker = root.querySelector("[data-field='assist-dependency-picker']");
    const assistPrompt = root.querySelector("[data-field='assist-prompt']");
    const assistAttachmentInput = root.querySelector("[data-field='assist-attachments']");
    const assistSubmitButton = root.querySelector("[data-action='apply-assist']");
    const syncAssistSubmitState = () => {
      if (!assistSubmitButton) {
        return;
      }
      const visibleTitleValue =
        assistMicrosequenceTitleInput instanceof HTMLInputElement
          ? assistMicrosequenceTitleInput.value
          : getVisualizedMicrosequenceVersion()?.title || context.microsequence?.title || "";
      const visiblePromptValue =
        assistPrompt instanceof HTMLTextAreaElement
          ? assistPrompt.value
          : state.assistDraft.promptText || "";
      const canEditCurrentView = state.view === "microsequence-assist" && canEditCurrentMicrosequenceVersion();
      const canSubmitAssist =
        canEditCurrentView &&
        !!String(visibleTitleValue || "").trim() &&
        !!String(visiblePromptValue || "").trim() &&
        !state.assistDraft.isSubmitting;
      assistSubmitButton.disabled = !canSubmitAssist;
      assistSubmitButton.setAttribute("aria-disabled", canSubmitAssist ? "false" : "true");
    };
    if (assistMode) {
      assistMode.addEventListener("change", () => {
        state.assistDraft.selectedMode = assistMode.value;
        render({ preserveState: true });
      });
    }
    if (assistDependencyPicker) {
      assistDependencyPicker.addEventListener("change", () => {
        state.assistDraft.pendingDependencyKey = assistDependencyPicker.value;
      });
    }
    if (assistModel) {
      assistModel.addEventListener("change", () => {
        setAssistModel(assistModel.value);
        render({ preserveState: true });
      });
    }
    if (assistDidacticType) {
      assistDidacticType.addEventListener("change", () => {
        const nextTypeId = assistDidacticType.value;
        state.assistDraft.didacticTypeId = ASSIST_DIDACTIC_TYPE_OPTIONS.some((item) => item.value === nextTypeId)
          ? nextTypeId
          : "";
        render({ preserveState: true });
      });
    }
    if (assistPrompt) {
      assistPrompt.addEventListener("input", () => {
        state.assistDraft.promptText = assistPrompt.value;
        syncAssistSubmitState();
      });
    }
    if (assistAttachmentInput) {
      assistAttachmentInput.addEventListener("change", () => {
        const nextFiles = Array.from(assistAttachmentInput.files || []);
        state.assistDraft.attachments = normalizeAssistAttachmentList([
          ...state.assistDraft.attachments,
          ...nextFiles
        ]);
        assistAttachmentInput.value = "";
        render({ preserveState: true });
      });
    }
    root.querySelectorAll("[data-action='remove-dependency']").forEach((node) => {
      node.addEventListener("click", () => {
        const key = node.getAttribute("data-dependency-key");
        if (!key) return;
        state.assistDraft.dependencyKeys = state.assistDraft.dependencyKeys.filter((item) => item !== key);
        syncAssistDraft();
        render({ preserveState: true });
      });
    });
    root.querySelectorAll("[data-action='remove-assist-attachment']").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-attachment-index"));
        if (!Number.isInteger(index) || index < 0) return;
        state.assistDraft.attachments = state.assistDraft.attachments.filter((_, itemIndex) => itemIndex !== index);
        render({ preserveState: true });
      });
    });
    root.querySelector("[data-action='add-dependency']")?.addEventListener("click", () => {
      const key = state.assistDraft.pendingDependencyKey;
      if (!key) return;
      const current = new Set(state.assistDraft.dependencyKeys);
      if (current.size >= MAX_ASSIST_DEPENDENCIES || current.has(key)) return;
      current.add(key);
      state.assistDraft.dependencyKeys = Array.from(current).slice(0, MAX_ASSIST_DEPENDENCIES);
      syncAssistDraft();
      render({ preserveState: true });
    });
    root.querySelector("[data-action='clear-prompt']")?.addEventListener("click", () => {
      if (root.querySelector("[data-field='generate-prompt']")) {
        state.generationDraft.promptText = "";
        clearGenerationResult();
      }
      if (root.querySelector("[data-field='assist-prompt']")) {
        state.assistDraft.promptText = "";
      }
      render({ preserveState: true });
    });
    root.querySelector("[data-action='open-assist-container-picker']")?.addEventListener("click", () => {
      openEntityEditor("assist-container-picker");
    });
    root.querySelector("[data-action='open-assist-attachment-picker']")?.addEventListener("click", () => {
      root.querySelector("[data-field='assist-attachments']")?.click();
    });
    root.querySelector("[data-action='open-generation-attachment-picker']")?.addEventListener("click", () => {
      root.querySelector("[data-field='generate-attachments']")?.click();
    });
    root.querySelector("[data-action='open-assist-config']")?.addEventListener("click", () => openAssistConfig());
    root.querySelector("[data-action='open-codex-cli-setup']")?.addEventListener("click", () => openCodexCliSetup());
    root.querySelector("[data-action='apply-assist']")?.addEventListener("click", () => {
      void submitAssistRequest();
    });
    root.querySelector("[data-action='accept-generated-version']")?.addEventListener("click", () => {
      acceptPendingGeneratedMicrosequenceVersion();
    });
    root.querySelector("[data-action='discard-generated-version']")?.addEventListener("click", () => {
      discardPendingGeneratedMicrosequenceVersion();
    });
    root.querySelector("[data-action='open-version-history']")?.addEventListener("click", () => openVersionHistory());
    root.querySelector("[data-action='assist-config-close']")?.addEventListener("click", () => closeAssistConfig());
    root.querySelector("[data-action='close-codex-cli-setup']")?.addEventListener("click", () => closeCodexCliSetup());
    root.querySelector("[data-action='cancel-external-import']")?.addEventListener("click", () => clearPendingExternalImport());
    root.querySelector("[data-action='confirm-external-import']")?.addEventListener("click", () => confirmPendingExternalImport());
    root.querySelector("[data-action='test-codex-cli-connection']")?.addEventListener("click", () => {
      void testCodexCliConnection();
    });
    root.querySelector("[data-action='copy-codex-cli-script']")?.addEventListener("click", () => {
      void copyTextToClipboard(getCodexSetupScript());
    });
    root.querySelector("[data-action='copy-codex-cli-endpoint']")?.addEventListener("click", () => {
      void copyTextToClipboard(getCodexSetupEndpoint());
    });
    root.querySelector("[data-action='copy-codex-cli-health-command']")?.addEventListener("click", () => {
      void copyTextToClipboard(getCodexSetupHealthCommand());
    });

    const assistConfigModel = root.querySelector("[data-field='assist-config-model']");
    const assistConfigApiKey = root.querySelector("[data-field='assist-config-api-key']");
    const assistConfigCodexEndpoint = root.querySelector("[data-field='assist-config-codex-endpoint']");
    const assistConfigCodexToken = root.querySelector("[data-field='assist-config-codex-token']");
    if (assistConfigModel) {
      assistConfigModel.addEventListener("change", () => {
        persistAssistConfigValue({ model: assistConfigModel.value });
        void handleCodexModelSelection(assistConfigModel.value);
      });
    }
    if (assistConfigApiKey) {
      assistConfigApiKey.addEventListener("input", () => {
        persistAssistConfigValue({ apiKey: assistConfigApiKey.value });
      });
    }
    if (assistConfigCodexEndpoint) {
      assistConfigCodexEndpoint.addEventListener("input", () => {
        persistAssistConfigValue({ codexEndpoint: assistConfigCodexEndpoint.value });
      });
    }
    if (assistConfigCodexToken) {
      assistConfigCodexToken.addEventListener("input", () => {
        persistAssistConfigValue({ codexToken: assistConfigCodexToken.value });
      });
    }

    if (entityEditorModel) {
      const fields = {};
      entityEditorModel.fields.forEach((field) => {
        const node = root.querySelector(`[data-field='${field.name}']`);
        if (node) {
          fields[field.name] = node;
        }
      });

      const handler = () => {
        updateEntityDraft(
          Object.fromEntries(
            Object.entries(fields).map(([name, node]) => [name, readEntityFieldValue(node)])
          )
        );
      };

      Object.values(fields).forEach((node) => {
        bindEntityFieldNode(node, handler);
      });

      if (state.entityEditor?.kind === "lesson-source-guide" && fields.presetId instanceof HTMLSelectElement) {
        fields.presetId.addEventListener("change", () => {
          const preset = buildLessonGuidanceFromPreset(fields.presetId.value);
          setEntityFieldValue(fields.resourceTags, preset.resourceTags);
          setEntityFieldValue(fields.contentTypeTags, preset.contentTypeTags);
          setEntityFieldValue(fields.learningActionTags, preset.learningActionTags);
          setEntityFieldValue(fields.supportLevel, preset.supportLevel);
          handler();
        });
      }
    }

    syncStructureVersionStripScroller({ centerActiveTab: state.centerActiveStructureVersionTabOnRender !== false });
    state.centerActiveStructureVersionTabOnRender = true;
    syncPendingStructureFocus();
  }

  ensureCurrentCardSnapshot();
  syncAssistDraft();
  globalThis.AraLearnAndroidImport = {
    receiveSharedJson(rawText, sourceName) {
      return receiveExternalJsonImport(rawText, { sourceName });
    }
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("resize", () => {
      syncVersionTabScroller();
      syncStructureVersionStripScroller({ centerActiveTab: true });
      syncCardStripScroller({ keepActiveCardInView: true });
    });
  }
  root.addEventListener("click", (event) => {
    void handleGenerationPanelActionClick(event);
  });
  syncVisibleStructureVersionsFromProject();
  render({ preserveState: false });
}
