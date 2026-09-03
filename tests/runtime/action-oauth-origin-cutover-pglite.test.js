import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const regressedMigrationUrl = new URL(
  "../../supabase/migrations/20260902123759_drop_legacy_chat_openai_action_origin.sql",
  import.meta.url
);
const hotfixMigrationUrl = new URL(
  "../../supabase/migrations/20260902234800_bind_real_chatgpt_action_callback.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const LINKED_CLIENT = "30000000-0000-4000-8000-000000000001";
const SETUP_CLIENT = "30000000-0000-4000-8000-000000000002";
const AMBIGUOUS_CLIENT = "30000000-0000-4000-8000-000000000003";
const SAVED_GPT_ID = "g-public-metadata";
const CALLBACK_ID = "g-real-client-callback";
const CHATGPT_REDIRECT = `https://chatgpt.com/aip/${CALLBACK_ID}/oauth/callback`;
const CHAT_OPENAI_REDIRECT = `https://chat.openai.com/aip/${CALLBACK_ID}/oauth/callback`;
const DERIVED_REDIRECT = `https://chatgpt.com/aip/${SAVED_GPT_ID}/oauth/callback`;

async function regressedActionOauthDatabase() {
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
      '${LINKED_CLIENT}', '${OWNER}', '${SAVED_GPT_ID}', 'Action vinculada',
      '${"a".repeat(64)}', array['${CHATGPT_REDIRECT}', '${CHAT_OPENAI_REDIRECT}']
    ),(
      '${SETUP_CLIENT}', '${OWNER}', null, 'Action em configuração',
      '${"b".repeat(64)}', array[]::text[]
    ),(
      '${AMBIGUOUS_CLIENT}', '${OWNER}', 'g-ambiguous-metadata', 'Action ambígua',
      '${"9".repeat(64)}', array[
        'https://chatgpt.com/aip/g-first-history/oauth/callback',
        'https://chat.openai.com/aip/g-first-history/oauth/callback'
      ]
    );
    insert into private.authoring_action_oauth_authorizations(
      id, client_id, redirect_uri, state, scope, status, user_id, code_hash,
      expires_at, decided_at, consumed_at
    ) values
      ('40000000-0000-4000-8000-000000000001', '${LINKED_CLIENT}',
        '${CHAT_OPENAI_REDIRECT}', 'legacy-pending', 'openid', 'pending', null, null,
        now() + interval '5 minutes', null, null),
      ('40000000-0000-4000-8000-000000000002', '${LINKED_CLIENT}',
        '${CHAT_OPENAI_REDIRECT}', 'legacy-approved', 'openid email', 'approved',
        '${OWNER}', '${"c".repeat(64)}', now() + interval '5 minutes', now(), null),
      ('40000000-0000-4000-8000-000000000003', '${LINKED_CLIENT}',
        '${CHAT_OPENAI_REDIRECT}', 'legacy-consumed', 'openid', 'consumed',
        '${OWNER}', '${"d".repeat(64)}', now() + interval '5 minutes', now(), now()),
      ('40000000-0000-4000-8000-000000000004', '${LINKED_CLIENT}',
        '${CHATGPT_REDIRECT}', 'current-pending', 'openid', 'pending', null, null,
        now() + interval '5 minutes', null, null),
      ('40000000-0000-4000-8000-000000000005', '${AMBIGUOUS_CLIENT}',
        'https://chat.openai.com/aip/g-first-history/oauth/callback',
        'first-history', 'openid', 'consumed', '${OWNER}', '${"1".repeat(64)}',
        now() + interval '5 minutes', now(), now() - interval '1 day'),
      ('40000000-0000-4000-8000-000000000006', '${AMBIGUOUS_CLIENT}',
        'https://chatgpt.com/aip/g-second-history/oauth/callback',
        'second-history', 'openid', 'consumed', '${OWNER}', '${"2".repeat(64)}',
        now() + interval '5 minutes', now(), now());
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
  await database.exec(await fs.readFile(regressedMigrationUrl, "utf8"));
  assert.deepEqual((await database.query(`
    select redirect_uris from private.authoring_action_oauth_clients where id=$1
  `, [LINKED_CLIENT])).rows[0].redirect_uris, [DERIVED_REDIRECT]);

  // Representa um token legítimo emitido após o corte regressivo. A hotfix não
  // pode revogá-lo nem ressuscitar o outro token já revogado.
  await database.query(`
    update private.authoring_action_oauth_tokens
    set revoked_at=null where token_hash=$1
  `, ["e".repeat(64)]);
  await database.exec(await fs.readFile(hotfixMigrationUrl, "utf8"));
  return database;
}

