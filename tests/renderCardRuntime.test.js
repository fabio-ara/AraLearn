import test from "node:test";
import assert from "node:assert/strict";

import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocks,
  renderCardRuntimeBlocksWithDock,
  renderPopupButtonDock
} from "../src/render/renderCardRuntime.js";

function countMatches(value, pattern) {
  return value.match(pattern)?.length || 0;
}

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
  assert.doesNotMatch(html, /data-action="flowchart-close-prompt"/);
  assert.doesNotMatch(html, /data-action="flowchart-clear-choice"/);
});

test("move feedback do fluxograma para o dock do card quando ele está habilitado", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
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
                  textBlank: true,
                  textOptions: [{ id: "option-1", value: "Sim" }]
                }
              ],
              links: []
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
          shapes: {},
          texts: { decision: "" },
          labels: {},
          feedback: "incomplete"
        }
      }
    }
  );

  assert.doesNotMatch(runtime.bodyHtml, /Complete todas as lacunas\./);
  assert.match(runtime.dockHtml, /Complete todas as lacunas\./);
  assert.match(runtime.dockHtml, /runtime-flow-practice-panel/);
});

test("renderiza lacunas digitáveis do fluxograma diretamente no quadro", () => {
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
                  id: "process",
                  row: 0,
                  column: "center",
                  shape: "process",
                  text: "Abrir chamado",
                  textBlank: true
                },
                {
                  id: "end",
                  row: 1,
                  column: "center",
                  shape: "terminal",
                  text: "Encerrar"
                }
              ],
              links: [
                {
                  id: "next-link",
                  fromNodeId: "process",
                  toNodeId: "end",
                  role: "next",
                  outputSlot: 0,
                  label: "Sim",
                  labelBlank: true
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
          shapes: {},
          texts: { process: "Texto livre" },
          labels: { "next-link": "Rótulo livre" },
          feedback: null
        }
      }
    }
  );

  assert.match(html, /data-flowchart-inline-input="true"/);
  assert.match(html, /runtime-flow-label-input practice-marked is-blank-input/);
  assert.match(html, /data-flowchart-choice-kind="text"/);
  assert.match(html, /data-flowchart-choice-kind="label"/);
  assert.doesNotMatch(html, /data-flowchart-popup-input="true"/);
  assert.doesNotMatch(html, /data-action="flowchart-check"/);
  assert.doesNotMatch(html, /data-action="flowchart-reset"/);
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
  assert.match(html, /multiple-choice-option active/);
  assert.match(html, /multiple-choice-mark">[\s\S]*?&#10003;/);
  assert.doesNotMatch(html, /data-action="choice-validate"/);
  assert.match(html, /Correto\./);
});

test("move feedback da múltipla escolha para o fim do card quando há dock", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
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

  assert.doesNotMatch(runtime.bodyHtml, /Correto\./);
  assert.match(runtime.dockHtml, /Correto\./);
  assert.match(runtime.dockHtml, /card-answer-dock/);
});

test("preserva ids originais da múltipla escolha mesmo com embaralhamento visual", () => {
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
            ask: "Escolha a alternativa correta",
            answerState: "single",
            options: [
              { value: "A", answer: false },
              { value: "B", answer: false },
              { value: "C", answer: true }
            ]
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      exerciseShuffleSeed: "popup-seed-1",
      choiceExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          selected: ["exercise-option-2"],
          feedback: "correct"
        }
      }
    }
  );

  assert.match(html, /data-choice-option-id="exercise-option-2"[\s\S]*?multiple-choice-mark">[\s\S]*?&#10003;/);
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
  assert.doesNotMatch(html, /data-action="complete-validate"/);
  assert.match(html, /Correto\./);
});

test("renderiza editor com lacunas textuais inline", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "editor",
      title: "Código",
      runtime: {
        title: "Código",
        blocks: [
          { kind: "heading", value: "Código" },
          { kind: "editor", language: "js", value: "const total = [[subtotal]] + [[imposto]];" }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: ["subtotal", "imposto"],
          feedback: "correct"
        }
      }
    }
  );

  assert.match(html, /runtime-code-gap/);
  assert.match(html, /runtime-editor-gap-blank/);
  assert.match(html, /data-action="complete-input"/);
});

