import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPublicationReady,
  importPreparedCatalogFixture
} from "../../scripts/publishCatalogFixtures.mjs";

function courseWithStatus(status) {
  return {
    id: "course-publication-test",
    modules: [{
      id: "module-publication-test",
      lessons: [{
        id: "lesson-publication-test",
        microsequences: [{ id: "micro-publication-test", status, cards: [{ id: "card-publication-test" }] }]
      }]
    }]
  };
}

test("a publicação administrativa aceita somente microssequências ready", () => {
  assert.doesNotThrow(() => assertPublicationReady(courseWithStatus("ready"), "fixture-ready.json"));
  assert.throws(
    () => assertPublicationReady(courseWithStatus("generated"), "fixture-generated.json"),
    /fixture-generated\.json não está pronta para publicação: 1 microssequência\(s\) sem status ready/u
  );
});

test("a publicação administrativa usa uma revisão imutável no Storage", async () => {
  const calls = [];
  const fixture = {
    fileName: "fixture-artifact.json",
    course: { id: "course-artifact" },
    document: {
      contract: "aralearn.contract",
      version: 3,
      kind: "project",
      courses: [{ id: "course-artifact" }]
    },
    hash: "a".repeat(64),
  };
  const engine = {
    async command(command) {
      calls.push(command);
      return {
        status: command.command === "publish" ? "published" : "validated",
        runId: command.runId
      };
    }
  };

  const result = await importPreparedCatalogFixture(fixture, {
    publish: true,
    engine,
    publisher: {
      actorId: "10000000-0000-5000-8000-000000000001",
      courseId: "20000000-0000-5000-8000-000000000001",
      currentRevisionHash: "b".repeat(64),
      collectionId: null
    },
    environment: {
      ARALEARN_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: `sb_secret_${"a".repeat(40)}`
    }
  });

  assert.equal(result.status, "published");
  assert.deepEqual(calls.map(({ command }) => command), ["import_document", "publish"]);
  assert.equal(calls[0].payload.document, fixture.document);
  assert.deepEqual(calls[0].payload.publicationIntent, {
    mode: "update",
    existingCourseId: "20000000-0000-5000-8000-000000000001",
    expectedContentHash: "b".repeat(64)
  });
  assert.equal(calls[0].runId, calls[1].runId);
  assert.match(calls[0].requestId, /^catalog-import:/u);
  assert.match(calls[1].requestId, /^catalog-publish:/u);
});
