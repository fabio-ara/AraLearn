import test from "node:test";
import assert from "node:assert/strict";

import { computeFlowchartBoardLayout } from "../src/flowchart/flowchartLayout.js";

test("organiza nós projetados em colunas e rotas ortogonais", () => {
  const layout = computeFlowchartBoardLayout(
    [
      { id: "start", row: 0, column: "center", shape: "terminal", text: "Início" },
      { id: "decision", row: 1, column: "center", shape: "decision", text: "x > 0" },
      { id: "then", row: 2, column: "right", shape: "process", text: "Seguir" },
      { id: "else", row: 2, column: "left", shape: "screen_output", text: "Parar" },
      { id: "merge", row: 3, column: "center", shape: "connector", text: "" },
      { id: "end", row: 4, column: "center", shape: "terminal", text: "Fim" }
    ],
    [
      { id: "l1", fromNodeId: "start", toNodeId: "decision", role: "next", outputSlot: 0 },
      { id: "l2", fromNodeId: "decision", toNodeId: "then", role: "yes", label: "Sim", outputSlot: 1 },
      { id: "l3", fromNodeId: "decision", toNodeId: "else", role: "no", label: "Não", outputSlot: 0 },
      { id: "l4", fromNodeId: "then", toNodeId: "merge", role: "merge", outputSlot: 0 },
      { id: "l5", fromNodeId: "else", toNodeId: "merge", role: "merge", outputSlot: 0 },
      { id: "l6", fromNodeId: "merge", toNodeId: "end", role: "next", outputSlot: 0 }
    ]
  );

  assert.equal(layout.nodes.length, 6);
  assert.equal(layout.routes.length, 6);
  assert.equal(layout.positions.then.left > layout.positions.decision.left, true);
  assert.equal(layout.positions.else.left < layout.positions.decision.left, true);

  const yesRoute = layout.routes.find((route) => route.link.id === "l2");
  const noRoute = layout.routes.find((route) => route.link.id === "l3");
  assert.ok(yesRoute);
  assert.ok(noRoute);
  assert.equal(yesRoute.startSide, "right");
  assert.equal(noRoute.startSide, "left");
  assert.ok(layout.routes.every((route) => route.points.length >= 2));
});

test("gera rota de retorno para laço com desvio lateral", () => {
  const layout = computeFlowchartBoardLayout(
    [
      { id: "while", row: 0, column: "center", shape: "decision", text: "i < 10" },
      { id: "body", row: 1, column: "center", shape: "process", text: "Incrementar" }
    ],
    [
      { id: "yes", fromNodeId: "while", toNodeId: "body", role: "yes", label: "Sim", outputSlot: 1 },
      { id: "return", fromNodeId: "body", toNodeId: "while", role: "loop-return", label: "Volta", outputSlot: 0 },
      { id: "no", fromNodeId: "while", toNodeId: "body", role: "no", label: "Não", outputSlot: 0 }
    ]
  );

  const loopReturn = layout.routes.find((route) => route.link.id === "return");
  assert.ok(loopReturn);
  assert.equal(loopReturn.isBackEdge, true);
  assert.equal(loopReturn.startSide, "left");
  assert.ok(loopReturn.points.some((point) => point[0] < layout.positions.while.left));
  assert.equal(loopReturn.labelPos.anchor, "end");
});

test("obedece levels vindos do layout estrutural interno", () => {
  const layout = computeFlowchartBoardLayout(
    [
      {
        id: "decision-a",
        row: 99,
        column: "center",
        shape: "decision",
        text: "Primeira condição",
        layoutMeta: { level: 0, slot: 0, semanticKind: "if_chain" }
      },
      {
        id: "decision-b",
        row: 99,
        column: "center",
        shape: "decision",
        text: "Segunda condição",
        layoutMeta: { level: 1, slot: 0, semanticKind: "if_chain_case" }
      },
      {
        id: "merge",
        row: 99,
        column: "center",
        shape: "connector",
        text: "",
        layoutMeta: { level: 3, slot: 1, semanticKind: "merge" }
      }
    ],
    [
      { id: "a-b", fromNodeId: "decision-a", toNodeId: "decision-b", role: "no", outputSlot: 0 },
      { id: "b-m", fromNodeId: "decision-b", toNodeId: "merge", role: "no", outputSlot: 0 }
    ]
  );

  assert.equal(layout.positions["decision-a"].top < layout.positions["decision-b"].top, true);
  assert.equal(layout.positions["decision-b"].top < layout.positions.merge.top, true);
});

test("abre faixas laterais extras quando slots compartilham a mesma linha", () => {
  const layout = computeFlowchartBoardLayout(
    [
      {
        id: "decision",
        row: 0,
        column: "center",
        shape: "decision",
        text: "Escolha",
        layoutMeta: { level: 0, slot: 1, semanticKind: "switch_case" }
      },
      {
        id: "case-a",
        row: 1,
        column: "right",
        shape: "process",
        text: "Caso A",
        layoutMeta: { level: 1, slot: 1, branch: "switch-case", semanticKind: "process" }
      },
      {
        id: "case-b",
        row: 1,
        column: "right",
        shape: "process",
        text: "Caso B",
        layoutMeta: { level: 1, slot: 2, branch: "switch-case", semanticKind: "process" }
      }
    ],
    [
      { id: "a", fromNodeId: "decision", toNodeId: "case-a", role: "case-match", outputSlot: 0 },
      { id: "b", fromNodeId: "decision", toNodeId: "case-b", role: "case-match", outputSlot: 1 }
    ]
  );

  assert.equal(layout.positions["case-b"].left > layout.positions["case-a"].left, true);
  assert.equal(layout.width >= 260, true);
});

test("expande geometria quando o texto do nó exige mais espaço", () => {
  const layout = computeFlowchartBoardLayout(
    [
      {
        id: "start",
        row: 0,
        column: "center",
        shape: "terminal",
        text: "Início com uma descrição consideravelmente maior do que o padrão"
      }
    ],
    []
  );

  assert.equal(layout.geometry.scale > 1, true);
  assert.equal(layout.defaultViewportScale < 1, true);
});

test("desloca labels de ligações para evitar colisão em ramos paralelos", () => {
  const layout = computeFlowchartBoardLayout(
    [
      { id: "decision", row: 0, column: "center", shape: "decision", text: "Escolha" },
      { id: "left-a", row: 1, column: "left", shape: "process", text: "A" },
      { id: "left-b", row: 2, column: "left", shape: "process", text: "B" },
      { id: "right-a", row: 1, column: "right", shape: "process", text: "C" },
      { id: "right-b", row: 2, column: "right", shape: "process", text: "D" }
    ],
    [
      { id: "left-1", fromNodeId: "decision", toNodeId: "left-a", role: "no", label: "Não", outputSlot: 0 },
      { id: "left-2", fromNodeId: "left-a", toNodeId: "left-b", role: "next", label: "Etapa", outputSlot: 0 },
      { id: "right-1", fromNodeId: "decision", toNodeId: "right-a", role: "yes", label: "Sim", outputSlot: 1 },
      { id: "right-2", fromNodeId: "right-a", toNodeId: "right-b", role: "next", label: "Etapa", outputSlot: 0 }
    ]
  );

  const labels = layout.routes.map((route) => route.labelPos).filter(Boolean);
  const uniqueY = new Set(labels.map((item) => `${item.x}:${item.y}:${item.anchor}`));
  assert.equal(uniqueY.size, labels.length);
});
