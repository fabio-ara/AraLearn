import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { renderAuthGate } from "../../src/ui/AuthGate.js";
import { renderCourseAuthoringSurface } from "../../src/ui/CourseAuthoringSurface.js";
import {
  renderAuthoringEditorExitConfirmation,
  renderCourseStudyScreen
} from "../../src/study/CourseStudyScreen.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const projectFixture = JSON.parse(await readFile(
  new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"
));

function visibleButtonText(markup) {
  return markup
    .replace(/<svg[\s\S]*?<\/svg>/gu, "")
    .replace(/<span class="(?:visually-hidden|course-authoring-visually-hidden)">[\s\S]*?<\/span>/gu, "")
    .replace(/<[^>]*>/gu, "")
    .trim();
}

function buttonMarkup(html, selector) {
  const markup = String(html).match(
    new RegExp(`<button[^>]*${selector}[^>]*>[\\s\\S]*?<\\/button>`, "u")
  )?.[0];
  assert.ok(markup, `botão ausente para ${selector}`);
  return markup;
}

function assertIconOnlyAction(markup, label, { danger = false, title = label } = {}) {
  assert.ok(markup.startsWith("<button"), markup);
  assert.match(markup, new RegExp(`aria-label="${label}"`, "u"), markup);
  assert.match(markup, new RegExp(`title="${title}"`, "u"), markup);
  assert.equal(visibleButtonText(markup), "", markup);
  assert.doesNotMatch(markup, /visually-hidden/u, markup);
  assert.equal((markup.match(/<svg/gu) || []).length, 1, markup);
  assert.equal(danger, /is-danger/u.test(markup), markup);
}

function ownedCourse(overrides = {}) {
  return {
    courseId: COURSE_ID,
    title: "Curso sintético",
    goal: "Percorrer a unidade.",
    ownership: "owned",
    canEdit: true,
    canCopy: true,
    ...overrides
  };
}

test("D001/O035: lista de cursos mantém repetição, paginação e tarefas icon-only", () => {
  const failure = renderCourseAuthoringSurface({
    view: "list",
    failure: { kind: "error", message: "Não foi possível ler os cursos." }
  });
  assertIconOnlyAction(
    buttonMarkup(failure, `data-course-authoring-action="retry"`), "Tentar novamente"
  );

  const list = renderCourseAuthoringSurface({
    view: "list",
    query: "",
    list: {
      items: [{
        courseId: COURSE_ID,
        title: "Curso sintético",
        goal: "Percorrer a unidade.",
        ownership: "owned",
        canEdit: true,
        counts: { microsequenceCount: 2, studyUnitCount: 3 }
      }],
      hasMore: true
    }
  });
  assertIconOnlyAction(
    buttonMarkup(list, `data-course-authoring-action="load-more-courses"`), "Carregar mais cursos"
  );
  assertIconOnlyAction(
    buttonMarkup(list, `data-course-authoring-action="open-create"`), "Criar curso"
  );
  assertIconOnlyAction(
    buttonMarkup(list, `data-course-authoring-action="refresh-course"`), "Atualizar cursos"
  );

  const creationOpen = renderCourseAuthoringSurface({ view: "list", createOpen: true, list: { items: [], hasMore: false } });
  assertIconOnlyAction(
    buttonMarkup(creationOpen, `data-course-authoring-action="open-create"`), "Continuar criação"
  );
});

test("D001/O035: tarefas do curso mantêm destinos legíveis e ações icon-only", () => {
  const sources = renderCourseAuthoringSurface({
    view: "course",
    section: "sources",
    course: ownedCourse(),
    canCopyCourse: true,
    canOpenStudyContent: true
  });
  assertIconOnlyAction(
    buttonMarkup(sources, `data-course-authoring-action="refresh-course"`), "Atualizar curso"
  );
  assertIconOnlyAction(
    buttonMarkup(sources, `data-course-authoring-action="copy-course"`), "Copiar curso"
  );
  assert.match(sources, /<span><strong>Conteúdo<\/strong><\/span>/u);
  assert.match(sources, /<span><strong>Fontes<\/strong><\/span>/u);

  const content = renderCourseAuthoringSurface({
    view: "course",
    section: "content",
    course: ownedCourse(),
    canCopyCourse: true,
    canOpenStudyContent: true
  });
  assertIconOnlyAction(
    buttonMarkup(content, `data-course-authoring-action="edit-content-entity"`), "Editar curso"
  );
});

