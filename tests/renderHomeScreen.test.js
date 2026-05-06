import test from "node:test";
import assert from "node:assert/strict";

import { renderHomeScreen } from "../src/ui/renderHomeScreen.js";

test("renderiza ações separadas para home e curso na primeira tela", () => {
  const html = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      courses: [
        {
          key: "course-teste",
          title: "Curso de teste",
          description: "Descrição",
          modules: [
            {
              key: "module-teste",
              title: "Módulo",
              lessons: [
                {
                  key: "lesson-teste",
                  title: "Lição",
                  microsequences: [
                    {
                      key: "microsequence-teste",
                      title: "Microssequência",
                      cards: [{ key: "card-teste", type: "text", title: "Card", text: "Conteúdo" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    progress: { lessons: {} },
    selection: { courseKey: "course-teste" }
  });

  assert.match(html, /data-action="open-home-actions"/);
  assert.match(html, /data-action="open-course-actions"/);
  assert.doesNotMatch(html, /data-action="edit-course" data-course-key="course-teste" title="Ações do curso"/);
});
