import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareRuntimeManifest,
  validateHostedOAuthBoundary,
  validatePublicProjectConfiguration,
  verifyHostedBackend
} from "../../scripts/verifyHostedBackend.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtimeManifest = JSON.parse(readFileSync(
  path.join(repositoryRoot, "supabase", "runtime-manifest.json"),
  "utf8"
));
const EXPECTED_REVISION = runtimeManifest.schemaRevision;
const EXPECTED_CONTRACT_VERSION = runtimeManifest.contractVersion;
const PUBLIC_KEY = "sb_publishable_test-public-value";
const FEATURES = runtimeManifest.requiredFeatures;

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
      features: FEATURES.filter((item) => item !== "course-personal-state-v2")
    }),
    /course-personal-state-v2/
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
      if (url.endsWith("/.well-known/jwks.json")) {
        return response(200, { keys: [{
          kty: "EC", alg: "ES256", crv: "P-256", kid: "key-a",
          use: "sig", key_ops: ["verify"]
        }] });
      }
      if (url.endsWith("/.well-known/oauth-protected-resource")) {
        return response(200, {
          resource: "https://example.supabase.co/functions/v1/aralearn-authoring-mcp",
          authorization_servers: ["https://example.supabase.co/auth/v1"],
          scopes_supported: ["offline_access"]
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
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/get_aralearn_runtime_manifest");
  assert.equal(calls[0].options.headers.apikey, PUBLIC_KEY);
  assert.equal("Authorization" in calls[0].options.headers, false);
  assert.deepEqual(result.oauth, {
    algorithms: ["ES256"],
    resource: "https://example.supabase.co/functions/v1/aralearn-authoring-mcp",
    scope: "offline_access"
  });
});

test("verificador recusa chave simétrica e escopo de identidade no MCP", () => {
  assert.throws(
    () => validateHostedOAuthBoundary({
      projectUrl: "https://example.supabase.co",
      jwks: { keys: [{ kty: "oct", alg: "HS256", kid: "shared" }] },
      metadata: {
        resource: "https://example.supabase.co/functions/v1/aralearn-authoring-mcp",
        authorization_servers: ["https://example.supabase.co/auth/v1"],
        scopes_supported: ["offline_access"]
      }
    }),
    /chave assimétrica/u
  );
  assert.throws(
    () => validateHostedOAuthBoundary({
      projectUrl: "https://example.supabase.co",
      jwks: { keys: [{
        kty: "EC", alg: "ES256", crv: "P-256", kid: "key-a", use: "sig"
      }] },
      metadata: {
        resource: "https://example.supabase.co/functions/v1/aralearn-authoring-mcp",
        authorization_servers: ["https://example.supabase.co/auth/v1"],
        scopes_supported: ["openid"]
      }
    }),
    /fronteira OAuth/u
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
