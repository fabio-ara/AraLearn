import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260818042341_course_variant_comparisons.sql",
  import.meta.url
);
const listingMigrationUrl = new URL(
  "../../supabase/migrations/20260818051209_course_variant_comparison_listing.sql",
  import.meta.url
);
const completionMigrationUrl = new URL(
  "../../supabase/migrations/20260820065720_complete_course_variant_comparison.sql",
  import.meta.url
);
const personalCopyMigrationUrl = new URL(
  "../../supabase/migrations/20260821145358_personal_course_copy_edit.sql",
  import.meta.url
);
const OWNER = "11111111-1111-4111-8111-111111111111";
const COURSE = "22222222-2222-4222-8222-222222222222";
const CHECKPOINT = "33333333-3333-4333-8333-333333333333";
const SET = "44444444-4444-4444-8444-444444444444";
const VARIANT_A = "55555555-5555-4555-8555-555555555555";
const VARIANT_B = "66666666-6666-4666-8666-666666666666";

test("PDF compartilhado permanece restrito a variantes do mesmo proprietário", async () => {
  const baseMigration = await fs.readFile(migrationUrl, "utf8");
  const completionMigration = await fs.readFile(completionMigrationUrl, "utf8");
  const personalCopyMigration = await fs.readFile(personalCopyMigrationUrl, "utf8");
  assert.match(baseMigration, /perform private\.require_course_access_v1\(\s*p_source_course_id,p_actor_id,true\s*\)/u);
  assert.match(baseMigration, /values\(v_target_course_id,p_actor_id,btrim\(p_title\)/u);
  assert.match(baseMigration, /private\.clone_course_variant_from_source_v1\(\s*p_actor_id,p_source_course_id/u);
  assert.match(baseMigration, /revoke all on function private\.clone_course_variant_from_source_v1\(/u);
  assert.match(completionMigration, /select v_target_course_id,attachment\.source_id/u);
  assert.doesNotMatch(personalCopyMigration, /course_source_attachments/u);
});

test("leitura comparativa permanece volátil enquanto protege o Curso com FOR SHARE", async () => {
  const migration = await fs.readFile(completionMigrationUrl, "utf8");
  const functionStart = migration.indexOf(
    "create or replace function public.get_owned_course_variant_comparison_for_actor_v1("
  );
  const functionEnd = migration.indexOf("$function$;", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const definition = migration.slice(functionStart, functionEnd);
  assert.match(definition, /language plpgsql\s+volatile\s+security definer/u);
  assert.match(definition, /for share/u);
  assert.match(definition, /membership\.detached_at is null/u);
  assert.match(definition, /row_number\(\) over/u);
  assert.match(definition, /jsonb_array_length\(v_members\) < 2/u);
  assert.doesNotMatch(definition, /'detachedAt'/u);
});

async function databaseWithVariantAuthorities() {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const tablesStart = migration.indexOf("create table private.course_variant_plan_checkpoints");
  const indexesStart = migration.indexOf("create index course_variant_sets_owner_recent_v1_idx", tablesStart);
  const guardStart = migration.indexOf("create function private.reject_course_variant_history_change_v1()");
  const cloneStart = migration.indexOf("create function private.clone_course_variant_from_source_v1(", guardStart);
  assert.ok(tablesStart >= 0 && indexesStart > tablesStart && guardStart > indexesStart && cloneStart > guardStart);

  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;
    create schema extensions;
    create table auth.users(id uuid primary key);
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade
    );
    create function private.course_variant_plan_snapshot_hash_v1(jsonb)
    returns text language sql immutable as $$select repeat('a',64)$$;
    create function extensions.gen_random_uuid()
    returns uuid language sql volatile as $$select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$;
  `);
  await database.exec(migration.slice(tablesStart, indexesStart));
  await database.exec(migration.slice(guardStart, cloneStart));
  return database;
}

async function seed(database) {
  await database.query("insert into auth.users(id) values($1)", [OWNER]);
  await database.query("insert into public.courses(id,owner_id) values($1,$2)", [COURSE, OWNER]);
  await database.query(`
    insert into private.course_variant_plan_checkpoints(
      id,owner_id,source_course_id,source_course_revision,source_plan_version,
      plan_snapshot,snapshot_hash
    ) values($1,$2,$3,1,1,'{}'::jsonb,repeat('a',64))
  `, [CHECKPOINT, OWNER, COURSE]);
  await database.query(`
    insert into private.course_variant_comparison_sets(
      id,owner_id,checkpoint_id,source_course_id,source_course_revision
    ) values($1,$2,$3,$4,1)
  `, [SET, OWNER, CHECKPOINT, COURSE]);
  await database.query(`
    insert into private.course_variant_comparison_members(
      comparison_set_id,course_id,position,label,attached_course_revision
    ) values($1,$2,0,'Z',1)
  `, [SET, COURSE]);
}

test("checkpoint é imutável manualmente e Course remove apenas os vínculos comparativos", async () => {
  const database = await databaseWithVariantAuthorities();
  await seed(database);

  await assert.rejects(
    database.query("delete from private.course_variant_plan_checkpoints where id=$1", [CHECKPOINT]),
    (error) => error.code === "55000"
  );

  await database.query("delete from public.courses where id=$1", [COURSE]);
  for (const relation of [
    "private.course_variant_plan_checkpoints",
    "private.course_variant_comparison_sets",
    "private.course_variant_comparison_members"
  ]) {
    const result = await database.query(`select count(*)::integer count from ${relation}`);
    assert.equal(result.rows[0].count, 0, relation);
  }
  await database.close();
});

test("posição da variante é única no conjunto e não depende do rótulo", async () => {
  const database = await databaseWithVariantAuthorities();
  await seed(database);
  await database.query(
    "insert into public.courses(id,owner_id) values($1,$2)",
    [VARIANT_A, OWNER]
  );
  await assert.rejects(
    database.query(`
      insert into private.course_variant_comparison_members(
        comparison_set_id,course_id,position,label,attached_course_revision
      ) values($1,$2,0,'A',1)
    `, [SET, VARIANT_A]),
    (error) => error.code === "23505"
  );
  await database.query(`
    insert into private.course_variant_comparison_members(
      comparison_set_id,course_id,position,label,attached_course_revision
    ) values($1,$2,1,'A',1)
  `, [SET, VARIANT_A]);
  const result = await database.query(`
    select position,label from private.course_variant_comparison_members
    where comparison_set_id=$1 order by position
  `, [SET]);
  assert.deepEqual(result.rows, [
    { position: 0, label: "Z" },
    { position: 1, label: "A" }
  ]);
  await database.close();
});

function comparisonMember({
  courseId,
  position,
  parameters,
  policies,
  referenceFingerprint
}) {
  return {
    courseId,
    position,
    parameterDifferences: [],
    componentPolicyDifference: null,
    changedSinceAttached: false,
    attachedCourseRevision: 1,
    currentCourseRevision: 1,
    effectiveParameters: parameters,
    effectiveComponentPolicies: policies,
    componentsUsed: [],
    references: {
      sourceCount: 1,
      anchorCount: 1,
      pdfCount: 1,
      sharedPdfCount: 1,
      fingerprint: referenceFingerprint
    },
    materialization: {
      completedPartCount: 1,
      runningPartCount: 0,
      studyUnitCount: 1,
      studyUnits: [],
      truncated: { studyUnits: false },
      partFingerprint: "c".repeat(64),
      studyUnitFingerprint: "d".repeat(64),
      plannedPartCount: 1
    }
  };
}

test("SQL detecta desvios não declarados por escopo e troca de Fonte com as mesmas contagens", async () => {
  const migration = await fs.readFile(completionMigrationUrl, "utf8");
  const functionStart = migration.indexOf(
    "create function private.course_variant_comparison_differences_v1("
  );
  const functionEnd = migration.indexOf(
    "create or replace function public.get_owned_course_variant_comparison_for_actor_v1(",
    functionStart
  );
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const database = new PGlite();
  await database.exec("create schema private");
  await database.exec(migration.slice(functionStart, functionEnd));

  const defaultPolicy = {
    catalogVersion: "1",
    availability: "all",
    allowedRefs: [],
    excludedRefs: [],
    preferredRefs: []
  };
  const baselineParameter = {
    scopeKind: "course",
    scopeId: "course",
    parameterId: "analysis_density",
    value: 1,
    origin: "system_default",
    sourceScope: null
  };
  const coursePolicy = {
    scopeKind: "course",
    scopeId: "course",
    policy: defaultPolicy,
    origin: "system_default",
    sourceScope: null
  };
  const members = [
    comparisonMember({
      courseId: VARIANT_A,
      position: 0,
      parameters: [baselineParameter],
      policies: [coursePolicy],
      referenceFingerprint: "a".repeat(64)
    }),
    comparisonMember({
      courseId: VARIANT_B,
      position: 1,
      parameters: [baselineParameter, {
        ...baselineParameter,
        scopeKind: "lesson",
        scopeId: "lesson-a",
        value: 3,
        origin: "author",
        sourceScope: { kind: "lesson", ref: "lesson-a" }
      }],
      policies: [coursePolicy, {
        ...coursePolicy,
        scopeKind: "didactic_microsequence",
        scopeId: "micro-a",
        policy: {
          ...defaultPolicy,
          availability: "allow_only",
          allowedRefs: ["text"],
          preferredRefs: ["text"]
        },
        origin: "author",
        sourceScope: { kind: "didactic_microsequence", ref: "micro-a" }
      }],
      referenceFingerprint: "b".repeat(64)
    })
  ];
  const result = await database.query(`
    select private.course_variant_comparison_differences_v1($1::jsonb) value
  `, [JSON.stringify(members)]);
  const accidental = result.rows[0].value.accidentalDeviations;
  assert.ok(accidental.some((entry) =>
    entry.kind === "parameter" && entry.scopeKind === "lesson" &&
    entry.scopeId === "lesson-a"
  ));
  assert.ok(accidental.some((entry) =>
    entry.kind === "component_policy" &&
    entry.scopeKind === "didactic_microsequence" && entry.scopeId === "micro-a"
  ));
  const references = accidental.find((entry) => entry.kind === "source_references");
  assert.equal(references.expectedValue.sourceCount, references.actualValue.sourceCount);
  assert.notEqual(references.expectedValue.fingerprint, references.actualValue.fingerprint);
  await assert.rejects(
    database.query(
      "select private.course_variant_comparison_differences_v1($1::jsonb)",
      [JSON.stringify([...members].reverse())]
    ),
    /fora de ordem/u
  );
  await database.close();
});

test("SQL coleta fatos efetivos locais de Lição e Microssequência sem copiar Unidades", async () => {
  const migration = await fs.readFile(completionMigrationUrl, "utf8");
  const functionStart = migration.indexOf(
    "create function private.course_variant_member_facts_v1("
  );
  const functionEnd = migration.indexOf(
    "create function private.course_variant_comparison_differences_v1(",
    functionStart
  );
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const database = new PGlite();
  await database.exec(`
    create schema private;
    create table public.courses(id uuid primary key,title text not null);
    create table private.course_entities(
      course_id uuid not null,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null default 0,
      content jsonb not null default '{}'::jsonb,
      version bigint not null default 1
    );
    create table private.course_authoring_parts(
      id uuid primary key,
      course_id uuid not null,
      position integer not null,
      title text not null,
      intent text not null,
      version bigint not null,
      retired_at timestamptz
    );
    create table private.course_authoring_part_materializations(
      id uuid primary key,
      course_id uuid not null,
      authoring_part_id uuid not null,
      status text not null,
      version bigint not null,
      updated_at timestamptz not null
    );
    create table private.course_authoring_part_didactic_microsequences(
      course_id uuid not null,
      authoring_part_id uuid not null,
      didactic_microsequence_id text not null
    );
    create table private.course_source_revisions(
      course_id uuid not null,
      source_id text not null,
      revision bigint not null,
      status text not null,
      kind text,
      title text,
      citation_text text,
      url text,
      edition_or_version text,
      study_visibility text,
      authorship text,
      publication_date text,
      identifier text,
      language text,
      origin text,
      availability text,
      verification_status text
    );
    create table private.course_source_anchor_revisions(
      course_id uuid not null,
      anchor_id text not null,
      revision bigint not null,
      source_id text not null,
      source_revision bigint not null,
      status text not null,
      selector jsonb not null,
      verification_excerpt text
    );
    create table private.course_source_attachments(
      course_id uuid not null,
      source_id text not null,
      source_revision bigint not null,
      content_hash text not null,
      byte_size bigint not null,
      media_type text not null,
      storage_path text not null
    );
    create function private.course_variant_plan_snapshot_hash_v1(jsonb)
    returns text language sql immutable as $$select repeat('a',64)$$;
    create function private.course_design_scope_path_v1(uuid,text,text)
    returns jsonb language sql stable as $$
      select jsonb_build_array(jsonb_build_object('kind',$2,'ref',$3))
    $$;
    create function private.course_design_parameters_for_scope_v1(
      p_course_id uuid,p_scope_path jsonb
    ) returns jsonb language plpgsql stable as $$
    declare
      v_kind text := p_scope_path->-1->>'kind';
      v_ref text := p_scope_path->-1->>'ref';
      v_local boolean := p_course_id='${VARIANT_B}'::uuid
        and v_kind='lesson' and v_ref='lesson-a';
    begin
      return jsonb_build_array(jsonb_build_object(
        'parameterId','analysis_density',
        'localAssignment',case when v_local then jsonb_build_object(
          'value',3,'origin','author'
        ) else null end,
        'effectiveAssignment',jsonb_build_object(
          'value',case when v_local then 3 else 1 end,
          'origin',case when v_local then 'author' else 'system_default' end,
          'sourceScope',case when v_local then jsonb_build_object(
            'kind','lesson','ref','lesson-a'
          ) else null end
        )
      ));
    end
    $$;
    create function private.course_component_policy_for_scope_v1(
      p_course_id uuid,p_scope_path jsonb
    ) returns jsonb language plpgsql stable as $$
    declare
      v_kind text := p_scope_path->-1->>'kind';
      v_ref text := p_scope_path->-1->>'ref';
      v_local boolean := p_course_id='${VARIANT_B}'::uuid
        and v_kind='didactic_microsequence' and v_ref='micro-a';
      v_policy jsonb := jsonb_build_object(
        'catalogVersion','1','availability',case when v_local then 'allow_only' else 'all' end,
        'allowedRefs',case when v_local then '["text"]'::jsonb else '[]'::jsonb end,
        'excludedRefs','[]'::jsonb,'preferredRefs','[]'::jsonb
      );
    begin
      return jsonb_build_object(
        'localChange',case when v_local then jsonb_build_object(
          'policy',v_policy,'origin','author'
        ) else null end,
        'effectiveChange',jsonb_build_object(
          'policy',v_policy,
          'origin',case when v_local then 'author' else 'system_default' end,
          'sourceScope',case when v_local then jsonb_build_object(
            'kind','didactic_microsequence','ref','micro-a'
          ) else null end
        )
      );
    end
    $$;
    create function private.course_component_refs_from_content_v1(jsonb)
    returns text[] language sql immutable as $$select array[]::text[]$$;
  `);
  await database.exec(migration.slice(functionStart, functionEnd));
  await database.query(
    "insert into public.courses(id,title) values($1,'A'),($2,'B')",
    [VARIANT_A, VARIANT_B]
  );
  for (const courseId of [VARIANT_A, VARIANT_B]) {
    await database.query(`
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ($1,'lesson','lesson-a','module','module-a',0,'{"title":"Lição"}'::jsonb),
        ($1,'microsequence','micro-a','lesson','lesson-a',0,'{"title":"Micro"}'::jsonb)
    `, [courseId]);
  }
  const result = await database.query(`
    select private.course_variant_member_facts_v1($1) value
  `, [VARIANT_B]);
  const facts = result.rows[0].value;
  assert.ok(facts.effectiveParameters.some((entry) =>
    entry.scopeKind === "lesson" && entry.scopeId === "lesson-a" && entry.value === 3
  ));
  assert.ok(facts.effectiveComponentPolicies.some((entry) =>
    entry.scopeKind === "didactic_microsequence" && entry.scopeId === "micro-a"
  ));
  assert.equal(facts.materialization.studyUnitCount, 0);
  assert.equal(facts.references.fingerprint, "a".repeat(64));
  await database.close();
});

test("RPC autoriza PDF herdado pelo vínculo atual e declara a origem física exata", async () => {
  const migration = await fs.readFile(completionMigrationUrl, "utf8");
  const functionStart = migration.indexOf(
    "create or replace function public.get_course_source_attachment_access_for_actor_v1("
  );
  const functionEnd = migration.indexOf(
    "-- Cross-Course paths are accepted only",
    functionStart
  );
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;
    create schema storage;
    create table auth.users(id uuid primary key);
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null,
      revision bigint not null
    );
    create table private.course_source_revisions(
      course_id uuid not null,
      source_id text not null,
      revision bigint not null,
      status text not null,
      primary key(course_id,source_id,revision)
    );
    create table private.course_source_attachments(
      course_id uuid not null,
      source_id text not null,
      source_revision bigint not null,
      content_hash text not null,
      byte_size bigint not null,
      media_type text not null,
      storage_path text not null,
      primary key(course_id,source_id,source_revision,content_hash)
    );
    create function private.course_source_pdf_unique_bytes_v1(p_course_id uuid)
    returns bigint language sql stable as $$
      select coalesce(sum(unique_object.byte_size),0)::bigint
      from (
        select max(attachment.byte_size)::bigint byte_size
        from private.course_source_attachments attachment
        where attachment.course_id=p_course_id
        group by attachment.content_hash
      ) unique_object
    $$;
    create table storage.objects(
      id uuid primary key,
      bucket_id text not null,
      name text not null,
      metadata jsonb,
      unique(bucket_id,name)
    );
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
    create function private.valid_course_source_pdf_object_v1(
      p_storage_path text,p_byte_size bigint,p_media_type text
    ) returns boolean language sql stable as $$
      select exists(
        select 1 from storage.objects
        where bucket_id='course-source-pdfs' and name=p_storage_path
          and (metadata->>'size')::bigint=p_byte_size
          and metadata->>'mimetype'=p_media_type
      )
    $$;
  `);
  await database.exec(migration.slice(functionStart, functionEnd));
  const sourceCourseId = COURSE;
  const variantCourseId = VARIANT_A;
  const contentHash = "f".repeat(64);
  const storagePath = `${sourceCourseId}/${contentHash}.pdf`;
  await database.query("insert into auth.users(id) values($1)", [OWNER]);
  await database.query(
    "insert into public.courses(id,owner_id,revision) values($1,$2,4)",
    [variantCourseId, OWNER]
  );
  await database.query(`
    insert into private.course_source_revisions(course_id,source_id,revision,status)
    values($1,'source-a',1,'active')
  `, [variantCourseId]);
  await database.query(`
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path
    ) values($1,'source-a',1,$2,1024,'application/pdf',$3)
  `, [variantCourseId, contentHash, storagePath]);
  await database.query(`
    insert into storage.objects(id,bucket_id,name,metadata)
    values('77777777-7777-4777-8777-777777777777','course-source-pdfs',$1,$2)
  `, [storagePath, JSON.stringify({ size: "1024", mimetype: "application/pdf" })]);

  const prepared = await database.query(`
    select public.get_course_source_attachment_access_for_actor_v1(
      $1,$2,4,'prepare_upload','source-a',1,$3,1024,'application/pdf'
    ) value
  `, [OWNER, variantCourseId, contentHash]);
  assert.equal(prepared.rows[0].value.courseId, variantCourseId);
  assert.equal(prepared.rows[0].value.storageOriginCourseId, sourceCourseId);
  assert.equal(prepared.rows[0].value.attachment.storagePath, storagePath);
  assert.equal(prepared.rows[0].value.alreadyLinked, true);
  assert.equal(prepared.rows[0].value.uploadRequired, false);

  for (const [digit, byteSize] of [["a", 16_777_216], ["b", 16_777_216], ["c", 16_777_216]]) {
    const hash = digit.repeat(64);
    await database.query(`
      insert into private.course_source_attachments(
        course_id,source_id,source_revision,content_hash,byte_size,media_type,storage_path
      ) values($1,'source-a',1,$2,$3,'application/pdf',$4)
    `, [variantCourseId, hash, byteSize, `${variantCourseId}/${hash}.pdf`]);
  }
  await assert.rejects(
    database.query(`
      select public.get_course_source_attachment_access_for_actor_v1(
        $1,$2,4,'prepare_upload','source-a',1,$3,20971520,'application/pdf'
      )
    `, [OWNER, variantCourseId, "d".repeat(64)]),
    (error) => error.code === "23514"
      && /cota de 64 MiB/u.test(error.message)
  );

  await database.query("delete from storage.objects where name=$1", [storagePath]);
  await assert.rejects(
    database.query(`
      select public.get_course_source_attachment_access_for_actor_v1(
        $1,$2,4,'prepare_upload','source-a',1,$3,1024,'application/pdf'
      )
    `, [OWNER, variantCourseId, contentHash]),
    (error) => error.code === "55000"
  );
  await database.close();
});

test("variantes materializam separadamente, compartilham o objeto PDF e desvinculam sem apagar Curso", async () => {
  const baseMigration = await fs.readFile(migrationUrl, "utf8");
  const listingMigration = await fs.readFile(listingMigrationUrl, "utf8");
  const completionMigration = await fs.readFile(completionMigrationUrl, "utf8");
  assert.match(baseMigration,
    /where entity\.course_id = p_source_course_id;\r?\n\r?\n {2}insert into private\.course_instructional_plans\(/u);
  assert.match(baseMigration,
    /from private\.course_source_anchor_revisions anchor\r?\n {2}where anchor\.course_id = p_source_course_id;\r?\n\r?\n {2}if exists\(/u);
  assert.match(completionMigration, /entity\.entity_type <> 'study_unit'/u);
  assert.match(completionMigration, /attachment\.storage_path/u);

  const database = await databaseWithVariantAuthorities();
  await database.exec(`
    alter table public.courses add column revision bigint not null default 1;
    create table private.course_change_receipts(
      actor_id uuid not null,
      request_id text not null,
      operation text not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      request_hash text not null,
      result jsonb not null,
      expires_at timestamptz not null default now()+interval '1 day',
      primary key(actor_id,request_id)
    );
    create table private.course_entities(
      course_id uuid not null references public.courses(id) on delete cascade,
      entity_type text not null,
      entity_id text not null,
      primary key(course_id,entity_type,entity_id)
    );
    create schema storage;
    create table storage.objects(
      id uuid primary key,
      bucket_id text not null,
      name text not null,
      unique(bucket_id,name)
    );
    create table private.course_source_attachments(
      course_id uuid not null references public.courses(id) on delete cascade,
      source_id text not null,
      source_revision bigint not null,
      content_hash text not null,
      storage_path text not null,
      primary key(course_id,source_id,source_revision,content_hash)
    );
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
    create function extensions.digest(bytea,text)
    returns bytea language sql immutable as $$
      select decode(repeat('ab',32),'hex')
    $$;
  `);
  const detachStart = baseMigration.indexOf(
    "create function public.detach_course_variant_for_actor_v1("
  );
  const detachEnd = baseMigration.indexOf("revoke all on function public.detach_course_variant_for_actor_v1(", detachStart);
  assert.ok(detachStart >= 0 && detachEnd > detachStart);
  await database.exec(baseMigration.slice(detachStart, detachEnd));
  const listingStart = listingMigration.indexOf(
    "create function public.list_owned_course_variant_comparisons_for_actor_v1("
  );
  const listingEnd = listingMigration.indexOf(
    "revoke all on function public.list_owned_course_variant_comparisons_for_actor_v1(",
    listingStart
  );
  assert.ok(listingStart >= 0 && listingEnd > listingStart);
  await database.exec(listingMigration.slice(listingStart, listingEnd));

  await database.query("insert into auth.users(id) values($1)", [OWNER]);
  await database.query(
    "insert into public.courses(id,owner_id) values($1,$2),($3,$2),($4,$2)",
    [COURSE, OWNER, VARIANT_A, VARIANT_B]
  );
  await database.query(`
    insert into private.course_variant_plan_checkpoints(
      id,owner_id,source_course_id,source_course_revision,source_plan_version,
      plan_snapshot,snapshot_hash
    ) values($1,$2,$3,1,1,'{}'::jsonb,repeat('a',64))
  `, [CHECKPOINT, OWNER, COURSE]);
  await database.query(`
    insert into private.course_variant_comparison_sets(
      id,owner_id,checkpoint_id,source_course_id,source_course_revision
    ) values($1,$2,$3,$4,1)
  `, [SET, OWNER, CHECKPOINT, COURSE]);
  await database.query(`
    insert into private.course_variant_comparison_members(
      comparison_set_id,course_id,position,label,attached_course_revision
    ) values($1,$2,0,'Z',1),($1,$3,1,'A',1)
  `, [SET, VARIANT_A, VARIANT_B]);

  const contentHash = "e".repeat(64);
  const storagePath = `${COURSE}/${contentHash}.pdf`;
  await database.query(`
    insert into storage.objects(id,bucket_id,name)
    values('77777777-7777-4777-8777-777777777777','course-source-pdfs',$1)
  `, [storagePath]);
  await database.query(`
    insert into private.course_source_attachments(
      course_id,source_id,source_revision,content_hash,storage_path
    ) values($1,'source-a',1,$3,$4),($2,'source-a',1,$3,$4)
  `, [VARIANT_A, VARIANT_B, contentHash, storagePath]);
  await database.query(`
    insert into private.course_entities(course_id,entity_type,entity_id)
    values($1,'study_unit','unit-a')
  `, [VARIANT_A]);

  const independent = await database.query(`
    select course_id,count(*)::integer as count
    from private.course_entities
    where course_id in($1,$2)
    group by course_id order by course_id
  `, [VARIANT_A, VARIANT_B]);
  assert.deepEqual(independent.rows, [{ course_id: VARIANT_A, count: 1 }]);
  const shared = await database.query(`
    select count(*)::integer as links,
      count(distinct storage_path)::integer as paths,
      (select count(*)::integer from storage.objects) as objects
    from private.course_source_attachments
  `);
  assert.deepEqual(shared.rows[0], { links: 2, paths: 1, objects: 1 });

  const detached = await database.query(`
    select public.detach_course_variant_for_actor_v1(
      $1,$2,$3,$4,'request-variant-detach-1'
    ) value
  `, [OWNER, COURSE, SET, VARIANT_A]);
  assert.equal(detached.rows[0].value.changed, true);
  const after = await database.query(`
    select
      (select count(*)::integer from public.courses) as courses,
      (select count(*)::integer from private.course_source_attachments) as links,
      (select count(*)::integer from storage.objects) as objects,
      (select detached_at is not null from private.course_variant_comparison_members
        where comparison_set_id=$1 and course_id=$2) as detached
  `, [SET, VARIANT_A]);
  assert.deepEqual(after.rows[0], { courses: 3, links: 2, objects: 1, detached: true });

  const activeAfterFirstDetach = await database.query(`
    select course_id,label,
      (row_number() over(order by position,course_id)-1)::integer as position
    from private.course_variant_comparison_members
    where comparison_set_id=$1 and detached_at is null
    order by position,course_id
  `, [SET]);
  assert.deepEqual(activeAfterFirstDetach.rows, [{
    course_id: VARIANT_B,
    label: "A",
    position: 0
  }]);
  const detachedLast = await database.query(`
    select public.detach_course_variant_for_actor_v1(
      $1,$2,$3,$4,'request-variant-detach-2'
    ) value
  `, [OWNER, COURSE, SET, VARIANT_B]);
  assert.equal(detachedLast.rows[0].value.changed, true);
  const listed = await database.query(`
    select public.list_owned_course_variant_comparisons_for_actor_v1(
      $1,$2,1
    ) value
  `, [OWNER, COURSE]);
  assert.deepEqual(listed.rows[0].value.items.map((item) => ({
    memberCount: item.memberCount,
    attachedCount: item.attachedCount,
    detachedCount: item.detachedCount
  })), [{ memberCount: 2, attachedCount: 0, detachedCount: 2 }]);
  const preservedCourses = await database.query(
    "select count(*)::integer count from public.courses"
  );
  assert.equal(preservedCourses.rows[0].count, 3);
  await database.close();
});

test("migration avança o manifesto somente após PDF e Analytics", async () => {
  const migration = await fs.readFile(completionMigrationUrl, "utf8");
  const manifestStart = migration.indexOf(
    "do $advance_course_variant_factual_comparison_runtime_manifest$"
  );
  const manifestEnd = migration.indexOf("\ncommit;", manifestStart);
  assert.ok(manifestStart >= 0 && manifestEnd > manifestStart);
  assert.match(migration, /schemaRevision' <> '20260820063156'/u);
  assert.match(migration, /course-source-pdf-attachments-v1/u);
  assert.match(migration, /course-authoring-analytics-v1/u);

  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $$
      select '{
        "schemaRevision":"20260820063156",
        "contractVersion":1,
        "features":[
          "course-source-pdf-attachments-v1",
          "course-authoring-analytics-v1",
          "course-variant-comparisons-v1"
        ]
      }'::jsonb
    $$;
  `);
  const manifestSegment = migration.slice(manifestStart, manifestEnd);
  await database.exec(manifestSegment);
  const result = await database.query("select public.get_aralearn_runtime_manifest() value");
  assert.equal(result.rows[0].value.schemaRevision, "20260820065720");
  assert.ok(result.rows[0].value.features.includes("course-variant-factual-comparison-v1"));

  await database.exec(`
    create or replace function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $$
      select '{"schemaRevision":"20260820061206","contractVersion":1,"features":[]}'::jsonb
    $$
  `);
  await assert.rejects(
    database.exec(manifestSegment),
    (error) => error.code === "55000"
  );
  await database.close();
});
