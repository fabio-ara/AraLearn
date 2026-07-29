import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { AuthoringApiClient } from "../../src/supabase/AuthoringApiClient.js";
import { prepareSingleCourseImport } from "../../src/ui/externalJsonImport.js";
import { resolveCatalogPublicationIntent } from "../../src/ui/RemoteLibraryOverlay.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v4/project-minimal.json", import.meta.url),
  "utf8"
));
const overlaySource = fs.readFileSync(
  new URL("../../src/ui/RemoteLibraryOverlay.js", import.meta.url),
  "utf8"
);

test("upload aceita exatamente um curso AraLearn 4 válido", () => {
  const prepared = prepareSingleCourseImport(JSON.stringify(fixture), {
    sourceName: "curso.json"
  });
  assert.equal(prepared.detectedFormat, "contract");
  assert.equal(prepared.course.id, fixture.courses[0].id);

  const twoCourses = structuredClone(fixture);
  twoCourses.courses.push({ ...structuredClone(fixture.courses[0]), id: "outro-curso" });
  assert.throws(
    () => prepareSingleCourseImport(JSON.stringify(twoCourses)),
    /exatamente um curso/u
  );
});

test("upload rejeita campo interno que seria perdido", () => {
  const project = structuredClone(fixture);
  const card = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  Object.assign(card, {
    resource: "graph",
    kind: "theory",
    exercise: "none",
    prompt: "Observe.",
    vertices: [{ id: "A", label: "A", color: "red" }],
    edges: []
  });
  delete card.text;
  assert.throws(
    () => prepareSingleCourseImport(JSON.stringify(project)),
    /vertices\[0\]\.color: Campo fora do schema/u
  );
});

test("publicação distingue criação de atualização protegida pelo hash", () => {
  const course = fixture.courses[0];
  assert.deepEqual(resolveCatalogPublicationIntent(course, []), { mode: "create" });
  const existing = {
    contract_key: course.id,
    course_id: "11111111-1111-4111-8111-111111111111",
    content_hash: "a".repeat(64)
  };
  assert.deepEqual(resolveCatalogPublicationIntent(course, [existing]), {
    mode: "update",
    existingCourseId: existing.course_id,
    expectedContentHash: existing.content_hash
  });
});

test("overlay conserva confirmação acessível antes de publicar", () => {
  assert.match(overlaySource, /data-import-confirm-title/u);
  assert.match(overlaySource, /data-import-confirm-action/u);
  assert.match(overlaySource, /aria-label="Cancelar publicação"/u);
  assert.match(overlaySource, /aria-label="Publicar curso no catálogo"/u);
});

function workspaceResponses() {
  return [
    {
      ok: true,
      data: {
        workspaceId: "11111111-1111-4111-8111-111111111111",
        revision: 1
      }
    },
    { ok: true, data: { revision: 2, currentRevision: 2 } },
    {
      ok: true,
      data: {
        status: "published",
        workspaceId: "11111111-1111-4111-8111-111111111111",
        courseId: "22222222-2222-4222-8222-222222222222"
      }
    }
  ];
}

test("cliente importa pelo workspace sem alterar a UI do fluxo", async () => {
  const requests = [];
  const responses = workspaceResponses();
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "user-session-token" },
    minimumRequestIntervalMs: 0,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  const progress = [];
  const result = await client.importCatalogCourse(fixture, {
    requestId: "33333333-3333-4333-8333-333333333333",
    publicationIntent: { mode: "create" },
    onProgress: (entry) => progress.push(entry)
  });

  assert.equal(result.status, "published");
  assert.equal(requests.length, 3);
  assert.match(requests[0].url, /\/v1\/workspaces$/u);
  assert.match(requests[1].url, /\/workspaces\/[^/]+\/mutations$/u);
  assert.match(requests[2].url, /\/workspaces\/[^/]+\/publications$/u);
  assert.equal(requests[1].body.operation, "insert_entity");
  assert.equal(requests[2].body.completion, "complete");
  assert.equal(requests[0].options.headers.get("apikey"), "sb_publishable_test");
  assert.match(requests[0].options.headers.get("Authorization"), /^Bearer user-session-token$/u);
  assert.equal(progress.at(-1).percent, 100);
});

test("retry transitório conserva requestId da etapa", async () => {
  const responses = workspaceResponses();
  const requestIds = [];
  let failed = false;
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "token" },
    minimumRequestIntervalMs: 0,
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      const requestBody = JSON.parse(options.body);
      requestIds.push(requestBody.requestId);
      if (!failed) {
        failed = true;
        return new Response(JSON.stringify({ error: { message: "temporário" } }), {
          status: 502,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await client.importPrivateCourse(fixture, {
    requestId: "44444444-4444-4444-8444-444444444444"
  });
  assert.equal(requestIds[0], requestIds[1]);
});

test("cliente não envia curso sem sessão", async () => {
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => null }
  });
  await assert.rejects(
    client.importPrivateCourse(fixture, {
      requestId: "55555555-5555-4555-8555-555555555555"
    }),
    (error) => error?.code === "AUTH_REQUIRED"
  );
});

test("cliente recusa importação pública sem intenção explícita", async () => {
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "token" }
  });
  await assert.rejects(
    client.importCatalogCourse(fixture),
    /confirmação de criação ou atualização/u
  );
});
