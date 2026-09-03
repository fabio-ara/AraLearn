import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260903025658_harden_course_source_pdf_lifecycle.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";

const hash = (character) => character.repeat(64);
const path = (contentHash) => `${COURSE}/${contentHash}.pdf`;

async function hardenedDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;

    create table auth.users(id uuid primary key);
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      revision bigint not null default 1
    );
    create table private.course_sources(
      course_id uuid not null,
      source_id text not null,
      revision bigint not null default 1,
      primary key(course_id,source_id)
    );
    create table private.course_source_attachments(
      course_id uuid not null,
      source_id text not null,
      source_revision bigint not null,
      content_hash text not null,
      byte_size bigint not null,
      media_type text not null,
      storage_path text not null,
      status text not null default 'active',
      version bigint not null default 1,
      created_at timestamptz not null default statement_timestamp(),
      updated_at timestamptz not null default statement_timestamp(),
      removed_at timestamptz,
      removed_course_revision bigint,
      primary key(course_id,source_id,content_hash)
    );
    create table private.course_source_pdf_delete_intents(
      actor_id uuid not null,
      request_id text not null,
      course_id uuid not null,
      source_id text not null,
      content_hash text not null,
      storage_path text not null,
      state text not null default 'pending',
      created_at timestamptz not null default statement_timestamp(),
      updated_at timestamptz not null default statement_timestamp(),
      primary key(actor_id,request_id)
    );
    create table private.course_change_receipts(
      actor_id uuid not null,
      request_id text not null,
      operation text not null,
      course_id uuid not null,
      request_hash text not null,
      result jsonb not null,
      expires_at timestamptz not null default statement_timestamp()+interval '1 day',
      primary key(actor_id,request_id)
    );
    create table private.pdf_ingestion_core_calls(
      request_id text primary key
    );

    create function private.require_service_role()
    returns void language plpgsql set search_path='' as $$
    begin
      if current_setting('request.jwt.claim.role',true)
           is distinct from 'service_role' then
        raise exception 'service role required' using errcode='42501';
      end if;
    end $$;
    create function private.require_course_access_v1(
      p_course_id uuid,p_actor_id uuid,p_owner_only boolean
    ) returns void language plpgsql set search_path='' as $$
    begin
      if not exists(
        select 1 from public.courses course
        where course.id=p_course_id and course.owner_id=p_actor_id
      ) then
        raise exception 'Curso inexistente ou inacessível.' using errcode='PT404';
      end if;
    end $$;
    create function private.valid_course_source_pdf_file_identity_v1(p_value jsonb)
    returns boolean language sql immutable set search_path='' as $$
      select jsonb_typeof(p_value)='object'
        and jsonb_typeof(p_value->'fileId')='string'
    $$;
    create function private.course_source_json_hash_v1(p_value jsonb)
    returns text language sql immutable set search_path='' as $$
      select md5(p_value::text)
    $$;
    create function private.ingest_course_source_pdf_core_v1(
      p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
      p_source_intent jsonb,p_attachment jsonb,p_channel text,p_request_id text
    ) returns jsonb language plpgsql set search_path='' as $$
    declare v_revision bigint;
    begin
      insert into private.pdf_ingestion_core_calls(request_id) values(p_request_id);
      update public.courses course set revision=course.revision+1
      where course.id=p_course_id returning revision into v_revision;
      return jsonb_build_object(
        'contract','aralearn.course-source-pdf-ingestion.v1',
        'courseId',p_course_id,'courseRevision',v_revision,
        'requestId',p_request_id,'idempotent',false,'changed',true,
        'stored',true
      );
    end $$;
    create function private.guard_course_source_attachment_lifecycle_v1()
    returns trigger language plpgsql set search_path='' as $$
    begin return new; end $$;
    create trigger course_source_attachments_lifecycle_v1
      before insert or update or delete on private.course_source_attachments
      for each row execute function private.guard_course_source_attachment_lifecycle_v1();

    create function public.claim_course_source_pdf_delete_for_actor_v1(
      p_actor_id uuid,p_course_id uuid,p_request_id text
    ) returns jsonb language plpgsql volatile security definer
    set search_path='' as $$
    declare v_intent private.course_source_pdf_delete_intents%rowtype;
    begin
      perform private.require_service_role();
      perform private.require_course_access_v1(p_course_id,p_actor_id,true);
      select * into v_intent
      from private.course_source_pdf_delete_intents intent
      where intent.actor_id=p_actor_id and intent.course_id=p_course_id
        and intent.request_id=p_request_id
      for update;
      if not found then return null; end if;
      perform pg_advisory_xact_lock(hashtextextended(
        'course-source-pdf-object:'||v_intent.storage_path,0
      ));
      if exists(
        select 1 from private.course_source_attachments attachment
        where attachment.storage_path=v_intent.storage_path
          and attachment.status='active'
      ) then
        delete from private.course_source_pdf_delete_intents intent
        where intent.actor_id=p_actor_id and intent.request_id=p_request_id;
        return null;
      end if;
      update private.course_source_pdf_delete_intents intent
      set state='deleting',updated_at=statement_timestamp()
      where intent.actor_id=p_actor_id and intent.request_id=p_request_id;
      return jsonb_build_object('storagePath',v_intent.storage_path);
    end $$;
    revoke all on function public.claim_course_source_pdf_delete_for_actor_v1(
      uuid,uuid,text
    ) from public,anon,authenticated,service_role;
    grant execute on function public.claim_course_source_pdf_delete_for_actor_v1(
      uuid,uuid,text
    ) to service_role;

    create function public.ingest_course_source_pdf_for_actor_v1(
      uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text
    ) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $$
      select '{"schemaRevision":"20260902234800","contractVersion":1,
        "features":["course-source-pdf-access-lifecycle-v1"]}'::jsonb
    $$;

    insert into auth.users(id) values('${OWNER}'),('${OTHER}');
    insert into public.courses(id,owner_id) values('${COURSE}','${OWNER}');
    insert into private.course_sources(course_id,source_id) values
      ('${COURSE}','source-a'),('${COURSE}','source-b');
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  return database;
}

