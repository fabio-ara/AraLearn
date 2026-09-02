import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260821191340_harden_current_data_lifecycle.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const TARGET = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const OAUTH_CLIENT = "30000000-0000-4000-8000-000000000001";
const OAUTH_SESSION = "70000000-0000-4000-8000-000000000001";

async function migrationSlice(startMarker, endMarker) {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Trecho ausente: ${startMarker}`);
  return migration.slice(start, end);
}

async function oauthPrincipalDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create role supabase_auth_admin;
    create schema auth;
    create schema private;
    create schema extensions;

    create table auth.users(
      id uuid primary key,
      deleted_at timestamptz,
      is_anonymous boolean not null default false,
      banned_until timestamptz
    );
    create table auth.oauth_clients(
      id uuid primary key,
      deleted_at timestamptz
    );
    create table auth.sessions(
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      oauth_client_id uuid references auth.oauth_clients(id) on delete cascade,
      not_after timestamptz,
      scopes text
    );
    create table auth.oauth_consents(
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      client_id uuid not null references auth.oauth_clients(id) on delete cascade,
      scopes text not null,
      granted_at timestamptz not null,
      revoked_at timestamptz
    );
    create table public.person_profiles(
      user_id uuid primary key references auth.users(id) on delete cascade
    );
    create function extensions.digest(p_value bytea,p_algorithm text)
    returns bytea language sql immutable as $$
      select decode(md5(encode(p_value,'hex'))||md5(encode(p_value,'hex')),'hex')
    $$;
    create function private.require_service_role()
    returns void language plpgsql as $$
    begin
      if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
        raise exception 'service role required' using errcode='42501';
      end if;
    end $$;

    insert into auth.users(id) values('${OWNER}');
    insert into public.person_profiles(user_id) values('${OWNER}');
    insert into auth.oauth_clients(id) values('${OAUTH_CLIENT}');
    insert into auth.sessions(id,user_id,oauth_client_id,not_after,scopes)
    values(
      '${OAUTH_SESSION}','${OWNER}','${OAUTH_CLIENT}',
      now()+interval '1 hour','offline_access'
    );
    insert into auth.oauth_consents(
      id,user_id,client_id,scopes,granted_at
    ) values(
      '80000000-0000-4000-8000-000000000001','${OWNER}',
      '${OAUTH_CLIENT}','offline_access',now()-interval '1 minute'
    );
  `);
  await database.exec(await migrationSlice(
    "create function public.derive_mcp_oauth_pairwise_id_v1(",
    "-- O bearer OAuth entregue"
  ));
  return database;
}

function oauthHookEvent(overrides = {}) {
  return {
    user_id: OWNER,
    authentication_method: "oauth",
    claims: {
      iss: "http://127.0.0.1:54321/auth/v1",
      aud: "authenticated",
      exp: 2_000_000_000,
      iat: 1_999_999_000,
      sub: OWNER,
      role: "authenticated",
      aal: "aal1",
      session_id: OAUTH_SESSION,
      email: "owner@example.test",
      phone: "+5511999999999",
      is_anonymous: false,
      client_id: OAUTH_CLIENT,
      scope: "offline_access",
      app_metadata: { provider: "email", secretRole: "owner" },
      user_metadata: { displayName: "Pessoa identificada" },
      amr: [{ method: "password", timestamp: 1_999_999_000 }],
      jti: "internal-token-id",
      ref: "project-ref",
      ...overrides
    }
  };
}