test("upgrade recupera somente callback comprovado sem inferir gpt_id nem mudar concessões", async () => {
  const database = await regressedActionOauthDatabase();
  const state = await database.query(`
    select jsonb_build_object(
      'linkedRedirects', (
        select redirect_uris from private.authoring_action_oauth_clients where id=$1
      ),
      'setupRedirects', (
        select redirect_uris from private.authoring_action_oauth_clients where id=$2
      ),
      'ambiguousRedirects', (
        select redirect_uris from private.authoring_action_oauth_clients where id=$3
      ),
      'authorizations', (
        select jsonb_object_agg(state, status order by state)
        from private.authoring_action_oauth_authorizations where client_id=$1
      ),
      'liveTokens', (
        select count(*)::integer from private.authoring_action_oauth_tokens
        where client_id=$1 and revoked_at is null
      ),
      'revokedTokens', (
        select count(*)::integer from private.authoring_action_oauth_tokens
        where client_id=$1 and revoked_at is not null
      ),
      'revision', public.get_aralearn_runtime_manifest()->>'schemaRevision'
    ) value
  `, [LINKED_CLIENT, SETUP_CLIENT, AMBIGUOUS_CLIENT]);
  assert.deepEqual(state.rows[0].value, {
    linkedRedirects: [CHATGPT_REDIRECT, CHAT_OPENAI_REDIRECT],
    setupRedirects: [],
    ambiguousRedirects: [],
    authorizations: {
      "current-pending": "pending",
      "legacy-approved": "denied",
      "legacy-consumed": "consumed",
      "legacy-pending": "denied"
    },
    liveTokens: 1,
    revokedTokens: 1,
    revision: "20260902234800"
  });
  assert.notEqual(SAVED_GPT_ID, CALLBACK_ID);

  for (const [redirectUri, stateValue] of [
    [CHATGPT_REDIRECT, "official-chatgpt"],
    [CHAT_OPENAI_REDIRECT, "official-chat-openai"]
  ]) {
    const created = await database.query(`
      select public.create_authoring_action_oauth_authorization_v4(
        $1, $2, $3, 'openid email'
      ) value
    `, [LINKED_CLIENT, redirectUri, stateValue]);
    assert.equal(created.rows[0].value.clientId, LINKED_CLIENT);
  }
});

test("primeira troca confidencial vincula os dois aliases do callback real", async () => {
  const database = await regressedActionOauthDatabase();
  const runtimeId = "g-runtime-callback";
  const chatOpenAi = `https://chat.openai.com/aip/${runtimeId}/oauth/callback`;
  const chatGpt = `https://chatgpt.com/aip/${runtimeId}/oauth/callback`;

  const linked = await database.query(`
    select public.link_authoring_action_oauth_client_v4(
      $1, $2, 'g-unrelated-saved-id'
    ) value
  `, [OWNER, SETUP_CLIENT]);
  assert.equal(linked.rows[0].value.linked, true);
  assert.deepEqual((await database.query(`
    select redirect_uris from private.authoring_action_oauth_clients where id=$1
  `, [SETUP_CLIENT])).rows[0].redirect_uris, []);

  const created = await database.query(`
    select public.create_authoring_action_oauth_authorization_v4(
      $1, $2, 'first-real-authorization', 'openid email'
    ) value
  `, [SETUP_CLIENT, chatOpenAi]);
  const authorizationId = created.rows[0].value.authorizationId;
  assert.deepEqual((await database.query(`
    select redirect_uris from private.authoring_action_oauth_clients where id=$1
  `, [SETUP_CLIENT])).rows[0].redirect_uris, []);
  await database.query(`
    update private.authoring_action_oauth_authorizations
    set status='approved', user_id=$1, code_hash=$2, decided_at=now()
    where id=$3
  `, [OWNER, "3".repeat(64), authorizationId]);

  await assert.rejects(database.query(`
    select public.exchange_authoring_action_oauth_code_v4(
      $1, $2, $3, $4, $5, $6, $7
    )
  `, [
    SETUP_CLIENT, "b".repeat(64), "3".repeat(64), chatGpt,
    "4".repeat(64), "5".repeat(64),
    "50000000-0000-4000-8000-000000000002"
  ]), /Código OAuth inválido/u);
  assert.deepEqual((await database.query(`
    select redirect_uris from private.authoring_action_oauth_clients where id=$1
  `, [SETUP_CLIENT])).rows[0].redirect_uris, []);

  const exchanged = await database.query(`
    select public.exchange_authoring_action_oauth_code_v4(
      $1, $2, $3, $4, $5, $6, $7
    ) value
  `, [
    SETUP_CLIENT, "b".repeat(64), "3".repeat(64), chatOpenAi,
    "4".repeat(64), "5".repeat(64),
    "50000000-0000-4000-8000-000000000002"
  ]);
  assert.equal(exchanged.rows[0].value.clientId, SETUP_CLIENT);
  assert.deepEqual((await database.query(`
    select redirect_uris from private.authoring_action_oauth_clients where id=$1
  `, [SETUP_CLIENT])).rows[0].redirect_uris, [chatGpt, chatOpenAi]);

  const alias = await database.query(`
    select public.create_authoring_action_oauth_authorization_v4(
      $1, $2, 'second-official-host', 'openid'
    ) value
  `, [SETUP_CLIENT, chatGpt]);
  assert.equal(alias.rows[0].value.clientId, SETUP_CLIENT);
  await assert.rejects(database.query(`
    select public.create_authoring_action_oauth_authorization_v4(
      $1, 'https://chatgpt.com/aip/g-another-callback/oauth/callback',
      'different-callback', 'openid'
    )
  `, [SETUP_CLIENT]), /callback OAuth não é um endereço oficial vinculado/u);
});

