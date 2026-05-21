import {
  getContractCardKind,
  listContractAnswerValues,
  normalizeFlowForRuntime
} from "../contract/contractCard.js";
import {
  convertPublicFlowToStructure,
  normalizeFlowchartStructure,
  validateFlowchartStructureContract
} from "../flowchart/flowchartStructure.js";
import { deriveFlowchartProjectionFromStructure } from "../flowchart/flowchartProjection.js";
import { DIRECTORY_TREE_BASE_NODE_ID } from "./directoryTree.js";
import { getExerciseOptionStableId } from "./exerciseOptions.js";

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function clone(value) {
  return structuredClone(value);
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeText(item).trim())
    .filter(Boolean);
}

function sanitizePopupBlock(block) {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return null;
  }

  if (block.kind === "heading") {
    return { ...clone(block), value: normalizeText(block.value) };
  }
  if (block.kind === "paragraph") {
    return { ...clone(block), value: normalizeText(block.value) };
  }
  if (block.kind === "editor") {
    return { ...clone(block), value: normalizeText(block.value) };
  }
  if (block.kind === "table") {
    return {
      ...clone(block),
      title: normalizeText(block.title),
      headers: (Array.isArray(block.headers) ? block.headers : []).map((header) => ({
        ...(header && typeof header === "object" ? clone(header) : {}),
        value: normalizeText(header?.value)
      })),
      rows: (Array.isArray(block.rows) ? block.rows : []).map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => ({
          ...(cell && typeof cell === "object" ? clone(cell) : {}),
          value: normalizeText(cell?.value)
        }))
      )
    };
  }
  if (block.kind === "image") {
    return clone(block);
  }
  if (block.kind === "flowchart") {
    return {
      ...clone(block),
      flow: Array.isArray(block.flow) ? clone(block.flow) : block.flow,
      projection: clone(block.projection)
    };
  }
  if (block.kind === "graph") {
    return {
      ...clone(block),
      vertices: Array.isArray(block.vertices) ? clone(block.vertices) : [],
      edges: Array.isArray(block.edges) ? clone(block.edges) : []
    };
  }
  if (block.kind === "complete" || block.kind === "multiple_choice" || block.kind === "directory_tree") {
    return clone(block);
  }

  return null;
}

export function sanitizePopupBlocks(popupBlocks = []) {
  return (Array.isArray(popupBlocks) ? popupBlocks : [])
    .map((block) => sanitizePopupBlock(block))
    .filter(Boolean);
}

function buildHeadingBlock(title) {
  return {
    kind: "heading",
    value: normalizeText(title).trim() || "Novo card",
    align: "center"
  };
}

function buildButtonBlock(after) {
  const popupBlocks = normalizeText(after).trim()
    ? [buildParagraphBlock(after)]
    : [];
  const safePopupBlocks = sanitizePopupBlocks(popupBlocks);
  return {
    kind: "button",
    popupEnabled: safePopupBlocks.length > 0,
    popupBlocks: safePopupBlocks
  };
}

function buildParagraphBlock(value, extra = {}) {
  return {
    kind: "paragraph",
    value: normalizeText(value),
    ...extra
  };
}

function enrichTextGapsWithWrong(value, wrong) {
  const wrongValues = normalizeList(wrong);
  if (!wrongValues.length) {
    return normalizeText(value);
  }

  return normalizeText(value).replace(/\[\[([\s\S]*?)\]\]/g, (_, raw) => {
    const source = normalizeText(raw);
    if (source.includes("::")) {
      return `[[${source}]]`;
    }

    const answer = source.trim();
    const options = Array.from(new Set([answer, ...wrongValues].filter(Boolean)));
    return `[[${answer}::${options.join("|")}]]`;
  });
}

function buildChoiceOptions(card) {
  const correctOptions = listContractAnswerValues(card);
  const wrongOptions = normalizeList(card?.wrong);

  return [
    ...correctOptions.map((value, index) => ({
      id: getExerciseOptionStableId({ id: `choice-correct-${index}` }, index),
      value: normalizeText(value),
      answer: true
    })),
    ...wrongOptions.map((value, index) => ({
      id: getExerciseOptionStableId({ id: `choice-wrong-${index}` }, correctOptions.length + index),
      value: normalizeText(value),
      answer: false
    }))
  ].filter((item) => item.value.trim());
}

