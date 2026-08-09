import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260809010000_authoring_continuity.sql",
  import.meta.url
);
const volatilityMigrationUrl = new URL(
  "../../supabase/migrations/20260809011000_align_authoring_continuity_volatility.sql",
  import.meta.url
);
const ACTOR = "10000000-0000-4000-8000-000000000001";
const REVIEWER = "10000000-0000-4000-8000-000000000002";
const CATALOG_EDITOR = "10000000-0000-4000-8000-000000000003";
const OUTSIDER = "10000000-0000-4000-8000-000000000004";
const LEARNER = "10000000-0000-4000-8000-000000000005";
const WORKSPACE_A = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "20000000-0000-4000-8000-000000000002";
const PART_MICROSEQUENCES = [
  [1, 12], [13, 18], [19, 26], [27, 37]
].map(([start, end]) => Array.from(
  { length: end - start + 1 },
  (_, offset) => `m${String(start + offset).padStart(2, "0")}`
));

function hash(character) {
  return character.repeat(64);
}

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function setupDatabase() {
  const database = new PGlite();
  await database.exec(`
    create schema private;
    create schema auth;
    create schema extensions;
    create role anon;
    create role authenticated;
    create role service_role;

    create table auth.users(id uuid primary key);
    create function extensions.digest(bytea,text) returns bytea language sql immutable
      as $$ select decode(md5($1) || md5($1), 'hex') $$;

    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      title text not null,
      revision bigint not null default 1,
      source_course_id uuid,
      source_revision_hash text,
      source_submission_id uuid,
      brief text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id, entity_type, entity_id)
    );
    create table private.authoring_workspace_requests(
      owner_id uuid not null references auth.users(id),
      request_id text not null,
      operation text not null,
      payload_hash text not null,
      workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '14 days',
      primary key(owner_id, request_id),
      constraint authoring_workspace_requests_operation_v5 check(operation in (
        'create','create_structure','update_metadata','save_microsequence_cards',
        'save_card','update_brief','copy_entity','rename_entity','move_entity',
        'delete_entity','merge_microsequences','split_microsequence',
        'promote_module','demote_course','import_course','publish_private_preview',
        'publish_private_complete','publish_catalog_complete','delete_workspace'
      )),
      check(payload_hash ~ '^[0-9a-f]{64}$'),
      check(jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536)
    );
    create table private.authoring_workspace_events(
      id bigint generated always as identity primary key,
      workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id),
      created_at timestamptz not null default now(),
      unique(workspace_id, revision),
      constraint authoring_workspace_events_operation_v5 check(operation in (
        'create','create_structure','update_metadata','save_microsequence_cards',
        'save_card','update_brief','copy_entity','rename_entity','move_entity',
        'delete_entity','merge_microsequences','split_microsequence',
        'promote_module','demote_course','import_course'
      )),
      check(jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 32768)
    );
    create table private.authoring_workspace_observations(
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
      author_id uuid not null references auth.users(id) on delete cascade,
      entity_type text not null,
      entity_path text[] not null default '{}',
      resource_target_id text,
      body text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check(entity_type in (
        'workspace','course','module','lesson','microsequence','card','resource'
      )),
      check(
        (entity_type = 'resource' and resource_target_id is not null)
        or (entity_type <> 'resource' and resource_target_id is null)
      ),
      check(btrim(body) <> '' and char_length(body) <= 2000)
    );
    create table private.authoring_workspace_observation_receipts(
      actor_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      request_hash text not null,
      result jsonb not null,
      created_at timestamptz not null default now(),
      primary key(actor_id, request_id)
    );

    create table private.trail_items(
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid,
      workspace_course_id text,
      course_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(workspace_id, workspace_course_id)
    );
    create table public.trail_personal_states(
      user_id uuid not null references auth.users(id) on delete cascade,
      trail_item_id uuid not null references private.trail_items(id) on delete cascade,
      revision bigint not null default 1,
      completed_card_count integer not null default 0,
      state jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(user_id, trail_item_id)
    );
    create table private.trail_observation_threads(
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      trail_item_id uuid not null references private.trail_items(id) on delete cascade,
      card_id text not null,
      status text not null default 'open',
      response text,
      responded_by uuid references auth.users(id),
      responded_at timestamptz,
      resolution_note text,
      resolved_by uuid references auth.users(id),
      resolved_at timestamptz,
      correction_request_id text,
      correction_entity_path text[],
      correction_linked_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(user_id, trail_item_id, card_id)
    );
    create table private.educational_workspace_receipts(
      actor_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      operation text not null,
      payload_hash text not null,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '7 days',
      primary key(actor_id, request_id)
    );

    create table private.educational_workspace_members(
      workspace_id uuid not null references private.authoring_workspaces(id),
      user_id uuid not null references auth.users(id),
      role text not null,
      primary key(workspace_id,user_id)
    );
    create function private.educational_workspace_role_v1(uuid,uuid)
    returns text language sql stable as $$
      select role from private.educational_workspace_members
      where workspace_id=$1 and user_id=$2
    $$;

    create function private.educational_workspace_can_v1(uuid,uuid,text)
    returns boolean language sql stable as $$
      select ($2='${CATALOG_EDITOR}'::uuid and $3 <> 'transfer') or exists(
        select 1 from private.educational_workspace_members member
        where member.workspace_id=$1 and member.user_id=$2
          and case $3
            when 'read' then true
            when 'author' then member.role in ('owner','admin','author')
            when 'review' then member.role in ('owner','admin','author','reviewer')
            when 'comment' then member.role <> 'reader'
            else member.role in ('owner','admin')
          end
      )
    $$;
    create function private.require_educational_workspace_capability_v1(uuid,uuid,text)
    returns text language plpgsql as $$ begin return $3; end $$;
    create function public.get_authoring_workspace_v5(
      p_owner_id uuid, p_workspace_id uuid, p_course_ids text[] default null,
      p_include_card_content boolean default true
    ) returns jsonb language sql stable security definer as $$
      select jsonb_build_object(
        'workspaceId', v_workspace.id,
        'role', private.educational_workspace_role_v1(v_workspace.id, p_owner_id)
      )
      from private.authoring_workspaces v_workspace
      where v_workspace.id = p_workspace_id
        and private.educational_workspace_can_v1(
          v_workspace.id, p_owner_id, 'read'
        )
    $$;
    create function public.list_authoring_workspaces_v5(
      p_owner_id uuid, p_limit integer default 50,
      p_before_updated_at timestamptz default null,
      p_before_id uuid default null
    ) returns jsonb language sql stable security definer as $$
      select jsonb_build_object('items', coalesce(jsonb_agg(
        jsonb_build_object(
          'workspaceId', page.id,
          'role', private.educational_workspace_role_v1(page.id, p_owner_id)
        ) order by page.id
      ), '[]'::jsonb))
      from (
        select workspace.id
        from private.authoring_workspaces workspace
        where private.educational_workspace_can_v1(
          workspace.id, p_owner_id, 'read'
        )
        order by workspace.id
        limit p_limit
      ) page
    $$;
    create function private.educational_workspace_comment_summary_v1(uuid,uuid)
    returns jsonb language sql stable as $$ select jsonb_build_object(
      'totalCount',2,'openCount',1,'focusCards',jsonb_build_array(
        jsonb_build_object('cardId','card-a','totalCount',2,'openCount',1)
      )
    ) $$;
    create function private.manage_educational_workspace_comment_v1(
      p_actor_id uuid, p_request_id text, p_workspace_id uuid,
      p_comment_id uuid, p_operation text, p_payload jsonb
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,public,private,extensions as $$
    declare v_receipt private.educational_workspace_receipts%rowtype;
      v_thread private.trail_observation_threads%rowtype;
      v_hash text; v_path text[]; v_result jsonb; v_status text;
    begin
      v_hash := md5(jsonb_build_object(
        'workspaceId',p_workspace_id,'commentId',p_comment_id,
        'operation',p_operation,'payload',p_payload
      )::text) || md5(jsonb_build_object(
        'workspaceId',p_workspace_id,'commentId',p_comment_id,
        'operation',p_operation,'payload',p_payload
      )::text);
      select * into v_receipt from private.educational_workspace_receipts
      where actor_id=p_actor_id and request_id=p_request_id;
      if found then
        if v_receipt.operation<>p_operation or v_receipt.payload_hash<>v_hash then
          raise exception 'request mismatch' using errcode='23505';
        end if;
        return v_receipt.result || jsonb_build_object('idempotent',true);
      end if;
      select thread.* into v_thread
      from private.trail_observation_threads thread
      join private.trail_items item on item.id=thread.trail_item_id
      join public.trail_personal_states state_row
        on state_row.user_id=thread.user_id
       and state_row.trail_item_id=thread.trail_item_id
      where thread.id=p_comment_id and item.workspace_id=p_workspace_id
        and state_row.state#>array['observations',thread.card_id] is not null
      for update of thread;
      if not found then raise exception 'missing' using errcode='P0002'; end if;
      if p_operation='set_comment_status' then
        v_status:=p_payload->>'status';
        if v_status not in ('open','considered','resolved','incorporated') then
          raise exception 'invalid status' using errcode='22023';
        end if;
        update private.trail_observation_threads
        set status=v_status,updated_at=now() where id=p_comment_id;
      elsif p_operation='link_comment_correction' then
        select array_agg(value order by ordinal) into v_path
        from jsonb_array_elements_text(p_payload->'entityPath')
          with ordinality item(value,ordinal);
        update private.trail_observation_threads
        set status='incorporated',correction_request_id=p_payload->>'correctionRequestId',
          correction_entity_path=v_path,correction_linked_at=now(),updated_at=now()
        where id=p_comment_id;
      elsif p_operation='respond_comment' then
        update private.trail_observation_threads
        set response=p_payload->>'response',responded_by=p_actor_id,
          responded_at=now(),updated_at=now() where id=p_comment_id;
      else
        raise exception 'invalid operation' using errcode='22023';
      end if;
      select * into v_thread from private.trail_observation_threads where id=p_comment_id;
      v_result:=jsonb_build_object(
        'workspaceId',p_workspace_id,'commentId',p_comment_id,
        'operation',p_operation,'status',v_thread.status,
        'updatedAt',v_thread.updated_at,'idempotent',false
      );
      insert into private.educational_workspace_receipts(
        actor_id,request_id,operation,payload_hash,result
      ) values(p_actor_id,p_request_id,p_operation,v_hash,v_result);
      return v_result;
    end $$;
    create function private.prune_authoring_workspace_state_v5(uuid,text)
    returns void language plpgsql as $$
    begin
      delete from private.authoring_workspace_requests request
      where request.owner_id = $1 and request.request_id = $2
        and request.expires_at <= statement_timestamp();
      delete from private.authoring_workspace_requests request
      where request.ctid in (
        select expired.ctid from private.authoring_workspace_requests expired
        where expired.expires_at <= statement_timestamp()
        order by expired.expires_at limit 256
      );
    end $$;

    create function private.list_authoring_workspace_observations_v1(uuid,uuid)
    returns jsonb language sql stable as $$ select '{"items":[]}'::jsonb $$;
    create function public.list_authoring_workspace_observations_for_actor_v1(uuid,uuid)
    returns jsonb language sql stable security definer
      as $$ select private.list_authoring_workspace_observations_v1($1,$2) $$;
    create function private.manage_authoring_workspace_observation_v1(
      uuid,text,uuid,text,jsonb
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.manage_authoring_workspace_observation_for_actor_v1(
      uuid,text,uuid,text,jsonb
    ) returns jsonb language sql security definer as $$
      select private.manage_authoring_workspace_observation_v1($1,$2,$3,$4,$5)
    $$;
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer set search_path=pg_catalog
      as $$ select jsonb_build_object(
        'schemaRevision','20260808022000','contractVersion',4,
        'features',jsonb_build_array('alphabetic-catalog-v1')
      ) $$;

    create function public.update_authoring_workspace_brief_v5(
      p_actor_id uuid, p_workspace_id uuid, p_request_id text,
      p_payload_hash text, p_expected_revision bigint, p_brief text
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,private as $$
    declare v_revision bigint; v_result jsonb;
    begin
      select revision into v_revision from private.authoring_workspaces
      where id=p_workspace_id for update;
      if v_revision <> p_expected_revision then
        raise exception 'stale' using errcode='40001';
      end if;
      update private.authoring_workspaces
      set brief=p_brief,revision=revision+1,updated_at=now()
      where id=p_workspace_id returning revision into v_revision;
      v_result:=jsonb_build_object(
        'workspaceId',p_workspace_id,'revision',v_revision,'idempotent',false
      );
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values(p_actor_id,p_request_id,'update_brief',p_payload_hash,p_workspace_id,v_result);
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id
      ) values(
        p_workspace_id,v_revision,'update_brief',
        jsonb_build_object('operation','update_brief'),p_actor_id
      );
      return v_result;
    end $$;

    create function public.commit_authoring_workspace_changes_v5(
      p_actor_id uuid, p_workspace_id uuid, p_request_id text,
      p_payload_hash text, p_expected_revision bigint, p_operation text,
      p_changes jsonb, p_summary jsonb
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,private as $$
    declare v_request private.authoring_workspace_requests%rowtype;
      v_revision bigint; v_change jsonb; v_result jsonb;
    begin
      select * into v_request from private.authoring_workspace_requests
      where owner_id=p_actor_id and request_id=p_request_id;
      if found then
        if v_request.workspace_id<>p_workspace_id
           or v_request.operation<>p_operation
           or v_request.payload_hash<>p_payload_hash then
          raise exception 'request mismatch' using errcode='23505';
        end if;
        return v_request.result || jsonb_build_object('idempotent',true);
      end if;
      select revision into v_revision from private.authoring_workspaces
      where id=p_workspace_id
        and private.educational_workspace_can_v1(id,p_actor_id,'author')
      for update;
      if not found then raise exception 'missing' using errcode='P0002'; end if;
      if v_revision<>p_expected_revision then
        raise exception 'stale' using errcode='40001';
      end if;
      for v_change in select value from jsonb_array_elements(p_changes->'deletes')
      loop
        delete from private.authoring_workspace_entities
        where workspace_id=p_workspace_id
          and entity_type=v_change->>'entityType'
          and entity_id=v_change->>'entityId'
          and version=(v_change->>'version')::bigint;
        if not found then raise exception 'stale entity' using errcode='40001'; end if;
      end loop;
      for v_change in select value from jsonb_array_elements(p_changes->'upserts')
      loop
        insert into private.authoring_workspace_entities(
          workspace_id,entity_type,entity_id,parent_type,parent_id,
          position,content,version
        ) values(
          p_workspace_id,v_change->>'entityType',v_change->>'entityId',
          nullif(v_change->>'parentType',''),nullif(v_change->>'parentId',''),
          (v_change->>'position')::integer,v_change->'content',1
        ) on conflict(workspace_id,entity_type,entity_id) do update set
          parent_type=excluded.parent_type,parent_id=excluded.parent_id,
          position=excluded.position,content=excluded.content,
          version=private.authoring_workspace_entities.version+1,
          updated_at=now();
      end loop;
      update private.authoring_workspaces set revision=revision+1,updated_at=now()
      where id=p_workspace_id returning revision into v_revision;
      v_result:=jsonb_build_object(
        'workspaceId',p_workspace_id,'revision',v_revision,
        'change',p_summary || jsonb_build_object('operation',p_operation),
        'idempotent',false
      );
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values(p_actor_id,p_request_id,p_operation,p_payload_hash,p_workspace_id,v_result);
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id
      ) values(p_workspace_id,v_revision,p_operation,v_result->'change',p_actor_id);
      return v_result;
    end $$;

    insert into auth.users(id) values
      ('${ACTOR}'),('${REVIEWER}'),('${CATALOG_EDITOR}'),('${OUTSIDER}'),
      ('${LEARNER}');
    insert into private.authoring_workspaces(id,owner_id,title) values
      ('${WORKSPACE_A}','${ACTOR}','Workspace A'),
      ('${WORKSPACE_B}','${REVIEWER}','Workspace B');
    insert into private.educational_workspace_members(workspace_id,user_id,role) values
      ('${WORKSPACE_A}','${ACTOR}','owner'),
      ('${WORKSPACE_A}','${REVIEWER}','reviewer'),
      ('${WORKSPACE_A}','${LEARNER}','reader'),
      ('${WORKSPACE_B}','${REVIEWER}','owner');
  `);
  for (const workspaceId of [WORKSPACE_A, WORKSPACE_B]) {
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ($1,'project','project',null,null,0,'{"title":"Projeto"}'::jsonb),
        ($1,'course','course-a','project','project',0,'{"title":"Curso A"}'::jsonb),
        ($1,'course','course-b','project','project',1,'{"title":"Curso B"}'::jsonb),
        ($1,'module','module-a','course','course-a',0,'{"title":"Módulo"}'::jsonb),
        ($1,'lesson','lesson-a','module','module-a',0,'{"title":"Lição"}'::jsonb),
        ($1,'microsequence','micro-a','lesson','lesson-a',0,'{"title":"Micro"}'::jsonb),
        ($1,'card','card-a','microsequence','micro-a',1,
          '{
            "title":"Card","resource":"composite","exercise":"none",
            "blocks":[{"id":"paragraph-a","kind":"paragraph","text":"A"}],
            "after":"","afterBlocks":[{"id":"support-a","kind":"paragraph","text":"B"}]
          }'::jsonb)
    `, [workspaceId]);
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      )
      select $1,'microsequence','m' || lpad(value::text,2,'0'),
        'lesson','lesson-a',value,
        jsonb_build_object('title','Microssequência ' || value)
      from generate_series(1,37) value
    `, [workspaceId]);
  }
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  await database.exec(await fs.readFile(volatilityMigrationUrl, "utf8"));
  return database;
}

