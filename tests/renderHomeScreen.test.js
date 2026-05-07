import test from "node:test";
import assert from "node:assert/strict";

import { renderHomeScreen } from "../src/ui/renderHomeScreen.js";

test("renderiza ações separadas para home e curso na primeira tela", () => {
  const html = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
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
                      cards: [{ key: "card-teste", title: "Card", say: "Conteúdo" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    progress: {
      version: 1,
      lessons: {
        "course-teste::module-teste::lesson-teste": {
          cursor: 0,
          completedCardKeys: ["card-teste"]
        }
      }
    },
    selection: { courseKey: "course-teste" }
  });

  assert.match(html, /data-action="open-home-actions"/);
  assert.match(html, /data-action="open-course-actions"/);
  assert.match(html, /progress-meta-item-value">1\/1<\/span>/);
  assert.match(html, /card-progress-fill" style="width:100%"/);
  assert.match(html, /aria-label="1 módulo" title="1 módulo"/);
  assert.match(html, /aria-label="1 lição" title="1 lição"/);
  assert.doesNotMatch(html, />Progresso:/);
  assert.doesNotMatch(html, /data-action="edit-course" data-course-key="course-teste" title="Ações do curso"/);
});
