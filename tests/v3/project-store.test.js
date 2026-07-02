import test from "node:test";
import assert from "node:assert/strict";

import { parseProjectDocument } from "../../src/storage/projectStore.js";

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
