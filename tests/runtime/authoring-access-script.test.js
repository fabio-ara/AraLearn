import assert from "node:assert/strict";
import test from "node:test";

import {
  readAdministrationConfiguration,
  runAuthoringAccessCommand
} from "../../scripts/manageAuthoringAccess.mjs";

const environment = {
  ARALEARN_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: `sb_secret_${"a".repeat(40)}`
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
    /SUPABASE_SECRET_KEYS ou SUPABASE_SECRET_KEY/u
  );
  assert.deepEqual(readAdministrationConfiguration(environment), {
    projectUrl: environment.ARALEARN_SUPABASE_URL,
    serverApiKey: environment.SUPABASE_SECRET_KEY
  });
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
  assert.equal(requests[0].options.headers.apikey, environment.SUPABASE_SECRET_KEY);
  assert.equal("Authorization" in requests[0].options.headers, false);
  assert.match(messages[0], /Proprietário inicial/u);
});
