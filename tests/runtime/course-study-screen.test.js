import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderCourseStudyScreen } from "../../src/study/CourseStudyScreen.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";

const fixtureUrl = new URL("../fixtures/package/project-minimal.json", import.meta.url);

function visibleText(html) {
  return html
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

test("oferece zeragem de progresso nos quatro escopos didáticos", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const progress = {
    version: 1,
    lessons: {
      [`${course.id}::${moduleValue.id}::${lesson.id}`]: {
        cursorStudyUnitId: studyUnit.id,
        completedStudyUnitIds: [studyUnit.id]
      }
    }
  };
  const common = {
    project,
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
    progress,
    coursePermissionsById: {}
  };

  const courseHtml = renderCourseStudyScreen({ ...common, view: "course" });
  const moduleHtml = renderCourseStudyScreen({ ...common, view: "module" });
  const lessonHtml = renderCourseStudyScreen({ ...common, view: "lesson" });
  const unitListHtml = renderCourseStudyScreen({
    ...common,
    view: "microsequence",
    microsequenceMode: "overview"
  });

  assert.match(courseHtml, /data-reset-level="module"[^>]+Zerar progresso deste Módulo/u);
  assert.match(moduleHtml, /data-reset-level="lesson"[^>]+Zerar progresso desta Lição/u);
  assert.match(lessonHtml, /data-reset-level="microsequence"[^>]+Zerar progresso desta Microssequência didática/u);
  assert.match(unitListHtml, /data-reset-level="study-unit"[^>]+Zerar progresso a partir desta Unidade de estudo/u);

  const homeHtml = renderCourseStudyScreen({
    ...common,
    view: "courses",
    reviewHasMore: true,
    reviewQueueOpen: true,
    runtimeStatus: { offline: true, stale: true, readOnly: true },
    reviewItems: [{
      title: "Unidade marcada",
      context: "Curso · Módulo · Lição · Microssequência",
      entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id]
    }]
  });
  assert.match(homeHtml, /data-action="load-more-review-items"[^>]*>.*Mostrar mais/su);
  assert.match(homeHtml, /<details class="study-review-queue clean-card" open>/u);
  assert.match(homeHtml, /<strong>Rever<\/strong><span class="muted tiny">1<\/span>/u);
  assert.match(homeHtml, /Sem conexão · alterações pessoais ficam salvas neste dispositivo/u);

  const synchronizingHtml = renderCourseStudyScreen({
    ...common,
    view: "courses",
    runtimeStatus: { offline: false, stale: true, readOnly: true }
  });
  assert.match(
    synchronizingHtml,
    /Exibindo a versão salva · o AraLearn está atualizando os dados/u
  );
  assert.doesNotMatch(synchronizingHtml, /Sem conexão/u);

  const moreOnlyHtml = renderCourseStudyScreen({
    ...common,
    view: "courses",
    reviewHasMore: true,
    reviewItems: []
  });
  assert.match(moreOnlyHtml, /<strong>Rever<\/strong><span class="muted tiny">mais<\/span>/u);
});

test("Lição e Microssequência expõem Visualizar e Assistência por API como modos irmãos", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
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
    coursePermissionsById: {},
    assistance: { enabled: true, activeScope: "", draft: null, saving: false, error: "" }
  };
  for (const [view, action] of [
    ["lesson", "open-lesson-assistance"],
    ["microsequence", "open-microsequence-assistance"]
  ]) {
    const html = renderCourseStudyScreen({
      ...common,
      view,
      microsequenceMode: view === "microsequence" ? "overview" : "play"
    });
    assert.match(html, /role="group" aria-label="Modo da (?:Lição|Microssequência)"/u);
    assert.ok(html.indexOf('aria-label="Visualizar"') < html.indexOf(`data-action="${action}"`));
    assert.match(html, new RegExp(`data-action="${action}"[\\s\\S]*?aria-label="Assistência por API"`, "u"));
  }

  const draftHtml = renderCourseStudyScreen({
    ...common,
    view: "lesson",
    assistance: {
      enabled: true,
      activeScope: "",
      draft: { scope: "lesson", summary: "Reordenar e acrescentar prática." },
      saving: false,
      error: ""
    }
  });
  assert.match(draftHtml, /aria-label="Rascunho da Assistência por API"/u);
  assert.match(draftHtml, /data-action="save-assistance-draft"/u);
  assert.match(draftHtml, /data-action="discard-assistance-draft"/u);
});

