import { normalizeFlowchartStructure } from "./flowchartStructure.js";

function clone(value) {
  return structuredClone(value);
}

function createIdFactory() {
  let counter = 0;
  return function nextId(prefix = "flow") {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

const nextId = createIdFactory();

const LEAF_KINDS = Object.freeze([
  "start",
  "end",
  "input",
  "output",
  "process"
]);

const GRAPH_NODE_SHAPES = Object.freeze({
  start: { kind: "terminator", shape: "terminal", text: "Início", column: "center" },
  end: { kind: "terminator", shape: "terminal", text: "Fim", column: "center" },
  input: { kind: "input", shape: "keyboard_input", text: "", column: "center" },
  output: { kind: "output", shape: "screen_output", text: "", column: "center" },
  process: { kind: "process", shape: "process", text: "", column: "center" },
  if_then: { kind: "decision", shape: "decision", text: "", column: "center" },
  if_then_else: { kind: "decision", shape: "decision", text: "", column: "center" },
  while: { kind: "decision", shape: "decision", text: "", column: "center" },
  do_while: { kind: "decision", shape: "decision", text: "", column: "center" },
  if_chain: { kind: "decision", shape: "decision", text: "", column: "center" },
  switch_case: { kind: "decision", shape: "decision", text: "", column: "center" },
  for: { kind: "for_control", shape: "loop", text: "", column: "center" },
  passthrough: { kind: "junction", shape: "connector", text: "", column: "center" }
});

function normalizeText(value, fallbackValue = "") {
  const text = String(value || "").replace(/\r/g, "").trim();
  return text || String(fallbackValue || "");
}

function normalizeOptionalText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeFlowchartShapeKey(value) {
  const allowed = [
    "terminal",
    "process",
    "input_output",
    "keyboard_input",
    "screen_output",
    "printed_output",
    "decision",
    "loop",
    "connector",
    "page_connector"
  ];
  const key = String(value || "").trim().toLowerCase();
  return allowed.includes(key) ? key : "process";
}

function resolveProjectionColumn(node) {
  const meta = node?.layoutMeta && typeof node.layoutMeta === "object" ? node.layoutMeta : null;
  const semanticKind = String(meta?.semanticKind || "");
  const branch = String(meta?.branch || "");
  const slot = Number(meta?.slot);

  if (branch === "then" || branch === "body" || branch === "switch-case") {
    return "right";
  }
  if (branch === "else") {
    return "left";
  }
  if (semanticKind === "merge" || semanticKind === "junction" || semanticKind === "for" || semanticKind === "for-init") {
    return "center";
  }
  if (Number.isFinite(slot)) {
    if (slot < 0) {
      return "left";
    }
    if (slot > 0) {
      return "right";
    }
  }
  return node?.columnHint || "center";
}

function cleanId(value, fallbackPrefix = "flow") {
  const source = String(value || "").trim();
  return source || nextId(fallbackPrefix);
}

function normalizePracticeEntry(raw, forceBlank = false) {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : raw === true
        ? { blank: true }
        : {};
  const variants = Array.isArray(source.variants)
    ? source.variants
        .map((item) => {
          const entry = item && typeof item === "object" && !Array.isArray(item) ? item : { value: item };
          return {
            id: cleanId(entry.id, "flow-variant"),
            value: String(entry.value || "").replace(/\r/g, "").trim(),
            regex: !!entry.regex
          };
        })
        .filter((item) => item.value)
    : [];
  const options = Array.isArray(source.options)
    ? source.options
        .map((item, index) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            return {
              id: String(item.id || `flow-option-${index}`),
              value: String(item.value || "").replace(/\r/g, "").trim(),
              enabled: item.enabled !== false
            };
          }
          return {
            id: `flow-option-${index}`,
            value: String(item || "").replace(/\r/g, "").trim(),
            enabled: true
          };
        })
        .filter((item) => item.value)
    : [];
  const entry = {};

  if (source.blank === true || forceBlank === true || variants.length || options.length) {
    entry.blank = true;
  }
  if ((source.mode === "choice" || options.length) && entry.blank) {
    entry.mode = "choice";
  }
  if (options.length) {
    entry.options = options;
  }
  if (variants.length) {
    entry.variants = variants;
  }

  return Object.keys(entry).length ? entry : null;
}

function clonePracticeEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const cloned = {};
  if (entry.blank === true) cloned.blank = true;
  if (entry.mode === "choice") cloned.mode = "choice";
  if (Array.isArray(entry.options) && entry.options.length) cloned.options = clone(entry.options);
  if (Array.isArray(entry.variants) && entry.variants.length) cloned.variants = clone(entry.variants);
  return Object.keys(cloned).length ? cloned : null;
}

function normalizePractice(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const practice = {};
  const textEntry = normalizePracticeEntry(raw.text, raw.blankText === true);
  const labelsSource =
    raw.labels && typeof raw.labels === "object" && !Array.isArray(raw.labels)
      ? raw.labels
      : null;
  const labels = {};

  if (raw.blankShape === true) {
    practice.blankShape = true;
  }
  if (Array.isArray(raw.shapeOptions) && raw.shapeOptions.length) {
    practice.blankShape = true;
    practice.shapeOptions = raw.shapeOptions.map((item) => normalizeFlowchartShapeKey(item)).filter(Boolean);
  }
  if (textEntry) {
    practice.text = textEntry;
  }
  if (labelsSource) {
    Object.keys(labelsSource).forEach((key) => {
      const entry = normalizePracticeEntry(labelsSource[key], labelsSource[key] === true);
      if (entry) labels[key] = entry;
    });
  }
  if (raw.blankLabel === true && !labels.default) {
    labels.default = { blank: true };
  }
  if (Object.keys(labels).length) {
    practice.labels = labels;
  }

  return Object.keys(practice).length ? practice : null;
}

function mergePractice(parentRaw, childRaw) {
  const parent = normalizePractice(parentRaw);
  const child = normalizePractice(childRaw);
  if (!parent && !child) {
    return null;
  }

  const merged = {};
  if ((parent && parent.blankShape) || (child && child.blankShape)) {
    merged.blankShape = true;
  }
  if (parent?.shapeOptions?.length) merged.shapeOptions = clone(parent.shapeOptions);
  if (child?.shapeOptions?.length) merged.shapeOptions = clone(child.shapeOptions);
  if (parent?.text) merged.text = clonePracticeEntry(parent.text);
  if (child?.text) merged.text = clonePracticeEntry(child.text);

  const labels = {};
  Object.keys(parent?.labels || {}).forEach((key) => {
    labels[key] = clonePracticeEntry(parent.labels[key]);
  });
  Object.keys(child?.labels || {}).forEach((key) => {
    labels[key] = clonePracticeEntry(child.labels[key]);
  });
  if (Object.keys(labels).length) {
    merged.labels = labels;
  }

  return Object.keys(merged).length ? merged : null;
}

