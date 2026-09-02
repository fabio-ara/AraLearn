import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  normalizeCourseDesignRead
} from "../../src/domain/courseDesignParameters.js";
import { validateCourseEntityContent } from "../../src/domain/aralearnProject.js";
import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

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
const courseSourcesMigrationUrl = new URL(
  "../../supabase/migrations/20260817190000_course_sources_provenance.sql",
  import.meta.url
);
const analysisDecompositionMigrationUrl = new URL(
  "../../supabase/migrations/20260831183106_fix_analysis_unit_study_unit_decomposition.sql",
  import.meta.url
);
const courseSourceHumanLocatorsMigrationUrl = new URL(
  "../../supabase/migrations/20260825190000_course_source_human_locators.sql",
  import.meta.url
);
const continuousAuthoringInspectionMigrationUrl = new URL(
  "../../supabase/migrations/20260826090000_continuous_authoring_inspection.sql",
  import.meta.url
);
const unitAnnotationScopeMigrationUrl = new URL(
  "../../supabase/migrations/20260826093000_align_unit_annotation_scope_with_materialization.sql",
  import.meta.url
);
const scopedContinuousInspectionMigrationUrl = new URL(
  "../../supabase/migrations/20260826094500_preserve_inspection_v1_and_scope_design_verification.sql",
  import.meta.url
);
const courseRlsActorLookupMigrationUrl = new URL(
  "../../supabase/migrations/20260826143846_optimize_course_rls_actor_lookup.sql",
  import.meta.url
);
const boundedInstructionalPlanCasMigrationUrl = new URL(
  "../../supabase/migrations/20260827185748_bound_instructional_plan_cas_retry.sql",
  import.meta.url
);
const inspectionFocusMigrationUrl = new URL(
  "../../supabase/migrations/20260828120000_course_inspection_focuses.sql",
  import.meta.url
);
const contextualCompositionMigrationUrl = new URL(
  "../../supabase/migrations/20260820224424_canonical_study_unit_composition_edits.sql",
  import.meta.url
);
const personalCourseCopyMigrationUrl = new URL(
  "../../supabase/migrations/20260821145358_personal_course_copy_edit.sql",
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

function sourceDocument(overrides = {}) {
  return {
    kind: "document",
    title: "Fonte verificada",
    authorship: "Autoria",
    publicationDate: "2026",
    identifier: null,
    language: "pt-BR",
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "external",
    availability: "unknown",
    verificationStatus: "author_verified",
    studyVisibility: "hidden",
    ...overrides
  };
}

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function actor(database, actorId, role = "authenticated") {
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actorId]);
  await database.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
}