test("renderiza editor com lacuna por opção e prompt no dock do card", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      type: "editor",
      title: "Código",
      runtime: {
        title: "Código",
        blocks: [
          { kind: "heading", value: "Código" },
          { kind: "editor", language: "js", value: "const stage = [[build]];\nconst status = [[ok::ok|pending|error]];" }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: ["build", ""],
          feedback: null
        }
      },
      activeTextGapPrompt: {
        blockKey: "course::module::lesson::card::1",
        blankIndex: 1
      }
    }
  );

  assert.match(runtime.bodyHtml, /data-action="complete-input"/);
  assert.match(runtime.bodyHtml, /data-action="text-gap-open-choice"/);
  assert.match(runtime.dockHtml, /data-action="text-gap-set-choice"/);
  assert.match(runtime.dockHtml, /pending/);
  assert.match(runtime.dockHtml, /error/);
});

test("renderiza tabela com lacunas textuais por célula", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "table",
      title: "Tabela",
      runtime: {
        title: "Tabela",
        blocks: [
          { kind: "heading", value: "Tabela" },
          {
            kind: "table",
            title: "Campos",
            headers: [{ value: "Campo" }, { value: "Uso" }],
            rows: [
              [{ value: "[[type]]" }, { value: "Tipo explícito" }],
              [{ value: "text" }, { value: "[[Conteúdo autoral]]" }]
            ]
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: ["type", "Conteúdo autoral"],
          feedback: "correct"
        }
      }
    }
  );

  assert.match(html, /runtime-table-cell-gap/);
  assert.match(html, /runtime-table-gap-blank/);
  assert.match(html, /runtime-table-frame/);
  assert.doesNotMatch(html, /data-action="complete-validate"/);
});

test("não renderiza título interno de tabela quando o runtime não fornece subtítulo", () => {
  const html = renderCardRuntimeBlocks({
    title: "Tabela de p → q",
    runtime: {
      title: "Tabela de p → q",
      blocks: [
        { kind: "heading", value: "Tabela de p → q" },
        {
          kind: "table",
          title: "",
          headers: [{ value: "p" }, { value: "q" }, { value: "p → q" }],
          rows: [
            [{ value: "V" }, { value: "V" }, { value: "V" }],
            [{ value: "V" }, { value: "F" }, { value: "F" }]
          ]
        }
      ]
    }
  });

  assert.doesNotMatch(html, /runtime-table-title/);
  assert.equal((html.match(/Tabela de p → q/g) || []).length, 0);
});

test("renderiza foco didático em linha e coluna da tabela", () => {
  const html = renderCardRuntimeBlocks({
    title: "Tabela",
    runtime: {
      title: "Tabela",
      blocks: [
        {
          kind: "table",
          title: "Comparação",
          focusLabel: "Compare a segunda linha e as colunas finais.",
          headers: [
            { value: "p" },
            { value: "q" },
            { value: "p → q", focused: true },
            { value: "¬p ∨ q", focused: true }
          ],
          rows: [
            [
              { value: "V" },
              { value: "V" },
              { value: "V", focusedColumn: true },
              { value: "V", focusedColumn: true }
            ],
            [
              { value: "V", focusedRow: true },
              { value: "F", focusedRow: true },
              { value: "F", focusedRow: true, focusedColumn: true },
              { value: "F", focusedRow: true, focusedColumn: true }
            ]
          ]
        }
      ]
    }
  });

  assert.match(html, /runtime-table-focus-label/);
  assert.match(html, /<th class="is-focused-column">/);
  assert.match(html, /class="is-focused-row"/);
  assert.match(html, /class="is-focused-row is-focused-column is-focus-intersection"/);
});

test("renderiza tabela com lacuna por opção no mesmo motor comum", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      type: "table",
      title: "Tabela",
      runtime: {
        title: "Tabela",
        blocks: [
          { kind: "heading", value: "Tabela" },
          {
            kind: "table",
            title: "Campos",
            headers: [{ value: "Campo" }, { value: "Uso" }],
            rows: [
              [{ value: "[[type::type|title|key]]" }, { value: "Tipo explícito" }]
            ]
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: [""],
          feedback: null
        }
      },
      activeTextGapPrompt: {
        blockKey: "course::module::lesson::card::1",
        blankIndex: 0
      }
    }
  );

  assert.match(runtime.bodyHtml, /runtime-table-gap-blank/);
  assert.match(runtime.bodyHtml, /runtime-text-gap-choice-blank/);
  assert.match(runtime.bodyHtml, /data-action="text-gap-open-choice"/);
  assert.match(runtime.dockHtml, /data-action="text-gap-set-choice"/);
});

