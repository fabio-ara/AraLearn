import { getChoiceOptionComparableValue, normalizeChoiceOption } from "../../core/choiceOptions.js";
import { parseTextGapTokens } from "../../core/textGaps.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLooseLabel(value = "") {
  return text(value)
    .replace(/^\d+\s*[.)-]?\s*/u, "")
    .replace(/[.,;:!?()"]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function looseLabelMatches(left = "", right = "") {
  const normalizedLeft = normalizeLooseLabel(left);
  const normalizedRight = normalizeLooseLabel(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

export function normalizeQuotedTextValue(value = "") {
  const source = text(value);
  if (source.length < 2) {
    return source;
  }
  const first = source[0];
  const last = source[source.length - 1];
  if (!((first === "\"" && last === "\"") || (first === "'" && last === "'"))) {
    return source;
  }
  const inner = source.slice(1, -1);
  if (!inner) {
    return "";
  }
  if (first === "\"") {
    return inner.replace(/\\"/gu, "\"");
  }
  return inner.replace(/\\'/gu, "'");
}

const BLOCKED_STRUCTURAL_PATTERNS = [
  { pattern: /\bCARD\s+\d+\b/iu, reason: "marcador estrutural CARD n" },
  { pattern: /\bAUDIT\b/iu, reason: "marcador estrutural AUDIT" },
  { pattern: /\bPATCH\s+MICROSEQUENCE\b/iu, reason: "marcador estrutural PATCH MICROSEQUENCE" },
  { pattern: /\bSTATUS\s+OK\b/iu, reason: "marcador estrutural STATUS OK" },
  { pattern: /^\s*\d+\s*:/mu, reason: "linha estrutural de slot numérico" },
  { pattern: /```json/iu, reason: "bloco json" },
  { pattern: /\bJSON\b/iu, reason: "termo de bastidor JSON" },
  { pattern: /\bprompt\b/iu, reason: "termo de bastidor prompt" },
  { pattern: /\bschema\b/iu, reason: "termo de bastidor schema" },
  { pattern: /\bpipeline\b/iu, reason: "termo de bastidor pipeline" },
  { pattern: /\bcontainer\b/iu, reason: "termo de bastidor container" },
  { pattern: /\bLLM\b/iu, reason: "termo de bastidor LLM" },
  { pattern: /\bvalidador\b/iu, reason: "termo de bastidor validador" }
];

const BLOCKED_ARTIFICIAL_PATTERNS = [
  { pattern: /\bteoria curta\b/iu, reason: "expressão artificial teoria curta" },
  { pattern: /\bexplicacao curta\b/iu, reason: "expressão artificial explicação curta" },
  { pattern: /\bexplicação curta\b/iu, reason: "expressão artificial explicação curta" },
  { pattern: /\bleitura curta\b/iu, reason: "expressão artificial leitura curta" },
  { pattern: /^\s*a leitura\b/iu, reason: "início artificial com a leitura" },
  { pattern: /\beste card\b/iu, reason: "expressão artificial este card" },
  { pattern: /\bneste flashcard\b/iu, reason: "expressão artificial neste flashcard" },
  { pattern: /\bo usuário deve\b/iu, reason: "expressão artificial o usuário deve" },
  { pattern: /\bconforme solicitado\b/iu, reason: "expressão artificial conforme solicitado" }
];

const BLOCKED_PLACEHOLDERS = [
  "Alternativa A",
  "Alternativa B",
  "Alternativa C",
  "erro 1",
  "erro 2",
  "Revise a regra principal",
  "Pratique o ponto central",
  "Opção correta para este caso",
  "Texto gerado automaticamente"
];

function collectStrings(value, bucket = []) {
  if (typeof value === "string") {
    bucket.push(value);
    return bucket;
  }
  if (!value || typeof value !== "object") {
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, bucket));
    return bucket;
  }
  Object.values(value).forEach((item) => collectStrings(item, bucket));
  return bucket;
}

function getCompositeChoiceBlock(card = {}) {
  if (text(card?.resource) !== "composite") {
    return null;
  }
  return (Array.isArray(card?.blocks) ? card.blocks : []).find((block) => text(block?.kind) === "choice") || null;
}

export function findStructuralLeak(value = "") {
  const source = normalizeQuotedTextValue(value);
  if (!source) {
    return null;
  }
  const placeholder = BLOCKED_PLACEHOLDERS.find((item) => source.toLowerCase().includes(item.toLowerCase()));
  if (placeholder) {
    return {
      reason: `placeholder proibido: ${placeholder}`,
      kind: "placeholder"
    };
  }
  const structural = BLOCKED_STRUCTURAL_PATTERNS.find((item) => item.pattern.test(source));
  if (structural) {
    return {
      reason: structural.reason,
      kind: "structural"
    };
  }
  const artificial = BLOCKED_ARTIFICIAL_PATTERNS.find((item) => item.pattern.test(source));
  if (artificial) {
    return {
      reason: artificial.reason,
      kind: "artificial"
    };
  }
  return null;
}

export function validateTextSlotContent(value = "") {
  const leak = findStructuralLeak(value);
  if (leak) {
    return `conteúdo proibido no slot: ${leak.reason}`;
  }
  return true;
}

function validateOptionTexts(card = {}) {
  if (!Array.isArray(card?.options)) {
    return [];
  }
  const optionTexts = card.options.map((option, index) => getChoiceOptionComparableValue(normalizeChoiceOption(option, index), index));
  const errors = [];
  optionTexts.forEach((optionText, index) => {
    if (!optionText) {
      errors.push(`opção ${index + 1} vazia`);
    }
  });
  const duplicates = optionTexts.filter((optionText, index) => optionText && optionTexts.indexOf(optionText) !== index);
  if (duplicates.length) {
    errors.push("opções repetidas");
  }
  return errors;
}

function normalizeGraphToken(value = "") {
  return text(value).replace(/^[(\[]|[)\]]$/g, "").trim();
}

function normalizeRelationToken(value = "") {
  return text(value).replace(/^[{[(]+|[})\]]+$/gu, "").trim();
}

function parsePositiveInteger(value = "", label = "índice") {
  const normalized = text(value);
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${label} precisa ser inteiro positivo`);
  }
  const numeric = Number(normalized);
  if (numeric < 1) {
    throw new Error(`${label} precisa começar em 1`);
  }
  return numeric;
}

export function validateMatrixLocateCellChoice(card = {}, slotPacket = {}) {
  const rows = Array.isArray(card?.values) ? card.values : [];
  if (!rows.length || !rows[0]?.length) {
    throw new Error("matriz sem valores compilados");
  }
  const optionErrors = validateOptionTexts(card);
  if (optionErrors.length) {
    throw new Error(optionErrors.join("; "));
  }
  const targetRow = parsePositiveInteger(slotPacket?.slots?.["6"], "targetRow");
  const targetCol = parsePositiveInteger(slotPacket?.slots?.["7"], "targetCol");
  if (targetRow > rows.length) {
    throw new Error("targetRow fora dos limites da matriz");
  }
  if (targetCol > rows[0].length) {
    throw new Error("targetCol fora dos limites da matriz");
  }
  const correctValue = text(rows[targetRow - 1][targetCol - 1]);
  const matchingOptions = (Array.isArray(card?.options) ? card.options : []).filter((option, index) =>
    text(getChoiceOptionComparableValue(option, index)) === correctValue
  );
  if (!matchingOptions.length) {
    throw new Error("nenhuma opção corresponde ao valor correto da célula alvo");
  }
  if (matchingOptions.length > 1) {
    throw new Error("mais de uma opção corresponde ao valor correto da célula alvo");
  }
  const expectedAnswer = text(matchingOptions[0]?.id).toLowerCase();
  const providedAnswer = text(card?.answer).toLowerCase();
  if (providedAnswer && providedAnswer !== expectedAnswer) {
    throw new Error(`answer inconsistente com a célula alvo; esperado ${expectedAnswer}`);
  }
  return {
    computedAnswer: expectedAnswer,
    correctValue,
    targetRow,
    targetCol
  };
}

export function validateGraphCard(card = {}) {
  const vertexIds = new Set((Array.isArray(card?.vertices) ? card.vertices : []).map((vertex) => text(vertex?.id)));
  if (!vertexIds.size) {
    throw new Error("grafo sem vértices");
  }
  (Array.isArray(card?.edges) ? card.edges : []).forEach((edge) => {
    if (!vertexIds.has(text(edge?.from)) || !vertexIds.has(text(edge?.to))) {
      throw new Error("aresta aponta para vértice inexistente");
    }
  });
  return true;
}

export function parseGraphPathOption(value = "") {
  const source = text(value);
  if (!source) {
    return [];
  }
  const normalized = source
    .replace(/\s*->\s*/gu, ">")
    .replace(/\s*-\s*/gu, "-")
    .replace(/\s*,\s*/gu, ",");
  const separator = normalized.includes(">") ? ">" : normalized.includes("-") ? "-" : normalized.includes(",") ? "," : null;
  if (!separator) {
    return [normalizeGraphToken(normalized)].filter(Boolean);
  }
  return normalized.split(separator).map((item) => normalizeGraphToken(item)).filter(Boolean);
}

export function inferGraphPathTask(card = {}) {
  const source = `${text(card?.question)} ${text(card?.prompt)}`;
  const patterns = [
    /\bde\s+([A-Za-z0-9_]+)\s+ate\s+([A-Za-z0-9_]+)\b/iu,
    /\bde\s+([A-Za-z0-9_]+)\s+até\s+([A-Za-z0-9_]+)\b/iu,
    /\bde\s+([A-Za-z0-9_]+)\s+para\s+([A-Za-z0-9_]+)\b/iu,
    /\bentre\s+([A-Za-z0-9_]+)\s+e\s+([A-Za-z0-9_]+)\b/iu
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return {
        from: normalizeGraphToken(match[1]),
        to: normalizeGraphToken(match[2])
      };
    }
  }
  return null;
}

export function isValidGraphPath({ path = [], vertices = [], edges = [], task = null } = {}) {
  if (!Array.isArray(path) || path.length < 2) {
    return false;
  }
  const vertexSet = new Set((Array.isArray(vertices) ? vertices : []).map((item) => text(item?.id || item)));
  if (path.some((vertex) => !vertexSet.has(text(vertex)))) {
    return false;
  }
  const seen = new Set();
  for (const vertex of path) {
    const normalized = text(vertex);
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
  }
  const edgeSet = new Set((Array.isArray(edges) ? edges : []).flatMap((edge) => {
    const from = text(edge?.from);
    const to = text(edge?.to);
    return from && to ? [`${from}>${to}`, `${to}>${from}`] : [];
  }));
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = text(path[index]);
    const to = text(path[index + 1]);
    if (!edgeSet.has(`${from}>${to}`)) {
      return false;
    }
  }
  if (task?.from && text(path[0]) !== text(task.from)) {
    return false;
  }
  if (task?.to && text(path[path.length - 1]) !== text(task.to)) {
    return false;
  }
  return true;
}

export function validateChoiceFeedbackConsistency(card = {}, { computedAnswer = "" } = {}) {
  const after = text(card?.after);
  if (!after || !computedAnswer) {
    return true;
  }
  const normalizedAnswer = text(computedAnswer).toLowerCase();
  const optionMentions = [
    ...after.matchAll(/\b(?:opcao|opção|alternativa)\s+([abc])\b/giu)
  ].map((match) => String(match[1] || "").toLowerCase());
  const contradictoryPatterns = [
    /\btambem\s+e\s+valida\b/iu,
    /\btambém\s+é\s+válida\b/iu,
    /\btambem\s+esta\s+correta\b/iu,
    /\btambém\s+está\s+correta\b/iu,
    /\btambem\s+seria\s+valida\b/iu,
    /\btambém\s+seria\s+válida\b/iu
  ];
  if (optionMentions.some((optionId) => optionId !== normalizedAnswer) && contradictoryPatterns.some((pattern) => pattern.test(after))) {
    throw new Error("feedback contraditório: afirma que opção diferente da correta também é válida");
  }
  if (/\bas\s+duas\s+(?:opcoes|opções)\s+est[aã]o\s+corretas\b/iu.test(after) || /\bas\s+duas\s+s[aã]o\s+v[aá]lidas\b/iu.test(after)) {
    throw new Error("feedback contraditório: afirma mais de uma opção correta");
  }
  if (/\bprimeira\s+listada\b/iu.test(after) || /\bpor\s+ordem\b/iu.test(after)) {
    throw new Error("feedback contraditório: justifica resposta por ordem ou listagem");
  }
  return true;
}

export function validateGraphSimpleChoice(card = {}, slotPacket = {}) {
  validateGraphCard(card);
  const optionErrors = validateOptionTexts(card);
  if (optionErrors.length) {
    throw new Error(optionErrors.join("; "));
  }
  const task = inferGraphPathTask(card);
  const evaluatedOptions = (Array.isArray(card?.options) ? card.options : []).map((option) => {
    const optionId = text(option?.id).toLowerCase();
    const path = parseGraphPathOption(getChoiceOptionComparableValue(option));
    const valid = isValidGraphPath({
      path,
      vertices: card.vertices,
      edges: card.edges,
      task
    });
    return {
      id: optionId,
      path,
      text: text(getChoiceOptionComparableValue(option)),
      valid
    };
  });
  const validOptions = evaluatedOptions.filter((option) => option.valid).map((option) => option.id);
  const invalidOptions = evaluatedOptions.filter((option) => !option.valid).map((option) => option.id);
  if (!validOptions.length) {
    throw new Error("nenhuma alternativa forma caminho simples válido");
  }
  if (validOptions.length > 1) {
    throw new Error(`ambiguidade em graph_simple: múltiplas alternativas válidas (${validOptions.join(", ")})`);
  }
  const computedAnswer = validOptions[0];
  validateChoiceFeedbackConsistency(card, { computedAnswer });
  return {
    computedAnswer,
    validOptions,
    invalidOptions,
    graphTask: task
  };
}

function parseRelationOption(value = "") {
  const source = normalizeRelationToken(value);
  if (!source) {
    return { kind: "empty", items: [] };
  }
  const pairMatches = [...source.matchAll(/([^|,]+?(?:->|>|-)\s*[^|,]+)(?=\s*(?:\||,|$))/gu)].map((match) => text(match[1]));
  if (pairMatches.length) {
    const pairs = pairMatches.map((entry) => {
      const cleaned = normalizeRelationToken(entry);
      if (cleaned.includes("->")) {
        return cleaned.split("->").map((item) => normalizeRelationToken(item));
      }
      if (cleaned.includes(">")) {
        return cleaned.split(">").map((item) => normalizeRelationToken(item));
      }
      if (cleaned.includes("-")) {
        return cleaned.split(/\s*-\s*/u).map((item) => normalizeRelationToken(item));
      }
      return cleaned.split(/\s*,\s*/u).map((item) => normalizeRelationToken(item));
    }).filter((pair) => pair.length === 2 && pair.every(Boolean));
    return { kind: "pairs", items: pairs };
  }
  return { kind: "single", items: [source] };
}

function buildRelationLookup(card = {}) {
  const leftItems = Array.isArray(card?.leftSet?.items) ? card.leftSet.items : [];
  const rightItems = Array.isArray(card?.rightSet?.items) ? card.rightSet.items : [];
  const leftLabelById = new Map(leftItems.map((item) => [text(item?.id), text(item?.label)]));
  const rightLabelById = new Map(rightItems.map((item) => [text(item?.id), text(item?.label)]));
  const relationPairs = (Array.isArray(card?.relations) ? card.relations : []).map((relation) => ({
    left: leftLabelById.get(text(relation?.from)) || text(relation?.from),
    right: rightLabelById.get(text(relation?.to)) || text(relation?.to)
  }));
  return {
    leftLabels: leftItems.map((item) => text(item?.label)).filter(Boolean),
    rightLabels: rightItems.map((item) => text(item?.label)).filter(Boolean),
    relationPairs
  };
}

function inferRelationTask(card = {}, relationLookup = {}) {
  const question = `${text(card?.question)} ${text(card?.prompt)}`;
  const normalizedQuestion = question.toLowerCase();
  const mentionedLeft = relationLookup.leftLabels.filter((item) => normalizedQuestion.includes(item.toLowerCase()));
  const mentionedRight = relationLookup.rightLabels.filter((item) => normalizedQuestion.includes(item.toLowerCase()));
  if (mentionedLeft.length === 1 && mentionedRight.length === 0) {
    return { type: "rightForLeft", left: mentionedLeft[0] };
  }
  if (mentionedRight.length === 1 && mentionedLeft.length === 0) {
    return { type: "leftForRight", right: mentionedRight[0] };
  }
  if (/\bpar\b|\brelação\b/iu.test(question)) {
    return { type: "pairMembership" };
  }
  return { type: "pairMembership" };
}

export function validateRelationMapSimpleChoice(card = {}) {
  const optionErrors = validateOptionTexts(card);
  if (optionErrors.length) {
    throw new Error(optionErrors.join("; "));
  }
  const relationLookup = buildRelationLookup(card);
  const task = inferRelationTask(card, relationLookup);
  const relationSet = new Set(relationLookup.relationPairs.map((pair) => `${pair.left}>${pair.right}`));
  const validOptions = [];
  const invalidOptions = [];
  (Array.isArray(card?.options) ? card.options : []).forEach((option) => {
    const optionId = text(option?.id).toLowerCase();
    const parsed = parseRelationOption(getChoiceOptionComparableValue(option));
    let valid = false;
    if (task.type === "rightForLeft") {
      const expectedRights = relationLookup.relationPairs.filter((pair) => pair.left === task.left).map((pair) => pair.right);
      valid = parsed.kind === "single" && expectedRights.includes(parsed.items[0]);
    } else if (task.type === "leftForRight") {
      const expectedLefts = relationLookup.relationPairs.filter((pair) => pair.right === task.right).map((pair) => pair.left);
      valid = parsed.kind === "single" && expectedLefts.includes(parsed.items[0]);
    } else if (parsed.kind === "pairs") {
      const optionSet = new Set(parsed.items.map((pair) => `${pair[0]}>${pair[1]}`));
      valid = optionSet.size === relationSet.size && [...optionSet].every((item) => relationSet.has(item));
    } else if (parsed.kind === "single") {
      valid = relationLookup.relationPairs.some((pair) => {
        const normalizedSingle = normalizeRelationToken(parsed.items[0]);
        const pairForms = [
          `${pair.left}, ${pair.right}`,
          `${pair.left}-${pair.right}`,
          `${pair.left}>${pair.right}`,
          `${pair.left} -> ${pair.right}`,
          `(${pair.left},${pair.right})`,
          `(${pair.left}, ${pair.right})`
        ].map((item) => normalizeRelationToken(item));
        return pairForms.includes(normalizedSingle);
      });
    }
    if (valid) {
      validOptions.push(optionId);
    } else {
      invalidOptions.push(optionId);
    }
  });
  if (!validOptions.length) {
    throw new Error("nenhuma alternativa corresponde à relação pedida");
  }
  if (validOptions.length > 1) {
    throw new Error(`ambiguidade em relation_map_simple: múltiplas alternativas válidas (${validOptions.join(", ")})`);
  }
  const computedAnswer = validOptions[0];
  validateChoiceFeedbackConsistency(card, { computedAnswer });
  return {
    computedAnswer,
    validOptions,
    invalidOptions,
    relationTask: task
  };
}

function parseFlowOption(value = "") {
  const source = text(value);
  if (!source) {
    return [];
  }
  if (source.includes("|")) {
    return source.split("|").map((item) => text(item)).filter(Boolean);
  }
  if (source.includes(">")) {
    return source.split(">").map((item) => text(item)).filter(Boolean);
  }
  if (source.includes(",")) {
    return source.split(",").map((item) => text(item)).filter(Boolean);
  }
  return [source];
}

function inferFlowTask(card = {}, steps = []) {
  const question = text(card?.question);
  const afterMatch = question.match(/ap[oó]s\s+"?([^"?]+?)"?[?.!]?$/iu) || question.match(/depois\s+de\s+"?([^"?]+?)"?[?.!]?$/iu);
  if (afterMatch) {
    return { type: "nextAfter", step: text(afterMatch[1]) };
  }
  const beforeMatch = question.match(/antes\s+de\s+"?([^"?]+?)"?[?.!]?$/iu);
  if (beforeMatch) {
    return { type: "previousBefore", step: text(beforeMatch[1]) };
  }
  if (/ordem correta|sequ[êe]ncia correta/iu.test(question)) {
    return { type: "fullSequence" };
  }
  if (steps.length) {
    return { type: "fullSequence" };
  }
  return null;
}