async function updateContinuity(database, {
  workspaceId = WORKSPACE_A,
  actorId = ACTOR,
  requestId,
  payloadHash,
  expectedRevision,
  operation = "define_part",
  state
}) {
  return scalar(database, `
    select public.update_authoring_workspace_continuity_v1(
      $1,$2,$3,$4,$5,$6,$7::jsonb
    ) value
  `, [
    actorId, workspaceId, requestId, payloadHash,
    expectedRevision, operation, JSON.stringify(state)
  ]);
}

async function setMandateFixture(database, mandate, workspaceId = WORKSPACE_A) {
  const decidedAtRevision = await scalar(database, `
    select revision value from private.authoring_workspaces where id=$1
  `, [workspaceId]);
  const value = mandate === null ? null : { ...mandate, decidedAtRevision };
  await database.query(`
    update private.authoring_workspaces
    set authoring_state=jsonb_set(authoring_state,'{mandate}',$2::jsonb,false)
    where id=$1
  `, [workspaceId, JSON.stringify(value)]);
}

async function rawManageFinding(database, {
  workspaceId = WORKSPACE_A,
  actorId = ACTOR,
  requestId,
  payloadHash,
  expectedRevision,
  operation,
  payload
}) {
  return scalar(database, `
    select public.manage_authoring_workspace_finding_v1(
      $1,$2,$3,$4,$5,$6,$7::jsonb
    ) value
  `, [
    actorId, workspaceId, requestId, payloadHash,
    expectedRevision, operation, JSON.stringify(payload)
  ]);
}

async function manageFinding(database, input) {
  const {
    workspaceId = WORKSPACE_A,
    operation
  } = input;
  if (operation === "create" || operation === "verify") {
    // A maioria destes testes isola o lifecycle do achado. Instale o mandato
    // de auditoria como fixture sem alterar a revisão que cada cenário prova;
    // o teste dedicado abaixo exercita a troca real via RPC/CAS.
    await setMandateFixture(database, {
      id: "audit:test:fixture", kind: "audit"
    }, workspaceId);
  }
  return rawManageFinding(database, input);
}

async function commitChanges(database, {
  workspaceId = WORKSPACE_A,
  actorId = ACTOR,
  requestId,
  payloadHash,
  expectedRevision,
  operation,
  changes,
  summary
}) {
  return scalar(database, `
    select public.commit_authoring_workspace_changes_v5(
      $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb
    ) value
  `, [
    actorId, workspaceId, requestId, payloadHash, expectedRevision,
    operation, JSON.stringify(changes), JSON.stringify(summary)
  ]);
}

async function manageComment(database, {
  actorId = ACTOR,
  workspaceId = WORKSPACE_A,
  requestId,
  commentId,
  operation,
  payload
}) {
  return scalar(database, `
    select private.manage_educational_workspace_comment_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    actorId, requestId, workspaceId, commentId,
    operation, JSON.stringify(payload)
  ]);
}

test("continuidade conserva p1-p4, usa CAS e não grava o estado em receipts ou eventos", async () => {
  const database = await setupDatabase();
  try {
    const state = {
      version: 1,
      parts: ["p1", "p2", "p3", "p4"].map((id, index) => ({
        id,
        title: `Parte ${index + 1}`,
        microsequenceIds: PART_MICROSEQUENCES[index]
      })),
      decisions: [{
        id: "d1",
        summary: "Conservar a progressão em quatro partes.",
        entityType: "course",
        entityId: "course-a"
      }],
      mandate: {
        id: "m1",
        kind: "build_part",
        targetPartId: "p1",
        note: "Materializar a primeira parte."
      }
    };
    const first = await updateContinuity(database, {
      requestId: "continuity:parts:0001",
      payloadHash: hash("a"),
      expectedRevision: 1,
      operation: "record_approved_plan",
      state
    });
    assert.equal(first.revision, 2);
    assert.equal(first.partCount, 4);
    assert.equal(first.continuityOperation, "record_approved_plan");
    assert.equal(first.idempotent, false);

    const read = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.deepEqual(read.authoringState.parts.map((part) => part.id), ["p1", "p2", "p3", "p4"]);
    assert.equal(read.authoringState.mandate.decidedAtRevision, 1);

    const replay = await updateContinuity(database, {
      requestId: "continuity:parts:0001",
      payloadHash: hash("a"),
      expectedRevision: 1,
      operation: "record_approved_plan",
      state
    });
    assert.equal(replay.revision, 2);
    assert.equal(replay.idempotent, true);
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:stale:0001",
      payloadHash: hash("b"),
      expectedRevision: 1,
      state
    }), (error) => error.code === "40001");

    const brief = await scalar(database, `
      select public.update_authoring_workspace_brief_v5($1,$2,$3,$4,$5,$6) value
    `, [ACTOR, WORKSPACE_A, "brief:update:0001", hash("c"), 2, "Brief atualizado"]);
    assert.equal(brief.revision, 3);
    const afterBrief = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.deepEqual(
      afterBrief.authoringState.parts.map((part) => part.id),
      ["p1", "p2", "p3", "p4"]
    );
    assert.deepEqual(
      afterBrief.authoringState.parts.map((part) => part.microsequenceIds),
      PART_MICROSEQUENCES
    );
    assert.deepEqual(afterBrief.authoringState.decisions, state.decisions);
    assert.equal(afterBrief.authoringState.mandate.id, "m1");
    assert.equal(afterBrief.authoringState.mandate.targetPartId, "p1");

    const receipt = await scalar(database, `
      select result value from private.authoring_workspace_requests
      where owner_id=$1 and request_id='continuity:parts:0001'
    `, [ACTOR]);
    const event = await scalar(database, `
      select summary value from private.authoring_workspace_events
      where workspace_id=$1 and operation='update_continuity'
    `, [WORKSPACE_A]);
    assert.equal(Object.hasOwn(receipt, "authoringState"), false);
    assert.equal(Object.hasOwn(event, "parts"), false);
    assert.equal(event.partCount, 4);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_events
      where workspace_id=$1 and operation='update_continuity'
    `, [WORKSPACE_A]), 1);
  } finally {
    await database.close();
  }
});

test("split e merge remapeiam Partes no mesmo CAS e rollback impede merge entre Partes", async () => {
  const database = await setupDatabase();
  try {
    const initialState = {
      version: 1,
      parts: [{ id: "p1", title: "Parte 1", microsequenceIds: ["m01", "m02"] }],
      decisions: [{
        id: "decision:split:source", summary: "Conservar a decisão na origem.",
        entityType: "microsequence", entityId: "m01"
      }],
      mandate: null
    };
    await updateContinuity(database, {
      requestId: "continuity:remap:init",
      payloadHash: hash("a"), expectedRevision: 1, state: initialState
    });
    const split = await commitChanges(database, {
      requestId: "changes:split:0001",
      payloadHash: hash("b"), expectedRevision: 2,
      operation: "split_microsequence",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m01", parentType: "lesson",
          parentId: "lesson-a", position: 1, version: 1,
          content: { title: "M1", status: "ready" }
        }, {
          entityType: "microsequence", entityId: "m01b", parentType: "lesson",
          parentId: "lesson-a", position: 2,
          content: { title: "M1B", status: "planned" }
        }],
        deletes: []
      },
      summary: {
        created: 1, updated: 1, deleted: 0,
        targetPaths: [
          ["course-a", "module-a", "lesson-a", "m01"],
          ["course-a", "module-a", "lesson-a", "m01b"]
        ],
        continuityRemap: { kind: "split", sourceId: "m01", newId: "m01b" }
      }
    });
    assert.equal(split.revision, 3);
    assert.equal(split.change.continuityAdjusted, true);
    assert.equal(split.change.continuityAffectedPartCount, 1);
    assert.equal(Object.hasOwn(split.change, "continuityRemap"), false);
    let state = await scalar(database, `
      select authoring_state value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]);
    assert.deepEqual(state.parts[0].microsequenceIds, ["m01", "m01b", "m02"]);
    assert.equal(state.decisions[0].entityId, "m01");
    const replay = await commitChanges(database, {
      requestId: "changes:split:0001",
      payloadHash: hash("b"), expectedRevision: 2,
      operation: "split_microsequence",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m01", parentType: "lesson",
          parentId: "lesson-a", position: 1, version: 1,
          content: { title: "M1", status: "ready" }
        }, {
          entityType: "microsequence", entityId: "m01b", parentType: "lesson",
          parentId: "lesson-a", position: 2,
          content: { title: "M1B", status: "planned" }
        }], deletes: []
      },
      summary: {
        created: 1, updated: 1, deleted: 0,
        targetPaths: [
          ["course-a", "module-a", "lesson-a", "m01"],
          ["course-a", "module-a", "lesson-a", "m01b"]
        ],
        continuityRemap: { kind: "split", sourceId: "m01", newId: "m01b" }
      }
    });
    assert.equal(replay.revision, 3);
    assert.equal(replay.idempotent, true);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_events
      where workspace_id=$1 and operation='split_microsequence'
    `, [WORKSPACE_A]), 1);
    const splitReceipt = await scalar(database, `
      select result value from private.authoring_workspace_requests
      where owner_id=$1 and request_id='changes:split:0001'
    `, [ACTOR]);
    assert.equal(JSON.stringify(splitReceipt).includes("continuityRemap"), false);
    assert.equal(JSON.stringify(splitReceipt).includes("authoringState"), false);

    const crossState = {
      version: 1,
      parts: [
        { id: "p1", title: "Parte 1", microsequenceIds: ["m01"] },
        { id: "p2", title: "Parte 2", microsequenceIds: ["m02"] }
      ],
      decisions: [], mandate: null
    };
    await updateContinuity(database, {
      requestId: "continuity:remap:cross",
      payloadHash: hash("c"), expectedRevision: 3, state: crossState
    });
    const mergeCall = {
      requestId: "changes:merge:cross",
      payloadHash: hash("d"), expectedRevision: 4,
      operation: "merge_microsequences",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m01", parentType: "lesson",
          parentId: "lesson-a", position: 1, version: 2,
          content: { title: "M1 reunida", status: "ready" }
        }],
        deletes: [{ entityType: "microsequence", entityId: "m02", version: 1 }]
      },
      summary: {
        created: 0, updated: 1, deleted: 1,
        targetPaths: [
          ["course-a", "module-a", "lesson-a", "m01"],
          ["course-a", "module-a", "lesson-a", "m02"]
        ],
        continuityRemap: { kind: "merge", targetId: "m01", sourceIds: ["m02"] }
      }
    };
    await assert.rejects(commitChanges(database, mergeCall),
      (error) => error.code === "23514");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 4);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='microsequence' and entity_id='m02'
    `, [WORKSPACE_A]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_requests
      where owner_id=$1 and request_id='changes:merge:cross'
    `, [ACTOR]), 0);

    await updateContinuity(database, {
      requestId: "continuity:remap:same",
      payloadHash: hash("e"), expectedRevision: 4,
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte 1", microsequenceIds: ["m02", "m01"] }],
        decisions: [{
          id: "decision:merge:source", summary: "Preservar após reunir.",
          entityType: "microsequence", entityId: "m02"
        }],
        mandate: null
      }
    });
    const merged = await commitChanges(database, {
      ...mergeCall,
      requestId: "changes:merge:0001",
      payloadHash: hash("f"), expectedRevision: 5
    });
    assert.equal(merged.revision, 6);
    state = await scalar(database, `
      select authoring_state value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]);
    assert.deepEqual(state.parts[0].microsequenceIds, ["m01"]);
    assert.deepEqual(state.decisions, [{
      id: "decision:merge:source", summary: "Preservar após reunir.",
      entityType: "microsequence", entityId: "m01"
    }]);
    assert.equal(merged.change.continuityAdjusted, true);
  } finally {
    await database.close();
  }
});

test("restructure focal aceita cards participantes de split e merge sem abrir outra Parte", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ($1,'card','card-split','microsequence','m01',1,'{"title":"Split"}'),
        ($1,'card','card-outside','microsequence','m13',1,'{"title":"Outside"}')
    `, [WORKSPACE_A]);
    await updateContinuity(database, {
      requestId: "continuity:restructure:cards", payloadHash: hash("1"),
      expectedRevision: 1, operation: "record_approved_plan",
      state: {
        version: 1,
        parts: [
          { id: "p1", title: "Parte 1", microsequenceIds: ["m01", "m02"] },
          { id: "p2", title: "Parte 2", microsequenceIds: ["m13"] }
        ],
        decisions: [{
          id: "decision:restructure:cards",
          summary: "Reorganizar cards somente dentro da Parte 1."
        }],
        mandate: {
          id: "restructure:p1:cards", kind: "restructure", targetPartId: "p1"
        }
      }
    });
    const splitCall = {
      requestId: "changes:restructure:split:cards",
      payloadHash: hash("2"), expectedRevision: 2,
      operation: "split_microsequence",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m01", parentType: "lesson",
          parentId: "lesson-a", position: 1, version: 1,
          content: { title: "M1", status: "ready" }
        }, {
          entityType: "microsequence", entityId: "m01b", parentType: "lesson",
          parentId: "lesson-a", position: 2,
          content: { title: "M1B", status: "ready" }
        }, {
          entityType: "card", entityId: "card-split", parentType: "microsequence",
          parentId: "m01b", position: 1, version: 1,
          content: { title: "Split" }
        }], deletes: []
      },
      summary: {
        created: 1, updated: 2, deleted: 0,
        targetPaths: [
          ["course-a", "module-a", "lesson-a", "m01"],
          ["course-a", "module-a", "lesson-a", "m01b"]
        ], targetPathsTruncated: false,
        continuityRemap: { kind: "split", sourceId: "m01", newId: "m01b" }
      }
    };
    const split = await commitChanges(database, splitCall);
    assert.equal(split.revision, 3);
    assert.equal(await scalar(database, `
      select parent_id value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card-split'
    `, [WORKSPACE_A]), "m01b");
    assert.deepEqual(await scalar(database, `
      select authoring_state#>'{parts,0,microsequenceIds}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), ["m01", "m01b", "m02"]);
    const replay = await commitChanges(database, splitCall);
    assert.equal(replay.idempotent, true);
    assert.equal(replay.revision, 3);

    await assert.rejects(commitChanges(database, {
      requestId: "changes:restructure:split:outside",
      payloadHash: hash("3"), expectedRevision: 3,
      operation: "split_microsequence",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m02", parentType: "lesson",
          parentId: "lesson-a", position: 3, version: 1,
          content: { title: "M2", status: "ready" }
        }, {
          entityType: "microsequence", entityId: "m02b", parentType: "lesson",
          parentId: "lesson-a", position: 4,
          content: { title: "M2B", status: "ready" }
        }, {
          entityType: "card", entityId: "card-outside",
          parentType: "microsequence", parentId: "m02b", position: 1,
          version: 1, content: { title: "Outside" }
        }], deletes: []
      },
      summary: {
        created: 1, updated: 2, deleted: 0,
        targetPaths: [
          ["course-a", "module-a", "lesson-a", "m02"],
          ["course-a", "module-a", "lesson-a", "m02b"]
        ], targetPathsTruncated: false,
        continuityRemap: { kind: "split", sourceId: "m02", newId: "m02b" }
      }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 3);
    assert.equal(await scalar(database, `
      select parent_id value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card-outside'
    `, [WORKSPACE_A]), "m13");

    const merged = await commitChanges(database, {
      requestId: "changes:restructure:merge:cards",
      payloadHash: hash("4"), expectedRevision: 3,
      operation: "merge_microsequences",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m01", parentType: "lesson",
          parentId: "lesson-a", position: 1, version: 2,
          content: { title: "M1 reunida", status: "ready" }
        }, {
          entityType: "card", entityId: "card-split", parentType: "microsequence",
          parentId: "m01", position: 1, version: 2,
          content: { title: "Split" }
        }],
        deletes: [{ entityType: "microsequence", entityId: "m01b", version: 1 }]
      },
      summary: {
        created: 0, updated: 2, deleted: 1,
        targetPaths: [
          ["course-a", "module-a", "lesson-a", "m01"],
          ["course-a", "module-a", "lesson-a", "m01b"]
        ], targetPathsTruncated: false,
        continuityRemap: { kind: "merge", targetId: "m01", sourceIds: ["m01b"] }
      }
    });
    assert.equal(merged.revision, 4);
    assert.equal(await scalar(database, `
      select parent_id value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card-split'
    `, [WORKSPACE_A]), "m01");
    assert.deepEqual(await scalar(database, `
      select authoring_state#>'{parts,0,microsequenceIds}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), ["m01", "m02"]);
  } finally {
    await database.close();
  }
});