test("renderiza plane com vetor simples no quadro cartesiano", () => {
  const html = renderCardRuntimeBlocks({
    title: "Plano",
    runtime: {
      title: "Plano",
      blocks: [
        { kind: "heading", value: "Plano" },
        {
          kind: "plane",
          mode: "vector",
          xRange: [-1, 5],
          yRange: [-1, 5],
          vectors: [
            {
              from: [0, 0],
              to: [3, 2],
              label: "v=(3,2)",
              tone: "primary"
            }
          ],
          segments: [],
          points: [],
          resultText: ""
        }
      ]
    }
  });

  assert.match(html, /runtime-plane-block/);
  assert.match(html, /data-plane-mode="vector"/);
  assert.match(html, /runtime-plane-svg/);
  assert.match(html, /runtime-plane-surface/);
  assert.match(html, /runtime-plane-legend/);
  assert.match(html, /v=\(3,2\)/);
  assert.match(html, /markerWidth="4\.8"/);
  assert.doesNotMatch(html, /markerWidth="10"/);
  assert.doesNotMatch(html, /runtime-plane-vector-label/);
});

test("renderiza graph como SVG responsivo com pesos e destaque", () => {
  const html = renderCardRuntimeBlocks({
    title: "Grafo",
    runtime: {
      title: "Grafo",
      blocks: [
        { kind: "heading", value: "Grafo" },
        {
          kind: "graph",
          summaryText: "Grafo com vértices A, B, C e arestas A-B, A-C.",
          ariaLabel: "Grafo com vértices A, B, C e arestas A-B, A-C.",
          vertices: [
            { id: "A", label: "A", x: 50, y: 14, highlighted: true },
            { id: "B", label: "B", x: 22, y: 72, highlighted: false },
            { id: "C", label: "C", x: 78, y: 72, highlighted: false }
          ],
          edges: [
            { from: "A", to: "B", weight: "2", highlighted: true },
            { from: "A", to: "C", label: "ac", highlighted: false }
          ]
        }
      ]
    }
  });

  assert.match(html, /runtime-graph-block/);
  assert.match(html, /runtime-graph-svg/);
  assert.match(html, /runtime-graph-edge is-highlighted/);
  assert.match(html, /runtime-graph-vertex is-highlighted/);
  assert.match(html, />2<\/text>/);
  assert.match(html, />ac<\/text>/);
  assert.match(html, /aria-label="Grafo com vértices A, B, C e arestas A-B, A-C\."/);
});

test("renderiza plane de distância com guias coloridos e nota explícita", () => {
  const html = renderCardRuntimeBlocks({
    title: "Distância",
    runtime: {
      title: "Distância",
      blocks: [
        {
          kind: "plane",
          mode: "distance",
          xRange: [0, 5],
          yRange: [0, 5],
          vectors: [],
          segments: [
            { from: [1, 1], to: [4, 5], tone: "result", dashed: false, role: "distance" },
            { from: [1, 1], to: [4, 1], tone: "secondary", dashed: true, role: "guide-horizontal" },
            { from: [4, 1], to: [4, 5], tone: "tertiary", dashed: true, role: "guide-vertical" }
          ],
          points: [
            { at: [1, 1], label: "A(1,1)", tone: "primary" },
            { at: [4, 5], label: "B(4,5)", tone: "secondary" }
          ],
          note: "Tracejado laranja: 3 em x. Tracejado verde-água: 4 em y.",
          resultText: ""
        }
      ]
    }
  });

  assert.match(html, /runtime-plane-segment tone-secondary is-dashed/);
  assert.match(html, /runtime-plane-segment tone-tertiary is-dashed/);
  assert.match(html, /Tracejado laranja: 3 em x/);
});

