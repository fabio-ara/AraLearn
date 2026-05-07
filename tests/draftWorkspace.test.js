import test from "node:test";
import assert from "node:assert/strict";

import { ensureDraftCourse } from "../src/ui/lessonEditorApp.js";

function buildProjectWithPlaceholderCards() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "__draft-course__",
        title: "Oficina de microssequências",
        modules: [
          {
            key: "__draft-module__",
            title: "Rascunhos",
            lessons: [
              {
                key: "__draft-lesson__",
                title: "Fila de microssequências",
                microsequences: [
                  {
                    key: "__draft-placeholder__",
                    title: "Git básico",
                    tags: ["Git"],
                    cards: [
                      { key: "card-1", title: "Ideia central", say: "Git registra mudanças." },
                      { key: "card-2", title: "Verificação", ask: "Qual comando registra?", answer: "git commit", wrong: ["git add"] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

test("promove cards presos no gerador para rascunho real", () => {
  const project = buildProjectWithPlaceholderCards();
  const result = ensureDraftCourse(project);
  const lesson = result.courses[0].modules[0].lessons[0];
  const placeholder = lesson.microsequences.find((item) => item.key === "__draft-placeholder__");
  const recovered = lesson.microsequences.find((item) => item.key !== "__draft-placeholder__");

  assert.notEqual(result, project);
  assert.equal(project.courses[0].modules[0].lessons[0].microsequences[0].cards.length, 2);
  assert.deepEqual(placeholder.cards, []);
  assert.equal(recovered.title, "Git básico");
  assert.deepEqual(recovered.tags, ["Git"]);
  assert.equal(recovered.cards.length, 2);
});

test("mantém projeto quando o gerador não contém cards", () => {
  const project = buildProjectWithPlaceholderCards();
  project.courses[0].modules[0].lessons[0].microsequences[0].cards = [];

  assert.equal(ensureDraftCourse(project), project);
});
