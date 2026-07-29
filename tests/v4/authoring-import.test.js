import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareSingleCourseImport } from "../../src/ui/externalJsonImport.js";
import { resolveCatalogPublicationIntent } from "../../src/ui/RemoteLibraryOverlay.js";
import { AuthoringApiClient } from "../../src/supabase/AuthoringApiClient.js";
import { validateImportPayload } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v4/project-minimal.json", import.meta.url),
  "utf8"
));
const overlaySource = fs.readFileSync(
  new URL("../../src/ui/RemoteLibraryOverlay.js", import.meta.url),
  "utf8"
);

test("upload aceita exatamente um curso AraLearn 4 válido", () => {
  const prepared = prepareSingleCourseImport(JSON.stringify(fixture), { sourceName: "curso.json" });
  assert.equal(prepared.detectedFormat, "contract");
  assert.equal(prepared.sourceName, "curso.json");
  assert.equal(prepared.parsed.courses.length, 1);
  assert.equal(prepared.course.id, fixture.courses[0].id);

  const twoCourses = structuredClone(fixture);
  twoCourses.courses.push({ ...structuredClone(fixture.courses[0]), id: "outro-curso" });
  assert.throws(
    () => prepareSingleCourseImport(JSON.stringify(twoCourses)),
    /exatamente um curso/u
  );
  assert.throws(
    () => prepareSingleCourseImport(JSON.stringify({ ...fixture, version: 3 })),
    /não parece ser um arquivo AraLearn válido/u
  );
});

test("API aceita importação por artefato no catálogo e na biblioteca privada", () => {
  const base = {
    requestId: "import-artifact-0001",
    publicationIntent: { mode: "create" },
    document: fixture
  };
  assert.equal(validateImportPayload({ ...base, target: "catalog" }).target, "catalog");
  assert.equal(validateImportPayload({ ...base, target: "private" }).target, "private");
  assert.throws(
    () => validateImportPayload({ ...base, target: "private", collectionId: crypto.randomUUID() }),
    /não pertencem a uma coleção/u
  );
});

test("upload rejeita campo interno que seria perdido na normalização", () => {
  const project = structuredClone(fixture);
  const card = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  Object.assign(card, {
    layout: "auto",
    resource: "graph",
    kind: "theory",
    exercise: "none",
    prompt: "Observe.",
    vertices: [
      { id: "A", label: "A", color: "red" },
      { id: "B", label: "B" }
    ],
    edges: [{ id: "edge-1", from: "A", to: "B" }]
  });
  delete card.text;

  assert.throws(
    () => prepareSingleCourseImport(JSON.stringify(project)),
    /vertices\[0\]\.color: Campo fora do schema/u
  );
});

test("upload público distingue criação de atualização protegida pelo hash atual", () => {
  const course = fixture.courses[0];
  assert.deepEqual(resolveCatalogPublicationIntent(course, []), { mode: "create" });

  const existing = {
    contract_key: course.id,
    course_id: "11111111-1111-4111-8111-111111111111",
    content_hash: "a".repeat(64)
  };
  assert.deepEqual(resolveCatalogPublicationIntent(course, [
    existing,
    { ...existing, collection_id: "22222222-2222-4222-8222-222222222222" }
  ]), {
    mode: "update",
    existingCourseId: existing.course_id,
    expectedContentHash: existing.content_hash
  });
  assert.throws(
    () => resolveCatalogPublicationIntent(course, [{ ...existing, content_hash: "inválido" }]),
    /atualização segura/u
  );
});

test("overlay confirma título e ação antes de publicar com controles iconográficos acessíveis", () => {
  assert.match(overlaySource, /data-import-confirm-title/u);
  assert.match(overlaySource, /data-import-confirm-action/u);
  assert.match(
    overlaySource,
    /data-import-confirm-cancel title="Cancelar publicação" aria-label="Cancelar publicação"/u
  );
  assert.match(
    overlaySource,
    /data-import-confirm-action-button title="Publicar curso no catálogo" aria-label="Publicar curso no catálogo"/u
  );
  const importFlow = overlaySource.slice(
    overlaySource.indexOf('importFileInput.addEventListener("change"'),
    overlaySource.indexOf('root.addEventListener("submit"')
  );
  assert.match(importFlow, /confirmCatalogPublication/u);
  assert.match(importFlow, /publicationIntent/u);
  assert.doesNotMatch(importFlow, /globalThis\.confirm/u);
});

