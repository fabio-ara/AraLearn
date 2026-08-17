import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  normalizeCourseDesignRead
} from "../../src/domain/courseDesignParameters.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260817160000_course_authoring_plan.sql",
  import.meta.url
);
const studyUnitInspectionMigrationUrl = new URL(
  "../../supabase/migrations/20260817170000_course_study_unit_inspection.sql",
  import.meta.url
);
const courseDesignMigrationUrl = new URL(
  "../../supabase/migrations/20260817180000_course_design_parameters.sql",
  import.meta.url
);

const OWNER = "00000000-0000-4000-8000-000000000001";
const LEARNER = "00000000-0000-4000-8000-000000000002";
const COURSE = "10000000-0000-4000-8000-000000000001";
const PLAN_ITEM = "20000000-0000-4000-8000-000000000001";
const MATERIALIZATION = "30000000-0000-4000-8000-000000000001";
const STEPS = [
  "40000000-0000-4000-8000-000000000001",
  "40000000-0000-4000-8000-000000000002",
  "40000000-0000-4000-8000-000000000003"
];
const DESIGN_ANALYSIS_IDS = Array.from(
  { length: 7 },
  (_, index) => `51000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const DESIGN_EVIDENCE_ID = "52000000-0000-4000-8000-000000000001";
const DESIGN_EVIDENCE_ID_B = "52000000-0000-4000-8000-000000000002";
const DESIGN_FORMS = [
  "plain_definition", "concrete_example", "mechanism", "contrast"
];

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function actor(database, actorId, role = "authenticated") {
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actorId]);
  await database.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
}

async function databaseFixture({
  decisions = [],
  mandate = null,
  microsequenceIds = ["micro-a"],
  authoringParts = null,
  brief = "Usar exemplos contrastivos."
} = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema extensions;
    create schema storage;

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
      select decode(md5(convert_from($1,'UTF8')) || md5(convert_from($1,'UTF8')),'hex')
    $$;
    create function extensions.gen_random_uuid() returns uuid
      language sql volatile as $$ select pg_catalog.gen_random_uuid() $$;

    create table auth.users(id uuid primary key, email text unique);
    insert into auth.users values
      ('${OWNER}','owner@example.test'),
      ('${LEARNER}','learner@example.test');

    create table storage.objects(
      id uuid primary key default pg_catalog.gen_random_uuid(),
      bucket_id text not null,
      name text not null
    );

    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      title text not null,
      goal text not null,
      brief text not null default '',
      revision bigint not null default 1,
      authoring_state jsonb not null default
        '{"version":1,"parts":[],"decisions":[],"mandate":null}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint courses_title_v1 check(
        nullif(btrim(title),'') is not null and char_length(title)<=300
      ),
      constraint courses_goal_v1 check(
        nullif(btrim(goal),'') is not null and char_length(goal)<=2000
      ),
      constraint courses_brief_v1 check(char_length(brief)<=16384),
      constraint courses_revision_v1 check(revision>0),
      constraint courses_authoring_state_v1 check(
        jsonb_typeof(authoring_state)='object'
      )
    );

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
      primary key(course_id,entity_type,entity_id),
      constraint course_entities_type_v1 check(entity_type in(
        'module','lesson','topic','microsequence','card'
      )),
      constraint course_entities_parent_v1 check(
        (entity_type='module' and parent_type is null and parent_id is null)
        or (entity_type='lesson' and parent_type='module' and parent_id is not null)
        or (entity_type='topic' and parent_type='lesson' and parent_id is not null)
        or (entity_type='microsequence' and parent_type='lesson' and parent_id is not null)
        or (entity_type='card' and parent_type='microsequence' and parent_id is not null)
      ),
      constraint course_entities_position_v1 check(
        (entity_type='card' and position>0)
        or (entity_type<>'card' and position>=0)
      ),
      constraint course_entities_content_v1 check(
        jsonb_typeof(content)='object' and pg_column_size(content)<=1048576
      ),
      constraint course_entities_sibling_position_v1 unique nulls not distinct(
        course_id,parent_type,parent_id,entity_type,position
      ) deferrable initially deferred,
      constraint course_entities_parent_fk_v1 foreign key(
        course_id,parent_type,parent_id
      ) references private.course_entities(course_id,entity_type,entity_id)
        on delete cascade deferrable initially deferred
    );
    create index course_entities_parent_v1_idx on private.course_entities(
      course_id,parent_type,parent_id,entity_type,position,entity_id
    );

    create table public.course_access(
      course_id uuid not null references public.courses(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      granted_by uuid not null references auth.users(id),
      primary key(course_id,user_id)
    );
    create table public.course_personal_states(
      user_id uuid not null references auth.users(id) on delete cascade,
      course_id uuid not null references public.courses(id) on delete cascade,
      revision bigint not null default 1,
      state jsonb not null,
      updated_at timestamptz not null default now(),
      primary key(user_id,course_id)
    );
    create table private.course_events(
      id bigint generated by default as identity primary key,
      course_id uuid not null references public.courses(id) on delete cascade,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      constraint course_events_operation_v2 check(operation in(
        'create_course','update_course_metadata','replace_course_composition',
        'grant_course_access','revoke_course_access'
      )),
      constraint course_events_summary_v2 check(
        jsonb_typeof(summary)='object' and pg_column_size(summary)<=32768
      )
    );
    create table private.course_change_receipts(
      actor_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      operation text not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      request_hash text not null,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now()+interval '14 days',
      primary key(actor_id,request_id),
      constraint course_change_receipts_operation_v2 check(operation in(
        'create','update_metadata','commit_entities','grant_access','revoke_access'
      ))
    );

    create function private.course_ownership_v1(p_course_id uuid,p_actor_id uuid)
      returns text language sql stable security definer
      set search_path=pg_catalog,public as $$
      select case when course.owner_id=p_actor_id then 'owned' else 'shared' end
      from public.courses course
      left join public.course_access access_value
        on access_value.course_id=course.id and access_value.user_id=p_actor_id
      where course.id=p_course_id and p_actor_id is not null
        and (course.owner_id=p_actor_id or access_value.user_id is not null)
    $$;
    create function private.require_course_access_v1(
      p_course_id uuid,p_actor_id uuid,p_require_owner boolean default false
    ) returns text language plpgsql stable security definer
      set search_path=pg_catalog,private as $$
    declare ownership text;
    begin
      ownership:=private.course_ownership_v1(p_course_id,p_actor_id);
      if ownership is null then raise exception 'Curso inexistente' using errcode='PT404'; end if;
      if p_require_owner and ownership<>'owned' then
        raise exception 'Edição não autorizada' using errcode='42501';
      end if;
      return ownership;
    end $$;

    create function private.list_courses_for_actor_v1(
      uuid,text,integer,timestamptz,uuid
    ) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function private.get_course_for_actor_v1(uuid,uuid,boolean)
      returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function private.list_course_entities_for_actor_v1(
      uuid,uuid,bigint,integer,text,text
    ) returns jsonb language sql stable as $$
      select jsonb_build_object('entityType','card')
    $$;
    create function private.list_course_review_items_for_actor_v1(
      uuid,integer,timestamptz,uuid,text
    ) returns jsonb language sql stable as $$
      select jsonb_build_object('entityType','card')
    $$;
    create function public.list_owned_courses_for_actor_v1(
      uuid,text,integer,timestamptz,uuid
    ) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function public.create_course_for_actor_v1(
      uuid,text,text,text,text
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.commit_course_changes_for_actor_v1(
      uuid,uuid,bigint,text,text,text,text,jsonb,jsonb,jsonb,text
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.get_aralearn_runtime_manifest() returns jsonb
      language sql stable security definer set search_path=pg_catalog as $$
      select jsonb_build_object(
        'schemaRevision','20260817150000',
        'contractVersion',1,
        'features',jsonb_build_array(
          'flat-runtime-manifest-v1','single-live-course-identity-v1',
          'course-cas-idempotency-v1','study-only-course-access-v1'
        )
      )
    $$;
  `);
  const legacyParts = authoringParts || [
    { id: "part-a", title: "Fundamentos", microsequenceIds }
  ];
  await database.query(`
    insert into public.courses(
      id,owner_id,title,goal,brief,revision,authoring_state
    ) values($1,$2,'Curso de relações','Analisar relações.',
      $3,4,$4::jsonb)
  `, [COURSE, OWNER, brief, JSON.stringify({
    version: 1,
    parts: legacyParts,
    decisions,
    mandate
  })]);
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ($1,'module','module-a',null,null,0,'{"title":"Módulo A"}'),
      ($1,'lesson','lesson-a','module','module-a',0,'{"title":"Lição A"}'),
      ($1,'microsequence','micro-a','lesson','lesson-a',0,
        '{"title":"Micro A","dependsOn":[]}'),
      ($1,'card','card-a','microsequence','micro-a',1,'{"title":"Unidade A"}')
  `, [COURSE]);
  return database;
}

async function applyMigration(database) {
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
}

async function applyStudyUnitInspectionMigration(database) {
  await database.exec(await fs.readFile(studyUnitInspectionMigrationUrl, "utf8"));
}

async function applyCourseDesignMigration(database, {
  nonEmptyLegacyState = false,
  corruptLegacyCatalog = false,
  pre1800Materialization = false
} = {}) {
  await database.exec(`
    create table private.authoring_design_parameter_definitions(
      parameter_id text primary key,
      parameter_version text not null,
      catalog_version text not null
    );
    insert into private.authoring_design_parameter_definitions values
      ('accepted_performance_forms','1.0.0','1.0.0'),
      ('applicable_explanation_requirement_refs','1.0.0','1.0.0'),
      ('available_resource_set_refs','1.0.0','1.0.0'),
      ('distinct_practice_opportunities_per_evidence_requirement','1.0.0','1.0.0'),
      ('evidence_alignment_relation','1.0.0','1.0.0'),
      ('new_units_per_theory_step_ceiling','1.0.0','1.0.0'),
      ('practice_variation_dimensions','1.0.0','1.0.0'),
      ('representation_fallback_policy','1.0.0','1.0.0'),
      ('simultaneous_new_units_per_coordination_set_ceiling','1.0.0','1.0.0');
    create table private.authoring_instructional_analyses(id integer);
    create table private.authoring_design_parameter_assignments(id integer);
    create table private.authoring_resource_sets(id integer);
    create table private.authoring_effective_design_snapshots(id integer);
    create table private.authoring_pedagogical_blueprints(id integer);
    create table private.authoring_pedagogical_blueprint_bindings(id integer);
    create table private.authoring_microsequence_design_bindings(id integer);
    create table private.authoring_materialization_states(id integer);
    create table private.authoring_materialization_manifests(id integer);
  `);
  if (nonEmptyLegacyState) {
    await database.exec(`
      insert into private.authoring_design_parameter_assignments values(1)
    `);
  }
  if (corruptLegacyCatalog) {
    await database.exec(`
      update private.authoring_design_parameter_definitions
      set catalog_version='2.0.0'
      where parameter_id='accepted_performance_forms'
    `);
  }
  if (pre1800Materialization) {
    await database.exec(`
      insert into private.course_authoring_part_materializations(
        id,course_id,authoring_part_id,authoring_part_version,
        actor_id,channel,status,design_context,result_facts,completed_at
      )
      select '59000000-0000-4000-8000-000000000001',
        part.course_id,part.id,part.version,
        '${OWNER}','application','completed','{}','{}',now()
      from private.course_authoring_parts part
      where part.course_id='${COURSE}' and part.retired_at is null
      order by part.position
      limit 1;
      insert into private.course_authoring_part_materialization_steps(
        id,course_id,materialization_id,position,step_kind,
        target_didactic_microsequence_id,production_position,
        status,result_facts,completed_at
      ) values(
        '59000000-0000-4000-8000-000000000002','${COURSE}',
        '59000000-0000-4000-8000-000000000001',0,'context_load',
        null,null,'completed','{}',now()
      );
    `);
  }
  await database.exec(await fs.readFile(courseDesignMigrationUrl, "utf8"));
}

function materializationApplication({
  contextHash,
  prefix = "designed",
  componentRef,
  didacticMicrosequenceId = "micro-a",
  analysisIds = DESIGN_ANALYSIS_IDS,
  evidenceRequirementId = DESIGN_EVIDENCE_ID
}) {
  const explanation = (instructionalAnalysisUnitId) => ({
    instructionalAnalysisUnitId,
    developedForms: DESIGN_FORMS,
    notApplicable: []
  });
  const practice = (opportunityId) => ({
    evidenceRequirementId,
    opportunityId,
    invariantTaskOperation: "explicar a relação entre configuração DNS e concessão DHCP",
    variedDimensions: ["case_or_data"]
  });
  const groups = Array.from(
    { length: Math.ceil(analysisIds.length / 2) },
    (_, index) => analysisIds.slice(index * 2, index * 2 + 2)
  );
  return {
    contextHash,
    didacticMicrosequenceId,
    studyUnits: [
      ...groups.map((ids, index) => ({
        studyUnitId: `${prefix}-expository-${index + 1}`,
        mode: "expository",
        introducedInstructionalAnalysisUnitIds: ids,
        explanationApplications: ids.map(explanation),
        practiceApplications: [],
        componentRefs: [componentRef]
      })),
      ...(evidenceRequirementId ? [{
        studyUnitId: `${prefix}-practice-1`,
        mode: "practice",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [],
        practiceApplications: [practice("dns-case-a")],
        componentRefs: [componentRef]
      },
      {
        studyUnitId: `${prefix}-practice-2`,
        mode: "practice",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [],
        practiceApplications: [practice("dns-case-b")],
        componentRefs: [componentRef]
      }] : [])
    ]
  };
}

function studyUnitUpserts(application, packageId, firstPosition = 1) {
  return application.studyUnits.map((studyUnit, index) => ({
    entityType: "study_unit",
    entityId: studyUnit.studyUnitId,
    parentType: "microsequence",
    parentId: application.didacticMicrosequenceId,
    position: firstPosition + index,
    content: {
      title: `Unidade factual ${index + 1}`,
      kind: "study_unit",
      resource: {
        package: packageId,
        version: "1.0.0",
        data: { text: `Conteúdo factual ${index + 1}.` }
      }
    }
  }));
}

async function applyDesignCommand(database, expectedRevision, command, requestId) {
  return scalar(database, `
    select public.apply_course_design_command_for_actor_v1(
      $1,$2,$3,$4,'application',$5
    ) as value
  `, [OWNER, COURSE, expectedRevision, command, requestId]);
}

async function readCourseDesign(database, scopeKind, scopeRef, limit = 32, cursor = null) {
  return scalar(database, `
    select public.get_owned_course_design_for_actor_v1(
      $1,$2,$3,$4,$5,$6
    ) as value
  `, [OWNER, COURSE, scopeKind, scopeRef, limit, cursor]);
}

function planTarget(planId, partId) {
  return {
    id: planId,
    title: "Curso de relações",
    objective: "Analisar relações e aplicações.",
    audience: "Graduação.",
    scope: "Relações fundamentais.",
    authoringGuidance: "Usar exemplos contrastivos.",
    preferredPartCount: { minimum: 8, maximum: 10, origin: "author" },
    intendedLearningOutcomes: [{
      id: PLAN_ITEM,
      position: 0,
      statement: "Comparar relações em um caso novo."
    }],
    instructionalAnalysisUnits: [],
    evidenceRequirements: [],
    parts: [{
      id: partId,
      position: 0,
      title: "Fundamentos",
      intent: "Preparar definição e aplicação.",
      microsequenceIds: ["micro-a"]
    }]
  };
}

async function startMinimalMaterialization(database, requestId) {
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const result = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'application',$6
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: STEPS[0],
      position: 0,
      kind: "context_load",
      targetDidacticMicrosequenceId: null,
      productionPosition: null
    }]
  }, requestId]);
  return { partId, result };
}

test("converte orientação e Parte sem manter brief ou authoring_state", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  assert.equal(await scalar(database, `
    select not exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='courses'
        and column_name in('brief','authoring_state')
    ) as value
  `), true);
  assert.equal(await scalar(database, `
    select authoring_guidance as value
    from private.course_instructional_plans where course_id=$1
  `, [COURSE]), "Usar exemplos contrastivos.");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  assert.match(partId, /^[0-9a-f-]{36}$/u);
  assert.equal(await scalar(database, `
    select didactic_microsequence_id as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1
  `, [COURSE]), "micro-a");
  await database.close();
});

test("aborta mais de 64 Partes legadas e recusa posição fora do contrato", async () => {
  const overflowDatabase = await databaseFixture({
    authoringParts: Array.from({ length: 65 }, (_, index) => ({
      id: `part-${index}`,
      title: `Parte ${index + 1}`,
      microsequenceIds: []
    }))
  });
  await assert.rejects(
    applyMigration(overflowDatabase),
    /excede o limite de 64 Partes/u
  );
  await overflowDatabase.close();

  const database = await databaseFixture();
  await applyMigration(database);
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  await assert.rejects(
    database.query(`
      insert into private.course_authoring_parts(
        id,course_id,instructional_plan_id,position,title,intent
      ) values($1,$2,$3,64,'Fora do contrato','')
    `, ["90000000-0000-4000-8000-000000000009", COURSE, planId]),
    /course_authoring_parts_position_v1/u
  );
  await database.close();
});

test("aborta mais de 192 vínculos legados antes de criar projeção ilegível", async () => {
  const database = await databaseFixture({
    authoringParts: Array.from({ length: 4 }, (_, partIndex) => ({
      id: `part-${partIndex}`,
      title: `Parte ${partIndex + 1}`,
      microsequenceIds: Array.from(
        { length: partIndex === 0 ? 49 : 48 },
        (_, microIndex) => `micro-${partIndex}-${microIndex}`
      )
    }))
  });
  await assert.rejects(
    applyMigration(database),
    /excede 192 vínculos de microssequência/u
  );
  await database.close();
});

test("materialização rejeita o 193º vínculo e reverte etapa e revisão", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const firstPartId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const secondPartId = "90000000-0000-4000-8000-000000000002";
  const thirdPartId = "90000000-0000-4000-8000-000000000003";
  const targetPartId = "90000000-0000-4000-8000-000000000004";
  const materializationId = "91000000-0000-4000-8000-000000000001";
  const stepId = "92000000-0000-4000-8000-000000000001";
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    )
    select $1,'microsequence','micro-overflow-'||value,
      'lesson','lesson-a',value,
      jsonb_build_object('title','Micro '||value)
    from generate_series(1,192) as series(value)
  `, [COURSE]);
  await database.query(`
    insert into private.course_authoring_parts(
      id,course_id,instructional_plan_id,position,title,intent
    ) values
      ($1,$4,$5,1,'Parte 2',''),
      ($2,$4,$5,2,'Parte 3',''),
      ($3,$4,$5,3,'Parte alvo','')
  `, [secondPartId, thirdPartId, targetPartId, COURSE, planId]);
  await database.query(`
    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    )
    select $1::uuid,$2::uuid,'micro-overflow-'||value,value
    from generate_series(1,63) as series(value)
    union all
    select $1::uuid,$3::uuid,'micro-overflow-'||value,value-64
    from generate_series(64,127) as series(value)
    union all
    select $1::uuid,$4::uuid,'micro-overflow-'||value,value-128
    from generate_series(128,191) as series(value)
  `, [COURSE, firstPartId, secondPartId, thirdPartId]);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1
  `, [COURSE]), 192);
  const revision = await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,0,'start',$6,'mcp','request-overflow-start'
    ) as value
  `, [OWNER, COURSE, targetPartId, materializationId, revision, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: stepId,
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-overflow-192",
      productionPosition: 0
    }]
  }]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-overflow-step'
    ) as value
  `, [
    OWNER,
    COURSE,
    targetPartId,
    materializationId,
    started.courseRevision,
    started.materialization.version,
    {
      stepId,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: { upserts: [], deletes: [] }
    }
  ]), /excede 192 vínculos de microssequência/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1
  `, [COURSE]), 192);
  assert.equal(await scalar(database, `
    select status='pending' and version=1 as value
    from private.course_authoring_part_materialization_steps where id=$1
  `, [stepId]), true);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), started.courseRevision);
  await database.close();
});