function isPgrstConflict(error, expectedMessage) {
  try {
    const payload = JSON.parse(error.message);
    const transport = JSON.parse(error.detail);
    return error.code === "PGRST" && payload.code === "40001" &&
      payload.message === expectedMessage && payload.details === null &&
      payload.hint === null && transport.status === 409 &&
      Object.keys(transport.headers).length === 0;
  } catch {
    return false;
  }
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
  pre1800Materialization = false,
  preservedMaterializationState = false
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
  if (preservedMaterializationState) {
    await database.exec(`
      insert into private.authoring_materialization_states values(1)
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

async function applyCourseSourcesMigration(database) {
  await database.exec(await fs.readFile(courseSourcesMigrationUrl, "utf8"));
  const manifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  manifest.schemaRevision = "20260824174101";
  const literal = JSON.stringify(manifest).replaceAll("'", "''");
  await database.exec(`
    create or replace function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $manifest$
      select '${literal}'::jsonb
    $manifest$;
  `);
  await database.exec(await fs.readFile(courseSourceHumanLocatorsMigrationUrl, "utf8"));
}

async function applyAnalysisDecompositionMigration(database) {
  const manifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  manifest.schemaRevision = "20260831012600";
  const literal = JSON.stringify(manifest).replaceAll("'", "''");
  await database.exec(`
    create or replace function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $manifest$
      select '${literal}'::jsonb
    $manifest$;
  `);
  await database.exec(await fs.readFile(analysisDecompositionMigrationUrl, "utf8"));
}

async function applyBoundedInstructionalPlanCasMigration(database) {
  const manifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  manifest.schemaRevision = "20260826143846";
  const literal = JSON.stringify(manifest).replaceAll("'", "''");
  await database.exec(`
    create or replace function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $manifest$
      select '${literal}'::jsonb
    $manifest$;
  `);
  await database.exec(await fs.readFile(
    boundedInstructionalPlanCasMigrationUrl,
    "utf8"
  ));
}

async function applyInspectionFocusMigration(database) {
  await database.exec(`
    do $normalize_receipt_constraint$
    declare v_name text;
    begin
      select constraint_value.conname into v_name
      from pg_constraint constraint_value
      where constraint_value.conrelid='private.course_change_receipts'::regclass
        and constraint_value.conname like 'course_change_receipts_operation_v%';
      if v_name <> 'course_change_receipts_operation_v8' then
        execute format(
          'alter table private.course_change_receipts rename constraint %I to course_change_receipts_operation_v8',
          v_name
        );
      end if;
    end
    $normalize_receipt_constraint$;
  `);
  await database.exec(await fs.readFile(inspectionFocusMigrationUrl, "utf8"));
}

async function applyContinuousAuthoringInspectionMigration(database) {
  await database.exec(await fs.readFile(continuousAuthoringInspectionMigrationUrl, "utf8"));
  await database.exec(await fs.readFile(unitAnnotationScopeMigrationUrl, "utf8"));
  await database.exec(await fs.readFile(scopedContinuousInspectionMigrationUrl, "utf8"));
  await database.exec(`
    alter table public.courses enable row level security;
    create policy courses_access_v1 on public.courses
      for select to authenticated
      using(private.course_ownership_v1(id,auth.uid()) is not null);

    alter table private.course_entities enable row level security;
    create policy course_entities_access_v1 on private.course_entities
      for select to authenticated
      using(private.course_ownership_v1(course_id,auth.uid()) is not null);

    alter table public.course_access enable row level security;
    create policy course_access_self_v1 on public.course_access
      for select to authenticated using(user_id=auth.uid());

    alter table public.course_personal_states enable row level security;
    create policy course_personal_states_owner_v1 on public.course_personal_states
      for all to authenticated
      using(
        user_id=auth.uid()
        and private.course_ownership_v1(course_id,auth.uid()) is not null
      )
      with check(
        user_id=auth.uid()
        and private.course_ownership_v1(course_id,auth.uid()) is not null
      );
  `);
  await database.exec(await fs.readFile(courseRlsActorLookupMigrationUrl, "utf8"));
}

async function applyContextualCompositionMigration(database) {
  const manifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  manifest.schemaRevision = "20260820101500";
  const literal = JSON.stringify(manifest).replaceAll("'", "''");
  await database.exec(`
    create or replace function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $manifest$
      select '${literal}'::jsonb
    $manifest$;
  `);
  await database.exec(await fs.readFile(contextualCompositionMigrationUrl, "utf8"));
}

async function applyPersonalCourseCopyMigration(database) {
  await database.exec(`
    do $normalize_receipt_constraint$
    declare
      v_name text;
    begin
      select constraint_value.conname into v_name
      from pg_constraint constraint_value
      where constraint_value.conrelid='private.course_change_receipts'::regclass
        and constraint_value.conname like 'course_change_receipts_operation_v%';
      if v_name <> 'course_change_receipts_operation_v7' then
        execute format(
          'alter table private.course_change_receipts rename constraint %I to course_change_receipts_operation_v7',
          v_name
        );
      end if;
    end;
    $normalize_receipt_constraint$;
  `);
  await database.exec(await fs.readFile(personalCourseCopyMigrationUrl, "utf8"));
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
        componentRefs: [componentRef, "aralearn.response.choice@1.0.0"].sort()
      },
      {
        studyUnitId: `${prefix}-practice-2`,
        mode: "practice",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [],
        practiceApplications: [practice("dns-case-b")],
        componentRefs: [componentRef, "aralearn.response.choice@1.0.0"].sort()
      }] : [])
    ]
  };
}

function studyUnitUpserts(application, packageId, firstPosition = 1) {
  const contentContract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, "1.0.0");
  const responseContract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.response.choice",
    "1.0.0"
  );
  return application.studyUnits.map((studyUnit, index) => {
    const position = firstPosition + index;
    const candidate = {
      id: studyUnit.studyUnitId,
      position,
      title: `Unidade factual ${index + 1}`,
      role: studyUnit.mode === "practice" ? "practice" : "theory",
      content: [{
        id: `${studyUnit.studyUnitId}-content`,
        package: packageId,
        version: "1.0.0",
        data: structuredClone(contentContract.contract.example)
      }],
      response: studyUnit.mode === "practice" ? {
        id: `${studyUnit.studyUnitId}-response`,
        package: "aralearn.response.choice",
        version: "1.0.0",
        data: structuredClone(responseContract.contract.example)
      } : null,
      feedback: [],
      topics: ["DNS", "DHCP"]
    };
    const validation = validateCourseEntityContent("study_unit", candidate);
    assert.equal(validation.valid, true, validation.errors.join(" "));
    const content = structuredClone(validation.normalized);
    delete content.id;
    delete content.position;
    return {
      entityType: "study_unit",
      entityId: studyUnit.studyUnitId,
      parentType: "microsequence",
      parentId: application.didacticMicrosequenceId,
      position,
      content
    };
  });
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

async function executeCourseSourceCommand(
  database,
  expectedRevision,
  command,
  requestId,
  actorId = OWNER
) {
  return scalar(database, `
    select public.execute_course_source_command_for_actor_v1(
      $1,$2,$3,$4::jsonb,'application',$5
    ) as value
  `, [actorId, COURSE, expectedRevision, command, requestId]);
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
  const nextPartId = "61000000-0000-4000-8000-000000000001";
  const nextPartTarget = structuredClone(itemTarget);
  nextPartTarget.parts.push({
    id: nextPartId,
    position: 1,
    title: "Próxima Parte",
    intent: "Continuar o planejamento sem alterar a Parte em execução.",
    microsequenceIds: []
  });
  const nextPartChanged = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application','request-running-next-part'
    ) as value
  `, [
    OWNER,
    COURSE,
    itemChanged.courseRevision,
    itemChanged.planVersion,
    {
      type: "add_part",
      id: nextPartId,
      position: 1,
      title: "Próxima Parte",
      intent: "Continuar o planejamento sem alterar a Parte em execução."
    },
    nextPartTarget
  ]);
  assert.equal(nextPartChanged.changed, true);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_authoring_parts
    where course_id=$1 and retired_at is null
  `, [COURSE]), 2);
  const partTarget = structuredClone(nextPartTarget);
  partTarget.parts[0].intent = "Intenção alterada durante execução.";
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application','request-running-part'
    ) as value
  `, [
    OWNER,
    COURSE,
    nextPartChanged.courseRevision,
    nextPartChanged.planVersion,
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

test("#269 persiste Parte por Parte, aceita Fonte intermediária e retoma revisão anterior", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  let plan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const firstPartId = plan.parts[0].id;
  assert.equal(plan.parts.length, 1);
  assert.deepEqual(plan.preferredPartCount, {
    minimum: 7,
    maximum: 12,
    origin: "automatic"
  });
  plan.parts[0].title = "Parte 1 revista antes de continuar";
  plan.parts[0].intent = "Delimitar a decisão corrente sem antecipar as demais Partes.";
  const revisedFirst = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3::jsonb,$4::jsonb,'application','incremental-part-one'
    ) as value
  `, [OWNER, COURSE, {
    type: "update_part",
    id: firstPartId,
    title: plan.parts[0].title,
    intent: plan.parts[0].intent
  }, plan]);
  assert.equal(revisedFirst.courseRevision, 5);
  assert.equal(revisedFirst.planVersion, 2);

  const sourceId = "source-incremental-plan";
  const sourceSaved = await executeCourseSourceCommand(database, 5, {
    type: "save_source",
    sourceId,
    expectedSourceRevision: 0,
    source: sourceDocument({
      title: "Fonte acrescentada durante o planejamento",
      citationText: "AUTOR. Fonte acrescentada durante o planejamento.",
      studyVisibility: "citation"
    })
  }, "incremental-source-save");
  assert.equal(sourceSaved.courseRevision, 6);
  const anchorId = "anchor-incremental-plan";
  const anchorSaved = await executeCourseSourceCommand(database, 6, {
    type: "save_anchor",
    anchorId,
    sourceId,
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 1, endPage: 1 },
    verificationExcerpt: "Trecho focal acrescentado entre a Parte 1 e a Parte 2."
  }, "incremental-source-anchor");
  assert.equal(anchorSaved.courseRevision, 7);

  const analysisId = "61000000-0000-4000-8000-000000000010";
  const sourceLink = {
    sourceId,
    sourceRevision: 1,
    relation: "informed_by",
    anchors: [{ anchorId, anchorRevision: 1 }]
  };
  plan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const analysis = {
    id: analysisId,
    position: plan.instructionalAnalysisUnits.length,
    statement: "A Fonte intermediária informa uma relação da próxima Parte.",
    sourceLinks: [sourceLink]
  };
  plan.instructionalAnalysisUnits.push(analysis);
  const sourcedPlan = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,7,2,$3::jsonb,$4::jsonb,'application','incremental-source-link'
    ) as value
  `, [OWNER, COURSE, {
    type: "add_plan_item",
    kind: "instructional_analysis_unit",
    ...analysis
  }, plan]);
  assert.equal(sourcedPlan.courseRevision, 8);
  assert.equal(sourcedPlan.planVersion, 3);

  const secondPartId = "61000000-0000-4000-8000-000000000011";
  plan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const secondPart = {
    id: secondPartId,
    position: plan.parts.length,
    title: "Parte 2 proposta depois da decisão",
    intent: "Continuar a partir da Parte 1 e da Fonte incorporada.",
    microsequenceIds: []
  };
  plan.parts.push(secondPart);
  const addedSecond = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,8,3,$3::jsonb,$4::jsonb,'application','incremental-part-two'
    ) as value
  `, [OWNER, COURSE, {
    type: "add_part",
    id: secondPartId,
    position: 1,
    title: secondPart.title,
    intent: secondPart.intent
  }, plan]);
  assert.equal(addedSecond.courseRevision, 9);
  assert.equal(addedSecond.planVersion, 4);

  const resumed = await scalar(database, `
    select public.get_owned_course_instructional_plan_for_actor_v1(
      $1,$2,20
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(resumed.plan.parts.length, 2);
  assert.deepEqual(resumed.plan.instructionalAnalysisUnits.find(({ id }) => (
    id === analysisId
  )).sourceLinks, [sourceLink]);
  assert.equal(resumed.plan.parts[0].title, "Parte 1 revista antes de continuar");

  plan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  plan.parts[0].intent = "Parte anterior reaberta depois da criação da Parte 2.";
  const reopened = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,9,4,$3::jsonb,$4::jsonb,'application','incremental-part-one-reopen'
    ) as value
  `, [OWNER, COURSE, {
    type: "update_part",
    id: firstPartId,
    title: plan.parts[0].title,
    intent: plan.parts[0].intent
  }, plan]);
  assert.equal(reopened.courseRevision, 10);
  assert.equal(reopened.planVersion, 5);
  const finalPlan = await scalar(database, `
    select public.get_owned_course_instructional_plan_for_actor_v1(
      $1,$2,20
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(finalPlan.plan.parts[0].intent,
    "Parte anterior reaberta depois da criação da Parte 2.");
  assert.equal(finalPlan.plan.parts[1].id, secondPartId);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_instructional_plans where course_id=$1
  `, [COURSE]), 1);
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

async function continuousInspectionPage(database, options = {}) {
  const {
    actorId = OWNER,
    revision = 4,
    scopeKind = "course",
    scopeId = null,
    anchorStudyUnitId = null,
    cursorStudyUnitId = null,
    direction = "forward",
    limit = 12,
    maxBytes = 1_500_000
  } = options;
  return scalar(database, `
    select public.list_owned_course_study_units_for_actor_v2(
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

test("inspeção contínua projeta pendências e estado autoral sem N+1", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.exec(`
    update private.course_entities
    set content = content || '{"sources":[]}'::jsonb
    where entity_type = 'study_unit';
  `);
  await applyCourseSourcesMigration(database);
  await database.exec(`
    create table private.course_anchored_annotations(
      id uuid not null default pg_catalog.gen_random_uuid(),
      course_id uuid not null,
      target_kind text not null,
      target_id text not null,
      state text not null,
      hard_delete_after timestamptz,
      version bigint not null default 1,
      primary key(course_id,id)
    );
    create table private.course_audit_finding_annotations(
      course_id uuid not null,
      finding_id uuid not null,
      annotation_id uuid not null
    );
    create table private.course_instructional_audit_runs(
      course_id uuid not null,
      id uuid not null,
      course_revision bigint not null,
      target_version bigint not null,
      checks jsonb not null default '[]'::jsonb
    );
    create table private.course_authoring_corrections(
      course_id uuid not null,
      target_study_unit_id text not null,
      status text not null,
      verification jsonb
    );
    create function private.execute_course_audit_cycle_command_core_v1(
      uuid,uuid,bigint,jsonb,text,text
    ) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function private.execute_course_anchored_annotation_command_core_v1(
      uuid,uuid,bigint,jsonb,text,text,text,boolean
    ) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function private.course_audit_change_from_receipt_v1(jsonb,boolean)
      returns jsonb language sql as $$select '{}'::jsonb$$;
    insert into private.course_anchored_annotations(
      course_id,target_kind,target_id,state,hard_delete_after
    ) values
      ('${COURSE}','study_unit','card-a','open',null),
      ('${COURSE}','study_unit','card-a','considered',null),
      ('${COURSE}','study_unit','card-a','withdrawn',null);

    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values(
      '${COURSE}','microsequence','micro-b','lesson','lesson-a',1,
      '{"title":"Micro B","dependsOn":[]}'
    );
    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    ) select '${COURSE}',id,'micro-b',1
      from private.course_authoring_parts
      where course_id='${COURSE}' and retired_at is null
      order by position limit 1;

    with target_part as (
      select id,version from private.course_authoring_parts
      where course_id='${COURSE}' and retired_at is null
      order by position limit 1
    ), context_value as (
      select target_part.id,target_part.version,
        private.course_materialization_design_context_core_v1(
          '${COURSE}',target_part.id,4,
          '[{"kind":"didactic_microsequence_materialization","targetDidacticMicrosequenceId":"micro-a","productionPosition":0},{"kind":"didactic_microsequence_materialization","targetDidacticMicrosequenceId":"micro-b","productionPosition":1}]'
        ) as value
      from target_part
    )
    insert into private.course_authoring_part_materializations(
      id,course_id,authoring_part_id,authoring_part_version,actor_id,
      channel,status,design_context,result_facts,completed_at
    ) select
      '61000000-0000-4000-8000-000000000001','${COURSE}',id,version,
      '${OWNER}','mcp','completed',value,'{}',now()
    from context_value;

    insert into private.course_authoring_part_materialization_steps(
      id,course_id,materialization_id,position,step_kind,
      target_didactic_microsequence_id,production_position,status,
      result_facts,completed_at
    ) values(
      '61000000-0000-4000-8000-000000000002','${COURSE}',
      '61000000-0000-4000-8000-000000000001',0,
      'didactic_microsequence_materialization','micro-a',0,'completed',
      '{"designApplication":{"studyUnits":[{"studyUnitId":"card-a"}]}}',now()
    ),(
      '61000000-0000-4000-8000-000000000003','${COURSE}',
      '61000000-0000-4000-8000-000000000001',1,
      'didactic_microsequence_materialization','micro-b',1,'completed',
      '{"designApplication":{"studyUnits":[]}}',now()
    );
  `);
  await actor(database, OWNER, "service_role");
  const unrelatedDesignChange = await applyDesignCommand(database, 4, {
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: "micro-b" },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 4,
    origin: "author",
    reason: "Alterar somente outra microssequência."
  }, "inspection-unrelated-design-change-0001");
  assert.equal(unrelatedDesignChange.courseRevision, 5);
  await applyContinuousAuthoringInspectionMigration(database);
  const unaffectedPage = await continuousInspectionPage(database, {
    revision: 5,
    limit: 12
  });
  assert.equal(unaffectedPage.items[0].authorship.design.state, "current");

  const designChange = await applyDesignCommand(database, 5, {
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 3,
    origin: "author",
    reason: "Confrontar a produção com o desenho vigente."
  }, "inspection-design-change-0001");
  assert.equal(designChange.courseRevision, 6);

  const legacyPage = await inspectionPage(database, { revision: 6, limit: 12 });
  assert.equal(legacyPage.contract, "aralearn.course-study-unit-inspection-page.v1");
  assert.equal(Object.hasOwn(legacyPage.items[0], "authorship"), false);

  const page = await continuousInspectionPage(database, { revision: 6, limit: 12 });
  assert.equal(page.contract, "aralearn.course-study-unit-inspection-page.v2");
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].authorship.pendingObservationCount, 2);
  assert.equal(page.items[0].authorship.production.state, "produced");
  assert.equal(page.items[0].authorship.production.currentMaterialization, true);
  assert.equal(page.items[0].authorship.design.state, "changed");
  assert.equal(page.items[0].authorship.design.used.parameters.length, 4);
  assert.equal(
    page.items[0].authorship.design.used.parameters[0].value,
    2
  );
  assert.equal(
    page.items[0].authorship.design.current.parameters[0].value,
    3
  );

  await database.exec(`
    insert into private.course_instructional_audit_runs(
      course_id,id,course_revision,target_version,checks
    ) values(
      '${COURSE}','62000000-0000-4000-8000-000000000001',6,1,
      '[{"dimension":"structural_conformance","result":"passed","criterion":{"code":"unrelated_accessibility_repair"}}]'
    );
    insert into private.course_authoring_corrections(
      course_id,target_study_unit_id,status,verification
    ) values(
      '${COURSE}','card-a','verified',
      '{"auditRunId":"62000000-0000-4000-8000-000000000001","outcome":"resolved"}'
    );
  `);
  const unrelatedVerification = await continuousInspectionPage(database, {
    revision: 6,
    limit: 12
  });
  assert.equal(unrelatedVerification.items[0].authorship.design.state, "changed");

  await database.exec(`
    insert into private.course_instructional_audit_runs(
      course_id,id,course_revision,target_version,checks
    ) values(
      '${COURSE}','62000000-0000-4000-8000-000000000002',6,1,
      '[{"dimension":"structural_conformance","result":"passed","criterion":{"code":"current_design_alignment"}}]'
    );
    insert into private.course_authoring_corrections(
      course_id,target_study_unit_id,status,verification
    ) values(
      '${COURSE}','card-a','verified',
      '{"auditRunId":"62000000-0000-4000-8000-000000000002","outcome":"resolved"}'
    );
  `);
  const alignedVerification = await continuousInspectionPage(database, {
    revision: 6,
    limit: 12
  });
  assert.equal(alignedVerification.items[0].authorship.design.state, "verified");
  const manifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  assert.equal(manifest.schemaRevision, "20260826143846");
  assert.equal(manifest.features.includes("continuous-authoring-inspection-v1"), true);
  const optimizedPolicies = await database.query(`
    select polname,
      pg_get_expr(polqual,polrelid) as using_expression,
      pg_get_expr(polwithcheck,polrelid) as check_expression
    from pg_policy
    where polname in(
      'courses_access_v1','course_entities_access_v1',
      'course_access_self_v1','course_personal_states_owner_v1'
    )
    order by polname
  `);
  assert.equal(optimizedPolicies.rows.length, 4);
  for (const policy of optimizedPolicies.rows) {
    assert.match(policy.using_expression, /SELECT auth\.uid\(\)/iu);
  }
  assert.match(
    optimizedPolicies.rows.find(({ polname }) =>
      polname === "course_personal_states_owner_v1"
    ).check_expression,
    /SELECT auth\.uid\(\)/iu
  );
  await applyBoundedInstructionalPlanCasMigration(database);
  await applyInspectionFocusMigration(database);
  await actor(database, OWNER, "service_role");
  const createdFocus = await scalar(database, `
    select public.create_course_inspection_focus_for_actor_v1(
      $1,$2,6,'Microssequência · Micro A','["card-a"]'::jsonb,
      'inspection-focus-create-0001'
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(createdFocus.contract, "aralearn.course-inspection-focus.v1");
  assert.equal(createdFocus.courseRevision, 6);
  assert.deepEqual(createdFocus.studyUnitIds, ["card-a"]);
  assert.equal(createdFocus.idempotent, false);
  assert.equal(await scalar(database, `
    select revision::integer as value from public.courses where id=$1
  `, [COURSE]), 6);
  const replayedFocus = await scalar(database, `
    select public.create_course_inspection_focus_for_actor_v1(
      $1,$2,6,'Microssequência · Micro A','["card-a"]'::jsonb,
      'inspection-focus-create-0001'
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(replayedFocus.inspectionFocusId, createdFocus.inspectionFocusId);
  assert.equal(replayedFocus.idempotent, true);
  const focusedPage = await scalar(database, `
    select public.list_owned_course_inspection_focus_units_for_actor_v1(
      $1,$2,6,$3,null,'forward',24,524288
    ) as value
  `, [OWNER, COURSE, createdFocus.inspectionFocusId]);
  assert.equal(focusedPage.contract, "aralearn.course-study-unit-inspection-page.v2");
  assert.equal(focusedPage.totalCount, 1);
  assert.equal(focusedPage.items[0].studyUnit.id, "card-a");
  assert.equal(focusedPage.items[0].ordinal, 1);
  assert.equal(focusedPage.items[0].authorship.pendingObservationCount, 2);
  const focusManifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  assert.equal(focusManifest.schemaRevision, "20260828120000");
  assert.equal(focusManifest.features.includes("course-inspection-focus-v1"), true);
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
  const parameterFactCount = await scalar(database, `
    select count(*)::integer as value
    from private.course_design_parameter_changes where course_id=$1
  `, [COURSE]);
  const editorialGuidance = [
    "Footprint: mantenha uma rolagem focal sem comprimir conteúdo necessário.",
    "Parágrafos: distribua blocos longos em mais Unidades.",
    "Títulos: use títulos informativos e curtos.",
    "Estilo: direto, sóbrio e adequado ao público."
  ].join("\n");
  const editorialChanged = await applyDesignCommand(database, 6, {
    type: "set_guidance",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    guidance: editorialGuidance,
    origin: "author",
    reason: "Direção editorial explícita da Microssequência."
  }, "editorial-guidance-01");
  assert.equal(editorialChanged.courseRevision, 7);
  const afterEditorial = await readCourseDesign(
    database,
    "didactic_microsequence",
    "micro-a"
  );
  assert.equal(afterEditorial.guidance.localRevision.guidance, editorialGuidance);
  assert.deepEqual(
    afterEditorial.parameters.map(({ effectiveAssignment }) => effectiveAssignment.value),
    after.parameters.map(({ effectiveAssignment }) => effectiveAssignment.value)
  );
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_design_parameter_changes where course_id=$1
  `, [COURSE]), parameterFactCount);
  const editorialPartId = await scalar(database, `
    select id as value from private.course_authoring_parts
    where course_id=$1 and retired_at is null order by position limit 1
  `, [COURSE]);
  const editorialMaterialization = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,7,0,'start',$5,'application','editorial-snapshot-01'
    ) as value
  `, [OWNER, COURSE, editorialPartId, "54000000-0000-4000-8000-000000000001", {
    authoringPartVersion: 1,
    steps: [{
      id: "54000000-0000-4000-8000-000000000002",
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-a",
      productionPosition: 0
    }]
  }]);
  const sealedEditorialRevision = editorialMaterialization.materialization.designContext
    .guidanceRevisions.find(({ revisionId }) => (
      revisionId === afterEditorial.guidance.localRevision.revisionId
    ));
  assert.equal(sealedEditorialRevision.guidance, editorialGuidance);
  assert.ok(editorialMaterialization.materialization.designContext.targets[0]
    .guidanceRevisionIds.includes(sealedEditorialRevision.revisionId));
  assert.deepEqual(
    editorialMaterialization.materialization.designContext.targets[0]
      .parameters.map(({ value }) => value),
    after.parameters.map(({ effectiveAssignment }) => effectiveAssignment.value)
  );
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

test("#122 mantém contadores legados já validados pelo corte de identidade", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database, { preservedMaterializationState: true });
  assert.equal(await scalar(database, `
    select count(*) as value from private.authoring_materialization_states
  `), 1);
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

test("#122 e #131 percorrem plano, descoberta, contrato, materialização, prévia e auditoria", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");
  const discovery = RESOURCE_CATALOG.search({ query: "explicação em prosa" });
  assert.equal(discovery.coverage.status, "canonical");
  assert.equal(discovery.candidates[0].packageId, "aralearn.resource.paragraph");
  const exactContract = RESOURCE_CATALOG.contracts([{
    packageId: discovery.candidates[0].packageId,
    version: discovery.candidates[0].version
  }]);
  assert.equal(exactContract.items.length, 1);
  assert.equal(exactContract.items[0].status, "ok");
  assert.equal(exactContract.items[0].definition.package, "aralearn.resource.paragraph");
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
  const sealedParameterSnapshot = structuredClone(
    start.materialization.designContext.targets[0].parameters
  );
  assert.equal(sealedParameterSnapshot.length, 4);
  assert.deepEqual(Object.keys(sealedParameterSnapshot[0]).sort(), [
    "origin", "parameterId", "reason", "sourceScope", "value"
  ]);
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
  const persistedStudyUnit = await scalar(database, `
    select jsonb_build_object('id',entity_id,'position',position) || content as value
    from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id=$2
  `, [COURSE, application.studyUnits[0].studyUnitId]);
  const persistedValidation = RESOURCE_CATALOG.validateStudyUnit(persistedStudyUnit);
  assert.equal(persistedValidation.valid, true, persistedValidation.errors.join(" "));
  const preview = RESOURCE_CATALOG.previewStudyUnitDescriptor(persistedStudyUnit);
  assert.equal(preview.previewMode, "client_renderer");
  assert.ok(preview.accessibleText);
  const representationAudit = RESOURCE_CATALOG.auditRepresentation({
    studyUnit: persistedStudyUnit,
    intent: { query: "explicação em prosa" }
  });
  assert.equal(representationAudit.structural.valid, true);
  assert.equal(representationAudit.overallFit, "canonical");
  const persistedApplication = await scalar(database, `
    select result_facts->'designApplication' as value
    from private.course_authoring_part_materialization_steps
    where materialization_id=$1 and id=$2
  `, [materializationId, stepId]);
  assert.deepEqual(persistedApplication, application);
  const parametersUsedByStudyUnit = Object.fromEntries(
    persistedApplication.studyUnits.map(({ studyUnitId }) => [
      studyUnitId,
      sealedParameterSnapshot
    ])
  );
  assert.equal(Object.keys(parametersUsedByStudyUnit).length, application.studyUnits.length);
  assert.equal(parametersUsedByStudyUnit[application.studyUnits[0].studyUnitId].length, 4);

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

test("#271 override da Microssequência chega selado às Units da próxima produção", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");

  const parameterId = "new_analysis_unit_ceiling_per_expository_study_unit";
  const changed = await applyDesignCommand(database, 4, {
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    parameterId,
    value: 1,
    origin: "author",
    reason: "Revisão contextual com uma novidade por Unidade."
  }, "contextual-review-parameter");
  assert.equal(changed.courseRevision, 5);
  const part = await scalar(database, `
    select jsonb_build_object('id',id,'version',version) as value
    from private.course_authoring_parts
    where course_id=$1 and retired_at is null order by position limit 1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,5,0,'start',$5::jsonb,'application','contextual-review-start'
    ) as value
  `, [OWNER, COURSE, part.id, "53000000-0000-4000-8000-000000000271", {
    authoringPartVersion: part.version,
    steps: [{
      id: "53000000-0000-4000-8000-000000000272",
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-a",
      productionPosition: 0
    }]
  }]);
  const parameter = started.materialization.designContext.targets[0].parameters
    .find((entry) => entry.parameterId === parameterId);
  assert.deepEqual(parameter, {
    parameterId,
    value: 1,
    origin: "author",
    reason: "Revisão contextual com uma novidade por Unidade.",
    sourceScope: { kind: "didactic_microsequence", ref: "micro-a" }
  });
  assert.match(started.materialization.contextHash, /^[a-f0-9]{64}$/u);
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

test("#123 converte todas as referências legacy sem trim, dedupe ou mudança de ordem", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  const astralReference = "🧠".repeat(2048);
  const references = [
    "  Referência ç  ", "https://exemplo.test/a:b", "  Referência ç  ",
    astralReference
  ];
  await database.query(`
    update private.course_entities
    set content = content || jsonb_build_object('sources',$2::jsonb)
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE, JSON.stringify(references)]);

  await applyCourseSourcesMigration(database);

  const links = await database.query(`
    select link.source_ordinal,link.source_id,link.source_revision,link.relation
    from private.course_source_attributions attribution
    join private.course_source_attribution_sources link
      on link.course_id=attribution.course_id
      and link.attribution_id=attribution.id
    where attribution.course_id=$1
      and attribution.target_kind='study_unit'
      and attribution.target_id='card-a'
    order by link.source_ordinal
  `, [COURSE]);
  assert.deepEqual(links.rows.map((row) => ({
    ordinal: row.source_ordinal,
    sourceId: row.source_id,
    revision: Number(row.source_revision),
    relation: row.relation
  })), references.map((sourceId, ordinal) => ({
    ordinal,
    sourceId,
    revision: 1,
    relation: "legacy_reference"
  })));
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_revisions where course_id=$1
  `, [COURSE]), 3);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_array(
      char_length(source_id),octet_length(source_id)
    ) as value
    from private.course_source_revisions
    where course_id=$1 and source_id=$2
  `, [COURSE, astralReference]), [2048, 8192]);
  assert.equal(await scalar(database, `
    select bool_and(
      status='unresolved_legacy' and kind is null and title is null
      and citation_text is null and url is null
      and edition_or_version is null and study_visibility='hidden'
      and actor_id is null
    ) as value
    from private.course_source_revisions where course_id=$1
  `, [COURSE]), true);
  assert.equal(await scalar(database, `
    select not (content ? 'sources') as value
    from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]), true);
  const manifest = await scalar(database, `
    select public.get_aralearn_runtime_manifest() as value
  `);
  assert.equal(manifest.schemaRevision, "20260825190000");
  assert.equal(manifest.features.includes("course-sources-v1"), true);
  assert.equal(manifest.features.includes("course-source-provenance-v1"), true);
  assert.equal(manifest.features.includes("course-source-human-locators-v1"), true);
  assert.equal(await scalar(database, `
    select count(*) = 6 and bool_and(
      routine.provolatile = expected.volatility
    ) as value
    from (values
      (
        'private.course_source_context_plan_items_v1(uuid,jsonb)'
          ::regprocedure::oid,
        'v'::"char"
      ),
      (
        'private.course_design_context_with_sources_v1(jsonb)'
          ::regprocedure::oid,
        'v'::"char"
      ),
      (
        'private.course_materialization_design_context_v1(uuid,uuid,bigint,jsonb)'
          ::regprocedure::oid,
        'v'::"char"
      ),
      (
        'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'
          ::regprocedure::oid,
        'v'::"char"
      ),
      (
        'public.get_course_study_citations_v1(uuid,bigint,text)'
          ::regprocedure::oid,
        'v'::"char"
      ),
      (
        'private.course_plan_without_sources_v1(jsonb)'::regprocedure::oid,
        's'::"char"
      )
    ) expected(oid,volatility)
    join pg_proc routine on routine.oid = expected.oid
  `), true);
  assert.equal(await scalar(database, `
    select strpos(lower(pg_get_functiondef(
      'private.get_owned_course_sources_with_attachments_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'
        ::regprocedure::oid
    )),'for share') > 0
    and strpos(lower(pg_get_functiondef(
      'private.get_course_study_citations_core_v1(uuid,bigint,text)'
        ::regprocedure::oid
    )),'for share') > 0
    and strpos(pg_get_functiondef(
      'private.get_course_study_citations_core_v1(uuid,bigint,text)'
        ::regprocedure::oid
    ),'course-access:') > 0
    and strpos(pg_get_functiondef(
      'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'
        ::regprocedure::oid
    ),'get_owned_course_sources_with_attachments_v1') > 0
    and strpos(pg_get_functiondef(
      'public.get_course_study_citations_v1(uuid,bigint,text)'
        ::regprocedure::oid
    ),'get_course_study_citations_core_v1') > 0 as value
  `), true);
  await database.close();
});

