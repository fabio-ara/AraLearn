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
    selection: { courseKey: "course-teste" },
    activeHomeTab: "courses"
  });

  assert.match(html, /data-action="open-home-actions"/);
  assert.match(html, /data-action="open-course-actions"/);
  assert.match(html, /aria-label="Cursos" title="Cursos"/);
  assert.doesNotMatch(html, /<span>Cursos<\/span>/);
  assert.match(html, /progress-meta-item-value">1\/1<\/span>/);
  assert.match(html, /card-progress-fill" style="width:100%"/);
  assert.match(html, /aria-label="1 módulo" title="1 módulo"/);
  assert.match(html, /aria-label="1 lição" title="1 lição"/);
  assert.doesNotMatch(html, />Progresso:/);
  assert.doesNotMatch(html, /data-action="edit-course" data-course-key="course-teste" title="Ações do curso"/);
});

test("ignora cards do placeholder da oficina na contagem inicial", () => {
  const html = renderHomeScreen({
    project: {
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
                  title: "Fila",
                  microsequences: [
                    {
                      key: "__draft-placeholder__",
                      title: "Gerador",
                      cards: [{ key: "card-preso", title: "Preso", say: "Conteúdo" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    progress: { version: 1, lessons: {} },
    selection: { courseKey: "__draft-course__" },
    featuredCourseKey: "__draft-course__",
    activeHomeTab: "courses"
  });

  assert.doesNotMatch(html, /Oficina de microssequências/);
});

test("renderiza aba gerar com seletores em cascata", () => {
  const html = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: [
        {
          key: "course-algebra",
          title: "Álgebra Linear",
          modules: [
            {
              key: "module-matrizes",
              title: "Matrizes",
              lessons: [
                {
                  key: "lesson-operacoes",
                  title: "Operações com matrizes",
                  microsequences: []
                }
              ]
            }
          ]
        }
      ]
    },
    progress: { version: 1, lessons: {} },
    selection: { courseKey: "course-algebra" },
    activeHomeTab: "generate",
    editorSupport: {
      generationDraft: {
        courseKey: "course-algebra",
        moduleKey: "module-matrizes",
        lessonKey: "lesson-operacoes",
        promptText: "Como se faz soma de matrizes?"
      },
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash"
    }
  });

  assert.match(html, /aria-label="Gerar" title="Gerar"/);
  assert.doesNotMatch(html, /<span>Gerar<\/span>/);
  assert.match(html, /data-field="generate-course"/);
  assert.match(html, /aria-label="Curso" title="Curso"/);
  assert.match(html, /aria-label="Dúvida ou comentário" title="Dúvida ou comentário"/);
  assert.match(html, /Álgebra Linear/);
  assert.match(html, /data-action="generate-ladder"/);
  assert.match(html, /aria-label="Montar escada" title="Montar escada"/);
  assert.doesNotMatch(html, /disabled aria-disabled="true"/);
});
