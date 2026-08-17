import assert from "node:assert/strict";
import test from "node:test";

import {
  compareRuntimeManifest,
  validatePublicProjectConfiguration,
  verifyHostedBackend
} from "../../scripts/verifyHostedBackend.mjs";

const EXPECTED_REVISION = "20260817180000";
const EXPECTED_CONTRACT_VERSION = 1;
const PUBLIC_KEY = "sb_publishable_test-public-value";
const FEATURES = [
  "flat-runtime-manifest-v1",
  "single-live-course-identity-v1",
  "paged-live-course-composition-v1",
  "direct-course-access-v1",
  "course-personal-state-v1",
  "course-cas-idempotency-v1",
  "oauth-only-authoring-mcp",
  "package-library-v1",
  "package-contract-discovery-v1",
  "person-profile-v1",
  "study-only-course-access-v1",
  "private-person-avatar-v1",
  "self-account-deletion-v1",
  "course-instructional-plan-v1",
  "course-authoring-part-materialization-v1",
  "course-study-unit-inspection-v1",
  "course-design-parameters-v1",
  "course-authoring-guidance-v1",
  "course-component-policy-v1"
];

function response(status, body, headers = {}) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers });
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
    contractVersion: EXPECTED_CONTRACT_VERSION,
    requiredFeatures: FEATURES
  };
  assert.throws(
    () => compareRuntimeManifest(expected, {
      schemaRevision: "20260723004000",
      contractVersion: EXPECTED_CONTRACT_VERSION,
      features: FEATURES
    }),
    /Aplique as migrations/
  );
  assert.throws(
    () => compareRuntimeManifest(expected, {
      schemaRevision: EXPECTED_REVISION,
      contractVersion: EXPECTED_CONTRACT_VERSION,
      features: FEATURES.filter((item) => item !== "course-personal-state-v1")
    }),
    /course-personal-state-v1/
  );
  assert.throws(
    () => compareRuntimeManifest(expected, {
      schemaRevision: EXPECTED_REVISION,
      contractVersion: EXPECTED_CONTRACT_VERSION,
      features: [...FEATURES, "workspace-publication-bindings"]
    }),
    /workspace-publication-bindings/
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
        contractVersion: EXPECTED_CONTRACT_VERSION,
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
