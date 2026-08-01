import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

import { CurrentStateCentral } from "../../src/supabase/CurrentStateCentral.js";
import { RemoteCourseCatalog } from "../../src/supabase/RemoteCourseCatalog.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = fs.readFileSync(path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260801120000_current_state_central.sql"
), "utf8");
const USER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";

function sessionStore() {
  const values = new Map();
  return {
    values,
    async getSyncState(key) { return values.get(key) ?? null; },
    async putSyncState(key, value) {
      if (value === null) values.delete(key);
      else values.set(key, value);
    }
  };
}

function authClient(store, userId = USER) {
  let session = { user: { id: userId } };
  return {
    sessionStore: store,
    getSession: () => session,
    setSession: (value) => { session = value; }
  };
}

function overview({ reviewer = false } = {}) {
  return {
    counts: {
      construction: 2,
      trails: 3,
      evaluationMine: 1,
      evaluationQueue: reviewer ? 4 : 0,
      collections: 1
    },
    capabilities: {
      authoringPrivate: true,
      catalogSubmit: true,
      catalogReview: reviewer,
      catalogPublish: reviewer,
      catalogManage: reviewer
    }
  };
}

test("cache da Central sobrescreve somente o estado corrente e isola usuários", async () => {
  const store = sessionStore();
  const auth = authClient(store);
  const calls = [];
  const catalog = {
    async getCurrentStateCentral() {
      calls.push("overview");
      return overview();
    },
    async listCurrentStateCentral(options) {
      calls.push(options);
      return {
        section: options.section,
        audience: options.audience,
        items: [{
          workspaceId: "20000000-0000-4000-8000-000000000001",
          title: "Curso em construção",
          revision: 99,
          contentHash: "segredo"
        }],
        hasMore: false,
        nextCursor: null
      };
    }
  };
  const central = new CurrentStateCentral({ catalog, authClient: auth });
  const remote = await central.loadOverview({ online: true });
  assert.equal(remote.summary.counts.trails, 3);
  assert.equal(calls.length, 1);

  const firstPage = await central.loadSection({ section: "construction", online: true });
  assert.equal(firstPage.page.items[0].title, "Curso em construção");
  assert.equal("revision" in firstPage.page.items[0], false);
  assert.equal("contentHash" in firstPage.page.items[0], false);

  const offline = await central.loadSection({ section: "construction", online: false });
  assert.deepEqual(offline.page, firstPage.page);
  assert.equal(offline.stale, true);

  auth.setSession({ user: { id: OTHER } });
  const otherCentral = new CurrentStateCentral({ catalog, authClient: auth });
  assert.equal((await otherCentral.loadOverview({ online: false })).summary, null);
  assert.equal(store.values.size, 1, "há somente um registro sobrescrito para o primeiro usuário");
});

test("revogação remota apaga o cache mesmo após a sessão ser invalidada", async () => {
  const store = sessionStore();
  const auth = authClient(store);
  const central = new CurrentStateCentral({
    authClient: auth,
    catalog: {
      async getCurrentStateCentral() { return overview({ reviewer: true }); },
      async listCurrentStateCentral() { return { items: [] }; }
    }
  });
  await central.loadOverview({ online: true });
  assert.equal(store.values.size, 1);
  central.catalog.getCurrentStateCentral = async () => {
    auth.setSession(null);
    throw Object.assign(new Error("Sessão revogada"), { authRequired: true });
  };
  await assert.rejects(() => central.loadOverview({ online: true }), /revogada/u);
  assert.equal(store.values.size, 0);
});