test("hook OAuth emite apenas aliases pairwise e mantém a sessão comum intacta", async () => {
  const database = await oauthPrincipalDatabase();
  const ordinaryEvent = oauthHookEvent({ client_id: undefined });
  delete ordinaryEvent.claims.client_id;
  const ordinary = await database.query(
    "select public.aralearn_mcp_access_token_hook($1::jsonb) value",
    [JSON.stringify(ordinaryEvent)]
  );
  assert.deepEqual(ordinary.rows[0].value, ordinaryEvent);

  const hooked = await database.query(
    "select public.aralearn_mcp_access_token_hook($1::jsonb) value",
    [JSON.stringify(oauthHookEvent())]
  );
  const claims = hooked.rows[0].value.claims;
  const expectedAliases = await database.query(`
    select
      public.derive_mcp_oauth_pairwise_id_v1(
        'subject-v1',$1::uuid,$2::uuid
      ) subject_alias,
      public.derive_mcp_oauth_pairwise_id_v1(
        'session-v1',$3::uuid,$2::uuid
      ) session_alias
  `, [OWNER, OAUTH_CLIENT, OAUTH_SESSION]);
  assert.equal(claims.sub, expectedAliases.rows[0].subject_alias);
  assert.equal(claims.session_id, expectedAliases.rows[0].session_alias);
  assert.equal(claims.aralearn_session_id, OAUTH_SESSION);
  assert.equal(claims.client_id, OAUTH_CLIENT);
  assert.equal(claims.scope, "offline_access");
  assert.equal(claims.aud, "http://127.0.0.1:54321/functions/v1/aralearn-authoring-mcp");
  assert.equal(claims.email, "");
  assert.equal(claims.phone, "");
  assert.match(claims.sub, /^[0-9a-f-]{14}5[0-9a-f-]{3}-8[0-9a-f-]+$/u);
  assert.notEqual(claims.sub, OWNER);
  assert.notEqual(claims.session_id, OAUTH_SESSION);
  const otherClientAlias = await database.query(`
    select public.derive_mcp_oauth_pairwise_id_v1(
      'subject-v1',$1::uuid,'30000000-0000-4000-8000-000000000002'::uuid
    ) value
  `, [OWNER]);
  assert.notEqual(otherClientAlias.rows[0].value, claims.sub);
  assert.deepEqual(Object.keys(claims).sort(), [
    "aal", "aralearn_session_id", "aud", "client_id", "email", "exp", "iat",
    "is_anonymous", "iss", "phone", "role", "scope", "session_id", "sub"
  ]);
  assert.doesNotMatch(JSON.stringify(claims), /owner@example|Pessoa identificada|project-ref/u);

  const refreshEvent = oauthHookEvent();
  refreshEvent.authentication_method = "token_refresh";
  const refreshed = await database.query(
    "select public.aralearn_mcp_access_token_hook($1::jsonb) value",
    [JSON.stringify(refreshEvent)]
  );
  assert.equal(refreshed.rows[0].value.claims.scope, "offline_access");
  assert.deepEqual(refreshed.rows[0].value.claims, claims);

  await assert.rejects(
    database.query(
      "select public.aralearn_mcp_access_token_hook($1::jsonb)",
      [JSON.stringify(oauthHookEvent({ scope: "openid" }))]
    ),
    /Credencial OAuth invalida/u
  );
});

test("RPC resolve aliases somente para sessão, cliente e consentimento vivos", async () => {
  const database = await oauthPrincipalDatabase();
  const hooked = await database.query(
    "select public.aralearn_mcp_access_token_hook($1::jsonb) value",
    [JSON.stringify(oauthHookEvent())]
  );
  const claims = hooked.rows[0].value.claims;
  await database.exec("select set_config('request.jwt.claim.role','service_role',false)");

  const resolve = () => database.query(`
    select public.resolve_mcp_oauth_principal_v1(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid
    ) value
  `, [claims.sub, claims.session_id, OAUTH_CLIENT, OAUTH_SESSION]);
  let result = await resolve();
  assert.deepEqual(result.rows[0].value, {
    contract: "aralearn.mcp-oauth-principal.v1",
    actorId: OWNER,
    oauthClientId: OAUTH_CLIENT
  });

  const wrongAlias = "90000000-0000-5000-8000-000000000001";
  await assert.rejects(
    database.query(`select public.resolve_mcp_oauth_principal_v1(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid
    )`, [wrongAlias, claims.session_id, OAUTH_CLIENT, OAUTH_SESSION]),
    /Credencial OAuth indisponivel/u
  );

  await database.exec(`
    update auth.oauth_consents set revoked_at=now()
    where client_id='${OAUTH_CLIENT}'
  `);
  await assert.rejects(resolve(), /Credencial OAuth indisponivel/u);
  await database.exec(`
    update auth.oauth_consents set revoked_at=null;
    update auth.sessions set scopes='openid'
    where id='${OAUTH_SESSION}'
  `);
  await assert.rejects(resolve(), /Credencial OAuth indisponivel/u);
  await database.exec(`
    update auth.sessions set scopes='offline_access',not_after=now()-interval '1 second'
    where id='${OAUTH_SESSION}'
  `);
  await assert.rejects(resolve(), /Credencial OAuth indisponivel/u);

  const privileges = await database.query(`
    select
      has_function_privilege(
        'service_role','public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)','EXECUTE'
      ) service_can_execute,
      has_function_privilege(
        'authenticated','public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)','EXECUTE'
      ) authenticated_can_execute,
      has_function_privilege(
        'anon','public.resolve_mcp_oauth_principal_v1(uuid,uuid,uuid,uuid)','EXECUTE'
      ) anon_can_execute
  `);
  assert.deepEqual(privileges.rows[0], {
    service_can_execute: true,
    authenticated_can_execute: false,
    anon_can_execute: false
  });
});