test("edição contextual preserva carry legacy exato sob CAS e audita origem", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  const references = [
    "fonte antiga a", "fonte antiga b", "fonte antiga a", "fonte antiga c"
  ];
  await database.query(`
    update private.course_entities
    set content=content || jsonb_build_object('sources',$2::jsonb)
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE, references]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  await executeCourseSourceCommand(database, 4, {
    type: "save_source",
    sourceId: references[0],
    expectedSourceRevision: 1,
    source: sourceDocument({
      title: "Fonte antiga resolvida",
      origin: "imported_legacy"
    })
  }, "contextual-source-resolve-01");
  await executeCourseSourceCommand(database, 5, {
    type: "retire_source",
    sourceId: references[0],
    expectedSourceRevision: 2
  }, "contextual-source-retire-01");
  const legacyLinks = await scalar(database, `
    select private.course_effective_source_links_v1(
      $1,'study_unit','card-a'
    ) as value
  `, [COURSE]);
  assert.deepEqual(
    legacyLinks.map(({ sourceId, relation }) => ({ sourceId, relation })),
    references.map((sourceId) => ({ sourceId, relation: "legacy_reference" }))
  );
  assert.equal(await scalar(database, `
    select status as value from private.course_source_revisions
    where course_id=$1 and source_id=$2 order by revision desc limit 1
  `, [COURSE, references[0]]), "retired");

  await applyContextualCompositionMigration(database);
  const currentContent = await scalar(database, `
    select content as value from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  const revisedContent = { ...currentContent, title: "Unidade editada manualmente" };
  const upsert = [{
    entityType: "study_unit",
    entityId: "card-a",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 1,
    content: revisedContent
  }];
  const application = [{ studyUnitId: "card-a", sourceLinks: legacyLinks }];
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSE, LEARNER, OWNER]);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,6,1,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','manual','contextual-shared-denied-01'
    ) as value
  `, [LEARNER, COURSE, upsert, application]), /não autorizada/iu);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,6,2,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','manual','contextual-stale-unit-01'
    ) as value
  `, [OWNER, COURSE, upsert, application]), /Unidade mudou/iu);
  const changed = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,6,1,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','manual','contextual-manual-edit-01'
    ) as value
  `, [OWNER, COURSE, upsert, application]);

  assert.equal(changed.revision, 7);
  assert.equal(changed.channel, "application");
  assert.equal(changed.applicationOrigin, "manual");
  assert.equal(changed.expectedStudyUnitVersion, 1);
  assert.deepEqual(await scalar(database, `
    select private.course_effective_source_links_v1(
      $1,'study_unit','card-a'
    ) as value
  `, [COURSE]), legacyLinks);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'channel',summary->>'channel',
      'origin',summary->>'applicationOrigin'
    ) as value
    from private.course_events where course_id=$1 and revision=7
  `, [COURSE]), { channel: "application", origin: "manual" });

  const replay = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,6,1,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','manual','contextual-manual-edit-01'
    ) as value
  `, [OWNER, COURSE, upsert, application]);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.revision, 7);
  assert.equal(replay.applicationOrigin, "manual");

  const eventBeforeNoOp = await scalar(database, `
    select summary as value from private.course_events
    where course_id=$1 and revision=7
  `, [COURSE]);
  const noOp = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,7,2,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','provider_assistance','contextual-noop-different-origin-01'
    ) as value
  `, [OWNER, COURSE, upsert, application]);
  assert.equal(noOp.revision, 7);
  assert.equal(noOp.updatedCount, 0);
  assert.equal(noOp.applicationOrigin, "provider_assistance");
  assert.deepEqual(await scalar(database, `
    select summary as value from private.course_events
    where course_id=$1 and revision=7
  `, [COURSE]), eventBeforeNoOp);

  const reordered = [legacyLinks[1], legacyLinks[0], ...legacyLinks.slice(2)];
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,7,2,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','provider_assistance','contextual-tampered-order-01'
    ) as value
  `, [OWNER, COURSE, [{
    ...upsert[0],
    content: { ...revisedContent, title: "Não pode persistir" }
  }], [{ studyUnitId: "card-a", sourceLinks: reordered }]]),
  /proveniência histórica divergiu/iu);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,7,2,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','provider_assistance','contextual-tampered-link-01'
    ) as value
  `, [OWNER, COURSE, [{
    ...upsert[0],
    content: { ...revisedContent, title: "Também não pode persistir" }
  }], [{
    studyUnitId: "card-a",
    sourceLinks: [
      { ...legacyLinks[0], relation: "inspired_by" },
      ...legacyLinks.slice(1)
    ]
  }]]), /proveniência histórica divergiu/iu);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_array(course.revision,entity.version,entity.content->>'title')
      as value
    from public.courses course
    join private.course_entities entity on entity.course_id=course.id
    where course.id=$1 and entity.entity_type='study_unit'
      and entity.entity_id='card-a'
  `, [COURSE]), [7, 2, "Unidade editada manualmente"]);

  await executeCourseSourceCommand(database, 7, {
    type: "save_source",
    sourceId: "source-canonical-carry",
    expectedSourceRevision: 0,
    source: sourceDocument({
      title: "Fonte canônica histórica",
      citationText: "AUTOR. Fonte canônica histórica.",
      url: "https://example.test/canonical-carry"
    })
  }, "contextual-canonical-source-01");
  await executeCourseSourceCommand(database, 8, {
    type: "save_anchor",
    anchorId: "anchor-canonical-carry",
    sourceId: "source-canonical-carry",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: {
      kind: "text_quote",
      exact: "Trecho canônico conferido.",
      prefix: null,
      suffix: null
    },
    verificationExcerpt: "Trecho canônico conferido."
  }, "contextual-canonical-anchor-01");
  const canonicalLinks = [{
    sourceId: "source-canonical-carry",
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-canonical-carry", anchorRevision: 1 }]
  }];
  await executeCourseSourceCommand(database, 9, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 2,
    sourceLinks: canonicalLinks
  }, "contextual-canonical-assign-01");
  await executeCourseSourceCommand(database, 10, {
    type: "retire_source",
    sourceId: "source-canonical-carry",
    expectedSourceRevision: 1
  }, "contextual-canonical-retire-01");
  const canonicalCarry = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,11,2,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','provider_assistance','contextual-canonical-carry-01'
    ) as value
  `, [OWNER, COURSE, [{
    ...upsert[0],
    content: { ...revisedContent, title: "Unidade assistida com carry canônico" }
  }], [{ studyUnitId: "card-a", sourceLinks: canonicalLinks }]]);
  assert.equal(canonicalCarry.revision, 12);
  assert.equal(canonicalCarry.applicationOrigin, "provider_assistance");
  assert.deepEqual(await scalar(database, `
    select private.course_effective_source_links_v1(
      $1,'study_unit','card-a'
    ) as value
  `, [COURSE]), canonicalLinks);
  assert.equal(await scalar(database, `
    select status as value from private.course_source_revisions
    where course_id=$1 and source_id='source-canonical-carry'
    order by revision desc limit 1
  `, [COURSE]), "retired");
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,12,3,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application','provider_assistance','contextual-canonical-tamper-01'
    ) as value
  `, [OWNER, COURSE, [{
    ...upsert[0],
    content: { ...revisedContent, title: "Adulteração canônica" }
  }], [{
    studyUnitId: "card-a",
    sourceLinks: [{ ...canonicalLinks[0], relation: "adapted_from" }]
  }]]), /Fonte atual, ativa/iu);
  const broadApplicationNoOp = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,12,null,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'application',null,'broad-application-noop-01'
    ) as value
  `, [OWNER, COURSE, [{
    ...upsert[0],
    content: { ...revisedContent, title: "Unidade assistida com carry canônico" }
  }], [{ studyUnitId: "card-a", sourceLinks: canonicalLinks }]]);
  assert.equal(broadApplicationNoOp.revision, 12);
  assert.equal(broadApplicationNoOp.updatedCount, 0);
  assert.equal(broadApplicationNoOp.channel, "application");
  assert.equal(broadApplicationNoOp.applicationOrigin, null);
  assert.equal(broadApplicationNoOp.expectedStudyUnitVersion, null);
  const mcpResult = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,12,null,$3::jsonb,'[]'::jsonb,$4::jsonb,
      'mcp',null,'contextual-mcp-shape-01'
    ) as value
  `, [OWNER, COURSE, [{
    ...upsert[0],
    content: { ...revisedContent, title: "Unidade alterada pelo MCP" }
  }], [{ studyUnitId: "card-a", sourceLinks: canonicalLinks }]]);
  assert.deepEqual(Object.keys(mcpResult).sort(), [
    "courseId", "createdCount", "deletedCount", "idempotent", "operation",
    "revision", "updatedAt", "updatedCount", "upsertedCount"
  ]);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'channel',result->>'channel',
      'hasOrigin',result ? 'applicationOrigin',
      'origin',result->'applicationOrigin',
      'hasExpectedVersion',result ? 'expectedStudyUnitVersion'
    ) as value
    from private.course_change_receipts
    where actor_id=$1 and request_id='contextual-mcp-shape-01'
  `, [OWNER]), {
    channel: "mcp",
    hasOrigin: true,
    origin: null,
    hasExpectedVersion: true
  });
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'channel',summary->>'channel',
      'hasApplicationOrigin',summary ? 'applicationOrigin'
    ) as value
    from private.course_events where course_id=$1 and revision=13
  `, [COURSE]), { channel: "mcp", hasApplicationOrigin: false });
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260820224424");
  await database.close();
});

test("#123 preflight rejeita controles em identidade legacy e reverte integralmente", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content = content || jsonb_build_object('sources',$2::jsonb)
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE, JSON.stringify(["válida", "inválida\ncom quebra"])]);
  await assert.rejects(
    () => applyCourseSourcesMigration(database),
    /StudyUnit\.sources legado possui shape, limite ou ordem incompatível/iu
  );
  await database.exec("rollback").catch(() => {});
  assert.equal(await scalar(database, `
    select to_regclass('private.course_source_revisions') is null as value
  `), true);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260817180000");
  assert.deepEqual(await scalar(database, `
    select content->'sources' as value from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]), ["válida", "inválida\ncom quebra"]);
  await database.close();
});

test("#123 preflight aborta legado que não cabe nos envelopes sem truncar", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  const longReference = "界".repeat(2048);
  const references = Array.from({ length: 128 }, () => longReference);
  await database.query(`
    update private.course_entities
    set content = content || jsonb_build_object('sources',$2::jsonb)
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE, JSON.stringify(references)]);
  await assert.rejects(
    () => applyCourseSourcesMigration(database),
    (error) => error.code === "54000"
      && /excede o orçamento preservável de proveniência/iu.test(error.message)
  );
  await database.exec("rollback").catch(() => {});
  assert.equal(await scalar(database, `
    select to_regclass('private.course_source_revisions') is null as value
  `), true);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260817180000");
  const preserved = await scalar(database, `
    select content->'sources' as value
    from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  assert.equal(preserved.length, 128);
  assert.equal(preserved[0], longReference);
  assert.equal(preserved[127], longReference);
  await database.close();
});

test("#123 limita cada revisão de Fonte a oito identidades de Âncora", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  const sourceId = "source-anchor-limit";
  const saved = await executeCourseSourceCommand(database, 4, {
    type: "save_source",
    sourceId,
    expectedSourceRevision: 0,
    source: sourceDocument({
      title: "Fonte com conjunto limitado de Âncoras",
      citationText: "AUTOR. Fonte com conjunto limitado de Âncoras.",
      studyVisibility: "citation"
    })
  }, "source-anchor-limit-save");
  assert.equal(saved.courseRevision, 5);

  for (let index = 0; index < 8; index += 1) {
    const result = await executeCourseSourceCommand(database, 5 + index, {
      type: "save_anchor",
      anchorId: `source-anchor-limit-${index}`,
      sourceId,
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: index + 1, endPage: index + 1 },
      verificationExcerpt: null
    }, `source-anchor-limit-create-${index}`);
    assert.equal(result.courseRevision, 6 + index);
  }

  const edited = await executeCourseSourceCommand(database, 13, {
    type: "save_anchor",
    anchorId: "source-anchor-limit-0",
    sourceId,
    sourceRevision: 1,
    expectedAnchorRevision: 1,
    selector: { kind: "page_range", startPage: 10, endPage: 10 },
    verificationExcerpt: null
  }, "source-anchor-limit-edit");
  assert.equal(edited.courseRevision, 14);
  assert.equal(edited.change.revision, 2);

  const secondSourceId = "source-anchor-limit-second";
  const secondSource = await executeCourseSourceCommand(database, 14, {
    type: "save_source",
    sourceId: secondSourceId,
    expectedSourceRevision: 0,
    source: sourceDocument({ title: "Segunda Fonte para testar identidade" })
  }, "source-anchor-limit-second");
  assert.equal(secondSource.courseRevision, 15);
  await assert.rejects(
    () => executeCourseSourceCommand(database, 15, {
      type: "save_anchor",
      anchorId: "source-anchor-limit-0",
      sourceId: secondSourceId,
      sourceRevision: 1,
      expectedAnchorRevision: 2,
      selector: { kind: "page_range", startPage: 10, endPage: 10 },
      verificationExcerpt: null
    }, "source-anchor-identity-denied"),
    /permanece presa à revisão original da Fonte/iu
  );

  await assert.rejects(
    () => executeCourseSourceCommand(database, 15, {
      type: "save_anchor",
      anchorId: "source-anchor-limit-8",
      sourceId,
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: 11, endPage: 11 },
      verificationExcerpt: null
    }, "source-anchor-limit-denied"),
    /no máximo oito identidades de Âncora/iu
  );
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 15);
  assert.equal(await scalar(database, `
    select count(distinct anchor_id)::integer as value
    from private.course_source_anchor_revisions
    where course_id=$1 and source_id=$2 and source_revision=1
  `, [COURSE, sourceId]), 8);

  const read = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,$3,'source',$4,null,null,null,20
    ) as value
  `, [OWNER, COURSE, 15, sourceId]);
  assert.equal(read.items.length, 1);
  assert.equal(read.items[0].anchorCount, 8);
  assert.equal(read.items[0].anchors.length, 8);
  await database.close();
});

test("#123 limites SQL contam scalars Unicode e preservam byte caps", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");
  const sourceId = "🧠".repeat(240);
  const title = "😀".repeat(300);
  const citationText = "📚".repeat(2048);
  const editionOrVersion = "🧪".repeat(120);
  const saved = await executeCourseSourceCommand(database, 4, {
    type: "save_source",
    sourceId,
    expectedSourceRevision: 0,
    source: sourceDocument({ title, citationText, editionOrVersion,
      studyVisibility: "citation" })
  }, "source-unicode-scalars-save");
  assert.equal(saved.courseRevision, 5);
  const anchorId = "⚓".repeat(240);
  const exact = "🔎".repeat(4000);
  const prefix = "⬅".repeat(500);
  const suffix = "➡".repeat(500);
  const verificationExcerpt = "✅".repeat(2000);
  const anchored = await executeCourseSourceCommand(database, 5, {
    type: "save_anchor",
    anchorId,
    sourceId,
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "text_quote", exact, prefix, suffix },
    verificationExcerpt
  }, "source-unicode-scalars-anchor");
  assert.equal(anchored.courseRevision, 6);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_array(
      char_length(source_id),octet_length(source_id),
      char_length(title),octet_length(title),
      char_length(citation_text),octet_length(citation_text),
      char_length(edition_or_version),octet_length(edition_or_version)
    ) as value
    from private.course_source_revisions
    where course_id=$1 and source_id=$2 and revision=1
  `, [COURSE, sourceId]), [240, 960, 300, 1200, 2048, 8192, 120, 480]);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_array(
      char_length(anchor_id),octet_length(anchor_id),
      char_length(selector->>'exact'),octet_length(selector->>'exact'),
      char_length(selector->>'prefix'),octet_length(selector->>'prefix'),
      char_length(selector->>'suffix'),octet_length(selector->>'suffix'),
      char_length(verification_excerpt),octet_length(verification_excerpt)
    ) as value
    from private.course_source_anchor_revisions
    where course_id=$1 and anchor_id=$2 and revision=1
  `, [COURSE, anchorId]), [
    240, 720, 4000, 16000, 500, 1500, 500, 1500, 2000, 6000
  ]);
  const layoutAnchor = await executeCourseSourceCommand(database, 6, {
    type: "save_anchor",
    anchorId: "anchor-layout-unicode",
    sourceId,
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: {
      kind: "text_quote",
      exact: " \nA\tB\r ",
      prefix: "antes\ndepois",
      suffix: "fim\tcontexto"
    },
    verificationExcerpt: " \nTrecho\tverificado\r "
  }, "source-layout-anchor-ok");
  assert.equal(layoutAnchor.courseRevision, 7);

  for (const [requestId, selector] of [
    ["source-fragment-border", { kind: "uri_fragment", fragment: " secao" }],
    ["source-fragment-layout", { kind: "uri_fragment", fragment: "secao\tparte" }],
    ["source-quote-soh-denied", {
      kind: "text_quote", exact: "A\u0001B", prefix: null, suffix: null
    }],
    ["source-quote-c1-denied", {
      kind: "text_quote", exact: "A\u0085B", prefix: null, suffix: null
    }],
    ["source-prefix-blank", {
      kind: "text_quote", exact: "Trecho", prefix: " ", suffix: null
    }],
    ["source-suffix-border", {
      kind: "text_quote", exact: "Trecho", prefix: null, suffix: "\nvalor"
    }]
  ]) {
    await assert.rejects(() => executeCourseSourceCommand(database, 7, {
      type: "save_anchor",
      anchorId: `anchor-${requestId}`,
      sourceId,
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector,
      verificationExcerpt: null
    }, requestId), (error) => error.code === "23514");
  }
  for (const [requestId, source] of [
    ["source-title-layout-bad", sourceDocument({ title: "Título\nquebrado" })],
    ["source-edition-layout", sourceDocument({
      title: "Título válido", editionOrVersion: "v1\tx"
    })],
    ["source-citation-border", sourceDocument({
      title: "Título válido", citationText: "\nCitação", studyVisibility: "citation"
    })]
  ]) {
    await assert.rejects(() => executeCourseSourceCommand(database, 7, {
      type: "save_source",
      sourceId: requestId,
      expectedSourceRevision: 0,
      source
    }, requestId), (error) => error.code === "23514");
  }
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 7);
  await database.close();
});

test("#123 resolve identidade legacy longa, protege tabelas e permite cascatas reais", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  const legacySourceId = `  ${"fonte-ç".repeat(36)}  `;
  assert.ok(legacySourceId.length > 240 && legacySourceId.length < 2048);
  await database.query(`
    update private.course_entities
    set content = content || jsonb_build_object('sources',$2::jsonb)
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE, JSON.stringify([legacySourceId])]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  const source = sourceDocument({
    kind: "article", title: "Fonte legada agora verificada",
    citationText: "AUTOR. Fonte legada agora verificada.",
    url: "https://example.test/legacy", origin: "imported_legacy",
    availability: "unknown", studyVisibility: "citation_and_link"
  });
  const saveCommand = {
    type: "save_source",
    sourceId: legacySourceId,
    expectedSourceRevision: 1,
    source
  };
  const saved = await executeCourseSourceCommand(
    database, 4, saveCommand, "source-legacy-resolve-0001"
  );
  assert.equal(saved.changed, true);
  assert.equal(saved.courseRevision, 5);
  assert.equal(saved.change.subjectId, legacySourceId);
  assert.equal(saved.change.revision, 2);
  const replay = await executeCourseSourceCommand(
    database, 4, saveCommand, "source-legacy-resolve-0001"
  );
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 5);
  const noOp = await executeCourseSourceCommand(database, 5, {
    ...saveCommand,
    expectedSourceRevision: 2
  }, "source-legacy-noop-0001");
  assert.equal(noOp.changed, false);
  assert.equal(noOp.courseRevision, 5);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events
    where course_id=$1 and operation='update_course_sources'
  `, [COURSE]), 1);

  await assert.rejects(
    () => executeCourseSourceCommand(database, 5, {
      ...saveCommand,
      sourceId: `${"nova".repeat(61)}x`,
      expectedSourceRevision: 0
    }, "source-long-new-denied-0001"),
    /precisa resolver uma referência legada existente/iu
  );
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 5);

  const anchorResult = await executeCourseSourceCommand(database, 5, {
    type: "save_anchor",
    anchorId: "anchor-legacy-a",
    sourceId: legacySourceId,
    sourceRevision: 2,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 3, endPage: 4 },
    verificationExcerpt: "Trecho conferido."
  }, "source-legacy-anchor-0001");
  assert.equal(anchorResult.courseRevision, 6);
  const sourceLinks = [{
    sourceId: legacySourceId,
    sourceRevision: 2,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-legacy-a", anchorRevision: 1 }]
  }];
  const assigned = await executeCourseSourceCommand(database, 6, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 1,
    sourceLinks
  }, "source-legacy-assign-0001");
  assert.equal(assigned.courseRevision, 7);

  const authoritySnapshot = () => scalar(database, `
    select jsonb_build_object(
      'course',(
        select to_jsonb(course) from public.courses course where course.id=$1
      ),
      'sources',(
        select coalesce(jsonb_agg(to_jsonb(source)
          order by source.source_id,source.revision),'[]'::jsonb)
        from private.course_source_revisions source where source.course_id=$1
      ),
      'anchors',(
        select coalesce(jsonb_agg(to_jsonb(anchor_value)
          order by anchor_value.anchor_id,anchor_value.revision),'[]'::jsonb)
        from private.course_source_anchor_revisions anchor_value
        where anchor_value.course_id=$1
      ),
      'attributions',(
        select coalesce(jsonb_agg(to_jsonb(attribution)
          order by attribution.target_kind,attribution.target_id,
            attribution.revision),'[]'::jsonb)
        from private.course_source_attributions attribution
        where attribution.course_id=$1
      ),
      'sourceLinks',(
        select coalesce(jsonb_agg(to_jsonb(source_link)
          order by source_link.attribution_id,source_link.source_ordinal),
          '[]'::jsonb)
        from private.course_source_attribution_sources source_link
        where source_link.course_id=$1
      ),
      'anchorLinks',(
        select coalesce(jsonb_agg(to_jsonb(anchor_link)
          order by anchor_link.attribution_id,anchor_link.source_ordinal,
            anchor_link.anchor_ordinal),'[]'::jsonb)
        from private.course_source_attribution_anchors anchor_link
        where anchor_link.course_id=$1
      ),
      'events',(
        select coalesce(jsonb_agg(to_jsonb(event_value)
          order by event_value.revision),'[]'::jsonb)
        from private.course_events event_value where event_value.course_id=$1
      ),
      'receipts',(
        select coalesce(jsonb_agg(to_jsonb(receipt)
          order by receipt.actor_id,receipt.request_id),'[]'::jsonb)
        from private.course_change_receipts receipt where receipt.course_id=$1
      )
    ) as value
  `, [COURSE]);
  const stateBeforeStaleCommands = await authoritySnapshot();
  for (const staleCase of [{
    expectedCourseRevision: 6,
    command: { ...saveCommand, expectedSourceRevision: 2 },
    requestId: "source-stale-course-0001",
    message: "O Curso mudou; releia antes de salvar a Fonte."
  }, {
    expectedCourseRevision: 7,
    command: { ...saveCommand, expectedSourceRevision: 1 },
    requestId: "source-stale-source-0001",
    message: "A Fonte mudou; releia antes de salvar."
  }, {
    expectedCourseRevision: 7,
    command: {
      type: "save_anchor",
      anchorId: "anchor-legacy-a",
      sourceId: legacySourceId,
      sourceRevision: 2,
      expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: 3, endPage: 4 },
      verificationExcerpt: "Trecho conferido."
    },
    requestId: "source-stale-anchor-0001",
    message: "A Âncora mudou; releia antes de salvar."
  }, {
    expectedCourseRevision: 7,
    command: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: "card-a",
      expectedTargetVersion: 2,
      sourceLinks
    },
    requestId: "source-stale-target-0001",
    message: "O alvo de proveniência mudou; releia antes de salvar."
  }]) {
    await assert.rejects(() => executeCourseSourceCommand(
      database,
      staleCase.expectedCourseRevision,
      staleCase.command,
      staleCase.requestId
    ), (error) => isPgrstConflict(error, staleCase.message));
    assert.deepEqual(await authoritySnapshot(), stateBeforeStaleCommands);
  }

  const tableNames = [
    "course_source_revisions", "course_source_anchor_revisions",
    "course_source_attributions", "course_source_attribution_sources",
    "course_source_attribution_anchors"
  ];
  for (const tableName of tableNames) {
    const security = await database.query(`
      select relrowsecurity,relforcerowsecurity
      from pg_class where oid=$1::regclass
    `, [`private.${tableName}`]);
    assert.deepEqual(security.rows[0], {
      relrowsecurity: true,
      relforcerowsecurity: true
    });
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(await scalar(database, `
        select has_table_privilege($1,$2,'select,insert,update,delete') as value
      `, [role, `private.${tableName}`]), false);
    }
  }
  for (const role of ["anon", "authenticated", "service_role"]) {
    await database.exec(`set role ${role}`);
    await assert.rejects(
      () => database.query("select * from private.course_source_revisions"),
      /permission denied/iu
    );
    await database.exec("reset role");
  }

  await database.query(
    "update public.courses set owner_id=$2 where id=$1",
    [COURSE, LEARNER]
  );
  await database.query("delete from auth.users where id=$1", [OWNER]);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.courses where id=$1
  `, [COURSE]), 1);
  assert.equal(await scalar(database, `
    select bool_and(actor_id is null) as value
    from (
      select actor_id from private.course_source_revisions where course_id=$1
      union all
      select actor_id from private.course_source_anchor_revisions where course_id=$1
      union all
      select actor_id from private.course_source_attributions where course_id=$1
    ) facts
  `, [COURSE]), true);

  await database.query("delete from public.courses where id=$1", [COURSE]);
  for (const tableName of tableNames) {
    assert.equal(await scalar(database, `
      select count(*)::integer as value from private.${tableName}
    `), 0);
  }
  await database.close();

  const accountDatabase = await databaseFixture();
  await applyMigration(accountDatabase);
  await applyStudyUnitInspectionMigration(accountDatabase);
  await applyCourseDesignMigration(accountDatabase);
  await accountDatabase.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  await applyCourseSourcesMigration(accountDatabase);
  await actor(accountDatabase, OWNER, "service_role");
  await executeCourseSourceCommand(accountDatabase, 4, {
    type: "save_source",
    sourceId: "source-account-delete",
    expectedSourceRevision: 0,
    source: sourceDocument({ title: "Fonte eliminada com o Curso" })
  }, "source-account-delete-01");
  await actor(accountDatabase, OWNER, "authenticated");
  const deleted = await scalar(accountDatabase, `
    select public.delete_my_account_v1('EXCLUIR MINHA CONTA') as value
  `);
  assert.deepEqual(deleted, {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from public.courses
  `), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from private.course_source_revisions
  `), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from private.course_source_attributions
  `), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from auth.users where id=$1
  `, [OWNER]), 0);
  await accountDatabase.close();
});

