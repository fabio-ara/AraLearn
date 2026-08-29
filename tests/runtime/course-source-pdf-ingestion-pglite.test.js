import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260829043629_course_source_pdf_ingestion.sql",
  import.meta.url
);
const receiptReplayMigrationUrl = new URL(
  "../../supabase/migrations/20260829205000_course_source_pdf_ingestion_receipt_replay.sql",
  import.meta.url
);

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const COURSE = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

function sourceDocument(overrides = {}) {
  return {
    kind: "document",
    title: "Manual sintético",
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: "pt-BR",
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "private",
    verificationStatus: "author_verified",
    studyVisibility: "hidden",
    ...overrides
  };
}

function existing(sourceId = "source-a", sourceRevision = 1) {
  return { mode: "existing", sourceId, sourceRevision };
}

function save(sourceId, expectedSourceRevision, source) {
  return { mode: "save", sourceId, expectedSourceRevision, source };
}

function attachment(courseId, hash, byteSize) {
  return {
    contentHash: hash,
    byteSize,
    mediaType: "application/pdf",
    storagePath: `${courseId}/${hash}.pdf`
  };
}

function fileIdentity(fileId = "file-pdf-a", fileName = "edital.pdf") {
  return { fileId, fileName, mediaType: "application/pdf" };
}