function buildChoiceBlock(card) {
  const answerCount = listContractAnswerValues(card).length;
  return {
    kind: "multiple_choice",
    ask: normalizeText(card?.ask),
    answerState: answerCount > 1 ? "multiple" : "single",
    options: buildChoiceOptions(card)
  };
}

function buildEditorBlock(card) {
  return {
    kind: "editor",
    value: enrichTextGapsWithWrong(card?.code, card?.wrong),
    language: normalizeText(card?.language) || "text"
  };
}

function buildTableTitle(card) {
  const title = normalizeText(card?.table?.title).trim();
  const cardTitle = normalizeText(card?.title).trim();
  if (!title || title.toLocaleLowerCase("pt-BR") === cardTitle.toLocaleLowerCase("pt-BR")) {
    return "";
  }
  return title;
}

function buildTableHeaders(card) {
  const focus = card?.table?.focus || {};
  const focusedColumns = new Set(
    [focus.column, ...(Array.isArray(focus.columns) ? focus.columns : [])]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1)
  );
  return normalizeList(card?.table?.columns).map((column, columnIndex) => ({
    value: column,
    align: "center",
    tone: "default",
    bold: false,
    italic: false,
    focused: focusedColumns.has(columnIndex + 1)
  }));
}

function buildTableRows(card) {
  const focus = card?.table?.focus || {};
  const focusedRows = new Set(
    [focus.row, ...(Array.isArray(focus.rows) ? focus.rows : [])]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1)
  );
  const focusedColumns = new Set(
    [focus.column, ...(Array.isArray(focus.columns) ? focus.columns : [])]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1)
  );
  return (Array.isArray(card?.table?.rows) ? card.table.rows : []).map((row, rowIndex) => {
    const rowFocused = focusedRows.has(rowIndex + 1);
    return (Array.isArray(row) ? row : []).map((cell, columnIndex) => ({
      value: normalizeText(cell),
      align: "center",
      tone: "default",
      bold: false,
      italic: false,
      blank: false,
      focusedRow: rowFocused,
      focusedColumn: focusedColumns.has(columnIndex + 1)
    }));
  });
}

function buildTableBlock(card) {
  const focus = card?.table?.focus || {};
  return {
    kind: "table",
    title: buildTableTitle(card),
    focusLabel: normalizeText(focus?.label).trim(),
    titleStyle: {
      align: "center",
      tone: "default",
      bold: false,
      italic: false
    },
    headers: buildTableHeaders(card),
    rows: buildTableRows(card)
  };
}

function normalizeTreeBase(value) {
  const text = normalizeText(value).trim();
  return text || "/";
}