function getPracticeLabelEntry(practice, key) {
  const normalized = normalizePractice(practice);
  const labels = normalized?.labels && typeof normalized.labels === "object" ? normalized.labels : null;
  if (!labels) {
    return null;
  }
  return labels[String(key) || ""] || labels.default || null;
}

function getPracticeTextEntry(practice) {
  const normalized = normalizePractice(practice);
  return normalized?.text ? normalized.text : null;
}

function makeUniqueId(registry, baseId) {
  const source = String(baseId || nextId("flow"));
  if (!registry[source]) {
    registry[source] = 1;
    return source;
  }

  registry[source] += 1;
  return `${source}__${registry[source]}`;
}

function createExpandState() {
  return {
    nodes: [],
    edges: [],
    nodeIds: Object.create(null),
    edgeIds: Object.create(null),
    layoutPlanByNodeId: null
  };
}

function addGraphNode(state, spec) {
  const meta = GRAPH_NODE_SHAPES[spec.metaKey] || GRAPH_NODE_SHAPES.process;
  const nodeId = makeUniqueId(state.nodeIds, spec.id || spec.originId || nextId("flow-node"));
  const layoutMeta =
    state.layoutPlanByNodeId &&
    state.layoutPlanByNodeId[nodeId] &&
    typeof state.layoutPlanByNodeId[nodeId] === "object"
      ? clone(state.layoutPlanByNodeId[nodeId])
      : null;
  const node = {
    id: nodeId,
    originId: String(spec.originId || spec.id || nodeId),
    kind: meta.kind,
    shape: normalizeFlowchartShapeKey(spec.shape || meta.shape),
    text: normalizeText(spec.text, meta.text),
    role: spec.role || "main",
    columnHint: spec.column || meta.column || "center",
    practice: spec.practice ? clone(spec.practice) : null,
    layoutMeta
  };

  state.nodes.push(node);
  return node;
}

function addGraphEdge(state, spec) {
  if (!spec.from || !spec.to || spec.from === spec.to) {
    return null;
  }

  const edge = {
    id: makeUniqueId(
      state.edgeIds,
      String(spec.id || `${spec.from}__${spec.to}__${spec.outputSlot == null ? "0" : spec.outputSlot}`)
    ),
    from: String(spec.from),
    to: String(spec.to),
    role: String(spec.role || "next"),
    label: normalizeOptionalText(spec.label),
    outputSlot: spec.outputSlot === 1 ? 1 : 0,
    layoutMeta: spec.layoutMeta && typeof spec.layoutMeta === "object" ? clone(spec.layoutMeta) : null,
    practice: spec.practice ? clone(spec.practice) : null
  };

  state.edges.push(edge);
  return edge;
}

function createConnectorNode(state, spec) {
  return addGraphNode(state, {
    id: spec.id,
    originId: spec.originId,
    metaKey: "passthrough",
    text: "",
    role: spec.role || "merge",
    column: spec.column || "center",
    practice: null
  });
}

function makeExitPort(fromNodeId, role, label, outputSlot, practice) {
  return {
    fromNodeId: String(fromNodeId || ""),
    role: String(role || "next"),
    label: normalizeOptionalText(label),
    outputSlot: outputSlot === 1 ? 1 : 0,
    practice: practice ? clone(practice) : null
  };
}

function getIfChainDecisionNodeId(node, caseItem, caseIndex) {
  return caseIndex <= 0
    ? String(node?.id || "")
    : `${String(node?.id || "")}__case__${String(caseItem?.id || caseIndex)}`;
}

function getSwitchCaseDecisionNodeId(node, caseItem, caseIndex) {
  return caseIndex <= 0
    ? String(node?.id || "")
    : `${String(node?.id || "")}__case__${String(caseItem?.id || caseIndex)}`;
}

function buildSwitchCaseDecisionText(expression, match) {
  return `${normalizeText(expression, "Valor")} = ${normalizeText(match, "Caso")}?`;
}

function buildStructureLayoutPlan(structure) {
  const layout = buildStructureNodeLayout(structure);
  if (!layout) {
    return null;
  }
  return {
    nodeLayoutById: layout.nodeLayoutById
  };
}

