import assert from "node:assert/strict";
import test from "node:test";

import {
  compareRuntimeManifest,
  validatePublicProjectConfiguration,
  verifyHostedBackend
} from "../../scripts/verifyHostedBackend.mjs";

const EXPECTED_REVISION = "20260728010000";
const PUBLIC_KEY = "sb_publishable_test-public-value";
const FEATURES = [
  "lean-shared-catalog",
  "relational-offline-replica",
  "granular-sync",
  "private-authoring",
  "catalog-submissions",
  "text-language-metadata",
  "storage-artifact-control-plane",
  "immutable-course-revisions"
];

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

test("verificador aceita somente configuração pública", () => {
  assert.deepEqual(
    validatePublicProjectConfiguration({
      projectUrl: "https://example.supabase.co/",
      publishableKey: PUBLIC_KEY
    }),
    {
      projectUrl: "https://example.supabase.co",
      publishableKey: PUBLIC_KEY
    }
  );
  assert.throws(
    () => validatePublicProjectConfiguration({
      projectUrl: "https://example.supabase.co",
      publishableKey: "sb_secret_forbidden"
    }),
    /somente a publishable key/
  );
});

test("verificador recusa banco atrasado ou sem capacidade obrigatória", () => {
  const expected = {
    schemaRevision: EXPECTED_REVISION,
    contractVersion: 3,
    requiredFeatures: FEATURES
  };
  assert.throws(
    () => compareRuntimeManifest(expected, {
      schemaRevision: "20260723004000",
      contractVersion: 3,
      features: FEATURES
    }),
    /Aplique as migrations/
  );
  assert.throws(
    () => compareRuntimeManifest(expected, {
      schemaRevision: EXPECTED_REVISION,
      contractVersion: 3,
      features: FEATURES.filter((item) => item !== "granular-sync")
    }),
    /granular-sync/
  );
});

test("verificação remota usa PostgREST sem sessão ou segredo", async () => {
  const calls = [];
  const result = await verifyHostedBackend({
    projectUrl: "https://example.supabase.co",
    publishableKey: PUBLIC_KEY,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, {
        schemaRevision: EXPECTED_REVISION,
        contractVersion: 3,
        features: FEATURES
      });
    }
  });
  assert.equal(result.schemaRevision, EXPECTED_REVISION);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/get_aralearn_runtime_manifest");
  assert.equal(calls[0].options.headers.apikey, PUBLIC_KEY);
  assert.equal("Authorization" in calls[0].options.headers, false);
});

test("função ausente interrompe a publicação com orientação direta", async () => {
  await assert.rejects(
    () => verifyHostedBackend({
      projectUrl: "https://example.supabase.co",
      publishableKey: PUBLIC_KEY,
      fetchImpl: async () => response(404, { code: "PGRST202" })
    }),
    /Aplique as migrations antes de publicar/
  );
});