function splitTreePath(value, base = "/") {
  const safeBase = normalizeTreeBase(base);
  let text = normalizeText(value).trim().replace(/\\/g, "/");
  if (!text) {
    return [];
  }
  if (safeBase !== "/" && text.startsWith(safeBase)) {
    text = text.slice(safeBase.length);
  }
  return text
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildTreeNodeId(pathParts) {
  const slug = slugify(pathParts.join("-"));
  return slug ? `node-${slug}` : DIRECTORY_TREE_BASE_NODE_ID;
}

function buildTreeNodes(items, parentPath = []) {
  return Object.entries(items && typeof items === "object" ? items : {}).map(([name, child]) => {
    const pathParts = parentPath.concat(String(name || "item"));
    const isFile = child === null;
    return {
      id: buildTreeNodeId(pathParts),
      type: isFile ? "file" : "folder",
      name: String(name || (isFile ? "arquivo" : "pasta")),
      ...(isFile ? {} : { children: buildTreeNodes(child, pathParts) })
    };
  });
}

function buildDirectoryTreeBlock(card) {
  const base = normalizeTreeBase(card?.tree?.base);
  const currentPath = splitTreePath(card?.tree?.current, base);
  const selectedPath = splitTreePath(card?.tree?.selected || card?.tree?.current, base);
  const closed = normalizeList(card?.tree?.closed).map((entry) => buildTreeNodeId(splitTreePath(entry, base)));

  return {
    kind: "directory_tree",
    base,
    currentNodeId: currentPath.length ? buildTreeNodeId(currentPath) : DIRECTORY_TREE_BASE_NODE_ID,
    selectedNodeId: selectedPath.length ? buildTreeNodeId(selectedPath) : DIRECTORY_TREE_BASE_NODE_ID,
    collapsedNodeIds: closed,
    nodes: buildTreeNodes(card?.tree?.items)
  };
}

function buildFlowchartBlock(card) {
  const runtimeFlow = normalizeFlowForRuntime(card?.flow);
  const publicStructure = convertPublicFlowToStructure(runtimeFlow);
  const normalizedStructure = normalizeFlowchartStructure(publicStructure);
  const validation = validateFlowchartStructureContract(normalizedStructure);
  const projection = validation.valid ? deriveFlowchartProjectionFromStructure(normalizedStructure) : null;

  return {
    kind: "flowchart",
    flow: Array.isArray(card?.flow) ? clone(card.flow) : [],
    structureVersion: 1,
    structure: normalizedStructure,
    structureValid: validation.valid,
    structureValidation: validation,
    projectionVersion: projection ? 1 : 0,
    projection,
    projectionValid: !!projection
  };
}

function formatMathNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return normalizeText(value);
  }
  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }
  return String(Number(numericValue.toFixed(2)));
}

function formatMathCoordinateItem(value) {
  if (typeof value === "number") {
    return formatMathNumber(value);
  }
  return normalizeText(value);
}

function formatCoordinatePair(pair = []) {
  return `(${formatMathCoordinateItem(pair[0])}, ${formatMathCoordinateItem(pair[1])})`;
}

function readPlaneMode(plane) {
  if (Array.isArray(plane?.distance)) return "distance";
  if (plane?.scale && typeof plane.scale === "object") return "scale";
  if (Array.isArray(plane?.sum)) return "sum";
  if (Array.isArray(plane?.vectors)) return "vectors";
  if (Array.isArray(plane?.vector)) return "vector";
  return "";
}

function buildPlaneAutoRange(values) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
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

function buildPlaneRanges(plane, points = []) {
  const xValues = [];
  const yValues = [];
  (Array.isArray(points) ? points : []).forEach((point) => {
    const x = Number(point?.[0]);
    const y = Number(point?.[1]);
    if (Number.isFinite(x)) {
      xValues.push(x);
    }
    if (Number.isFinite(y)) {
      yValues.push(y);
    }
  });

  return {
    x: Array.isArray(plane?.x) ? plane.x : buildPlaneAutoRange(xValues),
    y: Array.isArray(plane?.y) ? plane.y : buildPlaneAutoRange(yValues)
  };
}

function buildPlaneVectorEntry(from, to, label, tone = "primary", role = "vector", extra = {}) {
  return {
    from,
    to,
    label,
    tone,
    role,
    ...extra
  };
}

function assignPlaneVectorTones(vectors = []) {
  const fallbackTones = ["primary", "secondary", "tertiary", "quaternary"];
  let nextToneIndex = 0;
  return vectors.map((vector) => {
    if (vector?.tone) {
      return vector;
    }
    if (vector?.role === "result") {
      return { ...vector, tone: "result" };
    }
    const tone = fallbackTones[nextToneIndex] || fallbackTones[fallbackTones.length - 1];
    nextToneIndex += 1;
    return { ...vector, tone };
  });
}

function assignPlanePointTones(points = []) {
  const fallbackTones = ["primary", "secondary", "tertiary", "quaternary"];
  return points.map((point, index) => (point?.tone ? point : { ...point, tone: fallbackTones[index] || fallbackTones[fallbackTones.length - 1] }));
}

function buildPlaneResultText(resultLabel, values) {
  if (!Array.isArray(values) || values.length !== 2) {
    return "";
  }
  return `${resultLabel} = (${formatMathCoordinateItem(values[0])}, ${formatMathCoordinateItem(values[1])})`;
}