function buildStructureNodeLayout(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.kind === "sequence") {
    return buildSequenceLayout(node.items);
  }

  if (LEAF_KINDS.includes(node.kind)) {
    const entry = createStructureLayoutEntry(0, node.kind, {
      controlId: node.id,
      branch: "main",
      level: 0
    });
    return {
      minSlot: 0,
      maxSlot: 0,
      anchorSlot: 0,
      minLevel: 0,
      maxLevel: 0,
      entryLevel: 0,
      exitLevel: 0,
      nodeLayoutById: createNodeLayoutMap(node.id, entry)
    };
  }

  if (node.kind === "if_then") {
    const thenLayout = buildSequenceLayout(node.thenBranch);
    if (!thenLayout) {
      return null;
    }
    const thenShift = hasStructureLayoutNodes(thenLayout) ? 1 - thenLayout.minSlot : 0;
    const thenLevelShift = 1 - thenLayout.entryLevel;
    const thenExitLevel = thenLayout.exitLevel + thenLevelShift;
    const mergeLevel = Math.max(1, thenExitLevel + 1);
    const result = createEmptyStructureLayout();
    overlayStructureLayout(result, thenLayout, thenShift, thenLevelShift);
    result.nodeLayoutById[node.id] = createStructureLayoutEntry(0, "if_then", {
      controlId: node.id,
      branch: "main",
      level: 0
    });
    result.nodeLayoutById[`${node.id}__merge`] = createStructureLayoutEntry(0, "merge", {
      controlId: node.id,
      branch: "merge",
      level: mergeLevel
    });
    result.maxLevel = Math.max(mergeLevel, result.maxLevel);
    result.exitLevel = mergeLevel;
    return normalizeStructureLayout(result);
  }

  if (node.kind === "if_then_else") {
    const thenLayout = buildSequenceLayout(node.thenBranch);
    const elseLayout = buildSequenceLayout(node.elseBranch);
    if (!thenLayout || !elseLayout) {
      return null;
    }
    const thenShift = hasStructureLayoutNodes(thenLayout) ? 1 - thenLayout.minSlot : 0;
    const elseShift = hasStructureLayoutNodes(elseLayout) ? -1 - elseLayout.maxSlot : 0;
    const thenLevelShift = 1 - thenLayout.entryLevel;
    const elseLevelShift = 1 - elseLayout.entryLevel;
    const thenExitLevel = thenLayout.exitLevel + thenLevelShift;
    const elseExitLevel = elseLayout.exitLevel + elseLevelShift;
    const mergeLevel = Math.max(1, thenExitLevel + 1, elseExitLevel + 1);
    const result = createEmptyStructureLayout();
    overlayStructureLayout(result, elseLayout, elseShift, elseLevelShift);
    overlayStructureLayout(result, thenLayout, thenShift, thenLevelShift);
    result.nodeLayoutById[node.id] = createStructureLayoutEntry(0, "if_then_else", {
      controlId: node.id,
      branch: "main",
      level: 0
    });
    result.nodeLayoutById[`${node.id}__merge`] = createStructureLayoutEntry(0, "merge", {
      controlId: node.id,
      branch: "merge",
      level: mergeLevel
    });
    result.maxLevel = Math.max(mergeLevel, result.maxLevel);
    result.exitLevel = mergeLevel;
    return normalizeStructureLayout(result);
  }

  if (node.kind === "while") {
    const bodyLayout = buildSequenceLayout(node.body);
    if (!bodyLayout) {
      return null;
    }
    const bodyShift = 0 - bodyLayout.anchorSlot;
    const bodyLevelShift = 1 - bodyLayout.entryLevel;
    const bodyExitLevel = hasStructureLayoutNodes(bodyLayout) ? bodyLayout.exitLevel + bodyLevelShift : 1;
    const result = createEmptyStructureLayout();
    overlayStructureLayout(result, bodyLayout, bodyShift, bodyLevelShift);
    result.nodeLayoutById[node.id] = createStructureLayoutEntry(0, "while", {
      controlId: node.id,
      branch: "main",
      level: 0
    });
    if (!hasStructureLayoutNodes(bodyLayout)) {
      result.nodeLayoutById[`${node.id}__cycle`] = createStructureLayoutEntry(0, "loop-cycle", {
        controlId: node.id,
        branch: "body",
        level: 1
      });
    }
    result.maxLevel = Math.max(bodyExitLevel, result.maxLevel);
    result.exitLevel = bodyExitLevel;
    return normalizeStructureLayout(result);
  }

  if (node.kind === "do_while") {
    const bodyLayout = buildSequenceLayout(node.body);
    if (!bodyLayout) {
      return null;
    }
    const bodyShift = 0 - bodyLayout.anchorSlot;
    const bodyLevelShift = 1 - bodyLayout.entryLevel;
    const bodyExitLevel = hasStructureLayoutNodes(bodyLayout) ? bodyLayout.exitLevel + bodyLevelShift : 1;
    const decisionLevel = bodyExitLevel + 1;
    const result = createEmptyStructureLayout();
    overlayStructureLayout(result, bodyLayout, bodyShift, bodyLevelShift);
    result.nodeLayoutById[`${node.id}__junction`] = createStructureLayoutEntry(0, "junction", {
      controlId: node.id,
      branch: "entry",
      level: 0
    });
    result.nodeLayoutById[node.id] = createStructureLayoutEntry(0, "do_while", {
      controlId: node.id,
      branch: "main",
      level: decisionLevel
    });
    if (!hasStructureLayoutNodes(bodyLayout)) {
      result.nodeLayoutById[`${node.id}__cycle`] = createStructureLayoutEntry(0, "loop-cycle", {
        controlId: node.id,
        branch: "body",
        level: 1
      });
    }
    result.maxLevel = Math.max(decisionLevel, result.maxLevel);
    result.exitLevel = decisionLevel;
    return normalizeStructureLayout(result);
  }

  if (node.kind === "for") {
    const bodyLayout = buildSequenceLayout(node.body);
    if (!bodyLayout) {
      return null;
    }
    const bodyShift = 0 - bodyLayout.anchorSlot;
    const controlLevel = node.init ? 1 : 0;
    const bodyLevelShift = controlLevel + 1 - bodyLayout.entryLevel;
    const bodyExitLevel = hasStructureLayoutNodes(bodyLayout) ? bodyLayout.exitLevel + bodyLevelShift : controlLevel + 1;
    const updateLevel = Math.max(controlLevel + 1, bodyExitLevel + (hasStructureLayoutNodes(bodyLayout) ? 1 : 0));
    const loopFloorLevel = node.update
      ? updateLevel
      : hasStructureLayoutNodes(bodyLayout)
        ? bodyExitLevel
        : controlLevel + 1;
    const result = createEmptyStructureLayout();
    overlayStructureLayout(result, bodyLayout, bodyShift, bodyLevelShift);
    if (node.init) {
      result.nodeLayoutById[`${node.id}__init`] = createStructureLayoutEntry(0, "for-init", {
        controlId: node.id,
        branch: "main",
        level: 0
      });
    }
    result.nodeLayoutById[node.id] = createStructureLayoutEntry(0, "for", {
      controlId: node.id,
      branch: "main",
      level: controlLevel
    });
    if (node.update) {
      result.nodeLayoutById[`${node.id}__update`] = createStructureLayoutEntry(0, "for-update", {
        controlId: node.id,
        branch: "body",
        level: updateLevel
      });
    }
    if (!hasStructureLayoutNodes(bodyLayout) && !node.update) {
      result.nodeLayoutById[`${node.id}__cycle`] = createStructureLayoutEntry(0, "loop-cycle", {
        controlId: node.id,
        branch: "body",
        level: controlLevel + 1
      });
    }
    result.maxLevel = Math.max(loopFloorLevel, result.maxLevel);
    result.entryLevel = node.init ? 0 : controlLevel;
    result.exitLevel = loopFloorLevel;
    return normalizeStructureLayout(result);
  }

  if (node.kind === "if_chain") {
    const result = createEmptyStructureLayout();
    const caseList = Array.isArray(node.cases) ? node.cases : [];
    let hasCase = false;
    let nextDecisionLevel = 0;
    let deepestBranchLevel = 0;
    let lastDecisionSlot = 0;

    caseList.forEach((caseItem, caseIndex) => {
      const caseLayout = buildSequenceLayout(caseItem.thenBranch);
      if (!caseLayout) {
        return;
      }
      hasCase = true;
      const decisionSlot = 0 - caseIndex;
      const decisionLevel = nextDecisionLevel;
      const caseShift = hasStructureLayoutNodes(caseLayout) ? decisionSlot + 1 - caseLayout.minSlot : 0;
      const caseLevelShift = decisionLevel + 1 - caseLayout.entryLevel;
      const caseExitLevel = hasStructureLayoutNodes(caseLayout) ? caseLayout.exitLevel + caseLevelShift : decisionLevel + 1;
      overlayStructureLayout(result, caseLayout, caseShift, caseLevelShift);
      result.nodeLayoutById[getIfChainDecisionNodeId(node, caseItem, caseIndex)] = createStructureLayoutEntry(
        decisionSlot,
        caseIndex === 0 ? "if_chain" : "if_chain_case",
        {
          controlId: node.id,
          branch: "main",
          level: decisionLevel
        }
      );
      lastDecisionSlot = decisionSlot;
      deepestBranchLevel = Math.max(deepestBranchLevel, caseExitLevel);
      nextDecisionLevel = decisionLevel + 1;
    });

    const elseLayout = buildSequenceLayout(node.elseBranch);
    if (!elseLayout) {
      return null;
    }
    const elseShift = hasStructureLayoutNodes(elseLayout) ? lastDecisionSlot - 1 - elseLayout.maxSlot : 0;
    const elseLevelShift = nextDecisionLevel - elseLayout.entryLevel;
    const elseExitLevel = hasStructureLayoutNodes(elseLayout) ? elseLayout.exitLevel + elseLevelShift : nextDecisionLevel;
    const mergeLevel = Math.max(nextDecisionLevel + 1, deepestBranchLevel + 1, elseExitLevel + 1);
    overlayStructureLayout(result, elseLayout, elseShift, elseLevelShift);
    result.nodeLayoutById[`${node.id}__merge`] = createStructureLayoutEntry(0, "merge", {
      controlId: node.id,
      branch: "merge",
      level: mergeLevel
    });
    if (!hasCase && !hasStructureLayoutNodes(elseLayout)) {
      return null;
    }
    result.maxLevel = Math.max(mergeLevel, result.maxLevel);
    result.exitLevel = mergeLevel;
    return normalizeStructureLayout(result);
  }

  if (node.kind === "switch_case") {
    const result = createEmptyStructureLayout();
    const caseList = Array.isArray(node.cases) ? node.cases : [];
    let nextDecisionLevel = 0;
    let deepestBranchLevel = 0;

    caseList.forEach((caseItem, caseIndex) => {
      const caseLayout = buildSequenceLayout(caseItem.body);
      if (!caseLayout) {
        return;
      }
      const decisionLevel = nextDecisionLevel;
      const caseShift = hasStructureLayoutNodes(caseLayout) ? 1 - caseLayout.minSlot : 0;
      const caseLevelShift = decisionLevel - caseLayout.entryLevel;
      const caseExitLevel = hasStructureLayoutNodes(caseLayout) ? caseLayout.exitLevel + caseLevelShift : decisionLevel;
      overlayStructureLayout(result, caseLayout, caseShift, caseLevelShift);
      result.nodeLayoutById[getSwitchCaseDecisionNodeId(node, caseItem, caseIndex)] = createStructureLayoutEntry(
        0,
        caseIndex === 0 ? "switch_case" : "switch_case_case",
        {
          controlId: node.id,
          branch: "main",
          level: decisionLevel
        }
      );
      deepestBranchLevel = Math.max(deepestBranchLevel, caseExitLevel);
      nextDecisionLevel = Math.max(decisionLevel + 2, caseExitLevel + 2);
    });

    const defaultLayout = buildSequenceLayout(node.defaultBranch);
    if (!defaultLayout) {
      return null;
    }
    const defaultStartLevel = caseList.length ? nextDecisionLevel : 0;
    const defaultShift = 0 - defaultLayout.anchorSlot;
    const defaultLevelShift = defaultStartLevel - defaultLayout.entryLevel;
    const defaultExitLevel = hasStructureLayoutNodes(defaultLayout)
      ? defaultLayout.exitLevel + defaultLevelShift
      : defaultStartLevel;
    const mergeLevel = Math.max(defaultStartLevel + 1, deepestBranchLevel + 2, defaultExitLevel + 1);
    overlayStructureLayout(result, defaultLayout, defaultShift, defaultLevelShift);
    result.nodeLayoutById[`${node.id}__merge`] = createStructureLayoutEntry(0, "merge", {
      controlId: node.id,
      branch: "merge",
      level: mergeLevel
    });
    if (!caseList.length && !hasStructureLayoutNodes(defaultLayout)) {
      return null;
    }
    result.maxLevel = Math.max(mergeLevel, result.maxLevel);
    result.exitLevel = mergeLevel;
    return normalizeStructureLayout(result);
  }

  return null;
}

