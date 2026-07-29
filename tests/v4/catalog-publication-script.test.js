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
      version: 4,
      kind: "project",
      courses: [{ id: "course-artifact" }]
    },
    hash: "a".repeat(64),
  };
  const engine = {
    async create(command) {
      calls.push({ method: "create", ...command });
      return { revision: 1, currentRevision: 1 };
    },
    async mutate(command) {
      calls.push({ method: "mutate", ...command });
      return { revision: 2, currentRevision: 2 };
    },
    async publish(command) {
      calls.push({ method: "publish", ...command });
      return { status: "published", workspaceId: command.workspaceId };
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
  assert.deepEqual(calls.map(({ method }) => method), ["create", "mutate", "publish"]);
  assert.equal(calls[1].arguments.entity, fixture.course);
  assert.equal(calls[2].publicationMode, "update");
  assert.equal(calls[2].existingCourseId, "20000000-0000-5000-8000-000000000001");
  assert.equal(calls[2].expectedContentHash, "b".repeat(64));
  assert.equal(calls[0].workspaceId, calls[1].workspaceId);
  assert.equal(calls[1].workspaceId, calls[2].workspaceId);
  assert.match(calls[0].requestId, /^catalog-workspace:/u);
  assert.match(calls[1].requestId, /^catalog-import:/u);
  assert.match(calls[2].requestId, /^catalog-publish:/u);
});