function buildPlaneDistanceGuides(start, end) {
  const x1 = Number(start?.[0] || 0);
  const y1 = Number(start?.[1] || 0);
  const x2 = Number(end?.[0] || 0);
  const y2 = Number(end?.[1] || 0);
  return [
    {
      from: [x1, y1],
      to: [x2, y1],
      tone: "secondary",
      dashed: true,
      role: "guide-horizontal"
    },
    {
      from: [x2, y1],
      to: [x2, y2],
      tone: "tertiary",
      dashed: true,
      role: "guide-vertical"
    }
  ];
}

function buildPlaneBlock(card) {
  const plane = card?.plane || {};
  const mode = readPlaneMode(plane);
  const block = {
    kind: "plane",
    mode,
    vectors: [],
    segments: [],
    points: [],
    resultText: ""
  };

  if (mode === "vector") {
    const vector = plane.vector;
    block.vectors = [buildPlaneVectorEntry([0, 0], vector, `v=${formatCoordinatePair(vector)}`, "", "vector")];
    block.summaryText = `Vetor ${formatCoordinatePair(vector)}`;
  } else if (mode === "vectors") {
    const labelPool = ["v", "w", "u", "t"];
    block.vectors = plane.vectors.map((vector, index) =>
      buildPlaneVectorEntry([0, 0], vector, labelPool[index] || `v${index + 1}`, "", "vector")
    );
    block.summaryText = plane.vectors
      .map((vector, index) => `${labelPool[index] || `v${index + 1}`}=${formatCoordinatePair(vector)}`)
      .join(", ");
  } else if (mode === "sum") {
    const [first, second] = plane.sum;
    const result = [first[0] + second[0], first[1] + second[1]];
    const hasExplicitResult = plane.result !== undefined;
    block.vectors = [
      buildPlaneVectorEntry([0, 0], first, "v", "", "vector"),
      buildPlaneVectorEntry([0, 0], second, "w", "", "vector"),
      buildPlaneVectorEntry(first, result, "w deslocado", "", "vector", { dashed: true }),
      buildPlaneVectorEntry([0, 0], result, "v+w", "", "result")
    ];
    block.resultText = hasExplicitResult ? buildPlaneResultText("v+w", plane.result) : "";
    block.summaryText = hasExplicitResult ? `v+w=${formatCoordinatePair(result)}` : `v=${formatCoordinatePair(first)}, w=${formatCoordinatePair(second)}`;
    block.note = `Para somar no desenho, copie w=${formatCoordinatePair(second)} para começar na ponta de v=${formatCoordinatePair(first)}. A ponta dessa cópia marca o vetor soma.`;
  } else if (mode === "scale") {
    const vector = plane.scale.vector;
    const scaled = [plane.scale.k * vector[0], plane.scale.k * vector[1]];
    const scaleLabel = formatMathNumber(plane.scale.k);
    block.vectors = [
      buildPlaneVectorEntry([0, 0], vector, "v", "", "vector"),
      buildPlaneVectorEntry([0, 0], scaled, `${scaleLabel}v`, "", "result")
    ];
    block.summaryText = `${scaleLabel}v=${formatCoordinatePair(scaled)}`;
  } else if (mode === "distance") {
    const [start, end] = plane.distance;
    const dx = Number(end?.[0] || 0) - Number(start?.[0] || 0);
    const dy = Number(end?.[1] || 0) - Number(start?.[1] || 0);
    block.points = [
      { at: start, label: `A${formatCoordinatePair(start)}` },
      { at: end, label: `B${formatCoordinatePair(end)}` }
    ];
    block.segments = [
      {
        from: start,
        to: end,
        tone: "result",
        dashed: false,
        role: "distance"
      },
      ...buildPlaneDistanceGuides(start, end)
    ];
    block.summaryText = `A${formatCoordinatePair(start)}, B${formatCoordinatePair(end)}`;
    block.note = `Tracejado laranja: ${formatMathNumber(Math.abs(dx))} em x. Tracejado verde-água: ${formatMathNumber(Math.abs(dy))} em y.`;
  }

  block.vectors = assignPlaneVectorTones(block.vectors);
  block.points = assignPlanePointTones(block.points);

  const rangePoints = [
    [0, 0],
    ...block.vectors.flatMap((vector) => [vector.from, vector.to]),
    ...block.points.map((point) => point.at),
    ...block.segments.flatMap((segment) => [segment.from, segment.to])
  ];
  const ranges = buildPlaneRanges(plane, rangePoints);

  return {
    ...block,
    xRange: ranges.x,
    yRange: ranges.y
  };
}

