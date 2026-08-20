import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  COURSE_ANCHORED_ANNOTATION_CHANGE_CONTRACT,
  COURSE_ANCHORED_ANNOTATION_CONTRACT,
  COURSE_ANCHORED_ANNOTATION_PAGE_CONTRACT,
  CourseAnchoredAnnotationsError,
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../../src/domain/courseAnchoredAnnotations.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260817200000_course_anchored_annotations.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const LEARNER_A = "10000000-0000-4000-8000-000000000002";
const LEARNER_B = "10000000-0000-4000-8000-000000000003";
const OUTSIDER = "10000000-0000-4000-8000-000000000004";
const COURSE = "20000000-0000-4000-8000-000000000001";
const WORKSPACE = "30000000-0000-4000-8000-000000000001";
const STUDY_ANNOTATION = "40000000-0000-4000-8000-000000000001";
const NOTE_ANNOTATION = "40000000-0000-4000-8000-000000000002";

const observedAt = "2026-08-16T11:12:13.000Z";
const legacyObservation = {
  "unit-a": {
    category: "possible_error",
    body: "Linha 1\n  Linha 2",
    updatedAt: observedAt
  },
  "unit-b": {
    category: "question",
    body: "Pergunta já respondida",
    updatedAt: "2026-08-16T15:00:00.000Z"
  }
};