test("cliente de autoria usa somente a sessão pública e retoma publicação idempotente", async () => {
  const requests = [];
  const responses = [
    { ok: true, requestId: "import-request", data: {
      status: "validated", runId: "11111111-1111-4111-8111-111111111111"
    } },
    { ok: true, requestId: "publish-1", data: {
      status: "publishing",
      runId: "11111111-1111-4111-8111-111111111111",
      pollAfterSeconds: 3
    } },
    { ok: true, requestId: "publish-2", data: {
      status: "published", runId: "11111111-1111-4111-8111-111111111111"
    } }
  ];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const sleeps = [];
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "user-session-token" },
    fetchImpl,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    now: () => 0,
    minimumRequestIntervalMs: 0
  });
  const progress = [];
  const result = await client.importCatalogCourse(fixture, {
    requestId: "22222222-2222-4222-8222-222222222222",
    publicationIntent: { mode: "create" },
    onProgress: (entry) => progress.push(entry)
  });

  assert.equal(result.status, "published");
  assert.equal(requests.length, 3);
  assert.match(requests[0].url, /\/functions\/v1\/aralearn-authoring-api\/v1\/imports$/u);
  assert.match(requests[1].url, /\/runs\/11111111-1111-4111-8111-111111111111\/publish$/u);
  assert.match(requests[0].options.headers.get("Authorization"), /^Bearer user-session-token$/u);
  assert.equal(requests[0].options.headers.get("apikey"), "sb_publishable_test");
  assert.deepEqual(requests[0].body.publicationIntent, { mode: "create" });
  assert.doesNotMatch(JSON.stringify(requests), /service.role|service_role|sb_secret_/iu);
  assert.match(requests[1].body.requestId, /^[0-9a-f-]{36}$/u);
  assert.equal(requests[2].body.requestId, requests[1].body.requestId);
  assert.deepEqual(sleeps, [3_000]);
  assert.equal(progress.at(-1).percent, 100);
});

