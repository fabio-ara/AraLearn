import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { TrailPersonalStateRepository } from "../../src/persistence/TrailPersonalStateRepository.js";

const unifiedUrl = new URL(
  "../../supabase/migrations/20260807210000_unified_trails.sql",
  import.meta.url
);
const stateUrl = new URL(
  "../../supabase/migrations/20260807220000_trail_personal_state.sql",
  import.meta.url
);
const observationUrl = new URL(
  "../../supabase/migrations/20260807225000_trail_observation_threads.sql",
  import.meta.url
);
const cleanCutoverUrl = new URL(
  "../../supabase/migrations/20260807230000_unified_trails_clean_cutover.sql",
  import.meta.url
);

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const COURSE = "20000000-0000-4000-8000-000000000001";
const COURSE_ONLY = "20000000-0000-4000-8000-000000000002";
const COURSE_CATALOG = "20000000-0000-4000-8000-000000000003";
const SELECTION = "30000000-0000-4000-8000-000000000001";
const SELECTION_ONLY = "30000000-0000-4000-8000-000000000002";

class MemorySyncState {
  constructor() {
    this.values = new Map();
  }

  async getSyncState(key) {
    return structuredClone(this.values.get(key) ?? null);
  }

  async putSyncState(key, value) {
    if (value === null) this.values.delete(key);
    else this.values.set(key, structuredClone(value));
  }
}
const LEGACY_LESSON_PROGRESS = "31000000-0000-4000-8000-000000000001";
const LEGACY_CARD_PROGRESS = "31000000-0000-4000-8000-000000000002";