test("rejeita controles e texto só de layout sem proibir layout interno", async () => {
  const invalidHeaderDatabase = await databaseFixture();
  await invalidHeaderDatabase.query(
    "update public.courses set title=$1 where id=$2",
    ["Curso\u0001inválido", COURSE]
  );
  await assert.rejects(
    applyMigration(invalidHeaderDatabase),
    /Cabeçalho anterior contém caractere de controle inválido/u
  );
  await invalidHeaderDatabase.close();

  const blankHeaderDatabase = await databaseFixture();
  await blankHeaderDatabase.query(
    "update public.courses set title=$1 where id=$2",
    ["\n\t", COURSE]
  );
  await assert.rejects(
    applyMigration(blankHeaderDatabase),
    /Cabeçalho|constraint|viola/iu
  );
  await blankHeaderDatabase.close();

  for (const title of [
    "M".repeat(301),
    "Micro\u0001inválida",
    "Micro\u0085inválida",
    "\n\t",
    `${" ".repeat(300)}M`
  ]) {
    const invalidEntityDatabase = await databaseFixture();
    await invalidEntityDatabase.query(`
      update private.course_entities
      set content=jsonb_build_object('title',$1::text)
      where course_id=$2::uuid and entity_type='microsequence'
    `, [title, COURSE]);
    await assert.rejects(
      applyMigration(invalidEntityDatabase),
      /Título didático anterior não satisfaz o contrato canônico/u
    );
    await invalidEntityDatabase.close();
  }

  for (const title of ["Parte\u007finválida", "\n\t"]) {
    const invalidPartDatabase = await databaseFixture({
      authoringParts: [{
        id: "part-a",
        title,
        microsequenceIds: ["micro-a"]
      }]
    });
    await assert.rejects(
      applyMigration(invalidPartDatabase),
      /Parte anterior não possui conversão inequívoca/u
    );
    await invalidPartDatabase.close();
  }

  const database = await databaseFixture({
    brief: "Linha inicial.\n\tLinha complementar."
  });
  await applyMigration(database);
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const invalidWrites = [
    [
      "update private.course_instructional_plans set audience=$1 where id=$2",
      ["Público\u0085inválido", planId]
    ],
    [
      "update private.course_instructional_plans set instructional_scope=$1 where id=$2",
      ["Escopo\u007finválido", planId]
    ],
    [
      "update private.course_instructional_plans set authoring_guidance=$1 where id=$2",
      ["Orientação\u0001inválida", planId]
    ],
    [
      "update private.course_authoring_parts set intent=$1 where id=$2",
      ["Intenção\u007finválida", partId]
    ],
    [
      "update private.course_authoring_parts set title=$1 where id=$2",
      ["Parte\u0001inválida", partId]
    ],
    [
      "update private.course_authoring_parts set title=$1 where id=$2",
      ["\n\t", partId]
    ],
    [
      "update public.courses set goal=$1 where id=$2",
      ["Objetivo\u007finválido", COURSE]
    ],
    [
      "update public.courses set goal=$1 where id=$2",
      ["\n\t", COURSE]
    ]
  ];
  for (const [sql, parameters] of invalidWrites) {
    await assert.rejects(
      () => database.query(sql, parameters),
      /constraint|viola/iu
    );
  }
  for (const content of [
    { title: "M".repeat(301) },
    { title: "Módulo\u0001inválido" },
    { title: "\n\t" },
    { title: "Módulo válido", id: "id-duplicado" },
    { title: "Módulo válido", lessons: [] }
  ]) {
    await assert.rejects(() => database.query(`
      update private.course_entities set content=$1::jsonb
      where course_id=$2::uuid and entity_type='module' and entity_id='module-a'
    `, [content, COURSE]), /course_entities_content_v1|constraint|viola/iu);
  }
  await database.query(`
    update private.course_entities set content=$1::jsonb
    where course_id=$2::uuid and entity_type='module' and entity_id='module-a'
  `, [{ title: "Módulo\n\tválido" }, COURSE]);
  await assert.rejects(() => database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'intended_learning_outcome',0,$4)
  `, [PLAN_ITEM, COURSE, planId, "Resultado\u0001inválido"]), /constraint|viola/iu);
  await assert.rejects(() => database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'intended_learning_outcome',0,$4)
  `, [PLAN_ITEM, COURSE, planId, "\n\t"]), /constraint|viola/iu);

  await database.query(`
    update private.course_instructional_plans
    set audience=$1, instructional_scope=$2, authoring_guidance=$3
    where id=$4
  `, [
    "Público\n\tprioritário",
    "Escopo\n\toperacional",
    "Orientação\n\tcomplementar",
    planId
  ]);
  await database.query(`
    update private.course_authoring_parts set intent=$1 where id=$2
  `, ["Intenção\n\tdetalhada", partId]);
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'intended_learning_outcome',0,$4)
  `, [PLAN_ITEM, COURSE, planId, "Resultado\n\tobservável"]);
  assert.equal(await scalar(database, `
    select audience=$1 and instructional_scope=$2
      and authoring_guidance=$3 as value
    from private.course_instructional_plans where id=$4
  `, [
    "Público\n\tprioritário",
    "Escopo\n\toperacional",
    "Orientação\n\tcomplementar",
    planId
  ]), true);
  assert.equal(await scalar(database, `
    select intent=$1 as value from private.course_authoring_parts where id=$2
  `, ["Intenção\n\tdetalhada", partId]), true);
  assert.equal(await scalar(database, `
    select statement=$1 as value
    from private.course_instructional_plan_items where id=$2
  `, ["Resultado\n\tobservável", PLAN_ITEM]), true);

  await actor(database, OWNER, "service_role");
  await assert.rejects(
    scalar(database, `
      select public.create_course_for_actor_v1(
        $1,$2,$3,'request-create-control-0001'
      ) as value
    `, [OWNER, "Curso\u0001inválido", "Objetivo válido."]),
    /Criação de Curso inválida/u
  );
  await assert.rejects(
    scalar(database, `
      select public.create_course_for_actor_v1(
        $1,$2,$3,'request-create-layout-only'
      ) as value
    `, [OWNER, "\n\t", "Objetivo válido."]),
    /Criação de Curso inválida/u
  );
  const created = await scalar(database, `
    select public.create_course_for_actor_v1(
      $1,$2,$3,'request-create-layout-0001'
    ) as value
  `, [OWNER, "Curso válido", "Objetivo em duas linhas.\n\tCom detalhe."]);
  assert.equal(created.title, "Curso válido");
  assert.equal(created.goal, "Objetivo em duas linhas.\n\tCom detalhe.");
  await database.close();
});

test("commit integral usa CAS, comando no receipt e não apaga composição", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const target = planTarget(planId, partId);
  const command = {
    type: "add_plan_item",
    kind: "intended_learning_outcome",
    id: PLAN_ITEM,
    position: 0,
    statement: target.intendedLearningOutcomes[0].statement
  };
  const result = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,$4,'mcp','request-plan-0001'
    ) as value
  `, [OWNER, COURSE, command, target]);
  assert.equal(result.courseRevision, 5);
  assert.equal(result.planVersion, 2);
  assert.equal(result.channel, "mcp");
  assert.equal(result.counts.intendedLearningOutcomeCount, 1);
  assert.equal(await scalar(database, `
    select summary->>'instructionalPlanItemId' as value
    from private.course_events
    where course_id=$1 and operation='update_course_instructional_plan'
    order by id desc limit 1
  `, [COURSE]), PLAN_ITEM);
  const planAfterCommit = await scalar(database, `
    select public.get_owned_course_instructional_plan_for_actor_v1(
      $1,$2,20
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(
    planAfterCommit.recentActivity[0].instructionalPlanItemId,
    PLAN_ITEM
  );
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1
  `, [COURSE]), 4);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,5,$3,'[]'::jsonb,'request-composition-blank-title'
    ) as value
  `, [OWNER, COURSE, [{
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: { title: "\n\t" }
  }]]), /Entidade da composição inválida/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 5);
  const composition = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,5,$3,'[]'::jsonb,'request-composition-0001'
    ) as value
  `, [OWNER, COURSE, [{
    entityType: "card",
    entityId: "card-a",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 1,
    content: { title: "Unidade A revista" }
  }]]);
  assert.equal(composition.revision, 6);
  const replay = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,'{}'::jsonb,'mcp','request-plan-0001'
    ) as value
  `, [OWNER, COURSE, command]);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 5);
  const eventCount = await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [COURSE]);
  const noOp = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,6,2,$3,$4,'application','request-plan-noop'
    ) as value
  `, [OWNER, COURSE, { type: "reorder_parts", orderedIds: [partId] }, target]);
  assert.equal(noOp.changed, false);
  assert.equal(noOp.courseRevision, 6);
  assert.equal(noOp.planVersion, 2);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [COURSE]), eventCount);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,$4,'mcp','request-plan-stale'
    ) as value
  `, [OWNER, COURSE, command, target]), /mudou/iu);
  await database.close();
});

test("materialização retoma por etapas e salva lote e vínculo atomicamente", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'mcp','request-start-0001'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: { focus: "aplicação" },
    steps: [
      { id: STEPS[0], position: 0, kind: "context_load", targetDidacticMicrosequenceId: null, productionPosition: null },
      { id: STEPS[1], position: 1, kind: "didactic_microsequence_materialization", targetDidacticMicrosequenceId: "micro-b", productionPosition: 1 },
      { id: STEPS[2], position: 2, kind: "validation", targetDidacticMicrosequenceId: null, productionPosition: null }
    ]
  }]);
  assert.equal(started.materialization.nextPendingStep.id, STEPS[0]);
  await actor(database, OWNER, "authenticated");
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]), /service role/iu);
  await actor(database, OWNER, "service_role");
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSE, LEARNER, OWNER]);
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [LEARNER, COURSE, partId, MATERIALIZATION]), /não autorizada/iu);
  let revision = started.courseRevision;
  let version = started.materialization.version;
  await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-context'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[0], expectedStepVersion: 1, status: "completed",
    resultFacts: { loaded: true }, entityChanges: { upserts: [], deletes: [] }
  }]);
  const resumed = await scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]);
  assert.equal(
    resumed.contract,
    "aralearn.course-authoring-part-materialization.v1"
  );
  assert.deepEqual(Object.keys(resumed).sort(), [
    "authoringPartId", "contract", "courseId", "courseRevision", "materialization"
  ]);
  assert.deepEqual(Object.keys(resumed.materialization).sort(), [
    "authoringPartVersion", "channel", "completedAt", "designContext", "id",
    "nextPendingStep", "resultFacts", "startedAt", "status", "steps",
    "updatedAt", "version"
  ]);
  assert.deepEqual(resumed.materialization.designContext, { focus: "aplicação" });
  assert.deepEqual(resumed.materialization.resultFacts, {});
  assert.equal(resumed.materialization.steps.length, 3);
  assert.deepEqual(resumed.materialization.steps[0].resultFacts, { loaded: true });
  assert.equal(resumed.materialization.steps[0].status, "completed");
  assert.deepEqual(Object.keys(resumed.materialization.steps[0]).sort(), [
    "completedAt", "id", "kind", "position", "productionPosition",
    "resultFacts", "status", "targetDidacticMicrosequenceId", "updatedAt",
    "version"
  ]);
  assert.equal(resumed.materialization.nextPendingStep.id, STEPS[1]);
  assert.equal(resumed.materialization.nextPendingStep.version, 1);
  revision = resumed.courseRevision;
  version = resumed.materialization.version;
  const moduleContent = await scalar(database, `
    select content as value from private.course_entities
    where course_id=$1 and entity_type='module' and entity_id='module-a'
  `, [COURSE]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-blank-title'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: [{
        entityType: "microsequence",
        entityId: "micro-b",
        parentType: "lesson",
        parentId: "lesson-a",
        position: 1,
        content: { title: "\n\t" }
      }],
      deletes: []
    }
  }]), /Lote de entidades da etapa inválido/iu);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-ancestor'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: [{
        entityType: "module",
        entityId: "module-a",
        parentType: null,
        parentId: null,
        position: 0,
        content: { title: "Módulo indevidamente alterado" }
      }],
      deletes: []
    }
  }]), /fora da microssequência alvo/iu);
  assert.deepEqual(await scalar(database, `
    select content as value from private.course_entities
    where course_id=$1 and entity_type='module' and entity_id='module-a'
  `, [COURSE]), moduleContent);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-invalid'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: [{
        entityType: "microsequence",
        entityId: "micro-b",
        parentType: "lesson",
        parentId: "lesson-missing",
        position: 1,
        content: { title: "Micro inválida" }
      }],
      deletes: []
    }
  }]), /composição|estrutura|pai|alvo/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_id='micro-b'
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select status='pending' and version=1 as value
    from private.course_authoring_part_materialization_steps where id=$1
  `, [STEPS[1]]), true);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), revision);
  const materialized = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-content'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: { studyUnitCount: 1 },
    entityChanges: {
      upserts: [
        { entityType: "microsequence", entityId: "micro-b", parentType: "lesson", parentId: "lesson-a", position: 1, content: { title: "Micro B" } },
        { entityType: "card", entityId: "card-b", parentType: "microsequence", parentId: "micro-b", position: 1, content: { title: "Unidade B" } }
      ],
      deletes: []
    }
  }]);
  assert.equal(materialized.entities.createdCount, 2);
  assert.equal(materialized.entities.linkedDidacticMicrosequenceId, "micro-b");
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1 and authoring_part_id=$2
  `, [COURSE, partId]), 2);
  revision = materialized.courseRevision;
  version = materialized.materialization.version;
  const validation = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-validation'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[2], expectedStepVersion: 1, status: "completed",
    resultFacts: { valid: true }, entityChanges: { upserts: [], deletes: [] }
  }]);
  const finished = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'finish',$7,'mcp','request-finish-0001'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    validation.courseRevision, validation.materialization.version,
    { status: "completed", resultFacts: { produced: 1 } }]);
  assert.equal(finished.materialization.status, "completed");
  const projection = await scalar(database, `
    select public.get_owned_course_instructional_plan_for_actor_v1(
      $1,$2,20
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(projection.plan.parts[0].progress.state, "materialized");
  assert.equal(projection.plan.parts[0].microsequences.length, 2);
  assert.equal(projection.recentActivity[0].kind, "materialization_finished");
  const completedRead = await scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]);
  assert.equal(completedRead.materialization.status, "completed");
  assert.deepEqual(completedRead.materialization.resultFacts, { produced: 1 });
  assert.equal(completedRead.materialization.nextPendingStep, null);
  await database.query(`
    insert into private.course_authoring_part_materialization_steps(
      id,course_id,materialization_id,position,step_kind,
      target_didactic_microsequence_id,production_position
    )
    select extensions.gen_random_uuid(),$1,$2,position,'context_load',null,null
    from generate_series(3,64) position
  `, [COURSE, MATERIALIZATION]);
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]), /limite consultável de etapas/iu);
  await database.close();
});

