import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { renderCourseDesignPanel } from "../../src/ui/CourseDesignPanel.js";
import { renderHomeScreen, renderRuntimeStatusControl } from "../../src/ui/renderHomeScreen.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";

const project = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const course = project.courses[0];
const moduleValue = course.modules[0];
const lesson = moduleValue.lessons[0];
const microsequence = lesson.microsequences[0];
const studyUnit = microsequence.studyUnits[0];
const lessonKey = course.id + "::" + moduleValue.id + "::" + lesson.id;

function buttonMarkup(source) {
  return [...source.matchAll(/<button\b[\s\S]*?<\/button>/gu)].map(match => match[0]);
}

function visibleButtonText(markup) {
  return markup
    .replace(/<svg[\s\S]*?<\/svg>/gu, "")
    .replace(/<span class="visually-hidden">[\s\S]*?<\/span>/gu, "")
    .replace(/<[^>]*>/gu, "")
    .trim();
}

function homeFixture(overrides = {}) {
  return renderHomeScreen({
    project,
    progress: {
      version: 1,
      lessons: {
        [lessonKey]: { cursorStudyUnitId: studyUnit.id, completedStudyUnitIds: [studyUnit.id] }
      }
    },
    selectedCourseId: course.id,
    reviewItems: [{
      entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id],
      title: "Unidade para rever",
      context: "Lição sintética"
    }],
    reviewHasMore: true,
    runtimeStatus: { pending: true },
    homeNotice: "Retorno de teste.",
    editorSupport: {
      coursePermissionsById: {
        [course.id]: { ownership: "owned", canCopy: true, availableOffline: true }
      }
    },
    ...overrides
  });
}

test("D001/O035/O036/O039: Home inventaria ações, usa ícones e agrupa risco sem confirmação nova", () => {
  const html = homeFixture({ reviewUndo: { entityPath: [] } });
  const menu = html.match(/<div class="home-course-lifecycle-menu"[\s\S]*?<\/div>/u)?.[0] || "";
  const menuButtons = buttonMarkup(menu);

  assert.deepEqual(
    menuButtons.map(markup => markup.match(/data-action="([^"]+)"/u)?.[1]),
    ["copy-course", "reset-course-progress", "delete-owned-course"]
  );
  for (const markup of menuButtons) {
    assert.match(markup, /aria-label="[^"]+"/u);
    assert.match(markup, /title="[^"]+"/u);
    assert.equal(visibleButtonText(markup), "");
    assert.doesNotMatch(markup, /visually-hidden/u);
  }

  const destructive = menuButtons.filter(markup => /data-action-group="destructive"/u.test(markup));
  assert.equal(destructive.length, 2);
  assert.ok(destructive.every(markup => /class="is-danger"/u.test(markup)));
  assert.ok(destructive.every(markup => /aria-describedby="home-course-destructive-/u.test(markup)));
  assert.doesNotMatch(html, /<dialog[^>]*confirm/iu);

  const navigation = buttonMarkup(html.match(/<nav class="home-product-switch"[\s\S]*?<\/nav>/u)?.[0] || "");
  assert.deepEqual(navigation.map(markup => markup.match(/aria-label="([^"]+)"/u)?.[1]), ["Estudo", "Autoria"]);
  assert.ok(navigation.every(markup => visibleButtonText(markup) === ""));
  assert.ok(navigation.every(markup => !/visually-hidden/u.test(markup)));
  assert.match(html, /data-action="undo-review-removal"[^>]+aria-label="Desfazer"/u);
  assert.match(html, /data-action="load-more-review-items"[^>]+aria-label="Mostrar mais"/u);
});

test("O037: estado de sincronização mantém nome de estado e descreve o envio que o clique dispara", () => {
  const pending = renderRuntimeStatusControl({ pending: true });
  assert.match(pending, /data-action="synchronize-study"/u);
  assert.match(pending, /aria-label="Sincronização pendente"/u);
  assert.match(pending, /data-sync-effect="flush-and-refresh"/u);
  const consequenceId = pending.match(/aria-describedby="([^"]+)"/u)?.[1];
  assert.ok(consequenceId);
  assert.match(pending, new RegExp("id=\"" + consequenceId + "\"[^>]*>[\\s\\S]*envia alterações pendentes", "u"));
  assert.match(pending, /title="Sincronização pendente\. Clicar neste estado envia alterações pendentes/u);

  const offline = renderRuntimeStatusControl({ offline: true });
  assert.doesNotMatch(offline, /data-action="synchronize-study"/u);
  assert.doesNotMatch(offline, /data-sync-effect="flush-and-refresh"/u);
  assert.match(offline, /aria-label="Sem conexão"/u);
});

test("D001/O039: Parâmetros mantém inspeção/auditoria e distingue salvar, descartar e herdar", () => {
  const selection = {
    courseId: "10000000-0000-4000-8000-000000000001",
    moduleId: moduleValue.id,
    lessonId: lesson.id,
    microsequenceId: microsequence.id,
    studyUnitId: studyUnit.id
  };
  const design = courseDesignFixture(selection);
  const parameterId = design.definitions[0].id;
  const editor = renderCourseDesignPanel({
    courseDesign: design,
    designParameterId: parameterId,
    designBusy: false,
    designAppliedParameters: [],
    pendingDesignCommands: new Set()
  });
  const effects = [...editor.matchAll(/data-action-effect="([^"]+)"/gu)].map(match => match[1]);

  assert.match(editor, /Definição e origem/u);
  assert.match(editor, /O que muda ao salvar/u);
  assert.match(editor, /Configuração atual/u);
  assert.match(editor, /role="group" aria-label="Ações do parâmetro"/u);
  assert.deepEqual(effects.slice(0, 3), [
    "restores-inherited-value",
    "discards-form-draft",
    "updates-next-production"
  ]);
  assert.ok(buttonMarkup(editor).every(markup => visibleButtonText(markup) === ""));
  assert.match(editor, /aria-label="Salvar neste escopo" title="Salvar neste escopo"/u);
  assert.match(editor, /aria-label="Descartar alterações" title="Descartar alterações"/u);
  assert.match(editor, /aria-label="Restaurar herança" title="Restaurar herança"/u);

  const editorial = renderCourseDesignPanel({
    courseDesign: design,
    designCategory: "editorial",
    designBusy: false,
    pendingDesignCommands: new Set()
  });
  assert.match(editorial, /role="group" aria-label="Ações da direção editorial"/u);
  assert.match(editorial, /data-action-effect="updates-next-production-guidance"/u);
});