test("#123 lookup contextual encontra revisão pinada sem varrer histórico longo", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");
  const sourceId = "source-history-context";
  await executeCourseSourceCommand(database, 4, {
    type: "save_source",
    sourceId,
    expectedSourceRevision: 0,
    source: sourceDocument({ title: "Revisão pinada", citationText: "Fonte pinada.",
      studyVisibility: "citation" })
  }, "source-context-save-0001");
  await executeCourseSourceCommand(database, 5, {
    type: "save_anchor",
    anchorId: "anchor-history-context",
    sourceId,
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 2, endPage: 3 },
    verificationExcerpt: "Trecho privado pinado."
  }, "source-context-anchor-01");
  await executeCourseSourceCommand(database, 6, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 1,
    sourceLinks: [{
      sourceId,
      sourceRevision: 1,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-history-context", anchorRevision: 1 }]
    }]
  }, "source-context-assign-01");
  await database.query(`
    insert into private.course_source_anchor_revisions(
      course_id,anchor_id,revision,source_id,source_revision,status,
      selector,verification_excerpt,actor_id
    ) values
      ($1,'anchor-history-context',2,$2,1,'retired',
        '{"kind":"page_range","startPage":2,"endPage":3}',
        'Revisão posterior não pinada.',$3),
      ($1,'anchor-history-available',1,$2,1,'active',
        '{"kind":"page_range","startPage":8,"endPage":8}',null,$3),
      ($1,'anchor-history-available',2,$2,1,'active',
        '{"kind":"page_range","startPage":9,"endPage":9}',null,$3)
  `, [COURSE, sourceId, OWNER]);
  await database.query(`
    insert into private.course_source_revisions(
      course_id,source_id,revision,status,kind,title,authorship,publication_date,
      identifier,language,citation_text,url,edition_or_version,origin,availability,
      verification_status,study_visibility,actor_id
    )
    select $1,$2,revision,'active','document',
      'Revisão ' || revision::text,'Autoria','2026',null,'pt-BR',
      'Fonte corrente.',null,null,'author_provided','unknown','author_verified',
      'citation',$3
    from generate_series(2,105) revision
  `, [COURSE, sourceId, OWNER]);
  await database.query(`
    insert into private.course_source_revisions(
      course_id,source_id,revision,status,kind,title,authorship,publication_date,
      identifier,language,citation_text,url,edition_or_version,origin,availability,
      verification_status,study_visibility,actor_id
    )
    select $1,'source-catalog-default-' || lpad(identity::text,2,'0'),
      1,'active','document','Fonte ' || identity::text,'Autoria','2026',
      null,'pt-BR','Fonte de catálogo.',null,null,'author_provided','unknown',
      'author_verified','citation',$2
    from generate_series(0,9) identity
  `, [COURSE, OWNER]);

  const defaultCatalog = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'catalog'
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(defaultCatalog.items.length, 10);
  assert.equal(typeof defaultCatalog.nextCursor, "string");
  const catalogContinuation = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'catalog',null,null,null,$3,10
    ) as value
  `, [OWNER, COURSE, defaultCatalog.nextCursor]);
  assert.equal(catalogContinuation.items.length, 1);
  assert.equal(catalogContinuation.nextCursor, null);
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'catalog',null,null,null,$3,9
    ) as value
  `, [OWNER, COURSE, defaultCatalog.nextCursor]), (error) => (
    error.code === "22023" && /Cursor de Fontes inválido/iu.test(error.message)
  ));
  const otherCourse = "10000000-0000-4000-8000-000000000098";
  await database.query(`
    insert into public.courses(id,owner_id,title,goal,revision)
    values($1,$2,'Curso B','Provar binding do cursor.',7)
  `, [otherCourse, OWNER]);
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'catalog',null,null,null,$3,10
    ) as value
  `, [OWNER, otherCourse, defaultCatalog.nextCursor]), (error) => (
    error.code === "22023" && /Cursor de Fontes inválido/iu.test(error.message)
  ));

  const history = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'source',$3,null,null,null,1
    ) as value
  `, [OWNER, COURSE, sourceId]);
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].revision, 105);
  assert.equal(typeof history.nextCursor, "string");
  assert.deepEqual(history.query, {
    sourceId,
    targetKind: null,
    targetId: null
  });
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'source','source-catalog-default-00',null,null,$3,1
    ) as value
  `, [OWNER, COURSE, history.nextCursor]), (error) => error.code === "22023");
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'source',$3,null,null,$4,2
    ) as value
  `, [OWNER, COURSE, sourceId, history.nextCursor]), (error) => error.code === "22023");

  const contextual = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'source',$3,'study_unit','card-a',null,1
    ) as value
  `, [OWNER, COURSE, sourceId]);
  assert.equal(contextual.items.length, 1);
  assert.equal(contextual.items[0].revision, 1);
  assert.equal(contextual.items[0].anchorCount, 2);
  assert.equal(contextual.items[0].anchors.length, 2);
  assert.deepEqual(contextual.items[0].anchors.map((anchor) => ({
    anchorId: anchor.anchorId,
    revision: anchor.revision,
    status: anchor.status
  })), [{
    anchorId: "anchor-history-available",
    revision: 2,
    status: "active"
  }, {
    anchorId: "anchor-history-context",
    revision: 1,
    status: "active"
  }]);
  assert.equal(contextual.nextCursor, null);
  assert.deepEqual(contextual.query, {
    sourceId,
    targetKind: "study_unit",
    targetId: "card-a"
  });
  const absentFromTarget = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'source','source-catalog-default-00',
      'study_unit','card-a',null,1
    ) as value
  `, [OWNER, COURSE]);
  assert.deepEqual(absentFromTarget.items, []);
  assert.equal(absentFromTarget.nextCursor, null);
  const targetPage = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'target',null,'study_unit','card-a',null,1
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(typeof targetPage.nextCursor, "string");
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'target',null,'study_unit','card-b',$3,1
    ) as value
  `, [OWNER, COURSE, targetPage.nextCursor]), (error) => error.code === "22023");
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'source',$3,'study_unit','card-a',$4,1
    ) as value
  `, [OWNER, COURSE, sourceId, history.nextCursor]), (error) => (
    error.code === "22023" && /Consulta de Fontes inválida/iu.test(error.message)
  ));
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,7,'source',$3,'study_unit',null,null,1
    ) as value
  `, [OWNER, COURSE, sourceId]), (error) => error.code === "22023");
  await database.exec("begin");
  try {
    await database.query(`
      update public.courses set revision=8 where id=$1
    `, [COURSE]);
    await assert.rejects(() => scalar(database, `
      select public.get_owned_course_sources_for_actor_v1(
        $1,$2,7,'catalog',null,null,null,$3,10
      ) as value
    `, [OWNER, COURSE, defaultCatalog.nextCursor]), (error) =>
      isPgrstConflict(error, "O Curso mudou durante a leitura de Fontes."));
  } finally {
    await database.exec("rollback");
  }
  await database.exec("begin");
  try {
    await database.query(`
      update public.courses set revision=8 where id=$1
    `, [COURSE]);
    await assert.rejects(() => scalar(database, `
      select public.get_owned_course_sources_for_actor_v1(
        $1,$2,8,'catalog',null,null,null,$3,10
      ) as value
    `, [OWNER, COURSE, defaultCatalog.nextCursor]), (error) => error.code === "22023");
  } finally {
    await database.exec("rollback");
  }
  await database.close();
});

test("CAS obsoleto do plano retorna PGRST 409 sem retry e preserva replay", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await applyBoundedInstructionalPlanCasMigration(database);
  await actor(database, OWNER, "service_role");

  const target = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  target.audience = "Pessoas autoras que precisam revisar o plano.";
  const command = { type: "update_plan" };
  const changed = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3::jsonb,$4::jsonb,'application','plan-cas-boundary-0001'
    ) as value
  `, [OWNER, COURSE, command, target]);
  assert.equal(changed.courseRevision, 5);
  assert.equal(changed.planVersion, 2);
  assert.equal(changed.idempotent, false);

  const replay = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3::jsonb,$4::jsonb,'application','plan-cas-boundary-0001'
    ) as value
  `, [OWNER, COURSE, command, target]);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 5);
  assert.equal(replay.planVersion, 2);

  const eventCount = await scalar(database, `
    select count(*)::integer as value
    from private.course_events where course_id=$1
  `, [COURSE]);
  const startedAt = performance.now();
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3::jsonb,$4::jsonb,'application','plan-cas-boundary-stale-0001'
    ) as value
  `, [OWNER, COURSE, command, target]), (error) => isPgrstConflict(
    error,
    "O Curso ou plano mudou; releia antes de salvar."
  ));
  assert.ok(performance.now() - startedAt < 5_000);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_array(course.revision,plan.version) as value
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id=course.id
    where course.id=$1
  `, [COURSE]), [5, 2]);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_events where course_id=$1
  `, [COURSE]), eventCount);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_change_receipts
    where actor_id=$1 and request_id='plan-cas-boundary-stale-0001'
  `, [OWNER]), 0);
  assert.equal(await scalar(database, `
    select audience=$2 as value
    from private.course_instructional_plans where course_id=$1
  `, [COURSE, target.audience]), true);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260827185748");
  await database.close();
});

test("#123 grava plano e composição com atribuições atômicas, vazias e replay", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  const sourceSaved = await executeCourseSourceCommand(database, 4, {
    type: "save_source",
    sourceId: "source-plan-a",
    expectedSourceRevision: 0,
    source: sourceDocument({
      kind: "article", title: "Fonte do planejamento",
      citationText: "AUTOR. Fonte do planejamento.",
      url: "https://example.test/plan", availability: "open_access",
      studyVisibility: "citation"
    })
  }, "source-plan-save-0001");
  assert.equal(sourceSaved.courseRevision, 5);
  const anchorSaved = await executeCourseSourceCommand(database, 5, {
    type: "save_anchor",
    anchorId: "anchor-plan-a",
    sourceId: "source-plan-a",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "text_quote", exact: "Trecho factual.", prefix: null, suffix: null },
    verificationExcerpt: "Trecho factual."
  }, "source-plan-anchor-0001");
  assert.equal(anchorSaved.courseRevision, 6);
  const supportedLink = {
    sourceId: "source-plan-a",
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-plan-a", anchorRevision: 1 }]
  };

  const planBefore = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const planItem = {
    id: PLAN_ITEM,
    position: 0,
    statement: "Comparar relações em um caso novo.",
    sourceLinks: [supportedLink]
  };
  const planAfter = structuredClone(planBefore);
  planAfter.intendedLearningOutcomes.push(planItem);
  const addCommand = {
    type: "add_plan_item",
    kind: "intended_learning_outcome",
    id: PLAN_ITEM,
    position: 0,
    statement: planItem.statement,
    sourceLinks: planItem.sourceLinks
  };
  const added = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,6,1,$3::jsonb,$4::jsonb,'application','source-plan-add-0001'
    ) as value
  `, [OWNER, COURSE, addCommand, planAfter]);
  assert.equal(added.courseRevision, 7);
  assert.equal(added.planVersion, 2);
  assert.equal(added.changed, true);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='plan_item' and target_id=$2
  `, [COURSE, PLAN_ITEM]), 1);
  const planReplay = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,6,1,$3::jsonb,$4::jsonb,'application','source-plan-add-0001'
    ) as value
  `, [OWNER, COURSE, addCommand, planAfter]);
  assert.equal(planReplay.idempotent, true);
  assert.equal(planReplay.courseRevision, 7);

  const sourceOnlyPlan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const informedLink = { ...supportedLink, relation: "informed_by" };
  sourceOnlyPlan.intendedLearningOutcomes[0].sourceLinks = [informedLink];
  const sourceOnlyCommand = {
    type: "update_plan_item",
    kind: "intended_learning_outcome",
    id: PLAN_ITEM,
    statement: planItem.statement,
    sourceLinks: [informedLink]
  };
  const sourceOnly = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,7,2,$3::jsonb,$4::jsonb,'application','source-plan-only-0001'
    ) as value
  `, [OWNER, COURSE, sourceOnlyCommand, sourceOnlyPlan]);
  assert.equal(sourceOnly.changed, true);
  assert.equal(sourceOnly.courseRevision, 8);
  assert.equal(sourceOnly.planVersion, 3);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='plan_item' and target_id=$2
  `, [COURSE, PLAN_ITEM]), 2);
  assert.equal(await scalar(database, `
    select attribution.target_version=1
      and attribution.target_hash=(
        private.course_source_target_state_v1(
          attribution.course_id,attribution.target_kind,attribution.target_id
        )->>'hash'
      )
      and private.course_source_links_v1(
        attribution.course_id,attribution.id
      )=$3::jsonb as value
    from private.course_source_attributions attribution
    where attribution.course_id=$1 and attribution.target_kind='plan_item'
      and attribution.target_id=$2
    order by attribution.revision desc limit 1
  `, [COURSE, PLAN_ITEM, [informedLink]]), true);
  await database.exec("begin");
  try {
    await database.query(`
      update private.course_instructional_plan_items
      set position=1,version=version+1
      where course_id=$1 and id=$2
    `, [COURSE, PLAN_ITEM]);
    assert.equal(await scalar(database, `
      select private.course_effective_source_attribution_v1(
        $1,'plan_item',$2::text
      ) is null as value
    `, [COURSE, PLAN_ITEM]), true);
  } finally {
    await database.exec("rollback");
  }
  await database.exec("begin");
  try {
    await database.query(`
      update private.course_instructional_plan_items
      set statement='Hash semântico mudou.',version=version+1
      where course_id=$1 and id=$2
    `, [COURSE, PLAN_ITEM]);
    assert.equal(await scalar(database, `
      select private.course_effective_source_attribution_v1(
        $1,'plan_item',$2::text
      ) is null as value
    `, [COURSE, PLAN_ITEM]), true);
  } finally {
    await database.exec("rollback");
  }

  const invalidPlan = structuredClone(sourceOnlyPlan);
  invalidPlan.intendedLearningOutcomes[0].statement = "Mudança que precisa reverter.";
  invalidPlan.intendedLearningOutcomes[0].sourceLinks = [{
    ...supportedLink,
    anchors: [{ anchorId: "anchor-missing", anchorRevision: 1 }]
  }];
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,8,3,$3::jsonb,$4::jsonb,'application','source-plan-invalid-01'
    ) as value
  `, [OWNER, COURSE, {
    type: "update_plan_item",
    kind: "intended_learning_outcome",
    id: PLAN_ITEM,
    statement: "Mudança que precisa reverter.",
    sourceLinks: invalidPlan.intendedLearningOutcomes[0].sourceLinks
  }, invalidPlan]), /Âncora.*(?:atual|corrente).*ativa/iu);
  assert.equal(await scalar(database, `
    select statement=$3 and version=1 as value
    from private.course_instructional_plan_items
    where course_id=$1 and id=$2
  `, [COURSE, PLAN_ITEM, planItem.statement]), true);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_array(course.revision,plan.version) as value
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id=course.id
    where course.id=$1
  `, [COURSE]), [8, 3]);

  const cardUpsert = {
    entityType: "study_unit",
    entityId: "card-a",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 1,
    content: { title: "Unidade A revista" }
  };
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,8,$3::jsonb,'[]'::jsonb,'[]'::jsonb,'source-composition-missing'
    ) as value
  `, [OWNER, COURSE, [cardUpsert]]), /proveniência explícita para cada Unidade/iu);
  assert.equal(await scalar(database, `
    select content->>'title' as value from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]), "Unidade A");

  const emptyApplication = [{ studyUnitId: "card-a", sourceLinks: [] }];
  const composed = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,8,$3::jsonb,'[]'::jsonb,$4::jsonb,'source-composition-empty'
    ) as value
  `, [OWNER, COURSE, [cardUpsert], emptyApplication]);
  assert.equal(composed.revision, 9);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
  `, [COURSE]), 2);
  const compositionReplay = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,8,$3::jsonb,'[]'::jsonb,$4::jsonb,'source-composition-empty'
    ) as value
  `, [OWNER, COURSE, [cardUpsert], emptyApplication]);
  assert.equal(compositionReplay.idempotent, true);
  assert.equal(compositionReplay.revision, 9);

  const invalidCard = { ...cardUpsert, content: { title: "Não pode persistir" } };
  const invalidApplication = [{
    studyUnitId: "card-a",
    sourceLinks: [{
      ...supportedLink,
      anchors: [{ anchorId: "anchor-missing", anchorRevision: 1 }]
    }]
  }];
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,9,$3::jsonb,'[]'::jsonb,$4::jsonb,'source-composition-invalid'
    ) as value
  `, [OWNER, COURSE, [invalidCard], invalidApplication]), /Âncora.*(?:atual|corrente).*ativa/iu);
  assert.equal(await scalar(database, `
    select content->>'title' as value from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]), "Unidade A revista");
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 9);

  const sourceOnlyComposition = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,9,$3::jsonb,'[]'::jsonb,$4::jsonb,'source-composition-only'
    ) as value
  `, [OWNER, COURSE, [cardUpsert], [{
    studyUnitId: "card-a",
    sourceLinks: [supportedLink]
  }]]);
  assert.equal(sourceOnlyComposition.revision, 10);
  assert.equal(sourceOnlyComposition.createdCount, 0);
  assert.equal(sourceOnlyComposition.updatedCount, 0);
  const compositionAttributions = await database.query(`
    select attribution.revision,attribution.target_version,attribution.target_hash,
      private.course_source_links_v1(attribution.course_id,attribution.id) links,
      attribution.target_hash=(
        private.course_source_target_state_v1(
          attribution.course_id,attribution.target_kind,attribution.target_id
        )->>'hash'
      ) effective
    from private.course_source_attributions attribution
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
    order by revision
  `, [COURSE]);
  assert.equal(compositionAttributions.rows.length, 3);
  assert.deepEqual(
    compositionAttributions.rows.map((row) => Number(row.target_version)),
    [1, 2, 2]
  );
  assert.deepEqual(compositionAttributions.rows[1].links, []);
  assert.deepEqual(compositionAttributions.rows[2].links, [supportedLink]);
  assert.equal(
    compositionAttributions.rows[1].target_hash,
    compositionAttributions.rows[2].target_hash
  );
  assert.equal(compositionAttributions.rows[2].effective, true);
  const collisionComposition = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,10,$3::jsonb,'[]'::jsonb,$4::jsonb,'source-composition-collision'
    ) as value
  `, [OWNER, COURSE, [cardUpsert, {
    entityType: "lesson",
    entityId: "card-a",
    parentType: "module",
    parentId: "module-a",
    position: 1,
    content: { title: "Lição com identidade textual coincidente" }
  }], [{
    studyUnitId: "card-a",
    sourceLinks: [supportedLink]
  }]]);
  assert.equal(collisionComposition.revision, 11);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_type='lesson' and entity_id='card-a'
  `, [COURSE]), 1);
  await database.close();
});

