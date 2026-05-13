import { sanitizeContractCard } from "../../contract/contractCard.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function matrixCell(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return text(value);
}

function numberPair(value) {
  return Array.isArray(value) ? value.map((item) => Number(item)).slice(0, 2) : value;
}

function plainFeedbackText(value) {
  return text(value)
    .replace(/\[\[([^\]:|]+)(?:::[^\]]*)?\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function adaptMultipleChoice(card) {
  const options = Array.isArray(card.options) ? card.options : [];
  const correct = options.find((item) => item?.optionId === card.correctOptionId);
  const wrong = options
    .filter((item) => item?.optionId !== card.correctOptionId)
    .map((item) => text(item?.label))
    .filter(Boolean);
  return {
    title: text(card.title) || "Pergunta",
    ask: text(card.question),
    answer: text(correct?.label),
    wrong,
    ...(text(card.feedback) ? { after: text(card.feedback) } : {})
  };
}

function adaptFlowchart(card) {
  const nodes = Array.isArray(card.nodes) ? card.nodes : [];
  const flow = nodes.map((node, index) => {
    const label = text(node?.label || node?.title || node?.id) || `Etapa ${index + 1}`;
    if (index === 0) {
      return { id: text(node?.id) || `flow-${index + 1}`, start: label };
    }
    if (index === nodes.length - 1) {
      return { id: text(node?.id) || `flow-${index + 1}`, end: label };
    }
    return { id: text(node?.id) || `flow-${index + 1}`, process: label };
  });
  return {
    title: text(card.title) || "Fluxograma",
    flow
  };
}

function adaptBlockGapFill(card) {
  const blocks = Array.isArray(card.blocks) ? card.blocks : [];
  const blockById = new Map(blocks.map((block) => [text(block?.blockId), text(block?.label)]));
  const optionLabels = blocks.map((block) => text(block?.label)).filter(Boolean);
  const say = (Array.isArray(card.segments) ? card.segments : [])
    .map((segment) => {
      if (segment?.kind === "text") {
        return text(segment.value);
      }
      if (segment?.kind !== "blank") {
        return "";
      }
      const accepted = (Array.isArray(segment.acceptedBlockIds) ? segment.acceptedBlockIds : [])
        .map((blockId) => blockById.get(text(blockId)))
        .find(Boolean);
      if (!accepted) {
        return "";
      }
      const options = Array.from(new Set([accepted, ...optionLabels])).filter(Boolean);
      return `[[${accepted}${options.length > 1 ? `::${options.join("|")}` : ""}]]`;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: text(card.title) || "Lacunas",
    say: [text(card.prompt), say].filter(Boolean).join(" "),
    ...(plainFeedbackText(card.feedbackAfter || card.after) ? { after: plainFeedbackText(card.feedbackAfter || card.after) } : {})
  };
}

function normalizeTreeNodeType(value) {
  return value === "file" ? "file" : "folder";
}

function adaptTree(card) {
  const nodes = Array.isArray(card.nodes) ? card.nodes : [];
  const closed = Array.isArray(card.closed) ? card.closed.map(text).filter(Boolean) : [];
  const byParent = new Map();
  nodes.forEach((node) => {
    const parentId = text(node?.parentId);
    const list = byParent.get(parentId) || [];
    list.push(node);
    byParent.set(parentId, list);
  });

  function buildNodeItems(node) {
    if (normalizeTreeNodeType(node?.type) === "file") {
      return null;
    }
    return buildItems(text(node?.id));
  }

  function buildItems(parentId = "") {
    return Object.fromEntries(
      (byParent.get(parentId) || []).map((node, index) => {
        const label = text(node?.label) || `item-${index + 1}`;
        return [label, buildNodeItems(node)];
      })
    );
  }

  const roots = byParent.get("") || [];
  const rootLabel = text(card.rootLabel);
  const items =
    rootLabel && roots.length === 1 && text(roots[0]?.label) === rootLabel
      ? { [rootLabel]: buildNodeItems(roots[0]) }
      : rootLabel
        ? { [rootLabel]: roots.length ? buildItems("") : {} }
        : buildItems("");

  return {
    title: text(card.title) || "Árvore",
    ...(text(card.prompt) ? { say: text(card.prompt) } : {}),
    tree: {
      ...(text(card.base) ? { base: text(card.base) } : {}),
      ...(text(card.current) ? { current: text(card.current) } : {}),
      ...(text(card.selected) ? { selected: text(card.selected) } : {}),
      ...(closed.length ? { closed } : {}),
      items
    }
  };
}

function withSourceRefs(publicCard, card) {
  const sourceRefs = Array.isArray(card?.sourceRefs) ? card.sourceRefs.map(text).filter(Boolean) : [];
  const domainRefs = Array.isArray(card?.domainRefs) ? card.domainRefs.map(text).filter(Boolean) : [];
  const practiceVariantRefs = Array.isArray(card?.practiceVariantRefs) ? card.practiceVariantRefs.map(text).filter(Boolean) : [];
  const didacticPurpose = text(card?.didacticPurpose);
  return {
    ...publicCard,
    ...(sourceRefs.length ? { sourceRefs } : {}),
    ...(domainRefs.length ? { domainRefs } : {}),
    ...(practiceVariantRefs.length ? { practiceVariantRefs } : {}),
    ...(didacticPurpose ? { didacticPurpose } : {})
  };
}

function adaptPlane(card) {
  const plane = {};
  if (Array.isArray(card.x)) plane.x = numberPair(card.x);
  if (Array.isArray(card.y)) plane.y = numberPair(card.y);
  if (Array.isArray(card.vector)) plane.vector = numberPair(card.vector);
  if (Array.isArray(card.vectors)) plane.vectors = card.vectors.map(numberPair);
  if (Array.isArray(card.sum)) plane.sum = card.sum.map(numberPair);
  if (card.scale && typeof card.scale === "object") {
    plane.scale = {
      k: Number(card.scale.k),
      vector: numberPair(card.scale.vector)
    };
  }
  if (Array.isArray(card.distance)) plane.distance = card.distance.map(numberPair);
  if (Array.isArray(card.result)) {
    plane.result = card.result.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : text(item)));
  }

  return {
    title: text(card.title) || "Plano cartesiano",
    ...(text(card.prompt) ? { say: text(card.prompt) } : {}),
    plane
  };
}

function adaptMatrix(card) {
  const sequence = Array.isArray(card.sequence)
    ? card.sequence.map((item) => ({
        ...(text(item?.connector) ? { connector: text(item.connector) } : {}),
        ...(text(item?.name) ? { name: text(item.name) } : {}),
        values: (Array.isArray(item?.values) ? item.values : []).map((row) =>
          (Array.isArray(row) ? row : []).map(matrixCell)
        ),
        ...(item?.highlight !== undefined ? { highlight: item.highlight } : {}),
        ...(item?.dividerAfterColumn !== undefined ? { dividerAfterColumn: Number(item.dividerAfterColumn) } : {})
      }))
    : [];

  return {
    title: text(card.title) || "Matriz",
    ...(text(card.prompt) ? { say: text(card.prompt) } : {}),
    matrix: {
      ...(text(card.name) ? { name: text(card.name) } : {}),
      ...(sequence.length
        ? { sequence }
        : {
            values: (Array.isArray(card.values) ? card.values : []).map((row) =>
              (Array.isArray(row) ? row : []).map(matrixCell)
            ),
            ...(card.highlight !== undefined ? { highlight: card.highlight } : {}),
            ...(card.dividerAfterColumn !== undefined ? { dividerAfterColumn: Number(card.dividerAfterColumn) } : {})
          })
    }
  };
}

export function adaptResourceCardToPublicCard(card) {
  const resourceType = text(card?.resourceType);
  if (resourceType === "paragraph") {
    return sanitizeContractCard(withSourceRefs({
      title: text(card.title) || "Card",
      say: text(card.text)
    }, card));
  }
  if (resourceType === "multiple_choice") {
    return sanitizeContractCard(withSourceRefs(adaptMultipleChoice(card), card));
  }
  if (resourceType === "code_editor") {
    return sanitizeContractCard(withSourceRefs({
      title: text(card.title) || "Código",
      say: text(card.prompt) || "Observe o trecho abaixo.",
      code: text(card.code),
      ...(text(card.language) ? { language: text(card.language) } : {})
    }, card));
  }
  if (resourceType === "table") {
    const focus =
      card.focus && typeof card.focus === "object"
        ? {
            ...(text(card.focus.label) ? { label: text(card.focus.label) } : {}),
            ...(Number.isInteger(card.focus.row) ? { row: card.focus.row } : {}),
            ...(Array.isArray(card.focus.rows) ? { rows: card.focus.rows.filter((value) => Number.isInteger(value) && value >= 1) } : {}),
            ...(Number.isInteger(card.focus.column) ? { column: card.focus.column } : {}),
            ...(Array.isArray(card.focus.columns)
              ? { columns: card.focus.columns.filter((value) => Number.isInteger(value) && value >= 1) }
              : {})
          }
        : null;
    return sanitizeContractCard(withSourceRefs({
      title: text(card.title) || "Tabela",
      table: {
        columns: Array.isArray(card.columns) ? card.columns.map(text).filter(Boolean) : [],
        rows: (Array.isArray(card.rows) ? card.rows : []).map((row) => (Array.isArray(row) ? row.map(text) : [])),
        ...(focus && Object.keys(focus).length ? { focus } : {})
      }
    }, card));
  }
  if (resourceType === "flowchart") {
    return sanitizeContractCard(withSourceRefs(adaptFlowchart(card), card));
  }
  if (resourceType === "block_gap_fill") {
    return sanitizeContractCard(withSourceRefs(adaptBlockGapFill(card), card));
  }
  if (resourceType === "tree") {
    return sanitizeContractCard(withSourceRefs(adaptTree(card), card));
  }
  if (resourceType === "plane") {
    return sanitizeContractCard(withSourceRefs(adaptPlane(card), card));
  }
  if (resourceType === "matrix") {
    return sanitizeContractCard(withSourceRefs(adaptMatrix(card), card));
  }

  throw new Error(`Recurso interno sem adaptador público: ${resourceType || "desconhecido"}.`);
}

export function adaptResourceCardsToPublicCards(cards = []) {
  const errors = [];
  const publicCards = [];
  (Array.isArray(cards) ? cards : []).forEach((card, index) => {
    try {
      publicCards.push(adaptResourceCardToPublicCard(card));
    } catch (error) {
      errors.push(`Card ${index + 1}: ${error instanceof Error ? error.message : "falha de adaptação"}`);
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, cards: publicCards };
}
