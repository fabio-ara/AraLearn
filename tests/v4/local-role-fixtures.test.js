import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverActiveLocalOwner,
  ensureLocalCatalogPublisher,
  ensureLocalTechnicalOwner,
  listAllLocalAuthUsers
} from "../../supabase/tests/local-role-fixtures.mjs";

const LEGACY_OWNER_ID = "11111111-1111-4111-8111-111111111111";
const TECHNICAL_OWNER_ID = "22222222-2222-4222-8222-222222222222";
const PUBLISHER_ID = "33333333-3333-4333-8333-333333333333";

function denial() {
  return Object.assign(new Error("negado"), {
    status: 403,
    code: "not_authorized"
  });
}

function assignment(userId, role, active = true) {
  return { userId, role, active };
}

test("listagem administrativa pagina usuários sem duplicá-los", async () => {
  const requests = [];
  const users = await listAllLocalAuthUsers(async (path, options) => {
    requests.push({ path, options });
    if (path.includes("page=1")) {
      return {
        users: [
          { id: LEGACY_OWNER_ID, email: "legado@example.com" },
          { id: TECHNICAL_OWNER_ID, email: "tecnico@example.com" }
        ]
      };
    }
    return {
      users: [
        { id: TECHNICAL_OWNER_ID, email: "tecnico@example.com" }
      ]
    };
  }, { pageSize: 2 });

  assert.deepEqual(users.map((user) => user.id), [
    LEGACY_OWNER_ID,
    TECHNICAL_OWNER_ID
  ]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].options, { method: "GET" });
});

test("descoberta de owner usa somente a consulta protegida de papéis", async () => {
  const calls = [];
  const result = await discoverActiveLocalOwner([
    { id: TECHNICAL_OWNER_ID },
    { id: LEGACY_OWNER_ID }
  ], async (name, payload) => {
    calls.push({ name, payload });
    if (payload.p_actor_user_id === TECHNICAL_OWNER_ID) throw denial();
    return [assignment(LEGACY_OWNER_ID, "owner")];
  });

  assert.equal(result.actorUserId, LEGACY_OWNER_ID);
  assert.deepEqual(result.activeOwnerIds, [LEGACY_OWNER_ID]);
  assert.deepEqual(calls, [
    {
      name: "list_app_role_assignments",
      payload: { p_actor_user_id: TECHNICAL_OWNER_ID }
    },
    {
      name: "list_app_role_assignments",
      payload: { p_actor_user_id: LEGACY_OWNER_ID }
    }
  ]);
});

test("descoberta de owner não confunde falha operacional com ausência", async () => {
  const outage = Object.assign(new Error("indisponível"), {
    status: 503,
    code: "service_unavailable"
  });
  await assert.rejects(
    discoverActiveLocalOwner(
      [{ id: LEGACY_OWNER_ID }],
      async () => {
        throw outage;
      }
    ),
    (error) => error === outage
  );
});

test("bootstrap fresco usa ator nulo apenas quando não há owner ativo", async () => {
  const rpcCalls = [];
  const created = [];
  const result = await ensureLocalTechnicalOwner({
    adminAuth: async (path, options) => {
      if (options?.method === "GET") return { users: [] };
      created.push({ path, options });
      return {
        id: TECHNICAL_OWNER_ID,
        email: "action-bootstrap-owner@aralearn.local"
      };
    },
    rpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      return assignment(TECHNICAL_OWNER_ID, "owner");
    },
    email: "action-bootstrap-owner@aralearn.local",
    password: "senha-local",
    metadata: { persistentFixture: true },
    reason: "Owner técnico local"
  });

  assert.equal(result.userId, TECHNICAL_OWNER_ID);
  assert.equal(created.length, 1);
  assert.deepEqual(rpcCalls, [
    {
      name: "set_app_role",
      payload: {
        p_actor_user_id: null,
        p_target_user_id: TECHNICAL_OWNER_ID,
        p_role: "owner",
        p_active: true,
        p_reason: "Owner técnico local"
      }
    }
  ]);
});