function buildSequenceLayout(items) {
  const list = Array.isArray(items) ? items : [];
  const result = createEmptyStructureLayout();
  let currentAnchor = 0;
  let currentLevel = 0;
  let hasChild = false;

  list.forEach((item) => {
    const childLayout = buildStructureNodeLayout(item);
    if (!childLayout) {
      hasChild = null;
      return;
    }
    if (hasChild === null) {
      return;
    }
    const slotShift = currentAnchor - childLayout.anchorSlot;
    const targetLevel = hasChild ? currentLevel + 1 : currentLevel;
    const levelShift = targetLevel - childLayout.entryLevel;
    overlayStructureLayout(result, childLayout, slotShift, levelShift);
    currentAnchor = childLayout.anchorSlot + slotShift;
    currentLevel = childLayout.exitLevel + levelShift;
    hasChild = true;
  });

  if (hasChild === null) {
    return null;
  }
  result.anchorSlot = hasChild ? currentAnchor : 0;
  result.entryLevel = 0;
  result.exitLevel = hasChild ? currentLevel : 0;
  return normalizeStructureLayout(result);
}

function createEmptyStructureLayout() {
  return {
    minSlot: 0,
    maxSlot: 0,
    anchorSlot: 0,
    minLevel: 0,
    maxLevel: 0,
    entryLevel: 0,
    exitLevel: 0,
    nodeLayoutById: Object.create(null)
  };
}

function createNodeLayoutMap(nodeId, entry) {
  const map = Object.create(null);
  map[nodeId] = entry;
  return map;
}

function createStructureLayoutEntry(slot, semanticKind, options) {
  const entry = {
    slot: Number.isFinite(Number(slot)) ? Number(slot) : 0,
    semanticKind: String(semanticKind || "sequence")
  };
  if (Number.isFinite(Number(options?.level))) {
    entry.level = Number(options.level);
  }
  if (options?.controlId) {
    entry.controlId = String(options.controlId);
  }
  if (options?.branch) {
    entry.branch = String(options.branch);
  }
  return entry;
}