test("materialização exige a primeira etapa pendente e para após falha", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'application','request-order-start'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [
      { id: STEPS[0], position: 0, kind: "context_load", targetDidacticMicrosequenceId: null, productionPosition: null },
      { id: STEPS[1], position: 1, kind: "didactic_microsequence_materialization", targetDidacticMicrosequenceId: "micro-b", productionPosition: 1 }
    ]
  }]);
  const emptyChanges = { upserts: [], deletes: [] };
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'application','request-order-skip'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    started.courseRevision, started.materialization.version, {
      stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
      resultFacts: {}, entityChanges: emptyChanges
    }]), /próxima pendente/iu);
  const failed = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'application','request-order-fail'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    started.courseRevision, started.materialization.version, {
      stepId: STEPS[0], expectedStepVersion: 1, status: "failed",
      resultFacts: { reason: "context_unavailable" }, entityChanges: emptyChanges
    }]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'application','request-order-after-fail'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    failed.courseRevision, failed.materialization.version, {
      stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
      resultFacts: {}, entityChanges: emptyChanges
    }]), /já falhou/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), failed.courseRevision);
  await database.close();
});

test("record_step reverte entidades e vínculo quando a ordem de produção cria lacuna", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'mcp','request-gap-start'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: STEPS[0],
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-b",
      productionPosition: 2
    }]
  }]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-gap-step'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    started.courseRevision, started.materialization.version, {
      stepId: STEPS[0],
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: {
        upserts: [
          { entityType: "microsequence", entityId: "micro-b", parentType: "lesson", parentId: "lesson-a", position: 1, content: { title: "Micro B" } },
          { entityType: "card", entityId: "card-b", parentType: "microsequence", parentId: "micro-b", position: 1, content: { title: "Unidade B" } }
        ],
        deletes: []
      }
    }]), /ordem de produção.*contígua/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_id in('micro-b','card-b')
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1 and authoring_part_id=$2
  `, [COURSE, partId]), 1);
  assert.equal(await scalar(database, `
    select status='pending' and version=1 as value
    from private.course_authoring_part_materialization_steps where id=$1
  `, [STEPS[0]]), true);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), started.courseRevision);
  await database.close();
});

test("service role rejeita productionPosition 64/65 e mais de 64 vínculos", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  for (const productionPosition of [64, 65]) {
    const suffix = String(productionPosition).padStart(12, "0");
    await assert.rejects(() => scalar(database, `
      select public.advance_course_authoring_part_materialization_for_actor_v1(
        $1,$2,$3,$4,4,0,'start',$5,'mcp',$6
      ) as value
    `, [
      OWNER,
      COURSE,
      partId,
      `30000000-0000-4000-8000-${suffix}`,
      {
        authoringPartVersion: 1,
        designContext: {},
        steps: [{
          id: `40000000-0000-4000-8000-${suffix}`,
          position: 0,
          kind: "didactic_microsequence_materialization",
          targetDidacticMicrosequenceId: `micro-${productionPosition}`,
          productionPosition
        }]
      },
      `request-position-${productionPosition}`
    ]), /etapas iniciais.*inválidas/iu);
  }
  const tooManyLinks = planTarget(planId, partId);
  tooManyLinks.parts[0].microsequenceIds = Array.from(
    { length: 65 },
    (_, index) => `micro-${index}`
  );
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,$4,'mcp','request-links-over-limit'
    ) as value
  `, [
    OWNER,
    COURSE,
    { type: "update_part", id: partId },
    tooManyLinks
  ]), /Parte do plano instrucional inválida/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_materializations where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1 and authoring_part_id=$2
  `, [COURSE, partId]), 1);
  await database.close();
});

test("commit permite cabeçalho e itens, mas bloqueia a Parte em materialização", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'mcp','request-running-start'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: STEPS[0], position: 0, kind: "context_load",
      targetDidacticMicrosequenceId: null, productionPosition: null
    }]
  }]);
  const current = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const headerTarget = structuredClone(current);
  headerTarget.audience = "Professores em formação.";
  const headerChanged = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,1,$4,$5,'application','request-running-header'
    ) as value
  `, [
    OWNER,
    COURSE,
    started.courseRevision,
    { type: "update_plan" },
    headerTarget
  ]);
  assert.equal(headerChanged.changed, true);
  const itemTarget = structuredClone(headerTarget);
  itemTarget.intendedLearningOutcomes.push({
    id: PLAN_ITEM,
    position: 0,
    statement: "Comparar relações."
  });
  const itemChanged = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application','request-running-item'
    ) as value
  `, [
    OWNER,
    COURSE,
    headerChanged.courseRevision,
    headerChanged.planVersion,
    {
      type: "add_plan_item",
      kind: "intended_learning_outcome",
      id: PLAN_ITEM,
      position: 0,
      statement: "Comparar relações."
    },
    itemTarget
  ]);
  const partTarget = structuredClone(itemTarget);
  partTarget.parts[0].intent = "Intenção alterada durante execução.";
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application','request-running-part'
    ) as value
  `, [
    OWNER,
    COURSE,
    itemChanged.courseRevision,
    itemChanged.planVersion,
    { type: "update_part", id: partId },
    partTarget
  ]), /Parte em materialização mudou/iu);
  assert.equal(await scalar(database, `
    select intent as value from private.course_authoring_parts where id=$1
  `, [partId]), "");
  assert.equal(await scalar(database, `
    select version=1 as value
    from private.course_authoring_part_materializations where id=$1
  `, [MATERIALIZATION]), true);
  await database.close();
});

