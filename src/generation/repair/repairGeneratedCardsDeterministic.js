function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonIfNeeded(value) {
  if (typeof value !== "string") {
    return value;
  }
  const raw = value.trim();
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : raw;
  return JSON.parse(candidate);
}

function normalizeFeedbackAfter(value) {
  return text(value)
    .replace(/\[\[([^\]:|]+)(?:::[^\]]*)?\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSourceRefs(sourceRefs, availableSourceIds) {
  if (!Array.isArray(sourceRefs)) {
    return [];
  }
  return sourceRefs.map((item) => text(item)).filter((item) => availableSourceIds.has(item));
}

function normalizeMultipleChoice(card) {
  const options = Array.isArray(card.options) ? card.options : [];
  const normalizedOptions = options.map((option, index) => ({
    optionId: text(option?.optionId) || `option_${index + 1}`,
    label: text(option?.label)
  }));
  const correctOptionId = text(card.correctOptionId) || normalizedOptions[0]?.optionId || "";
  return {
    ...card,
    options: normalizedOptions,
    correctOptionId
  };
}

function normalizeBlockGapFill(card) {
  const blocks = (Array.isArray(card.blocks) ? card.blocks : []).map((block, index) => ({
    blockId: text(block?.blockId) || `block_${index + 1}`,
    label: text(block?.label)
  }));
  const blockIds = new Set(blocks.map((block) => block.blockId));
  const segments = (Array.isArray(card.segments) ? card.segments : []).map((segment, index) => {
    if (segment?.kind === "blank") {
      const acceptedBlockIds = (Array.isArray(segment.acceptedBlockIds) ? segment.acceptedBlockIds : [])
        .map((item) => text(item))
        .filter((item) => blockIds.has(item));
      return {
        kind: "blank",
        blankId: text(segment.blankId) || `blank_${index + 1}`,
        acceptedBlockIds: acceptedBlockIds.length ? acceptedBlockIds : blocks[0] ? [blocks[0].blockId] : []
      };
    }
    return {
      kind: "text",
      value: text(segment?.value)
    };
  });

  return {
    ...card,
    segments,
    blocks,
    feedbackAfter: normalizeFeedbackAfter(card.feedbackAfter)
  };
}

function allowedCardFields(resourceType) {
  const common = ["position", "resourceType", "title", "sourceRefs", "sourceNote"];
  const byType = {
    paragraph: [...common, "text"],
    multiple_choice: [...common, "question", "options", "correctOptionId", "feedback"],
    code_editor: [...common, "prompt", "language", "code", "expectedAnswer"],
    table: [...common, "columns", "rows", "focus"],
    flowchart: [...common, "nodes", "edges"],
    block_gap_fill: [...common, "prompt", "segments", "blocks", "feedbackAfter"],
    tree: [...common, "prompt", "base", "current", "selected", "closed", "rootLabel", "nodes"],
    plane: [...common, "prompt", "vector", "vectors", "sum", "scale", "distance", "result", "x", "y"],
    matrix: [...common, "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence"]
  };
  return new Set(byType[resourceType] || common);
}

export function repairGeneratedCardsDeterministic(rawGeneratedResponse, generationContract = {}) {
  const availableSourceIds = new Set((generationContract?.sources || []).map((item) => item.sourceId));
  const parsed = parseJsonIfNeeded(rawGeneratedResponse);
  const cards = Array.isArray(parsed?.cards) ? [...parsed.cards] : [];
  const plannedByPosition = new Map((generationContract?.didacticPlan?.cardPlan || []).map((item) => [item.position, item]));

  const repairedCards = cards
    .map((card, index) => {
      const numericPosition = Number(card?.position);
      const planned = plannedByPosition.get(numericPosition) || generationContract?.didacticPlan?.cardPlan?.[index] || {};
      const resourceType = text(card?.resourceType) || text(planned.resourceType);
      const allowedFields = allowedCardFields(resourceType);
      const sanitized = Object.fromEntries(
        Object.entries(card || {}).filter(([fieldName]) => allowedFields.has(fieldName))
      );
      const next = {
        ...sanitized,
        position: Number.isInteger(numericPosition) ? numericPosition : planned.position,
        resourceType,
        title: text(sanitized.title) || text(planned.label) || text(planned.role) || "Card",
        sourceRefs: normalizeSourceRefs(sanitized.sourceRefs, availableSourceIds),
        ...(text(sanitized.sourceNote) ? { sourceNote: text(sanitized.sourceNote) } : {})
      };
      if (resourceType === "multiple_choice") {
        return normalizeMultipleChoice(next);
      }
      if (resourceType === "block_gap_fill") {
        return normalizeBlockGapFill(next);
      }
      return next;
    })
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));

  return {
    cards: repairedCards
  };
}