function overlayStructureLayout(target, childLayout, slotShift, levelShift) {
  const safeSlotShift = Number.isFinite(Number(slotShift)) ? Number(slotShift) : 0;
  const safeLevelShift = Number.isFinite(Number(levelShift)) ? Number(levelShift) : 0;
  const childNodeLayoutById = childLayout?.nodeLayoutById || {};
  const childHasNodes = Object.keys(childNodeLayoutById).length > 0;

  Object.keys(childNodeLayoutById).forEach((nodeId) => {
    const entry = childNodeLayoutById[nodeId];
    target.nodeLayoutById[nodeId] = {
      ...entry,
      slot: Number(entry?.slot || 0) + safeSlotShift,
      level: Number(entry?.level || 0) + safeLevelShift
    };
  });

  if (!childHasNodes) {
    return;
  }

  target.minSlot = Math.min(target.minSlot, Number(childLayout.minSlot || 0) + safeSlotShift);
  target.maxSlot = Math.max(target.maxSlot, Number(childLayout.maxSlot || 0) + safeSlotShift);
  target.minLevel = Math.min(target.minLevel, Number(childLayout.minLevel || 0) + safeLevelShift);
  target.maxLevel = Math.max(target.maxLevel, Number(childLayout.maxLevel || 0) + safeLevelShift);
}

function hasStructureLayoutNodes(layout) {
  return !!(layout?.nodeLayoutById && Object.keys(layout.nodeLayoutById).length);
}

function normalizeStructureLayout(layout) {
  const safeLayout = layout && typeof layout === "object" ? layout : createEmptyStructureLayout();
  const minSlot = Number.isFinite(Number(safeLayout.minSlot)) ? Number(safeLayout.minSlot) : 0;
  const shift = minSlot < 0 ? -minSlot : 0;
  if (!shift) {
    return safeLayout;
  }

  const nodeLayoutById = Object.create(null);
  Object.keys(safeLayout.nodeLayoutById || {}).forEach((nodeId) => {
    const entry = safeLayout.nodeLayoutById[nodeId];
    nodeLayoutById[nodeId] = {
      ...entry,
      slot: Number(entry?.slot || 0) + shift
    };
  });

  return {
    minSlot: minSlot + shift,
    maxSlot: (Number.isFinite(Number(safeLayout.maxSlot)) ? Number(safeLayout.maxSlot) : 0) + shift,
    anchorSlot: (Number.isFinite(Number(safeLayout.anchorSlot)) ? Number(safeLayout.anchorSlot) : 0) + shift,
    minLevel: Number.isFinite(Number(safeLayout.minLevel)) ? Number(safeLayout.minLevel) : 0,
    maxLevel: Number.isFinite(Number(safeLayout.maxLevel)) ? Number(safeLayout.maxLevel) : 0,
    entryLevel: Number.isFinite(Number(safeLayout.entryLevel)) ? Number(safeLayout.entryLevel) : 0,
    exitLevel: Number.isFinite(Number(safeLayout.exitLevel)) ? Number(safeLayout.exitLevel) : 0,
    nodeLayoutById
  };
}

function connectExitPortsToEntry(state, exitPorts, entryNodeId, options = {}) {
  const safeEntryNodeId = String(entryNodeId || "").trim();
  if (!safeEntryNodeId) {
    return;
  }

  const seenBySource = Object.create(null);
  (Array.isArray(exitPorts) ? exitPorts : []).forEach((exitPort, index) => {
    const fromNodeId = String(exitPort?.fromNodeId || "").trim();
    if (!fromNodeId || fromNodeId === safeEntryNodeId) {
      return;
    }

    if (!seenBySource[fromNodeId]) {
      seenBySource[fromNodeId] = 0;
    }
    seenBySource[fromNodeId] += 1;

    if (seenBySource[fromNodeId] === 1 || !options.allowPassthrough) {
      addGraphEdge(state, {
        from: fromNodeId,
        to: safeEntryNodeId,
        role: options.forceRole || exitPort.role || "next",
        label: exitPort.label || "",
        outputSlot: exitPort.outputSlot === 1 ? 1 : 0,
        practice: exitPort.practice
      });
      return;
    }

    const passthroughNode = addGraphNode(state, {
      id: `${String(options.passthroughBaseId || `${fromNodeId}__pass`)}__${index}`,
      originId: fromNodeId,
      metaKey: "passthrough",
      text: "",
      role: options.passthroughRole || "merge",
      column: options.passthroughColumn || "center",
      practice: null
    });

    addGraphEdge(state, {
      from: fromNodeId,
      to: passthroughNode.id,
      role: options.forceRole || exitPort.role || "next",
      label: exitPort.label || "",
      outputSlot: exitPort.outputSlot === 1 ? 1 : 0,
      practice: exitPort.practice
    });
    addGraphEdge(state, {
      from: passthroughNode.id,
      to: safeEntryNodeId,
      role: options.forceRole || "next",
      label: "",
      outputSlot: 0
    });
  });
}

function expandSequenceItems(items, state, context) {
  const list = Array.isArray(items) ? items : [];
  const result = {
    entryNodeId: null,
    exitPorts: []
  };
  let pendingExitPorts = [];

  list.forEach((item) => {
    const child = expandStructureNode(item, state, context);
    if (!child.entryNodeId) {
      return;
    }

    if (!result.entryNodeId) {
      result.entryNodeId = child.entryNodeId;
    } else {
      connectExitPortsToEntry(state, pendingExitPorts, child.entryNodeId, {
        allowPassthrough: true,
        passthroughBaseId: `${item.id}__entry`,
        passthroughRole: context.role || "main",
        passthroughColumn: context.column || "center"
      });
    }

    pendingExitPorts = child.exitPorts.slice();
  });

  result.exitPorts = pendingExitPorts.slice();
  return result;
}

