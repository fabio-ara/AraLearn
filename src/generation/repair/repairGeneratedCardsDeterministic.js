import { getChoiceOptionComparableValue, normalizeChoiceOption, parseChoiceOptionString } from "../../core/choiceOptions.js";
import { buildTextGapToken, parseTextGapTokens } from "../../core/textGaps.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value = "") {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function questionRevealsChoiceAnswer(question = "", answerText = "") {
  const normalizedQuestion = normalizeComparableText(question);
  const normalizedAnswer = normalizeComparableText(answerText);
  if (!normalizedQuestion || !normalizedAnswer) {
    return false;
  }
  if (normalizedQuestion.includes(normalizedAnswer)) {
    return true;
  }
  const answerTokens = normalizedAnswer.split(" ").filter(Boolean);
  if (answerTokens.length >= 2 && answerTokens.every((token) => normalizedQuestion.includes(token))) {
    return true;
  }
  if (answerTokens.length < 3) {
    return false;
  }
  const matchingTokenCount = answerTokens.filter((token) => normalizedQuestion.includes(token)).length;
  return matchingTokenCount / answerTokens.length >= 0.75;
}

function codeLines(value = "") {
  return String(value || "").replace(/\r\n/g, "\n").split("\n");
}

function countIndent(line = "") {
  const match = String(line || "").match(/^[ \t]*/);
  return match ? match[0].length : 0;
}

function isCodeBlockStarter(line = "", language = "") {
  const trimmed = text(line);
  if (!trimmed) {
    return false;
  }
  if (/[{[]\s*$/.test(trimmed)) {
    return true;
  }
  if (/:$/.test(trimmed)) {
    return true;
  }
  const normalizedLanguage = text(language).toLowerCase();
  if (normalizedLanguage === "python" && /(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b.*:\s*$/.test(trimmed)) {
    return true;
  }
  return false;
}

function looksLikeUnindentedStructuredCode(value = "", language = "") {
  const lines = codeLines(value).filter((line) => text(line));
  if (lines.length < 2) {
    return false;
  }
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isCodeBlockStarter(lines[index], language)) {
      continue;
    }
    const currentIndent = countIndent(lines[index]);
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (!text(nextLine)) {
        continue;
      }
      const trimmedNext = text(nextLine);
      if (trimmedNext.startsWith("}") || /^(elif|else|except|finally)\b/.test(trimmedNext)) {
        break;
      }
      return countIndent(nextLine) <= currentIndent;
    }
  }
  return false;
}

function autoIndentBraceCode(lines = []) {
  let depth = 0;
  return lines.map((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      return "";
    }
    if (/^[}\])]/.test(trimmed)) {
      depth = Math.max(0, depth - 1);
    }
    const output = `${"  ".repeat(depth)}${trimmed}`;
    if (/[{[]\s*$/.test(trimmed)) {
      depth += 1;
    }
    return output;
  }).join("\n");
}

function autoIndentColonCode(lines = []) {
  const result = [];
  let depth = 0;
  lines.forEach((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      result.push("");
      return;
    }
    if (/^(elif|else|except|finally)\b/.test(trimmed)) {
      depth = Math.max(0, depth - 1);
    }
    result.push(`${"  ".repeat(depth)}${trimmed}`);
    if (/:$/.test(trimmed)) {
      depth += 1;
    }
  });
  return result.join("\n");
}

function normalizeCodeIndentation(value = "", language = "") {
  const raw = String(value || "");
  if (!looksLikeUnindentedStructuredCode(raw, language)) {
    return raw;
  }
  const lines = codeLines(raw);
  if (lines.some((line) => /[{}]/.test(line))) {
    return autoIndentBraceCode(lines);
  }
  if (lines.some((line) => /:\s*$/.test(String(line || "").trim()))) {
    return autoIndentColonCode(lines);
  }
  return raw;
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

function normalizeResponseShape(parsed) {
  if (Array.isArray(parsed)) {
    return { cards: parsed };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.cards)) {
    return parsed;
  }
  return { cards: [] };
}

function unique(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => text(item)).filter(Boolean))];
}

function cardHasFactualDensity(card = {}) {
  return [card.text, card.prompt, card.question, card.after]
    .map(text)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length >= 8;
}

