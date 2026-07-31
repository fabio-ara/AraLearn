const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validUserId(value) {
  const id = String(value || "");
  if (!UUID_PATTERN.test(id)) {
    throw new Error("A fixture local recebeu um UUID de usuário inválido.");
  }
  return id;
}

function roleRows(value) {
  if (!Array.isArray(value)) {
    throw new Error("A consulta de papéis locais devolveu um formato inválido.");
  }
  return value;
}

function isExpectedOwnerProbeDenial(error) {
  return Number(error?.status) === 403
    && String(error?.code || "") === "not_authorized";
}

export async function listAllLocalAuthUsers(adminAuth, {
  pageSize = 100
} = {}) {
  if (typeof adminAuth !== "function") {
    throw new TypeError("adminAuth precisa ser uma função.");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError("pageSize precisa estar entre 1 e 1000.");
  }

  const users = [];
  const seenIds = new Set();
  for (let page = 1; page <= 10_000; page += 1) {
    const payload = await adminAuth(
      `users?page=${page}&per_page=${pageSize}`,
      { method: "GET" }
    );
    const current = Array.isArray(payload?.users) ? payload.users : [];
    for (const user of current) {
      const id = validUserId(user?.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      users.push(user);
    }
    if (current.length < pageSize) return users;
  }
  throw new Error("A listagem de usuários locais excedeu o limite de segurança.");
}

export async function discoverActiveLocalOwner(users, rpc) {
  if (!Array.isArray(users) || typeof rpc !== "function") {
    throw new TypeError("Usuários e cliente RPC são obrigatórios.");
  }

  for (const user of users) {
    const candidateId = validUserId(user?.id);
    let assignments;
    try {
      assignments = roleRows(await rpc("list_app_role_assignments", {
        p_actor_user_id: candidateId
      }));
    } catch (error) {
      if (isExpectedOwnerProbeDenial(error)) continue;
      throw error;
    }

    const activeOwnerIds = assignments
      .filter((assignment) => (
        assignment?.role === "owner"
        && assignment?.active === true
      ))
      .map((assignment) => validUserId(
        assignment.userId || assignment.user_id
      ));
    if (!activeOwnerIds.includes(candidateId)) {
      throw new Error(
        "A consulta administrativa aceitou um ator que não é owner ativo."
      );
    }
    return {
      actorUserId: candidateId,
      activeOwnerIds: [...new Set(activeOwnerIds)],
      assignments
    };
  }

  return {
    actorUserId: null,
    activeOwnerIds: [],
    assignments: []
  };
}

export async function ensureLocalTechnicalOwner({
  adminAuth,
  rpc,
  email,
  password,
  metadata = {},
  reason
}) {
  const fixtureEmail = normalizedEmail(email);
  if (!fixtureEmail || !password || !reason) {
    throw new Error("E-mail, senha e justificativa do owner são obrigatórios.");
  }

  const users = await listAllLocalAuthUsers(adminAuth);
  const ownerState = await discoverActiveLocalOwner(users, rpc);
  let owner = users.find(
    (user) => normalizedEmail(user?.email) === fixtureEmail
  );
  if (!owner) {
    owner = await adminAuth("users", {
      body: {
        email: fixtureEmail,
        password,
        email_confirm: true,
        user_metadata: metadata
      }
    });
  }
  const ownerId = validUserId(owner?.id);
  if (!ownerState.activeOwnerIds.includes(ownerId)) {
    const assignment = await rpc("set_app_role", {
      p_actor_user_id: ownerState.activeOwnerIds.length === 0
        ? null
        : ownerState.actorUserId,
      p_target_user_id: ownerId,
      p_role: "owner",
      p_active: true,
      p_reason: reason
    });
    if (assignment?.role !== "owner" || assignment?.active !== true) {
      throw new Error("Não foi possível convergir o owner técnico local.");
    }
  }

  return {
    userId: ownerId,
    previousActiveOwnerIds: ownerState.activeOwnerIds
  };
}

export async function ensureLocalCatalogPublisher({
  adminAuth,
  rpc,
  technicalOwnerId,
  email,
  password,
  metadata = {},
  reason
}) {
  const ownerId = validUserId(technicalOwnerId);
  const fixtureEmail = normalizedEmail(email);
  if (!fixtureEmail || !password || !reason) {
    throw new Error(
      "E-mail, senha e justificativa do publicador são obrigatórios."
    );
  }

  const users = await listAllLocalAuthUsers(adminAuth);
  let publisher = users.find(
    (user) => normalizedEmail(user?.email) === fixtureEmail
  );
  if (!publisher) {
    publisher = await adminAuth("users", {
      body: {
        email: fixtureEmail,
        password,
        email_confirm: true,
        user_metadata: metadata
      }
    });
  }
  const publisherId = validUserId(publisher?.id);
  if (publisherId === ownerId) {
    throw new Error("Owner técnico e publicador local precisam ser distintos.");
  }

  let assignments = roleRows(await rpc("list_app_role_assignments", {
    p_actor_user_id: ownerId
  }));
  const technicalOwnerIsActive = assignments.some((assignment) => (
    (assignment?.userId || assignment?.user_id) === ownerId
    && assignment?.role === "owner"
    && assignment?.active === true
  ));
  if (!technicalOwnerIsActive) {
    throw new Error("O owner técnico precisa estar ativo antes da convergência.");
  }

  const activeRole = (role) => assignments.some((assignment) => (
    (assignment?.userId || assignment?.user_id) === publisherId
    && assignment?.role === role
    && assignment?.active === true
  ));
  if (!activeRole("catalog_publisher")) {
    const assigned = await rpc("set_app_role", {
      p_actor_user_id: ownerId,
      p_target_user_id: publisherId,
      p_role: "catalog_publisher",
      p_active: true,
      p_reason: reason
    });
    if (
      assigned?.role !== "catalog_publisher"
      || assigned?.active !== true
    ) {
      throw new Error("Não foi possível convergir o publicador local.");
    }
  }

  if (activeRole("owner")) {
    const revoked = await rpc("set_app_role", {
      p_actor_user_id: ownerId,
      p_target_user_id: publisherId,
      p_role: "owner",
      p_active: false,
      p_reason: "Remoção do owner legado da fixture de catálogo"
    });
    if (revoked?.role !== "owner" || revoked?.active !== false) {
      throw new Error("Não foi possível remover o owner legado da fixture.");
    }
  }

  return { userId: publisherId };
}