test("bootstrap reaproveitado usa o owner legado para criar o owner técnico", async () => {
  const users = [
    {
      id: TECHNICAL_OWNER_ID,
      email: "action-bootstrap-owner@aralearn.local"
    },
    { id: LEGACY_OWNER_ID, email: "legado@example.com" }
  ];
  const setCalls = [];
  const result = await ensureLocalTechnicalOwner({
    adminAuth: async () => ({ users }),
    rpc: async (name, payload) => {
      if (name === "list_app_role_assignments") {
        if (payload.p_actor_user_id === TECHNICAL_OWNER_ID) throw denial();
        return [assignment(LEGACY_OWNER_ID, "owner")];
      }
      setCalls.push(payload);
      return assignment(TECHNICAL_OWNER_ID, "owner");
    },
    email: "action-bootstrap-owner@aralearn.local",
    password: "senha-local",
    reason: "Owner técnico local"
  });

  assert.equal(result.userId, TECHNICAL_OWNER_ID);
  assert.deepEqual(result.previousActiveOwnerIds, [LEGACY_OWNER_ID]);
  assert.equal(setCalls[0].p_actor_user_id, LEGACY_OWNER_ID);
});

test("fixture editorial reaproveita o e-mail e remove o owner legado", async () => {
  const users = [
    {
      id: TECHNICAL_OWNER_ID,
      email: "action-bootstrap-owner@aralearn.local"
    },
    {
      id: PUBLISHER_ID,
      email: "catalog-publisher@aralearn.local"
    }
  ];
  const calls = [];
  const result = await ensureLocalCatalogPublisher({
    adminAuth: async () => ({ users }),
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "list_app_role_assignments") {
        return [
          assignment(TECHNICAL_OWNER_ID, "owner"),
          assignment(PUBLISHER_ID, "owner")
        ];
      }
      return assignment(
        PUBLISHER_ID,
        payload.p_role,
        payload.p_active
      );
    },
    technicalOwnerId: TECHNICAL_OWNER_ID,
    email: "catalog-publisher@aralearn.local",
    password: "senha-local",
    reason: "Publicador local"
  });

  assert.equal(result.userId, PUBLISHER_ID);
  assert.deepEqual(
    calls.filter(({ name }) => name === "set_app_role")
      .map(({ payload }) => ({
        actor: payload.p_actor_user_id,
        role: payload.p_role,
        active: payload.p_active
      })),
    [
      {
        actor: TECHNICAL_OWNER_ID,
        role: "catalog_publisher",
        active: true
      },
      {
        actor: TECHNICAL_OWNER_ID,
        role: "owner",
        active: false
      }
    ]
  );
});

test("fixture editorial já convergida não cria usuário nem grava papéis", async () => {
  let created = false;
  const writes = [];
  const result = await ensureLocalCatalogPublisher({
    adminAuth: async (path, options) => {
      if (options?.method !== "GET") created = true;
      return {
        users: [
          {
            id: TECHNICAL_OWNER_ID,
            email: "action-bootstrap-owner@aralearn.local"
          },
          {
            id: PUBLISHER_ID,
            email: "catalog-publisher@aralearn.local"
          }
        ]
      };
    },
    rpc: async (name, payload) => {
      if (name === "set_app_role") writes.push(payload);
      return [
        assignment(TECHNICAL_OWNER_ID, "owner"),
        assignment(PUBLISHER_ID, "catalog_publisher")
      ];
    },
    technicalOwnerId: TECHNICAL_OWNER_ID,
    email: "CATALOG-PUBLISHER@ARALEARN.LOCAL",
    password: "senha-local",
    reason: "Publicador local"
  });

  assert.equal(result.userId, PUBLISHER_ID);
  assert.equal(created, false);
  assert.deepEqual(writes, []);
});
