import { resolveCardRuntime, sanitizePopupBlocks } from "../core/cardRuntime.js";
import { getContractCardKind } from "../contract/contractCard.js";
import {
  cloneDirectoryTreeNodes,
  directoryTreePracticeNeedsName,
  DIRECTORY_TREE_BASE_NODE_ID,
  getDirectoryTreePathLabels,
  normalizeDirectoryTreeBase,
  normalizeDirectoryTreeNodeType,
  normalizeDirectoryTreePractice,
  resolveDirectoryTreePracticeExpectedType
} from "../core/directoryTree.js";
import { getExerciseOptionStableId, shuffleExerciseOptions } from "../core/exerciseOptions.js";
import { computeFlowchartBoardLayout } from "../flowchart/flowchartLayout.js";
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
import { getFlowchartShapeLabel, renderFlowchartShapeSvg, normalizeFlowchartShapeKey } from "../flowchart/flowchartShapes.js";

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

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function formatMatrixSequenceName(name) {
  const label = normalizeInlineText(name);
  return label.replace(/\s*([+×*])\s*/g, " $1 ").replace(/\s+/g, " ").trim();
}

function formatMatrixSequenceConnector(connector) {
  const normalizedConnector = normalizeInlineText(connector);
  if (normalizedConnector === "=>") return "⇒";
  if (normalizedConnector === "->") return "→";
  if (normalizedConnector === "*") return "×";
  return normalizedConnector;
}

function isMatrixSequenceRelationConnector(connector) {
  return ["=", "⇒", "→"].includes(formatMatrixSequenceConnector(connector));
}