test("#123 efetividade exige versão e hash ao retornar A-B-A", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");
  const originalContent = await scalar(database, `
    select content as value from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);

  await database.query(`
    update private.course_entities
    set content=jsonb_set(content,'{title}',to_jsonb('Estado B'::text)),
      version=version+1
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  const stateB = await executeCourseSourceCommand(database, 4, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 2,
    sourceLinks: []
  }, "source-version-state-b");
  assert.equal(stateB.courseRevision, 5);
  assert.equal(stateB.change.revision, 2);

  await database.query(`
    update private.course_entities
    set content=$2::jsonb,version=version+1
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE, originalContent]);
  const returnedA = await executeCourseSourceCommand(database, 5, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 3,
    sourceLinks: []
  }, "source-version-return-a");
  assert.equal(returnedA.changed, true);
  assert.equal(returnedA.courseRevision, 6);
  assert.equal(returnedA.change.revision, 3);
  const replay = await executeCourseSourceCommand(database, 5, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 3,
    sourceLinks: []
  }, "source-version-return-a");
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 6);
  const noOp = await executeCourseSourceCommand(database, 6, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 3,
    sourceLinks: []
  }, "source-version-noop-a");
  assert.equal(noOp.changed, false);
  assert.equal(noOp.courseRevision, 6);

  const history = await database.query(`
    select revision,target_version,target_hash
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
    order by revision
  `, [COURSE]);
  assert.deepEqual(history.rows.map(({ revision, target_version }) => ({
    revision,
    targetVersion: target_version
  })), [
    { revision: 1, targetVersion: 1 },
    { revision: 2, targetVersion: 2 },
    { revision: 3, targetVersion: 3 }
  ]);
  assert.equal(history.rows[0].target_hash, history.rows[2].target_hash);
  assert.notEqual(history.rows[0].target_hash, history.rows[1].target_hash);
  const targetRead = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,6,'target',null,'study_unit','card-a',null,1
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(targetRead.items.length, 1);
  assert.equal(targetRead.items[0].revision, 3);
  assert.equal(targetRead.items[0].targetVersion, 3);
  assert.equal(targetRead.items[0].effective, true);
  await database.close();
});

test("#123 reorder do plano reaplica links na versão nova e mantém target efetivo", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");
  const firstId = "61000000-0000-4000-8000-000000000001";
  const secondId = "61000000-0000-4000-8000-000000000002";
  const initialPlan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const firstPlan = structuredClone(initialPlan);
  firstPlan.intendedLearningOutcomes.push({
    id: firstId,
    position: 0,
    statement: "Primeiro item.",
    sourceLinks: []
  });
  const first = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3::jsonb,$4::jsonb,'application','source-reorder-add-first'
    ) as value
  `, [OWNER, COURSE, {
    type: "add_plan_item",
    kind: "intended_learning_outcome",
    id: firstId,
    position: 0,
    statement: "Primeiro item.",
    sourceLinks: []
  }, firstPlan]);
  assert.equal(first.courseRevision, 5);
  assert.equal(first.planVersion, 2);

  const secondPlan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  secondPlan.intendedLearningOutcomes.push({
    id: secondId,
    position: 1,
    statement: "Segundo item.",
    sourceLinks: []
  });
  const second = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,5,2,$3::jsonb,$4::jsonb,'application','source-reorder-add-second'
    ) as value
  `, [OWNER, COURSE, {
    type: "add_plan_item",
    kind: "intended_learning_outcome",
    id: secondId,
    position: 1,
    statement: "Segundo item.",
    sourceLinks: []
  }, secondPlan]);
  assert.equal(second.courseRevision, 6);
  assert.equal(second.planVersion, 3);

  const reorderPlan = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  reorderPlan.intendedLearningOutcomes = [
    { ...reorderPlan.intendedLearningOutcomes[1], position: 0 },
    { ...reorderPlan.intendedLearningOutcomes[0], position: 1 }
  ];
  const reorderCommand = {
    type: "reorder_plan_items",
    kind: "intended_learning_outcome",
    orderedIds: [secondId, firstId]
  };
  const reordered = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,6,3,$3::jsonb,$4::jsonb,'application','source-reorder-items-01'
    ) as value
  `, [OWNER, COURSE, reorderCommand, reorderPlan]);
  assert.equal(reordered.changed, true);
  assert.equal(reordered.courseRevision, 7);
  assert.equal(reordered.planVersion, 4);
  assert.deepEqual((await database.query(`
    select id::text,position,version from private.course_instructional_plan_items
    where course_id=$1 and id in ($2,$3)
    order by position
  `, [COURSE, firstId, secondId])).rows, [
    { id: secondId, position: 0, version: 2 },
    { id: firstId, position: 1, version: 2 }
  ]);
  for (const itemId of [firstId, secondId]) {
    const target = await scalar(database, `
      select public.get_owned_course_sources_for_actor_v1(
        $1,$2,7,'target',null,'plan_item',$3,null,1
      ) as value
    `, [OWNER, COURSE, itemId]);
    assert.equal(target.items.length, 1);
    assert.equal(target.items[0].revision, 2);
    assert.equal(target.items[0].targetVersion, 2);
    assert.equal(target.items[0].effective, true);
    assert.deepEqual(target.items[0].sourceLinks, []);
  }
  const replay = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,6,3,$3::jsonb,$4::jsonb,'application','source-reorder-items-01'
    ) as value
  `, [OWNER, COURSE, reorderCommand, reorderPlan]);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 7);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='plan_item'
      and target_id in ($2,$3)
  `, [COURSE, firstId, secondId]), 4);
  await database.close();
});