test("mandato build_part só é consumido após cards ready em toda a Parte", async () => {
  const database = await setupDatabase();
  try {
    const plan = {
      version: 1,
      parts: [{ id: "p1", title: "Parte 1", microsequenceIds: ["m01", "m02"] }],
      decisions: [],
      mandate: { id: "build:p1", kind: "build_part", targetPartId: "p1" }
    };
    await updateContinuity(database, {
      requestId: "continuity:build:init",
      payloadHash: hash("1"), expectedRevision: 1, operation: "set_mandate", state: plan
    });
    await assert.rejects(commitChanges(database, {
      requestId: "build:outside:m03",
      payloadHash: hash("0"), expectedRevision: 2,
      operation: "save_microsequence_cards",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m03", parentType: "lesson",
          parentId: "lesson-a", position: 3, version: 1,
          content: { title: "m03", status: "ready" }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0,
        targetPath: ["course-a", "module-a", "lesson-a", "m03"]
      }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 2);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_requests
      where owner_id=$1 and request_id='build:outside:m03'
    `, [ACTOR]), 0);
    async function saveMicro({ id, cardId, version, status, expectedRevision, requestId }) {
      const upserts = [{
        entityType: "microsequence", entityId: id, parentType: "lesson",
        parentId: "lesson-a", position: Number(id.slice(1)), version,
        content: { title: id, status }
      }];
      if (cardId) upserts.push({
        entityType: "card", entityId: cardId, parentType: "microsequence",
        parentId: id, position: 0, content: { title: cardId }
      });
      return commitChanges(database, {
        requestId, payloadHash: hash(requestId.at(-1)), expectedRevision,
        operation: "save_microsequence_cards",
        changes: { upserts, deletes: [] },
        summary: {
          created: cardId ? 1 : 0, updated: 1, deleted: 0,
          targetPath: ["course-a", "module-a", "lesson-a", id]
        }
      });
    }
    await saveMicro({
      id: "m01", cardId: "m01-card", version: 1, status: "generated",
      expectedRevision: 2, requestId: "build:save:m01:1"
    });
    assert.equal((await scalar(database, `
      select authoring_state#>>'{mandate,id}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A])), "build:p1");
    await saveMicro({
      id: "m01", version: 2, status: "ready",
      expectedRevision: 3, requestId: "build:ready:m01"
    });
    await saveMicro({
      id: "m02", cardId: "m02-card", version: 1, status: "generated",
      expectedRevision: 4, requestId: "build:save:m02:1"
    });
    assert.equal((await scalar(database, `
      select authoring_state#>>'{mandate,id}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A])), "build:p1");
    const completed = await saveMicro({
      id: "m02", version: 2, status: "ready",
      expectedRevision: 5, requestId: "build:ready:m02"
    });
    assert.equal(completed.revision, 6);
    assert.equal(completed.change.continuityMandateConsumed, true);
    assert.equal(await scalar(database, `
      select authoring_state->'mandate' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), null);
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:build:stale",
      payloadHash: hash("7"), expectedRevision: 6,
      operation: "set_mandate", state: plan
    }), (error) => error.code === "23514");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 6);
  } finally {
    await database.close();
  }
});

test("criação e reauditoria exigem mandato audit vigente e explícito", async () => {
  const database = await setupDatabase();
  try {
    const findingPayload = {
      entityType: "card",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      body: "Auditar o card.", category: "accuracy", severity: "medium",
      proposedRepair: "Corrigir e reauditar."
    };
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:audit:without-mandate", payloadHash: hash("0"),
      expectedRevision: 1, operation: "create", payload: findingPayload
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 1);

    const auditState = {
      version: 1, parts: [], decisions: [],
      mandate: { id: "audit:round:one", kind: "audit" }
    };
    await updateContinuity(database, {
      requestId: "continuity:audit:start", payloadHash: hash("1"),
      expectedRevision: 1, operation: "set_mandate", state: auditState
    });
    const first = await rawManageFinding(database, {
      requestId: "finding:audit:first", payloadHash: hash("2"),
      expectedRevision: 2, operation: "create", payload: findingPayload
    });
    const second = await rawManageFinding(database, {
      requestId: "finding:audit:second", payloadHash: hash("3"),
      expectedRevision: 3, operation: "create",
      payload: { ...findingPayload, body: "Auditar também a prática." }
    });
    assert.equal(second.revision, 4);
    assert.equal(await scalar(database, `
      select authoring_state#>>'{mandate,kind}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), "audit");
    await rawManageFinding(database, {
      requestId: "finding:audit:approve", payloadHash: hash("4"),
      expectedRevision: 4, operation: "decide",
      payload: { findingId: first.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:audit:repair", payloadHash: hash("5"),
      expectedRevision: 5, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:audit:first", kind: "repair_findings",
          findingIds: [first.findingId]
        }
      }
    });
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:audit:during-repair", payloadHash: hash("6"),
      expectedRevision: 6, operation: "create", payload: findingPayload
    }), (error) => error.code === "42501");
    await database.query(`
      update private.authoring_workspace_observations
      set status='repaired', correction_request_id='correction:audit:fixture',
          resulting_revision=6
      where id=$1
    `, [first.findingId]);
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:verify:during-repair", payloadHash: hash("7"),
      expectedRevision: 6, operation: "verify",
      payload: {
        findingId: first.findingId, outcome: "resolved",
        verification: "Ainda não há mandato de reauditoria."
      }
    }), (error) => error.code === "42501");
    await updateContinuity(database, {
      requestId: "continuity:audit:verify", payloadHash: hash("8"),
      expectedRevision: 6, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: { id: "audit:round:verify", kind: "audit" }
      }
    });
    const verified = await rawManageFinding(database, {
      requestId: "finding:verify:under-audit", payloadHash: hash("9"),
      expectedRevision: 7, operation: "verify",
      payload: {
        findingId: first.findingId, outcome: "resolved",
        verification: "A reauditoria confirmou a correção."
      }
    });
    assert.equal(verified.revision, 8);
    assert.equal(verified.status, "resolved");
    assert.equal(await scalar(database, `
      select authoring_state#>>'{mandate,kind}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), "audit");
    await updateContinuity(database, {
      requestId: "continuity:audit:clear", payloadHash: hash("a"),
      expectedRevision: 8, operation: "clear_mandate",
      state: { version: 1, parts: [], decisions: [], mandate: null }
    });
    assert.equal(await scalar(database, `
      select authoring_state->'mandate' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), null);
  } finally {
    await database.close();
  }
});

test("audit targetPartId fecha create e verify ao recorte da Parte", async () => {
  const database = await setupDatabase();
  try {
    const parts = [{
      id: "p1", title: "Parte 1", microsequenceIds: PART_MICROSEQUENCES[0]
    }, {
      id: "p2", title: "Parte 2", microsequenceIds: PART_MICROSEQUENCES[1]
    }];
    const decisions = [{ id: "decision:audit:parts", summary: "Auditar por Parte." }];
    await updateContinuity(database, {
      requestId: "continuity:audit:workspace", payloadHash: hash("1"),
      expectedRevision: 1, operation: "record_approved_plan",
      state: {
        version: 1, parts, decisions,
        mandate: { id: "audit:workspace", kind: "audit" }
      }
    });
    const outside = await rawManageFinding(database, {
      requestId: "finding:audit:p2:seed", payloadHash: hash("2"),
      expectedRevision: 2, operation: "create",
      payload: {
        entityType: "microsequence",
        entityPath: ["course-a", "module-a", "lesson-a", "m13"],
        body: "Achado da Parte 2.", category: "accuracy", severity: "medium",
        proposedRepair: "Corrigir a Parte 2."
      }
    });
    await updateContinuity(database, {
      requestId: "continuity:audit:p1", payloadHash: hash("3"),
      expectedRevision: 3, operation: "set_mandate",
      state: {
        version: 1, parts, decisions,
        mandate: { id: "audit:p1", kind: "audit", targetPartId: "p1" }
      }
    });
    const inside = await rawManageFinding(database, {
      requestId: "finding:audit:p1", payloadHash: hash("4"),
      expectedRevision: 4, operation: "create",
      payload: {
        entityType: "microsequence",
        entityPath: ["course-a", "module-a", "lesson-a", "m01"],
        body: "Achado da Parte 1.", category: "accuracy", severity: "high",
        proposedRepair: "Corrigir a Parte 1."
      }
    });
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:audit:p2:blocked", payloadHash: hash("5"),
      expectedRevision: 5, operation: "create",
      payload: {
        entityType: "microsequence",
        entityPath: ["course-a", "module-a", "lesson-a", "m13"],
        body: "Não pertence à P1.", category: "scope", severity: "low",
        proposedRepair: "Não criar neste recorte."
      }
    }), (error) => error.code === "42501");
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:audit:mixed-lesson", payloadHash: hash("6"),
      expectedRevision: 5, operation: "create",
      payload: {
        entityType: "lesson",
        entityPath: ["course-a", "module-a", "lesson-a"],
        body: "Ancestral mistura Partes.", category: "scope", severity: "low",
        proposedRepair: "Auditar em recorte mais estreito."
      }
    }), (error) => error.code === "42501");
    await database.query(`
      update private.authoring_workspace_observations
      set status='repaired', correction_request_id='correction:audit:part',
          resulting_revision=5
      where id in ($1,$2)
    `, [inside.findingId, outside.findingId]);
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:verify:p2:blocked", payloadHash: hash("7"),
      expectedRevision: 5, operation: "verify",
      payload: {
        findingId: outside.findingId, outcome: "resolved",
        verification: "A Parte 2 não está autorizada nesta rodada."
      }
    }), (error) => error.code === "42501");
    const verified = await rawManageFinding(database, {
      requestId: "finding:verify:p1", payloadHash: hash("8"),
      expectedRevision: 5, operation: "verify",
      payload: {
        findingId: inside.findingId, outcome: "resolved",
        verification: "A Parte 1 foi reaudidata."
      }
    });
    assert.equal(verified.revision, 6);
    assert.equal(await scalar(database, `
      select authoring_state#>>'{mandate,targetPartId}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), "p1");
  } finally {
    await database.close();
  }
});

test("reauditoria focal conserva o recorte após excluir micro, card ou resource", async () => {
  const database = await setupDatabase();
  const parts = [{
    id: "p1", title: "Parte 1", microsequenceIds: PART_MICROSEQUENCES[0]
  }, {
    id: "p2", title: "Parte 2", microsequenceIds: PART_MICROSEQUENCES[1]
  }];
  try {
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ($1,'card','card-p1','microsequence','m01',1,
          '{"title":"P1","resource":"composite","exercise":"none","blocks":[{"id":"p","kind":"paragraph","text":"P1"}]}'::jsonb),
        ($1,'card','card-p2','microsequence','m13',1,
          '{"title":"P2","resource":"paragraph","text":"P2"}'::jsonb)
    `, [WORKSPACE_A]);
    await updateContinuity(database, {
      requestId: "continuity:audit:deleted-targets", payloadHash: hash("1"),
      expectedRevision: 1, operation: "record_approved_plan",
      state: {
        version: 1, parts,
        decisions: [{ id: "decision:audit:deleted", summary: "Reauditar P1." }],
        mandate: { id: "audit:p1:deleted", kind: "audit", targetPartId: "p1" }
      }
    });
    const cardFinding = await rawManageFinding(database, {
      requestId: "finding:audit:deleted:card", payloadHash: hash("2"),
      expectedRevision: 2, operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "m01", "card-p1"],
        body: "Excluir o card.", category: "accuracy", severity: "medium",
        proposedRepair: "Excluir o card inadequado."
      }
    });
    const resourceFinding = await rawManageFinding(database, {
      requestId: "finding:audit:deleted:resource", payloadHash: hash("3"),
      expectedRevision: 3, operation: "create",
      payload: {
        entityType: "resource",
        entityPath: ["course-a", "module-a", "lesson-a", "m01", "card-p1"],
        resourceTargetId: "body:p",
        body: "Excluir o resource.", category: "accuracy", severity: "medium",
        proposedRepair: "Excluir o resource junto do card."
      }
    });
    const microFinding = await rawManageFinding(database, {
      requestId: "finding:audit:deleted:micro", payloadHash: hash("4"),
      expectedRevision: 4, operation: "create",
      payload: {
        entityType: "microsequence",
        entityPath: ["course-a", "module-a", "lesson-a", "m01"],
        body: "Excluir a micro.", category: "scope", severity: "high",
        proposedRepair: "Excluir a micro inadequada."
      }
    });
    const outsideFindingId = await scalar(database, `
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body,
        category,severity,status,proposed_repair,audit_revision,
        correction_request_id,resulting_revision
      ) values(
        $1,$2,'audit_finding','card',
        array['course-a','module-a','lesson-a','m13','card-p2'],
        'Fora de P1.','scope','low','repaired','Corrigir fora.',2,
        'correction:outside:p2',5
      ) returning id value
    `, [WORKSPACE_A, ACTOR]);
    await database.query(`
      update private.authoring_workspace_observations
      set status='repaired', correction_request_id='correction:deleted:p1',
        resulting_revision=5
      where id=any($1::uuid[])
    `, [[cardFinding.findingId, resourceFinding.findingId, microFinding.findingId]]);
    await database.query(`
      delete from private.authoring_workspace_entities
      where workspace_id=$1 and (
        (entity_type='card' and entity_id in ('card-p1','card-p2'))
        or (entity_type='microsequence' and entity_id='m01')
      )
    `, [WORKSPACE_A]);
    for (const [index, findingId] of [
      cardFinding.findingId, resourceFinding.findingId, microFinding.findingId
    ].entries()) {
      const verified = await rawManageFinding(database, {
        requestId: `finding:verify:deleted:p1:${index}`,
        payloadHash: hash(String(5 + index)),
        expectedRevision: 5 + index,
        operation: "verify",
        payload: {
          findingId, outcome: "resolved",
          verification: "A exclusão autorizada foi confirmada."
        }
      });
      assert.equal(verified.revision, 6 + index);
    }
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:verify:deleted:p2", payloadHash: hash("9"),
      expectedRevision: 8, operation: "verify",
      payload: {
        findingId: outsideFindingId, outcome: "resolved",
        verification: "P2 não pertence à rodada focal."
      }
    }), (error) => error.code === "42501");
  } finally {
    await database.close();
  }
});

test("audit_part_id permite reauditar lesson, module e course apagados sem abrir outra Parte", async () => {
  const database = await setupDatabase();
  const parts = [{
    id: "p1", title: "Parte 1", microsequenceIds: ["m01"]
  }, {
    id: "p2", title: "Parte 2", microsequenceIds: ["m13"]
  }];
  const decisions = [{
    id: "decision:audit:deleted:ancestors",
    summary: "Conservar a identidade da Parte na reauditoria."
  }];
  try {
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ($1,'course','course-p1','project','project',2,'{"title":"Curso P1"}'),
        ($1,'module','module-p1','course','course-p1',0,'{"title":"Módulo P1"}'),
        ($1,'lesson','lesson-p1','module','module-p1',0,'{"title":"Lição P1"}')
    `, [WORKSPACE_A]);
    await database.query(`
      update private.authoring_workspace_entities
      set parent_id='lesson-p1'
      where workspace_id=$1 and entity_type='microsequence' and entity_id='m01'
    `, [WORKSPACE_A]);
    await updateContinuity(database, {
      requestId: "continuity:audit:deleted:ancestors", payloadHash: hash("1"),
      expectedRevision: 1, operation: "record_approved_plan",
      state: {
        version: 1, parts, decisions,
        mandate: {
          id: "audit:p1:deleted:ancestors", kind: "audit", targetPartId: "p1"
        }
      }
    });
    const targetPayloads = [{
      entityType: "course", entityPath: ["course-p1"], label: "course"
    }, {
      entityType: "module", entityPath: ["course-p1", "module-p1"], label: "module"
    }, {
      entityType: "lesson",
      entityPath: ["course-p1", "module-p1", "lesson-p1"], label: "lesson"
    }, {
      entityType: "course", entityPath: ["course-p1"], label: "course-divergent"
    }];
    const findings = [];
    for (const [index, target] of targetPayloads.entries()) {
      findings.push(await rawManageFinding(database, {
        requestId: `finding:audit:deleted:${target.label}`,
        payloadHash: hash(String(index + 2)),
        expectedRevision: index + 2,
        operation: "create",
        payload: {
          entityType: target.entityType,
          entityPath: target.entityPath,
          body: `Reauditar ${target.label} após a exclusão.`,
          category: "scope", severity: "medium",
          proposedRepair: `Excluir ${target.label} se o achado for confirmado.`
        }
      }));
    }
    assert.deepEqual(await scalar(database, `
      select jsonb_agg(audit_part_id order by audit_revision) value
      from private.authoring_workspace_observations
      where id=any($1::uuid[])
    `, [findings.map(({ findingId }) => findingId)]), ["p1", "p1", "p1", "p1"]);
    await database.query(`
      update private.authoring_workspace_observations
      set status='repaired', correction_request_id='correction:ancestors:p1',
        resulting_revision=6
      where id=any($1::uuid[])
    `, [findings.map(({ findingId }) => findingId)]);
    await database.query(`
      delete from private.authoring_workspace_entities
      where workspace_id=$1 and (
        (entity_type='course' and entity_id='course-p1')
        or (entity_type='module' and entity_id='module-p1')
        or (entity_type='lesson' and entity_id='lesson-p1')
      )
    `, [WORKSPACE_A]);
    for (const [index, finding] of findings.slice(0, 3).entries()) {
      const verified = await rawManageFinding(database, {
        requestId: `finding:verify:deleted:ancestor:${index}`,
        payloadHash: hash(String(index + 6)),
        expectedRevision: index + 6,
        operation: "verify",
        payload: {
          findingId: finding.findingId, outcome: "resolved",
          verification: "A exclusão no recorte original foi confirmada."
        }
      });
      assert.equal(verified.revision, index + 7);
    }
    await updateContinuity(database, {
      requestId: "continuity:audit:p2:after-delete", payloadHash: hash("9"),
      expectedRevision: 9, operation: "set_mandate",
      state: {
        version: 1, parts, decisions,
        mandate: {
          id: "audit:p2:after-delete", kind: "audit", targetPartId: "p2"
        }
      }
    });
    await assert.rejects(rawManageFinding(database, {
      requestId: "finding:verify:deleted:part-divergent",
      payloadHash: hash("a"), expectedRevision: 10, operation: "verify",
      payload: {
        findingId: findings[3].findingId, outcome: "resolved",
        verification: "A Parte corrente não corresponde à auditoria original."
      }
    }), (error) => error.code === "42501");
  } finally {
    await database.close();
  }
});

test("mandatos repair, audit e restructure fecham o escopo do commit inteiro", async () => {
  const database = await setupDatabase();
  try {
    const finding = await manageFinding(database, {
      requestId: "finding:mandate:resource",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "resource",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        resourceTargetId: "body:paragraph-a",
        body: "Corrigir somente o parágrafo.", category: "accuracy",
        severity: "high", proposedRepair: "Reescrever o parágrafo."
      }
    });
    await manageFinding(database, {
      requestId: "finding:mandate:approve",
      payloadHash: hash("2"), expectedRevision: 2, operation: "decide",
      payload: { findingId: finding.findingId, decision: "approve" }
    });
    const repairState = {
      version: 1, parts: [], decisions: [],
      mandate: {
        id: "repair:scoped", kind: "repair_findings",
        findingIds: [finding.findingId]
      }
    };
    await updateContinuity(database, {
      requestId: "continuity:mandate:repair",
      payloadHash: hash("3"), expectedRevision: 3,
      operation: "set_mandate", state: repairState
    });
    const cardAPath = ["course-a", "module-a", "lesson-a", "micro-a", "card-a"];
    const cardBPath = ["course-a", "module-a", "lesson-a", "micro-a", "card-b"];
    const mixed = {
      requestId: "changes:repair:mixed",
      payloadHash: hash("4"), expectedRevision: 4, operation: "save_card",
      changes: {
        upserts: [{
          entityType: "card", entityId: "card-a", parentType: "microsequence",
          parentId: "micro-a", position: 1, version: 1,
          content: {
            title: "Card", resource: "composite",
            blocks: [{ id: "paragraph-a", kind: "paragraph", text: "Reparado" }]
          }
        }, {
          entityType: "card", entityId: "card-b", parentType: "microsequence",
          parentId: "micro-a", position: 2,
          content: { title: "Card B", resource: "paragraph", text: "Extra" }
        }], deletes: []
      },
      summary: {
        created: 1, updated: 1, deleted: 0,
        operationFamily: "content",
        targetPaths: [cardAPath, cardBPath], targetPathsTruncated: false,
        changedCardPaths: [cardAPath, cardBPath], changedCardPathsTruncated: false,
        cardShellChangedPaths: [cardBPath], cardShellChangedPathsTruncated: false,
        resourceTargets: [{ cardPath: cardAPath, targetId: "body:paragraph-a" }],
        resourceTargetsTruncated: false
      }
    };
    await assert.rejects(commitChanges(database, {
      ...mixed,
      requestId: "changes:repair:truncated",
      payloadHash: hash("0"),
      changes: { upserts: [mixed.changes.upserts[0]], deletes: [] },
      summary: {
        ...mixed.summary,
        created: 0, targetPaths: [cardAPath], changedCardPaths: [cardAPath],
        cardShellChangedPaths: [], resourceTargetsTruncated: true
      }
    }), (error) => error.code === "42501");
    await assert.rejects(commitChanges(database, mixed),
      (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 4);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card-b'
    `, [WORKSPACE_A]), 0);
    assert.equal(await scalar(database, `
      select version::integer value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card-a'
    `, [WORKSPACE_A]), 1);
    assert.deepEqual(await scalar(database, `
      select jsonb_build_object(
        'status',status,'correctionRequestId',correction_request_id,
        'resultingRevision',resulting_revision,
        'pendingCorrectionRequestId',pending_correction_request_id,
        'pendingRevision',pending_revision
      ) value
      from private.authoring_workspace_observations where id=$1
    `, [finding.findingId]), {
      status: "approved", correctionRequestId: null, resultingRevision: null,
      pendingCorrectionRequestId: null, pendingRevision: null
    });

    const repaired = await commitChanges(database, {
      ...mixed,
      requestId: "changes:repair:resource",
      payloadHash: hash("5"),
      changes: { upserts: [mixed.changes.upserts[0]], deletes: [] },
      summary: {
        created: 0, updated: 1, deleted: 0,
        operationFamily: "content",
        changedCardPaths: [cardAPath], targetPaths: [cardAPath],
        resourceTargets: [{ cardPath: cardAPath, targetId: "body:paragraph-a" }]
      }
    });
    assert.equal(repaired.revision, 5);
    assert.equal("autoLinkedFindingCount" in repaired.change, false);
    assert.deepEqual(await scalar(database, `
      select jsonb_build_object(
        'status',status,'correctionRequestId',correction_request_id,
        'resultingRevision',resulting_revision,
        'pendingCorrectionRequestId',pending_correction_request_id,
        'pendingRevision',pending_revision
      ) value
      from private.authoring_workspace_observations where id=$1
    `, [finding.findingId]), {
      status: "approved",
      correctionRequestId: null,
      resultingRevision: null,
      pendingCorrectionRequestId: "changes:repair:resource",
      pendingRevision: 5
    });
    const resumedRepair = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.deepEqual(
      Object.fromEntries(Object.entries(
        resumedRepair.activeFindings.find(({ findingId }) =>
          findingId === finding.findingId)
      ).filter(([key]) => [
        "status", "pendingCorrectionRequestId", "pendingRevision"
      ].includes(key))),
      {
        status: "approved",
        pendingCorrectionRequestId: "changes:repair:resource",
        pendingRevision: 5
      }
    );

    await updateContinuity(database, {
      requestId: "continuity:mandate:audit",
      payloadHash: hash("6"), expectedRevision: 5,
      operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: { id: "audit:course", kind: "audit" }
      }
    });
    await assert.rejects(commitChanges(database, {
      requestId: "changes:audit:blocked",
      payloadHash: hash("7"), expectedRevision: 6,
      operation: "save_card",
      changes: {
        upserts: [{
          ...mixed.changes.upserts[0], version: 2,
          content: { title: "Não autorizado" }
        }], deletes: []
      },
      summary: { created: 0, updated: 1, deleted: 0 }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 6);

    await updateContinuity(database, {
      requestId: "continuity:mandate:restructure",
      payloadHash: hash("8"), expectedRevision: 6,
      operation: "set_mandate",
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte 1", microsequenceIds: ["m01"] }],
        decisions: [],
        mandate: { id: "restructure:p1", kind: "restructure", targetPartId: "p1" }
      }
    });
    await assert.rejects(commitChanges(database, {
      requestId: "changes:restructure:outside",
      payloadHash: hash("9"), expectedRevision: 7,
      operation: "split_microsequence",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "m02", parentType: "lesson",
          parentId: "lesson-a", position: 2, version: 1,
          content: { title: "M2" }
        }, {
          entityType: "microsequence", entityId: "m02b", parentType: "lesson",
          parentId: "lesson-a", position: 3, content: { title: "M2B" }
        }], deletes: []
      },
      summary: {
        created: 1, updated: 1, deleted: 0,
        targetPaths: [
          ["course-a", "module-a", "lesson-a", "m02"],
          ["course-a", "module-a", "lesson-a", "m02b"]
        ], targetPathsTruncated: false,
        continuityRemap: { kind: "split", sourceId: "m02", newId: "m02b" }
      }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 7);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_requests
      where owner_id=$1 and request_id='changes:restructure:outside'
    `, [ACTOR]), 0);
  } finally {
    await database.close();
  }
});

