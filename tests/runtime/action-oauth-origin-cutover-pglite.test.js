import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260902123759_drop_legacy_chat_openai_action_origin.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const LINKED_CLIENT = "30000000-0000-4000-8000-000000000001";
const SETUP_CLIENT = "30000000-0000-4000-8000-000000000002";
const GPT_ID = "g-current-action";
const CURRENT_REDIRECT = `https://chatgpt.com/aip/${GPT_ID}/oauth/callback`;
const LEGACY_REDIRECT = `https://chat.openai.com/aip/${GPT_ID}/oauth/callback`;

async function legacyActionOauthDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;

    create table auth.users(id uuid primary key);
    create function private.require_service_role()
    returns void language plpgsql as $$
    begin
      if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
        raise exception 'service role required' using errcode = '42501';
      end if;
    end $$;

    create table private.authoring_action_oauth_clients (
      id uuid primary key,
      creator_user_id uuid not null references auth.users(id) on delete cascade,
      gpt_id text,
      client_name text not null,
      client_secret_hash text not null,
      redirect_uris text[] not null,
      active boolean not null default true,
      created_at timestamptz not null default statement_timestamp(),
      updated_at timestamptz not null default statement_timestamp(),
      constraint authoring_action_oauth_clients_redirects check (
        cardinality(redirect_uris) in (0, 2)
      ),
      constraint authoring_action_oauth_clients_link_state check (
        (gpt_id is null and cardinality(redirect_uris) = 0)
        or (gpt_id is not null and cardinality(redirect_uris) = 2)
      )
    );
    create unique index authoring_action_oauth_one_active_gpt_per_creator_idx
      on private.authoring_action_oauth_clients(creator_user_id, gpt_id)
      where gpt_id is not null and active;

    create table private.authoring_action_oauth_authorizations (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references private.authoring_action_oauth_clients(id)
        on delete cascade,
      redirect_uri text not null,
      state text not null,
      scope text not null,
      status text not null default 'pending',
      user_id uuid references auth.users(id) on delete cascade,
      code_hash text,
      expires_at timestamptz not null
        default statement_timestamp() + interval '10 minutes',
      created_at timestamptz not null default statement_timestamp(),
      decided_at timestamptz,
      consumed_at timestamptz,
      constraint authoring_action_oauth_authorizations_status check (
        status in ('pending', 'approved', 'denied', 'consumed')
      )
    );

    create table private.authoring_action_oauth_tokens (
      token_hash text primary key,
      token_kind text not null,
      grant_id uuid not null,
      client_id uuid not null references private.authoring_action_oauth_clients(id)
        on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      scope text not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default statement_timestamp(),
      revoked_at timestamptz,
      replaced_by_hash text
    );

    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path = pg_catalog as $$
      select '{"schemaRevision":"20260902044404","contractVersion":1,
        "features":["gpt-actions-openapi-v1"]}'::jsonb
    $$;

    insert into auth.users(id) values('${OWNER}');
    insert into private.authoring_action_oauth_clients(
      id, creator_user_id, gpt_id, client_name, client_secret_hash, redirect_uris
    ) values(
      '${LINKED_CLIENT}', '${OWNER}', '${GPT_ID}', 'Action vinculada',
      '${"a".repeat(64)}', array['${CURRENT_REDIRECT}', '${LEGACY_REDIRECT}']
    ),(
      '${SETUP_CLIENT}', '${OWNER}', null, 'Action em configuração',
      '${"b".repeat(64)}', array[]::text[]
    );
    insert into private.authoring_action_oauth_authorizations(
      id, client_id, redirect_uri, state, scope, status, user_id, code_hash,
      expires_at, decided_at, consumed_at
    ) values
      ('40000000-0000-4000-8000-000000000001', '${LINKED_CLIENT}',
        '${LEGACY_REDIRECT}', 'legacy-pending', 'openid', 'pending', null, null,
        now() + interval '5 minutes', null, null),
      ('40000000-0000-4000-8000-000000000002', '${LINKED_CLIENT}',
        '${LEGACY_REDIRECT}', 'legacy-approved', 'openid email', 'approved',
        '${OWNER}', '${"c".repeat(64)}', now() + interval '5 minutes', now(), null),
      ('40000000-0000-4000-8000-000000000003', '${LINKED_CLIENT}',
        '${LEGACY_REDIRECT}', 'legacy-consumed', 'openid', 'consumed',
        '${OWNER}', '${"d".repeat(64)}', now() + interval '5 minutes', now(), now()),
      ('40000000-0000-4000-8000-000000000004', '${LINKED_CLIENT}',
        '${CURRENT_REDIRECT}', 'current-pending', 'openid', 'pending', null, null,
        now() + interval '5 minutes', null, null);
    insert into private.authoring_action_oauth_tokens(
      token_hash, token_kind, grant_id, client_id, user_id, scope, expires_at
    ) values
      ('${"e".repeat(64)}', 'access',
        '50000000-0000-4000-8000-000000000001', '${LINKED_CLIENT}', '${OWNER}',
        'openid', now() + interval '1 hour'),
      ('${"f".repeat(64)}', 'refresh',
        '50000000-0000-4000-8000-000000000001', '${LINKED_CLIENT}', '${OWNER}',
        'openid', now() + interval '30 days');
    select set_config('request.jwt.claim.role', 'service_role', false);
  `);
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  return database;
}

test("corte OAuth de Actions revoga tokens e deixa somente chatgpt.com ativo", async () => {
  const database = await legacyActionOauthDatabase();
  const state = await database.query(`
    select jsonb_build_object(
      'redirects', (
        select jsonb_object_agg(coalesce(gpt_id, 'setup'), redirect_uris)
        from private.authoring_action_oauth_clients
      ),
      'authorizations', (
        select jsonb_object_agg(state, status order by state)
        from private.authoring_action_oauth_authorizations
      ),
      'liveTokens', (
        select count(*)::integer from private.authoring_action_oauth_tokens
        where revoked_at is null
      ),
      'revision', public.get_aralearn_runtime_manifest()->>'schemaRevision'
    ) value
  `);
  assert.deepEqual(state.rows[0].value, {
    redirects: {
      [GPT_ID]: [CURRENT_REDIRECT],
      setup: []
    },
    authorizations: {
      "current-pending": "pending",
      "legacy-approved": "denied",
      "legacy-consumed": "consumed",
      "legacy-pending": "denied"
    },
    liveTokens: 0,
    revision: "20260902123759"
  });

  const linked = await database.query(`
    select public.link_authoring_action_oauth_client_v4(
      $1, $2, 'g-new-action'
    ) value
  `, [OWNER, SETUP_CLIENT]);
  assert.equal(linked.rows[0].value.linked, true);
  assert.deepEqual((await database.query(`
    select redirect_uris from private.authoring_action_oauth_clients where id=$1
  `, [SETUP_CLIENT])).rows[0].redirect_uris, [
    "https://chatgpt.com/aip/g-new-action/oauth/callback"
  ]);

  const created = await database.query(`
    select public.create_authoring_action_oauth_authorization_v4(
      $1, $2,
      'current-state', 'openid email'
    ) value
  `, [LINKED_CLIENT, CURRENT_REDIRECT]);
  assert.equal(created.rows[0].value.clientId, LINKED_CLIENT);

  await assert.rejects(
    database.query(`
      select public.create_authoring_action_oauth_authorization_v4(
        $1, 'https://chatgpt.com/aip/g-renamed-action/oauth/callback',
        'renamed-state', 'openid'
      )
    `, [LINKED_CLIENT]),
    /callback OAuth não é um endereço oficial do ChatGPT/u
  );

  await assert.rejects(
    database.query(`
      select public.create_authoring_action_oauth_authorization_v4(
        $1, $2, 'legacy-state', 'openid'
      )
    `, [LINKED_CLIENT, LEGACY_REDIRECT]),
    /callback OAuth não é um endereço oficial do ChatGPT/u
  );
  await assert.rejects(
    database.query(`
      update private.authoring_action_oauth_clients
      set redirect_uris=array[$2, $3]
      where id=$1
    `, [LINKED_CLIENT, CURRENT_REDIRECT, LEGACY_REDIRECT]),
    /authoring_action_oauth_clients_(?:redirects|link_state)/u
  );

  const privileges = await database.query(`
    select
      has_function_privilege(
        'service_role',
        'public.create_authoring_action_oauth_authorization_v4(uuid,text,text,text)',
        'EXECUTE'
      ) service_can_execute,
      has_function_privilege(
        'authenticated',
        'public.create_authoring_action_oauth_authorization_v4(uuid,text,text,text)',
        'EXECUTE'
      ) authenticated_can_execute
  `);
  assert.deepEqual(privileges.rows[0], {
    service_can_execute: true,
    authenticated_can_execute: false
  });
});

test("runtime e documentação não oferecem a origem substituída", async () => {
  const liveFiles = [
    "../../supabase/functions/aralearn-authoring-action/index.ts",
    "../../scripts/deploySupabase.ps1",
    "../../docs/implantacao.md",
    "../../docs/supabase.md"
  ];
  for (const relative of liveFiles) {
    const source = await fs.readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /chat[.]openai[.]com/u, relative);
  }
});