test("#123 composição relê versão real após cascade e recriação da Unidade", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ($1,'microsequence','micro-new','lesson','lesson-a',1,
        '{"title":"Micro nova","dependsOn":[]}'),
      ($1,'microsequence','micro-old','lesson','lesson-a',2,
        '{"title":"Micro antiga","dependsOn":[]}'),
      ($1,'study_unit','move-unit','microsequence','micro-old',1,$2::jsonb)
  `, [COURSE, {
    title: "Original",
    role: "theory",
    content: [{
      id: "p-original",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo original." }
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  }]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  const movedContent = {
    title: "Movida",
    role: "theory",
    content: [{
      id: "p-move",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo movido." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
  const changed = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,4,$3::jsonb,$4::jsonb,$5::jsonb,'source-cascade-recreate'
    ) as value
  `, [OWNER, COURSE, [{
    entityType: "study_unit",
    entityId: "move-unit",
    parentType: "microsequence",
    parentId: "micro-new",
    position: 1,
    content: movedContent
  }], [{
    entityType: "microsequence",
    entityId: "micro-old"
  }], [{
    studyUnitId: "move-unit",
    sourceLinks: []
  }]]);
  assert.equal(changed.revision, 5);

  const state = await scalar(database, `
    select private.course_source_target_state_v1(
      $1,'study_unit','move-unit'
    ) as value
  `, [COURSE]);
  assert.equal(state.version, 1);
  const attribution = await database.query(`
    select revision,target_version,target_hash
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='move-unit'
    order by revision desc limit 1
  `, [COURSE]);
  assert.deepEqual(attribution.rows[0], {
    revision: 2,
    target_version: 1,
    target_hash: state.hash
  });
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where actor_id=$1 and request_id='source-cascade-recreate'
  `, [OWNER]), 1);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events
    where course_id=$1 and revision=5 and operation='replace_course_composition'
  `, [COURSE]), 1);
  const movedWithoutContentChange = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,5,$3::jsonb,'[]'::jsonb,$4::jsonb,'source-move-same-content'
    ) as value
  `, [OWNER, COURSE, [{
    entityType: "study_unit",
    entityId: "move-unit",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 2,
    content: movedContent
  }], [{ studyUnitId: "move-unit", sourceLinks: [] }]]);
  assert.equal(movedWithoutContentChange.revision, 6);
  const movedState = await scalar(database, `
    select private.course_source_target_state_v1(
      $1,'study_unit','move-unit'
    ) as value
  `, [COURSE]);
  assert.equal(movedState.version, 2);
  assert.equal(movedState.hash, state.hash);
  assert.deepEqual((await database.query(`
    select revision,target_version,target_hash
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='move-unit'
    order by revision desc limit 1
  `, [COURSE])).rows[0], {
    revision: 3,
    target_version: 2,
    target_hash: movedState.hash
  });
  const movedTargetRead = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,6,'target',null,'study_unit','move-unit',null,1
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(movedTargetRead.items.length, 1);
  assert.equal(movedTargetRead.items[0].targetVersion, 2);
  assert.equal(movedTargetRead.items[0].effective, true);
  await database.close();
});

test("#235 materializa e rematerializa 1→2 preservando relação, Fonte e Âncora", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await applyAnalysisDecompositionMigration(database);
  await actor(database, OWNER, "service_role");

  const plan = await scalar(database, `
    select jsonb_build_object('id',plan.id,'partId',(
      select part.id from private.course_authoring_parts part
      where part.course_id=plan.course_id and part.retired_at is null
      order by part.position limit 1
    )) as value
    from private.course_instructional_plans plan where course_id=$1
  `, [COURSE]);
  const analysisId = DESIGN_ANALYSIS_IDS[0];
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'instructional_analysis_unit',0,$4)
  `, [analysisId, COURSE, plan.id, "Explicar uma relação em desenvolvimento progressivo."]);

  let courseRevision = (await applyDesignCommand(database, 4, {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [analysisId],
    evidenceRequirementIds: []
  }, "analysis-decomposition-target")).courseRevision;

  const sourceId = "source-analysis-decomposition";
  const anchorId = "anchor-analysis-decomposition";
  courseRevision = (await executeCourseSourceCommand(database, courseRevision, {
    type: "save_source",
    sourceId,
    expectedSourceRevision: 0,
    source: sourceDocument({
      title: "Fonte da decomposição",
      citationText: "AUTOR. Fonte da decomposição.",
      studyVisibility: "citation"
    })
  }, "analysis-decomposition-source")).courseRevision;
  courseRevision = (await executeCourseSourceCommand(database, courseRevision, {
    type: "save_anchor",
    anchorId,
    sourceId,
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 3, endPage: 4 },
    verificationExcerpt: "Trecho focal da relação desenvolvida."
  }, "analysis-decomposition-anchor")).courseRevision;
  const sourceLink = {
    sourceId,
    sourceRevision: 1,
    relation: "informed_by",
    anchors: [{ anchorId, anchorRevision: 1 }]
  };
  courseRevision = (await executeCourseSourceCommand(database, courseRevision, {
    type: "set_target_sources",
    targetKind: "plan_item",
    targetId: analysisId,
    expectedTargetVersion: 1,
    sourceLinks: [sourceLink]
  }, "analysis-decomposition-attribution")).courseRevision;

  async function materialize({
    materializationId,
    stepId,
    requestPrefix,
    contentSuffix,
    verifyEmptyContinuation = false
  }) {
    const started = await scalar(database, `
      select public.advance_course_authoring_part_materialization_for_actor_v1(
        $1,$2,$3,$4,$5,0,'start',$6::jsonb,'application',$7
      ) as value
    `, [OWNER, COURSE, plan.partId, materializationId, courseRevision, {
      authoringPartVersion: 1,
      steps: [{
        id: stepId,
        position: 0,
        kind: "didactic_microsequence_materialization",
        targetDidacticMicrosequenceId: "micro-a",
        productionPosition: 0
      }]
    }, `${requestPrefix}-start`]);
    courseRevision = started.courseRevision;
    const contextSource = started.materialization.designContext.targets[0]
      .sourceAttributions.instructionalAnalysisUnits[0].sources[0];
    assert.equal(contextSource.sourceId, sourceId);
    assert.equal(contextSource.anchors[0].anchorId, anchorId);

    const designApplication = {
      contextHash: started.materialization.contextHash,
      didacticMicrosequenceId: "micro-a",
      studyUnits: [{
        studyUnitId: "analysis-split-1",
        mode: "expository",
        introducedInstructionalAnalysisUnitIds: [analysisId],
        explanationApplications: [{
          instructionalAnalysisUnitId: analysisId,
          developedForms: ["plain_definition", "mechanism"],
          notApplicable: []
        }],
        practiceApplications: [],
        componentRefs: ["aralearn.resource.paragraph@1.0.0"]
      }, {
        studyUnitId: "analysis-split-2",
        mode: "expository",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [{
          instructionalAnalysisUnitId: analysisId,
          developedForms: ["concrete_example", "contrast"],
          notApplicable: []
        }],
        practiceApplications: [],
        componentRefs: ["aralearn.resource.paragraph@1.0.0"]
      }]
    };
    const upserts = studyUnitUpserts(
      designApplication,
      "aralearn.resource.paragraph",
      10
    ).map((upsert) => ({
      ...upsert,
      content: { ...upsert.content, title: `${upsert.content.title}${contentSuffix}` }
    }));
    const sourceAttributionApplication = {
      contract: "aralearn.course-source-attribution-application.v1",
      contextHash: started.materialization.contextHash,
      didacticMicrosequenceId: "micro-a",
      studyUnits: designApplication.studyUnits.map(({ studyUnitId }) => ({
        studyUnitId,
        sourceLinks: [sourceLink]
      }))
    };
    if (verifyEmptyContinuation) {
      const emptyContinuation = structuredClone(designApplication);
      emptyContinuation.studyUnits[1].explanationApplications[0].developedForms = [];
      await assert.rejects(() => scalar(database, `
        select public.advance_course_authoring_part_materialization_for_actor_v1(
          $1,$2,$3,$4,$5,1,'record_step',$6::jsonb,'application',$7
        ) as value
      `, [OWNER, COURSE, plan.partId, materializationId, courseRevision, {
        stepId,
        expectedStepVersion: 1,
        status: "completed",
        resultFacts: {},
        entityChanges: { upserts, deletes: [] },
        designApplication: emptyContinuation,
        sourceAttributionApplication
      }, `${requestPrefix}-empty-continuation`]), (error) => error.code === "23514");
    }
    const recorded = await scalar(database, `
      select public.advance_course_authoring_part_materialization_for_actor_v1(
        $1,$2,$3,$4,$5,1,'record_step',$6::jsonb,'application',$7
      ) as value
    `, [OWNER, COURSE, plan.partId, materializationId, courseRevision, {
      stepId,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: { upserts, deletes: [] },
      designApplication,
      sourceAttributionApplication
    }, `${requestPrefix}-record`]);
    courseRevision = recorded.courseRevision;
    assert.equal(recorded.step.status, "completed");

    const finished = await scalar(database, `
      select public.advance_course_authoring_part_materialization_for_actor_v1(
        $1,$2,$3,$4,$5,2,'finish',$6::jsonb,'application',$7
      ) as value
    `, [OWNER, COURSE, plan.partId, materializationId, courseRevision, {
      status: "completed",
      resultFacts: {}
    }, `${requestPrefix}-finish`]);
    courseRevision = finished.courseRevision;
    return designApplication;
  }

  const firstApplication = await materialize({
    materializationId: "56000000-0000-4000-8000-000000000001",
    stepId: "56000000-0000-4000-8000-000000000002",
    requestPrefix: "analysis-decomposition-first",
    contentSuffix: " v1",
    verifyEmptyContinuation: true
  });
  const secondApplication = await materialize({
    materializationId: "56000000-0000-4000-8000-000000000003",
    stepId: "56000000-0000-4000-8000-000000000004",
    requestPrefix: "analysis-decomposition-second",
    contentSuffix: " v2"
  });

  for (const application of [firstApplication, secondApplication]) {
    assert.deepEqual(
      application.studyUnits.map(({ introducedInstructionalAnalysisUnitIds }) => (
        introducedInstructionalAnalysisUnitIds
      )),
      [[analysisId], []]
    );
    assert.equal(application.studyUnits.every(({ explanationApplications }) => (
      explanationApplications[0].instructionalAnalysisUnitId === analysisId
    )), true);
  }
  const entityVersions = await database.query(`
    select entity_id,version from private.course_entities
    where course_id=$1 and entity_type='study_unit'
      and entity_id in ('analysis-split-1','analysis-split-2')
    order by entity_id
  `, [COURSE]);
  assert.deepEqual(entityVersions.rows, [
    { entity_id: "analysis-split-1", version: 2 },
    { entity_id: "analysis-split-2", version: 2 }
  ]);

  const latestAttributions = await database.query(`
    select distinct on (attribution.target_id)
      attribution.target_id,
      private.course_source_links_v1(
        attribution.course_id,attribution.id
      ) links
    from private.course_source_attributions attribution
    where attribution.course_id=$1 and attribution.target_kind='study_unit'
      and attribution.target_id in ('analysis-split-1','analysis-split-2')
    order by attribution.target_id,attribution.revision desc
  `, [COURSE]);
  assert.equal(latestAttributions.rows.length, 2);
  assert.equal(latestAttributions.rows.every(({ links }) => (
    links.length === 1 &&
    links[0].sourceId === sourceId &&
    links[0].anchors.length === 1 &&
    links[0].anchors[0].anchorId === anchorId
  )), true);

  const applications = await database.query(`
    select result_facts->'designApplication' application
    from private.course_authoring_part_materialization_steps
    where course_id=$1 and id in ($2,$3)
    order by completed_at
  `, [
    COURSE,
    "56000000-0000-4000-8000-000000000002",
    "56000000-0000-4000-8000-000000000004"
  ]);
  assert.equal(applications.rows.length, 2);
  assert.equal(applications.rows.every(({ application }) => (
    application.studyUnits.length === 2 &&
    application.studyUnits.every(({ explanationApplications }) => (
      explanationApplications[0].instructionalAnalysisUnitId === analysisId
    ))
  )), true);

  const recent = await readCourseDesign(
    database,
    "didactic_microsequence",
    "micro-a"
  );
  assert.equal(recent.recentApplications.length, 2);
  assert.equal(recent.recentApplications.every((application) => (
    application.studyUnitCount === 2 &&
    application.introducedInstructionalAnalysisUnitIds.length === 1 &&
    application.introducedInstructionalAnalysisUnitIds[0] === analysisId
  )), true);
  await database.close();
});

test("#123 materialização sela somente itens mapeados e grava atribuições com a etapa", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await actor(database, OWNER, "service_role");
  const plan = await scalar(database, `
    select jsonb_build_object('id',plan.id,'partId',(
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
  const unmappedAnalysisId = "51000000-0000-4000-8000-000000000099";
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'instructional_analysis_unit',7,$4),
      ($5,$2,$3,'evidence_requirement',0,$6)
  `, [
    unmappedAnalysisId, COURSE, plan.id, "Item deliberadamente não mapeado.",
    DESIGN_EVIDENCE_ID, "Explicar a operação-alvo em caso novo."
  ]);
  const targetCommand = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: DESIGN_ANALYSIS_IDS,
    evidenceRequirementIds: [DESIGN_EVIDENCE_ID]
  };
  const mapped = await applyDesignCommand(
    database, 4, targetCommand, "source-material-map-0001"
  );
  assert.equal(mapped.courseRevision, 5);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);

  const materializationId = "55000000-0000-4000-8000-000000000001";
  const stepId = "55000000-0000-4000-8000-000000000002";
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,5,0,'start',$5::jsonb,'application','source-material-start-01'
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
  assert.equal(started.courseRevision, 6);
  const context = started.materialization.designContext;
  assert.equal(context.contract, "aralearn.course-design-context.v2");
  assert.deepEqual(
    context.targets[0].sourceAttributions.instructionalAnalysisUnits
      .map(({ planItemId }) => planItemId),
    DESIGN_ANALYSIS_IDS
  );
  assert.deepEqual(
    context.targets[0].sourceAttributions.evidenceRequirements
      .map(({ planItemId }) => planItemId),
    [DESIGN_EVIDENCE_ID]
  );
  assert.equal(JSON.stringify(context).includes(unmappedAnalysisId), false);
  assert.equal(
    context.targets[0].sourceAttributions.instructionalAnalysisUnits
      .every(({ sources }) => sources.length === 0),
    true
  );

  const designApplication = materializationApplication({
    contextHash: started.materialization.contextHash,
    componentRef: "aralearn.resource.paragraph@1.0.0"
  });
  designApplication.studyUnits[0].studyUnitId = "micro-a";
  const upserts = studyUnitUpserts(
    designApplication,
    "aralearn.resource.paragraph"
  );
  const sourceApplication = {
    contract: "aralearn.course-source-attribution-application.v1",
    contextHash: started.materialization.contextHash,
    didacticMicrosequenceId: "micro-a",
    studyUnits: designApplication.studyUnits.map(({ studyUnitId }) => ({
      studyUnitId,
      sourceLinks: []
    }))
  };
  const entityChanges = {
    upserts: [...upserts, {
      entityType: "microsequence",
      entityId: upserts[0].entityId,
      parentType: "lesson",
      parentId: "lesson-a",
      position: 0,
      content: { title: "Micro A", dependsOn: [] }
    }],
    deletes: [{ entityType: "study_unit", entityId: "card-a" }]
  };
  const missingSourceApplicationPayload = {
    stepId,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges,
    designApplication,
    sourceAttributionApplication: null
  };
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,6,1,'record_step',$5::jsonb,'application','source-material-missing'
    ) as value
  `, [
    OWNER, COURSE, plan.partId, materializationId,
    missingSourceApplicationPayload
  ]), /Aplicações não correspondem à espécie da etapa/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id like 'designed-%'
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 6);

  const invalidSourceApplication = structuredClone(sourceApplication);
  invalidSourceApplication.studyUnits.pop();
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,6,1,'record_step',$5::jsonb,'application','source-material-invalid'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, {
    ...missingSourceApplicationPayload,
    sourceAttributionApplication: invalidSourceApplication
  }]), /Aplicação factual do desenho ou da proveniência é inválida/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id like 'designed-%'
  `, [COURSE]), 0);

  const recordPayload = {
    ...missingSourceApplicationPayload,
    sourceAttributionApplication: sourceApplication
  };
  const recorded = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,6,1,'record_step',$5::jsonb,'application','source-material-record-01'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, recordPayload]);
  assert.equal(recorded.courseRevision, 7);
  assert.equal(recorded.step.status, "completed");
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_id=$2
      and entity_type in ('microsequence','study_unit')
  `, [COURSE, upserts[0].entityId]), 2);
  const storedFacts = await scalar(database, `
    select result_facts as value
    from private.course_authoring_part_materialization_steps
    where course_id=$1 and materialization_id=$2 and id=$3
  `, [COURSE, materializationId, stepId]);
  assert.equal(Object.hasOwn(storedFacts, "sourceAttributionApplication"), false);
  assert.match(storedFacts.sourceAttributionApplicationHash, /^[a-f0-9]{64}$/u);
  assert.equal(storedFacts.sourceAttributionStudyUnitCount, upserts.length);
  assert.equal(storedFacts.sourceAttributionSourceCount, 0);
  assert.equal(storedFacts.sourceAttributionAnchorCount, 0);

  const generatedAttributions = await database.query(`
    select attribution.target_id,attribution.target_version,
      attribution.target_hash=(
        private.course_source_target_state_v1(
          attribution.course_id,attribution.target_kind,attribution.target_id
        )->>'hash'
      ) hash_matches,
      private.course_source_links_v1(attribution.course_id,attribution.id) links
    from private.course_source_attributions attribution
    where attribution.course_id=$1 and attribution.target_kind='study_unit'
      and attribution.target_id in (
        select jsonb_array_elements_text($2::jsonb)
      )
    order by attribution.target_id
  `, [COURSE, upserts.map(({ entityId }) => entityId)]);
  assert.equal(generatedAttributions.rows.length, upserts.length);
  assert.equal(
    generatedAttributions.rows.every((row) => (
      Number(row.target_version) === 1 && row.hash_matches && row.links.length === 0
    )),
    true
  );
  const recordedReplay = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,6,1,'record_step',$5::jsonb,'application','source-material-record-01'
    ) as value
  `, [OWNER, COURSE, plan.partId, materializationId, recordPayload]);
  assert.equal(recordedReplay.idempotent, true);
  assert.equal(recordedReplay.courseRevision, 7);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit'
      and target_id in (select jsonb_array_elements_text($2::jsonb))
  `, [COURSE, upserts.map(({ entityId }) => entityId)]), upserts.length);
  await database.close();
});

test("#123 redação Study omite privados e rejeita unresolved, retired e cross-course", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || jsonb_build_object('sources',$2::jsonb)
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE, JSON.stringify(["referência ainda não resolvida"])]);
  await applyCourseSourcesMigration(database);
  assert.equal(await scalar(database, `
    select to_regprocedure(
      'public.get_course_study_citations_v1(uuid,text)'
    ) is null as value
  `), true);
  assert.equal(await scalar(database, `
    select to_regprocedure(
      'public.get_course_study_citations_v1(uuid,bigint,text)'
    ) is not null as value
  `), true);
  await actor(database, OWNER, "service_role");

  await assert.rejects(() => executeCourseSourceCommand(database, 4, {
    type: "save_anchor",
    anchorId: "anchor-unresolved",
    sourceId: "referência ainda não resolvida",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 1, endPage: 1 },
    verificationExcerpt: null
  }, "source-unresolved-anchor-01"), /revisão corrente e ativa da Fonte/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 4);

  await executeCourseSourceCommand(database, 4, {
    type: "save_source",
    sourceId: "source-visible-a",
    expectedSourceRevision: 0,
    source: sourceDocument({
      kind: "article", title: "Fonte visível",
      citationText: "AUTOR. Fonte visível.", url: "https://example.test/visible",
      editionOrVersion: "2", availability: "open_access",
      studyVisibility: "citation_and_link"
    })
  }, "source-visible-save-001");
  await executeCourseSourceCommand(database, 5, {
    type: "save_anchor",
    anchorId: "anchor-visible-a",
    sourceId: "source-visible-a",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 7, endPage: 8 },
    verificationExcerpt: "Trecho privado que não pode vazar."
  }, "source-visible-anchor-01");
  await executeCourseSourceCommand(database, 6, {
    type: "save_source",
    sourceId: "source-hidden-a",
    expectedSourceRevision: 0,
    source: sourceDocument({ title: "Fonte oculta", url: "https://example.test/hidden" })
  }, "source-hidden-save-0001");
  await executeCourseSourceCommand(database, 7, {
    type: "save_anchor",
    anchorId: "anchor-hidden-a",
    sourceId: "source-hidden-a",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "uri_fragment", fragment: "secao-privada" },
    verificationExcerpt: "Outro trecho privado."
  }, "source-hidden-anchor-01");
  const visibleLink = {
    sourceId: "source-visible-a",
    sourceRevision: 1,
    relation: "quoted_from",
    anchors: [{ anchorId: "anchor-visible-a", anchorRevision: 1 }]
  };
  const hiddenLink = {
    sourceId: "source-hidden-a",
    sourceRevision: 1,
    relation: "informed_by",
    anchors: [{ anchorId: "anchor-hidden-a", anchorRevision: 1 }]
  };
  const assigned = await executeCourseSourceCommand(database, 8, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 1,
    sourceLinks: [visibleLink, hiddenLink]
  }, "source-study-assign-0001");
  assert.equal(assigned.courseRevision, 9);
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSE, LEARNER, OWNER]);
  await actor(database, LEARNER, "authenticated");
  const citations = await scalar(database, `
    select public.get_course_study_citations_v1($1,$2,$3) as value
  `, [COURSE, 9, "card-a"]);
  assert.equal(citations.contract, "aralearn.course-study-citations.v1");
  assert.equal(citations.citations.length, 1);
  assert.deepEqual(Object.keys(citations.citations[0]).sort(), [
    "anchors", "citationText", "editionOrVersion", "sourceId",
    "sourceRevision", "title", "url"
  ]);
  assert.equal(citations.citations[0].sourceId, "source-visible-a");
  assert.deepEqual(Object.keys(citations.citations[0].anchors[0]).sort(), [
    "anchorId", "anchorRevision", "selector"
  ]);
  assert.equal(
    JSON.stringify(citations).includes("Trecho privado"),
    false
  );
  assert.equal(JSON.stringify(citations).includes("source-hidden-a"), false);

  await actor(database, OWNER, "service_role");
  const hiddenCurrent = await executeCourseSourceCommand(database, 9, {
    type: "save_source",
    sourceId: "source-visible-a",
    expectedSourceRevision: 1,
    source: sourceDocument({
      kind: "article", title: "Fonte visível",
      citationText: "AUTOR. Fonte visível.", url: "https://example.test/visible",
      editionOrVersion: "2", availability: "open_access", studyVisibility: "hidden"
    })
  }, "source-visible-hide-0001");
  assert.equal(hiddenCurrent.courseRevision, 10);
  await actor(database, LEARNER, "authenticated");
  const hiddenCurrentCitations = await scalar(database, `
    select public.get_course_study_citations_v1($1,$2,$3) as value
  `, [COURSE, 10, "card-a"]);
  assert.deepEqual(hiddenCurrentCitations.citations, []);

  await actor(database, OWNER, "service_role");
  const citationOnlyCurrent = await executeCourseSourceCommand(database, 10, {
    type: "save_source",
    sourceId: "source-visible-a",
    expectedSourceRevision: 2,
    source: sourceDocument({
      kind: "article", title: "Fonte visível",
      citationText: "AUTOR. Fonte visível.", url: "https://example.test/visible",
      editionOrVersion: "2", availability: "open_access", studyVisibility: "citation"
    })
  }, "source-visible-citation-01");
  assert.equal(citationOnlyCurrent.courseRevision, 11);
  await actor(database, LEARNER, "authenticated");
  const citationOnly = await scalar(database, `
    select public.get_course_study_citations_v1($1,$2,$3) as value
  `, [COURSE, 11, "card-a"]);
  assert.equal(citationOnly.citations.length, 1);
  assert.equal(citationOnly.citations[0].url, null);
  await assert.rejects(() => scalar(database, `
    select public.get_course_study_citations_v1($1,10,'missing-unit') as value
  `, [COURSE]), (error) => {
    const payload = JSON.parse(error.message);
    const transport = JSON.parse(error.detail);
    return error.code === "PGRST" &&
      payload.code === "40001" &&
      payload.message === "O Curso mudou durante a leitura de citações." &&
      payload.details === null && payload.hint === null &&
      transport.status === 409 && Object.keys(transport.headers).length === 0;
  });
  await assert.rejects(() => scalar(database, `
    select public.get_course_study_citations_v1($1,11,'missing-unit') as value
  `, [COURSE]), (error) => error.code === "PT404");

  await database.query(`
    update private.course_entities
    set content=jsonb_set(content,'{title}',to_jsonb('Unidade alterada'::text)),
      version=version+1
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  const staleCitations = await scalar(database, `
    select public.get_course_study_citations_v1($1,$2,$3) as value
  `, [COURSE, 11, "card-a"]);
  assert.deepEqual(staleCitations.citations, []);

  await actor(database, OWNER, "service_role");
  const retired = await executeCourseSourceCommand(database, 11, {
    type: "retire_source",
    sourceId: "source-visible-a",
    expectedSourceRevision: 3
  }, "source-visible-retire-01");
  assert.equal(retired.courseRevision, 12);
  const attributionCount = await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
  `, [COURSE]);
  await assert.rejects(() => executeCourseSourceCommand(database, 12, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 2,
    sourceLinks: [visibleLink]
  }, "source-retired-assign-01"), /Fonte atual, ativa/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 12);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
  `, [COURSE]), attributionCount);

  const secondCourse = "10000000-0000-4000-8000-000000000099";
  await database.query(`
    insert into public.courses(id,owner_id,title,goal,revision)
    values($1,$2,'Segundo Curso','Testar isolamento.',1)
  `, [secondCourse, OWNER]);
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ($1,'module','module-x',null,null,0,'{"title":"Módulo X"}'),
      ($1,'lesson','lesson-x','module','module-x',0,'{"title":"Lição X"}'),
      ($1,'microsequence','micro-x','lesson','lesson-x',0,
        '{"title":"Micro X","dependsOn":[]}'),
      ($1,'study_unit','unit-x','microsequence','micro-x',1,
        '{"title":"Unidade X"}')
  `, [secondCourse]);
  await assert.rejects(() => scalar(database, `
    select public.execute_course_source_command_for_actor_v1(
      $1,$2,1,$3::jsonb,'application','source-cross-course-01'
    ) as value
  `, [OWNER, secondCourse, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "unit-x",
    expectedTargetVersion: 1,
    sourceLinks: [hiddenLink]
  }]), /Fonte atual, ativa/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions where course_id=$1
  `, [secondCourse]), 0);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [secondCourse]), 1);
  await database.close();
});