test("corte OAuth revoga consentimentos e refresh tokens sem remover sessão comum", async () => {
  const database = new PGlite();
  const normalSession = "70000000-0000-4000-8000-000000000002";
  await database.exec(`
    create schema auth;
    create table auth.oauth_consents(
      id uuid primary key,
      revoked_at timestamptz
    );
    create table auth.sessions(
      id uuid primary key,
      oauth_client_id uuid
    );
    create table auth.refresh_tokens(
      id bigint primary key,
      session_id uuid references auth.sessions(id) on delete cascade
    );
    insert into auth.oauth_consents(id) values
      ('80000000-0000-4000-8000-000000000001'),
      ('80000000-0000-4000-8000-000000000002');
    insert into auth.sessions(id,oauth_client_id) values
      ('${OAUTH_SESSION}','${OAUTH_CLIENT}'),
      ('${normalSession}',null);
    insert into auth.refresh_tokens(id,session_id) values
      (1,'${OAUTH_SESSION}'),(2,'${normalSession}');
  `);
  await database.exec(await migrationSlice(
    "update auth.oauth_consents consent_value",
    "do $current_data_lifecycle_postflight$"
  ));
  const state = await database.query(`
    select
      (select count(*)::integer from auth.oauth_consents
        where revoked_at is null) active_consents,
      (select jsonb_agg(id order by id) from auth.sessions) sessions,
      (select jsonb_agg(id order by id) from auth.refresh_tokens) refresh_tokens
  `);
  assert.deepEqual(state.rows[0], {
    active_consents: 0,
    sessions: [normalSession],
    refresh_tokens: [2]
  });
});

