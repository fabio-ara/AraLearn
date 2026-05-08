import { buildGeneratedCardsRepairPrompt } from "../prompts/buildGeneratedCardsRepairPrompt.js";
import { validateGeneratedCards } from "./validateGeneratedCards.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getCards(response) {
  if (typeof response === "string") {
    try {
      return getCards(JSON.parse(response));
    } catch {
      return null;
    }
  }
  return Array.isArray(response?.cards) ? response.cards : null;
}

function compactErrors(errors = []) {
  return Array.isArray(errors) ? errors.map((error) => String(error || "").trim()).filter(Boolean) : [];
}

function normalizeOptionId(value, index) {
  return text(value) || `option_${index + 1}`;
}

function plainFeedbackText(value) {
  return text(value)
    .replace(/\[\[([^\]:|]+)(?:::[^\]]*)?\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function repairMultipleChoice(card) {
  const options = Array.isArray(card.options)
    ? card.options.map((option, index) => ({
        optionId: normalizeOptionId(option?.optionId ?? option?.id, index),
        label: text(option?.label ?? option?.text ?? option?.value) || `Alternativa ${index + 1}`
      }))
    : [];
  const correctOptionId = text(card.correctOptionId ?? card.correctId ?? card.answerOptionId);
  const correctIndex = Number.isInteger(card.correctIndex) ? card.correctIndex : Number.isInteger(card.answerIndex) ? card.answerIndex : null;
  const answerText = text(card.answer ?? card.correctAnswer);
  const inferredCorrect =
    correctOptionId ||
    (correctIndex !== null ? options[correctIndex]?.optionId : "") ||
    options.find((option) => option.label === answerText)?.optionId ||
    options[0]?.optionId ||
    "";

  return {
    resourceType: "multiple_choice",
    title: text(card.title) || "Verificação",
    question: text(card.question ?? card.prompt ?? card.text) || "Escolha a alternativa correta.",
    options,
    correctOptionId: inferredCorrect,
    feedback: text(card.feedback ?? card.feedbackAfter ?? card.after) || "Revise a explicação e tente novamente."
  };
}

function repairTree(card) {
  const nodes = Array.isArray(card.nodes) ? card.nodes : [];
  const closed = Array.isArray(card.closed) ? card.closed.map(text).filter(Boolean) : [];
  const ids = new Set();
  const repairedNodes = nodes.map((node, index) => {
    const idBase = text(node?.id ?? node?.key ?? node?.path ?? node?.label) || `node_${index + 1}`;
    let id = idBase;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${idBase}_${suffix}`;
      suffix += 1;
    }
    ids.add(id);
    return {
      id,
      label: text(node?.label ?? node?.title ?? node?.name ?? node?.id) || `Item ${index + 1}`,
      ...(node?.parentId === null ? { parentId: null } : text(node?.parentId) ? { parentId: text(node.parentId) } : {}),
      ...(node?.type === "file" ? { type: "file" } : { type: "folder" })
    };
  });

  return {
    resourceType: "tree",
    title: text(card.title) || "Árvore",
    ...(text(card.prompt ?? card.text) ? { prompt: text(card.prompt ?? card.text) } : {}),
    ...(text(card.base) ? { base: text(card.base) } : {}),
    ...(text(card.current ?? card.currentPath) ? { current: text(card.current ?? card.currentPath) } : {}),
    ...(text(card.selected ?? card.selectedPath) ? { selected: text(card.selected ?? card.selectedPath) } : {}),
    ...(closed.length ? { closed } : {}),
    ...(text(card.rootLabel) ? { rootLabel: text(card.rootLabel) } : {}),
    nodes: repairedNodes
  };
}

function repairBlockGapFill(card) {
  const sourceBlocks = Array.isArray(card.blocks) ? card.blocks : [];
  const blocks = sourceBlocks.map((block, index) => ({
    blockId: text(block?.blockId ?? block?.id) || `block_${index + 1}`,
    label: text(block?.label ?? block?.text ?? block?.value) || `Bloco ${index + 1}`
  }));
  const fallbackBlockId = blocks[0]?.blockId || "block_1";
  const normalizedBlocks = blocks.length ? blocks : [{ blockId: fallbackBlockId, label: text(card.answer) || "Resposta" }];
  let blankIndex = 0;
  const segments = (Array.isArray(card.segments) ? card.segments : []).map((segment) => {
    if (segment?.kind === "blank" || Array.isArray(segment?.acceptedBlockIds) || segment?.blankId) {
      blankIndex += 1;
      const accepted = Array.isArray(segment?.acceptedBlockIds)
        ? segment.acceptedBlockIds.map(text).filter(Boolean)
        : [fallbackBlockId];
      return {
        kind: "blank",
        blankId: text(segment?.blankId) || `blank_${blankIndex}`,
        acceptedBlockIds: accepted.length ? accepted : [fallbackBlockId]
      };
    }
    return {
      kind: "text",
      value: text(segment?.value ?? segment?.text ?? segment?.label)
    };
  });

  if (!segments.some((segment) => segment.kind === "blank")) {
    segments.push({
      kind: "blank",
      blankId: "blank_1",
      acceptedBlockIds: [fallbackBlockId]
    });
  }

  return {
    resourceType: "block_gap_fill",
    title: text(card.title) || "Lacunas",
    prompt: text(card.prompt ?? card.question ?? card.text) || "Complete a lacuna.",
    segments,
    blocks: normalizedBlocks,
    feedbackAfter: plainFeedbackText(card.feedbackAfter ?? card.feedback ?? card.after) || "Confira a relação entre a lacuna e o bloco correto."
  };
}

function repairCardByResource(card, fallbackResourceType) {
  const resourceType = text(card?.resourceType) || fallbackResourceType;
  if (resourceType === "multiple_choice") {
    return repairMultipleChoice(card);
  }
  if (resourceType === "tree") {
    return repairTree(card);
  }
  if (resourceType === "block_gap_fill") {
    return repairBlockGapFill(card);
  }
  if (resourceType === "paragraph") {
    return {
      resourceType: "paragraph",
      title: text(card.title) || "Ideia",
      text: text(card.text ?? card.say ?? card.prompt) || "Texto breve."
    };
  }
  if (resourceType === "code_editor") {
    return {
      resourceType: "code_editor",
      title: text(card.title) || "Código",
      prompt: text(card.prompt ?? card.text) || "Observe o trecho.",
      language: text(card.language) || "text",
      code: text(card.code) || "exemplo"
    };
  }
  if (resourceType === "table") {
    return {
      resourceType: "table",
      title: text(card.title) || "Tabela",
      columns: Array.isArray(card.columns) ? card.columns.map(text).filter(Boolean) : ["Item"],
      rows: (Array.isArray(card.rows) ? card.rows : []).map((row) => (Array.isArray(row) ? row.map(text) : [text(row)]))
    };
  }
  if (resourceType === "flowchart") {
    return {
      resourceType: "flowchart",
      title: text(card.title) || "Fluxograma",
      nodes: Array.isArray(card.nodes) ? card.nodes : [{ id: "start", label: "Início" }, { id: "end", label: "Fim" }],
      edges: Array.isArray(card.edges) ? card.edges : [{ from: "start", to: "end" }]
    };
  }
  return { ...card, resourceType };
}

function normalizeRepairedResponse(response, generationContract) {
  const cards = getCards(response);
  if (!cards) {
    return response;
  }
  const cardPlan = generationContract?.didacticPlan?.cardPlan || [];
  return {
    cards: cards.map((card, index) => {
      const planned = cardPlan[index] || {};
      const repaired = repairCardByResource(card || {}, text(card?.resourceType) || text(planned.resourceType));
      return {
        ...repaired,
        position: typeof planned.position === "number" ? planned.position : card?.position
      };
    })
  };
}

export async function validateOrRepairGeneratedCards({
  rawGeneratedResponse,
  generationContract,
  modelCapabilities = {},
  callModel,
  maxRepairAttempts = 1,
  throwRepairModelErrors = false
}) {
  const initialValidation = validateGeneratedCards(rawGeneratedResponse, generationContract);
  if (initialValidation.ok) {
    return {
      ok: true,
      cards: initialValidation.cards,
      repaired: false,
      repairAttempts: 0
    };
  }

  let lastErrors = compactErrors(initialValidation.errors);
  const attempts = Math.max(0, Number.isFinite(maxRepairAttempts) ? Math.floor(maxRepairAttempts) : 1);
  if (!attempts || typeof callModel !== "function") {
    return {
      ok: false,
      errors: lastErrors,
      repaired: false,
      repairAttempts: 0
    };
  }

  let lastResponse = rawGeneratedResponse;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let repairedResponse;
    try {
      repairedResponse = await callModel({
        systemInstruction: "Você repara JSON de cards do AraLearn. Responda apenas JSON válido e compacto.",
        prompt: buildGeneratedCardsRepairPrompt({
          invalidResponse: lastResponse,
          validationErrors: lastErrors,
          generationContract,
          modelCapabilities
        }),
        temperature: 0.05,
        maxOutputTokens: modelCapabilities?.profile === "compact-json" ? 4096 : 6144
      });
    } catch (error) {
      if (throwRepairModelErrors) {
        throw error;
      }
      return {
        ok: false,
        errors: [`Reparo de cards não devolveu JSON parseável: ${error instanceof Error ? error.message : "erro desconhecido"}`],
        repaired: true,
        repairAttempts: attempt
      };
    }

    const normalizedRepairedResponse = normalizeRepairedResponse(repairedResponse, generationContract);
    const repairedValidation = validateGeneratedCards(normalizedRepairedResponse, generationContract);
    if (repairedValidation.ok) {
      return {
        ok: true,
        cards: repairedValidation.cards,
        repaired: true,
        repairAttempts: attempt
      };
    }
    lastResponse = repairedResponse;
    lastErrors = compactErrors(repairedValidation.errors).map((error) => `Após reparo: ${error}`);
  }

  return {
    ok: false,
    errors: [...compactErrors(initialValidation.errors), ...lastErrors],
    repaired: true,
    repairAttempts: attempts
  };
}