function expandStructureNode(node, state, context) {
  if (!node) {
    return { entryNodeId: null, exitPorts: [] };
  }

  if (node.kind === "sequence") {
    return expandSequenceItems(node.items, state, {
      role: context.role || "main",
      column: context.column || "center"
    });
  }

  if (LEAF_KINDS.includes(node.kind)) {
    const graphNode = addGraphNode(state, {
      id: node.id,
      originId: node.id,
      metaKey: node.kind,
      text: node.text,
      role: context.role || "main",
      column: context.column || GRAPH_NODE_SHAPES[node.kind].column,
      practice: node.practice
    });

    return {
      entryNodeId: graphNode.id,
      exitPorts: [makeExitPort(graphNode.id, "next", "", 0)]
    };
  }

  if (node.kind === "if_then") {
    const decisionNode = addGraphNode(state, {
      id: node.id,
      originId: node.id,
      metaKey: "if_then",
      text: node.condition,
      role: context.role || "main",
      column: "center",
      practice: node.practice
    });
    const mergeNode = createConnectorNode(state, {
      id: `${node.id}__merge`,
      originId: node.id,
      role: "merge",
      column: "center"
    });
    const thenBranch = expandSequenceItems(node.thenBranch, state, {
      role: "then",
      column: "right"
    });

    if (thenBranch.entryNodeId) {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: thenBranch.entryNodeId,
        role: "yes",
        label: "Sim",
        outputSlot: 1,
        practice: getPracticeLabelEntry(node.practice, "yes")
      });
      connectExitPortsToEntry(state, thenBranch.exitPorts, mergeNode.id, {
        allowPassthrough: true,
        passthroughBaseId: `${node.id}__merge_join`,
        forceRole: "merge",
        passthroughRole: "merge",
        passthroughColumn: "center"
      });
    } else {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: mergeNode.id,
        role: "yes",
        label: "Sim",
        outputSlot: 1,
        practice: getPracticeLabelEntry(node.practice, "yes")
      });
    }
    addGraphEdge(state, {
      from: decisionNode.id,
      to: mergeNode.id,
      role: "no",
      label: "Não",
      outputSlot: 0,
      practice: getPracticeLabelEntry(node.practice, "no")
    });

    return {
      entryNodeId: decisionNode.id,
      exitPorts: [makeExitPort(mergeNode.id, "next", "", 0)]
    };
  }

  if (node.kind === "if_then_else") {
    const decisionNode = addGraphNode(state, {
      id: node.id,
      originId: node.id,
      metaKey: "if_then_else",
      text: node.condition,
      role: context.role || "main",
      column: "center",
      practice: node.practice
    });
    const mergeNode = createConnectorNode(state, {
      id: `${node.id}__merge`,
      originId: node.id,
      role: "merge",
      column: "center"
    });
    const thenBranch = expandSequenceItems(node.thenBranch, state, {
      role: "then",
      column: "right"
    });
    const elseBranch = expandSequenceItems(node.elseBranch, state, {
      role: "else",
      column: "left"
    });

    if (thenBranch.entryNodeId) {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: thenBranch.entryNodeId,
        role: "yes",
        label: "Sim",
        outputSlot: 1,
        practice: getPracticeLabelEntry(node.practice, "yes")
      });
      connectExitPortsToEntry(state, thenBranch.exitPorts, mergeNode.id, {
        allowPassthrough: true,
        passthroughBaseId: `${node.id}__merge_then`,
        forceRole: "merge",
        passthroughRole: "merge",
        passthroughColumn: "center"
      });
    } else {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: mergeNode.id,
        role: "yes",
        label: "Sim",
        outputSlot: 1,
        practice: getPracticeLabelEntry(node.practice, "yes")
      });
    }

    if (elseBranch.entryNodeId) {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: elseBranch.entryNodeId,
        role: "no",
        label: "Não",
        outputSlot: 0,
        practice: getPracticeLabelEntry(node.practice, "no")
      });
      connectExitPortsToEntry(state, elseBranch.exitPorts, mergeNode.id, {
        allowPassthrough: true,
        passthroughBaseId: `${node.id}__merge_else`,
        forceRole: "merge",
        passthroughRole: "merge",
        passthroughColumn: "center"
      });
    } else {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: mergeNode.id,
        role: "no",
        label: "Não",
        outputSlot: 0,
        practice: getPracticeLabelEntry(node.practice, "no")
      });
    }

    return {
      entryNodeId: decisionNode.id,
      exitPorts: [makeExitPort(mergeNode.id, "next", "", 0)]
    };
  }

  if (node.kind === "while") {
    const decisionNode = addGraphNode(state, {
      id: node.id,
      originId: node.id,
      metaKey: "while",
      text: node.condition,
      role: context.role || "main",
      column: "center",
      practice: node.practice
    });
    const body = expandSequenceItems(node.body, state, {
      role: "loop-body",
      column: "center"
    });
    const cycleNode = !body.entryNodeId
      ? createConnectorNode(state, {
          id: `${node.id}__cycle`,
          originId: node.id,
          role: "loop-body",
          column: "center"
        })
      : null;
    const loopEntryNodeId = body.entryNodeId || (cycleNode ? cycleNode.id : null);

    if (loopEntryNodeId) {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: loopEntryNodeId,
        role: "yes",
        label: "Sim",
        outputSlot: 1,
        practice: getPracticeLabelEntry(node.practice, "yes")
      });
    }
    if (body.entryNodeId) {
      connectExitPortsToEntry(state, body.exitPorts, decisionNode.id, {
        allowPassthrough: true,
        passthroughBaseId: `${node.id}__while_return`,
        forceRole: "loop-return",
        passthroughRole: "loop-return",
        passthroughColumn: "left"
      });
    } else if (cycleNode) {
      addGraphEdge(state, {
        from: cycleNode.id,
        to: decisionNode.id,
        role: "loop-return",
        label: "",
        outputSlot: 0
      });
    }

    return {
      entryNodeId: decisionNode.id,
      exitPorts: [makeExitPort(decisionNode.id, "no", "Não", 0, getPracticeLabelEntry(node.practice, "no"))]
    };
  }

  if (node.kind === "do_while") {
    const entryConnectorNode = createConnectorNode(state, {
      id: `${node.id}__junction`,
      originId: node.id,
      role: "loop-entry",
      column: "center"
    });
    const body = expandSequenceItems(node.body, state, {
      role: "loop-body",
      column: "center"
    });
    const cycleNode = !body.entryNodeId
      ? createConnectorNode(state, {
          id: `${node.id}__cycle`,
          originId: node.id,
          role: "loop-body",
          column: "center"
        })
      : null;
    const loopEntryNodeId = body.entryNodeId || (cycleNode ? cycleNode.id : null);
    const decisionNode = addGraphNode(state, {
      id: node.id,
      originId: node.id,
      metaKey: "do_while",
      text: node.condition,
      role: context.role || "main",
      column: "center",
      practice: node.practice
    });

    if (loopEntryNodeId) {
      addGraphEdge(state, {
        from: entryConnectorNode.id,
        to: loopEntryNodeId,
        role: "next",
        label: "",
        outputSlot: 0
      });
    }

    if (body.entryNodeId) {
      connectExitPortsToEntry(state, body.exitPorts, decisionNode.id, {
        allowPassthrough: true,
        passthroughBaseId: `${node.id}__do_while_tail`,
        passthroughRole: "loop-body",
        passthroughColumn: "center"
      });
    } else if (cycleNode) {
      addGraphEdge(state, {
        from: cycleNode.id,
        to: decisionNode.id,
        role: "next",
        label: "",
        outputSlot: 0
      });
    }

    if (loopEntryNodeId) {
      addGraphEdge(state, {
        from: decisionNode.id,
        to: entryConnectorNode.id,
        role: "loop-return",
        label: "Sim",
        outputSlot: 1,
        practice: getPracticeLabelEntry(node.practice, "yes")
      });
    }

    return {
      entryNodeId: entryConnectorNode.id,
      exitPorts: [makeExitPort(decisionNode.id, "no", "Não", 0, getPracticeLabelEntry(node.practice, "no"))]
    };
  }

  if (node.kind === "for") {
    const initNode = node.init
      ? addGraphNode(state, {
          id: `${node.id}__init`,
          originId: node.id,
          metaKey: "process",
          text: node.init,
          role: "main",
          column: "center",
          practice: null
        })
      : null;
    const controlNode = addGraphNode(state, {
      id: node.id,
      originId: node.id,
      metaKey: "for",
      text: node.condition,
      role: context.role || "main",
      column: "center",
      practice: node.practice
    });
    const body = expandSequenceItems(node.body, state, {
      role: "loop-body",
      column: "right"
    });
    const updateNode = node.update
      ? addGraphNode(state, {
          id: `${node.id}__update`,
          originId: node.id,
          metaKey: "process",
          text: node.update,
          role: "loop-body",
          column: "right",
          practice: null
        })
      : null;
    const cycleNode = !body.entryNodeId && !updateNode
      ? createConnectorNode(state, {
          id: `${node.id}__cycle`,
          originId: node.id,
          role: "loop-body",
          column: "right"
        })
      : null;
    const loopEntryNodeId = body.entryNodeId || (updateNode ? updateNode.id : null) || (cycleNode ? cycleNode.id : null);

    if (initNode) {
      addGraphEdge(state, {
        from: initNode.id,
        to: controlNode.id,
        role: "next",
        label: "",
        outputSlot: 0
      });
    }

    if (loopEntryNodeId) {
      addGraphEdge(state, {
        from: controlNode.id,
        to: loopEntryNodeId,
        role: "yes",
        label: "Sim",
        outputSlot: 1,
        practice: getPracticeLabelEntry(node.practice, "yes")
      });
    }

    if (body.entryNodeId && updateNode) {
      connectExitPortsToEntry(state, body.exitPorts, updateNode.id, {
        allowPassthrough: true,
        passthroughBaseId: `${node.id}__for_update`,
        passthroughRole: "loop-body",
        passthroughColumn: "right"
      });
    }

    if (updateNode) {
      addGraphEdge(state, {
        from: updateNode.id,
        to: controlNode.id,
        role: "loop-return",
        label: "",
        outputSlot: 0
      });
    } else if (body.entryNodeId) {
      connectExitPortsToEntry(state, body.exitPorts, controlNode.id, {
        allowPassthrough: true,
        passthroughBaseId: `${node.id}__for_return`,
        forceRole: "loop-return",
        passthroughRole: "loop-return",
        passthroughColumn: "right"
      });
    } else if (cycleNode) {
      addGraphEdge(state, {
        from: cycleNode.id,
        to: controlNode.id,
        role: "loop-return",
        label: "",
        outputSlot: 0
      });
    }

    return {
      entryNodeId: initNode ? initNode.id : controlNode.id,
      exitPorts: [makeExitPort(controlNode.id, "no", "Não", 0, getPracticeLabelEntry(node.practice, "no"))]
    };
  }

  if (node.kind === "if_chain") {
    const caseList = Array.isArray(node.cases) ? node.cases : [];
    if (!caseList.length) {
      const fallbackElse = expandSequenceItems(node.elseBranch, state, {
        role: "else",
        column: "left"
      });
      return {
        entryNodeId: fallbackElse.entryNodeId,
        exitPorts: fallbackElse.exitPorts.slice()
      };
    }

    const mergeNode = createConnectorNode(state, {
      id: `${node.id}__merge`,
      originId: node.id,
      role: "merge",
      column: "center"
    });
    let firstDecisionNodeId = "";
    let previousDecisionNodeId = "";

    caseList.forEach((caseItem, caseIndex) => {
      const decisionPractice = mergePractice(node.practice, caseItem.practice);
      const decisionNode = addGraphNode(state, {
        id: getIfChainDecisionNodeId(node, caseItem, caseIndex),
        originId: node.id,
        metaKey: "if_chain",
        text: caseItem.condition,
        role: context.role || "main",
        column: "center",
        practice: decisionPractice
      });
      const thenBranch = expandSequenceItems(caseItem.thenBranch, state, {
        role: "then",
        column: "right"
      });

      if (!firstDecisionNodeId) firstDecisionNodeId = decisionNode.id;
      if (previousDecisionNodeId) {
        addGraphEdge(state, {
          from: previousDecisionNodeId,
          to: decisionNode.id,
          role: "no",
          label: "Não",
          outputSlot: 0,
          practice: getPracticeLabelEntry(node.practice, "no")
        });
      }

      if (thenBranch.entryNodeId) {
        addGraphEdge(state, {
          from: decisionNode.id,
          to: thenBranch.entryNodeId,
          role: "yes",
          label: "Sim",
          outputSlot: 1,
          practice: getPracticeLabelEntry(decisionPractice, "yes")
        });
        connectExitPortsToEntry(state, thenBranch.exitPorts, mergeNode.id, {
          allowPassthrough: true,
          passthroughBaseId: `${node.id}__merge_case_${caseIndex + 1}`,
          forceRole: "merge",
          passthroughRole: "merge",
          passthroughColumn: "center"
        });
      } else {
        addGraphEdge(state, {
          from: decisionNode.id,
          to: mergeNode.id,
          role: "yes",
          label: "Sim",
          outputSlot: 1,
          practice: getPracticeLabelEntry(decisionPractice, "yes")
        });
      }

      previousDecisionNodeId = decisionNode.id;
    });

    const elseBranch = expandSequenceItems(node.elseBranch, state, {
      role: "else",
      column: "left"
    });
    if (previousDecisionNodeId) {
      if (elseBranch.entryNodeId) {
        addGraphEdge(state, {
          from: previousDecisionNodeId,
          to: elseBranch.entryNodeId,
          role: "no",
          label: "Não",
          outputSlot: 0,
          practice: getPracticeLabelEntry(node.practice, "no")
        });
        connectExitPortsToEntry(state, elseBranch.exitPorts, mergeNode.id, {
          allowPassthrough: true,
          passthroughBaseId: `${node.id}__merge_else`,
          forceRole: "merge",
          passthroughRole: "merge",
          passthroughColumn: "center"
        });
      } else {
        addGraphEdge(state, {
          from: previousDecisionNodeId,
          to: mergeNode.id,
          role: "no",
          label: "Não",
          outputSlot: 0,
          practice: getPracticeLabelEntry(node.practice, "no")
        });
      }
    }

    return {
      entryNodeId: firstDecisionNodeId,
      exitPorts: [makeExitPort(mergeNode.id, "next", "", 0)]
    };
  }

  if (node.kind === "switch_case") {
    const caseList = Array.isArray(node.cases) ? node.cases : [];
    if (!caseList.length) {
      const fallbackDefault = expandSequenceItems(node.defaultBranch, state, {
        role: "switch-default",
        column: "center"
      });
      return {
        entryNodeId: fallbackDefault.entryNodeId,
        exitPorts: fallbackDefault.exitPorts.slice()
      };
    }

    const mergeNode = createConnectorNode(state, {
      id: `${node.id}__merge`,
      originId: node.id,
      role: "merge",
      column: "center"
    });
    let firstDecisionNodeId = "";
    let previousDecisionNodeId = "";

    caseList.forEach((caseItem, caseIndex) => {
      const decisionNode = addGraphNode(state, {
        id: getSwitchCaseDecisionNodeId(node, caseItem, caseIndex),
        originId: node.id,
        metaKey: "switch_case",
        text: buildSwitchCaseDecisionText(node.expression, caseItem.match),
        role: context.role || "main",
        column: "center",
        practice: caseItem.practice
      });
      const caseBody = expandSequenceItems(caseItem.body, state, {
        role: "switch-case",
        column: "right"
      });

      if (!firstDecisionNodeId) firstDecisionNodeId = decisionNode.id;
      if (previousDecisionNodeId) {
        addGraphEdge(state, {
          from: previousDecisionNodeId,
          to: decisionNode.id,
          role: "case-next",
          label: "",
          outputSlot: 0
        });
      }

      if (caseBody.entryNodeId) {
        addGraphEdge(state, {
          from: decisionNode.id,
          to: caseBody.entryNodeId,
          role: "case-match",
          label: caseItem.match,
          outputSlot: 1,
          practice: getPracticeLabelEntry(caseItem.practice, "match")
        });
        connectExitPortsToEntry(state, caseBody.exitPorts, mergeNode.id, {
          allowPassthrough: true,
          passthroughBaseId: `${node.id}__merge_case_${caseIndex + 1}`,
          forceRole: "merge",
          passthroughRole: "merge",
          passthroughColumn: "center"
        });
      } else {
        addGraphEdge(state, {
          from: decisionNode.id,
          to: mergeNode.id,
          role: "case-match",
          label: caseItem.match,
          outputSlot: 1,
          practice: getPracticeLabelEntry(caseItem.practice, "match")
        });
      }

      previousDecisionNodeId = decisionNode.id;
    });

    const defaultBranch = expandSequenceItems(node.defaultBranch, state, {
      role: "switch-default",
      column: "center"
    });
    if (previousDecisionNodeId) {
      if (defaultBranch.entryNodeId) {
        addGraphEdge(state, {
          from: previousDecisionNodeId,
          to: defaultBranch.entryNodeId,
          role: "case-default",
          label: "Outro caso",
          outputSlot: 0,
          practice: getPracticeLabelEntry(node.practice, "default")
        });
        connectExitPortsToEntry(state, defaultBranch.exitPorts, mergeNode.id, {
          allowPassthrough: true,
          passthroughBaseId: `${node.id}__merge_default`,
          forceRole: "merge",
          passthroughRole: "merge",
          passthroughColumn: "center"
        });
      } else {
        addGraphEdge(state, {
          from: previousDecisionNodeId,
          to: mergeNode.id,
          role: "case-default",
          label: "Outro caso",
          outputSlot: 0,
          practice: getPracticeLabelEntry(node.practice, "default")
        });
      }
    }

    return {
      entryNodeId: firstDecisionNodeId,
      exitPorts: [makeExitPort(mergeNode.id, "next", "", 0)]
    };
  }

  return { entryNodeId: null, exitPorts: [] };
}