test("commit registra handoff pendente apenas nos achados efetivamente tocados", async () => {
  const database = await setupDatabase();
  try {
    const cardPath = ["course-a", "module-a", "lesson-a", "micro-a", "card-a"];
    const cardFinding = await manageFinding(database, {
      requestId: "finding:auto:card",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "card", entityPath: cardPath,
        body: "Revisar o card.", category: "accuracy", severity: "medium",
        proposedRepair: "Corrigir o título."
      }
    });
    await manageFinding(database, {
      requestId: "finding:auto:card:approve",
      payloadHash: hash("2"), expectedRevision: 2, operation: "decide",
      payload: { findingId: cardFinding.findingId, decision: "approve" }
    });
    const otherFinding = await manageFinding(database, {
      requestId: "finding:auto:course-b",
      payloadHash: hash("3"), expectedRevision: 3, operation: "create",
      payload: {
        entityType: "course", entityPath: ["course-b"],
        body: "Revisar o outro curso.", category: "structure", severity: "low",
        proposedRepair: "Corrigir seus metadados."
      }
    });
    await manageFinding(database, {
      requestId: "finding:auto:course-b:approve",
      payloadHash: hash("4"), expectedRevision: 4, operation: "decide",
      payload: { findingId: otherFinding.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:auto:repair",
      payloadHash: hash("5"), expectedRevision: 5, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:auto", kind: "repair_findings",
          findingIds: [cardFinding.findingId, otherFinding.findingId]
        }
      }
    });
    const commit = {
      requestId: "changes:auto:card",
      payloadHash: hash("6"), expectedRevision: 6, operation: "save_card",
      changes: {
        upserts: [{
          entityType: "card", entityId: "card-a", parentType: "microsequence",
          parentId: "micro-a", position: 1, version: 1,
          content: {
            title: "Card reparado", resource: "composite", exercise: "none",
            blocks: [{ id: "paragraph-a", kind: "paragraph", text: "A" }],
            after: "", afterBlocks: [{
              id: "support-a", kind: "paragraph", text: "B"
            }]
          }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0, operationFamily: "content",
        targetPaths: [cardPath], targetPathsTruncated: false,
        changedCardPaths: [cardPath], changedCardPathsTruncated: false,
        cardShellChangedPaths: [cardPath], cardShellChangedPathsTruncated: false,
        resourceTargets: [], resourceTargetsTruncated: false
      }
    };
    const committed = await commitChanges(database, commit);
    assert.equal(committed.revision, 7);
    assert.deepEqual(await scalar(database, `
      select jsonb_object_agg(id::text,jsonb_build_object(
        'status',status,'pendingCorrectionRequestId',pending_correction_request_id,
        'pendingRevision',pending_revision
      )) value
      from private.authoring_workspace_observations where id in ($1,$2)
    `, [cardFinding.findingId, otherFinding.findingId]), {
      [cardFinding.findingId]: {
        status: "approved", pendingCorrectionRequestId: "changes:auto:card",
        pendingRevision: 7
      },
      [otherFinding.findingId]: {
        status: "approved", pendingCorrectionRequestId: null,
        pendingRevision: null
      }
    });
    const replay = await commitChanges(database, commit);
    assert.equal(replay.idempotent, true);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_events
      where workspace_id=$1 and revision=7
    `, [WORKSPACE_A]), 1);

    const second = await commitChanges(database, {
      requestId: "changes:auto:course-b",
      payloadHash: hash("7"), expectedRevision: 7,
      operation: "update_metadata",
      changes: {
        upserts: [{
          entityType: "course", entityId: "course-b", parentType: "project",
          parentId: "project", position: 1, version: 1,
          content: { title: "Curso B revisto" }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0,
        operationFamily: "structure", targetPaths: [["course-b"]]
      }
    });
    assert.equal(second.revision, 8);
    assert.deepEqual(await scalar(database, `
      select jsonb_object_agg(id::text,jsonb_build_object(
        'status',status,'pendingCorrectionRequestId',pending_correction_request_id,
        'pendingRevision',pending_revision
      )) value
      from private.authoring_workspace_observations where id in ($1,$2)
    `, [cardFinding.findingId, otherFinding.findingId]), {
      [cardFinding.findingId]: {
        status: "approved", pendingCorrectionRequestId: "changes:auto:card",
        pendingRevision: 7
      },
      [otherFinding.findingId]: {
        status: "approved", pendingCorrectionRequestId: "changes:auto:course-b",
        pendingRevision: 8
      }
    });
  } finally {
    await database.close();
  }
});

test("handoff pendente sobrevive à queda e confirma correção sem receipt expirado", async () => {
  const database = await setupDatabase();
  try {
    const microPath = ["course-a", "module-a", "lesson-a", "micro-a"];
    const cardAPath = [...microPath, "card-a"];
    const cardBPath = [...microPath, "card-b"];
    const finding = await manageFinding(database, {
      requestId: "finding:pending:micro",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "microsequence", entityPath: microPath,
        body: "Revisar a microssequência inteira.", category: "accuracy",
        severity: "high", proposedRepair: "Corrigir todos os cards necessários."
      }
    });
    await manageFinding(database, {
      requestId: "finding:pending:approve",
      payloadHash: hash("2"), expectedRevision: 2, operation: "decide",
      payload: { findingId: finding.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:pending:mandate",
      payloadHash: hash("3"), expectedRevision: 3, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:pending:micro", kind: "repair_findings",
          findingIds: [finding.findingId]
        }
      }
    });
    function cardCommit({ requestId, payloadHash, expectedRevision, cardId, path }) {
      return commitChanges(database, {
        requestId, payloadHash, expectedRevision, operation: "save_card",
        changes: {
          upserts: [{
            entityType: "card", entityId: cardId, parentType: "microsequence",
            parentId: "micro-a", position: cardId === "card-a" ? 1 : 2,
            version: 1,
            content: { title: `Card ${cardId}`, resource: "paragraph", text: "Revisto" }
          }],
          deletes: []
        },
        summary: {
          created: cardId === "card-a" ? 0 : 1,
          updated: cardId === "card-a" ? 1 : 0,
          deleted: 0, operationFamily: "content",
          targetPaths: [path], targetPathsTruncated: false,
          changedCardPaths: [path], changedCardPathsTruncated: false,
          cardShellChangedPaths: [path], cardShellChangedPathsTruncated: false,
          resourceTargets: [], resourceTargetsTruncated: false
        }
      });
    }
    const first = await cardCommit({
      requestId: "changes:pending:micro:a", payloadHash: hash("4"),
      expectedRevision: 4, cardId: "card-a", path: cardAPath
    });
    assert.equal(first.revision, 5);
    assert.deepEqual(await scalar(database, `
      select jsonb_build_object(
        'status',status,'pendingCorrectionRequestId',pending_correction_request_id,
        'pendingRevision',pending_revision
      ) value from private.authoring_workspace_observations where id=$1
    `, [finding.findingId]), {
      status: "approved",
      pendingCorrectionRequestId: "changes:pending:micro:a",
      pendingRevision: 5
    });
    const resumed = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    const resumedFinding = resumed.activeFindings.find(
      ({ findingId }) => findingId === finding.findingId
    );
    assert.equal(resumedFinding.status, "approved");
    assert.equal(
      resumedFinding.pendingCorrectionRequestId,
      "changes:pending:micro:a"
    );
    assert.equal(resumedFinding.pendingRevision, 5);
    const listed = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,null,array['audit_finding'],array['approved']
      ) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(listed.items[0].pendingCorrectionRequestId, "changes:pending:micro:a");
    assert.equal(listed.items[0].pendingRevision, 5);
    await assert.rejects(commitChanges(database, {
      requestId: "changes:pending:outside", payloadHash: hash("0"),
      expectedRevision: 5, operation: "update_metadata",
      changes: {
        upserts: [{
          entityType: "course", entityId: "course-b", parentType: "project",
          parentId: "project", position: 1, version: 1,
          content: { title: "Fora do recorte" }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0, operationFamily: "structure",
        targetPaths: [["course-b"]], targetPathsTruncated: false,
        changedCardPaths: [], changedCardPathsTruncated: false,
        cardShellChangedPaths: [], cardShellChangedPathsTruncated: false,
        resourceTargets: [], resourceTargetsTruncated: false
      }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select pending_correction_request_id value
      from private.authoring_workspace_observations where id=$1
    `, [finding.findingId]), "changes:pending:micro:a");

    const secondInput = {
      requestId: "changes:pending:micro:b", payloadHash: hash("5"),
      expectedRevision: 5, cardId: "card-b", path: cardBPath
    };
    const second = await cardCommit(secondInput);
    assert.equal(second.revision, 6);
    assert.equal((await cardCommit(secondInput)).idempotent, true);
    assert.deepEqual(await scalar(database, `
      select jsonb_build_object(
        'status',status,'pendingCorrectionRequestId',pending_correction_request_id,
        'pendingRevision',pending_revision
      ) value from private.authoring_workspace_observations where id=$1
    `, [finding.findingId]), {
      status: "approved",
      pendingCorrectionRequestId: "changes:pending:micro:b",
      pendingRevision: 6
    });

    await database.query(`
      delete from private.authoring_workspace_events
      where workspace_id=$1 and revision=6
    `, [WORKSPACE_A]);
    await database.query(`
      delete from private.authoring_workspace_requests
      where owner_id=$1 and request_id='changes:pending:micro:b'
    `, [ACTOR]);
    const linkInput = {
      requestId: "finding:pending:link", payloadHash: hash("6"),
      expectedRevision: 6, operation: "link_correction",
      payload: {
        findingId: finding.findingId,
        correctionRequestId: "changes:pending:micro:b"
      }
    };
    const linked = await manageFinding(database, linkInput);
    assert.equal(linked.revision, 7);
    assert.equal((await manageFinding(database, linkInput)).idempotent, true);
    assert.deepEqual(await scalar(database, `
      select jsonb_build_object(
        'status',status,'correctionRequestId',correction_request_id,
        'resultingRevision',resulting_revision,
        'pendingCorrectionRequestId',pending_correction_request_id,
        'pendingRevision',pending_revision
      ) value from private.authoring_workspace_observations where id=$1
    `, [finding.findingId]), {
      status: "repaired",
      correctionRequestId: "changes:pending:micro:b",
      resultingRevision: 6,
      pendingCorrectionRequestId: null,
      pendingRevision: null
    });
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_events
      where workspace_id=$1 and revision=7 and operation='link_finding_correction'
    `, [WORKSPACE_A]), 1);
    await assert.rejects(database.query(`
      update private.authoring_workspace_observations
      set status='open', pending_correction_request_id='changes:invalid:pending',
          pending_revision=7
      where id=$1
    `, [finding.findingId]), (error) => error.code === "23514");
  } finally {
    await database.close();
  }
});

test("finding de card não autoriza mutação em microssequência ancestral", async () => {
  const database = await setupDatabase();
  try {
    const finding = await manageFinding(database, {
      requestId: "finding:direction:card",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "Corrigir só o card.", category: "accuracy", severity: "medium",
        proposedRepair: "Reescrever o card."
      }
    });
    await manageFinding(database, {
      requestId: "finding:direction:approve",
      payloadHash: hash("2"), expectedRevision: 2, operation: "decide",
      payload: { findingId: finding.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:direction:repair",
      payloadHash: hash("3"), expectedRevision: 3, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:card-only", kind: "repair_findings",
          findingIds: [finding.findingId]
        }
      }
    });
    await assert.rejects(commitChanges(database, {
      requestId: "changes:direction:micro",
      payloadHash: hash("4"), expectedRevision: 4,
      operation: "update_metadata",
      changes: {
        upserts: [{
          entityType: "microsequence", entityId: "micro-a",
          parentType: "lesson", parentId: "lesson-a", position: 0, version: 1,
          content: { title: "Micro alterada", status: "ready" }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0,
        operationFamily: "structure",
        targetPaths: [["course-a", "module-a", "lesson-a", "micro-a"]],
        targetPathsTruncated: false,
        changedCardPaths: [], changedCardPathsTruncated: false,
        cardShellChangedPaths: [], cardShellChangedPathsTruncated: false,
        resourceTargets: [], resourceTargetsTruncated: false
      }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 4);
    assert.equal(await scalar(database, `
      select content->>'title' value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='microsequence' and entity_id='micro-a'
    `, [WORKSPACE_A]), "Micro");
    const cardPath = ["course-a", "module-a", "lesson-a", "micro-a", "card-a"];
    const shellRepair = await commitChanges(database, {
      requestId: "changes:direction:card-shell",
      payloadHash: hash("5"), expectedRevision: 4,
      operation: "save_card",
      changes: {
        upserts: [{
          entityType: "card", entityId: "card-a", parentType: "microsequence",
          parentId: "micro-a", position: 1, version: 1,
          content: {
            title: "Card revisto", resource: "composite", exercise: "none",
            blocks: [{ id: "paragraph-a", kind: "paragraph", text: "A" }],
            after: "", afterBlocks: [{
              id: "support-a", kind: "paragraph", text: "B"
            }]
          }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0,
        operationFamily: "content", targetPaths: [cardPath],
        changedCardPaths: [cardPath], cardShellChangedPaths: [cardPath]
      }
    });
    assert.equal(shellRepair.revision, 5);
  } finally {
    await database.close();
  }
});

test("reparo estrutural autoriza origem e destino sem liberar move entre irmãos", async () => {
  const database = await setupDatabase();
  try {
    const modulePath = ["course-a", "module-a"];
    const finding = await manageFinding(database, {
      requestId: "finding:move:module-a",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "module", entityPath: modulePath,
        body: "Revisar a estrutura do módulo.", category: "structure",
        severity: "medium", proposedRepair: "Ajustar somente este módulo."
      }
    });
    await manageFinding(database, {
      requestId: "finding:move:approve",
      payloadHash: hash("2"), expectedRevision: 2, operation: "decide",
      payload: { findingId: finding.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:move:repair",
      payloadHash: hash("3"), expectedRevision: 3, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:module-a", kind: "repair_findings",
          findingIds: [finding.findingId]
        }
      }
    });
    const metadata = await commitChanges(database, {
      requestId: "changes:move:metadata",
      payloadHash: hash("4"), expectedRevision: 4,
      operation: "update_metadata",
      changes: {
        upserts: [{
          entityType: "module", entityId: "module-a", parentType: "course",
          parentId: "course-a", position: 0, version: 1,
          content: { title: "Módulo revisto" }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0,
        operationFamily: "structure", targetPaths: [modulePath]
      }
    });
    assert.equal(metadata.revision, 5);

    await assert.rejects(commitChanges(database, {
      requestId: "changes:move:escape",
      payloadHash: hash("5"), expectedRevision: 5,
      operation: "move_entity",
      changes: {
        upserts: [{
          entityType: "module", entityId: "module-a", parentType: "course",
          parentId: "course-b", position: 0, version: 2,
          content: { title: "Módulo revisto" }
        }], deletes: []
      },
      summary: {
        created: 0, updated: 1, deleted: 0,
        operationFamily: "structure",
        targetPaths: [modulePath, ["course-b", "module-a"]]
      }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select parent_id value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='module' and entity_id='module-a'
    `, [WORKSPACE_A]), "course-a");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 5);
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_requests
      where owner_id=$1 and request_id='changes:move:escape'
    `, [ACTOR]), 0);
  } finally {
    await database.close();
  }
});

test("copy autoriza somente o destino novo e não exige a origem somente leitura", async () => {
  const database = await setupDatabase();
  try {
    const finding = await manageFinding(database, {
      requestId: "finding:copy:course-b",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "course", entityPath: ["course-b"],
        body: "Completar o curso B.", category: "structure", severity: "medium",
        proposedRepair: "Copiar o módulo pertinente para o curso B."
      }
    });
    await manageFinding(database, {
      requestId: "finding:copy:approve",
      payloadHash: hash("2"), expectedRevision: 2, operation: "decide",
      payload: { findingId: finding.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:copy:repair",
      payloadHash: hash("3"), expectedRevision: 3, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:copy:course-b", kind: "repair_findings",
          findingIds: [finding.findingId]
        }
      }
    });
    const destination = ["course-b", "module-copy"];
    const copied = await commitChanges(database, {
      requestId: "changes:copy:destination",
      payloadHash: hash("4"), expectedRevision: 4, operation: "copy_entity",
      changes: {
        upserts: [{
          entityType: "module", entityId: "module-copy", parentType: "course",
          parentId: "course-b", position: 0,
          content: { title: "Cópia do módulo A" }
        }],
        deletes: []
      },
      summary: {
        created: 1, updated: 0, deleted: 0, operationFamily: "structure",
        targetPaths: [destination], targetPathsTruncated: false,
        changedCardPaths: [], changedCardPathsTruncated: false,
        cardShellChangedPaths: [], cardShellChangedPathsTruncated: false,
        resourceTargets: [], resourceTargetsTruncated: false
      }
    });
    assert.equal(copied.revision, 5);
    assert.equal(await scalar(database, `
      select pending_correction_request_id value
      from private.authoring_workspace_observations where id=$1
    `, [finding.findingId]), "changes:copy:destination");
    await assert.rejects(commitChanges(database, {
      requestId: "changes:copy:outside",
      payloadHash: hash("5"), expectedRevision: 5, operation: "copy_entity",
      changes: {
        upserts: [{
          entityType: "module", entityId: "module-copy-outside",
          parentType: "course", parentId: "course-a", position: 1,
          content: { title: "Destino fora do achado" }
        }],
        deletes: []
      },
      summary: {
        created: 1, updated: 0, deleted: 0, operationFamily: "structure",
        targetPaths: [["course-a", "module-copy-outside"]],
        targetPathsTruncated: false,
        changedCardPaths: [], changedCardPathsTruncated: false,
        cardShellChangedPaths: [], cardShellChangedPathsTruncated: false,
        resourceTargets: [], resourceTargetsTruncated: false
      }
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_entities
      where workspace_id=$1 and entity_id='module-copy-outside'
    `, [WORKSPACE_A]), 0);
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 5);
  } finally {
    await database.close();
  }
});

