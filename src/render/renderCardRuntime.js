import { resolveCardRuntime, sanitizePopupBlocks } from "../core/cardRuntime.js";
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

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function renderMarkdownInline(text) {
  return escapeHtml(text || "")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
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

  return false;
}

function getTextGapSource(block) {
  if (block?.kind === "complete") {
    return String(block?.text || "");
  }
  if (block?.kind === "paragraph" || block?.kind === "editor") {
    return String(block?.value || "");
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
  let promptRendered = false;
  return parts
    .map((part) => {
      if (part.kind === "text") {
        return '<span class="runtime-text-gap-chunk">' + chunkRenderer(part.value) + "</span>";
      }

      const value = values[part.index] ?? "";
      if (
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
}

function renderTextGapFeedback(blockKey, feedback) {
  if (!feedback) {
    return "";
  }

  if (feedback === "correct") {
    return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  }

  if (feedback === "incomplete") {
    return '<div class="inline-feedback err"><p class="tiny">Preencha todas as lacunas.</p></div>';
  }

  return (
    '<div class="inline-feedback err has-actions">' +
    '<p class="tiny">As respostas preenchidas não correspondem ao conjunto esperado.</p>' +
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
  // Espelha o padrão do AraLearn_old (popup sticky dentro do contêiner do flowchart).
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
    return '<div class="inline-feedback err"><p class="tiny">Preencha todas as lacunas do fluxograma.</p></div>';
  }

  return (
    '<div class="inline-feedback err has-actions">' +
    '<p class="tiny">As respostas marcadas não correspondem ao conjunto esperado.</p>' +
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

function renderTableBlock(block, renderOptions = {}, blockKey = "runtime-table") {
  const title = normalizeInlineText(block?.title);
  const usesTextGap = blockUsesTextGapExercise(block);
  const exercise = renderOptions.textGapExerciseStateByBlockKey?.[blockKey] || renderOptions.completeExerciseStateByBlockKey?.[blockKey] || null;
  const values = Array.isArray(exercise?.values) ? exercise.values : [];
  const feedback = exercise?.feedback || null;
  let nextBlankIndex = 0;
  const headers = (Array.isArray(block?.headers) ? block.headers : [])
    .map((header) => "<th>" + renderMarkdownInline(header?.value || "") + "</th>")
    .join("");
  const rows = (Array.isArray(block?.rows) ? block.rows : [])
    .map((row) => {
      const cells = (Array.isArray(row) ? row : [])
        .map((cell) => {
          const parts = parseTextGapParts(cell?.value || "");
          if (!usesTextGap || !parts.some((part) => part.kind === "blank")) {
            return "<td>" + renderMarkdownInline(cell?.value || "") + "</td>";
          }

          const scopedParts = parts.map((part) =>
            part.kind === "blank"
              ? { ...part, index: nextBlankIndex++ }
              : part
          );
          return (
            '<td><div class="runtime-table-cell-gap">' +
            renderTextGapParts(scopedParts, blockKey, values, renderMarkdownInline, "runtime-text-gap-blank runtime-table-gap-blank", renderOptions) +
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
    '<div class="runtime-table-wrap"><table class="runtime-table">' +
    (headers ? "<thead><tr>" + headers + "</tr></thead>" : "") +
    "<tbody>" +
    rows +
    "</tbody></table></div>";

  if (!usesTextGap) {
    return bodyHtml + "</div>";
  }

  return bodyHtml + renderTextGapFeedback(blockKey, feedback) + "</div>";
}

function renderMultipleChoiceFeedback(feedback, blockKey) {
  if (!feedback) {
    return "";
  }

  if (feedback === "correct") {
    return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  }

  if (feedback === "incomplete") {
    return '<div class="inline-feedback err"><p class="tiny">Selecione pelo menos uma resposta.</p></div>';
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

  const bodyHtml =
    '<div class="runtime-block runtime-complete-block">' +
    '<p class="runtime-complete-text">' +
    renderTextGapParts(blanks, blockKey, values, renderMarkdownInline, "runtime-text-gap-blank runtime-complete-blank", renderOptions) +
    "</p>";

  return bodyHtml + renderTextGapFeedback(blockKey, feedback) + "</div>";
}

function renderMultipleChoiceBlock(block, renderOptions = {}, blockKey = "runtime-choice") {
  const exercise = renderOptions.choiceExerciseStateByBlockKey?.[blockKey] || null;
  const options = Array.isArray(block?.options) ? block.options : [];
  const displayOptions = shuffleExerciseOptions(options, buildExerciseShuffleSeed(renderOptions, `choice::${blockKey}`));
  const selected = normalizeChoiceSelectionIds(options, exercise?.selected);
  const feedback = exercise?.feedback || null;

  const optionsHtml = displayOptions
    .map((option, index) => {
      const optionId = getExerciseOptionStableId(option, index);
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
    renderMultipleChoiceFeedback(feedback, blockKey) +
    "</section>";

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

  const bodyHtml =
    '<div class="runtime-block runtime-code-block runtime-code-gap-block">' +
    '<pre class="runtime-code-gap"><code data-language="' +
    escapeHtml(block?.language || "text") +
    '">' +
    renderTextGapParts(blanks, blockKey, values, escapeHtml, "runtime-text-gap-blank runtime-editor-gap-blank", renderOptions) +
    "</code></pre>";

  return bodyHtml + renderTextGapFeedback(blockKey, feedback) + "</div>";
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
      const bodyHtml =
        '<div class="runtime-block runtime-paragraph-gap-block">' +
        '<p class="runtime-block runtime-paragraph runtime-text-gap-paragraph">' +
        renderTextGapParts(
          parseTextGapParts(block.value || ""),
          blockKey,
          values,
          renderMarkdownInline,
          "runtime-text-gap-blank runtime-paragraph-gap-blank",
          renderOptions
        ) +
        "</p>";
      return bodyHtml + renderTextGapFeedback(blockKey, feedback) + "</div>";
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
  if (block.kind === "flowchart") {
    return renderFlowchartBlock(block, renderOptions, blockKey);
  }
  if (block.kind === "image") {
    return renderImageBlock(block);
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
  const cardClassByType = {
    text: "card-text",
    choice: "card-ask",
    complete: "card-complete",
    editor: "card-code",
    table: "card-table",
    flow: "card-flow",
    image: "card-image"
  };
  const cardClass = cardClassByType[card?.type] || `card-${escapeHtml(card?.type || "text")}`;

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
