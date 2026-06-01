import { listMicrosequenceSizes } from "../types/microsequenceSizes.js";
import { listMicrosequenceTypeSummaries } from "../types/microsequenceTypes.js";
import { listCardResourceSummaries } from "../resources/cardResourceDefinitions.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function normalizePreferredResource(value = "") {
  const normalized = text(value);
  const lowered = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return lowered === "automatico" || lowered === "automatic" ? "" : normalized;
}

function normalizeGuide(source = {}) {
  const guide = source?.guide && typeof source.guide === "object" ? source.guide : source || {};
  return {
    goal: text(guide.goal),
    include: Array.isArray(guide.include) ? guide.include.map(text).filter(Boolean) : [],
    exclude: Array.isArray(guide.exclude) ? guide.exclude.map(text).filter(Boolean) : [],
    notation: Array.isArray(guide.notation) ? guide.notation.map(text).filter(Boolean) : [],
    avoid: Array.isArray(guide.avoid) ? guide.avoid.map(text).filter(Boolean) : []
  };
}

function summarizeText(value = "", maxLength = 240) {
  const normalized = text(value).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function summarizeSource(item = {}) {
  const blockSummary = (Array.isArray(item?.sourceBlocks) ? item.sourceBlocks : [])
    .map((block) => text(block?.text))
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  return summarizeText(blockSummary || text(item?.textContent));
}

function normalizeSources(attachedSources = [], userSelectedSourceIds = []) {
  const selected = new Set((Array.isArray(userSelectedSourceIds) ? userSelectedSourceIds : []).map(text).filter(Boolean));
  return (Array.isArray(attachedSources) ? attachedSources : [])
    .map((item, index) => {
      const id = text(item?.id) || text(item?.sourceId) || `source-${index + 1}`;
      return {
        id,
        title: text(item?.displayName || item?.name || id),
        kind: text(item?.kind),
        summary: summarizeSource(item),
        selected: selected.size ? selected.has(id) : true
      };
    })
    .filter((item) => item.selected)
    .map(({ selected: _selected, ...item }) => item);
}

function normalizeRequestContext(requestContext = {}) {
  const preferredResource = normalizePreferredResource(requestContext?.preferredResource);
  return {
    mode: text(requestContext?.mode) === "repair" ? "repair" : "generate",
    prompt: text(requestContext?.prompt),
    preferredResource,
    extraResources: unique([
      ...(Array.isArray(requestContext?.extraResources) ? requestContext.extraResources : []),
      preferredResource
    ]),
    selectedRefs: unique(requestContext?.selectedRefs)
  };
}

function normalizeContextPacket(contextPacket = {}) {
  return {
    selectedRefs: unique(contextPacket?.refs?.selected),
    refs: (Array.isArray(contextPacket?.refs?.items) ? contextPacket.refs.items : [])
      .map((item) => ({
        title: text(item?.title),
        goal: text(item?.goal),
        role: text(item?.role),
        covers: unique(item?.covers),
        checks: unique(item?.checks),
        dependency: item?.dependency === true,
        selected: item?.selected === true
      }))
      .filter((item) => item.title),
    next: contextPacket?.next && typeof contextPacket.next === "object"
      ? {
          title: text(contextPacket.next.title),
          goal: text(contextPacket.next.goal),
          role: text(contextPacket.next.role),
          covers: unique(contextPacket.next.covers),
          checks: unique(contextPacket.next.checks)
        }
      : null,
    existingCards: (Array.isArray(contextPacket?.microsequence?.existingCards) ? contextPacket.microsequence.existingCards : [])
      .map((card) => ({
        position: Number(card?.position) || 0,
        resource: text(card?.resource),
        kind: text(card?.kind),
        exercise: text(card?.exercise),
        title: text(card?.title)
      }))
      .filter((card) => card.position > 0 && card.resource),
    currentCards: Array.isArray(contextPacket?.microsequence?.currentCards)
      ? structuredClone(contextPacket.microsequence.currentCards)
      : []
  };
}

function collectKnownErrors(selectedLesson = {}, targetMicrosequence = {}, contextPacket = {}) {
  return unique([
    ...((Array.isArray(selectedLesson?.topics) ? selectedLesson.topics : []).flatMap((topic) => (
      Array.isArray(topic?.errors) ? topic.errors : []
    )))
  ]);
}

export function buildMicrosequencePlanningContract({
  selectedCourse,
  selectedModule,
  selectedLesson,
  targetMicrosequence,
  userPrompt,
  attachedSources = [],
  userSelectedSourceIds = [],
  userSelectedExtraResourceTypes = [],
  requestContext = {},
  contextPacket = {}
}) {
  const guide = normalizeGuide(selectedLesson?.guide || selectedModule?.guide || {});
  const normalizedRequestContext = normalizeRequestContext({
    ...requestContext,
    prompt: text(requestContext?.prompt) || text(userPrompt),
    extraResources: [
      ...(Array.isArray(userSelectedExtraResourceTypes) ? userSelectedExtraResourceTypes : []),
      ...(Array.isArray(requestContext?.extraResources) ? requestContext.extraResources : [])
    ]
  });
  const microsequence = {
    title: text(targetMicrosequence?.title),
    goal: text(targetMicrosequence?.goal),
    role: text(targetMicrosequence?.role),
    branchOf: text(targetMicrosequence?.branchOf),
    covers: Array.isArray(targetMicrosequence?.covers) ? targetMicrosequence.covers.map(text).filter(Boolean) : [],
    checks: Array.isArray(targetMicrosequence?.checks) ? targetMicrosequence.checks.map(text).filter(Boolean) : []
  };

  return {
    task: "bottom_up_micro_plan",
    language: "pt-BR",
    path: {
      course: text(selectedCourse?.title),
      module: text(selectedModule?.title),
      lesson: text(selectedLesson?.title),
      microsequence: text(targetMicrosequence?.title)
    },
    guide,
    microsequence,
    request: {
      mode: normalizedRequestContext.mode,
      prompt: normalizedRequestContext.prompt,
      preferredResource: normalizedRequestContext.preferredResource,
      extraResources: normalizedRequestContext.extraResources
    },
    knownErrors: collectKnownErrors(selectedLesson, targetMicrosequence, contextPacket),
    context: normalizeContextPacket(contextPacket),
    availableTypes: listMicrosequenceTypeSummaries()
      .filter((item) => !["assisted", "simple"].includes(text(item?.id)))
      .map((item) => ({
        id: item.id,
        label: item.label,
        use: item.shortDescription
      })),
    availableSizes: listMicrosequenceSizes().map((item) => ({
      id: item.id,
      cards: item.cardCount
    })),
    availableResources: listCardResourceSummaries().map((item) => ({
      id: item.id,
      use: item.shortDescription
    })),
    sources: normalizeSources(attachedSources, userSelectedSourceIds),
    rules: [
      "Return only valid JSON.",
      "Return exactly: type, size, goal, extraResources, sources and reason.",
      "Do not return cardPlan or cards.",
      "type must be one id from availableTypes.",
      "size must be one id from availableSizes.",
      "microsequence.role is context only and must not be copied into type.",
      "Prefer size=long for explain, support or conceptually dense microsequences so theory can be distributed instead of compressed.",
      "Prefer size=medium for primarily practical microsequences with one local concept already established.",
      "Use size=short only when the request is explicitly brief and the local scope is genuinely tiny.",
      "If the topic needs more explanation, increase the size instead of compressing theory into fewer cards.",
      "If you add more theory, also add more practice or review later in the same microsequence for consolidation.",
      "Distribute relevant theory across multiple short steps instead of collapsing everything into one long opening card.",
      "Prefer plans that alternate explanation and consolidation when that helps the learner carry the same local idea into practice.",
      "Keep the plan inside guide.include and away from guide.exclude.",
      ...(microsequence.branchOf
        ? [
            "If microsequence.branchOf exists, keep the branch tightly local and reserve a final step that returns the learner to the planned track."
          ]
        : []),
      ...(normalizedRequestContext.mode === "repair"
        ? [
            "If request.mode is repair, request.prompt is the main instruction for what must change.",
            "If request.mode is repair, preserve the current sequence when it already fits the scope and the goal.",
            "If request.mode is repair, avoid expanding scope or rewriting unaffected parts without need."
          ]
        : [])
    ]
  };
}
