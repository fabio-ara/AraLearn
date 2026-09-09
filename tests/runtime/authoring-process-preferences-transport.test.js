import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";

const actorId = "10000000-0000-4000-8000-000000000001";
const origin = "https://app.example";
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

function harness({ readonly = false } = {}) {
  const calls = [];
  let stored = { contract: "aralearn.authoring-process-preferences.v1", revision: 0,
    preferences: defaultAuthoringProcessPreferences(), updatedAt: null };
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://database.example", publicAppUrl: origin,
    publishableKey: "synthetic-public", serverApiKey: "synthetic-service", attempts: 1,
    fetchImpl: async (url, init) => {
      const input = JSON.parse(init.body);
      calls.push({ url, input });
      assert.equal(input.p_actor_id, actorId);
      if (url.endsWith("/get_authoring_process_preferences_for_actor_v1")) return json(stored);
      assert.ok(url.endsWith("/save_authoring_process_preferences_for_actor_v1"));
      assert.equal(input.p_expected_revision, stored.revision);
      stored = { ...stored, revision: stored.revision + 1, preferences: input.p_preferences, updatedAt: "2026-09-09T01:00:00Z" };
      return json({ ...stored, contract: "aralearn.authoring-process-preferences-change.v1",
        requestId: input.p_request_id, changed: true, idempotent: false });
    } });
  adapter.resolveApplicationPrincipal = async () => ({ actorId, authenticationKind: "application",
    scopes: readonly ? ["authoring:read"] : ["authoring:read", "authoring:write"] });
  const handler = createCourseApiHandler({ adapter, allowedOrigins: new Set([origin]) });
  const client = new CourseApiClient({ projectUrl: "https://database.example", publishableKey: "synthetic-public",
    authClient: { getAccessToken: async () => "synthetic-session" }, fetchImpl: (url, init) => {
      const headers = new Headers(init.headers);
      headers.set("Origin", origin);
      return handler(new Request(url, { ...init, headers }));
    } });
  return { client, calls };
}

test("preferências atravessam cliente, rota e adaptador sem aceitar identidade de outra conta", async () => {
  const { client, calls } = harness();
  const current = await client.getAuthoringProcessPreferences();
  const preferences = { ...current.preferences, focus: "content" };
  const command = { expectedRevision: 0, preferences, requestId: "process-transport-1" };
  assert.equal((await client.saveAuthoringProcessPreferences(command)).revision, 1);
  assert.deepEqual((await client.getAuthoringProcessPreferences()).preferences, preferences);
  await assert.rejects(async () => client.saveAuthoringProcessPreferences({ ...command, actorId }), /contrato/u);
  assert.equal(calls.length, 3);
});

test("escopo somente leitura não alcança a mutação das preferências", async () => {
  const { client, calls } = harness({ readonly: true });
  const current = await client.getAuthoringProcessPreferences();
  await assert.rejects(client.saveAuthoringProcessPreferences({ expectedRevision: 0,
    preferences: current.preferences, requestId: "process-readonly-1" }), error => error.status === 403);
  assert.equal(calls.length, 1);
});
