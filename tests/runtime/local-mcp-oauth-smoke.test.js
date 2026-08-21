import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  runLocalMcpOAuthSmoke
} from "../../scripts/runLocalMcpOAuthSmoke.mjs";

const PROJECT_URL = "http://127.0.0.1:54321";
const RESOURCE_URL =
  `${PROJECT_URL}/functions/v1/aralearn-authoring-mcp`;
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const PAIRWISE_SUBJECT = "33333333-3333-5333-8333-333333333333";
const PAIRWISE_SESSION = "44444444-4444-5444-8444-444444444444";
const SOURCE_SESSION = "55555555-5555-4555-8555-555555555555";
const AUTHORIZATION_ID = "authorization-local-smoke";
const REFRESH_TOKEN = "refresh-token-local";
const NEXT_REFRESH_TOKEN = "refresh-token-local-rotated";
const USER_TOKEN = jwt({
  aud: "authenticated",
  exp: 2_000,
  iat: 900,
  iss: `${PROJECT_URL}/auth/v1`,
  role: "authenticated",
  sub: USER_ID
});
const MCP_TOKEN = jwt({
  aal: "aal1",
  aralearn_session_id: SOURCE_SESSION,
  aud: RESOURCE_URL,
  client_id: CLIENT_ID,
  email: "",
  exp: 2_000,
  iat: 900,
  is_anonymous: false,
  iss: `${PROJECT_URL}/auth/v1`,
  phone: "",
  role: "authenticated",
  scope: "offline_access",
  session_id: PAIRWISE_SESSION,
  sub: PAIRWISE_SUBJECT
});
const REFRESHED_MCP_TOKEN = jwt({
  aal: "aal1",
  aralearn_session_id: SOURCE_SESSION,
  aud: RESOURCE_URL,
  client_id: CLIENT_ID,
  email: "",
  exp: 2_100,
  iat: 950,
  is_anonymous: false,
  iss: `${PROJECT_URL}/auth/v1`,
  phone: "",
  role: "authenticated",
  scope: "offline_access",
  session_id: PAIRWISE_SESSION,
  sub: PAIRWISE_SUBJECT
});
const SERVICE_TOKEN = jwt({ role: "service_role" });

function jwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "assinatura-local"
  ].join(".");
}

function response(payload, {
  status = 200,
  headers = {}
} = {}) {
  return new Response(
    payload == null ? null : JSON.stringify(payload),
    {
      status,
      headers: {
        ...(payload == null ? {} : { "Content-Type": "application/json" }),
        ...headers
      }
    }
  );
}

