import test from "node:test";
import assert from "node:assert/strict";

import {
  readMicrosequenceVersionStorage,
  readStructureVersionStorage,
  writeMicrosequenceVersionStorage,
  writeStructureVersionStorage
} from "../src/ui/lessonEditorStorage.js";

function createMemoryStorage() {
  const data = new Map();

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    }
  };
}

test("lessonEditorStorage normaliza versões legadas de microssequência na leitura", () => {
  const storage = createMemoryStorage();

  writeMicrosequenceVersionStorage(
    {
      "course::module::lesson::micro": {
        activeVersionId: "legacy-2",
        versions: [
          { id: "legacy-1", label: "Iteração 1", title: "Antes", tags: [], cards: [] },
          { id: "legacy-2", label: "Iteração 2", title: "Depois", tags: [], cards: [] }
        ]
      }
    },
    storage
  );

  const loaded = readMicrosequenceVersionStorage(storage);

  assert.equal(loaded["course::module::lesson::micro"].activeVersionId, "v2");
  assert.deepEqual(
    loaded["course::module::lesson::micro"].versions.map((version) => version.id),
    ["v1", "v2"]
  );
});

test("lessonEditorStorage normaliza versões estruturais legadas na leitura", () => {
  const storage = createMemoryStorage();

  writeStructureVersionStorage(
    {
      "course::module": {
        level: "module",
        entityKey: "module-base",
        activeVersionId: "legacy-1",
        versions: [
          {
            id: "legacy-1",
            label: "Iteração 1",
            title: "Módulo A",
            lessons: []
          }
        ]
      }
    },
    storage
  );

  const loaded = readStructureVersionStorage(storage);
  const entry = loaded["course::module"];

  assert.equal(entry.level, "module");
  assert.equal(entry.entityKey, "module-base");
  assert.equal(entry.activeVersionId, "v1");
  assert.equal(entry.versions[0].snapshot.title, "Módulo A");
  assert.equal(entry.versions[0].operationType, "migration");
});