test("exclusão de Curso e conta remove vínculo e materialização sem afrouxar entidade isolada", async () => {
  const directDatabase = await databaseFixture();
  await applyMigration(directDatabase);
  await startMinimalMaterialization(directDatabase, "request-delete-course-start");
  await assert.rejects(() => directDatabase.query(`
    delete from private.course_entities
    where course_id=$1 and entity_type='microsequence' and entity_id='micro-a'
  `, [COURSE]), /foreign key|viola/iu);
  await directDatabase.query("delete from public.courses where id=$1", [COURSE]);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value from public.courses where id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_materializations where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_materialization_steps where course_id=$1
  `, [COURSE]), 0);
  await directDatabase.close();

  const accountDatabase = await databaseFixture();
  await applyMigration(accountDatabase);
  await startMinimalMaterialization(accountDatabase, "request-delete-account-start");
  await actor(accountDatabase, OWNER, "authenticated");
  const deleted = await scalar(accountDatabase, `
    select public.delete_my_account_v1('EXCLUIR MINHA CONTA') as value
  `);
  assert.equal(deleted.status, "deleted");
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from auth.users where id=$1
  `, [OWNER]), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from public.courses where id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_materializations where course_id=$1
  `, [COURSE]), 0);
  await accountDatabase.close();
});

test("aborta mandato, decisão e referência sem conversor", async () => {
  const withDecision = await databaseFixture({ decisions: [{ id: "d1" }] });
  await assert.rejects(() => applyMigration(withDecision), /conversor explícito/iu);
  await withDecision.close();
  const withMandate = await databaseFixture({ mandate: { id: "m1" } });
  await assert.rejects(() => applyMigration(withMandate), /conversor explícito/iu);
  await withMandate.close();
  const missing = await databaseFixture({ microsequenceIds: ["missing"] });
  await assert.rejects(() => applyMigration(missing), /inexistente/iu);
  await missing.close();
});

test("aborta brief legado com controles C0 ou C1 antes da conversão", async () => {
  for (const brief of [
    "Orientação\u0001inválida",
    "Orientação\u007finválida",
    "Orientação\u0085inválida"
  ]) {
    const database = await databaseFixture({ brief });
    await assert.rejects(
      () => applyMigration(database),
      /caractere de controle/iu
    );
    await database.close();
  }
});

test("expõe somente leitura ao browser e remove assinaturas substituídas", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'authenticated',
      'public.get_owned_course_instructional_plan_v1(uuid,integer)',
      'EXECUTE'
    ) as value
  `), true);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'authenticated',
      'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)',
      'EXECUTE'
    ) as value
  `), false);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'service_role',
      'public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    ) as value
  `), true);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'authenticated',
      'public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    ) as value
  `), false);
  assert.equal(await scalar(database, `
    select to_regprocedure(
      'public.commit_course_changes_for_actor_v1(uuid,uuid,bigint,text,text,text,text,jsonb,jsonb,jsonb,text)'
    ) is null as value
  `), true);
  assert.equal(await scalar(database, `
    select to_regprocedure(
      'public.create_course_for_actor_v1(uuid,text,text,text,text)'
    ) is null as value
  `), true);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260817160000");
  await database.close();
});

async function inspectionDatabaseFixture() {
  const database = await databaseFixture();
  await applyMigration(database);
  await database.exec(`
    update private.course_entities
    set entity_id='unit-a', content=jsonb_build_object(
      'title','Unidade A','body',repeat('a',70000)
    )
    where course_id='${COURSE}' and entity_type='card' and entity_id='card-a';

    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ('${COURSE}','card','unit-a-2','microsequence','micro-a',2,
        '{"title":"Unidade A2"}'),
      ('${COURSE}','microsequence','micro-b','lesson','lesson-a',1,
        '{"title":"Micro B","dependsOn":[]}'),
      ('${COURSE}','module','module-b',null,null,1,
        '{"title":"Módulo B"}'),
      ('${COURSE}','lesson','lesson-b','module','module-b',0,
        '{"title":"Lição B"}'),
      ('${COURSE}','microsequence','micro-c','lesson','lesson-b',0,
        '{"title":"Micro C","dependsOn":[]}'),
      ('${COURSE}','card','unit-c-1','microsequence','micro-c',1,
        '{"title":"Unidade C1"}');

    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    )
    select '${COURSE}','card','unit-b-'||unit_value,
      'microsequence','micro-b',unit_value,
      jsonb_build_object('title','Unidade B'||unit_value)
    from generate_series(1,60) unit_value;
  `);
  await applyStudyUnitInspectionMigration(database);
  return database;
}

async function inspectionPage(database, {
  actorId = OWNER,
  revision = 4,
  scopeKind = "course",
  scopeId = null,
  anchorStudyUnitId = null,
  cursorStudyUnitId = null,
  direction = "forward",
  limit = 12,
  maxBytes = 1_500_000
} = {}) {
  return scalar(database, `
    select public.list_owned_course_study_units_for_actor_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
    ) as value
  `, [
    actorId, COURSE, revision, scopeKind, scopeId,
    anchorStudyUnitId, cursorStudyUnitId, direction, limit, maxBytes
  ]);
}

async function inspectionCommit(database, {
  revision,
  upserts = [],
  deletes = [],
  requestId
}) {
  await actor(database, OWNER, "service_role");
  return scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,$3,$4,$5,$6
    ) as value
  `, [OWNER, COURSE, revision, upserts, deletes, requestId]);
}

