import test from "node:test";
import assert from "node:assert/strict";

import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import {
  buildDemoMicrosequenceVersions,
  syncDemoMicrosequenceOverflow
} from "../src/ui/demoMicrosequenceVersions.js";

function getExampleMicrosequence() {
  return createExampleProjectDocument().courses[0].modules[0].lessons[0].microsequences[0];
}

test("gera tres versoes demo com quantidades variaveis de cards", () => {
  const microsequence = getExampleMicrosequence();
  const versions = buildDemoMicrosequenceVersions(microsequence);

  assert.equal(versions.length, 3);
  assert.deepEqual(
    versions.map((version) => version.cards.length),
    [3, 5, 7]
  );
  assert.notEqual(versions[0].cards[0].title, microsequence.cards[0].title);
  assert.notEqual(versions[2].cards[6].title, versions[2].cards[0].title);
});

test("migra o demo legado de dezoito versoes identicas para o novo preset", () => {
  const microsequence = getExampleMicrosequence();
  const entry = {
    activeVersionId: "legacy-9",
    versions: Array.from({ length: 18 }, (_, index) => ({
      id: `legacy-${index + 1}`,
      label: `Iteração ${index + 1}`,
      title: microsequence.title,
      tags: structuredClone(microsequence.tags || []),
      cards: structuredClone(microsequence.cards || [])
    }))
  };

  const changed = syncDemoMicrosequenceOverflow(entry, microsequence);

  assert.equal(changed, true);
  assert.equal(entry.versions.length, 3);
  assert.deepEqual(
    entry.versions.map((version) => version.cards.length),
    [3, 5, 7]
  );
  assert.equal(entry.activeVersionId, entry.versions[1].id);
});

test("preserva colecoes reais de versoes ja diferenciadas", () => {
  const microsequence = getExampleMicrosequence();
  const entry = {
    activeVersionId: "real-2",
    versions: [
      {
        id: "real-1",
        label: "Versao 1",
        title: microsequence.title,
        tags: structuredClone(microsequence.tags || []),
        cards: structuredClone(microsequence.cards || [])
      },
      {
        id: "real-2",
        label: "Versao 2",
        title: `${microsequence.title} revisada`,
        tags: structuredClone(microsequence.tags || []),
        cards: structuredClone(microsequence.cards || []).slice(0, 2)
      }
    ]
  };

  const changed = syncDemoMicrosequenceOverflow(entry, microsequence);

  assert.equal(changed, false);
  assert.equal(entry.versions.length, 2);
  assert.equal(entry.activeVersionId, "real-2");
});
