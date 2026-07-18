import { resolveCardRuntime } from "../core/cardRuntime.js";
import { getChoiceOptionComparableValue, isChoiceCodeOption, normalizeChoiceOption } from "../core/choiceOptions.js";
import { getContractCardKind } from "../contract/contractCard.js";
import { getExerciseOptionStableId, shuffleExerciseOptions } from "../core/exerciseOptions.js";
import { parseTextGapRenderableParts } from "../core/textGaps.js";
import { computeFlowchartBoardLayout, FLOWCHART_LAYOUT } from "../flowchart/flowchartLayout.js";
import { deriveFlowchartProjectionFromStructure } from "../flowchart/flowchartProjection.js";
import { getFlowchartShapeLabel, normalizeFlowchartShapeKey, renderFlowchartShapeSvg } from "../flowchart/flowchartShapes.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/\r?\n/g, "&#10;");
}

function createInlineSyntaxPlaceholder(value, replacements) {
  const index = replacements.push(`<code>${value}</code>`) - 1;
  return `@@INLINE_SYNTAX_${index}@@`;
}

function restoreInlineSyntaxPlaceholders(value, replacements = []) {
  return replacements.reduce(
    (current, replacement, index) => current.replaceAll(`@@INLINE_SYNTAX_${index}@@`, replacement),
    String(value || "")
  );
}

function wrapPlainInlineSyntax(escapedText) {
  const replacements = [];
  let next = String(escapedText || "");
  const protect = (pattern) => {
    next = next.replace(pattern, (match) => createInlineSyntaxPlaceholder(match, replacements));
  };

  protect(/#include\s*&lt;[^&]+&gt;/g);
  protect(/\b(?:for|while|if|switch)\s*\([^<\n)]*?\)/g);
  protect(/\b(?:printf|scanf|getch|puts|gets|strlen|strcmp|strcpy|strupr|main)\s*\([^<\n)]*?\);?/g);
  protect(/\b[A-Za-z_][A-Za-z0-9_]*\s*\([^<\n)]*?\);?/g);
  protect(/\bcase\s+(?:'[^']+'|-?\d+(?:\.\d+)?)\s*:?/g);
  protect(/\bdefault:?/g);
  protect(/%(?:\.\d+)?[dfcs]/g);
  protect(/&amp;[A-Za-z_][A-Za-z0-9_.]*(?:\[[^\]]+\])*(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]+\])*)*/g);
  protect(/\b[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])+(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])*)*/g);
  protect(/\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])*)+/g);
  protect(/\*[A-Za-z_][A-Za-z0-9_]*/g);
  protect(/\b[A-Za-z_][A-Za-z0-9_]*\+\+/g);
  protect(/\b[A-Za-z_][A-Za-z0-9_]*--\b/g);
  protect(
    /\b[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])?\s*(?:==|!=|&lt;=?|&gt;=?)\s*(?:-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])?)(?:\s*(?:&amp;&amp;|\|\|)\s*[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])?\s*(?:==|!=|&lt;=?|&gt;=?)\s*(?:-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])?))*/g
  );
  protect(/\b[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])?\s*=\s*(?:-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]\n]+\])?)/g);
  protect(/&lt;=?|(?<!-)&gt;=?|==|!=|&amp;&amp;|\|\|/g);
  protect(/\b(?:printf|scanf|getch|puts|gets|strlen|strcmp|strcpy|strupr|main|break|return|typedef|struct|void|int|float|char|double|continue)\b/g);
  next = next.replace(/(^|[\s(])([{}])(?=$|[\s).,;:])/g, (match, prefix, brace) => (
    `${prefix}${createInlineSyntaxPlaceholder(brace, replacements)}`
  ));
  return { text: next, replacements };
}

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function renderMarkdownInlineMarkup(text) {
  const wrapped = wrapPlainInlineSyntax(escapeHtml(text || ""));
  const html = wrapped.text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
  return restoreInlineSyntaxPlaceholders(html, wrapped.replacements);
}

function renderMarkdownInlineWithCodeState(text, state) {
  const segments = String(text || "").split("`");
  let html = "";
  segments.forEach((segment, index) => {
    if (segment) {
      html += state.inCode ? escapeHtml(segment).replace(/\n/g, "<br>") : renderMarkdownInlineMarkup(segment);
    }
    if (index < segments.length - 1) {
      html += state.inCode ? "</code>" : "<code>";
      state.inCode = !state.inCode;
    }
  });
  return html;
}

function renderMarkdownInline(text) {
  const state = { inCode: false };
  const html = renderMarkdownInlineWithCodeState(text, state);
  return html + (state.inCode ? "</code>" : "");
}

function renderMarkdownParagraph(text) {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n");
  const blocks = [];
  let paragraphLines = [];
  let activeList = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(
      '<p class="runtime-markdown-paragraph">' +
      renderMarkdownInline(paragraphLines.join(" ")) +
      "</p>"
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (!activeList || !activeList.items.length) {
      activeList = null;
      return;
    }
    blocks.push(
      `<${activeList.tag} class="runtime-markdown-list">` +
      activeList.items.map((item) => `<li>${renderMarkdownInline(item)}</li>`).join("") +
      `</${activeList.tag}>`
    );
    activeList = null;
  };

  for (const rawLine of lines) {
    const trimmed = String(rawLine || "").trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const listTag = unorderedMatch ? "ul" : orderedMatch ? "ol" : null;
    const listValue = unorderedMatch?.[1] || orderedMatch?.[1] || "";

    if (listTag) {
      flushParagraph();
      if (!activeList || activeList.tag !== listTag) {
        flushList();
        activeList = { tag: listTag, items: [] };
      }
      activeList.items.push(listValue);
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks.join("") || '<p class="runtime-markdown-paragraph"></p>';
}

function formatRuntimeMathNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return normalizeInlineText(value);
  }
  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }
  return String(Number(numericValue.toFixed(2)));
}

function buildExerciseShuffleSeed(renderOptions, scope) {
  return `${String(renderOptions?.exerciseShuffleSeed || "runtime")}::${scope}`;
}

function parseTextGapParts(text) {
  return parseTextGapRenderableParts(text);
}

function blockUsesTextGapExercise(block) {
  if (block?.kind === "paragraph") {
    return parseTextGapParts(block.value).some((part) => part.kind === "blank");
  }
  if (block?.kind === "code") {
    return parseTextGapParts(block.code).some((part) => part.kind === "blank");
  }
  return false;
}

function renderTextGapChoicePrompt(blockKey, part, value, renderOptions = {}) {
  const options = shuffleExerciseOptions(
    (Array.isArray(part?.options) ? part.options : []).map((item) => ({ value: item })),
    buildExerciseShuffleSeed(renderOptions, `${blockKey}::gap::${part?.index ?? 0}`)
  );
  return (
    '<section class="runtime-flow-prompt" data-text-gap-prompt="true">' +
    '<div class="runtime-flow-prompt-head"><span class="runtime-flow-prompt-badge">Opções</span></div>' +
    '<div class="token-options">' +
    options
      .map((item) => {
        const selected = normalizeInlineText(value) === normalizeInlineText(item.value);
        return (
          '<button class="token-option' +
          (selected ? " active" : "") +
          '" type="button" data-action="text-gap-set-choice" data-complete-block-key="' +
          escapeHtml(blockKey) +
          '" data-complete-blank-index="' +
          escapeHtml(part?.index ?? 0) +
          '" data-text-gap-value="' +
          escapeHtml(item.value) +
          '">' +
          escapeHtml(item.value) +
          "</button>"
        );
      })
      .join("") +
    "</div></section>"
  );
}

function renderTextGapBlank(blockKey, part, value, className = "runtime-text-gap-blank") {
  const rawValue = String(value ?? "");
  const blankClasses = Array.isArray(part?.options) && part.options.length
    ? `${className} runtime-text-gap-choice-blank`
    : className;

  if (Array.isArray(part?.options) && part.options.length) {
    return (
      '<span class="' +
      escapeHtml(blankClasses) +
      '" role="button" tabindex="0" dir="ltr" data-text-gap-choice="true" ' +
      'data-action="text-gap-open-choice" data-complete-block-key="' +
      escapeHtml(blockKey) +
      '" data-complete-blank-index="' +
      escapeHtml(part?.index ?? 0) +
      '" data-empty="' +
      (rawValue ? "false" : "true") +
      '">' +
      escapeHtml(rawValue) +
      "</span>"
    );
  }

  return (
    '<span class="' +
    escapeHtml(blankClasses) +
    '" contenteditable="true" role="textbox" spellcheck="false" dir="ltr" data-text-gap-field="true" ' +
    'data-action="complete-input" data-complete-block-key="' +
    escapeHtml(blockKey) +
    '" data-complete-blank-index="' +
    escapeHtml(part?.index ?? 0) +
    '" data-empty="' +
    (rawValue ? "false" : "true") +
    '">' +
    escapeHtml(rawValue) +
    "</span>"
  );
}

function renderTextGapFeedback(blockKey, feedback) {
  if (!feedback) return "";
  if (feedback === "correct") {
    return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  }
  if (feedback === "incomplete") {
    return '<div class="inline-feedback warn"><p class="tiny">Complete todas as lacunas.</p></div>';
  }
  return (
    '<div class="inline-feedback err has-actions">' +
    '<p class="tiny">Incorreto. Tente novamente.</p>' +
    '<div class="feedback-icons">' +
    '<button class="icon-pill" type="button" data-action="complete-view-answer" data-complete-block-key="' +
    escapeHtml(blockKey) +
    '" title="Ver resposta" aria-label="Ver resposta">&#128065;</button>' +
    '<button class="icon-pill primary" type="button" data-action="complete-try-again" data-complete-block-key="' +
    escapeHtml(blockKey) +
    '" title="Tentar de novo" aria-label="Tentar de novo">&#8635;</button>' +
    "</div></div>"
  );
}

function renderTextGapParts(parts, blockKey, values, chunkRenderer = renderMarkdownInline, blankClassName, renderOptions = {}) {
  const activePrompt = renderOptions.activeTextGapPrompt;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const suppressPrompt = !!renderOptions.suppressTextGapPrompt;
  const markdownState = chunkRenderer === renderMarkdownInline ? { inCode: false } : null;
  let promptRendered = false;

  const html = parts
    .map((part) => {
      if (part.kind === "text") {
        const renderedChunk = markdownState
          ? renderMarkdownInlineWithCodeState(part.value, markdownState)
          : chunkRenderer(part.value);
        return markdownState ? renderedChunk : '<span class="runtime-text-gap-chunk">' + renderedChunk + "</span>";
      }

      const value = values[part.index] ?? "";
      if (
        !suppressPrompt &&
        !promptRendered &&
        dockExerciseParts &&
        Array.isArray(part.options) &&
        part.options.length &&
        activePrompt?.blockKey === blockKey &&
        Number(activePrompt?.blankIndex) === Number(part.index)
      ) {
        dockExerciseParts.push(renderTextGapChoicePrompt(blockKey, part, value, renderOptions));
        promptRendered = true;
      }

      return renderTextGapBlank(blockKey, part, value, blankClassName);
    })
    .join("");

  return html + (markdownState?.inCode ? "</code>" : "");
}

function normalizeChoiceBlock(block) {
  const answerId = normalizeInlineText(block?.answer);
  return {
    ask: String(block?.question || "").trim(),
    options: (Array.isArray(block?.options) ? block.options : [])
      .map((option, index) => {
        const normalized = normalizeChoiceOption(option, index);
        return {
          ...normalized,
          answer: normalized.id === answerId
        };
      })
      .filter((option) => getChoiceOptionComparableValue(option).trim())
  };
}