test("1700 corta o discriminador legado e fecha grants da inspeção", async () => {
  const database = await inspectionDatabaseFixture();
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where entity_type='card'
  `), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where entity_type='study_unit'
  `), 63);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from pg_proc function_value
    join pg_namespace namespace_value on namespace_value.oid=function_value.pronamespace
    where namespace_value.nspname in ('public','private')
      and function_value.proname in (
        'course_authoring_part_progress_v1',
        'get_course_for_actor_v1',
        'get_course_instructional_plan_for_actor_v1',
        'list_course_entities_for_actor_v1',
        'list_course_review_items_for_actor_v1',
        'list_courses_for_actor_v1',
        'list_owned_courses_for_actor_v1',
        'advance_course_authoring_part_materialization_for_actor_v1',
        'commit_course_composition_for_actor_v1'
      )
      and strpos(function_value.prosrc,quote_literal('card'))>0
  `), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from pg_proc function_value
    join pg_namespace namespace_value
      on namespace_value.oid=function_value.pronamespace
    where namespace_value.nspname='public'
      and function_value.proname in (
        'advance_course_authoring_part_materialization_for_actor_v1',
        'commit_course_composition_for_actor_v1'
      )
      and strpos(
        function_value.prosrc,
        'private.assert_course_lesson_dependencies_v1'
      )>0
  `), 2);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'service_role',
      'public.list_owned_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer)',
      'EXECUTE'
    ) as value
  `), true);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'authenticated',
      'public.list_owned_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer)',
      'EXECUTE'
    ) as value
  `), false);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260817170000");
  await assert.rejects(() => database.exec(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values('${COURSE}','card','legacy-unit','microsequence','micro-a',3,'{}')
  `), /course_entities_type_v1|check constraint/iu);
  await assert.rejects(() => database.exec(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values(
      '${COURSE}','study_unit','invalid-title','microsequence','micro-a',3,'{}'
    )
  `), /course_entities_content_v1|check constraint/iu);
  await assert.rejects(() => database.exec(`
    update private.course_entities set content='{"title":"   "}'
    where course_id='${COURSE}'
      and entity_type='study_unit' and entity_id='unit-a-2'
  `), /course_entities_content_v1|check constraint/iu);
  await assert.rejects(() => database.exec(`
    update private.course_entities set content=jsonb_build_object(
      'title','Unidade grande','body',repeat('x',1048576)
    ) where course_id='${COURSE}'
      and entity_type='study_unit' and entity_id='unit-a-2'
  `), /course_entities_content_v1|check constraint/iu);
  await assert.rejects(() => database.exec(`
    update private.course_entities set content='{"title":"Micro","cards":[]}'
    where course_id='${COURSE}' and entity_type='microsequence' and entity_id='micro-a'
  `), /course_entities_content_v1|check constraint/iu);
  await database.close();
});

test("1700 aborta antes do corte quando Unidade legada não tem título", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await database.exec(`
    update private.course_entities set content='{}'
    where course_id='${COURSE}' and entity_type='card' and entity_id='card-a'
  `);
  await assert.rejects(
    () => applyStudyUnitInspectionMigration(database),
    /Unidade legada possui título inválido/iu
  );
  await database.exec("rollback;");
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id='${COURSE}' and entity_type='card'
  `), 1);
  await database.close();
});

test("1700 reverte o rename se uma função corrente estiver ausente", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await database.exec(`
    drop function private.list_course_review_items_for_actor_v1(
      uuid,integer,timestamptz,uuid,text
    )
  `);
  await assert.rejects(
    () => applyStudyUnitInspectionMigration(database),
    /Função corrente ausente/iu
  );
  await database.exec("rollback;");
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id='${COURSE}' and entity_type='card'
  `), 1);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260817160000");
  await database.close();
});

test("inspeção owner-only ordena currículo e Parte apenas filtra", async () => {
  const database = await inspectionDatabaseFixture();
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const page = await inspectionPage(database, { limit: 24 });
  assert.equal(page.contract, "aralearn.course-study-unit-inspection-page.v1");
  assert.equal(page.courseRevision, 4);
  assert.equal(page.totalCount, 63);
  assert.deepEqual(page.items.slice(0, 3).map(({ studyUnit }) => studyUnit.id), [
    "unit-a", "unit-a-2", "unit-b-1"
  ]);
  assert.deepEqual(page.items[0].curriculumPath, {
    module: { id: "module-a", position: 0, title: "Módulo A" },
    lesson: { id: "lesson-a", position: 0, title: "Lição A" },
    didacticMicrosequence: { id: "micro-a", position: 0, title: "Micro A" }
  });
  assert.equal(page.items[0].authoringPart.id, partId);
  assert.equal(page.items[0].authoringPart.state, "partially_materialized");
  assert.equal(page.scopeOptions.authoringParts[0].id, partId);
  assert.equal(page.scopeOptions.unassignedStudyUnitCount, 61);

  const partPage = await inspectionPage(database, {
    scopeKind: "authoring_part",
    scopeId: partId
  });
  assert.equal(partPage.totalCount, 2);
  assert.deepEqual(partPage.items.map(({ studyUnit }) => studyUnit.id), [
    "unit-a", "unit-a-2"
  ]);
  assert.deepEqual(partPage.items.map(({ ordinal }) => ordinal), [1, 2]);

  const unassigned = await inspectionPage(database, { scopeKind: "unassigned" });
  assert.equal(unassigned.totalCount, 61);
  assert.equal(unassigned.items.every(({ authoringPart }) => authoringPart === null), true);
  const modulePage = await inspectionPage(database, {
    scopeKind: "module",
    scopeId: "module-b"
  });
  assert.equal(modulePage.totalCount, 1);
  assert.equal(modulePage.items[0].studyUnit.id, "unit-c-1");

  await database.exec(`
    insert into public.course_access(course_id,user_id,granted_by)
    values('${COURSE}','${LEARNER}','${OWNER}')
  `);
  await assert.rejects(
    () => inspectionPage(database, { actorId: LEARNER }),
    /não autorizada|não autorizado/iu
  );
  const outsider = "00000000-0000-4000-8000-000000000003";
  await database.exec(`insert into auth.users values('${outsider}','outsider@example.test')`);
  await assert.rejects(
    () => inspectionPage(database, { actorId: outsider }),
    /inexistente|inacessível/iu
  );
  await database.close();
});

