import { normalizeFlowchartShapeKey } from "./flowchartShapes.js";
import { createFlowchartLayoutEngine } from "./flowchartLayoutLegacy.browser.js";

export const FLOWCHART_LAYOUT = Object.freeze({
  columns: 3,
  cellWidth: 104,
  cellHeight: 110,
  gapX: 12,
  gapY: 14,
  shapeWidth: 80,
  shapeHeight: 48,
  textWidth: 96,
  textHeight: 56,
  textTop: 54,
  boardPaddingX: 28,
  boardPaddingY: 18,
  routeStep: 10,
  routePortOffset: 18,
  defaultRankGap: 20,
  semanticRankGap: 20,
  forwardLaneStep: 14,
  forwardBundleJoinOffset: 14,
  forwardMergeJoinOffset: 18,
  sideRouteExitOffset: 14,
  backEdgeLaneSpacing: 20,
  loopBackEdgeLaneSpacing: 24,
  backEdgeEscapeOffset: 12,
  backEdgeEscapeStep: 4,
  backEdgeReentryOffset: 16,
  loopBackEdgeReentryOffset: 20,
  backEdgeReentryStep: 4,
  routeTurnPenalty: 4,
  routeReusePenalty: 3
});

function clone(value) {
  return structuredClone(value);
}

function normalizeFlowchartLink(raw) {
  if (!raw || typeof raw !== "object") return null;
  const link = {
    id: String(raw.id || `${raw.fromNodeId}-${raw.toNodeId}-${raw.outputSlot || 0}`),
    fromNodeId: String(raw.fromNodeId || ""),
    toNodeId: String(raw.toNodeId || ""),
    outputSlot: raw.outputSlot === 1 ? 1 : 0,
    label: String(raw.label || "")
  };
  if (raw.role) link.role = String(raw.role);
  return link;
}

function getFlowchartSortedNodes(nodes) {
  return Array.isArray(nodes) ? nodes.slice() : [];
}

function getFlowchartNodeMap(nodes) {
  return (Array.isArray(nodes) ? nodes : []).reduce((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});
}

function getFlowchartNodeOutputLinks(links, nodeId) {
  const slots = [null, null];
  (Array.isArray(links) ? links : []).map(normalizeFlowchartLink).forEach((link) => {
    if (!link || link.fromNodeId !== nodeId || !link.toNodeId) return;
    if (!slots[link.outputSlot]) slots[link.outputSlot] = link;
  });
  return slots;
}

function getFlowchartDefaultOutputLabel(node, slot) {
  return node && normalizeFlowchartShapeKey(node.shape) === "decision"
    ? slot === 0
      ? "Não"
      : slot === 1
        ? "Sim"
        : ""
    : "";
}

const engine = createFlowchartLayoutEngine({
  layoutConfig: FLOWCHART_LAYOUT,
  getFlowchartSortedNodes,
  getFlowchartNodeMap,
  normalizeFlowchartLink,
  isFlowchartLinkAllowed: (link, nodeMap) => !!(nodeMap[link.fromNodeId] && nodeMap[link.toNodeId] && link.fromNodeId !== link.toNodeId),
  getFlowchartNodeOutputLinks,
  normalizeFlowchartShapeKey,
  getFlowchartDefaultOutputLabel,
  clone
});

export function computeFlowchartBoardLayout(nodes, links) {
  const sortedNodes = getFlowchartSortedNodes(nodes);
  const nodeMap = getFlowchartNodeMap(sortedNodes);
  const layout = engine.getFlowchartBoardLayout(sortedNodes, links);
  const routedLinks = engine.buildFlowchartLinkRenderData(links, nodeMap, layout);
  const geometryScale = Number(layout?.geometry?.scale || 1) || 1;
  const defaultViewportScale = Math.min(1.2, Math.max(0.72, Number((1 / geometryScale).toFixed(2)) || 1));

  return {
    ...layout,
    nodes: Array.isArray(layout?.graph?.nodes) ? layout.graph.nodes : sortedNodes,
    routes: Array.isArray(routedLinks) ? routedLinks : [],
    defaultViewportScale
  };
}