export function validateFlowLinearChoice(card = {}) {
  const optionErrors = validateOptionTexts(card);
  if (optionErrors.length) {
    throw new Error(optionErrors.join("; "));
  }
  const steps = [];
  const collectFlowSteps = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.text === "string" && text(node.text)) {
      steps.push(text(node.text));
    }
    if (Array.isArray(node.items)) {
      node.items.forEach(collectFlowSteps);
    }
  };
  collectFlowSteps(card?.structure);
  if (steps.length < 2) {
    throw new Error("flow_linear precisa de ao menos dois passos");
  }
  const task = inferFlowTask(card, steps);
  const validOptions = [];
  const invalidOptions = [];
  (Array.isArray(card?.options) ? card.options : []).forEach((option) => {
    const optionId = text(option?.id).toLowerCase();
    const parsed = parseFlowOption(getChoiceOptionComparableValue(option));
    let valid = false;
    if (task?.type === "nextAfter") {
      const index = steps.findIndex((step) => looseLabelMatches(step, task.step));
      valid = index >= 0 && index < steps.length - 1 && parsed.length === 1 && looseLabelMatches(parsed[0], steps[index + 1]);
    } else if (task?.type === "previousBefore") {
      const index = steps.findIndex((step) => looseLabelMatches(step, task.step));
      valid = index > 0 && parsed.length === 1 && looseLabelMatches(parsed[0], steps[index - 1]);
    } else {
      valid = parsed.length === steps.length && parsed.every((item, index) => looseLabelMatches(item, steps[index]));
    }
    if (valid) {
      validOptions.push(optionId);
    } else {
      invalidOptions.push(optionId);
    }
  });
  if (!validOptions.length) {
    throw new Error("nenhuma alternativa corresponde ao fluxo correto");
  }
  if (validOptions.length > 1) {
    throw new Error(`ambiguidade em flow_linear: múltiplas alternativas válidas (${validOptions.join(", ")})`);
  }
  const computedAnswer = validOptions[0];
  validateChoiceFeedbackConsistency(card, { computedAnswer });
  return {
    computedAnswer,
    validOptions,
    invalidOptions,
    flowTask: task
  };
}

