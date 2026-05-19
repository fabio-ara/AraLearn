import { buildScopedKey } from "../core/ids.js";
import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import { isSupportedResourceType } from "./resources.js";

function validateTableContent(content, path, errors) {
  if (!isPlainObject(content) || !Array.isArray(content.columns) || !Array.isArray(content.rows)) {
    pushError(errors, path, "Tabela inválida.");
  }
}

function validateCodeContent(content, path, errors) {
  if (!isPlainObject(content) || typeof content.code !== "string" || !content.code.trim()) {
    pushError(errors, path, "Bloco de código inválido.");
  }
}

function validateObjectContent(content, path, errors, label) {
  if (!isPlainObject(content)) {
    pushError(errors, path, `${label} inválido.`);
  }
}

function normalizeGeneratedTableContent(content) {
  if (!isPlainObject(content)) {
    return content;
  }
  const rawColumns = Array.isArray(content.columns)
    ? content.columns
    : Array.isArray(content.headers)
      ? content.headers
      : Array.isArray(content.head)
        ? content.head
        : [];
  const columns = rawColumns
    .map((entry) => (typeof entry === "string" ? entry.trim() : typeof entry?.label === "string" ? entry.label.trim() : ""))
    .filter(Boolean);
  const rawRows = Array.isArray(content.rows) ? content.rows : Array.isArray(content.data) ? content.data : [];
  const rows = rawRows
    .map((row) => {
      if (Array.isArray(row)) {
        return row.map((cell) => String(cell ?? "").trim());
      }
      if (isPlainObject(row)) {
        const keys = columns.length ? columns : Object.keys(row);
        return keys.map((key) => String(row[key] ?? "").trim());
      }
      return [];
    })
    .filter((row) => row.length);
  if (!columns.length || !rows.length) {
    return content;
  }
  return {
    ...content,
    columns,
    rows
  };
}

function serializeStructuredFlowAsText(content) {
  const steps = Array.isArray(content?.steps)
    ? content.steps
    : Array.isArray(content?.nodes)
      ? content.nodes
      : [];
  const lines = steps
    .map((step, index) => {
      if (typeof step === "string") {
        return step.trim();
      }
      const title = typeof step?.title === "string" ? step.title.trim() : "";
      const body = typeof step?.text === "string" ? step.text.trim() : "";
      const prefix = title || `Passo ${index + 1}`;
      return [prefix, body].filter(Boolean).join(": ");
    })
    .filter(Boolean);
  return [typeof content?.title === "string" ? content.title.trim() : "", ...lines].filter(Boolean).join("\n");
}

function replaceFirstGapPlaceholder(text, replacement) {
  return String(text || "").replace(/\[\s*_{3,}\s*\]/u, replacement);
}

function serializeStructuredGapFill(content) {
  const instruction = typeof content?.instruction === "string" ? content.instruction.trim() : "";
  const closing =
    typeof content?.closing === "string"
      ? content.closing.trim()
      : typeof content?.closingText === "string"
        ? content.closingText.trim()
        : "";
  const blocks = Array.isArray(content?.blocks)
    ? content.blocks
    : Array.isArray(content?.items)
      ? content.items
      : [];
  const renderedBlocks = blocks
    .map((block) => {
      const blockText = typeof block?.text === "string" ? block.text.trim() : "";
      const answers = Array.isArray(block?.answers)
        ? block.answers.map((item) => String(item || "").trim()).filter(Boolean)
        : typeof block?.answer === "string" && block.answer.trim()
          ? [block.answer.trim()]
          : [];
      if (!blockText) {
        return "";
      }
      if (!answers.length) {
        return blockText;
      }
      let rendered = blockText;
      answers.forEach((answer) => {
        rendered = replaceFirstGapPlaceholder(rendered, `[[${answer}::${answer}]]`);
      });
      return rendered;
    })
    .filter(Boolean);
  return [instruction, ...renderedBlocks, closing].filter(Boolean).join("\n\n");
}

function normalizeGeneratedCard(card = {}) {
  const normalized = structuredClone(card);
  const normalizedType = String(normalized?.resourceType || "").trim();
  if (String(normalized?.resourceType || "").trim() === "table") {
    normalized.content = normalizeGeneratedTableContent(normalized.content);
  }
  if (normalizedType === "flow") {
    if (
      isPlainObject(normalized.content)
      && (Array.isArray(normalized.content.steps) || Array.isArray(normalized.content.nodes))
    ) {
      normalized.resourceType = "say";
      normalized.content = serializeStructuredFlowAsText(normalized.content);
    }
  }
  if (normalizedType === "block_gap_fill") {
    if (
      isPlainObject(normalized.content)
      && (Array.isArray(normalized.content.blocks) || Array.isArray(normalized.content.items))
    ) {
      normalized.content = serializeStructuredGapFill(normalized.content);
    }
  }
  if (normalizedType === "say") {
    if (typeof normalized.content === "string" && !normalized.content.trim() && typeof normalized.title === "string" && normalized.title.trim()) {
      normalized.content = normalized.title.trim();
    }
    if (
      isPlainObject(normalized.content)
      && typeof normalized.content.text === "string"
      && !normalized.content.text.trim()
      && typeof normalized.title === "string"
      && normalized.title.trim()
    ) {
      normalized.content = normalized.title.trim();
    }
  }
  return normalized;
}