async function grantDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema extensions;

    create table auth.users(
      id uuid primary key,
      email text unique
    );
    create table public.person_profiles(
      user_id uuid primary key references auth.users(id) on delete cascade,
      display_name text,
      avatar_object_key text
    );
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      revision bigint not null default 1
    );
    create table public.course_access(
      course_id uuid not null references public.courses(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      granted_by uuid not null references auth.users(id),
      primary key(course_id,user_id)
    );
    create table private.course_change_receipts(
      actor_id uuid not null,
      request_id text not null,
      operation text not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      request_hash text not null,
      result jsonb not null,
      expires_at timestamptz not null default now() + interval '1 day',
      primary key(actor_id,request_id)
    );
    create table private.course_events(
      id bigint generated always as identity primary key,
      course_id uuid not null references public.courses(id) on delete cascade,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id) on delete set null
    );

    create function private.require_service_role()
    returns void language plpgsql as $$begin return; end$$;
    create function private.require_course_access_v1(
      p_course_id uuid,p_actor_id uuid,p_require_owner boolean
    ) returns boolean language plpgsql stable as $$
    begin
      if not exists(
        select 1 from public.courses
        where id=p_course_id and owner_id=p_actor_id
      ) then
        raise exception 'Curso inacessível.' using errcode='PT404';
      end if;
      return true;
    end $$;
    create function extensions.digest(p_value bytea,p_algorithm text)
    returns bytea language sql immutable as $$
      select decode(md5(encode(p_value,'hex'))||md5(encode(p_value,'hex')),'hex')
    $$;

    insert into auth.users(id,email) values
      ('${OWNER}','owner@example.test'),
      ('${TARGET}','target@example.test');
    insert into public.person_profiles(user_id,display_name) values
      ('${OWNER}','Owner'),('${TARGET}','Target');
    insert into public.courses(id,owner_id,revision)
    values('${COURSE}','${OWNER}',4);
  `);
  await database.exec(await migrationSlice(
    "create table private.course_access_grant_rate_limits(",
    "-- O token de acesso e autocontido."
  ));
  return database;
}

async function grant(database, requestId, targetEmail) {
  const result = await database.query(`
    select public.manage_course_access_for_actor_v1(
      $1,$2,'grant_access',$3,null,true,$4
    ) value
  `, [OWNER, COURSE, targetEmail, requestId]);
  return result.rows[0].value;
}

test("concessão não expõe existência da conta e limita tentativas sem guardar e-mail", async () => {
  const database = await grantDatabase();
  const expected = {
    contract: "aralearn.course-access-grant-request.v1",
    courseId: COURSE,
    operation: "grant_access",
    accepted: true,
    idempotent: false
  };

  assert.deepEqual(await grant(database, "grant-01", "target@example.test"), expected);
  assert.deepEqual(await grant(database, "grant-02", "missing@example.test"), expected);
  assert.deepEqual(await grant(database, "grant-03", "owner@example.test"), expected);
  assert.deepEqual(await grant(database, "grant-04", "target@example.test"), expected);
  for (let index = 5; index <= 11; index += 1) {
    assert.deepEqual(
      await grant(database, `grant-${String(index).padStart(2, "0")}`, `missing-${index}@example.test`),
      expected
    );
  }

  assert.deepEqual(
    await grant(database, "grant-01", "another-target@example.test"),
    { ...expected, idempotent: true }
  );

  const access = await database.query("select user_id from public.course_access");
  assert.deepEqual(access.rows, [{ user_id: TARGET }]);
  const events = await database.query("select summary from private.course_events");
  assert.equal(events.rows.length, 1);
  assert.deepEqual(events.rows[0].summary, { targetUserId: TARGET });

  const rate = await database.query(`
    select attempt_count,granted_count,no_match_count,unchanged_count,rate_limited_count
    from private.course_access_grant_rate_limits where actor_id=$1
  `, [OWNER]);
  assert.deepEqual(rate.rows[0], {
    attempt_count: 11,
    granted_count: 1,
    no_match_count: 7,
    unchanged_count: 2,
    rate_limited_count: 1
  });

  const receipts = await database.query(`
    select count(*)::integer receipt_count,
      count(distinct request_hash)::integer hash_count,
      bool_or(result::text like '%@%') contains_email
    from private.course_change_receipts
  `);
  assert.deepEqual(receipts.rows[0], {
    receipt_count: 11,
    hash_count: 1,
    contains_email: false
  });
});



test("sessão ativa considera também not_after", async () => {
  const database = new PGlite();
  const sessionId = "70000000-0000-4000-8000-000000000001";
  await database.exec(`
    create schema auth;
    create schema private;
    create table auth.users(
      id uuid primary key,
      deleted_at timestamptz,
      banned_until timestamptz,
      is_anonymous boolean not null default false
    );
    create table auth.sessions(
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      not_after timestamptz
    );
    create table public.person_profiles(
      user_id uuid primary key references auth.users(id) on delete cascade
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims',true),'')::jsonb,
        '{}'::jsonb
      )
    $$;
    insert into auth.users(id) values('${OWNER}');
    insert into public.person_profiles(user_id) values('${OWNER}');
    insert into auth.sessions(id,user_id,not_after)
    values('${sessionId}','${OWNER}',now()+interval '1 hour');
    select set_config('request.jwt.claim.sub','${OWNER}',false);
    select set_config(
      'request.jwt.claims',
      '{"sub":"${OWNER}","session_id":"${sessionId}"}',
      false
    );
  `);
  await database.exec(await migrationSlice(
    "create function private.current_auth_session_is_active_v1()",
    "revoke all on function private.current_auth_session_is_active_v1()"
  ));

  let result = await database.query(
    "select private.current_auth_session_is_active_v1() value"
  );
  assert.equal(result.rows[0].value, true);
  await database.exec(`
    update auth.sessions set not_after=now()-interval '1 second'
    where id='${sessionId}'
  `);
  result = await database.query(
    "select private.current_auth_session_is_active_v1() value"
  );
  assert.equal(result.rows[0].value, false);
  await database.exec(`
    update auth.sessions set not_after=now()+interval '1 hour'
    where id='${sessionId}';
    select set_config(
      'request.jwt.claims',
      '{"sub":"${OWNER}","session_id":"${sessionId}","client_id":"oauth-client"}',
      false
    )
  `);
  await assert.rejects(
    database.query("select private.current_auth_session_is_active_v1() value"),
    /somente o endpoint MCP/u
  );
  await database.exec(`
    select set_config(
      'request.jwt.claims',
      '{"sub":"${OWNER}","session_id":"${sessionId}"}',
      false
    );
    update auth.users set banned_until=now()+interval '1 hour'
    where id='${OWNER}'
  `);
  result = await database.query(
    "select private.current_auth_session_is_active_v1() value"
  );
  assert.equal(result.rows[0].value, false);
  await database.exec(`
    update auth.users set banned_until=null,is_anonymous=true
    where id='${OWNER}'
  `);
  result = await database.query(
    "select private.current_auth_session_is_active_v1() value"
  );
  assert.equal(result.rows[0].value, false);
  await database.exec(`
    update auth.users set is_anonymous=false,deleted_at=now()
    where id='${OWNER}'
  `);
  result = await database.query(
    "select private.current_auth_session_is_active_v1() value"
  );
  assert.equal(result.rows[0].value, false);
});

async function lifecycleDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema storage;

    create table auth.users(id uuid primary key);
    create table public.person_profiles(
      user_id uuid primary key references auth.users(id) on delete cascade,
      avatar_object_key text
    );
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      annotation_set_version bigint not null default 0
    );
    create table private.course_anchored_annotations(
      id uuid primary key,
      course_id uuid not null references public.courses(id) on delete cascade,
      actor_id uuid references auth.users(id) on delete set null,
      hard_delete_after timestamptz
    );
    create table private.course_anchored_annotation_viewer_versions(
      course_id uuid not null references public.courses(id) on delete cascade,
      actor_id uuid not null references auth.users(id) on delete cascade,
      version bigint not null default 0,
      primary key(course_id,actor_id)
    );
    create table private.course_anchored_annotation_receipts(
      actor_id uuid not null,
      request_id text not null,
      expires_at timestamptz not null,
      primary key(actor_id,request_id)
    );
    create table private.course_change_receipts(
      actor_id uuid not null,
      request_id text not null,
      expires_at timestamptz not null,
      primary key(actor_id,request_id)
    );
    create table private.course_personal_state_receipts(
      user_id uuid not null,
      request_id uuid not null,
      expires_at timestamptz not null,
      primary key(user_id,request_id)
    );
    create table private.course_source_pdf_upload_intents(
      actor_id uuid not null,
      course_id uuid not null,
      storage_path text not null,
      expires_at timestamptz not null,
      primary key(actor_id,course_id,storage_path)
    );
    create table private.course_access_grant_rate_limits(
      actor_id uuid primary key,
      window_started_at timestamptz not null
    );
    create table private.course_source_attachments(storage_path text primary key);
    create table private.authoring_action_oauth_authorizations(expires_at timestamptz not null);
    create table private.authoring_action_oauth_tokens(
      expires_at timestamptz not null,
      revoked_at timestamptz
    );
    create table storage.objects(
      id bigint generated always as identity primary key,
      bucket_id text not null,
      name text not null,
      unique(bucket_id,name)
    );
  `);
  await database.exec(await migrationSlice(
    "create function private.run_current_data_retention_v1",
    "-- Supabase Cron e suportado"
  ));
  return database;
}