function renderMultipleChoiceFeedback(feedback, blockKey) {
  if (!feedback) return "";
  if (feedback === "correct") {
    return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  }
  if (feedback === "incomplete") {
    return '<div class="inline-feedback warn"><p class="tiny">Selecione pelo menos uma resposta.</p></div>';
  }
  return (
    '<div class="inline-feedback err has-actions">' +
    '<p class="tiny">As respostas marcadas não correspondem ao conjunto esperado.</p>' +
    '<div class="feedback-icons">' +
    '<button class="icon-pill" type="button" data-action="choice-view-answer" data-choice-block-key="' +
    escapeHtml(blockKey) +
    '" title="Ver resposta" aria-label="Ver resposta">&#128065;</button>' +
    '<button class="icon-pill primary" type="button" data-action="choice-try-again" data-choice-block-key="' +
    escapeHtml(blockKey) +
    '" title="Tentar de novo" aria-label="Tentar de novo">&#8635;</button>' +
    "</div></div>"
  );
}

function renderChoiceOptionValue(option) {
  const normalized = normalizeChoiceOption(option);
  if (isChoiceCodeOption(normalized)) {
    return (
      '<pre class="multiple-choice-code"><code data-language="' +
      escapeHtml(normalized.language || "text") +
      '">' +
      escapeHtml(normalized.code || "") +
      "</code></pre>"
    );
  }
  const source = String(normalized.text || "");
  if (source.includes("\n")) {
    return renderMarkdownParagraph(source);
  }
  return renderMarkdownInline(source);
}

function renderChoiceBlock(block, renderOptions = {}, blockKey = "runtime-choice") {
  const normalized = normalizeChoiceBlock(block);
  const exercise = renderOptions.choiceExerciseStateByBlockKey?.[blockKey] || null;
  const selected = new Set(
    (Array.isArray(exercise?.selected) ? exercise.selected : []).map((item) => String(item || "").trim()).filter(Boolean)
  );
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const feedbackHtml = renderMultipleChoiceFeedback(feedback, blockKey);
  const options = normalized.options.map((option, index) => ({
    option,
    optionId: getExerciseOptionStableId(option, index)
  }));
  const displayOptions = shuffleExerciseOptions(options, buildExerciseShuffleSeed(renderOptions, `choice::${blockKey}`));

  const optionsHtml = displayOptions.map(({ option, optionId }) => {
    const isSelected = selected.has(optionId);
    const stateClass =
      isSelected && feedback === "wrong"
        ? " selected-incorrect"
        : isSelected
          ? " active"
          : "";
    const mark =
      isSelected && feedback === "correct"
        ? "&#10003;"
        : isSelected && feedback === "wrong"
          ? "&times;"
          : "";
    return (
      '<button class="multiple-choice-option' +
      stateClass +
      '" type="button" data-action="choice-toggle" data-choice-block-key="' +
      escapeHtml(blockKey) +
      '" data-choice-option-id="' +
      escapeHtml(optionId) +
      '" aria-pressed="' +
      (isSelected ? "true" : "false") +
      '">' +
      '<span class="multiple-choice-mark">' +
      mark +
      "</span>" +
      '<span class="multiple-choice-label">' +
      renderChoiceOptionValue(option) +
      "</span></button>"
    );
  }).join("");

  const bodyHtml =
    '<section class="runtime-block runtime-choice-block multiple-choice-exercise">' +
    '<div class="runtime-choice-body">' +
    renderMarkdownParagraph(normalized.ask) +
    "</div>" +
    '<div class="multiple-choice-list">' +
    optionsHtml +
    "</div>" +
    (dockExerciseParts ? "" : feedbackHtml) +
    "</section>";

  if (dockExerciseParts && feedbackHtml) {
    dockExerciseParts.push(feedbackHtml);
  }
  return bodyHtml;
}

function renderCodeBlock(block, renderOptions = {}, blockKey = "runtime-code") {
  const code = String(block?.code || "");
  const promptHtml = block?.prompt ? '<p class="runtime-code-prompt">' + renderMarkdownInline(block.prompt) + "</p>" : "";
  if (!blockUsesTextGapExercise(block)) {
    return (
      '<div class="runtime-block runtime-code-block">' +
      promptHtml +
      '<pre><code data-language="' +
      escapeHtml(block?.language || "text") +
      '">' +
      escapeHtml(code) +
      "</code></pre></div>"
    );
  }

  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
  const values = Array.isArray(exercise?.values) ? exercise.values : [];
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
  const bodyRenderOptions = feedbackHtml && dockExerciseParts ? { ...renderOptions, suppressTextGapPrompt: true } : renderOptions;
  const bodyHtml =
    '<div class="runtime-block runtime-code-block runtime-code-gap-block">' +
    promptHtml +
    '<pre class="runtime-code-gap"><code data-language="' +
    escapeHtml(block?.language || "text") +
    '">' +
    renderTextGapParts(
      parseTextGapParts(code),
      blockKey,
      values,
      escapeHtml,
      "runtime-text-gap-blank runtime-code-gap-blank",
      bodyRenderOptions
    ) +
    "</code></pre>";
  if (feedbackHtml && dockExerciseParts) {
    dockExerciseParts.push(feedbackHtml);
    return bodyHtml + "</div>";
  }
  return bodyHtml + feedbackHtml + "</div>";
}

function renderTableBlock(block) {
  const columns = Array.isArray(block?.columns) ? block.columns : [];
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  return (
    '<div class="runtime-block runtime-table-block">' +
    '<div class="runtime-table-wrap"><div class="runtime-table-frame"><table class="runtime-table">' +
    (columns.length ? "<thead><tr>" + columns.map((column) => `<th>${renderMarkdownInline(column)}</th>`).join("") + "</tr></thead>" : "") +
    "<tbody>" +
    rows
      .map((row) =>
        "<tr>" +
        (Array.isArray(row) ? row : []).map((cell) => `<td>${renderMarkdownInline(String(cell ?? ""))}</td>`).join("") +
        "</tr>"
      )
      .join("") +
    "</tbody></table></div></div></div>"
  );
}

function buildGraphCircularLayout(vertices, order = []) {
  const total = Math.max(1, vertices.length);
  const orderedIds = order.length ? order : vertices.map((vertex) => vertex.id);
  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  return orderedIds.map((vertexId, index) => {
    const vertex = vertexMap.get(vertexId);
    const angle = (-Math.PI / 2) + ((Math.PI * 2) / total) * index;
    const radius = total <= 2 ? 30 : total <= 4 ? 31 : 34;
    return {
      ...vertex,
      x: Number((50 + Math.cos(angle) * radius).toFixed(2)),
      y: Number((50 + Math.sin(angle) * radius).toFixed(2))
    };
  }).filter(Boolean);
}

function buildGraphPathLayout(vertices, orderedIds = []) {
  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const ids = orderedIds.length ? orderedIds : vertices.map((vertex) => vertex.id);
  const total = Math.max(1, ids.length);
  return ids.map((vertexId, index) => {
    if (total === 1) {
      return {
        ...vertexMap.get(vertexId),
        x: 50,
        y: 50
      };
    }
    if (total === 2) {
      return {
        ...vertexMap.get(vertexId),
        x: Number((22 + ((56 / Math.max(1, total - 1)) * index)).toFixed(2)),
        y: 50
      };
    }
    const angle = Math.PI - ((Math.PI / Math.max(1, total - 1)) * index);
    const horizontalRadius = total >= 5 ? 36 : 34;
    const verticalRadius = total >= 5 ? 24 : 22;
    const x = 50 + (Math.cos(angle) * horizontalRadius);
    const y = 62 - (Math.sin(angle) * verticalRadius);
    return {
      ...vertexMap.get(vertexId),
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2))
    };
  }).filter(Boolean);
}

function buildGraphCycleLayout(vertices, orderedIds = []) {
  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const ids = orderedIds.length ? orderedIds : vertices.map((vertex) => vertex.id);
  const total = Math.max(3, ids.length);
  return ids.map((vertexId, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2) / total) * index;
    const radius = total <= 4 ? 28 : 31;
    return {
      ...vertexMap.get(vertexId),
      x: Number((50 + Math.cos(angle) * radius).toFixed(2)),
      y: Number((50 + Math.sin(angle) * radius).toFixed(2))
    };
  }).filter(Boolean);
}

function buildGraphStarLayout(vertices, centerId, leafIds = []) {
  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const leaves = leafIds.length ? leafIds : vertices.map((vertex) => vertex.id).filter((vertexId) => vertexId !== centerId);
  const positioned = [{
    ...vertexMap.get(centerId),
    x: 50,
    y: 50
  }];
  leaves.forEach((vertexId, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2) / Math.max(1, leaves.length)) * index;
    positioned.push({
      ...vertexMap.get(vertexId),
      x: Number((50 + Math.cos(angle) * 30).toFixed(2)),
      y: Number((50 + Math.sin(angle) * 30).toFixed(2))
    });
  });
  return positioned.filter(Boolean);
}

function buildGraphAdjacency(vertexIds = [], edges = []) {
  const adjacency = new Map(vertexIds.map((vertexId) => [vertexId, new Set()]));
  const degrees = new Map(vertexIds.map((vertexId) => [vertexId, 0]));
  edges.forEach((edge) => {
    const from = String(edge?.from || "").trim();
    const to = String(edge?.to || "").trim();
    if (!adjacency.has(from) || !adjacency.has(to)) {
      return;
    }
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
    degrees.set(from, (degrees.get(from) || 0) + (from === to ? 2 : 1));
    degrees.set(to, (degrees.get(to) || 0) + (from === to ? 0 : 1));
  });
  return { adjacency, degrees };
}

function isConnectedGraph(vertexIds = [], adjacency = new Map()) {
  const activeIds = vertexIds.filter((vertexId) => (adjacency.get(vertexId)?.size || 0) > 0);
  if (!activeIds.length) {
    return vertexIds.length <= 1;
  }
  const visited = new Set([activeIds[0]]);
  const queue = [activeIds[0]];
  while (queue.length) {
    const current = queue.shift();
    (adjacency.get(current) || []).forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    });
  }
  return activeIds.every((vertexId) => visited.has(vertexId));
}

function orderPathVertices(vertexIds = [], adjacency = new Map(), degrees = new Map()) {
  const endpoints = vertexIds.filter((vertexId) => (degrees.get(vertexId) || 0) === 1).sort();
  const startId = endpoints[0] || vertexIds.slice().sort()[0];
  if (!startId) return [];
  const ordered = [];
  const visited = new Set();
  let current = startId;
  let previous = null;
  while (current && !visited.has(current)) {
    ordered.push(current);
    visited.add(current);
    const neighbors = [...(adjacency.get(current) || [])].filter((neighbor) => neighbor !== previous);
    previous = current;
    current = neighbors.find((neighbor) => !visited.has(neighbor)) || null;
  }
  return ordered;
}

function orderCycleVertices(vertexIds = [], adjacency = new Map()) {
  const startId = vertexIds.slice().sort()[0];
  if (!startId) return [];
  const ordered = [startId];
  const neighbors = [...(adjacency.get(startId) || [])].sort();
  let previous = startId;
  let current = neighbors[0] || null;
  const visited = new Set([startId]);
  while (current && !visited.has(current) && ordered.length < vertexIds.length) {
    ordered.push(current);
    visited.add(current);
    const currentNeighbors = [...(adjacency.get(current) || [])].filter((neighbor) => neighbor !== previous).sort();
    previous = current;
    current = currentNeighbors.find((neighbor) => !visited.has(neighbor)) || null;
  }
  return ordered.length === vertexIds.length ? ordered : vertexIds.slice().sort();
}

