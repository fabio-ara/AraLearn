import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyProgressDocument } from "../../src/storage/progressStore.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";
import { homeTrailSnapshotForProject } from "../support/homeTrailSnapshot.js";

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

test("a home lista em um único menu apenas os cards para rever do curso selecionado", () => {
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
  const trailSnapshot = homeTrailSnapshotForProject(project);
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    editorSupport: {
      selectedHomeCourseKey: selectedCourseId,
      selectedHomeTrailItemId: trailSnapshot.items[0].trailItemId,
      trailSnapshot,
      reviewItems: [
        {
          title: '<img src=x onerror="globalThis.compromised=true">',
          context: 'Curso & lição "segura"',
          entityPath: selectedPath
        },
        {
          title: "Card de outro curso",
          context: "Outro",
          entityPath: [otherCourseId, "module-b", "lesson-b", "micro-b", "card-b"]
        },
        {
          title: "Caminho incompleto",
          entityPath: [selectedCourseId, "module-a", "lesson-a", "micro-a"]
        }
      ]
    }
  });

  assert.equal((html.match(/home-course-review-menu/g) || []).length, 1);
  assert.equal((html.match(/data-action="open-review-card"/g) || []).length, 1);
  assert.match(html, /aria-label="Cards marcados para rever"/u);
  assert.match(html, /data-course-key="course-&quot;&lt;&amp;"/u);
  assert.match(html, /data-module-key="module-&quot;&lt;&amp;"/u);
  assert.match(html, /data-lesson-key="lesson-&quot;&lt;&amp;"/u);
  assert.match(html, /data-microsequence-key="microsequence-&quot;&lt;&amp;"/u);
  assert.match(html, /data-card-key="card-&quot;&lt;&amp;"/u);
  assert.match(html, /&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt;/u);
  assert.doesNotMatch(html, /<img src=x/u);
  assert.doesNotMatch(html, /Card de outro curso|Caminho incompleto/u);
});

test("a home não cria menu Rever quando o curso selecionado não tem marca", () => {
  const project = projectWith(["course-a", "course-b"]);
  const trailSnapshot = homeTrailSnapshotForProject(project);
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    editorSupport: {
      selectedHomeCourseKey: "course-a",
      selectedHomeTrailItemId: trailSnapshot.items[0].trailItemId,
      trailSnapshot,
      reviewItems: [{
        title: "Card B",
        entityPath: ["course-b", "module-b", "lesson-b", "micro-b", "card-b"]
      }]
    }
  });

  assert.doesNotMatch(html, /home-course-review-menu|open-review-card/u);
});