test("composição cerca dependsOn somente nas Lições old e new afetadas", async () => {
  const database = await inspectionDatabaseFixture();
  const micro = (title, dependsOn) => ({
    title,
    goal: `Explicar ${title}.`,
    role: "explain",
    dependsOn,
    covers: [],
    checks: [],
    errors: []
  });
  const microUpsert = ({ id, parentId, position, dependsOn }) => ({
    entityType: "microsequence",
    entityId: id,
    parentType: "lesson",
    parentId,
    position,
    content: micro(id, dependsOn)
  });
  const invalidCases = [{
    requestId: "inspection-dependency-missing",
    upsert: microUpsert({
      id: "micro-b", parentId: "lesson-a", position: 1,
      dependsOn: ["micro-missing"]
    })
  }, {
    requestId: "inspection-dependency-posterior",
    upsert: microUpsert({
      id: "micro-a", parentId: "lesson-a", position: 0,
      dependsOn: ["micro-b"]
    })
  }, {
    requestId: "inspection-dependency-cross-lesson",
    upsert: microUpsert({
      id: "micro-b", parentId: "lesson-b", position: 1,
      dependsOn: ["micro-a"]
    })
  }];
  for (const invalid of invalidCases) {
    await assert.rejects(
      () => inspectionCommit(database, {
        revision: 4,
        upserts: [invalid.upsert],
        requestId: invalid.requestId
      }),
      (error) => error.code === "23514" && /dependsOn/iu.test(error.message)
    );
  }
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id='${COURSE}'
  `), 4);
  assert.equal(await scalar(database, `
    select parent_id as value from private.course_entities
    where course_id='${COURSE}'
      and entity_type='microsequence' and entity_id='micro-b'
  `), "lesson-a");

  const created = await inspectionCommit(database, {
    revision: 4,
    upserts: [microUpsert({
      id: "micro-d", parentId: "lesson-a", position: 2,
      dependsOn: ["micro-b"]
    })],
    requestId: "inspection-dependency-create"
  });
  assert.equal(created.revision, 5);
  await assert.rejects(
    () => inspectionCommit(database, {
      revision: 5,
      upserts: [microUpsert({
        id: "micro-d", parentId: "lesson-a", position: 1,
        dependsOn: ["micro-b"]
      })],
      deletes: [{ entityType: "microsequence", entityId: "micro-b" }],
      requestId: "inspection-dependency-delete"
    }),
    (error) => error.code === "23514" && /dependsOn/iu.test(error.message)
  );
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id='${COURSE}'
  `), 5);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id='${COURSE}' and entity_type='study_unit'
      and parent_id='micro-b'
  `), 60);
  assert.equal(await scalar(database, `
    select position as value from private.course_entities
    where course_id='${COURSE}'
      and entity_type='microsequence' and entity_id='micro-d'
  `), 2);
  await database.close();
});

test("âncora, cursor e direção preservam ordem crescente e limites", async () => {
  const database = await inspectionDatabaseFixture();
  const anchored = await inspectionPage(database, {
    anchorStudyUnitId: "unit-b-30",
    direction: "backward",
    limit: 3
  });
  assert.deepEqual(anchored.items.map(({ studyUnit }) => studyUnit.id), [
    "unit-b-28", "unit-b-29", "unit-b-30"
  ]);
  assert.equal(anchored.hasPrevious, true);
  assert.equal(anchored.hasMore, true);
  assert.deepEqual(anchored.previousCursor, { studyUnitId: "unit-b-28" });
  assert.deepEqual(anchored.nextCursor, { studyUnitId: "unit-b-30" });

  const before = await inspectionPage(database, {
    cursorStudyUnitId: "unit-b-30",
    direction: "backward",
    limit: 3
  });
  assert.deepEqual(before.items.map(({ studyUnit }) => studyUnit.id), [
    "unit-b-27", "unit-b-28", "unit-b-29"
  ]);
  const after = await inspectionPage(database, {
    cursorStudyUnitId: "unit-b-30",
    direction: "forward",
    limit: 2
  });
  assert.deepEqual(after.items.map(({ studyUnit }) => studyUnit.id), [
    "unit-b-31", "unit-b-32"
  ]);

  const bounded = await inspectionPage(database, {
    limit: 24,
    maxBytes: 65_536
  });
  assert.equal(bounded.items.length, 1);
  assert.equal(bounded.items[0].studyUnit.id, "unit-a");
  assert.equal(bounded.pageBytes > 65_536, true);
  assert.equal(bounded.hasMore, true);

  await assert.rejects(
    () => inspectionPage(database, { revision: 3 }),
    /mudou|releia/iu
  );
  await assert.rejects(
    () => inspectionPage(database, { maxBytes: 1_500_001 }),
    /inválida/iu
  );
  await assert.rejects(
    () => inspectionPage(database, { maxBytes: 65_535 }),
    /inválida/iu
  );
  await assert.rejects(
    () => inspectionPage(database, {
      scopeKind: "module",
      scopeId: "module-b",
      anchorStudyUnitId: "unit-a"
    }),
    (error) => error.code === "PT404" && /âncora inexistente/iu.test(error.message)
  );
  await assert.rejects(
    () => inspectionPage(database, { cursorStudyUnitId: "missing-unit" }),
    (error) => error.code === "22023" && /Cursor de Unidade/iu.test(error.message)
  );
  await assert.rejects(
    () => inspectionPage(database, {
      anchorStudyUnitId: "unit-a",
      cursorStudyUnitId: "unit-a-2"
    }),
    /inválida/iu
  );
  await database.close();
});

test("pagina mais de 50 Unidades sem lacuna, repetição ou carga integral", async () => {
  const database = await inspectionDatabaseFixture();
  const identities = [];
  let cursorStudyUnitId = null;
  let requestCount = 0;
  const pageSizes = [];
  do {
    const page = await inspectionPage(database, {
      cursorStudyUnitId,
      limit: 24
    });
    requestCount += 1;
    pageSizes.push(page.items.length);
    identities.push(...page.items.map(({ studyUnit }) => studyUnit.id));
    cursorStudyUnitId = page.nextCursor?.studyUnitId || null;
    if (!page.hasMore) break;
  } while (requestCount < 10);
  assert.equal(identities.length, 63);
  assert.equal(new Set(identities).size, identities.length);
  assert.equal(requestCount, 3, JSON.stringify(pageSizes));
  assert.equal(identities.at(0), "unit-a");
  assert.equal(identities.at(-1), "unit-c-1");
  assert.equal(await scalar(database, `
    select count(*)::integer as value from pg_indexes
    where schemaname='private' and indexname in (
      'course_entities_parent_v1_idx',
      'course_authoring_part_microsequences_course_unique_v1',
      'course_authoring_part_microsequences_order_v1'
    )
  `), 3);
  await database.close();
});

test("#122 instala catálogo fechado, migra guidance e resolve set/clear no PGlite", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");

  const initial = await scalar(database, `
    select public.get_owned_course_design_for_actor_v1(
      $1::uuid,$2::uuid,'course',($2::uuid)::text,32,null
    ) as value
  `, [OWNER, COURSE]);
  assert.deepEqual(normalizeCourseDesignRead(initial), initial);
  assert.equal(initial.contract, "aralearn.course-design.v1");
  assert.equal(initial.parameterCatalogVersion, "1.0.0");
  assert.equal(initial.definitions.length, 4);
  assert.equal(initial.componentCatalog.version, "1-3e5629f8");
  assert.equal(initial.componentCatalog.options.length, 32);
  assert.equal(initial.scopeContext.current.ref, COURSE);
  assert.equal(initial.scopeContext.children.length, 1);
  assert.equal(initial.guidance.effectiveRevisions.length, 1);
  assert.equal(initial.guidance.effectiveRevisions[0].origin, "migration");
  assert.equal(initial.parameters[0].effectiveAssignment.value, 2);
  assert.equal(initial.parameters[0].effectiveAssignment.sourceScope, null);
  const planRead = await scalar(database, `
    select public.get_owned_course_instructional_plan_for_actor_v1(
      $1,$2,20
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(Object.hasOwn(planRead.plan, "authoringGuidance"), false);
  const planCommandDocument = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,$4,'application','legacy-guidance-plan'
    ) as value
  `, [OWNER, COURSE, { type: "update_plan" }, {
    ...planCommandDocument,
    authoringGuidance: "Alias legado proibido."
  }]), /Commit do plano instrucional inválido/iu);

  const changed = await scalar(database, `
    select public.apply_course_design_command_for_actor_v1(
      $1,$2,4,$3,'application','design-set-0001'
    ) as value
  `, [OWNER, COURSE, {
    type: "set_parameter",
    scope: { kind: "course", ref: COURSE },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 3,
    origin: "author",
    reason: "Decisão explícita do autor."
  }]);
  assert.equal(changed.contract, "aralearn.course-design-change.v1");
  assert.equal(changed.courseRevision, 5);
  assert.equal(changed.changed, true);
  assert.equal(changed.change.type, "set_parameter");

  const retry = await scalar(database, `
    select public.apply_course_design_command_for_actor_v1(
      $1,$2,4,$3,'application','design-set-0001'
    ) as value
  `, [OWNER, COURSE, {
    type: "set_parameter",
    scope: { kind: "course", ref: COURSE },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 3,
    origin: "author",
    reason: "Decisão explícita do autor."
  }]);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.courseRevision, 5);

  const cleared = await scalar(database, `
    select public.apply_course_design_command_for_actor_v1(
      $1,$2,5,$3,'application','design-clear-01'
    ) as value
  `, [OWNER, COURSE, {
    type: "clear_parameter",
    scope: { kind: "course", ref: COURSE },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit"
  }]);
  assert.equal(cleared.courseRevision, 6);
  const after = await scalar(database, `
    select public.get_owned_course_design_for_actor_v1(
      $1::uuid,$2::uuid,'course',($2::uuid)::text,32,null
    ) as value
  `, [OWNER, COURSE]);
  assert.deepEqual(normalizeCourseDesignRead(after), after);
  assert.equal(after.parameters[0].localAssignment, null);
  assert.equal(after.parameters[0].effectiveAssignment.value, 2);
  assert.equal(await scalar(database, `
    select not exists(
      select 1 from information_schema.columns
      where table_schema='private'
        and table_name='course_instructional_plans'
        and column_name='authoring_guidance'
    ) as value
  `), true);
  const manifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  assert.deepEqual(manifest.features.slice(-3), [
    "course-design-parameters-v1",
    "course-authoring-guidance-v1",
    "course-component-policy-v1"
  ]);
  await database.close();
});

test("#122 preserva orientação válida anterior acima do novo teto de escrita", async () => {
  const guidance = "á".repeat(4_100);
  const database = await databaseFixture({ brief: guidance });
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");

  const read = await readCourseDesign(database, "course", COURSE);
  assert.equal(read.guidance.localRevision.origin, "migration");
  assert.equal(read.guidance.localRevision.guidance, guidance);
  assert.deepEqual(normalizeCourseDesignRead(read), read);
  await database.close();
});

test("#122 preflight falha fechado para catálogo, estado ou materialização anterior", async () => {
  for (const scenario of [
    { corruptLegacyCatalog: true, pattern: /catálogo legado/iu },
    { nonEmptyLegacyState: true, pattern: /Estado legado de desenho não vazio/iu },
    {
      pre1800Materialization: true,
      pattern: /Materializações anteriores a 1800.*1 materializações; 1 etapas/iu
    }
  ]) {
    const database = await databaseFixture();
    await applyMigration(database);
    await applyStudyUnitInspectionMigration(database);
    await assert.rejects(
      () => applyCourseDesignMigration(database, scenario),
      scenario.pattern
    );
    await database.exec("rollback");
    assert.equal(await scalar(database, `
      select to_regclass('private.course_design_parameter_definitions') is null as value
    `), true);
    assert.equal(await scalar(database, `
      select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
    `), "20260817170000");
    if (scenario.pre1800Materialization) {
      assert.deepEqual(await scalar(database, `
        select jsonb_build_array(
          (select count(*) from private.course_authoring_part_materializations),
          (select count(*) from private.course_authoring_part_materialization_steps)
        ) as value
      `), [1, 1]);
    }
    await database.close();
  }
});

test("#122 acumula guidance e resolve precedência e navegação sem árvore integral", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'module','module-b',null,null,1,'{"title":"Módulo B"}')
  `, [COURSE]);
  const firstPage = await readCourseDesign(database, "course", COURSE, 1);
  assert.equal(firstPage.scopeContext.childCount, 2);
  assert.equal(firstPage.scopeContext.children.length, 1);
  assert.equal(firstPage.scopeContext.hasMoreChildren, true);
  assert.equal(firstPage.scopeContext.nextChildCursor, "module-a");
  const secondPage = await readCourseDesign(
    database,
    "course",
    COURSE,
    1,
    firstPage.scopeContext.nextChildCursor
  );
  assert.deepEqual(secondPage.scopeContext.children.map(({ ref }) => ref), ["module-b"]);
  assert.equal(secondPage.scopeContext.hasMoreChildren, false);
  assert.equal(secondPage.scopeContext.nextChildCursor, null);

  await applyDesignCommand(database, 4, {
    type: "set_guidance",
    scope: { kind: "module", ref: "module-a" },
    guidance: "No módulo, desenvolver o mecanismo antes da prática.",
    origin: "author",
    reason: "Decisão modular."
  }, "guidance-module-1");
  await applyDesignCommand(database, 5, {
    type: "set_guidance",
    scope: { kind: "lesson", ref: "lesson-a" },
    guidance: "Na Lição, contrastar concessão e resolução de nomes.",
    origin: "research_condition",
    reason: "Condição de pesquisa registrada."
  }, "guidance-lesson-1");
  let microRead = await readCourseDesign(
    database,
    "didactic_microsequence",
    "micro-a"
  );
  assert.deepEqual(
    microRead.guidance.effectiveRevisions.map(({ sourceScope }) => sourceScope.kind),
    ["course", "module", "lesson"]
  );
  assert.equal(microRead.guidance.localRevision, null);
  const moduleRevision = microRead.guidance.effectiveRevisions[1];
  const interpreted = await applyDesignCommand(database, 6, {
    type: "interpret_guidance",
    guidanceRevisionId: moduleRevision.revisionId,
    interpretation: {
      summary: "O mecanismo deve anteceder as oportunidades de prática.",
      directives: [{
        kind: "require",
        statement: "Explicitar a sequência descoberta–oferta–solicitação–confirmação."
      }],
      divergences: ["A orientação da Lição também exige contraste."],
      questions: ["Qual exemplo preserva a operação-alvo?"]
    }
  }, "guidance-interpret-1");
  assert.deepEqual(interpreted.change.scope, { kind: "module", ref: "module-a" });
  const replay = await applyDesignCommand(database, 6, {
    type: "interpret_guidance",
    guidanceRevisionId: moduleRevision.revisionId,
    interpretation: {
      summary: "O mecanismo deve anteceder as oportunidades de prática.",
      directives: [{
        kind: "require",
        statement: "Explicitar a sequência descoberta–oferta–solicitação–confirmação."
      }],
      divergences: ["A orientação da Lição também exige contraste."],
      questions: ["Qual exemplo preserva a operação-alvo?"]
    }
  }, "guidance-interpret-1");
  assert.equal(replay.idempotent, true);
  microRead = await readCourseDesign(database, "didactic_microsequence", "micro-a");
  assert.equal(
    microRead.guidance.effectiveRevisions[1].currentInterpretation.guidanceRevisionId,
    moduleRevision.revisionId
  );

  await applyDesignCommand(database, 7, {
    type: "set_guidance",
    scope: { kind: "module", ref: "module-a" },
    guidance: "Nova revisão modular sem herdar a interpretação anterior.",
    origin: "author",
    reason: "A orientação mudou."
  }, "guidance-module-2");
  microRead = await readCourseDesign(database, "didactic_microsequence", "micro-a");
  assert.equal(microRead.guidance.effectiveRevisions[1].currentInterpretation, null);
  await applyDesignCommand(database, 8, {
    type: "clear_guidance",
    scope: { kind: "module", ref: "module-a" }
  }, "guidance-module-clear");
  microRead = await readCourseDesign(database, "didactic_microsequence", "micro-a");
  assert.deepEqual(
    microRead.guidance.effectiveRevisions.map(({ sourceScope }) => sourceScope.kind),
    ["course", "lesson"]
  );

  const parameterId = "new_analysis_unit_ceiling_per_expository_study_unit";
  await applyDesignCommand(database, 9, {
    type: "set_parameter",
    scope: { kind: "course", ref: COURSE },
    parameterId,
    value: 3,
    origin: "author",
    reason: "Autor explicitou o teto."
  }, "precedence-param-1");
  const moduleRead = await readCourseDesign(database, "module", "module-a");
  assert.equal(moduleRead.parameters[0].localAssignment, null);
  assert.equal(moduleRead.parameters[0].effectiveAssignment.value, 3);
  assert.equal(moduleRead.parameters[0].effectiveAssignment.inherited, true);
  assert.deepEqual(normalizeCourseDesignRead(moduleRead), moduleRead);
  await applyDesignCommand(database, 10, {
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    parameterId,
    value: 6,
    origin: "automatic",
    reason: "Sugestão automática local."
  }, "precedence-param-2");
  microRead = await readCourseDesign(database, "didactic_microsequence", "micro-a");
  assert.equal(microRead.parameters[0].localAssignment.value, 6);
  assert.equal(microRead.parameters[0].effectiveAssignment.value, 3);
  assert.deepEqual(microRead.parameters[0].effectiveAssignment.sourceScope, {
    kind: "course",
    ref: COURSE
  });
  await applyDesignCommand(database, 11, {
    type: "clear_parameter",
    scope: { kind: "course", ref: COURSE },
    parameterId
  }, "precedence-param-3");
  microRead = await readCourseDesign(database, "didactic_microsequence", "micro-a");
  assert.equal(microRead.parameters[0].effectiveAssignment.value, 6);
  assert.equal(microRead.parameters[0].effectiveAssignment.inherited, false);

  const paragraphRef = "aralearn.resource.paragraph@1.0.0";
  await applyDesignCommand(database, 12, {
    type: "set_component_policy",
    scope: { kind: "course", ref: COURSE },
    policy: {
      catalogVersion: "1-3e5629f8",
      availability: "allow_only",
      allowedRefs: [paragraphRef],
      excludedRefs: [],
      preferredRefs: [paragraphRef]
    },
    origin: "research_condition",
    reason: "Condição explícita do Curso."
  }, "precedence-policy-1");
  await applyDesignCommand(database, 13, {
    type: "set_component_policy",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    policy: {
      catalogVersion: "1-3e5629f8",
      availability: "all",
      allowedRefs: [],
      excludedRefs: [],
      preferredRefs: []
    },
    origin: "automatic",
    reason: "Sugestão automática local."
  }, "precedence-policy-2");
  microRead = await readCourseDesign(database, "didactic_microsequence", "micro-a");
  assert.equal(microRead.componentPolicy.localChange.origin, "automatic");
  assert.equal(microRead.componentPolicy.effectiveChange.origin, "research_condition");
  assert.deepEqual(microRead.componentPolicy.effectiveChange.policy.allowedRefs, [paragraphRef]);
  assert.deepEqual(normalizeCourseDesignRead(microRead), microRead);

  const noOp = await applyDesignCommand(database, 14, {
    type: "clear_guidance",
    scope: { kind: "module", ref: "module-a" }
  }, "guidance-clear-noop");
  assert.equal(noOp.changed, false);
  assert.equal(noOp.courseRevision, 14);
  assert.equal(noOp.change, null);
  await database.close();
});

