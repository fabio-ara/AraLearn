import { resolveCardRuntime } from "../core/cardRuntime.js";
import { getChoiceOptionComparableValue, isChoiceCodeOption, normalizeChoiceOption } from "../core/choiceOptions.js";
import { getContractCardKind } from "../contract/contractCard.js";
import { getExerciseOptionStableId, shuffleExerciseOptions } from "../core/exerciseOptions.js";
import {
  buildResourceGapModel,
  resolveResourceGapText
} from "../core/resourceGaps.js";
import { parseTextGapRenderableParts } from "../core/textGaps.js";
import { computeFlowchartBoardLayout, FLOWCHART_LAYOUT } from "../flowchart/flowchartLayout.js";
import {
  flowchartLinkUsesLabelChoiceBlank,
  flowchartLinkUsesLabelInputBlank,
  flowchartNodeUsesTextChoiceBlank,
  flowchartNodeUsesTextInputBlank,
  flowchartProjectionHasPractice,
  listFlowchartLinkLabelOptions,
  listFlowchartNodeShapeOptions,
  listFlowchartNodeTextOptions
} from "../flowchart/flowchartExercise.js";
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

function textDirection(value) {
  return ["auto", "ltr", "rtl"].includes(value?.textDirection) ? value.textDirection : "auto";
}

function renderTextAttributes(value) {
  const languageTag = typeof value?.languageTag === "string" ? value.languageTag : "";
  return (languageTag ? ` lang="${escapeHtmlAttribute(languageTag)}"` : "") +
    ` dir="${textDirection(value)}"`;
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

function renderMarkdownParagraph(text, textMetadata = null) {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n");
  const blocks = [];
  let paragraphLines = [];
  let activeList = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(
      '<p class="runtime-markdown-paragraph"' + renderTextAttributes(textMetadata) + '>' +
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
      `<${activeList.tag} class="runtime-markdown-list"${renderTextAttributes(textMetadata)}>` +
      activeList.items.map((item) => `<li${renderTextAttributes(textMetadata)}>${renderMarkdownInline(item)}</li>`).join("") +
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
  return blocks.join("") || '<p class="runtime-markdown-paragraph"' + renderTextAttributes(textMetadata) + '></p>';
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
  if (block?.exerciseMode !== undefined && block.exerciseMode !== "gap") return false;
  return buildResourceGapModel(block).gapCount > 0;
}

function prepareResourceGapRender(block, renderOptions, blockKey) {
  if (!blockUsesTextGapExercise(block)) return null;
  const model = buildResourceGapModel(block);
  if (!model.gapCount) return null;
  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey]
    || renderOptions.completeExerciseStateByBlockKey?.[blockKey]
    || null;
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts)
    ? renderOptions.dockExerciseParts
    : null;
  const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
  return {
    blockKey,
    model,
    values: Array.isArray(exercise?.values) ? exercise.values : [],
    feedbackHtml,
    dockExerciseParts,
    renderOptions: feedbackHtml && dockExerciseParts
      ? { ...renderOptions, suppressTextGapPrompt: true }
      : renderOptions
  };
}

function finishResourceGapRender(bodyHtml, gapContext) {
  if (!gapContext?.feedbackHtml) return bodyHtml;
  if (gapContext.dockExerciseParts) {
    gapContext.dockExerciseParts.push(gapContext.feedbackHtml);
    return bodyHtml;
  }
  return bodyHtml + gapContext.feedbackHtml;
}

function renderResourceGapField(gapContext, path, chunkRenderer = renderMarkdownInline, className = "") {
  const field = gapContext?.model?.fieldByPath?.get(path);
  if (!field || !field.count) {
    return null;
  }
  return renderTextGapParts(
    field.parts,
    gapContext.blockKey,
    gapContext.values,
    chunkRenderer,
    `runtime-text-gap-blank ${className}`.trim(),
    gapContext.renderOptions
  );
}

function resolveResourceGapField(gapContext, path, fallback = "") {
  const field = gapContext?.model?.fieldByPath?.get(path);
  if (!field || !field.count) return String(fallback ?? "");
  return resolveResourceGapText(field.value, gapContext.values, field.startIndex);
}

function renderStructuredGapPanel(gapContext, paths = null) {
  if (!gapContext) return "";
  const allowed = paths ? new Set(paths) : null;
  const fields = gapContext.model.fields.filter((field) =>
    field.count > 0 && (!allowed || allowed.has(field.path))
  );
  if (!fields.length) return "";
  const bodyHtml = (
    '<div class="runtime-structured-gap-panel" aria-label="Respostas no recurso">' +
    fields.map((field) => (
      '<div class="runtime-structured-gap-field">' +
      '<span class="runtime-structured-gap-label">' + escapeHtml(field.label) + "</span>" +
      '<span class="runtime-structured-gap-answer">' +
      renderTextGapParts(
        field.parts,
        gapContext.blockKey,
        gapContext.values,
        renderMarkdownInline,
        "runtime-text-gap-blank runtime-structured-gap-blank",
        gapContext.renderOptions
      ) +
      "</span></div>"
    )).join("") +
    "</div>"
  );
  return bodyHtml;
}

