"use strict";

export function createFlowchartLayoutEngine(deps) {
    const FLOWCHART_LAYOUT = deps.layoutConfig;
    const getFlowchartSortedNodes = deps.getFlowchartSortedNodes;
    const getFlowchartNodeMap = deps.getFlowchartNodeMap;
    const normalizeFlowchartLink = deps.normalizeFlowchartLink;
    const isFlowchartLinkAllowed = deps.isFlowchartLinkAllowed;
    const getFlowchartNodeOutputLinks = deps.getFlowchartNodeOutputLinks;
    const normalizeFlowchartShapeKey = deps.normalizeFlowchartShapeKey;
    const getFlowchartDefaultOutputLabel = deps.getFlowchartDefaultOutputLabel;

    function snapRouteValue(value) {
      const step = Math.max(1, Number(FLOWCHART_LAYOUT.routeStep) || 1);
      return Math.round(Number(value || 0) / step) * step;
    }

    function roundFlowchartScaleUp(scale, quantum) {
      const safeQuantum = quantum > 0 ? quantum : 0.025;
      return Math.ceil(Number(scale || 1) / safeQuantum - 1e-9) * safeQuantum;
    }

    function splitFlowchartTextLines(text) {
      return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map(function (line) {
          return line.replace(/\s+/g, " ").trim();
        });
    }

    function wrapFlowchartLine(line, maxChars) {
      const safeLine = String(line || "");
      const safeMaxChars = Math.max(1, Number(maxChars) || 1);
      if (!safeLine) return [""];
      if (safeLine.length <= safeMaxChars) return [safeLine];

      const words = safeLine.split(" ");
      const wrapped = [];
      let current = "";

      words.forEach(function (word) {
        if (!word) return;
        const candidate = current ? current + " " + word : word;
        if (candidate.length <= safeMaxChars) {
          current = candidate;
          return;
        }
        if (current) wrapped.push(current);
        current = word;
        if (current.length <= safeMaxChars) return;
        while (current.length > safeMaxChars) {
          wrapped.push(current.slice(0, safeMaxChars));
          current = current.slice(safeMaxChars);
        }
      });

      if (current) wrapped.push(current);
      return wrapped.length ? wrapped : [safeLine];
    }

    function wrapFlowchartTextLines(text, maxChars) {
      const wrapped = [];
      splitFlowchartTextLines(text).forEach(function (line) {
        wrapFlowchartLine(line, maxChars).forEach(function (wrappedLine) {
          wrapped.push(wrappedLine);
        });
      });
      return wrapped.length ? wrapped : [""];
    }

    function getFlowchartTextPadding(shapeKey) {
      switch (normalizeFlowchartShapeKey(shapeKey)) {
        case "input_output":
          return { width: 18, height: 8 };
        case "keyboard_input":
          return { width: 18, height: 10 };
        case "screen_output":
        case "printed_output":
          return { width: 20, height: 12 };
        case "decision":
          return { width: 24, height: 16 };
        case "loop":
          return { width: 24, height: 10 };
        case "terminal":
          return { width: 18, height: 10 };
        default:
          return { width: 18, height: 8 };
      }
    }

    function getFlowchartTextMetrics(text, innerWidth, fontSize) {
      const safeFontSize = Math.max(8, Number(fontSize) || 11);
      const charWidth = safeFontSize * 0.58;
      const maxChars = Math.max(1, Math.floor(Math.max(1, Number(innerWidth) || 1) / charWidth));
      const lines = wrapFlowchartTextLines(text, maxChars);
      const maxLineWidth = lines.reduce(function (maxWidth, line) {
        return Math.max(maxWidth, String(line || "").length * charWidth);
      }, 0);
      const lineHeight = safeFontSize + 2;
      return {
        lines: lines,
        maxLineWidth: maxLineWidth,
        totalHeight: lines.length * lineHeight
      };
    }

    function flowchartTextFitsAtScale(text, shapeKey, geometry, scale, fontSize) {
      const safeText = String(text || "").trim();
      if (!safeText || normalizeFlowchartShapeKey(shapeKey) === "connector") return true;
      const safeScale = Math.max(1, Number(scale) || 1);
      const padding = getFlowchartTextPadding(shapeKey);
      const innerWidth = Math.max(1, geometry.textWidth * safeScale - padding.width);
      const innerHeight = Math.max(1, geometry.textHeight * safeScale - padding.height);
      const metrics = getFlowchartTextMetrics(safeText, innerWidth, fontSize == null ? 11 : fontSize);
      return metrics.maxLineWidth <= innerWidth + 1e-6 && metrics.totalHeight <= innerHeight + 1e-6;
    }

    function getFlowchartTextScaleRequirement(text, shapeKey, geometry) {
      const safeText = String(text || "").trim();
      if (!safeText || normalizeFlowchartShapeKey(shapeKey) === "connector") return 1;
      const fittingFontSizes = [11, 10.2, 9.6, 9];
      for (let index = 0; index < fittingFontSizes.length; index += 1) {
        if (flowchartTextFitsAtScale(safeText, shapeKey, geometry, 1, fittingFontSizes[index])) return 1;
      }

      let lower = 1;
      let upper = 1;
      while (!flowchartTextFitsAtScale(safeText, shapeKey, geometry, upper, 9) && upper < 4) {
        lower = upper;
        upper = Math.min(4, upper * 1.2);
      }
      if (!flowchartTextFitsAtScale(safeText, shapeKey, geometry, upper, 9)) return upper;

      while (upper - lower > 0.01) {
        const middle = (lower + upper) / 2;
        if (flowchartTextFitsAtScale(safeText, shapeKey, geometry, middle, 9)) {
          upper = middle;
        } else {
          lower = middle;
        }
      }
      return upper;
    }

    function getBaseNodeGeometry() {
      const nodeWidth = Number(FLOWCHART_LAYOUT.cellWidth) || 88;
      const shapeWidth = Number(FLOWCHART_LAYOUT.shapeWidth) || 80;
      const shapeHeight = Number(FLOWCHART_LAYOUT.shapeHeight) || 48;
      const textWidth = Number(FLOWCHART_LAYOUT.textWidth) || 80;
      const textHeight = Number(FLOWCHART_LAYOUT.textHeight) || 42;
      const textTop = Number(FLOWCHART_LAYOUT.textTop) || 55;
      const shapeLeft = Math.round((nodeWidth - shapeWidth) / 2);
      const textLeft = Math.round((nodeWidth - textWidth) / 2);

      return {
        scale: 1,
        nodeWidth: nodeWidth,
        nodeHeight: Math.max(textTop + textHeight, shapeHeight),
        shapeWidth: shapeWidth,
        shapeHeight: shapeHeight,
        textWidth: textWidth,
        textHeight: textHeight,
        textTop: textTop,
        shapeLeft: shapeLeft,
        textLeft: textLeft,
        textGap: Math.max(4, textTop - shapeHeight)
      };
    }

    function getFlowchartGeometryScale(nodes) {
      const geometry = getBaseNodeGeometry();
      const scale = (Array.isArray(nodes) ? nodes : []).reduce(function (maxScale, node) {
        return Math.max(
          maxScale,
          getFlowchartTextScaleRequirement(node && node.text, node && node.shape, geometry)
        );
      }, 1);
      return roundFlowchartScaleUp(scale, 0.05);
    }

    function simplifyFlowchartPolyline(points) {
      const compact = [];

      (Array.isArray(points) ? points : []).forEach(function (point) {
        if (!point) return;
        const x = snapRouteValue(point[0]);
        const y = snapRouteValue(point[1]);
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

    function cloneRoutePoints(points) {
      return (Array.isArray(points) ? points : []).map(function (point) {
        return [Number(point[0] || 0), Number(point[1] || 0)];
      });
    }

    function cloneFlowchartRoute(route) {
      return {
        link: route.link,
        points: cloneRoutePoints(route.points),
        label: route.label,
        startSide: route.startSide,
        isBackEdge: !!route.isBackEdge,
        labelPos: route.labelPos
          ? {
              x: route.labelPos.x,
              y: route.labelPos.y,
              anchor: route.labelPos.anchor
            }
          : null
      };
    }

    function shiftFlowchartRoute(route, shiftX, shiftY) {
      route.points = route.points.map(function (point) {
        return [point[0] + shiftX, point[1] + shiftY];
      });
      if (route.labelPos) {
        route.labelPos.x += shiftX;
        route.labelPos.y += shiftY;
      }
      return route;
    }

    function getFlowchartLinkLabelPosition(route, link) {
      if (!route || !Array.isArray(route.points) || route.points.length < 2) return null;

      const start = route.points[0];
      const next = route.points[1];
      const horizontal = start[1] === next[1];
      const midX = Math.round((start[0] + next[0]) / 2);
      const midY = Math.round((start[1] + next[1]) / 2);
      const labeledBranch =
        !!link &&
        (link.role === "yes" || link.role === "no" || link.role === "case-default" || link.role === "default");

      if (route.isBackEdge) {
        const offset = route.startSide === "right" ? 18 : -18;
        return {
          x: start[0] + offset,
          y: start[1] - 12,
          anchor: route.startSide === "right" ? "start" : "end"
        };
      }

      if (labeledBranch) {
        if (route.startSide === "right") {
          return {
            x: start[0] + 10,
            y: start[1] - 10,
            anchor: "start"
          };
        }
        if (route.startSide === "left") {
          return {
            x: start[0] - 10,
            y: start[1] - 10,
            anchor: "end"
          };
        }
        if (route.startSide === "bottom") {
          return {
            x: start[0] + (link.role === "no" ? -10 : 10),
            y: start[1] + 12,
            anchor: link.role === "no" ? "end" : "start"
          };
        }
      }

      if (horizontal) {
        return {
          x: midX,
          y: midY - 8,
          anchor: "middle"
        };
      }

      if (route.startSide === "left" || route.startSide === "right") {
        return {
          x: route.startSide === "right" ? start[0] + 10 : start[0] - 10,
          y: midY,
          anchor: route.startSide === "right" ? "start" : "end"
        };
      }

      return {
        x: midX,
        y: midY - 8,
        anchor: "middle"
      };
    }

    function getFlowchartLabelBounds(labelPos, text) {
      if (!labelPos) return null;
      const width = Math.max(34, Math.min(84, 16 + String(text || "").length * 7));
      const height = 22;
      let left = Number(labelPos.x || 0) - width / 2;
      if (labelPos.anchor === "start") left = Number(labelPos.x || 0);
      else if (labelPos.anchor === "end") left = Number(labelPos.x || 0) - width;
      return {
        left: left,
        top: Number(labelPos.y || 0) - height / 2,
        right: left + width,
        bottom: Number(labelPos.y || 0) + height / 2
      };
    }

    function flowchartLabelBoundsOverlap(a, b) {
      if (!a || !b) return false;
      const padding = 4;
      return !(
        a.right + padding <= b.left ||
        b.right + padding <= a.left ||
        a.bottom + padding <= b.top ||
        b.bottom + padding <= a.top
      );
    }

    function getFlowchartRouteLabelOffsetCandidates(route, link) {
      if (!route) return [[0, 0]];
      const side = String(route.startSide || "");
      if (side === "bottom") {
        const horizontalBias = link && link.role === "no" ? -16 : 16;
        return [
          [0, 0],
          [horizontalBias, 0],
          [-horizontalBias, 0],
          [horizontalBias, 12],
          [-horizontalBias, 12],
          [0, 12],
          [0, -12]
        ];
      }
      if (side === "right") {
        return [
          [0, 0],
          [0, 12],
          [0, -12],
          [12, 0],
          [12, 12],
          [12, -12]
        ];
      }
      if (side === "left") {
        return [
          [0, 0],
          [0, 12],
          [0, -12],
          [-12, 0],
          [-12, 12],
          [-12, -12]
        ];
      }
      return [
        [0, 0],
        [0, -12],
        [0, 12],
        [12, 0],
        [-12, 0]
      ];
    }

    function assignFlowchartRouteLabelPositions(routes) {
      const occupiedBounds = [];
      (Array.isArray(routes) ? routes : []).forEach(function (route) {
        if (!route || !route.label) {
          if (route) route.labelPos = null;
          return;
        }
        const base = getFlowchartLinkLabelPosition(route, route.link);
        if (!base) {
          route.labelPos = null;
          return;
        }

        const candidates = getFlowchartRouteLabelOffsetCandidates(route, route.link);
        let chosen = null;
        let chosenBounds = null;

        for (let index = 0; index < candidates.length; index += 1) {
          const offset = candidates[index];
          const nextPos = {
            x: Number(base.x || 0) + Number(offset[0] || 0),
            y: Number(base.y || 0) + Number(offset[1] || 0),
            anchor: base.anchor
          };
          const nextBounds = getFlowchartLabelBounds(nextPos, route.label);
          const hasCollision = occupiedBounds.some(function (bounds) {
            return flowchartLabelBoundsOverlap(bounds, nextBounds);
          });
          if (!hasCollision) {
            chosen = nextPos;
            chosenBounds = nextBounds;
            break;
          }
        }

        route.labelPos = chosen || base;
        occupiedBounds.push(chosenBounds || getFlowchartLabelBounds(route.labelPos, route.label));
      });
      return routes;
    }

    function getFlowchartNodeIndexMap(nodes) {
      return (Array.isArray(nodes) ? nodes : []).reduce(function (acc, node, index) {
        acc[node.id] = index;
        return acc;
      }, {});
    }

    function getFlowchartGraph(nodes, links) {
      const list = getFlowchartSortedNodes(nodes);
      const nodeMap = getFlowchartNodeMap(list);
      const nodeIndexMap = getFlowchartNodeIndexMap(list);
      const linkList = (Array.isArray(links) ? links : [])
        .map(normalizeFlowchartLink)
        .filter(function (link) {
          return link && isFlowchartLinkAllowed(link, nodeMap);
        })
        .sort(function (a, b) {
          const fromDiff = (nodeIndexMap[a.fromNodeId] || 0) - (nodeIndexMap[b.fromNodeId] || 0);
          if (fromDiff) return fromDiff;
          const slotDiff = (a.outputSlot || 0) - (b.outputSlot || 0);
          if (slotDiff) return slotDiff;
          return (nodeIndexMap[a.toNodeId] || 0) - (nodeIndexMap[b.toNodeId] || 0);
        });
      const outgoingByNode = {};
      const incomingByNode = {};
      const backEdgeIds = {};
      const primaryParentLinkByNode = {};

      list.forEach(function (node) {
        outgoingByNode[node.id] = [];
        incomingByNode[node.id] = [];
      });

      linkList.forEach(function (link) {
        outgoingByNode[link.fromNodeId].push(link);
        incomingByNode[link.toNodeId].push(link);
      });

      const roots = list.filter(function (node) {
        return !(incomingByNode[node.id] || []).length;
      }).map(function (node) {
        return node.id;
      });
      if (!roots.length && list.length) roots.push(list[0].id);

      const visited = {};
      const onStack = {};

      function dfs(nodeId) {
        visited[nodeId] = true;
        onStack[nodeId] = true;

        (outgoingByNode[nodeId] || []).forEach(function (link) {
          const targetId = link.toNodeId;
          if (!visited[targetId]) {
            if (!primaryParentLinkByNode[targetId]) primaryParentLinkByNode[targetId] = link;
            dfs(targetId);
            return;
          }

          if (onStack[targetId]) {
            backEdgeIds[link.id] = true;
            return;
          }

          if (!primaryParentLinkByNode[targetId]) {
            primaryParentLinkByNode[targetId] = link;
          }
        });

        onStack[nodeId] = false;
      }

      roots.forEach(function (rootId) {
        if (!visited[rootId]) dfs(rootId);
      });
      list.forEach(function (node) {
        if (!visited[node.id]) dfs(node.id);
      });

      const nonBackLinks = linkList.filter(function (link) {
        return !backEdgeIds[link.id];
      });
      const ranks = {};
      list.forEach(function (node) {
        ranks[node.id] = 0;
      });

      let changed = true;
      let guard = 0;
      while (changed && guard < list.length * Math.max(nonBackLinks.length, 1) + 5) {
        changed = false;
        guard += 1;
        nonBackLinks.forEach(function (link) {
          const nextRank = (ranks[link.fromNodeId] || 0) + 1;
          if (nextRank > (ranks[link.toNodeId] || 0)) {
            ranks[link.toNodeId] = nextRank;
            changed = true;
          }
        });
      }

      const childrenByNode = {};
      list.forEach(function (node) {
        childrenByNode[node.id] = [];
      });
      Object.keys(primaryParentLinkByNode).forEach(function (targetId) {
        const link = primaryParentLinkByNode[targetId];
        if (!link || backEdgeIds[link.id]) return;
        childrenByNode[link.fromNodeId].push(link);
      });
      Object.keys(childrenByNode).forEach(function (nodeId) {
        childrenByNode[nodeId].sort(function (a, b) {
          const slotDiff = (a.outputSlot || 0) - (b.outputSlot || 0);
          if (slotDiff) return slotDiff;
          return (nodeIndexMap[a.toNodeId] || 0) - (nodeIndexMap[b.toNodeId] || 0);
        });
      });

      const treeRoots = list.filter(function (node) {
        return !primaryParentLinkByNode[node.id] || backEdgeIds[primaryParentLinkByNode[node.id].id];
      }).map(function (node) {
        return node.id;
      });
      if (!treeRoots.length && list.length) treeRoots.push(list[0].id);

      return {
        nodes: list,
        nodeMap: nodeMap,
        nodeIndexMap: nodeIndexMap,
        linkList: linkList,
        outgoingByNode: outgoingByNode,
        incomingByNode: incomingByNode,
        backEdgeIds: backEdgeIds,
        nonBackLinks: nonBackLinks,
        ranks: ranks,
        primaryParentLinkByNode: primaryParentLinkByNode,
        childrenByNode: childrenByNode,
        roots: roots,
        treeRoots: treeRoots
      };
    }

    function getGraphChildren(graph, nodeId) {
      return (graph.childrenByNode[nodeId] || []).slice().sort(function (a, b) {
        const slotDiff = (a.outputSlot || 0) - (b.outputSlot || 0);
        if (slotDiff) return slotDiff;
        return (graph.nodeIndexMap[a.toNodeId] || 0) - (graph.nodeIndexMap[b.toNodeId] || 0);
      });
    }

    function getFlowchartNodeLayoutMeta(node) {
      if (!node || !node.layoutMeta) return null;
      const meta = node.layoutMeta;
      const slot = Number(meta.slot);
      const level = Number(meta.level);
      if (Number.isFinite(slot) || Number.isFinite(level) || String(meta.semanticKind || "").trim()) {
        return meta;
      }
      return null;
    }

    function hasStructureDerivedLayoutHints(graph) {
      return !!(
        graph &&
        Array.isArray(graph.nodes) &&
        graph.nodes.some(function (node) {
          return !!getFlowchartNodeLayoutMeta(node);
        })
      );
    }

    function getStructureDerivedSlots(graph) {
      if (!hasStructureDerivedLayoutHints(graph)) return null;

      const slots = {};
      for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        const layoutMeta = getFlowchartNodeLayoutMeta(node);
        if (!layoutMeta || !Number.isFinite(Number(layoutMeta.slot))) return null;
        slots[node.id] = Number(layoutMeta.slot);
      }

      return normalizeFlowchartSlots(slots);
    }

    function getStructureDerivedLevels(graph) {
      if (!hasStructureDerivedLayoutHints(graph)) return null;

      const levels = {};
      for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        const layoutMeta = getFlowchartNodeLayoutMeta(node);
        if (!layoutMeta || !Number.isFinite(Number(layoutMeta.level))) return null;
        levels[node.id] = Number(layoutMeta.level);
      }

      const values = Object.keys(levels).map(function (nodeId) {
        return Number(levels[nodeId] || 0);
      });
      const min = values.length ? Math.min.apply(null, values) : 0;
      Object.keys(levels).forEach(function (nodeId) {
        levels[nodeId] = Number(levels[nodeId] || 0) - min;
      });
      return levels;
    }

    function normalizeFlowchartSlots(slots) {
      const values = Object.keys(slots).map(function (nodeId) {
        return Number(slots[nodeId] || 0);
      });
      const min = values.length ? Math.min.apply(null, values) : 0;
      Object.keys(slots).forEach(function (nodeId) {
        slots[nodeId] = Number(slots[nodeId] || 0) - min;
      });
      return slots;
    }

    function enforceFlowchartRankSeparation(graph, slots, derivedLevels) {
      const byRank = {};
      graph.nodes.forEach(function (node) {
        const rank =
          derivedLevels && Number.isFinite(Number(derivedLevels[node.id]))
            ? Number(derivedLevels[node.id])
            : (graph.ranks[node.id] || 0);
        if (!byRank[rank]) byRank[rank] = [];
        byRank[rank].push(node.id);
      });

      Object.keys(byRank).forEach(function (rankKey) {
        const ids = byRank[rankKey].sort(function (a, b) {
          if (slots[a] !== slots[b]) return slots[a] - slots[b];
          return (graph.nodeIndexMap[a] || 0) - (graph.nodeIndexMap[b] || 0);
        });
        let previousSlot = null;
        ids.forEach(function (id) {
          if (previousSlot === null) {
            previousSlot = slots[id];
            return;
          }
          if (slots[id] < previousSlot + 1) slots[id] = previousSlot + 1;
          previousSlot = slots[id];
        });
      });

      return normalizeFlowchartSlots(slots);
    }

    function relaxFlowchartSlots(graph, baseSlots) {
      const slots = Object.assign({}, baseSlots);
      const orderedByRank = graph.nodes.slice().sort(function (a, b) {
        const rankDiff = (graph.ranks[a.id] || 0) - (graph.ranks[b.id] || 0);
        if (rankDiff) return rankDiff;
        return (graph.nodeIndexMap[a.id] || 0) - (graph.nodeIndexMap[b.id] || 0);
      });
      const reverseByRank = orderedByRank.slice().reverse();

      for (let iteration = 0; iteration < 6; iteration += 1) {
        orderedByRank.forEach(function (node) {
          const incoming = (graph.incomingByNode[node.id] || []).filter(function (link) {
            return !graph.backEdgeIds[link.id];
          });
          if (incoming.length < 2) return;
          const desired = incoming.reduce(function (sum, link) {
            return sum + Number(slots[link.fromNodeId] || 0);
          }, 0) / incoming.length;
          slots[node.id] = desired;
        });

        reverseByRank.forEach(function (node) {
          const children = getGraphChildren(graph, node.id);
          if (!children.length) return;
          const isDecision = normalizeFlowchartShapeKey(node.shape) === "decision";
          if (isDecision && children.length === 2) {
            slots[node.id] = (Number(slots[children[0].toNodeId] || 0) + Number(slots[children[1].toNodeId] || 0)) / 2;
            return;
          }
          if (children.length === 1) {
            const childIncoming = (graph.incomingByNode[children[0].toNodeId] || []).filter(function (link) {
              return !graph.backEdgeIds[link.id];
            });
            if (childIncoming.length <= 1) slots[node.id] = Number(slots[children[0].toNodeId] || 0);
          }
        });

        enforceFlowchartRankSeparation(graph, slots);
      }

      return slots;
    }

    function getFlowchartAutoSlots(graph) {
      const structureDerivedSlots = getStructureDerivedSlots(graph);
      if (structureDerivedSlots) {
        return enforceFlowchartRankSeparation(graph, structureDerivedSlots, getStructureDerivedLevels(graph));
      }

      const slots = {};
      const widths = {};
      const placed = {};
      const slotGap = 1;

      function getStructuredWidth(nodeId) {
        if (Object.prototype.hasOwnProperty.call(widths, nodeId)) return widths[nodeId];

        const node = graph.nodeMap[nodeId];
        const children = getGraphChildren(graph, nodeId);
        if (!children.length) {
          widths[nodeId] = 1;
          return widths[nodeId];
        }

        const isDecision = node && normalizeFlowchartShapeKey(node.shape) === "decision";
        if (isDecision && children.length === 2) {
          widths[nodeId] =
            getStructuredWidth(children[0].toNodeId) +
            getStructuredWidth(children[1].toNodeId) +
            slotGap;
          return widths[nodeId];
        }

        if (children.length === 1) {
          widths[nodeId] = Math.max(1, getStructuredWidth(children[0].toNodeId));
          return widths[nodeId];
        }

        widths[nodeId] = children.reduce(function (sum, link, index) {
          return sum + getStructuredWidth(link.toNodeId) + (index ? slotGap : 0);
        }, 0);
        return widths[nodeId];
      }

      function placeNode(nodeId, leftEdge) {
        if (placed[nodeId]) return;
        placed[nodeId] = true;

        const node = graph.nodeMap[nodeId];
        const children = getGraphChildren(graph, nodeId);
        if (!children.length) {
          slots[nodeId] = leftEdge;
          return;
        }

        const isDecision = node && normalizeFlowchartShapeKey(node.shape) === "decision";
        if (isDecision && children.length === 2) {
          const leftLink = children[0];
          const rightLink = children[1];
          const leftWidth = getStructuredWidth(leftLink.toNodeId);

          placeNode(leftLink.toNodeId, leftEdge);
          placeNode(rightLink.toNodeId, leftEdge + leftWidth + slotGap);

          slots[nodeId] = (Number(slots[leftLink.toNodeId] || 0) + Number(slots[rightLink.toNodeId] || 0)) / 2;
          return;
        }

        if (children.length === 1) {
          placeNode(children[0].toNodeId, leftEdge);
          slots[nodeId] = slots[children[0].toNodeId];
          return;
        }

        let cursor = leftEdge;
        const childCenters = [];
        children.forEach(function (link, index) {
          if (index > 0) cursor += slotGap;
          placeNode(link.toNodeId, cursor);
          childCenters.push(Number(slots[link.toNodeId] || 0));
          cursor += getStructuredWidth(link.toNodeId);
        });
        slots[nodeId] = childCenters.reduce(function (sum, value) {
          return sum + value;
        }, 0) / childCenters.length;
      }

      let cursor = 0;
      graph.treeRoots.forEach(function (rootId, index) {
        if (index > 0) cursor += slotGap;
        placeNode(rootId, cursor);
        cursor += getStructuredWidth(rootId);
      });

      graph.nodes.forEach(function (node) {
        if (!Object.prototype.hasOwnProperty.call(slots, node.id)) {
          placeNode(node.id, cursor);
          cursor += getStructuredWidth(node.id) + slotGap;
        }
      });

      return relaxFlowchartSlots(graph, enforceFlowchartRankSeparation(graph, slots));
    }

    function getNodeGeometry(scale) {
      const base = getBaseNodeGeometry();
      const safeScale = Math.max(1, Number(scale) || 1);
      const nodeWidth = Math.round(base.nodeWidth * safeScale);
      const shapeWidth = Math.round(base.shapeWidth * safeScale);
      const shapeHeight = Math.round(base.shapeHeight * safeScale);
      const textWidth = Math.round(base.textWidth * safeScale);
      const textHeight = Math.round(base.textHeight * safeScale);
      const textTop = Math.round(base.textTop * safeScale);
      const shapeLeft = Math.round((nodeWidth - shapeWidth) / 2);
      const textLeft = Math.round((nodeWidth - textWidth) / 2);

      return {
        scale: safeScale,
        nodeWidth: nodeWidth,
        nodeHeight: Math.max(textTop + textHeight, shapeHeight),
        shapeWidth: shapeWidth,
        shapeHeight: shapeHeight,
        textWidth: textWidth,
        textHeight: textHeight,
        textTop: textTop,
        shapeLeft: shapeLeft,
        textLeft: textLeft,
        textGap: Math.max(4, textTop - shapeHeight)
      };
    }

    function scaleFlowchartMetric(value, geometry, minimum) {
      return Math.max(
        Number(minimum) || 0,
        Math.round((Number(value) || 0) * Math.max(1, Number((geometry || {}).scale) || 1))
      );
    }

    function getFlowchartColumnCorridorPadding(geometry) {
      const nodeWidth = Math.max(1, Number((geometry || {}).nodeWidth) || (Number(FLOWCHART_LAYOUT.cellWidth) || 104));
      return Math.max(18, Math.min(Math.round(nodeWidth * 0.22), 32));
    }

    function getFlowchartLoopCorridorPadding(geometry) {
      const nodeWidth = Math.max(1, Number((geometry || {}).nodeWidth) || (Number(FLOWCHART_LAYOUT.cellWidth) || 104));
      return Math.max(14, Math.min(Math.round(nodeWidth * 0.12), 22));
    }

    function getFlowchartVerticalCorridorPadding(geometry, semanticLayout) {
      const nodeHeight = Math.max(1, Number((geometry || {}).nodeHeight) || (Number(FLOWCHART_LAYOUT.cellHeight) || 110));
      const ratio = semanticLayout ? 0.12 : 0.14;
      const ceiling = semanticLayout ? 22 : 24;
      return Math.max(14, Math.min(Math.round(nodeHeight * ratio), ceiling));
    }

    function getFlowchartEnvelopePadding(geometry) {
      return Math.max(4, Math.min(Math.round(Math.max(1, Number((geometry || {}).scale) || 1) * 5), 7));
    }

    function getFlowchartForwardLaneStep(geometry) {
      return Math.max(10, Math.min(Math.round(getFlowchartColumnCorridorPadding(geometry) * 0.55), 16));
    }

    function getFlowchartForwardJoinOffset(geometry, isMerge) {
      const verticalPadding = getFlowchartVerticalCorridorPadding(geometry, true);
      return isMerge
        ? Math.max(12, Math.min(verticalPadding + 4, 18))
        : Math.max(10, Math.min(verticalPadding, 14));
    }

    function getFlowchartSideRouteExitOffset(geometry) {
      const configured = Number(FLOWCHART_LAYOUT.sideRouteExitOffset);
      if (Number.isFinite(configured) && configured > 0) return configured;
      return Math.max(10, Math.min(Math.round(getFlowchartColumnCorridorPadding(geometry) * 0.5), 16));
    }

    function getFlowchartBackEdgeLaneSpacing(geometry, isLoop) {
      const corridor = isLoop ? getFlowchartLoopCorridorPadding(geometry) : getFlowchartColumnCorridorPadding(geometry);
      return Math.max(isLoop ? 16 : 18, corridor);
    }

    function getFlowchartBackEdgeEscapeOffset(geometry, laneIndex, isLoop) {
      const base = isLoop
        ? Math.max(10, Math.min(Math.round(getFlowchartLoopCorridorPadding(geometry) * 0.7), 16))
        : Math.max(10, Math.min(Math.round(getFlowchartColumnCorridorPadding(geometry) * 0.62), 16));
      const step = Math.max(2, Math.min(Math.round(Math.max(1, Number((geometry || {}).scale) || 1) * 3), 4));
      return base + Math.max(0, (laneIndex || 1) - 1) * step;
    }

    function getFlowchartBackEdgeReentryOffset(geometry, laneIndex, isLoop) {
      const verticalPadding = getFlowchartVerticalCorridorPadding(geometry, true);
      const base = isLoop
        ? Math.max(12, Math.min(verticalPadding + 2, 18))
        : Math.max(12, Math.min(verticalPadding + 4, 18));
      const step = Math.max(2, Math.min(Math.round(Math.max(1, Number((geometry || {}).scale) || 1) * 3), 4));
      return base + Math.max(0, (laneIndex || 1) - 1) * step;
    }

    function getFlowchartShapeViewportMetrics(pos, geometry) {
      const scale = Math.min(
        Number(geometry.shapeWidth || 0) / 120,
        Number(geometry.shapeHeight || 0) / 60
      );
      return {
        scale: scale,
        offsetX: Number(pos.shapeLeft || 0) + (Number(geometry.shapeWidth || 0) - 120 * scale) / 2,
        offsetY: Number(pos.shapeTop || 0) + (Number(geometry.shapeHeight || 0) - 60 * scale) / 2
      };
    }

    function projectFlowchartShapePoint(metrics, x, y) {
      return [
        snapRouteValue(metrics.offsetX + x * metrics.scale),
        snapRouteValue(metrics.offsetY + y * metrics.scale)
      ];
    }

    function getFlowchartShapeFrame(shapeKey) {
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

    function getVisibleShapeBounds(node, pos, geometry) {
      const frame = getFlowchartShapeFrame(node && node.shape);
      const metrics = getFlowchartShapeViewportMetrics(pos, geometry);
      const topLeft = projectFlowchartShapePoint(metrics, frame.left, frame.top);
      const bottomRight = projectFlowchartShapePoint(metrics, frame.right, frame.bottom);
      return {
        left: Math.min(topLeft[0], bottomRight[0]),
        top: Math.min(topLeft[1], bottomRight[1]),
        right: Math.max(topLeft[0], bottomRight[0]),
        bottom: Math.max(topLeft[1], bottomRight[1])
      };
    }

    function getVisibleTextBounds(pos, geometry) {
      return {
        left: Number(pos && pos.textLeft || 0),
        top: Number(pos && pos.textTop || 0),
        right: Number(pos && pos.textLeft || 0) + Number(geometry && geometry.textWidth || 0),
        bottom: Number(pos && pos.textTop || 0) + Number(geometry && geometry.textHeight || 0)
      };
    }

    function nodeHidesTextSurface(node) {
      const semanticKind = String(node && node.layoutMeta && node.layoutMeta.semanticKind || "").trim().toLowerCase();
      return semanticKind === "junction";
    }

    function nodeHasVisibleTextSurface(node) {
      if (nodeHidesTextSurface(node)) return false;
      const shapeKey = normalizeFlowchartShapeKey(node && node.shape);
      if (shapeKey === "connector") {
        return String(node && node.text || "").trim().length > 0;
      }
      return true;
    }

    function getNodeConnectorPoint(node, pos, geometry, side) {
      const shapeKey = normalizeFlowchartShapeKey(node && node.shape);
      const metrics = getFlowchartShapeViewportMetrics(pos, geometry);
      const textBounds = nodeHasVisibleTextSurface(node)
        ? getVisibleTextBounds(pos, geometry)
        : null;
      const textCenterX = textBounds
        ? snapRouteValue((textBounds.left + textBounds.right) / 2)
        : null;

      if (shapeKey === "connector") {
        const center = projectFlowchartShapePoint(metrics, 60, 30);
        const radius = 22 * metrics.scale;
        if (side === "top") return [center[0], snapRouteValue(center[1] - radius)];
        if (side === "bottom") return [center[0], snapRouteValue(center[1] + radius)];
        if (side === "left") return [snapRouteValue(center[0] - radius), center[1]];
        if (side === "right") return [snapRouteValue(center[0] + radius), center[1]];
      }

      if (shapeKey === "decision") {
        if (side === "top") return projectFlowchartShapePoint(metrics, 60, 6);
        if (side === "bottom") return projectFlowchartShapePoint(metrics, 60, 54);
        if (side === "left") return projectFlowchartShapePoint(metrics, 12, 30);
        if (side === "right") return projectFlowchartShapePoint(metrics, 108, 30);
      }

      if (shapeKey === "loop") {
        if (side === "top") return projectFlowchartShapePoint(metrics, 60, 8);
        if (side === "bottom") return projectFlowchartShapePoint(metrics, 60, 52);
        if (side === "left") return projectFlowchartShapePoint(metrics, 12, 30);
        if (side === "right") return projectFlowchartShapePoint(metrics, 108, 30);
      }

      if (shapeKey === "input_output") {
        if (side === "left") return projectFlowchartShapePoint(metrics, 19, 30);
        if (side === "right") return projectFlowchartShapePoint(metrics, 101, 30);
        if (side === "bottom" && textBounds) return [textCenterX, snapRouteValue(textBounds.bottom)];
        if (side === "bottom") return projectFlowchartShapePoint(metrics, 60, 52);
        return projectFlowchartShapePoint(metrics, 60, 8);
      }

      if (shapeKey === "keyboard_input") {
        if (side === "left") return projectFlowchartShapePoint(metrics, 18, 30);
        if (side === "right") return projectFlowchartShapePoint(metrics, 102, 30);
        if (side === "bottom" && textBounds) return [textCenterX, snapRouteValue(textBounds.bottom)];
        if (side === "bottom") return projectFlowchartShapePoint(metrics, 60, 49);
        return projectFlowchartShapePoint(metrics, 60, 8);
      }

      if (shapeKey === "screen_output") {
        if (side === "left") return projectFlowchartShapePoint(metrics, 14, 30);
        if (side === "right") return projectFlowchartShapePoint(metrics, 106, 30);
        // Conectores partem do símbolo, não da área de texto, para evitar "vãos" curtos.
        if (side === "bottom") return projectFlowchartShapePoint(metrics, 60, 52);
        return projectFlowchartShapePoint(metrics, 60, 8);
      }

      if (shapeKey === "page_connector") {
        if (side === "top") return projectFlowchartShapePoint(metrics, 60, 8);
        if (side === "bottom") return projectFlowchartShapePoint(metrics, 60, 54);
        if (side === "left") return projectFlowchartShapePoint(metrics, 18, 22);
        if (side === "right") return projectFlowchartShapePoint(metrics, 102, 22);
      }

      const bounds = getVisibleShapeBounds(node, pos, geometry);
      if (side === "left") return [bounds.left, snapRouteValue((bounds.top + bounds.bottom) / 2)];
      if (side === "right") return [bounds.right, snapRouteValue((bounds.top + bounds.bottom) / 2)];
      // Conectores em "bottom" devem sair do símbolo, não do rodapé da área de texto.
      if (side === "bottom") return [snapRouteValue((bounds.left + bounds.right) / 2), bounds.bottom];
      return [snapRouteValue((bounds.left + bounds.right) / 2), bounds.top];
    }

    function getNodeConnectors(node, pos, geometry) {
      return {
        top: getNodeConnectorPoint(node, pos, geometry, "top"),
        bottom: getNodeConnectorPoint(node, pos, geometry, "bottom"),
        left: getNodeConnectorPoint(node, pos, geometry, "left"),
        right: getNodeConnectorPoint(node, pos, geometry, "right")
      };
    }

    function buildFallbackRoute(link, layout, geometry) {
      const graph = layout.graph;
      const fromPos = layout.positions[link.fromNodeId];
      const toPos = layout.positions[link.toNodeId];
      const fromNode = graph.nodeMap[link.fromNodeId];
      const toNode = graph.nodeMap[link.toNodeId];
      const outgoing = (graph.outgoingByNode[link.fromNodeId] || []).filter(function (item) {
        return !graph.backEdgeIds[item.id];
      });
      const connectorsFrom = getNodeConnectors(fromNode, fromPos, geometry);
      const connectorsTo = getNodeConnectors(toNode, toPos, geometry);
      const isDecision = normalizeFlowchartShapeKey(fromNode.shape) === "decision";
      const startSide =
        graph.backEdgeIds[link.id]
          ? (link.outputSlot === 1 ? "right" : "left")
          : isDecision || outgoing.length > 1
            ? (link.outputSlot === 1 ? "right" : "left")
            : "bottom";

      if (graph.backEdgeIds[link.id]) {
        const side = startSide === "right" ? "right" : "left";
        const laneSpacing = getFlowchartBackEdgeLaneSpacing(geometry, link && link.role === "loop-return");
        const laneX =
          side === "right"
            ? Math.max(fromPos.left, toPos.left) + geometry.nodeWidth + laneSpacing
            : Math.min(fromPos.left, toPos.left) - laneSpacing;
        const start = connectorsFrom[startSide];
        const end = connectorsTo[side];
        return {
          points: simplifyFlowchartPolyline([
            start,
            [laneX, start[1]],
            [laneX, end[1]],
            end
          ]),
          startSide: startSide,
          isBackEdge: true
        };
      }

      const start = connectorsFrom[startSide];
      const end = connectorsTo.top;
      const midY = Math.round((start[1] + end[1]) / 2);

      return {
        points: simplifyFlowchartPolyline([
          start,
          startSide === "bottom" ? [start[0], midY] : [end[0], start[1]],
          end
        ]),
        startSide: startSide,
        isBackEdge: false
      };
    }

    function buildFlowchartLinkRenderData(links, nodeMap, layout) {
      if (layout && Array.isArray(layout.routedLinks) && layout.routedLinks.length) {
        return layout.routedLinks.map(cloneFlowchartRoute);
      }

      const graph = layout && layout.graph ? layout.graph : getFlowchartGraph(Object.keys(nodeMap || {}).map(function (id) {
        return nodeMap[id];
      }), links);
      const geometry = layout && layout.geometry
        ? layout.geometry
        : getNodeGeometry(getFlowchartGeometryScale(graph.nodes));

      const routes = graph.linkList.map(function (link) {
        const fromNode = graph.nodeMap[link.fromNodeId];
        const route = buildFallbackRoute(link, layout, geometry);
        const text = String(link.label || "").trim() || getFlowchartDefaultOutputLabel(fromNode, link.outputSlot, graph.linkList);
        return {
          link: link,
          points: route.points,
          label: text,
          startSide: route.startSide,
          isBackEdge: !!route.isBackEdge,
          labelPos: null
        };
      });
      return assignFlowchartRouteLabelPositions(routes).map(cloneFlowchartRoute);
    }

    function cloneFlowchartPositions(positions) {
      return Object.keys(positions || {}).reduce(function (acc, nodeId) {
        const pos = positions[nodeId];
        acc[nodeId] = Object.assign({}, pos);
        return acc;
      }, {});
    }

    function getStructuredFlowchartPositions(graph, geometry) {
      const slots = getFlowchartAutoSlots(graph);
      const levels = getStructureDerivedLevels(graph);
      const semanticLayout = hasStructureDerivedLayoutHints(graph);
      const slotStepX = geometry.nodeWidth + getFlowchartColumnCorridorPadding(geometry);
      const rankStepY = geometry.nodeHeight + getFlowchartVerticalCorridorPadding(geometry, semanticLayout);
      const positions = {};

      graph.nodes.forEach(function (node) {
        const slot = Number(slots[node.id] || 0);
        const rank = levels && Number.isFinite(Number(levels[node.id]))
          ? Number(levels[node.id])
          : (graph.ranks[node.id] || 0);
        const left = Math.round(Math.max(scaleFlowchartMetric(Number(FLOWCHART_LAYOUT.boardPaddingX) || 32, geometry, 16), getFlowchartColumnCorridorPadding(geometry)) + slot * slotStepX);
        const top = Math.round(Math.max(scaleFlowchartMetric(Number(FLOWCHART_LAYOUT.boardPaddingY) || 24, geometry, 12), getFlowchartVerticalCorridorPadding(geometry, semanticLayout)) + rank * rankStepY);
        positions[node.id] = {
          left: left,
          top: top,
          slot: slot,
          rank: rank,
          shapeLeft: left + geometry.shapeLeft,
          shapeTop: top,
          textLeft: left + geometry.textLeft,
          textTop: top + geometry.textTop,
          centerX: left + Math.round(geometry.nodeWidth / 2),
          centerY: top + Math.round(geometry.shapeHeight / 2)
        };
      });

      return positions;
    }

    function getFlowchartLayoutCandidate(graph, positions, source, geometry) {
      const candidatePositions = cloneFlowchartPositions(positions);
      const routedLinks = [];
      const bundles = getForwardTargetBundles(graph, candidatePositions, geometry);

      graph.nonBackLinks.forEach(function (link) {
        const fromNode = graph.nodeMap[link.fromNodeId];
        const route = buildForwardRoute(link, graph, candidatePositions, bundles, geometry);
        const label = String(link.label || "").trim() || getFlowchartDefaultOutputLabel(fromNode, link.outputSlot, graph.linkList);
        routedLinks.push({
          link: link,
          points: route.points,
          label: label,
          startSide: route.startSide,
          isBackEdge: !!route.isBackEdge,
          labelPos: null
        });
      });

      const nodeBounds = getLayoutBoundsFromPositions(candidatePositions, geometry, graph.nodeMap);
      const laneUsage = { left: 0, right: 0 };
      const backLinks = graph.linkList.filter(function (link) {
        return !!graph.backEdgeIds[link.id];
      }).sort(function (a, b) {
        const aLoopReturn = a && a.role === "loop-return" ? 1 : 0;
        const bLoopReturn = b && b.role === "loop-return" ? 1 : 0;
        if (aLoopReturn !== bLoopReturn) return bLoopReturn - aLoopReturn;
        const aTarget = graph.nodeMap[a.toNodeId];
        const bTarget = graph.nodeMap[b.toNodeId];
        const aMeta = getFlowchartNodeLayoutMeta(aTarget);
        const bMeta = getFlowchartNodeLayoutMeta(bTarget);
        const aLevel = Number(aMeta && aMeta.level);
        const bLevel = Number(bMeta && bMeta.level);
        if (Number.isFinite(aLevel) && Number.isFinite(bLevel) && aLevel !== bLevel) return bLevel - aLevel;
        const aFrom = graph.nodeMap[a.fromNodeId];
        const bFrom = graph.nodeMap[b.fromNodeId];
        const aFromMeta = getFlowchartNodeLayoutMeta(aFrom);
        const bFromMeta = getFlowchartNodeLayoutMeta(bFrom);
        const aFromLevel = Number(aFromMeta && aFromMeta.level);
        const bFromLevel = Number(bFromMeta && bFromMeta.level);
        if (Number.isFinite(aFromLevel) && Number.isFinite(bFromLevel) && aFromLevel !== bFromLevel) {
          return bFromLevel - aFromLevel;
        }
        return String(a.id || "").localeCompare(String(b.id || ""));
      });
      backLinks.forEach(function (link) {
        const fromNode = graph.nodeMap[link.fromNodeId];
        const route = buildBackEdgeRoute(link, graph, candidatePositions, nodeBounds, laneUsage, geometry, routedLinks);
        const label = String(link.label || "").trim() || getFlowchartDefaultOutputLabel(fromNode, link.outputSlot, graph.linkList);
        routedLinks.push({
          link: link,
          points: route.points,
          label: label,
          startSide: route.startSide,
          isBackEdge: !!route.isBackEdge,
          labelPos: null
        });
      });
      assignFlowchartRouteLabelPositions(routedLinks);

      const bounds = {
        minX: nodeBounds.minX,
        minY: nodeBounds.minY,
        maxX: nodeBounds.maxX,
        maxY: nodeBounds.maxY
      };
      routedLinks.forEach(function (route) {
        route.points.forEach(function (point) {
          bounds.minX = Math.min(bounds.minX, point[0]);
          bounds.minY = Math.min(bounds.minY, point[1]);
          bounds.maxX = Math.max(bounds.maxX, point[0]);
          bounds.maxY = Math.max(bounds.maxY, point[1]);
        });
        if (route.labelPos) {
          const labelBounds = getFlowchartLabelBounds(route.labelPos, route.label);
          if (labelBounds) {
            bounds.minX = Math.min(bounds.minX, labelBounds.left);
            bounds.minY = Math.min(bounds.minY, labelBounds.top);
            bounds.maxX = Math.max(bounds.maxX, labelBounds.right);
            bounds.maxY = Math.max(bounds.maxY, labelBounds.bottom);
          }
        }
      });

      const framePaddingX = Math.max(scaleFlowchartMetric(20, geometry, 14), getFlowchartColumnCorridorPadding(geometry));
      const framePaddingY = Math.max(scaleFlowchartMetric(18, geometry, 12), getFlowchartVerticalCorridorPadding(geometry, true) + 4);
      const shiftX = framePaddingX - bounds.minX;
      const shiftY = framePaddingY - bounds.minY;

      Object.keys(candidatePositions).forEach(function (nodeId) {
        const pos = candidatePositions[nodeId];
        pos.left += shiftX;
        pos.top += shiftY;
        pos.shapeLeft += shiftX;
        pos.shapeTop += shiftY;
        pos.textLeft += shiftX;
        pos.textTop += shiftY;
        pos.centerX += shiftX;
        pos.centerY += shiftY;
      });
      routedLinks.forEach(function (route) {
        shiftFlowchartRoute(route, shiftX, shiftY);
      });

      return {
        width: Math.max(
          Math.round(bounds.maxX - bounds.minX + framePaddingX * 2),
          geometry.nodeWidth + framePaddingX * 2
        ),
        height: Math.max(
          Math.round(bounds.maxY - bounds.minY + framePaddingY * 2),
          geometry.nodeHeight + framePaddingY * 2
        ),
        positions: candidatePositions,
        graph: graph,
        geometry: geometry,
        routedLinks: routedLinks.map(cloneFlowchartRoute),
        source: source || "structured"
      };
    }

    function getFlowchartBoardLayout(nodes, links) {
      const graph = getFlowchartGraph(nodes, links);
      const geometry = getNodeGeometry(getFlowchartGeometryScale(graph.nodes));
      return getFlowchartLayoutCandidate(graph, getStructuredFlowchartPositions(graph, geometry), "structured", geometry);
    }

    function getForwardLinkSides(graph, link) {
      const fromNode = graph.nodeMap[link.fromNodeId];
      const toNode = graph.nodeMap[link.toNodeId];
      if (!fromNode) {
        return {
          startSide: "bottom",
          targetSide: "top"
        };
      }
      if (link && (link.role === "case-next" || link.role === "case-default")) {
        return {
          startSide: "bottom",
          targetSide: "top"
        };
      }
      const layoutMeta = getFlowchartNodeLayoutMeta(fromNode);
      const targetLayoutMeta = getFlowchartNodeLayoutMeta(toNode);
      if (layoutMeta && layoutMeta.semanticKind === "do_while") {
        if (link.role === "no" || link.outputSlot === 0) {
          return {
            startSide: "right",
            targetSide: "right"
          };
        }
      }
      if (layoutMeta && (layoutMeta.semanticKind === "for" || layoutMeta.semanticKind === "while")) {
        if (link.role === "yes" || link.outputSlot === 1) {
          return {
            startSide: "bottom",
            targetSide: "top"
          };
        }
        if (targetLayoutMeta && (targetLayoutMeta.semanticKind === "merge" || targetLayoutMeta.semanticKind === "junction")) {
          return {
            startSide: "right",
            targetSide: "top"
          };
        }
        return {
          startSide: "right",
          targetSide: "right"
        };
      }
      if (layoutMeta && (layoutMeta.semanticKind === "if_chain" || layoutMeta.semanticKind === "if_chain_case")) {
        if (link.role === "yes" || link.outputSlot === 1) {
          if (targetLayoutMeta && targetLayoutMeta.semanticKind === "merge") {
            return {
              startSide: "right",
              targetSide: "top"
            };
          }
          return {
            startSide: "right",
            targetSide: "left"
          };
        }
        if (link.role === "no" || link.outputSlot === 0) {
          if (targetLayoutMeta && targetLayoutMeta.semanticKind === "merge") {
            return {
              startSide: "bottom",
              targetSide: "top"
            };
          }
          return {
            startSide: "left",
            targetSide: "right"
          };
        }
      }
      const outgoing = (graph.outgoingByNode[fromNode.id] || []).filter(function (item) {
        return !graph.backEdgeIds[item.id];
      });
      const isDecision = normalizeFlowchartShapeKey(fromNode.shape) === "decision";

      if (isDecision || outgoing.length > 1) {
        return {
          startSide: link.outputSlot === 1 ? "right" : "left",
          targetSide: "top"
        };
      }

      return {
        startSide: "bottom",
        targetSide: "top"
      };
    }


    function getNodeEnvelope(node, pos, geometry) {
      const shapeBounds = getVisibleShapeBounds(node, pos, geometry);
      const padding = getFlowchartEnvelopePadding(geometry);
      const hasTextSurface = nodeHasVisibleTextSurface(node);
      return {
        left: Math.min(shapeBounds.left, hasTextSurface ? pos.textLeft : shapeBounds.left) - padding,
        top: shapeBounds.top - padding,
        right: Math.max(shapeBounds.right, hasTextSurface ? pos.textLeft + geometry.textWidth : shapeBounds.right) + padding,
        bottom: (hasTextSurface ? pos.textTop + geometry.textHeight : shapeBounds.bottom) + padding
      };
    }

    function segmentIntersectsRect(start, end, rect) {
      if (!start || !end || !rect) return false;

      if (start[0] === end[0]) {
        const x = start[0];
        if (!(x > rect.left && x < rect.right)) return false;
        const minY = Math.min(start[1], end[1]);
        const maxY = Math.max(start[1], end[1]);
        return Math.max(minY, rect.top) < Math.min(maxY, rect.bottom);
      }

      if (start[1] === end[1]) {
        const y = start[1];
        if (!(y > rect.top && y < rect.bottom)) return false;
        const minX = Math.min(start[0], end[0]);
        const maxX = Math.max(start[0], end[0]);
        return Math.max(minX, rect.left) < Math.min(maxX, rect.right);
      }

      return true;
    }

    function routeHitsObstacles(points, obstacles) {
      for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const start = points[pointIndex - 1];
        const end = points[pointIndex];
        for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex += 1) {
          if (segmentIntersectsRect(start, end, obstacles[obstacleIndex])) return true;
        }
      }
      return false;
    }

    function buildRouteObstacles(positions, nodeMap, geometry, excludedNodeIds) {
      const excluded = excludedNodeIds || {};
      return Object.keys(positions).filter(function (nodeId) {
        return !excluded[nodeId];
      }).map(function (nodeId) {
        return getNodeEnvelope(nodeMap[nodeId], positions[nodeId], geometry);
      });
    }

    function getForwardTargetBundles(graph, positions, geometry) {
      const bundles = {};
      const mergeOffset = getFlowchartForwardJoinOffset(geometry, true);
      const bundleOffset = getFlowchartForwardJoinOffset(geometry, false);

      graph.nodes.forEach(function (node) {
        const incoming = (graph.incomingByNode[node.id] || []).filter(function (link) {
          return !graph.backEdgeIds[link.id];
        });
        if (incoming.length < 2) return;
        const pos = positions[node.id];
        if (!pos) return;
        const layoutMeta = getFlowchartNodeLayoutMeta(node);
        if (layoutMeta && (layoutMeta.semanticKind === "merge" || layoutMeta.semanticKind === "junction")) return;
        const shapeBounds = getVisibleShapeBounds(node, pos, geometry);
        bundles[node.id] = {
          joinX: pos.centerX,
          joinY: shapeBounds.top - (layoutMeta && layoutMeta.semanticKind === "merge" ? mergeOffset : bundleOffset)
        };
      });

      return bundles;
    }

    function getConnectorMergeTargetSide(fromPos, toPos, startSide, geometry) {
      const lateralBias = Math.max(12, Math.round(geometry.shapeWidth * 0.18));
      const deltaX = Number(fromPos && fromPos.centerX || 0) - Number(toPos && toPos.centerX || 0);
      if (deltaX <= -lateralBias) return "left";
      if (deltaX >= lateralBias) return "right";
      if (startSide === "left" || startSide === "right") return startSide;
      return "top";
    }

    function getIfThenEmptyBranchMirrorLaneX(graph, positions, geometry, link, portSides) {
      const fromNode = graph.nodeMap[link.fromNodeId];
      const toNode = graph.nodeMap[link.toNodeId];
      const fromPos = positions[link.fromNodeId];
      const layoutMeta = getFlowchartNodeLayoutMeta(fromNode);
      const targetLayoutMeta = getFlowchartNodeLayoutMeta(toNode);

      if (!fromNode || !toNode || !fromPos || !layoutMeta || !targetLayoutMeta) return null;
      if (layoutMeta.semanticKind !== "if_then" || targetLayoutMeta.semanticKind !== "merge") return null;
      if (portSides.startSide !== "left" && portSides.startSide !== "right") return null;

      const siblingLink = (graph.outgoingByNode[fromNode.id] || []).find(function (candidate) {
        return candidate && candidate.id !== link.id && !graph.backEdgeIds[candidate.id] && candidate.toNodeId;
      });
      if (!siblingLink) return null;

      const siblingPos = positions[siblingLink.toNodeId];
      if (!siblingPos) return null;

      const mirroredX = snapRouteValue(fromPos.centerX - (siblingPos.centerX - fromPos.centerX));
      const shapeBounds = getVisibleShapeBounds(fromNode, fromPos, geometry);
      const corridorPadding = getFlowchartColumnCorridorPadding(geometry);

      if (portSides.startSide === "left") {
        return Math.min(mirroredX, shapeBounds.left - corridorPadding);
      }
      return Math.max(mirroredX, shapeBounds.right + corridorPadding);
    }

    function getOccupiedBandBounds(graph, positions, geometry, minY, maxY) {
      const verticalPadding = getFlowchartVerticalCorridorPadding(geometry, true);
      const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      };

      graph.nodes.forEach(function (node) {
        const pos = positions[node.id];
        if (!pos) return;
        const envelope = getNodeEnvelope(node, pos, geometry);
        if (envelope.bottom < minY - verticalPadding || envelope.top > maxY + verticalPadding) return;
        bounds.minX = Math.min(bounds.minX, envelope.left);
        bounds.minY = Math.min(bounds.minY, envelope.top);
        bounds.maxX = Math.max(bounds.maxX, envelope.right);
        bounds.maxY = Math.max(bounds.maxY, envelope.bottom);
      });

      return bounds;
    }

    function getBoundsFromNodeIds(graph, positions, geometry, nodeIds) {
      const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      };

      (Array.isArray(nodeIds) ? nodeIds : []).forEach(function (nodeId) {
        const node = graph.nodeMap[nodeId];
        const pos = positions[nodeId];
        if (!node || !pos) return;
        const envelope = getNodeEnvelope(node, pos, geometry);
        bounds.minX = Math.min(bounds.minX, envelope.left);
        bounds.minY = Math.min(bounds.minY, envelope.top);
        bounds.maxX = Math.max(bounds.maxX, envelope.right);
        bounds.maxY = Math.max(bounds.maxY, envelope.bottom);
      });

      return bounds;
    }

    function collectReachableNodeIds(graph, startNodeId, reverse) {
      const visited = {};
      const stack = [startNodeId];

      while (stack.length) {
        const nodeId = stack.pop();
        if (!nodeId || visited[nodeId]) continue;
        visited[nodeId] = true;

        const links = reverse ? graph.incomingByNode[nodeId] : graph.outgoingByNode[nodeId];
        (links || []).forEach(function (link) {
          if (!link || graph.backEdgeIds[link.id]) return;
          const nextId = reverse ? link.fromNodeId : link.toNodeId;
          if (nextId && !visited[nextId]) stack.push(nextId);
        });
      }

      return visited;
    }

    function getForwardPathNodeIds(graph, startNodeId, endNodeId) {
      if (!graph || !startNodeId || !endNodeId) return null;
      const forwardReachable = collectReachableNodeIds(graph, startNodeId, false);
      if (!forwardReachable[endNodeId]) return null;
      const reverseReachable = collectReachableNodeIds(graph, endNodeId, true);
      const nodeIds = Object.keys(forwardReachable).filter(function (nodeId) {
        return !!reverseReachable[nodeId];
      });
      return nodeIds.length ? nodeIds : null;
    }

    function getBackEdgeCorridorBounds(graph, positions, geometry, link) {
      const fromNode = graph.nodeMap[link.fromNodeId];
      const toNode = graph.nodeMap[link.toNodeId];
      const fromPos = positions[link.fromNodeId];
      const toPos = positions[link.toNodeId];
      if (!fromNode || !toNode || !fromPos || !toPos) return null;

      const fromEnvelope = getNodeEnvelope(fromNode, fromPos, geometry);
      const toEnvelope = getNodeEnvelope(toNode, toPos, geometry);
      if (link && link.role === "loop-return") {
        const localNodeIds = getForwardPathNodeIds(graph, link.toNodeId, link.fromNodeId);
        const localBounds = getBoundsFromNodeIds(graph, positions, geometry, localNodeIds);
        if (Number.isFinite(localBounds.minX) && Number.isFinite(localBounds.maxX)) return localBounds;
      }
      const bandBounds = getOccupiedBandBounds(
        graph,
        positions,
        geometry,
        Math.min(fromEnvelope.top, toEnvelope.top),
        Math.max(fromEnvelope.bottom, toEnvelope.bottom)
      );

      if (Number.isFinite(bandBounds.minX) && Number.isFinite(bandBounds.maxX)) return bandBounds;
      return {
        minX: Math.min(fromEnvelope.left, toEnvelope.left),
        minY: Math.min(fromEnvelope.top, toEnvelope.top),
        maxX: Math.max(fromEnvelope.right, toEnvelope.right),
        maxY: Math.max(fromEnvelope.bottom, toEnvelope.bottom)
      };
    }

    function getRoutedLinkBandBounds(routedLinks, minY, maxY) {
      const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      };

      (Array.isArray(routedLinks) ? routedLinks : []).forEach(function (route) {
        const points = Array.isArray(route && route.points) ? route.points : [];
        for (let index = 1; index < points.length; index += 1) {
          const start = points[index - 1];
          const end = points[index];
          if (!Array.isArray(start) || !Array.isArray(end)) continue;
          const segmentMinY = Math.min(start[1], end[1]);
          const segmentMaxY = Math.max(start[1], end[1]);
          if (segmentMaxY < minY || segmentMinY > maxY) continue;
          bounds.minX = Math.min(bounds.minX, start[0], end[0]);
          bounds.minY = Math.min(bounds.minY, segmentMinY);
          bounds.maxX = Math.max(bounds.maxX, start[0], end[0]);
          bounds.maxY = Math.max(bounds.maxY, segmentMaxY);
        }
      });

      return bounds;
    }

    function findClearLaneCoordinate(baseValue, step, attempts, pointsBuilder, obstacles) {
      const values = [snapRouteValue(baseValue)];
      for (let index = 1; index <= attempts; index += 1) {
        values.push(snapRouteValue(baseValue - index * step));
        values.push(snapRouteValue(baseValue + index * step));
      }

      for (let index = 0; index < values.length; index += 1) {
        const points = simplifyFlowchartPolyline(pointsBuilder(values[index]));
        if (!routeHitsObstacles(points, obstacles)) return values[index];
      }

      return snapRouteValue(baseValue);
    }

    function findExternalLaneCoordinate(baseValue, step, attempts, laneSide, pointsBuilder, obstacles) {
      const safeLaneSide = laneSide === "right" ? "right" : "left";
      const direction = safeLaneSide === "right" ? 1 : -1;
      const values = [];

      for (let index = 0; index <= attempts; index += 1) {
        values.push(snapRouteValue(baseValue + direction * index * step));
      }

      for (let index = 0; index < values.length; index += 1) {
        const points = simplifyFlowchartPolyline(pointsBuilder(values[index]));
        if (!routeHitsObstacles(points, obstacles)) return values[index];
      }

      return snapRouteValue(baseValue);
    }

    function buildForwardRoute(link, graph, positions, bundles, geometry) {
      const fromNode = graph.nodeMap[link.fromNodeId];
      const toNode = graph.nodeMap[link.toNodeId];
      const fromPos = positions[link.fromNodeId];
      const toPos = positions[link.toNodeId];
      const portSides = getForwardLinkSides(graph, link);
      const startSide = portSides.startSide;
      const targetLayoutMeta = getFlowchartNodeLayoutMeta(toNode);
      const targetSide =
        targetLayoutMeta && (targetLayoutMeta.semanticKind === "merge" || targetLayoutMeta.semanticKind === "junction")
          ? getConnectorMergeTargetSide(fromPos, toPos, startSide, geometry)
          : portSides.targetSide;
      const connectorsFrom = getNodeConnectors(fromNode, fromPos, geometry);
      const connectorsTo = getNodeConnectors(toNode, toPos, geometry);
      const start = connectorsFrom[startSide];
      const end = connectorsTo[targetSide] || connectorsTo.top;
      const usesConnectorMerge =
        !!(targetLayoutMeta && (targetLayoutMeta.semanticKind === "merge" || targetLayoutMeta.semanticKind === "junction"));
      const bundle =
        usesConnectorMerge
          ? null
          : (bundles[link.toNodeId] || null);
      const obstacles = buildRouteObstacles(positions, graph.nodeMap, geometry, {
        [link.fromNodeId]: true,
        [link.toNodeId]: true
      });
      const laneStep = getFlowchartForwardLaneStep(geometry);
      const sideRouteExitOffset = getFlowchartSideRouteExitOffset(geometry);
      const mirroredLaneX = getIfThenEmptyBranchMirrorLaneX(graph, positions, geometry, link, portSides);

      if (usesConnectorMerge) {
        const desiredY = end[1];

        if (startSide === "bottom") {
          const directMergeRoute = simplifyFlowchartPolyline([
            start,
            [start[0], desiredY],
            end
          ]);
          if (!routeHitsObstacles(directMergeRoute, obstacles)) {
            return {
              points: directMergeRoute,
              startSide: startSide,
              isBackEdge: false
            };
          }

          const preferredExitX = start[0] < end[0]
            ? start[0] - sideRouteExitOffset
            : start[0] > end[0]
              ? start[0] + sideRouteExitOffset
              : start[0];
          const exitX = findClearLaneCoordinate(
            preferredExitX,
            laneStep,
            10,
            function (value) {
              return [
                start,
                [value, start[1]],
                [value, desiredY],
                end
              ];
            },
            obstacles
          );
          return {
            points: simplifyFlowchartPolyline([
              start,
              [exitX, start[1]],
              [exitX, desiredY],
              end
            ]),
            startSide: startSide,
            isBackEdge: false
          };
        }

        if (startSide === "left" || startSide === "right") {
          const preferredExitX = mirroredLaneX == null
            ? start[0] + (startSide === "right" ? sideRouteExitOffset : -sideRouteExitOffset)
            : mirroredLaneX;
          const exitX = findClearLaneCoordinate(
            preferredExitX,
            laneStep,
            10,
            function (value) {
              return [
                start,
                [value, start[1]],
                [value, desiredY],
                end
              ];
            },
            obstacles
          );
          return {
            points: simplifyFlowchartPolyline([
              start,
              [exitX, start[1]],
              [exitX, desiredY],
              end
            ]),
            startSide: startSide,
            isBackEdge: false
          };
        }
      }

      if (startSide === "bottom") {
        const preferredY = bundle ? bundle.joinY : Math.round((start[1] + end[1]) / 2);
        const laneY = findClearLaneCoordinate(
          preferredY,
          laneStep,
          12,
          function (value) {
            return [
              start,
              [start[0], value],
              [bundle ? bundle.joinX : end[0], value],
              end
            ];
          },
          obstacles
        );
        const points = [
          start,
          [start[0], laneY],
          [bundle ? bundle.joinX : end[0], laneY],
          end
        ];
        return {
          points: simplifyFlowchartPolyline(points),
          startSide: startSide,
          isBackEdge: false
        };
      }

      if (mirroredLaneX == null && (startSide === "right" || startSide === "left") && startSide === targetSide && end[1] > start[1]) {
        const sameSideOuterOffset = Math.max(
          sideRouteExitOffset,
          getFlowchartColumnCorridorPadding(geometry) + Math.max(6, Math.round(laneStep * 0.5))
        );
        const preferredOuterX = start[0] + (startSide === "right" ? sameSideOuterOffset : -sameSideOuterOffset);
        const outerX = findExternalLaneCoordinate(
          preferredOuterX,
          laneStep,
          12,
          startSide === "right" ? "right" : "left",
          function (value) {
            return [
              start,
              [value, start[1]],
              [value, end[1]],
              end
            ];
          },
          obstacles
        );
        const outerSideRoute = simplifyFlowchartPolyline([
          start,
          [outerX, start[1]],
          [outerX, end[1]],
          end
        ]);
        if (!routeHitsObstacles(outerSideRoute, obstacles)) {
          return {
            points: outerSideRoute,
            startSide: startSide,
            isBackEdge: false
          };
        }
      }

      if (!bundle && !usesConnectorMerge) {
        const directSideRoute = simplifyFlowchartPolyline([
          start,
          [end[0], start[1]],
          end
        ]);
        if (!routeHitsObstacles(directSideRoute, obstacles)) {
          return {
            points: directSideRoute,
            startSide: startSide,
            isBackEdge: false
          };
        }
      }

      const preferredExitX = mirroredLaneX == null
        ? start[0] + (startSide === "right" ? sideRouteExitOffset : -sideRouteExitOffset)
        : mirroredLaneX;
      const exitX = findClearLaneCoordinate(
        preferredExitX,
        laneStep,
        10,
        function (value) {
          const midY = bundle ? bundle.joinY : Math.round((start[1] + end[1]) / 2);
          return [
            start,
            [value, start[1]],
            [value, midY],
            [bundle ? bundle.joinX : end[0], midY],
            end
          ];
        },
        obstacles
      );
      const preferredY = bundle ? bundle.joinY : Math.round((start[1] + end[1]) / 2);
      const laneY = findClearLaneCoordinate(
        preferredY,
        laneStep,
        12,
        function (value) {
          return [
            start,
            [exitX, start[1]],
            [exitX, value],
            [bundle ? bundle.joinX : end[0], value],
            end
          ];
        },
        obstacles
      );
      const points = [
        start,
        [exitX, start[1]],
        [exitX, laneY],
        [bundle ? bundle.joinX : end[0], laneY],
        end
      ];

      return {
        points: simplifyFlowchartPolyline(points),
        startSide: startSide,
        isBackEdge: false
      };
    }

    function getLayoutBoundsFromPositions(positions, geometry, nodeMap) {
      const horizontalPadding = Math.max(10, Math.round(getFlowchartColumnCorridorPadding(geometry) * 0.55));
      const verticalPadding = Math.max(10, Math.round(getFlowchartVerticalCorridorPadding(geometry, true) * 0.75));
      const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      };

      Object.keys(positions).forEach(function (nodeId) {
        const pos = positions[nodeId];
        if (!pos) return;
        const node = nodeMap[nodeId];
        const shapeBounds = getVisibleShapeBounds(node, pos, geometry);
        const hasTextSurface = nodeHasVisibleTextSurface(node);
        bounds.minX = Math.min(
          bounds.minX,
          shapeBounds.left - horizontalPadding,
          hasTextSurface ? pos.textLeft - Math.max(8, horizontalPadding - 4) : shapeBounds.left - horizontalPadding
        );
        bounds.minY = Math.min(bounds.minY, shapeBounds.top - verticalPadding);
        bounds.maxX = Math.max(
          bounds.maxX,
          shapeBounds.right + horizontalPadding,
          hasTextSurface ? pos.textLeft + geometry.textWidth + Math.max(8, horizontalPadding - 4) : shapeBounds.right + horizontalPadding
        );
        bounds.maxY = Math.max(
          bounds.maxY,
          (hasTextSurface ? pos.textTop + geometry.textHeight : shapeBounds.bottom) + verticalPadding
        );
      });

      if (!Number.isFinite(bounds.minX)) bounds.minX = 0;
      if (!Number.isFinite(bounds.minY)) bounds.minY = 0;
      if (!Number.isFinite(bounds.maxX)) bounds.maxX = geometry.nodeWidth;
      if (!Number.isFinite(bounds.maxY)) bounds.maxY = geometry.nodeHeight;
      return bounds;
    }

    function getBackEdgeSides(graph, link, positions) {
      const fromNode = graph.nodeMap[link.fromNodeId];
      const toNode = graph.nodeMap[link.toNodeId];
      const fromPos = positions[link.fromNodeId];
      const toPos = positions[link.toNodeId];
      const outgoing = (graph.outgoingByNode[link.fromNodeId] || []);
      const isDecision = fromNode && normalizeFlowchartShapeKey(fromNode.shape) === "decision";
      const targetIsDecision = toNode && normalizeFlowchartShapeKey(toNode.shape) === "decision";
      const targetIsAbove = fromPos && toPos && fromPos.top > toPos.top + 20;
      const targetLayoutMeta = getFlowchartNodeLayoutMeta(toNode);

      if (link && link.role === "loop-return") {
        if (targetLayoutMeta && (targetLayoutMeta.semanticKind === "for" || targetLayoutMeta.semanticKind === "while")) {
          return {
            startSide: "left",
            targetSide: "left",
            laneSide: "left"
          };
        }
        if (targetLayoutMeta && targetLayoutMeta.semanticKind === "junction") {
          return {
            startSide: "left",
            targetSide: "left",
            laneSide: "left"
          };
        }
        return {
          startSide: "left",
          targetSide: "top",
          laneSide: "left"
        };
      }

      if (targetIsDecision && targetIsAbove && fromPos && toPos) {
        return {
          startSide:
            Math.abs(fromPos.centerX - toPos.centerX) <= 36
              ? "bottom"
              : fromPos.centerX < toPos.centerX
                ? "left"
                : "right",
          targetSide: "top",
          laneSide: fromPos.centerX <= toPos.centerX ? "left" : "right"
        };
      }

      let startSide = "bottom";
      if (isDecision || outgoing.length > 1) {
        startSide = link.outputSlot === 1 ? "right" : "left";
      } else if (fromPos && toPos && fromPos.centerX > toPos.centerX + 12) {
        startSide = "left";
      } else if (fromPos && toPos && fromPos.centerX < toPos.centerX - 12) {
        startSide = "right";
      }

      let targetSide = startSide === "right" ? "right" : "left";
      if (fromPos && toPos && Math.abs(fromPos.centerX - toPos.centerX) > 42) {
        targetSide = fromPos.centerX >= toPos.centerX ? "right" : "left";
      }

      return {
        startSide: startSide,
        targetSide: targetSide,
        laneSide: targetSide === "right" ? "right" : "left"
      };
    }

    function buildBackEdgeRoute(link, graph, positions, bounds, laneUsage, geometry, routedLinks) {
      const fromNode = graph.nodeMap[link.fromNodeId];
      const toNode = graph.nodeMap[link.toNodeId];
      const connectorsFrom = getNodeConnectors(fromNode, positions[link.fromNodeId], geometry);
      const connectorsTo = getNodeConnectors(toNode, positions[link.toNodeId], geometry);
      const sides = getBackEdgeSides(graph, link, positions);
      const laneSide = sides.laneSide || (sides.startSide === "right" || sides.targetSide === "right" ? "right" : "left");
      const laneIndex = (laneUsage[laneSide] || 0) + 1;
      const isLoopReturn = !!(link && link.role === "loop-return");
      const targetLayoutMeta = getFlowchartNodeLayoutMeta(toNode);
      const corridorBounds = getBackEdgeCorridorBounds(graph, positions, geometry, link) || bounds;
      let laneSpacing = getFlowchartBackEdgeLaneSpacing(geometry, isLoopReturn);
      if (isLoopReturn && targetLayoutMeta && targetLayoutMeta.semanticKind === "junction") {
        const minimumExternalLoopSpacing = getFlowchartColumnCorridorPadding(geometry) + getFlowchartLoopCorridorPadding(geometry);
        laneSpacing = Math.max(laneSpacing, minimumExternalLoopSpacing);
        const configuredLoopLaneSpacing = Number(FLOWCHART_LAYOUT.loopBackEdgeLaneSpacing);
        if (Number.isFinite(configuredLoopLaneSpacing) && configuredLoopLaneSpacing > 0) {
          laneSpacing = Math.max(laneSpacing, configuredLoopLaneSpacing);
        }
      }
      const start = connectorsFrom[sides.startSide];
      const end = connectorsTo[sides.targetSide];
      const escapeOffset = getFlowchartBackEdgeEscapeOffset(geometry, laneIndex, isLoopReturn);
      const exitPoint =
        sides.startSide === "bottom"
          ? [start[0], start[1] + escapeOffset]
          : sides.startSide === "top"
            ? [start[0], start[1] - escapeOffset]
            : [start[0] + (laneSide === "right" ? escapeOffset : -escapeOffset), start[1]];
      const reentryOffset = getFlowchartBackEdgeReentryOffset(geometry, laneIndex, isLoopReturn);
      const nodeObstacles = buildRouteObstacles(positions, graph.nodeMap, geometry, {
        [link.fromNodeId]: true,
        [link.toNodeId]: true
      });
      const routeBandBounds =
        isLoopReturn && targetLayoutMeta && targetLayoutMeta.semanticKind === "junction"
          ? getRoutedLinkBandBounds(routedLinks, corridorBounds.minY, corridorBounds.maxY)
          : null;
      const effectiveCorridorBounds =
        routeBandBounds && Number.isFinite(routeBandBounds.minX) && Number.isFinite(routeBandBounds.maxX)
          ? {
              minX: Math.min(corridorBounds.minX, routeBandBounds.minX),
              minY: Math.min(corridorBounds.minY, routeBandBounds.minY),
              maxX: Math.max(corridorBounds.maxX, routeBandBounds.maxX),
              maxY: Math.max(corridorBounds.maxY, routeBandBounds.maxY)
            }
          : corridorBounds;
      const baseLaneX =
        laneSide === "right"
          ? effectiveCorridorBounds.maxX + laneIndex * laneSpacing
          : effectiveCorridorBounds.minX - laneIndex * laneSpacing;

      function buildPointsForLane(laneX) {
        const laneEntry = [laneX, exitPoint[1]];
        if (sides.targetSide === "top") {
          const approachY = end[1] - reentryOffset;
          return [
            start,
            exitPoint,
            laneEntry,
            [laneX, approachY],
            [end[0], approachY],
            end
          ];
        }

        return [
          start,
          exitPoint,
          laneEntry,
          [laneX, end[1]],
          end
        ];
      }

      const laneX = findExternalLaneCoordinate(
        baseLaneX,
        laneSpacing,
        12,
        laneSide,
        buildPointsForLane,
        nodeObstacles
      );

      laneUsage[laneSide] = laneIndex;

      return {
        points: simplifyFlowchartPolyline(buildPointsForLane(laneX)),
        startSide: sides.startSide,
        isBackEdge: true
      };
    }

    function computeFlowchartBoardLayout(nodes, links) {
      return Promise.resolve(getFlowchartBoardLayout(nodes, links));
    }

  return {
    getFlowchartGraph: getFlowchartGraph,
    getFlowchartAutoSlots: getFlowchartAutoSlots,
    buildFlowchartLinkRenderData: buildFlowchartLinkRenderData,
    getFlowchartBoardLayout: getFlowchartBoardLayout,
    computeFlowchartBoardLayout: computeFlowchartBoardLayout
  };
}