async function actor(database, actorId, role = "authenticated") {
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actorId]);
  await database.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
}

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function legacyDatabase({ orphan = false, auditFinding = false } = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema extensions;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function private.request_role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'')
    $$;
    create function private.require_service_role() returns void
      language plpgsql stable security definer as $$
    begin
      if private.request_role() is distinct from 'service_role' then
        raise exception 'service role obrigatório' using errcode='42501';
      end if;
    end $$;
    create function extensions.digest(bytea,text) returns bytea
      language sql immutable as $$
      select decode(md5(convert_from($1,'UTF8'))||md5(convert_from($1,'UTF8')),'hex')
    $$;

    create table auth.users(id uuid primary key,email text unique);
    insert into auth.users values
      ('${OWNER}','owner@example.test'),
      ('${LEARNER_A}','learner-a@example.test'),
      ('${LEARNER_B}','learner-b@example.test'),
      ('${OUTSIDER}','outsider@example.test');

    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      title text not null,
      goal text not null,
      revision bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    insert into public.courses(id,owner_id,title,goal,revision) values
      ('${COURSE}','${OWNER}','Curso de redes','Compreender redes',7);

    create table public.course_access(
      course_id uuid not null references public.courses(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      granted_by uuid not null references auth.users(id),
      primary key(course_id,user_id)
    );
    insert into public.course_access values
      ('${COURSE}','${LEARNER_A}','${OWNER}'),
      ('${COURSE}','${LEARNER_B}','${OWNER}');

    create function private.require_course_access_v1(
      p_course_id uuid,p_actor_id uuid,p_require_owner boolean
    ) returns boolean language plpgsql stable security definer as $$
    declare v_owner boolean;
    begin
      select course.owner_id=p_actor_id into v_owner
      from public.courses course where course.id=p_course_id;
      if not found or (p_require_owner and not v_owner)
         or (not p_require_owner and not v_owner and not exists(
           select 1 from public.course_access access
           where access.course_id=p_course_id and access.user_id=p_actor_id
         )) then
        raise exception 'Curso inexistente ou inacessível.' using errcode='PT404';
      end if;
      return v_owner;
    end $$;

    create table private.course_entities(
      course_id uuid not null references public.courses(id) on delete cascade,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(course_id,entity_type,entity_id)
    );
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content,version
    ) values
      ('${COURSE}','module','module-a',null,null,0,'{"title":"Módulo A"}',2),
      ('${COURSE}','lesson','lesson-a','module','module-a',0,'{"title":"Lição A"}',3),
      ('${COURSE}','topic','topic-dns','lesson','lesson-a',0,'{"label":"DNS"}',4),
      ('${COURSE}','topic','topic-dhcp','lesson','lesson-a',1,'{"label":"DHCP"}',5),
      ('${COURSE}','microsequence','micro-a','lesson','lesson-a',0,
        '{"title":"Microssequência A"}',6),
      ('${COURSE}','study_unit','unit-a','microsequence','micro-a',1,
        '{"title":"Unidade A","topics":["topic-dns","topic-dhcp"]}',7);

    create table private.course_source_revisions(
      course_id uuid not null references public.courses(id) on delete cascade,
      source_id text not null,
      revision bigint not null,
      status text not null,
      title text not null,
      primary key(course_id,source_id,revision)
    );
    create table private.course_source_anchor_revisions(
      course_id uuid not null references public.courses(id) on delete cascade,
      anchor_id text not null,
      revision bigint not null,
      source_id text not null,
      source_revision bigint not null,
      status text not null,
      primary key(course_id,anchor_id,revision)
    );
    insert into private.course_source_revisions values
      ('${COURSE}','source-a',1,'active','Fonte A');
    insert into private.course_source_anchor_revisions values
      ('${COURSE}','anchor-source-a',1,'source-a',1,'active');

    create function private.valid_course_source_links_shape_v1(
      p_links jsonb,p_allow_legacy_ids boolean default false
    ) returns boolean language sql immutable as $$
      select coalesce(
        jsonb_typeof(p_links)='array'
        and jsonb_array_length(p_links)<=case when p_allow_legacy_ids then 128 else 32 end
        and not exists(
          select 1 from jsonb_array_elements(p_links) link(value)
          where jsonb_typeof(link.value)<>'object'
             or link.value-'sourceId'-'sourceRevision'-'relation'-'anchors'<>'{}'::jsonb
             or not(link.value ?& array['sourceId','sourceRevision','relation','anchors'])
             or jsonb_typeof(link.value->'sourceId')<>'string'
             or nullif(btrim(link.value->>'sourceId'),'') is null
             or jsonb_typeof(link.value->'sourceRevision')<>'number'
             or link.value->>'sourceRevision'!~'^[1-9][0-9]*$'
             or link.value->>'relation' not in(
               'informed_by','supported_by','adapted_from','quoted_from',
               'contrasted_with','exemplified_by','inspired_by','needs_verification'
             )
             or jsonb_typeof(link.value->'anchors')<>'array'
             or jsonb_array_length(link.value->'anchors')>8
             or not p_allow_legacy_ids and jsonb_array_length(link.value->'anchors')=0
             or exists(
               select 1 from jsonb_array_elements(link.value->'anchors') anchor(value)
               where jsonb_typeof(anchor.value)<>'object'
                  or anchor.value-'anchorId'-'anchorRevision'<>'{}'::jsonb
                  or not(anchor.value ?& array['anchorId','anchorRevision'])
                  or jsonb_typeof(anchor.value->'anchorId')<>'string'
                  or nullif(btrim(anchor.value->>'anchorId'),'') is null
                  or jsonb_typeof(anchor.value->'anchorRevision')<>'number'
                  or anchor.value->>'anchorRevision'!~'^[1-9][0-9]*$'
             )
        ),false
      )
    $$;

    create function private.valid_course_personal_state_v1(p_state jsonb)
      returns boolean language sql immutable as $$
      select jsonb_typeof(p_state)='object'
        and p_state ?& array['version','progress','reviewMarks','observations']
        and jsonb_typeof(p_state->'progress')='object'
        and jsonb_typeof(p_state->'reviewMarks')='object'
        and jsonb_typeof(p_state->'observations')='object'
    $$;

    create table public.course_personal_states(
      user_id uuid not null references auth.users(id) on delete cascade,
      course_id uuid not null references public.courses(id) on delete cascade,
      revision bigint not null default 1,
      state jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(user_id,course_id),
      constraint course_personal_states_state_v1
        check(private.valid_course_personal_state_v1(state))
    );

    create table public.legacy_trail_personal_states(
      user_id uuid not null references auth.users(id) on delete cascade,
      trail_item_id uuid not null,
      revision bigint not null default 1,
      state jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(user_id,trail_item_id)
    );

    create table private.trail_observation_threads(
      id uuid primary key,
      user_id uuid not null,
      trail_item_id uuid not null,
      card_id text not null,
      status text not null,
      response text,
      responded_at timestamptz,
      resolved_at timestamptz,
      correction_request_id text,
      correction_entity_path text[],
      correction_linked_at timestamptz,
      correction_resulting_revision bigint,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create table private.legacy_authoring_workspaces(
      id uuid primary key,
      owner_id uuid references auth.users(id),
      title text not null
    );
    insert into private.legacy_authoring_workspaces values
      ('${WORKSPACE}','${OWNER}','Workspace legado');

    create table private.legacy_trail_items(
      id uuid primary key,
      workspace_id uuid,
      workspace_course_id text
    );
    insert into private.legacy_trail_items values
      ('${COURSE}','${WORKSPACE}','course-legacy-a');

    create table private.authoring_workspace_observations(
      id uuid primary key,
      workspace_id uuid not null,
      author_id uuid,
      entity_type text not null,
      entity_path text[] not null default '{}',
      body text not null,
      kind text not null default 'note',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table private.course_personal_state_receipts(
      user_id uuid not null references auth.users(id) on delete cascade,
      request_id uuid not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      request_hash text not null,
      result_revision bigint not null,
      result_updated_at timestamptz not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now()+interval '7 days',
      primary key(user_id,request_id)
    );

    create function public.load_course_personal_state_v1(uuid)
      returns jsonb language sql stable as $$ select null::jsonb $$;
    create function public.mutate_course_personal_state_v1(uuid,bigint,jsonb,uuid)
      returns jsonb language sql as $$ select null::jsonb $$;

    create function public.get_aralearn_runtime_manifest()
      returns jsonb language sql stable security definer as $$
      select jsonb_build_object(
        'schemaRevision','20260817190000','contractVersion',1,
        'features',jsonb_build_array(
          'course-sources-v1','course-source-provenance-v1',
          'course-personal-state-v1'
        )
      )
    $$;
    grant execute on function public.get_aralearn_runtime_manifest()
      to anon,authenticated,service_role;
  `);

  if (orphan) {
    await database.query(`
      insert into public.legacy_trail_personal_states(user_id,trail_item_id,state)
      values($1,$2,$3::jsonb)
    `, [LEARNER_A, COURSE, JSON.stringify({
      version: 1,
      progress: { version: 3, lessons: {} },
      reviewMarks: {},
      observations: legacyObservation
    })]);
  } else {
    const state = {
      version: 1,
      progress: { version: 3, lessons: {} },
      reviewMarks: {},
      observations: legacyObservation
    };
    await database.query(`
      insert into public.course_personal_states(
        user_id,course_id,revision,state,created_at,updated_at
      ) values($1,$2,4,$3::jsonb,'2026-08-15T10:00:00Z','2026-08-16T11:12:14Z');
    `, [LEARNER_A, COURSE, JSON.stringify(state)]);
    await database.query(`
      insert into public.legacy_trail_personal_states(
        user_id,trail_item_id,revision,state,created_at,updated_at
      ) values($1,$2,4,$3::jsonb,'2026-08-15T10:00:00Z','2026-08-16T11:12:14Z');
    `, [LEARNER_A, COURSE, JSON.stringify(state)]);
    await database.query(`
      insert into private.trail_observation_threads(
        id,user_id,trail_item_id,card_id,status,response,responded_at,resolved_at,
        correction_request_id,correction_entity_path,correction_linked_at,
        correction_resulting_revision,created_at,updated_at
      ) values(
        $1,$2,$3,'unit-a','resolved','Resposta preservada',
        '2026-08-16T13:00:00Z','2026-08-16T14:00:00Z',
        'request.correction.legacy',array['course-legacy-a','module-a','lesson-a'],
        '2026-08-16T13:30:00Z',8,
        '2026-08-15T12:00:00Z','2026-08-16T14:00:00Z'
      )
    `, [STUDY_ANNOTATION, LEARNER_A, COURSE]);
    await database.query(`
      insert into private.trail_observation_threads(
        id,user_id,trail_item_id,card_id,status,response,responded_at,resolved_at,
        correction_request_id,correction_entity_path,correction_linked_at,
        correction_resulting_revision,created_at,updated_at
      ) values(
        '40000000-0000-4000-8000-000000000004',$1,$2,'unit-b','open',
        'Resposta em thread aberta','2026-08-16T15:30:00Z',null,
        null,null,null,null,'2026-08-15T13:00:00Z','2026-08-16T15:30:00Z'
      )
    `, [LEARNER_A, COURSE]);
    await database.query(`
      insert into private.authoring_workspace_observations(
        id,workspace_id,author_id,entity_type,entity_path,body,kind,
        created_at,updated_at
      ) values(
        $1,$2,$3,'card',array['course-legacy-a','module-a','lesson-a','micro-a','unit-a'],
        'Nota autoral preservada','note','2026-08-14T09:00:00Z','2026-08-14T10:00:00Z'
      )
    `, [NOTE_ANNOTATION, WORKSPACE, OWNER]);
    await database.query(`
      insert into private.authoring_workspace_observations(
        id,workspace_id,author_id,entity_type,entity_path,body,kind,
        created_at,updated_at
      ) values(
        '40000000-0000-4000-8000-000000000003',$1,null,'lesson',
        array['course-legacy-a','module-a','lesson-a'],
        'Nota autoral sem ator preservada','note',
        '2026-08-14T11:00:00Z','2026-08-14T12:00:00Z'
      )
    `, [WORKSPACE]);
    await database.query(`
      insert into private.course_personal_state_receipts(
        user_id,request_id,course_id,request_hash,result_revision,result_updated_at,
        created_at,expires_at
      ) values(
        $1,'71000000-0000-4000-8000-000000000001',$2,$3,4,
        '2026-08-16T11:12:14Z',now(),now()+interval '1 day'
      )
    `, [LEARNER_B, COURSE, "a".repeat(64)]);
    await database.query(`
      insert into private.course_personal_state_receipts(
        user_id,request_id,course_id,request_hash,result_revision,result_updated_at,
        created_at,expires_at
      ) values(
        $1,'71000000-0000-4000-8000-000000000099',$2,$3,4,
        '2026-08-16T11:12:14Z',now()-interval '2 days',now()-interval '1 day'
      )
    `, [OWNER, COURSE, "b".repeat(64)]);
  }

  if (auditFinding) {
    await database.query(`
      insert into private.authoring_workspace_observations(
        id,workspace_id,author_id,entity_type,entity_path,body,kind
      ) values(
        '40000000-0000-4000-8000-000000000099',$1,$2,'lesson',
        array['course-legacy-a','module-a','lesson-a'],'Achado legado','audit_finding'
      )
    `, [WORKSPACE, OWNER]);
  }
  return database;
}

async function installMigration(database) {
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
}

test("#124 migra fatos legados sem inventar caminho, texto, estado ou instante", async (t) => {
  const database = await legacyDatabase();
  t.after(() => database.close());
  const legacySourcesBefore = await scalar(database, `
    select jsonb_build_object(
      'noteCount',(select count(*) from private.authoring_workspace_observations
        where kind='note'),
      'noteHash',(select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
        to_jsonb(observation) order by observation.id
      ),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
        from private.authoring_workspace_observations observation where kind='note'),
      'personalObservationCount',(select count(*)
        from public.legacy_trail_personal_states),
      'personalObservationHash',(select encode(extensions.digest(convert_to(
        coalesce(jsonb_agg(jsonb_build_object(
          'userId',user_id,'courseId',trail_item_id,'observations',state->'observations'
        ) order by user_id,trail_item_id),'[]'::jsonb)::text,'UTF8'
      ),'sha256'),'hex') from public.legacy_trail_personal_states)
    ) value
  `);
  await installMigration(database);

  const rows = (await database.query(`
    select id,origin,channel,target_kind,target_id,observed_path,raw_text,category,
      state,owner_response,captured_at,created_at,updated_at,
      observed_revision_certainty,automatic_method
    from private.course_anchored_annotations order by id
  `)).rows;
  assert.equal(rows.length, 4);
  const study = rows.find((row) => row.id === STUDY_ANNOTATION);
  const note = rows.find((row) => row.id === NOTE_ANNOTATION);
  assert.deepEqual(study.observed_path, [
    { kind: "course", id: COURSE, label: null, version: null },
    { kind: "study_unit", id: "unit-a", label: null, version: null }
  ]);
  assert.equal(study.raw_text, legacyObservation["unit-a"].body);
  assert.equal(study.category, "possible_error");
  assert.equal(study.state, "resolved");
  assert.equal(study.owner_response, "Resposta preservada");
  assert.equal(study.captured_at, null);
  assert.equal(new Date(study.created_at).toISOString(), "2026-08-15T12:00:00.000Z");
  assert.equal(new Date(study.updated_at).toISOString(), "2026-08-16T14:00:00.000Z");
  assert.equal(study.observed_revision_certainty, "legacy_unknown");
  assert.equal(study.automatic_method, "legacy_unclassified");
  assert.deepEqual(note.observed_path.map(({ kind, id, label, version }) => (
    { kind, id, label, version }
  )), [
    { kind: "course", id: COURSE, label: null, version: null },
    { kind: "module", id: "module-a", label: null, version: null },
    { kind: "lesson", id: "lesson-a", label: null, version: null },
    { kind: "didactic_microsequence", id: "micro-a", label: null, version: null },
    { kind: "study_unit", id: "unit-a", label: null, version: null }
  ]);
  assert.equal(note.raw_text, "Nota autoral preservada");
  assert.equal(note.origin, "author");
  assert.equal(note.channel, "unknown_legacy");
  const actorlessNote = rows.find((row) =>
    row.id === "40000000-0000-4000-8000-000000000003"
  );
  assert.equal(actorlessNote.origin, "author");
  assert.equal(actorlessNote.channel, "unknown_legacy");
  const answeredOpenThread = rows.find((row) =>
    row.id === "40000000-0000-4000-8000-000000000004"
  );
  assert.equal(answeredOpenThread.state, "considered");
  assert.equal(answeredOpenThread.owner_response, "Resposta em thread aberta");
  const legacySourcesAfter = await scalar(database, `
    select jsonb_build_object(
      'noteCount',(select count(*) from private.authoring_workspace_observations
        where kind='note'),
      'noteHash',(select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
        to_jsonb(observation) order by observation.id
      ),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
        from private.authoring_workspace_observations observation where kind='note'),
      'personalObservationCount',(select count(*)
        from public.legacy_trail_personal_states),
      'personalObservationHash',(select encode(extensions.digest(convert_to(
        coalesce(jsonb_agg(jsonb_build_object(
          'userId',user_id,'courseId',trail_item_id,'observations',state->'observations'
        ) order by user_id,trail_item_id),'[]'::jsonb)::text,'UTF8'
      ),'sha256'),'hex') from public.legacy_trail_personal_states)
    ) value
  `);
  assert.deepEqual(legacySourcesAfter, legacySourcesBefore);
  assert.equal(await scalar(database,
    "select (state->>'version')::integer value from public.course_personal_states"
  ), 2);
  assert.equal(await scalar(database,
    "select state ? 'observations' value from public.course_personal_states"
  ), false);
  assert.deepEqual(await scalar(database, `
    select state->'observations' value
    from public.legacy_trail_personal_states
  `), legacyObservation);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'requestId',correction_request_id,
      'path',correction_entity_path,
      'linkedAt',correction_linked_at,
      'revision',correction_resulting_revision,
      'response',response
    ) value from private.trail_observation_threads
  `), {
    requestId: "request.correction.legacy",
    path: ["course-legacy-a", "module-a", "lesson-a"],
    linkedAt: "2026-08-16T13:30:00+00:00",
    revision: 8,
    response: "Resposta preservada"
  });
  assert.equal(await scalar(database, `
    select protocol_version::integer value
    from private.course_personal_state_receipts
    where request_id='71000000-0000-4000-8000-000000000001'
  `), 1);
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_personal_state_receipts
    where request_id='71000000-0000-4000-8000-000000000099'
      and protocol_version=1 and expires_at<=statement_timestamp()
  `), 1);
  const manifest = await scalar(database,
    "select public.get_aralearn_runtime_manifest() value"
  );
  assert.equal(manifest.schemaRevision, "20260817200000");
  assert.equal(manifest.features.includes("course-personal-state-v1"), false);
  assert.equal(manifest.features.includes("course-personal-state-v2"), true);
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotations annotation
    where annotation.actor_id is not null and not exists(
      select 1 from private.course_anchored_annotation_viewer_versions viewer
      where viewer.course_id=annotation.course_id and viewer.actor_id=annotation.actor_id
    )
  `), 0);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'rls',relation.relrowsecurity,
      'forced',relation.relforcerowsecurity,
      'authenticatedSelect',has_table_privilege(
        'authenticated','private.course_anchored_annotation_viewer_versions','select'
      ),
      'serviceUpdate',has_table_privilege(
        'service_role','private.course_anchored_annotation_viewer_versions','update'
      )
    ) value
    from pg_class relation
    where relation.oid='private.course_anchored_annotation_viewer_versions'::regclass
  `), {
    rls: true,
    forced: true,
    authenticatedSelect: false,
    serviceUpdate: false
  });
});

test("#124 aborta atomicamente estado órfão e achado #125", async (t) => {
  const orphanDatabase = await legacyDatabase({ orphan: true });
  const auditDatabase = await legacyDatabase({ auditFinding: true });
  t.after(() => Promise.all([orphanDatabase.close(), auditDatabase.close()]));
  const migration = await fs.readFile(migrationUrl, "utf8");

  await assert.rejects(orphanDatabase.exec(migration), /divergem nas observações/u);
  await orphanDatabase.exec("rollback");
  assert.equal(await scalar(orphanDatabase,
    "select to_regclass('private.course_anchored_annotations') is null value"
  ), true);
  await assert.rejects(auditDatabase.exec(migration), /#125/u);
  await auditDatabase.exec("rollback");
  assert.equal(await scalar(auditDatabase, `
    select count(*)::integer value
    from private.authoring_workspace_observations where kind='audit_finding'
  `), 1);
  assert.equal(await scalar(auditDatabase,
    "select to_regclass('private.course_anchored_annotations') is null value"
  ), true);
});

test("#124 aplica classificação conservadora, privacidade, CAS e redação", async (t) => {
  const database = await legacyDatabase();
  t.after(() => database.close());
  await installMigration(database);
  await actor(database, LEARNER_B);

  const create = normalizeCourseAnchoredAnnotationCommand({
    type: "create_anchored_annotation",
    annotationId: "40000000-0000-4000-8000-000000000010",
    target: { kind: "study_unit", id: "unit-a" },
    rawText: "Isso está confuso.",
    category: "confusing",
    capturedAt: null,
    briefSummary: null
  });
  const changed = await scalar(database, `
    select public.execute_my_course_anchored_annotation_command_v1(
      $1,7,$2::jsonb,'request.study.0001'
    ) value
  `, [COURSE, JSON.stringify(create)]);
  normalizeCourseAnchoredAnnotationChange(changed);
  assert.equal(changed.contract, COURSE_ANCHORED_ANNOTATION_CHANGE_CONTRACT);
  assert.equal(changed.annotation.subjectClassification.status, "unclassified");
  assert.equal(changed.annotation.subjectClassification.automatic.method,
    "target_scope_unclassified");
  assert.deepEqual(changed.annotation.subjectClassification.automatic.subjects, []);
  assert.equal(changed.annotation.deepLink, null);
  assert.equal(changed.annotation.target.deepLink, null);

  const beforeForeignProbe = await scalar(database, `
    select jsonb_build_object(
      'annotations',(select count(*) from private.course_anchored_annotations),
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts),
      'setVersion',(select annotation_set_version from public.courses where id=$1)
    ) value
  `, [COURSE]);
  await actor(database, LEARNER_A);
  const foreignProbeErrors = [];
  for (const [annotationId, expectedAnnotationVersion, requestId] of [
    ["40000000-0000-4000-8000-000000000011", 1, "request.probe.missing"],
    [create.annotationId, 999, "request.probe.wrong-version"],
    [create.annotationId, 1, "request.probe.current-version"]
  ]) {
    try {
      await database.query(`
        select public.execute_my_course_anchored_annotation_command_v1(
          $1,null,$2::jsonb,$3
        ) value
      `, [COURSE, JSON.stringify({
        type: "revise_anchored_annotation",
        annotationId,
        expectedAnnotationVersion,
        rawText: "Tentativa sem autoridade.",
        category: null,
        briefSummary: null
      }), requestId]);
      assert.fail("A anotação alheia não pode ser sondada.");
    } catch (error) {
      foreignProbeErrors.push({ code: error.code, message: error.message });
    }
  }
  assert.deepEqual(foreignProbeErrors, [
    foreignProbeErrors[0], foreignProbeErrors[0], foreignProbeErrors[0]
  ]);
  assert.equal(
    foreignProbeErrors[0].code,
    "PGRST",
    JSON.stringify(foreignProbeErrors)
  );
  assert.match(foreignProbeErrors[0].message, /course_anchored_annotation_not_found/u);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'annotations',(select count(*) from private.course_anchored_annotations),
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts),
      'setVersion',(select annotation_set_version from public.courses where id=$1)
    ) value
  `, [COURSE]), beforeForeignProbe);

  const learnerASetVersion = (await scalar(database, `
    select public.get_my_course_anchored_annotations_v1(
      $1,7,null,'study_unit','unit-a',null,24
    ) value
  `, [COURSE])).annotationSetVersion;
  await actor(database, LEARNER_B);
  await scalar(database, `
    select public.execute_my_course_anchored_annotation_command_v1(
      $1,7,$2::jsonb,'request.study.private-set'
    ) value
  `, [COURSE, JSON.stringify({
    ...create,
    annotationId: "40000000-0000-4000-8000-000000000012",
    rawText: "Outra observação da pessoa B."
  })]);
  await actor(database, LEARNER_A);
  const learnerAAfterForeignChange = await scalar(database, `
    select public.get_my_course_anchored_annotations_v1(
      $1,7,$2,'study_unit','unit-a',null,24
    ) value
  `, [COURSE, learnerASetVersion]);
  assert.equal(learnerAAfterForeignChange.annotationSetVersion, learnerASetVersion);

  await database.exec(`
    insert into private.course_anchored_annotations(
      id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
      observed_course_revision,observed_target_version,observed_revision_certainty,
      raw_text,automatic_method,automatic_method_version,
      automatic_taxonomy_revision,automatic_subject_refs,effective_method,
      effective_method_version,effective_taxonomy_revision,effective_subject_refs
    ) values(
      '40000000-0000-4000-8000-000000000099','${COURSE}',null,
      'automatic_audit','audit_automation','topic','topic-dns',
      jsonb_build_array(
        jsonb_build_object('kind','course','id','${COURSE}','label','Curso de redes','version',7),
        jsonb_build_object('kind','module','id','module-a','label','Módulo A','version',2),
        jsonb_build_object('kind','lesson','id','lesson-a','label','Lição A','version',3),
        jsonb_build_object('kind','topic','id','topic-dns','label','DNS','version',4)
      ),7,4,'known','Achado automático','exact_topic_target',1,7,
      '[{"topicId":"topic-dns","label":"DNS","topicVersion":4}]',
      'exact_topic_target',1,7,
      '[{"topicId":"topic-dns","label":"DNS","topicVersion":4}]'
    );
    update public.courses set annotation_set_version=annotation_set_version+1
    where id='${COURSE}';
  `);
  const actorlessAutomatic = await scalar(database, `
    select private.course_anchored_annotation_item_v1(
      annotation,'${OWNER}',true
    ) value
    from private.course_anchored_annotations annotation
    where annotation.id='40000000-0000-4000-8000-000000000099'
  `);
  assert.equal(actorlessAutomatic.contributor.kind, "software");
  await database.exec(`
    update private.course_anchored_annotations set actor_id='${OWNER}'
    where id='40000000-0000-4000-8000-000000000099'
  `);

  await actor(database, OWNER, "service_role");
  const ownerPage = await scalar(database, `
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,null,'inbox','{}','{}','{}','{}',true,'{}',
      null,null,false,null,null,12
    ) value
  `, [OWNER, COURSE]);
  normalizeCourseAnchoredAnnotationPage(ownerPage);
  assert.equal(ownerPage.contract, COURSE_ANCHORED_ANNOTATION_PAGE_CONTRACT);
  const learnerItem = ownerPage.items.find((item) =>
    item.annotationId === create.annotationId
  );
  assert.equal(learnerItem.contract, COURSE_ANCHORED_ANNOTATION_CONTRACT);
  assert.equal(learnerItem.contributor.kind, "protected_person");
  assert.equal(learnerItem.contributor.role, "learner");
  assert.match(learnerItem.contributor.ref, /^person-[0-9a-f]{16}$/u);
  const predictableContributorRef = await scalar(database, `
    select 'person-'||substr(private.course_annotation_hash_v1(
      jsonb_build_object('courseId',$1::uuid,'actorId',$2::uuid)
    ),1,16) value
  `, [COURSE, LEARNER_B]);
  assert.notEqual(learnerItem.contributor.ref, predictableContributorRef);
  assert.equal("email" in learnerItem.contributor, false);
  const pageWith = (item) => ({
    ...structuredClone(ownerPage),
    items: [item],
    hasMore: false,
    nextCursor: null
  });
  const leakedWithdrawal = structuredClone(learnerItem);
  leakedWithdrawal.state = "withdrawn";
  leakedWithdrawal.rawText = null;
  leakedWithdrawal.briefSummary = "síntese que deveria ter sido redigida";
  leakedWithdrawal.ownerResponse = null;
  assert.throws(() => normalizeCourseAnchoredAnnotationPage(
    pageWith(leakedWithdrawal)
  ), CourseAnchoredAnnotationsError);
  for (const leakedRef of [null, LEARNER_A]) {
    const leakedContributor = structuredClone(learnerItem);
    leakedContributor.contributor.ref = leakedRef;
    assert.throws(() => normalizeCourseAnchoredAnnotationPage(
      pageWith(leakedContributor)
    ), CourseAnchoredAnnotationsError);
  }
  const automaticItem = ownerPage.items.find((item) =>
    item.annotationId === "40000000-0000-4000-8000-000000000099"
  );
  assert.deepEqual(automaticItem.contributor, {
    kind: "software", role: "auditor", ref: null, label: "Auditoria automática"
  });
  const wrongObservedCourse = structuredClone(ownerPage);
  wrongObservedCourse.items[0].target.observedPath[0].id =
    "20000000-0000-4000-8000-000000000099";
  assert.throws(() => normalizeCourseAnchoredAnnotationPage(wrongObservedCourse),
    CourseAnchoredAnnotationsError);
  const wrongCurrentTarget = structuredClone(ownerPage);
  wrongCurrentTarget.items[0].target.currentPath.at(-1).id = "outro-alvo";
  assert.throws(() => normalizeCourseAnchoredAnnotationPage(wrongCurrentTarget),
    CourseAnchoredAnnotationsError);
  const firstCursorPage = await scalar(database, `
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,null,'inbox','{}','{}','{}','{}',true,'{}',
      null,null,false,null,null,2
    ) value
  `, [OWNER, COURSE]);
  normalizeCourseAnchoredAnnotationPage(firstCursorPage);
  assert.equal(firstCursorPage.hasMore, true);
  assert.ok(firstCursorPage.nextCursor.length <= 240);
  assert.equal(firstCursorPage.summary.matchingTotal, ownerPage.items.length);
  const secondCursorPage = await scalar(database, `
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,$3,'inbox','{}','{}','{}','{}',true,'{}',
      null,null,false,null,$4,2
    ) value
  `, [OWNER, COURSE, firstCursorPage.annotationSetVersion, firstCursorPage.nextCursor]);
  normalizeCourseAnchoredAnnotationPage(secondCursorPage);
  assert.equal(secondCursorPage.summary.matchingTotal, firstCursorPage.summary.matchingTotal);
  assert.equal(firstCursorPage.items.some((item) => secondCursorPage.items.some(
    (nextItem) => nextItem.annotationId === item.annotationId
  )), false);
  const filteredPage = await scalar(database, `
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,null,'inbox',array['learner'],array['study_interface'],array['open'],
      array['confusing'],false,'{}',null,null,false,null,null,12
    ) value
  `, [OWNER, COURSE]);
  assert.deepEqual(normalizeCourseAnchoredAnnotationPage(filteredPage).summary, {
    matchingTotal: 2,
    byOrigin: { learner: 2 },
    byChannel: { study_interface: 2 },
    byState: { open: 2 },
    unclassifiedTotal: 2
  });

  const corrected = await scalar(database, `
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,7,$3::jsonb,'authoring_interface','request.correct.001'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "correct_anchored_annotation_subjects",
    annotationId: create.annotationId,
    expectedAnnotationVersion: 1,
    subjectIds: ["topic-dns"]
  })]);
  assert.equal(corrected.annotation.subjectClassification.automatic.status, undefined);
  assert.equal(corrected.annotation.subjectClassification.automatic.method,
    "target_scope_unclassified");
  assert.deepEqual(corrected.annotation.subjectClassification.effective.subjects.map(
    (subject) => subject.topicId
  ), ["topic-dns"]);
  await assert.rejects(database.query(`
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,$3,'inbox','{}','{}','{}','{}',true,'{}',
      null,null,false,null,$4,2
    ) value
  `, [OWNER, COURSE, firstCursorPage.annotationSetVersion, firstCursorPage.nextCursor]),
  (error) => error.code === "PGRST" && /"code": "40001"/u.test(error.message));
  assert.equal(await scalar(database, `
    select count(*)=count(distinct annotation_version) value
    from private.course_anchored_annotation_events where annotation_id=$1
  `, [create.annotationId]), true);
  await assert.rejects(database.query(`
    insert into private.course_anchored_annotation_events(
      course_id,annotation_id,annotation_version,event_type,actor_id,actor_role,
      event_hash,metadata
    ) values($1,$2,2,'classification_corrected',$3,'author',$4,'{}')
  `, [COURSE, create.annotationId, OWNER, "a".repeat(64)]),
  (error) => error.code === "23505");
  await database.query(`
    insert into public.courses(id,owner_id,title,goal,revision)
    values('20000000-0000-4000-8000-000000000099',$1,'Outro Curso','Meta',1)
  `, [OWNER]);
  await assert.rejects(database.query(`
    insert into private.course_anchored_annotation_events(
      course_id,annotation_id,annotation_version,event_type,actor_id,actor_role,
      event_hash,metadata
    ) values(
      '20000000-0000-4000-8000-000000000099',$1,99,'revised',$2,'author',$3,'{}'
    )
  `, [create.annotationId, OWNER, "b".repeat(64)]),
  (error) => error.code === "23503");

  await assert.rejects(database.query(`
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,null,$3::jsonb,'authoring_interface','request.stale.0001'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "resolve_anchored_annotation",
    annotationId: create.annotationId,
    expectedAnnotationVersion: 1
  })]), (error) => error.code === "PGRST" && /"code": "40001"/u.test(error.message));
  await assert.rejects(database.query(`
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,7,$3::jsonb,'authoring_interface','request.target.none'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "create_anchored_annotation",
    annotationId: "40000000-0000-4000-8000-000000000098",
    target: { kind: "study_unit", id: "unit-missing" },
    rawText: "alvo ausente",
    category: null,
    capturedAt: null,
    briefSummary: null
  })]), (error) => error.code === "PGRST" &&
    /course_anchored_annotation_target_not_found/u.test(error.message));
  await assert.rejects(database.query(`
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,7,$3::jsonb,'authoring_interface','request.shape.rev1'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "revise_anchored_annotation",
    annotationId: NOTE_ANNOTATION,
    expectedAnnotationVersion: 1,
    rawText: "não persistir",
    category: null,
    briefSummary: null
  })]), (error) => error.code === "22023");
  await assert.rejects(database.query(`
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,null,null,'{}','{}','{}','{}',true,'{}',
      null,null,false,null,null,null
    ) value
  `, [OWNER, COURSE]), (error) => error.code === "22023");
  await assert.rejects(database.query(`
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,-1,'inbox','{}','{}','{}','{}',true,'{}',
      null,null,false,null,null,12
    ) value
  `, [OWNER, COURSE]), (error) => error.code === "22023");
  await database.exec(`
    delete from private.course_entities
    where course_id='${COURSE}' and entity_type='study_unit' and entity_id='unit-a'
  `);
  const removedTargetPage = await scalar(database, `
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,null,'detail','{}','{}','{}','{}',true,'{}',
      null,null,false,$3,null,12
    ) value
  `, [OWNER, COURSE, create.annotationId]);
  const removedTarget = normalizeCourseAnchoredAnnotationPage(removedTargetPage).items[0];
  assert.equal(removedTarget.target.currentAvailable, false);
  assert.equal(removedTarget.target.currentPath, null);
  assert.equal(removedTarget.target.deepLink, null);
  assert.equal(removedTarget.target.observedPath.at(-1).id, "unit-a");

  const withdrawn = await scalar(database, `
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,null,$3::jsonb,'authoring_interface','request.withdraw.01'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "withdraw_anchored_annotation",
    annotationId: NOTE_ANNOTATION,
    expectedAnnotationVersion: 1
  })]);
  assert.equal(withdrawn.annotation.state, "withdrawn");
  assert.equal(withdrawn.annotation.rawText, null);
  assert.equal(withdrawn.annotation.ownerResponse, null);
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_anchored_annotation_events
    where metadata::text ~ '"(rawText|ownerResponse|briefSummary|body|response)"[[:space:]]*:'
  `), 0);

  await actor(database, LEARNER_B);
  const alreadyWithdrawn = await scalar(database, `
    select public.execute_my_course_anchored_annotation_command_v1(
      $1,null,$2::jsonb,'request.withdraw.predeleted'
    ) value
  `, [COURSE, JSON.stringify({
    type: "withdraw_anchored_annotation",
    annotationId: "40000000-0000-4000-8000-000000000012",
    expectedAnnotationVersion: 1
  })]);
  assert.equal(alreadyWithdrawn.annotation.annotationVersion, 2);
  const alreadyWithdrawnDeadline = await scalar(database, `
    select jsonb_build_object(
      'withdrawnAt',withdrawn_at,
      'hardDeleteAfter',hard_delete_after
    ) value from private.course_anchored_annotations
    where id='40000000-0000-4000-8000-000000000012'
  `);
  const setVersionBeforeAccountDeletion = await scalar(database, `
    select annotation_set_version value from public.courses where id='${COURSE}'
  `);

  await actor(database, OUTSIDER);
  await assert.rejects(database.query(`
    select public.get_my_course_anchored_annotations_v1(
      $1,7,null,'study_unit','unit-a',null,12
    ) value
  `, [COURSE]), (error) => error.code === "PT404");
  await database.query("delete from auth.users where id=$1", [LEARNER_B]);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'actorId',actor_id,'state',state,'rawText',raw_text,
      'response',owner_response,'summary',brief_summary
    ) value from private.course_anchored_annotations where id=$1
  `, [create.annotationId]), {
    actorId: null, state: "withdrawn", rawText: null,
    response: null, summary: null
  });
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_anchored_annotation_events
    where annotation_id=$1 and event_type='withdrawn'
  `, [create.annotationId]), 1);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'actorId',actor_id,'state',state,'version',version,
      'withdrawnAt',withdrawn_at,'hardDeleteAfter',hard_delete_after
    ) value from private.course_anchored_annotations
    where id='40000000-0000-4000-8000-000000000012'
  `), {
    actorId: null,
    state: "withdrawn",
    version: 3,
    ...alreadyWithdrawnDeadline
  });
  assert.equal(await scalar(database, `
    select annotation_set_version value from public.courses where id='${COURSE}'
  `), setVersionBeforeAccountDeletion + 2);
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotation_viewer_versions
    where actor_id='${LEARNER_B}'
  `), 0);
  await database.query("delete from public.courses where id=$1", [COURSE]);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'annotations',(select count(*) from private.course_anchored_annotations
        where course_id=$1),
      'events',(select count(*) from private.course_anchored_annotation_events
        where course_id=$1),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts
        where course_id=$1),
      'viewerVersions',(select count(*)
        from private.course_anchored_annotation_viewer_versions where course_id=$1)
    ) value
  `, [COURSE]), { annotations: 0, events: 0, receipts: 0, viewerVersions: 0 });
});

test("#123 registra nota e contestação em Fonte e exige proveniência na reformulação", async (t) => {
  const database = await legacyDatabase();
  t.after(() => database.close());
  await installMigration(database);
  await actor(database, OWNER, "service_role");

  const sourceAnnotationId = "40000000-0000-4000-8000-000000000081";
  const anchorAnnotationId = "40000000-0000-4000-8000-000000000082";
  const createSource = {
    type: "create_anchored_annotation",
    annotationId: sourceAnnotationId,
    target: { kind: "source", id: "source-a" },
    rawText: "Reformule a interpretação atribuída a esta Fonte.",
    category: "reformulation_request",
    capturedAt: "2026-08-20T12:00:00.000Z",
    briefSummary: null
  };
  const createAnchor = {
    ...createSource,
    annotationId: anchorAnnotationId,
    target: { kind: "source_anchor", id: "anchor-source-a" },
    rawText: "Este trecho não sustenta a interpretação apresentada.",
    category: "possible_error"
  };
  for (const [index, command] of [createSource, createAnchor].entries()) {
    const change = await scalar(database, `
      select public.execute_course_anchored_annotation_command_for_actor_v1(
        $1,$2,7,$3::jsonb,'authoring_interface',$4
      ) value
    `, [OWNER, COURSE, JSON.stringify(command), `request.source.note.000${index + 1}`]);
    normalizeCourseAnchoredAnnotationChange(change);
  }

  const sourcePage = await scalar(database, `
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,null,'target','{}','{}','{}','{}',true,'{}',
      'source','source-a',true,null,null,24
    ) value
  `, [OWNER, COURSE]);
  normalizeCourseAnchoredAnnotationPage(sourcePage);
  assert.deepEqual(sourcePage.items.map((item) => item.annotationId).sort(), [
    sourceAnnotationId,
    anchorAnnotationId
  ].sort());
  const sourceItem = sourcePage.items.find(({ annotationId }) =>
    annotationId === sourceAnnotationId
  );
  const anchorItem = sourcePage.items.find(({ annotationId }) =>
    annotationId === anchorAnnotationId
  );
  assert.deepEqual(sourceItem.target.observedPath.map(({ kind }) => kind), [
    "course", "source"
  ]);
  assert.deepEqual(anchorItem.target.observedPath.map(({ kind }) => kind), [
    "course", "source", "source_anchor"
  ]);
  assert.match(sourceItem.target.deepLink, /section=sources&sourceId=source-a/u);
  assert.match(anchorItem.target.deepLink, /anchorId=anchor-source-a/u);

  const consideredSourceLinks = [{
    sourceId: "source-a",
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-source-a", anchorRevision: 1 }]
  }];
  await assert.rejects(database.query(`
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,null,$3::jsonb,'authoring_interface','request.source.response.bad'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "respond_to_anchored_annotation",
    annotationId: sourceAnnotationId,
    expectedAnnotationVersion: 1,
    ownerResponse: "Texto reformulado.",
    responseKind: "reformulation",
    consideredSourceLinks: []
  })]), (error) => error.code === "22023");

  const reformulated = await scalar(database, `
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,null,$3::jsonb,'authoring_interface','request.source.response.good'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "respond_to_anchored_annotation",
    annotationId: sourceAnnotationId,
    expectedAnnotationVersion: 1,
    ownerResponse: "Texto reformulado com a distinção solicitada.",
    responseKind: "reformulation",
    consideredSourceLinks
  })]);
  normalizeCourseAnchoredAnnotationChange(reformulated);
  assert.deepEqual(reformulated.annotation.ownerResponse, {
    text: "Texto reformulado com a distinção solicitada.",
    kind: "reformulation",
    consideredSourceLinks,
    updatedAt: reformulated.annotation.timestamps.respondedAt
  });
});

test("#124 cerca quotas, versões, replay e CAS v2 sem escrita parcial", async (t) => {
  const database = await legacyDatabase();
  t.after(() => database.close());
  await installMigration(database);

  await database.exec(`
    insert into private.course_anchored_annotations(
      id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
      observed_course_revision,observed_target_version,observed_revision_certainty,
      raw_text,automatic_method,automatic_method_version,
      automatic_taxonomy_revision,effective_method,effective_method_version,
      effective_taxonomy_revision
    )
    select
      ('50000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '${COURSE}','${LEARNER_B}','learner','study_interface','study_unit','unit-a',
      jsonb_build_array(
        jsonb_build_object('kind','course','id','${COURSE}','label','Curso de redes','version',7),
        jsonb_build_object('kind','study_unit','id','unit-a','label','Unidade A','version',7)
      ),7,7,'known','quota',
      'target_scope_unclassified',1,7,'target_scope_unclassified',1,7
    from generate_series(1,128) value;
  `);
  await actor(database, LEARNER_B);
  const beforeTargetQuota = await scalar(database, `
    select jsonb_build_object(
      'annotations',(select count(*) from private.course_anchored_annotations
        where actor_id='${LEARNER_B}' and target_id='unit-a'),
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts),
      'setVersion',(select annotation_set_version from public.courses where id='${COURSE}')
    ) value
  `);
  await assert.rejects(database.query(`
    select public.execute_my_course_anchored_annotation_command_v1(
      $1,7,$2::jsonb,'request.quota.0129'
    ) value
  `, [COURSE, JSON.stringify({
    type: "create_anchored_annotation",
    annotationId: "70000000-0000-4000-8000-000000000129",
    target: { kind: "study_unit", id: "unit-a" },
    rawText: "centésima vigésima nona",
    category: null,
    capturedAt: null,
    briefSummary: null
  })]), (error) => error.code === "54000");
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'annotations',(select count(*) from private.course_anchored_annotations
        where actor_id='${LEARNER_B}' and target_id='unit-a'),
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts),
      'setVersion',(select annotation_set_version from public.courses where id='${COURSE}')
    ) value
  `), beforeTargetQuota);

  await database.exec(`
    insert into private.course_anchored_annotation_receipts(
      actor_id,request_id,course_id,annotation_id,operation,request_hash,
      result_annotation_version,result_annotation_set_version,result_changed
    )
    select '${LEARNER_B}','receipt.cap.'||lpad(value::text,4,'0'),'${COURSE}',
      '50000000-0000-4000-8000-000000000001','revise_anchored_annotation',
      repeat('a',64),1,0,false
    from generate_series(1,1024) value;
  `);
  const receiptBoundedSnapshot = await scalar(database, `
    select jsonb_build_object(
      'version',version,'state',state,
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts)
    ) value from private.course_anchored_annotations
    where id='50000000-0000-4000-8000-000000000001'
  `);
  await assert.rejects(database.query(`
    select public.execute_my_course_anchored_annotation_command_v1(
      $1,null,$2::jsonb,'request.receipt.cap'
    ) value
  `, [COURSE, JSON.stringify({
    type: "revise_anchored_annotation",
    annotationId: "50000000-0000-4000-8000-000000000001",
    expectedAnnotationVersion: 1,
    rawText: "não persistir após o teto",
    category: null,
    briefSummary: null
  })]), (error) => error.code === "54000");
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'version',version,'state',state,
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts)
    ) value from private.course_anchored_annotations
    where id='50000000-0000-4000-8000-000000000001'
  `), receiptBoundedSnapshot);
  const boundedWithdrawal = await scalar(database, `
    select public.execute_my_course_anchored_annotation_command_v1(
      $1,null,$2::jsonb,'request.receipt.withdraw'
    ) value
  `, [COURSE, JSON.stringify({
    type: "withdraw_anchored_annotation",
    annotationId: "50000000-0000-4000-8000-000000000001",
    expectedAnnotationVersion: 1
  })]);
  assert.equal(boundedWithdrawal.annotation.state, "withdrawn");
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotation_receipts
    where actor_id='${LEARNER_B}' and course_id='${COURSE}'
  `), 1025);

  await database.exec(`
    insert into private.course_anchored_annotations(
      id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
      observed_course_revision,observed_target_version,observed_revision_certainty,
      raw_text,automatic_method,automatic_method_version,
      automatic_taxonomy_revision,effective_method,effective_method_version,
      effective_taxonomy_revision
    )
    select
      ('60000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '${COURSE}','${LEARNER_A}','learner','study_interface',
      case when value<=128 then 'course'
        when value<=256 then 'module'
        when value<=384 then 'lesson' else 'topic' end,
      case when value<=128 then '${COURSE}'
        when value<=256 then 'module-a'
        when value<=384 then 'lesson-a' else 'topic-dns' end,
      case when value<=128 then jsonb_build_array(
        jsonb_build_object('kind','course','id','${COURSE}','label','Curso de redes','version',7)
      ) when value<=256 then jsonb_build_array(
        jsonb_build_object('kind','course','id','${COURSE}','label','Curso de redes','version',7),
        jsonb_build_object('kind','module','id','module-a','label','Módulo A','version',2)
      ) when value<=384 then jsonb_build_array(
        jsonb_build_object('kind','course','id','${COURSE}','label','Curso de redes','version',7),
        jsonb_build_object('kind','module','id','module-a','label','Módulo A','version',2),
        jsonb_build_object('kind','lesson','id','lesson-a','label','Lição A','version',3)
      ) else jsonb_build_array(
        jsonb_build_object('kind','course','id','${COURSE}','label','Curso de redes','version',7),
        jsonb_build_object('kind','module','id','module-a','label','Módulo A','version',2),
        jsonb_build_object('kind','lesson','id','lesson-a','label','Lição A','version',3),
        jsonb_build_object('kind','topic','id','topic-dns','label','DNS','version',4)
      ) end,
      7,case when value<=128 then 7 when value<=256 then 2
        when value<=384 then 3 else 4 end,'known','quota',
      case when value>384 then 'exact_topic_target' else 'target_scope_unclassified' end,
      1,7,
      case when value>384 then 'exact_topic_target' else 'target_scope_unclassified' end,
      1,7
    from generate_series(1,510) value;
  `);
  await actor(database, LEARNER_A);
  await assert.rejects(database.query(`
    select public.execute_my_course_anchored_annotation_command_v1(
      $1,7,$2::jsonb,'request.quota.0513'
    ) value
  `, [COURSE, JSON.stringify({
    type: "create_anchored_annotation",
    annotationId: "70000000-0000-4000-8000-000000000513",
    target: { kind: "study_unit", id: "unit-a" },
    rawText: "quingentésima décima terceira",
    category: null,
    capturedAt: null,
    briefSummary: null
  })]), (error) => error.code === "54000");
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_anchored_annotations
    where actor_id='${LEARNER_A}'
  `), 512);
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_anchored_annotation_receipts
    where request_id='request.quota.0513'
  `), 0);

  await actor(database, OWNER, "service_role");
  const replayCommand = {
    type: "create_anchored_annotation",
    annotationId: "70000000-0000-4000-8000-000000000001",
    target: { kind: "topic", id: "topic-dhcp" },
    rawText: "Anotação no limite",
    category: null,
    capturedAt: null,
    briefSummary: null
  };
  await scalar(database, `
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,7,$3::jsonb,'authoring_interface','request.limit.0001'
    ) value
  `, [OWNER, COURSE, JSON.stringify(replayCommand)]);
  await database.query(`
    update private.course_anchored_annotations set version=256
    where id=$1
  `, [replayCommand.annotationId]);
  const eventsAtLimit = await scalar(database, `
    select count(*)::integer value from private.course_anchored_annotation_events
    where annotation_id=$1
  `, [replayCommand.annotationId]);
  const replay = await scalar(database, `
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,7,$3::jsonb,'authoring_interface','request.limit.0001'
    ) value
  `, [OWNER, COURSE, JSON.stringify(replayCommand)]);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.annotation.annotationVersion, 256);
  assert.equal(await scalar(database, `
    select count(*)::integer value from private.course_anchored_annotation_events
    where annotation_id=$1
  `, [replayCommand.annotationId]), eventsAtLimit);

  const beforeVersionFailure = await scalar(database, `
    select jsonb_build_object(
      'version',version,
      'events',(select count(*) from private.course_anchored_annotation_events
        where annotation_id=$1),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts
        where annotation_id=$1),
      'setVersion',(select annotation_set_version from public.courses where id='${COURSE}')
    ) value from private.course_anchored_annotations where id=$1
  `, [replayCommand.annotationId]);
  await assert.rejects(database.query(`
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,null,$3::jsonb,'authoring_interface','request.limit.0002'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "consider_anchored_annotation",
    annotationId: replayCommand.annotationId,
    expectedAnnotationVersion: 256
  })]), (error) => error.code === "54000");
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'version',version,
      'events',(select count(*) from private.course_anchored_annotation_events
        where annotation_id=$1),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts
        where annotation_id=$1),
      'setVersion',(select annotation_set_version from public.courses where id='${COURSE}')
    ) value from private.course_anchored_annotations where id=$1
  `, [replayCommand.annotationId]), beforeVersionFailure);
  const terminal = await scalar(database, `
    select public.execute_course_anchored_annotation_command_for_actor_v1(
      $1,$2,null,$3::jsonb,'authoring_interface','request.limit.0003'
    ) value
  `, [OWNER, COURSE, JSON.stringify({
    type: "withdraw_anchored_annotation",
    annotationId: replayCommand.annotationId,
    expectedAnnotationVersion: 256
  })]);
  assert.equal(terminal.annotation.annotationVersion, 257);
  assert.equal(terminal.annotation.state, "withdrawn");

  const countsBeforeInvalid = await scalar(database, `
    select jsonb_build_object(
      'annotations',(select count(*) from private.course_anchored_annotations),
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts)
    ) value
  `);
  for (const [annotationId, capturedAt, requestId] of [
    ["00000000-0000-0000-0000-000000000000", null, "request.invalid.id"],
    ["70000000-0000-4000-8000-000000000020", "infinity", "request.invalid.at"],
    ["70000000-0000-4000-8000-000000000021", "2026-08-17 10:00:00Z", "request.invalid.rfc"]
  ]) {
    await assert.rejects(database.query(`
      select public.execute_course_anchored_annotation_command_for_actor_v1(
        $1,$2,7,$3::jsonb,'authoring_interface',$4
      ) value
    `, [OWNER, COURSE, JSON.stringify({
      type: "create_anchored_annotation",
      annotationId,
      target: { kind: "topic", id: "topic-dns" },
      rawText: "não persistir",
      category: null,
      capturedAt,
      briefSummary: null
    }), requestId]), (error) => error.code === "22023");
  }
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'annotations',(select count(*) from private.course_anchored_annotations),
      'events',(select count(*) from private.course_anchored_annotation_events),
      'receipts',(select count(*) from private.course_anchored_annotation_receipts)
    ) value
  `), countsBeforeInvalid);

  await actor(database, LEARNER_B);
  await scalar(database, `
    select public.mutate_course_personal_state_v2(
      $1,0,$2::jsonb,'71000000-0000-4000-8000-000000000001'
    ) value
  `, [COURSE, JSON.stringify([
    {
      kind: "set",
      collection: "reviewMarks",
      path: "unit-a",
      value: "2026-08-20T12:00:00.000Z"
    }
  ])]);
  await assert.rejects(database.query(`
    select public.mutate_course_personal_state_v2(
      $1,0,$2::jsonb,'71000000-0000-4000-8000-000000000002'
    ) value
  `, [COURSE, JSON.stringify([
    {
      kind: "set",
      collection: "reviewMarks",
      path: "unit-b",
      value: "2026-08-20T12:01:00.000Z"
    }
  ])]), (error) => error.code === "PGRST" && /"code": "40001"/u.test(error.message));
  assert.equal(await scalar(database, `
    select revision value from public.course_personal_states
    where user_id='${LEARNER_B}' and course_id='${COURSE}'
  `), 1);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'v1',count(*) filter(where protocol_version=1),
      'v2',count(*) filter(where protocol_version=2),
      'sameRequest',count(distinct request_id)
    ) value from private.course_personal_state_receipts
    where user_id='${LEARNER_B}'
  `), { v1: 1, v2: 1, sameRequest: 1 });
  const personalBeforeInvalid = await scalar(database, `
    select jsonb_build_object(
      'state',(select state from public.course_personal_states
        where user_id='${LEARNER_B}' and course_id='${COURSE}'),
      'receipts',(select count(*) from private.course_personal_state_receipts
        where user_id='${LEARNER_B}')
    ) value
  `);
  const invalidOperations = [
    { collection: "reviewMarks", path: "unit-a" },
    { kind: "delete", path: "unit-a" },
    { kind: "delete", collection: "reviewMarks" },
    { kind: "set", collection: "reviewMarks", path: "unit-a" }
  ];
  for (const [index, operation] of invalidOperations.entries()) {
    await assert.rejects(database.query(`
      select public.mutate_course_personal_state_v2(
        $1,1,$2::jsonb,$3
      ) value
    `, [
      COURSE,
      JSON.stringify([operation]),
      `72000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    ]), (error) => error.code === "22023");
  }
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'state',(select state from public.course_personal_states
        where user_id='${LEARNER_B}' and course_id='${COURSE}'),
      'receipts',(select count(*) from private.course_personal_state_receipts
        where user_id='${LEARNER_B}')
    ) value
  `), personalBeforeInvalid);
});

