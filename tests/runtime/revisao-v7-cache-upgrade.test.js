import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { CourseLocalStore, COURSE_LOCAL_DATABASE_PREFIX } from "../../src/persistence/CourseLocalStore.js";
import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";
import { STUDY_DRAFT_RECOVERY_CACHE_KEY, readStudyDraftRecoveries } from "../../src/persistence/studyDraftRecovery.js";

const unit = { title: "Explique a relação", role: "practice", topics: [], feedback: [], content: [
  { id: "table", package: "aralearn.resource.table", version: "1.0.0", data: { columns: ["Termo"], rows: [["Causa"]], prompt: "Observe a relação.", caption: "Caso particular.", layout: "wide" } },
  { id: "consult", package: "aralearn.resource.reading", version: "1.0.0", data: { title: "Leitura", items: [
    { id: "web", label: "Texto consultado", target: { kind: "url", url: "https://example.org/reading" } },
    { id: "pdf", label: "Arquivo consultado", target: { kind: "source_attachment", sourceId: "source", sourceRevision: 2, contentHash: "a".repeat(64) } }
  ] } }
], response: { id: "answer", package: "aralearn.response.open", version: "1.0.0", data: { prompt: "Relacione causa e efeito.", placeholder: "Use os dois termos." } } };

for (const version of [1, 2]) test(`cache v${version} converte uma vez, preserva original e não reproduz comando obsoleto`, async () => {
  const indexedDb = new IDBFactory();
  const original = { items: [{ entityId: "unit", entityType: "study_unit", content: unit,
    contentReview: { state: "current", reviewedAt: "2026-09-01T00:00:00Z" } }] };
  await new Promise((resolve, reject) => {
    const request = indexedDb.open(`${COURSE_LOCAL_DATABASE_PREFIX}-visitor`, version);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("course_cache", { keyPath: "key" });
      store.put({ key: "course.v1.entities:test:1", value: original });
      store.put({ key: "progress", value: { completed: ["unit"], answer: { text: "Resposta pessoal preservada" } } });
      const media = { bytes: new Uint8Array([1, 2, 3]), counter: 2n };
      media.self = media;
      store.put({ key: "unrelated-structured-cache", value: media });
      if (version === 1) store.put({ key: "course.v1.study-draft-recovery", value: { studyUnit: unit } });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  });
  let store = await CourseLocalStore.open(indexedDb, { visitor: true });
  const upgraded = await store.getCache("course.v1.entities:test:1");
  assert.equal(upgraded.items[0].contentReview.state, "stale");
  const content = upgraded.items[0].content;
  assert.equal(content.response, null);
  assert.equal(content.role, "theory");
  for (const item of content.content) assert.equal(registry.validateInstance(item, "content").valid, true);
  assert.ok(JSON.stringify(content).includes("https://example.org/reading"));
  const recoveries = readStudyDraftRecoveries(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY));
  const saved = recoveries.find(entry => entry.originalSnapshot.key === "course.v1.entities:test:1");
  assert.deepEqual(saved.originalSnapshot.value, original);
  assert.equal(saved.command, null);
  assert.equal(await store.getCache("course.v1.study-draft-recovery"), null);
  assert.equal((await store.getCache("progress")).answer.text, "Resposta pessoal preservada");
  const media = await store.getCache("unrelated-structured-cache");
  assert.equal(media.self, media);
  assert.equal(media.counter, 2n);
  assert.deepEqual(media.bytes, new Uint8Array([1, 2, 3]));
  store.close();
  store = await CourseLocalStore.open(indexedDb, { visitor: true });
  assert.deepEqual(await store.getCache("course.v1.entities:test:1"), upgraded);
  assert.equal(readStudyDraftRecoveries(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY)).length, recoveries.length);
  store.close();
});