test("workspace conserva cache em falha transitória e o remove quando o acesso termina", async () => {
  const store = sessionStore();
  const auth = authClient(store);
  const workspaceId = "20000000-0000-4000-8000-000000000001";
  const catalog = {
    async getEducationalWorkspace() {
      return {
        workspaceId,
        title: "Turma A",
        purpose: "Aprender em conjunto.",
        kind: "class",
        visibility: "members",
        role: "learner",
        capabilities: { read: true, comment: true },
        members: [],
        invitations: [],
        courses: [{
          courseKey: "curso",
          title: "Curso",
          goal: "Aprender.",
          position: 0,
          moduleCount: 1,
          lessonCount: 2,
          microsequenceCount: 3,
          readyMicrosequenceCount: 1,
          cardCount: 5,
          publicationTargets: ["private"],
          updatedAt: "2026-08-01T11:00:00Z"
        }],
        courseCount: 1,
        publicationCount: 1,
        updatedAt: "2026-08-01T12:00:00Z"
      };
    }
  };
  const central = new CurrentStateCentral({ authClient: auth, catalog });
  await central.loadWorkspace({ workspaceId, online: true });
  assert.equal(
    (await central.loadWorkspace({ workspaceId, online: false })).workspace.courses[0].cardCount,
    5
  );

  catalog.getEducationalWorkspace = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(() => central.loadWorkspace({ workspaceId, online: true }), /fetch/u);
  assert.equal((await central.loadWorkspace({ workspaceId, online: false })).workspace.title, "Turma A");

  catalog.getEducationalWorkspace = async () => {
    throw Object.assign(new Error("Acesso revogado"), { code: "42501", status: 400 });
  };
  await assert.rejects(() => central.loadWorkspace({ workspaceId, online: true }), /revogado/u);
  assert.equal((await central.loadWorkspace({ workspaceId, online: false })).workspace, null);
});