test("#122 sela contexto e rejeita densidade ou componente divergente atomicamente", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");
  const plan = await scalar(database, `
    select jsonb_build_object('id',id,'partId',(
      select part.id from private.course_authoring_parts part
      where part.course_id=plan.course_id and part.retired_at is null
      order by part.position limit 1
    )) as value
    from private.course_instructional_plans plan where course_id=$1
  `, [COURSE]);
  for (const [position, id] of DESIGN_ANALYSIS_IDS.entries()) {
    await database.query(`
      insert into private.course_instructional_plan_items(
        id,course_id,instructional_plan_id,item_kind,position,statement
      ) values($1,$2,$3,'instructional_analysis_unit',$4,$5)
    `, [id, COURSE, plan.id, position, `Relação DNS–DHCP ${position + 1}.`]);
  }
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
      ) values($1,$2,$3,'evidence_requirement',0,$4)
  `, [DESIGN_EVIDENCE_ID, COURSE, plan.id, "Explicar a operação-alvo em caso novo."]);

  const targetPlanItemsCommand = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: DESIGN_ANALYSIS_IDS,
    evidenceRequirementIds: [DESIGN_EVIDENCE_ID]
  };
  const assigned = await applyDesignCommand(
    database,
    4,
    targetPlanItemsCommand,
    "target-plan-items-01"
  );
  assert.equal(assigned.changed, true);
  assert.equal(assigned.courseRevision, 5);
  assert.equal(assigned.change.type, "set_target_plan_items");
  const assignedReplay = await applyDesignCommand(
    database,
    4,
    targetPlanItemsCommand,
    "target-plan-items-01"
  );
  assert.equal(assignedReplay.idempotent, true);
  assert.equal(assignedReplay.courseRevision, 5);
  const designEventCount = await scalar(database, `
    select count(*)::integer as value
    from private.course_events
    where course_id=$1 and operation='update_course_design'
  `, [COURSE]);
  const assignmentNoOp = await applyDesignCommand(database, 5, {
    ...targetPlanItemsCommand,
    instructionalAnalysisUnitIds: [...DESIGN_ANALYSIS_IDS].reverse()
  }, "target-plan-items-noop");
  assert.equal(assignmentNoOp.changed, false);
  assert.equal(assignmentNoOp.courseRevision, 5);
  assert.equal(assignmentNoOp.change, null);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_events
    where course_id=$1 and operation='update_course_design'
  `, [COURSE]), designEventCount);
  const microDesign = await readCourseDesign(
    database,
    "didactic_microsequence",
    "micro-a"
  );
  assert.deepEqual(normalizeCourseDesignRead(microDesign), microDesign);
  assert.deepEqual(microDesign.targetPlanItems, {
    instructionalAnalysisUnitIds: DESIGN_ANALYSIS_IDS,
    evidenceRequirementIds: [DESIGN_EVIDENCE_ID]
  });
  await assert.rejects(() => database.query(`
    insert into private.course_design_target_plan_items(
      course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
    ) values($1,'micro-inexistente',$2,'instructional_analysis_unit')
  `, [COURSE, DESIGN_ANALYSIS_IDS[0]]), (error) => error.code === "23503");
  await assert.rejects(() => database.query(`
    insert into private.course_design_target_plan_items(
      course_id,didactic_microsequence_id,plan_item_id,plan_item_kind
    ) values($1,'micro-a',$2,'intended_learning_outcome')
  `, [COURSE, DESIGN_EVIDENCE_ID]), (error) => error.code === "23514");
  await database.exec("begin");
  try {
    await database.query(`
      delete from private.course_instructional_plan_items
      where course_id=$1 and id=$2
    `, [COURSE, DESIGN_ANALYSIS_IDS[0]]);
    assert.equal(await scalar(database, `
      select count(*)::integer as value
      from private.course_design_target_plan_items
      where course_id=$1 and plan_item_id=$2
    `, [COURSE, DESIGN_ANALYSIS_IDS[0]]), 0);
  } finally {
    await database.exec("rollback");
  }
  const courseDesign = await readCourseDesign(database, "course", COURSE);
  assert.equal(courseDesign.targetPlanItems, null);
  await assert.rejects(
    () => applyDesignCommand(database, 5, {
      ...targetPlanItemsCommand,
      instructionalAnalysisUnitIds: [DESIGN_EVIDENCE_ID]
    }, "target-plan-items-kind"),
    (error) => error.code === "22023" && /tipo incompatível/iu.test(error.message)
  );
  for (const [requestId, invalidCommand] of [
    ["target-plan-items-extra", { ...targetPlanItemsCommand, extra: true }],
    ["target-plan-items-scope", {
      ...targetPlanItemsCommand,
      scope: { kind: "course", ref: COURSE }
    }],
    ["target-plan-items-repeat", {
      ...targetPlanItemsCommand,
      instructionalAnalysisUnitIds: [
        DESIGN_ANALYSIS_IDS[0], DESIGN_ANALYSIS_IDS[0]
      ]
    }],
    ["target-plan-items-uuid", {
      ...targetPlanItemsCommand,
      instructionalAnalysisUnitIds: ["nao-e-uuid"]
    }],
    ["target-plan-items-missing", {
      ...targetPlanItemsCommand,
      instructionalAnalysisUnitIds: [
        "51000000-0000-4000-8000-999999999999"
      ]
    }]
  ]) {
    await assert.rejects(
      () => applyDesignCommand(database, 5, invalidCommand, requestId),
      (error) => error.code === "22023"
    );
  }
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSE, LEARNER, OWNER]);
  await actor(database, LEARNER, "service_role");
  await assert.rejects(() => scalar(database, `
    select public.apply_course_design_command_for_actor_v1(
      $1,$2,5,$3,'application','target-plan-owner-1'
    ) as value
  `, [LEARNER, COURSE, targetPlanItemsCommand]), (error) => error.code === "42501");
  await actor(database, OWNER, "service_role");
  assert.equal(await scalar(database, `
    select not exists(
      select 1
      from unnest(array['select','insert','update','delete']) privilege(value)
      where has_table_privilege(
        'service_role','private.course_design_target_plan_items',privilege.value
      )
    ) as value
  `), true);

  const materializationId = "53000000-0000-4000-8000-000000000001";
  const stepId = "53000000-0000-4000-8000-000000000002";
  const start = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,5,0,'start',$5,'application','design-start-01'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    authoringPartVersion: 1,
    steps: [{
      id: stepId,
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-a",
      productionPosition: 0
    }]
  }]);
  assert.equal(start.courseRevision, 6);
  assert.equal(start.materialization.designContext.contract, "aralearn.course-design-context.v1");
  assert.equal(start.materialization.designContext.instructionalAnalysisUnits.length, 7);
  assert.equal(start.materialization.designContext.evidenceRequirements.length, 1);
  assert.deepEqual(
    Object.keys(start.materialization.designContext.instructionalAnalysisUnits[0]).sort(),
    ["id", "position", "statement", "version"]
  );
  assert.deepEqual(
    start.materialization.designContext.targets[0].instructionalAnalysisUnitIds,
    DESIGN_ANALYSIS_IDS
  );
  assert.deepEqual(
    start.materialization.designContext.targets[0].evidenceRequirementIds,
    [DESIGN_EVIDENCE_ID]
  );
  assert.equal(start.materialization.designContext.targets[0].guidanceRevisionIds.length, 1);
  assert.match(start.materialization.contextHash, /^[a-f0-9]{64}$/u);

  const resumed = await scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId]);
  assert.equal(resumed.materialization.contextHash, start.materialization.contextHash);
  assert.deepEqual(resumed.materialization.designContext, start.materialization.designContext);

  const planBeforeStatementEdit = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const editedStatement = "Relação DNS–DHCP revista depois do início.";
  const planAfterStatementEdit = structuredClone(planBeforeStatementEdit);
  planAfterStatementEdit.instructionalAnalysisUnits =
    planAfterStatementEdit.instructionalAnalysisUnits.map((item) => (
      item.id === DESIGN_ANALYSIS_IDS[0]
        ? { ...item, statement: editedStatement }
        : item
    ));
  const statementChange = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,6,1,$3,$4,'application','design-statement-1'
    ) as value
  `, [OWNER, COURSE, {
    type: "update_plan"
  }, planAfterStatementEdit]);
  assert.equal(statementChange.courseRevision, 7);
  assert.equal(statementChange.planVersion, 2);
  const remappedIds = DESIGN_ANALYSIS_IDS.slice(0, 6);
  const remapped = await applyDesignCommand(database, 7, {
    ...targetPlanItemsCommand,
    instructionalAnalysisUnitIds: remappedIds
  }, "target-plan-items-02");
  assert.equal(remapped.courseRevision, 8);
  const oldAfterCatalogChanges = await scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId]);
  assert.equal(
    oldAfterCatalogChanges.materialization.contextHash,
    start.materialization.contextHash
  );
  assert.deepEqual(
    oldAfterCatalogChanges.materialization.designContext,
    start.materialization.designContext
  );

  const denseApplication = {
    contextHash: start.materialization.contextHash,
    didacticMicrosequenceId: "micro-a",
    studyUnits: [{
      studyUnitId: "dense-unit",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: DESIGN_ANALYSIS_IDS,
      explanationApplications: DESIGN_ANALYSIS_IDS.map((id) => ({
        instructionalAnalysisUnitId: id,
        developedForms: ["plain_definition"],
        notApplicable: []
      })),
      practiceApplications: [],
      componentRefs: ["aralearn.resource.paragraph@1.0.0"]
    }]
  };
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,8,1,'record_step',$5,'application','design-dense-01'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    stepId,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: studyUnitUpserts(denseApplication, "aralearn.resource.paragraph"),
      deletes: [{ entityType: "study_unit", entityId: "card-a" }]
    },
    designApplication: denseApplication
  }]), /Aplicação factual/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 8);

  const paragraphRef = "aralearn.resource.paragraph@1.0.0";
  const application = materializationApplication({
    contextHash: start.materialization.contextHash,
    componentRef: paragraphRef
  });
  const mismatched = structuredClone(application);
  mismatched.studyUnits[0].componentRefs = [];
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,8,1,'record_step',$5,'application','design-refs-001'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    stepId,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: studyUnitUpserts(application, "aralearn.resource.paragraph"),
      deletes: [{ entityType: "study_unit", entityId: "card-a" }]
    },
    designApplication: mismatched
  }]), /Referências declaradas divergem/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_type='study_unit'
      and entity_id like 'designed-%'
  `, [COURSE]), 0);

  const recorded = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,8,1,'record_step',$5,'application','design-record-01'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    stepId,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: { audit: "structured" },
    entityChanges: {
      upserts: studyUnitUpserts(application, "aralearn.resource.paragraph"),
      deletes: [{ entityType: "study_unit", entityId: "card-a" }]
    },
    designApplication: application
  }]);
  assert.equal(recorded.courseRevision, 9);
  assert.equal(recorded.step.status, "completed");
  assert.equal(await scalar(database, `
    select result_facts->'designApplication' = $3::jsonb as value
    from private.course_authoring_part_materialization_steps
    where materialization_id=$1 and id=$2
  `, [materializationId, stepId, application]), true);

  await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,9,2,'finish',$5,'application','design-finish-01'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    status: "completed",
    resultFacts: { audit: "structured" }
  }]);
  await scalar(database, `
    select public.apply_course_design_command_for_actor_v1(
      $1,$2,10,$3,'application','design-policy-1'
    ) as value
  `, [OWNER, COURSE, {
    type: "set_component_policy",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    policy: {
      catalogVersion: "1-3e5629f8",
      availability: "all",
      allowedRefs: [],
      excludedRefs: [paragraphRef],
      preferredRefs: []
    },
    origin: "author",
    reason: "O próximo lote precisa substituir o componente textual."
  }]);

  const nextMaterializationId = "53000000-0000-4000-8000-000000000003";
  const nextStepId = "53000000-0000-4000-8000-000000000004";
  const nextStart = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,11,0,'start',$5,'application','design-start-02'
    ) as value
  `, [OWNER, COURSE, plan.partId, nextMaterializationId, {
    authoringPartVersion: 1,
    steps: [{
      id: nextStepId,
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-a",
      productionPosition: 0
    }]
  }]);
  assert.notEqual(
    nextStart.materialization.contextHash,
    start.materialization.contextHash
  );
  assert.equal(
    nextStart.materialization.designContext.instructionalAnalysisUnits.length,
    6
  );
  assert.equal(
    nextStart.materialization.designContext.instructionalAnalysisUnits[0].statement,
    editedStatement
  );
  assert.equal(
    nextStart.materialization.designContext.instructionalAnalysisUnits[0].version,
    2
  );
  assert.deepEqual(
    nextStart.materialization.designContext.targets[0].instructionalAnalysisUnitIds,
    remappedIds
  );
  const codeRef = "aralearn.resource.code@1.0.0";
  const replacementApplication = materializationApplication({
    contextHash: nextStart.materialization.contextHash,
    prefix: "replacement",
    componentRef: codeRef,
    analysisIds: remappedIds
  });
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,12,1,'record_step',$5,'application','design-policy-2'
    ) as value
  `, [OWNER, COURSE, plan.partId, nextMaterializationId, {
    stepId: nextStepId,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: studyUnitUpserts(
        replacementApplication,
        "aralearn.resource.code",
        7
      ),
      deletes: []
    },
    designApplication: replacementApplication
  }]), /viola a política selada/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 12);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_type='study_unit'
      and entity_id like 'replacement-%'
  `, [COURSE]), 0);

  const recent = await scalar(database, `
    select public.get_owned_course_design_for_actor_v1(
      $1::uuid,$2::uuid,'didactic_microsequence','micro-a',32,null
    ) as value
  `, [OWNER, COURSE]);
  assert.deepEqual(normalizeCourseDesignRead(recent), recent);
  assert.equal(recent.recentApplications.length, 1);
  assert.equal(recent.recentApplications[0].studyUnitCount, 6);
  assert.deepEqual(recent.recentApplications[0].developedExplanationForms, DESIGN_FORMS);
  await database.close();
});

test("#122 audita somente os itens atribuídos a cada uma de duas microssequências", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");
  const plan = await scalar(database, `
    select jsonb_build_object('id',id,'partId',(
      select part.id from private.course_authoring_parts part
      where part.course_id=plan.course_id and part.retired_at is null
      order by part.position limit 1
    )) as value
    from private.course_instructional_plans plan where course_id=$1
  `, [COURSE]);
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values(
      $1,'microsequence','micro-b','lesson','lesson-a',1,
      '{"title":"Micro B","dependsOn":[]}'
    )
  `, [COURSE]);
  await database.query(`
    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    ) values($1,$2,'micro-b',1)
  `, [COURSE, plan.partId]);
  for (const [position, id] of DESIGN_ANALYSIS_IDS.entries()) {
    await database.query(`
      insert into private.course_instructional_plan_items(
        id,course_id,instructional_plan_id,item_kind,position,statement
      ) values($1,$2,$3,'instructional_analysis_unit',$4,$5)
    `, [id, COURSE, plan.id, position, `Unidade atribuída ${position + 1}.`]);
  }
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values
      ($1,$2,$3,'evidence_requirement',0,'Evidência exclusiva A.'),
      ($4,$2,$3,'evidence_requirement',1,'Evidência exclusiva B.')
  `, [DESIGN_EVIDENCE_ID, COURSE, plan.id, DESIGN_EVIDENCE_ID_B]);

  const analysisA = DESIGN_ANALYSIS_IDS.slice(0, 3);
  const analysisB = DESIGN_ANALYSIS_IDS.slice(3);
  await applyDesignCommand(database, 4, {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: analysisA,
    evidenceRequirementIds: [DESIGN_EVIDENCE_ID]
  }, "target-split-micro-a");
  await applyDesignCommand(database, 5, {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-b" },
    instructionalAnalysisUnitIds: analysisB,
    evidenceRequirementIds: [DESIGN_EVIDENCE_ID_B]
  }, "target-split-micro-b");

  const materializationId = "54000000-0000-4000-8000-000000000001";
  const stepA = "54000000-0000-4000-8000-000000000002";
  const stepB = "54000000-0000-4000-8000-000000000003";
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,6,0,'start',$5,'application','target-split-start'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    authoringPartVersion: 1,
    steps: [{
      id: stepA,
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-a",
      productionPosition: 0
    }, {
      id: stepB,
      position: 1,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-b",
      productionPosition: 1
    }]
  }]);
  assert.equal(started.courseRevision, 7);
  assert.deepEqual(
    started.materialization.designContext.instructionalAnalysisUnits.map(({ id }) => id),
    DESIGN_ANALYSIS_IDS
  );
  assert.deepEqual(
    started.materialization.designContext.evidenceRequirements.map(({ id }) => id),
    [DESIGN_EVIDENCE_ID, DESIGN_EVIDENCE_ID_B]
  );
  assert.deepEqual(
    started.materialization.designContext.targets.map((target) => ({
      id: target.didacticMicrosequenceId,
      analysis: target.instructionalAnalysisUnitIds,
      evidence: target.evidenceRequirementIds
    })),
    [{
      id: "micro-a",
      analysis: analysisA,
      evidence: [DESIGN_EVIDENCE_ID]
    }, {
      id: "micro-b",
      analysis: analysisB,
      evidence: [DESIGN_EVIDENCE_ID_B]
    }]
  );

  const paragraphRef = "aralearn.resource.paragraph@1.0.0";
  const applicationA = materializationApplication({
    contextHash: started.materialization.contextHash,
    prefix: "split-a",
    componentRef: paragraphRef,
    analysisIds: analysisA,
    evidenceRequirementId: DESIGN_EVIDENCE_ID
  });
  const applicationB = materializationApplication({
    contextHash: started.materialization.contextHash,
    prefix: "split-b",
    componentRef: paragraphRef,
    didacticMicrosequenceId: "micro-b",
    analysisIds: analysisB,
    evidenceRequirementId: DESIGN_EVIDENCE_ID_B
  });
  const recordedA = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,7,1,'record_step',$5,'application','target-split-a'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    stepId: stepA,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: studyUnitUpserts(applicationA, "aralearn.resource.paragraph"),
      deletes: [{ entityType: "study_unit", entityId: "card-a" }]
    },
    designApplication: applicationA
  }]);
  assert.equal(recordedA.courseRevision, 8);

  const omittedB = structuredClone(applicationB);
  const lastExpository = omittedB.studyUnits.findLast(({ mode }) => mode === "expository");
  lastExpository.introducedInstructionalAnalysisUnitIds.pop();
  lastExpository.explanationApplications.pop();
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,8,2,'record_step',$5,'application','target-split-omit'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    stepId: stepB,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: studyUnitUpserts(omittedB, "aralearn.resource.paragraph"),
      deletes: []
    },
    designApplication: omittedB
  }]), /Aplicação factual/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_entities
    where course_id=$1 and entity_type='study_unit'
      and entity_id like 'split-b-%'
  `, [COURSE]), 0);

  const recordedB = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,8,2,'record_step',$5,'application','target-split-b'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    stepId: stepB,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: studyUnitUpserts(applicationB, "aralearn.resource.paragraph"),
      deletes: []
    },
    designApplication: applicationB
  }]);
  assert.equal(recordedB.courseRevision, 9);
  await database.close();
});
