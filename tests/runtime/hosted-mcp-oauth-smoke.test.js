import assert from "node:assert/strict";
import test from "node:test";

import {
  runHostedMcpOAuthSmoke
} from "../../scripts/runHostedMcpOAuthSmoke.mjs";
import {
  verifyLocalMcpOAuthIsolation
} from "../../scripts/runLocalMcpOAuthSmoke.mjs";

const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";

test("fronteira OAuth preserva guarda local e exige opt-in para hospedado", async () => {
  const provision = {
    projectUrl: PROJECT_URL,
    accessToken: "oauth-token",
    publishableKey: "publishable-key",
    serverApiKey: "server-key",
    userAccessToken: "application-token",
    userId: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222"
  };
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    throw new Error("fronteira hospedada alcançada");
  };

  await assert.rejects(
    verifyLocalMcpOAuthIsolation({ provision, fetchImpl }),
    /só pode usar a stack Supabase local/iu
  );
  assert.equal(requests, 0);

  await assert.rejects(
    verifyLocalMcpOAuthIsolation({
      provision,
      fetchImpl,
      allowHosted: true
    }),
    /fronteira hospedada alcançada/iu
  );
  assert.equal(requests, 1);
});

test("runner hospedado valida fronteiras e MCP antes e depois do refresh", async () => {
  const events = [];
  const fetchImpl = async () => {
    assert.fail("O teste de orquestração não deve acessar a rede.");
  };
  const environment = { marker: "hosted-environment" };
  const provision = {
    projectUrl: PROJECT_URL,
    resourceUrl: `${PROJECT_URL}/functions/v1/aralearn-authoring-mcp`,
    accessToken: "initial-access-token",
    refreshToken: "initial-refresh-token",
    publishableKey: "publishable-key",
    serverApiKey: "server-key",
    userAccessToken: "application-token",
    userId: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222"
  };
  const refreshed = {
    accessToken: "refreshed-access-token",
    refreshToken: "rotated-refresh-token"
  };

  await runHostedMcpOAuthSmoke({
    environment,
    fetchImpl,
    createId: () => "33333333-3333-4333-8333-333333333333",
    createBytes: (size) => Buffer.alloc(size, 7),
    nowSeconds: () => 1_000,
    provisionToken: async (options) => {
      assert.equal(options.environment, environment);
      assert.equal(options.fetchImpl, fetchImpl);
      assert.equal(options.nowSeconds(), 1_000);
      Object.assign(options.lifecycle, {
        projectUrl: provision.projectUrl,
        serverApiKey: provision.serverApiKey,
        userId: provision.userId,
        clientId: provision.clientId
      });
      events.push(["provision"]);
      return provision;
    },
    verifyIsolation: async (options) => {
      assert.equal(options.fetchImpl, fetchImpl);
      assert.equal(options.allowHosted, true);
      events.push(["isolation", options.provision.accessToken]);
    },
    executeSmoke: async (accessToken, projectUrl) => {
      assert.equal(projectUrl, PROJECT_URL);
      events.push(["mcp", accessToken]);
    },
    refreshToken: async (options) => {
      assert.equal(options.provision, provision);
      assert.equal(options.fetchImpl, fetchImpl);
      assert.equal(options.nowSeconds(), 1_000);
      events.push(["refresh", options.provision.refreshToken]);
      return refreshed;
    },
    executeRefreshSmoke: async (accessToken, options) => {
      assert.equal(options.projectUrl, PROJECT_URL);
      assert.equal(options.origin, "https://fabio-ara.github.io");
      assert.equal(options.fetchImpl, fetchImpl);
      events.push(["mcp", accessToken]);
    },
    cleanupProvision: async (options) => {
      assert.equal(options.fetchImpl, fetchImpl);
      assert.equal(options.provision.projectUrl, PROJECT_URL);
      events.push(["cleanup"]);
    }
  });

  assert.deepEqual(events, [
    ["provision"],
    ["isolation", "initial-access-token"],
    ["mcp", "initial-access-token"],
    ["refresh", "initial-refresh-token"],
    ["isolation", "refreshed-access-token"],
    ["mcp", "refreshed-access-token"],
    ["cleanup"]
  ]);
});