export function validateCard(card, path = "$.card") {
  const errors = [];
  if (!isPlainObject(card)) {
    return { ok: false, errors: [{ path, message: "Card deve ser um objeto." }] };
  }
  const normalizedCard = normalizeGeneratedCard(card);

  const resourceType = String(normalizedCard.resourceType || "").trim();
  if (!isSupportedResourceType(resourceType)) {
    pushError(errors, `${path}.resourceType`, `Tipo de recurso inválido: "${resourceType}".`);
  }

  if (!("content" in normalizedCard)) {
    pushError(errors, `${path}.content`, "Conteúdo do card é obrigatório.");
  }

  if (resourceType === "say" || resourceType === "block_gap_fill") {
    const isValid =
      typeof normalizedCard.content === "string"
      || (isPlainObject(normalizedCard.content) && typeof normalizedCard.content.text === "string");
    if (!isValid) {
      pushError(errors, `${path}.content`, "Texto do card inválido.");
    }
  } else if (resourceType === "table") {
    validateTableContent(normalizedCard.content, `${path}.content`, errors);
  } else if (resourceType === "code") {
    validateCodeContent(normalizedCard.content, `${path}.content`, errors);
  } else if (resourceType === "flow") {
    if (!Array.isArray(normalizedCard.content) && !(isPlainObject(normalizedCard.content) && Array.isArray(normalizedCard.content.flow))) {
      pushError(errors, `${path}.content`, "Fluxograma inválido.");
    }
  } else if (resourceType === "tree") {
    validateObjectContent(normalizedCard.content, `${path}.content`, errors, "Árvore");
  } else if (resourceType === "graph") {
    validateObjectContent(normalizedCard.content, `${path}.content`, errors, "Grafo");
  }

  return finalizeValidation(errors, {
    key:
      typeof normalizedCard.key === "string" && normalizedCard.key.trim()
        ? normalizedCard.key.trim()
        : buildScopedKey("card", normalizedCard.title || resourceType || "item"),
    title: typeof normalizedCard.title === "string" ? normalizedCard.title.trim() : "",
    resourceType,
    content: structuredClone(normalizedCard.content),
    after: typeof normalizedCard.after === "string" ? normalizedCard.after.trim() : ""
  });
}

export function toLegacyContractCard(card) {
  const base = {
    key: card.key,
    ...(card.title ? { title: card.title } : {}),
    ...(card.after ? { after: card.after } : {})
  };

  if (card.resourceType === "say") {
    return {
      ...base,
      say: typeof card.content === "string" ? card.content : String(card.content?.text || "")
    };
  }

  if (card.resourceType === "block_gap_fill") {
    return {
      ...base,
      say: typeof card.content === "string" ? card.content : String(card.content?.text || "")
    };
  }

  if (card.resourceType === "code") {
    return {
      ...base,
      ...(card.content?.intro ? { say: String(card.content.intro) } : {}),
      code: String(card.content?.code || ""),
      ...(card.content?.language ? { language: String(card.content.language) } : {})
    };
  }

  if (card.resourceType === "table") {
    return {
      ...base,
      ...(card.content?.intro ? { say: String(card.content.intro) } : {}),
      table: {
        ...(card.content?.title ? { title: String(card.content.title) } : {}),
        columns: Array.isArray(card.content?.columns) ? card.content.columns.map((item) => String(item)) : [],
        rows: Array.isArray(card.content?.rows) ? card.content.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell)) : [])) : []
      }
    };
  }

  if (card.resourceType === "flow") {
    const flow = Array.isArray(card.content) ? card.content : card.content?.flow;
    return {
      ...base,
      ...(card.content?.intro ? { say: String(card.content.intro) } : {}),
      flow: Array.isArray(flow) ? flow : []
    };
  }

  if (card.resourceType === "tree") {
    return {
      ...base,
      ...(card.content?.intro ? { say: String(card.content.intro) } : {}),
      tree: structuredClone(card.content)
    };
  }

  if (card.resourceType === "graph") {
    return {
      ...base,
      ...(card.content?.intro ? { say: String(card.content.intro) } : {}),
      graph: structuredClone(card.content)
    };
  }

  return {
    ...base,
    say: typeof card.content === "string" ? card.content : JSON.stringify(card.content, null, 2)
  };
}
