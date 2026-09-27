import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";

const read = async name => (await fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const [materializer, globalPlan, cutover, explanations, appliedBasis, forms, practice, inspection, migration] = await Promise.all([
  "20260905083846_contextual_automatic_design_application.sql", "20260903160000_global_curriculum_authoring_flow.sql",
  "20260902044404_cut_legacy_authoring_runtime.sql", "20260907222912_shared_explanations_human_content_review.sql",
  "20260909030823_contextual_applied_explanation_basis.sql", "20260910045104_contextual_explanation_forms_across_units.sql",
  "20260910054749_contextual_recorded_practice_integrity.sql", "20260905125617_reorganize_authoring_parts.sql",
  "20260916031133_incremental_materialization.sql"
].map(read));
const focalScopeMigration = await read("20260917232000_focal_materialization_dependency_scope.sql");
const focalAuditBasis = await read("20260924175938_revisao_v7_focal_audit_basis.sql");
const autonomousFirstPart = await read("20260928090000_autonomous_first_part.sql");
const discriminatorCorrection = await read("20260905095110_correct_applied_design_discriminator.sql");
const originMigration = await read("20260916030333_editorial_interventions_and_observation_files.sql");
const copyMigration = await read("20260905145236_independent_course_copies.sql");
const savedApplicationMigration = await read("20260909061332_contextual_instructional_design_commands.sql");
const designParametersMigration = await read("20260817180000_course_design_parameters.sql");
function definition(source, name) {
  const start = source.search(new RegExp(`create (?:or replace )?function ${name.replaceAll(".", "\\.")}\\(`, "iu"));
  assert.ok(start >= 0, name);
  const delimiter = /\bas\s+(\$\w*\$)/iu.exec(source.slice(start));
  assert.ok(delimiter, name);
  const body = start + delimiter.index + delimiter[0].length;
  const end = source.indexOf(`${delimiter[1]};`, body);
  assert.ok(end > start, name);
  return source.slice(start, end + delimiter[1].length + 1);
}
function block(source, name) {
  const start = source.indexOf(`do $${name}$`);
  const end = source.indexOf(`$${name}$;`, start + name.length + 5);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end + name.length + 3);
}
const COURSE = "10000000-0000-4000-8000-000000000001";
const PART = "20000000-0000-4000-8000-000000000001";
const IDEA = "30000000-0000-4000-8000-000000000001";
const EVIDENCE = "40000000-0000-4000-8000-000000000001";
const parameters = [{ parameterId: "required_explanation_forms", value: ["plain_definition", "concrete_example"] },
  { parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement", value: 1 }];
const policy = { policy: {}, origin: "automatic", sourceScopeKind: "course" };
async function fixtureSchema() {
  const parameterRows = ["required_explanation_forms", "minimum_distinct_practice_opportunities_per_evidence_requirement"]
    .map((id) => "('" + id + "')").join(",");
  const policyJson = JSON.stringify({ effectiveAssignment: courseDesignFixture({ courseId: COURSE },
    { scope: "course", revision: 1 }).componentPolicy.effectiveAssignment });
  return `set check_function_bodies=off; create schema private; create schema auth; create schema extensions;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key); insert into auth.users values('${COURSE}');
    create table public.courses(id uuid primary key,owner_id uuid,revision bigint default 1,updated_at timestamptz);
    insert into public.courses(id,owner_id) values('${COURSE}','${COURSE}');
    create table private.course_change_receipts(actor_id uuid,request_id text,operation text,course_id uuid,request_hash text,result jsonb,
      expires_at timestamptz default now()+interval '1 day',primary key(actor_id,request_id));
    create table private.course_instructional_plans(id uuid primary key,course_id uuid,version bigint default 1,curriculum_map_status text not null,updated_at timestamptz);
    insert into private.course_instructional_plans(id,course_id,curriculum_map_status) values('${PART}','${COURSE}','approved');
    create table private.course_authoring_parts(id uuid primary key,course_id uuid,instructional_plan_id uuid,version bigint default 1,
      position integer,title text,intent text,progression jsonb,updated_at timestamptz default now());
    insert into private.course_authoring_parts(id,course_id,instructional_plan_id) values('${PART}','${COURSE}','${PART}');
    create table private.course_authoring_part_didactic_microsequences(course_id uuid,authoring_part_id uuid,didactic_microsequence_id text,
      production_position integer);
    insert into private.course_authoring_part_didactic_microsequences values('${COURSE}','${PART}','micro');
    create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_type text,parent_id text,position int,content jsonb,version bigint default 1,
      design_snapshot jsonb,design_application jsonb,created_origin text,last_revision_origin text,updated_at timestamptz,
      source_links jsonb default '[]',content_review jsonb default '{"state":"current"}',applied_explanation_basis jsonb,
      editorial_interventions jsonb default '{"human":1,"ai":0}',primary key(course_id,entity_type,entity_id),
      constraint course_entities_design_current_v1 check(created_origin is null or created_origin in('human','gpt')),
      unique(course_id,parent_type,parent_id,entity_type,position) deferrable initially deferred);
    insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content) values
      ('${COURSE}','module','module',null,null,0,'{}'),('${COURSE}','lesson','lesson','module','module',0,'{}'),
      ('${COURSE}','microsequence','micro','lesson','lesson',0,'{"title":"Base","dependsOn":[],"explanation":{"title":"Base anterior","content":[{"id":"body","package":"aralearn.resource.paragraph","version":"1.0.0","data":{"text":"Prosa humana preservada."}}]}}');
    create table private.course_instructional_plan_items(id uuid primary key,course_id uuid,instructional_plan_id uuid,item_kind text,position int,statement text,description text,version bigint default 1,updated_at timestamptz);
    insert into private.course_instructional_plan_items(id,course_id,instructional_plan_id,item_kind,position,statement,description) values
      ('${IDEA}','${COURSE}','${PART}','instructional_analysis_unit',0,'Relação central',''),
      ('${EVIDENCE}','${COURSE}','${PART}','evidence_requirement',0,'Distinguir os casos','');
    create table private.course_design_target_plan_items(course_id uuid,didactic_microsequence_id text,plan_item_id uuid,plan_item_kind text);
    insert into private.course_design_target_plan_items values('${COURSE}','micro','${IDEA}','instructional_analysis_unit'),('${COURSE}','micro','${EVIDENCE}','evidence_requirement');
    create table private.course_design_parameter_definitions(parameter_id text); insert into private.course_design_parameter_definitions values ${parameterRows};
    create table private.course_design_parameter_assignments(course_id uuid,parameter_id text,scope_kind text,scope_ref text,value jsonb,origin text,reason text,mode text,updated_at timestamptz,
      unique(course_id,parameter_id,scope_kind,scope_ref));
    create table private.course_authoring_guidance_assignments(course_id uuid,scope_kind text,scope_ref text,guidance text,origin text,reason text,updated_at timestamptz,unique(course_id,scope_kind,scope_ref));
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as $$select '{"schemaRevision":"20260905094109","features":[]}'::jsonb$$;
    create function extensions.gen_random_uuid() returns uuid language sql as $$select pg_catalog.gen_random_uuid()$$;
    create function private.require_service_role() returns void language plpgsql as $$begin
      if current_setting('test.denied',true)='service' then raise exception 'service denied' using errcode='42501'; end if; end$$;
    create function private.require_course_access_v1(c uuid,a uuid,w boolean) returns void language plpgsql as $$begin
      if not exists(select 1 from public.courses where id=c and owner_id=a) then raise exception 'owner denied' using errcode='42501'; end if; end$$;
    create function private.valid_course_source_links_shape_v2(v jsonb) returns boolean language sql as $$select jsonb_typeof(v)='array'$$;
    create function private.valid_course_authoring_progression_v1(p_value jsonb) returns boolean language sql immutable as $$
      select case when jsonb_typeof(p_value) is distinct from 'array' then false else coalesce(
        jsonb_array_length(p_value) between 1 and 64 and octet_length(p_value::text)<=65536
        and not exists(select 1 from jsonb_array_elements(p_value) item(value) where
          jsonb_typeof(item.value)<>'string' or nullif(btrim(item.value#>>'{}'),'') is null
          or char_length(item.value#>>'{}')>1000
          or translate(item.value#>>'{}',chr(10)||chr(13)||chr(9),'') ~ '[[:cntrl:]]'),false) end$$;
    create function private.course_design_scope_path_v1(c uuid,k text,i text) returns jsonb language sql as $$select '[]'::jsonb$$;
    create function private.course_current_design_parameters_v1(c uuid,p jsonb) returns jsonb language sql as $$select '[]'::jsonb$$;
    create function private.valid_applied_course_design_parameters_v1(a jsonb,b jsonb) returns boolean language sql as $$select true$$;
    create function private.valid_course_design_parameter_value_v1(a text,b jsonb) returns boolean language sql as $$select true$$;
    create function private.course_current_authoring_guidance_v1(c uuid,p jsonb) returns jsonb language sql as $$select '{"effectiveAssignments":[]}'::jsonb$$;
    create function private.course_current_component_policy_v1(c uuid,p jsonb) returns jsonb language sql as $$select '${policyJson}'::jsonb$$;
    create function private.course_component_policy_allows_v1(v jsonb,r text) returns boolean language sql as $$select true$$;
    create function private.capture_course_applied_explanation_basis_v1(c uuid,u jsonb) returns boolean language sql as $$select false$$;
    create function private.valid_course_explanation_v1(v jsonb) returns boolean language sql as $$select jsonb_typeof(v)='object' and v ?& array['title','content']$$;
    create function private.valid_course_component_refs_in_content_v1(v jsonb) returns boolean language sql as $$select true$$;
    create function private.course_component_catalog_v1() returns jsonb language sql as $$select '{"options":[{"ref":"aralearn.resource.paragraph@1.0.0"}]}'::jsonb$$;
    create function private.apply_course_source_attribution_v2(c uuid,k text,i text,v bigint,s jsonb) returns jsonb language plpgsql as $$begin
      update private.course_entities set source_links=s where course_id=c and entity_id=i and entity_type=case k when 'study_unit' then k else 'microsequence' end;
      return '{"changed":true}'::jsonb; end$$;
    create function public.commit_course_composition_for_actor_v1(a uuid,c uuid,r bigint,u jsonb,d jsonb,s jsonb,q text) returns jsonb language plpgsql as $$
    declare item jsonb; created int:=0; updated int:=0; begin
      for item in select value from jsonb_array_elements(u) loop
        if exists(select 1 from private.course_entities where course_id=c and entity_type='study_unit' and entity_id=item->>'entityId') then
          update private.course_entities set content=item->'content',version=version+1 where course_id=c and entity_type='study_unit' and entity_id=item->>'entityId'
            and content is distinct from item->'content'; if found then updated:=updated+1; end if;
        else insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content)
          values(c,'study_unit',item->>'entityId','microsequence',item->>'parentId',(item->>'position')::int,item->'content'); created:=created+1; end if;
      end loop;
      if created+updated>0 then update public.courses set revision=revision+1 where id=c; end if;
      insert into private.course_change_receipts(actor_id,request_id,operation,course_id,request_hash,result) values(a,q,'composition',c,'', '{}');
      return jsonb_build_object('createdCount',created,'updatedCount',updated,'deletedCount',0); end$$;
    create function public.apply_course_design_command_for_actor_v3(p_actor_id uuid,p_course_id uuid,r bigint,c jsonb,a text,b text,d text) returns void language plpgsql as $$
      declare all_units jsonb; begin perform private.assert_course_materialization_pedagogy_v1(p_course_id,all_units); end$$;`;
}

async function fixture({ focalCurricularDependencies = true } = {}) {
  const db = new PGlite();
  // Actual materialization/core/pedagogy/reader definitions and migration run on
  // a minimal relational fixture. Auth, configuration, source storage and the
  // composition writer are explicit stubs, not a hosted/RLS proof.
  await db.exec(await fixtureSchema());
  await db.exec([
    definition(materializer, "private.materialize_course_authoring_part_core_v1"),
    definition(materializer, "public.materialize_course_authoring_part_for_actor_v2"),
    definition(globalPlan, "private.assert_course_materialization_pedagogy_v1"),
    definition(explanations, "private.save_course_part_explanations_v1"),
    definition(cutover, "private.course_authoring_part_progress_v1"),
    definition(inspection, "private.list_course_study_units_for_actor_v1"),
    definition(inspection, "public.save_course_authoring_part_for_actor_v1"),
    definition(designParametersMigration, "private.course_component_refs_from_content_v1"),
    definition(copyMigration, "public.copy_course_for_actor_v1"),
    block(explanations, "materializer"), block(appliedBasis, "materializer"),
    block(savedApplicationMigration, "saved_application_validation"),
    block(forms, "explanation_form_coverage"), block(practice, "recorded_practice_integrity")
  ].join("\n"));
  await db.exec(discriminatorCorrection);
  await db.exec(block(originMigration, "origin"));
  await db.exec(migration);
  await db.exec(focalScopeMigration);
  // O bloco corretivo da v7 é aplicado isolado: o resto da migração depende de
  // fontes, inspeção e auth que este fixture mínimo substitui por stubs.
  if (focalCurricularDependencies) await db.exec(block(focalAuditBasis, "focal_curricular_dependencies"));
  // Porte mínimo do patch de catálogo de 20260905162000: o núcleo passa a aceitar
  // 1.2.0 e 1.2.1, como no banco de produção.
  await db.exec([
    "do $catalog_version$ declare v text; begin",
    "  select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace",
    "   where n.nspname='private' and p.proname='materialize_course_authoring_part_core_v1';",
    "  if v is null then raise exception 'Núcleo do materializador ausente.'; end if;",
    "  if (length(v)-length(replace(v,'v_snapshot->>''parameterCatalogVersion''<>''1.2.0''','')))" +
      "/length('v_snapshot->>''parameterCatalogVersion''<>''1.2.0''')<>1 then",
    "    raise exception 'Versão do catálogo do núcleo divergiu.'; end if;",
    "  execute replace(v,'v_snapshot->>''parameterCatalogVersion''<>''1.2.0''',",
    "    'v_snapshot->>''parameterCatalogVersion'' not in (''1.2.0'',''1.2.1'')');",
    "end $catalog_version$"
  ].join("\n"));
  await db.exec(autonomousFirstPart);
  return db;
}
export { read, definition, block, fixture, fixtureSchema, COURSE, PART, IDEA, EVIDENCE, parameters, policy,
  materializer, globalPlan, cutover, explanations, appliedBasis, forms, practice, inspection, migration,
  focalScopeMigration, focalAuditBasis, autonomousFirstPart, discriminatorCorrection, originMigration,
  copyMigration, savedApplicationMigration, designParametersMigration };
