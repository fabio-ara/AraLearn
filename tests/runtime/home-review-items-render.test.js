import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyProgressDocument } from "../../src/storage/progressStore.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";

function projectWith(courseIds) {
  return {
    version: 4,
    id: "review-home-test",
    title: "Teste",
    courses: courseIds.map((id, index) => ({
      id,
      title: `Curso ${index + 1}`,
      goal: "",
      modules: []
    }))
  };
}

test("a home lista em uma única fila apenas Unidades com caminho completo", () => {
  const selectedCourseId = 'course-"<&';
  const otherCourseId = "course-other";
  const selectedPath = [
    selectedCourseId,
    'module-"<&',
    'lesson-"<&',
    'microsequence-"<&',
    'card-"<&'
  ];
  const project = projectWith([selectedCourseId, otherCourseId]);
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    reviewItems: [
      {
        title: '<img src=x onerror="globalThis.compromised=true">',
        context: 'Curso & lição "segura"',
        entityPath: selectedPath
      },
      {
        title: "Unidade de outro Curso",
        context: "Outro",
        entityPath: [otherCourseId, "module-b", "lesson-b", "micro-b", "study-unit-b"]
      },
      {
        title: "Caminho incompleto",
        entityPath: [selectedCourseId, "module-a", "lesson-a", "micro-a"]
      }
    ]
  });

  assert.equal((html.match(/study-review-queue/g) || []).length, 1);
  assert.equal((html.match(/data-action="open-review-item"/g) || []).length, 2);
  assert.match(html, /<strong>Rever<\/strong>/u);
  assert.match(html, /data-course-id="course-&quot;&lt;&amp;"/u);
  assert.match(html, /data-module-id="module-&quot;&lt;&amp;"/u);
  assert.match(html, /data-lesson-id="lesson-&quot;&lt;&amp;"/u);
  assert.match(html, /data-microsequence-id="microsequence-&quot;&lt;&amp;"/u);
  assert.match(html, /data-study-unit-id="card-&quot;&lt;&amp;"/u);
  assert.match(html, /&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt;/u);
  assert.doesNotMatch(html, /<img src=x/u);
  assert.match(html, /Unidade de outro Curso/u);
  assert.doesNotMatch(html, /Caminho incompleto/u);
});

test("a home não cria fila Rever quando não há caminho navegável", () => {
  const project = projectWith(["course-a", "course-b"]);
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    reviewItems: [{
      title: "Caminho incompleto",
      entityPath: ["course-b", "module-b", "lesson-b", "micro-b"]
    }]
  });

  assert.doesNotMatch(html, /study-review-queue|open-review-item/u);
});