test("callback permanece estrito quanto a HTTPS, host, porta, path e parâmetros", async () => {
  const database = await regressedActionOauthDatabase();
  const invalidRedirects = [
    `http://chatgpt.com/aip/${CALLBACK_ID}/oauth/callback`,
    `https://evil.example/aip/${CALLBACK_ID}/oauth/callback`,
    `https://chatgpt.com.evil.example/aip/${CALLBACK_ID}/oauth/callback`,
    `https://chatgpt.com:443/aip/${CALLBACK_ID}/oauth/callback`,
    `https://chat.openai.com/aip/${CALLBACK_ID}/oauth/callback?next=evil`,
    `https://chat.openai.com/aip/${CALLBACK_ID}/oauth/callback#fragment`,
    `https://chatgpt.com/aip/${CALLBACK_ID}/oauth/other`,
    "https://chatgpt.com/aip/g-short/oauth/callback/extra"
  ];
  for (const [index, redirectUri] of invalidRedirects.entries()) {
    await assert.rejects(database.query(`
      select public.create_authoring_action_oauth_authorization_v4(
        $1, $2, $3, 'openid'
      )
    `, [AMBIGUOUS_CLIENT, redirectUri, `invalid-state-${index}`]),
    /callback OAuth não é um endereço oficial vinculado/u);
  }

  await assert.rejects(database.query(`
    update private.authoring_action_oauth_clients
    set redirect_uris=array[
      'https://chatgpt.com/aip/g-one-callback/oauth/callback',
      'https://chat.openai.com/aip/g-other-callback/oauth/callback'
    ] where id=$1
  `, [AMBIGUOUS_CLIENT]), /authoring_action_oauth_clients_redirects/u);
  await assert.rejects(database.query(`
    update private.authoring_action_oauth_clients
    set redirect_uris=array[
      'https://chatgpt.com/aip/g-one-callback/oauth/callback', null
    ]::text[] where id=$1
  `, [AMBIGUOUS_CLIENT]), /authoring_action_oauth_clients_redirects/u);
  await assert.rejects(database.query(`
    update private.authoring_action_oauth_clients
    set redirect_uris='[0:1]={"https://chatgpt.com/aip/g-one-callback/oauth/callback",
      "https://chat.openai.com/aip/g-one-callback/oauth/callback"}'::text[]
    where id=$1
  `, [AMBIGUOUS_CLIENT]), /authoring_action_oauth_clients_redirects/u);
});

test("funções OAuth permanecem internas e runtime declara os dois hosts oficiais", async () => {
  const database = await regressedActionOauthDatabase();
  const privileges = await database.query(`
    select
      has_function_privilege(
        'service_role',
        'public.create_authoring_action_oauth_authorization_v4(uuid,text,text,text)',
        'EXECUTE'
      ) service_can_authorize,
      has_function_privilege(
        'authenticated',
        'public.create_authoring_action_oauth_authorization_v4(uuid,text,text,text)',
        'EXECUTE'
      ) authenticated_can_authorize,
      has_function_privilege(
        'service_role',
        'public.exchange_authoring_action_oauth_code_v4(uuid,text,text,text,text,text,uuid)',
        'EXECUTE'
      ) service_can_exchange,
      has_function_privilege(
        'anon',
        'public.exchange_authoring_action_oauth_code_v4(uuid,text,text,text,text,text,uuid)',
        'EXECUTE'
      ) anon_can_exchange
  `);
  assert.deepEqual(privileges.rows[0], {
    service_can_authorize: true,
    authenticated_can_authorize: false,
    service_can_exchange: true,
    anon_can_exchange: false
  });

  const liveFiles = [
    "../../supabase/functions/aralearn-authoring-action/index.ts",
    "../../scripts/deploySupabase.ps1",
    "../../scripts/verifyHostedBackend.mjs",
    "../../docs/implantacao.md",
    "../../docs/supabase.md"
  ];
  for (const relative of liveFiles) {
    const source = await fs.readFile(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /chatgpt[.]com/u, relative);
    assert.match(source, /chat[.]openai[.]com/u, relative);
  }
});
