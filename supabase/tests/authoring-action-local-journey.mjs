import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  createAuthoringActionHandler
} from "../functions/_shared/aralearn-authoring/actionServer.js";
import {
  SupabaseAuthoringAdapter
} from "../functions/_shared/aralearn-authoring/supabaseAdapter.js";
import {
  ensureLocalTechnicalOwner
} from "./local-role-fixtures.mjs";

const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const serverApiKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SERVICE_ROLE_KEY
    || ""
).trim();
const publishableKey = String(
  process.env.SUPABASE_ANON_KEY
    || process.env.ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || ""
).trim();
const hostname = new URL(projectUrl).hostname;

assert(
  new Set(["127.0.0.1", "localhost"]).has(hostname),
  "A jornada Action destrutiva só pode usar a stack Supabase local."
);
assert(serverApiKey, "SERVICE_ROLE_KEY local ausente.");
assert(publishableKey, "ANON_KEY local ausente.");

const ACTION_ORIGIN = "https://chatgpt.com";
const ACTION_BASE_URL =
  `${projectUrl}/functions/v1/aralearn-authoring-action`;
const BOOTSTRAP_OWNER_EMAIL = "action-bootstrap-owner@aralearn.local";
const runKey = randomUUID().replaceAll("-", "").slice(0, 12);
const paths = Object.freeze({
  course: [`course-dataprev-action-${runKey}`],
  module: [
    `course-dataprev-action-${runKey}`,
    "module-computacao-nuvem-virtualizacao"
  ],
  lesson: [
    `course-dataprev-action-${runKey}`,
    "module-computacao-nuvem-virtualizacao",
    "lesson-modelos-servico"
  ],
  microsequence: [
    `course-dataprev-action-${runKey}`,
    "module-computacao-nuvem-virtualizacao",
    "lesson-modelos-servico",
    "micro-iaas-paas-saas"
  ]
});

const adapter = new SupabaseAuthoringAdapter({
  supabaseUrl: projectUrl,
  serverApiKey,
  publishableKey,
  attempts: 2,
  requestTimeoutMs: 15_000
});
const handler = createAuthoringActionHandler({
  adapter,
  allowedOrigins: new Set([ACTION_ORIGIN]),
  actionBaseUrl: ACTION_BASE_URL,
  publicAppUrl: "http://127.0.0.1:4182/"
});