test("cliente remoto envia exatamente o cursor composto anunciado pela Central", async () => {
  const requests = [];
  const catalog = new RemoteCourseCatalog({
    projectUrl: "https://project.example",
    publishableKey: "sb_publishable_test",
    authClient: {
      getSession: () => ({ user: { id: USER } }),
      getAccessToken: async () => "access-token"
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  await catalog.getCurrentStateCentral();
  await catalog.listCurrentStateCentral({
    section: "trails",
    limit: 10,
    afterPosition: 4,
    afterId: "40000000-0000-4000-8000-000000000004"
  });
  await catalog.getEducationalWorkspace("50000000-0000-4000-8000-000000000005");
  await catalog.manageEducationalWorkspace({
    requestId: "workspace:update:request-0001",
    operation: "update",
    payload: {
      workspaceId: "50000000-0000-4000-8000-000000000005",
      title: "Turma",
      purpose: "Finalidade",
      kind: "class",
      visibility: "members"
    }
  });
  await catalog.listEducationalWorkspaceComments({
    workspaceId: "50000000-0000-4000-8000-000000000005",
    limit: 10,
    beforeUpdatedAt: "2026-08-01T14:00:00Z",
    beforeId: "60000000-0000-4000-8000-000000000006",
    categories: ["question"],
    statuses: ["open"]
  });
  await catalog.manageEducationalWorkspaceComment({
    requestId: "comment:response:request-0001",
    workspaceId: "50000000-0000-4000-8000-000000000005",
    commentId: "60000000-0000-4000-8000-000000000006",
    operation: "respond_comment",
    payload: { response: "Resposta curta." }
  });
  assert.match(requests[0].url, /\/rpc\/get_current_state_central_v1$/u);
  assert.deepEqual(requests[0].body, {});
  assert.match(requests[1].url, /\/rpc\/list_current_state_central_v1$/u);
  assert.deepEqual(requests[1].body, {
    p_section: "trails",
    p_limit: 10,
    p_before_at: null,
    p_before_id: null,
    p_after_position: 4,
    p_after_id: "40000000-0000-4000-8000-000000000004",
    p_audience: "mine"
  });
  assert.match(requests[2].url, /\/rpc\/get_current_educational_workspace_v1$/u);
  assert.deepEqual(requests[2].body, {
    p_workspace_id: "50000000-0000-4000-8000-000000000005"
  });
  assert.match(requests[3].url, /\/rpc\/manage_current_educational_workspace_v1$/u);
  assert.deepEqual(requests[3].body, {
    p_request_id: "workspace:update:request-0001",
    p_operation: "update",
    p_payload: {
      workspaceId: "50000000-0000-4000-8000-000000000005",
      title: "Turma",
      purpose: "Finalidade",
      kind: "class",
      visibility: "members"
    }
  });
  assert.match(requests[4].url, /\/rpc\/list_current_educational_workspace_comments_v1$/u);
  assert.deepEqual(requests[4].body, {
    p_workspace_id: "50000000-0000-4000-8000-000000000005",
    p_limit: 10,
    p_before_updated_at: "2026-08-01T14:00:00Z",
    p_before_id: "60000000-0000-4000-8000-000000000006",
    p_categories: ["question"],
    p_statuses: ["open"]
  });
  assert.match(requests[5].url, /\/rpc\/manage_current_educational_workspace_comment_v1$/u);
  assert.deepEqual(requests[5].body, {
    p_request_id: "comment:response:request-0001",
    p_workspace_id: "50000000-0000-4000-8000-000000000005",
    p_comment_id: "60000000-0000-4000-8000-000000000006",
    p_operation: "respond_comment",
    p_payload: { response: "Resposta curta." }
  });
});

test("Central lê observações compartilhadas sem armazená-las e bloqueia mutação offline", async () => {
  const store = sessionStore();
  const auth = authClient(store);
  const workspaceId = "50000000-0000-4000-8000-000000000005";
  const commentId = "60000000-0000-4000-8000-000000000006";
  const calls = [];
  const central = new CurrentStateCentral({
    authClient: auth,
    catalog: {
      async listEducationalWorkspaceComments(options) {
        calls.push(options);
        return {
          workspaceId,
          role: "reviewer",
          summary: {
            totalCount: 2,
            openCount: 1,
            byCategory: {
              question: 1,
              possibleError: 0,
              confusing: 1,
              suggestion: 0,
              observation: 0
            },
            byStatus: { open: 1, considered: 1, resolved: 0, incorporated: 0 },
            focusCards: [{
              courseId: "70000000-0000-4000-8000-000000000007",
              cardId: "80000000-0000-4000-8000-000000000008",
              courseTitle: "Curso",
              cardTitle: "Card",
              totalCount: 2,
              openCount: 1,
              byCategory: {
                question: 1,
                possibleError: 0,
                confusing: 1,
                suggestion: 0,
                observation: 0
              }
            }]
          },
          items: [{
            commentId,
            courseId: "70000000-0000-4000-8000-000000000007",
            cardId: "80000000-0000-4000-8000-000000000008",
            entityPath: ["course", "module", "lesson", "micro", "card"],
            courseTitle: "Curso",
            cardTitle: "Card",
            author: { userId: USER, email: "pessoa@example.test" },
            category: "question",
            body: "Por quê?",
            status: "considered",
            response: "Porque este caso é diferente.",
            resolutionNote: null,
            courseRevisionHash: "a".repeat(64),
            targetAvailable: true,
            correction: null,
            createdAt: "2026-08-01T12:00:00Z",
            updatedAt: "2026-08-01T13:00:00Z",
            respondedAt: "2026-08-01T13:00:00Z",
            resolvedAt: null
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async manageEducationalWorkspaceComment(options) {
        calls.push(options);
        return { status: "resolved" };
      }
    }
  });
  const page = await central.loadWorkspaceComments({
    workspaceId,
    categories: ["question"],
    statuses: ["considered"]
  });
  assert.equal(page.items[0].response, "Porque este caso é diferente.");
  assert.equal(page.items[0].courseRevisionHash, "a".repeat(64));
  assert.equal(page.summary.openCount, 1);
  assert.equal(page.summary.focusCards[0].totalCount, 2);
  assert.deepEqual(calls[0], {
    workspaceId,
    limit: 20,
    beforeUpdatedAt: null,
    beforeId: null,
    categories: ["question"],
    statuses: ["considered"]
  });
  assert.equal(store.values.size, 0, "a triagem compartilhada não ocupa o cache persistente");

  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: false }
  });
  try {
    await assert.rejects(
      () => central.manageWorkspaceComment({
        requestId: "comment:status:request-0001",
        workspaceId,
        commentId,
        operation: "set_comment_status",
        payload: { status: "resolved", note: "" }
      }),
      (error) => error?.code === "WORKSPACE_ONLINE_REQUIRED"
    );
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator
    });
  }
});

async function centralDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table private.reviewers(user_id uuid primary key, can_publish boolean not null default false);
    create function private.can_review_catalog_v5(p_actor_id uuid)
      returns boolean language sql stable as $$
        select exists(select 1 from private.reviewers where user_id = p_actor_id)
      $$;
    create function private.can_publish_catalog_v5(p_actor_id uuid)
      returns boolean language sql stable as $$
        select exists(select 1 from private.reviewers where user_id = p_actor_id and can_publish)
      $$;
    create table private.authoring_workspaces(
      id uuid primary key, owner_id uuid not null, title text not null,
      source_submission_id uuid, updated_at timestamptz not null, deleted_at timestamptz
    );
    create table public.courses(
      id uuid primary key, owner_id uuid, title text not null, goal text not null default '',
      module_count integer not null default 0, lesson_count integer not null default 0,
      completion_state text not null default 'partial', status text not null default 'published',
      deleted_at timestamptz, document_storage_enabled boolean not null default true
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid not null, course_id uuid not null, target text not null,
      updated_at timestamptz not null
    );
    create table private.catalog_review_submissions(
      id uuid primary key, author_id uuid not null, source_course_id uuid not null,
      title text not null, status text not null, completion_state text not null,
      reviewer_id uuid, claim_expires_at timestamptz, submitted_at timestamptz not null,
      updated_at timestamptz not null
    );
    create table public.user_course_selections(
      id uuid primary key, user_id uuid not null, course_id uuid not null,
      position integer not null
    );
    create table public.lesson_progress(selection_id uuid, last_activity_at timestamptz);
    create table public.card_progress(selection_id uuid, last_activity_at timestamptz);
  `);
  await database.exec(migration);
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [USER]);
  return database;
}

test("projeção SQL é autenticada, corrente e pagina posições repetidas sem saltos", async () => {
  const database = await centralDatabase();
  try {
    await database.exec(`
      insert into private.authoring_workspaces values
        ('20000000-0000-4000-8000-000000000001', '${USER}', 'Curso A', null, '2026-08-01T12:00:00Z', null),
        ('20000000-0000-4000-8000-000000000002', '${OTHER}', 'Curso alheio', null, '2026-08-01T13:00:00Z', null);
      insert into public.courses(id, owner_id, title, module_count, lesson_count) values
        ('30000000-0000-4000-8000-000000000001', null, 'A', 1, 2),
        ('30000000-0000-4000-8000-000000000002', null, 'B', 2, 3),
        ('30000000-0000-4000-8000-000000000003', '${USER}', 'C', 3, 4);
      insert into public.user_course_selections values
        ('40000000-0000-4000-8000-000000000001', '${USER}', '30000000-0000-4000-8000-000000000001', 0),
        ('40000000-0000-4000-8000-000000000002', '${USER}', '30000000-0000-4000-8000-000000000002', 0),
        ('40000000-0000-4000-8000-000000000003', '${USER}', '30000000-0000-4000-8000-000000000003', 0);
    `);
    const summaryResult = await database.query("select public.get_current_state_central_v1() as value");
    assert.equal(summaryResult.rows[0].value.counts.construction, 1);
    assert.equal(summaryResult.rows[0].value.counts.trails, 3);
    assert.equal(summaryResult.rows[0].value.capabilities.catalogReview, false);

    const first = (await database.query(`
      select public.list_current_state_central_v1('trails', 2, null, null, null, null, 'mine') as value
    `)).rows[0].value;
    assert.equal(first.items.length, 2);
    assert.equal(first.hasMore, true);
    assert.deepEqual(first.nextCursor, {
      afterId: "40000000-0000-4000-8000-000000000002",
      afterPosition: 0
    });
    const second = (await database.query(`
      select public.list_current_state_central_v1(
        'trails', 2, null, null, 0,
        '40000000-0000-4000-8000-000000000002', 'mine'
      ) as value
    `)).rows[0].value;
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].title, "C");
    assert.equal(JSON.stringify(first).length < 8_000, true);

    await assert.rejects(
      () => database.query(`
        select public.list_current_state_central_v1('evaluation', 20, null, null, null, null, 'queue')
      `),
      /não autorizada/u
    );
  } finally {
    await database.close();
  }
});

test("migration não cria armazenamento paralelo e preserva o manifesto cumulativo", () => {
  const centralContract = migration.slice(0, migration.indexOf(
    "create or replace function public.get_aralearn_runtime_manifest"
  ));
  assert.doesNotMatch(centralContract, /create table/iu);
  assert.match(migration, /security definer[\s\S]+auth\.uid\(\)/u);
  assert.match(centralContract, /grant execute[\s\S]+to authenticated/u);
  assert.doesNotMatch(centralContract, /grant execute[\s\S]+to anon/u);
  for (const feature of [
    "atomic-card-assistance",
    "unchanged-publication-short-circuit",
    "structured-authoring-errors",
    "current-state-central-v1"
  ]) {
    assert.match(migration, new RegExp(`'${feature}'`, "u"));
  }
});