function validateParagraphGap(card = {}) {
  const parts = parseTextGapTokens(card?.text);
  if (!parts.length) {
    throw new Error("lacuna compilada ausente");
  }
  parts.forEach((part) => {
    if (!part.valid) {
      throw new Error("lacuna compilada inválida");
    }
    if (!text(part.answer)) {
      throw new Error("resposta da lacuna vazia");
    }
    if (part.options.filter((item) => text(item) !== text(part.answer)).length < 1) {
      throw new Error("lacuna precisa de ao menos um distrator");
    }
  });
  return true;
}

function validateCodeGap(card = {}) {
  const parts = parseTextGapTokens(card?.code);
  if (!parts.length) {
    throw new Error("code gap sem lacuna compilada");
  }
  parts.forEach((part) => {
    if (!part.valid) {
      throw new Error("code gap inválido");
    }
  });
  return true;
}

function validateChoiceExercise(card = {}) {
  const choiceSource = getCompositeChoiceBlock(card) || card;
  const answer = text(choiceSource?.answer).toLowerCase();
  const optionIds = (Array.isArray(choiceSource?.options) ? choiceSource.options : []).map((option) => text(option?.id).toLowerCase()).filter(Boolean);
  if (!optionIds.includes(answer)) {
    throw new Error("answerId inválido");
  }
  const optionErrors = validateOptionTexts(choiceSource);
  if (optionErrors.length) {
    throw new Error(optionErrors.join("; "));
  }
  return true;
}

