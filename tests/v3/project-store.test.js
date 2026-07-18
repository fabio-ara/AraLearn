import test from "node:test";
import assert from "node:assert/strict";

import { parseProjectDocument } from "../../src/storage/projectStore.js";
import { createProjectStorage } from "../../src/storage/createProjectStorage.js";
import { getEmbeddedSeedProjectFixture } from "../support/embeddedCatalogFixture.js";

test("o parser rejeita feedback com lacunas interativas", () => {
  const source = JSON.stringify({
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
  });

  assert.throws(
    () => parseProjectDocument(source),
    /after não pode conter lacunas interativas|afterBlocks não pode conter lacunas interativas/u
  );
});

test("o armazenamento mantém cursos oficiais fora do documento persistido", () => {
  const seedProject = getEmbeddedSeedProjectFixture();
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
    setItems: (entries) => entries.forEach(([key, value]) => values.set(key, value)),
    removeItem: (key) => values.delete(key),
    flush: async () => undefined
  }, undefined, seedProject);
  storage.saveProject({ ...seedProject, courses: [...seedProject.courses, extraCourse] });
  const persisted = JSON.parse(values.get("aralearn.project"));
  assert.deepEqual(persisted.courses, [extraCourse]);
  assert.equal(storage.loadProject().courses.at(-1).id, "course-local-extra");
});