function ingestionArguments(requestId, fileId) {
  return [
    OWNER,
    COURSE,
    1,
    JSON.stringify({ mode: "existing", sourceId: "source-a", sourceRevision: 1 }),
    JSON.stringify({
      contentHash: hash("a"),
      byteSize: 128,
      mediaType: "application/pdf",
      storagePath: path(hash("a"))
    }),
    JSON.stringify({ fileId, fileName: "edital.pdf", mediaType: "application/pdf" }),
    "mcp",
    requestId
  ];
}

async function ingest(database, args) {
  return database.query(`
    select public.ingest_course_source_pdf_for_actor_v1(
      $1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::jsonb,$6::jsonb,$7::text,$8::text
    ) value
  `, args);
}

test("CAS serializa duas finalizações concorrentes e replay exato precede a revisão", async () => {
  const database = await hardenedDatabase();
  const firstArgs = ingestionArguments("pdf-concurrent-request-0001", "file-first");
  const secondArgs = ingestionArguments("pdf-concurrent-request-0002", "file-second");
  const attempts = await Promise.allSettled([
    ingest(database, firstArgs),
    ingest(database, secondArgs)
  ]);
  const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(String(rejected[0].reason), /Curso mudou; releia antes de incorporar/u);
  assert.equal((await database.query(`
    select count(*)::integer value from private.pdf_ingestion_core_calls
  `)).rows[0].value, 1);
  assert.equal((await database.query(`
    select revision from public.courses where id=$1
  `, [COURSE])).rows[0].revision, 2);

  const winnerArgs = fulfilled[0] === attempts[0] ? firstArgs : secondArgs;
  const replay = (await ingest(database, winnerArgs)).rows[0].value;
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 2);
  assert.equal((await database.query(`
    select count(*)::integer value from private.pdf_ingestion_core_calls
  `)).rows[0].value, 1);
});

