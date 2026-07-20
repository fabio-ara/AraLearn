import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createFlowchartExerciseState } from "../../src/flowchart/flowchartExercise.js";
import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocks,
  renderCardRuntimeBlocksWithDock,
  renderPopupButtonDock,
  resolveRuntimeFlowchartProjection
} from "../../src/render/renderCardRuntime.js";
import { pruneStudentCss } from "../../scripts/pruneStudentCss.mjs";

function read(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const main = read("public/main.js");
const learnerApp = read("src/ui/LearnerApp.js");
const learnerRenderer = read("src/ui/renderLearnerScreen.js");
const staging = read("scripts/stageWebRuntime.mjs");

test("o entrypoint público inicia somente o app estudantil", () => {
  assert.match(main, /import \{ createLearnerApp \} from "\.\.\/src\/ui\/LearnerApp\.js"/u);
  assert.match(main, /createLearnerApp\(\{/u);
  assert.doesNotMatch(main, /createEditorSession|createLessonEditorApp|lessonEditorApp|src\/editor|src\/generation|src\/assist/u);
});

test("o app estudantil preserva estudo granular sem importar autoria", () => {
  assert.match(learnerApp, /recordCardView/u);
  assert.match(learnerApp, /recordCardAttempt/u);
  assert.match(learnerApp, /saveCommentForPath/u);
  assert.match(learnerApp, /writeLessonProgressEntry/u);
  assert.match(learnerApp, /validateFlowchartExerciseState/u);
  assert.match(learnerApp, /getCorrectExerciseOptionIds/u);
  assert.doesNotMatch(learnerApp, /from\s+["'][^"']*(?:\/editor\/|\/generation\/|\/assist\/)/u);
  assert.doesNotMatch(learnerRenderer, /Editar com IA|open-generation-panel|assist-config|external-import/iu);
});

test("o staging bloqueia dependências autorais e processadores de anexos", () => {
  assert.match(staging, /const runtimeDependencies = \[\]/u);
  for (const pathPrefix of ["src/assist/", "src/editor/", "src/generation/", "node_modules/pdfjs-dist/", "node_modules/mammoth/"]) {
    assert.match(staging, new RegExp(pathPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
  assert.match(staging, /Dependência autoral presente no runtime estudantil/u);
  assert.match(staging, /pruneStudentStyles/u);
  assert.match(staging, /CSS exclusivo de autoria presente no artefato/u);
});

test("o CSS de distribuição conserva o estudante e elimina seletores exclusivamente autorais", () => {
  const stylesheet = `
    .study-reader-screen, .editor-overlay { display: block; }
    .workbench-surface { min-height: 0; }
    .assist-config-overlay { position: fixed; }
    @media (max-width: 430px) {
      .remote-library-panel { width: 100%; }
      .generation-progress-popup { inset: 0; }
    }
  `;
  const runtime = '<main class="study-reader-screen workbench-surface remote-library-panel"></main>';
  const pruned = pruneStudentCss(stylesheet, runtime);

  assert.match(pruned, /\.study-reader-screen/u);
  assert.match(pruned, /\.workbench-surface/u);
  assert.match(pruned, /\.remote-library-panel/u);
  assert.doesNotMatch(pruned, /editor-overlay|assist-config-overlay|generation-progress-popup/u);
});

test("o popup usa exatamente a mesma identidade de bloco que o estado do estudante", () => {
  const card = {
    id: "card-popup",
    title: "Confirmação",
    resource: "paragraph",
    text: "Leia antes de continuar.",
    afterBlocks: [{
      kind: "choice",
      question: "Entendeu?",
      options: [
        { id: "sim", text: "Sim" },
        { id: "nao", text: "Não" }
      ],
      answer: "sim"
    }]
  };
  const popup = getRuntimePopupButtonEntry(card);
  const popupStateKey = `curso::modulo::licao::micro::card-popup::${popup.index}::popup::0`;
  const rendered = renderPopupButtonDock(popup.block, {
    blockKeyPrefix: `curso::modulo::licao::micro::card-popup::${popup.index}::popup`,
    choiceExerciseStateByBlockKey: {
      [popupStateKey]: { selected: [], feedback: null }
    }
  });

  assert.match(rendered.bodyHtml, new RegExp(`data-choice-block-key="${popupStateKey}"`, "u"));
});

test("o fluxograma estrutural reaproveita uma projeção única e renderiza a prática", () => {
  const flowBlock = {
    kind: "flow",
    prompt: "Complete o fluxo.",
    structure: {
      kind: "sequence",
      items: [
        { kind: "start", id: "inicio" },
        {
          kind: "process",
          id: "processar",
          text: "Processar",
          practice: {
            text: {
              blank: true,
              mode: "choice",
              options: ["Processar", "Ignorar"]
            }
          }
        },
        { kind: "end", id: "fim" }
      ]
    }
  };
  const card = {
    id: "card-flow",
    title: "Fluxo",
    resource: "composite",
    blocks: [flowBlock]
  };
  const blockKey = "curso::modulo::licao::micro::card-flow::1";
  const projection = resolveRuntimeFlowchartProjection(flowBlock);
  const exercise = createFlowchartExerciseState(projection);
  const rendered = renderCardRuntimeBlocksWithDock(card, {
    blockKeyPrefix: "curso::modulo::licao::micro::card-flow",
    enableFlowchartPractice: true,
    flowchartProjectionByBlockKey: { [blockKey]: projection },
    flowchartExerciseStateByBlockKey: { [blockKey]: exercise },
    activeFlowchartPrompt: {
      blockKey,
      kind: "text",
      targetId: "processar"
    }
  });

  assert.match(rendered.bodyHtml, /data-action="flowchart-open-text"/u);
  assert.match(rendered.dockHtml, /data-flowchart-prompt="true"/u);
  assert.match(rendered.dockHtml, /data-action="flowchart-set-text"/u);
  assert.match(rendered.dockHtml, /Processar/u);
});

test("a prática de fluxo preserva lacunas de forma, texto e rótulo sem revelar a resposta", () => {
  const flowBlock = {
    kind: "flow",
    structure: {
      kind: "sequence",
      items: [{ kind: "start" }, {
        kind: "process",
        text: "Ler",
        practice: {
          blankShape: true,
          shapeOptions: ["process", "input_output"],
          text: { blank: true }
        }
      }, {
        kind: "while",
        condition: "Continuar?",
        practice: {
          text: {
            blank: true,
            mode: "choice",
            options: ["Continuar?", "Parar?"]
          },
          labels: {
            yes: { blank: true, mode: "choice", options: ["Sim", "Não"] },
            no: { blank: true }
          }
        },
        body: [{ kind: "process", text: "Executar" }]
      }, { kind: "end" }]
    }
  };
  const card = { id: "card-flow-all", title: "Fluxo", resource: "composite", blocks: [flowBlock] };
  const blockKey = "curso::modulo::licao::micro::card-flow-all::1";
  const projection = resolveRuntimeFlowchartProjection(flowBlock);
  const rendered = renderCardRuntimeBlocks(card, {
    blockKeyPrefix: "curso::modulo::licao::micro::card-flow-all",
    enableFlowchartPractice: true,
    flowchartProjectionByBlockKey: { [blockKey]: projection },
    flowchartExerciseStateByBlockKey: {
      [blockKey]: createFlowchartExerciseState(projection)
    }
  });

  assert.match(rendered, /data-action="flowchart-open-shape"/u);
  assert.match(rendered, /data-action="flowchart-open-text"/u);
  assert.match(rendered, /data-flowchart-choice-kind="text"/u);
  assert.match(rendered, /data-action="flowchart-open-label"/u);
  assert.match(rendered, /data-flowchart-choice-kind="label"/u);
  assert.doesNotMatch(rendered, />Sim<\/text>/u);
  assert.doesNotMatch(rendered, />Não<\/text>/u);
});

test("lacunas de opção e texto expõem nomes acessíveis para teclado", () => {
  const card = {
    id: "card-gaps",
    title: "Lacunas",
    resource: "composite",
    blocks: [{
      kind: "paragraph",
      value: "Escolha [[certo::certo|errado]] e escreva [[livre]]."
    }]
  };
  const html = renderCardRuntimeBlocks(card, {
    blockKeyPrefix: "curso::modulo::licao::micro::card-gaps",
    textGapExerciseStateByBlockKey: {
      "curso::modulo::licao::micro::card-gaps::1": { values: ["", ""], feedback: null }
    }
  });

  assert.match(html, /data-action="text-gap-open-choice"[^>]*role="button"|role="button"[^>]*data-action="text-gap-open-choice"/u);
  assert.match(html, /data-action="text-gap-open-choice"[^>]*aria-label="Escolher resposta"/u);
  assert.match(html, /contenteditable="true"[^>]*aria-label="Preencher resposta"/u);
});
