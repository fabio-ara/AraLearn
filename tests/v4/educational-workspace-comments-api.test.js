import assert from "node:assert/strict";
import test from "node:test";

import { executeAuthoringRoute } from "../../supabase/functions/_shared/aralearn-authoring/routerV4.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";
import { workspaceRoute } from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const ACTOR = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000002";
const COMMENT = "30000000-0000-4000-8000-000000000003";

function principal(scopes) {
  return { actorId: ACTOR, authenticationKind: "oauth", scopes };
}

test("rota de observações valida filtros e cursor antes do adapter", async () => {
  const path = `/v1/educational-workspaces/${WORKSPACE}/comments`;
  const route = workspaceRoute("GET", path);
  assert.deepEqual(route, {
    name: "listEducationalWorkspaceComments",
    workspaceId: WORKSPACE
  });
  let received = null;
  const query = new URLSearchParams({
    limit: "15",
    beforeUpdatedAt: "2026-08-01T14:30:00Z",
    beforeId: COMMENT,
    categories: JSON.stringify(["question", "possible_error"]),
    statuses: JSON.stringify(["open"])
  });
  const result = await executeAuthoringRoute({
    request: new Request(`https://edge.example${path}?${query}`),
    route,
    principal: principal(["authoring:private:read"]),
    adapter: {
      async listEducationalWorkspaceComments(options) {
        received = options;
        return { workspaceId: WORKSPACE, items: [], hasMore: false, nextCursor: null };
      }
    }
  });
  assert.deepEqual(received, {
    principal: principal(["authoring:private:read"]),
    workspaceId: WORKSPACE,
    limit: 15,
    beforeUpdatedAt: "2026-08-01T14:30:00Z",
    beforeId: COMMENT,
    categories: ["question", "possible_error"],
    statuses: ["open"]
  });
  assert.equal(result.data.workspaceId, WORKSPACE);

  for (const suffix of [
    `?beforeUpdatedAt=${encodeURIComponent("2026-08-01T14:30:00Z")}`,
    `?beforeUpdatedAt=${encodeURIComponent("2026-02-30T14:30:00Z")}&beforeId=${COMMENT}`,
    `?categories=${encodeURIComponent(JSON.stringify(["unknown"]))}`,
    `?statuses=${encodeURIComponent("not-json")}`
  ]) {
    await assert.rejects(
      () => executeAuthoringRoute({
        request: new Request(`https://edge.example${path}${suffix}`),
        route,
        principal: principal(["authoring:private:read"]),
        adapter: {}
      }),
      (error) => error?.status === 422 && error?.code === "invalid_pagination"
    );
  }
});

test("rota de resposta aceita apenas o envelope discriminado", async () => {
  const path = `/v1/educational-workspaces/${WORKSPACE}/comments/${COMMENT}/actions`;
  const route = workspaceRoute("POST", path);
  assert.deepEqual(route, {
    name: "manageEducationalWorkspaceComment",
    workspaceId: WORKSPACE,
    commentId: COMMENT
  });
  let received = null;
  const requestId = "comment:response:0001";
  const result = await executeAuthoringRoute({
    request: new Request(`https://edge.example${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestId
      },
      body: JSON.stringify({
        requestId,
        operation: "respond_comment",
        payload: { response: "A equipe incorporará a sugestão." }
      })
    }),
    route,
    principal: principal(["authoring:private:write"]),
    adapter: {
      async manageEducationalWorkspaceComment(options) {
        received = options;
        return { workspaceId: WORKSPACE, status: "considered" };
      }
    }
  });
  assert.deepEqual(received, {
    principal: principal(["authoring:private:write"]),
    workspaceId: WORKSPACE,
    commentId: COMMENT,
    requestId,
    operation: "respond_comment",
    payload: { response: "A equipe incorporará a sugestão." }
  });
  assert.equal(result.requestId, requestId);

  await assert.rejects(
    () => executeAuthoringRoute({
      request: new Request(`https://edge.example${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "comment:response:0002",
          operation: "respond_comment",
          payload: { response: "Texto", hidden: true }
        })
      }),
      route,
      principal: principal(["authoring:private:write"]),
      adapter: {}
    }),
    (error) => error?.status === 422 && error?.code === "unknown_workspace_field"
  );
});

test("adapter encaminha observações somente pelas RPCs contextuais", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    fetchImpl: async () => { throw new Error("não deve abrir artefatos"); }
  });
  adapter.rpc = async (name, payload, options) => {
    calls.push({ name, payload, options });
    return [{ workspaceId: WORKSPACE, status: "resolved" }];
  };
  await adapter.listEducationalWorkspaceComments({
    principal: principal(["authoring:private:read"]),
    workspaceId: WORKSPACE,
    limit: 7,
    beforeUpdatedAt: "2026-08-01T15:00:00Z",
    beforeId: COMMENT,
    categories: ["confusing"],
    statuses: ["open"],
    deadlineAt: 1000
  });
  await adapter.manageEducationalWorkspaceComment({
    principal: principal(["authoring:private:write"]),
    requestId: "comment:status:0001",
    workspaceId: WORKSPACE,
    commentId: COMMENT,
    operation: "set_comment_status",
    payload: { status: "resolved", note: "Esclarecido." },
    deadlineAt: 2000
  });
  assert.deepEqual(calls, [{
    name: "list_educational_workspace_comments_for_actor_v1",
    payload: {
      p_actor_id: ACTOR,
      p_workspace_id: WORKSPACE,
      p_limit: 7,
      p_before_updated_at: "2026-08-01T15:00:00Z",
      p_before_id: COMMENT,
      p_categories: ["confusing"],
      p_statuses: ["open"]
    },
    options: { deadlineAt: 1000 }
  }, {
    name: "manage_educational_workspace_comment_for_actor_v1",
    payload: {
      p_actor_id: ACTOR,
      p_request_id: "comment:status:0001",
      p_workspace_id: WORKSPACE,
      p_comment_id: COMMENT,
      p_operation: "set_comment_status",
      p_payload: { status: "resolved", note: "Esclarecido." }
    },
    options: { deadlineAt: 2000 }
  }]);
});