function normalizeGapText(value = "") {
  const source = String(value || "");
  const tokens = parseTextGapTokens(source);
  if (!tokens.length) {
    return source;
  }
  let normalized = "";
  let cursor = 0;
  tokens.forEach((token) => {
    normalized += source.slice(cursor, token.start);
    const rawTokenSource = text(token.source);
    if (!rawTokenSource) {
      normalized += token.raw;
      cursor = token.end;
      return;
    }
    const rawOptionList = token.hasOptions ? token.options : rawTokenSource.split("|");
    const options = rawOptionList
      .map((item) => summarizeGapOption(item))
      .filter(Boolean)
      .filter((item, index, array) => array.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index);
    if (options.length < 2) {
      normalized += token.raw;
      cursor = token.end;
      return;
    }
    const answerSource = token.hasOptions ? token.answer : rawTokenSource.split("|")[0] || "";
    const answer = summarizeGapOption(answerSource) || options[0];
    normalized += buildTextGapToken(answer, options);
    cursor = token.end;
  });
  normalized += source.slice(cursor);
  return normalized;
}

function summarizeGapOption(value = "") {
  const tokens = text(value)
    .replace(/[()[\]{}"“”.,;:!?/\\+-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) {
    return "";
  }
  const leadingNoise = new Set(["o", "a", "os", "as", "um", "uma", "uns", "umas", "ele", "ela", "eles", "elas"]);
  const connectorTokens = new Set(["de", "da", "do", "das", "dos"]);
  const content = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!content.length && leadingNoise.has(lower)) {
      continue;
    }
    if (connectorTokens.has(lower) && (!content.length || content.length >= 3)) {
      continue;
    }
    content.push(token);
    if (content.filter((item) => !connectorTokens.has(item.toLowerCase())).length >= 3) {
      break;
    }
  }
  const summary = content.join(" ").trim();
  return text(summary) || text(tokens.slice(0, 3).join(" "));
}

function buildGapTextFromChoiceCard(card = {}) {
  const options = Array.isArray(card?.options) ? card.options : [];
  const answerId = text(card?.answer);
  const correctOption = options.find((option) => text(option?.id) === answerId) || null;
  const correctSummary = summarizeGapOption(getChoiceOptionComparableValue(correctOption));
  if (!correctSummary) {
    return text(card?.text);
  }
  const wrongSummaries = options
    .filter((option) => text(option?.id) !== answerId)
    .map((option) => summarizeGapOption(getChoiceOptionComparableValue(option)))
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 3);
  if (!wrongSummaries.length) {
    return text(card?.text);
  }
  return `Complete com a ideia correta: ${buildTextGapToken(correctSummary, [correctSummary, ...wrongSummaries])}.`;
}

function buildGapCodeFromChoiceCard(card = {}) {
  const source = String(card?.code || "").replace(/\r\n/g, "\n");
  if (!source || !source.includes("___")) {
    return source;
  }
  const options = Array.isArray(card?.options) ? card.options : [];
  const answerId = text(card?.answer);
  const correctOption = options.find((option) => text(option?.id) === answerId) || null;
  const correctValue = String(getChoiceOptionComparableValue(correctOption) || "").replace(/\r\n/g, "\n").trim();
  const wrongValues = options
    .filter((option) => text(option?.id) !== answerId)
    .map((option) => String(getChoiceOptionComparableValue(option) || "").replace(/\r\n/g, "\n").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 3);
  if (!correctValue || !wrongValues.length) {
    return source;
  }
  const gapToken = buildTextGapToken(correctValue, [correctValue, ...wrongValues]);
  return source.replace(/_{3,}/u, gapToken);
}

function allowedFields(resource = "") {
  const common = [
    "id", "position", "resource", "kind", "exercise", "title", "after", "afterBlocks", "sources", "topics",
    "languageTag", "textDirection"
  ];
  const byResource = {
    paragraph: [...common, "text"],
    choice: [...common, "question", "options", "answer"],
    composite: [...common, "blocks"],
    code: [...common, "prompt", "language", "code", "question", "options", "answer"],
    table: [...common, "columns", "rows", "question", "options", "answer"],
    flow: [...common, "prompt", "structure", "question", "options", "answer"],
    tree: [...common, "prompt", "nodes", "question", "options", "answer"],
    graph: [...common, "prompt", "vertices", "edges", "highlight", "nodes", "links", "question", "options", "answer"],
    relation_map: [...common, "prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable", "highlight", "question", "options", "answer", "left", "right", "pairs"],
    matrix: [...common, "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence", "question", "options", "answer"],
    plane: [...common, "prompt", "x", "y", "vector", "vectors", "sum", "scale", "distance", "result", "question", "options", "answer"],
    formula: [...common, "prompt", "notation", "accessibleText", "expression", "question", "options", "answer"]
  };
  return new Set(byResource[resource] || common);
}