async function prepare({
  sourceCourse = false,
  legacyObservation = false,
  legacyState = false,
  legacyCursorWithoutCard = false,
  dualPublication = false,
  conflictingPublication = false,
  terminalSubmission = false,
  inactiveSelection = false
} = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema extensions;
    create function extensions.digest(bytea,text) returns bytea
      language sql immutable as $$
      select decode(md5(convert_from($1,'UTF8')) || md5(convert_from($1,'UTF8')),'hex')
    $$;

    create table auth.users(id uuid primary key, email text not null);
    insert into auth.users values
      ('${USER}','owner@example.test'), ('${OTHER}','learner@example.test');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table public.courses(
      id uuid primary key,
      owner_id uuid,
      status text not null default 'published',
      deleted_at timestamptz,
      document_storage_enabled boolean not null default true,
      title text not null,
      goal text not null default '',
      module_count integer not null default 0,
      lesson_count integer not null default 0,
      microsequence_count integer not null default 0,
      card_count integer not null default 0,
      content_hash text,
      current_revision_hash text,
      publication_seq bigint not null default 1,
      contract_key text not null default 'course',
      updated_at timestamptz not null default now()
    );
    create table public.user_course_selections(
      id uuid primary key,
      user_id uuid not null references auth.users(id),
      course_id uuid not null references public.courses(id) on delete cascade,
      position integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(id,user_id), unique(user_id,course_id)
    );
    create table public.study_paths(
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      title text not null,
      position integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(id,owner_id)
    );
    create table public.study_path_courses(
      id uuid primary key,
      path_id uuid not null,
      owner_id uuid not null references auth.users(id),
      selection_id uuid not null,
      position integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      foreign key(path_id,owner_id) references public.study_paths(id,owner_id),
      foreign key(selection_id,owner_id)
        references public.user_course_selections(id,user_id),
      unique(path_id,selection_id), unique(owner_id,selection_id), unique(id,owner_id)
    );
    create index study_path_courses_path_position_idx
      on public.study_path_courses(path_id,position,id);
    create index study_path_courses_owner_idx
      on public.study_path_courses(owner_id,selection_id);
    alter table public.study_path_courses enable row level security;
    create policy study_path_courses_owner on public.study_path_courses
      for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());

    create table public.lesson_progress(
      id uuid primary key,
      selection_id uuid not null,
      user_id uuid not null,
      course_id uuid not null,
      lesson_id uuid not null,
      course_key text,
      module_key text,
      lesson_key text,
      path_key text,
      cursor integer,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.card_progress(
      id uuid primary key,
      selection_id uuid not null,
      user_id uuid not null,
      course_id uuid not null,
      card_id uuid not null,
      course_key text,
      module_key text,
      lesson_key text,
      microsequence_key text,
      card_key text,
      path_key text,
      completed_at timestamptz,
      review_marked_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.card_comments(
      id uuid primary key,
      selection_id uuid not null,
      user_id uuid not null,
      course_id uuid not null,
      card_id uuid not null,
      course_key text,
      module_key text,
      lesson_key text,
      microsequence_key text,
      card_key text,
      category text not null default 'observation',
      status text not null default 'open',
      body text not null default '',
      response text,
      responded_by uuid,
      responded_at timestamptz,
      resolution_note text,
      resolved_by uuid,
      resolved_at timestamptz,
      correction_request_id text,
      correction_entity_path text[],
      correction_linked_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid not null,
      title text not null,
      purpose text not null default '',
      brief text not null default '',
      revision bigint not null default 1,
      source_course_id uuid,
      source_revision_hash text,
      source_submission_id uuid,
      deleted_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null default 0,
      content jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key(workspace_id,entity_type,entity_id)
    );
    create table private.educational_workspace_members(
      workspace_id uuid not null,
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null,
      primary key(workspace_id,user_id)
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid not null,
      workspace_course_id text not null,
      target text not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      content_hash text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id,workspace_course_id,target)
    );
    create table private.catalog_review_submissions(
      id uuid primary key,
      author_id uuid,
      source_course_id uuid not null references public.courses(id) on delete restrict,
      source_revision_hash text not null default repeat('a',64),
      artifact_hash text,
      status text not null,
      reviewer_id uuid,
      review_workspace_id uuid,
      review_started_at timestamptz,
      claim_expires_at timestamptz,
      reviewer_note text,
      decided_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table private.authoring_workspace_observations(workspace_id uuid);
    create table private.authoring_workspace_observation_receipts(result jsonb);
    create table private.authoring_workspace_events(workspace_id uuid);
    create table private.educational_workspace_invitations(workspace_id uuid);
    create table private.authoring_workspace_requests(workspace_id uuid);
    create table private.authoring_course_workspace_reservations(workspace_id uuid);
    create table private.sync_changes(
      sequence bigint generated always as identity primary key,
      audience_user_id uuid,
      course_id uuid,
      entity_type text not null,
      entity_id uuid,
      operation text not null
    );
    create table private.sync_retention_policy(
      singleton boolean primary key default true,
      compacted_through_sequence bigint not null default 0
    );
    insert into private.sync_retention_policy values(true,0);
    create table private.sync_devices(
      id uuid not null,
      user_id uuid not null,
      last_pulled_sequence bigint not null default 0,
      last_processed_mutation_sequence bigint not null default 0,
      last_seen_at timestamptz,
      inactive_at timestamptz,
      primary key(user_id,id)
    );
    create table private.educational_workspace_receipts(
      actor_id uuid not null,
      request_id text not null,
      operation text not null,
      payload_hash text not null default repeat('a',64),
      result jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '7 days',
      primary key(actor_id,request_id),
      constraint educational_workspace_receipts_operation_v2 check(
        operation in (
          'create','update','invite','accept_invite','cancel_invite',
          'set_role','remove_member','transfer_owner','leave',
          'respond_comment','set_comment_status','link_comment_correction'
        )
      )
    );

    create function private.touch_lean_row() returns trigger language plpgsql as $$
    begin new.updated_at=now(); return new; end $$;
    create function private.try_uuid(text) returns uuid language plpgsql immutable as $$
    begin return $1::uuid; exception when others then return null; end $$;
    create function private.educational_workspace_can_v1(uuid,uuid,text)
      returns boolean language sql stable as $$
      select exists(
        select 1
        from private.authoring_workspaces workspace
        join private.educational_workspace_members member
          on member.workspace_id=workspace.id and member.user_id=$2
        where workspace.id=$1 and workspace.deleted_at is null
          and (
            member.role in ('owner','admin','author')
            or ($3='read' and member.role in ('reviewer','learner','reader'))
            or ($3='comment' and member.role in ('reviewer','learner'))
            or ($3='review' and member.role='reviewer')
          )
      )
    $$;
    create function private.require_educational_workspace_capability_v1(
      p_workspace_id uuid, p_actor_id uuid, p_capability text
    ) returns text language plpgsql stable as $$
    begin
      if not private.educational_workspace_can_v1(
        p_workspace_id, p_actor_id, p_capability
      ) then
        raise exception 'Ação não permitida neste workspace.' using errcode='42501';
      end if;
      return case when p_actor_id='${USER}'::uuid then 'owner' else 'learner' end;
    end $$;
    create function private.can_publish_catalog_v5(uuid)
      returns boolean language sql stable as $$ select $1='${USER}'::uuid $$;
    create function private.can_review_catalog_v5(uuid)
      returns boolean language sql stable as $$ select $1='${USER}'::uuid $$;
    create function private.selection_row(uuid) returns jsonb language sql stable as $$
      select jsonb_build_object('id',s.id,'courseId',s.course_id)
      from public.user_course_selections s where s.id=$1
    $$;
    create function public.select_catalog_course(uuid,uuid) returns jsonb
      language plpgsql as $$
      declare v_id uuid;
      begin
        insert into public.user_course_selections(id,user_id,course_id)
        values(gen_random_uuid(),auth.uid(),$1)
        on conflict(user_id,course_id) do update set updated_at=now()
        returning id into v_id;
        return jsonb_build_object('selectionId',v_id,'row',private.selection_row(v_id),
          'idempotent',false);
      end
      $$;
    create function public.unselect_catalog_course(uuid,uuid) returns jsonb
      language plpgsql as $$
      declare v_id uuid;
      begin
        delete from public.user_course_selections
        where user_id=auth.uid() and course_id=$1 returning id into v_id;
        return jsonb_build_object('selectionId',v_id,'row',null,'idempotent',false);
      end
      $$;
    create function private.current_personal_row(text,uuid,uuid)
      returns jsonb language sql stable as $$ select null::jsonb $$;
    create function public.get_aralearn_runtime_manifest()
      returns jsonb language sql stable as $$
      select jsonb_build_object('schemaRevision','base','contractVersion',4,
        'features','[]'::jsonb)
    $$;

    insert into private.authoring_workspaces(id,owner_id,title)
      values('${WORKSPACE}','${USER}','Workspace');
    insert into private.educational_workspace_members(workspace_id,user_id,role)
      values('${WORKSPACE}','${USER}','owner');
    insert into private.authoring_workspace_entities
      (workspace_id,entity_type,entity_id,parent_type,parent_id,position,content)
    values
      ('${WORKSPACE}','course','course-a',null,null,0,
        '{"title":"Curso A","goal":"A"}'),
      ('${WORKSPACE}','module','module-a','course','course-a',0,'{}'),
      ('${WORKSPACE}','lesson','lesson-a','module','module-a',0,'{}'),
      ('${WORKSPACE}','microsequence','micro-a','lesson','lesson-a',0,'{}'),
      ('${WORKSPACE}','card','card-a','microsequence','micro-a',0,'{}'),
      ('${WORKSPACE}','course','course-b',null,null,1,
        '{"title":"Curso B","goal":"B"}'),
      ('${WORKSPACE}','module','module-b','course','course-b',0,'{}'),
      ('${WORKSPACE}','lesson','lesson-b','module','module-b',0,'{}'),
      ('${WORKSPACE}','microsequence','micro-b','lesson','lesson-b',0,'{}'),
      ('${WORKSPACE}','card','card-b1','microsequence','micro-b',0,'{}'),
      ('${WORKSPACE}','card','card-b2','microsequence','micro-b',1,'{}');
  `);
  if (sourceCourse) {
    await db.query(
      "insert into public.courses(id,title,contract_key) values($1,'Curso de origem','course-a')",
      [COURSE]
    );
    await db.query(
      "insert into public.user_course_selections(id,user_id,course_id) values($1,$2,$3)",
      [SELECTION, USER, COURSE]
    );
    await db.query(
      "update private.authoring_workspaces set source_course_id=$1 where id=$2",
      [COURSE, WORKSPACE]
    );
    if (dualPublication) {
      await db.query("update public.courses set owner_id=$1 where id=$2", [USER, COURSE]);
      await db.query(
        "insert into public.courses(id,title,contract_key) values($1,'Curso no catálogo','course-a')",
        [COURSE_CATALOG]
      );
      await db.query(
        `insert into public.user_course_selections(id,user_id,course_id)
         values('30000000-0000-4000-8000-000000000003',$1,$2)`,
        [USER, COURSE_CATALOG]
      );
      await db.query(
        `insert into private.authoring_workspace_publications(
          workspace_id,workspace_course_id,target,course_id,content_hash
        ) values
          ($1,'course-a','private',$2,$4),
          ($1,'course-a','catalog',$3,$5)`,
        [WORKSPACE, COURSE, COURSE_CATALOG, "a".repeat(64), "b".repeat(64)]
      );
    }
    if (conflictingPublication) {
      await db.exec(`
        insert into private.authoring_workspaces(id,owner_id,title)
        values('10000000-0000-4000-8000-000000000099','${USER}','Conflito');
        insert into private.educational_workspace_members(workspace_id,user_id,role)
        values('10000000-0000-4000-8000-000000000099','${USER}','owner');
        insert into private.authoring_workspace_entities(
          workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
        ) values('10000000-0000-4000-8000-000000000099','course','course-conflict',
          null,null,0,'{}'::jsonb);
        insert into private.authoring_workspace_publications(
          workspace_id,workspace_course_id,target,course_id,content_hash
        ) values
          ('${WORKSPACE}','course-a','private','${COURSE}',repeat('a',64)),
          ('10000000-0000-4000-8000-000000000099','course-conflict','private',
            '${COURSE}',repeat('b',64));
      `);
    }
    if (terminalSubmission) {
      await db.query(`
        insert into private.catalog_review_submissions(
          id,author_id,source_course_id,source_revision_hash,artifact_hash,status
        ) values(
          '79000000-0000-4000-8000-000000000001',$1,$2,$3,$3,'rejected'
        )
      `, [USER, COURSE, "9".repeat(64)]);
    }
    if (legacyState || legacyCursorWithoutCard) {
      await db.query(
        `insert into public.lesson_progress(
          id,selection_id,user_id,course_id,lesson_id,
          course_key,module_key,lesson_key,path_key,cursor,completed_at,updated_at
        ) values($1,$2,$3,$4,$5,'course-a','module-a','lesson-a',
          'chave-antiga-incorreta',0,$6,$6)`,
        [
          LEGACY_LESSON_PROGRESS, SELECTION, USER, COURSE,
          "32000000-0000-4000-8000-000000000001", "2026-08-07T10:00:00Z"
        ]
      );
    }
    if (legacyState) {
      await db.query(
        `insert into public.card_progress(
          id,selection_id,user_id,course_id,card_id,
          course_key,module_key,lesson_key,microsequence_key,card_key,path_key,
          completed_at,review_marked_at,updated_at
        ) values($1,$2,$3,$4,$5,'course-a','module-a','lesson-a','micro-a','card-a',
          'outra-chave-antiga-incorreta',$6,$7,$7)`,
        [
          LEGACY_CARD_PROGRESS, SELECTION, USER, COURSE,
          "32000000-0000-4000-8000-000000000002",
          "2026-08-07T10:01:00Z", "2026-08-07T10:02:00Z"
        ]
      );
      if (dualPublication) {
        await db.query(`
          insert into public.card_progress(
            id,selection_id,user_id,course_id,card_id,
            course_key,module_key,lesson_key,microsequence_key,card_key,path_key,
            completed_at,review_marked_at,updated_at
          ) values(
            '31000000-0000-4000-8000-000000000099',
            '30000000-0000-4000-8000-000000000003',$1,$2,
            '32000000-0000-4000-8000-000000000099',
            'course-a','module-b','lesson-b','micro-b','card-a','legado-movido',
            '2026-08-07T10:03:00Z','2026-08-07T10:04:00Z',
            '2026-08-07T10:04:00Z'
          )
        `, [USER, COURSE_CATALOG]);
      }
    }
    if (legacyObservation) {
      await db.query(
        "insert into public.courses(id,title,contract_key) values($1,'Somente seleção','course-only')",
        [COURSE_ONLY]
      );
      await db.query(
        "insert into public.user_course_selections(id,user_id,course_id) values($1,$2,$3)",
        [SELECTION_ONLY, USER, COURSE_ONLY]
      );
      await db.query(`
        insert into public.card_comments(
          id,selection_id,user_id,course_id,card_id,
          course_key,module_key,lesson_key,microsequence_key,card_key,
          category,status,body,response,responded_by,responded_at,
          resolution_note,resolved_by,resolved_at,
          correction_request_id,correction_entity_path,correction_linked_at,
          created_at,updated_at
        ) values(
          '90000000-0000-4000-8000-000000000001',$1,$2,$3,
          '70000000-0000-4000-8000-000000000001',
          'course-a','module-a','lesson-a','micro-a','card-a',
          'possible_error','incorporated','Há uma inconsistência.',
          'Corrigido.',$2,now(),'Revisado.',$2,now(),
          'workspace:repair:legacy',array['course-a','module-a','lesson-a','micro-a','card-a'],now(),
          '2026-08-07T09:00:00Z','2026-08-07T09:00:00Z'
        )
      `, [SELECTION, USER, COURSE]);
      await db.query(`
        insert into public.card_comments(
          id,selection_id,user_id,course_id,card_id,
          course_key,module_key,lesson_key,microsequence_key,card_key,
          category,status,body,response,responded_by,responded_at,
          resolution_note,resolved_by,resolved_at
        ) values(
          '90000000-0000-4000-8000-000000000002',$1,$2,$3,
          '70000000-0000-4000-8000-000000000002',
          'course-only','module-only','lesson-only','micro-only','card-only',
          'question','resolved','Observação sem workspace.',
          'Resposta preservada.',$2,now(),'Encerrada.',$2,now()
        )
      `, [SELECTION_ONLY, USER, COURSE_ONLY]);
      if (dualPublication) {
        await db.query(`
          insert into public.card_comments(
            id,selection_id,user_id,course_id,card_id,
            course_key,module_key,lesson_key,microsequence_key,card_key,
            category,status,body,created_at,updated_at
          ) values(
            '90000000-0000-4000-8000-000000000099',
            '30000000-0000-4000-8000-000000000003',$1,$2,
            '70000000-0000-4000-8000-000000000099',
            'course-a','module-b','lesson-b','micro-b','card-a',
            'suggestion','open','Observação mais recente.',
            '2026-08-07T10:05:00Z','2026-08-07T10:05:00Z'
          )
        `, [USER, COURSE_CATALOG]);
      }
    }
    if (legacyState && !legacyObservation) {
      await db.query(
        "insert into public.courses(id,title,contract_key) values($1,'Somente seleção','course-only')",
        [COURSE_ONLY]
      );
      await db.query(
        "insert into public.user_course_selections(id,user_id,course_id) values($1,$2,$3)",
        [SELECTION_ONLY, USER, COURSE_ONLY]
      );
    }
  }
  if (inactiveSelection) {
    await db.query(
      "insert into public.courses(id,status,title,contract_key) values($1,'archived','Arquivado','archived')",
      [COURSE_ONLY]
    );
    await db.query(
      "insert into public.user_course_selections(id,user_id,course_id) values($1,$2,$3)",
      [SELECTION_ONLY, USER, COURSE_ONLY]
    );
    await db.exec(`
      insert into public.study_paths(id,owner_id,title)
      values('7a000000-0000-4000-8000-000000000001','${USER}','Legado');
      insert into public.study_path_courses(
        id,path_id,owner_id,selection_id,position
      ) values(
        '7a000000-0000-4000-8000-000000000002',
        '7a000000-0000-4000-8000-000000000001','${USER}','${SELECTION_ONLY}',0
      );
    `);
  }
  await db.exec(await fs.readFile(unifiedUrl, "utf8"));
  await db.exec(await fs.readFile(stateUrl, "utf8"));
  await db.exec(await fs.readFile(observationUrl, "utf8"));
  await db.exec(await fs.readFile(cleanCutoverUrl, "utf8"));
  await db.exec(`set request.jwt.claim.sub='${USER}'`);
  return db;
}

test("projeção distingue raízes e lê partes sem artefato integral", async () => {
  const db = await prepare();
  const manifest = (await db.query(
    "select public.get_aralearn_runtime_manifest() value"
  )).rows[0].value;
  assert.equal(manifest.features.includes("atomic-trail-personal-state-v1"), true);
  assert.equal(manifest.features.includes("unified-trails-clean-cutover-v1"), true);
  assert.equal(manifest.features.includes("integrated-trails-v1"), false);
  assert.equal(manifest.schemaRevision, "20260807230000");
  const legacyTables = (await db.query(`
    select table_name from information_schema.tables
    where table_schema='public'
      and table_name in ('lesson_progress','card_progress','card_comments')
  `)).rows;
  assert.deepEqual(legacyTables, []);
  const legacyFunctionDependencies = (await db.query(`
    select namespace.nspname as schema_name, procedure.proname as function_name
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public','private')
      and procedure.prokind = 'f'
      and pg_get_functiondef(procedure.oid)
        ~ '(lesson_progress|card_progress|card_comments|study_path_courses)'
    order by namespace.nspname, procedure.proname
  `)).rows;
  assert.deepEqual(legacyFunctionDependencies, []);
  const removedRpcNames = (await db.query(`
    select procedure.proname
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public','private')
      and procedure.proname in (
        'list_user_course_summaries',
        'list_study_paths',
        'manage_study_path'
      )
  `)).rows;
  assert.deepEqual(removedRpcNames, []);
  assert.equal((await db.query(
    "select to_regclass('public.study_paths') is not null as present"
  )).rows[0].present, true);
  assert.equal((await db.query(
    "select to_regclass('public.study_path_items') is not null as present"
  )).rows[0].present, true);
  const placementRules = (await db.query(`
    select constraint_name
    from information_schema.table_constraints
    where table_schema='public' and table_name='study_path_items'
      and constraint_type in ('UNIQUE','CHECK')
      and constraint_name like 'study_path_items_%'
    order by constraint_name
  `)).rows.map((row) => row.constraint_name);
  assert.deepEqual(placementRules, [
    "study_path_items_id_owner_unique",
    "study_path_items_owner_item_unique",
    "study_path_items_path_item_unique",
    "study_path_items_position_nonnegative"
  ]);
  assert.equal(manifest.features.includes("non-punitive-study-state-v1"), false);
  const snapshot = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  assert.equal(snapshot.items.length, 2);
  const first = snapshot.items.find((item) => item.courseKey === "course-a");
  const second = snapshot.items.find((item) => item.courseKey === "course-b");
  assert.deepEqual(
    [first.moduleCount, first.lessonCount, first.microsequenceCount, first.cardCount],
    [1, 1, 1, 1]
  );
  assert.deepEqual(
    [second.moduleCount, second.lessonCount, second.microsequenceCount, second.cardCount],
    [1, 1, 1, 2]
  );
  const page1 = (await db.query(
    "select public.get_trail_workspace_course_v1($1,3,null,null) value",
    [first.trailItemId]
  )).rows[0].value;
  assert.equal(page1.parts.length, 3);
  assert.equal(page1.hasMore, true);
  const page2 = (await db.query(
    "select public.get_trail_workspace_course_v1($1,100,$2,$3) value",
    [first.trailItemId, page1.nextCursor, page1.revision]
  )).rows[0].value;
  assert.equal(page2.parts.length, 2);
  assert(page2.parts.every((part) => !String(part.id).endsWith("-b")));
  await db.close();
});

test("merge, estado e organização compartilham locks determinísticos", async () => {
  const db = await prepare();
  const definition = async (schema, name) => (await db.query(`
    select pg_get_functiondef(procedure.oid) as source
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname=$1 and procedure.proname=$2
  `, [schema, name])).rows[0].source;
  const merge = await definition("private", "link_workspace_publication_trail_item_v1");
  const mutateState = await definition("public", "mutate_trail_personal_state_v1");
  const mutateGroups = await definition("public", "mutate_trails_v1");
  const cleanup = await definition("private", "cleanup_trail_personal_access_v1");
  const cleanupMember = await definition(
    "private", "cleanup_removed_workspace_member_trails_v1"
  );
  const discardWorkspace = await definition(
    "private", "discard_authoring_workspace_v1"
  );
  assert.match(merge, /trail-root:/u);
  assert.match(merge, /trail-owner:/u);
  assert.match(merge, /trail-item:/u);
  assert.match(merge, /trail_personal_states[\s\S]+for update/iu);
  assert.match(merge, /trail_observation_threads[\s\S]+for update/iu);
  assert.match(merge, /study_path_items[\s\S]+for update/iu);
  assert(merge.indexOf("from public.courses course") < merge.indexOf("trail-owner:"));
  assert(merge.indexOf("trail-owner:") < merge.indexOf("trail-item:"));
  assert.match(mutateState, /trail-item:/u);
  assert.match(cleanup, /trail-item:/u);
  assert.match(cleanupMember, /where item\.workspace_id = old\.workspace_id\s+order by item\.id/iu);
  assert.match(discardWorkspace, /where item\.workspace_id = p_workspace_id\s+order by item\.id/iu);
  assert(mutateGroups.indexOf("trail-owner:") < mutateGroups.indexOf("trail-item:"));
  await db.close();
});

test("cutover descarta seleção e placement de curso já inativo", async () => {
  const db = await prepare({ inactiveSelection: true });
  assert.equal((await db.query(`
    select count(*)::integer count from public.user_course_selections
    where course_id=$1
  `, [COURSE_ONLY])).rows[0].count, 0);
  assert.equal((await db.query(`
    select count(*)::integer count from public.study_path_items
    where owner_id=$1
  `, [USER])).rows[0].count, 0);
  assert.equal((await db.query(`
    select count(*)::integer count from private.trail_item_courses
    where course_id=$1
  `, [COURSE_ONLY])).rows[0].count, 0);
  await db.close();
});

test("curso selecionado e raiz importada compartilham identidade antes da publicação", async () => {
  const db = await prepare({ sourceCourse: true });
  const snapshot = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  const sourceItems = snapshot.items.filter((item) =>
    item.courseId === COURSE || item.courseKey === "course-a"
  );
  assert.equal(sourceItems.length, 1);
  assert.equal(sourceItems[0].trailItemId, COURSE);
  assert.equal(sourceItems[0].source, "workspace");
  assert.equal(sourceItems[0].workspaceId, WORKSPACE);
  assert.equal(sourceItems[0].courseKey, "course-a");
  assert.equal(sourceItems[0].revision, 1);
  assert.equal(snapshot.items.some((item) => item.courseKey === "course-b"), true);
  await db.close();
});

test("publicações privada e de catálogo da mesma raiz usam um único trailItem", async () => {
  const db = await prepare({ sourceCourse: true, dualPublication: true });
  const aliases = (await db.query(`
    select alias.course_id,alias.trail_item_id,item.course_id preferred_course_id
    from private.trail_item_courses alias
    join private.trail_items item on item.id=alias.trail_item_id
    where alias.course_id in ($1,$2)
    order by alias.course_id
  `, [COURSE, COURSE_CATALOG])).rows;
  assert.equal(aliases.length, 1);
  assert.equal(aliases[0].course_id, COURSE_CATALOG);
  assert.equal(aliases[0].preferred_course_id, COURSE_CATALOG);
  assert.equal((await db.query(`
    select count(*)::integer count
    from private.authoring_workspace_publications
    where workspace_id=$1 and workspace_course_id='course-a'
  `, [WORKSPACE])).rows[0].count, 1);
  assert.equal((await db.query(`
    select count(*)::integer count from public.user_course_selections
    where user_id=$1 and course_id in ($2,$3)
  `, [USER, COURSE, COURSE_CATALOG])).rows[0].count, 1);
  assert.equal((await db.query(
    "select count(*)::integer count from public.courses where id=$1", [COURSE]
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select source_course_id from private.authoring_workspaces where id=$1", [WORKSPACE]
  )).rows[0].source_course_id, null);
  const projected = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.filter((item) => item.courseKey === "course-a");
  assert.equal(projected.length, 1);
  assert.equal(projected[0].courseId, COURSE_CATALOG);
  await db.close();
});

test("um courseId histórico não pode pertencer a duas raízes", async () => {
  await assert.rejects(
    prepare({ sourceCourse: true, conflictingPublication: true }),
    /mesmo curso para raízes distintas/u
  );
});

test("segunda raiz não captura courseId já publicado", async () => {
  const db = await prepare({ sourceCourse: true });
  await db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','private',$2,$3)
  `, [WORKSPACE, COURSE, "a".repeat(64)]);
  const originalItem = (await db.query(
    "select trail_item_id from private.trail_item_courses where course_id=$1",
    [COURSE]
  )).rows[0].trail_item_id;
  await db.exec(`
    insert into private.authoring_workspaces(id,owner_id,title)
    values('10000000-0000-4000-8000-000000000098','${USER}','Outra raiz');
    insert into private.educational_workspace_members(workspace_id,user_id,role)
    values('10000000-0000-4000-8000-000000000098','${USER}','owner');
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values('10000000-0000-4000-8000-000000000098','course','course-other',
      null,null,0,'{}'::jsonb);
  `);
  await assert.rejects(db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values('10000000-0000-4000-8000-000000000098','course-other',
      'private',$1,$2)
  `, [COURSE, "b".repeat(64)]), /já pertence a outra raiz/u);
  assert.equal((await db.query(
    "select trail_item_id from private.trail_item_courses where course_id=$1",
    [COURSE]
  )).rows[0].trail_item_id, originalItem);
  await db.close();
});

test("backfill preserva cursor estável, conclusão, Rever e observação antes do corte", async () => {
  const db = await prepare({
    sourceCourse: true,
    legacyState: true,
    legacyObservation: true
  });
  const row = (await db.query(
    `select completed_card_count,state
     from public.trail_personal_states where user_id=$1 and trail_item_id=$2`,
    [USER, COURSE]
  )).rows[0];
  assert.equal(row.state.progress.version, 3);
  assert.deepEqual(row.state.progress.lessons["lesson-a"], {
    cursorCardId: "card-a",
    completedCardIds: ["card-a"]
  });
  assert.match(row.state.reviewMarks["card-a"], /^2026-08-07T10:02:00/u);
  assert.deepEqual(row.state.observations["card-a"], {
    category: "possible_error",
    body: "Há uma inconsistência.",
    updatedAt: row.state.observations["card-a"].updatedAt
  });
  assert.match(row.state.observations["card-a"].updatedAt, /^2026-/u);
  assert.equal(row.completed_card_count, 1);
  await db.close();
});

test("backfill descarta cursor legado sem card concluído correspondente", async () => {
  const db = await prepare({
    sourceCourse: true,
    legacyCursorWithoutCard: true
  });
  const row = (await db.query(`
    select completed_card_count,state from public.trail_personal_states
    where user_id=$1 and trail_item_id=$2
  `, [USER, COURSE])).rows[0];
  assert.equal(row.completed_card_count, 0);
  assert.deepEqual(row.state.progress.lessons["lesson-a"], {
    completedCardIds: []
  });
  await db.close();
});

test("backfill funde aliases pela árvore corrente e conserva os valores mais recentes", async () => {
  const db = await prepare({
    sourceCourse: true,
    dualPublication: true,
    legacyState: true,
    legacyObservation: true
  });
  const item = (await db.query(
    "select trail_item_id from private.trail_item_courses where course_id=$1",
    [COURSE_CATALOG]
  )).rows[0].trail_item_id;
  const row = (await db.query(`
    select completed_card_count,state from public.trail_personal_states
    where user_id=$1 and trail_item_id=$2
  `, [USER, item])).rows[0];
  assert.equal(row.completed_card_count, 1);
  assert.deepEqual(row.state.progress.lessons, {
    "lesson-a": { cursorCardId: "card-a", completedCardIds: ["card-a"] }
  });
  assert.match(row.state.reviewMarks["card-a"], /^2026-08-07T10:04:00/u);
  assert.equal(row.state.observations["card-a"].body, "Observação mais recente.");
  const threads = (await db.query(`
    select id,card_id from private.trail_observation_threads
    where user_id=$1 and trail_item_id=$2
  `, [USER, item])).rows;
  assert.deepEqual(threads, [{
    id: "90000000-0000-4000-8000-000000000099",
    card_id: "card-a"
  }]);
  await db.close();
});

test("backfill cria estado vazio para curso apenas selecionado", async () => {
  const db = await prepare({ sourceCourse: true, legacyState: true });
  const row = (await db.query(
    `select completed_card_count,state
     from public.trail_personal_states where user_id=$1 and trail_item_id=$2`,
    [USER, COURSE_ONLY]
  )).rows[0];
  assert.equal(row.completed_card_count, 0);
  assert.deepEqual(row.state, {
    version: 1,
    progress: { version: 3, lessons: {} },
    reviewMarks: {},
    observations: {}
  });
  await db.close();
});

test("backfill terminal libera origem e artefato sem apagar curso ainda usado", async () => {
  const db = await prepare({ sourceCourse: true, terminalSubmission: true });
  assert.deepEqual((await db.query(`
    select status,source_course_id,artifact_hash
    from private.catalog_review_submissions
    where id='79000000-0000-4000-8000-000000000001'
  `)).rows[0], {
    status: "rejected", source_course_id: null, artifact_hash: null
  });
  assert.equal((await db.query(
    "select count(*)::integer count from public.courses where id=$1", [COURSE]
  )).rows[0].count, 1);
  assert.equal((await db.query(
    "select count(*)::integer count from private.trail_item_courses where course_id=$1",
    [COURSE]
  )).rows[0].count, 1);
  await db.close();
});

test("primeiro card transforma o mesmo plano agrupado em curso estudável", async () => {
  const db = await prepare();
  await db.query(
    "delete from private.authoring_workspace_entities where workspace_id=$1 and entity_type='card' and parent_id='micro-a'",
    [WORKSPACE]
  );
  let projected = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  const plan = projected.items.find((value) => value.courseKey === "course-a");
  assert.equal(plan.kind, "plan");
  assert.equal(plan.cardCount, 0);
  const group = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    ["41000000-0000-4000-8000-000000000001", JSON.stringify({ title: "Dataprev" })]
  )).rows[0].value;
  await db.query(
    "select public.mutate_trails_v1($1,'place_item',$2::jsonb)",
    ["41000000-0000-4000-8000-000000000002", JSON.stringify({
      trailItemId: plan.trailItemId,
      groupId: group.groupId
    })]
  );

  await db.query(
    `insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'card','card-a','microsequence','micro-a',0,'{}'::jsonb)`,
    [WORKSPACE]
  );
  await db.query(
    "update private.authoring_workspaces set revision=revision+1,updated_at=now() where id=$1",
    [WORKSPACE]
  );
  projected = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  const course = projected.items.find((value) => value.courseKey === "course-a");
  assert.equal(course.trailItemId, plan.trailItemId);
  assert.equal(course.kind, "course");
  assert.equal(course.cardCount, 1);
  assert.equal(course.pathId, group.groupId);
  await db.close();
});

test("grupos são atômicos, idempotentes e normalizam posições", async () => {
  const db = await prepare();
  const trailItemId = (await db.query(
    "select (public.list_trail_items_v1(100,null,null,null)->'items'->0->>'trailItemId')::uuid id"
  )).rows[0].id;
  const request = "40000000-0000-4000-8000-000000000001";
  const created = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    [request, JSON.stringify({ title: "Dataprev" })]
  )).rows[0].value;
  const repeated = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    [request, JSON.stringify({ title: "Dataprev" })]
  )).rows[0].value;
  assert.equal(repeated.idempotent, true);
  await db.query(
    "select public.mutate_trails_v1($1,'place_item',$2::jsonb)",
    ["40000000-0000-4000-8000-000000000002", JSON.stringify({
      trailItemId, groupId: created.groupId
    })]
  );
  const grouped = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  assert.equal(grouped.groups[0].title, "Dataprev");
  assert.equal(grouped.items.find((item) => item.trailItemId === trailItemId).pathId,
    created.groupId);
  await db.query(
    "select public.mutate_trails_v1($1,'delete_group',$2::jsonb)",
    ["40000000-0000-4000-8000-000000000003", JSON.stringify({ groupId: created.groupId })]
  );
  const ungrouped = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  assert.equal(ungrouped.items.find((item) => item.trailItemId === trailItemId).pathId, null);
  await db.close();
});

test("paginação não perde item quando metadados mudam entre páginas", async () => {
  const db = await prepare();
  await db.exec(`
    with generated as (
      select ('81000000-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid id,
        value, 'Curso em lote ' || value title
      from generate_series(1,105) value
    ), inserted as (
      insert into private.authoring_workspaces(id,owner_id,title,updated_at)
      select id,'${USER}',title,'2026-08-07T10:00:00Z' from generated
      returning id,title
    )
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    )
    select id,'course','bulk-' || split_part(title,' ',4),null,null,0,
      jsonb_build_object('title',title,'goal','')
    from inserted;
    insert into private.educational_workspace_members(workspace_id,user_id,role)
    select id,'${USER}','owner'
    from private.authoring_workspaces
    where title like 'Curso em lote %';
  `);
  const first = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  assert.equal(first.items.length, 100);
  assert.equal(first.hasMore, true);
  await db.query(
    "update private.authoring_workspaces set updated_at=now() where id=$1",
    ["81000000-0000-4000-8000-000000000105"]
  );
  const second = (await db.query(
    "select public.list_trail_items_v1(100,$1,$2,$3) value",
    [
      first.nextCursor.afterPathPosition,
      first.nextCursor.afterItemPosition,
      first.nextCursor.afterId
    ]
  )).rows[0].value;
  const ids = [...first.items, ...second.items].map((item) => item.trailItemId);
  assert.equal(ids.length, 107);
  assert.equal(new Set(ids).size, 107);
  assert.equal(second.hasMore, false);
  await db.close();
});

test("estado pessoal usa CAS e sobrevive à publicação mantendo trailItemId", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  const state = {
    version: 1,
    progress: { version: 3, lessons: {} },
    reviewMarks: {},
    observations: {}
  };
  const lessonId = "lesson-a";
  const cardId = "card-a";
  const operations = [{
    kind: "set",
    collection: "reviewMarks",
    path: cardId,
    value: "2026-08-07T11:00:00Z"
  }, {
    kind: "set",
    collection: "progress.lessons",
    path: lessonId,
    value: { cursorCardId: "card-a", completedCardIds: ["card-a"] }
  }];
  const saved = (await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3) value",
    [item.trailItemId, JSON.stringify(operations), "50000000-0000-4000-8000-000000000001"]
  )).rows[0].value;
  assert.equal(saved.revision, 1);
  assert.equal(Object.hasOwn(saved, "state"), false);
  const progressProjection = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.trailItemId === item.trailItemId);
  assert.equal(progressProjection.completedCardCount, 1);
  await assert.rejects(db.query(
    "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      kind: "set", collection: "progress.lessons", path: "lesson-b",
      value: { cursorCardId: "card-a", completedCardIds: ["card-a"] }
    }]), "50000000-0000-4000-8000-000000000006"]
  ), /estado pessoal inválido/u);
  await assert.rejects(db.query(
    "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      kind: "set", collection: "progress.lessons", path: "lesson-b",
      value: { cursorCardId: "card-x", completedCardIds: ["card-b"] }
    }]), "50000000-0000-4000-8000-000000000007"]
  ), /estado pessoal inválido/u);
  const repeated = (await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3) value",
    [item.trailItemId, JSON.stringify(operations), "50000000-0000-4000-8000-000000000001"]
  )).rows[0].value;
  assert.equal(repeated.idempotent, true);
  assert.equal(Object.hasOwn(repeated, "state"), false);
  await assert.rejects(
    db.query(
      "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
      [item.trailItemId, JSON.stringify([{
        kind: "set",
        collection: "progress.lessons",
        path: `${lessonId}-incompleto`,
        value: {}
      }]), "50000000-0000-4000-8000-000000000004"]
    ),
    /(?:estado pessoal|Operação do estado pessoal) inválid/u
  );
  await assert.rejects(
    db.query(
      "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
      [item.trailItemId, JSON.stringify([{
        kind: "set",
        collection: "observations",
        path: cardId,
        value: { category: "question", body: "Sem data não é corrente." }
      }]), "50000000-0000-4000-8000-000000000005"]
    ),
    /estado pessoal inválido|Operação do estado pessoal inválida/u
  );
  await assert.rejects(
    db.query(
      "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
      [item.trailItemId, JSON.stringify(operations), "50000000-0000-4000-8000-000000000002"]
    ),
    /mudou/u
  );

  await db.query(
    `insert into public.courses(id,title) values($1,'Publicado')`, [COURSE]
  );
  const publishedState = structuredClone(state);
  publishedState.progress.lessons[lessonId] = {
    cursorCardId: "card-b",
    completedCardIds: ["card-b"]
  };
  publishedState.progress.lessons["lesson-b"] = {
    cursorCardId: "card-a",
    completedCardIds: ["card-a"]
  };
  publishedState.reviewMarks[cardId] =
    "2026-08-07T12:00:00Z";
  await db.query(
    `insert into public.trail_personal_states(
      user_id,trail_item_id,revision,state
    ) values($1,$2,1,$3::jsonb)`,
    [USER, COURSE, JSON.stringify(publishedState)]
  );
  await db.query(
    `insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','private',$2,$3)`,
    [WORKSPACE, COURSE, "a".repeat(64)]
  );
  await db.query(
    `insert into public.user_course_selections(id,user_id,course_id)
     values($1,$2,$3)`, [SELECTION, USER, COURSE]
  );
  const after = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  assert.equal(after.trailItemId, item.trailItemId);
  const loaded = (await db.query(
    "select public.load_trail_personal_state_v1($1) value", [item.trailItemId]
  )).rows[0].value;
  assert.equal(loaded.revision, 2);
  assert.equal(
    loaded.state.reviewMarks[cardId],
    "2026-08-07T11:00:00Z"
  );
  assert.deepEqual(loaded.state.progress.lessons[lessonId], {
    cursorCardId: "card-a",
    completedCardIds: ["card-a", "card-b"]
  });
  assert.deepEqual(loaded.state.progress.lessons["lesson-b"], {
    completedCardIds: []
  });
  assert.equal((await db.query(`
    select completed_card_count from public.trail_personal_states
    where user_id=$1 and trail_item_id=$2
  `, [USER, item.trailItemId])).rows[0].completed_card_count, 2);
  await db.close();
});