test("renderiza plane com lacunas no resultado e move feedback para o dock", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      title: "Plano",
      runtime: {
        title: "Plano",
        blocks: [
          { kind: "heading", value: "Plano" },
          {
            kind: "plane",
            mode: "sum",
            xRange: [-1, 6],
            yRange: [-1, 5],
            vectors: [
              { from: [0, 0], to: [1, 2], label: "v", tone: "primary" },
              { from: [0, 0], to: [3, 1], label: "w", tone: "secondary" },
              { from: [1, 2], to: [4, 3], label: "w", tone: "secondary" },
              { from: [1, 2], to: [4, 3], label: "w deslocado", tone: "secondary", dashed: true },
              { from: [0, 0], to: [4, 3], label: "v+w", tone: "result" }
            ],
            segments: [],
            points: [],
            note: "Para somar no desenho, copiamos w para começar na ponta de v.",
            resultText: "v+w = ([[4::3|5]], [[3::2|4]])"
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: ["", ""],
          feedback: null
        }
      },
      activeTextGapPrompt: {
        blockKey: "course::module::lesson::card::1",
        blankIndex: 0
      }
    }
  );

  assert.match(runtime.bodyHtml, /runtime-plane-result/);
  assert.match(runtime.bodyHtml, /runtime-plane-vector tone-secondary is-dashed/);
  assert.match(runtime.bodyHtml, /runtime-plane-note/);
  assert.match(runtime.bodyHtml, /runtime-plane-gap-blank/);
  assert.match(runtime.bodyHtml, /data-action="text-gap-open-choice"/);
  assert.match(runtime.dockHtml, /data-action="text-gap-set-choice"/);
});

test("legenda do plane nao expande automaticamente coordenadas do vetor resultante", () => {
  const html = renderCardRuntimeBlocks({
    title: "Plano",
    runtime: {
      title: "Plano",
      blocks: [
        { kind: "heading", value: "Plano" },
        {
          kind: "plane",
          mode: "sum",
          xRange: [-1, 6],
          yRange: [-1, 5],
          vectors: [
            { from: [0, 0], to: [1, 2], label: "v", tone: "primary", role: "vector" },
            { from: [0, 0], to: [3, 1], label: "w", tone: "secondary", role: "vector" },
            { from: [1, 2], to: [4, 3], label: "w deslocado", tone: "tertiary", dashed: true, role: "vector" },
            { from: [0, 0], to: [4, 3], label: "v+w", tone: "result", role: "result" }
          ],
          segments: [],
          points: [],
          note: "Copie w para a ponta de v.",
          resultText: ""
        }
      ]
    }
  });

  assert.match(html, />v\+w</);
  assert.doesNotMatch(html, /v\+w = \(4,3\)/);
});

test("renderiza matrix com destaque e lacuna em célula", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      title: "Matriz",
      runtime: {
        title: "Matriz",
        blocks: [
          { kind: "heading", value: "Matriz" },
          {
            kind: "matrix",
            name: "A",
            rowCount: 2,
            columnCount: 3,
            dividerAfterColumn: 2,
            highlightCells: ["1:2"],
            values: [
              [{ value: "1" }, { value: "2" }, { value: "3" }],
              [{ value: "4" }, { value: "5" }, { value: "[[6::5|7|8]]" }]
            ]
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: [""],
          feedback: null
        }
      },
      activeTextGapPrompt: {
        blockKey: "course::module::lesson::card::1",
        blankIndex: 0
      }
    }
  );

  assert.match(runtime.bodyHtml, /runtime-matrix-block/);
  assert.match(runtime.bodyHtml, /runtime-matrix-name">A =/);
  assert.match(runtime.bodyHtml, /runtime-matrix-cell is-highlighted/);
  assert.match(runtime.bodyHtml, /runtime-matrix-divider/);
  assert.match(runtime.bodyHtml, /runtime-matrix-gap-blank/);
  assert.match(runtime.dockHtml, /data-action="text-gap-set-choice"/);
});