test("cliente repete falha transitória com o mesmo pedido sem repetir etapas aceitas", async () => {
  const bodies = [];
  const sleeps = [];
  let calls = 0;
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "user-session-token" },
    minimumRequestIntervalMs: 0,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetchImpl: async (_url, options) => {
      calls += 1;
      bodies.push(JSON.parse(options.body));
      if (calls === 1) {
        return new Response(JSON.stringify({
          ok: false,
          error: { code: "temporarily_unavailable", message: "Tente novamente." }
        }), { status: 503, headers: { "content-type": "application/json" } });
      }
      if (calls === 2) {
        return new Response(JSON.stringify({ ok: true, data: {
          status: "validated", runId: "11111111-1111-4111-8111-111111111111"
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, data: {
        status: "published", runId: "11111111-1111-4111-8111-111111111111"
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await client.importCatalogCourse(fixture, {
    requestId: "22222222-2222-4222-8222-222222222222",
    publicationIntent: {
      mode: "update",
      existingCourseId: "11111111-1111-4111-8111-111111111111",
      expectedContentHash: "b".repeat(64)
    }
  });

  assert.equal(result.status, "published");
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [500]);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[0].publicationIntent.mode, "update");
});

test("cliente retoma o mesmo polling após 502 do gateway", async () => {
  const requests = [];
  const sleeps = [];
  const runId = "11111111-1111-4111-8111-111111111111";
  let call = 0;
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "user-session-token" },
    minimumRequestIntervalMs: 0,
    now: () => 0,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetchImpl: async (url, options) => {
      call += 1;
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      if (call === 1) {
        return new Response(JSON.stringify({
          ok: true,
          data: { status: "validated", runId }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (call === 2) {
        return new Response("An invalid response was received from the upstream server", {
          status: 502,
          headers: { "content-type": "text/plain" }
        });
      }
      if (call === 3) {
        return new Response(JSON.stringify({
          ok: true,
          data: { status: "publishing", runId, pollAfterSeconds: 1 }
        }), { status: 202, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: { status: "published", runId }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await client.importCatalogCourse(fixture, {
    requestId: "22222222-2222-4222-8222-222222222222",
    publicationIntent: { mode: "create" }
  });

  assert.equal(result.status, "published");
  assert.equal(requests.length, 4);
  assert.equal(requests[1].url, requests[2].url);
  assert.deepEqual(requests[1].body, requests[2].body);
  assert.deepEqual(requests[2].body, requests[3].body);
  assert.deepEqual(sleeps, [500, 1_000]);
});

test("cliente não envia curso sem sessão", async () => {
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => null },
    fetchImpl: async () => assert.fail("A rede não deveria ser usada.")
  });
  await assert.rejects(
    () => client.importCatalogCourse(fixture, { publicationIntent: { mode: "create" } }),
    (error) => error?.code === "AUTH_REQUIRED" && error?.status === 401
  );
});

test("401 em imports invalida a sessão uma vez e permite repetir o mesmo pedido após novo acesso", async () => {
  const requestId = "22222222-2222-4222-8222-222222222222";
  const requests = [];
  const events = [];
  let accessToken = "expired-session-token";
  let clearCount = 0;
  let callCount = 0;
  const authClient = {
    getAccessToken: async () => accessToken,
    async clearSession() {
      clearCount += 1;
      accessToken = null;
    },
    emit(event) {
      events.push(event);
    }
  };
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient,
    minimumRequestIntervalMs: 0,
    fetchImpl: async (url, options) => {
      callCount += 1;
      requests.push({
        url: String(url),
        authorization: options.headers.get("Authorization"),
        body: JSON.parse(options.body)
      });
      if (callCount === 1) {
        return new Response(JSON.stringify({
          ok: false,
          error: { code: "invalid_jwt", message: "JWT expired" }
        }), { status: 401, headers: { "content-type": "application/json" } });
      }
      if (callCount === 2) {
        return new Response(JSON.stringify({ ok: true, data: {
          status: "validated", runId: "11111111-1111-4111-8111-111111111111"
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, data: {
        status: "published", runId: "11111111-1111-4111-8111-111111111111"
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const options = { requestId, publicationIntent: { mode: "create" } };

  await assert.rejects(
    () => client.importCatalogCourse(fixture, options),
    (error) => error?.name === "AuthRequiredError" &&
      error?.code === "AUTH_REQUIRED" && error?.status === 401 && error?.authRequired === true
  );
  assert.equal(callCount, 1);
  assert.equal(clearCount, 1);
  assert.deepEqual(events, ["SESSION_INVALID"]);

  accessToken = "renewed-session-token";
  const result = await client.importCatalogCourse(fixture, options);
  assert.equal(result.status, "published");
  assert.equal(callCount, 3);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(requests[0].authorization, "Bearer expired-session-token");
  assert.equal(requests[1].authorization, "Bearer renewed-session-token");
  assert.equal(clearCount, 1);
  assert.deepEqual(events, ["SESSION_INVALID"]);
});

test("401 no polling preserva os identificadores de importação e publicação para retomada", async () => {
  const requestId = "22222222-2222-4222-8222-222222222222";
  const requests = [];
  const events = [];
  let accessToken = "expired-session-token";
  let clearCount = 0;
  let callCount = 0;
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: {
      getAccessToken: async () => accessToken,
      async clearSession() {
        clearCount += 1;
        accessToken = null;
      },
      emit(event) {
        events.push(event);
      }
    },
    minimumRequestIntervalMs: 0,
    fetchImpl: async (url, options) => {
      callCount += 1;
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      if (callCount === 1 || callCount === 3) {
        return new Response(JSON.stringify({ ok: true, data: {
          status: "validated", runId: "11111111-1111-4111-8111-111111111111"
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (callCount === 2) {
        return new Response(JSON.stringify({
          ok: false,
          error: { code: "jwt_expired", message: "JWT expired" }
        }), { status: 401, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, data: {
        status: "published", runId: "11111111-1111-4111-8111-111111111111"
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const options = { requestId, publicationIntent: { mode: "create" } };

  await assert.rejects(
    () => client.importCatalogCourse(fixture, options),
    (error) => error?.code === "AUTH_REQUIRED" && error?.status === 401
  );
  assert.equal(callCount, 2);
  assert.match(requests[1].url, /\/publish$/u);
  assert.equal(clearCount, 1);
  assert.deepEqual(events, ["SESSION_INVALID"]);

  accessToken = "renewed-session-token";
  const result = await client.importCatalogCourse(fixture, options);
  assert.equal(result.status, "published");
  assert.equal(callCount, 4);
  assert.deepEqual(requests[2].body, requests[0].body);
  assert.deepEqual(requests[3].body, requests[1].body);
  assert.equal(clearCount, 1);
  assert.deepEqual(events, ["SESSION_INVALID"]);
});

test("403 editorial permanece determinístico e não invalida a sessão", async () => {
  const events = [];
  let clearCount = 0;
  let requestCount = 0;
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: {
      getAccessToken: async () => "valid-session-token",
      async clearSession() {
        clearCount += 1;
      },
      emit(event) {
        events.push(event);
      }
    },
    fetchImpl: async () => {
      requestCount += 1;
      return new Response(JSON.stringify({
        ok: false,
        error: { code: "insufficient_scope", message: "Publicação não autorizada." }
      }), { status: 403, headers: { "content-type": "application/json" } });
    }
  });

  await assert.rejects(
    () => client.importCatalogCourse(fixture, { publicationIntent: { mode: "create" } }),
    (error) => error?.status === 403 && error?.code === "insufficient_scope"
  );
  assert.equal(requestCount, 1);
  assert.equal(clearCount, 0);
  assert.deepEqual(events, []);
});

test("cliente recusa importação pública sem intenção explícita", async () => {
  const client = new AuthoringApiClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "user-session-token" },
    fetchImpl: async () => assert.fail("A rede não deveria ser usada.")
  });
  await assert.rejects(
    () => client.importCatalogCourse(fixture),
    /confirmação de criação ou atualização/u
  );
});