test("observação usa trailItemId antes da publicação e separa a thread editorial", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  const cardId = "card-a";
  const operation = [{
    kind: "set",
    collection: "observations",
    path: cardId,
    value: {
      category: "question",
      body: "Como aplicar?",
      updatedAt: "2026-08-07T12:00:00Z"
    }
  }];
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify(operation),
      "51000000-0000-4000-8000-000000000001"]
  );
  const thread = (await db.query(`
    select id,status,card_id from private.trail_observation_threads
    where user_id=$1 and trail_item_id=$2
  `, [USER, item.trailItemId])).rows[0];
  assert.equal(thread.status, "open");
  assert.equal(thread.card_id, cardId);
  const columns = (await db.query(`
    select column_name from information_schema.columns
    where table_schema='private' and table_name='trail_observation_threads'
  `)).rows.map((row) => row.column_name);
  assert.equal(columns.includes("body"), false);
  assert.equal(columns.includes("category"), false);
  assert.equal(columns.includes("card_title"), false);

  const ownerList = (await db.query(`
    select private.list_educational_workspace_comments_v1(
      $1,$2,20,null,null,null,null
    ) value
  `, [USER, WORKSPACE])).rows[0].value;
  assert.equal(ownerList.items.length, 1);
  assert.equal(ownerList.items[0].trailItemId, item.trailItemId);
  assert.equal(ownerList.items[0].courseId, null);
  assert.equal(ownerList.items[0].cardId, "card-a");
  assert.equal(ownerList.items[0].body, "Como aplicar?");

  await db.query(`
    select private.manage_educational_workspace_comment_v1(
      $1,'comment:respond:trail-0001',$2,$3,'respond_comment',
      '{"response":"Veja o exemplo corrigido."}'::jsonb
    )
  `, [USER, WORKSPACE, thread.id]);
  const loaded = (await db.query(
    "select public.load_trail_personal_state_v1($1) value",
    [item.trailItemId]
  )).rows[0].value;
  assert.equal(loaded.state.observations[cardId].commentId, thread.id);
  assert.equal(loaded.state.observations[cardId].status, "considered");
  assert.equal(loaded.state.observations[cardId].response, "Veja o exemplo corrigido.");

  const remoteOperations = [];
  const repository = new TrailPersonalStateRepository({
    trailItemId: item.trailItemId,
    store: new MemorySyncState(),
    remoteCatalog: {
      async requireAuthenticatedUserId() {
        return USER;
      },
      async loadTrailPersonalState(trailItemId) {
        return (await db.query(
          "select public.load_trail_personal_state_v1($1) value",
          [trailItemId]
        )).rows[0].value;
      },
      async mutateTrailPersonalState(input) {
        remoteOperations.push(structuredClone(input.operations));
        return (await db.query(
          "select public.mutate_trail_personal_state_v1($1,$2,$3::jsonb,$4) value",
          [input.trailItemId, input.expectedRevision,
            JSON.stringify(input.operations), input.mutationId]
        )).rows[0].value;
      }
    },
    clock: () => new Date("2026-08-07T12:02:00Z"),
    uuidFactory: () => "51000000-0000-4000-8000-000000000004"
  });
  await repository.initialize();
  assert.equal(repository.loadCommentForPath({ entityPath: [
    "course-a", "module-a", "lesson-a", "micro-a", "card-a"
  ] }).response, "Veja o exemplo corrigido.");
  await repository.saveCommentForPath({ entityPath: [
    "course-a", "module-a", "lesson-a", "micro-a", "card-a"
  ] }, { category: "question", body: "Reformulei a dúvida." });
  assert.deepEqual(
    Object.keys(remoteOperations[0][0].value).sort(),
    ["body", "category", "updatedAt"]
  );
  const reopened = (await db.query(
    "select public.load_trail_personal_state_v1($1) value",
    [item.trailItemId]
  )).rows[0].value.state.observations[cardId];
  assert.equal(reopened.status, "open");
  assert.equal(Object.hasOwn(reopened, "response"), false);

  await assert.rejects(db.query(
    "select public.mutate_trail_personal_state_v1($1,2,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      ...operation[0],
      value: { ...operation[0].value, status: "resolved" }
    }]), "51000000-0000-4000-8000-000000000002"]
  ), /Operação do estado pessoal inválida/u);
  for (const [index, invalidValue] of [{
    body: "Sem categoria.",
    updatedAt: "2026-08-07T12:03:00Z"
  }, {
    category: "question",
    body: "Sem data."
  }].entries()) {
    await assert.rejects(db.query(
      "select public.mutate_trail_personal_state_v1($1,2,$2::jsonb,$3)",
      [item.trailItemId, JSON.stringify([{
        kind: "set", collection: "observations", path: cardId, value: invalidValue
      }]), `51000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`]
    ), /Operação do estado pessoal inválida/u);
  }

  await db.exec(`
    create or replace function private.educational_workspace_can_v1(
      p_workspace_id uuid,p_actor_id uuid,p_capability text
    ) returns boolean language sql stable as $$
      select exists(select 1 from private.authoring_workspaces workspace
        where workspace.id=p_workspace_id and workspace.deleted_at is null
          and (workspace.owner_id=p_actor_id
            or (p_actor_id='${OTHER}'::uuid and p_capability in ('read','comment'))))
    $$
  `);
  await db.exec(`set request.jwt.claim.sub='${OTHER}'`);
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      ...operation[0],
      value: {
        category: "confusing",
        body: "Ainda não entendi.",
        updatedAt: "2026-08-07T12:01:00Z"
      }
    }]), "51000000-0000-4000-8000-000000000003"]
  );
  const learnerList = (await db.query(`
    select private.list_educational_workspace_comments_v1(
      $1,$2,20,null,null,null,null
    ) value
  `, [OTHER, WORKSPACE])).rows[0].value;
  assert.equal(learnerList.items.length, 1);
  assert.equal(learnerList.items[0].author.userId, OTHER);
  await assert.rejects(db.query(`
    select private.manage_educational_workspace_comment_v1(
      $1,'comment:respond:learner-1',$2,$3,'respond_comment',
      '{"response":"Não autorizado."}'::jsonb
    )
  `, [OTHER, WORKSPACE, thread.id]), /não permitida/iu);
  await db.close();
});