function renderTextGapChoicePrompt(blockKey, part, value, renderOptions = {}) {
  const options = shuffleExerciseOptions(
    (Array.isArray(part?.options) ? part.options : []).map((item) => ({ value: item })),
    buildExerciseShuffleSeed(renderOptions, `${blockKey}::gap::${part?.index ?? 0}`)
  );
  return (
    '<section class="runtime-flow-prompt" data-text-gap-prompt="true" tabindex="-1">' +
    '<div class="runtime-flow-prompt-head"><span class="runtime-flow-prompt-badge">Opções</span></div>' +
    '<div class="token-options">' +
    options
      .map((item) => {
        const selected = normalizeInlineText(value) === normalizeInlineText(item.value);
        return (
          '<button class="token-option' +
          (selected ? " active" : "") +
          '" type="button" dir="auto" data-action="text-gap-set-choice" data-complete-block-key="' +
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
    const label = rawValue ? `Editar resposta: ${rawValue}` : "Escolher resposta";
    return (
      '<span class="' +
      escapeHtml(blankClasses) +
      '" role="button" tabindex="0" dir="auto" data-text-gap-choice="true" ' +
      'data-action="text-gap-open-choice" data-complete-block-key="' +
      escapeHtml(blockKey) +
      '" data-complete-blank-index="' +
      escapeHtml(part?.index ?? 0) +
      '" data-empty="' +
      (rawValue ? "false" : "true") +
      '" title="' +
      escapeHtml(label) +
      '" aria-label="' +
      escapeHtml(label) +
      '">' +
      escapeHtml(rawValue) +
      "</span>"
    );
  }

  return (
    '<span class="' +
    escapeHtml(blankClasses) +
    '" contenteditable="true" role="textbox" spellcheck="false" dir="auto" inputmode="text" ' +
    'enterkeyhint="done" autocapitalize="off" autocorrect="off" aria-multiline="false" ' +
    'data-text-gap-field="true" ' +
    'data-action="complete-input" data-complete-block-key="' +
    escapeHtml(blockKey) +
    '" data-complete-blank-index="' +
    escapeHtml(part?.index ?? 0) +
    '" data-empty="' +
    (rawValue ? "false" : "true") +
    '" aria-label="Preencher resposta' +
    (rawValue ? ": " + escapeHtml(rawValue) : "") +
    '">' +
    escapeHtml(rawValue) +
    "</span>"
  );
}

function renderTextGapFeedback(blockKey, feedback) {
  if (!feedback) return "";
  const feedbackAttribute =
    ' data-complete-feedback-block-key="' + escapeHtml(blockKey) + '"';
  if (feedback === "correct") {
    return '<div class="inline-feedback ok"' + feedbackAttribute + '><p class="tiny">Correto.</p></div>';
  }
  if (feedback === "incomplete") {
    return (
      '<div class="inline-feedback warn"' +
      feedbackAttribute +
      '><p class="tiny">Complete todas as lacunas.</p></div>'
    );
  }
  return (
    '<div class="inline-feedback err has-actions"' +
    feedbackAttribute +
    ">" +
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

function renderChoiceOptionValue(option, textMetadata = null) {
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
    return renderMarkdownParagraph(source, textMetadata);
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
      '<span class="multiple-choice-label"' + renderTextAttributes(block) + '>' +
      renderChoiceOptionValue(option, block) +
      "</span></button>"
    );
  }).join("");

  const bodyHtml =
    '<section class="runtime-block runtime-choice-block multiple-choice-exercise"' + renderTextAttributes(block) + '>' +
    '<div class="runtime-choice-body"' + renderTextAttributes(block) + '>' +
    renderMarkdownParagraph(normalized.ask, block) +
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
  const promptHtml = block?.prompt
    ? '<p class="runtime-code-prompt"' + renderTextAttributes(block) + '>' + renderMarkdownInline(block.prompt) + "</p>"
    : "";
  if (!blockUsesTextGapExercise(block)) {
    return (
      '<div class="runtime-block runtime-code-block"' + renderTextAttributes(block) + '>' +
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
    '<div class="runtime-block runtime-code-block runtime-code-gap-block"' + renderTextAttributes(block) + '>' +
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

function renderTableBlock(block, renderOptions = {}, blockKey = "runtime-table") {
  const columns = Array.isArray(block?.columns) ? block.columns : [];
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  const gapContext = prepareResourceGapRender(block, renderOptions, blockKey);
  const accessibleLabel = [
    `Tabela com ${columns.length} ${columns.length === 1 ? "coluna" : "colunas"} e ${rows.length} ${rows.length === 1 ? "linha" : "linhas"}.`,
    columns.length ? `Colunas: ${columns.map((column) => normalizeInlineText(column)).join("; ")}.` : ""
  ].filter(Boolean).join(" ");
  const bodyHtml = (
    '<div class="runtime-block runtime-table-block"' + renderTextAttributes(block) + '>' +
    '<div class="runtime-table-wrap"><div class="runtime-table-frame"><table class="runtime-table" aria-label="' +
    escapeHtmlAttribute(accessibleLabel) + '">' +
    (columns.length ? "<thead><tr>" + columns.map((column) => `<th scope="col"${renderTextAttributes(block)}>${renderMarkdownInline(column)}</th>`).join("") + "</tr></thead>" : "") +
    "<tbody>" +
    rows
      .map((row, rowIndex) =>
        "<tr>" +
        (Array.isArray(row) ? row : []).map((cell, columnIndex) => {
          const gapHtml = renderResourceGapField(
            gapContext,
            `rows[${rowIndex}][${columnIndex}]`,
            renderMarkdownInline,
            "runtime-table-gap-blank"
          );
          return `<td${renderTextAttributes(block)}${gapHtml ? ' class="runtime-table-cell-gap"' : ""}>` +
            (gapHtml ?? renderMarkdownInline(String(cell ?? ""))) +
            "</td>";
        }).join("") +
        "</tr>"
      )
      .join("") +
    "</tbody></table></div></div></div>"
  );
  return finishResourceGapRender(bodyHtml, gapContext);
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
  const preserveExplicitCoordinates = (layout = []) => {
    const sourceById = new Map(items.map((vertex) => [vertex.id, vertex]));
    return layout.map((vertex) => {
      const source = sourceById.get(vertex.id) || {};
      return {
        ...vertex,
        ...(Number.isFinite(source.x) ? { x: source.x } : {}),
        ...(Number.isFinite(source.y) ? { y: source.y } : {})
      };
    });
  };
  if (items.length === 1) {
    return preserveExplicitCoordinates([{ ...items[0], x: 50, y: 50 }]);
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
    return preserveExplicitCoordinates(buildGraphPathLayout(items, orderPathVertices(vertexIds, adjacency, degrees)));
  }
  const isSimpleCycle =
    connected &&
    items.length >= 3 &&
    edgeCount === items.length &&
    degreeValues.every((degree) => degree === 2);
  if (isSimpleCycle) {
    return preserveExplicitCoordinates(buildGraphCycleLayout(items, orderCycleVertices(vertexIds, adjacency)));
  }
  const starCenterId = vertexIds.find((vertexId) => (degrees.get(vertexId) || 0) === items.length - 1);
  if (starCenterId && degreeValues.filter((degree) => degree === 1).length === items.length - 1) {
    return preserveExplicitCoordinates(
      buildGraphStarLayout(items, starCenterId, vertexIds.filter((vertexId) => vertexId !== starCenterId).sort())
    );
  }
  const circularOrder = items
    .slice()
    .sort((left, right) => {
      const degreeDiff = (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0);
      return degreeDiff || String(left.label || left.id).localeCompare(String(right.label || right.id));
    })
    .map((vertex) => vertex.id);
  return preserveExplicitCoordinates(buildGraphCircularLayout(items, circularOrder));
}

function buildRuntimeGraphEdgeKey(from, to) {
  return [String(from || ""), String(to || "")].sort().join("::");
}

function buildRuntimeGraphDirectedEdgeKey(from, to) {
  return String(from || "") + "::" + String(to || "");
}

function buildRuntimeSvgId(prefix, value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return prefix + "-" + (hash >>> 0).toString(36);
}

function buildGraphAccessibleDescription(block, vertices = [], edges = []) {
  const vertexLabels = new Map(vertices.map((vertex) => [vertex.id, vertex.label || vertex.id]));
  const vertexSummary = vertices.map((vertex) => vertex.label || vertex.id).join(", ");
  const edgeSummary = edges.map((edge) => {
    const from = vertexLabels.get(edge.from) || edge.from;
    const to = vertexLabels.get(edge.to) || edge.to;
    const relation = edge.directed ? from + " aponta para " + to : from + " ligado a " + to;
    const annotation = edge.label || edge.weight;
    return annotation ? relation + ", " + annotation : relation;
  }).join("; ");
  const parts = [
    normalizeInlineText(block?.prompt),
    "Grafo com " + vertices.length + " " + (vertices.length === 1 ? "vértice" : "vértices") +
      " e " + edges.length + " " + (edges.length === 1 ? "aresta" : "arestas") + ".",
    vertexSummary ? "Vértices: " + vertexSummary + "." : "",
    edgeSummary ? "Arestas: " + edgeSummary + "." : "Sem arestas."
  ];
  return parts.filter(Boolean).join(" ");
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

function graphAlphabeticKey(index) {
  const alphabetIndex = Number(index) % 26;
  const cycle = Math.floor(Number(index) / 26);
  return String.fromCharCode(65 + alphabetIndex) + (cycle ? String(cycle) : "");
}

function graphLabelFitsInsideVertex(label) {
  const value = normalizeInlineText(label);
  return value.length > 0 && Array.from(value).length <= 3 && !/\s/u.test(value);
}

function graphAnnotationFitsOnEdge(label) {
  const value = normalizeInlineText(label);
  return value.length > 0 && Array.from(value).length <= 3 && !/\s/u.test(value);
}

function buildGraphPresentation(vertices, edges) {
  const legend = [];
  const vertexLabels = new Map();
  let abbreviatedVertexIndex = 0;
  vertices.forEach((vertex) => {
    const fullLabel = normalizeInlineText(vertex.label || vertex.id);
    if (graphLabelFitsInsideVertex(fullLabel)) {
      vertexLabels.set(vertex.id, fullLabel);
      return;
    }
    const key = graphAlphabeticKey(abbreviatedVertexIndex);
    abbreviatedVertexIndex += 1;
    vertexLabels.set(vertex.id, key);
    legend.push({
      kind: "vertex",
      key,
      label: fullLabel,
      highlighted: Boolean(vertex.highlighted)
    });
  });

  const edgeLabels = [];
  const edgeLegendKeys = new Map();
  edges.forEach((edge) => {
    const fullLabel = normalizeInlineText(edge.label || edge.weight);
    if (!fullLabel || graphAnnotationFitsOnEdge(fullLabel)) {
      edgeLabels.push(fullLabel);
      return;
    }
    let key = edgeLegendKeys.get(fullLabel);
    if (!key) {
      key = String(edgeLegendKeys.size + 1);
      edgeLegendKeys.set(fullLabel, key);
      legend.push({
        kind: "edge",
        key,
        label: fullLabel,
        highlighted: Boolean(edge.highlighted)
      });
    } else if (edge.highlighted) {
      const item = legend.find((entry) =>
        entry.kind === "edge" && entry.key === key
      );
      if (item) item.highlighted = true;
    }
    edgeLabels.push(key);
  });

  return { vertexLabels, edgeLabels, legend };
}

function renderGraphLegend(items, block) {
  if (!items.length) return "";
  return (
    '<div class="runtime-graph-legend" role="list" aria-label="Legenda do grafo">' +
    items.map((item) => {
      const kindLabel = item.kind === "vertex" ? "Vértice" : "Aresta";
      return (
        '<span class="runtime-graph-legend-item is-' +
        item.kind +
        (item.highlighted ? " is-highlighted" : "") +
        '" role="listitem" aria-label="' +
        escapeHtmlAttribute(`${kindLabel} ${item.key}: ${item.label}`) +
        '">' +
        '<span class="runtime-graph-legend-key" aria-hidden="true">' +
        escapeHtml(item.key) +
        "</span>" +
        '<span class="runtime-graph-legend-separator" aria-hidden="true">·</span>' +
        '<span class="runtime-graph-legend-label"' + renderTextAttributes(block) + '>' +
        escapeHtml(item.label) +
        "</span></span>"
      );
    }).join("") +
    "</div>"
  );
}

function renderGraphBlock(block, renderOptions = {}, blockKey = "runtime-graph") {
  const gapContext = prepareResourceGapRender(block, renderOptions, blockKey);
  const sourceVertices = (Array.isArray(block?.vertices) ? block.vertices : [])
    .map((vertex, index) => ({
      id: String(vertex?.id || "").trim(),
      label: resolveResourceGapField(
        gapContext,
        `vertices[${index}].label`,
        vertex?.label || vertex?.id || ""
      ).trim(),
      ...(Number.isFinite(vertex?.x) ? { x: vertex.x } : {}),
      ...(Number.isFinite(vertex?.y) ? { y: vertex.y } : {})
    }))
    .filter((vertex) => vertex.id);
  const highlightVertexIds = new Set(
    (Array.isArray(block?.highlight?.vertices) ? block.highlight.vertices : []).map((item) => String(item || "").trim()).filter(Boolean)
  );
  const highlightEdgeKeys = new Set(
    (Array.isArray(block?.highlight?.edges) ? block.highlight.edges : [])
      .filter((pair) => Array.isArray(pair) && pair.length === 2)
      .map((pair) => buildRuntimeGraphDirectedEdgeKey(pair[0], pair[1]))
  );
  const vertices = resolveGraphVertexLayout(sourceVertices, Array.isArray(block?.edges) ? block.edges : []);
  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, { ...vertex, highlighted: highlightVertexIds.has(vertex.id) }]));

  const pairCounts = new Map();
  const rawEdges = (Array.isArray(block?.edges) ? block.edges : [])
    .map((edge, index) => {
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
        label: normalizeInlineText(resolveResourceGapField(gapContext, `edges[${index}].label`, edge?.label)),
        weight: normalizeInlineText(resolveResourceGapField(gapContext, `edges[${index}].weight`, edge?.weight)),
        directed: edge?.directed === true,
        highlighted: highlightEdgeKeys.has(buildRuntimeGraphDirectedEdgeKey(from, to))
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
  const title = normalizeInlineText(block?.prompt || "Grafo");
  const accessibleDescription = buildGraphAccessibleDescription(block, vertices, edges);
  const arrowMarkerId = buildRuntimeSvgId("runtime-graph-arrow", blockKey);
  const presentation = buildGraphPresentation(
    Array.from(vertexMap.values()),
    edges
  );

  const bodyHtml = (
    '<div class="runtime-block runtime-graph-block"' + renderTextAttributes(block) + '>' +
    (block?.prompt ? `<p class="runtime-graph-prompt"${renderTextAttributes(block)}>${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-graph-wrap">' +
    '<svg class="runtime-graph-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
    escapeHtmlAttribute(accessibleDescription) +
    '">' +
    '<title>' + escapeHtml(title) + "</title>" +
    '<desc>' + escapeHtml(accessibleDescription) + "</desc>" +
    '<defs><marker id="' + escapeHtmlAttribute(arrowMarkerId) +
    '" viewBox="0 0 6 6" refX="5.4" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse" markerUnits="strokeWidth">' +
    '<path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke"></path></marker></defs>' +
    '<rect class="runtime-graph-surface" x="4" y="4" width="92" height="92" rx="18" ry="18" fill="var(--surface-subtle, rgba(148,163,184,0.08))" stroke="var(--card-border-soft, rgba(15,23,42,0.14))" stroke-width="0.8"></rect>' +
    edges.map((edge, index) => {
      const from = vertexMap.get(edge.from);
      const to = vertexMap.get(edge.to);
      const geometry = buildGraphEdgeGeometry(from, to, edge);
      const label = presentation.edgeLabels[index];
      return (
        '<g class="runtime-graph-edge-group' +
        (edge.highlighted ? " is-highlighted" : "") +
        '" data-edge-key="' +
        escapeHtml(buildRuntimeGraphDirectedEdgeKey(edge.from, edge.to) || `edge-${index}`) +
        '" data-directed="' +
        (edge.directed ? "true" : "false") +
        '">' +
        '<path class="runtime-graph-edge' +
        (edge.highlighted ? " is-highlighted" : "") +
        '" d="' +
        escapeHtmlAttribute(geometry.path) +
        '" stroke="' +
        (edge.highlighted ? "var(--accent-strong, #0f766e)" : "var(--card-border-strong, currentColor)") +
        '" stroke-width="' +
        (edge.highlighted ? "2.6" : "1.9") +
        '" stroke-linecap="round" stroke-linejoin="round" fill="none"' +
        (edge.directed ? ' marker-end="url(#' + escapeHtmlAttribute(arrowMarkerId) + ')"' : "") +
        "></path>" +
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
      ')" data-vertex-id="' +
      escapeHtmlAttribute(vertex.id) +
      '" data-x="' +
      escapeHtmlAttribute(vertex.x) +
      '" data-y="' +
      escapeHtmlAttribute(vertex.y) +
      '">' +
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
      escapeHtml(presentation.vertexLabels.get(vertex.id) || vertex.id) +
      "</text></g>"
    )).join("") +
    "</svg>" +
    renderGraphLegend(presentation.legend, block) +
    renderStructuredGapPanel(gapContext) +
    "</div></div>"
  );
  return finishResourceGapRender(bodyHtml, gapContext);
}

function normalizeRelationMapSet(setValue, fallbackLabel, sidePrefix, gapContext = null, pathPrefix = "") {
  const items = (Array.isArray(setValue?.items) ? setValue.items : [])
    .map((item, index) => ({
      id: String(item?.id || `${sidePrefix}${index + 1}`).trim(),
      label: resolveResourceGapField(
        gapContext,
        `${pathPrefix}.items[${index}].label`,
        item?.label || item?.id || `${sidePrefix}${index + 1}`
      ).trim()
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

function renderRelationSupplementTable(block, gapContext = null) {
  const columns = Array.isArray(block?.relationTable?.columns) ? block.relationTable.columns : [];
  const rows = Array.isArray(block?.relationTable?.rows) ? block.relationTable.rows : [];
  if (!columns.length || !rows.length) {
    return "";
  }
  const bodyHtml = (
    '<div class="runtime-relation-map-table-wrap"><table class="runtime-table runtime-relation-map-table" aria-label="Tabela auxiliar do mapa de relações">' +
    "<thead><tr>" + columns.map((column) => `<th scope="col"${renderTextAttributes(block)}>${renderMarkdownInline(column)}</th>`).join("") + "</tr></thead>" +
    "<tbody>" +
    rows.map((row, rowIndex) => "<tr>" + row.map((cell, columnIndex) =>
      `<td${renderTextAttributes(block)}>${renderMarkdownInline(resolveResourceGapField(
        gapContext,
        `relationTable.rows[${rowIndex}][${columnIndex}]`,
        cell
      ))}</td>`
    ).join("") + "</tr>").join("") +
    "</tbody></table></div>"
  );
  return bodyHtml;
}

function buildRelationMapAccessibleDescription(leftSet, rightSet, relations) {
  const leftLabels = new Map(leftSet.items.map((item) => [item.id, item.label]));
  const rightLabels = new Map(rightSet.items.map((item) => [item.id, item.label]));
  const relationDescriptions = relations.map((relation) => {
    const from = leftLabels.get(relation.from) || relation.from;
    const to = rightLabels.get(relation.to) || relation.to;
    return `${from} se relaciona com ${to}${relation.label ? ` por ${relation.label}` : ""}`;
  });
  return [
    `Mapa entre ${leftSet.label || "U"} e ${rightSet.label || "V"}.`,
    `${leftSet.label || "U"}: ${leftSet.items.map((item) => item.label).join("; ") || "conjunto vazio"}.`,
    `${rightSet.label || "V"}: ${rightSet.items.map((item) => item.label).join("; ") || "conjunto vazio"}.`,
    relationDescriptions.length
      ? `Relações: ${relationDescriptions.join("; ")}.`
      : "Nenhuma relação representada."
  ].join(" ");
}

function renderRelationMapBlock(block, renderOptions = {}, blockKey = "runtime-relation-map") {
  const gapContext = prepareResourceGapRender(block, renderOptions, blockKey);
  const leftSet = normalizeRelationMapSet(block?.leftSet, "U", "u", gapContext, "leftSet");
  const rightSet = normalizeRelationMapSet(block?.rightSet, "V", "v", gapContext, "rightSet");
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
    .map((relation, index) => ({
      from: String(relation?.from || "").trim(),
      to: String(relation?.to || "").trim(),
      label: normalizeInlineText(resolveResourceGapField(gapContext, `relations[${index}].label`, relation?.label))
    }))
    .filter((relation) => relation.from && relation.to && leftMap.has(relation.from) && rightMap.has(relation.to));
  const pairList = Array.isArray(block?.pairList)
    ? block.pairList.map((item, index) =>
      normalizeInlineText(resolveResourceGapField(gapContext, `pairList[${index}]`, item))
    ).filter(Boolean)
    : [];
  const visualTitle = normalizeInlineText(block?.prompt || "Mapa de relações");
  const accessibleDescription = buildRelationMapAccessibleDescription(leftSet, rightSet, relations);
  const leftGeometry = layout.leftGeometry;
  const rightGeometry = layout.rightGeometry;

  const bodyHtml = (
    '<div class="runtime-block runtime-relation-map-block"' + renderTextAttributes(block) + '>' +
    (block?.prompt ? `<p class="runtime-relation-map-prompt"${renderTextAttributes(block)}>${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-relation-map-wrap">' +
    '<svg class="runtime-relation-map-svg" viewBox="0 0 ' +
    layout.viewWidth +
    " " +
    layout.viewHeight +
    '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
    escapeHtmlAttribute(accessibleDescription) +
    '">' +
    '<title>' + escapeHtml(visualTitle) + "</title>" +
    '<desc>' + escapeHtml(accessibleDescription) + "</desc>" +
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
        pairList.map((item) => `<span class="runtime-relation-map-pair"${renderTextAttributes(block)}>${renderMarkdownInline(item)}</span>`).join("") +
        "</div>"
      : "") +
    renderRelationSupplementTable(block, gapContext) +
    renderStructuredGapPanel(gapContext) +
    "</div></div>"
  );
  return finishResourceGapRender(bodyHtml, gapContext);
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

function buildMatrixItemAccessibleDescription(matrixItem, label) {
  const rows = matrixItem.values.map((row, rowIndex) => (
    `linha ${rowIndex + 1}: ${row.map((cell) => normalizeInlineText(cell)).join("; ")}`
  ));
  const highlighted = [...matrixItem.highlightCells].map((entry) => {
    const [rowIndex, columnIndex] = entry.split(":").map(Number);
    return `linha ${rowIndex + 1}, coluna ${columnIndex + 1}`;
  });
  return [
    `${label}, ${matrixItem.rowCount} ${matrixItem.rowCount === 1 ? "linha" : "linhas"} por ${matrixItem.columnCount} ${matrixItem.columnCount === 1 ? "coluna" : "colunas"}.`,
    rows.length ? `${rows.join(". ")}.` : "Sem células.",
    highlighted.length ? `Destaques: ${highlighted.join("; ")}.` : ""
  ].filter(Boolean).join(" ");
}

function buildMatrixAccessibleDescription(block, sequence) {
  if (!sequence) {
    return buildMatrixItemAccessibleDescription(
      normalizeMatrixItem(block),
      block?.name ? `Matriz ${normalizeInlineText(block.name)}` : "Matriz"
    );
  }
  const parts = [`Sequência com ${sequence.length} ${sequence.length === 1 ? "matriz" : "matrizes"}.`];
  sequence.forEach((item, index) => {
    if (index > 0) {
      parts.push(`Operador ${normalizeInlineText(item.connector || "=")}.`);
    }
    parts.push(buildMatrixItemAccessibleDescription(item, `Matriz ${index + 1}`));
  });
  return parts.join(" ");
}

function renderMatrixShell(matrixItem, textMetadata = null, gapContext = null, pathPrefix = "") {
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
        const gapHtml = renderResourceGapField(
          gapContext,
          `${pathPrefix}values[${rowIndex}][${columnIndex}]`,
          renderMarkdownInline,
          "runtime-matrix-gap-blank"
        );
        return (
          '<div' + renderTextAttributes(textMetadata) + ' class="runtime-matrix-cell' +
          (matrixItem.highlightCells.has(`${rowIndex}:${columnIndex}`) ? " is-highlighted" : "") +
          '" style="grid-column:' +
          scopedColumn +
          ";grid-row:" +
          (rowIndex + 1) +
          ';">' +
          (gapHtml ?? renderMarkdownInline(cell)) +
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

function renderMatrixBlock(block, renderOptions = {}, blockKey = "runtime-matrix") {
  const gapContext = prepareResourceGapRender(block, renderOptions, blockKey);
  const sequence = Array.isArray(block?.sequence) && block.sequence.length
    ? block.sequence.map((item) => normalizeMatrixItem(item))
    : null;
  const accessibleBlock = {
    ...block,
    values: (Array.isArray(block?.values) ? block.values : []).map((row, rowIndex) =>
      (Array.isArray(row) ? row : []).map((cell, columnIndex) =>
        resolveResourceGapField(
          gapContext,
          `values[${rowIndex}][${columnIndex}]`,
          cell
        )
      )
    )
  };
  const accessibleSequence = sequence
    ? sequence.map((item, itemIndex) => normalizeMatrixItem({
      ...item,
      values: item.values.map((row, rowIndex) =>
        row.map((cell, columnIndex) =>
          resolveResourceGapField(
            gapContext,
            `sequence[${itemIndex}].values[${rowIndex}][${columnIndex}]`,
            cell
          )
        )
      )
    }))
    : null;
  const accessibleDescription = buildMatrixAccessibleDescription(
    accessibleBlock,
    accessibleSequence
  );
  const bodyHtml = (
    '<div class="runtime-block runtime-matrix-block"' + renderTextAttributes(block) + '>' +
    (block?.prompt ? `<p class="runtime-matrix-prompt"${renderTextAttributes(block)}>${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-matrix-wrap">' +
    '<div class="runtime-matrix-equation' +
    (sequence ? " is-sequence" : "") +
    '" role="img" aria-label="' +
    escapeHtmlAttribute(accessibleDescription) +
    '">' +
    (sequence
      ? sequence
        .map((item, index) => (
          '<div class="runtime-matrix-sequence-group">' +
          (index > 0 ? '<div class="runtime-matrix-sequence-operator" aria-hidden="true">' + escapeHtml(normalizeInlineText(item.connector || "=") || "=") + "</div>" : "") +
          '<div class="runtime-matrix-item">' +
          renderMatrixShell(item, block, gapContext, `sequence[${index}].`) +
          "</div></div>"
        ))
        .join("")
      : (block?.name ? '<div class="runtime-matrix-name"' + renderTextAttributes(block) + '>' + escapeHtml(block.name) + " =</div>" : "") +
        renderMatrixShell(normalizeMatrixItem(block), block, gapContext)) +
    "</div></div></div>"
  );
  return finishResourceGapRender(bodyHtml, gapContext);
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
  if (typeof block?.result === "string") {
    normalized.resultText = block.result;
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
      '<span class="runtime-plane-legend-label"' + renderTextAttributes(block) + '>' +
      escapeHtml(item.label) +
      "</span></span>"
    )).join("") +
    "</div>"
  );
}

function formatPlaneCoordinate(point) {
  return `(${formatRuntimeMathNumber(point?.[0] || 0)}, ${formatRuntimeMathNumber(point?.[1] || 0)})`;
}

function buildPlaneAccessibleDescription(block, geometry) {
  const modeLabels = {
    axes: "eixos e intervalos",
    vector: "vetor",
    vectors: "vetores",
    sum: "soma de vetores",
    scale: "multiplicação de vetor por escalar",
    distance: "distância entre pontos"
  };
  const vectors = block.vectors.map((vector, index) => (
    `${vector.label || `vetor ${index + 1}`} de ${formatPlaneCoordinate(vector.from)} até ${formatPlaneCoordinate(vector.to)}`
  ));
  const points = block.points.map((point, index) => (
    `${point.label || `ponto ${index + 1}`} em ${formatPlaneCoordinate(point.at)}`
  ));
  const segments = block.segments.map((segment, index) => (
    `segmento ${index + 1} de ${formatPlaneCoordinate(segment.from)} até ${formatPlaneCoordinate(segment.to)}`
  ));
  return [
    `Plano cartesiano para ${modeLabels[block.mode] || "representação geométrica"}.`,
    `Eixo x de ${formatRuntimeMathNumber(geometry.xMin)} a ${formatRuntimeMathNumber(geometry.xMax)}; eixo y de ${formatRuntimeMathNumber(geometry.yMin)} a ${formatRuntimeMathNumber(geometry.yMax)}.`,
    vectors.length ? `Vetores: ${vectors.join("; ")}.` : "",
    points.length ? `Pontos: ${points.join("; ")}.` : "",
    segments.length ? `Segmentos: ${segments.join("; ")}.` : "",
    block.resultText ? `Resultado: ${block.resultText}.` : ""
  ].filter(Boolean).join(" ");
}

function renderPlaneBlock(block, renderOptions = {}, blockKey = "runtime-plane") {
  const gapContext = prepareResourceGapRender(block, renderOptions, blockKey);
  const normalized = {
    ...normalizePlaneBlock(block),
    languageTag: block?.languageTag,
    textDirection: block?.textDirection
  };
  normalized.resultText = resolveResourceGapField(gapContext, "result", normalized.resultText);
  const geometry = buildPlaneGeometry(normalized);
  const accessibleDescription = buildPlaneAccessibleDescription(normalized, geometry);
  const markerIdBase = "runtime-plane";
  const resultGapHtml = renderResourceGapField(
    gapContext,
    "result",
    renderMarkdownInline,
    "runtime-plane-gap-blank"
  );
  const bodyHtml = (
    '<div class="runtime-block runtime-plane-block" data-plane-mode="' +
    escapeHtml(normalized.mode) +
    '"' + renderTextAttributes(block) + '>' +
    (block?.prompt ? `<p class="runtime-plane-prompt"${renderTextAttributes(block)}>${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-plane-wrap">' +
    `<svg class="runtime-plane-svg" viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtmlAttribute(accessibleDescription)}">` +
    "<title>Plano cartesiano</title>" +
    "<desc>" + escapeHtml(accessibleDescription) + "</desc>" +
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
    (normalized.resultText
      ? '<div class="runtime-plane-result"' + renderTextAttributes(block) + '>' +
        (resultGapHtml ?? escapeHtml(normalized.resultText)) +
        "</div>"
      : "") +
    "</div></div>"
  );
  return finishResourceGapRender(bodyHtml, gapContext);
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

function renderFlowchartRoute(route, sourceNode, targetNode, layout, practiceEnabled = false) {
  const points = getFlowchartDisplayedRoutePoints(route, sourceNode, targetNode, layout);
  if (points.length < 2) return "";
  const label = String(route?.label || route?.link?.label || "").trim();
  const labelPos = route?.labelPos;
  const routePoints = points.map((point) => `${Math.round(Number(point[0]) || 0)},${Math.round(Number(point[1]) || 0)}`).join(" ");
  const hideStaticLabel = practiceEnabled && route?.link?.labelBlank;

  return (
    '<polyline class="runtime-flow-route" data-link-role="' +
    escapeHtml(route?.link?.role || "next") +
    '" points="' +
    escapeHtml(routePoints) +
    '"></polyline>' +
    (!hideStaticLabel && label && labelPos
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

export function resolveRuntimeFlowchartProjection(block) {
  if (block?.projection && typeof block.projection === "object") return block.projection;
  if (!block?.structure || typeof block.structure !== "object") return null;
  return deriveFlowchartProjectionFromStructure(block.structure);
}

function renderFlowchartInteractiveLabel(route, exercise, blockKey, prompt) {
  const link = route?.link;
  const labelPos = route?.labelPos;
  if (!link?.labelBlank || !labelPos) return "";

  const currentValue = String(exercise?.labels?.[link.id] || "").trim();
  const active = prompt?.kind === "label" && prompt?.targetId === link.id;
  const anchorClass = labelPos.anchor === "start"
    ? " is-anchor-start"
    : labelPos.anchor === "end"
      ? " is-anchor-end"
      : "";
  const position = `left:${labelPos.x}px;top:${labelPos.y}px;`;

  if (flowchartLinkUsesLabelInputBlank(link)) {
    return (
      '<input dir="auto" class="runtime-flow-label-button runtime-flow-label-input practice-marked is-blank-input' +
      (currentValue ? " is-filled" : "") +
      (active ? " is-active" : "") +
      anchorClass +
      '" type="text" data-flowchart-inline-input="true" data-flowchart-block-key="' +
      escapeHtml(blockKey) +
      '" data-flowchart-target-id="' +
      escapeHtml(link.id) +
      '" data-flowchart-choice-kind="label" style="' +
      escapeHtml(position) +
      '" value="' +
      escapeHtml(currentValue) +
      '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
      'inputmode="text" enterkeyhint="done" aria-label="Preencher rótulo da ligação">'
    );
  }

  const label = currentValue ? `Editar rótulo: ${currentValue}` : "Escolher rótulo da ligação";
  return (
    '<button dir="auto" class="runtime-flow-label-button practice-marked is-blank-choice' +
    (currentValue ? " is-filled" : " is-placeholder") +
    (active ? " is-active" : "") +
    anchorClass +
    '" type="button" data-action="flowchart-open-label" data-flowchart-block-key="' +
    escapeHtml(blockKey) +
    '" data-flowchart-target-id="' +
    escapeHtml(link.id) +
    '" style="' +
    escapeHtml(position) +
    '" title="' +
    escapeHtml(label) +
    '" aria-label="' +
    escapeHtml(label) +
    '">' +
    (currentValue ? escapeHtml(currentValue) : "&nbsp;") +
    "</button>"
  );
}

function renderFlowchartBoardNode(node, layout, options = {}) {
  const position = layout.positions[node.id];
  if (!position) return "";

  const practiceEnabled = options.practiceEnabled === true;
  const exercise = options.exercise || null;
  const prompt = options.prompt || null;
  const currentShape = practiceEnabled && node.shapeBlank
    ? String(exercise?.shapes?.[node.id] || "").trim()
    : String(node?.shape || "").trim();
  const currentText = practiceEnabled && node.textBlank
    ? String(exercise?.texts?.[node.id] || "").trim()
    : String(node?.text || "").trim();
  const shape = normalizeFlowchartShapeKey(currentShape || node?.shape);
  const exposedShape = practiceEnabled && node.shapeBlank && !currentShape ? "blank" : shape;
  const shapeActive = prompt?.kind === "shape" && prompt?.targetId === node.id;
  const textActive = prompt?.kind === "text" && prompt?.targetId === node.id;
  const hideText = shape === "connector" && !currentText && !node.textBlank;
  const shapeMarkup = currentShape
    ? renderFlowchartShapeSvg(shape)
    : '<div class="runtime-flow-shape-placeholder" aria-hidden="true"></div>';

  const shapeHtml = practiceEnabled && node.shapeBlank
    ? '<button class="runtime-flow-board-shape runtime-flow-board-shape-button practice-marked' +
      (shapeActive ? " is-active" : "") +
      (currentShape ? " is-filled" : "") +
      '" type="button" data-action="flowchart-open-shape" data-flowchart-block-key="' +
      escapeHtml(options.blockKey) +
      '" data-flowchart-target-id="' +
      escapeHtml(node.id) +
      '" title="' +
      escapeHtml(currentShape ? "Editar símbolo" : "Escolher símbolo") +
      '" aria-label="' +
      escapeHtml(currentShape ? "Editar símbolo" : "Escolher símbolo") +
      '">' +
      shapeMarkup +
      "</button>"
    : '<div class="runtime-flow-board-shape" aria-label="' +
      escapeHtml(getFlowchartShapeLabel(shape)) +
      '">' +
      renderFlowchartShapeSvg(shape) +
      "</div>";

  let textHtml = "";
  if (!hideText && practiceEnabled && flowchartNodeUsesTextInputBlank(node)) {
    textHtml =
      '<input dir="auto" class="runtime-flow-board-copy runtime-flow-inline-input runtime-flow-board-copy-input practice-marked is-blank-input' +
      (textActive ? " is-active" : "") +
      (currentText ? " is-filled" : "") +
      '" type="text" data-flowchart-inline-input="true" data-flowchart-block-key="' +
      escapeHtml(options.blockKey) +
      '" data-flowchart-target-id="' +
      escapeHtml(node.id) +
      '" data-flowchart-choice-kind="text" value="' +
      escapeHtml(currentText) +
      '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
      'inputmode="text" enterkeyhint="done" aria-label="' +
      escapeHtml(currentText ? "Editar texto" : "Preencher texto") +
      '">';
  } else if (!hideText && practiceEnabled && node.textBlank) {
    const label = currentText ? `Editar texto: ${currentText}` : "Escolher texto";
    textHtml =
      '<button dir="auto" class="runtime-flow-board-copy runtime-flow-board-copy-button practice-marked is-blank-choice' +
      (textActive ? " is-active" : "") +
      (currentText ? " is-filled" : "") +
      '" type="button" data-action="flowchart-open-text" data-flowchart-block-key="' +
      escapeHtml(options.blockKey) +
      '" data-flowchart-target-id="' +
      escapeHtml(node.id) +
      '" title="' +
      escapeHtml(label) +
      '" aria-label="' +
      escapeHtml(label) +
      '">' +
      (currentText ? renderMarkdownInline(currentText) : "&nbsp;") +
      "</button>";
  } else if (!hideText) {
    textHtml = '<div class="runtime-flow-board-copy" dir="auto">' + renderMarkdownInline(currentText) + "</div>";
  }

  return (
    '<article class="runtime-flow-board-node" data-shape="' +
    escapeHtml(exposedShape) +
    '" data-role="' +
    escapeHtml(node?.role || "main") +
    '" style="' +
    escapeHtml(`left:${position.left}px;top:${position.top}px;`) +
    '">' +
    shapeHtml +
    textHtml +
    "</article>"
  );
}

function renderFlowchartChoicePrompt({ blockKey, targetId, choiceKind, title, selectedValue, options }) {
  return (
    '<section class="runtime-flow-prompt" data-flowchart-prompt="true" tabindex="-1">' +
    '<div class="runtime-flow-prompt-head"><span class="runtime-flow-prompt-badge">' +
    escapeHtml(title) +
    "</span></div>" +
    '<div class="token-options">' +
    (Array.isArray(options) ? options : []).map((item) => {
      const selected = normalizeInlineText(selectedValue) === item.value;
      return (
        '<button class="token-option' +
        (selected ? " active" : "") +
        '" type="button" dir="auto" data-action="flowchart-set-' +
        escapeHtml(choiceKind) +
        '" data-flowchart-block-key="' +
        escapeHtml(blockKey) +
        '" data-flowchart-target-id="' +
        escapeHtml(targetId) +
        '" data-flowchart-value="' +
        escapeHtml(item.value) +
        '">' +
        escapeHtml(item.value) +
        "</button>"
      );
    }).join("") +
    "</div></section>"
  );
}

function renderFlowchartPracticePrompt(blockKey, projection, exercise, prompt, renderOptions = {}) {
  if (!prompt?.kind || !prompt?.targetId) return "";
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];

  if (prompt.kind === "shape") {
    const node = nodes.find((item) => item?.id === prompt.targetId);
    if (!node) return "";
    const options = shuffleExerciseOptions(
      listFlowchartNodeShapeOptions(node),
      buildExerciseShuffleSeed(renderOptions, `${blockKey}::shape::${node.id}`)
    );
    return (
      '<section class="runtime-flow-prompt" data-flowchart-prompt="true" tabindex="-1">' +
      '<div class="runtime-flow-prompt-head"><span class="runtime-flow-prompt-badge">Símbolo</span></div>' +
      '<div class="runtime-flow-shape-grid">' +
      options.map((item) => {
        const selected = normalizeInlineText(exercise?.shapes?.[node.id]) === item.value;
        return (
          '<button class="runtime-flow-shape-option' +
          (selected ? " is-active" : "") +
          '" type="button" data-action="flowchart-set-shape" data-flowchart-block-key="' +
          escapeHtml(blockKey) +
          '" data-flowchart-target-id="' +
          escapeHtml(node.id) +
          '" data-flowchart-value="' +
          escapeHtml(item.value) +
          '" title="' +
          escapeHtml(getFlowchartShapeLabel(item.value)) +
          '" aria-label="' +
          escapeHtml(getFlowchartShapeLabel(item.value)) +
          '">' +
          renderFlowchartShapeSvg(item.value) +
          '<span class="tiny">' + escapeHtml(getFlowchartShapeLabel(item.value)) + "</span></button>"
        );
      }).join("") +
      "</div></section>"
    );
  }

  if (prompt.kind === "text") {
    const node = nodes.find((item) => item?.id === prompt.targetId);
    if (!node || !flowchartNodeUsesTextChoiceBlank(node)) return "";
    return renderFlowchartChoicePrompt({
      blockKey,
      targetId: node.id,
      choiceKind: "text",
      title: "Texto",
      selectedValue: String(exercise?.texts?.[node.id] || ""),
      options: shuffleExerciseOptions(
        listFlowchartNodeTextOptions(node),
        buildExerciseShuffleSeed(renderOptions, `${blockKey}::text::${node.id}`)
      )
    });
  }

  if (prompt.kind === "label") {
    const link = links.find((item) => item?.id === prompt.targetId);
    if (!link || !flowchartLinkUsesLabelChoiceBlank(link)) return "";
    return renderFlowchartChoicePrompt({
      blockKey,
      targetId: link.id,
      choiceKind: "label",
      title: "Rótulo",
      selectedValue: String(exercise?.labels?.[link.id] || ""),
      options: shuffleExerciseOptions(
        listFlowchartLinkLabelOptions(link),
        buildExerciseShuffleSeed(renderOptions, `${blockKey}::label::${link.id}`)
      )
    });
  }
  return "";
}

function renderFlowchartPracticeFeedback(blockKey, feedback) {
  if (!feedback) return "";
  if (feedback === "correct") return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  if (feedback === "incomplete") {
    return '<div class="inline-feedback warn"><p class="tiny">Preencha todas as lacunas do fluxograma.</p></div>';
  }
  return (
    '<div class="inline-feedback err has-actions"><p class="tiny">As respostas não correspondem ao fluxo esperado.</p>' +
    '<div class="feedback-icons">' +
    '<button class="icon-pill" type="button" data-action="flowchart-view-answer" data-flowchart-block-key="' +
    escapeHtml(blockKey) +
    '" title="Ver resposta" aria-label="Ver resposta">&#128065;</button>' +
    '<button class="icon-pill primary" type="button" data-action="flowchart-try-again" data-flowchart-block-key="' +
    escapeHtml(blockKey) +
    '" title="Tentar de novo" aria-label="Tentar de novo">&#8635;</button></div></div>'
  );
}

function renderFlowchartPracticePanel(blockKey, projection, exercise, prompt, renderOptions) {
  const promptHtml = renderFlowchartPracticePrompt(blockKey, projection, exercise, prompt, renderOptions);
  const feedbackHtml = renderFlowchartPracticeFeedback(blockKey, exercise?.feedback);
  if (!promptHtml && !feedbackHtml) return "";
  return '<div class="runtime-flow-practice-panel" data-flowchart-practice-panel="true">' +
    promptHtml + feedbackHtml + "</div>";
}

function buildFlowAccessibleDescription(nodes, links, options = {}) {
  const practiceEnabled = options.practiceEnabled === true;
  const exercise = options.exercise || null;
  const names = new Map();
  const nodeDescriptions = nodes.map((node, index) => {
    const textValue = practiceEnabled && node?.textBlank
      ? normalizeInlineText(exercise?.texts?.[node.id])
      : normalizeInlineText(node?.text);
    const name = textValue || `nó ${index + 1}`;
    names.set(node.id, name);
    const currentShape = practiceEnabled && node?.shapeBlank
      ? normalizeInlineText(exercise?.shapes?.[node.id])
      : normalizeInlineText(node?.shape);
    const shapeDescription = currentShape
      ? `símbolo ${getFlowchartShapeLabel(currentShape)}`
      : "símbolo a preencher";
    const textDescription = practiceEnabled && node?.textBlank && !textValue
      ? ", com texto a preencher"
      : "";
    return `${name}, ${shapeDescription}${textDescription}`;
  });
  const linkDescriptions = links.map((link) => {
    const from = names.get(link?.fromNodeId) || "origem não identificada";
    const to = names.get(link?.toNodeId) || "destino não identificado";
    const label = practiceEnabled && link?.labelBlank
      ? normalizeInlineText(exercise?.labels?.[link.id])
      : normalizeInlineText(link?.label);
    const labelDescription = practiceEnabled && link?.labelBlank && !label
      ? ", com rótulo a preencher"
      : label
        ? `, rótulo ${label}`
        : "";
    return `${from} leva a ${to}${labelDescription}`;
  });
  return [
    `Fluxograma com ${nodes.length} ${nodes.length === 1 ? "nó" : "nós"} e ${links.length} ${links.length === 1 ? "ligação" : "ligações"}.`,
    nodeDescriptions.length ? `Nós: ${nodeDescriptions.join("; ")}.` : "",
    linkDescriptions.length ? `Ligações: ${linkDescriptions.join("; ")}.` : ""
  ].filter(Boolean).join(" ");
}

function renderProjectedFlowchart(block, renderOptions = {}, blockKey = "flowchart") {
  const projection = renderOptions.flowchartProjectionByBlockKey?.[blockKey] || resolveRuntimeFlowchartProjection(block);
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];
  if (!nodes.length) {
    return '<div class="runtime-block runtime-flow-block"><p class="runtime-paragraph">Fluxograma vazio.</p></div>';
  }

  const layout = computeFlowchartBoardLayout(nodes, links);
  const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const linkById = Object.fromEntries(links.map((link) => [link.id, link]));
  const exercise = renderOptions.flowchartExerciseStateByBlockKey?.[blockKey] || null;
  const prompt = renderOptions.activeFlowchartPrompt?.blockKey === blockKey
    ? renderOptions.activeFlowchartPrompt
    : null;
  const practiceEnabled = Boolean(
    renderOptions.enableFlowchartPractice &&
    exercise &&
    flowchartProjectionHasPractice(projection)
  );
  const accessibleDescription = buildFlowAccessibleDescription(nodes, links, {
    practiceEnabled,
    exercise
  });
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts)
    ? renderOptions.dockExerciseParts
    : null;
  const practicePanelHtml = practiceEnabled
    ? renderFlowchartPracticePanel(blockKey, projection, exercise, prompt, renderOptions)
    : "";
  if (practicePanelHtml && dockExerciseParts) dockExerciseParts.push(practicePanelHtml);
  const viewportScale = Number(layout.defaultViewportScale || 1);
  const scaledWidth = Math.max(1, Math.round(layout.width * viewportScale));
  const scaledHeight = Math.max(1, Math.round(layout.height * viewportScale));
  const routeEntries = layout.routes.map((route) => ({
    ...route,
    link: route?.link?.id
      ? { ...route.link, ...(linkById[route.link.id] || {}) }
      : route.link
  }));
  const routesSvg = routeEntries
    .map((route) => renderFlowchartRoute(
      route,
      nodeById[route?.link?.fromNodeId],
      nodeById[route?.link?.toNodeId],
      layout,
      practiceEnabled
    ))
    .join("");
  const arrowsSvg = routeEntries
    .map((route) => renderFlowchartArrowOverlay(route, nodeById[route?.link?.fromNodeId], nodeById[route?.link?.toNodeId], layout))
    .join("");
  const labelsHtml = practiceEnabled
    ? routeEntries.map((route) => renderFlowchartInteractiveLabel(route, exercise, blockKey, prompt)).join("")
    : "";
  const nodesHtml = layout.nodes.map((node) => renderFlowchartBoardNode(
    { ...node, ...(node?.id ? nodeById[node.id] : null) },
    layout,
    { practiceEnabled, exercise, blockKey, prompt }
  )).join("");

  return (
    '<div class="runtime-block runtime-flow-block runtime-flow-board-block"' + renderTextAttributes(block) + '>' +
    (block?.prompt ? `<p class="runtime-tree-prompt"${renderTextAttributes(block)}>${renderMarkdownInline(block.prompt)}</p>` : "") +
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
    '<div class="runtime-flow-board" role="group" aria-label="' +
    escapeHtmlAttribute(accessibleDescription) +
    '" data-flowchart-scroll="true" data-flowchart-scale="' +
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
    nodesHtml + labelsHtml +
    "</div>" +
    '<svg class="runtime-flow-board-svg runtime-flow-board-arrows" viewBox="0 0 ' +
    escapeHtml(layout.width) +
    " " +
    escapeHtml(layout.height) +
    '" aria-hidden="true" focusable="false">' +
    arrowsSvg +
    "</svg>" +
    "</div></div></div>" +
    (practicePanelHtml && !dockExerciseParts ? practicePanelHtml : "") +
    "</div></div>"
  );
}

function renderFlowBlock(block, renderOptions, blockKey) {
  return renderProjectedFlowchart(block, renderOptions, blockKey);
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

function buildTreeAccessibleDescription(block, roots = []) {
  const entries = [];
  let maxDepth = 0;
  const visit = (nodes, depth, parentLabel = "") => {
    nodes.forEach((node) => {
      maxDepth = Math.max(maxDepth, depth);
      entries.push(parentLabel ? node.label + ", sob " + parentLabel : node.label + ", raiz");
      visit(node.children, depth + 1, node.label);
    });
  };
  visit(roots, 1);
  const parts = [
    normalizeInlineText(block?.prompt),
    "Árvore com " + entries.length + " " + (entries.length === 1 ? "nó" : "nós") +
      " em " + maxDepth + " " + (maxDepth === 1 ? "nível" : "níveis") + ".",
    entries.length ? "Hierarquia: " + entries.join("; ") + "." : ""
  ];
  return parts.filter(Boolean).join(" ");
}

function renderRuntimeTreeList(nodes = [], depth = 1, textMetadata = null, gapContext = null) {
  if (!Array.isArray(nodes) || !nodes.length) {
    return "";
  }
  return (
    '<ul class="runtime-tree-list" role="group">' +
    nodes.map((node, index) => {
      const hasChildren = node.children.length > 0;
      const structuralRole = node.type === "folder" ? "branch" : "leaf";
      const childHtml = renderRuntimeTreeList(node.children, depth + 1, textMetadata, gapContext);
      const gapHtml = renderResourceGapField(
        gapContext,
        `nodes[${node.order}].label`,
        renderMarkdownInline,
        "runtime-tree-gap-blank"
      );
      const accessibleLabel = resolveResourceGapField(
        gapContext,
        `nodes[${node.order}].label`,
        node.label
      );
      return (
        '<li class="runtime-tree-item" data-node-id="' +
        escapeHtml(node.id) +
        '" data-node-role="' +
        structuralRole +
        '" role="treeitem" aria-level="' +
        depth +
        '" aria-posinset="' +
        (index + 1) +
        '" aria-setsize="' +
        nodes.length +
        (hasChildren ? '" aria-expanded="true' : "") +
        '" aria-label="' +
        escapeHtmlAttribute(accessibleLabel + ", " + (structuralRole === "branch" ? "ramo" : "folha") + ", nível " + depth) +
        '">' +
        '<div class="runtime-tree-entry">' +
        '<span class="runtime-tree-node-chip">' +
        (structuralRole === "branch" ? "ramo" : "folha") +
        "</span>" +
        '<span class="runtime-tree-node-label"' + renderTextAttributes(textMetadata) + '>' +
        (gapHtml ?? escapeHtml(node.label)) +
        "</span></div>" +
        childHtml +
        "</li>"
      );
    }).join("") +
    "</ul>"
  );
}

function renderTreeBlock(block, renderOptions = {}, blockKey = "runtime-tree") {
  const roots = buildRuntimeTreeNodes(block?.nodes);
  const gapContext = prepareResourceGapRender(block, renderOptions, blockKey);
  const accessibleRoots = buildRuntimeTreeNodes(
    (Array.isArray(block?.nodes) ? block.nodes : []).map((node, index) => ({
      ...node,
      label: resolveResourceGapField(gapContext, `nodes[${index}].label`, node?.label)
    }))
  );
  const accessibleDescription = buildTreeAccessibleDescription(block, accessibleRoots);
  const bodyHtml = (
    '<div class="runtime-block runtime-tree-block"' + renderTextAttributes(block) + '>' +
    (block?.prompt ? `<p class="runtime-tree-prompt"${renderTextAttributes(block)}>${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-tree-structure" role="tree" aria-label="' +
    escapeHtmlAttribute(accessibleDescription) +
    '">' +
    renderRuntimeTreeList(roots, 1, block, gapContext) +
    "</div></div>"
  );
  return finishResourceGapRender(bodyHtml, gapContext);
}

function renderFormulaExpression(
  node,
  notation = "mathematics",
  gapContext = null,
  path = "expression"
) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return "<mtext>Expressão inválida</mtext>";
  }
  const type = String(node.type || "");
  const value = resolveResourceGapField(gapContext, `${path}.value`, node.value);
  if (type === "number") return `<mn>${escapeHtml(value)}</mn>`;
  if (type === "identifier") {
    const variant = notation === "chemistry" ? ' mathvariant="normal"' : "";
    return `<mi${variant}>${escapeHtml(value)}</mi>`;
  }
  if (type === "operator") return `<mo>${escapeHtml(value)}</mo>`;
  if (type === "text") return `<mtext>${escapeHtml(value)}</mtext>`;
  if (type === "row") {
    return `<mrow>${(Array.isArray(node.children) ? node.children : [])
      .map((child, index) => renderFormulaExpression(
        child,
        notation,
        gapContext,
        `${path}.children[${index}]`
      ))
      .join("")}</mrow>`;
  }
  if (type === "fraction") {
    return `<mfrac>${renderFormulaExpression(
      node.numerator,
      notation,
      gapContext,
      `${path}.numerator`
    )}${renderFormulaExpression(
      node.denominator,
      notation,
      gapContext,
      `${path}.denominator`
    )}</mfrac>`;
  }
  if (type === "root") {
    const radicand = renderFormulaExpression(
      node.radicand,
      notation,
      gapContext,
      `${path}.radicand`
    );
    return node.index === undefined
      ? `<msqrt>${radicand}</msqrt>`
      : `<mroot>${radicand}${renderFormulaExpression(
        node.index,
        notation,
        gapContext,
        `${path}.index`
      )}</mroot>`;
  }
  if (type === "superscript") {
    return `<msup>${renderFormulaExpression(
      node.base,
      notation,
      gapContext,
      `${path}.base`
    )}${renderFormulaExpression(
      node.exponent,
      notation,
      gapContext,
      `${path}.exponent`
    )}</msup>`;
  }
  if (type === "subscript") {
    return `<msub>${renderFormulaExpression(
      node.base,
      notation,
      gapContext,
      `${path}.base`
    )}${renderFormulaExpression(
      node.subscript,
      notation,
      gapContext,
      `${path}.subscript`
    )}</msub>`;
  }
  if (type === "subsup") {
    return `<msubsup>${renderFormulaExpression(
      node.base,
      notation,
      gapContext,
      `${path}.base`
    )}${renderFormulaExpression(
      node.subscript,
      notation,
      gapContext,
      `${path}.subscript`
    )}${renderFormulaExpression(
      node.superscript,
      notation,
      gapContext,
      `${path}.superscript`
    )}</msubsup>`;
  }
  if (type === "fenced") {
    return '<mrow><mo fence="true">' + escapeHtml(node.open) + "</mo>" +
      renderFormulaExpression(node.content, notation, gapContext, `${path}.content`) +
      '<mo fence="true">' + escapeHtml(node.close) + "</mo></mrow>";
  }
  return "<mtext>Expressão inválida</mtext>";
}

function renderFormulaBlock(block, renderOptions = {}, blockKey = "runtime-formula") {
  const gapContext = prepareResourceGapRender(block, renderOptions, blockKey);
  const accessibleText = resolveResourceGapText(
    String(block?.accessibleText || "Fórmula").trim() || "Fórmula",
    gapContext?.values || []
  );
  const notation = block?.notation === "chemistry" ? "chemistry" : "mathematics";
  const bodyHtml = (
    '<div class="runtime-block runtime-formula-block" data-formula-notation="' + escapeHtmlAttribute(notation) + '"' + renderTextAttributes(block) + '>' +
    (block?.prompt ? `<p class="runtime-formula-prompt"${renderTextAttributes(block)}>${renderMarkdownInline(block.prompt)}</p>` : "") +
    '<div class="runtime-formula-wrap">' +
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" role="math" aria-label="' + escapeHtmlAttribute(accessibleText) + '">' +
    '<semantics>' + renderFormulaExpression(block?.expression, notation, gapContext) +
    '<annotation encoding="text/plain">' + escapeHtml(accessibleText) + "</annotation>" +
    "</semantics></math></div>" +
    renderStructuredGapPanel(gapContext) +
    "</div>"
  );
  return finishResourceGapRender(bodyHtml, gapContext);
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
    return '<h3 class="runtime-block runtime-heading"' + renderTextAttributes(block) + '>' + renderMarkdownInline(block.value || "") + "</h3>";
  }
  if (block.kind === "after") {
    return "";
  }
  if (block.kind === "paragraph") {
    if (!blockUsesTextGapExercise(block)) {
      return '<div class="runtime-block runtime-paragraph"' + renderTextAttributes(block) + '>' + renderMarkdownParagraph(block.value || "", block) + "</div>";
    }
    const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
    const values = Array.isArray(exercise?.values) ? exercise.values : [];
    const feedback = exercise?.feedback || null;
    const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
    const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
    const bodyRenderOptions = feedbackHtml && dockExerciseParts ? { ...renderOptions, suppressTextGapPrompt: true } : renderOptions;
    const bodyHtml =
      '<div class="runtime-block runtime-paragraph-gap-block"' + renderTextAttributes(block) + '>' +
      '<p class="runtime-block runtime-paragraph runtime-text-gap-paragraph"' + renderTextAttributes(block) + '>' +
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
  if (block.kind === "table") return renderTableBlock(block, renderOptions, blockKey);
  if (block.kind === "flow") return renderFlowBlock(block, renderOptions, blockKey);
  if (block.kind === "tree") return renderTreeBlock(block, renderOptions, blockKey);
  if (block.kind === "graph") return renderGraphBlock(block, renderOptions, blockKey);
  if (block.kind === "relation_map") return renderRelationMapBlock(block, renderOptions, blockKey);
  if (block.kind === "matrix") return renderMatrixBlock(block, renderOptions, blockKey);
  if (block.kind === "plane") return renderPlaneBlock(block, renderOptions, blockKey);
  if (block.kind === "formula") return renderFormulaBlock(block, renderOptions, blockKey);
  return "";
}

export function renderRuntimeBlockList(blocks, fallbackText = "Sem conteúdo.", renderOptions = {}) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  if (!safeBlocks.length) {
    return '<p class="runtime-paragraph" dir="auto">' + escapeHtml(fallbackText) + "</p>";
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
    matrix: "card-matrix",
    formula: "card-formula"
  };
  const kind = getContractCardKind(card) || "paragraph";
  const cardClass = cardClassByKind[kind] || `card-${escapeHtml(kind)}`;
  return (
    '<article class="card ' +
    cardClass +
    '" data-card-id="' +
    escapeHtml(card?.id || `card-${Number(card?.position) || 0}`) +
    '"' + renderTextAttributes(card) + '>' +
    '<header class="card-head"><h4' + renderTextAttributes(card) + '>' +
    escapeHtml(card?.title || "Card") +
    "</h4></header>" +
    '<div class="card-body"' + renderTextAttributes(card) + '>' +
    renderCardRuntimeBlocks(card, { omitRepeatedHeading: true }) +
    "</div></article>"
  );
}