test("#123 cerca citações densas no último payload legível sem revisão parcial", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  const selector = {
    kind: "text_quote",
    exact: "x".repeat(4000),
    prefix: "p".repeat(500),
    suffix: "s".repeat(500)
  };
  const denseLinks = [];
  for (let sourceIndex = 0; sourceIndex < 7; sourceIndex += 1) {
    const sourceId = `dense-source-${sourceIndex}`;
    await database.query(`
      insert into private.course_source_revisions(
        course_id,source_id,revision,status,kind,title,authorship,publication_date,
        identifier,language,citation_text,url,edition_or_version,origin,availability,
        verification_status,study_visibility,actor_id
      ) values(
        $1,$2,1,'active','document',$3,'Autoria','2026',null,'pt-BR','C',null,
        null,'author_provided','unknown','author_verified','citation',$4
      )
    `, [COURSE, sourceId, `S${sourceIndex}`, OWNER]);
    const anchors = [];
    for (let anchorIndex = 0; anchorIndex < 8; anchorIndex += 1) {
      const anchorId = `dense-anchor-${sourceIndex}-${anchorIndex}`;
      await database.query(`
        insert into private.course_source_anchor_revisions(
          course_id,anchor_id,revision,source_id,source_revision,status,
          selector,verification_excerpt,actor_id
        ) values($1,$2,1,$3,1,'active',$4::jsonb,null,$5)
      `, [COURSE, anchorId, sourceId, selector, OWNER]);
      anchors.push({ anchorId, anchorRevision: 1 });
    }
    denseLinks.push({
      sourceId,
      sourceRevision: 1,
      relation: "supported_by",
      anchors
    });
  }
  await actor(database, OWNER, "service_role");
  const acceptedCommand = {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 1,
    sourceLinks: denseLinks.slice(0, 6)
  };
  const accepted = await executeCourseSourceCommand(
    database, 4, acceptedCommand, "source-budget-accepted-01"
  );
  assert.equal(accepted.courseRevision, 5);
  assert.equal(accepted.changed, true);
  const replay = await executeCourseSourceCommand(
    database, 4, acceptedCommand, "source-budget-accepted-01"
  );
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 5);
  const noOp = await executeCourseSourceCommand(
    database, 5, acceptedCommand, "source-budget-noop-0001"
  );
  assert.equal(noOp.changed, false);
  assert.equal(noOp.courseRevision, 5);

  await actor(database, OWNER, "authenticated");
  const acceptedPayload = await scalar(database, `
    select public.get_course_study_citations_v1($1,5,'card-a') as value
  `, [COURSE]);
  assert.equal(acceptedPayload.citations.length, 6);
  const acceptedBytes = await scalar(database, `
    select octet_length(
      public.get_course_study_citations_v1($1,5,'card-a')::text
    )::integer as value
  `, [COURSE]);
  assert.equal(acceptedBytes <= 262144, true);
  const reservedBigintBytes = await scalar(database, `
    select octet_length(private.course_study_citations_payload_v1(
      $1,'card-a',9223372036854775807
    )::text)::integer as value
  `, [COURSE]);
  assert.equal(reservedBigintBytes > acceptedBytes, true);
  assert.equal(reservedBigintBytes <= 262144, true);

  await actor(database, OWNER, "service_role");
  const eventCount = await scalar(database, `
    select count(*)::integer as value from private.course_events
    where course_id=$1 and operation='update_course_sources'
  `, [COURSE]);
  const attributionCount = await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
  `, [COURSE]);
  await assert.rejects(() => executeCourseSourceCommand(database, 5, {
    ...acceptedCommand,
    sourceLinks: denseLinks
  }, "source-budget-rejected-01"), (error) => (
    error.code === "54000" && /Citações de Estudo excedem 256 KiB/iu.test(error.message)
  ));
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 5);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events
    where course_id=$1 and operation='update_course_sources'
  `, [COURSE]), eventCount);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
  `, [COURSE]), attributionCount);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where actor_id=$1 and request_id='source-budget-rejected-01'
  `, [OWNER]), 0);
  await actor(database, OWNER, "authenticated");
  const afterReject = await scalar(database, `
    select public.get_course_study_citations_v1($1,5,'card-a') as value
  `, [COURSE]);
  assert.deepEqual(afterReject, acceptedPayload);

  await actor(database, OWNER, "service_role");
  const directDenseAttribution = await scalar(database, `
    select private.apply_course_source_attribution_v1(
      $1,'study_unit','card-a',1,$2::jsonb,$3,false
    ) as value
  `, [COURSE, denseLinks, OWNER]);
  assert.equal(directDenseAttribution.changed, true);
  const hiddenSeventh = await executeCourseSourceCommand(database, 5, {
    type: "save_source",
    sourceId: "dense-source-6",
    expectedSourceRevision: 1,
    source: sourceDocument({ title: "S6", citationText: "C" })
  }, "source-budget-hide-seventh");
  assert.equal(hiddenSeventh.courseRevision, 6);
  await actor(database, OWNER, "authenticated");
  const hiddenSeventhPayload = await scalar(database, `
    select public.get_course_study_citations_v1($1,6,'card-a') as value
  `, [COURSE]);
  assert.deepEqual(hiddenSeventhPayload.citations, acceptedPayload.citations);

  await actor(database, OWNER, "service_role");
  const beforeReexposureEvents = await scalar(database, `
    select count(*)::integer as value from private.course_events
    where course_id=$1 and operation='update_course_sources'
  `, [COURSE]);
  const beforeReexposureAttributions = await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
  `, [COURSE]);
  await assert.rejects(() => executeCourseSourceCommand(database, 6, {
    type: "save_source",
    sourceId: "dense-source-6",
    expectedSourceRevision: 2,
    source: sourceDocument({ title: "S6", citationText: "C",
      studyVisibility: "citation" })
  }, "source-budget-reexpose-01"), (error) => (
    error.code === "54000" && /Citações de Estudo excedem 256 KiB/iu.test(error.message)
  ));
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 6);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'revision',revision,'status',status,'studyVisibility',study_visibility
    ) as value
    from private.course_source_revisions
    where course_id=$1 and source_id='dense-source-6'
    order by revision desc limit 1
  `, [COURSE]), {
    revision: 2,
    status: "active",
    studyVisibility: "hidden"
  });
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events
    where course_id=$1 and operation='update_course_sources'
  `, [COURSE]), beforeReexposureEvents);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_source_attributions
    where course_id=$1 and target_kind='study_unit' and target_id='card-a'
  `, [COURSE]), beforeReexposureAttributions);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where actor_id=$1 and request_id='source-budget-reexpose-01'
  `, [OWNER]), 0);
  await actor(database, OWNER, "authenticated");
  assert.deepEqual(await scalar(database, `
    select public.get_course_study_citations_v1($1,6,'card-a') as value
  `, [COURSE]), hiddenSeventhPayload);
  await database.close();
});

test("#192 versiona localizador humano sem misturá-lo ao seletor e o projeta no Estudo", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || jsonb_build_object('sources','[]'::jsonb)
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  await executeCourseSourceCommand(database, 4, {
    type: "save_source",
    sourceId: "source-human-locator",
    expectedSourceRevision: 0,
    source: sourceDocument({
      kind: "book",
      title: "Manual com capítulos e figuras",
      citationText: "AUTORIA. Manual com capítulos e figuras. 2026.",
      url: null,
      editionOrVersion: "2ª edição",
      availability: "restricted",
      studyVisibility: "citation"
    })
  }, "source-human-locator-save-01");
  const selector = { kind: "page_range", startPage: 42, endPage: 44 };
  await executeCourseSourceCommand(database, 5, {
    type: "save_anchor",
    anchorId: "anchor-human-locator",
    sourceId: "source-human-locator",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector,
    humanLocator: "Capítulo 3 · Seção 2.1 · Figura 5",
    verificationExcerpt: "Trecho conferido na figura."
  }, "source-human-locator-anchor-01");
  const revised = await executeCourseSourceCommand(database, 6, {
    type: "save_anchor",
    anchorId: "anchor-human-locator",
    sourceId: "source-human-locator",
    sourceRevision: 1,
    expectedAnchorRevision: 1,
    selector,
    humanLocator: "Capítulo 3 · Seção 2.1 · Figura 6",
    verificationExcerpt: "Trecho conferido na figura."
  }, "source-human-locator-anchor-02");
  assert.equal(revised.changed, true);
  assert.equal(revised.change.revision, 2);
  assert.deepEqual(await scalar(database, `
    select jsonb_agg(jsonb_build_object(
      'revision',revision,'humanLocator',human_locator,'selector',selector
    ) order by revision) as value
    from private.course_source_anchor_revisions
    where course_id=$1 and anchor_id='anchor-human-locator'
  `, [COURSE]), [{
    revision: 1,
    humanLocator: "Capítulo 3 · Seção 2.1 · Figura 5",
    selector
  }, {
    revision: 2,
    humanLocator: "Capítulo 3 · Seção 2.1 · Figura 6",
    selector
  }]);

  const legacyShapeCommand = {
    type: "save_anchor",
    anchorId: "anchor-client-0030",
    sourceId: "source-human-locator",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 50, endPage: 50 },
    verificationExcerpt: null
  };
  await executeCourseSourceCommand(
    database,
    7,
    legacyShapeCommand,
    "source-human-locator-legacy-01"
  );
  const legacyReplay = await executeCourseSourceCommand(
    database,
    7,
    legacyShapeCommand,
    "source-human-locator-legacy-01"
  );
  assert.equal(legacyReplay.idempotent, true);

  const sourceRead = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,8,'source','source-human-locator',null,null,null,10
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(sourceRead.items[0].anchors.find(({ anchorId }) =>
    anchorId === "anchor-human-locator").humanLocator,
    "Capítulo 3 · Seção 2.1 · Figura 6");
  assert.equal(Object.hasOwn(sourceRead.items[0].anchors.find(({ anchorId }) =>
    anchorId === "anchor-client-0030"), "humanLocator"), false);
  await executeCourseSourceCommand(database, 8, {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 1,
    sourceLinks: [{
      sourceId: "source-human-locator",
      sourceRevision: 1,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-human-locator", anchorRevision: 2 }]
    }]
  }, "source-human-locator-assign-01");
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3) on conflict(course_id,user_id) do nothing
  `, [COURSE, LEARNER, OWNER]);
  await actor(database, LEARNER, "authenticated");
  const citations = await scalar(database, `
    select public.get_course_study_citations_v1($1,9,'card-a') as value
  `, [COURSE]);
  assert.equal(citations.citations[0].citationText,
    "AUTORIA. Manual com capítulos e figuras. 2026.");
  assert.deepEqual(citations.citations[0].anchors[0], {
    anchorId: "anchor-human-locator",
    anchorRevision: 2,
    selector,
    humanLocator: "Capítulo 3 · Seção 2.1 · Figura 6"
  });
});