test("renderiza matrix com sequência e lacuna no mesmo card", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      title: "Soma",
      runtime: {
        title: "Soma",
        blocks: [
          { kind: "heading", value: "Soma" },
          {
            kind: "matrix",
            sequence: [
              {
                name: "A",
                rowCount: 2,
                columnCount: 2,
                highlightCells: [],
                values: [[{ value: "1" }, { value: "2" }], [{ value: "3" }, { value: "4" }]]
              },
              {
                connector: "+",
                name: "B",
                rowCount: 2,
                columnCount: 2,
                highlightCells: [],
                values: [[{ value: "5" }, { value: "6" }], [{ value: "7" }, { value: "8" }]]
              },
              {
                connector: "=",
                name: "A+B",
                rowCount: 2,
                columnCount: 2,
                highlightCells: ["1:0"],
                values: [[{ value: "6" }, { value: "8" }], [{ value: "[[10::10|9|11]]" }, { value: "12" }]]
              }
            ]
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: [""],
          feedback: null
        }
      },
      activeTextGapPrompt: {
        blockKey: "course::module::lesson::card::1",
        blankIndex: 0
      }
    }
  );

  assert.match(runtime.bodyHtml, /runtime-matrix-equation is-sequence/);
  assert.match(runtime.bodyHtml, /runtime-matrix-sequence-prefix">A \+ B =/);
  assert.match(runtime.bodyHtml, /runtime-matrix-sequence-operator" aria-hidden="true">\+/);
  assert.match(runtime.bodyHtml, /runtime-matrix-sequence-operator" aria-hidden="true">=/);
  assert.match(runtime.bodyHtml, /runtime-matrix-gap-blank/);
  assert.equal(countMatches(runtime.bodyHtml, /<div\b/g), countMatches(runtime.bodyHtml, /<\/div>/g));
  assert.match(runtime.dockHtml, /data-action="text-gap-set-choice"/);
});

test("renderiza parágrafo com lacunas textuais inline", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "text",
      title: "Texto",
      runtime: {
        title: "Texto",
        blocks: [
          { kind: "heading", value: "Texto" },
          { kind: "paragraph", value: "O card controla [[estado]], [[feedback]] e [[resposta]]." }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: ["estado", "feedback", "resposta"],
          feedback: "correct"
        }
      }
    }
  );

  assert.match(html, /runtime-paragraph-gap-block/);
  assert.match(html, /runtime-paragraph-gap-blank/);
  assert.match(html, /Correto\./);
});

test("renderiza lacuna dentro de trecho com acento grave", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "text",
      title: "Texto",
      runtime: {
        title: "Texto",
        blocks: [
          { kind: "heading", value: "Texto" },
          { kind: "paragraph", value: "Se `v = (2,1)`, então `3v = [[(6,3)::(6,3)|(5,3)|(6,2)]]`." }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: ["(6,3)"],
          feedback: null
        }
      }
    }
  );

  assert.match(html, /<code>v = \(2,1\)<\/code>/);
  assert.match(html, /<code>3v = <span class="runtime-text-gap-blank runtime-paragraph-gap-blank runtime-text-gap-choice-blank"/);
  assert.match(html, /<span class="runtime-text-gap-blank runtime-paragraph-gap-blank runtime-text-gap-choice-blank"[^>]*>\(6,3\)<\/span><\/code>/);
});

test("move feedback de parágrafo com lacuna para o dock do card e substitui o prompt ativo", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      type: "text",
      title: "Texto",
      runtime: {
        title: "Texto",
        blocks: [
          { kind: "heading", value: "Texto" },
          { kind: "paragraph", value: "Para mudar de diretório, use [[cd::cd|pwd|ls]]." }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: [""],
          feedback: "incomplete"
        }
      },
      activeTextGapPrompt: {
        blockKey: "course::module::lesson::card::1",
        blankIndex: 0
      }
    }
  );

  assert.doesNotMatch(runtime.bodyHtml, /Complete todas as lacunas\./);
  assert.match(runtime.dockHtml, /Complete todas as lacunas\./);
  assert.doesNotMatch(runtime.dockHtml, /data-action="text-gap-set-choice"/);
});

test("mostra prompt de opções de lacuna no dock quando não há feedback pendente", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      type: "text",
      title: "Texto",
      runtime: {
        title: "Texto",
        blocks: [
          { kind: "heading", value: "Texto" },
          { kind: "paragraph", value: "Para mudar de diretório, use [[cd::cd|pwd|ls]]." }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      textGapExerciseStateByBlockKey: {
        "course::module::lesson::card::1": {
          values: [""],
          feedback: null
        }
      },
      activeTextGapPrompt: {
        blockKey: "course::module::lesson::card::1",
        blankIndex: 0
      }
    }
  );

  assert.match(runtime.dockHtml, /data-action="text-gap-set-choice"/);
  assert.match(runtime.dockHtml, /Opções/);
});

test("renderiza markdown com destaque forte e lista não ordenada", () => {
  const html = renderCardRuntimeBlocks({
    type: "text",
    title: "Markdown",
    runtime: {
      title: "Markdown",
      blocks: [
        { kind: "heading", value: "Markdown" },
        {
          kind: "paragraph",
          value: "**Destaque**\n\n- Item um\n- Item dois"
        }
      ]
    }
  });

  assert.match(html, /<strong>Destaque<\/strong>/);
  assert.match(html, /<ul class="runtime-markdown-list">/);
  assert.match(html, /<li>Item um<\/li>/);
  assert.match(html, /<li>Item dois<\/li>/);
});

