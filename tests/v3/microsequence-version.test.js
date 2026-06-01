import test from "node:test";
import assert from "node:assert/strict";

import { createMicrosequenceVersion } from "../../src/domain/microsequenceVersion.js";
import { ensureStoredMicrosequenceVersionEntry } from "../../src/ui/microsequenceVersionState.js";

test("a versão de microssequência normaliza ids duplicados de cards", () => {
  const version = createMicrosequenceVersion({
    cards: [
      {
        id: "card-a",
        position: 1,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "A",
        text: "Texto A",
        after: ""
      },
      {
        id: "card-a",
        position: 2,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "B",
        text: "Texto B",
        after: ""
      }
    ]
  });

  assert.deepEqual(
    version.cards.map((card) => card.id),
    ["card-a", "card-a-2"]
  );
});

test("o seed local de versão preserva os cards da microssequência ao abrir outra etapa estudável", () => {
  const entries = {};
  const microsequence = {
    id: "micro-2",
    title: "Segunda etapa",
    goal: "Continuar",
    status: "generated",
    role: "practice",
    dependsOn: [],
    covers: [],
    checks: [],
    versions: [
      {
        id: "version-seed",
        createdAt: "2026-05-30T00:00:00.000Z",
        source: "llm",
        action: "generate",
        request: "",
        summary: "",
        cards: [
          {
            id: "card-1",
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Primeiro card",
            text: "Texto.",
            after: ""
          }
        ],
        validation: { ok: true, issues: [] }
      }
    ],
    activeVersion: "version-seed"
  };

  const entry = ensureStoredMicrosequenceVersionEntry(entries, "course::module::lesson::micro-2", microsequence);

  assert.ok(entry);
  assert.equal(entry.activeVersionId, "v1");
  assert.equal(entry.versions.length, 1);
  assert.equal(entry.versions[0].cards.length, 1);
  assert.equal(entry.versions[0].cards[0].id, "card-1");
});