function normalizeChoice(card) {
  const options = (Array.isArray(card.options) ? card.options : []).map((option, index) => {
    if (typeof option === "string") {
      return parseChoiceOptionString(option, String.fromCharCode(97 + index));
    }
    return normalizeChoiceOption({
      ...option,
      id: text(option?.id) || text(option?.value) || String.fromCharCode(97 + index)
    }, index);
  });
  const rawAnswer = card?.answer;
  let answer = text(rawAnswer);
  if (!answer && Number.isInteger(rawAnswer)) {
    const zeroBased = options[rawAnswer];
    const oneBased = options[rawAnswer - 1];
    answer = zeroBased?.id || oneBased?.id || "";
  }
  if (!answer && /^-?\d+$/.test(text(rawAnswer))) {
    const numericAnswer = Number(rawAnswer);
    const zeroBased = options[numericAnswer];
    const oneBased = options[numericAnswer - 1];
    answer = zeroBased?.id || oneBased?.id || "";
  }
  if (answer && !options.some((option) => option.id === answer)) {
    const normalizedAnswer = answer.toLowerCase();
    const matchedOption = options.find((option, index) => getChoiceOptionComparableValue(option, index).toLowerCase() === normalizedAnswer);
    answer = matchedOption?.id || answer;
  }
  answer = answer || options[0]?.id || "";
  const correctOption = options.find((option) => option.id === answer) || null;
  let question = text(card?.question);
  if (
    question
    && correctOption
    && questionRevealsChoiceAnswer(question, getChoiceOptionComparableValue(correctOption))
  ) {
    question = text(card?.resource) === "choice"
      ? "Qual opção está correta?"
      : "Qual opção corresponde corretamente ao caso mostrado?";
  }
  return {
    ...card,
    question,
    options,
    answer
  };
}

function normalizeGraph(card) {
  const baseCard = { ...(card || {}) };
  delete baseCard.nodes;
  delete baseCard.links;
  const rawVertices = Array.isArray(card?.vertices)
    ? card.vertices
    : Array.isArray(card?.nodes)
      ? card.nodes
      : [];
  const vertices = rawVertices.map((vertex, index) => {
    if (typeof vertex === "string") {
      return {
        id: text(vertex) || `V${index + 1}`,
        label: text(vertex) || `V${index + 1}`
      };
    }
    return {
      id: text(vertex?.id) || text(vertex?.label) || text(vertex?.name) || `V${index + 1}`,
      label: text(vertex?.label) || text(vertex?.name) || text(vertex?.id) || `V${index + 1}`
    };
  });
  const edges = (Array.isArray(card?.edges) ? card.edges : Array.isArray(card?.links) ? card.links : []).map((edge) => {
    if (typeof edge === "string") {
      const [from = "", to = ""] = edge.split("-").map((item) => text(item));
      return { from, to, label: "", weight: "" };
    }
    if (Array.isArray(edge)) {
      return {
        from: text(edge[0]),
        to: text(edge[1]),
        label: "",
        weight: ""
      };
    }
    return {
      from: text(edge?.from) || text(edge?.source),
      to: text(edge?.to) || text(edge?.target),
      label: text(edge?.label),
      weight: text(edge?.weight)
    };
  });
  return {
    ...baseCard,
    vertices,
    edges,
    highlight:
      card?.highlight && typeof card.highlight === "object"
        ? card.highlight
        : { vertices: [], edges: [] }
  };
}

function normalizeRelationSet(rawSet, fallbackLabel, sidePrefix) {
  const items = (Array.isArray(rawSet?.items) ? rawSet.items : Array.isArray(rawSet) ? rawSet : [])
    .map((item, index) => {
      if (typeof item === "string") {
        const label = text(item) || `${sidePrefix}${index + 1}`;
        return { id: `${sidePrefix}${index + 1}`, label };
      }
      const id = text(item?.id) || `${sidePrefix}${index + 1}`;
      const label = text(item?.label) || text(item?.name) || id;
      return { id, label };
    });
  return {
    label: text(rawSet?.label) || fallbackLabel,
    items
  };
}