function validateCompositeGraphCompareChoice(card = {}) {
  if (text(card?.resource) !== "composite") {
    throw new Error("template composto compilou recurso incorreto");
  }
  const blocks = Array.isArray(card?.blocks) ? card.blocks : [];
  const graphBlocks = blocks.filter((block) => text(block?.kind) === "graph");
  const choiceBlock = getCompositeChoiceBlock(card);
  if (graphBlocks.length !== 2) {
    throw new Error("composite_graph_compare_choice precisa de exatamente dois blocos graph");
  }
  if (!choiceBlock) {
    throw new Error("composite_graph_compare_choice precisa de um bloco choice");
  }
  graphBlocks.forEach((graphBlock) => validateGraphCard(graphBlock));
  validateChoiceExercise(card);
  return {
    graphCount: graphBlocks.length,
    choiceOptions: choiceBlock.options.length
  };
}

export function validateNoStructuralLeakInCard(card = {}) {
  const strings = collectStrings(card);
  const leaks = strings
    .map((value) => ({ value, leak: findStructuralLeak(value) }))
    .filter((entry) => entry.leak);
  if (leaks.length) {
    throw new Error(`vazamento estrutural no card final: ${leaks[0].leak.reason}`);
  }
  return true;
}

export function validateCompiledCardSemantics(card, { templateId = "", slotPacket = {}, planItem = {} } = {}) {
  validateNoStructuralLeakInCard(card);
  if ((card?.exercise === "choice" || templateId === "choice_exercise") && !["matrix_locate_cell_choice"].includes(templateId)) {
    validateChoiceExercise(card);
  }
  if (templateId === "matrix_locate_cell_choice") {
    return validateMatrixLocateCellChoice(card, slotPacket, planItem);
  }
  if (templateId === "graph_simple") {
    validateChoiceExercise(card);
    return validateGraphSimpleChoice(card, slotPacket, planItem);
  }
  if (templateId === "composite_graph_compare_choice") {
    return validateCompositeGraphCompareChoice(card);
  }
  if (templateId === "relation_map_simple") {
    validateChoiceExercise(card);
    return validateRelationMapSimpleChoice(card, slotPacket, planItem);
  }
  if (templateId === "flow_linear") {
    validateChoiceExercise(card);
    return validateFlowLinearChoice(card, slotPacket, planItem);
  }
  if (templateId === "paragraph_gap") {
    return validateParagraphGap(card);
  }
  if (templateId === "code_gap") {
    return validateCodeGap(card);
  }
  if (templateId === "choice_exercise") {
    return validateChoiceExercise(card);
  }
  return true;
}
