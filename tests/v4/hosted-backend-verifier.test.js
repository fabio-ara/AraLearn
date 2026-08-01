import assert from "node:assert/strict";
import test from "node:test";

import {
  compareRuntimeManifest,
  validatePublicProjectConfiguration,
  verifyCourseRevisionCors,
  verifyHostedBackend
} from "../../scripts/verifyHostedBackend.mjs";

const EXPECTED_REVISION = "20260801233000";
const EXPECTED_CONTRACT_VERSION = 4;
const PUBLIC_KEY = "sb_publishable_test-public-value";
const FEATURES = [
  "lean-shared-catalog",
  "artifact-offline-replica",
  "granular-sync",
  "private-authoring",
  "text-language-metadata",
  "storage-artifact-control-plane",
  "pre-registered-publication-artifacts",
  "single-current-course-revision",
  "storage-only-course-content",
  "canonical-resource-registry",
  "atomic-resource-authoring",
  "atomic-card-assistance",
  "composed-authoring-workspaces",
  "workspace-publication-bindings",
  "unchanged-publication-short-circuit",
  "bounded-authoring-events",
  "partial-private-publication",
  "microtheory-review-projection",
  "workspace-event-cursor-pagination",
  "workspace-microsequence-card-pagination",
  "global-catalog-course-search",
  "catalog-review-submissions",
  "catalog-management",
  "personal-library-course-removal",
  "course-revision-sync-compaction",
  "automatic-sync-history-maintenance",
  "compact-authoring-brief",
  "account-derived-authoring-capabilities",
  "oauth-only-authoring-mcp",
  "default-catalog-collection",
  "confidential-gpt-action-oauth",
  "gpt-action-oauth-linking",
  "gpt-action-oauth-relinking",
  "gpt-action-oauth-stable-callback",
  "workspace-card-metadata",
  "structured-authoring-errors",
  "current-state-central-v1",
  "situated-personal-comments-v1",
  "educational-workspace-membership-v1",
  "educational-workspace-invitations-v1",
  "workspace-capability-enforcement-v1",
  "workspace-member-course-access-v1",
  "workspace-contextual-current-state-v1",
  "workspace-pedagogical-comments-v1",
  "workspace-course-state-projection-v1"
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
      if (String(url).includes("/functions/v1/aralearn-course-revisions/")) {
        return response(204, null, {
          "Access-Control-Allow-Origin": "https://fabio-ara.github.io",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "apikey, Authorization"
        });
      }
      return response(200, {
        schemaRevision: EXPECTED_REVISION,
        contractVersion: EXPECTED_CONTRACT_VERSION,
        features: FEATURES
      });
    }
  });
  assert.equal(result.schemaRevision, EXPECTED_REVISION);
  assert.equal(result.courseRevisionCors, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/get_aralearn_runtime_manifest");
  assert.equal(calls[0].options.headers.apikey, PUBLIC_KEY);
  assert.equal("Authorization" in calls[0].options.headers, false);
  assert.match(calls[1].url, /functions\/v1\/aralearn-course-revisions/u);
  assert.equal(calls[1].options.method, "OPTIONS");
  assert.equal(calls[1].options.headers.Origin, "https://fabio-ara.github.io");
});

test("CORS ausente na entrega de revisões interrompe a publicação", async () => {
  await assert.rejects(
    () => verifyCourseRevisionCors({
      projectUrl: "https://example.supabase.co",
      publishableKey: PUBLIC_KEY,
      fetchImpl: async () => response(204, null)
    }),
    /não permite que o site público baixe cursos/
  );
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
