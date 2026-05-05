import test from "node:test";
import assert from "node:assert/strict";

import { renderCardRuntimeBlocks } from "../src/render/renderCardRuntime.js";

test("renderiza fluxograma projetado como quadro SVG com nós e links", () => {
  const html = renderCardRuntimeBlocks({
    type: "flow",
    title: "Fluxo",
    runtime: {
      title: "Fluxo",
      blocks: [
        { kind: "heading", value: "Fluxo" },
        {
          kind: "flowchart",
          projectionValid: true,
          projection: {
            nodes: [
              { id: "start", row: 0, column: "center", shape: "terminal", text: "Início" },
              { id: "process", row: 1, column: "center", shape: "process", text: "Validar" }
            ],
            links: [{ id: "next", fromNodeId: "start", toNodeId: "process", role: "next", outputSlot: 0 }]
          }
        }
      ],
      fallbackText: "Fluxo"
    }
  });

  assert.match(html, /runtime-flow-board/);
  assert.match(html, /runtime-flow-board-controls/);
  assert.match(html, /runtime-flow-board-svg/);
  assert.match(html, /runtime-flow-route/);
  assert.match(html, /flowchart-shape-terminal/);
  assert.match(html, /Validar/);
});

test("renderiza prática interativa do fluxograma quando há lacunas", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "flow",
      title: "Fluxo",
      runtime: {
        title: "Fluxo",
        blocks: [
          { kind: "heading", value: "Fluxo" },
          {
            kind: "flowchart",
            projectionValid: true,
            projection: {
              nodes: [
                {
                  id: "decision",
                  row: 0,
                  column: "center",
                  shape: "decision",
                  text: "Resposta correta?",
                  shapeBlank: true,
                  shapeOptions: ["process"],
                  textBlank: true,
                  textOptions: [{ id: "option-1", value: "Sim" }]
                },
                {
                  id: "next",
                  row: 1,
                  column: "right",
                  shape: "process",
                  text: "Continuar"
                }
              ],
              links: [
                {
                  id: "yes-link",
                  fromNodeId: "decision",
                  toNodeId: "next",
                  role: "yes",
                  outputSlot: 0,
                  label: "Sim",
                  labelBlank: true,
                  labelOptions: [{ id: "label-1", value: "Não" }]
                }
              ]
            }
          }
        ],
        fallbackText: "Fluxo"
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      enableFlowchartPractice: true,
      flowchartExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          shapes: { decision: null },
          texts: { decision: "" },
          labels: { "yes-link": "" },
          feedback: "incorrect"
        }
      },
      activeFlowchartPrompt: {
        blockKey: "course::module::lesson::card::1",
        kind: "shape",
        targetId: "decision"
      }
    }
  );

  assert.match(html, /data-action="flowchart-open-shape"/);
  assert.match(html, /data-action="flowchart-open-text"/);
  assert.match(html, /data-action="flowchart-open-label"/);
  assert.doesNotMatch(html, /data-action="flowchart-check"/);
  assert.match(html, /data-action="flowchart-view-answer"/);
  assert.match(html, /runtime-flow-prompt-badge">Símbolo/);
});

test("renderiza múltipla escolha com seleção e validação", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "choice",
      title: "Leitura",
      runtime: {
        title: "Leitura",
        blocks: [
          { kind: "heading", value: "Leitura" },
          {
            kind: "multiple_choice",
            ask: "Escolha uma alternativa",
            answerState: "single",
            options: [
              { value: "A", answer: true },
              { value: "B", answer: false }
            ]
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      exerciseShuffleSeed: "card-load-1",
      choiceExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          selected: ["exercise-option-0"],
          feedback: "correct"
        }
      }
    }
  );

  assert.match(html, /data-action="choice-toggle"/);
  assert.match(html, /data-choice-option-id="exercise-option-0"[^>]*checked/);
  assert.match(html, /data-action="choice-validate"/);
  assert.match(html, /Correto\./);
});

test("renderiza complete transformando [[...]] em input", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "complete",
      title: "Complete",
      runtime: {
        title: "Complete",
        blocks: [
          { kind: "heading", value: "Complete" },
          { kind: "complete", text: "No modelo [[cascata]], mudanças custam mais." }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      completeExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: ["cascata"],
          feedback: "correct"
        }
      }
    }
  );

  assert.match(html, /runtime-complete-blank/);
  assert.match(html, /data-action="complete-input"/);
  assert.match(html, /data-action="complete-validate"/);
  assert.match(html, /Correto\./);
});