function resolveGraphVertexLayout(vertices = [], edges = []) {
  const items = Array.isArray(vertices) ? vertices.filter(Boolean) : [];
  if (!items.length) return [];
  if (items.length === 1) {
    return [{ ...items[0], x: 50, y: 50 }];
  }
  const vertexIds = items.map((vertex) => vertex.id);
  const { adjacency, degrees } = buildGraphAdjacency(vertexIds, edges);
  const simpleEdges = edges.filter((edge) => String(edge?.from || "").trim() !== String(edge?.to || "").trim());
  const edgeCount = simpleEdges.length;
  const degreeValues = vertexIds.map((vertexId) => degrees.get(vertexId) || 0);
  const connected = isConnectedGraph(vertexIds, adjacency);
  const isSimplePath =
    connected &&
    edgeCount === items.length - 1 &&
    degreeValues.every((degree) => degree <= 2) &&
    degreeValues.filter((degree) => degree === 1).length === 2;
  if (isSimplePath) {
    return buildGraphPathLayout(items, orderPathVertices(vertexIds, adjacency, degrees));
  }
  const isSimpleCycle =
    connected &&
    items.length >= 3 &&
    edgeCount === items.length &&
    degreeValues.every((degree) => degree === 2);
  if (isSimpleCycle) {
    return buildGraphCycleLayout(items, orderCycleVertices(vertexIds, adjacency));
  }
  const starCenterId = vertexIds.find((vertexId) => (degrees.get(vertexId) || 0) === items.length - 1);
  if (starCenterId && degreeValues.filter((degree) => degree === 1).length === items.length - 1) {
    return buildGraphStarLayout(items, starCenterId, vertexIds.filter((vertexId) => vertexId !== starCenterId).sort());
  }
  const circularOrder = items
    .slice()
    .sort((left, right) => {
      const degreeDiff = (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0);
      return degreeDiff || String(left.label || left.id).localeCompare(String(right.label || right.id));
    })
    .map((vertex) => vertex.id);
  return buildGraphCircularLayout(items, circularOrder);
}

function buildRuntimeGraphEdgeKey(from, to) {
  return [String(from || ""), String(to || "")].sort().join("::");
}

function buildGraphEdgeGeometry(from, to, edge, vertexRadius = 7.8) {
  const round = (value) => Number(Number(value || 0).toFixed(2));
  if (String(from?.id || "") === String(to?.id || "")) {
    const loopIndex = Number(edge?.parallelIndex || 0);
    const loopCount = Number(edge?.parallelCount || 1);
    const loopRadius = 8 + (loopIndex * 3.5);
    const anchorOffset = 4 + ((loopCount - 1) * 0.8);
    const startX = Number(from.x) + anchorOffset;
    const startY = Number(from.y) - (vertexRadius - 1);
    const endX = Number(from.x) - anchorOffset;
    const endY = Number(from.y) - (vertexRadius - 1);
    return {
      labelX: round(from.x),
      labelY: round(Number(from.y) - vertexRadius - loopRadius - 4),
      path: `M ${round(startX)} ${round(startY)} C ${round(Number(from.x) + loopRadius)} ${round(Number(from.y) - loopRadius - vertexRadius)} ${round(Number(from.x) - loopRadius)} ${round(Number(from.y) - loopRadius - vertexRadius)} ${round(endX)} ${round(endY)}`
    };
  }
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  const distance = Math.hypot(dx, dy) || 1;
  const unitX = dx / distance;
  const unitY = dy / distance;
  const normalX = -unitY;
  const normalY = unitX;
  const startX = Number(from.x) + unitX * vertexRadius;
  const startY = Number(from.y) + unitY * vertexRadius;
  const endX = Number(to.x) - unitX * vertexRadius;
  const endY = Number(to.y) - unitY * vertexRadius;
  const order = Number(edge?.parallelIndex || 0) - ((Number(edge?.parallelCount || 1) - 1) / 2);
  const offset = Math.abs(order) < 0.001 ? 0 : order * 8;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const controlX = midX + normalX * offset;
  const controlY = midY + normalY * offset;
  const labelX = offset === 0 ? midX : (0.25 * startX) + (0.5 * controlX) + (0.25 * endX);
  const labelY = offset === 0 ? midY : (0.25 * startY) + (0.5 * controlY) + (0.25 * endY);
  return {
    labelX: round(labelX),
    labelY: round(labelY),
    path: offset === 0
      ? `M ${round(startX)} ${round(startY)} L ${round(endX)} ${round(endY)}`
      : `M ${round(startX)} ${round(startY)} Q ${round(controlX)} ${round(controlY)} ${round(endX)} ${round(endY)}`
  };
}

