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