test("claim por Fonte descarta intent novamente ativo e retoma o próximo", async () => {
  const database = await hardenedDatabase();
  const activeHash = hash("a");
  const pendingHash = hash("b");
  const unrelatedHash = hash("z");
  await database.query(`
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,byte_size,media_type,
      storage_path,status
    ) values($1,'source-a',1,$2,128,'application/pdf',$3,'active')
  `, [COURSE, activeHash, path(activeHash)]);
  await database.query(`
    insert into private.course_source_pdf_delete_intents(
      actor_id,request_id,course_id,source_id,content_hash,storage_path
    ) values
      ($1,'delete-active-request-0001',$2,'source-a',$3,$4),
      ($1,'delete-pending-request-0002',$2,'source-a',$5,$6),
      ($1,'delete-other-request-0003',$2,'source-b',$7,$8)
  `, [
    OWNER, COURSE,
    activeHash, path(activeHash),
    pendingHash, path(pendingHash),
    unrelatedHash, path(unrelatedHash)
  ]);

  const claimed = (await database.query(`
    select public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
      $1,$2,'source-a'
    ) value
  `, [OWNER, COURSE])).rows[0].value;
  assert.deepEqual(claimed, {
    requestId: "delete-pending-request-0002",
    storagePath: path(pendingHash)
  });
  assert.deepEqual((await database.query(`
    select request_id "requestId",state from private.course_source_pdf_delete_intents
    order by request_id
  `)).rows, [
    { requestId: "delete-other-request-0003", state: "pending" },
    { requestId: "delete-pending-request-0002", state: "deleting" }
  ]);

  const repeated = (await database.query(`
    select public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
      $1,$2,'source-a'
    ) value
  `, [OWNER, COURSE])).rows[0].value;
  assert.deepEqual(repeated, claimed);
  await database.query(`
    delete from private.course_source_pdf_delete_intents
    where actor_id=$1 and request_id=$2
  `, [OWNER, claimed.requestId]);
  assert.equal((await database.query(`
    select public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
      $1,$2,'source-a'
    ) value
  `, [OWNER, COURSE])).rows[0].value, null);
});

test("INSERT ativo e reativação tomam o lock do path antes de aceitar vínculo", async () => {
  const database = await hardenedDatabase();
  const insertHash = hash("c");
  const reactivateHash = hash("d");
  await database.query(`
    insert into private.course_source_pdf_delete_intents(
      actor_id,request_id,course_id,source_id,content_hash,storage_path
    ) values($1,'delete-insert-request-0001',$2,'source-a',$3,$4)
  `, [OWNER, COURSE, insertHash, path(insertHash)]);
  await assert.rejects(database.query(`
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,byte_size,media_type,
      storage_path,status
    ) values($1,'source-a',1,$2,128,'application/pdf',$3,'active')
  `, [COURSE, insertHash, path(insertHash)]), /remoção física deste PDF/u);

  await database.query(`
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,byte_size,media_type,
      storage_path,status,removed_at,removed_course_revision
    ) values(
      $1,'source-a',1,$2,128,'application/pdf',$3,'removed',now(),1
    )
  `, [COURSE, reactivateHash, path(reactivateHash)]);
  await database.query(`
    insert into private.course_source_pdf_delete_intents(
      actor_id,request_id,course_id,source_id,content_hash,storage_path
    ) values($1,'delete-reactivate-0002',$2,'source-a',$3,$4)
  `, [OWNER, COURSE, reactivateHash, path(reactivateHash)]);
  await assert.rejects(database.query(`
    update private.course_source_attachments
    set status='active',version=version+1,updated_at=clock_timestamp(),
      removed_at=null,removed_course_revision=null
    where course_id=$1 and source_id='source-a' and content_hash=$2
  `, [COURSE, reactivateHash]), /remoção física deste PDF/u);

  const definition = (await database.query(`
    select pg_get_functiondef(
      'private.guard_course_source_attachment_lifecycle_v1()'::regprocedure
    ) value
  `)).rows[0].value;
  assert.equal(definition.match(/course-source-pdf-object:/gu)?.length, 2);
});

test("RPC de retomada permanece service-role-only e owner-safe", async () => {
  const database = await hardenedDatabase();
  const privileges = (await database.query(`
    select
      has_function_privilege(
        'service_role',
        'public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(uuid,uuid,text)',
        'EXECUTE'
      ) "serviceCanClaim",
      has_function_privilege(
        'authenticated',
        'public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(uuid,uuid,text)',
        'EXECUTE'
      ) "authenticatedCanClaim",
      has_function_privilege(
        'anon',
        'public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(uuid,uuid,text)',
        'EXECUTE'
      ) "anonCanClaim"
  `)).rows[0];
  assert.deepEqual(privileges, {
    serviceCanClaim: true,
    authenticatedCanClaim: false,
    anonCanClaim: false
  });
  await assert.rejects(database.query(`
    select public.claim_pending_course_source_pdf_delete_for_source_for_actor_v1(
      $1,$2,'source-a'
    )
  `, [OTHER, COURSE]), /Curso inexistente ou inacessível/u);
});