test("a Home oferece um seletor de Curso, uma prévia rica e uma entrada contextual", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const base = project.courses[0];
  const courses = [
    { ...structuredClone(base), id: "11111111-1111-4111-8111-111111111111" },
    { ...structuredClone(base), id: "22222222-2222-4222-8222-222222222222" },
    {
      ...structuredClone(base),
      id: "33333333-3333-4333-8333-333333333333",
      title: "Outro Curso"
    }
  ];
  const selected = courses[1];
  const moduleValue = selected.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const permissions = Object.fromEntries(courses.map((course, index) => [course.id, {
    ownership: index === 2 ? "shared" : "owned",
    canEdit: index !== 2,
    availableOffline: index === 1,
    moduleCount: 1,
    lessonCount: 1,
    studyUnitCount: 1,
    completedStudyUnitCount: 0
  }]));
  const html = renderCourseStudyScreen({
    project: { ...project, courses },
    view: "courses",
    selection: {
      courseId: selected.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceId: microsequence.id,
      studyUnitId: studyUnit.id,
      studyUnitIndex: 0
    },
    course: selected,
    moduleValue,
    lesson,
    microsequence,
    studyUnit,
    progress: { version: 1, lessons: {} },
    coursePermissionsById: permissions,
    selectedCourseId: selected.id,
    studyNavigation: {
      positions: {
        [selected.id]: {
          view: "microsequence",
          entityPath: [
            selected.id,
            moduleValue.id,
            lesson.id,
            microsequence.id,
            studyUnit.id
          ],
          microsequenceMode: "play"
        }
      }
    },
    runtimeStatus: { offline: false },
    reviewItems: [{
      title: "Pertence ao selecionado",
      entityPath: [selected.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id]
    }, {
      title: "Pertence a outro Curso",
      entityPath: [courses[0].id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id]
    }]
  });

  assert.equal((html.match(/<select\b/gu) || []).length, 1);
  assert.equal((html.match(/<option\b/gu) || []).length, 3);
  assert.equal((html.match(/class="progress-card home-course-selector-preview"/gu) || []).length, 1);
  assert.match(html, /aria-label="Selecionar Curso"/u);
  assert.match(html, /opção 1/u);
  assert.match(html, /opção 2/u);
  assert.match(html, /Disponível neste dispositivo/u);
  assert.match(html, /aria-label="Retomar [^"]+"/u);
  assert.match(html, />Retomar<\/span>/u);
  assert.match(html, /Pertence ao selecionado/u);
  assert.doesNotMatch(html, /Pertence a outro Curso/u);
  assert.doesNotMatch(html, /<details[^>]+study-review-queue[^>]+open/u);
  assert.doesNotMatch(html, /navigation-list-card|courses-home-list|Abrir Curso/u);
});

test("a Home distingue Curso compartilhado, Curso do autor e cópia pessoal sem expor IDs", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const base = project.courses[0];
  const owned = {
    ...structuredClone(base),
    id: "11111111-1111-4111-8111-111111111111",
    title: "Curso do autor"
  };
  const shared = {
    ...structuredClone(base),
    id: "22222222-2222-4222-8222-222222222222",
    title: "Curso compartilhado"
  };
  const personalCopy = {
    ...structuredClone(base),
    id: "33333333-3333-4333-8333-333333333333",
    title: "Minha continuidade"
  };
  const technicalHash = "8f3c40a21db746879b8018a67fd2d616c690987f";
  const sourceCourseId = "44444444-4444-4444-8444-444444444444";
  const courses = [owned, shared, personalCopy];
  const permissions = {
    [owned.id]: { ownership: "owned", canEdit: true },
    [shared.id]: {
      ownership: "shared",
      canEdit: false,
      canDerive: true,
      personalCopyCourseId: personalCopy.id,
      sourceCourseRevision: technicalHash
    },
    [personalCopy.id]: {
      ownership: "owned",
      canEdit: true,
      isPersonalCopy: true,
      sourceCourseId,
      sourceCourseRevision: technicalHash
    }
  };

  const html = renderHomeScreen({
    project: { ...project, courses },
    progress: { version: 1, lessons: {} },
    editorSupport: { coursePermissionsById: permissions },
    selectedCourseId: personalCopy.id
  });
  const text = visibleText(html);

  assert.match(html, />Curso do autor · Seu Curso<\/option>/u);
  assert.match(html, />Curso compartilhado · Compartilhado com você<\/option>/u);
  assert.match(html, />Minha continuidade · Sua cópia<\/option>/u);
  assert.match(html, /home-course-ownership[^>]*>.*Sua cópia/su);
  assert.doesNotMatch(text, /11111111|22222222|33333333|44444444|8f3c40a2/u);
});