test("cutover preserva observação antiga integral e remove somente a tabela antiga", async () => {
  const db = await prepare({ sourceCourse: true, legacyObservation: true });
  const list = (await db.query(`
    select private.list_educational_workspace_comments_v1(
      $1,$2,20,null,null,null,null
    ) value
  `, [USER, WORKSPACE])).rows[0].value;
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].commentId, "90000000-0000-4000-8000-000000000001");
  assert.equal(list.items[0].category, "possible_error");
  assert.equal(list.items[0].body, "Há uma inconsistência.");
  assert.equal(list.items[0].status, "incorporated");
  assert.equal(list.items[0].response, "Corrigido.");
  assert.equal(list.items[0].resolutionNote, "Revisado.");
  assert.equal(list.items[0].correction.requestId, "workspace:repair:legacy");
  const selectionOnlyItem = (await db.query(
    "select id from private.trail_items where course_id=$1",
    [COURSE_ONLY]
  )).rows[0].id;
  const selectionOnly = (await db.query(
    "select public.load_trail_personal_state_v1($1) value",
    [selectionOnlyItem]
  )).rows[0].value;
  const selectionOnlyObservation =
    selectionOnly.state.observations["card-only"];
  assert.equal(selectionOnlyObservation.body, "Observação sem workspace.");
  assert.equal(selectionOnlyObservation.status, "resolved");
  assert.equal(selectionOnlyObservation.response, "Resposta preservada.");
  assert.equal(selectionOnlyObservation.resolutionNote, "Encerrada.");
  assert.equal((await db.query(
    "select to_regclass('public.card_comments') value"
  )).rows[0].value, null);
  assert.equal((await db.query(
    "select to_regclass('private.trail_observation_threads') is not null value"
  )).rows[0].value, true);
  await db.close();
});

