import { sanitizeContractCard } from "../../contract/contractCard.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
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
    ...(text(card.feedbackAfter || card.after) ? { after: text(card.feedbackAfter || card.after) } : {})
  };
}

function normalizeTreeNodeType(value) {
  return value === "file" ? "file" : "folder";
}

function adaptTree(card) {
  const nodes = Array.isArray(card.nodes) ? card.nodes : [];
  const byParent = new Map();
  nodes.forEach((node) => {
    const parentId = text(node?.parentId);
    const list = byParent.get(parentId) || [];
    list.push(node);
    byParent.set(parentId, list);
  });

  function buildItems(parentId = "") {
    return Object.fromEntries(
      (byParent.get(parentId) || []).map((node, index) => {
        const label = text(node?.label) || `item-${index + 1}`;
        if (normalizeTreeNodeType(node?.type) === "file") {
          return [label, null];
        }
        return [label, buildItems(text(node?.id))];
      })
    );
  }

  const rootItems = buildItems("");
  const rootLabel = text(card.rootLabel);
  const items = rootLabel ? { [rootLabel]: rootItems } : rootItems;

  return {
    title: text(card.title) || "Árvore",
    ...(text(card.prompt) ? { say: text(card.prompt) } : {}),
    tree: {
      ...(text(card.base) ? { base: text(card.base) } : {}),
      ...(text(card.current) ? { current: text(card.current) } : {}),
      ...(text(card.selected) ? { selected: text(card.selected) } : {}),
      ...(Array.isArray(card.closed) ? { closed: card.closed.map(text).filter(Boolean) } : {}),
      items
    }
  };
}

export function adaptResourceCardToPublicCard(card) {
  const resourceType = text(card?.resourceType);
  if (resourceType === "paragraph") {
    return sanitizeContractCard({
      title: text(card.title) || "Card",
      say: text(card.text)
    });
  }
  if (resourceType === "multiple_choice") {
    return sanitizeContractCard(adaptMultipleChoice(card));
  }
  if (resourceType === "code_editor") {
    return sanitizeContractCard({
      title: text(card.title) || "Código",
      say: text(card.prompt) || "Observe o trecho abaixo.",
      code: text(card.code),
      ...(text(card.language) ? { language: text(card.language) } : {})
    });
  }
  if (resourceType === "table") {
    return sanitizeContractCard({
      title: text(card.title) || "Tabela",
      table: {
        columns: Array.isArray(card.columns) ? card.columns.map(text).filter(Boolean) : [],
        rows: (Array.isArray(card.rows) ? card.rows : []).map((row) => (Array.isArray(row) ? row.map(text) : []))
      }
    });
  }
  if (resourceType === "flowchart") {
    return sanitizeContractCard(adaptFlowchart(card));
  }
  if (resourceType === "block_gap_fill") {
    return sanitizeContractCard(adaptBlockGapFill(card));
  }
  if (resourceType === "tree") {
    return sanitizeContractCard(adaptTree(card));
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