function buildGraphEdgeKey(from, to) {
  return [String(from || ""), String(to || "")].sort().join("::");
}

function fitGraphCoordinatesToBoard(vertices) {
  const safeVertices = Array.isArray(vertices) ? vertices : [];
  if (!safeVertices.length) {
    return new Map();
  }

  const BOARD_CENTER = 50;
  const BOARD_SPAN = 68;
  const EPSILON = 0.0001;
  const xValues = safeVertices.map((vertex) => Number(vertex?.x));
  const yValues = safeVertices.map((vertex) => Number(vertex?.y));
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  if (rangeX < EPSILON && rangeY < EPSILON) {
    return new Map(
      safeVertices.map((vertex) => [
        vertex.id,
        { x: BOARD_CENTER, y: BOARD_CENTER }
      ])
    );
  }

  const scaleX = rangeX < EPSILON ? Number.POSITIVE_INFINITY : BOARD_SPAN / rangeX;
  const scaleY = rangeY < EPSILON ? Number.POSITIVE_INFINITY : BOARD_SPAN / rangeY;
  const scale = Math.min(scaleX, scaleY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return new Map(
    safeVertices.map((vertex) => {
      const sourceX = Number(vertex.x);
      const sourceY = Number(vertex.y);
      const x = rangeX < EPSILON ? BOARD_CENTER : Number((BOARD_CENTER + (sourceX - midX) * scale).toFixed(2));
      const y = rangeY < EPSILON ? BOARD_CENTER : Number((BOARD_CENTER + (sourceY - midY) * scale).toFixed(2));
      return [vertex.id, { x, y }];
    })
  );
}

function buildGraphAutoLayout(vertexCount, index) {
  const total = Math.max(1, Number(vertexCount || 1));
  const angle = (-Math.PI / 2) + ((Math.PI * 2) / total) * index;
  const radius = total <= 2 ? 30 : 34;
  return {
    x: Number((50 + Math.cos(angle) * radius).toFixed(2)),
    y: Number((50 + Math.sin(angle) * radius).toFixed(2))
  };
}

function buildGraphSummary(vertices = [], edges = []) {
  const vertexList = vertices.map((vertex) => vertex.label || vertex.id).filter(Boolean).join(", ");
  const edgeList = edges.map((edge) => `${edge.from}-${edge.to}`).join(", ");
  if (vertexList && edgeList) {
    return `Grafo com vértices ${vertexList} e arestas ${edgeList}.`;
  }
  if (vertexList) {
    return `Grafo com vértices ${vertexList}.`;
  }
  return "Grafo.";
}

function buildGraphBlock(card) {
  const graph = card?.graph || {};
  const sourceVertices = Array.isArray(graph.vertices) ? graph.vertices : [];
  const sourceEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const highlightVertexIds = new Set(
    (Array.isArray(graph?.highlight?.vertices) ? graph.highlight.vertices : [])
      .map((item) => normalizeText(item).trim())
      .filter(Boolean)
  );
  const highlightEdgeKeys = new Set(
    (Array.isArray(graph?.highlight?.edges) ? graph.highlight.edges : [])
      .filter((pair) => Array.isArray(pair) && pair.length === 2)
      .map((pair) => buildGraphEdgeKey(normalizeText(pair[0]).trim(), normalizeText(pair[1]).trim()))
      .filter(Boolean)
  );
  const useFixedCoordinates = sourceVertices.length > 0 && sourceVertices.every((vertex) =>
    Number.isFinite(Number(vertex?.x)) && Number.isFinite(Number(vertex?.y))
  );
  const fittedCoordinates = useFixedCoordinates ? fitGraphCoordinatesToBoard(sourceVertices) : new Map();

  const vertices = sourceVertices.map((vertex, index) => {
    const layout = useFixedCoordinates
      ? fittedCoordinates.get(vertex.id) || { x: Number(vertex.x), y: Number(vertex.y) }
      : buildGraphAutoLayout(sourceVertices.length, index);
    const id = normalizeText(vertex?.id).trim();
    const label = normalizeText(vertex?.label).trim() || id;
    return {
      id,
      label,
      x: layout.x,
      y: layout.y,
      highlighted: highlightVertexIds.has(id)
    };
  }).filter((vertex) => vertex.id);

  const vertexMap = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const pairCounts = new Map();
  const rawEdges = sourceEdges.map((edge) => {
    const from = normalizeText(edge?.from).trim();
    const to = normalizeText(edge?.to).trim();
    const key = buildGraphEdgeKey(from, to);
    if (!from || !to || from === to || !vertexMap.has(from) || !vertexMap.has(to)) {
      return null;
    }
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    return {
      from,
      to,
      key,
      label: normalizeText(edge?.label).trim(),
      weight: typeof edge?.weight === "number" && Number.isFinite(edge.weight)
        ? formatMathNumber(edge.weight)
        : normalizeText(edge?.weight).trim(),
      highlighted: highlightEdgeKeys.has(key)
    };
  }).filter(Boolean);

  const pairSlots = new Map();
  const edges = rawEdges.map((edge) => {
    const slot = pairSlots.get(edge.key) || 0;
    pairSlots.set(edge.key, slot + 1);
    return {
      ...edge,
      parallelIndex: slot,
      parallelCount: pairCounts.get(edge.key) || 1
    };
  });

  return {
    kind: "graph",
    vertices,
    edges,
    summaryText: buildGraphSummary(vertices, edges),
    ariaLabel: buildGraphSummary(vertices, edges)
  };
}

function normalizeMatrixHighlightList(highlight) {
  if (Array.isArray(highlight)) {
    return highlight.map((item) => normalizeText(item)).filter(Boolean);
  }
  const token = normalizeText(highlight);
  return token ? [token] : [];
}

function buildMatrixHighlightCells(highlight, rowCount, columnCount) {
  const selectors = normalizeMatrixHighlightList(highlight);
  const cells = new Set();

  selectors.forEach((selector) => {
    if (selector === "mainDiagonal") {
      const size = Math.min(rowCount, columnCount);
      for (let index = 0; index < size; index += 1) {
        cells.add(`${index}:${index}`);
      }
      return;
    }
    if (selector === "secondaryDiagonal") {
      const size = Math.min(rowCount, columnCount);
      for (let index = 0; index < size; index += 1) {
        cells.add(`${index}:${columnCount - 1 - index}`);
      }
      return;
    }

    const rowMatch = selector.match(/^row:(\d+)$/);
    if (rowMatch) {
      const rowIndex = Number(rowMatch[1]) - 1;
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        cells.add(`${rowIndex}:${columnIndex}`);
      }
      return;
    }

    const colMatch = selector.match(/^col:(\d+)$/);
    if (colMatch) {
      const columnIndex = Number(colMatch[1]) - 1;
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        cells.add(`${rowIndex}:${columnIndex}`);
      }
      return;
    }

    const cellMatch = selector.match(/^cell:(\d+),(\d+)$/);
    if (cellMatch) {
      cells.add(`${Number(cellMatch[1]) - 1}:${Number(cellMatch[2]) - 1}`);
    }
  });

  return Array.from(cells);
}

