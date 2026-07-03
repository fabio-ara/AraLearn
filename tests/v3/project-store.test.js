import test from "node:test";
import assert from "node:assert/strict";

import { parseProjectDocument } from "../../src/storage/projectStore.js";
import { createEmbeddedSeedProjectDocument } from "../../src/ui/embeddedSeedProjectDocument.js";
import { syncEmbeddedSeedProjectDocument } from "../../src/ui/syncEmbeddedSeedProjectDocument.js";

test("o parser saneia lacunas legadas em after e afterBlocks antes de validar o projeto", () => {
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
                    versions: [
                      {
                        id: "version-1",
                        source: "manual",
                        action: "repair",
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
                        validation: { ok: true, issues: [] }
                      }
                    ],
                    activeVersion: "version-1"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }));

  const card = parsed.courses[0].modules[0].lessons[0].microsequences[0].versions[0].cards[0];
  assert.equal(card.after, "Revise setor.");
  assert.equal(card.afterBlocks[0].value, "Resumo: matriz.");
  assert.equal(card.afterBlocks[1].code, "const nome = 'dado';");
});

test("a sincronização de seed embarcado atualiza cursos oficiais ao carregar projeto salvo", () => {
  const seedProject = createEmbeddedSeedProjectDocument();
  const fundamentosCourse = seedProject.courses.find((course) => course.id === "course-fundamentos-ia-analise-dados");
  assert.ok(fundamentosCourse, "curso de Fundamentos não encontrado no seed atual");

  const outdatedFundamentosCourse = {
    ...fundamentosCourse,
    modules: fundamentosCourse.modules.slice(0, 6)
  };
  const extraCourse = {
    id: "course-local-extra",
    title: "Curso local extra",
    goal: "Preservar conteúdo fora do seed.",
    modules: []
  };

  const result = syncEmbeddedSeedProjectDocument({
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: seedProject.courses
      .map((course) => (course.id === "course-fundamentos-ia-analise-dados" ? outdatedFundamentosCourse : course))
      .concat(extraCourse)
  });

  assert.equal(result.changed, true);
  assert.equal(result.projectDocument.courses[0].id, seedProject.courses[0].id);
  assert.equal(
    result.projectDocument.courses.find((course) => course.id === "course-fundamentos-ia-analise-dados").modules.length,
    8
  );
  assert.deepEqual(result.projectDocument.courses.at(-1), extraCourse);
});

test("a sincronização remove do projeto salvo os cursos oficiais movidos para o catálogo não persistido", () => {
  const seedProject = createEmbeddedSeedProjectDocument();

  const result = syncEmbeddedSeedProjectDocument({
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      ...seedProject.courses,
      {
        id: "course-matematica-para-informatica",
        title: "Matemática para Informática",
        goal: "Curso agora fora da persistência embarcada.",
        modules: []
      },
      {
        id: "course-local-extra",
        title: "Curso local extra",
        goal: "Continua preservado.",
        modules: []
      }
    ]
  });

  assert.equal(result.changed, true);
  assert.equal(
    result.projectDocument.courses.some((course) => course.id === "course-matematica-para-informatica"),
    false
  );
  assert.equal(result.projectDocument.courses.at(-1).id, "course-local-extra");
});
