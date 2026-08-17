import test from "node:test";
import assert from "node:assert/strict";

import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";

const ORIGIN = "https://client.example";
const RESOURCE_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";
const COURSE_ID = "10000000-0000-4000-8000-000000000001";

function handler(overrides = {}) {
  return createAuthoringMcpHandler({
    adapter: {
      async resolvePrincipal() {
        return {
          actorId: COURSE_ID,
          oauthClientId: "client",
          authenticationKind: "oauth",
          scopes: ["authoring:read", "authoring:write"]
        };
      },
      ...overrides
    },
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });
}

function request(method, params = {}) {
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
}

test("MCP anuncia somente invariantes e ferramentas canônicas de Curso", async () => {
  const initialize = await handler()(request("initialize", {
    protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "teste", version: "1" }
  }));
  const initialized = await initialize.json();
  assert.match(initialized.result.instructions, /Curso vivo e mutável/iu);
  assert.match(initialized.result.instructions, /não os fixe no prompt/iu);

  const listed = await handler()(request("tools/list"));
  const names = (await listed.json()).result.tools.map(({ name }) => name);
  assert.deepEqual(names, [
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
    "gerirPessoas",
    "consultarComponentesDidaticos"
  ]);
  assert.equal(names.some((name) => /workspace|trilha|cole(?:ç|c)[aã]o/iu.test(name)), false);
});

test("MCP publica um único recurso estável e lê Curso pela rota compartilhada", async () => {
  const resourcesResponse = await handler()(request("resources/list"));
  const resources = (await resourcesResponse.json()).result.resources;
  assert.deepEqual(resources.map(({ uri }) => uri), ["aralearn://authoring/invariants"]);

  const toolResponse = await handler({
    async getCourse({ courseId }) {
      return { courseId, title: "Curso", revision: 2 };
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: { courseId: COURSE_ID }
  }));
  const payload = await toolResponse.json();
  assert.equal(payload.result.structuredContent.data.revision, 2);
});

test("MCP interrompe envelope acima de 1 MiB antes de despachar ferramenta", async () => {
  let authenticationCalls = 0;
  const response = await handler({
    async resolvePrincipal() {
      authenticationCalls += 1;
      return {
        actorId: COURSE_ID,
        oauthClientId: "client",
        authenticationKind: "oauth",
        scopes: ["authoring:read", "authoring:write"]
      };
    },
    async getCourse() {
      assert.fail("Envelope excedente não pode alcançar a ferramenta.");
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: {
      courseId: COURSE_ID,
      padding: "x".repeat(1024 * 1024)
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(authenticationCalls, 1);
  assert.equal(payload.error.data.code, "mcp_message_too_large");
});

test("MCP torna recuperável o conflito de versão do Curso sem instruções substituídas", async () => {
  const response = await handler({
    async commitCourseChanges() {
      throw new AuthoringApiError(
        409,
        "stale_course_state",
        "A versão de estado do Curso mudou."
      );
    }
  })(request("tools/call", {
    name: "alterarCurso",
    arguments: {
      requestId: "request-course-stale-0002",
      courseId: COURSE_ID,
      expectedRevision: 3,
      operation: "update_metadata",
      goal: "Objetivo atualizado"
    }
  }));
  const payload = await response.json();
  const result = payload.result;

  assert.equal(response.status, 200);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "stale_course_state");
  assert.equal(result.structuredContent.error.recovery.strategy, "reread_and_retry");
  assert.equal(result.structuredContent.error.recovery.requestIdMode, "new");
  assert.doesNotMatch(JSON.stringify(result), /workspace|trilha|salvarCards/iu);
});