test("mover card e lição preserva estado por IDs sem reescrever alunos", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      kind: "set", collection: "progress.lessons", path: "lesson-a",
      value: { cursorCardId: "card-a", completedCardIds: ["card-a"] }
    }, {
      kind: "set", collection: "reviewMarks", path: "card-a",
      value: "2026-08-07T13:00:00Z"
    }, {
      kind: "set", collection: "observations", path: "card-a",
      value: {
        category: "suggestion", body: "Mova sem perder.",
        updatedAt: "2026-08-07T13:00:00Z"
      }
    }]), "52000000-0000-4000-8000-000000000001"]
  );
  const originalThread = (await db.query(`
    select id,updated_at from private.trail_observation_threads
    where trail_item_id=$1 and card_id=$2
  `, [item.trailItemId, "card-a"])).rows[0];
  await db.query(`
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ($1,'module','module-new','course','course-a',1,'{"title":"Novo módulo"}'::jsonb),
      ($1,'microsequence','micro-new','lesson','lesson-a',1,'{"title":"Nova micro"}'::jsonb)
  `, [WORKSPACE]);
  await db.query(`
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'card','card-a','microsequence','micro-new',0,'{}'::jsonb)
    on conflict(workspace_id,entity_type,entity_id) do update
      set parent_type=excluded.parent_type,parent_id=excluded.parent_id
  `, [WORKSPACE]);
  await db.query(`
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'lesson','lesson-a','module','module-new',0,'{}'::jsonb)
    on conflict(workspace_id,entity_type,entity_id) do update
      set parent_type=excluded.parent_type,parent_id=excluded.parent_id
  `, [WORKSPACE]);

  const loaded = (await db.query(
    "select public.load_trail_personal_state_v1($1) value",
    [item.trailItemId]
  )).rows[0].value;
  assert.equal(loaded.revision, 1);
  assert.deepEqual(loaded.state.progress.lessons["lesson-a"], {
    cursorCardId: "card-a", completedCardIds: ["card-a"]
  });
  assert.equal(loaded.state.reviewMarks["card-a"], "2026-08-07T13:00:00Z");
  assert.equal(loaded.state.observations["card-a"].body, "Mova sem perder.");
  const movedThread = (await db.query(`
    select id,card_id,updated_at,
      private.trail_observation_target_available_v1(trail_item_id,card_id) target_available
    from private.trail_observation_threads where id=$1
  `, [originalThread.id])).rows[0];
  assert.equal(movedThread.id, originalThread.id);
  assert.equal(movedThread.card_id, "card-a");
  assert.equal(movedThread.target_available, true);
  assert.equal(new Date(movedThread.updated_at).getTime(),
    new Date(originalThread.updated_at).getTime());
  await db.close();
});

