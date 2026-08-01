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