test("#124 oculta expirados e limita a limpeza física por leitura", async (t) => {
  const database = await legacyDatabase();
  t.after(() => database.close());
  await installMigration(database);

  const liveBefore = await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotations annotation
    where annotation.course_id='${COURSE}'
      and (annotation.hard_delete_after is null
        or annotation.hard_delete_after>statement_timestamp())
  `);
  const setVersionBefore = await scalar(database, `
    select annotation_set_version value from public.courses where id='${COURSE}'
  `);
  await database.exec(`
    insert into private.course_anchored_annotations(
      id,course_id,actor_id,origin,channel,target_kind,target_id,observed_path,
      observed_course_revision,observed_target_version,observed_revision_certainty,
      raw_text,automatic_method,automatic_method_version,
      automatic_taxonomy_revision,effective_method,effective_method_version,
      effective_taxonomy_revision,state,withdrawn_at,hard_delete_after
    )
    select
      ('73000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '${COURSE}','${LEARNER_A}','learner','study_interface','study_unit','unit-a',
      jsonb_build_array(
        jsonb_build_object('kind','course','id','${COURSE}',
          'label','Curso de redes','version',7),
        jsonb_build_object('kind','study_unit','id','unit-a',
          'label','Unidade A','version',7)
      ),7,7,'known',null,'target_scope_unclassified',1,7,
      'target_scope_unclassified',1,7,'withdrawn',
      statement_timestamp()-interval '15 days',
      statement_timestamp()-interval '1 day'
    from generate_series(1,384) value;
    insert into private.course_anchored_annotation_receipts(
      actor_id,request_id,course_id,annotation_id,operation,request_hash,
      result_annotation_version,result_annotation_set_version,result_changed,
      created_at,expires_at
    )
    select '${OWNER}','expired.receipt.'||lpad(value::text,4,'0'),'${COURSE}',
      '${NOTE_ANNOTATION}','consider_anchored_annotation',repeat('a',64),
      1,0,false,statement_timestamp()-interval '15 days',
      statement_timestamp()-interval '1 day'
    from generate_series(1,600) value;
  `);

  await actor(database, OWNER, "service_role");
  const page = await scalar(database, `
    select public.get_owned_course_anchored_annotations_for_actor_v1(
      $1,$2,7,null,'inbox','{}','{}','{}','{}',true,'{}',
      null,null,false,null,null,24
    ) value
  `, [OWNER, COURSE]);
  normalizeCourseAnchoredAnnotationPage(page);
  assert.equal(page.summary.matchingTotal, liveBefore);
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotations annotation
    where annotation.course_id='${COURSE}'
      and annotation.hard_delete_after<=statement_timestamp()
  `), 256);
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotation_receipts receipt
    where receipt.course_id='${COURSE}'
      and receipt.expires_at<=statement_timestamp()
  `), 344);
  assert.equal(await scalar(database, `
    select annotation_set_version value from public.courses where id='${COURSE}'
  `), setVersionBefore + 128);
  for (let index = 0; index < 2; index += 1) {
    const nextPage = await scalar(database, `
      select public.get_owned_course_anchored_annotations_for_actor_v1(
        $1,$2,7,null,'inbox','{}','{}','{}','{}',true,'{}',
        null,null,false,null,null,24
      ) value
    `, [OWNER, COURSE]);
    normalizeCourseAnchoredAnnotationPage(nextPage);
    assert.equal(nextPage.summary.matchingTotal, liveBefore);
  }
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotations annotation
    where annotation.course_id='${COURSE}'
      and annotation.hard_delete_after<=statement_timestamp()
  `), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer value
    from private.course_anchored_annotation_receipts receipt
    where receipt.course_id='${COURSE}'
      and receipt.expires_at<=statement_timestamp()
  `), 0);
  assert.equal(await scalar(database, `
    select annotation_set_version value from public.courses where id='${COURSE}'
  `), setVersionBefore + 384);
  const coreDefinition = await scalar(database, `
    select pg_get_functiondef(
      'private.execute_course_anchored_annotation_command_core_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean)'::regprocedure
    ) value
  `);
  assert.match(coreDefinition, /from auth\.users actor[\s\S]*for key share/iu);
});

test("#124 normalizadores clonam DTOs e fecham modos, cursores e limites Unicode/bytes", () => {
  const query = {
    mode: "detail",
    origins: [], channels: [], states: [], categories: [],
    includeUncategorized: true, subjectIds: [], hierarchy: null,
    annotationId: STUDY_ANNOTATION
  };
  const normalizedQuery = normalizeCourseAnchoredAnnotationQuery(query);
  assert.notEqual(normalizedQuery, query);
  assert.deepEqual(normalizedQuery, query);
  assert.throws(() => normalizeCourseAnchoredAnnotationQuery({
    ...query,
    hierarchy: { target: { kind: "study_unit", id: "unit-a" }, includeDescendants: false }
  }), CourseAnchoredAnnotationsError);
  assert.throws(() => normalizeCourseAnchoredAnnotationReadOptions({
    expectedCourseRevision: 7,
    annotationSetVersion: null,
    query,
    cursor: "x".repeat(241),
    limit: 12
  }), CourseAnchoredAnnotationsError);
  assert.throws(() => normalizeCourseAnchoredAnnotationCommand({
    type: "create_anchored_annotation",
    annotationId: STUDY_ANNOTATION,
    target: { kind: "study_unit", id: "unit-a" },
    rawText: "😀".repeat(2001),
    category: null,
    capturedAt: null,
    briefSummary: null
  }), CourseAnchoredAnnotationsError);
  assert.throws(() => normalizeCourseAnchoredAnnotationCommand({
    type: "create_anchored_annotation",
    annotationId: STUDY_ANNOTATION,
    target: { kind: "study_unit", id: "unit-a" },
    rawText: "instante amplo demais",
    category: null,
    capturedAt: "2026-08-17 10:00:00Z",
    briefSummary: null
  }), CourseAnchoredAnnotationsError);
  assert.throws(() => normalizeCourseAnchoredAnnotationCommand({
    type: "create_anchored_annotation",
    annotationId: STUDY_ANNOTATION,
    target: { kind: "study_unit", id: "unit-a" },
    rawText: `${"😀".repeat(2000)}${"a".repeat(9000)}`,
    category: null,
    capturedAt: null,
    briefSummary: null
  }), CourseAnchoredAnnotationsError);
  assert.throws(() => normalizeCourseAnchoredAnnotationCommand({
    type: "create_anchored_annotation",
    annotationId: STUDY_ANNOTATION,
    target: { kind: "study_unit", id: "unit-a" },
    rawText: "controle\u0085inválido",
    category: null,
    capturedAt: null,
    briefSummary: null
  }), CourseAnchoredAnnotationsError);
  const literalSourceId = `  Fonte ${"x".repeat(260)}  `;
  assert.equal(normalizeCourseAnchoredAnnotationCommand({
    type: "create_anchored_annotation",
    annotationId: STUDY_ANNOTATION,
    target: { kind: "source", id: literalSourceId },
    rawText: "Nota sobre a Fonte.",
    category: "reformulation_request",
    capturedAt: null,
    briefSummary: null
  }).target.id, literalSourceId);
  assert.throws(() => normalizeCourseAnchoredAnnotationCommand({
    type: "create_anchored_annotation",
    annotationId: STUDY_ANNOTATION,
    target: { kind: "source", id: "   " },
    rawText: "Nota sobre a Fonte.",
    category: null,
    capturedAt: null,
    briefSummary: null
  }), CourseAnchoredAnnotationsError);
  assert.throws(() => normalizeCourseAnchoredAnnotationCommand({
    type: "respond_to_anchored_annotation",
    annotationId: STUDY_ANNOTATION,
    expectedAnnotationVersion: 1,
    ownerResponse: "Texto reformulado.",
    responseKind: "reformulation",
    consideredSourceLinks: []
  }), CourseAnchoredAnnotationsError);
});