test("#222 retoma Fontes e Âncoras exatas sem reescrever história aposentada", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await actor(database, OWNER, "service_role");

  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans
    where course_id=$1
  `, [COURSE]);
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values(
      $1,$2,$3,'intended_learning_outcome',0,
      'Analisar requisitos de Gestão de Servidores com base documental verificável.'
    )
  `, [PLAN_ITEM, COURSE, planId]);

  const ids = {
    edital: "source-fixture-edital-dataprev-2026",
    prova: "source-fixture-prova-fgv-2024",
    gabarito: "source-fixture-gabarito-fgv-2024",
    ppc: "source-fixture-ppc-tads-ifsp"
  };
  const anchorIds = {
    edital: "anchor-fixture-edital-perfil-13",
    prova: "anchor-fixture-prova-questoes-45-51",
    gabarito: "anchor-fixture-gabarito-questoes-45-51",
    sistemas: "anchor-fixture-ppc-sistemas-operacionais",
    redes: "anchor-fixture-ppc-redes",
    retificacao: "anchor-fixture-edital-retificacao-perfil-13"
  };
  const syntheticSource = (title, citationText, overrides = {}) => sourceDocument({
    title,
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    citationText,
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "private",
    studyVisibility: "citation",
    ...overrides
  });
  let courseRevision = 4;
  let requestOrdinal = 0;
  const change = async (command) => {
    requestOrdinal += 1;
    const result = await executeCourseSourceCommand(
      database,
      courseRevision,
      command,
      `issue222-source-change-${String(requestOrdinal).padStart(2, "0")}`
    );
    assert.equal(result.changed, true);
    courseRevision = result.courseRevision;
    return result;
  };

  for (const [sourceId, source] of [
    [ids.edital, syntheticSource(
      "Edital Dataprev 2026 — fixture sintética",
      "Edital Dataprev 2026"
    )],
    [ids.prova, syntheticSource(
      "Prova FGV 2024 — fixture sintética",
      "Prova FGV 2024"
    )],
    [ids.gabarito, syntheticSource(
      "Gabarito FGV 2024 — fixture sintética",
      "Gabarito FGV 2024"
    )],
    [ids.ppc, syntheticSource(
      "PPC do TADS/IFSP — fixture sintética",
      "PPC do TADS/IFSP"
    )]
  ]) {
    await change({
      type: "save_source",
      sourceId,
      expectedSourceRevision: 0,
      source
    });
  }

  const anchors = [{
    anchorId: anchorIds.edital,
    sourceId: ids.edital,
    humanLocator: "Perfil 13 — Analista de Processamento → Gestão de Servidores, p. 44 do arquivo",
    selector: { kind: "page_range", startPage: 44, endPage: 44 },
    verificationExcerpt: "Perfil 13 — Gestão de Servidores."
  }, {
    anchorId: anchorIds.prova,
    sourceId: ids.prova,
    humanLocator: "questões 45–51",
    selector: {
      kind: "text_quote",
      exact: "Questões 45 a 51 — conteúdo sintético de regressão",
      prefix: null,
      suffix: null
    },
    verificationExcerpt: "Questões sintéticas 45 a 51."
  }, {
    anchorId: anchorIds.gabarito,
    sourceId: ids.gabarito,
    humanLocator: "questões 45–51",
    selector: {
      kind: "text_quote",
      exact: "Gabarito 45 a 51 — conteúdo sintético de regressão",
      prefix: null,
      suffix: null
    },
    verificationExcerpt: "Gabarito sintético das questões 45 a 51."
  }, {
    anchorId: anchorIds.sistemas,
    sourceId: ids.ppc,
    humanLocator: "Sistemas Operacionais, pp. 112–114",
    selector: { kind: "page_range", startPage: 112, endPage: 114 },
    verificationExcerpt: "Ementa sintética de Sistemas Operacionais."
  }, {
    anchorId: anchorIds.redes,
    sourceId: ids.ppc,
    humanLocator: "Redes de Computadores, pp. 123–124",
    selector: { kind: "page_range", startPage: 123, endPage: 124 },
    verificationExcerpt: "Ementa sintética de Redes de Computadores."
  }];
  for (const anchor of anchors) {
    await change({
      type: "save_anchor",
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      ...anchor
    });
  }

  const sourceLink = (sourceId, anchorId, relation = "supported_by") => ({
    sourceId,
    sourceRevision: 1,
    relation,
    anchors: [{ anchorId, anchorRevision: 1 }]
  });
  await change({
    type: "set_target_sources",
    targetKind: "plan_item",
    targetId: PLAN_ITEM,
    expectedTargetVersion: 1,
    sourceLinks: [
      sourceLink(ids.edital, anchorIds.edital, "informed_by"),
      sourceLink(ids.ppc, anchorIds.sistemas)
    ]
  });
  await change({
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "card-a",
    expectedTargetVersion: 1,
    sourceLinks: [
      sourceLink(ids.prova, anchorIds.prova),
      sourceLink(ids.gabarito, anchorIds.gabarito, "contrasted_with"),
      sourceLink(ids.ppc, anchorIds.redes)
    ]
  });

  await change({
    type: "save_source",
    sourceId: ids.edital,
    expectedSourceRevision: 1,
    source: syntheticSource(
      "Edital Dataprev 2026 — fixture sintética retificada",
      "Edital Dataprev 2026, retificação",
      { editionOrVersion: "Retificação 1" }
    )
  });
  await change({
    type: "save_anchor",
    anchorId: anchorIds.retificacao,
    sourceId: ids.edital,
    sourceRevision: 2,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 44, endPage: 45 },
    humanLocator: "Retificação do Perfil 13, pp. 44–45 do arquivo",
    verificationExcerpt: "Retificação sintética do Perfil 13."
  });
  await change({
    type: "retire_source",
    sourceId: ids.edital,
    expectedSourceRevision: 2
  });
  assert.equal(courseRevision, 18);

  await assert.rejects(() => executeCourseSourceCommand(database, courseRevision, {
    type: "set_target_sources",
    targetKind: "plan_item",
    targetId: PLAN_ITEM,
    expectedTargetVersion: 1,
    sourceLinks: [{
      sourceId: ids.edital,
      sourceRevision: 2,
      relation: "supported_by",
      anchors: [{ anchorId: anchorIds.retificacao, anchorRevision: 1 }]
    }]
  }, "issue222-retired-new-use"), (error) => (
    error.code === "23514" && /Fonte atual, ativa/iu.test(error.message)
  ));
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), courseRevision);

  // Simula outra sessão lógica: nenhuma referência permanece no cliente; o ator
  // volta a localizar todo o estado somente pelas leituras públicas autorizadas.
  await database.query("select set_config('request.jwt.claim.sub','',false)");
  await database.query("select set_config('request.jwt.claim.role','',false)");
  await actor(database, OWNER, "service_role");

  const catalog = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,$3,'catalog',null,null,null,null,10
    ) as value
  `, [OWNER, COURSE, courseRevision]);
  assert.equal(catalog.items.length, 4);
  const currentEdital = catalog.items.find(({ sourceId }) => sourceId === ids.edital);
  const currentGabarito = catalog.items.find(({ sourceId }) => sourceId === ids.gabarito);
  assert.deepEqual({ revision: currentEdital.revision, status: currentEdital.status }, {
    revision: 3,
    status: "retired"
  });
  assert.deepEqual({
    authorship: currentGabarito.authorship,
    publicationDate: currentGabarito.publicationDate,
    identifier: currentGabarito.identifier,
    language: currentGabarito.language,
    url: currentGabarito.url,
    editionOrVersion: currentGabarito.editionOrVersion
  }, {
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    url: null,
    editionOrVersion: null
  });

  const recoveredLocators = [];
  for (const sourceId of Object.values(ids)) {
    const detail = await scalar(database, `
      select public.get_owned_course_sources_for_actor_v1(
        $1,$2,$3,'source',$4,null,null,null,10
      ) as value
    `, [OWNER, COURSE, courseRevision, sourceId]);
    for (const sourceRevision of detail.items) {
      for (const anchor of sourceRevision.anchors) {
        recoveredLocators.push(anchor.humanLocator);
      }
    }
  }
  for (const locator of anchors.map(({ humanLocator }) => humanLocator)) {
    assert.equal(recoveredLocators.includes(locator), true, locator);
  }
  assert.equal(
    recoveredLocators.includes("Retificação do Perfil 13, pp. 44–45 do arquivo"),
    true
  );

  const planHistory = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,$3,'target',null,'plan_item',$4,null,10
    ) as value
  `, [OWNER, COURSE, courseRevision, PLAN_ITEM]);
  const effectivePlan = planHistory.items.find(({ effective }) => effective);
  assert.equal(effectivePlan.sourceLinks[0].sourceRevision, 1);
  assert.deepEqual(effectivePlan.sourceLinks[0].anchors, [{
    anchorId: anchorIds.edital,
    anchorRevision: 1
  }]);

  const pinnedEdital = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,$3,'source',$4,'plan_item',$5,null,1
    ) as value
  `, [OWNER, COURSE, courseRevision, ids.edital, PLAN_ITEM]);
  assert.equal(pinnedEdital.items.length, 1);
  assert.deepEqual({
    revision: pinnedEdital.items[0].revision,
    status: pinnedEdital.items[0].status,
    humanLocator: pinnedEdital.items[0].anchors.find(
      ({ anchorId }) => anchorId === anchorIds.edital
    ).humanLocator
  }, {
    revision: 1,
    status: "active",
    humanLocator: "Perfil 13 — Analista de Processamento → Gestão de Servidores, p. 44 do arquivo"
  });

  const studyHistory = await scalar(database, `
    select public.get_owned_course_sources_for_actor_v1(
      $1,$2,$3,'target',null,'study_unit','card-a',null,10
    ) as value
  `, [OWNER, COURSE, courseRevision]);
  const effectiveStudy = studyHistory.items.find(({ effective }) => effective);
  assert.deepEqual(effectiveStudy.sourceLinks.map(({ sourceId }) => sourceId), [
    ids.prova,
    ids.gabarito,
    ids.ppc
  ]);

  await database.close();
});

test("#149 cria uma cópia pessoal mínima, idempotente e independente da origem", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await applyStudyUnitInspectionMigration(database);
  await applyCourseDesignMigration(database);
  await database.query(`
    update private.course_entities
    set content=content || '{"sources":[]}'::jsonb
    where course_id=$1 and entity_type='study_unit'
  `, [COURSE]);
  await applyCourseSourcesMigration(database);
  await applyContextualCompositionMigration(database);
  await applyPersonalCourseCopyMigration(database);
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSE, LEARNER, OWNER]);
  await database.query(`
    update private.course_instructional_plans
    set audience='Audiência privada do autor'
    where course_id=$1
  `, [COURSE]);
  const sourcePlanId = await scalar(database, `
    select id as value from private.course_instructional_plans
    where course_id=$1
  `, [COURSE]);
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'intended_learning_outcome',0,'Planejamento privado')
  `, [PLAN_ITEM, COURSE, sourcePlanId]);
  await actor(database, LEARNER, "service_role");

  const sourceRevision = await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]);
  const sourceUnit = await scalar(database, `
    select jsonb_build_object(
      'entityType',entity_type,'entityId',entity_id,
      'parentType',parent_type,'parentId',parent_id,
      'position',position,'content',content,'version',version
    ) as value
    from private.course_entities
    where course_id=$1 and entity_type='study_unit' and entity_id='card-a'
  `, [COURSE]);
  const noOpUpsert = {
    entityType: sourceUnit.entityType,
    entityId: sourceUnit.entityId,
    parentType: sourceUnit.parentType,
    parentId: sourceUnit.parentId,
    position: sourceUnit.position,
    content: sourceUnit.content
  };
  const courseCountBefore = await scalar(database, `
    select count(*)::integer as value from public.courses
  `);
  const noOp = await scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'manual','personal-copy-noop-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, noOpUpsert]);
  assert.deepEqual(noOp, {
    contract: "aralearn.personal-course-copy-edit.v1",
    operation: "commit_personal_course_copy_edit",
    sourceCourseId: COURSE,
    sourceCourseRevision: sourceRevision,
    targetCourseId: null,
    targetCourseRevision: null,
    studyUnitId: "card-a",
    studyUnitVersion: sourceUnit.version,
    applicationOrigin: "manual",
    channel: "application",
    createdCopy: false,
    changed: false,
    idempotent: false,
    updatedAt: noOp.updatedAt
  });
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.courses
  `), courseCountBefore);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_personal_copies
  `), 0);
  const noOpReplay = await scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'manual','personal-copy-noop-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, noOpUpsert]);
  assert.equal(noOpReplay.idempotent, true);
  assert.equal(noOpReplay.targetCourseId, null);

  await assert.rejects(() => scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'manual','personal-copy-stale-course-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision + 1, sourceUnit.version, noOpUpsert]),
  (error) => error.code === "40001" && /Curso mudou/iu.test(error.message));
  await assert.rejects(() => scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'manual','personal-copy-stale-unit-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version + 1, noOpUpsert]),
  (error) => error.code === "40001" && /Unidade mudou/iu.test(error.message));
  await assert.rejects(() => scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'manual','personal-copy-owner-01'
    ) as value
  `, [OWNER, COURSE, sourceRevision, sourceUnit.version, noOpUpsert]),
  (error) => error.code === "42501" && /Curso original/iu.test(error.message));
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.courses
  `), courseCountBefore);

  const changedUpsert = {
    ...noOpUpsert,
    content: { ...sourceUnit.content, title: "Unidade adaptada pelo estudante" }
  };
  const sourceSnapshot = await scalar(database, `
    select jsonb_build_object(
      'course',to_jsonb(course),'entities',(
        select jsonb_agg(to_jsonb(entity) order by entity.entity_type,entity.entity_id)
        from private.course_entities entity where entity.course_id=course.id
      )
    ) as value from public.courses course where course.id=$1
  `, [COURSE]);
  const created = await scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'provider_assistance','personal-copy-create-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, changedUpsert]);
  assert.deepEqual(Object.keys(created).sort(), [
    "applicationOrigin", "changed", "channel", "contract", "createdCopy",
    "idempotent", "operation", "sourceCourseId", "sourceCourseRevision",
    "studyUnitId", "studyUnitVersion", "targetCourseId",
    "targetCourseRevision", "updatedAt"
  ]);
  assert.equal(created.contract, "aralearn.personal-course-copy-edit.v1");
  assert.equal(created.operation, "commit_personal_course_copy_edit");
  assert.equal(created.sourceCourseId, COURSE);
  assert.equal(created.sourceCourseRevision, sourceRevision);
  assert.equal(created.targetCourseRevision, 2);
  assert.equal(created.studyUnitVersion, 2);
  assert.equal(created.applicationOrigin, "provider_assistance");
  assert.equal(created.channel, "application");
  assert.equal(created.createdCopy, true);
  assert.equal(created.changed, true);
  assert.equal(created.idempotent, false);
  const targetCourseId = created.targetCourseId;

  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'course',to_jsonb(course),'entities',(
        select jsonb_agg(to_jsonb(entity) order by entity.entity_type,entity.entity_id)
        from private.course_entities entity where entity.course_id=course.id
      )
    ) as value from public.courses course where course.id=$1
  `, [COURSE]), sourceSnapshot);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'ownerId',course.owner_id,'title',course.title,'goal',course.goal,
      'revision',course.revision,
      'planAudience',plan.audience,'planScope',plan.instructional_scope,
      'planMin',plan.preferred_authoring_part_min,
      'planMax',plan.preferred_authoring_part_max,
      'planOrigin',plan.part_count_origin,'planVersion',plan.version
    ) as value
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id=course.id
    where course.id=$1
  `, [targetCourseId]), {
    ownerId: LEARNER,
    title: sourceSnapshot.course.title,
    goal: sourceSnapshot.course.goal,
    revision: 2,
    planAudience: "",
    planScope: "",
    planMin: 7,
    planMax: 12,
    planOrigin: "automatic",
    planVersion: 1
  });
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'total',count(*),
      'versionOne',count(*) filter(where version=1),
      'versionTwo',count(*) filter(where version=2),
      'editedTitle',max(content->>'title') filter(
        where entity_type='study_unit' and entity_id='card-a'
      )
    ) as value
    from private.course_entities where course_id=$1
  `, [targetCourseId]), {
    total: sourceSnapshot.entities.length,
    versionOne: sourceSnapshot.entities.length - 1,
    versionTwo: 1,
    editedTitle: "Unidade adaptada pelo estudante"
  });
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'planItems',(select count(*) from private.course_instructional_plan_items where course_id=$1),
      'parts',(select count(*) from private.course_authoring_parts where course_id=$1),
      'sourceRevisions',(select count(*) from private.course_source_revisions where course_id=$1),
      'sourceLinks',(select count(*) from private.course_source_attribution_sources where course_id=$1),
      'anchorLinks',(select count(*) from private.course_source_attribution_anchors where course_id=$1),
      'access',(select count(*) from public.course_access where course_id=$1),
      'personalState',(select count(*) from public.course_personal_states where course_id=$1)
    ) as value
  `, [targetCourseId]), {
    planItems: 0,
    parts: 0,
    sourceRevisions: 0,
    sourceLinks: 0,
    anchorLinks: 0,
    access: 0,
    personalState: 0
  });
  const targetEvents = await scalar(database, `
    select jsonb_agg(jsonb_build_object(
      'revision',revision,'operation',operation,'summary',summary
    ) order by revision) as value
    from private.course_events where course_id=$1
  `, [targetCourseId]);
  assert.deepEqual(targetEvents.map((event) => ({
    revision: event.revision,
    operation: event.operation,
    changeKind: event.summary.changeKind,
    applicationOrigin: event.summary.applicationOrigin ?? null
  })), [
    {
      revision: 1,
      operation: "create_course",
      changeKind: "personal_course_copy_initialized",
      applicationOrigin: "provider_assistance"
    },
    {
      revision: 2,
      operation: "replace_course_composition",
      changeKind: "course_composition_replaced",
      applicationOrigin: "provider_assistance"
    }
  ]);
  assert.deepEqual(await scalar(database, `
    select jsonb_build_object(
      'mappingCount',(select count(*) from private.course_personal_copies where target_course_id=$1),
      'outerReceipts',(select count(*) from private.course_change_receipts
        where actor_id=$2 and request_id='personal-copy-create-01'
          and operation='commit_personal_course_copy_edit'),
      'innerReceipts',(select count(*) from private.course_change_receipts
        where actor_id=$2 and request_id='personal-copy-create-01'
          and operation='commit_course_composition')
    ) as value
  `, [targetCourseId, LEARNER]), {
    mappingCount: 1,
    outerReceipts: 1,
    innerReceipts: 0
  });

  const sourceProjection = await scalar(database, `
    select private.get_course_for_actor_v1($1,$2,false) as value
  `, [LEARNER, COURSE]);
  assert.equal(sourceProjection.canEdit, false);
  assert.equal(sourceProjection.canDerive, false);
  assert.equal(sourceProjection.isPersonalCopy, false);
  assert.equal(sourceProjection.personalCopyCourseId, targetCourseId);
  assert.equal(sourceProjection.sourceCourseId, null);
  const targetProjection = await scalar(database, `
    select private.get_course_for_actor_v1($1,$2,false) as value
  `, [LEARNER, targetCourseId]);
  assert.equal(targetProjection.canEdit, true);
  assert.equal(targetProjection.canDerive, false);
  assert.equal(targetProjection.isPersonalCopy, true);
  assert.equal(targetProjection.personalCopyCourseId, null);
  assert.equal(targetProjection.sourceCourseId, COURSE);
  assert.equal(targetProjection.sourceCourseRevision, sourceRevision);
  const listed = await scalar(database, `
    select private.list_courses_for_actor_v1($1,null,24,null,null) as value
  `, [LEARNER]);
  assert.equal(listed.items.find(({ courseId }) => courseId === COURSE)
    .personalCopyCourseId, targetCourseId);
  assert.equal(listed.items.find(({ courseId }) => courseId === targetCourseId)
    .isPersonalCopy, true);
  const owned = await scalar(database, `
    select public.list_owned_courses_for_actor_v1($1,null,24,null,null) as value
  `, [LEARNER]);
  assert.equal(owned.items.length, 1);
  assert.equal(owned.items[0].courseId, targetCourseId);
  assert.equal(owned.items[0].isPersonalCopy, true);
  assert.equal(owned.items[0].sourceCourseId, COURSE);

  const secondRequestReplay = await scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'provider_assistance','personal-copy-create-02'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, changedUpsert]);
  assert.equal(secondRequestReplay.idempotent, true);
  assert.equal(secondRequestReplay.targetCourseId, targetCourseId);
  const conflictingUpsert = {
    ...changedUpsert,
    content: { ...changedUpsert.content, title: "Outra derivação concorrente" }
  };
  await assert.rejects(() => scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'manual','personal-copy-conflict-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, conflictingUpsert]),
  (error) => error.code === "P1490" && error.detail === targetCourseId &&
    !error.message.includes(targetCourseId));

  await database.query(`
    update private.course_change_receipts
    set created_at=statement_timestamp()-interval '13 days',
      expires_at=statement_timestamp()-interval '1 second'
    where actor_id=$1 and request_id='personal-copy-create-01'
  `, [LEARNER]);
  const expiredReceiptReplay = await scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'provider_assistance','personal-copy-create-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, changedUpsert]);
  assert.equal(expiredReceiptReplay.idempotent, true);
  assert.equal(expiredReceiptReplay.targetCourseId, targetCourseId);

  await database.query(`
    delete from public.course_access where course_id=$1 and user_id=$2
  `, [COURSE, LEARNER]);
  await database.query(`
    update private.course_change_receipts
    set created_at=statement_timestamp()-interval '13 days',
      expires_at=statement_timestamp()-interval '1 second'
    where actor_id=$1 and request_id='personal-copy-create-01'
  `, [LEARNER]);
  const revokedReplay = await scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'provider_assistance','personal-copy-create-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, changedUpsert]);
  assert.equal(revokedReplay.targetCourseId, targetCourseId);
  assert.equal(revokedReplay.idempotent, true);

  await database.query("delete from public.courses where id=$1", [COURSE]);
  await database.query(`
    update private.course_change_receipts
    set created_at=statement_timestamp()-interval '13 days',
      expires_at=statement_timestamp()-interval '1 second'
    where actor_id=$1 and request_id='personal-copy-create-01'
  `, [LEARNER]);
  const deletedSourceReplay = await scalar(database, `
    select public.commit_personal_course_copy_edit_for_actor_v1(
      $1,$2,$3,$4,$5::jsonb,'provider_assistance','personal-copy-create-01'
    ) as value
  `, [LEARNER, COURSE, sourceRevision, sourceUnit.version, changedUpsert]);
  assert.equal(deletedSourceReplay.targetCourseId, targetCourseId);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.courses where id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from public.courses where id=$1
  `, [targetCourseId]), 1);
  assert.equal(await scalar(database, `
    select source_course_ref=$1 as value from private.course_personal_copies
    where target_course_id=$2
  `, [COURSE, targetCourseId]), true);

  await database.query("delete from public.courses where id=$1", [targetCourseId]);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_personal_copies
  `), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_change_receipts
    where actor_id=$1 and operation='commit_personal_course_copy_edit'
  `, [LEARNER]), 0);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260821145358");
  await database.close();
});