test("a edição em Estudo explica a cópia pessoal e preserva o fluxo direto do autor", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
    view: "microsequence",
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
    microsequenceMode: "play",
    progress: { version: 1, lessons: {} }
  };
  const manualEditor = {
    enabled: true,
    editing: true,
    targetId: "study_unit",
    draft: { pathValues: {} },
    saving: false,
    canUndo: false,
    canRedo: false,
    error: ""
  };

  const sharedHtml = renderCourseStudyScreen({
    ...common,
    manualEditor: { ...manualEditor, createsPersonalCopy: true, isPersonalCopy: false }
  });
  assert.match(
    sharedHtml,
    /Ao salvar, o AraLearn criará uma cópia privada para você\. O Curso compartilhado continuará intacto\./u
  );
  assert.match(sharedHtml, /aria-label="Salvar na minha cópia"/u);
  assert.match(sharedHtml, /<span>Salvar na minha cópia<\/span>/u);
  assert.doesNotMatch(sharedHtml, /study-personal-copy-badge/u);

  const ownedHtml = renderCourseStudyScreen({
    ...common,
    manualEditor: { ...manualEditor, createsPersonalCopy: false, isPersonalCopy: false }
  });
  assert.match(ownedHtml, /Edite diretamente no conteúdo\./u);
  assert.match(ownedHtml, />Visualizar<\/span><\/button>/u);
  assert.match(ownedHtml, />Editar<\/span><\/button>/u);
  assert.match(ownedHtml, />Assistência por API<\/span><\/button>/u);
  assert.ok(
    ownedHtml.indexOf(">Visualizar</span>") <
      ownedHtml.indexOf(">Editar</span>") &&
    ownedHtml.indexOf(">Editar</span>") <
      ownedHtml.indexOf(">Assistência por API</span>")
  );
  assert.match(ownedHtml, /data-action="go-back"[\s\S]*data-action="go-up"/u);
  assert.match(ownedHtml, /aria-label="Subir para a Microssequência"/u);
  assert.match(ownedHtml, /aria-label="Salvar edição"/u);
  assert.doesNotMatch(ownedHtml, /Salvar na minha cópia|Sua cópia/u);

  const personalCopyHtml = renderCourseStudyScreen({
    ...common,
    manualEditor: {
      ...manualEditor,
      editing: false,
      createsPersonalCopy: false,
      isPersonalCopy: true
    }
  });
  assert.match(
    personalCopyHtml,
    /class="study-personal-copy-badge">Sua cópia<\/span>/u
  );
  assert.doesNotMatch(visibleText(personalCopyHtml), /[0-9a-f]{8}-[0-9a-f-]{27,}/iu);
});

test("Study revela citações redigidas somente quando o painel lazy está aberto", async () => {
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const studyUnit = microsequence.studyUnits[0];
  const common = {
    project,
    view: "microsequence",
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
    microsequenceMode: "play",
    progress: { version: 1, lessons: {} },
    citationsLoading: false,
    citationsError: "",
    citations: {
      citations: [{
        sourceId: "fonte-citacao",
        sourceRevision: 2,
        title: "Fonte somente citada",
        citationText: "Autoria. Fonte somente citada. 2026.",
        url: null,
        editionOrVersion: "2ª edição",
        anchors: [{
          anchorId: "anchor-publica",
          anchorRevision: 1,
          selector: { kind: "page_range", startPage: 8, endPage: 9 }
        }]
      }, {
        sourceId: "fonte-com-link",
        sourceRevision: 1,
        title: "Fonte com link público",
        citationText: "Autoria. Fonte com link público. 2026.",
        url: "https://example.test/fonte",
        editionOrVersion: null,
        anchors: []
      }]
    }
  };

  const closed = renderCourseStudyScreen({ ...common, citationsOpen: false });
  assert.match(closed, /data-action="toggle-citations"/u);
  assert.doesNotMatch(closed, /Fonte somente citada|Fonte com link público/u);

  const open = renderCourseStudyScreen({ ...common, citationsOpen: true });
  assert.match(open, /Proveniência desta Unidade/u);
  assert.match(open, /Fonte somente citada/u);
  assert.match(open, /Fonte com link público/u);
  assert.match(open, /pp\. 8–9/u);
  assert.match(open, /href="https:\/\/example\.test\/fonte"/u);
  assert.equal((open.match(/>Abrir fonte<\/a>/gu) || []).length, 1);
  assert.doesNotMatch(open, /Fonte oculta|Legado não resolvido|verificationExcerpt|actorId|studyVisibility/u);
  assert.doesNotMatch(open, /edit-source|retire-source|Revisar fonte|Aposentar fonte/u);
});