test("demote exige cobertura de origem e destino e mantém ambos no handoff", async () => {
  const database = await setupDatabase();
  try {
    const source = await manageFinding(database, {
      requestId: "finding:demote:source", payloadHash: hash("1"),
      expectedRevision: 1, operation: "create",
      payload: {
        entityType: "course", entityPath: ["course-b"],
        body: "Reestruturar o curso B.", category: "structure", severity: "high",
        proposedRepair: "Convertê-lo em módulo."
      }
    });
    const destination = await manageFinding(database, {
      requestId: "finding:demote:destination", payloadHash: hash("2"),
      expectedRevision: 2, operation: "create",
      payload: {
        entityType: "course", entityPath: ["course-a"],
        body: "Receber o novo módulo.", category: "structure", severity: "medium",
        proposedRepair: "Incorporar o conteúdo convertido."
      }
    });
    await manageFinding(database, {
      requestId: "finding:demote:approve-source", payloadHash: hash("3"),
      expectedRevision: 3, operation: "decide",
      payload: { findingId: source.findingId, decision: "approve" }
    });
    await manageFinding(database, {
      requestId: "finding:demote:approve-destination", payloadHash: hash("4"),
      expectedRevision: 4, operation: "decide",
      payload: { findingId: destination.findingId, decision: "approve" }
    });
    const repairState = (findingIds) => ({
      version: 1, parts: [], decisions: [],
      mandate: { id: "repair:demote", kind: "repair_findings", findingIds }
    });
    await updateContinuity(database, {
      requestId: "continuity:demote:source-only", payloadHash: hash("5"),
      expectedRevision: 5, operation: "set_mandate",
      state: repairState([source.findingId])
    });
    const sourcePath = ["course-b"];
    const destinationPath = ["course-a", "module-from-b"];
    const change = {
      requestId: "changes:demote:both", payloadHash: hash("7"),
      expectedRevision: 7, operation: "demote_course",
      changes: {
        upserts: [{
          entityType: "module", entityId: "module-from-b",
          parentType: "course", parentId: "course-a", position: 1,
          content: { title: "Curso B convertido" }
        }],
        deletes: [{ entityType: "course", entityId: "course-b", version: 1 }]
      },
      summary: {
        created: 1, updated: 0, deleted: 1, operationFamily: "structure",
        targetPaths: [sourcePath, destinationPath], targetPathsTruncated: false,
        changedCardPaths: [], changedCardPathsTruncated: false,
        cardShellChangedPaths: [], cardShellChangedPathsTruncated: false,
        resourceTargets: [], resourceTargetsTruncated: false
      }
    };
    await assert.rejects(commitChanges(database, {
      ...change,
      requestId: "changes:demote:source-only", payloadHash: hash("6"),
      expectedRevision: 6
    }), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select count(*)::integer value from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='course' and entity_id='course-b'
    `, [WORKSPACE_A]), 1);
    await updateContinuity(database, {
      requestId: "continuity:demote:both", payloadHash: hash("6"),
      expectedRevision: 6, operation: "set_mandate",
      state: repairState([source.findingId, destination.findingId])
    });
    const committed = await commitChanges(database, change);
    assert.equal(committed.revision, 8);
    assert.deepEqual(await scalar(database, `
      select jsonb_object_agg(id::text,jsonb_build_object(
        'status',status,'requestId',pending_correction_request_id,
        'revision',pending_revision
      )) value from private.authoring_workspace_observations where id in ($1,$2)
    `, [source.findingId, destination.findingId]), {
      [source.findingId]: {
        status: "approved", requestId: "changes:demote:both", revision: 8
      },
      [destination.findingId]: {
        status: "approved", requestId: "changes:demote:both", revision: 8
      }
    });
    const firstLink = await manageFinding(database, {
      requestId: "finding:demote:link-source", payloadHash: hash("8"),
      expectedRevision: 8, operation: "link_correction",
      payload: {
        findingId: source.findingId,
        correctionRequestId: "changes:demote:both"
      }
    });
    assert.equal(firstLink.status, "repaired");
    assert.deepEqual(await scalar(database, `
      select authoring_state#>'{mandate,findingIds}' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), [destination.findingId]);
    const secondLink = await manageFinding(database, {
      requestId: "finding:demote:link-destination", payloadHash: hash("9"),
      expectedRevision: 9, operation: "link_correction",
      payload: {
        findingId: destination.findingId,
        correctionRequestId: "changes:demote:both"
      }
    });
    assert.equal(secondLink.status, "repaired");
    assert.equal(await scalar(database, `
      select authoring_state->'mandate' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), null);
  } finally {
    await database.close();
  }
});

test("promote inclui modulePath de origem e novo curso de destino no gate", async () => {
  const database = await setupDatabase();
  try {
    const source = await manageFinding(database, {
      requestId: "finding:promote:source", payloadHash: hash("1"),
      expectedRevision: 1, operation: "create",
      payload: {
        entityType: "module", entityPath: ["course-a", "module-a"],
        body: "Elevar o módulo.", category: "structure", severity: "medium",
        proposedRepair: "Transformá-lo em curso."
      }
    });
    const destination = await manageFinding(database, {
      requestId: "finding:promote:workspace", payloadHash: hash("2"),
      expectedRevision: 2, operation: "create",
      payload: {
        entityType: "workspace", entityPath: [],
        body: "Autorizar novo curso raiz.", category: "structure", severity: "medium",
        proposedRepair: "Criar o destino da promoção."
      }
    });
    for (const [index, finding] of [source, destination].entries()) {
      await manageFinding(database, {
        requestId: `finding:promote:approve:${index}`,
        payloadHash: hash(String(index + 3)), expectedRevision: index + 3,
        operation: "decide",
        payload: { findingId: finding.findingId, decision: "approve" }
      });
    }
    const repair = (findingIds) => ({
      version: 1, parts: [], decisions: [],
      mandate: { id: "repair:promote", kind: "repair_findings", findingIds }
    });
    await updateContinuity(database, {
      requestId: "continuity:promote:source", payloadHash: hash("5"),
      expectedRevision: 5, operation: "set_mandate",
      state: repair([source.findingId])
    });
    const sourcePath = ["course-a", "module-a"];
    const destinationPath = ["course-promoted"];
    const change = {
      operation: "promote_module",
      changes: {
        upserts: [{
          entityType: "course", entityId: "course-promoted",
          parentType: "project", parentId: "project", position: 2,
          content: { title: "Módulo promovido" }
        }, {
          entityType: "module", entityId: "module-a", parentType: "course",
          parentId: "course-promoted", position: 0, version: 1,
          content: { title: "Módulo" }
        }],
        deletes: []
      },
      summary: {
        created: 1, updated: 1, deleted: 0, operationFamily: "structure",
        targetPaths: [sourcePath, destinationPath], targetPathsTruncated: false,
        changedCardPaths: [], changedCardPathsTruncated: false,
        cardShellChangedPaths: [], cardShellChangedPathsTruncated: false,
        resourceTargets: [], resourceTargetsTruncated: false
      }
    };
    await assert.rejects(commitChanges(database, {
      ...change, requestId: "changes:promote:source-only",
      payloadHash: hash("6"), expectedRevision: 6
    }), (error) => error.code === "42501");
    await updateContinuity(database, {
      requestId: "continuity:promote:both", payloadHash: hash("6"),
      expectedRevision: 6, operation: "set_mandate",
      state: repair([source.findingId, destination.findingId])
    });
    const committed = await commitChanges(database, {
      ...change, requestId: "changes:promote:both",
      payloadHash: hash("7"), expectedRevision: 7
    });
    assert.equal(committed.revision, 8);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_observations
      where id in ($1,$2) and status='approved'
        and pending_correction_request_id='changes:promote:both'
        and pending_revision=8
    `, [source.findingId, destination.findingId]), 2);
  } finally {
    await database.close();
  }
});

test("referências antigas ausentes permanecem retomáveis sem liberar referências novas", async () => {
  const database = await setupDatabase();
  try {
    const state = {
      version: 1,
      parts: [{ id: "p1", title: "Parte", microsequenceIds: ["m01"] }],
      decisions: [{
        id: "d1", summary: "Conservar a decisão.",
        entityType: "microsequence", entityId: "m01"
      }],
      mandate: null
    };
    await updateContinuity(database, {
      requestId: "continuity:stale:init",
      payloadHash: hash("1"), expectedRevision: 1,
      operation: "record_approved_plan", state
    });
    await commitChanges(database, {
      requestId: "changes:delete:m01",
      payloadHash: hash("2"), expectedRevision: 2,
      operation: "delete_entity",
      changes: {
        upserts: [],
        deletes: [{ entityType: "microsequence", entityId: "m01", version: 1 }]
      },
      summary: {
        created: 0, updated: 0, deleted: 1,
        targetPath: ["course-a", "module-a", "lesson-a", "m01"]
      }
    });
    const preserved = await updateContinuity(database, {
      requestId: "continuity:stale:preserve",
      payloadHash: hash("3"), expectedRevision: 3,
      operation: "record_decision",
      state: {
        ...state,
        decisions: [{ ...state.decisions[0], summary: "Decisão ainda necessária." }]
      }
    });
    assert.equal(preserved.revision, 4);
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:stale:new",
      payloadHash: hash("4"), expectedRevision: 4,
      state: {
        ...state,
        parts: [{ id: "p1", title: "Parte", microsequenceIds: ["m01", "missing"] }]
      }
    }), (error) => error.code === "P0002");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 4);
  } finally {
    await database.close();
  }
});

