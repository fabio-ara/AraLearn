import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAuthoringApiKey,
  readAdministrationConfiguration,
  runAuthoringAccessCommand
} from "../../scripts/manageAuthoringAccess.mjs";

const environment = {
  ARALEARN_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-secret"
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("a configuração administrativa exige segredo apenas no ambiente do processo", () => {
  assert.throws(
    () => readAdministrationConfiguration({ ARALEARN_SUPABASE_URL: environment.ARALEARN_SUPABASE_URL }),
    /SUPABASE_SERVICE_ROLE_KEY/u
  );
  assert.deepEqual(readAdministrationConfiguration(environment), {
    projectUrl: environment.ARALEARN_SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY
  });
});
test("a chave do cliente tem prefixo identificável e hash não reversível", () => {
  const generated = generateAuthoringApiKey();
  assert.match(generated.secret, /^arl_[A-Za-z0-9_-]+$/u);
  assert.equal(generated.prefix, generated.secret.slice(0, 16));
  assert.match(generated.hash, /^[0-9a-f]{64}$/u);
  assert.notEqual(generated.hash, generated.secret);
});

test("bootstrap de proprietário resolve o UUID sem gravar e-mail na atribuição", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("/auth/v1/admin/users")) {
      return response({ users: [{ id: "11111111-1111-4111-8111-111111111111", email: "pessoa@example.com" }] });
    }
    return response({ role: "owner", active: true });
  };
  const messages = [];
  await runAuthoringAccessCommand("bootstrap-owner", { email: "pessoa@example.com" }, {
    environment,
    fetchImpl,
    write: (value) => messages.push(value)
  });
  const rpcBody = JSON.parse(requests[1].options.body);
  assert.equal(rpcBody.p_target_user_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(rpcBody.p_actor_user_id, null);
  assert.equal(rpcBody.p_role, "owner");
  assert.equal(JSON.stringify(rpcBody).includes("pessoa@example.com"), false);
  assert.equal(requests[0].options.headers.apikey, environment.SUPABASE_SERVICE_ROLE_KEY);
  assert.match(messages[0], /Proprietário inicial/u);
});

test("cliente de autoria recebe escopos mínimos e revela a chave somente uma vez", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("/auth/v1/admin/users")) {
      return response({ users: [{ id: "22222222-2222-4222-8222-222222222222", email: "owner@example.com" }] });
    }
    return response({ clientId: "33333333-3333-4333-8333-333333333333" });
  };
  const messages = [];
  const result = await runAuthoringAccessCommand("create-client", {
    "actor-email": "owner@example.com",
    name: "Autoria do catálogo"
  }, {
    environment,
    fetchImpl,
    write: (value) => messages.push(value)
  });
  const rpcRequest = requests.find((entry) => entry.url.includes("create_authoring_api_client"));
  const rpcBody = JSON.parse(rpcRequest.options.body);
  assert.deepEqual(rpcBody.p_scopes, [
    "authoring:read",
    "authoring:write",
    "authoring:audit",
    "catalog:publish"
  ]);
  assert.equal(rpcBody.p_api_key_hash.length, 64);
  assert.equal(JSON.stringify(rpcBody).includes(result.apiKey), false);
  assert.equal(messages.filter((value) => value === result.apiKey).length, 1);
});
