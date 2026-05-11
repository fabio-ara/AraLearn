import test from "node:test";
import assert from "node:assert/strict";

import {
  createMicrosequenceVersionRecord,
  insertMicrosequenceVersionAfterActive,
  normalizeMicrosequenceVersionEntry,
  removeActiveMicrosequenceVersion,
  replaceActiveMicrosequenceVersion
} from "../src/ui/microsequenceVersionState.js";

function createMicrosequence(title = "Microssequência base") {
  return {
    title,
    tags: ["tag-1"],
    cards: [{ key: "card-1", title: "Card 1", say: "Texto" }]
  };
}

test("normaliza entrada legada de versões com ids sequenciais e operationType migration", () => {
  const entry = normalizeMicrosequenceVersionEntry({
    activeVersionId: "legacy-2",
    versions: [
      { id: "legacy-1", label: "Iteração 1", title: "A", tags: [], cards: [] },
      { id: "legacy-2", label: "Iteração 2", title: "B", tags: [], cards: [] }
    ]
  });

  assert.deepEqual(
    entry.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      operationType: version.operationType
    })),
    [
      { id: "v1", versionNumber: 1, operationType: "migration" },
      { id: "v2", versionNumber: 2, operationType: "migration" }
    ]
  );
  assert.equal(entry.activeVersionId, "v2");
});

test("substitui a versão ativa sem mutar o shape e preserva metadados estáveis", () => {
  const entry = normalizeMicrosequenceVersionEntry({
    activeVersionId: "v1",
    versions: [
      createMicrosequenceVersionRecord(createMicrosequence("Antes"), {
        versionNumber: 1,
        label: "Versão 1",
        operationType: "seed",
        createdAt: "2026-05-10T10:00:00.000Z",
        updatedAt: "2026-05-10T10:00:00.000Z"
      })
    ]
  });

  const updated = replaceActiveMicrosequenceVersion(entry, createMicrosequence("Depois"), {
    now: new Date("2026-05-10T12:00:00.000Z")
  });

  assert.equal(updated.id, "v1");
  assert.equal(updated.versionNumber, 1);
  assert.equal(updated.operationType, "seed");
  assert.equal(updated.createdAt, "2026-05-10T10:00:00.000Z");
  assert.equal(updated.updatedAt, "2026-05-10T12:00:00.000Z");
  assert.equal(updated.title, "Depois");
});

test("insere nova versão ao fim da linha do tempo e preserva a origem da ativa", () => {
  const entry = normalizeMicrosequenceVersionEntry({
    activeVersionId: "v1",
    versions: [
      createMicrosequenceVersionRecord(createMicrosequence("Base"), { versionNumber: 1, label: "Versão 1" }),
      createMicrosequenceVersionRecord(createMicrosequence("Antiga 2"), { versionNumber: 2, label: "Versão 2" })
    ]
  });

  const inserted = insertMicrosequenceVersionAfterActive(entry, createMicrosequence("Nova"), {
    label: "Iteração 3",
    operationType: "snapshot",
    now: new Date("2026-05-10T13:00:00.000Z")
  });

  assert.equal(inserted.id, "v3");
  assert.equal(inserted.parentVersionId, "v1");
  assert.equal(entry.activeVersionId, "v3");
  assert.deepEqual(
    entry.versions.map((version) => ({ id: version.id, title: version.title })),
    [
      { id: "v1", title: "Base" },
      { id: "v2", title: "Antiga 2" },
      { id: "v3", title: "Nova" }
    ]
  );
});

test("remove a versão ativa sem resequenciar ids remanescentes", () => {
  const entry = normalizeMicrosequenceVersionEntry({
    activeVersionId: "v2",
    versions: [
      createMicrosequenceVersionRecord(createMicrosequence("Base"), { versionNumber: 1, label: "Versão 1" }),
      createMicrosequenceVersionRecord(createMicrosequence("Nova"), { versionNumber: 2, label: "Versão 2" }),
      createMicrosequenceVersionRecord(createMicrosequence("Outra"), { versionNumber: 3, label: "Versão 3" })
    ]
  });

  const fallback = removeActiveMicrosequenceVersion(entry);

  assert.equal(fallback.id, "v1");
  assert.equal(entry.activeVersionId, "v1");
  assert.deepEqual(entry.versions.map((version) => version.id), ["v1", "v3"]);
});