export function deriveFlowchartProjectionFromStructure(rawStructure) {
  const structure = normalizeFlowchartStructure(rawStructure);
  if (!structure) {
    return null;
  }

  const state = createExpandState();
  const layoutPlan = buildStructureLayoutPlan(structure);
  state.layoutPlanByNodeId = layoutPlan?.nodeLayoutById || null;
  const result = expandStructureNode(structure, state, {
    role: "main",
    column: "center"
  });

  return {
    structure,
    nodes: state.nodes.map((node, index) => ({
      id: node.id,
      row: Number.isFinite(Number(node.layoutMeta?.level)) ? Number(node.layoutMeta.level) : index,
      column: resolveProjectionColumn(node),
      shape: normalizeFlowchartShapeKey(node.shape),
      text: String(node.text || ""),
      originId: String(node.originId || node.id || ""),
      role: String(node.role || ""),
      layoutMeta: node.layoutMeta ? clone(node.layoutMeta) : null,
      shapeBlank: !!(node.practice && node.practice.blankShape),
      shapeOptions: Array.isArray(node.practice?.shapeOptions) ? clone(node.practice.shapeOptions) : [],
      textBlank: !!(getPracticeTextEntry(node.practice)?.blank),
      textOptions: getPracticeTextEntry(node.practice)?.mode === "choice"
        ? clone(getPracticeTextEntry(node.practice).options || [])
        : [],
      textVariants: getPracticeTextEntry(node.practice)
        ? clone(getPracticeTextEntry(node.practice).variants || [])
        : []
    })),
    links: state.edges.map((edge) => ({
      id: edge.id,
      fromNodeId: edge.from,
      toNodeId: edge.to,
      outputSlot: edge.outputSlot === 1 ? 1 : 0,
      label: String(edge.label || ""),
      role: String(edge.role || ""),
      layoutMeta: edge.layoutMeta ? clone(edge.layoutMeta) : null,
      labelBlank: !!(edge.practice && edge.practice.blank),
      labelOptions: edge.practice?.mode === "choice"
        ? clone(edge.practice.options || [])
        : [],
      labelVariants: edge.practice ? clone(edge.practice.variants || []) : []
    })),
    graph: {
      nodes: state.nodes.slice(),
      edges: state.edges.slice()
    },
    entryNodeId: result.entryNodeId,
    exitPorts: result.exitPorts.slice()
  };
}
