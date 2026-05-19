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

function clampGraphCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, numeric));
}

function normalizeGraphCard(card) {
  const vertices = [];
  const vertexIds = new Set();

  (Array.isArray(card.vertices) ? card.vertices : []).forEach((vertex) => {
    const id = text(vertex?.id);
    if (!id || vertexIds.has(id)) {
      return;
    }
    vertexIds.add(id);
    const nextVertex = {
      id,
      label: text(vertex?.label) || id
    };
    const x = clampGraphCoordinate(vertex?.x);
    const y = clampGraphCoordinate(vertex?.y);
    if (x !== undefined) nextVertex.x = x;
    if (y !== undefined) nextVertex.y = y;
    vertices.push(nextVertex);
  });

  const edgeKeys = new Set();
  const edges = [];
  (Array.isArray(card.edges) ? card.edges : []).forEach((edge) => {
    const from = text(edge?.from);
    const to = text(edge?.to);
    if (!from || !to || from === to || !vertexIds.has(from) || !vertexIds.has(to)) {
      return;
    }
    const key = [from, to].sort().join("::");
    if (edgeKeys.has(key)) {
      return;
    }
    edgeKeys.add(key);
    const nextEdge = { from, to };
    if (typeof edge?.weight === "number" && Number.isFinite(edge.weight)) {
      nextEdge.weight = edge.weight;
    } else if (text(edge?.weight)) {
      nextEdge.weight = text(edge.weight).slice(0, 24);
    }
    if (text(edge?.label)) {
      nextEdge.label = text(edge.label).slice(0, 40);
    }
    edges.push(nextEdge);
  });

  const highlightVertices = Array.from(new Set(
    (Array.isArray(card?.highlight?.vertices) ? card.highlight.vertices : [])
      .map((item) => text(item))
      .filter((item) => vertexIds.has(item))
  ));
  const highlightEdges = [];
  const seenHighlightEdges = new Set();
  (Array.isArray(card?.highlight?.edges) ? card.highlight.edges : []).forEach((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return;
    }
    const from = text(pair[0]);
    const to = text(pair[1]);
    const key = [from, to].sort().join("::");
    if (!from || !to || !edgeKeys.has(key) || seenHighlightEdges.has(key)) {
      return;
    }
    seenHighlightEdges.add(key);
    highlightEdges.push([from, to]);
  });

  return {
    ...card,
    vertices,
    edges,
    ...((highlightVertices.length || highlightEdges.length)
      ? {
          highlight: {
            ...(highlightVertices.length ? { vertices: highlightVertices } : {}),
            ...(highlightEdges.length ? { edges: highlightEdges } : {})
          }
        }
      : {})
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
    graph: [...common, "prompt", "vertices", "edges", "highlight"],
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
      if (resourceType === "graph") {
        return normalizeGraphCard(next);
      }
      return next;
    })
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));

  return {
    cards: repairedCards
  };
}
