import test from "node:test";
import assert from "node:assert/strict";

import { createEmbeddedCourseLoader } from "../../src/ui/embeddedSeedCourseLoader.js";

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(value);
    }
  };
}

test("o loader assíncrono preserva ordem, cache e isolamento dos documentos", async () => {
  const calls = new Map();
  const documents = new Map([
    ["embedded-seed-manifest.json", { courseFiles: ["curso-a.json", "curso-b.json"] }],
    ["curso-a.json", { id: "curso-a" }],
    ["curso-b.json", { id: "curso-b" }]
  ]);
  const loader = createEmbeddedCourseLoader({
    async fetchImpl(url) {
      const fileName = url.pathname.split("/").at(-1);
      calls.set(fileName, (calls.get(fileName) || 0) + 1);
      return documents.has(fileName) ? jsonResponse(documents.get(fileName)) : jsonResponse({}, 404);
    }
  });

  const manifest = await loader.loadSeedManifest();
  assert.deepEqual(manifest.courseFiles, ["curso-a.json", "curso-b.json"]);
  const [firstRead, secondRead] = await Promise.all([
    loader.loadCourse("curso-a.json"),
    loader.loadCourse("curso-a.json")
  ]);
  firstRead.id = "alterado";

  assert.equal(secondRead.id, "curso-a");
  assert.equal(calls.get("curso-a.json"), 1);
  assert.equal(calls.get("embedded-seed-manifest.json"), 1);
});

test("o loader rejeita manifesto duplicado, travessia de diretório e arquivo ausente", async () => {
  const loader = createEmbeddedCourseLoader({
    async fetchImpl(url) {
      const fileName = url.pathname.split("/").at(-1);
      if (fileName === "embedded-seed-manifest.json") {
        return jsonResponse({ courseFiles: ["curso.json", "curso.json"] });
      }
      return jsonResponse({}, 404);
    }
  });

  await assert.rejects(loader.loadSeedManifest(), /duplicados/);
  await assert.rejects(loader.loadCourse("../curso.json"), /Nome de arquivo embarcado inválido/);
  await assert.rejects(loader.loadCourse("ausente.json"), /Falha ao carregar/);
});

test("uma falha de rede não fica presa no cache", async () => {
  let attempt = 0;
  const loader = createEmbeddedCourseLoader({
    async fetchImpl() {
      attempt += 1;
      return attempt === 1 ? jsonResponse({}, 503) : jsonResponse({ id: "curso" });
    }
  });

  await assert.rejects(loader.loadCourse("curso.json"), /503/);
  assert.deepEqual(await loader.loadCourse("curso.json"), { id: "curso" });
  assert.equal(attempt, 2);
});