async function actor(database, actorId = OWNER, role = "service_role") {
  await database.query("select set_config('test.actor',$1,false)", [actorId]);
  await database.query("select set_config('test.role',$1,false)", [role]);
}

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function databaseFixture() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema storage;

    create table auth.users(id uuid primary key);
    insert into auth.users(id) values('${OWNER}'),('${OTHER}');

    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      revision bigint not null,
      updated_at timestamptz not null default now()
    );
    insert into public.courses(id,owner_id,revision) values
      ('${COURSE}','${OWNER}',5),
      ('${VARIANT}','${OWNER}',1);

    create function private.request_role() returns text
    language sql stable as $$
      select nullif(current_setting('test.role',true),'')
    $$;
    create function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('test.actor',true),'')::uuid
    $$;
    create function private.lock_current_account_storage_write_v1()
    returns boolean language sql volatile as $$ select true $$;
    create function private.can_upload_course_source_pdf_v1(text,jsonb)
    returns boolean language sql volatile security definer as $$ select false $$;
    revoke all on function private.can_upload_course_source_pdf_v1(text,jsonb)
    from public,anon,authenticated,service_role;
    grant execute on function private.can_upload_course_source_pdf_v1(text,jsonb)
    to authenticated;
    create function private.require_service_role() returns void
    language plpgsql stable as $$
    begin
      if private.request_role() is distinct from 'service_role' then
        raise exception 'service role obrigatório' using errcode='42501';
      end if;
    end $$;
    create function private.require_course_access_v1(
      p_course_id uuid,p_actor_id uuid,p_write boolean
    ) returns void language plpgsql stable as $$
    begin
      if not exists(
        select 1 from public.courses course
        where course.id=p_course_id and course.owner_id=p_actor_id
      ) then
        raise exception 'Acesso negado.' using errcode='42501';
      end if;
    end $$;
    create function private.course_source_json_hash_v1(p_value jsonb)
    returns text language sql immutable as $$
      select md5(p_value::text)||md5(reverse(p_value::text))
    $$;
    create function private.valid_course_source_publication_date_v1(p_value text)
    returns boolean language sql immutable as $$
      select p_value is null or p_value~'^[1-9][0-9]{3}(-[0-1][0-9](-[0-3][0-9])?)?$'
    $$;

    create table private.course_source_revisions(
      course_id uuid not null references public.courses(id) on delete cascade,
      source_id text not null,
      revision bigint not null,
      status text not null,
      kind text,
      title text,
      authorship text,
      publication_date text,
      identifier text,
      language text,
      citation_text text,
      url text,
      edition_or_version text,
      origin text not null,
      availability text not null,
      verification_status text not null,
      study_visibility text not null,
      actor_id uuid references auth.users(id),
      created_at timestamptz not null default now(),
      primary key(course_id,source_id,revision)
    );
    insert into private.course_source_revisions(
      course_id,source_id,revision,status,kind,title,authorship,publication_date,
      identifier,language,citation_text,url,edition_or_version,origin,
      availability,verification_status,study_visibility,actor_id
    ) values
      ('${COURSE}','source-a',1,'active','document','Manual sintético',null,null,
       null,'pt-BR',null,null,null,'author_provided','private','author_verified',
       'hidden','${OWNER}'),
      ('${COURSE}','source-b',1,'active','document','Manual sintético',null,null,
       null,'pt-BR',null,null,null,'author_provided','private','author_verified',
       'hidden','${OWNER}'),
      ('${VARIANT}','source-a',1,'active','document','Manual sintético',null,null,
       null,'pt-BR',null,null,null,'author_provided','private','author_verified',
       'hidden','${OWNER}');

    create table private.course_source_attachments(
      course_id uuid not null references public.courses(id) on delete cascade,
      source_id text not null,
      source_revision bigint not null,
      content_hash text not null,
      byte_size bigint not null,
      media_type text not null,
      storage_path text not null,
      actor_id uuid references auth.users(id),
      created_at timestamptz not null default now(),
      primary key(course_id,source_id,source_revision,content_hash)
    );
    create table storage.objects(
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      metadata jsonb,
      unique(bucket_id,name)
    );
    create table private.course_source_pdf_upload_intents(
      actor_id uuid not null references auth.users(id),
      course_id uuid not null references public.courses(id) on delete cascade,
      storage_path text not null,
      content_hash text not null,
      byte_size bigint not null,
      media_type text not null,
      source_id text not null,
      source_revision bigint not null,
      course_revision bigint not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now()+interval '10 minutes',
      primary key(actor_id,course_id,storage_path),
      constraint course_source_pdf_upload_intents_values_v1 check(
        storage_path=course_id::text||'/'||content_hash||'.pdf'
        and content_hash~'^[a-f0-9]{64}$'
        and byte_size between 1 and 20971520
        and media_type='application/pdf'
        and char_length(source_id) between 1 and 2048
        and source_id!~'[[:cntrl:]]'
        and source_revision>0 and course_revision>0
      )
    );
    create table private.course_change_receipts(
      actor_id uuid not null,
      request_id text not null,
      operation text not null,
      course_id uuid not null,
      request_hash text not null,
      result jsonb not null,
      expires_at timestamptz not null default now()+interval '1 day',
      primary key(actor_id,request_id),
      constraint course_change_receipts_operation_v9 check(operation in(
        'create_course','commit_course_composition','commit_instructional_plan',
        'advance_authoring_part_materialization','apply_course_design_command',
        'execute_course_source_command','grant_access','revoke_access',
        'update_audit_cycle','create_course_variants','detach_course_variant',
        'commit_personal_course_copy_edit','create_inspection_focus'
      ))
    );

    create function private.valid_course_source_pdf_object_v1(
      p_storage_path text,p_byte_size bigint,p_media_type text
    ) returns boolean language sql stable as $$
      select exists(
        select 1 from storage.objects object_value
        where object_value.bucket_id='course-source-pdfs'
          and object_value.name=p_storage_path
          and (object_value.metadata->>'size')::bigint=p_byte_size
          and object_value.metadata->>'mimetype'=p_media_type
      )
    $$;
    create function private.course_source_pdf_reserved_bytes_v1(p_course_id uuid)
    returns bigint language sql stable as $$
      with reservations as(
        select content_hash,byte_size
        from private.course_source_attachments where course_id=p_course_id
        union all
        select split_part(split_part(name,'/',2),'.',1),
          (metadata->>'size')::bigint
        from storage.objects
        where bucket_id='course-source-pdfs'
          and name like p_course_id::text||'/%'
        union all
        select content_hash,byte_size
        from private.course_source_pdf_upload_intents
        where course_id=p_course_id and expires_at>statement_timestamp()
      ), unique_reservations as(
        select content_hash,max(byte_size) byte_size
        from reservations group by content_hash
      )
      select coalesce(sum(byte_size),0)::bigint from unique_reservations
    $$;

    create function public.execute_course_source_command_for_actor_v1(
      p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
      p_command jsonb,p_channel text,p_request_id text
    ) returns jsonb language plpgsql security definer as $$
    declare
      v_receipt private.course_change_receipts%rowtype;
      v_course_revision bigint;
      v_latest_revision bigint;
      v_result jsonb;
      v_hash text:=private.course_source_json_hash_v1(p_command);
    begin
      perform private.require_service_role();
      perform private.require_course_access_v1(p_course_id,p_actor_id,true);
      select * into v_receipt from private.course_change_receipts
      where actor_id=p_actor_id and request_id=p_request_id;
      if found then
        if v_receipt.request_hash<>v_hash then
          raise exception 'request incompatível' using errcode='23514';
        end if;
        return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
      end if;
      select revision into strict v_course_revision from public.courses
      where id=p_course_id for update;
      if v_course_revision<>p_expected_revision then
        raise exception 'Curso mudou.' using errcode='40001';
      end if;
      select max(revision) into v_latest_revision from private.course_source_revisions
      where course_id=p_course_id and source_id=p_command->>'sourceId';
      if coalesce(v_latest_revision,0)<>(p_command->>'expectedSourceRevision')::bigint then
        raise exception 'Fonte mudou.' using errcode='40001';
      end if;
      insert into private.course_source_revisions(
        course_id,source_id,revision,status,kind,title,authorship,publication_date,
        identifier,language,citation_text,url,edition_or_version,origin,
        availability,verification_status,study_visibility,actor_id
      ) values(
        p_course_id,p_command->>'sourceId',coalesce(v_latest_revision,0)+1,'active',
        p_command#>>'{source,kind}',p_command#>>'{source,title}',
        p_command#>>'{source,authorship}',p_command#>>'{source,publicationDate}',
        p_command#>>'{source,identifier}',p_command#>>'{source,language}',
        p_command#>>'{source,citationText}',p_command#>>'{source,url}',
        p_command#>>'{source,editionOrVersion}',p_command#>>'{source,origin}',
        p_command#>>'{source,availability}',p_command#>>'{source,verificationStatus}',
        p_command#>>'{source,studyVisibility}',p_actor_id
      );
      update public.courses set revision=revision+1 where id=p_course_id
      returning revision into v_course_revision;
      v_result:=jsonb_build_object(
        'courseRevision',v_course_revision,'changed',true,'idempotent',false
      );
      insert into private.course_change_receipts(
        actor_id,request_id,operation,course_id,request_hash,result
      ) values(p_actor_id,p_request_id,'execute_course_source_command',p_course_id,v_hash,v_result);
      return v_result;
    end $$;

    create function public.attach_course_source_pdf_for_actor_v1(
      p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,
      p_command jsonb,p_channel text,p_request_id text
    ) returns jsonb language plpgsql security definer as $$
    declare
      v_receipt private.course_change_receipts%rowtype;
      v_course_revision bigint;
      v_changed boolean:=false;
      v_result jsonb;
      v_hash text:=private.course_source_json_hash_v1(p_command);
    begin
      perform private.require_service_role();
      perform private.require_course_access_v1(p_course_id,p_actor_id,true);
      select * into v_receipt from private.course_change_receipts
      where actor_id=p_actor_id and request_id=p_request_id;
      if found then
        if v_receipt.request_hash<>v_hash then
          raise exception 'request incompatível' using errcode='23514';
        end if;
        return (v_receipt.result-'idempotent')||jsonb_build_object('idempotent',true);
      end if;
      select revision into strict v_course_revision from public.courses
      where id=p_course_id for update;
      if v_course_revision<>p_expected_revision then
        raise exception 'Curso mudou.' using errcode='40001';
      end if;
      if current_setting('test.fail_attach',true)='on' then
        raise exception 'Falha sintética de vínculo.' using errcode='55000';
      end if;
      if not private.valid_course_source_pdf_object_v1(
        p_command#>>'{attachment,storagePath}',
        (p_command#>>'{attachment,byteSize}')::bigint,
        p_command#>>'{attachment,mediaType}'
      ) then
        raise exception 'Objeto ausente.' using errcode='23514';
      end if;
      if not exists(
        select 1 from private.course_source_revisions source
        where source.course_id=p_course_id
          and source.source_id=p_command->>'sourceId'
          and source.revision=(p_command->>'sourceRevision')::bigint
          and source.status='active'
          and not exists(
            select 1 from private.course_source_revisions newer
            where newer.course_id=source.course_id and newer.source_id=source.source_id
              and newer.revision>source.revision
          )
      ) then
        raise exception 'Fonte não corrente.' using errcode='23514';
      end if;
      if not exists(
        select 1 from private.course_source_attachments attachment
        where attachment.course_id=p_course_id
          and attachment.source_id=p_command->>'sourceId'
          and attachment.source_revision=(p_command->>'sourceRevision')::bigint
          and attachment.content_hash=p_command#>>'{attachment,contentHash}'
      ) then
        insert into private.course_source_attachments(
          course_id,source_id,source_revision,content_hash,byte_size,media_type,
          storage_path,actor_id
        ) values(
          p_course_id,p_command->>'sourceId',(p_command->>'sourceRevision')::bigint,
          p_command#>>'{attachment,contentHash}',
          (p_command#>>'{attachment,byteSize}')::bigint,
          p_command#>>'{attachment,mediaType}',p_command#>>'{attachment,storagePath}',
          p_actor_id
        );
        update public.courses set revision=revision+1 where id=p_course_id
        returning revision into v_course_revision;
        v_changed:=true;
      end if;
      v_result:=jsonb_build_object(
        'courseRevision',v_course_revision,'changed',v_changed,'idempotent',false
      );
      insert into private.course_change_receipts(
        actor_id,request_id,operation,course_id,request_hash,result
      ) values(p_actor_id,p_request_id,'execute_course_source_command',p_course_id,v_hash,v_result);
      return v_result;
    end $$;

    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable as $$
      select '{"schemaRevision":"20260828120000","features":[]}'::jsonb
    $$;
  `);
  const migration = await fs.readFile(migrationUrl, "utf8");
  await database.exec(migration);
  const receiptReplayMigration = await fs.readFile(receiptReplayMigrationUrl, "utf8");
  await database.exec(receiptReplayMigration);
  await actor(database);
  return database;
}

async function storeObject(database, courseId, hash, byteSize) {
  await database.query(`
    insert into storage.objects(bucket_id,name,metadata)
    values('course-source-pdfs',$1,$2)
    on conflict(bucket_id,name) do nothing
  `, [
    `${courseId}/${hash}.pdf`,
    JSON.stringify({ size: String(byteSize), mimetype: "application/pdf" })
  ]);
}

async function prepare(database, {
  actorId = OWNER,
  expectedRevision = 5,
  sourceIntent = existing(),
  hash = HASH_A,
  byteSize = 1_024,
  requestId = "pdf-request-a"
} = {}) {
  return scalar(database, `
    select public.prepare_course_source_pdf_ingestion_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application/pdf',$7
    ) value
  `, [
    actorId, COURSE, expectedRevision, JSON.stringify(sourceIntent), hash,
    byteSize, requestId
  ]);
}

async function ingest(database, {
  expectedRevision = 5,
  sourceIntent = existing(),
  pdf = attachment(COURSE, HASH_A, 1_024),
  identity = fileIdentity(),
  requestId = "pdf-request-a"
} = {}) {
  return scalar(database, `
    select public.ingest_course_source_pdf_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application',$7
    ) value
  `, [
    OWNER, COURSE, expectedRevision, JSON.stringify(sourceIntent),
    JSON.stringify(pdf), JSON.stringify(identity), requestId
  ]);
}

async function ingestionReceipt(database, {
  expectedRevision = 5,
  sourceIntent = existing(),
  identity = fileIdentity(),
  requestId = "pdf-request-a"
} = {}) {
  return scalar(database, `
    select public.get_course_source_pdf_ingestion_receipt_for_actor_v1(
      $1,$2,$3,$4,$5,'application',$6
    ) value
  `, [
    OWNER, COURSE, expectedRevision, JSON.stringify(sourceIntent),
    JSON.stringify(identity), requestId
  ]);
}

test("#220 instala RPCs service-only, manifesto, autorização e CAS", async () => {
  const database = await databaseFixture();
  const manifest = await scalar(database, "select public.get_aralearn_runtime_manifest() value");
  assert.equal(manifest.schemaRevision, "20260829205000");
  assert.ok(manifest.features.includes("course-source-pdf-ingestion-v1"));
  assert.ok(manifest.features.includes("course-source-pdf-ingestion-receipt-v1"));
  for (const signature of [
    "public.prepare_course_source_pdf_ingestion_for_actor_v1(uuid,uuid,bigint,jsonb,text,bigint,text,text)",
    "public.ingest_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text)",
    "public.get_course_source_pdf_ingestion_receipt_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text,text)",
    "public.cancel_course_source_pdf_ingestion_for_actor_v1(uuid,uuid,text,text)"
  ]) {
    const privileges = await database.query(`
      select has_function_privilege('service_role',$1,'execute') service,
        has_function_privilege('authenticated',$1,'execute') authenticated
    `, [signature]);
    assert.deepEqual(privileges.rows[0], { service: true, authenticated: false });
  }
  assert.equal(await scalar(database, `
    select to_regprocedure(
      'public.can_compensate_course_source_pdf_ingestion_for_actor_v1(uuid,uuid,text,text)'
    ) is null value
  `), true);
  assert.equal(await scalar(database, `
    select exists(
      select 1 from pg_constraint
      where conrelid='private.course_source_pdf_upload_intents'::regclass
        and conname='course_source_pdf_upload_intents_fingerprint_v1'
    ) value
  `), true);
  await assert.rejects(database.query(`
    insert into private.course_source_pdf_upload_intents(
      actor_id,course_id,storage_path,content_hash,byte_size,media_type,
      source_id,source_revision,course_revision,request_id
    ) values($1,$2,$3,$4,1024,'application/pdf','source-a',1,5,'pdf-no-fingerprint')
  `, [OWNER, COURSE, `${COURSE}/${HASH_D}.pdf`, HASH_D]),
  error => error.code === "23514");
  await actor(database, OWNER, "authenticated");
  await assert.rejects(prepare(database), error => error.code === "42501");
  await actor(database, OTHER, "service_role");
  await assert.rejects(
    prepare(database, { actorId: OTHER }),
    error => error.code === "42501"
  );
  await actor(database);
  await assert.rejects(
    prepare(database, { expectedRevision: 4 }),
    error => error.code === "40001"
  );
  await assert.rejects(
    prepare(database, {
      sourceIntent: save("new-source", 0, sourceDocument({ authorship: "" }))
    }),
    error => error.code === "22023"
  );
});

test("#220 prepara por request, deduplica por bytes e não confunde nome com identidade", async () => {
  const database = await databaseFixture();
  const first = await prepare(database);
  assert.deepEqual(first, {
    contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
    courseId: COURSE,
    courseRevision: 5,
    requestId: "pdf-request-a",
    sourceId: "source-a",
    sourceRevision: 1,
    attachment: attachment(COURSE, HASH_A, 1_024),
    uploadRequired: true,
    alreadyLinked: false
  });
  const retried = await prepare(database);
  assert.equal(retried.uploadRequired, true);
  await assert.rejects(
    prepare(database, { requestId: "pdf-request-b" }),
    error => error.code === "40001"
  );
  await storeObject(database, COURSE, HASH_A, 1_024);
  await assert.rejects(
    prepare(database, {
      sourceIntent: existing("source-b", 1),
      requestId: "pdf-request-b"
    }),
    error => error.code === "40001"
  );
  assert.equal(await scalar(database, `
    select public.cancel_course_source_pdf_ingestion_for_actor_v1(
      $1,$2,$3,'pdf-request-a'
    ) value
  `, [OWNER, COURSE, `${COURSE}/${HASH_A}.pdf`]), true);
  const deduplicated = await prepare(database, {
    sourceIntent: existing("source-b", 1),
    requestId: "pdf-request-b"
  });
  assert.equal(deduplicated.uploadRequired, false);
  assert.equal(deduplicated.attachment.contentHash, HASH_A);
  assert.equal(Object.hasOwn(deduplicated, "fileName"), false);
  const intent = await database.query(`
    select request_id,request_fingerprint from private.course_source_pdf_upload_intents
    where storage_path=$1
  `, [`${COURSE}/${HASH_A}.pdf`]);
  assert.equal(intent.rows[0].request_id, "pdf-request-b");
  assert.match(intent.rows[0].request_fingerprint, /^[a-f0-9]{64}$/u);
  await storeObject(database, COURSE, HASH_B, 2_048);
  await assert.rejects(
    prepare(database, {
      hash: HASH_B,
      byteSize: 2_048,
      requestId: "pdf-request-b"
    }),
    error => error.code === "23514"
  );
  await database.query(`
    update private.course_source_pdf_upload_intents
    set expires_at=statement_timestamp()-interval '1 second'
    where actor_id=$1 and request_id='pdf-request-b'
  `, [OWNER]);
  const afterExpiry = await prepare(database, {
    hash: HASH_C,
    byteSize: 3_072,
    requestId: "pdf-request-b"
  });
  assert.equal(afterExpiry.uploadRequired, true);
  assert.equal(afterExpiry.attachment.contentHash, HASH_C);
});

test("#220 reutiliza vínculo herdado e recupera seu path no replay stale", async () => {
  const database = await databaseFixture();
  const inheritedPath = `${COURSE}/${HASH_A}.pdf`;
  const localPath = `${VARIANT}/${HASH_A}.pdf`;
  const requestId = "pdf-inherited-replay";
  const sourceIntent = existing();
  await storeObject(database, COURSE, HASH_A, 1_024);
  await database.query(`
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,byte_size,media_type,
      storage_path,actor_id
    ) values($1,'source-a',1,$2,1024,'application/pdf',$3,$4)
  `, [VARIANT, HASH_A, inheritedPath, OWNER]);

  assert.equal(await scalar(database, `
    select exists(
      select 1 from pg_constraint
      where conrelid='private.course_source_pdf_upload_intents'::regclass
        and conname='course_source_pdf_upload_intents_values_v2'
    ) value
  `), true);
  const prepareInherited = () => scalar(database, `
    select public.prepare_course_source_pdf_ingestion_for_actor_v1(
      $1,$2,1,$3,$4,1024,'application/pdf',$5
    ) value
  `, [OWNER, VARIANT, JSON.stringify(sourceIntent), HASH_A, requestId]);
  const prepared = await prepareInherited();
  assert.equal(prepared.alreadyLinked, true);
  assert.equal(prepared.uploadRequired, false);
  assert.equal(prepared.attachment.storagePath, inheritedPath);
  const uploadMetadata = JSON.stringify({
    contentLength: "1024",
    mimetype: "application/pdf"
  });
  assert.equal(await scalar(database, `
    select private.can_upload_course_source_pdf_v1($1,$2) value
  `, [inheritedPath, uploadMetadata]), false);

  assert.equal(await scalar(database, `
    select public.cancel_course_source_pdf_ingestion_for_actor_v1(
      $1,$2,$3,$4
    ) value
  `, [OWNER, VARIANT, inheritedPath, requestId]), true);
  await database.query(`
    insert into private.course_source_pdf_upload_intents(
      actor_id,course_id,storage_path,content_hash,byte_size,media_type,
      source_id,source_revision,course_revision
    ) values($1,$2,$3,$4,1024,'application/pdf','source-a',1,1)
  `, [OWNER, VARIANT, `${VARIANT}/${HASH_B}.pdf`, HASH_B]);
  assert.equal(await scalar(database, `
    select private.can_upload_course_source_pdf_v1($1,$2) value
  `, [`${VARIANT}/${HASH_B}.pdf`, uploadMetadata]), true);
  await prepareInherited();
  const first = await scalar(database, `
    select public.ingest_course_source_pdf_for_actor_v1(
      $1,$2,1,$3,$4,$5,'application',$6
    ) value
  `, [
    OWNER,
    VARIANT,
    JSON.stringify(sourceIntent),
    JSON.stringify(attachment(COURSE, HASH_A, 1_024)),
    JSON.stringify(fileIdentity("file-inherited")),
    requestId
  ]);
  assert.equal(first.idempotent, false);
  assert.equal(first.changed, false);
  assert.equal(first.attachment.storagePath, inheritedPath);

  await database.query("update public.courses set revision=2 where id=$1", [VARIANT]);
  await assert.rejects(prepareInherited(), error => error.code === "40001");
  const replay = await scalar(database, `
    select public.ingest_course_source_pdf_for_actor_v1(
      $1,$2,1,$3,$4,$5,'application',$6
    ) value
  `, [
    OWNER,
    VARIANT,
    JSON.stringify(sourceIntent),
    JSON.stringify(attachment(VARIANT, HASH_A, 1_024)),
    JSON.stringify(fileIdentity("file-inherited")),
    requestId
  ]);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 1);
  assert.equal(replay.attachment.storagePath, inheritedPath);
  assert.notEqual(replay.attachment.storagePath, localPath);
});

test("#220 sela bibliografia e binário do preparo com fingerprint canônico", async () => {
  const database = await databaseFixture();
  const firstIntent = save(
    "source-a",
    1,
    sourceDocument({ title: "Manual sintético — revisão A" })
  );
  await prepare(database, {
    sourceIntent: firstIntent,
    requestId: "pdf-fingerprint"
  });
  const changedIntent = save(
    "source-a",
    1,
    sourceDocument({ title: "Manual sintético — revisão B" })
  );
  await assert.rejects(
    prepare(database, {
      sourceIntent: changedIntent,
      requestId: "pdf-fingerprint"
    }),
    error => error.code === "23514" && /preparo de PDF incompatível/u.test(error.message)
  );
  const persisted = await database.query(`
    select source_id,request_fingerprint
    from private.course_source_pdf_upload_intents
    where actor_id=$1 and request_id='pdf-fingerprint'
  `, [OWNER]);
  assert.equal(persisted.rows[0].source_id, "source-a");
  assert.match(persisted.rows[0].request_fingerprint, /^[a-f0-9]{64}$/u);
  await storeObject(database, COURSE, HASH_A, 1_024);
  await assert.rejects(
    ingest(database, {
      sourceIntent: changedIntent,
      requestId: "pdf-fingerprint"
    }),
    error => error.code === "23514" && /diverge do preparo/u.test(error.message)
  );
  assert.equal(await scalar(database, `
    select max(revision) value from private.course_source_revisions
    where course_id=$1 and source_id='source-a'
  `, [COURSE]), 1);
});

test("#220 finaliza vínculo idempotente e separa bibliografia de conteúdo binário", async () => {
  const database = await databaseFixture();
  await prepare(database);
  await storeObject(database, COURSE, HASH_A, 1_024);
  const result = await ingest(database);
  assert.deepEqual(result, {
    contract: "aralearn.course-source-pdf-ingestion.v1",
    courseId: COURSE,
    courseRevision: 6,
    requestId: "pdf-request-a",
    idempotent: false,
    changed: true,
    change: { type: "attach_pdf", subjectId: "source-a", revision: 1 },
    source: {
      sourceId: "source-a",
      sourceRevision: 1,
      bibliographyChanged: false
    },
    attachment: attachment(COURSE, HASH_A, 1_024),
    stored: true
  });
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_source_pdf_upload_intents
  `), 0);
  const recovered = await ingestionReceipt(database);
  assert.equal(recovered.idempotent, true);
  assert.equal(recovered.stored, true);
  assert.deepEqual(recovered.attachment, attachment(COURSE, HASH_A, 1_024));
  assert.equal(await ingestionReceipt(database, { requestId: "pdf-request-missing" }), null);
  await assert.rejects(
    ingestionReceipt(database, {
      sourceIntent: existing("source-b", 1),
      requestId: "pdf-request-a"
    }),
    error => error.code === "23514"
  );
  await assert.rejects(
    ingestionReceipt(database, {
      identity: fileIdentity("file-pdf-different"),
      requestId: "pdf-request-a"
    }),
    error => error.code === "23514"
  );
  await database.query("update public.courses set owner_id=$1 where id=$2", [OTHER, COURSE]);
  await assert.rejects(
    ingestionReceipt(database),
    error => error.code === "42501"
  );
  await assert.rejects(
    ingest(database),
    error => error.code === "42501"
  );
  await database.query("update public.courses set owner_id=$1 where id=$2", [OWNER, COURSE]);
  const retry = await ingest(database);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.courseRevision, 6);

  await storeObject(database, COURSE, HASH_B, 2_048);
  await assert.rejects(
    ingest(database, {
      pdf: attachment(COURSE, HASH_B, 2_048),
      requestId: "pdf-request-a"
    }),
    error => error.code === "23514"
  );
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_source_attachments
    where course_id=$1 and content_hash=$2
  `, [COURSE, HASH_B]), 0);
  await database.query(`
    update private.course_change_receipts
    set expires_at=statement_timestamp()-interval '1 second'
    where actor_id=$1 and request_id='pdf-request-a'
  `, [OWNER]);
  assert.equal(await ingestionReceipt(database), null);
  const afterReceiptExpiry = await ingest(database);
  assert.equal(afterReceiptExpiry.idempotent, true);
  assert.equal(afterReceiptExpiry.courseRevision, 6);

  const secondBinary = await prepare(database, {
    expectedRevision: 6,
    hash: HASH_B,
    byteSize: 2_048,
    requestId: "pdf-request-b"
  });
  assert.equal(secondBinary.uploadRequired, false);
  await ingest(database, {
    expectedRevision: 6,
    pdf: attachment(COURSE, HASH_B, 2_048),
    requestId: "pdf-request-b"
  });
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_source_attachments
    where course_id=$1 and source_id='source-a' and source_revision=1
  `, [COURSE]), 2);

  const sharedBytes = await prepare(database, {
    expectedRevision: 7,
    sourceIntent: existing("source-b", 1),
    hash: HASH_A,
    requestId: "pdf-request-c"
  });
  assert.equal(sharedBytes.uploadRequired, false);
  assert.equal(sharedBytes.sourceId, "source-b");
});