test("D001/O035: recuperação de acessos e confirmação usam ícone nomeado", () => {
  const people = renderCourseAuthoringSurface({
    view: "course",
    section: "people",
    course: ownedCourse(),
    people: { owner: { userId: "user-owner", handle: "owner" }, people: [] },
    peopleLoading: false,
    peopleFailure: "Não foi possível ler os acessos.",
    pendingPeopleCommand: { draft: { operation: "set_copy_permission", userId: "user-1" } }
  });
  assertIconOnlyAction(
    buttonMarkup(people, `data-course-authoring-action="cancel-copy-permission"`),
    "Encerrar recuperação da permissão de cópia"
  );
  assert.doesNotMatch(people, /Encerrar recuperação e reler/u);

  const failed = renderCourseAuthoringSurface({
    view: "course",
    section: "people",
    course: ownedCourse(),
    people: { owner: { userId: "user-owner", handle: "owner" }, people: [] },
    peopleLoading: false,
    peopleFailure: "Não foi possível ler os acessos."
  });
  assertIconOnlyAction(
    buttonMarkup(failed, `data-course-authoring-action="retry-people" aria-label="Atualizar acessos"`),
    "Atualizar acessos"
  );

  const confirming = renderCourseAuthoringSurface({
    view: "list",
    list: { items: [], hasMore: false },
    actionConfirmation: { message: "Remover o acesso?", tone: "danger", confirmLabel: "Remover acesso" }
  });
  assertIconOnlyAction(
    buttonMarkup(confirming, `data-course-authoring-action="cancel-action-confirmation"`), "Cancelar"
  );
  assertIconOnlyAction(
    buttonMarkup(confirming, `data-course-authoring-action="confirm-action-confirmation"`),
    "Remover acesso", { danger: true }
  );
});

test("D001/O035: rota inválida e saída da autoria não exibem texto de ação", () => {
  assertIconOnlyAction(
    buttonMarkup(renderCourseAuthoringSurface({ view: "invalid" }), `data-course-authoring-action="show-list"`),
    "Ver cursos"
  );
  const exit = renderAuthoringEditorExitConfirmation({ unknown: true });
  assertIconOnlyAction(buttonMarkup(exit, `data-action="cancel-authoring-exit"`), "Continuar editando");
  assertIconOnlyAction(
    buttonMarkup(exit, `data-action="confirm-authoring-exit"`), "Descartar e voltar", { danger: true }
  );
});

test("D001/O035: docks do Estudo salvam, descartam e voltam por ícone nomeado", () => {
  const course = projectFixture.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project: projectFixture,
    view: "study_unit",
    selection: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    progress: { version: 1, lessons: {} },
    coursePermissionsById: {}
  };

  const discardArmed = renderCourseStudyScreen({
    ...common,
    manualEditor: {
      enabled: true,
      editing: true,
      saving: false,
      discardArmed: true,
      error: "A gravação pode ter sido concluída.",
      targetId: "study_unit",
      draft: { pathValues: { title: "Título revisado" } }
    }
  });
  assertIconOnlyAction(
    buttonMarkup(discardArmed, `data-action="study-manual-discard-unknown"`),
    "Descartar rascunho com resultado incerto", { title: "Descartar rascunho" }
  );

  const proposal = renderCourseStudyScreen({
    ...common,
    manualEditor: {
      enabled: true,
      editing: false,
      saving: false,
      targetId: "study_unit",
      draft: { pathValues: {} },
      assistance: { draft: { scope: "study_unit", summary: "Mudança preparada" } }
    }
  });
  assertIconOnlyAction(
    buttonMarkup(proposal, `data-action="save-assistance-draft"`), "Salvar proposta"
  );
  assert.doesNotMatch(proposal, /Salvando…<\/span>/u);

  const contextual = renderCourseStudyScreen({
    ...common,
    manualEditor: {
      enabled: true,
      editing: true,
      saving: false,
      targetId: "study_unit",
      draft: { pathValues: {} },
      authoringContext: { courseTitle: "Curso sintético" }
    }
  });
  assertIconOnlyAction(
    buttonMarkup(contextual, `data-action="authoring-context-back"`), "Voltar ao Conteúdo"
  );
});

test("P001/D001: entrada de acesso permanece icon-only com nome acessível", () => {
  const root = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => []
  };
  renderAuthGate({ root, configured: false });
  const buttons = [...root.innerHTML.matchAll(/<button\b[\s\S]*?<\/button>/gu)].map(match => match[0]);
  assert.ok(buttons.length >= 2);
  for (const markup of buttons) {
    assert.match(markup, /aria-label="[^"]+"/u, markup);
    assert.match(markup, /title="[^"]+"/u, markup);
    assert.equal(visibleButtonText(markup), "", markup);
    assert.ok((markup.match(/<svg/gu) || []).length >= 1, markup);
  }
});
