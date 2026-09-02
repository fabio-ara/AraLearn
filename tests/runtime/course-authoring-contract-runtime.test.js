import test from "node:test";
import assert from "node:assert/strict";

import {
  COURSE_HUMAN_TASK_CATALOG_HEADER
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  ARALEARN_ACTION_CONTRACT_HEADER,
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import {
  ARALEARN_AUTHORING_CONTRACT_HEADER,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

const ORIGIN = "https://client.example";
const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const MCP_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";
const EXPECTED_HEADER = COURSE_HUMAN_TASK_CATALOG_HEADER;

test("MCP identifica o contrato canônico em preflight e descoberta OAuth", async () => {
  const handle = createAuthoringMcpHandler({
    adapter: {},
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: MCP_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });

  const preflight = await handle(new Request(MCP_URL, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(preflight.status, 204);
  assert.equal(ARALEARN_AUTHORING_CONTRACT_HEADER, EXPECTED_HEADER);
  assert.equal(preflight.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);

  const metadata = await handle(new Request(
    `${MCP_URL}/.well-known/oauth-protected-resource`,
    { method: "GET" }
  ));
  assert.equal(metadata.status, 200);
  assert.equal(metadata.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);
});

test("Action identifica o contrato canônico em preflight, erro e rota OAuth", async () => {
  const handle = createAuthoringActionHandler({
    adapter: {},
    allowedOrigins: new Set([ORIGIN]),
    actionBaseUrl: ACTION_URL,
    publicAppUrl: "https://app.example/"
  });

  const preflight = await handle(new Request(`${ACTION_URL}/retomar_curso`, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(preflight.status, 204);
  assert.equal(ARALEARN_ACTION_CONTRACT_HEADER, EXPECTED_HEADER);
  assert.equal(preflight.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);

  const methodError = await handle(new Request(`${ACTION_URL}/retomar_curso`, {
    method: "GET",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(methodError.status, 405);
  assert.equal(methodError.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);

  const oauthError = await handle(new Request(`${ACTION_URL}/oauth/unknown`, {
    method: "GET",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(oauthError.status, 404);
  assert.equal(oauthError.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);
});