function oauthFetch(requests, {
  grantRevocationStatus = 204,
  allowStorageList = false
} = {}) {
  let seededStorageObjectPath = "";
  return async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const request = {
      url,
      method: init.method || "GET",
      headers,
      body: init.body
    };
    requests.push(request);

    if (url.pathname === "/auth/v1/.well-known/oauth-authorization-server") {
      return response({
        issuer: `${PROJECT_URL}/auth/v1`,
        authorization_endpoint: `${PROJECT_URL}/auth/v1/oauth/authorize`,
        token_endpoint: `${PROJECT_URL}/auth/v1/oauth/token`,
        registration_endpoint: `${PROJECT_URL}/auth/v1/oauth/clients/register`,
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "offline_access", "email", "profile", "phone"]
      });
    }
    if (url.pathname === "/auth/v1/admin/users" && request.method === "POST") {
      return response({ id: USER_ID });
    }
    if (url.pathname === "/auth/v1/token"
        && url.searchParams.get("grant_type") === "password") {
      return response({
        access_token: USER_TOKEN,
        user: { id: USER_ID }
      });
    }
    if (url.pathname === "/auth/v1/oauth/clients/register") {
      const body = JSON.parse(String(request.body));
      assert.equal(body.client_type, "public");
      assert.equal(body.token_endpoint_auth_method, "none");
      assert.deepEqual(body.grant_types, [
        "authorization_code",
        "refresh_token"
      ]);
      return response({
        client_id: CLIENT_ID,
        token_endpoint_auth_method: "none"
      }, { status: 201 });
    }
    if (url.pathname === "/auth/v1/oauth/authorize") {
      assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
      assert.equal(url.searchParams.get("scope"), "offline_access");
      assert.equal(url.searchParams.get("resource"), RESOURCE_URL);
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.match(
        String(url.searchParams.get("code_challenge") || ""),
        /^[A-Za-z0-9_-]{43}$/u
      );
      return response(null, {
        status: 302,
        headers: {
          Location:
            `http://127.0.0.1:4182/?authorization_id=${AUTHORIZATION_ID}`
        }
      });
    }
    if (url.pathname
        === `/auth/v1/oauth/authorizations/${AUTHORIZATION_ID}`
        && request.method === "GET") {
      assert.equal(headers.get("authorization"), `Bearer ${USER_TOKEN}`);
      return response({
        authorization_id: AUTHORIZATION_ID,
        client: { id: CLIENT_ID },
        scope: "offline_access",
        user: { id: USER_ID }
      });
    }
    if (url.pathname
        === `/auth/v1/oauth/authorizations/${AUTHORIZATION_ID}/consent`) {
      assert.equal(headers.get("authorization"), `Bearer ${USER_TOKEN}`);
      assert.deepEqual(JSON.parse(String(request.body)), { action: "approve" });
      const authorizeRequest = requests.find(
        ({ url: candidate }) =>
          candidate.pathname === "/auth/v1/oauth/authorize"
      );
      return response({
        redirect_url:
          `https://mcp-smoke.aralearn.invalid/callback?code=code-local&state=${
            authorizeRequest.url.searchParams.get("state")
          }`
      });
    }
    if (url.pathname === "/auth/v1/oauth/token") {
      const body = new URLSearchParams(String(request.body));
      assert.equal(body.get("client_id"), CLIENT_ID);
      assert.equal(body.get("resource"), RESOURCE_URL);
      assert.equal(headers.get("authorization"), null);
      if (body.get("grant_type") === "authorization_code") {
        assert.match(String(body.get("code_verifier") || ""), /^[A-Za-z0-9_-]{64}$/u);
        return response({
          access_token: MCP_TOKEN,
          refresh_token: REFRESH_TOKEN
        });
      }
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), REFRESH_TOKEN);
      return response({
        access_token: REFRESHED_MCP_TOKEN,
        refresh_token: NEXT_REFRESH_TOKEN
      });
    }
    const oauthBearer = new Set([
      `Bearer ${MCP_TOKEN}`,
      `Bearer ${REFRESHED_MCP_TOKEN}`
    ]).has(headers.get("authorization"));
    if (url.pathname === "/auth/v1/user"
        && request.method === "GET"
        && headers.get("authorization") === `Bearer ${USER_TOKEN}`) {
      assert.equal(headers.get("apikey"), "anon-local");
      return response({
        id: USER_ID,
        user_metadata: { test: "authoring-mcp-local-oauth-smoke" }
      });
    }
    if (url.pathname === "/auth/v1/user" && oauthBearer) {
      assert.equal(headers.get("apikey"), "anon-local");
      return response({
        code: 403,
        error_code: "user_not_found",
        msg: "User from sub claim in JWT does not exist."
      }, { status: 403 });
    }
    if (url.pathname === "/auth/v1/oauth/userinfo" && oauthBearer) {
      assert.equal(headers.get("apikey"), "anon-local");
      return response({
        code: 403,
        error_code: "user_not_found",
        msg: "User from sub claim in JWT does not exist."
      }, { status: 403 });
    }
    if (url.pathname === "/auth/v1/user/oauth/grants"
        && request.method === "GET" && oauthBearer) {
      return response({ code: 403, error_code: "user_not_found" }, { status: 403 });
    }
    if ((url.pathname === "/auth/v1/factors"
          || url.pathname === "/auth/v1/reauthenticate"
          || url.pathname === "/auth/v1/logout")
        && oauthBearer) {
      return response({ code: 403, error_code: "user_not_found" }, { status: 403 });
    }
    if (url.pathname === "/rest/v1/rpc/delete_my_account_v1"
        || url.pathname === "/rest/v1/person_profiles") {
      assert.equal(headers.get("apikey"), "anon-local");
      assert.equal(oauthBearer, true);
      return response({ code: "42501", message: "Token OAuth restrito ao MCP." }, {
        status: 403
      });
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      const serviceRequest =
        headers.get("authorization") === `Bearer ${SERVICE_TOKEN}`;
      if (serviceRequest) {
        if (url.pathname === "/storage/v1/object/list/person-avatars") {
          return response([{ name: seededStorageObjectPath.split("/").at(-1) }]);
        }
        return response({});
      }
      const applicationRequest =
        headers.get("authorization") === `Bearer ${USER_TOKEN}`;
      if (applicationRequest) {
        seededStorageObjectPath = decodeURIComponent(
          url.pathname.replace("/storage/v1/object/person-avatars/", "")
        );
        return response({});
      }
      assert.equal(headers.get("apikey"), "anon-local");
      assert.equal(oauthBearer, true);
      if (request.method === "DELETE") return response([]);
      if (allowStorageList
          && url.pathname === "/storage/v1/object/list/person-avatars") {
        return response([]);
      }
      return response({
        statusCode: "403",
        error: "Unauthorized",
        code: "AccessDenied",
        message: "Token OAuth restrito ao MCP."
      }, {
        status: 400
      });
    }
    if (url.pathname === "/auth/v1/user/oauth/grants"
        && request.method === "DELETE") {
      assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
      assert.equal(headers.get("authorization"), `Bearer ${USER_TOKEN}`);
      return response(null, { status: grantRevocationStatus });
    }
    if (url.pathname === `/auth/v1/admin/oauth/clients/${CLIENT_ID}`
        && request.method === "DELETE") {
      return response(null, { status: 204 });
    }
    if (url.pathname === `/auth/v1/admin/users/${USER_ID}`
        && request.method === "DELETE") {
      return response(null, { status: 204 });
    }
    assert.fail(`Requisição inesperada: ${request.method} ${url}`);
  };
}

