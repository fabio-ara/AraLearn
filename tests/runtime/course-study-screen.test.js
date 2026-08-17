import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderCourseStudyScreen } from "../../src/study/CourseStudyScreen.js";

const fixtureUrl = new URL("../fixtures/package/project-minimal.json", import.meta.url);

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
    runtimeStatus: { offline: true, stale: true, readOnly: true },
    reviewItems: [{
      title: "Unidade marcada",
      context: "Curso · Módulo · Lição · Microssequência",
      entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id]
    }]
  });
  assert.match(homeHtml, /data-action="load-more-review-items"[^>]*>.*Mostrar mais/su);
  assert.match(homeHtml, /Sem conexão · alterações pessoais ficam salvas neste dispositivo/u);
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