test("renderiza ações inline de lacuna textual apenas após erro validado pelo card", () => {
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
          values: ["iterativo"],
          feedback: "wrong"
        }
      }
    }
  );

  assert.match(html, /data-action="complete-view-answer"/);
  assert.match(html, /data-action="complete-try-again"/);
  assert.doesNotMatch(html, /data-action="complete-validate"/);
});

test("identifica popup final do botão e permite omitir o placeholder do corpo do card", () => {
  const card = {
    type: "text",
    title: "Resumo",
    runtime: {
      blocks: [
        { kind: "heading", value: "Resumo" },
        { kind: "paragraph", value: "Conteúdo principal" },
        {
          kind: "button",
          popupEnabled: true,
          popupBlocks: [
            { kind: "paragraph", value: "Comentário final" }
          ]
        }
      ]
    }
  };

  const popupEntry = getRuntimePopupButtonEntry(card);
  assert.deepEqual(popupEntry && { index: popupEntry.index, kind: popupEntry.block.kind }, {
    index: 2,
    kind: "button"
  });

  const bodyHtml = renderCardRuntimeBlocks(card, { omitPopupButtonBlock: true });
  assert.doesNotMatch(bodyHtml, /runtime-popup-block/);

  const runtime = renderCardRuntimeBlocksWithDock(card, { omitPopupButtonBlock: true });
  assert.match(runtime.bodyHtml, /Conteúdo principal/);
  assert.doesNotMatch(runtime.bodyHtml, /Comentário final/);
});

test("ignora botões sem popup válido e encontra o botão final correto", () => {
  const card = {
    type: "text",
    title: "Resumo",
    runtime: {
      blocks: [
        { kind: "heading", value: "Resumo" },
        { kind: "paragraph", value: "Conteúdo principal" },
        {
          kind: "button",
          popupEnabled: false,
          popupBlocks: []
        },
        {
          kind: "button",
          popupEnabled: true,
          popupBlocks: [{ kind: "paragraph", value: "Comentário final" }]
        }
      ]
    }
  };

  const popupEntry = getRuntimePopupButtonEntry(card);
  assert.deepEqual(popupEntry && { index: popupEntry.index, kind: popupEntry.block.kind }, {
    index: 3,
    kind: "button"
  });
});

test("renderiza popup final preservando blocos interativos do runtime", () => {
  const popup = renderPopupButtonDock(
    {
      kind: "button",
      popupEnabled: true,
      popupBlocks: [
        { kind: "paragraph", value: "Comentário final" },
        {
          kind: "multiple_choice",
          ask: "Qual etapa garante rastreabilidade?",
          answerState: "single",
          options: [
            { value: "Testes correspondentes", answer: true },
            { value: "Ignorar validação", answer: false }
          ]
        }
      ]
    },
    {
      blockKeyPrefix: "course::module::lesson::card::2",
      exerciseShuffleSeed: "popup-seed-1",
      choiceExerciseStateByBlockKey: {
        "course::module::lesson::card::2::popup::1": {
          selected: ["exercise-option-0"],
          feedback: "correct"
        }
      }
    }
  );

  assert.match(popup.bodyHtml, /Comentário final/);
  assert.match(popup.bodyHtml, /Qual etapa garante rastreabilidade\?/);
  assert.match(popup.bodyHtml, /multiple-choice-option/);
  assert.match(popup.dockHtml, /Correto\./);
  assert.match(popup.dockHtml, /popup-answer-dock/);
});