function buildMatrixRuntimeItem(matrix = {}) {
  const values = (Array.isArray(matrix.values) ? matrix.values : []).map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => ({
      value: typeof cell === "number" ? formatMathNumber(cell) : normalizeText(cell)
    }))
  );
  const rowCount = values.length;
  const columnCount = values[0]?.length || 0;

  return {
    ...(normalizeText(matrix.connector) ? { connector: normalizeText(matrix.connector) } : {}),
    ...(normalizeText(matrix.name) ? { name: normalizeText(matrix.name) } : {}),
    values,
    rowCount,
    columnCount,
    highlightCells: buildMatrixHighlightCells(matrix.highlight, rowCount, columnCount),
    dividerAfterColumn: Number.isInteger(matrix.dividerAfterColumn) ? matrix.dividerAfterColumn : null,
    summaryText: values.map((row) => row.map((cell) => cell.value).join(" ")).join(" | ")
  };
}

function buildMatrixBlock(card) {
  const matrix = card?.matrix || {};
  if (Array.isArray(matrix.sequence)) {
    const sequence = matrix.sequence.map(buildMatrixRuntimeItem);
    return {
      kind: "matrix",
      ...(normalizeText(matrix.name) ? { name: normalizeText(matrix.name) } : {}),
      sequence,
      summaryText: sequence
        .map((item, index) => [index > 0 ? item.connector || "=" : "", item.name || "", item.summaryText].filter(Boolean).join(" "))
        .join(" ")
    };
  }

  return {
    kind: "matrix",
    ...buildMatrixRuntimeItem(matrix)
  };
}

