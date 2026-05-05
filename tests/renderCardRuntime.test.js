import test from "node:test";
import assert from "node:assert/strict";

import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocks,
  renderCardRuntimeBlocksWithDock,
  renderPopupButtonDock
} from "../src/render/renderCardRuntime.js";

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
  assert.doesNotMatch(html, /data-action="complete-validate"/);
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

test("renderiza popup final apenas com blocos de feedback seguros", () => {
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
  assert.doesNotMatch(popup.bodyHtml, /Qual etapa garante rastreabilidade\?/);
  assert.doesNotMatch(popup.bodyHtml, /multiple-choice-option/);
  assert.equal(popup.dockHtml, "");
});