test("renderiza árvore de diretórios com destaque do diretório atual", () => {
  const html = renderCardRuntimeBlocks({
    type: "text",
    title: "Árvore",
    runtime: {
      title: "Árvore",
      blocks: [
        { kind: "heading", value: "Árvore" },
        {
          kind: "directory_tree",
          base: "/",
          currentNodeId: "node-projetos",
          nodes: [
            {
              id: "node-home",
              type: "folder",
              name: "home",
              children: [
                {
                  id: "node-projetos",
                  type: "folder",
                  name: "projetos",
                  children: [
                    {
                      id: "node-docs",
                      type: "folder",
                      name: "docs"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.match(html, /runtime-directory-tree-block/);
  assert.match(html, /data-action="directory-tree-toggle-node"/);
  assert.match(html, /data-action="directory-tree-select-node"/);
  assert.match(html, /directory-tree-entry-button is-selected is-current/);
  assert.match(html, /directory-tree-status-panel/);
  assert.match(html, /Diretório atual:/);
  assert.match(html, /Seleção:/);
  assert.match(html, /class="directory-tree-status-value" type="text" readonly value="\/home\/projetos"/);
  assert.match(html, /aria-label="Seleção"/);
  assert.match(html, /docs/);
});

test("renderiza árvore recolhida e mostra linha de seleção separada", () => {
  const html = renderCardRuntimeBlocks(
    {
      type: "text",
      title: "Árvore",
      runtime: {
        title: "Árvore",
        blocks: [
          { kind: "heading", value: "Árvore" },
          {
            kind: "directory_tree",
            base: "/",
            currentNodeId: "node-projetos",
            nodes: [
              {
                id: "node-home",
                type: "folder",
                name: "home",
                children: [
                  {
                    id: "node-projetos",
                    type: "folder",
                    name: "projetos",
                    children: [
                      { id: "node-docs", type: "folder", name: "docs" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      directoryTreeStateByBlockKey: {
        "course::module::lesson::card::1": {
          selectedNodeId: "node-home",
          collapsedNodeIds: ["node-home"]
        }
      }
    }
  );

  assert.match(html, /directory-tree-status-label">Seleção:/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /node-docs/);
});

test("renderiza caminho compacto sem espaços e suporta arquivo como filho", () => {
  const html = renderCardRuntimeBlocks({
    type: "text",
    title: "Árvore",
    runtime: {
      title: "Árvore",
      blocks: [
        { kind: "heading", value: "Árvore" },
        {
          kind: "directory_tree",
          base: "/",
          currentNodeId: "node-projetos",
          selectedNodeId: "node-projetos",
          nodes: [
            {
              id: "node-home",
              type: "folder",
              name: "home",
              children: [
                {
                  id: "node-aluno",
                  type: "folder",
                  name: "aluno",
                  children: [
                    {
                      id: "node-projetos",
                      type: "folder",
                      name: "projetos",
                      children: [
                        { id: "node-readme", type: "file", name: "README.txt" }
                      ]
                    },
                    {
                      id: "node-publico",
                      type: "folder",
                      name: "publico",
                      children: [{ id: "node-notas", type: "file", name: "notas.txt" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.match(html, /\/home\/aluno\/projetos/);
  assert.match(html, /README\.txt/);
  assert.match(html, /publico/);
});

test("renderiza dock de prática da árvore com tipo, nome e ação", () => {
  const runtime = renderCardRuntimeBlocksWithDock(
    {
      type: "text",
      title: "Árvore prática",
      runtime: {
        title: "Árvore prática",
        blocks: [
          { kind: "heading", value: "Árvore prática" },
          {
            kind: "directory_tree",
            base: "/",
            currentNodeId: "node-docs",
            nodes: [
              {
                id: "node-home",
                type: "folder",
                name: "home",
                children: [
                  {
                    id: "node-docs",
                    type: "folder",
                    name: "docs"
                  }
                ]
              }
            ],
            practice: {
              mode: "create_file",
              parentNodeId: "node-docs",
              nameTemplate: "README.[[txt::txt|md]]"
            }
          }
        ]
      }
    },
    {
      blockKeyPrefix: "course::module::lesson::card",
      directoryTreeStateByBlockKey: {
        "course::module::lesson::card::1": {
          nodes: [
            {
              id: "node-home",
              type: "folder",
              name: "home",
              children: [
                {
                  id: "node-docs",
                  type: "folder",
                  name: "docs"
                }
              ]
            }
          ],
          selectedNodeId: "node-docs",
          collapsedNodeIds: [],
          feedback: null,
          hasInteracted: false,
          typeValue: "file",
          nameValues: [""]
        }
      }
    }
  );

  assert.match(runtime.dockHtml, /directory-tree-practice-dock/);
  assert.match(runtime.dockHtml, /Criar arquivo/);
  assert.match(runtime.dockHtml, /data-action="directory-tree-name-set-choice"/);
  assert.match(runtime.dockHtml, /README/);
  assert.match(runtime.dockHtml, /Seleção ativa/);
});