test("estado respeita 48 KiB lógicos e limites fechados do contrato", async () => {
  const database = await setupDatabase();
  try {
    const oversized = {
      version: 1,
      parts: [],
      decisions: [{ id: "d1", summary: "x".repeat(66_000) }],
      mandate: null
    };
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:large:0001",
      payloadHash: hash("d"),
      expectedRevision: 1,
      state: oversized
    }), (error) => error.code === "22023");

    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:parts-limit:1",
      payloadHash: hash("5"),
      expectedRevision: 1,
      operation: "record_approved_plan",
      state: {
        version: 1,
        parts: Array.from({ length: 65 }, (_, index) => ({
          id: `p${index}`, title: `Parte ${index}`,
          microsequenceIds: [`micro-${index}`]
        })),
        decisions: [],
        mandate: null
      }
    }), (error) => error.code === "22023");
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:decisions-limit:1",
      payloadHash: hash("6"),
      expectedRevision: 1,
      operation: "record_approved_plan",
      state: {
        version: 1,
        parts: [],
        decisions: Array.from({ length: 129 }, (_, index) => ({
          id: `d${index}`, summary: `Decisão ${index}`
        })),
        mandate: null
      }
    }), (error) => error.code === "22023");
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:findings-limit:1",
      payloadHash: hash("7"),
      expectedRevision: 1,
      operation: "set_mandate",
      state: {
        version: 1,
        parts: [],
        decisions: [],
        mandate: {
          id: "repair:limit",
          kind: "repair_findings",
          findingIds: Array.from({ length: 51 }, (_, index) =>
            `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
          )
        }
      }
    }), (error) => error.code === "22023");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 1);

    const tooManyMicrosequences = {
      version: 1,
      parts: [{
        id: "p1",
        title: "Parte",
        microsequenceIds: Array.from({ length: 501 }, (_, index) => `m-${index}`)
      }],
      decisions: [],
      mandate: null
    };
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:many:0001",
      payloadHash: hash("e"),
      expectedRevision: 1,
      state: tooManyMicrosequences
    }), (error) => error.code === "22023");

    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:empty-part:0001",
      payloadHash: hash("f"),
      expectedRevision: 1,
      operation: "define_part",
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte", microsequenceIds: [] }],
        decisions: [],
        mandate: null
      }
    }), (error) => error.code === "22023");

    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:missing-micro:1",
      payloadHash: hash("2"),
      expectedRevision: 1,
      operation: "define_part",
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte", microsequenceIds: ["missing"] }],
        decisions: [],
        mandate: null
      }
    }), (error) => error.code === "P0002");

    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:missing-decision:1",
      payloadHash: hash("3"),
      expectedRevision: 1,
      operation: "record_decision",
      state: {
        version: 1,
        parts: [],
        decisions: [{
          id: "d1", summary: "Decisão inválida.",
          entityType: "card", entityId: "missing"
        }],
        mandate: null
      }
    }), (error) => error.code === "P0002");

    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:missing-part:1",
      payloadHash: hash("4"),
      expectedRevision: 1,
      operation: "set_mandate",
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte", microsequenceIds: ["m01"] }],
        decisions: [],
        mandate: { id: "m1", kind: "build_part", targetPartId: "missing" }
      }
    }), (error) => error.code === "22023");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 1);

    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:decision:0001",
      payloadHash: hash("0"),
      expectedRevision: 1,
      operation: "record_decision",
      state: {
        version: 1,
        parts: [],
        decisions: [{ id: "d1", summary: "x".repeat(1_001) }],
        mandate: null
      }
    }), (error) => error.code === "22023");

    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:operation:0001",
      payloadHash: hash("1"),
      expectedRevision: 1,
      operation: "set_state",
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte", microsequenceIds: ["m01"] }],
        decisions: [],
        mandate: null
      }
    }), (error) => error.code === "22023");
    const boundaryState = {
      version: 1,
      parts: [{ id: "p1", title: "Parte", microsequenceIds: ["m01"] }],
      decisions: Array.from({ length: 113 }, (_, index) => ({
        id: `d${index}`, summary: "x".repeat(408)
      })),
      mandate: null
    };
    assert.equal(Buffer.byteLength(JSON.stringify(boundaryState)), 48 * 1_024);
    const boundary = await updateContinuity(database, {
      requestId: "continuity:boundary:0001",
      payloadHash: hash("9"),
      expectedRevision: 1,
      operation: "record_approved_plan",
      state: boundaryState
    });
    assert.equal(boundary.revision, 2);
  } finally {
    await database.close();
  }
});

test("responsável editorial global acessa continuidade sem membership local", async () => {
  const database = await setupDatabase();
  try {
    const initial = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [CATALOG_EDITOR, WORKSPACE_A]);
    assert.equal(initial.revision, 1);
    assert.deepEqual(initial.authoringState.parts, []);
    assert.equal(await scalar(database, `
      select private.require_educational_workspace_capability_v1(
        $2,$1,'read'
      ) value
    `, [CATALOG_EDITOR, WORKSPACE_A]), "admin");
    const projected = await scalar(database, `
      select public.get_authoring_workspace_v5(
        $1,$2,null,false
      ) value
    `, [CATALOG_EDITOR, WORKSPACE_A]);
    assert.equal(projected.role, "admin");
    const projectedList = await scalar(database, `
      select public.list_authoring_workspaces_v5(
        $1,50,null,null
      ) value
    `, [CATALOG_EDITOR]);
    assert.equal(
      projectedList.items.find(({ workspaceId }) =>
        workspaceId === WORKSPACE_A)?.role,
      "admin"
    );
    await assert.rejects(scalar(database, `
      select private.require_educational_workspace_capability_v1(
        $2,$1,'transfer'
      ) value
    `, [CATALOG_EDITOR, WORKSPACE_A]), (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'public.commit_authoring_workspace_changes_v5(uuid,uuid,text,text,bigint,text,jsonb,jsonb)',
        'EXECUTE'
      ) value
    `), true);
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'public.commit_authoring_workspace_changes_without_continuity_v1(uuid,uuid,text,text,bigint,text,jsonb,jsonb)',
        'EXECUTE'
      ) value
    `), false);
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'private.prune_authoring_workspace_terminal_findings_v1(uuid)',
        'EXECUTE'
      ) value
    `), false);
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'private.educational_workspace_effective_role_v1(uuid,uuid)',
        'EXECUTE'
      ) value
    `), false);
    const reviewerResume = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [REVIEWER, WORKSPACE_A]);
    assert.equal(reviewerResume.revision, 1);
    await assert.rejects(scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [LEARNER, WORKSPACE_A]), (error) => error.code === "42501");

    const updated = await updateContinuity(database, {
      actorId: CATALOG_EDITOR,
      requestId: "continuity:editor:plan",
      payloadHash: hash("5"),
      expectedRevision: 1,
      operation: "record_approved_plan",
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte 1", microsequenceIds: ["m01"] }],
        decisions: [{ id: "d1", summary: "Plano aprovado." }],
        mandate: { id: "m1", kind: "build_part", targetPartId: "p1" }
      }
    });
    assert.equal(updated.revision, 2);

    const finding = await manageFinding(database, {
      actorId: CATALOG_EDITOR,
      requestId: "finding:editor:create",
      payloadHash: hash("6"),
      expectedRevision: 2,
      operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "Revisar a precisão.",
        category: "accuracy",
        severity: "medium",
        proposedRepair: "Corrigir a formulação."
      }
    });
    assert.equal(finding.revision, 3);
    const listed = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,null,null,null
      ) value
    `, [CATALOG_EDITOR, WORKSPACE_A]);
    assert.equal(listed.items.length, 1);

    await assert.rejects(scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [OUTSIDER, WORKSPACE_A]), (error) => error.code === "P0002");
    await assert.rejects(updateContinuity(database, {
      actorId: OUTSIDER,
      requestId: "continuity:outsider:1",
      payloadHash: hash("7"),
      expectedRevision: 3,
      operation: "clear_mandate",
      state: {
        version: 1,
        parts: [{ id: "p1", title: "Parte 1", microsequenceIds: ["m01"] }],
        decisions: [{ id: "d1", summary: "Plano aprovado." }],
        mandate: null
      }
    }), (error) => error.code === "P0002");
    await assert.rejects(scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,null,null,null
      ) value
    `, [OUTSIDER, WORKSPACE_A]), (error) => error.code === "P0002");
    await assert.rejects(manageFinding(database, {
      actorId: OUTSIDER,
      requestId: "finding:outsider:create",
      payloadHash: hash("8"),
      expectedRevision: 3,
      operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "Tentativa sem acesso.",
        category: "accuracy",
        severity: "low",
        proposedRepair: "Nenhuma."
      }
    }), (error) => error.code === "P0002");
    assert.equal(await scalar(database, `
      select revision value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), 3);
  } finally {
    await database.close();
  }
});

test("finding percorre auditoria, decisão, correção confirmada e reauditoria", async () => {
  const database = await setupDatabase();
  try {
    await assert.rejects(manageFinding(database, {
      requestId: "finding:invalid-resource:1",
      payloadHash: hash("f"),
      expectedRevision: 1,
      operation: "create",
      payload: {
        entityType: "resource",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        resourceTargetId: "body:missing",
        body: "O exemplo está incompleto.",
        category: "coverage",
        severity: "high",
        proposedRepair: "Completar o exemplo."
      }
    }), (error) => error.code === "P0002");

    await assert.rejects(manageFinding(database, {
      requestId: "finding:large-summary:1",
      payloadHash: hash("a"),
      expectedRevision: 1,
      operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "x".repeat(1_001),
        category: "coverage",
        severity: "high",
        proposedRepair: "Reparar."
      }
    }), (error) => error.code === "22023");
    await assert.rejects(manageFinding(database, {
      requestId: "finding:large-repair:01",
      payloadHash: hash("b"),
      expectedRevision: 1,
      operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "Resumo.",
        category: "coverage",
        severity: "high",
        proposedRepair: "x".repeat(1_001)
      }
    }), (error) => error.code === "22023");

    const created = await manageFinding(database, {
      requestId: "finding:create:0001",
      payloadHash: hash("1"),
      expectedRevision: 1,
      operation: "create",
      payload: {
        entityType: "resource",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        resourceTargetId: "body:paragraph-a",
        body: "O exemplo está incompleto.",
        category: "coverage",
        severity: "high",
        proposedRepair: "Completar o exemplo."
      }
    });
    assert.equal(created.revision, 2);
    assert.equal(created.status, "open");
    const findingId = created.findingId;
    await assert.rejects(updateContinuity(database, {
      requestId: "continuity:premature-repair:1",
      payloadHash: hash("a"),
      expectedRevision: 2,
      operation: "set_mandate",
      state: {
        version: 1,
        parts: [],
        decisions: [],
        mandate: {
          id: "repair:premature",
          kind: "repair_findings",
          findingIds: [findingId]
        }
      }
    }), (error) => error.code === "23514");
    const secondCreated = await manageFinding(database, {
      requestId: "finding:create:0002",
      payloadHash: hash("6"),
      expectedRevision: 2,
      operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "A síntese precisa de reauditoria.",
        category: "accuracy",
        severity: "medium",
        proposedRepair: "Revisar a síntese."
      }
    });
    const secondFindingId = secondCreated.findingId;
    assert.equal(secondCreated.revision, 3);
    let finding = await scalar(database, `
      select jsonb_build_object(
        'auditRevision',audit_revision,'status',status
      ) value from private.authoring_workspace_observations where id=$1
    `, [findingId]);
    assert.deepEqual(finding, { auditRevision: 1, status: "open" });

    const decided = await manageFinding(database, {
      requestId: "finding:decide:0001",
      payloadHash: hash("2"),
      expectedRevision: 3,
      operation: "decide",
      payload: { findingId, decision: "approve" }
    });
    assert.equal(decided.status, "approved");
    assert.equal(decided.revision, 4);

    const secondDecided = await manageFinding(database, {
      requestId: "finding:decide:0002",
      payloadHash: hash("7"),
      expectedRevision: 4,
      operation: "decide",
      payload: { findingId: secondFindingId, decision: "approve" }
    });
    assert.equal(secondDecided.status, "approved");
    assert.equal(secondDecided.revision, 5);

    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($2,'correction:old:0001','save_card',$3,$1,
        jsonb_build_object(
          'workspaceId',$1::uuid,'revision',1,'idempotent',false,
          'change',jsonb_build_object(
            'operation','save_card','targetPath',
            jsonb_build_array('course-a','module-a','lesson-a','micro-a','card-a'),
            'targetPathsTruncated',false
          )
        ))
    `, [WORKSPACE_A, ACTOR, hash("5")]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id
      ) values($1,1,'save_card',jsonb_build_object(
        'operation','save_card','targetPath',
        jsonb_build_array('course-a','module-a','lesson-a','micro-a','card-a'),
        'targetPathsTruncated',false
      ),$2)
    `, [WORKSPACE_A, ACTOR]);
    await assert.rejects(manageFinding(database, {
      requestId: "finding:link:old:01",
      payloadHash: hash("6"),
      expectedRevision: 5,
      operation: "link_correction",
      payload: {
        findingId,
        correctionRequestId: "correction:old:0001"
      }
    }), (error) => error.code === "23514");

    const mandate = await updateContinuity(database, {
      requestId: "continuity:repair:0001",
      payloadHash: hash("8"),
      expectedRevision: 5,
      operation: "set_mandate",
      state: {
        version: 1,
        parts: [],
        decisions: [],
        mandate: {
          id: "repair:0001",
          kind: "repair_findings",
          findingIds: [findingId, secondFindingId],
          note: "Reparar os dois achados."
        }
      }
    });
    assert.equal(mandate.revision, 6);
    await assert.rejects(manageFinding(database, {
      requestId: "finding:link:old:02",
      payloadHash: hash("6"),
      expectedRevision: 6,
      operation: "link_correction",
      payload: {
        findingId,
        correctionRequestId: "correction:old:0001"
      }
    }), (error) => error.code === "P0002");

    await database.query(`
      update private.authoring_workspaces set revision=7,updated_at=now() where id=$1
    `, [WORKSPACE_A]);
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($2,'correction:card:0001','save_card',$3,$1,
        jsonb_build_object(
          'workspaceId',$1::uuid,'revision',7,'idempotent',false,
          'change',jsonb_build_object(
            'operation','save_card','targetPaths',jsonb_build_array(
              jsonb_build_array('course-a','module-a','lesson-a','micro-a','card-a')
            ),'targetPathsTruncated',false,
            'resourceTargetIds',jsonb_build_array('body:paragraph-a'),
            'changedCardPaths',jsonb_build_array(jsonb_build_array(
              'course-a','module-a','lesson-a','micro-a','card-a'
            )),'changedCardPathsTruncated',false,
            'resourceTargets',jsonb_build_array(jsonb_build_object(
              'cardPath',jsonb_build_array(
                'course-a','module-a','lesson-a','micro-a','card-a'
              ),'targetId','body:paragraph-a'
            )),'resourceTargetsTruncated',false
          )
        ))
    `, [WORKSPACE_A, ACTOR, hash("3")]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id
      ) values($1,7,'save_card',jsonb_build_object(
        'operation','save_card','targetPaths',jsonb_build_array(
          jsonb_build_array('course-a','module-a','lesson-a','micro-a','card-a')
        ),'targetPathsTruncated',false,
        'resourceTargetIds',jsonb_build_array('body:paragraph-a'),
        'changedCardPaths',jsonb_build_array(jsonb_build_array(
          'course-a','module-a','lesson-a','micro-a','card-a'
        )),'changedCardPathsTruncated',false,
        'resourceTargets',jsonb_build_array(jsonb_build_object(
          'cardPath',jsonb_build_array(
            'course-a','module-a','lesson-a','micro-a','card-a'
          ),'targetId','body:paragraph-a'
        )),'resourceTargetsTruncated',false
      ),$2)
    `, [WORKSPACE_A, ACTOR]);

    const linked = await manageFinding(database, {
      requestId: "finding:link:0001",
      payloadHash: hash("4"),
      expectedRevision: 7,
      operation: "link_correction",
      payload: { findingId, correctionRequestId: "correction:card:0001" }
    });
    assert.equal(linked.status, "repaired");
    assert.equal(linked.revision, 8);
    finding = await scalar(database, `
      select jsonb_build_object(
        'correctionRequestId',correction_request_id,
        'resultingRevision',resulting_revision
      ) value from private.authoring_workspace_observations where id=$1
    `, [findingId]);
    assert.deepEqual(finding, {
      correctionRequestId: "correction:card:0001",
      resultingRevision: 7
    });

    await assert.rejects(manageFinding(database, {
      requestId: "finding:verify:large",
      payloadHash: hash("a"),
      expectedRevision: 8,
      operation: "verify",
      payload: {
        findingId,
        outcome: "resolved",
        verification: "x".repeat(1_001)
      }
    }), (error) => error.code === "23514");
    const verified = await manageFinding(database, {
      requestId: "finding:verify:0001",
      payloadHash: hash("5"),
      expectedRevision: 8,
      operation: "verify",
      payload: {
        findingId,
        outcome: "resolved",
        verification: "A reauditoria confirmou a cobertura."
      }
    });
    assert.equal(verified.status, "resolved");
    assert.equal(verified.revision, 9);
    finding = await scalar(database, `
      select jsonb_build_object(
        'status',status,'verifiedRevision',verified_revision,
        'verification',verification
      ) value from private.authoring_workspace_observations where id=$1
    `, [findingId]);
    assert.deepEqual(finding, {
      status: "resolved",
      verifiedRevision: 8,
      verification: "A reauditoria confirmou a cobertura."
    });

    let currentState = await scalar(database, `
      select authoring_state value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]);
    assert.equal(currentState.mandate.kind, "audit");
    await setMandateFixture(database, {
      id: "repair:test:second", kind: "repair_findings",
      findingIds: [secondFindingId]
    });

    const secondLinked = await manageFinding(database, {
      requestId: "finding:link:0002",
      payloadHash: hash("9"),
      expectedRevision: 9,
      operation: "link_correction",
      payload: {
        findingId: secondFindingId,
        correctionRequestId: "correction:card:0001"
      }
    });
    assert.equal(secondLinked.revision, 10);
    const secondVerified = await manageFinding(database, {
      requestId: "finding:verify:0002",
      payloadHash: hash("0"),
      expectedRevision: 10,
      operation: "verify",
      payload: {
        findingId: secondFindingId,
        outcome: "resolved",
        verification: "O segundo achado também foi resolvido."
      }
    });
    assert.equal(secondVerified.revision, 11);
    currentState = await scalar(database, `
      select authoring_state value from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]);
    assert.equal(currentState.mandate.kind, "audit");
    await setMandateFixture(database, null);

    const continuity = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(continuity.activeFindings.length, 0);
    assert.equal(continuity.findingSummary.byStatus.resolved, 2);

    const deletable = await manageFinding(database, {
      requestId: "finding:create:delete",
      payloadHash: hash("b"),
      expectedRevision: 11,
      operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "Achado que será retirado.",
        category: "scope",
        severity: "low",
        proposedRepair: "Dispensar o achado."
      }
    });
    await manageFinding(database, {
      requestId: "finding:approve:delete",
      payloadHash: hash("c"),
      expectedRevision: 12,
      operation: "decide",
      payload: { findingId: deletable.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:delete:mandate",
      payloadHash: hash("d"),
      expectedRevision: 13,
      operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:delete",
          kind: "repair_findings",
          findingIds: [deletable.findingId]
        }
      }
    });
    const deleted = await manageFinding(database, {
      requestId: "finding:delete:0001",
      payloadHash: hash("e"),
      expectedRevision: 14,
      operation: "delete",
      payload: { findingId: deletable.findingId }
    });
    assert.equal(deleted.status, "deleted");
    assert.equal(deleted.revision, 15);
    assert.equal(await scalar(database, `
      select authoring_state->'mandate' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), null);

    const reopened = await manageFinding(database, {
      requestId: "finding:create:reopen",
      payloadHash: hash("f"),
      expectedRevision: 15,
      operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "A reparação deve ser reavaliada.",
        category: "accuracy",
        severity: "medium",
        proposedRepair: "Reparar novamente se necessário."
      }
    });
    await manageFinding(database, {
      requestId: "finding:approve:reopen",
      payloadHash: hash("1"),
      expectedRevision: 16,
      operation: "decide",
      payload: { findingId: reopened.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:reopen:mandate",
      payloadHash: hash("2"),
      expectedRevision: 17,
      operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:reopen",
          kind: "repair_findings",
          findingIds: [reopened.findingId]
        }
      }
    });
    await database.query(`
      update private.authoring_workspaces set revision=19,updated_at=now() where id=$1
    `, [WORKSPACE_A]);
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($2,'correction:card:reopen','save_card',$3,$1,
        jsonb_build_object(
          'workspaceId',$1::uuid,'revision',19,'idempotent',false,
          'change',jsonb_build_object(
            'operation','save_card','targetPath',
            jsonb_build_array('course-a','module-a','lesson-a','micro-a','card-a'),
            'targetPathsTruncated',false,
            'changedCardPaths',jsonb_build_array(jsonb_build_array(
              'course-a','module-a','lesson-a','micro-a','card-a'
            )),'changedCardPathsTruncated',false
          )
        ))
    `, [WORKSPACE_A, ACTOR, hash("3")]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id
      ) values($1,19,'save_card',jsonb_build_object(
        'operation','save_card','targetPath',
        jsonb_build_array('course-a','module-a','lesson-a','micro-a','card-a'),
        'targetPathsTruncated',false,
        'changedCardPaths',jsonb_build_array(jsonb_build_array(
          'course-a','module-a','lesson-a','micro-a','card-a'
        )),'changedCardPathsTruncated',false
      ),$2)
    `, [WORKSPACE_A, ACTOR]);
    await manageFinding(database, {
      requestId: "finding:link:reopen",
      payloadHash: hash("3"),
      expectedRevision: 19,
      operation: "link_correction",
      payload: {
        findingId: reopened.findingId,
        correctionRequestId: "correction:card:reopen"
      }
    });
    const stillOpen = await manageFinding(database, {
      requestId: "finding:verify:reopen",
      payloadHash: hash("4"),
      expectedRevision: 20,
      operation: "verify",
      payload: {
        findingId: reopened.findingId,
        outcome: "still_open",
        verification: "A reauditoria ainda encontrou o problema."
      }
    });
    assert.equal(stillOpen.status, "open");
    assert.equal(stillOpen.revision, 21);
    await setMandateFixture(database, null);
    assert.equal(await scalar(database, `
      select authoring_state->'mandate' value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE_A]), null);
  } finally {
    await database.close();
  }
});

