import test from "node:test";
import assert from "node:assert/strict";

import { parseProjectDocument } from "../../src/storage/projectStore.js";
import { createProjectStorage } from "../../src/storage/createProjectStorage.js";
import { createEmbeddedSeedProjectDocument } from "../../src/ui/embeddedSeedProjectDocument.js";

test("o parser saneia lacunas em after e afterBlocks antes de validar o projeto", () => {
  const parsed = parseProjectDocument(JSON.stringify({
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-fundamentos",
        title: "Fundamentos",
        goal: "Aprender a base.",
        modules: [
          {
            id: "module-1",
            title: "Módulo 1",
            guide: { goal: "Organizar o estudo." },
            lessons: [
              {
                id: "lesson-1",
                title: "Lição 1",
                guide: { goal: "Explicar a ideia." },
                topics: [],
                microsequences: [
                  {
                    id: "micro-1",
                    title: "Microssequência 1",
                    goal: "Praticar.",
                    role: "practice",
                    status: "ready",
                    cards: [
                          {
                            id: "card-1",
                            position: 1,
                            resource: "paragraph",
                            kind: "theory",
                            exercise: "none",
                            title: "Card",
                            text: "Texto base.",
                            after: "Revise [[setor::setor|valor]].",
                            afterBlocks: [
                              {
                                kind: "paragraph",
                                value: "Resumo: [[matriz::matriz|vetor]]."
                              },
                              {
                                kind: "code",
                                prompt: "Trecho",
                                language: "js",
                                code: "const nome = '[[dado::dado|valor]]';"
                              }
                            ]
                          }
                    ],
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }));

  const card = parsed.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  assert.equal(card.after, "Revise setor.");
  assert.equal(card.afterBlocks[0].value, "Resumo: matriz.");
  assert.equal(card.afterBlocks[1].code, "const nome = 'dado';");
});

test("o armazenamento mantém cursos oficiais fora do documento persistido", () => {
  const seedProject = createEmbeddedSeedProjectDocument();
  const ai900Course = seedProject.courses.find(
    (course) => course.id === "course-microsoft-azure-ai-fundamentals-ai900"
  );
  assert.ok(ai900Course, "curso AI-900 não encontrado no seed atual");

  const extraCourse = {
    id: "course-local-extra",
    title: "Curso local extra",
    goal: "Preservar conteúdo fora do seed.",
    modules: []
  };

  const values = new Map();
  const storage = createProjectStorage({
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  }, undefined, seedProject);
  storage.saveProject({ ...seedProject, courses: [...seedProject.courses, extraCourse] });
  const persisted = JSON.parse(values.get("aralearn.project"));
  assert.deepEqual(persisted.courses, [extraCourse]);
  assert.equal(storage.loadProject().courses.at(-1).id, "course-local-extra");
});