function environment() {
  return {
    API_URL: PROJECT_URL,
    ANON_KEY: "anon-local",
    SERVICE_ROLE_KEY: SERVICE_TOKEN
  };
}

test("runner provisiona OAuth Supabase realista, roda o smoke e limpa identidades", async () => {
  const requests = [];
  let receivedToken = null;
  let receivedRefreshToken = null;
  let receivedOptions = null;
  const ids = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "abababab-abab-4bab-8bab-abababababab",
    "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc"
  ];
  await runLocalMcpOAuthSmoke({
    environment: environment(),
    fetchImpl: oauthFetch(requests),
    createId: () => ids.shift(),
    createBytes: (size) => Buffer.alloc(size, size),
    nowSeconds: () => 1_000,
    executeSmoke: async (token, options) => {
      receivedToken = token;
      receivedOptions = options;
    },
    executeRefreshSmoke: async (token) => {
      receivedRefreshToken = token;
    }
  });

  assert.equal(receivedToken, MCP_TOKEN);
  assert.equal(receivedRefreshToken, REFRESHED_MCP_TOKEN);
  assert.equal(receivedOptions.applicationAccessToken, USER_TOKEN);
  assert.equal(receivedOptions.publishableKey, "anon-local");
  assert.deepEqual(
    requests.slice(-3).map(({ method, url }) => [method, url.pathname]),
    [
      ["DELETE", "/auth/v1/user/oauth/grants"],
      ["DELETE", `/auth/v1/admin/oauth/clients/${CLIENT_ID}`],
      ["DELETE", `/auth/v1/admin/users/${USER_ID}`]
    ]
  );
  for (const request of requests) {
    const administrative =
      request.url.pathname.startsWith("/auth/v1/admin/");
    const privilegedStorage =
      request.url.pathname.startsWith("/storage/v1/object/")
      && request.headers.get("authorization") === `Bearer ${SERVICE_TOKEN}`;
    assert.equal(
      request.headers.get("authorization") === `Bearer ${SERVICE_TOKEN}`,
      administrative || privilegedStorage,
      `Uso incorreto da service role em ${request.method} ${request.url.pathname}`
    );
  }
  const deniedBoundaries = requests.filter(({ url, headers }) => (
    new Set([
      `Bearer ${MCP_TOKEN}`,
      `Bearer ${REFRESHED_MCP_TOKEN}`
    ]).has(headers.get("authorization"))
    && (
      url.pathname.startsWith("/rest/v1/")
      || url.pathname.startsWith("/storage/v1/")
    )
  ));
  assert.deepEqual(
    deniedBoundaries.map(({ method, url }) => [method, url.pathname]),
    [
      ["POST", "/rest/v1/rpc/delete_my_account_v1"],
      ["GET", "/rest/v1/person_profiles"],
      ["POST", "/storage/v1/object/list/person-avatars"],
      ["GET", `/storage/v1/object/authenticated/person-avatars/${USER_ID}/abababab-abab-4bab-8bab-abababababab.webp`],
      ["POST", `/storage/v1/object/person-avatars/${USER_ID}/bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc.webp`],
      ["DELETE", "/storage/v1/object/person-avatars"]
    ]
  );
  const deniedGoTrue = requests.filter(({ url, headers }) => (
    new Set([
      `Bearer ${MCP_TOKEN}`,
      `Bearer ${REFRESHED_MCP_TOKEN}`
    ]).has(headers.get("authorization"))
    && url.pathname.startsWith("/auth/v1/")
  ));
  assert.deepEqual(
    deniedGoTrue.map(({ method, url }) => [method, url.pathname]),
    [
      ["GET", "/auth/v1/user"],
      ["GET", "/auth/v1/oauth/userinfo"],
      ["PUT", "/auth/v1/user"],
      ["GET", "/auth/v1/user/oauth/grants"],
      ["POST", "/auth/v1/factors"],
      ["GET", "/auth/v1/reauthenticate"],
      ["POST", "/auth/v1/logout"],
      ["GET", "/auth/v1/user"],
      ["GET", "/auth/v1/oauth/userinfo"],
      ["PUT", "/auth/v1/user"],
      ["GET", "/auth/v1/user/oauth/grants"],
      ["POST", "/auth/v1/factors"],
      ["GET", "/auth/v1/reauthenticate"],
      ["POST", "/auth/v1/logout"]
    ]
  );
});