test("correção só vincula alvo relacionado e aceita caminhos de move/merge", async () => {
  const database = await setupDatabase();
  try {
    const cardFinding = await manageFinding(database, {
      requestId: "finding:target:card",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        body: "Corrigir o card.", category: "accuracy", severity: "high",
        proposedRepair: "Reescrever o card."
      }
    });
    const mergeSourceFinding = await manageFinding(database, {
      requestId: "finding:target:merge",
      payloadHash: hash("2"), expectedRevision: 2, operation: "create",
      payload: {
        entityType: "microsequence",
        entityPath: ["course-a", "module-a", "lesson-a", "m02"],
        body: "Integrar a origem do merge.", category: "structure", severity: "medium",
        proposedRepair: "Reunir na microssequência de destino."
      }
    });
    await manageFinding(database, {
      requestId: "finding:target:approve1",
      payloadHash: hash("3"), expectedRevision: 3, operation: "decide",
      payload: { findingId: cardFinding.findingId, decision: "approve" }
    });
    await manageFinding(database, {
      requestId: "finding:target:approve2",
      payloadHash: hash("4"), expectedRevision: 4, operation: "decide",
      payload: { findingId: mergeSourceFinding.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:target:mandate",
      payloadHash: hash("5"), expectedRevision: 5, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:targets", kind: "repair_findings",
          findingIds: [cardFinding.findingId, mergeSourceFinding.findingId]
        }
      }
    });
    await database.query(`
      update private.authoring_workspace_entities set parent_id='course-b'
      where workspace_id=$1 and entity_type='module' and entity_id='module-a'
    `, [WORKSPACE_A]);
    await database.query(`
      delete from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='microsequence' and entity_id='m02'
    `, [WORKSPACE_A]);
    await database.query(`
      update private.authoring_workspaces set revision=7 where id=$1
    `, [WORKSPACE_A]);
    const wrongChange = {
      operation: "save_card",
      targetPath: ["course-b", "unrelated-module", "lesson-z", "micro-z", "card-b"],
      targetPathsTruncated: false,
      changedCardPaths: [["course-b", "unrelated-module", "lesson-z", "micro-z", "card-b"]],
      changedCardPathsTruncated: false
    };
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($2,'correction:wrong:target','save_card',$3,$1,
        jsonb_build_object(
          'workspaceId',$1::uuid,'revision',7,'idempotent',false,'change',$4::jsonb
        ))
    `, [WORKSPACE_A, ACTOR, hash("6"), JSON.stringify(wrongChange)]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id
      ) values($1,7,'save_card',$3::jsonb,$2)
    `, [WORKSPACE_A, ACTOR, JSON.stringify(wrongChange)]);
    await assert.rejects(manageFinding(database, {
      requestId: "finding:target:wrong",
      payloadHash: hash("7"), expectedRevision: 7, operation: "link_correction",
      payload: {
        findingId: cardFinding.findingId,
        correctionRequestId: "correction:wrong:target"
      }
    }), (error) => error.code === "23514");

    await database.query(`
      update private.authoring_workspaces set revision=8 where id=$1
    `, [WORKSPACE_A]);
    const relatedChange = {
      operation: "merge_microsequences",
      targetPaths: [
        ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        ["course-b", "module-a", "lesson-a", "micro-a"],
        ["course-a", "module-a", "lesson-a", "m02"]
      ], targetPathsTruncated: false,
      changedCardPaths: [["course-b", "module-a", "lesson-a", "micro-a", "card-a"]],
      changedCardPathsTruncated: false
    };
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($2,'correction:related:paths','merge_microsequences',$3,$1,
        jsonb_build_object(
          'workspaceId',$1::uuid,'revision',8,'idempotent',false,'change',$4::jsonb
        ))
    `, [WORKSPACE_A, ACTOR, hash("8"), JSON.stringify(relatedChange)]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id
      ) values($1,8,'merge_microsequences',$3::jsonb,$2)
    `, [WORKSPACE_A, ACTOR, JSON.stringify(relatedChange)]);
    const movedLinked = await manageFinding(database, {
      requestId: "finding:target:moved",
      payloadHash: hash("9"), expectedRevision: 8, operation: "link_correction",
      payload: {
        findingId: cardFinding.findingId,
        correctionRequestId: "correction:related:paths"
      }
    });
    assert.equal(movedLinked.status, "repaired");
    const mergedSourceLinked = await manageFinding(database, {
      requestId: "finding:target:merged",
      payloadHash: hash("0"), expectedRevision: 9, operation: "link_correction",
      payload: {
        findingId: mergeSourceFinding.findingId,
        correctionRequestId: "correction:related:paths"
      }
    });
    assert.equal(mergedSourceLinked.status, "repaired");
  } finally {
    await database.close();
  }
});