test("mover parte no rascunho não reescreve estado da publicação estudada", async () => {
  const db = await prepare();
  const snapshot = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items;
  const source = snapshot.find((value) => value.courseKey === "course-a");
  const target = snapshot.find((value) => value.courseKey === "course-b");
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [source.trailItemId, JSON.stringify([{
      kind: "set", collection: "progress.lessons", path: "lesson-a",
      value: { cursorCardId: "card-a", completedCardIds: ["card-a"] }
    }, {
      kind: "set", collection: "reviewMarks", path: "card-a",
      value: "2026-08-07T14:00:00Z"
    }, {
      kind: "set", collection: "observations", path: "card-a",
      value: {
        category: "observation", body: "Pertence à origem.",
        updatedAt: "2026-08-07T14:00:00Z"
      }
    }]), "53000000-0000-4000-8000-000000000001"]
  );
  await db.query(`
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'card','card-a','microsequence','micro-b',0,'{}'::jsonb)
    on conflict(workspace_id,entity_type,entity_id) do update
      set parent_type=excluded.parent_type,parent_id=excluded.parent_id
  `, [WORKSPACE]);
  const sourceState = (await db.query(
    "select public.load_trail_personal_state_v1($1) value", [source.trailItemId]
  )).rows[0].value.state;
  assert.deepEqual(sourceState.progress.lessons["lesson-a"], {
    cursorCardId: "card-a", completedCardIds: ["card-a"]
  });
  assert.equal(sourceState.reviewMarks["card-a"], "2026-08-07T14:00:00Z");
  assert.equal(sourceState.observations["card-a"].body, "Pertence à origem.");
  assert.equal((await db.query(`
    select private.trail_observation_target_available_v1(
      trail_item_id,card_id
    ) available from private.trail_observation_threads
    where trail_item_id=$1
  `, [source.trailItemId])).rows[0].available, false);
  assert.equal((await db.query(
    "select public.load_trail_personal_state_v1($1) value", [target.trailItemId]
  )).rows[0].value, null);
  await db.close();
});

test("excluir subárvore conserva a declaração própria como alvo indisponível", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  const cardId = "card-a";
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      kind: "set", collection: "observations", path: cardId,
      value: {
        category: "possible_error", body: "Alvo que será retirado.",
        updatedAt: "2026-08-07T15:00:00Z"
      }
    }]), "54000000-0000-4000-8000-000000000001"]
  );
  await db.query(`
    delete from private.authoring_workspace_entities
    where workspace_id=$1 and entity_type='card' and entity_id='card-a'
  `, [WORKSPACE]);
  const list = (await db.query(`
    select private.list_educational_workspace_comments_v1(
      $1,$2,20,null,null,null,null
    ) value
  `, [USER, WORKSPACE])).rows[0].value;
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].targetAvailable, false);
  const own = (await db.query(
    "select public.load_trail_personal_state_v1($1) value", [item.trailItemId]
  )).rows[0].value;
  assert.equal(own.state.observations[cardId].body, "Alvo que será retirado.");
  await db.close();
});

test("excluir publicação preserva identidade, grupo e estado do workspace", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  const group = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    ["51000000-0000-4000-8000-000000000001", JSON.stringify({ title: "Dataprev" })]
  )).rows[0].value;
  await db.query(
    "select public.mutate_trails_v1($1,'place_item',$2::jsonb)",
    ["51000000-0000-4000-8000-000000000002", JSON.stringify({
      trailItemId: item.trailItemId,
      groupId: group.groupId
    })]
  );
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      kind: "set",
      collection: "reviewMarks",
      path: "card-a",
      value: "2026-08-07T12:00:00Z"
    }]), "51000000-0000-4000-8000-000000000003"]
  );
  await db.query("insert into public.courses(id,title) values($1,'Publicado')", [COURSE]);
  await db.query(
    `insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','private',$2,$3)`,
    [WORKSPACE, COURSE, "b".repeat(64)]
  );
  await db.query("delete from public.courses where id=$1", [COURSE]);

  const mapping = (await db.query(
    `select id,course_id,workspace_id,workspace_course_id
     from private.trail_items where id=$1`,
    [item.trailItemId]
  )).rows[0];
  assert.equal(mapping.id, item.trailItemId);
  assert.equal(mapping.course_id, null);
  assert.equal(mapping.workspace_id, WORKSPACE);
  assert.equal(mapping.workspace_course_id, "course-a");
  assert.equal((await db.query(
    "select count(*)::integer count from public.trail_personal_states where trail_item_id=$1",
    [item.trailItemId]
  )).rows[0].count, 1);
  assert.equal((await db.query(
    "select path_id from public.study_path_items where trail_item_id=$1",
    [item.trailItemId]
  )).rows[0].path_id, group.groupId);

  await db.query("insert into public.courses(id,title) values($1,'Somente publicado')", [COURSE_ONLY]);
  await db.query(
    "insert into public.user_course_selections(id,user_id,course_id) values($1,$2,$3)",
    [SELECTION_ONLY, USER, COURSE_ONLY]
  );
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [COURSE_ONLY, JSON.stringify([{
      kind: "set",
      collection: "reviewMarks",
      path: "card-a",
      value: "2026-08-07T12:00:00Z"
    }]), "51000000-0000-4000-8000-000000000004"]
  );
  await db.query("delete from public.courses where id=$1", [COURSE_ONLY]);
  assert.equal((await db.query(
    "select count(*)::integer count from private.trail_items where id=$1",
    [COURSE_ONLY]
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer count from public.trail_personal_states where trail_item_id=$1",
    [COURSE_ONLY]
  )).rows[0].count, 0);
  await db.close();
});

test("ator diferente não organiza nem lê composição alheia", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items[0];
  await db.exec(`set request.jwt.claim.sub='${OTHER}'`);
  const snapshot = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value;
  assert.equal(snapshot.items.length, 0);
  await assert.rejects(
    db.query("select public.get_trail_workspace_course_v1($1,100,null,null)", [item.trailItemId]),
    /inacessível/u
  );
  await assert.rejects(
    db.query(
      "select public.mutate_trails_v1($1,'place_item',$2::jsonb)",
      ["60000000-0000-4000-8000-000000000001", JSON.stringify({
        trailItemId: item.trailItemId,
        groupId: "60000000-0000-4000-8000-000000000002"
      })]
    ),
    /inexistente|inacessível/u
  );
  await db.close();
});

test("apply_sync_batch conserva somente a seleção leve do catálogo", async () => {
  const db = await prepare();
  await db.query("insert into public.courses(id,title) values($1,'Catálogo')", [COURSE]);
  const deviceId = "70000000-0000-4000-8000-000000000001";
  const mutationId = "70000000-0000-4000-8000-000000000002";
  const entityId = "70000000-0000-4000-8000-000000000003";
  const response = (await db.query(
    "select public.apply_sync_batch($1,$2::jsonb) value",
    [deviceId, JSON.stringify([{
      mutationId,
      sequence: 1,
      courseId: COURSE,
      entityType: "courseSelections",
      entityId,
      operation: "insert",
      changedFields: ["courseId"],
      payload: { courseId: COURSE }
    }])]
  )).rows[0].value;
  assert.equal(response.results[0].status, "applied");
  assert.equal((await db.query(
    "select count(*)::integer count from public.user_course_selections where user_id=$1",
    [USER]
  )).rows[0].count, 1);
  await db.query(
    "select public.apply_sync_batch($1,$2::jsonb)",
    [deviceId, JSON.stringify([{
      mutationId: "70000000-0000-4000-8000-000000000010",
      sequence: 10,
      courseId: COURSE,
      entityType: "courseSelections",
      entityId,
      operation: "upsert",
      payload: { courseId: COURSE }
    }])]
  );
  const stale = (await db.query(
    "select public.apply_sync_batch($1,$2::jsonb) value",
    [deviceId, JSON.stringify([{
      mutationId: "70000000-0000-4000-8000-000000000009",
      sequence: 9,
      courseId: COURSE,
      entityType: "courseSelections",
      entityId,
      operation: "delete",
      payload: { courseId: COURSE }
    }])]
  )).rows[0].value;
  assert.equal(stale.results[0].deduplicatedByDeviceSequence, true);
  assert.equal((await db.query(`
    select count(*)::integer count from public.user_course_selections
    where user_id=$1 and course_id=$2
  `, [USER, COURSE])).rows[0].count, 1);
  const rejected = (await db.query(
    "select public.apply_sync_batch($1,$2::jsonb) value",
    [deviceId, JSON.stringify([{
      mutationId: "70000000-0000-4000-8000-000000000004",
      sequence: 2,
      entityType: "studyPaths",
      entityId,
      operation: "insert",
      payload: {}
    }])]
  )).rows[0].value;
  assert.equal(rejected.results[0].status, "rejected");
  await db.close();
});

