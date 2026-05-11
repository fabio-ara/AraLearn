import test from "node:test";
import assert from "node:assert/strict";

import { buildMicrosequenceVersionComparison } from "../src/ui/microsequenceVersionComparison.js";

function createVersion(id, label, cards, extras = {}) {
  return {
    id,
    label,
    title: extras.title || label,
    tags: extras.tags || [],
    ...(extras.parentVersionId ? { parentVersionId: extras.parentVersionId } : {}),
    cards
  };
}

test("compara a versão ativa com a anterior pelo índice do card selecionado", () => {
  const comparison = buildMicrosequenceVersionComparison({
    versions: [
      createVersion("v1", "Versão 1", [{ key: "c1", title: "Antes", say: "Texto A" }], { tags: ["a"] }),
      createVersion("v2", "Versão 2", [{ key: "c1", title: "Depois", say: "Texto B" }], { tags: ["b"] })
    ],
    activeVersionId: "v2",
    cardIndex: 0
  });

  assert.equal(comparison.previousVersion.id, "v1");
  assert.equal(comparison.currentVersion.id, "v2");
  assert.equal(comparison.summary.titleChanged, true);
  assert.equal(comparison.summary.tagsChanged, true);
  assert.equal(comparison.summary.cardStatus, "changed");
  assert.equal(comparison.selectedCard.previousCard.title, "Antes");
  assert.equal(comparison.selectedCard.currentCard.title, "Depois");
});

test("detecta card novo quando a versão atual tem card a mais no índice selecionado", () => {
  const comparison = buildMicrosequenceVersionComparison({
    versions: [
      createVersion("v1", "Versão 1", [{ key: "c1", title: "Único", say: "A" }]),
      createVersion("v2", "Versão 2", [
        { key: "c1", title: "Único", say: "A" },
        { key: "c2", title: "Novo", say: "B" }
      ])
    ],
    activeVersionId: "v2",
    cardIndex: 1
  });

  assert.equal(comparison.summary.cardCountDelta, 1);
  assert.equal(comparison.summary.cardStatus, "added");
  assert.equal(comparison.selectedCard.previousCard, null);
  assert.equal(comparison.selectedCard.currentCard.title, "Novo");
  assert.equal(comparison.composition.totals.added, 1);
  assert.equal(comparison.composition.changes[0].kind, "added");
});

test("não gera comparação quando a versão ativa é a primeira", () => {
  const comparison = buildMicrosequenceVersionComparison({
    versions: [
      createVersion("v1", "Versão 1", [{ key: "c1", title: "Base", say: "A" }]),
      createVersion("v2", "Versão 2", [{ key: "c1", title: "Nova", say: "B" }])
    ],
    activeVersionId: "v1",
    cardIndex: 0
  });

  assert.equal(comparison, null);
});

test("detecta reordenação e alteração estrutural por chave de card", () => {
  const comparison = buildMicrosequenceVersionComparison({
    versions: [
      createVersion("v1", "Versão 1", [
        { key: "c1", title: "Primeiro", say: "A" },
        { key: "c2", title: "Segundo", say: "B" }
      ]),
      createVersion("v2", "Versão 2", [
        { key: "c2", title: "Segundo", say: "B" },
        { key: "c1", title: "Primeiro ajustado", say: "A2" }
      ])
    ],
    activeVersionId: "v2",
    cardIndex: 1
  });

  assert.equal(comparison.composition.changed, true);
  assert.equal(comparison.composition.totals.moved, 2);
  assert.equal(comparison.composition.totals.changed, 0);
  assert.deepEqual(
    comparison.composition.changes.map((item) => item.kind),
    ["moved", "moved"]
  );
});

test("prioriza parentVersionId ao comparar uma variação não sequencial", () => {
  const comparison = buildMicrosequenceVersionComparison({
    versions: [
      createVersion("v1", "Versão 1", [{ key: "c1", title: "Base", say: "A" }]),
      createVersion("v2", "Versão 2", [{ key: "c2", title: "Intermediária", say: "B" }]),
      createVersion("v4", "Versão 4", [{ key: "c1", title: "Variação", say: "A2" }], { parentVersionId: "v1" })
    ],
    activeVersionId: "v4",
    cardIndex: 0
  });

  assert.equal(comparison.previousVersion.id, "v1");
  assert.equal(comparison.currentVersion.id, "v4");
});