test("finding de resource exige o resourceTargetId exato no mesmo card", async () => {
  const database = await setupDatabase();
  try {
    const created = await manageFinding(database, {
      requestId: "finding:resource:exact",
      payloadHash: hash("1"), expectedRevision: 1, operation: "create",
      payload: {
        entityType: "resource",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        resourceTargetId: "body:paragraph-a",
        body: "Corrigir o parágrafo.", category: "accuracy", severity: "high",
        proposedRepair: "Reescrever o parágrafo."
      }
    });
    await manageFinding(database, {
      requestId: "finding:resource:approve",
      payloadHash: hash("2"), expectedRevision: 2, operation: "decide",
      payload: { findingId: created.findingId, decision: "approve" }
    });
    await updateContinuity(database, {
      requestId: "continuity:resource:mandate",
      payloadHash: hash("3"), expectedRevision: 3, operation: "set_mandate",
      state: {
        version: 1, parts: [], decisions: [],
        mandate: {
          id: "repair:resource", kind: "repair_findings",
          findingIds: [created.findingId]
        }
      }
    });
    const path = ["course-a", "module-a", "lesson-a", "micro-a", "card-a"];
    const otherPath = ["course-a", "module-a", "lesson-a", "micro-a", "card-b"];
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values($1,'card','card-b','microsequence','micro-a',2,
        '{"title":"Card B","resource":"composite","blocks":[
          {"id":"paragraph-a","kind":"paragraph","text":"B"}
        ]}'::jsonb)
    `, [WORKSPACE_A]);
    async function addCorrection({
      revision, requestId, resourceTargets, resourceTargetsTruncated = false
    }) {
      const change = {
        operation: "save_card", targetPath: path,
        targetPathsTruncated: false,
        changedCardPaths: [path], changedCardPathsTruncated: false,
        resourceTargets, resourceTargetsTruncated
      };
      await database.query(`
        update private.authoring_workspaces set revision=$2 where id=$1
      `, [WORKSPACE_A, revision]);
      await database.query(`
        insert into private.authoring_workspace_requests(
          owner_id,request_id,operation,payload_hash,workspace_id,result
        ) values($2,$3,'save_card',$4,$1,jsonb_build_object(
          'workspaceId',$1::uuid,'revision',$5::bigint,'idempotent',false,
          'change',$6::jsonb
        ))
      `, [
        WORKSPACE_A, ACTOR, requestId, hash(String(revision)), revision,
        JSON.stringify(change)
      ]);
      await database.query(`
        insert into private.authoring_workspace_events(
          workspace_id,revision,operation,summary,actor_id
        ) values($1,$2,'save_card',$3::jsonb,$4)
      `, [WORKSPACE_A, revision, JSON.stringify(change), ACTOR]);
    }
    await addCorrection({
      revision: 5, requestId: "correction:resource:truncated",
      resourceTargets: [{ cardPath: path, targetId: "body:paragraph-a" }],
      resourceTargetsTruncated: true
    });
    await assert.rejects(manageFinding(database, {
      requestId: "finding:resource:truncated",
      payloadHash: hash("5"), expectedRevision: 5, operation: "link_correction",
      payload: {
        findingId: created.findingId,
        correctionRequestId: "correction:resource:truncated"
      }
    }), (error) => error.code === "23514");
    await addCorrection({
      revision: 6, requestId: "correction:resource:wrong",
      resourceTargets: [{ cardPath: otherPath, targetId: "body:paragraph-a" }]
    });
    await assert.rejects(manageFinding(database, {
      requestId: "finding:resource:wrong",
      payloadHash: hash("6"), expectedRevision: 6, operation: "link_correction",
      payload: {
        findingId: created.findingId,
        correctionRequestId: "correction:resource:wrong"
      }
    }), (error) => error.code === "23514");
    await addCorrection({
      revision: 7, requestId: "correction:resource:right",
      resourceTargets: [
        { cardPath: otherPath, targetId: "body:paragraph-a" },
        { cardPath: path, targetId: "body:paragraph-a" }
      ]
    });
    const linked = await manageFinding(database, {
      requestId: "finding:resource:right",
      payloadHash: hash("7"), expectedRevision: 7, operation: "link_correction",
      payload: {
        findingId: created.findingId,
        correctionRequestId: "correction:resource:right"
      }
    });
    assert.equal(linked.status, "repaired");
  } finally {
    await database.close();
  }
});

test("listagem filtra, pagina, isola workspace e resolve o caminho corrente", async () => {
  const database = await setupDatabase();
  try {
    const validNote = await scalar(database, `
      select public.manage_authoring_workspace_observation_for_actor_v1(
        $1,$2,$3,'create',$4::jsonb
      ) value
    `, [ACTOR, "note:resource:0001", WORKSPACE_A, JSON.stringify({
      entityType: "resource",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      resourceTargetId: "after:support-a",
      body: "Rever o apoio."
    })]);
    assert.equal(validNote.operation, "create");
    await assert.rejects(database.query(`
      select public.manage_authoring_workspace_observation_for_actor_v1(
        $1,$2,$3,'create',$4::jsonb
      )
    `, [ACTOR, "note:resource:0002", WORKSPACE_A, JSON.stringify({
      entityType: "resource",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      resourceTargetId: "after:missing",
      body: "Inválida."
    })]), (error) => error.code === "22023");

    await database.query(`
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body,created_at,updated_at
      ) values
        ($1,$2,'note','module',array['course-a','module-a'],'Nota do módulo',
          '2026-08-09T10:03:00Z','2026-08-09T10:03:00Z'),
        ($1,$2,'note','course',array['course-a'],'Nota do curso',
          '2026-08-09T10:02:00Z','2026-08-09T10:02:00Z'),
        ($3,$2,'note','course',array['course-a'],'Outro workspace',
          '2026-08-09T10:04:00Z','2026-08-09T10:04:00Z')
    `, [WORKSPACE_A, ACTOR, WORKSPACE_B]);

    const resume = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(resume.structuralObservations.totalCount, 3);
    assert.equal(resume.structuralObservations.openCount, 3);
    assert.equal(resume.structuralObservations.focus.length, 3);
    assert.equal(JSON.stringify(resume.structuralObservations).includes("Rever o apoio"), false);
    assert.equal(resume.situatedObservations.totalCount, 2);
    assert.equal(resume.situatedObservations.openCount, 1);
    await database.exec(`
      create or replace function private.educational_workspace_can_v1(uuid,uuid,text)
      returns boolean language sql stable as $$ select $3 <> 'comment' $$
    `);
    const resumeWithoutCommentCapability = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.deepEqual(resumeWithoutCommentCapability.situatedObservations, {
      totalCount: 0, openCount: 0, focus: []
    });
    await database.exec(`
      create or replace function private.educational_workspace_can_v1(uuid,uuid,text)
      returns boolean language sql stable as $$
        select ($2='${CATALOG_EDITOR}'::uuid and $3 <> 'transfer') or exists(
          select 1 from private.educational_workspace_members member
          where member.workspace_id=$1 and member.user_id=$2
            and case $3
              when 'read' then true
              when 'author' then member.role in ('owner','admin','author')
              when 'review' then member.role in ('owner','admin','author','reviewer')
              when 'comment' then member.role <> 'reader'
              else member.role in ('owner','admin')
            end
        )
      $$
    `);

    const first = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,2,null,null,null,array['note'],null
      ) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(first.items.length, 2);
    assert.equal(first.hasMore, true);
    assert.equal(first.items.every((item) => item.workspaceId === WORKSPACE_A), true);
    assert.equal(first.items.every((item) => item.kind === "note"), true);
    const second = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,2,$3,$4,null,array['note'],null
      ) value
    `, [
      ACTOR, WORKSPACE_A,
      first.nextCursor.beforeUpdatedAt, first.nextCursor.beforeId
    ]);
    assert.equal(second.items.length, 1);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.observationId)).size, 3);

    await database.query(`
      update private.authoring_workspace_entities
      set parent_id='course-b',updated_at=now()
      where workspace_id=$1 and entity_type='module' and entity_id='module-a'
    `, [WORKSPACE_A]);
    let moved = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,array['module'],array['note'],null
      ) value
    `, [ACTOR, WORKSPACE_A]);
    assert.deepEqual(moved.items[0].entityPath, ["course-a", "module-a"]);
    assert.deepEqual(moved.items[0].currentEntityPath, ["course-b", "module-a"]);
    assert.equal(moved.items[0].targetAvailable, true);
    let movedResource = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,array['resource'],array['note'],null
      ) value
    `, [ACTOR, WORKSPACE_A]);
    assert.deepEqual(
      movedResource.items[0].currentEntityPath,
      ["course-b", "module-a", "lesson-a", "micro-a", "card-a"]
    );
    assert.equal(movedResource.items[0].targetAvailable, true);

    await database.query(`
      delete from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='module' and entity_id='module-a'
    `, [WORKSPACE_A]);
    moved = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,array['module'],array['note'],null
      ) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(moved.items[0].currentEntityPath, null);
    assert.equal(moved.items[0].targetAvailable, false);
    movedResource = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,array['resource'],array['note'],null
      ) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(movedResource.items[0].currentEntityPath, null);
    assert.equal(movedResource.items[0].targetAvailable, false);

    await database.query(`
      update private.authoring_workspace_observation_receipts
      set created_at=statement_timestamp()-interval '2 days',
          expires_at=statement_timestamp()-interval '1 second'
      where actor_id=$1 and request_id='note:resource:0001'
    `, [ACTOR]);
    await scalar(database, `
      select public.manage_authoring_workspace_observation_for_actor_v1(
        $1,$2,$3,'create',$4::jsonb
      ) value
    `, [ACTOR, "note:workspace:001", WORKSPACE_A, JSON.stringify({
      entityType: "workspace", entityPath: [], body: "Nota corrente."
    })]);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_observation_receipts
      where actor_id=$1 and request_id='note:resource:0001'
    `, [ACTOR]), 0);
  } finally {
    await database.close();
  }
});

test("listagem preserva notas privadas do learner e libera triagem somente a review", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body
      ) values
        ($1,$2,'note','course',array['course-a'],'Nota do autor'),
        ($1,$3,'note','course',array['course-a'],'Nota pessoal do learner')
    `, [WORKSPACE_A, ACTOR, LEARNER]);
    const learnerView = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,20,null,null,null,array['note'],null
      ) value
    `, [LEARNER, WORKSPACE_A]);
    assert.equal(learnerView.items.length, 1);
    assert.equal(learnerView.items[0].authorId, LEARNER);
    assert.equal(learnerView.summary.total, 1);
    assert.equal(learnerView.items[0].canDelete, true);

    for (const reviewer of [REVIEWER, CATALOG_EDITOR]) {
      const triage = await scalar(database, `
        select public.list_authoring_workspace_observations_for_actor_v1(
          $1,$2,20,null,null,null,array['note'],null
        ) value
      `, [reviewer, WORKSPACE_A]);
      assert.equal(triage.items.length, 2);
      assert.equal(triage.summary.total, 2);
      assert.equal(triage.items.every((item) => item.canDelete), true);
    }
  } finally {
    await database.close();
  }
});

test("poda oportunística limita apenas findings terminais do próprio workspace", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body,
        category,severity,status,proposed_repair,audit_revision,updated_at
      )
      select $1,$2,'audit_finding','workspace','{}'::text[],
        'Terminal ' || value,'scope','low','rejected','Sem reparo.',1,
        now() - (value || ' minutes')::interval
      from generate_series(1,105) value
    `, [WORKSPACE_A, ACTOR]);
    await database.query(`
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body,
        category,severity,status,proposed_repair,audit_revision,updated_at
      ) values
        ($1,$2,'audit_finding','workspace','{}','Terminal antigo',
          'scope','low','rejected','Já reparado.',1,now()-interval '91 days'),
        ($1,$2,'audit_finding','workspace','{}','Ativo preservado',
          'scope','high','open','Reparar.',1,now()-interval '200 days'),
        ($1,$2,'note','workspace','{}','Nota permanente',null,null,null,null,null,
          now()-interval '400 days')
    `, [WORKSPACE_A, ACTOR]);
    await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_observations
      where workspace_id=$1 and kind='audit_finding'
        and status in ('rejected','resolved')
    `, [WORKSPACE_A]), 100);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_observations
      where workspace_id=$1 and kind='audit_finding' and status='open'
    `, [WORKSPACE_A]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_observations
      where workspace_id=$1 and kind='note'
    `, [WORKSPACE_A]), 1);
  } finally {
    await database.close();
  }
});

test("resume entrega conteúdo e reparo de até sete findings no envelope normal", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body,
        category,severity,status,proposed_repair,audit_revision,updated_at
      )
      select $1,$2,'audit_finding','workspace','{}'::text[],
        'Achado detalhado ' || value,'coverage','medium','open',
        'Reparo proposto ' || value,1,now()+(value || ' seconds')::interval
      from generate_series(1,7) value
    `, [WORKSPACE_A, ACTOR]);
    const continuity = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(continuity.activeFindings.length, 7);
    assert.equal(continuity.activeFindingsTruncated, false);
    assert.equal(continuity.activeFindings.every((item) =>
      item.body.startsWith("Achado detalhado")
      && item.proposedRepair.startsWith("Reparo proposto")
    ), true);
    assert.ok(Buffer.byteLength(JSON.stringify(continuity)) < 32 * 1_024);
  } finally {
    await database.close();
  }
});

test("observação situada só vira incorporated após correção autoral comprovada", async () => {
  const database = await setupDatabase();
  const trailItemId = "30000000-0000-4000-8000-000000000001";
  const commentId = "40000000-0000-4000-8000-000000000001";
  const cardPath = ["course-a", "module-a", "lesson-a", "micro-a", "card-a"];
  const otherCardPath = ["course-a", "module-a", "lesson-a", "micro-a", "card-b"];
  try {
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values($1,'card','card-b','microsequence','micro-a',2,'{"title":"Card B"}')
    `, [WORKSPACE_A]);
    await database.query(`
      insert into private.trail_items(id,workspace_id,workspace_course_id)
      values($1,$2,'course-a')
    `, [trailItemId, WORKSPACE_A]);
    await database.query(`
      insert into public.trail_personal_states(user_id,trail_item_id,state)
      values($1,$2,'{"observations":{"card-a":{"text":"Revisar"}}}')
    `, [LEARNER, trailItemId]);
    await database.query(`
      insert into private.trail_observation_threads(
        id,user_id,trail_item_id,card_id,created_at,updated_at
      ) values($1,$2,$3,'card-a',now()-interval '1 hour',now()-interval '1 hour')
    `, [commentId, LEARNER, trailItemId]);

    await assert.rejects(manageComment(database, {
      requestId: "comment:status:bypass",
      commentId,
      operation: "set_comment_status",
      payload: { status: "incorporated" }
    }), (error) => error.code === "23514");
    await assert.rejects(manageComment(database, {
      requestId: "comment:link:missing",
      commentId,
      operation: "link_comment_correction",
      payload: {
        correctionRequestId: "correction:missing:0001",
        entityPath: cardPath
      }
    }), (error) => error.code === "P0002");

    const divergentChange = {
      operation: "save_card",
      targetPaths: [otherCardPath],
      targetPathsTruncated: false,
      changedCardPaths: [otherCardPath],
      changedCardPathsTruncated: false,
      cardShellChangedPaths: [otherCardPath],
      cardShellChangedPathsTruncated: false,
      resourceTargets: [],
      resourceTargetsTruncated: false
    };
    await database.query(`
      update private.authoring_workspaces set revision=2 where id=$1
    `, [WORKSPACE_A]);
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($1,'correction:divergent:0001','save_card',$2,$3,
        jsonb_build_object('revision',2,'change',$4::jsonb))
    `, [ACTOR, hash("d"), WORKSPACE_A, JSON.stringify(divergentChange)]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id,created_at
      ) values($1,2,'save_card',$2::jsonb,$3,now())
    `, [WORKSPACE_A, JSON.stringify(divergentChange), ACTOR]);
    await assert.rejects(manageComment(database, {
      requestId: "comment:link:divergent",
      commentId,
      operation: "link_comment_correction",
      payload: {
        correctionRequestId: "correction:divergent:0001",
        entityPath: cardPath
      }
    }), (error) => error.code === "23514");

    await database.query(`
      update private.authoring_workspaces set revision=3 where id=$1
    `, [WORKSPACE_A]);
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($1,'correction:actor:other','save_card',$2,$3,
        jsonb_build_object('revision',3,'change',$4::jsonb))
    `, [REVIEWER, hash("f"), WORKSPACE_A, JSON.stringify(divergentChange)]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id,created_at
      ) values($1,3,'save_card',$2::jsonb,$3,now())
    `, [WORKSPACE_A, JSON.stringify(divergentChange), REVIEWER]);
    await assert.rejects(manageComment(database, {
      requestId: "comment:link:actor:other",
      commentId,
      operation: "link_comment_correction",
      payload: {
        correctionRequestId: "correction:actor:other",
        entityPath: cardPath
      }
    }), (error) => error.code === "P0002");

    await database.query(`
      update private.authoring_workspaces set revision=2 where id=$1
    `, [WORKSPACE_B]);
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($1,'correction:workspace:other','save_card',$2,$3,
        jsonb_build_object('revision',2,'change',$4::jsonb))
    `, [ACTOR, hash("c"), WORKSPACE_B, JSON.stringify(divergentChange)]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id,created_at
      ) values($1,2,'save_card',$2::jsonb,$3,now())
    `, [WORKSPACE_B, JSON.stringify(divergentChange), ACTOR]);
    await assert.rejects(manageComment(database, {
      requestId: "comment:link:workspace:other",
      commentId,
      operation: "link_comment_correction",
      payload: {
        correctionRequestId: "correction:workspace:other",
        entityPath: cardPath
      }
    }), (error) => error.code === "P0002");

    const validChange = {
      ...divergentChange,
      targetPaths: [cardPath],
      changedCardPaths: [cardPath],
      cardShellChangedPaths: [cardPath]
    };
    await database.query(`
      update private.authoring_workspaces set revision=4 where id=$1
    `, [WORKSPACE_A]);
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values($1,'correction:comment:valid','save_card',$2,$3,
        jsonb_build_object('revision',4,'change',$4::jsonb))
    `, [ACTOR, hash("e"), WORKSPACE_A, JSON.stringify(validChange)]);
    await database.query(`
      insert into private.authoring_workspace_events(
        workspace_id,revision,operation,summary,actor_id,created_at
      ) values($1,4,'save_card',$2::jsonb,$3,now())
    `, [WORKSPACE_A, JSON.stringify(validChange), ACTOR]);
    const linked = await manageComment(database, {
      requestId: "comment:link:valid:0001",
      commentId,
      operation: "link_comment_correction",
      payload: {
        correctionRequestId: "correction:comment:valid",
        entityPath: cardPath
      }
    });
    assert.equal(linked.status, "incorporated");
    assert.equal(linked.resultingRevision, 4);
    assert.equal(linked.idempotent, false);
    const replay = await manageComment(database, {
      requestId: "comment:link:valid:0001",
      commentId,
      operation: "link_comment_correction",
      payload: {
        correctionRequestId: "correction:comment:valid",
        entityPath: cardPath
      }
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.resultingRevision, 4);
    const stored = await scalar(database, `
      select jsonb_build_object(
        'status',status,'correctionRequestId',correction_request_id,
        'resultingRevision',correction_resulting_revision
      ) value from private.trail_observation_threads where id=$1
    `, [commentId]);
    assert.deepEqual(stored, {
      status: "incorporated",
      correctionRequestId: "correction:comment:valid",
      resultingRevision: 4
    });
  } finally {
    await database.close();
  }
});

test("resume limita achados ativos a dez mesmo no pior payload compacto", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body,
        category,severity,status,proposed_repair,audit_revision,
        correction_request_id,resulting_revision,verification,verified_revision,
        updated_at
      )
      select $1,$2,'audit_finding','workspace','{}'::text[],
        case when value <= 11 then repeat('a',1000) else 'Achado ' || value end,
        'coverage','low',case when value <= 11 then 'repaired' else 'open' end,
        case when value <= 11 then repeat('r',1000) else 'Reparar ' || value end,
        1,
        case when value <= 11 then 'correction:worst:' || value else null end,
        case when value <= 11 then 2 else null end,
        case when value <= 11 then repeat('v',1000) else null end,
        case when value <= 11 then 2 else null end,
        case when value <= 11 then now()+interval '1 hour' else now() end
      from generate_series(1,101) value
    `, [WORKSPACE_A, ACTOR]);
    const continuity = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(continuity.activeFindings.length, 10);
    assert.equal(continuity.activeFindingsTruncated, true);
    assert.equal(continuity.findingSummary.byStatus.open, 90);
    assert.equal(continuity.findingSummary.byStatus.repaired, 11);
    assert.equal(continuity.activeFindings.every((item) =>
      item.body.length === 1_000
      && item.proposedRepair.length === 1_000
      && !Object.hasOwn(item, "verification")
    ), true);
    assert.ok(Buffer.byteLength(JSON.stringify(continuity.activeFindings)) < 32 * 1_024);
    const detailed = await scalar(database, `
      select public.list_authoring_workspace_observations_for_actor_v1(
        $1,$2,10,null,null,null,array['audit_finding'],array['repaired']
      ) value
    `, [ACTOR, WORKSPACE_A]);
    assert.equal(detailed.items.length, 10);
    assert.equal(detailed.items.every((item) =>
      item.body.length === 1_000
      && item.proposedRepair.length === 1_000
      && item.verification.length === 1_000
    ), true);
    const manifest = await scalar(database, `
      select public.get_aralearn_runtime_manifest() value
    `);
    assert.equal(manifest.schemaRevision, "20260809010000");
    assert.equal(manifest.features.includes("resumable-authoring-continuity-v1"), true);
  } finally {
    await database.close();
  }
});

test("helpers de continuidade usam volatilidade compatível", async () => {
  const database = await setupDatabase();
  try {
    const result = await database.query(`
      select proname, provolatile
      from pg_proc
      where oid in (
        'private.valid_authoring_continuity_v1(jsonb)'::regprocedure,
        'private.normalize_authoring_continuity_v1(jsonb,jsonb,bigint)'::regprocedure,
        'private.remap_authoring_continuity_v1(jsonb,text,jsonb,jsonb)'::regprocedure
      )
      order by proname
    `);
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows.every(({ provolatile }) => provolatile === "s"), true);
  } finally {
    await database.close();
  }
});

test("migration não cria snapshots, prompts ou cópias de cards", async () => {
  const migration = await fs.readFile(migrationUrl, "utf8");
  assert.doesNotMatch(migration, /create\s+table[^;]*(?:snapshot|prompt|card_json)/iu);
  assert.match(migration, /octet_length\(p_state::text\)\s*>\s*65536/iu);
  assert.match(migration, /limit\s+10/iu);
});