test("retenção é limitada e idempotente; inventário de órfãos não exclui objetos", async () => {
  const database = await lifecycleDatabase();
  const annotationA = "30000000-0000-4000-8000-000000000001";
  const annotationB = "30000000-0000-4000-8000-000000000002";
  const annotationLive = "30000000-0000-4000-8000-000000000003";
  await database.exec(`
    insert into auth.users(id) values('${OWNER}');
    insert into public.person_profiles(user_id,avatar_object_key)
    values('${OWNER}','${OWNER}/linked.webp');
    insert into public.courses(id,owner_id,annotation_set_version)
    values('${COURSE}','${OWNER}',8);
    insert into private.course_anchored_annotations(id,course_id,actor_id,hard_delete_after)
    values
      ('${annotationA}','${COURSE}','${OWNER}',now()-interval '2 days'),
      ('${annotationB}','${COURSE}','${OWNER}',now()-interval '1 day'),
      ('${annotationLive}','${COURSE}','${OWNER}',now()+interval '1 day');
    insert into private.course_anchored_annotation_viewer_versions(course_id,actor_id,version)
    values('${COURSE}','${OWNER}',5);
    insert into private.course_anchored_annotation_receipts(actor_id,request_id,expires_at)
    values('${OWNER}','annotation-old-1',now()-interval '2 days'),
      ('${OWNER}','annotation-old-2',now()-interval '1 day'),
      ('${OWNER}','annotation-live',now()+interval '1 day');
    insert into private.course_change_receipts(actor_id,request_id,expires_at)
    values('${OWNER}','change-old-1',now()-interval '2 days'),
      ('${OWNER}','change-old-2',now()-interval '1 day'),
      ('${OWNER}','change-live',now()+interval '1 day');
    insert into private.course_personal_state_receipts(user_id,request_id,expires_at)
    values('${OWNER}','40000000-0000-4000-8000-000000000001',now()-interval '2 days'),
      ('${OWNER}','40000000-0000-4000-8000-000000000002',now()-interval '1 day'),
      ('${OWNER}','40000000-0000-4000-8000-000000000003',now()+interval '1 day');
    insert into private.course_source_pdf_upload_intents(actor_id,course_id,storage_path,expires_at)
    values('${OWNER}','${COURSE}','old-1',now()-interval '2 days'),
      ('${OWNER}','${COURSE}','old-2',now()-interval '1 day'),
      ('${OWNER}','${COURSE}','live',now()+interval '1 day');
    insert into private.course_access_grant_rate_limits(actor_id,window_started_at)
    values
      ('50000000-0000-4000-8000-000000000001',now()-interval '32 days'),
      ('50000000-0000-4000-8000-000000000002',now()-interval '31 days'),
      ('50000000-0000-4000-8000-000000000003',now());
  `);

  const expectedRemoved = {
    withdrawnAnnotations: 1,
    anchoredAnnotationReceipts: 1,
    courseChangeReceipts: 1,
    personalStateReceipts: 1,
    pdfUploadIntents: 1,
    accessGrantWindows: 1
  };
  for (let run = 0; run < 2; run += 1) {
    const result = await database.query(
      "select private.run_current_data_retention_v1(1) value"
    );
    assert.deepEqual(result.rows[0].value.removed, expectedRemoved);
  }
  const idempotent = await database.query(
    "select private.run_current_data_retention_v1(1) value"
  );
  assert.deepEqual(idempotent.rows[0].value.removed, {
    withdrawnAnnotations: 0,
    anchoredAnnotationReceipts: 0,
    courseChangeReceipts: 0,
    personalStateReceipts: 0,
    pdfUploadIntents: 0,
    accessGrantWindows: 0
  });
  const versions = await database.query(`
    select course.annotation_set_version,viewer.version
    from public.courses course
    join private.course_anchored_annotation_viewer_versions viewer
      on viewer.course_id=course.id
  `);
  assert.deepEqual(versions.rows[0], { annotation_set_version: 10, version: 7 });

  await database.exec(`
    insert into storage.objects(bucket_id,name) values
      ('person-avatars','not-a-user/orphan.webp'),
      ('person-avatars','${OWNER}/unlinked.webp'),
      ('course-source-pdfs','60000000-0000-4000-8000-000000000001/a.pdf'),
      ('course-source-pdfs','${COURSE}/unlinked.pdf');
    insert into private.course_source_attachments(storage_path)
    values('${COURSE}/missing.pdf');
    insert into private.authoring_action_oauth_authorizations(expires_at)
    values(now()-interval '1 day');
    insert into private.authoring_action_oauth_tokens(expires_at,revoked_at)
    values(now()+interval '1 day',now()-interval '1 hour');
  `);
  const before = await database.query("select count(*)::integer value from storage.objects");
  const inventory = await database.query(
    "select private.inventory_current_data_orphans_v1(20) value"
  );
  assert.deepEqual(inventory.rows[0].value.counts, {
    avatar_owner_missing: 1,
    avatar_profile_unlinked: 1,
    pdf_course_missing: 1,
    pdf_unlinked: 1,
    pdf_object_missing: 1
  });
  assert.equal(inventory.rows[0].value.items.length, 5);
  assert.deepEqual(inventory.rows[0].value.legacyOAuth, {
    expiredAuthorizations: 1,
    expiredOrRevokedTokens: 1
  });
  const after = await database.query("select count(*)::integer value from storage.objects");
  assert.deepEqual(after.rows[0], before.rows[0]);
});