function normalizeRelationMap(card) {
  const baseCard = { ...(card || {}) };
  delete baseCard.left;
  delete baseCard.right;
  delete baseCard.pairs;
  const leftSet = normalizeRelationSet(card?.leftSet || card?.left, "U", "u");
  const rightSet = normalizeRelationSet(card?.rightSet || card?.right, "V", "v");
  const leftLabels = new Map(leftSet.items.map((item) => [normalizeComparableText(item.label), item.id]));
  const rightLabels = new Map(rightSet.items.map((item) => [normalizeComparableText(item.label), item.id]));
  const rawRelations = Array.isArray(card?.relations)
    ? card.relations
    : Array.isArray(card?.pairs)
      ? card.pairs
      : [];
  const relations = rawRelations.map((relation) => {
    if (Array.isArray(relation)) {
      const fromValue = text(relation[0]);
      const toValue = text(relation[1]);
      return {
        from: leftLabels.get(normalizeComparableText(fromValue)) || fromValue,
        to: rightLabels.get(normalizeComparableText(toValue)) || toValue
      };
    }
    const fromValue = text(relation?.from) || text(relation?.source) || text(relation?.left);
    const toValue = text(relation?.to) || text(relation?.target) || text(relation?.right);
    return {
      from: leftLabels.get(normalizeComparableText(fromValue)) || fromValue,
      to: rightLabels.get(normalizeComparableText(toValue)) || toValue,
      label: text(relation?.label)
    };
  });
  return {
    ...baseCard,
    leftSet,
    rightSet,
    relations,
    pairList: Array.isArray(card?.pairList) ? card.pairList.map((item) => text(item)).filter(Boolean) : [],
    relationTable:
      card?.relationTable && typeof card.relationTable === "object"
        ? {
            columns: Array.isArray(card.relationTable.columns) ? card.relationTable.columns.map((item) => text(item)).filter(Boolean) : [],
            rows: Array.isArray(card.relationTable.rows)
              ? card.relationTable.rows.map((row) => (Array.isArray(row) ? row.map((item) => text(item)) : [])).filter((row) => row.length)
              : []
          }
        : undefined,
    highlight:
      card?.highlight && typeof card.highlight === "object"
        ? card.highlight
        : { leftItems: [], rightItems: [], relations: [] }
  };
}

function parseFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCoordinatePairValue(value) {
  if (Array.isArray(value) && value.length === 2) {
    const pair = value.map((item) => parseFiniteNumber(item));
    return pair.every((item) => item !== null) ? pair : null;
  }
  if (value && typeof value === "object") {
    const x = parseFiniteNumber(value.x ?? value[0]);
    const y = parseFiniteNumber(value.y ?? value[1]);
    return x !== null && y !== null ? [x, y] : null;
  }
  if (typeof value === "string") {
    const matches = value.match(/-?\d+(?:[.,]\d+)?/g);
    if (matches?.length === 2) {
      const pair = matches.map((item) => parseFiniteNumber(item));
      return pair.every((item) => item !== null) ? pair : null;
    }
  }
  return null;
}

function normalizeCoordinatePairList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeCoordinatePairValue(item))
    .filter(Boolean);
}

function normalizePlane(card) {
  const normalized = { ...card };
  const vector = normalizeCoordinatePairValue(card?.vector);
  const x = normalizeCoordinatePairValue(card?.x);
  const y = normalizeCoordinatePairValue(card?.y);
  const result = Array.isArray(card?.result) ? normalizeCoordinatePairValue(card.result) : card?.result;
  const vectors = normalizeCoordinatePairList(card?.vectors);
  const sum = normalizeCoordinatePairList(card?.sum);
  const distance = normalizeCoordinatePairList(card?.distance);
  const scaleVector = normalizeCoordinatePairValue(card?.scale?.vector);

  if (vector) {
    normalized.vector = vector;
  } else {
    delete normalized.vector;
  }
  if (x) {
    normalized.x = x;
  } else {
    delete normalized.x;
  }
  if (y) {
    normalized.y = y;
  } else {
    delete normalized.y;
  }
  if (vectors.length) {
    normalized.vectors = vectors;
  } else {
    delete normalized.vectors;
  }
  if (sum.length) {
    normalized.sum = sum;
  } else {
    delete normalized.sum;
  }
  if (distance.length) {
    normalized.distance = distance;
  } else {
    delete normalized.distance;
  }
  if (scaleVector) {
    normalized.scale = {
      ...normalized.scale,
      ...(parseFiniteNumber(normalized?.scale?.k) !== null ? { k: parseFiniteNumber(normalized.scale.k) } : {}),
      vector: scaleVector
    };
  } else {
    delete normalized.scale;
  }
  if (Array.isArray(card?.result)) {
    if (result) {
      normalized.result = result;
    } else {
      delete normalized.result;
    }
  }

  if (normalized.vector) {
    if (!normalized.x) {
      delete normalized.x;
    }
    if (!normalized.y) {
      delete normalized.y;
    }
  }

  return normalized;
}