test("retirar a última seleção limpa grupo, estado, thread e recibo", async () => {
  const db = await prepare({ sourceCourse: true, legacyState: true });
  const group = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    ["71000000-0000-4000-8000-000000000001", JSON.stringify({ title: "Temporários" })]
  )).rows[0].value;
  await db.query("select public.mutate_trails_v1($1,'place_item',$2::jsonb)", [
    "71000000-0000-4000-8000-000000000002",
    JSON.stringify({ trailItemId: COURSE_ONLY, groupId: group.groupId })
  ]);
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
    [COURSE_ONLY, JSON.stringify([{
      kind: "set", collection: "observations", path: "card-only",
      value: {
        category: "question", body: "Pode ser retirado?",
        updatedAt: "2026-08-07T18:00:00Z"
      }
    }]), "71000000-0000-4000-8000-000000000003"]
  );
  await db.query("select public.unselect_catalog_course($1,$2)", [
    COURSE_ONLY, "71000000-0000-4000-8000-000000000004"
  ]);
  const counts = (await db.query(`
    select
      (select count(*) from public.study_path_items where trail_item_id=$1)::integer placements,
      (select count(*) from public.trail_personal_states where trail_item_id=$1)::integer states,
      (select count(*) from private.trail_observation_threads where trail_item_id=$1)::integer threads,
      (select count(*) from private.trail_personal_state_receipts where trail_item_id=$1)::integer receipts
  `, [COURSE_ONLY])).rows[0];
  assert.deepEqual(counts, { placements: 0, states: 0, threads: 0, receipts: 0 });
  await db.close();
});

test("delete de seleção pelo sync executa o mesmo cleanup atômico", async () => {
  const db = await prepare({ sourceCourse: true, legacyState: true });
  const group = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    ["72000000-0000-4000-8000-000000000001", JSON.stringify({ title: "Sync" })]
  )).rows[0].value;
  await db.query("select public.mutate_trails_v1($1,'place_item',$2::jsonb)", [
    "72000000-0000-4000-8000-000000000002",
    JSON.stringify({ trailItemId: COURSE_ONLY, groupId: group.groupId })
  ]);
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
    [COURSE_ONLY, JSON.stringify([{
      kind: "set", collection: "observations", path: "card-only",
      value: {
        category: "observation", body: "Estado vindo do aparelho.",
        updatedAt: "2026-08-07T18:10:00Z"
      }
    }]), "72000000-0000-4000-8000-000000000003"]
  );
  const result = (await db.query(
    "select public.apply_sync_batch($1,$2::jsonb) value",
    ["72000000-0000-4000-8000-000000000004", JSON.stringify([{
      mutationId: "72000000-0000-4000-8000-000000000005",
      sequence: 1,
      courseId: COURSE_ONLY,
      entityType: "courseSelections",
      entityId: SELECTION_ONLY,
      operation: "delete",
      payload: { courseId: COURSE_ONLY }
    }])]
  )).rows[0].value;
  assert.equal(result.results[0].status, "applied");
  assert.deepEqual((await db.query(`
    select
      (select count(*) from public.study_path_items where trail_item_id=$1)::integer placements,
      (select count(*) from public.trail_personal_states where trail_item_id=$1)::integer states,
      (select count(*) from private.trail_observation_threads where trail_item_id=$1)::integer threads
  `, [COURSE_ONLY])).rows[0], { placements: 0, states: 0, threads: 0 });
  await db.close();
});