test("runner limpa cliente e usuário mesmo quando a jornada MCP falha", async () => {
  const requests = [];
  const ids = [
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    "dededede-dede-4ede-8ede-dededededede"
  ];
  await assert.rejects(
    runLocalMcpOAuthSmoke({
      environment: environment(),
      fetchImpl: oauthFetch(requests),
      createId: () => ids.shift(),
      createBytes: (size) => Buffer.alloc(size, size + 1),
      nowSeconds: () => 1_000,
      executeSmoke: async () => {
        throw new Error("falha simulada da jornada MCP");
      }
    }),
    /falha simulada da jornada MCP/u
  );
  assert.equal(
    requests.some(
      ({ method, url }) =>
        method === "DELETE"
        && url.pathname === `/auth/v1/admin/oauth/clients/${CLIENT_ID}`
    ),
    true
  );
  assert.equal(
    requests.some(
      ({ method, url }) =>
        method === "DELETE"
        && url.pathname === `/auth/v1/admin/users/${USER_ID}`
    ),
    true
  );
});

test("runner reprova Storage que oculta linhas mas ainda responde 200 ao OAuth", async () => {
  const requests = [];
  const ids = [
    "12121212-1212-4212-8212-121212121212",
    "23232323-2323-4232-8232-232323232323",
    "34343434-3434-4434-8434-343434343434",
    "45454545-4545-4454-8454-454545454545"
  ];
  let smokeExecuted = false;
  await assert.rejects(
    runLocalMcpOAuthSmoke({
      environment: environment(),
      fetchImpl: oauthFetch(requests, { allowStorageList: true }),
      createId: () => ids.shift(),
      createBytes: (size) => Buffer.alloc(size, size + 3),
      nowSeconds: () => 1_000,
      executeSmoke: async () => {
        smokeExecuted = true;
      }
    }),
    /Storage list.+recebido HTTP 200/iu
  );
  assert.equal(smokeExecuted, false);
  assert.deepEqual(
    requests.slice(-3).map(({ method, url }) => [method, url.pathname]),
    [
      ["DELETE", "/auth/v1/user/oauth/grants"],
      ["DELETE", `/auth/v1/admin/oauth/clients/${CLIENT_ID}`],
      ["DELETE", `/auth/v1/admin/users/${USER_ID}`]
    ]
  );
});