function formatMatrixSequenceLeadExpression(sequence) {
  if (!Array.isArray(sequence) || sequence.length < 2) {
    return "";
  }

  const relationIndex = sequence.findIndex((item, index) => index > 0 && isMatrixSequenceRelationConnector(item?.connector || "="));
  if (relationIndex > 0) {
    const relationConnector = formatMatrixSequenceConnector(sequence[relationIndex]?.connector || "=");
    const relationName = formatMatrixSequenceName(sequence[relationIndex]?.name);
    if (relationName) {
      return `${relationName} ${relationConnector}`;
    }

    const terms = [];
    const firstName = formatMatrixSequenceName(sequence[0]?.name);
    if (firstName) {
      terms.push(firstName);
    }
    for (let index = 1; index < relationIndex; index += 1) {
      const connectorText = formatMatrixSequenceConnector(sequence[index]?.connector || "");
      const name = formatMatrixSequenceName(sequence[index]?.name);
      if (connectorText) terms.push(connectorText);
      if (name) terms.push(name);
    }
    return terms.length ? `${terms.join(" ")} ${relationConnector}` : "";
  }

  const terms = sequence
    .map((item, index) => {
      const connectorText = index > 0 ? formatMatrixSequenceConnector(item?.connector || "") : "";
      const name = formatMatrixSequenceName(item?.name);
      return [connectorText, name].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return terms.join(" ");
}

function sanitizeDomId(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "runtime";
}

function renderMarkdownInlineMarkup(text) {
  return escapeHtml(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
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
    if (!paragraphLines.length) {
      return;
    }
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
    const line = String(rawLine || "");
    const trimmed = line.trim();

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

function buildExerciseShuffleSeed(renderOptions, scope) {
  const baseSeed = String(renderOptions?.exerciseShuffleSeed || "runtime");
  return `${baseSeed}::${scope}`;
}

function normalizeChoiceSelectionIds(options, rawSelected) {
  const list = Array.isArray(options) ? options : [];
  return new Set(
    (Array.isArray(rawSelected) ? rawSelected : [])
      .map((item) => {
        if (Number.isInteger(item) && item >= 0 && item < list.length) {
          return getExerciseOptionStableId(list[item], item);
        }
        return String(item || "").trim();
      })
      .filter(Boolean)
  );
}

function parseTextGapParts(text) {
  const source = String(text || "");
  const parts = [];
  let index = 0;
  let blankIndex = 0;

  while (index < source.length) {
    const start = source.indexOf("[[", index);
    if (start < 0) {
      const tail = source.slice(index);
      if (tail) parts.push({ kind: "text", value: tail });
      break;
    }

    if (start > index) {
      parts.push({ kind: "text", value: source.slice(index, start) });
    }

    const end = source.indexOf("]]", start + 2);
    if (end < 0) {
      parts.push({ kind: "text", value: source.slice(start) });
      break;
    }

    const expected = source.slice(start + 2, end);
    const delimiterIndex = expected.indexOf("::");
    const answer = delimiterIndex >= 0 ? expected.slice(0, delimiterIndex) : expected;
    const options =
      delimiterIndex >= 0
        ? expected
            .slice(delimiterIndex + 2)
            .split("|")
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
    parts.push({ kind: "blank", expected: answer, options, index: blankIndex });
    blankIndex += 1;
    index = end + 2;
  }

  return parts;
}

function getMatrixBlockItems(block) {
  if (Array.isArray(block?.sequence) && block.sequence.length) {
    return block.sequence;
  }
  return [block];
}

function blockUsesTextGapExercise(block) {
  if (!block || typeof block !== "object") {
    return false;
  }

  if (block.kind === "complete" || block.kind === "paragraph") {
    return parseTextGapParts(block.kind === "complete" ? block.text : block.value).some((part) => part.kind === "blank");
  }

  if (block.kind === "editor") {
    return parseTextGapParts(block.value).some((part) => part.kind === "blank");
  }

  if (block.kind === "table") {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    return rows.some((row) =>
      (Array.isArray(row) ? row : []).some((cell) =>
        parseTextGapParts(cell?.value || "").some((part) => part.kind === "blank")
      )
    );
  }

  if (block.kind === "plane") {
    return parseTextGapParts(block.resultText || "").some((part) => part.kind === "blank");
  }

  if (block.kind === "matrix") {
    return getMatrixBlockItems(block).some((item) => {
      const rows = Array.isArray(item?.values) ? item.values : [];
      return rows.some((row) =>
        (Array.isArray(row) ? row : []).some((cell) =>
          parseTextGapParts(cell?.value || "").some((part) => part.kind === "blank")
        )
      )
    });
  }

  return false;
}

function getTextGapSource(block) {
  if (block?.kind === "complete") {
    return String(block?.text || "");
  }
  if (block?.kind === "paragraph" || block?.kind === "editor") {
    return String(block?.value || "");
  }
  if (block?.kind === "plane") {
    return String(block?.resultText || "");
  }
  return "";
}

function getTextGapAnswers(block) {
  if (!block || typeof block !== "object") {
    return [];
  }

  if (block.kind === "table") {
    const answers = [];
    const rows = Array.isArray(block.rows) ? block.rows : [];
    rows.forEach((row) => {
      (Array.isArray(row) ? row : []).forEach((cell) => {
        parseTextGapParts(cell?.value || "").forEach((part) => {
          if (part.kind === "blank") {
            answers.push(part.expected);
          }
        });
      });
    });
    return answers;
  }

  if (block.kind === "matrix") {
    const answers = [];
    getMatrixBlockItems(block).forEach((item) => {
      const rows = Array.isArray(item?.values) ? item.values : [];
      rows.forEach((row) => {
        (Array.isArray(row) ? row : []).forEach((cell) => {
          parseTextGapParts(cell?.value || "").forEach((part) => {
            if (part.kind === "blank") {
              answers.push(part.expected);
            }
          });
        });
      });
    });
    return answers;
  }

  return parseTextGapParts(getTextGapSource(block))
    .filter((part) => part.kind === "blank")
    .map((part) => part.expected);
}

function renderTextGapChoicePrompt(blockKey, part, value, renderOptions = {}) {
  const options = shuffleExerciseOptions(
    (Array.isArray(part?.options) ? part.options : []).map((item) => ({ value: item })),
    buildExerciseShuffleSeed(renderOptions, `${blockKey}::gap::${part?.index ?? 0}`)
  );
  return (
    '<section class="runtime-flow-prompt" data-text-gap-prompt="true">' +
    '<div class="runtime-flow-prompt-head">' +
    '<span class="runtime-flow-prompt-badge">Opções</span></div>' +
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
  const safeValue = rawValue ? escapeHtml(rawValue) : "";
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
      safeValue +
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
    safeValue +
    "</span>"
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
        if (markdownState) {
          return renderedChunk;
        }
        return '<span class="runtime-text-gap-chunk">' + renderedChunk + "</span>";
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

function renderTextGapFeedback(blockKey, feedback) {
  if (!feedback) {
    return "";
  }

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

function renderFlowStep(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  const [kind] = Object.keys(item);
  if (!kind) {
    return "";
  }

  const value = item[kind];
  if (kind === "if") {
    const thenBranch = Array.isArray(item.then) ? item.then.map(renderFlowStep).join("") : "";
    const elseBranch = Array.isArray(item.else) ? item.else.map(renderFlowStep).join("") : "";
    return (
      '<details class="runtime-flow-branch" open>' +
      '<summary class="runtime-flow-node runtime-flow-node-decision">' +
      renderMarkdownInline(value) +
      "</summary>" +
      (thenBranch ? '<div class="runtime-flow-branch-group"><div class="runtime-flow-branch-label">Sim</div>' + thenBranch + "</div>" : "") +
      (elseBranch ? '<div class="runtime-flow-branch-group"><div class="runtime-flow-branch-label">Não</div>' + elseBranch + "</div>" : "") +
      "</details>"
    );
  }

  const kindLabelByType = {
    start: "Início",
    end: "Fim",
    process: "Processo",
    input: "Entrada",
    output: "Saída",
    while: "Enquanto",
    do_while: "Repita",
    switch: "Escolha",
    for: "Para"
  };

  return (
    '<span class="runtime-flow-node" data-kind="' +
    escapeHtml(kind) +
    '">' +
    '<span class="runtime-flow-node-kind">' +
    escapeHtml(kindLabelByType[kind] || kind) +
    "</span>" +
    '<span class="runtime-flow-node-text">' +
    renderMarkdownInline(typeof value === "string" ? value : JSON.stringify(value)) +
    "</span>" +
    "</span>"
  );
}

function renderFlowchartBlock(block, renderOptions = {}, blockKey = "flowchart") {
  if (block?.projection?.nodes?.length) {
    return renderProjectedFlowchart(block, renderOptions, blockKey);
  }

  if (block?.structure && block?.structure.kind === "sequence") {
    return renderFlowchartStructure(block);
  }

  const items = Array.isArray(block?.flow) ? block.flow : [];
  if (!items.length) {
    return '<div class="runtime-block runtime-flow-block"><p class="runtime-paragraph">Fluxograma vazio.</p></div>';
  }

  const flowItems = items
    .map((item) => renderFlowStep(item))
    .filter(Boolean)
    .join('<span class="runtime-flow-arrow">→</span>');

  return '<div class="runtime-block runtime-flow-block">' + flowItems + "</div>";
}

function renderProjectedFlowchart(block, renderOptions = {}, blockKey = "flowchart") {
  const projection = block?.projection;
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];

  if (!nodes.length) {
    return '<div class="runtime-block runtime-flow-block"><p class="runtime-paragraph">Fluxograma vazio.</p></div>';
  }

  const layout = computeFlowchartBoardLayout(nodes, links);
  const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const linkById = Object.fromEntries(links.map((link) => [link.id, link]));
  const viewportScale = Number(layout.defaultViewportScale || 1);
  const scaledWidth = Math.max(1, Math.round(layout.width * viewportScale));
  const scaledHeight = Math.max(1, Math.round(layout.height * viewportScale));
  const exercise = renderOptions.flowchartExerciseStateByBlockKey?.[blockKey] || null;
  const prompt =
    renderOptions.activeFlowchartPrompt?.blockKey === blockKey
      ? renderOptions.activeFlowchartPrompt
      : null;
  const practiceEnabled = !!(
    renderOptions.enableFlowchartPractice &&
    exercise &&
    flowchartProjectionHasPractice(projection)
  );
  const dockParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const validationError =
    block?.projectionValid === false || block?.structureValid === false
      ? '<p class="runtime-flow-warning">Estrutura de fluxograma inválida para este card.</p>'
      : "";
  const routeEntries = layout.routes.map((route) => ({
    ...route,
    link: route?.link?.id ? { ...route.link, ...linkById[route.link.id] } : route.link
  }));
  const routesSvg = routeEntries
    .map((route) =>
      renderFlowchartRoute(route, {
        practiceEnabled,
        targetNode: nodeById[route?.link?.toNodeId]
      })
    )
    .join("");
  const arrowsSvg = routeEntries
    .map((route) => renderFlowchartArrowOverlay(route, nodeById[route?.link?.toNodeId]))
    .filter(Boolean)
    .join("");
  const labelsHtml = practiceEnabled
    ? layout.routes
        .map((route) =>
          renderFlowchartInteractiveLabel(
            {
              ...route,
              link: route?.link?.id ? { ...route.link, ...linkById[route.link.id] } : route.link
            },
            exercise,
            blockKey,
            prompt
          )
        )
        .join("")
    : "";
  const nodesHtml = layout.nodes
    .map((node) =>
      renderFlowchartBoardNode(
        {
          ...node,
          ...(node?.id ? nodeById[node.id] : null)
        },
        layout,
        { practiceEnabled, exercise, blockKey, prompt }
      )
    )
    .join("");

  const practicePanelHtml = practiceEnabled
    ? renderFlowchartPracticePanel(blockKey, projection, exercise, prompt, renderOptions)
    : "";
  if (dockParts && practicePanelHtml) {
    dockParts.push(practicePanelHtml);
  }

  return (
    '<div class="runtime-block runtime-flow-block runtime-flow-board-block">' +
    validationError +
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
    '<svg class="runtime-flow-board-svg runtime-flow-board-arrows" viewBox="0 0 ' +
    escapeHtml(layout.width) +
    " " +
    escapeHtml(layout.height) +
    '" aria-hidden="true" focusable="false">' +
    arrowsSvg +
    "</svg>" +
    '<div class="runtime-flow-board-surface">' +
    labelsHtml +
    nodesHtml +
    "</div></div></div></div>" +
    "</div>" +
    (practicePanelHtml && !dockParts ? practicePanelHtml : "") +
    "</div>"
  );
}

function getFlowchartArrowGeometry(start, end, targetNode) {
  if (!Array.isArray(start) || !Array.isArray(end)) {
    return null;
  }

  const dx = Number(end[0] || 0) - Number(start[0] || 0);
  const dy = Number(end[1] || 0) - Number(start[1] || 0);
  const length = Math.hypot(dx, dy);
  if (length < 0.5) {
    return null;
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const targetShapeKey = normalizeFlowchartShapeKey(targetNode?.shape);
  const headOnlyTarget = targetShapeKey === "connector" || targetShapeKey === "page_connector";
  const maxHeadLength = 8;
  const maxHeadHalfWidth = 4;
  const headTipOffset = headOnlyTarget ? 5 : 6;
  const headLength = Math.min(maxHeadLength, Math.max(4, length * 0.7));
  const headHalfWidth = Math.min(maxHeadHalfWidth, Math.max(2.5, headLength * 0.48));
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

function getFlowchartDisplayedRoutePoints(route, targetNode) {
  const points = (Array.isArray(route?.points) ? route.points : []).map((point) => [Number(point[0] || 0), Number(point[1] || 0)]);
  if (points.length < 2) {
    return points;
  }

  for (let index = points.length - 1; index > 0; index -= 1) {
    const geometry = getFlowchartArrowGeometry(points[index - 1], points[index], targetNode);
    if (!geometry) {
      continue;
    }
    points[index] = [Math.round(geometry.baseX * 10) / 10, Math.round(geometry.baseY * 10) / 10];
    break;
  }

  return points;
}

function renderFlowchartRoute(route, options = {}) {
  const points = getFlowchartDisplayedRoutePoints(route, options.targetNode);
  if (points.length < 2) {
    return "";
  }

  const label = String(route?.label || route?.link?.label || "").trim();
  const labelPos = route?.labelPos;

  const skipLabelButton = !!(options.practiceEnabled && route?.link?.labelBlank);

  const routePoints = points.map((point) => `${Math.round(Number(point[0]) || 0)},${Math.round(Number(point[1]) || 0)}`).join(" ");

  return (
    '<polyline class="runtime-flow-route" data-link-role="' +
    escapeHtml(route?.link?.role || "next") +
    '" points="' +
    escapeHtml(routePoints) +
    '"></polyline>' +
    (!skipLabelButton && label && labelPos
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

function renderFlowchartArrowOverlay(route, targetNode) {
  const points = Array.isArray(route?.points) ? route.points : [];
  if (points.length < 2) {
    return "";
  }

  for (let index = points.length - 1; index > 0; index -= 1) {
    const end = points[index];
    const start = points[index - 1];
    const geometry = getFlowchartArrowGeometry(start, end, targetNode);
    if (!geometry) continue;
    const tailLength = geometry.headOnlyTarget ? 0 : Math.max(0, geometry.length - geometry.headLength);
    const lineStartX = geometry.baseX - geometry.unitX * tailLength;
    const lineStartY = geometry.baseY - geometry.unitY * tailLength;
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
      '">' +
      '<polygon points="' +
      headPoints.map((point) => `${point[0]},${point[1]}`).join(" ") +
      '"></polygon></g>'
    );
  }

  return "";
}

function renderFlowchartInteractiveLabel(route, exercise, blockKey, prompt) {
  const link = route?.link;
  const labelPos = route?.labelPos;
  if (!link?.labelBlank || !labelPos) {
    return "";
  }

  const currentValue = String(exercise?.labels?.[link.id] || "").trim();
  const isActive = prompt?.kind === "label" && prompt?.targetId === link.id;
  const anchorClass =
    labelPos.anchor === "start"
      ? " is-anchor-start"
      : labelPos.anchor === "end"
        ? " is-anchor-end"
        : "";

  if (flowchartLinkUsesLabelInputBlank(link)) {
    return (
      '<input class="runtime-flow-label-button runtime-flow-label-input practice-marked is-blank-input' +
      (currentValue ? " is-filled" : "") +
      (isActive ? " is-active" : "") +
      anchorClass +
      '" type="text" data-flowchart-inline-input="true" data-flowchart-block-key="' +
      escapeHtml(blockKey) +
      '" data-flowchart-target-id="' +
      escapeHtml(link.id) +
      '" data-flowchart-choice-kind="label" style="left:' +
      escapeHtml(labelPos.x) +
      "px;top:" +
      escapeHtml(labelPos.y) +
      'px;" value="' +
      escapeHtml(currentValue) +
      '" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Preencher rótulo da ligação">'
    );
  }

  return (
    '<button class="runtime-flow-label-button practice-marked is-blank-choice' +
    (currentValue ? " is-filled" : "") +
    (!currentValue ? " is-placeholder" : "") +
    (isActive ? " is-active" : "") +
    anchorClass +
    '" type="button" data-action="flowchart-open-label" data-flowchart-block-key="' +
    escapeHtml(blockKey) +
    '" data-flowchart-target-id="' +
    escapeHtml(link.id) +
    '" style="left:' +
    escapeHtml(labelPos.x) +
    "px;top:" +
    escapeHtml(labelPos.y) +
    'px;">' +
    (currentValue ? escapeHtml(currentValue) : "&nbsp;") +
    "</button>"
  );
}

function renderFlowchartBoardNode(node, layout, options = {}) {
  const position = layout.positions[node.id];
  if (!position) {
    return "";
  }

  const practiceEnabled = !!options.practiceEnabled;
  const exercise = options.exercise || null;
  const prompt = options.prompt || null;
  const currentShape = practiceEnabled && node.shapeBlank
    ? String(exercise?.shapes?.[node.id] || "").trim()
    : String(node.shape || "").trim();
  const currentText = practiceEnabled && node.textBlank
    ? String(exercise?.texts?.[node.id] || "").trim()
    : String(node.text || "").trim();
  const textBlankMode = node.textBlank ? (flowchartNodeUsesTextChoiceBlank(node) ? "choice" : "input") : "";
  const normalizedShape = currentShape || node.shape;
  const shapeActive = prompt?.kind === "shape" && prompt?.targetId === node.id;
  const textActive = prompt?.kind === "text" && prompt?.targetId === node.id;
  const textUsesInput = flowchartNodeUsesTextInputBlank(node);
  const shapeMarkup =
    currentShape
      ? renderFlowchartShapeSvg(normalizedShape || node.shape)
      : '<div class="runtime-flow-shape-placeholder" aria-hidden="true"></div>';

  return (
    '<article class="runtime-flow-board-node" data-shape="' +
    escapeHtml(node.shape) +
    '" data-role="' +
    escapeHtml(node.role || "main") +
    '" style="' +
    escapeHtml(`left:${position.left}px;top:${position.top}px;`) +
    '">' +
    (practiceEnabled && node.shapeBlank
      ? '<button class="runtime-flow-board-shape runtime-flow-board-shape-button practice-marked' +
        (shapeActive ? " is-active" : "") +
        (currentShape ? " is-filled" : "") +
        '" type="button" data-action="flowchart-open-shape" data-flowchart-block-key="' +
        escapeHtml(options.blockKey) +
        '" data-flowchart-target-id="' +
        escapeHtml(node.id) +
        '" aria-label="' +
        escapeHtml(currentShape ? getFlowchartShapeLabel(normalizedShape || node.shape) : "Escolher símbolo") +
        '">' +
        shapeMarkup +
        "</button>"
      : '<div class="runtime-flow-board-shape" aria-label="' +
        escapeHtml(getFlowchartShapeLabel(normalizedShape || node.shape)) +
        '">' +
        renderFlowchartShapeSvg(normalizedShape || node.shape) +
        "</div>") +
    (practiceEnabled && node.textBlank && textUsesInput
      ? '<input class="runtime-flow-board-copy runtime-flow-inline-input runtime-flow-board-copy-input' +
        (textActive ? " is-active" : "") +
        (currentText ? " is-filled" : "") +
        ' practice-marked is-blank-input" type="text" data-flowchart-inline-input="true" data-flowchart-block-key="' +
        escapeHtml(options.blockKey) +
        '" data-flowchart-target-id="' +
        escapeHtml(node.id) +
        '" data-flowchart-choice-kind="text" value="' +
        escapeHtml(currentText) +
        '" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="' +
        escapeHtml(currentText ? "Editar texto" : "Preencher texto") +
        '">'
      : practiceEnabled && node.textBlank
      ? '<button class="runtime-flow-board-copy runtime-flow-board-copy-button' +
        (textActive ? " is-active" : "") +
        (currentText ? " is-filled" : "") +
        ' practice-marked' +
        (textBlankMode ? " is-blank-" + textBlankMode : "") +
        '" type="button" data-action="flowchart-open-text" data-flowchart-block-key="' +
        escapeHtml(options.blockKey) +
        '" data-flowchart-target-id="' +
        escapeHtml(node.id) +
        '" title="' +
        escapeHtml(currentText ? "Editar texto" : "Preencher texto") +
        '" aria-label="' +
        escapeHtml(currentText ? "Editar texto" : "Preencher texto") +
        '">' +
        (currentText ? renderMarkdownInline(currentText) : "&nbsp;") +
        "</button>"
      : '<div class="runtime-flow-board-copy">' +
        renderMarkdownInline(currentText || "") +
        "</div>") +
    "</article>"
  );
}

function renderFlowchartPracticePanel(blockKey, projection, exercise, prompt, renderOptions = {}) {
  const promptHtml = renderFlowchartPracticePrompt(blockKey, projection, exercise, prompt, renderOptions);
  const feedbackHtml = renderFlowchartPracticeFeedback(blockKey, exercise?.feedback);

  if (!promptHtml && !feedbackHtml) {
    return "";
  }

  return (
    '<div class="runtime-flow-practice-panel" data-flowchart-practice-panel="true">' +
    promptHtml +
    feedbackHtml +
    "</div>"
  );
}

function renderFlowchartPracticePrompt(blockKey, projection, exercise, prompt, renderOptions = {}) {
  if (!prompt?.kind || !prompt?.targetId) {
    return "";
  }

  // Mantém o picker sempre visível sem exigir rolagem do quadro.
  // Preserva o popup fixo dentro do contêiner do fluxograma.
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];

  if (prompt.kind === "shape") {
    const node = nodes.find((item) => item?.id === prompt.targetId);
    if (!node) {
      return "";
    }

    const options = shuffleExerciseOptions(
      listFlowchartNodeShapeOptions(node),
      buildExerciseShuffleSeed(renderOptions, `${blockKey}::shape::${node.id}`)
    );
    return (
      '<section class="runtime-flow-prompt" data-flowchart-prompt="true">' +
      '<div class="runtime-flow-prompt-head">' +
      '<span class="runtime-flow-prompt-badge">Símbolo</span>' +
      "</div>" +
      '<div class="runtime-flow-shape-grid">' +
      options
        .map((item) => {
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
            '">' +
            renderFlowchartShapeSvg(item.value) +
            '<span class="tiny">' +
            escapeHtml(getFlowchartShapeLabel(item.value)) +
            "</span></button>"
          );
        })
        .join("") +
      "</div></section>"
    );
  }

  if (prompt.kind === "text") {
    const node = nodes.find((item) => item?.id === prompt.targetId);
    if (!node) {
      return "";
    }

    if (flowchartNodeUsesTextChoiceBlank(node)) {
      const options = shuffleExerciseOptions(
        listFlowchartNodeTextOptions(node),
        buildExerciseShuffleSeed(renderOptions, `${blockKey}::text::${node.id}`)
      );
      return renderFlowchartChoicePrompt({
        blockKey,
        targetId: node.id,
        choiceKind: "text",
        title: "Texto",
        selectedValue: String(exercise?.texts?.[node.id] || ""),
        options
      });
    }

    return "";
  }

  if (prompt.kind === "label") {
    const link = links.find((item) => item?.id === prompt.targetId);
    if (!link) {
      return "";
    }

    if (flowchartLinkUsesLabelChoiceBlank(link)) {
      const options = shuffleExerciseOptions(
        listFlowchartLinkLabelOptions(link),
        buildExerciseShuffleSeed(renderOptions, `${blockKey}::label::${link.id}`)
      );
      return renderFlowchartChoicePrompt({
        blockKey,
        targetId: link.id,
        choiceKind: "label",
        title: "Rótulo",
        selectedValue: String(exercise?.labels?.[link.id] || ""),
        options
      });
    }

    if (flowchartLinkUsesLabelInputBlank(link)) {
      return "";
    }
  }

  return "";
}

function renderFlowchartChoicePrompt({ blockKey, targetId, choiceKind, title, selectedValue, options }) {
  return (
    '<section class="runtime-flow-prompt" data-flowchart-prompt="true">' +
    '<div class="runtime-flow-prompt-head">' +
    '<span class="runtime-flow-prompt-badge">' +
    escapeHtml(title) +
    "</span></div>" +
    '<div class="token-options">' +
    (Array.isArray(options) ? options : [])
      .map((item) => {
        const selected = normalizeInlineText(selectedValue) === item.value;
        return (
          '<button class="token-option' +
          (selected ? " active" : "") +
          '" type="button" data-action="flowchart-set-' +
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
      })
      .join("") +
    "</div></section>"
  );
}

function renderFlowchartPracticeFeedback(blockKey, feedback) {
  if (!feedback) {
    return "";
  }

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
    '<button class="icon-pill" type="button" data-action="flowchart-view-answer" data-flowchart-block-key="' +
    escapeHtml(blockKey) +
    '" title="Ver resposta" aria-label="Ver resposta">&#128065;</button>' +
    '<button class="icon-pill primary" type="button" data-action="flowchart-try-again" data-flowchart-block-key="' +
    escapeHtml(blockKey) +
    '" title="Tentar de novo" aria-label="Tentar de novo">&#8635;</button>' +
    "</div></div>"
  );
}

function renderFlowchartStructure(block) {
  const validationError =
    block?.structureValid === false
      ? '<p class="runtime-flow-warning">Estrutura de fluxograma inválida para este card.</p>'
      : "";
  const items = Array.isArray(block?.structure?.items) ? block.structure.items : [];

  return (
    '<div class="runtime-block runtime-flow-block runtime-flow-structure-block">' +
    validationError +
    (items.length
      ? '<div class="runtime-flow-sequence">' + items.map((item) => renderFlowchartStructureNode(item)).join("") + "</div>"
      : '<p class="runtime-paragraph">Fluxograma vazio.</p>') +
    "</div>"
  );
}

function renderFlowchartStructureNode(node) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (["start", "end", "input", "output", "process"].includes(node.kind)) {
    return (
      '<div class="runtime-flow-node-card" data-kind="' +
      escapeHtml(node.kind) +
      '">' +
      '<div class="runtime-flow-node-kind">' +
      escapeHtml(getFlowNodeKindLabel(node.kind)) +
      "</div>" +
      '<div class="runtime-flow-node-copy">' +
      renderMarkdownInline(node.text || "") +
      "</div></div>"
    );
  }

  if (node.kind === "if_then" || node.kind === "if_then_else") {
    return (
      '<details class="runtime-flow-branch-card" open>' +
      '<summary class="runtime-flow-branch-summary">' +
      '<span class="runtime-flow-branch-kind">Decisão</span>' +
      '<span class="runtime-flow-branch-condition">' +
      renderMarkdownInline(node.condition || "") +
      "</span></summary>" +
      renderFlowBranchGroup("Sim", node.thenBranch) +
      (node.kind === "if_then_else" ? renderFlowBranchGroup("Não", node.elseBranch) : "") +
      "</details>"
    );
  }

  if (node.kind === "while" || node.kind === "do_while") {
    const label = node.kind === "while" ? "Enquanto" : "Repita até";
    return (
      '<details class="runtime-flow-branch-card" open>' +
      '<summary class="runtime-flow-branch-summary">' +
      '<span class="runtime-flow-branch-kind">' +
      escapeHtml(label) +
      "</span>" +
      '<span class="runtime-flow-branch-condition">' +
      renderMarkdownInline(node.condition || "") +
      "</span></summary>" +
      renderFlowBranchGroup("Corpo", node.body) +
      "</details>"
    );
  }

  if (node.kind === "for") {
    const signature = [node.init, node.condition, node.update].filter(Boolean).join(" ; ");
    return (
      '<details class="runtime-flow-branch-card" open>' +
      '<summary class="runtime-flow-branch-summary">' +
      '<span class="runtime-flow-branch-kind">Para</span>' +
      '<span class="runtime-flow-branch-condition">' +
      renderMarkdownInline(signature || node.condition || "") +
      "</span></summary>" +
      renderFlowBranchGroup("Corpo", node.body) +
      "</details>"
    );
  }

  if (node.kind === "if_chain") {
    const cases = Array.isArray(node.cases) ? node.cases : [];
    return (
      '<details class="runtime-flow-branch-card" open>' +
      '<summary class="runtime-flow-branch-summary">' +
      '<span class="runtime-flow-branch-kind">Cadeia de decisões</span>' +
      "</summary>" +
      cases
        .map((caseItem, index) =>
          renderFlowBranchGroup(index === 0 ? "Se" : "Senão se", caseItem?.thenBranch, caseItem?.condition || "")
        )
        .join("") +
      renderFlowBranchGroup("Senão", node.elseBranch) +
      "</details>"
    );
  }

  if (node.kind === "switch_case") {
    const cases = Array.isArray(node.cases) ? node.cases : [];
    return (
      '<details class="runtime-flow-branch-card" open>' +
      '<summary class="runtime-flow-branch-summary">' +
      '<span class="runtime-flow-branch-kind">Escolha</span>' +
      '<span class="runtime-flow-branch-condition">' +
      renderMarkdownInline(node.expression || "") +
      "</span></summary>" +
      cases
        .map((caseItem) => renderFlowBranchGroup(`Caso ${caseItem?.match || ""}`, caseItem?.body))
        .join("") +
      renderFlowBranchGroup("Padrão", node.defaultBranch) +
      "</details>"
    );
  }

  return "";
}

function renderFlowBranchGroup(label, items, condition = "") {
  const safeItems = Array.isArray(items) ? items : [];
  return (
    '<section class="runtime-flow-branch-group">' +
    '<div class="runtime-flow-branch-label">' +
    escapeHtml(label) +
    (condition ? ": " + renderMarkdownInline(condition) : "") +
    "</div>" +
    (safeItems.length
      ? '<div class="runtime-flow-sequence nested">' + safeItems.map((item) => renderFlowchartStructureNode(item)).join("") + "</div>"
      : '<p class="runtime-paragraph">Sem etapas.</p>') +
    "</section>"
  );
}

function getFlowNodeKindLabel(kind) {
  const kindLabelByType = {
    start: "Início",
    end: "Fim",
    process: "Processo",
    input: "Entrada",
    output: "Saída"
  };
  return kindLabelByType[kind] || kind;
}

function buildPlaneGeometry(block) {
  const xRange = Array.isArray(block?.xRange) ? block.xRange : [-1, 1];
  const yRange = Array.isArray(block?.yRange) ? block.yRange : [-1, 1];
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const unit = 44;
  const plotLeft = 52;
  const plotTop = 38;
  const plotRight = 58;
  const plotBottom = 42;
  const plotWidth = Math.max(2, xMax - xMin) * unit;
  const plotHeight = Math.max(2, yMax - yMin) * unit;
  const width = plotLeft + plotWidth + plotRight;
  const height = plotTop + plotHeight + plotBottom;

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
    width,
    height,
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
  if (tone === "guide") return "#9f8b6c";
  return "#f2c96d";
}

function renderPlaneGrid(geometry) {
  const verticalLines = [];
  for (let x = geometry.xMin + 1; x <= geometry.xMax - 1; x += 1) {
    const px = geometry.xToPx(x);
    verticalLines.push(
      '<line x1="' +
      px +
      '" y1="' +
      geometry.plotTop +
      '" x2="' +
      px +
      '" y2="' +
      (geometry.plotTop + geometry.plotHeight) +
      '" />'
    );
  }

  const horizontalLines = [];
  for (let y = geometry.yMin + 1; y <= geometry.yMax - 1; y += 1) {
    const py = geometry.yToPx(y);
    horizontalLines.push(
      '<line x1="' +
      geometry.plotLeft +
      '" y1="' +
      py +
      '" x2="' +
      (geometry.plotLeft + geometry.plotWidth) +
      '" y2="' +
      py +
      '" />'
    );
  }

  return verticalLines.concat(horizontalLines).join("");
}

function renderPlaneAxisLabels(geometry) {
  const xLabelY =
    geometry.yMin <= 0 && geometry.yMax >= 0
      ? geometry.yToPx(0) + 24
      : geometry.plotTop + geometry.plotHeight + 22;
  const yLabelX =
    geometry.xMin <= 0 && geometry.xMax >= 0
      ? geometry.xToPx(0) - 12
      : geometry.plotLeft - 12;

  const xLabels = [];
  for (let x = geometry.xMin; x <= geometry.xMax; x += 1) {
    xLabels.push(
      '<text class="runtime-plane-tick" x="' +
      geometry.xToPx(x) +
      '" y="' +
      xLabelY +
      '" text-anchor="middle" dominant-baseline="hanging">' +
      escapeHtml(formatRuntimeMathNumber(x)) +
      "</text>"
    );
  }

  const yLabels = [];
  for (let y = geometry.yMin; y <= geometry.yMax; y += 1) {
    if (y === 0 && geometry.xMin <= 0 && geometry.xMax >= 0) {
      continue;
    }
    yLabels.push(
      '<text class="runtime-plane-tick" x="' +
      yLabelX +
      '" y="' +
      geometry.yToPx(y) +
      '" text-anchor="end" dominant-baseline="middle">' +
      escapeHtml(formatRuntimeMathNumber(y)) +
      "</text>"
    );
  }

  return xLabels.join("") + yLabels.join("");
}

function renderPlaneAxes(geometry, markerIdBase) {
  const plotRight = geometry.plotLeft + geometry.plotWidth;
  const plotBottom = geometry.plotTop + geometry.plotHeight;
  const parts = [];
  if (geometry.yMin <= 0 && geometry.yMax >= 0) {
    parts.push(
      '<line class="runtime-plane-axis" x1="' +
      geometry.plotLeft +
      '" y1="' +
      geometry.yToPx(0) +
      '" x2="' +
      (plotRight + 12) +
      '" y2="' +
      geometry.yToPx(0) +
      '" marker-end="url(#' +
      markerIdBase +
      '-axis)" />' +
      '<text class="runtime-plane-axis-label" x="' +
      (plotRight + 30) +
      '" y="' +
      (geometry.yToPx(0) + 1) +
      '" text-anchor="middle" dominant-baseline="middle">x</text>'
    );
  }
  if (geometry.xMin <= 0 && geometry.xMax >= 0) {
    parts.push(
      '<line class="runtime-plane-axis" x1="' +
      geometry.xToPx(0) +
      '" y1="' +
      plotBottom +
      '" x2="' +
      geometry.xToPx(0) +
      '" y2="' +
      (geometry.plotTop - 14) +
      '" marker-end="url(#' +
      markerIdBase +
      '-axis)" />' +
      '<text class="runtime-plane-axis-label" x="' +
      geometry.xToPx(0) +
      '" y="' +
      (geometry.plotTop - 28) +
      '" text-anchor="middle" dominant-baseline="middle">y</text>'
    );
  }
  return parts.join("");
}

function renderPlaneCoordinatePair(pair) {
  return `(${formatRuntimeMathNumber(Number(pair?.[0] || 0))}, ${formatRuntimeMathNumber(Number(pair?.[1] || 0))})`;
}

function renderPlaneLegendLabel(item) {
  const label = String(item?.label || "").trim();
  if (!label) {
    return "";
  }

  if (item?.role === "result") {
    return label;
  }

  if (Array.isArray(item?.from) && Array.isArray(item?.to)) {
    const vectorValue = [
      Number(item.to[0] || 0) - Number(item.from[0] || 0),
      Number(item.to[1] || 0) - Number(item.from[1] || 0)
    ];
    return /[=(]/.test(label) ? label : `${label} = ${renderPlaneCoordinatePair(vectorValue)}`;
  }

  if (Array.isArray(item?.at)) {
    return `${label} = ${renderPlaneCoordinatePair(item.at)}`;
  }

  return label;
}

function renderPlaneLegend(block) {
  const items = [
    ...(Array.isArray(block?.vectors) ? block.vectors : []),
    ...(Array.isArray(block?.points) ? block.points : [])
  ]
    .map((item) => ({
      tone: item?.tone || "primary",
      label: renderPlaneLegendLabel(item)
    }))
    .filter((item) => item.label);

  if (!items.length) {
    return "";
  }

  return (
    '<div class="runtime-plane-legend" aria-label="Legenda do plano">' +
    items
      .map((item) => (
        '<span class="runtime-plane-legend-item tone-' +
        escapeHtml(item.tone) +
        '">' +
        '<span class="runtime-plane-legend-swatch" aria-hidden="true"></span>' +
        '<span class="runtime-plane-legend-label">' +
        escapeHtml(item.label) +
        "</span></span>"
      ))
      .join("") +
    "</div>"
  );
}

function renderPlaneNote(block) {
  const note = normalizeInlineText(block?.note);
  if (!note) {
    return "";
  }
  return '<div class="runtime-plane-note">' + escapeHtml(note) + "</div>";
}

function renderPlaneBlock(block, renderOptions = {}, blockKey = "runtime-plane") {
  const geometry = buildPlaneGeometry(block);
  const usesTextGap = blockUsesTextGapExercise(block);
  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
  const values = Array.isArray(exercise?.values) ? exercise.values : [];
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
  const bodyRenderOptions = feedbackHtml && dockExerciseParts
    ? { ...renderOptions, suppressTextGapPrompt: true }
    : renderOptions;
  const markerIdBase = sanitizeDomId(`${blockKey}-plane`);

  const defs =
    '<defs>' +
    ['axis', 'primary', 'secondary', 'tertiary', 'quaternary', 'result']
      .map((tone) => {
        const fill = tone === "axis" ? "#f2d79d" : getPlaneToneColor(tone);
        return (
          '<marker id="' +
          markerIdBase +
          "-" +
          tone +
          '" markerWidth="4.8" markerHeight="4.8" refX="4.2" refY="2.4" orient="auto" markerUnits="strokeWidth">' +
          '<path d="M0,0 L4.8,2.4 L0,4.8 z" fill="' +
          fill +
          '" /></marker>'
        );
      })
      .join("") +
    "</defs>";

  const segments = (Array.isArray(block?.segments) ? block.segments : [])
    .map((segment) => (
      '<line class="runtime-plane-segment tone-' +
      escapeHtml(segment?.tone || "guide") +
      (segment?.dashed ? " is-dashed" : "") +
      '" x1="' +
      geometry.xToPx(segment?.from?.[0] || 0) +
      '" y1="' +
      geometry.yToPx(segment?.from?.[1] || 0) +
      '" x2="' +
      geometry.xToPx(segment?.to?.[0] || 0) +
      '" y2="' +
      geometry.yToPx(segment?.to?.[1] || 0) +
      '" />'
    ))
    .join("");

  const vectors = (Array.isArray(block?.vectors) ? block.vectors : [])
    .map((vector) => {
      const markerName = markerIdBase + "-" + sanitizeDomId(vector?.tone || "primary");
      return (
        '<g class="runtime-plane-vector tone-' +
        escapeHtml(vector?.tone || "primary") +
        (vector?.dashed ? " is-dashed" : "") +
        '">' +
        '<line x1="' +
        geometry.xToPx(vector?.from?.[0] || 0) +
        '" y1="' +
        geometry.yToPx(vector?.from?.[1] || 0) +
        '" x2="' +
        geometry.xToPx(vector?.to?.[0] || 0) +
        '" y2="' +
        geometry.yToPx(vector?.to?.[1] || 0) +
        '" marker-end="url(#' +
        markerName +
        ')" />' +
        '<circle class="runtime-plane-point tone-' +
        escapeHtml(vector?.tone || "primary") +
        '" cx="' +
        geometry.xToPx(vector?.to?.[0] || 0) +
        '" cy="' +
        geometry.yToPx(vector?.to?.[1] || 0) +
        '" r="3.6" />' +
        "</g>"
      );
    })
    .join("");

  const points = (Array.isArray(block?.points) ? block.points : [])
    .map((point) => (
      '<g class="runtime-plane-point-group tone-' +
      escapeHtml(point?.tone || "primary") +
      '">' +
      '<circle class="runtime-plane-point tone-' +
      escapeHtml(point?.tone || "primary") +
      '" cx="' +
      geometry.xToPx(point?.at?.[0] || 0) +
      '" cy="' +
      geometry.yToPx(point?.at?.[1] || 0) +
      '" r="4.2" />' +
      "</g>"
    ))
    .join("");

  const originVisible = geometry.xMin <= 0 && geometry.xMax >= 0 && geometry.yMin <= 0 && geometry.yMax >= 0;
  const resultParts = parseTextGapParts(block?.resultText || "");
  const resultHtml = block?.resultText
    ? '<div class="runtime-plane-result">' +
      (usesTextGap
        ? renderTextGapParts(resultParts, blockKey, values, renderMarkdownInline, "runtime-text-gap-blank runtime-plane-gap-blank", bodyRenderOptions)
        : renderMarkdownInline(block.resultText)) +
      "</div>"
    : "";
  const legendHtml = renderPlaneLegend(block);
  const noteHtml = renderPlaneNote(block);

  const bodyHtml =
    '<div class="runtime-block runtime-plane-block" data-plane-mode="' +
    escapeHtml(block?.mode || "") +
    '">' +
    '<div class="runtime-plane-wrap">' +
    '<svg class="runtime-plane-svg" viewBox="0 0 ' +
    geometry.width +
    " " +
    geometry.height +
    '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plano cartesiano">' +
    defs +
    '<rect class="runtime-plane-surface" x="' +
    geometry.plotLeft +
    '" y="' +
    geometry.plotTop +
    '" width="' +
    geometry.plotWidth +
    '" height="' +
    geometry.plotHeight +
    '" rx="14" ry="14" />' +
    '<g class="runtime-plane-grid">' +
    renderPlaneGrid(geometry) +
    "</g>" +
    '<rect class="runtime-plane-frame" x="' +
    geometry.plotLeft +
    '" y="' +
    geometry.plotTop +
    '" width="' +
    geometry.plotWidth +
    '" height="' +
    geometry.plotHeight +
    '" rx="14" ry="14" />' +
    renderPlaneAxes(geometry, markerIdBase) +
    renderPlaneAxisLabels(geometry) +
    segments +
    vectors +
    points +
    (originVisible
      ? '<circle class="runtime-plane-origin" cx="' +
        geometry.xToPx(0) +
        '" cy="' +
        geometry.yToPx(0) +
        '" r="3.8" />'
      : "") +
    "</svg>" +
    legendHtml +
    noteHtml +
    resultHtml +
    "</div>";

  if (!usesTextGap) {
    return bodyHtml + "</div>";
  }
  if (feedbackHtml && dockExerciseParts) {
    dockExerciseParts.push(feedbackHtml);
    return bodyHtml + "</div>";
  }
  return bodyHtml + feedbackHtml + "</div>";
}

function buildRuntimeGraphEdgeKey(from, to) {
  return [String(from || ""), String(to || "")].sort().join("::");
}

function formatGraphCoordinate(value) {
  return Number(Number(value || 0).toFixed(2));
}

function buildGraphVertexLabelParts(vertex) {
  const id = normalizeInlineText(vertex?.id);
  const label = normalizeInlineText(vertex?.label || id);
  const compactLabel = label.replace(/\s+/g, " ").trim();
  if (!compactLabel) {
    return {
      innerLabel: id || "",
      outerLabel: ""
    };
  }
  if (!id || compactLabel === id || compactLabel.length <= 4) {
    return {
      innerLabel: compactLabel,
      outerLabel: ""
    };
  }
  return {
    innerLabel: id,
    outerLabel: compactLabel
  };
}

function buildGraphEdgeGeometry(from, to, edge, vertexRadius = 7.8) {
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
    startX: formatGraphCoordinate(startX),
    startY: formatGraphCoordinate(startY),
    endX: formatGraphCoordinate(endX),
    endY: formatGraphCoordinate(endY),
    controlX: formatGraphCoordinate(controlX),
    controlY: formatGraphCoordinate(controlY),
    labelX: formatGraphCoordinate(labelX),
    labelY: formatGraphCoordinate(labelY),
    path: offset === 0
      ? `M ${formatGraphCoordinate(startX)} ${formatGraphCoordinate(startY)} L ${formatGraphCoordinate(endX)} ${formatGraphCoordinate(endY)}`
      : `M ${formatGraphCoordinate(startX)} ${formatGraphCoordinate(startY)} Q ${formatGraphCoordinate(controlX)} ${formatGraphCoordinate(controlY)} ${formatGraphCoordinate(endX)} ${formatGraphCoordinate(endY)}`
  };
}

function readGraphEdgeDisplayText(edge) {
  const label = normalizeInlineText(edge?.label);
  if (label) {
    return label;
  }
  const weight = normalizeInlineText(edge?.weight);
  return weight;
}

function renderGraphBlock(block) {
  const vertices = Array.isArray(block?.vertices) ? block.vertices : [];
  const edges = Array.isArray(block?.edges) ? block.edges : [];
  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const ariaLabel = normalizeInlineText(block?.ariaLabel || block?.summaryText) || "Grafo matemático";

  const edgesHtml = edges
    .map((edge, index) => {
      const from = vertexMap.get(edge?.from);
      const to = vertexMap.get(edge?.to);
      if (!from || !to) {
        return "";
      }
      const geometry = buildGraphEdgeGeometry(from, to, edge);
      const labelText = readGraphEdgeDisplayText(edge);
      const pillWidth = Math.max(12, Math.min(30, labelText.length * 4.8 + 8));
      const labelHtml = labelText
        ? '<g class="runtime-graph-edge-label" transform="translate(' +
          geometry.labelX +
          " " +
          geometry.labelY +
          ')">' +
          '<rect x="' +
          Number((-pillWidth / 2).toFixed(2)) +
          '" y="-7.5" width="' +
          Number(pillWidth.toFixed(2)) +
          '" height="15" rx="7.5" ry="7.5" fill="var(--surface-raised, rgba(255,255,255,0.96))" stroke="var(--card-border-soft, rgba(15,23,42,0.14))" stroke-width="0.7"></rect>' +
          '<text text-anchor="middle" dominant-baseline="middle" y="0.5" fill="var(--text-strong, currentColor)" font-size="5.1" font-weight="600">' +
          escapeHtml(labelText) +
          "</text></g>"
        : "";

      return (
        '<g class="runtime-graph-edge-group' +
        (edge?.highlighted ? " is-highlighted" : "") +
        '" data-edge-key="' +
        escapeHtml(buildRuntimeGraphEdgeKey(edge?.from, edge?.to) || `edge-${index}`) +
        '">' +
        '<path class="runtime-graph-edge' +
        (edge?.highlighted ? " is-highlighted" : "") +
        '" d="' +
        escapeHtmlAttribute(geometry.path) +
        '" stroke="' +
        (edge?.highlighted ? "var(--accent-strong, #0f766e)" : "var(--card-border-strong, currentColor)") +
        '" stroke-width="' +
        (edge?.highlighted ? "2.6" : "1.9") +
        '" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>' +
        labelHtml +
        "</g>"
      );
    })
    .join("");

  const verticesHtml = vertices
    .map((vertex) => {
      const { innerLabel, outerLabel } = buildGraphVertexLabelParts(vertex);
      const outerLabelY = Number(vertex?.y) <= 24 ? 14.5 : -11.5;
      return (
      '<g class="runtime-graph-vertex-group' +
      (vertex?.highlighted ? " is-highlighted" : "") +
      '" transform="translate(' +
      escapeHtml(vertex?.x) +
      " " +
      escapeHtml(vertex?.y) +
      ')">' +
      '<circle class="runtime-graph-vertex' +
      (vertex?.highlighted ? " is-highlighted" : "") +
      '" cx="0" cy="0" r="7.8" fill="' +
      (vertex?.highlighted ? "var(--accent-soft, rgba(15,118,110,0.14))" : "var(--surface-raised, rgba(255,255,255,0.96))") +
      '" stroke="' +
      (vertex?.highlighted ? "var(--accent-strong, #0f766e)" : "var(--card-border-strong, currentColor)") +
      '" stroke-width="' +
      (vertex?.highlighted ? "2.2" : "1.7") +
      '"></circle>' +
      '<text class="runtime-graph-vertex-label" text-anchor="middle" dominant-baseline="central" y="0.5" fill="var(--text-strong, currentColor)" font-size="5.4" font-weight="700">' +
      escapeHtml(innerLabel || vertex?.id || "") +
      "</text>" +
      (outerLabel
        ? '<text class="runtime-graph-vertex-name" text-anchor="middle" y="' +
          outerLabelY +
          '" fill="var(--text-muted, currentColor)" font-size="3.6" font-weight="600">' +
          escapeHtml(outerLabel) +
          "</text>"
        : "") +
      "</g>"
    );
    })
    .join("");

  const legend = block?.summaryText
    ? '<div class="runtime-graph-caption">' + renderMarkdownInline(block.summaryText) + "</div>"
    : "";

  return (
    '<div class="runtime-block runtime-graph-block">' +
    '<div class="runtime-graph-wrap">' +
    '<svg class="runtime-graph-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
    escapeHtmlAttribute(ariaLabel) +
    '">' +
    '<title>' +
    escapeHtml(ariaLabel) +
    "</title>" +
    '<rect class="runtime-graph-surface" x="4" y="4" width="92" height="92" rx="18" ry="18" fill="var(--surface-subtle, rgba(148,163,184,0.08))" stroke="var(--card-border-soft, rgba(15,23,42,0.14))" stroke-width="0.8"></rect>' +
    edgesHtml +
    verticesHtml +
    "</svg>" +
    legend +
    "</div></div>"
  );
}

function renderMatrixBlock(block, renderOptions = {}, blockKey = "runtime-matrix") {
  const usesTextGap = blockUsesTextGapExercise(block);
  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
  const values = Array.isArray(exercise?.values) ? exercise.values : [];
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
  const bodyRenderOptions = feedbackHtml && dockExerciseParts
    ? { ...renderOptions, suppressTextGapPrompt: true }
    : renderOptions;
  const sequence = Array.isArray(block?.sequence) && block.sequence.length ? block.sequence : null;
  let nextBlankIndex = 0;

  function renderMatrixShell(matrixItem) {
    const highlightCells = new Set((Array.isArray(matrixItem?.highlightCells) ? matrixItem.highlightCells : []).map((item) => String(item)));
    const rowCount = Number(matrixItem?.rowCount || 0);
    const columnCount = Number(matrixItem?.columnCount || 0);
    const dividerAfterColumn = Number.isInteger(matrixItem?.dividerAfterColumn) ? matrixItem.dividerAfterColumn : null;
    const displayColumns = columnCount + (dividerAfterColumn ? 1 : 0);
    const cellsHtml = (Array.isArray(matrixItem?.values) ? matrixItem.values : [])
      .map((row, rowIndex) =>
        (Array.isArray(row) ? row : [])
          .map((cell, columnIndex) => {
            const scopedColumn = columnIndex + 1 + (dividerAfterColumn && columnIndex + 1 > dividerAfterColumn ? 1 : 0);
            const parts = parseTextGapParts(cell?.value || "");
            const highlightClass = highlightCells.has(`${rowIndex}:${columnIndex}`) ? " is-highlighted" : "";
            const body =
              usesTextGap && parts.some((part) => part.kind === "blank")
                ? renderTextGapParts(
                    parts.map((part) => (part.kind === "blank" ? { ...part, index: nextBlankIndex++ } : part)),
                    blockKey,
                    values,
                    renderMarkdownInline,
                    "runtime-text-gap-blank runtime-matrix-gap-blank",
                    bodyRenderOptions
                  )
                : renderMarkdownInline(cell?.value || "");

            return (
              '<div class="runtime-matrix-cell' +
              highlightClass +
              '" style="grid-column:' +
              scopedColumn +
              ";grid-row:" +
              (rowIndex + 1) +
              ';">' +
              body +
              "</div>"
            );
          })
          .join("")
      )
      .join("");
    const dividerHtml = dividerAfterColumn
      ? '<div class="runtime-matrix-divider" style="grid-column:' +
        (dividerAfterColumn + 1) +
        ';grid-row:1 / span ' +
        rowCount +
        ';"></div>'
      : "";

    return (
      '<div class="runtime-matrix-shell">' +
      '<div class="runtime-matrix-bracket is-left" aria-hidden="true"></div>' +
      '<div class="runtime-matrix-grid" style="--matrix-columns:' +
      displayColumns +
      ";--matrix-rows:" +
      rowCount +
      ';">' +
      dividerHtml +
      cellsHtml +
      "</div>" +
      '<div class="runtime-matrix-bracket is-right" aria-hidden="true"></div>' +
      "</div>"
    );
  }

  function renderMatrixSequenceItem(matrixItem, index) {
    const connector = index > 0 ? formatMatrixSequenceConnector(matrixItem?.connector || "=") : "";
    const label = formatMatrixSequenceName(matrixItem?.name);
    return (
      '<div class="runtime-matrix-sequence-group"' +
      (label ? ' aria-label="' + escapeHtmlAttribute(label) + '"' : "") +
      ">" +
      (connector ? '<div class="runtime-matrix-sequence-operator" aria-hidden="true">' + escapeHtml(connector) + "</div>" : "") +
      '<div class="runtime-matrix-item">' +
      renderMatrixShell(matrixItem) +
      "</div></div>"
    );
  }

  const sequenceLeadExpression = sequence ? formatMatrixSequenceLeadExpression(sequence) : "";
  const equationHtml = sequence
    ? (sequenceLeadExpression ? '<div class="runtime-matrix-sequence-prefix">' + escapeHtml(sequenceLeadExpression) + "</div>" : "") +
      sequence
        .map((matrixItem, index) => renderMatrixSequenceItem(matrixItem, index))
        .join("")
    : (block?.name ? '<div class="runtime-matrix-name">' + escapeHtml(block.name) + " =</div>" : "") + renderMatrixShell(block);

  const bodyHtml =
    '<div class="runtime-block runtime-matrix-block">' +
    '<div class="runtime-matrix-wrap">' +
    '<div class="runtime-matrix-equation' +
    (sequence ? " is-sequence" : "") +
    '">' +
    equationHtml +
    "</div></div></div>";

  if (!usesTextGap) {
    return bodyHtml;
  }
  if (feedbackHtml && dockExerciseParts) {
    dockExerciseParts.push(feedbackHtml);
    return bodyHtml;
  }
  return bodyHtml + feedbackHtml;
}

function renderTableBlock(block, renderOptions = {}, blockKey = "runtime-table") {
  const title = normalizeInlineText(block?.title);
  const focusLabel = normalizeInlineText(block?.focusLabel);
  const usesTextGap = blockUsesTextGapExercise(block);
  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
  const values = Array.isArray(exercise?.values) ? exercise.values : [];
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
  const bodyRenderOptions = feedbackHtml && dockExerciseParts
    ? { ...renderOptions, suppressTextGapPrompt: true }
    : renderOptions;
  let nextBlankIndex = 0;
  const headers = (Array.isArray(block?.headers) ? block.headers : [])
    .map((header) =>
      '<th' + (header?.focused ? ' class="is-focused-column"' : "") + ">" + renderMarkdownInline(header?.value || "") + "</th>"
    )
    .join("");
  const rows = (Array.isArray(block?.rows) ? block.rows : [])
    .map((row) => {
      const cells = (Array.isArray(row) ? row : [])
        .map((cell) => {
          const cellClassNames = [
            cell?.focusedRow ? "is-focused-row" : "",
            cell?.focusedColumn ? "is-focused-column" : "",
            cell?.focusedRow && cell?.focusedColumn ? "is-focus-intersection" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const parts = parseTextGapParts(cell?.value || "");
          if (!usesTextGap || !parts.some((part) => part.kind === "blank")) {
            return "<td" + (cellClassNames ? ' class="' + cellClassNames + '"' : "") + ">" + renderMarkdownInline(cell?.value || "") + "</td>";
          }

          const scopedParts = parts.map((part) =>
            part.kind === "blank"
              ? { ...part, index: nextBlankIndex++ }
              : part
          );
          return (
            '<td' + (cellClassNames ? ' class="' + cellClassNames + '"' : "") + '><div class="runtime-table-cell-gap">' +
            renderTextGapParts(scopedParts, blockKey, values, renderMarkdownInline, "runtime-text-gap-blank runtime-table-gap-blank", bodyRenderOptions) +
            "</div></td>"
          );
        })
        .join("");
      return "<tr>" + cells + "</tr>";
    })
    .join("");

  const bodyHtml =
    '<div class="runtime-block runtime-table-block">' +
    (title ? '<div class="runtime-table-title">' + renderMarkdownInline(title) + "</div>" : "") +
    (focusLabel ? '<div class="runtime-table-focus-label">' + renderMarkdownInline(focusLabel) + "</div>" : "") +
    '<div class="runtime-table-wrap"><div class="runtime-table-frame"><table class="runtime-table">' +
    (headers ? "<thead><tr>" + headers + "</tr></thead>" : "") +
    "<tbody>" +
    rows +
    "</tbody></table></div></div>";

  if (!usesTextGap) {
    return bodyHtml + "</div>";
  }

  if (feedbackHtml && dockExerciseParts) {
    dockExerciseParts.push(feedbackHtml);
    return bodyHtml + "</div>";
  }

  return bodyHtml + feedbackHtml + "</div>";
}

function renderMultipleChoiceFeedback(feedback, blockKey) {
  if (!feedback) {
    return "";
  }

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

function renderCompleteBlock(block, renderOptions = {}, blockKey = "runtime-complete") {
  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
  const blanks = parseTextGapParts(block?.text || "");
  const values = Array.isArray(exercise?.values) ? exercise.values : [];
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
  const bodyRenderOptions = feedbackHtml && dockExerciseParts
    ? { ...renderOptions, suppressTextGapPrompt: true }
    : renderOptions;

  const bodyHtml =
    '<div class="runtime-block runtime-complete-block">' +
    '<p class="runtime-complete-text">' +
    renderTextGapParts(blanks, blockKey, values, renderMarkdownInline, "runtime-text-gap-blank runtime-complete-blank", bodyRenderOptions) +
    "</p>";

  if (feedbackHtml && dockExerciseParts) {
    dockExerciseParts.push(feedbackHtml);
    return bodyHtml + "</div>";
  }

  return bodyHtml + feedbackHtml + "</div>";
}

function renderMultipleChoiceBlock(block, renderOptions = {}, blockKey = "runtime-choice") {
  const exercise = renderOptions.choiceExerciseStateByBlockKey?.[blockKey] || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const options = (Array.isArray(block?.options) ? block.options : []).map((option, index) => ({
    option,
    optionId: getExerciseOptionStableId(option, index)
  }));
  const displayOptions = shuffleExerciseOptions(options, buildExerciseShuffleSeed(renderOptions, `choice::${blockKey}`));
  const selected = new Set(
    (Array.isArray(exercise?.selected) ? exercise.selected : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
  const feedback = exercise?.feedback || null;
  const feedbackHtml = renderMultipleChoiceFeedback(feedback, blockKey);

  const optionsHtml = displayOptions
    .map(({ option, optionId }) => {
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
        renderMarkdownInline(option?.value || "") +
        "</span></button>"
      );
    })
    .join("");

  const bodyHtml =
    '<section class="runtime-block runtime-choice-block multiple-choice-exercise">' +
    '<div class="runtime-choice-body">' +
    renderMarkdownParagraph(block?.ask || "") +
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

function renderEditorBlock(block) {
  if (blockUsesTextGapExercise(block)) {
    return renderEditorTextGapBlock(block, arguments[1], arguments[2]);
  }
  return (
    '<div class="runtime-block runtime-code-block">' +
    '<pre><code data-language="' +
    escapeHtml(block?.language || "text") +
    '">' +
    escapeHtml(block?.value || "") +
    "</code></pre></div>"
  );
}

function renderEditorTextGapBlock(block, renderOptions = {}, blockKey = "runtime-editor") {
  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
  const blanks = parseTextGapParts(block?.value || "");
  const values = Array.isArray(exercise?.values) ? exercise.values : [];
  const feedback = exercise?.feedback || null;
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
  const bodyRenderOptions = feedbackHtml && dockExerciseParts
    ? { ...renderOptions, suppressTextGapPrompt: true }
    : renderOptions;

  const bodyHtml =
    '<div class="runtime-block runtime-code-block runtime-code-gap-block">' +
    '<pre class="runtime-code-gap"><code data-language="' +
    escapeHtml(block?.language || "text") +
    '">' +
    renderTextGapParts(blanks, blockKey, values, escapeHtml, "runtime-text-gap-blank runtime-editor-gap-blank", bodyRenderOptions) +
    "</code></pre>";

  if (feedbackHtml && dockExerciseParts) {
    dockExerciseParts.push(feedbackHtml);
    return bodyHtml + "</div>";
  }

  return bodyHtml + feedbackHtml + "</div>";
}

function renderImageBlock(block) {
  return (
    '<figure class="runtime-block runtime-image-block">' +
    '<img src="' +
    escapeHtml(block?.src || "") +
    '" alt="' +
    escapeHtml(block?.alt || "") +
    '">' +
    (block?.alt ? '<figcaption class="runtime-image-caption">' + renderMarkdownInline(block.alt) + "</figcaption>" : "") +
    "</figure>"
  );
}

function renderDirectoryTreeDisclosureIcon() {
  return (
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4.5 6.5 8 10l3.5-3.5" />' +
    "</svg>"
  );
}

function renderDirectoryTreeFolderIcon() {
  return (
    '<svg viewBox="0 0 24 18" fill="none" stroke="none">' +
    '<path fill="rgba(244, 198, 109, 0.96)" d="M2.5 4.4a2.4 2.4 0 0 1 2.4-2.4h4.4l1.9 1.9H19a2.5 2.5 0 0 1 2.5 2.5v7.6A2.5 2.5 0 0 1 19 16.5H5A2.5 2.5 0 0 1 2.5 14z"/>' +
    '<path fill="rgba(255, 229, 170, 0.9)" d="M2.5 6h19v1.2a2.5 2.5 0 0 0-2.5-2.5h-7.6L9.5 2.8H4.9A2.4 2.4 0 0 0 2.5 5.2z"/>' +
    '<path fill="rgba(153, 104, 26, 0.42)" d="M2.5 6h19v.9h-19z"/>' +
    "</svg>"
  );
}

function renderDirectoryTreeFileIcon() {
  return (
    '<svg viewBox="0 0 18 22" fill="none" stroke="none">' +
    '<path fill="rgba(196, 214, 228, 0.92)" d="M4 1.5h9.4A1.6 1.6 0 0 1 15 3.1v12.8a1.6 1.6 0 0 1-1.6 1.6H4a1.6 1.6 0 0 1-1.5-1.6V3A1.5 1.5 0 0 1 4 1.5z"/>' +
    '<path fill="rgba(86, 98, 114, 0.8)" d="M5.3 6.1h7.1v1.2H5.3zm0 3h7.1v1.2H5.3zm0 3h5.2v1.2H5.3z"/>' +
    "</svg>"
  );
}

function renderDirectoryTreeBaseIcon() {
  return (
    '<svg viewBox="0 0 24 18" fill="none" stroke="none">' +
    '<path fill="rgba(196, 214, 228, 0.92)" d="M3 4.8A2.8 2.8 0 0 1 5.8 2h12.4A2.8 2.8 0 0 1 21 4.8v6.4A2.8 2.8 0 0 1 18.2 14H5.8A2.8 2.8 0 0 1 3 11.2z"/>' +
    '<path fill="rgba(90, 114, 132, 0.9)" d="M3 6.2h18v1.1H3z"/>' +
    '<circle cx="17.9" cy="10.1" r="1.1" fill="rgba(82, 201, 146, 0.95)"/>' +
    "</svg>"
  );
}

function renderDirectoryTreeNodeIcon(nodeType, isBase) {
  if (isBase) {
    return renderDirectoryTreeBaseIcon();
  }
  return nodeType === "file" ? renderDirectoryTreeFileIcon() : renderDirectoryTreeFolderIcon();
}

function renderDirectoryTreePathText(base, nodes, nodeId) {
  const labels = getDirectoryTreePathLabels(base, nodes, nodeId);
  if (!Array.isArray(labels) || !labels.length) {
    return "";
  }
  const safeBase = String(labels[0] || "/").trim() || "/";
  const parts = labels.slice(1).map((item) => String(item || "").trim()).filter(Boolean);
  if (!parts.length) {
    return safeBase;
  }
  if (safeBase === "/") {
    return `/${parts.join("/")}`;
  }
  return `${safeBase}/${parts.join("/")}`;
}

function getDirectoryTreePracticeModeMeta(mode) {
  if (mode === "select") {
    return {
      badge: "Selecionar",
      prompt: "Selecione na árvore o item pedido e valide no Continuar.",
      actionLabel: ""
    };
  }
  if (mode === "create_folder") {
    return {
      badge: "Criar pasta",
      prompt: "Selecione a pasta pai e informe o nome da nova pasta. A validação acontece no Continuar.",
      actionLabel: ""
    };
  }
  if (mode === "create_file") {
    return {
      badge: "Criar arquivo",
      prompt: "Selecione a pasta pai, escolha o tipo quando necessário e complete o nome. A validação acontece no Continuar.",
      actionLabel: ""
    };
  }
  if (mode === "delete") {
    return {
      badge: "Excluir",
      prompt: "Selecione o item que deve ser removido da árvore.",
      actionLabel: ""
    };
  }
  if (mode === "rename") {
    return {
      badge: "Renomear",
      prompt: "Selecione o item a renomear e informe o novo nome. A validação acontece no Continuar.",
      actionLabel: ""
    };
  }
  return {
    badge: "",
    prompt: "",
    actionLabel: ""
  };
}

function renderDirectoryTreePracticeNameBlank(blockKey, part, value) {
  const rawValue = String(value ?? "");
  return (
    '<input class="directory-tree-practice-input" type="text" spellcheck="false" dir="ltr" ' +
    'data-action="directory-tree-name-input" data-directory-tree-block-key="' +
    escapeHtml(blockKey) +
    '" data-directory-tree-blank-index="' +
    escapeHtml(part?.index ?? 0) +
    '" value="' +
    escapeHtmlAttribute(rawValue) +
    '">' 
  );
}

function renderDirectoryTreePracticeNameComposer(blockKey, practice, exercise) {
  if (!directoryTreePracticeNeedsName(practice.mode) || !practice.nameTemplate) {
    return "";
  }

  const parts = parseTextGapParts(practice.nameTemplate);
  const values = Array.isArray(exercise?.nameValues) ? exercise.nameValues : [];
  const blankCount = parts.filter((part) => part.kind === "blank").length;
  if (!blankCount) {
    return "";
  }

  const templatePreview = parts
    .map((part) => {
      if (part.kind === "text") {
        return part.value;
      }
      const currentValue = String(values[part.index] ?? "").trim();
      return currentValue || "…";
    })
    .join("");

  const fieldGroups = parts
    .filter((part) => part.kind === "blank" && Array.isArray(part.options) && part.options.length)
    .map((part, optionGroupIndex) => {
      const currentValue = normalizeInlineText(values[part.index] ?? "");
      const label = part.options.every((option) => /^[a-z0-9]{1,5}$/i.test(option)) ? "Extensão" : `Parte ${optionGroupIndex + 1}`;
      return (
        '<div class="directory-tree-practice-choice-group">' +
        '<span class="directory-tree-practice-choice-label">' + escapeHtml(label) + "</span>" +
        '<div class="token-options">' +
        part.options
          .map((option) => {
            const selected = currentValue === normalizeInlineText(option);
            return (
              '<button class="token-option' +
              (selected ? " active" : "") +
              '" type="button" data-action="directory-tree-name-set-choice" data-directory-tree-block-key="' +
              escapeHtml(blockKey) +
              '" data-directory-tree-blank-index="' +
              escapeHtml(part.index) +
              '" data-directory-tree-value="' +
              escapeHtml(option) +
              '">' +
              escapeHtml(option) +
              "</button>"
            );
          })
          .join("") +
        "</div></div>"
      );
    })
    .join("");

  const textFields = parts
    .filter((part) => part.kind === "blank" && (!Array.isArray(part.options) || !part.options.length))
    .map((part, textFieldIndex) => (
      '<div class="directory-tree-practice-field">' +
      '<span class="directory-tree-practice-field-label">' +
      escapeHtml(textFieldIndex === 0 ? "Nome" : `Parte ${textFieldIndex + 1}`) +
      "</span>" +
      renderDirectoryTreePracticeNameBlank(blockKey, part, values[part.index] ?? "") +
      "</div>"
    ))
    .join("");

  return (
    '<div class="directory-tree-practice-field">' +
    '<span class="directory-tree-practice-field-label">Prévia</span>' +
    '<input class="directory-tree-status-value directory-tree-practice-path" type="text" readonly value="' +
    escapeHtmlAttribute(templatePreview) +
    '" aria-label="Prévia do nome">' +
    "</div>" +
    textFields +
    fieldGroups
  );
}

function renderDirectoryTreePracticeTypePrompt(blockKey, practice, exercise) {
  if (!practice.typePrompt?.expected) {
    return "";
  }

  const currentType = String(exercise?.typeValue || "").trim();
  return (
    '<div class="directory-tree-practice-field">' +
    '<span class="directory-tree-practice-field-label">Tipo</span>' +
    '<div class="token-options">' +
    practice.typePrompt.options
      .map((option) => {
        const normalizedOption = normalizeDirectoryTreeNodeType(option);
        const selected = currentType === normalizedOption;
        return (
          '<button class="token-option' +
          (selected ? " active" : "") +
          '" type="button" data-action="directory-tree-set-type" data-directory-tree-block-key="' +
          escapeHtml(blockKey) +
          '" data-directory-tree-node-type="' +
          escapeHtml(normalizedOption) +
          '">' +
          escapeHtml(normalizedOption === "file" ? "Arquivo" : "Pasta") +
          "</button>"
        );
      })
      .join("") +
    "</div></div>"
  );
}

function renderDirectoryTreePracticeFeedback(blockKey, feedback) {
  if (!feedback) {
    return "";
  }
  if (feedback === "correct") {
    return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  }
  if (feedback === "incomplete") {
    return '<div class="inline-feedback warn"><p class="tiny">Monte a resposta completa na árvore antes de continuar.</p></div>';
  }
  return (
    '<div class="inline-feedback err has-actions">' +
    '<p class="tiny">A árvore resultante não corresponde ao estado esperado.</p>' +
    '<div class="feedback-icons">' +
    '<button class="icon-pill" type="button" data-action="directory-tree-view-answer" data-directory-tree-block-key="' +
    escapeHtml(blockKey) +
    '" title="Ver resposta" aria-label="Ver resposta">&#128065;</button>' +
    '<button class="icon-pill primary" type="button" data-action="directory-tree-try-again" data-directory-tree-block-key="' +
    escapeHtml(blockKey) +
    '" title="Tentar de novo" aria-label="Tentar de novo">&#8635;</button>' +
    "</div></div>"
  );
}

function renderDirectoryTreePracticeDock(block, treeState, blockKey) {
  const practice = normalizeDirectoryTreePractice(block?.practice);
  if (practice.mode === "none") {
    return "";
  }

  const selectedNodeId = String(treeState?.selectedNodeId || DIRECTORY_TREE_BASE_NODE_ID);
  const selectedPath = renderDirectoryTreePathText(block?.base, treeState?.nodes || block?.nodes, selectedNodeId);
  const meta = getDirectoryTreePracticeModeMeta(practice.mode);
  const selectedLabel = selectedPath || normalizeDirectoryTreeBase(block?.base);
  const actionButton =
    meta.actionLabel
      ? '<button class="primary-btn compact-btn directory-tree-practice-submit" type="button" data-action="directory-tree-apply" data-directory-tree-block-key="' +
        escapeHtml(blockKey) +
        '">' +
        escapeHtml(meta.actionLabel) +
        "</button>"
      : "";

  return (
    '<section class="runtime-flow-prompt directory-tree-practice-dock" data-directory-tree-practice="true">' +
    '<div class="runtime-flow-prompt-head">' +
    '<span class="runtime-flow-prompt-badge">' +
    escapeHtml(meta.badge) +
    "</span></div>" +
    '<p class="chip-muted directory-tree-practice-copy">' +
    escapeHtml(meta.prompt) +
    "</p>" +
    '<div class="directory-tree-practice-field">' +
    '<span class="directory-tree-practice-field-label">Seleção ativa</span>' +
    '<input class="directory-tree-status-value directory-tree-practice-path" type="text" readonly value="' +
    escapeHtmlAttribute(selectedLabel) +
    '" aria-label="Seleção ativa">' +
    "</div>" +
    renderDirectoryTreePracticeTypePrompt(blockKey, practice, treeState) +
    renderDirectoryTreePracticeNameComposer(blockKey, practice, treeState) +
    actionButton +
    renderDirectoryTreePracticeFeedback(blockKey, treeState?.feedback || null) +
    "</section>"
  );
}

function renderDirectoryTreeDisclosureControl(blockKey, nodeId, hasChildren, expanded) {
  if (!hasChildren) {
    return '<span class="directory-tree-disclosure is-empty" aria-hidden="true"></span>';
  }

  return (
    '<button type="button" class="directory-tree-disclosure' +
    (expanded ? " is-expanded" : " is-collapsed") +
    '" data-action="directory-tree-toggle-node" data-directory-tree-block-key="' +
    escapeHtml(blockKey) +
    '" data-directory-tree-node-id="' +
    escapeHtml(nodeId) +
    '" aria-expanded="' +
    (expanded ? "true" : "false") +
    '" aria-label="' +
    escapeHtml(expanded ? "Recolher pasta" : "Expandir pasta") +
    '" title="' +
    escapeHtml(expanded ? "Recolher" : "Expandir") +
    '">' +
    renderDirectoryTreeDisclosureIcon() +
    "</button>"
  );
}

function renderDirectoryTreeItem(node, options = {}) {
  const isBase = !!options.isBase;
  const nodeId = isBase ? DIRECTORY_TREE_BASE_NODE_ID : String(node?.id || "");
  const nodeType = isBase ? "base" : String(node?.type || "folder");
  const label = isBase ? normalizeDirectoryTreeBase(node?.name) : String(node?.name || "");
  const children = isBase ? cloneDirectoryTreeNodes(options.nodes) : cloneDirectoryTreeNodes(node?.children);
  const hasChildren = children.length > 0;
  const expanded = hasChildren ? !options.collapsedNodeIds?.has(nodeId) : false;
  const isCurrent = String(options.currentNodeId || "") === String(nodeId || "");
  const isSelected = String(options.selectedNodeId || "") === String(nodeId || "");
  const pathText = renderDirectoryTreePathText(options.base, options.nodes, nodeId);
  const currentMarkerHtml = isCurrent
    ? '<span class="directory-tree-current-marker" aria-hidden="true"></span>'
    : "";
  const childrenHtml = hasChildren && expanded
    ? '<div class="directory-tree-children"><div class="directory-tree-list">' +
      children.map((child) => renderDirectoryTreeItem(child, { ...options, isBase: false })).join("") +
      "</div></div>"
    : "";
  const entryClassName =
    "directory-tree-entry" +
    (isCurrent ? " is-current" : "") +
    (isSelected ? " is-selected" : "") +
    (isBase ? " is-base" : "") +
    (nodeType === "file" ? " is-file" : "");

  return (
    '<div class="directory-tree-item directory-tree-item-' +
    escapeHtml(nodeType) +
    (isCurrent ? " is-current" : "") +
    (hasChildren ? " has-children" : "") +
    '">' +
    '<div class="' + entryClassName + '">' +
    renderDirectoryTreeDisclosureControl(options.blockKey, nodeId, hasChildren, expanded) +
    '<span class="directory-tree-node-icon directory-tree-node-icon-' +
    escapeHtml(nodeType) +
    '" aria-hidden="true">' +
    renderDirectoryTreeNodeIcon(nodeType, isBase) +
    "</span>" +
    '<button type="button" class="directory-tree-entry-button' +
    (isSelected ? " is-selected" : "") +
    (isCurrent ? " is-current" : "") +
    '" data-action="directory-tree-select-node" data-directory-tree-block-key="' +
    escapeHtml(options.blockKey) +
    '" data-directory-tree-node-id="' +
    escapeHtml(nodeId) +
    '" aria-pressed="' +
    (isSelected ? "true" : "false") +
    '"' +
    (isCurrent ? ' aria-current="true"' : "") +
    (pathText ? ' title="' + escapeHtml(pathText) + '"' : "") +
    ">" +
    '<span class="directory-tree-entry-button-label">' +
    escapeHtml(label) +
    "</span>" +
    currentMarkerHtml +
    "</button>" +
    "</div>" +
    childrenHtml +
    "</div>"
  );
}

function renderDirectoryTreeBlock(block, renderOptions = {}, blockKey = "runtime-directory-tree") {
  const base = normalizeDirectoryTreeBase(block?.base);
  const treeState = renderOptions.directoryTreeStateByBlockKey?.[blockKey] || null;
  const nodes = cloneDirectoryTreeNodes(treeState?.nodes || block?.nodes);
  const currentNodeId = String(block?.currentNodeId || block?.referenceNodeId || "");
  const selectedNodeId = String(treeState?.selectedNodeId || block?.selectedNodeId || currentNodeId || DIRECTORY_TREE_BASE_NODE_ID);
  const collapsedNodeIds = new Set(
    (Array.isArray(treeState?.collapsedNodeIds) ? treeState.collapsedNodeIds : Array.isArray(block?.collapsedNodeIds) ? block.collapsedNodeIds : [])
      .map((item) => String(item || ""))
      .filter(Boolean)
  );
  const currentPathText = renderDirectoryTreePathText(base, nodes, currentNodeId || DIRECTORY_TREE_BASE_NODE_ID);
  const selectedPathText = renderDirectoryTreePathText(base, nodes, selectedNodeId || DIRECTORY_TREE_BASE_NODE_ID);
  const statusRows = [
    currentPathText
      ? '<div class="directory-tree-status-row">' +
        '<span class="directory-tree-status-label">Diretório atual:</span>' +
        '<input class="directory-tree-status-value" type="text" readonly value="' + escapeHtmlAttribute(currentPathText) + '" aria-label="Diretório atual">' +
        "</div>"
      : "",
    selectedPathText
      ? '<div class="directory-tree-status-row">' +
        '<span class="directory-tree-status-label">Seleção:</span>' +
        '<input class="directory-tree-status-value" type="text" readonly value="' + escapeHtmlAttribute(selectedPathText) + '" aria-label="Seleção">' +
        "</div>"
      : ""
  ].filter(Boolean).join("");
  const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
  if (dockExerciseParts) {
    const practiceDock = renderDirectoryTreePracticeDock({ ...block, nodes }, treeState || { nodes, selectedNodeId }, blockKey);
    if (practiceDock) {
      dockExerciseParts.push(practiceDock);
    }
  }

  return (
    '<section class="runtime-block runtime-directory-tree-block">' +
    '<div class="directory-tree-box">' +
    '<div class="directory-tree-tree" aria-label="Árvore de diretórios">' +
    renderDirectoryTreeItem(
      { name: base },
      {
        blockKey,
        isBase: true,
        base,
        nodes,
        currentNodeId,
        selectedNodeId,
        collapsedNodeIds
      }
    ) +
    "</div>" +
    (statusRows
      ? '<div class="directory-tree-status-panel">' + statusRows + "</div>"
      : "") +
    "</div>" +
    "</section>"
  );
}

function renderPopupButtonBlock(block) {
  const popupBlocks = sanitizePopupBlocks(block?.popupBlocks);
  if (!block?.popupEnabled || !popupBlocks.length) {
    return "";
  }

  return (
    '<details class="runtime-block runtime-popup-block" open>' +
    '<summary class="runtime-popup-summary">Continuar</summary>' +
    '<div class="runtime-popup-body">' +
    renderRuntimeBlockList(popupBlocks, "") +
    "</div></details>"
  );
}

function buildPopupBlockKeyPrefix(blockKeyPrefix = "runtime-block") {
  return `${String(blockKeyPrefix)}::popup`;
}

export function getRuntimePopupButtonEntry(card) {
  const runtime = resolveCardRuntime(card);
  const blocks = Array.isArray(runtime?.blocks) ? runtime.blocks : [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block?.kind !== "button") {
      continue;
    }

    const popupBlocks = sanitizePopupBlocks(block?.popupBlocks);
    if (!block?.popupEnabled || !popupBlocks.length) {
      continue;
    }

    return {
      block: {
        ...block,
        popupBlocks
      },
      index
    };
  }

  return null;
}

export function renderPopupButtonDock(block, options = {}) {
  const popupBlocks = sanitizePopupBlocks(block?.popupBlocks);
  if (!block?.popupEnabled || !popupBlocks.length) {
    return { bodyHtml: "", dockHtml: "" };
  }

  const dockExerciseParts = [];
  const bodyHtml = renderRuntimeBlockList(popupBlocks, "", {
    ...options,
    blockKeyPrefix: buildPopupBlockKeyPrefix(options.blockKeyPrefix || "runtime-block"),
    dockExerciseParts
  });
  const dockHtml = dockExerciseParts.length
    ? '<section class="card-answer-dock popup-answer-dock" data-card-answer-dock="true">' + dockExerciseParts.join("") + "</section>"
    : "";

  return { bodyHtml, dockHtml };
}

function renderRuntimeBlock(block, renderOptions = {}, blockKey = "runtime-block") {
  if (!block || typeof block !== "object") {
    return "";
  }

  if (block.kind === "heading") {
    return '<h3 class="runtime-block runtime-heading">' + renderMarkdownInline(block.value || "") + "</h3>";
  }
  if (block.kind === "paragraph") {
    if (blockUsesTextGapExercise(block)) {
      const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
      const values = Array.isArray(exercise?.values) ? exercise.values : [];
      const feedback = exercise?.feedback || null;
      const dockExerciseParts = Array.isArray(renderOptions.dockExerciseParts) ? renderOptions.dockExerciseParts : null;
      const feedbackHtml = renderTextGapFeedback(blockKey, feedback);
      const bodyRenderOptions = feedbackHtml && dockExerciseParts
        ? { ...renderOptions, suppressTextGapPrompt: true }
        : renderOptions;
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
    return '<p class="runtime-block runtime-paragraph">' + renderMarkdownParagraph(block.value || "") + "</p>";
  }
  if (block.kind === "multiple_choice") {
    return renderMultipleChoiceBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "complete") {
    return renderCompleteBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "editor") {
    return renderEditorBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "table") {
    return renderTableBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "plane") {
    return renderPlaneBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "graph") {
    return renderGraphBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "matrix") {
    return renderMatrixBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "flowchart") {
    return renderFlowchartBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "image") {
    return renderImageBlock(block);
  }
  if (block.kind === "directory_tree") {
    return renderDirectoryTreeBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "button") {
    if (renderOptions.omitPopupButtonBlock) {
      return "";
    }
    return renderPopupButtonBlock(block);
  }

  return '<p class="runtime-block runtime-paragraph" data-kind="' + escapeHtml(block.kind || "paragraph") + '">' + renderMarkdownParagraph(block.value || "") + "</p>";
}

export function renderRuntimeBlockList(blocks, fallbackText = "Sem conteúdo.", renderOptions = {}) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  if (!safeBlocks.length) {
    return '<p class="runtime-paragraph">' + escapeHtml(fallbackText) + "</p>";
  }

  const blockKeyPrefix = String(renderOptions.blockKeyPrefix || "runtime-block");
  const blockKeys = Array.isArray(renderOptions.blockKeys) ? renderOptions.blockKeys : [];
  return safeBlocks
    .map((block, index) =>
      renderRuntimeBlock(block, renderOptions, blockKeys[index] || `${blockKeyPrefix}::${index}`)
    )
    .join("");
}

export function renderCardRuntimeBlocks(card, options = {}) {
  const runtime = resolveCardRuntime(card);
  const title = normalizeInlineText(options.title || card?.title || runtime?.title);
  const blocks = Array.isArray(runtime?.blocks) ? runtime.blocks : [];
  const blockEntries = blocks.map((block, index) => ({
    block,
    originalIndex: index
  }));
  const normalizedEntries =
    options.omitRepeatedHeading !== false &&
    blockEntries.length &&
    blockEntries[0]?.block?.kind === "heading" &&
    normalizeInlineText(blockEntries[0].block.value).toLowerCase() === title.toLowerCase()
      ? blockEntries.slice(1)
      : blockEntries;

  return renderRuntimeBlockList(
    normalizedEntries.map((entry) => entry.block),
    options.fallbackText || runtime?.fallbackText || "",
    {
      ...options,
      blockKeys: normalizedEntries.map((entry) => `${String(options.blockKeyPrefix || "runtime-block")}::${entry.originalIndex}`)
    }
  );
}

export function renderCardRuntimeBlocksWithDock(card, options = {}) {
  const dockExerciseParts = [];
  const bodyHtml = renderCardRuntimeBlocks(card, {
    ...options,
    dockExerciseParts
  });

  const dockHtml = dockExerciseParts.length
    ? '<section class="card-answer-dock" data-card-answer-dock="true">' + dockExerciseParts.join("") + "</section>"
    : "";

  return { bodyHtml, dockHtml };
}

export function renderCardRuntimeArticle(card) {
  const cardClassByKind = {
    say: "card-say",
    ask: "card-ask",
    code: "card-code",
    table: "card-table",
    tree: "card-tree",
    flow: "card-flow",
    graph: "card-graph",
    plane: "card-plane",
    matrix: "card-matrix"
  };
  const kind = getContractCardKind(card) || "say";
  const cardClass = cardClassByKind[kind] || `card-${escapeHtml(kind)}`;

  return (
    '<article class="card ' +
    cardClass +
    '" data-card-id="' +
    escapeHtml(card?.id || card?.key || "") +
    '">' +
    '<header class="card-head"><h4>' +
    escapeHtml(card?.title || card?.key || "Card") +
    "</h4></header>" +
    '<div class="card-body">' +
    renderCardRuntimeBlocks(card, {
      omitRepeatedHeading: true
    }) +
    "</div></article>"
  );
}
