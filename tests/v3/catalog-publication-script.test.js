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

test("a importação administrativa retoma chunk após timeout sem duplicar a etapa", async () => {
  const calls = [];
  let chunkAttempt = 0;
  const fetchImpl = async (url, options) => {
    const functionName = new URL(url).pathname.split("/").at(-1);
    const payload = JSON.parse(options.body);
    calls.push({ functionName, payload });
    if (functionName === "apply_official_course_import_chunk" && chunkAttempt++ === 0) {
      return { ok: false, status: 504, text: async () => JSON.stringify({ message: "upstream timeout" }) };
    }
    const status = functionName === "finalize_official_course_import" ? "published" :
      functionName === "begin_official_course_import" ? "staging" : "applied";
    return { ok: true, status: 200, text: async () => JSON.stringify({ status }) };
  };
  const courseId = "10000000-0000-5000-8000-000000000001";
  const fixture = {
    fileName: "fixture-staged.json",
    course: { id: "course-staged" },
    hash: "a".repeat(64),
    rows: {
      courses: [{
        id: courseId,
        courseId,
        contractKey: "course-staged",
        title: "Curso",
        goal: "Validar importação em partes."
      }],
      modules: [{
        id: "20000000-0000-5000-8000-000000000001",
        courseId,
        contractKey: "module-staged",
        position: 0,
        title: "Módulo"
      }],
      flowNodes: [{
        id: "30000000-0000-5000-8000-000000000001",
        courseId,
        blockId: "40000000-0000-5000-8000-000000000001",
        branch: "root",
        position: 0,
        nodeKind: "sequence"
      }, {
        id: "30000000-0000-5000-8000-000000000002",
        courseId,
        blockId: "40000000-0000-5000-8000-000000000001",
        parentCaseId: "50000000-0000-5000-8000-000000000001",
        branch: "body",
        position: 0,
        nodeKind: "process"
      }],
      flowCases: [{
        id: "50000000-0000-5000-8000-000000000001",
        courseId,
        blockId: "40000000-0000-5000-8000-000000000001",
        flowNodeId: "30000000-0000-5000-8000-000000000001",
        position: 0,
        caseKind: "switch"
      }]
    }
  };

  const result = await importPreparedCatalogFixture(fixture, {
    publish: true,
    fetchImpl,
    environment: {
      ARALEARN_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: `sb_secret_${"a".repeat(40)}`
    }
  });

  assert.equal(result.status, "published");
  assert.deepEqual(calls.map((call) => call.functionName), [
    "begin_official_course_import",
    "apply_official_course_import_chunk",
    "apply_official_course_import_chunk",
    "begin_official_course_import_flow",
    "apply_official_course_import_flow_chunk",
    "finalize_official_course_import"
  ]);
  assert.deepEqual(calls[1].payload, calls[2].payload);
  assert.equal(calls[1].payload.p_chunk_index, 0);
  assert.equal(calls[1].payload.p_rows.length, 1);
  assert.equal(calls[4].payload.p_nodes.length, 2);
  assert.equal(calls[4].payload.p_cases.length, 1);
  assert.equal(calls[4].payload.p_nodes[0].blockId, calls[4].payload.p_cases[0].blockId);
});