test("remover membro limpa só raízes sem uma seleção alternativa", async () => {
  const db = await prepare();
  const items = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items;
  const withoutSelection = items.find((item) => item.courseKey === "course-a");
  const withSelection = items.find((item) => item.courseKey === "course-b");
  const published = "73000000-0000-4000-8000-000000000001";
  await db.query(
    "insert into public.courses(id,owner_id,title,contract_key) values($1,$2,'Privado B','course-b')",
    [published, USER]
  );
  await db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-b','private',$2,$3)
  `, [WORKSPACE, published, "c".repeat(64)]);
  await db.query(
    "insert into private.educational_workspace_members values($1,$2,'learner')",
    [WORKSPACE, OTHER]
  );
  await db.query(`
    insert into public.user_course_selections(id,user_id,course_id)
    values('73000000-0000-4000-8000-000000000002',$1,$2)
  `, [OTHER, published]);
  await db.exec(`set request.jwt.claim.sub='${OTHER}'`);
  const group = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    ["73000000-0000-4000-8000-000000000003", JSON.stringify({ title: "Aluno" })]
  )).rows[0].value;
  for (const [index, item] of [withoutSelection, withSelection].entries()) {
    await db.query("select public.mutate_trails_v1($1,'place_item',$2::jsonb)", [
      `73000000-0000-4000-8000-${String(index + 4).padStart(12, "0")}`,
      JSON.stringify({ trailItemId: item.trailItemId, groupId: group.groupId })
    ]);
    await db.query(
      "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
      [item.trailItemId, JSON.stringify([{
        kind: "set", collection: "observations", path: `card-${index}`,
        value: {
          category: "question", body: `Dúvida ${index}`,
          updatedAt: "2026-08-07T18:20:00Z"
        }
      }]), `73000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`]
    );
  }
  await db.exec(`set request.jwt.claim.sub='${USER}'`);
  await db.query(
    "delete from private.educational_workspace_members where workspace_id=$1 and user_id=$2",
    [WORKSPACE, OTHER]
  );
  const remaining = (await db.query(`
    select trail_item_id from public.trail_personal_states
    where user_id=$1 order by trail_item_id
  `, [OTHER])).rows.map((row) => row.trail_item_id);
  assert.deepEqual(remaining, [withSelection.trailItemId]);
  assert.equal((await db.query(`
    select count(*)::integer count from public.study_path_items
    where owner_id=$1 and trail_item_id=$2
  `, [OTHER, withoutSelection.trailItemId])).rows[0].count, 0);
  assert.equal((await db.query(`
    select count(*)::integer count from private.trail_observation_threads
    where user_id=$1 and trail_item_id=$2
  `, [OTHER, withoutSelection.trailItemId])).rows[0].count, 0);
  assert.equal((await db.query(`
    select count(*)::integer count from public.study_path_items
    where owner_id=$1 and trail_item_id=$2
  `, [OTHER, withSelection.trailItemId])).rows[0].count, 1);
  await db.close();
});

test("descartar workspace multi-raiz preserva só a raiz ainda selecionada", async () => {
  const db = await prepare();
  const items = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items;
  const selected = items.find((item) => item.courseKey === "course-a");
  const workspaceOnly = items.find((item) => item.courseKey === "course-b");
  await db.query(
    "insert into public.courses(id,owner_id,title,contract_key) values($1,$2,'Privado A','course-a')",
    [COURSE, USER]
  );
  await db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','private',$2,$3)
  `, [WORKSPACE, COURSE, "d".repeat(64)]);
  await db.query(
    "insert into public.user_course_selections(id,user_id,course_id) values($1,$2,$3)",
    [SELECTION, USER, COURSE]
  );
  const group = (await db.query(
    "select public.mutate_trails_v1($1,'create_group',$2::jsonb) value",
    ["74000000-0000-4000-8000-000000000001", JSON.stringify({ title: "Rascunhos" })]
  )).rows[0].value;
  for (const [index, item] of [selected, workspaceOnly].entries()) {
    await db.query("select public.mutate_trails_v1($1,'place_item',$2::jsonb)", [
      `74000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
      JSON.stringify({ trailItemId: item.trailItemId, groupId: group.groupId })
    ]);
    await db.query(
      "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
      [item.trailItemId, JSON.stringify([{
        kind: "set", collection: "observations", path: `discard-card-${index}`,
        value: {
          category: "observation", body: `Antes do descarte ${index}`,
          updatedAt: "2026-08-07T18:30:00Z"
        }
      }]), `74000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`]
    );
  }
  await db.query("select private.discard_authoring_workspace_v1($1)", [WORKSPACE]);
  assert.equal((await db.query(`
    select count(*)::integer count from public.trail_personal_states
    where user_id=$1 and trail_item_id=$2
  `, [USER, selected.trailItemId])).rows[0].count, 1);
  assert.equal((await db.query(`
    select count(*)::integer count from public.trail_personal_states
    where user_id=$1 and trail_item_id=$2
  `, [USER, workspaceOnly.trailItemId])).rows[0].count, 0);
  assert.equal((await db.query(`
    select workspace_id is null detached from private.trail_items where id=$1
  `, [selected.trailItemId])).rows[0].detached, true);
  assert.equal((await db.query(
    "select count(*)::integer count from private.trail_items where id=$1",
    [workspaceOnly.trailItemId]
  )).rows[0].count, 0);
  await db.close();
});

test("desativar curso remove alias sem desmontar composição autorizada", async () => {
  const db = await prepare();
  const ids = {
    privateWorkspace: "75000000-0000-4000-8000-000000000001",
    officialWorkspace: "75000000-0000-4000-8000-000000000002",
    privateStandalone: "75000000-0000-4000-8000-000000000003",
    officialStandalone: "75000000-0000-4000-8000-000000000004"
  };
  await db.query(`
    insert into public.courses(id,owner_id,title,contract_key) values
      ($1,$5,'Privado com workspace','course-a'),
      ($2,null,'Oficial com workspace','course-b'),
      ($3,$5,'Privado avulso','private-standalone'),
      ($4,null,'Oficial avulso','official-standalone')
  `, [ids.privateWorkspace, ids.officialWorkspace, ids.privateStandalone,
    ids.officialStandalone, USER]);
  await db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values
      ($1,'course-a','private',$2,$4),
      ($1,'course-b','catalog',$3,$5)
  `, [WORKSPACE, ids.privateWorkspace, ids.officialWorkspace,
    "e".repeat(64), "f".repeat(64)]);
  const trailItems = (await db.query(`
    select alias.course_id,alias.trail_item_id
    from private.trail_item_courses alias where alias.course_id = any($1::uuid[])
  `, [Object.values(ids)])).rows;
  const itemByCourse = new Map(trailItems.map((row) => [row.course_id, row.trail_item_id]));
  for (const [index, courseId] of Object.values(ids).entries()) {
    await db.query(`
      insert into public.user_course_selections(id,user_id,course_id)
      values($1,$2,$3)
    `, [`75000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`,
      USER, courseId]);
    await db.query(
      "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
      [itemByCourse.get(courseId), JSON.stringify([{
        kind: "set", collection: "observations", path: `lifecycle-${index}`,
        value: {
          category: "observation", body: `Ciclo ${index}`,
          updatedAt: "2026-08-07T18:40:00Z"
        }
      }]), `75000000-0000-4000-8002-${String(index + 1).padStart(12, "0")}`]
    );
  }
  await db.query(
    "update public.courses set document_storage_enabled=false where id=$1",
    [ids.privateWorkspace]
  );
  await db.query(
    "update public.courses set status='archived' where id=$1",
    [ids.officialWorkspace]
  );
  await db.query(
    "update public.courses set deleted_at=now() where id=$1",
    [ids.privateStandalone]
  );
  await db.query(
    "update public.courses set status='archived' where id=$1",
    [ids.officialStandalone]
  );
  for (const courseId of [ids.privateWorkspace, ids.officialWorkspace]) {
    const trailItemId = itemByCourse.get(courseId);
    assert.equal((await db.query(`
      select count(*)::integer count from public.trail_personal_states
      where user_id=$1 and trail_item_id=$2
    `, [USER, trailItemId])).rows[0].count, 1);
    assert.equal((await db.query(
      "select course_id from private.trail_items where id=$1", [trailItemId]
    )).rows[0].course_id, null);
    assert.equal((await db.query(`
      select count(*)::integer count from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='course'
    `, [WORKSPACE])).rows[0].count, 2);
  }
  for (const courseId of [ids.privateStandalone, ids.officialStandalone]) {
    const trailItemId = itemByCourse.get(courseId);
    assert.equal((await db.query(
      "select count(*)::integer count from private.trail_items where id=$1", [trailItemId]
    )).rows[0].count, 0);
    assert.equal((await db.query(`
      select count(*)::integer count from public.trail_personal_states
      where trail_item_id=$1
    `, [trailItemId])).rows[0].count, 0);
    assert.equal((await db.query(`
      select count(*)::integer count from private.trail_observation_threads
      where trail_item_id=$1
    `, [trailItemId])).rows[0].count, 0);
    assert.equal((await db.query(`
      select count(*)::integer count from private.trail_personal_state_receipts
      where trail_item_id=$1
    `, [trailItemId])).rows[0].count, 0);
  }
  const originalPrivateItem = itemByCourse.get(ids.privateWorkspace);
  await db.query(
    "update public.courses set document_storage_enabled=true where id=$1",
    [ids.privateWorkspace]
  );
  const relinked = (await db.query(`
    select alias.trail_item_id,item.course_id
    from private.trail_item_courses alias
    join private.trail_items item on item.id=alias.trail_item_id
    where alias.course_id=$1
  `, [ids.privateWorkspace])).rows[0];
  assert.deepEqual(relinked, {
    trail_item_id: originalPrivateItem,
    course_id: ids.privateWorkspace
  });
  await db.close();
});

test("reader altera progresso, mas observação requer comment ou seleção ativa", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  await db.query(
    "insert into private.educational_workspace_members values($1,$2,'reader')",
    [WORKSPACE, OTHER]
  );
  await db.exec(`set request.jwt.claim.sub='${OTHER}'`);
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      kind: "set", collection: "reviewMarks", path: "card-a",
      value: "2026-08-07T18:50:00Z"
    }]), "76000000-0000-4000-8000-000000000001"]
  );
  const observation = [{
    kind: "set", collection: "observations", path: "card-a",
    value: {
      category: "question", body: "Leitor pode comentar?",
      updatedAt: "2026-08-07T18:51:00Z"
    }
  }];
  await assert.rejects(db.query(
    "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify(observation),
      "76000000-0000-4000-8000-000000000002"]
  ), /seleção ativa|participação/u);

  await db.exec(`set request.jwt.claim.sub='${USER}'`);
  await db.query(
    "insert into public.courses(id,owner_id,title,contract_key) values($1,$2,'Privado','course-a')",
    [COURSE, USER]
  );
  await db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','private',$2,$3)
  `, [WORKSPACE, COURSE, "1".repeat(64)]);
  await db.query(`
    insert into public.user_course_selections(id,user_id,course_id)
    values('76000000-0000-4000-8000-000000000003',$1,$2)
  `, [OTHER, COURSE]);
  await db.query(`
    delete from private.authoring_workspace_entities
    where workspace_id=$1 and entity_type='card' and entity_id='card-a'
  `, [WORKSPACE]);
  await db.exec(`set request.jwt.claim.sub='${OTHER}'`);
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,1,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify(observation),
      "76000000-0000-4000-8000-000000000004"]
  );
  assert.equal((await db.query(`
    select private.trail_observation_target_available_v1(
      trail_item_id,card_id
    ) available from private.trail_observation_threads
    where user_id=$1 and trail_item_id=$2
  `, [OTHER, item.trailItemId])).rows[0].available, false);
  await db.close();
});

test("excluir respondente anonimiza ator sem apagar resposta e resolução", async () => {
  const db = await prepare();
  const item = (await db.query(
    "select public.list_trail_items_v1(100,null,null,null) value"
  )).rows[0].value.items.find((value) => value.courseKey === "course-a");
  await db.query(
    "select public.mutate_trail_personal_state_v1($1,0,$2::jsonb,$3)",
    [item.trailItemId, JSON.stringify([{
      kind: "set", collection: "observations", path: "card-a",
      value: {
        category: "possible_error", body: "Confira.",
        updatedAt: "2026-08-07T19:00:00Z"
      }
    }]), "77000000-0000-4000-8000-000000000001"]
  );
  await db.query(`
    update private.trail_observation_threads
    set status='resolved', response='Resposta mantida.', responded_by=$1,
      responded_at='2026-08-07T19:01:00Z', resolution_note='Resolvido.',
      resolved_by=$1, resolved_at='2026-08-07T19:02:00Z'
    where user_id=$2 and trail_item_id=$3
  `, [OTHER, USER, item.trailItemId]);
  await db.query("delete from auth.users where id=$1", [OTHER]);
  const thread = (await db.query(`
    select response,responded_by,responded_at,resolution_note,resolved_by,resolved_at
    from private.trail_observation_threads
    where user_id=$1 and trail_item_id=$2
  `, [USER, item.trailItemId])).rows[0];
  assert.equal(thread.response, "Resposta mantida.");
  assert.equal(thread.responded_by, null);
  assert(thread.responded_at);
  assert.equal(thread.resolution_note, "Resolvido.");
  assert.equal(thread.resolved_by, null);
  assert(thread.resolved_at);
  await db.close();
});

test("elevação ao catálogo troca selections e libera origem após submissão terminal", async () => {
  const db = await prepare();
  const privateCourse = "78000000-0000-4000-8000-000000000001";
  const catalogCourse = "78000000-0000-4000-8000-000000000002";
  const submissionId = "78000000-0000-4000-8000-000000000003";
  const secondSubmissionId = "78000000-0000-4000-8000-000000000005";
  const currentSubmissionId = "78000000-0000-4000-8000-000000000006";
  await db.query(
    "insert into public.courses(id,owner_id,title,contract_key,current_revision_hash) values($1,$2,'Protótipo','course-a',$3)",
    [privateCourse, USER, "a".repeat(64)]
  );
  await db.query(
    "update private.authoring_workspaces set source_course_id=$1,source_revision_hash=$2 where id=$3",
    [privateCourse, "a".repeat(64), WORKSPACE]
  );
  await db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','private',$2,$3)
  `, [WORKSPACE, privateCourse, "a".repeat(64)]);
  await db.query(`
    insert into public.user_course_selections(id,user_id,course_id)
    values('78000000-0000-4000-8000-000000000004',$1,$2)
  `, [USER, privateCourse]);
  await db.query(`
    insert into private.catalog_review_submissions(
      id,author_id,source_course_id,artifact_hash,status
    ) values($1,$2,$3,null,'changes_requested')
  `, [submissionId, USER, privateCourse]);
  await assert.rejects(db.query(
    "update public.courses set document_storage_enabled=false where id=$1",
    [privateCourse]
  ), /submissão editorial ativa/u);
  assert.equal((await db.query(`
    select count(*)::integer count from public.user_course_selections
    where user_id=$1 and course_id=$2
  `, [USER, privateCourse])).rows[0].count, 1);
  await db.query(`
    insert into private.catalog_review_submissions(
      id,author_id,source_course_id,source_revision_hash,artifact_hash,status
    ) values($1,$2,$3,$4,$4,'submitted')
  `, [secondSubmissionId, USER, privateCourse, "b".repeat(64)]);
  assert.deepEqual((await db.query(`
    select status,source_course_id,artifact_hash
    from private.catalog_review_submissions where id=$1
  `, [submissionId])).rows[0], {
    status: "superseded", source_course_id: null, artifact_hash: null
  });
  await db.query(
    "update private.catalog_review_submissions set status='changes_requested' where id=$1",
    [secondSubmissionId]
  );
  assert.equal((await db.query(`
    select artifact_hash from private.catalog_review_submissions where id=$1
  `, [secondSubmissionId])).rows[0].artifact_hash, null);
  await db.query(`
    insert into private.catalog_review_submissions(
      id,author_id,source_course_id,source_revision_hash,artifact_hash,status
    ) values($1,$2,$3,$4,$4,'submitted')
  `, [currentSubmissionId, USER, privateCourse, "c".repeat(64)]);
  assert.deepEqual((await db.query(`
    select status,source_course_id,artifact_hash
    from private.catalog_review_submissions where id=$1
  `, [secondSubmissionId])).rows[0], {
    status: "superseded", source_course_id: null, artifact_hash: null
  });
  await db.query(
    "insert into public.courses(id,title,contract_key,current_revision_hash) values($1,'Oficial','course-a',$2)",
    [catalogCourse, "c".repeat(64)]
  );
  await db.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','catalog',$2,$3)
  `, [WORKSPACE, catalogCourse, "c".repeat(64)]);
  assert.deepEqual((await db.query(`
    select course_id from public.user_course_selections where user_id=$1
  `, [USER])).rows.map((row) => row.course_id), [catalogCourse]);
  assert.equal((await db.query(
    "select count(*)::integer count from public.courses where id=$1", [privateCourse]
  )).rows[0].count, 1);
  assert.equal((await db.query(`
    select source_course_id from private.catalog_review_submissions where id=$1
  `, [currentSubmissionId])).rows[0].source_course_id, privateCourse);
  const source = (await db.query(`
    select source_course_id,source_revision_hash from private.authoring_workspaces where id=$1
  `, [WORKSPACE])).rows[0];
  assert.deepEqual(source, { source_course_id: null, source_revision_hash: null });
  await db.query(
    "update private.catalog_review_submissions set status='accepted',artifact_hash=null where id=$1",
    [currentSubmissionId]
  );
  const terminal = (await db.query(`
    select source_course_id,artifact_hash,status
    from private.catalog_review_submissions where id=$1
  `, [currentSubmissionId])).rows[0];
  assert.deepEqual(terminal, {
    source_course_id: null,
    artifact_hash: null,
    status: "accepted"
  });
  assert.equal((await db.query(
    "select count(*)::integer count from public.courses where id=$1", [privateCourse]
  )).rows[0].count, 0);
  assert.equal((await db.query(`
    select count(*)::integer count from private.authoring_workspace_publications
    where workspace_id=$1 and workspace_course_id='course-a'
  `, [WORKSPACE])).rows[0].count, 1);
  await db.close();
});
