import test from "node:test";
import assert from "node:assert/strict";

import {
  createStructureVersionRecord,
  insertStructureVersionAfterActive,
  normalizeStructureVersionMap,
  normalizeStructureVersionEntry,
  removeActiveStructureVersion,
  replaceActiveStructureVersion
} from "../src/ui/structureVersionState.js";

function createLesson(title = "Lição base") {
  return {
    key: "lesson-base",
    title,
    description: "Resumo",
    sourceGuide: "Guia",
    microsequences: [{ key: "ms-1", title: "Mic 1", cards: [{ key: "c1" }] }]
  };
}

function createModule(title = "Módulo base") {
  return {
    key: "module-base",
    title,
    description: "Resumo",
    sourceGuide: "Guia",
    lessons: [createLesson()]
  };
}

test("normaliza entrada anterior de versão estrutural com snapshot e ids sequenciais", () => {
  const entry = normalizeStructureVersionEntry({
    level: "module",
    entityKey: "module-base",
    activeVersionId: "old-2",
    versions: [
      { id: "old-1", label: "Iteração 1", title: "Módulo A", lessons: [] },
      { id: "old-2", label: "Iteração 2", title: "Módulo B", lessons: [] }
    ]
  });

  assert.equal(entry.level, "module");
  assert.equal(entry.entityKey, "module-base");
  assert.equal(entry.activeVersionId, "v2");
  assert.deepEqual(
    entry.versions.map((version) => ({
      id: version.id,
      operationType: version.operationType,
      title: version.snapshot.title
    })),
    [
      { id: "v1", operationType: "migration", title: "Módulo A" },
      { id: "v2", operationType: "migration", title: "Módulo B" }
    ]
  );
});

test("substitui a versão estrutural ativa preservando metadados estáveis", () => {
  const entry = normalizeStructureVersionEntry({
    level: "lesson",
    entityKey: "lesson-base",
    activeVersionId: "v1",
    versions: [
      createStructureVersionRecord("lesson", createLesson("Antes"), {
        entityKey: "lesson-base",
        versionNumber: 1,
        label: "Versão 1",
        operationType: "seed",
        createdAt: "2026-05-10T10:00:00.000Z",
        updatedAt: "2026-05-10T10:00:00.000Z"
      })
    ]
  });

  const updated = replaceActiveStructureVersion(entry, createLesson("Depois"), {
    now: new Date("2026-05-10T12:00:00.000Z")
  });

  assert.equal(updated.id, "v1");
  assert.equal(updated.operationType, "seed");
  assert.equal(updated.snapshot.title, "Depois");
  assert.equal(updated.createdAt, "2026-05-10T10:00:00.000Z");
  assert.equal(updated.updatedAt, "2026-05-10T12:00:00.000Z");
});

test("insere nova versão estrutural ao fim da linha do tempo com parent da ativa", () => {
  const entry = normalizeStructureVersionEntry({
    level: "course",
    entityKey: "course-base",
    activeVersionId: "v1",
    versions: [
      createStructureVersionRecord("course", { key: "course-base", title: "Curso A", modules: [] }, { entityKey: "course-base", versionNumber: 1 }),
      createStructureVersionRecord("course", { key: "course-base", title: "Curso B", modules: [] }, { entityKey: "course-base", versionNumber: 2 })
    ]
  });

  const inserted = insertStructureVersionAfterActive(
    entry,
    { key: "course-base", title: "Curso Novo", modules: [] },
    {
      label: "Iteração 3",
      operationType: "snapshot",
      now: new Date("2026-05-10T13:00:00.000Z")
    }
  );

  assert.equal(inserted.id, "v3");
  assert.equal(inserted.parentVersionId, "v1");
  assert.equal(entry.activeVersionId, "v3");
  assert.deepEqual(
    entry.versions.map((version) => version.snapshot.title),
    ["Curso A", "Curso B", "Curso Novo"]
  );
});

test("remove a versão estrutural ativa sem resequenciar ids remanescentes", () => {
  const entry = normalizeStructureVersionEntry({
    level: "module",
    entityKey: "module-base",
    activeVersionId: "v2",
    versions: [
      createStructureVersionRecord("module", createModule("Base"), { entityKey: "module-base", versionNumber: 1 }),
      createStructureVersionRecord("module", createModule("Nova"), { entityKey: "module-base", versionNumber: 2 }),
      createStructureVersionRecord("module", createModule("Outra"), { entityKey: "module-base", versionNumber: 3 })
    ]
  });

  const fallback = removeActiveStructureVersion(entry);

  assert.equal(fallback.id, "v1");
  assert.equal(entry.activeVersionId, "v1");
  assert.deepEqual(entry.versions.map((version) => version.id), ["v1", "v3"]);
});

test("atribui numeração pública global estável por nível estrutural", () => {
  const versionMap = {
    "module::course-a::module-a": normalizeStructureVersionEntry({
      level: "module",
      entityKey: "module-a",
      activeVersionId: "v2",
      versions: [
        createStructureVersionRecord("module", createModule("Módulo A"), {
          entityKey: "module-a",
          versionNumber: 1,
          createdAt: "2026-05-10T10:00:00.000Z"
        }),
        createStructureVersionRecord("module", createModule("Módulo A2"), {
          entityKey: "module-a",
          versionNumber: 2,
          parentVersionId: "v1",
          createdAt: "2026-05-10T11:00:00.000Z"
        })
      ]
    }),
    "module::course-a::module-b": normalizeStructureVersionEntry({
      level: "module",
      entityKey: "module-b",
      activeVersionId: "v1",
      versions: [
        createStructureVersionRecord("module", createModule("Módulo B"), {
          entityKey: "module-b",
          versionNumber: 1,
          createdAt: "2026-05-10T12:00:00.000Z"
        })
      ]
    })
  };

  normalizeStructureVersionMap(versionMap);

  assert.deepEqual(
    versionMap["module::course-a::module-a"].versions.map((version) => version.publicNumber),
    [1, 2]
  );
  assert.deepEqual(
    versionMap["module::course-a::module-b"].versions.map((version) => version.publicNumber),
    [3]
  );

  const stableSnapshot = JSON.parse(JSON.stringify(versionMap));
  normalizeStructureVersionMap(versionMap);
  assert.deepEqual(versionMap, stableSnapshot);
});
