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

function read(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const main = read("public/main.js");
const editorApp = read("src/ui/lessonEditorApp.js");
const editorRenderer = read("src/ui/renderLessonScreen.js");
const relationalStore = read("src/persistence/IndexedDbRelationalStore.js");
const repository = read("src/persistence/RelationalProjectRepository.js");
const remoteCatalog = read("src/supabase/RemoteCourseCatalog.js");
const staging = read("scripts/stageWebRuntime.mjs");

test("o entrypoint público preserva o runtime completo sobre o repositório relacional", () => {
  assert.match(
    main,
    /import\s*\{[^}]*\bcreateEditorSession\b[^}]*\}\s*from "\.\.\/src\/editor\/contractEditor\.js"/u
  );
  assert.match(main, /import \{ createLessonEditorApp \} from "\.\.\/src\/ui\/lessonEditorApp\.js"/u);
  assert.match(main, /createEditorSession\(repository\)/u);
  assert.match(main, /createLessonEditorApp\(\{/u);
  assert.doesNotMatch(main, /createLearnerApp|LearnerApp/u);
});

test("autoria não materializa nem bifurca uma árvore relacional remota", () => {
  assert.doesNotMatch(main, /courseIdFromRpcResult|materializePersonalAuthoringCourse/u);
  assert.doesNotMatch(main, /forkCourseForEditing|createCourseForEditing/u);
  assert.doesNotMatch(main, /authoringApi|importPrivateCourse|PersonalIntegration/u);
  assert.match(editorApp, /handleExternalJsonImportText/u);
  assert.match(
    editorApp,
    /structuralEditor\.importCourses\(\{\s*document:\s*parsed\s*\}\)/u
  );
});

test("o runtime completo conserva estudo, navegação e superfícies de autoria", () => {
  for (const capability of [
    /recordCurrentCardView/u,
    /recordCurrentCardAttempt/u,
    /saveCommentForPath/u,
    /writeLessonProgressEntry/u,
    /validateFlowchartExerciseState/u,
    /getCorrectExerciseOptionIds/u,
    /advanceToNextCard/u,
    /continueFromPopup/u
  ]) {
    assert.match(editorApp, capability);
  }
  assert.match(editorRenderer, /data-action="select-workbench-pane"/u);
  assert.match(editorRenderer, /Assistência de card/u);
  assert.match(editorRenderer, /data-action="submit-card-assistance"/u);
  assert.match(editorApp, /event\?\.stopImmediatePropagation\(\)/u);
  assert.match(editorApp, /continuePopupMatches/u);
});

test("o runtime completo continua usando somente seleção pessoal e IndexedDB v4", () => {
  assert.match(relationalStore, /RELATIONAL_DATABASE_NAME\s*=\s*"aralearn-relational-v4-r2"/u);
  assert.match(repository, /courseSelections/u);
  assert.match(remoteCatalog, /"select_catalog_course"/u);
  assert.match(remoteCatalog, /"unselect_catalog_course"/u);
  assert.match(remoteCatalog, /aralearn-course-revisions/u);
  assert.doesNotMatch(remoteCatalog, /get_selected_course_graph|downloadSelectedCourseGraph/u);
  for (const retiredOperation of [
    /clone_catalog_course/u,
    /refresh_personal_course_from_source/u,
    /get_personal_course_graph/u,
    /aralearn-relational-v1/u
  ]) {
    assert.doesNotMatch(main, retiredOperation);
    assert.doesNotMatch(repository, retiredOperation);
  }
});

test("o staging empacota o runtime completo sem catálogo operacional nem segredo", () => {
  for (const dependency of [
    "node_modules/pdfjs-dist/build/pdf.mjs",
    "node_modules/pdfjs-dist/build/pdf.worker.mjs",
    "node_modules/mammoth/mammoth.browser.js"
  ]) {
    assert.match(staging, new RegExp(dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
  assert.match(staging, /"embedded-courses"/u);
  assert.match(staging, /Curso ou catálogo operacional presente no artefato/u);
  assert.match(staging, /payload\?\.role === "service_role"/u);
  assert.match(staging, /\^sb_secret_/u);
  assert.doesNotMatch(staging, /forbiddenStudentRuntimePrefixes|pruneStudentStyles|Dependência autoral presente/u);
});

test("o popup usa exatamente a mesma identidade de bloco que o estado do estudante", () => {
  const card = {
    id: "card-popup",
    title: "Confirmação",
    resource: "paragraph",
    text: "Leia antes de continuar.",
    afterBlocks: [{
      id: "choice-1",
      kind: "choice",
      question: "Entendeu?",
      options: [
        { id: "sim", text: "Sim" },
        { id: "nao", text: "Não" }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["sim"]
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
    kind: "exercise",
    exercise: "gap",
    blocks: [{
      id: "paragraph-1",
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
