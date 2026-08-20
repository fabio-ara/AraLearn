import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260820061206_course_source_pdf_attachments.sql",
  import.meta.url
);
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const COURSE = "33333333-3333-4333-8333-333333333333";
const OBJECT = "44444444-4444-4444-8444-444444444444";
const HASH = "a".repeat(64);
const PATH = `${COURSE}/${HASH}.pdf`;

async function databaseWithAttachmentAuthorities() {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const tablesStart = migration.indexOf("create table private.course_source_attachments (");
  const wrapperStart = migration.indexOf(
    "alter function public.get_owned_course_sources_for_actor_v1(",
    tablesStart
  );
  const commentsStart = migration.indexOf("comment on table private.course_source_attachments", wrapperStart);
  const privilegesStart = migration.indexOf(
    "revoke all on function private.course_source_pdf_unique_bytes_v1",
    commentsStart
  );
  const postflightStart = migration.indexOf("do $course_source_pdf_postflight$", privilegesStart);
  assert.ok(tablesStart >= 0 && wrapperStart > tablesStart && commentsStart > wrapperStart &&
    privilegesStart > commentsStart && postflightStart > privilegesStart);

  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema storage;

    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid',true),'')::uuid
    $$;
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      revision bigint not null,
      updated_at timestamptz not null default now()
    );
    create table public.course_access(granted_by uuid);
    create table private.course_source_revisions(
      course_id uuid not null references public.courses(id) on delete cascade,
      source_id text not null,
      revision bigint not null,
      status text not null,
      actor_id uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      primary key(course_id,source_id,revision)
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
      course_id uuid not null references public.courses(id) on delete cascade,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id) on delete set null,
      primary key(course_id,revision)
    );
    create table private.course_authoring_part_didactic_microsequences(
      course_id uuid not null references public.courses(id) on delete cascade
    );
    create table private.course_authoring_part_materializations(
      course_id uuid not null references public.courses(id) on delete cascade
    );
    create table storage.buckets(
      id text primary key,
      name text not null,
      public boolean not null,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects(
      id uuid primary key,
      bucket_id text not null,
      name text not null,
      metadata jsonb,
      unique(bucket_id,name)
    );
    alter table storage.objects enable row level security;

    create function private.require_service_role()
    returns void language plpgsql as $$begin return; end$$;
    create function private.require_course_access_v1(
      p_course_id uuid,p_actor_id uuid,p_write boolean
    ) returns void language plpgsql as $$
    begin
      if not exists(
        select 1 from public.courses
        where id=p_course_id and owner_id=p_actor_id
      ) then
        raise exception 'Acesso negado.' using errcode='42501';
      end if;
    end
    $$;
    create function private.course_source_json_hash_v1(p_value jsonb)
    returns text language sql immutable as $$
      select md5(p_value::text) || md5(reverse(p_value::text))
    $$;
    create function private.reject_course_source_fact_change_v1()
    returns trigger language plpgsql as $$
    declare
      v_old jsonb := to_jsonb(old);
      v_new jsonb := case when tg_op='UPDATE' then to_jsonb(new) else null end;
    begin
      if tg_op='UPDATE' and v_old ? 'actor_id'
         and v_old->'actor_id'<>'null'::jsonb and v_new->'actor_id'='null'::jsonb
         and (v_new-'actor_id')=(v_old-'actor_id')
         and not exists(select 1 from auth.users where id=(v_old->>'actor_id')::uuid) then
        return new;
      end if;
      if tg_op='DELETE' and not exists(
        select 1 from public.courses where id=(v_old->>'course_id')::uuid
      ) then
        return old;
      end if;
      raise exception 'Fatos de Fonte e proveniência são append-only.' using errcode='55000';
    end
    $$;

    create function public.get_owned_course_sources_for_actor_v1(
      p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_mode text,
      p_source_id text default null,p_target_kind text default null,
      p_target_id text default null,p_cursor text default null,p_limit integer default 10
    ) returns jsonb language plpgsql as $$
    declare v_revision bigint;
    begin
      select revision into strict v_revision from public.courses where id=p_course_id;
      if v_revision<>p_expected_revision then
        raise exception 'Curso alterado.' using errcode='40001';
      end if;
      return jsonb_build_object(
        'contract','aralearn.course-sources.v1','courseId',p_course_id,
        'courseRevision',v_revision,'mode',p_mode,
        'query',jsonb_build_object(
          'sourceId',p_source_id,'targetKind',p_target_kind,'targetId',p_target_id
        ),
        'items',case when p_mode='source' then jsonb_build_array(jsonb_build_object(
          'sourceId',p_source_id,'revision',2,'status','active','kind','document',
          'title','Fonte PDF','citationText','Fonte PDF.','url',null,
          'editionOrVersion',null,'studyVisibility','citation','anchorCount',0,
          'createdAt',now(),'actorId',p_actor_id,'anchors','[]'::jsonb
        )) else '[]'::jsonb end,
        'nextCursor',null
      );
    end
    $$;
  `);
  await database.exec(migration.slice(tablesStart, wrapperStart));
  await database.exec(migration.slice(wrapperStart, commentsStart));
  await database.exec(migration.slice(privilegesStart, postflightStart));
  return database;
}

async function seed(database) {
  await database.query("insert into auth.users(id) values($1),($2)", [OWNER, OTHER]);
  await database.query(
    "insert into public.courses(id,owner_id,revision) values($1,$2,5)",
    [COURSE, OWNER]
  );
  await database.query(`
    insert into private.course_source_revisions(
      course_id,source_id,revision,status,actor_id
    ) values($1,'source-pdf',2,'active',$2)
  `, [COURSE, OWNER]);
}

function command({ byteSize = 1_024, contentHash = HASH } = {}) {
  return {
    type: "attach_pdf",
    sourceId: "source-pdf",
    sourceRevision: 2,
    attachment: {
      contentHash,
      byteSize,
      mediaType: "application/pdf",
      storagePath: `${COURSE}/${contentHash}.pdf`
    }
  };
}

test("SQL confirma objeto por CAS, deduplica, projeta revisão exata e não apaga Storage", async () => {
  const database = await databaseWithAttachmentAuthorities();
  await seed(database);

  for (const signature of [
    "public.get_course_source_attachment_access_for_actor_v1(uuid,uuid,bigint,text,text,bigint,text,bigint,text)",
    "public.attach_course_source_pdf_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)"
  ]) {
    const privilege = await database.query(`
      select
        has_function_privilege('service_role',$1,'execute') service_role,
        has_function_privilege('authenticated',$1,'execute') authenticated
    `, [signature]);
    assert.deepEqual(privilege.rows[0], {
      service_role: true,
      authenticated: false
    });
  }

  const missing = await database.query(`
    select public.get_course_source_attachment_access_for_actor_v1(
      $1,$2,5,'prepare_upload','source-pdf',2,$3,1024,'application/pdf'
    ) value
  `, [OWNER, COURSE, HASH]);
  assert.equal(missing.rows[0].value.uploadRequired, true);
  assert.equal(missing.rows[0].value.alreadyLinked, false);

  await database.query(`
    insert into storage.objects(id,bucket_id,name,metadata)
    values($1,'course-source-pdfs',$2,$3)
  `, [OBJECT, PATH, JSON.stringify({ size: "1024", mimetype: "application/pdf" })]);
  const deduplicated = await database.query(`
    select public.get_course_source_attachment_access_for_actor_v1(
      $1,$2,5,'prepare_upload','source-pdf',2,$3,1024,'application/pdf'
    ) value
  `, [OWNER, COURSE, HASH]);
  assert.equal(deduplicated.rows[0].value.uploadRequired, false);

  const attached = await database.query(`
    select public.attach_course_source_pdf_for_actor_v1(
      $1,$2,5,$3::jsonb,'application','request-source-pdf-1'
    ) value
  `, [OWNER, COURSE, JSON.stringify(command())]);
  assert.equal(attached.rows[0].value.changed, true);
  assert.equal(attached.rows[0].value.courseRevision, 6);

  const replay = await database.query(`
    select public.attach_course_source_pdf_for_actor_v1(
      $1,$2,5,$3::jsonb,'application','request-source-pdf-1'
    ) value
  `, [OWNER, COURSE, JSON.stringify(command())]);
  assert.equal(replay.rows[0].value.idempotent, true);
  assert.equal(replay.rows[0].value.courseRevision, 6);

  const read = await database.query(`
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,6,'source','source-pdf',null,null,null,1
    ) value
  `, [OWNER, COURSE]);
  assert.deepEqual(read.rows[0].value.items[0].attachments.map((value) => ({
    contentHash: value.contentHash,
    byteSize: value.byteSize,
    mediaType: value.mediaType,
    storagePath: value.storagePath,
    actorId: value.actorId
  })), [{
    contentHash: HASH,
    byteSize: 1_024,
    mediaType: "application/pdf",
    storagePath: PATH,
    actorId: OWNER
  }]);
  assert.deepEqual(read.rows[0].value.pdfStorage, {
    uniqueBytes: 1_024,
    maxUniqueBytes: 64 * 1024 * 1024
  });

  const download = await database.query(`
    select public.get_course_source_attachment_access_for_actor_v1(
      $1,$2,6,'download','source-pdf',2,$3,null,null
    ) value
  `, [OWNER, COURSE, HASH]);
  assert.equal(download.rows[0].value.alreadyLinked, true);
  assert.equal(download.rows[0].value.attachment.byteSize, 1_024);

  await assert.rejects(
    database.query(`
      select public.get_course_source_attachment_access_for_actor_v1(
        $1,$2,5,'download','source-pdf',2,$3,null,null
      )
    `, [OWNER, COURSE, HASH]),
    (error) => error.code === "40001"
  );
  await assert.rejects(
    database.query("update private.course_source_attachments set byte_size=2048"),
    (error) => error.code === "55000"
  );
  await assert.rejects(
    database.query("delete from private.course_source_attachments"),
    (error) => error.code === "55000"
  );

  await database.exec(`select set_config('app.uid','${OWNER}',false);`);
  const unlinkedOwnerPath = `${COURSE}/${"b".repeat(64)}.pdf`;
  let authorized = await database.query(
    "select private.can_read_course_source_pdf_v1($1) value", [unlinkedOwnerPath]
  );
  assert.equal(
    authorized.rows[0].value,
    true,
    "o helper protegido autoriza o objeto recém-enviado pelo prefixo do Curso"
  );
  authorized = await database.query(
    "select private.can_read_course_source_pdf_v1($1) value", [PATH]
  );
  assert.equal(authorized.rows[0].value, true);
  await database.exec(`select set_config('app.uid','${OTHER}',false);`);
  authorized = await database.query(
    "select private.can_read_course_source_pdf_v1($1) value", [PATH]
  );
  assert.equal(authorized.rows[0].value, false);

  const policyDefinitions = await database.query(`
    select policyname,qual
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname like 'course_source_pdfs_owner_%_v1'
    order by policyname
  `);
  assert.deepEqual(
    policyDefinitions.rows.map(({ policyname }) => policyname),
    ["course_source_pdfs_owner_select_v1"]
  );
  for (const policy of policyDefinitions.rows) {
    assert.match(policy.qual, /can_read_course_source_pdf_v1/u);
    assert.doesNotMatch(
      policy.qual,
      /courses/u,
      `${policy.policyname} não pode consultar public.courses sob authenticated`
    );
  }

  await database.query("delete from public.courses where id=$1", [COURSE]);
  const counts = await database.query(`
    select
      (select count(*)::integer from private.course_source_attachments) attachments,
      (select count(*)::integer from storage.objects) objects
  `);
  assert.deepEqual(counts.rows[0], { attachments: 0, objects: 1 });
  await database.close();
});

test("preparo não recria objeto ausente depois que o PDF foi vinculado", async () => {
  const database = await databaseWithAttachmentAuthorities();
  await seed(database);
  await database.query(`
    insert into storage.objects(id,bucket_id,name,metadata)
    values($1,'course-source-pdfs',$2,$3)
  `, [OBJECT, PATH, JSON.stringify({ size: "1024", mimetype: "application/pdf" })]);
  await database.query(`
    select public.attach_course_source_pdf_for_actor_v1(
      $1,$2,5,$3::jsonb,'application','request-source-pdf-missing-1'
    )
  `, [OWNER, COURSE, JSON.stringify(command())]);

  await database.query(
    "delete from storage.objects where bucket_id='course-source-pdfs' and name=$1",
    [PATH]
  );
  await assert.rejects(
    database.query(`
      select public.get_course_source_attachment_access_for_actor_v1(
        $1,$2,6,'prepare_upload','source-pdf',2,$3,1024,'application/pdf'
      )
    `, [OWNER, COURSE, HASH]),
    (error) => error.code === "55000" && /objeto vinculado está ausente/iu.test(error.message)
  );
  const state = await database.query(`
    select
      (select count(*)::integer from private.course_source_attachments) attachments,
      (select count(*)::integer from storage.objects) objects,
      private.course_source_pdf_unique_bytes_v1($1)::integer unique_bytes
  `, [COURSE]);
  assert.deepEqual(state.rows[0], { attachments: 1, objects: 0, unique_bytes: 1_024 });
  await database.close();
});

test("SQL recusa metadados divergentes antes de criar o vínculo", async () => {
  const database = await databaseWithAttachmentAuthorities();
  await seed(database);
  await database.query(`
    insert into storage.objects(id,bucket_id,name,metadata)
    values($1,'course-source-pdfs',$2,$3)
  `, [OBJECT, PATH, JSON.stringify({ size: "2048", mimetype: "application/pdf" })]);
  await assert.rejects(
    database.query(`
      select public.attach_course_source_pdf_for_actor_v1(
        $1,$2,5,$3::jsonb,'application','request-source-pdf-2'
      )
    `, [OWNER, COURSE, JSON.stringify(command())]),
    (error) => error.code === "23514"
  );
  const count = await database.query(
    `select
      (select count(*)::integer from private.course_source_attachments) attachments,
      (select revision::integer from public.courses where id=$1) course_revision,
      private.course_source_pdf_unique_bytes_v1($1)::integer unique_bytes`,
    [COURSE]
  );
  assert.deepEqual(count.rows[0], {
    attachments: 0,
    course_revision: 5,
    unique_bytes: 0
  });
  await database.close();
});

test("exclusão de conta falha fechada até remover todos os PDFs dos Cursos próprios", async () => {
  const database = await databaseWithAttachmentAuthorities();
  await seed(database);
  await database.query(`
    insert into storage.objects(id,bucket_id,name,metadata)
    values($1,'course-source-pdfs',$2,$3)
  `, [OBJECT, PATH, JSON.stringify({ size: "1024", mimetype: "application/pdf" })]);
  await database.exec(`select set_config('app.uid','${OWNER}',false);`);

  await assert.rejects(
    database.query("select public.delete_my_account_v1('EXCLUIR MINHA CONTA')"),
    (error) => error.code === "AR001" && /PDFs privados/u.test(error.message)
  );
  assert.equal((await database.query(
    "select count(*)::integer value from auth.users where id=$1", [OWNER]
  )).rows[0].value, 1);

  await database.query(
    "delete from storage.objects where bucket_id='course-source-pdfs' and name=$1",
    [PATH]
  );
  const result = await database.query(
    "select public.delete_my_account_v1('EXCLUIR MINHA CONTA') value"
  );
  assert.deepEqual(result.rows[0].value, {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal((await database.query(
    "select count(*)::integer value from auth.users where id=$1", [OWNER]
  )).rows[0].value, 0);
  const replay = await database.query(
    "select public.delete_my_account_v1('EXCLUIR MINHA CONTA') value"
  );
  assert.deepEqual(replay.rows[0].value, result.rows[0].value);
  await database.close();
});

test("cota de 64 MiB conta hashes únicos e permanece fechada sob confirmações concorrentes", async () => {
  const database = await databaseWithAttachmentAuthorities();
  await seed(database);
  const existing = [
    ["b".repeat(64), 20 * 1024 * 1024],
    ["c".repeat(64), 20 * 1024 * 1024],
    ["d".repeat(64), 20 * 1024 * 1024],
    ["e".repeat(64), 4 * 1024 * 1024 - 1]
  ];
  for (const [index, [contentHash, byteSize]] of existing.entries()) {
    const storagePath = `${COURSE}/${contentHash}.pdf`;
    await database.query(`
      insert into storage.objects(id,bucket_id,name,metadata)
      values($1,'course-source-pdfs',$2,$3)
    `, [
      `50000000-0000-4000-8000-00000000000${index}`,
      storagePath,
      JSON.stringify({ size: String(byteSize), mimetype: "application/pdf" })
    ]);
    await database.query(`
      insert into private.course_source_attachments(
        course_id,source_id,source_revision,content_hash,byte_size,
        media_type,storage_path,actor_id
      ) values($1,'source-pdf',2,$2,$3,'application/pdf',$4,$5)
    `, [COURSE, contentHash, byteSize, storagePath, OWNER]);
  }

  const candidates = ["f".repeat(64), "1".repeat(64)];
  for (const [index, contentHash] of candidates.entries()) {
    await database.query(`
      insert into storage.objects(id,bucket_id,name,metadata)
      values($1,'course-source-pdfs',$2,$3)
    `, [
      `60000000-0000-4000-8000-00000000000${index}`,
      `${COURSE}/${contentHash}.pdf`,
      JSON.stringify({ size: "1", mimetype: "application/pdf" })
    ]);
  }

  const attempts = await Promise.allSettled(candidates.map((contentHash, index) =>
    database.query(`
      select public.attach_course_source_pdf_for_actor_v1(
        $1,$2,5,$3::jsonb,'application',$4
      ) value
    `, [
      OWNER,
      COURSE,
      JSON.stringify(command({ byteSize: 1, contentHash })),
      `request-source-quota-${index}`
    ])
  ));
  assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(attempts.filter(({ status }) => status === "rejected").length, 1);
  const total = await database.query(
    "select private.course_source_pdf_unique_bytes_v1($1) value",
    [COURSE]
  );
  assert.equal(Number(total.rows[0].value), 64 * 1024 * 1024);

  await assert.rejects(
    database.query(`
      select public.get_course_source_attachment_access_for_actor_v1(
        $1,$2,6,'prepare_upload','source-pdf',2,$3,1,'application/pdf'
      )
    `, [OWNER, COURSE, "2".repeat(64)]),
    (error) => error.code === "23514" && /cota de 64 MiB/u.test(error.message)
  );
  await database.close();
});