function stripChoiceFieldsFromTheory(card) {
  if (text(card?.kind) !== "theory") {
    return card;
  }
  const next = { ...card };
  delete next.question;
  delete next.options;
  delete next.answer;
  return next;
}

function normalizeParagraphGap(card) {
  if (text(card?.resource) !== "paragraph" || text(card?.kind) !== "exercise" || text(card?.exercise) !== "gap") {
    return card;
  }
  const fallbackText = text(card?.text);
  const nextText = normalizeGapText(fallbackText);
  const normalized = {
    ...card,
    text: nextText.includes("[[") ? nextText : buildGapTextFromChoiceCard(card)
  };
  delete normalized.question;
  delete normalized.options;
  delete normalized.answer;
  return {
    ...normalized,
    text: normalizeGapText(normalized.text)
  };
}

function normalizeCodeGap(card) {
  if (text(card?.resource) !== "code" || text(card?.kind) !== "exercise" || text(card?.exercise) !== "gap") {
    return card;
  }
  const rawCode = String(card?.code || "").replace(/\r\n/g, "\n");
  const normalized = {
    ...card,
    code: rawCode.includes("[[") ? rawCode : buildGapCodeFromChoiceCard(card)
  };
  delete normalized.question;
  delete normalized.options;
  delete normalized.answer;
  return normalized;
}

export function repairGeneratedCardsDeterministic(rawGeneratedResponse, generationContract = {}) {
  const parsed = normalizeResponseShape(parseJsonIfNeeded(rawGeneratedResponse));
  const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
  const plan = Array.isArray(generationContract?.plan) ? generationContract.plan : [];
  const plannedByPosition = new Map(plan.map((item) => [Number(item.position), item]));
  const availableSourceIds = unique((Array.isArray(generationContract?.sources) ? generationContract.sources : []).map((item) => text(item?.id || item)));

  return {
    cards: cards
      .map((card, index) => {
        const position = Number(card?.position) || Number(plan[index]?.position) || index + 1;
        const planned = plannedByPosition.get(position) || plan[index] || {};
        const resource = text(card?.resource) || text(planned.resource) || "paragraph";
        const next = Object.fromEntries(
          Object.entries(card || {}).filter(([fieldName]) => allowedFields(resource).has(fieldName))
        );
        let normalized = {
          ...next,
          position,
          resource,
          kind: text(next.kind) || text(planned.kind) || "theory",
          exercise: text(next.exercise) || text(planned.exercise) || "none",
          title: text(next.title) || `Card ${position}`,
          after: text(next.after),
          afterBlocks: Array.isArray(next.afterBlocks) ? next.afterBlocks : undefined,
          sources: unique(next.sources)
        };
        if (resource === "paragraph" && text(normalized.exercise) === "gap") {
          normalized = normalizeParagraphGap({
            ...normalized,
            text: text(normalized.text) || text(card?.text),
            question: card?.question,
            options: card?.options,
            answer: card?.answer
          });
        }
        if (resource === "code") {
          normalized = {
            ...normalized,
            code: normalizeCodeIndentation(normalized.code, normalized.language)
          };
          if (text(normalized.exercise) === "gap") {
            normalized = normalizeCodeGap({
              ...normalized,
              options: card?.options,
              answer: card?.answer,
              question: card?.question
            });
          }
        }
        if (resource === "graph") {
          normalized = normalizeGraph(normalized);
        }
        if (resource === "relation_map") {
          normalized = normalizeRelationMap(normalized);
        }
        if (resource === "plane") {
          normalized = normalizePlane(normalized);
        }
        if (text(normalized.exercise) === "choice") {
          normalized = normalizeChoice(normalized);
        }
        if (!normalized.sources.length && availableSourceIds.length && cardHasFactualDensity(normalized)) {
          normalized = {
            ...normalized,
            sources: availableSourceIds
          };
        }
        return stripChoiceFieldsFromTheory(normalized);
      })
      .sort((left, right) => Number(left.position) - Number(right.position))
  };
}