test("runner não mascara concessão OAuth que permaneceu após o cleanup", async () => {
  const requests = [];
  const ids = [
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "ffffffff-ffff-4fff-8fff-ffffffffffff",
    "efefefef-efef-4fef-8fef-efefefefefef",
    "fafafafa-fafa-4afa-8afa-fafafafafafa"
  ];
  await assert.rejects(
    runLocalMcpOAuthSmoke({
      environment: environment(),
      fetchImpl: oauthFetch(requests, { grantRevocationStatus: 404 }),
      createId: () => ids.shift(),
      createBytes: (size) => Buffer.alloc(size, size + 2),
      nowSeconds: () => 1_000,
      executeSmoke: async () => {},
      executeRefreshSmoke: async () => {}
    }),
    (error) => (
      error instanceof AggregateError
      && error.errors.some((failure) => (
        /Revogação da concessão OAuth local: HTTP 404/u.test(failure.message)
      ))
    )
  );
  assert.deepEqual(
    requests.slice(-3).map(({ method, url }) => [method, url.pathname]),
    [
      ["DELETE", "/auth/v1/user/oauth/grants"],
      ["DELETE", `/auth/v1/admin/oauth/clients/${CLIENT_ID}`],
      ["DELETE", `/auth/v1/admin/users/${USER_ID}`]
    ]
  );
});

test("CI exige metadata 2xx e executa a jornada OAuth completa", () => {
  const workflow = fs.readFileSync(
    new URL("../../.github/workflows/validacao.yml", import.meta.url),
    "utf8"
  );
  const smoke = fs.readFileSync(
    new URL(
      "../../supabase/tests/authoring-mcp-local-smoke.mjs",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(
    workflow,
    /oauth-protected-resource[\s\S]+curl --fail --silent --show-error/u
  );
  assert.match(
    workflow,
    /FUNCTIONS_RUNTIME_READY=false[\s\S]+Serving functions on http:\/\/127\.0\.0\.1:54321\/functions\/v1\/<function-name>[\s\S]+FUNCTIONS_RUNTIME_READY=true/u
  );
  assert.match(
    workflow,
    /if \[ "\$FUNCTIONS_RUNTIME_READY" = true \]; then[\s\S]+"\$MCP_METADATA_URL"[\s\S]+"\$COURSE_API_URL"/u
  );
  assert.match(
    workflow,
    /if \[ "\$FUNCTIONS_RUNTIME_READY" != true \]; then[\s\S]+exit 1/u
  );
  assert.match(workflow, /MCP_READY=false[\s\S]+MCP_READY=true/u);
  assert.match(
    workflow,
    /if \[ "\$MCP_READY" != true \][\s\S]+exit 1/u
  );
  assert.match(workflow, /npm run test:authoring:mcp:local:oauth/u);
  assert.match(smoke, /ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH/u);
  assert.match(smoke, /service role não pode ser usada como bearer do MCP/iu);
});