test("#220 salva/revisa Fonte e anexo atomicamente, preservando gaps bibliográficos", async () => {
  const database = await databaseFixture();
  const sourceIntent = save(
    "source-a",
    1,
    sourceDocument({ title: "Manual sintético — edição corrigida" })
  );
  const prepared = await prepare(database, {
    sourceIntent,
    hash: HASH_C,
    byteSize: 4_096,
    requestId: "pdf-save-revision"
  });
  assert.equal(prepared.sourceRevision, 2);
  await storeObject(database, COURSE, HASH_C, 4_096);
  await database.query("select set_config('test.fail_attach','on',false)");
  await assert.rejects(
    ingest(database, {
      sourceIntent,
      pdf: attachment(COURSE, HASH_C, 4_096),
      requestId: "pdf-save-revision"
    }),
    error => error.code === "55000"
  );
  assert.equal(await scalar(database, `
    select revision value from public.courses where id=$1
  `, [COURSE]), 5);
  assert.equal(await scalar(database, `
    select max(revision) value from private.course_source_revisions
    where course_id=$1 and source_id='source-a'
  `, [COURSE]), 1);
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_source_attachments
    where course_id=$1 and content_hash=$2
  `, [COURSE, HASH_C]), 0);

  await database.query("select set_config('test.fail_attach','off',false)");
  const stored = await ingest(database, {
    sourceIntent,
    pdf: attachment(COURSE, HASH_C, 4_096),
    requestId: "pdf-save-revision"
  });
  assert.equal(stored.courseRevision, 7);
  assert.deepEqual(stored.source, {
    sourceId: "source-a",
    sourceRevision: 2,
    bibliographyChanged: true
  });
  const revision = await database.query(`
    select authorship,publication_date,identifier,url,edition_or_version
    from private.course_source_revisions
    where course_id=$1 and source_id='source-a' and revision=2
  `, [COURSE]);
  assert.deepEqual(revision.rows[0], {
    authorship: null,
    publication_date: null,
    identifier: null,
    url: null,
    edition_or_version: null
  });
  const replay = await ingest(database, {
    sourceIntent,
    pdf: attachment(COURSE, HASH_C, 4_096),
    requestId: "pdf-save-revision"
  });
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 7);
});

test("#220 aplica cota e cancela somente a intenção autorizada", async () => {
  const database = await databaseFixture();
  for (const [hash, byteSize] of [
    [HASH_A, 20 * 1024 * 1024],
    [HASH_B, 20 * 1024 * 1024],
    [HASH_C, 20 * 1024 * 1024]
  ]) {
    await storeObject(database, COURSE, hash, byteSize);
  }
  await assert.rejects(
    prepare(database, {
      hash: HASH_D,
      byteSize: 5 * 1024 * 1024,
      requestId: "pdf-over-quota"
    }),
    error => error.code === "23514" && /64 MiB/u.test(error.message)
  );

  const database2 = await databaseFixture();
  await prepare(database2);
  const path = `${COURSE}/${HASH_A}.pdf`;
  assert.equal(await scalar(database2, `
    select public.cancel_course_source_pdf_ingestion_for_actor_v1(
      $1,$2,$3,'pdf-request-b'
    ) value
  `, [OWNER, COURSE, path]), false);
  assert.equal(await scalar(database2, `
    select public.cancel_course_source_pdf_ingestion_for_actor_v1(
      $1,$2,$3,'pdf-request-a'
    ) value
  `, [OWNER, COURSE, path]), true);

  const database3 = await databaseFixture();
  await prepare(database3);
  await database3.query("delete from public.courses where id=$1", [COURSE]);
  assert.equal(await scalar(database3, `
    select public.cancel_course_source_pdf_ingestion_for_actor_v1(
      $1,$2,$3,'pdf-request-a'
    ) value
  `, [OWNER, COURSE, path]), false);
});