function renderGraphBlock(block) {
  const sourceVertices = (Array.isArray(block?.vertices) ? block.vertices : [])
    .map((vertex) => ({
      id: String(vertex?.id || "").trim(),
      label: String(vertex?.label || vertex?.id || "").trim()
    }))
    .filter((vertex) => vertex.id);
  const highlightVertexIds = new Set(
    (Array.isArray(block?.highlight?.vertices) ? block.highlight.vertices : []).map((item) => String(item || "").trim()).filter(Boolean)
  );
  const highlightEdgeKeys = new Set(
    (Array.isArray(block?.highlight?.edges) ? block.highlight.edges : [])
      .filter((pair) => Array.isArray(pair) && pair.length === 2)
      .map((pair) => buildRuntimeGraphEdgeKey(pair[0], pair[1]))
  );
  const vertices = resolveGraphVertexLayout(sourceVertices, Array.isArray(block?.edges) ? block.edges : []);
  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, { ...vertex, highlighted: highlightVertexIds.has(vertex.id) }]));

  const pairCounts = new Map();
  const rawEdges = (Array.isArray(block?.edges) ? block.edges : [])
    .map((edge) => {
      const from = String(edge?.from || "").trim();
      const to = String(edge?.to || "").trim();
      const key = buildRuntimeGraphEdgeKey(from, to);
      if (!from || !to || !vertexMap.has(from) || !vertexMap.has(to)) {
        return null;
      }
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      return {
        from,
        to,
        key,
        label: normalizeInlineText(edge?.label),
        weight: normalizeInlineText(edge?.weight),
        highlighted: highlightEdgeKeys.has(key)
      };
    })
    .filter(Boolean);
  const pairSlots = new Map();
  const edges = rawEdges.map((edge) => {
    const parallelIndex = pairSlots.get(edge.key) || 0;
    pairSlots.set(edge.key, parallelIndex + 1);
    return {
      ...edge,
      parallelIndex,
      parallelCount: pairCounts.get(edge.key) || 1
    };
  });
  const ariaLabel = normalizeInlineText(block?.prompt || "Grafo matemático");

  return (
    '<div class="runtime-block runtime-graph-block">' +
    (block?.prompt ? `<p class="runtime-graph-prompt">${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-graph-wrap">' +
    '<svg class="runtime-graph-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
    escapeHtmlAttribute(ariaLabel) +
    '">' +
    '<title>' + escapeHtml(ariaLabel) + "</title>" +
    '<rect class="runtime-graph-surface" x="4" y="4" width="92" height="92" rx="18" ry="18" fill="var(--surface-subtle, rgba(148,163,184,0.08))" stroke="var(--card-border-soft, rgba(15,23,42,0.14))" stroke-width="0.8"></rect>' +
    edges.map((edge, index) => {
      const from = vertexMap.get(edge.from);
      const to = vertexMap.get(edge.to);
      const geometry = buildGraphEdgeGeometry(from, to, edge);
      const label = edge.label || edge.weight;
      return (
        '<g class="runtime-graph-edge-group' +
        (edge.highlighted ? " is-highlighted" : "") +
        '" data-edge-key="' +
        escapeHtml(buildRuntimeGraphEdgeKey(edge.from, edge.to) || `edge-${index}`) +
        '">' +
        '<path class="runtime-graph-edge' +
        (edge.highlighted ? " is-highlighted" : "") +
        '" d="' +
        escapeHtmlAttribute(geometry.path) +
        '" stroke="' +
        (edge.highlighted ? "var(--accent-strong, #0f766e)" : "var(--card-border-strong, currentColor)") +
        '" stroke-width="' +
        (edge.highlighted ? "2.6" : "1.9") +
        '" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>' +
        (label
          ? '<g class="runtime-graph-edge-label" transform="translate(' +
            geometry.labelX +
            " " +
            geometry.labelY +
            ')"><text text-anchor="middle" dominant-baseline="middle" y="-1" fill="#f6ead8" font-size="4.1" font-weight="700">' +
            escapeHtml(label) +
            "</text></g>"
          : "") +
        "</g>"
      );
    }).join("") +
    Array.from(vertexMap.values()).map((vertex) => (
      '<g class="runtime-graph-vertex-group' +
      (vertex.highlighted ? " is-highlighted" : "") +
      '" transform="translate(' +
      escapeHtml(vertex.x) +
      " " +
      escapeHtml(vertex.y) +
      ')">' +
      '<circle class="runtime-graph-vertex' +
      (vertex.highlighted ? " is-highlighted" : "") +
      '" cx="0" cy="0" r="7.8" fill="' +
      (vertex.highlighted ? "var(--accent-soft, rgba(15,118,110,0.14))" : "var(--surface-raised, rgba(255,255,255,0.96))") +
      '" stroke="' +
      (vertex.highlighted ? "var(--accent-strong, #0f766e)" : "var(--card-border-strong, currentColor)") +
      '" stroke-width="' +
      (vertex.highlighted ? "2.2" : "1.7") +
      '"></circle>' +
      '<text class="runtime-graph-vertex-label" text-anchor="middle" dominant-baseline="central" y="0.5" fill="var(--text-strong, currentColor)" font-size="5.4" font-weight="700">' +
      escapeHtml(vertex.label || vertex.id) +
      "</text></g>"
    )).join("") +
    "</svg>" +
    "</div></div>"
  );
}

function normalizeRelationMapSet(setValue, fallbackLabel, sidePrefix) {
  const items = (Array.isArray(setValue?.items) ? setValue.items : [])
    .map((item, index) => ({
      id: String(item?.id || `${sidePrefix}${index + 1}`).trim(),
      label: String(item?.label || item?.id || `${sidePrefix}${index + 1}`).trim()
    }))
    .filter((item) => item.id);
  return {
    label: normalizeInlineText(setValue?.label || fallbackLabel),
    items
  };
}

function relationMapRelationKey(from, to) {
  return `${String(from || "").trim()}::${String(to || "").trim()}`;
}

const RELATION_MAP_LAYOUT = Object.freeze({
  viewWidth: 132,
  topPadding: 18,
  bottomPadding: 14,
  sideGap: 12,
  setRx: 27,
  minSetRy: 18,
  setInset: 2.8,
  dotInset: 1.8,
  itemGap: 3.6,
  labelWidth: 24,
  labelPaddingX: 2.2,
  labelPaddingY: 1.4,
  lineHeight: 4.25,
  minLabelHeight: 6.4,
  labelCharsPerLine: 15
});

function splitLongRelationMapToken(token, limit) {
  const value = String(token || "").trim();
  if (!value || value.length <= limit) return [value];
  const parts = [];
  for (let index = 0; index < value.length; index += limit) {
    parts.push(value.slice(index, index + limit));
  }
  return parts;
}

function wrapRelationMapLabel(label, maxCharsPerLine = RELATION_MAP_LAYOUT.labelCharsPerLine) {
  const text = normalizeInlineText(label);
  if (!text) return [""];
  const words = text.split(/\s+/).flatMap((word) => splitLongRelationMapToken(word, maxCharsPerLine)).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

function estimateRelationMapLabelHeight(lines) {
  return Math.max(
    RELATION_MAP_LAYOUT.minLabelHeight,
    (lines.length * RELATION_MAP_LAYOUT.lineHeight) + (RELATION_MAP_LAYOUT.labelPaddingY * 2)
  );
}

function buildRelationMapSideMetrics(items = []) {
  return items.map((item) => {
    const labelLines = wrapRelationMapLabel(item.label || item.id);
    const labelHeight = estimateRelationMapLabelHeight(labelLines);
    return {
      ...item,
      labelLines,
      labelHeight
    };
  });
}

function computeRelationMapColumnHeight(items = []) {
  if (!items.length) return 0;
  return items.reduce((total, item, index) => total + item.labelHeight + (index > 0 ? RELATION_MAP_LAYOUT.itemGap : 0), 0);
}

function buildRelationMapSetGeometry(items = [], side = "left", viewHeight = 100) {
  const x = side === "left" ? 32 : 100;
  const ys = items.map((item) => Number(item.y)).filter((value) => Number.isFinite(value));
  const heights = items.map((item) => Number(item.labelHeight)).filter((value) => Number.isFinite(value));
  const minY = ys.length ? Math.min(...ys) : viewHeight / 2;
  const maxY = ys.length ? Math.max(...ys) : viewHeight / 2;
  const tallest = heights.length ? Math.max(...heights) : RELATION_MAP_LAYOUT.minLabelHeight;
  const centerY = viewHeight / 2;
  const ry = Math.max(RELATION_MAP_LAYOUT.minSetRy, ((maxY - minY) / 2) + (tallest / 2) + 7);
  return {
    cx: x,
    cy: Number(centerY.toFixed(2)),
    rx: RELATION_MAP_LAYOUT.setRx,
    ry: Number(ry.toFixed(2))
  };
}

function buildRelationMapItemPositions(items = [], viewHeight = 100) {
  const measuredItems = buildRelationMapSideMetrics(items);
  const contentHeight = computeRelationMapColumnHeight(measuredItems);
  const availableHeight = Math.max(32, viewHeight - RELATION_MAP_LAYOUT.topPadding - RELATION_MAP_LAYOUT.bottomPadding);
  const startY = RELATION_MAP_LAYOUT.topPadding + Math.max(0, (availableHeight - contentHeight) / 2);
  let cursor = startY;
  return measuredItems.map((item) => {
    const y = cursor + (item.labelHeight / 2);
    cursor += item.labelHeight + RELATION_MAP_LAYOUT.itemGap;
    return {
      ...item,
      y: Number(y.toFixed(2))
    };
  });
}

function buildRelationMapLayout(leftItems = [], rightItems = []) {
  const leftMetrics = buildRelationMapSideMetrics(leftItems);
  const rightMetrics = buildRelationMapSideMetrics(rightItems);
  const tallestColumn = Math.max(computeRelationMapColumnHeight(leftMetrics), computeRelationMapColumnHeight(rightMetrics));
  const viewHeight = Math.max(104, Math.ceil(tallestColumn + RELATION_MAP_LAYOUT.topPadding + RELATION_MAP_LAYOUT.bottomPadding));
  const leftPositions = buildRelationMapItemPositions(leftMetrics, viewHeight);
  const rightPositions = buildRelationMapItemPositions(rightMetrics, viewHeight);
  const leftGeometry = buildRelationMapSetGeometry(leftPositions, "left", viewHeight);
  const rightGeometry = buildRelationMapSetGeometry(rightPositions, "right", viewHeight);
  return {
    viewWidth: RELATION_MAP_LAYOUT.viewWidth,
    viewHeight,
    leftPositions,
    rightPositions,
    leftGeometry,
    rightGeometry
  };
}

function getRelationMapEllipseSpan(geometry, y) {
  const deltaY = Math.abs(Number(y) - Number(geometry.cy));
  const normalized = geometry.ry > 0 ? Math.min(0.985, deltaY / geometry.ry) : 0;
  return geometry.rx * Math.sqrt(Math.max(0, 1 - (normalized * normalized)));
}

function buildRelationMapItemPlacement(item, side, geometry) {
  const span = getRelationMapEllipseSpan(geometry, item.y);
  const leftEdge = geometry.cx - span + RELATION_MAP_LAYOUT.setInset;
  const rightEdge = geometry.cx + span - RELATION_MAP_LAYOUT.setInset;
  const labelWidth = RELATION_MAP_LAYOUT.labelWidth;
  const labelHeight = item.labelHeight;
  if (side === "left") {
    const dotX = rightEdge - RELATION_MAP_LAYOUT.dotInset;
    return {
      ...item,
      x: Number(dotX.toFixed(2)),
      labelX: Number((dotX - labelWidth - 2.8).toFixed(2)),
      labelY: Number((item.y - (labelHeight / 2)).toFixed(2)),
      labelWidth,
      side
    };
  }
  const dotX = leftEdge + RELATION_MAP_LAYOUT.dotInset;
  return {
    ...item,
    x: Number(dotX.toFixed(2)),
    labelX: Number((dotX + 2.8).toFixed(2)),
    labelY: Number((item.y - (labelHeight / 2)).toFixed(2)),
    labelWidth,
    side
  };
}

function buildRelationMapLinkGeometry(from, to, index, total) {
  const controlX = RELATION_MAP_LAYOUT.viewWidth / 2;
  const baseY = (Number(from.y) + Number(to.y)) / 2;
  const fanOffset = (index - ((Math.max(1, total) - 1) / 2)) * 3.1;
  const slopeOffset = (Number(to.y) - Number(from.y)) * 0.12;
  const controlY = Number((baseY + fanOffset + slopeOffset).toFixed(2));
  const path = `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
  const labelX = Number((((Number(from.x) * 0.25) + (controlX * 0.5) + (Number(to.x) * 0.25))).toFixed(2));
  const labelY = Number((((Number(from.y) * 0.25) + (controlY * 0.5) + (Number(to.y) * 0.25)) - 2.1).toFixed(2));
  return { path, labelX, labelY };
}

function renderRelationMapLabelGroup(item, side, highlighted = false) {
  const boxClass = `runtime-relation-map-item-box${highlighted ? " is-highlighted" : ""}`;
  const textClass = `runtime-relation-map-item-label${side === "right" ? " is-right" : " is-left"}`;
  const boxY = Number((item.y - (item.labelHeight / 2)).toFixed(2));
  const textAnchor = side === "right" ? "end" : "start";
  const textX = side === "right"
    ? Number((item.labelX + item.labelWidth - RELATION_MAP_LAYOUT.labelPaddingX).toFixed(2))
    : Number((item.labelX + RELATION_MAP_LAYOUT.labelPaddingX).toFixed(2));
  const textBlockHeight =
    (RELATION_MAP_LAYOUT.lineHeight * item.labelLines.length) + (RELATION_MAP_LAYOUT.labelPaddingY * 2);
  const singleLineOffset = item.labelLines.length > 1 ? 0 : Math.max(0, (item.labelHeight - textBlockHeight) / 2);
  const firstLineY = Number(
    (
      boxY +
      RELATION_MAP_LAYOUT.labelPaddingY +
      2.9 +
      singleLineOffset
    ).toFixed(2)
  );
  return (
    `<g class="runtime-relation-map-item-label-group${highlighted ? " is-highlighted" : ""}">` +
    `<rect class="${boxClass}" x="${item.labelX}" y="${boxY}" width="${item.labelWidth}" height="${item.labelHeight}" rx="${Math.min(5.4, item.labelHeight / 2)}" ry="${Math.min(5.4, item.labelHeight / 2)}"></rect>` +
    `<text class="${textClass}" x="${textX}" y="${firstLineY}" text-anchor="${textAnchor}">` +
    item.labelLines
      .map((line, index) => {
        const dy = index === 0 ? 0 : RELATION_MAP_LAYOUT.lineHeight;
        return `<tspan x="${textX}" dy="${dy}">${escapeHtml(line)}</tspan>`;
      })
      .join("") +
    "</text></g>"
  );
}

function renderRelationSupplementTable(block) {
  const columns = Array.isArray(block?.relationTable?.columns) ? block.relationTable.columns : [];
  const rows = Array.isArray(block?.relationTable?.rows) ? block.relationTable.rows : [];
  if (!columns.length || !rows.length) {
    return "";
  }
  return (
    '<div class="runtime-relation-map-table-wrap"><table class="runtime-table runtime-relation-map-table">' +
    "<thead><tr>" + columns.map((column) => `<th>${renderMarkdownInline(column)}</th>`).join("") + "</tr></thead>" +
    "<tbody>" +
    rows.map((row) => "<tr>" + row.map((cell) => `<td>${renderMarkdownInline(String(cell ?? ""))}</td>`).join("") + "</tr>").join("") +
    "</tbody></table></div>"
  );
}

function renderRelationMapBlock(block) {
  const leftSet = normalizeRelationMapSet(block?.leftSet, "U", "u");
  const rightSet = normalizeRelationMapSet(block?.rightSet, "V", "v");
  const layout = buildRelationMapLayout(leftSet.items, rightSet.items);
  const leftPositions = layout.leftPositions.map((item) => buildRelationMapItemPlacement(item, "left", layout.leftGeometry));
  const rightPositions = layout.rightPositions.map((item) => buildRelationMapItemPlacement(item, "right", layout.rightGeometry));
  const leftMap = new Map(leftPositions.map((item) => [item.id, item]));
  const rightMap = new Map(rightPositions.map((item) => [item.id, item]));
  const highlightedLeftIds = new Set(
    (Array.isArray(block?.highlight?.leftItems) ? block.highlight.leftItems : []).map((item) => String(item || "").trim()).filter(Boolean)
  );
  const highlightedRightIds = new Set(
    (Array.isArray(block?.highlight?.rightItems) ? block.highlight.rightItems : []).map((item) => String(item || "").trim()).filter(Boolean)
  );
  const highlightedRelations = new Set(
    (Array.isArray(block?.highlight?.relations) ? block.highlight.relations : [])
      .filter((pair) => Array.isArray(pair) && pair.length === 2)
      .map((pair) => relationMapRelationKey(pair[0], pair[1]))
  );
  const relations = (Array.isArray(block?.relations) ? block.relations : [])
    .map((relation) => ({
      from: String(relation?.from || "").trim(),
      to: String(relation?.to || "").trim(),
      label: normalizeInlineText(relation?.label)
    }))
    .filter((relation) => relation.from && relation.to && leftMap.has(relation.from) && rightMap.has(relation.to));
  const pairList = Array.isArray(block?.pairList) ? block.pairList.map((item) => normalizeInlineText(item)).filter(Boolean) : [];
  const ariaLabel = normalizeInlineText(block?.prompt || "Mapa de relações");
  const leftGeometry = layout.leftGeometry;
  const rightGeometry = layout.rightGeometry;

  return (
    '<div class="runtime-block runtime-relation-map-block">' +
    (block?.prompt ? `<p class="runtime-relation-map-prompt">${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-relation-map-wrap">' +
    '<svg class="runtime-relation-map-svg" viewBox="0 0 ' +
    layout.viewWidth +
    " " +
    layout.viewHeight +
    '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
    escapeHtmlAttribute(ariaLabel) +
    '">' +
    '<title>' + escapeHtml(ariaLabel) + "</title>" +
    '<rect class="runtime-graph-surface" x="4" y="4" width="' +
    (layout.viewWidth - 8) +
    '" height="' +
    (layout.viewHeight - 8) +
    '" rx="18" ry="18"></rect>' +
    `<ellipse class="runtime-relation-map-set-shell" cx="${leftGeometry.cx}" cy="${leftGeometry.cy}" rx="${leftGeometry.rx}" ry="${leftGeometry.ry}"></ellipse>` +
    `<ellipse class="runtime-relation-map-set-shell" cx="${rightGeometry.cx}" cy="${rightGeometry.cy}" rx="${rightGeometry.rx}" ry="${rightGeometry.ry}"></ellipse>` +
    `<text class="runtime-relation-map-set-label" x="${leftGeometry.cx}" y="${Math.max(13, leftGeometry.cy - leftGeometry.ry - 3)}" text-anchor="middle">${escapeHtml(leftSet.label || "U")}</text>` +
    `<text class="runtime-relation-map-set-label" x="${rightGeometry.cx}" y="${Math.max(13, rightGeometry.cy - rightGeometry.ry - 3)}" text-anchor="middle">${escapeHtml(rightSet.label || "V")}</text>` +
    relations.map((relation, index) => {
      const from = leftMap.get(relation.from);
      const to = rightMap.get(relation.to);
      const isHighlighted = highlightedRelations.has(relationMapRelationKey(relation.from, relation.to));
      const linkGeometry = buildRelationMapLinkGeometry(from, to, index, relations.length);
      return (
        '<g class="runtime-relation-map-link-group' +
        (isHighlighted ? " is-highlighted" : "") +
        '" data-relation-key="' +
        escapeHtml(relationMapRelationKey(relation.from, relation.to) || `relation-${index}`) +
        '">' +
        `<path class="runtime-relation-map-link${isHighlighted ? " is-highlighted" : ""}" d="${escapeHtmlAttribute(linkGeometry.path)}" />` +
        (relation.label
          ? `<text class="runtime-relation-map-link-label" x="${linkGeometry.labelX}" y="${linkGeometry.labelY}" text-anchor="middle">${escapeHtml(relation.label)}</text>`
          : "") +
        "</g>"
      );
    }).join("") +
    leftPositions.map((item) => (
      `<g class="runtime-relation-map-item${highlightedLeftIds.has(item.id) ? " is-highlighted" : ""}" transform="translate(${item.x} ${item.y})">` +
      '<circle class="runtime-relation-map-item-dot" cx="0" cy="0" r="2.2"></circle>' +
      "</g>"
    )).join("") +
    rightPositions.map((item) => (
      `<g class="runtime-relation-map-item${highlightedRightIds.has(item.id) ? " is-highlighted" : ""}" transform="translate(${item.x} ${item.y})">` +
      '<circle class="runtime-relation-map-item-dot" cx="0" cy="0" r="2.2"></circle>' +
      "</g>"
    )).join("") +
    leftPositions.map((item) => renderRelationMapLabelGroup(item, "left", highlightedLeftIds.has(item.id))).join("") +
    rightPositions.map((item) => renderRelationMapLabelGroup(item, "right", highlightedRightIds.has(item.id))).join("") +
    "</svg>" +
    (pairList.length
      ? '<div class="runtime-relation-map-pairs">' +
        pairList.map((item) => `<span class="runtime-relation-map-pair">${renderMarkdownInline(item)}</span>`).join("") +
        "</div>"
      : "") +
    renderRelationSupplementTable(block) +
    "</div></div>"
  );
}

function normalizeMatrixHighlightCells(highlight, rowCount, columnCount) {
  const cells = new Set();

  function addCell(rowIndex, columnIndex) {
    const safeRow = Number(rowIndex);
    const safeColumn = Number(columnIndex);
    if (!Number.isInteger(safeRow) || !Number.isInteger(safeColumn)) return;
    if (safeRow < 0 || safeRow >= rowCount) return;
    if (safeColumn < 0 || safeColumn >= columnCount) return;
    cells.add(`${safeRow}:${safeColumn}`);
  }

  function addRow(rowIndex) {
    const safeRow = Number(rowIndex);
    if (!Number.isInteger(safeRow) || safeRow < 0 || safeRow >= rowCount) return;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      addCell(safeRow, columnIndex);
    }
  }

  function addColumn(columnIndex) {
    const safeColumn = Number(columnIndex);
    if (!Number.isInteger(safeColumn) || safeColumn < 0 || safeColumn >= columnCount) return;
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      addCell(rowIndex, safeColumn);
    }
  }

  function addNamedSelection(entry) {
    const value = normalizeInlineText(entry);
    if (value !== "mainDiagonal") return;
    const size = Math.min(rowCount, columnCount);
    for (let index = 0; index < size; index += 1) {
      addCell(index, index);
    }
  }

  if (!highlight || typeof highlight !== "object") {
    return cells;
  }

  if (highlight.pattern !== undefined) {
    addNamedSelection(highlight.pattern);
  }
  (Array.isArray(highlight.rows) ? highlight.rows : []).forEach((rowIndex) => addRow(rowIndex));
  (Array.isArray(highlight.columns) ? highlight.columns : []).forEach((columnIndex) => addColumn(columnIndex));
  (Array.isArray(highlight.cells) ? highlight.cells : []).forEach((entry) => {
    if (Array.isArray(entry) && entry.length >= 2) {
      addCell(entry[0], entry[1]);
    }
  });

  return cells;
}

function normalizeMatrixItem(item = {}) {
  const values = (Array.isArray(item?.values) ? item.values : []).map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => String(cell ?? ""))
  );
  return {
    ...item,
    values,
    rowCount: values.length,
    columnCount: values[0]?.length || 0,
    highlightCells: normalizeMatrixHighlightCells(item?.highlight, values.length, values[0]?.length || 0)
  };
}

function renderMatrixShell(matrixItem) {
  const dividerAfterColumn = Number.isInteger(matrixItem?.dividerAfterColumn) ? matrixItem.dividerAfterColumn : null;
  const hasDivider =
    Number.isInteger(dividerAfterColumn) &&
    dividerAfterColumn >= 0 &&
    dividerAfterColumn < Math.max(0, matrixItem.columnCount - 1);
  const displayColumns = matrixItem.columnCount + (hasDivider ? 1 : 0);
  const cellsHtml = matrixItem.values
    .map((row, rowIndex) =>
      row.map((cell, columnIndex) => {
        const scopedColumn = columnIndex + 1 + (hasDivider && columnIndex > dividerAfterColumn ? 1 : 0);
        return (
          '<div class="runtime-matrix-cell' +
          (matrixItem.highlightCells.has(`${rowIndex}:${columnIndex}`) ? " is-highlighted" : "") +
          '" style="grid-column:' +
          scopedColumn +
          ";grid-row:" +
          (rowIndex + 1) +
          ';">' +
          renderMarkdownInline(cell) +
          "</div>"
        );
      }).join("")
    )
    .join("");
  const dividerHtml = hasDivider
    ? '<div class="runtime-matrix-divider" style="grid-column:' +
      (dividerAfterColumn + 2) +
      ';grid-row:1 / span ' +
      matrixItem.rowCount +
      ';"></div>'
    : "";
  return (
    '<div class="runtime-matrix-shell">' +
    '<div class="runtime-matrix-bracket is-left" aria-hidden="true"></div>' +
    '<div class="runtime-matrix-grid" style="--matrix-columns:' +
    displayColumns +
    ";--matrix-rows:" +
    matrixItem.rowCount +
    ';">' +
    dividerHtml +
    cellsHtml +
    "</div>" +
    '<div class="runtime-matrix-bracket is-right" aria-hidden="true"></div>' +
    "</div>"
  );
}

function renderMatrixBlock(block) {
  const sequence = Array.isArray(block?.sequence) && block.sequence.length
    ? block.sequence.map((item) => normalizeMatrixItem(item))
    : null;
  return (
    '<div class="runtime-block runtime-matrix-block">' +
    (block?.prompt ? `<p class="runtime-matrix-prompt">${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-matrix-wrap">' +
    '<div class="runtime-matrix-equation' +
    (sequence ? " is-sequence" : "") +
    '">' +
    (sequence
      ? sequence
        .map((item, index) => (
          '<div class="runtime-matrix-sequence-group">' +
          (index > 0 ? '<div class="runtime-matrix-sequence-operator" aria-hidden="true">' + escapeHtml(normalizeInlineText(item.connector || "=") || "=") + "</div>" : "") +
          '<div class="runtime-matrix-item">' +
          renderMatrixShell(item) +
          "</div></div>"
        ))
        .join("")
      : (block?.name ? '<div class="runtime-matrix-name">' + escapeHtml(block.name) + " =</div>" : "") + renderMatrixShell(normalizeMatrixItem(block))) +
    "</div></div></div>"
  );
}

function buildPlaneAutoRange(values) {
  const numericValues = (Array.isArray(values) ? values : []).map((item) => Number(item)).filter((item) => Number.isFinite(item));
  const baseMin = numericValues.length ? Math.min(...numericValues, 0) : -1;
  const baseMax = numericValues.length ? Math.max(...numericValues, 0) : 1;
  let min = Math.floor(baseMin) - 1;
  let max = Math.ceil(baseMax) + 1;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return [min, max];
}

function normalizePlaneBlock(block) {
  const normalized = {
    mode: "",
    vectors: [],
    segments: [],
    points: [],
    resultText: "",
    note: ""
  };

  if (Array.isArray(block?.vector) && block.vector.length === 2) {
    normalized.mode = "vector";
    normalized.vectors = [{ from: [0, 0], to: block.vector, label: "v", tone: "primary" }];
  } else if (Array.isArray(block?.vectors) && block.vectors.length) {
    normalized.mode = "vectors";
    normalized.vectors = block.vectors.map((vector, index) => ({
      from: [0, 0],
      to: vector,
      label: ["v", "w", "u", "t"][index] || `v${index + 1}`,
      tone: ["primary", "secondary", "tertiary", "quaternary"][index] || "primary"
    }));
  } else if (Array.isArray(block?.sum) && block.sum.length === 2) {
    const [first, second] = block.sum;
    const result = [Number(first?.[0] || 0) + Number(second?.[0] || 0), Number(first?.[1] || 0) + Number(second?.[1] || 0)];
    normalized.mode = "sum";
    normalized.vectors = [
      { from: [0, 0], to: first, label: "v", tone: "primary" },
      { from: [0, 0], to: second, label: "w", tone: "secondary" },
      { from: first, to: result, label: "w deslocado", tone: "secondary", dashed: true },
      { from: [0, 0], to: result, label: "v+w", tone: "result", role: "result" }
    ];
    if (Array.isArray(block?.result) && block.result.length === 2) {
      normalized.resultText = `v+w = (${formatRuntimeMathNumber(block.result[0])}, ${formatRuntimeMathNumber(block.result[1])})`;
    }
  } else if (block?.scale?.vector) {
    const factor = Number(block.scale.k || 0);
    const vector = block.scale.vector;
    const scaled = [factor * Number(vector?.[0] || 0), factor * Number(vector?.[1] || 0)];
    normalized.mode = "scale";
    normalized.vectors = [
      { from: [0, 0], to: vector, label: "v", tone: "primary" },
      { from: [0, 0], to: scaled, label: `${formatRuntimeMathNumber(factor)}v`, tone: "result", role: "result" }
    ];
  } else if (Array.isArray(block?.distance) && block.distance.length === 2) {
    const [start, end] = block.distance;
    normalized.mode = "distance";
    normalized.points = [
      { at: start, label: "A", tone: "primary" },
      { at: end, label: "B", tone: "secondary" }
    ];
    normalized.segments = [{ from: start, to: end, tone: "result" }];
  }

  const plotPoints = [
    [0, 0],
    ...normalized.vectors.flatMap((vector) => [vector.from, vector.to]),
    ...normalized.points.map((point) => point.at),
    ...normalized.segments.flatMap((segment) => [segment.from, segment.to])
  ];
  const xValues = plotPoints.map((point) => Number(point?.[0])).filter((value) => Number.isFinite(value));
  const yValues = plotPoints.map((point) => Number(point?.[1])).filter((value) => Number.isFinite(value));
  return {
    ...normalized,
    xRange: Array.isArray(block?.x) && block.x.length === 2 ? block.x : buildPlaneAutoRange(xValues),
    yRange: Array.isArray(block?.y) && block.y.length === 2 ? block.y : buildPlaneAutoRange(yValues)
  };
}

function buildPlaneGeometry(block) {
  const [xMin, xMax] = Array.isArray(block?.xRange) ? block.xRange : [-1, 1];
  const [yMin, yMax] = Array.isArray(block?.yRange) ? block.yRange : [-1, 1];
  const unit = 44;
  const plotLeft = 52;
  const plotTop = 38;
  const plotRight = 58;
  const plotBottom = 42;
  const plotWidth = Math.max(2, xMax - xMin) * unit;
  const plotHeight = Math.max(2, yMax - yMin) * unit;
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    unit,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    width: plotLeft + plotWidth + plotRight,
    height: plotTop + plotHeight + plotBottom,
    xToPx(value) {
      return plotLeft + (Number(value) - xMin) * unit;
    },
    yToPx(value) {
      return plotTop + plotHeight - (Number(value) - yMin) * unit;
    }
  };
}

function getPlaneToneColor(tone) {
  if (tone === "secondary") return "#e47b45";
  if (tone === "tertiary") return "#62b892";
  if (tone === "quaternary") return "#b99061";
  if (tone === "result") return "#93cf74";
  return "#f2c96d";
}

function renderPlaneGrid(geometry) {
  const lines = [];
  for (let x = geometry.xMin + 1; x <= geometry.xMax - 1; x += 1) {
    const px = geometry.xToPx(x);
    lines.push(`<line x1="${px}" y1="${geometry.plotTop}" x2="${px}" y2="${geometry.plotTop + geometry.plotHeight}" />`);
  }
  for (let y = geometry.yMin + 1; y <= geometry.yMax - 1; y += 1) {
    const py = geometry.yToPx(y);
    lines.push(`<line x1="${geometry.plotLeft}" y1="${py}" x2="${geometry.plotLeft + geometry.plotWidth}" y2="${py}" />`);
  }
  return lines.join("");
}

function renderPlaneAxes(geometry, markerIdBase) {
  const parts = [];
  const plotRight = geometry.plotLeft + geometry.plotWidth;
  const plotBottom = geometry.plotTop + geometry.plotHeight;
  if (geometry.yMin <= 0 && geometry.yMax >= 0) {
    parts.push(
      `<line class="runtime-plane-axis" x1="${geometry.plotLeft}" y1="${geometry.yToPx(0)}" x2="${plotRight + 12}" y2="${geometry.yToPx(0)}" marker-end="url(#${markerIdBase}-axis)" />`
    );
  }
  if (geometry.xMin <= 0 && geometry.xMax >= 0) {
    parts.push(
      `<line class="runtime-plane-axis" x1="${geometry.xToPx(0)}" y1="${plotBottom}" x2="${geometry.xToPx(0)}" y2="${geometry.plotTop - 14}" marker-end="url(#${markerIdBase}-axis)" />`
    );
  }
  return parts.join("");
}

function renderPlaneLegend(block) {
  const items = [...block.vectors, ...block.points].filter((item) => item?.label);
  if (!items.length) return "";
  return (
    '<div class="runtime-plane-legend" aria-label="Legenda do plano">' +
    items.map((item) => (
      '<span class="runtime-plane-legend-item tone-' +
      escapeHtml(item.tone || "primary") +
      '">' +
      '<span class="runtime-plane-legend-swatch" aria-hidden="true"></span>' +
      '<span class="runtime-plane-legend-label">' +
      escapeHtml(item.label) +
      "</span></span>"
    )).join("") +
    "</div>"
  );
}

function renderPlaneBlock(block) {
  const normalized = normalizePlaneBlock(block);
  const geometry = buildPlaneGeometry(normalized);
  const markerIdBase = "runtime-plane";
  return (
    '<div class="runtime-block runtime-plane-block" data-plane-mode="' +
    escapeHtml(normalized.mode) +
    '">' +
    (block?.prompt ? `<p class="runtime-plane-prompt">${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-plane-wrap">' +
    `<svg class="runtime-plane-svg" viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plano cartesiano">` +
    "<defs>" +
    ["axis", "primary", "secondary", "tertiary", "quaternary", "result"].map((tone) => {
      const fill = tone === "axis" ? "#f2d79d" : getPlaneToneColor(tone);
      return `<marker id="${markerIdBase}-${tone}" markerWidth="4.8" markerHeight="4.8" refX="4.2" refY="2.4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4.8,2.4 L0,4.8 z" fill="${fill}" /></marker>`;
    }).join("") +
    "</defs>" +
    `<rect class="runtime-plane-surface" x="${geometry.plotLeft}" y="${geometry.plotTop}" width="${geometry.plotWidth}" height="${geometry.plotHeight}" rx="14" ry="14" />` +
    '<g class="runtime-plane-grid">' + renderPlaneGrid(geometry) + "</g>" +
    `<rect class="runtime-plane-frame" x="${geometry.plotLeft}" y="${geometry.plotTop}" width="${geometry.plotWidth}" height="${geometry.plotHeight}" rx="14" ry="14" />` +
    renderPlaneAxes(geometry, markerIdBase) +
    normalized.segments.map((segment) => (
      '<line class="runtime-plane-segment tone-' +
      escapeHtml(segment.tone || "result") +
      '" x1="' +
      geometry.xToPx(segment.from?.[0] || 0) +
      '" y1="' +
      geometry.yToPx(segment.from?.[1] || 0) +
      '" x2="' +
      geometry.xToPx(segment.to?.[0] || 0) +
      '" y2="' +
      geometry.yToPx(segment.to?.[1] || 0) +
      '" />'
    )).join("") +
    normalized.vectors.map((vector) => (
      '<g class="runtime-plane-vector tone-' +
      escapeHtml(vector.tone || "primary") +
      (vector.dashed ? " is-dashed" : "") +
      '">' +
      `<line x1="${geometry.xToPx(vector.from?.[0] || 0)}" y1="${geometry.yToPx(vector.from?.[1] || 0)}" x2="${geometry.xToPx(vector.to?.[0] || 0)}" y2="${geometry.yToPx(vector.to?.[1] || 0)}" marker-end="url(#${markerIdBase}-${escapeHtml(vector.tone || "primary")})" />` +
      `<circle class="runtime-plane-point tone-${escapeHtml(vector.tone || "primary")}" cx="${geometry.xToPx(vector.to?.[0] || 0)}" cy="${geometry.yToPx(vector.to?.[1] || 0)}" r="3.6" />` +
      "</g>"
    )).join("") +
    normalized.points.map((point) => (
      '<g class="runtime-plane-point-group tone-' +
      escapeHtml(point.tone || "primary") +
      '">' +
      `<circle class="runtime-plane-point tone-${escapeHtml(point.tone || "primary")}" cx="${geometry.xToPx(point.at?.[0] || 0)}" cy="${geometry.yToPx(point.at?.[1] || 0)}" r="4.2" />` +
      "</g>"
    )).join("") +
    (geometry.xMin <= 0 && geometry.xMax >= 0 && geometry.yMin <= 0 && geometry.yMax >= 0
      ? `<circle class="runtime-plane-origin" cx="${geometry.xToPx(0)}" cy="${geometry.yToPx(0)}" r="3.8" />`
      : "") +
    "</svg>" +
    renderPlaneLegend(normalized) +
    (normalized.resultText ? '<div class="runtime-plane-result">' + escapeHtml(normalized.resultText) + "</div>" : "") +
    "</div></div>"
  );
}

function getFlowchartArrowGeometry(start, end, targetNode) {
  if (!Array.isArray(start) || !Array.isArray(end)) return null;
  const dx = Number(end[0] || 0) - Number(start[0] || 0);
  const dy = Number(end[1] || 0) - Number(start[1] || 0);
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return null;

  const unitX = dx / length;
  const unitY = dy / length;
  const targetShapeKey = normalizeFlowchartShapeKey(targetNode?.shape);
  const headOnlyTarget = targetShapeKey === "connector" || targetShapeKey === "page_connector";
  const headLength = Math.min(8, Math.max(4, length * 0.7));
  const headHalfWidth = Math.min(4, Math.max(2.5, headLength * 0.48));
  const headTipOffset = headOnlyTarget ? 7 : 6;
  const renderEndX = Number(end[0] || 0) - unitX * headTipOffset;
  const renderEndY = Number(end[1] || 0) - unitY * headTipOffset;
  const baseX = renderEndX - unitX * headLength;
  const baseY = renderEndY - unitY * headLength;

  return {
    length,
    unitX,
    unitY,
    headLength,
    headHalfWidth,
    renderEndX,
    renderEndY,
    baseX,
    baseY,
    headOnlyTarget
  };
}

function snapFlowchartRouteValue(value) {
  const step = Math.max(1, Number(FLOWCHART_LAYOUT?.routeStep) || 1);
  return Math.round(Number(value || 0) / step) * step;
}

function getFlowchartRenderShapeFrame(shapeKey) {
  switch (normalizeFlowchartShapeKey(shapeKey)) {
    case "terminal":
      return { left: 10, top: 8, right: 110, bottom: 52 };
    case "process":
      return { left: 12, top: 8, right: 108, bottom: 52 };
    case "input_output":
      return { left: 12, top: 8, right: 108, bottom: 52 };
    case "keyboard_input":
      return { left: 12, top: 8, right: 108, bottom: 52 };
    case "screen_output":
      return { left: 14, top: 8, right: 106, bottom: 52 };
    case "printed_output":
      return { left: 12, top: 8, right: 108, bottom: 52 };
    case "decision":
      return { left: 12, top: 6, right: 108, bottom: 54 };
    case "loop":
      return { left: 12, top: 8, right: 108, bottom: 52 };
    case "connector":
      return { left: 38, top: 8, right: 82, bottom: 52 };
    case "page_connector":
      return { left: 18, top: 8, right: 102, bottom: 54 };
    default:
      return { left: 12, top: 8, right: 108, bottom: 52 };
  }
}

function getFlowchartRenderViewportMetrics(position, geometry) {
  const scale = Math.min(
    Number(geometry?.shapeWidth || 0) / 120,
    Number(geometry?.shapeHeight || 0) / 60
  );
  return {
    scale,
    offsetX: Number(position?.shapeLeft || 0) + (Number(geometry?.shapeWidth || 0) - 120 * scale) / 2,
    offsetY: Number(position?.shapeTop || 0) + (Number(geometry?.shapeHeight || 0) - 60 * scale) / 2
  };
}

function projectFlowchartRenderPoint(metrics, x, y) {
  return [
    snapFlowchartRouteValue(Number(metrics?.offsetX || 0) + x * Number(metrics?.scale || 1)),
    snapFlowchartRouteValue(Number(metrics?.offsetY || 0) + y * Number(metrics?.scale || 1))
  ];
}

function getFlowchartRenderAxisX(metrics, x) {
  return Number(metrics?.offsetX || 0) + x * Number(metrics?.scale || 1);
}

function getFlowchartRenderedShapeBounds(node, position, geometry) {
  const frame = getFlowchartRenderShapeFrame(node?.shape);
  const metrics = getFlowchartRenderViewportMetrics(position, geometry);
  const topLeft = projectFlowchartRenderPoint(metrics, frame.left, frame.top);
  const bottomRight = projectFlowchartRenderPoint(metrics, frame.right, frame.bottom);
  return {
    left: Math.min(topLeft[0], bottomRight[0]),
    top: Math.min(topLeft[1], bottomRight[1]),
    right: Math.max(topLeft[0], bottomRight[0]),
    bottom: Math.max(topLeft[1], bottomRight[1])
  };
}

function getFlowchartRenderedTextBounds(position, geometry) {
  return {
    left: Number(position?.textLeft || 0),
    top: Number(position?.textTop || 0),
    right: Number(position?.textLeft || 0) + Number(geometry?.textWidth || 0),
    bottom: Number(position?.textTop || 0) + Number(geometry?.textHeight || 0)
  };
}

function flowchartNodeHidesTextSurface(node) {
  const semanticKind = String(node?.layoutMeta?.semanticKind || "").trim().toLowerCase();
  return semanticKind === "junction";
}

function flowchartNodeHasVisibleTextSurface(node) {
  if (flowchartNodeHidesTextSurface(node)) return false;
  const shapeKey = normalizeFlowchartShapeKey(node?.shape);
  if (shapeKey === "connector") {
    return String(node?.text || "").trim().length > 0;
  }
  return true;
}

function getFlowchartRenderedConnectorPoint(node, position, geometry, side) {
  const shapeKey = normalizeFlowchartShapeKey(node?.shape);
  const metrics = getFlowchartRenderViewportMetrics(position, geometry);
  const textBounds = flowchartNodeHasVisibleTextSurface(node)
    ? getFlowchartRenderedTextBounds(position, geometry)
    : null;

  if (shapeKey === "connector") {
    const center = projectFlowchartRenderPoint(metrics, 60, 30);
    const radius = 22 * Number(metrics?.scale || 1);
    if (side === "top") return [center[0], snapFlowchartRouteValue(center[1] - radius)];
    if (side === "bottom") return [center[0], snapFlowchartRouteValue(center[1] + radius)];
    if (side === "left") return [snapFlowchartRouteValue(center[0] - radius), center[1]];
    if (side === "right") return [snapFlowchartRouteValue(center[0] + radius), center[1]];
  }

  if (shapeKey === "decision") {
    if (side === "top") return projectFlowchartRenderPoint(metrics, 60, 6);
    if (side === "bottom") return projectFlowchartRenderPoint(metrics, 60, 54);
    if (side === "left") return projectFlowchartRenderPoint(metrics, 16, 30);
    if (side === "right") return projectFlowchartRenderPoint(metrics, 104, 30);
  }

  if (shapeKey === "loop") {
    if (side === "top") return projectFlowchartRenderPoint(metrics, 60, 8);
    if (side === "bottom") return projectFlowchartRenderPoint(metrics, 60, 52);
    if (side === "left") return projectFlowchartRenderPoint(metrics, 16, 30);
    if (side === "right") return projectFlowchartRenderPoint(metrics, 104, 30);
  }

  if (shapeKey === "input_output") {
    if (side === "left") return projectFlowchartRenderPoint(metrics, 19, 30);
    if (side === "right") return projectFlowchartRenderPoint(metrics, 101, 30);
    if (side === "bottom" && textBounds) {
      return [
        snapFlowchartRouteValue(getFlowchartRenderAxisX(metrics, 60)),
        snapFlowchartRouteValue(textBounds.bottom)
      ];
    }
    if (side === "bottom") return projectFlowchartRenderPoint(metrics, 60, 52);
    return projectFlowchartRenderPoint(metrics, 60, 8);
  }

  if (shapeKey === "keyboard_input") {
    if (side === "left") return projectFlowchartRenderPoint(metrics, 18, 30);
    if (side === "right") return projectFlowchartRenderPoint(metrics, 102, 30);
    if (side === "bottom" && textBounds) {
      return [
        snapFlowchartRouteValue(getFlowchartRenderAxisX(metrics, 60)),
        snapFlowchartRouteValue(textBounds.bottom)
      ];
    }
    if (side === "bottom") return projectFlowchartRenderPoint(metrics, 60, 49);
    return projectFlowchartRenderPoint(metrics, 60, 8);
  }

  if (shapeKey === "screen_output") {
    if (side === "left") return projectFlowchartRenderPoint(metrics, 14, 30);
    if (side === "right") return projectFlowchartRenderPoint(metrics, 106, 30);
    if (side === "bottom") return projectFlowchartRenderPoint(metrics, 60, 52);
    return projectFlowchartRenderPoint(metrics, 60, 8);
  }

  if (shapeKey === "page_connector") {
    if (side === "top") return projectFlowchartRenderPoint(metrics, 60, 8);
    if (side === "bottom") return projectFlowchartRenderPoint(metrics, 60, 54);
    if (side === "left") return projectFlowchartRenderPoint(metrics, 18, 22);
    if (side === "right") return projectFlowchartRenderPoint(metrics, 102, 22);
  }

  const bounds = getFlowchartRenderedShapeBounds(node, position, geometry);
  if (side === "left") return [bounds.left, snapFlowchartRouteValue((bounds.top + bounds.bottom) / 2)];
  if (side === "right") return [bounds.right, snapFlowchartRouteValue((bounds.top + bounds.bottom) / 2)];
  if (side === "bottom") return [snapFlowchartRouteValue(getFlowchartRenderAxisX(metrics, 60)), bounds.bottom];
  return [snapFlowchartRouteValue(getFlowchartRenderAxisX(metrics, 60)), bounds.top];
}

function inferFlowchartRouteTargetSide(points) {
  if (!Array.isArray(points) || points.length < 2) return "top";
  const prev = points[points.length - 2];
  const end = points[points.length - 1];
  const dx = Number(end?.[0] || 0) - Number(prev?.[0] || 0);
  const dy = Number(end?.[1] || 0) - Number(prev?.[1] || 0);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "left" : "right";
  }
  return dy >= 0 ? "top" : "bottom";
}

function simplifyOrthogonalFlowchartRoutePoints(points = []) {
  const compact = [];
  (Array.isArray(points) ? points : []).forEach((point) => {
    if (!Array.isArray(point) || point.length < 2) return;
    const x = Number(point[0] || 0);
    const y = Number(point[1] || 0);
    const last = compact[compact.length - 1];
    if (last && last[0] === x && last[1] === y) return;
    compact.push([x, y]);
  });
  if (compact.length < 3) return compact;

  const simplified = [compact[0]];
  for (let index = 1; index < compact.length - 1; index += 1) {
    const prev = simplified[simplified.length - 1];
    const current = compact[index];
    const next = compact[index + 1];
    const sameX = prev[0] === current[0] && current[0] === next[0];
    const sameY = prev[1] === current[1] && current[1] === next[1];
    if (!sameX && !sameY) simplified.push(current);
  }
  simplified.push(compact[compact.length - 1]);
  return simplified;
}

function inferOrthogonalFlowchartSegmentOrientation(start, end) {
  const dx = Math.abs(Number(end?.[0] || 0) - Number(start?.[0] || 0));
  const dy = Math.abs(Number(end?.[1] || 0) - Number(start?.[1] || 0));
  if (dx >= dy) return "horizontal";
  return "vertical";
}

function orthogonalizeFlowchartRouteEndpoints(points, originalPoints) {
  if (!Array.isArray(points) || points.length < 2) return points;

  const sourcePoints = Array.isArray(originalPoints) && originalPoints.length >= 2 ? originalPoints : points;
  const startOrientation = inferOrthogonalFlowchartSegmentOrientation(sourcePoints[0], sourcePoints[1]);
  const nextPoint = points[1];
  if (startOrientation === "horizontal") {
    nextPoint[1] = points[0][1];
  } else {
    nextPoint[0] = points[0][0];
  }

  const penultimateIndex = points.length - 2;
  const penultimatePoint = points[penultimateIndex];
  const lastPoint = points[points.length - 1];
  const endOrientation = inferOrthogonalFlowchartSegmentOrientation(
    sourcePoints[sourcePoints.length - 2],
    sourcePoints[sourcePoints.length - 1]
  );
  if (endOrientation === "horizontal") {
    penultimatePoint[1] = lastPoint[1];
  } else {
    penultimatePoint[0] = lastPoint[0];
  }

  return simplifyOrthogonalFlowchartRoutePoints(points);
}

function getFlowchartRenderedRoutePoints(route, sourceNode, targetNode, layout) {
  const originalPoints = (Array.isArray(route?.points) ? route.points : []).map((point) => [Number(point[0] || 0), Number(point[1] || 0)]);
  const points = originalPoints.map((point) => [point[0], point[1]]);
  if (points.length < 2) return points;
  const geometry = layout?.geometry;
  if (!geometry) return points;

  const sourcePosition = sourceNode?.id ? layout?.positions?.[sourceNode.id] : null;
  if (sourceNode && sourcePosition && route?.startSide) {
    const renderedStart = getFlowchartRenderedConnectorPoint(sourceNode, sourcePosition, geometry, route.startSide);
    if (renderedStart) {
      points[0] = renderedStart;
    }
  }

  const targetPosition = targetNode?.id ? layout?.positions?.[targetNode.id] : null;
  if (targetNode && targetPosition) {
    const targetSide = inferFlowchartRouteTargetSide(points);
    const renderedEnd = getFlowchartRenderedConnectorPoint(targetNode, targetPosition, geometry, targetSide);
    if (renderedEnd) {
      points[points.length - 1] = renderedEnd;
    }
  }

  return orthogonalizeFlowchartRouteEndpoints(points, originalPoints);
}

function getFlowchartDisplayedRoutePoints(route, sourceNode, targetNode, layout) {
  const points = getFlowchartRenderedRoutePoints(route, sourceNode, targetNode, layout);
  if (points.length < 2) return points;
  for (let index = points.length - 1; index > 0; index -= 1) {
    const geometry = getFlowchartArrowGeometry(points[index - 1], points[index], targetNode);
    if (!geometry) continue;
    points[index] = [Math.round(geometry.baseX * 10) / 10, Math.round(geometry.baseY * 10) / 10];
    break;
  }
  return points;
}

function renderFlowchartRoute(route, sourceNode, targetNode, layout) {
  const points = getFlowchartDisplayedRoutePoints(route, sourceNode, targetNode, layout);
  if (points.length < 2) return "";
  const label = String(route?.label || route?.link?.label || "").trim();
  const labelPos = route?.labelPos;
  const routePoints = points.map((point) => `${Math.round(Number(point[0]) || 0)},${Math.round(Number(point[1]) || 0)}`).join(" ");

  return (
    '<polyline class="runtime-flow-route" data-link-role="' +
    escapeHtml(route?.link?.role || "next") +
    '" points="' +
    escapeHtml(routePoints) +
    '"></polyline>' +
    (label && labelPos
      ? '<text class="runtime-flow-route-label" x="' +
        escapeHtml(labelPos.x) +
        '" y="' +
        escapeHtml(labelPos.y) +
        '" text-anchor="' +
        escapeHtml(labelPos.anchor || "middle") +
        '">' +
        escapeHtml(label) +
        "</text>"
      : "")
  );
}

function renderFlowchartArrowOverlay(route, sourceNode, targetNode, layout) {
  const points = getFlowchartRenderedRoutePoints(route, sourceNode, targetNode, layout);
  if (points.length < 2) return "";
  for (let index = points.length - 1; index > 0; index -= 1) {
    const geometry = getFlowchartArrowGeometry(points[index - 1], points[index], targetNode);
    if (!geometry) continue;
    const perpX = -geometry.unitY * geometry.headHalfWidth;
    const perpY = geometry.unitX * geometry.headHalfWidth;
    const headPoints = [
      [Math.round(geometry.renderEndX * 10) / 10, Math.round(geometry.renderEndY * 10) / 10],
      [Math.round((geometry.baseX + perpX) * 10) / 10, Math.round((geometry.baseY + perpY) * 10) / 10],
      [Math.round((geometry.baseX - perpX) * 10) / 10, Math.round((geometry.baseY - perpY) * 10) / 10]
    ];
    return (
      '<g class="runtime-flow-arrow" data-link-role="' +
      escapeHtml(route?.link?.role || "next") +
      '"><polygon points="' +
      headPoints.map((point) => `${point[0]},${point[1]}`).join(" ") +
      '"></polygon></g>'
    );
  }
  return "";
}

function renderFlowchartBoardNode(node, layout) {
  const position = layout.positions[node.id];
  if (!position) return "";
  const shape = normalizeFlowchartShapeKey(node?.shape);
  const text = String(node?.text || "").trim();
  const hideText = shape === "connector" && !text;
  return (
    '<article class="runtime-flow-board-node" data-shape="' +
    escapeHtml(shape) +
    '" data-role="' +
    escapeHtml(node?.role || "main") +
    '" style="' +
    escapeHtml(`left:${position.left}px;top:${position.top}px;`) +
    '">' +
    '<div class="runtime-flow-board-shape" aria-label="' +
    escapeHtml(getFlowchartShapeLabel(shape)) +
    '">' +
    renderFlowchartShapeSvg(shape) +
    "</div>" +
    (hideText
      ? ""
      : '<div class="runtime-flow-board-copy">' + renderMarkdownInline(text) + "</div>") +
    "</article>"
  );
}

function renderProjectedFlowchart(block) {
  const projection =
    block?.structure && typeof block.structure === "object"
      ? deriveFlowchartProjectionFromStructure(block.structure)
      : null;
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];
  if (!nodes.length) {
    return '<div class="runtime-block runtime-flow-block"><p class="runtime-paragraph">Fluxograma vazio.</p></div>';
  }

  const layout = computeFlowchartBoardLayout(nodes, links);
  const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const viewportScale = Number(layout.defaultViewportScale || 1);
  const scaledWidth = Math.max(1, Math.round(layout.width * viewportScale));
  const scaledHeight = Math.max(1, Math.round(layout.height * viewportScale));
  const routeEntries = layout.routes.map((route) => route);
  const routesSvg = routeEntries
    .map((route) => renderFlowchartRoute(route, nodeById[route?.link?.fromNodeId], nodeById[route?.link?.toNodeId], layout))
    .join("");
  const arrowsSvg = routeEntries
    .map((route) => renderFlowchartArrowOverlay(route, nodeById[route?.link?.fromNodeId], nodeById[route?.link?.toNodeId], layout))
    .join("");
  const nodesHtml = layout.nodes.map((node) => renderFlowchartBoardNode({ ...node, ...(node?.id ? nodeById[node.id] : null) }, layout)).join("");

  return (
    '<div class="runtime-block runtime-flow-block runtime-flow-board-block">' +
    (block?.prompt ? `<p class="runtime-tree-prompt">${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-flow-board-shell">' +
    '<div class="runtime-flow-board-controls" data-flowchart-zoom-controls="true">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="flowchart-zoom-out" title="Diminuir zoom" aria-label="Diminuir zoom">-</button>' +
    '<button class="icon-ghost tiny-icon runtime-flow-zoom-value" type="button" data-action="flowchart-zoom-reset" data-flowchart-default-scale="' +
    escapeHtml(viewportScale) +
    '" title="Voltar ao ajuste automático" aria-label="Voltar ao ajuste automático">' +
    escapeHtml(Math.round(viewportScale * 100)) +
    '%</button>' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="flowchart-zoom-in" title="Aumentar zoom" aria-label="Aumentar zoom">+</button>' +
    "</div>" +
    '<div class="runtime-flow-board" data-flowchart-scroll="true" data-flowchart-scale="' +
    escapeHtml(viewportScale.toFixed(3)) +
    '" data-flowchart-base-width="' +
    escapeHtml(layout.width) +
    '" data-flowchart-base-height="' +
    escapeHtml(layout.height) +
    '" style="' +
    escapeHtml(`--flowchart-board-width:${layout.width}px;--flowchart-board-height:${layout.height}px;`) +
    '">' +
    '<div class="runtime-flow-board-stage" data-flowchart-stage="true" style="width:' +
    escapeHtml(scaledWidth) +
    "px;height:" +
    escapeHtml(scaledHeight) +
    'px;">' +
    '<div class="runtime-flow-board-canvas" data-flowchart-canvas="true" style="width:' +
    escapeHtml(layout.width) +
    "px;height:" +
    escapeHtml(layout.height) +
    "px;transform:scale(" +
    escapeHtml(viewportScale.toFixed(3)) +
    ');transform-origin:top left;">' +
    '<svg class="runtime-flow-board-svg runtime-flow-board-links" viewBox="0 0 ' +
    escapeHtml(layout.width) +
    " " +
    escapeHtml(layout.height) +
    '" aria-hidden="true" focusable="false">' +
    routesSvg +
    "</svg>" +
    '<div class="runtime-flow-board-surface">' +
    nodesHtml +
    "</div>" +
    '<svg class="runtime-flow-board-svg runtime-flow-board-arrows" viewBox="0 0 ' +
    escapeHtml(layout.width) +
    " " +
    escapeHtml(layout.height) +
    '" aria-hidden="true" focusable="false">' +
    arrowsSvg +
    "</svg>" +
    "</div></div></div></div></div>"
  );
}

function renderFlowBlock(block) {
  return renderProjectedFlowchart(block);
}

function buildRuntimeTreeNodes(nodes = []) {
  const normalizedNodes = (Array.isArray(nodes) ? nodes : []).map((node, index) => ({
    id: String(node?.id || `node-${index + 1}`),
    label: String(node?.label || node?.id || `node-${index + 1}`),
    parentId: node?.parentId === null || node?.parentId === undefined ? null : String(node.parentId),
    type: node?.type === "file" ? "file" : "folder",
    children: [],
    order: index
  }));
  const nodeById = new Map(normalizedNodes.map((node) => [node.id, node]));
  const roots = [];

  normalizedNodes.forEach((node) => {
    if (!node.parentId || node.parentId === node.id) {
      roots.push(node);
      return;
    }
    const parent = nodeById.get(node.parentId);
    if (!parent) {
      roots.push(node);
      return;
    }
    parent.children.push(node);
  });

  return roots.sort((left, right) => left.order - right.order);
}

function renderRuntimeTreeList(nodes = []) {
  if (!Array.isArray(nodes) || !nodes.length) {
    return "";
  }
  return (
    '<ul class="runtime-tree-list">' +
    nodes.map((node) => {
      const childHtml = renderRuntimeTreeList(node.children);
      return (
        '<li class="runtime-tree-item" data-node-id="' +
        escapeHtml(node.id) +
        '" data-type="' +
        escapeHtml(node.type) +
        '">' +
        '<div class="runtime-tree-entry">' +
        '<span class="runtime-tree-node-chip">' +
        escapeHtml(node.type === "folder" ? "dir" : "file") +
        "</span>" +
        '<span class="runtime-tree-node-label">' +
        escapeHtml(node.label) +
        "</span></div>" +
        childHtml +
        "</li>"
      );
    }).join("") +
    "</ul>"
  );
}

function renderTreeBlock(block) {
  return (
    '<div class="runtime-block runtime-tree-block">' +
    (block?.prompt ? `<p class="runtime-tree-prompt">${renderMarkdownInline(block.prompt)}</p>` : "") +
    renderRuntimeTreeList(buildRuntimeTreeNodes(block?.nodes)) +
    "</div>"
  );
}

function getPopupBlocksFromCard(card) {
  const runtime = resolveCardRuntime(card);
  const blocks = Array.isArray(runtime?.blocks) ? runtime.blocks : [];
  const after = blocks.find((block) => block?.kind === "after" && Array.isArray(block?.blocks) && block.blocks.length);
  if (!after) return [];
  return after.blocks;
}

function renderRuntimeBlock(block, renderOptions = {}, blockKey = "runtime-block") {
  if (!block || typeof block !== "object") return "";
  if (block.kind === "heading") {
    return '<h3 class="runtime-block runtime-heading">' + renderMarkdownInline(block.value || "") + "</h3>";
  }
  if (block.kind === "after") {
    return "";
  }
  if (block.kind === "paragraph") {
    if (!blockUsesTextGapExercise(block)) {
      return '<p class="runtime-block runtime-paragraph">' + renderMarkdownParagraph(block.value || "") + "</p>";
    }
    const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
    const values = Array.isArray(exercise?.values) ? exercise.values : [];
    const feedback = exercise?.feedback || null;
    const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
    const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
    const bodyRenderOptions = feedbackHtml && dockExerciseParts ? { ...renderOptions, suppressTextGapPrompt: true } : renderOptions;
    const bodyHtml =
      '<div class="runtime-block runtime-paragraph-gap-block">' +
      '<p class="runtime-block runtime-paragraph runtime-text-gap-paragraph">' +
      renderTextGapParts(
        parseTextGapParts(block.value || ""),
        blockKey,
        values,
        renderMarkdownInline,
        "runtime-text-gap-blank runtime-paragraph-gap-blank",
        bodyRenderOptions
      ) +
      "</p>";
    if (feedbackHtml && dockExerciseParts) {
      dockExerciseParts.push(feedbackHtml);
      return bodyHtml + "</div>";
    }
    return bodyHtml + feedbackHtml + "</div>";
  }
  if (block.kind === "choice") return renderChoiceBlock(block, renderOptions, blockKey);
  if (block.kind === "code") return renderCodeBlock(block, renderOptions, blockKey);
  if (block.kind === "table") return renderTableBlock(block);
  if (block.kind === "flow") return renderFlowBlock(block);
  if (block.kind === "tree") return renderTreeBlock(block);
  if (block.kind === "graph") return renderGraphBlock(block);
  if (block.kind === "relation_map") return renderRelationMapBlock(block);
  if (block.kind === "matrix") return renderMatrixBlock(block);
  if (block.kind === "plane") return renderPlaneBlock(block);
  return "";
}

export function renderRuntimeBlockList(blocks, fallbackText = "Sem conteúdo.", renderOptions = {}) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  if (!safeBlocks.length) {
    return '<p class="runtime-paragraph">' + escapeHtml(fallbackText) + "</p>";
  }
  const blockKeyPrefix = String(renderOptions.blockKeyPrefix || "runtime-block");
  const blockKeys = Array.isArray(renderOptions.blockKeys) ? renderOptions.blockKeys : [];
  return safeBlocks
    .map((block, index) => renderRuntimeBlock(block, renderOptions, blockKeys[index] || `${blockKeyPrefix}::${index}`))
    .join("");
}

export function renderCardRuntimeBlocks(card, options = {}) {
  const runtime = resolveCardRuntime(card);
  const title = normalizeInlineText(options.title || card?.title || runtime?.title);
  const blocks = (Array.isArray(runtime?.blocks) ? runtime.blocks : []).filter((block) => block?.kind !== "after");
  const entries = blocks.map((block, index) => ({ block, originalIndex: index }));
  const normalizedEntries =
    options.omitRepeatedHeading !== false &&
    entries.length &&
    entries[0]?.block?.kind === "heading" &&
    normalizeInlineText(entries[0].block.value).toLowerCase() === title.toLowerCase()
      ? entries.slice(1)
      : entries;

  return renderRuntimeBlockList(
    normalizedEntries.map((entry) => entry.block),
    options.fallbackText || runtime?.fallbackText || "",
    {
      ...options,
      blockKeys: normalizedEntries.map((entry) => `${String(options.blockKeyPrefix || "runtime-block")}::${entry.originalIndex}`)
    }
  );
}

export function getRuntimePopupButtonEntry(card) {
  const popupBlocks = getPopupBlocksFromCard(card);
  if (!popupBlocks.length) return null;
  return {
    block: {
      kind: "after-popup",
      popupBlocks
    },
    index: 0
  };
}

export function renderPopupButtonDock(block, options = {}) {
  const popupBlocks = Array.isArray(block?.popupBlocks) ? block.popupBlocks : [];
  if (!popupBlocks.length) {
    return { bodyHtml: "", dockHtml: "" };
  }
  return {
    bodyHtml: renderRuntimeBlockList(popupBlocks, "", {
      ...options,
      blockKeyPrefix: String(options.blockKeyPrefix || "runtime-popup-block")
    }),
    dockHtml: ""
  };
}

export function renderCardRuntimeBlocksWithDock(card, options = {}) {
  const dockExerciseParts = [];
  const bodyHtml = renderCardRuntimeBlocks(card, { ...options, dockExerciseParts });
  const dockHtml = dockExerciseParts.length
    ? '<section class="card-answer-dock" data-card-answer-dock="true">' + dockExerciseParts.join("") + "</section>"
    : "";
  return { bodyHtml, dockHtml };
}

export function renderCardRuntimeArticle(card) {
  const cardClassByKind = {
    paragraph: "card-say",
    choice: "card-ask",
    composite: "card-composite",
    code: "card-code",
    table: "card-table",
    tree: "card-tree",
    flow: "card-flow",
    graph: "card-graph",
    relation_map: "card-relation-map",
    plane: "card-plane",
    matrix: "card-matrix"
  };
  const kind = getContractCardKind(card) || "paragraph";
  const cardClass = cardClassByKind[kind] || `card-${escapeHtml(kind)}`;
  return (
    '<article class="card ' +
    cardClass +
    '" data-card-id="' +
    escapeHtml(card?.id || `card-${Number(card?.position) || 0}`) +
    '">' +
    '<header class="card-head"><h4>' +
    escapeHtml(card?.title || "Card") +
    "</h4></header>" +
    '<div class="card-body">' +
    renderCardRuntimeBlocks(card, { omitRepeatedHeading: true }) +
    "</div></article>"
  );
}