const state = {
  users: [],
  bootstrapOwnerId: null,
  adminUserId: null,
  adminRoleActive: false,
  authorToken: null,
  adminToken: null,
  authorWorkspaceId: null,
  reviewWorkspaceIds: new Set(),
  privateCourse: null,
  submissions: new Map(),
  collection: null,
  officialCourse: null
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requestId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function rawCredential(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function structureParts() {
  return [
    {
      entityType: "course",
      parentPath: null,
      id: paths.course[0],
      title: "Dataprev: Teste",
      goal: "Preparar uma pessoa iniciante para questões FGV de computação em nuvem e virtualização."
    },
    {
      entityType: "module",
      parentPath: paths.course,
      id: paths.module[1],
      title: "Computação em Nuvem e Virtualização",
      goal: "Construir uma base autossuficiente sobre nuvem e virtualização para a prova da Dataprev.",
      include: [
        "IaaS, PaaS e SaaS",
        "nuvens pública, privada e híbrida",
        "alta disponibilidade, escalabilidade e elasticidade",
        "regiões, zonas, identidade, segurança, IaC e automação",
        "Docker, Harbor, Clair, Kubernetes e plataforma VMware"
      ],
      exclude: [],
      notation: ["Definir toda sigla antes do primeiro uso."],
      avoid: ["Não presumir experiência anterior com infraestrutura."]
    },
    {
      entityType: "lesson",
      parentPath: paths.module,
      id: paths.lesson[2],
      title: "Modelos de serviço em nuvem",
      goal: "Distinguir IaaS, PaaS e SaaS pela divisão de responsabilidades.",
      include: ["IaaS", "PaaS", "SaaS", "responsabilidade compartilhada"],
      exclude: [],
      notation: ["Relacionar cada modelo às camadas gerenciadas."],
      avoid: ["Não classificar o modelo somente pelo nome do fornecedor."]
    },
    {
      entityType: "microsequence",
      parentPath: paths.lesson,
      id: paths.microsequence[3],
      title: "IaaS, PaaS e SaaS",
      goal: "Classificar o modelo de serviço e justificar a responsabilidade do cliente.",
      role: "explain",
      covers: ["IaaS", "PaaS", "SaaS"],
      checks: ["classifica um cenário e justifica a camada administrada"],
      errors: ["confundir serviço gerenciado com modelo de implantação"]
    }
  ];
}

function cards({ revised = false } = {}) {
  return [
    {
      id: "card-responsabilidade-camadas",
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Responsabilidade por camada",
      text: revised
        ? "Em IaaS, o cliente administra sistema operacional, aplicações e dados; em PaaS, concentra-se na aplicação e nos dados; em SaaS, utiliza a aplicação pronta. A classificação decorre das camadas gerenciadas, não do fornecedor."
        : "Em IaaS, o cliente administra mais camadas; em PaaS, concentra-se na aplicação e nos dados; em SaaS, utiliza a aplicação pronta.",
      after: "A responsabilidade do provedor aumenta de IaaS para SaaS, mas o cliente conserva deveres sobre acesso, configuração e dados."
    },
    {
      id: "card-modelos-gap",
      resource: "table",
      kind: "exercise",
      exercise: "gap",
      title: "Complete a divisão de responsabilidades",
      columns: ["Modelo", "Responsabilidade típica do cliente"],
      rows: [
        ["IaaS", "Gerencia {gap:iaas-layer}."],
        ["PaaS", "Gerencia principalmente {gap:paas-layer}."],
        ["SaaS", "Usa a {gap:saas-layer}."]
      ],
      gaps: [
        {
          id: "iaas-layer",
          response: "choice",
          answer: "sistema operacional",
          distractors: ["datacenter físico", "aplicação SaaS"]
        },
        {
          id: "paas-layer",
          response: "choice",
          answer: "aplicação e dados",
          distractors: ["energia elétrica", "hipervisor"]
        },
        {
          id: "saas-layer",
          response: "choice",
          answer: "aplicação pronta",
          distractors: ["infraestrutura física", "plataforma de contêineres"]
        }
      ],
      after: "A abstração cresce de IaaS para SaaS e reduz as camadas administradas diretamente pelo cliente."
    }
  ];
}

async function adminAuth(path, {
  method = "POST",
  body = undefined
} = {}) {
  const response = await fetch(`${projectUrl}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: serverApiKey,
      Authorization: `Bearer ${serverApiKey}`,
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const source = await response.text();
  let payload = null;
  try {
    payload = source ? JSON.parse(source) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(`Auth admin local falhou com HTTP ${response.status}.`);
  }
  return payload;
}

async function createLocalUser(label) {
  const user = await adminAuth("users", {
    body: {
      email: `action-${label}-${runKey}@aralearn.local`,
      password: `Arl!${label}-${rawCredential("local")}9`,
      email_confirm: true,
      user_metadata: { test: "authoring-action-local-journey" }
    }
  });
  if (user?.id) state.users.push(user.id);
  assert.match(String(user?.id || ""), /^[0-9a-f-]{36}$/iu);
  return user.id;
}

async function ensureLocalBootstrapOwner() {
  const owner = await ensureLocalTechnicalOwner({
    adminAuth,
    rpc: (name, payload) => adapter.rpc(name, payload),
    email: BOOTSTRAP_OWNER_EMAIL,
    password: `Arl!bootstrap-${rawCredential("local")}9`,
    metadata: {
      test: "authoring-action-local-journey",
      persistentFixture: true
    },
    reason: "Owner técnico persistente da stack local de testes"
  });
  assert.match(String(owner.userId || ""), /^[0-9a-f-]{36}$/iu);
  return owner.userId;
}

async function provisionActionToken(userId, label) {
  const clientSecret = rawCredential("ars");
  const setup = await adapter.createActionOAuthClientSetup({
    creatorUserId: userId,
    clientName: `AraLearn Action local ${label}`,
    clientSecretHash: sha256(clientSecret)
  });
  const clientId = setup.clientId || setup.client_id;
  assert.match(String(clientId || ""), /^[0-9a-f-]{36}$/iu);

  const gptId = `g-local-${label}-${runKey}`;
  await adapter.linkActionOAuthClient({
    creatorUserId: userId,
    clientId,
    gptId
  });
  const redirectUri =
    `https://chatgpt.com/aip/${gptId}/oauth/callback`;
  const authorization = await adapter.createActionOAuthAuthorization({
    clientId,
    redirectUri,
    state: `state-${label}-${runKey}`,
    scope: "openid email"
  });
  const authorizationId =
    authorization.authorizationId || authorization.authorization_id;
  const code = rawCredential("arc");
  await adapter.decideActionOAuthAuthorization({
    authorizationId,
    userId,
    action: "approve",
    codeHash: sha256(code)
  });
  const accessToken = rawCredential("ara");
  const refreshToken = rawCredential("arr");
  const grant = await adapter.exchangeActionOAuthCode({
    clientId,
    clientSecretHash: sha256(clientSecret),
    codeHash: sha256(code),
    redirectUri,
    accessTokenHash: sha256(accessToken),
    refreshTokenHash: sha256(refreshToken),
    grantId: randomUUID()
  });
  assert.equal(grant.userId || grant.user_id, userId);
  assert.equal(grant.clientId || grant.client_id, clientId);
  return accessToken;
}

function actionRequest(name, token, argumentsValue) {
  return new Request(`${ACTION_BASE_URL}/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: ACTION_ORIGIN
    },
    body: JSON.stringify(argumentsValue)
  });
}

async function actionRaw(token, name, argumentsValue = {}) {
  const response = await handler(actionRequest(name, token, argumentsValue));
  const payload = await response.json();
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { response, payload };
}

async function action(token, name, argumentsValue = {}) {
  const { response, payload } = await actionRaw(
    token,
    name,
    argumentsValue
  );
  assert.equal(
    response.status,
    200,
    `${name}: HTTP ${response.status} ${payload?.error?.code || "erro"} — ${
      payload?.error?.message || "resposta inválida"
    }`
  );
  assert.equal(payload.ok, true, `${name}: resposta Action sem sucesso.`);
  return payload.data;
}

async function expectActionError(
  token,
  name,
  argumentsValue,
  { status, code }
) {
  const result = await actionRaw(token, name, argumentsValue);
  assert.equal(result.response.status, status, `${name}: status inesperado.`);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.error?.code, code);
  return result.payload.error;
}

async function findPersonalCourse(token, courseId) {
  const library = await action(token, "listarCursosDaBibliotecaPessoal", {
    limit: 100,
    query: "Dataprev: Teste"
  });
  return library.items.find((item) => item.courseId === courseId) || null;
}

async function findCollection(token, collectionId) {
  const collections = await action(token, "consultarCatalogo", {
    operation: "list_collections",
    limit: 100,
    includeRetired: false,
    query: `Action ${runKey}`
  });
  return collections.items.find(
    (item) => item.collectionId === collectionId
  ) || null;
}

async function runJourney() {
  state.bootstrapOwnerId = await ensureLocalBootstrapOwner();
  const authorId = await createLocalUser("author");
  const adminId = await createLocalUser("admin");
  state.adminUserId = adminId;
  const assignedRole = await adapter.rpc("set_app_role", {
    p_actor_user_id: state.bootstrapOwnerId,
    p_target_user_id: adminId,
    p_role: "catalog_publisher",
    p_active: true,
    p_reason: "Jornada local da Action de autoria"
  });
  state.adminRoleActive = true;
  assert.equal(assignedRole.role, "catalog_publisher");
  assert.equal(assignedRole.active, true);

  state.authorToken = await provisionActionToken(authorId, "author");
  state.adminToken = await provisionActionToken(adminId, "admin");

  const authorPrincipal = await adapter.resolveActionPrincipal(
    sha256(state.authorToken)
  );
  assert.equal(authorPrincipal.actorId, authorId);
  assert(authorPrincipal.scopes.includes("authoring:private:write"));
  assert(authorPrincipal.scopes.includes("catalog:submit"));
  assert(!authorPrincipal.scopes.includes("catalog:review"));
  assert(!authorPrincipal.scopes.includes("catalog:publish"));

  const adminPrincipal = await adapter.resolveActionPrincipal(
    sha256(state.adminToken)
  );
  assert.equal(adminPrincipal.actorId, adminId);
  assert(adminPrincipal.scopes.includes("authoring:private:write"));
  assert(adminPrincipal.scopes.includes("catalog:review"));
  assert(adminPrincipal.scopes.includes("catalog:publish"));
  assert(adminPrincipal.scopes.includes("catalog:manage"));

  const authorPreparation = await action(
    state.authorToken,
    "prepararAutoriaAraLearn",
    {
      intent: "create",
      targetEntity: "course",
      context: "Criar Dataprev: Teste para iniciante, com módulo de Computação em Nuvem e Virtualização no estilo FGV e práticas com lacunas.",
      resourceIds: ["paragraph", "table"]
    }
  );
  assert.equal(authorPreparation.access.profile, "private_author");
  assert.equal(authorPreparation.access.submitForCatalogReview, true);
  assert.equal(authorPreparation.access.reviewSubmissions, false);
  assert.equal(authorPreparation.access.publishCatalog, false);

  const adminPreparation = await action(
    state.adminToken,
    "prepararAutoriaAraLearn",
    { intent: "inspect", targetEntity: "course" }
  );
  assert.equal(adminPreparation.access.profile, "catalog_editor");
  assert.equal(adminPreparation.access.privateAuthoring, true);
  assert.equal(adminPreparation.access.reviewSubmissions, true);
  assert.equal(adminPreparation.access.publishCatalog, true);
  assert.equal(adminPreparation.access.manageCatalog, true);
  await expectActionError(
    state.authorToken,
    "consultarCatalogo",
    { operation: "list_collections", limit: 20 },
    { status: 403, code: "insufficient_scope" }
  );

  const created = await action(
    state.authorToken,
    "criarWorkspaceDeAutoria",
    {
      requestId: requestId("action-workspace"),
      title: "Dataprev: Teste — autoria local",
      brief: "Público iniciante; concurso Dataprev/FGV; construir de forma incremental, autossuficiente e com prática variada."
    }
  );
  state.authorWorkspaceId = created.workspaceId;

  const structured = await action(
    state.authorToken,
    "criarEstruturaNoWorkspace",
    {
      requestId: requestId("action-structure"),
      workspaceId: created.workspaceId,
      expectedRevision: created.revision,
      parts: structureParts()
    }
  );
  assert.equal(structured.revision, created.revision + 1);

  const partial = await action(
    state.authorToken,
    "publicarCursoDoWorkspace",
    {
      requestId: requestId("action-preview"),
      workspaceId: created.workspaceId,
      expectedRevision: structured.revision,
      courseId: paths.course[0],
      target: "private"
    }
  );
  state.privateCourse = {
    courseId: partial.courseId,
    contentHash: partial.contentHash,
    selectionId: null
  };
  assert.equal(Object.hasOwn(partial, "completionState"), false);

  await action(state.authorToken, "consultarRecursosDeCard", {
    resource: "paragraph"
  });
  await action(state.authorToken, "consultarRecursosDeCard", {
    resource: "table"
  });

  const materialized = await action(
    state.authorToken,
    "salvarCardsNaMicrossequencia",
    {
      requestId: requestId("action-cards"),
      workspaceId: created.workspaceId,
      expectedRevision: structured.revision,
      microsequencePath: paths.microsequence,
      mode: "replace",
      cardsJson: JSON.stringify(cards())
    }
  );
  assert.equal(materialized.revision, structured.revision + 1);

  const cardList = await action(
    state.authorToken,
    "listarCardsDaMicrossequencia",
    {
      workspaceId: created.workspaceId,
      microsequencePath: paths.microsequence,
      limit: 1
    }
  );
  assert.equal(cardList.items.length, 1);
  assert.equal(cardList.hasMore, true);
  assert(cardList.nextCursor);
  const secondCardPage = await action(
    state.authorToken,
    "listarCardsDaMicrossequencia",
    {
      workspaceId: created.workspaceId,
      microsequencePath: paths.microsequence,
      limit: 10,
      ...cardList.nextCursor
    }
  );
  assert.equal(secondCardPage.items.length, 1);
  assert.deepEqual(secondCardPage.items[0].resources, ["table"]);
  assert.equal(secondCardPage.hasMore, false);

  const microsequence = await action(
    state.authorToken,
    "lerWorkspaceDeAutoria",
    {
      workspaceId: created.workspaceId,
      view: "entity",
      entityType: "microsequence",
      entityPath: paths.microsequence,
      includeDescendants: true
    }
  );
  assert.equal(microsequence.content.cards.length, 2);
  assert.equal(
    Object.hasOwn(microsequence.content.cards[1], "gaps"),
    false
  );
  assert.match(microsequence.content.cards[1].rows[0][1], /\[\[/u);
  assert.doesNotMatch(
    JSON.stringify(microsequence.content.cards[1]),
    /\{gap:/u
  );

  const ready = materialized;
  const complete = await action(
    state.authorToken,
    "publicarCursoDoWorkspace",
    {
      requestId: requestId("action-complete"),
      workspaceId: created.workspaceId,
      expectedRevision: ready.revision,
      courseId: paths.course[0],
      target: "private"
    }
  );
  assert.equal(complete.courseId, partial.courseId);
  assert.equal(Object.hasOwn(complete, "completionState"), false);
  assert.notEqual(complete.contentHash, partial.contentHash);
  state.privateCourse.contentHash = complete.contentHash;

  const storedCourse = await action(
    state.authorToken,
    "lerConteudoDoCurso",
    {
      courseId: complete.courseId,
      view: "entity",
      entityType: "microsequence",
      entityPath: paths.microsequence,
      includeDescendants: true
    }
  );
  assert.equal(storedCourse.revisionHash, complete.contentHash);
  assert.equal(storedCourse.content.cards.length, 2);
  assert.match(storedCourse.content.cards[1].rows[2][1], /\[\[/u);

  const firstSubmission = await action(
    state.authorToken,
    "submeterCursoParaRevisaoEditorial",
    {
      requestId: requestId("action-submit"),
      courseId: complete.courseId,
      expectedContentHash: complete.contentHash,
      note: "Validar a progressão conceitual e a prática com lacunas."
    }
  );
  state.submissions.set(firstSubmission.submissionId, firstSubmission.status);
  assert.equal(firstSubmission.status, "submitted");

  await expectActionError(
    state.authorToken,
    "listarRevisoesEditoriais",
    { view: "queue", limit: 20 },
    { status: 403, code: "insufficient_scope" }
  );
  await expectActionError(
    state.adminToken,
    "lerWorkspaceDeAutoria",
    { workspaceId: created.workspaceId, view: "outline" },
    { status: 404, code: "not_found" }
  );

  const queue = await action(
    state.adminToken,
    "listarRevisoesEditoriais",
    { view: "queue", limit: 20 }
  );
  assert(queue.items.some(
    (item) => item.submissionId === firstSubmission.submissionId
      && item.authorId === authorId
  ));

  const reviewRead = await action(
    state.adminToken,
    "lerRevisaoEditorial",
    { submissionId: firstSubmission.submissionId, view: "outline" }
  );
  assert.equal(reviewRead.sourceRevisionHash, complete.contentHash);
  assert.equal(reviewRead.content.courses[0].id, paths.course[0]);

  const firstReviewWorkspace = await action(
    state.adminToken,
    "criarWorkspaceDeRevisaoEditorial",
    {
      requestId: requestId("action-review-workspace"),
      submissionId: firstSubmission.submissionId,
      title: "Revisão editorial local — Dataprev"
    }
  );
  state.reviewWorkspaceIds.add(firstReviewWorkspace.workspaceId);
  await expectActionError(
    state.authorToken,
    "lerWorkspaceDeAutoria",
    { workspaceId: firstReviewWorkspace.workspaceId, view: "outline" },
    { status: 404, code: "not_found" }
  );

  const requestedChanges = await action(
    state.adminToken,
    "decidirRevisaoEditorial",
    {
      requestId: requestId("action-request-changes"),
      submissionId: firstSubmission.submissionId,
      decision: "request_changes",
      note: "Explicite que a classificação decorre das camadas gerenciadas, e não do fornecedor."
    }
  );
  assert.equal(requestedChanges.status, "changes_requested");
  state.submissions.set(
    firstSubmission.submissionId,
    requestedChanges.status
  );
  state.reviewWorkspaceIds.delete(firstReviewWorkspace.workspaceId);

  const authorHistory = await action(
    state.authorToken,
    "listarRevisoesEditoriais",
    { view: "mine", limit: 20 }
  );
  const returnedFeedback = authorHistory.items.find(
    (item) => item.submissionId === firstSubmission.submissionId
  );
  assert.equal(returnedFeedback.status, "changes_requested");
  assert.match(returnedFeedback.reviewerNote, /camadas gerenciadas/iu);

  const revisedCard = await action(
    state.authorToken,
    "salvarCardNoWorkspace",
    {
      requestId: requestId("action-revise-card"),
      workspaceId: created.workspaceId,
      expectedRevision: ready.revision,
      cardPath: [
        ...paths.microsequence,
        "card-responsabilidade-camadas"
      ],
      cardJson: JSON.stringify(cards({ revised: true })[0])
    }
  );
  const readyAgain = revisedCard;
  const republished = await action(
    state.authorToken,
    "publicarCursoDoWorkspace",
    {
      requestId: requestId("action-republish"),
      workspaceId: created.workspaceId,
      expectedRevision: readyAgain.revision,
      courseId: paths.course[0],
      target: "private"
    }
  );
  assert.equal(republished.courseId, complete.courseId);
  assert.notEqual(republished.contentHash, complete.contentHash);
  state.privateCourse.contentHash = republished.contentHash;

  const secondSubmission = await action(
    state.authorToken,
    "submeterCursoParaRevisaoEditorial",
    {
      requestId: requestId("action-resubmit"),
      courseId: republished.courseId,
      expectedContentHash: republished.contentHash,
      note: "Pedido editorial incorporado e revisão pronta para nova análise."
    }
  );
  state.submissions.set(
    secondSubmission.submissionId,
    secondSubmission.status
  );
  assert.equal(secondSubmission.status, "submitted");
  assert.notEqual(secondSubmission.submissionId, firstSubmission.submissionId);

  const secondQueue = await action(
    state.adminToken,
    "listarRevisoesEditoriais",
    { view: "queue", limit: 20 }
  );
  assert(secondQueue.items.some(
    (item) => item.submissionId === secondSubmission.submissionId
  ));
  const secondReviewWorkspace = await action(
    state.adminToken,
    "criarWorkspaceDeRevisaoEditorial",
    {
      requestId: requestId("action-review-workspace-two"),
      submissionId: secondSubmission.submissionId,
      title: "Publicação editorial local — Dataprev"
    }
  );
  state.reviewWorkspaceIds.add(secondReviewWorkspace.workspaceId);

  const collection = await action(
    state.adminToken,
    "editarCatalogo",
    {
      operation: "create_collection",
      requestId: requestId("action-collection"),
      contractKey: `action-${runKey}`,
      title: `Action ${runKey}`,
      description: "Coleção efêmera da jornada local de integração."
    }
  );
  state.collection = {
    collectionId: collection.collectionId,
    revision: collection.revision,
    retired: false
  };

  const official = await action(
    state.adminToken,
    "publicarCursoDoWorkspace",
    {
      requestId: requestId("action-catalog-publish"),
      workspaceId: secondReviewWorkspace.workspaceId,
      expectedRevision: secondReviewWorkspace.revision,
      courseId: paths.course[0],
      target: "catalog",
      collectionId: collection.collectionId,
      submissionId: secondSubmission.submissionId
    }
  );
  state.officialCourse = {
    courseId: official.courseId,
    contentHash: official.contentHash,
    placementRevision: null,
    removed: false
  };
  state.submissions.set(secondSubmission.submissionId, "accepted");
  state.reviewWorkspaceIds.delete(secondReviewWorkspace.workspaceId);
  assert.equal(official.target, "catalog");
  assert.notEqual(official.courseId, republished.courseId);

  const catalogCourses = await action(
    state.adminToken,
    "consultarCatalogo",
    {
      operation: "list_collection_courses",
      collectionId: collection.collectionId,
      limit: 100,
      query: "Dataprev: Teste"
    }
  );
  const catalogCourse = catalogCourses.items.find(
    (item) => item.courseId === official.courseId
  );
  assert(catalogCourse);
  assert.equal(catalogCourse.contentHash, official.contentHash);
  state.officialCourse.placementRevision =
    catalogCourse.placementRevision;

  const removedOfficial = await action(
    state.adminToken,
    "retirarDoCatalogo",
    {
      operation: "remove_course",
      requestId: requestId("action-remove-official"),
      courseId: official.courseId,
      expectedPlacementRevision: catalogCourse.placementRevision,
      expectedContentHash: catalogCourse.contentHash
    }
  );
  assert.equal(removedOfficial.status, "removed");
  state.officialCourse.removed = true;

  const currentCollection = await findCollection(
    state.adminToken,
    collection.collectionId
  );
  assert(currentCollection);
  assert.equal(currentCollection.courseCount, 0);
  const retired = await action(
    state.adminToken,
    "retirarDoCatalogo",
    {
      operation: "retire_collection",
      requestId: requestId("action-retire-collection"),
      collectionId: collection.collectionId,
      expectedRevision: currentCollection.revision
    }
  );
  assert.equal(retired.status, "retired");
  state.collection.retired = true;

  const finalAuthorHistory = await action(
    state.authorToken,
    "listarRevisoesEditoriais",
    { view: "mine", limit: 20 }
  );
  assert.equal(
    finalAuthorHistory.items.find(
      (item) => item.submissionId === secondSubmission.submissionId
    )?.status,
    "accepted"
  );

  const selected = await findPersonalCourse(
    state.authorToken,
    state.privateCourse.courseId
  );
  assert(selected);
  state.privateCourse.selectionId = selected.selectionId;
  const removedPrivate = await action(
    state.authorToken,
    "retirarCursoDasTrilhas",
    {
      requestId: requestId("action-remove-private"),
      selectionId: selected.selectionId,
      courseId: selected.courseId,
      expectedContentHash: selected.contentHash
    }
  );
  assert.equal(removedPrivate.status, "removed");
  assert.equal(removedPrivate.courseArchived, true);
  state.privateCourse = null;

  const deletedWorkspace = await action(
    state.authorToken,
    "excluirDoWorkspace",
    {
      operation: "delete_workspace",
      requestId: requestId("action-delete-workspace"),
      workspaceId: created.workspaceId
    }
  );
  state.authorWorkspaceId = null;
  assert.equal(deletedWorkspace.deleted, true);
}

async function ignoreCleanup(label, task, failures) {
  try {
    await task();
  } catch (error) {
    failures.push(new Error(
      `${label}: ${error instanceof Error ? error.message : "falha desconhecida"}`
    ));
  }
}

async function cleanup() {
  const failures = [];

  if (state.authorToken) {
    for (const [submissionId, status] of state.submissions) {
      if (!new Set(["submitted", "in_review", "changes_requested"]).has(status)) {
        continue;
      }
      await ignoreCleanup(
        `retirar submissão ${submissionId}`,
        async () => {
          await action(
            state.authorToken,
            "retirarCursoDaRevisaoEditorial",
            {
              requestId: requestId("cleanup-withdraw"),
              submissionId
            }
          );
          state.submissions.set(submissionId, "withdrawn");
        },
        failures
      );
    }
  }

  if (
    state.adminToken
    && state.officialCourse
    && !state.officialCourse.removed
    && state.collection
  ) {
    await ignoreCleanup(
      "retirar curso oficial",
      async () => {
        const listed = await action(
          state.adminToken,
          "consultarCatalogo",
          {
            operation: "list_collection_courses",
            collectionId: state.collection.collectionId,
            limit: 100
          }
        );
        const course = listed.items.find(
          (item) => item.courseId === state.officialCourse.courseId
        );
        if (!course) return;
        await action(state.adminToken, "retirarDoCatalogo", {
          operation: "remove_course",
          requestId: requestId("cleanup-official"),
          courseId: course.courseId,
          expectedPlacementRevision: course.placementRevision,
          expectedContentHash: course.contentHash
        });
        state.officialCourse.removed = true;
      },
      failures
    );
  }

  if (state.adminToken && state.collection && !state.collection.retired) {
    await ignoreCleanup(
      "retirar coleção",
      async () => {
        const collection = await findCollection(
          state.adminToken,
          state.collection.collectionId
        );
        if (!collection) return;
        await action(state.adminToken, "retirarDoCatalogo", {
          operation: "retire_collection",
          requestId: requestId("cleanup-collection"),
          collectionId: collection.collectionId,
          expectedRevision: collection.revision
        });
        state.collection.retired = true;
      },
      failures
    );
  }

  if (state.authorToken && state.privateCourse) {
    await ignoreCleanup(
      "retirar curso privado",
      async () => {
        const course = await findPersonalCourse(
          state.authorToken,
          state.privateCourse.courseId
        );
        if (!course) return;
        await action(state.authorToken, "retirarCursoDasTrilhas", {
          requestId: requestId("cleanup-private"),
          selectionId: course.selectionId,
          courseId: course.courseId,
          expectedContentHash: course.contentHash
        });
        state.privateCourse = null;
      },
      failures
    );
  }

  if (state.authorToken && state.authorWorkspaceId) {
    await ignoreCleanup(
      "excluir workspace autoral",
      async () => {
        await action(state.authorToken, "excluirDoWorkspace", {
          operation: "delete_workspace",
          requestId: requestId("cleanup-workspace"),
          workspaceId: state.authorWorkspaceId
        });
        state.authorWorkspaceId = null;
      },
      failures
    );
  }

  if (
    state.bootstrapOwnerId
    && state.adminUserId
    && state.adminRoleActive
  ) {
    await ignoreCleanup(
      "revogar publicador local",
      async () => {
        await adapter.rpc("set_app_role", {
          p_actor_user_id: state.bootstrapOwnerId,
          p_target_user_id: state.adminUserId,
          p_role: "catalog_publisher",
          p_active: false,
          p_reason: "Fim da jornada local da Action de autoria"
        });
        state.adminRoleActive = false;
      },
      failures
    );
  }

  for (const userId of [...state.users].reverse()) {
    await ignoreCleanup(
      "excluir usuário local",
      async () => {
        await adminAuth(`users/${encodeURIComponent(userId)}`, {
          method: "DELETE",
          body: { should_soft_delete: true }
        });
        state.users = state.users.filter((id) => id !== userId);
      },
      failures
    );
  }
  return failures;
}

let journeyFailure = null;
try {
  await runJourney();
} catch (error) {
  journeyFailure = error;
}
const cleanupFailures = await cleanup();
if (journeyFailure || cleanupFailures.length) {
  throw new AggregateError(
    [
      ...(journeyFailure ? [journeyFailure] : []),
      ...cleanupFailures
    ],
    "A jornada local da Custom GPT Action falhou."
  );
}

console.log(
  "Jornada Action local aprovada: OAuth por conta, autoria privada, Storage, "
  + "revisão editorial, catálogo e limpeza."
);