function appendIntroParagraph(blocks, card) {
  const say = enrichTextGapsWithWrong(card?.say, card?.wrong).trim();
  if (say) {
    blocks.push(buildParagraphBlock(say));
  }
}

function buildCardSpecificBlocks(card) {
  if (!card || typeof card !== "object") {
    return [];
  }

  const kind = getContractCardKind(card);
  const blocks = [];

  if (kind === "ask") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildChoiceBlock(card));
    return blocks;
  }
  if (kind === "code") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildEditorBlock(card));
    return blocks;
  }
  if (kind === "table") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildTableBlock(card));
    return blocks;
  }
  if (kind === "tree") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildDirectoryTreeBlock(card));
    return blocks;
  }
  if (kind === "flow") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildFlowchartBlock(card));
    return blocks;
  }
  if (kind === "plane") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildPlaneBlock(card));
    return blocks;
  }
  if (kind === "graph") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildGraphBlock(card));
    return blocks;
  }
  if (kind === "matrix") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildMatrixBlock(card));
    return blocks;
  }

  blocks.push(buildParagraphBlock(enrichTextGapsWithWrong(card?.say, card?.wrong)));
  return blocks;
}

export function readCardText(card) {
  if (!card || typeof card !== "object") {
    return "";
  }

  if (typeof card.say === "string") {
    return card.say;
  }
  if (typeof card.ask === "string") {
    return card.ask;
  }
  if (typeof card.code === "string") {
    return card.code;
  }
  if (Array.isArray(card?.table?.rows) && card.table.rows.length) {
    return card.table.rows
      .map((row) => (Array.isArray(row) ? row.join(" | ") : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(card?.table?.columns) && card.table.columns.length) {
    return card.table.columns.join(" | ");
  }
  if (card.plane && typeof card.plane === "object") {
    return buildPlaneBlock(card).summaryText || "plane";
  }
  if (card.matrix && typeof card.matrix === "object") {
    return buildMatrixBlock(card).summaryText || "matrix";
  }
  if (card.graph && typeof card.graph === "object") {
    return buildGraphBlock(card).summaryText || "graph";
  }
  if (card.tree && typeof card.tree === "object") {
    return normalizeText(card.tree.current) || normalizeText(card.tree.base) || "tree";
  }
  if (Array.isArray(card.flow) && card.flow.length) {
    return card.flow
      .map((step) => {
        const [kind] = Object.keys(step || {}).filter((key) => key !== "id" && key !== "blank");
        return kind ? `${kind}: ${step[kind]}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export function buildCardRuntime(card) {
  const title = normalizeText(card?.title).trim() || normalizeText(card?.key).trim() || "Novo card";
  const blocks = [
    buildHeadingBlock(title),
    ...buildCardSpecificBlocks(card),
    buildButtonBlock(card?.after)
  ];

  return {
    title,
    blocks,
    fallbackText: readCardText(card)
  };
}

export function resolveCardRuntime(card) {
  if (card?.runtime?.blocks && Array.isArray(card.runtime.blocks)) {
    return clone(card.runtime);
  }

  return buildCardRuntime(card);
}
